const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 20000 });

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 4;
const WIN_KOS = 5;
const TICK_RATE = 30;
const SNAPSHOT_RATE = 20;
const DT = 1 / TICK_RATE;

const MAPS = {
  living: {
    name: '집안 거실',
    arena: { matX: 340, matY: 200, koX: 455, koY: 300 },
    itemBounds: { x: 285, y: 150 }
  },
  bathroom: {
    name: '화장실',
    arena: { matX: 315, matY: 180, koX: 430, koY: 275 },
    itemBounds: { x: 255, y: 130 }
  },
  walkway: {
    name: '아파트 산책로',
    arena: { matX: 365, matY: 160, koX: 485, koY: 250 },
    itemBounds: { x: 315, y: 118 }
  }
};

const CHARACTERS = {
  zzigae: {
    name: '찌개', species: '갈색 말티푸', speed: 176, accel: 900, mass: 1.23, dash: 330,
    bodyRadius: 24, jump: 288, spriteScale: 1.04
  },
  gamja: {
    name: '감자', species: '2개월 크림 토이푸들', speed: 218, accel: 1120, mass: 0.73, dash: 380,
    bodyRadius: 17, jump: 315, spriteScale: 0.72
  },
  mandu: {
    name: '만두', species: '하얀 푸들', speed: 188, accel: 950, mass: 1.04, dash: 348,
    bodyRadius: 23, jump: 332, spriteScale: 1.02
  },
  gucci: {
    name: '구찌', species: '주황+하양 코숏', speed: 202, accel: 1010, mass: 0.96, dash: 360,
    bodyRadius: 21, jump: 305, spriteScale: 0.96
  }
};

const ATTACKS = {
  punch:   { cooldown: 320, windup: 78,  duration: 260, radius: 45, reach: 35, damage: 7,  knockback: 185, stun: 125, lift: 28 },
  kick:    { cooldown: 500, windup: 115, duration: 370, radius: 52, reach: 43, damage: 10, knockback: 245, stun: 185, lift: 52 },
  headbutt:{ cooldown: 640, windup: 140, duration: 440, radius: 53, reach: 40, damage: 13, knockback: 305, stun: 245, lift: 78 },
  jumpkick:{ cooldown: 660, windup: 72,  duration: 440, radius: 58, reach: 50, damage: 16, knockback: 375, stun: 280, lift: 118 },
  hammer:  { cooldown: 700, windup: 155, duration: 500, radius: 70, reach: 57, damage: 18, knockback: 430, stun: 330, lift: 115 }
};

const rooms = new Map();
let botCounter = 1;
let itemCounter = 1;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.status(200).send('ok'));

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function cleanName(name) { return String(name || '').trim().replace(/[<>]/g, '').slice(0, 12) || '동물'; }

function roomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  } while (rooms.has(code));
  return code;
}

function getRoomForSocket(socketId) {
  for (const room of rooms.values()) if (room.players.has(socketId)) return room;
  return null;
}

function getMap(room) { return MAPS[room.mapKey] || MAPS.living; }

function serializePlayer(p) {
  const now = Date.now();
  return {
    id: p.id, name: p.name, character: p.character, isBot: p.isBot, isHost: p.isHost,
    x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, z: Math.round(p.z * 10) / 10,
    facingX: Math.round(p.facingX * 100) / 100, facingY: Math.round(p.facingY * 100) / 100,
    damage: Math.round(p.damage), kos: p.kos, deaths: p.deaths, alive: p.alive,
    stunned: p.stunUntil > now,
    invincible: p.shieldUntil > now || p.invulnUntil > now,
    starShield: p.shieldUntil > now,
    hammerHits: p.hammerUntil > now ? p.hammerHits : 0,
    attack: p.attack ? { type: p.attack.type, startedAt: p.attack.startedAt } : null,
    respawnAt: p.respawnAt || 0
  };
}

function serializeItem(item) {
  return { id: item.id, type: item.type, x: item.x, y: item.y, z: Math.max(0, item.z) };
}

function lobbyState(room) {
  return {
    code: room.code,
    status: room.status,
    hostId: room.hostId,
    mapKey: room.mapKey,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, character: p.character, isBot: p.isBot, isHost: p.id === room.hostId
    }))
  };
}

