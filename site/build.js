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
  renderer.domElement.addEventListener("pointerdown", () => { controls.autoRotate = false; swing = null; });

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
    color: 0x0e0e0f, roughness: 0.82, metalness: 0, bumpMap: stipple, bumpScale: 0.22,
  });
  const blackOxide = new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.38, metalness: 0.85 });
  // Ethernet plug: black boot, with only the connector end (the part that goes into the jack) gold-plated.
  const ethPlug = new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.6, metalness: 0 });
  ethPlug.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying float vPlugX;").replace("#include <begin_vertex>", "#include <begin_vertex>\n  vPlugX = position.x;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vPlugX;")
      .replace("#include <color_fragment>", "#include <color_fragment>\n  float plugGold = step(vPlugX, 65.0);\n  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.69, 0.39, 0.06), plugGold);")
      .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\n  metalnessFactor = mix(metalnessFactor, 1.0, plugGold);")
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.35, plugGold);");
  };
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
    eth_cable: new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.6, metalness: 0 }),   // black patch lead, gold-plated plug
    eth_plug: ethPlug,
    usbc_cable: new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.6, metalness: 0 }),   // black USB-C extension, bare metal ends
    usbc_socket_black: new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.6, metalness: 0 }),
    usbc_plug_metal: new THREE.MeshStandardMaterial({ color: 0xc4c8ce, roughness: 0.28, metalness: 1 }),
    usbc_socket_metal: new THREE.MeshStandardMaterial({ color: 0xc4c8ce, roughness: 0.28, metalness: 1 }),
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
  const groundY = ground.position.y, groundDrop = 0.55 * size.y + 16;   // the base and its screws drop this far when exploded
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

  const wiring = root.children.filter((o) => o.name.startsWith("wire_") || o.name.startsWith("hw_dupont") || o.name.startsWith("usbc_") || o.name.startsWith("eth_"));   // cables span parts that come apart
  // exploded view: the shell lifts straight off, the base (with the radar in its holder) drops away,
  // and the electronics stack stays put. Parts are matched by their names in the GLB.
  // Two-stage exploded view. Stage 1 opens the case: shell up, base (with the radar and its screws) down, the
  // screen-and-Pi stack drops a little so it sits between them, and the USB bridge slides out to the side.
  // Stage 2 fans the stack out backwards along the boards' axis: screen, NVMe, N02, Pi, cooler, retainer.
  const H = size.y, BACK = new THREE.Vector3(0, -0.259, -0.966);   // out of the back of the screen (it leans back 15°)
  const STACK_DROP = -0.12 * H, LAYER = 20;
  const rules = [
    // [name test, stage-1 offset, stage-2 layer (how many LAYERs back), axis-travel factor for fasteners]
    [(n) => n === "shell", [0, 1.15 * H, 0], 0],
    [(n) => n.startsWith("hw_insert"), [0, 1.15 * H, 0], 0, 0.6],
    [(n) => n === "base" || n === "base_glue" || n.startsWith("radar_"), [0, -0.55 * H, 0], 0],
    [(n) => n.startsWith("hw_m3"), [0, -0.55 * H, 0], 0, 0.9],
    [(n) => n.startsWith("usb_bridge"), [32, STACK_DROP, 0], 2],
    [(n) => n.startsWith("screen_"), [0, STACK_DROP, 0], 0],
    [(n) => n.startsWith("nvme_") || n.startsWith("hw_standoff_a") || n === "hw_nvme_screw", [0, STACK_DROP, 0], 1],
    [(n) => n.startsWith("hw_standoff_b"), [0, STACK_DROP, 0], 2],
    [(n) => n.startsWith("hw_m25_pi"), [0, STACK_DROP, 0], 3],
    [(n) => n.startsWith("n02_"), [0, STACK_DROP, 0], 2],
    [(n) => n.startsWith("pi4_") || n === "dsi_ribbon", [0, STACK_DROP, 0], 3],
    [(n) => n.startsWith("armor_lite"), [0, STACK_DROP, 0], 4],
    [(n) => n === "retainer", [0, STACK_DROP, 0], 5],
    [(n) => n.startsWith("hw_m25x25"), [0, STACK_DROP, 0], 5, 0.45],
    [(n) => n.startsWith("hw_m25x10"), [0, STACK_DROP, 0], 5, 0.6],
  ];
  const parts = root.children.map((o) => {
    const r = rules.find(([test]) => test(o.name)); if (!r) return null;
    const off1 = new THREE.Vector3(...r[1]), ax = o.userData && o.userData.axis;
    if (r[3] && ax) off1.addScaledVector(new THREE.Vector3(...ax).normalize(), (o.userData.travel || 10) * r[3]);
    return { o, base: o.position.clone(), off1, off2: BACK.clone().multiplyScalar(r[2] * LAYER) };
  }).filter(Boolean);
  let e1 = 0, e2 = 0, stage = 0;
  const explodeBtn = $("modelExplode");
  explodeBtn.hidden = parts.length < 2;
  const LABELS = ["Explode", "Explode the insides", "Put it back together"];
  explodeBtn.textContent = LABELS[0];
  let swing = null;   // camera direction to glide to (the insides fan out backwards, so look from the side)
  explodeBtn.addEventListener("click", () => {
    stage = (stage + 1) % 3;
    explodeBtn.textContent = LABELS[stage];
    explodeBtn.setAttribute("aria-pressed", stage ? "true" : "false");
    controls.autoRotate = false;
    swing = stage === 2 ? new THREE.Vector3(1, 0.32, -0.15).normalize() : stage === 0 ? home.clone().normalize() : null;
  });
  $("modelReset").addEventListener("click", () => {
    camera.position.copy(home).multiplyScalar(1 + 0.75 * e1 + 0.45 * e2); controls.target.set(0, 0, 0); controls.update();
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
    const t1 = stage >= 1 ? 1 : 0, t2 = stage >= 2 ? 1 : 0;
    if (e1 !== t1 || e2 !== t2) {
      const sp = reduceMotion ? 1 : 0.06, was = 1 + 0.75 * e1 + 0.45 * e2;
      // put things back in reverse order: the insides close up before the case does
      if (t2 < e2) e2 = Math.max(0, e2 - sp);                       // closing: the insides first
      else if (e1 !== t1) e1 = Math.min(1, Math.max(0, e1 + Math.sign(t1 - e1) * sp));   // then the case
      else e2 = Math.min(1, e2 + sp);                                  // opening the insides, once the case is open
      // pull the camera back as the parts separate, so everything stays in frame
      const k = (1 + 0.75 * e1 + 0.45 * e2) / was;
      camera.position.sub(controls.target).multiplyScalar(k).add(controls.target);
      const ease = (x) => x * x * (3 - 2 * x), a1 = ease(e1), a2 = ease(e2);
      parts.forEach((p) => p.o.position.copy(p.base).addScaledVector(p.off1, a1).addScaledVector(p.off2, a2));
      ground.position.y = groundY - groundDrop * a1;   // the floor follows the base down, so the shadow stays whole
      floor.position.y = ground.position.y - 0.05;
      wiring.forEach((o) => { o.visible = e1 < 0.05; });   // the jumper wires can't follow both ends, so they step out of the way
    }
    if (swing) {   // glide the camera round, keeping its distance
      const off = camera.position.clone().sub(controls.target), d = off.length();
      off.normalize().lerp(swing, reduceMotion ? 1 : 0.07).normalize();
      camera.position.copy(controls.target).addScaledVector(off, d);
      if (off.distanceTo(swing) < 0.002) swing = null;
    }
    controls.update(); renderer.render(scene, camera);
  });
}

