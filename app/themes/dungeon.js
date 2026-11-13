// DUNGEON GATE: a painted 16-bit castle gate (static plate, themes/dungeon/plate.webp) under a transparent pixel canvas.
// Ad monsters (blocked queries) come along the cobbled path from the forest and dissolve into pixels at a green magic
// barrier standing across the gate mouth; the three newest blocked domains get call-outs. Friendly travellers (allowed
// queries) pass through the barrier, walk into the lit archway and come out into the courtyard. Torch flames flicker,
// the archway glow breathes and the fountain sparkles. Paused: the barrier is down and monsters walk in. 20 fps cap.
(() => {
  "use strict";
  const K = window.PiSkinKit; if (!K) return;
  const { esc, num, pct, q, fit, ago, short, meta, common, pauseText } = K;

  // ---------------------------------------------------------------- world geometry
  // The plate is 1200×880; one canvas pixel = 4 plate pixels (the painting's own pixel size), so the overlay is
  // 300×220 logical px laid exactly over the plate and scaled up with image-rendering: pixelated (2 screen px at 800×480).
  const IW = 1200, IH = 880, W = 300, H = 220;
  const BAR = { x0: 95, y0: 134, x1: 129, y1: 161 };                       // barrier ground line, plate (380,535)→(515,645)
  const bxAt = (y) => BAR.x0 + ((y - BAR.y0) * (BAR.x1 - BAR.x0)) / (BAR.y1 - BAR.y0);
  const bhAt = (u) => Math.round(27 + 7 * Math.sin(Math.PI * u));            // barrier height along the line (u 0..1)
  const BLEN = Math.hypot(BAR.x1 - BAR.x0, BAR.y1 - BAR.y0);
  const LANES = [{ y0: 146, yt: 141 }, { y0: 156, yt: 148 }, { y0: 166, yt: 155 }];   // monster lanes: left-edge y → barrier y
  const LABEL_Y = [30, 64, 98];                                              // call-out tops (logical px)
  const DOOR = [133, 138], INNER = [139, 131], EXIT = [188, 132];            // threshold, into the tunnel, out in the courtyard
  const ARCH = { x0: 116, x1: 150, cx: 133, cy: 103, r: 17, bot: 138 };      // the lit opening
  const TORCHES = [{ x: 103, y: 49, w: 9, h: 17 }, { x: 156, y: 100, w: 11, h: 20 }];   // flame boxes over the painted flames
  const FOUNT = { x: 254.5, y: 71, px: 255, py: 90 };                       // spout top, pool centre

  const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------------------------------------------------------------- sprites (string rows + palette, baked once)
  // Sprites are assembled from a few pixel primitives on a small grid, then outlined, so they stay chunky and readable.
  function grid(w, h) {
    const a = Array.from({ length: h }, () => Array(w).fill("."));
    const o = {
      px(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < w && y < h) a[y][x] = c; return o; },
      rect(x0, y0, x1, y1, c) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) o.px(x, y, c); return o; },
      ell(cx, cy, rx, ry, c) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) a[y][x] = c; return o; },
      outline(c) { const s = a.map((r) => r.slice()); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (s[y][x] === "." && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => s[y + dy] && s[y + dy][x + dx] && s[y + dy][x + dx] !== ".")) a[y][x] = c; return o; },
      rows() { return a.map((r) => r.join("")); },
    };
    return o;
  }
  const MONSTERS = [
    { pal: { O: "#3A0810", r: "#D8343A", h: "#FF7A6A", d: "#96182A", W: "#FFF4DC", k: "#1A0608", T: "#FFFFFF" },   // tentacled eye
      make(f) {
        const g = grid(20, 20); g.ell(9.5, 8, 6.5, 6, "r").ell(7, 5, 3, 1.8, "h").ell(9.5, 12.5, 5, 1.6, "d");
        g.ell(11.5, 8, 3.3, 3.3, "W").rect(12, 7, 13, 9, "k").px(13, 7, "W");
        [4, 7, 11, 14].forEach((x, i) => { const wv = (i + f) % 2 ? 1 : -1; g.rect(x, 13, x + 1, 15, "r").rect(x + wv, 16, x + wv + 1, 17, "d").px(x + wv * 2, 18, "d"); });
        g.px(2, 8, "r").px(1, 7, "r").px(1, 6 - f, "d").px(17, 10, "r").px(18, 9, "r").px(18, 8 - f, "d");
        return g.outline("O").rows();
      } },
    { pal: { O: "#2E0A0A", r: "#B83A22", h: "#F0764A", d: "#7A1E14", W: "#FFF4DC", k: "#1A0608", T: "#FFF0D0" },   // spiky beast
      make(f) {
        const g = grid(20, 20); g.ell(8, 11, 6.5, 4, "r").ell(6, 9.3, 3.5, 1.3, "h").ell(8, 13.6, 5, 1.2, "d").ell(14.5, 9, 3.6, 3.6, "r");
        [3, 6, 9].forEach((x) => g.px(x, 6, "d").px(x + 1, 6, "d").px(x, 5, "d").px(x, 4, "h"));
        g.px(15, 4, "T").px(16, 3, "T").px(15, 5, "T").px(12, 5, "T").px(12, 4, "T");
        g.rect(14, 7, 15, 8, "W").px(15, 8, "k").rect(14, 11, 17, 11, "k").px(14, 11, "T").px(16, 11, "T").rect(13, 12, 16, 12, "d").px(2, 9, "r").px(1, 8, "d");
        (f ? [3, 7, 10, 13] : [4, 6, 11, 12]).forEach((x) => g.rect(x, 14, x + 1, 17, "d").px(x + 2, 17, "T"));
        return g.outline("O").rows();
      } },
    { pal: { O: "#4A1420", r: "#F0706A", h: "#FFB4A6", d: "#C2444A", W: "#FFFBEA", k: "#2A0A12", T: "#FFFFFF" },   // ghost blob
      make(f) {
        const g = grid(20, 20); g.ell(9.5, 8, 6.5, 6.5, "r").rect(3, 8, 16, 15, "r").ell(7, 4.3, 3, 1.4, "h").rect(15, 9, 16, 15, "d");
        for (let x = 3; x <= 16; x++) if (((x + f * 2) >> 1) % 2) g.rect(x, 16, x, 17, x > 14 ? "d" : "r");
        g.rect(5, 6, 7, 9, "k").rect(11, 6, 13, 9, "k").px(6, 7, "W").px(12, 7, "W").rect(6, 12, 13, 13, "k");
        for (let x = 6; x <= 13; x += 2) g.px(x, 12, "T").px(x + 1, 13, "T");
        g.rect(1, 9 - f, 2, 11 - f, "r").rect(17, 8 + f, 18, 10 + f, "d");
        return g.outline("O").rows();
      } },
  ];
  const FOLK = [
    { head: "hood", staff: true, p: { h: "#164A46", H: "#2E8A7E", I: "#5CC2B0", s: "#EDB98C", k: "#1A1018", b: "#C8A860", B: "#8A5C30", C: "#2A7A70", c: "#1A524C", l: "#3A3A4A", L: "#26263A", f: "#3A2416", w: "#B08040", O: "#141018" } },
    { head: "hat", p: { g: "#24583A", G: "#48A060", r: "#6A3A1C", s: "#EDB98C", k: "#1A1018", b: "#C8A860", B: "#8A5C30", C: "#3A8E8A", c: "#24605C", l: "#3A3A4A", L: "#26263A", f: "#3A2416", O: "#141018" } },
    { head: "hair", p: { r: "#7A4420", R: "#B06A34", s: "#F2C49C", k: "#1A1018", b: "#D8C080", B: "#96683A", C: "#4AA090", c: "#2E7066", l: "#44404E", L: "#2C2A3A", f: "#3A2416", O: "#141018" } },
    { head: "hood", p: { h: "#4A2414", H: "#96522A", I: "#C8804A", s: "#DCA478", k: "#1A1018", b: "#B8B090", B: "#6A5A3A", C: "#7A7A46", c: "#52522E", l: "#3A3A4A", L: "#26263A", f: "#2A1C10", O: "#141018" } },
  ];
  function folkRows(v, f) {
    const g = grid(16, 22), Y = 1 + (f % 2 ? 0 : 1), lx = [[4, 10], [7, 8], [10, 4], [8, 7]][f];
    g.rect(lx[0], 16, lx[0] + 1, 19, "L").rect(lx[0], 19, lx[0] + 2, 20, "f").rect(lx[1], 16, lx[1] + 1, 19, "l").rect(lx[1], 19, lx[1] + 2, 20, "f");
    if (v.staff) g.rect(14, 2 + Y, 14, 20, "w");
    g.rect(1, 8 + Y, 4, 14 + Y, "B").rect(1, 7 + Y, 4, 8 + Y, "b").rect(1, 11 + Y, 4, 11 + Y, "b");
    g.rect(4, 8 + Y, 11, 15 + Y, "C").rect(4, 8 + Y, 5, 15 + Y, "c").rect(4, 13 + Y, 11, 13 + Y, "c").rect(9, 9 + Y, 12, 11 + Y, "C").px(13, 11 + Y, "s").px(12, 12 + Y, "s");
    if (v.head === "hood") g.ell(8, 4 + Y, 4.6, 4.3, "H").ell(6.5, 2.4 + Y, 2, 1.3, "I").rect(4, 7 + Y, 9, 8 + Y, "h").rect(9, 3 + Y, 11, 6 + Y, "s").px(11, 4 + Y, "k").px(8, 3 + Y, "h").px(8, 4 + Y, "h").px(8, 5 + Y, "h");
    else if (v.head === "hat") g.ell(8, 5 + Y, 3.6, 3.3, "r").rect(9, 4 + Y, 11, 7 + Y, "s").px(11, 5 + Y, "k").rect(5, Y, 10, 2 + Y, "G").rect(5, 2 + Y, 10, 2 + Y, "g").rect(3, 3 + Y, 13, 3 + Y, "g");
    else g.ell(8, 4.3 + Y, 4.3, 4, "r").ell(7, 2.6 + Y, 2, 1.2, "R").rect(9, 4 + Y, 11, 7 + Y, "s").px(11, 5 + Y, "k").rect(3, 5 + Y, 4, 6 + Y, "R");
    return g.outline("O").rows();
  }
  function bake(rows, pal, flip, solid) {
    const h = rows.length, w = Math.max(...rows.map((r) => r.length)), c = mk(w, h), g = c.getContext("2d");
    rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const p = pal[r[x]]; if (!p) continue; g.fillStyle = solid || p; g.fillRect(flip ? w - 1 - x : x, y, 1, 1); } });
    return c;
  }
  const pixList = (rows, pal) => { const out = []; rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (pal[r[x]]) out.push([x, y, pal[r[x]]]); }); return out; };
  const folkFrames = (v) => [0, 1, 2, 3].map((f) => { const rows = folkRows(v, f); return { r: bake(rows, v.p, false), l: bake(rows, v.p, true) }; });

  // torch flame: a teardrop with a white-hot base, swaying a little per frame (4 frames per size)
  function flame(w, h, f) {
    const c = mk(w, h), g = c.getContext("2d"), cx = (w - 1) / 2;
    for (let y = 0; y < h; y++) {
      const v = y / (h - 1);
      let hw = (w / 2) * (v < 0.72 ? Math.pow(v / 0.72, 0.85) : 1 - ((v - 0.72) / 0.28) * 0.32);
      hw *= 0.9 + 0.14 * Math.sin(f * 1.9 + y * 0.8);
      const off = Math.sin(f * 1.57 + v * 2.4) * (1 - v) * 1.5;
      for (let x = 0; x < w; x++) {
        const d = Math.abs(x - cx - off) / Math.max(0.5, hw); if (d > 1) continue;
        g.fillStyle = v > 0.58 && d < 0.5 ? "#FFF7D2" : v > 0.36 && d < 0.72 ? "#FFD64A" : d < 0.9 || v < 0.22 ? "#FF9622" : "#E0501A";
        g.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }

  // light: the archway's warm glow (+ the spill on the cobbles) and a torch halo, drawn additively with a pulsing alpha
  function paintLight() {
    const arch = mk(W, H), g = arch.getContext("2d");
    g.save(); g.beginPath(); g.moveTo(ARCH.x0, ARCH.bot); g.lineTo(ARCH.x0, ARCH.cy); g.arc(ARCH.cx, ARCH.cy, ARCH.r, Math.PI, 0); g.lineTo(ARCH.x1, ARCH.bot); g.closePath(); g.clip();
    let gr = g.createRadialGradient(ARCH.cx + 2, 128, 2, ARCH.cx + 2, 128, 34);
    gr.addColorStop(0, "rgba(255,200,110,.75)"); gr.addColorStop(0.5, "rgba(255,150,50,.35)"); gr.addColorStop(1, "rgba(255,120,30,0)");
    g.fillStyle = gr; g.fillRect(ARCH.x0, ARCH.cy - ARCH.r, ARCH.x1 - ARCH.x0, ARCH.bot - ARCH.cy + ARCH.r); g.restore();
    g.save(); g.translate(122, 146); g.scale(1.7, 0.75);   // spill on the cobbles in front of the gate
    gr = g.createRadialGradient(0, 0, 0, 0, 0, 22); gr.addColorStop(0, "rgba(255,180,80,.45)"); gr.addColorStop(1, "rgba(255,140,40,0)");
    g.fillStyle = gr; g.fillRect(-22, -22, 44, 44); g.restore();
    const torch = mk(40, 40), t = torch.getContext("2d");
    gr = t.createRadialGradient(20, 20, 0, 20, 20, 20); gr.addColorStop(0, "rgba(255,190,90,.55)"); gr.addColorStop(0.45, "rgba(255,140,50,.2)"); gr.addColorStop(1, "rgba(255,120,30,0)");
    t.fillStyle = gr; t.fillRect(0, 0, 40, 40);
    return { arch, torch };
  }

  // barrier: a translucent sheet of green light rising from the ground line, 6 pre-rendered frames plus a soft glow
  function paintBarrier() {
    const frames = [], R = rng(42);
    for (let f = 0; f < 6; f++) {
      const c = mk(W, H), g = c.getContext("2d");
      for (let x = BAR.x0; x <= BAR.x1; x++) {
        const u = (x - BAR.x0) / (BAR.x1 - BAR.x0), gy = Math.round(BAR.y0 + u * (BAR.y1 - BAR.y0)), h = bhAt(u), strand = x % 2 === 0;
        for (let y = gy - h; y <= gy; y++) {
          const up = (gy - y) / h, band = Math.sin(y * 0.42 + f * 1.047 + x * 0.15);
          let a = 0.2 + (strand ? 0.3 : 0) + (band > 0.5 ? 0.3 : 0);
          a *= up > 0.85 ? 1.3 : up < 0.12 ? 1.2 : 0.7 + up * 0.4;
          g.fillStyle = band > 0.82 ? `rgba(226,255,232,${Math.min(0.95, a + 0.2)})` : `rgba(92,240,138,${Math.min(0.9, a)})`;
          g.fillRect(x, y, 1, 1);
        }
        g.fillStyle = "#E4FFE8"; g.fillRect(x, gy - h, 1, 1); g.fillStyle = "rgba(124,255,158,.85)"; g.fillRect(x, gy - h + 1, 1, 1);   // bright crest
        g.fillStyle = "#7CFF9E"; g.fillRect(x, gy, 1, 1); g.fillStyle = "rgba(60,220,110,.75)"; g.fillRect(x, gy + 1, 1, 1);   // ground line
        if (R() < 0.35) { g.fillStyle = R() < 0.5 ? "#F0FFF2" : "#9CFFB4"; g.fillRect(x, gy - Math.floor(R() * h), 1, 1); }
        if (R() < 0.25) { g.fillStyle = "rgba(156,255,180,.8)"; g.fillRect(x - 1 - Math.floor(R() * 3), gy - Math.floor(R() * h * 1.1), 1, 1); }
      }
      frames.push(c);
    }
    const glow = mk(W, H), g = glow.getContext("2d");
    g.beginPath(); g.moveTo(BAR.x0, BAR.y0);
    for (let x = BAR.x0; x <= BAR.x1; x++) { const u = (x - BAR.x0) / (BAR.x1 - BAR.x0); g.lineTo(x, BAR.y0 + u * (BAR.y1 - BAR.y0) - bhAt(u) - 2); }
    g.lineTo(BAR.x1, BAR.y1); g.closePath(); g.fillStyle = "rgba(60,255,120,.14)"; g.fill();
    g.lineWidth = 5; g.strokeStyle = "rgba(60,255,120,.12)"; g.stroke();
    g.lineCap = "round";
    for (const [lw, a] of [[14, 0.05], [8, 0.08], [4, 0.14]]) { g.strokeStyle = `rgba(60,255,120,${a})`; g.lineWidth = lw; g.beginPath(); g.moveTo(BAR.x0, BAR.y0); g.lineTo(BAR.x1, BAR.y1); g.stroke(); }
    return { frames, glow };
  }

  // travellers' route: along the path, through the barrier and the gate, then out across the courtyard
  function route(from) {
    const p = [];
    if (from < 55) p.push([55, 150 + (Math.random() - 0.5) * 8]);
    if (from < 98) p.push([100, 146 + (Math.random() - 0.5) * 3]);
    p.push([DOOR[0] + (Math.random() - 0.5) * 4, DOOR[1]], [INNER[0], INNER[1], "in"], [EXIT[0], EXIT[1], "out"], [212 + Math.random() * 10, 124 + Math.random() * 4]);
    if (Math.random() < 0.45) p.push([236 + Math.random() * 30, 117 + Math.random() * 3, "wait"]);   // stop by the fountain
    p.push([308, 117 + Math.random() * 4]);
    return p;
  }

  // ---------------------------------------------------------------- skin
  const skin = {
    mount(el) {
      const turret = '<svg class="dg-tur" viewBox="0 0 14 16" aria-hidden="true"><path fill="#6E6E7A" d="M1 0h3v2h2V0h2v2h2V0h3v5H1z"/><path fill="#55555F" d="M2 5h10v11H2z"/><path fill="#8E2A2E" d="M4 7h6v7l-3-2-3 2z"/><path fill="#D4A84A" d="M4 7h6v1H4z"/></svg>';
      el.innerHTML = `
        <div class="dg-top">
          <div class="dg-title">${turret}<b>DUNGEON GATE</b>${turret}</div>
          <span class="dg-pill" data-k="state"></span>
          <button class="dg-btn" data-act="allowed" data-k="allowed" type="button"><i class="dg-ic-list"></i>Allowed<span class="n"></span></button>
          <button class="dg-btn" data-act="style" type="button"><i class="dg-ic-gear"></i>Style</button>
        </div>
        <div class="dg-scene"><img class="dg-plate" src="themes/dungeon/plate.webp" alt="" draggable="false"><canvas class="dg-cv"></canvas>
          <div class="dg-calls fade" data-k="calls"></div>
          <div class="dg-gate" data-k="gate"><div><b>GATE OPEN</b><i data-k="gatet"></i></div><span>BARRIER DOWN</span></div>
        </div>
        <div class="dg-side">
          <div class="dg-stat"><div class="dg-v num" data-k="blocked"></div><div class="dg-k" data-k="lab">Blocked - 24h</div></div>
          <div class="dg-stat"><div class="dg-v g num" data-k="pct"></div><div class="dg-k">Blocked</div></div>
          <div class="dg-stat"><div class="dg-v num" data-k="total"></div><div class="dg-k">Queries - 24h</div></div>
          <button class="dg-pause" data-act="pause" data-k="pause" type="button"></button>
          <div class="dg-meta" data-k="meta"></div>
        </div>`;
      const host = el.querySelector(".dg-scene"), img = el.querySelector(".dg-plate"), cv = el.querySelector("canvas"), ctx = cv.getContext("2d");
      cv.width = W; cv.height = H;
      const calls = q(el, "calls");
      calls.innerHTML = LANES.map((_, i) => `<div class="dg-call c${i}" data-i="${i}"><span class="d"></span><span class="t"></span></div>`).join("");
      const monsters = MONSTERS.map((mo) => {
        const f = [mo.make(0), mo.make(1)];
        return { img: f.map((r) => bake(r, mo.pal)), flash: bake(f[0], mo.pal, false, "#FFFFFF"), pix: pixList(f[0], mo.pal).filter(([x, y]) => (x + y) % 2 === 0) };
      });
      const S = this.s = {
        m: null, ctx, light: paintLight(), barrier: paintBarrier(), monsters, folk: FOLK.map(folkFrames),
        flames: TORCHES.map((tc) => [0, 1, 2, 3].map((f) => flame(tc.w, tc.h, f))), fl: [0.4, 0.4],
        rate: K.rateTracker(), news: K.newsTracker(), actors: [], parts: [], ripples: [], embers: [], accM: 0, accF: 0,
        tips: LANES.map((l) => ({ x: bxAt(l.yt) - 10, y: l.yt - 18 })), wasOn: true, k: 2, ox: 0, oy: 0, calls: [...calls.children], callOn: [false, false, false],
        flies: Array.from({ length: 8 }, (_, i) => ({ x: 8 + ((i * 23) % 80), y: i < 6 ? 24 + ((i * 37) % 96) : 186 + i * 3, p: i * 1.7 })),
        drops: Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2; return { x: FOUNT.px + Math.cos(a) * 11, y: FOUNT.py + Math.sin(a) * 2.6, p: i * 2.3 }; }),
      };
      const size = () => {
        const Wh = host.clientWidth, Hh = host.clientHeight; if (!Wh || !Hh) return;
        const s = Math.max(Wh / IW, Hh / IH), w = Math.round(IW * s), h = Math.round(IH * s);
        S.ox = Math.round((Wh - w) * 0.5); S.oy = Math.round((Hh - h) * 0.35); S.k = w / W;
        for (const e of [img, cv]) { e.style.width = `${w}px`; e.style.height = `${h}px`; e.style.left = `${S.ox}px`; e.style.top = `${S.oy}px`; }
        S.calls.forEach((c, i) => { c.style.left = `${Math.max(6, Math.round(S.ox + 3 * S.k))}px`; c.style.top = `${Math.round(S.oy + LABEL_Y[i] * S.k)}px`; });
      };
      size(); this.ro = new ResizeObserver(size); this.ro.observe(host);
      for (const x0 of [8, 44, 196]) this.spawnFolk(x0);
      this.stop = K.loop((dt, t) => this.frame(dt, t), 20);
    },
    unmount() { if (this.stop) this.stop(); if (this.ro) this.ro.disconnect(); this.s = null; },

    render(el, m) {
      const S = this.s, d = m.data || {}, mt = meta(m); S.m = m; S.rate.update(m);
      for (const it of S.news(m.ticker)) this.spawnMonster(0, true);
      const st = q(el, "state"); st.innerHTML = `<i></i>${esc(m.pill.text)}`; st.className = `dg-pill ${m.pill.cls}`;
      q(el, "blocked").textContent = num(d.blocked); q(el, "pct").textContent = pct(d.percent_blocked); q(el, "total").textContent = num(d.total);
      q(el, "lab").textContent = m.labelAlert ? m.label : "Blocked - 24h";
      const items = m.ticker.slice(0, 3);
      S.calls.forEach((c, i) => {
        const it = items[i]; S.callOn[i] = !!it; c.hidden = !it; if (!it) { c.removeAttribute("data-domain"); return; }
        c.dataset.domain = it.domain; c.querySelector(".d").textContent = it.domain; c.querySelector(".t").textContent = short(ago(m, it));
      });
      const cd = (m.pill.text.split("·")[1] || "").trim();
      q(el, "gate").classList.toggle("on", m.paused); q(el, "gatet").textContent = cd;
      q(el, "pause").textContent = pauseText(m);
      q(el, "meta").textContent = `CPU ${mt.temp}  |  Up ${mt.up}`;
      common(el, m);
      fit(q(el, "blocked"), 18); fit(q(el, "pct"), 18); fit(q(el, "total"), 18);
    },

    // ---- actors
    spawnFolk(x0) {
      const S = this.s; if (S.actors.filter((a) => a.type === "folk").length >= 9) return;
      const x = x0 == null ? -10 : x0, inside = x > EXIT[0];
      const a = { type: "folk", v: (Math.random() * FOLK.length) | 0, x, y: inside ? 126 : 150 + Math.round((Math.random() - 0.5) * 12), path: route(x), i: 0,
        sp: 10 + Math.random() * 4, dist: Math.random() * 10, face: 1, fi: 1, hide: 0, pause: 0 };
      if (inside) a.i = a.path.findIndex((p) => p[0] > x);
      S.actors.push(a);
    },
    spawnMonster(lane, labelled) {
      const S = this.s; if (S.actors.filter((a) => a.type === "mon").length >= 12) return;
      const ln = lane == null ? (Math.random() * 3) | 0 : lane, L = LANES[ln], x = labelled ? 14 : -12, y = L.y0 + Math.round((Math.random() - 0.5) * 4);
      const tx = bxAt(L.yt) + 4, dx = tx - x, dy = L.yt - y, dd = Math.hypot(dx, dy);
      S.actors.push({ type: "mon", kind: (S.mk = ((S.mk || 0) + 1 + ((Math.random() * 2) | 0)) % 3), lane: ln, x, y, ux: dx / dd, uy: dy / dd,
        sp: 8 + Math.random() * 4, dist: 0, ph: Math.random() * 6, state: "walk", t: 0, face: 1, path: null, i: 0, fi: 1, hide: 0, pause: 0 });
    },
    dissolve(a) {
      const S = this.s, mo = S.monsters[a.kind], x0 = Math.round(a.x) - 10, y0 = Math.round(a.y) - 19;
      for (const [px, py, c] of mo.pix) if (S.parts.length < 700) S.parts.push({ x: x0 + px, y: y0 + py, vx: (Math.random() - 0.8) * 14, vy: -Math.random() * 10 - 2, g: 9, life: 0.6 + Math.random() * 0.9, c: Math.random() < 0.25 ? "#FFB0A0" : c });
      S.ripples.push({ u: cl((a.y - BAR.y0) / (BAR.y1 - BAR.y0), 0, 1), t: 0, hit: true });
    },
    move(a, dt) {   // follow the waypoint path; returns false when it walked off the map
      if (a.hide > 0) { a.hide -= dt; if (a.hide <= 0) { a.x = EXIT[0]; a.y = EXIT[1]; a.fi = 0; } return true; }
      if (a.pause > 0) { a.pause -= dt; return true; }
      if (a.i >= a.path.length) return false;
      const [tx, ty, tag] = a.path[a.i];
      const dx = tx - a.x, dy = ty - a.y, dd = Math.hypot(dx, dy), st = a.sp * dt;
      if (dd <= st) {
        a.x = tx; a.y = ty; a.i++;
        if (tag === "in") a.hide = 0.7 + Math.random() * 0.6;                // walking through the gatehouse
        if (tag === "wait") a.pause = 1.5 + Math.random() * 2.5;
      } else { a.x += (dx / dd) * st; a.y += (dy / dd) * st; if (Math.abs(dx) > 0.5) a.face = dx > 0 ? 1 : -1; }
      a.dist += st; a.fi = Math.min(1, a.fi + dt * 2.5);
      return a.x < 312;
    },
    alpha(a) {   // fade out into the tunnel, fade in at the courtyard side
      if (a.hide > 0) return 0;
      const p = a.path && a.path[a.i];
      if (p && p[2] === "in") return cl(Math.hypot(a.x - p[0], a.y - p[1]) / 7, 0, 1);
      return a.fi;
    },
    draw(a, t) {
      const S = this.s, ctx = S.ctx, al = this.alpha(a); if (al <= 0.02) return;
      const x = Math.round(a.x), y = Math.round(a.y);
      ctx.globalAlpha = 0.32 * al; ctx.fillStyle = "#000"; ctx.fillRect(x - 6, y - 1, 12, 2);
      ctx.globalAlpha = al;
      if (a.type === "folk") {
        const fr = a.pause > 0 ? S.folk[a.v][1] : S.folk[a.v][Math.floor(a.dist / 3.5) % 4], img = a.face > 0 ? fr.r : fr.l;
        ctx.drawImage(img, x - 8, y - img.height + 1 + (a.pause > 0 && Math.sin(t * 3 + a.v) > 0.6 ? -1 : 0));
      } else {
        const mo = S.monsters[a.kind], bob = a.state === "hit" ? 0 : Math.round(Math.sin(t * 8 + a.ph)), jit = a.state === "hit" ? ((t * 40) | 0) % 2 : 0;
        const img = a.state === "hit" && ((a.t * 20) | 0) % 2 === 0 ? mo.flash : mo.img[Math.floor(a.dist / 4) % 2];
        if (a.x > 24 && a.x < 118 && (!a.path || a.path[a.i] && a.path[a.i][2] !== "out")) { const tp = S.tips[a.lane]; tp.x = x - 4; tp.y = y - 19 + bob; }
        ctx.drawImage(img, x - 10 - jit, y - 19 + bob + (a.pause > 0 && Math.sin(t * 14) > 0 ? -2 : 0));
      }
      ctx.globalAlpha = 1;
    },

    frame(dt, t) {
      const S = this.s; if (!S) return; const m = S.m; if (!m || m.asleep) return;
      const ctx = S.ctx, on = !m.paused;
      // spawn by the live rates (time-lapsed and capped)
      if (!m.stale) {
        const r = S.rate.get(m);
        S.accF += dt * cl((r.q - r.b) * 0.25, 0.22, 0.75); S.accM += dt * cl(r.b * 0.6, 0.25, 0.6);
        while (S.accF >= 1) { S.accF -= 1; this.spawnFolk(); }
        while (S.accM >= 1) { S.accM -= 1; this.spawnMonster(1 + ((Math.random() * 2) | 0)); }
      }
      if (S.wasOn && !on) for (let x = BAR.x0; x <= BAR.x1; x += 1) {   // the barrier collapses into motes
        const u = (x - BAR.x0) / (BAR.x1 - BAR.x0), gy = BAR.y0 + u * (BAR.y1 - BAR.y0), h = bhAt(u);
        for (let k = 0; k < 3; k++) S.parts.push({ x, y: gy - Math.random() * h, vx: (Math.random() - 0.5) * 6, vy: Math.random() * 6, g: 14, life: 0.4 + Math.random() * 0.8, c: Math.random() < 0.5 ? "#7CFF9E" : "#E4FFE8" });
      }
      S.wasOn = on;

      // update actors
      S.actors = S.actors.filter((a) => {
        if (a.type === "folk") {
          const out0 = a.x < bxAt(a.y), alive = this.move(a, dt);
          if (on && out0 && a.x >= bxAt(a.y) && a.y > BAR.y0 - 2 && a.y < BAR.y1 + 2) S.ripples.push({ u: cl((a.y - BAR.y0) / (BAR.y1 - BAR.y0), 0, 1), t: 0, hit: false });
          return alive;
        }
        if (a.state === "hit") { a.t += dt; if (a.t > 0.3) { this.dissolve(a); return false; } return true; }
        if (a.path && on && a.x + 7 < bxAt(a.y) && a.hide <= 0) { a.path = null; a.pause = 0; const L = LANES[a.lane], dx = bxAt(L.yt) + 4 - a.x, dy = L.yt - a.y, dd = Math.hypot(dx, dy) || 1; a.ux = dx / dd; a.uy = dy / dd; }
        if (a.path) return this.move(a, dt);
        if (on) {
          if (a.x + 7 >= bxAt(a.y) - 1) { a.state = "hit"; a.t = 0; return true; }
        } else {   // gate open: in they go
          a.path = route(a.x); a.i = 0; a.sp = 12;
          return true;
        }
        const st = a.sp * dt; a.x += a.ux * st; a.y += a.uy * st; a.dist += st; return true;
      });

      ctx.clearRect(0, 0, W, H);
      // light: the archway breathes, the torches flicker
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = cl((on ? 0.42 : 0.55) + 0.2 * Math.sin(t * 1.5) + 0.06 * Math.sin(t * 4.1), 0, 1); ctx.drawImage(S.light.arch, 0, 0);
      TORCHES.forEach((tc, i) => {
        S.fl[i] += (0.3 + Math.random() * 0.35 - S.fl[i]) * 0.5;
        ctx.globalAlpha = S.fl[i]; ctx.drawImage(S.light.torch, Math.round(tc.x + tc.w / 2 - 20), Math.round(tc.y + tc.h * 0.6 - 20));
      });
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      // flames (cover the painted ones) and embers
      TORCHES.forEach((tc, i) => {
        ctx.drawImage(S.flames[i][(Math.floor(t * 10) + i * 2 + (Math.random() < 0.15 ? 1 : 0)) % 4], tc.x, tc.y);
        if (Math.random() < dt * 2.5 && S.embers.length < 24) S.embers.push({ x: tc.x + tc.w / 2 + (Math.random() - 0.5) * 2, y: tc.y + 1, vx: (Math.random() - 0.5) * 4, life: 0.8 + Math.random() * 0.8 });
      });
      S.embers = S.embers.filter((e) => { e.life -= dt; e.y -= 9 * dt; e.x += e.vx * dt + Math.sin(e.life * 9) * 0.1; ctx.fillStyle = e.life > 0.6 ? "#FFC23A" : "#FF7A1A"; ctx.fillRect(Math.round(e.x), Math.round(e.y), 1, 1); return e.life > 0; });
      // fountain: droplets down the two jets, glints on the column and the pool
      for (let i = 0; i < 10; i++) {
        const s = (t * 0.85 + i / 10) % 1, dir = i % 2 ? 1 : -1;
        ctx.fillStyle = s < 0.5 ? "#F2FDFF" : "#A8E8FF";
        ctx.fillRect(Math.round(FOUNT.x + dir * (0.6 + s * 5.4)), Math.round(FOUNT.y + 1 - 2 * s + 19 * s * s), 1, 1);
      }
      ctx.fillStyle = "#F2FDFF";
      for (let i = 0; i < 3; i++) { const s = (t * 1.3 + i / 3) % 1; ctx.fillRect(Math.round(FOUNT.x - 1 + (i % 2) * 2), Math.round(FOUNT.y + 2 + s * 16), 1, 1); }
      for (const d of S.drops) if (Math.sin(t * 2.2 + d.p * 3.1) > 0.55) ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 1);

      // actors behind the barrier, the barrier, then the ones still outside it
      S.actors.sort((a, b) => a.y - b.y);
      for (const a of S.actors) if (a.x >= bxAt(a.y)) this.draw(a, t);
      if (on) {
        ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 2.4); ctx.drawImage(S.barrier.glow, 0, 0);
        ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
        ctx.drawImage(S.barrier.frames[Math.floor(t * 9) % S.barrier.frames.length], 0, 0);
      }
      S.ripples = S.ripples.filter((r) => {
        r.t += dt; if (!on) return false;
        const sp = r.t * (r.hit ? 40 : 26);
        ctx.fillStyle = r.hit ? (r.t < 0.12 ? "#FFFFFF" : "#FFD0C0") : "#E4FFE8";
        for (const s of [-1, 1]) {
          const u = r.u + (s * sp) / BLEN; if (u < 0 || u > 1) continue;
          const x = Math.round(BAR.x0 + u * (BAR.x1 - BAR.x0)), gy = Math.round(BAR.y0 + u * (BAR.y1 - BAR.y0)), h = bhAt(u);
          ctx.globalAlpha = 0.7; ctx.fillRect(x, gy - h, 1, h + 1); ctx.globalAlpha = 1;
        }
        if (r.hit && r.t < 0.15) { const x = Math.round(BAR.x0 + r.u * (BAR.x1 - BAR.x0)), gy = Math.round(BAR.y0 + r.u * (BAR.y1 - BAR.y0)); ctx.fillRect(x - 2, gy - 20, 4, 18); }
        return r.t < (r.hit ? 0.5 : 0.35);
      });
      for (const a of S.actors) if (a.x < bxAt(a.y)) this.draw(a, t);

      // fireflies in the forest
      ctx.fillStyle = "#D8FF7A";
      for (const f of S.flies) { if (Math.sin(t * 1.7 + f.p * 3) < 0.2) continue; ctx.fillRect(Math.round(f.x + Math.sin(t * 0.6 + f.p) * 4), Math.round(f.y + Math.cos(t * 0.5 + f.p) * 5), 1, 1); }
      // dissolve particles
      S.parts = S.parts.filter((p) => {
        p.life -= dt; if (p.life <= 0) return false;
        p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.life < 0.3 && ((t * 20) | 0) % 2) return true;
        ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); return true;
      });
      // call-out leader lines (dotted) from each label down to its monster
      ctx.fillStyle = "rgba(236,232,220,.9)";
      LABEL_Y.forEach((ly, i) => {
        if (!S.callOn[i]) return;
        const x0 = 52 + i * 6, y0 = ly + 21, x1 = S.tips[i].x, y1 = S.tips[i].y, n = Math.max(1, Math.abs(x1 - x0), Math.abs(y1 - y0));
        for (let j = 0; j <= n; j += 2) ctx.fillRect(Math.round(x0 + ((x1 - x0) * j) / n), Math.round(y0 + ((y1 - y0) * j) / n), 1, 1);
        ctx.fillRect(x1 - 1, y1 - 1, 2, 2);
      });
    },
  };

  window.PiSkins.add("dungeon", skin, "Dungeon Gate", "Monsters dissolve at the gate", K.T(
    '<rect width="160" height="96" fill="#193A1A"/><rect width="160" height="12" fill="#16161A"/><text x="8" y="9" font-size="7" font-family="monospace" font-weight="700" fill="#EADBB4">DUNGEON GATE</text>' +
    '<rect x="56" y="12" width="34" height="84" fill="#474753"/><rect x="56" y="12" width="34" height="5" fill="#5B5B68"/><path d="M63 96V66a10 10 0 0 1 20 0v30z" fill="#1A110E"/><rect x="66" y="22" width="12" height="18" fill="#80202A"/>' +
    '<rect x="90" y="12" width="40" height="22" fill="#363640"/><rect x="90" y="34" width="40" height="62" fill="#3E3C44"/><ellipse cx="114" cy="56" rx="11" ry="5" fill="#25607F" stroke="#77777F" stroke-width="2"/>' +
    '<path d="M44 20q-6 38 0 76" stroke="#7CFF9E" stroke-width="2" fill="none"/><rect x="28" y="46" width="9" height="7" fill="#D8343A"/><rect x="24" y="72" width="9" height="7" fill="#D8343A"/><g fill="#FFB0A0"><rect x="40" y="62" width="1.5" height="1.5"/><rect x="37" y="58" width="1.5" height="1.5"/><rect x="35" y="64" width="1.5" height="1.5"/></g>' +
    '<rect x="70" y="80" width="5" height="9" fill="#2E8A7E"/><rect x="98" y="82" width="5" height="9" fill="#4A9A5E"/>' +
    '<rect x="132" y="12" width="28" height="84" fill="#121216"/><rect x="135" y="16" width="22" height="16" rx="2" fill="#1C1C22" stroke="#3A3A44"/><rect x="135" y="36" width="22" height="16" rx="2" fill="#1C1C22" stroke="#3A3A44"/><rect x="135" y="78" width="22" height="12" rx="2" fill="#F59A2A"/>'));
})();
