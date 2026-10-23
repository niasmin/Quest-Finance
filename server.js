// Dr. Quest — authoritative game server.
// Serves the client from ./public and runs the shared world over WebSocket.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { CLASSES, GERMS } = require('./public/shared.js');

const PORT = process.env.PORT || 3000;
const TICK_RATE = 20; // simulation steps per second
const DT = 1 / TICK_RATE;

const WORLD = { width: 2400, height: 2400, town: { x: 1200, y: 1200, r: 220 }, bossLair: { x: 260, y: 260 } };
const PLAYER_SPEED = 180; // px/s
const RESPAWN_DELAY = 3;
const GERM_RESPAWN = 10;

const KILL_LINES = ['หายป่วยแล้ว!', 'ล้างมือ 7 ขั้นตอน!', 'ทานยาให้ครบนะ', 'เคสปิดแล้ว ✔', 'ส่งต่อไม่ทันละ!', 'ไข้ลดแล้ว!'];

// ---------- static file server ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const PUBLIC_DIR = path.join(__dirname, 'public');

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const filePath = path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---------- world state ----------
let nextId = 1;
const players = new Map(); // id -> player
const germs = new Map(); // id -> germ

const rand = (min, max) => min + Math.random() * (max - min);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const xpForLevel = (level) => 50 * level * level;
const inTown = (p) => dist(p, WORLD.town) < WORLD.town.r;

function spawnPoint(kind) {
  const type = GERMS[kind];
  if (type.boss) return { ...WORLD.bossLair };
  const [minD, maxD] = type.zone;
  for (;;) {
    const p = { x: rand(60, WORLD.width - 60), y: rand(60, WORLD.height - 60) };
    const d = dist(p, WORLD.town);
    if (d >= minD && d <= maxD) return p;
  }
}

function spawnGerm(kind) {
  const type = GERMS[kind];
  const home = spawnPoint(kind);
  const g = {
    id: nextId++, kind, x: home.x, y: home.y, home,
    hp: type.hp, maxHp: type.hp, targetId: null,
    wander: { ...home }, attackCd: 0, deadFor: 0, stunned: 0, marked: 0,
  };
  germs.set(g.id, g);
}

for (const kind of Object.keys(GERMS)) {
  for (let i = 0; i < GERMS[kind].count; i++) spawnGerm(kind);
}

function maxHpFor(player) {
  return CLASSES[player.classId].hp + (player.level - 1) * 15;
}

function createPlayer(name, classId) {
  const p = {
    id: nextId++, name, classId, level: 1, xp: 0,
    x: WORLD.town.x + rand(-60, 60), y: WORLD.town.y + rand(-60, 60),
    input: { dx: 0, dy: 0 }, facing: { x: 1, y: 0 },
    attackCd: 0, skillCd: 0, buff: 0, deadFor: 0,
  };
  p.maxHp = maxHpFor(p);
  p.hp = p.maxHp;
  return p;
}

// ---------- networking ----------
const wss = new WebSocketServer({ server });

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const client of wss.clients) if (client.readyState === client.OPEN) client.send(data);
}

function systemChat(text) {
  broadcast({ t: 'chat', from: null, text });
}

wss.on('connection', (ws) => {
  let player = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.t === 'join' && !player) {
      const name = String(msg.name || '').trim().slice(0, 16) || `หมอเวร${nextId}`;
      const classId = Object.hasOwn(CLASSES, msg.classId) ? msg.classId : 'doctor';
      player = createPlayer(name, classId);
      players.set(player.id, player);
      send(ws, { t: 'welcome', id: player.id, world: WORLD });
      systemChat(`${CLASSES[classId].icon} ${CLASSES[classId].name}${name} เข้าเวรแล้ว`);
      return;
    }
    if (!player) return;

    if (msg.t === 'input') {
      player.input.dx = clamp(Number(msg.dx) || 0, -1, 1);
      player.input.dy = clamp(Number(msg.dy) || 0, -1, 1);
    } else if (msg.t === 'attack') {
      tryAttack(player);
    } else if (msg.t === 'skill') {
      trySkill(player);
    } else if (msg.t === 'chat') {
      const text = String(msg.text || '').trim().slice(0, 120);
      if (text) broadcast({ t: 'chat', from: player.name, text });
    }
  });

  ws.on('close', () => {
    if (!player) return;
    players.delete(player.id);
    systemChat(`${player.name} ออกเวรแล้ว`);
  });
});

// ---------- combat ----------
function nearestGerm(from, range) {
  let best = null;
  let bestD = range;
  for (const g of germs.values()) {
    if (g.deadFor > 0) continue;
    const d = dist(from, g);
    if (d <= bestD) {
      bestD = d;
      best = g;
    }
  }
  return best;
}

function germsWithin(center, radius) {
  return [...germs.values()].filter((g) => g.deadFor <= 0 && dist(center, g) <= radius);
}