// ---------- assembly guide: line drawings of the real model, one step per slide ----------
const GROUPS = {
  shell: (n) => n === "shell", base: (n) => n === "base", retainer: (n) => n === "retainer",
  screen: (n) => n.startsWith("screen_"), n02: (n) => n.startsWith("n02_") && n !== "n02_pogo",
  nvme: (n) => n.startsWith("nvme_") && n !== "nvme_thermal_pad", pad: (n) => n === "nvme_thermal_pad", pogo: (n) => n === "n02_pogo",
  pi: (n) => n.startsWith("pi4_"), ribbon: (n) => n === "dsi_ribbon", cooler: (n) => n.startsWith("armor_lite_"),
  radar: (n) => n.startsWith("radar_"), glue: (n) => n === "base_glue",
  plug: (n) => n.startsWith("usbc_"), bridge: (n) => n.startsWith("usb_bridge"), eth: (n) => n.startsWith("eth_"),
  inserts: (n) => n.startsWith("hw_insert"), m3: (n) => n.startsWith("hw_m3"),
  m25l: (n) => n.startsWith("hw_m25x25"), m25s: (n) => n.startsWith("hw_m25x10"),
  standA: (n) => n.startsWith("hw_standoff_a"), standB: (n) => n.startsWith("hw_standoff_b"),
  piScrews: (n) => n.startsWith("hw_m25_pi"), nvmeScrew: (n) => n === "hw_nvme_screw",
  wires: (n) => n.startsWith("wire_") || n.startsWith("hw_dupont"),
};
const STACK = ["screen", "standA", "nvme", "pad", "nvmeScrew", "n02", "pogo", "standB", "pi", "ribbon", "cooler", "piScrews"];   // the screen-to-Pi stack, built
const ALL = Object.keys(GROUPS);
// Pi 4 GPIO header in model space (mm, Y-up), measured from the model's header pins (their tips):
// pin 1 on the inner row at the end away from the USB ports; pin 2 beside it on the edge row; columns step along +X.
const HEADER = { pin1: [-25.745, 23.956, -3.961], pin2: [-25.745, 21.503, -3.303], col: [2.54, 0, 0] };
const WIRES = {
  2: ["Radar VCC", "5V", "#E5484D"], 4: ["Fan +", "5V", "#F2994A"], 6: ["Fan −", "GND", "#9AA0A6"],
  7: ["Fan speed", "GPIO 4", "#4C8DF6"], 8: ["Radar RX", "GPIO 14 TX", "#F2C94C"], 10: ["Radar TX", "GPIO 15 RX", "#3CCB7F"],
  14: ["Radar GND", "GND", "#9AA0A6"], 16: ["Radar OUT", "GPIO 23", "#B57BFF"],
};

