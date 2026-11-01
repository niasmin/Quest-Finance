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
  xray: makeRoom('xray', 4.6, { price: 25, time: 2.2, icon: '🩻', money: v(-3.4, 4.6) }),
  dental: makeRoom('dental', 8.2, { price: 40, time: 2.6, icon: '🦷', money: v(-3.4, 8.2) }),
  surgery: makeRoom('surgery', 11.4, { price: 90, time: 4.0, icon: '🫀', money: v(-3.4, 11.4) }),
};
const ROAD_Z = 17;
const SPAWN = v(7.2, ROAD_Z);
// Bin in the hallway for dumping whatever the player is carrying
const TRASH = v(6.3, 2.0);
const PLAYER_START = v(-0.8, -6.7); // clear of every unlock tile, so switching branches never buys something by accident

// Unlocks are bought one at a time, in this order
const UNLOCKS = [
  { id: 'cashier1', label: 'จ้างพยาบาลแคชเชียร์', icon: '👩‍⚕️', price: 60, at: v(-1.4, -5.2) },
  { id: 'bag1', label: 'กระเป๋าใหญ่ขึ้น', icon: '🎒', price: 120, at: v(-2.2, -9.4) },
  { id: 'vaccine', label: 'ห้องฉีดวัคซีน', icon: '💉', price: 200, at: v(-6, -1) },
  { id: 'cashier2', label: 'จ้างแคชเชียร์วัคซีน', icon: '👩‍⚕️', price: 260, at: v(-1.4, 0.8) },
  { id: 'carrier1', label: 'จ้างพยาบาลขนยา', icon: '🧑‍⚕️', price: 350, at: v(-1.4, -8.4) },
  { id: 'speed', label: 'เครื่องผลิตเร็วขึ้น', icon: '⚡', price: 450, at: v(-7.8, -5.2) },
  { id: 'carrier2', label: 'จ้างพยาบาลขนวัคซีน', icon: '🧑‍⚕️', price: 550, at: v(-1.4, -2.6) },
  { id: 'xray', label: 'ห้องเอกซเรย์', icon: '🩻', price: 800, at: v(2.2, 4.6) },
  { id: 'radtech', label: 'จ้างนักรังสีเทคนิค', icon: '🧑‍🔬', price: 900, at: v(-1.4, 4.6) },
  { id: 'bag2', label: 'กระเป๋าใหญ่สุด', icon: '🎒', price: 1000, at: v(-2.2, -9.4) },
  { id: 'ambulance', label: 'รถพยาบาลรับคนไข้', icon: '🚑', price: 1200, at: v(5.6, 15.2) },
  { id: 'dental', label: 'ห้องทันตกรรม', icon: '🦷', price: 1500, at: v(2.2, 8.2) },
  { id: 'dentist', label: 'จ้างทันตแพทย์', icon: '🧑‍⚕️', price: 1700, at: v(-1.4, 8.2) },
  { id: 'surgery', label: 'ห้องผ่าตัด', icon: '🫀', price: 2500, at: v(2.2, 11.4) },
  { id: 'surgeon', label: 'จ้างศัลยแพทย์', icon: '🧑‍⚕️', price: 2800, at: v(-1.4, 11.4) },
  { id: 'waiting', label: 'ห้องรอพร้อมเก้าอี้', icon: '🪑', price: 3200, at: v(7.0, -9.7) },
  // Floor 2 (floor: 1): reached by the elevator in the hallway
  { id: 'elevator', label: 'ลิฟต์ขึ้นชั้น 2', icon: '🛗', price: 4000, at: v(6.4, 12.4) },
  { id: 'kitchen', label: 'โรงอาหารญาติคนไข้', icon: '🍲', price: 4500, at: v(-1.5, -6.5), floor: 1 },
  { id: 'cook', label: 'จ้างแม่ครัว', icon: '👩‍🍳', price: 5200, at: v(-3.0, -2.5), floor: 1 },
  { id: 'server', label: 'จ้างพนักงานเสิร์ฟ', icon: '🧑‍🍳', price: 5800, at: v(0.6, -2.6), floor: 1 },
  { id: 'ward', label: 'หอผู้ป่วยใน', icon: '🛏️', price: 6500, at: v(-2.0, 7.2), floor: 1 },
  { id: 'beds2', label: 'เพิ่มเตียง 2 เตียง', icon: '🛏️', price: 7200, at: v(4.4, 7.2), floor: 1 },
  { id: 'wardnurse', label: 'จ้างพยาบาลประจำหอ', icon: '👩‍⚕️', price: 8000, at: v(-4.2, 6.5), floor: 1 },
  { id: 'beds3', label: 'เพิ่มเตียงอีก 2 เตียง', icon: '🛏️', price: 9000, at: v(1.2, 10.8), floor: 1 },
];

// Waiting room: two rows of chairs at the quiet north end of the hallway, facing south
const SEATS = Array.from({ length: 8 }, (_, i) => ({ at: v(5.75 + (i % 4) * 0.85, -10.3 + Math.floor(i / 4) * 1.1), taken: null }));

// Upgrades can be bought again and again; each level costs more
const UPGRADES = [
  { id: 'speed', icon: '👟', name: 'รองเท้าวิ่ง', desc: (l) => `เดินเร็ว +${l * 8}%`, max: 10, base: 150, growth: 1.6 },
  { id: 'bag', icon: '🎒', name: 'กระเป๋าใบใหญ่', desc: (l) => `ถือของ +${l * 4} ชิ้น`, max: 10, base: 200, growth: 1.6 },
  { id: 'staff', icon: '👩‍⚕️', name: 'อบรมพนักงาน', desc: (l) => `พนักงานไว +${l * 10}%`, max: 10, base: 300, growth: 1.65 },
  { id: 'machine', icon: '⚙️', name: 'เครื่องผลิตยา', desc: (l) => `ผลิตเร็ว +${l * 10}%`, max: 10, base: 250, growth: 1.6 },
  { id: 'price', icon: '💰', name: 'ค่ารักษา', desc: (l) => `รายได้ +${l * 10}%`, max: 20, base: 400, growth: 1.55 },
  { id: 'ads', icon: '📣', name: 'ประชาสัมพันธ์', desc: (l) => `คนไข้มาเพิ่ม +${l * 8}%`, max: 10, base: 350, growth: 1.6 },
];
const upLevel = (id) => state.upgrades[id] || 0;
const upCost = (u) => Math.round((u.base * u.growth ** upLevel(u.id)) / 10) * 10;
const speedMult = () => 1 + 0.08 * upLevel('speed');
const staffMult = () => 1 + 0.1 * upLevel('staff');
const machineMult = () => 1 + 0.1 * upLevel('machine');
const branchMult = () => 1 + 0.5 * (state.branch || 0);
const priceMult = () => (1 + 0.1 * upLevel('price')) * branchMult();
// Reputation (0-5 stars) and advertising both bring patients in faster
const arrivalMult = () => (1 + 0.08 * upLevel('ads')) * (0.7 + 0.1 * state.rating);

// Patient types: [weight, unlocked from step]
const PATIENT_TYPES = {
  normal: { weight: 70, patience: 60, pay: 1, speed: 3.2 },
  emergency: { weight: 12, from: 2, patience: 28, pay: 3, speed: 4.6, badge: '🚨', shirt: 0xe5484d },
  vip: { weight: 8, from: 4, patience: 45, pay: 5, speed: 3.0, badge: '👑', shirt: 0xffc300 },
  child: { weight: 10, from: 1, patience: 50, pay: 1.5, speed: 3.0, badge: '👶', scale: 0.68 },
};
function rollType() {
  const options = Object.entries(PATIENT_TYPES).filter(([, t]) => !t.from || state.step >= t.from);
  let r = Math.random() * options.reduce((a, [, t]) => a + t.weight, 0);
  for (const [id, t] of options) {
    r -= t.weight;
    if (r <= 0) return id;
  }
  return 'normal';
}

// Departments are bands across the floor, split by partition walls with a door in
// the middle. The east side (x > HALL_X) is an open hallway patients walk along.
const HALL_X = 5.2;
const WALK_X = 8.4; // patients' lane in the hallway
const DOOR_X = -1.6;
const DOOR_W = 2.0;
const DEPTS = [
  { id: 'pill', name: 'ห้องจ่ายยา', icon: '💊', z0: -11, z1: -4, floor: 0xfde2e4 },
  { id: 'vaccine', name: 'ห้องฉีดวัคซีน', icon: '💉', z0: -4, z1: 2.3, floor: 0xdbeafe },
  { id: 'xray', name: 'ห้องเอกซเรย์', icon: '🩻', z0: 2.3, z1: 6.4, floor: 0xe2e8f0 },
  { id: 'dental', name: 'ห้องทันตกรรม', icon: '🦷', z0: 6.4, z1: 9.8, floor: 0xd1fae5 },
  { id: 'surgery', name: 'ห้องผ่าตัด', icon: '🫀', z0: 9.8, z1: 13.5, floor: 0xccf2d8 },
];
const BOUNDS = DEPTS.slice(1).map((d) => d.z0);
const bandOf = (z) => BOUNDS.filter((b) => z > b).length;
const GATE = v(6.8, 12.8); // just inside the entrance

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
const colliders = []; // axis-aligned boxes the player can't walk through: {x0, x1, z0, z1, floor}
function addCollider(cx, cz, w, d, floor = 0) {
  colliders.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, floor });
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
  roof.material = new THREE.MeshLambertMaterial({ color: 0xe5484d }); // own material: recoloured per branch
  roof.position.set(0, 7.2, -13.4);
  scene.add(roof);
  branchLook.roof = roof;
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

const branchLook = {};
const BRANCH_COLORS = ['#e5484d', '#3d8bfd', '#2e9e4f', '#9b5de5', '#f5a623', '#14b8a6'];
// Each new branch gets its own roof and sign colour
function applyBranchLook() {
  const color = BRANCH_COLORS[(state.branch || 0) % BRANCH_COLORS.length];
  branchLook.roof.material.color.set(color);
  const side = new THREE.MeshLambertMaterial({ color });
  const label = state.branch ? `🏥 โรงพยาบาลป่วน สาขา ${state.branch + 1}` : '🏥 โรงพยาบาลป่วน';
  branchLook.arch.material = [side, side, side, side, new THREE.MeshBasicMaterial({ map: signTex(label, color) }), side];
}

// Partition walls between departments, each with a door, leaving the hallway open
function buildPartitions() {
  const wallMat = [0xf4f4f0, 0xf4f4f0, 0x7fd1c1, 0xf4f4f0, 0xf4f4f0, 0xf4f4f0];
  for (const b of BOUNDS) {
    const segs = [[FLOOR.x0, DOOR_X - DOOR_W / 2], [DOOR_X + DOOR_W / 2, HALL_X]];
    for (const [x0, x1] of segs) {
      const w = x1 - x0;
      const wall = box(w, 0.9, 0.2, wallMat);
      wall.position.set((x0 + x1) / 2, 0.45, b);
      scene.add(wall);
      addCollider((x0 + x1) / 2, b, w, 0.2);
    }
    // Door frame posts
    for (const x of [DOOR_X - DOOR_W / 2, DOOR_X + DOOR_W / 2, HALL_X]) {
      const post = box(0.26, 1.15, 0.3, 0x5fb8a8);
      post.position.set(x, 0.58, b);
      scene.add(post);
    }
  }
  // Hallway runner
  const runner = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR.x1 - HALL_X - 0.3, FLOOR.z1 - FLOOR.z0 - 0.3), new THREE.MeshLambertMaterial({ color: 0xc9d6df }));
  runner.rotation.x = -Math.PI / 2;
  runner.position.set((HALL_X + FLOOR.x1) / 2, 0.125, (FLOOR.z0 + FLOOR.z1) / 2);
  runner.receiveShadow = true;
  scene.add(runner);

  // Entrance arch with the hospital name
  const arch = new THREE.Group();
  for (const x of [4.7, 8.9]) {
    const pillar = box(0.4, 3, 0.4, 0xffffff);
    pillar.position.set(x, 1.5, FLOOR.z1 + 0.2);
    arch.add(pillar);
  }
  const board = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.9, 0.2), [
    mat(0xe5484d), mat(0xe5484d), mat(0xe5484d), mat(0xe5484d),
    new THREE.MeshBasicMaterial({ map: signTex('🏥 โรงพยาบาลป่วน', '#e5484d') }), mat(0xe5484d),
  ]);
  board.position.set(6.8, 3.2, FLOOR.z1 + 0.2);
  board.castShadow = true;
  branchLook.arch = board;
  arch.add(board);
  scene.add(arch);
}

function signTex(text, bg) {
  return canvasTexture(512, 112, (g) => {
    g.fillStyle = bg;
    roundRect(g, 0, 0, 512, 112, 24);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,.85)';
    g.lineWidth = 6;
    roundRect(g, 8, 8, 496, 96, 18);
    g.stroke();
    g.fillStyle = '#ffffff';
    g.font = '600 52px Mitr, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 256, 60);
  });
}

const SIGN_COLORS = { pill: '#e5484d', vaccine: '#3d8bfd', xray: '#4b5a70', dental: '#2a9d8f', surgery: '#2e9e4f' };
// Coloured floor and a sign on the far wall once a department is open
function decorateDept(id, animate) {
  const d = DEPTS.find((x) => x.id === id);
  const w = HALL_X - FLOOR.x0;
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.2, d.z1 - d.z0 - 0.3), new THREE.MeshLambertMaterial({ color: d.floor }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set((FLOOR.x0 + HALL_X) / 2, 0.123, (d.z0 + d.z1) / 2);
  rug.receiveShadow = true;
  scene.add(rug);
  const sign = new THREE.Group();
  for (const x of [-1.5, 1.5]) {
    const post = box(0.12, 2.1, 0.12, 0xdfe6ee);
    post.position.set(x, 1.05, 0);
    sign.add(post);
  }
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.8), new THREE.MeshBasicMaterial({ map: signTex(`${d.icon} ${d.name}`, SIGN_COLORS[id]), side: THREE.DoubleSide }));
  board.position.y = 2.1;
  sign.add(board);
  sign.position.set(3.4, 0, d.z0 + 0.35);
  scene.add(sign);
  if (animate) popIn(sign);
}

