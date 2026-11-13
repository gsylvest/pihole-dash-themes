// Filter Ops: a navy-black terminal ops board drawn with ASCII box rules. Two panes show the real recent blocked
// domains (01 incoming with their time, 02 the filter result), 03 is a time-lapsed activity chart of # characters
// (cyan = queries, amber = blocked) sampled from the change in the 24 h counters. Only blocked names are ever shown.
// Paused: status turns amber with the countdown, results read [OFF], the footer button becomes Resume.
(() => {
  "use strict";
  const K = window.PiSkinKit;
  const ROWS = 6;            // domain rows per pane
  const ROW_H = 23;          // px, keep in step with .fo-rows li height
  const COLS = 30;           // activity buckets
  const BUCKET = 6;          // seconds of real traffic per bucket (three polls); the chart steps every 6 s
  const LEVELS = 6;          // # rows in a full-height column
  const up = (s) => String(s).toUpperCase();
  const clock = (ts) => { if (ts == null) return "--:--:--"; const t = new Date(ts * 1000); return [t.getHours(), t.getMinutes(), t.getSeconds()].map((x) => String(x).padStart(2, "0")).join(":"); };
  const keyOf = (it) => `${it.domain}|${it.seen_at}`;
  const countdown = (m) => (m.pill.text.split("·")[1] || "").trim();
  const hr = (cls = "") => `<i class="fo-hr ${cls}"></i>`;

  const skin = {
    mount(el) {
      el.innerHTML = `
        <div class="fo-top"><span class="fo-title">filter-ops / live</span><span class="fo-bar">|</span><span class="fo-state" data-k="state"></span><span class="fo-sp"></span>
          <button class="fo-btn" data-act="allowed" data-k="allowed" type="button">[allowed<span class="n"></span>]</button><button class="fo-btn" data-act="style" type="button">[style]</button></div>
        <i class="fo-rule r1"></i>
        <div class="fo-stats"><span class="fo-sl" data-k="stats"></span><span class="fo-last">LAST 24H</span></div>
        <i class="fo-rule r2"></i>
        <div class="fo-box fo-in">${hr("t")}<div class="fo-h">01 / INCOMING</div>${hr()}<div class="fo-rows fade"><ol data-k="in"></ol></div>${hr("b")}</div>
        <div class="fo-box fo-res">${hr("t")}<div class="fo-h"><span>02 / FILTER RESULTS</span><span class="fo-hs" data-k="reshint"></span></div>${hr()}<div class="fo-rows fade"><ol data-k="res"></ol></div>${hr("b")}</div>
        <div class="fo-box fo-act">${hr("t")}<div class="fo-h"><span>03 / RECENT ACTIVITY</span><span class="fo-leg"><em class="c">cyan: queries</em> / <em class="a">amber: blocked</em></span></div>${hr()}
          <div class="fo-chartw"><div class="fo-chart" data-k="chart"></div></div>${hr("b")}</div>
        <i class="fo-rule r3"></i>
        <div class="fo-foot"><span class="fo-prompt"><span data-k="prompt"></span><i class="fo-cur"></i></span><span class="fo-sp"></span>
          <span class="fo-meta" data-k="meta"></span><button class="fo-pause" data-act="pause" data-k="pause" type="button"></button></div>`;
      this.s = { keys: [], fresh: new Map(), timers: new Set(), hist: null, cur: { q: 0, b: 0 }, bucket: null, prev: null, paused: null, chartKey: "" };
    },
    unmount() { if (this.s) { this.s.timers.forEach(clearTimeout); this.s.timers.clear(); } },

    // Activity: queries and blocks per BUCKET seconds from the change in the 24 h counters between polls.
    sample(m) {
      const S = this.s, d = m.data || {};
      if (typeof d.total !== "number" || typeof d.blocked !== "number" || typeof m.now !== "number") return false;
      if (!S.hist) {   // start flat at the 24 h average; real buckets push it off the left edge
        const q = (d.total / 86400) * BUCKET, b = (d.blocked / 86400) * BUCKET;
        S.hist = Array.from({ length: COLS - 1 }, () => ({ q, b, est: true }));
        S.bucket = Math.floor(m.now / BUCKET); S.prev = { q: d.total, b: d.blocked }; S.partial = true;
        return true;
      }
      const dq = d.total - S.prev.q, db = d.blocked - S.prev.b; S.prev = { q: d.total, b: d.blocked };
      if (dq >= 0 && db >= 0 && db <= dq) { S.cur.q += dq; S.cur.b += db; }   // counters can drop as old queries age out: skip
      const bk = Math.floor(m.now / BUCKET);
      if (bk <= S.bucket) return false;
      if (S.partial) { S.partial = false; S.cur = { q: 0, b: 0 }; S.bucket = bk; return false; }   // the first bucket started mid-way: drop it
      S.hist.push({ q: S.cur.q, b: S.cur.b });
      for (let i = 1; i < Math.min(COLS, bk - S.bucket); i++) S.hist.push({ q: 0, b: 0 });   // missed buckets (screen asleep etc.)
      S.hist = S.hist.slice(-(COLS - 1)); S.cur = { q: 0, b: 0 }; S.bucket = bk;
      return true;
    },
    drawChart(el, m, shifted) {
      const S = this.s, d = m.data || {}, chart = K.q(el, "chart");
      const cols = S.hist.concat([{ q: S.cur.q, b: S.cur.b, live: true }]);
      const avg = ((d.total || 0) / 86400) * BUCKET;
      const scale = Math.max(1, avg * 1.8, ...cols.slice(0, -1).map((c) => c.q));
      const html = cols.map((c) => {
        let h = c.q > 0 ? Math.max(1, Math.round((Math.min(c.q, scale) / scale) * LEVELS)) : 0;
        let hb = h ? Math.round(h * (c.b / c.q)) : 0;
        if (!hb && c.b > 0 && h >= 3) hb = 1;   // a sliver of blocks still shows on a tall column
        if (c.live) { h = Math.min(h, LEVELS); hb = Math.min(hb, h); }
        const cells = "<b class=\"a\">##</b>".repeat(hb) + "<b class=\"c\">##</b>".repeat(h - hb);
        return `<i class="${c.est ? "est" : c.live ? "live" : ""}">${cells || "<b class=\"z\">..</b>"}</i>`;
      }).join("");
      if (html === S.chartKey) return;
      S.chartKey = html; chart.innerHTML = html;
      if (shifted && !S.first) {   // step the whole chart one column left
        chart.classList.remove("go"); chart.classList.add("shift"); void chart.offsetWidth; chart.classList.remove("shift"); chart.classList.add("go");
      }
      S.first = false;
    },

    rows(el, m) {
      const S = this.s, paused = m.paused, items = m.ticker.slice(0, ROWS).reverse();   // log order: newest at the bottom
      const keys = items.map(keyOf), was = new Set(S.keys);
      const fresh = S.keys.length ? keys.filter((k) => !was.has(k)) : [];
      const now = performance.now();
      fresh.forEach((k) => {
        S.fresh.set(k, now);
        const t = setTimeout(() => { S.timers.delete(t); S.fresh.delete(k); const r = el.querySelector(`.fo-res li[data-key="${CSS.escape(k)}"] .tag`);
          if (r && !this.lastPaused) { r.textContent = "[BLOCK]"; r.className = "tag bk"; } }, 1000);
        S.timers.add(t);
      });
      const sig = keys.join("\n") + (paused ? "|p" : "");
      if (sig === S.sig) return;
      S.sig = sig; S.keys = keys;
      const inEl = K.q(el, "in"), resEl = K.q(el, "res");
      if (!items.length) {
        inEl.innerHTML = '<li class="empty">--:--:--&nbsp; waiting for blocks...</li>';
        resEl.innerHTML = `<li class="empty">${paused ? "[OFF]&nbsp;&nbsp; filter paused" : "[IDLE]&nbsp; nothing blocked yet"}</li>`;
        return;
      }
      inEl.innerHTML = items.map((it) => `<li data-domain="${K.esc(it.domain)}" class="${fresh.includes(keyOf(it)) ? "new" : ""}"><span class="ts">${clock(it.seen_at)}</span><span class="d">${K.esc(it.domain)}</span></li>`).join("");
      resEl.innerHTML = items.map((it) => {
        const k = keyOf(it), checking = S.fresh.has(k) && now - S.fresh.get(k) < 1000;
        const tag = paused ? '<span class="tag off">[OFF]</span>' : checking ? '<span class="tag ck">[CHECK]</span>' : '<span class="tag bk">[BLOCK]</span>';
        return `<li data-domain="${K.esc(it.domain)}" data-key="${K.esc(k)}" class="${fresh.includes(k) ? "new" : ""}">${tag}<span class="d">${K.esc(it.domain)}</span></li>`;
      }).join("");
      const n = Math.min(fresh.length, ROWS);
      if (n) [inEl, resEl].forEach((ol) => {   // slide the log up by the new rows
        ol.classList.remove("go"); ol.style.transform = `translateY(${n * ROW_H}px)`; void ol.offsetWidth;
        ol.classList.add("go"); ol.style.transform = "";
      });
    },

    render(el, m) {
      const d = m.data || {}, mt = K.meta(m), S = this.s, paused = m.paused;
      this.lastPaused = paused;
      const st = K.q(el, "state");
      st.textContent = paused ? `PAUSED ${countdown(m)}`.trim() : up(m.pill.text.replace(" · ", " "));
      st.className = `fo-state ${paused ? "warn" : m.pill.cls}`;
      K.q(el, "stats").textContent = `BLOCKED ${K.num(d.blocked)} | SHARE ${K.pct(d.percent_blocked)} | QUERIES ${K.num(d.total)}`;
      K.q(el, "reshint").textContent = paused ? "filter paused" : "";
      if (!m.asleep) {
        const shifted = this.sample(m);
        if (S.hist) this.drawChart(el, m, shifted);
      }
      this.rows(el, m);
      K.q(el, "prompt").textContent = m.labelAlert ? `> ${m.label.toLowerCase()}`
        : paused ? `> filter paused ${countdown(m)}` : "> watching requests...";
      K.q(el, "meta").textContent = `cpu ${mt.temp.replace("°", " ").replace(/\s+/g, " ")} | up ${mt.up.replace(/\s+/g, "")} |`;
      K.q(el, "pause").textContent = m.button.mode === "pause" ? "[ PAUSE 5m ]" : `[ ${up(K.resumeText(m))} ]`;
      K.common(el, m);
      K.fit(K.q(el, "stats"), 13);
    },
  };

  window.PiSkins.add("filterops", skin, "Filter Ops", "Split panes: requests, results, activity", K.T(
    '<rect width="160" height="96" fill="#070B16"/>' +
    '<g font-family="Menlo, monospace" font-weight="700" font-size="6.5"><text x="5" y="9" fill="#E6EAF2">filter-ops / live |</text><circle cx="78" cy="7" r="1.8" fill="#7BE07B"/><text x="82" y="9" fill="#7BE07B">BLOCKING</text>' +
    '<text x="5" y="20" fill="#E6EAF2" font-size="5.6">BLOCKED 12,416 | SHARE 21.3%</text><text x="133" y="20" fill="#4FD8E8" font-size="5.6">LAST 24H</text></g>' +
    '<rect x="0" y="12.5" width="160" height=".8" fill="#C9CFDA"/><rect x="0" y="23" width="160" height=".8" fill="#C9CFDA"/>' +
    '<g fill="none" stroke="#C9CFDA" stroke-width=".8" stroke-dasharray="2 1.2"><rect x="4" y="27" width="74" height="34"/><rect x="82" y="27" width="74" height="34"/><rect x="4" y="64" width="152" height="20"/></g>' +
    '<g fill="#8A93A6"><rect x="8" y="38" width="12" height="2"/><rect x="8" y="44" width="12" height="2"/><rect x="8" y="50" width="12" height="2"/></g>' +
    '<g fill="#E6EAF2"><rect x="23" y="38" width="44" height="2"/><rect x="23" y="44" width="36" height="2"/><rect x="23" y="50" width="40" height="2"/><rect x="104" y="38" width="44" height="2"/><rect x="104" y="44" width="36" height="2"/><rect x="104" y="50" width="40" height="2"/></g>' +
    '<g fill="#F07A6E"><rect x="86" y="38" width="15" height="2"/><rect x="86" y="44" width="15" height="2"/></g><rect x="86" y="50" width="15" height="2" fill="#F5B935"/>' +
    '<g fill="#4FD8E8"><rect x="10" y="76" width="4" height="5"/><rect x="18" y="72" width="4" height="9"/><rect x="26" y="74" width="4" height="7"/><rect x="42" y="73" width="4" height="8"/><rect x="58" y="75" width="4" height="6"/><rect x="74" y="71" width="4" height="10"/><rect x="90" y="74" width="4" height="7"/><rect x="106" y="72" width="4" height="9"/><rect x="122" y="75" width="4" height="6"/><rect x="138" y="73" width="4" height="8"/></g>' +
    '<g fill="#F5B935"><rect x="34" y="77" width="4" height="4"/><rect x="50" y="78" width="4" height="3"/><rect x="66" y="77" width="4" height="4"/><rect x="82" y="78" width="4" height="3"/><rect x="98" y="77" width="4" height="4"/><rect x="114" y="78" width="4" height="3"/><rect x="130" y="77" width="4" height="4"/><rect x="146" y="78" width="4" height="3"/></g>' +
    '<g font-family="Menlo, monospace" font-weight="700" font-size="5.6"><text x="5" y="93" fill="#E6EAF2">&gt; watching...</text><rect x="47" y="88" width="3" height="5" fill="#F5B935"/><text x="118" y="93" fill="#4FD8E8">[ PAUSE 5m ]</text></g>'));
})();
