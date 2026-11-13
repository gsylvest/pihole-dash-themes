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
io.observe(host);

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
  const key = new THREE.DirectionalLight(0xfff1e0, 2.4); key.position.set(120, 260, 180);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 6; key.shadow.bias = -0.0004;
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
  const home = new THREE.Vector3(radius * 1.7, radius * 0.95, radius * 2.15);   // front three-quarter, screen towards you
  camera.position.copy(home); camera.near = radius / 50; camera.far = radius * 20; camera.updateProjectionMatrix();
  controls.target.set(0, 0, 0); controls.minDistance = radius * 1.2; controls.maxDistance = radius * 8;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(radius * 12, radius * 12), new THREE.ShadowMaterial({ opacity: 0.32 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -size.y / 2 - 0.01; ground.receiveShadow = true; scene.add(ground);
  const sc = key.shadow.camera; sc.left = sc.bottom = -radius * 1.6; sc.right = sc.top = radius * 1.6; sc.near = 1; sc.far = 1200; sc.updateProjectionMatrix();
  controls.maxPolarAngle = Math.PI * 0.49;   // never look from under the floor
  msg.hidden = true;
  initGuide(THREE, pristine, centre);
  $("modelReset").hidden = false;

  // exploded view: the shell lifts straight off, the base (with the radar in its holder) drops away,
  // and the electronics stack stays put. Parts are matched by their names in the GLB.
  const LIFT = { shell: 0.95, base: -0.45, radar_board: -0.45, radar_dupont_plug: -0.45,
    radar_pcb: -0.45, radar_laminate: -0.45, radar_antenna: -0.45, radar_chips: -0.45, radar_gold: -0.45 };   // the radar stands in the base
  const parts = root.children.filter((o) => o.name in LIFT)
    .map((o) => ({ o, base: o.position.clone(), dir: new THREE.Vector3(0, LIFT[o.name], 0) }));
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
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
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
      parts.forEach((p) => p.o.position.copy(p.base).addScaledVector(p.dir, explode * size.y));
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
};
const ALL = Object.keys(GROUPS);
const STEPS = [
  { title: "Fit the threaded inserts", show: ["shell"], hi: ["shell"], cam: [35, -48, 1],
    text: "Turn the shell upside down and press the <b>4 M3 heat-set inserts</b> into the bosses with a soldering iron. Each hole has a small bevel to centre the insert." },
  { title: "Build the stack", show: ["screen", "n02", "pi"], hi: ["n02", "pi"], off: { n02: [0, 0, -10], pi: [0, 0, -26] }, cam: [150, 18, 1],
    text: "Fit the <b>N02 board</b> to the back of the screen with the NVMe drive facing the screen, then the <b>Pi</b> on the N02, then the <b>cooler</b>. Connect the display ribbon. Leave the USB bridge off for now." },
  { title: "Seat the radar", show: ["base", "radar"], hi: ["radar"], off: { radar: [0, 16, 0] }, cam: [25, 26, 0.7],
    text: "Push the five jumper wires onto the radar's pins and stand it in the cradle on the base, pin row at the top. Lead the wires back through the slot in the block.",
    warn: "Put a small dab of super glue in the cradle first, so the board can't rattle loose." },
  { title: "Screw on the retainer", show: ["screen", "n02", "pi", "retainer"], hi: ["retainer"], off: { retainer: [0, 0, -18] }, cam: [205, 22, 1],
    text: "Screw the retainer to the screen with the <b>4 M2.5 × 25</b> screws, through its posts into the screen's corner posts. Don't use longer screws: they can reach the panel." },
  { title: "Stand it on the base", show: ["screen", "n02", "pi", "retainer", "base", "radar"], hi: ["base"], off: { screen: [0, 22, 0], n02: [0, 22, 0], pi: [0, 22, 0], retainer: [0, 22, 0] }, cam: [150, 20, 1],
    text: "Stand the stack on the base with the retainer's bottom bar against the block, and fix it with the <b>2 M2.5 × 10</b> screws." },
  { title: "Wire it up", show: ["screen", "n02", "pi", "retainer", "base", "radar", "plug"], hi: ["radar", "plug"], cam: [185, 32, 1],
    text: "Radar to the Pi's header: <b>5 V → pin 2</b>, <b>GND → 14</b>, <b>RX → 8</b>, <b>TX → 10</b>, <b>OUT → 16</b>. Plug the right-angle USB-C cable into the doorway in the retainer's top bar and run it down the back." },
  { title: "Lower the shell", show: ["shell", "screen", "n02", "pi", "retainer", "base", "radar", "plug"], hi: ["shell"], off: { shell: [0, 44, 4] }, cam: [35, 20, 1],
    text: "Lower the shell over the stack, starting about <b>3 mm forward</b> so the front bosses pass in front of the glass. Once they're below the glass, slide it back and down the rest of the way." },
  { title: "Close it up", show: ALL, hi: ["bridge"], off: { bridge: [22, 0, 0] }, cam: [62, 12, 0.72],
    text: "Turn it over and fit the <b>4 M3 × 8 countersunk</b> screws through the base. Push the <b>USB bridge</b> into the slot on the right and plug in Ethernet next to it. Done." },
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
    parts.push({ node, group, mat, base: node.position.clone(), from: new THREE.Vector3(), to: new THREE.Vector3() });
  });
  const box = new THREE.Box3(); parts.forEach((p) => box.expandByObject(p.node));
  const radius = box.getSize(new THREE.Vector3()).length() / 2;
  gmsg.hidden = true;

  const camFrom = new THREE.Vector3(), camTo = new THREE.Vector3(), tgt = new THREE.Vector3(), tgtFrom = new THREE.Vector3(), tgtTo = new THREE.Vector3();
  // frame what this step shows: aim at the middle of its visible parts and back off until they fit
  const frame = (s) => {
    const b = new THREE.Box3(), keep = [];
    parts.forEach((p) => { if (!s.show.includes(p.group)) return; keep.push([p, p.node.position.clone()]); p.node.position.copy(p.to); b.expandByObject(p.node); });
    keep.forEach(([p, pos]) => p.node.position.copy(pos));
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
  const draw = () => { camera.lookAt(tgt); renderer.render(scene, camera); };

  let step = 0, t0 = 0, anim = false;
  const dots = $("guideDots");
  dots.innerHTML = STEPS.map((s, i) => `<button type="button" role="tab" aria-label="Step ${i + 1}: ${s.title}"></button>`).join("");
  function go(i, instant) {
    step = (i + STEPS.length) % STEPS.length;
    const s = STEPS[step];
    $("guideCount").textContent = `Step ${step + 1} of ${STEPS.length}`;
    $("guideTitle").textContent = s.title;
    $("guideText").innerHTML = s.text + (s.warn ? `<br><span class="warn">${s.warn}</span>` : "");
    [...dots.children].forEach((d, k) => d.setAttribute("aria-selected", k === step ? "true" : "false"));
    parts.forEach((p) => {
      p.node.visible = s.show.includes(p.group);
      const hi = s.hi.includes(p.group);
      p.mat.color.copy(hi ? C.hi : C.line); p.mat.opacity = hi ? 1 : 0.7;
      p.from.copy(p.node.position);
      p.to.copy(p.base).add(new THREE.Vector3(...((s.off && s.off[p.group]) || [0, 0, 0])));
    });
    const [c, pos] = frame(s);
    camFrom.copy(camera.position); camTo.copy(pos); tgtFrom.copy(tgt); tgtTo.copy(c);
    if (instant || reduceMotion) { parts.forEach((p) => p.node.position.copy(p.to)); camera.position.copy(camTo); tgt.copy(tgtTo); draw(); return; }
    t0 = performance.now(); if (!anim) { anim = true; requestAnimationFrame(tick); }
  }
  function tick(now) {
    const k = Math.min(1, (now - t0) / 650), e = 1 - Math.pow(1 - k, 3);
    parts.forEach((p) => p.node.position.lerpVectors(p.from, p.to, e));
    camera.position.lerpVectors(camFrom, camTo, e); tgt.lerpVectors(tgtFrom, tgtTo, e); draw();
    if (k < 1) requestAnimationFrame(tick); else anim = false;
  }

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
