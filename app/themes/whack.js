// WHACK-AN-AD: a cheerful pixel-art lawn game. Each new blocked domain makes a mole pop out of one of six holes
// with a speech bubble (domain + age); a wooden mallet flies over and bonks it back down (burst, stars, dirt).
// Extra moles are paced by the live block rate but only ever labelled with real ticker domains (max 3 bubbles).
// Paused: AUTO-WHACK OFF, the mallet lies on the grass and the moles pop up and stay up cheekily.
// Original art drawn here; no third-party characters or branding.
(() => {
  "use strict";
  const K = window.PiSkinKit; if (!K) return;
  const { num, pct, q, fit, ago, short, meta, common, pauseText } = K;

  const SC = 3;   // screen px per logical px
  const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (k) => k * k * (3 - 2 * k);
  const hash = (a, b, s) => { let h = (a * 374761393 + b * 668265263 + s * 2246822519) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  function noise(cell, seed) {   // smooth value noise from a hashed lattice
    return (x, y) => {
      const gx = x / cell, gy = y / cell, ix = Math.floor(gx), iy = Math.floor(gy), fx = ease(gx - ix), fy = ease(gy - iy);
      const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    };
  }
  const u32 = (h) => { const n = parseInt(h.slice(1), 16); return ((255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | (n >> 16)) >>> 0; };

  // ---------------------------------------------------------------- palettes
  const GRASS = ["#47A82A", "#56BC2E", "#66CC34", "#74D83A", "#84E244", "#A4EE66"];
  const DIRT = { out: "#5A3216", back: "#9A6634", rim: "#C88A4C", lit: "#E2AC6A", inEdge: "#4A2A14", deep: "#1C0F07", in: "#2A170C", floor: "#3A2112" };
  const MOLE = { O: "#5A1A18", d: "#D2563F", b: "#F2795C", h: "#FFAE90", l: "#FFC9AE", W: "#FFFFFF", k: "#1E1012", n: "#FF7FA0", N: "#FFD0DC", m: "#B8283A", t: "#FF8FA8", w: "#6A2620" };
  const WOOD = { O: "#3A1C08", a: "#F4BC66", b: "#DA8E36", c: "#A8601F", e: "#6E3810", h: "#E6A452", H: "#A86A2A", g: "#7A4416" };

  // ---------------------------------------------------------------- tiny pixel grid helper
  function grid(w, h) {
    const a = Array.from({ length: h }, () => Array(w).fill("."));
    const o = {
      px(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < w && y < h) a[y][x] = c; return o; },
      rect(x0, y0, x1, y1, c) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) o.px(x, y, c); return o; },
      ell(cx, cy, rx, ry, c) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) a[y][x] = c; return o; },
      outline(c) {
        const s = a.map((r) => r.slice());
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (s[y][x] === "." && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => s[y + dy] && s[y + dy][x + dx] && s[y + dy][x + dx] !== ".")) a[y][x] = c;
        return o;
      },
      rows() { return a.map((r) => r.join("")); },
    };
    return o;
  }
  function bake(rows, pal) {
    const h = rows.length, w = Math.max(...rows.map((r) => r.length)), c = mk(w, h), g = c.getContext("2d");
    rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const p = pal[r[x]]; if (p) { g.fillStyle = p; g.fillRect(x, y, 1, 1); } } });
    return c;
  }

  // ---------------------------------------------------------------- the mole (original: round coral digger with big eyes)
  // 34x30 sprite, centre column 17; the bottom row sits 5 px below the hole centre when fully up.
  function moleRows(eye, mouth, squash) {
    const g = grid(34, 30);
    if (!squash) {
      g.ell(17, 13, 11.5, 12, "d").rect(6, 13, 28, 29, "d");
      g.ell(16.4, 12.4, 10.9, 11.4, "b").rect(6, 13, 27, 29, "b");
      g.ell(11.5, 5, 3.2, 1.6, "h").px(8, 7, "h");
      g.ell(17, 25.5, 7.5, 5, "l");
    } else {
      g.ell(17, 22, 13.5, 7.5, "d").rect(4, 22, 30, 29, "d");
      g.ell(16.4, 21.6, 12.9, 7, "b").rect(4, 22, 29, 29, "b");
      g.ell(10.5, 16.6, 3, 1.1, "h");
    }
    const E = [11, 20];
    if (eye === "x") {
      for (const cx of [12, 22]) for (let i = -2; i <= 2; i++) g.px(cx + i, 20 + i, "k").px(cx + i, 20 - i, "k");
    } else if (eye === "blink") {
      for (const x0 of E) g.rect(x0, 10, x0 + 3, 10, "k").px(x0, 9, "k").px(x0 + 3, 9, "k");
    } else if (eye === "wide") {
      for (const x0 of [10, 19]) g.rect(x0, 6, x0 + 5, 12, "W").px(x0, 6, "b").px(x0 + 5, 6, "b").px(x0, 12, "b").px(x0 + 5, 12, "b");
      g.rect(12, 8, 13, 9, "k").rect(21, 8, 22, 9, "k");
    } else {
      const dx = eye === "l" ? 0 : eye === "r" ? 2 : 1;
      for (const x0 of E) {
        g.rect(x0, 7, x0 + 3, 12, "W").px(x0, 7, "b").px(x0 + 3, 7, "b").px(x0, 12, "b").px(x0 + 3, 12, "b");
        g.rect(x0 + dx, 9, x0 + dx + 1, 11, "k").px(x0 + dx, 9, "W");
      }
    }
    if (!squash) {
      g.rect(16, 13, 18, 14, "n").px(16, 13, "N");
      if (mouth === "o") g.rect(16, 16, 18, 19, "k").rect(17, 17, 17, 18, "m");
      else {
        g.px(14, 15, "k").px(15, 16, "k").rect(16, 16, 18, 16, "k").px(19, 16, "k").px(20, 15, "k");
        if (mouth === "tongue") g.rect(16, 17, 18, 18, "t").px(17, 18, "m");
      }
    } else {
      g.rect(16, 22, 18, 22, "n");
      for (let x = 13; x <= 21; x++) g.px(x, 25 - (x % 2), "k");
    }
    g.outline("O");
    // whiskers after the outline so they stay thin
    const wy = squash ? [22, 24] : [13, 16];
    for (let x = 1; x <= 8; x++) { g.px(x, wy[0] - (x < 5 ? 1 : 0), "w").px(33 - x, wy[0] - (x < 5 ? 1 : 0), "w"); g.px(x, wy[1] + (x < 5 ? 1 : 0), "w").px(33 - x, wy[1] + (x < 5 ? 1 : 0), "w"); }
    return g.rows();
  }
  const MOLE_FRAMES = {
    c: ["c", "smile"], l: ["l", "smile"], r: ["r", "smile"], blink: ["blink", "smile"], wide: ["wide", "o"],
    tc: ["c", "tongue"], tl: ["l", "tongue"], tr: ["r", "tongue"], squash: ["x", "wavy", true],
  };
  const PAW = [".OOOOO.", "OlllllO", "OlOlOlO", ".OOOOO."];
  const LOOK_ON = ["c", "l", "c", "r", "c", "blink"], LOOK_OFF = ["tc", "tl", "tc", "tr", "c", "blink", "tc", "c"];

  // ---------------------------------------------------------------- mallet (one sprite, baked at many angles with nearest-pixel rotation)
  function malletRows() {
    const g = grid(18, 31);
    g.rect(7, 11, 10, 29, "h").rect(9, 11, 10, 29, "H").rect(7, 23, 10, 23, "g").rect(7, 26, 10, 26, "g");
    g.rect(1, 1, 16, 10, "b").rect(2, 1, 15, 2, "a").rect(2, 8, 15, 9, "c");
    g.rect(1, 1, 3, 10, "c").rect(14, 1, 16, 10, "c").rect(1, 1, 3, 2, "b").rect(14, 1, 16, 2, "b");
    g.rect(4, 1, 4, 10, "e").rect(13, 1, 13, 10, "e");
    g.px(6, 4, "a").px(8, 4, "a").px(10, 5, "a");
    return g.outline("O").rows();
  }
  const MAL_K = 1.5, MAL_L = 34, MAL_D = 100;   // mallet drawn 1.5x its source sprite
  function rotBake(rows, pal, pvx, pvy, deg) {
    const c = mk(MAL_D, MAL_D), g = c.getContext("2d"), img = g.createImageData(MAL_D, MAL_D), d = new Uint32Array(img.data.buffer);
    const a = (deg * Math.PI) / 180, co = Math.cos(a), si = Math.sin(a), h = rows.length, w = rows[0].length, cache = {};
    for (let y = 0; y < MAL_D; y++) for (let x = 0; x < MAL_D; x++) {
      const dx = x + 0.5 - MAL_D / 2, dy = y + 0.5 - MAL_D / 2;
      const sx = Math.floor((dx * co + dy * si) / MAL_K + pvx), sy = Math.floor((-dx * si + dy * co) / MAL_K + pvy);
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const p = pal[rows[sy][sx]]; if (!p) continue;
      d[y * MAL_D + x] = cache[p] || (cache[p] = u32(p));
    }
    g.putImageData(img, 0, 0); return c;
  }

  // ---------------------------------------------------------------- effects + decorations
  function burstRows(big) {
    const g = grid(25, 25);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + 0.2, len = big ? (i % 2 ? 7 : 11) : (i % 2 ? 5 : 8);
      for (let r = 2; r <= len; r++) { g.px(12 + Math.cos(a) * r, 12 + Math.sin(a) * r, r > len - 3 ? "y" : "Y"); g.px(12 + Math.cos(a + 0.12) * r, 12 + Math.sin(a + 0.12) * r, "y"); }
    }
    g.ell(12, 12, big ? 4.6 : 3, big ? 4.6 : 3, "y");
    if (big) g.ell(12, 12, 2.4, 2.4, "W");
    return g.outline("o").rows();
  }
  const FX = { y: "#FFD93A", Y: "#FFF3A0", W: "#FFFFFF", o: "#E07A1A" };
  const STAR = ["...o...", "..oyo..", "ooyyyoo", ".oyYyo.", "..oyo..", ".oo.oo."];
  const TUFT = ["..h..h..", ".hdh.dh.", "hdd.hddh", "dddddddd"], TUFT_P = { h: "#B6F27E", d: "#3C9A22" };
  const DAISY = [".w.", "wyw", ".w."], DAISY_P = { w: "#FFFFFF", y: "#F6C83A" };
  const PINK = [".p.", "pyp", ".p."], PINK_P = { p: "#FF8AB0", y: "#FFE07A" };
  const SHROOM = ["...ooooo...", "..orrwrro..", ".orwwrrrro.", "orrrrrrwwro", "orwrrrrrwro", "ooddddddooo", "...occco...", "...occCo...", "...occCo...", "....ooo...."];
  const SHROOM_P = { o: "#5A1410", r: "#E8382E", w: "#FFF6E8", d: "#8A1E18", c: "#FFF0D6", C: "#D8C4A8" };

  // Hole centres as fractions of the lawn (2 rows of 3), matched to the reference layout.
  const HOLES = [[0.224, 0.45], [0.506, 0.45], [0.77, 0.44], [0.253, 0.69], [0.517, 0.70], [0.736, 0.69]];
  const HRX = 20, HRY = 8, IRX = 16, IRY = 5.5;
  const DECO = {
    tuft: [[0.086, 0.09], [0.517, 0.205], [0.914, 0.09], [0.626, 0.3], [0.075, 0.5], [0.287, 0.58], [0.66, 0.57], [0.95, 0.37], [0.063, 0.77],
      [0.18, 0.9], [0.46, 0.88], [0.575, 0.92], [0.828, 0.86], [0.615, 0.79], [0.345, 0.2], [0.17, 0.27], [0.94, 0.7], [0.4, 0.33], [0.8, 0.2]],
    daisy: [[0.575, 0.272], [0.149, 0.552], [0.126, 0.587], [0.42, 0.95], [0.86, 0.26], [0.05, 0.35], [0.7, 0.93]],
    pink: [[0.8, 0.57], [0.36, 0.56]],
    shroom: [[0.9, 0.57], [0.37, 0.9]],
  };

  function paintPlate(W, H, holes) {
    const c = mk(W, H), g = c.getContext("2d"), img = g.createImageData(W, H), d = new Uint32Array(img.data.buffer);
    const col = {}; const C = (h) => col[h] || (col[h] = u32(h));
    const n1 = noise(10, 7), n2 = noise(3, 11);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const s = (x * 0.8 + y) / 15, band = Math.floor(s) % 2, f = s - Math.floor(s);
      let b = band ? 4 : 2;
      if ((f < 0.06 || f > 0.94) && (x + y) % 2) b = 3;   // dithered stripe edges
      const v = n1(x, y) * 0.6 + n2(x, y) * 0.4 + (hash(x, y, 3) - 0.5) * 0.3;
      if (v > 0.8) b += 1; else if (v < 0.24) b -= 1;
      const r = hash(x, y, 9);
      if (r < 0.025) b -= 1; else if (r > 0.985) b += 2;
      if (r < 0.012 && y > 0) d[(y - 1) * W + x] = C(GRASS[cl(b - 1, 0, 5)]);   // little dark blades
      d[y * W + x] = C(GRASS[cl(b, 0, 5)]);
    }
    for (const h of holes) {
      for (let y = h.y - HRY - 3; y <= h.y + HRY + 3; y++) for (let x = h.x - HRX - 3; x <= h.x + HRX + 3; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const px = x + 0.5 - h.x, py = y + 0.5 - h.y, eo = (px / HRX) ** 2 + (py / HRY) ** 2, ei = (px / IRX) ** 2 + (py / IRY) ** 2;
        const es = (px / (HRX + 1)) ** 2 + ((py - 2) / (HRY + 1)) ** 2, r = hash(x, y, 5);
        let k = null;
        if (eo > 1) { if (es <= 1) k = GRASS[0]; else if (es <= 1.18 && py > 0 && (x + y) % 2) k = GRASS[1]; }
        else if (eo > 0.8) k = DIRT.out;
        else if (ei > 1) {
          if (py < -1) k = r < 0.2 ? DIRT.rim : DIRT.back;
          else if (ei < 1.35 && py > 0) k = r < 0.25 ? DIRT.rim : DIRT.lit;
          else k = r < 0.15 ? DIRT.lit : DIRT.rim;
        } else if (ei > 0.78) k = py > 0 ? DIRT.inEdge : DIRT.out;
        else k = py < -0.5 ? (r < 0.1 ? DIRT.in : DIRT.deep) : (r < 0.2 ? DIRT.floor : DIRT.in);
        if (k) d[y * W + x] = C(k);
      }
      for (let i = 0; i < 7; i++) {   // loose dirt flicked onto the grass
        const a = hash(h.x, i, 13) * 6.283, rr = 1.15 + hash(i, h.y, 17) * 0.35;
        const x = Math.round(h.x + Math.cos(a) * HRX * rr), y = Math.round(h.y + Math.sin(a) * HRY * rr);
        if (x >= 0 && y >= 0 && x < W && y < H) d[y * W + x] = C(i % 2 ? DIRT.rim : DIRT.back);
      }
    }
    g.putImageData(img, 0, 0);
    const put = (rows, pal, list, oy) => { const s = bake(rows, pal); for (const [fx, fy] of list) g.drawImage(s, Math.round(fx * W - s.width / 2), Math.round(fy * H - s.height + (oy || 0))); };
    put(TUFT, TUFT_P, DECO.tuft); put(DAISY, DAISY_P, DECO.daisy); put(PINK, PINK_P, DECO.pink); put(SHROOM, SHROOM_P, DECO.shroom);
    return c;
  }

  // ---------------------------------------------------------------- skin
  const tick = (cls) => `<svg class="wk-tick ${cls}" viewBox="0 0 14 24" aria-hidden="true"><path d="M2 3l6 3M1 11h9M2 19l6-3" stroke="#E2362A" stroke-width="3" fill="none"/></svg>`;
  const spark = (cls) => `<svg class="wk-spark ${cls}" viewBox="0 0 18 22" aria-hidden="true"><path d="M3 2l4 5M1 11h7M3 20l4-5" stroke="#6A5200" stroke-width="4.5" fill="none" stroke-linecap="round"/><path d="M3 2l4 5M1 11h7M3 20l4-5" stroke="#FFE14A" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>`;

  const skin = {
    mount(el) {
      el.innerHTML = `
        <div class="wk-top">
          <b class="wk-brand">Pi-hole</b><i class="wk-div"></i>
          <div class="wk-title">${tick("l")}<b>WHACK-AN-AD</b>${tick("r")}</div><i class="wk-div"></i>
          <div class="wk-state" data-k="state"><span data-k="stxt"></span><i class="wk-dot"></i></div><i class="wk-div"></i>
          <button class="wk-allowed" data-act="allowed" data-k="allowed" type="button">Allowed<span class="n"></span></button><i class="wk-div"></i>
          <button class="wk-style" data-act="style" type="button"><span>Style</span><span class="wk-sel">Whack<i></i></span></button>
        </div>
        <div class="wk-lawn"><canvas class="wk-cv"></canvas>
          <div class="wk-badge" data-k="badge">${spark("l")}<span class="wk-bin"><i class="wk-bdot"></i><b data-k="btxt">AUTO-WHACK</b><span class="wk-cd" data-k="cd"></span></span>${spark("r")}</div>
          <div class="wk-bubs fade" data-k="bubs"></div><canvas class="wk-cv wk-fg"></canvas>
        </div>
        <div class="wk-side">
          <div class="wk-stat"><div class="wk-v" data-k="blocked"></div><div class="wk-k" data-k="lab">Blocked / 24h</div></div>
          <i class="wk-rule"></i>
          <div class="wk-stat"><div class="wk-v c" data-k="pct"></div><div class="wk-k">Blocked</div></div>
          <i class="wk-rule"></i>
          <div class="wk-stat"><div class="wk-v" data-k="total"></div><div class="wk-k">Queries / 24h</div></div>
          <button class="wk-pause" data-act="pause" data-k="pause" type="button"></button>
          <div class="wk-meta" data-k="meta"></div>
        </div>`;
      const host = el.querySelector(".wk-lawn"), cv = el.querySelector("canvas"), fg = el.querySelector(".wk-fg"), ctx = cv.getContext("2d");
      const bubs = q(el, "bubs");
      bubs.innerHTML = [0, 1, 2].map((i) => `<div class="wk-bub" data-i="${i}"><span class="d"></span><span class="t"></span></div>`).join("");
      const frames = {};
      for (const [k, [e, mo, sq]] of Object.entries(MOLE_FRAMES)) frames[k] = bake(moleRows(e, mo, sq), MOLE);
      const mrows = malletRows(), mal = [];
      for (let a = -100; a <= 10; a += 5) mal.push(rotBake(mrows, WOOD, 9, 28.5, a));
      const scratch = mk(40, 36), mask = mk(40, 36), mg = mask.getContext("2d");
      mg.fillStyle = "#000";
      for (let y = 0; y < 36; y++) for (let x = 0; x < 40; x++) if (y < 29 || ((x + 0.5 - 20) / IRX) ** 2 + ((y + 0.5 - 29) / IRY) ** 2 <= 1) mg.fillRect(x, y, 1, 1);
      const S = this.s = {
        m: null, ctx, cv, host, fx: fg.getContext("2d"), plate: null, frames, mal, scratch, sg: scratch.getContext("2d"), mask,
        paw: bake(PAW, MOLE), star: bake(STAR, FX), burst: [bake(burstRows(true), FX), bake(burstRows(false), FX)],
        rate: K.rateTracker(), news: K.newsTracker(), holes: [], parts: [], bursts: [], trail: null, acc: 0.5, clock: 0, pick: 0,
        bub: [...bubs.children], slots: [null, null, null], W: 0, H: 0, ox: 0, oy: 0, hw: 0,
        M: { st: "idle", x: 0, y: 0, th: -20, tt: 0, dur: 1, a: null, b: null, tgt: null, arc: 0 },
      };
      const size = () => {
        const Wh = host.clientWidth, Hh = host.clientHeight; if (!Wh || !Hh) return;
        const W = Math.ceil(Wh / SC), H = Math.ceil(Hh / SC);
        S.hw = Wh; S.ox = Math.floor((Wh - W * SC) / 2); S.oy = Math.floor((Hh - H * SC) / 2);
        for (const c of [cv, fg]) { c.width = W; c.height = H; c.style.width = `${W * SC}px`; c.style.height = `${H * SC}px`; c.style.left = `${S.ox}px`; c.style.top = `${S.oy}px`; }
        if (W === S.W && H === S.H) return;
        const old = S.holes; S.W = W; S.H = H;
        S.holes = HOLES.map(([fx, fy], i) => ({ i, row: i < 3 ? 0 : 1, col: i % 3, x: Math.round(fx * W), y: Math.round(fy * H), mole: old[i] ? old[i].mole : null, cool: 0 }));
        for (const h of S.holes) if (h.mole) h.mole.h = h;
        S.plate = paintPlate(W, H, S.holes);
        if (!S.M.a) { S.M.x = Math.round(W * 0.9); S.M.y = Math.round(H * 0.38); }
        S.slots.forEach((mo, i) => { if (mo) this.place(i, mo); });
      };
      size(); this.ro = new ResizeObserver(size); this.ro.observe(host);
      this.stop = K.loop((dt, t) => this.frame(dt, t), 20);
    },
    unmount() { if (this.stop) this.stop(); if (this.ro) this.ro.disconnect(); this.s = null; },

    render(el, m) {
      const S = this.s; if (!S) return; const d = m.data || {}, mt = meta(m); S.m = m; S.rate.update(m);
      const fresh = S.news(m.ticker);
      if (!S.seeded && m.ticker.length && S.W) { S.seeded = true; m.ticker.slice(1, 3).forEach((it) => this.spawn(it)); }
      for (const it of fresh) this.spawn(it);
      const cd = (m.pill.text.split("·")[1] || "").trim();
      const st = q(el, "state"); st.className = `wk-state ${m.pill.cls}`; q(el, "stxt").textContent = m.pill.text;
      q(el, "btxt").textContent = m.paused ? "AUTO-WHACK OFF" : "AUTO-WHACK"; q(el, "cd").textContent = m.paused ? cd : "";
      q(el, "badge").classList.toggle("off", m.paused || m.pill.cls === "bad");
      q(el, "blocked").textContent = num(d.blocked); q(el, "pct").textContent = pct(d.percent_blocked); q(el, "total").textContent = num(d.total);
      const lab = q(el, "lab"); lab.textContent = m.labelAlert ? m.label : "Blocked / 24h"; lab.classList.toggle("alert", !!m.labelAlert);
      S.slots.forEach((mo, i) => { if (mo && mo.item) S.bub[i].querySelector(".t").textContent = short(ago(m, mo.item)); });
      q(el, "pause").textContent = pauseText(m);
      q(el, "meta").textContent = `CPU ${mt.temp}  |  Up ${mt.up}`;
      common(el, m);
      fit(q(el, "blocked"), 14); fit(q(el, "pct"), 14); fit(q(el, "total"), 14);
    },

    // ---- moles + bubbles
    canLabel(h) {   // keep bubbles from covering each other or another mole
      for (const o of this.s.holes) {
        if (o === h || !o.mole) continue;
        const lab = o.mole.slot >= 0;
        if (lab && o.row === h.row && Math.abs(o.col - h.col) === 1) return false;
        if (o.col === h.col && ((h.row === 1 && o.row === 0) || (h.row === 0 && o.row === 1 && lab))) return false;
      }
      return true;
    },
    spawn(item) {
      const S = this.s, m = S.m; if (!S.W || !m) return;
      let label = item;
      if (!label) {   // a paced extra mole: borrow a real recent ticker domain that isn't already on screen
        const shown = new Set(S.slots.filter(Boolean).map((mo) => mo.item.domain));
        const pool = (m.ticker || []).slice(0, 8).filter((it) => !shown.has(it.domain));
        label = pool.length ? pool[S.pick++ % pool.length] : null;
      }
      let si = S.slots.indexOf(null);
      if (item && si < 0) {   // a brand-new block always gets a bubble: take it from the oldest one
        let old = -1; S.slots.forEach((mo, i) => { if (old < 0 || mo.born < S.slots[old].born) old = i; });
        this.release(S.slots[old]); si = old;
      }
      const free = S.holes.filter((h) => !h.mole && h.cool <= 0 && !S.holes.some((o) => o.mole && o.mole.slot >= 0 && o.row === 1 && h.row === 0 && o.col === h.col));
      if (!free.length) return;
      const lab = label && si >= 0 ? free.filter((h) => this.canLabel(h)) : [];
      const pickFrom = lab.length ? lab : free, h = pickFrom[(Math.random() * pickFrom.length) | 0];
      const mo = { h, st: "rise", tt: 0, off: 30, item: null, slot: -1, born: S.clock, fresh: !!item, whackAt: null, stay: 0, ph: Math.random() * 6 };
      h.mole = mo;
      if (lab.length) { mo.item = label; mo.slot = si; S.slots[si] = mo; this.place(si, mo); }
    },
    place(i, mo) {
      const S = this.s, b = S.bub[i], h = mo.h;
      b.dataset.domain = mo.item.domain; b.querySelector(".d").textContent = mo.item.domain; b.querySelector(".t").textContent = short(ago(S.m, mo.item));
      const x = S.ox + (h.x + 0.5) * SC, y = S.oy + (h.y - 26) * SC, bw = b.offsetWidth;
      const left = cl(x, bw / 2 + 4, S.hw - bw / 2 - 4);
      b.style.left = `${Math.round(left)}px`; b.style.top = `${Math.round(y)}px`; b.style.setProperty("--tx", `${Math.round(x - left)}px`);
      b.classList.remove("on");
    },
    release(mo) {
      const S = this.s; if (!mo || mo.slot < 0) return;
      const b = S.bub[mo.slot]; b.classList.remove("on"); b.removeAttribute("data-domain");
      S.slots[mo.slot] = null; mo.slot = -1;
    },
    updMoles(dt, on) {
      const S = this.s;
      for (const h of S.holes) {
        if (h.cool > 0) h.cool -= dt;
        const mo = h.mole; if (!mo) continue;
        mo.tt += dt;
        if (mo.st === "rise") {
          mo.off = 30 * (1 - ease(Math.min(1, mo.tt / 0.24)));
          if (mo.tt >= 0.24) { mo.st = "up"; mo.tt = 0; mo.off = 0; }
        } else if (mo.st === "up") {
          if (on) { if (mo.whackAt == null) mo.whackAt = S.clock + (mo.fresh ? 1.0 + Math.random() * 0.5 : 1.6 + Math.random() * 1.2); mo.stay = 0; }
          else { mo.whackAt = null; if (!mo.stay) mo.stay = mo.tt + 7 + Math.random() * 4; if (mo.tt > mo.stay) { mo.st = "duck"; mo.tt = 0; } }
        } else if (mo.st === "squash") {
          if (mo.tt > 0.32) { mo.st = "sink"; mo.tt = 0; }
        } else if (mo.st === "sink" || mo.st === "duck") {
          const dur = mo.st === "sink" ? 0.3 : 0.26;
          mo.off = 30 * ease(Math.min(1, mo.tt / dur));
          if (mo.tt >= dur) { this.release(mo); h.mole = null; h.cool = 0.5; continue; }
        }
        if (mo.slot >= 0) S.bub[mo.slot].classList.toggle("on", mo.st === "up" || mo.st === "scared");
      }
    },
    // ---- the mallet: a little state machine, poses are pivot (grip) + angle
    go(st, b, dur, arc) { const M = this.s.M; M.st = st; M.tt = 0; M.dur = dur; M.a = { x: M.x, y: M.y, th: M.th }; M.b = b; M.arc = arc || 0; },
    updMallet(dt, on, t) {
      const S = this.s, M = S.M, W = S.W, H = S.H;
      const raised = (h, th, dy) => ({ x: h.x + 33, y: h.y - 28 + (dy == null ? 6 : dy), th: th == null ? -30 : th });
      const rest = { x: Math.round(W * 0.95), y: Math.round(H * 0.9), th: -95 };
      if (!on && M.st !== "rest" && M.st !== "torest") {
        if (M.tgt && M.tgt.st === "scared") { M.tgt.st = "up"; M.tgt.tt = 0; }
        M.tgt = null; this.go("torest", rest, 0.6, 12);
      }
      if (on && (M.st === "rest" || M.st === "torest")) this.go("fly", { x: Math.round(W * 0.9), y: Math.round(H * 0.38), th: -20 }, 0.5, 10);
      if (M.st === "idle") {
        let best = null;
        for (const h of S.holes) { const mo = h.mole; if (mo && mo.st === "up" && mo.whackAt != null && mo.whackAt <= S.clock + 0.35 && (!best || mo.whackAt < best.whackAt)) best = mo; }
        if (best) { M.tgt = best; this.go("fly", raised(best.h), 0.32, 6); }
        else { M.th += (-20 - M.th) * Math.min(1, dt * 4); M.y += Math.sin(t * 2.2) * 0.04; return; }
      }
      M.tt += dt;
      const k = Math.min(1, M.tt / M.dur), e = M.st === "swing" ? k * k : ease(k);
      M.x = M.a.x + (M.b.x - M.a.x) * e; M.y = M.a.y + (M.b.y - M.a.y) * e - Math.sin(k * Math.PI) * M.arc; M.th = M.a.th + (M.b.th - M.a.th) * e;
      if (k < 1) return;
      const tg = M.tgt, h = tg && tg.h;
      if (M.st === "fly") {
        if (tg && tg.st === "up") { tg.st = "scared"; tg.tt = 0; this.go("raise", raised(h, -36), 0.16); } else { M.tgt = null; M.st = "idle"; }
      } else if (M.st === "raise") { S.trail = { x: M.x, y: M.y, a0: M.th, life: 0.3 }; this.go("swing", raised(h, -78, 0), 0.09); }
      else if (M.st === "swing") { this.impact(h); tg.st = "squash"; tg.tt = 0; this.go("hit", raised(h, -80, 10), 0.12); }
      else if (M.st === "hit") { M.st = "hold"; M.tt = 0; M.dur = 0.22; M.a = M.b; }
      else if (M.st === "hold") { M.tgt = null; this.go("lift", raised(h, -24), 0.24); }
      else if (M.st === "lift") M.st = "idle";
      else if (M.st === "torest") M.st = "rest";
    },
    impact(h) {
      const S = this.s, x = h.x, y = h.y - 21;
      S.bursts.push({ x, y, t: 0 });
      for (let i = 0; i < 4; i++) S.parts.push({ star: true, x: x + (Math.random() - 0.5) * 8, y, vx: (i < 2 ? -1 : 1) * (10 + Math.random() * 18), vy: -26 - Math.random() * 14, g: 45, life: 0.8 + Math.random() * 0.3 });
      for (let i = 0; i < 12; i++) S.parts.push({ x: x + (Math.random() - 0.5) * 22, y: h.y - 1, vx: (Math.random() - 0.5) * 40, vy: -18 - Math.random() * 22, g: 110, life: 0.45 + Math.random() * 0.3, c: i % 3 ? DIRT.rim : DIRT.out });
    },

    frame(dt, t) {
      const S = this.s; if (!S || !S.W || !S.plate) return; const m = S.m; if (!m || m.asleep) return;
      const ctx = S.ctx, on = !m.paused, W = S.W;
      S.clock += dt;
      if (!m.stale) {   // extra moles at a lively but bounded multiple of the real block rate
        const r = S.rate.get(m); S.acc += dt * (on ? cl(r.b * 0.5, 0.32, 0.6) : 0.32);
        while (S.acc >= 1) { S.acc -= 1; this.spawn(null); }
      }
      this.updMoles(dt, on); this.updMallet(dt, on, t);
      ctx.drawImage(S.plate, 0, 0);
      // moles, back row first; each is masked so it rises out of the hole opening
      const sg = S.sg;
      for (const h of S.holes) {
        const mo = h.mole; if (!mo) continue;
        let f = "c", jx = 0, bob = 0;
        const ph = Math.floor((S.clock + mo.ph) * 2.5);
        if (mo.st === "up") { if (on) f = LOOK_ON[ph % LOOK_ON.length]; else { f = LOOK_OFF[ph % LOOK_OFF.length]; bob = ph % 2; } }
        else if (mo.st === "scared") { f = "wide"; jx = ((S.clock * 30) | 0) % 2 ? 1 : 0; }
        else if (mo.st === "squash" || mo.st === "sink") f = "squash";
        sg.globalCompositeOperation = "source-over"; sg.clearRect(0, 0, 40, 36);
        sg.drawImage(S.frames[f], 3 + jx, 5 + Math.round(mo.off) + bob);
        sg.globalCompositeOperation = "destination-in"; sg.drawImage(S.mask, 0, 0);
        ctx.drawImage(S.scratch, h.x - 20, h.y - 29);
        if (mo.off < 2 && (mo.st === "up" || mo.st === "scared")) { ctx.drawImage(S.paw, h.x - 13 + jx, h.y + 2); ctx.drawImage(S.paw, h.x + 6 + jx, h.y + 2); }
        if (mo.st === "scared") {   // little alarm ticks
          ctx.fillStyle = "#1E1012";
          ctx.fillRect(h.x + 12, h.y - 25, 1, 3); ctx.fillRect(h.x + 15, h.y - 23, 2, 1); ctx.fillRect(h.x + 14, h.y - 27, 1, 2);
          ctx.fillRect(h.x - 13, h.y - 25, 1, 3); ctx.fillRect(h.x - 16, h.y - 23, 2, 1);
        }
      }
      const fx = S.fx; fx.clearRect(0, 0, S.W, S.H);   // mallet + effects on a top canvas, above the bubbles
      // swoosh trail behind the swing
      if (S.trail) {
        const tr = S.trail; tr.life -= dt;
        if (tr.life <= 0) S.trail = null;
        else {
          const a1 = S.M.th, n = 9;
          for (let i = 0; i <= n; i++) {
            const a = ((tr.a0 + (a1 - tr.a0) * (i / n)) * Math.PI) / 180;
            for (const [r, c] of [[MAL_L + 6, "#FFF3A0"], [MAL_L + 10, "#FFD93A"], [MAL_L + 2, "#FFFFFF"]]) {
              if ((i + r) % 2 && r !== MAL_L + 6) continue;
              fx.fillStyle = c; fx.fillRect(Math.round(tr.x + Math.sin(a) * r), Math.round(tr.y - Math.cos(a) * r), 2, 1);
            }
          }
        }
      }
      // mallet (with a soft grass shadow when it lies down)
      const M = S.M, idx = cl(Math.round((M.th + 100) / 5), 0, S.mal.length - 1);
      if (M.st === "rest") { fx.fillStyle = "rgba(30,70,20,.45)"; fx.fillRect(Math.round(M.x) - 46, Math.round(M.y) + 6, 52, 2); }
      fx.drawImage(S.mal[idx], Math.round(M.x) - MAL_D / 2, Math.round(M.y) - MAL_D / 2);
      // impact bursts + particles
      S.bursts = S.bursts.filter((b) => { b.t += dt; const img = S.burst[b.t < 0.12 ? 0 : 1]; fx.drawImage(img, b.x - 12, b.y - 12); return b.t < 0.26; });
      S.parts = S.parts.filter((p) => {
        p.life -= dt; if (p.life <= 0) return false;
        p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.star) { if (p.life > 0.2 || ((t * 20) | 0) % 2) fx.drawImage(S.star, Math.round(p.x) - 3, Math.round(p.y) - 3); }
        else { fx.fillStyle = p.c; fx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
        return true;
      });
      if (S.parts.length > 90) S.parts.splice(0, S.parts.length - 90);
      void W;
    },
  };

  window.PiSkins.add("whack", skin, "Whack-an-Ad", "A mallet bops ads back down their holes", K.T(
    '<rect width="160" height="96" fill="#64BE3D"/><path d="M0 30l40-30h14L0 40zM0 62L84 0h14L0 72zM16 96l100-74v10L30 96zM60 96l56-41v10L74 96z" fill="#58B036"/>' +
    '<rect width="160" height="14" fill="#FBF1DC"/><rect y="14" width="160" height="2" fill="#1C2246"/><text x="5" y="10" font-size="7" font-weight="800" fill="#1C2246" font-family="Inter">Pi-hole</text>' +
    '<text x="40" y="11" font-size="9" font-weight="900" fill="#FFD43B" stroke="#D9342A" stroke-width=".8" font-family="Inter">WHACK-AN-AD</text><circle cx="108" cy="8" r="3" fill="#3CCB4A" stroke="#1C2246"/>' +
    '<g fill="#3A2112" stroke="#C88A4C" stroke-width="1.5"><ellipse cx="26" cy="50" rx="11" ry="4"/><ellipse cx="60" cy="50" rx="11" ry="4"/><ellipse cx="94" cy="50" rx="11" ry="4"/><ellipse cx="30" cy="78" rx="11" ry="4"/><ellipse cx="62" cy="78" rx="11" ry="4"/><ellipse cx="90" cy="78" rx="11" ry="4"/></g>' +
    '<path d="M86 50v-6a8 8 0 0 1 16 0v6z" fill="#F2795C" stroke="#5A1A18"/><circle cx="91" cy="41" r="1.6" fill="#fff"/><circle cx="97" cy="41" r="1.6" fill="#fff"/><rect x="92.5" y="44" width="3" height="1.6" fill="#FF7FA0"/>' +
    '<rect x="70" y="26" width="9" height="6" rx="1" fill="#DA8E36" stroke="#3A1C08" transform="rotate(-70 74 29)"/><rect x="76" y="30" width="2" height="12" fill="#E6A452" transform="rotate(-70 77 36)"/>' +
    '<rect x="56" y="19" width="34" height="7" rx="3.5" fill="#1C2233"/><circle cx="61" cy="22.5" r="1.8" fill="#3CCB4A"/>' +
    '<rect x="116" y="16" width="44" height="80" fill="#1C2246"/><rect x="120" y="24" width="34" height="6" fill="#FFF3D6"/><rect x="120" y="40" width="28" height="6" fill="#FF7A6B"/><rect x="120" y="56" width="34" height="6" fill="#FFF3D6"/>' +
    '<rect x="119" y="72" width="38" height="13" rx="3" fill="#FFD43B" stroke="#111"/>'));
})();
