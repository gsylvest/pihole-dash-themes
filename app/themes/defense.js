// PACKET DEFENSE: a top-down pixel-art tower-defence lawn. Green packets (allowed traffic) scoot along the dirt path from
// the stone tunnel to the INTERNET portal. Red spiky ad-monsters follow; three crystal towers zap them. Each new blocked
// domain is a monster that a tower catches and holds beside it under a call-out bubble (domain + age, tap for the sheet).
// Paused: crystals go dark, TOWERS OFF, and the monsters stroll straight through to the portal.
// Original art drawn here; no third-party characters or branding.
(() => {
  "use strict";
  const K = window.PiSkinKit; if (!K) return;
  const { num, pct, q, fit, ago, short, meta, common, pauseText, heroLabel } = K;

  // ================================================================ SCENE GEOMETRY (logical px; the canvas is LW x LH, shown 3x at 800x480)
  // The static world is painted once into an offscreen plate of exactly this size. To swap in an image plate later,
  // draw it at LW x LH and keep (or re-measure) the constants below: everything that moves reads only these.
  const LW = 198, LH = 143;
  // Measured on the image plate (themes/defense/plate.webp, 1200x880): logical = plate px * 0.165, y - 1.1 (the plate is centred, 3 px cropped top and bottom).
  const PATH_WAYPOINTS = [[16.8, 20.3], [16.8, 22.6], [16.7, 25.8], [16.8, 29.1], [17.3, 31.6], [17.5, 33], [17.6, 33.9], [19.1, 34.4], [23.9, 34.9], [34, 34.9], [48, 34.5], [62.2, 34.4], [73.4, 35.2], [79.8, 37.6], [83.6, 41.1], [86.8, 44.6], [91.6, 47.1], [99.1, 47.8], [108, 47.5], [116.8, 47.2], [123.9, 48.1], [129.3, 50.5], [133.7, 53.9], [136.7, 57.6], [137.9, 61.1], [137.8, 64.5], [136.3, 68], [132.8, 71.1], [126.4, 73.3], [115.3, 74.2], [100.4, 74.1], [85.3, 73.7], [73.6, 74], [66.4, 74.9], [61.8, 76], [58.6, 77.6], [55.8, 79.6], [52.9, 82.3], [50.6, 85.5], [49.1, 88.9], [48.8, 92.3], [49.7, 95.8], [51.5, 99.5], [54.4, 102.8], [58.6, 105.2], [64.7, 106], [72.4, 105.7], [80.5, 105.4], [87.5, 106], [92.7, 108.2], [97.1, 111.3], [101.4, 114.4], [106.4, 116.5], [112.3, 117.3], [118.7, 117.3], [125.4, 116.9], [132, 116.7], [138.8, 116.7], [145.9, 116.7], [152.6, 116.6], [158.4, 116.5], [163.2, 116.5], [167.2, 116.4], [170.5, 116.3], [172.8, 116.2]];
  const PATH_HALF = 7;                                   // half the path width
  const TUNNEL = { x: 3, y: 2, w: 27, h: 21 };           // top-left of the tunnel sprite (its mouth is the path start)
  const PORTAL = { x: 153, y: 100, w: 39, h: 39, cx: 173, cy: 116 };   // top-left of the gate sprite + the centre of its glow
  // x,y = centre of the tower's base; hold = the spot on the path where it catches and holds a labelled monster
  const TOWERS = [{ x: 54, y: 67, hold: [70, 35] }, { x: 158, y: 88, hold: [138, 61] }, { x: 71, y: 136, hold: [88, 106] }];
  const TOWER_TIP = 23;                                  // crystal centre sits this far above the base
  // Decorations, in the reference image's own pixel coordinates (converted by MX/MY below).
  const MX = (x) => Math.round(x * 0.1623), MY = (y) => Math.round((y - 100) * 0.1642);
  const TREES = [[1100, 240], [85, 525], [1150, 462], [85, 905]];
  const ROCKS = [[890, 168], [110, 698], [1160, 648], [780, 918]];
  const FLOWERS_W = [[740, 195], [1180, 285], [205, 525], [940, 700], [215, 870]], FLOWERS_Y = [[772, 218], [250, 552], [905, 722], [185, 897]];
  const TUFTS = [[275, 130], [680, 140], [220, 215], [985, 215], [1195, 212], [890, 292], [620, 300], [1110, 300], [40, 362], [175, 400], [435, 412],
    [530, 468], [1110, 502], [1185, 542], [55, 582], [200, 655], [845, 630], [1015, 688], [215, 745], [735, 727], [295, 820], [575, 872], [880, 892],
    [290, 935], [600, 937], [1000, 380], [640, 620], [420, 180], [1050, 590], [130, 300]];

  // ================================================================ helpers
  const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (k) => k * k * (3 - 2 * k);
  const hash = (a, b, s) => { let h = (a * 374761393 + b * 668265263 + s * 2246822519) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  function noise(cell, seed) {
    return (x, y) => {
      const gx = x / cell, gy = y / cell, ix = Math.floor(gx), iy = Math.floor(gy), fx = ease(gx - ix), fy = ease(gy - iy);
      const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    };
  }
  const u32 = (h) => { const n = parseInt(h.slice(1), 16); return ((255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | (n >> 16)) >>> 0; };

  // A tiny pixel canvas of hex colours (null = empty) with the few drawing verbs the sprites need.
  function pix(w, h) {
    const a = new Array(w * h).fill(null);
    const o = {
      w, h,
      px(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < w && y < h) a[y * w + x] = c; return o; },
      get(x, y) { return x >= 0 && y >= 0 && x < w && y < h ? a[y * w + x] : null; },
      rect(x0, y0, x1, y1, c) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) o.px(x, y, c); return o; },
      ell(cx, cy, rx, ry, c) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) a[y * w + x] = c; return o; },
      each(fn) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = fn(x, y, a[y * w + x]); if (c !== undefined) a[y * w + x] = c; } return o; },
      outline(c) {
        const s = a.slice();
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          if (s[y * w + x]) continue;
          if ((x > 0 && s[y * w + x - 1]) || (x < w - 1 && s[y * w + x + 1]) || (y > 0 && s[(y - 1) * w + x]) || (y < h - 1 && s[(y + 1) * w + x])) a[y * w + x] = c;
        }
        return o;
      },
      rows(strs, pal, ox, oy) { strs.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (pal[r[x]]) o.px((ox || 0) + x, (oy || 0) + y, pal[r[x]]); }); return o; },
      bake() {
        const c = mk(w, h), g = c.getContext("2d"), img = g.createImageData(w, h), d = new Uint32Array(img.data.buffer), cache = {};
        for (let i = 0; i < a.length; i++) if (a[i]) d[i] = cache[a[i]] || (cache[a[i]] = u32(a[i]));
        g.putImageData(img, 0, 0); return c;
      },
    };
    return o;
  }

  // ---------------------------------------------------------------- the path: a smooth curve through the waypoints, resampled every 1 px
  function buildPath(wp) {
    const raw = [], P = (i) => wp[cl(i, 0, wp.length - 1)];
    const cr = (a, b, c, d, t) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
    for (let i = 0; i < wp.length - 1; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      for (let k = 0; k < 10; k++) raw.push([cr(p0[0], p1[0], p2[0], p3[0], k / 10), cr(p0[1], p1[1], p2[1], p3[1], k / 10)]);
    }
    raw.push(wp[wp.length - 1]);
    const pts = [raw[0]]; let need = 1;
    for (let i = 1; i < raw.length; i++) {
      const a = raw[i - 1], b = raw[i], seg = Math.hypot(b[0] - a[0], b[1] - a[1]); let pos = 0;
      while (seg - pos >= need) { pos += need; pts.push([a[0] + ((b[0] - a[0]) * pos) / seg, a[1] + ((b[1] - a[1]) * pos) / seg]); need = 1; }
      need -= seg - pos;
    }
    return pts;
  }
  const PTS = buildPath(PATH_WAYPOINTS), LEN = PTS.length - 1;
  function at(s) {   // position + unit direction at arc length s
    const i = cl(Math.floor(s), 0, LEN - 1), f = cl(s - i, 0, 1), a = PTS[i], b = PTS[i + 1];
    return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, dx: b[0] - a[0], dy: b[1] - a[1] };
  }
  const nearestS = ([x, y]) => { let best = 0, bd = 1e9; PTS.forEach((p, i) => { const d = (p[0] - x) ** 2 + (p[1] - y) ** 2; if (d < bd) { bd = d; best = i; } }); return best; };
  const HOLD_S = TOWERS.map((t) => nearestS(t.hold));

  // ================================================================ palettes + sprites
  const GRASS = ["#2F9C1F", "#3CAE25", "#49BE2C", "#57CA35", "#70DA4A"];
  const SAND = { a: "#E2B46C", b: "#D9A960", lit: "#F0CB8C", dark: "#C4924C", rim: "#B07C3C" };
  const STONE = { o: "#2A2E3A", a: "#B8C0CE", b: "#8E96A8", c: "#666D7E", m: "#4C5262" };

  function towerSprite() {
    const p = pix(19, 18), S = STONE;
    for (const x of [2, 8, 14]) p.rect(x, 1, x + 2, 2, S.a);
    p.rect(2, 3, 16, 3, S.a).rect(2, 4, 16, 4, S.b).rect(3, 5, 15, 5, S.c);
    p.rect(4, 6, 14, 13, S.b).rect(4, 6, 5, 13, S.a).rect(12, 6, 14, 13, S.c);
    p.rect(2, 14, 16, 14, S.a).rect(2, 15, 16, 15, S.b).rect(2, 16, 16, 16, S.c);
    p.px(7, 6, S.c).px(11, 6, S.m).px(6, 12, S.c).px(5, 9, S.b).px(13, 8, S.m).px(13, 11, S.m).px(3, 15, S.a).px(9, 15, S.c).px(14, 15, S.c).px(6, 13, S.c).px(10, 13, S.m);
    p.rect(6, 7, 12, 11, "#1B3C7A").rect(7, 12, 11, 12, "#1B3C7A");            // shield plate
    p.rect(7, 8, 11, 10, "#2E86EA").rect(8, 11, 10, 11, "#2E86EA").px(9, 12, "#2E86EA");
    p.rect(8, 8, 9, 9, "#8FE2FF").px(8, 10, "#58B8FF").px(11, 8, "#1D62C4").px(11, 9, "#1D62C4").px(10, 11, "#1D62C4");
    return p.outline(S.o).bake();
  }
  const CRYSTAL = ["...o...", "..oho..", ".ohLlo.", ".ohLlo.", "ohLLlbo", "ohLlbbo", "ohLlbdo", ".oLbdo.", ".oLbdo.", "..odo..", "...o..."];
  const CRY = {
    on: { o: "#0C3A6E", h: "#E6FBFF", L: "#A2EEFF", l: "#52CCF8", b: "#2198E4", d: "#1468B4" },
    hi: { o: "#0C3A6E", h: "#FFFFFF", L: "#CFF8FF", l: "#86E2FF", b: "#3FB4F4", d: "#1F84D0" },
    zap: { o: "#2A7ACC", h: "#FFFFFF", L: "#FFFFFF", l: "#E6FBFF", b: "#A2EEFF", d: "#52CCF8" },
    off: { o: "#20232C", h: "#7E8698", L: "#666D7E", l: "#555B6B", b: "#454A58", d: "#383C48" },
  };
  const crystal = (pal) => pix(7, 11).rows(CRYSTAL, pal).bake();

  const RED = { r: "#EA4630", l: "#FF7C5C", d: "#B42C20", o: "#5A0F0C" }, HOT = { r: "#FFFFFF", l: "#FFFFFF", d: "#FFD8C8", o: "#FF7C5C" };
  function monsterSprite(f, C) {
    const p = pix(15, 14), up = f ? 1 : 0;
    p.ell(7, 7.5, 4.7, 4.3, C.r);
    p.each((x, y, c) => (c ? (y >= 11 || x >= 11 ? C.d : y <= 4 || (x <= 4 && y <= 6) ? C.l : undefined) : undefined));
    p.px(7, 3, C.r).px(7, 2, C.l).px(4, 4, C.r).px(3, 3 + up, C.l).px(10, 4, C.r).px(11, 3 + up, C.r);
    p.px(2, 7, C.r).px(1, 7 - up, C.l).px(12, 7, C.d).px(13, 7 - up, C.d).px(3, 10, C.d).px(2, 11 - up, C.d).px(11, 10, C.d).px(12, 11 - up, C.d);
    if (f) p.px(6, 12, C.d).px(8, 12, C.d); else p.px(5, 12, C.d).px(9, 12, C.d);
    p.outline(C.o);
    const k = "#2A0806", w = "#FFFFFF";
    p.px(4, 5, k).px(5, 6, k).px(6, 6, k).px(10, 5, k).px(9, 6, k).px(8, 6, k);     // angry brows
    p.px(5, 7, w).px(6, 7, k).px(9, 7, w).px(8, 7, k);
    p.px(6, 9, k).px(7, 9, w).px(8, 9, k).px(5, 10, k).px(9, 10, k).px(7, 10, k);
    return p.bake();
  }
  function packetSprite(f) {
    const p = pix(11, 12), g = "#8FE98C", h = "#CBFAC0", d = "#56BE60", o = "#1C5628", k = "#143A1E";
    p.rect(1, 1, 9, 9, g).rect(2, 1, 8, 1, h).rect(1, 2, 1, 7, h).rect(2, 9, 8, 9, d).rect(9, 3, 9, 8, d);
    p.px(1, 1, null).px(9, 1, null).px(1, 9, null).px(9, 9, null).px(2, 2, h);
    p.outline(o);
    p.rect(3, 3, 3, 4, k).rect(7, 3, 7, 4, k).px(3, 6, k).px(4, 7, k).px(5, 7, k).px(6, 7, k).px(7, 6, k);
    if (!f) p.px(3, 11, o).px(7, 11, o); else p.px(2, 11, o).px(8, 11, o);
    return p.bake();
  }
  function treeSprite(seed) {
    const p = pix(23, 26), T = ["#62CC40", "#3FAA2E", "#2B8A24", "#1D6C1E"];
    p.rect(10, 15, 12, 22, "#7A4A22").rect(12, 15, 12, 22, "#5A3416").px(10, 17, "#96602E").px(10, 20, "#96602E").px(9, 22, "#7A4A22").px(13, 22, "#5A3416").px(8, 23, "#5A3416").px(14, 23, "#5A3416");
    const tr = (x, y) => { const c = p.get(x, y); return c === "#7A4A22" || c === "#5A3416" || c === "#96602E"; };
    const lumps = [[11, 9, 7.4, 7.2], [6, 11, 5, 5], [16, 11, 5.2, 5], [8, 6, 5, 4.6], [14, 6, 5, 4.6], [11, 13, 6, 4]];
    for (const [cx, cy, rx, ry] of lumps) p.ell(cx, cy, rx, ry, "leaf");
    p.each((x, y, c) => {
      if (c !== "leaf") return undefined;
      const t = ((x - 11) * 0.55 + (y - 9)) / 9 + (hash(x, y, seed) - 0.5) * 0.55;
      return T[t < -0.62 ? 0 : t < -0.05 ? 1 : t < 0.5 ? 2 : 3];
    });
    void tr;
    return p.outline("#113F17").bake();
  }
  function rockSprite(seed) {
    const p = pix(17, 12), S = STONE;
    p.ell(6.5, 6, 5.6, 4.4, S.b).ell(12, 7.6, 3.6, 2.8, S.b).rect(2, 8, 14, 9, S.b);
    p.each((x, y, c) => {
      if (!c) return undefined;
      const big = x < 11, t = big ? (x - 6.5) * 0.5 + (y - 6) : (x - 12) * 0.5 + (y - 7.6) + 0.6, r = hash(x, y, seed);
      return t < -2.2 ? S.a : t > 1.6 ? S.c : r < 0.08 ? S.c : undefined;
    });
    p.px(10, 8, S.m).px(10, 9, S.m).px(9, 7, S.m);
    return p.outline(S.o).bake();
  }
  const TUFT = ["d..l..d", ".d.d.d.", "..ddd.."], TUFT_P = { d: "#1F8A1C", l: "#2CA024" };
  const FLW = [".w.", "wyw", ".w.", ".s."], FLW_W = { w: "#FFFFFF", y: "#FFD92E", s: "#1F8A1C" }, FLW_Y = { w: "#FFD92E", y: "#FF8A1E", s: "#1F8A1C" };

  // Stone arch shared by the tunnel and the portal: ring between radii r..R above cy, straight legs below.
  function arch(p, cx, cy, R, r, bottom, inner) {
    const S = STONE, seg = Math.PI / 7;
    for (let y = 0; y <= bottom; y++) for (let x = 0; x < p.w; x++) {
      const dx = x - cx, dy = y - cy, dd = Math.hypot(dx, dy), ro = dy <= 0 ? dd : Math.abs(dx);
      if (ro > R) continue;
      if (ro <= r) { p.px(x, y, inner(x, y, dx, dy, dd)); continue; }
      let c;
      if (ro > R - 1 || ro <= r + 1 || y === bottom) c = S.o;
      else if (dy <= 0) {
        const an = Math.atan2(-dy, dx), k = Math.floor(an / seg), f = an / seg - k, v = hash(k, 3, 41);
        c = f < 0.13 ? S.m : an > 1.25 && ro > R - 2.4 ? S.a : v < 0.3 ? S.c : v > 0.75 ? S.a : S.b;
        if (ro < r + 2.2 && c !== S.m) c = S.c;
      } else {
        const k = Math.floor(dy / 4), v = hash(k, dx < 0 ? 1 : 2, 43);
        c = Math.round(dy) % 4 === 3 ? S.m : dx < 0 && ro > R - 2.4 ? S.a : v < 0.35 ? S.c : S.b;
        if (ro < r + 2.2 && c !== S.m) c = S.c;
      }
      p.px(x, y, c);
    }
  }
  function tunnelSprite() {
    const p = pix(TUNNEL.w, TUNNEL.h), bottom = TUNNEL.h - 1;
    arch(p, 13, 13, 13.4, 8.6, bottom, (x, y, dx, dy) => (y >= bottom - 2 ? (hash(x, y, 5) < 0.3 ? "#6E5430" : "#84663A") : y >= bottom - 3 ? "#4A3A22" : dy < -5 ? "#050B08" : "#0A1610"));
    p.px(13, 0, STONE.o).rect(11, 1, 15, 2, STONE.a).rect(11, 3, 15, 3, STONE.b);   // keystone
    return p.bake();
  }
  const MINI = { I: ["111", "010", "010", "010", "111"], N: ["1001", "1101", "1011", "1001", "1001"], T: ["111", "010", "010", "010", "010"], E: ["111", "100", "110", "100", "111"], R: ["110", "101", "110", "101", "101"] };
  function portalSprite() {
    const p = pix(PORTAL.w, PORTAL.h), cx = 19, cy = 16;
    arch(p, cx, cy, 15.4, 11, 28, (x, y, dx, dy, dd) => {
      const e = dy <= 0 ? dd : Math.max(Math.abs(dx), dy * 0.8) + 1, di = (x + y) % 2;
      return e < 4.5 ? "#46AEFF" : e < 5.5 ? (di ? "#46AEFF" : "#2386EE") : e < 8 ? "#2386EE" : e < 9 ? (di ? "#2386EE" : "#1257C4") : y > 25 ? "#0B3A92" : "#1257C4";
    });
    const G = "#9AF2FF", g2 = "#5CCBFF";
    for (let y = cy - 7; y <= cy + 7; y++) for (let x = cx - 7; x <= cx + 7; x++) {   // globe
      const dx = x - cx, dy = y - cy, dd = Math.hypot(dx, dy);
      if (dd > 6.5) continue;
      if (dd > 5.5) p.px(x, y, G);
      else if (dx === 0 || dy === 0) p.px(x, y, G);
      else if (Math.abs(Math.hypot(dx / 3.1, dy / 6) - 1) < 0.2) p.px(x, y, g2);
      else if (Math.abs(dy) === 3) p.px(x, y, g2);
      else p.px(x, y, "#1B6FE0");
    }
    for (const x0 of [1, 33]) {   // side pillars with crystal caps
      p.rect(x0, 15, x0 + 4, 28, STONE.o).rect(x0 + 1, 18, x0 + 3, 27, STONE.b).rect(x0 + 1, 18, x0 + 1, 27, STONE.a).rect(x0 + 3, 20, x0 + 3, 27, STONE.c);
      p.rect(x0 + 1, 16, x0 + 3, 17, "#7FE4FF").px(x0 + 1, 16, "#E6FBFF").rect(x0 + 1, 22, x0 + 3, 22, "#2E86EA");
    }
    p.rect(17, 0, 21, 0, STONE.o).rect(17, 1, 21, 3, STONE.a).rect(17, 4, 21, 4, STONE.b).px(16, 1, STONE.o).px(22, 1, STONE.o).px(16, 2, STONE.o).px(22, 2, STONE.o);
    p.rect(0, 29, 38, 38, "#0A2250").rect(1, 30, 37, 37, "#8FD2FF").rect(2, 31, 36, 36, "#1B5CC0").rect(2, 36, 36, 36, "#134698");   // sign
    let x = 3;
    for (const ch of "INTERNET") { const gl = MINI[ch]; gl.forEach((r, y) => { for (let i = 0; i < r.length; i++) if (r[i] === "1") p.px(x + i, 31 + y, "#EAF8FF"); }); x += gl[0].length + 1; }
    return p.bake();
  }

  // ---------------------------------------------------------------- the background plate (grass, path, scenery, tunnel, gate, tower bodies)
  function paintPlate(tower) {
    const c = mk(LW, LH), g = c.getContext("2d"), img = g.createImageData(LW, LH), d = new Uint32Array(img.data.buffer);
    const col = {}, C = (h) => col[h] || (col[h] = u32(h));
    const dist = new Float32Array(LW * LH), n1 = noise(15, 7), n2 = noise(5, 11), n3 = noise(4, 21);
    for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
      let m = 1e9;
      for (let i = 0; i < PTS.length; i += 2) { const p = PTS[i], dd = (p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y); if (dd < m) m = dd; }
      const e = Math.sqrt(m) + (n3(x, y) - 0.5) * 2.4, r = hash(x, y, 9); dist[y * LW + x] = e;
      let k;
      if (e < PATH_HALF - 1.1) k = r < 0.05 ? SAND.dark : r > 0.94 ? SAND.lit : n2(x, y) > 0.62 ? SAND.b : SAND.a;
      else if (e < PATH_HALF) k = SAND.rim;
      else {
        const v = n1(x, y) * 0.65 + n2(x, y) * 0.35; let b = v > 0.6 ? 3 : v < 0.37 ? 1 : 2;
        if (e < PATH_HALF + 1) b = 0; else if (r < 0.03) b -= 1; else if (r > 0.98) b += 1;
        k = GRASS[cl(b, 0, 4)];
      }
      d[y * LW + x] = C(k);
    }
    g.putImageData(img, 0, 0);
    const far = (x, y, min) => x >= 0 && y >= 0 && x < LW && y < LH && dist[Math.round(y) * LW + Math.round(x)] > min;
    const shadow = (x, y, rx, ry) => { g.fillStyle = "#2B8E1E"; for (let yy = -ry; yy <= ry; yy++) { const w = Math.round(rx * Math.sqrt(1 - (yy * yy) / ((ry + 0.5) * (ry + 0.5)))); g.fillRect(x - w, y + yy, w * 2 + 1, 1); } };
    const tuft = pix(7, 3).rows(TUFT, TUFT_P).bake(), fw = pix(3, 4).rows(FLW, FLW_W).bake(), fy = pix(3, 4).rows(FLW, FLW_Y).bake();
    for (const [mx, my] of TUFTS) { const x = MX(mx), y = MY(my); if (far(x, y, PATH_HALF + 4)) g.drawImage(tuft, x - 3, y - 2); }
    for (const [mx, my] of FLOWERS_W) g.drawImage(fw, MX(mx) - 1, MY(my) - 2);
    for (const [mx, my] of FLOWERS_Y) g.drawImage(fy, MX(mx) - 1, MY(my) - 2);
    ROCKS.forEach(([mx, my], i) => { const x = MX(mx), y = MY(my); shadow(x, y + 5, 9, 1); g.drawImage(rockSprite(60 + i), x - 8, y - 6); });
    for (const t of TOWERS) {
      shadow(t.x, t.y - 1, 13, 3);
      for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.283 + 0.3, x = Math.round(t.x + Math.cos(a) * 13), y = Math.round(t.y - 1 + Math.sin(a) * 3.4); g.fillStyle = i % 2 ? "#1F8A1C" : "#2B8E1E"; g.fillRect(x, y - 1, 1, 2); }
      g.drawImage(tower, t.x - 9, t.y - 17);
    }
    TREES.forEach(([mx, my], i) => { const x = MX(mx), y = MY(my); shadow(x, y, 8, 2); g.drawImage(treeSprite(80 + i), x - 11, y - 23); });
    g.drawImage(tunnelSprite(), TUNNEL.x, TUNNEL.y);
    shadow(PORTAL.cx, PORTAL.y + PORTAL.h, 20, 1);
    g.drawImage(portalSprite(), PORTAL.x, PORTAL.y);
    return c;
  }

  // ================================================================ skin
  const BERRY = '<svg class="pd-berry" viewBox="0 0 11 13" shape-rendering="crispEdges" aria-hidden="true">' +
    '<path d="M2 0h2v1h1v2H3V2H2zM7 0h2v2H8v1H6V1h1z" fill="#3BD23F"/><path d="M5 2h1v2H5z" fill="#1F8A1C"/>' +
    '<path d="M3 4h5v1h2v4H9v2H8v1H7v1H4v-1H3v-1H2V9H1V5h2z" fill="#E0262C"/><path d="M3 5h1v1H3zM6 5h1v1H6zM2 7h1v1H2zM5 8h1v1H5zM8 7h1v1H8zM4 10h1v1H4zM7 10h1v1H7z" fill="#8A0F1A"/>' +
    '<path d="M4 6h1v1H4zM7 6h1v1H7z" fill="#FF7A7A"/></svg>';
  const CHEV = ["#..", ".#.", "..#", ".#.", "#.."];
  const SPARKS = ["#FF5A3A", "#FFB03A", "#FFE27A", "#B8281E", "#FF7C5C"];

  const skin = {
    mount(el) {
      el.innerHTML = `
        <div class="pd-top">
          ${BERRY}<b class="pd-title">PACKET DEFENSE</b><i class="pd-div"></i>
          <div class="pd-status"><span class="pd-chip pd-state" data-k="state"><i class="pd-dot"></i><span data-k="stxt"></span></span></div><i class="pd-div"></i>
          <button class="pd-btn" data-act="allowed" data-k="allowed" type="button"><span class="pd-chip">Allowed<span class="n"></span><i class="pd-car"></i></span></button>
          <button class="pd-btn" data-act="style" type="button"><span class="pd-l">Style:</span><span class="pd-chip">Defense<i class="pd-car"></i></span></button>
        </div>
        <div class="pd-lawn"><img class="pd-plate" src="themes/defense/plate.webp" alt="" draggable="false"><canvas class="pd-cv" width="${LW}" height="${LH}"></canvas>
          <b class="pd-net">INTERNET</b>
          <div class="pd-off"><i></i><b>TOWERS OFF</b><span data-k="cd"></span></div>
          <div class="pd-bubs" data-k="bubs"></div>
        </div>
        <div class="pd-side">
          <div class="pd-card"><div class="pd-k" data-k="lab">Blocked / 24h</div><div class="pd-v" data-k="blocked"></div></div>
          <div class="pd-card"><div class="pd-k">Blocked</div><div class="pd-v g" data-k="pct"></div></div>
          <div class="pd-card"><div class="pd-k">Queries / 24h</div><div class="pd-v" data-k="total"></div></div>
          <i class="pd-rule"></i>
          <button class="pd-pause" data-act="pause" data-k="pause" type="button"><i class="pd-pico"></i><span data-k="ptxt"></span></button>
          <div class="pd-meta"><span data-k="cpu"></span><i></i><span data-k="up"></span></div>
        </div>`;
      const host = el.querySelector(".pd-lawn"), cv = el.querySelector(".pd-cv"), bubs = q(el, "bubs");
      bubs.innerHTML = [0, 1, 2].map(() => '<div class="pd-bub"><span class="d"></span><span class="t"></span></div>').join("");
      el.querySelector(".pd-plate").addEventListener("error", () => { if (this.s) this.s.plate = paintPlate(towerSprite()); });   // no image: fall back to the painted lawn
      const S = this.s = {
        m: null, host, ctx: cv.getContext("2d"), plate: null,
        cry: { on: crystal(CRY.on), hi: crystal(CRY.hi), zap: crystal(CRY.zap), off: crystal(CRY.off) },
        mon: [monsterSprite(0, RED), monsterSprite(1, RED)], hot: [monsterSprite(0, HOT), monsterSprite(1, HOT)], pkt: [packetSprite(0), packetSprite(1)],
        rate: K.rateTracker(), news: K.newsTracker(), actors: [], parts: [], bolts: [], slots: [null, null, null], next: 0, tfl: [0, 0, 0],
        bub: [...bubs.children], accP: 0.6, accM: 0.4, clock: 0, pfx: null, seeded: false, smoke: 0,
      };
      S.ctx.imageSmoothingEnabled = false;
      for (let i = 0; i < 4; i++) this.addPacket(30 + i * 68 + Math.random() * 20);   // the lawn is never empty on the first frame
      this.ro = new ResizeObserver(() => { const s = this.s; if (s) s.slots.forEach((a, i) => { if (a) this.place(i, a); }); });
      this.ro.observe(host);
      this.stop = K.loop((dt, t) => this.frame(dt, t), 20);
    },
    unmount() { if (this.stop) this.stop(); if (this.ro) this.ro.disconnect(); this.s = null; },

    render(el, m) {
      const S = this.s; if (!S) return; const d = m.data || {}, mt = meta(m); S.m = m; S.rate.update(m);
      const fresh = S.news(m.ticker || []);
      if (!S.seeded && m.ticker && m.ticker.length) {   // start with the three newest already walking up to their towers
        S.seeded = true;
        if (!m.paused) m.ticker.slice(0, 3).forEach((it, i) => this.spawn(it, i));
      }
      for (const it of fresh.slice(-3)) this.spawn(it);
      const cd = (m.pill.text.split("·")[1] || "").trim();
      q(el, "state").className = `pd-chip pd-state ${m.pill.cls}`; q(el, "stxt").textContent = m.pill.text;
      q(el, "cd").textContent = cd;
      q(el, "blocked").textContent = num(d.blocked); q(el, "pct").textContent = pct(d.percent_blocked); q(el, "total").textContent = num(d.total);
      const lab = q(el, "lab"); lab.textContent = heroLabel(m, "Blocked / 24h"); lab.classList.toggle("alert", !!m.labelAlert || !!m.paused);
      S.slots.forEach((a, i) => { if (a && a.item) S.bub[i].querySelector(".t").textContent = short(ago(m, a.item)); });
      q(el, "ptxt").textContent = pauseText(m);
      q(el, "cpu").textContent = `CPU ${mt.temp}`; q(el, "up").textContent = `Up ${mt.up}`;
      common(el, m);
      fit(q(el, "blocked"), 14); fit(q(el, "pct"), 14); fit(q(el, "total"), 14);
    },

    // ---- actors
    addPacket(s) { this.s.actors.push({ kind: "p", s: s || 0, v: 26 + Math.random() * 6, lat: (Math.random() - 0.5) * 4, ph: Math.random() * 6 }); },
    spawn(item, seedSlot) {
      const S = this.s, m = S.m, on = m && !m.paused;
      const a = { kind: "m", st: "walk", s: 0, v: 25 + Math.random() * 5, lat: (Math.random() - 0.5) * 3, ph: Math.random() * 6, item: null, slot: -1, tw: 0, zs: null, flash: 0, hold: 0, rz: 0 };
      if (item && on) {
        const i = seedSlot != null ? seedSlot : S.next; S.next = (i + 1) % 3;
        a.item = item; a.slot = i; a.tw = i; a.zs = HOLD_S[i]; a.v = 62; a.lat = 0;
        if (seedSlot != null) a.s = Math.max(0, HOLD_S[i] - 26 - seedSlot * 8);
      }
      S.actors.push(a);
    },
    assign(a) {   // an unlabelled monster: pick the tower that will zap it, a little before that tower's hold spot
      const ahead = [0, 1, 2].filter((j) => HOLD_S[j] - 26 > a.s);
      if (!ahead.length) { a.tw = 2; a.zs = a.s + 1 + Math.random() * 8; return; }
      const j = ahead[Math.random() < 0.55 ? 0 : (Math.random() * ahead.length) | 0];
      a.tw = j; a.zs = Math.max(a.s + 2, HOLD_S[j] - 12 - Math.random() * 14);
    },
    place(i, a) {
      const S = this.s, b = S.bub[i], P0 = at(a.s), tw = TOWERS[a.tw], P = { x: P0.x + (tw.x - P0.x) * 0.5, y: P0.y + (tw.y - 14 - P0.y) * 0.5 }, hw = S.host.clientWidth, sx = hw / LW, sy = S.host.clientHeight / LH;
      b.dataset.domain = a.item.domain; b.querySelector(".d").textContent = a.item.domain; b.querySelector(".t").textContent = S.m ? short(ago(S.m, a.item)) : "";
      const x = (P.x + 0.5) * sx, y = (P.y - 9) * sy, bw = b.offsetWidth, left = cl(x, bw / 2 + 4, hw - bw / 2 - 4);
      b.style.left = `${Math.round(left)}px`; b.style.top = `${Math.round(y)}px`; b.style.setProperty("--tx", `${Math.round(x - left)}px`);
      b.classList.add("on");
    },
    release(a) {
      const S = this.s; if (a.slot < 0 || S.slots[a.slot] !== a) return;
      const b = S.bub[a.slot]; b.classList.remove("on"); b.removeAttribute("data-domain"); S.slots[a.slot] = null;
    },
    burst(x, y, n, sp) {
      const S = this.s;
      for (let i = 0; i < n; i++) { const an = Math.random() * 6.283, v = sp * (0.4 + Math.random() * 0.6); S.parts.push({ x, y, vx: Math.cos(an) * v, vy: Math.sin(an) * v - 8, g: 45, life: 0.35 + Math.random() * 0.4, c: SPARKS[i % SPARKS.length] }); }
    },
    zap(a, big) {
      const S = this.s, P = a.st === "held" && a.px != null ? { x: a.px, y: a.py } : at(a.s);
      S.bolts.push({ tw: a.tw, x: P.x, y: P.y, t: big ? 0.3 : 0.2 }); S.tfl[a.tw] = 0.3; a.flash = big ? 0.3 : 0.18;
      this.burst(P.x, P.y, big ? 10 : 4, big ? 34 : 22);
    },
    pop(a) { const P = at(a.s); this.burst(P.x, P.y, 16, 44); this.release(a); a.dead = true; },

    update(dt, on) {
      const S = this.s;
      for (const a of S.actors) {
        if (a.kind === "p") { a.s += a.v * dt; if (a.s >= LEN) { a.dead = true; S.pfx = { t: 0.3, c: "#CFF8FF" }; } continue; }
        if (a.flash > 0) a.flash -= dt;
        if (a.st === "walk") {
          a.s += a.v * dt;
          if (on) {
            if (a.zs == null) this.assign(a);
            if (a.slot >= 0) { const old = S.slots[a.slot]; if (old && old !== a && a.s >= a.zs - 18) this.pop(old); }
            if (a.s >= a.zs) {
              a.s = a.zs;
              if (a.slot >= 0) { this.zap(a, true); a.st = "held"; a.hold = 0; a.rz = 2.2 + Math.random() * 1.5; S.slots[a.slot] = a; this.place(a.slot, a); }
              else { this.zap(a, false); a.st = "dying"; a.hold = 0; }
            }
          } else if (a.s >= LEN) { a.dead = true; S.pfx = { t: 0.4, c: "#FF5A3A" }; }
        } else if (a.st === "held") {
          if (!on) { this.release(a); a.st = "walk"; a.slot = -1; a.item = null; a.zs = null; a.v = 26 + Math.random() * 5; a.lat = (Math.random() - 0.5) * 3; continue; }
          a.hold += dt; a.rz -= dt;
          if (a.rz <= 0) { this.zap(a, false); a.rz = 2.4 + Math.random() * 2; }
          if (a.hold > 20) this.pop(a);
        } else if (a.st === "dying") {
          a.hold += dt;
          if (!on) { a.st = "walk"; a.zs = null; } else if (a.hold > 0.2) this.pop(a);
        }
      }
      S.actors = S.actors.filter((a) => !a.dead);
    },

    frame(dt, t) {
      const S = this.s; if (!S) return; const m = S.m; if (!m || m.asleep) return;
      const g = S.ctx, on = !m.paused;
      S.clock += dt;
      if (!m.stale) {   // background traffic follows the live rates, capped so the lawn stays readable
        const r = S.rate.get(m), busy = S.actors.some((a) => a.s < 10 && a.st !== "held");
        S.accP += dt * cl((r.q - r.b) * 0.4, 0.3, 0.5); S.accM += dt * cl(r.b * 0.5, 0.13, 0.28);
        if (S.accP >= 1 && !busy) { S.accP -= 1; this.addPacket(); }
        else if (S.accM >= 1 && !busy && S.actors.length < 26) { S.accM -= 1; this.spawn(null); }
        S.accP = Math.min(S.accP, 1.5); S.accM = Math.min(S.accM, 1.5);
      }
      this.update(dt, on);

      g.globalAlpha = 1; if (S.plate) g.drawImage(S.plate, 0, 0); else g.clearRect(0, 0, LW, LH);
      // tunnel chevrons chase to the right
      const ph = Math.floor(S.clock * 4) % 4;
      for (let k = 0; k < 3; k++) {
        g.fillStyle = k === ph ? "#B8FFC8" : k < ph || ph === 3 ? "#3CF26A" : "#1F9A40";
        for (let y = 0; y < 5; y++) g.fillRect(TUNNEL.x + 8 + k * 4 + CHEV[y].indexOf("#"), TUNNEL.y + 9 + y, 2, 1);
      }
      // actors, far to near
      const list = S.actors; for (const a of list) {
        const P = at(a.s); a.px = P.x - P.dy * a.lat; a.py = P.y + P.dx * a.lat; a.dir = P.dx;
        if (a.kind === "m") {   // a held monster is pulled off the path toward its tower, so packets pass beside it
          const tw = TOWERS[a.tw], k = a.st === "held" ? 0.5 : 0, tx = (tw.x - P.x) * k, ty = (tw.y - 14 - P.y) * k;
          a.ox = (a.ox || 0) + (tx - (a.ox || 0)) * 0.3; a.oy = (a.oy || 0) + (ty - (a.oy || 0)) * 0.3; a.px += a.ox; a.py += a.oy;
        }
      }
      list.sort((a, b) => a.py - b.py);
      for (const a of list) {
        const f = Math.floor((S.clock + a.ph) * (a.kind === "p" ? 7 : 5)) % 2, x = Math.round(a.px), y = Math.round(a.py);
        const al = Math.min(cl(a.s / 7, 0, 1), cl((LEN - a.s) / 11, 0, 1)); if (al <= 0.02) continue;
        g.globalAlpha = al;
        if (a.kind === "p") {
          if (Math.abs(a.dir) > 0.45) {   // little speed lines trailing behind
            const sgn = a.dir > 0 ? -1 : 1, x0 = x + sgn * 7;
            g.fillStyle = "#B8FFE6"; g.fillRect(sgn > 0 ? x0 : x0 - 4 + f, y - 3, 4 - f, 1); g.fillRect(sgn > 0 ? x0 : x0 - 3, y + 2, 3, 1);
            g.fillStyle = "#5FE8C8"; g.fillRect(sgn > 0 ? x0 + 1 : x0 - 6, y, 5, 1);
          }
          g.drawImage(S.pkt[f], x - 5, y - 6 - f);
        } else {
          const hot = a.flash > 0 && Math.floor(S.clock * 20) % 2 === 0, jx = a.flash > 0 ? (Math.floor(S.clock * 20) % 2 ? 1 : -1) : 0;
          g.drawImage((hot ? S.hot : S.mon)[a.st === "held" && a.flash <= 0 ? Math.floor((S.clock + a.ph) * 2.5) % 2 : f], x - 7 + jx, y - 8);
        }
      }
      g.globalAlpha = 1;
      // crystals: pulse when armed, white-hot when firing, dark when the towers are off
      TOWERS.forEach((tw, i) => {
        if (S.tfl[i] > 0) S.tfl[i] -= dt;
        const img = !on ? S.cry.off : S.tfl[i] > 0 ? S.cry.zap : Math.sin(t * 3 + i * 2.1) > 0.55 ? S.cry.hi : S.cry.on;
        const bob = on ? Math.round(Math.sin(t * 2 + i * 1.7) * 0.6) : 1;
        g.drawImage(img, tw.x - 3, tw.y - 27 + bob);
        if (on) {
          const tk = Math.floor(t * 5 + i * 3) % 10;
          g.fillStyle = "#E6FBFF";
          if (tk === 0) g.fillRect(tw.x - 5, tw.y - 26, 1, 1); else if (tk === 3) g.fillRect(tw.x + 5, tw.y - 23, 1, 1); else if (tk === 6) g.fillRect(tw.x + 4, tw.y - 29, 1, 1);
        }
      });
      if (!on) {   // a wisp of smoke off each dead crystal
        S.smoke -= dt;
        if (S.smoke <= 0) { S.smoke = 0.35; const tw = TOWERS[(Math.random() * 3) | 0]; S.parts.push({ x: tw.x + (Math.random() - 0.5) * 3, y: tw.y - 27, vx: (Math.random() - 0.5) * 3, vy: -7, g: 0, life: 1.1, c: Math.random() < 0.5 ? "#8A93A6" : "#5E6678" }); }
      }
      // lightning
      S.bolts = S.bolts.filter((b) => {
        b.t -= dt; if (b.t <= 0) return false;
        const tw = TOWERS[b.tw], x0 = tw.x, y0 = tw.y - TOWER_TIP, dx = b.x - x0, dy = b.y - y0, L = Math.hypot(dx, dy) || 1, n = Math.max(3, Math.round(L / 7)), pts = [];
        let px = x0, py = y0;
        for (let i = 1; i <= n; i++) {
          const k = i / n, j = i < n ? (Math.random() - 0.5) * 6 : 0, qx = x0 + dx * k - (dy / L) * j, qy = y0 + dy * k + (dx / L) * j;
          const st = Math.max(1, Math.ceil(Math.max(Math.abs(qx - px), Math.abs(qy - py))));
          for (let s = 0; s <= st; s++) pts.push(Math.round(px + ((qx - px) * s) / st), Math.round(py + ((qy - py) * s) / st));
          px = qx; py = qy;
        }
        g.fillStyle = "#38B8FF"; for (let i = 0; i < pts.length; i += 2) g.fillRect(pts[i] - 1, pts[i + 1], 3, 2);
        g.fillStyle = "#FFFFFF"; for (let i = 0; i < pts.length; i += 2) g.fillRect(pts[i], pts[i + 1], 1, 1);
        g.fillStyle = "#FFFFFF"; g.fillRect(Math.round(b.x) - 2, Math.round(b.y), 5, 1); g.fillRect(Math.round(b.x), Math.round(b.y) - 2, 1, 5);
        return true;
      });
      // particles
      if (S.parts.length > 90) S.parts.splice(0, S.parts.length - 90);
      S.parts = S.parts.filter((p) => {
        p.life -= dt; if (p.life <= 0) return false;
        p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        g.fillStyle = p.c; g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
        return true;
      });
      // the gate: twinkles orbit the globe; a ring pops when something goes through
      const o = Math.floor(S.clock * 6);
      for (let i = 0; i < 3; i++) { const an = (o + i * 5) * 0.42; g.fillStyle = i ? "#9AF2FF" : "#FFFFFF"; g.fillRect(Math.round(PORTAL.cx + Math.cos(an) * 8.6), Math.round(PORTAL.cy + Math.sin(an) * 8.6), 1, 1); }
      if (S.pfx) {
        S.pfx.t -= dt;
        if (S.pfx.t <= 0) S.pfx = null;
        else { const r = Math.round((0.42 - S.pfx.t) * 20); g.fillStyle = S.pfx.c; for (let i = 0; i < 8; i++) { const an = i * 0.785; g.fillRect(Math.round(PORTAL.cx + Math.cos(an) * r), Math.round(PORTAL.cy + Math.sin(an) * r), 1, 1); } }
      }
      if (!on) { g.fillStyle = "rgba(10,16,52,.2)"; g.fillRect(0, 0, LW, LH); }   // dusk settles while the defences are down
    },
  };

  window.PiSkins.add("defense", skin, "Packet Defense", "Crystal towers zap ad-monsters on the path", K.T(
    '<rect width="160" height="96" fill="#0B1533"/><rect y="12" width="120" height="84" fill="#49BE2C"/>' +
    '<path d="M10 22v8h34l22 12h24v14H44v16h30l14 8h24" fill="none" stroke="#B07C3C" stroke-width="11" stroke-linejoin="round"/>' +
    '<path d="M10 22v8h34l22 12h24v14H44v16h30l14 8h24" fill="none" stroke="#E2B46C" stroke-width="8" stroke-linejoin="round"/>' +
    '<path d="M3 26v-8a7 7 0 0 1 14 0v8z" fill="#8E96A8" stroke="#2A2E3A"/><path d="M6 26v-7a4 4 0 0 1 8 0v7z" fill="#0A1610"/>' +
    '<g stroke="#2A2E3A"><rect x="34" y="42" width="10" height="12" fill="#8E96A8"/><rect x="98" y="44" width="10" height="12" fill="#8E96A8"/><rect x="50" y="80" width="10" height="12" fill="#8E96A8"/></g>' +
    '<g fill="#52CCF8" stroke="#0C3A6E" stroke-width=".8"><path d="M39 32l3 5-3 6-3-6z"/><path d="M103 34l3 5-3 6-3-6z"/><path d="M55 70l3 5-3 6-3-6z"/></g>' +
    '<path d="M40 36l5-3 3 2 6-5" stroke="#fff" stroke-width="1.2" fill="none"/>' +
    '<rect x="50" y="25" width="9" height="9" rx="1" fill="#EA4630" stroke="#5A0F0C"/><rect x="26" y="26" width="8" height="8" rx="1.5" fill="#8FE98C" stroke="#1C5628"/><rect x="70" y="52" width="8" height="8" rx="1.5" fill="#8FE98C" stroke="#1C5628"/>' +
    '<rect x="46" y="14" width="34" height="8" rx="2" fill="#101A33" stroke="#5A6690" stroke-width=".8"/>' +
    '<path d="M100 92V80a8 8 0 0 1 16 0v12z" fill="#8E96A8" stroke="#2A2E3A"/><path d="M103 92V81a5 5 0 0 1 10 0v11z" fill="#2386EE"/>' +
    '<rect width="160" height="12" fill="#0D1838"/><text x="5" y="9" font-size="7" font-weight="900" fill="#fff" font-family="Inter">PACKET DEFENSE</text>' +
    '<g fill="#0E1A3E" stroke="#2A3C74"><rect x="124" y="16" width="32" height="15" rx="3"/><rect x="124" y="34" width="32" height="15" rx="3"/><rect x="124" y="52" width="32" height="15" rx="3"/></g>' +
    '<rect x="128" y="22" width="20" height="5" fill="#fff"/><rect x="128" y="40" width="16" height="5" fill="#4BE04B"/><rect x="128" y="58" width="20" height="5" fill="#fff"/>' +
    '<rect x="124" y="73" width="32" height="12" rx="3" fill="#FFD21F"/>'));
})();
