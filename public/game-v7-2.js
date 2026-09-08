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
const botCountLabel = document.getElementById('botCountLabel');
const botButtons = document.getElementById('botButtons');
const stockCountLabel = document.getElementById('stockCountLabel');
const stockButtons = document.getElementById('stockButtons');
const resultOverlay = document.getElementById('resultOverlay');
const resultTitle = document.getElementById('resultTitle');
const resultStats = document.getElementById('resultStats');
const winnerImage = document.getElementById('winnerImage');
const replayBtn = document.getElementById('replayBtn');
const selectBtn = document.getElementById('selectBtn');
const menuBtn = document.getElementById('menuBtn');
const finalKoBanner = document.getElementById('finalKoBanner');
const bgmVolumeEl = document.getElementById('bgmVolume');
const bgmVolumeValueEl = document.getElementById('bgmVolumeValue');
const sfxVolumeEl = document.getElementById('sfxVolume');
const sfxVolumeValueEl = document.getElementById('sfxVolumeValue');
const musicStateEl = document.getElementById('musicState');

const W = canvas.width;
const H = canvas.height;
const pressed = new Set();
const keys = {};

window.addEventListener('keydown', (e) => {
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  if (!keys[e.code]) pressed.add(e.code);
  keys[e.code] = true;
  if (e.code === 'Escape' && running) backToMenu();
});
window.addEventListener('keyup', (e) => keys[e.code] = false);

const characters = [
  {
    key:'jjigae', name:'찌개', subtitle:'갈색 말티푸 · 큰 처진 귀와 복슬한 얼굴', kind:'dog', breed:'maltipoo',
    fur:'#b77a49', fur2:'#d39a63', light:'#efd0a0', ear:'#9b633c', outline:'#38231b', eye:'#191614', small:false, trait:{name:'튼튼한 말티푸', kickKb:1.07, incomingKb:1, speed:1, airControl:1, landingLag:1}
  },
  {
    key:'mandu', name:'만두', subtitle:'하얀 푸들 · 구름처럼 몽실한 푸들', kind:'dog', breed:'poodle',
    fur:'#f4f1ed', fur2:'#ffffff', light:'#fffdfa', ear:'#ddd8d2', outline:'#393632', eye:'#171717', small:false, trait:{name:'복슬복슬 쿠션', kickKb:1, incomingKb:0.94, speed:1, airControl:1, landingLag:1}
  },
  {
    key:'gamja', name:'감자', subtitle:'크림 말티푸 · 짧은 팔다리의 아기 버전', kind:'dog', breed:'puppy',
    fur:'#ead9a8', fur2:'#f7e9c2', light:'#fff3d3', ear:'#d2bb84', outline:'#403728', eye:'#171614', small:true, trait:{name:'아기 우다다', kickKb:1, incomingKb:1.05, speed:1.06, airControl:1, landingLag:1}
  },
  {
    key:'gucci', name:'구찌', subtitle:'주황+하양 코숏 · 삼각 귀와 긴 줄무늬 꼬리', kind:'cat', breed:'cat',
    fur:'#f6f3ef', fur2:'#ffffff', light:'#ffffff', ear:'#f0a047', patch:'#e88e31', outline:'#38271e', eye:'#77b8d0', small:false, trait:{name:'고양이 착지', kickKb:1, incomingKb:1, speed:1, airControl:1.12, landingLag:0.65}
  },
];

const spriteActions = ['idle','punch','kick','jump','jumpkick'];
const spriteBank = {};
for (const def of characters) {
  spriteBank[def.key] = {};
  for (const action of spriteActions) {
    const img = new Image();
    img.src = `assets/sprites/original_v5/${def.key}_${action}.png?v=7.2.0`;
    spriteBank[def.key][action] = img;
  }
}

const maps = [
  { key:'rooftop', name:'옥상 링', desc:'야경 옥상 · 사방 장외 · 가끔 부는 강풍', theme:'rooftop', stage:{x:115, y:108, w:730, h:352} },
  { key:'dojo', name:'멍냥 도장', desc:'목재 도장 · 사방 장외 · 중앙 광택 마루', theme:'dojo', stage:{x:92, y:126, w:776, h:320} },
];

const items = {
  hammer: { name:'망치', duration:0, desc:'강화 공격 3회' },
  invincible: { name:'무적', duration:3800, desc:'3.8초 무적' },
  speed: { name:'스피드약', duration:5000, desc:'5초 1.3배 속도' },
  meat: { name:'고기', duration:0, desc:'데미지 25% 회복' },
  poop: { name:'똥모양', duration:5000, desc:'5초 좌우 반전' },
};

let selectedChar = 'jjigae';
let selectedMap = 'rooftop';
let selectedBots = 0;
let selectedStocks = 3;
let running = false;
let game = null;

function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function rand(a,b){ return a + Math.random()*(b-a); }
function choice(arr){ return arr[(Math.random()*arr.length)|0]; }
function dist(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); }

function makeAvatar(def) {
  return `assets/sprites/original_v5/${def.key}_idle.png?v=7.2.0`;
}

function buildMenu() {
  characterList.innerHTML = '';
  mapList.innerHTML = '';
  characters.forEach(def => {
    const card = document.createElement('div');
    card.className = 'card' + (def.key === selectedChar ? ' selected' : '');
    card.innerHTML = `<img class="avatar" src="${makeAvatar(def)}"><div><div class="title">${def.name}</div><div class="subtitle">${def.subtitle}</div><div class="trait">특성 · ${def.trait.name}</div></div>`;
    card.onclick = () => { selectedChar = def.key; buildMenu(); };
    characterList.appendChild(card);
  });
  maps.forEach(map => {
    const card = document.createElement('div');
    card.className = 'card' + (map.key === selectedMap ? ' selected' : '');
    card.innerHTML = `<div><div class="title">${map.name}</div><div class="subtitle">${map.desc}</div></div>`;
    card.onclick = () => { selectedMap = map.key; buildMenu(); };
    mapList.appendChild(card);
  });
}

botButtons.addEventListener('click', (e) => {
  if (!e.target.matches('button[data-bots]')) return;
  selectedBots = Number(e.target.dataset.bots);
  [...botButtons.querySelectorAll('button')].forEach(b => b.classList.toggle('selected', Number(b.dataset.bots) === selectedBots));
  botCountLabel.textContent = `${selectedBots}마리`;
});

stockButtons.addEventListener('click', (e) => {
  if (!e.target.matches('button[data-stocks]')) return;
  selectedStocks = Number(e.target.dataset.stocks);
  [...stockButtons.querySelectorAll('button')].forEach(b => b.classList.toggle('selected', Number(b.dataset.stocks) === selectedStocks));
  stockCountLabel.textContent = `${selectedStocks} Stock`;
});

const BOT_PERSONALITIES = ['aggressive','coward','item','jumper'];
let audioCtx = null;
let audioReady = false;
let currentBgm = null;
let sfxVolume = clamp(Number(localStorage.getItem('petBrawlSfxVolume') ?? 0.72),0,1);
const savedBgmVolume = clamp(Number(localStorage.getItem('petBrawlBgmVolume') ?? 0.18),0,1);
const bgm = {
  lobby: new Audio('/audio/Cold_Bell_Impact.mp3'),
  game: new Audio('/audio/The_Rooftop_Bout.mp3'),
};
Object.values(bgm).forEach(a=>{ a.loop=true; a.preload='auto'; a.volume=savedBgmVolume; });

