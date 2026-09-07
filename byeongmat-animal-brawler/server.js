const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let filePath;
  if (urlPath === '/vendor/three.module.js') {
    filePath = path.join(__dirname, 'node_modules', 'three', 'build', 'three.module.js');
  } else {
    const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
    filePath = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!(filePath === PUBLIC_DIR || filePath.startsWith(PUBLIC_DIR + path.sep))) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.png':'image/png', '.svg':'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const io = new Server(server, { cors: { origin: '*' } });
const rooms = new Map();
const TICK_MS = 1000 / 30;
const ARENA_RADIUS = 11;
const FALL_RADIUS = 18;
const GRAVITY = 23;
const SCORE_LIMIT = 5;

const CHARACTERS = {
  cat: { name:'뚱냥이', speed:5.2, jump:8.3, weight:1.35, attack:1.0, color:0xf5b7c8 },
  chick: { name:'대갈병아리', speed:6.5, jump:9.0, weight:0.82, attack:1.18, color:0xffdf66 },
  potato: { name:'감자인간', speed:5.8, jump:8.6, weight:1.0, attack:1.08, color:0xb98b62 }
};

function cleanName(value) {
  const s = String(value || '').trim().replace(/[<>]/g, '');
  return (s || '이름없음').slice(0, 12);
}
function cleanChar(value) { return CHARACTERS[value] ? value : 'cat'; }
function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do { code = Array.from({length:4}, () => chars[Math.floor(Math.random()*chars.length)]).join(''); } while (rooms.has(code));
  return code;
}
function spawnPoint(index) {
  const angle = (index / 4) * Math.PI * 2 + Math.PI / 4;
  return { x: Math.cos(angle) * 4.8, y: 0, z: Math.sin(angle) * 4.8 };
}
function newPlayer(socket, name, char, index) {
  const p = spawnPoint(index);
  return {
    id: socket.id, name: cleanName(name), char: cleanChar(char),
    x:p.x, y:p.y, z:p.z, vx:0, vy:0, vz:0, yaw:0,
    input:{ up:false, down:false, left:false, right:false },
    grounded:true, damage:0, score:0, dead:false, respawnAt:0,
    lastAttacker:null, lastHitAt:0, attackCd:0, dashCd:0, skillCd:0,
    hazardCd:0
  };
}
function roomView(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    state: room.state,
    scoreLimit: SCORE_LIMIT,
    winnerId: room.winnerId || null,
    players: [...room.players.values()].map(p => ({ id:p.id, name:p.name, char:p.char, score:p.score }))
  };
}
function broadcastLobby(room) { io.to(room.code).emit('lobby', roomView(room)); }
function getRoomForSocket(socket) {
  const code = socket.data.roomCode;
  return code ? rooms.get(code) : null;
}
function resetPlayer(p, index) {
  const s = spawnPoint(index);
  p.x=s.x; p.y=0; p.z=s.z; p.vx=0; p.vy=0; p.vz=0; p.damage=0; p.dead=false; p.respawnAt=0;
  p.lastAttacker=null; p.lastHitAt=0; p.grounded=true; p.attackCd=0; p.dashCd=0; p.skillCd=0; p.hazardCd=0;
}
function startRoom(room) {
  room.state = 'playing'; room.winnerId = null; room.startedAt = Date.now(); room.hazardAngle = 0;
  let i=0;
  for (const p of room.players.values()) { p.score=0; resetPlayer(p, i++); }
  io.to(room.code).emit('gameStarted', roomView(room));
}
function endRoom(room, winnerId) {
  room.state = 'ended'; room.winnerId = winnerId;
  io.to(room.code).emit('gameOver', { winnerId, players:[...room.players.values()].map(p=>({id:p.id,name:p.name,score:p.score,char:p.char})) });
  broadcastLobby(room);
}
function normalize(x,z) {
  const d = Math.hypot(x,z) || 1; return {x:x/d,z:z/d,d};
}
function applyHit(room, attacker, victim, baseDamage, baseKnock, dirX, dirZ, lift=4.6, effect='hit') {
  if (!victim || victim.dead) return;
  victim.damage = Math.min(999, victim.damage + baseDamage);
  const char = CHARACTERS[victim.char];
  const scale = (baseKnock + victim.damage * 0.055) / char.weight;
  const n = normalize(dirX, dirZ);
  victim.vx += n.x * scale;
  victim.vz += n.z * scale;
  victim.vy = Math.max(victim.vy, lift / Math.sqrt(char.weight));
  victim.grounded = false;
  if (attacker) { victim.lastAttacker = attacker.id; victim.lastHitAt = Date.now(); }
  io.to(room.code).emit('effect', { type:effect, attackerId:attacker?.id || null, victimId:victim.id, x:victim.x, y:victim.y+1, z:victim.z, damage:victim.damage });
}
function doAttack(room, p, now) {
  if (p.dead || now < p.attackCd) return;
  p.attackCd = now + 520;
  const f = { x:Math.sin(p.yaw), z:-Math.cos(p.yaw) };
  let hit=false;
  for (const v of room.players.values()) {
    if (v.id === p.id || v.dead) continue;
    const dx=v.x-p.x, dz=v.z-p.z, dist=Math.hypot(dx,dz);
    if (dist > 2.45 || Math.abs(v.y-p.y) > 2.1) continue;
    const n=normalize(dx,dz); const dot=n.x*f.x+n.z*f.z;
    if (dot > 0.34) { applyHit(room,p,v,13*CHARACTERS[p.char].attack,5.5*CHARACTERS[p.char].attack,f.x,f.z,4.2); hit=true; }
  }
  io.to(room.code).emit('effect', { type:hit?'swingHit':'swing', attackerId:p.id, x:p.x+f.x, y:p.y+1, z:p.z+f.z });
}
function doSkill(room, p, now) {
  if (p.dead || now < p.skillCd) return;
  if (p.char === 'cat') {
    p.skillCd = now + 6500;
    for (const v of room.players.values()) {
      if (v.id===p.id || v.dead) continue;
      const dx=v.x-p.x, dz=v.z-p.z, d=Math.hypot(dx,dz);
      if (d < 3.4 && Math.abs(v.y-p.y)<2.2) applyHit(room,p,v,12,7.0,dx,dz,6.2,'skill');
    }
    p.vy = 2.5;
  } else if (p.char === 'chick') {
    p.skillCd = now + 5200;
    const f={x:Math.sin(p.yaw),z:-Math.cos(p.yaw)};
    p.vx += f.x*8.5; p.vz += f.z*8.5;
    for (const v of room.players.values()) {
      if (v.id===p.id || v.dead) continue;
      const dx=v.x-p.x, dz=v.z-p.z, d=Math.hypot(dx,dz); const n=normalize(dx,dz);
      if (d<3.2 && n.x*f.x+n.z*f.z>0.45) applyHit(room,p,v,18,8.5,f.x,f.z,5.2,'skill');
    }
  } else {
    p.skillCd = now + 5600;
    p.vy = Math.max(p.vy, 3.4);
    for (const v of room.players.values()) {
      if (v.id===p.id || v.dead) continue;
      const dx=v.x-p.x, dz=v.z-p.z, d=Math.hypot(dx,dz);
      if (d<2.8 && Math.abs(v.y-p.y)<2.3) applyHit(room,p,v,10,8.2,dx,dz,5.5,'skill');
    }
  }
  io.to(room.code).emit('effect', { type:'skillBurst', attackerId:p.id, char:p.char, x:p.x, y:p.y+0.8, z:p.z });
}
function knockOut(room, p, now) {
  if (p.dead) return;
  p.dead = true; p.respawnAt = now + 1600; p.vx=p.vy=p.vz=0;
  let killer=null;
  if (p.lastAttacker && now-p.lastHitAt < 8000) killer = room.players.get(p.lastAttacker);
  if (killer && killer.id !== p.id) {
    killer.score += 1;
    io.to(room.code).emit('ko', { killerId:killer.id, victimId:p.id, score:killer.score });
    if (killer.score >= SCORE_LIMIT) { endRoom(room, killer.id); return; }
  } else {
    io.to(room.code).emit('ko', { killerId:null, victimId:p.id, score:null });
  }
}
function hazardHitTest(room, p, now) {
  if (p.dead || p.y > 1.8 || now < p.hazardCd) return;
  const a=room.hazardAngle;
  const ux=Math.cos(a), uz=Math.sin(a);
  const along=p.x*ux+p.z*uz;
  const perp=Math.abs(-p.x*uz+p.z*ux);
  if (along>0.8 && along<9.0 && perp<0.78) {
    p.hazardCd=now+1050;
    const out=normalize(p.x,p.z);
    applyHit(room,null,p,7,7.3,out.x,out.z,6.8,'hazard');
  }
}
function simulateRoom(room, dt, now) {
  if (room.state !== 'playing') return;
  room.hazardAngle = (room.hazardAngle + dt*0.78) % (Math.PI*2);
  let idx=0;
  for (const p of room.players.values()) {
    if (room.state !== 'playing') break;
    if (p.dead) {
      if (now >= p.respawnAt) resetPlayer(p, idx);
      idx++; continue;
    }
    const c=CHARACTERS[p.char];
    const forward={x:Math.sin(p.yaw),z:-Math.cos(p.yaw)};
    const right={x:Math.cos(p.yaw),z:Math.sin(p.yaw)};
    let mx=(p.input.right?1:0)-(p.input.left?1:0);
    let mz=(p.input.up?1:0)-(p.input.down?1:0);
    let dx=right.x*mx+forward.x*mz, dz=right.z*mx+forward.z*mz;
    const mag=Math.hypot(dx,dz);
    if (mag>0) { dx/=mag; dz/=mag; }
    const control = p.grounded ? 0.24 : 0.07;
    const targetX=dx*c.speed, targetZ=dz*c.speed;
    p.vx += (targetX-p.vx)*control;
    p.vz += (targetZ-p.vz)*control;
    if (mag===0 && p.grounded) { p.vx*=0.82; p.vz*=0.82; }
    p.vy -= GRAVITY*dt;
    p.x += p.vx*dt; p.y += p.vy*dt; p.z += p.vz*dt;
    const r=Math.hypot(p.x,p.z);
    if (r <= ARENA_RADIUS-0.15 && p.y <= 0) { p.y=0; p.vy=0; p.grounded=true; }
    else if (p.y > 0.03 || r > ARENA_RADIUS) p.grounded=false;
    hazardHitTest(room,p,now);
    if (p.y < -8 || r > FALL_RADIUS) { knockOut(room,p,now); idx++; continue; }
    idx++;
  }
}
function emitStates() {
  const now=Date.now();
  for (const room of rooms.values()) {
    if (room.state!=='playing') continue;
    io.to(room.code).emit('state', {
      t:now, hazardAngle:room.hazardAngle, scoreLimit:SCORE_LIMIT,
      players:[...room.players.values()].map(p=>({
        id:p.id,name:p.name,char:p.char,x:p.x,y:p.y,z:p.z,vx:p.vx,vy:p.vy,vz:p.vz,yaw:p.yaw,
        damage:Math.round(p.damage),score:p.score,dead:p.dead,
        attackReady:Math.max(0,p.attackCd-now),dashReady:Math.max(0,p.dashCd-now),skillReady:Math.max(0,p.skillCd-now)
      }))
    });
  }
}

