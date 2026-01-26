import os
import io
import sys
import threading
import torch
import soundfile as sf
import uvicorn
import webview  # Requires: pip install pywebview

# Ensure current directory is in path for module loading
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# --- IMPORT MODEL ---
try:
    from qwen_tts import Qwen3TTSModel
except ImportError:
    # Fallback/Mock for testing if model script is missing
    print("CRITICAL WARNING: 'qwen_tts.py' not found. Ensure it is in the same directory.")
    sys.exit(1)

# --- Configuration ---
HOST = "127.0.0.1" # Localhost only for the wrapper
PORT = 8000
DIST_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dist")

# --- Global Model Storage ---
ml_models = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("--- 🚀 BACKEND INITIALIZING ---")
    try:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        dtype = torch.float16 if device == "cuda" else torch.float32
        
        print(f"--- Loading Qwen3-TTS Model on {device.upper()}... ---")
        ml_models["tts"] = Qwen3TTSModel.from_pretrained(
            "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
            device_map="auto",
            dtype=dtype,
            attn_implementation="sdpa"
        )
        print("--- ✅ Model Ready ---")
    except Exception as e:
        print(f"--- ❌ FAILED TO LOAD MODEL: {e} ---")
    
    yield
    
    ml_models.clear()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

app = FastAPI(lifespan=lifespan)

# --- CORS (Allow local connections) ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Data Models ---
class GenerateRequest(BaseModel):
    text: str
    speaker: str = "Ryan"
    language: str = "Auto"
    styleInstruction: str = ""

# --- API Endpoints ---
@app.post("/api/generate")
async def generate_audio(req: GenerateRequest):
    model = ml_models.get("tts")
    if not model:
        raise HTTPException(status_code=503, detail="Model is loading...")
    
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text empty.")

    try:
        print(f"[Infer] Text: {req.text[:20]}... | Spk: {req.speaker}")
        
        target_lang = None if req.language == "Auto" else req.language
        target_instruct = req.styleInstruction if req.styleInstruction.strip() else None
        
        wavs, sr = model.generate_custom_voice(
            text=req.text,
            language=target_lang,
            speaker=req.speaker,
            instruct=target_instruct
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

@app.get("/api/status")
async def get_status():
    return {"status": "ready" if ml_models.get("tts") else "loading"}

# --- Static Files ---
if os.path.exists(DIST_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST_DIR, "assets")), name="assets")
    
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = os.path.join(DIST_DIR, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(DIST_DIR, "index.html"))
else:
    print(f"WARNING: '{DIST_DIR}' not found. UI will not load.")

# --- LAUNCHER LOGIC ---
def start_backend():
    """Runs the Uvicorn server in a separate thread."""
    uvicorn.run(app, host=HOST, port=PORT, log_level="error")

if __name__ == "__main__":
    # 1. Start the Backend API in a Background Thread
    t = threading.Thread(target=start_backend)
    t.daemon = True
    t.start()

    # 2. Start the Frontend Wrapper (The Window)
    # This blocks the main thread until the window is closed
    print(f"--- Launching GUI at http://{HOST}:{PORT} ---")
    
    webview.create_window(
        title='Qwen3-TTS Studio', 
        url=f'http://{HOST}:{PORT}',
        width=1200, 
        height=800,
        background_color='#212121',
        resizable=True
    )
    
    webview.start()