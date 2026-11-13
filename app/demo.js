// Demo mode: only when the page URL has ?demo (the live demo site uses it). The kiosk never does.
// Answers the dashboard's /api/* calls in the browser with made-up numbers, so every design runs
// without a Pi-hole. Pause, Resume and Allow all work, on fake data that resets on reload.
(() => {
  let on = false;
  try { on = new URLSearchParams(location.search).has("demo"); } catch { /* ignore */ }
  if (!on) return;
  document.documentElement.classList.add("demo");   // app.css shows the mouse cursor again (the kiosk hides it)

  const START = Date.now() / 1000 - 40;   // start with a full "just blocked" list
  const DOMAINS = ["ads.doubleclick.net", "graph.facebook.com", "app-measurement.com", "telemetry.sdk.inmobi.com",
    "pagead2.googlesyndication.com", "mobile.events.data.microsoft.com", "settings-win.data.microsoft.com",
    "tracking.example-analytics.com", "pixel.adsafeprotected.com", "metrics.icloud.com"];
  const ALLOW_TTL = 3600, PAUSE = 300;
  const S = { blocking: "enabled", until: null, allowed: new Map() };   // domain -> until (null = always)

  const now = () => Date.now() / 1000;
  const json = (code, body) => Promise.resolve(new Response(JSON.stringify(body), {
    status: code, headers: { "Content-Type": "application/json" } }));
  const allowedList = () => {
    const t = now();
    for (const [d, u] of S.allowed) if (u !== null && u <= t) S.allowed.delete(d);
    return [...S.allowed].map(([domain, until]) => ({ domain, until }));
  };

  function state() {
    const t = now(), run = t - START;
    if (S.until && t > S.until) { S.blocking = "enabled"; S.until = null; }
    const k = Math.floor(run / 5);   // a new blocked domain every 5 s
    const ticker = [];
    for (let j = k; j > Math.max(-1, k - 7); j--) ticker.push({ domain: DOMAINS[j % DOMAINS.length], seen_at: START + j * 5 });
    return {
      status: "ok", now: t, updated_at: t - 1,
      data: { blocked: 12408 + Math.floor(run * 0.8), total: 58211 + Math.floor(run * 3.5), percent_blocked: 21.3,
        blocking: S.blocking, timer: S.until ? Math.max(0, S.until - t) : null,
        cpu_temp: 48.2, temp_unit: "C", uptime: 302400 + Math.floor(run), gravity_size: 168734 },
      ticker, allowed: allowedList(), screen: { asleep: false },
    };
  }

  function domainInfo(d) {
    const a = S.allowed.has(d) ? { managed: true, until: S.allowed.get(d) } : null;
    const reg = d.split(".").slice(-2).join(".");
    return { domain: d, blocked_today: 37, total_today: 41, capped: false, last_seen: now() - 42, last_status: a ? "FORWARDED" : "GRAVITY",
      reasons: a ? [] : [{ source: "list", name: "StevenBlack/hosts", matched: reg, wildcard: reg !== d }], allow: a };
  }

  const real = window.fetch.bind(window);
  window.fetch = (input, opts = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    if (!url.pathname.startsWith("/api/")) return real(input, opts);
    const method = (opts.method || "GET").toUpperCase(), path = url.pathname, q = url.searchParams;
    const body = (() => { try { return opts.body ? JSON.parse(opts.body) : {}; } catch { return {}; } })();

    if (path === "/api/state") return json(200, state());
    if (path === "/api/allowed") return json(200, { allowed: allowedList(), now: now() });
    if (path === "/api/pause" && method === "POST") { S.blocking = "disabled"; S.until = now() + PAUSE; return json(200, { blocking: S.blocking, timer: PAUSE }); }
    if (path === "/api/resume" && method === "POST") { S.blocking = "enabled"; S.until = null; return json(200, { blocking: S.blocking, timer: null }); }
    if (path === "/api/domain") return json(200, domainInfo(q.get("domain") || ""));
    if (path === "/api/allow" && method === "POST") {
      const d = body.domain, prev = S.allowed.has(d) ? { until: S.allowed.get(d) } : null;
      const until = body.mode === "timed" ? now() + ALLOW_TTL : body.mode === "always" ? null : body.until;
      S.allowed.set(d, until);
      return json(200, { domain: d, until, previous: prev, created: !prev });
    }
    if (path === "/api/allow" && method === "DELETE") {
      const d = q.get("domain");
      if (!S.allowed.has(d)) return json(404, { error: "not_allowed" });
      const prev = { until: S.allowed.get(d) }; S.allowed.delete(d);
      return json(200, { domain: d, previous: prev });
    }
    return json(404, { error: "not found" });
  };
})();
