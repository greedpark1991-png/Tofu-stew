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
    key:'jjigae', name:'찌개', subtitle:'갈색 말티푸 · 동글동글한 기본 체형', kind:'dog',
    fur:'#b77a49', fur2:'#d39a63', light:'#efd0a0', ear:'#9b633c', outline:'#38231b', eye:'#191614', small:false
  },
  {
    key:'mandu', name:'만두', subtitle:'하얀 푸들 · 복슬복슬하고 말랑한 느낌', kind:'dog',
    fur:'#f4f1ed', fur2:'#ffffff', light:'#fffdfa', ear:'#ddd8d2', outline:'#393632', eye:'#171717', small:false
  },
  {
    key:'gamja', name:'감자', subtitle:'크림 말티푸 · 조금 더 작은 아기 버전', kind:'dog',
    fur:'#ead9a8', fur2:'#f7e9c2', light:'#fff3d3', ear:'#d2bb84', outline:'#403728', eye:'#171614', small:true
  },
  {
    key:'gucci', name:'구찌', subtitle:'주황+하양 코숏 · 선명한 주황 무늬', kind:'cat',
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
  drawAnimal(g, def, 26, 43, { facing:1, action:'idle', t:0, scale:1.7, preview:true });
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
      const min=23;
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
  drawAnimal(ctx,f.def,f.x,y,{facing:f.facing,action:f.state,t:f.stateTime,scale:2.25,flash:f.flash>0,inv:f.effects.invincible>0});
  ctx.save();ctx.textAlign='center';ctx.font='bold 12px Arial';ctx.lineWidth=3;ctx.strokeStyle='rgba(30,20,18,.7)';ctx.fillStyle='#fff0a5';
  ctx.strokeText(f.name,f.x,y-72);ctx.fillText(f.name,f.x,y-72);
  ctx.fillStyle='#fff';ctx.strokeText(`${Math.round(f.damage)}%`,f.x,y-58);ctx.fillText(`${Math.round(f.damage)}%`,f.x,y-58);ctx.restore();
  if(f.item==='hammer') drawHeldHammer(f,y);
}

function pxy(g,x,y,w,h,c){g.fillStyle=c;g.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}