function updateAudioLabels(){
  if(bgmVolumeValueEl) bgmVolumeValueEl.textContent=`${Math.round((bgm.lobby?.volume ?? savedBgmVolume)*100)}%`;
  if(sfxVolumeValueEl) sfxVolumeValueEl.textContent=`${Math.round(sfxVolume*100)}%`;
  if(musicStateEl) musicStateEl.textContent=running?'전투 BGM':'오프닝 BGM';
}
if(bgmVolumeEl){
  bgmVolumeEl.value=String(Math.round(savedBgmVolume*100));
  bgmVolumeEl.addEventListener('input',()=>{
    const v=clamp(Number(bgmVolumeEl.value)/100,0,1);
    Object.values(bgm).forEach(a=>a.volume=v);
    localStorage.setItem('petBrawlBgmVolume',String(v));
    updateAudioLabels();
  });
}
if(sfxVolumeEl){
  sfxVolumeEl.value=String(Math.round(sfxVolume*100));
  sfxVolumeEl.addEventListener('input',()=>{
    sfxVolume=clamp(Number(sfxVolumeEl.value)/100,0,1);
    localStorage.setItem('petBrawlSfxVolume',String(sfxVolume));
    updateAudioLabels();
  });
}
function ensureAudio(){
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (_) {}
  audioReady=true;
}
function playBgm(which,restart=false){
  ensureAudio();
  const next=bgm[which];
  if(!next) return;
  if(currentBgm===next && !restart){ next.play().catch(()=>{}); updateAudioLabels(); return; }
  Object.values(bgm).forEach(a=>{ if(a!==next){ a.pause(); a.currentTime=0; } });
  if(restart) next.currentTime=0;
  next.play().catch(()=>{});
  currentBgm=next;
  updateAudioLabels();
}
function syncBgm(){ playBgm(running?'game':'lobby'); }
function tone(freq=220,duration=.06,type='square',gain=.035){
  if(!audioCtx || sfxVolume<=0) return;
  try{
    const o=audioCtx.createOscillator(), g=audioCtx.createGain();
    o.type=type; o.frequency.value=freq; g.gain.value=Math.max(.0001,gain*sfxVolume);
    o.connect(g); g.connect(audioCtx.destination);
    const now=audioCtx.currentTime; o.start(now); g.gain.exponentialRampToValueAtTime(.0001,now+duration); o.stop(now+duration);
  }catch(_){}
}
// Browser autoplay policy: first click/key unlocks the original menu BGM.
function unlockAudioOnce(){ ensureAudio(); syncBgm(); }
window.addEventListener('pointerdown', unlockAudioOnce, {once:true});
updateAudioLabels();

class Fighter {
  constructor(def, x, y, bot=false, slot=0) {
    this.def = def;
    this.name = def.name;
    this.x = x; this.y = y; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.facing = slot % 2 === 0 ? 1 : -1;
    this.bot = bot;
    this.slot = slot;
    this.damage = 0;
    this.stocks = selectedStocks;
    this.state = 'idle';
    this.stateTime = 0;
    this.attack = null;
    this.attackHit = false;
    this.attackConnected = false;
    this.alive = true;
    this.respawn = 0;
    this.hurtLock = 0;
    this.getupShield = 0;
    this.landingLag = 0;
    this.spawnShield = 850;
    this.flash = 0;
    this.item = null;
    this.itemUses = 0;
    this.effects = { invincible:0, speed:0, reverse:0 };
    this.aiCooldown = rand(350,700);
    this.aiMoveX = 0;
    this.aiMoveY = 0;
    this.personality = bot ? choice(BOT_PERSONALITIES) : 'human';
    this.baseSpeed = 2.0;
    this.lastAttacker = null;
    this.lastHitAt = -99999;
    this.lastHitType = null;
    this.trailTimer = 0;
    this.stats = {
      ringOuts:0, deaths:0, hits:0, punchHits:0, kickHits:0, jumpkickHits:0,
      itemPickups:0, maxDamage:0, suicides:0, damageDealt:0, jumpkickOuts:0
    };
  }
  get speed(){ return this.baseSpeed * this.def.trait.speed * (this.effects.speed > 0 ? 1.3 : 1); }
  get attacking(){ return ['punch','kick','jumpkick','dashpunch','dashkick','airpunch'].includes(this.state); }
  get locked(){ return this.attacking || ['hurt','down','getup'].includes(this.state) || this.landingLag>0; }
}

class Game {
  constructor() {
    this.map = maps.find(m=>m.key===selectedMap);
    this.fighters = [];
    this.drops = [];
    this.bursts = [];
    this.particles = [];
    this.itemTimer = 3200;
    this.last = performance.now();
    this.time = 0;
    this.hitstop = 0;
    this.shake = 0;
    this.slowMoTimer = 0;
    this.slowMoScale = 1;
    this.ended = false;
    this.resultShown = false;
    this.endTimer = 0;
    this.winner = null;
    this.finalFlash = 0;
    this.mapState = createMapState(this.map);

    const defs = [characters.find(c=>c.key===selectedChar), ...characters.filter(c=>c.key!==selectedChar)].slice(0, selectedBots+1);
    const s = this.map.stage;
    const spawnPts = [
      [s.x+s.w*0.35, s.y+s.h*0.35],
      [s.x+s.w*0.65, s.y+s.h*0.35],
      [s.x+s.w*0.38, s.y+s.h*0.70],
      [s.x+s.w*0.62, s.y+s.h*0.70],
    ];
    defs.forEach((def,i)=>this.fighters.push(new Fighter(def, spawnPts[i][0], spawnPts[i][1], i>0, i)));
  }
}

function createMapState(map){
  if(map.key==='rooftop') return {wind:{phase:'wait',timer:rand(6200,8800),dir:1,activeTimer:0}};
  if(map.key==='dojo') return {slick:{x:map.stage.x+map.stage.w*.38,y:map.stage.y+map.stage.h*.33,w:map.stage.w*.24,h:map.stage.h*.36}};
  return {};
}

function startGame(){
  ensureAudio();
  game = new Game();
  running = true;
  resultOverlay.classList.add('hidden');
  finalKoBanner.classList.add('hidden');
  menuPanel.classList.add('hidden');
  gamePanel.classList.remove('hidden');
  playBgm('game',true);
  requestAnimationFrame(loop);
}
function backToMenu(){
  running = false; game = null;
  resultOverlay.classList.add('hidden');
  finalKoBanner.classList.add('hidden');
  gamePanel.classList.add('hidden');
  menuPanel.classList.remove('hidden');
  pressed.clear();
  playBgm('lobby',true);
}
function replayGame(){
  running = false;
  resultOverlay.classList.add('hidden');
  finalKoBanner.classList.add('hidden');
  game = new Game();
  running = true;
  playBgm('game',true);
}
startBtn.onclick = startGame;
replayBtn.onclick = replayGame;
selectBtn.onclick = backToMenu;
menuBtn.onclick = backToMenu;

