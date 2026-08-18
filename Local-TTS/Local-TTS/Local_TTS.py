import os
import sys
import json
import threading
import ctypes

# Force UTF-8 so emoji in log messages below never crash a non-UTF-8 console
# (this previously killed model loading silently: the print() itself raised
# UnicodeEncodeError, which the broad except in lifespan() swallowed).
sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
sys.stderr.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

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
CONFIG_PATH = os.path.join(SCRIPT_DIR, "app_config.json")
DEFAULT_CONFIG = {
    "models_dir": "D:\\Models",
    "download_mode": False,
}

def load_app_config():
    if os.path.isfile(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                return {**DEFAULT_CONFIG, **json.load(f)}
        except Exception as e:
            print(f"--- ⚠️  Failed to read app_config.json, using defaults: {e} ---")
    return dict(DEFAULT_CONFIG)

def save_app_config(cfg):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)

app_config = load_app_config()
if not os.path.isfile(CONFIG_PATH):
    save_app_config(app_config)

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
os.makedirs(app_config["models_dir"], exist_ok=True)
os.environ["HF_HUB_CACHE"] = app_config["models_dir"]
os.environ["HUGGINGFACE_HUB_CACHE"] = app_config["models_dir"]

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
from ctypes import windll, c_int, byref, c_void_p

from contextlib import asynccontextmanager
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import Response, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

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
server_ready = threading.Event()

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

def _model_cache_folder(repo_id: str, models_dir: str) -> str:
    return os.path.join(models_dir, "models--" + repo_id.replace("/", "--"))

def is_model_cached(repo_id: str, models_dir: str) -> bool:
    snapshots_dir = os.path.join(_model_cache_folder(repo_id, models_dir), "snapshots")
    if not os.path.isdir(snapshots_dir):
        return False
    for entry in os.listdir(snapshots_dir):
        if os.path.isfile(os.path.join(snapshots_dir, entry, "config.json")):
            return True
    return False

