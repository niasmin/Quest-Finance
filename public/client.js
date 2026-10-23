// Dr. Quest — browser client. Renders game state and sends player input.
// Online it talks to the Node server over WebSocket; on static hosting (GitHub Pages)
// it runs the same engine inside the page as a single-player game.
const { CLASSES, SLOTS, ITEMS, GERMS, ZONES, NPCS, QUESTS } = window.GAME_DATA;
const SPR = Sprites.build(window.GAME_DATA);
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);

const params = new URLSearchParams(location.search);
const OFFLINE = params.has('offline') || location.protocol === 'file:' || location.hostname.endsWith('github.io');
const TOUCH = matchMedia('(pointer: coarse)').matches;
// Phones zoom out to 2/3 so more of the map fits; 2/3 keeps every art pixel a whole number of device pixels
let ZOOM = 1;
let SNAP = 1; // world-pixel grid that sprites and the camera snap to, so pixels stay crisp when zoomed

let transport = null; // { send(msg) }
let localGame = null;
let myId = null;
let world = null; // current zone definition
let selectedClass = 'doctor';
const players = new Map(); // id -> { ...serverState, rx, ry } (rx/ry = rendered position)
const germs = new Map();
const effects = []; // floating text, projectiles, rings, beams
const keys = new Set();
const joystick = { dx: 0, dy: 0 };
let lastSentInput = '';
let me = { inventory: {}, equipment: {}, quests: { active: {}, done: [] }, stats: { atk: 0, def: 0, hp: 0, speed: 0 } };

function resize() {
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ZOOM = TOUCH && Math.min(window.innerWidth, window.innerHeight) < 700 ? 2 / 3 : 1;
  SNAP = ZOOM < 1 ? SPR.PX : 1;
}
window.addEventListener('resize', resize);
resize();

// ---------- class picker ----------
function renderClassPicker() {
  const box = $('classes');
  for (const [id, c] of Object.entries(CLASSES)) {
    const card = document.createElement('div');
    card.className = `cls${id === selectedClass ? ' sel' : ''}`;
    card.innerHTML = `
      <div class="head"><span class="icon"><img src="${SPR.characters[id][0].toDataURL()}" alt=""></span>${c.icon} ${c.name}</div>
      <div class="meta">
        อาวุธ: <b>${c.weapon}</b> (${c.ranged ? 'ระยะไกล' : 'ระยะประชิด'})<br>
        สกิล: <b>${c.skill.name}</b><br>${c.skill.desc}
      </div>`;
    card.addEventListener('click', () => {
      selectedClass = id;
      for (const el of box.children) el.classList.remove('sel');
      card.classList.add('sel');
    });
    box.append(card);
  }
}
renderClassPicker();

// Login backdrop: tiled grass from the pixel tileset, darkened
$('login').style.backgroundImage = `linear-gradient(rgba(8,12,30,.55), rgba(8,12,30,.8)), url(${SPR.tiles.grass[0].toDataURL()})`;
$('login').style.backgroundSize = `auto, ${SPR.TILE}px`;

if (OFFLINE) {
  $('passinput').style.display = 'none';
  $('passinput').required = false;
  $('modenote').textContent = '🎮 โหมดเล่นคนเดียว — ตัวละครบันทึกไว้ในเบราว์เซอร์เครื่องนี้';
}

// ---------- connection ----------
$('loginform').addEventListener('submit', (e) => {
  e.preventDefault();
  $('loginerror').textContent = '';
  const joinMsg = { t: 'join', name: $('nameinput').value.trim(), password: $('passinput').value, classId: selectedClass };
  if (OFFLINE) joinLocal(joinMsg);
  else joinOnline(joinMsg);
});

function joinOnline(joinMsg) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => ws.send(JSON.stringify(joinMsg));
  ws.onmessage = (ev) => handleMessage(JSON.parse(ev.data));
  ws.onclose = () => {
    if (myId) addChat(null, 'การเชื่อมต่อหลุด — รีเฟรชหน้าเพื่อเข้าใหม่');
  };
  transport = {
    send: (msg) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
  };
}

