#!/usr/bin/env python3
"""
The King's Order — local game server.
Serves the static app and proxies LLM API calls (keeps your API key on your machine,
avoids CORS problems with browser fetches).

Usage:
    python3 server.py            # http://localhost:8000
    PORT=9000 python3 server.py  # custom port
"""
import json
import os
import sys
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", "8000"))
MAX_BODY = 32 * 1024 * 1024  # 32 MB upstream response cap


class Handler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, fmt, *args):
        sys.stderr.write("[gametest] %s\n" % (fmt % args))

    # ------------------------------------------------------------------ helpers
    def _json(self, code, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            return None
        return self.rfile.read(length)

    def _upstream_request(self, method, url, body_obj=None, api_key="", timeout=300):
        headers = {"Content-Type": "application/json", "Accept": "*/*"}
        if api_key:
            headers["Authorization"] = "Bearer " + api_key
        data = json.dumps(body_obj).encode("utf-8") if body_obj is not None else None
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        return urllib.request.urlopen(req, timeout=timeout)

    def _normalize_base(self, base):
        base = (base or "").strip().rstrip("/")
        if not base:
            return None
        return base

    # ------------------------------------------------------------------- routes
    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/health":
            self._json(200, {"ok": True, "app": "the-kings-order"})
            return
        super().do_GET()

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/chat":
            self._handle_chat()
        elif path == "/api/models":
            self._handle_models()
        else:
            self._json(404, {"error": "not found"})

    # ------------------------------------------------------------- POST /api/chat
    def _handle_chat(self):
        raw = self._read_body()
        if raw is None:
            self._json(400, {"error": "bad request body"})
            return
        try:
            data = json.loads(raw.decode("utf-8"))
        except Exception:
            self._json(400, {"error": "invalid JSON"})
            return

        base = self._normalize_base(data.get("base"))
        if not base:
            self._json(400, {"error": "API base URL is empty — open Settings (⚙) and set the provider."})
            return
        if "://" not in base:
            base = "https://" + base
        api_key = data.get("key") or ""
        payload = {
            "model": data.get("model") or "",
            "messages": data.get("messages") or [],
            "temperature": data.get("temperature", 1.0),
            "max_tokens": data.get("max_tokens", 1500),
            "stream": bool(data.get("stream", True)),
        }
        if payload["stream"]:
            payload.pop("stream", None)
            self._stream_chat(base, api_key, payload)
        else:
            self._json_chat(base, api_key, payload)

    def _safe_error(self, exc, context):
        if isinstance(exc, urllib.error.HTTPError):
            try:
                detail = exc.read().decode("utf-8", "replace")[:4000]
            except Exception:
                detail = ""
            return {"error": f"Upstream HTTP {exc.code}: {detail or exc.reason}", "status": exc.code}
        if isinstance(exc, urllib.error.URLError):
            return {"error": f"Cannot reach API ({context}): {exc.reason}"}
        return {"error": f"{type(exc).__name__}: {exc} ({context})"}

    def _json_chat(self, base, api_key, payload):
        try:
            resp = self._upstream_request("POST", base + "/chat/completions", payload, api_key)
            body = resp.read(MAX_BODY)
        except Exception as exc:
            self._json(502, self._safe_error(exc, base))
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _stream_chat(self, base, api_key, payload):
        payload["stream"] = True
        try:
            resp = self._upstream_request("POST", base + "/chat/completions", payload, api_key)
        except Exception as exc:
            self._json(502, self._safe_error(exc, base))
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        try:
            while True:
                chunk = resp.read(4096)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            try:
                resp.close()
            except Exception:
                pass
        self.close_connection = True

    # ----------------------------------------------------------- POST /api/models
    def _handle_models(self):
        raw = self._read_body()
        if raw is None:
            self._json(400, {"error": "bad request body"})
            return
        try:
            data = json.loads(raw.decode("utf-8"))
        except Exception:
            self._json(400, {"error": "invalid JSON"})
            return
        base = self._normalize_base(data.get("base"))
        if not base:
            self._json(400, {"error": "API base URL is empty"})
            return
        if "://" not in base:
            base = "https://" + base
        # Some providers expose /models, some only /v1/models — try both.
        candidates = [base + "/models"]
        if not base.endswith("/v1"):
            candidates.append(base + "/v1/models")
        last_err = None
        for url in candidates:
            try:
                resp = self._upstream_request("GET", url, None, data.get("key") or "", timeout=30)
                body = resp.read(4 * 1024 * 1024)
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            except Exception as exc:
                last_err = exc
        self._json(502, self._safe_error(last_err, base))


def main():
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"The King's Order — local server\n  → http://localhost:{PORT}\n  (Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")


if __name__ == "__main__":
    main()