function attackData(type){
  if(type==='punch') return {start:70,end:150,duration:220,range:32,depth:18,damage:9,kb:2.9,hitstop:42,shake:1.2,group:'punch'};
  if(type==='kick') return {start:115,end:220,duration:350,range:45,depth:20,damage:14,kb:4.4,hitstop:64,shake:2.4,group:'kick'};
  if(type==='jumpkick') return {start:55,end:210,duration:300,range:43,depth:21,damage:16,kb:4.9,hitstop:82,shake:3.4,group:'jumpkick'};
  if(type==='dashpunch') return {start:55,end:145,duration:270,range:40,depth:19,damage:11,kb:3.55,hitstop:50,shake:1.8,group:'punch'};
  if(type==='dashkick') return {start:95,end:205,duration:390,range:50,depth:21,damage:15,kb:4.7,hitstop:70,shake:2.9,group:'kick'};
  if(type==='airpunch') return {start:40,end:130,duration:215,range:30,depth:19,damage:8,kb:2.6,hitstop:38,shake:1.0,group:'punch'};
  return null;
}

function beginAttack(f,type){
  if(!f.alive || f.attacking || ['hurt','down','getup'].includes(f.state) || f.landingLag>0) return;
  f.state = type;
  f.stateTime = 0;
  f.attack = type;
  f.attackHit = false;
  f.attackConnected = false;
  if(type==='jumpkick'||type==='airpunch'){ f.airAttackWas=type; f.airAttackConnected=false; }
  if(type==='dashpunch') f.vx += f.facing*2.5;
  if(type==='dashkick') f.vx += f.facing*3.5;
}

function likelyRingOut(target){
  const s=game.map.stage, out=18;
  const projX=target.x + target.vx*7.0;
  const projY=target.y + target.vy*7.0;
  return projX<s.x-out || projX>s.x+s.w+out || projY<s.y-out || projY>s.y+s.h+out;
}

function addImpactParticles(x,y,power,type){
  const n=type==='jumpkick'?10:(type==='kick'||type==='dashkick'?8:6);
  for(let i=0;i<n;i++){
    const a=(Math.PI*2*i/n)+rand(-.22,.22);
    const sp=rand(1.3,2.8)+power*.08;
    game.particles.push({kind:i%3===0?'star':'spark',x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,t:rand(180,320),max:320,size:i%3===0?5:3});
  }
  for(let i=0;i<3;i++) game.particles.push({kind:'dust',x:x+rand(-8,8),y:y+rand(-2,8),vx:rand(-.5,.5),vy:rand(-1.2,-.4),t:260,max:260,size:rand(5,8)});
}

function hit(attacker,target,type){
  if(!target.alive || target.spawnShield>0 || target.getupShield>0 || target.effects.invincible>0) return;
  const d = attackData(type);
  let dmg=d.damage, kb=d.kb;
  if(attacker.item==='hammer' && attacker.itemUses>0){
    dmg += 9; kb += 1.5; attacker.itemUses--;
    if(attacker.itemUses<=0) attacker.item=null;
  }
  if(['kick','dashkick','jumpkick'].includes(type)) kb *= attacker.def.trait.kickKb;

  target.damage += dmg;
  target.stats.maxDamage=Math.max(target.stats.maxDamage,target.damage);
  const force = (kb + target.damage * 0.052) * target.def.trait.incomingKb;
  target.vx = attacker.facing * force * 1.2;
  target.vy = Math.sign(target.y-attacker.y || (Math.random()-.5)) * Math.min(2.8, 0.7 + Math.abs(target.y-attacker.y)*0.025);
  target.vz = 2.45 + target.damage*0.011;
  target.state='hurt'; target.stateTime=0; target.hurtLock=230; target.flash=140;
  target.lastAttacker=attacker; target.lastHitAt=game.time; target.lastHitType=type;
  attacker.attackConnected=true;
  if(type==='jumpkick'||type==='airpunch') attacker.airAttackConnected=true;
  attacker.stats.hits++;
  attacker.stats.damageDealt += dmg;
  if(d.group==='punch') attacker.stats.punchHits++;
  if(d.group==='kick') attacker.stats.kickHits++;
  if(d.group==='jumpkick') attacker.stats.jumpkickHits++;

  const hitX=target.x + attacker.facing*12, hitY=target.y-target.z-24;
  game.bursts.push({x:hitX,y:hitY,t:240,type:d.group});
  addImpactParticles(hitX,hitY,force,type);

  let hs=d.hitstop + Math.min(18,target.damage*.06);
  let shake=d.shake + Math.min(1.8,target.damage*.008);
  const lethal = target.stocks===1 && target.damage>=55 && likelyRingOut(target);
  if(lethal){
    hs=Math.max(hs,100); shake=Math.max(shake,5.2);
    game.slowMoTimer=Math.max(game.slowMoTimer,650);
    game.slowMoScale=.42;
    game.finalFlash=220;
    tone(92,.12,'sawtooth',.055);
  }else{
    const freq=d.group==='punch'?245:(d.group==='kick'?165:125);
    tone(freq,.045,d.group==='punch'?'square':'sawtooth',.025);
  }
  game.hitstop=Math.max(game.hitstop,hs);
  game.shake=Math.max(game.shake,shake);
}

function hitBallFromAttack(f){
  // v7.2 restores the original two-stage set. Kept as a no-op so attack flow stays stable.
}

function resolveAttack(f){
  const d=attackData(f.attack);
  if(!d || f.attackHit || f.stateTime<d.start || f.stateTime>d.end) return;
  f.attackHit=true;
  for(const t of game.fighters){
    if(t===f || !t.alive) continue;
    const dx=(t.x-f.x)*f.facing;
    if(dx>4 && dx<d.range && Math.abs(t.y-f.y)<d.depth && Math.abs(t.z-f.z)<25){ hit(f,t,f.attack); }
  }
  hitBallFromAttack(f);
}

function isSlippery(f){
  if(!game || game.map.key!=='dojo') return false;
  const p=game.mapState.slick;
  return !!p && f.x>p.x&&f.x<p.x+p.w&&f.y>p.y&&f.y<p.y+p.h;
}

function updateHuman(f){
  if(f.locked && !f.attacking) return;
  let mx=(keys['KeyD']?1:0)-(keys['KeyA']?1:0);
  let my=(keys['KeyS']?1:0)-(keys['KeyW']?1:0);
  if(f.effects.reverse>0) mx*=-1;
  const dashHeld=(keys['ShiftLeft']||keys['ShiftRight']);
  const dash=dashHeld?1.35:1;
  if(!f.locked || f.state==='jump'){
    if(mx||my){
      const l=Math.hypot(mx,my)||1;
      const air=f.z>0?f.def.trait.airControl:1;
      const slip=isSlippery(f)?0.72:1;
      f.vx += (mx/l)*f.speed*0.65*dash*air*slip;
      f.vy += (my/l)*f.speed*0.65*dash*air*slip;
      if(mx) f.facing=mx>0?1:-1;
      if(f.z===0 && !f.attacking) f.state='walk';
    } else if(f.z===0 && !f.attacking) f.state='idle';
  }
  if(pressed.has('Space') && f.z===0 && !f.locked){ f.vz=6.1; f.state='jump'; f.stateTime=0; }
  if(pressed.has('KeyJ')){
    if(f.z>0) beginAttack(f,'airpunch');
    else if(dashHeld) beginAttack(f,'dashpunch');
    else beginAttack(f,'punch');
  }
  if(pressed.has('KeyK')){
    if(f.z>0) beginAttack(f,'jumpkick');
    else if(dashHeld) beginAttack(f,'dashkick');
    else beginAttack(f,'kick');
  }
}

function nearestUsefulDrop(f,types=null){
  const ds=game.drops.filter(d=>!d.picked && (d.landed||d.warning) && (!types||types.includes(d.type)));
  if(!ds.length) return null;
  ds.sort((a,b)=>Math.hypot(a.x-f.x,a.targetY-f.y)-Math.hypot(b.x-f.x,b.targetY-f.y));
  return ds[0];
}