function buildTrash() {
  const bin = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.85, 16), mat(0xe5484d));
  body.position.y = 0.43;
  body.castShadow = true;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.1, 16), mat(0xb8323a));
  lid.position.y = 0.9;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.41, 0.1, 16), mat(0xffd166));
  band.position.y = 0.55;
  bin.add(body, lid, band);
  const post = box(0.08, 2.0, 0.08, 0xdfe6ee);
  post.position.set(0.6, 1.0, 0);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.55), new THREE.MeshBasicMaterial({ map: signTex('🗑️ ทิ้งของ', '#e5484d'), side: THREE.DoubleSide }));
  board.position.set(0.6, 2.2, 0);
  bin.add(post, board);
  bin.position.set(TRASH.x, 0, TRASH.z);
  scene.add(bin);
  zoneRing(TRASH, 0xe5484d);
  trashLid = lid;
}
let trashLid = null;

// Next point to walk toward on the way to `to`: through a door or along the hallway,
// so walkers never cut through partition walls
function route(from, to) {
  const outside = (p) => p.z > FLOOR.z1;
  if (outside(to) !== outside(from)) {
    return flatDist(from, GATE) > 0.4 ? (outside(from) ? GATE : route(from, GATE)) : to;
  }
  if (outside(from)) return to;
  const bf = bandOf(from.z);
  const bt = bandOf(to.z);
  if (bf === bt) return to;
  if (from.x > HALL_X) return v(Math.max(from.x, HALL_X + 1), to.z); // hallway runs the full length
  const sgn = bt > bf ? 1 : -1;
  const b = BOUNDS[sgn > 0 ? bf : bf - 1];
  const inDoor = Math.abs(from.x - DOOR_X) < 0.5 && Math.abs(from.z - b) < 0.8;
  return inDoor ? v(DOOR_X, b + sgn * 0.9) : v(DOOR_X, b - sgn * 0.7);
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
  if (type === 'raw' || type === 'bowl' || type === 'iv') return makeFloor2Item(type);
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
    mesh.visible = true;
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
  c.height = 150;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(1.05, 0.98, 1);
  sprite.renderOrder = 10;
  // patience: 0..1 bar under the bubble (null hides it); badge: small emoji in the corner
  sprite.userData.draw = (icon, text, color = '#1d2433', patience = null, badge = '') => {
    const g = c.getContext('2d');
    g.clearRect(0, 0, 160, 150);
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
    if (badge) {
      g.font = '34px sans-serif';
      g.fillText(badge, 22, 20);
    }
    if (patience !== null) {
      g.fillStyle = 'rgba(0,0,0,.55)';
      roundRect(g, 28, 126, 104, 18, 9);
      g.fill();
      g.fillStyle = patience > 0.5 ? '#3fbf5f' : patience > 0.25 ? '#ffc300' : '#e5484d';
      roundRect(g, 31, 129, Math.max(6, 98 * patience), 12, 6);
      g.fill();
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
  return 10 + (state.unlocked.has('bag1') ? 8 : 0) + (state.unlocked.has('bag2') ? 12 : 0) + upLevel('bag') * 4;
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
    if (this.amount <= 0 || player.floor !== 0 || flatDist(player.group.position, this.pos) > 1.2) return;
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
  const interval = (state.unlocked.has('speed') ? 0.55 : 1.0) / machineMult();
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
  const staffed = line.cashierNurse || (player.floor === 0 && flatDist(player.group.position, line.cashier) < ZONE_R);
  line.serveTimer -= dt;
  if (front && front.arrived && staffed && line.shelf.count > 0 && front.got + front.pending < front.need && line.serveTimer <= 0) {
    line.serveTimer = 0.22 / staffMult();
    const item = line.shelf.take();
    front.pending++;
    fly(item, item.position.clone(), () => front.person.group.position.clone().setY(1.1), (m) => {
      scene.remove(m);
      front.pending--;
      front.got++;
      front.refreshBubble();
      if (front.got >= front.need) {
        tut.served = true;
        const pay = front.payout(front.need * PRODUCTS[line.product].price);
        line.cash.add(pay);
        floatText(line.money, `+${pay}${front.tipped ? ' 💖' : ''}`, '#8be08f');
        sfxCoin();
        front.leave();
        line.queue.splice(line.queue.indexOf(front), 1);
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
  const mat2 = box(2.6, 0.03, 2.8, 0x2a9d8f, { shadow: false });
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
  const staffed = room.staffHired || (player.floor === 0 && flatDist(player.group.position, room.operator) < ZONE_R);
  const working = Boolean(front && front.arrived && staffed);
  if (working) {
    room.scan += dt * (room.staffHired ? staffMult() : 1);
    if (room.scan >= room.time) {
      room.scan = 0;
      const pay = front.payout(room.price);
      room.cash.add(pay);
      floatText(room.money, `+${pay}${front.tipped ? ' 💖' : ''}`, '#8be08f');
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
  constructor(kind, type = 'normal') {
    this.kind = kind;
    this.type = type;
    const t = PATIENT_TYPES[type];
    this.t = t;
    this.person = makePerson({ shirt: t.shirt ?? pick(SHIRTS) });
    this.person.group.position.copy(SPAWN);
    if (t.scale) this.person.group.scale.setScalar(t.scale);
    if (type === 'vip') {
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.16, 6), mat(0xffd166));
      crown.position.y = 1.86;
      this.person.body.add(crown);
    }
    scene.add(this.person.group);
    // Kids come with a grown-up who tags along
    if (type === 'child') {
      this.parent = makePerson({ shirt: pick(SHIRTS) });
      this.parent.group.position.copy(SPAWN).add(v(0.6, 0.4));
      scene.add(this.parent.group);
    }
    this.need = ROOMS[kind] ? 1 : kind === 'pill' ? 1 + Math.floor(Math.random() * 3) : 1 + Math.floor(Math.random() * 2);
    this.got = 0;
    this.pending = 0;
    this.arrived = false;
    this.leaving = false;
    this.waited = 0;
    this.barKey = -1;
    this.bubble = makeBubble();
    this.bubble.position.y = 2.35 / (t.scale || 1) * (t.scale ? 0.85 : 1);
    this.person.group.add(this.bubble);
    this.refreshBubble();
  }
  patienceLeft() {
    return Math.max(0, 1 - this.waited / this.t.patience);
  }
  refreshBubble() {
    const draw = this.bubble.userData.draw;
    if (this.leaving) draw(this.angry ? '😡' : '😊', '');
    else {
      const bar = this.inside || this.seatedBar ? this.patienceLeft() : null;
      const icon = ROOMS[this.kind] ? ROOMS[this.kind].icon : PRODUCTS[this.kind].icon;
      const text = ROOMS[this.kind] ? '' : String(this.need - this.got);
      draw(icon, text, '#1d2433', bar, this.t.badge || '');
    }
  }
  // Final bill: patient type bonus, price upgrade and a tip for quick service
  payout(base) {
    this.tipped = this.waited < this.t.patience * 0.4;
    const amount = Math.round(base * this.t.pay * priceMult() * (this.tipped ? 1.2 : 1));
    changeRating(this.tipped ? 0.05 : 0.02);
    missionProgress('serve', 1);
    missionProgress('earn', amount);
    if (this.tipped) missionProgress('tips', 1);
    if (this.type === 'emergency') missionProgress('emergency', 1);
    if (this.type === 'vip') missionProgress('vip', 1);
    return amount;
  }
  leave() {
    this.leaving = true;
    this.arrived = false;
    this.refreshBubble();
  }
  // Has someone started serving this patient? Then the patience bar stops.
  beingServed() {
    if (ROOMS[this.kind]) return ROOMS[this.kind].queue[0] === this && ROOMS[this.kind].scan > 0;
    return this.got + this.pending > 0;
  }
  // Waypoints: entrance -> hallway lane at the department's row -> queue slot, and back out
  rowZ() {
    return ROOMS[this.kind] ? ROOMS[this.kind].bed.z : LINES[this.kind].front.z;
  }
  remove() {
    if (this.seat) this.seat.taken = null;
    scene.remove(this.person.group);
    if (this.parent) scene.remove(this.parent.group);
  }
  update(dt) {
    const pos = this.person.group.position;
    const lane = v(WALK_X, this.rowZ());
    const entry = v(WALK_X, FLOOR.z1 - 0.6);
    let target;
    if (this.leaving) {
      if (this.exitStep === undefined) this.exitStep = 0;
      target = [lane, entry, SPAWN][this.exitStep];
    } else if (this.seat) {
      target = pos.z > FLOOR.z1 - 0.3 ? entry : this.seat.at;
    } else if (!this.inside) {
      target = pos.z > FLOOR.z1 - 0.3 ? entry : lane;
    } else {
      const queue = (ROOMS[this.kind] || LINES[this.kind]).queue;
      target = queueSlot(this.kind, queue.indexOf(this));
    }
    const arrived = walkTo(this.person, target, this.t.speed, dt);
    if (this.seat && arrived) {
      this.sit(dt);
    } else {
      animatePerson(this.person, !arrived, dt);
    }
    if (this.parent) {
      const spot = pos.clone().add(v(0.55, 0.5));
      const there = walkTo(this.parent, spot, this.t.speed + 0.6, dt);
      animatePerson(this.parent, !there, dt);
      if (there) faceToward(this.parent.group, pos.x - this.parent.group.position.x, pos.z - this.parent.group.position.z, dt);
    }
    if (this.leaving) {
      if (arrived && ++this.exitStep > 2) {
        this.remove();
        return false;
      }
    } else if (this.seat) {
      // Waiting in a chair is comfier: patience drains at 40%
      if (arrived) {
        this.waited += dt * 0.4;
        if (this.waited >= this.t.patience) {
          this.seat.taken = null;
          this.seat = null;
          this.standUp();
          this.angry = true;
          this.leave();
          changeRating(-0.15);
          floatText(this.person.group.position, '😡 รอนานเกินไป!', '#ff8a8a');
          return true;
        }
        const key = Math.ceil(this.patienceLeft() * 20);
        if (key !== this.barKey) {
          this.barKey = key;
          this.seatedBar = true;
          this.refreshBubble();
        }
      }
    } else if (!this.inside) {
      if (arrived && target === lane) {
        this.inside = true;
        this.refreshBubble();
      }
    } else {
      this.arrived = arrived;
      // Face the counter (west) while waiting
      if (arrived) faceToward(this.person.group, -1, 0, dt);
      if (!this.beingServed()) {
        this.waited += dt;
        if (this.waited >= this.t.patience) {
          this.storm();
          return true;
        }
      }
      const key = Math.ceil(this.patienceLeft() * 20);
      if (key !== this.barKey) {
        this.barKey = key;
        this.refreshBubble();
      }
    }
    return true;
  }
  // Sitting pose on a waiting-room chair, facing the hallway
  sit(dt) {
    const p = this.person;
    p.body.position.y = -0.22;
    p.legs[0].rotation.x = p.legs[1].rotation.x = -1.45;
    p.arms[0].rotation.x = p.arms[1].rotation.x = -0.3;
    faceToward(p.group, 0, 1, dt);
  }
  standUp() {
    this.person.body.position.y = 0;
    this.seatedBar = false;
  }
  // Waited too long: walk out angry without paying
  storm() {
    const queue = (ROOMS[this.kind] || LINES[this.kind]).queue;
    queue.splice(queue.indexOf(this), 1);
    this.angry = true;
    this.leave();
    changeRating(-0.15);
    floatText(this.person.group.position, '😡 รอนานเกินไป!', '#ff8a8a');
  }
}

function changeRating(delta) {
  state.rating = Math.max(0, Math.min(5, state.rating + delta));
  updateRating();
}

let spawnTimer = 1;
const QUEUE_MAX = 5;
const serviceQueue = (kind) => (ROOMS[kind] || LINES[kind]).queue;

function joinQueue(p) {
  const queue = serviceQueue(p.kind);
  // Emergencies jump the queue (behind whoever is already being served)
  if (p.type === 'emergency') queue.splice(Math.min(1, queue.length), 0, p);
  else queue.push(p);
}

function updatePatients(dt) {
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnTimer = ((state.unlocked.has('ambulance') ? 1.7 : 3.2) / arrivalMult()) * rand(0.7, 1.3);
    const services = [
      ...Object.values(LINES).filter((l) => l.active).flatMap((l) => [l.id, l.id]),
      ...Object.values(ROOMS).filter((r) => r.active).map((r) => r.id),
    ];
    const open = services.filter((k) => serviceQueue(k).length < QUEUE_MAX);
    const seat = state.unlocked.has('waiting') ? SEATS.find((st) => !st.taken) : null;
    if (open.length) {
      const p = new Patient(pick(open), rollType());
      joinQueue(p);
      patients.push(p);
    } else if (seat && services.length) {
      // Every queue is full: take a seat in the waiting room instead of going home
      const p = new Patient(pick(services), rollType());
      p.seat = seat;
      seat.taken = p;
      patients.push(p);
    }
  }
  // Seated patients move up as soon as their queue has room
  for (const st of SEATS) {
    const p = st.taken;
    if (p && !p.leaving && serviceQueue(p.kind).length < QUEUE_MAX) {
      st.taken = null;
      p.seat = null;
      p.standUp();
      joinQueue(p);
    }
  }
  for (let i = patients.length - 1; i >= 0; i--) if (!patients[i].update(dt)) patients.splice(i, 1);
}

function buildWaitingRoom(animate) {
  const root = new THREE.Group();
  for (const st of SEATS) {
    const chair = new THREE.Group();
    const seat = box(0.55, 0.12, 0.55, 0x3d8bfd);
    seat.position.y = 0.48;
    const back = box(0.55, 0.55, 0.1, 0x3d8bfd);
    back.position.set(0, 0.78, -0.24);
    const legs = box(0.45, 0.42, 0.45, 0x8d99ae);
    legs.position.y = 0.21;
    chair.add(seat, back, legs);
    chair.position.set(st.at.x, 0, st.at.z);
    root.add(chair);
  }
  // Plants, a water cooler and a sign
  const plant = (x, z) => {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.2, 0.45, 10), mat(0xc0763a));
    pot.position.set(x, 0.23, z);
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), new THREE.MeshLambertMaterial({ color: 0x4caf50, flatShading: true }));
    leaves.position.set(x, 0.85, z);
    leaves.castShadow = true;
    root.add(pot, leaves);
  };
  plant(5.55, -8.5);
  plant(8.85, -10.75);
  const cooler = box(0.45, 1.0, 0.45, 0xffffff);
  cooler.position.set(8.85, 0.5, -8.6);
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.45, 12), new THREE.MeshLambertMaterial({ color: 0x7fc8f8, transparent: true, opacity: 0.85 }));
  bottle.position.set(8.85, 1.22, -8.6);
  root.add(cooler, bottle);
  const sign = new THREE.Group();
  for (const x of [-1.1, 1.1]) {
    const post = box(0.1, 2.0, 0.1, 0xdfe6ee);
    post.position.set(x, 1.0, 0);
    sign.add(post);
  }
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.62), new THREE.MeshBasicMaterial({ map: signTex('🪑 ห้องรอ', '#f5a623'), side: THREE.DoubleSide }));
  board.position.y = 2.0;
  sign.add(board);
  sign.position.set(7.05, 0, -10.8);
  root.add(sign);
  scene.add(root);
  if (animate) popIn(root);
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
  line.carrier = worker;
  worker.update = (dt) => {
    worker.timer -= dt;
    if (worker.mode === 'pick') {
      const there = walkTo(nurse, line.pickup, 3.6 * staffMult(), dt);
      animatePerson(nurse, !there, dt, stack.total > 0);
      if (!there) return;
      if (line.pile.count > 0 && stack.total < 8) {
        worker.idle = 0;
        if (worker.timer <= 0) {
          worker.timer = 0.12 / staffMult();
          moveToStack(line.pile.take(), stack, 0.22);
        }
      } else {
        worker.idle += dt;
      }
      if (stack.total >= 8 || (stack.count > 0 && worker.idle > 1.2)) worker.mode = 'drop';
    } else {
      const there = walkTo(nurse, line.drop, 3.6 * staffMult(), dt);
      animatePerson(nurse, !there, dt, true);
      if (!there) return;
      if (stack.count > 0 && line.shelf.total < SHELF_MAX) {
        if (worker.timer <= 0) {
          worker.timer = 0.12 / staffMult();
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

// ---------- hospital crew: wandering doctors and nurses, a guard, a housekeeper ----------
function deptActive(id) {
  return id === 'pill' || Boolean(LINES[id]?.active || ROOMS[id]?.active);
}

// Open spots worth walking to: the hallway plus a few places in each open department
function wanderSpots() {
  const spots = [];
  for (let z = -9.5; z <= 12.5; z += 2.75) spots.push(v(6.4, z));
  for (const d of DEPTS) {
    if (!deptActive(d.id)) continue;
    spots.push(v(DOOR_X, (d.z0 + d.z1) / 2), v(-2.8, d.z1 - 0.7), v(4.4, d.z0 + 0.7));
  }
  return spots;
}

function makeWalker(opts, speed = 2.2) {
  const person = makePerson(opts);
  person.group.position.copy(pick(wanderSpots()));
  scene.add(person.group);
  const w = { person, target: null, wait: rand(0, 2) };
  w.update = (dt) => {
    if (!w.target) {
      w.wait -= dt;
      animatePerson(person, false, dt);
      if (w.wait <= 0) w.target = pick(wanderSpots());
      return;
    }
    const way = route(person.group.position, w.target);
    const arrived = walkTo(person, way, speed, dt);
    animatePerson(person, true, dt);
    if (arrived && way === w.target) {
      w.target = null;
      w.wait = rand(1.5, 4);
    }
  };
  staff.push(w);
  return w;
}

const spills = [];
const spillMat = new THREE.MeshBasicMaterial({ color: 0x8fd3ff, transparent: true, opacity: 0.75 });
let spillTimer = 12;
function updateSpills(dt) {
  spillTimer -= dt;
  if (spillTimer <= 0 && spills.length < 3) {
    spillTimer = rand(18, 30);
    const at = pick(wanderSpots()).clone().add(v(rand(-0.6, 0.6), rand(-0.6, 0.6)));
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.5, 18), spillMat.clone());
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.set(rand(0.8, 1.3), rand(0.7, 1.1), 1);
    mesh.position.set(at.x, 0.135, at.z);
    scene.add(mesh);
    spills.push({ at, mesh, claimed: false });
  }
}

function makeHousekeeper() {
  const person = makePerson({ shirt: 0x9b5de5, pants: 0x6d3fb0, apron: 0xffffff, hair: 0x2b1b10 });
  // Mop held in the right hand
  const mop = new THREE.Group();
  const stick = box(0.05, 1.4, 0.05, 0xc8a26b);
  stick.position.y = -0.2;
  const head = box(0.45, 0.08, 0.16, 0x4ea8de);
  head.position.y = -0.92;
  mop.add(stick, head);
  mop.position.set(0, -0.45, 0.15);
  mop.rotation.x = 0.35;
  person.arms[1].add(mop);
  person.group.position.copy(v(6.4, 0));
  scene.add(person.group);
  const hk = { person, spill: null, target: null, wait: 1, clean: 0 };
  hk.update = (dt) => {
    if (!hk.spill) {
      const free = spills.filter((sp) => !sp.claimed);
      if (free.length) {
        const pos = person.group.position;
        hk.spill = free.sort((a, b) => flatDist(pos, a.at) - flatDist(pos, b.at))[0];
        hk.spill.claimed = true;
        hk.clean = 0;
      }
    }
    if (hk.spill) {
      const way = route(person.group.position, hk.spill.at);
      const arrived = walkTo(person, way, 2.6, dt) && way === hk.spill.at;
      if (!arrived) {
        animatePerson(person, true, dt);
        return;
      }
      // Mop back and forth until the floor is dry
      hk.clean += dt;
      person.arms[0].rotation.x = person.arms[1].rotation.x = -0.6 + Math.sin(hk.clean * 10) * 0.35;
      person.group.rotation.y += Math.sin(hk.clean * 5) * dt * 1.5;
      hk.spill.mesh.material.opacity = 0.75 * (1 - hk.clean / 2.4);
      if (hk.clean >= 2.4) {
        scene.remove(hk.spill.mesh);
        spills.splice(spills.indexOf(hk.spill), 1);
        floatText(hk.spill.at, '✨ สะอาด!', '#bfe9ff');
        hk.spill = null;
        hk.target = null;
      }
      return;
    }
    // Nothing to clean: stroll around
    if (!hk.target) {
      hk.wait -= dt;
      animatePerson(person, false, dt);
      if (hk.wait <= 0) hk.target = pick(wanderSpots());
      return;
    }
    const way = route(person.group.position, hk.target);
    if (walkTo(person, way, 2.0, dt) && way === hk.target) {
      hk.target = null;
      hk.wait = rand(2, 5);
    }
    animatePerson(person, true, dt);
  };
  staff.push(hk);
}

function spawnCrew() {
  makeWalker({ shirt: 0x3d8bfd, coat: 0xffffff, hair: 0x7a4a24 }, 2.0); // doctor
  makeWalker({ shirt: 0x90be6d, coat: 0xffffff, hair: 0x1f1f1f }, 2.3); // doctor
  makeWalker({ shirt: 0xf78fb3, pants: 0xf78fb3, cap: true }, 2.5); // nurse
  makeHousekeeper();
  // Security guard at the entrance
  const guard = makePerson({ shirt: 0x34495e, pants: 0x1f2a36, hair: 0x1f2a36 });
  guard.group.position.set(5.4, 0, FLOOR.z1 - 0.7);
  scene.add(guard.group);
  staff.push({ person: guard, update: (dt) => animatePerson(guard, false, dt) });
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
  // Floor-2 tiles live in the floor-2 group so they hide and show with it
  const parent = u.floor ? F2.group : scene;
  mesh.position.set(u.at.x, 0.16, u.at.z);
  mesh.receiveShadow = true;
  parent.add(mesh);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 4), mat(0x3fbf5f));
  arrow.rotation.x = Math.PI;
  parent.add(arrow);
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
    tile.mesh.parent?.remove(tile.mesh);
    tile.arrow.parent?.remove(tile.arrow);
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
  if (player.floor !== (u.floor || 0) || lift.riding || flatDist(player.group.position, u.at) > 1.0 || state.money <= 0) return;
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
  fly(bill, from, () => u.at.clone().setY((u.floor ? F2Y : 0) + 0.2), (m) => scene.remove(m), 0.2, 0.6);
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
    case 'vaccine': buildLine(LINES.vaccine, animate); decorateDept('vaccine', animate); break;
    case 'cashier2': hireCashier(LINES.vaccine, animate); break;
    case 'carrier1': hireCarrier(LINES.pill, animate); break;
    case 'carrier2': hireCarrier(LINES.vaccine, animate); break;
    case 'xray': buildRoom(ROOMS.xray, animate); decorateDept('xray', animate); break;
    case 'radtech': hireRoomStaff(ROOMS.xray, animate); break;
    case 'dental': buildRoom(ROOMS.dental, animate); decorateDept('dental', animate); break;
    case 'dentist': hireRoomStaff(ROOMS.dental, animate); break;
    case 'surgery': buildRoom(ROOMS.surgery, animate); decorateDept('surgery', animate); break;
    case 'surgeon': hireRoomStaff(ROOMS.surgery, animate); break;
    case 'waiting': buildWaitingRoom(animate); break;
    case 'elevator': buildElevator(animate); buildFloor2(animate); buildBasket(); break;
    case 'kitchen': buildKitchen(animate); break;
    case 'cook': hireCook(animate); break;
    case 'server': hireServer(animate); break;
    case 'ward': buildWard(animate); break;
    case 'beds2': addBeds(2, animate); break;
    case 'wardnurse': hireWardNurse(animate); break;
    case 'beds3': addBeds(2, animate); break;
    case 'ambulance': buildAmbulance(animate); break;
    default: break; // bag1, bag2, speed: read from state.unlocked where needed
  }
  updateBag();
}

