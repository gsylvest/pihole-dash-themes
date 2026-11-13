// "Build the screen" section: an orbitable 3D model of the enclosure (three.js) and the print-file downloads.
// three.js loads only when the section scrolls near, so the rest of the page stays light.
const MODEL_URL = "enclosure/preview/enclosure.glb";
const FILES_URL = "enclosure/files.json";   // [{ "name": "Shell", "file": "enclosure/print/shell.3mf", "note": "4 h 48 m · 123 g" }, …]

const $ = (id) => document.getElementById(id);
const host = $("model"), msg = $("modelMsg");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- downloads ----------
(async () => {
  const box = $("downloads");
  try {
    const r = await fetch(FILES_URL, { cache: "no-cache" });
    if (!r.ok) throw new Error(r.status);
    const files = await r.json();
    box.innerHTML = files.map((f) => `<a class="dl" href="${encodeURI(f.file)}" download>
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v10M5.5 8.5 10 13l4.5-4.5M4 16.5h12"/></svg>
      <span><b>${f.name}</b>${f.note ? `<small>${f.note}</small>` : ""}</span></a>`).join("");
  } catch {
    box.innerHTML = '<p class="muted small">Print files are on their way.</p>';
  }
})();

// ---------- viewer ----------
let started = false;
const io = new IntersectionObserver((entries) => {
  if (started || !entries.some((e) => e.isIntersecting)) return;
  started = true; io.disconnect(); start();
}, { rootMargin: "400px" });
io.observe(host); io.observe($("guide"));   // the guide draws from the same model, so either one starts the load

