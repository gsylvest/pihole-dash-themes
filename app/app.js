// Pi-hole dashboard · direction A "Monolith".
// Talks only to the local pihole-dash backend (same origin). No secrets here.
(() => {
  "use strict";
  const POLL_MS = 2000;
  const STALE_AFTER_S = 15;        // data older than this counts as stale
  const FRESH_S = 15;              // ticker items newer than this get the accent colour
  const CACHE_KEY = "pihole-dash:last";

  const $ = (id) => document.getElementById(id);
  const fmtInt = (n) => (typeof n === "number" ? Math.round(n).toLocaleString("en-US") : "–");
  const fmtPct = (n) => (typeof n === "number" ? `${n.toFixed(1)}%` : "–");
  const fmtTemp = (t, u) => (typeof t === "number" ? `${Math.round(t)}°${u || "C"}` : "–");
  const fmtClock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  function fmtUptime(s) {
    if (typeof s !== "number") return "–";
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
  }
  function fmtAgo(s) {
    if (s == null) return "earlier";
    if (s < 5) return "now";
    if (s < 60) return `${Math.floor(s)}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  }

  const PAUSE_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
  const PLAY_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z"/></svg>';
  const buttons = [$("pauseBtn"), $("pauseBtn2")];

  let snap = null;             // last snapshot from the backend
  let clockOffset = 0;         // backend "now" minus local now
  let pauseDeadline = null;    // local ms when a timed pause ends
  let renderedKeys = new Set();
  let busy = false;
  let flash = null;            // {text, until}
  let shieldUp = false, shieldTimer = null;   // shield while asleep; drops on the next tap or 1.5 s after waking

  // Last good data survives a browser restart, so a dead Pi-hole still shows numbers (dimmed).
  function loadCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; } }
  function saveCache(s) { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data: s.data, updated_at: s.updated_at, ticker: s.ticker })); } catch { /* ignore */ } }

  const serverNow = () => Date.now() / 1000 + clockOffset;

  let pillState = { cls: "", text: "" }, btnState = { mode: "pause", disabled: true };   // read by the skins
  function setPill(cls, text) { const p = $("pill"); p.className = `pill ${cls}`; p.textContent = text; pillState = { cls, text }; }
  function setOverlay(title, html) {
    const o = $("overlay");
    if (!title) { o.hidden = true; return; }
    $("overlayTitle").textContent = title; $("overlayBody").innerHTML = html; o.hidden = false;
  }
  function setButtons(mode, disabled) {
    btnState = { mode, disabled: !!disabled };
    for (const b of buttons) {
      b.disabled = !!disabled;
      b.classList.toggle("busy", busy);
      b.classList.toggle("resume", mode !== "pause");
      b.innerHTML = mode === "pause" ? `${PAUSE_ICON}Pause 5 min` : `${PLAY_ICON}${mode === "resume-now" ? "Resume now" : "Resume blocking"}`;
      b.dataset.action = mode === "pause" ? "pause" : "resume";
    }
  }

  // Shrink a big number's font only when it doesn't fit its box; short numbers keep the CSS size.
  function fitText(el, minPx) {
    el.style.fontSize = "";                                   // back to the size the CSS gives it
    const max = parseFloat(getComputedStyle(el).fontSize);
    const avail = el.clientWidth, need = el.scrollWidth;
    if (avail > 0 && need > avail) {
      el.style.fontSize = `${Math.max(minPx, Math.floor(max * (avail / need) * 0.98))}px`;
    }
  }

  function renderNumbers(d) {
    const big = $("blocked");
    big.textContent = fmtInt(d && d.blocked);
    $("pct").textContent = fmtPct(d && d.percent_blocked);
    $("total").textContent = fmtInt(d && d.total);
    $("barFill").style.width = d && typeof d.percent_blocked === "number" ? `${Math.min(100, d.percent_blocked)}%` : "0";
    const temp = fmtTemp(d && d.cpu_temp, d && d.temp_unit), up = fmtUptime(d && d.uptime);
    $("temp").textContent = $("temp2").textContent = temp;
    $("uptime").textContent = $("uptime2").textContent = up;
    $("gravity").textContent = fmtInt(d && d.gravity_size);
    fitText(big, 48);
    fitText($("rateRow"), 16);   // % blocked + "of N queries" scale together
  }

  function renderTicker(items) {
    const ol = $("list");
    if (!items || !items.length) { ol.innerHTML = '<li class="empty">Nothing blocked yet</li>'; renderedKeys = new Set(); return; }
    const now = serverNow(), keys = new Set();
    ol.innerHTML = "";
    for (const it of items) {
      const key = `${it.domain}|${it.seen_at}`; keys.add(key);
      const age = it.seen_at == null ? null : Math.max(0, now - it.seen_at);
      const li = document.createElement("li");
      li.dataset.domain = it.domain;
      if (age != null && age < FRESH_S) li.classList.add("fresh");
      if (renderedKeys.size && !renderedKeys.has(key)) li.classList.add("new");
      const d = document.createElement("div"); d.className = "d"; d.textContent = it.domain;
      const t = document.createElement("div"); t.className = "t"; t.textContent = fmtAgo(age);
      li.append(d, t); ol.append(li);
    }
    renderedKeys = keys;
  }

  function render() {
    const s = snap;
    const cached = s && s.data ? s : loadCache();
    document.body.classList.remove("is-loading");
    let stale = false, paused = false, banner = "", overlay = null;

    if (flash && Date.now() < flash.until) banner = flash.text;

    if (!s) {                                   // backend itself unreachable
      setPill("bad", "Dashboard offline");
      stale = true;
      banner = banner || (cached && cached.updated_at ? `Dashboard service down · data from ${fmtAgo(serverNow() - cached.updated_at)}` : "Dashboard service down");
      setButtons("pause", true);
    } else if (s.status === "needs_setup") {
      setPill("", "Setup needed");
      overlay = ["Needs setup", "Add a Pi-hole <b>app password</b> to show live stats.<br>See “App password” in the README."];
      setButtons("pause", true);
    } else if (s.status === "auth_failed") {
      setPill("bad", "Not signed in");
      overlay = ["App password rejected", "Pi-hole didn’t accept the saved app password. Create a new one and save it again (README → “App password”)."];
      setButtons("pause", true);
    } else if (s.status === "starting") {
      setPill("", "Connecting…");
      setButtons("pause", true);
    } else {
      const d = s.data || {};
      const age = s.updated_at ? s.now - s.updated_at : Infinity;
      if (s.status === "offline" || age > STALE_AFTER_S) {
        stale = true;
        setPill("bad", "Pi-hole not responding");
        banner = banner || (s.updated_at ? `Can’t reach Pi-hole · data from ${fmtAgo(age)}` : "Can’t reach Pi-hole");
        setButtons("pause", true);
      } else if (d.blocking === "enabled") {
        setPill("ok", "Blocking");
        setButtons("pause", busy);
      } else if (d.blocking === "disabled") {
        paused = true;
        const left = pauseDeadline ? Math.max(0, (pauseDeadline - Date.now()) / 1000) : null;
        setPill("warn", left != null ? `Paused · ${fmtClock(left)}` : "Not blocking");
        setButtons(left != null ? "resume-now" : "resume", busy);
      } else {
        setPill("bad", "Blocking failed");
        setButtons("pause", busy);
      }
    }

    const shown = s && s.data ? s : cached;
    const hasData = !!(shown && shown.data);
    // Nothing to dim yet: say what's wrong instead of showing empty numbers.
    if (!overlay && !hasData) {
      if (!s) overlay = ["Dashboard service down", "It restarts by itself within a few seconds. If this stays, on the Pi run <code>sudo systemctl status pihole-dash</code>."];
      else if (stale) overlay = ["Can’t reach Pi-hole", "If the internet is down too, switch the Nest DNS back to <b>Automatic</b> (rollback: handoff doc §8)."];
      else if (s.status === "starting") overlay = ["Connecting to Pi-hole…", ""];
    }
    renderNumbers(shown && shown.data);
    renderTicker(shown && shown.ticker);
    const label = $("heroLabel"), alertText = overlay ? "" : banner;
    label.textContent = alertText || (paused ? "Blocking paused" : "Blocked · last 24 h");
    label.classList.toggle("alert", !!alertText);
    document.body.classList.toggle("is-paused", paused);
    document.body.classList.toggle("is-stale", stale && !overlay);
    setOverlay(overlay && overlay[0], overlay && overlay[1]);

    // Screen asleep: put up a shield so the waking tap doesn't hit a button; close open panels.
    const asleep = !!(s && s.screen && s.screen.asleep);
    if (asleep && !shieldUp) { shieldUp = true; closeSheet(); }
    if (asleep) { clearTimeout(shieldTimer); shieldTimer = null; }
    else if (shieldUp && !shieldTimer) shieldTimer = setTimeout(() => { shieldUp = false; shieldTimer = null; $("wakeShield").hidden = true; }, 1500);
    $("wakeShield").hidden = !shieldUp;

    const live = !!(s && s.status === "ok");
    const allowed = (s && s.allowed) || [];
    $("openAllowed").hidden = !live;
    $("allowedCount").textContent = allowed.length;
    if (!live) { closeSheet(); }
    tickSheetChip();
    renderAllowed();

    // Every design (skins.js) draws from this one model; the markup above is the fallback if skins.js fails.
    if (window.PiSkins) window.PiSkins.render({
      status: s ? s.status : "down", live, paused, stale, overlay: !!overlay,
      pill: pillState, label: label.textContent, labelAlert: !!alertText,
      data: shown && shown.data, ticker: (shown && shown.ticker) || [], button: btnState, busy,
      allowedCount: allowed.length, now: serverNow(), asleep,
    });
  }

  async function poll() {
    try {
      const r = await fetch("/api/state", { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      const s = await r.json();
      clockOffset = s.now - Date.now() / 1000;
      const d = s.data;
      pauseDeadline = d && d.blocking === "disabled" && typeof d.timer === "number" ? Date.now() + d.timer * 1000 : null;
      if (s.status === "ok" && d) saveCache(s);
      snap = s;
    } catch {
      snap = null;
    }
    render();
  }

  async function act(action) {
    if (busy) return;
    busy = true; render();
    try {
      const r = await fetch(`/api/${action}`, { method: "POST", headers: { "X-Pihole-Dash": "1" } });
      if (!r.ok) throw new Error(r.status);
    } catch {
      flash = { text: action === "pause" ? "Couldn’t pause blocking · try again" : "Couldn’t resume blocking · try again", until: Date.now() + 6000 };
    }
    busy = false;
    await poll();
  }


  // ===================== domain actions =====================
  const HOLD_MS = 1200;
  const TOAST_MS = 8000;
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TWO_LEVEL = /\.(co|com|org|net|ac|gov|ne|or)\.[a-z]{2}$/;
  function splitDomain(d) {
    const parts = d.split("."), keep = TWO_LEVEL.test(d) ? 3 : 2;
    return { sub: parts.slice(0, -keep).join("."), reg: parts.slice(-keep).join(".") };
  }
  const midTrim = (t, max) => (t.length <= max ? t : t.slice(0, Math.ceil(max / 2) - 1) + "…" + t.slice(-Math.floor(max / 2)));
  function domHTML(d) {
    const { sub, reg } = splitDomain(d);
    return (sub ? `<span class="sub">${esc(midTrim(sub, 34))}.</span>` : "") + `<span class="reg">${esc(reg)}</span>`;
  }
  function fmtLeft(sec) {
    if (sec >= 3600) return `${Math.floor(sec / 3600)} h ${Math.floor((sec % 3600) / 60)} min`;
    if (sec >= 60) return `${Math.ceil(sec / 60)} min`;
    return `${Math.max(0, Math.ceil(sec))} s`;
  }

  async function api(method, path, body) {
    const opts = { method, headers: { "X-Pihole-Dash": "1" } };
    if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    try {
      const r = await fetch(path, opts);
      let j = {}; try { j = await r.json(); } catch { /* empty */ }
      return { ok: r.ok, status: r.status, body: j };
    } catch {
      return { ok: false, status: 0, body: { error: "dashboard_unreachable" } };
    }
  }

  // --- press-and-hold button (a plain tap only nudges and says "Press and hold")
  function holdButton({ label, meta, cls, onConfirm }) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `hold ${cls || ""}`;
    b.innerHTML = `<span class="fill"></span><span class="lbl">${esc(label)}</span>${meta ? `<span class="meta">${esc(meta)}</span>` : ""}`;
    b.dataset.label = label;
    let t0 = 0, timer = null;
    b.addEventListener("pointerdown", (e) => {
      if (b.disabled) return;
      e.preventDefault(); t0 = Date.now(); b.classList.add("holding");
      timer = setTimeout(() => { timer = null; b.classList.remove("holding"); onConfirm(b); }, HOLD_MS);
    });
    const stop = () => {
      if (!timer) return;
      clearTimeout(timer); timer = null; b.classList.remove("holding");
      if (Date.now() - t0 < HOLD_MS) showHint(b);
    };
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => b.addEventListener(ev, stop));
    return b;
  }
  function showHint(b) {
    const lbl = b.querySelector(".lbl");
    lbl.textContent = "Press and hold"; b.classList.add("hinting");
    b.classList.remove("nudge"); void b.offsetWidth; b.classList.add("nudge");
    clearTimeout(b._ht); b._ht = setTimeout(() => { lbl.textContent = b.dataset.label; b.classList.remove("hinting"); }, 1600);
  }
  function setBusy(btn, on) { if (btn) btn.classList.toggle("busy", on); }

  // --- toast with one action (Undo / Retry), 8 s
  let toastTimer = null;
  function toast(html, action) {
    const t = $("toast"), btn = $("toastBtn");
    $("toastMsg").innerHTML = html;
    btn.hidden = !action;
    if (action) { btn.textContent = action.label; btn.onclick = () => { hideToast(); action.run(); }; }
    t.classList.remove("show"); void t.offsetWidth; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, TOAST_MS);
  }
  function hideToast() { $("toast").classList.remove("show"); clearTimeout(toastTimer); }

  // --- domain sheet
  let sheetDomain = null, sheetInfo = null, sheetSeq = 0, lastAction = null, sheetError = null;

  async function openSheet(d) {
    sheetDomain = d; sheetInfo = null; lastAction = null; sheetError = null;
    const seq = ++sheetSeq;
    renderSheet();
    document.body.classList.add("sheet-open");
    const r = await api("GET", `/api/domain?domain=${encodeURIComponent(d)}`);
    if (seq !== sheetSeq || sheetDomain !== d) return;
    sheetInfo = r.ok ? r.body : { failed: true };
    renderSheet();
  }
  async function reloadSheetInfo() {
    if (!sheetDomain) return;
    const d = sheetDomain, seq = ++sheetSeq;
    const r = await api("GET", `/api/domain?domain=${encodeURIComponent(d)}`);
    if (seq === sheetSeq && sheetDomain === d && r.ok) { sheetInfo = r.body; renderSheet(); }
  }
  function closeSheet() {
    if (!sheetDomain) return;
    sheetDomain = null; sheetSeq++;
    document.body.classList.remove("sheet-open");
  }

  function sheetAllow() {
    // Prefer the live allowed list (it updates every poll) over the one-off lookup.
    const live = ((snap && snap.allowed) || []).find((e) => e.domain === sheetDomain);
    if (live) return { managed: true, until: live.until };
    return sheetInfo && sheetInfo.allow;
  }
  function chipHTML() {
    const a = sheetAllow();
    if (!a) return '<span class="chip">Blocked</span>';
    if (!a.managed) return '<span class="chip allowed">Allowed in web admin</span>';
    if (a.until == null) return '<span class="chip allowed">Always allowed</span>';
    return `<span class="chip allowed">Allowed · ${fmtLeft(a.until - serverNow())} left</span>`;
  }
  function tickSheetChip() { if (sheetDomain) $("sheetChip").innerHTML = chipHTML(); }

  function whyHTML() {
    const info = sheetInfo, why = $("sheetWhy");
    why.className = "why"; why.hidden = false;
    if (!info) return "Checking the lists…";
    if (info.failed) return "Couldn’t load details from Pi-hole.";
    const reasons = info.reasons || [];
    const more = reasons.length > 1 ? ` <span>(+${reasons.length - 1} more)</span>` : "";
    const r0 = reasons[0];
    if (!r0) return sheetAllow() ? "Not blocked right now: it’s on the allow list." : "Not on any blocklist right now.";
    if (r0.source === "list" && r0.wildcard) {
      why.classList.add("special");
      return `<b>${esc(r0.name)}</b> blocks all of <b>*.${esc(r0.matched)}</b>. Allowing unblocks only this exact name.${more}`;
    }
    if (r0.source === "regex") {
      why.classList.add("special");
      return `Matched your regex rule <b>${esc(r0.matched)}</b>. Allowing unblocks only this exact name.${more}`;
    }
    if (r0.source === "deny") return `On your deny list (web admin).${more}`;
    return `Blocked by <b>${esc(r0.name)}</b> · exact match${more}`;
  }

  function renderSheet() {
    const d = sheetDomain;
    if (!d) return;
    const info = sheetInfo;
    $("sheetChip").innerHTML = chipHTML();
    $("sheetDom").innerHTML = domHTML(d);
    const now = serverNow();
    const blocked = !info || info.failed || info.blocked_today == null ? "–" : `${fmtInt(info.blocked_today)}${info.capped ? "+" : ""}×`;
    const seen = !info || info.failed || !info.last_seen ? "–" : fmtAgo(now - info.last_seen);
    $("sheetStats").innerHTML = `<div><div class="v">${blocked}</div><div class="k">blocked today</div></div><div><div class="v">${seen}</div><div class="k">last seen</div></div>`;
    $("sheetWhy").innerHTML = whyHTML();

    const a = $("sheetActions");
    a.innerHTML = "";
    const err = document.createElement("div");
    err.className = "error"; err.id = "sheetErr";
    err.innerHTML = '<span id="sheetErrText"></span><button type="button" id="sheetRetry">Retry</button>';
    a.append(err);
    const allow = sheetAllow();
    if (allow && !allow.managed) {
      $("sheetWhy").innerHTML = "Allowed in the web admin. Change it there; this screen only manages its own entries.";
      return;
    }
    if (allow && allow.until == null) {
      a.append(holdButton({ label: "Remove allow", cls: "danger solo", onConfirm: (b) => removeAllow(d, b, true) }));
    } else if (allow) {
      a.append(holdButton({ label: "Extend to 1 hour", cls: "primary", onConfirm: (b) => allowDomain(d, "timed", b) }));
      a.append(holdButton({ label: "Always allow", onConfirm: (b) => allowDomain(d, "always", b) }));
    } else {
      a.append(holdButton({ label: "Allow for 1 hour", meta: "recommended", cls: "primary", onConfirm: (b) => allowDomain(d, "timed", b) }));
      a.append(holdButton({ label: "Always allow", onConfirm: (b) => allowDomain(d, "always", b) }));
    }
    $("sheetRetry").onclick = () => { if (lastAction) { sheetError = null; renderSheet(); lastAction(); } };
    if (sheetError) {             // survives re-renders (e.g. after the info reload)
      $("sheetErrText").textContent = sheetError;
      $("sheetWhy").hidden = true;
      err.classList.add("show");
    }
  }
  function showSheetError(text) { sheetError = text; renderSheet(); }

  function failText(r, verb) {
    if (r.status === 0) return `The dashboard service didn’t answer, so nothing changed.`;
    if (r.body && r.body.error === "allowed_elsewhere") return "Already allowed in the web admin; nothing changed.";
    if (r.body && r.body.error === "not_managed") return "Added in the web admin; remove it there.";
    if (r.body && r.body.error === "not_allowed") return "It wasn’t on the allow list any more.";
    return `Pi-hole didn’t save that, so nothing changed. ${verb}`;
  }

  async function allowDomain(d, mode, btn) {
    lastAction = () => allowDomain(d, mode, null);
    setBusy(btn, true);
    const r = await api("POST", "/api/allow", { domain: d, mode, until: null });
    setBusy(btn, false);
    if (!r.ok) {
      if (sheetDomain === d) { showSheetError(failText(r, "It’s still blocked.")); reloadSheetInfo(); }
      else toast(`Couldn’t allow <b>${esc(d)}</b>`, { label: "Retry", run: () => allowDomain(d, mode, null) });
      return;
    }
    const prev = r.body.previous;
    closeSheet();
    const what = mode === "always" ? `Always allowing <b>${esc(d)}</b>` : prev ? `Extended <b>${esc(d)}</b> to 1 h` : `Allowed <b>${esc(d)}</b> for 1 h`;
    toast(what, { label: "Undo", run: () => undoAllow(d, prev) });
    poll();
  }
  async function undoAllow(d, prev) {
    const r = prev ? await api("POST", "/api/allow", { domain: d, mode: "restore", until: prev.until })
                   : await api("DELETE", `/api/allow?domain=${encodeURIComponent(d)}`);
    if (r.ok || r.body.error === "not_allowed") toast(prev ? `Undone · <b>${esc(d)}</b> back as it was` : `Undone · <b>${esc(d)}</b> blocked again`);
    else toast(`Couldn’t undo · <b>${esc(d)}</b> is still allowed`, { label: "Retry", run: () => undoAllow(d, prev) });
    poll();
  }
  async function removeAllow(d, btn, fromSheet) {
    if (fromSheet) lastAction = () => removeAllow(d, null, true);
    setBusy(btn, true);
    const r = await api("DELETE", `/api/allow?domain=${encodeURIComponent(d)}`);
    setBusy(btn, false);
    if (!r.ok && r.body.error !== "not_allowed") {
      if (fromSheet && sheetDomain === d) showSheetError(failText(r, "It’s still allowed."));
      else toast(`Couldn’t remove <b>${esc(d)}</b>`, { label: "Retry", run: () => removeAllow(d, null, false) });
      return;
    }
    if (fromSheet) closeSheet();
    const prev = r.body.previous;
    toast(`Removed <b>${esc(d)}</b> · blocked again`, prev ? { label: "Undo", run: () => restoreAllow(d, prev) } : null);
    poll();
  }
  async function restoreAllow(d, prev) {
    const r = await api("POST", "/api/allow", { domain: d, mode: "restore", until: prev.until });
    if (r.ok) toast(`Undone · <b>${esc(d)}</b> allowed again`);
    else toast(`Couldn’t undo · <b>${esc(d)}</b> stays blocked`, { label: "Retry", run: () => restoreAllow(d, prev) });
    poll();
  }

  // --- recently allowed page (rows rebuilt only when the set changes, so holds aren't interrupted)
  let rowsKey = "";
  const RING_C = 2 * Math.PI * 20;
  function renderAllowed() {
    if (!document.body.classList.contains("page-allowed")) return;
    const list = (snap && snap.allowed) || [];
    const key = list.map((e) => `${e.domain}|${e.until}`).join(",");
    const rows = $("rows");
    if (key !== rowsKey) {
      rowsKey = key;
      rows.innerHTML = list.length ? "" : '<li class="empty">Nothing allowed from this screen.</li>';
      for (const e of list) {
        const li = document.createElement("li");
        li.dataset.until = e.until == null ? "" : e.until;
        const icon = e.until == null ? '<div class="always">∞</div>'
          : `<svg class="ring" viewBox="0 0 48 48"><circle class="t" cx="24" cy="24" r="20"/><circle class="a" cx="24" cy="24" r="20" stroke-dasharray="${RING_C}"/></svg>`;
        const added = e.added ? ` · added ${fmtAgo(serverNow() - e.added)}` : "";
        li.innerHTML = `${icon}<div style="min-width:0"><div class="d">${esc(e.domain)}</div><div class="s">${e.until == null ? `Always allowed${added}` : 'Allowed for 1 h · <span class="num left"></span> left'}</div></div>`;
        li.append(holdButton({ label: "Remove", cls: "danger row-btn", onConfirm: (b) => removeAllow(e.domain, b, false) }));
        rows.append(li);
      }
    }
    const now = serverNow();
    rows.querySelectorAll("li[data-until]").forEach((li) => {
      if (!li.dataset.until) return;
      const left = Math.max(0, Number(li.dataset.until) - now);
      const span = li.querySelector(".left"); if (span) span.textContent = fmtClock(left);
      const a = li.querySelector(".ring .a"); if (a) a.style.strokeDashoffset = RING_C * (1 - Math.min(1, left / 3600));
    });
  }
  function openAllowed() { closeSheet(); rowsKey = ""; document.body.classList.add("page-allowed"); renderAllowed(); }
  function closeAllowed() { document.body.classList.remove("page-allowed"); }

  $("list").addEventListener("click", (e) => {
    const li = e.target.closest("li[data-domain]");
    if (li && snap && snap.status === "ok") openSheet(li.dataset.domain);
  });
  $("sheetClose").addEventListener("click", closeSheet);
  $("scrim").addEventListener("click", closeSheet);
  $("openAllowed").addEventListener("click", openAllowed);
  $("back").addEventListener("click", closeAllowed);

  // --- style picker (theme.js applied the saved one before paint)
  const THEME_KEY = "pihole-dash:theme";
  function renderStyles() {
    const cur = document.documentElement.dataset.theme;
    $("styles").innerHTML = (window.PiSkins ? window.PiSkins.list : []).map(([id, name, desc, thumb]) =>
      `<button class="swatch${id === cur ? " on" : ""}" type="button" data-theme="${id}">${thumb}<div class="nm">${name}</div><div class="ds">${desc}</div></button>`).join("");
  }
  function setTheme(id) {
    document.documentElement.dataset.theme = id;
    try { localStorage.setItem(THEME_KEY, id); } catch { /* ignore */ }
    if (window.PiSkins) window.PiSkins.use(id);
    renderStyles();
    render();   // refit numbers and redraw the new design straight away
  }
  function openStyle() { closeSheet(); closeAllowed(); renderStyles(); document.body.classList.add("page-style"); }
  // what the skins may call
  window.dash = {
    act: () => { if (!btnState.disabled) act(btnState.mode === "pause" ? "pause" : "resume"); },
    openSheet: (d) => { if (snap && snap.status === "ok") openSheet(d); },
    openAllowed: () => { if (snap && snap.status === "ok") openAllowed(); },
    openStyle, fmtAgo, fmtUptime, fmtTemp, fmtClock,
  };
  if (window.PiSkins) window.PiSkins.use(document.documentElement.dataset.theme);
  $("openStyle").addEventListener("click", openStyle);
  $("styleBack").addEventListener("click", () => document.body.classList.remove("page-style"));
  $("styles").addEventListener("click", (e) => {
    if (dragScrolled) { dragScrolled = false; e.preventDefault(); return; }   // a drag isn't a pick
    const t = e.target.closest(".swatch");
    if (!t) return;
    setTheme(t.dataset.theme);
    // back to the home screen with the new design; a short beat so the tick shows on the chosen card
    setTimeout(() => document.body.classList.remove("page-style"), 220);
  });
  // Drag-to-scroll: the Pi's compositor (labwc mouseEmulation="yes") turns finger drags into mouse
  // drags, which browsers don't scroll. Scroll by hand so a swipe works there, and on real touch too.
  let dragScrolled = false;
  (() => {
    const el = $("styles"); let id = null, y0 = 0, s0 = 0;
    el.addEventListener("pointerdown", (e) => { if (e.pointerType === "touch") return; id = e.pointerId; y0 = e.clientY; s0 = el.scrollTop; dragScrolled = false; });
    el.addEventListener("pointermove", (e) => {
      if (e.pointerId !== id) return;
      const dy = e.clientY - y0;
      if (!dragScrolled && Math.abs(dy) < 8) return;               // small wobble still counts as a tap
      dragScrolled = true; el.scrollTop = s0 - dy;
    });
    const end = (e) => { if (e.pointerId === id) id = null; };
    ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => el.addEventListener(ev, end));
  })();

  for (const b of buttons) b.addEventListener("click", () => act(b.dataset.action || "pause"));
  // The waking tap lands here and is swallowed; the screen is already on by then (the screen-sleep helper, if you run one, saw the touch).
  $("wakeShield").addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); shieldUp = false; $("wakeShield").hidden = true; });
  document.addEventListener("contextmenu", (e) => e.preventDefault());   // no long-press menu on touch

  setButtons("pause", true);
  poll();
  setInterval(poll, POLL_MS);
  setInterval(render, 1000);   // countdown + "ago" labels between polls
})();
