const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 10000,
  pingTimeout: 20000,
});

const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.status(200).send('ok'));

const rooms = new Map();

const CHARACTERS = {
  jjigae: { name: '찌개', kind: 'maltipoo', color: '#8b5a3c' },
  mandu: { name: '만두', kind: 'white_maltipoo', color: '#f4f1e8' },
  gamja: { name: '감자', kind: 'toy_poodle', color: '#f1d19b' },
  gucci: { name: '구찌', kind: 'cat', color: '#f5f0e6' },
};

const MAPS = {
  rooftop: {
    id: 'rooftop',
    name: '옥상 링',
    mode: 'ringout',
    arena: { left: 115, right: 845, top: 105, bottom: 470 },
    blast: { left: 35, right: 925, top: 20, bottom: 610 },
  },
  dojo: {
    id: 'dojo',
    name: '도장',
    mode: 'hp',
    arena: { left: 80, right: 880, top: 95, bottom: 500 },
  },
};

const TICK_RATE = 30;
const DT = 1 / TICK_RATE;
const PLAYER_SPEED = 165;
const AIR_CONTROL = 0.72;
const JUMP_VELOCITY = 370;
const GRAVITY = 1080;
const FRICTION = 0.80;
const BODY_RADIUS_X = 24;
const BODY_RADIUS_Y = 18;
const MAX_HP = 100;
const STOCKS = 3;

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function normalize(x, y) {
  const d = Math.hypot(x, y);
  return d > 0.0001 ? { x: x / d, y: y / d } : { x: 0, y: 0 };
}
function code() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 5; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
function sanitizeName(v) {
  const s = String(v || 'PLAYER').trim().slice(0, 10);
  return s || 'PLAYER';
}
function roomPublic(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    mapId: room.mapId,
    status: room.status,
    winnerId: room.winnerId,
    players: [...room.players.values()].map(p => ({
      id: p.id,
      name: p.name,
      character: p.character,
      ready: p.ready,
    })),
  };
}
function uniqueCharacter(room, preferred) {
  const used = new Set([...room.players.values()].map(p => p.character));
  if (preferred && CHARACTERS[preferred] && !used.has(preferred)) return preferred;
  return Object.keys(CHARACTERS).find(k => !used.has(k)) || 'jjigae';
}
function makeLobbyPlayer(id, name, character) {
  return {
    id, name, character, ready: false,
    input: { left:false,right:false,up:false,down:false,punch:false,kick:false,jump:false },
    prevInput: { punch:false,kick:false,jump:false },
  };
}
function spawnPoint(index, map) {
  const a = map.arena;
  const pts = [
    { x: a.left + 125, y: a.top + 115 },
    { x: a.right - 125, y: a.top + 115 },
    { x: a.left + 125, y: a.bottom - 90 },
    { x: a.right - 125, y: a.bottom - 90 },
  ];
  return pts[index % pts.length];
}
function resetFighter(p, index, map, full = false) {
  const s = spawnPoint(index, map);
  p.x = s.x; p.y = s.y; p.z = 0;
  p.vx = 0; p.vy = 0; p.vz = 0;
  p.facingX = index % 2 === 0 ? 1 : -1; p.facingY = 0; p.faceDir = index % 2 === 0 ? 1 : -1;
  p.hitstun = 0; p.invuln = 1.25; p.attack = null; p.attackCooldown = 0;
  p.state = 'idle'; p.stateTimer = 0;
  p.respawnTimer = 0;
  p.grounded = true;
  if (full) {
    p.stocks = STOCKS;
    p.damage = 0;
    p.hp = MAX_HP;
    p.eliminated = false;
    p.score = 0;
  } else {
    p.damage = 0;
    p.hp = MAX_HP;
  }
}
function startGame(room) {
  room.status = 'countdown';
  room.countdown = 3.2;
  room.winnerId = null;
  room.matchTime = 0;
  const map = MAPS[room.mapId];
  let i = 0;
  for (const p of room.players.values()) {
    Object.assign(p, {
      stocks: STOCKS, damage: 0, hp: MAX_HP, eliminated: false,
      x:0,y:0,z:0,vx:0,vy:0,vz:0,facingX:1,facingY:0,faceDir:1,
      hitstun:0,invuln:0,attack:null,attackCooldown:0,state:'idle',stateTimer:0,
      respawnTimer:0, grounded:true, score:0,
    });
    resetFighter(p, i++, map, true);
  }
  io.to(room.code).emit('gameStarted', { map: room.mapId, mode: map.mode });
}
function attackSpec(kind, aerial) {
  if (aerial) return { kind:'airkick', duration:0.33, activeStart:0.09, activeEnd:0.22, range:58, width:44, damage:11, baseKb:145, scaleKb:1.28 };
  if (kind === 'punch') return { kind:'punch', duration:0.24, activeStart:0.06, activeEnd:0.13, range:46, width:38, damage:6, baseKb:82, scaleKb:0.72 };
  return { kind:'kick', duration:0.34, activeStart:0.09, activeEnd:0.20, range:60, width:44, damage:9, baseKb:118, scaleKb:0.96 };
}
function beginAttack(p, kind) {
  if (p.attackCooldown > 0 || p.hitstun > 0 || p.eliminated || p.respawnTimer > 0) return;
  const aerial = kind === 'kick' && (p.z > 8 || !p.grounded || p.input.jump || p.vz > 40);
  const spec = attackSpec(kind, aerial);
  p.attack = { ...spec, t: 0, hit: [] };
  p.attackCooldown = spec.duration + 0.08;
  p.state = spec.kind;
  p.stateTimer = spec.duration;
  if (aerial) {
    p.vx += p.facingX * 80;
    p.vy += p.facingY * 80;
  }
}
function hitVictim(room, attacker, victim, atk) {
  if (victim.invuln > 0 || victim.eliminated || victim.respawnTimer > 0) return false;
  if (atk.hit.includes(victim.id)) return false;

  const dir = normalize(victim.x - attacker.x + attacker.facingX * 18, victim.y - attacker.y + attacker.facingY * 18);
  const fx = Math.abs(dir.x) + Math.abs(dir.y) < 0.1 ? attacker.facingX : dir.x;
  const fy = Math.abs(dir.x) + Math.abs(dir.y) < 0.1 ? attacker.facingY : dir.y;
  const map = MAPS[room.mapId];

  if (map.mode === 'ringout') {
    victim.damage = Math.min(999, victim.damage + atk.damage);
    const kb = atk.baseKb + victim.damage * atk.scaleKb * 1.45 + Math.max(0, victim.damage - 100) * 0.9;
    victim.vx += fx * kb;
    victim.vy += fy * kb * 0.84;
    victim.vz = Math.max(victim.vz, 86 + victim.damage * 0.18);
  } else {
    victim.hp = Math.max(0, victim.hp - atk.damage);
    const kb = atk.baseKb * 0.72;
    victim.vx += fx * kb;
    victim.vy += fy * kb * 0.55;
    victim.vz = Math.max(victim.vz, 95);
  }
  victim.hitstun = 0.16 + atk.damage * 0.012;
  victim.state = 'hit';
  victim.stateTimer = 0.28;
  atk.hit.push(victim.id);
  room.events.push({ type:'hit', x:victim.x, y:victim.y, z:victim.z, attack:atk.kind, damage:atk.damage, victim:victim.id });
  return true;
}
function processAttacks(room, p) {
  if (!p.attack) return;
  p.attack.t += DT;
  const atk = p.attack;
  if (atk.t >= atk.activeStart && atk.t <= atk.activeEnd) {
    const f = normalize(p.facingX, p.facingY);
    const cx = p.x + f.x * atk.range * 0.72;
    const cy = p.y + f.y * atk.range * 0.62;
    for (const v of room.players.values()) {
      if (v.id === p.id || v.eliminated || v.respawnTimer > 0) continue;
      const dx = v.x - cx;
      const dy = (v.y - cy) * 1.25;
      const dz = Math.abs(v.z - p.z);
      if (Math.hypot(dx, dy) <= atk.width && dz < (atk.kind === 'airkick' ? 85 : 48)) {
        hitVictim(room, p, v, atk);
      }
    }
  }
  if (atk.t >= atk.duration) p.attack = null;
}
function loseStock(room, p, reason) {
  if (p.eliminated || p.respawnTimer > 0) return;
  p.stocks -= 1;
  room.events.push({ type:'stockLost', playerId:p.id, reason });
  if (p.stocks <= 0) {
    p.eliminated = true;
    p.state = 'ko';
    p.vx = p.vy = p.vz = 0;
  } else {
    p.respawnTimer = 1.4;
    p.x = -9999; p.y = -9999; p.z = 0;
  }
}
function updatePlayer(room, p, index) {
  const map = MAPS[room.mapId];
  if (p.eliminated) return;

  if (p.respawnTimer > 0) {
    p.respawnTimer -= DT;
    if (p.respawnTimer <= 0) resetFighter(p, index, map, false);
    return;
  }

  p.invuln = Math.max(0, p.invuln - DT);
  p.attackCooldown = Math.max(0, p.attackCooldown - DT);
  p.hitstun = Math.max(0, p.hitstun - DT);
  p.stateTimer = Math.max(0, p.stateTimer - DT);

  const input = p.input;
  const justPunch = input.punch && !p.prevInput.punch;
  const justKick = input.kick && !p.prevInput.kick;
  const justJump = input.jump && !p.prevInput.jump;

  if (justJump && p.grounded && p.hitstun <= 0) {
    p.vz = JUMP_VELOCITY;
    p.grounded = false;
    p.state = 'jump'; p.stateTimer = 0.2;
  }
  if (justPunch) beginAttack(p, 'punch');
  if (justKick) beginAttack(p, 'kick');

  if (p.hitstun <= 0) {
    let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const n = normalize(mx, my);
    if (mx || my) {
      const control = p.grounded ? 1 : AIR_CONTROL;
      p.vx += n.x * PLAYER_SPEED * 7.6 * control * DT;
      p.vy += n.y * PLAYER_SPEED * 7.6 * control * DT;
      p.facingX = n.x; p.facingY = n.y;
      if (n.x > 0.1) p.faceDir = 1;
      else if (n.x < -0.1) p.faceDir = -1;
      if (!p.attack && p.grounded) p.state = 'walk';
    } else if (!p.attack && p.grounded && p.stateTimer <= 0) {
      p.state = (map.mode === 'ringout' && p.damage >= 160) || (map.mode === 'hp' && p.hp <= 25) ? 'groggy' : 'idle';
    }
  }

  const planarFriction = p.grounded ? FRICTION : 0.94;
  p.vx *= planarFriction;
  p.vy *= planarFriction;
  const maxPlanar = p.hitstun > 0 ? (map.mode === 'ringout' ? 920 : 520) : 360;
  const speed = Math.hypot(p.vx, p.vy);
  if (speed > maxPlanar) { p.vx = p.vx/speed*maxPlanar; p.vy = p.vy/speed*maxPlanar; }
  p.x += p.vx * DT;
  p.y += p.vy * DT;

  p.vz -= GRAVITY * DT;
  p.z += p.vz * DT;
  const a0 = map.arena;
  const overFloor = map.mode === 'hp' || (p.x >= a0.left && p.x <= a0.right && p.y >= a0.top && p.y <= a0.bottom);
  if (p.z <= 0 && overFloor) { p.z = 0; p.vz = 0; p.grounded = true; }
  else p.grounded = false;

  if (map.mode === 'hp') {
    const a = map.arena;
    if (p.x < a.left + BODY_RADIUS_X) { p.x = a.left + BODY_RADIUS_X; p.vx = Math.abs(p.vx) * 0.2; }
    if (p.x > a.right - BODY_RADIUS_X) { p.x = a.right - BODY_RADIUS_X; p.vx = -Math.abs(p.vx) * 0.2; }
    if (p.y < a.top + BODY_RADIUS_Y) { p.y = a.top + BODY_RADIUS_Y; p.vy = Math.abs(p.vy) * 0.2; }
    if (p.y > a.bottom - BODY_RADIUS_Y) { p.y = a.bottom - BODY_RADIUS_Y; p.vy = -Math.abs(p.vy) * 0.2; }
    if (p.hp <= 0) loseStock(room, p, 'hp');
  } else {
    const b = map.blast;
    if (p.x < b.left || p.x > b.right || p.y < b.top || p.y > b.bottom || p.z < -125) {
      loseStock(room, p, 'ringout');
    }
  }

  processAttacks(room, p);
  p.prevInput = { ...input };
}
function resolveBodies(room) {
  const ps = [...room.players.values()].filter(p => !p.eliminated && p.respawnTimer <= 0);
  for (let i = 0; i < ps.length; i++) for (let j = i+1; j < ps.length; j++) {
    const a = ps[i], b = ps[j];
    if (Math.abs(a.z-b.z) > 65) continue;
    const dx = b.x-a.x, dy = b.y-a.y;
    const d = Math.hypot(dx,dy) || 0.001;
    const minD = 35;
    if (d < minD) {
      const push = (minD-d)/2;
      const nx = dx/d, ny = dy/d;
      a.x -= nx*push; a.y -= ny*push;
      b.x += nx*push; b.y += ny*push;
    }
  }
}
function serializeFighter(p) {
  return {
    id:p.id,name:p.name,character:p.character,
    x:p.x,y:p.y,z:p.z,vx:p.vx,vy:p.vy,vz:p.vz,
    facingX:p.facingX,facingY:p.facingY,faceDir:p.faceDir,state:p.state,
    damage:p.damage,hp:p.hp,stocks:p.stocks,eliminated:p.eliminated,
    respawnTimer:p.respawnTimer,invuln:p.invuln,
    attack:p.attack ? { kind:p.attack.kind,t:p.attack.t,duration:p.attack.duration } : null,
  };
}
function finishIfNeeded(room) {
  const alive = [...room.players.values()].filter(p => !p.eliminated);
  if (room.status === 'playing' && alive.length <= 1 && room.players.size > 1) {
    room.status = 'finished';
    room.winnerId = alive[0]?.id || null;
    if (alive[0]) { alive[0].state = 'victory'; alive[0].stateTimer = 999; }
    io.to(room.code).emit('matchEnded', { winnerId: room.winnerId });
  }
}

