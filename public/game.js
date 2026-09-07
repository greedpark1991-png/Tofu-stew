const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const menuPanel = document.getElementById('menuPanel');
const gamePanel = document.getElementById('gamePanel');
const characterList = document.getElementById('characterList');
const mapList = document.getElementById('mapList');
const startBtn = document.getElementById('startBtn');
const stockInfo = document.getElementById('stockInfo');
const buffInfo = document.getElementById('buffInfo');
const damageInfo = document.getElementById('damageInfo');

const W = canvas.width;
const H = canvas.height;
const DT = 1000 / 60;

const keys = {};
window.addEventListener('keydown', (e) => {
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (e.code === 'Escape' && running) backToMenu();
});
window.addEventListener('keyup', (e) => keys[e.code] = false);

const characters = [
  { key:'jjigae', name:'찌개', subtitle:'갈색 말티푸 · 둥글고 귀여운 균형형', kind:'dog', body:'#b57d4f', shade:'#895635', belly:'#e9c08f', ear:'#96603c', accent:'#6d442b', small:false },
  { key:'mandu', name:'만두', subtitle:'하얀 푸들 · 복슬복슬하고 순한 느낌', kind:'dog', body:'#f3f1ef', shade:'#d7d2cf', belly:'#fbf8f6', ear:'#ded9d6', accent:'#8f8b89', small:false },
  { key:'gamja', name:'감자', subtitle:'크림 말티푸 · 조금 더 작은 아기 버전', kind:'dog', body:'#efe0b4', shade:'#d4c190', belly:'#fff3d6', ear:'#dcc48d', accent:'#8e7d56', small:true },
  { key:'gucci', name:'구찌', subtitle:'주황+하양 코숏 · 말끔한 고양이', kind:'cat', body:'#ffffff', shade:'#ece8e5', belly:'#ffffff', ear:'#f1a24a', accent:'#d27f2c', patch:'#ef9a39', small:false },
];

const maps = [
  { key:'living', name:'집 거실', desc:'카펫 중앙 난투장', theme:'living', stage:{x:130, y:122, w:700, h:290} },
  { key:'bathroom', name:'집 화장실', desc:'미끄러운 타일 바닥', theme:'bathroom', stage:{x:150, y:126, w:660, h:270} },
  { key:'walkway', name:'아파트 산책로', desc:'울타리 옆 보도', theme:'walkway', stage:{x:120, y:156, w:720, h:250} },
  { key:'soccer', name:'축구 잔디밭', desc:'잔디 라인 위 장외 승부', theme:'soccer', stage:{x:120, y:132, w:720, h:280} },
];

const itemDefs = {
  hammer: { name:'망치', color:'#d88a45', duration:0, uses:3, desc:'3회 강화 타격' },
  invincible: { name:'무적', color:'#75e0ff', duration:5000, desc:'5초 무적' },
  speed: { name:'스피드 약', color:'#9cf073', duration:5000, desc:'5초 동안 1.3배' },
  meat: { name:'고기', color:'#dc5c56', duration:0, desc:'데미지 회복' },
  poop: { name:'똥모양', color:'#8f6438', duration:5000, desc:'5초 좌우 반전' },
};

let selectedChar = characters[0].key;
let selectedMap = maps[0].key;
let running = false;
let game;

function makeAvatar(def) {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  drawSprite(g, def, 16, 23, { facing:1, action:'idle', t:0, scale:2, preview:true });
  return c.toDataURL();
}

function buildMenu() {
  characterList.innerHTML = '';
  mapList.innerHTML = '';
  for (const def of characters) {
    const card = document.createElement('div');
    card.className = 'card' + (selectedChar === def.key ? ' selected' : '');
    card.innerHTML = `<img class="avatar" src="${makeAvatar(def)}" alt="${def.name}"><div><div class="title">${def.name}</div><div class="subtitle">${def.subtitle}</div></div>`;
    card.onclick = () => { selectedChar = def.key; buildMenu(); };
    characterList.appendChild(card);
  }
  for (const map of maps) {
    const card = document.createElement('div');
    card.className = 'card' + (selectedMap === map.key ? ' selected' : '');
    card.innerHTML = `<div><div class="title">${map.name}</div><div class="subtitle">${map.desc}</div></div>`;
    card.onclick = () => { selectedMap = map.key; buildMenu(); };
    mapList.appendChild(card);
  }
}