// ---------- floor 2: elevator, relatives' cafeteria, inpatient ward, cash basket ----------
// Floor 2 is a raised platform over the same footprint, in the same scene, so both floors
// keep running whichever one the player is on. It's hidden while the player is downstairs.
const F2Y = 6;
const ELEVATOR = v(6.4, 12.4);
const TRASH2 = v(6.4, 9.6);
const BASKET_AT = v(2.6, 14.6); // where the cash basket lands, just outside the south wall
const POT_MAX = 12;
const F2_PILE_MAX = 18;
const BOWL_PRICE = 12;
const BED_RATE = 0.9; // money per second while a bed's drip is running
const K = {
  rawMachine: v(-6.5, -8.5), rawPickup: v(-4.2, -8.5), pot: v(-1.5, -6.5), potInput: v(-3.2, -5.6),
  bowlPickup: v(-1.5, -4.3), counter: v(1.8, -6.2), drop: v(0.6, -8.2), serve: v(0.6, -4.6),
};
const W = { ivMachine: v(-6.5, 4.0), ivPickup: v(-4.2, 4.0) };
const BED_SPOTS = [v(-2.0, 7.2), v(1.2, 7.2), v(4.4, 7.2), v(-2.0, 10.8), v(1.2, 10.8), v(4.4, 10.8)];
const bedZone = (b) => v(b.at.x - 1.05, b.at.z);

const F2 = {
  group: new THREE.Group(), built: false, kitchen: false, ward: false, bank: 0,
  raw: null, bowls: null, shelf: null, potRaw: 0, potTimer: 0, rawTimer: 0, serveTimer: 0,
  customers: [], cook: null, server: null, ivPile: null, ivTimer: 0, beds: [], wardNurse: null,
  crowd: null, steam: [],
};
F2.group.position.y = F2Y;
F2.group.visible = false;
scene.add(F2.group);
player.floor = 0;

// Platform, rail and floor-2 elevator pad
function buildFloor2(animate) {
  const g = F2.group;
  const tex = canvasTexture(256, 256, (c) => {
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        c.fillStyle = (x + y) % 2 ? '#eef3f8' : '#dfe8f1';
        c.fillRect(x * 32, y * 32, 32, 32);
      }
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const fw = FLOOR.x1 - FLOOR.x0 + 0.6;
  const fd = FLOOR.z1 - FLOOR.z0 + 0.6;
  tex.repeat.set(fw / 8, fd / 8);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(fw, 0.4, fd), [mat(0xc9d6df), mat(0xc9d6df), new THREE.MeshLambertMaterial({ map: tex }), mat(0x9aa8b5), mat(0xc9d6df), mat(0xc9d6df)]);
  deck.position.set(0, -0.2, (FLOOR.z0 + FLOOR.z1) / 2);
  deck.receiveShadow = true;
  deck.castShadow = true;
  g.add(deck);
  // Red safety rail around the edge, like a mezzanine
  const rail = (cx, cz, w, d) => {
    const r = box(w, 0.7, d, 0xe5484d);
    r.position.set(cx, 0.35, cz);
    g.add(r);
    addCollider(cx, cz, w, d, 1);
  };
  const cz = (FLOOR.z0 + FLOOR.z1) / 2;
  rail(FLOOR.x0 - 0.15, cz, 0.2, fd);
  rail(FLOOR.x1 + 0.15, cz, 0.2, fd);
  rail(0, FLOOR.z0 - 0.15, fw, 0.2);
  rail(0, FLOOR.z1 + 0.15, fw, 0.2);
  const pad = zoneRing(ELEVATOR, 0x7b61ff);
  g.add(pad);
  // A second bin up here
  const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.85, 16), mat(0xe5484d));
  bin.position.set(TRASH2.x, 0.43, TRASH2.z);
  g.add(bin);
  g.add(zoneRing(TRASH2, 0xe5484d));
  F2.built = true;
  if (animate) popIn(deck);
}

// ---------- elevator ----------
const lift = { built: false, cab: null, riding: false, from: 0, to: 0, t: 0, wait: 0, armed: true };
function buildElevator(animate) {
  const shaft = new THREE.Group();
  for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) {
    const post = box(0.14, F2Y + 2.2, 0.14, 0x7b61ff);
    post.position.set(dx, (F2Y + 2.2) / 2, dz);
    shaft.add(post);
  }
  const top = box(2.0, 0.2, 2.0, 0x5a43d6);
  top.position.y = F2Y + 2.2;
  shaft.add(top);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.48), new THREE.MeshBasicMaterial({ map: signTex('🛗 ลิฟต์', '#7b61ff'), side: THREE.DoubleSide }));
  sign.position.set(0, 2.4, 0.95);
  shaft.add(sign);
  const sign2 = sign.clone();
  sign2.position.y = F2Y + 1.9;
  shaft.add(sign2);
  shaft.position.set(ELEVATOR.x, 0, ELEVATOR.z);
  scene.add(shaft);
  lift.cab = box(1.7, 0.12, 1.7, 0xb8a9ff);
  lift.cab.position.set(ELEVATOR.x, 0.1, ELEVATOR.z);
  scene.add(lift.cab);
  scene.add(zoneRing(ELEVATOR, 0x7b61ff));
  lift.built = true;
  if (animate) popIn(shaft);
}

function setFloor(f) {
  player.floor = f;
  player.group.position.y = f ? F2Y : 0;
  F2.group.visible = f === 1;
  auto.task = null;
}