function alliesWithin(center, radius) {
  return [...players.values()].filter((p) => p.deadFor <= 0 && dist(center, p) <= radius);
}

function levelScale(player) {
  return 1 + 0.15 * (player.level - 1);
}

function damageGerm(player, g, base) {
  let dmg = Math.round(base * levelScale(player) * rand(0.9, 1.15));
  if (g.marked > 0) dmg = Math.round(dmg * 1.5);
  g.hp -= dmg;
  if (g.stunned <= 0) g.targetId = player.id;
  broadcast({ t: 'fx', kind: 'dmg', x: g.x, y: g.y, value: dmg });

  if (g.hp <= 0) {
    const type = GERMS[g.kind];
    g.deadFor = type.respawn || GERM_RESPAWN;
    g.targetId = null;
    broadcast({ t: 'fx', kind: 'text', x: g.x, y: g.y, text: pick(KILL_LINES) });
    if (type.boss) systemChat(`🏆 ${player.name} ปราบ${type.name}สำเร็จ! โรงพยาบาลปลอดภัยแล้ว (ชั่วคราว)`);
    gainXp(player, type.xp);
  }
}

function tryAttack(player) {
  if (player.deadFor > 0 || player.attackCd > 0) return;
  const cls = CLASSES[player.classId];
  player.attackCd = player.buff > 0 ? cls.cd / 2 : cls.cd;

  const target = nearestGerm(player, cls.range);
  if (cls.ranged) {
    if (!target) return;
    broadcast({ t: 'fx', kind: 'shot', icon: cls.icon, from: { x: player.x, y: player.y }, to: { x: target.x, y: target.y } });
  } else {
    broadcast({ t: 'fx', kind: 'swing', id: player.id, icon: cls.icon, radius: cls.range });
  }
  if (target) damageGerm(player, target, cls.dmg);
}

function trySkill(player) {
  if (player.deadFor > 0 || player.skillCd > 0) return;
  const cls = CLASSES[player.classId];
  const s = cls.skill;
  const scale = levelScale(player);

  switch (s.type) {
    case 'nuke': {
      const g = nearestGerm(player, s.range);
      if (!g) return;
      broadcast({ t: 'fx', kind: 'shot', icon: '💉', from: { x: player.x, y: player.y }, to: { x: g.x, y: g.y } });
      damageGerm(player, g, s.power);
      break;
    }
    case 'heal':
    case 'calm': {
      for (const ally of alliesWithin(player, s.radius)) {
        const amount = Math.round(s.power * scale);
        ally.hp = Math.min(ally.maxHp, ally.hp + amount);
        broadcast({ t: 'fx', kind: 'heal', x: ally.x, y: ally.y, value: amount });
      }
      if (s.type === 'calm') {
        for (const g of germsWithin(player, s.radius)) {
          g.stunned = s.duration;
          g.targetId = null;
        }
      }
      break;
    }
    case 'stun':
      for (const g of germsWithin(player, s.radius)) {
        g.stunned = s.duration;
        damageGerm(player, g, s.power);
      }
      break;
    case 'buff':
      for (const ally of alliesWithin(player, s.radius)) ally.buff = s.duration;
      break;
    case 'aoe':
      for (const g of germsWithin(player, s.radius)) damageGerm(player, g, s.power);
      break;
    case 'aoeTarget': {
      const center = nearestGerm(player, s.range);
      if (!center) return;
      const at = { x: center.x, y: center.y };
      broadcast({ t: 'fx', kind: 'shot', icon: '💊', from: { x: player.x, y: player.y }, to: at });
      broadcast({ t: 'fx', kind: 'ring', x: at.x, y: at.y, radius: s.radius, color: cls.color });
      for (const g of germsWithin(at, s.radius)) damageGerm(player, g, s.power);
      player.skillCd = s.cd;
      broadcast({ t: 'fx', kind: 'skillname', id: player.id, text: s.name });
      return;
    }
    case 'mark':
      for (const g of germsWithin(player, s.radius)) g.marked = s.duration;
      break;
    case 'beam': {
      const f = player.facing;
      const end = { x: player.x + f.x * s.length, y: player.y + f.y * s.length };
      broadcast({ t: 'fx', kind: 'beam', from: { x: player.x, y: player.y }, to: end, width: s.width });
      for (const g of germs.values()) {
        if (g.deadFor > 0) continue;
        const rx = g.x - player.x;
        const ry = g.y - player.y;
        const along = rx * f.x + ry * f.y;
        const across = Math.abs(rx * f.y - ry * f.x);
        if (along >= 0 && along <= s.length && across <= s.width / 2 + GERMS[g.kind].size) damageGerm(player, g, s.power);
      }
      break;
    }
  }

  player.skillCd = s.cd;
  if (s.radius) broadcast({ t: 'fx', kind: 'ring', x: player.x, y: player.y, radius: s.radius, color: cls.color });
  broadcast({ t: 'fx', kind: 'skillname', id: player.id, text: s.name });
}

