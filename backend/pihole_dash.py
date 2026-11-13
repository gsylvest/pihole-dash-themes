#!/usr/bin/env python3
"""pihole-dash: tiny localhost-only backend for the Pi-hole touchscreen dashboard.

- Serves the static dashboard (WWW_DIR) on 127.0.0.1.
- Holds the Pi-hole *app password* (read once from the systemd credential
  "app-password") and the API session. The browser never sees either.
- Polls only the endpoints the page needs and exposes a small, fixed API.

Endpoints (all on 127.0.0.1:PORT):
  GET    /api/state              aggregated snapshot (always 200; "status" says what's wrong)
  POST   /api/pause              pause blocking for 5 minutes
  POST   /api/resume             resume blocking now
  GET    /api/domain?domain=D    facts for the domain sheet (blocked today, last seen, why, allow state)
  POST   /api/allow              {"domain": D, "mode": "timed"|"always"|"restore", "until": epoch|null}
  DELETE /api/allow?domain=D     remove a dashboard-managed allow
  GET    /api/allowed            dashboard-managed allows
  GET    /healthz                "ok" once the HTTP server is up
  GET    /*                      static files from WWW_DIR

Allow rules: exact allows only, validated hostnames only, and only entries whose
comment carries the "pihole-dash" tag are ever changed or removed. Timed allows
store their expiry in that comment, so they survive restarts; an expiry loop
removes them when due.

Python standard library only. Never logs the password or session ID.
"""
import json
import os
import re
import signal
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PIHOLE_URL = os.environ.get("PIHOLE_URL", "http://127.0.0.1").rstrip("/")
BIND = os.environ.get("BIND", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8088"))
WWW_DIR = os.path.realpath(os.environ.get("WWW_DIR", "/opt/pihole-dash/www"))
POLL_SECONDS = float(os.environ.get("POLL_SECONDS", "3"))
SYSTEM_POLL_SECONDS = 60
LOGIN_RETRY_SECONDS = 60          # after a rejected password, don't hammer FTL
PAUSE_SECONDS = 300
TICKER_LEN = 6
MISSING = "__MISSING__"           # placeholder systemd supplies when the file is absent

# Timed allow. ALLOW_TTL_OVERRIDE_SECONDS exists only for testing; normal value is 1 hour.
ALLOW_TTL = int(os.environ.get("ALLOW_TTL_OVERRIDE_SECONDS") or 3600)
EXPIRY_CHECK_SECONDS = float(os.environ.get("EXPIRY_CHECK_SECONDS") or 30)
TAG = "pihole-dash"
TAG_RE = re.compile(r"^pihole-dash(?: until=(\d+))?(?:\s|$)")
LABEL = r"(?!-)[a-z0-9_-]{1,63}(?<!-)"
HOST_RE = re.compile(rf"^(?=.{{1,253}}$){LABEL}(?:\.{LABEL})+$")
QUERY_SAMPLE = 1000
BLOCKED_STATUSES = {
    "GRAVITY", "REGEX", "DENYLIST", "GRAVITY_CNAME", "REGEX_CNAME", "DENYLIST_CNAME",
    "EXTERNAL_BLOCKED_IP", "EXTERNAL_BLOCKED_NULL", "EXTERNAL_BLOCKED_NXRA", "EXTERNAL_BLOCKED_EDE15",
    "SPECIAL_DOMAIN",
}

ALLOWED_ORIGINS = {f"http://127.0.0.1:{PORT}", f"http://localhost:{PORT}"}
PRESENCE_STATE = os.environ.get("PRESENCE_STATE", "/run/pihole-presence/state.json")


def read_presence():
    """Screen sleep state from pihole-presence; None if it isn't running or the file is stale."""
    try:
        with open(PRESENCE_STATE, encoding="utf-8") as fh:
            p = json.load(fh)
    except (OSError, ValueError):
        return None
    if time.time() - (p.get("updated_at") or 0) > 15:
        return None
    return {"asleep": bool(p.get("asleep")), "sensor": p.get("sensor"), "present": p.get("present")}


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def read_app_password():
    """App password from the systemd credential, or None if not set up."""
    cred_dir = os.environ.get("CREDENTIALS_DIRECTORY")
    path = os.path.join(cred_dir, "app-password") if cred_dir else os.environ.get("APP_PASSWORD_FILE")
    if not path:
        return None
    try:
        with open(path, encoding="utf-8") as fh:
            value = fh.read().strip()
    except OSError:
        return None
    return None if value in ("", MISSING) else value


def clean_domain(raw):
    """Lowercase, strip a trailing dot, and accept only plain hostnames."""
    if not isinstance(raw, str):
        return None
    d = raw.strip().lower().rstrip(".")
    return d if HOST_RE.match(d) else None


def make_comment(until):
    if until is None:
        return TAG
    iso = datetime.fromtimestamp(until, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return f"{TAG} until={int(until)} ({iso})"


def parse_tag(comment):
    """(managed, until) from an allow entry's comment."""
    m = TAG_RE.match(comment or "")
    if not m:
        return False, None
    return True, (int(m.group(1)) if m.group(1) else None)


def list_name(address, comment):
    a = (address or "").lower()
    if "stevenblack" in a:
        return "StevenBlack hosts"
    if "hagezi" in a:
        base = a.rsplit("/", 1)[-1].replace(".txt", "")
        return {"multi": "HaGeZi Multi NORMAL", "light": "HaGeZi Multi LIGHT", "pro": "HaGeZi Multi PRO"}.get(base, f"HaGeZi {base}")
    if comment:
        return re.sub(r"\s*\(.*\)$", "", comment).strip() or comment
    return urllib.parse.urlparse(address or "").netloc or "a blocklist"


class AuthRejected(Exception):
    pass


class ApiError(Exception):
    def __init__(self, status, payload, what):
        err = (payload or {}).get("error") or {}
        self.status = status
        self.key = err.get("key") if isinstance(err, dict) else None
        self.detail = (err.get("message") or err.get("hint")) if isinstance(err, dict) else None
        super().__init__(f"{what} -> HTTP {status} {self.key or ''}".strip())


class PiholeClient:
    def __init__(self, password):
        self.password = password
        self.sid = None
        self.lock = threading.Lock()
        self.retry_login_at = 0.0

    def _raw(self, method, path, body=None, sid=None, timeout=5):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(PIHOLE_URL + path, data=data, method=method)
        req.add_header("Accept", "application/json")
        if data is not None:
            req.add_header("Content-Type", "application/json")
        if sid:
            req.add_header("X-FTL-SID", sid)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read()
                return resp.status, (json.loads(raw) if raw else {})
        except urllib.error.HTTPError as err:
            raw = err.read()
            try:
                payload = json.loads(raw) if raw else {}
            except ValueError:
                payload = {}
            return err.code, payload

    def login(self):
        if time.time() < self.retry_login_at:
            raise AuthRejected("waiting before retrying login")
        status, payload = self._raw("POST", "/api/auth", {"password": self.password})
        session = payload.get("session") or {}
        if status == 200 and session.get("valid") and session.get("sid"):
            self.sid = session["sid"]
            log("pihole-dash: logged in to Pi-hole API")
            return
        self.sid = None
        self.retry_login_at = time.time() + LOGIN_RETRY_SECONDS
        raise AuthRejected(f"login rejected (HTTP {status})")

    def call(self, method, path, body=None, ok404=False, timeout=5):
        """Authenticated call; logs in (again) once on 401."""
        with self.lock:
            if not self.sid:
                self.login()
            status, payload = self._raw(method, path, body, self.sid, timeout)
            if status == 401:
                self.sid = None
                self.login()
                status, payload = self._raw(method, path, body, self.sid, timeout)
            if ok404 and status == 404:
                return None
            if status >= 400:
                raise ApiError(status, payload, f"{method} {path.split('?')[0]}")
            return payload

    def logout(self):
        with self.lock:
            if self.sid:
                try:
                    self._raw("DELETE", "/api/auth", sid=self.sid, timeout=2)
                except Exception:
                    pass
                self.sid = None

    # --- exact allow list ------------------------------------------------
    def get_allow(self, domain):
        payload = self.call("GET", f"/api/domains/allow/exact/{urllib.parse.quote(domain, safe='')}", ok404=True) or {}
        for entry in payload.get("domains") or []:
            if entry.get("domain") == domain:
                return entry
        return None

    def list_allow(self):
        return (self.call("GET", "/api/domains/allow/exact") or {}).get("domains") or []

    def set_allow(self, domain, comment, existing):
        if existing:
            body = {"type": "allow", "kind": "exact", "comment": comment, "enabled": True,
                    "groups": existing.get("groups") or [0]}
            return self.call("PUT", f"/api/domains/allow/exact/{urllib.parse.quote(domain, safe='')}", body, timeout=15)
        body = {"domain": domain, "comment": comment, "enabled": True, "groups": [0]}
        return self.call("POST", "/api/domains/allow/exact", body, timeout=15)

    def delete_allow(self, domain):
        return self.call("DELETE", f"/api/domains/allow/exact/{urllib.parse.quote(domain, safe='')}", timeout=15)


class State:
    """Latest snapshot for the page. Keeps the last good data when things break."""

    def __init__(self, needs_setup):
        self.lock = threading.Lock()
        self.status = "needs_setup" if needs_setup else "starting"
        self.message = ""
        self.data = None             # last good data
        self.updated_at = None       # epoch seconds of last good data
        self.ticker = []             # [{"domain": str, "seen_at": float|None}]
        self.uptime = None
        self.uptime_at = 0.0
        self.allowed = []            # dashboard-managed allows [{"domain", "until", "added"}]

    def snapshot(self):
        with self.lock:
            return {
                "status": self.status,          # ok | needs_setup | auth_failed | offline | starting
                "message": self.message,
                "now": time.time(),
                "updated_at": self.updated_at,
                "data": self.data,
                "ticker": list(self.ticker),
                "allowed": list(self.allowed),
                "screen": read_presence(),
            }

    def merge_ticker(self, domains, now):
        """recent_blocked has no timestamps; stamp domains when we first see them at the top."""
        prev = [t["domain"] for t in self.ticker]
        if not prev:
            self.ticker = [{"domain": d, "seen_at": None} for d in domains[:TICKER_LEN]]
            return
        new_count = len(domains)
        for i in range(len(domains) + 1):
            tail = domains[i:]
            if tail == prev[: len(tail)]:
                new_count = i
                break
        fresh = [{"domain": d, "seen_at": now} for d in domains[:new_count]]
        self.ticker = (fresh + self.ticker)[:TICKER_LEN]


def poll_once(client, state):
    now = time.time()
    padd = client.call("GET", "/api/padd")
    blocking = client.call("GET", "/api/dns/blocking")
    recent = client.call("GET", f"/api/stats/recent_blocked?count={TICKER_LEN}")
    if now - state.uptime_at > SYSTEM_POLL_SECONDS:
        system = client.call("GET", "/api/info/system")
        state.uptime = (system.get("system") or {}).get("uptime")
        state.uptime_at = now

    queries = padd.get("queries") or {}
    sensors = padd.get("sensors") or {}
    data = {
        "blocked": queries.get("blocked"),
        "total": queries.get("total"),
        "percent_blocked": queries.get("percent_blocked"),
        "gravity_size": padd.get("gravity_size"),
        "blocking": blocking.get("blocking", padd.get("blocking")),   # enabled|disabled|failed|unknown
        "timer": blocking.get("timer"),
        "cpu_temp": sensors.get("cpu_temp"),
        "temp_unit": sensors.get("unit", "C"),
        "uptime": state.uptime,
    }
    with state.lock:
        state.merge_ticker([d for d in (recent.get("blocked") or []) if isinstance(d, str)], now)
        state.data = data
        state.updated_at = now
        state.status = "ok"
        state.message = ""


def poller(client, state, stop, wake):
    while not stop.is_set():
        try:
            poll_once(client, state)
        except AuthRejected as err:
            with state.lock:
                state.status, state.message = "auth_failed", str(err)
        except Exception as err:  # Pi-hole down, timeout, bad JSON...
            with state.lock:
                state.status, state.message = "offline", type(err).__name__
        wake.wait(POLL_SECONDS)
        wake.clear()


class Allows:
    """Dashboard-managed exact allows: create, extend, remove, expire."""

    def __init__(self, client, state):
        self.client, self.state = client, state
        self.write_lock = threading.Lock()

    def refresh(self):
        """Re-read the allow list, expire due entries, publish the managed ones."""
        now = time.time()
        managed = []
        for entry in self.client.list_allow():
            ok, until = parse_tag(entry.get("comment"))
            if not ok:
                continue
            if until is not None and until <= now:
                try:
                    self.client.delete_allow(entry["domain"])
                    log(f"pihole-dash: timed allow expired, removed {entry['domain']}")
                except Exception as err:
                    log(f"pihole-dash: could not remove expired allow {entry['domain']}: {err}")
                    managed.append({"domain": entry["domain"], "until": until, "added": entry.get("date_added")})
                continue
            managed.append({"domain": entry["domain"], "until": until, "added": entry.get("date_added")})
        managed.sort(key=lambda e: -(e["added"] or 0))
        with self.state.lock:
            self.state.allowed = managed

    def allow(self, domain, mode, until=None):
        with self.write_lock:
            existing = self.client.get_allow(domain)
            if existing:
                managed, prev_until = parse_tag(existing.get("comment"))
                if not managed:
                    return 409, {"error": "allowed_elsewhere", "message": "Already allowed in the web admin; not changing it."}
                previous = {"until": prev_until}
            else:
                previous = None
            if mode == "timed":
                new_until = time.time() + ALLOW_TTL
            elif mode == "always":
                new_until = None
            else:  # restore (undo)
                new_until = until
                if new_until is not None and new_until <= time.time():
                    return 200, {"domain": domain, "until": None, "previous": previous, "restored": False}
            self.client.set_allow(domain, make_comment(new_until), existing)
            log(f"pihole-dash: allow {domain} ({mode})")
            self.refresh()
            return 200, {"domain": domain, "until": new_until, "previous": previous, "created": existing is None}

    def remove(self, domain):
        with self.write_lock:
            existing = self.client.get_allow(domain)
            if not existing:
                return 404, {"error": "not_allowed"}
            managed, until = parse_tag(existing.get("comment"))
            if not managed:
                return 403, {"error": "not_managed", "message": "Added in the web admin; not removing it here."}
            self.client.delete_allow(domain)
            log(f"pihole-dash: removed allow {domain}")
            self.refresh()
            return 200, {"domain": domain, "previous": {"until": until}}


def expiry_loop(allows, stop):
    while not stop.is_set():
        try:
            allows.refresh()
        except Exception as err:
            log(f"pihole-dash: allow refresh failed: {type(err).__name__}")
        stop.wait(EXPIRY_CHECK_SECONDS)


def domain_info(client, allows, domain):
    """Facts for the domain sheet. Each part degrades on its own if a call fails."""
    out = {"domain": domain, "blocked_today": None, "total_today": None, "capped": False,
           "last_seen": None, "last_status": None, "reasons": [], "allow": None}
    lt = time.localtime()
    midnight = int(time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday, 0, 0, 0, 0, 0, -1)))
    q = urllib.parse.urlencode({"domain": domain, "from": midnight, "until": int(time.time()) + 60, "length": QUERY_SAMPLE})
    try:
        res = client.call("GET", f"/api/queries?{q}", timeout=10)
        rows = res.get("queries") or []
        out["total_today"] = res.get("recordsFiltered", len(rows))
        out["blocked_today"] = sum(1 for r in rows if r.get("status") in BLOCKED_STATUSES)
        out["capped"] = (res.get("recordsFiltered") or 0) > len(rows)
        if rows:
            latest = max(rows, key=lambda r: r.get("time") or 0)
            out["last_seen"], out["last_status"] = latest.get("time"), latest.get("status")
    except Exception as err:
        out["queries_error"] = type(err).__name__
    try:
        res = client.call("GET", f"/api/search/{urllib.parse.quote(domain, safe='')}", timeout=10)
        s = res.get("search") or {}
        for g in s.get("gravity") or []:
            if g.get("type") not in (None, "block"):
                continue
            # ABP lists report the rule itself, e.g. "||doubleclick.net^"; compare the bare domain.
            matched = re.sub(r"^\|\||\^$", "", g.get("domain") or domain)
            out["reasons"].append({"source": "list", "name": list_name(g.get("address"), g.get("comment")),
                                   "matched": matched, "wildcard": matched != domain})
        for e in s.get("domains") or []:
            if e.get("type") == "deny":
                out["reasons"].append({"source": "regex" if e.get("kind") == "regex" else "deny",
                                       "matched": e.get("domain"), "name": "your deny rule"})
            elif e.get("type") == "allow" and e.get("kind") == "exact" and e.get("domain") == domain:
                managed, until = parse_tag(e.get("comment"))
                out["allow"] = {"managed": managed, "until": until}
    except Exception as err:
        out["search_error"] = type(err).__name__
    return out


CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".woff2": "font/woff2", ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8", ".json": "application/json",
    ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".ttf": "font/ttf",
}


def make_handler(client, state, wake, allows):
    class Handler(BaseHTTPRequestHandler):
        server_version = "pihole-dash"
        sys_version = ""

        def log_message(self, fmt, *args):  # quiet: no per-request logs
            pass

        def _send(self, code, body, ctype="application/json"):
            if isinstance(body, (dict, list)):
                body = json.dumps(body).encode()
            elif isinstance(body, str):
                body = body.encode()
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", "default-src 'self'; style-src 'self'; script-src 'self'; font-src 'self'; img-src 'self' data:")
            self.end_headers()
            self.wfile.write(body)

        def _route(self):
            parsed = urllib.parse.urlsplit(self.path)
            return parsed.path, urllib.parse.parse_qs(parsed.query)

        def _guard(self):
            """Writes: only from the dashboard page itself."""
            origin = self.headers.get("Origin")
            if self.headers.get("X-Pihole-Dash") != "1" or (origin and origin not in ALLOWED_ORIGINS):
                self._send(403, {"error": "forbidden"})
                return False
            if client is None:
                self._send(503, {"error": "needs_setup"})
                return False
            return True

        def _json_body(self):
            n = int(self.headers.get("Content-Length") or 0)
            if n > 4096:
                raise ValueError("body too large")
            raw = self.rfile.read(n) if n else b""
            return json.loads(raw) if raw else {}

        def _fail(self, err):
            if isinstance(err, AuthRejected):
                return self._send(502, {"error": "auth_failed"})
            if isinstance(err, ApiError):
                return self._send(502, {"error": "pihole_error", "status": err.status, "key": err.key, "detail": err.detail})
            return self._send(502, {"error": "pihole_unreachable", "detail": type(err).__name__})

        def do_GET(self):
            path, qs = self._route()
            if path == "/healthz":
                return self._send(200, "ok", "text/plain")
            if path == "/api/state":
                return self._send(200, state.snapshot())
            if path == "/api/allowed":
                return self._send(200, {"allowed": state.snapshot()["allowed"], "now": time.time()})
            if path == "/api/domain":
                if client is None:
                    return self._send(503, {"error": "needs_setup"})
                domain = clean_domain((qs.get("domain") or [""])[0])
                if not domain:
                    return self._send(400, {"error": "invalid_domain"})
                try:
                    return self._send(200, domain_info(client, allows, domain))
                except Exception as err:
                    return self._fail(err)
            if path.startswith("/api/"):
                return self._send(404, {"error": "not found"})
            return self._static(path)

        def _static(self, path):
            rel = "index.html" if path in ("", "/") else path.lstrip("/")
            full = os.path.realpath(os.path.join(WWW_DIR, rel))
            if not full.startswith(WWW_DIR + os.sep) or not os.path.isfile(full):
                return self._send(404, "not found", "text/plain")
            ext = os.path.splitext(full)[1]
            with open(full, "rb") as fh:
                body = fh.read()
            self._send(200, body, CONTENT_TYPES.get(ext, "application/octet-stream"))

        def do_POST(self):
            path, _ = self._route()
            if path not in ("/api/pause", "/api/resume", "/api/allow"):
                return self._send(404, {"error": "not found"})
            if not self._guard():
                return
            if path == "/api/allow":
                try:
                    body = self._json_body()
                except ValueError:
                    return self._send(400, {"error": "bad_request"})
                domain = clean_domain(body.get("domain"))
                mode = body.get("mode")
                until = body.get("until")
                if not domain:
                    return self._send(400, {"error": "invalid_domain"})
                if mode not in ("timed", "always", "restore") or (until is not None and not isinstance(until, (int, float))):
                    return self._send(400, {"error": "bad_request"})
                try:
                    code, result = allows.allow(domain, mode, until)
                except Exception as err:
                    return self._fail(err)
                return self._send(code, result)
            body = {"blocking": False, "timer": PAUSE_SECONDS} if path == "/api/pause" else {"blocking": True, "timer": None}
            try:
                result = client.call("POST", "/api/dns/blocking", body)
            except Exception as err:
                return self._fail(err)
            wake.set()   # refresh the snapshot right away
            return self._send(200, {"blocking": result.get("blocking"), "timer": result.get("timer")})

        def do_DELETE(self):
            path, qs = self._route()
            if path != "/api/allow":
                return self._send(404, {"error": "not found"})
            if not self._guard():
                return
            domain = clean_domain((qs.get("domain") or [""])[0])
            if not domain:
                return self._send(400, {"error": "invalid_domain"})
            try:
                code, result = allows.remove(domain)
            except Exception as err:
                return self._fail(err)
            return self._send(code, result)

    return Handler


def main():
    password = read_app_password()
    state = State(needs_setup=password is None)
    client = PiholeClient(password) if password else None
    allows = Allows(client, state) if client else None
    stop, wake = threading.Event(), threading.Event()

    if client:
        threading.Thread(target=poller, args=(client, state, stop, wake), daemon=True).start()
        threading.Thread(target=expiry_loop, args=(allows, stop), daemon=True).start()
        if ALLOW_TTL != 3600 or EXPIRY_CHECK_SECONDS != 30:
            log(f"pihole-dash: TEST OVERRIDE active: allow ttl={ALLOW_TTL}s, expiry check={EXPIRY_CHECK_SECONDS}s")
    else:
        log("pihole-dash: no app password configured; serving 'needs setup' state")

    server = ThreadingHTTPServer((BIND, PORT), make_handler(client, state, wake, allows))

    def shutdown(*_):
        stop.set()
        wake.set()
        if client:
            client.logout()
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    log(f"pihole-dash: serving {WWW_DIR} on http://{BIND}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
