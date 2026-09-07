import * as THREE from '/vendor/three.module.js';

const socket = io();
const $ = s => document.querySelector(s);
const ui = { menu:$('#menu'), lobby:$('#lobby'), hud:$('#hud'), gameOver:$('#gameOver'), name:$('#name'), roomCode:$('#roomCode'), menuMsg:$('#menuMsg'), roomLabel:$('#roomLabel'), playerList:$('#playerList'), startBtn:$('#startBtn'), rematchBtn:$('#rematchBtn'), copyBtn:$('#copyBtn'), damage:$('#damage'), scoreboard:$('#scoreboard'), dashCd:$('#dashCd'), skillCd:$('#skillCd'), lockHint:$('#lockHint'), toast:$('#toast'), winnerText:$('#winnerText'), finalScores:$('#finalScores'), skillNote:$('#skillNote') };
const CHAR = {
  cat:{name:'뚱냥이',emoji:'🐱',desc:'무거움 · 잘 안 날아감',skill:'배치기: 주변 적을 한꺼번에 날림',color:0xf2a9bd},
  chick:{name:'대갈병아리',emoji:'🐤',desc:'빠름 · 박치기 강함',skill:'로켓 박치기: 정면을 강하게 돌진',color:0xffdd63},
  potato:{name:'감자인간',emoji:'🥔',desc:'균형형 · 난전 특화',skill:'감자 회전: 주변을 빙글 돌며 날림',color:0xb8875e}
};
let selectedChar='cat', selfId=null, room=null, playing=false, state=null, cameraYaw=0, cameraPitch=0.46, toastTimer=null;
let keyState={up:false,down:false,left:false,right:false};

function renderCharChoices(root){ root.innerHTML=''; Object.entries(CHAR).forEach(([id,c])=>{ const d=document.createElement('button'); d.className='char'+(id===selectedChar?' selected':''); d.innerHTML=`<div class="emoji">${c.emoji}</div><b>${c.name}</b><span>${c.desc}</span>`; d.addEventListener('click',()=>{selectedChar=id; renderCharChoices($('#menuChars')); renderCharChoices($('#lobbyChars')); ui.skillNote.textContent=CHAR[id].skill; socket.emit('changeCharacter',{char:id});}); root.appendChild(d); }); }
renderCharChoices($('#menuChars')); renderCharChoices($('#lobbyChars')); ui.skillNote.textContent=CHAR[selectedChar].skill;
const savedName = new URLSearchParams(location.search).get('name'); if(savedName) ui.name.value=savedName;
const inviteCode = new URLSearchParams(location.search).get('room'); if(inviteCode) ui.roomCode.value=inviteCode.toUpperCase();

function showToast(text){ ui.toast.textContent=text; ui.toast.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>ui.toast.classList.remove('show'),1700); }
function nick(){ return ui.name.value.trim() || '이름없음'; }
$('#createBtn').addEventListener('click',()=>socket.emit('createRoom',{name:nick(),char:selectedChar},r=>{ if(!r.ok)return ui.menuMsg.textContent=r.error; selfId=r.selfId; enterLobby(r.code); }));
$('#joinBtn').addEventListener('click',()=>socket.emit('joinRoom',{code:ui.roomCode.value,name:nick(),char:selectedChar},r=>{ if(!r.ok)return ui.menuMsg.textContent=r.error; selfId=r.selfId; enterLobby(r.code); }));
ui.roomCode.addEventListener('input',e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4));
function enterLobby(code){ ui.menu.classList.add('hidden'); ui.gameOver.classList.add('hidden'); ui.lobby.classList.remove('hidden'); ui.roomLabel.textContent=`#${code}`; history.replaceState({},'',`${location.pathname}?room=${code}`); }
ui.startBtn.addEventListener('click',()=>socket.emit('startGame'));
ui.rematchBtn.addEventListener('click',()=>socket.emit('startGame'));
ui.copyBtn.addEventListener('click',async()=>{ const url=`${location.origin}${location.pathname}?room=${room?.code||''}`; try{await navigator.clipboard.writeText(url);showToast('초대 링크 복사 완료!');}catch{showToast(url);} });
socket.on('notice',showToast);
socket.on('lobby',r=>{room=r; if(!selfId && r.players.some(p=>p.id===socket.id)) selfId=socket.id; renderLobby();});
function renderLobby(){ if(!room)return; ui.playerList.innerHTML=''; room.players.forEach(p=>{const d=document.createElement('div');d.className='player-card';d.innerHTML=`<div class="who"><span>${CHAR[p.char]?.emoji||'❔'}</span><b>${escapeHtml(p.name)}</b>${p.id===room.hostId?'<span class="host">HOST</span>':''}</div><span>${CHAR[p.char]?.name||''}</span>`;ui.playerList.appendChild(d);}); const host=room.hostId===selfId; ui.startBtn.style.display=host?'block':'none'; ui.rematchBtn.style.display=host?'block':'none'; ui.startBtn.disabled=room.players.length<2; }
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

