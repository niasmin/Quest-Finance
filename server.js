// Quest Online — authoritative game server.
// Serves the client from ./public and runs the shared world over WebSocket.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const TICK_RATE = 20; // simulation steps per second
const DT = 1 / TICK_RATE;

const WORLD = { width: 2400, height: 2400, town: { x: 1200, y: 1200, r: 220 } };
const PLAYER_SPEED = 180; // px/s
const PLAYER_ATTACK_RANGE = 70;
const PLAYER_ATTACK_COOLDOWN = 0.6;
const RESPAWN_DELAY = 3;

const MONSTER_TYPES = {
  slime: { name: 'สไลม์', hp: 30, dmg: 4, speed: 70, xp: 10, aggro: 160, color: '#5fcf6b', size: 16 },
  wolf: { name: 'หมาป่า', hp: 60, dmg: 8, speed: 120, xp: 25, aggro: 220, color: '#9a8f86', size: 18 },
  orc: { name: 'ออร์ค', hp: 140, dmg: 15, speed: 90, xp: 70, aggro: 200, color: '#b5652f', size: 22 },
};

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
const monsters = new Map(); // id -> monster

const rand = (min, max) => min + Math.random() * (max - min);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const xpForLevel = (level) => 50 * level * level;
const inTown = (p) => dist(p, WORLD.town) < WORLD.town.r;

function randomWildPoint() {
  let p;
  do {
    p = { x: rand(60, WORLD.width - 60), y: rand(60, WORLD.height - 60) };
  } while (dist(p, WORLD.town) < WORLD.town.r + 150);
  return p;
}

function spawnMonster(kind) {
  const type = MONSTER_TYPES[kind];
  const home = randomWildPoint();
  const m = {
    id: nextId++, kind, x: home.x, y: home.y, home,
    hp: type.hp, maxHp: type.hp, targetId: null,
    wander: { x: home.x, y: home.y }, attackCd: 0, deadFor: 0,
  };
  monsters.set(m.id, m);
}

for (let i = 0; i < 40; i++) spawnMonster('slime');
for (let i = 0; i < 20; i++) spawnMonster('wolf');
for (let i = 0; i < 8; i++) spawnMonster('orc');

function maxHpForLevel(level) {
  return 80 + level * 20;
}

function createPlayer(name) {
  const level = 1;
  return {
    id: nextId++, name, level, xp: 0,
    x: WORLD.town.x + rand(-60, 60), y: WORLD.town.y + rand(-60, 60),
    hp: maxHpForLevel(level), maxHp: maxHpForLevel(level),
    input: { dx: 0, dy: 0 }, attackCd: 0, deadFor: 0,
    color: `hsl(${Math.floor(rand(0, 360))},70%,60%)`,
  };
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
      const name = String(msg.name || '').trim().slice(0, 16) || `ผู้กล้า${nextId}`;
      player = createPlayer(name);
      players.set(player.id, player);
      send(ws, { t: 'welcome', id: player.id, world: WORLD, monsterTypes: MONSTER_TYPES });
      systemChat(`${name} เข้าสู่โลกแล้ว`);
      return;
    }
    if (!player) return;

    if (msg.t === 'input') {
      player.input.dx = clamp(Number(msg.dx) || 0, -1, 1);
      player.input.dy = clamp(Number(msg.dy) || 0, -1, 1);
    } else if (msg.t === 'attack') {
      tryAttack(player);
    } else if (msg.t === 'chat') {
      const text = String(msg.text || '').trim().slice(0, 120);
      if (text) broadcast({ t: 'chat', from: player.name, text });
    }
  });

  ws.on('close', () => {
    if (!player) return;
    players.delete(player.id);
    systemChat(`${player.name} ออกจากเกม`);
  });
});

