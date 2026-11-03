# Security policy and local threat model

Qwen3-TTS Studio is a **single-user local desktop program**. The FastAPI
service binds to `127.0.0.1:8000` and the Vite development proxy binds to
`127.0.0.1:3000`. Neither should be exposed to a LAN or public network.

## Protections

- Mutating API requests require the process-local `X-Local-Token` retrieved
  by the same-origin frontend, and browser Origin values must match an allowed
  loopback host and port exactly.
- The ASGI request limiter rejects unauthorized requests before buffering
  uploads; it enforces a **24 MiB total HTTP body limit**, including requests
  without `Content-Length` or using HTTP chunked transfer.
- Uploaded reference audio is limited to 20 MiB and 90 seconds, with frame
  count and decoded-length bounds before passing the signal to the model.
- Static files are served only from the compiled `dist` directory, and
  resolved parent paths/symlink escapes are rejected.
- Responses include no-cache headers for API data, frame-embedding protection,
  `nosniff` and no-referrer policies.
- A single synthesis gate and shared model lock prevent model replacement
  while GPU inference is using that model.

## Non-goals / limitations

This token is **not** an operating-system security boundary. Other local
processes running under the same account can contact `127.0.0.1:8000`,
retrieve a new session token, and call the API. Browser same-origin policy
and these controls help against accidental cross-site requests, not malicious
software already running on the machine.

The application does **not** implement user accounts, network-level TLS,
authorization for multiple tenants, or remote serving. Do not bind the
service to `0.0.0.0` or expose it through a public reverse proxy.

Third-party ML dependencies can perform their own network operations. When
the app's Download Mode is disabled, app-level model resolution uses local
snapshots, but strict air-gapped privacy additionally requires OS-level
network blocking and dependency auditing. The application intentionally
does not promise that every transitive library is network-silent.

Generated recordings and uploaded reference audio may contain sensitive
information. They are held in memory for the running process, and user-
initiated exports write to paths the user selects.

## Reporting

Please report vulnerabilities privately via GitHub's **Report a vulnerability**
feature on the repository's Security tab if enabled. Otherwise contact the
repository maintainer privately before publishing exploitable details.
