"""Small, testable TTS input/output and model-cache helpers.

No imports of torch or qwen_tts: these checks must run before GPU work.
"""
from __future__ import annotations

import io
import os
import re
import json
from pathlib import Path

import numpy as np
import soundfile as sf

MAX_REFERENCE_BYTES = 20 * 1024 * 1024
MAX_REFERENCE_SECONDS = 90
MIN_REFERENCE_SECONDS = 1
MAX_TEXT_CHARS = 20_000
MAX_SEGMENTS = 120
REQUIRED_MODEL_FILES = (
    "config.json", "model.safetensors", "speech_tokenizer/model.safetensors",
    "tokenizer_config.json", "vocab.json", "merges.txt",
)


def safe_spa_path(dist_dir: str, path: str) -> Path:
    """Resolve a URL path within dist; reject traversal, absolute paths and symlinks."""
    root = Path(dist_dir).resolve()
    file_path = (root / path).resolve()
    if not file_path.is_relative_to(root):
        raise ValueError("Outside static directory")
    return file_path


def safetensors_complete(path: Path) -> bool:
    """Verify that the metadata's expected byte ranges actually fit the weight file."""
    try:
        size = path.stat().st_size
        with path.open("rb") as f:
            prefix = f.read(8)
            if len(prefix) != 8:
                return False
            header_size = int.from_bytes(prefix, "little")
            if header_size <= 0 or header_size > 32 * 1024 * 1024:
                return False
            if size < 8 + header_size:
                return False
            header = json.loads(f.read(header_size))
        if not isinstance(header, dict):
            return False
        offsets = [
            tensor.get("data_offsets")
            for name, tensor in header.items()
            if name != "__metadata__" and isinstance(tensor, dict)
        ]
        if not offsets or any(not isinstance(v, list) or len(v) != 2
                              or not all(isinstance(x, int) and x >= 0 for x in v)
                              or v[1] < v[0] for v in offsets):
            return False
        return size >= 8 + header_size + max(v[1] for v in offsets)
    except (OSError, ValueError, TypeError, OverflowError, json.JSONDecodeError):
        return False


def snapshot_complete(folder: str | Path) -> bool:
    """Check required files and validate safetensors payload bounds without loading weights."""
    root = Path(folder)
    try:
        if not all((root / name).is_file() and (root / name).stat().st_size > 0
                   for name in REQUIRED_MODEL_FILES):
            return False
        return (safetensors_complete(root / "model.safetensors")
                and safetensors_complete(root / "speech_tokenizer/model.safetensors"))
    except OSError:
        return False


def cached_model_path(repo_id: str, models_dir: str) -> str | None:
    """Support both Hugging Face cache snapshots and standalone --local-dir downloads."""
    base = Path(models_dir)
    name = repo_id.rsplit("/", 1)[-1]
    direct = base / name
    if snapshot_complete(direct):
        return str(direct.resolve())
    # A user may select the exact model folder itself as their models directory.
    if base.name == name and snapshot_complete(base):
        return str(base.resolve())
    snapshots = base / ("models--" + repo_id.replace("/", "--")) / "snapshots"
    if snapshots.is_dir():
        try:
            entries = sorted(snapshots.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True)
        except OSError:
            return None
        for entry in entries:
            if entry.is_dir() and snapshot_complete(entry):
                return str(entry.resolve())
    return None


