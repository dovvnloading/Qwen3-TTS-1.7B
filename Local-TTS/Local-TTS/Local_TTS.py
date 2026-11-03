import os
import sys
import json
import threading
import ctypes

# Force UTF-8 so emoji in log messages below never crash a non-UTF-8 console
# (this previously killed model loading silently: the print() itself raised
# UnicodeEncodeError, which the broad except in lifespan() swallowed).
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

# Single-instance guard, checked BEFORE any heavy imports (torch, qwen_tts,
# fastapi, ...) below. A duplicate launch previously got far enough to start
# loading a second ~4-5GB model into RAM/VRAM on top of an already-running
# instance, which is what was behind repeated native crashes (access
# violations in torch_cpu.dll, confirmed via Windows crash dumps) on this
# 8GB GPU / 16GB RAM machine. The mutex is released automatically by the OS
# when this process exits, even on a hard crash, so no stale lock can be
# left behind.
_SINGLE_INSTANCE_MUTEX_NAME = "Local-TTS-Qwen3-Studio-SingleInstance"
_ERROR_ALREADY_EXISTS = 183
_instance_mutex = None

def release_single_instance_lock():
    """Drop the single-instance mutex.

    Required before os.execv: on Windows execv does NOT replace the process in
    place like it does on POSIX — it spawns a new process and exits this one.
    The new process would otherwise start while this one still holds the mutex,
    conclude an instance is already running, and exit, killing the restart.
    """
    global _instance_mutex
    if os.name == 'nt' and _instance_mutex:
        try:
            ctypes.windll.kernel32.CloseHandle(_instance_mutex)
        except Exception:
            pass
        _instance_mutex = None

if os.name == 'nt':
    _instance_mutex = ctypes.windll.kernel32.CreateMutexW(None, False, _SINGLE_INSTANCE_MUTEX_NAME)
    if ctypes.windll.kernel32.GetLastError() == _ERROR_ALREADY_EXISTS:
        ctypes.windll.user32.MessageBoxW(
            None,
            "Qwen3-TTS Studio is already running. Check your taskbar or Task Manager for the existing instance.",
            "Already Running",
            0x30,  # MB_ICONWARNING
        )
        sys.exit(0)

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# Persist settings in a writable per-user directory, not a source checkout.
LEGACY_CONFIG_PATH = os.path.join(SCRIPT_DIR, "app_config.json")
_USER_DATA = os.environ.get("LOCALAPPDATA") if os.name == "nt" else None
APP_DATA_DIR = os.path.join(_USER_DATA or os.path.join(os.path.expanduser("~"), ".config"), "qwen3-tts-studio")
CONFIG_PATH = os.path.join(APP_DATA_DIR, "app_config.json")
_DEFAULT_CACHE = os.path.join(
    os.environ.get("LOCALAPPDATA", os.path.expanduser("~")) if os.name == "nt"
    else os.path.join(os.path.expanduser("~"), ".cache"),
    "qwen3-tts-studio", "hub",
)
DEFAULT_CONFIG = {
    "models_dir": _DEFAULT_CACHE,
    "download_mode": False,
    "precision": "auto",
}

def load_app_config():
    for path in (CONFIG_PATH, LEGACY_CONFIG_PATH):
        if os.path.isfile(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                if not isinstance(loaded, dict):
                    raise ValueError("Invalid config format")
                result = {**DEFAULT_CONFIG, **loaded}
                if result["precision"] not in ("auto", "float16", "bfloat16", "float32"):
                    result["precision"] = "auto"
                return result
            except Exception as e:
                print(f"Warning: cannot read config {path}: {e}")
    return dict(DEFAULT_CONFIG)

def save_app_config(cfg):
    os.makedirs(APP_DATA_DIR, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(prefix=".config-", suffix=".json", dir=APP_DATA_DIR)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, CONFIG_PATH)
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)

# tempfile must be available before configuration is first saved.
import tempfile
app_config = load_app_config()
if not os.path.isfile(CONFIG_PATH):
    try:
        save_app_config(app_config)
    except OSError as exc:
        print(f"Warning: unable to persist initial configuration: {exc}")