socket.on('gameStarted',r=>{ room=r; playing=true; state=null; ui.lobby.classList.add('hidden'); ui.gameOver.classList.add('hidden'); ui.hud.classList.remove('hidden'); clearPlayers(); showToast('난투 시작! 먼저 5 KO!'); });
socket.on('gameOver',data=>{playing=false; document.exitPointerLock?.(); ui.hud.classList.add('hidden'); ui.gameOver.classList.remove('hidden'); const w=data.players.find(p=>p.id===data.winnerId); ui.winnerText.textContent=w?`${CHAR[w.char].emoji} ${w.name} 승리!`:'경기 종료'; ui.finalScores.innerHTML=data.players.sort((a,b)=>b.score-a.score).map((p,i)=>`<div class="final-row"><span>${i+1}위 · ${CHAR[p.char].emoji} ${escapeHtml(p.name)}</span><b>${p.score} KO</b></div>`).join(''); renderLobby(); });
socket.on('state',s=>{state=s; updateWorldFromState(s); updateHud(s);});
socket.on('ko',e=>{ const k=state?.players.find(p=>p.id===e.killerId), v=state?.players.find(p=>p.id===e.victimId); if(v) showToast(k?`${k.name} → ${v.name} KO!`:`${v.name} 혼자 추락!`); });
socket.on('effect',e=>spawnEffect(e));

const canvas=$('#game');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true}); renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap; renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene(); scene.background=new THREE.Color(0x8bc7ff); scene.fog=new THREE.Fog(0x8bc7ff,25,52);
const camera=new THREE.PerspectiveCamera(60,1,.1,100);
scene.add(new THREE.HemisphereLight(0xd9f3ff,0x67533d,2.1)); const sun=new THREE.DirectionalLight(0xffffff,2.0); sun.position.set(8,18,10); sun.castShadow=true; sun.shadow.mapSize.set(1024,1024); scene.add(sun);
const arena=new THREE.Mesh(new THREE.CylinderGeometry(11,11.8,1.2,64),new THREE.MeshStandardMaterial({color:0x7dcf82,roughness:.9})); arena.position.y=-.62; arena.receiveShadow=true; scene.add(arena);
const edge=new THREE.Mesh(new THREE.TorusGeometry(11.05,.18,12,64),new THREE.MeshStandardMaterial({color:0xf7e58c,roughness:.8})); edge.rotation.x=Math.PI/2; edge.position.y=.04; scene.add(edge);
const under=new THREE.Mesh(new THREE.CylinderGeometry(8.7,3.5,6,40),new THREE.MeshStandardMaterial({color:0x85654d,roughness:1})); under.position.y=-3.9; scene.add(under);
for(let i=0;i<18;i++){const cloud=new THREE.Mesh(new THREE.SphereGeometry(1+Math.random()*1.4,12,8),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.65})); const a=Math.random()*Math.PI*2,r=24+Math.random()*18; cloud.position.set(Math.cos(a)*r,8+Math.random()*10,Math.sin(a)*r); cloud.scale.y=.55; scene.add(cloud);}
// 회전 소시지 장애물
const hazardPivot=new THREE.Group(); scene.add(hazardPivot); const pole=new THREE.Mesh(new THREE.CylinderGeometry(.42,.55,3.1,14),new THREE.MeshStandardMaterial({color:0xd8c4a1})); pole.position.y=1.55; pole.castShadow=true; hazardPivot.add(pole); const sausageMat=new THREE.MeshStandardMaterial({color:0xd96b55,roughness:.55}); const sausage=new THREE.Mesh(new THREE.CapsuleGeometry(.58,7.6,8,18),sausageMat); sausage.rotation.z=Math.PI/2; sausage.position.set(4.7,.88,0); sausage.castShadow=true; hazardPivot.add(sausage);
const banner=createTextSprite('회전 소시지 주의', '#20242d', '#ffffff'); banner.position.set(0,4.2,0); banner.scale.set(4.4,1.1,1); scene.add(banner);