function updateElevator(dt) {
  if (!lift.built) return false;
  const pos = player.group.position;
  if (lift.riding) {
    lift.t = Math.min(1, lift.t + dt / 1.4);
    const e = lift.t * lift.t * (3 - 2 * lift.t);
    const y = lift.from + (lift.to - lift.from) * e;
    pos.set(ELEVATOR.x, y, ELEVATOR.z);
    lift.cab.position.y = y + 0.1;
    // Swap which floor is drawn halfway through the ride
    F2.group.visible = lift.to > lift.from ? lift.t > 0.5 : lift.t < 0.5;
    animatePerson(player, false, dt);
    if (lift.t >= 1) {
      lift.riding = false;
      lift.armed = false;
      setFloor(lift.to > 0 ? 1 : 0);
      tone(1320, 0.25, 'sine', 0.06);
    }
    return true;
  }
  const near = flatDist(pos, ELEVATOR) < 0.7;
  if (!near) lift.armed = true; // step off before the next ride
  lift.wait = near && lift.armed ? lift.wait + dt : 0;
  if (lift.wait > 0.5) {
    lift.wait = 0;
    lift.riding = true;
    lift.t = 0;
    lift.from = player.floor ? F2Y : 0;
    lift.to = player.floor ? 0 : F2Y;
    tone(988, 0.2, 'sine', 0.06);
  }
  return false;
}

// ---------- cafeteria ----------
const rawGeo = new THREE.BoxGeometry(0.44, 0.19, 0.34);
const bowlGeo = new THREE.CylinderGeometry(0.22, 0.16, 0.19, 14);
const ivGeo = new THREE.BoxGeometry(0.34, 0.19, 0.28);
function makeFloor2Item(type) {
  let m;
  if (type === 'raw') m = new THREE.Mesh(rawGeo, [0xd9b382, 0xd9b382, 0xf3e2c0, 0xd9b382, 0xd9b382, 0xd9b382].map(mat));
  else if (type === 'bowl') m = new THREE.Mesh(bowlGeo, [mat(0xffffff), mat(0xf5a623), mat(0xffffff)]);
  else m = new THREE.Mesh(ivGeo, [0x9fd8ff, 0x9fd8ff, 0xffffff, 0x9fd8ff, 0x9fd8ff, 0x9fd8ff].map(mat));
  m.castShadow = true;
  m.userData.type = type;
  m.userData.f2 = true;
  return m;
}

function f2Machine(at, color, label) {
  const root = new THREE.Group();
  const body = box(2.4, 1.4, 1.4, color);
  body.position.y = 0.7;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.5), new THREE.MeshBasicMaterial({ map: signTex(label, '#2b2d42'), side: THREE.DoubleSide }));
  sign.position.set(0, 1.75, 0.72);
  root.add(body, sign);
  root.position.set(at.x, 0, at.z);
  F2.group.add(root);
  addCollider(at.x, at.z, 2.4, 1.4, 1);
  return root;
}

function f2Pile(at) {
  const s = new Stack(F2.group, gridLayout(ITEM_H));
  s.group.position.set(at.x, 0.02, at.z);
  return s;
}

function sitPose(p) {
  p.body.position.y = -0.22;
  p.legs[0].rotation.x = p.legs[1].rotation.x = -1.45;
  p.arms[0].rotation.x = p.arms[1].rotation.x = -0.3;
}

function newCustomer(c) {
  c.need = 1 + Math.floor(Math.random() * 3);
  c.got = 0;
  c.pending = 0;
  c.waited = 0;
  c.happy = 0;
  c.drawn = '';
}

function buildKitchen(animate) {
  const roots = [f2Machine(K.rawMachine, 0xc8a26b, '🌾 คลังวัตถุดิบ')];
  F2.raw = f2Pile(K.rawPickup);
  F2.group.add(zoneRing(K.rawPickup, 0xffffff));
  // Giant pot on a stove
  const pot = new THREE.Group();
  const stove = box(1.7, 0.5, 1.7, 0x4b5a70);
  stove.position.y = 0.25;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.7, 1.0, 20), mat(0x9aa8b5));
  body.position.y = 1.0;
  body.castShadow = true;
  const soup = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.05, 20), mat(0xf5c16c));
  soup.position.y = 1.48;
  pot.add(stove, body, soup);
  for (let i = 0; i < 5; i++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
    puff.userData.phase = i / 5;
    pot.add(puff);
    F2.steam.push(puff);
  }
  pot.position.set(K.pot.x, 0, K.pot.z);
  F2.group.add(pot);
  roots.push(pot);
  addCollider(K.pot.x, K.pot.z, 1.7, 1.7, 1);
  F2.group.add(zoneRing(K.potInput, 0xffd166));
  F2.bowls = f2Pile(K.bowlPickup);
  F2.group.add(zoneRing(K.bowlPickup, 0xffffff));
  // Serving counter facing the stands
  const counter = new THREE.Group();
  const desk = box(1.0, 1.0, 5.0, 0xffffff);
  desk.position.y = 0.5;
  const top = box(1.1, 0.1, 5.1, 0xf5a623);
  top.position.y = 1.03;
  counter.add(desk, top);
  counter.position.set(K.counter.x, 0, K.counter.z);
  F2.group.add(counter);
  roots.push(counter);
  addCollider(K.counter.x, K.counter.z, 1.1, 5.1, 1);
  F2.shelf = new Stack(counter, (i) => new THREE.Vector3(((i % 2) - 0.5) * 0.46, 1.17 + Math.floor(i / 8) * ITEM_H, (Math.floor((i % 8) / 2) - 1.5) * 0.5 - 1.2));
  F2.group.add(zoneRing(K.drop, 0xffd166));
  F2.group.add(zoneRing(K.serve, 0x3fbf5f));
  // Stands: five tiers; the front row are real customers, the rest an instanced crowd
  const tiers = 5;
  for (let k = 0; k < tiers; k++) {
    const step = box(1.15, 0.2 + 0.35 * k, 7.6, k % 2 ? 0x3d5a80 : 0x48688f);
    step.position.set(3.2 + k * 1.15, (0.2 + 0.35 * k) / 2, -5.7);
    F2.group.add(step);
    roots.push(step);
  }
  addCollider(3.2 + (tiers * 1.15) / 2 - 0.58, -5.7, tiers * 1.15, 7.6, 1);
  for (let i = 0; i < 7; i++) {
    const person = makePerson({ shirt: pick(SHIRTS) });
    person.group.position.set(3.2, 0.2, -8.6 + i * 0.95);
    person.group.rotation.y = -Math.PI / 2;
    sitPose(person);
    F2.group.add(person.group);
    const bubble = makeBubble();
    bubble.position.y = 2.2;
    person.group.add(bubble);
    const c = { person, bubble };
    newCustomer(c);
    c.happy = i * 0.7; // staggered first orders
    F2.customers.push(c);
  }
  const count = (tiers - 1) * 8;
  const bodies = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.25, 0.3, 4, 8), new THREE.MeshLambertMaterial(), count);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.24, 10, 8), new THREE.MeshLambertMaterial(), count);
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    bodies.setColorAt(i, color.setHex(pick(SHIRTS)));
    heads.setColorAt(i, color.setHex(pick(SKIN)));
  }
  bodies.frustumCulled = heads.frustumCulled = false; // instances sit far from the mesh origin
  F2.group.add(bodies, heads);
  F2.crowd = { bodies, heads, count, m: new THREE.Matrix4() };
  F2.kitchen = true;
  if (animate) roots.forEach(popIn);
}

function updateCrowd(t) {
  const { bodies, heads, count, m } = F2.crowd;
  for (let i = 0; i < count; i++) {
    const tier = 1 + Math.floor(i / 8);
    const x = 3.2 + tier * 1.15;
    const z = -8.9 + (i % 8) * 0.95 + (tier % 2) * 0.3;
    const y = 0.2 + 0.35 * tier + Math.abs(Math.sin(t * 3 + i)) * 0.08;
    m.makeTranslation(x, y + 0.45, z);
    bodies.setMatrixAt(i, m);
    m.makeTranslation(x, y + 0.98, z);
    heads.setMatrixAt(i, m);
  }
  bodies.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
}

function f2Pay(amount, at) {
  F2.bank += amount;
  missionProgress('earn', amount);
  floatText(at.clone().setY(F2Y + 0.6), `+${amount}`, '#8be08f');
  sfxCoin();
}

function updateKitchen(dt) {
  const t = performance.now() / 1000;
  // Store refills itself
  F2.rawTimer -= dt;
  if (F2.rawTimer <= 0 && F2.raw.total < F2_PILE_MAX) {
    F2.rawTimer = 1.0 / machineMult();
    const item = makeFloor2Item('raw');
    item.position.set(K.rawMachine.x + 1.2, F2Y + 0.8, K.rawMachine.z);
    moveToStack(item, F2.raw, 0.3);
  }
  // Pot turns raw ingredients into bowls of rice porridge
  const cooking = F2.potRaw > 0 && F2.bowls.total < F2_PILE_MAX;
  if (cooking) {
    F2.potTimer += dt * machineMult();
    if (F2.potTimer >= 1.6) {
      F2.potTimer = 0;
      F2.potRaw--;
      const bowl = makeFloor2Item('bowl');
      bowl.position.set(K.pot.x, F2Y + 1.6, K.pot.z);
      moveToStack(bowl, F2.bowls, 0.35);
    }
  }
  F2.steam.forEach((p) => {
    const k = (t * 0.6 + p.userData.phase) % 1;
    p.visible = cooking || F2.potRaw > 0;
    p.position.set(Math.sin(k * 9 + p.userData.phase * 6) * 0.3, 1.6 + k * 1.6, Math.cos(k * 7) * 0.3);
    p.material.opacity = 0.6 * (1 - k);
  });
  // Serving the front row
  const staffed = F2.server || (player.floor === 1 && flatDist(player.group.position, K.serve) < ZONE_R);
  F2.serveTimer -= dt;
  for (const c of F2.customers) {
    if (c.happy > 0) {
      c.happy -= dt;
      if (c.happy <= 0) newCustomer(c);
    } else {
      c.waited += dt;
    }
    const want = c.happy > 0 ? '😊' : c.waited > 35 ? '😡' : `${c.need - c.got}`;
    if (want !== c.drawn) {
      c.drawn = want;
      if (c.happy > 0 || c.waited > 35) c.bubble.userData.draw(want, '');
      else c.bubble.userData.draw('🍲', want);
    }
  }
  if (staffed && F2.serveTimer <= 0 && F2.shelf.count > 0) {
    const c = F2.customers.find((x) => x.happy <= 0 && x.got + x.pending < x.need);
    if (c) {
      F2.serveTimer = 0.25 / staffMult();
      const bowl = F2.shelf.take();
      c.pending++;
      fly(bowl, bowl.position.clone(), () => c.person.group.getWorldPosition(new THREE.Vector3()).setY(F2Y + 1.0), (m) => {
        scene.remove(m);
        c.pending--;
        c.got++;
        if (c.got >= c.need) {
          const tip = c.waited < 15 ? 1.2 : 1;
          f2Pay(Math.round(c.need * BOWL_PRICE * priceMult() * tip), c.person.group.getWorldPosition(new THREE.Vector3()));
          c.happy = rand(2, 4);
          c.drawn = '';
        }
      });
    }
  }
  updateCrowd(t);
}

// ---------- inpatient ward ----------
function buildWard(animate) {
  const roots = [f2Machine(W.ivMachine, 0x7fc8f8, '💧 คลังน้ำเกลือ')];
  F2.ivPile = f2Pile(W.ivPickup);
  F2.group.add(zoneRing(W.ivPickup, 0xffffff));
  F2.ward = true;
  addBeds(2, false);
  if (animate) roots.forEach(popIn);
}

function addBeds(n, animate) {
  for (let i = 0; i < n && F2.beds.length < BED_SPOTS.length; i++) {
    const at = BED_SPOTS[F2.beds.length];
    const root = new THREE.Group();
    const frame = box(1.0, 0.5, 2.0, 0xdfe6ee);
    frame.position.y = 0.25;
    const mattress = box(0.95, 0.12, 1.9, 0xffffff);
    mattress.position.y = 0.56;
    const pillow = box(0.7, 0.12, 0.35, 0xbfe0ff);
    pillow.position.set(0, 0.66, -0.75);
    const pole = box(0.05, 1.7, 0.05, 0xbbbbbb);
    pole.position.set(0.62, 0.85, -0.8);
    const bag = box(0.24, 0.4, 0.06, 0x9fd8ff);
    bag.position.set(0.62, 1.55, -0.8);
    root.add(frame, mattress, pillow, pole, bag);
    root.position.set(at.x, 0, at.z);
    F2.group.add(root);
    addCollider(at.x, at.z, 1.0, 2.0, 1);
    const bed = { at, root, bag, iv: 0.6, patient: null, stay: 0, empty: 1 + i * 2, earn: 0, drawn: '' };
    bed.ring = zoneRing(bedZone(bed), 0x9fd8ff);
    F2.group.add(bed.ring);
    bed.bubble = makeBubble();
    bed.bubble.position.set(at.x, 1.9, at.z);
    F2.group.add(bed.bubble);
    F2.beds.push(bed);
    if (animate) popIn(root);
  }
}

function updateWard(dt) {
  F2.ivTimer -= dt;
  if (F2.ivTimer <= 0 && F2.ivPile.total < F2_PILE_MAX) {
    F2.ivTimer = 1.6 / machineMult();
    const item = makeFloor2Item('iv');
    item.position.set(W.ivMachine.x + 1.2, F2Y + 0.8, W.ivMachine.z);
    moveToStack(item, F2.ivPile, 0.3);
  }
  for (const bed of F2.beds) {
    if (!bed.patient) {
      bed.empty -= dt;
      if (bed.empty <= 0) {
        // Admit a new patient, lying down with the head on the pillow
        const p = makePerson({ shirt: 0xa7d8ee, pants: 0xa7d8ee });
        p.group.rotation.x = -Math.PI / 2;
        p.group.position.set(bed.at.x, 0.62, bed.at.z + 0.85);
        F2.group.add(p.group);
        bed.patient = p;
        bed.stay = 0;
      }
    } else {
      bed.stay += dt;
      if (bed.iv > 0) {
        bed.iv = Math.max(0, bed.iv - dt / 45);
        bed.earn += BED_RATE * priceMult() * dt;
        if (bed.earn >= 5) {
          const whole = Math.floor(bed.earn);
          bed.earn -= whole;
          f2Pay(whole, bed.at);
        }
      }
      if (bed.stay > 150) {
        F2.group.remove(bed.patient.group); // discharged, all better
        floatText(bed.at.clone().setY(F2Y), '🎉 หายดีแล้ว!', '#ffffff');
        bed.patient = null;
        bed.empty = 5;
      }
    }
    bed.bag.scale.y = Math.max(0.05, bed.iv);
    bed.bag.position.y = 1.35 + 0.2 * bed.iv;
    const want = !bed.patient ? '' : bed.iv < 0.25 ? '💧' : '';
    if (want !== bed.drawn) {
      bed.drawn = want;
      bed.bubble.visible = Boolean(want);
      if (want) bed.bubble.userData.draw('💧', '!', '#e5484d');
    }
  }
}

