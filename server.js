// Dr. Quest — authoritative game server.
// Serves the client from ./public and runs the shared world over WebSocket.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { CLASSES, ITEMS, GERMS, ZONES, NPCS, QUESTS } = require('./public/shared.js');
const storage = require('./src/storage.js');

const PORT = process.env.PORT || 3000;
const TICK_RATE = 20; // simulation steps per second
const DT = 1 / TICK_RATE;

const PLAYER_SPEED = 180; // px/s
const RESPAWN_DELAY = 3;
const GERM_RESPAWN = 10;
const TALK_RANGE = 90;
const PORTAL_RADIUS = 35;
const AUTOSAVE_SECONDS = 15;

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
const germs = new Map(); // id -> germ (each has a `zone`)

const rand = (min, max) => min + Math.random() * (max - min);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const xpForLevel = (level) => 50 * level * level;
const inSafeArea = (e) => dist(e, ZONES[e.zone].safe) < ZONES[e.zone].safe.r;

function spawnPoint(spawn) {
  const zone = ZONES[spawn.zone];
  if (spawn.fixed) return { x: spawn.fixed.x, y: spawn.fixed.y };
  const [minD, maxD] = spawn.band;
  for (;;) {
    const p = { x: rand(60, zone.width - 60), y: rand(60, zone.height - 60) };
    const d = dist(p, zone.safe);
    if (d >= minD && d <= maxD) return p;
  }
}

function spawnGerm(spawn) {
  const type = GERMS[spawn.kind];
  const home = spawnPoint(spawn);
  const g = {
    id: nextId++, kind: spawn.kind, zone: spawn.zone, spawn, x: home.x, y: home.y, home,
    hp: type.hp, maxHp: type.hp, targetId: null,
    wander: { ...home }, attackCd: 0, deadFor: 0, stunned: 0, marked: 0,
  };
  germs.set(g.id, g);
}

for (const [zoneId, zone] of Object.entries(ZONES)) {
  for (const s of zone.spawns) {
    for (let i = 0; i < s.count; i++) spawnGerm({ ...s, zone: zoneId });
  }
  const b = zone.boss;
  spawnGerm({ kind: b.kind, zone: zoneId, fixed: { x: b.x, y: b.y }, respawn: b.respawn });
}

// ---------- players ----------
function gearStats(player) {
  const stats = { atk: 0, def: 0, hp: 0, speed: 0 };
  for (const itemId of Object.values(player.equipment)) {
    const item = ITEMS[itemId];
    for (const k of Object.keys(stats)) stats[k] += item[k] || 0;
  }
  return stats;
}

function refreshStats(player) {
  player.stats = gearStats(player);
  player.maxHp = CLASSES[player.classId].hp + (player.level - 1) * 15 + player.stats.hp;
  player.hp = Math.min(player.hp ?? player.maxHp, player.maxHp);
  player.dirty = true;
}

function newCharacterData(classId) {
  return { classId, level: 1, xp: 0, inventory: { gel: 3 }, equipment: {}, quests: { active: {}, done: [] } };
}

function createPlayer(ws, name, data) {
  const zone = ZONES.hospital;
  const p = {
    id: nextId++, ws, name, zone: 'hospital',
    classId: data.classId, level: data.level, xp: data.xp,
    inventory: { ...data.inventory }, equipment: { ...data.equipment },
    quests: { active: { ...data.quests.active }, done: [...data.quests.done] },
    x: zone.safe.x + rand(-60, 60), y: zone.safe.y + rand(-60, 60),
    input: { dx: 0, dy: 0 }, facing: { x: 1, y: 0 },
    attackCd: 0, skillCd: 0, useCd: 0, portalCd: 0, buff: 0, deadFor: 0,
  };
  refreshStats(p);
  p.hp = p.maxHp;
  return p;
}

function characterData(p) {
  return { classId: p.classId, level: p.level, xp: p.xp, inventory: p.inventory, equipment: p.equipment, quests: p.quests };
}