// Single-player saves live in localStorage; there is no password to check.
const browserStorage = {
  key: (name) => `drquest:${name.toLowerCase()}`,
  read(name) {
    try {
      return JSON.parse(localStorage.getItem(this.key(name)));
    } catch {
      return null;
    }
  },
  exists(name) {
    return this.read(name) !== null;
  },
  verify: () => true,
  create(name, password, data) {
    this.save(name, data);
  },
  get(name) {
    return this.read(name);
  },
  save(name, data) {
    try {
      localStorage.setItem(this.key(name), JSON.stringify(data));
    } catch {
      // Storage full or blocked: the game keeps running, just without saving
    }
  },
};

function joinLocal(joinMsg) {
  if (!localGame) {
    localGame = createGame({ storage: browserStorage, requirePassword: false });
    localGame.start();
    window.addEventListener('pagehide', () => localGame.saveAll());
  }
  const result = localGame.join((msg) => handleMessage(structuredClone(msg)), joinMsg);
  if (typeof result === 'string') {
    handleMessage({ t: 'error', text: result });
    return;
  }
  transport = { send: (msg) => localGame.handle(result, msg) };
}

function send(msg) {
  transport?.send(msg);
}

function syncEntities(map, list) {
  const seen = new Set();
  for (const s of list) {
    seen.add(s.id);
    const prev = map.get(s.id);
    if (prev) {
      // Remember movement for walk animation and facing
      const dx = s.x - prev.x;
      if (dx || s.y !== prev.y) prev.movedAt = performance.now();
      if (Math.abs(dx) > 0.5) prev.flip = dx < 0;
      Object.assign(prev, s);
    } else {
      map.set(s.id, { ...s, rx: s.x, ry: s.y, movedAt: 0, flip: false });
    }
  }
  for (const id of map.keys()) if (!seen.has(id)) map.delete(id);
}

function handleMessage(msg) {
  switch (msg.t) {
    case 'error':
      $('loginerror').textContent = msg.text;
      break;
    case 'welcome':
      myId = msg.id;
      enterZone(msg.zone);
      $('login').style.display = 'none';
      for (const id of ['hud', 'chat', 'help', 'zonename', 'bagbtn']) $(id).style.display = 'block';
      if (TOUCH) $('chatbtn').style.display = 'block';
      $('touch').classList.add('on');
      if (msg.isNew) showDialog('director', 'ยินดีต้อนรับน้องใหม่! เดินมาหาผมที่หน้าโรงพยาบาลแล้วกด E (หรือปุ่ม "คุย") เพื่อรับภารกิจแรกนะ');
      break;
    case 'zone':
      enterZone(msg.zone);
      break;
    case 'me':
      me = msg;
      renderBag();
      renderQuests();
      break;
    case 'dialog':
      showDialog(msg.npc, msg.text);
      break;
    case 'state':
      syncEntities(players, msg.players);
      syncEntities(germs, msg.germs);
      updateHud();
      break;
    case 'chat':
      addChat(msg.from, msg.text);
      break;
    case 'fx':
      effects.push({ ...msg, age: 0 });
      break;
  }
}

function enterZone(zoneId) {
  world = ZONES[zoneId];
  world.id = zoneId;
  players.clear();
  germs.clear();
  effects.length = 0;
  $('zonename').textContent = world.name;
  $('hudzone').textContent = `📍 ${world.name}`;
}

