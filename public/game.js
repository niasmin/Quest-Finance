// Dr. Quest — 3D hospital tycoon.
// Walk to the machines to stack medicine on your back, stock the counters, serve the
// queueing patients, collect the cash and spend it on the next unlock tile.
import * as THREE from './vendor/three.module.min.js';

// ---------- data ----------
const v = (x, z) => new THREE.Vector3(x, 0, z);

const PRODUCTS = {
  pill: { name: 'ยาเม็ด', icon: '💊', price: 5, color: 0xe5484d, top: 0xffffff },
  vaccine: { name: 'วัคซีน', icon: '💉', price: 8, color: 0x3d8bfd, top: 0xd6ecff },
};

// A production line: machine -> pickup pile -> (player/carrier) -> counter shelf -> patients
function makeLine(id, z) {
  return {
    id, product: id,
    machine: v(-6, z), pickup: v(-3.4, z), counter: v(2, z),
    drop: v(0.7, z - 0.75), cashier: v(0.7, z + 0.8), front: v(3.4, z), money: v(2, z + 2.1),
    active: false, queue: [], machineTimer: 0, serveTimer: 0,
  };
}
const LINES = { pill: makeLine('pill', -7), vaccine: makeLine('vaccine', -1) };
// Service rooms: a patient lies on the bed while someone stands at the operator spot
function makeRoom(id, z, { price, time, icon, money }) {
  return { id, bed: v(2.2, z), operator: v(0.4, z), money, price, time, icon, active: false, queue: [], scan: 0, staffHired: false };
}
const ROOMS = {
  xray: makeRoom('xray', 4.6, { price: 25, time: 2.2, icon: '🩻', money: v(0.3, 6.6) }),
  dental: makeRoom('dental', 8.2, { price: 40, time: 2.6, icon: '🦷', money: v(0.3, 10.1) }),
  surgery: makeRoom('surgery', 11.4, { price: 90, time: 4.0, icon: '🫀', money: v(-1.6, 12.4) }),
};
const ROAD_Z = 17;
const SPAWN = v(7.2, ROAD_Z);
const PLAYER_START = v(-1, -4);

// Unlocks are bought one at a time, in this order
const UNLOCKS = [
  { id: 'cashier1', label: 'จ้างพยาบาลแคชเชียร์', icon: '👩‍⚕️', price: 60, at: v(-1.4, -5.2) },
  { id: 'bag1', label: 'กระเป๋าใหญ่ขึ้น', icon: '🎒', price: 120, at: v(-2.2, -9.4) },
  { id: 'vaccine', label: 'ห้องฉีดวัคซีน', icon: '💉', price: 200, at: v(-6, -1) },
  { id: 'cashier2', label: 'จ้างแคชเชียร์วัคซีน', icon: '👩‍⚕️', price: 260, at: v(-1.4, 0.8) },
  { id: 'carrier1', label: 'จ้างพยาบาลขนยา', icon: '🧑‍⚕️', price: 350, at: v(-1.4, -3.4) },
  { id: 'speed', label: 'เครื่องผลิตเร็วขึ้น', icon: '⚡', price: 450, at: v(-7.8, -4) },
  { id: 'carrier2', label: 'จ้างพยาบาลขนวัคซีน', icon: '🧑‍⚕️', price: 550, at: v(-1.4, 2.6) },
  { id: 'xray', label: 'ห้องเอกซเรย์', icon: '🩻', price: 800, at: v(2.2, 4.6) },
  { id: 'radtech', label: 'จ้างนักรังสีเทคนิค', icon: '🧑‍🔬', price: 900, at: v(-1.4, 4.6) },
  { id: 'bag2', label: 'กระเป๋าใหญ่สุด', icon: '🎒', price: 1000, at: v(-2.2, -9.4) },
  { id: 'ambulance', label: 'รถพยาบาลรับคนไข้', icon: '🚑', price: 1200, at: v(5.6, 15.2) },
  { id: 'dental', label: 'ห้องทันตกรรม', icon: '🦷', price: 1500, at: v(2.2, 8.2) },
  { id: 'dentist', label: 'จ้างทันตแพทย์', icon: '🧑‍⚕️', price: 1700, at: v(-1.4, 8.2) },
  { id: 'surgery', label: 'ห้องผ่าตัด', icon: '🫀', price: 2500, at: v(2.2, 11.4) },
  { id: 'surgeon', label: 'จ้างศัลยแพทย์', icon: '🧑‍⚕️', price: 2800, at: v(-3.4, 11) },
];

const PILE_MAX = 27; // 3 layers of 3x3 at the machine
const SHELF_MAX = 16;
const ZONE_R = 0.85;
const SAVE_KEY = 'drquest-tycoon:v1';

// ---------- renderer & scene ----------
const view = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
view.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fdcff);
scene.fog = new THREE.Fog(0x9fdcff, 40, 75);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);

scene.add(new THREE.HemisphereLight(0xffffff, 0x5a9e4a, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 1.9);
sun.position.set(9, 18, 8);
sun.castShadow = true;
// Smaller shadow map on phones keeps the frame rate up
const shadowSize = matchMedia('(pointer: coarse)').matches ? 1024 : 2048;
sun.shadow.mapSize.set(shadowSize, shadowSize);
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 60 });
sun.shadow.bias = -0.0005;
scene.add(sun);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- helpers ----------
const matCache = new Map();
function mat(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(color);
}

function box(w, h, d, color, { shadow = true } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), Array.isArray(color) ? color.map(mat) : mat(color));
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), c);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const flatDist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const tmpV = new THREE.Vector3();

// ---------- world ----------
const FLOOR = { x0: -9, x1: 9, z0: -11, z1: 13.5 };
const colliders = []; // axis-aligned boxes the player can't walk through: {x0, x1, z0, z1}
function addCollider(cx, cz, w, d) {
  colliders.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 });
}