def decode_reference_audio(payload: bytes) -> tuple[np.ndarray, int]:
    """Decode a bounded upload. Filename extensions and Content-Type are not trusted."""
    if not payload:
        raise ValueError("Reference audio is empty.")
    if len(payload) > MAX_REFERENCE_BYTES:
        raise ValueError("Reference audio exceeds the 20 MB limit.")
    try:
        # Validate the decoder-reported frame count BEFORE allocating the PCM
        # array: a tiny compressed upload can expand into hours of audio.
        info = sf.info(io.BytesIO(payload))
        if not 8000 <= info.samplerate <= 192000:
            raise ValueError("Reference sample rate must be between 8 and 192 kHz.")
        if not 1 <= info.channels <= 2:
            raise ValueError("Reference audio must be mono or stereo.")
        if not MIN_REFERENCE_SECONDS <= info.duration <= MAX_REFERENCE_SECONDS:
            raise ValueError("Reference audio must be 1–90 seconds long.")
        # Bound decoded allocation even if file metadata is malformed.
        if info.frames <= 0 or info.frames > MAX_REFERENCE_SECONDS * info.samplerate:
            raise ValueError("Invalid reference audio frame count.")
        # Bound decoding itself, not only decoder metadata: a crafted header
        # cannot force us to expand an unbounded amount of compressed audio.
        max_frames = int(MAX_REFERENCE_SECONDS * info.samplerate)
        samples, sr = sf.read(
            io.BytesIO(payload), frames=max_frames + 1,
            dtype="float32", always_2d=True,
        )
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("Unsupported or corrupt reference audio. Try WAV or FLAC.") from exc
    if sr != info.samplerate or len(samples) > MAX_REFERENCE_SECONDS * sr:
        raise ValueError("Reference audio exceeds 90 seconds or has invalid metadata.")
    duration = len(samples) / sr
    if duration < MIN_REFERENCE_SECONDS:
        raise ValueError("Reference audio must be at least one second long.")
    mono = np.mean(samples, axis=1).astype(np.float32)
    if samples.shape[1] == 2:
        # Anti-phase stereo can cancel voices when mixed to mono. Prefer a
        # non-silent channel if the downmix nearly cancels the source.
        individual_rms = np.sqrt(np.mean(np.square(samples.astype(np.float64)), axis=0))
        mixed_rms = float(np.sqrt(np.mean(np.square(mono.astype(np.float64)))))
        loudest = int(np.argmax(individual_rms))
        if individual_rms[loudest] > 0.001 and mixed_rms < 0.1 * individual_rms[loudest]:
            mono = samples[:, loudest].copy()
    if not np.all(np.isfinite(mono)):
        raise ValueError("Reference audio contains invalid samples.")
    if float(np.max(np.abs(mono))) < 0.001:
        raise ValueError("Reference audio is silent or too quiet.")
    return mono, sr


def split_text(text: str, max_chars: int = 280) -> list[str]:
    """Prefer sentence boundaries; wrap long sentences at whitespace/character boundaries."""
    if not 80 <= max_chars <= 1200:
        raise ValueError("Invalid maximum segment length.")
    if not text or not text.strip():
        raise ValueError("Text is empty.")
    if len(text) > MAX_TEXT_CHARS:
        raise ValueError("Text exceeds the 20,000 character limit.")
    # Do not split decimal points. Support sentence punctuation without spaces in CJK.
    sentence_parts = re.split(
        r"(?<=[!?])\s+|(?<=\.)\s+|(?<=[。！？])\s*|[\r\n]+",
        text.strip(),
    )
    segments: list[str] = []
    current = ""

    def flush() -> None:
        nonlocal current
        if current.strip():
            segments.append(current.strip())
        current = ""

    for piece in sentence_parts:
        piece = piece.strip()
        if not piece:
            continue
        while len(piece) > max_chars:
            head = piece[:max_chars]
            # Don't break on a very early space; support unspaced CJK.
            cut = head.rfind(" ")
            cut = cut if cut >= max_chars // 2 else max_chars
            fragment, piece = piece[:cut].strip(), piece[cut:].strip()
            if current:
                flush()
            segments.append(fragment)
        if not piece:
            continue
        candidate = f"{current} {piece}".strip() if current else piece
        if len(candidate) > max_chars:
            flush()
            current = piece
        else:
            current = candidate
    flush()
    if len(segments) > MAX_SEGMENTS:
        raise ValueError(f"Text requires more than {MAX_SEGMENTS} segments.")
    return segments


def process_output_audio(
    samples, sr: int, *, normalize: bool = False, trim_silence: bool = False
) -> np.ndarray:
    """Reject invalid output and optionally apply gentle mastering without compression."""
    audio = np.asarray(samples, dtype=np.float32).squeeze()
    if audio.ndim != 1 or audio.size == 0:
        raise ValueError("The model returned empty or invalid audio.")
    if not 8000 <= sr <= 192000 or not np.all(np.isfinite(audio)):
        raise ValueError("The model returned invalid sample rate or samples.")
    if len(audio) > 15 * 60 * sr:
        raise ValueError("Generated audio exceeds the 15 minute safety limit.")
    if trim_silence:
        active = np.flatnonzero(np.abs(audio) > 0.003)
        if active.size:
            pad = int(sr * 0.12)
            audio = audio[max(0, int(active[0]) - pad):min(len(audio), int(active[-1]) + 1 + pad)]
    peak = float(np.max(np.abs(audio)))
    if peak < 1e-6:
        raise ValueError("The model generated silence.")
    if normalize:
        audio = audio * (0.95 / peak)
    elif peak > 1.0:
        # Prevent hard PCM clipping without changing the sound of normal outputs.
        audio = audio * (0.99 / peak)
    return audio.astype(np.float32)