function persist(p) {
  storage.save(p.name, characterData(p));
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

function broadcastZone(zone, msg) {
  const data = JSON.stringify(msg);
  for (const p of players.values()) if (p.zone === zone && p.ws.readyState === p.ws.OPEN) p.ws.send(data);
}

function systemChat(text) {
  broadcast({ t: 'chat', from: null, text });
}

function dialog(player, npcId, text) {
  send(player.ws, { t: 'dialog', npc: npcId, text });
}

function handleJoin(ws, msg) {
  const name = String(msg.name || '').trim().slice(0, 16);
  const password = String(msg.password || '');
  if (name.length < 2) return 'ชื่อต้องยาวอย่างน้อย 2 ตัวอักษร';
  if (password.length < 4) return 'รหัสผ่านต้องยาวอย่างน้อย 4 ตัวอักษร';

  let data;
  let isNew = false;
  if (storage.exists(name)) {
    if (!storage.verify(name, password)) return 'รหัสผ่านไม่ถูกต้อง (หรือชื่อนี้มีคนใช้แล้ว)';
    if ([...players.values()].some((p) => p.name.toLowerCase() === name.toLowerCase())) return 'ตัวละครนี้กำลังออนไลน์อยู่';
    data = storage.get(name);
  } else {
    const classId = Object.hasOwn(CLASSES, msg.classId) ? msg.classId : 'doctor';
    data = newCharacterData(classId);
    storage.create(name, password, data);
    isNew = true;
  }

  const player = createPlayer(ws, name, data);
  players.set(player.id, player);
  send(ws, { t: 'welcome', id: player.id, zone: player.zone, isNew });
  const cls = CLASSES[player.classId];
  systemChat(`${cls.icon} ${cls.name}${name} ${isNew ? 'เข้าเวรวันแรก ยินดีต้อนรับ!' : 'เข้าเวรแล้ว'}`);
  return player;
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
      const result = handleJoin(ws, msg);
      if (typeof result === 'string') {
        send(ws, { t: 'error', text: result });
        ws.close();
      } else {
        player = result;
      }
      return;
    }
    if (!player) return;

    switch (msg.t) {
      case 'input':
        player.input.dx = clamp(Number(msg.dx) || 0, -1, 1);
        player.input.dy = clamp(Number(msg.dy) || 0, -1, 1);
        break;
      case 'attack':
        tryAttack(player);
        break;
      case 'skill':
        trySkill(player);
        break;
      case 'talk':
        talk(player);
        break;
      case 'use':
        useItem(player, String(msg.itemId));
        break;
      case 'equip':
        equip(player, String(msg.itemId));
        break;
      case 'unequip':
        unequip(player, String(msg.slot));
        break;
      case 'chat': {
        const text = String(msg.text || '').trim().slice(0, 120);
        if (text) broadcast({ t: 'chat', from: player.name, text });
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!player) return;
    persist(player);
    players.delete(player.id);
    systemChat(`${player.name} ออกเวรแล้ว`);
  });
});

// ---------- items ----------
function addItem(player, itemId, count = 1) {
  player.inventory[itemId] = (player.inventory[itemId] || 0) + count;
  player.dirty = true;
}

function removeItem(player, itemId) {
  if (!player.inventory[itemId]) return false;
  if (--player.inventory[itemId] === 0) delete player.inventory[itemId];
  player.dirty = true;
  return true;
}

function useItem(player, itemId) {
  const item = ITEMS[itemId];
  if (!item?.heal || player.deadFor > 0 || player.useCd > 0) return;
  if (!removeItem(player, itemId)) return;
  player.useCd = 1;
  player.hp = Math.min(player.maxHp, player.hp + item.heal);
  broadcastZone(player.zone, { t: 'fx', kind: 'heal', x: player.x, y: player.y, value: item.heal });
}

function equip(player, itemId) {
  const item = ITEMS[itemId];
  if (!item?.slot || !removeItem(player, itemId)) return;
  const old = player.equipment[item.slot];
  if (old) addItem(player, old);
  player.equipment[item.slot] = itemId;
  refreshStats(player);
}

function unequip(player, slot) {
  const itemId = player.equipment[slot];
  if (!itemId) return;
  delete player.equipment[slot];
  addItem(player, itemId);
  refreshStats(player);
}

