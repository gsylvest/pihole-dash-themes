// Design preview screenshots in real time (animations run at normal speed) via headless Chrome's DevTools protocol.
//   python3 -m http.server 8767   (from the repo root), then:  node dev/shoot.mjs site/shots monolith swiss ...
// Env: FAKE_PORT (local web server port, default 8767), CDP_PORT (default 9333), WAIT_MS (default 7000).
// Makes the demo site thumbnails. Local only; nothing here runs on the Pi.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [out, ...themes] = process.argv.slice(2);
const CH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const prof = mkdtempSync(join(tmpdir(), "pihole-shoot-"));
const port = +(process.env.CDP_PORT || 9333), fake = +(process.env.FAKE_PORT || 8767), wait = +(process.env.WAIT_MS || 7000);
const ch = spawn(CH, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, "--hide-scrollbars",
  "--force-device-scale-factor=1", "--window-size=800,480", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ver;
for (let i = 0; i < 50; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (ver.length) break; } catch {} await sleep(200); }
const page = ver.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const waits = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && waits.has(m.id)) { waits.get(m.id)(m.result); waits.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; waits.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 800, height: 480, deviceScaleFactor: 1, mobile: false });
for (const t of themes) {
  await send("Page.navigate", { url: `http://127.0.0.1:${fake}/app/index.html?demo&theme=${t}` });
  await sleep(wait);
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(out, `${t}.png`), Buffer.from(r.data, "base64"));
  console.log("shot", t);
}
ws.close(); ch.kill(); await sleep(300); rmSync(prof, { recursive: true, force: true });
