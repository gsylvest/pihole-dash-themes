// Hi-Fi: warm grey panel, light black numerals, a segmented blocked-share meter and one big orange switch.
// No canvas and no loop: the meter is 24 segments; when a new domain is blocked the meter's leading segment blinks once (CSS, opacity only).
(() => {
  "use strict";
  const K = window.PiSkinKit;
  const SEGS = 24, FULL = 50;   // meter full scale = 50 % blocked (a home network rarely blocks more)
  let news = null;
  const hifi = {
    mount(el) {
      news = K.newsTracker();
      const segs = Array.from({ length: SEGS }, () => '<i class="br-seg"></i>').join("");
      el.innerHTML = `
        <div class="br-top"><b class="br-brand">pi-hole</b><span class="br-sp"></span>
          <span class="br-state" data-k="state"></span>
          <button class="br-allowed" data-act="allowed" data-k="allowed" type="button">Allowed<span class="n num"></span></button>
          <button class="br-style" data-act="style" type="button">Style</button></div>
        <div class="br-hero"><div class="br-big num" data-k="blocked"></div><div class="br-lab" data-k="lab"></div></div>
        <div class="br-stats">
          <div class="br-stat"><div class="br-v num" data-k="pct"></div><div class="br-k">Blocked</div></div>
          <div class="br-stat"><div class="br-v num" data-k="total"></div><div class="br-k">Queries / 24 h</div></div>
        </div>
        <div class="br-meter" data-k="meter">${segs}</div>
        <div class="br-list fade"><div class="br-lh">Just blocked</div><ol data-k="list"></ol></div>
        <div class="br-act"><button class="br-pause" data-act="pause" data-k="pause" type="button">
          <span class="br-ico" data-k="ico"></span><span class="br-pl"><span data-k="pl"></span><span class="br-cd num" data-k="cd"></span></span></button></div>
        <div class="br-foot num" data-k="meta"></div>`;
    },
    render(el, m) {
      const d = m.data || {}, mt = K.meta(m);
      const st = K.q(el, "state"); st.textContent = m.pill.text; st.className = `br-state ${m.pill.cls}`;
      const lab = K.q(el, "lab"); lab.textContent = K.heroLabel(m, "Blocked / last 24 h"); lab.classList.toggle("alert", m.labelAlert);
      K.q(el, "blocked").textContent = K.num(d.blocked);
      K.q(el, "pct").textContent = K.pct(d.percent_blocked);
      K.q(el, "total").textContent = K.num(d.total);
      // meter
      const share = typeof d.percent_blocked === "number" ? d.percent_blocked : 0;
      const lit = Math.max(share > 0 ? 1 : 0, Math.min(SEGS, Math.round((share / FULL) * SEGS)));
      const segs = K.q(el, "meter").children;
      for (let i = 0; i < SEGS; i++) segs[i].classList.toggle("on", i < lit);
      const fresh = news(m.ticker);
      if (fresh.length && lit > 0 && !m.paused) {
        const s = segs[lit - 1]; s.classList.remove("blink"); void s.offsetWidth; s.classList.add("blink");
      }
      K.q(el, "list").innerHTML = m.ticker.slice(0, 3).map((it) =>
        `<li data-domain="${K.esc(it.domain)}"><span class="d">${K.esc(it.domain)}</span><span class="t">${K.esc(K.ago(m, it))}</span></li>`).join("")
        || '<li class="empty">Nothing blocked yet</li>';
      const pausing = m.button.mode === "pause";
      K.q(el, "ico").className = pausing ? "br-ico bars" : "br-ico tri";
      K.q(el, "pl").textContent = K.pauseText(m);
      const cd = m.paused && m.pill.text.includes("·") ? m.pill.text.split("·").pop().trim() : "";
      K.q(el, "cd").textContent = cd ? `${cd} left` : "";
      K.q(el, "meta").textContent = `CPU ${mt.temp}  |  Up ${mt.up}`;
      K.common(el, m);
      K.fit(K.q(el, "blocked"), 60); K.fit(K.q(el, "pct"), 26); K.fit(K.q(el, "total"), 26);
    },
    unmount() { news = null; },
  };
  window.PiSkins.add("hifi", hifi, "Hi-Fi", "Warm grey, one orange switch", K.T(
    '<rect width="160" height="96" fill="#DEDAD2"/><text x="6" y="11" font-size="8" fill="#1A1A18" font-family="Inter">pi-hole</text>' +
    '<circle cx="104" cy="8" r="2" fill="#5FA845"/><rect x="138" y="3" width="18" height="9" rx="2" fill="none" stroke="#1A1A18" stroke-width=".8"/>' +
    '<line x1="4" y1="15" x2="156" y2="15" stroke="#A8A398" stroke-width=".6"/>' +
    '<text x="4" y="46" font-size="30" font-weight="300" fill="#1A1A18" font-family="Inter" letter-spacing="-1">12,416</text>' +
    '<line x1="104" y1="20" x2="104" y2="54" stroke="#A8A398" stroke-width=".6"/>' +
    '<text x="109" y="32" font-size="11" font-weight="300" fill="#1A1A18" font-family="Inter">21.3%</text>' +
    '<text x="109" y="50" font-size="11" font-weight="300" fill="#1A1A18" font-family="Inter">58,246</text>' +
    '<g fill="#5FA845"><rect x="4" y="60" width="11" height="4"/><rect x="17" y="60" width="11" height="4"/><rect x="30" y="60" width="11" height="4"/><rect x="43" y="60" width="11" height="4"/><rect x="56" y="60" width="11" height="4"/></g>' +
    '<g fill="#C3BFB6"><rect x="69" y="60" width="11" height="4"/><rect x="82" y="60" width="11" height="4"/><rect x="95" y="60" width="11" height="4"/><rect x="108" y="60" width="11" height="4"/><rect x="121" y="60" width="11" height="4"/><rect x="134" y="60" width="11" height="4"/><rect x="147" y="60" width="9" height="4"/></g>' +
    '<rect x="6" y="72" width="50" height="2" fill="#8F8A80"/><rect x="6" y="78" width="42" height="2" fill="#8F8A80"/><rect x="6" y="84" width="46" height="2" fill="#8F8A80"/>' +
    '<rect x="92" y="70" width="64" height="18" rx="3" fill="#EE6A2C"/><rect x="104" y="75" width="2.5" height="8" fill="#1A1A18"/><rect x="109" y="75" width="2.5" height="8" fill="#1A1A18"/>'));
})();
