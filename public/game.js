const socket = io();
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const screens = { home:$('#home'), lobby:$('#lobby'), game:$('#game') };
const canvas = $('#gameCanvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const chars = {
  jjigae:{name:'찌개',kind:'maltipoo',body:'#8b5a3c',dark:'#8b5a3c',light:'#8b5a3c',accent:'#8b5a3c',desc:'갈색 말티푸'},
  mandu:{name:'만두',kind:'white_maltipoo',body:'#f3efe4',dark:'#f3efe4',light:'#f3efe4',accent:'#f3efe4',desc:'하얀 말티푸(푸들 느낌)'},
  gamja:{name:'감자',kind:'toy_poodle',body:'#f1d19b',dark:'#f1d19b',light:'#f1d19b',accent:'#f1d19b',desc:'크림 토이푸들'},
  gucci:{name:'구찌',kind:'cat',body:'#f5f0e6',dark:'#de7e34',light:'#ffffff',accent:'#a95c2a',desc:'하양 바탕 주황무늬 코숏'},
};

let me = null, room = null, state = null, effects = [], lastT = performance.now();
let input = {left:false,right:false,up:false,down:false,punch:false,kick:false,jump:false};
let selectedChar = 'jjigae';
let audioReady = false;
let audioCtx = null;
let currentBgm = null;
const prevPlayerStates = new Map();
const bgm = {
  lobby: new Audio('/audio/Cold_Bell_Impact.mp3'),
  game: new Audio('/audio/The_Rooftop_Bout.mp3'),
};
Object.values(bgm).forEach(a => { a.loop = true; a.preload = 'auto'; a.volume = 0.34; });
const urlRoom = new URLSearchParams(location.search).get('room');
if (urlRoom) $('#roomInput').value = urlRoom.toUpperCase().slice(0,5);
$('#nameInput').value = localStorage.getItem('petBrawlName') || '';

function show(name){ Object.values(screens).forEach(s=>s.classList.remove('active')); screens[name].classList.add('active'); syncBgm(name); }
function setError(sel,msg=''){ $(sel).textContent=msg; }
function currentName(){ const n=$('#nameInput').value.trim()||'PLAYER'; localStorage.setItem('petBrawlName',n); return n; }

function ensureAudioReady(){
  if(!audioCtx){
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if(Ctx) audioCtx=new Ctx();
  }
  if(audioCtx?.state==='suspended') audioCtx.resume();
  if(!audioReady){
    audioReady=true;
    syncBgm(document.querySelector('.screen.active')?.id||'home');
  }
}
function stopAllBgm(){ Object.values(bgm).forEach(a=>{ a.pause(); a.currentTime=0; }); currentBgm=null; }
function playBgm(which){
  if(!audioReady || !bgm[which]) return;
  const next=bgm[which];
  if(currentBgm===next) return;
  Object.values(bgm).forEach(a=>{ if(a!==next) a.pause(); });
  next.currentTime = next.currentTime || 0;
  next.play().catch(()=>{});
  currentBgm=next;
}
function syncBgm(screenName){
  if(!audioReady) return;
  if(screenName==='game' && state?.status && state.status!=='lobby') playBgm('game');
  else if(screenName==='lobby' || screenName==='home') playBgm('lobby');
}
function beep(freq,dur,type='square',vol=0.03,slideTo=null){
  if(!audioCtx) return;
  const t=audioCtx.currentTime;
  const osc=audioCtx.createOscillator();
  const gain=audioCtx.createGain();
  osc.type=type; osc.frequency.setValueAtTime(freq,t);
  if(slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo,t+dur);
  gain.gain.setValueAtTime(0.0001,t);
  gain.gain.exponentialRampToValueAtTime(vol,t+0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t); osc.stop(t+dur+0.02);
}
function noiseBurst(dur=0.06,vol=0.025,highpass=500){
  if(!audioCtx) return;
  const len=Math.max(1,Math.floor(audioCtx.sampleRate*dur));
  const buf=audioCtx.createBuffer(1,len,audioCtx.sampleRate);
  const data=buf.getChannelData(0);
  for(let i=0;i<len;i++) data[i]=(Math.random()*2-1)*(1-i/len);
  const src=audioCtx.createBufferSource(); src.buffer=buf;
  const filter=audioCtx.createBiquadFilter(); filter.type='highpass'; filter.frequency.value=highpass;
  const gain=audioCtx.createGain(); const t=audioCtx.currentTime;
  gain.gain.setValueAtTime(vol,t); gain.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  src.connect(filter).connect(gain).connect(audioCtx.destination);
  src.start(t);
}
function playSfx(kind){
  if(!audioReady) return;
  if(kind==='jump'){ beep(420,0.09,'square',0.03,620); }
  else if(kind==='punch'){ noiseBurst(0.045,0.02,900); beep(180,0.06,'sawtooth',0.02,120); }
  else if(kind==='kick'){ noiseBurst(0.06,0.024,700); beep(220,0.08,'triangle',0.025,130); }
  else if(kind==='hit'){ noiseBurst(0.08,0.03,450); beep(130,0.08,'square',0.03,80); }
  else if(kind==='ko'){ noiseBurst(0.12,0.035,300); beep(100,0.18,'sawtooth',0.035,55); }
}
addEventListener('pointerdown', ensureAudioReady, { once:true });
addEventListener('keydown', ensureAudioReady, { once:true });

