"""Small, dependency-light ASGI controls for the local desktop HTTP API."""
from __future__ import annotations

from urllib.parse import urlsplit

MAX_REQUEST_BYTES = 24 * 1024 * 1024


def is_trusted_origin(origin: str | None, *, port: int = 8000, dev_port: int = 3000) -> bool:
    """Compare the *complete* local origin, including port, scheme and userinfo."""
    if not origin:
        return True  # Non-browser clients still need the session token.
    try:
        parts = urlsplit(origin)
        return (
            parts.scheme == "http"
            and parts.username is None
            and parts.password is None
            and parts.hostname in ("127.0.0.1", "localhost")
            and parts.port in (port, dev_port)
            and parts.path in ("", "/")
            and not parts.query
            and not parts.fragment
            and origin == f"http://{parts.hostname}:{parts.port}"
        )
    except ValueError:
        return False


class RequestSizeLimitMiddleware:
    """Bound streamed/chunked uploads even without a Content-Length header.

    Buffer at most MAX_REQUEST_BYTES before entering multipart decoding. On
    overflow reject the request without invoking the downstream FastAPI app.
    """

    def __init__(self, app, *, max_bytes: int = MAX_REQUEST_BYTES):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if (scope["type"] != "http" or
                not scope.get("path", "").startswith("/api/") or
                scope.get("method", "GET").upper() not in ("POST", "PUT", "PATCH")):
            return await self.app(scope, receive, send)

        async def error(status: int, detail: str):
            body = ('{"detail":"' + detail + '"}').encode("utf-8")
            await send({
                "type": "http.response.start",
                "status": status,
                "headers": [(b"content-type", b"application/json"),
                            (b"cache-control", b"no-store"),
                            (b"content-length", str(len(body)).encode())],
            })
            await send({"type": "http.response.body", "body": body})

        headers = dict(scope.get("headers", []))
        content_length = headers.get(b"content-length", b"")
        if content_length:
            try:
                declared = int(content_length)
                if declared < 0:
                    return await error(400, "Invalid Content-Length.")
                if declared > self.max_bytes:
                    return await error(413, "Request too large.")
            except ValueError:
                return await error(400, "Invalid Content-Length.")

        data = bytearray()
        while True:
            msg = await receive()
            if msg["type"] == "http.disconnect":
                return
            if msg["type"] != "http.request":
                return await error(400, "Invalid request body.")
            chunk = msg.get("body", b"")
            if len(chunk) > self.max_bytes - len(data):
                return await error(413, "Request too large.")
            data.extend(chunk)
            if not msg.get("more_body", False):
                break

        consumed = False

        async def replay():
            nonlocal consumed
            if not consumed:
                consumed = True
                return {"type": "http.request", "body": bytes(data), "more_body": False}
            return await receive()

        return await self.app(scope, replay, send)