const CASE = [...STACK, "retainer", "m25l", "m25s", "base", "radar", "glue"];
const STEPS = [
  { title: "Before you start", intro: true, show: ALL, hi: ALL, cam: [35, 18, 1],
    text: "About 30 minutes of building, plus the software setup halfway through. You'll need the printed shell, base and retainer, the parts from <i>What you need</i>, a <b>soldering iron with an insert tip</b>, a <b>2 mm hex key</b> (it fits every screw in the build) and a small Phillips screwdriver for the NVMe screw.",
    tip: "Pull the support material out of the shell first, while you've got good access. PETG supports come off easiest with pliers and a twist." },
  { title: "Fit the threaded inserts", flip: true, show: ["shell", "inserts"], hi: ["inserts"], hw: ["inserts"], cam: [30, 42, 1],
    text: "Stand the shell <b>upside down</b> so the four bosses face up. Set an insert on each hole and press it in with the hot iron. Each hole has a small bevel that centres the insert.",
    tip: "Keep them flat. Let the heat do the work and push gently; stop when the insert is just flush. While it's still warm, press something flat and metal on top, like the side of a screwdriver, to square it up." },
  { title: "Standoffs on the screen", show: ["screen", "standA"], hi: ["standA"], hw: ["standA"], cam: [170, 28, 1],
    text: "Lay the screen face down on something soft and screw <b>four M2.5 brass standoffs</b> into the Pi mounting posts on the back of the display.",
    tip: "Finger-tight is plenty. They're brass into small posts, and you'll be pushing a board onto them, not hanging weight off them." },
  { title: "Fit the NVMe drive", show: ["n02", "nvme", "pad", "nvmeScrew"], hi: ["nvme", "nvmeScrew"], hi2: ["pad"], insert: true, cam: [72, 18, 0.8],
    text: "Slide the <b>NVMe drive</b> into the N02's M.2 slot at a slight angle, press it flat and fix it with the little screw at the end. <i>Optional:</i> stick a <b>thermal pad</b> on the drive's controller chip first.",
    tip: "The drive only goes in one way: the notch in its gold fingers lines up with the key in the slot. If it won't seat, flip it rather than push harder." },
  { title: "N02 onto the screen", show: ["screen", "standA", "nvme", "pad", "nvmeScrew", "n02", "pogo", "standB"], hi: ["n02", "standB"], hi2: ["pogo"], hw: ["standB"], cam: [160, 22, 1],
    text: "Set the <b>N02 board</b> on the standoffs with the drive facing the back of the screen. Then screw the <b>standoffs that came with the N02</b> on top of it, through the board into the ones below. Note the <b>three spring pins</b> (blue): they'll press on the Pi's header in the next step.",
    tip: "Drive side towards the screen, every time: if the N02's chips are facing you, it's upside down. Snug the new standoffs by hand, then a quarter turn more" },
  { title: "Pi onto the N02", show: ["screen", "standA", "nvme", "pad", "nvmeScrew", "n02", "pogo", "standB", "pi"], hi: ["pi"], hi2: ["pogo"], lower: ["pi"], focus: ["pogo"], cam: [215, -50, 1],
    text: "Lower the <b>Pi</b> onto the N02's standoffs, component side out. Don't screw it down yet: the cooler's screws hold it.",
    tip: "Line up the N02's <b>three spring pins</b> (blue) with the underside of the Pi's header pins 2, 4 and 6 before it touches down. They power the N02; if they miss, the drive won't show up." },
  { title: "Check the three spring pins", important: true, show: ["screen", "standA", "nvme", "pad", "nvmeScrew", "n02", "pogo", "standB", "pi", "bumps"], hi: ["pi", "bumps"], hi2: ["pogo"], focus: ["pogo"], cam: [320, -45, 0.62],
    text: "Before going any further, look into the gap between the two boards. The N02's <b>three spring pins</b> (blue) must each be pressing on a solder bump on the <b>underside of the Pi</b>, directly beneath header pins 2, 4 and 6 at the pin-1 corner.",
    tip: "These three pins are the N02's only power. If one sits beside its bump instead of on it, the drive won't show up later and you'd have to strip the stack down to fix it. Lift the Pi and reseat it until all three land." },
  { title: "Connect the display ribbon", show: ["screen", "standA", "nvme", "pad", "nvmeScrew", "n02", "pogo", "standB", "pi", "ribbon"], hi: ["ribbon"], cam: [200, 30, 0.9],
    text: "Plug the screen's <b>ribbon cable</b> into the Pi's <b>DISPLAY</b> port (not CAMERA): lift the latch, slide the ribbon in fully, press the latch down.",
    tip: "Do this now, before the cooler goes on. With the cooler in place the latch is almost impossible to reach. Give the ribbon a gentle tug afterwards: it shouldn't move." },
  { title: "Pads and cooler on", show: STACK, hi: ["cooler", "piScrews"], hw: ["piScrews"], lower: ["cooler"], cam: [150, 20, 1],
    text: "Stick the cooler's <b>thermal pads</b> on the Pi's chips, set the <b>cooler</b> on top, and screw it down through the Pi into the N02's standoffs: <b>2 × M2.5 × 10</b> through the cooler's two thicker corners, <b>2 × M2.5 × 6</b> through the thin ones.",
    tip: "Peel both sides of each pad's film, and check every pad lands on its chip before the cooler goes down. Tighten the four screws a little at a time, corner to corner, so the cooler sits flat and doesn't rock." },
  { title: "Set it up on the bench", show: STACK, hi: STACK, cam: [150, 20, 1],
    text: "Before anything goes in the case, do the software. With the stack on the bench, plug in Ethernet and power, then follow <a href=\"#install\">Start from a fresh Pi and Install</a>: flash the card, install Pi-hole and the dashboard and, if you added the SSD, copy the card to it and set it to boot from NVMe. You're done when the dashboard is showing on the screen.",
    tip: "Don't skip this one. Once the shell is on, the microSD slot and HDMI ports are sealed in, so flashing and the SD-to-SSD copy have to happen now. It's also far easier to reseat a ribbon or a missed spring pin out here than inside the case. Unplug everything before you carry on." },
  { title: "Seat the radar", show: ["base", "radar", "glue"], hi: ["radar"], hi2: ["glue"], slide: { radar: [0, 15.5, -4.1] }, cam: [25, 26, 0.7],
    text: "Push the five jumper wires onto the radar's pins, then stand the board in the cradle on the base, pin row at the top. Lead the wires back through the slot in the block.",
    tip: "Glue goes on the <b>ridges of the cradle</b> (blue), a tiny dab on each. Dry-fit first; less is more, because too much wicks onto the board and you might want it out one day." },
  { title: "Screw on the retainer", show: [...STACK, "retainer", "m25l"], hi: ["retainer", "m25l"], hw: ["m25l"], cam: [205, 22, 1],
    text: "Screw the retainer to the screen with the <b>4 M2.5 × 25</b> screws, through its posts into the screen's corner posts.",
    tip: "Start all four by hand, then tighten in a criss-cross so the frame pulls down evenly. Stop as soon as they're snug: longer screws can reach the panel. Struggling to reach the next step's screws with all this attached? Swap the order: screw the retainer to the base first, then bring the screen stack to it." },
  { title: "Stand it on the base", show: [...STACK, "retainer", "m25l", "base", "radar", "glue", "m25s"], hi: ["base", "m25s"], hw: ["m25s"], cam: [150, 20, 1],
    text: "Stand the stack on the base with the retainer's bottom bar against the block, and fix it with the <b>2 M2.5 × 10</b> screws.",
    tip: "Check the radar wires before you tighten: they should sit in the slot, not under the bar. A pinched wire is a pain to find later." },
  { title: "Wire it up", show: [...STACK, "wires"], hi: ["wires"], pins: true, cam: [180, -15, 1],
    text: "With the power unplugged, push the jumper wires onto the Pi's header. <b>Radar:</b> VCC → 2, GND → 14, RX → 8, TX → 10, OUT → 16. <b>Cooler fan:</b> red → 4, black → 6, blue → 7.",
    tip: "Count from pin 1, the one with the square pad, and double-check RX and TX: they cross over (the radar's RX goes to the Pi's TX). Swapping them won't break anything; the radar just won't talk." },
  { title: "Lower the shell", show: ["shell", "inserts", ...CASE, "wires"], hi: ["shell"], off: { shell: [0, 44, 4], inserts: [0, 44, 4] }, cam: [35, 20, 1],
    text: "Lower the shell over the stack, starting about <b>3 mm forward</b> so the front bosses pass in front of the glass. Once they're below the glass, slide it back and down the rest of the way.",
    tip: "If it binds, don't force it. Lift it off and start again a little further forward; it should drop the last bit on its own." },
  { title: "Screw the shell on", show: ["shell", "inserts", ...CASE, "wires", "m3"], hi: ["m3"], hw: ["m3"], cam: [30, -42, 1],
    text: "Turn it over and fit the <b>4 M3 × 8 countersunk</b> screws through the base into the inserts, with the 2 mm hex key.",
    tip: "Snug, not tight. The inserts are only held by plastic, and over-tightening can spin one loose in its boss." },
  { title: "Plug in the USB bridge", show: ["shell", ...CASE, "wires", "bridge"], hi: ["bridge"], off: { bridge: [22, 0, 0] }, cam: [62, 12, 0.72],
    text: "Push the N02's <b>USB bridge</b> through the slot in the right side, into the Pi's lower blue USB port.",
    tip: "It's a firm push. If it stops short, wiggle it slightly up and down rather than forcing it straight." },
  { title: "Plug in the network", show: ["shell", ...CASE, "wires", "bridge", "eth"], hi: ["eth"], hw: ["eth"], cam: [62, 12, 0.72],
    text: "Plug an <b>Ethernet cable</b> into the port next to the bridge. Wi‑Fi works too, but a DNS server is happiest on a wire.",
    tip: "Listen for the click; a half-seated plug is the classic reason a Pi-hole 'randomly' drops off the network." },
  { title: "Power it up", show: ALL, hi: ["plug"], cam: [200, 18, 0.9],
    text: "Plug a <b>5.1 V 3 A USB-C supply</b> into the socket at the back. Done.",
    tip: "The desktop and then the dashboard should appear within a minute or two. If the screen stays black, unplug, reseat the display ribbon and try again." },
  { title: "Wow. Nerd alert.", party: true, show: ["shell", ...CASE, "bridge", "eth", "plug"], hi: [], cam: [22, 10, 0.85],
    text: "You printed a case, pressed in threaded inserts, lined up three spring pins and wired a radar, all so a tiny screen can tell you how many ads you didn’t see. Respect. Now tap <b>Style</b>, pick a design, and go show someone who didn’t ask." },
];

