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
    key:'jjigae', name:'찌개', subtitle:'갈색 말티푸 · 귀가 축 처진 기본형', kind:'dog', breed:'maltipoo',
    fur:'#b77a49', fur2:'#d39a63', light:'#efd0a0', ear:'#9b633c', outline:'#38231b', eye:'#191614', small:false
  },
  {
    key:'mandu', name:'만두', subtitle:'하얀 푸들 · 몽실몽실한 푸들형', kind:'dog', breed:'poodle',
    fur:'#f4f1ed', fur2:'#ffffff', light:'#fffdfa', ear:'#ddd8d2', outline:'#393632', eye:'#171717', small:false
  },
  {
    key:'gamja', name:'감자', subtitle:'크림 말티푸 · 더 작은 아기 버전', kind:'dog', breed:'puppy',
    fur:'#ead9a8', fur2:'#f7e9c2', light:'#fff3d3', ear:'#d2bb84', outline:'#403728', eye:'#171614', small:true
  },
  {
    key:'gucci', name:'구찌', subtitle:'주황+하양 코숏 · 귀와 꼬리가 살아있는 고양이형', kind:'cat', breed:'cat',
    fur:'#f6f3ef', fur2:'#ffffff', light:'#ffffff', ear:'#f0a047', patch:'#e88e31', outline:'#38271e', eye:'#77b8d0', small:false
  },
];

const maps = [
  { key:'living', name:'집 거실', desc:'소파·TV·러그가 보이는 거실', theme:'living', stage:{x:122, y:150, w:716, h:276} },
  { key:'bathroom', name:'집 화장실', desc:'욕조·세면대·변기가 있는 화장실', theme:'bathroom', stage:{x:140, y:154, w:680, h:258} },
  { key:'walkway', name:'아파트 산책로', desc:'벤치·화단·아파트가 보이는 산책로', theme:'walkway', stage:{x:112, y:176, w:736, h:238} },
  { key:'soccer', name:'축구 잔디밭', desc:'흰 라인과 골대가 보이는 잔디밭', theme:'soccer', stage:{x:112, y:146, w:736, h:278} },
];

const items = {
  hammer: { name:'망치', duration:0, desc:'강화 공격 3회' },
  invincible: { name:'무적', duration:5000, desc:'5초 무적' },
  speed: { name:'스피드약', duration:5000, desc:'5초 1.3배 속도' },
  meat: { name:'고기', duration:0, desc:'데미지 25% 회복' },
  poop: { name:'똥모양', duration:5000, desc:'5초 좌우 반전' },
};

let selectedChar = 'jjigae';
let selectedMap = 'living';
let selectedBots = 0;
let running = false;
let game = null;

function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function rand(a,b){ return a + Math.random()*(b-a); }
function choice(arr){ return arr[(Math.random()*arr.length)|0]; }
function dist(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); }

function makeAvatar(def) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  drawAnimal(g, def, 28, 46, { facing:1, action:'idle', t:120, scale:1.8, preview:true });
  return c.toDataURL();
}

