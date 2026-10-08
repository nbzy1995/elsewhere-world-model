import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const PART_IDS = ['motor', 'controller', 'power', 'camera'];
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

/** A deterministic assembly fixture. The canvas can be copied into the game's visible canvas. */
export function createWorkbench({ width = 1664, height = 960, onChange = () => {} } = {}) {
  const canvas = document.createElement('canvas');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false }); }
  catch { throw new Error('The robot workbench needs WebGL. Try a browser with hardware acceleration enabled.'); }
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#dce2e5');
  scene.fog = new THREE.Fog('#dce2e5', 9, 22);
  const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(room, .04);
  scene.environment = environment.texture; scene.environmentIntensity = .65;
  room.dispose(); pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(42, width / height, .05, 40);
  const state = { installed: new Set(), powered: false, angle: 0, signal: .5 };
  let elapsed = 0, displayAngle = 0, orbit = .18, elevation = .48, disposed = false;
  const materials = [], textures = [];
  const mat = (color, roughness = .5, metalness = 0, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
    materials.push(m); return m;
  };
  const metal = mat('#b4bdc3', .3, .75), dark = mat('#202b32', .52, .35);
  const orange = mat('#f97522', .32, .35), rubber = mat('#182024', .9), white = mat('#e6ecec', .5, .15);
  const pcb = mat('#157557', .45, .2), copper = mat('#bd9b57', .32, .8), blue = mat('#259fb2', .3, .35);
  const lens = mat('#1d3949', .12, .65), yellow = mat('#e5b83f', .65, .1);
  const led = mat('#40515a', .3, .1, { emissive: '#000000' });
  const add = (parent, geometry, material, x, y, z, cast = true) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z);
    mesh.castShadow = cast; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const box = (parent, x, y, z, w, h, d, material = metal) => add(parent, new THREE.BoxGeometry(w, h, d), material, x, y, z);
  const cyl = (parent, x, y, z, r, h, material = metal, axis = 'y') => {
    const mesh = add(parent, new THREE.CylinderGeometry(r, r, h, 24), material, x, y, z);
    if (axis === 'z') mesh.rotation.x = Math.PI / 2;
    if (axis === 'x') mesh.rotation.z = Math.PI / 2;
    return mesh;
  };
  const group = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
  const bolt = (parent, x, y, z) => cyl(parent, x, y, z, .026, .02, dark);
  const cable = (points, color = '#232b31', radius = .014) => {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    return add(scene, new THREE.TubeGeometry(curve, 24, radius, 7, false), mat(color, .75), 0, 0, 0);
  };
  const textTexture = (text, background = '#edf1ef', color = '#283944', w = 768, h = 128) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); ctx.fillStyle = background; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = color; ctx.font = `600 ${Math.floor(h * .46)}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, w / 2, h / 2);
    const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = renderer.capabilities.getMaxAnisotropy(); textures.push(texture); return texture;
  };
  const label = (parent, text, x, y, z, w, h, flat = false) => {
    const texture = textTexture(text);
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }); materials.push(material);
    const plane = add(parent, new THREE.PlaneGeometry(w, h), material, x, y, z, false);
    if (flat) plane.rotation.x = -Math.PI / 2;
    return plane;
  };

  scene.add(new THREE.HemisphereLight('#fffaf0', '#7b8995', 2.1));
  const key = new THREE.DirectionalLight('#fff3df', 4); key.position.set(-3, 7, 4); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -6; key.shadow.camera.right = 6;
  key.shadow.camera.top = 6; key.shadow.camera.bottom = -5; key.shadow.normalBias = .035; scene.add(key);
  const fill = new THREE.DirectionalLight('#d8edff', 1.8); fill.position.set(5, 4, -3); scene.add(fill);
  box(scene, 0, -.09, 0, 22, .15, 20, mat('#aeb9bd', .94));
  box(scene, 0, 3.4, -4.5, 18, 7, .2, mat('#d9dfdf', .95));
  for (let x = -7; x <= 7; x += 3.5) {
    box(scene, x, 3.5, -4.35, .15, 7, .22, dark);
    box(scene, x + 1.65, 4.1, -4.32, 2.9, 2.2, .04, mat('#d9eef0', .5, 0, { emissive: '#b5d2d3', emissiveIntensity: .5 }));
    box(scene, x + 1.65, 4.1, -4.22, 2.9, .07, .1, dark);
  }
  box(scene, 0, 5.5, -2, 12, .17, .2, dark);
  label(scene, 'ASSEMBLY / 07', -2.5, 2.8, -4.2, 2.5, .4);
  // Workbench: a brushed top, inset cutting mat, metal edge, steel legs and hardware tray.
  box(scene, 0, .78, 0, 7.2, .18, 3.85, metal);
  box(scene, 0, .68, 1.86, 7.25, .16, .07, dark);
  for (const x of [-3.1, 3.1]) for (const z of [-1.45, 1.45]) box(scene, x, .32, z, .12, .75, .12, dark);
  box(scene, -.65, .878, -.2, 3.4, .025, 2.55, mat('#637e80', .92));
  const gridPoints = [];
  for (let i = -15; i <= 15; i++) gridPoints.push(-.65 + i * .1, .893, -1.38, -.65 + i * .1, .893, 1);
  for (let i = -11; i <= 11; i++) gridPoints.push(-2.2, .893, -.2 + i * .1, .9, .893, -.2 + i * .1);
  const grid = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(gridPoints, 3)), new THREE.LineBasicMaterial({ color: '#95a9a6', transparent: true, opacity: .38 })); scene.add(grid);
  box(scene, 2.2, .894, .05, 1.9, .03, 2.7, mat('#364d59', .9));
  label(scene, 'CLICK A PART TO FIT / REMOVE', 2.2, .912, 1.52, 1.8, .14, true);
  for (const x of [-3.36, 3.36]) for (const z of [-1.65, 1.65]) bolt(scene, x, .884, z);

  // Orange arm structure. The detachable motor fills the shoulder's exposed socket.
  const base = group(scene, -.75, .91, -.25);
  box(base, 0, .07, 0, .9, .13, .76, dark);
  for (const x of [-.36, .36]) for (const z of [-.28, .28]) bolt(base, x, .145, z);
  cyl(base, 0, .18, 0, .3, .17, metal);
  const turntable = group(base, 0, .31, 0);
  cyl(turntable, 0, 0, 0, .27, .1, orange);
  box(turntable, 0, .19, -.16, .34, .36, .15, orange);
  box(turntable, 0, .19, .16, .34, .36, .15, orange);
  const shoulder = group(turntable, 0, .32, 0);
  cyl(shoulder, 0, 0, 0, .19, .45, dark, 'z');
  box(shoulder, 0, .49, 0, .22, .96, .22, orange);
  box(shoulder, -.118, .5, 0, .018, .74, .11, metal);
  for (const y of [.21, .72]) { const b = cyl(shoulder, .126, y, 0, .022, .025, dark, 'x'); b.rotation.x = Math.PI / 6; }
  const elbow = group(shoulder, 0, .98, 0);
  cyl(elbow, 0, 0, 0, .16, .32, metal, 'z');
  cyl(elbow, 0, 0, .18, .12, .07, orange, 'z');
  box(elbow, .47, .02, 0, .94, .17, .19, orange);
  box(elbow, .44, .115, 0, .58, .035, .13, metal);
  const wrist = group(elbow, .95, .02, 0);
  cyl(wrist, .03, 0, 0, .13, .2, metal, 'x');
  box(wrist, .17, 0, 0, .16, .14, .25, dark);
  const leftFinger = box(wrist, .32, -.015, .17, .31, .075, .065, metal);
  const rightFinger = box(wrist, .32, -.015, -.17, .31, .075, .065, metal);
  box(leftFinger, .13, 0, -.017, .06, .105, .035, rubber);
  box(rightFinger, .13, 0, .017, .06, .105, .035, rubber);
  const statusLamp = cyl(base, -.3, .17, .22, .025, .035, led);
  const wirePower = cable([[-1.88, 1.02, -.62], [-2.15, .93, -.5], [-1.74, .93, .08], [-1.13, 1.04, -.13]], '#df783f', .023);
  const wireData = cable([[-.04, .95, .67], [.25, .94, .65], [.12, .96, .15], [-.43, 1.03, -.05]], '#283844', .015);

  const parts = {};
  const makePart = (id, loose, installedParent, installedPosition, installedRotation = [0, 0, 0]) => {
    const object = group(scene, ...loose);
    parts[id] = { object, loose, installedParent, installedPosition, installedRotation };
    return object;
  };
  const motor = makePart('motor', [1.82, 1.04, .85], shoulder, [0, 0, .32]);
  cyl(motor, 0, 0, 0, .18, .27, metal, 'z'); cyl(motor, 0, 0, .155, .195, .04, dark, 'z');
  cyl(motor, 0, 0, .19, .065, .06, copper, 'z');
  for (let i = 0; i < 4; i++) cyl(motor, Math.cos(i * Math.PI / 2) * .14, Math.sin(i * Math.PI / 2) * .14, .185, .017, .018, metal, 'z');
  box(motor, .16, .04, -.04, .1, .1, .14, dark);
  const controller = makePart('controller', [2.58, .935, .65], base, [.6, .02, .61]);
  box(controller, 0, 0, 0, .56, .03, .4, pcb);
  box(controller, -.04, .045, 0, .16, .065, .15, dark);
  for (let i = 0; i < 5; i++) { box(controller, -.095 + i * .028, .035, .1, .012, .02, .03, metal); box(controller, -.095 + i * .028, .035, -.1, .012, .02, .03, metal); }
  for (const x of [-.22, .22]) for (const z of [-.145, .145]) cyl(controller, x, .03, z, .023, .03, copper);
  for (let i = 0; i < 3; i++) cyl(controller, .18, .055, -.11 + i * .1, .034, .07, metal);
  box(controller, -.2, .06, 0, .08, .08, .19, blue);
  const power = makePart('power', [1.85, 1.025, -.23], scene, [-1.92, 1.005, -.69]);
  box(power, 0, 0, 0, .57, .22, .4, metal); box(power, 0, .117, 0, .4, .015, .24, yellow);
  label(power, '24V DC', 0, .128, 0, .32, .115, true);
  box(power, .17, .035, .22, .08, .09, .08, rubber); box(power, -.17, .035, .22, .08, .09, .08, orange);
  for (let i = 0; i < 5; i++) box(power, -.17 + i * .085, .025, -.205, .045, .115, .01, dark);
  const cameraPart = makePart('camera', [2.65, 1.04, -.23], wrist, [.13, .17, 0], [0, Math.PI / 2, 0]);
  box(cameraPart, 0, 0, 0, .26, .2, .23, dark); cyl(cameraPart, 0, 0, .14, .077, .08, metal, 'z');
  cyl(cameraPart, 0, 0, .185, .059, .014, lens, 'z'); box(cameraPart, .07, .04, .12, .016, .016, .01, blue);
  for (const [id, p] of Object.entries(parts)) { p.object.traverse(o => { if (o.isMesh) o.userData.partId = id; }); }
  for (const [text, x, z] of [['MOTOR', 1.82, 1.18], ['CONTROLLER', 2.6, 1.18], ['24V POWER', 1.82, .1], ['CAMERA', 2.6, .1]]) label(scene, text, x, .916, z, .71, .12, true);

  // A real, legible local monitor and small workshop details; no remote assets required.
  const monitor = group(scene, -2.65, .91, -.89); monitor.rotation.y = .2;
  box(monitor, 0, .025, 0, .68, .05, .43, dark); cyl(monitor, 0, .28, 0, .05, .5, metal);
  box(monitor, 0, .73, 0, 1.26, .83, .09, dark);
  const screenCanvas = document.createElement('canvas'); screenCanvas.width = 768; screenCanvas.height = 448;
  const screenContext = screenCanvas.getContext('2d'), screenTexture = new THREE.CanvasTexture(screenCanvas);
  screenTexture.colorSpace = THREE.SRGBColorSpace; textures.push(screenTexture);
  const screenMaterial = new THREE.MeshBasicMaterial({ map: screenTexture }); materials.push(screenMaterial);
  add(monitor, new THREE.PlaneGeometry(1.15, .7), screenMaterial, 0, .73, .047, false);
  monitor.traverse(object => { if (object.isMesh) object.userData.partId = 'computer'; });
  box(scene, -2.65, .919, -.12, .85, .035, .3, dark);
  for (let row = 0; row < 3; row++) for (let col = 0; col < 10; col++) box(scene, -3.01 + col * .08, .946, -.2 + row * .075, .058, .012, .05, metal);
  for (let i = 0; i < 7; i++) { bolt(scene, .18 + (i % 4) * .12, .934, .77 + Math.floor(i / 4) * .12); }
  const screwdriver = group(scene, -2.65, .936, .92); screwdriver.rotation.y = -.3;
  cyl(screwdriver, 0, .017, 0, .037, .4, orange, 'z'); cyl(screwdriver, 0, .017, -.33, .012, .3, metal, 'z');
  const sample = box(scene, .07, .99, -.28, .17, .17, .17, blue); sample.rotation.y = .2;
  label(scene, 'ROBOT LAB / FIT THE FOUR MODULES', -.7, .888, 1.56, 3.8, .14, true);

  function getState() {
    const installed = PART_IDS.filter(id => state.installed.has(id));
    const missing = PART_IDS.filter(id => !state.installed.has(id));
    return { installed, powered: state.powered, angle: state.angle, signal: state.signal, ready: missing.length === 0, readiness: missing.length ? 'missing-parts' : 'ready', missing };
  }
  function refresh() {
    const ctx = screenContext, s = getState();
    ctx.fillStyle = '#0b2028'; ctx.fillRect(0, 0, 768, 448);
    ctx.fillStyle = '#b7e9df'; ctx.font = '25px monospace'; ctx.fillText('ROBOT / LOCAL CONTROLLER', 38, 52);
    ctx.strokeStyle = '#32505a'; ctx.beginPath(); ctx.moveTo(36, 78); ctx.lineTo(732, 78); ctx.stroke();
    PART_IDS.forEach((id, i) => { ctx.fillStyle = state.installed.has(id) ? '#77e5af' : '#789096'; ctx.font = '23px monospace'; ctx.fillText(`${state.installed.has(id) ? '[+]' : '[ ]'} ${id.toUpperCase()}`, 38, 121 + i * 43); });
    ctx.fillStyle = s.powered ? '#78edbd' : '#f6b77a'; ctx.font = '27px monospace'; ctx.fillText(s.powered ? 'RUNNING' : s.ready ? 'READY TO POWER' : 'ASSEMBLY REQUIRED', 38, 331);
    ctx.fillStyle = '#a2c0c5'; ctx.font = '20px monospace'; ctx.fillText(`ANGLE ${s.angle.toFixed(0)}°   SIGNAL ${s.signal.toFixed(2)}`, 38, 386);
    screenTexture.needsUpdate = true;
    led.color.set(state.powered ? '#4ee9a2' : '#40515a'); led.emissive.set(state.powered ? '#1c8751' : '#000000');
    wirePower.visible = state.installed.has('power'); wireData.visible = state.installed.has('controller');
  }
  function changed() { refresh(); onChange(getState()); }
  function assemble(partId) {
    if (disposed || !PART_IDS.includes(partId)) return false;
    const p = parts[partId];
    if (state.installed.has(partId)) { state.installed.delete(partId); state.powered = false; scene.add(p.object); p.object.position.set(...p.loose); p.object.rotation.set(0, 0, 0); }
    else { state.installed.add(partId); p.installedParent.add(p.object); p.object.position.set(...p.installedPosition); p.object.rotation.set(...p.installedRotation); }
    changed(); return true;
  }
  function setPower(value) {
    const powered = Boolean(value); if (disposed || (powered && !getState().ready)) return false;
    if (state.powered !== powered) { state.powered = powered; changed(); } return true;
  }
  function setAngle(degrees) { const angle = clamp(degrees, -90, 90); if (!disposed && angle !== state.angle) { state.angle = angle; changed(); } return state.angle; }
  function setSignal(value) { const signal = clamp(value, 0, 1); if (!disposed && signal !== state.signal) { state.signal = signal; changed(); } return state.signal; }
  function positionCamera() { camera.position.set(Math.sin(orbit) * 5.9, 1.05 + Math.sin(elevation) * 5.9, Math.cos(orbit) * Math.cos(elevation) * 5.9); camera.lookAt(0, 1.14, -.1); }
  function look(dx, dy) { orbit = clamp(orbit + dx * .004, -.6, .65); elevation = clamp(elevation + dy * .003, .26, .82); positionCamera(); }
  const raycaster = new THREE.Raycaster();
  function pick(nx, ny) {
    if (disposed || nx < 0 || nx > 1 || ny < 0 || ny > 1) return null;
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    raycaster.setFromCamera(new THREE.Vector2(nx * 2 - 1, 1 - ny * 2), camera);
    const hit = raycaster.intersectObjects(scene.children, true)[0];
    return hit?.object.userData.partId || null;
  }
  function getComputerBounds() {
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(monitor), points = [];
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) points.push(new THREE.Vector3(x, y, z).project(camera));
    const x = clamp(Math.min(...points.map(p => (p.x + 1) / 2)), 0, 1), y = clamp(Math.min(...points.map(p => (1 - p.y) / 2)), 0, 1);
    return { x, y, w: clamp(Math.max(...points.map(p => (p.x + 1) / 2)), 0, 1) - x, h: clamp(Math.max(...points.map(p => (1 - p.y) / 2)), 0, 1) - y };
  }
  function update(dt = 0) {
    if (disposed) return;
    const delta = clamp(dt, 0, .1); elapsed += delta;
    if (state.powered) displayAngle += (state.angle * Math.PI / 180 - displayAngle) * (1 - Math.exp(-delta * 6));
    turntable.rotation.y = displayAngle;
    const motion = state.powered ? state.signal : 0;
    shoulder.rotation.z = -.22 - motion * .16 + (state.powered ? Math.sin(elapsed * 1.5) * .025 : 0);
    elbow.rotation.z = -.25 + motion * .5;
    leftFinger.position.z = .075 + (1 - motion) * .16; rightFinger.position.z = -leftFinger.position.z;
    renderer.render(scene, camera);
  }
  function reset() {
    if (disposed) return;
    for (const id of PART_IDS) { const p = parts[id]; scene.add(p.object); p.object.position.set(...p.loose); p.object.rotation.set(0, 0, 0); }
    state.installed.clear(); state.powered = false; state.angle = 0; state.signal = .5;
    displayAngle = 0; elapsed = 0; orbit = .18; elevation = .48; positionCamera(); changed(); update(0);
  }
  function dispose() {
    if (disposed) return; disposed = true;
    const geometries = new Set(); scene.traverse(o => { if (o.geometry) geometries.add(o.geometry); });
    for (const geometry of geometries) geometry.dispose();
    for (const material of new Set([...materials, grid.material])) material.dispose();
    for (const texture of textures) texture.dispose();
    environment.dispose();
    renderer.dispose(); renderer.forceContextLoss();
  }
  positionCamera(); refresh(); update(0);
  return { canvas, update, pick, getComputerBounds, assemble, setAngle, setPower, setSignal, look, reset, getState, dispose };
}