// ---------- HUD, bag, quests, dialog ----------
function updateHud() {
  const self = players.get(myId);
  if (!self) return;
  const cls = CLASSES[self.classId];
  $('hudname').textContent = `${cls.icon} ${cls.name}${self.name} · Lv.${self.level}`;
  $('hpbar').style.width = `${(self.hp / self.maxHp) * 100}%`;
  $('hptext').textContent = self.dead ? 'กำลังพักฟื้นใน ICU…' : `HP ${self.hp} / ${self.maxHp}`;
  $('xpbar').style.width = `${(self.xp / self.xpNext) * 100}%`;
  $('xptext').textContent = `EXP ${self.xp} / ${self.xpNext}`;
  $('skillinfo').textContent = `[Q] ${cls.skill.name} — ${self.skillCd > 0 ? `รอ ${self.skillCd.toFixed(1)} วิ` : 'พร้อมใช้!'}${self.buff ? ' · ⚡ บัฟโจมตีเร็ว' : ''}`;
  $('skl').textContent = self.skillCd > 0 ? Math.ceil(self.skillCd) : 'สกิล';
  $('skl').classList.toggle('cooldown', self.skillCd > 0);
}

function itemStatText(item) {
  if (item.heal) return `ฟื้น HP ${item.heal}`;
  const parts = [];
  if (item.atk) parts.push(`ATK+${item.atk}`);
  if (item.def) parts.push(`DEF+${item.def}`);
  if (item.hp) parts.push(`HP+${item.hp}`);
  if (item.speed) parts.push(`SPD+${item.speed}`);
  return parts.join(' ');
}

function slotButton(html, onClick) {
  const b = document.createElement('button');
  b.className = onClick ? 'slot' : 'slot empty';
  b.innerHTML = html;
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

function renderBag() {
  const bag = $('bag');
  bag.innerHTML = '';
  const s = me.stats;
  const title = document.createElement('h3');
  title.textContent = '🎒 อุปกรณ์ที่สวมใส่ (แตะเพื่อถอด)';
  const stats = document.createElement('div');
  stats.className = 'stats';
  stats.textContent = `โบนัสจากอุปกรณ์: ATK+${s.atk} · DEF+${s.def} · HP+${s.hp} · SPD+${s.speed}`;
  const gear = document.createElement('div');
  gear.className = 'grid';
  for (const [slot, label] of Object.entries(SLOTS)) {
    const itemId = me.equipment[slot];
    const item = ITEMS[itemId];
    gear.append(item
      ? slotButton(`<span class="ico">${item.icon}</span>${item.name}<small>${label} · ${itemStatText(item)}</small>`, () => send({ t: 'unequip', slot }))
      : slotButton(`<span class="ico">▫️</span>ว่าง<small>${label}</small>`));
  }
  const invTitle = document.createElement('h3');
  invTitle.textContent = 'กระเป๋า (แตะเพื่อใส่/ใช้)';
  const inv = document.createElement('div');
  inv.className = 'grid';
  const entries = Object.entries(me.inventory);
  if (!entries.length) inv.append(slotButton('ยังไม่มีของ — ไปตีเชื้อเลย!'));
  for (const [itemId, count] of entries) {
    const item = ITEMS[itemId];
    const action = item.heal ? 'ใช้' : `ใส่ (${SLOTS[item.slot]})`;
    inv.append(slotButton(`<span class="ico">${item.icon}</span>${item.name} x${count}<small>${action} · ${itemStatText(item)}</small>`,
      () => send({ t: item.heal ? 'use' : 'equip', itemId })));
  }
  bag.append(title, stats, gear, invTitle, inv);

  const heals = entries.filter(([id]) => ITEMS[id].heal).reduce((n, [, c]) => n + c, 0);
  $('healbtn').textContent = heals ? `🧴${heals}` : '🧴';
}

function renderQuests() {
  const box = $('quests');
  box.innerHTML = '';
  for (const [qid, progress] of Object.entries(me.quests.active)) {
    const q = QUESTS[qid];
    const ready = progress >= q.count;
    const line = document.createElement('div');
    line.className = ready ? 'q ready' : 'q';
    line.textContent = ready
      ? `✅ ${q.name} — กลับไปส่ง ${NPCS[q.npc].name}`
      : `📜 ${q.name}: ${GERMS[q.target].name} ${progress}/${q.count}`;
    box.append(line);
  }
}

let dialogTimer = null;
function showDialog(npcId, text) {
  const npc = NPCS[npcId];
  const box = $('dialog');
  box.querySelector('.who').textContent = `${npc.icon} ${npc.name}`;
  box.querySelector('.text').textContent = text;
  box.style.display = 'block';
  clearTimeout(dialogTimer);
  dialogTimer = setTimeout(() => (box.style.display = 'none'), 12000);
}
$('dialog').addEventListener('click', () => ($('dialog').style.display = 'none'));

function toggleBag() {
  const bag = $('bag');
  const open = bag.style.display !== 'block';
  bag.style.display = open ? 'block' : 'none';
  if (open) $('chat').classList.remove('open');
  $('help').style.display = open ? 'none' : 'block';
}
$('bagbtn').addEventListener('click', toggleBag);

function useBestHeal() {
  const self = players.get(myId);
  if (!self) return;
  const missing = self.maxHp - self.hp;
  const heals = Object.keys(me.inventory).filter((id) => ITEMS[id].heal).sort((a, b) => ITEMS[a].heal - ITEMS[b].heal);
  if (!heals.length) return;
  // Smallest potion that covers the missing HP, otherwise the biggest one
  const itemId = heals.find((id) => ITEMS[id].heal >= missing) || heals[heals.length - 1];
  send({ t: 'use', itemId });
}

function addChat(from, text) {
  const line = document.createElement('div');
  if (from) {
    const b = document.createElement('b');
    b.textContent = `${from}: `;
    line.append(b, document.createTextNode(text));
  } else {
    line.className = 'sys';
    line.textContent = text;
  }
  const log = $('chatlog');
  log.append(line);
  if (TOUCH && !$('chat').classList.contains('open')) showToast(line.textContent);
  while (log.children.length > 60) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}

// Phones: chat lives behind the 💬 button; new lines pop up as a toast meanwhile
let toastTimer = null;
function showToast(text) {
  const toast = $('toast');
  toast.textContent = text;
  toast.classList.add('show');
  $('chatbtn').classList.add('unread');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}

$('chatbtn').addEventListener('click', () => {
  const open = $('chat').classList.toggle('open');
  $('chatbtn').classList.remove('unread');
  $('toast').classList.remove('show');
  if (open) {
    $('bag').style.display = 'none';
    $('chatlog').scrollTop = $('chatlog').scrollHeight;
  }
});

const chatInput = $('chatinput');
if (TOUCH) chatInput.placeholder = 'แตะเพื่อพิมพ์แชท…';
chatInput.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') {
    if (chatInput.value.trim()) send({ t: 'chat', text: chatInput.value });
    chatInput.value = '';
    chatInput.blur();
  } else if (e.key === 'Escape') {
    chatInput.blur();
  }
});