function gainXp(player, amount) {
  player.xp += amount;
  while (player.xp >= xpForLevel(player.level)) {
    player.xp -= xpForLevel(player.level);
    player.level++;
    player.maxHp = maxHpFor(player);
    player.hp = player.maxHp;
    systemChat(`🎉 ${CLASSES[player.classId].name}${player.name} เลื่อนขั้นเป็น Lv.${player.level}!`);
  }
}

function moveToward(entity, target, speed) {
  const dx = target.x - entity.x;
  const dy = target.y - entity.y;
  const d = Math.hypot(dx, dy);
  if (d < 1) return true;
  const step = Math.min(d, speed * DT);
  entity.x += (dx / d) * step;
  entity.y += (dy / d) * step;
  return false;
}

// ---------- simulation ----------
function update() {
  for (const p of players.values()) {
    if (p.deadFor > 0) {
      p.deadFor -= DT;
      if (p.deadFor <= 0) {
        p.hp = p.maxHp;
        p.x = WORLD.town.x;
        p.y = WORLD.town.y;
      }
      continue;
    }
    p.attackCd = Math.max(0, p.attackCd - DT);
    p.skillCd = Math.max(0, p.skillCd - DT);
    p.buff = Math.max(0, p.buff - DT);
    const { dx, dy } = p.input;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      p.facing = { x: dx / len, y: dy / len };
      p.x = clamp(p.x + p.facing.x * PLAYER_SPEED * DT, 0, WORLD.width);
      p.y = clamp(p.y + p.facing.y * PLAYER_SPEED * DT, 0, WORLD.height);
    }
    // Slow regeneration, much faster inside the hospital
    p.hp = Math.min(p.maxHp, p.hp + (inTown(p) ? 12 : 1) * DT);
  }

  for (const g of germs.values()) {
    const type = GERMS[g.kind];
    if (g.deadFor > 0) {
      g.deadFor -= DT;
      if (g.deadFor <= 0) {
        Object.assign(g, spawnPoint(g.kind));
        g.home = { x: g.x, y: g.y };
        g.hp = g.maxHp;
        g.stunned = g.marked = 0;
      }
      continue;
    }
    g.attackCd = Math.max(0, g.attackCd - DT);
    g.marked = Math.max(0, g.marked - DT);
    if (g.stunned > 0) {
      g.stunned -= DT;
      continue;
    }

    let target = g.targetId ? players.get(g.targetId) : null;
    if (target && (target.deadFor > 0 || inTown(target) || dist(g, target) > type.aggro * 2)) {
      target = null;
      g.targetId = null;
    }
    if (!target) {
      for (const p of players.values()) {
        if (p.deadFor > 0 || inTown(p)) continue;
        if (dist(g, p) < type.aggro) {
          target = p;
          g.targetId = p.id;
          break;
        }
      }
    }

    if (target) {
      if (dist(g, target) > type.size + 14) {
        moveToward(g, target, type.speed);
      } else if (g.attackCd <= 0) {
        g.attackCd = 1.2;
        target.hp -= type.dmg;
        broadcast({ t: 'fx', kind: 'hurt', x: target.x, y: target.y, value: type.dmg });
        if (target.hp <= 0) {
          target.hp = 0;
          target.deadFor = RESPAWN_DELAY;
          target.xp = Math.floor(target.xp * 0.9);
          g.targetId = null;
          systemChat(`🚑 ${target.name} ติดเชื้อ${type.name} ถูกหามส่ง ICU`);
        }
      }
    } else {
      // Wander around home, heal while idle
      g.hp = Math.min(g.maxHp, g.hp + (type.boss ? 30 : 5) * DT);
      if (moveToward(g, g.wander, type.speed * 0.4)) {
        g.wander = { x: clamp(g.home.x + rand(-120, 120), 0, WORLD.width), y: clamp(g.home.y + rand(-120, 120), 0, WORLD.height) };
      }
    }
  }

  broadcast({
    t: 'state',
    players: [...players.values()].map((p) => ({
      id: p.id, name: p.name, classId: p.classId, x: Math.round(p.x), y: Math.round(p.y),
      hp: Math.ceil(p.hp), maxHp: p.maxHp, level: p.level, xp: p.xp, xpNext: xpForLevel(p.level),
      skillCd: Math.round(p.skillCd * 10) / 10, buff: p.buff > 0, dead: p.deadFor > 0,
    })),
    germs: [...germs.values()].filter((g) => g.deadFor <= 0).map((g) => ({
      id: g.id, kind: g.kind, x: Math.round(g.x), y: Math.round(g.y), hp: Math.ceil(g.hp), maxHp: g.maxHp,
      stunned: g.stunned > 0, marked: g.marked > 0,
    })),
  });
}

setInterval(update, 1000 / TICK_RATE);

server.listen(PORT, () => {
  console.log(`Dr. Quest running at http://localhost:${PORT}`);
});