async function start() {
  let THREE, OrbitControls, GLTFLoader, RoomEnvironment;
  try {
    THREE = await import("three");
    ({ OrbitControls } = await import("three/addons/controls/OrbitControls.js"));
    ({ GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js"));
    ({ RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js"));
  } catch {
    msg.textContent = "The 3D viewer couldn’t load (offline?).";
    return;
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 5000);
  // studio lighting: a soft room for reflections, one shadow-casting key, a cool rim to lift the edges
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xfff4e6, 0x30302c, 0.35));
  const key = new THREE.DirectionalLight(0xfff1e0, 2.4); key.position.set(-170, 230, 150);   // upper left, low enough to throw the shadow onto the floor
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 8; key.shadow.bias = -0.0003; key.shadow.normalBias = 0.4;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xbcd2ff, 1.1); rim.position.set(-220, 140, -200); scene.add(rim);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enablePan = false;
  controls.autoRotate = !reduceMotion; controls.autoRotateSpeed = 0.8;
  renderer.domElement.addEventListener("pointerdown", () => { controls.autoRotate = false; });

  let gltf;
  try { gltf = await new GLTFLoader().loadAsync(MODEL_URL); }
  catch { msg.textContent = "The 3D model is on its way."; return; }
  const root = gltf.scene; scene.add(root);
  const pristine = root.clone();   // untouched copy for the line-drawing assembly guide

  // materials: matte PETG for the printed parts, glossy black glass, metal posts, the design on the screen
  // Black PETG with the fine stipple a textured PEI build plate leaves: a small tiling noise texture used as a
  // bump map and to vary the roughness, mapped by box projection (the model has no UVs of its own).
  const stipple = (() => {
    const N = 256, c = document.createElement("canvas"); c.width = c.height = N;
    const g = c.getContext("2d"), img = g.createImageData(N, N);
    for (let i = 0; i < N * N; i++) {
      const v = 128 + (Math.random() - 0.5) * 150 * (Math.random() < 0.55 ? 1 : 0.35);
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.globalAlpha = 0.5; g.filter = "blur(0.6px)"; g.drawImage(c, 0, 0);   // soften the speckle into bumps
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    return t;
  })();
  const boxUV = (geo, mm) => {   // planar UVs on whichever axis each vertex faces; mm = millimetres per texture tile
    const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
      let u, v;
      if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i); } else if (ay >= az) { u = p.getX(i); v = p.getZ(i); } else { u = p.getX(i); v = p.getY(i); }
      uv[i * 2] = u / mm; uv[i * 2 + 1] = v / mm;
    }
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  };
  const petg = new THREE.MeshPhysicalMaterial({
    color: 0x121212, roughness: 0.78, metalness: 0, bumpMap: stipple, bumpScale: 0.35, roughnessMap: stipple,
    sheen: 0.25, sheenRoughness: 0.9, sheenColor: 0x3a3a3a,
  });
  const blackOxide = new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.38, metalness: 0.85 });
  const MATS = {
    shell: petg, base: petg, retainer: petg,
    screen_glass: new THREE.MeshPhysicalMaterial({ color: 0x050608, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03 }),
    screen_corner_posts: new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: 0.25, metalness: 1 }),
    usb_bridge: new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.5, metalness: 0.1 }),
    usb_bridge_black: new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.5, metalness: 0.1 }),
    pi4_metal: new THREE.MeshStandardMaterial({ color: 0xc4c8ce, roughness: 0.28, metalness: 1 }),
    pi4_gold: new THREE.MeshStandardMaterial({ color: 0xd9a845, roughness: 0.3, metalness: 1 }),
    n02_gold: new THREE.MeshStandardMaterial({ color: 0xd9a845, roughness: 0.3, metalness: 1 }),
    nvme_gold: new THREE.MeshStandardMaterial({ color: 0xd9a845, roughness: 0.3, metalness: 1 }),
    radar_gold: new THREE.MeshStandardMaterial({ color: 0xd9a845, roughness: 0.3, metalness: 1 }),
    n02_metal: new THREE.MeshStandardMaterial({ color: 0xc4c8ce, roughness: 0.28, metalness: 1 }),
    usb_bridge_metal: new THREE.MeshStandardMaterial({ color: 0xc4c8ce, roughness: 0.28, metalness: 1 }),
    pi4_pcb: new THREE.MeshStandardMaterial({ color: 0x1f6b3a, roughness: 0.45, metalness: 0 }),
    armor_lite_heatsink: new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.42, metalness: 0.7 }),
    dsi_ribbon: new THREE.MeshStandardMaterial({ color: 0xc87a2a, roughness: 0.55, metalness: 0, side: THREE.DoubleSide }),
  };
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    if (MATS[o.name]) o.material = MATS[o.name];
    else if (/^hw_m(3|25)/.test(o.name)) o.material = blackOxide;   // every screw is black oxide; the inserts stay brass
    if (MATS[o.name] === petg && !o.geometry.attributes.uv) boxUV(o.geometry, 60);
    else if (o.material) { o.material.roughness = Math.max(0.35, o.material.roughness ?? 0.6); o.material.envMapIntensity = 0.8; }
  });
  const pic = root.getObjectByName("screen_picture");
  if (pic) {
    // the screen shows the design picked in the live demo above (its screenshot), lit from within
    pic.material = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
    pic.castShadow = false;
    const loader = new THREE.TextureLoader(), cache = {};
    const setDesign = (id) => {
      const url = `site/shots/${id}.png`;
      const apply = (t) => { pic.material.map = t; pic.material.color.set(0xe8e8e8); pic.material.needsUpdate = true; };
      if (cache[url]) return apply(cache[url]);
      loader.load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.center.set(0.5, 0.5); t.rotation = Math.PI; t.wrapS = THREE.RepeatWrapping; t.repeat.x = -1;   /* the model's screen UVs run the other way */ t.anisotropy = renderer.capabilities.getMaxAnisotropy(); cache[url] = t; apply(t); });
    };
    setDesign(window.currentDesign || "freighter");
    addEventListener("design-change", (e) => setDesign(e.detail));
  }

  // frame the model
  const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
  root.position.sub(centre);
  const radius = size.length() / 2;
  const home = new THREE.Vector3(radius * 1.95, radius * 1.1, radius * 2.5);   // front three-quarter, screen towards you
  camera.position.copy(home); camera.near = radius / 50; camera.far = radius * 20; camera.updateProjectionMatrix();
  controls.target.set(0, 0, 0); controls.minDistance = radius * 1.2; controls.maxDistance = radius * 8;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(radius * 12, radius * 12), new THREE.ShadowMaterial({ opacity: 0.38 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -size.y / 2 - 0.01; ground.receiveShadow = true; scene.add(ground);
  // a generous shadow box, so the exploded parts never run off its edge (that's what cut the shadow off square)
  const sc = key.shadow.camera; sc.left = sc.bottom = -radius * 3.2; sc.right = sc.top = radius * 3.2; sc.near = 1; sc.far = 2000; sc.updateProjectionMatrix();
  const groundY = ground.position.y, groundDrop = 0.45 * size.y + 16;   // the base and its screws drop this far when exploded
  // the floor: the same dot grid as the guide, lying flat in perspective and fading out with distance
  const floor = (() => {
    const css = getComputedStyle(document.documentElement);
    const dot = css.getPropertyValue("--floor-dot").trim() || "rgba(237,235,239,.22)";
    const line = css.getPropertyValue("--floor-line").trim() || "rgba(237,235,239,.06)";
    const SIZE = radius * 9, CELL = 12, N = 2048, k = N / SIZE, gap = 2.2 * k, c = document.createElement("canvas");
    c.width = c.height = N; const g = c.getContext("2d");
    g.strokeStyle = line; g.lineWidth = Math.max(1, 0.35 * k); g.fillStyle = dot;
    for (let x = 0; x <= SIZE; x += CELL) for (let y = 0; y <= SIZE; y += CELL) {
      const px = x * k, py = y * k, step = CELL * k;
      g.beginPath(); g.moveTo(px + gap, py); g.lineTo(px + step - gap, py); g.moveTo(px, py + gap); g.lineTo(px, py + step - gap); g.stroke();
      g.beginPath(); g.arc(px, py, Math.max(1.2, 0.45 * k), 0, Math.PI * 2); g.fill();
    }
    // fade toward the edges so the floor melts into the background
    g.globalCompositeOperation = "destination-in";
    const fade = g.createRadialGradient(N / 2, N / 2, N * 0.12, N / 2, N / 2, N * 0.5);
    fade.addColorStop(0, "rgba(0,0,0,1)"); fade.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = fade; g.fillRect(0, 0, N, N);
    const tex = new THREE.CanvasTexture(c); tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = groundY - 0.05; m.renderOrder = -1; scene.add(m);
    return m;
  })();
  controls.maxPolarAngle = Math.PI * 0.49;   // never look from under the floor
  msg.hidden = true;
  initGuide(THREE, pristine, centre);
  $("modelReset").hidden = false;

  const wiring = root.children.filter((o) => o.name.startsWith("wire_") || o.name.startsWith("hw_dupont"));
  // exploded view: the shell lifts straight off, the base (with the radar in its holder) drops away,
  // and the electronics stack stays put. Parts are matched by their names in the GLB.
  const LIFT = { shell: 0.95, base: -0.45, radar_board: -0.45, radar_dupont_plug: -0.45,
    radar_pcb: -0.45, radar_laminate: -0.45, radar_antenna: -0.45, radar_chips: -0.45, radar_gold: -0.45 };   // the radar stands in the base
  // Fasteners ride with the part they hold, then back a little way out of their hole along their own axis,
  // so you can see where each one goes: inserts below the shell's bosses, base screws below the base,
  // retainer screws just behind their posts.
  const HW = [["hw_insert", "shell", 0.6], ["hw_m3", "base", 0.9], ["hw_m25x25", null, 0.45], ["hw_m25x10", null, 0.6]];
  const parts = root.children.map((o) => {
    if (o.name in LIFT) return { o, base: o.position.clone(), off: new THREE.Vector3(0, LIFT[o.name] * size.y, 0) };
    const hw = HW.find(([pre]) => o.name.startsWith(pre)), ax = o.userData && o.userData.axis;
    if (!hw || !ax) return null;
    const off = new THREE.Vector3(...ax).normalize().multiplyScalar((o.userData.travel || 10) * hw[2]);
    if (hw[1]) off.y += LIFT[hw[1]] * size.y;
    return { o, base: o.position.clone(), off };
  }).filter(Boolean);
  let explode = 0, explodeTo = 0;
  const explodeBtn = $("modelExplode");
  explodeBtn.hidden = parts.length < 2;
  explodeBtn.addEventListener("click", () => {
    explodeTo = explodeTo ? 0 : 1;
    explodeBtn.setAttribute("aria-pressed", explodeTo ? "true" : "false");
  });
  $("modelReset").addEventListener("click", () => {
    camera.position.copy(home).multiplyScalar(1 + 0.8 * explode); controls.target.set(0, 0, 0); controls.update();
  });

  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    camera.zoom = Math.min(1, camera.aspect / 1.3);   // a tall viewer zooms out so the case still fits side to side
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(host); resize();

  // render only while the viewer is on screen
  let visible = true;
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; }).observe(host);
  renderer.setAnimationLoop(() => {
    if (!visible) return;
    if (explode !== explodeTo) {
      const was0 = explode; explode += Math.sign(explodeTo - explode) * (reduceMotion ? 1 : 0.06);
      const was = was0;
      explode = Math.min(1, Math.max(0, explode));
      // pull the camera back as the parts separate, so everything stays in frame
      const k = (1 + 0.8 * explode) / (1 + 0.8 * was);
      camera.position.sub(controls.target).multiplyScalar(k).add(controls.target);
      parts.forEach((p) => p.o.position.copy(p.base).addScaledVector(p.off, explode));
      ground.position.y = groundY - groundDrop * explode;   // the floor follows the base down, so the shadow stays whole
      floor.position.y = ground.position.y - 0.05;
      wiring.forEach((o) => { o.visible = explode < 0.05; });   // the jumper wires can't follow both ends, so they step out of the way
    }
    controls.update(); renderer.render(scene, camera);
  });
}