// ---------- floor-2 staff ----------
// A worker that loops through [pickup, drop] legs, carrying up to `cap` items
function makeRunner(opts, legs, cap = 6) {
  const person = makePerson(opts);
  person.group.position.copy(legs[0].at);
  F2.group.add(person.group);
  const stack = new Stack(person.body, columnLayout(0.75, -0.42));
  const w = { person, stack, leg: 0, timer: 0, idle: 0 };
  w.update = (dt) => {
    const leg = legs[w.leg];
    const there = walkTo(person, leg.at, 3.4 * staffMult(), dt);
    animatePerson(person, !there, dt, stack.total > 0);
    if (!there) return;
    w.timer -= dt;
    if (w.timer > 0) return;
    w.timer = 0.12 / staffMult();
    if (leg.pick) {
      const from = leg.pick();
      if (from && from.count > 0 && stack.total < cap) {
        moveToStack(from.take(), stack, 0.2);
        w.idle = 0;
        return;
      }
      w.idle += 0.12;
      if (stack.total >= cap || (stack.count > 0 && w.idle > 1.2)) w.leg = (w.leg + 1) % legs.length;
    } else {
      if (stack.count > 0 && leg.drop(stack)) {
        w.idle = 0;
        return;
      }
      // Done here, or stuck (e.g. the pot is full): move on and come back later
      w.idle += 0.12;
      if (stack.total === 0 || w.idle > 1.5) {
        w.leg = (w.leg + 1) % legs.length;
        w.idle = 0;
      }
    }
  };
  staff.push(w);
  return w;
}

function dropIntoPot(stack) {
  if (F2.potRaw >= POT_MAX) return false;
  const item = stack.take('raw');
  if (!item) return false;
  F2.potRaw++;
  fly(item, item.position.clone(), () => K.pot.clone().setY(F2Y + 1.5), (m) => scene.remove(m), 0.25, 0.8);
  return true;
}
function dropOnCounter(stack) {
  if (F2.shelf.total >= 16) return false;
  const item = stack.take('bowl');
  if (!item) return false;
  moveToStack(item, F2.shelf, 0.2);
  return true;
}
function refillBed(stack, bed) {
  if (!bed?.patient || bed.iv > 0.7) return false;
  const item = stack.take('iv');
  if (!item) return false;
  fly(item, item.position.clone(), () => bed.bag.getWorldPosition(new THREE.Vector3()), (m) => scene.remove(m), 0.25, 0.6);
  bed.iv = 1;
  return true;
}
const neediestBed = () => F2.beds.filter((b) => b.patient && b.iv < 0.5).sort((a, b) => a.iv - b.iv)[0];

function hireCook(animate) {
  F2.cook = makeRunner({ shirt: 0xffffff, pants: 0x2b2d42, cap: true }, [
    { at: K.rawPickup, pick: () => F2.raw },
    { at: K.potInput, drop: dropIntoPot },
    { at: K.bowlPickup, pick: () => F2.bowls },
    { at: K.drop, drop: dropOnCounter },
  ]);
  if (animate) popIn(F2.cook.person.group);
}
function hireServer(animate) {
  const p = makePerson({ shirt: 0xf5a623, pants: 0x2b2d42 });
  p.group.position.set(K.serve.x, 0, K.serve.z);
  p.group.rotation.y = Math.PI / 2;
  F2.group.add(p.group);
  F2.server = p;
  staff.push({ person: p, update: (dt) => animatePerson(p, false, dt) });
  if (animate) popIn(p.group);
}
function hireWardNurse(animate) {
  F2.wardNurse = makeRunner({ shirt: 0x48cae4, pants: 0x48cae4, cap: true }, [
    { at: W.ivPickup, pick: () => (neediestBed() ? F2.ivPile : null) },
    { get at() { return neediestBed() ? bedZone(neediestBed()) : W.ivPickup; }, drop: (s) => refillBed(s, neediestBed()) },
  ], 4);
  if (animate) popIn(F2.wardNurse.person.group);
}

// ---------- cash basket: floor-2 earnings ride a rope down to the ground ----------
const basket = { built: false, mesh: null, rope: null, y: F2Y + 0.3, state: 'top', load: 0, wait: 0, pile: null };
function buildBasket() {
  const crane = new THREE.Group();
  const post = box(0.16, 2.2, 0.16, 0xf5a623);
  post.position.set(0, F2Y + 1.1, -0.6);
  const arm = box(0.12, 0.12, 1.0, 0xf5a623);
  arm.position.set(0, F2Y + 2.2, -0.1);
  crane.add(post, arm);
  crane.position.set(BASKET_AT.x, 0, BASKET_AT.z);
  scene.add(crane);
  basket.mesh = new THREE.Group();
  const tray = box(0.9, 0.3, 0.7, 0x8a5a30);
  const cash = box(0.7, 0.12, 0.5, 0x2e9e4f);
  cash.position.y = 0.2;
  basket.cash = cash;
  basket.mesh.add(tray, cash);
  basket.mesh.position.set(BASKET_AT.x, basket.y, BASKET_AT.z + 0.4);
  scene.add(basket.mesh);
  basket.rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 6), mat(0x444444));
  scene.add(basket.rope);
  basket.pile = new MoneyPile(BASKET_AT.clone().add(v(0, 0.1)));
  basket.built = true;
}
function updateBasket(dt) {
  if (!basket.built) return;
  if (basket.state === 'top') {
    basket.wait += dt;
    if (basket.wait > 3 && F2.bank >= 1) {
      basket.load = Math.floor(F2.bank);
      F2.bank -= basket.load;
      basket.state = 'down';
      basket.wait = 0;
    }
  } else if (basket.state === 'down') {
    basket.y = Math.max(0.3, basket.y - dt * 3);
    if (basket.y <= 0.3) {
      basket.pile.add(basket.load);
      floatText(BASKET_AT, `💰 +${basket.load.toLocaleString()} จากชั้น 2`, '#8be08f');
      basket.load = 0;
      basket.state = 'up';
    }
  } else {
    basket.y = Math.min(F2Y + 0.3, basket.y + dt * 3);
    if (basket.y >= F2Y + 0.3) basket.state = 'top';
  }
  basket.cash.visible = basket.load > 0 || (basket.state === 'top' && F2.bank >= 1);
  basket.mesh.position.y = basket.y;
  const ropeTop = F2Y + 2.2;
  const len = ropeTop - basket.y - 0.15;
  basket.rope.scale.y = Math.max(0.01, len);
  basket.rope.position.set(BASKET_AT.x, basket.y + 0.15 + len / 2, BASKET_AT.z + 0.4);
  basket.pile.collect(dt);
}

// ---------- player on floor 2 ----------
function floor2Actions(pos, stack) {
  const near = (p) => flatDist(pos, p) < ZONE_R + 0.2;
  if (near(TRASH2) && stack.count > 0) {
    const item = stack.take();
    fly(item, item.position.clone(), () => TRASH2.clone().setY(F2Y + 0.9), (m) => scene.remove(m), 0.22, 0.6);
    return true;
  }
  if (F2.kitchen) {
    if (near(K.rawPickup) && F2.raw.count > 0 && stack.total < bagCapacity()) return moveToStack(F2.raw.take(), stack, 0.2), true;
    if (near(K.potInput) && dropIntoPot(stack)) return true;
    if (near(K.bowlPickup) && F2.bowls.count > 0 && stack.total < bagCapacity()) return moveToStack(F2.bowls.take(), stack, 0.2), true;
    if (near(K.drop) && dropOnCounter(stack)) return true;
  }
  if (F2.ward) {
    if (near(W.ivPickup) && F2.ivPile.count > 0 && stack.total < bagCapacity()) return moveToStack(F2.ivPile.take(), stack, 0.2), true;
    for (const bed of F2.beds) if (near(bedZone(bed)) && refillBed(stack, bed)) return true;
  }
  return false;
}

// What should the doctor do upstairs? (used by AUTO and the guide arrow)
function floor2Tasks() {
  const stack = player.stack;
  const cap = bagCapacity();
  const tasks = [];
  const tileHere = tile && (tile.u.floor || 0) === 1;
  if (tile && state.money >= tile.u.price - state.paid) {
    tasks.push(tileHere ? { at: tile.u.at, keep: () => tile && state.money > 0 } : { at: ELEVATOR, keep: () => player.floor === 1 });
  }
  if (stack.countOf('raw') > 0 && F2.potRaw < POT_MAX) tasks.push({ at: K.potInput, keep: () => stack.countOf('raw') > 0 && F2.potRaw < POT_MAX });
  if (stack.countOf('bowl') > 0 && F2.shelf.total < 16) tasks.push({ at: K.drop, keep: () => stack.countOf('bowl') > 0 && F2.shelf.total < 16 });
  const bed = neediestBed();
  if (stack.countOf('iv') > 0 && bed) tasks.push({ at: bedZone(bed), keep: () => stack.countOf('iv') > 0 && bed.iv < 0.7 });
  const usable = stack.items.every((m) => ['raw', 'bowl', 'iv'].includes(m.userData.type));
  if (stack.count > 0 && (!usable || !tasks.length)) tasks.push({ at: TRASH2, keep: () => player.stack.count > 0 });
  if (F2.kitchen && !F2.server && F2.shelf.count > 0 && F2.customers.some((c) => c.happy <= 0)) {
    tasks.push({ at: K.serve, keep: () => F2.shelf.count > 0 && F2.customers.some((c) => c.happy <= 0 && c.got + c.pending < c.need) });
  }
  if (F2.kitchen && !F2.cook && stack.total < cap) {
    if (F2.bowls.count > 0 && F2.shelf.total < 16) tasks.push({ at: K.bowlPickup, keep: () => stack.total < cap && F2.bowls.count > 0 });
    if (F2.raw.count > 0 && F2.potRaw < POT_MAX) tasks.push({ at: K.rawPickup, keep: () => stack.total < cap && F2.raw.count > 0 && stack.countOf('raw') + F2.potRaw < POT_MAX });
  }
  if (F2.ward && !F2.wardNurse && bed && stack.total < cap && F2.ivPile.count > 0) {
    tasks.push({ at: W.ivPickup, keep: () => stack.countOf('iv') < 3 && F2.ivPile.count > 0 });
  }
  // Nothing to do up here: go down (cash waits in the basket pile)
  tasks.push({ at: ELEVATOR, keep: () => player.floor === 1 });
  return tasks;
}

// Upstairs income for the away-earnings estimate (per second, before the away rate)
function floor2PerSecond() {
  let rate = 0;
  if (F2.kitchen && F2.cook && F2.server) rate += (machineMult() / 1.6) * BOWL_PRICE * priceMult();
  if (F2.ward && F2.wardNurse) rate += F2.beds.length * BED_RATE * priceMult() * (150 / 155);
  return rate;
}

function floor2Snapshot() {
  if (!F2.built) return null;
  return {
    bank: Math.floor(F2.bank), basket: basket.pile ? basket.pile.amount + basket.load : 0, potRaw: F2.potRaw,
    raw: F2.raw?.count || 0, bowls: F2.bowls?.count || 0, shelf: F2.shelf?.count || 0, iv: F2.ivPile?.count || 0,
    beds: F2.beds.map((b) => +b.iv.toFixed(2)),
  };
}
function restoreFloor2(s) {
  if (!s || !F2.built) return;
  F2.bank = s.bank || 0;
  if (basket.pile) basket.pile.add(s.basket || 0);
  const fill = (stack, n, type) => {
    for (let i = 0; i < Math.min(n || 0, F2_PILE_MAX); i++) stack.place(makeFloor2Item(type));
  };
  if (F2.kitchen) {
    F2.potRaw = Math.min(s.potRaw || 0, POT_MAX);
    fill(F2.raw, s.raw, 'raw');
    fill(F2.bowls, s.bowls, 'bowl');
    for (let i = 0; i < Math.min(s.shelf || 0, 16); i++) F2.shelf.place(makeFloor2Item('bowl'));
  }
  if (F2.ward) {
    fill(F2.ivPile, s.iv, 'iv');
    (s.beds || []).forEach((iv, i) => {
      if (F2.beds[i]) F2.beds[i].iv = iv;
    });
  }
}

function updateFloor2(dt) {
  if (F2.kitchen) updateKitchen(dt);
  if (F2.ward) updateWard(dt);
  updateBasket(dt);
}

// ---------- player actions ----------
let actTimer = 0;
function playerActions(dt) {
  actTimer -= dt;
  if (actTimer > 0) return;
  const pos = player.group.position;
  const stack = player.stack;
  if (player.floor === 1) {
    if (floor2Actions(pos, stack)) {
      actTimer = 0.07;
      sfxPop();
      updateBag();
    }
    return;
  }
  // Standing at the bin empties the bag, one item at a time
  if (flatDist(pos, TRASH) < ZONE_R + 0.2 && stack.count > 0) {
    const item = stack.take();
    fly(item, item.position.clone(), () => TRASH.clone().setY(0.9), (m) => {
      scene.remove(m);
      if (trashLid) trashLid.rotation.z = 0.5; // lid flaps open
    }, 0.22, 0.6);
    actTimer = 0.05;
    sfxPop();
    updateBag();
    return;
  }
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
      tut.dropped = true;
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
    if (c.floor !== player.floor) continue;
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
  if (player.floor === 1) {
    // Stay on the platform upstairs
    pos.x = Math.max(FLOOR.x0 + 0.2, Math.min(FLOOR.x1 - 0.2, pos.x));
    pos.z = Math.max(FLOOR.z0 + 0.2, Math.min(FLOOR.z1 - 0.2, pos.z));
  }
}

