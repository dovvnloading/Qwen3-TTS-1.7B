"""Exercise request guards through real FastAPI/Starlette middleware plumbing."""
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

import sys
from pathlib import Path
HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE / "Local-TTS" / "Local-TTS"))
from request_security import RequestSizeLimitMiddleware

def make_test_app(max_bytes=16):
    app = FastAPI()

    @app.middleware("http")
    async def browser_middleware(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Test"] = "ok"
        return response

    app.add_middleware(RequestSizeLimitMiddleware, max_bytes=max_bytes)

    @app.post("/api/echo")
    async def echo(request: Request):
        return {"size": len(await request.body())}

    return app


def test_real_fastapi_middleware_roundtrip():
    with TestClient(make_test_app()) as client:
        res = client.post("/api/echo", data=b"hello")
        assert res.status_code == 200
        assert res.json() == {"size": 5}
        assert res.headers.get("X-Test") == "ok"


def test_real_fastapi_middleware_oversize():
    with TestClient(make_test_app()) as client:
        res = client.post("/api/echo", data=b"X" * 17)
        assert res.status_code == 413
        assert res.json()["detail"] == "Request too large."
