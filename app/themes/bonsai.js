// BONSAI: a photoreal bonsai with copper circuit traces (static plate, themes/bonsai/plate.webp) under a
// transparent canvas. Mint data pulses climb the traces from the trunk base out to the branch tiers at a rate
// that follows the live query rate (time-lapsed, max 12 alive); a few points in the foliage twinkle. Each newly
// blocked domain detaches an autumn leaf from one of the three right-hand branch tips: it drifts down a dashed
// arc and settles beside its label (latest 3; the oldest fades out). Paused: no pulses, dim twinkles, no new
// leaves, the plate and labels dim, status shows the countdown in amber. Sprites pre-rendered; 15 fps cap.
(() => {
  "use strict";
  const K = window.PiSkinKit;
  const FPS = 15, MAX_PULSES = 12, SPEED = 64;   // pulse speed in px/s along a trace
  // Copper trace centre lines, measured on the plate at 800×480 (the plate fills the screen exactly).
  const TRUNK = [[178, 400], [185, 376], [192, 352], [191, 335], [180, 318], [160, 303], [142, 290], [131, 272], [134, 252], [148, 233], [166, 215], [188, 198], [210, 184]];
  const upTo = (i) => TRUNK.slice(0, i + 1);
  const ROUTES = [   // [path, weight]
    [[...TRUNK, [250, 164], [283, 153], [300, 141], [317, 133], [333, 132], [350, 137], [377, 152], [393, 150], [413, 157], [427, 167], [440, 173], [455, 175], [468, 178]], 3],   // top tier
    [[...upTo(7), [160, 245], [177, 243], [200, 235], [230, 247], [248, 254], [260, 253], [287, 248], [303, 236], [317, 233], [335, 243], [347, 253], [363, 256], [383, 253], [398, 255]], 3],   // middle tier
    [[...upTo(3), [205, 328], [227, 315], [243, 310], [257, 312], [270, 317], [280, 325], [293, 332], [307, 335], [324, 336]], 3],   // lower tier
    [[...TRUNK, [250, 164], [283, 151], [287, 128], [291, 112], [303, 105], [317, 106]], 2],   // crown
    [[...upTo(10), [160, 207], [150, 195], [137, 187], [127, 179], [112, 176], [98, 175]], 1],   // left, upper
    [[...upTo(7), [118, 261], [98, 260], [80, 263], [64, 261]], 1],   // left, lower
  ];
  // The three branch tips leaves fall from, where each settles, and where its label sits.
  const TIPS = [
    { tip: [466, 182], rest: [442, 230] },
    { tip: [398, 258], rest: [424, 302] },
    { tip: [324, 340], rest: [350, 380] },
  ];
  const TWINKLES = [[228, 78], [262, 68], [300, 60], [334, 74], [350, 96], [212, 104], [402, 134], [438, 146], [482, 164], [496, 178],
    [302, 214], [334, 210], [378, 238], [406, 248], [222, 296], [282, 292], [320, 318], [342, 330], [62, 182], [92, 152], [128, 140], [182, 160], [52, 244], [84, 236], [104, 248]];
  const MINT = "120,255,176", AMB = "255,150,60";

  function prep(pts) {   // cumulative lengths for constant-speed travel
    const L = [0];
    for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts, L, len: L[L.length - 1] };
  }
  function at(r, d) {
    const { pts, L } = r; let i = 1;
    while (i < L.length - 1 && L[i] < d) i++;
    const f = Math.max(0, Math.min(1, (d - L[i - 1]) / (L[i] - L[i - 1] || 1)));
    return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f];
  }
  function leafSprite(base, dark, light) {   // a small almond leaf with a midrib, 30×16 at 2×
    const c = document.createElement("canvas"); c.width = 60; c.height = 32; const g = c.getContext("2d");
    g.scale(2, 2);
    const shape = () => { g.beginPath(); g.moveTo(2, 8); g.bezierCurveTo(8, 0.5, 20, 0.5, 28, 8); g.bezierCurveTo(20, 15.5, 8, 15.5, 2, 8); g.closePath(); };
    shape(); const gr = g.createLinearGradient(0, 2, 0, 14); gr.addColorStop(0, light); gr.addColorStop(0.5, base); gr.addColorStop(1, dark);
    g.fillStyle = gr; g.fill();
    g.strokeStyle = dark; g.lineWidth = 0.8; g.stroke();
    g.strokeStyle = "rgba(255,226,170,.75)"; g.lineWidth = 0.7; g.beginPath(); g.moveTo(0, 8); g.lineTo(26, 8); g.stroke();
    g.lineWidth = 0.5; g.beginPath();
    for (const x of [8, 13, 18, 23]) { g.moveTo(x, 8); g.lineTo(x + 3, 4.5); g.moveTo(x, 8); g.lineTo(x + 3, 11.5); }
    g.stroke();
    return c;
  }
  const bez = (p0, c, p1, u) => { const v = 1 - u; return [v * v * p0[0] + 2 * v * u * c[0] + u * u * p1[0], v * v * p0[1] + 2 * v * u * c[1] + u * u * p1[1]]; };

  const skin = {
    mount(el) {
      el.innerHTML = `
        <img class="bz-plate" src="themes/bonsai/plate.webp" alt="" draggable="false">
        <canvas class="bz-cv"></canvas>
        <div class="bz-labels fade"></div>
        <div class="bz-top"><b class="bz-title">pi-hole / bonsai</b><i class="bz-bar"></i><span class="bz-state" data-k="state"></span><span class="bz-sp"></span>
          <button class="bz-ctl" data-act="allowed" data-k="allowed" type="button"><span class="bz-ck">Allowed:</span><span class="bz-box"><span data-k="alv">All</span><i class="bz-caret"></i></span></button>
          <button class="bz-ctl" data-act="style" type="button"><span class="bz-ck">Style:</span><span class="bz-box">Bonsai<i class="bz-caret"></i></span></button></div>
        <div class="bz-col">
          <div class="bz-stat"><div class="bz-v" data-k="blocked"></div><div class="bz-k" data-k="lab">Blocked / 24h</div></div>
          <div class="bz-stat"><div class="bz-v" data-k="pct"></div><div class="bz-k">Blocked</div></div>
          <div class="bz-stat"><div class="bz-v" data-k="total"></div><div class="bz-k">Queries / 24h</div></div>
          <span class="bz-sp"></span>
          <button class="bz-pause" data-act="pause" data-k="pause" type="button"></button>
          <div class="bz-meta" data-k="meta"></div>
        </div>`;
      const cv = el.querySelector(".bz-cv");
      const S = this.s = { m: null, ctx: cv.getContext("2d"), cv, rate: K.rateTracker(), news: K.newsTracker(), seeded: false,
        routes: ROUTES.map(([p, w]) => ({ ...prep(p), w })), wsum: ROUTES.reduce((a, r) => a + r[1], 0),
        pulses: [], acc: 0, t: 0, dark: 0, leaves: [], queue: [], gap: 0, next: 0,
        dot: K.glowSprite(MINT, 10), core: K.glowSprite("225,255,235", 3), spark: K.glowSprite(MINT, 4), tw: K.glowSprite("150,255,190", 6), twc: K.glowSprite("215,255,225", 2),
        leafImg: [leafSprite("#E8892E", "#9A4312", "#FFC46A"), leafSprite("#F0A23A", "#A8551A", "#FFD98A"), leafSprite("#D9702A", "#8A3A10", "#F7B060")],
        twk: TWINKLES.map(([x, y]) => ({ x, y, ph: Math.random() * 6.28, sp: 0.7 + Math.random() * 1.6 })),
        labels: el.querySelector(".bz-labels"), W: 800, H: 480, dpr: 1 };
      const size = () => {
        const W = el.clientWidth || 800, H = el.clientHeight || 480;
        S.dpr = Math.min(2, window.devicePixelRatio || 1); S.W = W; S.H = H; S.k = Math.min(W / 800, H / 480);
        cv.width = Math.round(W * S.dpr); cv.height = Math.round(H * S.dpr);
      };
      size(); this.ro = new ResizeObserver(size); this.ro.observe(el);
      this.stop = K.loop((dt) => this.frame(dt), FPS);
    },
    unmount() { if (this.stop) this.stop(); if (this.ro) this.ro.disconnect(); },

    // A leaf (with its label) for a blocked domain. fresh: falls from the tip; otherwise it is already resting.
    leaf(it, fresh, slot) {
      const S = this.s;
      const live = S.leaves.filter((l) => !l.out);
      if (slot != null) { /* seeded */ }
      else if (live.length < 3) { const used = new Set(live.map((l) => l.slot)); slot = [0, 1, 2].find((i) => !used.has(i)); }
      else { const old = live.reduce((a, b) => (a.born <= b.born ? a : b)); slot = old.slot; this.retire(old); }
      const T = TIPS[slot], lab = document.createElement("div");
      lab.className = "bz-tag"; lab.dataset.domain = it.domain;
      lab.innerHTML = `<b>${K.esc(it.domain)}</b><span></span>`;
      lab.style.left = `${T.rest[0] + 32}px`; lab.style.top = `${T.rest[1] - 28}px`; lab.style.maxWidth = `${602 - T.rest[0] - 32}px`;
      if (fresh) lab.classList.add("hid");
      S.labels.appendChild(lab);
      const lf = { it, slot, lab, age: lab.querySelector("span"), born: S.next++, u: fresh ? 0 : 1, fade: 1, out: false,
        img: S.leafImg[(Math.random() * 3) | 0], rot0: (Math.random() - 0.5) * 0.5, ph: Math.random() * 6.28,
        c: [Math.max(T.tip[0], T.rest[0]) + 34, T.tip[1] + 4] };
      S.leaves.push(lf);
      if (S.m) lf.age.textContent = K.short(K.ago(S.m, it));
    },
    retire(lf) { lf.out = true; lf.lab.classList.add("out"); },

    render(el, m) {
      const S = this.s, d = m.data || {}; S.m = m; S.rate.update(m);
      if (!S.seeded) {   // the 3 newest blocked domains start out as settled leaves, newest on the top tier
        S.seeded = true; S.news(m.ticker);
        const seed = m.ticker.slice(0, 3);   // oldest first, so the round-robin replaces the lowest tier first
        for (let i = seed.length - 1; i >= 0; i--) this.leaf(seed[i], false, i);
      } else {
        S.queue.push(...S.news(m.ticker));
        if (S.queue.length > 3) S.queue.splice(0, S.queue.length - 3);
      }
      for (const lf of S.leaves) lf.age.textContent = K.short(K.ago(m, lf.it));
      const st = K.q(el, "state"); st.textContent = m.pill.text; st.className = `bz-state ${m.pill.cls}`;
      const lab = K.q(el, "lab"); lab.textContent = m.labelAlert ? m.label : "Blocked / 24h"; lab.classList.toggle("alert", !!m.labelAlert);
      K.q(el, "blocked").textContent = K.num(d.blocked); K.q(el, "pct").textContent = K.pct(d.percent_blocked); K.q(el, "total").textContent = K.num(d.total);
      K.q(el, "pause").textContent = K.pauseText(m);
      K.q(el, "alv").textContent = m.allowedCount ? String(m.allowedCount) : "All";
      const mt = K.meta(m); K.q(el, "meta").textContent = `CPU ${mt.temp.replace("°", " ")} | Up ${mt.up}`;
      K.common(el, m);
      K.fit(K.q(el, "blocked"), 22); K.fit(K.q(el, "pct"), 22); K.fit(K.q(el, "total"), 22);
    },

    frame(dt) {
      const S = this.s, m = S.m; if (!m || m.asleep) return;
      S.t += dt;
      const off = m.paused || m.stale;
      S.dark += ((off ? 1 : 0) - S.dark) * Math.min(1, dt * 3);
      // spawn pulses at the (time-lapsed) query rate
      if (!off) {
        const r = S.rate.get(m);
        S.acc += dt * Math.min(2.6, 0.5 + r.q * 0.12);
        while (S.acc >= 1) {
          S.acc -= 1;
          if (S.pulses.length >= MAX_PULSES) continue;
          let x = Math.random() * S.wsum, ri = 0; while (x > S.routes[ri].w) { x -= S.routes[ri].w; ri++; }
          S.pulses.push({ r: S.routes[ri], d: 0, v: SPEED * (0.85 + Math.random() * 0.35) });
        }
        // release one queued leaf at a time
        S.gap -= dt;
        if (S.queue.length && S.gap <= 0) { this.leaf(S.queue.shift(), true); S.gap = 1.1; }
      }
      const ctx = S.ctx, k = S.k;
      ctx.setTransform(S.dpr * k, 0, 0, S.dpr * k, 0, 0); ctx.clearRect(0, 0, 800, 480);
      // foliage twinkles
      const twA = 1 - S.dark * 0.75;
      for (const p of S.twk) {
        const a = 0.25 + 0.75 * Math.max(0, Math.sin(S.t * p.sp + p.ph));
        ctx.globalAlpha = a * twA; ctx.drawImage(S.tw, p.x - 6, p.y - 6); ctx.drawImage(S.twc, p.x - 2, p.y - 2);
      }
      // data pulses
      const fadeAll = 1 - S.dark;
      for (let i = S.pulses.length - 1; i >= 0; i--) {
        const p = S.pulses[i]; p.d += p.v * dt;
        if (p.d >= p.r.len + 10 || fadeAll < 0.04) { S.pulses.splice(i, 1); continue; }
        const head = Math.min(p.d, p.r.len), endF = p.d > p.r.len - 30 ? Math.max(0, (p.r.len + 10 - p.d) / 40) : 1, a0 = Math.min(1, p.d / 30) * endF * fadeAll;
        for (let j = 2; j >= 1; j--) { const q = at(p.r, Math.max(0, head - j * 7)); ctx.globalAlpha = a0 * (0.45 - j * 0.12); ctx.drawImage(S.spark, q[0] - 4, q[1] - 4); }
        const q = at(p.r, head); ctx.globalAlpha = a0; ctx.drawImage(S.dot, q[0] - 10, q[1] - 10); ctx.drawImage(S.core, q[0] - 3, q[1] - 3);
      }
      // falling / resting leaves, their dashed trails and leader lines
      ctx.lineWidth = 1.2;
      for (let i = S.leaves.length - 1; i >= 0; i--) {
        const lf = S.leaves[i], T = TIPS[lf.slot];
        if (lf.out) { lf.fade -= dt * 0.8; if (lf.fade <= 0) { lf.lab.remove(); S.leaves.splice(i, 1); continue; } }
        if (lf.u < 1 && !m.paused) { lf.u = Math.min(1, lf.u + dt / 2.6); if (lf.u >= 1) lf.lab.classList.remove("hid"); }
        const e = 1 - Math.pow(1 - lf.u, 2);
        const fall = lf.u < 1, dim = (m.paused ? 0.55 : 1) * lf.fade;
        // dashed arc from the tip to where the leaf is now
        ctx.globalAlpha = dim; ctx.lineWidth = 1.5; ctx.strokeStyle = `rgb(${AMB})`; ctx.setLineDash([3, 4]); ctx.beginPath();
        const N = 14, to = Math.max(0.02, e);
        for (let s = 0; s <= N; s++) { const pt = bez(T.tip, lf.c, T.rest, (s / N) * to); if (s) ctx.lineTo(pt[0], pt[1]); else ctx.moveTo(pt[0], pt[1]); }
        ctx.stroke(); ctx.setLineDash([]);
        const pos = bez(T.tip, lf.c, T.rest, e), sw = fall ? Math.sin(S.t * 3.2 + lf.ph) * 5 * Math.sin(Math.PI * lf.u) : 0;
        const rot = lf.rot0 + 0.7 + (fall ? Math.sin(S.t * 2.6 + lf.ph) * 0.6 * (1 - lf.u) : 0);
        ctx.save(); ctx.translate(pos[0] + sw, pos[1]); ctx.rotate(rot); ctx.globalAlpha = dim; ctx.drawImage(lf.img, -17, -9, 34, 18); ctx.restore();
        if (!fall) {   // leader line to the label
          const x0 = T.rest[0] + 13, y0 = T.rest[1] - 5;
          ctx.globalAlpha = 0.8 * dim; ctx.strokeStyle = "#E9E1CC"; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + 12, y0 - 12); ctx.lineTo(x0 + 16, y0 - 12); ctx.stroke(); ctx.lineWidth = 1.2;
        }
      }
      ctx.globalAlpha = 1;
    },
  };

  window.PiSkins.add("bonsai", skin, "Bonsai", "Ad leaves fall from a circuit tree", K.T(
    '<rect width="160" height="96" fill="#050504"/>' +
    '<rect x="10" y="80" width="64" height="9" rx="3" fill="#3A3A36"/><path d="M12 80h60" stroke="#4E6B2E" stroke-width="3"/>' +
    '<path d="M38 80C40 66 30 60 32 50S48 36 58 32 78 28 90 34M34 56C44 50 56 52 72 50M40 68C50 64 58 66 66 66M33 46C26 42 22 40 16 40" fill="none" stroke="#7A5232" stroke-width="5" stroke-linecap="round"/>' +
    '<path d="M38 80C40 66 30 60 32 50S48 36 58 32 78 28 90 34M34 56C44 50 56 52 72 50M40 68C50 64 58 66 66 66" fill="none" stroke="#D88A46" stroke-width="1"/>' +
    '<g fill="#5FA548"><ellipse cx="60" cy="22" rx="16" ry="6"/><ellipse cx="88" cy="32" rx="10" ry="5"/><ellipse cx="74" cy="46" rx="11" ry="5"/><ellipse cx="64" cy="62" rx="9" ry="4"/><ellipse cx="18" cy="38" rx="10" ry="5"/><ellipse cx="26" cy="22" rx="11" ry="5"/></g>' +
    '<g fill="#9BFFC0"><circle cx="50" cy="35" r="1.6"/><circle cx="36" cy="58" r="1.6"/><circle cx="70" cy="30" r="1.6"/></g>' +
    '<path d="M92 36q8 6 6 14" fill="none" stroke="#FF963C" stroke-dasharray="2 2"/><ellipse cx="98" cy="52" rx="4" ry="2" fill="#F0A23A" transform="rotate(30 98 52)"/>' +
    '<path d="M118 10V88" stroke="#5E8C74" stroke-width=".8"/><g fill="#9FE8C0"><rect x="124" y="16" width="28" height="7"/><rect x="124" y="34" width="22" height="7"/><rect x="124" y="52" width="28" height="7"/></g>' +
    '<rect x="124" y="70" width="30" height="10" rx="2" fill="none" stroke="#9FE8C0"/>'));
})();