function updatePlayer(dt) {
  if (updateElevator(dt)) return;
  readInput();
  autopilot(dt);
  const speed = 6.2 * speedMult();
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

// ---------- autopilot ----------
// With AUTO on, the doctor plays by itself once the player stops steering.
// It picks the most useful job, walks there and stays until the job is done.
const auto = { on: true, idle: 0, task: null, retarget: 0, stuck: 0, nudge: 0, nudgeDir: 0, lastDist: Infinity };
try {
  auto.on = localStorage.getItem('drquest-auto') !== 'off';
} catch {
  // Storage blocked: default to on
}
const AUTO_DELAY = 2; // seconds without input before the autopilot takes over

function autoTasks() {
  if (player.floor === 1) return floor2Tasks();
  const stack = player.stack;
  const cap = bagCapacity();
  const lines = Object.values(LINES).filter((l) => l.active);
  const rooms = Object.values(ROOMS).filter((r) => r.active);
  const tasks = [];
  if (tile && state.money >= tile.u.price - state.paid) {
    const t = tile;
    // Upstairs tiles: ride the elevator first
    if (t.u.floor) tasks.push({ at: ELEVATOR, keep: () => player.floor === 0 });
    else tasks.push({ at: t.u.at, keep: () => tile === t && state.money > 0 });
  }
  for (const line of [...lines].sort((a, b) => a.shelf.total - b.shelf.total)) {
    if (stack.countOf(line.product) > 0 && line.shelf.total < SHELF_MAX) {
      tasks.push({ at: line.drop, keep: () => stack.countOf(line.product) > 0 && line.shelf.total < SHELF_MAX });
    }
  }
  // Carrying things there's no use for (a carrier nurse already stocks that line,
  // or the shelf has been full for a while): take them to the bin
  const deliverable = lines.some((l) => stack.countOf(l.product) > 0 && l.shelf.total < SHELF_MAX);
  auto.stuckCarry = stack.count > 0 && !deliverable ? (auto.stuckCarry || 0) + 0.3 : 0;
  const unwanted = stack.items.some((m) => {
    const line = LINES[m.userData.type];
    return !line?.active || line.carrier;
  });
  if (stack.count > 0 && !deliverable && (unwanted || auto.stuckCarry > 8)) {
    tasks.push({ at: TRASH, keep: () => player.stack.count > 0 });
  }
  for (const line of lines) {
    const front = line.queue[0];
    if (!line.cashierNurse && front?.arrived && line.shelf.count > 0) {
      tasks.push({ at: line.cashier, keep: () => line.queue[0] && (line.queue[0].pending > 0 || line.shelf.count > 0) });
    }
  }
  for (const room of rooms) {
    if (!room.staffHired && room.queue[0]?.arrived) tasks.push({ at: room.operator, keep: () => room.queue[0]?.arrived });
  }
  const piles = [...lines, ...rooms].map((x) => x.cash).concat(basket.pile ? [basket.pile] : []).sort((a, b) => b.amount - a.amount);
  if (piles[0]?.amount >= 15) tasks.push({ at: piles[0].pos, keep: () => piles[0].amount > 0 });
  if (stack.total < cap) {
    for (const line of [...lines].sort((a, b) => a.shelf.total - b.shelf.total)) {
      if (!line.carrier && line.pile.count > 0 && line.shelf.total + stack.total < SHELF_MAX) {
        tasks.push({ at: line.pickup, keep: () => stack.total < cap && line.pile.count > 0 });
      }
    }
  }
  if (piles[0]?.amount > 0) tasks.push({ at: piles[0].pos, keep: () => piles[0].amount > 0 });
  // Nothing urgent: wait at the busiest unstaffed cashier so patients get served
  const waitAt = lines.find((l) => !l.cashierNurse && l.queue.length);
  if (waitAt) tasks.push({ at: waitAt.cashier, keep: () => false });
  return tasks;
}

function autopilot(dt) {
  const steering = Math.hypot(input.x, input.z) > 0.08;
  if (steering) {
    auto.idle = 0;
    auto.task = null;
  } else {
    auto.idle += dt;
  }
  const active = auto.on && running && tutorialDone() && auto.idle >= AUTO_DELAY;
  autoBadge.classList.toggle('show', active);
  if (!active) return;
  // With every department built, AUTO spends spare money on the cheapest upgrade
  if (!tile) {
    const c = cheapestUpgrade();
    if (c && state.money >= upCost(c)) buyUpgrade(c);
  }
  document.getElementById('hint').style.display = 'none';

  auto.retarget -= dt;
  if (!auto.task || auto.retarget <= 0) {
    auto.retarget = 0.3;
    if (!auto.task || !auto.task.keep()) {
      auto.task = autoTasks()[0] || null;
      auto.lastDist = Infinity;
      auto.stuck = 0;
    }
  }
  if (!auto.task) return;
  const pos = player.group.position;
  const way = player.floor === 1 ? auto.task.at : route(pos, auto.task.at);
  const dx = way.x - pos.x;
  const dz = way.z - pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.25) return;
  // If a wall or counter blocks the straight line, side-step for a moment
  if (auto.nudge > 0) {
    auto.nudge -= dt;
    input.x = Math.cos(auto.nudgeDir);
    input.z = Math.sin(auto.nudgeDir);
    return;
  }
  if (!auto.lastWay || flatDist(auto.lastWay, way) > 0.01) {
    auto.lastWay = way.clone();
    auto.lastDist = Infinity;
  }
  auto.stuck = d > auto.lastDist - 0.02 ? auto.stuck + dt : 0;
  auto.lastDist = Math.min(auto.lastDist, d);
  if (auto.stuck > 0.6) {
    auto.stuck = 0;
    auto.lastDist = Infinity;
    auto.nudge = 0.5;
    auto.nudgeDir = Math.atan2(dz, dx) + (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
  }
  const k = way === auto.task.at ? Math.min(1, d / 0.6) : 1; // ease in only at the final stop
  input.x = (dx / d) * k;
  input.z = (dz / d) * k;
}

function setAuto(on) {
  auto.on = on;
  auto.task = null;
  autoBtn.classList.toggle('on', on);
  try {
    localStorage.setItem('drquest-auto', on ? 'on' : 'off');
  } catch {
    // Storage blocked: the setting just won't persist
  }
  updateWakeLock();
}

// Keep the phone screen awake while AUTO is playing
let wakeLock = null;
async function updateWakeLock() {
  const want = auto.on && running && !document.hidden;
  try {
    if (want && !wakeLock && navigator.wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!want && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {
    wakeLock = null; // Not supported or refused (e.g. low battery mode)
  }
}

// ---------- idle earnings ----------
// While the game is closed or in the background, hired staff keep the hospital running.
const OFFLINE_RATE = 0.35; // share of the live income rate earned while away
const OFFLINE_CAP = 6 * 3600; // seconds

function idleIncome(seconds) {
  const lines = Object.values(LINES).filter((l) => l.active);
  const rooms = Object.values(ROOMS).filter((r) => r.active);
  // Patients arrive at this rate and split across services like updatePatients does
  const arrivals = arrivalMult() / (state.unlocked.has('ambulance') ? 1.7 : 3.2);
  const weights = [...lines.map(() => 2), ...rooms.map(() => 1)];
  const totalW = weights.reduce((a, b) => a + b, 0) || 1;
  let perSecond = 0;
  // A line runs on its own only with both a cashier and a carrier
  lines.forEach((line) => {
    if (!line.cashierNurse || !line.carrier) return;
    const avgNeed = line.product === 'pill' ? 2 : 1.5;
    const machineRate = machineMult() / (state.unlocked.has('speed') ? 0.55 : 1.0);
    perSecond += Math.min(arrivals * (2 / totalW) * avgNeed, machineRate) * PRODUCTS[line.product].price * priceMult();
  });
  rooms.forEach((room) => {
    if (room.staffHired) perSecond += Math.min(arrivals * (1 / totalW), staffMult() / room.time) * room.price * priceMult();
  });
  perSecond += floor2PerSecond();
  const t = Math.min(seconds, OFFLINE_CAP);
  return { amount: Math.floor(perSecond * t * OFFLINE_RATE), perHour: Math.round(perSecond * 3600 * OFFLINE_RATE), seconds: t };
}

function formatDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h) return `${h} ชม. ${m} นาที`;
  if (m) return `${m} นาที`;
  return `${Math.floor(sec)} วินาที`;
}

// Branches that aren't on screen keep earning at the rate saved with them
function otherBranchesRate() {
  return state.branches.reduce((sum, b, i) => sum + (i !== state.branch && b?.idleRate ? b.idleRate : 0), 0);
}

let pendingIdle = 0;
function offerIdleEarnings(seconds) {
  if (seconds < 60) return;
  const here = idleIncome(seconds);
  const others = Math.floor(otherBranchesRate() * here.seconds);
  const amount = here.amount + others;
  const perHour = here.perHour + Math.round(otherBranchesRate() * 3600);
  const counted = here.seconds;
  const box = document.getElementById('away');
  const text = document.getElementById('awaytext');
  if (amount > 0) {
    pendingIdle = amount;
    text.innerHTML = `คุณไม่อยู่ ${formatDuration(seconds)}<br>พนักงานช่วยกันดูแลคนไข้ได้<br><b>💵 ${amount.toLocaleString()}</b>`
      + (others > 0 ? `<br><small>(รวมสาขาอื่น 💵${others.toLocaleString()})</small>` : '')
      + (seconds > counted ? '<br><small>(นับสูงสุด 6 ชั่วโมง)</small>' : '')
      + `<br><small>รายได้ตอนไม่อยู่ประมาณ ${perHour.toLocaleString()}/ชม.</small>`;
    document.getElementById('awayok').textContent = 'เก็บเงิน';
  } else {
    pendingIdle = 0;
    if (state.step === 0) return;
    text.innerHTML = `คุณไม่อยู่ ${formatDuration(seconds)}<br>แต่ยังไม่มีพนักงานทำงานแทน 😅<br><small>จ้างพยาบาลแคชเชียร์ + พยาบาลขนยา (หรือเจ้าหน้าที่ประจำห้อง) แล้วโรงพยาบาลจะหาเงินให้ตอนคุณไม่อยู่</small>`;
    document.getElementById('awayok').textContent = 'เข้าใจแล้ว';
  }
  box.style.display = 'flex';
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
  if (!tutorialDone()) {
    const at = TUTORIAL[state.tutorial].at?.();
    if (at) return at;
  }
  if (player.floor === 1) return floor2Tasks()[0]?.at || null;
  const stack = player.stack;
  const pill = LINES.pill;
  const piles = [...Object.values(LINES), ...Object.values(ROOMS)].filter((x) => x.active).map((x) => x.cash);
  if (basket.pile) piles.push(basket.pile);
  if (tile && state.money >= tile.u.price - state.paid) return tile.u.floor ? ELEVATOR : tile.u.at;
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
  guideHolder.position.set(pos.x, pos.y + 0.25, pos.z);
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
  if (n > 0) state.earned = (state.earned || 0) + n; // lifetime earnings for the leaderboard
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
  goalEl.textContent = u ? `🎯 ถัดไป: ${u.icon} ${u.label}${u.floor ? ' (ชั้น 2)' : ''} · 💵${u.price}`
    : canOpenBranch() ? '🏆 ครบทุกแผนก! กด 🗺️ เพื่อเปิดสาขาใหม่' : '🏆 สาขานี้ครบทุกแผนกแล้ว!';
}

// ---------- rating & upgrades UI ----------
const ratingEl = document.getElementById('rating');
function updateRating() {
  ratingEl.textContent = `⭐ ${state.rating.toFixed(1)}${state.branch ? ` · สาขา ${state.branch + 1}` : ''}`;
}

const upPanel = document.getElementById('upgrades');
const upList = document.getElementById('uplist');
const upBtn = document.getElementById('upbtn');
function renderUpgrades() {
  upList.innerHTML = '';
  for (const u of UPGRADES) {
    const lvl = upLevel(u.id);
    const maxed = lvl >= u.max;
    const cost = upCost(u);
    const row = document.createElement('div');
    row.className = 'uprow';
    row.innerHTML = `<div class="upico">${u.icon}</div>
      <div class="upinfo"><b>${u.name}</b> <span class="lv">Lv.${lvl}/${u.max}</span><br><small>${u.desc(lvl)}${maxed ? '' : ` → ${u.desc(lvl + 1).replace(/^.*?([+−-].*)$/, '$1')}`}</small></div>`;
    const btn = document.createElement('button');
    btn.className = 'btn upbuy';
    btn.textContent = maxed ? 'สูงสุด' : `💵${cost.toLocaleString()}`;
    btn.disabled = maxed || state.money < cost;
    btn.addEventListener('click', () => buyUpgrade(u));
    row.append(btn);
    upList.append(row);
  }
}
function buyUpgrade(u) {
  const cost = upCost(u);
  if (upLevel(u.id) >= u.max || state.money < cost) return false;
  state.money -= cost;
  state.upgrades[u.id] = upLevel(u.id) + 1;
  missionProgress('upgrade', 1);
  updateMoney();
  updateBag();
  sfxUnlock();
  floatText(player.group.position, `${u.icon} Lv.${upLevel(u.id)}`, '#ffd166');
  save();
  if (upPanel.style.display === 'flex') renderUpgrades();
  return true;
}
function cheapestUpgrade() {
  return UPGRADES.filter((u) => upLevel(u.id) < u.max).sort((a, b) => upCost(a) - upCost(b))[0];
}
// Red dot on the ⬆️ button when something is affordable
function updateUpgradeDot() {
  const c = cheapestUpgrade();
  upBtn.classList.toggle('ready', Boolean(c && state.money >= upCost(c)));
  branchBtn.classList.toggle('ready', canOpenBranch() && state.money >= newBranchCost());
}

// ---------- daily missions ----------
// Three missions a day, picked from the date so they're the same all day
const MISSIONS = [
  { type: 'serve', icon: '🧑‍⚕️', text: (n) => `รักษาคนไข้ ${n} คน`, targets: [20, 35, 50] },
  { type: 'earn', icon: '💵', text: (n) => `หาเงินจากคนไข้ ${n.toLocaleString()}`, targets: [400, 800, 1500], scale: true },
  { type: 'tips', icon: '💖', text: (n) => `ได้ทิป ${n} ครั้ง`, targets: [8, 15, 25] },
  { type: 'emergency', icon: '🚨', text: (n) => `ช่วยคนไข้ฉุกเฉิน ${n} คน`, targets: [3, 5, 8], from: 2 },
  { type: 'vip', icon: '👑', text: (n) => `ดูแลคนไข้ VIP ${n} คน`, targets: [2, 3, 5], from: 4 },
  { type: 'upgrade', icon: '⬆️', text: (n) => `อัปเกรด ${n} ครั้ง`, targets: [1, 2, 3], from: 1 },
];
const todayKey = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time

function rollDaily() {
  const key = todayKey();
  const rnd = (() => {
    let h = 0;
    for (const ch of key) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
    return () => ((h = (Math.imul(h, 1664525) + 1013904223) | 0) >>> 0) / 4294967296;
  })();
  const pool = MISSIONS.filter((m) => !m.from || state.step >= m.from);
  const picked = [];
  while (picked.length < 3 && pool.length) picked.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  const growth = 1 + state.step * 0.25 + (state.branch || 0) * 0.5;
  state.daily = {
    date: key,
    missions: picked.map((m, i) => {
      const target = Math.round(m.targets[i % 3] * (m.scale ? growth : 1));
      return { type: m.type, target, progress: 0, reward: Math.round((120 * growth * (1 + i * 0.5)) / 10) * 10, claimed: false };
    }),
  };
}
function ensureDaily() {
  if (!state.daily || state.daily.date !== todayKey()) {
    rollDaily();
    if (missionPanel.style.display === 'flex') renderMissions();
  }
}
function missionProgress(type, n) {
  if (!state.daily) return;
  for (const m of state.daily.missions) if (m.type === type && !m.claimed) m.progress = Math.min(m.target, m.progress + n);
}

const missionPanel = document.getElementById('missions');
const missionList = document.getElementById('mlist');
const missionBtn = document.getElementById('missionbtn');
function renderMissions() {
  missionList.innerHTML = '';
  for (const m of state.daily.missions) {
    const def = MISSIONS.find((d) => d.type === m.type);
    const done = m.progress >= m.target;
    const row = document.createElement('div');
    row.className = 'uprow';
    row.innerHTML = `<div class="upico">${def.icon}</div>
      <div class="upinfo"><b>${def.text(m.target)}</b><br>
      <div class="mbar"><div style="width:${(m.progress / m.target) * 100}%"></div></div>
      <small>${Math.floor(m.progress).toLocaleString()} / ${m.target.toLocaleString()} · รางวัล 💵${m.reward.toLocaleString()}</small></div>`;
    const btn = document.createElement('button');
    btn.className = 'btn upbuy';
    btn.textContent = m.claimed ? 'รับแล้ว ✓' : 'รับรางวัล';
    btn.disabled = m.claimed || !done;
    btn.addEventListener('click', () => {
      if (m.claimed || m.progress < m.target) return;
      m.claimed = true;
      addMoney(m.reward);
      sfxUnlock();
      floatText(player.group.position, `+${m.reward.toLocaleString()} 📋`, '#8be08f');
      save();
      renderMissions();
    });
    row.append(btn);
    missionList.append(row);
  }
}
function updateMissionDot() {
  const ready = state.daily?.missions.some((m) => !m.claimed && m.progress >= m.target);
  missionBtn.classList.toggle('ready', Boolean(ready));
}

// ---------- hospital chain: switch between branches, open new ones ----------
const branchName = (i) => `สาขา ${i + 1}`;
const branchMultOf = (i) => 1 + 0.5 * i;
// A new branch can be opened from the newest one once it's fully built
const canOpenBranch = () => state.branch === state.branches.length - 1 && state.step >= UNLOCKS.length;
const newBranchCost = () => 5000 * state.branches.length;

let otherBuffer = 0;
let otherShown = 0;
function tickOtherBranches(dt) {
  const rate = otherBranchesRate();
  if (!rate) return;
  otherBuffer += rate * dt;
  if (otherBuffer >= 1) {
    const whole = Math.floor(otherBuffer);
    otherBuffer -= whole;
    addMoney(whole);
    otherShown += whole;
  }
  // Show a little "+X from other branches" now and then
  tickOtherBranches.t = (tickOtherBranches.t || 0) + dt;
  if (tickOtherBranches.t > 15 && otherShown > 0) {
    floatText(player.group.position, `🏥 +${otherShown.toLocaleString()} จากสาขาอื่น`, '#bfe9ff');
    otherShown = 0;
    tickOtherBranches.t = 0;
  }
}

const branchPanel = document.getElementById('branches');
const branchList = document.getElementById('blist');
const branchBtn = document.getElementById('branchbtn');
function renderBranches() {
  branchList.innerHTML = '';
  state.branches[state.branch] = branchSnapshot();
  state.branches.forEach((b, i) => {
    const row = document.createElement('div');
    row.className = 'uprow';
    const here = i === state.branch;
    const step = b?.step || 0;
    const rate = Math.round((b?.idleRate || 0) * 3600);
    row.innerHTML = `<div class="upico" style="color:${BRANCH_COLORS[i % BRANCH_COLORS.length]}">🏥</div>
      <div class="upinfo"><b>${branchName(i)}</b> <span class="lv">รายได้ ×${branchMultOf(i).toFixed(1)}</span><br>
      <small>⭐ ${(b?.rating ?? 3).toFixed(1)} · ปลดล็อก ${step}/${UNLOCKS.length}${rate ? ` · ตอนไม่อยู่ ~${rate.toLocaleString()}/ชม.` : ''}</small></div>`;
    const btn = document.createElement('button');
    btn.className = 'btn upbuy';
    btn.textContent = here ? 'อยู่ที่นี่' : 'ไปสาขานี้';
    btn.disabled = here;
    btn.addEventListener('click', () => switchBranch(i));
    row.append(btn);
    branchList.append(row);
  });
  const next = state.branches.length;
  const card = document.createElement('div');
  card.className = 'branchcard';
  if (canOpenBranch()) {
    const cost = newBranchCost();
    card.innerHTML = `<b>🏗️ เปิด${branchName(next)}</b><br><small>รายได้ ×${branchMultOf(next).toFixed(1)} · สาขาเดิมยังอยู่และหาเงินต่อ</small>`;
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = `เปิดสาขา · 💵${cost.toLocaleString()}`;
    btn.disabled = state.money < cost;
    btn.addEventListener('click', openBranch);
    card.append(btn);
  } else {
    const newest = state.branches.length - 1;
    card.innerHTML = `<small>สร้าง${branchName(newest)}ให้ครบทุกแผนก แล้วจะเปิด${branchName(next)}ได้</small>`;
  }
  branchList.append(card);
}

// Store this branch, then reload into another one (the scene is rebuilt from the save)
function switchBranch(i) {
  if (i === state.branch) return;
  const data = saveData();
  data.current = i;
  data.step = data.branches[i]?.step || 0;
  replaceSave(data);
}

function openBranch() {
  const cost = newBranchCost();
  const next = state.branches.length;
  if (!canOpenBranch() || state.money < cost) return;
  if (!confirm(`เปิด${branchName(next)} ราคา 💵${cost.toLocaleString()}?\n\nสาขาใหม่เริ่มสร้างตั้งแต่ต้น แต่รายได้ ×${branchMultOf(next).toFixed(1)} และสาขาเดิมยังอยู่ หาเงินต่อให้ และกลับไปดูได้ตลอด`)) return;
  state.money -= cost;
  const data = saveData();
  data.branches.push(null);
  data.current = next;
  data.branch = next;
  data.step = 0;
  replaceSave(data);
}

// ---------- tutorial ----------
// Six short steps for a new player; each ends when the game sees it done
const tut = { moved: 0, dropped: false, served: false, start: null };
const TUTORIAL = [
  { text: '👆 ลากนิ้วบนจอเพื่อเดิน', done: () => tut.moved > 2.5 },
  { text: '💊 เดินเข้า<b>วงสีขาว</b>หน้าเครื่อง เพื่อเก็บยาขึ้นหลัง', at: () => LINES.pill.pickup, done: () => player.stack.total >= 3 },
  { text: '📦 เอายาไปวางที่<b>วงสีเหลือง</b>หลังเคาน์เตอร์', at: () => LINES.pill.drop, done: () => tut.dropped },
  { text: '💚 ยืนใน<b>วงสีเขียว</b>เพื่อจ่ายยาให้คนไข้', at: () => LINES.pill.cashier, done: () => tut.served },
  { text: '💵 เดินไปเก็บ<b>กองเงิน</b>ข้างเคาน์เตอร์', at: () => LINES.pill.money, done: () => state.earned > 0 },
  { text: '🎯 ยืนบน<b>ช่องราคา</b>เพื่อจ้างพยาบาลแคชเชียร์คนแรก (ทำต่อจนมีเงินพอ)', at: () => UNLOCKS[0].at, done: () => state.step >= 1 },
];
const tutorialDone = () => state.tutorial >= TUTORIAL.length;
const tutEl = document.getElementById('tut');
let tutShown = -1;

function updateTutorial() {
  if (tutorialDone()) {
    if (tutShown !== -2) {
      tutEl.style.display = 'none';
      tutShown = -2;
    }
    return;
  }
  // Count real walking for step 1
  if (!tut.start) tut.start = player.group.position.clone();
  tut.moved = Math.max(tut.moved, flatDist(player.group.position, tut.start));
  const step = TUTORIAL[state.tutorial];
  if (step.done()) {
    state.tutorial++;
    sfxCoin();
    if (tutorialDone()) {
      floatText(player.group.position, '🎉 เก่งมาก! ปลดล็อกปุ่มใหม่แล้ว', '#ffd166');
      goalEl.style.display = 'block';
      save();
    }
    return;
  }
  if (tutShown !== state.tutorial) {
    tutShown = state.tutorial;
    document.getElementById('tutstep').textContent = `บทสอน ${state.tutorial + 1}/${TUTORIAL.length}`;
    document.getElementById('tuttext').innerHTML = step.text;
    tutEl.style.display = 'block';
    goalEl.style.display = 'none';
    document.getElementById('hint').style.display = 'none';
  }
}

// ---------- dock ----------
// Buttons show up once the thing they open is useful; a "ใหม่!" tag marks fresh ones
const DOCK = {
  autobtn: () => tutorialDone(),
  upbtn: () => tutorialDone(),
  missionbtn: () => tutorialDone(),
  branchbtn: () => canOpenBranch() || state.branches.length > 1,
};
function updateDock(initial = false) {
  for (const [id, visible] of Object.entries(DOCK)) {
    const el = document.getElementById(id);
    const show = visible();
    if (show && el.classList.contains('locked')) {
      el.classList.remove('locked');
      if (!initial) el.classList.add('fresh');
    } else if (!show && !el.classList.contains('locked')) {
      el.classList.add('locked');
    }
  }
}
for (const id of Object.keys(DOCK)) {
  document.getElementById(id).addEventListener('click', (e) => e.currentTarget.classList.remove('fresh'));
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
  document.getElementById('soundbtn').textContent = on ? '🔊 เสียง: เปิด' : '🔇 เสียง: ปิด';
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
// state.branch is the open branch's index; state.branches holds a snapshot of every
// branch (null = opened but never played). Money, earnings and missions are shared.
const state = { money: 0, step: 0, paid: 0, unlocked: new Set(), upgrades: {}, rating: 3, branch: 0, branches: [null], daily: null, earned: 0, tutorial: 0 };

let awayOnLoad = 0;
let localSavedAt = 0;
let saveBlocked = false; // set while resetting or importing, so pagehide can't write the old game back
let storageOK = true;

// The open branch as a snapshot, including its idle income rate so other branches
// can keep paying out while it isn't the one on screen
function branchSnapshot() {
  return {
    step: state.step, paid: state.paid, upgrades: state.upgrades, rating: state.rating, savedAt: Date.now(),
    idleRate: idleIncome(3600).perHour / 3600,
    f2: floor2Snapshot(),
    piles: Object.fromEntries(Object.values(LINES).filter((l) => l.active).map((l) => [l.id, { pile: l.pile.count, shelf: l.shelf.count, cash: l.cash.amount }])),
    roomCash: Object.fromEntries(Object.values(ROOMS).filter((r) => r.active).map((r) => [r.id, r.cash.amount])),
  };
}

function saveData() {
  state.branches[state.branch] = branchSnapshot();
  return {
    v: 2, money: state.money, earned: state.earned, daily: state.daily, savedAt: Date.now(), tutorial: state.tutorial,
    current: state.branch, branches: state.branches,
    // Summary fields the cloud uses for the leaderboard
    branch: state.branches.length - 1, step: state.step,
  };
}

// Saves from before branches were kept: the open branch survives, earlier ones restart fresh
function migrateSave(data) {
  if (!data || data.branches) return data;
  const b = data.branch || 0;
  const branches = Array(b + 1).fill(null);
  branches[b] = {
    step: data.step || 0, paid: data.paid || 0, piles: data.piles || {}, upgrades: data.upgrades || {},
    roomCash: data.roomCash || { xray: data.xrayCash || 0 }, rating: data.rating, savedAt: data.savedAt,
  };
  return { v: 2, money: data.money || 0, earned: data.earned || 0, daily: data.daily || null, savedAt: data.savedAt, current: b, branches, branch: b, step: data.step || 0 };
}

// Returns true when the save was written and reads back
function save() {
  if (saveBlocked) return false;
  try {
    const json = JSON.stringify(saveData());
    localStorage.setItem(SAVE_KEY, json);
    storageOK = localStorage.getItem(SAVE_KEY) === json;
  } catch {
    storageOK = false;
  }
  return storageOK;
}

// Save codes let players move progress between browsers and devices
const CODE_PREFIX = 'DRQ1-';
function exportCode() {
  return CODE_PREFIX + btoa(JSON.stringify(saveData()));
}
function parseCode(code) {
  const clean = code.trim().replace(/\s+/g, '');
  if (!clean.startsWith(CODE_PREFIX)) return null;
  try {
    const data = JSON.parse(atob(clean.slice(CODE_PREFIX.length)));
    return typeof data.money === 'number' && (typeof data.step === 'number' || Array.isArray(data.branches)) ? data : null;
  } catch {
    return null;
  }
}

function load() {
  let data = null;
  try {
    data = JSON.parse(localStorage.getItem(SAVE_KEY));
  } catch {
    data = null;
  }
  // Ask the browser not to evict our save under storage pressure
  navigator.storage?.persist?.().catch(() => {});
  buildLine(LINES.pill, false);
  data = migrateSave(data);
  if (!data) return;
  state.money = data.money || 0;
  state.daily = data.daily || null;
  state.earned = data.earned || 0;
  // Players from before the tutorial existed (or anyone who has earned money) skip it
  state.tutorial = data.tutorial ?? (state.earned > 0 || state.branches.some((b) => b?.step) ? TUTORIAL.length : 0);
  state.branches = Array.isArray(data.branches) && data.branches.length ? data.branches : [null];
  state.branch = Math.min(Math.max(data.current || 0, 0), state.branches.length - 1);
  const br = state.branches[state.branch] || {};
  state.step = Math.min(br.step || 0, UNLOCKS.length);
  state.paid = br.paid || 0;
  state.upgrades = br.upgrades || {};
  state.rating = typeof br.rating === 'number' ? br.rating : 3;
  for (let i = 0; i < state.step; i++) {
    state.unlocked.add(UNLOCKS[i].id);
    applyUnlock(UNLOCKS[i].id, false);
  }
  for (const [id, p] of Object.entries(br.piles || {})) {
    const line = LINES[id];
    if (!line?.active) continue;
    for (let i = 0; i < Math.min(p.pile, PILE_MAX); i++) line.pile.place(makeItem(line.product));
    for (let i = 0; i < Math.min(p.shelf, SHELF_MAX); i++) line.shelf.place(makeItem(line.product));
    line.cash.add(p.cash || 0);
  }
  for (const [id, amount] of Object.entries(br.roomCash || {})) if (ROOMS[id]?.active) ROOMS[id].cash.add(amount);
  restoreFloor2(br.f2);
  shownMoney = state.money;
  if (data.savedAt) awayOnLoad = (Date.now() - data.savedAt) / 1000;
  localSavedAt = data.savedAt || 0;
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
  camera.lookAt(player.group.position.x, player.group.position.y + 0.5, player.group.position.z - 0.5);
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
    updateSpills(dt);
    tickOtherBranches(dt);
    updateFloor2(dt);
    staff.forEach((s) => s.update(dt));
    updateAmbulance(dt);
    updateTile(dt);
    updateGuide();
    saveTimer += dt;
    if (saveTimer > 5) {
      saveTimer = 0;
      showSaveStatus(save());
    }
  }
  for (const belt of belts) belt.material.map.offset.x -= dt * 0.9;
  if (trashLid) trashLid.rotation.z *= Math.max(0, 1 - dt * 6);
  // Floor-2 items in flight hide with floor 2
  for (const f of flyers) if (f.mesh.userData.f2) f.mesh.visible = F2.group.visible || f.mesh.parent !== scene;
  updateFlyers(dt);
  updatePops(dt);
  updateConfetti(dt);
  updateFloats(dt);
  updateCamera(dt);
  updateBag();
  updateUpgradeDot();
  updateMissionDot();
  if (running) {
    updateTutorial();
    updateDock();
  }
  tickMoneyDisplay(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---------- start ----------
buildWorld();
buildPartitions();
buildTrash();
decorateDept('pill', false);
load();
spawnCrew();
showNextTile();
updateBag();
updateCamera(0, true);
document.getElementById('loading').style.display = 'none';
requestAnimationFrame(frame);
// Probe storage up front so a browser that can't keep saves is flagged right away
save();

function start() {
  running = true;
  document.getElementById('start').style.display = 'none';
  document.getElementById('hud').style.display = 'flex';
  document.getElementById('dock').style.display = 'flex';
  updateDock(true);
  if (tutorialDone()) {
    goalEl.style.display = 'block';
    document.getElementById('hint').style.display = 'block';
  }
  initAudio();
  audio?.resume();
  if (!storageOK) showSaveStatus(false);
  offerIdleEarnings(awayOnLoad);
  awayOnLoad = 0;
  updateWakeLock();
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
  showSaveStatus(save());
});
document.getElementById('resume').addEventListener('click', () => {
  menu.style.display = 'none';
  running = true;
  last = performance.now();
});
document.getElementById('reset').addEventListener('click', async () => {
  if (!confirm('ลบความคืบหน้าทั้งหมดแล้วเริ่มใหม่?')) return;
  // Overwrite rather than delete, so the newer empty save also replaces the cloud copy
  await replaceSave({ v: 2, money: 0, earned: 0, daily: state.daily, current: 0, branches: [null], branch: 0, step: 0 });
});

// ---------- save status & save codes ----------
const savedEl = document.getElementById('saved');
const saveNote = document.getElementById('savenote');
function showSaveStatus(ok) {
  savedEl.textContent = ok ? '💾 บันทึกแล้ว' : '⚠️ เบราว์เซอร์นี้บันทึกไม่ได้';
  savedEl.classList.toggle('bad', !ok);
  savedEl.classList.add('show');
  clearTimeout(showSaveStatus.t);
  showSaveStatus.t = setTimeout(() => savedEl.classList.remove('show'), ok ? 1200 : 4000);
  refreshSaveNote();
}
function refreshSaveNote() {
  saveNote.textContent = storageOK
    ? 'เกมบันทึกอัตโนมัติทุก 5 วินาทีในเบราว์เซอร์นี้ ถ้าจะย้ายเครื่องหรือกลัวข้อมูลหาย ให้คัดลอกโค้ดเซฟเก็บไว้'
    : '⚠️ เบราว์เซอร์นี้ไม่เก็บข้อมูล (อาจเป็นเบราว์เซอร์ในแอปหรือโหมดส่วนตัว) เปิดเกมใน Safari/Chrome หรือคัดลอกโค้ดเซฟเก็บไว้ก่อนปิด';
  saveNote.classList.toggle('bad', !storageOK);
}

document.getElementById('savenow').addEventListener('click', () => showSaveStatus(save()));

document.getElementById('copycode').addEventListener('click', async () => {
  save();
  const code = exportCode();
  try {
    await navigator.clipboard.writeText(code);
    alert('คัดลอกโค้ดเซฟแล้ว! เก็บไว้ในโน้ตหรือแชท แล้วนำไปใส่ที่ "ใส่โค้ดเซฟ" ได้ทุกเครื่อง');
  } catch {
    // Clipboard blocked (some in-app browsers): show it so it can be copied by hand
    prompt('คัดลอกโค้ดนี้เก็บไว้:', code);
  }
});

document.getElementById('loadcode').addEventListener('click', () => {
  const code = prompt('วางโค้ดเซฟที่นี่ (ขึ้นต้นด้วย DRQ1-)');
  if (!code) return;
  const data = parseCode(code);
  if (!data) {
    alert('โค้ดเซฟไม่ถูกต้อง');
    return;
  }
  if (!confirm(`โหลดเซฟนี้? (เงิน ${data.money.toLocaleString()} · ปลดล็อก ${data.step} ขั้น) ความคืบหน้าปัจจุบันจะถูกแทนที่`)) return;
  replaceSave(data);
});
window.addEventListener('pagehide', () => {
  if (save()) cloudPush(true);
});

// ---------- cloud save (Supabase) ----------
// Each device keeps a random secret; the server stores only its hash and links it to a
// save. A transfer code links another device to the same save.
const CLOUD_URL = 'https://wxwarbeioqqlptyzbykx.supabase.co';
const CLOUD_KEY = 'sb_publishable_9g0q_evWnjxBGElTtsdYdQ_teojMuGk'; // publishable: safe in the browser
const DEVICE_KEY = 'drquest-device-key';
const cloud = { code: null, nickname: null, lastSync: 0, ok: null, busy: false, pendingName: null };

function deviceSecret() {
  try {
    let secret = localStorage.getItem(DEVICE_KEY);
    if (!secret) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      secret = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(DEVICE_KEY, secret);
    }
    return secret;
  } catch {
    return null;
  }
}

async function rpc(name, body, keepalive = false) {
  const res = await fetch(`${CLOUD_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: CLOUD_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`);
  return json;
}

async function cloudPush(keepalive = false) {
  const secret = deviceSecret();
  if (!secret || cloud.busy || saveBlocked) return false;
  cloud.busy = true;
  try {
    const [row] = await rpc('cloud_save', { p_secret: secret, p_data: saveData(), p_nickname: cloud.pendingName }, keepalive);
    cloud.pendingName = null;
    cloud.code = row.transfer_code;
    cloud.nickname = row.nickname;
    cloud.ok = true;
    cloud.lastSync = Date.now();
  } catch {
    cloud.ok = false;
  } finally {
    cloud.busy = false;
    renderCloud();
  }
  return cloud.ok;
}

// On start: take the cloud copy if it's newer than this device's, otherwise upload ours
async function cloudSync() {
  const secret = deviceSecret();
  if (!secret) return;
  try {
    const [row] = await rpc('cloud_load', { p_secret: secret });
    if (row) {
      cloud.code = row.transfer_code;
      cloud.nickname = row.nickname;
      cloud.ok = true;
      if ((row.data?.savedAt || 0) > localSavedAt + 5000) {
        if (!running || confirm('พบเซฟบนคลาวด์ที่ใหม่กว่า โหลดเลยไหม?')) {
          replaceSave(row.data, false);
          return;
        }
      }
    }
    await cloudPush();
  } catch {
    cloud.ok = false;
    renderCloud();
  }
}

// Swap in a whole save and restart the page with it (local first, then the cloud)
async function replaceSave(data, pushToCloud = true) {
  saveBlocked = true;
  const fresh = { ...data, savedAt: Date.now() };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(fresh));
  } catch {
    alert('เบราว์เซอร์นี้บันทึกไม่ได้ ลองเปิดเกมใน Safari หรือ Chrome');
    saveBlocked = false;
    return;
  }
  const secret = deviceSecret();
  if (pushToCloud && secret) {
    await Promise.race([
      rpc('cloud_save', { p_secret: secret, p_data: fresh, p_nickname: null }).catch(() => {}),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
  }
  location.reload();
}

const cloudEl = document.getElementById('cloudstatus');
function renderCloud() {
  if (cloud.ok === null) cloudEl.textContent = '☁️ กำลังเชื่อมต่อคลาวด์…';
  else if (!cloud.ok) cloudEl.innerHTML = '☁️ ยังเชื่อมคลาวด์ไม่ได้ (เล่นต่อได้ จะลองใหม่อัตโนมัติ)';
  else {
    const t = cloud.lastSync ? new Date(cloud.lastSync).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-';
    cloudEl.innerHTML = `☁️ บันทึกบนคลาวด์แล้ว (${t})<br>ชื่อ: <b>${escapeHtml(cloud.nickname || '')}</b><br>รหัสย้ายเครื่อง: <b class="code">${cloud.code || '-'}</b>`;
  }
}
function escapeHtml(t) {
  return t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

document.getElementById('claimcode').addEventListener('click', async () => {
  const code = prompt('ใส่รหัสย้ายเครื่อง 8 ตัวจากเครื่องเดิม');
  if (!code) return;
  try {
    // Look first, link only after the player confirms
    const [info] = await rpc('cloud_peek', { p_code: code });
    if (!info) throw new Error('not found');
    if (!confirm(`พบเซฟของ "${info.nickname}" (ปลดล็อก ${info.step} ขั้น${info.branch ? ` · สาขา ${info.branch + 1}` : ''}) โหลดมาเล่นที่เครื่องนี้ไหม?\nความคืบหน้าในเครื่องนี้จะถูกแทนที่`)) return;
    const [row] = await rpc('cloud_claim', { p_code: code, p_secret: deviceSecret() });
    if (!row) throw new Error('not found');
    replaceSave(row.data, false);
  } catch {
    alert('ไม่พบรหัสนี้ หรือยังเชื่อมต่ออินเทอร์เน็ตไม่ได้');
  }
});

document.getElementById('namebtn').addEventListener('click', async () => {
  const name = prompt('ตั้งชื่อที่จะแสดงบนกระดานอันดับ (ไม่เกิน 20 ตัวอักษร)', cloud.nickname || '');
  if (!name || !name.trim()) return;
  cloud.pendingName = name.trim().slice(0, 20);
  await cloudPush();
});

const board = document.getElementById('board');
document.getElementById('leaderbtn').addEventListener('click', async () => {
  const list = document.getElementById('boardlist');
  list.textContent = 'กำลังโหลด…';
  board.style.display = 'flex';
  try {
    await cloudPush();
    const rows = await rpc('leaderboard', { p_limit: 20 });
    list.innerHTML = '';
    rows.forEach((r) => {
      const row = document.createElement('div');
      row.className = 'boardrow' + (r.nickname === cloud.nickname && r.earned === state.earned ? ' me' : '');
      const medal = ['🥇', '🥈', '🥉'][r.rank - 1] || `${r.rank}.`;
      row.innerHTML = `<span class="rk">${medal}</span><span class="nm">${escapeHtml(r.nickname)}${r.branch ? ` <small>สาขา ${r.branch + 1}</small>` : ''}</span><span class="er">💵${Number(r.earned).toLocaleString()}</span>`;
      list.append(row);
    });
    if (!rows.length) list.textContent = 'ยังไม่มีใครในกระดาน';
  } catch {
    list.textContent = 'โหลดไม่ได้ ตรวจสอบอินเทอร์เน็ต';
  }
});
document.getElementById('boardclose').addEventListener('click', () => {
  board.style.display = 'none';
});

renderCloud();
cloudSync();
setInterval(() => {
  if (running) cloudPush();
}, 30000);
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    save();
    hiddenAt = Date.now();
  } else if (hiddenAt && running) {
    // The page doesn't run in the background, so pay out what staff earned meanwhile
    offerIdleEarnings((Date.now() - hiddenAt) / 1000);
    hiddenAt = 0;
  }
  last = performance.now();
  updateWakeLock();
});