function drawAnimal(g,def,x,y,opt={}){
  const dir=opt.facing||1; const t=opt.t||0; const act=opt.action||'idle'; const sc=(opt.scale||2)*(def.small?0.9:1);
  let bodyX=0, bodyY=0, headX=0, headY=0, frontArm=0, rearArm=0, frontLeg=0, rearLeg=0, crouch=0, mouth=false, fallen=false;
  if(act==='idle') bodyY=[0,-1,0,-1][Math.floor(t/180)%4];
  if(act==='walk'){const k=[-1,0,1,0][Math.floor(t/105)%4];bodyY=Math.abs(k);frontLeg=k*2;rearLeg=-k*2;frontArm=-k*1.3;rearArm=k*1.3;}
  if(act==='jump'){bodyY=-3;headY=-3;crouch=-1;frontLeg=-2;rearLeg=-2;frontArm=-1;rearArm=1;}
  if(act==='punch'){
    const q=clamp(t/170,0,1); bodyX=2*q;headX=1*q;frontArm=9*Math.sin(q*Math.PI*.75);rearArm=-1;mouth=true;
  }
  if(act==='kick'){
    const q=clamp(t/210,0,1);bodyX=-1*q;headX=-.5*q;frontLeg=10*Math.sin(q*Math.PI*.78);rearLeg=-2*q;frontArm=-1;rearArm=1;mouth=true;
  }
  if(act==='jumpkick'){
    const q=clamp(t/190,0,1);bodyY=-4;headY=-4;bodyX=1;frontLeg=11*Math.sin(q*Math.PI*.82);rearLeg=-3;frontArm=-2;rearArm=1;mouth=true;
  }
  if(act==='hurt'){bodyX=-3;headX=-2;frontArm=1;rearArm=-2;frontLeg=1;rearLeg=-1;mouth=true;}
  if(act==='down')fallen=true;
  if(act==='getup'){crouch=4-clamp(t/80,0,4);mouth=true;}

  const outline=opt.flash?'#fff7d5':def.outline;
  const fur=opt.inv?'#a7eaff':def.fur;
  const fur2=opt.inv?'#d9f8ff':def.fur2;
  const light=def.light;
  const ear=def.ear;
  const patch=def.patch;
  const unit=1;
  g.save();g.translate(Math.round(x),Math.round(y));g.scale(dir*sc,sc);

  if(fallen){
    // compact curled-up fallen pose
    pxy(g,-10,-8,18,8,outline);pxy(g,-9,-7,16,6,fur);
    pxy(g,4,-10,8,8,outline);pxy(g,5,-9,6,6,fur2);
    if(def.kind==='dog'){pxy(g,4,-9,2,5,ear);}else{pxy(g,5,-12,2,4,outline);pxy(g,6,-11,1,2,patch||ear);}
    pxy(g,9,-6,4,3,outline);pxy(g,10,-5,2,1,'#171717');
    pxy(g,-8,-2,6,3,outline);pxy(g,-7,-1,4,1,light);
    g.restore();return;
  }

  // tail, soft body silhouette first
  if(def.kind==='dog'){
    pxy(g,-9+bodyX,-9+bodyY,5,7,outline);pxy(g,-8+bodyX,-8+bodyY,3,5,ear);
    pxy(g,-11+bodyX,-11+bodyY,4,4,outline);pxy(g,-10+bodyX,-10+bodyY,2,2,ear);
  } else {
    pxy(g,-9+bodyX,-12+bodyY,3,10,outline);pxy(g,-8+bodyX,-11+bodyY,1,8,patch);
    pxy(g,-10+bodyX,-4+bodyY,4,3,outline);pxy(g,-9+bodyX,-3+bodyY,2,1,patch);
  }

  // rear leg attached to body
  pxy(g,-3+bodyX+rearLeg*.16,7+bodyY,5,9,outline);pxy(g,-2+bodyX+rearLeg*.16,8+bodyY,3,7,fur);
  pxy(g,-4+bodyX+rearLeg*.5,14+bodyY,7,4,outline);pxy(g,-3+bodyX+rearLeg*.5,15+bodyY,5,2,light);

  // torso: round 2.5-head chibi mass
  pxy(g,-7+bodyX,-7+bodyY+crouch*.35,14,16,outline);
  pxy(g,-6+bodyX,-6+bodyY+crouch*.35,12,14,fur);
  pxy(g,-2+bodyX,-1+bodyY+crouch*.35,6,8,light);
  if(def.kind==='cat'){pxy(g,-5+bodyX,-5+bodyY,4,3,patch);pxy(g,3+bodyX,1+bodyY,3,3,patch);}

  // rear arm attached from shoulder
  pxy(g,-5+bodyX+rearArm*.2,-5+bodyY,5,9,outline);pxy(g,-4+bodyX+rearArm*.2,-4+bodyY,3,7,fur);
  pxy(g,-6+bodyX+rearArm*.55,2+bodyY,6,5,outline);pxy(g,-5+bodyX+rearArm*.55,3+bodyY,4,3,fur2);

  // head: large profile, snout clearly to the right
  pxy(g,-8+bodyX+headX,-20+bodyY+headY+crouch*.2,16,14,outline);
  pxy(g,-7+bodyX+headX,-19+bodyY+headY+crouch*.2,14,12,fur2);
  if(def.kind==='dog'){
    pxy(g,-9+bodyX+headX,-18+bodyY+headY,5,9,outline);pxy(g,-8+bodyX+headX,-17+bodyY+headY,3,7,ear);
  } else {
    pxy(g,-7+bodyX+headX,-23+bodyY+headY,4,5,outline);pxy(g,-6+bodyX+headX,-22+bodyY+headY,2,3,patch);
    pxy(g,2+bodyX+headX,-23+bodyY+headY,4,5,outline);pxy(g,3+bodyX+headX,-22+bodyY+headY,2,3,patch);
    pxy(g,-7+bodyX+headX,-19+bodyY+headY,5,4,patch);
  }
  // muzzle connected, not robotic
  pxy(g,4+bodyX+headX,-15+bodyY+headY,7,7,outline);pxy(g,5+bodyX+headX,-14+bodyY+headY,5,5,light);
  pxy(g,9+bodyX+headX,-13+bodyY+headY,3,3,outline);pxy(g,10+bodyX+headX,-12+bodyY+headY,1,1,'#151515');
  // big expressive eye
  pxy(g,2+bodyX+headX,-17+bodyY+headY,3,3,outline);pxy(g,3+bodyX+headX,-16+bodyY+headY,1,1,def.kind==='cat'?def.eye:'#fff');
  if(mouth) pxy(g,6+bodyX+headX,-9+bodyY+headY,4,2,'#a94e4d'); else pxy(g,7+bodyX+headX,-9+bodyY+headY,2,1,'#76504a');

  // front leg: attached to pelvis, obvious kick silhouette when extended
  if(frontLeg>4){
    pxy(g,2+bodyX,6+bodyY,5,5,outline);pxy(g,3+bodyX,7+bodyY,3,3,fur2);
    pxy(g,5+bodyX,8+bodyY,5+frontLeg*.55,5,outline);pxy(g,6+bodyX,9+bodyY,3+frontLeg*.55,3,fur2);
    pxy(g,9+bodyX+frontLeg*.55,7+bodyY,6,6,outline);pxy(g,10+bodyX+frontLeg*.55,8+bodyY,4,4,light);
  } else {
    pxy(g,2+bodyX+frontLeg*.12,7+bodyY,5,9,outline);pxy(g,3+bodyX+frontLeg*.12,8+bodyY,3,7,fur2);
    pxy(g,1+bodyX+frontLeg*.48,14+bodyY,7,4,outline);pxy(g,2+bodyX+frontLeg*.48,15+bodyY,5,2,light);
  }

  // front arm: attached shoulder -> forearm -> paw/fist
  if(frontArm>4){
    pxy(g,3+bodyX,-4+bodyY,5,6,outline);pxy(g,4+bodyX,-3+bodyY,3,4,fur2);
    pxy(g,6+bodyX,-3+bodyY,4+frontArm*.58,5,outline);pxy(g,7+bodyX,-2+bodyY,2+frontArm*.58,3,fur2);
    pxy(g,9+bodyX+frontArm*.58,-4+bodyY,6,6,outline);pxy(g,10+bodyX+frontArm*.58,-3+bodyY,4,4,fur2);
  } else {
    pxy(g,3+bodyX+frontArm*.18,-5+bodyY,5,9,outline);pxy(g,4+bodyX+frontArm*.18,-4+bodyY,3,7,fur2);
    pxy(g,4+bodyX+frontArm*.5,2+bodyY,6,5,outline);pxy(g,5+bodyX+frontArm*.5,3+bodyY,4,3,fur2);
  }

  if(opt.inv){ g.globalAlpha=.18; pxy(g,-11,-23,26,42,'#7feaff'); }
  g.restore();
}

