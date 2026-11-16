// Applies the saved dashboard style before first paint (separate file: the CSP allows no inline script).
// ?theme=<name> in the URL overrides and is saved, for previews from a laptop.
(() => {
  const KEY = "pihole-dash:theme", THEMES = ["monolith", "swiss", "bauhaus", "arcade", "flow", "terminal", "hifi", "mission", "sonar", "signalbox", "subway", "dungeon", "freighter", "departures", "echo", "pachinko", "ninja", "watch", "filterops", "whack", "bonsai", "pinball", "duckblock", "defense", "sorter"];
  let t = null;
  try { t = new URLSearchParams(location.search).get("theme"); } catch { /* ignore */ }
  if (THEMES.includes(t)) { try { localStorage.setItem(KEY, t); } catch { /* ignore */ } }
  else { try { t = localStorage.getItem(KEY); } catch { t = null; } }
  document.documentElement.dataset.theme = THEMES.includes(t) ? t : "monolith";

  // Optional top inset for cases whose bezel covers the top rows of the screen. The whole dashboard is scaled down a
  // little and anchored to the bottom so nothing sits under the bezel. 0 = no inset.
  // ?top=<px> overrides it for this browser (saved), e.g. ?top=0 for laptop previews.
  const SCREEN_TOP = 0, TOP_KEY = "pihole-dash:top";
  let top = null;
  try { const q = new URLSearchParams(location.search).get("top"); if (q !== null && /^\d{1,3}$/.test(q)) { top = +q; localStorage.setItem(TOP_KEY, q); } } catch { /* ignore */ }
  if (top === null) { try { const s = localStorage.getItem(TOP_KEY); if (s !== null && /^\d{1,3}$/.test(s)) top = +s; } catch { /* ignore */ } }
  if (top === null) top = SCREEN_TOP;
  const apply = () => { const h = window.innerHeight || 480; document.documentElement.style.setProperty("--screen-scale", String(Math.max(0.5, (h - top) / h))); };
  apply(); window.addEventListener("resize", apply);
})();