// ---------- quests ----------
function talk(player) {
  if (player.deadFor > 0) return;
  let npcId = null;
  for (const [id, npc] of Object.entries(NPCS)) {
    if (npc.zone === player.zone && dist(player, npc) <= TALK_RANGE) npcId = id;
  }
  if (!npcId) return;

  const npcQuests = Object.entries(QUESTS).filter(([, q]) => q.npc === npcId);
  const { active, done } = player.quests;

  for (const [qid, q] of npcQuests) {
    if (!(qid in active)) continue;
    if (active[qid] >= q.count) {
      delete active[qid];
      done.push(qid);
      for (const [itemId, count] of q.items) addItem(player, itemId, count);
      const rewards = q.items.map(([itemId, count]) => `${ITEMS[itemId].icon} ${ITEMS[itemId].name} x${count}`).join(', ');
      dialog(player, npcId, `${q.done}\n\n✅ ภารกิจสำเร็จ! ได้รับ ${q.xp} EXP, ${rewards}`);
      gainXp(player, q.xp);
      player.dirty = true;
      persist(player);
    } else {
      dialog(player, npcId, `ยังไม่เสร็จนะ! "${q.name}" (${active[qid]}/${q.count})`);
    }
    return;
  }

  const next = npcQuests.find(([qid, q]) => !done.includes(qid) && (!q.requires || done.includes(q.requires)));
  if (next) {
    const [qid, q] = next;
    active[qid] = 0;
    player.dirty = true;
    dialog(player, npcId, `📜 ภารกิจใหม่: ${q.name}\n\n${q.offer}`);
  } else {
    dialog(player, npcId, NPCS[npcId].idle);
  }
}

function questKillCredit(player, kind) {
  for (const [qid, progress] of Object.entries(player.quests.active)) {
    const q = QUESTS[qid];
    if (q.target === kind && progress < q.count) {
      player.quests.active[qid] = progress + 1;
      player.dirty = true;
    }
  }
}

// ---------- combat ----------
function nearestGerm(from, range) {
  let best = null;
  let bestD = range;
  for (const g of germs.values()) {
    if (g.deadFor > 0 || g.zone !== from.zone) continue;
    const d = dist(from, g);
    if (d <= bestD) {
      bestD = d;
      best = g;
    }
  }
  return best;
}

function germsWithin(center, zone, radius) {
  return [...germs.values()].filter((g) => g.deadFor <= 0 && g.zone === zone && dist(center, g) <= radius);
}

function alliesWithin(player, radius) {
  return [...players.values()].filter((p) => p.deadFor <= 0 && p.zone === player.zone && dist(player, p) <= radius);
}

function levelScale(player) {
  return 1 + 0.15 * (player.level - 1);
}

function damageGerm(player, g, base) {
  let dmg = Math.round((base + player.stats.atk) * levelScale(player) * rand(0.9, 1.15));
  if (g.marked > 0) dmg = Math.round(dmg * 1.5);
  g.hp -= dmg;
  if (g.stunned <= 0) g.targetId = player.id;
  broadcastZone(g.zone, { t: 'fx', kind: 'dmg', x: g.x, y: g.y, value: dmg });
  if (g.hp <= 0) killGerm(player, g);
}

function killGerm(player, g) {
  const type = GERMS[g.kind];
  g.deadFor = g.spawn.respawn || GERM_RESPAWN;
  g.targetId = null;
  broadcastZone(g.zone, { t: 'fx', kind: 'text', x: g.x, y: g.y, text: pick(KILL_LINES) });
  if (type.boss) systemChat(`🏆 ${player.name} ปราบ${type.name}สำเร็จ!`);

  for (const [itemId, chance] of type.drops) {
    if (Math.random() < chance) {
      addItem(player, itemId);
      const item = ITEMS[itemId];
      send(player.ws, { t: 'fx', kind: 'loot', x: g.x, y: g.y, text: `${item.icon} ${item.name}` });
    }
  }
  questKillCredit(player, g.kind);
  gainXp(player, type.xp);
}

function tryAttack(player) {
  if (player.deadFor > 0 || player.attackCd > 0) return;
  const cls = CLASSES[player.classId];
  player.attackCd = player.buff > 0 ? cls.cd / 2 : cls.cd;

  const target = nearestGerm(player, cls.range);
  if (cls.ranged) {
    if (!target) return;
    broadcastZone(player.zone, { t: 'fx', kind: 'shot', icon: cls.icon, from: { x: player.x, y: player.y }, to: { x: target.x, y: target.y } });
  } else {
    broadcastZone(player.zone, { t: 'fx', kind: 'swing', id: player.id, icon: cls.icon, radius: cls.range });
  }
  if (target) damageGerm(player, target, cls.dmg);
}