const autoBtn = document.getElementById('autobtn');
const autoBadge = document.getElementById('autobadge');
autoBtn.addEventListener('click', () => setAuto(!auto.on));
upBtn.addEventListener('click', () => {
  renderUpgrades();
  upPanel.style.display = 'flex';
});
document.getElementById('upclose').addEventListener('click', () => {
  upPanel.style.display = 'none';
});
updateRating();
applyBranchLook();
ensureDaily();
setInterval(ensureDaily, 60000);
branchBtn.addEventListener('click', () => {
  renderBranches();
  branchPanel.style.display = 'flex';
});
document.getElementById('bclose').addEventListener('click', () => {
  branchPanel.style.display = 'none';
});
missionBtn.addEventListener('click', () => {
  ensureDaily();
  renderMissions();
  missionPanel.style.display = 'flex';
});
document.getElementById('mclose').addEventListener('click', () => {
  missionPanel.style.display = 'none';
});
setAuto(auto.on);
document.getElementById('awayok').addEventListener('click', () => {
  document.getElementById('away').style.display = 'none';
  if (pendingIdle > 0) {
    addMoney(pendingIdle);
    floatText(player.group.position, `+${pendingIdle.toLocaleString()}`, '#8be08f');
    sfxUnlock();
    pendingIdle = 0;
    save();
  }
});

// Expose a little for automated tests
window.__game = { F2, lift, basket, state, player, LINES, ROOMS, UNLOCKS, input: touchVec, patients, auto, idleIncome, UPGRADES, buyUpgrade, PATIENT_TYPES, SEATS };