class Player {
  constructor(slot, def, x, y, bot=false) {
    this.slot = slot;
    this.def = def;
    this.name = def.name;
    this.x = x; this.y = y; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.facing = 1;
    this.baseSpeed = def.small ? 1.8 : 1.65;
    this.speedMul = 1;
    this.width = def.small ? 20 : 22;
    this.depth = def.small ? 12 : 13;
    this.damage = 0;
    this.stocks = 5;
    this.bot = bot;
    this.state = 'idle';
    this.stateTime = 0;
    this.attackType = null;
    this.attackHitDone = false;
    this.hitFlash = 0;
    this.spawnProtected = 600;
    this.hurtLock = 0;
    this.item = null;
    this.itemUses = 0;
    this.effects = { invincible:0, speed:0, reverse:0 };
    this.alive = true;
    this.respawnTimer = 0;
    this.aiCooldown = 700;
    this.aiStrafe = 1;
    this.aiTarget = null;
  }
  get speed() { return this.baseSpeed * this.speedMul * (this.effects.speed > 0 ? 1.3 : 1); }
  get isBusy() { return this.state === 'punch' || this.state === 'kick' || this.state === 'headbutt' || this.state === 'hurt' || this.state === 'down'; }
}

class Game {
  constructor() {
    this.map = maps.find(m => m.key === selectedMap);
    this.players = [];
    const order = [selectedChar, ...characters.filter(c => c.key !== selectedChar).map(c=>c.key)];
    const spawns = [
      [this.map.stage.x + 120, this.map.stage.y + 60],
      [this.map.stage.x + this.map.stage.w - 120, this.map.stage.y + 70],
      [this.map.stage.x + 200, this.map.stage.y + this.map.stage.h - 60],
      [this.map.stage.x + this.map.stage.w - 200, this.map.stage.y + this.map.stage.h - 50],
    ];
    order.forEach((key,i)=> {
      const def = characters.find(c => c.key === key);
      const [x,y] = spawns[i];
      this.players.push(new Player(i, def, x, y, i !== 0));
    });
    this.items = [];
    this.itemDropTimer = 3500;
    this.hitBursts = [];
    this.time = 0;
    this.last = performance.now();
    this.running = true;
  }
}

function startGame() {
  game = new Game();
  running = true;
  menuPanel.classList.add('hidden');
  gamePanel.classList.remove('hidden');
  requestAnimationFrame(loop);
}