function buildWorld() {
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), mat(0x79c850));
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  scene.add(grass);

  // Hospital floor: warm checker tiles like a lobby
  const tiles = canvasTexture(256, 256, (g) => {
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        g.fillStyle = (x + y) % 2 ? '#f6d9b0' : '#f0cb9b';
        g.fillRect(x * 32, y * 32, 32, 32);
      }
    }
    g.strokeStyle = 'rgba(160,110,60,.25)';
    for (let i = 0; i <= 8; i++) {
      g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 256); g.stroke();
      g.beginPath(); g.moveTo(0, i * 32); g.lineTo(256, i * 32); g.stroke();
    }
  });
  const fw = FLOOR.x1 - FLOOR.x0;
  const fd = FLOOR.z1 - FLOOR.z0;
  tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping;
  tiles.repeat.set(fw / 8, fd / 8);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(fw, 0.12, fd), new THREE.MeshLambertMaterial({ map: tiles }));
  floor.position.set((FLOOR.x0 + FLOOR.x1) / 2, 0.06, (FLOOR.z0 + FLOOR.z1) / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  // Low orange walls with a gap for the entrance at the bottom right
  const wall = (cx, cz, w, d) => {
    const m = box(w, 0.6, d, 0xf08a3c);
    m.position.set(cx, 0.3, cz);
    scene.add(m);
    addCollider(cx, cz, w, d);
  };
  const cz = (FLOOR.z0 + FLOOR.z1) / 2;
  wall(-9.15, cz, 0.3, fd + 0.3);
  wall(9.15, cz, 0.3, fd + 0.3);
  wall(0, FLOOR.z0 - 0.15, fw + 0.6, 0.3);
  wall(-2.25, FLOOR.z1 + 0.15, 13.5, 0.3);

  // Hospital building behind
  const building = box(22, 7, 3, 0xf7f7f2);
  building.position.set(0, 3.5, -13.4);
  scene.add(building);
  const roof = box(22.6, 0.6, 3.4, 0xe5484d);
  roof.position.set(0, 7.2, -13.4);
  scene.add(roof);
  for (let i = 0; i < 6; i++) {
    for (let r = 0; r < 2; r++) {
      const win = box(1.6, 1.3, 0.1, 0x7fc8f8, { shadow: false });
      win.position.set(-8.5 + i * 3.4, 2.4 + r * 2.6, -11.85);
      scene.add(win);
    }
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({
    map: canvasTexture(128, 128, (g) => {
      g.fillStyle = '#ffffff';
      roundRect(g, 4, 4, 120, 120, 22);
      g.fill();
      g.fillStyle = '#e5484d';
      g.fillRect(48, 20, 32, 88);
      g.fillRect(20, 48, 88, 32);
    }),
    transparent: true,
  }));
  sign.position.set(0, 9.4, -12.2);
  scene.add(sign);
  addCollider(0, -13.4, 22, 3);

  // Road with dashes
  const road = new THREE.Mesh(new THREE.PlaneGeometry(160, 3.4), mat(0x55606e));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.02, ROAD_Z);
  road.receiveShadow = true;
  scene.add(road);
  for (let x = -60; x < 60; x += 3) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.18), mat(0xffffff));
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(x, 0.03, ROAD_Z);
    scene.add(dash);
  }
  // Path from the road to the entrance
  const path = new THREE.Mesh(new THREE.PlaneGeometry(3.6, ROAD_Z - FLOOR.z1 - 1.7), mat(0xe8dcc8));
  path.rotation.x = -Math.PI / 2;
  path.position.set(7.1, 0.025, (FLOOR.z1 + ROAD_Z - 1.7) / 2);
  scene.add(path);

  // Trees, kept off the floor, road and path
  const treeGeo = new THREE.IcosahedronGeometry(1, 0);
  for (let i = 0; i < 70; i++) {
    const x = rand(-30, 30);
    const z = rand(-26, 26);
    const onFloor = x > FLOOR.x0 - 1.5 && x < FLOOR.x1 + 1.5 && z > -15.5 && z < FLOOR.z1 + 1.2;
    if (onFloor || (z > ROAD_Z - 2.4 && z < ROAD_Z + 2.4)) continue;
    const tree = new THREE.Group();
    const trunk = box(0.35, 1.2, 0.35, 0x8a5a30);
    trunk.position.y = 0.6;
    tree.add(trunk);
    const greens = [0x5bbd3a, 0x4caf50, 0x7ad04e];
    for (let k = 0; k < 3; k++) {
      const leaf = new THREE.Mesh(treeGeo, new THREE.MeshLambertMaterial({ color: pick(greens), flatShading: true }));
      leaf.position.set(rand(-0.4, 0.4), 1.6 + k * 0.45, rand(-0.4, 0.4));
      leaf.scale.setScalar(rand(0.7, 1.05) - k * 0.15);
      leaf.castShadow = true;
      tree.add(leaf);
    }
    tree.position.set(x, 0, z);
    tree.scale.setScalar(rand(0.9, 1.5));
    scene.add(tree);
  }
}

// Flat ring marking a zone on the floor
function zoneRing(pos, color = 0xffffff) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(ZONE_R - 0.12, ZONE_R, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(pos.x, 0.14, pos.z);
  scene.add(ring);
  return ring;
}

// ---------- items & stacks ----------
const ITEM_H = 0.21;
const CASH_H = 0.08;
const itemGeo = new THREE.BoxGeometry(0.44, 0.19, 0.34);
const cashGeo = new THREE.BoxGeometry(0.5, 0.07, 0.3);
function makeItem(type) {
  let m;
  if (type === 'cash') {
    m = new THREE.Mesh(cashGeo, [0x2e9e4f, 0x2e9e4f, 0x8be08f, 0x2e9e4f, 0x2e9e4f, 0x2e9e4f].map(mat));
  } else {
    const p = PRODUCTS[type];
    m = new THREE.Mesh(itemGeo, [p.color, p.color, p.top, p.color, p.color, p.color].map(mat));
  }
  m.castShadow = true;
  m.userData.type = type;
  return m;
}

class Stack {
  constructor(parent, layout) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.layout = layout;
    this.items = [];
    this.incoming = 0;
  }
  get count() { return this.items.length; }
  get total() { return this.items.length + this.incoming; }
  worldPos(i) {
    return this.group.localToWorld(this.layout(i).clone());
  }
  place(mesh) {
    this.group.add(mesh);
    mesh.position.copy(this.layout(this.items.length));
    mesh.rotation.set(0, 0, 0);
    mesh.scale.setScalar(1);
    this.items.push(mesh);
  }
  // Remove the top-most item (optionally of a given type) and return it in world space
  take(type) {
    let idx = this.items.length - 1;
    if (type) while (idx >= 0 && this.items[idx].userData.type !== type) idx--;
    if (idx < 0) return null;
    const [m] = this.items.splice(idx, 1);
    scene.attach(m);
    this.items.forEach((it, i) => it.position.copy(this.layout(i)));
    return m;
  }
  countOf(type) {
    return this.items.filter((m) => m.userData.type === type).length;
  }
}

const gridLayout = (h, cols = 3, gap = 0.48) => (i) => {
  const per = cols * cols;
  const r = i % per;
  return new THREE.Vector3(((r % cols) - (cols - 1) / 2) * gap, Math.floor(i / per) * h, (Math.floor(r / cols) - (cols - 1) / 2) * gap);
};
const columnLayout = (y0, back) => (i) => new THREE.Vector3(0, y0 + i * ITEM_H, back);

// Items flying in an arc from one place to another
const flyers = [];
function fly(mesh, from, toFn, onDone, dur = 0.28, arc = 1.1) {
  scene.add(mesh);
  mesh.position.copy(from);
  flyers.push({ mesh, from: from.clone(), toFn, onDone, t: 0, dur, arc });
}
function updateFlyers(dt) {
  for (let i = flyers.length - 1; i >= 0; i--) {
    const f = flyers[i];
    f.t = Math.min(1, f.t + dt / f.dur);
    const to = f.toFn();
    const e = f.t * f.t * (3 - 2 * f.t);
    f.mesh.position.lerpVectors(f.from, to, e);
    f.mesh.position.y += Math.sin(Math.PI * f.t) * f.arc;
    f.mesh.rotation.y += dt * 8;
    if (f.t >= 1) {
      flyers.splice(i, 1);
      f.onDone(f.mesh);
    }
  }
}
function moveToStack(mesh, stack, flyDur) {
  const idx = stack.total;
  stack.incoming++;
  fly(mesh, mesh.position.clone(), () => stack.worldPos(idx), (m) => {
    stack.incoming--;
    stack.place(m);
  }, flyDur);
}

// ---------- people ----------
const SKIN = [0xf1c27d, 0xe0ac69, 0xffdbac, 0xc68642];
const HAIR = [0x3b2a20, 0x1f1f1f, 0x7a4a24, 0xd9a441, 0x5b3a1e];
const SHIRTS = [0x8ecae6, 0xffb703, 0xfb8500, 0x90be6d, 0xb5838d, 0x6d6875, 0xf28482, 0x84a59d];