// ---------- input ----------
window.addEventListener('keydown', (e) => {
  if (!myId) return;
  if (e.key === 'Enter') {
    chatInput.focus();
    e.preventDefault();
    return;
  }
  if (e.code === 'Space') {
    send({ t: 'attack' });
    e.preventDefault();
    return;
  }
  const actions = { KeyQ: () => send({ t: 'skill' }), KeyE: () => send({ t: 'talk' }), KeyH: useBestHeal, KeyI: toggleBag };
  if (actions[e.code]) {
    actions[e.code]();
    return;
  }
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

function currentInput() {
  let dx = joystick.dx;
  let dy = joystick.dy;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) dy -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) dy += 1;
  return { dx: Math.max(-1, Math.min(1, dx)), dy: Math.max(-1, Math.min(1, dy)) };
}

// Touch joystick
const joy = $('joy');
const knob = $('joyknob');
let joyTouch = null;
function setJoy(touch) {
  const r = joy.getBoundingClientRect();
  let dx = touch.clientX - (r.left + r.width / 2);
  let dy = touch.clientY - (r.top + r.height / 2);
  const max = r.width / 2;
  const len = Math.hypot(dx, dy);
  if (len > max) {
    dx = (dx / len) * max;
    dy = (dy / len) * max;
  }
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
  joystick.dx = dx / max;
  joystick.dy = dy / max;
}
joy.addEventListener('touchstart', (e) => {
  joyTouch = e.changedTouches[0].identifier;
  setJoy(e.changedTouches[0]);
  e.preventDefault();
});
joy.addEventListener('touchmove', (e) => {
  for (const t of e.changedTouches) if (t.identifier === joyTouch) setJoy(t);
  e.preventDefault();
});
joy.addEventListener('touchend', () => {
  joyTouch = null;
  joystick.dx = joystick.dy = 0;
  knob.style.transform = '';
});
$('atk').addEventListener('touchstart', (e) => {
  send({ t: 'attack' });
  e.preventDefault();
});
$('skl').addEventListener('touchstart', (e) => {
  send({ t: 'skill' });
  e.preventDefault();
});
$('talkbtn').addEventListener('touchstart', (e) => {
  send({ t: 'talk' });
  e.preventDefault();
});
$('healbtn').addEventListener('touchstart', (e) => {
  useBestHeal();
  e.preventDefault();
});