// ---------- assembly guide: line drawings of the real model, one step per slide ----------
const GROUPS = {
  shell: (n) => n === "shell", base: (n) => n === "base", retainer: (n) => n === "retainer",
  screen: (n) => n.startsWith("screen_"), n02: (n) => n.startsWith("n02_") || n.startsWith("nvme_"),
  pi: (n) => n.startsWith("pi4_") || n.startsWith("armor_lite_") || n === "dsi_ribbon",
  radar: (n) => n.startsWith("radar_"), plug: (n) => n === "usbc_power_plug", bridge: (n) => n.startsWith("usb_bridge"),
  inserts: (n) => n.startsWith("hw_insert"), m3: (n) => n.startsWith("hw_m3"),
  m25l: (n) => n.startsWith("hw_m25x25"), m25s: (n) => n.startsWith("hw_m25x10"),
  wires: (n) => n.startsWith("wire_") || n.startsWith("hw_dupont"),
};
const STACK = ["screen", "n02", "pi"];
const ALL = Object.keys(GROUPS);
// Pi 4 GPIO header in model space (mm, Y-up), measured from the model's header pins (their tips):
// pin 1 on the inner row at the end away from the USB ports; pin 2 beside it on the edge row; columns step along +X.
const HEADER = { pin1: [-25.745, 23.956, -3.961], pin2: [-25.745, 21.503, -3.303], col: [2.54, 0, 0] };
const WIRES = {
  2: ["Radar VCC", "5V", "#E5484D"], 4: ["Fan +", "5V", "#F2994A"], 6: ["Fan −", "GND", "#9AA0A6"],
  7: ["Fan speed", "GPIO 4", "#4C8DF6"], 8: ["Radar RX", "GPIO 14 TX", "#F2C94C"], 10: ["Radar TX", "GPIO 15 RX", "#3CCB7F"],
  14: ["Radar GND", "GND", "#9AA0A6"], 16: ["Radar OUT", "GPIO 23", "#B57BFF"],
};

