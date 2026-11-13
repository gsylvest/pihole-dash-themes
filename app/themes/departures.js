// Airport Departures: a black split-flap board. Every character sits on its own flap tile with a centre split.
// When a row's text changes, only the changed tiles flip (one random interim character, then the real one), in a
// left-to-right cascade. The flip queue runs on K.loop at 30 fps and stops itself when the board is settled.
// Paused: the top row of the board becomes a yellow service notice with the countdown.
(() => {
  "use strict";
  const K = window.PiSkinKit;
  const ND = 19, NS = 7, NT = 3, ROWS = 4;           // tiles: domain, status, seen
  const JUNK = "abcdefghijklmnopqrstuvwxyz0123456789.-";
  const tiles = (n, cls) => `<span class="dp-rail ${cls}">${'<i class="dp-f"><b></b></i>'.repeat(n)}</span>`;
  const fitText = (s, n) => (s.length <= n ? s.padEnd(n, " ") : `${s.slice(0, n - 3)}...`);
  function seen(m, it) {
    const a = K.short(K.ago(m, it));
    if (a === "earlier") return "---";
    return a.length <= 3 ? a : "old";
  }
  const S = { q: [], stop: null, t: 0, gen: 0 };

  function setRow(row, text, cascade0) {
    const fs = row.querySelectorAll("b");
    for (let i = 0; i < fs.length; i++) {
      const b = fs[i], ch = text[i] || " ";
      if (b.dataset.c === ch) continue;
      b.dataset.c = ch;
      if (!S.ready || (S.m && S.m.asleep)) { b.textContent = ch === " " ? "" : ch; continue; }   // first paint: no flipping
      const at = S.t + (cascade0 + i) * 0.028;
      if (ch !== " ") S.q.push({ b, at, ch: JUNK[(Math.random() * JUNK.length) | 0] });
      S.q.push({ b, at: at + 0.11, ch });
    }
  }
  function step(dt) {
    S.t += dt;
    if (S.m && S.m.asleep) return;
    S.q = S.q.filter((f) => {
      if (f.at > S.t) return true;
      const b = f.b; b.textContent = f.ch === " " ? "" : f.ch;
      b.className = b.className === "fa" ? "fb" : "fa";   // alternate class names restart the flap animation without a reflow
      return false;
    });
    if (!S.q.length && S.stop) { S.stop(); S.stop = null; }
  }
  const kick = () => { if (S.q.length && !S.stop) S.stop = K.loop(step, 30); };

  const departures = {
    mount(el) {
      S.q = []; S.ready = false; S.t = 0;
      const rows = Array.from({ length: ROWS }, (_, i) =>
        `<li class="dp-row" data-k="r${i}">${tiles(ND, "dom")}<i class="dp-cut"></i>${tiles(NS, "st")}<i class="dp-cut"></i>${tiles(NT, "seen")}</li>`).join("");
      el.innerHTML = `
        <div class="dp-top">
          <svg class="dp-plane" viewBox="0 0 48 24" aria-hidden="true"><path d="M2 15 L9 13 L6 7 L9 7 L16 12 L30 9 C36 8 44 8 45 10 C46 12 40 14 34 15 L20 18 L13 23 L10 23 L13 17 L5 18 Z" fill="#F4C21B"/></svg>
          <i class="dp-vr"></i><b class="dp-brand">NETWORK DEPARTURES</b><i class="dp-vr"></i>
          <span class="dp-state" data-k="state"></span><span class="dp-sp"></span><i class="dp-vr"></i>
          <button class="dp-btn" data-act="allowed" data-k="allowed" type="button">Allowed<span class="n num"></span><i class="dp-car"></i></button>
          <button class="dp-btn" data-act="style" type="button">Style<i class="dp-car"></i></button>
        </div>
        <div class="dp-heads"><span class="h-dom">DOMAIN</span><i class="dp-cut"></i><span class="h-st">STATUS</span><i class="dp-cut"></i><span class="h-seen">SEEN</span></div>
        <div class="dp-board fade">
          <ol class="dp-rows" data-k="rows">${rows}</ol>
          <div class="dp-notice" data-k="notice"><i class="dp-ex">!</i><span class="dp-nt"><b>SERVICE NOTICE</b><span>Blocking suspended · ads may board</span></span><span class="dp-cd num" data-k="cd"></span></div>
        </div>
        <div class="dp-stats">
          <div class="dp-s"><div class="dp-v num" data-k="blocked"></div><div class="dp-k" data-k="lab"></div></div><i class="dp-vr2"></i>
          <div class="dp-s"><div class="dp-v num" data-k="pct"></div><div class="dp-k">Blocked</div></div><i class="dp-vr2"></i>
          <div class="dp-s"><div class="dp-v num" data-k="total"></div><div class="dp-k">Queries / 24h</div></div><i class="dp-vr2"></i>
          <button class="dp-pause" data-act="pause" data-k="pause" type="button"></button>
        </div>
        <div class="dp-foot num" data-k="meta"></div>`;
    },
    render(el, m) {
      S.m = m;
      const d = m.data || {}, mt = K.meta(m);
      const st = K.q(el, "state"); st.textContent = m.pill.text; st.className = `dp-state ${m.pill.cls}`;
      K.q(el, "blocked").textContent = K.num(d.blocked);
      K.q(el, "pct").textContent = K.pct(d.percent_blocked);
      K.q(el, "total").textContent = K.num(d.total);
      const lab = K.q(el, "lab"); lab.textContent = m.labelAlert ? m.label : "Blocked / 24h"; lab.classList.toggle("alert", m.labelAlert);
      // board: when paused the notice covers row 0, so domains start one row lower
      const off = m.paused ? 1 : 0;
      for (let r = 0; r < ROWS; r++) {
        const row = K.q(el, `r${r}`), it = r >= off ? m.ticker[r - off] : null;
        row.classList.toggle("blank", !it);
        if (it) row.dataset.domain = it.domain; else delete row.dataset.domain;
        const dom = it ? fitText(it.domain.toLowerCase(), ND) : r === 0 && !m.ticker.length ? fitText("no departures yet", ND) : "";
        const rails = row.children;
        setRow(rails[0], dom, 0);
        setRow(rails[2], it ? "BLOCKED" : "", ND + 1);
        setRow(rails[4], it ? seen(m, it) : "", ND + NS + 2);
      }
      S.ready = true; kick();
      const cd = m.paused && m.pill.text.includes("·") ? m.pill.text.split("·").pop().trim() : "";
      K.q(el, "cd").textContent = cd ? `Resumes in ${cd}` : "";
      el.classList.toggle("dp-svc", m.paused);
      K.q(el, "pause").textContent = K.pauseText(m);
      K.q(el, "meta").textContent = `CPU ${mt.temp}  |  Up ${mt.up}`;
      K.common(el, m);
      K.fit(K.q(el, "blocked"), 24); K.fit(K.q(el, "pct"), 24); K.fit(K.q(el, "total"), 24);
    },
    unmount() { if (S.stop) S.stop(); S.stop = null; S.q = []; S.m = null; },
  };

  const flap = (x, y, c, col) => `<rect x="${x}" y="${y}" width="7" height="11" rx="1" fill="#222"/><text x="${x + 3.5}" y="${y + 8.6}" font-size="8" font-weight="700" text-anchor="middle" fill="${col}" font-family="Inter Tight">${c}</text><rect x="${x}" y="${y + 5.3}" width="7" height=".5" fill="#000"/>`;
  const line = (y, dom) => [...dom].map((c, i) => flap(4 + i * 8, y, c, "#F2E9D8")).join("") + [..."BLOCKED"].map((c, i) => flap(100 + i * 8, y, c, "#F4C21B")).join("");
  window.PiSkins.add("departures", departures, "Airport Departures", "Split-flap board of blocked domains", K.T(
    '<rect width="160" height="96" fill="#0D0D0C"/><path d="M5 9 l3-1 -1-3 h1 l3 2 6-1 c3 0 4 1 0 2 l-6 1 -3 3 h-1 l1-3 -3 1z" fill="#F4C21B"/>' +
    '<text x="24" y="11" font-size="7" font-weight="700" letter-spacing="1" fill="#F2E9D8" font-family="Inter Tight">NETWORK DEPARTURES</text>' +
    '<rect x="0" y="15" width="160" height="1" fill="#F4C21B"/>' + line(20, "ads.doublec") + line(34, "graph.faceb") + line(48, "app-measure") +
    '<rect x="0" y="63" width="160" height="1" fill="#F4C21B"/><text x="6" y="80" font-size="11" font-weight="700" fill="#F2E9D8" font-family="Inter Tight">12,416</text>' +
    '<text x="56" y="80" font-size="11" font-weight="700" fill="#F2E9D8" font-family="Inter Tight">21.3%</text><rect x="106" y="69" width="50" height="16" rx="2" fill="#F4C21B"/>'));
})();
