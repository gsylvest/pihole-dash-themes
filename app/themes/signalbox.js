// Railway Signal Box: cream enamel panel, black track diagram, red and green lamps.
// Queries run along the tracks as little cars. Allowed ones continue to INTERNET; blocked ones are switched
// into the siding and park against the buffer stop (the three newest are labelled). Pausing sets the points
// to "all traffic through": the siding signal changes aspect and everything runs to the internet.
(() => {
  "use strict";
  const K = window.PiSkinKit;
  const VW = 640, VH = 390;                       // logical diagram size (the scene cell is 640×390 on the panel)
  const INK = "#1E1C19", CREAM = "#F4EEDC", GREEN = "#2FB34A", RED = "#E0362C", AMBER = "#E9A21F";
  const JX = 372;                                 // points: where the siding leaves the main line
  const SLOTS = [430, 492, 558];                  // parking spots on the siding (newest at the left)
  const IN = [[[0, 120], [140, 120], [183, 170]], [[0, 170], [183, 170]], [[0, 220], [140, 220], [183, 170]]];
  const MAIN = [[183, 170], [JX, 170]];
  const OUT = [[JX, 170], [450, 170], [496, 127], [612, 127]];
  const SIDE = [[JX, 170], [403, 229], [604, 229]];

  function route(...parts) {                      // join polylines into one path with arc-length lookup
    const pts = [];
    for (const p of parts) for (const q of p) { const l = pts[pts.length - 1]; if (!l || l[0] !== q[0] || l[1] !== q[1]) pts.push(q); }
    const seg = []; let len = 0;
    for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], l = Math.hypot(x1 - x0, y1 - y0); seg.push({ x0, y0, x1, y1, l, s: len, a: Math.atan2(y1 - y0, x1 - x0) }); len += l; }
    return {
      len,
      at(s) {
        s = Math.max(0, Math.min(len, s));
        for (const g of seg) if (s <= g.s + g.l) { const k = (s - g.s) / g.l; return { x: g.x0 + (g.x1 - g.x0) * k, y: g.y0 + (g.y1 - g.y0) * k, a: g.a }; }
        const g = seg[seg.length - 1]; return { x: g.x1, y: g.y1, a: g.a };
      },
      sAtX(x) { for (const g of seg) if (g.x1 >= x && g.x0 <= x && g.x1 !== g.x0) return g.s + g.l * (x - g.x0) / (g.x1 - g.x0); return len; },
    };
  }
  const R_OUT = IN.map((p) => route(p, MAIN, OUT));
  const R_SIDE = IN.map((p) => route(p, MAIN, SIDE));
  const SIDE_ONLY = route(SIDE);
  const IN_LEN = IN.map((p) => route(p).len), MAIN_LEN = JX - 183;
  // Lamps: [x, y, id]; the line lamps show red for a moment after a car passes (track occupied).
  const LAMPS = [[87, 120], [87, 170], [87, 220], [228, 170], [292, 170], [511, 127]];
  const SIG = [389, 205];                         // the siding signal

  function plate(dpr, sc, ox, oy, W, H) {         // the static enamel panel: tracks, sleepers, labels, buffer, filter box
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d");
    g.fillStyle = CREAM; g.fillRect(0, 0, W, H);
    // faint enamel speckle so the panel isn't flat
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.fillStyle = "rgba(120,100,60,.05)";
    for (let i = 0; i < (W * H) / 900; i++) g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1);
    g.setTransform(dpr * sc, 0, 0, dpr * sc, ox, oy);
    g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = INK;
    const line = (pts, w) => { g.lineWidth = w; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
    // tick sleepers along every track, then the rails on top
    g.strokeStyle = "rgba(30,28,25,.22)";
    for (const r of [...IN.map((p) => route(p, MAIN)), route(OUT), SIDE_ONLY]) {
      for (let s = 6; s < r.len - 4; s += 12) { const p = r.at(s), nx = -Math.sin(p.a), ny = Math.cos(p.a); line([[p.x - nx * 5, p.y - ny * 5], [p.x + nx * 5, p.y + ny * 5]], 1.4); }
    }
    g.strokeStyle = INK;
    for (const p of IN) line(p, 4.5);
    line(MAIN, 4.5); line(OUT, 4.5); line(SIDE, 4.5);
    // arrow to the internet
    g.fillStyle = INK; g.beginPath(); g.moveTo(626, 127); g.lineTo(608, 120); g.lineTo(608, 134); g.closePath(); g.fill();
    // buffer stop
    g.lineCap = "butt"; line([[608, 216], [608, 242]], 4); line([[615, 216], [615, 242]], 4);
    // labels
    g.font = "700 19px 'DejaVu Sans Mono', Menlo, monospace"; g.textBaseline = "alphabetic"; g.fillStyle = INK;
    g.fillText("HOME", 22, 108); g.fillText("DEVICES", 14, 158); g.fillText("GUEST", 14, 208);
    g.textAlign = "right"; g.fillText("INTERNET", 622, 112); g.fillText("BLOCKED", 604, 206); g.textAlign = "left";
    return c;
  }

  const skin = {
    mount(el) {
      el.innerHTML = `
        <div class="sb-top"><b class="sb-title">pi-hole / signal box</b><span class="sb-sp"></span>
          <span class="sb-state" data-k="state"></span><i class="sb-vr"></i>
          <button class="sb-allowed" data-act="allowed" data-k="allowed" type="button"><i class="sb-box"></i>Allowed<span class="n"></span></button><i class="sb-vr"></i>
          <button class="sb-style" data-act="style" type="button">Style</button></div>
        <div class="sb-scene fade"><canvas class="sb-cv"></canvas>
          <div class="sb-points" data-k="points"><b>ALL TRAFFIC THROUGH</b><span data-k="cd"></span></div>
          <div class="sb-tags" data-k="tags"></div></div>
        <div class="sb-col">
          <div class="sb-stat"><div class="sb-v" data-k="blocked"></div><div class="sb-k" data-k="lab"></div></div>
          <div class="sb-stat"><div class="sb-v" data-k="pct"></div><div class="sb-k">Blocked</div></div>
          <div class="sb-stat"><div class="sb-v" data-k="total"></div><div class="sb-k">Queries / 24h</div></div>
          <button class="sb-pause" data-act="pause" data-k="pause" type="button"></button></div>
        <div class="sb-foot" data-k="meta"></div>`;
      const cv = el.querySelector("canvas"), ctx = cv.getContext("2d"), host = el.querySelector(".sb-scene");
      const S = this.s = { m: null, rate: K.rateTracker(), news: K.newsTracker(), cars: [], gone: [], parked: [null, null, null], lamps: LAMPS.map(() => 0),
        acc: 0, accB: 0, plate: null, W: 0, H: 0, dpr: 1, sc: 1, ox: 0, oy: 0, keys: "", sigWarn: 0, inited: false };
      const size = () => {
        const W = host.clientWidth, H = host.clientHeight; if (!W || !H) return;
        S.dpr = Math.min(2, window.devicePixelRatio || 1); S.W = W * S.dpr; S.H = H * S.dpr;
        S.sc = Math.min(W / VW, H / VH); S.ox = (W - VW * S.sc) / 2 * S.dpr; S.oy = (H - VH * S.sc) / 2 * S.dpr;
        cv.width = S.W; cv.height = S.H; S.plate = plate(S.dpr, S.sc, S.ox, S.oy, S.W, S.H);
        S.tagHost = q(el, "tags");
        S.tagHost.style.transform = `translate(${S.ox / S.dpr}px, ${S.oy / S.dpr}px) scale(${S.sc})`;
      };
      const q = K.q; size(); this.ro = new ResizeObserver(size); this.ro.observe(host);
      this.stop = K.loop((dt, t) => this.frame(ctx, dt, t), 20);
    },
    unmount() { if (this.stop) this.stop(); if (this.ro) this.ro.disconnect(); },

    render(el, m) {
      const S = this.s, d = m.data || {}, mt = K.meta(m); S.m = m; S.rate.update(m);
      const through = this.through(m);
      // newest blocked domains: park a fresh car for each (only when blocking; while paused they run through)
      const fresh = S.news(m.ticker);
      if (!S.inited && m.ticker.length) { S.inited = true; for (let i = 0; i < 3; i++) if (m.ticker[i]) S.parked[i] = this.car("park", i, SIDE_ONLY.sAtX(SLOTS[i]), null); }
      for (let i = 0; i < fresh.length; i++) this.spawn(through ? "out" : "news", i * 1.1);
      const st = K.q(el, "state"); st.textContent = m.pill.text; st.className = `sb-state ${m.pill.cls}`;
      K.q(el, "lab").textContent = K.heroLabel(m, "Blocked / 24h");
      K.q(el, "lab").classList.toggle("alert", m.labelAlert || m.paused);
      K.q(el, "blocked").textContent = K.num(d.blocked); K.q(el, "pct").textContent = K.pct(d.percent_blocked); K.q(el, "total").textContent = K.num(d.total);
      K.q(el, "pause").textContent = K.pauseText(m);
      K.q(el, "meta").textContent = `CPU ${mt.temp}  |  Up ${mt.up}`;
      K.q(el, "points").hidden = !m.paused;
      K.q(el, "cd").textContent = (m.pill.text.split("·")[1] || "").trim();
      // domain label boxes under the siding (newest left), leaders drawn on the canvas
      const rows = m.ticker.slice(0, 3), keys = rows.map((it) => `${it.domain}|${K.short(K.ago(m, it))}`).join(",");
      if (keys !== S.keys) {
        S.keys = keys;
        K.q(el, "tags").innerHTML = rows.map((it, i) =>
          `<div class="sb-tag t${i}" data-domain="${K.esc(it.domain)}"><span class="d">${K.esc(it.domain)}</span><span class="t">${K.esc(K.short(K.ago(m, it)))}</span></div>`).join("")
          || '<div class="sb-tag t0 empty"><span class="d">siding empty</span></div>';
      }
      S.nTags = rows.length;
      K.common(el, m);
      K.fit(K.q(el, "blocked"), 18); K.fit(K.q(el, "pct"), 18); K.fit(K.q(el, "total"), 18);
    },
    through(m) { return m.paused || m.pill.cls !== "ok"; },
    car(kind, line, s, r) { return { kind, line, s, r, v: 0, max: 62 + Math.random() * 14, life: 1, red: kind !== "out" && kind !== "pass", slot: kind === "park" ? line : -1 }; },
    spawn(kind, delay) {   // kind: pass (allowed), out (blocked but paused → through), news (blocked → park), drop (ambient blocked → siding, fades)
      const S = this.s, line = (Math.random() * 3) | 0, r = kind === "news" || kind === "drop" ? R_SIDE[line] : R_OUT[line];
      const c = this.car(kind, line, -delay * 60, r); c.red = kind !== "pass"; S.cars.push(c); return c;
    },
    frame(ctx, dt, t) {
      const S = this.s, m = S.m; if (!m || m.asleep || !S.plate) return;
      const through = this.through(m);
      if (!m.stale) {   // time-lapsed traffic, kept lively but bounded
        const r = S.rate.get(m), qps = Math.min(1.6, Math.max(0.55, r.q * 0.25)), pb = r.q > 0 ? Math.min(0.4, r.b / r.q) : 0.2;
        S.acc += dt * qps * (1 - pb); S.accB += dt * Math.min(0.35, qps * pb);
        if (S.acc >= 1) { S.acc -= 1; if (S.cars.length < 26) this.spawn("pass", 0); }
        if (S.accB >= 1) { S.accB -= 1; if (S.cars.length < 26) this.spawn(through ? "out" : "drop", 0); }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(S.plate, 0, 0);
      ctx.setTransform(S.dpr * S.sc, 0, 0, S.dpr * S.sc, S.ox, S.oy);
      // move cars: keep a gap behind the car ahead on the same route section
      let wantSide = false;
      const parkS = (i) => SIDE_ONLY.sAtX(SLOTS[i]);
      // keep cars spaced through the merge and along the shared main line (positions measured from the merge)
      const mp = (c) => c.s - IN_LEN[c.line], near = S.cars.filter((c) => mp(c) < MAIN_LEN + 30).map(mp);
      S.cars = S.cars.filter((c) => {
        let target = c.r.len + 40;
        if (c.kind === "news") {   // stop at the first slot once the others have shuffled up
          const base = c.r.len - SIDE_ONLY.len; target = base + parkS(0);
          if (c.s > c.r.len - SIDE_ONLY.len - 40 && c.s < base) wantSide = true;
        }
        if (c.kind === "drop") { const base = c.r.len - SIDE_ONLY.len; target = base + parkS(0) - 26; if (c.s < base + 2 && c.s > base - 50) wantSide = true; }
        const goal = target, me = mp(c);
        if (me < MAIN_LEN + 6) { let ahead = Infinity; for (const o of near) if (o > me + 0.01 && o < ahead) ahead = o; if (ahead < Infinity) target = Math.min(target, c.s + (ahead - me) - 24); }
        c.v = Math.min(c.max, c.v + 90 * dt);
        if (c.s + c.v * dt >= target) { c.s = Math.max(c.s, target); c.v = 0; } else c.s += c.v * dt;
        if (c.kind === "news" && c.s >= goal - 0.1) {   // arrived: shuffle the parked queue towards the buffer
          if (S.parked[2]) { S.parked[2].kind = "gone"; S.gone.push(S.parked[2]); }
          S.parked[2] = S.parked[1]; S.parked[1] = S.parked[0];
          c.kind = "park"; c.s = parkS(0); c.r = null; S.parked[0] = c; c.v = 0;
          return false;
        }
        if (c.kind === "drop" && c.s >= goal - 0.1) { c.life -= dt * 1.6; if (c.life <= 0) return false; }
        if (c.s > c.r.len + 30) return false;
        const p = c.r.at(c.s);
        LAMPS.forEach(([lx, ly], i) => { if (Math.abs(p.x - lx) < 6 && Math.abs(p.y - ly) < 6) S.lamps[i] = 0.9; });
        if (c.s >= 0) this.drawCar(ctx, p, c);
        return true;
      });
      // parked cars glide to their slot
      S.parked.forEach((c, i) => { if (!c) return; const tgt = parkS(i); c.s += Math.sign(tgt - c.s) * Math.min(Math.abs(tgt - c.s), 40 * dt); this.drawCar(ctx, SIDE_ONLY.at(c.s), c); });
      S.gone = S.gone.filter((c) => { c.life -= dt * 1.2; c.s = Math.min(SIDE_ONLY.len - 10, c.s + 30 * dt); this.drawCar(ctx, SIDE_ONLY.at(c.s), c); return c.life > 0; });
      // leaders from each label box up to its car
      ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.beginPath();
      for (let i = 0; i < (S.nTags || 0); i++) {
        const c = S.parked[i], p = c ? SIDE_ONLY.at(c.s) : SIDE_ONLY.at(parkS(i)), bx = TAGX[i];
        ctx.moveTo(p.x, p.y + 6); ctx.lineTo(p.x - 6, p.y + 26); ctx.lineTo(bx, 276);
      }
      ctx.stroke();
      // points blades: show which way the junction is set
      ctx.lineCap = "round"; ctx.strokeStyle = through ? AMBER : INK; ctx.lineWidth = 7;
      ctx.beginPath();
      if (!through && wantSide) { ctx.moveTo(JX, 170); ctx.lineTo(JX + 9, 187); } else { ctx.moveTo(JX - 2, 170); ctx.lineTo(JX + 18, 170); }
      ctx.stroke();
      if (through) {   // siding closed: a bar across its entry
        ctx.strokeStyle = RED; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(388, 223); ctx.lineTo(406, 213); ctx.stroke();
      }
      // filter box over the main line
      ctx.fillStyle = CREAM; ctx.strokeStyle = through ? AMBER : INK; ctx.lineWidth = 2.5;
      ctx.fillRect(340, 155, 72, 30); ctx.strokeRect(340, 155, 72, 30);
      if (through) { ctx.setLineDash([4, 3]); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.strokeRect(343, 158, 66, 24); ctx.setLineDash([]); }
      ctx.fillStyle = INK; ctx.font = "700 16px 'DejaVu Sans Mono', Menlo, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(through ? "BYPASS" : "FILTER", 376, 171); ctx.textAlign = "left";
      // lamps
      LAMPS.forEach(([x, y], i) => { S.lamps[i] = Math.max(0, S.lamps[i] - dt); this.lamp(ctx, x, y, S.lamps[i] > 0 ? RED : GREEN); });
      // siding signal: red (stop) normally, yellow while a blocked car is being switched in; paused: dark with a lit amber "through" aspect
      if (wantSide) S.sigWarn = 0.6; S.sigWarn = Math.max(0, S.sigWarn - dt);
      if (through) { this.lamp(ctx, SIG[0], SIG[1], Math.sin(t * 6) > 0 ? AMBER : "#7A6A48"); }
      else this.lamp(ctx, SIG[0], SIG[1], S.sigWarn > 0 ? AMBER : RED);
    },
    lamp(ctx, x, y, col) {
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, y, 8.5, 0, 6.2832); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 6.2, 0, 6.2832); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.45)"; ctx.beginPath(); ctx.arc(x - 2, y - 2, 1.8, 0, 6.2832); ctx.fill();
    },
    drawCar(ctx, p, c) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.globalAlpha = Math.max(0, Math.min(1, c.life));
      ctx.fillStyle = INK; ctx.fillRect(-9, -6, 18, 12);
      ctx.fillStyle = c.red ? RED : "#5B574F"; ctx.fillRect(-7.5, -4.5, 15, 9);
      ctx.fillStyle = c.red ? "#FF8A7E" : "#B8B2A2"; ctx.fillRect(3, -3, 3, 6);
      ctx.restore();
    },
  };
  const TAGX = [292, 430, 566];   // label box centres (match CSS)

  window.PiSkins.add("signalbox", skin, "Signal Box", "Blocked trains take the siding", K.T(
    '<rect width="160" height="96" fill="#F4EEDC"/><text x="6" y="12" font-size="9" font-weight="700" fill="#1E1C19" font-family="Menlo, monospace">pi-hole / signal box</text>' +
    '<line x1="0" y1="17" x2="160" y2="17" stroke="#1E1C19"/><line x1="122" y1="17" x2="122" y2="88" stroke="#1E1C19"/><line x1="0" y1="88" x2="160" y2="88" stroke="#1E1C19"/>' +
    '<g stroke="#1E1C19" stroke-width="2" fill="none"><path d="M2 38h22l8 10M2 48h30M2 58h22l8-10M32 48h40l8-10h24M66 48l6 12h38"/></g>' +
    '<rect x="58" y="43" width="18" height="9" fill="#F4EEDC" stroke="#1E1C19"/><path d="M110 56v8M113 56v8" stroke="#1E1C19" stroke-width="1.5"/>' +
    '<g fill="#2FB34A"><circle cx="14" cy="38" r="2.2"/><circle cx="14" cy="48" r="2.2"/><circle cx="14" cy="58" r="2.2"/><circle cx="44" cy="48" r="2.2"/><circle cx="92" cy="38" r="2.2"/></g><circle cx="70" cy="56" r="2.2" fill="#E0362C"/>' +
    '<g fill="#E0362C"><rect x="80" y="58" width="6" height="4"/><rect x="92" y="58" width="6" height="4"/><rect x="102" y="58" width="6" height="4"/></g>' +
    '<g fill="#1E1C19"><rect x="128" y="26" width="26" height="6"/><rect x="128" y="44" width="20" height="6"/><rect x="128" y="62" width="26" height="6"/></g><rect x="126" y="76" width="30" height="9" rx="2" fill="#1E1C19"/>'));
})();