io.on('connection', socket => {
  socket.on('createRoom', ({ name, character } = {}, cb = () => {}) => {
    let roomCode = code(); while (rooms.has(roomCode)) roomCode = code();
    const room = { code:roomCode, hostId:socket.id, mapId:'rooftop', status:'lobby', players:new Map(), events:[], countdown:0, matchTime:0, winnerId:null };
    const char = uniqueCharacter(room, character);
    room.players.set(socket.id, makeLobbyPlayer(socket.id, sanitizeName(name), char));
    rooms.set(roomCode, room);
    socket.join(roomCode); socket.data.roomCode = roomCode;
    cb({ ok:true, room:roomPublic(room), you:socket.id });
    io.to(roomCode).emit('lobbyUpdate', roomPublic(room));
  });

  socket.on('joinRoom', ({ roomCode, name, character } = {}, cb = () => {}) => {
    const key = String(roomCode || '').trim().toUpperCase();
    const room = rooms.get(key);
    if (!room) return cb({ ok:false, error:'방을 찾을 수 없어.' });
    if (room.status !== 'lobby') return cb({ ok:false, error:'이미 게임이 시작된 방이야.' });
    if (room.players.size >= 4) return cb({ ok:false, error:'방이 가득 찼어.' });
    const char = uniqueCharacter(room, character);
    room.players.set(socket.id, makeLobbyPlayer(socket.id, sanitizeName(name), char));
    socket.join(key); socket.data.roomCode = key;
    cb({ ok:true, room:roomPublic(room), you:socket.id });
    io.to(key).emit('lobbyUpdate', roomPublic(room));
  });

  socket.on('setCharacter', ({ character } = {}) => {
    const room = rooms.get(socket.data.roomCode); if (!room || room.status !== 'lobby') return;
    const p = room.players.get(socket.id); if (!p || !CHARACTERS[character]) return;
    const taken = [...room.players.values()].some(v => v.id !== socket.id && v.character === character);
    if (!taken) p.character = character;
    io.to(room.code).emit('lobbyUpdate', roomPublic(room));
  });

  socket.on('setReady', ({ ready } = {}) => {
    const room = rooms.get(socket.data.roomCode); if (!room || room.status !== 'lobby') return;
    const p = room.players.get(socket.id); if (!p) return;
    p.ready = !!ready;
    io.to(room.code).emit('lobbyUpdate', roomPublic(room));
  });

  socket.on('setMap', ({ mapId } = {}) => {
    const room = rooms.get(socket.data.roomCode); if (!room || room.status !== 'lobby' || room.hostId !== socket.id) return;
    if (MAPS[mapId]) room.mapId = mapId;
    io.to(room.code).emit('lobbyUpdate', roomPublic(room));
  });

  socket.on('startGame', (_payload, cb = () => {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id || room.status !== 'lobby') return cb({ ok:false, error:'시작할 수 없어.' });
    if (room.players.size < 2) return cb({ ok:false, error:'최소 2명이 필요해.' });
    const othersReady = [...room.players.values()].filter(p => p.id !== room.hostId).every(p => p.ready);
    if (!othersReady) return cb({ ok:false, error:'다른 플레이어가 아직 준비하지 않았어.' });
    startGame(room); cb({ ok:true });
  });

  socket.on('input', input => {
    const room = rooms.get(socket.data.roomCode); if (!room || room.status !== 'playing') return;
    const p = room.players.get(socket.id); if (!p) return;
    p.input = {
      left:!!input.left,right:!!input.right,up:!!input.up,down:!!input.down,
      punch:!!input.punch,kick:!!input.kick,jump:!!input.jump,
    };
  });

  socket.on('backToLobby', () => {
    const room = rooms.get(socket.data.roomCode); if (!room || room.hostId !== socket.id) return;
    room.status = 'lobby'; room.winnerId = null;
    for (const p of room.players.values()) { p.ready = p.id === room.hostId; }
    io.to(room.code).emit('returnedToLobby', roomPublic(room));
    io.to(room.code).emit('lobbyUpdate', roomPublic(room));
  });

  socket.on('disconnect', () => {
    const key = socket.data.roomCode; if (!key) return;
    const room = rooms.get(key); if (!room) return;
    room.players.delete(socket.id);
    if (room.players.size === 0) { rooms.delete(key); return; }
    if (room.hostId === socket.id) room.hostId = room.players.keys().next().value;
    if (room.status === 'playing' || room.status === 'countdown') finishIfNeeded(room);
    io.to(key).emit('lobbyUpdate', roomPublic(room));
  });
});

setInterval(() => {
  for (const room of rooms.values()) {
    room.events = [];
    if (room.status === 'countdown') {
      room.countdown -= DT;
      if (room.countdown <= 0) room.status = 'playing';
    } else if (room.status === 'playing') {
      room.matchTime += DT;
      let i = 0;
      for (const p of room.players.values()) updatePlayer(room, p, i++);
      resolveBodies(room);
      finishIfNeeded(room);
    }
    if (room.status === 'countdown' || room.status === 'playing' || room.status === 'finished') {
      io.to(room.code).emit('state', {
        status:room.status, mapId:room.mapId, mode:MAPS[room.mapId].mode,
        countdown:Math.max(0,room.countdown), matchTime:room.matchTime, winnerId:room.winnerId,
        players:[...room.players.values()].map(serializeFighter), events:room.events,
      });
    }
  }
}, 1000 / TICK_RATE);

server.listen(PORT, '0.0.0.0', () => console.log(`Pet Brawl running on :${PORT}`));