// ---------- rendering ----------
const VOID_COLOR = '#0c1424';
const LAIR_RADIUS = 180;

// Text keeps its on-screen size when the world is zoomed out
function label(text, x, y, color = '#ffffff', font = '600 13px Sarabun') {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1 / ZOOM, 1 / ZOOM);
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#000';
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

// Draw a sprite with its top-left at (x, y), optionally mirrored
function drawSprite(img, x, y, flip = false, w = img.width, h = img.height) {
  x = Math.round(x / SNAP) * SNAP;
  y = Math.round(y / SNAP) * SNAP;
  if (!flip) {
    ctx.drawImage(img, x, y, w, h);
    return;
  }
  ctx.save();
  ctx.translate(x + w, y);
  ctx.scale(-1, 1);
  ctx.drawImage(img, 0, 0, w, h);
  ctx.restore();
}

function groundTile(tx, ty) {
  const T = SPR.TILE;
  const cx = tx * T + T / 2;
  const cy = ty * T + T / 2;
  const h = SPR.hash(tx, ty, 1);
  if (Math.hypot(cx - world.safe.x, cy - world.safe.y) < world.safe.r) {
    const set = world.id === 'hospital' ? SPR.tiles.plaza : SPR.tiles.clinic;
    return set[Math.floor(h * set.length)];
  }
  if (Math.hypot(cx - world.boss.x, cy - world.boss.y) < LAIR_RADIUS) return SPR.tiles.lair[Math.floor(h * SPR.tiles.lair.length)];
  const kinds = SPR.zoneGround[world.id];
  const set = SPR.tiles[kinds[Math.floor(h * kinds.length)]];
  return set[Math.floor(SPR.hash(tx, ty, 2) * set.length)];
}

// Trees grow only on open grass, away from the hospital, portals and the boss lair
function treeAt(tx, ty) {
  if (world.id !== 'hospital' || SPR.hash(tx, ty, 3) > 0.035) return null;
  const x = tx * SPR.TILE + SPR.TILE / 2;
  const y = ty * SPR.TILE + SPR.TILE / 2;
  if (Math.hypot(x - world.safe.x, y - world.safe.y) < world.safe.r + 60) return null;
  if (Math.hypot(x - world.boss.x, y - world.boss.y) < LAIR_RADIUS + 40) return null;
  if (world.portals.some((p) => Math.hypot(x - p.x, y - p.y) < 100)) return null;
  return SPR.trees[Math.floor(SPR.hash(tx, ty, 4) * SPR.trees.length)];
}

