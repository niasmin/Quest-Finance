// Dr. Quest World — 3D hospital tycoon that grows into a world empire.
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
function makeRoom(id, z, { price, time, icon, money, bedX = 2.2, operator = null, dir = 1 }) {
  return { id, bed: v(bedX, z), operator: operator || v(0.4, z), money, price, time, icon, dir, active: false, queue: [], scan: 0, staffHired: false };
}
// East wing: three more rooms behind doors in the hallway's east wall. Their queues run
// west, back toward the doors, and the operator stands on the south side of the bed.
const WING = { x0: 9.3, x1: 17.65, z0: -11, z1: 2.8, corridorX: 11.2, dividerX: 12.6 };
const WING_ROWS = { eye: -8.7, physio: -4.1, lab: 0.5 };
const WING_BOUNDS = [-6.4, -1.8];
const wingRoom = (id, z, opts) => makeRoom(id, z, { ...opts, bedX: 15.2, operator: v(15.2, z + 1.9), money: v(11.6, z + 1.7), dir: -1 });
const ROOMS = {
  xray: makeRoom('xray', 4.6, { price: 25, time: 2.2, icon: '🩻', money: v(-3.4, 4.6) }),
  dental: makeRoom('dental', 8.2, { price: 40, time: 2.6, icon: '🦷', money: v(-3.4, 8.2) }),
  surgery: makeRoom('surgery', 11.4, { price: 90, time: 4.0, icon: '🫀', money: v(-3.4, 11.4) }),
  eye: wingRoom('eye', WING_ROWS.eye, { price: 60, time: 2.4, icon: '👁️' }),
  physio: wingRoom('physio', WING_ROWS.physio, { price: 75, time: 3.0, icon: '🦴' }),
  lab: wingRoom('lab', WING_ROWS.lab, { price: 110, time: 3.2, icon: '🩸' }),
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
  { id: 'elevator', label: 'ลิฟต์ขึ้นชั้น 2', icon: '🛗', price: 4000, at: v(6.4, 6.4) },
  { id: 'kitchen', label: 'โรงอาหารญาติคนไข้', icon: '🍲', price: 4500, at: v(-1.5, -6.5), floor: 1 },
  { id: 'cook', label: 'จ้างแม่ครัว', icon: '👩‍🍳', price: 5200, at: v(-3.0, -2.5), floor: 1 },
  { id: 'server', label: 'จ้างพนักงานเสิร์ฟ', icon: '🧑‍🍳', price: 5800, at: v(0.6, -2.6), floor: 1 },
  { id: 'ward', label: 'หอผู้ป่วยใน', icon: '🛏️', price: 6500, at: v(-2.0, 7.2), floor: 1 },
  { id: 'beds2', label: 'เพิ่มเตียง 2 เตียง', icon: '🛏️', price: 7200, at: v(4.4, 7.2), floor: 1 },
  { id: 'wardnurse', label: 'จ้างพยาบาลประจำหอ', icon: '👩‍⚕️', price: 8000, at: v(-4.2, 6.5), floor: 1 },
  { id: 'beds3', label: 'เพิ่มเตียงอีก 2 เตียง', icon: '🛏️', price: 9000, at: v(1.2, 10.8), floor: 1 },
  // New areas: east wing, the lot across the road and the rooftop
  { id: 'eye', label: 'อาคารใหม่: ห้องตรวจตา', icon: '👁️', price: 10000, at: v(7.4, -4.1) },
  { id: 'optometrist', label: 'จ้างนักทัศนมาตร', icon: '🧑‍⚕️', price: 11000, at: v(15.2, WING_ROWS.eye + 1.9) },
  { id: 'parking', label: 'ลานจอดรถ', icon: '🅿️', price: 12000, at: v(2.0, 21.5) },
  { id: 'physio', label: 'ห้องกายภาพบำบัด', icon: '🦴', price: 13500, at: v(15.2, WING_ROWS.physio) },
  { id: 'therapist', label: 'จ้างนักกายภาพ', icon: '🧑‍⚕️', price: 15000, at: v(15.2, WING_ROWS.physio + 1.9) },
  { id: 'kiosk', label: 'ร้านขายยาหน้า รพ.', icon: '🏪', price: 16500, at: v(-6.0, 20.6) },
  { id: 'pharmacist', label: 'จ้างเภสัชกรประจำร้าน', icon: '🧑‍⚕️', price: 18000, at: v(-3.6, 22.6) },
  { id: 'lab', label: 'ห้องแล็บตรวจเลือด', icon: '🩸', price: 20000, at: v(15.2, WING_ROWS.lab) },
  { id: 'labtech', label: 'จ้างนักเทคนิคการแพทย์', icon: '🧑‍🔬', price: 22000, at: v(15.2, WING_ROWS.lab + 1.9) },
  { id: 'park', label: 'สวนพักฟื้น', icon: '🌳', price: 24000, at: v(13.0, 22.0) },
  { id: 'roof', label: 'ดาดฟ้า + ลานเฮลิคอปเตอร์', icon: '🚁', price: 27000, at: v(6.6, 3.4), floor: 1 },
  { id: 'icu', label: 'ห้องไอซียู', icon: '🫁', price: 30000, at: v(-3.0, 6.0), floor: 2 },
  { id: 'paramedic', label: 'จ้างหน่วยกู้ชีพ', icon: '🧑‍🚒', price: 33000, at: v(6.2, -0.6), floor: 2 },
  { id: 'icunurse', label: 'จ้างพยาบาลไอซียู', icon: '👩‍⚕️', price: 36000, at: v(-5.2, 3.0), floor: 2 },
  { id: 'icubeds', label: 'เพิ่มเตียงไอซียู', icon: '🛏️', price: 40000, at: v(3.0, 8.6), floor: 2 },
  // Floors 3 and 4: bought from the floor below, next to the lift
  { id: 'floor3', label: 'ชั้น 3: ห้องจิตวิทยา', icon: '🧠', price: 45000, at: v(3.6, 3.4), floor: 1 },
  { id: 'psychologist', label: 'จ้างนักจิตวิทยา', icon: '🧑‍⚕️', price: 50000, at: v(-5.6, -6), floor: 3 },
  { id: 'massage', label: 'ห้องนวดแผนไทย', icon: '💆', price: 56000, at: v(-3.5, 1.5), floor: 3 },
  { id: 'masseuse', label: 'จ้างหมอนวด', icon: '🧑‍⚕️', price: 62000, at: v(-5.6, 1.5), floor: 3 },
  { id: 'nutrition', label: 'ห้องโภชนาการ', icon: '🥗', price: 70000, at: v(-3.5, 9), floor: 3 },
  { id: 'nutritionist', label: 'จ้างนักโภชนาการ', icon: '🧑‍⚕️', price: 78000, at: v(-5.6, 9), floor: 3 },
  { id: 'floor4', label: 'ชั้น 4: ห้องฝากครรภ์', icon: '🤰', price: 90000, at: v(6.6, 3.4), floor: 3 },
  { id: 'obgyn', label: 'จ้างสูติแพทย์', icon: '🧑‍⚕️', price: 100000, at: v(-5.6, -6), floor: 4 },
  { id: 'delivery', label: 'ห้องคลอด', icon: '👶', price: 115000, at: v(-3.5, 1.5), floor: 4 },
  { id: 'midwife', label: 'จ้างพยาบาลผดุงครรภ์', icon: '👩‍⚕️', price: 130000, at: v(-5.6, 1.5), floor: 4 },
  { id: 'nursery', label: 'ห้องเด็กแรกเกิด', icon: '🍼', price: 150000, at: v(-3.5, 9), floor: 4 },
  { id: 'nurserynurse', label: 'จ้างพยาบาลเด็กแรกเกิด', icon: '👩‍⚕️', price: 170000, at: v(-5.6, 9), floor: 4 },
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
  { id: 'collector', icon: '💰', name: 'จ้างพนักงานเก็บเงิน', desc: (l) => `คนเดินเก็บเงินให้ +${l} คน`, max: 3, base: 800, growth: 3 },
];
const upLevel = (id) => state.upgrades[id] || 0;
const upCost = (u) => Math.round((u.base * u.growth ** upLevel(u.id)) / 10) * 10;
const speedMult = () => 1 + 0.08 * upLevel('speed');
const staffMult = () => (1 + 0.1 * upLevel('staff')) * empireStaff() * prestigeSpeed();
const machineMult = () => (1 + 0.1 * upLevel('machine')) * empireMachine() * prestigeSpeed() * (researched('machine2') ? 1.15 : 1);
const branchMult = () => 1 + 0.5 * (state.branch || 0);
const priceMult = () => (1 + 0.1 * upLevel('price')) * branchMult() * empirePrice() * prestigeIncome();
// Reputation (0-5 stars) and advertising both bring patients in faster
const arrivalMult = () => (1 + 0.08 * upLevel('ads')) * (0.7 + 0.1 * state.rating) * (1 + 0.02 * comfort()) * (OUT.parking ? 1.15 : 1) * empireArrival() * trafficArrival();

// Patient types: [weight, unlocked from step]
const PATIENT_TYPES = {
  normal: { weight: 70, patience: 60, pay: 1, speed: 3.2 },
  emergency: { weight: 12, from: 2, patience: 28, pay: 3, speed: 4.6, badge: '🚨', shirt: 0xe5484d },
  vip: { weight: 8, from: 4, patience: 45, pay: 5, speed: 3.0, badge: '👑', shirt: 0xffc300 },
  child: { weight: 10, from: 1, patience: 50, pay: 1.5, speed: 3.0, badge: '👶', scale: 0.68 },
  // Special cases are sent in by the event system, never rolled
  special: { weight: 0, patience: 80, pay: 1.2, speed: 3.6, badge: '⭐', shirt: 0x9b5de5 },
  // The branch theme's own patients (jellyfish stings at the beach...): filled in by applyBranchTheme
  local: { weight: 0, from: 1, patience: 55, pay: 2, speed: 3.3, badge: '', shirt: 0xffffff },
};
function rollType() {
  const options = Object.entries(PATIENT_TYPES).filter(([, t]) => t.weight > 0 && (!t.from || state.step >= t.from));
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
const GATE_OUT = v(6.8, 14.5); // just outside it, clear of the south wall

const PILE_MAX = 27; // 3 layers of 3x3 at the machine
const SHELF_MAX = 16;
const ZONE_R = 0.85;
const SAVE_KEY = 'drquest-tycoon:v1';

// ---------- renderer & scene ----------
const view = document.getElementById('view');
// Low-power mode for older phones: no shadows or antialiasing, 1x pixels, less scenery
let LITE = false;
try {
  LITE = localStorage.getItem('drquest-lite') === 'on';
} catch {
  // Storage blocked: full quality
}
const renderer = new THREE.WebGLRenderer({ antialias: !LITE });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, LITE ? 1 : 2));
renderer.shadowMap.enabled = !LITE;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
view.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fdcff);
scene.fog = new THREE.Fog(0x9fdcff, 40, 75);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);

scene.add(new THREE.HemisphereLight(0xffffff, 0x5a9e4a, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 1.9);
sun.position.set(9, 18, 8);
sun.castShadow = !LITE;
// Smaller shadow map on phones keeps the frame rate up
const shadowSize = matchMedia('(pointer: coarse)').matches ? 1024 : 2048;
sun.shadow.mapSize.set(shadowSize, shadowSize);
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 60 });
sun.shadow.bias = -0.0005;
scene.add(sun);

renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
let shadowTick = false;

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
const wingPlugs = [];
const colliders = []; // axis-aligned boxes the player can't walk through: {x0, x1, z0, z1, floor}
function addCollider(cx, cz, w, d, floor = 0) {
  colliders.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, floor });
}

function buildWorld() {
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), mat(0x79c850));
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  grass.material = new THREE.MeshLambertMaterial({ color: 0x79c850 }); // own material: recoloured per branch theme
  scene.add(grass);
  branchLook.grass = grass;

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
  // East wall in pieces, with plugs where the east wing's doors will open
  const doors = Object.values(WING_ROWS).sort((a, b) => a - b);
  let z = FLOOR.z0 - 0.15;
  for (const dz of doors) {
    wall(9.15, (z + dz - 0.8) / 2, 0.3, dz - 0.8 - z);
    wall(9.15, dz, 0.3, 1.6);
    wingPlugs.push({ mesh: scene.children[scene.children.length - 1], collider: colliders[colliders.length - 1] });
    z = dz + 0.8;
  }
  wall(9.15, (z + FLOOR.z1 + 0.15) / 2, 0.3, FLOOR.z1 + 0.15 - z);
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

}

const branchLook = {};
// ---------- branch themes: every branch sits somewhere new ----------
const BRANCH_THEMES = [
  { id: 'city', icon: '🏙️', name: 'ในเมือง', ground: 0x79c850, sky: 0x9fdcff, tree: 'round' },
  { id: 'beach', icon: '🏖️', name: 'ริมทะเล', ground: 0xf2dca0, sky: 0x8fd8ff, tree: 'palm', sea: true,
    local: { badge: '🪼', shirt: 0xffd166, label: 'โดนแมงกะพรุน' } },
  { id: 'snow', icon: '❄️', name: 'บนเขาหิมะ', ground: 0xeef4f8, sky: 0xc9dceb, tree: 'pine', weather: 'snow',
    local: { badge: '🥶', shirt: 0x8ecae6, label: 'หนาวสั่น' } },
  { id: 'jungle', icon: '🌴', name: 'กลางป่า', ground: 0x4f9a3a, sky: 0xa6d9b5, tree: 'jungle', weather: 'rain',
    local: { badge: '🐍', shirt: 0x6a994e, label: 'งูกัด' } },
  { id: 'night', icon: '🌃', name: 'เมืองยามค่ำ', ground: 0x3f6b45, sky: 0x1d2340, tree: 'lamp', night: true,
    local: { badge: '🤕', shirt: 0x6d6875, label: 'อุบัติเหตุกลางคืน' } },
  { id: 'desert', icon: '🏜️', name: 'ทะเลทราย', ground: 0xe8c68a, sky: 0xffe2a8, tree: 'cactus',
    local: { badge: '🥵', shirt: 0xf28482, label: 'ลมแดด' } },
];
const themeOf = (i) => BRANCH_THEMES[(i || 0) % BRANCH_THEMES.length];
// Nothing grows on the hospital, the road, the east wing or the outdoor area
function sceneryBlocked(x, z) {
  return (x > -10.5 && x < 10.5 && z > -15.5 && z < 14.7) || (z > ROAD_Z - 2.4 && z < ROAD_Z + 2.4)
    || (x > 8.8 && x < 19.5 && z > -12.5 && z < 2.5) || (x > -12 && x < 20 && z > 18.5 && z < 28.5)
    || (x > -43.5 && x < -10.5 && z > -25 && z < 15.5) // the city district west of the hospital
    || (x > -16 && x < 52 && z > -68 && z < -26) // the military base
    || (x > 18.5 && x < 49 && z > -28 && z < 15.6) || (x > 20 && x < 49 && z > 18.5 && z < 29.5); // the campus and its town
}
const leafGeo = new THREE.IcosahedronGeometry(1, 0);
const flatMat = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
const TREES = {
  round() {
    const t = new THREE.Group();
    const trunk = box(0.35, 1.2, 0.35, 0x8a5a30);
    trunk.position.y = 0.6;
    t.add(trunk);
    for (let k = 0; k < 3; k++) {
      const leaf = new THREE.Mesh(leafGeo, flatMat(pick([0x5bbd3a, 0x4caf50, 0x7ad04e])));
      leaf.position.set(rand(-0.4, 0.4), 1.6 + k * 0.45, rand(-0.4, 0.4));
      leaf.scale.setScalar(rand(0.7, 1.05) - k * 0.15);
      leaf.castShadow = true;
      t.add(leaf);
    }
    return t;
  },
  palm() {
    const t = new THREE.Group();
    const lean = rand(-0.25, 0.25);
    for (let i = 0; i < 6; i++) {
      const seg = box(0.26 - i * 0.015, 0.5, 0.26 - i * 0.015, i % 2 ? 0xa0703c : 0x8a5a30);
      seg.position.set(lean * i * 0.5, 0.25 + i * 0.48, 0);
      t.add(seg);
    }
    const top = new THREE.Vector3(lean * 3, 3.0, 0);
    for (let k = 0; k < 6; k++) {
      const leaf = box(1.5, 0.06, 0.38, 0x3fa34d);
      const a = (k / 6) * Math.PI * 2;
      leaf.position.set(top.x + Math.cos(a) * 0.65, top.y - 0.1, Math.sin(a) * 0.65);
      leaf.rotation.y = -a;
      leaf.rotation.z = -0.35;
      t.add(leaf);
    }
    const nut = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), mat(0x6b4226));
    nut.position.set(top.x + 0.12, top.y - 0.25, 0.1);
    t.add(nut);
    return t;
  },
  pine() {
    const t = new THREE.Group();
    const trunk = box(0.3, 0.8, 0.3, 0x6b4226);
    trunk.position.y = 0.4;
    t.add(trunk);
    for (let k = 0; k < 3; k++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.1 - k * 0.28, 1.3, 7), flatMat(0x2d6a4f));
      cone.position.y = 1.3 + k * 0.75;
      cone.castShadow = true;
      const snow = new THREE.Mesh(new THREE.ConeGeometry(0.55 - k * 0.12, 0.5, 7), flatMat(0xffffff));
      snow.position.y = 1.75 + k * 0.75;
      t.add(cone, snow);
    }
    return t;
  },
  jungle() {
    const t = TREES.round();
    t.children.slice(1).forEach((leaf) => leaf.material = flatMat(pick([0x2d6a4f, 0x40916c, 0x1b4332])));
    for (let k = 0; k < 3; k++) {
      const fern = box(1.2, 0.05, 0.3, 0x52b788);
      fern.position.set(rand(-0.3, 0.3), 0.3, rand(-0.3, 0.3));
      fern.rotation.y = rand(0, Math.PI);
      fern.rotation.z = 0.4;
      t.add(fern);
    }
    t.scale.setScalar(1.3);
    return t;
  },
  lamp() {
    if (Math.random() < 0.6) {
      const t = TREES.round();
      t.children.slice(1).forEach((leaf) => leaf.material = flatMat(0x2f5d3a));
      return t;
    }
    const t = new THREE.Group();
    const post = box(0.12, 3, 0.12, 0x444c5c);
    post.position.y = 1.5;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe08a }));
    bulb.position.y = 3.1;
    const glow = new THREE.Mesh(new THREE.CircleGeometry(1.4, 16), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.18 }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.03;
    t.add(post, bulb, glow);
    return t;
  },
  cactus() {
    const t = new THREE.Group();
    if (Math.random() < 0.35) {
      const rock = new THREE.Mesh(leafGeo, flatMat(0xb08968));
      rock.scale.set(rand(0.5, 1), rand(0.3, 0.6), rand(0.5, 1));
      rock.position.y = 0.2;
      t.add(rock);
      return t;
    }
    const green = flatMat(0x5a9e4a);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 2.2, 8), green);
    body.position.y = 1.1;
    body.castShadow = true;
    t.add(body);
    for (const side of [-1, 1]) {
      if (Math.random() < 0.3) continue;
      const out = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.6, 8), green);
      out.rotation.z = Math.PI / 2;
      out.position.set(side * 0.5, 1.0, 0);
      const up = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.8, 8), green);
      up.position.set(side * 0.75, 1.35, 0);
      t.add(out, up);
    }
    return t;
  },
};
const sceneryGroup = new THREE.Group();
scene.add(sceneryGroup);
const hemiLight = scene.children.find((o) => o.isHemisphereLight);
const weather = { points: null, kind: null };
function applyBranchTheme() {
  const th = themeOf(state.branch);
  branchLook.grass.material.color.set(th.ground);
  scene.background.set(th.sky);
  scene.fog.color.set(th.sky);
  hemiLight.intensity = th.night ? 0.75 : 1.4;
  hemiLight.groundColor.set(th.night ? 0x2a3550 : 0x5a9e4a);
  sun.intensity = th.night ? 0.9 : 1.9;
  sun.color.set(th.night ? 0xb8c6ff : 0xffffff);
  sceneryGroup.clear();
  // Same layout every visit: trees come from a seeded random per branch
  let seed = 1234 + (state.branch || 0) * 977;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < (LITE ? 30 : 90); i++) {
    const x = -32 + rnd() * 64;
    const z = -26 + rnd() * 56;
    if (sceneryBlocked(x, z) || (th.sea && x > 50)) continue;
    const t = TREES[th.tree]();
    t.position.set(x, 0, z);
    t.scale.multiplyScalar(0.9 + rnd() * 0.6);
    t.rotation.y = rnd() * 6;
    t.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    sceneryGroup.add(t);
  }
  if (th.sea) {
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(60, 160), new THREE.MeshLambertMaterial({ color: 0x3fa9e0 }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(82, 0.03, 0);
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 160), mat(0xffffff));
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(52.4, 0.04, 0);
    sceneryGroup.add(sea, foam);
    weather.sea = foam;
  }
  // Each place has its own kind of patient
  const local = PATIENT_TYPES.local;
  if (th.local) Object.assign(local, th.local, { weight: 10 });
  else local.weight = 0;
  setWeather(th.weather);
}
function setWeather(kind) {
  if (weather.points) scene.remove(weather.points);
  weather.points = null;
  weather.kind = kind;
  if (!kind) return;
  const n = (kind === 'snow' ? 500 : 700) / (LITE ? 3 : 1);
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = rand(-18, 18);
    pos[i * 3 + 1] = rand(0, 20);
    pos[i * 3 + 2] = rand(-18, 18);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  weather.points = new THREE.Points(geo, new THREE.PointsMaterial(kind === 'snow'
    ? { color: 0xffffff, size: 0.22, transparent: true, opacity: 0.9, depthWrite: false }
    : { color: 0x9fc4ff, size: 0.12, transparent: true, opacity: 0.7, depthWrite: false }));
  weather.points.frustumCulled = false;
  scene.add(weather.points);
}
function updateWeather(dt) {
  if (weather.sea) weather.sea.position.x = 52.4 + Math.sin(performance.now() / 900) * 0.35;
  if (!weather.points) return;
  const p = weather.points.geometry.attributes.position;
  const fall = weather.kind === 'snow' ? 2.2 : 16;
  const c = player.group.position;
  const t = performance.now() / 1000;
  for (let i = 0; i < p.count; i++) {
    let y = p.getY(i) - fall * dt;
    let x = p.getX(i) + (weather.kind === 'snow' ? Math.sin(t + i) * 0.4 * dt : 0);
    if (y < 0) y += 20;
    p.setXYZ(i, x, y, p.getZ(i));
  }
  p.needsUpdate = true;
  weather.points.position.set(c.x, c.y, c.z);
}

const BRANCH_COLORS = ['#e5484d', '#3d8bfd', '#2e9e4f', '#9b5de5', '#f5a623', '#14b8a6'];
// Each new branch gets its own roof and sign colour
function applyBranchLook() {
  applyBranchTheme();
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
  styleRefs.runner = runner;

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

const deptRugs = {};
const styleRefs = {};
const SIGN_COLORS = { pill: '#e5484d', vaccine: '#3d8bfd', xray: '#4b5a70', dental: '#2a9d8f', surgery: '#2e9e4f' };
// Coloured floor and a sign on the far wall once a department is open
function decorateDept(id, animate) {
  const d = DEPTS.find((x) => x.id === id);
  const w = HALL_X - FLOOR.x0;
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.2, d.z1 - d.z0 - 0.3), new THREE.MeshLambertMaterial({ color: themeColor(id) }));
  deptRugs[id] = rug;
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
const inWing = (p) => p.x > WING.x0 - 0.1 && p.x < WING.x1 + 0.3 && p.z > WING.z0 && p.z < WING.z1;
const wingRow = (z) => (z < WING_BOUNDS[0] ? WING_ROWS.eye : z < WING_BOUNDS[1] ? WING_ROWS.physio : WING_ROWS.lab);
function districtRoute(from, to) {
  if (flatDist(from, to) < 2.6) return to;
  const rf = roadOf(from.x);
  const rt = roadOf(to.x);
  if (Math.abs(from.x - rf) > 0.6) return v(rf, from.z);
  if (rf !== rt) return Math.abs(from.z - 14.6) > 0.5 ? v(rf, 14.6) : v(rt, 14.6);
  if (Math.abs(from.z - to.z) > 0.4) return v(rt, to.z);
  return to;
}
function route(from, to) {
  // The military base, north of the campus: in and out by the campus avenue and its main road
  if (inBase(to) || inBase(from)) {
    if (inBase(to) && inBase(from)) return baseRoute(from, to);
    if (inBase(from)) return Math.abs(from.x - 20) > 1.2 ? v(20, from.z) : v(20, -26.5);
    // The gate corridor at the top of the campus avenue counts as the way in
    if (Math.abs(from.x - 20) < 1.2 && from.z < -26.8) return v(20, -30.5);
    return route(from, v(20, -27.5));
  }
  // Inside a campus centre: same room is a straight walk; otherwise out through the exit, or in through the door
  if (inInterior(from) || inInterior(to)) {
    const a = inInterior(from) ? interiorAt(from) : null;
    const b = inInterior(to) ? interiorAt(to) : null;
    if (a && a === b) return to;
    if (a) return a.exit;
    if (b) return route(from, doorOf(b.lot));
  }
  // Campus east of the hospital: in by the main road and up the campus avenue
  if (inCampus(to) || inCampus(from)) {
    if (inCampus(to) && inCampus(from)) return campusRoute(from, to);
    if (inCampus(from)) {
      if (Math.abs(from.x - CAMPUS_X) > 0.7) return campusRoute(from, v(CAMPUS_X, from.z));
      return v(CAMPUS_X, 16.2);
    }
    if (inDistrict(from)) return route(from, v(roadOf(from.x), ROAD_Z - 1.2));
    if (from.z <= FLOOR.z1 && from.x > FLOOR.x0) return route(from, GATE_OUT);
    // Already at the foot of the avenue: walk straight in
    if (Math.abs(from.x - CAMPUS_X) < 0.7) return v(CAMPUS_X, 14.4);
    // Otherwise step out onto the road edge first, then along it to the avenue
    if (from.z < 15.8) return v(from.x, 16.2);
    return v(CAMPUS_X, 16.2);
  }
  if (inDistrict(to)) {
    if (inDistrict(from)) return districtRoute(from, to);
    // Out through the front gate, along the front sidewalk, then up the district road
    if (from.z <= FLOOR.z1 && from.x > FLOOR.x0) return route(from, GATE_OUT);
    const entry = v(roadOf(to.x), 14.6);
    return flatDist(from, entry) > 0.5 ? entry : to;
  }
  if (inDistrict(from) && !inDistrict(to)) {
    const rx = roadOf(from.x);
    // Step clear of the district (its edge is at ROAD_Z - 1.8) so the next leg can take over
    return Math.abs(from.x - rx) > 0.6 ? v(rx, from.z) : v(rx, ROAD_Z - 1.2);
  }
  // Just out of the district on the front sidewalk: walk east along it past the district's corner
  // first, or a straight line to the gate dips back into the district and turns around
  if (from.x < FLOOR.x0 - 1.2 && from.z >= ROAD_Z - 1.8 && !inDistrict(to)) return v(FLOOR.x0 - 0.8, ROAD_Z - 1.2);
  const outside = (p) => p.z > FLOOR.z1;
  // Going in or out: pass through the gate in two steps so nobody walks into the south wall
  if (outside(to) !== outside(from)) {
    // the gate corridor (just inside to just outside the entrance) counts as the passage itself
    const inGate = Math.abs(from.x - GATE.x) < 1.2 && from.z > GATE.z - 0.5 && from.z < GATE_OUT.z + 0.5;
    if (outside(from)) return inGate || flatDist(from, GATE_OUT) <= 0.4 ? GATE : GATE_OUT;
    return inGate ? GATE_OUT : route(from, GATE);
  }
  if (outside(from)) {
    // The kiosk's seller spot sits between the counter and the shelf: go in from the east end
    const inKiosk = (p) => Math.abs(p.x - KIOSK.x) < 1.5 && p.z > 20.9 && p.z < 21.9;
    if (OUT.kiosk && inKiosk(to) !== inKiosk(from) && flatDist(from, v(KIOSK.x + 1.9, 21.4)) > 0.4) return v(KIOSK.x + 1.9, 21.4);
    return to;
  }
  const wf = inWing(from);
  const wt = inWing(to);
  if (wf || wt) {
    if (wt && !wf) {
      const row = wingRow(to.z);
      // Line up with the door in the hallway, then walk straight through it
      if (from.x > HALL_X + 0.5 && Math.abs(from.z - row) < 0.5) return v(WING.corridorX - 1.2, row);
      return route(from, v(8.2, row));
    }
    const rowF = wingRow(from.z);
    if (wf && !wt) {
      // Leave through this room's door: corridor at the door's row, then the hallway
      if (Math.abs(from.z - rowF) > 0.45 || from.x > WING.corridorX) return v(WING.corridorX - 1.2, rowF);
      return v(8.2, rowF);
    }
    // Room to room inside the wing: along the open corridor past the dividers
    if (wingRow(to.z) !== rowF && from.x > WING.dividerX - 0.3) return v(WING.corridorX, from.z);
    if (wingRow(to.z) !== rowF) return v(WING.corridorX, wingRow(to.z));
    return to;
  }
  const bf = bandOf(from.z);
  const bt = bandOf(to.z);
  if (bf === bt) return to;
  if (from.x > HALL_X) return v(Math.max(from.x, HALL_X + 1), to.z); // hallway runs the full length
  const sgn = bt > bf ? 1 : -1;
  const b = BOUNDS[sgn > 0 ? bf : bf - 1];
  // Generous enough that stopping anywhere near the approach point counts as at the door
  const inDoor = Math.abs(from.x - DOOR_X) < 0.6 && Math.abs(from.z - b) < 1.05;
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
  let front = null;
  if (coat) {
    // Shirt showing through an open coat
    front = box(0.16, 0.42, 0.06, shirt);
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
  return { group, body, legs, arms, phase: Math.random() * 6, parts: { torso, front } };
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
  // Only show popups from the floor being viewed
  if (floorOfY(worldPos.y) !== visibleFloor() && worldPos !== player.group.position) return;
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
    m.position.set(pos.x, pos.y + 0.6, pos.z);
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
    line.serveTimer = 0.22 / staffMult() / cardSpeed(line.id);
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
        line.queue.splice(line.queue.indexOf(front), 1);
        front.done();
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

function eyeModel(root, room) {
  const chair = box(0.9, 0.5, 0.9, 0x9b5de5);
  chair.position.y = 0.25;
  const back = box(0.9, 0.9, 0.2, 0x9b5de5);
  back.position.set(0, 0.85, 0.45);
  // Eye chart on a stand to the west, facing the chair
  const stand = box(0.1, 1.6, 0.1, 0xdfe6ee);
  stand.position.set(-1.6, 0.8, 0);
  const chart = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.2), new THREE.MeshBasicMaterial({
    map: canvasTexture(96, 128, (g) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 96, 128);
      g.fillStyle = '#1d2433'; g.textAlign = 'center';
      ['E', 'F P', 'T O Z', 'L P E D'].forEach((t, i) => { g.font = `700 ${34 - i * 7}px sans-serif`; g.fillText(t, 48, 34 + i * 28); });
    }),
    side: THREE.DoubleSide,
  }));
  chart.rotation.y = Math.PI / 2;
  chart.position.set(-1.55, 1.5, 0);
  const lens = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 8, 16), mat(0x1d2433));
  lens.position.set(-0.2, 1.3, 0);
  lens.rotation.y = Math.PI / 2;
  root.add(chair, back, stand, chart, lens);
  room.effect = (on, t) => { lens.rotation.x = on ? t * 3 : 0; };
  return signTexture((g) => { g.font = '72px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('👁️', 64, 68); });
}
function physioModel(root, room) {
  const mat1 = box(1.0, 0.2, 2.2, 0x00b4d8);
  mat1.position.y = 0.1;
  root.add(mat1);
  for (const side of [-1, 1]) {
    const bar = box(0.07, 0.07, 2.0, 0xdfe6ee);
    bar.position.set(side * 0.6, 0.95, 0);
    root.add(bar);
    for (const e of [-0.95, 0.95]) {
      const post = box(0.07, 0.95, 0.07, 0xdfe6ee);
      post.position.set(side * 0.6, 0.48, e);
      root.add(post);
    }
  }
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 10), mat(0xff8fab));
  ball.position.set(-1.1, 0.35, 0.6);
  root.add(ball);
  room.effect = (on, t) => { ball.position.y = 0.35 + (on ? Math.abs(Math.sin(t * 4)) * 0.3 : 0); };
  return signTexture((g) => { g.font = '72px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🦴', 64, 68); });
}
function labModel(root, room) {
  const bench = box(1.0, 0.9, 2.2, 0xf4f4f0);
  bench.position.y = 0.45;
  const top = box(1.05, 0.06, 2.25, 0x4b5a70);
  top.position.y = 0.92;
  const spinner = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.25, 14), mat(0xdfe6ee));
  spinner.position.set(0, 1.08, -0.6);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 6), mat(0xf72585));
  lid.position.set(0, 1.22, -0.6);
  root.add(bench, top, spinner, lid);
  for (let i = 0; i < 4; i++) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8), mat(i % 2 ? 0xe5484d : 0xffd166));
    tube.position.set(-0.2 + i * 0.13, 1.1, 0.5);
    root.add(tube);
  }
  const scope = box(0.18, 0.45, 0.18, 0x1d2433);
  scope.position.set(0.1, 1.17, 0.05);
  root.add(scope);
  room.effect = (on) => { lid.rotation.y += on ? 0.5 : 0; };
  return signTexture((g) => { g.font = '72px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🩸', 64, 68); });
}
const ROOM_MODELS = { xray: xrayModel, dental: dentalModel, surgery: surgeryModel, eye: eyeModel, physio: physioModel, lab: labModel };

// The east wing's shell: floor, low walls, room dividers; opens the doors in the hallway wall
const WING_INFO = { eye: ['ห้องตรวจตา', '#9b5de5', 0xeadcff], physio: ['ห้องกายภาพ', '#0096c7', 0xd4f1f9], lab: ['ห้องแล็บ', '#f72585', 0xffdcec] };
function buildWing(animate) {
  const g = new THREE.Group();
  const w = WING.x1 - WING.x0;
  const d = WING.z1 - WING.z0;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), mat(0xf3ead8));
  floor.position.set((WING.x0 + WING.x1) / 2, 0.06, (WING.z0 + WING.z1) / 2);
  floor.receiveShadow = true;
  g.add(floor);
  for (const [id, row] of Object.entries(WING_ROWS)) {
    const b0 = id === 'eye' ? WING.z0 : id === 'physio' ? WING_BOUNDS[0] : WING_BOUNDS[1];
    const b1 = id === 'eye' ? WING_BOUNDS[0] : id === 'physio' ? WING_BOUNDS[1] : WING.z1;
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(WING.x1 - WING.dividerX - 0.2, b1 - b0 - 0.3), new THREE.MeshLambertMaterial({ color: WING_INFO[id][2] }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set((WING.dividerX + WING.x1) / 2, 0.125, (b0 + b1) / 2);
    g.add(rug);
    void row;
  }
  const wall = (cx, cz, ww, dd, h = 0.6, color = 0xf08a3c) => {
    const m = box(ww, h, dd, color);
    m.position.set(cx, h / 2, cz);
    g.add(m);
    addCollider(cx, cz, ww, dd);
  };
  wall((WING.x0 + WING.x1) / 2, WING.z0 - 0.15, w + 0.3, 0.3);
  wall((WING.x0 + WING.x1) / 2, WING.z1 + 0.15, w + 0.3, 0.3);
  wall(WING.x1 + 0.15, (WING.z0 + WING.z1) / 2, 0.3, d + 0.6);
  for (const b of WING_BOUNDS) wall((WING.dividerX + WING.x1) / 2, b, WING.x1 - WING.dividerX, 0.2, 0.9, 0xf4f4f0);
  scene.add(g);
  // Open the doors
  for (const plug of wingPlugs) {
    scene.remove(plug.mesh);
    colliders.splice(colliders.indexOf(plug.collider), 1);
  }
  for (const row of Object.values(WING_ROWS)) {
    for (const dz of [-0.85, 0.85]) {
      const post = box(0.3, 1.15, 0.26, 0x5fb8a8);
      post.position.set(9.15, 0.58, row + dz);
      g.add(post);
    }
  }
  if (animate) popIn(g);
}
function wingSign(id, animate) {
  const [name, color] = WING_INFO[id];
  const room = ROOMS[id];
  const sign = new THREE.Group();
  const post = box(0.12, 2.1, 0.12, 0xdfe6ee);
  post.position.y = 1.05;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.7), new THREE.MeshBasicMaterial({ map: signTex(`${room.icon} ${name}`, color), side: THREE.DoubleSide }));
  board.position.y = 2.1;
  sign.add(post, board);
  sign.position.set(9.9, 0, room.bed.z - 1.6);
  sign.rotation.y = Math.PI / 2;
  scene.add(sign);
  if (animate) popIn(sign);
}

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
    room.scan += dt * (room.staffHired ? staffMult() : 1) * cardSpeed(room.id);
    if (room.scan >= room.time) {
      room.scan = 0;
      const pay = front.payout(room.price);
      room.cash.add(pay);
      floatText(room.money, `+${pay}${front.tipped ? ' 💖' : ''}`, '#8be08f');
      sfxCoin();
      room.queue.shift();
      front.done();
    }
  }
  room.effect(working, room.scan);
  room.cash.collect(dt);
}

// ---------- patients ----------
const patients = [];

function queueSlot(kind, i) {
  const room = ROOMS[kind];
  if (room) return i === 0 ? room.bed.clone() : v(room.bed.x + room.dir * (1.3 + i * 1.05), room.bed.z);
  const f = LINES[kind].front;
  return v(f.x + i * 1.05, f.z);
}

const needFor = (kind) => (ROOMS[kind] ? 1 : kind === 'pill' ? 1 + Math.floor(Math.random() * 3) : 1 + Math.floor(Math.random() * 2));

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
    this.need = needFor(kind);
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
  // Decorations make waiting comfier
  patienceMax() {
    return this.t.patience * (1 + 0.04 * comfort()) * (researched('patience') ? 1.15 : 1);
  }
  patienceLeft() {
    return Math.max(0, 1 - this.waited / this.patienceMax());
  }
  refreshBubble() {
    const draw = this.bubble.userData.draw;
    if (this.leaving) draw(this.angry ? '😡' : '😊', '');
    else {
      const bar = this.inside || this.seatedBar ? this.patienceLeft() : null;
      const icon = ROOMS[this.kind] ? ROOMS[this.kind].icon : PRODUCTS[this.kind].icon;
      const text = ROOMS[this.kind] ? '' : String(this.need - this.got);
      draw(icon, text, '#1d2433', bar, this.badge || this.t.badge || '');
    }
  }
  // Final bill: patient type bonus, price upgrade and a tip for quick service
  payout(base) {
    this.tipped = this.waited < this.patienceMax() * 0.4;
    const amount = Math.round(base * this.t.pay * priceMult() * eventPayMult() * (this.tipped ? (researched('tips') ? 1.44 : 1.2) : 1) * (1 + cardBonus(this.kind) / 200));
    if (ev.rush) {
      ev.rush.served++;
      ev.rush.earned += amount;
    }
    changeRating(this.tipped ? 0.05 : 0.02);
    missionProgress('serve', 1);
    missionProgress('earn', amount);
    if (this.tipped) missionProgress('tips', 1);
    if (this.type === 'emergency') missionProgress('emergency', 1);
    if (this.type === 'vip') missionProgress('vip', 1);
    if (this.citizen != null) citizenTreated(this);
    if (this.type === 'tourist') {
      cityState().tourists++;
      cityState().touristCash += amount;
    }
    return amount;
  }
  // Served: a special case moves on to the next service on its list, everyone else goes home
  done() {
    if (this.chain && this.stage < this.chain.length - 1) {
      this.via = v(WALK_X, this.rowZ()); // back out to the hallway lane before heading to the next row
      this.stage++;
      this.kind = this.chain[this.stage];
      this.need = needFor(this.kind);
      this.got = 0;
      this.pending = 0;
      this.inside = false;
      this.arrived = false;
      this.waited = 0;
      this.barKey = -1;
      joinQueue(this);
      this.refreshBubble();
      floatText(this.person.group.position, `⭐ ต่อไป ${serviceIcon(this.kind)}`, '#e0b3ff');
      return;
    }
    if (this.chain) specialDone(this);
    this.leave();
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
      target = this.via || (pos.z > FLOOR.z1 - 0.3 ? entry : lane);
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
        if (!this.angry) {
          maybeParkVisitor();
          sellKrathong();
        }
        this.remove();
        return false;
      }
    } else if (this.seat) {
      // Waiting in a chair is comfier: patience drains at 40%
      if (arrived) {
        this.waited += dt * 0.4;
        if (this.waited >= this.patienceMax()) {
          this.seat.taken = null;
          this.seat = null;
          this.standUp();
          this.angry = true;
          if (this.citizen != null) citizenLeftAngry(this);
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
      if (arrived && this.via && target === this.via) this.via = null;
      else if (arrived && target === lane) {
        this.inside = true;
        this.refreshBubble();
      }
    } else {
      this.arrived = arrived;
      // Face the counter (west) while waiting
      if (arrived) faceToward(this.person.group, -(ROOMS[this.kind]?.dir || 1), 0, dt);
      if (!this.beingServed()) {
        this.waited += dt * (ev.boss ? 1.5 : 1);
        if (this.waited >= this.patienceMax()) {
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
    if (this.citizen != null) citizenLeftAngry(this);
    this.leave();
    changeRating(-0.15);
    floatText(this.person.group.position, '😡 รอนานเกินไป!', '#ff8a8a');
  }
}

function changeRating(delta) {
  state.rating = Math.max(researched('rating') ? 3.5 : 0, Math.min(5, state.rating + delta));
  updateRating();
}

let spawnTimer = 1;
const QUEUE_MAX = 5;
const serviceQueue = (kind) => (ROOMS[kind] || LINES[kind]).queue;

function joinQueue(p) {
  const queue = serviceQueue(p.kind);
  // Emergencies jump the queue (behind whoever is already being served)
  if (p.type === 'emergency' || p.type === 'special') queue.splice(Math.min(1, queue.length), 0, p);
  else queue.push(p);
}

function updatePatients(dt) {
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnTimer = ((state.unlocked.has('ambulance') ? 1.7 : 3.2) / arrivalMult() / (ev.rush ? 2.6 : 1)) * rand(0.7, 1.3);
    const services = [
      ...Object.values(LINES).filter((l) => l.active).flatMap((l) => [l.id, l.id]),
      ...Object.values(ROOMS).filter((r) => r.active).map((r) => r.id),
    ];
    const open = services.filter((k) => serviceQueue(k).length < QUEUE_MAX);
    const seat = state.unlocked.has('waiting') ? SEATS.find((st) => !st.taken) : null;
    if (open.length) {
      const sickOne = Math.random() < 0.4 ? citizenPatientDue() : -1;
      const p = new Patient(pick(open), sickOne >= 0 ? 'normal' : rollType());
      if (sickOne >= 0) {
        p.citizen = sickOne;
        p.badge = '🏠';
        p.refreshBubble();
      } else if (p.type === 'tourist') {
        p.badge = pick(FLAGS);
        p.refreshBubble();
      }
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
  // Bubbles draw on top of everything, so hide downstairs ones while the player is upstairs
  const downstairs = visibleFloor() === 0;
  for (const p of patients) p.bubble.visible = downstairs;
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
  eye: { shirt: 0x9b5de5, coat: 0xffffff }, // optometrist
  physio: { shirt: 0x00b4d8, pants: 0x1d3557 }, // physiotherapist in a polo
  lab: { shirt: 0xf72585, coat: 0xffffff }, // medical technologist
};

function hireRoomStaff(room, animate) {
  const person = makePerson(ROOM_STAFF[room.id]);
  person.group.position.copy(room.operator);
  person.group.rotation.y = room.dir < 0 ? Math.PI : Math.PI / 2;
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

// ---------- cash collectors: hired staff who sweep up the money piles for you ----------
const collectors = [];
// Every pile on the ground: counters, rooms, the cash basket and the lot across the road
const groundPiles = () => [...Object.values(LINES), ...Object.values(ROOMS)].filter((x) => x.active).map((x) => x.cash)
  .concat(basket.pile ? [basket.pile] : [], outdoorPiles());
const COLLECTOR_HOME = v(7.6, 11.2);
function syncCollectors(animate = false) {
  while (collectors.length < upLevel('collector')) {
    const person = makePerson({ shirt: 0xffd166, pants: 0x2b2d42, cap: true });
    // A money bag on the back
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), mat(0x8a5a30));
    bag.position.set(0, 1.0, -0.32);
    const knot = box(0.12, 0.12, 0.12, 0xffd166);
    knot.position.set(0, 1.28, -0.32);
    person.body.add(bag, knot);
    person.group.position.copy(COLLECTOR_HOME).add(v(collectors.length * 0.8, 0));
    scene.add(person.group);
    collectors.push({ person, pile: null, timer: 0, look: 0 });
    if (animate) popIn(person.group);
  }
}
function updateCollectors(dt) {
  for (const c of collectors) {
    const pos = c.person.group.position;
    // Pick the fullest pile nobody else is heading for
    c.look -= dt;
    if (!c.pile || c.pile.amount <= 0 || c.look <= 0) {
      c.look = 2;
      const taken = new Set(collectors.filter((o) => o !== c).map((o) => o.pile));
      c.pile = groundPiles().filter((p) => p.amount >= 10 && !taken.has(p)).sort((a, b) => b.amount - a.amount)[0] || null;
    }
    const target = c.pile ? c.pile.pos : COLLECTOR_HOME;
    const way = route(pos, target);
    const arrived = walkTo(c.person, way, 4.2 * staffMult() * (researched('collector') ? 1.3 : 1), dt);
    animatePerson(c.person, !arrived, dt);
    if (!c.pile || flatDist(pos, c.pile.pos) > 1.2) continue;
    c.timer -= dt;
    if (c.timer > 0) continue;
    c.timer = 0.05;
    const pile = c.pile;
    const chunk = Math.min(pile.amount, Math.max(5, Math.ceil(pile.amount / 10)));
    pile.amount -= chunk;
    const top = pile.stack.count ? pile.stack.worldPos(pile.stack.count - 1) : pile.pos.clone();
    pile.sync();
    const bill = makeItem('cash');
    bill.position.copy(top);
    fly(bill, top, () => pos.clone().setY(1.2), (m) => scene.remove(m), 0.22, 0.6);
    addMoney(chunk);
    if (pile.amount <= 0) c.pile = null;
  }
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
  const parent = floorGroup(u.floor || 0);
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
  fly(bill, from, () => u.at.clone().setY(FLOOR_Y[u.floor || 0] + 0.2), (m) => scene.remove(m), 0.2, 0.6);
  tile.draw();
  if (state.paid >= u.price) {
    state.paid = 0;
    state.step++;
    state.unlocked.add(u.id);
    applyUnlock(u.id, true);
    const at = u.at.clone().setY(FLOOR_Y[u.floor || 0]);
    burst(at);
    floatText(at, `ปลดล็อก! ${u.icon}`, '#ffd166');
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
    case 'eye': buildWing(animate); buildRoom(ROOMS.eye, animate); wingSign('eye', animate); if (animate) tip('wing'); break;
    case 'optometrist': hireRoomStaff(ROOMS.eye, animate); break;
    case 'physio': buildRoom(ROOMS.physio, animate); wingSign('physio', animate); break;
    case 'therapist': hireRoomStaff(ROOMS.physio, animate); break;
    case 'lab': buildRoom(ROOMS.lab, animate); wingSign('lab', animate); break;
    case 'labtech': hireRoomStaff(ROOMS.lab, animate); break;
    case 'parking': buildParking(animate); if (animate) tip('outdoor'); break;
    case 'kiosk': buildKiosk(animate); break;
    case 'pharmacist': hireKioskClerk(animate); break;
    case 'park': buildPark(animate); break;
    case 'roof': buildRoof(animate); if (animate) tip('lift3'); break;
    case 'icu': buildIcu(animate); break;
    case 'paramedic': hireParamedic(animate); break;
    case 'icunurse': hireIcuNurse(animate); break;
    case 'icubeds': addIcuBeds(2, animate); break;
    case 'floor3': buildUpperFloor(3, animate); buildUpperRoom(UPPER_ROOMS.psych, animate); break;
    case 'psychologist': hireUpperStaff(UPPER_ROOMS.psych, animate); break;
    case 'massage': buildUpperRoom(UPPER_ROOMS.massage, animate); break;
    case 'masseuse': hireUpperStaff(UPPER_ROOMS.massage, animate); break;
    case 'nutrition': buildUpperRoom(UPPER_ROOMS.nutrition, animate); break;
    case 'nutritionist': hireUpperStaff(UPPER_ROOMS.nutrition, animate); break;
    case 'floor4': buildUpperFloor(4, animate); buildUpperRoom(UPPER_ROOMS.prenatal, animate); break;
    case 'obgyn': hireUpperStaff(UPPER_ROOMS.prenatal, animate); break;
    case 'delivery': buildUpperRoom(UPPER_ROOMS.delivery, animate); break;
    case 'midwife': hireUpperStaff(UPPER_ROOMS.delivery, animate); break;
    case 'nursery': buildUpperRoom(UPPER_ROOMS.nursery, animate); break;
    case 'nurserynurse': hireUpperStaff(UPPER_ROOMS.nursery, animate); break;
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
const ELEVATOR = v(6.4, 6.4); // mid-hallway, between the X-ray and dental queues, away from the entrance
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
  if (running) tip(f === 1 ? 'floor2' : f === 2 ? 'roof' : '');
  player.floor = f;
  player.group.position.y = FLOOR_Y[f];
  showFloor(f);
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
    showFloor(lift.t > 0.5 ? lift.dest : lift.origin);
    animatePerson(player, false, dt);
    if (lift.t >= 1) {
      lift.riding = false;
      lift.armed = false;
      setFloor(lift.dest);
      tone(1320, 0.25, 'sine', 0.06);
    }
    return true;
  }
  const near = flatDist(pos, ELEVATOR) < 0.7;
  // With the roof built there are three stops: AUTO knows where it's going, a player picks
  const autoDriving = autoBadge.classList.contains('show');
  // Step off before the next ride. AUTO that just arrived and now needs another floor
  // never steps off the pad, so its new destination re-arms the lift.
  const autoWants = autoDriving && auto.task?.at === ELEVATOR && auto.task.ride !== undefined && auto.task.ride !== player.floor;
  if (!near || autoWants) lift.armed = true;
  // Only a player who stops on the pad rides; walking across it does nothing
  const still = Math.hypot(input.x, input.z) < 0.08;
  lift.wait = near && lift.armed && still ? lift.wait + dt : 0;
  const manyStops = liftStops().length > 2;
  showLiftPicker(manyStops && near && lift.armed && !autoDriving);
  if (lift.wait > 0.5 && (!manyStops || autoDriving)) {
    const ride = auto.task?.at === ELEVATOR ? auto.task.ride : undefined;
    startRide(ride ?? (player.floor === 0 ? 1 : 0));
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
    F2.group.add(root); // no collider: beds are low, and rows of them shouldn't wall off the ward
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
    const t = tile;
    tasks.push(tileHere ? { at: t.u.at, keep: () => tile === t && state.money > 0 } : { at: ELEVATOR, ride: t.u.floor || 0, keep: () => player.floor === 1 });
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
  if (roofNeedsPlayer()) tasks.push({ at: ELEVATOR, ride: 2, keep: () => player.floor === 1 });
  const upNeed = upperNeedsPlayer();
  if (upNeed) tasks.push({ at: ELEVATOR, ride: upNeed, keep: () => player.floor === 1 });
  // Nothing to do up here: go down (cash waits in the basket pile)
  tasks.push({ at: ELEVATOR, ride: 0, keep: () => player.floor === 1 });
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
  updateBasket(dt * (researched('basket') ? 2 : 1));
}

// ---------- events: rush hour, giant germ boss, special cases ----------
// All three work with AUTO: the autopilot plays through them like any other job.
const ev = { rush: null, boss: null, special: null, bossTimer: rand(70, 110), specialTimer: rand(40, 70) };
const RUSH_TIME = 75; // seconds
const RUSH_COOLDOWN = 240;
const BOSS_TIME = 45;
const serviceIcon = (kind) => (ROOMS[kind] ? ROOMS[kind].icon : PRODUCTS[kind].icon);
const activeServices = () => [...Object.values(LINES), ...Object.values(ROOMS)].filter((x) => x.active).map((x) => x.id);
const eventPayMult = () => (ev.rush ? 1.5 : 1) * (state.style.outfit === 'crown' ? 1.1 : 1);
const fmtClock = (sec) => `${Math.floor(sec / 60)}:${String(Math.max(0, Math.floor(sec % 60))).padStart(2, '0')}`;

const toastEl = document.getElementById('toast');
// One-time explanations the first time something new shows up; queued so they don't overlap
const TIPS = {
  rush: '💡 <b>ปุ่ม 🚨 เร่งด่วน</b> มาแล้ว (มุมขวาบน)<br>กดเมื่อพร้อม คนไข้แห่มา 75 วินาที รายได้ ×1.5',
  stylebtn: '💡 <b>🎨 ตกแต่ง</b> เปิดแล้ว<br>ซื้อของตกแต่งให้คนไข้รอนานขึ้น และเปลี่ยนชุดหมอได้',
  branchbtn: '💡 <b>🌏 อาณาจักร</b> เปิดแล้ว<br>สร้างเมืองด้วยเงินจาก รพ. ทุกสาขาจะเก่งขึ้น',
  floor2: '💡 <b>ชั้น 2</b> เก็บวัตถุดิบไปใส่หม้อ เอาชามไปวางเคาน์เตอร์<br>เงินชั้นนี้ส่งลงตะกร้าเชือกหน้า รพ.',
  roof: '💡 <b>ดาดฟ้า</b> ยืนวงส้มเพื่อเข็นเปลเข้าไอซียู<br>แล้วยืนวงเขียวที่เคาน์เตอร์เพื่อดูแลจนหาย',
  lift3: '💡 ลิฟต์มี <b>3 ชั้น</b> แล้ว<br>ยืนบนลิฟต์แล้วกดเลือกชั้นที่จะไป',
  wing: '💡 <b>อาคารใหม่</b> เข้าทางประตูที่ผนังทางเดินฝั่งขวา',
  outdoor: '💡 <b>ฝั่งตรงข้ามถนน</b> เดินออกประตูหน้า แล้วข้ามถนนไปเก็บค่าจอดรถ',
  boss: '💡 <b>เชื้อโรคยักษ์!</b> แค่ยืนใกล้ ๆ หมอยิงยาใส่เอง<br>ถ้าเปิด AUTO หมอจะวิ่งไปเอง',
  interior: '💡 <b>ข้างในศูนย์</b> มีผู้ใช้บริการเข้ามาเอง<br>ยืนวงเขียวเพื่อให้บริการ หรือยืนบนป้าย 🧑‍⚕️ เพื่อจ้างเจ้าหน้าที่ · ออกที่วงเหลือง 🚪',
  base: '💡 <b>🎖️ ค่ายทหาร</b> เปิดแล้ว! ขึ้นถนนวิทยาเขตไปทางเหนือสุด<br>ยืนบนป้ายเพื่อสร้าง · ยืนวงเขียวเพื่อฝึกทหาร · วงเหลืองคือกองบัญชาการ',
  campus: '💡 <b>วิทยาเขต Healthcare Empire</b> เปิดแล้ว!<br>เดินออกประตูหน้า ไปทางขวาตามถนนวิทยาเขต แล้วยืนบนป้ายราคาเพื่อซื้อตึก',
  cityhub: '💡 <b>🏙️ เมืองของคุณ</b> (มุมขวาบน)<br>ดูชีวิตชาวเมือง การจราจร นักท่องเที่ยว และคำแนะนำจากที่ปรึกษา',
  special: '💡 <b>เคสพิเศษ</b> (เสื้อม่วง ⭐) ต้องไปหลายห้องตามลำดับ<br>ดูเส้นทางที่มุมขวาบน',
};
const tipQueue = [];
function tip(id) {
  if (!state.tips || state.tips.includes(id) || !TIPS[id]) return;
  state.tips.push(id);
  tipQueue.push(TIPS[id]);
  if (tipQueue.length === 1) setTimeout(nextTip, 1500);
  save();
}
function nextTip() {
  if (!tipQueue.length) return;
  toast(tipQueue[0], 6500);
  setTimeout(() => {
    tipQueue.shift();
    nextTip();
  }, 7000);
}
function toast(html, ms = 3200) {
  toastEl.innerHTML = html;
  toastEl.classList.remove('show');
  void toastEl.offsetWidth; // restart the pop-in animation
  toastEl.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => toastEl.classList.remove('show'), ms);
}

// --- rush hour: press the button, patients pour in for 75 s and pay 1.5x ---
const rushReady = () => state.step >= 3 && !ev.rush && Date.now() >= (state.style.rushAt || 0);
function startRush() {
  if (!rushReady()) return;
  ev.rush = { t: RUSH_TIME + (researched('rush') ? 30 : 0), served: 0, earned: 0, target: Math.round(10 + state.step * 1.6) };
  spawnTimer = 0.2;
  sfxUnlock();
  toast('🚨 <b>ชั่วโมงเร่งด่วน!</b><br>คนไข้แห่มาเพียบ · รายได้ ×1.5');
}
function updateRush(dt) {
  const r = ev.rush;
  if (!r) return;
  r.t -= dt;
  if (r.t > 0) return;
  ev.rush = null;
  state.style.rushAt = Date.now() + RUSH_COOLDOWN * 1000;
  const stars = r.served >= r.target * 1.5 ? 3 : r.served >= r.target ? 2 : r.served >= r.target * 0.5 ? 1 : 0;
  const bonus = stars ? Math.round((r.earned * [0, 0.5, 1, 1.5][stars] + 100 * branchMult()) / 10) * 10 : 0;
  if (bonus) {
    addMoney(bonus);
    missionProgress('rush', 1);
    sfxUnlock();
    burst(player.group.position);
  }
  toast(`🚨 จบชั่วโมงเร่งด่วน ${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}<br>รักษา ${r.served} คน${bonus ? ` · โบนัส <b>+${bonus.toLocaleString()}</b>` : ' · ยังไม่ได้โบนัส ลองใหม่นะ'}`, 5000);
  save();
}

// --- giant germ boss: shows up in a department; stand close and the doctor zaps it ---
const BOSS_SPOTS = { pill: v(0.8, -10.0), vaccine: v(-4.6, 1.3), xray: v(-4.8, 4.4), dental: v(-4.8, 8.1), surgery: v(-4.8, 11.6) };
const BOSS_RANGE = 3.4;
// Where the player (and AUTO) stands to fight: just east of the germ
const bossStand = (b) => v(b.at.x + 1.8, b.at.z);

function germModel(color = 0x7bd34f, spikeColor = 0x4e9a2f) {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color, flatShading: true }));
  ball.castShadow = true;
  g.add(ball);
  const spikeGeo = new THREE.ConeGeometry(0.16, 0.5, 6);
  const pos = new THREE.IcosahedronGeometry(1, 0).attributes.position;
  const seen = new Set();
  for (let i = 0; i < pos.count; i++) {
    const d = new THREE.Vector3().fromBufferAttribute(pos, i).normalize();
    const key = d.toArray().map((n) => n.toFixed(2)).join();
    if (seen.has(key)) continue;
    seen.add(key);
    const spike = new THREE.Mesh(spikeGeo, mat(spikeColor));
    spike.position.copy(d).multiplyScalar(1.05);
    spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    g.add(spike);
  }
  // Angry face toward the camera (+z)
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), mat(0xffffff));
    eye.position.set(side * 0.32, 0.18, 0.86);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat(0x111111));
    pupil.position.set(side * 0.3, 0.16, 1.04);
    const brow = box(0.34, 0.07, 0.06, 0x1d2433, { shadow: false });
    brow.position.set(side * 0.3, 0.42, 0.95);
    brow.rotation.z = side * -0.45;
    g.add(eye, pupil, brow);
  }
  const mouth = box(0.42, 0.08, 0.06, 0x1d2433, { shadow: false });
  mouth.position.set(0, -0.25, 0.97);
  g.add(mouth);
  return g;
}

function bossBar(b) {
  const g = b.barCanvas.getContext('2d');
  g.clearRect(0, 0, 160, 28);
  g.fillStyle = 'rgba(0,0,0,.6)';
  roundRect(g, 0, 0, 160, 28, 14);
  g.fill();
  g.fillStyle = '#e5484d';
  roundRect(g, 4, 4, Math.max(8, 152 * (b.hp / b.max)), 20, 10);
  g.fill();
  b.bar.material.map.needsUpdate = true;
}

function spawnBoss() {
  const ids = activeServices().filter((id) => BOSS_SPOTS[id]);
  if (!ids.length) return;
  const id = pick(ids);
  const at = BOSS_SPOTS[id].clone();
  const hp = Math.round(24 + 1.5 * state.step);
  const mesh = germModel();
  mesh.position.set(at.x, 1.4, at.z);
  scene.add(mesh);
  popIn(mesh);
  const barCanvas = document.createElement('canvas');
  barCanvas.width = 160;
  barCanvas.height = 28;
  const tex = new THREE.CanvasTexture(barCanvas);
  const bar = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  bar.scale.set(1.8, 0.32, 1);
  bar.position.set(at.x, 3.2, at.z);
  bar.renderOrder = 11;
  scene.add(bar);
  ev.boss = { id, at, hp, max: hp, t: BOSS_TIME, mesh, bar, barCanvas, fire: 0, flash: 0 };
  bossBar(ev.boss);
  tone(196, 0.3, 'sawtooth', 0.05);
  const dept = DEPTS.find((d) => d.id === id);
  toast(`🦠 <b>เชื้อโรคยักษ์บุก${dept.name}!</b><br>รีบไปยืนใกล้ ๆ หมอจะยิงยาใส่เอง`, 4000);
  // A growl: three falling saw notes
  [196, 165, 131].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'sawtooth', 0.05), i * 140));
  tip('boss');
}

function removeBoss() {
  const b = ev.boss;
  scene.remove(b.mesh, b.bar);
  ev.boss = null;
  ev.bossTimer = rand(150, 210);
}

const dartGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.34, 6);
function shootDart(b) {
  const dart = new THREE.Mesh(dartGeo, mat(0x8fd3ff));
  dart.rotation.x = Math.PI / 2;
  const from = player.group.position.clone().setY(1.2);
  fly(dart, from, () => b.mesh.position.clone(), (m) => {
    scene.remove(m);
    if (ev.boss !== b) return;
    b.hp -= state.style.outfit === 'hero' ? 2 : 1;
    b.flash = 0.12;
    bossBar(b);
    sfxPop();
    if (b.hp <= 0) defeatBoss(b);
  }, 0.18, 0.5);
}

function defeatBoss(b) {
  const reward = Math.round(((80 + 25 * state.step) * branchMult() * (researched('boss') ? 2 : 1)) / 10) * 10;
  burst(b.mesh.position);
  removeBoss();
  addMoney(reward);
  state.style.bossKills = (state.style.bossKills || 0) + 1;
  missionProgress('boss', 1);
  sfxUnlock();
  floatText(player.group.position, `🦠 +${reward.toLocaleString()}`, '#8be08f');
  // Rare drop: guaranteed the first time, then a 40% chance until the set is complete
  const missing = RARE_ORDER.filter((id) => !ownsStyle(id));
  if (missing.length && (state.style.bossKills === 1 || Math.random() < 0.4)) {
    const id = missing[0];
    grantStyle(id);
    const it = styleItem(id);
    toast(`💎 <b>ได้ของหายาก!</b><br>${it.icon} ${it.name}<br><small>ไปใช้ได้ที่ 🎨 ตกแต่ง</small>`, 5500);
    styleBtn.classList.add('ready');
  } else {
    toast(`🎉 กำจัดเชื้อโรคยักษ์สำเร็จ! <b>+${reward.toLocaleString()}</b>`);
  }
  save();
}

function updateBoss(dt) {
  const b = ev.boss;
  if (!b) {
    if (state.step >= 5 && tutorialDone()) {
      ev.bossTimer -= dt;
      if (ev.bossTimer <= 0) spawnBoss();
    }
    return;
  }
  b.t -= dt;
  const now = performance.now() / 1000;
  b.mesh.position.y = 1.4 + Math.sin(now * 2.2) * 0.18;
  b.mesh.rotation.y = Math.sin(now * 0.9) * 0.5;
  b.flash = Math.max(0, b.flash - dt);
  b.mesh.scale.setScalar(b.flash > 0 ? 0.88 : 1);
  // Only floor-1 things show while upstairs
  b.mesh.visible = b.bar.visible = visibleFloor() === 0;
  if (player.floor === 0 && !lift.riding && flatDist(player.group.position, b.at) < BOSS_RANGE) {
    b.fire -= dt;
    if (b.fire <= 0) {
      b.fire = 0.25;
      shootDart(b);
    }
  }
  if (b.t <= 0) {
    removeBoss();
    changeRating(-0.3);
    tone(150, 0.4, 'sawtooth', 0.05);
    toast('😵 เชื้อโรคหนีไปได้ คนไข้ไม่พอใจ ⭐ ลดลง');
  }
}

// --- special case: one patient who needs several services in a row, against the clock ---
function spawnSpecial() {
  const services = activeServices();
  if (services.length < 2) return false;
  const len = services.length >= 3 && Math.random() < 0.5 ? 3 : 2;
  const chain = [];
  while (chain.length < len) {
    const k = pick(services);
    if (!chain.includes(k)) chain.push(k);
  }
  const p = new Patient(chain[0], 'special');
  p.chain = chain;
  p.stage = 0;
  joinQueue(p);
  patients.push(p);
  const bonus = Math.round(((60 + 20 * state.step) * len * branchMult() * (researched('special') ? 1.5 : 1)) / 10) * 10;
  ev.special = { p, chain, t: 45 + 35 * len, bonus };
  tone(660, 0.15, 'triangle', 0.06);
  tip('special');
  toast(`⭐ <b>เคสพิเศษ!</b> ${chain.map(serviceIcon).join(' → ')}<br>รักษาให้ครบทันเวลา รับทิป 💵${bonus.toLocaleString()}`, 4000);
  return true;
}
function specialDone(p) {
  const s = ev.special;
  if (!s || s.p !== p) return;
  ev.special = null;
  ev.specialTimer = rand(100, 160);
  addMoney(s.bonus);
  missionProgress('special', 1);
  burst(p.person.group.position);
  sfxUnlock();
  floatText(p.person.group.position, `⭐ +${s.bonus.toLocaleString()}`, '#e0b3ff');
  toast(`⭐ เคสพิเศษสำเร็จ! ทิป <b>+${s.bonus.toLocaleString()}</b>`);
}
function updateSpecial(dt) {
  const s = ev.special;
  if (!s) {
    if (state.step >= 3 && tutorialDone()) {
      ev.specialTimer -= dt;
      if (ev.specialTimer <= 0 && !spawnSpecial()) ev.specialTimer = 30;
    }
    return;
  }
  s.t -= dt;
  if (s.t <= 0 || s.p.leaving) {
    // Out of time (or they stormed out): they finish what they're doing and go home, no tip
    s.p.chain = null;
    ev.special = null;
    ev.specialTimer = rand(100, 160);
    toast('⌛ เคสพิเศษไม่ทันเวลา ไม่ได้ทิป');
  }
}

// --- HUD: rush button and event chips, top right ---
const rushBtn = document.getElementById('rushbtn');
const evChips = document.getElementById('evchips');
let evHtml = '';
function updateEventHud() {
  const cooling = Math.max(0, ((state.style.rushAt || 0) - Date.now()) / 1000);
  rushBtn.style.display = running && tutorialDone() && topStep() >= 5 && !ev.rush ? 'flex' : 'none';
  if (rushBtn.style.display === 'flex') tip('rush');
  rushBtn.disabled = cooling > 0;
  const label = cooling > 0 ? `⏳ ${fmtClock(cooling)}` : 'เร่งด่วน';
  if (rushBtn.lastChild.textContent !== label) rushBtn.lastChild.textContent = label;
  rushBtn.classList.toggle('ready', cooling <= 0);
  let html = '';
  if (ev.rush) html += `<div class="chip rush">🚨 ${fmtClock(ev.rush.t)} · ${ev.rush.served}/${ev.rush.target} คน</div>`;
  if (ev.boss) html += `<div class="chip boss">🦠 ${Math.max(0, ev.boss.hp)}/${ev.boss.max} · ${fmtClock(ev.boss.t)}</div>`;
  if (BASE.defense) html += `<div class="chip boss">🛡️ โดรน ${BASE.drones.length + BASE.defense.left} · ฐาน ❤️${BASE.defense.hp}</div>`;
  if (BASE.mission && !BASE.mission.deploy) html += `<div class="chip rush">🚨 ${BASE.mission.icon} ภารกิจรอส่งกำลัง</div>`;
  if (ev.special) {
    const s = ev.special;
    const route = s.chain.map((k, i) => (i < s.p.stage ? '✅' : serviceIcon(k))).join('→');
    html += `<div class="chip special">⭐ ${route} · ${fmtClock(s.t)}</div>`;
  }
  if (html !== evHtml) {
    evHtml = html;
    evChips.innerHTML = html;
  }
}
rushBtn.addEventListener('click', startRush);

function updateEvents(dt) {
  updateRush(dt);
  updateBoss(dt);
  updateSpecial(dt);
}

// ---------- decorations, floor themes and outfits ----------
// Bought with the shared wallet and kept across every branch. Decorations add "comfort":
// patients wait longer and come more often. Rare items only drop from the giant germ.
const DECOR = [
  { id: 'plants', icon: '🪴', name: 'ต้นไม้ในกระถาง', price: 600, comfort: 1 },
  { id: 'paintings', icon: '🖼️', name: 'ภาพวาดติดตึก', price: 1200, comfort: 1 },
  { id: 'flowers', icon: '🌸', name: 'แปลงดอกไม้หน้า รพ.', price: 1800, comfort: 1 },
  { id: 'vending', icon: '🥤', name: 'ตู้กดน้ำ', price: 2500, comfort: 2 },
  { id: 'fishtank', icon: '🐠', name: 'ตู้ปลา', price: 3500, comfort: 2 },
  { id: 'fountain', icon: '⛲', name: 'น้ำพุในล็อบบี้', price: 6000, comfort: 3 },
  { id: 'statue', icon: '🏆', name: 'รูปปั้นเชื้อโรคทองคำ', rare: true, comfort: 3 },
  { id: 'rainbow', icon: '🌈', name: 'พรมทางเดินสายรุ้ง', rare: true, comfort: 3 },
];
const THEMES = [
  { id: 'default', icon: '🎨', name: 'พาสเทล (เดิม)', price: 0, colors: DEPTS.map((d) => d.floor) },
  { id: 'mint', icon: '🌿', name: 'มิ้นต์สดชื่น', price: 1500, colors: [0xd8f3dc, 0xb7e4c7, 0xc7f9cc, 0xd8f3dc, 0xb7e4c7] },
  { id: 'sunset', icon: '🌅', name: 'พระอาทิตย์ตก', price: 1500, colors: [0xffd6a5, 0xffc2c2, 0xfdffb6, 0xffd6ff, 0xffe0b5] },
  { id: 'ocean', icon: '🌊', name: 'ทะเลสีคราม', price: 1500, colors: [0xbde0fe, 0xa2d2ff, 0xcde7ff, 0xb8e1ff, 0xa9def9] },
];
const OUTFITS = [
  { id: 'classic', icon: '🥼', name: 'เสื้อกาวน์คลาสสิก', price: 0, coat: 0xffffff, shirt: 0x3d8bfd, pants: 0x2c3e66 },
  { id: 'green', icon: '💚', name: 'ชุดสครับเขียว', price: 800, coat: 0x3fae7a, shirt: 0x2e8b62, pants: 0x3fae7a, hat: 'scrub', hatColor: 0x2e8b62 },
  { id: 'pink', icon: '💗', name: 'ชุดสครับชมพู', price: 800, coat: 0xf28fb3, shirt: 0xe46a98, pants: 0xf28fb3, hat: 'nurse' },
  { id: 'surgeon', icon: '😷', name: 'ชุดหมอผ่าตัด', price: 1500, coat: 0x4f8fd8, shirt: 0x3a74b8, pants: 0x4f8fd8, hat: 'scrub', hatColor: 0x3a74b8, mask: true },
  { id: 'fancy', icon: '🎩', name: 'หมอสุดเท่', price: 3000, coat: 0x2b2d42, shirt: 0xffffff, pants: 0x2b2d42, hat: 'top' },
  { id: 'hero', icon: '🦸', name: 'ชุดฮีโร่นักล่าเชื้อโรค', rare: true, perk: 'ยิงเชื้อโรคแรง ×2', coat: 0xe5484d, shirt: 0xffd166, pants: 0x1d3a8a, hat: 'band', cape: 0xe5484d },
  { id: 'crown', icon: '👑', name: 'หมอมงกุฎทองคำ', rare: true, perk: 'รายได้ +10%', coat: 0xfff3c4, shirt: 0x9b5de5, pants: 0x6c4ab6, hat: 'crown' },
  { id: 'thai', icon: '🏮', name: 'ชุดไทยลอยกระทง', rare: true, event: true, perk: 'ชุดพิเศษเทศกาล', coat: 0xd4a373, shirt: 0xffd166, pants: 0x8a1c2b, hat: 'crown' },
];
const RARE_ORDER = ['hero', 'statue', 'rainbow', 'crown'];
const defaultStyle = () => ({ decor: [], themes: ['default'], theme: 'default', outfits: ['classic'], outfit: 'classic', rushAt: 0, bossKills: 0 });
const styleItem = (id) => DECOR.find((d) => d.id === id) || OUTFITS.find((o) => o.id === id) || THEMES.find((t) => t.id === id);
const ownsStyle = (id) => state.style.decor.includes(id) || state.style.outfits.includes(id) || state.style.themes.includes(id);
const comfort = () => (state.style?.decor || []).reduce((a, id) => a + (DECOR.find((d) => d.id === id)?.comfort || 0), 0) + (OUT.park ? 4 : 0) + empireComfort();
const themeColor = (deptId) => {
  const theme = THEMES.find((t) => t.id === state.style?.theme) || THEMES[0];
  return theme.colors[DEPTS.findIndex((d) => d.id === deptId)];
};

function grantStyle(id, animate = true) {
  if (ownsStyle(id)) return;
  if (DECOR.some((d) => d.id === id)) {
    state.style.decor.push(id);
    buildDecor(id, animate);
  } else if (OUTFITS.some((o) => o.id === id)) {
    state.style.outfits.push(id);
  } else {
    state.style.themes.push(id);
  }
}

// --- decoration models, placed where nobody walks ---
const decorAnims = [];
function pottedPlant() {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.42, 12), mat(0xc0703c));
  pot.position.y = 0.21;
  pot.castShadow = true;
  g.add(pot);
  const leafGeo = new THREE.IcosahedronGeometry(0.3, 0);
  for (let i = 0; i < 4; i++) {
    const leaf = new THREE.Mesh(leafGeo, new THREE.MeshLambertMaterial({ color: pick([0x4caf50, 0x5bbd3a, 0x3f9e44]), flatShading: true }));
    leaf.position.set(rand(-0.12, 0.12), 0.65 + i * 0.16, rand(-0.12, 0.12));
    leaf.scale.setScalar(1 - i * 0.18);
    leaf.castShadow = true;
    g.add(leaf);
  }
  return g;
}
function paintingTex(i) {
  return canvasTexture(128, 96, (g) => {
    const skies = ['#8ecae6', '#ffd6a5', '#cdb4db', '#bde0fe', '#caffbf'];
    g.fillStyle = skies[i % skies.length];
    g.fillRect(0, 0, 128, 96);
    if (i % 5 === 0) { // hills and a sun
      g.fillStyle = '#ffd166'; g.beginPath(); g.arc(96, 28, 14, 0, 7); g.fill();
      g.fillStyle = '#52b788'; g.beginPath(); g.ellipse(40, 96, 70, 40, 0, 0, 7); g.fill();
      g.fillStyle = '#2d6a4f'; g.beginPath(); g.ellipse(110, 100, 60, 34, 0, 0, 7); g.fill();
    } else if (i % 5 === 1) { // big heart
      g.fillStyle = '#e5484d'; g.font = '64px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('❤️', 64, 52);
    } else if (i % 5 === 2) { // flower
      g.fillStyle = '#2d6a4f'; g.fillRect(61, 48, 6, 44);
      g.fillStyle = '#ff8fab'; for (let a = 0; a < 6; a++) { g.beginPath(); g.arc(64 + Math.cos(a) * 16, 40 + Math.sin(a) * 16, 11, 0, 7); g.fill(); }
      g.fillStyle = '#ffd166'; g.beginPath(); g.arc(64, 40, 9, 0, 7); g.fill();
    } else if (i % 5 === 3) { // waves
      g.strokeStyle = '#3d8bfd'; g.lineWidth = 7;
      for (let y = 30; y < 96; y += 20) { g.beginPath(); for (let x = 0; x <= 128; x += 8) g.lineTo(x, y + Math.sin(x / 10) * 5); g.stroke(); }
    } else { // friendly doctor face
      g.fillStyle = '#ffdbac'; g.beginPath(); g.arc(64, 50, 30, 0, 7); g.fill();
      g.fillStyle = '#1d2433'; g.beginPath(); g.arc(53, 45, 4, 0, 7); g.arc(75, 45, 4, 0, 7); g.fill();
      g.strokeStyle = '#1d2433'; g.lineWidth = 3; g.beginPath(); g.arc(64, 54, 12, 0.2, Math.PI - 0.2); g.stroke();
    }
    g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.strokeRect(3, 3, 122, 90);
  });
}
function rainbowTex() {
  return canvasTexture(64, 256, (g) => {
    const cols = ['#ff595e', '#ff924c', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93'];
    cols.forEach((c, i) => {
      g.fillStyle = c;
      g.fillRect(0, (i * 256) / cols.length, 64, 256 / cols.length + 1);
    });
  });
}

const DECOR_BUILD = {
  plants() {
    const g = new THREE.Group();
    for (const [x, z] of [[-8.45, -10.45], [-8.45, -3.5], [-8.45, 2.85], [-8.45, 10.3], [4.15, 14.15], [9.6, 14.15]]) {
      const p = pottedPlant();
      p.position.set(x, 0.12, z);
      g.add(p);
    }
    return g;
  },
  paintings() {
    const g = new THREE.Group();
    [-6.8, -3.4, 0, 3.4, 6.8].forEach((x, i) => {
      const frame = box(1.42, 1.12, 0.08, 0x8a5a30, { shadow: false });
      frame.position.set(x, 2.4, -11.86);
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(1.26, 0.96), new THREE.MeshBasicMaterial({ map: paintingTex(i) }));
      pic.position.set(x, 2.4, -11.81);
      g.add(frame, pic);
    });
    return g;
  },
  flowers() {
    const g = new THREE.Group();
    const petals = [0xff8fab, 0xffd166, 0xffffff, 0xc77dff, 0xff595e];
    for (const x of [-7.5, -5, -2.5]) {
      const bed = box(2.0, 0.22, 0.6, 0x6b4226);
      bed.position.set(x, 0.11, 14.15);
      g.add(bed);
      for (let i = 0; i < 9; i++) {
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), mat(pick(petals)));
        f.position.set(x - 0.85 + i * 0.21, 0.36, 14.15 + rand(-0.15, 0.15));
        const stem = box(0.03, 0.16, 0.03, 0x3f9e44, { shadow: false });
        stem.position.set(f.position.x, 0.27, f.position.z);
        g.add(stem, f);
      }
    }
    return g;
  },
  vending() {
    const g = new THREE.Group();
    const body = box(0.6, 1.8, 0.9, 0xe5484d);
    body.position.y = 0.9;
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.0), new THREE.MeshBasicMaterial({
      map: canvasTexture(64, 96, (c) => {
        c.fillStyle = '#d6f0ff'; c.fillRect(0, 0, 64, 96);
        const cans = ['#3d8bfd', '#ffd166', '#3fbf5f', '#ff8fab'];
        for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) { c.fillStyle = cans[(r + k) % 4]; c.fillRect(6 + k * 20, 6 + r * 23, 13, 17); }
      }),
    }));
    glass.rotation.y = Math.PI / 2;
    glass.position.set(0.31, 1.15, 0);
    const label = box(0.04, 0.22, 0.7, 0xffffff, { shadow: false });
    label.position.set(0.31, 1.75, 0);
    g.add(body, glass, label);
    g.position.set(-8.5, 0.12, 7.0);
    return g;
  },
  fishtank() {
    const g = new THREE.Group();
    const stand = box(1.6, 0.6, 0.7, 0x5c4033);
    stand.position.y = 0.3;
    const water = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 0.6), new THREE.MeshLambertMaterial({ color: 0x5ec8f2, transparent: true, opacity: 0.6 }));
    water.position.y = 1.0;
    const sand = box(1.48, 0.08, 0.58, 0xf3d9a4, { shadow: false });
    sand.position.y = 0.64;
    const lid = box(1.6, 0.06, 0.7, 0x2b2d42, { shadow: false });
    lid.position.y = 1.43;
    g.add(stand, sand, water, lid);
    for (let i = 0; i < 4; i++) {
      const fish = box(0.18, 0.1, 0.05, pick([0xff924c, 0xffd166, 0xff595e, 0xffffff]), { shadow: false });
      fish.position.set(rand(-0.5, 0.5), rand(0.8, 1.2), rand(-0.15, 0.15));
      g.add(fish);
      const phase = Math.random() * 6;
      decorAnims.push((t) => {
        fish.position.x = Math.sin(t * 0.7 + phase) * 0.55;
        fish.rotation.y = Math.cos(t * 0.7 + phase) > 0 ? 0 : Math.PI;
      });
    }
    g.position.set(-7.6, 0.12, 4.4);
    return g;
  },
  fountain() {
    const g = new THREE.Group();
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.4, 20), mat(0xdfe6ee));
    basin.position.y = 0.2;
    basin.castShadow = true;
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.05, 20), new THREE.MeshLambertMaterial({ color: 0x5ec8f2 }));
    water.position.y = 0.38;
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.9, 10), mat(0xdfe6ee));
    column.position.y = 0.75;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.2, 0.15, 14), mat(0xdfe6ee));
    bowl.position.y = 1.2;
    const spout = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshLambertMaterial({ color: 0x9fe3ff, transparent: true, opacity: 0.85 }));
    g.add(basin, water, column, bowl, spout);
    decorAnims.push((t) => {
      spout.position.y = 1.4 + Math.abs(Math.sin(t * 3)) * 0.25;
      spout.scale.setScalar(0.8 + Math.abs(Math.sin(t * 3)) * 0.4);
    });
    g.position.set(-7.0, 0.12, 11.6);
    return g;
  },
  statue() {
    const g = new THREE.Group();
    const base = box(0.9, 0.6, 0.9, 0xf4f4f0);
    base.position.y = 0.3;
    const germ = germModel(0xffd166, 0xe0a100);
    germ.scale.setScalar(0.42);
    germ.position.y = 1.05;
    g.add(base, germ);
    decorAnims.push((t) => { germ.rotation.y = t * 0.6; });
    g.position.set(-7.4, 0.12, 8.9);
    return g;
  },
  rainbow() {
    const tex = rainbowTex();
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 4);
    styleRefs.runner.material = new THREE.MeshLambertMaterial({ map: tex });
    return null;
  },
};
function buildDecor(id, animate) {
  const obj = DECOR_BUILD[id]?.();
  if (!obj) return;
  scene.add(obj);
  if (animate) {
    popIn(obj);
    burst(obj.position.lengthSq() ? obj.position : player.group.position);
  }
}
function updateDecor() {
  const t = performance.now() / 1000;
  for (const f of decorAnims) f(t);
}
function applyTheme() {
  for (const [id, rug] of Object.entries(deptRugs)) rug.material.color.set(themeColor(id));
}

// --- outfits: recolour the player and swap the hat ---
function makeHat(o) {
  const g = new THREE.Group();
  if (o.hat === 'scrub') {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.29, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.2), mat(o.hatColor));
    cap.position.y = 1.55;
    g.add(cap);
  } else if (o.hat === 'nurse') {
    const c = box(0.36, 0.13, 0.22, 0xffffff);
    c.position.set(0, 1.8, 0.04);
    const cross = box(0.08, 0.08, 0.02, 0xe5484d, { shadow: false });
    cross.position.set(0, 1.8, 0.16);
    g.add(c, cross);
  } else if (o.hat === 'top') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 16), mat(0x111111));
    brim.position.y = 1.74;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.4, 16), mat(0x111111));
    crown.position.y = 1.95;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.07, 16), mat(0xe5484d));
    band.position.y = 1.8;
    g.add(brim, crown, band);
  } else if (o.hat === 'band') {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 16, 1, true), mat(0xe5484d));
    band.position.y = 1.62;
    const eyes = box(0.4, 0.09, 0.04, 0x111111, { shadow: false });
    eyes.position.set(0, 1.52, 0.245);
    g.add(band, eyes);
  } else if (o.hat === 'crown') {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.14, 12, 1, true), new THREE.MeshLambertMaterial({ color: 0xffd166, side: THREE.DoubleSide }));
    ring.position.y = 1.82;
    g.add(ring);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), mat(0xffd166));
      tip.position.set(Math.sin(a) * 0.22, 1.96, Math.cos(a) * 0.22);
      g.add(tip);
    }
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(0xe5484d));
    gem.position.set(0, 1.83, 0.25);
    g.add(gem);
  }
  if (o.mask) {
    const m = box(0.3, 0.15, 0.04, 0xbfe3ff, { shadow: false });
    m.position.set(0, 1.42, 0.245);
    g.add(m);
  }
  if (o.cape) {
    const cape = box(0.56, 0.95, 0.04, o.cape);
    cape.position.set(0, 0.82, -0.27);
    cape.rotation.x = 0.08;
    g.add(cape);
  }
  return g;
}
function applyOutfit() {
  const o = OUTFITS.find((x) => x.id === state.style.outfit) || OUTFITS[0];
  const { torso, front } = player.parts;
  torso.material = mat(o.coat);
  if (front) front.material = mat(o.shirt);
  for (const s of player.arms) s.children[0].material = mat(o.coat);
  for (const h of player.legs) h.children[0].material = mat(o.pants);
  if (player.hat) player.body.remove(player.hat);
  player.hat = makeHat(o);
  player.body.add(player.hat);
}

// --- the 🎨 panel ---
const stylePanel = document.getElementById('style');
const styleList = document.getElementById('stylelist');
const styleBtn = document.getElementById('stylebtn');
let styleTab = 'decor';
function styleRow({ icon, name, sub, label, disabled, onClick, owned }) {
  const row = document.createElement('div');
  row.className = 'uprow' + (owned ? ' owned' : '');
  row.innerHTML = `<div class="upico">${icon}</div><div class="upinfo"><b>${name}</b><br><small>${sub}</small></div>`;
  const btn = document.createElement('button');
  btn.className = 'btn upbuy';
  btn.textContent = label;
  btn.disabled = disabled;
  btn.addEventListener('click', onClick);
  row.append(btn);
  styleList.append(row);
}
function buyStyle(item) {
  if (item.rare || ownsStyle(item.id) || state.money < item.price) return;
  state.money -= item.price;
  updateMoney();
  grantStyle(item.id);
  sfxUnlock();
  save();
}
function renderStyle() {
  for (const t of document.querySelectorAll('#styletabs button')) t.classList.toggle('on', t.dataset.tab === styleTab);
  const c = comfort();
  document.getElementById('comfort').innerHTML = `😊 ความสบาย ${c} · คนไข้รอได้นานขึ้น +${c * 4}% · มาเพิ่ม +${c * 2}%`;
  styleList.innerHTML = '';
  if (styleTab === 'decor') {
    for (const d of DECOR) {
      const owned = ownsStyle(d.id);
      styleRow({
        icon: d.icon, name: d.name, owned,
        sub: `ความสบาย +${d.comfort}${d.rare ? ' · 💎 ของหายาก' : ''}`,
        label: owned ? 'มีแล้ว ✓' : d.rare ? '🦠 ได้จากบอส' : `💵${d.price.toLocaleString()}`,
        disabled: owned || d.rare || state.money < d.price,
        onClick: () => { buyStyle(d); renderStyle(); },
      });
    }
    const h = document.createElement('h4');
    h.textContent = '🎨 สีพื้นห้อง';
    styleList.append(h);
    for (const t of THEMES) {
      const owned = ownsStyle(t.id);
      const using = state.style.theme === t.id;
      styleRow({
        icon: t.icon, name: t.name, owned,
        sub: owned ? 'กดเพื่อเปลี่ยนสีพื้นทุกห้อง' : 'เปลี่ยนสีพื้นทุกห้อง',
        label: using ? 'ใช้อยู่' : owned ? 'ใช้' : `💵${t.price.toLocaleString()}`,
        disabled: using || (!owned && state.money < t.price),
        onClick: () => {
          if (!owned) buyStyle(t);
          if (!ownsStyle(t.id)) return;
          state.style.theme = t.id;
          applyTheme();
          save();
          renderStyle();
        },
      });
    }
  } else {
    for (const o of OUTFITS) {
      const owned = ownsStyle(o.id);
      const using = state.style.outfit === o.id;
      styleRow({
        icon: o.icon, name: o.name, owned,
        sub: o.perk ? `💎 ${o.perk}` : 'ชุดสวย ๆ ไว้อวดเพื่อน',
        label: using ? 'ใส่อยู่' : owned ? 'ใส่' : o.event ? '🏮 อีเวนต์' : o.rare ? '🦠 ได้จากบอส' : `💵${o.price.toLocaleString()}`,
        disabled: using || (!owned && (o.rare || state.money < o.price)),
        onClick: () => {
          if (!owned) buyStyle(o);
          if (!ownsStyle(o.id)) return;
          state.style.outfit = o.id;
          applyOutfit();
          burst(player.group.position);
          save();
          renderStyle();
        },
      });
    }
  }
}
for (const t of document.querySelectorAll('#styletabs button')) {
  t.addEventListener('click', () => {
    styleTab = t.dataset.tab;
    renderStyle();
  });
}
styleBtn.addEventListener('click', () => {
  styleBtn.classList.remove('ready');
  renderStyle();
  stylePanel.style.display = 'flex';
});
document.getElementById('styleclose').addEventListener('click', () => {
  stylePanel.style.display = 'none';
});

// ---------- outdoor area across the road: parking lot, pharmacy kiosk, recovery park ----------
const SIDEWALK_Z = 19.3;
const LOT_SPOTS = [v(0.4, 24.8), v(2.7, 24.8), v(5.0, 24.8), v(7.3, 24.8)];
const KIOSK = v(-6.0, 20.6); // counter
const KIOSK_ZONE = v(-6.0, 21.6); // where the seller stands
const PARK = { x0: 10.5, x1: 19.0, z0: 19.6, z1: 27.0 };
const BENCHES = [v(12.6, 23.0), v(15.4, 23.0), v(17.4, 25.4)];
const DONATE = v(11.4, 20.6);
const OUT = {
  parking: false, kiosk: false, clerk: null, park: false,
  cars: [], walkers: [], visitors: [], kioskQueue: [], carTimer: 3, walkTimer: 1, kioskTimer: 0,
  parkingCash: null, kioskCash: null, parkCash: null,
};
const outdoorPiles = () => [OUT.parkingCash, OUT.kioskCash, OUT.parkCash, KT.cash, BASE.pile, ...campusPiles()].filter(Boolean);
const kioskSlot = (i) => v(KIOSK.x - i * 0.95, 19.75);

function stripeLine(x, z, w, d) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(0xffffff));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.035, z);
  return m;
}
function buildParking(animate) {
  const g = new THREE.Group();
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(10.6, 7.0), mat(0x5b6573));
  lot.rotation.x = -Math.PI / 2;
  lot.position.set(3.85, 0.025, 23.1);
  lot.receiveShadow = true;
  g.add(lot);
  for (let i = 0; i <= LOT_SPOTS.length; i++) g.add(stripeLine(-0.75 + i * 2.3, 24.9, 0.1, 2.6));
  const p = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: signTexture((c) => {
    c.fillStyle = '#3d8bfd'; c.font = '700 88px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('P', 64, 70);
  }) }));
  p.position.set(-1.2, 2.4, 20.2);
  const post = box(0.12, 2.2, 0.12, 0xdfe6ee);
  post.position.set(-1.2, 1.1, 20.15);
  // Ticket booth by the lot entrance
  const booth = box(1.2, 1.6, 1.2, 0xffd166);
  booth.position.set(-0.6, 0.8, 21.6);
  const roof = box(1.5, 0.15, 1.5, 0xe5484d);
  roof.position.set(-0.6, 1.68, 21.6);
  g.add(p, post, booth, roof);
  addCollider(-0.6, 21.6, 1.2, 1.2);
  scene.add(g);
  OUT.parkingCash = new MoneyPile(v(0.9, 20.6));
  OUT.parking = true;
  if (animate) popIn(g);
}
function carModel() {
  const g = new THREE.Group();
  const color = pick([0xe5484d, 0x3d8bfd, 0xffd166, 0x2e9e4f, 0xffffff, 0x9b5de5, 0x2b2d42]);
  const body = box(1.15, 0.5, 2.2, color);
  body.position.y = 0.45;
  const cabin = box(1.0, 0.45, 1.2, 0xbfe3ff);
  cabin.position.set(0, 0.9, -0.1);
  g.add(body, cabin);
  for (const [x, z] of [[-0.58, 0.7], [0.58, 0.7], [-0.58, -0.7], [0.58, -0.7]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 12), mat(0x1d2433));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.22, z);
    g.add(wheel);
  }
  return g;
}
function updateCars(dt) {
  if (!OUT.parking) return;
  OUT.carTimer -= dt;
  const taken = new Set(OUT.cars.map((c) => c.spot));
  const free = LOT_SPOTS.find((s) => !taken.has(s));
  if (OUT.carTimer <= 0 && free) {
    OUT.carTimer = rand(6, 10);
    const mesh = carModel();
    mesh.position.set(-40, 0, 17.8);
    scene.add(mesh);
    OUT.cars.push({ mesh, spot: free, path: [v(free.x, 17.8), free.clone()], stay: rand(14, 28), paid: false });
  }
  for (let i = OUT.cars.length - 1; i >= 0; i--) {
    const c = OUT.cars[i];
    const pos = c.mesh.position;
    if (c.path.length) {
      const t = c.path[0];
      const dx = t.x - pos.x;
      const dz = t.z - pos.z;
      const d = Math.hypot(dx, dz);
      const step = Math.min(d, (pos.z < 18.6 ? 10 : 3.5) * dt);
      if (d > 0.01) {
        pos.x += (dx / d) * step;
        pos.z += (dz / d) * step;
        c.mesh.rotation.y = Math.atan2(c.leaving && pos.z > 18.2 ? -dx : dx, c.leaving && pos.z > 18.2 ? -dz : dz);
      }
      if (d <= 0.05) c.path.shift();
    } else if (!c.leaving) {
      if (!c.paid) {
        c.paid = true;
        // Beep-beep when parking nearby
        if (player.floor === 0 && flatDist(player.group.position, c.mesh.position) < 12) {
          tone(440, 0.09, 'square', 0.03);
          setTimeout(() => tone(554, 0.12, 'square', 0.03), 130);
        }
        const fee = Math.round(10 * priceMult() * eventPayMult());
        OUT.parkingCash.add(fee);
        floatText(OUT.parkingCash.pos, `🅿️ +${fee}`, '#8be08f');
        missionProgress('earn', fee);
      }
      c.stay -= dt;
      if (c.stay <= 0) {
        c.leaving = true;
        c.path = [v(c.spot.x, 17.8), v(45, 17.8)];
      }
    } else {
      scene.remove(c.mesh);
      OUT.cars.splice(i, 1);
    }
  }
}

function buildKiosk(animate) {
  const g = new THREE.Group();
  const counter = box(2.6, 1.0, 0.6, 0xffffff);
  counter.position.set(KIOSK.x, 0.5, KIOSK.z);
  const stripe = box(2.62, 0.18, 0.62, 0x2e9e4f);
  stripe.position.set(KIOSK.x, 0.92, KIOSK.z);
  const shelf = box(2.6, 1.6, 0.4, 0xdfe6ee);
  shelf.position.set(KIOSK.x, 0.8, KIOSK.z + 2.0);
  g.add(counter, stripe, shelf);
  for (let i = 0; i < 12; i++) {
    const b = box(0.3, 0.25, 0.2, pick([0xe5484d, 0x3d8bfd, 0xffd166, 0x3fbf5f]), { shadow: false });
    b.position.set(KIOSK.x - 1.05 + (i % 6) * 0.42, 0.65 + Math.floor(i / 6) * 0.5, KIOSK.z + 1.85);
    g.add(b);
  }
  for (const [dx, dz] of [[-1.25, -0.25], [1.25, -0.25], [-1.25, 2.15], [1.25, 2.15]]) {
    const post = box(0.1, 2.4, 0.1, 0x2e9e4f);
    post.position.set(KIOSK.x + dx, 1.2, KIOSK.z + dz);
    g.add(post);
  }
  const canopy = box(3.0, 0.15, 2.9, 0x3fbf5f);
  canopy.position.set(KIOSK.x, 2.45, KIOSK.z + 0.95);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.6), new THREE.MeshBasicMaterial({ map: signTex('🏪 ร้านขายยา', '#2e9e4f'), side: THREE.DoubleSide }));
  board.position.set(KIOSK.x, 2.85, KIOSK.z - 0.45);
  g.add(canopy, board);
  addCollider(KIOSK.x, KIOSK.z, 2.6, 0.6);
  addCollider(KIOSK.x, KIOSK.z + 2.0, 2.6, 0.4);
  scene.add(g);
  g.add(zoneRing(KIOSK_ZONE, 0x3fbf5f));
  OUT.kioskCash = new MoneyPile(v(KIOSK.x + 2.4, 20.2));
  OUT.kiosk = true;
  if (animate) popIn(g);
}
function hireKioskClerk(animate) {
  const person = makePerson({ shirt: 0x3fbf5f, coat: 0xffffff });
  person.group.position.copy(KIOSK_ZONE);
  person.group.rotation.y = Math.PI;
  scene.add(person.group);
  OUT.clerk = person;
  staff.push({ person, update: (dt) => animatePerson(person, false, dt) });
  if (animate) popIn(person.group);
}
// People strolling along the far sidewalk; with the kiosk open some stop to buy
function updateWalkers(dt) {
  OUT.walkTimer -= dt;
  if (OUT.walkTimer <= 0 && OUT.walkers.length < (LITE ? 4 : 10)) {
    OUT.walkTimer = rand(2.5, 5);
    const dir = Math.random() < 0.5 ? 1 : -1;
    const person = makePerson({ shirt: pick(SHIRTS) });
    person.group.position.set(-34 * dir, 0, SIDEWALK_Z + rand(-0.2, 0.2));
    scene.add(person.group);
    OUT.walkers.push({ person, dir, state: 'walk', decided: false });
  }
  const staffed = OUT.clerk || (player.floor === 0 && flatDist(player.group.position, KIOSK_ZONE) < ZONE_R);
  OUT.kioskTimer -= dt;
  for (let i = OUT.walkers.length - 1; i >= 0; i--) {
    const w = OUT.walkers[i];
    const pos = w.person.group.position;
    let target;
    if (w.state === 'walk') {
      if (OUT.kiosk && !w.decided && Math.abs(pos.x - KIOSK.x) < 7) {
        w.decided = true;
        if (Math.random() < 0.55 && OUT.kioskQueue.length < 4) {
          w.state = 'queue';
          OUT.kioskQueue.push(w);
        }
      }
      target = v(40 * w.dir, pos.z);
    }
    if (w.state === 'queue') target = kioskSlot(OUT.kioskQueue.indexOf(w));
    const arrived = walkTo(w.person, target, 2.4, dt);
    animatePerson(w.person, !arrived, dt);
    if (w.state === 'queue') {
      w.arrived = arrived;
      if (arrived) faceToward(w.person.group, 0, 1, dt);
      if (OUT.kioskQueue[0] === w && arrived && staffed && OUT.kioskTimer <= 0) {
        OUT.kioskTimer = 1.1 / staffMult();
        const pay = Math.round(12 * priceMult() * eventPayMult());
        OUT.kioskCash.add(pay);
        missionProgress('earn', pay);
        floatText(pos, `💊 +${pay}`, '#8be08f');
        sfxCoin();
        OUT.kioskQueue.shift();
        w.state = 'walk';
      }
    }
    if (w.state === 'walk' && Math.abs(pos.x) > 38) {
      scene.remove(w.person.group);
      OUT.walkers.splice(i, 1);
    }
  }
}

function buildPark(animate) {
  const g = new THREE.Group();
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(PARK.x1 - PARK.x0, PARK.z1 - PARK.z0), mat(0x8fd16b));
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set((PARK.x0 + PARK.x1) / 2, 0.02, (PARK.z0 + PARK.z1) / 2);
  lawn.receiveShadow = true;
  const path = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.4, 28), mat(0xe8dcc8));
  path.rotation.x = -Math.PI / 2;
  path.position.set(14.8, 0.03, 23.6);
  const pond = new THREE.Mesh(new THREE.CircleGeometry(1.5, 24), new THREE.MeshLambertMaterial({ color: 0x4cb5f5 }));
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(14.8, 0.04, 23.6);
  g.add(lawn, path, pond);
  addCollider(14.8, 23.6, 2.4, 2.4);
  for (const b of BENCHES) {
    const seat = box(1.4, 0.12, 0.5, 0xa0703c);
    seat.position.set(b.x, 0.45, b.z + 0.35);
    const back = box(1.4, 0.45, 0.1, 0xa0703c);
    back.position.set(b.x, 0.75, b.z + 0.62);
    for (const dx of [-0.6, 0.6]) {
      const leg = box(0.08, 0.45, 0.45, 0x5c4033);
      leg.position.set(b.x + dx, 0.22, b.z + 0.35);
      g.add(leg);
    }
    g.add(seat, back);
  }
  for (const [x, z] of [[11.2, 26.2], [18.3, 20.6], [18.4, 26.4]]) {
    const t = TREES.round();
    t.position.set(x, 0, z);
    g.add(t);
  }
  for (let i = 0; i < 14; i++) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat(pick([0xff8fab, 0xffd166, 0xffffff, 0xc77dff])));
    f.position.set(rand(PARK.x0 + 0.5, PARK.x1 - 0.5), 0.15, PARK.z1 - rand(0.3, 0.8));
    g.add(f);
  }
  const boxM = box(0.6, 0.8, 0.5, 0xe5484d);
  boxM.position.set(DONATE.x - 0.9, 0.4, DONATE.z);
  const heart = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: canvasTexture(64, 64, (c) => {
    c.font = '48px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('💝', 32, 34);
  }), transparent: true }));
  heart.position.set(DONATE.x - 0.9, 0.95, DONATE.z - 0.26);
  heart.rotation.y = Math.PI;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.6), new THREE.MeshBasicMaterial({ map: signTex('🌳 สวนพักฟื้น', '#2e9e4f'), side: THREE.DoubleSide }));
  sign.position.set(14.8, 2.2, 19.8);
  const post = box(0.12, 2.0, 0.12, 0xdfe6ee);
  post.position.set(14.8, 1.0, 19.8);
  g.add(boxM, heart, sign, post);
  scene.add(g);
  OUT.parkCash = new MoneyPile(DONATE.clone());
  OUT.park = true;
  if (animate) popIn(g);
}
// Some happy patients stop by the park on the way home and leave a donation
function maybeParkVisitor() {
  if (!OUT.park || OUT.visitors.length >= 5 || Math.random() > 0.35) return;
  const person = makePerson({ shirt: pick(SHIRTS) });
  person.group.position.copy(SPAWN);
  scene.add(person.group);
  const bench = pick(BENCHES);
  OUT.visitors.push({ person, steps: [v(10.2, 18.9), bench.clone(), DONATE.clone().add(v(0, 0, -0.8)), v(40, 0, SIDEWALK_Z)], sit: rand(8, 14) });
}
function updateVisitors(dt) {
  for (let i = OUT.visitors.length - 1; i >= 0; i--) {
    const vi = OUT.visitors[i];
    const p = vi.person;
    const target = vi.steps[0];
    if (vi.steps.length === 3 && flatDist(p.group.position, target) < 0.05 && vi.sit > 0) {
      vi.sit -= dt;
      p.body.position.y = -0.22;
      p.legs[0].rotation.x = p.legs[1].rotation.x = -1.45;
      faceToward(p.group, 0, -1, dt);
      continue;
    }
    p.body.position.y = 0;
    const arrived = walkTo(p, target, 2.2, dt);
    animatePerson(p, !arrived, dt);
    if (!arrived) continue;
    if (vi.steps.length === 2) {
      const gift = Math.round(6 * priceMult() * eventPayMult());
      OUT.parkCash.add(gift);
      missionProgress('earn', gift);
      floatText(OUT.parkCash.pos, `💝 +${gift}`, '#ffb3c7');
    }
    if (vi.steps.length === 3 && vi.sit > 0) continue;
    vi.steps.shift();
    if (!vi.steps.length) {
      scene.remove(p.group);
      OUT.visitors.splice(i, 1);
    }
  }
}
function updateOutdoor(dt) {
  updateCars(dt);
  updateWalkers(dt);
  updateVisitors(dt);
  for (const pile of outdoorPiles()) pile.collect(dt);
}
function outdoorPerSecond() {
  let rate = 0;
  if (OUT.parking) rate += (10 * priceMult()) / 8;
  if (OUT.kiosk && OUT.clerk) rate += 0.14 * 12 * priceMult();
  if (OUT.park) rate += 0.05 * 6 * priceMult();
  return rate;
}

// ---------- rooftop: helipad and ICU, the third elevator stop ----------
// Floor indexes: 0 ground, 1 floor 2, 2 roof (on top), 3 floor 3, 4 floor 4
const F3Y = 24;
const FLOOR_Y = [0, F2Y, F3Y, 12, 18];
const H_PAD = v(2.5, -6.0);
const H_DROP = v(2.5, -2.4);
const H_ZONE = v(5.0, -2.4); // stand here to wheel the stretcher in
const ICU_ST = v(-6.4, 5.0); // ICU nurses' station
const ICU_SPOTS = [v(-4.5, 8.6), v(-1.5, 8.6), v(1.5, 8.6), v(4.5, 8.6)];
const ICU_TIME = 10;
const ICU_PRICE = 220;
const F3 = { group: new THREE.Group(), built: false, icu: false, beds: [], heli: null, stretcher: null, paramedic: null, nurse: null, heliTimer: 6 };
F3.group.position.y = F3Y;
F3.group.visible = false;
scene.add(F3.group);
const visibleFloor = () => (F3.group.visible ? 2 : UPPER[4].group.visible ? 4 : UPPER[3].group.visible ? 3 : F2.group.visible ? 1 : 0);
const floorOfY = (y) => (y >= F3Y - 1 ? 2 : y >= FLOOR_Y[4] - 1 ? 4 : y >= FLOOR_Y[3] - 1 ? 3 : y >= F2Y - 1 ? 1 : 0);
function showFloor(f) {
  F2.group.visible = f === 1;
  F3.group.visible = f === 2;
  UPPER[3].group.visible = f === 3;
  UPPER[4].group.visible = f === 4;
}

function helicopterModel() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.75, 1.6, 6, 12), mat(0xffffff));
  body.rotation.x = Math.PI / 2;
  body.position.y = 1.1;
  const stripe = new THREE.Mesh(new THREE.CapsuleGeometry(0.77, 0.5, 6, 12), mat(0xe5484d));
  stripe.rotation.x = Math.PI / 2;
  stripe.position.set(0, 1.1, -0.3);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x7fc8f8));
  glass.rotation.x = Math.PI / 2;
  glass.position.set(0, 1.2, 1.0);
  const tail = box(0.22, 0.22, 2.4, 0xffffff);
  tail.position.set(0, 1.35, -2.1);
  const fin = box(0.08, 0.7, 0.5, 0xe5484d);
  fin.position.set(0, 1.65, -3.2);
  const rotor = new THREE.Group();
  for (const r of [0, Math.PI / 2]) {
    const blade = box(4.6, 0.05, 0.22, 0x2b2d42, { shadow: false });
    blade.rotation.y = r;
    rotor.add(blade);
  }
  rotor.position.y = 2.05;
  const mast = box(0.12, 0.3, 0.12, 0x2b2d42);
  mast.position.y = 1.9;
  g.add(body, stripe, glass, tail, fin, rotor, mast);
  for (const side of [-1, 1]) {
    const skid = box(0.08, 0.08, 2.2, 0x2b2d42);
    skid.position.set(side * 0.65, 0.08, 0.1);
    const leg = box(0.06, 0.4, 0.06, 0x2b2d42);
    leg.position.set(side * 0.6, 0.3, 0.1);
    g.add(skid, leg);
  }
  const cross = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ map: signTexture((c) => {
    c.fillStyle = '#e5484d'; c.fillRect(48, 20, 32, 88); c.fillRect(20, 48, 88, 32);
  }) }));
  cross.position.set(0.78, 1.15, -0.3);
  cross.rotation.y = Math.PI / 2;
  g.add(cross);
  g.userData.rotor = rotor;
  return g;
}

function buildRoof(animate) {
  const g = F3.group;
  const tex = canvasTexture(256, 256, (c) => {
    c.fillStyle = '#b9c2cc';
    c.fillRect(0, 0, 256, 256);
    c.strokeStyle = 'rgba(80,90,105,.35)';
    for (let i = 0; i <= 8; i++) {
      c.beginPath(); c.moveTo(i * 32, 0); c.lineTo(i * 32, 256); c.stroke();
      c.beginPath(); c.moveTo(0, i * 32); c.lineTo(256, i * 32); c.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const fw = FLOOR.x1 - FLOOR.x0 + 0.6;
  const fd = FLOOR.z1 - FLOOR.z0 + 0.6;
  tex.repeat.set(fw / 8, fd / 8);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(fw, 0.4, fd), [mat(0xa3adb8), mat(0xa3adb8), new THREE.MeshLambertMaterial({ map: tex }), mat(0x8792a0), mat(0xa3adb8), mat(0xa3adb8)]);
  deck.position.set(0, -0.2, (FLOOR.z0 + FLOOR.z1) / 2);
  deck.receiveShadow = true;
  g.add(deck);
  const rail = (cx, cz, w, d) => {
    const r = box(w, 0.7, d, 0xffd166);
    r.position.set(cx, 0.35, cz);
    g.add(r);
    addCollider(cx, cz, w, d, 2);
  };
  const cz = (FLOOR.z0 + FLOOR.z1) / 2;
  rail(FLOOR.x0 - 0.15, cz, 0.2, fd);
  rail(FLOOR.x1 + 0.15, cz, 0.2, fd);
  rail(0, FLOOR.z0 - 0.15, fw, 0.2);
  rail(0, FLOOR.z1 + 0.15, fw, 0.2);
  g.add(zoneRing(ELEVATOR, 0x7b61ff));
  // Helipad: yellow ring and a big H
  const pad = new THREE.Mesh(new THREE.CircleGeometry(2.6, 32), mat(0x3d4552));
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(H_PAD.x, 0.01, H_PAD.z);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.4, 32), mat(0xffd166));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(H_PAD.x, 0.02, H_PAD.z);
  const h = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.0), new THREE.MeshBasicMaterial({ map: canvasTexture(128, 128, (c) => {
    c.fillStyle = '#ffffff'; c.font = '700 110px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('H', 64, 70);
  }), transparent: true }));
  h.rotation.x = -Math.PI / 2;
  h.position.set(H_PAD.x, 0.03, H_PAD.z);
  g.add(pad, ring, h, zoneRing(H_ZONE, 0xff8a3d));
  // Water tank and AC units for a rooftop feel
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 16), mat(0x8ecae6));
  tank.position.set(-7.0, 0.8, -8.6);
  g.add(tank);
  addCollider(-7.0, -8.6, 1.8, 1.8, 2);
  for (const x of [-4.4, -2.6]) {
    const ac = box(1.2, 0.9, 1.0, 0xdfe6ee);
    ac.position.set(x, 0.45, -9.6);
    g.add(ac);
    addCollider(x, -9.6, 1.2, 1.0, 2);
  }
  F3.heli = { mesh: helicopterModel(), state: 'idle', t: 0, y: 0 };
  F3.heli.mesh.position.set(H_PAD.x, 0, H_PAD.z);
  F3.heli.mesh.rotation.y = Math.PI / 2;
  g.add(F3.heli.mesh);
  addCollider(H_PAD.x, H_PAD.z, 1.6, 2.4, 2);
  // Taller elevator shaft reaching the roof
  for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) {
    const post = box(0.14, F3Y - F2Y, 0.14, 0x7b61ff);
    post.position.set(ELEVATOR.x + dx, F2Y + 2.2 + (F3Y - F2Y) / 2, ELEVATOR.z + dz);
    scene.add(post);
  }
  const top = box(2.0, 0.2, 2.0, 0x5a43d6);
  top.position.set(ELEVATOR.x, F3Y + 2.2, ELEVATOR.z);
  scene.add(top);
  F3.built = true;
  if (animate) popIn(deck);
}

function buildIcu(animate) {
  const g = F3.group;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(13.6, 6.4), mat(0xd4f1f9));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(-1.2, 0.01, 8.5);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.7), new THREE.MeshBasicMaterial({ map: signTex('🫁 ห้องไอซียู', '#0096c7'), side: THREE.DoubleSide }));
  sign.position.set(-1.2, 2.3, 5.4);
  const desk = box(1.4, 0.9, 0.7, 0xf4f4f0);
  desk.position.set(ICU_ST.x - 1.2, 0.45, ICU_ST.z);
  const screen = box(0.6, 0.45, 0.06, 0x1d2433);
  screen.position.set(ICU_ST.x - 1.2, 1.15, ICU_ST.z - 0.2);
  g.add(floor, sign, desk, screen, zoneRing(ICU_ST, 0x3fbf5f));
  addCollider(ICU_ST.x - 1.2, ICU_ST.z, 1.4, 0.7, 2);
  F3.icu = true;
  addIcuBeds(2, animate);
  if (animate) popIn(sign);
}
function addIcuBeds(n, animate) {
  for (let k = 0; k < n && F3.beds.length < ICU_SPOTS.length; k++) {
    const at = ICU_SPOTS[F3.beds.length];
    const root = new THREE.Group();
    const frame = box(1.0, 0.5, 2.0, 0xffffff);
    frame.position.y = 0.25;
    const sheet = box(0.9, 0.08, 1.8, 0x8ecae6);
    sheet.position.y = 0.54;
    const pole = box(0.08, 1.6, 0.08, 0xdfe6ee);
    pole.position.set(0.7, 0.8, -0.8);
    const c = document.createElement('canvas');
    c.width = 96;
    c.height = 64;
    const tex = new THREE.CanvasTexture(c);
    const monitor = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), new THREE.MeshBasicMaterial({ map: tex }));
    monitor.position.set(0.7, 1.5, -0.75);
    root.add(frame, sheet, pole, monitor);
    root.position.set(at.x, 0, at.z);
    F3.group.add(root);
    addCollider(at.x, at.z, 1.0, 2.0, 2);
    F3.beds.push({ at, root, patient: null, care: 0, canvas: c, tex, beat: 0 });
    if (animate) popIn(root);
  }
}
function lyingPatient() {
  const p = makePerson({ shirt: 0xbfe3ff });
  p.group.rotation.x = -Math.PI / 2;
  p.group.position.y = 0.62;
  return p;
}
function hireParamedic(animate) {
  const person = makePerson({ shirt: 0xff8a3d, pants: 0x2b2d42 });
  person.group.position.copy(H_ZONE);
  person.group.rotation.y = -Math.PI / 2;
  F3.group.add(person.group);
  F3.paramedic = person;
  if (animate) popIn(person.group);
}
function hireIcuNurse(animate) {
  const person = makePerson({ shirt: 0x48cae4, pants: 0x48cae4, cap: true });
  person.group.position.copy(ICU_ST);
  person.group.rotation.y = Math.PI / 2;
  F3.group.add(person.group);
  F3.nurse = person;
  if (animate) popIn(person.group);
}
const freeIcuBed = () => F3.beds.find((b) => !b.patient && !b.incoming);
const icuNeedsCare = () => F3.beds.some((b) => b.patient);
const stretcherWaiting = () => F3.stretcher?.state === 'waiting';
// Is there rooftop work only the player can do right now?
const roofNeedsPlayer = () => F3.icu && ((stretcherWaiting() && !F3.paramedic && freeIcuBed()) || (icuNeedsCare() && !F3.nurse));

function roofPay(amount, at) {
  F2.bank += amount; // goes down in the cash basket with floor 2's takings
  missionProgress('earn', amount);
  missionProgress('serve', 1);
  floatText(at.clone().setY(F3Y + 0.6), `+${amount}`, '#8be08f');
  sfxCoin();
}
function drawMonitor(bed, on) {
  const g = bed.canvas.getContext('2d');
  g.fillStyle = '#0b132b';
  g.fillRect(0, 0, 96, 64);
  g.strokeStyle = on ? '#5dff9a' : '#3a506b';
  g.lineWidth = 3;
  g.beginPath();
  for (let x = 0; x <= 96; x += 4) {
    const k = (x + bed.beat * 40) % 48;
    const y = on && k > 20 && k < 28 ? 32 - Math.sin((k - 20) / 8 * Math.PI) * 22 : 32;
    if (x === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  if (bed.patient) {
    g.fillStyle = '#3a506b';
    g.fillRect(6, 54, 84, 6);
    g.fillStyle = '#5dff9a';
    g.fillRect(6, 54, 84 * (bed.care / ICU_TIME), 6);
  }
  bed.tex.needsUpdate = true;
}
function updateHeli(dt) {
  const h = F3.heli;
  if (!h) return;
  const m = h.mesh;
  const flying = h.state !== 'idle';
  m.userData.rotor.rotation.y += dt * (flying ? 22 : 0);
  // Rotor chop while it's flying and you're up here to hear it
  h.chop = (h.chop || 0) - dt;
  if (flying && m.visible && F3.group.visible && h.chop <= 0) {
    h.chop = 0.11;
    tone(70 + Math.random() * 10, 0.07, 'square', 0.025);
  }
  if (!F3.icu) return;
  if (h.state === 'idle') {
    if (!F3.stretcher) F3.heliTimer -= dt * staffMult();
    if (F3.heliTimer <= 0) {
      h.state = 'up';
      h.t = 0;
    }
  } else if (h.state === 'up') {
    h.t += dt;
    m.position.y = Math.min(14, h.t * h.t * 4);
    if (h.t > 2.4) {
      h.state = 'away';
      h.t = 0;
      m.visible = false;
    }
  } else if (h.state === 'away') {
    h.t += dt;
    if (h.t > 3) {
      h.state = 'down';
      h.t = 0;
      m.visible = true;
    }
  } else if (h.state === 'down') {
    h.t += dt;
    m.position.y = Math.max(0, 14 - h.t * 6);
    if (m.position.y <= 0) {
      h.state = 'idle';
      F3.heliTimer = 14;
      // Unload a patient on a stretcher next to the pad
      const g = new THREE.Group();
      const bed = box(0.8, 0.12, 1.9, 0xffffff);
      bed.position.y = 0.5;
      const legs = box(0.7, 0.45, 0.1, 0x9aa8b5);
      legs.position.y = 0.22;
      g.add(bed, legs);
      const p = lyingPatient();
      g.add(p.group);
      g.position.set(H_DROP.x, 0, H_DROP.z);
      F3.group.add(g);
      F3.stretcher = { group: g, state: 'waiting', t: 0 };
      floatText(H_DROP.clone().setY(F3Y), '🚁 เคสฉุกเฉินมาแล้ว!', '#ffb36b');
      tone(523, 0.2, 'triangle', 0.06);
    }
  }
}
function updateIcu(dt) {
  const pos = player.group.position;
  const s = F3.stretcher;
  if (s) {
    const atZone = F3.paramedic || (player.floor === 2 && flatDist(pos, H_ZONE) < ZONE_R);
    if (s.state === 'waiting' && atZone) {
      const bed = freeIcuBed();
      if (bed) {
        s.state = 'rolling';
        s.bed = bed;
        bed.incoming = true;
        s.t = 0;
        sfxPop();
      }
    } else if (s.state === 'rolling') {
      s.t = Math.min(1, s.t + dt / 2.2);
      s.group.position.lerpVectors(H_DROP, s.bed.at, s.t);
      if (s.t >= 1) {
        F3.group.remove(s.group);
        const p = lyingPatient();
        p.group.position.set(s.bed.at.x, 0.62, s.bed.at.z);
        F3.group.add(p.group);
        s.bed.patient = p;
        s.bed.incoming = false;
        s.bed.care = 0;
        F3.stretcher = null;
      }
    }
  }
  const caring = F3.nurse || (player.floor === 2 && flatDist(pos, ICU_ST) < ZONE_R);
  for (const bed of F3.beds) {
    bed.beat += dt;
    if (bed.patient && caring) {
      bed.care += dt * staffMult() * (researched('icu') ? 1.25 : 1);
      if (bed.care >= ICU_TIME) {
        F3.group.remove(bed.patient.group);
        bed.patient = null;
        bed.care = 0;
        roofPay(Math.round(ICU_PRICE * priceMult() * eventPayMult()), bed.at);
        floatText(bed.at.clone().setY(F3Y), '🎉 หายดีแล้ว!', '#ffffff');
      }
    }
    if (F3.group.visible) drawMonitor(bed, Boolean(bed.patient));
  }
}
function updateRoof(dt) {
  if (!F3.built) return;
  updateHeli(dt);
  if (F3.icu) updateIcu(dt);
}
function roofTasks() {
  const tasks = [];
  if (tile && state.money >= tile.u.price - state.paid) {
    const t = tile;
    tasks.push((t.u.floor || 0) === 2 ? { at: t.u.at, keep: () => tile === t && state.money > 0 } : { at: ELEVATOR, ride: t.u.floor || 0, keep: () => player.floor === 2 });
  }
  if (stretcherWaiting() && !F3.paramedic && freeIcuBed()) tasks.push({ at: H_ZONE, keep: () => stretcherWaiting() });
  if (icuNeedsCare() && !F3.nurse) tasks.push({ at: ICU_ST, keep: () => icuNeedsCare() });
  const upNeed = upperNeedsPlayer();
  if (upNeed) tasks.push({ at: ELEVATOR, ride: upNeed, keep: () => player.floor === 2 });
  tasks.push({ at: ELEVATOR, ride: 0, keep: () => player.floor === 2 });
  return tasks;
}
function roofPerSecond() {
  if (!F3.icu || !F3.paramedic || !F3.nurse) return 0;
  return Math.min(1 / 20, (F3.beds.length * staffMult()) / ICU_TIME) * ICU_PRICE * priceMult();
}

// Elevator floor picker: with three stops the player chooses where to go
const liftPick = document.getElementById('liftpick');
const FLOOR_NAMES = ['🏥 ชั้น 1', '🍲 ชั้น 2', '🚁 ดาดฟ้า', '🧠 ชั้น 3', '🤰 ชั้น 4'];
// Lift stops from the top down: only floors that exist
const liftStops = () => [2, 4, 3, 1, 0].filter((f) => f === 0 || (f === 1 ? F2.built : f === 2 ? F3.built : UPPER[f].built));
function showLiftPicker(show) {
  if (!show) {
    if (liftPick.style.display !== 'none') liftPick.style.display = 'none';
    return;
  }
  if (liftPick.style.display === 'flex' && liftPick.dataset.floor === String(player.floor)) return;
  liftPick.dataset.floor = String(player.floor);
  liftPick.innerHTML = '';
  liftStops().forEach((f) => {
    const name = FLOOR_NAMES[f];
    if (f === player.floor) return;
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = name;
    b.addEventListener('click', () => startRide(f));
    liftPick.append(b);
  });
  liftPick.style.display = 'flex';
}
function startRide(dest) {
  if (lift.riding || dest === player.floor) return;
  lift.riding = true;
  lift.t = 0;
  lift.origin = player.floor;
  lift.dest = dest;
  lift.from = FLOOR_Y[player.floor];
  lift.to = FLOOR_Y[dest];
  lift.wait = 0;
  showLiftPicker(false);
  tone(988, 0.2, 'sine', 0.06);
}

// ---------- empire map: city → province → region → country → world ----------
// Money from the hospitals builds up a city; a finished city grows into a province, and so on.
// City buildings boost every branch; places on the bigger maps pay "tax" every second.
const EMPIRE_TIERS = [
  { id: 'city', icon: '🏙️', name: 'เมือง', title: 'หมอประจำเมือง' },
  { id: 'province', icon: '🏞️', name: 'จังหวัด', title: 'หมอประจำจังหวัด', cost: 60000, branches: 1, base: 15000 },
  { id: 'region', icon: '🗾', name: 'ภูมิภาค', title: 'หมอใหญ่ประจำภาค', cost: 600000, branches: 2, base: 150000 },
  { id: 'country', icon: '🗺️', name: 'ประเทศ', title: 'หมอแห่งชาติ', cost: 6000000, branches: 3, base: 1500000 },
  { id: 'world', icon: '🌏', name: 'โลก', title: 'หมอแห่งโลก', cost: 40000000, branches: 4, base: 9000000 },
];
// Places on each bigger map. The first is home: what the previous tier built. x/y are % of the map.
const EMPIRE_NODES = [
  null,
  [
    { icon: '🏙️', name: 'เมืองหมอ', x: 50, y: 50 },
    { icon: '🌿', name: 'เมืองสมุนไพร', x: 20, y: 22 }, { icon: '🌈', name: 'เมืองสายรุ้ง', x: 52, y: 13 },
    { icon: '🛶', name: 'เมืองริมน้ำ', x: 82, y: 25 }, { icon: '⛰️', name: 'เมืองภูเขา', x: 84, y: 66 },
    { icon: '🌸', name: 'เมืองดอกไม้', x: 52, y: 86 }, { icon: '🏖️', name: 'เมืองชายทะเล', x: 16, y: 72 },
  ],
  [
    { icon: '🏞️', name: 'จังหวัดของเรา', x: 50, y: 52 },
    { icon: '😊', name: 'จังหวัดสุขใจ', x: 22, y: 20 }, { icon: '😄', name: 'จังหวัดยิ้มแย้ม', x: 78, y: 18 },
    { icon: '💪', name: 'จังหวัดแข็งแรง', x: 85, y: 62 }, { icon: '☀️', name: 'จังหวัดอบอุ่น', x: 50, y: 88 },
    { icon: '✨', name: 'จังหวัดสดใส', x: 15, y: 68 },
  ],
  [
    { icon: '🏯', name: 'ภาคกลาง', x: 46, y: 50 },
    { icon: '⛰️', name: 'ภาคเหนือ', x: 38, y: 14 }, { icon: '🌾', name: 'ภาคอีสาน', x: 74, y: 30 },
    { icon: '🐘', name: 'ภาคตะวันตก', x: 20, y: 44 }, { icon: '🏖️', name: 'ภาคตะวันออก', x: 72, y: 60 },
    { icon: '🏝️', name: 'ภาคใต้', x: 34, y: 86 },
  ],
  [
    { icon: '🐼', name: 'เอเชีย', x: 72, y: 32 },
    { icon: '🏰', name: 'ยุโรป', x: 50, y: 22 }, { icon: '🦁', name: 'แอฟริกา', x: 52, y: 56 },
    { icon: '🗽', name: 'อเมริกาเหนือ', x: 20, y: 26 }, { icon: '🦜', name: 'อเมริกาใต้', x: 30, y: 68 },
    { icon: '🦘', name: 'โอเชียเนีย', x: 82, y: 72 }, { icon: '🐧', name: 'แอนตาร์กติกา', x: 52, y: 92 },
  ],
];
const CITY_BUILDINGS = [
  { id: 'homes', icon: '🏘️', name: 'หมู่บ้าน', desc: (l) => `คนไข้มา +${4 * l}% ทุกสาขา` },
  { id: 'school', icon: '🏫', name: 'โรงเรียนแพทย์', desc: (l) => `พนักงานไว +${5 * l}% ทุกสาขา` },
  { id: 'factory', icon: '🏭', name: 'โรงงานยา', desc: (l) => `เครื่องผลิตเร็ว +${5 * l}% ทุกสาขา` },
  { id: 'bank', icon: '🏦', name: 'ธนาคาร', desc: (l) => `รายได้ +${4 * l}% ทุกสาขา` },
  { id: 'market', icon: '🏪', name: 'ตลาด', desc: (l) => `ภาษี +${marketRate(l)}/วินาที` },
  { id: 'garden', icon: '🌳', name: 'สวนสาธารณะ', desc: (l) => `ความสบาย +${2 * l}` },
];
const CITY_PLOTS = 8;
const PLACE_MAX = 3;
const defaultEmpire = () => ({ tier: 0, plots: Array(CITY_PLOTS).fill(null), nodes: {}, buys: 0, land: 0 });
const emp = () => state.empire;
const cityLevel = (type) => (emp()?.plots || []).reduce((a, p) => a + (p?.type === type ? p.lvl : 0), 0);
const marketRate = (l) => Math.round([0, 3, 9, 20][l] * (1 + 0.5 * (emp()?.tier || 0)));
// Steep for the first 24 builds, gentler after so a big city stays affordable
const plotCost = () => Math.round((4000 * 1.25 ** Math.min(emp().buys, 24) * 1.08 ** Math.max(0, emp().buys - 24)) / 10) * 10;
const nodeLevels = (t) => {
  const e = emp();
  if (!e.nodes[t]) e.nodes[t] = Array(EMPIRE_NODES[t].length - 1).fill(0);
  return e.nodes[t];
};
const nodeBase = (t, i) => EMPIRE_TIERS[t].base * (1 + 0.2 * i);
const nodeCost = (t, i, lvl) => Math.round((nodeBase(t, i) * 2.5 ** lvl) / 10) * 10;
// Pays back the first level in ~45 minutes; taxes never count toward the leaderboard
const nodeRate = (t, i, lvl) => Math.round((nodeBase(t, i) / 2700) * [0, 1, 3, 7][lvl]);
// Boosts the city gives to every branch
const empireArrival = () => 1 + 0.04 * cityLevel('homes');
const empireStaff = () => 1 + 0.05 * cityLevel('school');
const empireMachine = () => 1 + 0.05 * cityLevel('factory');
const empirePrice = () => (1 + 0.04 * cityLevel('bank')) * (1 + 0.1 * (emp()?.tier || 0)); // each tier reached: +10%
const empireComfort = () => 2 * cityLevel('garden');
function empireRate() {
  const e = emp();
  if (!e) return 0;
  let rate = e.plots.reduce((a, p) => a + (p?.type === 'market' ? marketRate(p.lvl) : 0), 0);
  for (let t = 1; t <= e.tier; t++) nodeLevels(t).forEach((l, i) => { rate += nodeRate(t, i + 1, l); });
  return rate * prestigeTax() * (researched('tax') ? 1.2 : 1);
}
// Is the current tier's map filled in (everything built at least once)?
function tierFilled(t) {
  if (t === 0) return emp().plots.slice(0, CITY_PLOTS).every(Boolean);
  return nodeLevels(t).every((l) => l > 0);
}
function advanceCheck() {
  const e = emp();
  const next = EMPIRE_TIERS[e.tier + 1];
  if (!next) return null;
  const reqs = [
    { ok: tierFilled(e.tier), text: e.tier === 0 ? `สร้างครบ ${CITY_PLOTS} แปลงในเมือง` : `พัฒนาทุกที่บนแผนที่${EMPIRE_TIERS[e.tier].name}อย่างน้อย Lv.1` },
    { ok: state.branches.length >= next.branches, text: `มีโรงพยาบาล ${next.branches} สาขาขึ้นไป (ตอนนี้ ${state.branches.length})` },
    { ok: state.money >= next.cost, text: `เงิน 💵${next.cost.toLocaleString()}` },
  ];
  return { next, reqs, ok: reqs.every((r) => r.ok) };
}
function cheapestEmpireCost() {
  const e = emp();
  const costs = [];
  if (e.plots.some((p) => !p || p.lvl < PLACE_MAX)) costs.push(plotCost());
  if (LAND_COSTS[e.land || 0] !== undefined) costs.push(LAND_COSTS[e.land || 0]);
  for (let t = 1; t <= e.tier; t++) nodeLevels(t).forEach((l, i) => { if (l < PLACE_MAX) costs.push(nodeCost(t, i + 1, l)); });
  const adv = advanceCheck();
  if (adv && adv.reqs[0].ok && adv.reqs[1].ok) costs.push(adv.next.cost);
  return costs.length ? Math.min(...costs) : Infinity;
}

let empireBuffer = 0;
let empireShown = 0;
function tickEmpire(dt) {
  const rate = empireRate();
  if (!rate) return;
  empireBuffer += rate * dt;
  if (empireBuffer >= 1) {
    const whole = Math.floor(empireBuffer);
    empireBuffer -= whole;
    addMoney(whole, false);
    empireShown += whole;
  }
  tickEmpire.t = (tickEmpire.t || 0) + dt;
  if (tickEmpire.t > 20 && empireShown > 0) {
    floatText(player.group.position, `🌏 +${empireShown.toLocaleString()} ภาษีอาณาจักร`, '#ffe08a');
    empireShown = 0;
    tickEmpire.t = 0;
  }
}

function empireSpend(cost) {
  if (state.money < cost) return false;
  state.money -= cost;
  updateMoney();
  sfxUnlock();
  return true;
}
function buildPlot(i, type) {
  const e = emp();
  const p = e.plots[i];
  if ((p && p.lvl >= PLACE_MAX) || !empireSpend(plotCost())) return;
  e.buys++;
  e.plots[i] = p ? { ...p, lvl: p.lvl + 1 } : { type, lvl: 1 };
  syncDistrict(true);
  save();
  renderEmpire();
}
function upgradeNode(t, i) {
  const levels = nodeLevels(t);
  const l = levels[i - 1];
  if (l >= PLACE_MAX || !empireSpend(nodeCost(t, i, l))) return;
  levels[i - 1] = l + 1;
  save();
  renderEmpire();
}
function advanceTier() {
  const adv = advanceCheck();
  if (!adv?.ok || !empireSpend(adv.next.cost)) return;
  const e = emp();
  e.tier++;
  nodeLevels(e.tier);
  empireTab = e.tier;
  empireSel = null;
  burst(player.group.position);
  toast(`${adv.next.icon} <b>ยกระดับเป็น${adv.next.name}แล้ว!</b><br>ตำแหน่งใหม่: ${adv.next.title}<br><small>รายได้ทุกสาขา +10%</small>`, 5000);
  save();
  renderEmpire();
}

// --- the panel: a tab for branches, then one per tier ---
let empireTab = 'branches';
let empireSel = null;
const emTabs = document.getElementById('emtabs');
const emPage = document.getElementById('empage');
function renderEmpire() {
  const e = emp();
  if (empireTab !== 'branches' && empireTab > e.tier) empireTab = e.tier;
  const title = EMPIRE_TIERS[e.tier];
  document.getElementById('emtitle').innerHTML = `${title.icon} อาณาจักรของคุณ<br><small>👑 ${title.title} · ภาษี +${empireRate().toLocaleString()}/วินาที</small>`;
  emTabs.innerHTML = '';
  const tabs = [['branches', '🏥', 'สาขา'], ...EMPIRE_TIERS.map((t, i) => [i, i > e.tier ? '🔒' : t.icon, t.name]).filter(([i]) => i <= e.tier + 1)];
  if (e.tier >= 1 || prs().runs > 0 || starsToGain() >= 1) tabs.push(['prestige', '⭐', 'เกิดใหม่']);
  for (const [id, icon, name] of tabs) {
    const b = document.createElement('button');
    b.innerHTML = `${icon}<br><small>${name}</small>`;
    b.className = empireTab === id ? 'on' : '';
    b.disabled = id !== 'branches' && id > e.tier;
    b.addEventListener('click', () => {
      empireTab = id;
      empireSel = null;
      renderEmpire();
    });
    emTabs.append(b);
  }
  const showBranches = empireTab === 'branches';
  branchList.style.display = showBranches ? 'block' : 'none';
  emPage.style.display = showBranches ? 'none' : 'block';
  if (showBranches) {
    renderBranches();
    return;
  }
  emPage.innerHTML = '';
  if (empireTab === 'prestige') return renderPrestige();
  if (empireTab === 0) renderCity();
  else renderTierMap(empireTab);
  if (empireTab === e.tier) renderAdvance();
}
function emEl(tag, cls, html) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html !== undefined) el.innerHTML = html;
  return el;
}
function emButton(label, disabled, onClick) {
  const b = emEl('button', 'btn upbuy', label);
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}
function renderCity() {
  const e = emp();
  const grid = emEl('div', 'citygrid');
  // The hospital first, then every plot; bought land adds more
  const order = [-1, ...e.plots.map((_, i) => i)];
  for (const i of order) {
    if (i < 0) {
      grid.append(emEl('div', 'plot hq', `🏥<small>โรงพยาบาล ×${state.branches.length}</small>`));
      continue;
    }
    const p = e.plots[i];
    const b = CITY_BUILDINGS.find((x) => x.id === p?.type);
    const cell = emEl('button', `plot${p ? ' built' : ''}${empireSel === i ? ' sel' : ''}`,
      p ? `${b.icon}<small>${b.name}</small><span class="lv">${'★'.repeat(p.lvl)}${'☆'.repeat(PLACE_MAX - p.lvl)}</span>` : '＋<small>ที่ว่าง</small>');
    cell.addEventListener('click', () => {
      empireSel = i;
      renderEmpire();
    });
    grid.append(cell);
  }
  emPage.append(grid);
  const go = emButton('🚶 ไปดูเมืองจริง', false, visitDistrict);
  go.classList.add('emgo');
  emPage.append(go);
  const landCost = LAND_COSTS[e.land || 0];
  if (landCost !== undefined) {
    const land = emButton(`🗺️ ซื้อที่ดินเพิ่ม +4 แปลง · 💵${landCost.toLocaleString()}`, state.money < landCost, buyLand);
    land.classList.add('emgo');
    emPage.append(land);
  }
  if (empireSel === null) {
    emPage.append(emEl('p', 'emhint', 'แตะที่ว่างเพื่อสร้าง แตะสิ่งก่อสร้างเพื่ออัปเลเวล · ราคาเพิ่มขึ้นทุกครั้งที่สร้าง'));
    return;
  }
  const p = e.plots[empireSel];
  const cost = plotCost();
  if (!p) {
    for (const b of CITY_BUILDINGS) {
      const row = emEl('div', 'uprow', `<div class="upico">${b.icon}</div><div class="upinfo"><b>${b.name}</b><br><small>${b.desc(1)}</small></div>`);
      row.append(emButton(`💵${cost.toLocaleString()}`, state.money < cost, () => buildPlot(empireSel, b.id)));
      emPage.append(row);
    }
  } else {
    const b = CITY_BUILDINGS.find((x) => x.id === p.type);
    const maxed = p.lvl >= PLACE_MAX;
    const row = emEl('div', 'uprow', `<div class="upico">${b.icon}</div><div class="upinfo"><b>${b.name}</b> <span class="lv">Lv.${p.lvl}/${PLACE_MAX}</span><br><small>${b.desc(p.lvl)}${maxed ? '' : ` → Lv.${p.lvl + 1}: ${b.desc(p.lvl + 1)}`}</small></div>`);
    row.append(emButton(maxed ? 'สูงสุด' : `💵${cost.toLocaleString()}`, maxed || state.money < cost, () => buildPlot(empireSel, p.type)));
    emPage.append(row);
  }
}
function renderTierMap(t) {
  const nodes = EMPIRE_NODES[t];
  const levels = nodeLevels(t);
  const map = emEl('div', `emmap t${t}`);
  // Roads from home to every other place
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  for (let i = 1; i < nodes.length; i++) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    Object.entries({ x1: nodes[0].x, y1: nodes[0].y, x2: nodes[i].x, y2: nodes[i].y }).forEach(([k, val]) => line.setAttribute(k, val));
    line.setAttribute('class', levels[i - 1] ? 'road on' : 'road');
    svg.append(line);
  }
  map.append(svg);
  nodes.forEach((n, i) => {
    const lvl = i === 0 ? PLACE_MAX : levels[i - 1];
    const el = emEl('button', `node${i === 0 ? ' home' : ''}${lvl ? ' owned' : ''}${empireSel === i ? ' sel' : ''}`,
      `<span class="ni">${n.icon}</span><span class="nn">${n.name}</span><span class="lv">${i === 0 ? '🏠 ของเรา' : '★'.repeat(lvl) + '☆'.repeat(PLACE_MAX - lvl)}</span>`);
    el.style.left = `${n.x}%`;
    el.style.top = `${n.y}%`;
    el.addEventListener('click', () => {
      empireSel = i === 0 ? null : i;
      renderEmpire();
    });
    map.append(el);
  });
  emPage.append(map);
  const look = emButton('🔭 ดูแผนที่ 3 มิติ', false, () => openMapView(t));
  look.classList.add('emgo');
  emPage.append(look);
  if (!empireSel) {
    emPage.append(emEl('p', 'emhint', `แตะที่บนแผนที่เพื่อพัฒนา แต่ละที่จ่ายภาษีให้ทุกวินาที`));
    return;
  }
  const n = nodes[empireSel];
  const l = levels[empireSel - 1];
  const maxed = l >= PLACE_MAX;
  const cost = maxed ? 0 : nodeCost(t, empireSel, l);
  const row = emEl('div', 'uprow', `<div class="upico">${n.icon}</div><div class="upinfo"><b>${n.name}</b> <span class="lv">Lv.${l}/${PLACE_MAX}</span><br><small>ภาษี +${nodeRate(t, empireSel, l).toLocaleString()}/วินาที${maxed ? '' : ` → +${nodeRate(t, empireSel, l + 1).toLocaleString()}/วินาที`}</small></div>`);
  row.append(emButton(maxed ? 'สูงสุด' : `💵${cost.toLocaleString()}`, maxed || state.money < cost, () => upgradeNode(t, empireSel)));
  emPage.append(row);
}
function renderAdvance() {
  const adv = advanceCheck();
  const card = emEl('div', 'branchcard');
  if (!adv) {
    card.innerHTML = '<b>🏆 คุณคือหมอแห่งโลกแล้ว!</b><br><small>อาณาจักรครบทุกระดับ อัปเลเวลทุกที่ให้ครบ ★★★ เพื่อเก็บภาษีให้มากที่สุด</small>';
  } else {
    card.innerHTML = `<b>${adv.next.icon} ยกระดับเป็น${adv.next.name}</b><br><small>ตำแหน่ง: ${adv.next.title} · รายได้ทุกสาขา +10% · เปิดแผนที่ใหม่</small><br>`
      + adv.reqs.map((r) => `<small>${r.ok ? '✅' : '⬜'} ${r.text}</small>`).join('<br>');
    card.append(document.createElement('br'), emButton(`ยกระดับ · 💵${adv.next.cost.toLocaleString()}`, !adv.ok, advanceTier));
  }
  emPage.append(card);
}

// ---------- the empire made real: a 3D city district beside the hospital, and 3D maps ----------
// The 8 city plots from the 🌏 panel stand west of the hospital along their own road.
const DIST_ROAD_X = -19.5;
const DIST_ROAD2_X = -35.5; // second road, opened with the first land purchase
const CITY_COLS = [-15.5, -23.5, -31.5, -39.5];
// 8 starting plots, then 4 more per land purchase: two new columns, then two rows further north
const DISTRICT_PLOTS = [
  ...[-15.5, -23.5].flatMap((x) => [-9, -3, 3, 9].map((z) => v(x, z))),
  ...[-9, -3, 3, 9].map((z) => v(-31.5, z)),
  ...[-9, -3, 3, 9].map((z) => v(-39.5, z)),
  ...CITY_COLS.map((x) => v(x, -15)),
  ...CITY_COLS.map((x) => v(x, -21)),
];
const LAND_COSTS = [50000, 200000, 800000, 3200000];
const roadOf = (x) => (x > -27.5 ? DIST_ROAD_X : DIST_ROAD2_X);
// Where to stand to manage a plot: on the plot's road side
const plotZone = (p) => v(p.x + (p.x > roadOf(p.x) ? -2.3 : 2.3), p.z);
const inDistrict = (p) => p.x < FLOOR.x0 - 1.2 && p.z < ROAD_Z - 1.8;
const district = { built: false, plots: [], residents: [], standing: -1, stand: 0, opened: -1 };

function buildDistrict() {
  const g = new THREE.Group();
  g.add(districtRoad(DIST_ROAD_X));
  // A sidewalk joining the district to the hospital's front path
  const walk = new THREE.Mesh(new THREE.PlaneGeometry(DIST_ROAD_X * -1 + 5, 1.3), mat(0xe8dcc8));
  walk.rotation.x = -Math.PI / 2;
  walk.position.set((DIST_ROAD_X + 5) / 2, 0.022, 14.5);
  g.add(walk);
  const gate = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.8), new THREE.MeshBasicMaterial({ map: signTex('🏙️ เมืองหมอ', '#3d8bfd'), side: THREE.DoubleSide }));
  gate.position.set(DIST_ROAD_X, 3.0, 13.6);
  g.add(gate);
  for (const dx of [-1.7, 1.7]) {
    const post = box(0.2, 3.2, 0.2, 0xffffff);
    post.position.set(DIST_ROAD_X + dx, 1.6, 13.6);
    g.add(post);
  }
  scene.add(g);
  district.built = true;
  addDistrictLots();
  syncDistrict();
}
function districtRoad(x) {
  const g = new THREE.Group();
  const road = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 40), mat(0x55606e));
  road.rotation.x = -Math.PI / 2;
  road.position.set(x, 0.021, -4.5);
  road.receiveShadow = true;
  g.add(road);
  for (let z = -23; z < 15; z += 3) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 1.3), mat(0xffffff));
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(x, 0.03, z);
    g.add(dash);
  }
  return g;
}
// Lay out lots for every plot the empire owns (more after each land purchase)
function addDistrictLots(animate = false) {
  const n = emp().plots.length;
  if (n > 8 && !district.road2) {
    district.road2 = districtRoad(DIST_ROAD2_X);
    scene.add(district.road2);
  }
  for (let i = district.plots.length; i < n; i++) {
    const at = DISTRICT_PLOTS[i];
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), mat(0xc8b48a));
    lot.rotation.x = -Math.PI / 2;
    lot.position.set(at.x, 0.015, at.z);
    lot.receiveShadow = true;
    scene.add(lot);
    scene.add(zoneRing(plotZone(at), 0x3d8bfd));
    district.plots[i] = { at, lot, group: null, sign: null, key: '', collider: null };
    if (animate) popIn(lot);
  }
}
function buyLand() {
  const e = emp();
  const cost = LAND_COSTS[e.land || 0];
  if (cost === undefined || !empireSpend(cost)) return;
  e.land = (e.land || 0) + 1;
  for (let k = 0; k < 4; k++) e.plots.push(null);
  addDistrictLots(true);
  syncDistrict();
  toast(`🗺️ <b>ซื้อที่ดินเพิ่มแล้ว!</b><br>เมืองหมอมี ${e.plots.length} แปลง`, 3500);
  save();
  renderEmpire();
}

// 3D models for each building type; level adds more and taller pieces
function roofHouse(w, h, d, wall, roof) {
  const g = new THREE.Group();
  const body = box(w, h, d, wall);
  body.position.y = h / 2;
  const top = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, h * 0.6, 4), mat(roof));
  top.position.y = h + h * 0.3;
  top.rotation.y = Math.PI / 4;
  top.castShadow = true;
  const door = box(0.35, 0.6, 0.05, 0x8a5a30, { shadow: false });
  door.position.set(0, 0.3, d / 2 + 0.01);
  g.add(body, top, door);
  return g;
}
const CITY_MODELS = {
  homes(l) {
    const g = new THREE.Group();
    const spots = [[-0.9, -0.9], [0.9, 0.9], [0.9, -0.9], [-0.9, 0.9]].slice(0, 1 + l);
    spots.forEach(([x, z], k) => {
      const hse = roofHouse(1.3, 1.1 + (k % 2) * 0.3, 1.3, pick([0xfff3c4, 0xffd6d6, 0xd6ecff, 0xd8f3dc]), pick([0xe5484d, 0x3d8bfd, 0x2e9e4f, 0xf5a623]));
      hse.position.set(x, 0, z);
      g.add(hse);
    });
    return g;
  },
  school(l) {
    const g = new THREE.Group();
    const body = box(3.0, 1.4 + l * 0.5, 1.8, 0xffe0a3);
    body.position.y = (1.4 + l * 0.5) / 2;
    const roof = box(3.2, 0.2, 2.0, 0xe5484d);
    roof.position.y = 1.4 + l * 0.5 + 0.1;
    const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 16), mat(0xffffff));
    clock.rotation.x = Math.PI / 2;
    clock.position.set(0, 1.0 + l * 0.5, 0.93);
    const pole = box(0.06, 2.6, 0.06, 0xdfe6ee);
    pole.position.set(1.8, 1.3, 1.2);
    const flag = box(0.6, 0.35, 0.03, 0x3d8bfd, { shadow: false });
    flag.position.set(2.1, 2.4, 1.2);
    g.add(body, roof, clock, pole, flag);
    for (let i = 0; i < 3; i++) {
      for (let r = 0; r < l + 1; r++) {
        const win = box(0.4, 0.3, 0.04, 0x7fc8f8, { shadow: false });
        win.position.set(-1.0 + i * 1.0, 0.55 + r * 0.5, 0.92);
        g.add(win);
      }
    }
    return g;
  },
  factory(l) {
    const g = new THREE.Group();
    const body = box(2.8, 1.3, 2.0, 0xb8c2cc);
    body.position.y = 0.65;
    g.add(body);
    for (let i = 0; i < 3; i++) {
      const saw = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.55, 0.6, 3), mat(0x8792a0));
      saw.rotation.z = Math.PI / 2;
      saw.rotation.y = Math.PI / 2;
      saw.position.set(-0.9 + i * 0.9, 1.55, 0);
      g.add(saw);
    }
    for (let k = 0; k < l; k++) {
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 2.2 + k * 0.6, 10), mat(0xe5484d));
      stack.position.set(1.0 - k * 0.7, 1.1 + k * 0.3, -0.6);
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 }));
      puff.position.set(stack.position.x, 2.6 + k * 0.6, -0.6);
      const base = puff.position.y;
      decorAnims.push((t) => {
        puff.position.y = base + ((t * 0.6 + k * 0.3) % 1) * 0.9;
        puff.material.opacity = 0.75 * (1 - ((t * 0.6 + k * 0.3) % 1));
      });
      g.add(stack, puff);
    }
    const cross = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ map: signTexture((c) => {
      c.font = '72px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('💊', 64, 68);
    }) }));
    cross.position.set(0, 0.8, 1.02);
    g.add(cross);
    return g;
  },
  bank(l) {
    const g = new THREE.Group();
    const h = 1.4 + l * 0.4;
    const body = box(2.6, h, 1.8, 0xf4f4f0);
    body.position.y = h / 2;
    const pedi = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 1.7, 0.7, 4, 1), mat(0xdfe6ee));
    pedi.scale.set(1, 1, 0.55);
    pedi.rotation.y = Math.PI / 4;
    pedi.position.y = h + 0.35;
    g.add(body, pedi);
    for (let i = 0; i < 4; i++) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, h, 10), mat(0xffffff));
      col.position.set(-0.9 + i * 0.6, h / 2, 1.05);
      g.add(col);
    }
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 18), mat(0xffd166));
    coin.rotation.x = Math.PI / 2;
    coin.position.set(0, h + 1.2, 0);
    decorAnims.push((t) => { coin.rotation.z = t * 2; });
    g.add(coin);
    return g;
  },
  market(l) {
    const g = new THREE.Group();
    const colors = [0xe5484d, 0x3d8bfd, 0xffd166, 0x2e9e4f, 0x9b5de5, 0xff8fab];
    for (let k = 0; k < l + 1; k++) {
      const x = -1.2 + k * 1.2;
      const table = box(1.0, 0.6, 0.7, 0xa0703c);
      table.position.set(x, 0.3, 0.3);
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.5, 4), mat(colors[k % colors.length]));
      top.rotation.y = Math.PI / 4;
      top.position.set(x, 1.6, 0.3);
      const pole = box(0.06, 1.4, 0.06, 0xdfe6ee);
      pole.position.set(x, 0.7, 0.3);
      g.add(table, top, pole);
      for (let f = 0; f < 3; f++) {
        const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat(pick([0xff924c, 0xe5484d, 0x8ac926, 0xffd166])));
        fruit.position.set(x - 0.25 + f * 0.25, 0.68, 0.3);
        g.add(fruit);
      }
    }
    return g;
  },
  garden(l) {
    const g = new THREE.Group();
    const lawn = new THREE.Mesh(new THREE.CircleGeometry(2.3, 24), mat(0x8fd16b));
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.y = 0.03;
    g.add(lawn);
    for (let k = 0; k < 1 + l; k++) {
      const t = TREES.round();
      t.scale.setScalar(0.7);
      const a = (k / (1 + l)) * Math.PI * 2;
      t.position.set(Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5);
      g.add(t);
    }
    if (l >= 2) {
      const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.3, 16), mat(0xdfe6ee));
      basin.position.y = 0.15;
      const water = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 16), mat(0x5ec8f2));
      water.position.y = 0.3;
      g.add(basin, water);
    }
    for (let i = 0; i < 6 * l; i++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), mat(pick([0xff8fab, 0xffd166, 0xffffff, 0xc77dff])));
      f.position.set(rand(-2, 2), 0.1, rand(-2, 2));
      g.add(f);
    }
    return g;
  },
};

// Rebuild any plot whose building or level changed
function syncDistrict(animate = false) {
  if (!district.built) return;
  district.plots.forEach((slot, i) => {
    const p = emp().plots[i];
    const key = p ? `${p.type}:${p.lvl}` : '';
    if (key === slot.key) return;
    slot.key = key;
    if (slot.group) scene.remove(slot.group);
    if (slot.sign) scene.remove(slot.sign);
    if (slot.collider) colliders.splice(colliders.indexOf(slot.collider), 1);
    slot.collider = null;
    const label = p ? `${CITY_BUILDINGS.find((b) => b.id === p.type).icon} ${'★'.repeat(p.lvl)}` : '🏗️ ที่ว่าง';
    slot.sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.5), new THREE.MeshBasicMaterial({ map: signTex(label, p ? '#2e9e4f' : '#8a96a8'), side: THREE.DoubleSide }));
    const zone = plotZone(slot.at);
    slot.sign.position.set(zone.x, 2.2, zone.z - 1.1);
    slot.sign.rotation.y = Math.PI / 2;
    scene.add(slot.sign);
    if (!p) {
      slot.group = new THREE.Group();
      const post = box(0.1, 1.2, 0.1, 0xdfe6ee);
      post.position.set(0, 0.6, 0);
      const board = box(1.0, 0.6, 0.05, 0xffd166);
      board.position.set(0, 1.2, 0);
      slot.group.add(post, board);
    } else {
      slot.group = CITY_MODELS[p.type](p.lvl);
      // Face the road
      slot.group.rotation.y = slot.at.x > roadOf(slot.at.x) ? -Math.PI / 2 : Math.PI / 2;
      if (p.type !== 'garden') {
        addCollider(slot.at.x, slot.at.z, 3.2, 3.2);
        slot.collider = colliders[colliders.length - 1];
      }
    }
    slot.group.position.set(slot.at.x, 0, slot.at.z);
    slot.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(slot.group);
    if (animate && p) {
      popIn(slot.group);
      burst(slot.group.position);
    }
  });
}

// Residents stroll along the district road once there are homes
function updateDistrict(dt) {
  if (!district.built) return;
  const want = Math.min(12, cityLevel('homes') * 2);
  while (district.residents.length < want) {
    const person = makePerson({ shirt: pick(SHIRTS) });
    person.group.position.set((district.road2 && Math.random() < 0.5 ? DIST_ROAD2_X : DIST_ROAD_X) + rand(-0.8, 0.8), 0, rand(-10, 12));
    scene.add(person.group);
    district.residents.push({ person, target: null, wait: rand(0, 3), cit: district.residents.length * 5 });
  }
  for (const r of district.residents) {
    if (!r.target) {
      r.wait -= dt;
      animatePerson(r.person, false, dt);
      const due = r.cit < citizenCount() && !isSick(r.cit) ? citizenPlace(r.cit) : null;
      if (r.wait <= 0) r.target = due && Math.random() < 0.7 ? due.clone().add(v(rand(-0.6, 0.6), rand(-0.6, 0.6))) : Math.random() < 0.5 ? plotZone(pick(district.plots).at) : v(roadOf(r.person.group.position.x) + rand(-1, 1), rand(-20, 12));
      continue;
    }
    const arrived = walkTo(r.person, r.target, 1.8, dt);
    animatePerson(r.person, !arrived, dt);
    if (arrived) {
      r.target = null;
      r.wait = rand(2, 5);
    }
  }
  // Standing on a plot's ring for a moment opens the city panel on that plot
  let here = -1;
  if (player.floor === 0 && !autoBadge.classList.contains('show')) {
    here = district.plots.findIndex((p) => flatDist(player.group.position, plotZone(p.at)) < ZONE_R);
  }
  if (here !== district.standing) {
    district.standing = here;
    district.stand = 0;
  }
  if (here < 0) {
    district.opened = -1;
    return;
  }
  district.stand += dt;
  if (district.stand > 0.6 && district.opened !== here && branchPanel.style.display !== 'flex' && !epiTargets().includes(here)) {
    district.opened = here;
    empireTab = 0;
    empireSel = here;
    renderEmpire();
    branchPanel.style.display = 'flex';
  }
}
// Walk-free shortcut from the panel: jump to the district road, and back
function visitDistrict() {
  if (lift.riding) return;
  if (player.floor !== 0) setFloor(0);
  player.group.position.set(DIST_ROAD_X, 0, 12.5);
  auto.idle = 0;
  auto.task = null;
  updateCamera(0, true);
  branchPanel.style.display = 'none';
  toast('🏙️ <b>เมืองหมอ</b> ยืนในวงฟ้าหน้าแปลงเพื่อสร้างหรืออัปเลเวล<br><small>กด 🏥 มุมขวาบนเพื่อกลับโรงพยาบาล</small>', 5000);
}
const homeBtn = document.getElementById('homebtn');
const zoomBtn = document.getElementById('zoombtn');
zoomBtn.addEventListener('click', () => setZoom(camZoom > 1.5 ? 1 : 2.8));
homeBtn.addEventListener('click', () => {
  player.group.position.copy(PLAYER_START);
  updateCamera(0, true);
});
function updateHomeBtn() {
  const show = running && player.floor === 0 && inDistrict(player.group.position);
  if (homeBtn.style.display !== (show ? 'block' : 'none')) homeBtn.style.display = show ? 'block' : 'none';
}

// ---------- 3D empire maps: province, region, country and a globe ----------
const mapView = {
  active: false, tier: 1, scene: null, camera: new THREE.PerspectiveCamera(40, 1, 0.1, 400),
  yaw: 0.5, pitch: 0.95, dist: 42, hits: [], labels: [], sel: null, drag: null, spin: 0, wasRunning: false,
};
const mvEl = document.getElementById('mapview');
const mvLabels = document.getElementById('mvlabels');
const mvSheet = document.getElementById('mvsheet');
const mapPos = (n) => v((n.x - 50) * 0.32, (n.y - 50) * 0.32);
const GLOBE_R = 11;
function globePos(n, lift = 0) {
  const lon = ((n.x - 50) / 50) * Math.PI;
  const lat = ((50 - n.y) / 50) * (Math.PI / 2) * 0.92;
  const r = GLOBE_R + lift;
  return new THREE.Vector3(r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat), r * Math.cos(lat) * Math.cos(lon));
}
function miniCity(count, home, scale = 1) {
  const g = new THREE.Group();
  if (home) {
    const hq = box(1.4, 1.2, 1.4, 0xffffff);
    hq.position.y = 0.6;
    const cross = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ map: signTexture((c) => {
      c.fillStyle = '#e5484d'; c.fillRect(48, 20, 32, 88); c.fillRect(20, 48, 88, 32);
    }) }));
    cross.position.set(0, 0.7, 0.71);
    g.add(hq, cross);
  }
  if (!count && !home) {
    // For sale: a little flag on bare ground
    const pole = box(0.08, 1.4, 0.08, 0xdfe6ee);
    pole.position.y = 0.7;
    const flag = box(0.6, 0.35, 0.04, 0xe5484d, { shadow: false });
    flag.position.set(0.32, 1.2, 0);
    g.add(pole, flag);
  }
  let seed = count * 31 + (home ? 7 : 3);
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 0.9 + rnd() * 1.4;
    const h = 0.4 + rnd() * (0.6 + count * 0.08);
    const b = box(0.5 + rnd() * 0.3, h, 0.5 + rnd() * 0.3, pick([0xfff3c4, 0xffd6d6, 0xd6ecff, 0xd8f3dc, 0xf4f4f0]));
    b.position.set(Math.cos(a) * d, h / 2, Math.sin(a) * d);
    g.add(b);
    if (rnd() < 0.5) {
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.35, 4), mat(pick([0xe5484d, 0x3d8bfd, 0xf5a623])));
      roof.rotation.y = Math.PI / 4;
      roof.position.set(b.position.x, h + 0.17, b.position.z);
      g.add(roof);
    }
  }
  g.scale.setScalar(scale);
  return g;
}
// A landmark per region of the country map
const LANDMARKS = {
  'ภาคเหนือ': () => { const g = new THREE.Group(); [[0, 0, 2.2], [1.2, 0.6, 1.6], [-1.1, 0.5, 1.4]].forEach(([x, z, h]) => { const m = new THREE.Mesh(new THREE.ConeGeometry(1.0, h, 6), flatMat(0x52796f)); m.position.set(x, h / 2, z); const cap = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.5, 6), flatMat(0xffffff)); cap.position.set(x, h - 0.2, z); g.add(m, cap); }); return g; },
  'ภาคอีสาน': () => { const g = new THREE.Group(); for (let i = 0; i < 5; i++) { const f = box(3.2, 0.1, 0.45, i % 2 ? 0xc9e265 : 0x8ac926); f.position.set(0, 0.05, -1 + i * 0.5); g.add(f); } return g; },
  'ภาคกลาง': () => { const g = new THREE.Group(); [1.6, 1.1, 0.7].forEach((w, i) => { const t = box(w, 0.5, w, 0xffd166); t.position.y = 0.25 + i * 0.5; g.add(t); }); const spire = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.0, 8), mat(0xffd166)); spire.position.y = 2.0; g.add(spire); return g; },
  'ภาคตะวันออก': () => { const g = new THREE.Group(); const sand = new THREE.Mesh(new THREE.CircleGeometry(1.6, 16), mat(0xf2dca0)); sand.rotation.x = -Math.PI / 2; sand.position.y = 0.06; const um = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.3, 8), mat(0xe5484d)); um.position.set(0.4, 0.9, 0); const pole = box(0.04, 0.8, 0.04, 0xffffff); pole.position.set(0.4, 0.45, 0); g.add(sand, um, pole); return g; },
  'ภาคตะวันตก': () => { const g = new THREE.Group(); const body = box(1.0, 0.7, 0.6, 0x8d99ae); body.position.y = 0.8; const head = box(0.45, 0.45, 0.5, 0x8d99ae); head.position.set(0.65, 0.95, 0); const trunk = box(0.12, 0.6, 0.12, 0x8d99ae); trunk.position.set(0.9, 0.55, 0); g.add(body, head, trunk); [[-0.35, -0.2], [-0.35, 0.2], [0.35, -0.2], [0.35, 0.2]].forEach(([x, z]) => { const leg = box(0.18, 0.5, 0.18, 0x8d99ae); leg.position.set(x, 0.25, z); g.add(leg); }); return g; },
  'ภาคใต้': () => { const g = TREES.palm(); g.scale.setScalar(0.5); return g; },
};

function addMapLabel(pos, html, i) {
  const el = document.createElement('button');
  el.className = 'mvlabel';
  el.innerHTML = html;
  el.addEventListener('click', () => selectMapNode(i));
  mvLabels.append(el);
  mapView.labels.push({ el, pos });
}
function buildMapScene(t) {
  const sc = new THREE.Scene();
  sc.background = new THREE.Color(t === 4 ? 0x0b1530 : 0x9fdcff);
  sc.add(new THREE.HemisphereLight(0xffffff, 0x5a7a9e, 1.5));
  const sunL = new THREE.DirectionalLight(0xffffff, 1.6);
  sunL.position.set(20, 30, 15);
  sc.add(sunL);
  mapView.hits = [];
  mapView.labels = [];
  mvLabels.innerHTML = '';
  const nodes = EMPIRE_NODES[t];
  const levels = nodeLevels(t);
  const root = new THREE.Group();
  sc.add(root);
  mapView.root = root;
  if (t === 4) {
    // The globe: blue sphere, continents as green bumps, stars behind
    const globe = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_R, 40, 28), new THREE.MeshLambertMaterial({ color: 0x3fa9e0 }));
    root.add(globe);
    const stars = new THREE.BufferGeometry();
    const sp = new Float32Array(600 * 3);
    for (let i = 0; i < sp.length; i++) sp[i] = rand(-150, 150);
    stars.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sc.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0xffffff, size: 0.6 })));
  } else {
    const sea = new THREE.Mesh(new THREE.CircleGeometry(220, 48), mat(0x6cc3f0));
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -0.3;
    sc.add(sea);
    if (t !== 3) {
      const land = new THREE.Mesh(new THREE.CylinderGeometry(19, 20, 0.6, 40), flatMat(t === 1 ? 0x8fd16b : 0x79c850));
      land.position.y = -0.3;
      root.add(land);
    }
  }
  nodes.forEach((n, i) => {
    const lvl = i === 0 ? PLACE_MAX : levels[i - 1];
    const owned = lvl > 0;
    let pos;
    const g = new THREE.Group();
    if (t === 4) {
      pos = globePos(n, 0);
      for (let k = 0; k < 7; k++) {
        const bump = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), flatMat(n.name === 'แอนตาร์กติกา' ? 0xffffff : owned ? 0x79c850 : 0x9fb88a));
        bump.scale.set(rand(1.2, 2.2), 0.35, rand(1.2, 2.2));
        bump.position.set(rand(-1.5, 1.5), 0, rand(-1.5, 1.5));
        g.add(bump);
      }
      const city = miniCity(i === 0 ? 4 : lvl * 3, i === 0, 0.55);
      city.position.y = 0.2;
      g.add(city);
      g.position.copy(pos);
      g.lookAt(pos.clone().multiplyScalar(2));
      g.rotateX(Math.PI / 2);
      root.add(g);
      pos = globePos(n, 1.5);
    } else {
      pos = mapPos(n);
      if (t === 3) {
        // Country: each region is its own landmass, with its landmark
        const land = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.6, 0.6, 9), flatMat(owned ? 0x79c850 : 0xa3b88f));
        land.scale.set(1, 1, i === 5 ? 1.4 : 1);
        land.position.y = -0.3;
        g.add(land);
        const mark = LANDMARKS[n.name]?.();
        if (mark) {
          mark.position.set(-1.6, 0, -1.2);
          g.add(mark);
        }
      } else if (t === 2) {
        const patch = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.1, 24), mat(owned ? pick([0xb9e59a, 0xffe0a3, 0xd6ecff, 0xffd6ff]) : 0xc8d1b8));
        patch.position.y = 0.02;
        g.add(patch);
      }
      g.add(miniCity(i === 0 ? 6 : lvl * 3, i === 0, t === 1 ? 1 : 0.8));
      g.position.copy(pos);
      root.add(g);
      if (i > 0) {
        const road = new THREE.BufferGeometry().setFromPoints([mapPos(nodes[0]).setY(0.08), pos.clone().setY(0.08)]);
        root.add(new THREE.Line(road, new THREE.LineBasicMaterial({ color: owned ? 0xffd166 : 0xffffff, transparent: true, opacity: owned ? 1 : 0.5 })));
      }
      pos = pos.clone().setY(2.6);
    }
    if (owned) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 2.9, 32), new THREE.MeshBasicMaterial({ color: i === 0 ? 0xe5484d : 0xffd166, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.06;
      if (t !== 4) g.add(ring);
    }
    const hit = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.copy(t === 4 ? globePos(n, 0.5) : g.position.clone().setY(1));
    hit.userData.node = i;
    root.add(hit);
    mapView.hits.push(hit);
    addMapLabel(pos, `${n.icon} ${n.name}<small>${i === 0 ? '🏠 ของเรา' : '★'.repeat(lvl) + '☆'.repeat(PLACE_MAX - lvl)}</small>`, i);
  });
  if (t === 4) {
    // Flight paths from home to every owned continent
    nodes.forEach((n, i) => {
      if (!i || !levels[i - 1]) return;
      const a = globePos(nodes[0], 0.3).normalize();
      const b = globePos(n, 0.3).normalize();
      const pts = [];
      for (let k = 0; k <= 24; k++) {
        const p = a.clone().lerp(b, k / 24).normalize();
        pts.push(p.multiplyScalar(GLOBE_R + 0.3 + Math.sin((k / 24) * Math.PI) * 2.2));
      }
      root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffd166 })));
    });
  }
  mapView.scene = sc;
}
function openMapView(t) {
  mapView.tier = t;
  mapView.sel = null;
  mapView.yaw = t === 4 ? 0 : 0.5;
  mapView.pitch = t === 4 ? 0.25 : 1.05;
  mapView.dist = t === 4 ? 38 : 44;
  buildMapScene(t);
  mapView.wasRunning = running;
  running = false;
  mapView.active = true;
  branchPanel.style.display = 'none';
  document.body.classList.add('mapopen');
  mvEl.style.display = 'block';
  document.getElementById('mvtitle').textContent = `${EMPIRE_TIERS[t].icon} แผนที่${EMPIRE_TIERS[t].name}`;
  renderMapSheet();
}
function closeMapView() {
  mapView.active = false;
  mvEl.style.display = 'none';
  document.body.classList.remove('mapopen');
  running = mapView.wasRunning;
  last = performance.now();
  renderEmpire();
  branchPanel.style.display = 'flex';
}
function selectMapNode(i) {
  mapView.sel = i === 0 ? null : i;
  renderMapSheet();
}
function renderMapSheet() {
  const t = mapView.tier;
  mvSheet.innerHTML = '';
  if (!mapView.sel) {
    mvSheet.innerHTML = `<small>ลากเพื่อหมุน · บีบหรือเลื่อนเพื่อซูม · แตะที่บนแผนที่เพื่อพัฒนา<br>ภาษีรวม +${empireRate().toLocaleString()}/วินาที</small>`;
    return;
  }
  const i = mapView.sel;
  const n = EMPIRE_NODES[t][i];
  const l = nodeLevels(t)[i - 1];
  const maxed = l >= PLACE_MAX;
  const cost = maxed ? 0 : nodeCost(t, i, l);
  const row = emEl('div', 'uprow', `<div class="upico">${n.icon}</div><div class="upinfo"><b>${n.name}</b> <span class="lv">Lv.${l}/${PLACE_MAX}</span><br><small>ภาษี +${nodeRate(t, i, l).toLocaleString()}/วินาที${maxed ? '' : ` → +${nodeRate(t, i, l + 1).toLocaleString()}/วินาที`}</small></div>`);
  row.append(emButton(maxed ? 'สูงสุด' : `💵${cost.toLocaleString()}`, maxed || state.money < cost, () => {
    upgradeNode(t, i);
    branchPanel.style.display = 'none';
    buildMapScene(t);
    renderMapSheet();
  }));
  mvSheet.append(row);
}
function renderMapView(dt) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  // Portrait phones: wider lens and further back so the whole map fits across
  const portrait = w < h;
  mapView.camera.fov = portrait ? 60 : 40;
  mapView.camera.aspect = w / h;
  mapView.camera.updateProjectionMatrix();
  if (!mapView.drag) mapView.spin += dt * (mapView.tier === 4 ? 0.12 : 0.04);
  const yaw = mapView.yaw + mapView.spin;
  const d = mapView.dist * (portrait ? (mapView.tier === 4 ? 1.3 : 1.65) : 1);
  mapView.camera.position.set(Math.sin(yaw) * Math.cos(mapView.pitch) * d, Math.sin(mapView.pitch) * d, Math.cos(yaw) * Math.cos(mapView.pitch) * d);
  mapView.camera.lookAt(0, 0, 0);
  renderer.render(mapView.scene, mapView.camera);
  const camDir = mapView.camera.position.clone().normalize();
  for (const lb of mapView.labels) {
    tmpV.copy(lb.pos).project(mapView.camera);
    const hidden = mapView.tier === 4 && lb.pos.clone().normalize().dot(camDir) < 0.15; // far side of the globe
    lb.el.style.display = hidden || tmpV.z > 1 ? 'none' : 'block';
    lb.el.style.left = `${(tmpV.x * 0.5 + 0.5) * w}px`;
    lb.el.style.top = `${(-tmpV.y * 0.5 + 0.5) * h}px`;
  }
}
// Drag to orbit, pinch or wheel to zoom, tap to pick
const mvCanvas = document.getElementById('mvtouch');
const mvPointers = new Map();
mvCanvas.addEventListener('pointerdown', (e) => {
  mvCanvas.setPointerCapture(e.pointerId);
  mvPointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
  mapView.drag = true;
  mapView.pinch = null;
});
mvCanvas.addEventListener('pointermove', (e) => {
  const p = mvPointers.get(e.pointerId);
  if (!p) return;
  if (mvPointers.size === 2) {
    const [a, b] = [...mvPointers.values()];
    const before = Math.hypot(a.x - b.x, a.y - b.y);
    p.x = e.clientX;
    p.y = e.clientY;
    const after = Math.hypot(a.x - b.x, a.y - b.y);
    mapView.dist = Math.max(14, Math.min(70, mapView.dist * (before / Math.max(1, after))));
    return;
  }
  mapView.yaw -= (e.clientX - p.x) * 0.008;
  mapView.pitch = Math.max(mapView.tier === 4 ? -1.2 : 0.35, Math.min(1.4, mapView.pitch + (e.clientY - p.y) * 0.006));
  p.x = e.clientX;
  p.y = e.clientY;
});
const mvUp = (e) => {
  const p = mvPointers.get(e.pointerId);
  mvPointers.delete(e.pointerId);
  if (!mvPointers.size) mapView.drag = false;
  if (!p || Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 8) return;
  // A tap: what's under it?
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1), mapView.camera);
  const hit = ray.intersectObjects(mapView.hits)[0];
  if (hit) selectMapNode(hit.object.userData.node);
};
mvCanvas.addEventListener('pointerup', mvUp);
mvCanvas.addEventListener('pointercancel', mvUp);
mvCanvas.addEventListener('wheel', (e) => {
  mapView.dist = Math.max(14, Math.min(70, mapView.dist * (e.deltaY > 0 ? 1.1 : 0.9)));
}, { passive: true });
document.getElementById('mvclose').addEventListener('click', closeMapView);

// ---------- floors 3 and 4: more services between floor 2 and the roof ----------
// Floor index 3 = ชั้น 3 (specialist clinics), 4 = ชั้น 4 (mother & child). Their patients
// arrive by the elevator, queue for a room, get treated and ride back down.
const UPPER = {
  3: { name: 'ชั้น 3 คลินิกเฉพาะทาง', floorColor: 0xece4ff, group: new THREE.Group(), built: false, timer: 3 },
  4: { name: 'ชั้น 4 แม่และเด็ก', floorColor: 0xffe8f1, group: new THREE.Group(), built: false, timer: 3 },
};
for (const f of [3, 4]) {
  UPPER[f].group.position.y = FLOOR_Y[f];
  UPPER[f].group.visible = false;
  scene.add(UPPER[f].group);
}
const UP_BED_X = -3.5;
const UP_OP_X = -5.6;
const UP_QUEUE = 4;
const UPPER_ROOMS = {
  psych: { floor: 3, row: -6, icon: '🧠', name: 'ห้องจิตวิทยา', price: 120, time: 3.2, staffLook: { shirt: 0x6d6875, coat: 0xffffff } },
  massage: { floor: 3, row: 1.5, icon: '💆', name: 'ห้องนวดแผนไทย', price: 150, time: 3.6, staffLook: { shirt: 0x9c6644, apron: 0xddb892 } },
  nutrition: { floor: 3, row: 9, icon: '🥗', name: 'ห้องโภชนาการ', price: 180, time: 3.0, staffLook: { shirt: 0x8ac926, coat: 0xffffff } },
  prenatal: { floor: 4, row: -6, icon: '🤰', name: 'ห้องฝากครรภ์', price: 220, time: 3.4, staffLook: { shirt: 0xff8fab, coat: 0xffffff }, mothers: true },
  delivery: { floor: 4, row: 1.5, icon: '👶', name: 'ห้องคลอด', price: 320, time: 4.5, staffLook: { shirt: 0x48cae4, pants: 0x48cae4, cap: true }, mothers: true },
  nursery: { floor: 4, row: 9, icon: '🍼', name: 'ห้องเด็กแรกเกิด', price: 260, time: 3.2, staffLook: { shirt: 0xffd6ff, pants: 0xffd6ff, cap: true }, mothers: true },
};
for (const [id, r] of Object.entries(UPPER_ROOMS)) Object.assign(r, { id, active: false, staff: null, queue: [], scan: 0, bed: v(UP_BED_X, r.row), op: v(UP_OP_X, r.row) });
const upSlot = (r, i) => (i === 0 ? r.bed.clone() : v(r.bed.x + 1.4 + (i - 1) * 1.1, r.row));
const floorGroup = (f) => (f === 1 ? F2.group : f === 2 ? F3.group : f >= 3 ? UPPER[f].group : scene);

function buildUpperFloor(f, animate) {
  const U = UPPER[f];
  const g = U.group;
  const tex = canvasTexture(256, 256, (c) => {
    const col = `#${U.floorColor.toString(16).padStart(6, '0')}`;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        c.fillStyle = (x + y) % 2 ? col : '#ffffff';
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
  g.add(deck);
  const rail = (cx, cz, w, d) => {
    const r = box(w, 0.7, d, f === 3 ? 0x9b5de5 : 0xff8fab);
    r.position.set(cx, 0.35, cz);
    g.add(r);
    addCollider(cx, cz, w, d, f);
  };
  const cz = (FLOOR.z0 + FLOOR.z1) / 2;
  rail(FLOOR.x0 - 0.15, cz, 0.2, fd);
  rail(FLOOR.x1 + 0.15, cz, 0.2, fd);
  rail(0, FLOOR.z0 - 0.15, fw, 0.2);
  rail(0, FLOOR.z1 + 0.15, fw, 0.2);
  g.add(zoneRing(ELEVATOR, 0x7b61ff));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.8), new THREE.MeshBasicMaterial({ map: signTex(U.name, f === 3 ? '#7b3fbe' : '#d6336c'), side: THREE.DoubleSide }));
  sign.position.set(3.2, 2.6, -10.6);
  g.add(sign);
  // A few plants and benches by the lift so the floor feels lived in
  for (const [x, z] of [[8.2, -10.2], [8.2, 12.6], [3.4, 12.6]]) {
    const p = pottedPlant();
    p.position.set(x, 0, z);
    g.add(p);
  }
  // Taller elevator shaft reaching this floor (the roof's shaft already covers it once the roof exists)
  if (!F3.built) {
    for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) {
      const post = box(0.14, FLOOR_Y[f] - F2Y, 0.14, 0x7b61ff);
      post.position.set(ELEVATOR.x + dx, F2Y + 2.2 + (FLOOR_Y[f] - F2Y) / 2, ELEVATOR.z + dz);
      scene.add(post);
    }
  }
  U.built = true;
  if (animate) popIn(deck);
}

// Small furniture sets for each room, built around the bed spot
function upperModel(r) {
  const g = new THREE.Group();
  const add = (m, x, y, z) => { m.position.set(x, y, z); g.add(m); return m; };
  switch (r.id) {
    case 'psych':
      add(box(1.0, 0.5, 2.0, 0x9b5de5), 0, 0.25, 0);
      add(box(0.3, 0.6, 2.0, 0x7b3fbe), -0.4, 0.55, 0);
      add(box(0.7, 0.8, 0.7, 0xb5838d), -1.3, 0.4, -1.4);
      break;
    case 'massage':
      add(box(0.9, 0.55, 2.0, 0xddb892), 0, 0.28, 0);
      add(box(0.8, 0.06, 0.6, 0xffffff), 0, 0.58, 0.6);
      for (let i = 0; i < 3; i++) add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 8), mat(0xffd166)), -0.8 + i * 0.2, 0.1, -1.2);
      break;
    case 'nutrition':
      add(box(1.2, 0.75, 1.6, 0xf4f4f0), 0, 0.38, 0);
      for (let i = 0; i < 5; i++) add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat(pick([0x8ac926, 0xe5484d, 0xff924c, 0xffd166]))), -0.4 + i * 0.2, 0.85, 0.2);
      break;
    case 'prenatal':
      add(box(1.0, 0.55, 2.0, 0xffffff), 0, 0.28, 0);
      add(box(0.9, 0.08, 1.8, 0xffc2d4), 0, 0.6, 0);
      add(box(0.6, 0.45, 0.08, 0x1d2433), -1.0, 1.3, -0.9);
      break;
    case 'delivery':
      add(box(1.0, 0.6, 2.1, 0xffffff), 0, 0.3, 0);
      add(box(0.9, 0.08, 1.9, 0x8ecae6), 0, 0.64, 0);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.3, 0.15, 16), new THREE.MeshBasicMaterial({ color: 0xfff3c4 })), 0, 2.2, 0);
      add(box(0.08, 1.6, 0.08, 0xdfe6ee), 0.7, 0.8, -0.8);
      break;
    case 'nursery':
      for (const z of [-0.7, 0.7]) {
        add(box(0.8, 0.5, 0.9, 0xffffff), 0, 0.5, z);
        add(box(0.7, 0.06, 0.8, 0xffd6ff), 0, 0.78, z);
        add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), mat(0xffdbac)), 0, 0.88, z);
      }
      break;
    default:
      break;
  }
  return g;
}
function buildUpperRoom(r, animate) {
  const g = floorGroup(r.floor);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 5.4), mat(r.floor === 3 ? 0xddd0ff : 0xffd1e3));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(-3.6, 0.01, r.row);
  g.add(rug);
  const model = upperModel(r);
  model.position.set(r.bed.x, 0, r.bed.z);
  g.add(model);
  addCollider(r.bed.x, r.bed.z, 1.1, 2.2, r.floor);
  r.icon3d = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), new THREE.MeshBasicMaterial({ map: signTexture((c) => {
    c.font = '72px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(r.icon, 64, 68);
  }), side: THREE.DoubleSide }));
  r.icon3d.position.set(r.bed.x, 3.0, r.bed.z);
  g.add(r.icon3d);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.7), new THREE.MeshBasicMaterial({ map: signTex(`${r.icon} ${r.name}`, r.floor === 3 ? '#7b3fbe' : '#d6336c'), side: THREE.DoubleSide }));
  sign.position.set(-3.6, 2.1, r.row - 2.5);
  g.add(sign);
  g.add(zoneRing(r.op, 0x3fbf5f));
  r.active = true;
  if (animate) popIn(model);
}
function hireUpperStaff(r, animate) {
  const person = makePerson(r.staffLook);
  person.group.position.copy(r.op);
  person.group.rotation.y = Math.PI / 2;
  floorGroup(r.floor).add(person.group);
  r.staff = person;
  if (animate) popIn(person.group);
}
function upperPay(amount, r) {
  F2.bank += amount; // down in the cash basket with the other upstairs takings
  missionProgress('serve', 1);
  missionProgress('earn', amount);
  floatText(r.bed.clone().setY(FLOOR_Y[r.floor] + 0.6), `+${amount}`, '#8be08f');
  sfxCoin();
}
function updateUpperFloor(f, dt) {
  const U = UPPER[f];
  if (!U.built) return;
  const rooms = Object.values(UPPER_ROOMS).filter((r) => r.floor === f && r.active);
  U.timer -= dt;
  if (U.timer <= 0) {
    U.timer = (4.5 / arrivalMult()) * rand(0.7, 1.3);
    const open = rooms.filter((r) => r.queue.length < UP_QUEUE);
    if (open.length) {
      const r = pick(open);
      const person = makePerson({ shirt: r.mothers ? pick([0xff8fab, 0xffc2d4, 0xf28482]) : pick(SHIRTS) });
      person.group.position.copy(ELEVATOR);
      U.group.add(person.group);
      r.queue.push({ person, arrived: false });
    }
  }
  for (const r of rooms) {
    r.icon3d.rotation.y += dt;
    r.queue.forEach((p, i) => {
      const there = walkTo(p.person, upSlot(r, i), 2.8, dt);
      animatePerson(p.person, !there, dt);
      p.arrived = there;
      if (there) faceToward(p.person.group, -1, 0, dt);
    });
    const front = r.queue[0];
    const staffed = r.staff || (player.floor === f && flatDist(player.group.position, r.op) < ZONE_R);
    if (front?.arrived && staffed) {
      r.scan += dt * (r.staff ? staffMult() : 1) * cardSpeed(r.id);
      if (r.scan >= r.time) {
        r.scan = 0;
        upperPay(Math.round(r.price * priceMult() * eventPayMult()), r);
        r.queue.shift();
        U.leaving = U.leaving || [];
        U.leaving.push(front);
      }
    }
  }
  // Treated patients head back to the lift and ride away
  if (U.leaving) {
    for (let i = U.leaving.length - 1; i >= 0; i--) {
      const p = U.leaving[i];
      const there = walkTo(p.person, ELEVATOR, 3.2, dt);
      animatePerson(p.person, !there, dt);
      if (there) {
        U.group.remove(p.person.group);
        U.leaving.splice(i, 1);
      }
    }
  }
}
function updateUpper(dt) {
  updateUpperFloor(3, dt);
  updateUpperFloor(4, dt);
}
// A room upstairs has a patient waiting and nobody to treat them: which floor?
function upperNeedsPlayer(except = -1) {
  for (const r of Object.values(UPPER_ROOMS)) {
    if (r.floor !== except && r.active && !r.staff && r.queue[0]?.arrived) return r.floor;
  }
  return 0;
}
function upperTasks(f) {
  const tasks = [];
  if (tile && state.money >= tile.u.price - state.paid) {
    const t = tile;
    tasks.push((t.u.floor || 0) === f ? { at: t.u.at, keep: () => tile === t && state.money > 0 } : { at: ELEVATOR, ride: t.u.floor || 0, keep: () => player.floor === f });
  }
  for (const r of Object.values(UPPER_ROOMS)) {
    if (r.floor === f && r.active && !r.staff && r.queue[0]?.arrived) tasks.push({ at: r.op, keep: () => Boolean(r.queue[0]?.arrived) });
  }
  const other = upperNeedsPlayer(f);
  if (other) tasks.push({ at: ELEVATOR, ride: other, keep: () => player.floor === f });
  tasks.push({ at: ELEVATOR, ride: 0, keep: () => player.floor === f });
  return tasks;
}
function upperPerSecond() {
  let rate = 0;
  for (const f of [3, 4]) {
    const rooms = Object.values(UPPER_ROOMS).filter((r) => r.floor === f && r.active);
    const each = rooms.length ? arrivalMult() / 4.5 / rooms.length : 0;
    for (const r of rooms) if (r.staff) rate += Math.min(each, staffMult() / r.time) * r.price * priceMult();
  }
  return rate;
}

// ---------- prestige: start a new chain for permanent ⭐ stars ----------
const defaultPrestige = () => ({ stars: 0, total: 0, runs: 0, base: 0, perks: {} });
const PERKS = [
  { id: 'income', icon: '💵', name: 'รายได้ทุกสาขา', desc: (l) => `+${25 * l}%`, max: 20, cost: 1 },
  { id: 'tax', icon: '🏛️', name: 'ภาษีอาณาจักร', desc: (l) => `+${25 * l}%`, max: 10, cost: 1 },
  { id: 'speed', icon: '⚡', name: 'พนักงานและเครื่องผลิต', desc: (l) => `เร็ว +${10 * l}%`, max: 10, cost: 2 },
  { id: 'startcash', icon: '💼', name: 'เงินตั้งต้นรอบใหม่', desc: (l) => `💵${(5000 * l * l).toLocaleString()}`, max: 10, cost: 1 },
  { id: 'headstart', icon: '🚀', name: 'เริ่มรอบใหม่ที่ขั้น', desc: (l) => `ขั้น ${3 * l}`, max: 4, cost: 3 },
];
const prs = () => state.prestige || defaultPrestige();
const perk = (id) => prs().perks[id] || 0;
const perkCost = (p) => p.cost * (perk(p.id) + 1);
const prestigeIncome = () => 1 + 0.25 * perk('income');
const prestigeTax = () => 1 + 0.25 * perk('tax');
const prestigeSpeed = () => 1 + 0.1 * perk('speed');
const runEarned = () => Math.max(0, (state.earned || 0) - prs().base);
const starsToGain = () => Math.floor(5 * Math.sqrt(runEarned() / 1e7));
function buyPerk(p) {
  const c = perkCost(p);
  if (perk(p.id) >= p.max || prs().stars < c) return;
  state.prestige.stars -= c;
  state.prestige.perks[p.id] = perk(p.id) + 1;
  sfxUnlock();
  save();
  renderEmpire();
}
function doPrestige() {
  const gain = starsToGain();
  if (gain < 1) return;
  if (!confirm(`เกิดใหม่ เริ่มเครือโรงพยาบาลใหม่ทั้งหมด แลกกับ ⭐ ${gain} ดาว?\n\nเงิน สาขา อาณาจักร และงานวิจัยจะเริ่มใหม่\nเก็บไว้: ดาว โบนัสถาวร ของตกแต่ง ชุดหมอ การ์ดหมอ ความสำเร็จ และอันดับรายได้สะสม`)) return;
  const p = prs();
  const headstart = Math.min(3 * perk('headstart'), CORE_STEPS);
  const data = saveData();
  replaceSave({
    v: 2, money: 5000 * perk('startcash') ** 2, earned: state.earned, daily: state.daily, tutorial: state.tutorial,
    current: 0, branches: [{ step: headstart, rating: 3.5 }], branch: 0, step: headstart,
    style: state.style, challenge: state.challenge, room: state.room, tips: state.tips, week: state.week,
    stats: state.stats, achievements: state.achievements, cards: state.cards, cardPulls: state.cardPulls, quiz: state.quiz,
    conquests: state.conquests, conquestRun: state.conquestRun,
    prestige: { ...p, stars: p.stars + gain, total: p.total + gain, runs: p.runs + 1, base: state.earned },
    empire: defaultEmpire(), research: { done: [], cur: null }, savedAt: data.savedAt,
  });
}
function renderPrestige() {
  const p = prs();
  const gain = starsToGain();
  const card = emEl('div', 'branchcard', `<b>⭐ เกิดใหม่ (Prestige)</b><br><small>ดาวที่มี: <b>${p.stars}</b> · ได้มาทั้งหมด ${p.total} · เกิดใหม่แล้ว ${p.runs} ครั้ง<br>`
    + `รายได้รอบนี้ 💵${Math.floor(runEarned()).toLocaleString()} → ได้ <b>⭐ ${gain}</b> ดาวถ้าเกิดใหม่ตอนนี้${gain < 1 ? '<br>(หาเงินรอบนี้ให้ถึง 400,000 ก่อน)' : ''}</small><br>`);
  card.append(emButton(`🔄 เกิดใหม่ รับ ⭐ ${gain}`, gain < 1, doPrestige));
  emPage.append(card);
  emPage.append(emEl('p', 'emhint', 'ใช้ดาวซื้อโบนัสถาวร (ติดตัวทุกรอบ)'));
  for (const pk of PERKS) {
    const l = perk(pk.id);
    const maxed = l >= pk.max;
    const row = emEl('div', 'uprow', `<div class="upico">${pk.icon}</div><div class="upinfo"><b>${pk.name}</b> <span class="lv">Lv.${l}/${pk.max}</span><br><small>${pk.desc(l)}${maxed ? '' : ` → ${pk.desc(l + 1)}`}</small></div>`);
    row.append(emButton(maxed ? 'สูงสุด' : `⭐ ${perkCost(pk)}`, maxed || p.stars < perkCost(pk), () => buyPerk(pk)));
    emPage.append(row);
  }
}

// ---------- doctor cards: collect named doctors who make a department better ----------
const CARD_NAMES = ['หมอใจดี', 'หมอยิ้มหวาน', 'หมอมือนิ่ม', 'หมอสายฟ้า', 'หมอขยัน', 'หมอแม่นยำ', 'หมอใจเย็น', 'หมอนักสู้', 'หมอตาคม', 'หมอมือทอง', 'หมอสดใส', 'หมอเทวดา', 'หมอหัวใจเพชร', 'หมอดาวรุ่ง', 'หมอมหาเทพ'];
const CARD_DEPTS = ['pill', 'vaccine', 'xray', 'dental', 'surgery', 'eye', 'physio', 'lab', 'psych', 'massage', 'nutrition', 'prenatal', 'delivery', 'nursery'];
const deptIcon = (d) => PRODUCTS[d]?.icon || ROOMS[d]?.icon || UPPER_ROOMS[d]?.icon || '🏥';
const deptName = (d) => PRODUCTS[d]?.name || DEPTS.find((x) => x.id === d)?.name || WING_INFO[d]?.[0] || UPPER_ROOMS[d]?.name || d;
const CARD_ODDS = [[1, 50], [2, 30], [3, 13], [4, 5], [5, 2]];
const cardCost = () => Math.round((3000 * 1.3 ** Math.min(state.cardPulls || 0, 40)) / 10) * 10;
// Best card for a department: % faster service and a little more pay
function cardBonus(dept) {
  let best = 0;
  for (const c of state.cards || []) if (c.dept === dept) best = Math.max(best, c.stars * 6 + (c.lvl - 1) * 3);
  return best;
}
const cardSpeed = (dept) => 1 + cardBonus(dept) / 100;
function pullCard() {
  const cost = cardCost();
  if (state.money < cost) return;
  state.money -= cost;
  updateMoney();
  state.cardPulls = (state.cardPulls || 0) + 1;
  let r = Math.random() * 100;
  let stars = 1;
  for (const [s, w] of CARD_ODDS) {
    r -= w;
    if (r <= 0) {
      stars = s;
      break;
    }
  }
  const dept = pick(CARD_DEPTS);
  state.cards = state.cards || [];
  const same = state.cards.find((c) => c.dept === dept && c.stars === stars);
  let text;
  if (same && same.lvl < 5) {
    same.lvl++;
    text = `${same.name} ${'⭐'.repeat(stars)} เลเวลอัป → Lv.${same.lvl}`;
  } else {
    const card = { name: pick(CARD_NAMES), dept, stars, lvl: 1 };
    state.cards.push(card);
    text = `${card.name} ${'⭐'.repeat(stars)}`;
  }
  stats().cards = (stats().cards || 0) + 1;
  if (stars >= 4) burst(player.group.position);
  (stars >= 4 ? sfxUnlock : sfxCoin)();
  toast(`🃏 <b>${text}</b><br>${deptIcon(dept)} ${deptName(dept)} เร็วขึ้น +${cardBonus(dept)}%`, 3500);
  save();
  renderUpgrades();
}
function renderCards() {
  const cost = cardCost();
  const top = emEl('div', 'branchcard', `<b>🃏 สุ่มการ์ดหมอ</b><br><small>หมอแต่ละใบทำให้แผนกหนึ่งทำงานเร็วขึ้น ⭐ ยิ่งมากยิ่งเก่ง ได้ซ้ำจะเลเวลอัป<br>โอกาส: ⭐50% ⭐⭐30% ⭐⭐⭐13% ⭐⭐⭐⭐5% ⭐⭐⭐⭐⭐2%</small><br>`);
  top.append(emButton(`สุ่ม 1 ใบ · 💵${cost.toLocaleString()}`, state.money < cost, pullCard));
  upList.append(top);
  const cards = [...(state.cards || [])].sort((a, b) => b.stars - a.stars || b.lvl - a.lvl);
  if (!cards.length) upList.append(emEl('p', 'emhint', 'ยังไม่มีการ์ด ลองสุ่มดูสิ!'));
  for (const c of cards) {
    upList.append(emEl('div', `uprow card s${c.stars}`, `<div class="upico">${deptIcon(c.dept)}</div><div class="upinfo"><b>${c.name}</b> <span class="lv">Lv.${c.lvl}</span><br><small>${'⭐'.repeat(c.stars)} · ${deptName(c.dept)} เร็วขึ้น +${c.stars * 6 + (c.lvl - 1) * 3}%</small></div>`));
  }
}

// ---------- research: one project at a time, finishing in real time ----------
const RESEARCH = [
  { id: 'machine2', icon: '⚙️', name: 'เครื่องผลิตรุ่นใหม่', desc: 'เครื่องผลิตเร็ว +15%' },
  { id: 'patience', icon: '😌', name: 'ห้องรอแอร์เย็น', desc: 'คนไข้รอได้นานขึ้น +15%' },
  { id: 'tips', icon: '💖', name: 'บริการประทับใจ', desc: 'ทิปจากคนไข้ +20% (จาก ×1.2 เป็น ×1.44)' },
  { id: 'collector', icon: '💰', name: 'รถเข็นเงิน', desc: 'พนักงานเก็บเงินเดินเร็ว +30%' },
  { id: 'rush', icon: '🚨', name: 'แผนรับมือเร่งด่วน', desc: 'ชั่วโมงเร่งด่วนนานขึ้น 30 วินาที' },
  { id: 'boss', icon: '🦠', name: 'วัคซีนสูตรใหม่', desc: 'เงินรางวัลจากบอส ×2' },
  { id: 'basket', icon: '🧺', name: 'รอกไฟฟ้า', desc: 'ตะกร้าเงินขึ้นลงเร็ว ×2' },
  { id: 'special', icon: '⭐', name: 'ทีมเคสพิเศษ', desc: 'ทิปเคสพิเศษ ×1.5' },
  { id: 'icu', icon: '🫁', name: 'เครื่องมือ ICU ทันสมัย', desc: 'ดูแลไอซียูเร็วขึ้น +25%' },
  { id: 'rating', icon: '🏅', name: 'มาตรฐานโรงพยาบาล', desc: 'คะแนนดาวไม่ต่ำกว่า 3.5' },
  { id: 'tax', icon: '🏛️', name: 'ระบบภาษีออนไลน์', desc: 'ภาษีอาณาจักร +20%' },
  { id: 'offline', icon: '🌙', name: 'เวรกลางคืน', desc: 'รายได้ตอนไม่อยู่ 35% → 50%' },
];
RESEARCH.forEach((r, i) => Object.assign(r, { cost: Math.round((20000 * 1.6 ** i) / 100) * 100, time: 90 + i * 45 }));
const researched = (id) => Boolean(state.research?.done?.includes(id));
const offlineRate = () => (researched('offline') ? 0.5 : OFFLINE_RATE);
function startResearch(r) {
  const R = state.research;
  if (R.cur || researched(r.id) || state.money < r.cost) return;
  state.money -= r.cost;
  updateMoney();
  R.cur = { id: r.id, until: Date.now() + r.time * 1000 };
  sfxUnlock();
  save();
  renderUpgrades();
}
function updateResearch() {
  const R = state.research;
  if (!R?.cur || Date.now() < R.cur.until) return;
  const r = RESEARCH.find((x) => x.id === R.cur.id);
  R.done.push(R.cur.id);
  R.cur = null;
  stats().research = (stats().research || 0) + 1;
  sfxUnlock();
  toast(`🧪 <b>วิจัยสำเร็จ!</b><br>${r.icon} ${r.name}: ${r.desc}`, 4500);
  save();
  if (upPanel.style.display === 'flex' && upTab === 'research') renderUpgrades();
}
function renderResearch() {
  const R = state.research;
  if (R.cur) {
    const r = RESEARCH.find((x) => x.id === R.cur.id);
    const left = Math.max(0, (R.cur.until - Date.now()) / 1000);
    const pct = 100 * (1 - left / r.time);
    upList.append(emEl('div', 'branchcard', `<b>🧪 กำลังวิจัย: ${r.icon} ${r.name}</b><br><div class="mbar"><div style="width:${pct}%"></div></div><small>เหลือ ${formatDuration(left) || `${Math.ceil(left)} วินาที`} (ทำต่อแม้ปิดเกม)</small>`));
  } else {
    upList.append(emEl('p', 'emhint', 'เลือกวิจัยได้ทีละอย่าง งานวิจัยเดินต่อแม้ปิดเกม (เริ่มใหม่เมื่อเกิดใหม่)'));
  }
  for (const r of RESEARCH) {
    const done = researched(r.id);
    const row = emEl('div', 'uprow', `<div class="upico">${r.icon}</div><div class="upinfo"><b>${r.name}</b><br><small>${r.desc} · ใช้เวลา ${formatDuration(r.time) || `${r.time} วินาที`}</small></div>`);
    row.append(emButton(done ? 'สำเร็จ ✓' : `💵${r.cost.toLocaleString()}`, done || Boolean(R.cur) || state.money < r.cost, () => startResearch(r)));
    upList.append(row);
  }
}
let upTab = 'up';

// ---------- epidemic in the city: stand at each sick building to vaccinate it ----------
const epi = { on: null, timer: rand(240, 360) };
function startEpidemic() {
  const built = district.plots.map((p, i) => (emp().plots[i] ? i : -1)).filter((i) => i >= 0);
  if (built.length < 3) return false;
  const sick = [];
  while (sick.length < Math.min(3, built.length)) {
    const i = pick(built);
    if (!sick.includes(i)) sick.push(i);
  }
  const marks = sick.map((i) => {
    const g = germModel(0x9ef01a, 0x55a630);
    g.scale.setScalar(0.45);
    g.position.set(district.plots[i].at.x, 4.2, district.plots[i].at.z);
    scene.add(g);
    return g;
  });
  epi.on = { sick, marks, cured: [], t: 120, stand: 0 };
  tone(220, 0.3, 'sawtooth', 0.04);
  toast('🦠 <b>โรคระบาดในเมืองหมอ!</b><br>ไปยืนวงฟ้าหน้าตึกที่มีเชื้อเพื่อฉีดวัคซีน (2 นาที)', 4500);
  return true;
}
function endEpidemic(win) {
  const o = epi.on;
  for (const m of o.marks) scene.remove(m);
  epi.on = null;
  epi.timer = rand(300, 480);
  if (win) {
    const bonus = Math.round(((500 + 100 * state.step) * branchMult()) / 10) * 10;
    addMoney(bonus);
    stats().epidemics = (stats().epidemics || 0) + 1;
    burst(player.group.position);
    sfxUnlock();
    toast(`💉 <b>หยุดโรคระบาดได้!</b> โบนัส +${bonus.toLocaleString()}`, 4000);
  } else {
    changeRating(-0.3);
    toast('😷 โรคระบาดลุกลาม ⭐ ลดลง ครั้งหน้ารีบไปฉีดวัคซีนนะ', 4000);
  }
}
const epiTargets = () => (epi.on ? epi.on.sick.filter((i) => !epi.on.cured.includes(i)) : []);
function updateEpidemic(dt) {
  if (!district.built) return;
  if (!epi.on) {
    if (tutorialDone() && running) {
      epi.timer -= dt;
      if (epi.timer <= 0 && !startEpidemic()) epi.timer = 120;
    }
    return;
  }
  const o = epi.on;
  o.t -= dt;
  const now = performance.now() / 1000;
  o.marks.forEach((m, k) => {
    m.visible = !o.cured.includes(o.sick[k]);
    m.position.y = 4.2 + Math.sin(now * 2 + k) * 0.3;
    m.rotation.y = now;
  });
  const here = epiTargets().find((i) => player.floor === 0 && flatDist(player.group.position, plotZone(district.plots[i].at)) < ZONE_R);
  if (here !== undefined) {
    o.stand += dt;
    if (o.stand > 2) {
      o.stand = 0;
      o.cured.push(here);
      sfxCoin();
      floatText(district.plots[here].at.clone().setY(2), '💉 หายแล้ว!', '#8be08f');
    }
  } else {
    o.stand = 0;
  }
  if (!epiTargets().length) endEpidemic(true);
  else if (o.t <= 0) endEpidemic(false);
}

// ---------- day and night, following the phone's clock ----------
let dayNightOn = true;
try {
  dayNightOn = localStorage.getItem('drquest-daynight') !== 'off';
} catch {
  // Storage blocked: on
}
const NIGHT_SKY = new THREE.Color(0x0f1a3a);
const dayBase = { sky: new THREE.Color(), hemi: 1.4, sun: 1.9, f: -1 };
// 1 = full day, 0 = night; dawn 5-7, dusk 17:30-19:30
function daylight() {
  if (!dayNightOn) return 1;
  const d = new Date();
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 7 && h <= 17.5) return 1;
  if (h >= 19.5 || h <= 5) return 0;
  return h < 12 ? (h - 5) / 2 : (19.5 - h) / 2;
}
const isNight = () => daylight() < 0.5;
function updateDayNight() {
  const f = daylight();
  if (Math.abs(f - dayBase.f) < 0.01) return;
  dayBase.f = f;
  const th = themeOf(state.branch);
  dayBase.sky.set(th.sky).lerp(NIGHT_SKY, (1 - f) * (th.night ? 0.5 : 0.85));
  scene.background.copy(dayBase.sky);
  scene.fog.color.copy(dayBase.sky);
  const base = th.night ? 0.75 : 1.4;
  hemiLight.intensity = base * (0.5 + 0.5 * f);
  sun.intensity = (th.night ? 0.9 : 1.9) * (0.35 + 0.65 * f);
  // Lit windows after dark, and more emergencies at night
  mat(0x7fc8f8).color.set(f < 0.5 ? 0xffe08a : 0x7fc8f8);
  PATIENT_TYPES.emergency.weight = f < 0.5 ? 24 : 12;
}

// ---------- Loy Krathong festival (10-30 November) ----------
const krathongSeason = () => {
  const d = new Date();
  return location.search.includes('krathong=1') || (d.getMonth() === 10 && d.getDate() >= 10 && d.getDate() <= 30);
};
const KT = { built: false, lanterns: [], cash: null, stallAt: v(11.2, 14.6), sold: 0, floats: [] };
function krathongModel(scale = 1) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.3, 0.14, 12), mat(0x52b788));
  base.position.y = 0.07;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 8), mat(0xff8fab));
  cone.position.y = 0.32;
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
  flame.position.y = 0.6;
  g.add(base, cone, flame);
  g.scale.setScalar(scale);
  return g;
}
function buildKrathong() {
  if (KT.built || !krathongSeason()) return;
  KT.built = true;
  // String lights along the front wall and the entrance arch
  const colors = [0xff595e, 0xffca3a, 0x8ac926, 0x1982c4, 0x6a4c93];
  const lights = new THREE.Group();
  for (let x = FLOOR.x0; x <= FLOOR.x1; x += 0.6) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), new THREE.MeshBasicMaterial({ color: colors[Math.round(x / 0.6 + 100) % colors.length] }));
    b.position.set(x, 0.75 + Math.sin(x * 2) * 0.05, FLOOR.z1 + 0.32);
    lights.add(b);
  }
  for (let x = 4.6; x <= 9; x += 0.4) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), new THREE.MeshBasicMaterial({ color: colors[Math.round(x / 0.4) % colors.length] }));
    b.position.set(x, 3.75, FLOOR.z1 + 0.32);
    lights.add(b);
  }
  scene.add(lights);
  // Krathong stall by the entrance
  const stall = new THREE.Group();
  const table = box(2.2, 0.8, 0.9, 0xa0703c);
  table.position.y = 0.4;
  stall.add(table);
  for (let i = 0; i < 4; i++) {
    const k = krathongModel(0.8);
    k.position.set(-0.75 + i * 0.5, 0.8, 0);
    stall.add(k);
  }
  const roof = box(2.6, 0.12, 1.4, 0xff8fab);
  roof.position.y = 2.1;
  for (const dx of [-1.2, 1.2]) {
    const post = box(0.08, 2.1, 0.08, 0xffffff);
    post.position.set(dx, 1.05, 0.5);
    stall.add(post);
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.55), new THREE.MeshBasicMaterial({ map: signTex('🏮 ร้านกระทง', '#d6336c'), side: THREE.DoubleSide }));
  sign.position.set(0, 2.6, 0.5);
  stall.add(roof, sign);
  stall.position.copy(KT.stallAt);
  scene.add(stall);
  addCollider(KT.stallAt.x, KT.stallAt.z, 2.2, 0.9);
  KT.cash = new MoneyPile(v(KT.stallAt.x - 2.0, 14.7));
  // Sky lanterns drifting up all over
  for (let i = 0; i < 26; i++) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.5, 8), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
    l.position.set(rand(-25, 25), rand(2, 26), rand(-22, 30));
    l.userData.speed = rand(0.5, 1.1);
    scene.add(l);
    KT.lanterns.push(l);
  }
  // Free festival outfit
  if (!ownsStyle('thai')) {
    state.style.outfits.push('thai');
    setTimeout(() => toast('🏮 <b>เทศกาลลอยกระทง!</b><br>ได้ชุดไทยฟรี ใส่ได้ที่ 🎨 ตกแต่ง<br><small>ร้านกระทงหน้า รพ. ขายดีมาก</small>', 6000), 2500);
  }
}
function updateKrathong(dt) {
  if (!KT.built) return;
  const t = performance.now() / 1000;
  for (const l of KT.lanterns) {
    l.position.y += l.userData.speed * dt * 0.6;
    l.position.x += Math.sin(t * 0.3 + l.position.z) * dt * 0.2;
    if (l.position.y > 30) l.position.y = 1;
  }
  if (OUT.park && KT.floats.length < 5) {
    const k = krathongModel(0.6);
    k.userData.a = rand(0, Math.PI * 2);
    scene.add(k);
    KT.floats.push(k);
  }
  KT.floats.forEach((k, i) => {
    k.userData.a += dt * 0.25;
    k.position.set(14.8 + Math.cos(k.userData.a + i) * 1.0, 0.05, 23.6 + Math.sin(k.userData.a + i) * 1.0);
  });
}
// Happy patients going home buy a krathong
function sellKrathong() {
  if (!KT.built || Math.random() > 0.4) return;
  const pay = Math.round(15 * priceMult() * eventPayMult());
  KT.cash.add(pay);
  KT.sold++;
  stats().krathong = (stats().krathong || 0) + 1;
  floatText(KT.cash.pos, `🏮 +${pay}`, '#ffb3c7');
}

// ---------- health quiz: three real health questions a day ----------
const QUIZ = [
  ['ล้างมือด้วยสบู่ ควรถูมือให้ทั่วอย่างน้อยกี่วินาที?', ['5 วินาที', '10 วินาที', '20 วินาที', '2 นาที'], 2, 'ควรถูมือด้วยสบู่ให้ทั่วอย่างน้อย 20 วินาที ทั้งฝ่ามือ หลังมือ ซอกนิ้ว และปลายนิ้ว'],
  ['หมายเลขโทรเรียกรถพยาบาลฉุกเฉินในประเทศไทยคือ?', ['191', '199', '1669', '1323'], 2, '1669 คือสายด่วนการแพทย์ฉุกเฉิน (191 ตำรวจ, 199 ดับเพลิง, 1323 สุขภาพจิต)'],
  ['ความดันโลหิตปกติของผู้ใหญ่ ควรต่ำกว่าเท่าไร?', ['120/80 มม.ปรอท', '140/90 มม.ปรอท', '160/100 มม.ปรอท', '180/110 มม.ปรอท'], 0, 'ความดันที่เหมาะสมคือต่ำกว่า 120/80 มม.ปรอท ถ้าตั้งแต่ 140/90 ขึ้นไปถือว่าความดันสูง'],
  ['ผู้ใหญ่ควรนอนหลับคืนละประมาณกี่ชั่วโมง?', ['3–4 ชั่วโมง', '5 ชั่วโมง', '7–9 ชั่วโมง', '12 ชั่วโมงขึ้นไป'], 2, 'ผู้ใหญ่ส่วนใหญ่ควรนอน 7–9 ชั่วโมงต่อคืน'],
  ['การทำ CPR ผู้ใหญ่ ควรกดหน้าอกด้วยอัตรากี่ครั้งต่อนาที?', ['40–60 ครั้ง', '60–80 ครั้ง', '100–120 ครั้ง', '150–180 ครั้ง'], 2, 'กดหน้าอก 100–120 ครั้งต่อนาที ลึกประมาณ 5–6 ซม. และปล่อยให้หน้าอกคืนตัวทุกครั้ง'],
  ['การทำ CPR ผู้ใหญ่ ควรกดหน้าอกลึกประมาณเท่าไร?', ['1–2 ซม.', '3 ซม.', '5–6 ซม.', '10 ซม.'], 2, 'กดลึกประมาณ 5–6 ซม. (2–2.4 นิ้ว) สำหรับผู้ใหญ่'],
  ['ระดับน้ำตาลในเลือดหลังอดอาหาร 8 ชั่วโมง ตั้งแต่เท่าไรถือว่าเป็นเบาหวาน?', ['80 มก./ดล.', '100 มก./ดล.', '126 มก./ดล.', '300 มก./ดล.'], 2, 'น้ำตาลหลังอดอาหารตั้งแต่ 126 มก./ดล. ขึ้นไป (ตรวจซ้ำ) เข้าเกณฑ์เบาหวาน'],
  ['องค์การอนามัยโลกแนะนำให้ผู้ใหญ่ออกกำลังกายระดับปานกลางอย่างน้อยสัปดาห์ละกี่นาที?', ['30 นาที', '60 นาที', '150 นาที', '1,000 นาที'], 2, 'อย่างน้อย 150–300 นาทีต่อสัปดาห์ เช่น เดินเร็ววันละ 30 นาที 5 วัน'],
  ['ยาปฏิชีวนะ (ยาฆ่าเชื้อ) ใช้รักษาอะไร?', ['หวัดจากไวรัส', 'การติดเชื้อแบคทีเรีย', 'ภูมิแพ้', 'ปวดหัวจากความเครียด'], 1, 'ยาปฏิชีวนะรักษาการติดเชื้อแบคทีเรีย ไม่ได้ช่วยไข้หวัดจากไวรัส ใช้พร่ำเพรื่อทำให้เชื้อดื้อยา'],
  ['ค่าดัชนีมวลกาย (BMI) ที่ถือว่าปกติสำหรับคนเอเชียคือ?', ['ต่ำกว่า 16', '18.5–22.9', '25–29.9', '30 ขึ้นไป'], 1, 'สำหรับคนเอเชีย BMI 18.5–22.9 ถือว่าปกติ ตั้งแต่ 23 ขึ้นไปเริ่มน้ำหนักเกิน'],
  ['โดนน้ำร้อนลวกเล็กน้อย ควรทำอะไรเป็นอย่างแรก?', ['ทายาสีฟัน', 'ให้น้ำสะอาดอุณหภูมิห้องไหลผ่านนาน ๆ', 'ทาเนยหรือน้ำปลา', 'ประคบน้ำแข็งตรง ๆ'], 1, 'ให้น้ำเย็นธรรมดาไหลผ่านแผลประมาณ 20 นาที ห้ามทายาสีฟัน เนย หรือประคบน้ำแข็งตรง ๆ'],
  ['ข้อใด "ไม่ใช่" อาการเตือนโรคหลอดเลือดสมอง?', ['หน้าเบี้ยว ปากเบี้ยว', 'แขนขาอ่อนแรงซีกเดียว', 'พูดไม่ชัดทันที', 'ไอมีเสมหะ'], 3, 'จำ BEFAST: เสียการทรงตัว ตามัว หน้าเบี้ยว แขนอ่อนแรง พูดไม่ชัด รีบโทร 1669 ทันที'],
  ['วัคซีนไข้หวัดใหญ่ควรฉีดบ่อยแค่ไหน?', ['ครั้งเดียวตลอดชีวิต', 'ทุกปี', 'ทุก 10 ปี', 'ไม่ต้องฉีด'], 1, 'เชื้อไข้หวัดใหญ่เปลี่ยนสายพันธุ์บ่อย จึงควรฉีดทุกปี'],
  ['ท้องเสีย ควรดื่มอะไรเพื่อป้องกันการขาดน้ำ?', ['น้ำอัดลม', 'ผงเกลือแร่ ORS', 'กาแฟ', 'เครื่องดื่มชูกำลัง'], 1, 'ORS (โออาร์เอส) ชดเชยน้ำและเกลือแร่ได้ดีที่สุด น้ำอัดลมหวานเกินอาจทำให้ถ่ายมากขึ้น'],
  ['ชีพจรปกติของผู้ใหญ่ขณะพัก ประมาณกี่ครั้งต่อนาที?', ['30–50', '60–100', '120–150', '160–200'], 1, 'ชีพจรขณะพักปกติประมาณ 60–100 ครั้งต่อนาที'],
  ['อุณหภูมิร่างกายตั้งแต่เท่าไรขึ้นไปถือว่ามีไข้ (วัดทางปาก)?', ['36.0°C', '36.5°C', '37.5°C', '39.5°C'], 2, 'ตั้งแต่ประมาณ 37.5°C ขึ้นไปถือว่ามีไข้'],
  ['ควรแปรงฟันอย่างน้อยวันละกี่ครั้ง?', ['1 ครั้ง', '2 ครั้ง', '5 ครั้ง', 'ไม่ต้องทุกวัน'], 1, 'แปรงฟันอย่างน้อยวันละ 2 ครั้ง ครั้งละ 2 นาที ด้วยยาสีฟันผสมฟลูออไรด์'],
  ['ไข้เลือดออกติดต่อผ่านยุงชนิดใด?', ['ยุงลาย', 'ยุงก้นปล่อง', 'ยุงรำคาญ', 'แมลงวัน'], 0, 'ยุงลายเป็นพาหะไข้เลือดออก ช่วยกันกำจัดแหล่งน้ำขังรอบบ้าน (ยุงก้นปล่องเป็นพาหะมาลาเรีย)'],
  ['สงสัยไข้เลือดออก ควรหลีกเลี่ยงยาลดไข้ชนิดใด?', ['พาราเซตามอล', 'แอสไพรินและไอบูโพรเฟน', 'การเช็ดตัวลดไข้', 'ผงเกลือแร่'], 1, 'แอสไพรินและยากลุ่ม NSAIDs เพิ่มความเสี่ยงเลือดออก ให้ใช้พาราเซตามอลตามขนาดและพบแพทย์'],
  ['ผู้ใหญ่สุขภาพดี ไม่ควรกินพาราเซตามอลเกินวันละกี่กรัม?', ['1 กรัม', '4 กรัม', '10 กรัม', 'ไม่จำกัด'], 1, 'ไม่ควรเกินวันละ 4 กรัม (500 มก. 8 เม็ด) เกินขนาดอาจทำลายตับ'],
  ['ควรฉีดวัคซีนบาดทะยักกระตุ้นทุกกี่ปี?', ['ทุกปี', 'ทุก 10 ปี', 'ครั้งเดียวพอ', 'ทุก 30 ปี'], 1, 'ผู้ใหญ่ควรฉีดกระตุ้นบาดทะยักทุก 10 ปี'],
  ['กฎ 20-20-20 เพื่อพักสายตาจากจอคืออะไร?', ['ทุก 20 นาที มองไกล 20 ฟุต นาน 20 วินาที', 'นอน 20 นาทีทุก 20 ชั่วโมง', 'กะพริบตา 20 ครั้ง', 'ดูจอห่าง 20 ซม.'], 0, 'ทุก 20 นาที ให้มองไกลประมาณ 20 ฟุต (6 เมตร) นานอย่างน้อย 20 วินาที'],
  ['หญิงตั้งครรภ์ควรได้รับกรดโฟลิก เพื่อช่วยป้องกันอะไรในทารก?', ['ฟันผุ', 'ความพิการของท่อประสาท', 'ผมร่วง', 'สายตาสั้น'], 1, 'กรดโฟลิกช่วยลดความเสี่ยงความพิการแต่กำเนิดของท่อประสาท ควรเริ่มก่อนตั้งครรภ์'],
  ['ทารกควรกินนมแม่อย่างเดียว (ไม่ต้องให้น้ำหรืออาหารอื่น) ถึงอายุกี่เดือน?', ['1 เดือน', '3 เดือน', '6 เดือน', '12 เดือน'], 2, 'แนะนำนมแม่อย่างเดียว 6 เดือน แล้วเริ่มอาหารตามวัยควบคู่นมแม่'],
  ['ถ้าเพื่อนบอกว่าไม่อยากมีชีวิตอยู่ ควรทำอย่างไร?', ['เพิกเฉย เดี๋ยวก็หาย', 'รับฟังอย่างใส่ใจและพาไปพบผู้เชี่ยวชาญหรือโทร 1323', 'ล้อเล่นให้หายเครียด', 'ดุให้เข้มแข็ง'], 1, 'รับฟังโดยไม่ตัดสิน อยู่เป็นเพื่อน และขอความช่วยเหลือ สายด่วนสุขภาพจิต 1323 ฟรี 24 ชม.'],
  ['การเอกซเรย์ปอดใช้อะไรสร้างภาพ?', ['รังสีเอกซ์', 'คลื่นเสียงความถี่สูง', 'สนามแม่เหล็ก', 'แสงอินฟราเรด'], 0, 'เอกซเรย์ใช้รังสีเอกซ์ ส่วนอัลตราซาวด์ใช้คลื่นเสียง และ MRI ใช้สนามแม่เหล็ก'],
  ['เครื่อง MRI สร้างภาพด้วยหลักการใด?', ['รังสีเอกซ์', 'สนามแม่เหล็กแรงสูงและคลื่นวิทยุ', 'คลื่นเสียงความถี่สูง', 'แสงเลเซอร์'], 1, 'MRI ใช้สนามแม่เหล็กแรงสูงและคลื่นวิทยุ จึงห้ามนำโลหะเข้าห้องตรวจ'],
  ['กลุ่มเลือดที่ให้เม็ดเลือดแดงแก่ผู้รับได้ทุกกลุ่ม (ผู้ให้สากล) คือ?', ['A', 'B', 'AB', 'O Rh ลบ'], 3, 'O Rh ลบ เป็นผู้ให้เม็ดเลือดแดงสากล ส่วน AB Rh บวกเป็นผู้รับสากล'],
  ['องค์การอนามัยโลกแนะนำให้กินโซเดียมไม่เกินวันละเท่าไร?', ['500 มก.', '2,000 มก.', '5,000 มก.', '10,000 มก.'], 1, 'ไม่เกิน 2,000 มก. ต่อวัน (ประมาณเกลือ 1 ช้อนชา) คนไทยมักกินเกินเกือบ 2 เท่า'],
  ['ฟันน้ำนมของเด็กมีทั้งหมดกี่ซี่?', ['10 ซี่', '20 ซี่', '28 ซี่', '32 ซี่'], 1, 'ฟันน้ำนมมี 20 ซี่ ฟันแท้ของผู้ใหญ่มี 28–32 ซี่'],
  ['กระดูกในร่างกายผู้ใหญ่มีประมาณกี่ชิ้น?', ['106 ชิ้น', '206 ชิ้น', '306 ชิ้น', '500 ชิ้น'], 1, 'ผู้ใหญ่มีกระดูกประมาณ 206 ชิ้น ทารกมีมากกว่าเพราะบางชิ้นยังไม่เชื่อมกัน'],
  ['เมื่อมีคนสำลักอาหาร พูดไม่ได้ หายใจไม่ออก ควรช่วยด้วยวิธีใด?', ['ให้ดื่มน้ำตาม', 'รัดกระตุกที่ท้อง (Heimlich)', 'ให้นอนลงพัก', 'ตบหลังเบา ๆ แล้วรอ'], 1, 'ยืนด้านหลัง กำมือวางเหนือสะดือ แล้วรัดกระตุกเข้าและขึ้นจนสิ่งอุดหลุด ถ้าหมดสติให้ทำ CPR และโทร 1669'],
];
const QUIZ_PER_DAY = 3;
function todayQuiz() {
  let h = 11;
  for (const ch of todayKey()) h = (Math.imul(h, 131) + ch.charCodeAt(0)) >>> 0;
  const picks = [];
  while (picks.length < QUIZ_PER_DAY) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const i = h % QUIZ.length;
    if (!picks.includes(i)) picks.push(i);
  }
  return picks;
}
function quizState() {
  if (state.quiz?.date !== todayKey()) state.quiz = { date: todayKey(), done: [] };
  return state.quiz;
}
const quizReward = () => Math.round((300 * (1 + state.step * 0.2) * branchMult()) / 10) * 10;
const quizEl = document.getElementById('quiz');
function openQuiz() {
  const q = quizState();
  const picks = todayQuiz();
  const box = quizEl.querySelector('.box');
  if (q.done.length >= QUIZ_PER_DAY) {
    const right = q.done.filter((d) => d.ok).length;
    box.innerHTML = `<h3>🩺 ควิซสุขภาพวันนี้</h3><p class="qtext">ตอบครบแล้ว! ถูก ${right}/${QUIZ_PER_DAY} ข้อ<br>มาใหม่พรุ่งนี้นะ</p>`;
  } else {
    const idx = picks[q.done.length];
    const [text, choices] = QUIZ[idx];
    box.innerHTML = `<h3>🩺 ควิซสุขภาพ ข้อ ${q.done.length + 1}/${QUIZ_PER_DAY}</h3><p class="qtext">${text}</p>`;
    choices.forEach((c, k) => {
      const b = emEl('button', 'btn ghost qopt', c);
      b.addEventListener('click', () => answerQuiz(idx, k));
      box.append(b);
    });
  }
  const close = emEl('button', 'btn ghost', 'ปิด');
  close.addEventListener('click', () => { quizEl.style.display = 'none'; renderMissions(); });
  box.append(close);
  quizEl.style.display = 'flex';
}
function answerQuiz(idx, k) {
  const q = quizState();
  const [, choices, ans, why] = QUIZ[idx];
  const ok = k === ans;
  q.done.push({ i: idx, ok });
  if (ok) {
    const r = quizReward();
    addMoney(r, false);
    stats().quiz = (stats().quiz || 0) + 1;
    sfxUnlock();
  } else {
    tone(200, 0.2, 'triangle', 0.05);
  }
  save();
  const box = quizEl.querySelector('.box');
  box.innerHTML = `<h3>${ok ? '✅ ถูกต้อง!' : '❌ ยังไม่ถูก'}</h3><p class="qtext">คำตอบ: <b>${choices[ans]}</b><br><small>${why}</small>${ok ? `<br><b class="qgain">+💵${quizReward().toLocaleString()}</b>` : ''}</p>`;
  const next = emEl('button', 'btn', q.done.length < QUIZ_PER_DAY ? 'ข้อต่อไป ▶' : 'ดูผล');
  next.addEventListener('click', openQuiz);
  box.append(next);
}

// ---------- achievements ----------
const stats = () => {
  if (!state.stats) state.stats = {};
  return state.stats;
};
const builtPlots = () => emp().plots.filter(Boolean).length;
const ACHIEVEMENTS = [
  { id: 'serve100', icon: '🧑‍⚕️', name: 'รักษาครบ 100 คน', ok: () => (stats().served || 0) >= 100, reward: 500 },
  { id: 'serve1k', icon: '🩺', name: 'รักษาครบ 1,000 คน', ok: () => (stats().served || 0) >= 1000, reward: 3000 },
  { id: 'serve10k', icon: '🏥', name: 'รักษาครบ 10,000 คน', ok: () => (stats().served || 0) >= 10000, reward: 25000 },
  { id: 'boss1', icon: '🦠', name: 'ล่าบอสตัวแรก', ok: () => (state.style.bossKills || 0) >= 1, reward: 1000 },
  { id: 'boss25', icon: '🦸', name: 'ล่าบอส 25 ตัว', ok: () => (state.style.bossKills || 0) >= 25, reward: 15000 },
  { id: 'special10', icon: '⭐', name: 'เคสพิเศษ 10 เคส', ok: () => (stats().specials || 0) >= 10, reward: 5000 },
  { id: 'rush10', icon: '🚨', name: 'โบนัสเร่งด่วน 10 ครั้ง', ok: () => (stats().rushes || 0) >= 10, reward: 5000 },
  { id: 'step24', icon: '🏗️', name: 'สร้างครบ 24 ขั้น', ok: () => state.step >= 24, reward: 5000 },
  { id: 'stepall', icon: '🏢', name: 'สร้างครบทุกชั้น', ok: () => state.step >= UNLOCKS.length, reward: 50000 },
  { id: 'branch3', icon: '🗺️', name: 'มี 3 สาขา', ok: () => state.branches.length >= 3, reward: 10000 },
  { id: 'branch10', icon: '🌐', name: 'มี 10 สาขา', ok: () => state.branches.length >= 10, reward: 100000 },
  { id: 'tier1', icon: '🏞️', name: 'ขึ้นเป็นจังหวัด', ok: () => emp().tier >= 1, reward: 10000 },
  { id: 'tier4', icon: '🌏', name: 'หมอแห่งโลก', ok: () => emp().tier >= 4, reward: 500000 },
  { id: 'city24', icon: '🏙️', name: 'เมือง 24 แปลง', ok: () => builtPlots() >= 24, reward: 200000 },
  { id: 'card10', icon: '🃏', name: 'สุ่มการ์ด 10 ใบ', ok: () => (stats().cards || 0) >= 10, reward: 10000 },
  { id: 'card5', icon: '✨', name: 'ได้การ์ด 5 ดาว', ok: () => (state.cards || []).some((c) => c.stars === 5), reward: 50000 },
  { id: 'research5', icon: '🧪', name: 'วิจัยสำเร็จ 5 อย่าง', ok: () => (stats().research || 0) >= 5, reward: 20000 },
  { id: 'quiz30', icon: '📚', name: 'ตอบควิซถูก 30 ข้อ', ok: () => (stats().quiz || 0) >= 30, reward: 30000 },
  { id: 'epidemic5', icon: '💉', name: 'หยุดโรคระบาด 5 ครั้ง', ok: () => (stats().epidemics || 0) >= 5, reward: 30000 },
  { id: 'prestige1', icon: '🔄', name: 'เกิดใหม่ครั้งแรก', ok: () => prs().runs >= 1, reward: 10000 },
  { id: 'krathong', icon: '🏮', name: 'ขายกระทง 30 ใบ', ok: () => (stats().krathong || 0) >= 30, reward: 15000 },
  { id: 'medal10', icon: '🎖️', name: 'เหรียญกล้าหาญ 10 เหรียญ', ok: () => (state.base?.medals || 0) >= 10, reward: 50000 },
  { id: 'defend5', icon: '🛡️', name: 'ป้องกันฐาน 5 ครั้ง', ok: () => (stats().defenses || 0) >= 5, reward: 40000 },
  { id: 'general5', icon: '⭐', name: 'ได้นายพล 5 ดาว', ok: () => (state.base?.generals || []).some((g) => g.stars === 5), reward: 80000 },
  { id: 'conquer', icon: '👑', name: 'พิชิตโลก', ok: () => conquered(), reward: 1000000 },
  { id: 'decor', icon: '🎨', name: 'ตกแต่งครบทุกอย่าง', ok: () => DECOR.every((d) => ownsStyle(d.id)), reward: 50000 },
];
let achTimer = 0;
function updateAchievements(dt) {
  achTimer -= dt;
  if (achTimer > 0) return;
  achTimer = 2;
  state.achievements = state.achievements || [];
  for (const a of ACHIEVEMENTS) {
    if (state.achievements.includes(a.id) || !a.ok()) continue;
    state.achievements.push(a.id);
    addMoney(a.reward, false);
    sfxUnlock();
    toast(`🏅 <b>ความสำเร็จใหม่!</b><br>${a.icon} ${a.name}<br><small>รางวัล 💵${a.reward.toLocaleString()}</small>`, 4500);
    save();
    break; // one at a time
  }
}
function renderAchievements(list) {
  const got = state.achievements || [];
  list.append(emEl('h4', 'achhead', `🏅 ความสำเร็จ ${got.length}/${ACHIEVEMENTS.length}`));
  const wall = emEl('div', 'achwall');
  for (const a of ACHIEVEMENTS) {
    const el = emEl('div', `ach${got.includes(a.id) ? ' got' : ''}`, `${a.icon}<small>${a.name}</small>`);
    wall.append(el);
  }
  list.append(wall);
}

// ---------- friend room: weekly score and daily gifts ----------
function weekKey() {
  const d = new Date();
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - y0) / 86400000 + 1) / 7)).padStart(2, '0')}`;
}
function weekProgress(n) {
  if (state.week?.key !== weekKey()) state.week = { key: weekKey(), score: 0 };
  state.week.score += n;
}
async function sendRoomGift() {
  try {
    const n = await rpc('send_room_gift', { p_secret: deviceSecret(), p_room: state.room });
    if (n === -1) toast('🎁 วันนี้ส่งของขวัญไปแล้ว พรุ่งนี้ส่งใหม่ได้');
    else toast(`🎁 ส่งของขวัญให้เพื่อน ${n} คนแล้ว!`);
  } catch {
    toast('🎁 ยังส่งของขวัญไม่ได้ ลองใหม่อีกครั้ง');
  }
}
async function claimGifts() {
  if (CLOUD_OFF) return;
  try {
    const rows = await rpc('claim_gifts', { p_secret: deviceSecret() });
    if (!rows?.length) return;
    const each = Math.round(Math.max(500, idleIncome(3600).perHour * 0.05) / 10) * 10;
    addMoney(each * rows.length, false);
    sfxUnlock();
    const names = [...new Set(rows.map((r) => r.from_name))].slice(0, 3).map(escapeHtml).join(', ');
    toast(`🎁 <b>ได้ของขวัญ ${rows.length} ชิ้น!</b><br>จาก ${names}<br><b>+${(each * rows.length).toLocaleString()}</b>`, 5000);
    save();
  } catch {
    // Not available yet: try again later
  }
}

// ---------- share a picture of your hospital ----------
const shareEl = document.getElementById('share');
function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
async function makeShareCard() {
  // Bird's-eye shot over the hospital, rendered on demand
  const saved = { zoom: camZoom, pos: player.group.position.clone(), vis: visibleFloor() };
  showFloor(0);
  player.group.position.set(-3, 0, 2);
  setZoom(2.4);
  updateCamera(0, true);
  renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);
  const shot = await loadImage(renderer.domElement.toDataURL('image/jpeg', 0.92));
  player.group.position.copy(saved.pos);
  showFloor(saved.vis);
  setZoom(saved.zoom);
  updateCamera(0, true);
  const W = 1080;
  const H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#63c7ff');
  grad.addColorStop(1, '#2f9e57');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const logo = await loadImage('logo.png');
  if (logo) g.drawImage(logo, (W - 760) / 2, 40, 760, (760 * logo.height) / logo.width);
  if (shot) {
    const sw = 980;
    const sh = 640;
    g.save();
    roundRect(g, (W - sw) / 2, 270, sw, sh, 36);
    g.clip();
    const s = Math.max(sw / shot.width, sh / shot.height);
    g.drawImage(shot, (W - shot.width * s) / 2, 270 + (sh - shot.height * s) / 2, shot.width * s, shot.height * s);
    g.restore();
    g.strokeStyle = '#ffd166';
    g.lineWidth = 10;
    roundRect(g, (W - sw) / 2, 270, sw, sh, 36);
    g.stroke();
  }
  const t = EMPIRE_TIERS[emp().tier];
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.font = '700 64px Mitr, sans-serif';
  let name = cloud.nickname && cloud.nickname !== 'หมอนิรนาม' ? cloud.nickname : '';
  try {
    name = name || localStorage.getItem('drquest-name') || '';
  } catch {
    // ignore
  }
  g.fillText(name || 'โรงพยาบาลของฉัน', W / 2, 1000);
  g.font = '500 40px Mitr, sans-serif';
  g.fillText(`${t.icon} ${t.title} · ${state.branches.length} สาขา · ⭐ ${state.rating.toFixed(1)}`, W / 2, 1065);
  g.fillText(`💵 รายได้สะสม ${Math.floor(state.earned).toLocaleString()} · 🏅 ${(state.achievements || []).length} ความสำเร็จ`, W / 2, 1125);
  g.fillStyle = '#ffd166';
  roundRect(g, 140, 1185, W - 280, 100, 50);
  g.fill();
  g.fillStyle = '#1d3a70';
  g.font = '700 40px Mitr, sans-serif';
  g.fillText('▶ เล่นฟรี niasmin.github.io/Quest-Finance', W / 2, 1250);
  return c;
}
async function shareHospital() {
  shareEl.style.display = 'flex';
  const box = shareEl.querySelector('.box');
  box.innerHTML = '<h3>📸 แชร์โรงพยาบาลของฉัน</h3><p class="qtext">กำลังถ่ายรูป…</p>';
  const canvas = await makeShareCard();
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
  const url = URL.createObjectURL(blob);
  const text = `มาดูอาณาจักรของฉันใน Dr. Quest World! เล่นฟรีบนมือถือ 🏥 ${location.origin}${location.pathname}`;
  box.innerHTML = `<h3>📸 แชร์โรงพยาบาลของฉัน</h3><img class="shareimg" src="${url}" alt="">`;
  const file = new File([blob], 'dr-quest.jpg', { type: 'image/jpeg' });
  if (navigator.canShare?.({ files: [file] })) {
    const sh = emEl('button', 'btn', '📤 แชร์ไป Facebook / LINE');
    sh.addEventListener('click', () => navigator.share({ files: [file], text }).catch(() => {}));
    box.append(sh);
  }
  const dl = emEl('a', 'btn ghost', '💾 บันทึกรูป');
  dl.href = url;
  dl.download = 'dr-quest.jpg';
  const cp = emEl('button', 'btn ghost', '📋 คัดลอกข้อความชวนเพื่อน');
  cp.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      cp.textContent = '✅ คัดลอกแล้ว';
    } catch {
      prompt('คัดลอกข้อความนี้', text);
    }
  });
  const close = emEl('button', 'btn ghost', 'ปิด');
  close.addEventListener('click', () => { shareEl.style.display = 'none'; });
  box.append(dl, cp, close);
}

function updateExtras(dt) {
  updateResearch();
  updateEpidemic(dt);
  updateKrathong(dt);
  updateAchievements(dt);
}

// ---------- Healthcare Empire campus: the art of the Healthcare-Simulator-Starter project,
// laid out east of the hospital like its world map. Buildings are bought by standing on
// their price tiles; each then fills a cash pile. Cars and townsfolk bring it to life.
const CAMPUS_X = 20; // the campus avenue, running north from the main road
const CAMPUS_STREETS = [-9, 4]; // cross streets heading east from the avenue
const campusSprites = { info: null, tex: new Map() };
fetch('campus/sprites.json').then((r) => r.json()).then((j) => { campusSprites.info = j; }).catch(() => {});
const campusLoader = new THREE.TextureLoader();
function campusTex(name) {
  if (!campusSprites.tex.has(name)) {
    const t = campusLoader.load(`campus/${name}.webp`);
    t.colorSpace = THREE.SRGBColorSpace;
    campusSprites.tex.set(name, t);
  }
  return campusSprites.tex.get(name);
}
// A billboard of one sprite, `w` world units wide, standing at its base
function campusSprite(name, w, base = 0.28) {
  const m = new THREE.SpriteMaterial({ map: campusTex(name), transparent: true, alphaTest: 0.04, depthWrite: false });
  const s = new THREE.Sprite(m);
  const size = campusSprites.info?.[name];
  const aspect = size ? size[1] / size[0] : 0.6;
  s.scale.set(w, w * aspect, 1);
  s.center.set(0.5, base);
  s.userData.sprite = name;
  // Fix the height once the size table arrives (first load)
  if (!size) {
    const fix = () => {
      const sz = campusSprites.info?.[name];
      if (sz) s.scale.set(w, (w * sz[1]) / sz[0], 1);
      else setTimeout(fix, 300);
    };
    setTimeout(fix, 300);
  }
  return s;
}
const CAMPUS_LOTS = [
  { id: 'homecare', icon: '🏠', name: 'Home Care ดูแลถึงบ้าน', sprite: 'b_homecare_office_4x3', at: v(27, 10), w: 8.5, front: v(27, 5.3), price: 15000, rate: 30, foot: [6, 4] },
  { id: 'derma', icon: '💊', name: 'CM.Derma+ ผลิตภัณฑ์ผิว', sprite: 'b_pharmacy_2x2', extra: ['b_storage_room_2x2', 2.2, 0], at: v(36, 10.5), w: 5.8, front: v(36, 5.3), price: 25000, rate: 50, foot: [4, 3.4] },
  { id: 'park', icon: '🌳', name: 'Community Park สวนชุมชน', sprite: 'dc_gazebo', at: v(44, 10.5), w: 4, front: v(44, 5.3), price: 20000, rate: 20, park: true, foot: [2.6, 2.6] },
  { id: 'tranquila', icon: '🌿', name: 'Tranquila บ้านพักผู้สูงวัย', sprite: 'b_villa_3x3', extra: ['dc_thai_house', -3.6, 1.0, 3], at: v(42, -2.6), w: 8, front: v(42, 2.9), price: 40000, rate: 75, foot: [6, 4.2] },
  { id: 'cmnh', icon: '🏡', name: 'CMNH ศูนย์ดูแลผู้สูงอายุ', sprite: 'b_ward_5x6', at: v(29, -2.4), w: 12, front: v(29, 2.9), price: 90000, rate: 150, foot: [9, 5.5] },
  { id: 'phc', icon: '🎓', name: 'PHC ศูนย์พัฒนาบุคลากร', sprite: 'b_training_room_2x3', extra: ['b_staff_room_2x3', 3.0, 0.5], at: v(42, -17.5), w: 6.5, front: v(42, -10.2), price: 60000, rate: 100, foot: [5, 3.6] },
  { id: 'neuro', icon: '🧠', name: 'Neuro Hospital รพ.ประสาท', sprite: 'b_neuro_clinic_4x3', extra: ['b_stroke_unit_4x3', 6.5, -1.0, 9], at: v(28, -17.5), w: 9.5, front: v(30, -10.2), price: 150000, rate: 240, foot: [12, 4.6] },
];
const CAMPUS_OPEN_STEP = 16; // the elevator stage
const campus = { built: false, owned: [], paid: {}, cash: {}, piles: {}, tiles: {}, cars: [], folk: [], carTimer: 2, tipShown: false };
const campusOpen = () => state.step >= CAMPUS_OPEN_STEP;
const campusPiles = () => Object.values(campus.piles);
const inCampus = (p) => p.x > CAMPUS_X - 1.4 && p.x < 60 && p.z < ROAD_Z - 1.6 && p.z > -28.6;

function campusGround() {
  const g = new THREE.Group();
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(29, 42), mat(0x9bd67a));
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(33.5, 0.012, -5.5);
  lawn.receiveShadow = true;
  g.add(lawn);
  const road = (x, z, w, d) => {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(0x55606e));
    r.rotation.x = -Math.PI / 2;
    r.position.set(x, 0.022, z);
    r.receiveShadow = true;
    g.add(r);
  };
  road(CAMPUS_X, -5, 2.6, 42);
  for (const z of CAMPUS_STREETS) road(33.5, z, 27, 2.4);
  for (let z = -24; z < 15; z += 3) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 1.3), mat(0xffffff));
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(CAMPUS_X, 0.03, z);
    g.add(dash);
  }
  // Gate sign over the avenue
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 0.85), new THREE.MeshBasicMaterial({ map: signTex('🏥 Healthcare Empire Campus', '#14b8a6'), side: THREE.DoubleSide }));
  sign.position.set(CAMPUS_X, 3.3, 14.6);
  g.add(sign);
  for (const dx of [-2.4, 2.4]) {
    const post = box(0.24, 3.5, 0.24, 0xffffff);
    post.position.set(CAMPUS_X + dx, 1.75, 14.6);
    g.add(post);
  }
  scene.add(g);
  // Street furniture and town buildings from the starter's art
  const put = (name, x, z, w, base) => {
    const s = campusSprite(name, w, base);
    s.position.set(x, 0, z);
    scene.add(s);
    return s;
  };
  for (let z = -22; z <= 12; z += 6) put('st3_lamp', CAMPUS_X - 1.7, z, 0.9, 0.05);
  put('st3_busstop', CAMPUS_X - 1.9, 9, 2.2, 0.08);
  put('st3_spirit', 46.5, -24, 1.4, 0.08);
  [[24, -24.5, 'dc_tree'], [46, -12, 'dc_tree2'], [23, -6, 'dc_sakura'], [46, 1.5, 'dc_tree'], [23.5, 7, 'dc_tree2'], [47, 7.8, 'dc_sakura'], [32, 14.4, 'dc_hedge'], [40, 14.4, 'dc_hedge'], [24, 14.3, 'dc_planter']]
    .forEach(([x, z, n]) => put(n, x, z, n.includes('hedge') ? 3 : 2.2, 0.12));
  // A little town strip across the main road
  [['tw_temple', 25, 21.5, 6], ['tw_cafe', 32, 21, 4.4], ['tw_shop_1', 38, 21.5, 4.2], ['tw_shop_2', 43, 21.5, 4.2], ['tw_store', 26, 26.5, 4.2], ['tw_house_a1', 33, 26.5, 4], ['tw_house_b1', 39, 26.5, 4], ['tw_house_a2', 45, 26.5, 4]]
    .forEach(([n, x, z, w]) => {
      put(n, x, z, w, 0.18);
      addCollider(x, z, w * 0.6, w * 0.4);
    });
}

function buildCampus() {
  if (campus.built) return;
  campus.built = true;
  campusGround();
  for (const lot of CAMPUS_LOTS) {
    campus.piles[lot.id] = new MoneyPile(lot.front.clone().add(v(1.6, 0)));
    if (campus.owned.includes(lot.id)) buildCampusLot(lot, false);
    else makeCampusTile(lot);
  }
  for (const [id, amt] of Object.entries(campus.cash)) campus.piles[id]?.add(amt);
}
function buildCampusLot(lot, animate) {
  // Sprites go in a group: the pop-in animation scales the group, not the sprites' own sizes
  const g = new THREE.Group();
  g.position.copy(lot.at);
  g.add(campusSprite(lot.sprite, lot.w));
  if (lot.extra) {
    const [name, dx, dz, w] = lot.extra;
    const e = campusSprite(name, w || lot.w * 0.85);
    e.position.set(dx, 0, dz);
    g.add(e);
  }
  if (lot.park) {
    [['dc_fountain', -1.8, -1.4, 2.2], ['dc_flowers', 1.6, 1.0, 2], ['dc_sala3d', 2.4, -1.6, 2.2], ['dc_umbrella', -2.6, 1.2, 1.6]].forEach(([n, dx, dz, w]) => {
      const d = campusSprite(n, w, 0.15);
      d.position.set(dx, 0, dz);
      g.add(d);
    });
  }
  scene.add(g);
  addCollider(lot.at.x, lot.at.z, lot.foot[0], lot.foot[1]);
  if (CENTERS[lot.id]) {
    // Door ring: stand on it to walk inside
    const door = doorOf(lot);
    scene.add(zoneRing(door, 0xffd166));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.45), new THREE.MeshBasicMaterial({ map: signTex('🚪 เข้าอาคาร', '#b45309'), side: THREE.DoubleSide }));
    sign.position.set(door.x, 1.6, door.z - 0.9);
    scene.add(sign);
  }
  if (animate) {
    popIn(g);
    burst(lot.at);
  }
}
function makeCampusTile(lot) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 2.2), [mat(0x0f766e), mat(0x0f766e), new THREE.MeshBasicMaterial({ map: tex }), mat(0x0f766e), mat(0x0f766e), mat(0x0f766e)]);
  mesh.position.set(lot.front.x, 0.06, lot.front.z);
  scene.add(mesh);
  const draw = () => {
    const g = c.getContext('2d');
    const paid = campus.paid[lot.id] || 0;
    g.fillStyle = '#134e4a';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#14b8a6';
    g.fillRect(0, 256 - (256 * paid) / lot.price, 256, (256 * paid) / lot.price);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 10;
    g.setLineDash([22, 14]);
    g.strokeRect(10, 10, 236, 236);
    g.font = '86px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(lot.icon, 128, 92);
    g.font = '700 40px Mitr, sans-serif';
    g.fillStyle = '#ffffff';
    g.fillText(`💵${(lot.price - paid).toLocaleString()}`, 128, 190);
    tex.needsUpdate = true;
  };
  draw();
  const label = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.75), new THREE.MeshBasicMaterial({ map: signTex(`${lot.icon} ${lot.name}`, '#0f766e'), side: THREE.DoubleSide, transparent: true }));
  label.position.set(lot.front.x, 2.0, lot.front.z - 1.3);
  scene.add(label);
  mesh.visible = label.visible = false;
  campus.tiles[lot.id] = { mesh, label, draw, lot, last: -1 };
}
function updateCampus(dt) {
  if (!campus.built) return;
  const open = campusOpen();
  if (open && !campus.tipShown) {
    campus.tipShown = true;
    tip('campus');
  }
  // Price tiles: stand on one to pay toward it
  for (const t of Object.values(campus.tiles)) {
    t.mesh.visible = t.label.visible = open;
    if (!open || player.floor !== 0 || lift.riding || flatDist(player.group.position, t.lot.front) > 1.1 || state.money <= 0) continue;
    const lot = t.lot;
    const left = lot.price - (campus.paid[lot.id] || 0);
    const pay = Math.min(state.money, left, Math.max(1, Math.ceil(lot.price * dt * 0.8)));
    state.money -= pay;
    campus.paid[lot.id] = (campus.paid[lot.id] || 0) + pay;
    if (Math.floor(performance.now() / 80) !== t.last) {
      t.last = Math.floor(performance.now() / 80);
      t.draw();
      sfxTick();
    }
    if (campus.paid[lot.id] >= lot.price) {
      scene.remove(t.mesh, t.label);
      delete campus.tiles[lot.id];
      campus.owned.push(lot.id);
      buildCampusLot(lot, true);
      sfxUnlock();
      toast(`${lot.icon} <b>เปิด ${lot.name}!</b><br>รายได้ +${Math.round(lot.rate * priceMult() * 60).toLocaleString()}/นาที ไปเก็บที่กองเงินหน้าตึก`, 4000);
      save();
    }
  }
  // Owned buildings earn into their cash piles
  campus.tick = (campus.tick || 0) + dt;
  if (campus.tick >= 3) {
    for (const id of campus.owned) {
      const lot = CAMPUS_LOTS.find((l) => l.id === id);
      const amt = Math.round(lot.rate * priceMult() * campus.tick);
      if (amt > 0) {
        campus.piles[id].add(amt);
        missionProgress('earn', amt);
      }
    }
    campus.tick = 0;
  }
  updateCampusLife(dt);
}
// Cars up and down the avenue; townsfolk strolling between the buildings
const CAR_SPRITES = ['sedan_blue', 'sedan_red', 'sedan_teal', 'sedan_white', 'pickup_black', 'pickup_silver', 'tuktuk', 'songthaew', 'moto', 'ambulance'];
const FOLK_SPRITES = ['nurse', 'doctor', 'caregiver', 'elder_f', 'elder_m', 'wheelchair', 'pt', 'ot', 'pharmacist', 'kid', 'jogger', 'student', 'resident', 'security', 'nutritionist'];
function updateCampusLife(dt) {
  campus.carTimer -= dt;
  if (campus.carTimer <= 0 && campus.cars.length < 5) {
    campus.carTimer = rand(3, 6);
    const north = Math.random() < 0.5;
    const kind = pick(CAR_SPRITES);
    const s = campusSprite(`car3_${kind}_${north ? 'n' : 's'}`, kind === 'moto' ? 1.4 : kind === 'songthaew' ? 3.4 : 3, 0.12);
    s.position.set(CAMPUS_X + (north ? 0.65 : -0.65), 0, north ? 17 : -26);
    scene.add(s);
    campus.cars.push({ s, north, speed: rand(4, 6.5) });
  }
  for (let i = campus.cars.length - 1; i >= 0; i--) {
    const c = campus.cars[i];
    c.s.position.z += (c.north ? -1 : 1) * c.speed * dt;
    if (c.s.position.z < -27 || c.s.position.z > 18) {
      scene.remove(c.s);
      campus.cars.splice(i, 1);
    }
  }
  const want = Math.min(10, 3 + campus.owned.length);
  while (campus.folk.length < want) {
    const kind = pick(FOLK_SPRITES);
    const s = campusSprite(`ch3_${kind}_s`, 0.8, 0.04);
    const start = pick(CAMPUS_LOTS).front.clone().add(v(rand(-2, 2), rand(-0.5, 0.5)));
    s.position.copy(start);
    scene.add(s);
    campus.folk.push({ s, kind, target: null, wait: rand(0, 3), dir: 's' });
  }
  for (const f of campus.folk) {
    if (!f.target) {
      f.wait -= dt;
      if (f.wait <= 0) f.target = pick(CAMPUS_LOTS).front.clone().add(v(rand(-2.5, 2.5), rand(-0.4, 0.4)));
      continue;
    }
    const pos = f.s.position;
    const way = route(pos, f.target);
    const dx = way.x - pos.x;
    const dz = way.z - pos.z;
    const d = Math.hypot(dx, dz);
    const step = Math.min(d, 1.4 * dt);
    if (d > 0.01) {
      pos.x += (dx / d) * step;
      pos.z += (dz / d) * step;
    }
    // Face away from the camera when walking north, toward it when walking south
    const dir = dz < -0.01 ? 'n' : 's';
    if (dir !== f.dir && Math.abs(dz) > Math.abs(dx) * 0.3) {
      f.dir = dir;
      f.s.material.map = campusTex(`ch3_${f.kind}_${dir}`);
    }
    pos.y = Math.abs(Math.sin(performance.now() / 160 + f.s.id)) * 0.05;
    if (flatDist(pos, f.target) < 0.1) {
      f.target = null;
      f.wait = rand(2, 6);
    }
  }
}
// Walking inside the campus: avenue to the right street, then along it
function campusRoute(from, to) {
  if (flatDist(from, to) < 1) return to;
  // Both on the avenue: straight along it
  if (Math.abs(from.x - CAMPUS_X) < 0.7 && Math.abs(to.x - CAMPUS_X) < 0.7) return to;
  const streetOf = (z) => (z < -2.5 ? CAMPUS_STREETS[0] : CAMPUS_STREETS[1]);
  const onAvenue = Math.abs(from.x - CAMPUS_X) < 0.7;
  const ts = streetOf(to.z);
  if (Math.abs(from.z - ts) < 1.6 && Math.abs(to.z - ts) < 1.6) return to;
  if (!onAvenue) {
    const fs = streetOf(from.z);
    return Math.abs(from.z - fs) < 1.6 ? v(CAMPUS_X, from.z) : v(from.x, fs);
  }
  if (Math.abs(from.z - ts) > 0.4) return v(CAMPUS_X, ts);
  return to;
}
// What the campus earns while you're away (staff run it)
function campusPerSecond() {
  return campus.owned.reduce((a, id) => a + (CAMPUS_LOTS.find((l) => l.id === id)?.rate || 0), 0) * priceMult();
}
function campusSnapshot() {
  return { owned: campus.owned, paid: campus.paid, hired: campus.hired || {}, cash: Object.fromEntries(Object.entries(campus.piles).map(([k, p]) => [k, p.amount])) };
}
// AUTO: buy the next campus building it can afford outright
function campusTask() {
  if (!campusOpen()) return null;
  const lot = CAMPUS_LOTS.find((l) => !campus.owned.includes(l.id) && state.money >= l.price - (campus.paid[l.id] || 0));
  return lot ? { at: lot.front, keep: () => !campus.owned.includes(lot.id) && state.money > 0 } : null;
}

// ---------- inside the campus centres: walk in through the door and run them like the hospital ----------
// Each centre's interior is built far off to the east (x ≥ 140) and reached by standing still on its
// door ring. Inside are service desks (clients queue) and beds (clients stay and need care rounds).
// Serve by standing in the green ring or hire staff on a price tile. Money goes to the centre's
// cash pile outside, where the player, AUTO and the collectors pick it up.
const INT_W = 18;
const INT_D = 12;
const ELDERS = ['elder_f', 'elder_m', 'wheelchair', 'resident'];
const CROWD = ['elder_f', 'elder_m', 'kid', 'student', 'jogger', 'resident', 'owner_f', 'owner_m'];
const CENTERS = {
  homecare: {
    floor: 0xe0f2fe, clients: CROWD,
    stations: [
      { id: 'intake', kind: 'queue', icon: '📞', name: 'รับเรื่องเยี่ยมบ้าน', at: v(-4, -3.2), sprite: 'eq3_reception_desk_s', w: 2.6, price: 60, time: 2.5, staff: 'ch3_receptionist_s', hire: 6000 },
      { id: 'kit', kind: 'queue', icon: '🧰', name: 'จัดชุดอุปกรณ์เยี่ยมบ้าน', at: v(3, -3.2), sprite: 'eq3_storage_rack_s', w: 2, price: 90, time: 3.2, staff: 'ch3_caregiver_s', hire: 9000 },
    ],
    decor: [['eq3_care_van_s', 7, 2.2, 3.6], ['eq3_whiteboard_s', -7.2, -4.9, 1.8], ['eq3_waiting_chairs_s', -6.5, 2.6, 2.4]],
  },
  derma: {
    floor: 0xfce7f3, clients: CROWD,
    stations: [
      { id: 'shop', kind: 'queue', icon: '🧴', name: 'เคาน์เตอร์ผลิตภัณฑ์ผิว', at: v(-4.5, -3.2), sprite: 'eq3_medicine_shelf_s', w: 2.2, price: 70, time: 2.2, staff: 'ch3_pharmacist_s', hire: 8000 },
      { id: 'treat', kind: 'bed', icon: '✨', name: 'ห้องทรีตเมนต์ผิว', beds: [v(2, -3.4), v(5, -3.4)], op: v(3.5, -0.4), bed: 'eq3_rest_sofa_s', price: 180, staff: 'ch3_nurse_s', hire: 12000 },
    ],
    decor: [['eq3_waiting_chairs_s', -6.5, 2.6, 2.4], ['dc_planter', 7.4, 3.5, 1.4]],
  },
  tranquila: {
    floor: 0xecfccb, clients: ELDERS,
    stations: [
      { id: 'villa', kind: 'bed', icon: '🛏️', name: 'ห้องพักผู้สูงวัย', beds: [v(-6.5, -3.5), v(-3.5, -3.5), v(-0.5, -3.5)], op: v(-3.5, -0.4), bed: 'eq3_care_bed_s', price: 260, staff: 'ch3_caregiver_s', hire: 20000 },
      { id: 'dining', kind: 'queue', icon: '🍲', name: 'ห้องอาหาร', at: v(5, -3.2), sprite: 'eq3_dining_table_s', w: 2.6, price: 80, time: 2.6, staff: 'ch3_nutritionist_s', hire: 10000 },
    ],
    decor: [['eq3_rest_sofa_s', 6.8, 2.6, 2.2], ['dc_planter', -7.6, 3.5, 1.4]],
  },
  cmnh: {
    floor: 0xfff7ed, clients: ELDERS,
    stations: [
      { id: 'care', kind: 'bed', icon: '🛏️', name: 'เตียงดูแลผู้สูงอายุ', beds: [v(-7.2, -3.6), v(-4.6, -3.6), v(-2, -3.6), v(0.6, -3.6)], op: v(-3.3, -0.4), bed: 'eq3_care_bed_s', extra: 'eq3_nurse_desk_s', price: 300, staff: 'ch3_nurse_s', hire: 30000 },
      { id: 'rehab', kind: 'queue', icon: '🦽', name: 'กายภาพบำบัด', at: v(5.2, -3.2), sprite: 'eq3_parallel_bars_s', w: 2.6, price: 120, time: 3.0, staff: 'ch3_pt_s', hire: 15000 },
    ],
    decor: [['eq3_med_cart_s', 7.4, 2.4, 1.3], ['eq3_bath_set_s', -7.4, 2.6, 1.8]],
  },
  phc: {
    floor: 0xede9fe, clients: ['student', 'nurse', 'caregiver', 'owner_f', 'owner_m'],
    stations: [
      { id: 'cpr', kind: 'queue', icon: '🎓', name: 'ห้องอบรม CPR', at: v(-4, -3.2), sprite: 'eq3_training_manikin_s', w: 2.2, price: 110, time: 3.0, staff: 'ch3_doctor_s', hire: 14000 },
      { id: 'exam', kind: 'queue', icon: '📝', name: 'ห้องสอบใบประกาศ', at: v(3.5, -3.2), sprite: 'eq3_office_desk_s', w: 2.2, price: 90, time: 2.4, staff: 'ch3_accountant_s', hire: 12000 },
    ],
    decor: [['eq3_whiteboard_s', -7.2, -4.9, 1.8], ['eq3_lockers_s', 7.4, -4.6, 1.6], ['eq3_waiting_chairs_s', 6.5, 2.6, 2.4]],
  },
  neuro: {
    floor: 0xdbeafe, clients: ['elder_f', 'elder_m', 'wheelchair', 'owner_f', 'owner_m', 'resident'],
    stations: [
      { id: 'opd', kind: 'queue', icon: '🧠', name: 'OPD ประสาทวิทยา', at: v(-5.4, -3.2), sprite: 'eq3_exam_desk_s', w: 2.2, price: 160, time: 2.8, staff: 'ch3_doctor_s', hire: 25000 },
      { id: 'stroke', kind: 'bed', icon: '🫀', name: 'Stroke Unit', beds: [v(-0.4, -3.6), v(2.4, -3.6), v(5.2, -3.6)], op: v(2.4, -0.4), bed: 'eq3_care_bed_s', extra: 'eq3_vital_monitor_s', price: 420, staff: 'ch3_nurse_s', hire: 40000 },
    ],
    decor: [['eq3_suction_unit_s', 7.5, -4.6, 1.2], ['eq3_waiting_chairs_s', -6.5, 2.6, 2.4], ['eq3_med_cart_s', 7.4, 2.4, 1.3]],
  },
};
const INT = {}; // live interiors by lot id
let inside = null; // lot id the player is in
const doorState = { still: 0, armed: true };
const interiorOrigin = (k) => v(150 + k * 32, 0);
const inInterior = (p) => p.x > 120;
const interiorAt = (p) => Object.values(INT).find((it) => Math.abs(p.x - it.o.x) < INT_W && Math.abs(p.z - it.o.z) < INT_D);
const doorOf = (lot) => lot.front.clone().add(v(-1.6, 0));

function buildInterior(lot, k) {
  const def = CENTERS[lot.id];
  if (!def || INT[lot.id]) return;
  const o = interiorOrigin(k);
  const g = new THREE.Group();
  g.position.copy(o);
  // A dark "building" all around so the room reads as indoors
  const under = new THREE.Mesh(new THREE.PlaneGeometry(INT_W + 30, INT_D + 30), mat(0x2b2d42));
  under.rotation.x = -Math.PI / 2;
  under.position.y = -0.02;
  g.add(under);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(INT_W, 0.12, INT_D), mat(def.floor));
  floor.position.y = 0.06;
  floor.receiveShadow = true;
  g.add(floor);
  const wall = (x, z, w, d, h = 1.1) => {
    const m = box(w, h, d, 0xf4f4f0);
    m.position.set(x, h / 2, z);
    g.add(m);
    addCollider(o.x + x, o.z + z, w, d);
  };
  wall(0, -INT_D / 2 - 0.15, INT_W + 0.6, 0.3, 2.2);
  wall(-INT_W / 2 - 0.15, 0, 0.3, INT_D);
  wall(INT_W / 2 + 0.15, 0, 0.3, INT_D);
  wall(-INT_W / 4 - 1, INT_D / 2 + 0.15, INT_W / 2 - 2, 0.3, 0.6);
  wall(INT_W / 4 + 1, INT_D / 2 + 0.15, INT_W / 2 - 2, 0.3, 0.6);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.9), new THREE.MeshBasicMaterial({ map: signTex(`${lot.icon} ${lot.name}`, '#0f766e'), side: THREE.DoubleSide }));
  sign.position.set(0, 2.9, -INT_D / 2);
  g.add(sign);
  const exit = v(0, INT_D / 2 - 0.9);
  const exitRing = zoneRing(exit, 0xffd166);
  g.add(exitRing);
  const exitSign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), new THREE.MeshBasicMaterial({ map: signTex('🚪 ทางออก', '#b45309'), side: THREE.DoubleSide }));
  exitSign.position.set(0, 1.7, INT_D / 2 - 0.1);
  g.add(exitSign);
  scene.add(g);
  const put = (name, x, z, w, base = 0.2) => {
    const s = campusSprite(name, w, base);
    s.position.set(o.x + x, 0.12, o.z + z);
    scene.add(s);
    return s;
  };
  for (const [n, x, z, w] of def.decor || []) put(n, x, z, w);
  const it = { lot, def, o, exit: exit.clone().add(o), stations: [], timer: 2, leaving: [] };
  for (const st of def.stations) {
    const S = { ...st, clients: [], staffed: false, scan: 0 };
    if (st.kind === 'queue') {
      S.atW = st.at.clone().add(o);
      S.opW = st.at.clone().add(o).add(v(0, -1.5)); // behind the desk
      put(st.sprite, st.at.x, st.at.z, st.w);
      addCollider(S.atW.x, S.atW.z, st.w * 0.7, 0.8);
      S.cap = 4;
    } else {
      S.bedsW = st.beds.map((b) => ({ at: b.clone().add(o), who: null, care: 0, rest: 0, done: 0, bubble: null }));
      S.opW = st.op.clone().add(o);
      for (const b of S.bedsW) {
        put(st.bed, b.at.x - o.x, b.at.z - o.z, 2.2);
        if (st.extra) put(st.extra, b.at.x - o.x + 1.1, b.at.z - o.z - 0.6, 0.9);
        addCollider(b.at.x, b.at.z, 1.2, 1.6);
        b.bubble = makeBubble();
        b.bubble.position.set(b.at.x, 2.4, b.at.z);
        b.bubble.visible = false;
        scene.add(b.bubble);
      }
      S.cap = S.bedsW.length;
    }
    // Operator ring and station label
    scene.add(zoneRing(S.opW, 0x3fbf5f));
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.55), new THREE.MeshBasicMaterial({ map: signTex(`${st.icon} ${st.name}`, '#14b8a6'), side: THREE.DoubleSide, transparent: true }));
    lbl.position.set(S.kind === 'queue' ? S.atW.x : S.opW.x, 2.3, (S.kind === 'queue' ? S.atW.z : S.opW.z - 3.2) - 0.9);
    scene.add(lbl);
    // Hire tile beside the operator ring
    S.tile = makeHireTile(S, S.opW.clone().add(v(st.kind === 'queue' ? -2.4 : 2.6, 0.6)));
    it.stations.push(S);
  }
  INT[lot.id] = it;
  restoreInterior(it);
}
function makeHireTile(S, at) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const tex = new THREE.CanvasTexture(c);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 1.8), [mat(0x2b2d42), mat(0x2b2d42), new THREE.MeshBasicMaterial({ map: tex }), mat(0x2b2d42), mat(0x2b2d42), mat(0x2b2d42)]);
  mesh.position.set(at.x, 0.14, at.z);
  scene.add(mesh);
  const t = { at, mesh, paid: 0, draw: null };
  t.draw = () => {
    const g = c.getContext('2d');
    g.fillStyle = '#2b2d42';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#3fbf5f';
    g.fillRect(0, 256 - (256 * t.paid) / S.hire, 256, (256 * t.paid) / S.hire);
    g.font = '80px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('🧑‍⚕️', 128, 90);
    g.font = '700 38px Mitr, sans-serif';
    g.fillStyle = '#fff';
    g.fillText(`จ้าง 💵${(S.hire - t.paid).toLocaleString()}`, 128, 190);
    tex.needsUpdate = true;
  };
  t.draw();
  return t;
}
function hireStation(it, S, animate) {
  S.staffed = true;
  if (S.tile) {
    scene.remove(S.tile.mesh);
    S.tile = null;
  }
  const s = campusSprite(S.staff, 0.85, 0.04);
  s.position.copy(S.opW);
  scene.add(s);
  if (animate) {
    burst(S.opW);
    sfxUnlock();
    toast(`🧑‍⚕️ จ้างเจ้าหน้าที่ ${S.icon} ${S.name} แล้ว`);
  }
}
function restoreInterior(it) {
  const hired = campus.hired?.[it.lot.id] || [];
  for (const S of it.stations) if (hired.includes(S.id)) hireStation(it, S, false);
}

// Payments land in the centre's cash pile out front
function centerPay(it, amount, at) {
  campus.piles[it.lot.id].add(amount);
  missionProgress('serve', 1);
  missionProgress('earn', amount);
  if (inside === it.lot.id) floatText(at, `+${amount}`, '#8be08f');
  sfxCoin();
}
function spawnClient(it, S) {
  const kind = pick(it.def.clients);
  const s = campusSprite(`ch3_${kind}_n`, 0.8, 0.04);
  s.position.copy(it.exit).add(v(rand(-0.5, 0.5), 0.6));
  scene.add(s);
  return { s, kind, arrived: false };
}
function updateInterior(it, dt) {
  const ppos = player.group.position;
  const playerAt = (p) => inside === it.lot.id && flatDist(ppos, p) < ZONE_R;
  it.timer -= dt;
  if (it.timer <= 0) {
    it.timer = (6 / arrivalMult()) * rand(0.7, 1.3);
    const open = it.stations.filter((S) => (S.kind === 'queue' ? S.clients.length < S.cap : S.bedsW.some((b) => !b.who)));
    if (open.length) {
      const S = pick(open);
      const c = spawnClient(it, S);
      if (S.kind === 'queue') S.clients.push(c);
      else {
        const bed = S.bedsW.find((b) => !b.who);
        bed.who = c;
        bed.care = 0;
        bed.done = 0;
        bed.rest = rand(1, 3);
        c.bed = bed;
      }
    }
  }
  for (const S of it.stations) {
    const staffed = S.staffed || playerAt(S.opW);
    if (S.kind === 'queue') {
      S.clients.forEach((c, i) => {
        const slot = S.atW.clone().add(v(i === 0 ? 0 : 1.4 + (i - 1) * 0.9, 1.3));
        walkSprite(c, slot, dt);
      });
      const front = S.clients[0];
      if (front?.arrived && staffed) {
        S.scan += dt * (S.staffed ? staffMult() : 1);
        if (S.scan >= S.time) {
          S.scan = 0;
          S.clients.shift();
          centerPay(it, Math.round(S.price * priceMult() * eventPayMult()), S.atW);
          it.leaving.push(front);
        }
      }
    } else {
      for (const b of S.bedsW) {
        if (!b.who) {
          b.bubble.visible = false;
          continue;
        }
        const c = b.who;
        if (!c.inBed) {
          walkSprite(c, b.at.clone().add(v(0, 1.2)), dt);
          if (c.arrived) {
            c.inBed = true;
            c.s.visible = false; // tucked in
          }
          continue;
        }
        // Resting, then a care round: needs someone at the station for a few seconds
        b.bubble.visible = inside === it.lot.id;
        if (b.rest > 0) {
          b.rest -= dt;
          b.bubble.userData.draw('😴', '', '#1d2433', null);
          continue;
        }
        if (staffed) b.care += dt * (S.staffed ? staffMult() : 1);
        b.bubble.userData.draw('🔔', '', '#1d2433', Math.min(1, b.care / 2.5));
        if (b.care >= 2.5) {
          b.care = 0;
          b.done++;
          b.rest = rand(5, 8);
          if (b.done >= 3) {
            // Recovered and checked out
            centerPay(it, Math.round(S.price * priceMult() * eventPayMult()), b.at);
            c.s.visible = true;
            c.s.position.copy(b.at).add(v(0, 1.2));
            it.leaving.push(c);
            b.who = null;
          }
        }
      }
    }
    // Hire tile: stand on it to pay
    const t = S.tile;
    if (t && inside === it.lot.id && flatDist(ppos, t.at) < 1.0 && state.money > 0) {
      const pay = Math.min(state.money, S.hire - t.paid, Math.max(1, Math.ceil(S.hire * dt * 0.8)));
      state.money -= pay;
      t.paid += pay;
      t.draw();
      sfxTick();
      if (t.paid >= S.hire) {
        campus.hired = campus.hired || {};
        (campus.hired[it.lot.id] = campus.hired[it.lot.id] || []).push(S.id);
        hireStation(it, S, true);
        save();
      }
    }
  }
  for (let i = it.leaving.length - 1; i >= 0; i--) {
    const c = it.leaving[i];
    walkSprite(c, it.exit.clone().add(v(0, 0.8)), dt, 's');
    if (c.arrived) {
      scene.remove(c.s);
      it.leaving.splice(i, 1);
    }
  }
}
function walkSprite(c, target, dt, face) {
  const p = c.s.position;
  const dx = target.x - p.x;
  const dz = target.z - p.z;
  const d = Math.hypot(dx, dz);
  c.arrived = d < 0.06;
  if (c.arrived) return;
  const step = Math.min(d, 1.6 * dt);
  p.x += (dx / d) * step;
  p.z += (dz / d) * step;
  p.y = 0.12 + Math.abs(Math.sin(performance.now() / 150 + c.s.id)) * 0.05;
  const dir = face || (dz < 0 ? 'n' : 's');
  if (c.dir !== dir) {
    c.dir = dir;
    c.s.material.map = campusTex(`ch3_${c.kind}_${dir}`);
  }
}
// Doors: stand still on a centre's door ring (outside) or the exit ring (inside) to go through
function updateDoors(dt) {
  if (player.floor !== 0 || lift.riding) return;
  const p = player.group.position;
  const still = Math.hypot(input.x, input.z) < 0.08;
  let target = null;
  if (inside) {
    const it = INT[inside];
    if (flatDist(p, it.exit) < ZONE_R) target = { out: it };
  } else {
    for (const it of Object.values(INT)) if (flatDist(p, doorOf(it.lot)) < ZONE_R) target = { into: it };
  }
  if (!target) {
    doorState.armed = true;
    doorState.still = 0;
    return;
  }
  // AUTO walks straight through a door its route needs; a player stops on the ring for a moment
  const autoOn = autoBadge.classList.contains('show') && auto.task;
  const tAt = autoOn ? auto.task.at : null;
  const autoGo = autoOn && (target.into ? interiorAt(tAt) === target.into || flatDist(tAt, doorOf(target.into.lot)) < 0.3 : interiorAt(tAt) !== target.out);
  doorState.still = still && doorState.armed ? doorState.still + dt : 0;
  if (!autoGo && doorState.still < 0.4) return;
  doorState.still = 0;
  doorState.armed = false;
  if (target.into) {
    inside = target.into.lot.id;
    p.copy(target.into.exit);
    tip('interior');
  } else {
    inside = null;
    p.copy(doorOf(target.out.lot));
  }
  auto.task = null;
  tone(660, 0.12, 'triangle', 0.05);
  updateCamera(0, true);
}
function updateInteriors(dt) {
  if (!campus.built) return;
  CAMPUS_LOTS.forEach((lot, k) => {
    if (campus.owned.includes(lot.id) && CENTERS[lot.id] && !INT[lot.id]) buildInterior(lot, k);
  });
  // Player wandered out of an interior some other way (teleport home etc.)
  if (inside && !inInterior(player.group.position)) inside = null;
  for (const it of Object.values(INT)) updateInterior(it, dt);
  updateDoors(dt);
}
// AUTO: serve an unstaffed station that has someone waiting
let interiorPick = null;
function interiorTask() {
  // Stay at one station for up to 20 s, then pick another waiting one so every centre gets help
  const now = performance.now();
  const waitingAt = (S) => (S.kind === 'queue' ? Boolean(S.clients[0]?.arrived) : S.bedsW.some((b) => b.who?.inBed && b.rest <= 0));
  if (!interiorPick || now - interiorPick.since > 20000 || interiorPick.S.staffed || !waitingAt(interiorPick.S)) {
    const all = [];
    for (const it of Object.values(INT)) for (const S of it.stations) if (!S.staffed && waitingAt(S) && S !== interiorPick?.S) all.push({ it, S });
    interiorPick = all.length ? { ...pick(all), since: now } : null;
  }
  if (!interiorPick) return null;
  const { it, S } = interiorPick;
  const since = interiorPick.since;
  const stillMine = () => interiorPick && interiorPick.since === since && now - since < 20000;
  if (inside === it.lot.id) return { at: S.opW, keep: () => stillMine() && performance.now() - since < 20000 && waitingAt(S) };
  // Head for the other centre's door: the route leads out through this exit on the way
  return { at: doorOf(it.lot), keep: () => inside !== it.lot.id && performance.now() - since < 20000 };
}
function interiorPerSecond() {
  let rate = 0;
  for (const it of Object.values(INT)) {
    for (const S of it.stations) {
      if (!S.staffed) continue;
      rate += S.kind === 'queue' ? (S.price * priceMult() * staffMult()) / (S.time + 4) : (S.price * priceMult() * S.cap) / 35;
    }
  }
  return rate * 0.5;
}

// ---------- military base: north of the campus, reached up the campus avenue ----------
// Bought one stage at a time like the hospital. Buildings train units while someone stands in
// their ring or a commander is hired; units add up to military power, which pays a budget,
// powers missions and defends the base from drone raids. Generals boost a whole branch.
const BASE_GATE = v(20, -29.5);
const BASE_OPEN_STEP = 24;
// The base is shared by every branch: open once any branch has its first 24 departments
// (and this one has reached the campus avenue that leads there)
const baseOpen = () => state.step >= CAMPUS_OPEN_STEP && topStep() >= BASE_OPEN_STEP;
const inBase = (p) => p.z < -28.6 && p.x > -14 && p.x < 50;
const BASE_UNLOCKS = [
  { id: 'hq', icon: '🏛️', name: 'กองบัญชาการค่ายทหาร', price: 50000, at: v(22.6, -33) },
  { id: 'barracks', icon: '🪖', name: 'ค่ายทหารบก', price: 70000, at: v(22.6, -42) },
  { id: 'housing', icon: '🏠', name: 'บ้านพักทหาร', price: 60000, at: v(17.4, -34) },
  { id: 'armored', icon: '🚙', name: 'โรงรถหุ้มเกราะ', price: 120000, at: v(22.6, -51) },
  { id: 'tanks', icon: '🛡️', name: 'กองพันรถถัง', price: 200000, at: v(22.6, -59) },
  { id: 'navy', icon: '⚓', name: 'ท่าเรือกองทัพเรือ', price: 300000, at: v(17.4, -44) },
  { id: 'airforce', icon: '✈️', name: 'ฐานบินกองทัพอากาศ', price: 450000, at: v(17.4, -53) },
  { id: 'privatejet', icon: '🛩️', name: 'เครื่องบินรบส่วนตัว', price: 600000, at: v(17.4, -61) },
];
// Units each training building turns out
const UNIT_TYPES = {
  inf: { icon: '🪖', name: 'ทหารบก', from: 'barracks', time: 3, power: 1, branch: 'army' },
  arm: { icon: '🚙', name: 'รถหุ้มเกราะ', from: 'armored', time: 8, power: 5, branch: 'army', cap: 6 },
  tank: { icon: '🛡️', name: 'รถถัง', from: 'tanks', time: 12, power: 10, branch: 'army', cap: 6 },
  ship: { icon: '🚢', name: 'เรือรบ + ทหารเรือ', from: 'navy', time: 18, power: 20, branch: 'navy', cap: 4 },
  jet: { icon: '✈️', name: 'เครื่องบินรบ + ทหารอากาศ', from: 'airforce', time: 15, power: 15, branch: 'air', cap: 6 },
};
const infCap = () => (baseHas('housing') ? 24 : 8);
const unitCap = (k) => (k === 'inf' ? infCap() : UNIT_TYPES[k].cap);
const defaultBase = () => ({ step: 0, paid: 0, units: { inf: 0, arm: 0, tank: 0, ship: 0, jet: 0 }, hired: [], generals: [], recruits: 0, medals: 0, hp: 10 });
const B = () => state.base;
const baseHas = (id) => BASE_UNLOCKS.findIndex((u) => u.id === id) < (B()?.step || 0);
const GEN_FIRST = ['สายฟ้า', 'เหล็กกล้า', 'พยัคฆ์', 'อินทรี', 'มังกร', 'คลื่นทอง', 'เหยี่ยวเพชร', 'สิงห์ทอง', 'ภูผา', 'พายุ', 'ดาวเหนือ', 'เกราะเพชร'];
const GEN_RANK = { army: 'พลเอก', navy: 'พลเรือเอก', air: 'พลอากาศเอก' };
const branchBonus = (br) => 1 + (B()?.generals || []).filter((g) => g.branch === br).reduce((a, g) => a + g.stars * 0.05, 0);
function militaryPower() {
  const b = B();
  if (!b) return 0;
  let p = 0;
  for (const [k, t] of Object.entries(UNIT_TYPES)) p += (b.units[k] || 0) * t.power * branchBonus(t.branch);
  if (baseHas('privatejet')) p += 30;
  return Math.round(p);
}
const recruitCost = () => Math.round((20000 * 1.5 ** Math.min(B().recruits, 30)) / 100) * 100;

const BASE = { built: false, tile: null, stations: {}, unitMeshes: { inf: [], arm: [], tank: [], ship: [], jet: [] }, generals: [], pile: null, budgetT: 0, stand: 0, opened: false, flight: null, drones: [], defense: null, mission: null, missionTimer: 60, raidTimer: rand(360, 540), shots: [] };

// --- models ---
const OLIVE = 0x556b2f;
function soldierModel(branch = 'army') {
  const look = { army: { shirt: OLIVE, pants: 0x4b5320 }, navy: { shirt: 0xffffff, pants: 0xf4f4f0 }, air: { shirt: 0x5b7db1, pants: 0x3d5a80 } }[branch];
  const p = makePerson({ ...look, skin: pick(SKIN), hair: 0x1f1f1f });
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(branch === 'army' ? 0x4b5320 : branch === 'navy' ? 0xffffff : 0x3d5a80));
  helmet.position.y = 1.55;
  p.body.add(helmet);
  return p;
}
function generalModel(branch) {
  const p = makePerson({ shirt: branch === 'navy' ? 0xffffff : branch === 'air' ? 0x5b7db1 : 0x3b5323, pants: branch === 'navy' ? 0xf4f4f0 : 0x2f3e1f, hair: 0x1f1f1f });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.28, 0.16, 14), mat(branch === 'navy' ? 0xffffff : 0x2f3e1f));
  cap.position.y = 1.78;
  const peak = box(0.32, 0.04, 0.16, 0x111111, { shadow: false });
  peak.position.set(0, 1.71, 0.24);
  const badge = box(0.12, 0.08, 0.02, 0xffd166, { shadow: false });
  badge.position.set(0, 1.8, 0.29);
  p.body.add(cap, peak, badge);
  for (let i = 0; i < 3; i++) {
    const medal = box(0.06, 0.06, 0.02, [0xe5484d, 0xffd166, 0x3d8bfd][i], { shadow: false });
    medal.position.set(-0.12 + i * 0.07, 1.12, 0.28);
    p.body.add(medal);
  }
  return p;
}
function tankModel() {
  const g = new THREE.Group();
  const hull = box(1.6, 0.6, 2.5, OLIVE);
  hull.position.y = 0.55;
  g.add(hull);
  for (const s of [-0.85, 0.85]) {
    const track = box(0.35, 0.5, 2.7, 0x2b2d42);
    track.position.set(s, 0.3, 0);
    g.add(track);
  }
  const turret = new THREE.Group();
  const top = box(1.0, 0.45, 1.2, 0x4b5320);
  top.position.y = 1.05;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.8, 10), mat(0x3a4520));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 1.1, 1.3);
  turret.add(top, barrel);
  g.add(turret);
  g.userData.turret = turret;
  return g;
}
function armoredModel() {
  const g = new THREE.Group();
  const body = box(1.4, 0.9, 2.5, 0x6b7a3a);
  body.position.y = 0.85;
  const nose = box(1.4, 0.5, 0.6, 0x6b7a3a);
  nose.position.set(0, 0.65, 1.4);
  nose.rotation.x = -0.5;
  const gun = box(0.4, 0.3, 0.5, 0x3a4520);
  gun.position.set(0, 1.45, 0.2);
  g.add(body, nose, gun);
  for (const z of [-0.85, 0, 0.85]) {
    for (const s of [-0.75, 0.75]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.25, 12), mat(0x1d2433));
      w.rotation.z = Math.PI / 2;
      w.position.set(s, 0.35, z);
      g.add(w);
    }
  }
  return g;
}
function jetModel(color = 0x8d99ae) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 3.4, 10), mat(color));
  body.rotation.x = Math.PI / 2;
  body.position.y = 0.7;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.9, 10), mat(color));
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.7, 2.1);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), mat(0x7fc8f8));
  canopy.scale.set(1, 0.8, 1.8);
  canopy.position.set(0, 0.95, 1.0);
  const wing = box(3.4, 0.06, 1.3, color);
  wing.position.set(0, 0.65, -0.1);
  const tailW = box(1.4, 0.05, 0.6, color);
  tailW.position.set(0, 0.7, -1.5);
  const fin = box(0.06, 0.8, 0.7, color);
  fin.position.set(0, 1.1, -1.4);
  g.add(body, nose, canopy, wing, tailW, fin);
  for (const s of [-1.2, 1.2]) {
    const gear = box(0.06, 0.4, 0.06, 0x1d2433);
    gear.position.set(s * 0.3, 0.25, 0);
    g.add(gear);
  }
  return g;
}
function shipModel() {
  const g = new THREE.Group();
  const hull = box(1.5, 0.7, 4.6, 0x8d99ae);
  hull.position.y = 0.2;
  const bow = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.2, 4), mat(0x8d99ae));
  bow.rotation.x = Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.position.set(0, 0.2, 2.8);
  const deck = box(1.0, 0.7, 1.6, 0xdfe6ee);
  deck.position.set(0, 0.9, -0.6);
  const bridge = box(0.8, 0.5, 0.8, 0xdfe6ee);
  bridge.position.set(0, 1.5, -0.6);
  const mast = box(0.08, 1.2, 0.08, 0x2b2d42);
  mast.position.set(0, 2.2, -0.7);
  const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 8), mat(0x2b2d42));
  gun.rotation.x = Math.PI / 2;
  gun.position.set(0, 0.8, 1.5);
  g.add(hull, bow, deck, bridge, mast, gun);
  return g;
}
function droneModel() {
  const g = new THREE.Group();
  const core = box(0.6, 0.25, 0.6, 0xe5484d);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
  eye.position.set(0, -0.1, 0.3);
  g.add(core, eye);
  for (const [x, z] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) {
    const arm = box(0.08, 0.06, 0.08, 0x2b2d42);
    arm.position.set(x, 0.05, z);
    const rotor = box(0.5, 0.02, 0.08, 0x111111, { shadow: false });
    rotor.position.set(x, 0.12, z);
    g.add(arm, rotor);
    g.userData.rotors = (g.userData.rotors || []).concat(rotor);
  }
  return g;
}

// --- ground and buildings ---
function baseGround() {
  const g = new THREE.Group();
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(62, 36), mat(0xb5a77a));
  yard.rotation.x = -Math.PI / 2;
  yard.position.set(18, 0.011, -47);
  yard.receiveShadow = true;
  const road = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 40), mat(0x55606e));
  road.rotation.x = -Math.PI / 2;
  road.position.set(20, 0.022, -44.5);
  g.add(yard, road);
  // Fence posts around the yard, a gate with the sign
  for (let x = -12; x <= 48; x += 2) {
    if (Math.abs(x - 20) < 2.5) continue;
    const post = box(0.12, 1.2, 0.12, 0x6b7a3a);
    post.position.set(x, 0.6, -29.2);
    g.add(post);
  }
  const rail = box(60, 0.08, 0.08, 0x6b7a3a);
  rail.position.set(18, 1.0, -29.2);
  g.add(rail);
  for (const dx of [-2.2, 2.2]) {
    const post = box(0.4, 3.6, 0.4, 0x3a4520);
    post.position.set(20 + dx, 1.8, -29.3);
    g.add(post);
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.9), new THREE.MeshBasicMaterial({ map: signTex('🎖️ ค่ายทหาร', '#3a4520'), side: THREE.DoubleSide }));
  sign.position.set(20, 3.4, -29.3);
  g.add(sign);
  scene.add(g);
  // Road from the campus avenue's north end up to the gate
  const link = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 4), mat(0x55606e));
  link.rotation.x = -Math.PI / 2;
  link.position.set(20, 0.021, -27.5);
  scene.add(link);
}
function buildingBox(x, z, w, h, d, wall, roof) {
  const g = new THREE.Group();
  const b = box(w, h, d, wall);
  b.position.y = h / 2;
  const r = box(w + 0.3, 0.25, d + 0.3, roof);
  r.position.y = h + 0.12;
  g.add(b, r);
  for (let i = 0; i < Math.floor(w / 1.6); i++) {
    const win = box(0.6, 0.5, 0.05, 0x7fc8f8, { shadow: false });
    win.position.set(-w / 2 + 0.9 + i * 1.6, h * 0.6, d / 2 + 0.03);
    g.add(win);
  }
  g.position.set(x, 0, z);
  scene.add(g);
  addCollider(x, z, w, d);
  return g;
}
function hangar(x, z, w, d, color) {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, d, 20, 1, false, 0, Math.PI), mat(color));
  shell.rotation.z = Math.PI / 2;
  shell.rotation.y = Math.PI / 2;
  shell.position.y = 0;
  shell.castShadow = true;
  g.add(shell);
  g.position.set(x, 0, z);
  scene.add(g);
  addCollider(x, z, w, d);
  return g;
}
function flagPole(x, z) {
  const pole = box(0.1, 5, 0.1, 0xdfe6ee);
  pole.position.set(x, 2.5, z);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), new THREE.MeshBasicMaterial({ map: canvasTexture(84, 54, (c) => {
    const cols = ['#e5484d', '#ffffff', '#1d3a8a', '#ffffff', '#e5484d'];
    const hs = [9, 9, 18, 9, 9];
    let y = 0;
    cols.forEach((col, i) => { c.fillStyle = col; c.fillRect(0, y, 84, hs[i]); y += hs[i]; });
  }), side: THREE.DoubleSide }));
  flag.position.set(x + 0.75, 4.5, z);
  scene.add(pole, flag);
  decorAnims.push((t) => { flag.rotation.y = Math.sin(t * 2) * 0.15; });
}
const BASE_BUILD = {
  hq() {
    buildingBox(31, -33.5, 9, 3.2, 5, 0xf3ead8, 0x3a4520);
    flagPole(24.6, -36.5);
    BASE.pile = BASE.pile || new MoneyPile(v(22.6, -35.4));
  },
  barracks() {
    buildingBox(30.5, -42.5, 8, 2.4, 5, 0xc9c19a, 0x4b5320);
    // Parade ground beside it
    const pg = new THREE.Mesh(new THREE.PlaneGeometry(10, 8), mat(0x8d99ae));
    pg.rotation.x = -Math.PI / 2;
    pg.position.set(41, 0.02, -41.5);
    scene.add(pg);
  },
  housing() {
    for (const [x, z] of [[6, -32.5], [11, -32.5], [6, -37], [11, -37]]) {
      const h = roofHouse(2.6, 1.6, 2.4, 0xf3ead8, 0x3a4520);
      h.position.set(x, 0, z);
      scene.add(h);
      addCollider(x, z, 2.6, 2.4);
    }
  },
  armored() {
    buildingBox(30.5, -51.5, 7, 2.6, 5, 0x8d99ae, 0x3a4520);
  },
  tanks() {
    const g = new THREE.Group();
    const roof = box(8, 0.2, 5, 0x3a4520);
    roof.position.y = 3;
    g.add(roof);
    for (const [x, z] of [[-3.8, -2.3], [3.8, -2.3], [-3.8, 2.3], [3.8, 2.3]]) {
      const p = box(0.25, 3, 0.25, 0x6b7a3a);
      p.position.set(x, 1.5, z);
      g.add(p);
    }
    g.position.set(30.5, 0, -59.5);
    scene.add(g);
  },
  navy() {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(13, 8), new THREE.MeshLambertMaterial({ color: 0x2f7ec2 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(4, 0.03, -44);
    const pier = box(13, 0.3, 1, 0xa0703c);
    pier.position.set(4, 0.15, -39.5);
    scene.add(water, pier);
    addCollider(4, -44.5, 13, 7);
    buildingBox(-8.5, -40.5, 4, 2.4, 3, 0xffffff, 0x1d3a8a);
  },
  airforce() {
    const runway = new THREE.Mesh(new THREE.PlaneGeometry(26, 3.2), mat(0x3d4552));
    runway.rotation.x = -Math.PI / 2;
    runway.position.set(2, 0.025, -56.5);
    scene.add(runway);
    for (let x = -10; x < 14; x += 2.5) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.2), mat(0xffffff));
      d.rotation.x = -Math.PI / 2;
      d.position.set(x, 0.03, -56.5);
      scene.add(d);
    }
    hangar(-6, -61.5, 6, 5, 0x8d99ae);
    const tower = box(1.4, 4.5, 1.4, 0xf3ead8);
    tower.position.set(-10.5, 2.25, -51.5);
    const cab = box(2, 1, 2, 0x7fc8f8);
    cab.position.set(-10.5, 5, -51.5);
    scene.add(tower, cab);
    addCollider(-10.5, -51.5, 1.4, 1.4);
  },
  privatejet() {
    hangar(9, -62, 6, 5, 0xffd166);
    BASE.myJet = jetModel(0xffd166);
    BASE.myJet.position.set(9, 0, -58.6);
    scene.add(BASE.myJet);
  },
};
// Where each unit type parks or stands
function unitSpot(k, i) {
  switch (k) {
    case 'inf': return v(37 + (i % 6) * 1.6, -38 - Math.floor(i / 6) * 1.5);
    case 'arm': return v(37.5 + (i % 3) * 3, -49.5 - Math.floor(i / 3) * 3.4);
    case 'tank': return v(37.5 + (i % 3) * 3, -57.5 - Math.floor(i / 3) * 3.4);
    case 'ship': return v(-0.5 + (i % 4) * 3, -44.8);
    case 'jet': return v(-8 + i * 3.6, -59.3);
    default: return v(0, 0);
  }
}
function syncUnits(animate = false) {
  for (const k of Object.keys(UNIT_TYPES)) {
    const want = B().units[k] || 0;
    const list = BASE.unitMeshes[k];
    while (list.length < want) {
      const i = list.length;
      let m;
      if (k === 'inf') m = soldierModel('army');
      else if (k === 'arm') m = { group: armoredModel() };
      else if (k === 'tank') m = { group: tankModel() };
      else if (k === 'ship') {
        m = { group: shipModel() };
        // a sailor on the pier for each ship
        const sailor = soldierModel('navy');
        sailor.group.position.set(-0.5 + (i % 4) * 3, 0, -39.5);
        scene.add(sailor.group);
      } else {
        m = { group: jetModel() };
        const pilot = soldierModel('air');
        pilot.group.position.set(-8 + i * 3.6 + 1.6, 0, -57.8);
        scene.add(pilot.group);
      }
      const at = unitSpot(k, i);
      m.group.position.set(at.x, k === 'ship' ? 0.05 : 0, at.z);
      if (k === 'ship') m.group.rotation.y = Math.PI / 2;
      if (k === 'jet') m.group.rotation.y = Math.PI / 2;
      scene.add(m.group);
      list.push(m);
      if (animate) popIn(m.group);
    }
    while (list.length > want) scene.remove(list.pop().group);
  }
}
function syncGenerals() {
  const gens = B().generals;
  while (BASE.generals.length < Math.min(gens.length, 6)) {
    const g = gens[BASE.generals.length];
    const p = generalModel(g.branch);
    p.group.position.set(26 + BASE.generals.length * 1.1, 0, -30.6);
    scene.add(p.group);
    BASE.generals.push(p);
  }
}

// --- unlock tiles and training stations ---
function makeBaseTile(u, at, label, color = '#3a4520') {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 2.2), [mat(0x3a4520), mat(0x3a4520), new THREE.MeshBasicMaterial({ map: tex }), mat(0x3a4520), mat(0x3a4520), mat(0x3a4520)]);
  mesh.position.set(at.x, 0.06, at.z);
  scene.add(mesh);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.7), new THREE.MeshBasicMaterial({ map: signTex(label, color), side: THREE.DoubleSide }));
  sign.position.set(at.x, 2.0, at.z - 1.3);
  scene.add(sign);
  const t = { u, at, mesh, sign, paid: 0 };
  t.draw = (paid, price) => {
    const g = c.getContext('2d');
    g.fillStyle = '#2f3e1f';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#6b8e23';
    g.fillRect(0, 256 - (256 * paid) / price, 256, (256 * paid) / price);
    g.strokeStyle = '#ffd166';
    g.lineWidth = 10;
    g.setLineDash([22, 14]);
    g.strokeRect(10, 10, 236, 236);
    g.font = '86px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(u.icon, 128, 92);
    g.font = '700 40px Mitr, sans-serif';
    g.fillStyle = '#ffffff';
    g.fillText(`💵${(price - paid).toLocaleString()}`, 128, 190);
    tex.needsUpdate = true;
  };
  return t;
}
function showBaseTile() {
  if (BASE.tile) {
    scene.remove(BASE.tile.mesh, BASE.tile.sign);
    BASE.tile = null;
  }
  const u = BASE_UNLOCKS[B().step];
  if (!u) return;
  BASE.tile = makeBaseTile(u, u.at, `${u.icon} ${u.name}`);
  BASE.tile.draw(B().paid, u.price);
}
function applyBaseUnlock(id, animate) {
  BASE_BUILD[id]?.();
  const type = Object.entries(UNIT_TYPES).find(([, t]) => t.from === id);
  const u = BASE_UNLOCKS.find((x) => x.id === id);
  if (type) {
    const [k] = type;
    const ring = zoneRing(u.at, 0x3fbf5f);
    scene.add(ring);
    const outward = u.at.x > 20 ? 1.9 : -1.9;
    const S = { k, at: u.at, progress: 0, staffed: B().hired.includes(id), hireAt: v(u.at.x + outward, u.at.z + 2.4), id };
    BASE.stations[id] = S;
    if (S.staffed) postCommander(S);
    else S.hire = makeBaseTile({ icon: '🎖️' }, S.hireAt, `🎖️ จ้างผู้บังคับหน่วย ${UNIT_TYPES[k].icon}`, '#6b4e16');
    if (S.hire) S.hire.draw(0, commanderCost(k));
  }
  if (id === 'hq' || id === 'privatejet') scene.add(zoneRing(u.at, id === 'hq' ? 0xffd166 : 0x7b61ff));
  if (animate) {
    burst(u.at.clone().add(v(u.at.x > 20 ? 6 : -6, 0)));
    sfxUnlock();
  }
}
const commanderCost = (k) => Math.round(UNIT_TYPES[k].power * 6000);
function postCommander(S) {
  const p = generalModel(UNIT_TYPES[S.k].branch);
  p.group.position.copy(S.at).add(v(S.at.x > 20 ? 1.2 : -1.2, -0.8));
  scene.add(p.group);
  S.staffed = true;
  if (S.hire) {
    scene.remove(S.hire.mesh, S.hire.sign);
    S.hire = null;
  }
}
function payTile(t, price, dt) {
  const left = price - t.paid;
  const pay = Math.min(state.money, left, Math.max(1, Math.ceil(price * dt * 0.8)));
  state.money -= pay;
  t.paid += pay;
  t.draw(t.paid, price);
  sfxTick();
  return t.paid >= price;
}

function buildBase() {
  if (BASE.built) return;
  BASE.built = true;
  baseGround();
  for (let i = 0; i < B().step; i++) applyBaseUnlock(BASE_UNLOCKS[i].id, false);
  syncUnits();
  syncGenerals();
  if (B().cash && BASE.pile) BASE.pile.add(B().cash);
}
function updateBase(dt) {
  if (!BASE.built) return;
  const open = baseOpen();
  if (open && !BASE.tile && B().step < BASE_UNLOCKS.length) {
    showBaseTile();
    tip('base');
  }
  if (BASE.tile) BASE.tile.mesh.visible = BASE.tile.sign.visible = open;
  const pos = player.group.position;
  const onFloor = player.floor === 0 && !lift.riding;
  // Unlock tile
  const t = BASE.tile;
  if (open && t && onFloor && flatDist(pos, t.at) < 1.1 && state.money > 0) {
    t.paid = B().paid;
    const u = BASE_UNLOCKS[B().step];
    const done = payTile(t, u.price, dt);
    B().paid = t.paid;
    if (done) {
      B().step++;
      B().paid = 0;
      applyBaseUnlock(u.id, true);
      toast(`${u.icon} <b>สร้าง${u.name}แล้ว!</b>`, 3000);
      showBaseTile();
      save();
    }
  }
  // Training stations
  for (const S of Object.values(BASE.stations)) {
    const type = UNIT_TYPES[S.k];
    const here = onFloor && flatDist(pos, S.at) < ZONE_R;
    if ((B().units[S.k] || 0) < unitCap(S.k) && (S.staffed || here)) {
      S.progress += dt * (S.staffed ? staffMult() : 1) * branchBonus(type.branch);
      if (S.progress >= type.time) {
        S.progress = 0;
        B().units[S.k] = (B().units[S.k] || 0) + 1;
        syncUnits(true);
        if (here) floatText(pos, `${type.icon} +1`, '#c5e1a5');
      }
    }
    if (S.hire && onFloor && flatDist(pos, S.hireAt) < 1.1 && state.money > 0) {
      if (payTile(S.hire, commanderCost(S.k), dt)) {
        B().hired.push(S.id);
        postCommander(S);
        sfxUnlock();
        save();
      }
    }
  }
  // HQ ring opens the command panel; the private jet ring starts a flight
  const hq = BASE_UNLOCKS[0].at;
  const jetAt = BASE_UNLOCKS[7].at;
  const atHQ = baseHas('hq') && onFloor && flatDist(pos, hq) < ZONE_R && !autoBadge.classList.contains('show');
  const atJet = baseHas('privatejet') && onFloor && flatDist(pos, jetAt) < ZONE_R && !autoBadge.classList.contains('show');
  BASE.stand = atHQ || atJet ? BASE.stand + dt : 0;
  if (!atHQ && !atJet) BASE.opened = false;
  if (BASE.stand > 0.6 && !BASE.opened) {
    BASE.opened = true;
    if (atHQ) openMilitary();
    else startFlight();
  }
  // Budget from military power into the HQ pile
  if (BASE.pile) {
    BASE.budgetT += dt;
    if (BASE.budgetT >= 3) {
      const amt = Math.round(militaryPower() * 0.4 * BASE.budgetT * priceMult());
      if (amt > 0) BASE.pile.add(amt);
      BASE.budgetT = 0;
    }
  }
  // Soldiers drill in place; tank turrets swing
  const now = performance.now() / 1000;
  BASE.unitMeshes.inf.forEach((s, i) => animatePerson(s, Math.floor(now + i * 0.1) % 4 < 2, dt));
  BASE.unitMeshes.tank.forEach((m, i) => { m.group.userData.turret.rotation.y = Math.sin(now * 0.4 + i) * 0.6; });
  BASE.generals.forEach((g) => animatePerson(g, false, dt));
  updateMissions(dt);
  updateDefense(dt);
  updateFlight(dt);
}

// --- private jet: a sightseeing flight over the whole map ---
function startFlight() {
  if (BASE.flight || !BASE.myJet) return;
  BASE.flight = { t: 0, from: player.group.position.clone(), zoom: camZoom };
  setZoom(2.4);
  player.group.visible = false;
  toast('🛩️ <b>ขึ้นบินเครื่องบินรบส่วนตัว!</b><br>ชมวิวรอบอาณาจักร', 3000);
  tone(330, 0.5, 'sawtooth', 0.04);
}
function updateFlight(dt) {
  const f = BASE.flight;
  if (!f) return;
  f.t += dt;
  const jet = BASE.myJet;
  const T = 16;
  const k = Math.min(1, f.t / T);
  // Take off along the runway, loop around the whole world, land
  const a = k * Math.PI * 2;
  const h = Math.sin(k * Math.PI) * 26;
  const x = 9 + Math.sin(a) * 45;
  const z = -40 + (1 - Math.cos(a)) * 30;
  jet.position.set(x, Math.max(0, h), z);
  jet.rotation.y = Math.atan2(Math.cos(a), Math.sin(a));
  jet.rotation.z = Math.sin(a) * 0.5;
  player.group.position.set(x, Math.max(0, h), z);
  if (k >= 1) {
    setZoom(f.zoom);
    jet.position.set(9, 0, -58.6);
    jet.rotation.set(0, 0, 0);
    player.group.position.copy(BASE_UNLOCKS[7].at);
    player.group.visible = true;
    BASE.flight = null;
    BASE.opened = true; // landed on the jet's ring: step off before the next flight
    BASE.stand = 0;
    updateCamera(0, true);
  }
}

// --- missions: send the army when trouble strikes ---
const MISSIONS_MIL = [
  { icon: '🌊', name: 'ช่วยผู้ประสบภัยน้ำท่วม', branch: 'navy', need: 60 },
  { icon: '🔥', name: 'ดับไฟป่าทางอากาศ', branch: 'air', need: 80 },
  { icon: '🏔️', name: 'ลาดตระเวนชายแดน', branch: 'army', need: 40 },
  { icon: '🚁', name: 'อพยพผู้ป่วยทางอากาศ', branch: 'air', need: 100 },
  { icon: '🚢', name: 'คุ้มกันเรือสินค้า', branch: 'navy', need: 120 },
  { icon: '🎯', name: 'ซ้อมรบร่วมนานาชาติ', branch: 'army', need: 150 },
  { icon: '🌋', name: 'ช่วยเหลือภัยพิบัติแผ่นดินไหว', branch: 'army', need: 200 },
];
const missionChance = (m) => Math.min(0.95, militaryPower() * branchBonus(m.branch) / m.need);
function newMission() {
  const pool = MISSIONS_MIL.filter((m) => m.need <= Math.max(60, militaryPower() * 2.2));
  const m = { ...pick(pool), deploy: 0 };
  m.reward = Math.round((m.need * 120 * priceMult()) / 100) * 100;
  BASE.mission = m;
  toast(`🚨 <b>เหตุฉุกเฉิน: ${m.icon} ${m.name}</b><br>ไปที่กองบัญชาการ (วงเหลือง) เพื่อส่งกำลัง`, 4500);
  tone(523, 0.15, 'square', 0.04);
}
function dispatchMission() {
  const m = BASE.mission;
  if (!m || m.deploy) return;
  m.deploy = 20;
  m.chance = missionChance(m);
  toast(`🪖 ส่งกำลังไป${m.name}แล้ว · โอกาสสำเร็จ ${Math.round(m.chance * 100)}%`);
  renderMilitary();
}
function updateMissions(dt) {
  if (!baseHas('barracks')) return;
  const m = BASE.mission;
  if (!m) {
    BASE.missionTimer -= dt;
    if (BASE.missionTimer <= 0) {
      BASE.missionTimer = rand(150, 240);
      newMission();
    }
    return;
  }
  // AUTO sends the troops when the odds are good
  if (!m.deploy && autoBadge.classList.contains('show') && missionChance(m) >= 0.7) dispatchMission();
  if (!m.deploy) return;
  m.deploy -= dt;
  if (m.deploy > 0) return;
  BASE.mission = null;
  if (Math.random() < m.chance) {
    addMoney(m.reward);
    B().medals++;
    stats().missions = (stats().missions || 0) + 1;
    burst(player.group.position);
    sfxUnlock();
    toast(`🎖️ <b>ภารกิจสำเร็จ!</b> ${m.icon} ${m.name}<br>รางวัล +${m.reward.toLocaleString()} · เหรียญกล้าหาญ 🏅`, 5000);
  } else {
    // Some units come back needing repairs
    for (const k of Object.keys(UNIT_TYPES)) B().units[k] = Math.floor((B().units[k] || 0) * 0.8);
    syncUnits();
    toast(`😓 ภารกิจ${m.name}ไม่สำเร็จ เสียกำลังพลบางส่วน`, 4000);
  }
  save();
  if (milEl.style.display === 'flex') renderMilitary();
}

// --- special mode: defend the base from a drone raid ---
const DEFEND_HQ = v(31, -33.5);
function startDefense() {
  if (BASE.defense || !baseHas('barracks')) return;
  const count = 12 + Math.min(18, Math.floor(militaryPower() / 20));
  BASE.defense = { left: count, spawn: 0, killed: 0, hp: 10, t: 0 };
  toast(`🛡️ <b>โหมดพิเศษ: ป้องกันฐาน!</b><br>โดรน ${count} ลำกำลังบุก ยืนใกล้ ๆ เพื่อยิง กองทัพช่วยยิงอัตโนมัติ`, 5000);
  [440, 330, 440, 330].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'square', 0.04), i * 300));
}
function updateDefense(dt) {
  if (!BASE.defense) {
    if (baseHas('barracks') && tutorialDone()) {
      BASE.raidTimer -= dt;
      if (BASE.raidTimer <= 0) {
        BASE.raidTimer = rand(420, 600);
        startDefense();
      }
    }
    return;
  }
  const D = BASE.defense;
  D.t += dt;
  D.spawn -= dt;
  if (D.left > 0 && D.spawn <= 0) {
    D.spawn = rand(1.2, 2.4);
    D.left--;
    const m = droneModel();
    m.position.set(rand(-10, 46), 3, -66);
    scene.add(m);
    BASE.drones.push({ m, hp: 3, fire: 0 });
  }
  const pos = player.group.position;
  for (let i = BASE.drones.length - 1; i >= 0; i--) {
    const d = BASE.drones[i];
    const to = DEFEND_HQ.clone().setY(2.5).sub(d.m.position);
    const dist = to.length();
    d.m.position.addScaledVector(to.normalize(), Math.min(dist, 2.2 * dt));
    d.m.userData.rotors.forEach((r) => { r.rotation.y += dt * 30; });
    // The player zaps drones in range
    d.fire -= dt;
    if (player.floor === 0 && flatDist(pos, d.m.position) < 6 && d.fire <= 0) {
      d.fire = 0.3;
      const shot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
      fly(shot, pos.clone().setY(1.2), () => d.m.position.clone(), (s) => {
        scene.remove(s);
        if (BASE.drones.includes(d) && --d.hp <= 0) killDrone(d);
      }, 0.18, 0.2);
    }
    if (dist < 2.5) {
      // Reached the HQ
      D.hp--;
      scene.remove(d.m);
      BASE.drones.splice(i, 1);
      tone(120, 0.3, 'sawtooth', 0.05);
    }
  }
  // The army shoots back: power sets how often
  D.armyT = (D.armyT || 0) - dt;
  if (D.armyT <= 0 && BASE.drones.length) {
    D.armyT = Math.max(0.35, 2.5 - militaryPower() / 60);
    const target = BASE.drones[Math.floor(Math.random() * BASE.drones.length)];
    const from = pick([v(37, -50), v(37, -58), v(0, -59), v(40, -40)]).setY(1.2);
    const tracer = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), new THREE.MeshBasicMaterial({ color: 0xff924c }));
    fly(tracer, from, () => target.m.position.clone(), (s) => {
      scene.remove(s);
      if (BASE.drones.includes(target)) killDrone(target);
    }, 0.4, 3);
  }
  if (D.hp <= 0) endDefense(false);
  else if (D.left <= 0 && !BASE.drones.length) endDefense(true);
}
function killDrone(d) {
  burst(d.m.position);
  scene.remove(d.m);
  BASE.drones.splice(BASE.drones.indexOf(d), 1);
  BASE.defense.killed++;
  sfxPop();
}
function endDefense(win) {
  const D = BASE.defense;
  BASE.defense = null;
  for (const d of BASE.drones) scene.remove(d.m);
  BASE.drones = [];
  if (win) {
    const reward = Math.round(((3000 + militaryPower() * 30) * priceMult()) / 100) * 100;
    addMoney(reward);
    B().medals++;
    stats().defenses = (stats().defenses || 0) + 1;
    sfxUnlock();
    toast(`🏆 <b>ป้องกันฐานสำเร็จ!</b> ยิงโดรน ${D.killed} ลำ<br>รางวัล +${reward.toLocaleString()} · เหรียญกล้าหาญ 🏅`, 5000);
  } else {
    if (BASE.pile) BASE.pile.amount = Math.floor(BASE.pile.amount / 2), BASE.pile.sync();
    toast('💥 ฐานถูกโจมตี งบประมาณหายไปครึ่งหนึ่ง ฝึกกองทัพให้แข็งแกร่งขึ้นนะ', 4500);
  }
  save();
}
function nearestDrone() {
  let best = null;
  for (const d of BASE.drones) if (!best || flatDist(player.group.position, d.m.position) < flatDist(player.group.position, best.m.position)) best = d;
  return best;
}

// --- the command panel ---
const milEl = document.getElementById('military');
function openMilitary() {
  renderMilitary();
  milEl.style.display = 'flex';
}
function renderMilitary() {
  const box = milEl.querySelector('.box');
  box.innerHTML = `<h3>🎖️ กองบัญชาการ</h3><p class="sub">💪 แสนยานุภาพ <b>${militaryPower().toLocaleString()}</b> · 🏅 เหรียญ ${B().medals} · งบประมาณ +${Math.round(militaryPower() * 0.4 * priceMult()).toLocaleString()}/วินาที</p>`;
  for (const [k, t] of Object.entries(UNIT_TYPES)) {
    const built = baseHas(t.from);
    const S = BASE.stations[t.from];
    box.append(emEl('div', 'uprow', `<div class="upico">${t.icon}</div><div class="upinfo"><b>${t.name}</b> <span class="lv">${built ? `${B().units[k] || 0}/${unitCap(k)}` : '🔒'}</span><br><small>${built ? (S?.staffed ? 'มีผู้บังคับหน่วยฝึกให้อัตโนมัติ' : 'ยืนวงเขียวหน้าอาคารเพื่อฝึก หรือจ้างผู้บังคับหน่วย') : `สร้าง${BASE_UNLOCKS.find((u) => u.id === t.from).name}ก่อน`} · พลัง ${t.power}/หน่วย</small></div>`));
  }
  // Mission
  const m = BASE.mission;
  const mc = emEl('div', 'branchcard', m ? `<b>🚨 ${m.icon} ${m.name}</b><br><small>${m.deploy ? `กำลังปฏิบัติภารกิจ… ${Math.ceil(m.deploy)} วินาที` : `โอกาสสำเร็จ ${Math.round(missionChance(m) * 100)}% · รางวัล 💵${m.reward.toLocaleString()}`}</small><br>` : '<small>ยังไม่มีเหตุฉุกเฉิน · เดี๋ยวจะมีภารกิจเข้ามา</small>');
  if (m && !m.deploy) mc.append(emButton('🪖 ส่งกำลัง', !baseHas('barracks'), dispatchMission));
  box.append(mc);
  const dc = emEl('div', 'branchcard', `<b>🛡️ ซ้อมป้องกันฐาน (โหมดพิเศษ)</b><br><small>โดรนบุกฐาน ยิงให้หมดก่อนถึงกองบัญชาการ ชนะได้รางวัลและเหรียญ</small><br>`);
  dc.append(emButton(BASE.defense ? 'กำลังป้องกัน…' : '▶ เริ่มเลย', Boolean(BASE.defense) || !baseHas('barracks'), () => { startDefense(); milEl.style.display = 'none'; }));
  box.append(dc);
  // Generals
  const cost = recruitCost();
  const gc = emEl('div', 'branchcard', `<b>🎖️ แต่งตั้งนายพล</b><br><small>นายพลแต่ละคนเพิ่มพลังและความเร็วฝึกของเหล่าทัพ +5% ต่อดาว</small><br>`);
  gc.append(emButton(`แต่งตั้ง · 💵${cost.toLocaleString()}`, state.money < cost, recruitGeneral));
  box.append(gc);
  for (const g of [...B().generals].sort((a, b) => b.stars - a.stars)) {
    box.append(emEl('div', 'uprow', `<div class="upico">${{ army: '🪖', navy: '⚓', air: '✈️' }[g.branch]}</div><div class="upinfo"><b>${GEN_RANK[g.branch]}${g.name}</b><br><small>${'⭐'.repeat(g.stars)} · ${{ army: 'กองทัพบก', navy: 'กองทัพเรือ', air: 'กองทัพอากาศ' }[g.branch]} +${g.stars * 5}%</small></div>`));
  }
  const close = emEl('button', 'btn ghost', 'ปิด');
  close.addEventListener('click', () => { milEl.style.display = 'none'; });
  box.append(close);
}
function recruitGeneral() {
  const cost = recruitCost();
  if (state.money < cost) return;
  state.money -= cost;
  updateMoney();
  B().recruits++;
  const r = Math.random();
  const stars = r < 0.45 ? 1 : r < 0.75 ? 2 : r < 0.92 ? 3 : r < 0.98 ? 4 : 5;
  const g = { name: pick(GEN_FIRST), branch: pick(['army', 'navy', 'air']), stars };
  B().generals.push(g);
  syncGenerals();
  (stars >= 4 ? sfxUnlock : sfxCoin)();
  toast(`🎖️ <b>${GEN_RANK[g.branch]}${g.name}</b> ${'⭐'.repeat(stars)}<br>เข้าประจำการแล้ว!`, 3500);
  save();
  renderMilitary();
}

// --- AUTO and routing ---
function baseRoute(from, to) {
  if (flatDist(from, to) < 1.5) return to;
  if (Math.abs(from.x - 20) > 1.2) return v(20, from.z);
  if (Math.abs(from.z - to.z) > 0.5) return v(20, to.z);
  return to;
}
function baseTask() {
  if (!baseOpen()) return null;
  if (BASE.defense) {
    const d = nearestDrone();
    if (d) return { at: v(d.m.position.x, Math.min(-30, d.m.position.z)), keep: () => BASE.drones.includes(d) };
  }
  const u = BASE_UNLOCKS[B().step];
  if (u && BASE.tile && state.money >= u.price - B().paid) return { at: u.at, keep: () => BASE_UNLOCKS[B().step] === u && state.money > 0 };
  return null;
}
function basePerSecond() {
  return militaryPower() * 0.4 * priceMult();
}

// ---------- story: Dr. Quest's journey, from one small clinic to conquering the world ----------
// Nine chapters, each a few goals. Finishing a chapter pays a reward and tells the next part
// of the story; the guide arrow and dock buttons point at whatever the current goal needs.
const topStep = () => Math.max(state.step, ...state.branches.map((b) => b?.step || 0));
const campusCount = () => Math.max(campus.owned.length, ...state.branches.map((b) => b?.campus?.owned?.length || 0));
const baseStep = () => state.base?.step || 0;
const has = (id) => topStep() > UNLOCKS.findIndex((u) => u.id === id);
const STORY = [
  { icon: '🩺', name: 'คลินิกเล็ก ๆ', story: 'Dr. Quest ใช้เงินเก็บก้อนสุดท้ายเปิดคลินิกเล็ก ๆ ริมถนน ชาวบ้านต่อคิวรอหมอใจดีคนนี้อยู่แล้ว!', reward: 300,
    goals: [
      { text: 'เรียนรู้การรักษาคนไข้ (บทสอน)', ok: () => tutorialDone() },
      { text: 'เปิดห้องฉีดวัคซีน 💉', ok: () => has('vaccine') },
      { text: 'เปิดห้องเอกซเรย์ 🩻', ok: () => has('xray') },
    ] },
  { icon: '🏥', name: 'โรงพยาบาลของชุมชน', story: 'ข่าวลือว่ามีหมอเก่งมาเปิดคลินิกแพร่ไปทั่ว คนไข้มาจากหมู่บ้านข้าง ๆ คลินิกต้องโตเป็นโรงพยาบาลแล้ว!', reward: 2000,
    goals: [
      { text: 'รถพยาบาลรับคนไข้ 🚑', ok: () => has('ambulance') },
      { text: 'ห้องผ่าตัดพร้อมศัลยแพทย์ 🫀', ok: () => has('surgeon') },
      { text: 'รักษาคนไข้ครบ 100 คน', ok: () => (stats().served || 0) >= 100, n: () => `${Math.min(100, stats().served || 0)}/100` },
    ] },
  { icon: '🛗', name: 'ขึ้นชั้นสองและวิทยาเขต', story: 'ที่ดินข้าง ๆ ว่างอยู่ และผู้ป่วยต้องนอนพัก Dr. Quest ตัดสินใจสร้างชั้นสองและซื้อที่ดินฝั่งตะวันออกทำวิทยาเขตสุขภาพ', reward: 8000,
    goals: [
      { text: 'ลิฟต์ขึ้นชั้น 2 🛗', ok: () => has('elevator') },
      { text: 'หอผู้ป่วยใน 🛏️', ok: () => has('ward') },
      { text: 'ซื้ออาคารแรกในวิทยาเขต (ทางขวาของ รพ.)', ok: () => campusCount() >= 1, at: () => (campusOpen() && state.step >= CAMPUS_OPEN_STEP ? CAMPUS_LOTS[0].front : null) },
    ] },
  { icon: '🏙️', name: 'เมืองหมอ', story: 'รอบโรงพยาบาลเริ่มมีบ้านเรือน ร้านค้า และโรงเรียนแพทย์ Dr. Quest กลายเป็นผู้สร้างเมืองแห่งสุขภาพ', reward: 20000,
    goals: [
      { text: 'สร้างอาคารแรกในเมือง (กด 🌏 อาณาจักร)', ok: () => builtPlots() >= 1, btn: 'branchbtn' },
      { text: 'โรงพยาบาลครบ 24 แผนกแรก', ok: () => topStep() >= CORE_STEPS },
      { text: 'เมืองมี 4 อาคาร', ok: () => builtPlots() >= 4, btn: 'branchbtn', n: () => `${Math.min(4, builtPlots())}/4` },
    ] },
  { icon: '🎖️', name: 'ค่ายทหารปกป้องเมือง', story: 'เมืองรุ่งเรืองจนมีภัยคุกคาม! กองทัพขอให้ Dr. Quest สร้างค่ายทหารทางเหนือของวิทยาเขต พร้อมเปิดโรงพยาบาลสาขาที่สอง', reward: 50000,
    goals: [
      { text: 'สร้างกองบัญชาการค่ายทหาร 🏛️', ok: () => baseStep() >= 1, at: () => (baseOpen() && baseStep() < 1 ? BASE_UNLOCKS[0].at : null) },
      { text: 'บ้านพักทหาร 🏠', ok: () => baseStep() >= 3, at: () => (baseOpen() && baseStep() < 3 ? BASE_UNLOCKS[baseStep()].at : null) },
      { text: 'เปิดโรงพยาบาลสาขา 2 (🌏 → สาขา)', ok: () => state.branches.length >= 2, btn: 'branchbtn' },
    ] },
  { icon: '🏞️', name: 'หมอประจำจังหวัด', story: 'ผู้ว่าฯ เชิญ Dr. Quest ดูแลทั้งจังหวัด! เติมเมืองให้ครบ แล้วยกระดับเป็นจังหวัดแห่งสุขภาพ', reward: 150000,
    goals: [
      { text: 'เมืองครบ 8 แปลง', ok: () => builtPlots() >= 8, btn: 'branchbtn', n: () => `${Math.min(8, builtPlots())}/8` },
      { text: 'ยกระดับเป็นจังหวัด 🏞️', ok: () => emp().tier >= 1, btn: 'branchbtn' },
      { text: 'ดาดฟ้าและลานเฮลิคอปเตอร์ 🚁', ok: () => has('roof') },
    ] },
  { icon: '🗾', name: 'หมอใหญ่ประจำภาค', story: 'ภัยธรรมชาติและโรคระบาดเกิดหลายจังหวัดพร้อมกัน ต้องมีกองทัพเรือและโรงพยาบาลหลายชั้นรับมือ', reward: 1500000,
    goals: [
      { text: 'ท่าเรือกองทัพเรือ ⚓', ok: () => baseStep() >= 6, at: () => (baseOpen() && baseStep() >= 3 && baseStep() < 6 ? BASE_UNLOCKS[baseStep()].at : null) },
      { text: 'ชั้น 3 เปิดบริการ 🧠', ok: () => has('floor3') },
      { text: 'ยกระดับเป็นภูมิภาค 🗾', ok: () => emp().tier >= 2, btn: 'branchbtn' },
    ] },
  { icon: '🗺️', name: 'หมอแห่งชาติ', story: 'ทั้งประเทศรู้จัก Dr. Quest แล้ว! สร้างโรงพยาบาลให้ครบทุกชั้น และกองทัพที่มีทั้งฐานบินและเครื่องบินรบส่วนตัว', reward: 15000000,
    goals: [
      { text: 'ค่ายทหารครบทุกอาคาร ✈️🛩️', ok: () => baseStep() >= BASE_UNLOCKS.length, at: () => (baseOpen() && baseStep() >= 6 && baseStep() < BASE_UNLOCKS.length ? BASE_UNLOCKS[baseStep()].at : null) },
      { text: 'โรงพยาบาลครบทุกชั้นทุกแผนก 🏢', ok: () => topStep() >= UNLOCKS.length },
      { text: 'ยกระดับเป็นประเทศ 🗺️', ok: () => emp().tier >= 3, btn: 'branchbtn' },
    ] },
  { icon: '🌏', name: 'พิชิตโลก', story: 'โลกทั้งใบรอหมอคนนี้อยู่ ทุกทวีปต้องการโรงพยาบาลของ Dr. Quest — นี่คือบทสุดท้าย!', reward: 0,
    goals: [
      { text: 'ยกระดับเป็นโลก 🌏', ok: () => emp().tier >= 4, btn: 'branchbtn' },
      { text: 'พัฒนาทุกทวีปบนแผนที่โลกอย่างน้อย Lv.1', ok: () => emp().tier >= 4 && tierFilled(4), btn: 'branchbtn', n: () => (emp().tier >= 4 ? `${nodeLevels(4).filter((l) => l > 0).length}/${nodeLevels(4).length}` : '') },
    ] },
];
const defaultStory = () => ({ ch: 0 });
const story = () => {
  if (!state.story) state.story = defaultStory();
  return state.story;
};
const storyDone = () => story().ch >= STORY.length;
const curChapter = () => STORY[story().ch];
const curGoal = () => curChapter()?.goals.find((g) => !g.ok());
const conquered = () => (state.conquests || 0) > 0;

// Where the arrow should point for the current goal (only when nothing more urgent is going on)
function storyTarget() {
  if (storyDone() || player.floor !== 0) return null;
  return curGoal()?.at?.() || null;
}

// Anonymous milestones (chapter reached, minutes played) so we can see where players stop.
// Only a random per-browser id is sent: no save, name or device key.
function logProgress(kind) {
  if (CLOUD_OFF) return;
  let anon = '';
  try {
    anon = localStorage.getItem('drquest-anon') || '';
    if (!anon) {
      anon = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem('drquest-anon', anon);
    }
  } catch {
    return;
  }
  rpc('log_progress', { p_anon: anon, p_kind: kind, p_minutes: Math.round((stats().play || 0) / 60) }).catch(() => {});
}

const questEl = document.getElementById('quest');
let questHtml = '';
let storyTimer = 0;
let storyBtn = null;
function updateStory(dt) {
  stats().play = (stats().play || 0) + dt;
  storyTimer -= dt;
  if (storyTimer > 0) return;
  storyTimer = 0.5;
  const s = story();
  // Saves from before the story skip the chapters they already finished, without rewards
  if (s.catchup) {
    while (!storyDone() && curChapter().goals.every((g) => g.ok())) s.ch++;
    delete s.catchup;
  }
  if (!storyDone() && curChapter().goals.every((g) => g.ok())) {
    const done = curChapter();
    s.ch++;
    if (done.reward) addMoney(done.reward, false);
    sfxUnlock();
    logProgress(`ch${s.ch + 1}`);
    if (!storyDone()) {
      const next = curChapter();
      toast(`📖 <b>จบบทที่ ${s.ch}: ${done.name}</b>${done.reward ? ` · รางวัล 💵${done.reward.toLocaleString()}` : ''}<br>${next.icon} บทที่ ${s.ch + 1}: <b>${next.name}</b><br><small>${next.story}</small>`, 7000);
    }
    save();
  }
  if (storyDone() && (state.conquestRun ?? -1) !== prs().runs) {
    state.conquestRun = prs().runs;
    state.conquests = (state.conquests || 0) + 1;
    logProgress(`conquer${state.conquests}`);
    save();
    showEnding();
  }
  // Point a dock button at the goal when it lives in a panel
  const g = storyDone() ? null : curGoal();
  const btn = tutorialDone() && g?.btn ? document.getElementById(g.btn) : null;
  if (btn !== storyBtn) {
    storyBtn?.classList.remove('questing');
    btn?.classList.add('questing');
    storyBtn = btn;
  }
  let html = '';
  if (!tutorialDone()) html = '';
  else if (storyDone()) html = `👑 พิชิตโลกแล้ว${state.conquests > 1 ? ` ×${state.conquests}` : ''}`;
  else {
    const ch = curChapter();
    const n = ch.goals.filter((x) => x.ok()).length;
    html = `${ch.icon} บท ${s.ch + 1}/${STORY.length} · ${g ? g.text.replace(/\s*\(.*\)$/, '') : ''}${g?.n ? ` ${g.n()}` : ''} <span class="qn">${n}/${ch.goals.length}</span>`;
  }
  if (html !== questHtml) {
    questHtml = html;
    questEl.innerHTML = html;
    questEl.style.display = html ? 'block' : 'none';
  }
}

const storyEl = document.getElementById('storypanel');
function openStory() {
  const box = storyEl.querySelector('.box');
  const s = story();
  box.innerHTML = `<h3>📖 เส้นทางของ Dr. Quest</h3><p class="sub">${storyDone() ? '👑 คุณพิชิตโลกแล้ว!' : `บทที่ ${s.ch + 1} จาก ${STORY.length}`}</p>`;
  STORY.forEach((ch, i) => {
    const done = i < s.ch;
    const cur = i === s.ch;
    const el = emEl('div', `chap${done ? ' done' : ''}${cur ? ' cur' : ''}${i > s.ch ? ' locked' : ''}`);
    let inner = `<b>${done ? '✅' : i > s.ch ? '🔒' : ch.icon} บทที่ ${i + 1}: ${i > s.ch ? '???' : ch.name}</b>`;
    if (i <= s.ch) inner += `<small class="st">${ch.story}</small>`;
    if (cur) inner += ch.goals.map((g) => `<div class="goal${g.ok() ? ' ok' : ''}">${g.ok() ? '✅' : '⬜'} ${g.text}${g.n && !g.ok() ? ` <small>${g.n()}</small>` : ''}</div>`).join('');
    if (i <= s.ch && ch.reward) inner += `<small class="rw">รางวัล 💵${ch.reward.toLocaleString()}</small>`;
    el.innerHTML = inner;
    box.append(el);
  });
  if (conquered()) box.append(emButton('🎬 ดูฉากจบอีกครั้ง', false, () => { storyEl.style.display = 'none'; showEnding(); }));
  box.append(emButton('ปิด', false, () => { storyEl.style.display = 'none'; }));
  box.lastChild.classList.add('ghost');
  storyEl.style.display = 'flex';
}
questEl.addEventListener('click', openStory);

// ---------- the ending: the whole world is built ----------
const endEl = document.getElementById('ending');
const fmtHours = (sec) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h ? `${h} ชม. ${m} นาที` : `${m} นาที`;
};
function showEnding() {
  const st = stats();
  const gain = starsToGain();
  const box = endEl.querySelector('.box');
  box.innerHTML = `<div class="crown">👑</div><h2>พิชิตโลกแล้ว!</h2>
    <p class="lead">จากคลินิกเล็ก ๆ ริมถนน วันนี้ Dr. Quest ดูแลสุขภาพคนทั้งโลก<br>ขอบคุณที่สร้างอาณาจักรแห่งการรักษามาด้วยกัน</p>
    <div class="estats">
      <div><b>${fmtHours(st.play || 0)}</b><small>เวลาที่เล่น</small></div>
      <div><b>💵${Math.floor(state.earned).toLocaleString()}</b><small>รายได้สะสม</small></div>
      <div><b>${(st.served || 0).toLocaleString()}</b><small>คนไข้ที่รักษา</small></div>
      <div><b>${state.branches.length}</b><small>สาขา</small></div>
      <div><b>💪${militaryPower().toLocaleString()}</b><small>แสนยานุภาพ</small></div>
      <div><b>🏅${(state.achievements || []).length}/${ACHIEVEMENTS.length}</b><small>ความสำเร็จ</small></div>
    </div>
    <p class="title">ตำแหน่งใหม่บนตารางอันดับ: <b>👑 จักรพรรดิแพทย์โลก</b>${state.conquests > 1 ? ` ×${state.conquests}` : ''}</p>
    <div class="credits"><div class="roll">
      <b>Dr. Quest World</b><br><br>
      <small>ออกแบบเกมและไอเดีย</small><br>ทีม Dr. Quest<br><br>
      <small>พัฒนาเกม</small><br>Claude Code<br><br>
      <small>ภาพวิทยาเขต</small><br>Healthcare-Simulator-Starter<br><br>
      <small>เครื่องยนต์สามมิติ</small><br>three.js<br><br>
      <small>ขอบคุณเป็นพิเศษ</small><br>คุณหมอ พยาบาล และเจ้าหน้าที่ทุกคน<br>ที่ดูแลพวกเราในชีวิตจริง 💚<br><br>
      <b>ขอบคุณที่เล่นจนจบ!</b>
    </div></div>`;
  box.append(emButton(gain >= 1 ? `⭐ เกิดใหม่ รับ ${gain} ดาว (เริ่มเส้นทางใหม่ เก่งกว่าเดิม)` : '⭐ เกิดใหม่', gain < 1, () => { endEl.style.display = 'none'; doPrestige(); }));
  box.append(emButton('🌏 เล่นต่อในโลกนี้', false, () => { endEl.style.display = 'none'; }));
  box.lastChild.classList.add('ghost');
  endEl.style.display = 'flex';
  toastEl.classList.remove('show');
  sfxUnlock();
  for (let i = 0; i < 6; i++) setTimeout(() => burst(player.group.position), i * 350);
}

// ---------- city life: a game clock, named citizens, traffic, the city advisor and medical tourists ----------
// Ideas from city builders: the city's people live out their days (home, work, shops), fall ill and
// come to the hospital by name; cars fill the roads at rush hour and slow the ambulances unless the
// roads are improved; an advisor reads the city; tourists fly in for treatment and pay more.

// --- the game clock: one game minute = 0.5 s at 1×; the speed button runs the world 1×, 2× or 3× ---
const CLOCK_RATE = 2; // game minutes per real second
const defaultCity = () => ({ day: 1, min: 7 * 60, hp: [], log: {}, sickAt: {}, lights: 0, round: false, wide: false, tourists: 0, touristCash: 0, treated: 0 });
const cityState = () => {
  if (!state.city) state.city = defaultCity();
  return state.city;
};
let gameSpeed = 1;
try {
  gameSpeed = Math.min(3, Math.max(1, Number(localStorage.getItem('drquest-speed')) || 1));
} catch {
  gameSpeed = 1;
}
const clockHour = () => Math.floor(cityState().min / 60);
const clockText = () => {
  const m = Math.floor(cityState().min);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const DAY_NAMES = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสฯ', 'ศุกร์', 'เสาร์'];
function tickClock(dt) {
  const c = cityState();
  c.min += dt * CLOCK_RATE;
  if (c.min >= 24 * 60) {
    c.min -= 24 * 60;
    c.day++;
    newCityDay();
  }
}

// --- citizens: one per home level ×4 (up to 60), each with a name, a home, a job and a health bar ---
const FIRST = ['สมชาย', 'สมหญิง', 'มานี', 'มานะ', 'ปิติ', 'ชูใจ', 'วีระ', 'ดวงใจ', 'อนันต์', 'กานดา', 'ประยุทธ', 'สุดา', 'ธนา', 'พิมพ์', 'ณัฐ', 'ฟ้าใส', 'ภูมิ', 'แก้ว', 'บุญมี', 'จันทร์เพ็ญ', 'ต้นกล้า', 'น้ำฝน', 'ก้อง', 'ใบเตย', 'เอก', 'มะลิ', 'ทองดี', 'ปลายฟ้า', 'วินัย', 'อรุณี'];
const LAST = ['ใจดี', 'รักสุข', 'มีสุข', 'แข็งแรง', 'สายบุญ', 'ศรีสุข', 'ทองคำ', 'บุญมา', 'แสงทอง', 'ชื่นใจ'];
const JOBS = {
  school: ['ครูโรงเรียนแพทย์', 'นักศึกษาแพทย์'],
  factory: ['พนักงานโรงงานยา', 'วิศวกรโรงงานยา'],
  bank: ['พนักงานธนาคาร', 'ผู้จัดการธนาคาร'],
  market: ['แม่ค้าตลาด', 'พ่อค้าผลไม้'],
  garden: ['คนสวน', 'ครูโยคะในสวน'],
};
const CITIZEN_ICONS = ['🧑', '👩', '👨', '👵', '👴', '🧒'];
const citizenCount = () => Math.min(60, cityLevel('homes') * 4);
const plotsOf = (types) => (emp()?.plots || []).map((p, i) => (p && types.includes(p.type) ? i : -1)).filter((i) => i >= 0);
// Stable details from the citizen's number, so nothing but health needs saving
function citizen(i) {
  const homes = plotsOf(['homes']);
  const work = plotsOf(['school', 'factory', 'bank', 'market', 'garden']);
  const job = work.length ? work[(i * 7 + 3) % work.length] : -1;
  const jobType = job >= 0 ? emp().plots[job].type : null;
  const age = 6 + ((i * 37) % 76);
  return {
    i,
    name: `${FIRST[(i * 11) % FIRST.length]} ${LAST[(i * 3 + Math.floor(i / FIRST.length)) % LAST.length]}`,
    icon: age < 15 ? '🧒' : age > 64 ? (i % 2 ? '👴' : '👵') : CITIZEN_ICONS[i % 3],
    age,
    home: homes.length ? homes[i % homes.length] : -1,
    job: age < 15 || age > 64 ? -1 : job,
    jobName: age < 15 ? 'นักเรียน' : age > 64 ? 'วัยเกษียณ' : jobType ? JOBS[jobType][i % 2] : 'ว่างงาน',
  };
}
const citizenHp = (i) => cityState().hp[i] ?? 90;
const isSick = (i) => citizenHp(i) < 35;
function citizenStatus(i) {
  if (patients.some((p) => p.citizen === i && !p.leaving)) return { icon: '🏥', text: 'กำลังรักษาที่โรงพยาบาล' };
  if (isSick(i)) return { icon: '🤒', text: 'ไม่สบาย กำลังมาโรงพยาบาล' };
  const h = clockHour();
  const c = citizen(i);
  if (h < 6 || h >= 22) return { icon: '😴', text: 'นอนหลับอยู่ที่บ้าน' };
  if (h < 8) return { icon: '🚶', text: c.job >= 0 ? 'กำลังเดินทางไปทำงาน' : 'ตื่นนอน กินข้าวเช้า' };
  if (h < 12 || (h >= 13 && h < 17)) return c.job >= 0 ? { icon: '💼', text: `ทำงานเป็น${c.jobName}` } : c.age < 15 ? { icon: '📚', text: 'เรียนหนังสือ' } : { icon: '🏡', text: 'พักผ่อนที่บ้าน' };
  if (h < 13) return { icon: '🍜', text: 'พักกินข้าวกลางวัน' };
  if (h < 19) return plotsOf(['market']).length ? { icon: '🛒', text: 'ซื้อของที่ตลาด' } : { icon: '🚶', text: 'เดินทางกลับบ้าน' };
  return plotsOf(['garden']).length && i % 3 === 0 ? { icon: '🌳', text: 'เดินเล่นในสวน' } : { icon: '🏠', text: 'อยู่บ้านกับครอบครัว' };
}
// Where a citizen should be right now (for the walkers on the district road)
function citizenPlace(i) {
  const c = citizen(i);
  const h = clockHour();
  const at = (plot) => (plot >= 0 && district.plots[plot] ? plotZone(district.plots[plot].at) : null);
  if (h >= 8 && h < 17 && c.job >= 0) return at(c.job);
  if (h >= 17 && h < 19) return at(plotsOf(['market'])[i % Math.max(1, plotsOf(['market']).length)] ?? -1) || at(c.home);
  return at(c.home);
}
function cityLog(i, text) {
  const c = cityState();
  const list = (c.log[i] = c.log[i] || []);
  list.unshift(`วัน ${c.day} ${clockText()} · ${text}`);
  if (list.length > 6) list.length = 6;
}

// Every game hour: health drifts with the city (parks and the hospital's rating help); the sick head in
let cityHourAt = -1;
function tickCitizens() {
  const c = cityState();
  const n = citizenCount();
  const hour = c.day * 24 + clockHour();
  if (hour === cityHourAt) return;
  cityHourAt = hour;
  const parks = cityLevel('garden') + (OUT.park ? 2 : 0);
  for (let i = 0; i < n; i++) {
    if (c.hp[i] == null) c.hp[i] = 70 + ((i * 13) % 30);
    if (isSick(i)) continue;
    const drop = Math.random() < 0.06 ? rand(4, 14) : rand(0, 1.6);
    c.hp[i] = Math.max(0, Math.min(100, c.hp[i] - drop * (1 - Math.min(0.5, parks * 0.04)) + (Math.random() < 0.3 ? 1 : 0)));
    if (isSick(i)) {
      c.sickAt[i] = hour;
      cityLog(i, '🤒 รู้สึกไม่สบาย');
    }
  }
}
// Sick citizens come in as patients (one at a time per citizen), marked 🏠 with their name
function citizenPatientDue() {
  const n = citizenCount();
  for (let i = 0; i < n; i++) if (isSick(i) && !patients.some((p) => p.citizen === i)) return i;
  return -1;
}
function citizenTreated(p) {
  const c = cityState();
  c.hp[p.citizen] = 100;
  c.treated++;
  delete c.sickAt[p.citizen];
  const who = citizen(p.citizen);
  cityLog(p.citizen, `💚 รักษาหายที่${serviceIcon(p.kind)} โรงพยาบาลสาขา ${state.branch + 1}`);
  floatText(p.person.group.position, `💚 คุณ${who.name.split(' ')[0]} หายป่วยแล้ว`, '#8be08f');
}
function citizenLeftAngry(p) {
  cityLog(p.citizen, '😡 รอนานเกินไป กลับบ้านไปก่อน');
  cityState().hp[p.citizen] = Math.max(cityState().hp[p.citizen] || 0, 25);
}
function newCityDay() {
  const c = cityState();
  // Anyone left sick for a whole day loses faith in the hospital a little
  const longSick = Object.values(c.sickAt).filter((h) => c.day * 24 - h > 24).length;
  if (longSick) changeRating(-0.05 * Math.min(4, longSick));
  toast(`🌅 <b>วัน${DAY_NAMES[c.day % 7]}ที่ ${c.day}</b><br><small>ชาวเมือง ${citizenCount()} คน · รักษาหายแล้ว ${c.treated} ครั้ง${c.tourists ? ` · นักท่องเที่ยว ${c.tourists} คน` : ''}</small>`, 3500);
}

// --- traffic: cars on the main road and the district road; lights, a roundabout and a wider road ease it ---
const TRAFFIC = {
  lights: { icon: '🚦', name: 'ไฟจราจรอัจฉริยะ', max: 3, cost: (l) => [20000, 80000, 250000][l], desc: 'สัญญาณไฟที่สี่แยก ลดรถติด' },
  round: { icon: '🔄', name: 'วงเวียนหน้าโรงพยาบาล', max: 1, cost: () => 400000, desc: 'รถไหลต่อเนื่อง ไม่ต้องรอไฟแดง' },
  wide: { icon: '🛣️', name: 'ขยายถนนเป็น 4 เลน', max: 1, cost: () => 1200000, desc: 'รับรถได้มากขึ้นเกือบเท่าตัว' },
};
const roadCapacity = () => 10 + 4 * cityState().lights + (cityState().round ? 6 : 0) + (cityState().wide ? 10 : 0);
const rushHour = () => [7, 8, 17, 18].includes(clockHour());
function carDemand() {
  const base = 2 + builtPlots() * 0.5 + citizenCount() * 0.12 + cityState().tourists * 0.02;
  return base * (rushHour() ? 1.8 : clockHour() < 6 || clockHour() >= 22 ? 0.4 : 1);
}
// 0 = clear, 1 = gridlock
const jam = () => (builtPlots() < 1 ? 0 : Math.max(0, Math.min(1, (carDemand() - roadCapacity()) / roadCapacity() + 0.15)));
// Jams slow the ambulances (fewer arrivals, emergencies lose patience)
const trafficArrival = () => 1 - 0.3 * jam();
const jamText = (j) => (j < 0.25 ? '🟢 คล่องตัว' : j < 0.5 ? '🟡 หนาแน่น' : j < 0.75 ? '🟠 รถติด' : '🔴 ติดหนัก');

const traffic = { cars: [], lights: [], phase: 0, built: false };
const CAR_COLORS = [0xe5484d, 0x3d8bfd, 0xffd166, 0xffffff, 0x2ec4b6, 0x9b5de5, 0x555b6e, 0xff8c42];
function makeCar() {
  const g = new THREE.Group();
  const body = box(1.5, 0.42, 0.78, pick(CAR_COLORS));
  body.position.y = 0.32;
  const cab = box(0.8, 0.34, 0.7, 0xcfe8ff, { shadow: false });
  cab.position.set(-0.1, 0.7, 0);
  g.add(body, cab);
  for (const [x, z] of [[-0.48, 0.4], [0.48, 0.4], [-0.48, -0.4], [0.48, -0.4]]) {
    const w = box(0.3, 0.3, 0.1, 0x222222, { shadow: false });
    w.position.set(x, 0.16, z);
    g.add(w);
  }
  scene.add(g);
  return g;
}
// Intersections on the main road with a light once bought: the district road, the gate, the campus avenue
const CROSSINGS = () => [DIST_ROAD_X, GATE.x, CAMPUS_X];
function syncTrafficLights() {
  const want = cityState().round ? 0 : cityState().lights;
  while (traffic.lights.length < want) {
    const x = CROSSINGS()[traffic.lights.length];
    const g = new THREE.Group();
    const pole = box(0.12, 2.4, 0.12, 0x444444);
    pole.position.y = 1.2;
    const head = box(0.3, 0.7, 0.3, 0x222222);
    head.position.y = 2.5;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0x3fbf5f }));
    lamp.position.set(0, 2.5, 0.17);
    g.add(pole, head, lamp);
    g.position.set(x - 1.6, 0, ROAD_Z - 1.5);
    scene.add(g);
    popIn(g);
    traffic.lights.push({ g, lamp, x });
  }
  while (traffic.lights.length > want) scene.remove(traffic.lights.pop().g);
  if (cityState().round && !traffic.round) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.1, 28), mat(0x7ccf5a));
    ring.position.set(GATE.x, 0.06, ROAD_Z);
    const fountain = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.9, 12), mat(0x9fd8ff));
    fountain.position.set(GATE.x, 0.5, ROAD_Z);
    scene.add(ring, fountain);
    traffic.round = [ring, fountain];
  }
}
function updateTraffic(dt) {
  if (!running || !district.built || builtPlots() < 1) return;
  syncTrafficLights();
  const want = Math.min(22, Math.round(carDemand()));
  while (traffic.cars.length < want) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const lanes = cityState().wide ? [0.55, 1.35] : [0.8];
    const lane = pick(lanes) * (dir > 0 ? 1 : -1);
    const g = makeCar();
    const x = dir > 0 ? -62 : 62;
    g.position.set(x, 0, ROAD_Z + lane);
    g.rotation.y = dir > 0 ? 0 : Math.PI;
    traffic.cars.push({ g, dir, lane, v: rand(5, 7) });
  }
  // Lights: main road green 7 s, red 4 s
  traffic.phase = (traffic.phase + dt) % 11;
  const red = traffic.lights.length && traffic.phase > 7;
  for (const L of traffic.lights) L.lamp.material.color.set(red ? 0xe5484d : 0x3fbf5f);
  const j = jam();
  for (let k = traffic.cars.length - 1; k >= 0; k--) {
    const c = traffic.cars[k];
    const x = c.g.position.x;
    let speed = c.v * (1 - 0.65 * j);
    // Keep a gap to the car ahead in the same lane
    for (const o of traffic.cars) {
      if (o === c || o.lane !== c.lane) continue;
      const ahead = (o.g.position.x - x) * c.dir;
      if (ahead > 0 && ahead < 2.1) speed = Math.min(speed, Math.max(0, (ahead - 1.7) * 4));
    }
    // Stop at a red light before the crossing
    if (red) for (const L of traffic.lights) {
      const to = (L.x - x) * c.dir;
      if (to > 1.4 && to < 2.6) speed = 0;
    }
    c.g.position.x += speed * c.dir * dt;
    if (Math.abs(c.g.position.x) > 64 || traffic.cars.length > want + 2) {
      scene.remove(c.g);
      traffic.cars.splice(k, 1);
    }
  }
}
function buyTraffic(id) {
  const t = TRAFFIC[id];
  const c = cityState();
  const lvl = id === 'lights' ? c.lights : c[id] ? 1 : 0;
  if (lvl >= t.max || !empireSpend(t.cost(lvl))) return;
  if (id === 'lights') c.lights++;
  else c[id] = true;
  burst(player.group.position);
  toast(`${t.icon} <b>${t.name}</b> เสร็จแล้ว!<br><small>การจราจร: ${jamText(jam())}</small>`, 3500);
  save();
  renderCityHub();
}

// --- medical tourists: fly in for treatment, pay 3×, more come to a pretty, well-rated city ---
const FLAGS = ['🇯🇵', '🇨🇳', '🇰🇷', '🇺🇸', '🇬🇧', '🇩🇪', '🇫🇷', '🇦🇺', '🇮🇳', '🇸🇬', '🇦🇪', '🇸🇪'];
function tourismScore() {
  return Math.max(0, Math.round(
    cityLevel('garden') * 1.5 + cityLevel('market') + (OUT.park ? 2 : 0) + (OUT.kiosk ? 1 : 0)
    + comfort() / 4 + Math.max(0, state.rating - 3.5) * 4 + campusCount() * 0.6 + emp().tier * 2 - jam() * 4,
  ));
}
PATIENT_TYPES.tourist = { weight: 0, from: 8, patience: 50, pay: 3, speed: 3.1, badge: '✈️', shirt: 0x7fd1ff };
let tourWeightT = 0;
function tickTourism(dt) {
  tourWeightT -= dt;
  if (tourWeightT > 0) return;
  tourWeightT = 3;
  PATIENT_TYPES.tourist.weight = builtPlots() >= 1 ? Math.min(12, tourismScore()) : 0;
}

// --- the advisor: reads the city, says what's going well, what needs care, and what to do first ---
function demandRows() {
  const n = citizenCount();
  const jobs = (cityLevel('school') + cityLevel('factory') + cityLevel('bank') + cityLevel('market') + cityLevel('garden')) * 4;
  const workers = Array.from({ length: n }, (_, i) => citizen(i)).filter((c) => c.age >= 15 && c.age <= 64).length;
  const shops = cityLevel('market') * 8;
  const parks = (cityLevel('garden') + (OUT.park ? 2 : 0)) * 8;
  const beds = [state.unlocked.has('ward'), state.unlocked.has('beds2'), state.unlocked.has('beds3'), state.unlocked.has('icubeds')].filter(Boolean).length * 2 + 2;
  const sick = Array.from({ length: n }, (_, i) => i).filter(isSick).length;
  return [
    { icon: '🏠', name: 'บ้าน', have: n, use: n },
    { icon: '💼', name: 'งาน', have: jobs, use: workers },
    { icon: '🛒', name: 'ร้านค้า', have: shops, use: Math.ceil(n * 0.6) },
    { icon: '🌳', name: 'สวน/พักผ่อน', have: parks, use: Math.ceil(n * 0.4) },
    { icon: '🛏️', name: 'เตียงผู้ป่วย', have: beds, use: sick },
    { icon: '🚗', name: 'ถนน', have: roadCapacity(), use: Math.round(carDemand()) },
  ];
}
function advise() {
  const good = [];
  const care = [];
  const todo = [];
  const rows = demandRows();
  const short = rows.filter((r) => r.use > r.have);
  const j = jam();
  const sick = Array.from({ length: citizenCount() }, (_, i) => i).filter(isSick).length;
  if (state.rating >= 4.5) good.push(`ชาวเมืองรักโรงพยาบาลมาก ⭐ ${state.rating.toFixed(1)}`);
  else if (state.rating < 3.5) care.push(`คะแนนโรงพยาบาลต่ำ (⭐ ${state.rating.toFixed(1)}) คนไข้รอนานเกินไป`);
  if (j < 0.3) good.push('ถนนโล่ง รถพยาบาลวิ่งได้เร็ว');
  else {
    care.push(`การจราจร${jamText(j).slice(2)} รถพยาบาลมาช้าลง`);
    const next = cityState().lights < 3 ? 'lights' : !cityState().round ? 'round' : !cityState().wide ? 'wide' : null;
    if (next) todo.push(`สร้าง${TRAFFIC[next].icon} ${TRAFFIC[next].name} (💵${TRAFFIC[next].cost(cityState().lights).toLocaleString()})`);
  }
  if (sick === 0 && citizenCount()) good.push('ชาวเมืองทุกคนสุขภาพดี');
  else if (sick > 2) care.push(`มีชาวเมืองป่วย ${sick} คน รอรักษาอยู่`);
  for (const r of short) {
    care.push(`${r.icon} ${r.name}ไม่พอ (ขาด ${r.use - r.have})`);
    if (r.name === 'งาน') todo.push('สร้างโรงเรียนแพทย์ โรงงานยา หรือธนาคาร ให้คนมีงานทำ');
    if (r.name === 'ร้านค้า') todo.push('สร้างหรืออัปเลเวลตลาด 🏪');
    if (r.name === 'สวน/พักผ่อน') todo.push('สร้างสวนสาธารณะ 🌳 ช่วยให้คนป่วยน้อยลงและดึงนักท่องเที่ยว');
    if (r.name === 'เตียงผู้ป่วย') todo.push('เพิ่มเตียงในหอผู้ป่วยชั้น 2');
  }
  if (cityState().tourists > 0) good.push(`นักท่องเที่ยวมารักษาแล้ว ${cityState().tourists} คน ✈️`);
  if (tourismScore() < 4 && state.step >= 8) todo.push('อยากได้นักท่องเที่ยวมากขึ้น: สวน ตลาด ของตกแต่ง และคะแนนดาวช่วยได้');
  const g = !storyDone() && curGoal();
  if (g) todo.push(`เป้าหมายเนื้อเรื่อง: ${g.text}`);
  if (!good.length) good.push('เมืองกำลังเติบโต ค่อย ๆ สร้างไปนะคะ');
  if (!care.length) care.push('ไม่มีเรื่องน่าห่วงตอนนี้');
  return { good, care, todo: todo.slice(0, 3) };
}

// --- the 🏙️ city hub: advisor, citizens, traffic, tourists ---
const hubEl = document.getElementById('cityhub');
let hubTab = 'advisor';
let hubFilter = 'all';
let hubSearch = '';
let hubPick = -1;
function openCityHub(tab) {
  if (tab) hubTab = tab;
  hubPick = -1;
  renderCityHub();
  hubEl.style.display = 'flex';
}
function renderCityHub() {
  const box = hubEl.querySelector('.box');
  const c = cityState();
  box.innerHTML = `<h3>🏙️ เมืองของคุณ</h3><p class="sub">วัน${DAY_NAMES[c.day % 7]}ที่ ${c.day} · ${clockText()} · ชาวเมือง ${citizenCount()} คน · ${jamText(jam())}</p>`;
  const tabs = emEl('div', 'hubtabs');
  for (const [id, label] of [['advisor', '👩‍💼 ที่ปรึกษา'], ['people', '👥 ชาวเมือง'], ['traffic', '🚦 จราจร'], ['tourism', '✈️ ท่องเที่ยว']]) {
    const b = emEl('button', hubTab === id ? 'on' : '', label);
    b.addEventListener('click', () => { hubTab = id; hubPick = -1; renderCityHub(); });
    tabs.append(b);
  }
  box.append(tabs);
  const page = emEl('div', 'hubpage');
  box.append(page);
  if (hubTab === 'advisor') {
    const a = advise();
    page.append(emEl('div', 'advisor', `<div class="av">👩‍💼</div><div><b>คุณอร ที่ปรึกษาเมือง</b><br><small>มาดูเมืองของเรากันค่ะ</small></div>`));
    page.append(emEl('div', 'advsec good', `<b>✅ สิ่งที่ไปได้ดี</b>${a.good.map((t) => `<div>• ${t}</div>`).join('')}`));
    page.append(emEl('div', 'advsec care', `<b>⚠️ เรื่องที่ควรดูแล</b>${a.care.map((t) => `<div>• ${t}</div>`).join('')}`));
    if (a.todo.length) page.append(emEl('div', 'advsec todo', `<b>👉 ทำอะไรก่อนดี</b>${a.todo.map((t, i) => `<div>${i + 1}. ${t}</div>`).join('')}`));
    const rows = demandRows();
    page.append(emEl('div', 'demand', `<b>📊 ความต้องการของเมือง</b><table><tr><th></th><th>มี</th><th>ใช้</th><th>ขาด</th></tr>${rows.map((r) => `<tr><td>${r.icon} ${r.name}</td><td>${r.have}</td><td>${r.use}</td><td class="${r.use > r.have ? 'bad' : 'ok'}">${r.use > r.have ? r.use - r.have : '✓'}</td></tr>`).join('')}</table>`));
  } else if (hubTab === 'people') {
    if (!citizenCount()) {
      page.append(emEl('p', 'emhint', 'ยังไม่มีชาวเมือง สร้างหมู่บ้าน 🏘️ ในเมืองหมอก่อนนะ (กด 🌏 อาณาจักร → เมือง)'));
    } else if (hubPick >= 0) {
      const p = citizen(hubPick);
      const hp = Math.round(citizenHp(hubPick));
      const st = citizenStatus(hubPick);
      const home = p.home >= 0 ? `แปลง ${p.home + 1}` : '-';
      const card = emEl('div', 'lifecard', `<div class="big">${p.icon}</div><b>คุณ${p.name}</b><br><small>อายุ ${p.age} ปี · ${p.jobName} · บ้าน${home}</small>
        <div class="hpbar"><i style="width:${hp}%;background:${hp < 35 ? '#e5484d' : hp < 65 ? '#ffb020' : '#3fbf5f'}"></i></div><small>สุขภาพ ${hp}/100</small>
        <p>${st.icon} ตอนนี้: ${st.text}</p><b>📖 บันทึกชีวิต</b>${(c.log[hubPick] || ['ยังไม่มีเรื่องราว']).map((t) => `<div class="logrow">${t}</div>`).join('')}`);
      page.append(card);
      page.append(emButton('← กลับไปรายชื่อ', false, () => { hubPick = -1; renderCityHub(); }));
    } else {
      const search = emEl('input', 'hubsearch');
      search.placeholder = '🔎 ค้นหาชื่อหรืออาชีพ';
      search.value = hubSearch;
      search.addEventListener('input', () => { hubSearch = search.value; renderPeopleList(list); });
      const chips = emEl('div', 'hubchips');
      for (const [id, label] of [['all', 'ทั้งหมด'], ['sick', '🤒 ป่วย'], ['work', '💼 ทำงาน'], ['home', '🏠 อยู่บ้าน']]) {
        const b = emEl('button', hubFilter === id ? 'on' : '', label);
        b.addEventListener('click', () => { hubFilter = id; renderCityHub(); });
        chips.append(b);
      }
      const list = emEl('div', 'plist');
      page.append(search, chips, list);
      renderPeopleList(list);
    }
  } else if (hubTab === 'traffic') {
    const j = jam();
    page.append(emEl('div', 'advsec', `<b>การจราจรตอนนี้: ${jamText(j)}</b><div class="hpbar"><i style="width:${Math.round(j * 100)}%;background:${j < 0.5 ? '#3fbf5f' : j < 0.75 ? '#ffb020' : '#e5484d'}"></i></div>
      <small>รถบนถนน ${Math.round(carDemand())} คัน · ถนนรับได้ ${roadCapacity()} คัน${rushHour() ? ' · ⏰ ชั่วโมงเร่งด่วน' : ''}<br>รถติดทำให้รถพยาบาลมาช้า คนไข้มาน้อยลง ${Math.round((1 - trafficArrival()) * 100)}%</small>`));
    for (const [id, t] of Object.entries(TRAFFIC)) {
      const lvl = id === 'lights' ? c.lights : c[id] ? 1 : 0;
      const maxed = lvl >= t.max;
      const row = emEl('div', 'uprow', `<div class="upico">${t.icon}</div><div class="upinfo"><b>${t.name}</b> <span class="lv">${lvl}/${t.max}</span><br><small>${t.desc}</small></div>`);
      row.append(emButton(maxed ? 'สร้างแล้ว' : `💵${t.cost(lvl).toLocaleString()}`, maxed || state.money < t.cost(lvl), () => buyTraffic(id)));
      page.append(row);
    }
    page.append(emEl('p', 'emhint', 'ชั่วโมงเร่งด่วน 07:00–09:00 และ 17:00–19:00 รถจะเยอะเป็นพิเศษ'));
  } else {
    const s = tourismScore();
    page.append(emEl('div', 'advsec', `<b>✈️ เสน่ห์ของเมือง: ${s} คะแนน</b><br><small>${PATIENT_TYPES.tourist.weight ? `มีนักท่องเที่ยวมารักษาประมาณ ${Math.round(PATIENT_TYPES.tourist.weight)}% ของคนไข้` : 'ยังไม่มีนักท่องเที่ยว (เปิดห้องเอกซเรย์และสร้างเมืองก่อน)'}<br>นักท่องเที่ยวจ่ายค่ารักษา ×3 · มาแล้ว ${c.tourists} คน · รายได้ 💵${Math.round(c.touristCash).toLocaleString()}</small>`));
    const tips = [
      ['🌳', 'สวนสาธารณะในเมือง', cityLevel('garden') * 1.5],
      ['🏪', 'ตลาด', cityLevel('market')],
      ['🌷', 'สวนพักฟื้นและร้านขายยาหน้า รพ.', (OUT.park ? 2 : 0) + (OUT.kiosk ? 1 : 0)],
      ['🎨', 'ของตกแต่ง (ความสบาย)', comfort() / 4],
      ['⭐', 'คะแนนโรงพยาบาลเกิน 3.5', Math.max(0, state.rating - 3.5) * 4],
      ['🏫', 'อาคารในวิทยาเขต', campusCount() * 0.6],
      ['🌏', 'ระดับอาณาจักร', emp().tier * 2],
      ['🚗', 'รถติด (หักคะแนน)', -jam() * 4],
    ];
    page.append(emEl('div', 'demand', `<b>อะไรดึงดูดนักท่องเที่ยว</b><table>${tips.map(([i, n, v]) => `<tr><td>${i} ${n}</td><td class="${v < 0 ? 'bad' : 'ok'}">${v >= 0 ? '+' : ''}${v.toFixed(1)}</td></tr>`).join('')}</table>`));
  }
  box.append(emButton('ปิด', false, () => { hubEl.style.display = 'none'; }));
  box.lastChild.classList.add('ghost');
}
function renderPeopleList(list) {
  list.innerHTML = '';
  const q = hubSearch.trim();
  let shown = 0;
  for (let i = 0; i < citizenCount() && shown < 60; i++) {
    const p = citizen(i);
    const st = citizenStatus(i);
    if (q && !`${p.name} ${p.jobName}`.includes(q)) continue;
    if (hubFilter === 'sick' && !isSick(i)) continue;
    if (hubFilter === 'work' && st.icon !== '💼') continue;
    if (hubFilter === 'home' && !['🏠', '😴', '🏡'].includes(st.icon)) continue;
    const hp = Math.round(citizenHp(i));
    const row = emEl('button', 'prow', `<span class="pi">${p.icon}</span><span class="pn"><b>${p.name}</b><small>${st.icon} ${st.text}</small></span><span class="ph" style="color:${hp < 35 ? '#e5484d' : hp < 65 ? '#c77d00' : '#2f8a3a'}">❤️${hp}</span>`);
    row.addEventListener('click', () => { hubPick = i; renderCityHub(); });
    list.append(row);
    shown++;
  }
  if (!shown) list.append(emEl('p', 'emhint', 'ไม่พบชาวเมืองที่ตรงกับตัวกรอง'));
}

// --- HUD: clock pill and the speed / city buttons ---
const clockEl = document.getElementById('clock');
const speedBtn = document.getElementById('speedbtn');
const cityBtn = document.getElementById('citybtn');
function setSpeed(s) {
  gameSpeed = s;
  speedBtn.textContent = `⏩${s}×`;
  speedBtn.classList.toggle('on', s > 1);
  try {
    localStorage.setItem('drquest-speed', String(s));
  } catch {
    // speed just won't be remembered
  }
}
speedBtn.addEventListener('click', () => setSpeed(gameSpeed >= 3 ? 1 : gameSpeed + 1));
cityBtn.addEventListener('click', () => openCityHub());
let clockShown = '';
function updateCityHud() {
  const show = running && tutorialDone();
  const txt = show ? `🕘 ${DAY_NAMES[cityState().day % 7].slice(0, 2)}. ${clockText()}${rushHour() && builtPlots() ? ' 🚗' : ''}` : '';
  if (txt !== clockShown) {
    clockShown = txt;
    clockEl.textContent = txt;
    clockEl.style.display = txt ? 'block' : 'none';
  }
  speedBtn.style.display = show ? '' : 'none';
  cityBtn.style.display = show && builtPlots() >= 1 ? '' : 'none';
  if (cityBtn.style.display === '' && !cityBtn.dataset.seen) {
    cityBtn.dataset.seen = '1';
    tip('cityhub');
  }
}
setSpeed(gameSpeed);

// Everything above, once per simulated step
function updateCityLife(dt) {
  tickClock(dt);
  tickCitizens();
  tickTourism(dt);
  updateTraffic(dt);
}

// ---------- player actions ----------
let actTimer = 0;
function playerActions(dt) {
  actTimer -= dt;
  if (actTimer > 0) return;
  const pos = player.group.position;
  const stack = player.stack;
  if (player.floor >= 2) return; // roof and floors 3-4: all stand-in-the-ring jobs
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
const pinchPts = new Map();
let pinchFrom = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  pinchPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinchPts.size === 2) {
    // Second finger: stop walking and start pinching
    const [a, b] = [...pinchPts.values()];
    pinchFrom = { d: Math.hypot(a.x - b.x, a.y - b.y), z: camZoom };
    joyId = null;
    touchVec.x = touchVec.y = 0;
    knob.style.transform = '';
    joy.style.display = 'none';
    renderer.domElement.setPointerCapture(e.pointerId);
    return;
  }
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
  if (pinchPts.has(e.pointerId)) pinchPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinchFrom && pinchPts.size === 2) {
    const [a, b] = [...pinchPts.values()];
    setZoom(pinchFrom.z * (pinchFrom.d / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y))));
    return;
  }
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
const endPinch = (e) => {
  pinchPts.delete(e.pointerId);
  if (pinchPts.size < 2) pinchFrom = null;
};
renderer.domElement.addEventListener('pointerup', endPinch);
renderer.domElement.addEventListener('pointercancel', endPinch);
renderer.domElement.addEventListener('wheel', (e) => setZoom(camZoom * (e.deltaY > 0 ? 1.12 : 0.9)), { passive: true });
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
  pos.x = Math.max(-60, Math.min(pos.x > 120 ? 400 : 60, pos.x)); // campus centre interiors live beyond x = 140
  pos.z = Math.max(-70, Math.min(32, pos.z)); // the military base reaches z = -64
  if (player.floor >= 1) {
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
  // A giant germ beats everything else: go and zap it
  if (ev.boss) {
    if (player.floor !== 0) return [{ at: ELEVATOR, ride: 0, keep: () => player.floor !== 0 }];
    const b = ev.boss;
    return [{ at: bossStand(b), keep: () => ev.boss === b }];
  }
  // A drone raid on the military base: go and defend it
  if (BASE.defense && BASE.drones.length) {
    if (player.floor !== 0) return [{ at: ELEVATOR, ride: 0, keep: () => player.floor !== 0 }];
    const bt = baseTask();
    if (bt) return [bt];
  }
  // A city epidemic comes next: go vaccinate the sick buildings
  const sick = epiTargets();
  if (sick.length) {
    if (player.floor !== 0) return [{ at: ELEVATOR, ride: 0, keep: () => player.floor !== 0 }];
    const near = sick.map((i) => plotZone(district.plots[i].at)).sort((a, b) => flatDist(player.group.position, a) - flatDist(player.group.position, b))[0];
    return [{ at: near, keep: () => epiTargets().length > 0 && epiTargets().some((i) => flatDist(plotZone(district.plots[i].at), near) < 0.1) }];
  }
  if (player.floor === 1) return floor2Tasks();
  if (player.floor === 2) return roofTasks();
  if (player.floor >= 3) return upperTasks(player.floor);
  const stack = player.stack;
  const cap = bagCapacity();
  const lines = Object.values(LINES).filter((l) => l.active);
  const rooms = Object.values(ROOMS).filter((r) => r.active);
  const tasks = [];
  if (tile && state.money >= tile.u.price - state.paid) {
    const t = tile;
    // Upstairs tiles: ride the elevator first
    if (t.u.floor) tasks.push({ at: ELEVATOR, ride: t.u.floor, keep: () => player.floor === 0 });
    else tasks.push({ at: t.u.at, keep: () => tile === t && state.money > 0 });
  } else {
    const ct = campusTask() || baseTask();
    if (ct) tasks.push(ct);
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
  if (OUT.kiosk && !OUT.clerk && OUT.kioskQueue[0]?.arrived) tasks.push({ at: KIOSK_ZONE, keep: () => OUT.kioskQueue[0]?.arrived });
  const piles = [...lines, ...rooms].map((x) => x.cash).concat(basket.pile ? [basket.pile] : [], outdoorPiles()).sort((a, b) => b.amount - a.amount);
  // With cash collectors on the job, serving people inside the campus centres comes first
  const inner = interiorTask();
  if (inner && upLevel('collector') > 0) tasks.push(inner);
  if (piles[0]?.amount >= 15) tasks.push({ at: piles[0].pos, keep: () => piles[0].amount > 0 });
  if (inner && upLevel('collector') === 0) tasks.push(inner);
  if (roofNeedsPlayer()) tasks.push({ at: ELEVATOR, ride: 2, keep: () => player.floor === 0 });
  const upNeed = upperNeedsPlayer();
  if (upNeed) tasks.push({ at: ELEVATOR, ride: upNeed, keep: () => player.floor === 0 });
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
  const way = player.floor ? auto.task.at : route(pos, auto.task.at);
  const dx = way.x - pos.x;
  const dz = way.z - pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.25 && way === auto.task.at) return;
  if (d < 0.01) return; // standing exactly on a waypoint (a door ring): let it act, never divide by zero
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
  perSecond += floor2PerSecond() + outdoorPerSecond() + roofPerSecond() + upperPerSecond() + campusPerSecond() + interiorPerSecond() + basePerSecond();
  const t = Math.min(seconds, OFFLINE_CAP);
  return { amount: Math.floor(perSecond * t * offlineRate()), perHour: Math.round(perSecond * 3600 * offlineRate()), seconds: t };
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
let pendingTax = 0;
function offerIdleEarnings(seconds) {
  if (seconds < 60) return;
  const here = idleIncome(seconds);
  const others = Math.floor(otherBranchesRate() * here.seconds);
  const taxes = Math.floor(empireRate() * offlineRate() * here.seconds);
  const amount = here.amount + others + taxes;
  const perHour = here.perHour + Math.round((otherBranchesRate() + empireRate() * offlineRate()) * 3600);
  const counted = here.seconds;
  const box = document.getElementById('away');
  const text = document.getElementById('awaytext');
  if (amount > 0) {
    pendingIdle = amount;
    pendingTax = taxes;
    text.innerHTML = `คุณไม่อยู่ ${formatDuration(seconds)}<br>พนักงานช่วยกันดูแลคนไข้ได้<br><b>💵 ${amount.toLocaleString()}</b>`
      + (others > 0 ? `<br><small>(รวมสาขาอื่น 💵${others.toLocaleString()})</small>` : '')
      + (taxes > 0 ? `<br><small>(รวมภาษีอาณาจักร 💵${taxes.toLocaleString()})</small>` : '')
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
  if (ev.boss) return player.floor !== 0 ? ELEVATOR : bossStand(ev.boss);
  if (epiTargets().length) return player.floor !== 0 ? ELEVATOR : plotZone(district.plots[epiTargets()[0]].at);
  if (player.floor === 1) return floor2Tasks()[0]?.at || null;
  if (player.floor === 2) return roofTasks()[0]?.at || null;
  if (player.floor >= 3) return upperTasks(player.floor)[0]?.at || null;
  const stack = player.stack;
  const pill = LINES.pill;
  const piles = [...Object.values(LINES), ...Object.values(ROOMS)].filter((x) => x.active).map((x) => x.cash);
  if (basket.pile) piles.push(basket.pile);
  piles.push(...outdoorPiles());
  if (tile && state.money >= tile.u.price - state.paid) return tile.u.floor ? ELEVATOR : tile.u.at;
  const quest = storyTarget();
  if (quest) return quest;
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

function addMoney(n, countsForBoard = true) {
  state.money += n;
  if (n > 0 && countsForBoard) {
    state.earned = (state.earned || 0) + n; // lifetime earnings for the leaderboard
    weekProgress(n);
  }
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
  goalEl.textContent = u ? `🎯 ถัดไป: ${u.icon} ${u.label}${u.floor ? ` (${['', 'ชั้น 2', 'ดาดฟ้า', 'ชั้น 3', 'ชั้น 4'][u.floor]})` : ''} · 💵${u.price}`
    : canOpenBranch() ? '🏆 ครบทุกแผนก! กด 🌏 เพื่อเปิดสาขาใหม่' : '🏆 สาขานี้ครบทุกแผนกแล้ว!';
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
  // Cards open with floor 2, research once the first 24 departments are built
  const tabOpen = { up: true, cards: topStep() >= CAMPUS_OPEN_STEP || state.cards.length > 0, research: topStep() >= CORE_STEPS || state.research.done.length > 0 };
  if (!tabOpen[upTab]) upTab = 'up';
  for (const b of document.querySelectorAll('#uptabs button')) {
    b.classList.toggle('on', b.dataset.tab === upTab);
    b.style.display = tabOpen[b.dataset.tab] ? '' : 'none';
  }
  document.getElementById('uptabs').style.display = tabOpen.cards ? '' : 'none';
  if (upTab === 'cards') return renderCards();
  if (upTab === 'research') return renderResearch();
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
  if (u.id === 'collector') {
    syncCollectors(true);
    toast('💰 <b>จ้างพนักงานเก็บเงินแล้ว!</b><br>เขาจะเดินเก็บกองเงินทุกจุดให้คุณ', 3500);
  }
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
  branchBtn.classList.toggle('ready', (canOpenBranch() && state.money >= newBranchCost()) || (DOCK.branchbtn() && state.money >= cheapestEmpireCost()));
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
  { type: 'special', icon: '⭐', text: (n) => `รักษาเคสพิเศษสำเร็จ ${n} เคส`, targets: [1, 2, 3], from: 3 },
  { type: 'rush', icon: '🚨', text: (n) => `ได้โบนัสชั่วโมงเร่งด่วน ${n} ครั้ง`, targets: [1, 2, 2], from: 3 },
  { type: 'boss', icon: '🦠', text: (n) => `กำจัดเชื้อโรคยักษ์ ${n} ตัว`, targets: [1, 2, 3], from: 5 },
];
const todayKey = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time

// One shared challenge a day: the same goal for everyone, scored on its own leaderboard
const CHALLENGES = [
  { id: 'serve', icon: '🧑‍⚕️', text: 'ท้าทายวันนี้: รักษาคนไข้ให้ได้มากที่สุด', counts: ['serve'] },
  { id: 'earn', icon: '💵', text: 'ท้าทายวันนี้: หาเงินจากคนไข้ให้ได้มากที่สุด', counts: ['earn'] },
  { id: 'tips', icon: '💖', text: 'ท้าทายวันนี้: ได้ทิปให้ได้มากที่สุด', counts: ['tips'] },
  { id: 'vip', icon: '👑', text: 'ท้าทายวันนี้: ดูแลคนไข้ VIP และฉุกเฉินให้ได้มากที่สุด', counts: ['vip', 'emergency'] },
  { id: 'hero', icon: '🦸', text: 'ท้าทายวันนี้: ล่าบอส + เคสพิเศษ + เร่งด่วน (ครั้งละ 10 แต้ม)', counts: ['boss', 'special', 'rush'], weight: 10 },
];
function todayChallenge() {
  let h = 7;
  for (const ch of todayKey()) h = (Math.imul(h, 131) + ch.charCodeAt(0)) >>> 0;
  return CHALLENGES[h % CHALLENGES.length];
}
function challengeProgress(type, n) {
  const c = todayChallenge();
  if (!c.counts.includes(type)) return;
  if (state.challenge?.date !== todayKey()) state.challenge = { date: todayKey(), score: 0 };
  state.challenge.score += n * (c.weight || 1);
}

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
  challengeProgress(type, n);
  const st = stats();
  const key = { serve: 'served', special: 'specials', rush: 'rushes' }[type];
  if (key) st[key] = (st[key] || 0) + n;
  if (!state.daily) return;
  for (const m of state.daily.missions) if (m.type === type && !m.claimed) m.progress = Math.min(m.target, m.progress + n);
}

const missionPanel = document.getElementById('missions');
const missionList = document.getElementById('mlist');
const missionBtn = document.getElementById('missionbtn');
function renderMissions() {
  missionList.innerHTML = '';
  const c = todayChallenge();
  const card = document.createElement('div');
  card.className = 'branchcard';
  card.innerHTML = `<b>${c.icon} ${c.text}</b><br><small>คะแนนคุณวันนี้: <b>${Math.floor(state.challenge?.date === todayKey() ? state.challenge.score : 0).toLocaleString()}</b> · แข่งกับทุกคน รีเซ็ตเที่ยงคืน</small><br>`;
  const btn = document.createElement('button');
  btn.className = 'btn upbuy';
  btn.textContent = '📅 ดูอันดับวันนี้';
  btn.addEventListener('click', () => {
    missionPanel.style.display = 'none';
    boardTab = 'daily';
    board.style.display = 'flex';
    renderBoard();
  });
  card.append(btn);
  missionList.append(card);
  const q = quizState();
  const quiz = document.createElement('div');
  quiz.className = 'branchcard';
  quiz.innerHTML = `<b>🩺 ควิซสุขภาพวันนี้ ${q.done.length}/${QUIZ_PER_DAY}</b><br><small>ตอบถูกข้อละ 💵${quizReward().toLocaleString()} · ได้ความรู้สุขภาพจริง</small><br>`;
  quiz.append(emButton(q.done.length >= QUIZ_PER_DAY ? 'ตอบครบแล้ว ✓' : '✏️ ตอบควิซ', false, () => { missionPanel.style.display = 'none'; openQuiz(); }));
  missionList.append(quiz);
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
  renderAchievements(missionList);
}
function updateMissionDot() {
  const ready = state.daily?.missions.some((m) => !m.claimed && m.progress >= m.target);
  missionBtn.classList.toggle('ready', Boolean(ready));
}

// ---------- hospital chain: switch between branches, open new ones ----------
const branchName = (i) => `สาขา ${i + 1}`;
const branchMultOf = (i) => 1 + 0.5 * i;
// A new branch can be opened from the newest one once it's fully built
// The original 24 unlocks are enough to open the next branch; the newer areas are a bonus
const CORE_STEPS = 24;
const canOpenBranch = () => state.branch === state.branches.length - 1 && state.step >= CORE_STEPS;
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
    row.innerHTML = `<div class="upico" style="color:${BRANCH_COLORS[i % BRANCH_COLORS.length]}">${themeOf(i).icon}</div>
      <div class="upinfo"><b>${branchName(i)}</b> <small>${themeOf(i).name}</small> <span class="lv">รายได้ ×${branchMultOf(i).toFixed(1)}</span><br>
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
    card.innerHTML = `<b>🏗️ เปิด${branchName(next)} ${themeOf(next).icon} ${themeOf(next).name}</b><br><small>รายได้ ×${branchMultOf(next).toFixed(1)} · สาขาเดิมยังอยู่และหาเงินต่อ</small>`;
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
  if (!confirm(`เปิด${branchName(next)} ${themeOf(next).icon} ${themeOf(next).name} ราคา 💵${cost.toLocaleString()}?\n\nสาขาใหม่เริ่มสร้างตั้งแต่ต้น แต่รายได้ ×${branchMultOf(next).toFixed(1)} และสาขาเดิมยังอยู่ หาเงินต่อให้ และกลับไปดูได้ตลอด`)) return;
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
  branchbtn: () => tutorialDone() && (state.step >= 10 || state.branches.length > 1),
  stylebtn: () => tutorialDone() && state.step >= 2,
};
function updateDock(initial = false) {
  for (const [id, visible] of Object.entries(DOCK)) {
    const el = document.getElementById(id);
    const show = visible();
    if (show && el.classList.contains('locked')) {
      el.classList.remove('locked');
      if (!initial) {
        el.classList.add('fresh');
        tip(id);
      }
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

// How each branch theme plays the tune: wave, key, tempo, and a scale twist
const MUSIC_STYLE = {
  city: { wave: 'square', shift: 0, tempo: 1 },
  beach: { wave: 'triangle', shift: 2, tempo: 1.1, vol: 1.4 },
  snow: { wave: 'sine', shift: 12, tempo: 0.85, vol: 1.8 },
  jungle: { wave: 'square', shift: -3, tempo: 1.05, drum: true },
  night: { wave: 'triangle', shift: -5, tempo: 0.9, minor: true, vol: 1.4 },
  desert: { wave: 'sawtooth', shift: -2, tempo: 0.95, minor: true, flat2: true, vol: 0.7 },
  // Zones outside the hospital have their own take on the tune
  base: { wave: 'square', shift: -5, tempo: 1.18, drum: true, march: true, vol: 0.9 },
  campus: { wave: 'triangle', shift: 5, tempo: 0.92, vol: 1.5 },
  care: { wave: 'sine', shift: 12, tempo: 0.8, vol: 1.9 },
  district: { wave: 'square', shift: 7, tempo: 1.06, vol: 0.9 },
};
// The tune follows the player: base, campus (and inside its centres), the city district, or the branch's own style
function musicStyle() {
  const p = player.group.position;
  if (inBase(p)) return MUSIC_STYLE.base;
  if (inInterior(p)) return MUSIC_STYLE.care;
  if (inCampus(p)) return MUSIC_STYLE.campus;
  if (inDistrict(p)) return MUSIC_STYLE.district;
  return MUSIC_STYLE[themeOf(state.branch).id] || MUSIC_STYLE.city;
}
function styledNote(n, st) {
  const pc = ((n % 12) + 12) % 12;
  // Minor: flatten the 3rd, 6th and 7th of C major; desert also flattens the 2nd
  if (st.minor && (pc === 4 || pc === 9 || pc === 11)) n -= 1;
  if (st.flat2 && pc === 2) n -= 1;
  return n + st.shift;
}
function startMusic() {
  musicTime = audio.currentTime + 0.1;
  setInterval(() => {
    if (!audio || audio.state !== 'running') return;
    // Schedule a little ahead so timing stays tight
    const st = musicStyle();
    const step = STEP / st.tempo;
    while (musicTime < audio.currentTime + 0.15) {
      const note = MELODY[musicStep % MELODY.length];
      if (note) tone(midi(styledNote(note, st)), step * 0.9, st.wave, 0.022 * (st.vol || 1), musicTime);
      if (musicStep % 2 === 0) {
        const root = BASS[Math.floor(musicStep / 8) % BASS.length];
        tone(midi(styledNote(musicStep % 4 === 0 ? root : root + 12, { ...st, shift: Math.min(st.shift, 0) })), step * 1.6, 'triangle', 0.05, musicTime);
      }
      if (st.drum && musicStep % 4 === 2) tone(110, 0.08, 'square', 0.03, musicTime);
      if (st.march && musicStep % 4 === 0) tone(70, 0.1, 'square', 0.035, musicTime); // marching bass drum
      musicTime += step;
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
// state.branch is the open branch's index; state.branches holds a snapshot of every
// branch (null = opened but never played). Money, earnings and missions are shared.
const state = { money: 0, step: 0, paid: 0, unlocked: new Set(), upgrades: {}, rating: 3, branch: 0, branches: [null], daily: null, earned: 0, tutorial: 0, style: defaultStyle(), empire: defaultEmpire(),
  challenge: { date: '', score: 0 }, room: null, tips: [],
  base: defaultBase(),
  prestige: defaultPrestige(), cards: [], cardPulls: 0, research: { done: [], cur: null }, stats: {}, achievements: [], quiz: null, week: null };

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
    campus: campusSnapshot(),
    out: { parking: OUT.parkingCash?.amount || 0, kiosk: OUT.kioskCash?.amount || 0, park: OUT.parkCash?.amount || 0 },
    piles: Object.fromEntries(Object.values(LINES).filter((l) => l.active).map((l) => [l.id, { pile: l.pile.count, shelf: l.shelf.count, cash: l.cash.amount }])),
    roomCash: Object.fromEntries(Object.values(ROOMS).filter((r) => r.active).map((r) => [r.id, r.cash.amount])),
  };
}

function saveData() {
  state.branches[state.branch] = branchSnapshot();
  return {
    v: 2, money: state.money, earned: state.earned, daily: state.daily, savedAt: Date.now(), tutorial: state.tutorial, style: state.style, empire: state.empire,
    challenge: state.challenge, room: state.room, tips: state.tips,
    prestige: state.prestige, cards: state.cards, cardPulls: state.cardPulls, research: state.research,
    stats: state.stats, achievements: state.achievements, quiz: state.quiz, week: state.week,
    city: state.city, story: state.story, conquests: state.conquests || 0, conquestRun: state.conquestRun ?? -1,
    base: { ...state.base, cash: BASE.pile?.amount || 0 },
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
  state.style = { ...defaultStyle(), ...(data.style || {}) };
  state.empire = { ...defaultEmpire(), ...(data.empire || {}) };
  if (data.challenge?.date === todayKey()) state.challenge = data.challenge;
  state.room = typeof data.room === 'string' ? data.room : null;
  state.tips = Array.isArray(data.tips) ? data.tips : [];
  state.prestige = { ...defaultPrestige(), ...(data.prestige || {}) };
  state.cards = Array.isArray(data.cards) ? data.cards : [];
  state.cardPulls = data.cardPulls || 0;
  state.research = { done: [], cur: null, ...(data.research || {}) };
  state.stats = data.stats || {};
  state.achievements = Array.isArray(data.achievements) ? data.achievements : [];
  state.quiz = data.quiz || null;
  state.week = data.week || null;
  state.story = data.story ? { ...defaultStory(), ...data.story } : { ch: 0, catchup: true };
  state.conquests = data.conquests || 0;
  state.city = { ...defaultCity(), ...(data.city || {}) };
  state.conquestRun = data.conquestRun ?? -1;
  state.base = { ...defaultBase(), ...(data.base || {}) };
  state.base.units = { ...defaultBase().units, ...(state.base.units || {}) };
  while (state.empire.plots.length < CITY_PLOTS + 4 * (state.empire.land || 0)) state.empire.plots.push(null);
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
  if (br.campus) {
    campus.owned = br.campus.owned || [];
    campus.paid = br.campus.paid || {};
    campus.cash = br.campus.cash || {};
    campus.hired = br.campus.hired || {};
  }
  if (br.out) {
    OUT.parkingCash?.add(br.out.parking || 0);
    OUT.kioskCash?.add(br.out.kiosk || 0);
    OUT.parkCash?.add(br.out.park || 0);
  }
  for (const id of state.style.decor) buildDecor(id, false);
  shownMoney = state.money;
  if (data.savedAt) awayOnLoad = (Date.now() - data.savedAt) / 1000;
  localSavedAt = data.savedAt || 0;
}

// ---------- main loop ----------
const camOffset = new THREE.Vector3(0, 14, 10.5);
const camPos = new THREE.Vector3();
// Zoom: 1 = normal; pinch, the wheel or the 🔍 button pull back for an overview
let camZoom = 1;
let fogZoom = 0;
function setZoom(z) {
  camZoom = Math.max(0.7, Math.min(4, z));
  zoomBtn.textContent = camZoom > 1.5 ? '🔎' : '🔍';
}
function updateCamera(dt, snap = false) {
  // Portrait phones need the camera further back to see the same width
  const k = (camera.aspect < 1 ? 1.85 : 1.1) * camZoom;
  camPos.copy(player.group.position).addScaledVector(camOffset, k);
  if (fogZoom !== camZoom) {
    // Push the fog and the sun's shadow box out with the camera
    fogZoom = camZoom;
    const z = Math.max(1, camZoom);
    scene.fog.near = 40 * z;
    scene.fog.far = 75 * z * 1.2;
    const box = 22 * Math.max(1, camZoom * 0.85);
    Object.assign(sun.shadow.camera, { left: -box, right: box, top: box, bottom: -box, far: 60 + box });
    sun.shadow.camera.updateProjectionMatrix();
  }
  if (snap) camera.position.copy(camPos);
  else camera.position.lerp(camPos, Math.min(1, dt * 6));
  camera.lookAt(player.group.position.x, player.group.position.y + 0.5, player.group.position.z - 0.5);
  // Keep the sun's shadow box centred on the action
  sun.position.set(player.group.position.x + 9, 18, player.group.position.z + 8);
  sun.target.position.set(player.group.position.x, 0, player.group.position.z);
  sun.target.updateMatrixWorld();
}

// Slow phone? After 12 s of play, suggest low-power mode once
const fpsWatch = { start: 0, frames: 0, done: LITE };
function watchFps(now) {
  if (fpsWatch.done || !running) return;
  if (!fpsWatch.start) fpsWatch.start = now;
  fpsWatch.frames++;
  if (now - fpsWatch.start < 12000) return;
  fpsWatch.done = true;
  const fps = (fpsWatch.frames * 1000) / (now - fpsWatch.start);
  let asked = false;
  try {
    asked = localStorage.getItem('drquest-lite-asked') === '1';
    localStorage.setItem('drquest-lite-asked', '1');
  } catch {
    // ignore
  }
  if (fps < 26 && !asked) toast(`🐢 เกมกระตุกไหม? (${Math.round(fps)} fps)<br>ลองเปิด <b>⚡ โหมดประหยัด</b> ในเมนู ⚙️`, 6500);
}
// Title screen: a slow cinematic orbit over the hospital, campus and base
const startEl = document.getElementById('start');
function titleCamera(now) {
  const a = now / 26000;
  const cx = 6;
  const cz = -10;
  const k = camera.aspect < 1 ? 1.7 : 1; // portrait phones: further back to fit the width
  camera.position.set(cx + Math.sin(a) * 46 * k, (30 + Math.sin(a * 0.7) * 4) * k, cz + Math.cos(a) * 46 * k);
  camera.lookAt(cx, 0, cz);
  scene.fog.near = 80 * k;
  scene.fog.far = 170 * k;
  fogZoom = -1; // recompute the normal fog when play starts
  sun.position.set(cx + 9, 18, cz + 8);
  sun.target.position.set(cx, 0, cz);
  sun.target.updateMatrixWorld();
}
let last = performance.now();
let dnTimer = 0;
let saveTimer = 0;
let running = false;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (running) for (let k = 0; k < gameSpeed; k++) simulate(dt);
  updateCityHud();
  frameRest(dt, now);
}
function simulate(dt) {
  {
    updatePlayer(dt);
    playerActions(dt);
    for (const line of Object.values(LINES)) if (line.active) updateLine(line, dt);
    for (const room of Object.values(ROOMS)) if (room.active) updateRoom(room, dt);
    updatePatients(dt);
    updateSpills(dt);
    tickOtherBranches(dt);
    tickEmpire(dt);
    updateDistrict(dt);
    updateCollectors(dt);
    updateCampus(dt);
    updateInteriors(dt);
    updateBase(dt);
    updateExtras(dt);
    updateFloor2(dt);
    updateOutdoor(dt);
    updateRoof(dt);
    updateUpper(dt);
    staff.forEach((s) => s.update(dt));
    updateAmbulance(dt);
    updateTile(dt);
    updateEvents(dt);
    updateStory(dt);
    updateCityLife(dt);
    updateGuide();
    saveTimer += dt;
    if (saveTimer > 5) {
      saveTimer = 0;
      showSaveStatus(save());
    }
  }
}
function frameRest(dt, now) {
  for (const belt of belts) belt.material.map.offset.x -= dt * 0.9;
  if (trashLid) trashLid.rotation.z *= Math.max(0, 1 - dt * 6);
  // Floor-2 items in flight hide with floor 2
  for (const f of flyers) if (f.mesh.userData.f2) f.mesh.visible = F2.group.visible || f.mesh.parent !== scene;
  for (const f of flyers) if (f.mesh.userData.f3) f.mesh.visible = F3.group.visible || f.mesh.parent !== scene;
  updateFlyers(dt);
  updatePops(dt);
  updateConfetti(dt);
  updateDecor();
  updateWeather(dt);
  updateFloats(dt);
  if (!running && startEl.style.display !== 'none') titleCamera(now);
  else updateCamera(dt);
  updateBag();
  updateUpgradeDot();
  updateMissionDot();
  if (running) {
    updateTutorial();
    updateDock();
  }
  updateEventHud();
  tickMoneyDisplay(dt);
  watchFps(now);
  updateHomeBtn();
  dnTimer -= dt;
  if (dnTimer <= 0) {
    dnTimer = 1;
    updateDayNight();
    if (upPanel.style.display === 'flex' && upTab === 'research' && state.research.cur) renderUpgrades();
  }
  if (mapView.active) renderMapView(dt);
  else {
    // The shadow pass is most of the frame on phones: redraw it every other frame
    shadowTick = !shadowTick;
    renderer.shadowMap.needsUpdate = shadowTick;
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}

// ---------- start ----------
buildWorld();
buildPartitions();
buildTrash();
decorateDept('pill', false);
load();
applyTheme();
applyOutfit();
buildDistrict();
buildKrathong();
buildCampus();
buildBase();
spawnCrew();
syncCollectors();
showNextTile();
updateBag();
updateCamera(0, true);
document.getElementById('loading').style.display = 'none';
requestAnimationFrame(frame);
// Probe storage up front so a browser that can't keep saves is flagged right away
save();

function start() {
  const nameIn = document.getElementById('startname');
  const name = nameIn.value.trim().slice(0, 20);
  if (name && name !== cloud.nickname) {
    cloud.pendingName = name;
    try {
      localStorage.setItem('drquest-name', name);
    } catch {
      // ignore
    }
    cloudPush();
  }
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
const liteBtn = document.getElementById('litebtn');
liteBtn.textContent = LITE ? '⚡ โหมดประหยัด: เปิด' : '⚡ โหมดประหยัด: ปิด';
liteBtn.addEventListener('click', () => {
  try {
    localStorage.setItem('drquest-lite', LITE ? 'off' : 'on');
  } catch {
    return;
  }
  save();
  location.reload(); // shadows and antialiasing are set when the renderer is made
});
document.getElementById('soundbtn').addEventListener('click', () => {
  initAudio();
  audio?.resume();
  setSound(!soundOn);
});
setSound(soundOn);
document.getElementById('startbtn').addEventListener('click', start);
try {
  document.getElementById('startname').value = localStorage.getItem('drquest-name') || '';
} catch {
  // ignore
}

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
// Local test servers stay off the real leaderboard (add ?cloud=1 to test the cloud anyway)
const CLOUD_OFF = ['localhost', '127.0.0.1'].includes(location.hostname) && !location.search.includes('cloud=1');

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
  if (CLOUD_OFF) throw new Error('cloud off on a local test server');
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
  // Fill the start screen's name box from the cloud once we know it
  const nameIn = document.getElementById('startname');
  if (nameIn && !nameIn.value && cloud.nickname && cloud.nickname !== 'หมอนิรนาม') nameIn.value = cloud.nickname;
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

async function askName() {
  const name = prompt('ตั้งชื่อที่จะแสดงบนกระดานอันดับ (ไม่เกิน 20 ตัวอักษร)', cloud.nickname || '');
  if (!name || !name.trim()) return false;
  cloud.pendingName = name.trim().slice(0, 20);
  try {
    localStorage.setItem('drquest-name', cloud.pendingName);
  } catch {
    // ignore
  }
  await cloudPush();
  return true;
}
document.getElementById('boardname').addEventListener('click', async () => {
  if (await askName()) renderBoard();
});
document.getElementById('namebtn').addEventListener('click', askName);

const board = document.getElementById('board');
let boardTab = 'all';
const EMPEROR = { icon: '👑', title: 'จักรพรรดิแพทย์โลก' };
const titleOf = (tier) => (tier >= 5 ? EMPEROR : EMPIRE_TIERS[Math.max(0, Math.min(4, tier || 0))]);
function boardRow(r, right, me) {
  const row = document.createElement('div');
  row.className = 'boardrow' + (me ? ' me' : '');
  const medal = ['🥇', '🥈', '🥉'][r.rank - 1] || `${r.rank}.`;
  const t = titleOf(r.tier);
  row.innerHTML = `<span class="rk">${medal}</span><span class="nm">${escapeHtml(r.nickname)}<br><small>${t.icon} ${t.title}${r.branch ? ` · ${r.branch + 1} สาขา` : ''}${r.badges ? ` · 🏅${r.badges}` : ''}${r.stars ? ` · ⭐${r.stars}` : ''}</small></span><span class="er">${right}</span>`;
  return row;
}
async function renderBoard() {
  for (const b of document.querySelectorAll('#boardtabs button')) b.classList.toggle('on', b.dataset.tab === boardTab);
  const list = document.getElementById('boardlist');
  const sub = document.getElementById('boardsub');
  list.textContent = 'กำลังโหลด…';
  try {
    await cloudPush();
    list.innerHTML = '';
    if (boardTab === 'all') {
      sub.textContent = 'จัดอันดับจากรายได้สะสมจากคนไข้ (ไม่นับภาษีอาณาจักร)';
      const rows = await rpc('leaderboard2', { p_limit: 30 });
      rows.forEach((r) => list.append(boardRow(r, `💵${Number(r.earned).toLocaleString()}`, r.nickname === cloud.nickname && r.earned === state.earned)));
      if (!rows.length) list.textContent = 'ยังไม่มีใครในกระดาน';
    } else if (boardTab === 'daily') {
      const c = todayChallenge();
      sub.innerHTML = `${c.icon} ${c.text}<br>คะแนนคุณวันนี้: <b>${Math.floor(state.challenge.score).toLocaleString()}</b> · รีเซ็ตเที่ยงคืน`;
      const rows = await rpc('daily_board', { p_date: todayKey(), p_limit: 30 });
      rows.forEach((r) => list.append(boardRow(r, `${c.icon}${Number(r.score).toLocaleString()}`, r.nickname === cloud.nickname && r.score === Math.floor(state.challenge.score))));
      if (!rows.length) list.textContent = 'วันนี้ยังไม่มีใครทำคะแนน เป็นคนแรกเลย!';
    } else {
      renderRoom(list, sub);
    }
  } catch {
    list.textContent = 'โหลดไม่ได้ ตรวจสอบอินเทอร์เน็ต';
  }
}
async function renderRoom(list, sub) {
  if (!state.room) {
    sub.textContent = 'สร้างห้อง แล้วส่งรหัสให้เพื่อนในกลุ่ม จะเห็นอันดับเฉพาะพวกเรา';
    const make = emEl('button', 'btn', '➕ สร้างห้องใหม่');
    make.addEventListener('click', () => {
      const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      state.room = Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => abc[b % abc.length]).join('');
      save();
      renderBoard();
    });
    const join = emEl('button', 'btn ghost', '🔑 ใส่รหัสห้องของเพื่อน');
    join.addEventListener('click', () => {
      const code = (prompt('ใส่รหัสห้อง 5 ตัว') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length !== 5) return;
      state.room = code;
      save();
      renderBoard();
    });
    list.append(make, join);
    return;
  }
  sub.innerHTML = `รหัสห้อง <b class="roomcode">${state.room}</b> · ส่งรหัสนี้ให้เพื่อน<br>${todayChallenge().icon} = คะแนนท้าทายวันนี้`;
  let rows;
  try {
    rows = await rpc('room_board', { p_room: state.room, p_date: todayKey(), p_week: weekKey() });
  } catch {
    rows = await rpc('room_board', { p_room: state.room, p_date: todayKey() }); // before the weekly upgrade
  }
  const weekly = rows.some((r) => r.week !== undefined);
  if (weekly && rows.length) {
    const best = [...rows].sort((a, b) => b.week - a.week)[0];
    if (best.week > 0) sub.innerHTML += `<br>🏆 แชมป์สัปดาห์นี้: <b>${escapeHtml(best.nickname)}</b> (💵${Number(best.week).toLocaleString()})`;
  }
  rows.forEach((r) => list.append(boardRow(r, `💵${Number(r.earned).toLocaleString()}<br><small>${todayChallenge().icon}${Number(r.score).toLocaleString()}${weekly ? ` · 📆${Number(r.week).toLocaleString()}` : ''}</small>`, r.nickname === cloud.nickname && r.earned === state.earned)));
  const gift = emEl('button', 'btn', '🎁 ส่งของขวัญให้ทั้งห้อง (วันละครั้ง)');
  gift.addEventListener('click', sendRoomGift);
  list.append(gift);
  const share = emEl('button', 'btn ghost', '📋 คัดลอกคำชวนเพื่อน');
  share.addEventListener('click', async () => {
    const text = `มาแข่งเปิดโรงพยาบาลกัน! เล่นที่ ${location.origin}${location.pathname} แล้วเข้าห้องเพื่อนด้วยรหัส ${state.room}`;
    try {
      await navigator.clipboard.writeText(text);
      share.textContent = '✅ คัดลอกแล้ว';
    } catch {
      prompt('คัดลอกข้อความนี้', text);
    }
  });
  const leave = emEl('button', 'btn danger', 'ออกจากห้อง');
  leave.addEventListener('click', () => {
    if (!confirm('ออกจากห้องนี้?')) return;
    state.room = null;
    save();
    renderBoard();
  });
  list.append(share, leave);
}
document.getElementById('leaderbtn').addEventListener('click', () => {
  board.style.display = 'flex';
  renderBoard();
});
for (const b of document.querySelectorAll('#boardtabs button')) {
  b.addEventListener('click', () => {
    boardTab = b.dataset.tab;
    renderBoard();
  });
}
document.getElementById('boardclose').addEventListener('click', () => {
  board.style.display = 'none';
});

renderCloud();
cloudSync().then(claimGifts);
setInterval(() => {
  if (running) claimGifts();
}, 5 * 60 * 1000);
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
for (const b of document.querySelectorAll('#uptabs button')) {
  b.addEventListener('click', () => {
    upTab = b.dataset.tab;
    renderUpgrades();
  });
}
document.getElementById('sharebtn').addEventListener('click', shareHospital);
document.getElementById('menushare').addEventListener('click', () => {
  menu.style.display = 'none';
  running = true;
  shareHospital();
});
const dnBtn = document.getElementById('daynightbtn');
dnBtn.textContent = `🌗 กลางวัน-กลางคืนตามเวลาจริง: ${dayNightOn ? 'เปิด' : 'ปิด'}`;
dnBtn.addEventListener('click', () => {
  dayNightOn = !dayNightOn;
  try {
    localStorage.setItem('drquest-daynight', dayNightOn ? 'on' : 'off');
  } catch {
    // ignore
  }
  dnBtn.textContent = `🌗 กลางวัน-กลางคืนตามเวลาจริง: ${dayNightOn ? 'เปิด' : 'ปิด'}`;
  dayBase.f = -1;
  updateDayNight();
});
// Works offline once loaded: cache the game files
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
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
  empireTab = canOpenBranch() && state.money >= newBranchCost() ? 'branches' : (empireTab === 'branches' ? emp().tier : empireTab);
  empireSel = null;
  renderEmpire();
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
    addMoney(pendingIdle - pendingTax);
    addMoney(pendingTax, false);
    pendingTax = 0;
    floatText(player.group.position, `+${pendingIdle.toLocaleString()}`, '#8be08f');
    sfxUnlock();
    pendingIdle = 0;
    save();
  }
});

// Expose a little for automated tests
window.__game = { cityState, openCityHub, citizenCount, citizen, jam, setSpeed, traffic, tourismScore, advise, buyTraffic, get gameSpeed() { return gameSpeed; }, buildPlot, advanceTier, upgradeNode, buyLand, advanceCheck, plotCost, nodeCost, nodeLevels, canOpenBranch, newBranchCost, openBranch, emp, CITY_BUILDINGS, LAND_COSTS, starsToGain, otherBranchesRate, BASE_UNLOCKS, STORY, story, openStory, showEnding, topStep, updateStory, BASE, startDefense, newMission, dispatchMission, startFlight, militaryPower, openMilitary, INT, CENTERS, get inside() { return inside; }, colliders, campus, CAMPUS_LOTS, epi, startEpidemic, KT, pullCard, openQuiz, shareHospital, makeShareCard, collectors, UPPER, UPPER_ROOMS, openMapView, closeMapView, mapView, visitDistrict, renderEmpire, empireRate, renderer, setFloor, OUT, F3, startRide, ev, spawnBoss, spawnSpecial, startRush, grantStyle, applyOutfit, camera, scene, route, F2, lift, basket, state, player, LINES, ROOMS, UNLOCKS, input: touchVec, patients, auto, idleIncome, UPGRADES, buyUpgrade, PATIENT_TYPES, SEATS };
