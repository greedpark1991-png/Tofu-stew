(() => {
'use strict';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const choose = arr => arr[(Math.random() * arr.length) | 0];
const rectOverlap = (a,b) => a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;

const CHARACTERS = {
  jjigae: {
    id:'jjigae', name:'찌개', species:'갈색 말티푸', tag:'든든한 기본형',
    desc:'무난한 무게와 힘. 처음 잡아도 편한 갈색 말티푸.',
    speed:300, jump:760, weight:1.02, power:1.00, renderH:110,
    tint:'#b98153'
  },
  mandu: {
    id:'mandu', name:'만두', species:'하얀 푸들', tag:'복슬복슬 생존형',
    desc:'조금 묵직해서 멀리 덜 날아간다. 복슬복슬 버티는 맛.',
    speed:286, jump:735, weight:1.13, power:.98, renderH:108,
    tint:'#f5f2eb'
  },
  gamja: {
    id:'gamja', name:'감자', species:'크림 토이푸들', tag:'작은 우다다',
    desc:'네 마리 중 가장 작고 빠르다. 가볍지만 우다다 추격이 강점.',
    speed:338, jump:790, weight:.84, power:.93, renderH:82,
    tint:'#efd09c'
  },
  gucci: {
    id:'gucci', name:'구찌', species:'주황+흰 코숏', tag:'날렵한 냥펀치',
    desc:'빠른 발과 살짝 강한 타격. 고양이답게 휙 치고 빠진다.',
    speed:322, jump:780, weight:.94, power:1.04, renderH:101,
    tint:'#f2a14f'
  }
};

const MAPS = {
  living: {id:'living', name:'폭신폭신 거실', emoji:'🛋️', note:'소파가 통통 튕긴다', bg:'#f7d9b9', floor:'#d69b74'},
  bath: {id:'bath', name:'미끌미끌 화장실', emoji:'🛁', note:'가끔 변기 바람이 분다', bg:'#d9f2ff', floor:'#9bd7e8'},
  walk: {id:'walk', name:'아파트 산책로', emoji:'🌳', note:'스프링클러가 푸슉', bg:'#dff0cb', floor:'#b89976'},
  soccer: {id:'soccer', name:'동네 축구장', emoji:'⚽', note:'공이 굴러오면 다 날아감', bg:'#d9f1c4', floor:'#82bc68'}
};

const ITEMS = {
  hammer:{id:'hammer',name:'망치',icon:'🔨',desc:'다음 3번 공격 강화'},
  meat:{id:'meat',name:'고기',icon:'🍖',desc:'누적 데미지 -25%'},
  snack:{id:'snack',name:'스피드 간식',icon:'🦴',desc:'6초간 이동속도 상승'},
  star:{id:'star',name:'별사탕',icon:'⭐',desc:'3초간 무적'},
  poop:{id:'poop',name:'똥',icon:'💩',desc:'근처 상대 조작 혼란'},
  squeak:{id:'squeak',name:'삑삑이',icon:'🐤',desc:'주변에 충격파'}
};

const images = {};
function assetPath(id){ return `assets/characters/${id}.png`; }
function preloadAssets(){
  const tasks=[];
  Object.keys(CHARACTERS).forEach(id=>{
    const im=new Image(); images[id]=im;
    tasks.push(new Promise(resolve=>{im.onload=resolve; im.onerror=resolve;}));
    im.src=assetPath(id);
  });
  return Promise.all(tasks);
}


const el = id => document.getElementById(id);
const screens = ['homeScreen','selectScreen','gameScreen'];
function showScreen(id){ screens.forEach(s=>el(s).classList.toggle('active',s===id)); }

let selectedCharacter='jjigae';
let selectedMap='living';

function buildSelectUI(){
  const cc=el('characterCards'); cc.innerHTML='';
  Object.values(CHARACTERS).forEach(c=>{
    const b=document.createElement('button');
    b.className='character-card'+(c.id===selectedCharacter?' selected':'');
    b.dataset.id=c.id;
    b.innerHTML=`<img src="${assetPath(c.id)}" alt="${c.name}"><b>${c.name}</b><small>${c.tag}</small>`;
    b.addEventListener('click',()=>selectCharacter(c.id));
    cc.appendChild(b);
  });
  const mc=el('mapCards'); mc.innerHTML='';
  Object.values(MAPS).forEach(m=>{
    const b=document.createElement('button');
    b.className='map-card'+(m.id===selectedMap?' selected':'');
    b.dataset.id=m.id;
    b.innerHTML=`<span class="emoji">${m.emoji}</span><b>${m.name}</b><small>${m.note}</small>`;
    b.addEventListener('click',()=>{selectedMap=m.id; [...mc.children].forEach(x=>x.classList.toggle('selected',x.dataset.id===m.id));});
    mc.appendChild(b);
  });
  selectCharacter(selectedCharacter);
}
function selectCharacter(id){
  selectedCharacter=id; const c=CHARACTERS[id];
  document.querySelectorAll('.character-card').forEach(x=>x.classList.toggle('selected',x.dataset.id===id));
  el('featuredImage').src=assetPath(id);
  el('featuredName').textContent=c.name; el('featuredTag').textContent=c.tag; el('featuredDesc').textContent=c.desc;
}

class AudioKit {
  constructor(){this.ctx=null; this.enabled=true;}
  init(){ if(!this.ctx){ const C=window.AudioContext||window.webkitAudioContext; if(C) this.ctx=new C(); } if(this.ctx?.state==='suspended') this.ctx.resume(); }
  beep(freq=440,dur=.05,type='square',gain=.035,slide=0){
    if(!this.enabled) return; this.init(); if(!this.ctx) return;
    const t=this.ctx.currentTime,o=this.ctx.createOscillator(),g=this.ctx.createGain();
    o.type=type;o.frequency.setValueAtTime(freq,t); if(slide)o.frequency.linearRampToValueAtTime(Math.max(40,freq+slide),t+dur);
    g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    o.connect(g).connect(this.ctx.destination);o.start(t);o.stop(t+dur+.01);
  }
  hit(strong=false){this.beep(strong?120:180,strong?.11:.06,'square',strong?.07:.045,strong?-50:-20);}
  jump(){this.beep(350,.07,'square',.025,140)}
  dash(){this.beep(210,.05,'sawtooth',.025,-80)}
  pickup(){this.beep(600,.08,'square',.03,260)}
  ko(){this.beep(180,.22,'sawtooth',.055,-120)}
  squeak(){this.beep(780,.12,'square',.045,280)}
}
const audio = new AudioKit();

class Particle {
  constructor(x,y,type='spark',opts={}){
    this.x=x;this.y=y;this.type=type;this.life=opts.life||.45;this.max=this.life;
    this.vx=opts.vx??rand(-180,180);this.vy=opts.vy??rand(-220,-50);
    this.size=opts.size||rand(4,9);this.char=opts.char||'';this.rot=rand(0,TAU);this.spin=rand(-5,5);
  }
  update(dt){this.life-=dt;this.x+=this.vx*dt;this.y+=this.vy*dt;this.vy+=360*dt;this.rot+=this.spin*dt;}
  draw(ctx){const a=clamp(this.life/this.max,0,1);ctx.save();ctx.globalAlpha=a;ctx.translate(this.x,this.y);ctx.rotate(this.rot);
    if(this.type==='dust'){ctx.fillStyle='rgba(255,255,255,.8)';ctx.beginPath();ctx.arc(0,0,this.size,0,TAU);ctx.fill();}
    else if(this.type==='emoji'){ctx.font=`${this.size*2}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(this.char,0,0);}
    else {ctx.fillStyle='#fff4a8';ctx.strokeStyle='#684d3f';ctx.lineWidth=2;drawStar(ctx,0,0,this.size,this.size*.45,5);ctx.fill();ctx.stroke();}
    ctx.restore();}
}
function drawStar(ctx,x,y,r1,r2,n=5){ctx.beginPath();for(let i=0;i<n*2;i++){const a=-Math.PI/2+i*Math.PI/n,r=i%2?r2:r1;const px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();}

class ItemDrop {
  constructor(type,x,y){this.type=type;this.x=x;this.y=y;this.vy=-80;this.age=0;this.dead=false;this.w=46;this.h=46;}
  update(dt,game){this.age+=dt;this.vy+=800*dt;this.y+=this.vy*dt;const p=game.getGroundAt(this.x,this.y+23);if(p && this.y+23>p.y && this.vy>0){this.y=p.y-23;this.vy*=-.28;if(Math.abs(this.vy)<25)this.vy=0;}}
  draw(ctx){const it=ITEMS[this.type];const bob=Math.sin(this.age*4)*3;ctx.save();ctx.translate(this.x,this.y+bob);ctx.fillStyle='rgba(255,255,255,.9)';ctx.strokeStyle='#5b4c43';ctx.lineWidth=3;roundRect(ctx,-24,-24,48,48,14);ctx.fill();ctx.stroke();ctx.font='27px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(it.icon,0,1);ctx.restore();}
}

class Fighter {
  constructor(game,id,index,isHuman=false){
    const c=CHARACTERS[id];this.game=game;this.id=id;this.data=c;this.index=index;this.isHuman=isHuman;
    this.x=0;this.y=0;this.vx=0;this.vy=0;this.w=id==='gamja'?46:52;this.h=id==='gamja'?60:68;this.facing=index<2?1:-1;
    this.damage=0;this.stocks=3;this.grounded=false;this.dropTimer=0;this.hitstun=0;this.invuln=0;this.flash=0;this.dead=false;this.respawnTimer=0;
    this.attack=null;this.attackCooldown=0;this.dashCooldown=0;this.dashTimer=0;this.state='idle';this.stateT=0;
    this.speedBuff=0;this.reverse=0;this.hammerCharges=0;this.kos=0;this.falls=0;this.hits=0;this.aiTimer=0;this.aiDecision={left:false,right:false,jump:false,j:false,k:false,dash:false,down:false};
    this.spawn();
  }
  spawn(){const pos=this.game.spawnPoints[this.index%this.game.spawnPoints.length];this.x=pos.x;this.y=pos.y;this.vx=0;this.vy=0;this.damage=0;this.hitstun=0;this.invuln=2;this.attack=null;this.dashTimer=0;this.dead=false;this.respawnTimer=0;}
  hurtbox(){return {x:this.x-this.w/2,y:this.y-this.h,w:this.w,h:this.h};}
  input(){return this.isHuman?this.game.getHumanInput(this):this.getAIInput();}
  getAIInput(){
    this.aiTimer-=this.game.dt;
    if(this.aiTimer<=0){
      this.aiTimer=rand(.08,.19);
      const living=this.game.fighters.filter(f=>f!==this&&!f.dead&&f.stocks>0);
      let target=living.sort((a,b)=>Math.abs(a.x-this.x)-Math.abs(b.x-this.x))[0];
      const d={left:false,right:false,jump:false,j:false,k:false,dash:false,down:false};
      if(target){
        const dx=target.x-this.x,dy=target.y-this.y;
        if(dx<-30)d.left=true; if(dx>30)d.right=true;
        if(Math.abs(dx)>260&&Math.random()<.18)d.dash=true;
        if((dy<-85||this.nearEdge())&&this.grounded&&Math.random()<.55)d.jump=true;
        if(Math.abs(dx)<90&&Math.abs(dy)<80){ if(Math.random()<.58)d.j=true; else d.k=true; }
        if(Math.abs(dx)<150&&Math.random()<.05)d.jump=true;
      }
      const item=this.game.items.find(it=>Math.abs(it.x-this.x)<170);
      if(item&&Math.random()<.45){d.left=item.x<this.x;d.right=item.x>this.x;}
      if(this.reverse>0){const t=d.left;d.left=d.right;d.right=t;}
      this.aiDecision=d;
    }
    return this.aiDecision;
  }
  nearEdge(){const g=this.game.mainPlatform;return this.x<g.x+90||this.x>g.x+g.w-90;}
  startAttack(kind){
    if(this.attackCooldown>0||this.attack||this.hitstun>0||this.dead)return;
    const airborne=!this.grounded;
    if(kind==='j'){
      this.attack={kind:'quick',t:0,duration:.28,activeA:.07,activeB:.16,hit:new Set(),damage:5.8,baseKb:245,kbScale:3.7,strong:false};
      this.state='punch';this.attackCooldown=.30;
    }else{
      this.attack={kind:'strong',t:0,duration:.54,activeA:.17,activeB:.32,hit:new Set(),damage:11.8,baseKb:355,kbScale:5.4,strong:true};
      this.state=airborne?'jumpkick':'kick';this.attackCooldown=.64;
      this.vx*=.55;
    }
  }
  update(dt){
    if(this.dead){this.respawnTimer-=dt;if(this.respawnTimer<=0&&this.stocks>0)this.spawn();return;}
    this.stateT+=dt;this.invuln=Math.max(0,this.invuln-dt);this.flash=Math.max(0,this.flash-dt);this.hitstun=Math.max(0,this.hitstun-dt);this.attackCooldown=Math.max(0,this.attackCooldown-dt);this.dashCooldown=Math.max(0,this.dashCooldown-dt);this.dropTimer=Math.max(0,this.dropTimer-dt);this.speedBuff=Math.max(0,this.speedBuff-dt);this.reverse=Math.max(0,this.reverse-dt);this.dashTimer=Math.max(0,this.dashTimer-dt);
    const input=this.input();
    if(this.hitstun<=0){
      let dir=(input.right?1:0)-(input.left?1:0);
      if(this.reverse>0&&this.isHuman)dir*=-1;
      if(dir)this.facing=dir;
      const speed=this.data.speed*(this.speedBuff>0?1.35:1);
      const accel=this.grounded?2100:1250;
      if(this.dashTimer<=0){
        this.vx=approach(this.vx,dir*speed,accel*dt);
        if(!dir&&this.grounded)this.vx=approach(this.vx,0,2400*dt);
      }
      if(input.dash&&this.dashCooldown<=0){this.dashCooldown=.72;this.dashTimer=.14;this.vx=this.facing*650;this.game.burstDust(this.x,this.y);audio.dash();}
      if(input.jump&&this.grounded){this.vy=-this.data.jump;this.grounded=false;this.dropTimer=.08;audio.jump();this.game.burstDust(this.x,this.y);}
      if(input.down&&this.grounded&&this.game.isOnUpperPlatform(this)){this.dropTimer=.22;this.grounded=false;this.y+=6;this.vy=120;}
      if(!this.grounded&&input.up)this.vy-=360*dt;
      if(!this.grounded&&input.down)this.vy+=520*dt;
      if(input.j)this.startAttack('j');
      if(input.k)this.startAttack('k');
    }
    this.vy+=1880*dt;
    this.vx=clamp(this.vx,-900,900);this.vy=clamp(this.vy,-1050,1250);
    const prevBottom=this.y;this.x+=this.vx*dt;this.y+=this.vy*dt;
    this.grounded=false;
    if(this.dropTimer<=0&&this.vy>=0){
      const footY=this.y, prevFoot=prevBottom;
      let best=null;
      for(const p of this.game.platforms){
        if(this.x+this.w*.35>p.x&&this.x-this.w*.35<p.x+p.w&&prevFoot<=p.y+5&&footY>=p.y-2){if(!best||p.y<best.y)best=p;}
      }
      if(best){this.y=best.y;this.vy=0;this.grounded=true;}
    }
    this.game.applyMapHazard(this,dt);
    if(this.attack){
      this.attack.t+=dt;
      const a=this.attack;
      if(a.t>=a.activeA&&a.t<=a.activeB){
        const range=a.strong?88:72;const hb={x:this.facing>0?this.x+this.w*.25:this.x-range-this.w*.25,y:this.y-this.h*.88,w:range,h:this.h*.72};
        for(const other of this.game.fighters){
          if(other===this||other.dead||other.invuln>0||a.hit.has(other.index))continue;
          if(rectOverlap(hb,other.hurtbox())){a.hit.add(other.index);this.hitTarget(other,a);}
        }
      }
      if(a.t>=a.duration){this.attack=null;this.state=this.grounded?'idle':'jump';}
    } else this.state=this.grounded?'idle':'jump';
    if(this.y>900||this.x<-220||this.x>1500||this.y<-360)this.ringOut();
  }
  hitTarget(other,a){
    const hammer=this.hammerCharges>0;const mult=this.data.power*(hammer?1.35:1);const dmg=a.damage*mult;
    other.damage=Math.min(999,other.damage+dmg);
    const mag=(a.baseKb+other.damage*a.kbScale)*mult/other.data.weight;
    other.vx=this.facing*mag;other.vy=-(mag*.57+70);other.hitstun=clamp(.10+other.damage*.0025,.11,.42);other.flash=.09;
    this.hits++; this.game.lastAttacker.set(other.index,this.index); if(hammer)this.hammerCharges--;
    this.game.hitStop=a.strong?0.075:0.04;this.game.shake=a.strong?14:7;
    const icon=a.strong?'★':'✦';for(let i=0;i<(a.strong?9:5);i++)this.game.particles.push(new Particle((this.x+other.x)/2,other.y-other.h*.5,i%3===0?'emoji':'spark',{char:icon,size:rand(5,10)}));
    audio.hit(a.strong);
  }
  ringOut(){
    if(this.dead)return;this.stocks--;this.falls++;this.dead=true;this.respawnTimer=1.35;this.game.koFlash=1;this.game.shake=18;audio.ko();
    for(let i=0;i<10;i++)this.game.particles.push(new Particle(clamp(this.x,40,1240),clamp(this.y,40,680),'emoji',{char:choose(['💫','⭐','🐾']),size:rand(8,13),vx:rand(-220,220),vy:rand(-260,-90),life:.8}));
    const attacker=this.game.lastAttacker.get(this.index); if(attacker!=null){const f=this.game.fighters[attacker];if(f&&f!==this)f.kos++;}
    this.game.lastAttacker.delete(this.index);
  }
  draw(ctx){
    if(this.dead)return;
    const img=images[this.id];
    if(!img?.complete)return;
    const moveAmt=clamp(Math.abs(this.vx)/this.data.speed,0,1);
    const walkBob=this.grounded&&!this.attack?Math.sin(this.stateT*(7+moveAmt*5)+this.index)*2.4*moveAmt:0;
    const breathe=this.grounded&&!this.attack?Math.sin(this.stateT*3.2+this.index)*.018:0;
    let sx=1+breathe, sy=1-breathe*.7, rot=0, lunge=0, lift=0;
    if(!this.grounded){sy*=1.035;sx*=.975;rot=-this.facing*.035;lift=-3;}
    if(this.dashTimer>0){sx*=1.16;sy*=.9;rot=this.facing*.025;lunge=10;}
    if(this.attack){
      const a=this.attack, t=a.t;
      if(a.kind==='quick'){
        if(t<a.activeA){const q=t/a.activeA;sx*=lerp(.96,1.0,q);sy*=lerp(1.05,1,q);rot=-this.facing*lerp(.10,.03,q);lunge=lerp(-5,2,q);}
        else if(t<=a.activeB){const q=(t-a.activeA)/(a.activeB-a.activeA);sx*=1.14;sy*=.92;rot=this.facing*lerp(.07,.15,q);lunge=lerp(13,22,q);lift=-2;}
        else {const q=clamp((t-a.activeB)/(a.duration-a.activeB),0,1);sx*=lerp(1.10,1,q);sy*=lerp(.94,1,q);rot=this.facing*lerp(.11,0,q);lunge=lerp(14,0,q);}
      } else {
        if(t<a.activeA){const q=t/a.activeA;sx*=lerp(.93,.97,q);sy*=lerp(1.07,1.03,q);rot=-this.facing*lerp(.14,.07,q);lunge=lerp(-8,-3,q);}
        else if(t<=a.activeB){const q=(t-a.activeA)/(a.activeB-a.activeA);sx*=1.22;sy*=.87;rot=this.facing*lerp(.15,.25,q);lunge=lerp(18,31,q);lift=-5;}
        else {const q=clamp((t-a.activeB)/(a.duration-a.activeB),0,1);sx*=lerp(1.15,1,q);sy*=lerp(.91,1,q);rot=this.facing*lerp(.18,0,q);lunge=lerp(20,0,q);}
      }
    }
    if(this.hitstun>0){rot=-this.facing*.16;sx*=1.06;sy*=.94;lift=-5;}
    const h=this.data.renderH*sy, w=this.data.renderH*(img.naturalWidth/img.naturalHeight)*sx;
    ctx.save();ctx.translate(Math.round(this.x+this.facing*lunge),Math.round(this.y+walkBob+lift));ctx.rotate(rot);ctx.scale(this.facing,1);
    if(this.invuln>0)ctx.globalAlpha=.58+.42*(Math.sin(this.invuln*28)>.0);
    if(this.flash>0){ctx.shadowColor='#fff';ctx.shadowBlur=20;}
    ctx.drawImage(img,-w/2,-h,w,h);
    ctx.restore();
    if(this.isHuman&&!this.dead){ctx.save();ctx.fillStyle='#fff7ad';ctx.strokeStyle='#5b4c43';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(this.x,this.y-this.h-34);ctx.lineTo(this.x-8,this.y-this.h-48);ctx.lineTo(this.x+8,this.y-this.h-48);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();}
    if(this.hammerCharges>0){ctx.font='20px system-ui';ctx.textAlign='center';ctx.fillText('🔨'.repeat(Math.min(this.hammerCharges,3)),this.x,this.y-this.h-22);}
  }
}

class Game {
  constructor(canvas){
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.ctx.imageSmoothingEnabled=false;this.W=canvas.width;this.H=canvas.height;
    this.keys=new Set();this.pressed=new Set();this.fighters=[];this.items=[];this.particles=[];this.running=false;this.paused=false;this.last=0;this.dt=0;this.hitStop=0;this.shake=0;this.koFlash=0;this.itemTimer=7;this.hazardTimer=0;this.soccerBall=null;this.lastAttacker=new Map();
    this.spawnPoints=[{x:350,y:440},{x:530,y:440},{x:750,y:440},{x:930,y:440}];
    this.mainPlatform={x:145,y:570,w:990,h:34};this.platforms=[];
    this.boundLoop=t=>this.loop(t);
    addEventListener('keydown',e=>this.onKey(e,true));addEventListener('keyup',e=>this.onKey(e,false));
  }
  onKey(e,down){
    const code=e.code;if(['KeyW','KeyA','KeyS','KeyD','Space','KeyJ','KeyK','ShiftLeft','ShiftRight','Escape'].includes(code))e.preventDefault();
    if(down&&!this.keys.has(code))this.pressed.add(code); if(down)this.keys.add(code);else this.keys.delete(code);
    if(down&&code==='Escape'&&this.running){this.togglePause();}
  }
  getHumanInput(){
    const down=c=>this.keys.has(c),press=c=>this.pressed.has(c);
    return {left:down('KeyA'),right:down('KeyD'),up:down('KeyW'),down:down('KeyS'),jump:press('Space'),j:press('KeyJ'),k:press('KeyK'),dash:press('ShiftLeft')||press('ShiftRight')};
  }
  setup(mapId,playerId){
    this.map=MAPS[mapId];this.platforms=this.makePlatforms(mapId);this.mainPlatform=this.platforms[0];this.items=[];this.particles=[];this.lastAttacker.clear();this.itemTimer=6;this.hazardTimer=0;this.soccerBall=null;this.koFlash=0;this.shake=0;
    const ids=[playerId,...Object.keys(CHARACTERS).filter(x=>x!==playerId)];
    this.fighters=ids.map((id,i)=>new Fighter(this,id,i,i===0));
    this.updateHUD();el('mapLabel').textContent=`${this.map.emoji} ${this.map.name} · 3 STOCK`;
  }
  makePlatforms(id){
    if(id==='living')return [{x:125,y:575,w:1030,h:34},{x:265,y:445,w:220,h:18},{x:795,y:425,w:245,h:18}];
    if(id==='bath')return [{x:120,y:575,w:1040,h:34},{x:340,y:458,w:205,h:18},{x:760,y:458,w:205,h:18}];
    if(id==='walk')return [{x:135,y:575,w:1010,h:34},{x:245,y:455,w:185,h:18},{x:840,y:455,w:185,h:18}];
    return [{x:110,y:575,w:1060,h:34},{x:360,y:450,w:180,h:18},{x:740,y:450,w:180,h:18}];
  }
  start(mapId,playerId){
    this.setup(mapId,playerId);this.running=true;this.paused=false;this.last=performance.now();showScreen('gameScreen');el('pauseOverlay').classList.add('hidden');el('resultOverlay').classList.add('hidden');
    this.countdown();requestAnimationFrame(this.boundLoop);
  }
  countdown(){this.paused=true;const c=el('countdown');c.classList.remove('hidden');let n=3;c.textContent=n;const timer=setInterval(()=>{n--;if(n>0)c.textContent=n;else if(n===0)c.textContent='멍냥!';else{clearInterval(timer);c.classList.add('hidden');this.paused=false;this.last=performance.now();}},650);}
  togglePause(){if(!this.running)return;this.paused=!this.paused;el('pauseOverlay').classList.toggle('hidden',!this.paused);if(!this.paused)this.last=performance.now();}
  loop(now){
    if(!this.running)return;let dt=Math.min(.033,(now-this.last)/1000||.016);this.last=now;this.dt=dt;
    if(!this.paused){
      if(this.hitStop>0){this.hitStop-=dt;dt=0;}else this.update(dt);
    }
    this.draw();this.pressed.clear();requestAnimationFrame(this.boundLoop);
  }
  update(dt){
    this.dt=dt;this.itemTimer-=dt;this.shake=Math.max(0,this.shake-45*dt);this.koFlash=Math.max(0,this.koFlash-dt*3);
    if(this.itemTimer<=0&&this.items.length<2){this.spawnItem();this.itemTimer=rand(9,13);}
    this.updateHazards(dt);
    for(const f of this.fighters)f.update(dt);
    for(const f of this.fighters){if(f.dead)continue;for(const it of this.items){if(it.dead)continue;const box={x:it.x-23,y:it.y-23,w:46,h:46};if(rectOverlap(f.hurtbox(),box)){it.dead=true;this.applyItem(f,it.type);}}}
    this.items.forEach(x=>x.update(dt,this));this.items=this.items.filter(x=>!x.dead);
    this.particles.forEach(p=>p.update(dt));this.particles=this.particles.filter(p=>p.life>0);
    this.trackAttackers();this.updateHUD();this.checkWinner();
  }
  trackAttackers(){
    for(const target of this.fighters){ if(target.dead)continue; for(const attacker of this.fighters){ if(attacker===target||!attacker.attack)continue; if(attacker.attack.hit.has(target.index))this.lastAttacker.set(target.index,attacker.index); } }
  }
  getGroundAt(x,y){let best=null;for(const p of this.platforms){if(x>p.x&&x<p.x+p.w&&y<=p.y+34){if(!best||p.y<best.y)best=p;}}return best;}
  isOnUpperPlatform(f){return this.platforms.slice(1).some(p=>Math.abs(f.y-p.y)<3&&f.x>p.x&&f.x<p.x+p.w);}
  spawnItem(){const p=choose(this.platforms);const type=choose(Object.keys(ITEMS));const x=rand(p.x+50,p.x+p.w-50),y=p.y-70;this.items.push(new ItemDrop(type,x,y));}
  applyItem(f,type){audio.pickup();const it=ITEMS[type];this.toast(`${f.data.name} : ${it.icon} ${it.name}!`);
    if(type==='hammer')f.hammerCharges=Math.min(5,f.hammerCharges+3);
    else if(type==='meat')f.damage=Math.max(0,f.damage-25);
    else if(type==='snack')f.speedBuff=6;
    else if(type==='star')f.invuln=Math.max(f.invuln,3);
    else if(type==='poop'){
      const others=this.fighters.filter(x=>x!==f&&!x.dead&&Math.abs(x.x-f.x)<300);others.forEach(x=>x.reverse=Math.max(x.reverse,4.5));
      for(let i=0;i<10;i++)this.particles.push(new Particle(f.x,f.y-f.h*.5,'emoji',{char:'💩',size:8,life:.65}));
    } else if(type==='squeak'){
      audio.squeak();for(const o of this.fighters){if(o===f||o.dead||o.invuln>0)continue;const dx=o.x-f.x;if(Math.abs(dx)<210&&Math.abs(o.y-f.y)<130){o.damage+=7;o.vx=Math.sign(dx||1)*(310+o.damage*3.4)/o.data.weight;o.vy=-300;o.hitstun=.18;this.lastAttacker.set(o.index,f.index);}}
      this.shake=10;for(let i=0;i<16;i++)this.particles.push(new Particle(f.x,f.y-40,'emoji',{char:'♪',size:rand(6,10),vx:Math.cos(i/16*TAU)*240,vy:Math.sin(i/16*TAU)*180,life:.6}));
    }
  }
  toast(text){const t=el('toast');t.textContent=text;t.classList.remove('hidden');clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>t.classList.add('hidden'),1200);}
  burstDust(x,y){for(let i=0;i<5;i++)this.particles.push(new Particle(x+rand(-20,20),y-6,'dust',{vx:rand(-100,100),vy:rand(-90,-30),life:.32,size:rand(5,10)}));}
  applyMapHazard(f,dt){
    if(this.map.id==='living'){
      const couch={x:882,y:530,w:190,h:45};if(f.grounded&&f.x>couch.x&&f.x<couch.x+couch.w&&Math.abs(f.y-this.mainPlatform.y)<4&&Math.abs(f.vx)>110){f.vy=-620;f.grounded=false;this.burstDust(f.x,f.y);}
    }
    if(this.map.id==='bath'&&this.hazardTimer>7.5&&this.hazardTimer<9.8&&f.y>360){f.vx-=235*dt;}
    if(this.map.id==='walk'&&this.hazardTimer>6.2&&this.hazardTimer<7.8&&f.x>585&&f.x<705&&f.y>380){f.vy-=580*dt;f.vx+=(f.x<645?-1:1)*120*dt;}
    if(this.map.id==='soccer'&&this.soccerBall){const b=this.soccerBall;if(Math.hypot(f.x-b.x,(f.y-28)-b.y)<48&&b.cooldowns[f.index]<=0){b.cooldowns[f.index]=.7;f.damage+=4;const dir=Math.sign(b.vx)||1;f.vx=dir*(300+f.damage*2.8)/f.data.weight;f.vy=-260;f.hitstun=.14;this.shake=6;audio.hit(false);}}
  }
  updateHazards(dt){
    this.hazardTimer+=dt;if(this.hazardTimer>12)this.hazardTimer=0;
    if(this.map.id==='soccer'){
      if(!this.soccerBall&&this.hazardTimer>8.2){this.soccerBall={x:-60,y:535,vx:420,cooldowns:[0,0,0,0]};}
      if(this.soccerBall){const b=this.soccerBall;b.x+=b.vx*dt;b.y=535+Math.sin(b.x*.035)*4;b.cooldowns=b.cooldowns.map(x=>Math.max(0,x-dt));if(b.x>1340)this.soccerBall=null;}
    }
  }
  checkWinner(){const alive=this.fighters.filter(f=>f.stocks>0);if(alive.length<=1&&this.running&&!el('resultOverlay').classList.contains('showing')){const winner=alive[0]||this.fighters.slice().sort((a,b)=>b.stocks-a.stocks||a.falls-b.falls)[0];setTimeout(()=>this.finish(winner),650);el('resultOverlay').classList.add('showing');}}
  finish(winner){if(!this.running)return;this.paused=true;el('winnerImage').src=assetPath(winner.id);el('winnerTitle').textContent=`${winner.data.name} 승리!`;el('winnerText').textContent=winner.isHuman?'오늘의 사고뭉치는 바로 너.':'BOT이 신나게 사고를 쳤다.';
    el('resultStats').innerHTML=this.fighters.map(f=>`<div class="stat-pill">${f.data.name}<br>KO ${f.kos} · 낙사 ${f.falls}</div>`).join('');el('resultOverlay').classList.remove('hidden');}
  updateHUD(){const h=el('hud');h.innerHTML=this.fighters.map(f=>{const buff=[];if(f.hammerCharges)buff.push(`🔨${f.hammerCharges}`);if(f.speedBuff>0)buff.push('🦴FAST');if(f.invuln>0&&f.invuln<1.95)buff.push('⭐SAFE');if(f.reverse>0)buff.push('💩???');return `<div class="hud-card ${f.isHuman?'player':''} ${f.stocks<=0?'ko':''}"><img src="${assetPath(f.id)}" alt="${f.data.name}"><div class="hud-info"><b>${f.data.name}${f.isHuman?' · YOU':''}</b><div class="damage">${Math.round(f.damage)}%</div><div class="buffs">${buff.join(' ')}</div></div><div class="stocks">${'●'.repeat(Math.max(0,f.stocks))}${'○'.repeat(Math.max(0,3-f.stocks))}</div></div>`;}).join('');}
  draw(){
    const ctx=this.ctx;ctx.save();const sx=this.shake?rand(-this.shake,this.shake):0,sy=this.shake?rand(-this.shake*.5,this.shake*.5):0;ctx.translate(sx,sy);this.drawMap(ctx);
    for(const it of this.items)it.draw(ctx);
    if(this.soccerBall)this.drawSoccerBall(ctx,this.soccerBall);
    for(const f of this.fighters)f.draw(ctx);
    for(const p of this.particles)p.draw(ctx);
    ctx.restore();if(this.koFlash>0){ctx.fillStyle=`rgba(255,255,255,${this.koFlash*.42})`;ctx.fillRect(0,0,this.W,this.H);} }
  drawMap(ctx){
    const id=this.map.id;
    if(id==='living')this.drawLiving(ctx);else if(id==='bath')this.drawBath(ctx);else if(id==='walk')this.drawWalk(ctx);else this.drawSoccer(ctx);
    for(let i=1;i<this.platforms.length;i++)this.drawUpperPlatform(ctx,this.platforms[i],i);
  }
  drawUpperPlatform(ctx,p,i){
    ctx.save();ctx.lineWidth=4;ctx.strokeStyle='#5b4c43';
    if(this.map.id==='living'){
      ctx.fillStyle=i===1?'#bd835e':'#d59a73';roundRect(ctx,p.x,p.y,p.w,p.h,8);ctx.fill();ctx.stroke();
      ctx.fillStyle='rgba(255,242,210,.32)';ctx.fillRect(p.x+12,p.y+5,p.w-24,4);
      ctx.fillStyle='#7f5a46';ctx.fillRect(p.x+18,p.y+p.h,10,64);ctx.fillRect(p.x+p.w-28,p.y+p.h,10,64);
    }else if(this.map.id==='bath'){
      ctx.fillStyle='#f8fdff';roundRect(ctx,p.x,p.y,p.w,p.h,9);ctx.fill();ctx.stroke();
      ctx.fillStyle='#a5ddec';roundRect(ctx,p.x+14,p.y+5,p.w-28,7,4);ctx.fill();
      ctx.strokeStyle='#8dbfce';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(p.x+20,p.y+p.h);ctx.lineTo(p.x+20,p.y+p.h+48);ctx.moveTo(p.x+p.w-20,p.y+p.h);ctx.lineTo(p.x+p.w-20,p.y+p.h+48);ctx.stroke();
    }else if(this.map.id==='walk'){
      ctx.fillStyle='#aa7654';roundRect(ctx,p.x,p.y,p.w,p.h,7);ctx.fill();ctx.stroke();
      ctx.fillStyle='#d4a272';ctx.fillRect(p.x+10,p.y+5,p.w-20,4);ctx.fillStyle='#74513e';ctx.fillRect(p.x+18,p.y+p.h,10,58);ctx.fillRect(p.x+p.w-28,p.y+p.h,10,58);
    }else{
      ctx.fillStyle='#f4f0d2';roundRect(ctx,p.x,p.y,p.w,p.h,8);ctx.fill();ctx.stroke();
      ctx.fillStyle='#79ae65';ctx.fillRect(p.x+10,p.y+5,p.w-20,5);ctx.fillStyle='#5e6658';ctx.fillRect(p.x+22,p.y+p.h,9,54);ctx.fillRect(p.x+p.w-31,p.y+p.h,9,54);
    }
    ctx.restore();
  }
  drawLiving(ctx){
    const g=ctx.createLinearGradient(0,0,0,720);g.addColorStop(0,'#dff2ff');g.addColorStop(.58,'#fbe7ce');g.addColorStop(1,'#d8b58f');ctx.fillStyle=g;ctx.fillRect(0,0,1280,720);
    ctx.fillStyle='#fff8ea';ctx.fillRect(0,0,1280,420);ctx.strokeStyle='#d9c7ae';ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(0,420);ctx.lineTo(1280,420);ctx.stroke();
    ctx.fillStyle='#cfe6f4';ctx.strokeStyle='#6a584d';ctx.lineWidth=5;roundRect(ctx,95,85,260,190,18);ctx.fill();ctx.stroke();ctx.fillStyle='#fff6c7';ctx.fillRect(120,110,210,140);
    ctx.fillStyle='#efb58c';ctx.strokeStyle='#6a584d';roundRect(ctx,850,455,260,120,34);ctx.fill();ctx.stroke();ctx.fillStyle='#f7caa8';roundRect(ctx,870,420,220,75,30);ctx.fill();ctx.stroke();
    ctx.fillStyle='#f0d5a9';ctx.beginPath();ctx.ellipse(640,585,360,60,0,0,TAU);ctx.fill();ctx.strokeStyle='#be8e6c';ctx.lineWidth=5;ctx.stroke();
    drawPlant(ctx,1160,385);this.drawMainPlatform(ctx,'#b98566');
  }
  drawBath(ctx){
    ctx.fillStyle='#daf3ff';ctx.fillRect(0,0,1280,720);for(let x=0;x<1280;x+=90){for(let y=0;y<440;y+=90){ctx.strokeStyle='rgba(89,145,164,.25)';ctx.lineWidth=2;ctx.strokeRect(x,y,90,90);}}
    ctx.fillStyle='#fff';ctx.strokeStyle='#5e6a6f';ctx.lineWidth=5;roundRect(ctx,120,150,260,180,34);ctx.fill();ctx.stroke();ctx.fillStyle='#9edcf0';roundRect(ctx,140,175,220,120,24);ctx.fill();
    ctx.fillStyle='#fff';ctx.strokeStyle='#5e6a6f';roundRect(ctx,980,350,145,150,30);ctx.fill();ctx.stroke();ctx.fillStyle='#d7eef8';ctx.beginPath();ctx.ellipse(1050,388,54,24,0,0,TAU);ctx.fill();ctx.stroke();
    if(this.hazardTimer>7.5&&this.hazardTimer<9.8){ctx.globalAlpha=.45;ctx.font='42px system-ui';for(let x=930;x>180;x-=130)ctx.fillText('💨',x,500);ctx.globalAlpha=1;}
    this.drawMainPlatform(ctx,'#8ccfe0');
  }
  drawWalk(ctx){
    const g=ctx.createLinearGradient(0,0,0,720);g.addColorStop(0,'#cde9ff');g.addColorStop(.55,'#dcefc8');g.addColorStop(1,'#b5d48d');ctx.fillStyle=g;ctx.fillRect(0,0,1280,720);
    ctx.fillStyle='#9cc66d';ctx.fillRect(0,350,1280,370);for(let i=0;i<8;i++)drawTree(ctx,60+i*175,350+((i%2)*18),.8+(i%3)*.08);
    ctx.fillStyle='#cfb18f';ctx.beginPath();ctx.moveTo(0,510);ctx.quadraticCurveTo(640,440,1280,520);ctx.lineTo(1280,720);ctx.lineTo(0,720);ctx.closePath();ctx.fill();
    drawBench(ctx,245,492);drawBench(ctx,880,492);
    if(this.hazardTimer>6.2&&this.hazardTimer<7.8){ctx.strokeStyle='#b8ebff';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(645,575);ctx.quadraticCurveTo(590,470,560,410);ctx.moveTo(645,575);ctx.quadraticCurveTo(700,470,730,410);ctx.stroke();ctx.font='28px system-ui';ctx.fillText('💦',548,425);ctx.fillText('💦',720,425);}
    this.drawMainPlatform(ctx,'#aa8767');
  }
  drawSoccer(ctx){
    ctx.fillStyle='#d8f0ff';ctx.fillRect(0,0,1280,720);ctx.fillStyle='#87c86a';ctx.fillRect(0,320,1280,400);for(let x=0;x<1280;x+=160){ctx.fillStyle=(x/160)%2?'#7fbd64':'#91ce72';ctx.fillRect(x,320,160,400);}ctx.strokeStyle='rgba(255,255,255,.8)';ctx.lineWidth=7;ctx.beginPath();ctx.arc(640,540,120,0,TAU);ctx.moveTo(640,420);ctx.lineTo(640,700);ctx.stroke();
    ctx.strokeStyle='#6b655e';ctx.lineWidth=8;ctx.strokeRect(60,360,160,120);ctx.strokeRect(1060,360,160,120);this.drawMainPlatform(ctx,'#77b55d');
  }
  drawMainPlatform(ctx,color){const p=this.mainPlatform;ctx.fillStyle=color;ctx.strokeStyle='#5b4c43';ctx.lineWidth=5;roundRect(ctx,p.x,p.y,p.w,p.h,14);ctx.fill();ctx.stroke();ctx.fillStyle='rgba(255,255,255,.22)';roundRect(ctx,p.x+7,p.y+5,p.w-14,8,4);ctx.fill();}
  drawSoccerBall(ctx,b){ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.x*.025);ctx.fillStyle='#fff';ctx.strokeStyle='#4f4a45';ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,28,0,TAU);ctx.fill();ctx.stroke();ctx.fillStyle='#4f4a45';drawStar(ctx,0,0,10,5,5);ctx.fill();ctx.restore();}
}

function approach(v,target,delta){if(v<target)return Math.min(target,v+delta);if(v>target)return Math.max(target,v-delta);return target;}
function roundRect(ctx,x,y,w,h,r){r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function drawTree(ctx,x,y,s=1){ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.fillStyle='#8d674d';ctx.fillRect(-10,-80,20,90);ctx.fillStyle='#7fbd68';ctx.strokeStyle='#5b654f';ctx.lineWidth=4;for(const [dx,dy,r] of [[-24,-86,38],[22,-90,34],[0,-120,42]]){ctx.beginPath();ctx.arc(dx,dy,r,0,TAU);ctx.fill();ctx.stroke();}ctx.restore();}
function drawPlant(ctx,x,y){ctx.save();ctx.translate(x,y);ctx.fillStyle='#d99b69';ctx.strokeStyle='#6a584d';ctx.lineWidth=4;roundRect(ctx,-34,0,68,70,14);ctx.fill();ctx.stroke();ctx.strokeStyle='#6fa86f';ctx.lineWidth=9;for(let i=-2;i<=2;i++){ctx.beginPath();ctx.moveTo(0,4);ctx.quadraticCurveTo(i*24,-50-Math.abs(i)*8,i*26,-78);ctx.stroke();}ctx.restore();}
function drawBench(ctx,x,y){ctx.save();ctx.translate(x,y);ctx.fillStyle='#b5835d';ctx.strokeStyle='#604b3e';ctx.lineWidth=4;roundRect(ctx,0,-55,155,24,8);ctx.fill();ctx.stroke();roundRect(ctx,0,-22,155,24,8);ctx.fill();ctx.stroke();ctx.fillRect(14,0,12,42);ctx.fillRect(128,0,12,42);ctx.restore();}

const game=new Game(el('gameCanvas'));

el('toSelectBtn').addEventListener('click',()=>{audio.init();buildSelectUI();showScreen('selectScreen');});
el('backHomeBtn').addEventListener('click',()=>showScreen('homeScreen'));
el('startBtn').addEventListener('click',()=>{audio.init();game.start(selectedMap,selectedCharacter);});
el('pauseBtn').addEventListener('click',()=>game.togglePause());
el('resumeBtn').addEventListener('click',()=>game.togglePause());
el('quitBtn').addEventListener('click',()=>{game.running=false;game.paused=false;el('pauseOverlay').classList.add('hidden');showScreen('selectScreen');});
el('rematchBtn').addEventListener('click',()=>{el('resultOverlay').classList.add('hidden');el('resultOverlay').classList.remove('showing');game.running=false;setTimeout(()=>game.start(selectedMap,selectedCharacter),20);});
el('changeBtn').addEventListener('click',()=>{game.running=false;game.paused=false;el('resultOverlay').classList.add('hidden');el('resultOverlay').classList.remove('showing');showScreen('selectScreen');});

preloadAssets().then(()=>buildSelectUI());

// Small test hooks for automated smoke tests only.
window.__BRAWLER__={CHARACTERS,MAPS,ITEMS,assetPath,getState:()=>({running:game.running,paused:game.paused,fighters:game.fighters.map(f=>({id:f.id,stocks:f.stocks,damage:f.damage,state:f.state}))})};
})();