const playerMeshes=new Map();
function mat(color){return new THREE.MeshStandardMaterial({color,roughness:.72,metalness:.02});}
function shadowize(o){o.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true;}});}
function createCharacter(char,name){ const g=new THREE.Group(); const c=CHAR[char];
  if(char==='cat'){
    const body=new THREE.Mesh(new THREE.SphereGeometry(.78,20,16),mat(c.color));body.scale.set(1.05,1.05,.92);body.position.y=.78;g.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.62,20,16),mat(0xf8bfd0));head.position.set(0,1.55,-.08);g.add(head);
    [-.35,.35].forEach(x=>{const ear=new THREE.Mesh(new THREE.ConeGeometry(.25,.48,4),mat(0xe78fa8));ear.position.set(x,2.08,-.07);ear.rotation.y=Math.PI/4;g.add(ear);});
    const tail=new THREE.Mesh(new THREE.CylinderGeometry(.10,.13,1.1,10),mat(0xe78fa8));tail.position.set(.72,.85,.25);tail.rotation.z=-.75;g.add(tail);
  } else if(char==='chick'){
    const body=new THREE.Mesh(new THREE.SphereGeometry(.7,20,16),mat(c.color));body.position.y=.78;g.add(body); const head=new THREE.Mesh(new THREE.SphereGeometry(.72,20,16),mat(0xffe985));head.position.set(0,1.58,-.12);g.add(head);
    const beak=new THREE.Mesh(new THREE.ConeGeometry(.22,.55,4),mat(0xf39a4a));beak.rotation.x=-Math.PI/2;beak.position.set(0,1.48,-.72);g.add(beak);
    [-.64,.64].forEach((x,i)=>{const wing=new THREE.Mesh(new THREE.SphereGeometry(.3,12,10),mat(0xffd85e));wing.scale.set(.45,1.2,.65);wing.position.set(x,.92,0);wing.rotation.z=i?-.6:.6;g.add(wing);});
  } else {
    const body=new THREE.Mesh(new THREE.DodecahedronGeometry(.88,1),mat(c.color));body.scale.set(.92,1.15,.82);body.position.y=.95;g.add(body);
    for(const p of [[-.35,1.2,-.72],[.31,1.3,-.72]]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.09,10,8),mat(0x222222));eye.position.set(...p);g.add(eye);} const sprout=new THREE.Mesh(new THREE.ConeGeometry(.12,.5,7),mat(0x78b46e));sprout.position.set(0,2.1,0);sprout.rotation.z=.5;g.add(sprout);
  }
  // eyes for cat/chick
  if(char!=='potato') for(const x of [-.22,.22]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.075,10,8),mat(0x202128));eye.position.set(x,1.65,-char==='chick'?.74:.62);g.add(eye);}
  const label=createTextSprite(name,'rgba(14,16,22,.82)','#fff');label.position.set(0,2.72,0);label.scale.set(2.7,.62,1);g.add(label); shadowize(g); return g; }
