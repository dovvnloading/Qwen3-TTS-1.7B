"""Regression coverage for streamed uploads, localhost origin checks and preflight audio."""
import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "Local-TTS" / "Local-TTS"))
from request_security import RequestSizeLimitMiddleware, is_trusted_origin
import tts_utils


@pytest.mark.parametrize("origin", [
    "http://evil.example", "https://127.0.0.1:8000",
    "http://127.0.0.1:8001", "http://localhost:3001",
    "http://127.0.0.1.evil.example:8000",
    "http://127.0.0.1:8000@evil.example",
    "http://attacker@127.0.0.1:8000",
    "http://127.0.0.1:8000/path", "null",
])
def test_untrusted_browser_origins(origin):
    assert not is_trusted_origin(origin)


@pytest.mark.parametrize("origin", [
    None, "http://localhost:8000", "http://127.0.0.1:8000",
    "http://localhost:3000", "http://127.0.0.1:3000",
])
def test_trusted_browser_origins(origin):
    assert is_trusted_origin(origin)


def invoke_asgi(body_chunks, *, max_bytes=8, headers=(), path="/api/generate"):
    called = []
    events = []
    chunks = iter(body_chunks)

    async def receive():
        try:
            chunk, more = next(chunks)
            return {"type": "http.request", "body": chunk, "more_body": more}
        except StopIteration:
            return {"type": "http.disconnect"}

    async def send(message):
        events.append(message)

    async def downstream(scope, receive_downstream, send_downstream):
        called.append(scope["path"])
        message = await receive_downstream()
        await send_downstream({"type": "http.response.start", "status": 200, "headers": []})
        await send_downstream({"type": "http.response.body", "body": message.get("body", b"")})

    scope = {"type": "http", "method": "POST", "path": path, "headers": list(headers)}
    asyncio.run(RequestSizeLimitMiddleware(downstream, max_bytes=max_bytes)(scope, receive, send))
    return called, events


def test_chunked_upload_rejected_when_exceeding_limit():
    called, events = invoke_asgi([(b"12345", True), (b"6789", False)])
    assert called == []
    assert events[0]["status"] == 413


def test_exactly_maximum_payload_is_allowed():
    called, events = invoke_asgi([(b"12345", True), (b"678", False)])
    assert called == ["/api/generate"]
    assert events[0]["status"] == 200
    assert events[1]["body"] == b"12345678"


def test_declared_size_is_enforced():
    called, events = invoke_asgi([(b"", False)], headers=[(b"content-length", b"9")])
    assert called == []
    assert events[0]["status"] == 413


def test_malformed_declared_length_rejected():
    called, events = invoke_asgi([(b"data", False)], headers=[(b"content-length", b"oops")])
    assert called == []
    assert events[0]["status"] == 400


def test_reference_header_validation_prevents_large_decode(monkeypatch):
    called = []
    def info(_):
        return SimpleNamespace(samplerate=48000, channels=2, duration=240.0, frames=11_520_000)
    def read(*args, **kwargs):
        called.append(True)
        raise AssertionError("Decoder should not be called")

    monkeypatch.setattr(tts_utils.sf, "info", info)
    monkeypatch.setattr(tts_utils.sf, "read", read)
    with pytest.raises(ValueError, match="1–90 seconds"):
        tts_utils.decode_reference_audio(b"tiny placeholder")
    assert not called


def test_selected_load_target_is_forwarded_to_worker():
    source = (ROOT / "Local-TTS" / "Local-TTS" / "Local_TTS.py").read_text(encoding="utf8")
    assert 'args=(model_type,)' in source
    assert 'model_type not in MODEL_IDS' in source

def test_unauthorized_upload_rejected_before_reading_body():
    async def never_read():
        raise AssertionError("Body must not be read")

    async def never_call(scope, receive, send):
        raise AssertionError("Endpoint must not run")

    sent = []
    async def send(message):
        sent.append(message)

    scope = {"type": "http", "method": "POST", "path": "/api/generate",
             "headers": [(b"origin", b"http://127.0.0.1:8000")]}
    asyncio.run(RequestSizeLimitMiddleware(never_call, expected_token="secret")(
        scope, never_read, send))
    assert sent[0]["status"] == 403


def test_untrusted_origin_rejected_before_reading_body():
    async def never_read():
        raise AssertionError("Body must not be read")

    async def never_call(scope, receive, send):
        raise AssertionError("Endpoint must not run")

    sent = []
    async def send(message):
        sent.append(message)

    scope = {"type": "http", "method": "POST", "path": "/api/generate",
             "headers": [(b"x-local-token", b"secret"),
                         (b"origin", b"http://localhost:8888")]}
    asyncio.run(RequestSizeLimitMiddleware(never_call, expected_token="secret")(
        scope, never_read, send))
    assert sent[0]["status"] == 403