function initGuide(THREE, source, centre) {
  const canvas = $("guideCanvas"), view = canvas.parentElement, gmsg = $("guideMsg");
  const css = getComputedStyle(document.documentElement);
  const col = (v, f) => new THREE.Color((css.getPropertyValue(v) || f).trim() || f);
  const C = { line: col("--muted", "#888"), hi: col("--accent", "#E0523A"), hi2: new THREE.Color("#3B9BFF"), fill: col("--sunk", "#141418") };

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 16 / 9, 1, 5000);
  source.position.sub(centre);   // centre the copy the same way as the main model

  // every part becomes a hidden-line drawing: a fill in the card colour (hides lines behind it) + its edges
  const fillMat = new THREE.MeshBasicMaterial({ color: C.fill, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const parts = [];
  source.updateMatrixWorld(true);
  const addPart = (geometry, matrix, group, userData) => {
    const o = { geometry, userData };
    const node = new THREE.Group(); node.applyMatrix4(matrix);
    const fill = fillMat.clone(), fillMesh = new THREE.Mesh(o.geometry, fill); node.add(fillMesh);
    fill.transparent = true; fillMesh.renderOrder = -1;   // always blended (switching it on later wouldn't take effect), drawn before any line   // its own copy, so the part can fade
    const mat = new THREE.LineBasicMaterial({ color: C.line, transparent: true, opacity: 0.55 });
    const line = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 28), mat); node.add(line);
    // silhouette: a slightly inflated back-face copy in the line colour. Edge detection only finds sharp creases,
    // so without this the shell's smooth rounded sides and top would vanish from the drawing.
    const hull = new THREE.MeshBasicMaterial({ color: C.line, side: THREE.BackSide, transparent: true, opacity: 0.55 });
    hull.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n  transformed += normalize(normal) * 0.32;"); };
    const hullMesh = new THREE.Mesh(o.geometry, hull); node.add(hullMesh);
    scene.add(node);
    const ax = o.userData && o.userData.axis, travel = (o.userData && o.userData.travel) || 12;
    parts.push({ node, group, mat, hull, line, hullMesh, fill, fillMesh, start: new THREE.Vector3(), fade: 1, fadeFrom: 1, fadeTo: 1, baseOp: 0.7, base: node.position.clone(), baseQ: node.quaternion.clone(), from: new THREE.Vector3(), to: new THREE.Vector3(),
      out: ax ? new THREE.Vector3(...ax).normalize().multiplyScalar(travel) : null });
  };
  source.traverse((o) => { if (!o.isMesh) return; const group = ALL.find((g) => GROUPS[g](o.name)); if (group) addPart(o.geometry, o.matrixWorld, group, o.userData); });
  // The last step is a little celebration: the case turns to face you and its screen lights up with a clip.
  // The clip is a real mesh on the screen's picture area, loaded only when that step is first reached.
  let partyScreen = null, partyVideo = null;
  source.traverse((o) => {
    if (!o.isMesh || o.name !== "screen_picture") return;
    partyScreen = new THREE.Mesh(o.geometry, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    partyScreen.applyMatrix4(o.matrixWorld); partyScreen.renderOrder = 20; partyScreen.visible = false; scene.add(partyScreen);
  });
  const startParty = () => {
    if (!partyScreen) return;
    if (!partyVideo) {
      partyVideo = document.createElement("video");
      Object.assign(partyVideo, { src: "site/media/done.mp4", muted: true, loop: true, playsInline: true, preload: "auto" });
      const t = new THREE.VideoTexture(partyVideo); t.colorSpace = THREE.SRGBColorSpace;
      t.center.set(0.5, 0.5); t.rotation = Math.PI; t.wrapS = THREE.RepeatWrapping; t.repeat.x = -1;   // same flip as the screenshot in the 3D viewer
      partyVideo.addEventListener("playing", () => { partyScreen.material.map = t; partyScreen.material.color.set(0xffffff); partyScreen.material.needsUpdate = true; }, { once: true });
    }
    partyVideo.currentTime = 0; partyVideo.play().catch(() => {});
  };
  const stopParty = () => { if (partyVideo) partyVideo.pause(); if (partyScreen) { partyScreen.visible = false; partyScreen.material.opacity = 0; } };
  // header pin tips in guide space (the copy is centred, so subtract the same centre)
  const pinPos = (n) => {
    const base = new THREE.Vector3(...(n % 2 ? HEADER.pin1 : HEADER.pin2)).sub(centre);
    return base.addScaledVector(new THREE.Vector3(...HEADER.col), Math.floor((n - 1) / 2));
  };
  // Solder bumps on the underside of the Pi, one under each header pin: what the N02's spring pins press on.
  // The model doesn't have them, so they're drawn here, on the plane the spring pins reach up to.
  {
    const BACK = new THREE.Vector3(0, -0.259, -0.966), v = new THREE.Vector3(); let reach = -Infinity;
    parts.forEach((p) => { if (p.group !== "pogo") return; const m = p.fillMesh, a = m.geometry.attributes.position; m.updateWorldMatrix(true, false);
      for (let i = 0; i < a.count; i++) reach = Math.max(reach, v.fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld).dot(BACK)); });
    if (reach > -Infinity) {
      const one = new THREE.SphereGeometry(0.62, 16, 8).toNonIndexed(), pos = [], nrm = [];
      for (let n = 1; n <= 40; n++) {
        const c = pinPos(n); c.addScaledVector(BACK, reach - c.dot(BACK) - 0.15);   // slide the pin's position down onto that plane
        const a = one.attributes.position, b = one.attributes.normal;
        for (let i = 0; i < a.count; i++) { pos.push(a.getX(i) + c.x, a.getY(i) + c.y, a.getZ(i) + c.z); nrm.push(b.getX(i), b.getY(i), b.getZ(i)); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
      addPart(geo, new THREE.Matrix4(), "bumps", null);
    }
  }
  // NVMe insertion, like the real thing: in at ~20°, pivot down flat on the gold fingers, then the screw.
  const rig = (() => {
    const pick = (re) => { let o = null; source.traverse((m) => { if (m.isMesh && re.test(m.name)) o = m; }); return o; };
    const goldMesh = pick(/^nvme_gold$/), pcbMesh = pick(/^nvme_pcb$/);
    if (!goldMesh || !pcbMesh) return null;
    // The drive lies in the boards' plane (normal NRM). Its long axis is that plane's horizontal. The slot end is the
    // end where its gold is densest (the edge fingers); hinge there, tilting up away from the N02.
    const NRM = new THREE.Vector3(0, 0.259, 0.966);                                     // off the N02, toward the screen
    let along = new THREE.Vector3(1, 0, 0); along.addScaledVector(NRM, -along.dot(NRM)).normalize();
    const world = (m) => { const a = m.geometry.attributes.position, out = []; const v = new THREE.Vector3();
      for (let i = 0; i < a.count; i += 3) out.push(v.fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld).clone()); return out; };
    const pcb = world(pcbMesh), gold = world(goldMesh), proj = (v) => v.dot(along);
    const lo = Math.min(...pcb.map(proj)), hi = Math.max(...pcb.map(proj));
    const nearLo = gold.filter((v) => proj(v) < lo + 6), nearHi = gold.filter((v) => proj(v) > hi - 6);
    const fingers = nearLo.length >= nearHi.length ? nearLo : nearHi;
    if (fingers === nearHi) along.negate();                                              // point from the slot out along the drive
    const pivot = fingers.reduce((a, v) => a.add(v), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, fingers.length));
    const lift = NRM, axis = new THREE.Vector3().crossVectors(along, lift).normalize();
    return { pivot, along, axis, angle: THREE.MathUtils.degToRad(20), back: 7 };
  })();
  const insertPose = (p, slide, tilt) => {   // slide: mm still out of the slot; tilt: 0..1 of the start angle
    const q = new THREE.Quaternion().setFromAxisAngle(rig.axis, rig.angle * tilt);
    const rel = p.base.clone().sub(rig.pivot).applyQuaternion(q);
    p.node.position.copy(rig.pivot).add(rel).addScaledVector(rig.along.clone().applyQuaternion(q), slide);
    p.node.quaternion.copy(q).multiply(p.baseQ);
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
    if (s.focus) {   // zoom in on a detail (e.g. the spring pins) rather than the whole step
      const fb = new THREE.Box3();
      parts.forEach((p) => { if (s.focus.includes(p.group)) fb.expandByObject(p.node); });
      fb.expandByScalar(16);
      const c = fb.getCenter(new THREE.Vector3()), r = fb.getSize(new THREE.Vector3()).length() / 2;
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
    camera.lookAt(tgt);
    if (partyScreen && STEPS[step] && STEPS[step].party) { partyScreen.visible = true; partyScreen.material.opacity = Math.min(1, Math.max(0, (performance.now() - t0 - 550) / 450)); }
    renderer.render(scene, camera);
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

  let step = 0, t0 = 0, anim = false, rotFrom = 0, rotTo = 0, fadeStep = () => {}, orbFrom = null, orbTo = null;
  const orbit = (cam, target) => { const v = cam.clone().sub(target), r = v.length() || 1; return { r, el: Math.asin(v.y / r), az: Math.atan2(v.x, v.z) }; };
  const dots = $("guideDots");
  dots.innerHTML = STEPS.map((s, i) => `<button type="button" role="tab" aria-label="Step ${i + 1}: ${s.title}"></button>`).join("");
  function go(i, instant) {
    step = (i + STEPS.length) % STEPS.length;
    const s = STEPS[step];
    $("guideTitle").textContent = s.title;
    $("guideText").innerHTML = s.text +
      (s.tip ? `<span class="tip${s.important ? " important" : ""}"><span class="tip-label">${s.important ? "Important" : "Pro tip"}</span> ${s.tip}</span>` : "") +
      (s.intro ? `<button class="start" type="button" data-start>Start building →</button>` : "");
    $("guideCount").textContent = s.intro ? `${STEPS.length - 2} steps` : s.party ? "Done" : `Step ${step} of ${STEPS.length - 2}`;
    if (s.party) startParty(); else stopParty();
    [...dots.children].forEach((d, k) => d.setAttribute("aria-selected", k === step ? "true" : "false"));
    $("guideLegend").hidden = !s.pins;
    if (s.pins) $("guideLegend").innerHTML = Object.entries(WIRES).map(([n, w]) => `<li><i style="background:${w[2]}"></i><b>${n}</b>${w[0]} · ${w[1]}</li>`).join("");
    rotFrom = scene.rotation.x; rotTo = s.flip ? Math.PI : 0;
    parts.forEach((p) => p.to.copy(p.base).add(new THREE.Vector3(...((s.off && s.off[p.group]) || [0, 0, 0]))));   // where this step wants things
    const [c, pos] = frame(s);
    // Parts that leave drift back and fade out; parts that arrive come forward out of the background and fade in.
    // The drift only reads as "into the background" when the view barely changes. If the camera swings round or the
    // model flips over, the same drift would carry parts across the picture, so it shrinks to nothing and they just fade.
    const newDir = c.clone().sub(pos).normalize(), oldDir = tgt.clone().sub(camera.position).normalize();
    const same = rotFrom === rotTo ? Math.max(0, (newDir.dot(oldDir) - 0.6) / 0.4) : 0;
    const away = newDir.multiplyScalar(36 * same);
    parts.forEach((p) => {
      const was = p.node.visible && p.fade > 0.01, will = s.show.includes(p.group);
      p.state = was && will ? "stay" : will ? "enter" : was ? "leave" : "off";
      if (p.state !== "off") p.node.visible = true;
      p.fadeFrom = p.fade; p.fadeTo = will ? 1 : 0;
      const hi2 = !!(s.hi2 && s.hi2.includes(p.group)), hi = hi2 || s.hi.includes(p.group);
      p.mat.color.copy(hi2 ? C.hi2 : hi ? C.hi : C.line); p.baseOp = hi ? 1 : 0.7;
      p.hull.color.copy(p.mat.color);
      // blue means "look here": draw it on top of everything, so a glue ridge or spring pin shows through what's in front
      p.mat.depthTest = !hi2; p.hi2 = hi2;
      p.from.copy(p.node.position); p.start.copy(p.node.position);
      p.to.copy(p.base).add(new THREE.Vector3(...((s.off && s.off[p.group]) || [0, 0, 0])));
      p.node.quaternion.copy(p.baseQ);
      // screws and inserts slide in along their own axis; a board being "lowered" comes straight down onto its standoffs
      p.slide = s.slide && s.slide[p.group] ? new THREE.Vector3(...s.slide[p.group]) : s.lower && s.lower.includes(p.group) ? new THREE.Vector3(0, -0.259, -0.966).multiplyScalar(14) : p.out;   // or a step's own direction (the radar slides down its cradle)
      p.drive = !!((s.hw && s.hw.includes(p.group) && p.out) || (s.lower && s.lower.includes(p.group)) || (s.slide && s.slide[p.group]));
      if (p.drive) { p.from.copy(p.to).add(p.slide); if (p.state !== "stay") { p.node.position.copy(p.from); p.start.copy(p.from); } }   // one already in place backs out smoothly first
      else if (p.state === "enter") { p.from.copy(p.to).add(away); p.node.position.copy(p.from); }
      else if (p.state === "leave") { p.to.copy(p.node.position).add(away); }
      if (p.state === "enter" && p.drive) p.fadeFrom = 0;
      // a step that lowers a part and then screws it down does them in that order: part first, screws second
      p.seq = !(p.drive && s.lower && s.hw) ? 0 : s.lower.includes(p.group) ? 1 : 2;
    });
    const applyFade = () => parts.forEach((p) => {
      const f = p.fade; p.mat.opacity = p.baseOp * f; p.hull.opacity = p.baseOp * f;
      // A fading part draws after everything solid: its fill dims the lines behind it, then its own lines go on top.
      // (Without this order, lines behind a half-faded part flicker through it as the draw order shuffles.)
      const fading = f < 0.999;
      p.fill.opacity = f;
      p.fillMesh.renderOrder = fading ? 1 : -1; p.hullMesh.renderOrder = fading ? 2 : 0; p.line.renderOrder = p.hi2 ? 10 : fading ? 2 : 0;
      if (f <= 0.001 && p.fadeTo === 0) p.node.visible = false;
    });
    fadeStep = applyFade;
    camFrom.copy(camera.position); camTo.copy(pos); tgtFrom.copy(tgt); tgtTo.copy(c);
    // the camera orbits to its new spot (angle and distance), so it never cuts straight through the model
    orbFrom = orbit(camFrom, tgtFrom); orbTo = orbit(camTo, tgtTo);
    orbTo.az = orbFrom.az + Math.atan2(Math.sin(orbTo.az - orbFrom.az), Math.cos(orbTo.az - orbFrom.az));   // shortest way round
    if (instant || reduceMotion) { parts.forEach((p) => { p.node.position.copy(p.to); p.fade = p.fadeTo; }); applyFade(); scene.rotation.x = rotTo; camera.position.copy(camTo); tgt.copy(tgtTo); draw(); return; }
    t0 = performance.now(); if (!anim) { anim = true; requestAnimationFrame(tick); }
  }
  const ss = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  function tick(now) {
    const k = Math.min(1, (now - t0) / 650), e = 1 - Math.pow(1 - k, 3);
    parts.forEach((p) => { p.fade = p.fadeFrom + (p.fadeTo - p.fadeFrom) * e; }); fadeStep();
    // hardware goes in after the camera settles, three times over (go in, hold, pop back out), then stays in
    const LOOPS = 3, MOVE = STEPS[step].lower && STEPS[step].hw ? 1700 : 900, HOLD = 700, el = now - t0 - 500, cyc = Math.floor(el / (MOVE + HOLD));
    const kh = el <= 0 ? 0 : cyc >= LOOPS ? 1 : Math.min(1, (el - cyc * (MOVE + HOLD)) / MOVE), eh = kh * kh * (3 - 2 * kh);
    parts.forEach((p) => { if (p.drive && el <= 0) p.node.position.lerpVectors(p.start, p.from, e); else p.node.position.lerpVectors(p.from, p.to, !p.drive ? e : p.seq === 1 ? ss(kh / 0.45) : p.seq === 2 ? ss((kh - 0.55) / 0.45) : eh); });
    const ins = STEPS[step].insert && rig;
    if (ins) {   // drive: slide in at an angle, pivot down, then the screw goes in; three times over
      const CYC = 2800, c = Math.floor(Math.max(0, el) / CYC), u = c >= LOOPS ? 1 : Math.max(0, el) % CYC / CYC;
      const sm = (a, b) => { const x = Math.min(1, Math.max(0, (u - a) / (b - a))); return x * x * (3 - 2 * x); };
      const slide = rig.back * (1 - sm(0, 0.28)), tilt = 1 - sm(0.32, 0.55), screw = sm(0.6, 0.85);
      parts.forEach((p) => {
        if (p.group === "nvme" || p.group === "pad") insertPose(p, slide, tilt);
        if (p.group === "nvmeScrew" && p.out) p.node.position.copy(p.base).addScaledVector(p.out, 1 - screw);
      });
    }
    scene.rotation.x = rotFrom + (rotTo - rotFrom) * e;
    tgt.lerpVectors(tgtFrom, tgtTo, e);
    { const r = orbFrom.r + (orbTo.r - orbFrom.r) * e, el2 = orbFrom.el + (orbTo.el - orbFrom.el) * e, az = orbFrom.az + (orbTo.az - orbFrom.az) * e;
      camera.position.set(Math.sin(az) * Math.cos(el2), Math.sin(el2), Math.cos(az) * Math.cos(el2)).multiplyScalar(r).add(tgt); }
    draw();
    const looping = (parts.some((p) => p.drive) && el < LOOPS * (MOVE + HOLD)) || (STEPS[step].insert && rig && el < LOOPS * 2800);
    if (k < 1 || kh < 1 || looping || STEPS[step].party) requestAnimationFrame(tick); else { anim = false; draw(); }   // the last step keeps drawing: its screen is a playing clip
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