function backToMenu() {
  running = false;
  game = null;
  gamePanel.classList.add('hidden');
  menuPanel.classList.remove('hidden');
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(a,b){ return Math.random()*(b-a)+a; }
function choice(arr){ return arr[(Math.random()*arr.length)|0]; }

function respawnPlayer(p) {
  const s = game.map.stage;
  p.x = s.x + rand(140, s.w - 140);
  p.y = s.y + rand(70, s.h - 70);
  p.z = 0; p.vx = p.vy = p.vz = 0;
  p.damage = 0;
  p.state = 'idle'; p.stateTime = 0; p.attackType = null; p.attackHitDone = false;
  p.spawnProtected = 1000;
  p.effects = { invincible:0, speed:0, reverse:0 };
  p.item = null; p.itemUses = 0;
  p.alive = true;
}

function doAttack(p, type) {
  if (!p.alive || p.isBusy || p.z > 8) return;
  p.state = type;
  p.attackType = type;
  p.stateTime = 0;
  p.attackHitDone = false;
  if (type === 'headbutt') p.vx += 3.2 * p.facing;
}

function getAttackData(type) {
  if (type === 'punch') return { start:90, end:180, power:10, range:30, h:18, kb:3.2 };
  if (type === 'kick') return { start:120, end:220, power:14, range:38, h:18, kb:4.1 };
  if (type === 'headbutt') return { start:80, end:180, power:16, range:26, h:20, kb:5.2 };
  return null;
}

function applyItem(p, item) {
  if (item.type === 'hammer') { p.item = 'hammer'; p.itemUses = 3; }
  if (item.type === 'invincible') p.effects.invincible = itemDefs.invincible.duration;
  if (item.type === 'speed') p.effects.speed = itemDefs.speed.duration;
  if (item.type === 'meat') p.damage = Math.max(0, p.damage - 20);
  if (item.type === 'poop') p.effects.reverse = itemDefs.poop.duration;
}

function hitTarget(attacker, target, type) {
  if (!target.alive || target.spawnProtected > 0 || target.effects.invincible > 0) return;
  const data = getAttackData(type);
  let power = data.power;
  let kb = data.kb;
  if (attacker.item === 'hammer' && attacker.itemUses > 0) {
    power += 8; kb += 1.4; attacker.itemUses -= 1;
    if (attacker.itemUses <= 0) attacker.item = null;
  }
  target.damage += power;
  const mag = kb + target.damage * 0.045;
  target.vx = attacker.facing * (mag * 1.2);
  target.vy = ((target.y - attacker.y) || rand(-1,1)) * 0.08 + rand(-0.5,0.5);
  target.vz = 2.2 + target.damage * 0.008;
  target.state = 'hurt';
  target.stateTime = 0;
  target.hurtLock = 240;
  target.hitFlash = 180;
  game.hitBursts.push({x:target.x + attacker.facing*12, y:target.y - target.z - 24, t:250});
}

function checkAttackHit(p) {
  const data = getAttackData(p.attackType);
  if (!data || p.attackHitDone) return;
  if (p.stateTime < data.start || p.stateTime > data.end) return;
  p.attackHitDone = true;
  const reachX = p.x + p.facing * data.range;
  for (const t of game.players) {
    if (t === p || !t.alive) continue;
    if (Math.abs(t.x - reachX) < 26 && Math.abs(t.y - p.y) < data.h) {
      hitTarget(p, t, p.attackType);
    }
  }
}

function updatePlayer(p, dt) {
  if (!p.alive) {
    p.respawnTimer -= dt;
    if (p.respawnTimer <= 0 && p.stocks > 0) respawnPlayer(p);
    return;
  }
  p.stateTime += dt;
  p.hitFlash = Math.max(0, p.hitFlash - dt);
  p.spawnProtected = Math.max(0, p.spawnProtected - dt);
  p.hurtLock = Math.max(0, p.hurtLock - dt);
  p.effects.invincible = Math.max(0, p.effects.invincible - dt);
  p.effects.speed = Math.max(0, p.effects.speed - dt);
  p.effects.reverse = Math.max(0, p.effects.reverse - dt);

  let moveX = 0, moveY = 0;

  if (p.bot) {
    updateBot(p, dt);
    moveX = p.aiMoveX || 0;
    moveY = p.aiMoveY || 0;
  } else if (!p.isBusy && p.hurtLock <= 0) {
    moveX = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
    moveY = (keys['KeyS'] ? 1 : 0) - (keys['KeyW'] ? 1 : 0);
    if (p.effects.reverse > 0) moveX *= -1;
    if (keys['ShiftLeft'] || keys['ShiftRight']) { moveX *= 1.4; moveY *= 1.4; }
    if (keys['Space'] && p.z === 0) { p.vz = 5.7; p.state = 'jump'; p.stateTime = 0; }
    if (keys['KeyJ']) doAttack(p, 'punch');
    else if (keys['KeyK']) doAttack(p, 'kick');
    else if (keys['KeyL']) doAttack(p, 'headbutt');
  }

  if (!p.isBusy && p.hurtLock <= 0) {
    if (moveX !== 0 || moveY !== 0) {
      const len = Math.hypot(moveX, moveY) || 1;
      p.vx += (moveX / len) * p.speed * 0.55;
      p.vy += (moveY / len) * p.speed * 0.55;
      if (moveX !== 0) p.facing = moveX > 0 ? 1 : -1;
      if (p.z === 0) p.state = 'walk';
    } else if (p.z === 0) {
      p.state = 'idle';
    }
  }

  if ((p.state === 'punch' || p.state === 'kick' || p.state === 'headbutt')) {
    checkAttackHit(p);
    const end = p.state === 'punch' ? 260 : 320;
    if (p.stateTime >= end) { p.state = p.z > 0 ? 'jump' : 'idle'; p.stateTime = 0; p.attackType = null; }
  }
  if (p.state === 'hurt' && p.stateTime > 260 && p.z === 0) { p.state = 'idle'; p.stateTime = 0; }
  if (p.state === 'down') {
    if (p.stateTime > 700) { p.state = 'getup'; p.stateTime = 0; }
  } else if (p.state === 'getup') {
    if (p.stateTime > 360) { p.state = 'idle'; p.stateTime = 0; }
  }

  p.vx *= 0.86;
  p.vy *= 0.86;
  p.x += p.vx;
  p.y += p.vy;

  if (p.z > 0 || p.vz > 0) {
    p.vz -= 0.28;
    p.z += p.vz;
    if (p.z <= 0) {
      p.z = 0; p.vz = 0;
      if (p.state === 'jump') { p.state = 'idle'; p.stateTime = 0; }
      if (p.state === 'hurt' && p.damage > 50) { p.state = 'down'; p.stateTime = 0; }
    }
  }

  // stage and ring-out
  const s = game.map.stage;
  const margin = 20;
  if (p.x < s.x - margin || p.x > s.x + s.w + margin || p.y < s.y - margin || p.y > s.y + s.h + margin) {
    p.stocks -= 1;
    p.alive = false;
    p.respawnTimer = 1100;
    p.state = 'down';
    p.stateTime = 0;
    if (p.stocks <= 0) {
      p.stocks = 0;
      p.respawnTimer = 999999;
    }
  }

  // pick item
  for (const item of game.items) {
    if (item.picked) continue;
    if (Math.abs(item.x - p.x) < 16 && Math.abs(item.y - p.y) < 16 && p.z === 0) {
      item.picked = true;
      applyItem(p, item);
    }
  }
}

function updateBot(p, dt) {
  p.aiCooldown -= dt;
  const livingTargets = game.players.filter(t => t !== p && t.alive);
  if (!livingTargets.length) { p.aiMoveX = p.aiMoveY = 0; return; }
  const target = livingTargets.sort((a,b)=>distSq(p,a)-distSq(p,b))[0];
  p.aiTarget = target;
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  p.aiMoveX = Math.abs(dx) > 24 ? Math.sign(dx) : 0;
  p.aiMoveY = Math.abs(dy) > 18 ? Math.sign(dy) : 0;
  p.facing = dx >= 0 ? 1 : -1;
  if (!p.isBusy && p.hurtLock <= 0 && p.aiCooldown <= 0) {
    const close = Math.abs(dx) < 36 && Math.abs(dy) < 18;
    if (close) {
      const roll = Math.random();
      if (roll < 0.45) doAttack(p, 'punch');
      else if (roll < 0.8) doAttack(p, 'kick');
      else doAttack(p, 'headbutt');
      p.aiCooldown = rand(420, 760);
    } else if (Math.random() < 0.004 && p.z === 0) {
      p.vz = 5.7; p.state = 'jump'; p.stateTime = 0;
    }
  }
}
function distSq(a,b){ const dx=a.x-b.x, dy=a.y-b.y; return dx*dx+dy*dy; }

function spawnItem() {
  const types = Object.keys(itemDefs);
  const type = choice(types);
  const s = game.map.stage;
  game.items.push({ type, x: rand(s.x+50, s.x+s.w-50), y: s.y - 20, vy: 1.6, picked:false, t: 0 });
}

function updateItems(dt) {
  game.itemDropTimer -= dt;
  if (game.itemDropTimer <= 0) {
    spawnItem();
    game.itemDropTimer = rand(5000, 7500);
  }
  for (const item of game.items) {
    item.t += dt;
    if (!item.picked && item.y < game.map.stage.y + game.map.stage.h - 18) item.y += item.vy;
  }
  game.items = game.items.filter(i => !i.picked && i.t < 14000);
}

function updateHitBursts(dt) {
  for (const b of game.hitBursts) b.t -= dt;
  game.hitBursts = game.hitBursts.filter(b => b.t > 0);
}

function update(dt) {
  game.time += dt;
  updateItems(dt);
  for (const p of game.players) updatePlayer(p, dt);
  updateHitBursts(dt);

  const human = game.players[0];
  damageInfo.textContent = `${human.name} ${Math.round(human.damage)}%`;
  stockInfo.textContent = `${human.name} ${human.stocks}/5`;
  const buffs = [];
  if (human.item === 'hammer') buffs.push(`망치 ${human.itemUses}회`);
  if (human.effects.invincible > 0) buffs.push(`무적 ${Math.ceil(human.effects.invincible/1000)}초`);
  if (human.effects.speed > 0) buffs.push(`속도UP ${Math.ceil(human.effects.speed/1000)}초`);
  if (human.effects.reverse > 0) buffs.push(`좌우반전 ${Math.ceil(human.effects.reverse/1000)}초`);
  buffInfo.textContent = buffs.length ? buffs.join(' · ') : '효과 없음';
}

function draw() {
  drawMap(ctx, game.map, game.time);

  const shadowOrder = game.players.filter(p => p.alive).sort((a,b)=>a.y-b.y);
  for (const p of shadowOrder) drawShadow(ctx, p);
  for (const item of game.items) drawItem(ctx, item);
  for (const p of shadowOrder) drawPlayer(ctx, p);
  for (const b of game.hitBursts) drawHitBurst(ctx, b);
  drawScoreMini(ctx);
}

function drawMap(ctx, map, t) {
  ctx.clearRect(0,0,W,H);
  if (map.theme === 'living') drawLivingRoom(ctx, map.stage);
  if (map.theme === 'bathroom') drawBathroom(ctx, map.stage);
  if (map.theme === 'walkway') drawWalkway(ctx, map.stage);
  if (map.theme === 'soccer') drawSoccer(ctx, map.stage);
}

function stripeBg(c1,c2) {
  for (let x=0;x<W;x+=48) {
    ctx.fillStyle = (Math.floor(x/48)%2===0?c1:c2);
    ctx.fillRect(x,0,48,H);
  }
}
function outlineRect(x,y,w,h,fill,stroke='#6f4a34') {
  ctx.fillStyle = stroke; ctx.fillRect(x,y,w,h);
  ctx.fillStyle = fill; ctx.fillRect(x+6,y+6,w-12,h-12);
}
function drawStage(stage, floorColor, borderColor, outColor) {
  stripeBg(outColor[0], outColor[1]);
  ctx.fillStyle = floorColor; ctx.fillRect(stage.x, stage.y, stage.w, stage.h);
  ctx.fillStyle = borderColor; ctx.fillRect(stage.x, stage.y, stage.w, 10);
  ctx.fillRect(stage.x, stage.y + stage.h - 10, stage.w, 10);
  ctx.fillRect(stage.x, stage.y, 10, stage.h);
  ctx.fillRect(stage.x + stage.w - 10, stage.y, 10, stage.h);
}
function drawLivingRoom(ctx, stage) {
  drawStage(stage, '#e0c392', '#8b6144', ['#dbcda7','#d2c192']);
  for (let y=stage.y+18; y<stage.y+stage.h-18; y+=44) {
    for (let x=stage.x+18; x<stage.x+stage.w-18; x+=44) {
      ctx.fillStyle = '#d0b27f'; ctx.fillRect(x,y,18,10);
    }
  }
  outlineRect(90, 90, 180, 140, '#6f5137');
  outlineRect(625, 88, 165, 120, '#8d7357');
  outlineRect(86, 248, 170, 124, '#b27058');
  outlineRect(730, 264, 170, 120, '#8c6a4d');
  outlineRect(420, 72, 210, 118, '#a77749');
  ctx.fillStyle = '#4e3425'; ctx.fillRect(470, 110, 110, 48);
  ctx.fillStyle = '#f8cb63'; ctx.fillRect(515, 118, 20, 32);
}
function drawBathroom(ctx, stage) {
  drawStage(stage, '#dce8ef', '#6f97ad', ['#c5d5de','#b9cdda']);
  for (let y=0;y<H;y+=34) for (let x=0;x<W;x+=34) { ctx.strokeStyle='#b7c8d1'; ctx.strokeRect(x,y,34,34); }
  outlineRect(90, 88, 170, 150, '#f8fcff');
  outlineRect(690, 90, 170, 148, '#ecf5fb');
  outlineRect(410, 74, 140, 90, '#e7f1f7');
  outlineRect(92, 360, 150, 96, '#a3c3d4');
}
function drawWalkway(ctx, stage) {
  drawStage(stage, '#bec1bf', '#6d6f72', ['#86add0','#77a0c5']);
  ctx.fillStyle = '#6fb264'; ctx.fillRect(0,0,W,130);
  for(let i=0;i<6;i++){ ctx.fillStyle='#4d7e46'; ctx.fillRect(60+i*160,40,26,90); ctx.beginPath(); }
  ctx.fillStyle = '#8b9c8a'; ctx.fillRect(0, 130, W, 20);
  for (let x=stage.x+22; x<stage.x+stage.w-22; x+=60) { ctx.fillStyle='#d9dbde'; ctx.fillRect(x, stage.y+stage.h/2-6, 34, 12); }
  outlineRect(100, 96, 110, 50, '#8aaab0');
  outlineRect(730, 86, 140, 70, '#7690a3');
}
function drawSoccer(ctx, stage) {
  drawStage(stage, '#61b85c', '#e8f2df', ['#79c76e','#6cbc61']);
  for (let y=stage.y; y<stage.y+stage.h; y+=28) { ctx.fillStyle = (Math.floor((y-stage.y)/28)%2===0) ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.04)'; ctx.fillRect(stage.x, y, stage.w, 14); }
  ctx.strokeStyle = '#eef6e8'; ctx.lineWidth = 4;
  ctx.strokeRect(stage.x+20, stage.y+20, stage.w-40, stage.h-40);
  ctx.beginPath(); ctx.arc(stage.x+stage.w/2, stage.y+stage.h/2, 44, 0, Math.PI*2); ctx.stroke();
  outlineRect(90, 138, 70, 110, '#f7f7f7');
  outlineRect(800, 138, 70, 110, '#f7f7f7');
}

function drawShadow(ctx, p) {
  const alpha = p.alive ? 0.22 : 0;
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y+10, 14, 5, 0, 0, Math.PI*2);
  ctx.fill();
}