const STEPS = [
  { title: "Before you start", intro: true, show: ALL, hi: ALL, cam: [35, 18, 1],
    text: "About 30 minutes, start to finish. You'll need the printed shell, base and retainer, the parts from <i>What you need</i>, a <b>soldering iron with an insert tip</b>, a <b>2 mm hex key</b> for the M2.5 socket screws and a <b>screwdriver</b> to match your M3 countersunk screws.",
    tip: "Pull the support material out of the shell first, while you've got good access. PETG supports come off easiest with pliers and a twist." },
  { title: "Fit the threaded inserts", flip: true, show: ["shell", "inserts"], hi: ["inserts"], hw: ["inserts"], cam: [30, 42, 1],
    text: "Stand the shell <b>upside down</b> so the four bosses face up. Set an insert on each hole and press it in with the hot iron. Each hole has a small bevel that centres the insert.",
    tip: "Keep them flat. Let the heat do the work and push gently; stop when the insert is just flush. While it's still warm, press something flat and metal on top, like the side of a screwdriver, to square it up." },
  { title: "Build the stack", show: STACK, hi: ["n02", "pi"], off: { n02: [0, 0, -10], pi: [0, 0, -26] }, cam: [150, 18, 1],
    text: "Fit the <b>N02 board</b> to the back of the screen on the brass standoffs, NVMe drive facing the screen. Then the <b>Pi</b> on the N02, then the <b>cooler</b> on the Pi. Leave the USB bridge off for now.",
    tip: "Connect the display ribbon before the Pi goes on, while you can see the latch. Lift the latch, slide the ribbon in fully, press the latch down, then give it a gentle tug to check." },
  { title: "Seat the radar", show: ["base", "radar"], hi: ["radar"], off: { radar: [0, 16, 0] }, cam: [25, 26, 0.7],
    text: "Push the five jumper wires onto the radar's pins, then stand the board in the cradle on the base, pin row at the top. Lead the wires back through the slot in the block.",
    tip: "Dry-fit it first, then a tiny dab of super glue in the grooves. Less is more: too much wicks onto the board, and you might want it out one day." },
  { title: "Screw on the retainer", show: [...STACK, "retainer", "m25l"], hi: ["retainer", "m25l"], hw: ["m25l"], cam: [205, 22, 1],
    text: "Screw the retainer to the screen with the <b>4 M2.5 × 25</b> screws, through its posts into the screen's corner posts.",
    tip: "Start all four by hand, then tighten in a criss-cross so the frame pulls down evenly. Stop as soon as they're snug: the posts are small, and longer screws can reach the panel." },
  { title: "Stand it on the base", show: [...STACK, "retainer", "m25l", "base", "radar", "m25s"], hi: ["base", "m25s"], hw: ["m25s"], cam: [150, 20, 1],
    text: "Stand the stack on the base with the retainer's bottom bar against the block, and fix it with the <b>2 M2.5 × 10</b> screws.",
    tip: "Check the radar wires before you tighten: they should sit in the slot, not under the bar. A pinched wire is a pain to find later." },
  { title: "Wire it up", show: [...STACK, "wires"], hi: ["wires"], pins: true, cam: [180, -15, 1],
    text: "With the power unplugged, push the jumper wires onto the Pi's header. <b>Radar:</b> VCC → 2, GND → 14, RX → 8, TX → 10, OUT → 16. <b>Cooler fan:</b> red → 4, black → 6, blue → 7. Then plug the right-angle USB-C cable into the doorway in the retainer's top bar.",
    tip: "Count from pin 1, the one with the square pad, and double-check RX and TX: they cross over (the radar's RX goes to the Pi's TX). Swapping them won't break anything; the radar just won't talk. The N02's spring pins touch the underside of pins 2, 4 and 6, and wires on top are fine." },
  { title: "Lower the shell", show: ["shell", "inserts", ...STACK, "retainer", "m25l", "m25s", "base", "radar", "plug", "wires"], hi: ["shell"], off: { shell: [0, 44, 4], inserts: [0, 44, 4] }, cam: [35, 20, 1],
    text: "Lower the shell over the stack, starting about <b>3 mm forward</b> so the front bosses pass in front of the glass. Once they're below the glass, slide it back and down the rest of the way.",
    tip: "If it binds, don't force it. Lift it off and start again a little further forward; it should drop the last bit on its own." },
  { title: "Screw the base on", show: ["shell", "inserts", ...STACK, "retainer", "base", "radar", "plug", "m3", "wires"], hi: ["m3"], hw: ["m3"], cam: [30, -42, 1],
    text: "Turn it over and fit the <b>4 M3 × 8 countersunk</b> screws through the base into the inserts.",
    tip: "Snug, not tight. The inserts are only held by plastic, and over-tightening can spin one loose in its boss." },
  { title: "Close it up", show: ALL, hi: ["bridge"], off: { bridge: [22, 0, 0] }, cam: [62, 12, 0.72],
    text: "Push the <b>USB bridge</b> into the slot on the right and plug in Ethernet next to it. Done.",
    tip: "Power it up before it goes on the shelf: the desktop and then the dashboard should appear within a minute or two. If the screen stays black, reseat the display ribbon first." },
];