function buildCharacterCards(){
  const root=$('#characterGrid'); root.innerHTML='';
  for(const [id,c] of Object.entries(chars)){
    const card=document.createElement('div'); card.className='character-card'; card.dataset.char=id;
    card.innerHTML=`<canvas class="char-canvas" width="180" height="132"></canvas><b>${c.name}</b><small>${c.desc}</small>`;
    card.onclick=()=>{ if(card.classList.contains('taken'))return; selectedChar=id; socket.emit('setCharacter',{character:id}); renderLobby(); };
    root.appendChild(card);
    const pctx=card.querySelector('canvas').getContext('2d'); pctx.imageSmoothingEnabled=false;
    pctx.fillStyle='#1a1820';pctx.fillRect(0,0,180,132); drawPet(pctx,c,90,88,0,'idle',1,2.3,false);
  }
}
buildCharacterCards();

$('#createBtn').onclick=()=>{ ensureAudioReady();
  setError('#homeError');
  socket.emit('createRoom',{name:currentName(),character:selectedChar},res=>{
    if(!res.ok)return setError('#homeError',res.error); me=res.you; room=res.room; history.replaceState(null,'',`?room=${room.code}`); show('lobby'); renderLobby();
  });
};
$('#joinBtn').onclick=()=>{ ensureAudioReady();
  setError('#homeError');
  const roomCode=$('#roomInput').value.trim().toUpperCase();
  socket.emit('joinRoom',{roomCode,name:currentName(),character:selectedChar},res=>{
    if(!res.ok)return setError('#homeError',res.error); me=res.you; room=res.room; history.replaceState(null,'',`?room=${room.code}`); show('lobby'); renderLobby();
  });
};
$('#copyBtn').onclick=async()=>{ ensureAudioReady();
  const link=`${location.origin}${location.pathname}?room=${room.code}`;
  try{await navigator.clipboard.writeText(link);$('#copyBtn').textContent='복사 완료!';setTimeout(()=>$('#copyBtn').textContent='초대 링크 복사',1100)}catch{prompt('이 링크를 복사해줘',link)}
};
$('#readyBtn').onclick=()=>{ ensureAudioReady();
  const p=room.players.find(p=>p.id===me); socket.emit('setReady',{ready:!p.ready});
};
$('#startBtn').onclick=()=>{ ensureAudioReady(); socket.emit('startGame',{},res=>{if(!res.ok)setError('#lobbyError',res.error)}); };
$('#lobbyBtn').onclick=()=>{ ensureAudioReady(); stopAllBgm(); socket.emit('backToLobby'); };
$$('.map-btn').forEach(b=>b.onclick=()=>socket.emit('setMap',{mapId:b.dataset.map}));

socket.on('lobbyUpdate',r=>{ room=r; if(r.status==='lobby'){show('lobby');renderLobby()} });
socket.on('gameStarted',()=>{ show('game'); $('#lobbyBtn').classList.add('hidden'); playBgm('game'); });
socket.on('returnedToLobby',r=>{room=r;state=null;show('lobby');renderLobby(); playBgm('lobby');});
socket.on('matchEnded',()=>{ if(room?.hostId===me) $('#lobbyBtn').classList.remove('hidden'); });
socket.on('state',s=>{
  state=s;
  if(s.events) for(const e of s.events){
    effects.push({...e,t:0,life:e.type==='hit'?.35:.75});
    if(e.type==='hit') playSfx('hit');
    if(e.type==='stockLost' || e.reason==='hp' || e.reason==='ringout') playSfx('ko');
  }
  if(s.players){
    for(const p of s.players){
      const prev=prevPlayerStates.get(p.id);
      if(prev!==p.state){
        if(p.state==='jump') playSfx('jump');
        if(p.state==='punch') playSfx('punch');
        if(p.state==='kick' || p.state==='airkick') playSfx('kick');
      }
      prevPlayerStates.set(p.id,p.state);
    }
  }
  if(s.status==='countdown'||s.status==='playing'||s.status==='finished') { show('game'); playBgm('game'); }
});

