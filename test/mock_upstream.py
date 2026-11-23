#!/usr/bin/env python3
"""Mock OpenAI-compatible upstream for e2e proxy testing (SSE)."""
import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path.endswith("/models"):
            body = json.dumps({"data": [{"id": "mock-1"}, {"id": "mock-2"}]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if not self.path.endswith("/chat/completions"):
            self.send_response(404)
            self.end_headers()
            return
        n = int(self.headers.get("Content-Length", 0))
        req = json.loads(self.rfile.read(n) or b"{}")
        stream = req.get("stream", False)
        reply = (
            "Viora smirks, twirling a silver lock around her finger.\n\n"
            '<<STATS {"trust_delta":2,"npc_clothes":"Nightshirt (Bra Off)",'
            '"note":"your pet-name made her blush"}>>'
        )
        if not stream:
            body = json.dumps({"choices": [{"message": {"role": "assistant", "content": reply}}]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Connection", "close")
        self.end_headers()
        # stream in chunks
        words = reply.split(" ")
        for i, w in enumerate(words):
            chunk = {"choices": [{"delta": {"content": w + (" " if i < len(words) - 1 else "")}}]}
            self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode())
            self.wfile.flush()
            time.sleep(0.02)
        self.wfile.write(b"data: [DONE]\n\n")
        self.wfile.flush()
        self.close_connection = True


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 5099), H).serve_forever()