function updateBot(f,dt){
  if(f.locked && !f.attacking){ f.aiMoveX=f.aiMoveY=0; return; }
  const targets=game.fighters.filter(t=>t!==f&&t.alive);
  if(!targets.length){ f.aiMoveX=f.aiMoveY=0; return; }
  targets.sort((a,b)=>dist(f,a)-dist(f,b));
  let t=targets[0];
  let goalX=t.x,goalY=t.y;
  const s=game.map.stage;

  if(f.personality==='item'){
    const d=nearestUsefulDrop(f);
    if(d){goalX=d.x;goalY=d.targetY;}
  }
  if(f.personality==='coward' && f.damage>65){
    const d=nearestUsefulDrop(f,['meat','invincible']);
    if(d){goalX=d.x;goalY=d.targetY;}
    else {goalX=s.x+s.w/2;goalY=s.y+s.h/2;}
  }

  const dx=goalX-f.x,dy=goalY-f.y;
  if(goalX===t.x) f.facing=(t.x-f.x)>=0?1:-1;
  if(!f.locked){
    const threshold=f.personality==='aggressive'?23:27;
    const mx=Math.abs(dx)>threshold?Math.sign(dx):0;
    const my=Math.abs(dy)>15?Math.sign(dy):0;
    const l=Math.hypot(mx,my)||1;
    const air=f.z>0?f.def.trait.airControl:1;
    const slip=isSlippery(f)?0.72:1;
    if(mx||my){ f.vx+=(mx/l)*f.speed*0.48*air*slip; f.vy+=(my/l)*f.speed*0.48*air*slip; if(f.z===0)f.state='walk'; }
    else if(f.z===0)f.state='idle';
  }

  f.aiCooldown-=dt;
  const tx=t.x-f.x,ty=t.y-f.y;
  if(f.aiCooldown<=0 && !f.locked){
    const close=Math.abs(tx)<48 && Math.abs(ty)<22;
    if(f.personality==='jumper' && f.z===0 && Math.random()<.58){
      f.vz=6.0; f.state='jump'; f.stateTime=0; f.aiCooldown=rand(280,480);
    }else if(close){
      if(f.z>0) beginAttack(f, f.personality==='jumper'||Math.random()<.68?'jumpkick':'airpunch');
      else if(f.personality==='aggressive') beginAttack(f,Math.random()<.62?'kick':'punch');
      else beginAttack(f,Math.random()<.52?'punch':'kick');
      f.aiCooldown=f.personality==='aggressive'?rand(400,650):rand(470,860);
    }else if(Math.random()<(f.personality==='jumper'?0.32:0.12) && f.z===0){
      f.vz=6.0; f.state='jump'; f.stateTime=0; f.aiCooldown=rand(450,760);
    }else f.aiCooldown=rand(230,500);
  }
}

function findRespawnPoint(f){
  const s=game.map.stage;
  let best={x:s.x+s.w/2,y:s.y+s.h/2};
  for(let i=0;i<10;i++){
    const p={x:rand(s.x+s.w*.30,s.x+s.w*.70),y:rand(s.y+s.h*.30,s.y+s.h*.70)};
    const clear=game.fighters.every(o=>o===f||!o.alive||Math.hypot(o.x-p.x,o.y-p.y)>58);
    best=p;
    if(clear) break;
  }
  return best;
}

function respawn(f){
  const p=findRespawnPoint(f);
  f.x=p.x; f.y=p.y;
  f.z=0; f.vx=f.vy=f.vz=0; f.damage=0; f.alive=true;
  f.state='idle'; f.stateTime=0; f.attack=null; f.attackHit=false; f.attackConnected=false;
  f.spawnShield=900; f.getupShield=0; f.landingLag=0;
  f.effects={invincible:0,speed:0,reverse:0}; f.item=null; f.itemUses=0;
  f.lastAttacker=null; f.lastHitAt=-99999; f.lastHitType=null;
}

function triggerFinalOut(winner,loser){
  if(game.ended) return;
  game.ended=true;
  game.winner=winner;
  game.endTimer=1050;
  game.shake=Math.max(game.shake,7);
  game.finalFlash=420;
  finalKoBanner.classList.remove('hidden');
  tone(76,.18,'sawtooth',.07);
  for(let i=0;i<18;i++) game.particles.push({kind:i%2?'star':'spark',x:clamp(loser.x,20,W-20),y:clamp(loser.y,30,H-30),vx:rand(-5,5),vy:rand(-4,2),t:rand(350,650),max:650,size:rand(4,8)});
}

function handleRingOut(f){
  if(!f.alive) return;
  f.stocks=Math.max(0,f.stocks-1);
  f.stats.deaths++;
  const recent=f.lastAttacker && (game.time-f.lastHitAt)<=2200 && f.lastAttacker!==f;
  if(recent){
    f.lastAttacker.stats.ringOuts++;
    if(attackData(f.lastHitType)?.group==='jumpkick') f.lastAttacker.stats.jumpkickOuts++;
  }else{
    f.stats.suicides++;
  }
  f.alive=false; f.respawn=1100; f.state='down'; f.stateTime=0;
  game.shake=Math.max(game.shake,3.8);
  for(let i=0;i<8;i++) game.particles.push({kind:'dust',x:clamp(f.x,10,W-10),y:clamp(f.y,10,H-10),vx:rand(-2.5,2.5),vy:rand(-2,-.2),t:360,max:360,size:rand(5,9)});
  tone(118,.075,'square',.035);

  if(game.fighters.length>1){
    const contenders=game.fighters.filter(x=>x.stocks>0);
    if(contenders.length===1) triggerFinalOut(contenders[0],f);
  }else if(f.stocks<=0){
    game.ended=true; game.winner=null; game.endTimer=700;
  }
}

