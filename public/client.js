// Dr. Quest — browser client. Renders server state and sends player input.
const { CLASSES, GERMS } = window.GAME_DATA;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);

let ws = null;
let myId = null;
let world = null;
let selectedClass = 'doctor';
const players = new Map(); // id -> { ...serverState, rx, ry } (rx/ry = rendered position)
const germs = new Map();
const effects = []; // floating text, projectiles, rings, beams
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

// ---------- class picker ----------
function renderClassPicker() {
  const box = $('classes');
  for (const [id, c] of Object.entries(CLASSES)) {
    const card = document.createElement('div');
    card.className = `cls${id === selectedClass ? ' sel' : ''}`;
    card.innerHTML = `
      <div class="head"><span class="icon">${c.icon}</span>${c.name}</div>
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

// ---------- connection ----------
$('loginform').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('nameinput').value.trim();
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name, classId: selectedClass }));
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
      $('login').style.display = 'none';
      $('hud').style.display = 'block';
      $('chat').style.display = 'block';
      $('help').style.display = 'block';
      $('touch').classList.add('on');
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

// ---------- HUD & chat ----------
function updateHud() {
  const me = players.get(myId);
  if (!me) return;
  const cls = CLASSES[me.classId];
  $('hudname').textContent = `${cls.icon} ${cls.name}${me.name} · Lv.${me.level}`;
  $('hpbar').style.width = `${(me.hp / me.maxHp) * 100}%`;
  $('hptext').textContent = me.dead ? 'กำลังพักฟื้นใน ICU…' : `HP ${me.hp} / ${me.maxHp}`;
  $('xpbar').style.width = `${(me.xp / me.xpNext) * 100}%`;
  $('xptext').textContent = `EXP ${me.xp} / ${me.xpNext}`;
  $('skillinfo').textContent = `[Q] ${cls.skill.name} — ${me.skillCd > 0 ? `รอ ${me.skillCd.toFixed(1)} วิ` : 'พร้อมใช้!'}${me.buff ? ' · ⚡ บัฟโจมตีเร็ว' : ''}`;
  $('skl').textContent = me.skillCd > 0 ? Math.ceil(me.skillCd) : 'สกิล';
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
  if (e.code === 'KeyQ') {
    send({ t: 'skill' });
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

// ---------- rendering ----------
function drawWorld(camX, camY, w, h) {
  // Clinic floor tiles
  ctx.fillStyle = '#cfe7e4';
  ctx.fillRect(0, 0, w, h);
  const tile = 80;
  ctx.fillStyle = '#c2dfdb';
  const startX = Math.floor(camX / tile) * tile;
  const startY = Math.floor(camY / tile) * tile;
  for (let x = startX; x < camX + w; x += tile) {
    for (let y = startY; y < camY + h; y += tile) {
      if (((x / tile) + (y / tile)) % 2 === 0) ctx.fillRect(x - camX, y - camY, tile, tile);
    }
  }

  ctx.strokeStyle = '#335';
  ctx.lineWidth = 6;
  ctx.strokeRect(-camX, -camY, world.width, world.height);

  // Hospital (safe zone)
  const t = world.town;
  const tx = t.x - camX;
  const ty = t.y - camY;
  ctx.beginPath();
  ctx.arc(tx, ty, t.r, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#3ee0c5';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = 'rgba(229,72,77,.18)';
  ctx.fillRect(tx - 22, ty - 70, 44, 140);
  ctx.fillRect(tx - 70, ty - 22, 140, 44);
  ctx.fillStyle = '#1f6f78';
  ctx.font = '600 22px Mitr';
  ctx.textAlign = 'center';
  ctx.fillText('🏥 โรงพยาบาล', tx, ty - t.r + 36);

  // Boss lair
  const b = world.bossLair;
  ctx.beginPath();
  ctx.arc(b.x - camX, b.y - camY, 180, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(139,30,63,.18)';
  ctx.fill();
  ctx.fillStyle = 'rgba(139,30,63,.7)';
  ctx.font = '600 20px Mitr';
  ctx.fillText('☠ ห้องแล็บเชื้อหลุด', b.x - camX, b.y - camY - 150);
}

function drawHpBar(x, y, hp, maxHp, width) {
  ctx.fillStyle = '#222';
  ctx.fillRect(x - width / 2, y, width, 5);
  ctx.fillStyle = '#e5484d';
  ctx.fillRect(x - width / 2, y, width * Math.max(0, hp / maxHp), 5);
}

function drawGermBody(type, x, y, time, id) {
  const s = type.size;
  const wobble = Math.sin(time * 4 + id) * 0.08;
  ctx.fillStyle = type.color;
  ctx.strokeStyle = 'rgba(0,0,0,.35)';
  ctx.lineWidth = 2;

  if (type.shape === 'virus') {
    const spikes = 10;
    ctx.beginPath();
    for (let i = 0; i < spikes; i++) {
      const a = (i / spikes) * Math.PI * 2 + time * 0.8;
      ctx.moveTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
      ctx.lineTo(x + Math.cos(a) * s * 1.45, y + Math.sin(a) * s * 1.45);
    }
    ctx.stroke();
    for (let i = 0; i < spikes; i++) {
      const a = (i / spikes) * Math.PI * 2 + time * 0.8;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * s * 1.45, y + Math.sin(a) * s * 1.45, s * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y, s * (1 + wobble), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (type.shape === 'bacteria') {
    const len = s * 1.6;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(time * 2 + id) * 0.3);
    ctx.beginPath();
    ctx.roundRect(-len, -s * 0.75, len * 2, s * 1.5, s * 0.75);
    ctx.fill();
    ctx.stroke();
    // Flagella
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      ctx.moveTo(len, (i - 1) * s * 0.4);
      ctx.quadraticCurveTo(len + s * 0.6, (i - 1) * s * 0.4 + Math.sin(time * 8 + i) * 6, len + s, (i - 1) * s * 0.5);
    }
    ctx.stroke();
    ctx.restore();
  } else {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * s * 0.55, y + Math.sin(a) * s * 0.55, s * (0.55 + wobble), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Angry face
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(x - s * 0.32, y - s * 0.1, s * 0.13, 0, Math.PI * 2);
  ctx.arc(x + s * 0.32, y - s * 0.1, s * 0.13, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.5, y - s * 0.42);
  ctx.lineTo(x - s * 0.15, y - s * 0.28);
  ctx.moveTo(x + s * 0.5, y - s * 0.42);
  ctx.lineTo(x + s * 0.15, y - s * 0.28);
  ctx.moveTo(x - s * 0.25, y + s * 0.35);
  ctx.quadraticCurveTo(x, y + s * 0.15, x + s * 0.25, y + s * 0.35);
  ctx.stroke();
}

function drawGerm(g, camX, camY, time) {
  const type = GERMS[g.kind];
  const x = g.rx - camX;
  const y = g.ry - camY;
  ctx.beginPath();
  ctx.ellipse(x, y + type.size * 0.9, type.size, type.size * 0.3, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,.15)';
  ctx.fill();
  drawGermBody(type, x, y, time, g.id);

  const top = y - type.size * 1.5;
  drawHpBar(x, top - 8, g.hp, g.maxHp, type.boss ? 90 : 36);
  ctx.fillStyle = type.boss ? '#8b1e3f' : '#203040';
  ctx.font = type.boss ? '700 15px Sarabun' : '600 12px Sarabun';
  ctx.textAlign = 'center';
  ctx.fillText(`${type.name}${g.marked ? ' 🎯' : ''}${g.stunned ? ' 💫' : ''}`, x, top - 12);
}

function drawPlayer(p, camX, camY) {
  const cls = CLASSES[p.classId];
  const x = p.rx - camX;
  const y = p.ry - camY;
  ctx.globalAlpha = p.dead ? 0.35 : 1;
  ctx.beginPath();
  ctx.ellipse(x, y + 16, 15, 5, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,.2)';
  ctx.fill();
  if (p.buff) {
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(245,166,35,.8)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  // Scrubs-colored body with a white coat collar
  ctx.beginPath();
  ctx.arc(x, y, 16, 0, Math.PI * 2);
  ctx.fillStyle = cls.color;
  ctx.fill();
  ctx.lineWidth = p.id === myId ? 3 : 1.5;
  ctx.strokeStyle = p.id === myId ? '#ff6b6b' : '#203040';
  ctx.stroke();
  ctx.font = '18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(p.dead ? '🚑' : cls.icon, x, y + 1);
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = 1;
  drawHpBar(x, y - 28, p.hp, p.maxHp, 40);
  ctx.fillStyle = '#102030';
  ctx.font = '600 13px Sarabun';
  ctx.fillText(`${cls.name}${p.name} Lv.${p.level}`, x, y - 34);
}

function drawEffects(camX, camY, dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const fx = effects[i];
    fx.age += dt;
    const life = fx.kind === 'skillname' || fx.kind === 'text' ? 1.4 : 0.9;
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
      ctx.font = '600 16px Mitr';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#102030';
      const sy = p.ry - camY - 56 - fx.age * 20;
      ctx.strokeText(fx.text, p.rx - camX, sy);
      ctx.fillStyle = '#3ee0c5';
      ctx.fillText(fx.text, p.rx - camX, sy);
      ctx.globalAlpha = 1;
    } else {
      // dmg, hurt, heal, text — floating labels
      const label = { dmg: `-${fx.value}`, hurt: `-${fx.value}`, heal: `+${fx.value}`, text: fx.text }[fx.kind];
      const color = { dmg: '#ff9f1c', hurt: '#e5484d', heal: '#2ecc71', text: '#1f6f78' }[fx.kind];
      ctx.globalAlpha = 1 - k;
      ctx.font = fx.kind === 'text' ? '600 15px Mitr' : '700 18px Sarabun';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#fff';
      const ly = fx.y - camY - 26 - fx.age * 40;
      ctx.strokeText(label, fx.x - camX, ly);
      ctx.fillStyle = color;
      ctx.fillText(label, fx.x - camX, ly);
      ctx.globalAlpha = 1;
    }
  }
}

function drawMinimap(w, h) {
  const size = 140;
  const x = w - size - 12;
  const y = h - size - 12;
  const s = size / world.width;
  ctx.fillStyle = 'rgba(16,30,44,.85)';
  ctx.fillRect(x, y, size, size);
  ctx.beginPath();
  ctx.arc(x + world.town.x * s, y + world.town.y * s, world.town.r * s, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
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

    const me = players.get(myId);
    const camX = (me ? me.rx : world.town.x) - w / 2;
    const camY = (me ? me.ry : world.town.y) - h / 2;
    const time = now / 1000;

    drawWorld(camX, camY, w, h);
    for (const g of germs.values()) drawGerm(g, camX, camY, time);
    for (const p of players.values()) drawPlayer(p, camX, camY);
    drawEffects(camX, camY, dt);
    drawMinimap(w, h);
  } else {
    ctx.fillStyle = '#0c1a24';
    ctx.fillRect(0, 0, w, h);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