function makePlayer(id, name, character, isBot = false) {
  return {
    id, name: cleanName(name), character: CHARACTERS[character] ? character : 'zzigae', isBot, isHost: false,
    x: 0, y: 0, z: 0, moveVx: 0, moveVy: 0, knockVx: 0, knockVy: 0, vz: 0,
    facingX: 1, facingY: -1, damage: 0, kos: 0, deaths: 0, alive: true, respawnAt: 0,
    lastHitBy: null, lastHitAt: 0, stunUntil: 0, invulnUntil: 0, shieldUntil: 0,
    hammerUntil: 0, hammerHits: 0,
    attack: null, attackCooldownUntil: 0, dashCooldownUntil: 0,
    input: { up: false, down: false, left: false, right: false }, botThinkAt: 0
  };
}

function broadcastLobby(room) { io.to(room.code).emit('lobby_state', lobbyState(room)); }

function chooseSpawn(index, room) {
  const a = getMap(room).arena;
  const x = Math.min(220, a.matX * 0.62);
  const y = Math.min(110, a.matY * 0.55);
  const spawns = [[-x, -y], [x, y], [x, -y], [-x, y]];
  return spawns[index % spawns.length];
}

function resetPlayerForMatch(p, index, room) {
  const [x, y] = chooseSpawn(index, room);
  Object.assign(p, {
    x, y, z: 0, moveVx: 0, moveVy: 0, knockVx: 0, knockVy: 0, vz: 0,
    damage: 0, kos: 0, deaths: 0, alive: true, respawnAt: 0, lastHitBy: null, lastHitAt: 0,
    stunUntil: 0, invulnUntil: Date.now() + 1000, shieldUntil: 0, hammerUntil: 0, hammerHits: 0,
    attack: null, attackCooldownUntil: 0, dashCooldownUntil: 0
  });
}

function startMatch(room) {
  if (room.players.size < 2) return { ok: false, error: '혼자라면 연습용 봇을 1마리 이상 추가해 주세요.' };
  room.status = 'playing';
  room.winnerId = null;
  room.items = [];
  room.nextItemAt = Date.now() + 3500;
  let i = 0;
  for (const p of room.players.values()) resetPlayerForMatch(p, i++, room);
  io.to(room.code).emit('match_started', {
    winKos: WIN_KOS,
    mapKey: room.mapKey,
    map: getMap(room),
    characters: CHARACTERS
  });
  broadcastLobby(room);
  return { ok: true };
}

function respawnPlayer(p, index, room) {
  const [x, y] = chooseSpawn(index, room);
  Object.assign(p, {
    x, y, z: 0, moveVx: 0, moveVy: 0, knockVx: 0, knockVy: 0, vz: 0,
    damage: 0, alive: true, respawnAt: 0, stunUntil: Date.now() + 250,
    invulnUntil: Date.now() + 1200, shieldUntil: 0, hammerUntil: 0, hammerHits: 0, attack: null
  });
}

function koPlayer(room, victim) {
  if (!victim.alive) return;
  victim.alive = false;
  victim.deaths += 1;
  victim.respawnAt = Date.now() + 1500;
  victim.attack = null;
  victim.moveVx = victim.moveVy = 0;
  victim.hammerHits = 0;
  victim.hammerUntil = 0;
  victim.shieldUntil = 0;

  let scorer = null;
  if (victim.lastHitBy && Date.now() - victim.lastHitAt < 5000) {
    scorer = room.players.get(victim.lastHitBy);
    if (scorer && scorer.id !== victim.id) scorer.kos += 1;
  }

  io.to(room.code).emit('ko', {
    victimId: victim.id, scorerId: scorer ? scorer.id : null,
    victimName: victim.name, scorerName: scorer ? scorer.name : null
  });

  if (scorer && scorer.kos >= WIN_KOS) {
    room.status = 'finished';
    room.winnerId = scorer.id;
    io.to(room.code).emit('match_over', {
      winnerId: scorer.id, winnerName: scorer.name,
      scores: [...room.players.values()].map(p => ({ id: p.id, name: p.name, kos: p.kos, deaths: p.deaths }))
    });
    broadcastLobby(room);
  }
}