function renderLobby(){
  if(!room)return;
  $('#roomCode').textContent=room.code;
  const p=room.players.find(p=>p.id===me); if(p)selectedChar=p.character;
  const taken=new Set(room.players.filter(p=>p.id!==me).map(p=>p.character));
  $$('.character-card').forEach(card=>{
    card.classList.toggle('selected',card.dataset.char===selectedChar);
    card.classList.toggle('taken',taken.has(card.dataset.char));
  });
  $$('.map-btn').forEach(b=>{b.classList.toggle('selected',b.dataset.map===room.mapId);b.disabled=room.hostId!==me});
  const list=$('#playerList');list.innerHTML='';
  room.players.forEach((pl,i)=>{
    const c=chars[pl.character]; const row=document.createElement('div'); row.className='player-row'; row.style.borderLeftColor=c.body;
    row.innerHTML=`<div class="player-dot" style="background:${c.body}"></div><div><b>${pl.name}${pl.id===room.hostId?' ★':''}</b><small> · ${c.name}</small></div><b>${pl.id===room.hostId?'HOST':pl.ready?'READY':'WAIT'}</b>`;list.appendChild(row);
  });
  $('#readyBtn').style.display=room.hostId===me?'none':'inline-block';
  $('#readyBtn').textContent=p?.ready?'준비 취소':'준비';
  $('#startBtn').style.display=room.hostId===me?'inline-block':'none';
  setError('#lobbyError');
}

