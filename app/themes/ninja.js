// ASCII NINJA: a black terminal where everything is monospace line art. A chunky ASCII ninja holds a long
// sword up and to the right; blocked domains arrive as dashed ASCII packets [==] with motion arrows, converge
// on the blade tip in the middle of the scene, and the ninja flicks the blade: the packet splits in two along a
// coral / / streak with debris, then fades. Real arrivals in m.ticker spawn packets at once; between them,
// packets are time-lapsed from K.rateTracker but only ever labelled with real domains from m.ticker.
// Paused: FILTER: OFF, the sword is lowered and packets pass through un-cut. Body + ground pre-rendered;
// sword, packets and debris per frame. 20 fps.
(() => {
  "use strict";
  const K = window.PiSkinKit; if (!K) return;

  const MINT = "#A6F2C8", BLADE = "#DDFBEA", AMB = "#F5B54A", CORAL = "#FF7468", HOT = "#FFE9E4", DIMMINT = "#5E8F74";
  const MONO = '"DejaVu Sans Mono", Menlo, Consolas, monospace';
  const ART_F = `bold 17px ${MONO}`, ALH = 16;           // ninja art
  const PK_F = `bold 17px ${MONO}`, PLH = 17;            // packets
  const FX_F = `bold 16px ${MONO}`;                      // sword, debris
  const SPEED = 62;                                      // px/s for packets
  const L = 190;                                         // blade length (px)
  const A_READY = -1.05, A_REST = 0.55;                  // ~60 deg up-right; lowered when paused
  const GAP_T = 2.4;                                     // min seconds between two packets reaching the blade
  const countdown = (m) => (m.pill.text.split("·")[1] || "").trim();

  // The ninja: original chunky ASCII art. '@' marks the hands (the sword is drawn there, rotated).
  const BODY = String.raw`
            _.-''''''''-._
  ====\    /  ==========  \
 =====-\__/ ============== \
   ===--| .--------------. |
        | |    o    o    | |
        |  '------------'  |
         \     ______     /
       .--'-._________.-'-@
      /  /  |=========| \_/
     /  /   |=========|
    '--'   _/ /    \ \_
         _/  /      \  \_
        /   /        \   \
     __/  _/          \_  \__
    /____/              \____\ `.split("\n").slice(1);
  const TAILS_B = ["  ===-\\    ", " ====-=\\__/", "  ====--|"];   // headband tails, second flutter frame
  const PACK = [".-- - - - -.", "|   [==]   |", "'-- - - - -'"];
  const HALF = 6;                                                     // chars in the left half of a cut packet
  const ARR_R = [[" --->", "--->", " --->"], ["  -->", "- ->", "  -->"]];
  const ARR_L = [[" <---", "<---", " <---"], [" <-- ", "<- -", " <-- "]];   // trailing on the right of left-moving packets
  const DEBRIS = ["'", ".", ",", ":", "`", ".", "'", ";"];

  function canvas(w, h, dpr) {
    const c = document.createElement("canvas"); c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr);
    const g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); return { c, g, w, h };
  }
  function bodyFrame(cw, dpr, variant) {
    const rows = BODY.map((r) => r.replace("@", " "));
    if (variant === 1) for (let i = 0; i < 3; i++) rows[i + 1] = TAILS_B[i] + rows[i + 1].slice(TAILS_B[i].length);
    if (variant === 2) rows[4] = rows[4].replace("o    o", "-    -");
    const f = canvas(Math.max(...rows.map((r) => r.length)) * cw + 6, rows.length * ALH + 6, dpr), g = f.g;
    g.font = ART_F; g.textBaseline = "top";
    rows.forEach((r, i) => {
      g.fillStyle = MINT; g.fillText(r, 0, i * ALH);
      const e = r.search(/[o-] {4}[o-]/);
      if (i === 4 && e >= 0) { g.fillStyle = "#FFFFFF"; g.fillText(r.slice(e, e + 6), e * cw, i * ALH); }
    });
    return f;
  }
  function groundPlate(W, dpr) {
    const f = canvas(W, 20, dpr), g = f.g; let s = "", r = 7;
    const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
    while (s.length < 90) s += ["-", "--", "---", " ", " -", ".", " . ", "-.-", "- -"][Math.floor(rnd() * 9)];
    g.font = `bold 15px ${MONO}`; g.textBaseline = "top"; g.fillStyle = DIMMINT; g.fillText(s, 0, 2);
    return f;
  }
  const ease = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };

  const skin = {
    mount(el) {
      el.innerHTML = `
        <div class="nj-top">
          <b class="nj-brand">&gt; shinobi</b><span class="nj-bar">|</span><span class="nj-sub">SHINOBI / ASCII FILTER</span><span class="nj-bar">|</span>
          <span class="nj-filter" data-k="filter">FILTER: ON</span><span class="nj-bar">|</span>
          <button class="nj-btn" data-act="allowed" data-k="allowed" type="button">[allowed<span class="n"></span>]</button>
          <button class="nj-btn" data-act="style" type="button">[style]</button>
        </div>
        <div class="nj-rule t">${"=".repeat(140)}</div>
        <div class="nj-scene"><canvas class="nj-cv"></canvas><div class="nj-labels fade"></div></div>
        <i class="nj-vl"></i>
        <div class="nj-col fade">
          <div class="nj-stat"><div class="nj-v" data-k="blocked"></div><div class="nj-k" data-k="lab">blocked / 24h</div></div>
          <div class="nj-dash">${"-".repeat(40)}</div>
          <div class="nj-stat"><div class="nj-v c" data-k="pct"></div><div class="nj-k">blocked</div></div>
          <div class="nj-dash">${"-".repeat(40)}</div>
          <div class="nj-stat"><div class="nj-v" data-k="total"></div><div class="nj-k">queries / 24h</div></div>
          <div class="nj-dash">${"-".repeat(40)}</div>
          <span class="nj-sp"></span>
          <div class="nj-cd"><span>OFF</span><b data-k="cd"></b></div>
          <button class="nj-pause" data-act="pause" data-k="pause" type="button"></button>
        </div>
        <div class="nj-rule b">${"=".repeat(140)}</div>
        <div class="nj-bot">
          <span class="nj-prompt">&gt; intercepted:</span><span class="nj-last" data-k="last"></span><i class="nj-cur">█</i>
          <span class="nj-sp"></span><span class="nj-meta" data-k="meta"></span>
        </div>`;
      const host = el.querySelector(".nj-scene"), cv = el.querySelector(".nj-cv");
      const S = this.s = { m: null, ctx: cv.getContext("2d"), rate: K.rateTracker(), news: K.newsTracker(), seeded: false,
        labels: el.querySelector(".nj-labels"), packets: [], debris: [], queue: [], nextFill: 2.5, lastSpawn: -9, fillIdx: 0,
        flick: -9, a: A_READY, now: 0, W: 0, H: 0, dpr: 1, frames: null };
      const size = () => {
        const W = host.clientWidth, H = host.clientHeight; if (!W || !H) return;
        S.dpr = Math.min(2, window.devicePixelRatio || 1); S.W = W; S.H = H;
        cv.width = W * S.dpr; cv.height = H * S.dpr;
        const g = S.ctx;
        g.font = ART_F; S.acw = g.measureText("MMMMMMMMMM").width / 10;
        g.font = PK_F; S.pcw = g.measureText("MMMMMMMMMM").width / 10;
        S.BW = PACK[0].length * S.pcw; S.AW = 5 * S.pcw;
        S.frames = [0, 1, 2].map((v) => bodyFrame(S.acw, S.dpr, v));
        S.ground = groundPlate(W, S.dpr); S.gy = H - 20;
        S.nx = 4; S.ny = S.gy - BODY.length * ALH + 4;
        const hr = BODY.findIndex((r) => r.includes("@"));
        S.hx = S.nx + BODY[hr].indexOf("@") * S.acw + S.acw * 0.5; S.hy = S.ny + hr * ALH + ALH * 0.5;
        S.tx = S.hx + Math.cos(A_READY) * L; S.ty = S.hy + Math.sin(A_READY) * L;   // blade tip: where packets are cut
        // lanes: one from the upper left, two from the right (centre-right and lower-right); all converge on the tip
        S.lanes = [{ dir: 1, y: 52 }, { dir: -1, y: Math.round(H * 0.42) }, { dir: -1, y: Math.round(H * 0.62) }].map((ln) => {
          const x0 = ln.dir > 0 ? -(S.BW / 2 + S.AW + 6) : W + S.BW / 2 + S.AW + 6;
          return { ...ln, x0, T: Math.abs(S.tx - x0) / SPEED };
        });
      };
      size(); this.ro = new ResizeObserver(size); this.ro.observe(host);
      this.stop = K.loop((dt, t) => this.frame(dt, t), 20);
    },
    unmount() { if (this.stop) this.stop(); if (this.ro) this.ro.disconnect(); },

    // ------------------------------------------------------------ packets
    // the packet's centre: along its lane, curving onto the blade tip over the last ~60% of the trip
    pos(p) {
      const S = this.s, ln = S.lanes[p.lane], u = (p.cx - ln.x0) / (S.tx - ln.x0);
      const a = ln.dir > 0 ? 0.55 : 0.3, b = ln.dir > 0 ? 0.45 : 0.55;
      return u >= 1 ? S.ty : ln.y + (S.ty - ln.y) * ease((u - a) / b);
    },
    spawn(dom, real, lane0, u0) {
      const S = this.s; if (!S.lanes) return false;
      const t = S.now, u = u0 || 0, ok = [];
      for (const i of lane0 != null ? [lane0] : [0, 1, 2]) {
        const ln = S.lanes[i], arrive = t + ln.T * (1 - u), cx = ln.x0 + (S.tx - ln.x0) * u;
        if (S.packets.some((p) => p.state === "fly" && p.arrive != null && Math.abs(p.arrive - arrive) < GAP_T)) continue;
        // lane spacing: keep the follower's box + arrows clear of the label in between
        const prev = S.packets.filter((p) => p.lane === i && p.state === "fly").pop();
        if (prev) {
          const lab = Math.max(0, (ln.dir > 0 ? (dom || "").length * 9.4 : (prev.dom || "").length * 9.4 - S.BW));
          if (Math.abs(prev.cx - cx) < S.BW + S.AW + lab + 36) continue;
        }
        ok.push(i);
      }
      if (!ok.length) return false;
      const lane = ok[Math.floor(Math.random() * ok.length)], ln = S.lanes[lane];
      const p = { lane, dir: ln.dir, cx: ln.x0 + (S.tx - ln.x0) * u, y: ln.y, dom, real, state: "fly", t: 0,
        arrive: S.m && S.m.paused ? null : t + ln.T * (1 - u), lab: null, lx: null, ly: null, mw: -1 };
      p.y = this.pos(p);
      if (dom) {
        const lab = document.createElement("div");
        lab.className = "nj-tag"; lab.dataset.domain = dom; lab.textContent = dom;
        lab.style.transform = "translate(-999px,0)";
        S.labels.appendChild(lab); p.lab = lab;
      }
      S.packets.push(p); S.lastSpawn = t;
      return true;
    },
    drop(p) { const S = this.s; if (p.lab) p.lab.remove(); S.packets.splice(S.packets.indexOf(p), 1); },
    cut(p) {
      const S = this.s; p.state = "cut"; p.t = 0; p.cx = S.tx; p.y = S.ty;
      if (p.lab) p.lab.classList.add("cut");
      S.flick = S.now;
      for (let i = 0; i < 10; i++) {
        const ang = Math.random() * Math.PI * 2, v = 30 + Math.random() * 80;
        S.debris.push({ x: S.tx + (Math.random() - 0.5) * 30, y: S.ty + (Math.random() - 0.5) * 30, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 30,
          ch: DEBRIS[Math.floor(Math.random() * DEBRIS.length)], t: 0, life: 0.9 + Math.random() * 0.7 });
      }
      while (S.debris.length > 40) S.debris.shift();
    },

    render(el, m) {
      const S = this.s, d = m.data || {}; S.m = m; S.rate.update(m);
      if (!S.seeded) {
        S.seeded = true; S.news(m.ticker);
        // open on a scene already in motion: real recent domains on their way in, staggered like the sample
        const tk = m.ticker.slice(0, 2);
        if (tk[0]) this.spawn(tk[0].domain, true, 0, 0.3);
        if (tk[1]) this.spawn(tk[1].domain, true, 2, 0.3);
        S.fillIdx = 2;
      } else for (const it of S.news(m.ticker)) { S.queue.push(it.domain); if (S.queue.length > 6) S.queue.shift(); }

      const f = K.q(el, "filter");
      const ok = !m.pill.cls || m.pill.cls === "ok";
      f.textContent = m.paused ? "FILTER: OFF" : ok ? "FILTER: ON" : `FILTER: ${m.pill.text.toUpperCase()}`;
      f.className = `nj-filter ${m.paused ? "off" : ok ? "" : m.pill.cls}`;
      const lab = K.q(el, "lab"); lab.textContent = m.labelAlert ? m.label.toLowerCase() : "blocked / 24h"; lab.classList.toggle("alert", m.labelAlert);
      K.q(el, "blocked").textContent = K.num(d.blocked); K.q(el, "pct").textContent = K.pct(d.percent_blocked); K.q(el, "total").textContent = K.num(d.total);
      const p = K.q(el, "pause");
      if (m.button.mode === "pause") p.innerHTML = '<i>[</i><span class="one">PAUSE 5m</span><i>]</i>';
      else { const w = K.resumeText(m).split(" "); p.innerHTML = `<i>[</i><span class="two">${K.esc(w[0])}<br>${K.esc(w.slice(1).join(" "))}</span><i>]</i>`; }
      K.q(el, "cd").textContent = countdown(m) || "–:––";
      const last = K.q(el, "last"), top = m.ticker[0];
      if (top) { if (last.dataset.domain !== top.domain) { last.dataset.domain = top.domain; last.textContent = top.domain; } }
      else { delete last.dataset.domain; last.textContent = "waiting…"; }
      const mt = K.meta(m); K.q(el, "meta").textContent = `| cpu ${mt.temp.replace("°", " ")} | up ${mt.up}`;
      K.common(el, m);
      K.fit(K.q(el, "blocked"), 20); K.fit(K.q(el, "pct"), 20); K.fit(K.q(el, "total"), 20);
    },

    // ------------------------------------------------------------ frame
    frame(dt, t) {
      const S = this.s, m = S.m; if (!m || m.asleep || !S.W || !S.frames) return;
      S.now = t;
      const paused = m.paused, speed = SPEED * (m.stale ? 0.35 : 1);
      if (paused) for (const p of S.packets) p.arrive = null;

      // spawning: real arrivals first, then time-lapsed filler labelled with real domains
      if (S.queue.length && t - S.lastSpawn > 0.7) { if (this.spawn(S.queue[0], true)) { S.queue.shift(); S.nextFill = t + 2.2; } }
      if (!m.stale && t >= S.nextFill && t - S.lastSpawn > 1.2) {
        const r = S.rate.get(m);
        if (paused) this.spawn(null, false, 0);   // pass-through traffic only from the left
        else {
          const tk = m.ticker.slice(0, 12); let dom = null;
          const live = new Set(S.packets.map((q) => q.dom));   // never show the same domain twice at once
          for (let k = 0; k < tk.length && !dom; k++) { const c = tk[S.fillIdx % tk.length].domain; S.fillIdx++; if (!live.has(c)) dom = c; }
          if (!this.spawn(dom, false) && dom) S.fillIdx--;
        }
        const per = paused ? r.q : r.b;
        S.nextFill = t + Math.min(5, Math.max(1.8, 4.6 - per * 3)) * (0.8 + Math.random() * 0.4);
      }

      // sword: holds the ~60 deg pose (tiny breathing), a short flick on each cut, lowered when paused
      const k = t - S.flick, flicking = !paused && k < 0.32;
      let target = paused ? A_REST : A_READY + 0.012 * Math.sin(t * 1.6);
      if (flicking) target = A_READY + (k < 0.05 ? -0.06 * (k / 0.05) : k < 0.12 ? -0.06 + 0.2 * ((k - 0.05) / 0.07) : 0.14 * (1 - (k - 0.12) / 0.2));
      S.a = flicking ? target : S.a + (target - S.a) * Math.min(1, dt * (paused ? 3 : 8));

      const ctx = S.ctx, W = S.W, H = S.H, pcw = S.pcw, BW = S.BW;
      ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      ctx.drawImage(S.ground.c, 0, S.gy, S.ground.w, S.ground.h);

      // ninja body (pre-rendered), then the sword at the hands
      ctx.globalAlpha = paused ? 0.75 : 1;
      const fr = S.frames[paused ? 0 : (t % 3.7 < 0.14 ? 2 : Math.floor(t * 2.5) % 2)];
      ctx.drawImage(fr.c, S.nx, S.ny, fr.w, fr.h);
      ctx.font = FX_F; ctx.textBaseline = "middle";
      ctx.save(); ctx.translate(S.hx, S.hy); ctx.rotate(S.a);
      ctx.fillStyle = MINT; ctx.fillText("(#)", -1.6 * pcw, 0);
      ctx.fillStyle = BLADE; const n = Math.round((L - 1.4 * pcw) / (pcw * 0.94));
      ctx.fillText("=".repeat(n) + ">", 1.4 * pcw, -2.5); ctx.fillText("/".repeat(n), 1.4 * pcw, 3);
      ctx.restore();

      // packets
      ctx.font = PK_F; ctx.textBaseline = "middle";
      const ph = Math.floor(t * 5) % 2;
      for (const p of S.packets.slice()) {
        if (p.state === "fly") {
          p.cx += p.dir * speed * dt; if (!paused) p.y = this.pos(p);   // paused: packets keep their line and pass straight through
          const past = p.dir > 0 ? p.cx >= S.tx : p.cx <= S.tx;
          if (past && !paused && p.arrive != null) this.cut(p);
          else if (p.cx < -BW - S.AW - 20 || p.cx > W + BW + S.AW + 20) { this.drop(p); continue; }
        }
        const x = p.cx - BW / 2;
        if (p.state === "fly") {
          // paused: a packet from the right slips past the lowered blade and fades out instead of crossing the ninja
          const fadeL = paused && p.dir < 0 ? Math.max(0, Math.min(1, (p.cx - S.tx - 60) / 100)) : 1;
          if (fadeL <= 0) { this.drop(p); continue; }
          if (p.lab) p.lab.style.opacity = fadeL < 1 ? fadeL.toFixed(2) : "";
          ctx.globalAlpha = fadeL; ctx.fillStyle = AMB;
          const ar = (p.dir > 0 ? ARR_R : ARR_L)[ph];
          for (let i = 0; i < 3; i++) {
            const y = p.y + (i - 1) * PLH;
            ctx.fillText(PACK[i], x, y); ctx.fillText(ar[i], p.dir > 0 ? x - 5.3 * pcw : x + BW + 0.3 * pcw, y);
          }
        } else {
          p.t += dt;
          if (p.t > 1.5) { this.drop(p); continue; }
          const e = 1 - Math.pow(1 - Math.min(1, p.t / 0.45), 3), fade = p.t < 0.6 ? 1 : Math.max(0, 1 - (p.t - 0.6) / 0.85);
          const fall = Math.max(0, p.t - 0.5) ** 2 * 50, hx = HALF * pcw;
          ctx.globalAlpha = fade; ctx.fillStyle = p.t < 0.1 ? HOT : CORAL;
          // two halves with a jagged gap (rows offset like a diagonal cut), drifting apart then dropping
          const half = (ox, oy, rot, a, b, sx) => {
            ctx.save(); ctx.translate(x + hx + ox, p.y + oy); ctx.rotate(rot);
            for (let i = 0; i < 3; i++) ctx.fillText(PACK[i].slice(a, b), sx - (i - 1) * 3, (i - 1) * PLH);
            ctx.restore();
          };
          half(-4 - 10 * e, 6 * e + fall, -0.12 * e, 0, HALF, -hx);
          half(6 + 12 * e, -6 * e + fall * 0.8, 0.1 * e, HALF, PACK[0].length, 0);
          if (p.t < 0.55) {   // the slash: a doubled / / streak across the packet at the blade tip
            ctx.globalAlpha = Math.min(1, 1.6 * (1 - p.t / 0.55)); ctx.fillStyle = p.t < 0.15 ? HOT : CORAL;
            for (let j = -3; j <= 3; j++) {
              const sx = x + hx + j * pcw * 0.55, sy = p.y - j * PLH * 0.62;
              ctx.fillText("/", sx - 4, sy); ctx.fillText("/", sx + 6, sy);
            }
          }
        }
        if (p.lab) {
          // labels sit right of the box; a packet coming from the left keeps its label above the blade tip
          // a flying packet's label rides just above its box (so it never crosses the blade); a cut one sits right of the halves
          const cut = p.state === "cut";
          const lx = Math.round(cut ? p.cx + BW / 2 + 12 : x + 2), ly = Math.round(cut ? p.y - 1.5 * PLH - 18 : p.y - 1.5 * PLH - 22);
          if (lx !== p.lx || ly !== p.ly) { p.lx = lx; p.ly = ly; p.lab.style.transform = `translate(${lx}px,${ly}px)`; }
          const mw = !cut && x < -2 ? 0 : Math.max(0, Math.min(230, Math.floor((W - lx - 4) / 8) * 8));   // no label before its box is in view
          if (mw !== p.mw) { p.mw = mw; p.lab.style.maxWidth = `${mw}px`; p.lab.style.visibility = mw < 72 ? "hidden" : ""; }
          if (p.state === "cut") p.lab.style.opacity = p.t < 0.6 ? "1" : String(Math.max(0, 1 - (p.t - 0.6) / 0.8).toFixed(2));
        }
      }

      // debris
      ctx.font = FX_F; ctx.fillStyle = CORAL;
      for (let i = S.debris.length - 1; i >= 0; i--) {
        const b = S.debris[i]; b.t += dt;
        if (b.t > b.life) { S.debris.splice(i, 1); continue; }
        b.vy += 140 * dt; b.x += b.vx * dt; b.y += b.vy * dt;
        ctx.globalAlpha = 1 - b.t / b.life; ctx.fillText(b.ch, b.x, b.y);
      }
      ctx.globalAlpha = 1;
    },
  };

  window.PiSkins.add("ninja", skin, "ASCII Ninja", "A ninja slashes incoming ad packets", K.T(
    '<rect width="160" height="96" fill="#020403"/>' +
    '<g font-family="Menlo, monospace" font-size="7"><text x="4" y="9" fill="#A6F2C8" font-weight="700">&gt; shinobi</text><text x="62" y="9" fill="#F5B54A">FILTER: ON</text></g>' +
    '<path d="M3 13H157M3 84H157" stroke="#A6F2C8" stroke-dasharray="2 1"/><path d="M118 15V82" stroke="#A6F2C8"/>' +
    '<g fill="none" stroke="#A6F2C8" stroke-width="1.4"><circle cx="34" cy="48" r="10"/><rect x="27" y="45" width="14" height="5"/><path d="M24 44H44M24 44L10 40M24 47L12 49M30 58L20 76M38 58L48 76M27 66H41M42 60L74 26"/></g>' +
    '<g fill="none" stroke="#FF7468" stroke-dasharray="2 1"><rect x="62" y="22" width="9" height="9" rx="2"/><rect x="76" y="18" width="9" height="9" rx="2"/></g><path d="M70 34L77 18M73 34L80 18" stroke="#FFE9E4"/>' +
    '<g fill="none" stroke="#F5B54A" stroke-dasharray="2 1"><rect x="20" y="18" width="14" height="9" rx="2"/><path d="M8 22H17"/><rect x="88" y="50" width="14" height="9" rx="2"/></g>' +
    '<path d="M4 80H112" stroke="#5E8F74" stroke-dasharray="3 2"/>' +
    '<rect x="122" y="22" width="30" height="6" fill="#A6F2C8"/><rect x="122" y="38" width="24" height="6" fill="#FF7468"/><rect x="122" y="54" width="30" height="6" fill="#A6F2C8"/>' +
    '<rect x="121" y="68" width="34" height="11" fill="none" stroke="#F5B54A"/>' +
    '<text x="4" y="93" font-family="Menlo, monospace" font-size="6" fill="#A6F2C8">&gt; intercepted: ads.example █</text>'));
})();
