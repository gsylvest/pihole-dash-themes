// PACKET WORKS: a cosy isometric factory floor. The world is Gary's painted plate (themes/sorter/plate.webp: empty belt,
// SCAN arch, furnace, signs, shelves); everything that lives is drawn over it in code (original characters).
// Queries are boxes on the conveyor, from the SCAN arch (left) to the belt end under the INTERNET sign (right), where
// they tip over the end roller and drop out of sight. Green boxes (allowed) ride through. Each new blocked domain comes
// out of the scanner as a red box: worker 1 lifts it off the belt, tosses it to worker 2, who passes it to worker 3,
// who throws it in an arc into the furnace (fire flares, sparks). Cream call-out tags (max 3, tappable, data-domain)
// follow the red boxes being handled, with their age. Extra unlabelled boxes are paced by the live rates (capped).
// Paused: the crew takes a break (mug, hands on hips, a nap), the furnace burns low, the SCAN panel blinks amber and
// red boxes ride straight past to the internet.
//
// The crew are Gary's painted sprites (themes/sorter/crew.webp, 3 workers x 5 poses), pre-scaled once and pose-swapped.
// Layers per frame: plate (image scaled once into an offscreen canvas, lettering baked in) -> fire/smoke -> crew
// -> belt boxes -> overlays CUT FROM THE PLATE (scanner body, INTERNET sign + near end guard) so boxes pass behind them
// -> lifted/flying boxes, sparks. All anchors below are in PLATE pixels (1200x880) and converted with L().
// If the image fails to load, a simpler code-painted factory at the same anchors is used instead.
(() => {
  "use strict";
  const K = window.PiSkinKit; if (!K) return;
  const { num, pct, q, fit, ago, short, meta, common, pauseText } = K;

  // ---------------------------------------------------------------- scene anchors
  const W = 608, H = 432;                                  // logical scene size (canvas px)
  const PLATE_SRC = "themes/sorter/plate.webp", PLATE_W = 1200, PLATE_H = 880;
  const PK = W / PLATE_W, PY = (PLATE_H * PK - H) / 2;     // plate is scaled to width and centre-cropped vertically
  const L = (x, y) => [x * PK, y * PK - PY];               // plate px -> logical px
  const AN = {                                             // ---- measured on the plate (plate px)
    beltA: [0, 452], beltB: [1060, 718],                   // centre line of the rubber; B = top of the end roller
    beltExitX: 220,                                        // where the belt leaves the scanner opening
    workers: [[392, 508], [556, 516], [724, 478]],         // feet of worker 1, 2, 3 (clear floor behind the belt)
    pickX: 352,                                            // worker 1 lifts red boxes off the belt here
    mouth: [974, 323], fireBase: [977, 388],               // furnace opening centre / hearth
    mouthPoly: [[919, 390], [919, 292], [928, 270], [950, 254], [978, 249], [1008, 255], [1028, 274], [1035, 300], [1035, 375]],
    chimney: [1055, 73],
    scanPanel: [217, 359], scanSlope: -0.284,              // blank panel on the arch
    scanLeds: [[182, 311], [200, 306], [217, 302]],
    scanOpening: [[160, 414], [174, 400], [264, 379], [272, 388], [272, 492], [160, 522]],
    // scanner body in front of the belt (left wall, left pillar, lintel, roof): boxes are hidden behind this
    scanMask: [[[70, 352], [100, 322], [150, 300], [160, 288], [238, 278], [248, 300], [272, 318], [299, 340], [299, 380], [274, 388], [264, 379], [174, 400], [160, 414], [160, 604], [70, 604]]],
    // INTERNET sign board, its left post and the near-side yellow end guard: boxes pass behind these
    endMask: [[[927, 566], [940, 551], [1140, 521], [1159, 529], [1176, 560], [1151, 601], [1135, 609], [950, 649], [933, 643], [927, 626]],
      [[945, 640], [975, 636], [975, 722], [945, 714]],
      [[920, 712], [940, 705], [1003, 732], [1024, 752], [1024, 834], [990, 843], [962, 831], [962, 788], [920, 773]]],
    woodSign: [180, 99], woodSlope: -0.196,                // blank wooden wall sign
    netSign: [1042, 585], netSlope: -0.185,                // blank yellow arrow sign
    tags: [[316, 254], [572, 179], [868, 136]],              // call-out anchor (bottom centre) per brigade stage
  };
  // Axonometric projection fitted to the belt: floor point (a along the belt, b across it, z up) -> logical screen px.
  const UX = 0.97, UY = UX * (AN.beltB[1] - AN.beltA[1]) / (AN.beltB[0] - AN.beltA[0]), VX = -0.80, VY = 0.28;
  const BELT = { z: 30, half: 23, rail: 27, a0: -80, a1: L(AN.beltB[0], 0)[0] / UX, speed: 44, spawnA: -44 };   // belt line: b = 0, surface at z
  const OY = L(AN.beltA[0], AN.beltA[1])[1] + BELT.z;      // screen = (a*UX + b*VX, OY + a*UY + b*VY - z)
  const SCAN = { a1: L(AN.beltExitX, 0)[0] / UX, a0: L(AN.beltExitX, 0)[0] / UX - 31, inner: 27, outer: 38, h: 115, top: 85 };
  const PICK_A = L(AN.pickX, 0)[0] / UX;
  const WORKERS = AN.workers.map((p, i) => { const l = L(p[0], p[1]); return { x: Math.round(l[0]), y: Math.round(l[1]), look: i - 1 }; });
  const MOUTH = L(AN.mouth[0], AN.mouth[1]), FIRE = L(AN.fireBase[0], AN.fireBase[1]), CHIMNEY = L(AN.chimney[0], AN.chimney[1]);
  const TAG_HOME = AN.tags.map((p) => L(p[0], p[1]).map(Math.round));
  // only used by the code-painted fallback world
  const FURN = { a0: 211, a1: 321, bf: -295, bb: -385, base: 30, top: 140, mouthA: 266, mouthZ: 77 };
  const SIGN = { a: 520, b0: -32, len: 104, z0: 34, z1: 74 };
  const WALL = { a: -58, b: -390 };
  // crew sprite sheet: rows = worker A, B, C; columns = POSES; [x, y, w, h, footX] in sheet px (anchor = footX, bottom)
  const CREW_SRC = "themes/sorter/crew.webp", POSES = ["idle", "reach", "hold", "throw", "break"];
  const CREW = [
    [[1, 5, 52, 119, 25], [86, 23, 74, 101, 48], [171, 8, 67, 116, 37], [256, 8, 78, 116, 25.5], [341, 8, 62, 116, 33]],
    [[1, 132, 57, 117, 24.5], [86, 146, 76, 103, 50.5], [171, 132, 66, 117, 36.5], [256, 134, 79, 115, 28], [341, 133, 61, 116, 36]],
    [[1, 251, 52, 123, 24], [86, 270, 78, 104, 51.5], [171, 251, 70, 123, 38.5], [256, 254, 83, 120, 26], [341, 269, 66, 105, 33]],
  ];
  const CS = 0.78;                           // crew draw scale: a standing worker is ~93 px, a little taller than the furnace arch
  const CARRY = [-2, -Math.round(109 * CS)];                  // where a carried box sits (base centre) relative to the feet: on the raised hands
  const CUBE = 11;                           // half size of a box
  const SLOT = 1.4, HOLD = [1.0, 1.7, 2.2];  // belt slot period (s), relaxed hold time per worker (s)

  const P = (a, b, z) => [a * UX + b * VX, OY + a * UY + b * VY - (z || 0)];
  const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (k) => k * k * (3 - 2 * k);
  const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  // ---------------------------------------------------------------- drawing helpers
  const lg = (g, x0, y0, x1, y1, st) => { const r = g.createLinearGradient(x0, y0, x1, y1); st.forEach((c, i) => r.addColorStop(i / (st.length - 1), c)); return r; };
  const rg = (g, x, y, r, st) => { const d = g.createRadialGradient(x, y, 0, x, y, r); st.forEach((c, i) => d.addColorStop(i / (st.length - 1), c)); return d; };
  function poly(g, pts, fill, stroke, lw) {
    g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); if (!stroke) { g.strokeStyle = fill; g.lineWidth = 0.6; g.stroke(); } }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1; g.stroke(); }
  }
  const line = (g, pts, stroke, lw) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.strokeStyle = stroke; g.lineWidth = lw || 1; g.stroke(); };
  const ell = (g, x, y, rx, ry, fill, rot) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, 6.2832); g.fillStyle = fill; g.fill(); };
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  // Box with its three visible faces; c = [top, +V face (left-front), +U face (right-front), edge highlight?]
  function box(g, a0, a1, b0, b1, z0, z1, c) {
    poly(g, [P(a1, b0, z0), P(a1, b1, z0), P(a1, b1, z1), P(a1, b0, z1)], c[2]);
    poly(g, [P(a0, b1, z0), P(a1, b1, z0), P(a1, b1, z1), P(a0, b1, z1)], c[1]);
    poly(g, [P(a0, b0, z1), P(a1, b0, z1), P(a1, b1, z1), P(a0, b1, z1)], c[0]);
    if (c[3]) { g.lineJoin = "round"; line(g, [P(a0, b1, z1), P(a1, b1, z1), P(a1, b0, z1)], c[3], 1.2); line(g, [P(a1, b1, z1), P(a1, b1, z0)], c[3], 1); }
  }
  // Local frames on the three face orientations: x runs along the face, y runs down the screen (or along b for the floor).
  const onV = (g, a, b, z, fn) => { const p = P(a, b, z); g.save(); g.transform(UX, UY, 0, 1, p[0], p[1]); fn(); g.restore(); };       // x -> +a
  const onU = (g, a, b, z, fn) => { const p = P(a, b, z); g.save(); g.transform(-VX, -VY, 0, 1, p[0], p[1]); fn(); g.restore(); };     // x -> -b (screen right)
  const onT = (g, a, b, z, fn) => { const p = P(a, b, z); g.save(); g.transform(UX, UY, VX, VY, p[0], p[1]); fn(); g.restore(); };     // x -> +a, y -> +b
  function hazard(g, x, y, w, h, step) {   // yellow / black warning stripes in the current local frame
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.fillStyle = "#F2B72E"; g.fillRect(x, y, w, h); g.fillStyle = "#26252B";
    for (let i = -h; i < w + h; i += step * 2) { g.beginPath(); g.moveTo(x + i, y + h); g.lineTo(x + i + step, y + h); g.lineTo(x + i + step + h, y); g.lineTo(x + i + h, y); g.closePath(); g.fill(); }
    g.restore();
  }
  const STEEL = ["#7C8290", "#5A5F6D", "#474B58", "rgba(210,216,230,.55)"], STEEL_D = ["#5E636F", "#444855", "#35384300", "rgba(190,196,210,.4)"];
  const YEL = ["#FFD257", "#F2B02A", "#CF8A17", "rgba(255,240,180,.8)"];
  const CARD = ["#D9AE74", "#BC8C54", "#9A6E3E", "rgba(255,225,170,.5)"];
  STEEL_D[2] = "#353843";

  // ---------------------------------------------------------------- fallback: a simpler code-painted world at the same anchors
  function paintFloor(g) {
    g.fillStyle = "#676064"; g.fillRect(0, 0, W, H);
    const T = 46;
    for (let ia = -7; ia < 20; ia++) for (let ib = -11; ib < 10; ib++) {
      const a0 = ia * T, b0 = ib * T, c = P(a0 + T / 2, b0 + T / 2, 0);
      if (c[0] < -40 || c[0] > W + 40 || c[1] < -30 || c[1] > H + 30) continue;
      const v = hash(ia + 40, ib + 40), s = 96 + Math.round(v * 16), warm = Math.round(v * 6);
      poly(g, [P(a0, b0), P(a0 + T, b0), P(a0 + T, b0 + T), P(a0, b0 + T)], `rgb(${s + 8 + warm},${s},${s + 3})`, "rgba(40,34,42,.55)", 1.3);
      line(g, [P(a0 + 2, b0 + T - 2), P(a0 + 2, b0 + 2), P(a0 + T - 2, b0 + 2)], "rgba(255,240,230,.07)", 1);
      if (v > 0.82) line(g, [P(a0 + 10, b0 + 30), P(a0 + 22, b0 + 22), P(a0 + 26, b0 + 10)], "rgba(40,34,42,.25)", 0.8);   // a hairline crack
    }
    // hazard line painted on the floor in the foreground
    onT(g, 300, 150, 0, () => { g.globalAlpha = 0.8; hazard(g, 0, 0, 290, 9, 12); g.globalAlpha = 1; });
  }
  function windowAt(g, x, w, zb, zt) {
    g.fillStyle = rg(g, x + w / 2, -(zb + zt) / 2, w * 1.7, ["rgba(255,170,70,.42)", "rgba(255,170,70,0)"]); g.fillRect(x - w * 1.5, -zt - w * 1.5, w * 4, zt - zb + w * 3);
    g.fillStyle = "#1A1C24"; g.fillRect(x - 4, -zt - 4, w + 8, zt - zb + 8);
    g.fillStyle = lg(g, 0, -zt, 0, -zb, ["#FFE09A", "#FFB04E", "#EE7F36"]); g.fillRect(x, -zt, w, zt - zb);
    g.fillStyle = "rgba(255,255,255,.22)"; g.beginPath(); g.moveTo(x, -zb); g.lineTo(x + w * 0.45, -zt); g.lineTo(x + w * 0.7, -zt); g.lineTo(x + w * 0.25, -zb); g.fill();
    g.fillStyle = "#2B2320"; g.fillRect(x + w / 3 - 1.3, -zt, 2.6, zt - zb); g.fillRect(x + (w * 2) / 3 - 1.3, -zt, 2.6, zt - zb); g.fillRect(x, -(zb + zt) / 2 - 1.3, w, 2.6);
    g.fillStyle = "#565B6B"; g.fillRect(x - 7, -zb + 4, w + 14, 4);
  }
  function wallFace(g, len) {   // planks, base board and columns in a wall-local frame
    for (let x = 0; x < len; x += 22) { g.fillStyle = "rgba(0,0,0,.2)"; g.fillRect(x, -320, 1.4, 320); g.fillStyle = "rgba(255,255,255,.035)"; g.fillRect(x + 1.4, -320, 1, 320); }
    g.fillStyle = "rgba(0,0,0,.16)"; g.fillRect(0, -74, len, 2); g.fillRect(0, -150, len, 2);
    g.fillStyle = "#1E2029"; g.fillRect(0, -10, len, 10); g.fillStyle = "rgba(255,255,255,.06)"; g.fillRect(0, -10, len, 1.2);
  }
  function column(g, x) { g.fillStyle = lg(g, x, 0, x + 13, 0, ["#5B6072", "#474B5A", "#333642"]); g.fillRect(x, -320, 13, 320); g.fillStyle = "#2A2C36"; g.fillRect(x - 2, -12, 17, 12); }
  function paintWalls(g) {
    const A = WALL.a, B = WALL.b;
    poly(g, [P(A, 140, 0), P(A, B, 0), P(A, B, 320), P(A, 140, 320)], lg(g, 0, 0, 0, 200, ["#222631", "#363B4A"]));
    poly(g, [P(A, B, 0), P(720, B, 0), P(720, B, 320), P(A, B, 320)], lg(g, 0, 0, 0, 190, ["#262A36", "#3E4354"]));
    onU(g, A, -60, 0, () => { wallFace(g, 300); column(g, 196); windowAt(g, 226, 56, 30, 92); });
    onV(g, A, B, 0, () => { wallFace(g, 760); column(g, 56); column(g, 236); windowAt(g, 128, 62, 50, 112); });
    line(g, [P(A, B, 0), P(A, B, 320)], "rgba(0,0,0,.45)", 2.5);
    // soft shadow where the walls meet the floor
    poly(g, [P(A, 140, 0), P(A, B, 0), P(A + 16, B + 16, 0), P(A + 16, 140, 0)], "rgba(20,16,24,.28)");
    poly(g, [P(A, B, 0), P(720, B, 0), P(720, B + 16, 0), P(A + 16, B + 16, 0)], "rgba(20,16,24,.28)");
  }
  function paintShelves(g) {
    const A = WALL.a, a1 = A + 20;
    poly(g, [P(A, -166, 0), P(a1 + 12, -166, 0), P(a1 + 12, -44, 0), P(A, -44, 0)], "rgba(18,14,22,.35)");
    box(g, A, a1, -164, -160, 0, 89, ["#5E4A3A", "#4A392C", "#3A2C22"]);                      // far upright
    const rows = [[0, [[-158, -128, 22], [-124, -92, 26], [-86, -60, 19]]], [31, [[-156, -118, 20], [-112, -84, 24], [-78, -52, 17]]], [61, [[-150, -116, 21], [-108, -70, 16]]]];
    for (const [z, items] of rows) {
      if (z) box(g, A, a1, -164, -46, z - 3, z, ["#7A6048", "#5E4836", "#4A382A", "rgba(255,230,190,.25)"]);
      for (const [b0, b1, h] of items) {
        box(g, A + 2, a1 - 2, b0, b1, z, z + h, CARD);
        onU(g, a1 - 2, b1, z + h, () => { g.fillStyle = "rgba(240,215,160,.55)"; g.fillRect((b1 - b0) / 2 - 2.5, 0, 5, h); g.fillStyle = "rgba(80,50,20,.35)"; g.fillRect(3, h * 0.55, 7, 4); });
      }
    }
    box(g, A, a1, -164, -46, 86, 89, ["#7A6048", "#5E4836", "#4A382A", "rgba(255,230,190,.25)"]);
    box(g, A, a1, -50, -46, 0, 89, ["#5E4A3A", "#4A392C", "#3A2C22"]);                        // near upright
  }
  function paintWoodSign(g) {   // "Pi-hole" in plain text on a wooden board (no logo)
    onU(g, WALL.a + 3, -92, 134, () => {
      g.fillStyle = "rgba(10,8,14,.35)"; rr(g, 2, 5, 124, 44, 6); g.fill();
      g.fillStyle = "#7A4A1E"; rr(g, -3, -3, 126, 46, 6); g.fill();
      g.fillStyle = lg(g, 0, 0, 0, 40, ["#FFCB57", "#EE9E2A"]); rr(g, -1, -1, 122, 42, 5); g.fill();
      g.fillStyle = lg(g, 0, 4, 0, 36, ["#F4E0B4", "#DDBD88"]); rr(g, 4, 4, 112, 32, 3); g.fill();
      g.strokeStyle = "rgba(130,90,45,.22)"; g.lineWidth = 1;
      for (const y of [11, 19, 28]) { g.beginPath(); g.moveTo(8, y); g.bezierCurveTo(40, y - 2, 80, y + 2, 112, y); g.stroke(); }
      for (const [x, y] of [[9, 9], [111, 9], [9, 31], [111, 31]]) { ell(g, x, y, 2, 2, "#8A6532"); ell(g, x - 0.5, y - 0.5, 0.8, 0.8, "#E8C98A"); }
      g.font = '800 24px "Inter Tight", Inter, sans-serif'; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillStyle = "rgba(255,245,215,.7)"; g.fillText("Pi-hole", 60, 22); g.fillStyle = "#3B2412"; g.fillText("Pi-hole", 60, 21);
    });
    for (const b of [-108, -196]) line(g, [P(WALL.a + 3, b, 137), P(WALL.a + 3, b, 170)], "#16171D", 1.6);   // hangers
  }
  function paintLamp(g) {
    const x = 290;
    g.fillStyle = rg(g, x, 36, 74, ["rgba(255,206,120,.5)", "rgba(255,206,120,0)"]); g.fillRect(x - 80, -40, 160, 160);
    line(g, [[x, 0], [x, 14]], "#14151B", 2.2);
    g.fillStyle = lg(g, x - 22, 0, x + 22, 0, ["#22242D", "#4C5060", "#1F2129"]); g.beginPath(); g.moveTo(x - 8, 12); g.lineTo(x + 8, 12); g.lineTo(x + 22, 30); g.lineTo(x - 22, 30); g.closePath(); g.fill();
    ell(g, x, 30, 22, 5, "#2B2D37"); ell(g, x, 30.5, 18, 3.8, "#FFC766"); ell(g, x, 31, 10, 2.2, "#FFF4CC");
  }
  function paintFurnace(g) {
    const F = FURN, a0 = F.a0, a1 = F.a1, bf = F.bf, bb = F.bb;
    poly(g, [P(a0 - 16, bb, 0), P(a1 + 30, bb, 0), P(a1 + 30, bf + 40, 0), P(a0 - 16, bf + 40, 0)], "rgba(16,12,20,.38)");
    // plinth with hazard band and warning plate
    box(g, a0 - 11, a1 + 12, bb, bf + 19, 0, F.base, ["#77747C", "#5A575F", "#45424A", "rgba(230,225,235,.4)"]);
    onV(g, a0 - 11, bf + 19, 0, () => {
      hazard(g, 0, -11, 133, 11, 9);
      g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(0, -F.base + 5, 133, 1.5);
      for (let x = 6; x < 133; x += 15) ell(g, x, -F.base + 3, 1.3, 1.3, "#9A97A0");
      g.fillStyle = "#3A3840"; rr(g, 46, -31, 42, 17, 2); g.fill(); g.fillStyle = "#B9A27E"; rr(g, 48, -29.5, 38, 14, 1.5); g.fill();
      g.strokeStyle = "#D8453C"; g.lineWidth = 2.2; g.beginPath(); g.arc(67, -22.5, 4.6, 0, 6.2832); g.moveTo(63.8, -25.7); g.lineTo(70.2, -19.3); g.stroke();
    });
    onU(g, a1 + 12, bf + 19, 0, () => hazard(g, 0, -11, bf + 19 - bb, 11, 9));
    // body: brick side, steel front
    const bz = F.base, tz = F.top;
    poly(g, [P(a1, bb, bz), P(a1, bf, bz), P(a1, bf, tz), P(a1, bb, tz)], "#8C4636");
    onU(g, a1, bf, bz, () => {   // brick courses on the side that faces the room
      const len = bf - bb, hgt = tz - bz;
      for (let r = 0; r * 8 < hgt; r++) for (let x = (r % 2 ? -9 : 0); x < len; x += 18) {
        const v = hash(r + 3, Math.round(x) + 50); g.fillStyle = `rgb(${150 + Math.round(v * 30)},${72 + Math.round(v * 16)},${54 + Math.round(v * 10)})`;
        g.fillRect(Math.max(0, x) + 0.7, -hgt + r * 8 + 0.7, Math.min(len, x + 18) - Math.max(0, x) - 1.4, 6.6);
      }
      g.fillStyle = lg(g, 0, 0, len, 0, ["rgba(255,170,90,.18)", "rgba(20,10,10,.4)"]); g.fillRect(0, -hgt, len, hgt);
    });
    poly(g, [P(a0, bf, bz), P(a1, bf, bz), P(a1, bf, tz), P(a0, bf, tz)], lg(g, 0, 80, 0, 250, ["#5D5C66", "#45444C"]));
    onV(g, a0, bf, 0, () => {
      const wv = a1 - a0;
      // riveted corner posts and top band
      for (const x of [0, wv - 10]) { g.fillStyle = lg(g, x, 0, x + 10, 0, ["#7D7C88", "#56555F"]); g.fillRect(x, -tz, 10, tz - bz); for (let y = -tz + 8; y < -bz; y += 13) ell(g, x + 5, y, 1.4, 1.4, "#A9A8B4"); }
      g.fillStyle = "#6C6B76"; g.fillRect(0, -tz, wv, 13); hazard(g, 10, -tz + 2, wv - 20, 9, 8);
      // brick surround + mouth
      const cx = wv / 2, mw = 26, my = -(F.mouthZ + 6), mb = -(F.mouthZ - 30);
      const arch = (r, y0) => { g.beginPath(); g.moveTo(cx - r, y0); g.lineTo(cx - r, my); g.arc(cx, my, r, Math.PI, 0); g.lineTo(cx + r, y0); g.closePath(); };
      g.fillStyle = "#3A2A28"; arch(mw + 13, mb + 4); g.fill();
      g.fillStyle = "#B25A40"; arch(mw + 11, mb + 2); g.fill();
      g.strokeStyle = "rgba(60,28,22,.7)"; g.lineWidth = 1.1;
      for (let i = 0; i <= 10; i++) { const t = Math.PI + (i / 10) * Math.PI; g.beginPath(); g.moveTo(cx + Math.cos(t) * mw, my + Math.sin(t) * mw); g.lineTo(cx + Math.cos(t) * (mw + 11), my + Math.sin(t) * (mw + 11)); g.stroke(); }
      for (let y = mb - 6; y > my; y -= 9) for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(cx + sx * mw, y); g.lineTo(cx + sx * (mw + 11), y); g.stroke(); }
      g.fillStyle = "rgba(255,200,150,.25)"; arch(mw + 11, mb + 2); g.save(); g.clip(); g.fillRect(0, -tz, cx, tz); g.restore();
      g.fillStyle = lg(g, 0, my - mw, 0, mb, ["#2A0E08", "#6A1E0C", "#E0591A", "#FFB23A"]); arch(mw, mb); g.fill();
      g.fillStyle = "rgba(30,10,6,.55)"; g.beginPath(); g.moveTo(cx - mw, mb); g.lineTo(cx - mw, my); g.arc(cx, my, mw, Math.PI, 0); g.arc(cx + 5, my + 1, mw - 4, 0, Math.PI, true); g.lineTo(cx - mw + 9, mb); g.closePath(); g.fill();   // wall thickness
      ell(g, cx + 2, mb - 3, mw - 6, 5, "#FFD76A"); ell(g, cx + 2, mb - 3, mw - 13, 2.6, "#FFF3C0");
    });
    box(g, a0 + 18, a1 - 18, bf, bf + 9, F.mouthZ - 36, F.mouthZ - 30, ["#8A8894", "#63616B", "#4B4952", "rgba(240,235,245,.5)"]);   // hearth lip
    // hood + chimney
    const h0 = P(a0, bf, tz), h1 = P(a1, bf, tz), h2 = P(a1, bb, tz), ha = a0 + 33, hb = a1 - 33, hz = tz + 20;
    poly(g, [h1, h2, P(hb, bb + 28, hz), P(hb, bf - 28, hz)], "#3B3A43");
    poly(g, [h0, h1, P(hb, bf - 28, hz), P(ha, bf - 28, hz)], lg(g, h0[0], 0, h1[0], 0, ["#5F5E69", "#4A4953"]));
    poly(g, [P(ha, bb + 28, hz), P(hb, bb + 28, hz), P(hb, bf - 28, hz), P(ha, bf - 28, hz)], "#6E6D79");
    line(g, [h0, h1, h2], "rgba(235,230,245,.4)", 1.2);
    const cx = CHIMNEY[0], cy = CHIMNEY[1], cb = P(F.mouthA, (bf + bb) / 2, hz)[1] + 4;
    g.fillStyle = lg(g, cx - 19, 0, cx + 19, 0, ["#3A3942", "#6B6A76", "#4A4953", "#2C2B33"]); g.beginPath(); g.ellipse(cx, cb, 19, 8, 0, 0, Math.PI); g.lineTo(cx - 19, cy); g.lineTo(cx + 19, cy); g.closePath(); g.fill();
    g.fillStyle = lg(g, cx - 23, 0, cx + 23, 0, ["#4A4953", "#85848F", "#55545E", "#33323A"]); g.beginPath(); g.ellipse(cx, cy + 7, 23, 9.5, 0, 0, Math.PI); g.lineTo(cx - 23, cy); g.lineTo(cx + 23, cy); g.closePath(); g.fill();
    ell(g, cx, cy, 23, 9.5, "#74737F"); ell(g, cx, cy + 0.5, 17, 6.6, "#1B1A20"); ell(g, cx, cy + 2, 12, 4, "rgba(255,130,50,.35)");
  }
  function paintInternetSign(g) {
    const S = SIGN, b1 = S.b0 - S.len;
    for (const b of [S.b0 - 5, b1 + 5]) { poly(g, [P(S.a - 4, b - 6, 0), P(S.a + 12, b - 6, 0), P(S.a + 12, b + 8, 0), P(S.a - 4, b + 8, 0)], "rgba(16,12,20,.3)"); box(g, S.a - 2, S.a + 2, b - 2, b + 2, 0, S.z0 + 2, STEEL); }
    box(g, S.a - 3, S.a + 3, b1, S.b0, S.z0, S.z1, ["#FFD86A", "#D99A1E", "#F4B73A", "rgba(255,245,200,.8)"]);
    onU(g, S.a + 3, S.b0, S.z1, () => {
      const w = S.len, h = S.z1 - S.z0;
      g.fillStyle = lg(g, 0, 0, 0, h, ["#FFCE4F", "#F0A726"]); rr(g, 0, 0, w, h, 5); g.fill();
      g.fillStyle = lg(g, 0, 5, 0, h - 5, ["#FBF0D2", "#EAD9B0"]); rr(g, 5, 5, w - 10, h - 10, 3); g.fill();
      g.font = '900 17px "Inter Tight", Inter, sans-serif'; g.textAlign = "left"; g.textBaseline = "middle"; g.fillStyle = "#26211C";
      g.save(); g.translate(10, h / 2 + 1); const tw = g.measureText("INTERNET").width; g.scale(Math.min(1, (w - 44) / tw), 1); g.fillText("INTERNET", 0, 0); g.restore();
      g.strokeStyle = "#26211C"; g.lineWidth = 2.8; g.lineCap = "round"; g.lineJoin = "round";
      g.beginPath(); g.moveTo(w - 27, h / 2); g.lineTo(w - 11, h / 2); g.moveTo(w - 17, h / 2 - 5.5); g.lineTo(w - 11, h / 2); g.lineTo(w - 17, h / 2 + 5.5); g.stroke(); g.lineCap = "butt";
    });
  }
  function paintScannerBack(g) {   // far wall of the tunnel + the right-hand pillar (boxes pass in front of these)
    const S = SCAN;
    poly(g, [P(S.a0 - 6, -S.outer, 0), P(S.a1 + 16, -S.outer, 0), P(S.a1 + 16, S.outer + 12, 0), P(S.a0 - 6, S.outer + 12, 0)], "rgba(16,12,20,.36)");
    box(g, S.a0, S.a1, -S.outer, -S.inner, 0, S.h, [STEEL[0], "#27382E", STEEL[1]]);
    onU(g, S.a1, -S.inner, 0, () => { hazard(g, 0, -S.top, S.outer - S.inner, S.top, 6); g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(0, -S.top, 2, S.top); });
  }
  function paintScannerGlow(g) {   // what you see through the opening: dark green interior with light bars
    const S = SCAN, z0 = BELT.z, a = S.a1;
    poly(g, [P(a, S.inner, z0), P(a, -S.inner, z0), P(a, -S.inner, S.top), P(a, S.inner, S.top)], lg(g, 0, 175, 0, 262, ["#12351F", "#2C8A4C"]));
    onV(g, S.a0, -S.inner, 0, () => { for (let i = 0; i < 4; i++) { g.fillStyle = `rgba(140,255,160,${0.95 - i * 0.1})`; rr(g, 6, -S.top + 8 + i * 10, 42, 4, 2); g.fill(); } });
  }
  function scannerFront() {   // near wall, left pillar, lintel, roof and light housing: drawn ABOVE the boxes each frame
    const S = SCAN, ox = Math.floor(P(S.a0, S.outer, 0)[0]) - 4, oy = Math.floor(P(S.a0, -S.outer, S.h + 13)[1]) - 6, c = mk(130, 200), g = c.getContext("2d"); g.translate(-ox, -oy);
    box(g, S.a0, S.a1, S.inner, S.outer, 0, S.h, [STEEL[0], lg(g, 0, 190, 0, 300, ["#626776", "#444854"]), STEEL[1]]);
    poly(g, [P(S.a1, S.outer, S.top), P(S.a1, -S.outer, S.top), P(S.a1, -S.outer, S.h), P(S.a1, S.outer, S.h)], lg(g, 60, 0, 140, 0, ["#737887", "#5C6170"]));
    poly(g, [P(S.a0, -S.outer, S.h), P(S.a1, -S.outer, S.h), P(S.a1, S.outer, S.h), P(S.a0, S.outer, S.h)], lg(g, 20, 150, 130, 200, ["#8C92A2", "#737989"]));
    line(g, [P(S.a0, S.outer, S.h), P(S.a1, S.outer, S.h), P(S.a1, -S.outer, S.h)], "rgba(230,235,250,.6)", 1.3);
    line(g, [P(S.a1, S.inner, BELT.z), P(S.a1, S.inner, S.top), P(S.a1, -S.inner, S.top)], "rgba(20,24,30,.55)", 1.6);
    onV(g, S.a0, S.outer, 0, () => {   // near wall panel details
      const w = S.a1 - S.a0;
      g.strokeStyle = "rgba(20,22,30,.35)"; g.lineWidth = 1.2; g.strokeRect(6, -S.h + 8, w - 12, 44); g.strokeRect(6, -S.h + 58, w - 12, 30);
      for (const [x, y] of [[4, -S.h + 4], [w - 4, -S.h + 4], [4, -5], [w - 4, -5], [4, -S.h + 55], [w - 4, -S.h + 55]]) ell(g, x, y, 1.4, 1.4, "#9BA0AE");
      g.fillStyle = "#34373F"; g.fillRect(0, -9, w, 9); hazard(g, 0, -8, w, 6, 6);
    });
    onU(g, S.a1, S.outer, 0, () => {   // left pillar front: hazard stripes; lintel: the SCAN plate
      hazard(g, 0, -S.top + 6, S.outer - S.inner, S.top - 6, 6); g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(0, -S.top + 6, 1.5, S.top - 6);
      const w = S.outer * 2;
      g.fillStyle = "#2B2D36"; rr(g, w / 2 - 25, -S.h + 5, 50, 25, 3); g.fill();
      g.fillStyle = lg(g, 0, -S.h + 7, 0, -S.h + 28, ["#F6EBCF", "#DCCBA2"]); rr(g, w / 2 - 23, -S.h + 7, 46, 21, 2); g.fill();
      g.font = '900 17px "Inter Tight", Inter, sans-serif'; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#23221F"; g.fillText("SCAN", w / 2, -S.h + 18.5);
    });
    box(g, S.a1 - 22, S.a1, -17, 17, S.h, S.h + 13, ["#4B4F5B", "#30333C", "#23252C", "rgba(220,225,240,.4)"]);   // light housing
    return { c, ox, oy };
  }
  function paintBelt(g) {
    const B = BELT, a0 = B.a0, a1 = B.a1, zb = B.z - 11, legs = [165, 320, 470];
    poly(g, [P(a0, -8, 0), P(a1, -8, 0), P(a1, B.rail + 22, 0), P(a0, B.rail + 22, 0)], "rgba(14,10,18,.42)");
    for (const a of legs) box(g, a - 3, a + 3, -B.rail, -B.rail + 5, 0, zb, STEEL_D);
    box(g, a1 - 60, a1 + 4, -B.rail - 5, -B.rail, zb, B.z + 11, YEL);                                  // far end guard
    box(g, a0, a1, -B.rail, B.rail, zb, B.z, ["#6A6F7C", "#4A4E5A", "#33363F"]);
    poly(g, [P(a0, -B.half, B.z), P(a1, -B.half, B.z), P(a1, B.half, B.z), P(a0, B.half, B.z)], "#2A2C34");
    line(g, [P(a0, B.rail, B.z), P(a1, B.rail, B.z)], "rgba(225,230,245,.45)", 1.2);
    line(g, [P(a0, B.half, B.z), P(a1, B.half, B.z)], "rgba(0,0,0,.4)", 1); line(g, [P(a0, -B.half, B.z), P(a1, -B.half, B.z)], "rgba(0,0,0,.4)", 1);
    for (let a = -10; a < a1; a += 31) { const p = P(a, B.rail, B.z - 5.4); ell(g, p[0], p[1], 3.6, 3.6, "#2B2D35"); ell(g, p[0], p[1], 2.7, 2.7, "#9A9EAB"); ell(g, p[0] - 0.7, p[1] - 0.8, 1.1, 1.1, "#E0E3EC"); }
    for (const a of legs) { box(g, a - 11, a + 11, B.rail - 1, B.rail + 12, 0, 3, YEL); box(g, a - 6, a + 6, B.rail, B.rail + 7, 3, B.z - 1, YEL); }
  }
  function beltEndFront() {   // fallback only: near-side yellow guard at the belt end, drawn above the boxes
    const B = BELT, p0 = P(B.a1 - 50, B.rail + 5, B.z + 11), ox = Math.floor(p0[0] - 4), oy = Math.floor(p0[1] - 4), c = mk(90, 70), g = c.getContext("2d"); g.translate(-ox, -oy);
    box(g, B.a1 - 50, B.a1 + 6, B.rail, B.rail + 5, B.z - 11, B.z + 11, YEL);
    return { c, ox, oy };
  }
  function leaf(g, x, y, len, ang, col, rib) {
    g.save(); g.translate(x, y); g.rotate(ang);
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.45, -len * 0.42, len, 0); g.quadraticCurveTo(len * 0.45, len * 0.42, 0, 0); g.fillStyle = col; g.fill();
    g.beginPath(); g.moveTo(1, 0); g.lineTo(len * 0.9, 0); g.strokeStyle = rib; g.lineWidth = 1; g.stroke(); g.restore();
  }
  function paintForeground(g) {
    // crate with yellow corner brackets
    const a0 = 286, a1 = 344, b0 = 240, b1 = 298, z = 50;
    poly(g, [P(a0 - 6, b0, 0), P(a1 + 14, b0, 0), P(a1 + 14, b1 + 8, 0), P(a0 - 6, b1 + 8, 0)], "rgba(14,10,18,.4)");
    box(g, a0, a1, b0, b1, 0, z, ["#B98A58", "#96693F", "#7A5230", "rgba(255,225,170,.45)"]);
    onV(g, a0, b1, z, () => { g.fillStyle = "rgba(60,36,16,.3)"; for (let y = 12; y < z; y += 12) g.fillRect(0, y, a1 - a0, 1.2); g.fillStyle = "#7E5632"; g.fillRect(0, 0, 6, z); g.fillRect(a1 - a0 - 6, 0, 6, z); g.fillRect(0, 0, a1 - a0, 6); });
    onU(g, a1, b1, z, () => { g.fillStyle = "rgba(40,24,10,.3)"; for (let y = 12; y < z; y += 12) g.fillRect(0, y, b1 - b0, 1.2); g.fillStyle = "#684426"; g.fillRect(0, 0, 6, z); g.fillRect(b1 - b0 - 6, 0, 6, z); g.fillRect(0, 0, b1 - b0, 6); });
    onT(g, a0, b0, z, () => { g.fillStyle = "rgba(70,44,20,.28)"; for (let x = 14; x < a1 - a0; x += 14) g.fillRect(x, 0, 1.2, b1 - b0); g.strokeStyle = "#9A7044"; g.lineWidth = 5; g.strokeRect(2.5, 2.5, a1 - a0 - 5, b1 - b0 - 5);
      g.fillStyle = "#F4B835"; for (const [x, y] of [[0, 0], [a1 - a0 - 11, 0], [0, b1 - b0 - 11], [a1 - a0 - 11, b1 - b0 - 11]]) g.fillRect(x, y, 11, 11); });
    for (const [a, b] of [[a1, b1], [a0, b1], [a1, b0]]) { const t = P(a, b, z); poly(g, [t, [t[0], t[1] + 11], P(a === a0 ? a + 9 : a, b === b0 ? b + 9 : b, z - 10), P(a === a0 ? a + 9 : a, b === b0 ? b + 9 : b, z)], "#D9951C"); }
    // leaves in the corners
    const G1 = "#3F8A3E", G2 = "#62B552", G3 = "#2F6E36", R = "rgba(20,60,24,.5)";
    for (const [x, y, l, an, c] of [[4, 430, 34, -1.9, G3], [0, 400, 30, -0.9, G1], [8, 424, 38, -1.35, G2], [-4, 376, 26, -0.5, G3], [2, 392, 24, -1.5, G2], [20, 432, 28, -0.75, G1], [0, 350, 22, -0.25, G1], [0, 346, 18, -1.1, G2],
      [150, 436, 30, -2.2, G3], [158, 434, 34, -1.5, G2], [166, 436, 30, -0.85, G1], [176, 438, 24, -0.4, G3], [140, 438, 22, -2.7, G1]]) leaf(g, x, y, l, an, c, R);
  }
  function paintLight(g) {   // warm light from the furnace, lamp and windows, then a vignette
    g.globalCompositeOperation = "overlay";
    g.fillStyle = rg(g, 500, 220, 260, ["rgba(255,150,50,.8)", "rgba(255,150,50,0)"]); g.fillRect(0, 0, W, H);
    g.fillStyle = rg(g, 290, 205, 190, ["rgba(255,214,150,.38)", "rgba(255,214,150,0)"]); g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "source-over";
    g.fillStyle = rg(g, 470, 262, 150, ["rgba(255,150,50,.22)", "rgba(255,150,50,0)"]); g.fillRect(0, 0, W, H);
    const v = g.createRadialGradient(W * 0.52, H * 0.5, 170, W * 0.52, H * 0.5, 440); v.addColorStop(0, "rgba(14,10,22,0)"); v.addColorStop(1, "rgba(14,10,22,.66)");
    g.fillStyle = v; g.fillRect(0, 0, W, H);
  }
  function paintPlate() {   // fallback world, only used when the plate image cannot be loaded
    const c = mk(W, H), g = c.getContext("2d");
    paintFloor(g); paintWalls(g); paintShelves(g); paintWoodSign(g); paintLamp(g);
    paintFurnace(g); paintInternetSign(g); paintScannerBack(g); paintBelt(g); paintScannerGlow(g); paintForeground(g); paintLight(g);
    return c;
  }

  // ---------------------------------------------------------------- plate mode: scale the image, letter the signs, cut the overlays
  function pathPoly(g, pts, dx, dy) { pts.forEach((p, i) => { const l = L(p[0], p[1]); if (i) g.lineTo(l[0] - dx, l[1] - dy); else g.moveTo(l[0] - dx, l[1] - dy); }); g.closePath(); }
  function plateFromImage(im) {
    const c = mk(W, H), g = c.getContext("2d"); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    g.drawImage(im, 0, PY / PK, PLATE_W, H / PK, 0, 0, W, H);
    // lettering, following each sign's tilt
    const text = (p, slope, fn) => { const l = L(p[0], p[1]); g.save(); g.transform(1, slope, 0, 1, l[0], l[1]); g.textAlign = "center"; g.textBaseline = "middle"; fn(); g.restore(); };
    text(AN.woodSign, AN.woodSlope, () => {
      g.font = '800 31px "Inter Tight", Inter, sans-serif';
      g.fillStyle = "rgba(255,214,140,.55)"; g.fillText("Pi-hole", 0, 2.2); g.fillStyle = "#3F2208"; g.fillText("Pi-hole", 0, 1);
    });
    text(AN.netSign, AN.netSlope, () => {
      g.font = '900 16px "Inter Tight", Inter, sans-serif'; g.fillStyle = "#33210C";
      const tw = g.measureText("INTERNET").width, k = Math.min(1, 62 / tw), w = tw * k, x0 = -(w + 20) / 2;
      g.save(); g.translate(x0 + w / 2, 0.5); g.scale(k, 1); g.fillText("INTERNET", 0, 0); g.restore();
      g.strokeStyle = "#33210C"; g.lineWidth = 2.6; g.lineCap = "round"; g.lineJoin = "round"; const ax = x0 + w + 5;
      g.beginPath(); g.moveTo(ax, 0); g.lineTo(ax + 14, 0); g.moveTo(ax + 8.5, -5); g.lineTo(ax + 14, 0); g.lineTo(ax + 8.5, 5); g.stroke();
    });
    return c;
  }
  function cutOverlay(plate, polys) {   // a piece of the plate, redrawn above the boxes
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const poly of polys) for (const p of poly) { const l = L(p[0], p[1]); x0 = Math.min(x0, l[0]); y0 = Math.min(y0, l[1]); x1 = Math.max(x1, l[0]); y1 = Math.max(y1, l[1]); }
    const ox = Math.max(0, Math.floor(x0) - 1), oy = Math.max(0, Math.floor(y0) - 1), c = mk(Math.min(W, Math.ceil(x1) + 1) - ox, Math.min(H, Math.ceil(y1) + 1) - oy), g = c.getContext("2d");
    g.beginPath(); for (const poly of polys) pathPoly(g, poly, ox, oy); g.clip(); g.drawImage(plate, -ox, -oy);
    return { c, ox, oy };
  }
  function makeScanText(col, glow) {   // "SCAN" for the blank panel, tilted with it
    const c = mk(64, 40), g = c.getContext("2d"); g.transform(1, AN.scanSlope, 0, 1, 32, 20); g.textAlign = "center"; g.textBaseline = "middle";
    g.font = '900 14px "Inter Tight", Inter, sans-serif';
    if (glow) { g.shadowColor = glow; g.shadowBlur = 7; g.fillStyle = col; g.fillText("SCAN", 0, 0.5); g.shadowBlur = 3; }
    g.fillStyle = col; g.fillText("SCAN", 0, 0.5);
    return c;
  }
  function makeMouthGlow() {   // hot hearth inside the furnace opening (clipped to the painted arch)
    const p0 = L(905, 240), p1 = L(1045, 396), ox = Math.floor(p0[0]), oy = Math.floor(p0[1]), c = mk(Math.ceil(p1[0]) - ox, Math.ceil(p1[1]) - oy), g = c.getContext("2d");
    g.beginPath(); pathPoly(g, AN.mouthPoly, ox, oy); g.clip();
    const f = [FIRE[0] - ox, FIRE[1] - oy];
    g.fillStyle = rg(g, f[0], f[1] + 4, 74, ["rgba(255,236,150,1)", "rgba(255,160,40,.95)", "rgba(230,80,20,.7)", "rgba(120,30,10,.35)", "rgba(60,14,6,0)"]); g.fillRect(0, 0, c.width, c.height);
    ell(g, f[0], f[1] - 3, 23, 5, "rgba(255,226,120,.9)"); ell(g, f[0], f[1] - 3, 13, 2.6, "rgba(255,250,215,.9)");
    return { c, ox, oy };
  }

  // ---------------------------------------------------------------- sprites: boxes
  const CO = [23, 42];   // sprite origin = centre of the cube's base
  function makeCube(kind, shadow) {
    const c = mk(54, 56), g = c.getContext("2d"), s = CUBE, h = s * 2; g.translate(CO[0], CO[1] - OY);
    const k = kind === "g" ? { t: ["#C8F6CA", "#A2E8AC"], v: ["#7FDC96", "#58BE72"], u: ["#52AE6A", "#398F53"], e: "rgba(235,255,235,.9)", o: "rgba(20,70,40,.5)" }
      : { t: ["#FFC0B3", "#F89A90"], v: ["#F27A70", "#DE5850"], u: ["#CE4C46", "#AC3835"], e: "rgba(255,225,215,.9)", o: "rgba(90,20,20,.5)" };
    if (shadow) poly(g, [P(-s, -s, 0), P(s + 6, -s, 0), P(s + 6, s + 3, 0), P(-s, s + 3, 0)], "rgba(0,0,0,.34)");
    const top = P(0, 0, h)[1], bot = P(s, s, 0)[1];
    box(g, -s, s, -s, s, 0, h, [lg(g, 0, top - 7, 0, top + 7, k.t), lg(g, 0, bot - h, 0, bot, k.v), lg(g, 0, bot - h, 0, bot, k.u)]);
    g.lineJoin = "round";
    line(g, [P(-s, -s, h), P(s, -s, h), P(s, -s, 0), P(s, s, 0), P(-s, s, 0), P(-s, s, h), P(-s, -s, h)], k.o, 1);
    line(g, [P(-s, s, h), P(s, s, h), P(s, -s, h)], k.e, 1.4); line(g, [P(s, s, h), P(s, s, 1)], k.e, 1.1);
    onV(g, -s, s, h, () => {
      g.scale(s / 13, s / 13); g.strokeStyle = "#FFFFFF"; g.lineCap = "round"; g.lineJoin = "round";
      if (kind === "g") { g.lineWidth = 3.8; g.beginPath(); g.moveTo(6.4, 13.6); g.lineTo(11.2, 18.4); g.lineTo(19.8, 8); g.stroke(); }
      else { g.lineWidth = 2.8; g.beginPath(); g.arc(13, 13.2, 7.2, 0, 6.2832); g.moveTo(7.9, 8.1); g.lineTo(18.1, 18.3); g.stroke(); }
    });
    return c;
  }

  // ---------------------------------------------------------------- sprites: contact shadow, fire, glow, smoke
  function makeShadow() { const c = mk(56, 24), g = c.getContext("2d"); g.translate(28, 12); g.scale(0.95, 0.95); g.translate(-28, -12); g.fillStyle = rg(g, 28, 12, 28, ["rgba(8,6,12,.5)", "rgba(8,6,12,.28)", "rgba(8,6,12,0)"]); g.scale(1, 0.42); g.beginPath(); g.arc(28, 28, 28, 0, 6.2832); g.fill(); return c; }

  function makeFlame(v) {
    const c = mk(56, 62), g = c.getContext("2d"); g.translate(28, 60);
    const tongue = (x, w, h, lean, fill) => { g.beginPath(); g.moveTo(x - w, 0); g.bezierCurveTo(x - w * 1.2, -h * 0.45, x - w * 0.2 + lean, -h * 0.6, x + lean, -h); g.bezierCurveTo(x + w * 0.5 + lean * 0.3, -h * 0.55, x + w * 1.25, -h * 0.4, x + w, 0); g.closePath(); g.fillStyle = fill; g.fill(); };
    const hs = [[38, 50, 34], [44, 40, 42], [34, 56, 40]][v], ln = [[-3, 3, 4], [4, -3, -2], [-2, 4, -4]][v];
    const o = lg(g, 0, -56, 0, 0, ["#FF5A1A", "#FF8A1E", "#FFB12E"]), y = lg(g, 0, -40, 0, 0, ["#FFC83A", "#FFE46A"]);
    tongue(-12, 9, hs[0], ln[0], o); tongue(1, 12, hs[1], ln[1], o); tongue(13, 9, hs[2], ln[2], o);
    tongue(-9, 6, hs[0] * 0.58, ln[0] * 0.6, y); tongue(2, 8, hs[1] * 0.62, ln[1] * 0.6, y); tongue(11, 6, hs[2] * 0.55, ln[2] * 0.6, y);
    tongue(1, 4.5, hs[1] * 0.3, 0, "#FFF7D2");
    return c;
  }
  function makeGlow(rgb, r) { const c = mk(r * 2, r * 2), g = c.getContext("2d"); g.fillStyle = rg(g, r, r, r, [`rgba(${rgb},.55)`, `rgba(${rgb},.2)`, `rgba(${rgb},0)`]); g.fillRect(0, 0, r * 2, r * 2); return c; }
  function makePuff() { const c = mk(44, 40), g = c.getContext("2d"); for (const [x, y, r] of [[15, 24, 12], [27, 22, 13], [21, 14, 11]]) { g.fillStyle = rg(g, x - 2, y - 3, r, ["rgba(232,220,208,.95)", "rgba(190,176,166,.8)", "rgba(150,138,132,0)"]); g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill(); } return c; }

  // ---------------------------------------------------------------- markup
  const I_BLOCK = '<svg class="sr-ic" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="13" fill="none" stroke="#FF8478" stroke-width="4.4"/><path d="M9 9l18 18" stroke="#FF8478" stroke-width="4.4"/></svg>';
  const I_PIE = '<svg class="sr-ic" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="14.5" fill="#868A93"/><path d="M18 18V3.5A14.5 14.5 0 0 1 32.5 18z" fill="#FF8478" stroke="#16181D" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const I_STACK = '<svg class="sr-ic" viewBox="0 0 36 36" aria-hidden="true"><g fill="none" stroke="#F2F2F4" stroke-width="2.6" stroke-linejoin="round"><path d="M18 5l14 7-14 7-14-7z"/><path d="M4 18l14 7 14-7"/><path d="M4 24l14 7 14-7"/></g></svg>';
  const I_CUBE = '<svg class="sr-logo" viewBox="0 0 28 30" aria-hidden="true"><path d="M14 2l11 6v13l-11 7-11-7V8z" fill="#56BC70"/><path d="M14 2l11 6-11 7L3 8z" fill="#B4EFBA"/><path d="M14 15l11-7v13l-11 7z" fill="#3D9457"/><path d="M6.5 17.5l3 3.4 3.4-7" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CARET = '<svg class="sr-car" viewBox="0 0 12 8" aria-hidden="true"><path d="M1.5 1.5l4.5 4.5 4.5-4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const B_PAUSE = '<svg viewBox="0 0 20 22" aria-hidden="true"><rect x="2" y="1" width="6" height="20" rx="1.5"/><rect x="12" y="1" width="6" height="20" rx="1.5"/></svg>';
  const B_PLAY = '<svg viewBox="0 0 20 22" aria-hidden="true"><path d="M4 1.8v18.4a1 1 0 0 0 1.5.9l13-9.2a1 1 0 0 0 0-1.8l-13-9.2A1 1 0 0 0 4 1.8z"/></svg>';

  const skin = {
    mount(el) {
      el.innerHTML = `
        <div class="sr-top">
          ${I_CUBE}<i class="sr-div"></i><b class="sr-title">PACKET WORKS</b>
          <div class="sr-state" data-k="state"><i class="sr-dot"></i><span data-k="stxt"></span></div><i class="sr-div"></i>
          <button class="sr-ctl" data-act="allowed" data-k="allowed" type="button"><span class="sr-cl">Allowed:</span><span class="sr-chip"><span class="n"></span>${CARET}</span></button>
          <button class="sr-ctl" data-act="style" type="button"><span class="sr-cl">Style:</span><span class="sr-chip">Factory${CARET}</span></button>
        </div>
        <div class="sr-scene"><canvas class="sr-cv" width="${W}" height="${H}"></canvas>
          <div class="sr-break" data-k="break"><b>Crew on a break</b><span data-k="cd"></span></div>
          <div class="sr-tags fade" data-k="tags"></div>
        </div>
        <div class="sr-side">
          <div class="sr-stat">${I_BLOCK}<div class="sr-tx"><div class="sr-v" data-k="blocked"></div><div class="sr-k" data-k="lab">Blocked - 24h</div></div></div>
          <div class="sr-stat">${I_PIE}<div class="sr-tx"><div class="sr-v" data-k="pct"></div><div class="sr-k">Blocked</div></div></div>
          <div class="sr-stat">${I_STACK}<div class="sr-tx"><div class="sr-v" data-k="total"></div><div class="sr-k">Queries - 24h</div></div></div>
          <button class="sr-pause" data-act="pause" data-k="pause" type="button"></button>
          <div class="sr-meta" data-k="meta"></div>
        </div>`;
      const host = el.querySelector(".sr-scene"), cv = host.querySelector("canvas"), tags = q(el, "tags");
      tags.innerHTML = [0, 1, 2].map(() => '<div class="sr-tag"><span class="d"></span><span class="t"></span></div>').join("");
      const S = this.s = {
        m: null, ctx: cv.getContext("2d"), host, plate: null, painted: false, front: null, endFront: null, crew: null, kx: 1, ky: 1,
        cube: { g: makeCube("g", true), r: makeCube("r", true), rf: makeCube("r", false) }, shadow: makeShadow(),
        flames: [0, 1, 2].map(makeFlame), glowFire: makeGlow("255,150,50", 84), glowScan: makeGlow("90,255,140", 40), glowAmber: makeGlow("255,180,60", 40), puff: makePuff(),
        mouthGlow: makeMouthGlow(), scanTxt: null,
        rate: K.rateTracker(), news: K.newsTracker(), belt: [], fly: [], parts: [], smoke: [], queue: [], clock: 0, slotT: 0, redGap: 9, redAcc: 0.6, beltOff: 0,
        fire: 1, flare: 0, flash: 0, smokeT: 0, wasOn: true, seeded: false, btn: "", brk: q(el, "break"), anyTag: false,
        tags: [...tags.children].map((e) => ({ el: e, d: e.querySelector(".d"), t: e.querySelector(".t"), box: null, x: 0, y: 0 })),
        workers: WORKERS.map((w, i) => ({ i, x: w.x, y: w.y, st: "idle", t: 0, box: null, tgt: null, until: 0, pop: 0, pose: "idle", ph: i * 1.7, hp: [w.x + CARRY[0], w.y + CARRY[1]] })),
      };
      const fallback = () => { S.plate = paintPlate(); S.painted = false; S.front = scannerFront(); S.endFront = beltEndFront(); };
      const letters = () => { S.scanTxt = { on: makeScanText("#8CFFA0", "rgba(60,255,120,.9)"), amber: makeScanText("#FFC65A", "rgba(255,170,40,.9)"), off: makeScanText("#4A5650", null) }; };
      fallback(); letters();
      const fonts = document.fonts && document.fonts.load ? Promise.all([document.fonts.load('900 16px "Inter Tight"'), document.fonts.load('800 31px "Inter Tight"')]).catch(() => {}) : Promise.resolve();
      const im = new Image();
      im.onload = () => fonts.then(() => {   // the painted plate: letter it, then cut the pieces that sit in front of the boxes
        if (this.s !== S) return;
        S.plate = plateFromImage(im); S.painted = true; S.front = cutOverlay(S.plate, AN.scanMask); S.endFront = cutOverlay(S.plate, AN.endMask); letters();
      });
      im.onerror = () => fonts.then(() => { if (this.s === S) { fallback(); letters(); } });
      im.src = PLATE_SRC;
      const sheet = new Image();
      sheet.onload = () => {   // pre-scale every pose once so each frame is a plain 1:1 drawImage
        if (this.s !== S) return;
        S.crew = CREW.map((row) => { const o = {}; row.forEach(([x, y, w, h, fx], j) => {
          const c = mk(Math.ceil(w * CS) + 2, Math.ceil(h * CS) + 1), g = c.getContext("2d"); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
          g.drawImage(sheet, x, y, w, h, 1, c.height - h * CS, w * CS, h * CS); o[POSES[j]] = { c, fx: Math.round(fx * CS) + 1, h: c.height };
        }); return o; });
      };
      sheet.src = CREW_SRC;
      const size = () => { S.kx = (host.clientWidth || W) / W; S.ky = (host.clientHeight || H) / H; };
      size(); this.ro = new ResizeObserver(size); this.ro.observe(host);
      this.stop = K.loop((dt, t) => this.frame(dt, t), 20);
    },
    unmount() { if (this.stop) this.stop(); if (this.ro) this.ro.disconnect(); this.s = null; },

    render(el, m) {
      const S = this.s; if (!S) return; const d = m.data || {}, mt = meta(m); S.m = m; S.rate.update(m);
      for (const it of S.news(m.ticker)) { S.queue.push(it); if (S.queue.length > 4) S.queue.shift(); }
      if (!S.seeded && m.data) { S.seeded = true; this.seed(m.paused || m.stale ? [] : m.ticker, m.paused && !m.stale); }
      const st = q(el, "state"); st.className = `sr-state ${m.pill.cls}`; q(el, "stxt").textContent = m.pill.text;
      q(el, "cd").textContent = (m.pill.text.split("·")[1] || "").trim();
      q(el, "break").classList.toggle("on", !!m.paused);
      q(el, "blocked").textContent = num(d.blocked); q(el, "pct").textContent = pct(d.percent_blocked); q(el, "total").textContent = num(d.total);
      const lab = q(el, "lab"); lab.textContent = m.labelAlert ? m.label : "Blocked - 24h"; lab.classList.toggle("alert", !!m.labelAlert);
      const txt = pauseText(m), key = m.button.mode + txt;
      if (key !== S.btn) { S.btn = key; const b = q(el, "pause"); b.innerHTML = (m.button.mode === "pause" ? B_PAUSE : B_PLAY) + "<span></span>"; b.lastChild.textContent = txt; }
      q(el, "meta").textContent = `CPU ${mt.temp}  |  Up ${mt.up}`;
      for (const tg of S.tags) if (tg.box && tg.box.item) tg.t.textContent = short(ago(m, tg.box.item));
      common(el, m);
      fit(q(el, "blocked"), 15); fit(q(el, "pct"), 15); fit(q(el, "total"), 15);
    },

    // ---- boxes
    newBox(kind, a, item) { const p = P(a, 0, BELT.z); return { kind, a, item: item || null, x: p[0], y: p[1], rot: 0, sc: 1, al: 1, drop: 0, stage: 0, tag: null, claimed: false, dead: false }; },
    seed(ticker, paused) {   // open on a busy floor: the three newest blocks are already being handled
      const S = this.s, Wk = S.workers, a1 = SCAN.a1 + 18;
      for (let a = BELT.a1 - 24, n = 0; a > -30; a -= 62, n++) if (Math.abs(a - a1) > 30 && Math.abs(a - SCAN.a1 + 14) > 26) S.belt.push(this.newBox(paused && n % 4 === 1 ? "r" : "g", a));
      if (ticker[0]) S.belt.push(this.newBox("r", a1, ticker[0]));
      [ticker[1], ticker[2]].forEach((it, j) => {
        if (!it) return; const w = Wk[j + 1], b = this.newBox("r", 0, it); b.stage = j + 1; b.x = w.hp[0]; b.y = w.hp[1];
        w.box = b; w.st = "hold"; w.t = 0.4; w.until = S.clock + 1.4 + (1 - j) * 1.5;
        this.tagOn(S.tags[j + 1], b, TAG_HOME[j + 1]);
      });
      S.redGap = 0;
    },
    tagOn(tg, b, h) {
      const S = this.s; tg.box = b; b.tag = tg; tg.x = h[0]; tg.y = h[1]; tg.px = null;
      tg.d.textContent = b.item.domain; tg.t.textContent = S.m ? short(ago(S.m, b.item)) : ""; tg.el.dataset.domain = b.item.domain; tg.el.classList.add("on");
    },
    burn(b) {
      const S = this.s; b.dead = true; S.flare = 1;
      for (let i = 0; i < 12; i++) S.parts.push({ x: MOUTH[0] + (Math.random() - 0.5) * 22, y: MOUTH[1] + 6 + Math.random() * 14, vx: -20 - Math.random() * 50, vy: -30 - Math.random() * 60, g: 90, life: 0.5 + Math.random() * 0.5, c: i % 3 ? "#FFC83A" : "#FF7A1A", s: i % 4 ? 2 : 3 });
    },
    poof(b) {
      const S = this.s; b.dead = true;
      for (let i = 0; i < 4; i++) S.smoke.push({ x: b.x + (Math.random() - 0.5) * 14, y: b.y - 12 - Math.random() * 10, vx: (Math.random() - 0.5) * 16, vy: -14 - Math.random() * 10, life: 0.7, max: 0.7, s: 0.4 });
    },

    // ---- the crew: a bucket brigade of little state machines (idle -> reach -> lift -> hold -> wind -> throw -> idle; catch -> hold)
    go(w, st) { w.st = st; w.t = 0; },
    updWorkers(dt, on) {
      const S = this.s, Wk = S.workers;
      const press = (i) => (i === 0 ? on && S.belt.some((b) => b.kind === "r" && !b.claimed && b.a > SCAN.a1 - 8 && b.a < PICK_A + 40) : wants(i - 1));
      const wants = (i) => { const w = Wk[i]; return w.st === "hold" && w.t > 0.3 && (S.clock >= w.until || press(i)); };
      const target = (i) => (i === 2 ? [MOUTH[0], MOUTH[1] + 14] : Wk[i + 1].hp);
      for (const w of Wk) {
        w.t += dt; w.pop = Math.max(0, w.pop - dt * 7);
        const i = w.i, hp = w.hp, b = w.box;
        if (w.st === "idle") {
          if (i === 0 && on) {
            let best = null;
            for (const c of S.belt) if (c.kind === "r" && !c.claimed && c.a >= PICK_A && c.a <= PICK_A + 46 && (!best || c.a > best.a)) best = c;
            if (best) { best.claimed = true; w.tgt = best; this.go(w, "reach"); }
          }
        } else if (w.st === "reach") {
          if (w.t >= 0.24) { const c = w.tgt; S.belt.splice(S.belt.indexOf(c), 1); w.box = c; w.tgt = null; w.from = [c.x, c.y]; c.stage = 0; this.go(w, "lift"); }
        } else if (w.st === "lift") {
          const k = ease(Math.min(1, w.t / 0.34)); b.x = w.from[0] + (hp[0] - w.from[0]) * k - Math.sin(k * Math.PI) * 10; b.y = w.from[1] + (hp[1] - w.from[1]) * k;
          if (w.t >= 0.34) { this.go(w, "hold"); w.until = S.clock + HOLD[i]; }
        } else if (w.st === "hold") {
          b.x = hp[0]; b.y = hp[1] + w.bob;
          const nx = Wk[i + 1], free = i === 2 || (nx.st === "idle" && (i < 1 || !S.fly.some((f) => f.to === 3)));
          if (free && wants(i)) { if (nx) this.go(nx, "catch"); this.go(w, "wind"); }
        } else if (w.st === "wind") {   // a quick dip before the throw
          b.x = hp[0] - 2 * Math.sin(Math.min(1, w.t / 0.12) * Math.PI / 2); b.y = hp[1] + 3 * Math.sin(Math.min(1, w.t / 0.12) * Math.PI / 2);
          if (w.t >= 0.12) {
            const tg = target(i);
            S.fly.push({ b, x0: b.x, y0: b.y, x1: tg[0], y1: tg[1], t: 0, dur: i === 2 ? 0.62 : 0.46, arc: i === 2 ? 30 : 22, to: i + 1 });
            b.stage = Math.min(2, i + 1); w.box = null; this.go(w, "throw");
          }
        } else if (w.st === "throw") { if (w.t > 0.36) this.go(w, "idle"); }
        else if (w.st === "catch") { if (w.t > 2) this.go(w, "idle"); }
      }
      // boxes in the air
      S.fly = S.fly.filter((f) => {
        f.t += dt; const k = Math.min(1, f.t / f.dur), b = f.b;
        b.x = f.x0 + (f.x1 - f.x0) * k; b.y = f.y0 + (f.y1 - f.y0) * k - f.arc * 4 * k * (1 - k);
        if (f.to === 3) { b.rot = k * 2.4; b.sc = k > 0.7 ? 1 - (k - 0.7) * 1.8 : 1; b.al = k > 0.8 ? 1 - (k - 0.8) * 4 : 1; } else b.rot = Math.sin(k * Math.PI) * 0.45;
        if (k < 1) return true;
        if (f.to === 3) this.burn(b);
        else { const w = Wk[f.to]; b.rot = 0; w.box = b; this.go(w, "hold"); w.until = S.clock + HOLD[f.to]; w.pop = 1; }
        return false;
      });
    },
    poseOf(w, paused) {   // which painted pose shows for the current state
      const s = w.st;
      if (s === "idle") return paused ? "break" : "idle";
      if (s === "reach") return "reach";
      if (s === "lift") return w.t < 0.1 ? "reach" : "hold";
      if (s === "throw") return "throw";
      return "hold";   // hold, wind, catch: arms up
    },

    // ---- call-out tags (HTML, tappable)
    updTags(dt, on) {
      const S = this.s, taken = [false, false, false];
      for (const tg of S.tags) {
        const b = tg.box; if (!b) continue;
        if (b.dead || !b.item || (b.onBelt && (!on || b.a > PICK_A + 60))) { tg.box = null; b.tag = null; tg.el.classList.remove("on"); tg.el.removeAttribute("data-domain"); continue; }
        taken[b.stage] = true;
      }
      if (on && !taken[0]) {   // the lead labelled red box that has left the scanner (or is in worker 1's hands) gets a tag
        let c = S.workers[0].box; if (c && (!c.item || c.tag)) c = null;
        if (!c) for (const b of S.belt) if (b.kind === "r" && b.item && !b.tag && b.a > SCAN.a1 - 2 && b.a < PICK_A + 46 && (!c || b.a > c.a)) c = b;
        const tg = c && S.tags.find((t) => !t.box);
        if (tg) this.tagOn(tg, c, TAG_HOME[0]);
      }
      const any = S.tags.some((tg) => tg.box);
      if (any !== S.anyTag) { S.anyTag = any; S.brk.classList.toggle("wait", any); }   // the break sign waits until the last call-out has gone
      for (const tg of S.tags) {
        if (!tg.box) continue; const h = TAG_HOME[tg.box.stage], k = Math.min(1, dt * 7);
        tg.x += (h[0] - tg.x) * k; tg.y += (h[1] - tg.y) * k;
        const px = Math.round(tg.x * S.kx), py = Math.round(tg.y * S.ky);
        if (px !== tg.px || py !== tg.py) { tg.px = px; tg.py = py; tg.el.style.transform = `translate(calc(${px}px - 50%), calc(${py}px - 100%))`; }
      }
    },

    frame(dt, t) {
      const S = this.s; if (!S || !S.plate) return; const m = S.m; if (!m || m.asleep) return;
      const ctx = S.ctx, on = !m.paused, B = BELT, Wk = S.workers, bad = m.pill.cls === "bad" || m.stale;
      S.clock += dt; S.redGap += dt;
      // ---- traffic: a steady stream of slots; reds are paced by the live block rate, greens by the query rate (both capped)
      const r = S.rate.get(m);
      if (!m.stale) S.redAcc += dt * (on ? cl(r.b * 1.2, 0.1, 0.22) : 0.2);
      S.slotT += dt;
      if (S.slotT >= SLOT) {
        S.slotT -= SLOT;
        if (!m.stale && S.redAcc >= 1 && S.redGap >= 1.5) { S.redAcc = Math.min(1, S.redAcc - 1); S.redGap = 0; S.belt.push(this.newBox("r", B.spawnA)); }
        else if (Math.random() < cl(0.58 + r.q * 0.25, 0.62, 0.9)) S.belt.push(this.newBox("g", B.spawnA));
      }
      if (on && !m.stale && S.queue.length) {   // a new blocked domain: the box inside the scanner is flagged and comes out red
        const sa = SCAN.a1 - 22, c = S.belt.find((b) => b.a > sa - 8 && b.a < sa + 8 && !b.item);
        if (c && (c.kind === "r" || S.redGap >= 1.5)) { if (c.kind !== "r") S.redGap = 0; c.kind = "r"; c.item = S.queue.shift(); S.flash = 1; }
        else if (!c && S.redGap >= 1.5 && !S.belt.some((b) => Math.abs(b.a - sa) < 40)) { S.belt.push(this.newBox("r", sa, S.queue.shift())); S.redGap = 0; S.flash = 1; }
      }
      if (!on) S.queue.length = 0;
      S.wasOn = on;
      for (const b of S.belt) {
        b.a += B.speed * dt; b.onBelt = true; const p = P(b.a, 0, B.z); b.x = p[0]; b.y = p[1];
        b.drop = Math.max(0, b.a - (B.a1 - 3));          // past the end roller: tip over and slide down out of sight
        if (b.drop > 24) b.dead = true;
        else if (b.kind === "r" && on && !b.claimed && b.a > PICK_A + 52) this.poof(b);   // nothing red reaches the sign while blocking is on
      }
      S.belt = S.belt.filter((b) => !b.dead).sort((a, b) => a.a - b.a);
      S.beltOff = (S.beltOff + B.speed * dt) % 14;
      for (const w of Wk) w.bob = Math.round(Math.sin(S.clock * 2.6 + w.ph) * 0.9);
      this.updWorkers(dt, on);
      for (const w of Wk) if (w.box) w.box.onBelt = false;
      for (const f of S.fly) f.b.onBelt = false;
      this.updTags(dt, on);
      S.fire += ((on ? 1 : 0.4) - S.fire) * Math.min(1, dt * 1.5); S.flare = Math.max(0, S.flare - dt * 2.2); S.flash = Math.max(0, S.flash - dt * 3);

      // ---- draw
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(S.plate, 0, 0);
      if (!S.painted) {   // fallback belt: moving slats (skipped inside the scanner)
        ctx.beginPath();
        for (let a = -14 + S.beltOff; a < B.a1; a += 14) { if (a > SCAN.a0 - 30 && a < SCAN.a1 + 2) continue; const p0 = P(a, -B.half, B.z), p1 = P(a, B.half, B.z); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); }
        ctx.strokeStyle = "rgba(255,255,255,.09)"; ctx.lineWidth = 1.2; ctx.stroke();
      }
      // furnace: hot hearth in the opening, flames, glow
      const fl = S.fire + S.flare * 0.5, fi = Math.floor(t * 9) % 3, fx = FIRE[0], fy = FIRE[1] - 1;
      if (S.painted) { ctx.globalAlpha = cl(0.25 + fl * 0.6 + Math.sin(t * 9) * 0.04, 0, 1); ctx.drawImage(S.mouthGlow.c, S.mouthGlow.ox, S.mouthGlow.oy); ctx.globalAlpha = 1; }
      const fw = 52 * (0.55 + fl * 0.42), fh = 64 * (0.28 + fl * 0.62) * (1 + Math.sin(t * 13) * 0.04);
      ctx.drawImage(S.flames[(fi + 1) % 3], fx - fw * 0.5 - 2, fy - fh * 0.8, fw, fh * 0.8);
      ctx.drawImage(S.flames[fi], fx - fw / 2, fy - fh, fw, fh);
      ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = cl(0.06 + fl * 0.26 + Math.sin(t * 11) * 0.03, 0, 1);
      ctx.drawImage(S.glowFire, MOUTH[0] - 84, MOUTH[1] - 66);
      ctx.globalCompositeOperation = "source-over";
      // chimney smoke
      S.smokeT -= dt; if (S.smokeT <= 0) { S.smokeT = on ? 0.55 : 1.5; S.smoke.push({ x: CHIMNEY[0] + (Math.random() - 0.5) * 8, y: CHIMNEY[1] - 3, vx: 3 + Math.random() * 5, vy: -12 - Math.random() * 5, life: 3, max: 3, s: 0.45 }); }
      S.smoke = S.smoke.filter((p) => {
        p.life -= dt; if (p.life <= 0) return false; p.x += p.vx * dt; p.y += p.vy * dt; p.s += dt * 0.3;
        ctx.globalAlpha = Math.min(1, p.life / p.max * 1.6) * 0.8; const w = 44 * p.s, h = 40 * p.s; ctx.drawImage(S.puff, p.x - w / 2, p.y - h / 2, w, h); return true;
      });
      ctx.globalAlpha = 1;
      // crew (painted sprites, far to near): contact shadow, the carried box behind the raised hands, then the figure
      for (const w of [Wk[2], Wk[0], Wk[1]]) {
        const pose = this.poseOf(w, !on); if (pose !== w.pose) { w.pose = pose; w.pop = 1; }
        ctx.drawImage(S.shadow, w.x - 28, w.y - 12);
        const b = w.box, lifted = b && w.st === "lift";
        if (b && !lifted) ctx.drawImage(S.cube.rf, Math.round(b.x) - CO[0], Math.round(b.y) - CO[1]);
        const sp = S.crew && S.crew[w.i][pose];
        if (sp) ctx.drawImage(sp.c, w.x - sp.fx, w.y - sp.h + 3 + (pose === "idle" || pose === "hold" ? w.bob : 0) + Math.round(w.pop * 2));
      }
      // boxes on the belt (far to near)
      for (const b of S.belt) {
        const img = S.cube[b.kind];
        if (b.drop > 0) { const d = b.drop; ctx.save(); ctx.globalAlpha = cl(1.25 - d / 16, 0, 1); ctx.translate(b.x, b.y + d * d * 0.045); ctx.rotate(Math.min(1.15, d * 0.07)); ctx.drawImage(img, -CO[0], -CO[1]); ctx.restore(); }
        else ctx.drawImage(img, Math.round(b.x) - CO[0], Math.round(b.y) - CO[1]);
      }
      // scanner light in the opening, then the scanner body and the sign / end guard over the boxes
      const lit = bad ? 0 : on ? 1 : Math.floor(t * 1.6) % 2;
      if (S.painted) {
        const c = L(216, 452);
        if (!bad) {
          ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = on ? 0.5 + Math.sin(t * 5) * 0.08 + S.flash * 0.4 : lit ? 0.3 : 0.05; ctx.drawImage(on ? S.glowScan : S.glowAmber, c[0] - 40, c[1] - 40);
          ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
          if (on) { const p = (t * 0.8) % 1, p0 = L(163, 420 + p * 92), p1 = L(270, 394 + p * 90); ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.strokeStyle = "rgba(170,255,190,.8)"; ctx.lineWidth = 1.5; ctx.stroke(); }
        }
        ctx.drawImage(S.front.c, S.front.ox, S.front.oy);
        const tp = L(AN.scanPanel[0], AN.scanPanel[1]), tx = S.scanTxt[bad ? "off" : on ? "on" : lit ? "amber" : "off"]; ctx.drawImage(tx, Math.round(tp[0]) - 32, Math.round(tp[1]) - 20);
        AN.scanLeds.forEach((p, i) => {
          const l = L(p[0], p[1]), o = bad ? false : on ? S.flash > 0.1 || Math.floor(t * 4) % 4 !== i : lit;
          if (!o) return; ctx.beginPath(); ctx.ellipse(l[0], l[1], 2.5, 3.9, -0.35, 0, 6.2832); ctx.fillStyle = on ? "#7CFF8E" : "#FFC04A"; ctx.fill();
          ctx.beginPath(); ctx.ellipse(l[0] - 0.5, l[1] - 1.2, 1, 1.4, -0.35, 0, 6.2832); ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.fill();
        });
      } else {
        const sp = P(SCAN.a1, 0, B.z + 26);
        if (!bad) { ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = on ? 0.5 : lit ? 0.4 : 0.08; ctx.drawImage(on ? S.glowScan : S.glowAmber, sp[0] - 40, sp[1] - 40); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; }
        ctx.drawImage(S.front.c, S.front.ox, S.front.oy);
        const lp = P(SCAN.a1, 17, SCAN.h + 13); ctx.save(); ctx.transform(-VX, -VY, 0, 1, lp[0], lp[1]);
        for (let i = 0; i < 3; i++) { ctx.fillStyle = lit ? (on ? "#7CFF8E" : "#FFC04A") : "#2A3A30"; ctx.fillRect(3.4 + i * 9.4, 3, 7.4, 7); }
        ctx.restore();
      }
      ctx.drawImage(S.endFront.c, S.endFront.ox, S.endFront.oy);
      // a box being lifted off the belt, and boxes in the air
      for (const w of Wk) if (w.box && w.st === "lift") ctx.drawImage(S.cube.rf, Math.round(w.box.x) - CO[0], Math.round(w.box.y) - CO[1]);
      for (const f of S.fly) {
        const b = f.b; ctx.save(); ctx.translate(b.x, b.y - CUBE); ctx.rotate(b.rot); ctx.scale(b.sc, b.sc); ctx.globalAlpha = cl(b.al, 0, 1);
        ctx.drawImage(S.cube.rf, -CO[0], -CO[1] + CUBE); ctx.restore();
        if (f.to === 3 && f.t < 0.3) {   // little throw ticks, as in the sketch
          ctx.strokeStyle = "#FFD23A"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.beginPath();
          for (const [dx, dy] of [[-0.9, -0.5], [-1, 0.1], [-0.6, -0.9]]) { ctx.moveTo(f.x0 + dx * 18, f.y0 - CUBE + dy * 18); ctx.lineTo(f.x0 + dx * 25, f.y0 - CUBE + dy * 25); }
          ctx.stroke();
        }
      }
      // leader lines for the call-outs
      for (const tg of S.tags) {
        const b = tg.box; if (!b) continue;
        const ex = b.x - 2, ey = b.y - CUBE * 2 - 4;
        ctx.strokeStyle = "rgba(40,30,24,.5)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(tg.x, tg.y - 2); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = "#FBF2DC"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(tg.x, tg.y - 2); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.beginPath(); ctx.arc(ex, ey, 3, 0, 6.2832); ctx.fillStyle = "rgba(251,242,220,.35)"; ctx.fill(); ctx.stroke();
      }
      // sparks and embers
      if (Math.random() < dt * (on ? 2.2 : 0.6)) S.parts.push({ x: FIRE[0] + (Math.random() - 0.5) * 26, y: FIRE[1] - 24, vx: -6 - Math.random() * 14, vy: -22 - Math.random() * 22, g: -6, life: 0.9 + Math.random() * 0.6, c: "#FFB02E", s: 2 });
      S.parts = S.parts.filter((p) => {
        p.life -= dt; if (p.life <= 0) return false; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        ctx.globalAlpha = Math.min(1, p.life * 3); ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, p.s, p.s); return true;
      });
      if (S.parts.length > 60) S.parts.splice(0, S.parts.length - 60);
      ctx.globalAlpha = 1;
      // paused: worker C dozes
      if (!on && Wk[2].st === "idle") {
        ctx.fillStyle = "#FBF2DC"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        for (let i = 0; i < 3; i++) { const k = ((S.clock * 0.45 + i / 3) % 1); ctx.globalAlpha = Math.sin(k * Math.PI) * 0.9; ctx.font = `800 ${Math.round(9 + k * 8)}px "Inter Tight", Inter, sans-serif`; ctx.fillText("z", Wk[2].x + 20 + k * 16 + Math.sin(k * 6) * 3, Wk[2].y - 76 - k * 32); }
        ctx.globalAlpha = 1;
      }
    },
  };

  window.PiSkins.add("sorter", skin, "Packet Works", "A factory crew tosses blocked boxes into the furnace", K.T(
    '<rect width="160" height="96" fill="#5F585C"/><path d="M0 12h116v20L0 40z" fill="#2E3240"/><rect x="30" y="16" width="14" height="14" fill="#FFB04E"/><rect x="74" y="15" width="14" height="14" fill="#FFB04E"/>' +
    '<path d="M0 52l116 30v10L0 62z" fill="#3A3D47"/><path d="M0 48l116 30v6L0 54z" fill="#24262D"/>' +
    '<path d="M8 30h20v26H8z" fill="#5A5F6D"/><rect x="12" y="38" width="12" height="14" fill="#3CE070"/>' +
    '<g><path d="M36 50l8-4 8 4v9l-8 4-8-4z" fill="#56BC70"/><path d="M36 50l8-4 8 4-8 4z" fill="#B4EFBA"/><path d="M62 57l8-4 8 4v9l-8 4-8-4z" fill="#56BC70"/><path d="M62 57l8-4 8 4-8 4z" fill="#B4EFBA"/><path d="M52 26l8-4 8 4v9l-8 4-8-4z" fill="#DC554E"/><path d="M52 26l8-4 8 4-8 4z" fill="#FFBBAE"/></g>' +
    '<circle cx="48" cy="38" r="6" fill="#F4BE93"/><path d="M41 37a7 7 0 0 1 14 0z" fill="#F6AE20"/><rect x="43" y="44" width="10" height="11" rx="3" fill="#36426B"/>' +
    '<path d="M86 26h28v32H86z" fill="#8C4636"/><path d="M92 58V42a8 8 0 0 1 16 0v16z" fill="#FF8A1E"/><path d="M96 58V47a4 4 0 0 1 8 0v11z" fill="#FFE46A"/><rect x="96" y="12" width="9" height="14" fill="#4A4953"/>' +
    '<rect y="0" width="160" height="12" fill="#15171C"/><text x="5" y="9" font-size="7" font-weight="900" fill="#F4F4F6" font-family="Inter">PACKET WORKS</text><circle cx="70" cy="6" r="2.4" fill="#49D860"/>' +
    '<rect x="116" y="12" width="44" height="84" fill="#15171C"/><rect x="121" y="20" width="28" height="6" fill="#F4F4F6"/><rect x="121" y="38" width="22" height="6" fill="#F4F4F6"/><rect x="121" y="56" width="30" height="6" fill="#F4F4F6"/>' +
    '<rect x="120" y="72" width="36" height="13" rx="4" fill="#FFC83A"/>'));
})();