function screenInputToWorld(input) {
  let sx = 0, sy = 0;
  if (input.left) sx -= 1;
  if (input.right) sx += 1;
  if (input.up) sy -= 1;
  if (input.down) sy += 1;
  if (!sx && !sy) return { x: 0, y: 0, moving: false };
  const len = Math.hypot(sx, sy) || 1;
  sx /= len; sy /= len;
  let wx = sx + sy;
  let wy = sy - sx;
  const wlen = Math.hypot(wx, wy) || 1;
  return { x: wx / wlen, y: wy / wlen, moving: true };
}

function beginAttack(room, p, requestedType) {
  const now = Date.now();
  if (room.status !== 'playing' || !p.alive || now < p.stunUntil || now < p.attackCooldownUntil || p.attack) return;
  let type = requestedType;
  if (type === 'punch' && p.hammerHits > 0 && p.hammerUntil > now) type = 'hammer';
  if (type === 'kick' && p.z > 10) type = 'jumpkick';
  if (!ATTACKS[type]) return;
  const atk = ATTACKS[type];
  p.attack = { type, startedAt: now, hitDone: false };
  p.attackCooldownUntil = now + atk.cooldown;
  if (type === 'headbutt') {
    p.knockVx += p.facingX * 130;
    p.knockVy += p.facingY * 130;
  }
  if (type === 'jumpkick') {
    p.knockVx += p.facingX * 90;
    p.knockVy += p.facingY * 90;
  }
  io.to(room.code).emit('attack_started', { id: p.id, type, startedAt: now });
}

function performHit(room, attacker, atk) {
  const now = Date.now();
  const centerX = attacker.x + attacker.facingX * atk.reach;
  const centerY = attacker.y + attacker.facingY * atk.reach;
  const victims = [];

  for (const target of room.players.values()) {
    if (target.id === attacker.id || !target.alive || now < target.invulnUntil || now < target.shieldUntil) continue;
    const dz = Math.abs(target.z - attacker.z);
    const verticalAllowance = attacker.attack.type === 'jumpkick' ? 95 : 58;
    if (dz > verticalAllowance) continue;

    const dx = target.x - centerX;
    const dy = target.y - centerY;
    const dist = Math.hypot(dx, dy);
    const targetRadius = (CHARACTERS[target.character] || CHARACTERS.zzigae).bodyRadius;
    if (dist > atk.radius + targetRadius) continue;

    const toLen = Math.hypot(target.x - attacker.x, target.y - attacker.y) || 1;
    const dot = ((target.x - attacker.x) / toLen) * attacker.facingX + ((target.y - attacker.y) / toLen) * attacker.facingY;
    if (dot < -0.28 && dist > 30) continue;
    victims.push(target);
  }

  if (attacker.attack.type === 'hammer' && attacker.hammerHits > 0) {
    attacker.hammerHits -= 1;
    if (attacker.hammerHits <= 0) attacker.hammerUntil = 0;
  }

  for (const target of victims) {
    const dx = target.x - attacker.x;
    const dy = target.y - attacker.y;
    const len = Math.hypot(dx, dy) || 1;
    const dirX = len < 18 ? attacker.facingX : dx / len;
    const dirY = len < 18 ? attacker.facingY : dy / len;
    target.damage = clamp(target.damage + atk.damage, 0, 250);
    const char = CHARACTERS[target.character] || CHARACTERS.zzigae;
    const multiplier = (1 + target.damage / 92) / char.mass;
    target.knockVx += dirX * atk.knockback * multiplier;
    target.knockVy += dirY * atk.knockback * multiplier;
    target.vz = Math.max(target.vz, atk.lift * (0.75 + target.damage / 240));
    target.stunUntil = Math.max(target.stunUntil, now + atk.stun);
    target.invulnUntil = now + 95;
    target.lastHitBy = attacker.id;
    target.lastHitAt = now;

    io.to(room.code).emit('hit_effect', {
      attackerId: attacker.id, victimId: target.id, type: attacker.attack.type,
      x: target.x, y: target.y, z: target.z, damage: target.damage
    });
  }
}

function doJump(room, p) {
  const now = Date.now();
  if (room.status !== 'playing' || !p.alive || now < p.stunUntil) return;
  if (p.z <= 0.5) {
    const c = CHARACTERS[p.character] || CHARACTERS.zzigae;
    p.z = 0.5;
    p.vz = c.jump;
  }
}

