// Live Terminal: a charcoal shell running "pihole --watch". Each newly blocked domain types itself out at the bottom of
// the log (INCOMING + domain, a "Checking filter" progress bar that fills in ~1 s, then [BLOCKED]); older entries scroll
// up and off the top. Typing runs on K.loop at 20 fps only while something is being typed; otherwise the text is static
// and only the CSS block cursor blinks. Bursts queue (capped) instead of overlapping. Allowed traffic is never named:
// now and then a dim "[ALLOWED] N queries forwarded upstream." line, N from the real 24 h counters.
// Paused: amber pill with countdown, a "[PAUSED] filter off · resumes in m:ss" log line that counts down, new requests
// print "[PASSED] filter paused", footer says PAUSED and the button becomes [ Resume ... ].
(() => {
  "use strict";
  const K = window.PiSkinKit;
  const CPS = 70, BAR_S = 1.0, GAP_S = 0.12, MAXQ = 4, KEEP = 6, NOTE_S = 30;
  const S = { m: null, log: null, cur: null, queue: [], job: null, stop: null, news: null, allow: null, cdL: null, wasPaused: null };
  const clock = (ts) => {
    if (ts == null) return "--:--:--";
    const t = new Date(ts * 1000);
    return [t.getHours(), t.getMinutes(), t.getSeconds()].map((x) => String(x).padStart(2, "0")).join(":");
  };
  const bar = (p) => { const n = Math.floor(p * 10 + 1e-6); return `[${"#".repeat(n)}${"-".repeat(10 - n)}] ${String(Math.floor(p * 100)).padStart(3, " ")}%`; };
  const cdOf = (m) => (m.pill.text.includes("·") ? m.pill.text.split("·").pop().trim() : "");
  const mk = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };

  // ---- entry specs
  const blockSpec = (it) => ({ dom: it.domain, cls: "blk", lines: [
    { ts: clock(it.seen_at), tag: "INCOMING", tagCls: "wt-in", text: `  ${it.domain}`, textCls: "wt-d" },
    { bar: true },
    { tag: "[BLOCKED]", tagCls: "wt-ok", text: " Rule matched. Request denied." }] });
  const passSpec = (it) => ({ dom: it.domain, cls: "pas", lines: [
    { ts: clock(it.seen_at), tag: "INCOMING", tagCls: "wt-in", text: `  ${it.domain}`, textCls: "wt-d" },
    { tag: "[PASSED]", tagCls: "wt-am", text: " filter paused. Forwarded upstream." }] });
  const noteSpec = (ts, tag, tagCls, text, cls, extra) => ({ cls, lines: [Object.assign({ ts: clock(ts), tag, tagCls, text }, extra || {})] });

  // ---- typing engine
  function begin(spec) {
    const ph = S.log.querySelector(".wt-wait"); if (ph) ph.remove();
    const e = mk("div", `wt-e ${spec.cls}`);
    if (spec.dom) e.dataset.domain = spec.dom;
    S.log.appendChild(e);
    while (S.log.children.length > KEEP) S.log.firstElementChild.remove();
    return { e, lines: spec.lines, i: 0, t: 0 };
  }
  function open(j, L) {
    const row = mk("div", `wt-l${L.bar ? " wt-chk run" : ""}`);
    row.appendChild(mk("span", "wt-ts", L.ts || ""));
    const tx = mk("span", "wt-tx");
    if (L.bar) tx.appendChild(document.createTextNode("Checking filter  "));
    else if (L.tag) tx.appendChild(mk("span", L.tagCls, L.tag));
    const holder = L.textCls ? tx.appendChild(mk("span", L.textCls)) : tx;
    L.node = holder.appendChild(document.createTextNode(""));
    L.row = row;
    row.appendChild(tx); j.e.appendChild(row);
    holder.appendChild(S.cur);
  }
  function settle(L) {
    if (L.bar) { L.node.data = bar(1); L.row.classList.remove("run"); } else L.node.data = L.text;
    L.done = true;
  }
  function next(j) {
    settle(j.lines[j.i]);
    j.i++; j.t = -GAP_S;
    if (j.i >= j.lines.length) { S.job = null; S.cur.classList.remove("typing"); }
  }
  function finish(j) {   // print the rest of an entry at once
    while (j.i < j.lines.length) { const L = j.lines[j.i]; if (!L.row) open(j, L); next(j); }
  }
  function step(dt) {
    if (S.m && S.m.asleep) return;
    let j = S.job;
    if (!j) {
      if (!S.queue.length) { if (S.stop) S.stop(); S.stop = null; return; }
      j = S.job = begin(S.queue.shift());
      S.cur.classList.add("typing");
    }
    j.t += dt;
    if (j.t < 0) return;
    const L = j.lines[j.i];
    if (!L.row) open(j, L);
    if (L.bar) { const p = Math.min(1, j.t / BAR_S); L.node.data = bar(p); if (p >= 1) next(j); }
    else { const n = Math.min(L.text.length, Math.floor(j.t * CPS)); L.node.data = L.text.slice(0, n); if (n >= L.text.length) next(j); }
  }
  function push(spec, animate) {
    if (!animate) { if (S.job) finish(S.job); while (S.queue.length) finish(begin(S.queue.shift())); finish(begin(spec)); return; }
    S.queue.push(spec);
    if (S.queue.length > MAXQ) {   // burst: catch up by printing the older ones at once
      if (S.job) finish(S.job);
      while (S.queue.length > 2) finish(begin(S.queue.shift()));
    }
    if (!S.stop) S.stop = K.loop(step, 20);
  }
  const flush = () => { if (S.job) finish(S.job); while (S.queue.length) finish(begin(S.queue.shift())); };

  const watch = {
    mount(el) {
      Object.assign(S, { m: null, queue: [], job: null, news: K.newsTracker(), allow: null, cdL: null, wasPaused: null });
      el.innerHTML = `
        <div class="wt-top">
          <span class="wt-title"><span class="wt-dollar">$</span> pihole --watch</span><span class="wt-sp"></span>
          <span class="wt-state" data-k="state"></span>
          <button class="wt-btn" data-act="allowed" data-k="allowed" type="button">[allowed<span class="n"></span>]</button>
          <button class="wt-btn" data-act="style" type="button">[style]</button>
        </div>
        <i class="wt-rule"></i>
        <div class="wt-sum" data-k="sum"></div>
        <i class="wt-rule"></i>
        <div class="wt-log fade" data-k="log"><div class="wt-e wt-wait"><div class="wt-l"><span class="wt-ts"></span><span class="wt-tx">waiting for requests...</span></div></div></div>
        <i class="wt-rule"></i>
        <div class="wt-foot">
          <span class="wt-live" data-k="live"></span>
          <span class="wt-meta" data-k="meta"></span>
          <button class="wt-pause" data-act="pause" data-k="pause" type="button"></button>
        </div>`;
      S.log = K.q(el, "log");
      S.cur = mk("i", "wt-cur");
      S.log.querySelector(".wt-wait .wt-tx").appendChild(S.cur);
    },
    render(el, m) {
      S.m = m;
      const d = m.data || {}, mt = K.meta(m);
      const st = K.q(el, "state"); st.textContent = m.pill.text; st.className = `wt-state ${m.pill.cls}`;
      const sum = K.q(el, "sum");
      sum.textContent = `24h: ${K.num(d.blocked)} blocked | ${K.pct(d.percent_blocked)} | ${K.num(d.total)} queries${m.labelAlert ? `  ! ${m.label}` : ""}`;
      sum.classList.toggle("alert", !!m.labelAlert);
      K.fit(sum, 12);

      // log: history on first render, then typed news
      const first = S.wasPaused === null;
      const fresh = S.news(m.ticker);
      if (first) m.ticker.slice(0, 4).reverse().forEach((it) => push(blockSpec(it), false));
      if (first || m.paused !== S.wasPaused) {
        if (m.paused) {
          const cd = cdOf(m);
          const spec = noteSpec(m.now, "[PAUSED]", "wt-am", ` filter off · resumes in ${cd || "-:--"}`, "note pz");
          S.cdL = spec.lines[0];
          push(spec, !first && !m.asleep);
        } else if (!first) {
          if (S.cdL) { S.cdL.text = " filter off · ended"; if (S.cdL.done) S.cdL.node.data = S.cdL.text; S.cdL = null; }
          push(noteSpec(m.now, "[RESUMED]", "wt-ok", " filter on. Blocking again.", "note"), !m.asleep);
        }
        S.wasPaused = m.paused;
      }
      fresh.forEach((it) => push(m.paused ? passSpec(it) : blockSpec(it), !m.asleep));
      if (m.paused && S.cdL) {
        S.cdL.text = ` filter off · resumes in ${cdOf(m) || "-:--"}`;
        if (S.cdL.done) S.cdL.node.data = S.cdL.text;
      }
      // now and then, a nameless summary of allowed traffic from the real counters
      if (typeof d.total === "number" && typeof d.blocked === "number") {
        const a = d.total - d.blocked;
        if (!S.allow || a < S.allow.a) S.allow = { t: m.now, a };
        else if (m.now - S.allow.t >= NOTE_S && !S.job && !S.queue.length && !m.stale) {
          const n = a - S.allow.a; S.allow = { t: m.now, a };
          if (n > 0) push(noteSpec(m.now, m.paused ? "[PASSED]" : "[ALLOWED]", m.paused ? "wt-am" : "wt-al",
            ` ${K.num(n)} ${n === 1 ? "query" : "queries"} forwarded upstream.`, "note dim"), !m.asleep);
        }
      }
      if (m.asleep) flush();

      const live = K.q(el, "live");
      live.textContent = m.stale ? "STALE / no data" : m.paused ? "PAUSED / filter off" : "LIVE / auto-follow";
      live.className = `wt-live${m.stale ? " bad" : m.paused ? " warn" : ""}`;
      K.q(el, "meta").textContent = `cpu ${mt.temp.replace("°", " ")} | up ${mt.up.replace(/\s+/g, "")}`;
      K.q(el, "pause").textContent = m.button.mode === "pause" ? "[ PAUSE 5m ]" : `[ ${K.resumeText(m)} ]`;
      K.common(el, m);
    },
    unmount() { if (S.stop) S.stop(); Object.assign(S, { stop: null, queue: [], job: null, m: null, log: null, cur: null, cdL: null }); },
  };

  const tx = (x, y, fill, s, extra) => `<text x="${x}" y="${y}" fill="${fill}"${extra || ""}>${s}</text>`;
  const rule = (y) => `<line x1="4" y1="${y}" x2="156" y2="${y}" stroke="#7C7C7A" stroke-width="1" stroke-dasharray="3 2"/>`;
  window.PiSkins.add("watch", watch, "Live Terminal", "Requests typed out as they're filtered", K.T(
    '<rect width="160" height="96" fill="#141516"/><g font-family="Menlo, monospace" font-size="6.5">' +
    tx(5, 10, "#EDEDEB", "$ pihole --watch", ' font-weight="700"') + '<circle cx="117" cy="8" r="2" fill="#57CF6A"/>' + tx(121, 10, "#57CF6A", "Blocking") +
    rule(15) + tx(5, 23, "#D8D8D6", "24h: 12,416 blocked | 21.3%") + rule(27) +
    '</g><g font-family="Menlo, monospace" font-size="5.6">' +
    tx(5, 37, "#8E9196", "08:14:02") + tx(34, 37, "#45CFE3", "INCOMING", ' font-weight="700"') + tx(64, 37, "#E4E4E2", "graph.facebook") +
    tx(34, 44, "#BDBDBB", "Checking [##########]") + tx(34, 51, "#5BD16B", "[BLOCKED]") + tx(66, 51, "#BDBDBB", "Request denied.") +
    tx(5, 62, "#8E9196", "08:14:05") + tx(34, 62, "#45CFE3", "INCOMING", ' font-weight="700"') + tx(64, 62, "#F4F4F2", "ads.doubleclick", ' font-weight="700"') +
    tx(34, 69, "#F2B33D", "Checking [######----] 60%") + '<rect x="110" y="64.5" width="3.5" height="5.5" fill="#EDEDEB"/></g>' +
    rule(78) + '<rect x="110" y="82" width="46" height="11" fill="none" stroke="#DADAD8"/>' +
    '<g font-family="Menlo, monospace" font-size="5.6">' + tx(5, 89, "#E4E4E2", "LIVE / auto-follow") + tx(114, 89.5, "#E4E4E2", "[ PAUSE 5m ]") + '</g>'));
})();