# Models are resolved from a local Hugging Face cache directory. This must happen
# before qwen_tts (and therefore huggingface_hub/transformers) is imported, since
# the cache location is read once at import time.
#
# NOTE: we deliberately do NOT set HF_HUB_OFFLINE/TRANSFORMERS_OFFLINE here. Some
# transformers code paths (e.g. tokenizer loading for this model does a Mistral-
# tokenizer detection check) make a small metadata API call regardless of local
# cache state, and hard-crash with OfflineModeIsEnabled instead of falling back
# when offline mode is forced. huggingface_hub already falls back to the local
# cache on its own if that call can't reach the network. The actual "don't
# auto-download a model the user didn't ask for" guarantee comes from the
# is_model_cached() pre-flight check in load_model_instance() below, not from
# blocking the network at the environment level.
# Explicit local snapshot paths below enforce offline operation when downloads are disabled.
# Avoid setting process-global Hub cache variables; model directories can change at runtime.


import io
import torch
import soundfile as sf
import uvicorn
import webview
import tempfile
import shutil
import gc
import time
import ctypes
from ctypes import c_int, byref, c_void_p
if os.name == "nt":
    from ctypes import windll

from contextlib import asynccontextmanager
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import Response, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from huggingface_hub import snapshot_download
from urllib.parse import urlsplit
from collections import OrderedDict
import hashlib
import secrets
import numpy as np
from tts_utils import (
    MAX_REFERENCE_BYTES, MAX_TEXT_CHARS, cached_model_path, snapshot_complete,
    safe_spa_path, decode_reference_audio, split_text, process_output_audio,
)

try:
    from qwen_tts import Qwen3TTSModel
except ImportError:
    print("CRITICAL ERROR: 'qwen_tts.py' not found.")
    sys.exit(1)

HOST = "127.0.0.1"
PORT = 8000
DIST_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dist")

MODEL_IDS = {
    "custom": "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
    "base": "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
}

# Set as soon as the HTTP server is accepting connections. The window waits on
# THIS, not on the model being loaded: the UI has to be reachable before a model
# is ready, otherwise the settings screen that fixes a bad model path can never
# be opened in the first place.
# Security token is scoped to this process. The browser fetches it from the same origin.
SESSION_TOKEN = secrets.token_urlsafe(32)
MAX_REQUEST_BYTES = 24 * 1024 * 1024
audio_lock = threading.Lock()
last_audio_wav = None
last_audio_name = "qwen3-tts.wav"
# Reject concurrent GPU synthesis instead of running unsynchronized or queuing indefinitely.
generation_gate = threading.BoundedSemaphore(1)
# Prompt items may retain device tensors. Clear this cache when swapping models.
voice_prompt_cache = OrderedDict()
MAX_CACHED_PROMPTS = 2

# Guards active_model_state. A background preload and an incoming /api/generate
# can otherwise race: one swapping models out of VRAM while the other is
# mid-generation with the instance it just took.
model_lock = threading.RLock()

active_model_state = {
    "type": None,
    "instance": None
}

# idle | loading | ready | error
model_status = {
    "state": "idle",
    "detail": "",
}

def set_model_status(state: str, detail: str = ""):
    model_status["state"] = state
    model_status["detail"] = detail

def is_model_cached(repo_id: str, models_dir: str) -> bool:
    return cached_model_path(repo_id, models_dir) is not None

def _unload_model():
    global active_model_state
    if active_model_state["instance"] is None:
        return
    active_model_state["instance"] = None
    active_model_state["type"] = None
    voice_prompt_cache.clear()
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

def load_model_instance(model_type: str):
    """Resolve/verify model files before evicting a working GPU model."""
    if model_type not in MODEL_IDS:
        raise ValueError("Unknown model type")
    if (active_model_state["type"] == model_type
            and active_model_state["instance"] is not None):
        return active_model_state["instance"]
    model_id = MODEL_IDS[model_type]
    model_dir = app_config["models_dir"]
    local_source = cached_model_path(model_id, model_dir)
    if local_source is None and not app_config["download_mode"]:
        raise FileNotFoundError(
            f"{model_id} is missing or incomplete under {model_dir}. "
            "Choose a complete local model in Settings, or enable downloads."
        )
    if local_source is None:
        os.makedirs(model_dir, exist_ok=True)
        local_source = snapshot_download(repo_id=model_id, cache_dir=model_dir)
        if not snapshot_complete(local_source):
            raise RuntimeError(f"Download is incomplete: {model_id}")
    # Once the new model is known to exist, free the old model to avoid VRAM overlap.
    _unload_model()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    preference = app_config.get("precision", "auto")
    if device == "cpu":
        dtype = torch.float32
    elif preference == "bfloat16":
        if not torch.cuda.is_bf16_supported():
            raise ValueError("This GPU does not support BF16.")
        dtype = torch.bfloat16
    elif preference == "float32":
        dtype = torch.float32
    elif preference == "float16":
        dtype = torch.float16
    else:
        dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16

    print(f"Loading {model_type} from {local_source} on {device} ({dtype})")
    # SDPA is the measured good baseline on the original RTX 3060 Ti.
    model = Qwen3TTSModel.from_pretrained(
        local_source, device_map="auto", dtype=dtype, attn_implementation="sdpa"
    )
    active_model_state["instance"] = model
    active_model_state["type"] = model_type
    print(f"Ready: {model_type}")
    return model