const keyMap={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',KeyZ:'punch',KeyX:'kick',Space:'jump'};
addEventListener('keydown',e=>{const k=keyMap[e.code];if(!k)return;e.preventDefault();if(!input[k]){input[k]=true;sendInput()}});
addEventListener('keyup',e=>{const k=keyMap[e.code];if(!k)return;e.preventDefault();input[k]=false;sendInput()});
function sendInput(){socket.emit('input',input)}
setInterval(()=>{if(state?.status==='playing')sendInput()},100);



function pxRect(c,x,y,w,h,color,scale=1){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.round(w*scale),Math.round(h*scale))}
function square(c,x,y,s,color){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),s,s)}
function petPalette(ch){return chars[ch]||chars.jjigae}
function backLegOffset(stateName){return (stateName==='walk'||stateName==='jump') ? 1 : 0}
function frontLegOffset(stateName){return (stateName==='walk'||stateName==='jump') ? -1 : 0}
function drawPet(c,p,x,y,z,stateName,faceDir,scale=1,invuln=false){
  c.save();
  c.translate(Math.round(x),Math.round(y-z));
  c.scale(scale,scale);
  if(invuln && Math.floor(performance.now()/70)%2===0)c.globalAlpha=.35;
  const dir=faceDir>=0?1:-1;
  if(p.kind==='cat') drawCat(c,p,dir,stateName);
  else if(p.kind==='toy_poodle') drawToyPoodle(c,p,dir,stateName);
  else if(p.kind==='white_maltipoo') drawWhiteMaltipoo(c,p,dir,stateName);
  else drawBrownMaltipoo(c,p,dir,stateName);
  drawFace(c,p,dir,stateName);
  drawAttackLimbs(c,p,dir,stateName);
  c.restore();
}
function drawBrownMaltipoo(c,p,d,s){
  const headX=d>0?-11:-13, muzzleX=d>0?8:-13, earBackX=d>0?-15:9, earFrontX=d>0?2:-8;
  c.fillStyle=p.body;
  c.fillRect(-10,-6,25,18); c.fillRect(headX,-24,22,18); c.fillRect(muzzleX,-14,8,7);
  c.fillRect(earBackX,-20,7,13); c.fillRect(earFrontX,-18,7,12);
  c.fillRect(-8,10+backLegOffset(s),5,6); c.fillRect(3,10,6,6); c.fillRect(10,9+frontLegOffset(s),5,7);
  c.fillRect(d>0?-18:15,-4,6,5); c.fillRect(d>0?-21:18,-2,4,5);
}
function drawWhiteMaltipoo(c,p,d,s){
  const headX=d>0?-11:-13, muzzleX=d>0?8:-13, earBackX=d>0?-15:9, earFrontX=d>0?3:-8;
  c.fillStyle=p.body;
  c.fillRect(-10,-7,25,18); c.fillRect(headX,-24,22,18); c.fillRect(muzzleX,-14,8,7);
  [[headX-2,-28,7,7],[headX+4,-30,9,9],[headX+12,-28,7,7],[earBackX,-19,8,13],[earFrontX,-17,7,11]].forEach(r=>c.fillRect(...r));
  c.fillRect(-8,10+backLegOffset(s),5,6); c.fillRect(3,10,6,6); c.fillRect(10,9+frontLegOffset(s),5,7);
  c.fillRect(d>0?-18:15,-5,6,5); c.fillRect(d>0?-21:18,-6,5,5);
}
function drawToyPoodle(c,p,d,s){
  const headX=d>0?-10:-13, muzzleX=d>0?8:-12;
  c.fillStyle=p.body;
  [[headX-2,-30,8,8],[headX+4,-32,10,10],[headX+12,-30,8,8],[headX-5,-23,7,13],[headX+12,-21,7,13],[-8,-10,8,8],[2,-11,10,9],[11,-9,6,7]].forEach(r=>c.fillRect(...r));
  c.fillRect(-8,-6,21,16); c.fillRect(headX,-24,21,17); c.fillRect(muzzleX,-13,7,6);
  c.fillRect(-7,10+backLegOffset(s),5,6); c.fillRect(3,10,5,6); c.fillRect(9,9+frontLegOffset(s),4,7);
  c.fillRect(d>0?-15:12,-5,5,5); c.fillRect(d>0?-18:15,-9,5,5);
}
function drawCat(c,p,d,s){
  const headX=d>0?-11:-13, muzzleX=d>0?9:-14;
  c.fillStyle=p.light; c.fillRect(-10,-7,25,18); c.fillRect(headX,-24,22,18); c.fillRect(muzzleX,-14,8,7);
  c.fillStyle=p.dark;
  c.fillRect(headX-1,-30,6,8); c.fillRect(headX+11,-30,6,8); c.fillRect(d>0?-2:-8,-23,10,7); c.fillRect(d>0?7:4,-8,8,8); c.fillRect(-10,-4,6,5);
  c.fillRect(-8,10+backLegOffset(s),5,6); c.fillRect(2,10,6,6); c.fillRect(10,9+frontLegOffset(s),5,7);
  if(d>0){ c.fillRect(-18,-1,6,4); c.fillRect(-23,1,6,4); c.fillRect(-26,4,5,4); }
  else { c.fillRect(12,-1,6,4); c.fillRect(17,1,6,4); c.fillRect(21,4,5,4); }
  c.fillStyle='#ffb9b0'; c.fillRect(headX+2,-28,2,2); c.fillRect(headX+12,-28,2,2);
}
function drawFace(c,p,d,s){
  const hit=s==='hit'; const groggy=s==='groggy'; const victory=s==='victory';
  const eyeBaseX=d>0?1:-1; const y=-17;
  if(hit){
    c.fillStyle='#fff';c.fillRect(eyeBaseX-10,y-4,7,7);c.fillRect(eyeBaseX+1,y-3,6,6);c.fillStyle='#111';c.fillRect(eyeBaseX-7,y-2,2,2);c.fillRect(eyeBaseX+3,y-1,2,2);c.fillStyle='#ff7d89';c.fillRect(eyeBaseX-1,y+5,5,3);
  }else if(groggy){
    c.fillStyle='#111';c.fillRect(eyeBaseX-9,y,6,2);c.fillRect(eyeBaseX+1,y,5,2);c.fillRect(eyeBaseX-6,y-2,2,6);c.fillRect(eyeBaseX+3,y-2,2,6);c.fillStyle='#7bdcff';c.fillRect(d>0?7:-10,y+6,3,6);
  }else if(victory){
    c.fillStyle='#111';c.fillRect(eyeBaseX-9,y,6,2);c.fillRect(eyeBaseX+1,y,5,2);c.fillRect(eyeBaseX-2,y+5,7,2);c.fillRect(d>0?3:-2,y+3,2,2);
  }else{
    c.fillStyle='#111';c.fillRect(eyeBaseX-8,y,4,5);c.fillRect(eyeBaseX+3,y+1,3,4);c.fillStyle='#fff';c.fillRect(eyeBaseX-7,y,1,1);c.fillRect(eyeBaseX+4,y+1,1,1);c.fillStyle='#2b1b19';c.fillRect(eyeBaseX-1,y+5,4,3);
  }
  c.fillStyle='#111'; c.fillRect(d>0?8:-8,y+1,1,1); c.fillRect(d>0?10:-10,y+2,1,1); c.fillRect(d>0?8:-8,y+3,1,1);
}
function drawAttackLimbs(c,p,d,s){
  const limbColor = p.kind==='cat' ? p.light : p.body;
  const pawColor = p.kind==='cat' ? p.light : p.body;
  if(s==='punch'){
    c.fillStyle=limbColor;
    c.fillRect(d>0?12:-22,-4,10,5);
    c.fillRect(d>0?20:-28,-5,6,6);
  }
  if(s==='kick'||s==='airkick'){
    c.fillStyle=limbColor;
    c.fillRect(d>0?10:-26,5,14,5);
    c.fillStyle=pawColor;
    c.fillRect(d>0?22:-30,4,7,6);
    c.fillRect(d>0?25:-32,6,4,3);
  }
}