function makePerson({ shirt, pants = 0x3b4a6b, skin = pick(SKIN), hair = pick(HAIR), coat = null, cap = null, apron = null }) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const legs = [];
  const arms = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.12, 0.55, 0);
    const leg = box(0.17, 0.5, 0.2, pants);
    leg.position.y = -0.25;
    hip.add(leg);
    body.add(hip);
    legs.push(hip);

    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.36, 1.18, 0);
    const arm = box(0.13, 0.46, 0.14, coat ?? shirt);
    arm.position.y = -0.2;
    const hand = box(0.13, 0.1, 0.14, skin);
    hand.position.y = -0.47;
    shoulder.add(arm, hand);
    body.add(shoulder);
    arms.push(shoulder);
  }
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.32, 4, 10), mat(coat ?? shirt));
  torso.position.y = 0.95;
  torso.castShadow = true;
  body.add(torso);
  if (coat) {
    // Shirt showing through an open coat
    const front = box(0.16, 0.42, 0.06, shirt);
    front.position.set(0, 1.0, 0.26);
    body.add(front);
  }
  if (apron) {
    const a = box(0.5, 0.5, 0.06, apron);
    a.position.set(0, 0.92, 0.28);
    body.add(a);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), mat(skin));
  head.position.y = 1.5;
  head.castShadow = true;
  body.add(head);
  const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.275, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.1), mat(hair));
  hairM.position.set(0, 1.53, -0.02);
  body.add(hairM);
  for (const side of [-1, 1]) {
    const eye = box(0.05, 0.08, 0.02, 0x1a1a1a, { shadow: false });
    eye.position.set(side * 0.09, 1.52, 0.25);
    body.add(eye);
  }
  if (cap) {
    const c = box(0.34, 0.12, 0.2, 0xffffff);
    c.position.set(0, 1.8, 0.04);
    const cross = box(0.08, 0.08, 0.02, 0xe5484d, { shadow: false });
    cross.position.set(0, 1.8, 0.15);
    body.add(c, cross);
  }
  return { group, body, legs, arms, phase: Math.random() * 6 };
}

function animatePerson(p, moving, dt, carrying = false) {
  p.phase += dt * (moving ? 11 : 2);
  const s = moving ? Math.sin(p.phase) * 0.7 : 0;
  p.legs[0].rotation.x = s;
  p.legs[1].rotation.x = -s;
  const armBase = carrying ? -0.5 : 0;
  p.arms[0].rotation.x = armBase - s * 0.7;
  p.arms[1].rotation.x = armBase + s * 0.7;
  p.body.position.y = moving ? Math.abs(Math.sin(p.phase)) * 0.06 : Math.sin(p.phase) * 0.01;
}

// Step toward a target on the floor; returns true on arrival
function walkTo(p, target, speed, dt) {
  const g = p.group.position;
  const dx = target.x - g.x;
  const dz = target.z - g.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) return true;
  const step = Math.min(d, speed * dt);
  g.x += (dx / d) * step;
  g.z += (dz / d) * step;
  faceToward(p.group, dx, dz, dt);
  return step >= d;
}

function faceToward(obj, dx, dz, dt) {
  const target = Math.atan2(dx, dz);
  let diff = target - obj.rotation.y;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  obj.rotation.y += diff * Math.min(1, dt * 12);
}

// Speech-bubble sprite above a head
function makeBubble() {
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 128;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(1.05, 0.84, 1);
  sprite.renderOrder = 10;
  sprite.userData.draw = (icon, text, color = '#1d2433') => {
    const g = c.getContext('2d');
    g.clearRect(0, 0, 160, 128);
    g.fillStyle = '#ffffff';
    roundRect(g, 6, 6, 148, 92, 30);
    g.fill();
    g.beginPath();
    g.moveTo(66, 96); g.lineTo(80, 120); g.lineTo(94, 96);
    g.fill();
    g.font = '52px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(icon, text ? 56 : 80, 54);
    if (text) {
      g.font = '700 40px Mitr, sans-serif';
      g.fillStyle = color;
      g.fillText(text, 112, 56);
    }
    tex.needsUpdate = true;
  };
  return sprite;
}

// ---------- floating text ----------
const floats = [];
function floatText(worldPos, text, color = '#ffffff') {
  const el = document.createElement('div');
  el.className = 'float';
  el.textContent = text;
  el.style.color = color;
  document.body.append(el);
  floats.push({ el, pos: worldPos.clone(), t: 0 });
}
function updateFloats(dt) {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.t += dt;
    tmpV.copy(f.pos);
    tmpV.y += 1.8 + f.t * 1.2;
    tmpV.project(camera);
    f.el.style.left = `${(tmpV.x * 0.5 + 0.5) * window.innerWidth}px`;
    f.el.style.top = `${(-tmpV.y * 0.5 + 0.5) * window.innerHeight}px`;
    f.el.style.opacity = String(Math.max(0, 1 - f.t / 1.1));
    if (f.t > 1.1) {
      f.el.remove();
      floats.splice(i, 1);
    }
  }
}

// Confetti burst when something is unlocked
const confetti = [];
function burst(pos) {
  const colors = [0xffd166, 0xe5484d, 0x3d8bfd, 0x3fbf5f, 0xffffff];
  for (let i = 0; i < 40; i++) {
    const m = box(0.12, 0.12, 0.04, pick(colors), { shadow: false });
    m.position.set(pos.x, 0.6, pos.z);
    scene.add(m);
    confetti.push({ m, vel: new THREE.Vector3(rand(-3, 3), rand(5, 9), rand(-3, 3)), t: 0 });
  }
}
function updateConfetti(dt) {
  for (let i = confetti.length - 1; i >= 0; i--) {
    const c = confetti[i];
    c.t += dt;
    c.vel.y -= 18 * dt;
    c.m.position.addScaledVector(c.vel, dt);
    c.m.rotation.x += dt * 9;
    c.m.rotation.z += dt * 7;
    if (c.t > 1.6 || c.m.position.y < 0) {
      scene.remove(c.m);
      confetti.splice(i, 1);
    }
  }
}

// Objects that pop in with a bounce when built
const pops = [];
function popIn(obj) {
  obj.scale.setScalar(0.01);
  pops.push({ obj, t: 0 });
}
function updatePops(dt) {
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i];
    p.t = Math.min(1, p.t + dt / 0.45);
    const k = 1 + Math.sin(p.t * Math.PI) * 0.25 * (1 - p.t);
    p.obj.scale.setScalar(Math.max(0.01, p.t) * k);
    if (p.t >= 1) {
      p.obj.scale.setScalar(1);
      pops.splice(i, 1);
    }
  }
}

// ---------- player ----------
const player = makePerson({ shirt: 0x3d8bfd, coat: 0xffffff, pants: 0x2c3e66, skin: 0xf1c27d, hair: 0x3b2a20 });
// Stethoscope
const steth = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 6, 16, Math.PI), mat(0x444444));
steth.rotation.z = Math.PI;
steth.position.set(0, 1.2, 0.24);
player.body.add(steth);
player.group.position.copy(PLAYER_START);
player.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
scene.add(player.group);
player.stack = new Stack(player.body, columnLayout(0.75, -0.42));
const playerVel = new THREE.Vector3();

function bagCapacity() {
  return 10 + (state.unlocked.has('bag1') ? 8 : 0) + (state.unlocked.has('bag2') ? 12 : 0);
}

// ---------- money piles ----------
class MoneyPile {
  constructor(pos) {
    this.pos = pos;
    this.amount = 0;
    this.stack = new Stack(scene, gridLayout(CASH_H));
    this.stack.group.position.set(pos.x, 0.16, pos.z);
    this.timer = 0;
  }
  add(amount) {
    this.amount += amount;
    this.sync();
  }
  sync() {
    const want = Math.min(45, Math.ceil(this.amount / 5));
    while (this.stack.count < want) this.stack.place(makeItem('cash'));
    while (this.stack.count > want) scene.remove(this.stack.take());
  }
  // Player standing on the pile sweeps it up
  collect(dt) {
    if (this.amount <= 0 || flatDist(player.group.position, this.pos) > 1.2) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.03;
    const chunk = Math.min(this.amount, Math.max(5, Math.ceil(this.amount / 12)));
    this.amount -= chunk;
    const top = this.stack.count ? this.stack.worldPos(this.stack.count - 1) : this.pos.clone();
    this.sync();
    const bill = makeItem('cash');
    bill.position.copy(top);
    fly(bill, top, () => player.group.position.clone().setY(1.4), (m) => scene.remove(m), 0.22, 0.8);
    addMoney(chunk);
    sfxTick();
  }
}

