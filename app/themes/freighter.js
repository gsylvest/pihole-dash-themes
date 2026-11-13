// Space Freighter: your network is a cargo ship crossing a painted 16-bit starfield (static plate, themes/freighter/plate.webp,
// shown as an <img> under a transparent pixel canvas whose grid matches the painting: 1 canvas px = 4 plate px) behind a
// cyan energy shield. A light layer of code stars drifts down past the ship and a few of the plate's four-point stars twinkle.
// Blocked requests are ad-raider drones that spark and burst against the shield; the three newest are labelled
// with their domains (the newest is pinned against the shield, sparking) until a newer one pushes the oldest into it.
// Allowed traffic leaves the ship as cyan bolts that pass straight through. Paused: SHIELDS OFFLINE + countdown,
// the shield is gone and the drones drift through. Right panel: a retro console with amber numerals, a radar
// and the ship's log of recent domains.
(() => {
  "use strict";
  const K = window.PiSkinKit;

  // ---------- original sprites (string rows + palette). Ship and raider are authored as a left half and mirrored.
  const PAL = { K: "#0E1020", D: "#363C57", G: "#68708E", L: "#A7B0C9", W: "#F2F5FC", C: "#47E3FF", c: "#1C8DB4", A: "#FFB43A", a: "#B5701A",
    P: "#7B5ABA", p: "#45307C", E: "#FF4A2E", e: "#C8302A", R: "#E23A50", r: "#9C2440", Y: "#FFC04A", O: "#FF8A2A" };
  const PAL2 = Object.assign({}, PAL, { E: "#FF8A2A", e: "#FF4A2E", Y: "#FFF2B0" });   // raider core pulse frame
  const SHIP_L = [
    "...................K",
    "..................KW",
    "..................KW",
    ".................KLW",
    ".................KLW",
    "................KGLW",
    "................KGLL",
    "...............KGLCC",
    "...............KGLCW",
    "...............KGLCC",
    "..............KDGLcC",
    "..............KDGLcc",
    ".............KDGGLLL",
    ".............KDGLLLW",
    "............KDGGLAAA",
    "...........KDDGGLLLL",
    "..........KGDDGGLLLW",
    ".........KLGDDGGLLLL",
    "........KLGGDDGGGLLL",
    "......KKLGGGDDGGGLLL",
    "....KKLLGGGDDKGGGLLL",
    "..KKLLGGGGDDKKDGGGLL",
    ".KLLGGGGGDDKKcKDGGLL",
    "KLGGGGAAGDDK.KcKDGGL",
    "KGGGGGGDDDK..KCKDGGG",
    "KDDDDDDDKK...KcKDDGG",
    ".KKKKKKK....KDDDKDDD",
    "............KDGDKKDD",
    "............KDGDK.KK",
    "............KcCcK...",
    ".............KKK....",
  ];
  const RAIDER_L = [   // 27×22 when mirrored: a purple pod with a glowing core, red blade fins and a thin exhaust
    "............KW",
    "............KL",
    "...........KGL",
    "..........KDGG",
    "..R......KPPPP",
    ".RR.....KPPPPP",
    ".RrK...KPPpKKK",
    "RRrK..KPPpKeee",
    "RRrK.KPPpKeEEE",
    "RRrKKPPPpKeEYY",
    "RRrKPPPPpKeEYW",
    "RRrKpPPPpKeEYY",
    "RRKKppPPpKeEEE",
    "RR.KKppPPpKeee",
    "Rr..KKppPPpKKK",
    "Rr...KKppPPPPP",
    "r.....KKppPPpp",
    "r.......KKppDD",
    "..........KKDG",
    "...........KOY",
    "............O.",
    "............a.",
  ];
  const mirror = (rows) => rows.map((r) => r + r.slice(0, -1).split("").reverse().join(""));
  const SHIP = mirror(SHIP_L), RAIDER = mirror(RAIDER_L);
  const ENG = [14, 24];   // engine centre columns
  const FLAME = [
    ["cCWCc", ".CWC.", ".CWC.", ".cCc.", "..C..", "..C..", "..c..", "..c.."],
    ["cCWCc", "cCWCc", ".CWC.", ".CWC.", ".cCc.", "..C..", "..C..", "..c..", "..c..", "..c.."],
    ["cCWCc", ".CWC.", ".cCc.", ".cCc.", "..C..", "..c..", "..c.."],
  ];
  const MINI = [
    "......K......",
    ".....KPK.....",
    ".R..KPPPK..R.",
    ".RRKPpppPKRR.",
    ".RKPpeEepPKR.",
    "RRKPpEYEpPKRR",
    "R.KPpeEepPK.R",
    "R..KPpppPK..R",
    "....KPPPK....",
    ".....KOK.....",
  ];
  function bake(rows, pal) {
    pal = pal || PAL;
    const c = document.createElement("canvas"); c.width = Math.max(...rows.map((r) => r.length)); c.height = rows.length;
    const g = c.getContext("2d");
    rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const p = pal[row[x]]; if (p) { g.fillStyle = p; g.fillRect(x, y, 1, 1); } } });
    return c;
  }

  // the plate's own four-point stars (logical px, measured on plate.webp) get an occasional brighter flare on top
  const TWINKLE = [[172, 20], [278, 12], [16, 26], [282, 82], [41, 134], [160, 148], [251, 142]];
  function twinkleSprite(a) {   // arm length a: white core, pale-blue arms fading to periwinkle tips
    const n = a * 2 + 1, c = document.createElement("canvas"); c.width = c.height = n; const g = c.getContext("2d");
    for (let i = 1; i <= a; i++) {
      g.fillStyle = i === a ? "#6F86D8" : i > a / 2 ? "#A9BCF2" : "#E6EEFF";
      g.fillRect(a - i, a, 1, 1); g.fillRect(a + i, a, 1, 1); g.fillRect(a, a - i, 1, 1); g.fillRect(a, a + i, 1, 1);
    }
    if (a >= 4) { g.fillStyle = "#5A6FC0"; g.fillRect(a - 1, a - 1, 1, 1); g.fillRect(a + 1, a - 1, 1, 1); g.fillRect(a - 1, a + 1, 1, 1); g.fillRect(a + 1, a + 1, 1, 1); }
    g.fillStyle = "#FFFFFF"; g.fillRect(a, a, 1, 1);
    return c;
  }
  // world: the plate is 1200×880 and painted on a 4-px grid, so the overlay canvas is 300×220 laid exactly over it
  const IW = 1200, IH = 880, W = 300, H = 220;

  function shieldPlate(w, h, cx, cy, R, a0, a1, seed) {   // thin crisp energy arc: 1 px bright edge, 1 px cyan under it, faint crackle inside
    const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d");
    let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const px = (x, y, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), 1, 1); };
    for (let a = a0; a <= a1; a += 0.3 / R) {
      const fade = Math.min(1, (a - a0) / 0.16, (a1 - a) / 0.16);
      const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
      if (fade > 0.3) px(x, y + 1, "#14688C");
      if (fade > 0.35 || rnd() < fade * 2) px(x, y, fade > 0.75 ? "#C8FAFF" : "#47E3FF");
    }
    for (let n = 0; n < 2; n++) {   // crackle
      let a = a0 + 0.12 + rnd() * (a1 - a0 - 0.5), r = R - 4 - rnd() * 3;
      for (let i = 0; i < 34; i++) { a += 0.006 + rnd() * 0.008; if (a > a1 - 0.1) break; r += (rnd() - 0.5) * 1.5; r = Math.min(R - 3, Math.max(R - 9, r)); px(cx + Math.cos(a) * r, cy + Math.sin(a) * r, "#125A7A"); }
    }
    return c;
  }

  const skin = {
    mount(el) {
      el.innerHTML = `
        <div class="fr-top"><i class="fr-stripes"></i><b class="fr-title">SPACE FREIGHTER</b><i class="fr-stripes r"></i><i class="fr-vr"></i>
          <span class="fr-state" data-k="state"></span><span class="fr-sp"></span>
          <button class="fr-btn" data-act="allowed" data-k="allowed" type="button">Allowed<span class="n"></span></button>
          <button class="fr-btn" data-act="style" type="button">Style</button></div>
        <div class="fr-scene"><img class="fr-plate" src="themes/freighter/plate.webp" alt="" draggable="false"><canvas class="fr-cv"></canvas><div class="fr-tags" data-k="tags"></div>
          <div class="fr-alarm" data-k="alarm"><b>SHIELDS OFFLINE</b><span data-k="cd"></span></div></div>
        <div class="fr-panel">
          <div class="fr-cell"><div class="fr-v amber" data-k="blocked"></div><div class="fr-k" data-k="lab"></div></div>
          <div class="fr-cell fr-row"><div class="fr-half"><div class="fr-v cyan" data-k="pct"></div><div class="fr-k">Blocked</div></div><canvas class="fr-radar" width="29" height="29"></canvas></div>
          <div class="fr-cell"><div class="fr-v amber" data-k="total"></div><div class="fr-k">Queries - 24h</div></div>
          <div class="fr-log fade"><div class="fr-h">SHIP'S LOG</div><ol data-k="log"></ol></div>
          <button class="fr-pause" data-act="pause" data-k="pause" type="button"></button>
          <div class="fr-meta" data-k="meta"></div></div>`;
      const cv = el.querySelector(".fr-cv"), img = el.querySelector(".fr-plate"), ctx = cv.getContext("2d"), host = el.querySelector(".fr-scene");
      const rc = el.querySelector(".fr-radar"), rctx = rc.getContext("2d");
      const S = this.s = { m: null, rate: K.rateTracker(), news: K.newsTracker(), drones: [], minis: [], bolts: [], parts: [], flashes: [], hits: [],
        stars: [], acc: 0, accQ: 0, k: 2, ox: 0, oy: 0, w: W, h: H, tagHost: K.q(el, "tags"), inited: false, sweep: 0, grind: 0,
        ship: bake(SHIP), raider: [bake(RAIDER), bake(RAIDER, PAL2)], mini: [bake(MINI), bake(MINI, PAL2)], flame: FLAME.map((f) => bake(f)),
        tw: [2, 3, 5].map(twinkleSprite), twp: TWINKLE.map((_, i) => 1.3 + i * 2.7) };
      // fixed world geometry in plate pixels: the ship sits in the plate's dark bottom band (plate y ≥ 704 → 176)
      cv.width = W; cv.height = H;
      S.sx = 150; S.sy = 191;                                       // ship centre
      S.R = 156; S.cx = S.sx; S.cy = S.sy - 56 + S.R;               // shield: a shallow cap over the ship (apex 56 px above its centre)
      S.a0 = -Math.PI / 2 - 0.68; S.a1 = -Math.PI / 2 + 0.68;
      S.shield = [shieldPlate(W, H, S.cx, S.cy, S.R, S.a0, S.a1, 11), shieldPlate(W, H, S.cx, S.cy, S.R, S.a0, S.a1, 77)];
      S.glow = K.glowSprite("71,227,255", 12); S.fire = K.glowSprite("255,150,50", 18);
      const a0 = -Math.PI / 2 - 0.36;                               // slot 0: pinned against the shield, left of centre
      S.slots = [[S.cx + Math.cos(a0) * (S.R + 15), S.cy + Math.sin(a0) * (S.R + 15)], [S.sx + 3, S.sy - 138], [S.sx + 64, S.sy - 92]];
      let sd = 99; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      S.stars = Array.from({ length: 40 }, (_, i) => ({ x: rnd() * W, y: rnd() * H, v: i < 26 ? 4 + rnd() * 4 : i < 36 ? 12 + rnd() * 6 : 26 + rnd() * 8, p: rnd() * 6 }));
      const size = () => {   // plate scaled to cover the scene, anchored so the nebula (upper left) and planet (upper right) stay in view
        const Wh = host.clientWidth, Hh = host.clientHeight; if (!Wh || !Hh) return;
        const sc = Math.max(Wh / IW, Hh / IH), w = Math.round(IW * sc), h = Math.round(IH * sc);
        S.ox = Math.round((Wh - w) * 0.6); S.oy = Math.round((Hh - h) * 0.25); S.k = w / W; S.sceneW = Wh;
        for (const e of [img, cv]) { e.style.width = `${w}px`; e.style.height = `${h}px`; e.style.left = `${S.ox}px`; e.style.top = `${S.oy}px`; }
      };
      size(); this.ro = new ResizeObserver(size); this.ro.observe(host);
      this.stop = K.loop((dt, t) => { this.frame(ctx, dt, t); this.radar(rctx, dt, t); }, 20);
    },
    unmount() { if (this.stop) this.stop(); if (this.ro) this.ro.disconnect(); },

    render(el, m) {
      const S = this.s, d = m.data || {}, mt = K.meta(m); S.m = m; S.rate.update(m);
      const fresh = S.news(m.ticker);
      if (!S.inited && m.ticker.length) {   // first poll: the three newest already on station
        S.inited = true;
        m.ticker.slice(0, 3).forEach((it, i) => { const [x, y] = S.slots[i]; S.drones.push(this.drone(it, i, x, y, "hover")); });
      }
      for (const it of fresh) this.arrive(it);
      const st = K.q(el, "state"); st.textContent = m.pill.text; st.className = `fr-state ${m.pill.cls}`;
      K.q(el, "lab").textContent = K.heroLabel(m, "Blocked - 24h");
      K.q(el, "lab").classList.toggle("alert", m.labelAlert || m.paused);
      K.q(el, "blocked").textContent = K.num(d.blocked); K.q(el, "pct").textContent = K.pct(d.percent_blocked); K.q(el, "total").textContent = K.num(d.total);
      K.q(el, "log").innerHTML = m.ticker.slice(0, 4).map((it) =>
        `<li data-domain="${K.esc(it.domain)}"><span class="d">${K.esc(it.domain)}</span><span class="t">${K.esc(K.short(K.ago(m, it)))}</span></li>`).join("")
        || '<li class="empty">No contacts</li>';
      K.q(el, "pause").textContent = K.pauseText(m);
      K.q(el, "meta").textContent = `CPU ${mt.temp} | Up ${mt.up}`;
      K.q(el, "alarm").hidden = !m.paused;
      K.q(el, "cd").textContent = (m.pill.text.split("·")[1] || "").trim();
      S.drones.forEach((dr) => {   // labelled raiders: keep the age current
        const it = m.ticker.find((x) => x.domain === dr.domain && x.seen_at === dr.seen);
        if (it && dr.tag) dr.tag.querySelector(".t").textContent = K.short(K.ago(m, it));
      });
      K.common(el, m);
      K.fit(K.q(el, "blocked"), 18); K.fit(K.q(el, "pct"), 18); K.fit(K.q(el, "total"), 18);
    },
    shieldUp(m) { return !m.paused && m.pill.cls === "ok"; },
    drone(it, slot, x, y, st) {
      const tag = document.createElement("div"); tag.className = "fr-tag"; tag.dataset.domain = it.domain;
      tag.innerHTML = `<div class="b"><span class="d">${K.esc(it.domain)}</span><span class="t">${K.esc(K.short(K.ago(this.s.m, it)))}</span></div>`;
      this.s.tagHost.appendChild(tag);
      return { domain: it.domain, seen: it.seen_at, slot, x, y, st, tag, ph: Math.random() * 6, t: 0, a: 1 };
    },
    arrive(it) {   // a newly blocked domain warps in and rams the shield; the others move up a slot and the oldest dives in and bursts
      const S = this.s;
      S.drones.filter((d) => d.st !== "dive").forEach((d) => { d.slot += 1; if (d.slot > 2) { d.st = "dive"; d.slot = -1; } });
      const sx = S.slots[0][0];
      S.drones.push(this.drone(it, 0, sx - 22, -16, "in"));
      for (let i = 0; i < 6; i++) S.flashes.push({ x: sx - 22, y: 2 + i * 7, t: 0.3 + i * 0.04, T: 1, kind: "warp" });
    },
    burst(x, y, n, big) {   // orange / yellow / white spark explosion thrown outward from the shield
      const S = this.s, cols = ["#FFFFFF", "#FFF2B0", "#FFD23A", "#FFB43A", "#FF8A2A", "#FF8A2A", "#E8502A"];
      const ax = x - S.cx, ay = y - S.cy, al = Math.hypot(ax, ay) || 1;
      for (let i = 0; i < n && S.parts.length < 220; i++) {
        const sp = 15 + Math.random() * (big ? 87 : 60), a = Math.random() * 6.283, life = 0.5 + Math.random() * (big ? 1.0 : 0.7);
        S.parts.push({ x, y, vx: Math.cos(a) * sp + ax / al * 24, vy: Math.sin(a) * sp + ay / al * 24, t: life, T: life, c: cols[(Math.random() * cols.length) | 0], s: Math.random() < (big ? 0.45 : 0.3) ? 2 : 1 });
      }
      const T = big ? 0.9 : 0.6;
      S.flashes.push({ x, y, t: T, T, kind: "boom", big });
      if (this.shieldUp(S.m)) S.hits.push({ a: Math.atan2(y - S.cy, x - S.cx), t: 0.5 });
    },
    star(ctx, x, y, r, k) {   // pixel starburst: white core, yellow cross rays, orange diagonals
      ctx.fillStyle = k < 0.6 ? "#FFD23A" : "#FF8A2A";
      ctx.fillRect(x - r, y, r * 2 + 1, 1); ctx.fillRect(x, y - r, 1, r * 2 + 1);
      ctx.fillStyle = "#FF8A2A"; const d = Math.max(1, Math.round(r * 0.55));
      for (let i = 1; i <= d; i++) { ctx.fillRect(x - i, y - i, 1, 1); ctx.fillRect(x + i, y - i, 1, 1); ctx.fillRect(x - i, y + i, 1, 1); ctx.fillRect(x + i, y + i, 1, 1); }
      if (k < 0.75) { const c = Math.max(1, Math.round(r * 0.3)); ctx.fillStyle = "#FFF2B0"; ctx.fillRect(x - c, y - c, c * 2 + 1, c * 2 + 1); ctx.fillStyle = "#FFFFFF"; ctx.fillRect(x - c + 1, y - c + 1, Math.max(1, c * 2 - 1), Math.max(1, c * 2 - 1)); }
    },
    onArc(x, y, pad) { const S = this.s, a = Math.atan2(y - S.cy, x - S.cx); return a > S.a0 && a < S.a1 && Math.hypot(x - S.cx, y - S.cy) <= S.R + pad; },

    frame(ctx, dt, t) {
      const S = this.s, m = S.m; if (!m || m.asleep || !S.shield) return;
      const on = this.shieldUp(m);
      if (!m.stale) {   // time-lapsed ambient traffic, bounded
        const r = S.rate.get(m);
        S.acc += dt * Math.min(0.8, Math.max(0.4, r.b * 0.5));
        S.accQ += dt * Math.min(2.5, Math.max(1, r.q * 0.4));
        if (S.acc >= 1) { S.acc -= 1; if (S.minis.length < 6) S.minis.push({ x: 36 + Math.random() * (W - 72), y: -8, v: 33 + Math.random() * 15, f: Math.random() * 2 }); }
        if (S.accQ >= 1) { S.accQ -= 1; if (S.bolts.length < 12) S.bolts.push({ x: S.sx + (Math.random() < 0.5 ? -5 : 5), y: S.sy - 18, v: 130 + Math.random() * 45 }); }
      }
      // the painted plate is a static <img> underneath: clear the overlay, then a light layer of drifting stars (parallax)
      ctx.clearRect(0, 0, W, H);
      for (const s of S.stars) {
        s.y += s.v * dt; if (s.y > H) { s.y -= H + 2; s.x = Math.random() * W; }
        const x = s.x | 0, y = s.y | 0, tw = Math.sin(t * 3 + s.p) > 0.6;
        if (s.v > 24) { ctx.fillStyle = "#3E4C8E"; ctx.fillRect(x, y - 2, 1, 2); ctx.fillStyle = "#DCE4FF"; ctx.fillRect(x, y, 1, 1); }
        else { ctx.fillStyle = s.v > 10 ? (tw ? "#E8EEFF" : "#9AA8DC") : tw ? "#7C86C0" : "#4A5290"; ctx.fillRect(x, y, 1, 1); }
      }
      // a few of the plate's own four-point stars flare now and then (staggered, ~0.8 s each)
      for (let i = 0; i < TWINKLE.length; i++) {
        const ph = (t + S.twp[i]) % 6.5; if (ph > 0.8) continue;
        const spr = S.tw[ph < 0.15 || ph > 0.65 ? 0 : ph < 0.3 || ph > 0.5 ? 1 : 2], r = (spr.width - 1) / 2;
        ctx.drawImage(spr, TWINKLE[i][0] - r, TWINKLE[i][1] - r);
      }
      // allowed traffic: cyan bolts leave the ship and pass through the shield
      S.bolts = S.bolts.filter((b) => {
        b.y -= b.v * dt; if (b.y < -8) return false; const y = Math.round(b.y);
        ctx.fillStyle = "#1C8DB4"; ctx.fillRect(b.x, y + 4, 1, 3); ctx.fillStyle = "#47E3FF"; ctx.fillRect(b.x, y + 1, 1, 3); ctx.fillStyle = "#EFFFFF"; ctx.fillRect(b.x, y, 1, 2);
        return true;
      });
      // ambient raiders dive at the ship and burst on the shield
      S.minis = S.minis.filter((d) => {
        const dx = S.sx - d.x, dy = S.sy - d.y, l = Math.hypot(dx, dy) || 1;
        d.x += dx / l * d.v * dt; d.y += dy / l * d.v * dt; d.f += dt * 5;
        if (on && (this.onArc(d.x, d.y + 5, 1) || l < 30)) { this.burst(d.x, d.y + 4, 22, false); return false; }
        if (!on && l < 40) d.x += (d.x < S.sx ? -1 : 1) * 60 * dt;   // shield down: they slip past the hull
        if (d.y > H + 8) return false;
        ctx.drawImage(S.mini[(d.f | 0) % 2], Math.round(d.x) - 6, Math.round(d.y) - 5);
        return true;
      });
      // labelled raiders
      let grinding = null;
      S.drones = S.drones.filter((d) => {
        d.t += dt;
        if (d.st === "in") {   // fly in and ram the shield at slot 0
          const [cx, cy] = S.slots[0], dx = cx - d.x, dy = cy - d.y, l = Math.hypot(dx, dy);
          if (l < 2 || !on) { if (on) this.burst(d.x, d.y + 12, 26, true); d.st = "hover"; }
          else { const v = Math.min(l, 120 * dt); d.x += dx / l * v; d.y += dy / l * v; }
        }
        if (d.st === "hover") {
          const [tx, ty] = S.slots[d.slot]; d.x += (tx - d.x) * Math.min(1, dt * 2.2); d.y += (ty - d.y) * Math.min(1, dt * 2.2);
          if (d.slot === 0 && on && Math.abs(tx - d.x) < 3) grinding = d;
        }
        if (d.st === "dive") {
          const dx = S.sx - d.x, dy = S.sy - d.y, l = Math.hypot(dx, dy) || 1, v = 90 * dt; d.x += dx / l * v; d.y += dy / l * v;
          if (on && this.onArc(d.x, d.y + 12, 1)) { this.burst(d.x, d.y + 11, 40, true); d.tag.remove(); return false; }
          if (!on) { d.a -= dt * 0.8; if (d.a <= 0) { d.tag.remove(); return false; } }
        }
        const bob = d.st === "hover" && d.slot === 0 && on ? (((t * 14) | 0) % 2) : Math.round(Math.sin(t * 2 + d.ph) * 1.2);
        const x = Math.round(d.x), y = Math.round(d.y) + bob;
        ctx.globalAlpha = Math.max(0, d.a);
        ctx.drawImage(S.raider[((t * 4 + d.ph) | 0) % 2], x - 13, y - 11);
        ctx.globalAlpha = 1;
        // tag (HTML, crisp text): on the outer side of the raider, truncated to the room there
        const left = d.x < S.sx - 16;
        if (d.left !== left) { d.left = left; d.tag.classList.toggle("l", left); }
        const sxp = x * S.k + S.ox, room = Math.round(Math.max(90, Math.min(250, left ? sxp - 36 : S.sceneW - sxp - 36)) / 6) * 6;
        if (d.room !== room) { d.room = room; d.tag.firstChild.style.maxWidth = `${room}px`; }
        d.tag.style.transform = `translate(${Math.round((x + (left ? -7 : 7)) * S.k + S.ox)}px, ${Math.round((y - 11) * S.k + S.oy)}px)`;
        d.tag.style.opacity = d.a;
        return true;
      });
      // shield (two baked variants alternate for shimmer; hit points flare white)
      if (on) {
        ctx.drawImage(S.shield[((t * 5) | 0) % 2], 0, 0);
        S.hits = S.hits.filter((h) => {
          h.t -= dt;
          for (let a = h.a - 0.1; a <= h.a + 0.1; a += 0.3 / S.R) {
            const k = 1 - Math.abs(a - h.a) / 0.1; if (a < S.a0 || a > S.a1 || Math.random() > k + 0.25) continue;
            ctx.fillStyle = "#FFFFFF"; ctx.fillRect(Math.round(S.cx + Math.cos(a) * S.R), Math.round(S.cy + Math.sin(a) * S.R), 1, k > 0.5 ? 2 : 1);
          }
          return h.t > 0;
        });
      } else if (Math.sin(t * 9) > 0.7) {   // shield down: a broken flicker where it used to be
        ctx.fillStyle = "#123A4E";
        for (let a = S.a0; a <= S.a1; a += 0.03) if (Math.sin(a * 97 + t * 3) > 0.2) ctx.fillRect(Math.round(S.cx + Math.cos(a) * S.R), Math.round(S.cy + Math.sin(a) * S.R), 1, 1);
      }
      // the freighter: engine glow, long flames (3-frame flicker), hull with a gentle bob
      const bob = Math.round(Math.sin(t * 1.6) * 0.8), hx = S.sx - 19, hy = S.sy - 15 + bob, ff = ((t * 12) | 0) % 3;
      ctx.globalAlpha = 0.4; ctx.drawImage(S.glow, hx + ENG[0] - 12, hy + 24); ctx.drawImage(S.glow, hx + ENG[1] - 12, hy + 24); ctx.globalAlpha = 1;
      ctx.drawImage(S.flame[ff], hx + ENG[0] - 2, hy + 30); ctx.drawImage(S.flame[(ff + 1) % 3], hx + ENG[1] - 2, hy + 30);
      ctx.drawImage(S.ship, hx, hy);
      if (((t * 2) | 0) % 2) { ctx.fillStyle = on ? "#47E3FF" : "#FFB43A"; ctx.fillRect(hx + 1, hy + 23, 1, 1); ctx.fillRect(hx + 37, hy + 23, 1, 1); }
      // the newest raider grinds against the shield: a sustained spark burst
      if (grinding) {
        const gx = Math.round(grinding.x + 5), gy = Math.round(grinding.y + 13);
        S.grind -= dt;
        if (S.grind <= 0) { S.grind = 0.09; const n = 2 + ((Math.random() * 3) | 0); this.burstLite(gx, gy, n); if (Math.random() < 0.12) S.hits.push({ a: Math.atan2(gy - S.cy, gx - S.cx), t: 0.3 }); }
        ctx.globalAlpha = 0.45; ctx.drawImage(S.fire, gx - 18, gy - 18); ctx.globalAlpha = 1;
        this.star(ctx, gx, gy, 7 + (((t * 10) | 0) % 3) * 3, 0.2);
      }
      // explosions + particles
      S.flashes = S.flashes.filter((f) => {
        f.t -= dt; if (f.t <= 0) return false;
        if (f.kind === "warp") { ctx.fillStyle = "#C9D4FF"; ctx.fillRect(Math.round(f.x), Math.round(f.y), 1, 5); return true; }
        const k = 1 - f.t / f.T, x = Math.round(f.x), y = Math.round(f.y);
        if (k < 0.5) { ctx.globalAlpha = 0.6 * (1 - k * 2); ctx.drawImage(S.fire, x - 18, y - 18); ctx.globalAlpha = 1; }
        this.star(ctx, x, y, Math.round((f.big ? 16 : 10) * Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5) * (1 - k * 0.5)) + 1, k);
        return true;
      });
      S.parts = S.parts.filter((p) => {
        p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.95; p.vy *= 0.95;
        const k = p.t / p.T; ctx.fillStyle = k < 0.3 ? "#B8401E" : p.c; const s = k < 0.4 ? 1 : p.s;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), s, s); return p.t > 0;
      });
    },
    burstLite(x, y, n) {
      const S = this.s, cols = ["#FFFFFF", "#FFF2B0", "#FFD23A", "#FFB43A", "#FF8A2A"];
      for (let i = 0; i < n && S.parts.length < 220; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 3.4, sp = 20 + Math.random() * 60, life = 0.3 + Math.random() * 0.6;
        S.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: life, T: life, c: cols[(Math.random() * cols.length) | 0], s: Math.random() < 0.3 ? 2 : 1 });
      }
    },
    radar(g, dt, t) {   // 29×29 pixel scope: sweep, rings, ship at centre, raiders as amber blips
      const S = this.s, m = S.m; if (!m || m.asleep || !S.cx) return;
      const on = this.shieldUp(m), C = 14;
      S.sweep = (S.sweep + dt * 2.4) % 6.2832;
      g.fillStyle = "#06120F"; g.fillRect(0, 0, 29, 29);
      const ring = on ? "#1E5A52" : "#5A4210", hi = on ? "#47E3FF" : "#FFB43A";
      g.fillStyle = ring;
      for (let a = 0; a < 6.283; a += 0.08) { g.fillRect(Math.round(C + Math.cos(a) * 13), Math.round(C + Math.sin(a) * 13), 1, 1); if (((a * 100) | 0) % 3 === 0) g.fillRect(Math.round(C + Math.cos(a) * 7), Math.round(C + Math.sin(a) * 7), 1, 1); }
      g.fillRect(C, 2, 1, 25); g.fillRect(2, C, 25, 1);
      for (let k = 0; k < 4; k++) {
        const a = S.sweep - k * 0.12; g.fillStyle = k ? (on ? "#1E7A84" : "#7A5A18") : hi; g.globalAlpha = 1 - k * 0.22;
        for (let r = 1; r < 13; r++) g.fillRect(Math.round(C + Math.cos(a) * r), Math.round(C + Math.sin(a) * r), 1, 1);
      }
      g.globalAlpha = 1;
      const blip = (x, y, big) => {
        const bx = Math.round(C + (x - S.sx) / S.w * 24), by = Math.round(C + (y - S.sy) / S.h * 13);
        if (Math.hypot(bx - C, by - C) > 12) return;
        g.fillStyle = "#FFB43A"; g.fillRect(bx, by, 1, 1); if (big) { g.fillStyle = "#E23A50"; g.fillRect(bx - 1, by, 1, 1); g.fillRect(bx + 1, by, 1, 1); }
      };
      S.drones.forEach((d) => blip(d.x, d.y, true)); S.minis.forEach((d) => blip(d.x, d.y, false));
      g.fillStyle = "#EDF1FA"; g.fillRect(C, C, 1, 1);
    },
  };

  window.PiSkins.add("freighter", skin, "Space Freighter", "Raiders burst on the ship's shield", K.T(
    '<rect width="160" height="96" fill="#070A1C"/><path d="M10 40 Q40 20 70 34 T120 30" stroke="#2A1E5C" stroke-width="10" fill="none" opacity=".8"/>' +
    '<rect x="0" y="12" width="160" height="1" fill="#2A3358"/><rect x="4" y="4" width="8" height="1.5" fill="#47E3FF"/><rect x="2" y="7" width="8" height="1.5" fill="#47E3FF"/>' +
    '<text x="14" y="9.5" font-size="7" font-weight="800" font-style="italic" fill="#EDF1FA" font-family="Inter Tight, Inter" letter-spacing=".6">SPACE FREIGHTER</text>' +
    '<rect x="116" y="12" width="1" height="84" fill="#2A3358"/>' +
    '<circle cx="94" cy="28" r="6" fill="#6E58B8"/><ellipse cx="94" cy="28" rx="11" ry="2.4" fill="none" stroke="#A08CE6" stroke-width=".8"/>' +
    '<path d="M24 66 Q60 44 96 66" fill="none" stroke="#47E3FF" stroke-width="1.4"/>' +
    '<path d="M60 68 l4 10 l8 6 v3 h-24 v-3 l8 -6z" fill="#A7B0C9"/><rect x="59" y="74" width="2" height="4" fill="#47E3FF"/>' +
    '<g fill="#47E3FF"><rect x="54" y="87" width="2" height="6"/><rect x="64" y="87" width="2" height="6"/><rect x="60" y="50" width="1" height="5"/></g>' +
    '<g fill="#7B5ABA"><rect x="36" y="44" width="9" height="8"/><rect x="58" y="22" width="9" height="8"/><rect x="84" y="34" width="9" height="8"/></g>' +
    '<g fill="#FF4A2E"><rect x="39" y="47" width="3" height="3"/><rect x="61" y="25" width="3" height="3"/><rect x="87" y="37" width="3" height="3"/></g>' +
    '<g fill="#FFD23A"><rect x="42" y="55" width="3" height="3"/><rect x="48" y="53" width="1" height="1"/><rect x="38" y="57" width="1" height="1"/><rect x="46" y="59" width="1" height="1"/></g>' +
    '<g fill="#FFB43A"><rect x="122" y="20" width="30" height="7"/><rect x="122" y="52" width="30" height="7"/></g><rect x="122" y="36" width="22" height="7" fill="#47E3FF"/>' +
    '<rect x="121" y="78" width="34" height="10" rx="2" fill="#FFC531"/>'));
})();