function drawWorld(camX, camY, w, h, time) {
  const T = SPR.TILE;
  ctx.fillStyle = VOID_COLOR;
  ctx.fillRect(0, 0, w, h);
  const tx0 = Math.max(0, Math.floor(camX / T));
  const ty0 = Math.max(0, Math.floor(camY / T));
  const tx1 = Math.min(Math.ceil(world.width / T) - 1, Math.floor((camX + w) / T));
  const ty1 = Math.min(Math.ceil(world.height / T) - 1, Math.floor((camY + h) / T));
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) ctx.drawImage(groundTile(tx, ty), tx * T - camX, ty * T - camY);
  }

  // Trees (scan one extra row below so canopies poking up into view are drawn)
  for (let ty = ty0; ty <= ty1 + 1; ty++) {
    for (let tx = tx0 - 1; tx <= tx1 + 1; tx++) {
      const tree = treeAt(tx, ty);
      if (tree) drawSprite(tree, tx * T + T / 2 - tree.width / 2 - camX, ty * T + T - tree.height - camY);
    }
  }

  // Safe area
  if (world.id === 'hospital') {
    const b = SPR.hospital;
    drawSprite(b, world.safe.x - b.width / 2 - camX, world.safe.y - 125 - b.height - camY);
  } else {
    label(world.safe.label, world.safe.x - camX, world.safe.y - world.safe.r + 28 - camY, '#ffffff', '600 18px Mitr');
  }

  // Boss lair
  const boss = world.boss;
  label(world.boss.label, boss.x - camX, boss.y - camY - 150, '#ff8fab', '600 18px Mitr');

  // Portals
  const portalFrame = SPR.portal[Math.floor(time * 8) % SPR.portal.length];
  for (const p of world.portals) {
    drawSprite(portalFrame, p.x - portalFrame.width / 2 - camX, p.y - portalFrame.height / 2 - camY);
    label(p.minLevel ? `${p.label} (Lv.${p.minLevel}+)` : p.label, p.x - camX, p.y - camY - 42, '#d6ccff', '600 15px Mitr');
  }

  // NPCs
  for (const [npcId, npc] of Object.entries(NPCS)) {
    if (npc.zone !== world.id) continue;
    const img = SPR.characters[npcId][0];
    const nx = npc.x - camX;
    const ny = npc.y - camY;
    drawSprite(SPR.shadow.small, nx - 15, ny + 8);
    drawSprite(img, nx - img.width / 2, ny - 34 + (Math.floor(time * 2) % 2));
    label(npc.name, nx, ny - 42, '#9fe8ff');
    const marker = npcMarker(npcId);
    if (marker) label(marker, nx, ny - 60 + Math.sin(time * 5) * 3, marker === '?' ? '#4cd964' : '#ffd166', '16px "Press Start 2P"');
  }
}

// "!" = new quest available, "?" = quest ready to turn in
function npcMarker(npcId) {
  const { active, done } = me.quests;
  let offer = false;
  for (const [qid, q] of Object.entries(QUESTS)) {
    if (q.npc !== npcId) continue;
    if (qid in active) {
      if (active[qid] >= q.count) return '?';
      return null;
    }
    if (!offer && !done.includes(qid) && (!q.requires || done.includes(q.requires))) offer = true;
  }
  return offer ? '!' : null;
}

function drawHpBar(x, y, hp, maxHp, width) {
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  x = Math.round(x - width / 2);
  y = Math.round(y);
  ctx.fillStyle = '#000';
  ctx.fillRect(x - 1, y - 1, width + 2, 6);
  ctx.fillStyle = '#3a0d0d';
  ctx.fillRect(x, y, width, 4);
  ctx.fillStyle = ratio > 0.5 ? '#4cd964' : ratio > 0.25 ? '#ffcc00' : '#ff3b30';
  ctx.fillRect(x, y, Math.round(width * ratio), 4);
}

function drawGerm(g, camX, camY, time) {
  const type = GERMS[g.kind];
  const frames = SPR.germs[g.kind];
  const img = frames[(Math.floor(time * 4) + g.id) % frames.length];
  const x = g.rx - camX;
  const y = g.ry - camY;
  const shadowW = Math.round(img.width * 0.7);
  drawSprite(SPR.shadow.big, x - shadowW / 2, y + img.height * 0.32, false, shadowW, 10);
  drawSprite(img, x - img.width / 2, y - img.height / 2, g.flip);

  const top = y - img.height / 2;
  drawHpBar(x, top - 6, g.hp, g.maxHp, type.boss ? 80 : 32);
  const status = `${g.marked ? '🎯' : ''}${g.stunned ? '💫' : ''}`;
  label(`${type.name}${status ? ` ${status}` : ''}`, x, top - 10, type.boss ? '#ff8fab' : '#ffffff', type.boss ? '700 15px Sarabun' : '600 12px Sarabun');
}