// ---------- production lines ----------
const stripeTex = canvasTexture(64, 64, (g) => {
  g.fillStyle = '#3b4458';
  g.fillRect(0, 0, 64, 64);
  // Chevrons pointing along +x, the direction the belt runs
  g.strokeStyle = '#5c6880';
  g.lineWidth = 8;
  for (let x = -32; x < 96; x += 32) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 18, 32); g.lineTo(x, 64); g.stroke();
  }
});
stripeTex.wrapS = stripeTex.wrapT = THREE.RepeatWrapping;
const belts = [];

function bigCapsule() {
  const g = new THREE.Group();
  const r = 0.55;
  const red = new THREE.Mesh(new THREE.CapsuleGeometry(r, 0.9, 6, 16), mat(0xe5484d));
  const white = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.01, r * 1.01, 0.75, 16), mat(0xffffff));
  white.position.y = 0.5;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(r * 1.01, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xffffff));
  cap.position.y = 0.87;
  g.add(red, white, cap);
  g.rotation.z = Math.PI / 2;
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

function bigSyringe() {
  const g = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.8, 16), new THREE.MeshLambertMaterial({ color: 0xd6ecff, transparent: true, opacity: 0.85 }));
  const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 1.1, 16), mat(0x3d8bfd));
  liquid.position.y = -0.3;
  const plunger = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 8), mat(0xffffff));
  plunger.position.y = 1.3;
  const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.1, 16), mat(0xffffff));
  thumb.position.y = 1.75;
  const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), mat(0xbbbbbb));
  needle.position.y = -1.35;
  g.add(barrel, liquid, plunger, thumb, needle);
  g.rotation.z = Math.PI / 2.4;
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

function buildLine(line, animate) {
  const m = line.machine;
  const root = new THREE.Group();
  root.position.set(m.x, 0, m.z);
  const base = box(3.2, 0.8, 1.3, 0x3d5a80);
  base.position.y = 0.4;
  const rails = [-1, 1].map((s) => {
    const r = box(3.2, 0.14, 0.12, 0xf5a623);
    r.position.set(0, 0.86, s * 0.6);
    return r;
  });
  const belt = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.05), new THREE.MeshLambertMaterial({ map: stripeTex.clone() }));
  belt.material.map.repeat.set(3, 1);
  belt.material.map.wrapS = belt.material.map.wrapT = THREE.RepeatWrapping;
  belt.material.map.needsUpdate = true;
  belt.rotation.x = -Math.PI / 2;
  belt.position.y = 0.81;
  const hopper = box(1, 1.4, 1.4, 0x98c1d9);
  hopper.position.set(-1.7, 0.7, 0);
  root.add(base, ...rails, belt, hopper);
  belts.push(belt);
  const icon = line.product === 'pill' ? bigCapsule() : bigSyringe();
  icon.position.set(0, 3.1, 0);
  root.add(icon);
  line.icon = icon;
  scene.add(root);
  addCollider(m.x - 0.25, m.z, 3.7, 1.4);

  // Counter
  const counter = new THREE.Group();
  counter.position.set(line.counter.x, 0, line.counter.z);
  const desk = box(1.0, 1.0, 2.4, 0xffffff);
  desk.position.y = 0.5;
  const top = box(1.1, 0.1, 2.5, 0x8ecae6);
  top.position.y = 1.03;
  const register = box(0.5, 0.35, 0.45, 0x2b2d42);
  register.position.set(0, 1.25, 0.85);
  counter.add(desk, top, register);
  scene.add(counter);
  addCollider(line.counter.x, line.counter.z, 1.1, 2.5);

  line.pile = new Stack(scene, gridLayout(ITEM_H));
  line.pile.group.position.set(line.pickup.x, 0.16, line.pickup.z);
  line.shelf = new Stack(counter, (i) => {
    const r = i % 4;
    return new THREE.Vector3(((r % 2) - 0.5) * 0.46, 1.17 + Math.floor(i / 4) * ITEM_H, ((Math.floor(r / 2)) - 0.5) * 0.4 - 0.35);
  });
  line.cash = new MoneyPile(line.money);
  line.rings = [zoneRing(line.pickup, 0xffffff), zoneRing(line.drop, 0xffd166), zoneRing(line.cashier, 0x3fbf5f)];
  line.conveyor = [];
  line.active = true;
  if (animate) [root, counter].forEach(popIn);
}

function updateLine(line, dt) {
  // Machine: make an item, slide it along the belt, drop it on the pile
  const interval = state.unlocked.has('speed') ? 0.55 : 1.0;
  line.machineTimer -= dt;
  if (line.machineTimer <= 0 && line.pile.total + line.conveyor.length < PILE_MAX) {
    line.machineTimer = interval;
    const item = makeItem(line.product);
    item.position.set(line.machine.x - 1.3, 0.92, line.machine.z);
    scene.add(item);
    line.conveyor.push(item);
  }
  for (let i = line.conveyor.length - 1; i >= 0; i--) {
    const item = line.conveyor[i];
    item.position.x += dt * 2.6;
    if (item.position.x >= line.machine.x + 1.45) {
      line.conveyor.splice(i, 1);
      moveToStack(item, line.pile, 0.25);
    }
  }
  line.icon.rotation.y += dt * 0.8;
  line.icon.position.y = 3.1 + Math.sin(performance.now() / 600) * 0.15;

  // Serving: needs someone at the cashier spot and stock on the shelf
  const front = line.queue[0];
  const staffed = line.cashierNurse || flatDist(player.group.position, line.cashier) < ZONE_R;
  line.serveTimer -= dt;
  if (front && front.arrived && staffed && line.shelf.count > 0 && front.got + front.pending < front.need && line.serveTimer <= 0) {
    line.serveTimer = 0.22;
    const item = line.shelf.take();
    front.pending++;
    fly(item, item.position.clone(), () => front.person.group.position.clone().setY(1.1), (m) => {
      scene.remove(m);
      front.pending--;
      front.got++;
      front.refreshBubble();
      if (front.got >= front.need) {
        const pay = front.need * PRODUCTS[line.product].price;
        line.cash.add(pay);
        floatText(line.money, `+${pay}`, '#8be08f');
        sfxCoin();
        front.leave();
        line.queue.shift();
      }
    });
  }
  line.cash.collect(dt);
}

// ---------- service rooms ----------
// Floating sign texture drawn on a dark rounded card
function signTexture(draw) {
  return canvasTexture(128, 128, (g) => {
    g.fillStyle = '#16213e';
    roundRect(g, 4, 4, 120, 120, 16);
    g.fill();
    draw(g);
  });
}

function xrayModel(root, room) {
  const bed = box(1.0, 0.55, 2.2, 0xffffff);
  bed.position.y = 0.28;
  const pad = box(0.9, 0.08, 2.0, 0x8ecae6);
  pad.position.y = 0.6;
  const arch = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.2, 10, 24, Math.PI), mat(0xdfe6ee));
  arch.position.y = 0.3;
  arch.castShadow = true;
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.25), new THREE.MeshBasicMaterial({ color: 0x5dff9a, transparent: true, opacity: 0, side: THREE.DoubleSide }));
  beam.rotation.x = -Math.PI / 2;
  beam.position.y = 1.0;
  root.add(bed, pad, arch, beam);
  room.effect = (on, t) => {
    beam.material.opacity = on ? 0.7 : 0;
    beam.position.z = Math.sin(t * 5) * 0.9;
  };
  return signTexture((g) => {
    g.strokeStyle = '#cfe8ff';
    g.lineWidth = 7;
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(64, 22); g.lineTo(64, 106); g.stroke();
    for (let k = 0; k < 4; k++) {
      g.beginPath(); g.ellipse(64, 44 + k * 14, 30, 7, 0, Math.PI, 0); g.stroke();
    }
  });
}