function drawBackground(mapId){
  if(mapId==='dojo')drawDojo();else drawRooftop();
}
function drawRooftop(){
  ctx.fillStyle='#283b58';ctx.fillRect(0,0,960,540);
  // pixel skyline
  const buildings=[[0,90,120,160],[95,130,95,120],[180,75,130,180],[300,118,80,135],[375,60,150,190],[520,110,115,140],[630,78,95,172],[720,120,130,130],[842,70,118,180]];
  buildings.forEach((b,i)=>{ctx.fillStyle=i%2?'#1c2b43':'#20334e';ctx.fillRect(b[0],b[1],b[2],b[3]);ctx.fillStyle='#f5c95b';for(let x=b[0]+14;x<b[0]+b[2]-8;x+=24)for(let y=b[1]+18;y<b[1]+b[3]-8;y+=25)if((x+y+i)%3)ctx.fillRect(x,y,6,8)});
  // void around rooftop
  ctx.fillStyle='#101722';ctx.fillRect(0,250,960,290);
  ctx.fillStyle='#6e737d';ctx.fillRect(105,95,750,385);ctx.fillStyle='#858a92';ctx.fillRect(115,105,730,365);
  // rooftop tiles
  ctx.strokeStyle='#6f747c';ctx.lineWidth=2;for(let x=115;x<=845;x+=55){ctx.beginPath();ctx.moveTo(x,105);ctx.lineTo(x,470);ctx.stroke()}for(let y=105;y<=470;y+=42){ctx.beginPath();ctx.moveTo(115,y);ctx.lineTo(845,y);ctx.stroke()}
  ctx.fillStyle='#f0d264';ctx.fillRect(112,102,736,5);ctx.fillRect(112,467,736,5);ctx.fillRect(112,102,5,370);ctx.fillRect(843,102,5,370);
}
function drawDojo(){
  ctx.fillStyle='#2a1b18';ctx.fillRect(0,0,960,540);ctx.fillStyle='#5d3026';ctx.fillRect(0,0,960,110);
  ctx.fillStyle='#d9bf8b';ctx.fillRect(70,85,820,425);ctx.fillStyle='#c49d69';ctx.fillRect(80,95,800,405);
  for(let y=95;y<500;y+=46){ctx.fillStyle=y%92===95?'#c9a775':'#bd9767';ctx.fillRect(80,y,800,3)}
  ctx.fillStyle='#4a261f';ctx.fillRect(75,90,810,10);ctx.fillRect(75,500,810,10);ctx.fillRect(75,90,10,420);ctx.fillRect(875,90,10,420);
  ctx.fillStyle='#f0e2bf';ctx.fillRect(405,20,150,55);ctx.fillStyle='#2b2522';ctx.font='bold 24px monospace';ctx.textAlign='center';ctx.fillText('멍 냥 도 장',480,55);ctx.textAlign='left';
}

