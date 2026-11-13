// PACKET PINBALL: a vintage top-down playfield (static plate, themes/pinball/plate.webp) under a transparent canvas.
// Each newly blocked domain launches a chrome ball that bounces off the pop bumpers (the struck bumper flashes
// and its dome stays lit under the domain's speech bubble; latest 3, one per bumper), gets kicked by the
// slingshots, maybe flipped once, and finally drains (blocked!). Ambient balls between real arrivals follow the
// live blocked rate (time-lapsed, max 3 alive, no labels). Amber lamp inserts chase gently. Paused = TILT: lamps
// dark, flippers dead, balls just roll down and drain without lighting anything, a TILT sign shows the countdown.
// All physics in plate pixels (1140×900); sprites pre-rendered; 20 fps cap with 4 physics substeps.
(() => {
  "use strict";
  const K = window.PiSkinKit; if (!K) return;
  const PW = 1140, PH = 900, FPS = 20, SUB = 4, BR = 25, G = 1050, VMAX = 1500, MAXB = 3;
  const BUMP = [[371, 220], [768, 220], [570, 424]], BUMP_R = 84;           // cap centres (plate px)
  const DOME = [[372, 213], [768, 213], [570, 418]];                          // amber dome inserts
  const LAMPS = [[72, 560], [72, 450], [72, 338], [450, 64], [570, 52], [689, 64], [1068, 342], [1068, 450], [1068, 560]];   // chase order
  const DRAIN = [570, 838];
  const FLIP = [{ p: [316, 752], s: 1 }, { p: [824, 752], s: -1 }], FL = 178, FR = 21, A_DOWN = 0.44, A_UP = -0.4;
  // static walls as segments: slingshot triangles, deflectors from the side walls onto them, inlane guides to the flippers
  const SLING = [{ a: [160, 462], b: [306, 652], o: [138, 628], c: [226, 566] }, { a: [980, 462], b: [834, 652], o: [1002, 628], c: [914, 566] }];
  const SEGS = [];
  for (const s of SLING) SEGS.push({ a: s.a, b: s.b, kick: SLING.indexOf(s) }, { a: s.b, b: s.o }, { a: s.o, b: s.a });
  SEGS.push({ a: [128, 424], b: [160, 462] }, { a: [1012, 424], b: [980, 462] },
    { a: [128, 640], b: [300, 736] }, { a: [1012, 640], b: [840, 736] });
  const WALL_L = 128, WALL_R = 1012, ARCH = { cx: 570, cy: 424, rx: 442, ry: 384 };

  const mk = (w, h) => { const c = document.createElement("canvas"); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; };
  function glow(rgb, r, a0 = 1) {
    const c = mk(r * 2, r * 2), g = c.getContext("2d"), gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, `rgba(${rgb},${a0})`); gr.addColorStop(0.3, `rgba(${rgb},${a0 * 0.5})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2); return c;
  }
  function ballSprite(r) {
    const s = r * 2 + 4, c = mk(s, s), g = c.getContext("2d"), m = s / 2;
    let gr = g.createRadialGradient(m - r * 0.3, m - r * 0.38, r * 0.05, m, m, r);
    gr.addColorStop(0, "#FFFFFF"); gr.addColorStop(0.22, "#E9EDF3"); gr.addColorStop(0.55, "#9098A6"); gr.addColorStop(0.82, "#3E4450"); gr.addColorStop(1, "#1A1D24");
    g.fillStyle = gr; g.beginPath(); g.arc(m, m, r, 0, 7); g.fill();
    gr = g.createLinearGradient(0, m + r * 0.2, 0, m + r); gr.addColorStop(0, "rgba(255,190,120,0)"); gr.addColorStop(1, "rgba(255,190,120,.35)");   // warm playfield bounce light
    g.fillStyle = gr; g.beginPath(); g.arc(m, m, r, 0, 7); g.fill();
    g.fillStyle = "rgba(255,255,255,.95)"; g.beginPath(); g.ellipse(m - r * 0.34, m - r * 0.4, r * 0.26, r * 0.18, -0.6, 0, 7); g.fill();
    return c;
  }
  function shadowSprite(r) {
    const s = r * 2 + 12, c = mk(s, s), g = c.getContext("2d"), gr = g.createRadialGradient(s / 2, s / 2, r * 0.4, s / 2, s / 2, r + 6);
    gr.addColorStop(0, "rgba(0,0,10,.55)"); gr.addColorStop(1, "rgba(0,0,10,0)"); g.fillStyle = gr; g.fillRect(0, 0, s, s); return c;
  }
  function domeSprite(r) {   // a lit amber dome insert
    const c = mk(r * 2, r * 2), g = c.getContext("2d"), gr = g.createRadialGradient(r * 0.9, r * 0.85, 0, r, r, r);
    gr.addColorStop(0, "rgba(255,252,225,1)"); gr.addColorStop(0.35, "rgba(255,226,120,.95)"); gr.addColorStop(0.75, "rgba(255,160,40,.75)"); gr.addColorStop(1, "rgba(255,120,20,0)");
    g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2); return c;
  }
  // a cream flipper with a red pivot cap, pointing along +x from the pivot at (PAD+FR+6, H/2)
  const FPAD = 12, FRP = 31, FRT = 17;
  function flipperSprite(shadow) {
    const w = FPAD * 2 + FRP + FL + FRT, h = FPAD * 2 + FRP * 2, c = mk(w, h), g = c.getContext("2d"), px = FPAD + FRP, py = h / 2;
    const body = () => { g.beginPath(); g.arc(px, py, FRP, Math.PI / 2, Math.PI * 1.5); g.lineTo(px + FL, py - FRT); g.arc(px + FL, py, FRT, -Math.PI / 2, Math.PI / 2); g.closePath(); };
    if (shadow) { body(); g.fillStyle = "rgba(0,0,12,.5)"; g.fill(); return c; }
    body(); let gr = g.createLinearGradient(0, py - FRP, 0, py + FRP);
    gr.addColorStop(0, "#FFF8E6"); gr.addColorStop(0.45, "#F1E2BE"); gr.addColorStop(1, "#BFA77A");
    g.fillStyle = gr; g.fill(); g.lineWidth = 3; g.strokeStyle = "#5A4630"; g.stroke();
    g.lineWidth = 2; g.strokeStyle = "rgba(255,255,255,.7)"; g.beginPath(); g.moveTo(px + 6, py - FRP + 6); g.lineTo(px + FL - 4, py - FRT + 4); g.stroke();
    // red rubber edge along the bottom
    g.strokeStyle = "#B8202A"; g.lineWidth = 3; g.beginPath(); g.moveTo(px + 4, py + FRP - 2); g.lineTo(px + FL, py + FRT - 1); g.stroke();
    // red pivot cap with a chrome screw
    gr = g.createRadialGradient(px - 4, py - 5, 1, px, py, 15); gr.addColorStop(0, "#FF7A6A"); gr.addColorStop(0.6, "#D0202A"); gr.addColorStop(1, "#7A0A12");
    g.fillStyle = gr; g.beginPath(); g.arc(px, py, 14, 0, 7); g.fill(); g.strokeStyle = "#4A0608"; g.lineWidth = 2; g.stroke();
    gr = g.createRadialGradient(px - 2, py - 2, 0.5, px, py, 6); gr.addColorStop(0, "#FFFFFF"); gr.addColorStop(1, "#7A808C");
    g.fillStyle = gr; g.beginPath(); g.arc(px, py, 5.5, 0, 7); g.fill(); g.strokeStyle = "#3A3E46"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(px - 4, py); g.lineTo(px + 4, py); g.stroke();
    return c;
  }
  function closest(a, b, x, y) {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2));
    return [a[0] + dx * u, a[1] + dy * u];
  }

  const skin = {
    mount(el) {
      el.innerHTML = `
        <div class="pb-top">
          <div class="pb-title"><i class="pb-sl"></i><b>PACKET PINBALL</b><i class="pb-sl r"></i></div>
          <span class="pb-sp"></span>
          <span class="pb-pill" data-k="state"><i></i><span data-k="statet"></span></span>
          <button class="pb-btn" data-act="allowed" data-k="allowed" type="button"><span class="pb-bx">Allowed<span class="n"></span></span></button>
          <button class="pb-btn" data-act="style" type="button"><span class="pb-bx">Style<i class="pb-caret"></i></span></button>
        </div>
        <div class="pb-field">
          <img class="pb-plate" src="themes/pinball/plate.webp" alt="" draggable="false">
          <canvas class="pb-cv"></canvas>
          <div class="pb-bubs fade"></div>
          <div class="pb-tilt"><b>TILT</b><span data-k="cd"></span></div>
        </div>
        <div class="pb-side">
          <div class="pb-led"><div class="pb-num" data-k="blocked"></div><div class="pb-k" data-k="lab">Blocked / 24h</div></div>
          <div class="pb-led"><div class="pb-num" data-k="pct"></div><div class="pb-k">Blocked</div></div>
          <div class="pb-led"><div class="pb-num" data-k="total"></div><div class="pb-k">Queries / 24h</div></div>
          <div class="pb-meta" data-k="meta"></div>
          <div class="pb-bez"><button class="pb-pause" data-act="pause" data-k="pause" type="button"></button></div>
        </div>`;
      const field = el.querySelector(".pb-field"), img = el.querySelector(".pb-plate"), cv = el.querySelector(".pb-cv");
      const S = this.s = {
        m: null, ctx: cv.getContext("2d"), rate: K.rateTracker(), news: K.newsTracker(), seeded: false, queue: [], gap: 0, acc: 0, t: 0,
        balls: [], bub: [null, null, null], born: 0, flash: [0, 0, 0], ring: [0, 0, 0], kick: [0, 0], drainF: 0, allF: 0, dark: 0,
        flip: FLIP.map((f) => ({ ...f, a: A_DOWN, hold: 0, w: 0 })),
        ball: ballSprite(BR), shadow: shadowSprite(BR), dome: domeSprite(46), bglow: glow("255,170,60", 130, 0.9), lglow: glow("255,170,40", 62, 1),
        lcore: glow("255,236,170", 22, 1), sglow: glow("255,120,60", 120, 0.8), dglow: glow("255,210,140", 90, 0.9),
        fspr: flipperSprite(false), fsh: flipperSprite(true), bubs: el.querySelector(".pb-bubs"),
        dpr: 1, sc: 0.5, ox: 0, oy: 0, fw: 576, fh: 432,
      };
      const size = () => {
        const fw = field.clientWidth || 576, fh = field.clientHeight || 432, sc = Math.max(fw / PW, fh / PH);
        Object.assign(S, { fw, fh, sc, ox: (fw - PW * sc) / 2, oy: (fh - PH * sc) * 0.42, dpr: Math.min(2, window.devicePixelRatio || 1) });
        Object.assign(img.style, { left: `${S.ox}px`, top: `${S.oy}px`, width: `${PW * sc}px`, height: `${PH * sc}px` });
        cv.width = Math.round(fw * S.dpr); cv.height = Math.round(fh * S.dpr);
        S.bub.forEach((b, i) => b && this.place(b.el, i));
      };
      size(); this.ro = new ResizeObserver(size); this.ro.observe(field);
      this.stop = K.loop((dt) => this.frame(dt), FPS);
    },
    unmount() { if (this.stop) this.stop(); if (this.ro) this.ro.disconnect(); this.s = null; },

    // ------------------------------------------------------------ speech bubbles (one per bumper)
    place(e, i) {
      const S = this.s, x = S.ox + BUMP[i][0] * S.sc, y = S.oy + BUMP[i][1] * S.sc;
      e.style.left = e.style.right = "";
      if (i === 0) { e.style.right = `${S.fw - x - 58}px`; e.style.top = `${y - 96 * S.sc}px`; }
      else if (i === 1) { e.style.left = `${x - 58}px`; e.style.top = `${y - 96 * S.sc}px`; }
      else { e.style.left = `${x}px`; e.style.top = `${y + 92 * S.sc}px`; }
    },
    bubble(i, it) {
      const S = this.s, old = S.bub[i];
      if (old && old.it.domain === it.domain && old.it.seen_at === it.seen_at) return;
      if (old) { old.el.classList.add("out"); setTimeout(() => old.el.remove(), 500); }
      const e = document.createElement("div");
      e.className = `pb-bub b${i}`; e.dataset.domain = it.domain;
      e.innerHTML = `<b>${K.esc(it.domain)}</b><span></span>`;
      this.place(e, i); S.bubs.appendChild(e);
      S.bub[i] = { it, el: e, age: e.querySelector("span"), born: S.born++ };
      if (S.m) S.bub[i].age.textContent = K.short(K.ago(S.m, it));
    },
    target() {   // the bumper whose bubble is oldest (or empty)
      const S = this.s; let best = 0, bb = Infinity;
      for (let i = 0; i < 3; i++) { const b = S.bub[i], v = b ? b.born : -1; const taken = S.balls.some((x) => x.it && x.tgt === i); if (!taken && v < bb) { bb = v; best = i; } }
      return best;
    },
    launch(it) {
      const S = this.s; if (S.balls.length >= MAXB) return false;
      const tgt = it ? this.target() : (Math.random() * 3) | 0, paused = S.m && S.m.paused;
      let b;
      if (!it && Math.random() < 0.35) b = { x: 955, y: 392, vx: -320 - Math.random() * 120, vy: 40 };   // out of the right ramp
      else { const [bx] = BUMP[tgt]; b = { x: bx + (Math.random() < 0.5 ? -1 : 1) * (30 + Math.random() * 30), y: 96, vx: (Math.random() - 0.5) * 60, vy: 30 }; }
      if (paused) { b.x = 380 + Math.random() * 380; b.y = 96; b.vx = (Math.random() - 0.5) * 80; }
      S.balls.push(Object.assign(b, { it, tgt, hit: -1, flips: it ? 0 : (Math.random() < 0.5 ? 0 : 1), life: 0, drain: 0, cool: 0 }));
      return true;
    },

    render(el, m) {
      const S = this.s; if (!S) return; const d = m.data || {}; S.m = m; S.rate.update(m);
      if (!S.seeded) {   // the 3 newest blocked domains start out as bubbles (newest on the centre bumper)
        S.seeded = true; S.news(m.ticker);
        const seed = m.ticker.slice(0, 3);
        [1, 0, 2].forEach((slot, k) => { const it = seed[seed.length - 1 - k]; if (it) this.bubble(slot, it); });
      } else {
        S.queue.push(...S.news(m.ticker));
        if (S.queue.length > 3) S.queue.splice(0, S.queue.length - 3);
      }
      for (const b of S.bub) if (b) b.age.textContent = K.short(K.ago(m, b.it));
      const st = K.q(el, "state"); st.className = `pb-pill ${m.pill.cls}`; K.q(el, "statet").textContent = m.pill.text;
      const lab = K.q(el, "lab"); lab.textContent = m.labelAlert ? m.label : "Blocked / 24h"; lab.classList.toggle("alert", !!m.labelAlert);
      const set = (k, s) => { const e = K.q(el, k); if (e.dataset.v !== s) { e.dataset.v = s; e.innerHTML = K.esc(s).replace(/[,.]/g, "<i>$&</i>"); e.classList.toggle("sm", s.length > 7); K.fit(e, 16); } };
      set("blocked", K.num(d.blocked)); set("pct", K.pct(d.percent_blocked)); set("total", K.num(d.total));
      K.q(el, "cd").textContent = (m.pill.text.split("·")[1] || "").trim();
      K.q(el, "pause").textContent = K.pauseText(m);
      const mt = K.meta(m); K.q(el, "meta").textContent = `CPU ${mt.temp.replace("°", " ")}  |  Up ${mt.up}`;
      K.common(el, m);
    },

    // ------------------------------------------------------------ physics
    collide(b, nx, ny, e, surf) {   // reflect the velocity part going into the surface (normal n points out of it)
      const rvx = b.vx - (surf ? surf[0] : 0), rvy = b.vy - (surf ? surf[1] : 0), vn = rvx * nx + rvy * ny;
      if (vn < 0) { b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny; return -vn; }
      return 0;
    },
    step(b, h, paused) {
      const S = this.s;
      b.vy += G * h;
      if (b.y > 700) { const k = Math.min(1, (b.y - 700) / 140); b.vx += (DRAIN[0] - b.x) * 5 * k * h; }   // the apron funnels into the drain
      b.x += b.vx * h; b.y += b.vy * h;
      const sp = Math.hypot(b.vx, b.vy); if (sp > VMAX) { b.vx *= VMAX / sp; b.vy *= VMAX / sp; }
      // pop bumpers
      for (let i = 0; i < 3; i++) {
        const [cx, cy] = BUMP[i], dx = b.x - cx, dy = b.y - cy, dist = Math.hypot(dx, dy), R = BUMP_R + BR;
        if (dist >= R || dist < 1e-3) continue;
        const nx = dx / dist, ny = dy / dist; b.x = cx + nx * R; b.y = cy + ny * R;
        if (this.collide(b, nx, ny, 0.75) > 0) {
          if (!paused) { b.vx += nx * 420; b.vy += ny * 420; S.flash[i] = 1; S.ring[i] = 1; if (b.hit < 0 && b.it) { b.hit = i; this.bubble(i, b.it); } }
        }
      }
      // slingshots, deflectors, inlane guides
      for (const s of SEGS) {
        const [px, py] = closest(s.a, s.b, b.x, b.y), dx = b.x - px, dy = b.y - py, dd = dx * dx + dy * dy;
        if (dd >= BR * BR || dd < 1e-4) continue;
        const dist = Math.sqrt(dd), nx = dx / dist, ny = dy / dist; b.x = px + nx * BR; b.y = py + ny * BR;
        const vin = this.collide(b, nx, ny, 0.45);
        if (s.kick != null && vin > 60 && !paused) { b.vx += nx * 520; b.vy += ny * 520; S.kick[s.kick] = 1; }
      }
      // side walls and the top arch
      if (b.y > ARCH.cy) {
        if (b.x < WALL_L + BR) { b.x = WALL_L + BR; this.collide(b, 1, 0, 0.5); }
        if (b.x > WALL_R - BR) { b.x = WALL_R - BR; this.collide(b, -1, 0, 0.5); }
      } else {
        const ex = (b.x - ARCH.cx) / (ARCH.rx - BR), ey = (b.y - ARCH.cy) / (ARCH.ry - BR), e = ex * ex + ey * ey;
        if (e > 1) {
          const k = 1 / Math.sqrt(e); b.x = ARCH.cx + (b.x - ARCH.cx) * k; b.y = ARCH.cy + (b.y - ARCH.cy) * k;
          let nx = -ex / (ARCH.rx - BR), ny = -ey / (ARCH.ry - BR); const nl = Math.hypot(nx, ny); nx /= nl; ny /= nl;
          this.collide(b, nx, ny, 0.5);
        }
      }
      // flippers (capsules rotating about their pivots)
      for (const f of S.flip) {
        const th = f.s > 0 ? f.a : Math.PI - f.a, w = f.s > 0 ? f.w : -f.w;
        const tip = [f.p[0] + Math.cos(th) * FL, f.p[1] + Math.sin(th) * FL];
        const [px, py] = closest(f.p, tip, b.x, b.y), dx = b.x - px, dy = b.y - py, dd = dx * dx + dy * dy, R = FR + BR;
        if (dd >= R * R || dd < 1e-4) continue;
        const dist = Math.sqrt(dd), nx = dx / dist, ny = dy / dist; b.x = px + nx * R; b.y = py + ny * R;
        const surf = [-w * (py - f.p[1]), w * (px - f.p[0])];
        this.collide(b, nx, ny, 0.3, surf);
        if (f.w < -1) b.flips++;
      }
    },

    frame(dt) {
      const S = this.s; if (!S) return; const m = S.m; if (!m || m.asleep) return;
      S.t += dt;
      const paused = m.paused, off = paused || m.stale;
      S.dark += ((off ? 1 : 0) - S.dark) * Math.min(1, dt * 4);
      // real blocked domains first, one at a time
      S.gap -= dt;
      if (!paused && S.queue.length && S.gap <= 0 && this.launch(S.queue[0])) { S.queue.shift(); S.gap = 0.9; }
      // ambient balls follow the blocked rate (time-lapsed, capped); a slow trickle while TILTed
      if (!m.stale) {
        const r = S.rate.get(m), per = paused ? 0.12 : Math.min(0.55, 0.12 + r.b * 0.25);
        S.acc += dt * per;
        if (S.acc >= 1) { S.acc = 0; if (!S.queue.length && S.balls.length < MAXB - 1) this.launch(null); }
      }
      // flippers: flick up when a live ball comes near (never while TILTed)
      for (const f of S.flip) {
        if (f.hold > 0) f.hold -= dt;
        else if (!paused) {
          const near = S.balls.some((b) => !b.drain && b.flips < 1 && b.vy > 0 && b.y > 680 && b.y < 790 && (f.s > 0 ? b.x < DRAIN[0] : b.x > DRAIN[0]) && Math.abs(b.x - (f.p[0] + f.s * 85)) < 105);
          if (near) f.hold = 0.24;
        }
      }
      const h = Math.min(dt, 0.075) / SUB;
      for (let s = 0; s < SUB; s++) {
        for (const f of S.flip) {
          const goal = f.hold > 0 ? A_UP : A_DOWN, a0 = f.a, v = f.hold > 0 ? 20 : 9;
          f.a = goal < f.a ? Math.max(goal, f.a - v * h) : Math.min(goal, f.a + v * h);
          f.w = (f.a - a0) / h;
        }
        for (const b of S.balls) if (!b.drain) this.step(b, h, paused);
      }
      for (let i = S.balls.length - 1; i >= 0; i--) {
        const b = S.balls[i]; b.life += dt;
        if (!b.drain && ((b.y > 790 && Math.abs(b.x - DRAIN[0]) < 62) || b.y > 870 || b.life > 22)) {
          b.drain = 0.001; b.dx0 = b.x; b.dy0 = b.y;
          if (b.it && b.hit < 0 && !paused) this.bubble(b.tgt, b.it);
        }
        if (b.drain) {
          b.drain += dt / 0.4; const u = Math.min(1, b.drain);
          b.x = b.dx0 + (DRAIN[0] - b.dx0) * u; b.y = b.dy0 + (DRAIN[1] - b.dy0) * u;
          if (b.drain >= 1) { S.balls.splice(i, 1); if (!paused) { S.drainF = 1; if (b.it) S.allF = 1; } }
        }
      }

      // ------------------------------------------------------------ draw (plate coordinates)
      const ctx = S.ctx, k = S.dpr * S.sc;
      ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0); ctx.clearRect(0, 0, S.fw, S.fh);
      ctx.setTransform(k, 0, 0, k, S.dpr * S.ox, S.dpr * S.oy);
      const lit = 1 - S.dark;
      // lamp inserts: a gentle chase plus twinkle; all flash when a real block drains
      if (lit > 0.02) {
        S.allF = Math.max(0, S.allF - dt * 1.6);
        const head = S.t * 3.2;
        LAMPS.forEach(([x, y], i) => {
          const dd = ((head - i) % LAMPS.length + LAMPS.length) % LAMPS.length;
          let a = Math.max(0, 1 - dd / 2.5) * 0.75 + 0.4 + 0.15 * Math.sin(S.t * 2.1 + i * 1.7);
          a = Math.min(1, Math.max(a, S.allF * (i % 2 ? 1 : 0.8))) * lit * (m.stale ? 0.5 : 1);
          ctx.globalAlpha = a; ctx.drawImage(S.lglow, x - 62, y - 62); ctx.drawImage(S.lcore, x - 22, y - 22);
        });
      }
      // bumpers: steady glow under a bubble, flash + ring when struck
      for (let i = 0; i < 3; i++) {
        const [dx, dy] = DOME[i], base = S.bub[i] ? 0.5 * lit : 0, f = S.flash[i];
        S.flash[i] = Math.max(0, f - dt * 3); S.ring[i] = Math.max(0, S.ring[i] - dt * 2.2);
        const a = Math.min(1, base + f);
        if (a > 0.01) { ctx.globalAlpha = a * 0.85; ctx.drawImage(S.bglow, dx - 130, dy - 130); ctx.globalAlpha = a; ctx.drawImage(S.dome, dx - 46, dy - 46); }
        if (S.ring[i] > 0) {
          const u = 1 - S.ring[i]; ctx.globalAlpha = S.ring[i] * 0.9; ctx.strokeStyle = "#FFD27A"; ctx.lineWidth = 7 * (1 - u * 0.6);
          ctx.beginPath(); ctx.arc(BUMP[i][0], BUMP[i][1], BUMP_R + 6 + u * 60, 0, 7); ctx.stroke();
        }
      }
      // slingshot kicks
      for (let i = 0; i < 2; i++) {
        if (S.kick[i] <= 0) continue;
        const s = SLING[i]; ctx.globalAlpha = S.kick[i]; ctx.drawImage(S.sglow, s.c[0] - 120, s.c[1] - 120);
        ctx.strokeStyle = "#FFF0C8"; ctx.lineWidth = 8; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(s.a[0], s.a[1]); ctx.lineTo(s.b[0], s.b[1]); ctx.stroke();
        S.kick[i] = Math.max(0, S.kick[i] - dt * 4);
      }
      if (S.drainF > 0) { ctx.globalAlpha = S.drainF; ctx.drawImage(S.dglow, DRAIN[0] - 90, DRAIN[1] - 90); S.drainF = Math.max(0, S.drainF - dt * 2); }
      // flippers (shadow, then body); the right one is the mirror image
      for (const f of S.flip) {
        for (const [spr, ox, oy, al] of [[S.fsh, 7, 10, 1], [S.fspr, 0, 0, 1]]) {
          ctx.save(); ctx.globalAlpha = al; ctx.translate(f.p[0] + ox, f.p[1] + oy); if (f.s < 0) ctx.scale(-1, 1); ctx.rotate(f.a);
          ctx.drawImage(spr, -(FPAD + FRP), -spr.height / 2); ctx.restore();
        }
      }
      // balls (shrink into the drain)
      for (const b of S.balls) {
        const s = b.drain ? Math.max(0.05, 1 - b.drain * 0.85) : 1, r = (BR + 2) * s;
        ctx.globalAlpha = (b.drain ? 1 - b.drain : 1) * 0.8; ctx.drawImage(S.shadow, b.x - r - 6 + 6, b.y - r - 6 + 9, (r + 6) * 2, (r + 6) * 2);
        ctx.globalAlpha = 1; ctx.drawImage(S.ball, b.x - r, b.y - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
    },
  };

  window.PiSkins.add("pinball", skin, "Packet Pinball", "Ads bounce off the bumpers and drain", K.T(
    '<rect width="160" height="96" fill="#0A1430"/><rect x="0" y="0" width="112" height="96" fill="#14285A"/>' +
    '<path d="M8 96V30Q8 8 30 8h52q22 0 22 22v66" fill="none" stroke="#C8CED8" stroke-width="2"/>' +
    '<path d="M56 50 30 96h52z" fill="#D8322A" opacity=".55"/><path d="M56 50 44 96h24z" fill="#F1E2BE" opacity=".6"/>' +
    '<g fill="#F1E2BE" stroke="#B8202A" stroke-width="1.5"><circle cx="36" cy="30" r="9"/><circle cx="76" cy="30" r="9"/><circle cx="56" cy="50" r="9"/></g>' +
    '<g fill="#FFB43C"><circle cx="36" cy="30" r="4"/><circle cx="76" cy="30" r="4"/><circle cx="56" cy="50" r="5" fill="#FFE9A0"/></g>' +
    '<path d="M16 54 28 46 30 70z M96 54 84 46 82 70z" fill="#D8322A" stroke="#F1E2BE"/>' +
    '<path d="M24 76 46 84M88 76 66 84" stroke="#F1E2BE" stroke-width="6" stroke-linecap="round"/><circle cx="56" cy="90" r="5" fill="#000" stroke="#C8CED8"/>' +
    '<circle cx="66" cy="40" r="3.5" fill="#DDE2EA"/><g fill="#FFB43C"><circle cx="48" cy="12" r="2"/><circle cx="56" cy="11" r="2"/><circle cx="64" cy="12" r="2"/></g>' +
    '<g fill="#1A1A1E" stroke="#C8CED8"><rect x="118" y="8" width="36" height="18" rx="3"/><rect x="118" y="30" width="36" height="18" rx="3"/><rect x="118" y="52" width="36" height="18" rx="3"/></g>' +
    '<g fill="#FFA82A"><rect x="123" y="13" width="26" height="6"/><rect x="126" y="35" width="20" height="6"/><rect x="123" y="57" width="26" height="6"/></g>' +
    '<rect x="118" y="76" width="36" height="14" rx="4" fill="#E0242C" stroke="#C8CED8"/>'));
})();