// ---------- combat ----------
function tryAttack(player) {
  if (player.deadFor > 0 || player.attackCd > 0) return;
  player.attackCd = PLAYER_ATTACK_COOLDOWN;

  let target = null;
  let best = PLAYER_ATTACK_RANGE;
  for (const m of monsters.values()) {
    if (m.deadFor > 0) continue;
    const d = dist(player, m);
    if (d <= best) {
      best = d;
      target = m;
    }
  }
  broadcast({ t: 'fx', kind: 'swing', id: player.id });
  if (!target) return;

  const dmg = Math.round(8 + player.level * 3 + rand(0, 5));
  target.hp -= dmg;
  target.targetId = player.id;
  broadcast({ t: 'fx', kind: 'dmg', x: target.x, y: target.y, value: dmg });

  if (target.hp <= 0) {
    const type = MONSTER_TYPES[target.kind];
    target.deadFor = 10; // seconds until respawn
    target.targetId = null;
    gainXp(player, type.xp);
  }
}

function gainXp(player, amount) {
  player.xp += amount;
  while (player.xp >= xpForLevel(player.level)) {
    player.xp -= xpForLevel(player.level);
    player.level++;
    player.maxHp = maxHpForLevel(player.level);
    player.hp = player.maxHp;
    systemChat(`🎉 ${player.name} เลเวลอัปเป็น Lv.${player.level}!`);
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
    const { dx, dy } = p.input;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      p.x = clamp(p.x + (dx / len) * PLAYER_SPEED * DT, 0, WORLD.width);
      p.y = clamp(p.y + (dy / len) * PLAYER_SPEED * DT, 0, WORLD.height);
    }
    // Slow regeneration, faster in town
    p.hp = Math.min(p.maxHp, p.hp + (inTown(p) ? 10 : 1) * DT);
  }

  for (const m of monsters.values()) {
    const type = MONSTER_TYPES[m.kind];
    if (m.deadFor > 0) {
      m.deadFor -= DT;
      if (m.deadFor <= 0) {
        Object.assign(m, randomWildPoint());
        m.home = { x: m.x, y: m.y };
        m.hp = m.maxHp;
      }
      continue;
    }
    m.attackCd = Math.max(0, m.attackCd - DT);

    let target = m.targetId ? players.get(m.targetId) : null;
    if (target && (target.deadFor > 0 || inTown(target) || dist(m, target) > type.aggro * 2)) {
      target = null;
      m.targetId = null;
    }
    if (!target) {
      for (const p of players.values()) {
        if (p.deadFor > 0 || inTown(p)) continue;
        if (dist(m, p) < type.aggro) {
          target = p;
          m.targetId = p.id;
          break;
        }
      }
    }

    if (target) {
      if (dist(m, target) > type.size + 14) {
        moveToward(m, target, type.speed);
      } else if (m.attackCd <= 0) {
        m.attackCd = 1.2;
        target.hp -= type.dmg;
        broadcast({ t: 'fx', kind: 'hurt', x: target.x, y: target.y, value: type.dmg });
        if (target.hp <= 0) {
          target.hp = 0;
          target.deadFor = RESPAWN_DELAY;
          target.xp = Math.floor(target.xp * 0.9);
          m.targetId = null;
          systemChat(`💀 ${target.name} ถูก${type.name}ล้ม`);
        }
      }
    } else {
      // Wander around home, heal while idle
      m.hp = Math.min(m.maxHp, m.hp + 5 * DT);
      if (moveToward(m, m.wander, type.speed * 0.4)) {
        m.wander = { x: clamp(m.home.x + rand(-120, 120), 0, WORLD.width), y: clamp(m.home.y + rand(-120, 120), 0, WORLD.height) };
      }
    }
  }

  broadcast({
    t: 'state',
    players: [...players.values()].map((p) => ({
      id: p.id, name: p.name, x: Math.round(p.x), y: Math.round(p.y),
      hp: Math.ceil(p.hp), maxHp: p.maxHp, level: p.level, xp: p.xp,
      xpNext: xpForLevel(p.level), dead: p.deadFor > 0, color: p.color,
    })),
    monsters: [...monsters.values()].filter((m) => m.deadFor <= 0).map((m) => ({
      id: m.id, kind: m.kind, x: Math.round(m.x), y: Math.round(m.y), hp: Math.ceil(m.hp), maxHp: m.maxHp,
    })),
  });
}

setInterval(update, 1000 / TICK_RATE);

server.listen(PORT, () => {
  console.log(`Quest Online running at http://localhost:${PORT}`);
});