function drawPlayer(ctx, p) {
  if (!p.alive) return;
  const y = p.y - p.z;
  const pose = { facing:p.facing, action:p.state, t:p.stateTime, flash:p.hitFlash>0, inv:p.effects.invincible>0, scale:2 };
  drawSprite(ctx, p.def, p.x, y, pose);
  // name label offset to avoid covering face
  ctx.save();
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(30,20,18,.6)';
  ctx.fillStyle = '#fff1ae';
  ctx.strokeText(p.name, p.x, y - 34);
  ctx.fillText(p.name, p.x, y - 34);
  ctx.fillStyle = '#ffffff';
  ctx.strokeText(`${Math.round(p.damage)}%`, p.x, y - 21);
  ctx.fillText(`${Math.round(p.damage)}%`, p.x, y - 21);
  ctx.restore();
}

function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function drawSprite(ctx, def, x, y, pose) {
  const dir = pose.facing || 1;
  const t = pose.t || 0;
  const scale = pose.scale || 2;
  const bob = pose.action === 'walk' ? [0,-1,0,-1][Math.floor(t/120)%4] : pose.action === 'idle' ? Math.sin(t/180) * 0.7 : 0;
  const s = def.small ? 0.92 : 1;

  let lean = 0, armF = 0, armB = 0, legF = 0, legB = 0, headF = 0, crouch = 0, mouth = 0, down = false;
  switch (pose.action) {
    case 'idle': armF = -1; armB = 1; break;
    case 'walk': {
      const k = [0,1,0,-1][Math.floor(t/110)%4];
      legF = 2*k; legB = -2*k; armF = -k; armB = k; break;
    }
    case 'jump': crouch = pose.t < 90 ? 2 : -2; legF = -1; legB = -1; break;
    case 'punch': {
      const p = Math.min(1, t/180);
      lean = 3*p; armF = 8*p; armB = -2*p; mouth = 1; break;
    }
    case 'kick': {
      const p = Math.min(1, t/220);
      lean = 1; legF = 8*p; legB = -3*p; armF = -1; armB = 2; mouth = 1; break;
    }
    case 'headbutt': {
      const p = Math.min(1, t/170);
      lean = 5*p; headF = 4*p; armF = -2*p; armB = -1; mouth = 1; break;
    }
    case 'hurt': lean = -3; mouth = 1; armF = 1; armB = -1; break;
    case 'down': down = true; mouth = 1; break;
    case 'getup': crouch = 3 - Math.min(3, t/100); mouth = 1; break;
  }
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y + bob));
  ctx.scale(dir*scale*s, scale*s);

  const outline = pose.flash ? '#ffffff' : '#2e1d16';
  const body = pose.inv ? '#9de8ff' : def.body;
  const shade = def.shade;
  const belly = def.belly;
  const accent = def.accent;
  const patch = def.patch;

  if (down) {
    // lying sideways
    px(ctx, -8, -8, 16, 8, outline); px(ctx, -7,-7,14,6, body);
    px(ctx, -5,-5, 8,4, belly);
    if (def.kind === 'cat') { px(ctx, 3,-10,4,2, accent); px(ctx, 4,-12,2,2, accent); }
    else { px(ctx, -10,-7,4,7, outline); px(ctx, -9,-6,2,5, def.ear); }
    px(ctx, 7,-5,5,2, outline); px(ctx, 8,-4,3,1, accent);
    px(ctx, -8,0,4,3, outline); px(ctx,-7,1,2,2,body);
    px(ctx, -2,0,4,3, outline); px(ctx,-1,1,2,2,body);
    ctx.restore(); return;
  }

  // rear arm
  drawArm(-7, -4 + armB*0.5, 0, 0, true);
  // rear leg
  drawLeg(-4 + legB*0.2, 10 + Math.max(0,-legB*0.2), legB, true);

  // torso
  px(ctx, -6+lean*0.2, -2+crouch*0.4, 12, 14, outline);
  px(ctx, -5+lean*0.2, -1+crouch*0.4, 10, 12, body);
  px(ctx, -2+lean*0.2, 3+crouch*0.4, 5, 7, belly);

  // tail
  if (def.kind === 'dog') {
    px(ctx, -10+lean*0.2, 2, 4, 7, outline); px(ctx, -9+lean*0.2, 3, 2, 5, accent);
    px(ctx, -12+lean*0.2, 0, 3, 4, outline); px(ctx, -11+lean*0.2, 1, 2, 2, accent);
  } else {
    px(ctx, -10, 0, 3, 8, outline); px(ctx, -9, 1, 2, 6, accent); px(ctx,-8,-1,2,3,accent);
  }

  // head
  px(ctx, -8+lean+headF, -16+crouch*0.3, 16, 14, outline);
  px(ctx, -7+lean+headF, -15+crouch*0.3, 14, 12, body);
  if (def.kind === 'cat') {
    px(ctx, -7+lean+headF, -18, 4, 4, outline); px(ctx, -6+lean+headF, -17, 2, 2, accent);
    px(ctx, 3+lean+headF, -18, 4, 4, outline); px(ctx, 4+lean+headF, -17, 2, 2, accent);
    if (patch) { px(ctx, -7+lean+headF, -15, 5, 7, patch); }
  } else {
    px(ctx, -10+lean+headF, -14, 4, 8, outline); px(ctx, -9+lean+headF, -13, 2, 6, def.ear);
  }
  // face
  px(ctx, 0+lean+headF, -12, 2, 2, '#1a1a1a');
  px(ctx, 3+lean+headF, -11, 2, 2, '#1a1a1a');
  px(ctx, 4+lean+headF, -8, 3, 3, outline); px(ctx, 5+lean+headF, -7, 1, 1, '#1a1a1a');
  if (mouth) { px(ctx, 3+lean+headF, -5, 4, 2, '#b05652'); }

  // front arm & leg after head for clear silhouette
  drawLeg(3 + legF*0.1, 10 + Math.max(0,-legF*0.2), legF, false);
  drawArm(6, -4 + armF*0.5, armF, 1, false);

  if (pose.inv) {
    ctx.globalAlpha = 0.18;
    px(ctx, -9, -18, 20, 32, '#9cecff');
  }

  ctx.restore();

  function drawArm(ax, ay, ext, front, back=false) {
    const bx = ax + lean*0.15;
    const by = ay + crouch*0.4;
    px(ctx, bx, by, 4, 9, outline);
    px(ctx, bx+1, by+1, 2, 7, back?shade:body);
    px(ctx, bx + 2 + ext*0.45, by + 5 + ext*0.05, 5, 4, outline);
    px(ctx, bx + 3 + ext*0.45, by + 6 + ext*0.05, 3, 2, back?shade:body);
  }
  function drawLeg(lx, ly, ext, back=false) {
    px(ctx, lx, ly, 4, 9, outline);
    px(ctx, lx+1, ly+1, 2, 7, back?shade:body);
    px(ctx, lx + ext*0.55, ly + 7 + ext*0.04, 5, 3, outline);
    px(ctx, lx + 1 + ext*0.55, ly + 8 + ext*0.04, 3, 2, belly);
  }
}