function dentalModel(root, room) {
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.4, 12), mat(0xdfe6ee));
  base.position.y = 0.2;
  const seat = box(0.9, 0.25, 1.2, 0x48cae4);
  seat.position.set(0, 0.55, 0.15);
  const back = box(0.9, 0.25, 1.1, 0x48cae4);
  back.position.set(0, 0.85, -0.75);
  back.rotation.x = -0.7;
  const pole = box(0.1, 1.9, 0.1, 0xdfe6ee);
  pole.position.set(-0.75, 0.95, -0.6);
  const arm = box(0.1, 0.1, 0.9, 0xdfe6ee);
  arm.position.set(-0.75, 1.9, -0.2);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.14, 16), new THREE.MeshBasicMaterial({ color: 0xbbbbbb }));
  lamp.position.set(-0.5, 1.85, 0.25);
  lamp.rotation.z = 0.5;
  root.add(base, seat, back, pole, arm, lamp);
  // Giant floating tooth
  const tooth = new THREE.Group();
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), mat(0xffffff));
  crown.scale.set(1, 0.8, 0.85);
  tooth.add(crown);
  for (const side of [-1, 1]) {
    const root2 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.08, 0.7, 10), mat(0xffffff));
    root2.position.set(side * 0.24, -0.5, 0);
    root2.rotation.z = side * 0.25;
    tooth.add(root2);
  }
  tooth.traverse((o) => { o.castShadow = true; });
  room.bigIcon = tooth;
  room.effect = (on, t) => {
    lamp.material.color.setHex(on ? (Math.floor(t * 6) % 2 ? 0xfff3a0 : 0xffe066) : 0xbbbbbb);
  };
  return null;
}

function surgeryModel(root, room) {
  const mat2 = box(2.6, 0.03, 3.2, 0x2a9d8f, { shadow: false });
  mat2.position.y = 0.14;
  const table = box(0.9, 0.7, 2.2, 0x7fb7be);
  table.position.y = 0.35;
  const sheet = box(0.95, 0.06, 1.6, 0x52b788);
  sheet.position.set(0, 0.73, 0.2);
  const pole = box(0.1, 2.4, 0.1, 0xdfe6ee);
  pole.position.set(-1.0, 1.2, -1.0);
  const lampArm = box(0.1, 0.1, 1.1, 0xdfe6ee);
  lampArm.position.set(-1.0, 2.4, -0.5);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.45, 0.18, 20), new THREE.MeshBasicMaterial({ color: 0xbbbbbb }));
  lamp.position.set(-0.6, 2.3, 0.1);
  const monitor = box(0.6, 0.45, 0.1, 0x1d2433);
  monitor.position.set(1.1, 1.4, -1.0);
  const stand = box(0.08, 1.2, 0.08, 0xdfe6ee);
  stand.position.set(1.1, 0.6, -1.0);
  root.add(mat2, table, sheet, pole, lampArm, lamp, monitor, stand);
  room.effect = (on, t) => {
    lamp.material.color.setHex(on ? 0xfffbe0 : 0xbbbbbb);
    monitor.material = mat(on && Math.floor(t * 3) % 2 ? 0x2dd36f : 0x1d2433);
  };
  return signTexture((g) => {
    g.strokeStyle = '#2dd36f';
    g.lineWidth = 7;
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(14, 70); g.lineTo(42, 70); g.lineTo(52, 40); g.lineTo(64, 100); g.lineTo(76, 54); g.lineTo(84, 70); g.lineTo(114, 70);
    g.stroke();
  });
}

const ROOM_MODELS = { xray: xrayModel, dental: dentalModel, surgery: surgeryModel };

function buildRoom(room, animate) {
  const root = new THREE.Group();
  root.position.set(room.bed.x, 0, room.bed.z);
  const tex = ROOM_MODELS[room.id](root, room);
  if (tex) {
    room.bigIcon = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  }
  room.bigIcon.position.y = 3.0;
  root.add(room.bigIcon);
  scene.add(root);
  addCollider(room.bed.x, room.bed.z, 1.1, 2.3);
  room.cash = new MoneyPile(room.money);
  zoneRing(room.operator, 0x3fbf5f);
  room.active = true;
  if (animate) popIn(root);
}

function updateRoom(room, dt) {
  room.bigIcon.rotation.y += dt;
  room.bigIcon.position.y = 3.0 + Math.sin(performance.now() / 700) * 0.12;
  const front = room.queue[0];
  const staffed = room.staffHired || flatDist(player.group.position, room.operator) < ZONE_R;
  const working = Boolean(front && front.arrived && staffed);
  if (working) {
    room.scan += dt;
    if (room.scan >= room.time) {
      room.scan = 0;
      room.cash.add(room.price);
      floatText(room.money, `+${room.price}`, '#8be08f');
      sfxCoin();
      front.leave();
      room.queue.shift();
    }
  }
  room.effect(working, room.scan);
  room.cash.collect(dt);
}

// ---------- patients ----------
const patients = [];

function queueSlot(kind, i) {
  const room = ROOMS[kind];
  if (room) return i === 0 ? room.bed.clone() : v(room.bed.x + 1.3 + i * 1.05, room.bed.z);
  const f = LINES[kind].front;
  return v(f.x + i * 1.05, f.z);
}

class Patient {
  constructor(kind) {
    this.kind = kind;
    this.person = makePerson({ shirt: pick(SHIRTS) });
    this.person.group.position.copy(SPAWN);
    scene.add(this.person.group);
    this.need = ROOMS[kind] ? 1 : kind === 'pill' ? 1 + Math.floor(Math.random() * 3) : 1 + Math.floor(Math.random() * 2);
    this.got = 0;
    this.pending = 0;
    this.arrived = false;
    this.leaving = false;
    this.bubble = makeBubble();
    this.bubble.position.y = 2.35;
    this.person.group.add(this.bubble);
    this.refreshBubble();
  }
  refreshBubble() {
    if (this.leaving) this.bubble.userData.draw('😊', '');
    else if (ROOMS[this.kind]) this.bubble.userData.draw(ROOMS[this.kind].icon, '');
    else this.bubble.userData.draw(PRODUCTS[this.kind].icon, String(this.need - this.got));
  }
  leave() {
    this.leaving = true;
    this.arrived = false;
    this.refreshBubble();
  }
  update(dt) {
    let target;
    if (this.leaving) target = SPAWN;
    else {
      const queue = (ROOMS[this.kind] || LINES[this.kind]).queue;
      target = queueSlot(this.kind, queue.indexOf(this));
    }
    const arrived = walkTo(this.person, target, 3.2, dt);
    animatePerson(this.person, !arrived, dt);
    if (this.leaving) {
      if (arrived) {
        scene.remove(this.person.group);
        return false;
      }
    } else {
      this.arrived = arrived;
      // Face the counter (west) while waiting
      if (arrived) faceToward(this.person.group, -1, 0, dt);
    }
    return true;
  }
}

let spawnTimer = 1;
function updatePatients(dt) {
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnTimer = (state.unlocked.has('ambulance') ? 1.7 : 3.2) * rand(0.7, 1.3);
    const options = [];
    for (const line of Object.values(LINES)) if (line.active && line.queue.length < 6) options.push(line.id, line.id);
    for (const room of Object.values(ROOMS)) if (room.active && room.queue.length < 5) options.push(room.id);
    if (options.length) {
      const kind = pick(options);
      const p = new Patient(kind);
      (ROOMS[kind] || LINES[kind]).queue.push(p);
      patients.push(p);
    }
  }
  for (let i = patients.length - 1; i >= 0; i--) if (!patients[i].update(dt)) patients.splice(i, 1);
}