io.on('connection', socket => {
  socket.on('createRoom', ({name,char}={}, cb=()=>{}) => {
    if (socket.data.roomCode) return cb({ok:false,error:'이미 방에 들어가 있습니다.'});
    const code=makeCode();
    const room={code,hostId:socket.id,state:'lobby',winnerId:null,players:new Map(),hazardAngle:0};
    const p=newPlayer(socket,name,char,0); room.players.set(socket.id,p); rooms.set(code,room);
    socket.join(code); socket.data.roomCode=code; cb({ok:true,code,selfId:socket.id}); broadcastLobby(room);
  });
  socket.on('joinRoom', ({code,name,char}={}, cb=()=>{}) => {
    code=String(code||'').toUpperCase().trim(); const room=rooms.get(code);
    if (!room) return cb({ok:false,error:'방을 찾을 수 없습니다.'});
    if (room.state==='playing') return cb({ok:false,error:'이미 게임이 시작된 방입니다.'});
    if (room.players.size>=4) return cb({ok:false,error:'방이 가득 찼습니다.'});
    if (socket.data.roomCode) return cb({ok:false,error:'이미 다른 방에 들어가 있습니다.'});
    const p=newPlayer(socket,name,char,room.players.size); room.players.set(socket.id,p);
    socket.join(code); socket.data.roomCode=code; cb({ok:true,code,selfId:socket.id}); broadcastLobby(room);
  });
  socket.on('changeCharacter', ({char}={}) => {
    const room=getRoomForSocket(socket); if (!room || room.state==='playing') return;
    const p=room.players.get(socket.id); if (!p) return; p.char=cleanChar(char); broadcastLobby(room);
  });
  socket.on('startGame', () => {
    const room=getRoomForSocket(socket); if (!room || room.hostId!==socket.id) return;
    if (room.players.size<2) { socket.emit('notice','온라인 대전은 최소 2명이 필요합니다.'); return; }
    startRoom(room);
  });
  socket.on('input', input => {
    const room=getRoomForSocket(socket); if (!room || room.state!=='playing') return;
    const p=room.players.get(socket.id); if (!p || p.dead) return;
    p.input.up=!!input.up; p.input.down=!!input.down; p.input.left=!!input.left; p.input.right=!!input.right;
    const y=Number(input.yaw); if (Number.isFinite(y)) p.yaw=y;
  });
  socket.on('action', ({type,yaw}={}) => {
    const room=getRoomForSocket(socket); if (!room || room.state!=='playing') return;
    const p=room.players.get(socket.id); if (!p || p.dead) return;
    if (Number.isFinite(Number(yaw))) p.yaw=Number(yaw);
    const now=Date.now(); const c=CHARACTERS[p.char];
    if (type==='jump' && p.grounded) { p.vy=c.jump; p.grounded=false; }
    if (type==='dash' && now>=p.dashCd) {
      p.dashCd=now+1800; const f={x:Math.sin(p.yaw),z:-Math.cos(p.yaw)}; p.vx+=f.x*7.2; p.vz+=f.z*7.2; p.vy=Math.max(p.vy,1.3);
      io.to(room.code).emit('effect',{type:'dash',attackerId:p.id,x:p.x,y:p.y+0.6,z:p.z});
    }
    if (type==='attack') doAttack(room,p,now);
    if (type==='skill') doSkill(room,p,now);
  });
  socket.on('leaveRoom', () => socket.disconnect(true));
  socket.on('disconnect', () => {
    const code=socket.data.roomCode; const room=code?rooms.get(code):null; if (!room) return;
    room.players.delete(socket.id);
    if (room.players.size===0) { rooms.delete(code); return; }
    if (room.hostId===socket.id) room.hostId=room.players.keys().next().value;
    if (room.state==='playing' && room.players.size<2) { room.state='lobby'; room.winnerId=null; }
    broadcastLobby(room);
  });
});

setInterval(() => {
  const now=Date.now(), dt=TICK_MS/1000;
  for (const room of rooms.values()) simulateRoom(room,dt,now);
}, TICK_MS);
setInterval(emitStates, 50);

server.listen(PORT, '0.0.0.0', () => console.log(`병맛 동물 격투게임 서버 실행 중 (port ${PORT})`));
