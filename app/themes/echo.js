// ECHO: a phosphor oscilloscope. TRAFFIC trace scrolls right-to-left with peaks that follow the live query
// rate; the BLOCKED trace gets one amber, labelled spike per newly blocked domain. Pausing holds both traces
// (TRIG STOP) and shows the countdown. Grid pre-rendered once; traces are 2 short paths per frame. 20 fps cap.
(() => {
  "use strict";
  const K = window.PiSkinKit;
  const SP = 2;                // px between samples
  const SPEED = 36;            // px per second (a 600 px screen holds ~17 s)
  const PH = "120,240,160", AMB = "255,184,64";
  const countdown = (m) => (m.pill.text.split("·")[1] || "").trim();

  function drawGrid(c, W, H, dpr) {
    c.width = W * dpr; c.height = H * dpr;
    const g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#06120C"; g.fillRect(0, 0, W, H);
    const cell = W / 24;
    g.lineWidth = 1;
    for (let i = 0; i <= 24; i++) { const x = Math.round(i * cell) + 0.5; g.strokeStyle = `rgba(${PH},${i % 4 ? 0.09 : 0.16})`; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0, i = 0; y <= H + 0.5; y += cell, i++) { const yy = Math.round(y) + 0.5; g.strokeStyle = `rgba(${PH},${i % 4 ? 0.09 : 0.16})`; g.beginPath(); g.moveTo(0, yy); g.lineTo(W, yy); g.stroke(); }
    g.strokeStyle = `rgba(${PH},.32)`; g.strokeRect(0.5, 0.5, W - 1, H - 1);
    // a faint phosphor bloom in the middle of the tube
    const b = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6);
    b.addColorStop(0, "rgba(120,240,160,.05)"); b.addColorStop(1, "rgba(120,240,160,0)");
    g.fillStyle = b; g.fillRect(0, 0, W, H);
  }

  const skin = {
    mount(el) {
      el.innerHTML = `
        <div class="ec-top"><b class="ec-title">pi-hole / scope</b><span class="ec-sp"></span><span class="ec-state" data-k="state"></span>
          <button class="ec-allowed" data-act="allowed" data-k="allowed" type="button">Allowed<span class="n"></span></button>
          <button class="ec-style" data-act="style" type="button"><span>Style</span></button></div>
        <div class="ec-scope"><canvas class="ec-grid"></canvas><canvas class="ec-cv"></canvas>
          <div class="ec-ch t">TRAFFIC</div><div class="ec-ch b">BLOCKED</div>
          <div class="ec-labels fade"></div>
          <div class="ec-hold"><span class="ec-hk">TRIG STOP</span><span class="ec-hv" data-k="cd"></span><span class="ec-hs" data-k="hl">Blocking paused</span></div>
          <div class="ec-run">RUN</div></div>
        <div class="ec-col fade">
          <div class="ec-stat"><div class="ec-v" data-k="blocked"></div><div class="ec-k" data-k="lab">Blocked / 24h</div></div>
          <div class="ec-stat"><div class="ec-v" data-k="pct"></div><div class="ec-k">Blocked</div></div>
          <div class="ec-stat"><div class="ec-v" data-k="total"></div><div class="ec-k">Queries / 24h</div></div>
          <span class="ec-sp"></span>
          <button class="ec-pause" data-act="pause" data-k="pause" type="button"></button>
          <div class="ec-meta" data-k="meta"></div>
        </div>`;
      const host = el.querySelector(".ec-scope"), grid = el.querySelector(".ec-grid"), cv = el.querySelector(".ec-cv");
      const S = this.s = { m: null, ctx: cv.getContext("2d"), rate: K.rateTracker(), news: K.newsTracker(), seeded: false,
        tr: [], bl: [], futT: new Float32Array(48), futB: new Float32Array(8), n: 0, frac: 0, N: 0, W: 0, H: 0, dpr: 1,
        spikes: [], frozen: false, labels: el.querySelector(".ec-labels") };
      const size = () => {
        const W = host.clientWidth, H = host.clientHeight; if (!W || !H) return;
        S.dpr = Math.min(2, window.devicePixelRatio || 1); S.W = W; S.H = H; S.N = Math.ceil(W / SP) + 3;
        S.yT = Math.round(H * 0.42); S.aT = H * 0.22; S.yB = Math.round(H * 0.80); S.aB = H * 0.085;
        cv.width = W * S.dpr; cv.height = H * S.dpr; drawGrid(grid, W, H, S.dpr);
        while (S.tr.length < S.N) { this.sample(0); }
        S.frozen = false;
      };
      size(); this.ro = new ResizeObserver(size); this.ro.observe(host);
      this.stop = K.loop((dt) => this.frame(dt), 20);
    },
    unmount() { if (this.stop) this.stop(); if (this.ro) this.ro.disconnect(); },

    // One new sample on each trace. lam = traffic bursts per sample.
    sample(lam) {
      const S = this.s, fT = S.futT, fB = S.futB;
      if (lam === 0 && S.m) lam = this.lam();
      if (lam === 0) lam = 0.06;
      if (Math.random() < lam) {   // a burst of queries: one or two soft peaks a few samples ahead
        const bump = (c, sg, h) => { for (let j = 0; j < fT.length; j++) { const z = (j - c) / sg; fT[j] += h * Math.exp(-0.5 * z * z); } };
        const h = 0.18 + Math.pow(Math.random(), 1.6) * 0.82, c = 10 + Math.random() * 6, sg = 1.3 + Math.random() * 1.1;
        bump(c, sg, h);
        if (Math.random() < 0.45) bump(c + 4 + Math.random() * 4, sg, h * (0.6 + Math.random() * 0.5));
      }
      const t = fT[0] + (Math.random() - 0.5) * 0.035; fT.copyWithin(0, 1); fT[fT.length - 1] = 0;
      const b = fB[0] + (Math.random() - 0.5) * 0.09; fB.copyWithin(0, 1); fB[fB.length - 1] = 0;
      S.tr.push(Math.tanh(t * 1.15) * 0.95); S.bl.push(b); S.n++;
      if (S.tr.length > S.N) { S.tr.shift(); S.bl.shift(); }
    },
    lam() {   // bursts per sample from the live query rate (time-lapsed, bounded)
      const S = this.s, r = S.rate.get(S.m);
      return Math.min(0.11, Math.max(0.025, (0.25 + r.q * 0.4) * SP / SPEED));
    },
    spike(it, id, fresh) {
      const S = this.s, key = `${it.domain}|${it.seen_at}`;
      if (S.spikes.some((s) => s.key === key)) return;
      const lab = document.createElement("div");
      lab.className = "ec-tag"; lab.dataset.domain = it.domain;
      lab.innerHTML = `<b>${K.esc(it.domain)}</b><span></span>`;
      S.labels.appendChild(lab);
      const sp = { key, it, id, lab, t: lab.querySelector("span"), x: null, mw: -1 };
      S.spikes.push(sp);
      if (fresh) { S.futB[1] += 0.45; S.futB[2] += 1; S.futB[3] += 0.4; sp.id = S.n + 3; }
      else {   // seeded from history: write the spike straight into the buffer
        const i = S.bl.length - 1 - (S.n - id);
        if (i > 1 && i < S.bl.length - 1) { S.bl[i] += 1; S.bl[i - 1] += 0.45; S.bl[i + 1] += 0.4; }
      }
      lab.style.top = `${Math.round(S.yB - S.aB - 64)}px`; lab.style.transform = "translateX(-999px)";
      S.frozen = false;   // place the new label even while the traces hold
      S.spikes.sort((a, b) => a.id - b.id);
      while (S.spikes.length > 8) this.dropSpike(S.spikes[0]);
    },
    dropSpike(sp) { const S = this.s; sp.lab.remove(); S.spikes.splice(S.spikes.indexOf(sp), 1); },

    render(el, m) {
      const S = this.s, d = m.data || {}; S.m = m; S.rate.update(m);
      if (!S.seeded) {
        S.seeded = true; S.news(m.ticker);
        for (const it of m.ticker) {
          const age = it.seen_at == null ? null : m.now - it.seen_at; if (age == null || age < 0) continue;
          const back = Math.round((age * SPEED) / SP); if (back < S.N - 4) this.spike(it, S.n - back, false);
        }
      } else for (const it of S.news(m.ticker)) this.spike(it, 0, true);
      for (const sp of S.spikes) sp.t.textContent = K.short(K.ago(m, sp.it));
      const st = K.q(el, "state"); st.textContent = m.pill.text; st.className = `ec-state ${m.pill.cls}`;
      const lab = K.q(el, "lab"); lab.textContent = m.labelAlert ? m.label : "Blocked / 24h"; lab.classList.toggle("alert", m.labelAlert);
      K.q(el, "blocked").textContent = K.num(d.blocked); K.q(el, "pct").textContent = K.pct(d.percent_blocked); K.q(el, "total").textContent = K.num(d.total);
      K.q(el, "pause").textContent = K.pauseText(m);
      K.q(el, "cd").textContent = countdown(m) || "–:––";
      K.q(el, "hl").textContent = m.labelAlert ? m.label : "Blocking paused";
      const mt = K.meta(m); K.q(el, "meta").textContent = `CPU ${mt.temp.replace("°", " ")} | Up ${mt.up}`;
      K.common(el, m);
      K.fit(K.q(el, "blocked"), 22); K.fit(K.q(el, "pct"), 22); K.fit(K.q(el, "total"), 22);
      if (!m.paused) S.frozen = false;
    },

    frame(dt) {
      const S = this.s, m = S.m; if (!m || m.asleep || !S.W) return;
      if (m.paused && S.frozen) return;   // TRIG STOP: the traces hold, nothing to redraw
      if (!m.paused) {
        S.frac += SPEED * dt;
        while (S.frac >= SP) { S.frac -= SP; this.sample(m.stale ? 0.01 : 0); }
      }
      const ctx = S.ctx, W = S.W, N = S.tr.length, x0 = W - (N - 1) * SP - S.frac;
      ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0); ctx.clearRect(0, 0, W, S.H);
      ctx.lineJoin = "round";
      const path = (buf, y0, amp, a, b) => {
        ctx.beginPath();
        for (let i = a; i <= b; i++) { const x = x0 + i * SP, y = y0 - buf[i] * amp; if (i === a) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      };
      const glow = (rgb, w) => { ctx.strokeStyle = `rgba(${rgb},.16)`; ctx.lineWidth = w; ctx.stroke(); ctx.strokeStyle = `rgba(${rgb},.95)`; ctx.lineWidth = 1.6; ctx.stroke(); };
      path(S.tr, S.yT, S.aT, 0, N - 1); glow(PH, 6);
      path(S.bl, S.yB, S.aB, 0, N - 1); glow(PH, 5);
      // amber spikes, leader lines and their labels
      ctx.lineWidth = 1;
      for (const sp of S.spikes.slice()) {
        const i = N - 1 - (S.n - sp.id), x = x0 + i * SP;
        if (x < -230) { this.dropSpike(sp); continue; }
        if (i - 3 >= 0 && i + 3 < N) { path(S.bl, S.yB, S.aB, i - 3, i + 3); glow(AMB, 5); }
        const top = S.yB - S.aB - 2;
        ctx.strokeStyle = `rgba(${AMB},.9)`; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + 14, top - 26); ctx.stroke();
        const lx = Math.round(x + 12);
        if (lx !== sp.x) { sp.x = lx; sp.lab.style.transform = `translateX(${lx}px)`; }
      }
      // a label never runs into the next (newer) one: clip it to the gap, hide it when the gap is tiny
      for (let k = 0; k < S.spikes.length; k++) {
        const sp = S.spikes[k], nx = S.spikes[k + 1];
        const gap = nx && nx.x != null && sp.x != null ? nx.x - sp.x - 8 : 200;
        const mw = Math.max(0, Math.min(200, Math.round(gap / 8) * 8));
        if (mw !== sp.mw) { sp.mw = mw; sp.lab.style.maxWidth = `${mw}px`; sp.lab.style.visibility = mw < 48 ? "hidden" : ""; }
      }
      if (m.paused) S.frozen = true;
    },
  };

  window.PiSkins.add("echo", skin, "Echo", "Traffic on an oscilloscope", K.T(
    '<rect width="160" height="96" fill="#040A07"/><rect x="2" y="12" width="110" height="82" fill="#06120C" stroke="#78F0A0" stroke-opacity=".3"/>' +
    '<g stroke="#78F0A0" stroke-opacity=".1"><path d="M2 32H112M2 52H112M2 72H112M22 12V94M42 12V94M62 12V94M82 12V94M102 12V94"/></g>' +
    '<text x="4" y="9" font-size="7" fill="#9BEFB8" font-family="Menlo, monospace">pi-hole / scope</text>' +
    '<path d="M2 46 L18 46 L21 38 L24 46 L34 46 L37 32 L40 46 L43 36 L46 46 L60 46 L64 26 L68 46 L72 34 L75 46 L90 46 L93 38 L96 46 L112 46" fill="none" stroke="#78F0A0" stroke-width="1.2"/>' +
    '<path d="M2 80 L112 80" stroke="#78F0A0" stroke-width="1"/><g stroke="#FFB840" stroke-width="1.2" fill="none"><path d="M30 80 L32 72 L34 80M70 80 L72 72 L74 80"/><path d="M32 72 L36 66M72 72 L76 66"/></g>' +
    '<rect x="118" y="20" width="34" height="7" fill="#A6F5C2"/><rect x="118" y="34" width="26" height="7" fill="#A6F5C2"/><rect x="118" y="48" width="34" height="7" fill="#A6F5C2"/>' +
    '<rect x="118" y="68" width="38" height="12" rx="2" fill="none" stroke="#FFB840"/>'));
})();