// ---------- staff ----------
const staff = [];

function hireCashier(line, animate) {
  const nurse = makePerson({ shirt: 0xf78fb3, pants: 0xf78fb3, cap: true });
  nurse.group.position.copy(line.cashier);
  nurse.group.rotation.y = Math.PI / 2;
  scene.add(nurse.group);
  line.cashierNurse = nurse;
  staff.push({ person: nurse, update: (dt) => animatePerson(nurse, false, dt) });
  if (animate) popIn(nurse.group);
}

function hireCarrier(line, animate) {
  const nurse = makePerson({ shirt: 0x48cae4, pants: 0x48cae4, cap: true });
  nurse.group.position.copy(line.pickup).add(v(1, 0));
  scene.add(nurse.group);
  const stack = new Stack(nurse.body, columnLayout(0.75, -0.42));
  const worker = { person: nurse, stack, mode: 'pick', timer: 0, idle: 0 };
  worker.update = (dt) => {
    worker.timer -= dt;
    if (worker.mode === 'pick') {
      const there = walkTo(nurse, line.pickup, 3.6, dt);
      animatePerson(nurse, !there, dt, stack.total > 0);
      if (!there) return;
      if (line.pile.count > 0 && stack.total < 8) {
        worker.idle = 0;
        if (worker.timer <= 0) {
          worker.timer = 0.12;
          moveToStack(line.pile.take(), stack, 0.22);
        }
      } else {
        worker.idle += dt;
      }
      if (stack.total >= 8 || (stack.count > 0 && worker.idle > 1.2)) worker.mode = 'drop';
    } else {
      const there = walkTo(nurse, line.drop, 3.6, dt);
      animatePerson(nurse, !there, dt, true);
      if (!there) return;
      if (stack.count > 0 && line.shelf.total < SHELF_MAX) {
        if (worker.timer <= 0) {
          worker.timer = 0.12;
          moveToStack(stack.take(), line.shelf, 0.22);
        }
      } else if (stack.total === 0) {
        worker.mode = 'pick';
      }
    }
  };
  staff.push(worker);
  if (animate) popIn(nurse.group);
}

const ROOM_STAFF = {
  xray: { shirt: 0x7f8c8d, apron: 0xf1c40f }, // radiologic technologist in a lead apron
  dental: { shirt: 0x7fc8f8, coat: 0xffffff },
  surgery: { shirt: 0x2a9d8f, pants: 0x2a9d8f, hair: 0x2a9d8f }, // green scrubs and surgical cap
};

function hireRoomStaff(room, animate) {
  const person = makePerson(ROOM_STAFF[room.id]);
  person.group.position.copy(room.operator);
  person.group.rotation.y = Math.PI / 2;
  scene.add(person.group);
  room.staffHired = true;
  staff.push({ person, update: (dt) => animatePerson(person, false, dt) });
  if (animate) popIn(person.group);
}

// Decorative ambulance driving along the road
let ambulance = null;
function buildAmbulance(animate) {
  const g = new THREE.Group();
  const body = box(2.6, 1.3, 1.3, 0xffffff);
  body.position.y = 0.95;
  const cab = box(0.9, 0.9, 1.25, 0xffffff);
  cab.position.set(1.65, 0.75, 0);
  const glass = box(0.05, 0.45, 1.0, 0x7fc8f8, { shadow: false });
  glass.position.set(2.1, 0.95, 0);
  const stripe = box(2.62, 0.18, 1.32, 0xe5484d, { shadow: false });
  stripe.position.y = 0.95;
  const light = box(0.3, 0.18, 0.5, 0xe5484d);
  light.position.set(0.6, 1.7, 0);
  g.add(body, cab, glass, stripe, light);
  for (const [x, z] of [[-0.8, 0.62], [-0.8, -0.62], [1.4, 0.62], [1.4, -0.62]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12), mat(0x222222));
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x, 0.3, z);
    g.add(wheel);
  }
  g.position.set(-40, 0, ROAD_Z - 0.8);
  scene.add(g);
  ambulance = { g, light };
  if (animate) popIn(g);
}

function updateAmbulance(dt) {
  if (!ambulance) return;
  ambulance.g.position.x += dt * 7;
  if (ambulance.g.position.x > 40) ambulance.g.position.x = -40;
  ambulance.light.material = mat(Math.floor(performance.now() / 250) % 2 ? 0xe5484d : 0x3d8bfd);
}

// ---------- unlock tiles ----------
let tile = null;
function makeTile(u) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 1.9), [
    mat(0x2b2d42), mat(0x2b2d42), new THREE.MeshBasicMaterial({ map: tex }), mat(0x2b2d42), mat(0x2b2d42), mat(0x2b2d42),
  ]);
  mesh.position.set(u.at.x, 0.16, u.at.z);
  mesh.receiveShadow = true;
  scene.add(mesh);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 4), mat(0x3fbf5f));
  arrow.rotation.x = Math.PI;
  scene.add(arrow);
  let lastDrawn = -1;
  const draw = () => {
    const frac = state.paid / u.price;
    const key = Math.round(frac * 100);
    if (key === lastDrawn) return;
    lastDrawn = key;
    const g = c.getContext('2d');
    g.fillStyle = '#2b2d42';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#3fbf5f';
    g.fillRect(0, 256 * (1 - frac), 256, 256 * frac);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 10;
    g.setLineDash([22, 14]);
    roundRect(g, 12, 12, 232, 232, 26);
    g.stroke();
    g.setLineDash([]);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '84px sans-serif';
    g.fillStyle = '#fff';
    g.fillText(u.icon, 128, 88);
    g.font = '700 46px Mitr, sans-serif';
    g.fillText(`💵${u.price - state.paid}`, 128, 172);
    g.font = '600 24px Mitr, sans-serif';
    g.fillText(u.label, 128, 222);
    tex.needsUpdate = true;
  };
  draw();
  return { u, mesh, arrow, draw, timer: 0 };
}

function showNextTile() {
  if (tile) {
    scene.remove(tile.mesh, tile.arrow);
    tile = null;
  }
  const u = UNLOCKS[state.step];
  if (u) {
    tile = makeTile(u);
    popIn(tile.mesh);
  }
  updateGoal();
}

function updateTile(dt) {
  if (!tile) return;
  const { u } = tile;
  tile.arrow.position.set(u.at.x, 2.2 + Math.sin(performance.now() / 250) * 0.25, u.at.z);
  tile.arrow.rotation.y += dt * 2;
  if (flatDist(player.group.position, u.at) > 1.0 || state.money <= 0) return;
  tile.timer -= dt;
  if (tile.timer > 0) return;
  tile.timer = 0.05;
  const chunk = Math.min(state.money, u.price - state.paid, Math.max(1, Math.ceil(u.price / 30)));
  state.money -= chunk;
  state.paid += chunk;
  updateMoney();
  const bill = makeItem('cash');
  const from = player.group.position.clone().setY(1.3);
  bill.position.copy(from);
  fly(bill, from, () => u.at.clone().setY(0.2), (m) => scene.remove(m), 0.2, 0.6);
  tile.draw();
  if (state.paid >= u.price) {
    state.paid = 0;
    state.step++;
    state.unlocked.add(u.id);
    applyUnlock(u.id, true);
    burst(u.at);
    floatText(u.at, `ปลดล็อก! ${u.icon}`, '#ffd166');
    sfxUnlock();
    showNextTile();
    save();
  }
}