def ensure_model(model_type: str):
    """Return a ready instance of `model_type`, loading it if necessary."""
    with model_lock:
        if active_model_state["type"] == model_type and active_model_state["instance"] is not None:
            set_model_status("ready")
            return active_model_state["instance"]

        set_model_status("loading", f"Loading {model_type} model into memory…")
        try:
            model = load_model_instance(model_type)
            set_model_status("ready")
            return model
        except Exception as e:
            set_model_status("error", str(e))
            raise

def preload_model(model_type: str = "custom"):
    try:
        ensure_model(model_type)
    except Exception as e:
        print(f"Model load failed: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    set_model_status("loading", "Starting up…")
    threading.Thread(target=preload_model, daemon=True).start()
    yield
    # Avoid unloading a model mid-inference during shutdown.
    with model_lock:
        _unload_model()

app = FastAPI(lifespan=lifespan)

app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost"])

@app.middleware("http")
async def protect_local_api(request: Request, call_next):
    if request.url.path.startswith("/api/"):
        length = request.headers.get("content-length")
        if length:
            try:
                if int(length) > MAX_REQUEST_BYTES:
                    return JSONResponse({"detail": "Request too large."}, status_code=413)
            except ValueError:
                return JSONResponse({"detail": "Invalid Content-Length."}, status_code=400)
        if request.method in ("POST", "PUT", "PATCH", "DELETE"):
            origin = request.headers.get("origin")
            if origin:
                parts = urlsplit(origin)
                if parts.scheme != "http" or parts.hostname not in ("127.0.0.1", "localhost"):
                    return JSONResponse({"detail": "Untrusted origin."}, status_code=403)
            supplied = request.headers.get("x-local-token", "")
            if not secrets.compare_digest(supplied, SESSION_TOKEN):
                return JSONResponse({"detail": "Invalid local session."}, status_code=403)
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
    return response

@app.get("/api/session")
def get_session():
    return {"token": SESSION_TOKEN}



# Deliberately a sync `def`: FastAPI runs sync endpoints in a worker thread,
# whereas an `async def` would run model loading and generation directly on the
# event loop and block every other request — including the /api/status polling
# the UI relies on to show progress.
@app.post("/api/generate")
def generate_audio(
    text: str = Form(...),
    language: str = Form("Auto"),
    speaker: str = Form("Ryan"),
    styleInstruction: str = Form(""),
    ref_audio: UploadFile = File(None),
    ref_text: str = Form(""),
    temperature: float | None = Form(None, ge=0.1, le=2.0),
    top_p: float | None = Form(None, gt=0.0, le=1.0),
    top_k: int | None = Form(None, ge=1, le=200),
    repetition_penalty: float | None = Form(None, ge=1.0, le=2.0),
    max_new_tokens: int | None = Form(None, ge=64, le=4096),
    seed: int | None = Form(None, ge=0, le=2147483647),
    long_form: bool = Form(False),
    pause_ms: int = Form(250, ge=0, le=1500),
    normalize: bool = Form(False),
    trim_silence: bool = Form(False),
):
    global last_audio_wav, last_audio_name
    if not text or not text.strip():
        raise HTTPException(400, "Text is empty.")
    if len(text) > MAX_TEXT_CHARS:
        raise HTTPException(413, "Text exceeds 20,000 characters.")
    if not long_form and len(text) > 1200:
        raise HTTPException(400, "Use Long-form mode for text longer than 1,200 characters.")
    if len(styleInstruction) > 1000 or len(ref_text) > 5000:
        raise HTTPException(400, "Instruction or transcript is too long.")
    cloning = ref_audio is not None and bool(ref_audio.filename)
    model_type = "base" if cloning else "custom"
    target_lang = "Auto" if language == "Auto" else language
    reference = None
    if cloning:
        try:
            payload = ref_audio.file.read(MAX_REFERENCE_BYTES + 1)
            reference = decode_reference_audio(payload)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        finally:
            ref_audio.file.close()
    if not generation_gate.acquire(blocking=False):
        raise HTTPException(429, "A synthesis job is already running.")
    try:
        # The lock protects both model replacement and every operation that uses it.
        with model_lock:
            model = ensure_model(model_type)
            settings = {}
            for k, v in (
                ("temperature", temperature), ("top_p", top_p), ("top_k", top_k),
                ("repetition_penalty", repetition_penalty), ("max_new_tokens", max_new_tokens),
            ):
                if v is not None:
                    settings[k] = v
            if seed is not None:
                torch.manual_seed(seed)
                if torch.cuda.is_available():
                    torch.cuda.manual_seed_all(seed)
            if long_form or len(text) > 280:
                segments = split_text(text, max_chars=280)
            else:
                segments = [text.strip()]
            if len(segments) > 1 and not long_form:
                # Automatic segmentation for medium text avoids oversized decode.
                print(f"Splitting speech into {len(segments)} sentences.")
            prompt = None
            if cloning:
                cache_key = hashlib.sha256(
                    payload + b"\\0" + ref_text.encode("utf-8") +
                    b"\\0" + str(bool(ref_text.strip())).encode("ascii")
                ).hexdigest()
                prompt = voice_prompt_cache.get(cache_key)
                if prompt is None:
                    prompt = model.create_voice_clone_prompt(
                        ref_audio=reference, ref_text=ref_text or None,
                        x_vector_only_mode=not bool(ref_text.strip()),
                    )
                    voice_prompt_cache[cache_key] = prompt
                    if len(voice_prompt_cache) > MAX_CACHED_PROMPTS:
                        voice_prompt_cache.popitem(last=False)
                else:
                    voice_prompt_cache.move_to_end(cache_key)
            all_segments = []
            sr = None
            for index, segment in enumerate(segments):
                if cloning:
                    wavs, segment_sr = model.generate_voice_clone(
                        text=segment, language=target_lang, voice_clone_prompt=prompt,
                        **settings,
                    )
                else:
                    wavs, segment_sr = model.generate_custom_voice(
                        text=segment, language=target_lang,
                        speaker=speaker if speaker != "Voice Clone" else "Ryan",
                        instruct=styleInstruction.strip() or None, **settings,
                    )
                if sr is not None and segment_sr != sr:
                    raise RuntimeError("Sample rate changed between segments.")
                sr = segment_sr
                result = wavs[0]
                if isinstance(result, torch.Tensor):
                    result = result.detach().cpu().numpy()
                result = process_output_audio(result, sr)
                all_segments.append(result)
                if index < len(segments) - 1 and pause_ms > 0:
                    all_segments.append(np.zeros(int(sr * pause_ms / 1000), dtype=np.float32))
            combined = np.concatenate(all_segments)
        final_audio = process_output_audio(
            combined, sr, normalize=normalize, trim_silence=trim_silence
        )
        buffer = io.BytesIO()
        sf.write(buffer, final_audio, sr, format="WAV", subtype="PCM_16")
        wav_bytes = buffer.getvalue()
        with audio_lock:
            last_audio_wav = wav_bytes
            last_audio_name = "qwen3-tts.wav"
        return Response(
            content=wav_bytes, media_type="audio/wav",
            headers={"X-TTS-Segments": str(len(segments)),
                     "X-TTS-Seed": str(seed) if seed is not None else ""},
        )
    except HTTPException:
        raise
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        print(f"Generation failed: {exc}")
        if isinstance(exc, torch.cuda.OutOfMemoryError):
            raise HTTPException(507, "GPU memory exhausted. Close other GPU apps or use shorter text.") from exc
        raise HTTPException(500, str(exc)) from exc
    finally:
        generation_gate.release()

@app.get("/api/status")
async def get_status():
    return {
        "status": model_status["state"],
        "detail": model_status["detail"],
        "modelType": active_model_state["type"],
    }

@app.post("/api/load")
async def trigger_load():
    """Retry a model load — used after the user fixes the path in Settings."""
    if model_status["state"] == "loading":
        return {"status": "loading", "detail": model_status["detail"]}
    set_model_status("loading", "Loading model into memory…")
    threading.Thread(target=preload_model, daemon=True).start()
    return {"status": "loading", "detail": model_status["detail"]}

class ConfigUpdate(BaseModel):
    modelsDir: str
    downloadMode: bool
    precision: str = "auto"

def _config_response():
    return {
        "modelsDir": app_config["models_dir"],
        "downloadMode": app_config["download_mode"],
        "precision": app_config.get("precision", "auto"),
        "models": {
            "custom": is_model_cached(MODEL_IDS["custom"], app_config["models_dir"]),
            "base": is_model_cached(MODEL_IDS["base"], app_config["models_dir"]),
        }
    }

@app.get("/api/config")
async def get_config():
    return _config_response()

@app.post("/api/config")
def update_config(payload: ConfigUpdate):
    models_dir = payload.modelsDir.strip()
    if not models_dir:
        raise HTTPException(400, "Models directory cannot be empty.")
    if payload.precision not in ("auto", "float16", "bfloat16", "float32"):
        raise HTTPException(400, "Invalid precision choice.")
    try:
        os.makedirs(models_dir, exist_ok=True)
    except OSError as exc:
        raise HTTPException(400, f"Cannot use this directory: {exc}") from exc
    with model_lock:
        changed = (
            os.path.normcase(os.path.abspath(models_dir))
            != os.path.normcase(os.path.abspath(app_config["models_dir"]))
            or payload.downloadMode != app_config["download_mode"]
            or payload.precision != app_config.get("precision", "auto")
        )
        if changed:
            new_config = {**app_config,
                          "models_dir": models_dir,
                          "download_mode": payload.downloadMode,
                          "precision": payload.precision}
            save_app_config(new_config)
            _unload_model()
            app_config.update(new_config)
            set_model_status("idle", "Settings updated. Reload the model.")
    return {"status": "updated" if changed else "unchanged", **_config_response()}


if os.path.isdir(DIST_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(404, "API route not found.")
        try:
            file_path = safe_spa_path(DIST_DIR, full_path)
        except ValueError:
            raise HTTPException(404, "File not found.")
        if file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(os.path.join(DIST_DIR, "index.html"))


def start_backend():
    global backend_server
    config = uvicorn.Config(app, host=HOST, port=PORT, log_level="warning")
    backend_server = uvicorn.Server(config)
    backend_server.run()

backend_server = None

class DesktopApi:
    """Native Save dialog; browser-only development falls back to a WAV download."""
    def save_last_audio(self, suggested_name="qwen3-tts.wav"):
        with audio_lock:
            data = last_audio_wav
        if not data:
            return {"saved": False, "error": "No generated audio yet."}
        import re
        name = re.sub(r"[^a-zA-Z0-9._-]", "_", str(suggested_name))[:90]
        if not name.lower().endswith(".wav"):
            name += ".wav"
        try:
            result = webview.windows[0].create_file_dialog(
                webview.SAVE_DIALOG, save_filename=name,
                file_types=("WAV files (*.wav)",),
            )
            if not result:
                return {"saved": False}
            chosen = result[0] if isinstance(result, (list, tuple)) else result
            with open(chosen, "wb") as f:
                f.write(data)
            return {"saved": True, "path": str(chosen)}
        except Exception as exc:
            return {"saved": False, "error": str(exc)}


def configure_window_ui():
    """
    Applies dark-mode titlebar styling and the app icon (app.ico).
    """
    if os.name != 'nt':
        return

    # Constants
    DWMWA_USE_IMMERSIVE_DARK_MODE = 20
    DWMWA_USE_IMMERSIVE_DARK_MODE_OLD = 19
    WM_SETICON = 0x80
    ICON_SMALL = 0
    ICON_BIG = 1

    hwnd = None
    for _ in range(10):
        hwnd = windll.user32.FindWindowW(None, "Qwen3-TTS Studio")
        if hwnd:
            break
        time.sleep(0.5)

    if hwnd:
        try:
            # 1. APPLY DARK MODE
            value = c_int(1)
            windll.dwmapi.DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, byref(value), 4)
            windll.dwmapi.DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE_OLD, byref(value), 4)

            # 2. SET APP ICON
            icon_path = os.path.join(SCRIPT_DIR, "app.ico")
            if os.path.isfile(icon_path):
                IMAGE_ICON = 1
                LR_LOADFROMFILE = 0x00000010
                SM_CXICON, SM_CYICON = 11, 12
                SM_CXSMICON, SM_CYSMICON = 49, 50

                user32 = windll.user32
                # ctypes defaults to a 32-bit int return, which silently
                # truncates 64-bit HICON/HWND handles. Declare them explicitly.
                user32.LoadImageW.restype = c_void_p
                user32.LoadImageW.argtypes = [
                    c_void_p, ctypes.c_wchar_p, ctypes.c_uint,
                    c_int, c_int, ctypes.c_uint,
                ]
                user32.SendMessageW.restype = c_void_p
                user32.SendMessageW.argtypes = [c_void_p, ctypes.c_uint, c_void_p, c_void_p]

                # Load the two sizes Windows asks for separately, so the title
                # bar gets the hand-tuned small artwork instead of a downscaled
                # 256px one.
                h_small = user32.LoadImageW(
                    None, icon_path, IMAGE_ICON,
                    user32.GetSystemMetrics(SM_CXSMICON),
                    user32.GetSystemMetrics(SM_CYSMICON),
                    LR_LOADFROMFILE,
                )
                h_big = user32.LoadImageW(
                    None, icon_path, IMAGE_ICON,
                    user32.GetSystemMetrics(SM_CXICON),
                    user32.GetSystemMetrics(SM_CYICON),
                    LR_LOADFROMFILE,
                )

                if h_small:
                    user32.SendMessageW(hwnd, WM_SETICON, c_void_p(ICON_SMALL), c_void_p(h_small))
                if h_big:
                    user32.SendMessageW(hwnd, WM_SETICON, c_void_p(ICON_BIG), c_void_p(h_big))
                if h_small or h_big:
                    print("[UI] Applied app icon (app.ico)")
                else:
                    print("[UI Warning] app.ico found but could not be loaded")
            else:
                print(f"[UI Warning] app.ico not found at {icon_path}")

            # 3. FORCE REDRAW
            windll.user32.SetWindowPos(hwnd, 0, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0004 | 0x0020)

        except Exception as e:
            print(f"[UI Warning] Failed to configure window: {e}")