function doDash(room, p) {
  const now = Date.now();
  if (room.status !== 'playing' || !p.alive || now < p.stunUntil || now < p.dashCooldownUntil) return;
  const dir = screenInputToWorld(p.input);
  const fx = dir.moving ? dir.x : p.facingX;
  const fy = dir.moving ? dir.y : p.facingY;
  const c = CHARACTERS[p.character] || CHARACTERS.zzigae;
  p.knockVx += fx * c.dash;
  p.knockVy += fy * c.dash;
  p.dashCooldownUntil = now + 1000;
}

function randomItemType() {
  const r = Math.random();
  if (r < 0.44) return 'hammer';
  if (r < 0.73) return 'heal';
  return 'star';
}

function spawnItem(room) {
  if (room.items.length >= 3) return;
  const map = getMap(room);
  const b = map.itemBounds;
  const item = {
    id: `item_${itemCounter++}`,
    type: randomItemType(),
    x: (Math.random() * 2 - 1) * b.x,
    y: (Math.random() * 2 - 1) * b.y,
    z: 230,
    vz: -35,
    bornAt: Date.now(),
    landedAt: 0
  };
  room.items.push(item);
  io.to(room.code).emit('item_drop', { id: item.id, type: item.type, x: item.x, y: item.y });
}

function applyItem(room, p, item) {
  const now = Date.now();
  if (item.type === 'hammer') {
    p.hammerHits = 3;
    p.hammerUntil = now + 16000;
  } else if (item.type === 'heal') {
    p.damage = Math.max(0, p.damage - 55);
  } else if (item.type === 'star') {
    p.shieldUntil = now + 6000;
  }
  io.to(room.code).emit('item_pickup', {
    playerId: p.id, playerName: p.name, type: item.type, damage: p.damage
  });
}

function updateItems(room, now) {
  if (now >= room.nextItemAt) {
    spawnItem(room);
    room.nextItemAt = now + 7000 + Math.random() * 4500;
  }

  for (const item of room.items) {
    if (item.z > 0) {
      item.z += item.vz * DT;
      item.vz -= 470 * DT;
      if (item.z <= 0) {
        item.z = 0;
        item.vz = 0;
        item.landedAt = now;
      }
    }
  }

  for (const p of room.players.values()) {
    if (!p.alive || p.z > 55) continue;
    const c = CHARACTERS[p.character] || CHARACTERS.zzigae;
    for (let i = room.items.length - 1; i >= 0; i--) {
      const item = room.items[i];
      if (item.z > 18) continue;
      if (Math.hypot(p.x - item.x, p.y - item.y) <= c.bodyRadius + 20) {
        room.items.splice(i, 1);
        applyItem(room, p, item);
      }
    }
  }

  room.items = room.items.filter(item => !item.landedAt || now - item.landedAt < 18000);
}

function updateBot(room, bot, now) {
  if (!bot.alive) return;
  let targetPoint = null;
  let targetPlayer = null;
  let best = Infinity;

  const groundedItem = room.items
    .filter(i => i.z < 20)
    .map(i => ({ i, d: Math.hypot(i.x - bot.x, i.y - bot.y) }))
    .sort((a, b) => a.d - b.d)[0];

  if (groundedItem && groundedItem.d < 140 && Math.random() < 0.75) {
    targetPoint = { x: groundedItem.i.x, y: groundedItem.i.y };
    best = groundedItem.d;
  } else {
    for (const p of room.players.values()) {
      if (p.id === bot.id || !p.alive) continue;
      const d = Math.hypot(p.x - bot.x, p.y - bot.y);
      if (d < best) { best = d; targetPlayer = p; }
    }
    if (targetPlayer) targetPoint = { x: targetPlayer.x, y: targetPlayer.y };
  }

  if (!targetPoint) return;
  const dx = targetPoint.x - bot.x;
  const dy = targetPoint.y - bot.y;
  const len = Math.hypot(dx, dy) || 1;
  const wx = dx / len, wy = dy / len;
  const sx = wx - wy;
  const sy = wx + wy;
  bot.input.left = sx < -0.25;
  bot.input.right = sx > 0.25;
  bot.input.up = sy < -0.25;
  bot.input.down = sy > 0.25;

  if (targetPlayer && best < 90 && now >= bot.botThinkAt) {
    const r = Math.random();
    if (bot.hammerHits > 0 && r < 0.6) beginAttack(room, bot, 'punch');
    else if (bot.z > 8 && r < 0.35) beginAttack(room, bot, 'kick');
    else if (r < 0.43) beginAttack(room, bot, 'punch');
    else if (r < 0.78) beginAttack(room, bot, 'kick');
    else beginAttack(room, bot, 'headbutt');
    bot.botThinkAt = now + 400 + Math.random() * 520;
  } else if (targetPlayer && best > 170 && Math.random() < 0.008) {
    doDash(room, bot);
  } else if (targetPlayer && best < 125 && Math.random() < 0.006) {
    doJump(room, bot);
  }
}

