// DUCK BLOCK: a cheerful pixel-art marsh. Each new blocked domain is an ad-duck that flaps in carrying a cream call-out
// (domain + age). A BLOCKED stamp lands on it, it pops into a puff of feathers, and the spaniel in the grass lifts
// its BLOCKED sign and wags. Extra unlabelled ducks are paced by the live block rate. Paused: the dog naps (Zzz), the sign
// lies in the grass and the ducks cross the sky unbothered.
// All art is original and drawn in code here: no third-party characters, logos or game trade dress.
(() => {
  "use strict";
  const K = window.PiSkinKit; if (!K) return;
  const { num, pct, q, fit, ago, short, meta, common, pauseText, heroLabel } = K;

  // ---------------------------------------------------------------- scene geometry (logical pixels)
  // The static world is painted once into two offscreen plates of exactly PW x PH (back = sky, front = hills, tree,
  // grass, pond, reeds). To swap in an image plate later, draw it at 0,0 at this size and keep these positions.
  const PW = 185, PH = 144, SC = 3;      // logical scene size; one logical pixel = 3 screen px (555 x 432 on the panel)
  const HORIZON_Y = 100;                 // where sky meets grass
  const DOG = { x: 74, y: 138 };         // centre of the dog's feet on the grass
  const SIGN = { dx: 41, dy: -47 };      // centre of the raised sign relative to DOG
  const LANES = [                        // flight lanes for labelled ducks: y = duck centre, x = where it hovers
    { y: 19, x: 52 }, { y: 42, x: 66 }, { y: 65, x: 58 },
  ];
  const EXTRA_Y = [9, 76];               // unlabelled ducks fly anywhere in this band
  const CALL_DX = 21;                    // call-out starts this far right of a duck's centre
  const PONDS = [{ x: 152, y: 110, rx: 34, ry: 4.5 }, { x: 22, y: 117, rx: 22, ry: 3.5 }];
  const TREE = { x: 5, top: 40 };        // trunk base x (left edge tree) and where the trunk meets the canopy

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

  // ---------------------------------------------------------------- palettes
  const SKY = ["#2C7BDD", "#3A8BE6", "#4B9CEC", "#62AEF1", "#7DC0F4", "#9AD1F6", "#B8E0F7", "#D4EEF5"];
  const GR = ["#268A3A", "#38A843", "#52C24A", "#71D554", "#95E567"];
  const LEAF = ["#1B6434", "#2A853C", "#42A846", "#66C850", "#9AE36A"];
  const BARK = ["#4A2912", "#6E4220", "#93602E", "#B88244"];
  const DUCK = { O: "#6A1F2A", b: "#F0736A", d: "#C94C56", p: "#FF9C94", h: "#FFC6BC", c: "#FFF1D0", y: "#FFD23A", o: "#F08A1E", W: "#FFFFFF", k: "#1A1420" };
  const DOGP = { O: "#3A1E0E", b: "#B5682E", d: "#8E4A1E", h: "#D08A48", e: "#6E3716", E: "#8C4A22", c: "#FFF0D2", C: "#E8CFA4", k: "#1C1210", W: "#FFFFFF",
    r: "#D8262E", R: "#F25A56", g: "#FFC83A", G: "#FFF0A0", m: "#7A1E28", t: "#FF8FA8", T: "#FFC0CC" };
  const PUFF = { W: "#FFFFFF", s: "#D5E4F6", O: "#6F84AD" };
  const SIGNP = { O: "#7A0F16", r: "#D8262E", c: "#FFF3D8", s: "#EAD9B4" };
  const CLOUD = { W: "#FFFFFF", s: "#CFE6FA" };

  // ---------------------------------------------------------------- tiny pixel grid helper for sprites
  function grid(w, h) {
    const a = Array.from({ length: h }, () => Array(w).fill("."));
    const o = {
      px(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < w && y < h) a[y][x] = c; return o; },
      rect(x0, y0, x1, y1, c) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) o.px(x, y, c); return o; },
      ell(cx, cy, rx, ry, c) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) a[y][x] = c; return o; },
      poly(pts, c) {
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          let ins = false;
          for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            const [xi, yi] = pts[i], [xj, yj] = pts[j];
            if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
          }
          if (ins) a[y][x] = c;
        }
        return o;
      },
      line(x0, y0, x1, y1, r, c) { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) || 1; for (let i = 0; i <= n; i++) o.ell(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, r, r, c); return o; },
      under(from, c) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (a[y][x] === from && (y + 1 >= h || a[y + 1][x] === ".")) a[y][x] = c; return o; },
      outline(c) {
        const s = a.map((r) => r.slice());
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (s[y][x] === "." && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => s[y + dy] && s[y + dy][x + dx] && s[y + dy][x + dx] !== ".")) a[y][x] = c;
        return o;
      },
      text(str, font, x0, y0, c) {
        let x = x0;
        for (const ch of str) { const gl = font[ch]; gl.forEach((row, yy) => { for (let xx = 0; xx < row.length; xx++) if (row[xx] === "X") o.px(x + xx, y0 + yy, c); }); x += gl[0].length + 1; }
        return o;
      },
      rows() { return a.map((r) => r.join("")); },
    };
    return o;
  }
  function bake(rows, pal) {
    const h = rows.length, w = rows[0].length, c = mk(w, h), g = c.getContext("2d");
    rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const p = pal[r[x]]; if (p) { g.fillStyle = p; g.fillRect(x, y, 1, 1); } } });
    return c;
  }
  function flip(src) { const c = mk(src.width, src.height), g = c.getContext("2d"); g.translate(src.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0); return c; }
  function tiltBake(rows, pal, breaks) {   // pixel-art tilt: one pixel higher after each break column (set between letters, so glyphs stay whole)
    const h = rows.length, w = rows[0].length, rise = breaks.length, c = mk(w, h + rise), g = c.getContext("2d");
    rows.forEach((r, y) => { for (let x = 0; x < w; x++) { const p = pal[r[x]]; if (p) { g.fillStyle = p; g.fillRect(x, y + rise - breaks.filter((b) => x >= b).length, 1, 1); } } });
    return c;
  }

  // ---------------------------------------------------------------- lettering for the sign and the stamp
  const F5 = {   // 5x8, two-pixel stems
    B: ["XXXX.", "XX.XX", "XX.XX", "XXXX.", "XX.XX", "XX.XX", "XX.XX", "XXXX."], L: ["XX...", "XX...", "XX...", "XX...", "XX...", "XX...", "XXXXX", "XXXXX"],
    O: [".XXX.", "XX.XX", "XX.XX", "XX.XX", "XX.XX", "XX.XX", "XX.XX", ".XXX."], C: [".XXXX", "XX...", "XX...", "XX...", "XX...", "XX...", "XX...", ".XXXX"],
    K: ["XX.XX", "XX.XX", "XXXX.", "XXX..", "XXX..", "XXXX.", "XX.XX", "XX.XX"], E: ["XXXXX", "XX...", "XX...", "XXXX.", "XX...", "XX...", "XX...", "XXXXX"],
    D: ["XXXX.", "XX.XX", "XX.XX", "XX.XX", "XX.XX", "XX.XX", "XX.XX", "XXXX."],
  };
  const F4 = {   // 4x6, one-pixel stems
    B: ["XXX.", "X..X", "XXX.", "X..X", "X..X", "XXX."], L: ["X...", "X...", "X...", "X...", "X...", "XXXX"], O: [".XX.", "X..X", "X..X", "X..X", "X..X", ".XX."],
    C: [".XXX", "X...", "X...", "X...", "X...", ".XXX"], K: ["X..X", "X.X.", "XX..", "XX..", "X.X.", "X..X"], E: ["XXXX", "X...", "XXX.", "X...", "X...", "XXXX"],
    D: ["XXX.", "X..X", "X..X", "X..X", "X..X", "XXX."],
  };
  function signRows() {
    const g = grid(51, 16);
    g.rect(0, 0, 50, 15, "O").rect(1, 1, 49, 14, "c").rect(1, 14, 49, 14, "s");
    g.rect(2, 2, 48, 2, "r").rect(2, 13, 48, 13, "r").rect(2, 2, 2, 13, "r").rect(48, 2, 48, 13, "r");
    g.text("BLOCKED", F5, 5, 4, "r");
    return g.rows();
  }
  function stampRows() {
    const g = grid(40, 12);
    g.rect(0, 0, 39, 11, "r").rect(1, 1, 38, 10, "c");
    g.text("BLOCKED", F4, 3, 3, "r");
    return g.rows();
  }

  // ---------------------------------------------------------------- the ad-duck (original: round coral marsh duck, cream belly)
  // 36x28, facing right. Frames: wing up / level / down.
  function duckRows(wing) {
    const g = grid(36, 28);
    if (wing === "up") g.poly([[17, 13], [23, 13], [22, 5], [19, 2], [17, 5]], "d");
    g.poly([[2, 10], [9, 13], [9, 18], [4, 15]], "d");
    g.ell(16, 16, 9.5, 6, "d").ell(15.6, 15.6, 9.2, 5.6, "b");
    g.ell(17, 18.6, 7, 3, "c");
    g.rect(21, 11, 25, 15, "b").ell(26, 10, 5, 5, "b").px(24, 7, "h").px(25, 6, "h").px(26, 6, "h");
    g.rect(27, 8, 28, 10, "W").px(28, 9, "k").px(28, 10, "k");
    g.rect(31, 10, 34, 11, "y").rect(31, 12, 33, 12, "o");
    g.rect(12, 22, 13, 23, "o").rect(18, 22, 19, 23, "o");
    if (wing === "up") g.poly([[10, 15], [19, 15], [16, 4], [11, 0], [8, 2], [8, 9]], "p").line(11, 3, 13, 11, 0.6, "h").px(10, 1, "d").px(8, 3, "d").px(8, 6, "d");
    else if (wing === "mid") g.poly([[8, 14], [19, 14], [17, 10], [5, 8], [2, 9]], "p").line(6, 10, 15, 12, 0.6, "h").px(3, 9, "d").px(5, 11, "d");
    else g.poly([[10, 16], [19, 16], [16, 25], [12, 28], [9, 25], [9, 19]], "p").line(12, 18, 13, 24, 0.6, "h").px(10, 25, "d").px(12, 27, "d").px(14, 26, "d");
    return g.outline("O").rows();
  }
  function puffRows(f) {
    const g = grid(32, 28), e = (x, y, rx, ry) => g.ell(x, y, rx, ry || rx, "W");
    if (f === 0) { e(16, 14, 5, 4); e(12, 15, 3); e(20, 13, 3); }
    else if (f === 1) { e(16, 14, 7, 6); e(10, 12, 4.2); e(22, 11, 4.2); e(11, 18, 4, 3.5); e(21, 18, 4.5, 3.6); e(4, 6, 2); e(27, 5, 2); e(5, 23, 1.6); e(27, 23, 2); }
    else if (f === 2) { e(9, 10, 3.6, 3); e(23, 9, 3.2); e(10, 19, 3, 2.6); e(22, 19, 3.6, 3); e(16, 14, 2.6, 2.2); e(2, 4, 1.6); e(29, 3, 1.6); e(3, 25, 1.4); e(29, 25, 1.6); }
    else { e(8, 9, 1.8); e(24, 8, 1.6); e(9, 20, 1.5); e(23, 20, 1.8); e(16, 13, 1.2); }
    return g.under("W", "s").outline("O").rows();
  }
  function cloudRows(big) {
    const g = big ? grid(32, 11) : grid(20, 7);
    if (big) g.ell(8, 7, 6.5, 3.6, "W").ell(16, 5, 7.5, 5, "W").ell(24, 7.2, 6.5, 3.4, "W").rect(3, 8, 28, 10, "W").rect(4, 10, 27, 10, "s").rect(11, 9, 22, 9, "s");
    else g.ell(5, 4.4, 4.2, 2.4, "W").ell(11, 3, 5, 3, "W").ell(15.5, 4.6, 3.6, 2, "W").rect(2, 5, 17, 6, "W").rect(3, 6, 16, 6, "s");
    return g.rows();
  }

  // ---------------------------------------------------------------- the dog (original: sitting spaniel, facing us, red collar + gold tag)
  // 56x54 grid, centre column 27, feet on row 52. Drawn at (DOG.x - 27, DOG.y - 52).
  function dogRows(face, arm) {
    const g = grid(56, 54), ay = arm ? 32 : 36;
    g.ell(27, 39, 11.6, 11, "d").ell(26.5, 38.5, 11.2, 10.6, "b").ell(27, 41, 5.6, 8.6, "c").ell(29, 44, 3, 5, "C").ell(27, 41, 4.6, 8, "c");
    g.ell(15.6, 45.4, 6.4, 6.2, "d").ell(15, 45, 6, 5.8, "b").px(12, 42, "h").px(13, 41, "h");
    g.ell(39.6, 45.4, 6.4, 6.2, "d").ell(39, 45, 6, 5.8, "b");
    g.ell(14, 50.6, 5, 2.2, "c").ell(40, 50.6, 5, 2.2, "c");
    g.rect(22, 39, 26, 50, "b").rect(26, 41, 26, 50, "d").ell(24, 50.6, 3.6, 2.1, "c");
    g.line(35, 35, 50, ay, 2.3, "d").line(35, 34.4, 50, ay - 0.6, 2, "b");
    g.rect(18, 29, 36, 31, "r").rect(19, 29, 35, 29, "R").ell(27, 33.2, 2.2, 2.2, "g").px(26, 32, "G");
    g.ell(27, 16, 13.6, 12.6, "d").ell(26.5, 15.5, 13.2, 12.2, "b").ell(21, 7, 4, 1.6, "h");
    g.ell(27, 6.5, 2.4, 2.4, "c").rect(26, 6, 28, 14, "c").ell(27, 21.5, 8.4, 6.2, "c").ell(27, 25.6, 6, 2.2, "C").ell(27, 21, 8, 5.6, "c");
    g.ell(10.5, 18, 4.6, 9.6, "e").ell(9, 26, 4, 3.6, "e").ell(9.4, 16, 2, 6, "E");
    g.ell(43.5, 18, 4.6, 9.6, "e").ell(45, 26, 4, 3.6, "e").ell(42.6, 16, 1.6, 5.6, "E");
    if (face === "open") g.rect(20, 12, 21, 15, "k").px(20, 12, "W").rect(32, 12, 33, 15, "k").px(32, 12, "W");
    else if (face === "blink") g.rect(19, 14, 22, 14, "k").rect(31, 14, 34, 14, "k");
    else g.px(18, 15, "k").px(19, 14, "k").rect(20, 13, 21, 13, "k").px(22, 14, "k").px(23, 15, "k").px(30, 15, "k").px(31, 14, "k").rect(32, 13, 33, 13, "k").px(34, 14, "k").px(35, 15, "k");
    g.px(19, 10, "d").px(20, 9, "d").px(21, 9, "d").px(32, 9, "d").px(33, 9, "d").px(34, 10, "d");
    g.ell(27, 18.4, 2.8, 1.8, "k").px(26, 17, "W");
    g.rect(27, 20, 27, 21, "k");
    g.px(21, 20, "k").px(22, 21, "k").px(23, 22, "k").rect(24, 22, 26, 22, "k").rect(28, 22, 30, 22, "k").px(31, 22, "k").px(32, 21, "k").px(33, 20, "k");
    g.rect(24, 23, 30, 24, "m").rect(25, 25, 29, 25, "m");
    g.ell(27, 25.6, 2.4, 2.6, "t").px(26, 24, "T").px(27, 26, "m");
    g.ell(51, ay, 3, 2.8, "c");
    g.outline("O");
    g.px(12, 51, "O").px(16, 51, "O").px(38, 51, "O").px(42, 51, "O").px(23, 51, "O").px(25, 51, "O").px(50, ay + 1, "O").px(52, ay + 1, "O");
    return g.rows();
  }
  function tailRows(f) {
    const g = grid(56, 54);
    if (f === 0) g.line(12, 46, 6, 42, 1.8, "b").line(6, 42, 4, 35, 1.7, "b").ell(4, 34, 1.6, 2, "c");
    else if (f === 1) g.line(12, 46, 5, 44, 1.8, "b").line(5, 44, 1.6, 39, 1.7, "b").ell(1.6, 38, 1.6, 2, "c");
    else g.line(12, 46, 7, 41, 1.8, "b").line(7, 41, 7.4, 34, 1.7, "b").ell(7.6, 33, 1.6, 2, "c");
    return g.outline("O").rows();
  }
  // Asleep: lying on its tummy, head on its paws. 62x30, baseline row 28, centred on DOG.x.
  function sleepRows(breath) {
    const g = grid(62, 30), by = breath ? 17.4 : 18.4, bry = breath ? 9 : 8;
    g.line(52, 25, 59, 23, 1.8, "b").ell(59.4, 21.4, 1.6, 2, "c");
    g.ell(35, by + 0.6, 17.4, bry + 0.4, "d").ell(34.5, by, 17, bry, "b").ell(30, by - bry + 2.4, 6, 1.4, "h");
    g.ell(47.6, 20.6, 7.2, 6.6, "d").ell(47, 20, 6.8, 6.2, "b").ell(49, 26.6, 5, 2, "c");
    g.rect(24, 12, 26, 24, "r").rect(24, 12, 24, 24, "R").ell(26.6, 25, 1.8, 1.8, "g");
    g.ell(8, 26.6, 5, 2, "c").ell(21, 26.6, 5, 2, "c");
    g.ell(14.6, 18.2, 10.8, 8.6, "d").ell(14.2, 17.8, 10.4, 8.2, "b").ell(10, 11.6, 3, 1.2, "h");
    g.rect(13, 10, 15, 16, "c").ell(14, 21.4, 6.4, 4.4, "c");
    g.ell(3.6, 20, 3.2, 6.4, "e").ell(24.4, 19.6, 3.6, 7, "e").ell(23.6, 17.6, 1.4, 4, "E");
    g.px(7, 16, "k").rect(8, 17, 10, 17, "k").px(11, 16, "k").px(17, 16, "k").rect(18, 17, 20, 17, "k").px(21, 16, "k");
    g.ell(14, 19.8, 2.4, 1.6, "k").px(13, 19, "W").rect(14, 21, 14, 22, "k").px(12, 23, "k").px(13, 23, "k").px(15, 23, "k").px(16, 23, "k");
    g.outline("O");
    g.px(6, 27, "O").px(10, 27, "O").px(19, 27, "O").px(23, 27, "O");
    return g.rows();
  }
  const ZED = [["XXX", ".X.", "XXX"], ["XXXX", "..X.", ".X..", "XXXX"], ["XXXXX", "...X.", "..X..", ".X...", "XXXXX"]];

  // ---------------------------------------------------------------- background plates
  function pixbuf(w, h) {
    const c = mk(w, h), g = c.getContext("2d"), img = g.createImageData(w, h), d = new Uint32Array(img.data.buffer), cc = {};
    const o = {
      set(x, y, hex) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < w && y < h) d[y * w + x] = cc[hex] || (cc[hex] = u32(hex)); },
      line(x0, y0, x1, y1, hex) { const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) || 1; for (let i = 0; i <= n; i++) o.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, hex); },
      done() { g.putImageData(img, 0, 0); return c; },
    };
    return o;
  }
  const BAYER = [[0.1, 0.6], [0.85, 0.35]];
  function paintBack() {   // banded, dithered sky with a pale sun
    const b = pixbuf(PW, PH);
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      const f = cl((y / HORIZON_Y) * (SKY.length - 1), 0, SKY.length - 1), i = Math.floor(f);
      b.set(x, y, SKY[cl(i + (f - i > BAYER[y & 1][x & 1] ? 1 : 0), 0, SKY.length - 1)]);
    }
    const sx = 166, sy = 13;
    for (let y = sy - 10; y <= sy + 10; y++) for (let x = sx - 10; x <= sx + 10; x++) {
      const r = Math.hypot(x + 0.5 - sx, y + 0.5 - sy);
      if (r < 5.2) b.set(x, y, r < 3.6 ? "#FFFBE0" : "#FFF1A8");
      else if (r < 7.4 && (x + y) % 2 === 0) b.set(x, y, "#CFEAF8");
    }
    return b.done();
  }
  function inPond(x, y, grow) { return PONDS.some((p) => ((x + 0.5 - p.x) / (p.rx + grow)) ** 2 + ((y + 0.5 - p.y) / (p.ry + grow * 0.5)) ** 2 <= 1); }
  function paintFront() {
    const b = pixbuf(PW, PH), n1 = noise(12, 7), n2 = noise(4, 11);
    // layered hills, palest furthest
    for (let x = 0; x < PW; x++) {
      const h1 = HORIZON_Y - Math.round(10 + 6 * Math.sin(x / 23 + 1) + 3 * Math.sin(x / 9));
      const h2 = HORIZON_Y - Math.round(6 + 5 * Math.sin(x / 17 + 3.4) + 2 * Math.sin(x / 6 + 1));
      for (let y = h1; y < HORIZON_Y; y++) b.set(x, y, y === h1 ? "#A9DAD6" : (y - h1 < 4 && (x + y) % 2 ? "#97CFCF" : "#88C4C8"));
      for (let y = h2; y < HORIZON_Y; y++) b.set(x, y, y === h2 ? "#86CFA4" : (y - h2 < 3 && (x + y) % 2 ? "#70BF96" : "#5FB08C"));
    }
    // distant tree line: a row of round bushes lit from the top left
    for (let i = 0; i < 46; i++) {
      const r = 3 + Math.floor(hash(i, 1, 21) * 4), cx = i * 4.2 + hash(i, 2, 21) * 3, cy = HORIZON_Y - r * 0.45;
      for (let y = Math.floor(cy - r); y < HORIZON_Y; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / r; if (dx * dx + dy * dy > 1) continue;
        const t = dx * 0.6 + dy + (hash(x, y, 4) - 0.5) * 0.5;
        b.set(x, y, t < -0.7 ? "#4DB26C" : t < 0 ? "#379A5C" : "#2A804E");
      }
    }
    // grass: soft perspective bands, dithered, with blades poking over the horizon
    for (let y = HORIZON_Y - 2; y < PH; y++) for (let x = 0; x < PW; x++) {
      const d = y - HORIZON_Y;
      if (d < 0) { if (hash(x, 0, 31) * 3 > -d + 0.6) b.set(x, y, GR[2]); continue; }
      const s = Math.sqrt(d + 1) * 1.7 + n1(x, y) * 0.8, f = s - Math.floor(s);
      let k = Math.floor(s) % 2 ? 2 : 3;
      if ((f < 0.12 || f > 0.88) && (x + y) % 2) k = k === 2 ? 3 : 2;
      const v = n2(x, y) * 0.6 + hash(x, y, 3) * 0.4;
      if (v > 0.72) k += 1; else if (v < 0.27) k -= 1;
      if (d < 2) k = Math.max(k, 3);
      b.set(x, y, GR[cl(k, 0, 4)]);
    }
    // ponds with a darker bank, streaked water and a few fixed glints
    for (let y = HORIZON_Y; y < PH; y++) for (let x = 0; x < PW; x++) {
      if (inPond(x, y, 0)) {
        const r = hash(Math.floor(x / 3), y, 41);
        b.set(x, y, !inPond(x, y - 1, 0) ? "#2A6FC2" : r < 0.2 ? "#8CCBF6" : r < 0.55 ? "#4B9CEC" : "#3A8BE6");
      } else if (inPond(x, y, 1.6)) b.set(x, y, (x + y) % 2 ? GR[0] : GR[1]);
    }
    for (const p of PONDS) for (let i = 0; i < 7; i++) {   // little reeds standing at the water's edge
      const x = Math.round(p.x - p.rx + 3 + hash(i, p.x, 51) * (p.rx * 2 - 6)), hgt = 4 + Math.floor(hash(i, p.y, 53) * 5), y0 = Math.round(p.y - p.ry * 0.6);
      for (let k = 0; k < hgt; k++) b.set(x, y0 - k, GR[0]);
      b.set(x, y0 - hgt, "#7A4420"); b.set(x, y0 - hgt - 1, "#7A4420"); b.set(x, y0 - hgt - 2, "#C9A060");
    }
    // tufts and flowers
    for (let i = 0; i < 46; i++) {
      const x = Math.floor(hash(i, 3, 61) * PW), y = HORIZON_Y + 5 + Math.floor(hash(i, 4, 61) ** 0.8 * (PH - HORIZON_Y - 8));
      if (inPond(x, y, 3)) continue;
      b.set(x, y, GR[0]); b.set(x - 1, y - 1, GR[0]); b.set(x + 1, y - 1, GR[1]); b.set(x + 2, y, GR[0]); b.set(x + 1, y - 2, GR[4]); b.set(x - 2, y - 2, GR[1]);
    }
    for (let i = 0; i < 14; i++) {
      const x = 44 + Math.floor(hash(i, 5, 71) * 104), y = HORIZON_Y + 8 + Math.floor(hash(i, 6, 71) * 30);
      if (inPond(x, y, 3)) continue;
      const c = i % 3 === 0 ? "#FF9EC0" : "#FFFFFF";
      b.set(x, y, "#FFD23A"); b.set(x - 1, y, c); b.set(x + 1, y, c); b.set(x, y - 1, c); b.set(x, y + 1, GR[0]);
    }
    // soft dithered shadow where the dog sits
    for (let y = DOG.y - 3; y <= DOG.y + 3; y++) for (let x = DOG.x - 24; x <= DOG.x + 24; x++)
      if (((x - DOG.x) / 24) ** 2 + ((y - DOG.y) / 3) ** 2 <= 1 && (x + y) % 2) b.set(x, y, GR[0]);

    // the big tree on the left edge: leaning trunk, one branch, leafy clumps with a few blossoms
    const baseY = HORIZON_Y + 9;
    for (let y = TREE.top; y <= baseY; y++) {
      const cx = TREE.x + (baseY - y) * 0.07, hw = 4 + Math.max(0, y - (HORIZON_Y - 2)) * 0.55 - (baseY - y) * 0.012;
      for (let x = Math.floor(cx - hw); x <= cx + hw; x++) {
        const t = (x + 0.5 - cx) / hw; let k = t < -0.55 ? 3 : t < 0.1 ? 2 : t < 0.6 ? 1 : 0;
        if (hash(x, y >> 2, 5) < 0.22) k = Math.max(0, k - 1);
        b.set(x, y, x + 1 > cx + hw ? "#341B0B" : BARK[k]);
      }
    }
    for (let i = 0; i <= 24; i++) {   // branch out to the second clump
      const x = 9 + i, y = Math.round(72 - i * 0.5 - Math.sin(i / 8) * 2), th = i < 10 ? 3 : 2;
      for (let k = 0; k < th; k++) b.set(x, y + k, k === 0 ? BARK[3] : k === th - 1 ? BARK[0] : BARK[1]);
      b.set(x, y + th, "#341B0B");
    }
    const blob = (cx, cy, rx, ry, seed) => {
      for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, e = dx * dx + dy * dy, r = hash(x, y, seed);
        if (e > 0.8 + r * 0.22) continue;
        const t = dy * 0.9 + dx * 0.45 + (hash(x, y, seed + 1) - 0.5) * 0.55;
        let c = LEAF[t < -0.78 ? 4 : t < -0.3 ? 3 : t < 0.25 ? 2 : t < 0.68 ? 1 : 0];
        if (hash(x, y, seed + 9) < 0.016 && t < 0.3) c = hash(x, y, seed + 3) < 0.5 ? "#FFB3CF" : "#FFF3F7";
        b.set(x, y, c);
      }
    };
    [[4, 41, 10, 7], [19, 41, 11, 7], [10, 31, 14, 10], [25, 32, 9, 8], [5, 23, 9, 6.5], [18, 22, 10, 6.5]].forEach((p, i) => blob(p[0], p[1], p[2], p[3], 80 + i * 13));
    [[27, 62, 9, 6], [41, 63, 10, 6], [34, 55, 12, 8], [46, 57, 7, 5]].forEach((p, i) => blob(p[0], p[1], p[2], p[3], 180 + i * 13));

    // foreground: cattails with long leaves in both corners, then a ragged fringe of grass along the bottom
    const cattail = (x0, hgt, lean, seed) => {
      for (let j = 0; j < 3; j++) {
        const dir = j === 1 ? -1 : 1, len = hgt * (0.55 + hash(seed, j, 91) * 0.35), sp = 4 + hash(seed, j, 93) * 7;
        for (let i = 0; i <= len; i++) { const t = i / len, x = x0 + dir * t * t * sp + (j === 2 ? -2 : 0), y = PH - i; b.set(x, y, j ? GR[1] : GR[0]); if (i < len * 0.6) b.set(x + 1, y, j ? GR[2] : GR[1]); }
      }
      const tx = x0 + lean, ty = PH - hgt;
      for (let i = 0; i <= hgt; i++) { const t = i / hgt; b.set(x0 + lean * t * t, PH - i, "#1D7030"); }
      b.set(tx, ty - 1, "#C9A060"); b.set(tx, ty - 2, "#C9A060");
      for (let k = 0; k < 7; k++) { b.set(tx - 1, ty + k, "#5A2E12"); b.set(tx, ty + k, k < 2 ? "#B5743A" : "#8A4E22"); b.set(tx + 1, ty + k, "#6E3A18"); }
      b.set(tx - 1, ty, "#8A4E22"); b.set(tx + 1, ty + 6, "#5A2E12");
    };
    [[5, 30, 1], [12, 23, -2], [19, 35, 2], [27, 20, -1], [34, 27, 2], [150, 25, -2], [158, 35, 1], [166, 21, -1], [173, 31, 2], [181, 18, -1]].forEach((c, i) => cattail(c[0], c[1], c[2], i));
    for (let x = 0; x < PW; x++) {
      const h = 2 + Math.floor(hash(x, 7, 97) * 5);
      for (let k = 0; k < h; k++) b.set(x, PH - 1 - k, k === h - 1 ? GR[1] : GR[0]);
    }
    return b.done();
  }

  // ---------------------------------------------------------------- skin
  const ICON = {
    berry: '<svg class="dk-berry" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><path d="M5 0h2v2h2v1H3V2h2z" fill="#4BD04B"/><path d="M3 3h6v1h1v2h1v3h-1v2H9v1H3v-1H2V9H1V6h1V4h1z" fill="#E8334A"/><path d="M3 5h2v2H3z" fill="#FF8A98"/></svg>',
    shield: '<svg class="dk-ico" viewBox="0 0 36 40" aria-hidden="true"><path d="M18 2l14 5v11c0 9.500-6 16-14 20C10 34 4 27.500 4 18V7z" fill="#FF6A5C" stroke="#FFD0C8" stroke-width="2"/><circle cx="18" cy="18" r="7.500" fill="none" stroke="#FFF" stroke-width="3"/><path d="M12.700 12.700l10.600 10.600" stroke="#FFF" stroke-width="3"/></svg>',
    stack: '<svg class="dk-ico" viewBox="0 0 36 40" aria-hidden="true"><g fill="#8FA8F5" stroke="#16224A" stroke-width="2"><path d="M4 26v6c0 3 6 5.500 14 5.500S32 35 32 32v-6z"/><ellipse cx="18" cy="26" rx="14" ry="5.500" fill="#B4C6FF"/><path d="M4 17v6c0 3 6 5.500 14 5.500S32 26 32 23v-6z"/><ellipse cx="18" cy="17" rx="14" ry="5.500" fill="#B4C6FF"/><path d="M4 8v6c0 3 6 5.500 14 5.500S32 17 32 14V8z"/><ellipse cx="18" cy="8" rx="14" ry="5.500" fill="#CAD7FF"/></g></svg>',
    cpu: '<svg class="dk-mi" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><path d="M4 0h2v2h1V0h2v2h1V0h2v2h2v2h2v2h-2v1h2v2h-2v1h2v2h-2v2h-2v2h-2v-2H9v2H7v-2H6v2H4v-2H2v-2H0v-2h2V9H0V7h2V6H0V4h2V2h2zm0 4v8h8V4z" fill="#A9C2FF"/></svg>',
    up: '<svg class="dk-mi" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><path d="M7 1h2v2h2v2h2v2h2v2h-4v6H5V9H1V7h2V5h2V3h2z" fill="#4BE04B"/></svg>',
  };
  const RING_C = 2 * Math.PI * 30;

  const skin = {
    mount(el) {
      el.innerHTML = `
        <div class="dk-top">
          <div class="dk-brand">${ICON.berry}<b>Pi-hole</b></div>
          <div class="dk-title"><b>DUCK</b><b class="y">BLOCK</b></div>
          <div class="dk-state" data-k="state"><i class="dk-dot"></i><span data-k="stxt"></span></div>
          <button class="dk-tb" data-act="allowed" data-k="allowed" type="button"><span>Allowed<span class="n"></span></span><i class="dk-chip"><svg viewBox="0 0 12 10" aria-hidden="true"><path d="M1 5l3.500 3.500L11 1.500" fill="none" stroke="currentColor" stroke-width="2.500"/></svg><u></u></i></button>
          <button class="dk-tb" data-act="style" type="button"><span>Style</span><i class="dk-chip">Duck<u></u></i></button>
        </div>
        <div class="dk-scene"><canvas class="dk-cv" width="${PW}" height="${PH}"></canvas>
          <div class="dk-calls" data-k="calls"></div>
          <div class="dk-nap" data-k="nap"><b>PAUSED</b><span data-k="cd"></span></div>
        </div>
        <div class="dk-side">
          <div class="dk-card">${ICON.shield}<div class="dk-col"><div class="dk-v" data-k="blocked"></div><div class="dk-l" data-k="lab">Blocked / 24h</div></div></div>
          <div class="dk-card dk-g"><div class="dk-gauge"><svg viewBox="0 0 76 76" aria-hidden="true"><circle cx="38" cy="38" r="30" fill="none" stroke="#33477F" stroke-width="10"/><circle class="dk-arc" data-k="arc" cx="38" cy="38" r="30" fill="none" stroke-width="10" stroke-dasharray="0 999" transform="rotate(-90 38 38)"/></svg><span data-k="pct"></span></div><div class="dk-l big">Blocked</div></div>
          <div class="dk-card">${ICON.stack}<div class="dk-col"><div class="dk-v" data-k="total"></div><div class="dk-l">Queries / 24h</div></div></div>
          <button class="dk-pause" data-act="pause" data-k="pause" type="button"><i class="dk-pi"></i><span data-k="ptxt"></span></button>
          <div class="dk-meta">${ICON.cpu}<span data-k="cpu"></span><i></i>${ICON.up}<span data-k="up"></span></div>
        </div>`;
      const host = el.querySelector(".dk-scene"), cv = el.querySelector(".dk-cv"), ctx = cv.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      cv.style.width = `${PW * SC}px`; cv.style.height = `${PH * SC}px`;
      const calls = q(el, "calls");
      calls.innerHTML = LANES.map((_, i) => `<div class="dk-call" data-i="${i}"><span class="d"></span><span class="t"></span></div>`).join("");
      const dR = ["up", "mid", "down"].map((w) => bake(duckRows(w), DUCK)), dogs = {};
      for (const f of ["open", "blink", "happy"]) dogs[f] = [bake(dogRows(f, 0), DOGP), bake(dogRows(f, 1), DOGP)];
      const S = this.s = {
        m: null, ctx, host, back: paintBack(), front: paintFront(),
        duckR: dR, duckL: dR.map(flip), puff: [0, 1, 2, 3].map((f) => bake(puffRows(f), PUFF)),
        dogs, tails: [0, 1, 2].map((f) => bake(tailRows(f), DOGP)), sleep: [bake(sleepRows(0), DOGP), bake(sleepRows(1), DOGP)],
        sign: tiltBake(signRows(), SIGNP, [16, 28, 40]), signFlat: bake(signRows(), SIGNP), stamp: tiltBake(stampRows(), SIGNP, [12, 22, 32]),
        clouds: [bake(cloudRows(1), CLOUD), bake(cloudRows(0), CLOUD)],
        sky: [{ x: 14, y: 6, v: 1.6, k: 0 }, { x: 96, y: 12, v: 2.3, k: 1 }, { x: 138, y: 27, v: 1.2, k: 0 }, { x: 60, y: 50, v: 2.8, k: 1 }, { x: 20, y: 74, v: 2, k: 1 }],
        rate: K.rateTracker(), news: K.newsTracker(), ducks: [], parts: [], queue: [], lanes: LANES.map(() => null), call: [...calls.children],
        acc: 0.6, gap: 0, clock: 0, cheer: 0, quiet: 0, pick: 0, seeded: false, hw: PW * SC, oy: 0,
      };
      const size = () => { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; S.hw = w; S.oy = h - PH * SC; };
      size(); this.ro = new ResizeObserver(size); this.ro.observe(host);
      this.stop = K.loop((dt, t) => this.frame(dt, t), 20);
    },
    unmount() { if (this.stop) this.stop(); if (this.ro) this.ro.disconnect(); this.s = null; },

    render(el, m) {
      const S = this.s; if (!S) return; const d = m.data || {}, mt = meta(m); S.m = m; S.rate.update(m);
      const fresh = S.news(m.ticker);
      if (!S.seeded && m.ticker.length) { S.seeded = true; m.ticker.slice(0, 3).reverse().forEach((it) => S.queue.push(it)); }
      for (const it of fresh) S.queue.push(it);
      if (S.queue.length > 6) S.queue.splice(0, S.queue.length - 6);
      const st = q(el, "state"); st.className = `dk-state ${m.pill.cls}`; q(el, "stxt").textContent = m.pill.text;
      q(el, "cd").textContent = (m.pill.text.split("·")[1] || "").trim();
      for (const k of ["blocked", "total"]) {
        const v = q(el, k); v.textContent = num(d[k]); fit(v, 16);
        if (v.style.fontSize) { v.style.fontSize = "24px"; if (v.scrollWidth > v.clientWidth) v.style.fontSize = "16px"; }   // keep the pixel font on its 8 px grid
      }
      const lab = q(el, "lab"); lab.textContent = heroLabel(m, "Blocked / 24h"); lab.classList.toggle("alert", !!m.labelAlert || m.paused);
      q(el, "pct").textContent = pct(d.percent_blocked);
      const p = typeof d.percent_blocked === "number" ? cl(d.percent_blocked / 100, 0, 1) : 0;
      q(el, "arc").setAttribute("stroke-dasharray", `${(p * RING_C).toFixed(1)} ${RING_C.toFixed(1)}`);
      q(el, "ptxt").textContent = pauseText(m);
      q(el, "cpu").textContent = `CPU ${mt.temp}`; q(el, "up").textContent = `Up ${mt.up}`;
      for (const dk of S.lanes) if (dk) dk.el.querySelector(".t").textContent = short(ago(m, dk.item));
      common(el, m);
    },

    // ---- ducks
    spawnLabelled(item, lane) {
      const S = this.s, L = LANES[lane], e = S.call[lane];
      const dk = { lab: true, lane, item, el: e, x: -22 - Math.random() * 14, y: L.y, by: L.y, dir: 1, v: 62 + Math.random() * 14, tx: L.x, st: "in", tt: 0, ph: Math.random() * 6, blockAt: 0, shown: false };
      e.dataset.domain = item.domain; e.querySelector(".d").textContent = item.domain; e.querySelector(".t").textContent = short(ago(S.m, item));
      e.style.maxWidth = `${Math.floor((PW - L.x - CALL_DX) * SC - 6)}px`; e.classList.remove("hit");
      S.lanes[lane] = dk; S.ducks.push(dk); S.quiet = 0;
    },
    spawnExtra() {
      const S = this.s; if (S.ducks.filter((d) => !d.lab).length >= 5) return;
      const dir = Math.random() < 0.5 ? 1 : -1, y = EXTRA_Y[0] + Math.random() * (EXTRA_Y[1] - EXTRA_Y[0]);
      S.ducks.push({ lab: false, x: dir > 0 ? -20 : PW + 20, y, by: y, dir, v: 42 + Math.random() * 24, st: "fly", tt: 0, ph: Math.random() * 6, hitX: PW * (0.2 + Math.random() * 0.6) });
    },
    release(dk) {
      const S = this.s; if (!dk.lab || S.lanes[dk.lane] !== dk) return;
      dk.el.classList.remove("on", "hit"); dk.el.removeAttribute("data-domain"); S.lanes[dk.lane] = null;
    },
    hit(dk) { const S = this.s; dk.st = "stamp"; dk.tt = 0; S.cheer = 1.7; if (dk.lab) dk.el.classList.add("hit"); },
    pop(dk) {
      const S = this.s; dk.st = "puff"; dk.tt = 0;
      const cols = [DUCK.p, DUCK.c, "#FFFFFF", DUCK.b];
      for (let i = 0; i < 9; i++) S.parts.push({ x: dk.x + (Math.random() - 0.5) * 12, y: dk.y + (Math.random() - 0.5) * 8, vx: (Math.random() - 0.5) * 34, vy: -14 - Math.random() * 16, life: 1.1 + Math.random() * 0.7, c: cols[i % 4], ph: Math.random() * 6 });
      if (S.parts.length > 60) S.parts.splice(0, S.parts.length - 60);
    },
    updDucks(dt, on) {
      const S = this.s;
      S.ducks = S.ducks.filter((dk) => {
        dk.tt += dt;
        const bob = Math.sin(S.clock * 5 + dk.ph) * 1.5;
        if (dk.st === "in") {
          const tx = on ? dk.tx : PW + 30;
          dk.x += dk.v * dt * (on ? cl((tx - dk.x) / 14, 0.25, 1) : 1); dk.y = dk.by + bob;
          if (on && dk.x >= tx - 0.6) { dk.st = "hover"; dk.tt = 0; dk.blockAt = S.clock + 1.6 + Math.random() * 0.8; }
          if (!on && dk.x > PW + 24) { this.release(dk); return false; }
        } else if (dk.st === "hover") {
          dk.x = dk.tx + Math.sin(S.clock * 1.4 + dk.ph) * 1.5; dk.y = dk.by + bob;
          if (!on) dk.st = "in"; else if (S.clock >= dk.blockAt) this.hit(dk);
        } else if (dk.st === "fly") {
          dk.x += dk.dir * dk.v * dt; dk.y = dk.by + bob;
          if (on && (dk.dir > 0 ? dk.x >= dk.hitX : dk.x <= dk.hitX)) this.hit(dk);
          if (dk.x < -24 || dk.x > PW + 24) return false;
        } else if (dk.st === "stamp") { if (dk.tt > 0.42) this.pop(dk); }
        else if (dk.st === "puff") { if (dk.tt > (dk.lab ? 2.2 : 0.62)) { this.release(dk); return false; } }
        if (dk.lab) {   // the call-out rides along beside its duck
          const e = dk.el, vis = dk.x > -16;
          if (vis !== dk.shown) { dk.shown = vis; e.classList.toggle("on", vis); }
          const px = Math.round((dk.x + CALL_DX) * SC), py = Math.round(S.oy + (dk.st === "puff" || dk.st === "stamp" ? dk.by : dk.y) * SC - 23);
          if (px !== dk.px || py !== dk.py) { dk.px = px; dk.py = py; e.style.transform = `translate(${px}px,${py}px)`; }
        }
        return true;
      });
    },

    frame(dt, t) {
      const S = this.s; if (!S) return; const m = S.m; if (!m || m.asleep) return;
      const ctx = S.ctx, on = !m.paused, c = S.clock += dt;
      // new blocked domains take the next free lane; paced extras follow the live block rate
      S.gap -= dt;
      if (S.queue.length && S.gap <= 0) { const lane = S.lanes.indexOf(null); if (lane >= 0) { this.spawnLabelled(S.queue.shift(), lane); S.gap = 1.1; } }
      if (!m.stale) {
        const r = S.rate.get(m); S.acc += dt * cl(r.b * 0.5, 0.14, 0.34); S.quiet += dt;
        while (S.acc >= 1) {
          S.acc -= 1;
          const lane = S.lanes.indexOf(null), busy = S.lanes.some(Boolean);
          if (on && !busy && S.quiet > 5 && lane >= 0 && m.ticker.length) this.spawnLabelled(m.ticker[S.pick++ % Math.min(3, m.ticker.length)], lane);   // quiet spell: re-fly a recent one
          else this.spawnExtra();
        }
      }
      if (S.cheer > 0) S.cheer -= dt;
      this.updDucks(dt, on);

      ctx.drawImage(S.back, 0, 0);
      for (const k of S.sky) {
        const img = S.clouds[k.k]; k.x += k.v * dt; if (k.x > PW + 2) k.x = -img.width - 2;
        ctx.drawImage(img, Math.round(k.x), k.y);
      }
      ctx.drawImage(S.front, 0, 0);
      // water glints
      ctx.fillStyle = "#EAF8FF";
      for (let i = 0; i < 7; i++) {
        const p = PONDS[i % 2], ph = Math.floor(c * 1.6 + i * 0.37), gx = Math.round(p.x + (hash(i, ph, 5) - 0.5) * p.rx * 1.5), gy = Math.round(p.y + (hash(ph, i, 9) - 0.5) * p.ry);
        if (inPond(gx, gy, -1) && inPond(gx + 2, gy, -1) && !(gx < 14 && gy < HORIZON_Y + 12)) ctx.fillRect(gx, gy, (c * 1.6 + i * 0.37) % 1 < 0.5 ? 3 : 2, 1);
      }

      // the dog
      const dx = DOG.x, dy = DOG.y;
      if (!on) {
        ctx.fillStyle = "#8A5A22"; ctx.fillRect(dx + 30, dy - 4, 24, 2); ctx.fillStyle = "#C98A3C"; ctx.fillRect(dx + 30, dy - 5, 24, 1);
        ctx.fillStyle = GR[0]; for (let i = 0; i < 26; i++) if (i % 2) ctx.fillRect(dx + 51 + i * 2, dy + 3, 2, 1);   // the sign lies in the grass
        ctx.drawImage(S.signFlat, dx + 50, dy - 13);
        ctx.drawImage(S.sleep[Math.floor(c / 1.2) % 2], dx - 31, dy - 27);
        for (let i = 0; i < 3; i++) {   // Zzz drifting up
          const k = ((c * 0.45 + i / 3) % 1), z = ZED[Math.min(2, Math.floor(k * 3))], zx = Math.round(dx - 8 + k * 16 + Math.sin(k * 6 + i) * 2), zy = Math.round(dy - 30 - k * 22);
          if (k > 0.92) continue;
          for (let pass = 0; pass < 2; pass++) {
            ctx.fillStyle = pass ? "#FFFFFF" : "#1B2A5C";
            z.forEach((row, yy) => { for (let xx = 0; xx < row.length; xx++) if (row[xx] === "X") ctx.fillRect(zx + xx + (pass ? 0 : 1), zy + yy + (pass ? 0 : 1), 1, 1); });
          }
        }
      } else {
        const hype = S.cheer > 0, up = hype && Math.floor(c * 7) % 2 ? 1 : 0, hop = hype && Math.floor(c * 7) % 2 ? -1 : 0;
        const face = hype ? "happy" : (c % 3.6 < 0.16 ? "blink" : "open");
        const tail = hype ? Math.floor(c * 11) % 3 : [0, 2, 0, 1][Math.floor(c * 2.6) % 4];
        const ox = dx - 27, oy = dy - 52 + hop, lift = up ? -4 : 0;
        ctx.drawImage(S.tails[tail], ox, oy);
        if (hype) { ctx.fillStyle = "#FFFFFF"; const f = Math.floor(c * 11) % 2; ctx.fillRect(ox - 4, oy + 33 + f, 1, 4); ctx.fillRect(ox - 7, oy + 35 - f, 1, 5); ctx.fillRect(ox - 2, oy + 30 + f, 1, 2); }
        ctx.fillStyle = "#C98A3C"; ctx.fillRect(ox + 50, oy + 12 + lift, 2, 34); ctx.fillStyle = "#8A5A22"; ctx.fillRect(ox + 52, oy + 12 + lift, 1, 34);
        ctx.drawImage(S.dogs[face][up], ox, oy);
        ctx.drawImage(S.sign, Math.round(dx + SIGN.dx - S.sign.width / 2), Math.round(dy + SIGN.dy - S.sign.height / 2) + hop + lift);
        if (hype && Math.floor(c * 6) % 2) {   // happy sparks by its head
          ctx.fillStyle = "#FFE14A";
          ctx.fillRect(ox + 9, oy - 2, 1, 3); ctx.fillRect(ox + 4, oy + 1, 3, 1); ctx.fillRect(ox + 6, oy - 1, 1, 1); ctx.fillRect(ox + 13, oy - 3, 1, 2);
        }
      }

      // ducks, stamps and puffs
      for (const dk of S.ducks) {
        const x = Math.round(dk.x), y = Math.round(dk.y);
        if (dk.st === "puff") {
          const f = dk.tt < 0.09 ? 0 : dk.tt < 0.3 ? 1 : dk.tt < 0.5 ? 2 : dk.tt < 0.68 ? 3 : -1;
          if (f >= 0) ctx.drawImage(S.puff[f], x - 16, Math.round(dk.by) - 14);
          continue;
        }
        const fr = dk.st === "stamp" ? 1 : [0, 1, 2, 1][Math.floor(c * 9 + dk.ph) % 4];
        ctx.drawImage((dk.dir > 0 ? S.duckR : S.duckL)[fr], x - 17, y - 14);
        if (dk.st === "in" && on && dk.x < dk.tx - 10) { ctx.fillStyle = "#FFFFFF"; const f = Math.floor(c * 10) % 2; ctx.fillRect(x - 27 - f, y - 3, 6, 1); ctx.fillRect(x - 30 + f, y + 1, 8, 1); ctx.fillRect(x - 26 - f, y + 5, 5, 1); }
        if (dk.st === "stamp") {
          const k = cl(dk.tt / 0.12, 0, 1), s = 2.2 - 1.2 * k, w = Math.round(S.stamp.width * s), h = Math.round(S.stamp.height * s);
          ctx.drawImage(S.stamp, x - (w >> 1), y - (h >> 1), w, h);
          if (k >= 1 && dk.tt < 0.26) { ctx.fillStyle = "#FFFFFF"; ctx.fillRect(x - 25, y - 1, 3, 1); ctx.fillRect(x + 23, y - 1, 3, 1); ctx.fillRect(x - 1, y - 13, 1, 3); ctx.fillRect(x - 1, y + 11, 1, 3); }
        }
      }
      // feathers
      S.parts = S.parts.filter((p) => {
        p.life -= dt; if (p.life <= 0) return false;
        p.vy = Math.min(14, p.vy + 40 * dt); p.vx *= 0.94; p.x += (p.vx + Math.sin(c * 5 + p.ph) * 8) * dt; p.y += p.vy * dt;
        if (p.life < 0.3 && Math.floor(c * 14) % 2) return true;
        ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 1);
        return true;
      });
      void t;
    },
  };

  window.PiSkins.add("duckblock", skin, "Duck Block", "Ad-ducks get stamped; the dog cheers", K.T(
    '<rect width="160" height="96" fill="#4B9CEC"/><rect y="40" width="160" height="26" fill="#9AD1F6"/><path d="M0 62q20-10 40 0t40 0 40 0v10H0z" fill="#5FB08C"/><rect y="66" width="118" height="30" fill="#52C24A"/>' +
    '<rect width="160" height="13" fill="#101C40"/><text x="5" y="9.500" font-size="7" font-weight="800" fill="#FFF" font-family="Inter">DUCK</text><text x="27" y="9.500" font-size="7" font-weight="800" fill="#FFD43B" font-family="Inter">BLOCK</text><circle cx="62" cy="6.500" r="2.500" fill="#4BE04B"/>' +
    '<g fill="#FFF"><rect x="10" y="20" width="16" height="4" rx="2"/><rect x="84" y="24" width="14" height="4" rx="2"/></g>' +
    '<ellipse cx="32" cy="36" rx="8" ry="5" fill="#F0736A"/><circle cx="40" cy="32" r="4" fill="#F0736A"/><rect x="43" y="31.500" width="5" height="2" fill="#FFD23A"/><path d="M28 34l-5-9 9 5z" fill="#FF9C94"/><rect x="52" y="29" width="46" height="10" rx="3" fill="#FFF3D8" stroke="#101C40"/>' +
    '<circle cx="34" cy="54" r="3" fill="#FFF"/><circle cx="39" cy="52" r="4" fill="#FFF"/><circle cx="44" cy="55" r="3" fill="#FFF"/>' +
    '<ellipse cx="60" cy="80" rx="9" ry="10" fill="#B5682E"/><circle cx="60" cy="68" r="8" fill="#B5682E"/><ellipse cx="52" cy="70" rx="3" ry="6" fill="#6E3716"/><ellipse cx="68" cy="70" rx="3" ry="6" fill="#6E3716"/><ellipse cx="60" cy="71" rx="4" ry="3" fill="#FFF0D2"/><rect x="54" y="75" width="12" height="2" fill="#D8262E"/>' +
    '<rect x="72" y="60" width="30" height="10" rx="1" fill="#FFF3D8" stroke="#D8262E" stroke-width="1.500" transform="rotate(-7 87 65)"/><rect x="73" y="70" width="2" height="16" fill="#C98A3C"/>' +
    '<rect x="118" y="13" width="42" height="83" fill="#101C40"/><g fill="none" stroke="#5B74C4"><rect x="122" y="18" width="34" height="16" rx="3"/><rect x="122" y="38" width="34" height="18" rx="3"/><rect x="122" y="60" width="34" height="14" rx="3"/></g><rect x="122" y="78" width="34" height="11" rx="3" fill="#FFD43B"/>'));
})();