function updateFighter(f,dt){
  if(!f.alive){ f.respawn-=dt; if(f.respawn<=0 && f.stocks>0 && !game.ended)respawn(f); return; }
  f.stateTime+=dt;
  f.flash=Math.max(0,f.flash-dt);
  f.spawnShield=Math.max(0,f.spawnShield-dt);
  f.getupShield=Math.max(0,f.getupShield-dt);
  f.hurtLock=Math.max(0,f.hurtLock-dt);
  f.landingLag=Math.max(0,f.landingLag-dt);
  f.hazardCooldown=Math.max(0,(f.hazardCooldown||0)-dt);
  f.trailTimer-=dt;
  for(const k of Object.keys(f.effects)) f.effects[k]=Math.max(0,f.effects[k]-dt);

  if(f.bot) updateBot(f,dt); else updateHuman(f);

  if(f.attacking){
    resolveAttack(f);
    const ad=attackData(f.attack);
    if(f.stateTime>=ad.duration){
      f.state=f.z>0?'jump':'idle'; f.stateTime=0; f.attack=null; f.attackHit=false;
    }
  }
  if(f.state==='hurt' && f.stateTime>250 && f.z===0){
    if(f.damage>=60 && Math.hypot(f.vx,f.vy)>1.3){ f.state='down'; f.stateTime=0; }
    else { f.state='idle'; f.stateTime=0; }
  }
  if(f.state==='down' && f.stateTime>650){ f.state='getup'; f.stateTime=0; }
  if(f.state==='getup' && f.stateTime>340){ f.state='idle'; f.stateTime=0; f.getupShield=400; }

  const friction=isSlippery(f)?0.93:0.86;
  f.vx*=friction; f.vy*=friction;
  f.x+=f.vx; f.y+=f.vy;

  const speed=Math.hypot(f.vx,f.vy);
  if(f.damage>=55 && speed>3.8 && f.trailTimer<=0){
    f.trailTimer=55;
    game.particles.push({kind:'trail',x:f.x-f.vx*2.2,y:f.y-f.z-16,vx:-f.vx*.12,vy:-f.vy*.12,t:220,max:220,size:rand(6,10)});
  }

  if(f.z>0 || f.vz>0){
    f.vz-=0.30; f.z+=f.vz;
    if(f.z<=0){
      f.z=0; f.vz=0;
      if(f.state==='jumpkick' || f.airAttackWas==='jumpkick'){
        const lag=(f.airAttackConnected?120:210)*f.def.trait.landingLag;
        f.landingLag=Math.max(f.landingLag,lag);
      }else if(f.airAttackWas==='airpunch'){
        f.landingLag=Math.max(f.landingLag,65*f.def.trait.landingLag);
      }
      f.airAttackWas=null; f.airAttackConnected=false;
      if(f.state==='jump'){ f.state='idle';f.stateTime=0; }
      if(f.state==='jumpkick'||f.state==='airpunch'){ f.state='idle';f.attack=null;f.attackHit=false; }
    }
  }

  for(const drop of game.drops){
    if(drop.picked)continue;
    if(drop.landed && Math.abs(drop.x-f.x)<22 && Math.abs(drop.y-f.y)<20 && f.z<6){
      drop.picked=true; f.stats.itemPickups++; applyDrop(f,drop.type);
      game.particles.push({kind:'star',x:f.x,y:f.y-34,vx:0,vy:-1.1,t:330,max:330,size:8});
      tone(420,.06,'square',.025);
    }
  }

  const s=game.map.stage;
  const out=18;
  if(f.x<s.x-out || f.x>s.x+s.w+out || f.y<s.y-out || f.y>s.y+s.h+out) handleRingOut(f);
}

function applyDrop(f,type){
  if(type==='hammer'){f.item='hammer';f.itemUses=3;}
  if(type==='invincible')f.effects.invincible=items.invincible.duration;
  if(type==='speed')f.effects.speed=5000;
  if(type==='meat')f.damage=Math.max(0,f.damage-25);
  if(type==='poop')f.effects.reverse=5000;
}

function spawnDrop(){
  const s=game.map.stage;
  const type=choice(Object.keys(items));
  const ux=(Math.random()+Math.random())/2;
  const uy=(Math.random()+Math.random())/2;
  const x=s.x+s.w*(.20+.60*ux);
  const targetY=s.y+s.h*(.20+.60*uy);
  game.drops.push({type,x,y:s.y-70,targetY,vy:3.4,warning:true,warningTimer:760,landed:false,picked:false,t:0});
}

function updateDrops(dt){
  game.itemTimer-=dt;
  if(game.itemTimer<=0){ spawnDrop(); game.itemTimer=rand(5200,7600); }
  for(const d of game.drops){
    d.t+=dt;
    if(d.warning){
      d.warningTimer-=dt;
      if(d.warningTimer<=0){d.warning=false;d.y=game.map.stage.y-70;d.vy=3.4;}
      continue;
    }
    if(!d.landed){ d.y+=d.vy; d.vy+=0.10; if(d.y>=d.targetY){d.y=d.targetY;d.vy=0;d.landed=true;} }
  }
  game.drops=game.drops.filter(d=>!d.picked&&d.t<15500);
}

function separateFighters(){
  const alive=game.fighters.filter(f=>f.alive&&f.z<18);
  for(let i=0;i<alive.length;i++){
    for(let j=i+1;j<alive.length;j++){
      const a=alive[i],b=alive[j];
      let dx=b.x-a.x,dy=b.y-a.y;
      let d=Math.hypot(dx,dy);
      const min=26;
      if(d>0&&d<min){
        const push=(min-d)*0.18;
        dx/=d;dy/=d;
        a.x-=dx*push;a.y-=dy*push;b.x+=dx*push;b.y+=dy*push;
      }
    }
  }
}

function drawHeldHammer(f,y){
  const dir=f.facing;
  ctx.save();ctx.translate(f.x,y);ctx.scale(dir,1);
  const attacking=['punch','dashpunch','airpunch'].includes(f.state);
  const hx=attacking?38:24,hy=attacking?-18:-26;
  pxy(ctx,hx-6,hy-7,20,10,'#303740');pxy(ctx,hx-3,hy-4,14,4,'#969da5');
  pxy(ctx,hx-1,hy+2,5,26,'#65442f');pxy(ctx,hx,hy+3,2,23,'#c89059');
  ctx.restore();
}

function updateParticles(dt){
  for(const p of game.particles){
    p.t-=dt; p.x+=p.vx*(dt/16.67); p.y+=p.vy*(dt/16.67);
    p.vx*=.96; p.vy*=.96;
    if(p.kind==='dust'||p.kind==='trail') p.vy-=.01*(dt/16.67);
  }
  game.particles=game.particles.filter(p=>p.t>0);
  game.bursts.forEach(b=>b.t-=dt); game.bursts=game.bursts.filter(b=>b.t>0);
}

function pushHazard(f,vx,vy=0,damage=0){
  if(f.hazardCooldown>0 || f.spawnShield>0 || f.effects.invincible>0) return;
  f.damage+=damage; f.stats.maxDamage=Math.max(f.stats.maxDamage,f.damage);
  f.vx+=vx*f.def.trait.incomingKb; f.vy+=vy*f.def.trait.incomingKb; f.vz=Math.max(f.vz,1.2);
  f.hazardCooldown=600; f.lastAttacker=null; f.lastHitAt=-99999; f.lastHitType=null;
  game.shake=Math.max(game.shake,1.8);
  addImpactParticles(f.x,f.y-f.z-20,Math.abs(vx)+Math.abs(vy),'punch');
}

function updateMapGimmicks(dt){
  const s=game.map.stage;
  if(game.map.key==='rooftop'){
    const w=game.mapState.wind;
    w.timer-=dt;
    if(w.phase==='wait'&&w.timer<=0){
      w.phase='warning'; w.timer=1100; w.dir=Math.random()<.5?1:-1;
      tone(520,.07,'square',.018);
    } else if(w.phase==='warning'&&w.timer<=0){
      w.phase='active'; w.timer=1500;
    } else if(w.phase==='active'){
      const push=w.dir*0.075*(dt/16.67);
      for(const f of game.fighters.filter(x=>x.alive&&x.z<28)){
        // Mild, readable environmental push. It never deals damage or claims a KO.
        f.vx += push;
      }
      if(w.timer<=0){ w.phase='wait'; w.timer=rand(6800,9600); }
    }
  }
  // The dojo's polished center strip is handled by isSlippery(). No random damage gimmick.
}