function drawDrop(d){
  const x=d.x,y=d.y;
  ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.imageSmoothingEnabled=false;
  // drop shadow
  if(d.landed){ctx.fillStyle='rgba(0,0,0,.18)';ctx.beginPath();ctx.ellipse(0,12,14,5,0,0,Math.PI*2);ctx.fill();}
  const s=2;
  if(d.type==='hammer'){
    pxy(ctx,-10,-10,20,10,'#303740');pxy(ctx,-7,-7,14,4,'#949ca6');pxy(ctx,-3,0,6,21,'#6f482f');pxy(ctx,-1,1,2,19,'#c68b56');
  } else if(d.type==='invincible'){
    pxy(ctx,-11,-11,22,22,'#4ac8ee');pxy(ctx,-8,-8,16,16,'#b9f6ff');pxy(ctx,-2,-7,4,14,'#ffffff');pxy(ctx,-7,-2,14,4,'#ffffff');
  } else if(d.type==='speed'){
    pxy(ctx,-8,-13,16,26,'#42503a');pxy(ctx,-6,-10,12,18,'#9ce66d');pxy(ctx,-4,-15,8,5,'#eee6c6');pxy(ctx,-2,-7,4,12,'#f7f1d2');
  } else if(d.type==='meat'){
    pxy(ctx,-13,-8,22,16,'#b84742');pxy(ctx,-10,-6,16,12,'#e36f63');pxy(ctx,7,-5,8,10,'#f1dfbb');pxy(ctx,9,-3,4,6,'#fff4db');
  } else if(d.type==='poop'){
    pxy(ctx,-11,5,22,7,'#5f412c');pxy(ctx,-8,-2,16,8,'#7b5234');pxy(ctx,-5,-8,10,7,'#95633c');pxy(ctx,-2,-12,5,5,'#a87548');
  }
  ctx.font='bold 11px Arial';ctx.textAlign='center';ctx.fillStyle='#fff4bd';ctx.strokeStyle='rgba(0,0,0,.65)';ctx.lineWidth=3;ctx.strokeText(items[d.type].name,0,-19);ctx.fillText(items[d.type].name,0,-19);
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
