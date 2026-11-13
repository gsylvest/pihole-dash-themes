// SONAR: a submarine sonar scope. Mint sweep turns over a pre-rendered grid; each newly blocked domain
// becomes an amber contact that lights when the sweep passes it, then fades. Pausing stops the sweep and
// surfaces the countdown. Static grid on its own canvas (drawn once per resize); the sweep wedge is a
// pre-rendered image rotated with one drawImage per frame. 20 fps cap.
(() => {
  "use strict";
  const K = window.PiSkinKit;
  const MINT = "110,245,192", AMBER = "255,168,46";
  const PERIOD = 4.5;          // seconds per sweep revolution
  const TRAIL = 0.85;          // radians of fading wedge behind the beam
  const TAU = Math.PI * 2;
  const norm = (a) => ((a % TAU) + TAU) % TAU;
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rng = (seed) => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const countdown = (m) => (m.pill.text.split("·")[1] || "").trim();

  // ---- pre-rendered art
  function drawGrid(c, W, H, cx, cy, R, dpr) {
    c.width = W * dpr; c.height = H * dpr;
    const g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // scope face: faint glow toward the centre
    const face = g.createRadialGradient(cx, cy, 0, cx, cy, R);
    face.addColorStop(0, "#08222A"); face.addColorStop(0.75, "#061821"); face.addColorStop(1, "#05121B");
    g.fillStyle = face; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
    g.save(); g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.clip();
    g.lineWidth = 1;
    // range rings
    const N = 12;
    for (let i = 1; i < N; i++) {
      g.strokeStyle = `rgba(${MINT},${i % 3 === 0 ? 0.17 : 0.09})`;
      g.beginPath(); g.arc(cx, cy, (R * i) / N, 0, TAU); g.stroke();
    }
    // radial grid, every 10 degrees
    for (let a = 0; a < 360; a += 10) {
      if (a % 90 === 0) continue;
      const r = (a * Math.PI) / 180, r0 = R / N;
      g.strokeStyle = `rgba(${MINT},${a % 30 === 0 ? 0.12 : 0.065})`;
      g.beginPath(); g.moveTo(cx + Math.cos(r) * r0, cy + Math.sin(r) * r0); g.lineTo(cx + Math.cos(r) * R, cy + Math.sin(r) * R); g.stroke();
    }
    // crosshair
    g.strokeStyle = `rgba(${MINT},.42)`;
    g.beginPath(); g.moveTo(cx - R, cy + 0.5); g.lineTo(cx + R, cy + 0.5); g.moveTo(cx + 0.5, cy - R); g.lineTo(cx + 0.5, cy + R); g.stroke();
    g.restore();
    // bezel: bright rim with inward ticks
    g.strokeStyle = `rgba(${MINT},.95)`; g.lineWidth = 2;
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
    g.lineWidth = 1;
    for (let i = 0; i < 240; i++) {
      const a = (i / 240) * TAU, major = i % 10 === 0, mid = i % 5 === 0;
      const len = major ? 14 : mid ? 9 : 5;
      g.strokeStyle = `rgba(${MINT},${major ? 0.9 : 0.55})`;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * (R - len), cy + Math.sin(a) * (R - len)); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.stroke();
    }
    // heading mark at 090 (east) and centre cross
    g.fillStyle = `rgb(${MINT})`; g.fillRect(cx + R - 30, cy - 1.5, 30, 3);
    g.fillStyle = "#DFFFF1"; g.fillRect(cx - 6, cy - 0.5, 12, 1.5); g.fillRect(cx - 0.5, cy - 6, 1.5, 12);
  }

  // Wedge with its leading edge along +x, trail toward negative angles (the beam turns clockwise on screen).
  function makeWedge(R, dpr) {
    const oy = Math.ceil(R * Math.sin(TRAIL)) + 6, w = Math.ceil(R) + 4, h = oy + 6;
    const c = document.createElement("canvas"); c.width = w * dpr; c.height = h * dpr;
    const g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.translate(0, oy);
    if (g.createConicGradient) {   // smooth trail: conic fade by angle, then a radial mask brighter toward the rim
      const cg = g.createConicGradient(0, 0, 0);
      cg.addColorStop(0, `rgba(${MINT},0)`); cg.addColorStop(1 - TRAIL / TAU, `rgba(${MINT},0)`); cg.addColorStop(1 - 0.45 * TRAIL / TAU, `rgba(${MINT},.12)`); cg.addColorStop(1 - 0.12 * TRAIL / TAU, `rgba(${MINT},.36)`); cg.addColorStop(1, `rgba(${MINT},.85)`);
      g.fillStyle = cg; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R - 1, -TRAIL, 0); g.closePath(); g.fill();
      // (conic stops run clockwise from +x, so the trail behind the beam sits just below offset 1)
      const mask = g.createRadialGradient(0, 0, 0, 0, 0, R);
      mask.addColorStop(0, "rgba(0,0,0,.35)"); mask.addColorStop(0.55, "rgba(0,0,0,.8)"); mask.addColorStop(1, "rgba(0,0,0,1)");
      g.globalCompositeOperation = "destination-in"; g.fillStyle = mask; g.fillRect(0, -oy, w, h);
      g.globalCompositeOperation = "source-over";
    } else {
      const rad = g.createRadialGradient(0, 0, 0, 0, 0, R);
      rad.addColorStop(0, `rgba(${MINT},.25)`); rad.addColorStop(0.6, `rgba(${MINT},.7)`); rad.addColorStop(1, `rgba(${MINT},1)`);
      g.fillStyle = rad;
      const n = 90;
      for (let i = 0; i < n; i++) {
        const a0 = -TRAIL * (i / n), a1 = -TRAIL * ((i + 1) / n), k = 1 - i / n;
        g.globalAlpha = 0.5 * k * k * k;
        g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R - 1, a1, a0 + 0.004); g.closePath(); g.fill();
      }
    }
    g.globalAlpha = 1;
    g.lineCap = "round";
    g.strokeStyle = `rgba(${MINT},.25)`; g.lineWidth = 7; g.beginPath(); g.moveTo(0, 0); g.lineTo(R - 2, 0); g.stroke();
    g.strokeStyle = "#B8FFE0"; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(R - 1, 0); g.stroke();
    return { c, oy, w, h };
  }

  // Amber contact with a short wake trailing to the lower left.
  function makeBlip(rgb, r, wake, core) {
    const s = r * 2 + wake, c = document.createElement("canvas"); c.width = c.height = s;
    const g = c.getContext("2d"), x = s - r, y = r;
    for (let i = wake; i > 0; i -= 1) {
      const k = i / wake; g.fillStyle = `rgba(${rgb},${0.3 * (1 - k)})`;
      g.beginPath(); g.arc(x - i * 0.92, y + i * 0.4, 3.2 * (1 - k * 0.6), 0, TAU); g.fill();
    }
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${rgb},.85)`); gr.addColorStop(0.4, `rgba(${rgb},.3)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    g.fillStyle = `rgb(${rgb})`; g.beginPath(); g.arc(x, y, core, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,248,230,.85)"; g.beginPath(); g.arc(x - 0.6, y - 0.6, core * 0.4, 0, TAU); g.fill();
    return { c, x, y };
  }

  const skin = {
    mount(el) {
      el.innerHTML = `
        <div class="so-scope"><canvas class="so-grid"></canvas><canvas class="so-cv"></canvas><div class="so-labels fade"></div></div>
        <div class="so-tag">Sonar<span>pi-hole</span></div>
        <div class="so-hold" aria-live="polite"><div class="so-hk">Sweep stopped</div><div class="so-hv" data-k="cd"></div><div class="so-hk" data-k="hl">Blocking paused</div></div>
        <div class="so-top"><button class="so-allowed" data-act="allowed" data-k="allowed" type="button">Allowed<span class="n"></span></button>
          <button class="so-style" data-act="style" type="button"><span>Style</span></button></div>
        <div class="so-col fade">
          <div class="so-state" data-k="state"></div>
          <div class="so-stat"><div class="so-v" data-k="blocked"></div><div class="so-k" data-k="lab">Blocked / 24h</div></div>
          <div class="so-stat"><div class="so-v" data-k="pct"></div><div class="so-k">Blocked</div></div>
          <div class="so-stat"><div class="so-v" data-k="total"></div><div class="so-k">Queries / 24h</div></div>
          <button class="so-pause" data-act="pause" data-k="pause" type="button"><span data-k="ptext"></span></button>
          <div class="so-meta" data-k="meta"></div>
        </div>`;
      const host = el.querySelector(".so-scope"), grid = el.querySelector(".so-grid"), cv = el.querySelector(".so-cv");
      const S = this.s = { m: null, el, ctx: cv.getContext("2d"), rate: K.rateTracker(), news: K.newsTracker(), seeded: false,
        ang: -Math.PI / 4, contacts: [], dots: [], acc: 0, W: 0, H: 0, cx: 0, cy: 0, R: 0, dpr: 1, frozen: false,
        blip: makeBlip(AMBER, 14, 22, 4), dot: makeBlip(MINT, 8, 0, 2.6), labels: el.querySelector(".so-labels") };
      const size = () => {
        const W = host.clientWidth, H = host.clientHeight; if (!W || !H) return;
        S.dpr = Math.min(2, window.devicePixelRatio || 1); S.W = W; S.H = H;
        S.R = Math.round(H * 0.7); S.cx = Math.round(W * 0.2375); S.cy = Math.round(H * 0.5);
        cv.width = W * S.dpr; cv.height = H * S.dpr;
        drawGrid(grid, W, H, S.cx, S.cy, S.R, S.dpr);
        S.wedge = makeWedge(S.R, S.dpr);
        for (const c of S.contacts) this.place(c);
        S.frozen = false;
      };
      size(); this.ro = new ResizeObserver(size); this.ro.observe(host);
      this.stop = K.loop((dt) => this.frame(dt), 20);
    },
    unmount() { if (this.stop) this.stop(); if (this.ro) this.ro.disconnect(); },

    // A spot on the scope for a contact whose label (up and to the right) stays clear of the others.
    place(c) {
      const S = this.s, r = rng(hash(c.key));
      let best = null, bestHit = Infinity;
      for (let i = 0; i < 40; i++) {
        const a = r() * TAU, d = S.R * (0.28 + r() * 0.62);
        const x = S.cx + Math.cos(a) * d, y = S.cy + Math.sin(a) * d;
        if (x < 34 || x > S.W * 0.49 || y < 70 || y > S.H - 24) continue;
        let hit = 0;
        for (const o of S.contacts) {
          if (o === c || o.x == null) continue;
          const ox = Math.max(0, Math.min(x + 200, o.x + 200) - Math.max(x - 14, o.x - 14)), oy = Math.max(0, Math.min(y + 14, o.y + 14) - Math.max(y - 50, o.y - 50));
          hit += ox * oy;
        }
        if (Math.abs(y - S.cy) < 26 && x > S.cx) hit += 4000;   // keep labels off the heading line
        if (hit < bestHit) { bestHit = hit; best = { x, y, a }; if (!hit) break; }
      }
      if (!best) best = { x: S.cx - S.R * 0.5, y: S.cy - S.R * 0.3, a: Math.atan2(-S.R * 0.3, -S.R * 0.5) };
      Object.assign(c, { x: best.x, y: best.y, a: norm(Math.atan2(best.y - S.cy, best.x - S.cx)) });
      c.lab.style.transform = `translate(${Math.round(c.x + 12)}px, ${Math.round(c.y - 50)}px)`;
    },
    addContact(it, lit) {
      const S = this.s, key = `${it.domain}|${it.seen_at}`;
      if (S.contacts.some((c) => c.key === key)) return;
      const lab = document.createElement("div");
      lab.className = "so-ct"; lab.dataset.domain = it.domain;
      lab.innerHTML = `<b>${K.esc(it.domain)}</b><span></span>`;
      const c = { key, it, lab, t: lab.querySelector("span"), alpha: lit, str: lit ? 0.7 : 1, op: -1, pings: lit ? 1 : 0 };
      S.labels.appendChild(lab);
      S.contacts.push(c); this.place(c);
      while (S.contacts.length > 6) this.drop(S.contacts[0]);
      this.labelTimes();
    },
    drop(c) { const S = this.s; c.lab.remove(); S.contacts.splice(S.contacts.indexOf(c), 1); },
    labelTimes() { const S = this.s; if (!S.m) return; for (const c of S.contacts) c.t.textContent = K.ago(S.m, c.it); },

    render(el, m) {
      const S = this.s, d = m.data || {}; S.m = m; S.rate.update(m);
      if (!S.seeded) { S.seeded = true; m.ticker.slice(0, 3).reverse().forEach((it, i) => this.addContact(it, 0.55 + i * 0.2)); S.news(m.ticker); }
      else for (const it of S.news(m.ticker)) this.addContact(it, 0);
      this.labelTimes();
      const st = K.q(el, "state"); st.textContent = m.pill.text; st.className = `so-state ${m.pill.cls}`;
      const lab = K.q(el, "lab"); lab.textContent = m.labelAlert ? m.label : "Blocked / 24h"; lab.classList.toggle("alert", m.labelAlert);
      K.q(el, "blocked").textContent = K.num(d.blocked); K.q(el, "pct").textContent = K.pct(d.percent_blocked); K.q(el, "total").textContent = K.num(d.total);
      K.q(el, "ptext").textContent = K.pauseText(m);
      K.q(el, "cd").textContent = countdown(m) || "–:––";
      K.q(el, "hl").textContent = m.labelAlert ? m.label : "Blocking paused";
      const mt = K.meta(m); K.q(el, "meta").textContent = `CPU ${mt.temp} | Up ${mt.up}`;
      K.common(el, m);
      K.fit(K.q(el, "blocked"), 18); K.fit(K.q(el, "pct"), 18); K.fit(K.q(el, "total"), 18);
      if (!m.paused) S.frozen = false;
    },

    frame(dt) {
      const S = this.s, m = S.m; if (!m || m.asleep || !S.W) return;
      if (m.paused && S.frozen) return;   // sweep held: nothing moves, nothing to redraw
      const ctx = S.ctx, run = !m.paused && !m.stale;
      const prev = S.ang;
      if (run) S.ang = norm(S.ang + (TAU / PERIOD) * dt);
      const swept = (a) => { const span = norm(S.ang - prev); return span > 0 && norm(a - prev) <= span; };
      // faint mint returns: ordinary (allowed) traffic, at a bounded multiple of the live query rate
      if (run) {
        const r = S.rate.get(m); S.acc += dt * Math.min(1.6, Math.max(0.3, r.q * 0.35));
        while (S.acc >= 1 && S.dots.length < 14) {
          S.acc -= 1; const a = Math.random() * TAU, dd = S.R * (0.15 + Math.random() * 0.8);
          const x = S.cx + Math.cos(a) * dd, y = S.cy + Math.sin(a) * dd;
          if (x > 8 && x < S.W - 8 && y > 8 && y < S.H - 8) S.dots.push({ x, y, a: norm(a), alpha: 0, pings: 0 });
        }
        if (S.acc > 1) S.acc = 1;
      }
      ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0); ctx.clearRect(0, 0, S.W, S.H);
      // sweep wedge
      ctx.save(); ctx.translate(S.cx, S.cy); ctx.rotate(S.ang); ctx.globalAlpha = m.paused ? 0.32 : 1;
      ctx.drawImage(S.wedge.c, 0, -S.wedge.oy, S.wedge.w, S.wedge.h); ctx.restore();
      // mint returns
      S.dots = S.dots.filter((p) => {
        if (run && swept(p.a)) { p.pings++; p.alpha = p.pings > 2 ? 0 : 0.9 / p.pings; }
        if (run) p.alpha = Math.max(0, p.alpha - dt * 0.2);
        if (p.pings > 2 && p.alpha <= 0) return false;
        if (p.alpha > 0.02) { ctx.globalAlpha = p.alpha; ctx.drawImage(S.dot.c, p.x - S.dot.x, p.y - S.dot.y); }
        return true;
      });
      // amber contacts: light up as the beam passes, fade over a few seconds, gone after a few sweeps
      for (const c of S.contacts.slice()) {
        if (run && swept(c.a)) { c.alpha = c.str; c.str *= 0.78; c.pings++; }
        if (run) c.alpha = Math.max(0, c.alpha - dt * 0.16);
        if (c.pings >= 4 && c.alpha <= 0.02) { this.drop(c); continue; }
        if (c.alpha > 0.02) {
          ctx.globalAlpha = Math.min(1, c.alpha * 1.15); ctx.drawImage(S.blip.c, c.x - S.blip.x, c.y - S.blip.y);
          ctx.strokeStyle = `rgba(${AMBER},${Math.min(0.9, c.alpha + 0.2)})`; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(c.x + 4, c.y - 5); ctx.lineTo(c.x + 12, c.y - 18); ctx.lineTo(c.x + 12, c.y - 26); ctx.stroke();
        }
        const op = c.pings ? Math.round(Math.max(0.5, Math.min(1, 0.35 + c.alpha)) * 20) / 20 : 0;
        if (op !== c.op) { c.op = op; c.lab.style.opacity = op; }
      }
      ctx.globalAlpha = 1;
      if (m.paused) S.frozen = true;
    },
  };

  window.PiSkins.add("sonar", skin, "Sonar", "Blocked domains surface as contacts", K.T(
    '<rect width="160" height="96" fill="#05101A"/><circle cx="40" cy="48" r="62" fill="#071C22" stroke="#6EF5C0" stroke-width="1.2"/>' +
    '<g fill="none" stroke="#6EF5C0" stroke-opacity=".18"><circle cx="40" cy="48" r="16"/><circle cx="40" cy="48" r="32"/><circle cx="40" cy="48" r="48"/></g>' +
    '<path d="M0 48H102M40 0V96" stroke="#6EF5C0" stroke-opacity=".4"/><path d="M40 48 L84 4 A62 62 0 0 0 58 -11 Z" fill="#6EF5C0" fill-opacity=".28"/><path d="M40 48 L84 4" stroke="#B8FFE0" stroke-width="1.5"/>' +
    '<circle cx="22" cy="28" r="2.5" fill="#FFA82E"/><circle cx="66" cy="58" r="2.5" fill="#FFA82E"/><circle cx="30" cy="76" r="1.5" fill="#6EF5C0"/>' +
    '<rect x="26" y="20" width="26" height="2" fill="#F2E6D0"/><rect x="70" y="50" width="22" height="2" fill="#F2E6D0"/>' +
    '<circle cx="116" cy="24" r="2" fill="#6EF5C0"/><rect x="121" y="23" width="22" height="2" fill="#CFF8E6"/>' +
    '<rect x="114" y="34" width="30" height="5" fill="#CFF8E6"/><rect x="114" y="46" width="22" height="5" fill="#CFF8E6"/><rect x="114" y="58" width="30" height="5" fill="#CFF8E6"/>' +
    '<rect x="114" y="72" width="34" height="11" rx="2" fill="none" stroke="#CFF8E6"/>'));
})();