function trySkill(player) {
  if (player.deadFor > 0 || player.skillCd > 0) return;
  const cls = CLASSES[player.classId];
  const s = cls.skill;
  const scale = levelScale(player);
  const fx = (msg) => broadcastZone(player.zone, { t: 'fx', ...msg });
  let ringAt = s.radius ? { x: player.x, y: player.y } : null;

  switch (s.type) {
    case 'nuke': {
      const g = nearestGerm(player, s.range);
      if (!g) return;
      fx({ kind: 'shot', icon: '💉', from: { x: player.x, y: player.y }, to: { x: g.x, y: g.y } });
      damageGerm(player, g, s.power);
      break;
    }
    case 'heal':
    case 'calm':
      for (const ally of alliesWithin(player, s.radius)) {
        const amount = Math.round(s.power * scale);
        ally.hp = Math.min(ally.maxHp, ally.hp + amount);
        fx({ kind: 'heal', x: ally.x, y: ally.y, value: amount });
      }
      if (s.type === 'calm') {
        for (const g of germsWithin(player, player.zone, s.radius)) {
          g.stunned = s.duration;
          g.targetId = null;
        }
      }
      break;
    case 'stun':
      for (const g of germsWithin(player, player.zone, s.radius)) {
        g.stunned = s.duration;
        damageGerm(player, g, s.power);
      }
      break;
    case 'buff':
      for (const ally of alliesWithin(player, s.radius)) ally.buff = s.duration;
      break;
    case 'aoe':
      for (const g of germsWithin(player, player.zone, s.radius)) damageGerm(player, g, s.power);
      break;
    case 'aoeTarget': {
      const center = nearestGerm(player, s.range);
      if (!center) return;
      ringAt = { x: center.x, y: center.y };
      fx({ kind: 'shot', icon: '💊', from: { x: player.x, y: player.y }, to: ringAt });
      for (const g of germsWithin(ringAt, player.zone, s.radius)) damageGerm(player, g, s.power);
      break;
    }
    case 'mark':
      for (const g of germsWithin(player, player.zone, s.radius)) g.marked = s.duration;
      break;
    case 'beam': {
      const f = player.facing;
      const end = { x: player.x + f.x * s.length, y: player.y + f.y * s.length };
      fx({ kind: 'beam', from: { x: player.x, y: player.y }, to: end, width: s.width });
      for (const g of germs.values()) {
        if (g.deadFor > 0 || g.zone !== player.zone) continue;
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
  if (ringAt) fx({ kind: 'ring', x: ringAt.x, y: ringAt.y, radius: s.radius, color: cls.color });
  fx({ kind: 'skillname', id: player.id, text: s.name });
}

function gainXp(player, amount) {
  player.xp += amount;
  let leveled = false;
  while (player.xp >= xpForLevel(player.level)) {
    player.xp -= xpForLevel(player.level);
    player.level++;
    leveled = true;
    systemChat(`🎉 ${CLASSES[player.classId].name}${player.name} เลื่อนขั้นเป็น Lv.${player.level}!`);
  }
  if (leveled) {
    refreshStats(player);
    player.hp = player.maxHp;
    persist(player);
  }
}

function changeZone(player, zoneId) {
  const safe = ZONES[zoneId].safe;
  player.zone = zoneId;
  player.x = safe.x + rand(-30, 30);
  player.y = safe.y + rand(-30, 30);
  player.portalCd = 1;
  send(player.ws, { t: 'zone', zone: zoneId });
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
function updatePlayer(p) {
  if (p.deadFor > 0) {
    p.deadFor -= DT;
    if (p.deadFor <= 0) {
      p.hp = p.maxHp;
      p.x = ZONES[p.zone].safe.x;
      p.y = ZONES[p.zone].safe.y;
    }
    return;
  }
  p.attackCd = Math.max(0, p.attackCd - DT);
  p.skillCd = Math.max(0, p.skillCd - DT);
  p.useCd = Math.max(0, p.useCd - DT);
  p.portalCd = Math.max(0, p.portalCd - DT);
  p.buff = Math.max(0, p.buff - DT);

  const zone = ZONES[p.zone];
  const { dx, dy } = p.input;
  const len = Math.hypot(dx, dy);
  if (len > 0) {
    const speed = PLAYER_SPEED + p.stats.speed;
    p.facing = { x: dx / len, y: dy / len };
    p.x = clamp(p.x + p.facing.x * speed * DT, 0, zone.width);
    p.y = clamp(p.y + p.facing.y * speed * DT, 0, zone.height);
  }
  // Slow regeneration, much faster inside the safe area
  p.hp = Math.min(p.maxHp, p.hp + (inSafeArea(p) ? 12 : 1) * DT);

  if (p.portalCd <= 0) {
    for (const portal of zone.portals) {
      if (dist(p, portal) > PORTAL_RADIUS) continue;
      if (portal.minLevel && p.level < portal.minLevel) {
        p.portalCd = 2;
        send(p.ws, { t: 'fx', kind: 'text', x: p.x, y: p.y, text: `ต้อง Lv.${portal.minLevel} ขึ้นไป!` });
      } else {
        changeZone(p, portal.to);
      }
      break;
    }
  }
}

function updateGerm(g) {
  const type = GERMS[g.kind];
  if (g.deadFor > 0) {
    g.deadFor -= DT;
    if (g.deadFor <= 0) {
      Object.assign(g, spawnPoint(g.spawn));
      g.home = { x: g.x, y: g.y };
      g.hp = g.maxHp;
      g.stunned = g.marked = 0;
    }
    return;
  }
  g.attackCd = Math.max(0, g.attackCd - DT);
  g.marked = Math.max(0, g.marked - DT);
  if (g.stunned > 0) {
    g.stunned -= DT;
    return;
  }

  let target = g.targetId ? players.get(g.targetId) : null;
  if (target && (target.deadFor > 0 || target.zone !== g.zone || inSafeArea(target) || dist(g, target) > type.aggro * 2)) {
    target = null;
    g.targetId = null;
  }
  if (!target) {
    for (const p of players.values()) {
      if (p.deadFor > 0 || p.zone !== g.zone || inSafeArea(p)) continue;
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
      const dmg = Math.max(1, type.dmg - target.stats.def);
      target.hp -= dmg;
      broadcastZone(g.zone, { t: 'fx', kind: 'hurt', x: target.x, y: target.y, value: dmg });
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
    const zone = ZONES[g.zone];
    g.hp = Math.min(g.maxHp, g.hp + (type.boss ? 30 : 5) * DT);
    if (moveToward(g, g.wander, type.speed * 0.4)) {
      g.wander = { x: clamp(g.home.x + rand(-120, 120), 0, zone.width), y: clamp(g.home.y + rand(-120, 120), 0, zone.height) };
    }
  }
}

function sendState() {
  const byZone = {};
  for (const zoneId of Object.keys(ZONES)) byZone[zoneId] = { t: 'state', players: [], germs: [] };
  for (const p of players.values()) {
    byZone[p.zone].players.push({
      id: p.id, name: p.name, classId: p.classId, x: Math.round(p.x), y: Math.round(p.y),
      hp: Math.ceil(p.hp), maxHp: p.maxHp, level: p.level, xp: p.xp, xpNext: xpForLevel(p.level),
      skillCd: Math.round(p.skillCd * 10) / 10, buff: p.buff > 0, dead: p.deadFor > 0,
    });
  }
  for (const g of germs.values()) {
    if (g.deadFor > 0) continue;
    byZone[g.zone].germs.push({
      id: g.id, kind: g.kind, x: Math.round(g.x), y: Math.round(g.y), hp: Math.ceil(g.hp), maxHp: g.maxHp,
      stunned: g.stunned > 0, marked: g.marked > 0,
    });
  }
  const payloads = {};
  for (const [zoneId, state] of Object.entries(byZone)) {
    if (state.players.length) payloads[zoneId] = JSON.stringify(state);
  }
  for (const p of players.values()) {
    if (p.ws.readyState === p.ws.OPEN) p.ws.send(payloads[p.zone]);
    if (p.dirty) {
      p.dirty = false;
      send(p.ws, { t: 'me', inventory: p.inventory, equipment: p.equipment, quests: p.quests, stats: p.stats });
    }
  }
}

function update() {
  for (const p of players.values()) updatePlayer(p);
  for (const g of germs.values()) updateGerm(g);
  sendState();
}

setInterval(update, 1000 / TICK_RATE);
setInterval(() => {
  for (const p of players.values()) persist(p);
}, AUTOSAVE_SECONDS * 1000);

function shutdown() {
  for (const p of players.values()) persist(p);
  storage.flush();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, () => {
  console.log(`Dr. Quest running at http://localhost:${PORT}`);
});