function applyUnlock(id, animate) {
  switch (id) {
    case 'cashier1': hireCashier(LINES.pill, animate); break;
    case 'vaccine': buildLine(LINES.vaccine, animate); break;
    case 'cashier2': hireCashier(LINES.vaccine, animate); break;
    case 'carrier1': hireCarrier(LINES.pill, animate); break;
    case 'carrier2': hireCarrier(LINES.vaccine, animate); break;
    case 'xray': buildRoom(ROOMS.xray, animate); break;
    case 'radtech': hireRoomStaff(ROOMS.xray, animate); break;
    case 'dental': buildRoom(ROOMS.dental, animate); break;
    case 'dentist': hireRoomStaff(ROOMS.dental, animate); break;
    case 'surgery': buildRoom(ROOMS.surgery, animate); break;
    case 'surgeon': hireRoomStaff(ROOMS.surgery, animate); break;
    case 'ambulance': buildAmbulance(animate); break;
    default: break; // bag1, bag2, speed: read from state.unlocked where needed
  }
  updateBag();
}

// ---------- player actions ----------
let actTimer = 0;
function playerActions(dt) {
  actTimer -= dt;
  if (actTimer > 0) return;
  const pos = player.group.position;
  const stack = player.stack;
  for (const line of Object.values(LINES)) {
    if (!line.active) continue;
    // Pick up from the machine pile
    if (flatDist(pos, line.pickup) < ZONE_R + 0.2 && line.pile.count > 0 && stack.total < bagCapacity()) {
      moveToStack(line.pile.take(), stack, 0.2);
      actTimer = 0.07;
      sfxPop();
      updateBag();
      return;
    }
    // Drop matching items on the counter shelf
    if (flatDist(pos, line.drop) < ZONE_R + 0.2 && stack.countOf(line.product) > 0 && line.shelf.total < SHELF_MAX) {
      moveToStack(stack.take(line.product), line.shelf, 0.2);
      actTimer = 0.07;
      sfxPop();
      updateBag();
      return;
    }
  }
}

// ---------- input ----------
const input = { x: 0, z: 0 };
const keys = new Set();
window.addEventListener('keydown', (e) => keys.add(e.code));
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

const joy = document.getElementById('joy');
const knob = document.getElementById('knob');
let joyId = null;
let joyOrigin = null;
const touchVec = { x: 0, y: 0 };
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (joyId !== null) return;
  joyId = e.pointerId;
  joyOrigin = { x: e.clientX, y: e.clientY };
  joy.style.left = `${e.clientX}px`;
  joy.style.top = `${e.clientY}px`;
  joy.style.display = 'block';
  document.getElementById('hint').style.display = 'none';
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (e.pointerId !== joyId) return;
  let dx = e.clientX - joyOrigin.x;
  let dy = e.clientY - joyOrigin.y;
  const len = Math.hypot(dx, dy);
  const max = 50;
  if (len > max) {
    dx = (dx / len) * max;
    dy = (dy / len) * max;
  }
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
  touchVec.x = dx / max;
  touchVec.y = dy / max;
});
const endJoy = (e) => {
  if (e.pointerId !== joyId) return;
  joyId = null;
  touchVec.x = touchVec.y = 0;
  knob.style.transform = '';
  joy.style.display = 'none';
};
renderer.domElement.addEventListener('pointerup', endJoy);
renderer.domElement.addEventListener('pointercancel', endJoy);

function readInput() {
  let x = touchVec.x;
  let z = touchVec.y;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) z -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) z += 1;
  const len = Math.hypot(x, z);
  if (len > 1) {
    x /= len;
    z /= len;
  }
  input.x = x;
  input.z = z;
}

// Push a circle out of every collider box
function collide(pos, r = 0.35) {
  for (const c of colliders) {
    const cx = Math.max(c.x0, Math.min(pos.x, c.x1));
    const cz = Math.max(c.z0, Math.min(pos.z, c.z1));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d = Math.hypot(dx, dz);
    if (d < r) {
      if (d > 1e-6) {
        pos.x = cx + (dx / d) * r;
        pos.z = cz + (dz / d) * r;
      } else {
        pos.z = c.z1 + r;
      }
    }
  }
  pos.x = Math.max(-40, Math.min(40, pos.x));
  pos.z = Math.max(-30, Math.min(30, pos.z));
}

function updatePlayer(dt) {
  readInput();
  const speed = 6.2;
  const moving = Math.hypot(input.x, input.z) > 0.08;
  playerVel.set(input.x * speed, 0, input.z * speed);
  const pos = player.group.position;
  pos.addScaledVector(playerVel, dt);
  collide(pos);
  if (moving) faceToward(player.group, input.x, input.z, dt);
  animatePerson(player, moving, dt);
  // Lean the stack against the motion
  const lean = moving ? 0.12 : 0;
  player.stack.group.rotation.x += (lean * -1 - player.stack.group.rotation.x) * Math.min(1, dt * 6);
}

// ---------- guide arrow ----------
const guide = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 3), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
guide.rotation.x = Math.PI / 2;
const guideHolder = new THREE.Group();
guideHolder.add(guide);
guide.position.z = 1.3;
scene.add(guideHolder);

// What should a new player do next? Point at it.
function guideTarget() {
  const stack = player.stack;
  const pill = LINES.pill;
  const piles = [...Object.values(LINES), ...Object.values(ROOMS)].filter((x) => x.active).map((x) => x.cash);
  if (tile && state.money >= tile.u.price - state.paid) return tile.u.at;
  if (stack.count > 0) {
    for (const line of Object.values(LINES)) if (line.active && stack.countOf(line.product) > 0 && line.shelf.total < SHELF_MAX) return line.drop;
  }
  if (!pill.cashierNurse && pill.queue[0]?.arrived && pill.shelf.count > 0) return pill.cashier;
  const best = piles.filter((p) => p.amount > 0).sort((a, b) => b.amount - a.amount)[0];
  if (best) return best.pos;
  if (stack.count === 0 && pill.pile.count > 0) return pill.pickup;
  return tile ? tile.u.at : null;
}

function updateGuide() {
  const target = guideTarget();
  const pos = player.group.position;
  if (!target || flatDist(pos, target) < 1.6) {
    guideHolder.visible = false;
    return;
  }
  guideHolder.visible = true;
  guideHolder.position.set(pos.x, 0.25, pos.z);
  guideHolder.rotation.y = Math.atan2(target.x - pos.x, target.z - pos.z);
  guide.position.z = 1.3 + Math.sin(performance.now() / 180) * 0.12;
}

// ---------- HUD ----------
const moneyEl = document.getElementById('moneyval');
const moneyBox = document.getElementById('money');
const bagEl = document.getElementById('bag');
const goalEl = document.getElementById('goal');
let shownMoney = 0;

function addMoney(n) {
  state.money += n;
  updateMoney();
}
function updateMoney() {
  moneyBox.classList.add('bump');
  clearTimeout(updateMoney.t);
  updateMoney.t = setTimeout(() => moneyBox.classList.remove('bump'), 100);
}
function tickMoneyDisplay(dt) {
  const diff = state.money - shownMoney;
  shownMoney = Math.abs(diff) < 1 ? state.money : shownMoney + diff * Math.min(1, dt * 12);
  moneyEl.textContent = Math.round(shownMoney).toLocaleString();
}
function updateBag() {
  const cap = bagCapacity();
  const n = player.stack.total;
  bagEl.textContent = `🎒 ${n}/${cap}`;
  bagEl.classList.toggle('full', n >= cap);
}
function updateGoal() {
  const u = UNLOCKS[state.step];
  goalEl.textContent = u ? `🎯 ถัดไป: ${u.icon} ${u.label} · 💵${u.price}` : '🏆 โรงพยาบาลครบทุกแผนกแล้ว!';
}