function physicsStep() {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.status !== 'playing') continue;
    const players = [...room.players.values()];
    const arena = getMap(room).arena;

    updateItems(room, now);

    for (let index = 0; index < players.length; index++) {
      const p = players[index];
      if (!p.alive) {
        if (p.respawnAt && now >= p.respawnAt) respawnPlayer(p, index, room);
        continue;
      }

      if (p.hammerUntil && now >= p.hammerUntil) { p.hammerUntil = 0; p.hammerHits = 0; }
      if (p.isBot) updateBot(room, p, now);
      const c = CHARACTERS[p.character] || CHARACTERS.zzigae;
      const canControl = now >= p.stunUntil;
      const move = canControl ? screenInputToWorld(p.input) : { x: 0, y: 0, moving: false };
      const targetVx = move.x * c.speed;
      const targetVy = move.y * c.speed;
      const blend = clamp(c.accel * DT / c.speed, 0, 1);
      p.moveVx += (targetVx - p.moveVx) * blend;
      p.moveVy += (targetVy - p.moveVy) * blend;

      if (move.moving && canControl) { p.facingX = move.x; p.facingY = move.y; }

      p.x += (p.moveVx + p.knockVx) * DT;
      p.y += (p.moveVy + p.knockVy) * DT;
      const knockDecay = Math.exp(-4.3 * DT);
      p.knockVx *= knockDecay;
      p.knockVy *= knockDecay;

      if (p.z > 0 || p.vz > 0) {
        p.z += p.vz * DT;
        p.vz -= 720 * DT;
        if (p.z <= 0) { p.z = 0; p.vz = 0; }
      }

      if (p.attack) {
        const atk = ATTACKS[p.attack.type];
        const elapsed = now - p.attack.startedAt;
        if (!p.attack.hitDone && elapsed >= atk.windup) {
          p.attack.hitDone = true;
          performHit(room, p, atk);
        }
        if (elapsed >= atk.duration) p.attack = null;
      }

      if (Math.abs(p.x) > arena.koX || Math.abs(p.y) > arena.koY) koPlayer(room, p);
    }

    for (let i = 0; i < players.length; i++) {
      const a = players[i];
      if (!a.alive) continue;
      const ca = CHARACTERS[a.character] || CHARACTERS.zzigae;
      for (let j = i + 1; j < players.length; j++) {
        const b = players[j];
        if (!b.alive || Math.abs(a.z - b.z) > 42) continue;
        const cb = CHARACTERS[b.character] || CHARACTERS.zzigae;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d < 1) { dx = 1; dy = 0; d = 1; }
        const minD = ca.bodyRadius + cb.bodyRadius - 4;
        if (d < minD) {
          const push = (minD - d) * 0.5;
          const nx = dx / d, ny = dy / d;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
        }
      }
    }
  }
}

function broadcastSnapshots() {
  for (const room of rooms.values()) {
    if (room.status !== 'playing') continue;
    io.to(room.code).emit('snapshot', {
      t: Date.now(),
      mapKey: room.mapKey,
      players: [...room.players.values()].map(serializePlayer),
      items: room.items.map(serializeItem)
    });
  }
}

setInterval(physicsStep, 1000 / TICK_RATE);
setInterval(broadcastSnapshots, 1000 / SNAPSHOT_RATE);

