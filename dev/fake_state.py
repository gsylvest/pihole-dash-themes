"""Local design preview only: serves app/ plus a fake /api/state so the real dashboard renders with
made-up numbers on a laptop. No Pi-hole, no secrets. POST /api/pause and /api/resume flip the fake state.

    python3 -I pihole/dashboard/dev/fake_state.py 8767   ->  http://localhost:8767/?theme=ambient
"""
import json, os, sys, time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

APP = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app")
STATE = {"blocking": "enabled", "until": None, "big": False}
START = time.time()
DOMAINS = ["ads.doubleclick.net", "graph.facebook.com", "app-measurement.com", "telemetry.sdk.inmobi.com",
           "pagead2.googlesyndication.com", "mobile.events.data.microsoft.com", "settings-win.data.microsoft.com"]


class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=APP, **k)

    def log_message(self, *a):
        pass

    def _json(self, obj):
        b = json.dumps(obj).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)

    def do_GET(self):
        if self.path.startswith("/api/state"):
            now = time.time()
            if STATE["until"] and now > STATE["until"]:
                STATE.update(blocking="enabled", until=None)
            timer = max(0, STATE["until"] - now) if STATE["until"] else None
            run = now - START
            k = int(run // 5)   # a new blocked domain every 5 s
            return self._json({"status": "ok", "now": now, "updated_at": now - 1,
                "data": {"blocked": (1234567 if STATE["big"] else 12408) + int(run * 0.8), "total": (5802211 if STATE["big"] else 58211) + int(run * 3.5), "percent_blocked": 21.3,
                         "blocking": STATE["blocking"], "timer": timer,
                         "cpu_temp": 48.2, "temp_unit": "C", "uptime": 302400 + int(run), "gravity_size": 168734},
                "ticker": [{"domain": DOMAINS[j % len(DOMAINS)], "seen_at": START + j * 5} for j in range(k, max(-1, k - 7), -1)],
                "allowed": [], "screen": {"asleep": False}})
        if self.path.startswith("/fake/big"):   # preview helper: toggle 7-digit numbers
            STATE["big"] = self.path.endswith("on")
            return self._json({"big": STATE["big"]})
        return super().do_GET()

    def do_POST(self):
        if self.path == "/api/pause":
            STATE.update(blocking="disabled", until=time.time() + 300)
        elif self.path == "/api/resume":
            STATE.update(blocking="enabled", until=None)
        return self._json({"ok": True})


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8767
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
