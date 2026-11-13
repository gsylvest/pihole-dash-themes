// Mission Control: orange and ivory on charcoal, boxed numbered panels, a live filter-activity telemetry strip.
// Paused: telemetry goes to HOLD with a T- countdown. No agency logos or insignia.
(() => {
  "use strict";
  const K = window.PiSkinKit;
  const BARS = 36, BUCKET = 15;   // filter activity: 36 buckets of 15 s = the last 9 minutes of blocks
  const up = (s) => String(s).toUpperCase();
  const countdown = (m) => (m.pill.text.split("·")[1] || "").trim();

  const skin = {
    mount(el) {
      el.innerHTML = `
        <div class="mc-top"><i class="mc-sq"></i><b class="mc-brand">NETWORK CONTROL</b><i class="mc-vr"></i>
          <span class="mc-state" data-k="state"></span><span class="mc-sp"></span>
          <button class="mc-btn" data-act="allowed" data-k="allowed" type="button">ALLOWED<span class="n"></span></button>
          <button class="mc-btn" data-act="style" type="button">STYLE</button></div>
        <div class="mc-p mc-hero"><div class="mc-head"><span class="mc-lab" data-k="lab"></span><span class="mc-tag" data-k="tag">FILTER 01</span></div>
          <div class="mc-bigw"><div class="mc-big" data-k="blocked"></div></div><span class="mc-no">01</span></div>
        <div class="mc-p mc-s1"><div class="mc-vw"><div class="mc-v" data-k="pct"></div></div><div class="mc-k">BLOCKED</div><span class="mc-no">02</span></div>
        <div class="mc-p mc-s2"><div class="mc-vw"><div class="mc-v" data-k="total"></div></div><div class="mc-k">QUERIES / 24 H</div><span class="mc-no">03</span></div>
        <div class="mc-act"><span class="mc-al" data-k="actlab">FILTER ACTIVITY</span><div class="mc-bars" data-k="bars"></div><span class="mc-hold" data-k="hold"></span></div>
        <div class="mc-p mc-list fade"><div class="mc-lt">RECENT INTERCEPTS</div><ol data-k="list"></ol></div>
        <div class="mc-p mc-ctl"><div class="mc-lt" data-k="ctllab">BLOCKING CONTROL</div><button class="mc-pause" data-act="pause" data-k="pause" type="button"></button></div>
        <div class="mc-foot"><span data-k="temp"></span><span class="mc-met" data-k="met"></span><span data-k="up"></span></div>`;
      const bars = K.q(el, "bars");
      bars.innerHTML = "<i></i>".repeat(BARS);
      this.s = { bars: [...bars.children], done: null, hist: null, cur: 0, start: null, prev: null };
    },
    unmount() {},
    // Blocks counted per 15 s bucket from the change in the 24 h blocked counter between polls.
    telemetry(m) {
      const S = this.s, d = m.data || {};
      if (typeof d.blocked !== "number" || typeof m.now !== "number") return;
      const avg = (d.blocked / 86400) * BUCKET;
      if (!S.done) {   // pre-roll: the 24 h average with a little variation until real buckets arrive
        S.done = Array.from({ length: BARS - 1 }, (_, i) => ({ v: avg * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.7) + Math.sin(i * 0.53)) / 2), est: true }));
        S.start = Math.floor(m.now / BUCKET); S.prev = d.blocked; S.cur = 0;
      }
      const db = d.blocked - S.prev; S.prev = d.blocked;
      if (db > 0) S.cur += db;   // the 24 h counter can drop as old queries age out: ignore that
      const b = Math.floor(m.now / BUCKET);
      if (b > S.start) {
        S.done.push({ v: S.cur });
        for (let i = 1; i < Math.min(BARS, b - S.start); i++) S.done.push({ v: 0 });
        S.done = S.done.slice(-(BARS - 1)); S.cur = 0;
      }
      if (b !== S.start) S.start = b;
      S.hist = S.done.concat([{ v: S.cur, live: true }]);
    },
    render(el, m) {
      const d = m.data || {}, mt = K.meta(m), S = this.s, held = m.paused;
      this.telemetry(m);
      const st = K.q(el, "state"); st.textContent = held ? "HOLD" : up(m.pill.text); st.className = `mc-state ${held ? "warn" : m.pill.cls}`;
      const lab = K.q(el, "lab"); lab.textContent = up(K.heroLabel(m, "Blocked / last 24 h")); lab.classList.toggle("alert", m.labelAlert); lab.classList.toggle("warn", held && !m.labelAlert);
      K.q(el, "tag").textContent = held ? `HOLD · T-${countdown(m)}` : m.stale ? "NO SIGNAL" : "FILTER 01";
      K.q(el, "blocked").textContent = K.num(d.blocked);
      K.q(el, "pct").textContent = K.pct(d.percent_blocked);
      K.q(el, "total").textContent = K.num(d.total);
      // telemetry strip
      if (S.hist) {
        const max = Math.max(1, ...S.hist.map((h) => h.v));
        S.bars.forEach((b, i) => {
          const h = S.hist[i], f = held ? 0.12 : 0.2 + 0.8 * Math.min(1, h.v / max);
          b.style.transform = `scaleY(${f.toFixed(3)})`;
          b.className = held ? "" : h.live ? "live" : h.est ? "est" : "on";
        });
      }
      K.q(el, "actlab").textContent = held ? "TELEMETRY" : "FILTER ACTIVITY";
      K.q(el, "hold").textContent = held ? `HOLD · T-${countdown(m)}` : "";
      K.q(el, "list").innerHTML = m.ticker.slice(0, 3).map((it) =>
        `<li data-domain="${K.esc(it.domain)}"><span class="d">${K.esc(it.domain)}</span><span class="t">${K.esc(K.ago(m, it))}</span></li>`).join("")
        || '<li class="empty">NO INTERCEPTS YET</li>';
      K.q(el, "ctllab").textContent = held ? `HOLD · RESUMES T-${countdown(m)}` : "BLOCKING CONTROL";
      K.q(el, "pause").textContent = K.pauseText(m);
      K.q(el, "temp").textContent = `CPU ${up(mt.temp)}`;
      K.q(el, "met").textContent = typeof d.gravity_size === "number" ? `LIST ${K.num(d.gravity_size)}` : "";
      K.q(el, "up").textContent = `UP ${mt.up}`;
      K.common(el, m);
      const a = K.q(el, "allowed"); if (a) a.querySelector(".n").textContent = m.allowedCount ? ` ${m.allowedCount}` : "";
      K.fit(K.q(el, "blocked"), 60); K.fit(K.q(el, "pct"), 28); K.fit(K.q(el, "total"), 28);
    },
  };

  window.PiSkins.add("mission", skin, "Mission Control", "Telemetry, orange on charcoal", K.T(
    '<rect width="160" height="96" fill="#1B1B1A"/><rect x="5" y="5" width="6" height="6" fill="#F0662A"/>' +
    '<text x="15" y="11" font-size="7" font-weight="800" fill="#EFEADF" font-family="Inter Tight" letter-spacing="1">NETWORK CONTROL</text>' +
    '<line x1="0" y1="15" x2="160" y2="15" stroke="#EFEADF" stroke-width=".6"/>' +
    '<rect x="4" y="19" width="96" height="40" fill="none" stroke="#EFEADF" stroke-width=".8"/>' +
    '<text x="8" y="53" font-size="30" font-weight="800" fill="#EFEADF" font-family="Inter Tight" transform="scale(.8 1)" transform-origin="8 53" letter-spacing="-1">12,416</text>' +
    '<rect x="104" y="19" width="52" height="19" fill="none" stroke="#EFEADF" stroke-width=".8"/><text x="108" y="32" font-size="10" font-weight="800" fill="#EFEADF" font-family="Inter Tight">21.3%</text>' +
    '<rect x="104" y="40" width="52" height="19" fill="none" stroke="#EFEADF" stroke-width=".8"/><text x="108" y="53" font-size="10" font-weight="800" fill="#EFEADF" font-family="Inter Tight">58,246</text>' +
    '<g fill="#F0662A"><rect x="44" y="63" width="4" height="4"/><rect x="50" y="62" width="4" height="5"/><rect x="56" y="64" width="4" height="3"/><rect x="62" y="62" width="4" height="5"/><rect x="68" y="63" width="4" height="4"/><rect x="74" y="61" width="4" height="6"/><rect x="80" y="63" width="4" height="4"/><rect x="86" y="62" width="4" height="5"/><rect x="92" y="64" width="4" height="3"/><rect x="98" y="62" width="4" height="5"/><rect x="104" y="63" width="4" height="4"/><rect x="110" y="61" width="4" height="6"/><rect x="116" y="63" width="4" height="4"/><rect x="122" y="62" width="4" height="5"/><rect x="128" y="64" width="4" height="3"/><rect x="134" y="62" width="4" height="5"/><rect x="140" y="63" width="4" height="4"/><rect x="146" y="62" width="4" height="5"/></g>' +
    '<rect x="4" y="71" width="90" height="21" fill="none" stroke="#EFEADF" stroke-width=".8"/><rect x="8" y="76" width="60" height="2" fill="#8C877E"/><rect x="8" y="82" width="50" height="2" fill="#8C877E"/>' +
    '<rect x="98" y="71" width="58" height="21" fill="none" stroke="#EFEADF" stroke-width=".8"/><rect x="101" y="76" width="52" height="13" fill="#F0662A"/>'));
})();