function initGuide(THREE, source, centre) {
  const canvas = $("guideCanvas"), view = canvas.parentElement, gmsg = $("guideMsg");
  const css = getComputedStyle(document.documentElement);
  const col = (v, f) => new THREE.Color((css.getPropertyValue(v) || f).trim() || f);
  const C = { line: col("--muted", "#888"), hi: col("--accent", "#E0523A"), fill: col("--sunk", "#141418") };

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 16 / 9, 1, 5000);
  source.position.sub(centre);   // centre the copy the same way as the main model

  // every part becomes a hidden-line drawing: a fill in the card colour (hides lines behind it) + its edges
  const fillMat = new THREE.MeshBasicMaterial({ color: C.fill, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const parts = [];
  source.updateMatrixWorld(true);
  source.traverse((o) => {
    if (!o.isMesh) return;
    const group = ALL.find((g) => GROUPS[g](o.name)); if (!group) return;
    const node = new THREE.Group(); node.applyMatrix4(o.matrixWorld);
    node.add(new THREE.Mesh(o.geometry, fillMat));
    const mat = new THREE.LineBasicMaterial({ color: C.line, transparent: true, opacity: 0.55 });
    node.add(new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 28), mat));
    scene.add(node);
    const ax = o.userData && o.userData.axis, travel = (o.userData && o.userData.travel) || 12;
    parts.push({ node, group, mat, base: node.position.clone(), from: new THREE.Vector3(), to: new THREE.Vector3(),
      out: ax ? new THREE.Vector3(...ax).normalize().multiplyScalar(travel) : null });
  });
  // header pin tips in guide space (the copy is centred, so subtract the same centre)
  const pinPos = (n) => {
    const base = new THREE.Vector3(...(n % 2 ? HEADER.pin1 : HEADER.pin2)).sub(centre);
    return base.addScaledVector(new THREE.Vector3(...HEADER.col), Math.floor((n - 1) / 2));
  };
  const box = new THREE.Box3(); parts.forEach((p) => box.expandByObject(p.node));
  const radius = box.getSize(new THREE.Vector3()).length() / 2;
  gmsg.hidden = true;

  const camFrom = new THREE.Vector3(), camTo = new THREE.Vector3(), tgt = new THREE.Vector3(), tgtFrom = new THREE.Vector3(), tgtTo = new THREE.Vector3();
  // frame what this step shows: aim at the middle of its visible parts and back off until they fit
  const frame = (s) => {
    if (s.pins) {   // zoom in on pins 1–20 of the header
      const hb = new THREE.Box3().setFromPoints([pinPos(1), pinPos(2), pinPos(19), pinPos(20)]).expandByScalar(2.5);
      const c = hb.getCenter(new THREE.Vector3()), r = hb.getSize(new THREE.Vector3()).length() / 2;
      c.y -= 4;   // aim a little low so the header sits above the colour key
      const fit = r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.95 * s.cam[2];
      const a = THREE.MathUtils.degToRad(s.cam[0]), e = THREE.MathUtils.degToRad(s.cam[1]);
      return [c, c.clone().add(new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).multiplyScalar(fit))];
    }
    const b = new THREE.Box3(), keep = [], rot = scene.rotation.x;
    scene.rotation.x = s.flip ? Math.PI : 0; scene.updateMatrixWorld(true);
    parts.forEach((p) => { if (!s.show.includes(p.group)) return; keep.push([p, p.node.position.clone()]); p.node.position.copy(p.to); p.node.updateMatrixWorld(true); b.expandByObject(p.node); });
    keep.forEach(([p, pos]) => p.node.position.copy(pos));
    scene.rotation.x = rot; scene.updateMatrixWorld(true);
    const c = b.getCenter(new THREE.Vector3()), r = b.getSize(new THREE.Vector3()).length() / 2;
    const fit = r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * (camera.aspect < 1.3 ? 1.25 : 0.95) * s.cam[2];
    const a = THREE.MathUtils.degToRad(s.cam[0]), e = THREE.MathUtils.degToRad(s.cam[1]);
    return [c, c.clone().add(new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).multiplyScalar(fit))];
  };
  const resize = () => {
    const w = view.clientWidth, h = view.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    if (parts.length) { const [c, pos] = frame(STEPS[step]); if (!anim) { camera.position.copy(pos); tgt.copy(c); } }
    draw();
  };
  const pinsSvg = $("guidePins");
  const draw = () => {
    camera.lookAt(tgt); renderer.render(scene, camera);
    // pin markers follow the drawing: project each used pin onto the canvas
    if (!STEPS[step] || !STEPS[step].pins || anim) { pinsSvg.innerHTML = ""; return; }
    const w = view.clientWidth, h = view.clientHeight;
    const pitch = pinPos(1).project(camera).distanceTo(pinPos(3).project(camera)) * w / 2, k = Math.max(6, Math.min(13, pitch * 0.42));
    pinsSvg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    pinsSvg.innerHTML = Object.entries(WIRES).map(([n, wv]) => {
      const v = pinPos(+n).project(camera), x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * h;
      return `<circle cx="${x}" cy="${y}" r="${k}" fill="${wv[2]}" stroke="var(--sunk)" stroke-width="2"/>` +
        `<text x="${x}" y="${y + k * 0.36}" text-anchor="middle" font-size="${k}" font-family="Inter, sans-serif" font-weight="800" fill="#111">${n}</text>`;
    }).join("") + (() => { const v = pinPos(1).project(camera), x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * h;
      return `<rect x="${x - k * 0.75}" y="${y - k * 0.75}" width="${k * 1.5}" height="${k * 1.5}" rx="2" fill="none" stroke="var(--ink)" stroke-width="1.5"/><text x="${x}" y="${y - k * 1.2}" text-anchor="middle" font-size="${k * 0.85}" font-family="Inter, sans-serif" font-weight="700" fill="var(--ink)">pin 1</text>`; })();
  };

  let step = 0, t0 = 0, anim = false, rotFrom = 0, rotTo = 0;
  const dots = $("guideDots");
  dots.innerHTML = STEPS.map((s, i) => `<button type="button" role="tab" aria-label="Step ${i + 1}: ${s.title}"></button>`).join("");
  function go(i, instant) {
    step = (i + STEPS.length) % STEPS.length;
    const s = STEPS[step];
    $("guideTitle").textContent = s.title;
    $("guideText").innerHTML = s.text +
      (s.tip ? `<span class="tip"><b>Pro tip</b> ${s.tip}</span>` : "") +
      (s.intro ? `<button class="start" type="button" data-start>Start building →</button>` : "");
    $("guideCount").textContent = s.intro ? `${STEPS.length - 1} steps` : `Step ${step} of ${STEPS.length - 1}`;
    [...dots.children].forEach((d, k) => d.setAttribute("aria-selected", k === step ? "true" : "false"));
    $("guideLegend").hidden = !s.pins;
    if (s.pins) $("guideLegend").innerHTML = Object.entries(WIRES).map(([n, w]) => `<li><i style="background:${w[2]}"></i><b>${n}</b>${w[0]} · ${w[1]}</li>`).join("");
    parts.forEach((p) => {
      p.node.visible = s.show.includes(p.group);
      const hi = s.hi.includes(p.group);
      p.mat.color.copy(hi ? C.hi : C.line); p.mat.opacity = hi ? 1 : 0.7;
      p.from.copy(p.node.position);
      p.to.copy(p.base).add(new THREE.Vector3(...((s.off && s.off[p.group]) || [0, 0, 0])));
      p.drive = !!(s.hw && s.hw.includes(p.group) && p.out);   // screws and inserts slide in along their axis
      if (p.drive) { p.from.copy(p.to).add(p.out); p.node.position.copy(p.from); }
    });
    rotFrom = scene.rotation.x; rotTo = s.flip ? Math.PI : 0;
    const [c, pos] = frame(s);
    camFrom.copy(camera.position); camTo.copy(pos); tgtFrom.copy(tgt); tgtTo.copy(c);
    if (instant || reduceMotion) { parts.forEach((p) => p.node.position.copy(p.to)); scene.rotation.x = rotTo; camera.position.copy(camTo); tgt.copy(tgtTo); draw(); return; }
    t0 = performance.now(); if (!anim) { anim = true; requestAnimationFrame(tick); }
  }
  function tick(now) {
    const k = Math.min(1, (now - t0) / 650), e = 1 - Math.pow(1 - k, 3);
    // hardware goes in after the camera settles, three times over (go in, hold, pop back out), then stays in
    const LOOPS = 3, MOVE = 900, HOLD = 700, el = now - t0 - 500, cyc = Math.floor(el / (MOVE + HOLD));
    const kh = el <= 0 ? 0 : cyc >= LOOPS ? 1 : Math.min(1, (el - cyc * (MOVE + HOLD)) / MOVE), eh = kh * kh * (3 - 2 * kh);
    parts.forEach((p) => p.node.position.lerpVectors(p.from, p.to, p.drive ? eh : e));
    scene.rotation.x = rotFrom + (rotTo - rotFrom) * e;
    camera.position.lerpVectors(camFrom, camTo, e); tgt.lerpVectors(tgtFrom, tgtTo, e); draw();
    const looping = parts.some((p) => p.drive) && el < LOOPS * (MOVE + HOLD);
    if (k < 1 || kh < 1 || looping) requestAnimationFrame(tick); else { anim = false; draw(); }
  }

  $("guideText").addEventListener("click", (e) => { if (e.target.closest("[data-start]")) go(1); });
  $("guidePrev").addEventListener("click", () => go(step - 1));
  $("guideNext").addEventListener("click", () => go(step + 1));
  dots.addEventListener("click", (e) => { const i = [...dots.children].indexOf(e.target); if (i >= 0) go(i); });
  $("guide").addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); go(step + 1); } else if (e.key === "ArrowLeft") { e.preventDefault(); go(step - 1); }
  });
  let x0 = null;   // swipe between steps
  view.addEventListener("pointerdown", (e) => { x0 = e.clientX; });
  view.addEventListener("pointerup", (e) => { if (x0 !== null && Math.abs(e.clientX - x0) > 40) go(step + (e.clientX < x0 ? 1 : -1)); x0 = null; });

  new ResizeObserver(resize).observe(view);
  go(0, true); resize();
}