function update(dt){
  if(!game) return;
  game.time+=dt;
  game.finalFlash=Math.max(0,game.finalFlash-dt);
  game.shake=Math.max(0,game.shake-dt*.018);
  if(game.slowMoTimer>0){game.slowMoTimer=Math.max(0,game.slowMoTimer-dt);if(game.slowMoTimer===0)game.slowMoScale=1;}

  if(game.ended){
    updateParticles(dt);
    game.endTimer-=dt;
    if(game.endTimer<=0&&!game.resultShown) showResult();
    pressed.clear();
    return;
  }

  updateDrops(dt);
  updateMapGimmicks(dt);
  game.fighters.forEach(f=>updateFighter(f,dt));
  separateFighters();
  updateParticles(dt);
  const me=game.fighters[0];
  stockInfo.textContent=`${me.name} ${me.stocks}/${selectedStocks}`;
  damageInfo.textContent=`${me.name} ${Math.round(me.damage)}%`;
  const eff=[];
  if(me.item==='hammer')eff.push(`망치 ${me.itemUses}회`);
  if(me.effects.invincible>0)eff.push(`무적 ${Math.ceil(me.effects.invincible/1000)}초`);
  if(me.effects.speed>0)eff.push(`속도UP ${Math.ceil(me.effects.speed/1000)}초`);
  if(me.effects.reverse>0)eff.push(`💩 좌우반전 ${Math.ceil(me.effects.reverse/1000)}초`);
  buffInfo.textContent=eff.length?eff.join(' · '):'효과 없음';
  pressed.clear();
}

function makeTitles(){
  const fs=game.fighters;
  const categories=[
    ['ringOuts','폭력왕'],['deaths','산책 종료'],['itemPickups','주워먹기 대장'],['suicides','혼자 뭐함?'],['jumpkickOuts','날아라 멍냥'],['damageDealt','오늘 왜 이래']
  ];
  const result=new Map(fs.map(f=>[f,[]]));
  for(const [key,title] of categories){
    const max=Math.max(...fs.map(f=>f.stats[key]));
    if(max<=0) continue;
    fs.filter(f=>f.stats[key]===max).forEach(f=>result.get(f).push(title));
  }
  return result;
}

function showResult(){
  if(game.resultShown) return;
  game.resultShown=true;
  finalKoBanner.classList.add('hidden');
  const winner=game.winner;
  resultTitle.textContent=winner?`${winner.name} 승리!`:'연습 종료';
  winnerImage.src=winner?makeAvatar(winner.def):makeAvatar(game.fighters[0].def);
  const titles=makeTitles();
  const rows=game.fighters.map(f=>{
    const tags=titles.get(f)||[];
    return `<tr class="${winner===f?'winner-row':''}"><td><strong>${f.name}</strong><div class="result-title-tags">${tags.map(x=>`<span>${x}</span>`).join('')}</div></td><td>${f.stats.ringOuts}</td><td>${f.stats.deaths}</td><td>${f.stats.hits}</td><td>${f.stats.punchHits}</td><td>${f.stats.kickHits}</td><td>${f.stats.jumpkickHits}</td><td>${f.stats.itemPickups}</td><td>${Math.round(f.stats.maxDamage)}%</td><td>${f.stats.suicides}</td><td>${Math.round(f.stats.damageDealt)}</td></tr>`;
  }).join('');
  resultStats.innerHTML=`<table class="result-table"><thead><tr><th>캐릭터 / 칭호</th><th>장외</th><th>장외당함</th><th>명중</th><th>주먹</th><th>킥</th><th>점프킥</th><th>아이템</th><th>최대%</th><th>자살</th><th>가한 피해</th></tr></thead><tbody>${rows}</tbody></table>`;
  resultOverlay.classList.remove('hidden');
}

function draw(){
  const shakeX=game.shake>0?rand(-game.shake,game.shake):0;
  const shakeY=game.shake>0?rand(-game.shake,game.shake):0;
  ctx.save();
  ctx.translate(shakeX,shakeY);
  drawMap(game.map);
  drawMapGimmicks();
  game.drops.forEach(drawDrop);
  const order=game.fighters.filter(f=>f.alive).sort((a,b)=>a.y-b.y);
  order.forEach(drawShadow);
  order.forEach(drawFighter);
  game.bursts.forEach(drawBurst);
  game.particles.forEach(drawParticle);
  ctx.restore();
  drawScore();
  if(game.finalFlash>0){
    ctx.save();
    ctx.globalAlpha=Math.min(.24,game.finalFlash/900);
    ctx.fillStyle='#fff2b2';ctx.fillRect(0,0,W,H);
    ctx.restore();
  }
}

function drawMapGimmicks(){
  const s=game.map.stage;
  if(game.map.key==='rooftop'){
    const w=game.mapState.wind;
    if(w.phase==='warning'||w.phase==='active'){
      ctx.save();
      const active=w.phase==='active';
      ctx.globalAlpha=active?.55:.82;
      ctx.fillStyle=active?'#c8e8ff':'#ffe38a';
      ctx.font='bold 18px Arial';ctx.textAlign='center';
      ctx.fillText(active?'강풍!':'⚠ 강풍 온다',W/2,s.y+28);
      ctx.font='bold 26px Arial';
      const arrow=w.dir>0?'→':'←';
      for(let i=0;i<5;i++)ctx.fillText(arrow,s.x+110+i*128,s.y+s.h*.52+Math.sin(game.time*.012+i)*8);
      ctx.restore();
    }
  }
  if(game.map.key==='dojo'){
    const p=game.mapState.slick;
    ctx.save();
    ctx.globalAlpha=.26;
    ctx.fillStyle='#fff4c7';ctx.fillRect(p.x,p.y,p.w,p.h);
    ctx.globalAlpha=.55;ctx.strokeStyle='#fff3c0';ctx.lineWidth=2;ctx.strokeRect(p.x+.5,p.y+.5,p.w-1,p.h-1);
    ctx.font='bold 11px Arial';ctx.fillStyle='#fff1bd';ctx.textAlign='center';ctx.fillText('광택 마루 · 살짝 미끄러움',p.x+p.w/2,p.y+16);
    ctx.restore();
  }
}