function drawPlayer(p, camX, camY, time, now) {
  const cls = CLASSES[p.classId];
  const frames = SPR.characters[p.classId];
  const moving = now - p.movedAt < 150;
  const img = frames[moving ? Math.floor(time * 8) % frames.length : 0];
  const x = p.rx - camX;
  const y = p.ry - camY;

  ctx.globalAlpha = p.dead ? 0.35 : 1;
  drawSprite(SPR.shadow.small, x - 15, y + 8);
  if (p.buff) {
    ctx.strokeStyle = Math.floor(time * 6) % 2 ? '#ffd166' : '#f5a623';
    ctx.lineWidth = 3;
    ctx.strokeRect(Math.round(x - 22), Math.round(y - 38), 44, 56);
  }
  drawSprite(img, x - img.width / 2, y - 34 - (moving ? Math.floor(time * 8) % 2 : 0), p.flip);
  ctx.globalAlpha = 1;
  if (p.dead) label('🚑', x, y - 4, '#fff', '22px sans-serif');

  drawHpBar(x, y - 42, p.hp, p.maxHp, 36);
  label(`${cls.icon} ${p.name}`, x, y - 48, p.id === myId ? '#ffd166' : '#ffffff');
  label(`Lv.${p.level}`, x, y - 64, '#9fe8ff', '8px "Press Start 2P"');
}

