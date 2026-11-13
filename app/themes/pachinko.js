// PACKET PACHINKO: queries are steel balls shot up the rail into the pin field of a photoreal cabinet (static plate,
// themes/pachinko/plate.webp, painted once as an <img>). Balls rattle through chrome nail pins, deflect around the centre
// feature (a ball can drop into its top START slot and fall through the window as a bonus) and the two star pockets
// (they catch balls and flash), and end in the GREEN (allowed) or RED (blocked) tray; the share that lands in red is the
// real blocked percentage (time-lapsed, capped at 30 balls in flight, 20 fps, 3 physics substeps). Pins are baked once
// onto a static overlay canvas; lamps blink with pre-rendered glow / dim sprites laid over the painted lamps. Trays fill
// and empty in rounds. Paused: the red tray's shutter closes, every ball goes green, the feature's green lamps go dark,
// the amber strips flash in unison and the feature window shows FEVER PAUSED with the countdown.
(() => {
  "use strict";
  const K = window.PiSkinKit; if (!K) return;
  const { esc, num, q, ago, short, meta, common, pauseText } = K;

  // ---------------------------------------------------------------- geometry (canvas px = plate px / 2; plate 1104×960)
  const W = 552, H = 480, CX = 276, CY = 242, RX = 200, RY = 222;     // pink playfield inside the glass (ellipse)
  const FEAT = [[249, 131], [304, 131], [325, 150], [350, 175], [365, 210], [365, 245], [348, 268], [320, 305], [295, 322],
    [257, 322], [232, 305], [204, 268], [187, 245], [187, 210], [202, 175], [227, 150]];               // centre feature box
  const SLOT = { x0: 267, x1: 285, y: 131 };                            // START slot at the top of the feature
  const STARL = [[96, 305], [118, 295], [150, 295], [171, 305], [166, 330], [150, 352], [117, 352], [100, 330]];
  const STARS = [{ cx: 133.5, poly: STARL, allowed: true }, { cx: 418.5, poly: STARL.map(([x, y]) => [W - x, y]), allowed: false }];
  const STAR_TOP = 295;
  const DIVP = [[228, 374], [276, 363], [324, 374], [312, 440], [240, 440]];   // chrome splitter between the trays
  const TRAY = { a: { x0: 136, x1: 248, cx: 191 }, b: { x0: 306, x1: 422, cx: 364 }, y0: 371, y1: 424 };
  const LAND_Y = 378;
  // painted lamps, measured on the plate
  const L_FG = [[241.5, 158.5], [310.5, 158.5], [222, 187.5], [330.5, 187.5], [248, 293], [304, 293]];   // feature greens
  const L_FR = [[211.5, 218.5], [211.5, 233], [340.5, 218.5], [340.5, 233]];                             // feature reds
  const L_TOP = [37, 47, 57, 67.5].map((x) => [x, 75.5]).concat([67.5, 57, 47, 37].map((x) => [W - x, 75.5]));   // top amber strips
  const L_SIDE = [203.5, 238.5, 275].map((y) => [15.5, y]).concat([203.5, 238.5, 275].map((y) => [W - 15.5, y]));
  const L_LENS = [[61, 246], [491, 246]];
  const L_STAR = STARS.map((s) => [[-31, 311.5], [31.5, 311.5], [-21, 343.5], [20.5, 343.5]].map(([dx, y]) => [s.cx + dx, y]));
  const BR = 5.5, PIN_D = 7.6, CELL = 16, G = 430, MAXB = 30, ROUND = 36;

  const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  const inField = (x, y, m = 0) => ((x - CX) / (RX - m)) ** 2 + ((y - CY) / (RY - m)) ** 2 <= 1;

  // ---------------------------------------------------------------- convex polygon obstacles
  function poly(pts) {
    const n = pts.length, gx = pts.reduce((s, p) => s + p[0], 0) / n, gy = pts.reduce((s, p) => s + p[1], 0) / n, edges = [];
    for (let i = 0; i < n; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % n], len = Math.hypot(bx - ax, by - ay);
      let nx = (by - ay) / len, ny = -(bx - ax) / len;
      if (((ax + bx) / 2 - gx) * nx + ((ay + by) / 2 - gy) * ny < 0) { nx = -nx; ny = -ny; }
      edges.push({ ax, ay, bx, by, nx, ny, len });
    }
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return { edges, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  }
  // signed distance from (x, y) to a convex polygon (negative inside) and the outward normal
  function polyHit(P, x, y) {
    let best = -1e9, bn = null;
    for (const e of P.edges) { const sd = (x - e.ax) * e.nx + (y - e.ay) * e.ny; if (sd > best) { best = sd; bn = e; } }
    if (best <= 0) return { d: best, nx: bn.nx, ny: bn.ny };
    let md = 1e9, nx = 0, ny = 0;
    for (const e of P.edges) {
      const ex = e.bx - e.ax, ey = e.by - e.ay, t = cl(((x - e.ax) * ex + (y - e.ay) * ey) / (e.len * e.len), 0, 1);
      const dx = x - (e.ax + ex * t), dy = y - (e.ay + ey * t), d = Math.hypot(dx, dy);
      if (d < md) { md = d; nx = dx / (d || 1); ny = dy / (d || 1); }
    }
    return { d: md, nx, ny };
  }
  const PF = poly(FEAT), PS = STARS.map((s) => poly(s.poly)), PD = poly(DIVP);

  function collidePoly(b, P, e) {
    if (b.x < P.x0 - BR || b.x > P.x1 + BR || b.y < P.y0 - BR || b.y > P.y1 + BR) return false;
    const h = polyHit(P, b.x, b.y); if (h.d >= BR) return false;
    b.x += h.nx * (BR - h.d); b.y += h.ny * (BR - h.d);
    const vn = b.vx * h.nx + b.vy * h.ny; if (vn < 0) { b.vx -= (1 + e) * vn * h.nx; b.vy -= (1 + e) * vn * h.ny; }
    return true;
  }
  // ---------------------------------------------------------------- 7-segment digits (SVG)
  const SEGS = { 0: "abcdef", 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc", 5: "afgcd", 6: "afgedc", 7: "abc", 8: "abcdefg", 9: "abcdfg", "-": "g", "–": "g", " ": "" };
  const T = 3.3;
  const hseg = (x, y, l) => `${x},${y + T / 2} ${x + T / 2},${y} ${x + l - T / 2},${y} ${x + l},${y + T / 2} ${x + l - T / 2},${y + T} ${x + T / 2},${y + T}`;
  const vseg = (x, y, l) => `${x + T / 2},${y} ${x + T},${y + T / 2} ${x + T},${y + l - T / 2} ${x + T / 2},${y + l} ${x},${y + l - T / 2} ${x},${y + T / 2}`;
  const SEGP = { a: hseg(1.4, 0, 10), b: vseg(10.2, 1.2, 10), c: vseg(10.2, 11.6, 10), d: hseg(1.4, 20.8, 10), e: vseg(0, 11.6, 10), f: vseg(0, 1.2, 10), g: hseg(1.4, 10.4, 10) };
  function seg7(s) {
    let x = 0, off = "", on = "";
    for (const ch of s) {
      if (ch === "," || ch === ".") { on += `<polygon points="${x + 1},20.6 ${x + 3.8},20.6 ${x + 3.2},${ch === "," ? 25 : 23.4} ${x + 0.4},${ch === "," ? 25 : 23.4}"/>`; x += 5.5; continue; }
      const lit = SEGS[ch] == null ? "" : SEGS[ch];
      const tr = (k) => `<polygon transform="translate(${x} 0)" points="${SEGP[k]}"/>`;
      for (const k of "abcdefg") { if (lit.includes(k)) on += tr(k); else off += tr(k); }
      x += 14.5;
    }
    return `<svg class="pk-seg" viewBox="-1 -1 ${x + 1} 27" preserveAspectRatio="xMinYMid meet" aria-label="${esc(s)}"><g transform="skewX(-7) translate(2 0)"><g class="off">${off}</g><g class="on">${on}</g></g></svg>`;
  }

  // ---------------------------------------------------------------- sprites (all baked once)
  function ballSprite(r) {
    const s = Math.ceil(r * 2 + 2), c = mk(s, s), g = c.getContext("2d"), m = s / 2;
    const gr = g.createRadialGradient(m - r * 0.35, m - r * 0.4, 0.3, m, m, r);
    gr.addColorStop(0, "#FFFFFF"); gr.addColorStop(0.25, "#E8ECF2"); gr.addColorStop(0.6, "#8C94A0"); gr.addColorStop(0.85, "#4A505A"); gr.addColorStop(1, "#2A2E36");
    g.fillStyle = gr; g.beginPath(); g.arc(m, m, r, 0, 7); g.fill();
    g.strokeStyle = "#14161C"; g.lineWidth = 1.2; g.beginPath(); g.arc(m, m, r - 0.4, 0, 7); g.stroke();
    g.fillStyle = "#FFFFFF"; g.beginPath(); g.arc(m - r * 0.36, m - r * 0.4, r * 0.3, 0, 7); g.fill();
    g.fillStyle = "rgba(255,255,255,.5)"; g.beginPath(); g.arc(m + r * 0.3, m + r * 0.42, r * 0.2, 0, 7); g.fill();
    return c;
  }
  // chrome nail head seen from the front, with a little cast shadow down-right (12×12, centre at 5,5)
  function pinSprite() {
    const c = mk(12, 12), g = c.getContext("2d");
    g.fillStyle = "rgba(70,0,20,.42)"; g.beginPath(); g.ellipse(6.6, 7.2, 3.2, 2.8, 0, 0, 7); g.fill();
    g.fillStyle = "#3A3E46"; g.beginPath(); g.arc(5, 5, 3, 0, 7); g.fill();
    const p = g.createRadialGradient(4.1, 4, 0.2, 5, 5, 2.8); p.addColorStop(0, "#FFFFFF"); p.addColorStop(0.4, "#DDE3EA"); p.addColorStop(0.8, "#7E8794"); p.addColorStop(1, "#545B66");
    g.fillStyle = p; g.beginPath(); g.arc(5, 5, 2.55, 0, 7); g.fill();
    g.fillStyle = "#FFFFFF"; g.fillRect(3.6, 3.5, 1.3, 1.3);
    return c;
  }
  function glow(rgb, r) { const c = mk(r * 2, r * 2), g = c.getContext("2d"), gr = g.createRadialGradient(r, r, 0, r, r, r); gr.addColorStop(0, `rgba(${rgb},.95)`); gr.addColorStop(0.35, `rgba(${rgb},.45)`); gr.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2); return c; }
  // "lamp off": a soft dark disc that knocks the painted lamp back to an unlit lens
  function dim(rgb, r) { const c = mk(r * 2, r * 2), g = c.getContext("2d"), gr = g.createRadialGradient(r, r, 0, r, r, r); gr.addColorStop(0, `rgba(${rgb},.82)`); gr.addColorStop(0.62, `rgba(${rgb},.7)`); gr.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2); return c; }
  // the red tray's closed shutter (paused)
  function shutter() {
    const t = TRAY.b, x0 = t.x0 - 4, y0 = TRAY.y0 - 4, w = t.x1 - t.x0 + 8, h = TRAY.y1 - TRAY.y0 + 6, c = mk(W, H), g = c.getContext("2d");
    g.fillStyle = "#24272E"; g.fillRect(x0, y0, w, h);
    g.save(); g.beginPath(); g.rect(x0 + 3, y0 + 3, w - 6, h - 6); g.clip(); g.fillStyle = "#F2C21A";
    for (let x = x0 - 60; x < x0 + w; x += 16) { g.beginPath(); g.moveTo(x, y0 + h); g.lineTo(x + 8, y0 + h); g.lineTo(x + 8 + h, y0); g.lineTo(x + h, y0); g.closePath(); g.fill(); }
    g.restore();
    g.fillStyle = "#14161C"; g.fillRect(t.cx - 34, y0 + h / 2 - 11, 68, 22); g.strokeStyle = "#9AA2AE"; g.lineWidth = 2; g.strokeRect(t.cx - 34, y0 + h / 2 - 11, 68, 22);
    g.font = "italic 900 14px 'Inter Tight', Inter, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#FF4A4A"; g.fillText("CLOSED", t.cx, y0 + h / 2 + 1);
    return c;
  }

  // ---------------------------------------------------------------- pins: laid out on the painted field, baked once
  function makePins() {
    const pins = [], grid = new Map();
    const free = (x, y) => {
      if (!inField(x, y, 17) || y > 356) return false;   // clearances below leave either no gap or a ball-sized one
      if (polyHit(PF, x, y).d < 14) return false;
      if (Math.abs(x - CX) < 14 && y > 100 && y < SLOT.y) return false;           // lane down to the START slot
      if (Math.abs(x - CX) < 15 && y > 318) return false;                           // drop lane under the feature
      for (let i = 0; i < 2; i++) {
        if (polyHit(PS[i], x, y).d < 14) return false;
        if (Math.abs(x - STARS[i].cx) < 16 && y > 262 && y < STAR_TOP) return false; // star pocket mouths
      }
      return true;
    };
    for (let row = 0, y = 30; y < 360; y += 15, row++) {
      for (let x = 22 + (row % 2) * 9; x < W - 20; x += 18) {
        const jx = x + Math.sin(y * 0.7 + x) * 1.1;
        if (free(jx, y)) pins.push([jx, y]);
      }
    }
    // guide pins: a funnel over the START slot
    pins.push([CX - 11, 118], [CX + 11, 118]);
    pins.forEach((p, i) => { const k = `${(p[0] / CELL) | 0},${(p[1] / CELL) | 0}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); });
    return { pins, grid };
  }
  function paintPins(pins) {
    const c = mk(W, H), g = c.getContext("2d"), spr = pinSprite();
    for (const [x, y] of pins) g.drawImage(spr, Math.round(x) - 5, Math.round(y) - 5);
    return c;
  }

  // ---------------------------------------------------------------- skin
  const skin = {
    mount(el) {
      el.innerHTML = `
        <div class="pk-cab"><div class="pk-stage">
          <img class="pk-plate" src="themes/pachinko/plate.webp" alt="" draggable="false">
          <canvas class="pk-pins"></canvas><canvas class="pk-cv"></canvas>
          <div class="pk-disp" data-k="disp"><b data-k="dispt"></b><span data-k="disps"></span></div></div></div>
        <div class="pk-side">
          <div class="pk-title"><i></i><b>PACKET PACHINKO</b><i></i></div>
          <div class="pk-row">
            <span class="pk-pill" data-k="state"><i></i><span data-k="statet"></span></span>
            <button class="pk-btn" data-act="allowed" data-k="allowed" type="button">Allowed<span class="n"></span></button>
            <button class="pk-btn" data-act="style" type="button">Style</button>
          </div>
          <div class="pk-stat"><div class="pk-num" data-k="blocked"></div><div class="pk-k" data-k="lab">Blocked / 24h</div><i class="pk-g slash"></i></div>
          <div class="pk-stat"><div class="pk-numrow"><div class="pk-num" data-k="pct"></div><b class="pk-pc">%</b></div><div class="pk-k">Blocked</div>
            <svg class="pk-g" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="13" fill="none" stroke="#3A3E46" stroke-width="6"/><circle class="pk-donut" data-k="donut" cx="18" cy="18" r="13" fill="none" stroke="#FF3040" stroke-width="6" pathLength="100" stroke-dasharray="0 100" transform="rotate(-90 18 18)"/></svg></div>
          <div class="pk-stat"><div class="pk-num" data-k="total"></div><div class="pk-k">Queries / 24h</div><i class="pk-g bars" data-k="bars"><i></i><i></i><i></i><i></i><i></i><i></i></i></div>
          <ol class="pk-list fade" data-k="list"></ol>
          <div class="pk-pb"><button class="pk-pause" data-act="pause" data-k="pause" type="button"></button></div>
          <div class="pk-meta" data-k="meta"></div>
        </div>`;
      const host = el.querySelector(".pk-cab"), stage = el.querySelector(".pk-stage"), cv = el.querySelector(".pk-cv"), pc = el.querySelector(".pk-pins"), ctx = cv.getContext("2d");
      cv.width = pc.width = W; cv.height = pc.height = H;
      const P = makePins();
      pc.getContext("2d").drawImage(paintPins(P.pins), 0, 0);
      const S = this.s = {
        m: null, ctx, P, ball: ballSprite(BR), shut: shutter(),
        gG: glow("90,255,120", 15), gR: glow("255,70,60", 14), gA: glow("255,190,60", 13), gY: glow("255,236,90", 12), gL: glow("255,80,50", 26),
        dG: dim("6,40,14", 8), dR: dim("60,4,8", 7), dA: dim("70,26,0", 7), dY: dim("80,40,0", 7), dL: dim("60,0,4", 16),
        rate: K.rateTracker(), news: K.newsTracker(), balls: [], acc: 0, pile: { a: 0, b: 0 }, drain: 0, flashA: 0, flashB: 0,
        fever: 0, starF: [0, 0], vals: {}, lastBars: 0,
      };
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (this.s === S) S.shut = shutter(); });
      const disp = q(el, "disp");   // the paused read-out sits in the feature's window (percentages of the stage)
      Object.assign(disp.style, { left: `${(241 / W) * 100}%`, top: `${(186 / H) * 100}%`, width: `${(70 / W) * 100}%`, height: `${(84 / H) * 100}%` });
      const size = () => {   // cover the cabinet column (crops a few px of chrome frame at the sides, keeps 1:1 pixels at 800×480)
        const hw = host.clientWidth, hh = host.clientHeight, sc = Math.max(hw / W, hh / H) || 1;
        stage.style.width = `${W * sc}px`; stage.style.height = `${H * sc}px`;
      };
      size(); this.ro = new ResizeObserver(size); this.ro.observe(host);
      this.stop = K.loop((dt, t) => this.frame(dt, t), 20);
    },
    unmount() { if (this.stop) this.stop(); if (this.ro) this.ro.disconnect(); this.s = null; },

    render(el, m) {
      const S = this.s, d = m.data || {}, mt = meta(m); S.m = m; S.rate.update(m);
      for (const it of S.news(m.ticker)) this.launch(!m.paused);
      const st = q(el, "state"); st.className = `pk-pill ${m.pill.cls}`; q(el, "statet").textContent = m.paused ? m.pill.text.replace(" · ", " ") : m.pill.text;
      const set = (k, s) => { if (S.vals[k] !== s) { S.vals[k] = s; q(el, k).innerHTML = seg7(s); } };
      set("blocked", num(d.blocked)); set("total", num(d.total)); set("pct", typeof d.percent_blocked === "number" ? d.percent_blocked.toFixed(1) : "--");
      q(el, "donut").setAttribute("stroke-dasharray", `${cl(d.percent_blocked || 0, 0, 100).toFixed(1)} 100`);
      q(el, "lab").textContent = m.labelAlert ? m.label : "Blocked / 24h";
      const r = S.rate.get(m), lit = cl(Math.round(2 + r.q * 1.2), 1, 6);
      if (lit !== S.lastBars) { S.lastBars = lit; q(el, "bars").querySelectorAll("i").forEach((b, i) => b.classList.toggle("on", i < lit)); }
      q(el, "list").innerHTML = m.ticker.slice(0, 3).map((it) =>
        `<li data-domain="${esc(it.domain)}"><i class="pk-ball"></i><span class="d">${esc(it.domain)}</span><span class="t">${esc(short(ago(m, it)))}</span></li>`).join("")
        || '<li class="empty"><i class="pk-ball"></i><span class="d">Nothing blocked yet</span></li>';
      const cd = (m.pill.text.split("·")[1] || "").trim();
      q(el, "disp").classList.toggle("on", m.paused); q(el, "dispt").textContent = "FEVER PAUSED"; q(el, "disps").textContent = cd;
      q(el, "pause").textContent = pauseText(m);
      q(el, "meta").textContent = `CPU ${mt.temp}  |  Up ${mt.up}`;
      common(el, m);
    },

    launch(blocked) {
      const S = this.s; if (S.balls.length >= MAXB) return;
      S.balls.push({ rail: true, a: 2.5, rel: 4.0 + Math.random() * 0.95, x: 0, y: 0, vx: 0, vy: 0, blocked, life: 0, sp: 3.6 + Math.random() * 0.6, bonus: -1, hold: 0, star: -1, still: 0 });
    },

    step(b, h) {   // one physics substep for a free ball; returns "slot", "star0"/"star1" or ""
      const S = this.s, P = S.P, tx = b.blocked ? TRAY.b.cx : TRAY.a.cx;
      b.vy += G * h;
      if (b.y > 90) {   // a steer toward the ball's tray (the "nail adjustment"), stronger the lower it gets
        const k = cl((b.y - 90) / 200, 0, 1); b.vx += cl((tx - b.x) * 8, -650, 650) * k * h; b.vx *= 1 - 1.8 * k * h;
      }
      b.x += b.vx * h; b.y += b.vy * h;
      const sp = Math.hypot(b.vx, b.vy); if (sp > 260) { b.vx *= 260 / sp; b.vy *= 260 / sp; }
      // START slot on top of the feature
      if (b.vy > 0 && b.x > SLOT.x0 && b.x < SLOT.x1 && b.y + BR >= SLOT.y && b.y < SLOT.y + 6) return "slot";
      // star pockets catch balls bound for the tray on their side
      for (let i = 0; i < 2; i++) {
        const s = STARS[i];
        if (s.allowed !== b.blocked && b.vy > 0 && Math.abs(b.x - s.cx) < 16 && b.y + BR >= STAR_TOP && b.y < STAR_TOP + 6) return `star${i}`;
      }
      // pins
      const gx = (b.x / CELL) | 0, gy = (b.y / CELL) | 0;
      for (let ix = gx - 1; ix <= gx + 1; ix++) for (let iy = gy - 1; iy <= gy + 1; iy++) {
        const list = P.grid.get(`${ix},${iy}`); if (!list) continue;
        for (const i of list) {
          const [px, py] = P.pins[i], dx = b.x - px, dy = b.y - py, dd = dx * dx + dy * dy;
          if (dd >= PIN_D * PIN_D || dd < 1e-4) continue;
          const dist = Math.sqrt(dd), nx = dx / dist, ny = dy / dist; b.x = px + nx * PIN_D; b.y = py + ny * PIN_D;
          const vn = b.vx * nx + b.vy * ny; if (vn < 0) { b.vx -= 1.45 * vn * nx; b.vy -= 1.45 * vn * ny; b.vx += (Math.random() - 0.5) * 18; }
        }
      }
      // obstacles: the feature, the star pockets, the tray splitter
      if (collidePoly(b, PF, 0.4) && Math.abs(b.vx) < 25 && b.y < PF.y0 + 8) b.vx += b.x < CX ? -30 : 30;   // don't balance on the roof
      collidePoly(b, PS[0], 0.45); collidePoly(b, PS[1], 0.45);
      if (collidePoly(b, PD, 0.3) && Math.abs(b.vx) < 30) b.vx += b.blocked ? 40 : -40;
      // the glass rim
      const ex = (b.x - CX) / (RX - 6), ey = (b.y - CY) / (RY - 6), e = ex * ex + ey * ey;
      if (e > 1) {
        const k = 1 / Math.sqrt(e); b.x = CX + (b.x - CX) * k; b.y = CY + (b.y - CY) * k;
        let nx = -ex / (RX - 6), ny = -ey / (RY - 6); const nl = Math.hypot(nx, ny); nx /= nl; ny /= nl;
        const vn = b.vx * nx + b.vy * ny; if (vn < 0) { b.vx -= 1.4 * vn * nx; b.vy -= 1.4 * vn * ny; }
      }
      return "";
    },

    frame(dt, t) {
      const S = this.s; if (!S) return; const m = S.m; if (!m || m.asleep) return;
      const ctx = S.ctx, paused = m.paused;
      if (!m.stale) {   // balls = queries, time-lapsed and capped; blocked share = the real percentage
        const r = S.rate.get(m), pb = paused ? 0 : cl((m.data && m.data.percent_blocked) || 0, 0, 100) / 100;
        S.acc += dt * cl(r.q * 1.2, 3.6, 6);
        while (S.acc >= 1) { S.acc -= 1; this.launch(Math.random() < pb); }
      }
      // physics: 3 substeps per frame
      const sub = 3, h = Math.min(dt, 0.06) / sub;
      S.balls = S.balls.filter((b) => {
        b.life += dt;
        if (paused) b.blocked = false;
        if (b.rail) {   // ride the rail up the left side and over the top
          b.a += b.sp * dt; b.x = CX + Math.cos(b.a) * (RX - 7); b.y = CY + Math.sin(b.a) * (RY - 7);
          if (b.a >= b.rel) { b.rail = false; const sp = 70 + Math.random() * 80; b.vx = -Math.sin(b.a) * sp * (RX / RY); b.vy = Math.cos(b.a) * sp; }
          return true;
        }
        if (b.bonus >= 0) {   // dropping through the feature's window
          b.bonus += dt / 0.7; b.x = CX + Math.sin(b.bonus * 9) * 2; b.y = SLOT.y + 6 + (PF.y1 - SLOT.y) * b.bonus ** 1.4;
          if (b.bonus >= 1) { b.bonus = -1; b.x = CX + (Math.random() - 0.5) * 4; b.y = PF.y1 + BR + 1; b.vx = (b.blocked ? 1 : -1) * (10 + Math.random() * 20); b.vy = 70; }
          return true;
        }
        if (b.hold > 0) {     // caught in a star pocket, paid out underneath
          b.hold -= dt;
          if (b.hold <= 0) { b.x = STARS[b.star].cx + (b.blocked ? -8 : 8); b.y = 358; b.vx = b.blocked ? -30 : 30; b.vy = 40; }
          return true;
        }
        if (Math.abs(b.vx) + Math.abs(b.vy) < 20) b.still += dt; else b.still = 0;
        if (b.still > 0.4) { b.still = 0; b.vx = (Math.random() - 0.5) * 140; b.vy = -60; }   // a nudge for a ball wedged somewhere
        for (let s = 0; s < sub; s++) {
          const ev = this.step(b, h);
          if (ev === "slot") { b.bonus = 0; S.fever = 1.6; break; }
          if (ev) { b.star = +ev[4]; b.hold = 0.45; S.starF[b.star] = 1.3; break; }
        }
        if (b.y > LAND_Y && (b.x > CX) !== b.blocked && !b.hop) {   // wrong tray: it kicks off the tray rim and hops over the splitter
          b.hop = true; b.y = LAND_Y - 2; b.vy = -200; b.vx = cl(((b.blocked ? TRAY.b.cx : TRAY.a.cx) - b.x) * 1.05, -260, 260);
        }
        if (b.y > LAND_Y || b.life > 14) {
          this.land(b.blocked); return false;
        }
        return true;
      });

      // ---- draw (the plate and pins are static elements underneath; this canvas only holds lamps and balls)
      ctx.clearRect(0, 0, W, H);
      const lamps = (list, on, gs, gr, ds, dr, a = 0.75) => {
        list.forEach(([x, y], i) => {
          if (on(i)) { ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = a; ctx.drawImage(gs, x - gr, y - gr); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; }
          else ctx.drawImage(ds, x - dr, y - dr);
        });
      };
      const chase = Math.floor(t * 5), blink = Math.floor(t * 2) % 2 === 0;
      if (S.fever > 0) S.fever -= dt;
      const fever = S.fever > 0, fchase = Math.floor(t * 12);
      if (paused) {
        lamps(L_TOP, () => blink, S.gA, 13, S.dA, 7);
        lamps(L_SIDE, () => blink, S.gA, 13, S.dA, 7);
        lamps(L_FG, () => false, S.gG, 15, S.dG, 8);
        lamps(L_FR, () => blink, S.gR, 14, S.dR, 7);
      } else {
        lamps(L_TOP, (i) => (chase + (i % 4)) % 4 < 2, S.gA, 13, S.dA, 7);
        lamps(L_SIDE, (i) => (chase + (i % 3)) % 3 !== 0, S.gA, 13, S.dA, 7);
        lamps(L_FG, (i) => fever ? (fchase + i) % 3 === 0 : (Math.floor(t * 2.5) + (i >> 1)) % 2 === 0, S.gG, 15, S.dG, 8);
        lamps(L_FR, (i) => fever ? (fchase + i) % 2 === 0 : Math.floor(t * 1.5 + (i % 2) * 0.5) % 2 === 0, S.gR, 14, S.dR, 7);
      }
      L_LENS.forEach(([x, y], i) => {   // the tall red lenses on the glass rim pulse left/right
        const on = paused || fever || Math.floor(t * 1.2) % 2 === i;
        if (on) { ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.6; ctx.drawImage(S.gL, x - 18, y - 40, 36, 80); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; }
        else ctx.drawImage(S.dL, x - 12, y - 34, 24, 68);
      });
      for (let k = 0; k < 2; k++) {
        if (S.starF[k] > 0) S.starF[k] -= dt;
        const f = S.starF[k] > 0;
        lamps(L_STAR[k], (i) => (paused ? false : f ? (Math.floor(t * 10) + i) % 2 === 0 : (Math.floor(t * 1.5) + i + k) % 4 === 0), S.gY, 12, S.dY, 7, f ? 0.95 : 0.7);
      }
      // tray piles (fill up in rounds; the red share matches the real percentage)
      if (S.drain > 0) S.drain -= dt;
      const pileDraw = (k, n) => {
        const t0 = TRAY[k], per = 9, off = S.drain > 0 ? (0.6 - S.drain) * 40 : 0;
        if (S.drain > 0) ctx.globalAlpha = Math.max(0, S.drain / 0.6);
        for (let i = 0; i < n; i++) { const r = Math.floor(i / per), c = i % per; if (r % 2 && c === per - 1) continue; ctx.drawImage(S.ball, t0.x0 + 4 + c * 11.5 + (r % 2) * 5.75, TRAY.y1 - 14 - r * 9.5 + off); }
        ctx.globalAlpha = 1;
      };
      pileDraw("a", Math.min(S.pile.a, 34)); pileDraw("b", Math.min(S.pile.b, 34));
      ctx.globalCompositeOperation = "lighter";
      if (S.flashA > 0) { S.flashA -= dt; ctx.globalAlpha = Math.min(1, S.flashA * 3); ctx.drawImage(S.gG, TRAY.a.cx - 30, TRAY.y0 - 14, 60, 30); }
      if (S.flashB > 0) { S.flashB -= dt; ctx.globalAlpha = Math.min(1, S.flashB * 3); ctx.drawImage(S.gR, TRAY.b.cx - 30, TRAY.y0 - 14, 60, 30); }
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
      if (paused) ctx.drawImage(S.shut, 0, 0);   // the red tray's shutter is closed
      // balls
      ctx.fillStyle = "rgba(70,8,24,.4)"; for (const b of S.balls) if (!b.rail && b.hold <= 0 && b.bonus < 0) ctx.fillRect(b.x - 2, b.y + 2, 9, 5);
      for (const b of S.balls) if (b.hold <= 0) ctx.drawImage(S.ball, b.x - BR - 1, b.y - BR - 1);
    },

    land(blocked) {
      const S = this.s;
      if (blocked) { S.pile.b++; S.flashB = 0.5; } else { S.pile.a++; S.flashA = 0.5; }
      if (S.pile.a + S.pile.b >= ROUND) { S.drain = 0.6; S.pile = { a: 0, b: 0 }; }
    },
  };

  window.PiSkins.add("pachinko", skin, "Pachinko", "Queries fall into Allowed or Blocked", K.T(
    '<rect width="160" height="96" fill="#A80C18"/><ellipse cx="56" cy="48" rx="52" ry="45" fill="#F7A2B6" stroke="#D6DBE2" stroke-width="3"/>' +
    '<g fill="#FFFFFF" opacity=".9"><circle cx="30" cy="22" r="1"/><circle cx="40" cy="18" r="1"/><circle cx="50" cy="22" r="1"/><circle cx="62" cy="18" r="1"/><circle cx="72" cy="22" r="1"/><circle cx="82" cy="26" r="1"/><circle cx="22" cy="36" r="1"/><circle cx="34" cy="40" r="1"/><circle cx="78" cy="40" r="1"/><circle cx="88" cy="44" r="1"/><circle cx="26" cy="54" r="1"/><circle cx="84" cy="56" r="1"/></g>' +
    '<rect x="44" y="28" width="24" height="30" rx="4" fill="#D6DBE2"/><rect x="48" y="32" width="16" height="14" fill="#14161C"/><circle cx="36" cy="48" r="4" fill="#C8101C" stroke="#D6DBE2"/><circle cx="76" cy="48" r="4" fill="#C8101C" stroke="#D6DBE2"/>' +
    '<rect x="24" y="72" width="26" height="12" rx="2" fill="#20A040"/><rect x="62" y="72" width="26" height="12" rx="2" fill="#D8182A"/><g fill="#C0C6D0"><circle cx="30" cy="80" r="2"/><circle cx="35" cy="80" r="2"/><circle cx="40" cy="80" r="2"/><circle cx="68" cy="80" r="2"/><circle cx="58" cy="38" r="2.2"/><circle cx="44" cy="62" r="2.2"/></g>' +
    '<rect x="112" y="4" width="44" height="10" rx="2" fill="#E01828" stroke="#D6DBE2"/><rect x="112" y="20" width="44" height="14" rx="2" fill="#14161C"/><rect x="116" y="24" width="26" height="6" fill="#FFB020"/><rect x="112" y="38" width="44" height="14" rx="2" fill="#14161C"/><rect x="116" y="42" width="20" height="6" fill="#FFB020"/><rect x="112" y="56" width="44" height="14" rx="2" fill="#14161C"/><rect x="116" y="60" width="26" height="6" fill="#FFB020"/><rect x="112" y="78" width="44" height="14" rx="7" fill="#E01828" stroke="#D6DBE2"/>'));
})();