function createTextSprite(text,bg='#222',fg='#fff'){const cvs=document.createElement('canvas');cvs.width=512;cvs.height=128;const ctx=cvs.getContext('2d');ctx.fillStyle=bg;ctx.roundRect(8,14,496,100,34);ctx.fill();ctx.fillStyle=fg;ctx.font='700 46px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,64);const tex=new THREE.CanvasTexture(cvs);tex.colorSpace=THREE.SRGBColorSpace;const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));sp.renderOrder=10;return sp;}
function clearPlayers(){for(const m of playerMeshes.values())scene.remove(m);playerMeshes.clear();}
function ensurePlayer(p){let m=playerMeshes.get(p.id);if(!m){m=createCharacter(p.char,p.name);scene.add(m);playerMeshes.set(p.id,m);}return m;}
function updateWorldFromState(s){hazardPivot.rotation.y=-s.hazardAngle; const ids=new Set(); for(const p of s.players){ids.add(p.id);const m=ensurePlayer(p);m.visible=!p.dead;const target=new THREE.Vector3(p.x,p.y,p.z);m.position.lerp(target,p.id===selfId?.55:.32);m.rotation.y=p.yaw;m.userData.damage=p.damage;} for(const [id,m] of playerMeshes)if(!ids.has(id)){scene.remove(m);playerMeshes.delete(id);} }

const particles=[];
function spawnEffect(e){ if(!['hit','skill','skillBurst','hazard','dash','swingHit'].includes(e.type)) return; const count=e.type==='skillBurst'?18:e.type==='hazard'?12:8; for(let i=0;i<count;i++){const mesh=new THREE.Mesh(new THREE.SphereGeometry(.06+Math.random()*.07,7,5),new THREE.MeshBasicMaterial({color:e.type==='hazard'?0xffc36a:e.type==='skillBurst'?0xffffff:0xfff0a0,transparent:true}));mesh.position.set(e.x||0,e.y||1,e.z||0);mesh.userData.v=new THREE.Vector3((Math.random()-.5)*5,Math.random()*4,(Math.random()-.5)*5);mesh.userData.life=.45+Math.random()*.35;scene.add(mesh);particles.push(mesh);} if(e.victimId===selfId) shake=0.22; }
let shake=0;
function updateParticles(dt){for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.userData.life-=dt;p.userData.v.y-=8*dt;p.position.addScaledVector(p.userData.v,dt);p.material.opacity=Math.max(0,p.userData.life*1.8);if(p.userData.life<=0){scene.remove(p);p.geometry.dispose();p.material.dispose();particles.splice(i,1);}}}
function updateHud(s){const me=s.players.find(p=>p.id===selfId);if(!me)return;ui.damage.textContent=`${me.damage}%`;ui.damage.style.transform=`scale(${1+Math.min(me.damage,200)/1200})`;ui.scoreboard.innerHTML=s.players.slice().sort((a,b)=>b.score-a.score).map(p=>`<div class="score-pill ${p.id===selfId?'me':''}">${CHAR[p.char].emoji} ${escapeHtml(p.name)} ${p.score}/${s.scoreLimit}</div>`).join(''); ui.dashCd.textContent=me.dashReady>0?`SHIFT ${(me.dashReady/1000).toFixed(1)}s`:'SHIFT 대시';ui.dashCd.classList.toggle('ready',me.dashReady<=0);ui.skillCd.textContent=me.skillReady>0?`E ${(me.skillReady/1000).toFixed(1)}s`:`E ${CHAR[me.char].name} 스킬`;ui.skillCd.classList.toggle('ready',me.skillReady<=0);}

function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}addEventListener('resize',resize);resize();
canvas.addEventListener('click',()=>{if(playing && document.pointerLockElement!==canvas)canvas.requestPointerLock?.();});
document.addEventListener('pointerlockchange',()=>ui.lockHint.style.display=document.pointerLockElement===canvas?'none':'block');
document.addEventListener('mousemove',e=>{if(document.pointerLockElement!==canvas||!playing)return;cameraYaw-=e.movementX*.0028;cameraPitch=THREE.MathUtils.clamp(cameraPitch-e.movementY*.0022,.18,.85);});
document.addEventListener('mousedown',e=>{if(!playing||document.pointerLockElement!==canvas)return;if(e.button===0)socket.emit('action',{type:'attack',yaw:cameraYaw});});
document.addEventListener('contextmenu',e=>e.preventDefault());
function setKey(code,on){if(code==='KeyW')keyState.up=on;if(code==='KeyS')keyState.down=on;if(code==='KeyA')keyState.left=on;if(code==='KeyD')keyState.right=on;}
document.addEventListener('keydown',e=>{if(!playing||e.repeat)return;setKey(e.code,true);if(e.code==='Space'){e.preventDefault();socket.emit('action',{type:'jump',yaw:cameraYaw});}if(e.code==='ShiftLeft'||e.code==='ShiftRight')socket.emit('action',{type:'dash',yaw:cameraYaw});if(e.code==='KeyE')socket.emit('action',{type:'skill',yaw:cameraYaw});});
document.addEventListener('keyup',e=>setKey(e.code,false));
setInterval(()=>{if(playing)socket.emit('input',{...keyState,yaw:cameraYaw});},50);

let last=performance.now();
function frame(now){requestAnimationFrame(frame);const dt=Math.min(.05,(now-last)/1000);last=now;updateParticles(dt);if(playing&&state){const me=state.players.find(p=>p.id===selfId);if(me&&!me.dead){const center=new THREE.Vector3(me.x,me.y+1.1,me.z);const dist=7.3;const horiz=Math.cos(cameraPitch)*dist;const desired=new THREE.Vector3(center.x-Math.sin(cameraYaw)*horiz,center.y+Math.sin(cameraPitch)*dist+1.0,center.z+Math.cos(cameraYaw)*horiz);if(shake>0){shake=Math.max(0,shake-dt);desired.x+=(Math.random()-.5)*shake;desired.y+=(Math.random()-.5)*shake;desired.z+=(Math.random()-.5)*shake;}camera.position.lerp(desired,.14);camera.lookAt(center);}}else{camera.position.set(0,8.5,16);camera.lookAt(0,1,0);hazardPivot.rotation.y-=dt*.5;}renderer.render(scene,camera);}requestAnimationFrame(frame);
