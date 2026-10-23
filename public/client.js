// Quest Online — browser client. Renders server state and sends player input.
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);

let ws = null;
let myId = null;
let world = null;
let monsterTypes = {};
const players = new Map(); // id -> { ...serverState, rx, ry } (rx/ry = rendered position)
const monsters = new Map();
const effects = []; // floating numbers and swing arcs
const keys = new Set();
const joystick = { dx: 0, dy: 0 };
let lastSentInput = '';

function resize() {
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// ---------- connection ----------
$('loginform').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('nameinput').value.trim();
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name }));
  ws.onmessage = (ev) => handleMessage(JSON.parse(ev.data));
  ws.onclose = () => addChat(null, 'การเชื่อมต่อหลุด — รีเฟรชหน้าเพื่อเข้าใหม่');
});

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function syncEntities(map, list) {
  const seen = new Set();
  for (const s of list) {
    seen.add(s.id);
    const prev = map.get(s.id);
    map.set(s.id, prev ? Object.assign(prev, s) : { ...s, rx: s.x, ry: s.y });
  }
  for (const id of map.keys()) if (!seen.has(id)) map.delete(id);
}

function handleMessage(msg) {
  switch (msg.t) {
    case 'welcome':
      myId = msg.id;
      world = msg.world;
      monsterTypes = msg.monsterTypes;
      $('login').style.display = 'none';
      $('hud').style.display = 'block';
      $('chat').style.display = 'block';
      $('help').style.display = 'block';
      $('touch').classList.add('on');
      break;
    case 'state':
      syncEntities(players, msg.players);
      syncEntities(monsters, msg.monsters);
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

// ---------- HUD & chat ----------
function updateHud() {
  const me = players.get(myId);
  if (!me) return;
  $('hudname').textContent = `${me.name}  ·  Lv.${me.level}`;
  $('hpbar').style.width = `${(me.hp / me.maxHp) * 100}%`;
  $('hptext').textContent = me.dead ? 'กำลังเกิดใหม่…' : `HP ${me.hp} / ${me.maxHp}`;
  $('xpbar').style.width = `${(me.xp / me.xpNext) * 100}%`;
  $('xptext').textContent = `EXP ${me.xp} / ${me.xpNext}`;
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
  while (log.children.length > 60) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}

const chatInput = $('chatinput');
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
  if (!myId || document.activeElement === $('nameinput')) return;
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

// ---------- rendering ----------
function drawWorld(camX, camY, w, h) {
  ctx.fillStyle = '#2f5d3a';
  ctx.fillRect(0, 0, w, h);

  // Grass tiles
  const tile = 80;
  ctx.fillStyle = '#336640';
  const startX = Math.floor(camX / tile) * tile;
  const startY = Math.floor(camY / tile) * tile;
  for (let x = startX; x < camX + w; x += tile) {
    for (let y = startY; y < camY + h; y += tile) {
      if (((x / tile) + (y / tile)) % 2 === 0) ctx.fillRect(x - camX, y - camY, tile, tile);
    }
  }

  // World border
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 6;
  ctx.strokeRect(-camX, -camY, world.width, world.height);

  // Town
  const t = world.town;
  ctx.beginPath();
  ctx.arc(t.x - camX, t.y - camY, t.r, 0, Math.PI * 2);
  ctx.fillStyle = '#b79b6c';
  ctx.fill();
  ctx.strokeStyle = '#7d6440';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.font = '700 22px Sarabun';
  ctx.textAlign = 'center';
  ctx.fillText('เมืองเริ่มต้น', t.x - camX, t.y - camY - t.r + 34);
}

function drawHpBar(x, y, hp, maxHp, width) {
  ctx.fillStyle = '#222';
  ctx.fillRect(x - width / 2, y, width, 5);
  ctx.fillStyle = '#e5484d';
  ctx.fillRect(x - width / 2, y, width * Math.max(0, hp / maxHp), 5);
}

function drawMonster(m, camX, camY) {
  const type = monsterTypes[m.kind];
  const x = m.rx - camX;
  const y = m.ry - camY;
  ctx.beginPath();
  ctx.ellipse(x, y + type.size * 0.7, type.size, type.size * 0.35, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, type.size, 0, Math.PI * 2);
  ctx.fillStyle = type.color;
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.fillRect(x - 6, y - 4, 3, 4);
  ctx.fillRect(x + 3, y - 4, 3, 4);
  drawHpBar(x, y - type.size - 10, m.hp, m.maxHp, 34);
  ctx.fillStyle = '#fff';
  ctx.font = '12px Sarabun';
  ctx.textAlign = 'center';
  ctx.fillText(type.name, x, y - type.size - 14);
}

function drawPlayer(p, camX, camY) {
  const x = p.rx - camX;
  const y = p.ry - camY;
  ctx.globalAlpha = p.dead ? 0.35 : 1;
  ctx.beginPath();
  ctx.ellipse(x, y + 14, 14, 5, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, 14, 0, Math.PI * 2);
  ctx.fillStyle = p.color;
  ctx.fill();
  ctx.lineWidth = p.id === myId ? 3 : 1.5;
  ctx.strokeStyle = p.id === myId ? '#f2c14e' : '#111';
  ctx.stroke();
  ctx.globalAlpha = 1;
  drawHpBar(x, y - 26, p.hp, p.maxHp, 40);
  ctx.fillStyle = '#fff';
  ctx.font = '600 13px Sarabun';
  ctx.textAlign = 'center';
  ctx.fillText(`${p.name} Lv.${p.level}`, x, y - 32);
}

function drawEffects(camX, camY, dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const fx = effects[i];
    fx.age += dt;
    if (fx.age > 0.9) {
      effects.splice(i, 1);
      continue;
    }
    if (fx.kind === 'swing') {
      const p = players.get(fx.id);
      if (!p || fx.age > 0.2) continue;
      ctx.beginPath();
      ctx.arc(p.rx - camX, p.ry - camY, 40, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${0.6 - fx.age * 3})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    } else {
      ctx.globalAlpha = 1 - fx.age / 0.9;
      ctx.fillStyle = fx.kind === 'dmg' ? '#ffe066' : '#ff6b6b';
      ctx.font = '700 18px Sarabun';
      ctx.textAlign = 'center';
      ctx.fillText(`-${fx.value}`, fx.x - camX, fx.y - camY - 24 - fx.age * 40);
      ctx.globalAlpha = 1;
    }
  }
}

function drawMinimap(w, h) {
  const size = 140;
  const x = w - size - 12;
  const y = h - size - 12;
  const s = size / world.width;
  ctx.fillStyle = 'rgba(16,22,34,.8)';
  ctx.fillRect(x, y, size, size);
  ctx.beginPath();
  ctx.arc(x + world.town.x * s, y + world.town.y * s, world.town.r * s, 0, Math.PI * 2);
  ctx.fillStyle = '#b79b6c';
  ctx.fill();
  ctx.fillStyle = '#e5484d';
  for (const m of monsters.values()) ctx.fillRect(x + m.x * s - 1, y + m.y * s - 1, 2, 2);
  for (const p of players.values()) {
    ctx.fillStyle = p.id === myId ? '#f2c14e' : '#9fd0ff';
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
    for (const e of [...players.values(), ...monsters.values()]) {
      e.rx += (e.x - e.rx) * k;
      e.ry += (e.y - e.ry) * k;
    }

    const me = players.get(myId);
    const camX = (me ? me.rx : world.town.x) - w / 2;
    const camY = (me ? me.ry : world.town.y) - h / 2;

    drawWorld(camX, camY, w, h);
    for (const m of monsters.values()) drawMonster(m, camX, camY);
    for (const p of players.values()) drawPlayer(p, camX, camY);
    drawEffects(camX, camY, dt);
    drawMinimap(w, h);
  } else {
    ctx.fillStyle = '#0d1320';
    ctx.fillRect(0, 0, w, h);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
