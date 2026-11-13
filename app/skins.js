// Dashboard designs. Each one draws the same model (built in app.js render()) its own way into #alt.
// Each design is laid out for an 800×480 touchscreen.
// Taps: [data-act=pause] pause/resume, [data-act=style] Style page, [data-act=allowed] Allowed page, [data-domain] domain sheet.
(() => {
  "use strict";
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v) => (typeof v === "number" ? Math.round(v).toLocaleString("en-US") : "–");
  const pct = (v) => (typeof v === "number" ? `${v.toFixed(1)}%` : "–");
  const D = () => window.dash || {};
  const resumeText = (m) => (m.button.mode === "resume-now" ? "Resume now" : "Resume blocking");
  const pauseText = (m) => (m.button.mode === "pause" ? "Pause 5 min" : resumeText(m));
  const q = (el, k) => el.querySelector(`[data-k="${k}"]`);
  function fit(el, minPx) {               // shrink a big number only when it doesn't fit its box
    el.style.fontSize = "";
    const max = parseFloat(getComputedStyle(el).fontSize);
    const avail = el.clientWidth, need = el.scrollWidth;
    if (avail > 0 && need > avail) el.style.fontSize = `${Math.max(minPx, Math.floor(max * (avail / need) * 0.98))}px`;
  }
  const ago = (m, it) => (D().fmtAgo ? D().fmtAgo(it.seen_at == null ? null : Math.max(0, m.now - it.seen_at)) : "");
  const short = (s) => s.replace(/ ago$/, "");
  const meta = (m) => { const d = m.data || {}, f = D(); return { temp: f.fmtTemp ? f.fmtTemp(d.cpu_temp, d.temp_unit) : "–", up: f.fmtUptime ? f.fmtUptime(d.uptime) : "–" }; };
  // Shared bits every design sets the same way.
  function common(el, m) {
    const a = q(el, "allowed");
    if (a) { a.hidden = !m.live; const n = a.querySelector(".n"); if (n) n.textContent = m.allowedCount ? ` ${m.allowedCount}` : ""; }
    const p = q(el, "pause"); if (p) { p.disabled = m.button.disabled; p.classList.toggle("resume", m.button.mode !== "pause"); }
  }
  const heroLabel = (m, normal) => (m.labelAlert || m.paused ? m.label : normal);

  // Live rates from the change between polls, falling back to the 24 h average when quiet or just started.
  function rateTracker() {
    let prev = null, rq = null, rb = null;
    return {
      update(m) {
        const d = m.data; if (!d || typeof d.total !== "number" || typeof d.blocked !== "number") return;
        if (!prev) { prev = { t: m.now, q: d.total, b: d.blocked }; return; }
        const dt = m.now - prev.t; if (dt < 1.5) return;
        const dq = d.total - prev.q, db = d.blocked - prev.b;
        if (dq >= 0 && db >= 0 && db <= dq) {   // 24 h counters can drop as old queries age out: skip those
          rq = rq == null ? dq / dt : rq + (dq / dt - rq) * 0.3;
          rb = rb == null ? db / dt : rb + (db / dt - rb) * 0.3;
        }
        prev = { t: m.now, q: d.total, b: d.blocked };
      },
      get(m) {
        const d = (m && m.data) || {};
        const aq = (d.total || 0) / 86400, ab = (d.blocked || 0) / 86400;
        const live = rq != null && rq > aq;
        return { q: live ? rq : aq, b: live ? rb : ab, live };
      },
    };
  }
  // Ticker items not seen on the previous render (the first render only remembers).
  function newsTracker() {
    let seen = null;
    return (items) => {
      const keys = items.map((i) => `${i.domain}|${i.seen_at}`);
      if (seen === null) { seen = new Set(keys); return []; }
      const out = items.filter((i) => !seen.has(`${i.domain}|${i.seen_at}`));
      seen = new Set(keys);
      return out.reverse();   // oldest first
    };
  }
  // Capped-fps animation loop. Draws nothing while the tab is hidden (rAF stops) or the screen sleeps (step returns early).
  function loop(step, fps) {
    let raf = 0, last = 0, on = true; const gap = 1000 / fps - 2;
    const tick = (t) => {
      if (!on) return; raf = requestAnimationFrame(tick);
      if (document.hidden || t - last < gap) return;
      const dt = Math.min(0.15, (t - (last || t)) / 1000); last = t; step(dt, t / 1000);
    };
    raf = requestAnimationFrame(tick);
    return () => { on = false; cancelAnimationFrame(raf); };
  }

  // ======================================================= MONOLITH
  const monolith = {
    mount(el) {
      el.innerHTML = `
        <div class="mo-top"><b class="mo-brand">Pi-hole</b><i class="mo-sep"></i><span class="mo-state" data-k="state"></span>
          <span class="mo-sp"></span><button class="mo-allowed" data-act="allowed" data-k="allowed" type="button">Allowed<span class="n num"></span></button>
          <button class="mo-style" data-act="style" type="button">Style</button></div>
        <div class="mo-hero"><div class="mo-lab" data-k="lab"></div><div class="mo-big num" data-k="blocked"></div></div>
        <div class="mo-stats"><div><div class="mo-v num" data-k="pct"></div><div class="mo-k">Blocked</div></div>
          <div><div class="mo-v num" data-k="total"></div><div class="mo-k">Queries - 24 h</div></div></div>
        <div class="mo-list fade"><div class="mo-lab">Just blocked</div><ol data-k="list"></ol></div>
        <div class="mo-act"><button class="mo-pause" data-act="pause" data-k="pause" type="button"></button></div>
        <div class="mo-foot num" data-k="meta"></div>`;
    },
    render(el, m) {
      const d = m.data || {}, mt = meta(m);
      const st = q(el, "state"); st.textContent = m.pill.text; st.className = `mo-state ${m.pill.cls}`;
      const lab = q(el, "lab"); lab.textContent = heroLabel(m, "Blocked - last 24 h"); lab.classList.toggle("alert", m.labelAlert); lab.classList.toggle("warn", m.paused && !m.labelAlert);
      q(el, "blocked").textContent = num(d.blocked); q(el, "pct").textContent = pct(d.percent_blocked); q(el, "total").textContent = num(d.total);
      q(el, "list").innerHTML = m.ticker.slice(0, 4).map((it) =>
        `<li data-domain="${esc(it.domain)}"><span class="d">${esc(it.domain)}</span><span class="t">${esc(short(ago(m, it)))}</span></li>`).join("")
        || '<li class="empty">Nothing blocked yet</li>';
      q(el, "pause").textContent = pauseText(m);
      q(el, "meta").textContent = `CPU ${mt.temp}  |  Up ${mt.up}`;
      common(el, m);
      fit(q(el, "blocked"), 56); fit(q(el, "pct"), 24); fit(q(el, "total"), 24);
    },
  };

  // ======================================================= SWISS
  const swiss = {
    mount(el) {
      el.innerHTML = `
        <div class="sw-top"><i class="sw-mark"></i><b class="sw-brand">Pi-hole</b><i class="sw-sep"></i><span class="sw-state" data-k="state"></span>
          <span class="sw-sp"></span><button class="sw-allowed" data-act="allowed" data-k="allowed" type="button">Allowed<span class="n num"></span></button>
          <button class="sw-style" data-act="style" type="button">Style</button></div>
        <div class="sw-a"><div class="sw-lab" data-k="lab"></div><div class="sw-big num" data-k="blocked"></div></div>
        <div class="sw-bc">
          <div class="sw-b"><div class="sw-lab">02 Share blocked</div><div class="sw-mid red num" data-k="pct"></div></div>
          <div class="sw-b"><div class="sw-lab">03 Queries, 24 h</div><div class="sw-mid num" data-k="total"></div></div>
        </div>
        <div class="sw-c fade"><div class="sw-lab">04 Just blocked</div><ol class="sw-list" data-k="list"></ol></div>
        <button class="sw-pause" data-act="pause" data-k="pause" type="button"></button>
        <div class="sw-foot num"><span data-k="temp"></span><span data-k="up"></span></div>`;
    },
    render(el, m) {
      const d = m.data || {}, mt = meta(m);
      const st = q(el, "state"); st.textContent = m.pill.text; st.className = `sw-state ${m.pill.cls}`;
      const lab = q(el, "lab"); lab.textContent = `01 ${heroLabel(m, "Blocked, last 24 h")}`; lab.classList.toggle("alert", m.labelAlert || m.paused);
      q(el, "blocked").textContent = num(d.blocked); q(el, "pct").textContent = pct(d.percent_blocked); q(el, "total").textContent = num(d.total);
      q(el, "list").innerHTML = m.ticker.slice(0, 3).map((it, i) =>
        `<li data-domain="${esc(it.domain)}"><span class="n">${String(i + 1).padStart(2, "0")}</span><span class="d">${esc(it.domain)}</span><span class="t">${esc(ago(m, it))}</span></li>`).join("")
        || '<li class="empty">Nothing blocked yet</li>';
      q(el, "pause").innerHTML = `<span>${pauseText(m)}</span><span class="arr">→</span>`;
      q(el, "temp").textContent = `CPU ${mt.temp}`; q(el, "up").textContent = `Up ${mt.up}`;
      common(el, m);
      fit(q(el, "blocked"), 56); fit(q(el, "pct"), 24); fit(q(el, "total"), 24);
    },
  };

  // ======================================================= BAUHAUS (no reference image; unchanged)
  const SHAPES = ["ci", "sq", "tr"];
  const bauhaus = {
    mount(el) {
      el.innerHTML = `
        <div class="bh-blue"><div class="bh-lab" data-k="lab"></div><div class="bh-big num" data-k="blocked"></div></div>
        <i class="bh-rule"></i>
        <div class="bh-circle" data-k="pie"><div class="bh-pct num" data-k="pct"></div><div class="bh-of num" data-k="of"></div></div>
        <button class="bh-yellow" data-act="pause" data-k="pause" type="button"></button>
        <div class="bh-col">
          <div class="bh-head"><b>Pi-hole</b><button class="bh-style" data-act="style" type="button" aria-label="Style"></button></div>
          <div class="bh-state" data-k="state"></div>
          <ol class="bh-list" data-k="list"></ol>
          <div class="bh-meta num" data-k="meta"></div>
        </div>`;
    },
    render(el, m) {
      const d = m.data || {}, mt = meta(m);
      q(el, "lab").textContent = m.labelAlert || m.paused ? m.label : "Blocked today";
      q(el, "blocked").textContent = num(d.blocked);
      q(el, "pct").textContent = typeof d.percent_blocked === "number" ? `${Math.round(d.percent_blocked)}%` : "–";
      q(el, "of").textContent = `of ${num(d.total)}`;
      const share = typeof d.percent_blocked === "number" ? Math.min(100, d.percent_blocked) : 0;
      q(el, "pie").style.background = `conic-gradient(var(--bh-ink) 0 ${share}%, var(--bh-red) ${share}% 100%)`;
      const st = q(el, "state"); st.textContent = m.pill.text; st.className = `bh-state ${m.pill.cls}`;
      q(el, "list").innerHTML = m.ticker.slice(0, 5).map((it, i) =>
        `<li data-domain="${esc(it.domain)}"><i class="sh ${SHAPES[i % 3]}"></i><span class="d">${esc(it.domain)}</span><span class="t">${esc(ago(m, it))}</span></li>`).join("")
        || '<li class="empty">Nothing blocked yet</li>';
      q(el, "meta").textContent = `CPU ${mt.temp} · up ${mt.up}`;
      const p = q(el, "pause"); p.disabled = m.button.disabled; p.classList.toggle("resume", m.button.mode !== "pause");
      p.innerHTML = m.button.mode === "pause" ? `<i class="bars"></i><span>Pause<br>5 min</span>` : `<i class="tri"></i><span>${m.button.mode === "resume-now" ? "Resume<br>now" : "Resume"}</span>`;
      fit(q(el, "blocked"), 48);
    },
  };

  // ======================================================= 5x7 glyphs (terminal block digits)
  const G = {
    0: ".###.#...##..###.#.###..##...#.###.", 1: "..#...##....#....#....#....#...###.", 2: ".###.#...#....#...#...#...#...#####",
    3: "####.....#....#.###.....#....#####.", 4: "...#...##..#.#.#..#.#####...#....#.", 5: "######....####.....#....##...#.###.",
    6: "..##..#...#....####.#...##...#.###.", 7: "#####....#...#...#...#....#....#...", 8: ".###.#...##...#.###.#...##...#.###.",
    9: ".###.#...##...#.####....#...#..##..", ",": "....................##....#...#....", ".": "..........................##...##..",
    "-": "...............#####...............", "–": "...............#####...............", " ": "...................................",
  };
  // Block-character number as SVG: each lit run in a glyph row is one bar, like a terminal's block font.
  function blockDigits(s) {
    const RH = 1.5; let rects = "", x = 0;
    const on = (g, r, c) => (c < 5 && g[r * 5 + c] === "#") || (c > 0 && c <= 5 && g[r * 5 + c - 1] === "#");   // bold: 6 wide
    for (const ch of s) {
      const g = G[ch] || G[" "];
      for (let r = 0; r < 7; r++) {
        let c = 0;
        while (c < 6) {
          if (on(g, r, c)) { const s0 = c; while (c < 6 && on(g, r, c)) c++; rects += `<rect x="${x + s0}" y="${(r * RH + 0.13).toFixed(2)}" width="${c - s0}" height="${(RH - 0.26).toFixed(2)}"/>`; }
          else c++;
        }
      }
      x += 7;
    }
    return `<svg viewBox="0 0 ${Math.max(1, x - 1)} ${7 * RH}" preserveAspectRatio="xMinYMid meet" aria-label="${esc(s)}">${rects}</svg>`;
  }

  // ======================================================= TERMINAL
  const SEG = 22;
  const tclock = (ts) => { if (ts == null) return "--:--:--"; const t = new Date(ts * 1000); return [t.getHours(), t.getMinutes(), t.getSeconds()].map((x) => String(x).padStart(2, "0")).join(":"); };
  const box = (cls, inner) => `<div class="tm-box ${cls}"><i class="c tl">+</i><i class="c tr">+</i><i class="c bl">+</i><i class="c br">+</i>${inner}</div>`;
  const terminal = {
    mount(el) {
      el.innerHTML = `
        <div class="tm-top"><span class="tm-title">&gt; pi-hole&nbsp;|&nbsp;status: <b data-k="state"></b></span><span class="tm-sp"></span>
          <button class="tm-btn" data-act="allowed" data-k="allowed" type="button">[allowed<span class="n"></span>]</button><button class="tm-btn" data-act="style" type="button">[style]</button></div>
        ${box("tm-a", `<div class="tm-lab" data-k="lab"></div><div class="tm-big" data-k="blocked"></div>`)}
        ${box("tm-b", `<div class="tm-lab">[ RATIO ]</div><div class="tm-pct" data-k="pct"></div><div class="tm-bar" data-k="bar"></div>`)}
        ${box("tm-c", `<div class="tm-lab">[ QUERIES 24H ]</div><div class="tm-q" data-k="total"></div>`)}
        ${box("tm-d fade", `<div class="tm-lab">[ TAIL -F BLOCKED ]</div><div class="tm-tail" data-k="list"></div>`)}
        <div class="tm-foot"><span data-k="meta"></span><button class="tm-pause" data-act="pause" data-k="pause" type="button"></button></div>`;
      q(el, "bar").innerHTML = "<i></i>".repeat(SEG);
    },
    render(el, m) {
      const d = m.data || {}, mt = meta(m);
      q(el, "state").textContent = m.pill.text.replace(" · ", " ").toUpperCase(); q(el, "state").className = m.pill.cls;
      const lab = q(el, "lab"); lab.textContent = m.labelAlert || m.paused ? `[ ${m.label.toUpperCase()} ]` : "[ BLOCKED 24H ]"; lab.classList.toggle("alert", m.labelAlert || m.paused);
      const big = num(d.blocked), bk = q(el, "blocked"); if (bk.dataset.v !== big) { bk.dataset.v = big; bk.innerHTML = blockDigits(big); }
      q(el, "pct").textContent = pct(d.percent_blocked);
      const share = typeof d.percent_blocked === "number" ? Math.min(100, d.percent_blocked) : 0, on = Math.round((share / 100) * SEG);
      q(el, "bar").querySelectorAll("i").forEach((s, i) => s.classList.toggle("on", i < on));
      q(el, "total").textContent = num(d.total);
      const rows = m.ticker.slice(0, 4);
      q(el, "list").innerHTML = rows.map((it, i) =>
        `<div class="row" data-domain="${esc(it.domain)}"><span class="ts">${tclock(it.seen_at)}</span><span class="bk">BLOCK</span><span class="d">${esc(it.domain)}</span>${i === rows.length - 1 ? '<span class="cur"></span>' : ""}</div>`).join("")
        || '<div class="row empty">waiting for blocks…<span class="cur"></span></div>';
      q(el, "meta").textContent = `cpu ${mt.temp} | up ${mt.up.replace(" ", "")}`;
      q(el, "pause").textContent = m.button.mode === "pause" ? "[ PAUSE 5m ]" : m.button.mode === "resume-now" ? "[ RESUME now ]" : "[ RESUME ]";
      common(el, m);
      const a = q(el, "allowed"); a.querySelector(".n").textContent = m.allowedCount ? ` ${m.allowedCount}` : "";
      fit(q(el, "pct"), 20); fit(q(el, "total"), 20);
    },
  };

  // ======================================================= 8-BIT  "Ad Shield" (original pixel art)
  const BUG = [   // a floating ad-jelly, two frames
    ["..#####..", ".#######.", "##.###.##", "#########", "#########", "#.#.#.#.#", "#.#.#.#.#", ".#.#.#.#."],
    ["..#####..", ".#######.", "##.###.##", "#########", "#########", ".#.#.#.#.", "#.#.#.#.#", "#...#...#"],
  ];
  const HOUSE = ["......#.....##..", ".....###....##..", "....#####...##..", "...#######......", "..#########.....", ".###########....", "#############...",
    ".WWWWWWWWWWW....", ".WWWWWWWWWWW....", ".WYYW.WWW.WW....", ".WYYW.WDW.WW....", ".WWWW.WDW.WW....", ".WWWWWWDWWWW...."];
  const ROBOT = ["..WW.....", ".WWWW..CC", ".W.CW.CC.", ".WWWWCC..", "..WWC....", ".WWWWW...", "WW.W.WW..", "W..W..W..", ".WWWWW...", ".CC.CC..."];
  const PAL = { "#": "#E8574F", W: "#F2F2F2", Y: "#F8C630", D: "#3A2A1A", C: "#27C4E8" };
  function sprite(ctx, rows, x, y, color) {
    for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) {
      const ch = rows[r][c]; if (ch === ".") continue;
      ctx.fillStyle = color || PAL[ch] || "#E8574F"; ctx.fillRect(x + c, y + r, 1, 1);
    }
  }
  const arcade = {
    mount(el) {
      el.innerHTML = `
        <div class="ar-top"><i class="ar-shield"></i><b class="ar-brand">AD SHIELD</b><span class="ar-state" data-k="state"></span><span class="ar-sp"></span>
          <button class="ar-btn" data-act="style" type="button">STYLE</button></div>
        <div class="ar-hud">
          <div><div class="ar-v y" data-k="blocked"></div><div class="ar-k" data-k="lab">BLOCKED - 24 H</div></div>
          <div><div class="ar-v" data-k="pct"></div><div class="ar-k">BLOCKED</div></div>
          <div><div class="ar-v" data-k="total"></div><div class="ar-k">QUERIES - 24 H</div></div>
        </div>
        <div class="ar-scene"><canvas class="ar-cv"></canvas></div>
        <div class="ar-box fade"><div class="ar-title">JUST BLOCKED</div><ol data-k="list"></ol></div>
        <div class="ar-foot"><button class="ar-pause" data-act="pause" data-k="pause" type="button"></button>
          <button class="ar-btn ar-allowed" data-act="allowed" data-k="allowed" type="button">ALLOWED<span class="n"></span></button>
          <i class="ar-vr"></i><span class="ar-meta"><span data-k="temp"></span><span data-k="up"></span></span></div>`;
      const cv = el.querySelector("canvas"), ctx = cv.getContext("2d"), host = el.querySelector(".ar-scene");
      const S = this.s = { m: null, rate: rateTracker(), news: newsTracker(), bombs: [], sparks: [], beams: [], flash: 0, acc: 0, stars: [], scale: 3, w: 136, h: 84 };
      const size = () => {
        const W = host.clientWidth, H = host.clientHeight; if (!W || !H) return;
        S.scale = Math.max(2, Math.floor(H / 60)); S.w = Math.floor(W / S.scale); S.h = Math.floor(H / S.scale);
        cv.width = S.w; cv.height = S.h; cv.style.width = `${S.w * S.scale}px`; cv.style.height = `${S.h * S.scale}px`;
        S.stars = Array.from({ length: Math.round(S.w * S.h / 200) }, () => ({ x: (Math.random() * S.w) | 0, y: (Math.random() * (S.h - 14)) | 0, p: Math.random() * 6 }));
      };
      size(); this.ro = new ResizeObserver(size); this.ro.observe(host);
      this.stop = loop((dt, t) => this.frame(ctx, dt, t), 15);
    },
    unmount() { if (this.stop) this.stop(); if (this.ro) this.ro.disconnect(); },
    render(el, m) {
      const S = this.s, d = m.data || {}, mt = meta(m); S.m = m; S.rate.update(m);
      for (let i = 0, n = S.news(m.ticker).length; i < n; i++) this.drop();
      const on = !m.paused && m.pill.cls === "ok";
      const st = q(el, "state"); st.textContent = on ? "SHIELD: ON" : m.paused ? "SHIELD: OFF" : "NO SIGNAL";
      st.className = `ar-state ${on ? "" : m.paused ? "warn" : "bad"}`;
      q(el, "blocked").textContent = typeof d.blocked === "number" ? String(Math.round(d.blocked)).padStart(6, "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",") : "------";
      q(el, "lab").textContent = m.labelAlert ? m.label.toUpperCase() : m.paused ? `PAUSED ${(m.pill.text.split("·")[1] || "").trim()}` : "BLOCKED - 24 H";
      q(el, "pct").textContent = pct(d.percent_blocked); q(el, "total").textContent = num(d.total);
      q(el, "list").innerHTML = m.ticker.slice(0, 3).map((it) =>
        `<li data-domain="${esc(it.domain)}"><span class="d">${esc(it.domain)}</span><span class="t">${esc(ago(m, it)).toUpperCase()}</span></li>`).join("")
        || '<li class="empty">ALL QUIET</li>';
      q(el, "pause").innerHTML = m.button.mode === "pause" ? '<i class="bars"></i>PAUSE 5 MIN' : `<i class="play"></i>${resumeText(m).toUpperCase()}`;
      q(el, "temp").textContent = `CPU ${mt.temp}`; q(el, "up").textContent = `UP ${mt.up}`;
      common(el, m);
      fit(q(el, "blocked"), 16); fit(q(el, "pct"), 16); fit(q(el, "total"), 16);
    },
    bugs(t) {   // three ad-jellies hovering over the dome
      const S = this.s, W = S.w;
      return [[0.2, 12], [0.47, 2], [0.73, 10]].map(([fx, y], i) => ({ x: Math.round(W * fx + Math.sin(t * 0.8 + i * 2) * 3), y: Math.round(y + Math.sin(t * 1.3 + i) * 1.5) }));
    },
    drop() { const S = this.s; const i = (Math.random() * 3) | 0; S.bombs.push({ i, dy: 0, v: 22 + Math.random() * 8 }); },
    frame(ctx, dt, t) {
      const S = this.s, m = S.m; if (!m || m.asleep) return;
      const W = S.w, H = S.h, gy = H - 5, cx = Math.round(W * 0.47), R = Math.min(Math.round(W * 0.4), gy - 20), on = !m.paused && m.pill.cls === "ok";
      if (!m.stale) {   // ads drop at a lively but bounded multiple of the real block rate
        const r = S.rate.get(m); S.acc += dt * Math.min(1.2, Math.max(0.25, r.b * 8));
        while (S.acc >= 1) { S.acc -= 1; this.drop(); }
      }
      ctx.fillStyle = "#0A0A1F"; ctx.fillRect(0, 0, W, H);
      for (const s of S.stars) { ctx.fillStyle = Math.sin(t * 1.4 + s.p) > 0.5 ? "#C9CCE8" : "#4A4E7A"; ctx.fillRect(s.x, s.y, 1, 1); }
      // ground
      for (let x = 0; x < W; x++) { ctx.fillStyle = (x >> 2) % 2 ? "#1E6FD9" : "#2B86F0"; ctx.fillRect(x, gy, 1, 2); ctx.fillStyle = "#123E80"; ctx.fillRect(x, gy + 2, 1, 2); }
      // house + defender robot inside the dome
      sprite(ctx, HOUSE.map((r) => r.replace(/#/g, "#")), cx + 2, gy - HOUSE.length, null);
      HOUSE.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c] === "#" && c > 11) { ctx.fillStyle = "#F2F2F2"; ctx.fillRect(cx + 2 + c, gy - HOUSE.length + r, 1, 1); } });
      sprite(ctx, ROBOT, cx - 26, gy - ROBOT.length, null);
      // shield dome: 2-pixel cyan arc
      if (on) {
        ctx.fillStyle = Math.sin(t * 2.3) > -0.93 ? "#27C4E8" : "#7FE3F7";
        for (let a = 0; a <= Math.PI; a += 0.9 / R) { const x = Math.round(cx + Math.cos(a) * R), y = Math.round(gy - Math.sin(a) * R); ctx.fillRect(x, y, 2, 2); }
      }
      // ad-jellies
      const bugs = this.bugs(t), fr = BUG[((t * 2) | 0) % 2];
      for (const b of bugs) sprite(ctx, fr, b.x - 4, b.y, "#E8574F");
      // falling ads (dotted trail) -> burst on the dome, or reach the house when the shield is down
      S.bombs = S.bombs.filter((bm) => {
        const b = bugs[bm.i]; bm.dy += bm.v * dt;
        const x = b.x, y = b.y + 9 + bm.dy;
        const hitDome = on && Math.hypot(x - cx, y - gy) >= R - 1 && Math.hypot(x - cx, y - gy) <= R + 2;
        if (hitDome || y >= gy - 1) {
          const n = hitDome ? 14 : 6;
          for (let k = 0; k < n; k++) S.sparks.push({ x, y, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.8) * 34, t: 0.5 + Math.random() * 0.3, c: k % 3 ? "#F8C630" : "#FF7A3C" });
          if (hitDome) { S.beams.push({ x, y, t: 0.2 }); S.flash = 0.25; }
          return false;
        }
        for (let k = 0; k < 3; k++) { ctx.fillStyle = k ? "#C98A1E" : "#F8C630"; const yy = Math.round(y - k * 3); if (yy > b.y + 8) ctx.fillRect(x, yy, 1, 2); }
        return true;
      });
      // the robot's beam towards each burst
      S.beams = S.beams.filter((z) => {
        z.t -= dt; const x0 = cx - 18, y0 = gy - 9, n = 14; ctx.fillStyle = "#27C4E8";
        for (let i = 0; i <= n; i += 2) ctx.fillRect(Math.round(x0 + (z.x - x0) * i / n), Math.round(y0 + (z.y - y0) * i / n), 1, 1);
        return z.t > 0;
      });
      S.sparks = S.sparks.filter((p) => { p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 50 * dt; ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); return p.t > 0; });
      if (S.flash > 0) { S.flash -= dt; ctx.fillStyle = "rgba(248,198,48,.08)"; ctx.fillRect(0, 0, W, H); }
      if (!on && Math.sin(t * 5) > 0) { ctx.fillStyle = "#E8574F"; ctx.fillRect(cx - 12, gy - R + 6, 24, 1); }
    },
  };

  // ======================================================= FLOW (queries stream through the gate; blocked ones fall as sparks)
  const TL = 60;   // time-lapse: one second on screen = one minute of traffic
  const ICON = {
    house: '<svg viewBox="0 0 24 24"><path d="M3 11 12 3l9 8M5 9.5V21h5v-6h4v6h5V9.5"/></svg>',
    laptop: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/></svg>',
    globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19M12 2.5c3 3 3 16 0 19M12 2.5c-3 3-3 16 0 19M4.5 6.5c4 2 11 2 15 0M4.5 17.5c4-2 11-2 15 0"/></svg>',
  };
  function glowSprite(rgb, r) {
    const c = document.createElement("canvas"); c.width = c.height = r * 2; const g = c.getContext("2d");
    const gr = g.createRadialGradient(r, r, 0, r, r, r); gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.3, `rgba(${rgb},.55)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2); return c;
  }
  const flow = {
    mount(el) {
      el.innerHTML = `
        <div class="fl-top"><b class="fl-brand">Pi-hole</b><span class="fl-state" data-k="state"></span><span class="fl-sp"></span>
          <button class="fl-pause" data-act="pause" data-k="pause" type="button"></button>
          <button class="fl-allowed" data-act="allowed" data-k="allowed" type="button">Allowed<span class="n num"></span></button>
          <button class="fl-style" data-act="style" type="button">Style</button></div>
        <div class="fl-hero"><div class="fl-lab" data-k="lab"></div><div class="fl-big num" data-k="blocked"></div><div class="fl-sub num" data-k="sub"></div></div>
        <div class="fl-stream"><canvas class="fl-cv"></canvas><i class="fl-ic h">${ICON.house}</i><i class="fl-ic l">${ICON.laptop}</i><i class="fl-ic g">${ICON.globe}</i></div>
        <div class="fl-card fade"><div class="fl-ct">Just blocked</div><ol data-k="list"></ol></div>
        <div class="fl-foot num" data-k="meta"></div>`;
      const cv = el.querySelector("canvas"), ctx = cv.getContext("2d"), host = el.querySelector(".fl-stream");
      const S = this.s = { m: null, rate: rateTracker(), news: newsTracker(), ps: [], sparks: [], acc: 0, W: 0, H: 0, dpr: 1, pulse: 0,
        teal: glowSprite("94,230,207", 6), orange: glowSprite("255,138,61", 7) };
      const size = () => { S.dpr = Math.min(2, window.devicePixelRatio || 1); S.W = host.clientWidth; S.H = host.clientHeight; cv.width = S.W * S.dpr; cv.height = S.H * S.dpr; };
      size(); this.ro = new ResizeObserver(size); this.ro.observe(host);
      this.stop = loop((dt, t) => this.frame(ctx, dt, t), 24);
    },
    unmount() { if (this.stop) this.stop(); if (this.ro) this.ro.disconnect(); },
    render(el, m) {
      const S = this.s, d = m.data || {}, mt = meta(m); S.m = m; S.rate.update(m);
      for (const it of S.news(m.ticker)) S.ps.push(this.particle(true, true));
      const st = q(el, "state"); st.textContent = m.pill.text; st.className = `fl-state ${m.pill.cls}`;
      const lab = q(el, "lab"); lab.textContent = heroLabel(m, "Blocked - last 24 h"); lab.classList.toggle("alert", m.labelAlert); lab.classList.toggle("warn", m.paused && !m.labelAlert);
      q(el, "blocked").textContent = num(d.blocked);
      q(el, "sub").textContent = `${pct(d.percent_blocked)} of ${num(d.total)} queries`;
      q(el, "list").innerHTML = m.ticker.slice(0, 5).map((it) =>
        `<li data-domain="${esc(it.domain)}"><div class="d">${esc(it.domain)}</div><div class="t">${esc(ago(m, it))}</div></li>`).join("")
        || '<li class="empty">Nothing blocked yet</li>';
      q(el, "pause").textContent = pauseText(m);
      q(el, "meta").textContent = `CPU ${mt.temp}  |  Up ${mt.up}`;
      common(el, m);
      fit(q(el, "blocked"), 48);
    },
    // path: from the house (lane 0) or laptop (lane 1) on the left, braided, through the gate, to the globe
    particle(blocked, big) {
      return { t: 0, v: 0.22 + Math.random() * 0.08, src: Math.random() < 0.5 ? 0 : 1, off: (Math.random() + Math.random() - 1) * 12, ph: Math.random() * 6.28, blocked, big: big || Math.random() < 0.06, a: 0.35 + Math.random() * 0.6 };
    },
    frame(ctx, dt, t) {
      const S = this.s, m = S.m; if (!m || m.asleep || !S.W) return;
      const W = S.W, H = S.H, x0 = 66, x1 = W - 70, gx = Math.round(W * 0.51), gyM = H * 0.42, on = !m.paused && m.pill.cls === "ok";
      const ys = [H * 0.26, H * 0.62], yg = H * 0.44;
      if (!m.stale) {
        const r = S.rate.get(m), rate = Math.min(130, Math.max(100, r.q * TL * 3)), pb = r.q > 0 ? Math.min(0.5, r.b / r.q) : 0;
        S.acc += dt * rate;
        while (S.acc >= 1) { S.acc -= 1; if (S.ps.length < 480) S.ps.push(this.particle(Math.random() < pb, false)); }
      }
      ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const gp = (gx - x0) / (x1 - x0);
      // particles
      S.ps = S.ps.filter((p) => {
        p.t += p.v * dt; if (p.t >= 1) return false;
        const x = x0 + (x1 - x0) * p.t;
        const y0 = ys[p.src], k = Math.min(1, p.t / gp);
        const base = y0 + (yg - y0) * (k * k * (3 - 2 * k));
        const wave = Math.sin(p.t * 11 + p.src * 2.6 + t * 0.6) * 12 * (p.t < gp ? 1 - k * 0.6 : 0.5);   // braided ribbons
        const spread = 0.6 + 0.4 * Math.sin(p.t * 6 + p.ph);
        const y = base + wave + p.off * spread;
        if (p.blocked && on && p.t >= gp) {
          S.sparks.push({ x: gx + 2, y, vx: 8 + Math.random() * 18, vy: 4 + Math.random() * 14, life: 1.8 + Math.random() * 0.8, big: p.big }); S.pulse = 0.5; return false;
        }
        ctx.globalAlpha = p.a * Math.min(1, p.t * 8) * Math.min(1, (1 - p.t) * 6);
        if (p.big) ctx.drawImage(p.blocked && !on ? S.orange : S.teal, x - 6, y - 6);
        ctx.fillStyle = p.blocked && !on ? "#FF8A3D" : p.t > gp ? "#7FF2DD" : "#5EE6CF"; ctx.fillRect(x - 1, y - 1, 2.4, 2.4);
        return true;
      });
      // sparks falling from the gate
      S.sparks = S.sparks.filter((s) => {
        s.life -= dt; if (s.life <= 0) return false;
        s.vy += 30 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
        ctx.globalAlpha = Math.min(1, s.life / 0.8);
        if (s.big) ctx.drawImage(S.orange, s.x - 7, s.y - 7);
        ctx.fillStyle = "#FF9A52"; ctx.fillRect(s.x - 1, s.y - 1, 2.5, 2.5);
        return true;
      });
      // the gate: glowing bar, brighter when it catches something
      S.pulse = Math.max(0, S.pulse - dt);
      ctx.globalAlpha = 1;
      const top = H * 0.1, bot = H * 0.86;
      const gr = ctx.createLinearGradient(gx - 9, 0, gx + 9, 0), c = on ? "94,230,207" : "242,181,68";
      gr.addColorStop(0, `rgba(${c},0)`); gr.addColorStop(0.5, `rgba(${c},${0.28 + S.pulse * 0.6})`); gr.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = gr; ctx.fillRect(gx - 9, top, 18, bot - top);
      ctx.fillStyle = on ? "#DFFFF8" : "rgba(242,181,68,.9)";
      if (on) ctx.fillRect(gx - 1, top, 3, bot - top);
      else for (let y = top; y < bot; y += 12) ctx.fillRect(gx - 1, y, 3, 6);
      ctx.globalAlpha = 1;
    },
  };

  // ======================================================= registry + picker thumbnails
  const T = (body) => `<svg viewBox="0 0 160 96" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${body}</svg>`;
  const LIST = [
    ["monolith", "Monolith", "One giant number", T('<rect width="160" height="96" fill="#0E0D0C"/><text x="8" y="14" font-size="9" font-weight="700" fill="#F3EFE8" font-family="Inter">Pi-hole</text><circle cx="52" cy="11" r="2.5" fill="#7BD88F"/><line x1="6" y1="20" x2="154" y2="20" stroke="#2E2B27"/><text x="6" y="54" font-size="30" font-weight="800" fill="#FF6A3D" font-family="Inter Tight" letter-spacing="-1">12,416</text><line x1="108" y1="26" x2="108" y2="58" stroke="#2E2B27"/><text x="114" y="38" font-size="9" font-weight="700" fill="#F3EFE8" font-family="Inter">21.3%</text><text x="114" y="54" font-size="9" font-weight="700" fill="#F3EFE8" font-family="Inter">58,246</text><line x1="6" y1="62" x2="154" y2="62" stroke="#2E2B27"/><rect x="8" y="68" width="60" height="2" fill="#5E5852"/><rect x="8" y="75" width="48" height="2" fill="#5E5852"/><rect x="8" y="82" width="54" height="2" fill="#5E5852"/><rect x="104" y="70" width="50" height="14" rx="3" fill="#FF6A3D"/>')],
    ["swiss", "Swiss", "Grid, rules, big type", T('<rect width="160" height="96" fill="#F2F0EA"/><rect x="6" y="5" width="8" height="8" fill="#E2231A"/><text x="18" y="12" font-size="9" font-weight="800" fill="#111" font-family="Inter">Pi-hole</text><text x="54" y="12" font-size="8" font-weight="700" fill="#E2231A" font-family="Inter">Blocking</text><rect x="0" y="17" width="160" height="1.5" fill="#111"/><text x="4" y="56" font-size="30" font-weight="800" fill="#111" font-family="Inter Tight" letter-spacing="-1.5">12,416</text><line x1="100" y1="17" x2="100" y2="84" stroke="#111"/><line x1="100" y1="40" x2="160" y2="40" stroke="#111"/><text x="104" y="34" font-size="12" font-weight="800" fill="#E2231A" font-family="Inter Tight">21.3%</text><text x="104" y="56" font-size="11" font-weight="800" fill="#111" font-family="Inter Tight">58,246</text><line x1="0" y1="62" x2="160" y2="62" stroke="#111"/><rect x="100" y="62" width="60" height="22" fill="#E2231A"/><line x1="0" y1="84" x2="160" y2="84" stroke="#111"/>')],
    ["bauhaus", "Bauhaus", "The circle is the blocked share", T('<rect width="160" height="96" fill="#EEE6D3"/><rect width="96" height="64" fill="#1D4F9B"/><text x="8" y="48" font-size="26" font-weight="900" fill="#fff" font-family="Inter">12,408</text><rect x="0" y="64" width="68" height="32" fill="#F4C21B"/><circle cx="96" cy="66" r="26" fill="#D52B1E"/><path d="M96 66 L96 40 A26 26 0 0 1 120 58 Z" fill="#141414"/><rect x="96" y="0" width="3" height="40" fill="#141414"/><circle cx="132" cy="18" r="4" fill="#D52B1E"/><rect x="128" y="28" width="8" height="8" fill="#1D4F9B"/><path d="M128 50 L136 50 L132 43 Z" fill="#141414"/>')],
    ["arcade", "8-bit", "The shield zaps the ads", T('<rect width="160" height="96" fill="#0A0A1F"/><rect x="0" y="14" width="160" height="1.5" fill="#27C4E8"/><rect x="6" y="5" width="40" height="5" fill="#F2F2F2"/><rect x="6" y="20" width="34" height="7" fill="#F8C630"/><rect x="62" y="20" width="26" height="7" fill="#F2F2F2"/><rect x="112" y="20" width="30" height="7" fill="#F2F2F2"/><rect x="0" y="32" width="160" height="1.5" fill="#27C4E8"/><path d="M14 82 A28 28 0 0 1 70 82" fill="none" stroke="#27C4E8" stroke-width="2"/><rect x="36" y="72" width="12" height="10" fill="#F2F2F2"/><path d="M34 72 l8 -7 l8 7z" fill="#E8574F"/><rect x="18" y="42" width="9" height="6" fill="#E8574F"/><rect x="40" y="37" width="9" height="6" fill="#E8574F"/><rect x="60" y="44" width="9" height="6" fill="#E8574F"/><rect x="6" y="82" width="74" height="2" fill="#2B86F0"/><rect x="92" y="40" width="62" height="44" rx="3" fill="none" stroke="#27C4E8" stroke-width="1.5"/><rect x="6" y="88" width="40" height="7" rx="2" fill="#F8C630"/>')],
    ["flow", "Flow", "Queries stream through the gate", T('<rect width="160" height="96" fill="#0C1722"/><rect x="4" y="4" width="152" height="14" rx="4" fill="#132230"/><text x="10" y="14" font-size="8" font-weight="700" fill="#E8EEF5" font-family="Inter">Pi-hole</text><text x="8" y="44" font-size="22" font-weight="800" fill="#F2F5F8" font-family="Inter Tight">12,416</text><g fill="#5EE6CF"><circle cx="16" cy="62" r="1"/><circle cx="24" cy="66" r="1"/><circle cx="32" cy="64" r="1"/><circle cx="40" cy="68" r="1"/><circle cx="20" cy="74" r="1"/><circle cx="30" cy="72" r="1"/><circle cx="58" cy="68" r="1"/><circle cx="66" cy="66" r="1"/><circle cx="74" cy="68" r="1"/></g><rect x="47" y="56" width="1.5" height="24" fill="#DFFFF8"/><g fill="#FF8A3D"><circle cx="50" cy="74" r="1.2"/><circle cx="53" cy="80" r="1.2"/><circle cx="51" cy="86" r="1.2"/></g><rect x="96" y="24" width="58" height="42" rx="5" fill="#16263A"/><rect x="96" y="72" width="58" height="14" rx="4" fill="#5EE6CF"/>')],
    ["terminal", "Terminal", "tail -f the blocks", T('<rect width="160" height="96" fill="#0A110C"/><g font-family="Menlo, monospace" font-size="7" fill="#84F0A0"><text x="5" y="10">&gt; pi-hole | status: BLOCKING</text></g><rect x="4" y="15" width="96" height="38" fill="none" stroke="#84F0A0" stroke-dasharray="2 2"/><g fill="#84F0A0"><rect x="10" y="26" width="10" height="3"/><rect x="12" y="31" width="6" height="3"/><rect x="12" y="36" width="6" height="3"/><rect x="10" y="41" width="10" height="3"/><rect x="24" y="26" width="12" height="3"/><rect x="32" y="31" width="4" height="3"/><rect x="24" y="36" width="12" height="3"/><rect x="24" y="41" width="12" height="3"/></g><rect x="104" y="15" width="52" height="38" fill="none" stroke="#84F0A0" stroke-dasharray="2 2"/><rect x="108" y="30" width="16" height="4" fill="#F5B85A"/><rect x="124" y="30" width="28" height="4" fill="#1F4A2C"/><rect x="4" y="57" width="152" height="24" fill="none" stroke="#84F0A0" stroke-dasharray="2 2"/><g font-family="Menlo, monospace" font-size="6"><text x="8" y="68" fill="#8AA894">14:02</text><text x="30" y="68" fill="#F5B85A">BLOCK</text><text x="54" y="68" fill="#84F0A0">ads.example</text></g><rect x="112" y="85" width="44" height="9" fill="none" stroke="#F5B85A"/>')],
  ];
  const SKINS = { monolith, swiss, bauhaus, arcade, flow, terminal };

  const root = document.getElementById("alt");
  let cur = null, last = null;
  root.addEventListener("click", (e) => {
    const a = e.target.closest("[data-act]");
    if (a) {
      if (a.disabled) return;
      if (a.dataset.act === "pause") D().act(); else if (a.dataset.act === "style") D().openStyle(); else if (a.dataset.act === "allowed" && D().openAllowed) D().openAllowed();
      return;
    }
    const dm = e.target.closest("[data-domain]");
    if (dm) D().openSheet(dm.dataset.domain);
  });
  // Shared helpers for designs in themes/*.js (each calls PiSkins.add before app.js runs).
  window.PiSkinKit = { esc, num, pct, D, resumeText, pauseText, q, fit, ago, short, meta, common, heroLabel, rateTracker, newsTracker, loop, glowSprite, blockDigits, T };
  window.PiSkins = {
    list: LIST,
    add(id, skin, name, desc, thumb) { SKINS[id] = skin; LIST.push([id, name, desc, thumb]); },
    use(id) {
      const next = SKINS[id] || null;
      if (cur && cur.unmount) cur.unmount();
      cur = next; root.innerHTML = ""; root.className = next ? `skin skin-${id}` : "";
      root.hidden = !next; document.body.classList.toggle("alt-on", !!next);
      if (next) { next.mount(root); if (last) next.render(root, last); }
    },
    render(m) {
      last = m;
      if (!cur) return;
      root.classList.toggle("paused", m.paused); root.classList.toggle("stale", m.stale);
      cur.render(root, m);
    },
  };
})();