def load_model_instance(model_type: str):
    """Load `model_type`, evicting any currently-resident model first.

    Callers must hold model_lock; this mutates global state and VRAM.
    """
    global active_model_state

    if active_model_state["type"] == model_type and active_model_state["instance"] is not None:
        return active_model_state["instance"]

    if active_model_state["instance"] is not None:
        print(f"\n--- ♻️  OFF-RAMP: Unloading '{active_model_state['type']}' from VRAM ---")
        del active_model_state["instance"]
        active_model_state["instance"] = None
        active_model_state["type"] = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()
        print("--- 🧹 VRAM Cleared ---\n")

    print(f"--- 🚀 ON-RAMP: Loading '{model_type.upper()}' Model ---")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if device == "cuda" else torch.float32

    model_id = MODEL_IDS[model_type]

    if not app_config["download_mode"] and not is_model_cached(model_id, app_config["models_dir"]):
        raise RuntimeError(
            f"'{model_id}' was not found in {app_config['models_dir']} and downloading is disabled. "
            "Open Settings to point at the correct models directory or enable download mode."
        )

    try:
        model = Qwen3TTSModel.from_pretrained(
            model_id,
            device_map="auto",
            dtype=dtype,
            # sdpa benchmarked >= flash_attention_2 for this short-sequence
            # autoregressive decode on RTX 3060 Ti (mean RTF 2.97 vs 3.09).
            attn_implementation="sdpa"
        )
        active_model_state["instance"] = model
        active_model_state["type"] = model_type
        print(f"--- ✅ {model_type.upper()} Model Ready ---\n")
        return model
    except Exception as e:
        print(f"--- ❌ LOAD FAILED: {e} ---")
        raise e

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
    """Background startup/retry load.

    Reports a missing model as a normal 'error' state rather than raising, so
    the UI can show it and point the user at Settings.
    """
    model_id = MODEL_IDS[model_type]
    if not app_config["download_mode"] and not is_model_cached(model_id, app_config["models_dir"]):
        detail = (
            f"No model found in {app_config['models_dir']}. Open Settings to point at the "
            "folder containing your models, or enable downloading."
        )
        set_model_status("error", detail)
        print(f"--- ⚠️  {detail} ---")
        return
    try:
        ensure_model(model_type)
    except Exception as e:
        print(f"--- ❌ Model load failed: {e} ---")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # The model loads on a background thread so the window can open straight
    # away. Blocking here previously meant that if the model was missing or the
    # path was wrong, the user sat in front of a console with no GUI at all —
    # including no way to reach the settings screen that would fix it.
    set_model_status("loading", "Starting up…")
    threading.Thread(target=preload_model, daemon=True).start()
    server_ready.set()

    yield

    active_model_state["instance"] = None
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Deliberately a sync `def`: FastAPI runs sync endpoints in a worker thread,
# whereas an `async def` would run model loading and generation directly on the
# event loop and block every other request — including the /api/status polling
# the UI relies on to show progress.
@app.post("/api/generate")
def generate_audio(
    text: str = Form(...),
    language: str = Form("Auto"),
    speaker: str = Form("Ryan"),
    styleInstruction: str = Form(None),
    ref_audio: UploadFile = File(None),
    ref_text: str = Form(None)
):
    if not text.strip():
        raise HTTPException(status_code=400, detail="Text empty.")

    is_cloning_request = ref_audio is not None and ref_audio.filename != ""
    required_model_type = "base" if is_cloning_request else "custom"

    try:
        model = ensure_model(required_model_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    tmp_path = None
    try:
        target_lang = None if language == "Auto" else language

        if required_model_type == "base":
            print(f"[Infer] Mode: CLONE | Ref: {ref_audio.filename}")
            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
                shutil.copyfileobj(ref_audio.file, tmp)
                tmp_path = tmp.name

            has_ref_text = bool(ref_text and ref_text.strip())
            wavs, sr = model.generate_voice_clone(
                text=text,
                language=target_lang,
                ref_audio=tmp_path,
                ref_text=ref_text if has_ref_text else None,
                x_vector_only_mode=not has_ref_text
            )
        else:
            safe_speaker = speaker if speaker != "Voice Clone" else "Ryan"
            print(f"[Infer] Mode: PRESET | Spk: {safe_speaker}")

            wavs, sr = model.generate_custom_voice(
                text=text,
                language=target_lang,
                speaker=safe_speaker,
                instruct=styleInstruction if styleInstruction and styleInstruction.strip() else None
            )

        audio_data = wavs[0]
        if isinstance(audio_data, torch.Tensor):
            audio_data = audio_data.cpu().numpy()

        buffer = io.BytesIO()
        sf.write(buffer, audio_data, sr, format='WAV')
        buffer.seek(0)
        return Response(content=buffer.read(), media_type="audio/wav")

    except Exception as e:
        print(f"[Error] {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try: os.remove(tmp_path)
            except: pass

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

def _config_response():
    return {
        "modelsDir": app_config["models_dir"],
        "downloadMode": app_config["download_mode"],
        "models": {
            "custom": is_model_cached(MODEL_IDS["custom"], app_config["models_dir"]),
            "base": is_model_cached(MODEL_IDS["base"], app_config["models_dir"]),
        }
    }

@app.get("/api/config")
async def get_config():
    return _config_response()

def restart_app():
    print("--- 🔄 Restarting to apply new model settings ---")
    release_single_instance_lock()
    os.execv(sys.executable, [sys.executable] + sys.argv)

@app.post("/api/config")
async def update_config(payload: ConfigUpdate):
    models_dir = payload.modelsDir.strip()
    if not models_dir:
        raise HTTPException(status_code=400, detail="Models directory cannot be empty.")

    try:
        os.makedirs(models_dir, exist_ok=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Cannot use this directory: {e}")

    changed = (
        os.path.normcase(os.path.normpath(models_dir)) != os.path.normcase(os.path.normpath(app_config["models_dir"]))
        or payload.downloadMode != app_config["download_mode"]
    )

    app_config["models_dir"] = models_dir
    app_config["download_mode"] = payload.downloadMode
    save_app_config(app_config)

    if changed:
        threading.Timer(1.0, restart_app).start()
        return {"status": "restarting", **_config_response()}
    return {"status": "unchanged", **_config_response()}

if os.path.exists(DIST_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST_DIR, "assets")), name="assets")
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = os.path.join(DIST_DIR, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(DIST_DIR, "index.html"))

def start_backend():
    uvicorn.run(app, host=HOST, port=PORT, log_level="critical")

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

    # Wait only for the HTTP server, not the model. 30s is generous for binding
    # a local port, and keeps a wedged model load from blocking the window.
    if server_ready.wait(timeout=30):
        webview.create_window(
            title='Qwen3-TTS Studio',
            url=f'http://{HOST}:{PORT}',
            width=1200, height=800,
            background_color='#212121',
            resizable=True
        )

        webview.start(func=configure_window_ui)

        # webview.start() blocks until the window closes. Force a hard exit
        # here instead of letting the interpreter shut down 'naturally': on
        # Windows, pywebview/WebView2 can leave non-daemon threads (and the
        # whole WebView2 child-process tree) alive after the window closes,
        # so the process silently lingers holding VRAM/RAM. That zombie
        # state is what compounds into the next launch's model load hitting
        # memory pressure and crashing.
        print("--- Window closed, shutting down. ---")
        os._exit(0)
    else:
        print("Timeout: the local server did not start.")
        sys.exit(1)