_console_handler_ref = None

def install_console_close_handler():
    """Exit cleanly when the console window is closed.

    Closing the console kills this process, but the WebView2 child processes it
    spawned are not attached to that console and can outlive it, leaving a
    zombie holding VRAM. Handling the close/logoff/shutdown events lets us tear
    the whole tree down ourselves instead of being force-killed mid-cleanup.
    """
    global _console_handler_ref
    if os.name != 'nt':
        return

    CTRL_C_EVENT, CTRL_BREAK_EVENT, CTRL_CLOSE_EVENT = 0, 1, 2
    CTRL_LOGOFF_EVENT, CTRL_SHUTDOWN_EVENT = 5, 6
    HANDLER_TYPE = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_uint)

    def _handler(event):
        if event in (CTRL_C_EVENT, CTRL_BREAK_EVENT, CTRL_CLOSE_EVENT,
                     CTRL_LOGOFF_EVENT, CTRL_SHUTDOWN_EVENT):
            print("--- Console closed, shutting down. ---")
            os._exit(0)
        return False

    # Held in a module global: if this callback is garbage collected while
    # Windows still holds the pointer, the process crashes on console close.
    _console_handler_ref = HANDLER_TYPE(_handler)
    ctypes.windll.kernel32.SetConsoleCtrlHandler(_console_handler_ref, True)

