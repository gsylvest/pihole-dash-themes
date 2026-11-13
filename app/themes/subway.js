// Network Express: an original transit-diagram take on the dashboard. Thick coloured lines run Home/Devices -> Filter -> Internet;
// a red line branches to Blocked, its stations named after the latest blocked domains. Little trains run the lines (time-lapsed):
// allowed ones continue to Internet, blocked ones divert down the red branch. Paused: service-change notice, red line greyed.
(() => {
  "use strict";
  const K = window.PiSkinKit;
  const NS = "http://www.w3.org/2000/svg";
  const W = 584, H = 416;   // map area in px (the panel is always 800×480)
  const FILTER = [225, 142];
  const ROUTE = {
    home: [[69, 76], [160, 76], FILTER],
    dev: [[39, 212], [155, 212], FILTER],
    net: [FILTER, [537, 142]],
    red: [FILTER, [257, 196], [258, 222], [301, 258], [302, 282], [343, 316], [344, 338], [377, 371], [411, 371]],
  };
  const STOPS = [[257, 196], [301, 258], [343, 316]];   // newest blocked domain sits nearest the Filter
  const MAXT = 12;
  const pts = (p) => p.map((q) => q.join(",")).join(" ");
  const countdown = (m) => (m.pill.text.split("·")[1] || "").trim();

  // polyline with cumulative lengths, for placing trains
  function track(points) {
    const seg = []; let L = 0;
    for (let i = 1; i < points.length; i++) {
      const [x0, y0] = points[i - 1], [x1, y1] = points[i], l = Math.hypot(x1 - x0, y1 - y0);
      seg.push({ x0, y0, x1, y1, l, a: L, ang: Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI }); L += l;
    }
    return { seg, L, at(d) {
      d = Math.max(0, Math.min(L, d));
      const s = seg.find((z) => d <= z.a + z.l) || seg[seg.length - 1], f = s.l ? (d - s.a) / s.l : 0;
      return [s.x0 + (s.x1 - s.x0) * f, s.y0 + (s.y1 - s.y0) * f, s.ang];
    } };
  }
  const T = { home: track(ROUTE.home), dev: track(ROUTE.dev), net: track(ROUTE.net), red: track(ROUTE.red) };

  const station = (x, y, r, cls = "") => `<circle class="sx-st ${cls}" cx="${x}" cy="${y}" r="${r}"/>`;
  const MAP = `
    <svg class="sx-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
      <polyline class="sx-ln home" points="${pts(ROUTE.home)}"/>
      <polyline class="sx-ln net" points="${pts(ROUTE.net)}"/>
      <polyline class="sx-ln dev" points="${pts(ROUTE.dev)}"/>
      <polyline class="sx-ln red" points="${pts(ROUTE.red)}"/>
      <g data-k="trains"></g>
      ${station(69, 76, 11)}${station(39, 212, 11)}${station(537, 142, 11)}${station(411, 371, 11, "end")}
      ${STOPS.map(([x, y], i) => `<circle class="sx-ring" data-k="ring${i}" cx="${x}" cy="${y}" r="11"/>`).join("")}
      ${STOPS.map(([x, y], i) => station(x, y, 10, `stop s${i}`)).join("")}
      ${station(225, 142, 17, "hub")}
      <g class="sx-bul home"><circle cx="27" cy="44" r="17"/><text x="27" y="51.5">H</text></g>
      <g class="sx-bul red"><circle cx="550" cy="371" r="17"/><text x="550" y="378.5">X</text></g>
    </svg>`;

  const skin = {
    mount(el) {
      el.innerHTML = `
        <div class="sx-top"><b class="sx-brand">Network Express</b><i class="sx-vr"></i><span class="sx-pi">Pi-hole</span><i class="sx-vr"></i>
          <span class="sx-state" data-k="state"></span><span class="sx-sp"></span>
          <button class="sx-btn" data-act="allowed" data-k="allowed" type="button">Allowed<span class="n"></span></button>
          <button class="sx-btn" data-act="style" type="button">Style</button></div>
        <div class="sx-map">${MAP}
          <span class="sx-name home">Home</span><span class="sx-name dev">Devices</span><span class="sx-name hub">Filter</span>
          <span class="sx-name net">Internet</span><span class="sx-name end">Blocked</span>
          ${STOPS.map((_, i) => `<div class="sx-stop fade s${i}" data-k="stop${i}"><b></b><span></span></div>`).join("")}
          <div class="sx-notice" data-k="notice"><div class="sx-nh">Service change</div><div class="sx-nb" data-k="nb"></div><div class="sx-ns">All trains run to Internet</div></div>
          <div class="sx-meta" data-k="meta"></div></div>
        <div class="sx-side">
          <div class="sx-lab" data-k="lab"></div>
          <div class="sx-stat"><div class="sx-vw"><div class="sx-v" data-k="blocked"></div></div><div class="sx-k">Blocked</div></div>
          <div class="sx-stat"><div class="sx-vw"><div class="sx-v" data-k="pct"></div></div><div class="sx-k">Share blocked</div></div>
          <div class="sx-stat"><div class="sx-vw"><div class="sx-v" data-k="total"></div></div><div class="sx-k">Queries</div></div>
          <button class="sx-pause" data-act="pause" data-k="pause" type="button"></button></div>`;
      const g = K.q(el, "trains");
      const pool = Array.from({ length: MAXT }, () => {
        const c = document.createElementNS(NS, "g"); c.setAttribute("class", "sx-train"); c.setAttribute("visibility", "hidden");
        const r = document.createElementNS(NS, "rect"); r.setAttribute("x", "-12"); r.setAttribute("y", "-5.5"); r.setAttribute("width", "24"); r.setAttribute("height", "11"); r.setAttribute("rx", "3");
        const w = document.createElementNS(NS, "rect"); w.setAttribute("class", "w"); w.setAttribute("x", "-8"); w.setAttribute("y", "-1.5"); w.setAttribute("width", "16"); w.setAttribute("height", "3");
        c.append(r, w); g.append(c); return c;
      });
      this.s = { m: null, el, pool, trains: [], rate: K.rateTracker(), news: K.newsTracker(), acc: 0.6 };
      this.stop = K.loop((dt) => this.frame(dt), 15);
    },
    unmount() { if (this.stop) this.stop(); },
    spawn(blocked) {
      const S = this.s; if (S.trains.length >= MAXT) return;
      const src = Math.random() < 0.55 ? "home" : "dev";
      S.trains.push({ legs: [T[src], blocked ? T.red : T.net], leg: 0, d: 0, v: 95 + Math.random() * 25, wait: 0, blocked, fade: 1 });
    },
    pulse(i) {
      const r = K.q(this.s.el, `ring${i}`); if (!r) return;
      r.classList.remove("go"); void r.getBoundingClientRect(); r.classList.add("go");
    },
    render(el, m) {
      const S = this.s, d = m.data || {}, mt = K.meta(m), held = m.paused; S.m = m; S.rate.update(m);
      const fresh = S.news(m.ticker);
      if (!held) for (let i = 0; i < Math.min(3, fresh.length); i++) this.spawn(true);
      if (fresh.length) this.pulse(0);
      const st = K.q(el, "state"); st.textContent = m.pill.text; st.className = `sx-state ${m.pill.cls}`;
      const lab = K.q(el, "lab"); lab.textContent = K.heroLabel(m, "Last 24 hours"); lab.classList.toggle("alert", m.labelAlert); lab.classList.toggle("warn", held && !m.labelAlert);
      K.q(el, "blocked").textContent = K.num(d.blocked); K.q(el, "pct").textContent = K.pct(d.percent_blocked); K.q(el, "total").textContent = K.num(d.total);
      STOPS.forEach((_, i) => {
        const it = m.ticker[i], s = K.q(el, `stop${i}`);
        s.hidden = !it;
        if (!it) return;
        if (s.dataset.domain !== it.domain) { s.dataset.domain = it.domain; s.firstChild.textContent = it.domain; }
        s.lastChild.textContent = K.ago(m, it);
      });
      el.querySelectorAll(".sx-st.stop").forEach((c, i) => c.classList.toggle("off", !m.ticker[i]));
      K.q(el, "nb").textContent = `Blocked line suspended · ${countdown(m)}`;
      K.q(el, "meta").textContent = `CPU ${mt.temp}  |  Up ${mt.up}`;
      K.q(el, "pause").textContent = K.pauseText(m);
      K.common(el, m);
      const a = K.q(el, "allowed"); if (a) a.querySelector(".n").textContent = m.allowedCount ? ` ${m.allowedCount}` : "";
      K.fit(K.q(el, "blocked"), 24); K.fit(K.q(el, "pct"), 24); K.fit(K.q(el, "total"), 24);
    },
    frame(dt) {
      const S = this.s, m = S.m; if (!m || m.asleep) return;
      const held = m.paused;
      if (!m.stale) {   // a steady time-lapsed service; the blocked share follows the real one
        S.acc += dt * 1.1;
        if (S.acc >= 1) {
          S.acc -= 1 + Math.random() * 0.3;
          const share = typeof m.data?.percent_blocked === "number" ? Math.min(0.45, Math.max(0.12, m.data.percent_blocked / 100)) : 0.2;
          this.spawn(!held && Math.random() < share);
        }
      }
      S.trains = S.trains.filter((t) => {
        if (held && t.blocked && t.leg === 0) { t.blocked = false; t.legs[1] = T.net; }   // pause re-routes waiting trains
        if (t.wait > 0) t.wait -= dt;
        else {
          t.d += t.v * dt;
          if (t.d >= t.legs[t.leg].L) {
            if (t.leg === 0) { t.leg = 1; t.d = 0; t.wait = 0.25; }   // brief stop at the Filter
            else { t.d = t.legs[1].L; t.fade -= dt * 3; }
          }
        }
        return t.fade > 0;
      });
      S.pool.forEach((c, i) => {
        const t = S.trains[i];
        if (!t) { if (c.getAttribute("visibility") !== "hidden") c.setAttribute("visibility", "hidden"); return; }
        const [x, y, a] = t.legs[t.leg].at(t.d);
        c.setAttribute("visibility", "visible");
        c.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${a.toFixed(0)})`);
        c.setAttribute("opacity", Math.max(0, t.fade).toFixed(2));
      });
    },
  };

  window.PiSkins.add("subway", skin, "Network Express", "A transit map of your traffic", K.T(
    '<rect width="160" height="96" fill="#F6EFE4"/><rect width="160" height="14" fill="#0E0E0E"/>' +
    '<text x="5" y="10" font-size="8" font-weight="800" fill="#fff" font-family="Inter">Network Express</text>' +
    '<rect x="116" y="14" width="44" height="82" fill="#0E0E0E"/>' +
    '<text x="120" y="32" font-size="9" font-weight="800" fill="#fff" font-family="Inter">12,416</text><rect x="120" y="36" width="36" height=".8" fill="#fff"/>' +
    '<text x="120" y="50" font-size="9" font-weight="800" fill="#fff" font-family="Inter">21.3%</text><rect x="120" y="54" width="36" height=".8" fill="#fff"/>' +
    '<rect x="120" y="78" width="36" height="12" fill="none" stroke="#fff"/>' +
    '<polyline points="12,30 32,30 46,44 106,44" fill="none" stroke="#1F5FE0" stroke-width="3"/>' +
    '<polyline points="8,58 32,58 46,44" fill="none" stroke="#F7941D" stroke-width="3"/>' +
    '<polyline points="46,44 52,56 60,64 68,72 80,82" fill="none" stroke="#E52E2E" stroke-width="3"/>' +
    '<g fill="#fff" stroke="#111" stroke-width="1.2"><circle cx="12" cy="30" r="2.5"/><circle cx="8" cy="58" r="2.5"/><circle cx="106" cy="44" r="2.5"/><circle cx="52" cy="56" r="2"/><circle cx="60" cy="64" r="2"/><circle cx="68" cy="72" r="2"/><circle cx="80" cy="82" r="2.5"/><circle cx="46" cy="44" r="4"/></g>' +
    '<g fill="#333"><rect x="56" y="54" width="26" height="2"/><rect x="64" y="62" width="24" height="2"/><rect x="72" y="70" width="22" height="2"/></g>'));
})();