function drawShadow(f){
  ctx.fillStyle='rgba(0,0,0,.20)'; ctx.beginPath(); ctx.ellipse(f.x,f.y+8,17,6,0,0,Math.PI*2);ctx.fill();
}
function drawFighter(f){
  const y=f.y-f.z;
  const blink=(f.spawnShield>0||f.getupShield>0) && Math.floor(game.time/90)%2===0;
  ctx.save();
  if(blink) ctx.globalAlpha=.48;
  drawAnimal(ctx,f.def,f.x,y,{facing:f.facing,action:f.state,t:f.stateTime,scale:1.0,flash:f.flash>0,inv:f.effects.invincible>0});
  ctx.restore();
  const name = f.name;
  const dmg = `${Math.round(f.damage)}%`;
  ctx.save();
  ctx.font='bold 12px Arial';
  ctx.textAlign='center';
  const w = Math.max(ctx.measureText(name).width, ctx.measureText(dmg).width) + 14;
  const bx = Math.round(f.x - w/2);
  const by = Math.round(y - 88);
  ctx.fillStyle='rgba(27,22,20,.72)'; ctx.fillRect(bx, by, w, 28);
  ctx.strokeStyle='rgba(255,239,185,.55)'; ctx.lineWidth=1; ctx.strokeRect(bx+0.5, by+0.5, w-1, 27);
  ctx.fillStyle='#fff0a5'; ctx.fillText(name,f.x,by+11);
  ctx.fillStyle='#ffffff'; ctx.fillText(dmg,f.x,by+23);
  if(f.effects.reverse>0){
    const a=game.time*.006;
    ctx.fillStyle='#8a5a32';ctx.font='bold 16px Arial';ctx.fillText('💩',f.x+Math.cos(a)*15,by-9+Math.sin(a)*4);
    ctx.fillStyle='#ffd66e';ctx.beginPath();ctx.arc(f.x+Math.cos(a+2)*20,by-9+Math.sin(a+2)*6,2.5,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
  if(f.item==='hammer') drawHeldHammer(f,y);
}

function drawParticle(p){
  const a=Math.max(0,Math.min(1,p.t/(p.max||300)));
  ctx.save();ctx.globalAlpha=a;
  if(p.kind==='spark'){
    ctx.fillStyle='#fff0a0';ctx.fillRect(p.x-p.size/2,p.y-1,p.size,2);
  }else if(p.kind==='star'){
    ctx.fillStyle='#ffd95e';ctx.translate(p.x,p.y);ctx.rotate((p.t||0)*.02);ctx.fillRect(-p.size/2,-1,p.size,2);ctx.fillRect(-1,-p.size/2,2,p.size);
  }else if(p.kind==='trail'){
    ctx.fillStyle='rgba(255,245,205,.55)';ctx.beginPath();ctx.ellipse(p.x,p.y,p.size*1.4,p.size*.55,0,0,Math.PI*2);ctx.fill();
  }else{
    ctx.fillStyle='#d7c3a2';ctx.beginPath();ctx.arc(p.x,p.y,p.size/2,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
}

function pxy(g,x,y,w,h,c){g.fillStyle=c;g.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}

function drawAnimal(g,def,x,y,opt={}){
  const dir = opt.facing || 1;
  const act = opt.action || 'idle';
  const t = opt.t || 0;
  let spriteAction = act;
  if (act === 'walk') spriteAction = 'idle';
  if (act === 'dashpunch' || act === 'airpunch') spriteAction = 'punch';
  if (act === 'dashkick') spriteAction = 'kick';
  if (act === 'hurt' || act === 'down' || act === 'getup') spriteAction = 'idle';
  if (!spriteActions.includes(spriteAction)) spriteAction = 'idle';

  const img = spriteBank[def.key] && spriteBank[def.key][spriteAction];
  if (!img || !img.complete || !img.naturalWidth) return;

  const baseH = def.small ? 72 : (def.kind === 'cat' ? 78 : 76);
  let h = baseH;
  if (spriteAction === 'kick' || spriteAction === 'jumpkick') h += 5;
  if (spriteAction === 'jump') h += 2;
  const w = h * (img.naturalWidth / img.naturalHeight);

  let bob = 0;
  let rot = 0;
  let sx = 1;
  let sy = 1;
  if (act === 'idle') bob = [0,-1,0,-1][Math.floor(t/170)%4];
  if (act === 'walk') {
    bob = [0,-2,0,-1][Math.floor(t/105)%4];
    rot = [0.02,0,-0.02,0][Math.floor(t/105)%4];
  }
  if (act === 'jump' || act === 'jumpkick' || act === 'airpunch') bob -= 2;
  if (act === 'dashpunch' || act === 'dashkick') { rot = 0.045; bob = -1; }
  if (act === 'hurt') { rot = -0.16; sx = 0.98; sy = 0.98; }
  if (act === 'down') { rot = -1.18; sx = 1.05; sy = 0.78; bob = 7; }
  if (act === 'getup') {
    const q = Math.max(0, Math.min(1, t/340));
    rot = -1.0 * (1-q);
    sy = 0.8 + 0.2*q;
    bob = 6*(1-q);
  }

  const anchor = spriteAction === 'idle' ? 0.46 : (spriteAction === 'jump' ? 0.48 : 0.40);

  g.save();
  g.translate(Math.round(x), Math.round(y + bob));
  g.scale(dir, 1);
  g.rotate(rot * dir);
  g.scale(sx, sy);

  if (opt.inv) {
    g.save();
    g.globalAlpha = 0.35;
    g.shadowColor = '#71e5ff';
    g.shadowBlur = 18;
    g.fillStyle = '#71e5ff';
    g.beginPath();
    g.ellipse(0, -h*0.45, w*0.34, h*0.48, 0, 0, Math.PI*2);
    g.fill();
    g.restore();
  }

  if (opt.flash) {
    g.save();
    g.globalAlpha = 0.45;
    g.filter = 'brightness(1.8)';
    g.drawImage(img, -w*anchor, -h, w, h);
    g.restore();
  }

  g.drawImage(img, -w*anchor, -h, w, h);
  g.restore();
}

function drawDrop(d){
  if(d.warning){
    ctx.save();ctx.translate(Math.round(d.x),Math.round(d.targetY));
    const pulse=.65+.35*Math.sin(game.time*.018);
    ctx.globalAlpha=.65+.25*pulse;
    ctx.strokeStyle='#ffe174';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,19+pulse*4,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle='#ffe174';ctx.font='bold 22px Arial';ctx.textAlign='center';ctx.fillText('!',0,-24);
    ctx.fillStyle='rgba(0,0,0,.18)';ctx.beginPath();ctx.ellipse(0,8,15,5,0,0,Math.PI*2);ctx.fill();
    ctx.restore();
    return;
  }
  const x=d.x,y=d.y;
  ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.imageSmoothingEnabled=false;
  if(d.landed){ctx.fillStyle='rgba(0,0,0,.18)';ctx.beginPath();ctx.ellipse(0,16,17,6,0,0,Math.PI*2);ctx.fill();}
  if(d.type==='hammer'){
    pxy(ctx,-15,-14,30,14,'#303740');pxy(ctx,-10,-10,20,6,'#949ca6');pxy(ctx,-4,1,8,27,'#6f482f');pxy(ctx,-1,2,2,24,'#c68b56');
  } else if(d.type==='invincible'){
    pxy(ctx,-16,-16,32,32,'#4ac8ee');pxy(ctx,-11,-11,22,22,'#b9f6ff');pxy(ctx,-2,-9,4,18,'#ffffff');pxy(ctx,-9,-2,18,4,'#ffffff');
  } else if(d.type==='speed'){
    pxy(ctx,-12,-17,24,34,'#42503a');pxy(ctx,-9,-13,18,24,'#9ce66d');pxy(ctx,-6,-20,12,7,'#eee6c6');pxy(ctx,-2,-8,4,14,'#f7f1d2');
  } else if(d.type==='meat'){
    pxy(ctx,-17,-11,26,20,'#b84742');pxy(ctx,-14,-9,20,16,'#e36f63');pxy(ctx,8,-7,11,13,'#f1dfbb');pxy(ctx,11,-4,4,7,'#fff4db');
  } else if(d.type==='poop'){
    pxy(ctx,-15,7,30,9,'#5f412c');pxy(ctx,-11,-2,22,10,'#7b5234');pxy(ctx,-7,-10,14,9,'#95633c');pxy(ctx,-3,-16,6,7,'#a87548');
  }
  ctx.font='bold 13px Arial';ctx.textAlign='center';ctx.fillStyle='#fff4bd';ctx.strokeStyle='rgba(0,0,0,.65)';ctx.lineWidth=3;ctx.strokeText(items[d.type].name,0,-22);ctx.fillText(items[d.type].name,0,-22);
  ctx.restore();
}

function drawBurst(b){
  const p=1-b.t/240;
  const n=b.type==='jumpkick'?10:(b.type==='kick'?8:6);
  ctx.save();ctx.translate(b.x,b.y);
  for(let i=0;i<n;i++){
    const a=i*Math.PI*2/n;
    const r=(7+p*(b.type==='jumpkick'?18:12));
    const size=b.type==='punch'?4:5;
    pxy(ctx,Math.cos(a)*r-size/2,Math.sin(a)*r-size/2,size,size,i%2?'#fff1a1':'#ffd24d');
  }
  ctx.restore();
}

function drawScore(){
  ctx.save();ctx.font='bold 13px Arial';ctx.textAlign='right';let y=48;
  for(const f of game.fighters){ctx.fillStyle='rgba(35,31,29,.78)';ctx.fillRect(832,y-17,105,21);ctx.fillStyle='#fff';ctx.fillText(`${f.name} ${f.stocks}`,927,y-2);y+=24;}ctx.restore();
}

function drawMap(map){
  if(map.theme==='rooftop') drawRooftop(map.stage);
  else drawDojo(map.stage);
}

function stageBase(s,outer1,outer2,floor,border){
  for(let y=0;y<H;y+=36){ctx.fillStyle=((y/36)%2)?outer1:outer2;ctx.fillRect(0,y,W,36);}
  ctx.fillStyle='rgba(5,8,15,.48)';ctx.fillRect(0,s.y+s.h+18,W,H-(s.y+s.h+18));
  ctx.fillStyle=border;ctx.fillRect(s.x-9,s.y-9,s.w+18,s.h+18);
  ctx.fillStyle='#2a1f21';ctx.fillRect(s.x-5,s.y+s.h,s.w+10,17);
  ctx.fillStyle=floor;ctx.fillRect(s.x,s.y,s.w,s.h);
}

function drawRooftop(s){
  // Original stage identity restored: night skyline + open rooftop ring.
  const sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,'#263d64');sky.addColorStop(1,'#101724');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
  const buildings=[[0,82,120,178],[98,126,92,134],[182,68,126,192],[302,112,82,148],[378,54,148,206],[522,108,114,152],[632,74,96,186],[724,116,128,144],[844,66,116,194]];
  buildings.forEach((b,i)=>{ctx.fillStyle=i%2?'#1b2a42':'#21344e';ctx.fillRect(...b);ctx.fillStyle='#f2cc6e';for(let x=b[0]+14;x<b[0]+b[2]-8;x+=24)for(let y=b[1]+18;y<b[1]+b[3]-8;y+=25)if(((x+y+i)>>2)%3)ctx.fillRect(x,y,6,8)});
  ctx.fillStyle='#0a101a';ctx.fillRect(0,250,W,H-250);
  ctx.fillStyle='#555c67';ctx.fillRect(s.x-16,s.y-16,s.w+32,s.h+32);
  ctx.fillStyle='#7c828a';ctx.fillRect(s.x,s.y,s.w,s.h);
  ctx.strokeStyle='#686e77';ctx.lineWidth=2;
  for(let x=s.x;x<=s.x+s.w;x+=55){ctx.beginPath();ctx.moveTo(x,s.y);ctx.lineTo(x,s.y+s.h);ctx.stroke()}
  for(let y=s.y;y<=s.y+s.h;y+=42){ctx.beginPath();ctx.moveTo(s.x,y);ctx.lineTo(s.x+s.w,y);ctx.stroke()}
  // Yellow/black border makes every ring-out edge obvious.
  ctx.lineWidth=6;ctx.strokeStyle='#f1cf57';ctx.strokeRect(s.x-3,s.y-3,s.w+6,s.h+6);
  ctx.lineWidth=2;ctx.strokeStyle='#222830';ctx.setLineDash([14,10]);ctx.strokeRect(s.x-7,s.y-7,s.w+14,s.h+14);ctx.setLineDash([]);
  // Rooftop props stay outside the fighting surface.
  ctx.fillStyle='#48515c';ctx.fillRect(34,300,55,82);ctx.fillStyle='#69747e';ctx.fillRect(42,310,39,15);
  ctx.fillStyle='#474d57';ctx.fillRect(872,274,48,96);ctx.fillStyle='#78828b';ctx.fillRect(880,284,32,18);
  mapLabel('옥상 링','NIGHT ROOFTOP · RING OUT',s.x+16,s.y+28);
}

function drawDojo(s){
  // Original stage identity restored while keeping current ring-out rules.
  ctx.fillStyle='#261917';ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#563128';ctx.fillRect(0,0,W,120);
  // shoji wall
  ctx.fillStyle='#e3d1a8';ctx.fillRect(110,22,740,92);
  ctx.strokeStyle='#6d4432';ctx.lineWidth=6;
  for(let x=110;x<=850;x+=92){ctx.beginPath();ctx.moveTo(x,22);ctx.lineTo(x,114);ctx.stroke()}
  ctx.beginPath();ctx.moveTo(110,68);ctx.lineTo(850,68);ctx.stroke();
  ctx.fillStyle='#f1e5c8';ctx.fillRect(405,26,150,38);ctx.fillStyle='#31231f';ctx.font='bold 20px monospace';ctx.textAlign='center';ctx.fillText('멍 냥 도 장',480,52);ctx.textAlign='left';
  ctx.fillStyle='#161014';ctx.fillRect(0,112,W,H-112);
  ctx.fillStyle='#4d2b23';ctx.fillRect(s.x-18,s.y-18,s.w+36,s.h+36);
  ctx.fillStyle='#c49c67';ctx.fillRect(s.x,s.y,s.w,s.h);
  // tatami/wood planks
  for(let y=s.y;y<s.y+s.h;y+=40){ctx.fillStyle=((y-s.y)/40)%2?'#c7a26f':'#bc9362';ctx.fillRect(s.x,y,s.w,3)}
  for(let x=s.x;x<s.x+s.w;x+=96){ctx.fillStyle='rgba(84,49,36,.22)';ctx.fillRect(x,s.y,3,s.h)}
  // clear ring-out lip
  ctx.lineWidth=7;ctx.strokeStyle='#e6c66b';ctx.strokeRect(s.x-3,s.y-3,s.w+6,s.h+6);
  ctx.lineWidth=3;ctx.strokeStyle='#5a3428';ctx.strokeRect(s.x+5,s.y+5,s.w-10,s.h-10);
  // decorative training gear outside platform
  ctx.fillStyle='#81533b';ctx.fillRect(28,206,42,164);ctx.fillStyle='#b77950';ctx.fillRect(22,188,54,40);
  ctx.fillStyle='#81533b';ctx.fillRect(890,214,38,150);ctx.fillStyle='#b77950';ctx.fillRect(884,196,50,38);
  mapLabel('멍냥 도장','WOODEN DOJO · RING OUT',s.x+16,s.y+28);
}

function mapLabel(title,sub,x,y){
  ctx.save();ctx.font='bold 15px Arial';ctx.fillStyle='rgba(28,22,22,.76)';ctx.fillRect(x-8,y-20,245,42);ctx.fillStyle='#fff0bd';ctx.fillText(title,x,y-3);ctx.font='bold 10px Arial';ctx.fillStyle='#e8ca80';ctx.fillText(sub,x,y+13);ctx.restore();
}

function loop(now){
  if(!running||!game)return;
  const rawDt=Math.min(32,now-game.last||16.67);game.last=now;
  if(game.hitstop>0){
    game.hitstop=Math.max(0,game.hitstop-rawDt);
    draw();
    requestAnimationFrame(loop);
    return;
  }
  const scale=game.slowMoTimer>0?game.slowMoScale:1;
  update(rawDt*scale);
  draw();
  requestAnimationFrame(loop);
}

buildMenu();