function drawItem(ctx, item) {
  const def = itemDefs[item.type];
  const x = item.x, y = item.y;
  ctx.save(); ctx.translate(x,y);
  if (item.type === 'hammer') {
    px(ctx, -3,-8,6,6,'#7f8790'); px(ctx,-1,-2,2,10,'#d49d63');
  } else if (item.type === 'invincible') {
    px(ctx,-5,-5,10,10,'#75e0ff'); px(ctx,-3,-3,6,6,'#d5fbff');
  } else if (item.type === 'speed') {
    px(ctx,-4,-7,8,12,'#9cf073'); px(ctx,-1,-5,2,8,'#7d4d25');
  } else if (item.type === 'meat') {
    px(ctx,-6,-4,12,8,'#cf6658'); px(ctx,4,-2,4,4,'#f4e2ba');
  } else if (item.type === 'poop') {
    px(ctx,-4,-2,8,6,'#865c34'); px(ctx,-2,-6,4,4,'#865c34');
  }
  ctx.restore();
}

function drawHitBurst(ctx, b) {
  ctx.save(); ctx.translate(b.x,b.y); const r = 1 + (250-b.t)/60;
  ctx.fillStyle = '#ffd45e';
  for (let i=0;i<4;i++) px(ctx, Math.cos(i*Math.PI/2)*r*3, Math.sin(i*Math.PI/2)*r*3, 4,4,'#ffd45e');
  ctx.restore();
}

function drawScoreMini(ctx) {
  ctx.save();
  ctx.font = 'bold 13px Arial';
  ctx.textAlign = 'right';
  let y = 44;
  for (const p of game.players) {
    ctx.fillStyle = 'rgba(31,28,27,.78)'; ctx.fillRect(828, y-16, 110, 20);
    ctx.fillStyle = '#fff'; ctx.fillText(`${p.name} ${p.stocks}`, 928, y-2);
    y += 24;
  }
  ctx.restore();
}

function loop(now) {
  if (!running || !game) return;
  const dt = Math.min(32, now - game.last || DT);
  game.last = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

startBtn.onclick = startGame;
buildMenu();
