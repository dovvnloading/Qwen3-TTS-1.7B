"""Fast offline regression checks; no model weights or CUDA required."""
import ast
import io
import json
import sys
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT / "Local-TTS" / "Local-TTS"))
from tts_utils import (
    safe_spa_path, snapshot_complete, cached_model_path, safetensors_complete,
    decode_reference_audio, split_text, process_output_audio,
)


def test_static_paths_reject_traversal(tmp_path):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("ok")
    assert safe_spa_path(str(dist), "index.html") == dist / "index.html"
    for path in ("../secret.txt", "../../etc/passwd", "/etc/passwd"):
        with pytest.raises(ValueError):
            safe_spa_path(str(dist), path)


def test_static_paths_reject_symlink_escape(tmp_path):
    dist = tmp_path / "dist"
    dist.mkdir()
    (tmp_path / "private.txt").write_text("secret")
    link = dist / "linked.txt"
    try:
        link.symlink_to(tmp_path / "private.txt")
    except (OSError, NotImplementedError):
        pytest.skip("Symlinks unavailable")
    with pytest.raises(ValueError):
        safe_spa_path(str(dist), "linked.txt")


def make_complete_snapshot(folder: Path):
    from tts_utils import REQUIRED_MODEL_FILES
    for name in REQUIRED_MODEL_FILES:
        path = folder / name
        path.parent.mkdir(parents=True, exist_ok=True)
        if name.endswith(".safetensors"):
            tensor = {"tensor": {"dtype": "F32", "shape": [1], "data_offsets": [0, 4]}}
            header = json.dumps(tensor).encode("utf-8")
            path.write_bytes(len(header).to_bytes(8, "little") + header + bytes(4))
        else:
            path.write_bytes(b"test config")


def test_incomplete_cache_is_not_reported_ready(tmp_path):
    repo_id = "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"
    direct = tmp_path / "Qwen3-TTS-12Hz-1.7B-CustomVoice"
    direct.mkdir()
    (direct / "config.json").write_text("{}")
    assert not snapshot_complete(direct)
    assert cached_model_path(repo_id, str(tmp_path)) is None
    make_complete_snapshot(direct)
    assert snapshot_complete(direct)
    assert cached_model_path(repo_id, str(tmp_path)) == str(direct)
    weight = direct / "model.safetensors"
    weight.write_bytes(weight.read_bytes()[:-1])
    assert not safetensors_complete(weight)
    assert not snapshot_complete(direct)


def test_hf_cache_layout_is_supported(tmp_path):
    repo_id = "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
    snap = tmp_path / "models--Qwen--Qwen3-TTS-12Hz-1.7B-Base" / "snapshots" / "abc"
    make_complete_snapshot(snap)
    assert cached_model_path(repo_id, str(tmp_path)) == str(snap)


def wav_bytes(samples, sr=24000):
    stream = io.BytesIO()
    sf.write(stream, samples, sr, format="WAV")
    return stream.getvalue()


def test_reference_audio_validation():
    t = np.arange(3 * 24000) / 24000
    samples = np.sin(2 * np.pi * 200 * t).astype(np.float32) * 0.2
    mono, sr = decode_reference_audio(wav_bytes(samples))
    assert sr == 24000
    assert mono.ndim == 1
    assert len(mono) == len(samples)
    with pytest.raises(ValueError, match="silent"):
        decode_reference_audio(wav_bytes(np.zeros(2 * 24000)))
    with pytest.raises(ValueError, match="Unsupported"):
        decode_reference_audio(b"not audio")
    with pytest.raises(ValueError, match="20 MB"):
        decode_reference_audio(b"x" * (20 * 1024 * 1024 + 1))


def test_segment_lengths_and_cjk_punctuation():
    text = "Hello, world. Here is a longer second sentence. 你好世界。下一句话！" * 5
    segments = split_text(text, 110)
    assert all(0 < len(s) <= 110 for s in segments)
    assert len(segments) > 1
    assert "你好世界。" in "".join(segments)
    with pytest.raises(ValueError, match="20,000"):
        split_text("X" * 20001)


def test_audio_quality_validation_and_peak_normalization():
    data = np.array([0.0, -1.5, 0.25, 0.1], dtype=np.float32)
    normalized = process_output_audio(data, 24000, normalize=True)
    assert np.isclose(float(np.max(np.abs(normalized))), 0.95, atol=1e-5)
    not_normalized = process_output_audio(data, 24000)
    assert np.max(np.abs(not_normalized)) <= 1
    for invalid in ([], [0, 0], [0, float("nan")], [[1, 2], [3, 4]]):
        with pytest.raises(ValueError):
            process_output_audio(invalid, 24000)


def test_backend_keeps_generation_within_model_lock():
    """A cheap structural regression protecting against accidental lock-scope edits."""
    src = (PROJECT / "Local-TTS" / "Local-TTS" / "Local_TTS.py").read_text(encoding="utf-8")
    module = ast.parse(src)
    generate = next(node for node in module.body
                    if isinstance(node, ast.FunctionDef) and node.name == "generate_audio")
    model_locks = [n for n in ast.walk(generate)
                   if isinstance(n, ast.With)
                   and any(isinstance(i.context_expr, ast.Name)
                           and i.context_expr.id == "model_lock" for i in n.items)]
    assert len(model_locks) == 1
    protected = model_locks[0]
    calls = [node.func.attr for node in ast.walk(protected)
             if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)]
    assert "generate_custom_voice" in calls
    assert "generate_voice_clone" in calls


def test_backend_compiles_without_running_model():
    src = (PROJECT / "Local-TTS" / "Local-TTS" / "Local_TTS.py").read_text(encoding="utf-8")
    compile(src, "Local_TTS.py", "exec")


def test_antiphase_stereo_reference_does_not_cancel():
    sample_rate = 24000
    t = np.arange(2 * sample_rate, dtype=np.float64) / sample_rate
    speech_like = (np.sin(2 * np.pi * 220 * t) * 0.25).astype(np.float32)
    stereo = np.column_stack((speech_like, -speech_like))
    audio, decoded_rate = decode_reference_audio(wav_bytes(stereo, sample_rate))
    assert decoded_rate == sample_rate
    assert float(np.max(np.abs(audio))) > 0.20


def test_decoding_has_an_explicit_frame_cap(monkeypatch):
    from types import SimpleNamespace
    from tts_utils import MAX_REFERENCE_SECONDS
    captured = []

    monkeypatch.setattr(sf, "info", lambda _: SimpleNamespace(
        samplerate=24000, channels=1, duration=2.0, frames=48000))

    def fake_read(_, *, frames, dtype, always_2d):
        captured.append(frames)
        assert dtype == "float32"
        assert always_2d
        return np.ones((48000, 1), dtype=np.float32) * 0.1, 24000

    monkeypatch.setattr(sf, "read", fake_read)
    decoded, _ = decode_reference_audio(b"minimal compressed audio placeholder")
    assert captured == [MAX_REFERENCE_SECONDS * 24000 + 1]
    assert len(decoded) == 48000