io.on('connection', socket => {
  socket.on('create_room', (payload, cb = () => {}) => {
    if (getRoomForSocket(socket.id)) return cb({ ok: false, error: '이미 방에 들어가 있어요.' });
    const code = roomCode();
    const p = makePlayer(socket.id, payload?.name, payload?.character);
    p.isHost = true;
    const room = {
      code, hostId: socket.id, status: 'lobby', winnerId: null, mapKey: 'living',
      players: new Map([[socket.id, p]]), items: [], nextItemAt: 0
    };
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    cb({ ok: true, code, playerId: socket.id });
    broadcastLobby(room);
  });

  socket.on('join_room', (payload, cb = () => {}) => {
    const code = String(payload?.code || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return cb({ ok: false, error: '없는 방 코드예요.' });
    if (room.players.size >= MAX_PLAYERS) return cb({ ok: false, error: '방이 꽉 찼어요.' });
    if (room.status === 'playing') return cb({ ok: false, error: '이미 게임 중이에요. 다음 판에 들어와 주세요.' });
    const p = makePlayer(socket.id, payload?.name, payload?.character);
    room.players.set(socket.id, p);
    socket.join(code);
    socket.data.roomCode = code;
    cb({ ok: true, code, playerId: socket.id });
    broadcastLobby(room);
  });

  socket.on('change_character', payload => {
    const room = getRoomForSocket(socket.id);
    if (!room || room.status === 'playing') return;
    const p = room.players.get(socket.id);
    if (p && CHARACTERS[payload?.character]) {
      p.character = payload.character;
      broadcastLobby(room);
    }
  });

  socket.on('change_map', (payload, cb = () => {}) => {
    const room = getRoomForSocket(socket.id);
    if (!room || room.hostId !== socket.id || room.status !== 'lobby') return cb({ ok: false, error: '방장만 맵을 바꿀 수 있어요.' });
    const key = String(payload?.mapKey || '');
    if (!MAPS[key]) return cb({ ok: false, error: '없는 맵이에요.' });
    room.mapKey = key;
    broadcastLobby(room);
    cb({ ok: true });
  });

  socket.on('add_bot', (_payload, cb = () => {}) => {
    const room = getRoomForSocket(socket.id);
    if (!room || room.hostId !== socket.id || room.status !== 'lobby') return cb({ ok: false });
    if (room.players.size >= MAX_PLAYERS) return cb({ ok: false, error: '최대 4명까지예요.' });
    const used = new Set([...room.players.values()].map(p => p.character));
    const keys = Object.keys(CHARACTERS);
    const charKey = keys.find(k => !used.has(k)) || keys[botCounter % keys.length];
    const id = `bot_${botCounter++}`;
    room.players.set(id, makePlayer(id, `${CHARACTERS[charKey].name}봇`, charKey, true));
    broadcastLobby(room);
    cb({ ok: true });
  });

  socket.on('remove_bot', payload => {
    const room = getRoomForSocket(socket.id);
    if (!room || room.hostId !== socket.id || room.status !== 'lobby') return;
    const p = room.players.get(payload?.id);
    if (p?.isBot) { room.players.delete(p.id); broadcastLobby(room); }
  });

  socket.on('start_game', (_payload, cb = () => {}) => {
    const room = getRoomForSocket(socket.id);
    if (!room || room.hostId !== socket.id) return cb({ ok: false, error: '방장만 시작할 수 있어요.' });
    cb(startMatch(room));
  });

  socket.on('input', payload => {
    const room = getRoomForSocket(socket.id);
    const p = room?.players.get(socket.id);
    if (!p || room.status !== 'playing') return;
    p.input = { up: !!payload?.up, down: !!payload?.down, left: !!payload?.left, right: !!payload?.right };
  });

  socket.on('action', payload => {
    const room = getRoomForSocket(socket.id);
    const p = room?.players.get(socket.id);
    if (!p || room.status !== 'playing') return;
    switch (payload?.type) {
      case 'jump': doJump(room, p); break;
      case 'dash': doDash(room, p); break;
      case 'punch': beginAttack(room, p, 'punch'); break;
      case 'kick': beginAttack(room, p, 'kick'); break;
      case 'headbutt': beginAttack(room, p, 'headbutt'); break;
    }
  });

  socket.on('disconnect', () => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    room.players.delete(socket.id);
    if (room.players.size === 0 || [...room.players.values()].every(p => p.isBot)) {
      rooms.delete(room.code);
      return;
    }
    if (room.hostId === socket.id) {
      const nextHost = [...room.players.values()].find(p => !p.isBot);
      if (nextHost) { room.hostId = nextHost.id; nextHost.isHost = true; }
    }
    if (room.status === 'playing' && room.players.size < 2) room.status = 'lobby';
    broadcastLobby(room);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`병맛 동물 격투게임 v3 서버 실행 중 (port ${PORT})`);
});