function drawHUD(){
  if(!state)return;
  const ps=state.players; const boxW=220, gap=12, start=(960-(boxW*Math.min(ps.length,4)+gap*(Math.min(ps.length,4)-1)))/2;
  ps.slice(0,4).forEach((p,i)=>{
    const c=petPalette(p.character); const x=start+i*(boxW+gap), y=10;
    ctx.fillStyle='rgba(12,11,16,.88)';ctx.fillRect(x,y,boxW,58);ctx.strokeStyle=c.body;ctx.lineWidth=3;ctx.strokeRect(x+1.5,y+1.5,boxW-3,55);
    ctx.font='bold 13px monospace';ctx.fillStyle='#fff';ctx.fillText(`${c.name} ${p.id===me?'◀':''}`,x+10,y+19);
    ctx.font='bold 11px monospace';ctx.fillStyle='#c9c2d3';ctx.fillText(`♥ ${Math.max(0,p.stocks)}`,x+174,y+19);
    if(state.mode==='ringout'){
      const dmg=Math.round(p.damage);ctx.font='bold 25px monospace';ctx.fillStyle=dmg<80?'#fff':dmg<150?'#ffd65a':'#ff7272';ctx.fillText(`${dmg}%`,x+10,y+49);
    }else{
      const hp=Math.max(0,p.hp), bw=142;ctx.fillStyle='#48222a';ctx.fillRect(x+10,y+33,bw,14);ctx.fillStyle=hp>50?'#86d66a':hp>25?'#ffd65a':'#ff6b6b';ctx.fillRect(x+10,y+33,bw*hp/100,14);ctx.fillStyle='#fff';ctx.font='bold 12px monospace';ctx.fillText(`${hp}`,x+162,y+45);
    }
  });
}
function drawEffects(dt){
  effects.forEach(e=>e.t+=dt); effects=effects.filter(e=>e.t<e.life);
  for(const e of effects){
    const a=1-e.t/e.life; ctx.save();ctx.globalAlpha=a;
    if(e.type==='hit'){
      const sx=e.x, sy=e.y-e.z; ctx.translate(sx,sy); const s=1+e.t*7;ctx.scale(s,s);
      ctx.fillStyle='#fff4a7';ctx.fillRect(-2,-10,4,20);ctx.fillRect(-10,-2,20,4);ctx.fillStyle='#ff8a4e';ctx.fillRect(-7,-7,5,5);ctx.fillRect(3,3,5,5);
    }
    ctx.restore();
  }
}
function drawAttackWind(p){
  if(!p.attack)return; const t=p.attack.t/p.attack.duration;if(t>.75)return;
  const d=p.facingX>=0?1:-1;ctx.save();ctx.globalAlpha=.7*(1-t);ctx.strokeStyle='#e8f7ff';ctx.lineWidth=3;
  const y=p.y-p.z-10; for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(p.x+d*(24+i*7),y-7+i*7);ctx.lineTo(p.x+d*(43+i*10),y-7+i*7);ctx.stroke()}ctx.restore();
}
function drawGame(){
  requestAnimationFrame(drawGame);
  const now=performance.now(),dt=Math.min(.05,(now-lastT)/1000);lastT=now;
  ctx.clearRect(0,0,960,540);drawBackground(state?.mapId||'rooftop');
  if(!state)return;
  // Shadows first, ordered by y for fake depth
  const visible=state.players.filter(p=>!p.eliminated&&p.respawnTimer<=0).sort((a,b)=>a.y-b.y);
  for(const p of visible){ctx.save();ctx.globalAlpha=.20;ctx.fillStyle='#0b0a0e';ctx.beginPath();ctx.ellipse(p.x,p.y+12,18,6,0,0,Math.PI*2);ctx.fill();ctx.restore()}
  for(const p of visible){
    drawAttackWind(p);
    const c=petPalette(p.character); const facing=p.faceDir||p.facingX||1;
    drawPet(ctx,c,p.x,p.y,p.z,p.state,facing,1.42,p.invuln>0);
    ctx.font='bold 11px monospace';ctx.textAlign='center';ctx.fillStyle='#fff';ctx.strokeStyle='#111';ctx.lineWidth=4;ctx.strokeText(p.name,p.x,p.y-p.z-50);ctx.fillText(p.name,p.x,p.y-p.z-50);ctx.textAlign='left';
  }
  drawEffects(dt);drawHUD();
  const ov=$('#gameOverlay');
  if(state.status==='countdown'){ov.textContent=Math.ceil(state.countdown)||'FIGHT!';ov.style.display='flex'}
  else if(state.status==='finished'){
    const w=state.players.find(p=>p.id===state.winnerId);ov.textContent=w?`${petPalette(w.character).name} 승리!`:'무승부';ov.style.display='flex';
    if(room?.hostId===me)$('#lobbyBtn').classList.remove('hidden');
  } else ov.style.display='none';
}
requestAnimationFrame(drawGame);