if __name__ == "__main__":
    # Fix Taskbar Grouping (Required for icon to show in Taskbar)
    if os.name == 'nt':
        try:
            myappid = 'LocalTTS.Qwen3.Studio.1.0'
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
        except Exception:
            pass

    install_console_close_handler()

    t = threading.Thread(target=start_backend)
    t.daemon = True
    t.start()

    print("\n---------------------------------------------------------")
    print(f"Initializing Qwen3-TTS Backend on {HOST}:{PORT}")
    print(f"Models directory: {app_config['models_dir']} (download mode: {app_config['download_mode']})")
    print("Opening window; the model loads in the background.")
    print("---------------------------------------------------------\n")

    # Uvicorn sets started only after the listening socket is bound.
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline and t.is_alive():
        if backend_server is not None and backend_server.started:
            break
        time.sleep(0.1)
    if backend_server is None or not backend_server.started:
        print(f"Could not bind the local HTTP server at {HOST}:{PORT}. Check for a port conflict.")
        sys.exit(1)

    webview.create_window(
        title="Qwen3-TTS Studio",
        url=f"http://{HOST}:{PORT}",
        width=1200, height=800,
        background_color="#212121",
        resizable=True,
        js_api=DesktopApi(),
    )
    webview.start(func=configure_window_ui)
    print("Window closed, shutting down.")
    os._exit(0)

 