function drawEffects(camX, camY, dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const fx = effects[i];
    fx.age += dt;
    const life = { skillname: 1.4, text: 1.4, loot: 2 }[fx.kind] || 0.9;
    if (fx.age > life) {
      effects.splice(i, 1);
      continue;
    }
    const k = fx.age / life;
    ctx.textAlign = 'center';

    if (fx.kind === 'swing') {
      const p = players.get(fx.id);
      if (!p || fx.age > 0.25) continue;
      ctx.beginPath();
      ctx.arc(p.rx - camX, p.ry - camY, fx.radius * 0.6, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${0.8 - fx.age * 3})`;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.font = '22px sans-serif';
      const a = fx.age * 25;
      ctx.fillText(fx.icon, p.rx - camX + Math.cos(a) * fx.radius * 0.6, p.ry - camY + Math.sin(a) * fx.radius * 0.6);
    } else if (fx.kind === 'shot') {
      if (fx.age > 0.25) continue;
      const t = fx.age / 0.25;
      ctx.font = '20px sans-serif';
      ctx.fillText(fx.icon, fx.from.x + (fx.to.x - fx.from.x) * t - camX, fx.from.y + (fx.to.y - fx.from.y) * t - camY);
    } else if (fx.kind === 'ring') {
      ctx.beginPath();
      ctx.arc(fx.x - camX, fx.y - camY, fx.radius * Math.min(1, k * 3), 0, Math.PI * 2);
      ctx.strokeStyle = fx.color;
      ctx.globalAlpha = 1 - k;
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (fx.kind === 'beam') {
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = '#f1c40f';
      ctx.lineCap = 'round';
      ctx.lineWidth = fx.width;
      ctx.beginPath();
      ctx.moveTo(fx.from.x - camX, fx.from.y - camY);
      ctx.lineTo(fx.to.x - camX, fx.to.y - camY);
      ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = fx.width / 3;
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.globalAlpha = 1;
    } else if (fx.kind === 'skillname') {
      const p = players.get(fx.id);
      if (!p) continue;
      ctx.globalAlpha = 1 - k;
      label(fx.text, p.rx - camX, p.ry - camY - 82 - fx.age * 20, '#3ee0c5', '600 16px Mitr');
      ctx.globalAlpha = 1;
    } else {
      // dmg, hurt, heal, text — floating labels
      const text = { dmg: `-${fx.value}`, hurt: `-${fx.value}`, heal: `+${fx.value}`, text: fx.text, loot: `ได้ ${fx.text}` }[fx.kind];
      const color = { dmg: '#ffd166', hurt: '#ff5c5c', heal: '#4cd964', text: '#ffffff', loot: '#c9b8ff' }[fx.kind];
      const font = fx.kind === 'text' || fx.kind === 'loot' ? '600 15px Mitr' : '12px "Press Start 2P"';
      ctx.globalAlpha = 1 - k;
      label(text, fx.x - camX, fx.y - camY - 26 - fx.age * 40, color, font);
      ctx.globalAlpha = 1;
    }
  }
}

function drawMinimap(w, h) {
  // Phones: top-right under the buttons, clear of the touch controls
  const size = TOUCH ? 96 : 140;
  const x = w - size - (TOUCH ? 8 : 12);
  const y = TOUCH ? $('bagbtn').getBoundingClientRect().bottom + 8 : h - size - 12;
  const s = size / world.width;
  ctx.fillStyle = 'rgba(16,30,44,.85)';
  ctx.fillRect(x, y, size, size);
  ctx.beginPath();
  ctx.arc(x + world.safe.x * s, y + world.safe.y * s, world.safe.r * s, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.fillStyle = '#7b61ff';
  for (const p of world.portals) ctx.fillRect(x + p.x * s - 3, y + p.y * s - 3, 6, 6);
  for (const g of germs.values()) {
    const boss = GERMS[g.kind].boss;
    ctx.fillStyle = boss ? '#ff2d6f' : '#e5484d';
    ctx.fillRect(x + g.x * s - (boss ? 3 : 1), y + g.y * s - (boss ? 3 : 1), boss ? 6 : 2, boss ? 6 : 2);
  }
  for (const p of players.values()) {
    ctx.fillStyle = p.id === myId ? '#3ee0c5' : '#9fd0ff';
    ctx.fillRect(x + p.x * s - 2, y + p.y * s - 2, 4, 4);
  }
}

let lastFrame = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  const w = window.innerWidth;
  const h = window.innerHeight;

  if (world) {
    // Send input only when it changes
    const input = currentInput();
    const key = `${input.dx.toFixed(2)},${input.dy.toFixed(2)}`;
    if (key !== lastSentInput) {
      lastSentInput = key;
      send({ t: 'input', ...input });
    }

    // Smoothly interpolate toward server positions
    const k = Math.min(1, dt * 12);
    for (const e of [...players.values(), ...germs.values()]) {
      e.rx += (e.x - e.rx) * k;
      e.ry += (e.y - e.ry) * k;
    }

    const self = players.get(myId);
    const vw = w / ZOOM; // visible world size
    const vh = h / ZOOM;
    const camX = Math.round(((self ? self.rx : world.safe.x) - vw / 2) / SNAP) * SNAP;
    const camY = Math.round(((self ? self.ry : world.safe.y) - vh / 2) / SNAP) * SNAP;
    const time = now / 1000;

    ctx.save();
    ctx.scale(ZOOM, ZOOM);
    drawWorld(camX, camY, vw, vh, time);
    for (const g of germs.values()) drawGerm(g, camX, camY, time);
    // Draw back-to-front so lower characters overlap higher ones
    const sorted = [...players.values()].sort((a, b) => a.ry - b.ry);
    for (const p of sorted) drawPlayer(p, camX, camY, time, now);
    drawEffects(camX, camY, dt);
    ctx.restore();
    drawMinimap(w, h);

    // Light up the talk button when an NPC is in reach
    const near = self && Object.values(NPCS).some((n) => n.zone === world.id && Math.hypot(n.x - self.x, n.y - self.y) <= 90);
    $('talkbtn').classList.toggle('near', Boolean(near));
  } else {
    ctx.fillStyle = '#0c1a24';
    ctx.fillRect(0, 0, w, h);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