// ---------- sound: WebAudio blips and a looping chiptune ----------
let audio = null;
let master = null;
let soundOn = true;
try {
  soundOn = localStorage.getItem('drquest-sound') !== 'off';
} catch {
  // Storage blocked: default to sound on
}

function initAudio() {
  if (audio) return;
  try {
    audio = new (window.AudioContext || window.webkitAudioContext)();
  } catch {
    audio = null;
    return;
  }
  master = audio.createGain();
  master.gain.value = soundOn ? 1 : 0;
  master.connect(audio.destination);
  startMusic();
}

function tone(freq, dur, type = 'sine', vol = 0.06, at = null) {
  if (!audio) return;
  const t = at ?? audio.currentTime;
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur);
}

const midi = (n) => 440 * 2 ** ((n - 69) / 12);
// Two 4-bar phrases over C - Am - F - G, one note per eighth (0 = rest)
const MELODY = [
  72, 76, 79, 76, 74, 72, 74, 76, 76, 0, 72, 0, 69, 72, 74, 0,
  77, 76, 74, 72, 74, 76, 77, 79, 79, 0, 77, 76, 74, 0, 71, 0,
  72, 76, 79, 84, 83, 79, 76, 79, 81, 79, 76, 72, 76, 0, 74, 0,
  77, 81, 79, 77, 76, 74, 72, 74, 71, 74, 79, 77, 76, 74, 72, 0,
];
const BASS = [48, 45, 41, 43];
const STEP = 60 / 138 / 2;
let musicStep = 0;
let musicTime = 0;

function startMusic() {
  musicTime = audio.currentTime + 0.1;
  setInterval(() => {
    if (!audio || audio.state !== 'running') return;
    // Schedule a little ahead so timing stays tight
    while (musicTime < audio.currentTime + 0.15) {
      const note = MELODY[musicStep % MELODY.length];
      if (note) tone(midi(note), STEP * 0.9, 'square', 0.022, musicTime);
      if (musicStep % 2 === 0) {
        const root = BASS[Math.floor(musicStep / 8) % BASS.length];
        tone(midi(musicStep % 4 === 0 ? root : root + 12), STEP * 1.6, 'triangle', 0.05, musicTime);
      }
      musicTime += STEP;
      musicStep++;
    }
  }, 40);
}

function setSound(on) {
  soundOn = on;
  if (master) master.gain.value = on ? 1 : 0;
  document.getElementById('soundbtn').textContent = on ? '🔊' : '🔇';
  try {
    localStorage.setItem('drquest-sound', on ? 'on' : 'off');
  } catch {
    // Storage blocked: the setting just won't persist
  }
}
let lastPop = 0;
function sfxPop() {
  const now = performance.now();
  if (now - lastPop < 60) return;
  lastPop = now;
  tone(520 + Math.random() * 120, 0.06, 'triangle', 0.05);
}
function sfxTick() { sfxPop(); }
function sfxCoin() { tone(880, 0.08, 'square', 0.03); setTimeout(() => tone(1320, 0.12, 'square', 0.03), 70); }
function sfxUnlock() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'triangle', 0.06), i * 90)); }

// ---------- save / load ----------
const state = { money: 0, step: 0, paid: 0, unlocked: new Set() };

function save() {
  const data = {
    money: state.money, step: state.step, paid: state.paid,
    piles: Object.fromEntries(Object.values(LINES).filter((l) => l.active).map((l) => [l.id, { pile: l.pile.count, shelf: l.shelf.count, cash: l.cash.amount }])),
    roomCash: Object.fromEntries(Object.values(ROOMS).filter((r) => r.active).map((r) => [r.id, r.cash.amount])),
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Storage blocked: progress just won't persist
  }
}

function load() {
  let data = null;
  try {
    data = JSON.parse(localStorage.getItem(SAVE_KEY));
  } catch {
    data = null;
  }
  buildLine(LINES.pill, false);
  if (!data) return;
  state.money = data.money || 0;
  state.step = Math.min(data.step || 0, UNLOCKS.length);
  state.paid = data.paid || 0;
  for (let i = 0; i < state.step; i++) {
    state.unlocked.add(UNLOCKS[i].id);
    applyUnlock(UNLOCKS[i].id, false);
  }
  for (const [id, p] of Object.entries(data.piles || {})) {
    const line = LINES[id];
    if (!line?.active) continue;
    for (let i = 0; i < Math.min(p.pile, PILE_MAX); i++) line.pile.place(makeItem(line.product));
    for (let i = 0; i < Math.min(p.shelf, SHELF_MAX); i++) line.shelf.place(makeItem(line.product));
    line.cash.add(p.cash || 0);
  }
  // Older saves kept only the X-ray room's cash
  const roomCash = data.roomCash || { xray: data.xrayCash || 0 };
  for (const [id, amount] of Object.entries(roomCash)) if (ROOMS[id]?.active) ROOMS[id].cash.add(amount);
  shownMoney = state.money;
}

// ---------- main loop ----------
const camOffset = new THREE.Vector3(0, 14, 10.5);
const camPos = new THREE.Vector3();
function updateCamera(dt, snap = false) {
  // Portrait phones need the camera further back to see the same width
  const k = camera.aspect < 1 ? 1.85 : 1.1;
  camPos.copy(player.group.position).addScaledVector(camOffset, k);
  if (snap) camera.position.copy(camPos);
  else camera.position.lerp(camPos, Math.min(1, dt * 6));
  camera.lookAt(player.group.position.x, 0.5, player.group.position.z - 0.5);
  // Keep the sun's shadow box centred on the action
  sun.position.set(player.group.position.x + 9, 18, player.group.position.z + 8);
  sun.target.position.set(player.group.position.x, 0, player.group.position.z);
  sun.target.updateMatrixWorld();
}

let last = performance.now();
let saveTimer = 0;
let running = false;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (running) {
    updatePlayer(dt);
    playerActions(dt);
    for (const line of Object.values(LINES)) if (line.active) updateLine(line, dt);
    for (const room of Object.values(ROOMS)) if (room.active) updateRoom(room, dt);
    updatePatients(dt);
    staff.forEach((s) => s.update(dt));
    updateAmbulance(dt);
    updateTile(dt);
    updateGuide();
    saveTimer += dt;
    if (saveTimer > 3) {
      saveTimer = 0;
      save();
    }
  }
  for (const belt of belts) belt.material.map.offset.x -= dt * 0.9;
  updateFlyers(dt);
  updatePops(dt);
  updateConfetti(dt);
  updateFloats(dt);
  updateCamera(dt);
  updateBag();
  tickMoneyDisplay(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---------- start ----------
buildWorld();
load();
showNextTile();
updateBag();
updateCamera(0, true);
document.getElementById('loading').style.display = 'none';
requestAnimationFrame(frame);

function start() {
  running = true;
  document.getElementById('start').style.display = 'none';
  document.getElementById('hud').style.display = 'flex';
  goalEl.style.display = 'block';
  document.getElementById('hint').style.display = 'block';
  initAudio();
  audio?.resume();
}
document.getElementById('soundbtn').addEventListener('click', () => {
  initAudio();
  audio?.resume();
  setSound(!soundOn);
});
setSound(soundOn);
document.getElementById('startbtn').addEventListener('click', start);

const menu = document.getElementById('menu');
document.getElementById('menubtn').addEventListener('click', () => {
  menu.style.display = 'flex';
  running = false;
});
document.getElementById('resume').addEventListener('click', () => {
  menu.style.display = 'none';
  running = true;
  last = performance.now();
});
document.getElementById('reset').addEventListener('click', () => {
  if (!confirm('ลบความคืบหน้าทั้งหมดแล้วเริ่มใหม่?')) return;
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
  location.reload();
});
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) save();
  last = performance.now();
});

// Expose a little for automated tests
window.__game = { state, player, LINES, ROOMS, UNLOCKS, input: touchVec, patients };