function buildMenu() {
  characterList.innerHTML = '';
  mapList.innerHTML = '';
  characters.forEach(def => {
    const card = document.createElement('div');
    card.className = 'card' + (def.key === selectedChar ? ' selected' : '');
    card.innerHTML = `<img class="avatar" src="${makeAvatar(def)}"><div><div class="title">${def.name}</div><div class="subtitle">${def.subtitle}</div></div>`;
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
    this.stocks = 5;
    this.state = 'idle';
    this.stateTime = 0;
    this.attack = null;
    this.attackHit = false;
    this.alive = true;
    this.respawn = 0;
    this.hurtLock = 0;
    this.spawnShield = 850;
    this.flash = 0;
    this.item = null;
    this.itemUses = 0;
    this.effects = { invincible:0, speed:0, reverse:0 };
    this.aiCooldown = rand(350,700);
    this.aiMoveX = 0;
    this.aiMoveY = 0;
    this.baseSpeed = 2.0;
  }
  get speed(){ return this.baseSpeed * (this.effects.speed > 0 ? 1.3 : 1); }
  get attacking(){ return ['punch','kick','jumpkick'].includes(this.state); }
  get locked(){ return this.attacking || ['hurt','down','getup'].includes(this.state); }
}

class Game {
  constructor() {
    this.map = maps.find(m=>m.key===selectedMap);
    this.fighters = [];
    this.drops = [];
    this.bursts = [];
    this.itemTimer = 3200;
    this.last = performance.now();
    this.time = 0;

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

function startGame(){
  game = new Game();
  running = true;
  menuPanel.classList.add('hidden');
  gamePanel.classList.remove('hidden');
  requestAnimationFrame(loop);
}
function backToMenu(){
  running = false; game = null;
  gamePanel.classList.add('hidden');
  menuPanel.classList.remove('hidden');
  pressed.clear();
}
startBtn.onclick = startGame;

function attackData(type){
  if(type==='punch') return {start:80,end:165,duration:250,range:34,depth:18,damage:10,kb:3.3};
  if(type==='kick') return {start:105,end:205,duration:300,range:42,depth:20,damage:14,kb:4.25};
  if(type==='jumpkick') return {start:45,end:210,duration:290,range:42,depth:21,damage:16,kb:4.8};
  return null;
}

function beginAttack(f,type){
  if(!f.alive || f.attacking || ['hurt','down','getup'].includes(f.state)) return;
  f.state = type;
  f.stateTime = 0;
  f.attack = type;
  f.attackHit = false;
}

function hit(attacker,target,type){
  if(!target.alive || target.spawnShield>0 || target.effects.invincible>0) return;
  const d = attackData(type);
  let dmg=d.damage, kb=d.kb;
  if(attacker.item==='hammer' && attacker.itemUses>0){
    dmg += 9; kb += 1.5; attacker.itemUses--;
    if(attacker.itemUses<=0) attacker.item=null;
  }
  target.damage += dmg;
  const force = kb + target.damage * 0.052;
  target.vx = attacker.facing * force * 1.2;
  target.vy = Math.sign(target.y-attacker.y || (Math.random()-.5)) * Math.min(2.6, 0.65 + Math.abs(target.y-attacker.y)*0.025);
  target.vz = 2.4 + target.damage*0.011;
  target.state='hurt'; target.stateTime=0; target.hurtLock=230; target.flash=140;
  game.bursts.push({x:target.x + attacker.facing*12, y:target.y-target.z-24, t:240});
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
}

function updateHuman(f){
  if(f.locked && !f.attacking) return;
  let mx=(keys['KeyD']?1:0)-(keys['KeyA']?1:0);
  let my=(keys['KeyS']?1:0)-(keys['KeyW']?1:0);
  if(f.effects.reverse>0) mx*=-1;
  const dash=(keys['ShiftLeft']||keys['ShiftRight'])?1.35:1;
  if(!f.locked || f.state==='jump'){
    if(mx||my){
      const l=Math.hypot(mx,my)||1;
      f.vx += (mx/l)*f.speed*0.65*dash;
      f.vy += (my/l)*f.speed*0.65*dash;
      if(mx) f.facing=mx>0?1:-1;
      if(f.z===0 && !f.attacking) f.state='walk';
    } else if(f.z===0 && !f.attacking) f.state='idle';
  }
  if(pressed.has('Space') && f.z===0 && !f.locked){ f.vz=6.1; f.state='jump'; f.stateTime=0; }
  if(pressed.has('KeyJ') && f.z===0) beginAttack(f,'punch');
  if(pressed.has('KeyK')){
    if(f.z>0) beginAttack(f,'jumpkick');
    else beginAttack(f,'kick');
  }
}

function updateBot(f,dt){
  if(f.locked && !f.attacking){ f.aiMoveX=f.aiMoveY=0; return; }
  const targets=game.fighters.filter(t=>t!==f&&t.alive);
  if(!targets.length){ f.aiMoveX=f.aiMoveY=0; return; }
  targets.sort((a,b)=>dist(f,a)-dist(f,b));
  const t=targets[0];
  const dx=t.x-f.x,dy=t.y-f.y;
  f.facing=dx>=0?1:-1;
  if(!f.locked){
    const mx=Math.abs(dx)>27?Math.sign(dx):0;
    const my=Math.abs(dy)>15?Math.sign(dy):0;
    const l=Math.hypot(mx,my)||1;
    if(mx||my){ f.vx+=(mx/l)*f.speed*0.48; f.vy+=(my/l)*f.speed*0.48; if(f.z===0)f.state='walk'; }
    else if(f.z===0)f.state='idle';
  }
  f.aiCooldown-=dt;
  if(f.aiCooldown<=0 && !f.locked){
    if(Math.abs(dx)<44 && Math.abs(dy)<21){
      if(f.z>0) beginAttack(f,'jumpkick');
      else beginAttack(f, Math.random()<0.55?'punch':'kick');
      f.aiCooldown=rand(470,850);
    } else if(Math.random()<0.16 && f.z===0){ f.vz=6.0; f.state='jump'; f.stateTime=0; f.aiCooldown=rand(500,900); }
    else f.aiCooldown=rand(250,500);
  }
}

function respawn(f){
  const s=game.map.stage;
  f.x=rand(s.x+s.w*.3,s.x+s.w*.7); f.y=rand(s.y+s.h*.3,s.y+s.h*.7);
  f.z=0; f.vx=f.vy=f.vz=0; f.damage=0; f.alive=true;
  f.state='idle'; f.stateTime=0; f.attack=null; f.attackHit=false;
  f.spawnShield=900; f.effects={invincible:0,speed:0,reverse:0}; f.item=null; f.itemUses=0;
}

function updateFighter(f,dt){
  if(!f.alive){ f.respawn-=dt; if(f.respawn<=0 && f.stocks>0)respawn(f); return; }
  f.stateTime+=dt; f.flash=Math.max(0,f.flash-dt); f.spawnShield=Math.max(0,f.spawnShield-dt); f.hurtLock=Math.max(0,f.hurtLock-dt);
  for(const k of Object.keys(f.effects)) f.effects[k]=Math.max(0,f.effects[k]-dt);
  if(f.bot) updateBot(f,dt); else updateHuman(f);

  if(f.attacking){
    resolveAttack(f);
    const ad=attackData(f.attack);
    if(f.stateTime>=ad.duration){ f.state=f.z>0?'jump':'idle'; f.stateTime=0; f.attack=null; f.attackHit=false; }
  }
  if(f.state==='hurt' && f.stateTime>250 && f.z===0){
    if(f.damage>=60 && Math.hypot(f.vx,f.vy)>1.3){ f.state='down'; f.stateTime=0; }
    else { f.state='idle'; f.stateTime=0; }
  }
  if(f.state==='down' && f.stateTime>650){ f.state='getup'; f.stateTime=0; }
  if(f.state==='getup' && f.stateTime>340){ f.state='idle'; f.stateTime=0; }

  f.vx*=0.86; f.vy*=0.86;
  f.x+=f.vx; f.y+=f.vy;
  if(f.z>0 || f.vz>0){
    f.vz-=0.30; f.z+=f.vz;
    if(f.z<=0){ f.z=0; f.vz=0; if(f.state==='jump') {f.state='idle';f.stateTime=0;} if(f.state==='jumpkick'){f.state='idle';f.attack=null;} }
  }

  for(const drop of game.drops){
    if(drop.picked)continue;
    if(drop.landed && Math.abs(drop.x-f.x)<20 && Math.abs(drop.y-f.y)<18 && f.z<6){ drop.picked=true; applyDrop(f,drop.type); }
  }

  const s=game.map.stage;
  const out=18;
  if(f.x<s.x-out || f.x>s.x+s.w+out || f.y<s.y-out || f.y>s.y+s.h+out){
    f.stocks--; f.alive=false; f.respawn=1100; f.state='down';
    if(f.stocks<0)f.stocks=0;
  }
}

function applyDrop(f,type){
  if(type==='hammer'){f.item='hammer';f.itemUses=3;}
  if(type==='invincible')f.effects.invincible=5000;
  if(type==='speed')f.effects.speed=5000;
  if(type==='meat')f.damage=Math.max(0,f.damage-25);
  if(type==='poop')f.effects.reverse=5000;
}

function spawnDrop(){
  const s=game.map.stage;
  const type=choice(Object.keys(items));
  const x=rand(s.x+60,s.x+s.w-60);
  const targetY=rand(s.y+60,s.y+s.h-50);
  game.drops.push({type,x,y:s.y-70,targetY,vy:3.4,landed:false,picked:false,t:0});
}

function updateDrops(dt){
  game.itemTimer-=dt;
  if(game.itemTimer<=0){ spawnDrop(); game.itemTimer=rand(5200,7600); }
  for(const d of game.drops){
    d.t+=dt;
    if(!d.landed){ d.y+=d.vy; d.vy+=0.10; if(d.y>=d.targetY){d.y=d.targetY;d.vy=0;d.landed=true;} }
  }
  game.drops=game.drops.filter(d=>!d.picked&&d.t<15000);
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
  const attacking=f.state==='punch';
  const hx=attacking?38:24,hy=attacking?-18:-26;
  pxy(ctx,hx-6,hy-7,20,10,'#303740');pxy(ctx,hx-3,hy-4,14,4,'#969da5');
  pxy(ctx,hx-1,hy+2,5,26,'#65442f');pxy(ctx,hx,hy+3,2,23,'#c89059');
  ctx.restore();
}

function update(dt){
  game.time+=dt;
  updateDrops(dt);
  game.fighters.forEach(f=>updateFighter(f,dt));
  separateFighters();
  game.bursts.forEach(b=>b.t-=dt); game.bursts=game.bursts.filter(b=>b.t>0);
  const me=game.fighters[0];
  stockInfo.textContent=`${me.name} ${me.stocks}/5`;
  damageInfo.textContent=`${me.name} ${Math.round(me.damage)}%`;
  const eff=[];
  if(me.item==='hammer')eff.push(`망치 ${me.itemUses}회`);
  if(me.effects.invincible>0)eff.push(`무적 ${Math.ceil(me.effects.invincible/1000)}초`);
  if(me.effects.speed>0)eff.push(`속도UP ${Math.ceil(me.effects.speed/1000)}초`);
  if(me.effects.reverse>0)eff.push(`좌우반전 ${Math.ceil(me.effects.reverse/1000)}초`);
  buffInfo.textContent=eff.length?eff.join(' · '):'효과 없음';
  pressed.clear();
}

function draw(){
  drawMap(game.map);
  game.drops.forEach(drawDrop);
  const order=game.fighters.filter(f=>f.alive).sort((a,b)=>a.y-b.y);
  order.forEach(drawShadow);
  order.forEach(drawFighter);
  game.bursts.forEach(drawBurst);
  drawScore();
}

function drawShadow(f){
  ctx.fillStyle='rgba(0,0,0,.20)'; ctx.beginPath(); ctx.ellipse(f.x,f.y+8,17,6,0,0,Math.PI*2);ctx.fill();
}
function drawFighter(f){
  const y=f.y-f.z;
  drawAnimal(ctx,f.def,f.x,y,{facing:f.facing,action:f.state,t:f.stateTime,scale:2.05,flash:f.flash>0,inv:f.effects.invincible>0});
  const name = f.name;
  const dmg = `${Math.round(f.damage)}%`;
  ctx.save();
  ctx.font='bold 12px Arial';
  ctx.textAlign='center';
  const w = Math.max(ctx.measureText(name).width, ctx.measureText(dmg).width) + 14;
  const bx = Math.round(f.x - w/2);
  const by = Math.round(y - 72);
  ctx.fillStyle='rgba(27,22,20,.72)'; ctx.fillRect(bx, by, w, 28);
  ctx.strokeStyle='rgba(255,239,185,.55)'; ctx.lineWidth=1; ctx.strokeRect(bx+0.5, by+0.5, w-1, 27);
  ctx.fillStyle='#fff0a5'; ctx.fillText(name,f.x,by+11);
  ctx.fillStyle='#ffffff'; ctx.fillText(dmg,f.x,by+23);
  ctx.restore();
  if(f.item==='hammer') drawHeldHammer(f,y);
}

function pxy(g,x,y,w,h,c){g.fillStyle=c;g.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}

function drawAnimal(g,def,x,y,opt={}){
  const dir=opt.facing||1;
  const act=opt.action||'idle';
  const t=opt.t||0;
  const sc=(opt.scale||2) * (def.small?0.93:1);

  let bodyX=0, bodyY=0, headX=0, headY=0;
  let frontArmX=0, frontArmY=0, rearArmX=0, rearArmY=0;
  let frontLegX=0, frontLegY=0, rearLegX=0, rearLegY=0;
  let frontArmStretch=0, frontLegStretch=0, jumpLift=0, crouch=0, lean=0;
  let mouth='line', eye='normal', fallen=false;

  if(act==='idle'){
    const ph=[0,-1,0,-1][Math.floor(t/170)%4]; bodyY=ph; headY=ph;
  }
  if(act==='walk'){
    const cyc=[-2,0,2,0][Math.floor(t/100)%4];
    bodyY=Math.abs(cyc===0?0:1); headY=bodyY;
    frontLegX=cyc; rearLegX=-cyc; frontArmX=-cyc*0.45; rearArmX=cyc*0.4;
    frontLegY=Math.abs(cyc)*0.3; rearLegY=Math.abs(cyc)*0.3;
  }
  if(act==='jump'){
    jumpLift=5; bodyY=-2; headY=-2; crouch=2; frontLegY=-2; rearLegY=-2; frontArmY=-1; rearArmY=-1;
  }
  if(act==='punch'){
    const q=Math.min(1,t/165);
    bodyX=2*q; headX=1*q; lean=1*q; frontArmStretch=8*Math.sin(q*Math.PI*0.9); rearArmX=-1.5*q; frontLegX=1.5*q; mouth='open';
  }
  if(act==='kick'){
    const q=Math.min(1,t/190);
    bodyX=-1.2*q; headX=-0.8*q; lean=-1.5*q; frontLegStretch=11*Math.sin(q*Math.PI*0.82); rearLegX=-1.5*q; frontArmY=-0.5; rearArmY=0.5; mouth='open';
  }
  if(act==='jumpkick'){
    const q=Math.min(1,t/180);
    jumpLift=6; bodyY=-3; headY=-3; lean=1.2; frontLegStretch=12*Math.sin(q*Math.PI*0.82); rearLegY=-2; frontArmY=-2; rearArmY=-1; mouth='open';
  }
  if(act==='hurt'){
    bodyX=-2.5; headX=-1.5; lean=-1.3; frontArmY=-1; rearArmY=-1; frontLegX=1; rearLegX=-1; mouth='open'; eye='squint';
  }
  if(act==='down'){ fallen=true; mouth='open'; eye='squint'; }
  if(act==='getup'){ crouch=3-Math.min(3,t/90); mouth='open'; eye='squint'; }

  const O=opt.flash?'#fff6d8':def.outline;
  const F1=opt.inv?'#a8ebff':def.fur;
  const F2=opt.inv?'#d9f7ff':def.fur2;
  const L=def.light;
  const E=def.ear;
  const P=def.patch||def.ear;

  const breed=def.breed||def.kind;
  const headW = breed==='puppy'?13:(breed==='poodle'?12:11);
  const headH = breed==='puppy'?11:(breed==='poodle'?11:10);
  const bodyW = breed==='puppy'?10:(breed==='cat'?10:11);
  const bodyH = breed==='puppy'?8:(breed==='cat'?8:9);
  const legLen = breed==='puppy'?6:7;
  const bodyTop = -12 + bodyY + jumpLift*-1;
  const headTop = bodyTop - headH + 1 + headY;

  g.save();
  g.translate(Math.round(x), Math.round(y-jumpLift));
  g.scale(dir*sc, sc);

  if(fallen){
    // Cute lying pose facing the screen-right direction
    pxy(g,-10,-5,11,5,O); pxy(g,-9,-4,9,3,F1);
    pxy(g,-2,-7,8,7,O); pxy(g,-1,-6,6,5,F1);
    pxy(g,4,-6,6,5,O); pxy(g,5,-5,4,3,L);
    pxy(g,8,-5,2,2,O);
    if(def.kind==='dog'){ pxy(g,-3,-8,3,6,O); pxy(g,-2,-7,2,4,E); }
    else { pxy(g,-1,-10,3,4,O); pxy(g,0,-9,1,2,P); pxy(g,2,-10,3,4,O); pxy(g,3,-9,1,2,P); pxy(g,-10,-8,2,7,O); pxy(g,-9,-7,1,5,P); }
    pxy(g,1,-5,2,2,O); pxy(g,2,-4,1,1,'#141414');
    g.restore();
    return;
  }

  // tail behind body
  if(def.kind==='cat'){
    pxy(g,-10+bodyX,bodyTop-2,2,10,O); pxy(g,-9+bodyX,bodyTop-1,1,8,P);
    pxy(g,-12+bodyX,bodyTop+4,3,2,O); pxy(g,-11+bodyX,bodyTop+5,1,1,P);
  } else if(breed==='poodle'){
    pxy(g,-10+bodyX,bodyTop+2,4,6,O); pxy(g,-9+bodyX,bodyTop+3,2,4,E);
    pxy(g,-12+bodyX,bodyTop+1,4,4,O); pxy(g,-11+bodyX,bodyTop+2,2,2,E);
  } else {
    pxy(g,-10+bodyX,bodyTop+3,4,6,O); pxy(g,-9+bodyX,bodyTop+4,2,4,E);
    pxy(g,-12+bodyX,bodyTop+0,4,3,O); pxy(g,-11+bodyX,bodyTop+1,2,1,E);
  }

  // rear leg
  const rlx = -1 + bodyX + rearLegX*0.35;
  pxy(g,rlx,bodyTop+bodyH-1+rearLegY,3,legLen+1,O);
  pxy(g,rlx+1,bodyTop+bodyH+rearLegY,1,legLen-1,F1);
  pxy(g,rlx-1,bodyTop+bodyH+legLen-1+rearLegY,5,2,O);
  pxy(g,rlx,bodyTop+bodyH+legLen-1+rearLegY,3,1,L);

  // body blob
  pxy(g,-5+bodyX,bodyTop,bodyW,bodyH,O);
  pxy(g,-4+bodyX,bodyTop+1,bodyW-2,bodyH-2,F1);
  pxy(g,-1+bodyX,bodyTop+2,5,bodyH-3,L);
  if(def.kind==='cat'){ pxy(g,-3+bodyX,bodyTop+1,3,2,P); pxy(g,3+bodyX,bodyTop+3,2,2,P); }
  if(breed==='poodle'){ pxy(g,-5+bodyX,bodyTop+1,2,2,F2); pxy(g,3+bodyX,bodyTop+0,2,2,F2); }

  // rear arm (smaller/farther)
  const rax = -2 + bodyX + rearArmX*0.35;
  pxy(g,rax,bodyTop+1+rearArmY,3,6,O); pxy(g,rax+1,bodyTop+2+rearArmY,1,4,F1);
  pxy(g,rax-1,bodyTop+5+rearArmY,4,3,O); pxy(g,rax,bodyTop+6+rearArmY,2,1,F2);

  // head - larger than body, 3/4 semi-side facing right
  const hx = 1 + bodyX + headX;
  pxy(g,hx-6,headTop,headW,headH,O);
  pxy(g,hx-5,headTop+1,headW-2,headH-2,F2);
  // cheeks / face softness
  pxy(g,hx-4,headTop+headH-3,5,2,F1);

  if(def.kind==='cat'){
    pxy(g,hx-5,headTop-3,3,4,O); pxy(g,hx-4,headTop-2,1,2,P);
    pxy(g,hx,headTop-3,3,4,O); pxy(g,hx+1,headTop-2,1,2,P);
    pxy(g,hx-5,headTop+2,3,2,P);
  } else if(breed==='poodle'){
    pxy(g,hx-7,headTop+2,3,6,O); pxy(g,hx-6,headTop+3,1,4,E);
    pxy(g,hx-4,headTop-2,3,2,O); pxy(g,hx-3,headTop-1,1,1,F2);
    pxy(g,hx+2,headTop-2,3,2,O); pxy(g,hx+3,headTop-1,1,1,F2);
  } else {
    pxy(g,hx-7,headTop+2,3,7,O); pxy(g,hx-6,headTop+3,1,5,E);
  }

  // muzzle
  pxy(g,hx+2,headTop+4,5,4,O); pxy(g,hx+3,headTop+5,3,2,L);
  pxy(g,hx+5,headTop+4,2,2,O);
  // eyes - one main eye, one tiny hint for 3/4 view on some species
  if(eye==='squint'){
    pxy(g,hx+1,headTop+3,3,1,O);
  } else {
    pxy(g,hx,headTop+3,2,2,O); pxy(g,hx+1,headTop+3,1,1,'#ffffff');
    if(def.kind==='cat'){ pxy(g,hx-3,headTop+4,1,1,'#6a594f'); }
  }
  if(mouth==='open') pxy(g,hx+3,headTop+7,2,1,'#b3535b'); else pxy(g,hx+3,headTop+7,2,1,'#76524a');

  // front leg - obvious kick silhouette when extended
  const flx = 3 + bodyX + frontLegX*0.3;
  if(frontLegStretch>3){
    pxy(g,2+bodyX,bodyTop+bodyH-1,3,4,O); pxy(g,3+bodyX,bodyTop+bodyH,1,2,F2);
    pxy(g,5+bodyX,bodyTop+bodyH-1,Math.round(4+frontLegStretch*0.6),3,O);
    pxy(g,6+bodyX,bodyTop+bodyH,Math.round(2+frontLegStretch*0.6),1,F2);
    const tx = 7 + bodyX + Math.round(frontLegStretch*0.6);
    pxy(g,tx,bodyTop+bodyH-2,4,4,O); pxy(g,tx+1,bodyTop+bodyH-1,2,2,L);
  } else {
    pxy(g,flx,bodyTop+bodyH-1+frontLegY,3,legLen+1,O);
    pxy(g,flx+1,bodyTop+bodyH+frontLegY,1,legLen-1,F2);
    pxy(g,flx-1,bodyTop+bodyH+legLen-1+frontLegY,5,2,O);
    pxy(g,flx,bodyTop+bodyH+legLen-1+frontLegY,3,1,L);
  }

  // front arm - clear punch/fight pose
  const fax = 3 + bodyX + frontArmX*0.25;
  if(frontArmStretch>3){
    pxy(g,2+bodyX,bodyTop+1,3,4,O); pxy(g,3+bodyX,bodyTop+2,1,2,F2);
    pxy(g,5+bodyX,bodyTop+1,Math.round(3+frontArmStretch*0.65),3,O);
    pxy(g,6+bodyX,bodyTop+2,Math.round(1+frontArmStretch*0.65),1,F2);
    const tx = 7 + bodyX + Math.round(frontArmStretch*0.65);
    pxy(g,tx,bodyTop,4,4,O); pxy(g,tx+1,bodyTop+1,2,2,F2);
  } else {
    pxy(g,fax,bodyTop+1+frontArmY,3,6,O); pxy(g,fax+1,bodyTop+2+frontArmY,1,4,F2);
    pxy(g,fax-1,bodyTop+5+frontArmY,4,3,O); pxy(g,fax,bodyTop+6+frontArmY,2,1,F2);
  }

  // species-specific embellishment for silhouette
  if(breed==='poodle'){
    pxy(g,hx-6,headTop+1,2,2,F2); pxy(g,-5+bodyX,bodyTop+2,2,2,F2); pxy(g,5+bodyX,bodyTop+2,1,2,F2);
  }
  if(breed==='puppy'){
    pxy(g,hx-5,headTop+1,1,1,F2); pxy(g,hx+2,headTop+1,1,1,F2);
  }
  if(def.kind==='cat'){
    pxy(g,0+bodyX,bodyTop+bodyH-1,1,1,P);
  }

  if(opt.inv){ g.globalAlpha=.18; pxy(g,-12,-29,28,32,'#7feaff'); }
  g.restore();
}

function drawDrop(d){
  const x=d.x,y=d.y;
  ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.imageSmoothingEnabled=false;
  // drop shadow
  if(d.landed){ctx.fillStyle='rgba(0,0,0,.18)';ctx.beginPath();ctx.ellipse(0,12,14,5,0,0,Math.PI*2);ctx.fill();}
  if(d.type==='hammer'){
    pxy(ctx,-13,-12,26,12,'#303740');pxy(ctx,-9,-9,18,5,'#949ca6');pxy(ctx,-4,1,8,24,'#6f482f');pxy(ctx,-1,2,2,21,'#c68b56');
  } else if(d.type==='invincible'){
    pxy(ctx,-14,-14,28,28,'#4ac8ee');pxy(ctx,-10,-10,20,20,'#b9f6ff');pxy(ctx,-2,-8,4,16,'#ffffff');pxy(ctx,-8,-2,16,4,'#ffffff');
  } else if(d.type==='speed'){
    pxy(ctx,-10,-15,20,30,'#42503a');pxy(ctx,-8,-12,16,22,'#9ce66d');pxy(ctx,-5,-18,10,6,'#eee6c6');pxy(ctx,-2,-8,4,14,'#f7f1d2');
  } else if(d.type==='meat'){
    pxy(ctx,-15,-10,24,18,'#b84742');pxy(ctx,-12,-8,18,14,'#e36f63');pxy(ctx,8,-6,10,12,'#f1dfbb');pxy(ctx,10,-4,4,7,'#fff4db');
  } else if(d.type==='poop'){
    pxy(ctx,-13,6,26,8,'#5f412c');pxy(ctx,-10,-2,20,9,'#7b5234');pxy(ctx,-6,-9,12,8,'#95633c');pxy(ctx,-2,-14,5,6,'#a87548');
  }
  ctx.font='bold 12px Arial';ctx.textAlign='center';ctx.fillStyle='#fff4bd';ctx.strokeStyle='rgba(0,0,0,.65)';ctx.lineWidth=3;ctx.strokeText(items[d.type].name,0,-19);ctx.fillText(items[d.type].name,0,-19);
  ctx.restore();
}

function drawBurst(b){
  const p=1-b.t/240;ctx.save();ctx.translate(b.x,b.y);for(let i=0;i<6;i++){const a=i*Math.PI/3;pxy(ctx,Math.cos(a)*(6+p*10)-2,Math.sin(a)*(6+p*10)-2,5,5,'#ffd75d');}ctx.restore();
}

function drawScore(){
  ctx.save();ctx.font='bold 13px Arial';ctx.textAlign='right';let y=48;
  for(const f of game.fighters){ctx.fillStyle='rgba(35,31,29,.78)';ctx.fillRect(832,y-17,105,21);ctx.fillStyle='#fff';ctx.fillText(`${f.name} ${f.stocks}`,927,y-2);y+=24;}ctx.restore();
}

function drawMap(map){
  if(map.theme==='living')drawLiving(map.stage);
  if(map.theme==='bathroom')drawBathroom(map.stage);
  if(map.theme==='walkway')drawWalkway(map.stage);
  if(map.theme==='soccer')drawSoccer(map.stage);
}

function stageBase(s,outer1,outer2,floor,border){
  for(let y=0;y<H;y+=36){ctx.fillStyle=((y/36)%2)?outer1:outer2;ctx.fillRect(0,y,W,36);}
  // drop / out zone below stage is darker so ring-out is obvious
  ctx.fillStyle='rgba(21,20,24,.20)';ctx.fillRect(0,s.y+s.h+16,W,H-(s.y+s.h+16));
  ctx.fillStyle=border;ctx.fillRect(s.x-8,s.y-8,s.w+16,s.h+16);
  ctx.fillStyle='#4a3228';ctx.fillRect(s.x-4,s.y+s.h,s.w+8,14);
  ctx.fillStyle=floor;ctx.fillRect(s.x,s.y,s.w,s.h);
}
function drawLiving(s){
  stageBase(s,'#ddccab','#ead9b8','#d8b785','#7b563c');
  // wallpaper top and floor planks
  ctx.fillStyle='#f0dfbd';ctx.fillRect(0,0,W,126);for(let x=0;x<W;x+=70){ctx.fillStyle=(x/70)%2?'#e8d3ad':'#f2e3c6';ctx.fillRect(x,0,35,126);}ctx.fillStyle='#865d42';ctx.fillRect(0,120,W,8);
  // rug inside battle stage
  ctx.fillStyle='#9c6a4c';ctx.fillRect(s.x+110,s.y+50,s.w-220,s.h-94);ctx.fillStyle='#d6a06b';ctx.fillRect(s.x+122,s.y+62,s.w-244,s.h-118);
  // obvious sofa left
  ctx.fillStyle='#5f3b30';ctx.fillRect(48,200,188,126);ctx.fillStyle='#bd705a';ctx.fillRect(58,188,168,116);ctx.fillStyle='#d68a6b';ctx.fillRect(72,210,138,54);ctx.fillStyle='#f1d8a8';ctx.fillRect(82,218,42,30);ctx.fillRect(158,218,36,30);
  // coffee table
  ctx.fillStyle='#6e4a35';ctx.fillRect(250,292,132,24);ctx.fillStyle='#a87950';ctx.fillRect(260,314,112,58);ctx.fillStyle='#e8ca94';ctx.fillRect(307,278,18,20);
  // fireplace + mantel
  ctx.fillStyle='#6c4632';ctx.fillRect(386,52,228,26);ctx.fillStyle='#9b6949';ctx.fillRect(410,78,180,104);ctx.fillStyle='#4a3027';ctx.fillRect(454,108,92,66);ctx.fillStyle='#f0a343';ctx.fillRect(487,126,24,42);ctx.fillStyle='#ffd56c';ctx.fillRect(495,116,10,54);
  // TV right
  ctx.fillStyle='#5b4235';ctx.fillRect(690,224,214,94);ctx.fillStyle='#8b6c53';ctx.fillRect(702,242,190,64);ctx.fillStyle='#41475a';ctx.fillRect(733,120,130,104);ctx.fillStyle='#8db3bd';ctx.fillRect(747,134,102,74);ctx.fillStyle='#b6db8e';ctx.fillRect(771,172,54,22);
  // bookshelf upper left
  ctx.fillStyle='#5f3d2e';ctx.fillRect(66,66,192,116);ctx.fillStyle='#8b5d40';ctx.fillRect(76,76,172,96);for(let y=96;y<160;y+=28){ctx.fillStyle='#5f3d2e';ctx.fillRect(84,y,154,5);}const bc=['#7ba17b','#c16b51','#e2b363','#6d8db6','#8c6d9f'];for(let i=0;i<22;i++){ctx.fillStyle=bc[i%bc.length];ctx.fillRect(92+(i%11)*13,82+Math.floor(i/11)*48,8,19+(i%2)*4);}
  // stage label
  mapLabel('집 거실','SOFA · TV · FIREPLACE',s.x+18,s.y+24);
}
function drawBathroom(s){
  stageBase(s,'#c8d8df','#dce8ed','#d9e7ec','#6b91a4');
  for(let y=0;y<H;y+=42)for(let x=0;x<W;x+=42){ctx.strokeStyle='#b7c9d0';ctx.strokeRect(x,y,42,42);}
  // bathtub left
  ctx.fillStyle='#6f8e9a';ctx.fillRect(48,132,240,100);ctx.fillStyle='#f9fdff';ctx.fillRect(58,120,220,96);ctx.fillStyle='#8ec8d6';ctx.fillRect(76,146,184,50);ctx.fillStyle='#cfeef3';ctx.fillRect(90,154,54,15);
  // sink center back
  ctx.fillStyle='#7195a5';ctx.fillRect(407,72,146,24);ctx.fillStyle='#f7fbfc';ctx.fillRect(425,90,110,58);ctx.fillStyle='#799ba9';ctx.fillRect(472,148,18,70);ctx.fillStyle='#d6e9ee';ctx.fillRect(447,106,66,20);
  // toilet right
  ctx.fillStyle='#6f8f9f';ctx.fillRect(720,102,110,94);ctx.fillStyle='#f7fbfc';ctx.fillRect(730,92,90,90);ctx.fillStyle='#d4e5ea';ctx.fillRect(742,138,66,24);ctx.fillStyle='#f7fbfc';ctx.fillRect(748,178,58,68);
  // towel and shelf
  ctx.fillStyle='#697f8b';ctx.fillRect(595,72,82,10);ctx.fillStyle='#f1a9b3';ctx.fillRect(606,82,60,52);
  mapLabel('집 화장실','BATHTUB · SINK · TOILET',s.x+18,s.y+24);
}
function drawWalkway(s){
  stageBase(s,'#78a7c9','#8fb7d2','#a9abad','#595d61');
  // distant apartment blocks
  ctx.fillStyle='#a9c0cb';ctx.fillRect(0,0,W,120);for(let i=0;i<7;i++){ctx.fillStyle=i%2?'#879eab':'#93abb8';ctx.fillRect(30+i*140,18,95,102);for(let yy=32;yy<106;yy+=24)for(let xx=45+i*140;xx<110+i*140;xx+=26){ctx.fillStyle='#dce7c7';ctx.fillRect(xx,yy,12,12);}}
  // trees / flower bed
  ctx.fillStyle='#5a7e4a';ctx.fillRect(0,116,W,46);for(let x=30;x<W;x+=130){ctx.fillStyle='#6a4b30';ctx.fillRect(x+18,58,16,76);ctx.fillStyle='#4e8f4e';ctx.fillRect(x,38,54,36);ctx.fillStyle='#64a45e';ctx.fillRect(x+10,26,42,34);}
  // sidewalk markings
  for(let x=s.x+25;x<s.x+s.w-30;x+=68){ctx.fillStyle='#d9d9d4';ctx.fillRect(x,s.y+s.h/2-5,38,10);}
  // bench and planters
  ctx.fillStyle='#604832';ctx.fillRect(58,264,156,22);ctx.fillRect(72,286,12,42);ctx.fillRect(188,286,12,42);ctx.fillStyle='#8d6b43';ctx.fillRect(70,246,132,14);
  ctx.fillStyle='#4d6a3e';ctx.fillRect(752,278,150,48);ctx.fillStyle='#6eaa55';ctx.fillRect(770,248,26,36);ctx.fillRect(812,238,30,46);ctx.fillRect(858,254,24,30);
  mapLabel('아파트 산책로','APARTMENT · BENCH · FLOWERBED',s.x+18,s.y+24);
}
function drawSoccer(s){
  stageBase(s,'#6fbe65','#7bc971','#59aa51','#eef5e7');
  for(let x=s.x;x<s.x+s.w;x+=60){ctx.fillStyle=((x-s.x)/60)%2?'rgba(255,255,255,.045)':'rgba(0,0,0,.035)';ctx.fillRect(x,s.y,60,s.h);}
  ctx.strokeStyle='#f3f7ef';ctx.lineWidth=4;ctx.strokeRect(s.x+18,s.y+18,s.w-36,s.h-36);ctx.beginPath();ctx.arc(s.x+s.w/2,s.y+s.h/2,52,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(s.x+s.w/2,s.y+18);ctx.lineTo(s.x+s.w/2,s.y+s.h-18);ctx.stroke();
  // goals
  ctx.strokeStyle='#f7f7f7';ctx.lineWidth=7;ctx.strokeRect(28,196,82,110);ctx.strokeRect(850,196,82,110);ctx.strokeStyle='rgba(255,255,255,.45)';ctx.lineWidth=2;for(let y=204;y<300;y+=18){ctx.beginPath();ctx.moveTo(34,y);ctx.lineTo(104,y);ctx.stroke();ctx.beginPath();ctx.moveTo(856,y);ctx.lineTo(926,y);ctx.stroke();}
  // stands / scoreboard
  ctx.fillStyle='#39483a';ctx.fillRect(375,42,210,60);ctx.fillStyle='#202620';ctx.fillRect(390,54,180,36);ctx.fillStyle='#ffd766';ctx.fillRect(456,64,48,16);
  mapLabel('축구 잔디밭','GOAL · CENTER LINE · SCOREBOARD',s.x+18,s.y+24);
}
function mapLabel(title,sub,x,y){
  ctx.save();ctx.font='bold 16px Arial';ctx.fillStyle='rgba(28,26,24,.72)';ctx.fillRect(x-8,y-20,250,42);ctx.fillStyle='#fff7d6';ctx.fillText(title,x,y-3);ctx.font='bold 10px Arial';ctx.fillStyle='#f1d490';ctx.fillText(sub,x,y+13);ctx.restore();
}

function loop(now){
  if(!running||!game)return;
  const dt=Math.min(32,now-game.last||16.67);game.last=now;update(dt);draw();requestAnimationFrame(loop);
}

buildMenu();
