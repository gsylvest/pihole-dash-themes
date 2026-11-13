// Demo site: a live 800×480 dashboard beside a filterable design list. Static, no build step.
(() => {
  const REPO_URL = "https://github.com/gsylvest/pihole-dash-themes";

  const GROUPS = [
    ["Clean", [
      ["monolith", "Monolith", "One giant number"],
      ["swiss", "Swiss", "Grid, rules, big type"],
      ["bauhaus", "Bauhaus", "The circle is the blocked share"],
      ["hifi", "Hi-Fi", "Warm grey, one orange switch"],
      ["mission", "Mission Control", "Telemetry, orange on charcoal"],
      ["terminal", "Terminal", "tail -f the blocks"],
    ]],
    ["Animated", [
      ["flow", "Flow", "Queries stream through the gate"],
      ["sonar", "Sonar", "Blocked domains surface as contacts"],
      ["echo", "Echo", "Traffic on an oscilloscope"],
      ["departures", "Airport Departures", "Split-flap board of blocked domains"],
      ["subway", "Network Express", "A transit map of your traffic"],
      ["signalbox", "Signal Box", "Blocked trains take the siding"],
      ["watch", "Live Terminal", "Requests typed out as they're filtered"],
      ["filterops", "Filter Ops", "Split panes: requests, results, activity"],
      ["bonsai", "Bonsai", "Ad leaves fall from a circuit tree"],
    ]],
    ["Playful", [
      ["arcade", "8-bit", "The shield zaps the ads"],
      ["dungeon", "Dungeon Gate", "Monsters dissolve at the gate"],
      ["freighter", "Space Freighter", "Raiders burst on the ship's shield"],
      ["pachinko", "Pachinko", "Queries fall into Allowed or Blocked"],
      ["ninja", "ASCII Ninja", "A ninja slashes incoming ad packets"],
      ["whack", "Whack-an-Ad", "A mallet bops ads back down their holes"],
      ["pinball", "Packet Pinball", "Ads bounce off the bumpers and drain"],
    ]],
  ];
  document.querySelectorAll("[data-count]").forEach((el) => { el.textContent = GROUPS.reduce((n, [, i]) => n + i.length, 0); });
  const THEMES = GROUPS.flatMap(([group, items]) => items.map(([id, name, desc]) => ({ id, name, desc, group })));
  const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  const $ = (id) => document.getElementById(id);
  if (REPO_URL) { $("repoLink").href = REPO_URL; $("repoLink").hidden = false; }

  // ---------- live preview: scale the 800×480 iframe to its screen box ----------
  const screen = $("screen"), demo = $("demo");
  const fit = () => { demo.style.transform = `scale(${screen.clientWidth / 800})`; };
  new ResizeObserver(fit).observe(screen); fit();

  // ---------- filter chips + list ----------
  const chips = $("chips"), list = $("list");
  const FILTERS = [["all", "All"], ...GROUPS.map(([g]) => [g, g])];
  chips.innerHTML = FILTERS.map(([key, label]) => {
    const n = key === "all" ? THEMES.length : THEMES.filter((t) => t.group === key).length;
    return `<button class="chip" type="button" data-filter="${key}" aria-pressed="false">${label}<span class="n">${n}</span></button>`;
  }).join("");
  list.innerHTML = GROUPS.map(([group, items]) => `
    <div class="group" data-group="${group}" role="presentation">${group}</div>
    ${items.map(([id, name, desc]) => `
      <button class="item" type="button" role="option" data-id="${id}" data-group="${group}" aria-selected="false" tabindex="-1">
        <img src="site/shots/${id}.png" width="800" height="480" alt="" loading="lazy">
        <span class="txt"><span class="name">${name}</span><span class="desc">${desc}</span></span>
      </button>`).join("")}`).join("");
  const items = [...list.querySelectorAll(".item")];

  let filter = "all", current = THEMES[0].id;
  const visible = () => THEMES.filter((t) => filter === "all" || t.group === filter);

  function setFilter(key) {
    filter = key;
    chips.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", c.dataset.filter === key ? "true" : "false"));
    list.querySelectorAll(".group").forEach((g) => { g.hidden = key !== "all"; });
    items.forEach((el) => { el.hidden = key !== "all" && el.dataset.group !== key; });
    list.scrollTop = 0; list.scrollLeft = 0;
    // keep the preview if it's in this category, otherwise show the category's first design
    if (!visible().some((t) => t.id === current)) show(visible()[0].id); else { updateCount(); keepInView(); }
  }
  chips.addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (c) setFilter(c.dataset.filter); });

  function updateCount() {
    const v = visible(), i = v.findIndex((t) => t.id === current);
    $("count").textContent = i >= 0 ? `${i + 1} / ${v.length}` : `${v.length} designs`;
  }

  // Scroll only the list (never the page) so the chosen design is in view.
  function keepInView() {
    const sel = items.find((el) => el.dataset.id === current);
    if (!sel || sel.hidden) return;
    const behavior = reduceMotion() ? "auto" : "smooth";
    const lr = list.getBoundingClientRect(), r = sel.getBoundingClientRect(), pad = 8;
    if (list.scrollHeight > list.clientHeight + 1) {
      if (r.top < lr.top + pad) list.scrollBy({ top: r.top - lr.top - pad - (filter === "all" ? 28 : 0), behavior });
      else if (r.bottom > lr.bottom - pad) list.scrollBy({ top: r.bottom - lr.bottom + pad, behavior });
    }
    if (list.scrollWidth > list.clientWidth + 1) {
      if (r.left < lr.left + pad) list.scrollBy({ left: r.left - lr.left - pad, behavior });
      else if (r.right > lr.right - pad) list.scrollBy({ left: r.right - lr.right + pad, behavior });
    }
  }

  function show(id, { focus = false, load = true } = {}) {
    const t = THEMES.find((x) => x.id === id) || THEMES[0];
    current = t.id;
    $("liveName").textContent = t.name; $("liveDesc").textContent = t.desc;
    const url = `app/index.html?demo&theme=${t.id}`;
    if (load && !demo.src.endsWith(url)) demo.src = url;
    $("fullLink").href = url;
    items.forEach((el) => {
      const on = el.dataset.id === t.id;
      el.setAttribute("aria-selected", on ? "true" : "false");
      el.tabIndex = on ? 0 : -1;
    });
    updateCount(); keepInView();
    if (focus) items.find((el) => el.dataset.id === t.id).focus({ preventScroll: true });
    try { history.replaceState(null, "", `#${t.id}`); } catch { /* ignore */ }
    window.currentDesign = t.id; dispatchEvent(new CustomEvent("design-change", { detail: t.id }));   // the 3D model's screen follows
  }
  function step(d, opts) {
    const v = visible(), i = v.findIndex((t) => t.id === current);
    show(v[((i < 0 ? 0 : i + d) + v.length) % v.length].id, opts);
  }

  list.addEventListener("click", (e) => { const el = e.target.closest(".item"); if (el) show(el.dataset.id); });
  $("prev").addEventListener("click", () => step(-1));
  $("next").addEventListener("click", () => step(1));

  // A design picked on the dashboard's own Style page: follow it here without reloading the preview.
  demo.addEventListener("load", () => {
    try {
      const root = demo.contentDocument.documentElement;
      new MutationObserver(() => {
        const id = root.dataset.theme;
        if (id && id !== current && THEMES.some((t) => t.id === id)) {
          if (!visible().some((t) => t.id === id)) setFilter("all");
          show(id, { load: false });
        }
      }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    } catch { /* not same-origin: nothing to follow */ }
  });

  // ---------- expand: the preview grows into a centred overlay ----------
  const device = $("device"), slot = $("slot"), scrim = $("scrim"), expandBtn = $("expand"), closeBtn = $("close");
  let open = false, lastFocus = null;

  function target() {   // 80% of the window width, capped so it fits the height
    const pad = parseFloat(getComputedStyle(device).paddingLeft) * 2;
    let w = innerWidth < 820 ? innerWidth : innerWidth * 0.8;   // 80% on desktop; edge to edge on a phone
    const maxH = innerHeight * 0.8;   // leaves room above for the close button
    if ((w - pad) * 0.6 + pad > maxH) w = (maxH - pad) / 0.6 + pad;
    const h = (w - pad) * 0.6 + pad;
    return { left: (innerWidth - w) / 2, top: (innerHeight - h) / 2 + 20, width: w };
  }
  function place() {
    const t = target();
    Object.assign(device.style, { left: `${t.left}px`, top: `${t.top}px`, width: `${t.width}px` });
  }
  function animateFrom(from) {   // FLIP: start where `from` was, glide to where the device is now
    if (reduceMotion()) return;
    const to = device.getBoundingClientRect();
    const s = from.width / to.width;
    device.animate([
      { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${s})` },
      { transform: "none" },
    ], { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" });
  }

  function expand() {
    if (open) return;
    open = true; lastFocus = document.activeElement;
    const from = device.getBoundingClientRect();
    slot.style.height = `${slot.offsetHeight}px`;           // hold the space in the card
    device.classList.add("is-open");
    device.setAttribute("role", "dialog"); device.setAttribute("aria-modal", "true");
    place();
    scrim.hidden = false; requestAnimationFrame(() => scrim.classList.add("show"));
    document.documentElement.classList.add("no-scroll");
    closeBtn.hidden = false;
    animateFrom(from);
    closeBtn.focus({ preventScroll: true });
  }
  function collapse() {
    if (!open) return;
    open = false;
    const from = device.getBoundingClientRect();
    device.classList.remove("is-open");
    device.removeAttribute("role"); device.removeAttribute("aria-modal");
    Object.assign(device.style, { left: "", top: "", width: "" });
    slot.style.height = "";
    scrim.classList.remove("show");
    setTimeout(() => { if (!open) scrim.hidden = true; }, reduceMotion() ? 0 : 250);
    document.documentElement.classList.remove("no-scroll");
    closeBtn.hidden = true;
    animateFrom(from);
    (lastFocus && lastFocus !== document.body ? lastFocus : expandBtn).focus({ preventScroll: true });
  }
  expandBtn.addEventListener("click", expand);
  closeBtn.addEventListener("click", collapse);
  scrim.addEventListener("click", collapse);
  addEventListener("resize", () => { if (open) place(); });

  // ---------- keyboard ----------
  document.addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key === "Escape" && open) { e.preventDefault(); collapse(); return; }
    if (open && e.key === "Tab") { e.preventDefault(); closeBtn.focus(); return; }   // only one control in the overlay
    const inList = list.contains(e.target);
    if (e.key === "ArrowRight" || (inList && e.key === "ArrowDown")) { e.preventDefault(); step(1, { focus: inList }); }
    else if (e.key === "ArrowLeft" || (inList && e.key === "ArrowUp")) { e.preventDefault(); step(-1, { focus: inList }); }
    else if (inList && e.key === "Home") { e.preventDefault(); show(visible()[0].id, { focus: true }); }
    else if (inList && e.key === "End") { e.preventDefault(); show(visible().at(-1).id, { focus: true }); }
  });

  // ---------- start ----------
  const fromHash = location.hash.slice(1);
  setFilter("all");
  show(THEMES.some((t) => t.id === fromHash) ? fromHash : THEMES[0].id);
  if (!THEMES.some((t) => t.id === fromHash)) { try { history.replaceState(null, "", location.pathname); } catch { /* ignore */ } }
})();
