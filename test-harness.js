const fs=require('fs'), vm=require('vm');

class ClassList{
  constructor(init=''){this.s=new Set(init.split(/\s+/).filter(Boolean));}
  add(...xs){xs.forEach(x=>this.s.add(x));}
  remove(...xs){xs.forEach(x=>this.s.delete(x));}
  contains(x){return this.s.has(x);}
  toggle(x,force){if(force===undefined){if(this.s.has(x)){this.s.delete(x);return false}else{this.s.add(x);return true}} if(force)this.s.add(x);else this.s.delete(x);return !!force;}
  toString(){return [...this.s].join(' ')}
}
function mkEl(id){
  return {
    id, innerHTML:'', textContent:'', className:'', classList:new ClassList(), children:[], dataset:{}, style:{}, src:'',
    appendChild(c){this.children.push(c)}, addEventListener(type,fn){this['_'+type]=fn}, querySelectorAll(sel){return this._buttons||[]},
    matches(){return true}, focus(){}, scrollIntoView(){}, setAttribute(){},
  };
}
const els={};
['menuPanel','gamePanel','characterList','mapList','startBtn','stockInfo','buffInfo','damageInfo','botCountLabel','botButtons','stockCountLabel','stockButtons','resultOverlay','resultTitle','resultStats','winnerImage','replayBtn','selectBtn','menuBtn','finalKoBanner','bgmVolume','bgmVolumeValue','sfxVolume','sfxVolumeValue','musicState'].forEach(id=>els[id]=mkEl(id));
els.gamePanel.classList.add('hidden'); els.resultOverlay.classList.add('hidden'); els.finalKoBanner.classList.add('hidden');
for(const [id,key,count] of [['botButtons','bots',4],['stockButtons','stocks',2]]){
  els[id]._buttons=[];
  const vals=id==='botButtons'?[0,1,2,3]:[3,5];
  vals.forEach(v=>{const b=mkEl('b'+v);b.dataset[key]=String(v);b.classList=new ClassList(v===vals[0]?'selected':'');els[id]._buttons.push(b)});
}
const ctx=new Proxy({
  imageSmoothingEnabled:false,
  measureText(t){return {width:String(t).length*7}},
  createLinearGradient(){return {addColorStop(){}}},
}, {get(t,p){if(p in t)return t[p]; return ()=>{};}, set(t,p,v){t[p]=v;return true;}});
const canvas={width:960,height:540,getContext(){return ctx}};
const doc={
  getElementById(id){if(id==='gameCanvas')return canvas; return els[id]||(els[id]=mkEl(id));},
  createElement(tag){return mkEl(tag)},
  querySelector(){return null},
};
const listeners={};
const win={
  addEventListener(type,fn){(listeners[type]??=[]).push(fn)},
  AudioContext:undefined, webkitAudioContext:undefined,
};
class FakeImage{constructor(){this.complete=true;this.naturalWidth=64;this.naturalHeight=64;this._src='';}set src(v){this._src=v}get src(){return this._src}}
class FakeAudio{constructor(src){this.src=src;this.loop=false;this.preload='';this.volume=1;this.currentTime=0;this.paused=true;this.playCount=0;}play(){this.paused=false;this.playCount++;return Promise.resolve();}pause(){this.paused=true;}}
const store=new Map();const localStorage={getItem(k){return store.has(k)?store.get(k):null},setItem(k,v){store.set(k,String(v))}};
let rafCount=0;
const sandbox={console,document:doc,window:win,Image:FakeImage,Audio:FakeAudio,localStorage,performance:{now:()=>1000},requestAnimationFrame:(fn)=>{rafCount++;return rafCount},Math,Set,Map,Date,Number,String,Array,Object,JSON,Boolean,RegExp,Error,parseInt,parseFloat,isNaN,Infinity,NaN};
vm.createContext(sandbox);
const path=require('path');
const code=fs.readFileSync(path.join(__dirname,'public','game-v7-2.js'),'utf8');
vm.runInContext(code,sandbox,{filename:'game-v7-2.js'});
function ev(expr){return vm.runInContext(expr,sandbox)}
function assert(cond,msg){if(!cond) throw new Error(msg)}
function finiteFighters(){return ev('game.fighters.every(f=>[f.x,f.y,f.z,f.vx,f.vy,f.vz,f.damage].every(Number.isFinite))')}

const results=[];
function test(name,fn){try{fn();results.push(['PASS',name])}catch(e){results.push(['FAIL',name,e.stack||e.message])}}

test('menu builds 4 characters and restored 2 maps',()=>{assert(els.characterList.children.length===4,'chars');assert(els.mapList.children.length===2,'maps')});
test('traits are distinct and tiny',()=>{const xs=ev('characters.map(c=>c.trait.name)');assert(new Set(xs).size===4,'traits');assert(ev("characters.find(c=>c.key==='gamja').trait.speed")===1.06,'gamja speed')});
test('default stock is 3',()=>assert(ev('selectedStocks')===3,'stock'));

test('BOT 0 starts solo',()=>{ev("selectedBots=0;selectedMap='rooftop';selectedChar='jjigae';selectedStocks=3;startGame()");assert(ev('game.fighters.length')===1,'solo');assert(finiteFighters(),'finite')});
test('BOT 1/2/3 counts',()=>{for(const n of [1,2,3]){ev(`selectedBots=${n};game=new Game()`);assert(ev('game.fighters.length')===n+1,'bot '+n)}});
test('BOT personalities assigned',()=>{ev('selectedBots=3;game=new Game()');const ps=ev('game.fighters.slice(1).map(f=>f.personality)');assert(ps.every(x=>['aggressive','coward','item','jumper'].includes(x)),'personality')});

test('attack data roles',()=>{assert(ev("attackData('punch').duration")<ev("attackData('kick').duration"),'punch faster');assert(ev("attackData('kick').kb")>ev("attackData('punch').kb"),'kick kb');assert(ev("attackData('jumpkick').kb")>ev("attackData('kick').kb"),'jumpkick kb')});
test('dash punch and dash kick exist',()=>{assert(ev("!!attackData('dashpunch')"),'dp');assert(ev("!!attackData('dashkick')"),'dk')});
test('air punch exists',()=>assert(ev("!!attackData('airpunch')"),'airp'));

test('punch hit applies damage hitstop shake stats',()=>{ev("selectedBots=1;game=new Game(); var a=game.fighters[0],b=game.fighters[1]; a.x=400;a.y=250;a.facing=1;b.x=420;b.y=250;b.spawnShield=0;hit(a,b,'punch')");assert(ev('game.fighters[1].damage')>0,'damage');assert(ev('game.hitstop')>=35,'hitstop');assert(ev('game.shake')>0,'shake');assert(ev('game.fighters[0].stats.punchHits')===1,'stats')});
test('kick trait boosts jjigae and mandu reduces incoming kb',()=>{const jj=ev("characters.find(c=>c.key==='jjigae').trait.kickKb");const md=ev("characters.find(c=>c.key==='mandu').trait.incomingKb");assert(jj===1.07,'jj');assert(md===0.94,'mandu')});
test('jumpkick whiff landing lag in range',()=>{ev("game=new Game();var f=game.fighters[0];f.z=1;f.vz=-2;f.state='jumpkick';f.attack='jumpkick';f.airAttackWas='jumpkick';f.airAttackConnected=false;updateFighter(f,16.67)");const lag=ev('game.fighters[0].landingLag');assert(lag>=150&&lag<=250,'lag '+lag)});

test('items all apply',()=>{ev("game=new Game();var f=game.fighters[0];applyDrop(f,'hammer');applyDrop(f,'speed');applyDrop(f,'invincible');f.damage=50;applyDrop(f,'meat');applyDrop(f,'poop')");assert(ev('game.fighters[0].itemUses')===3,'hammer');assert(ev('game.fighters[0].effects.speed')===5000,'speed');assert(ev('game.fighters[0].effects.invincible')===3800,'inv');assert(ev('game.fighters[0].damage')===25,'meat');assert(ev('game.fighters[0].effects.reverse')===5000,'poop')});
test('item warning spawn central',()=>{ev("game=new Game();spawnDrop()");assert(ev('game.drops[0].warning')===true,'warning');const inside=ev('(()=>{let d=game.drops[0],s=game.map.stage;return d.x>s.x+s.w*.15&&d.x<s.x+s.w*.85})()');assert(inside,'central')});

test('rooftop wind telegraph and active phase',()=>{ev("selectedMap='rooftop';game=new Game();game.mapState.wind.timer=0;updateMapGimmicks(1)");assert(ev("game.mapState.wind.phase")==='warning','warning');ev('game.mapState.wind.timer=0;updateMapGimmicks(1)');assert(ev("game.mapState.wind.phase")==='active','active')});
test('dojo polished floor is slippery only in marked zone',()=>{ev("selectedMap='dojo';game=new Game();var p=game.mapState.slick,f=game.fighters[0];f.x=p.x+2;f.y=p.y+2");assert(ev('isSlippery(game.fighters[0])')===true,'slick');ev('game.fighters[0].x=game.map.stage.x+5;game.fighters[0].y=game.map.stage.y+5');assert(ev('isSlippery(game.fighters[0])')===false,'outside')});

test('getup grants short shield',()=>{ev("selectedMap='rooftop';game=new Game();var f=game.fighters[0];f.state='getup';f.stateTime=341;updateFighter(f,1)");assert(ev('game.fighters[0].getupShield')===400,'shield')});
test('respawn avoids overlap and resets effects',()=>{ev("selectedBots=2;game=new Game();var f=game.fighters[0];f.effects.speed=99;f.item='hammer';respawn(f)");assert(ev('game.fighters[0].effects.speed')===0,'reset');assert(ev("game.fighters.slice(1).every(o=>Math.hypot(o.x-game.fighters[0].x,o.y-game.fighters[0].y)>20)")===true,'position')});

test('ringout attribution within 2.2s',()=>{ev("selectedBots=1;selectedStocks=3;game=new Game();var a=game.fighters[0],b=game.fighters[1];b.spawnShield=0;b.lastAttacker=a;b.lastHitAt=game.time;b.lastHitType='kick';handleRingOut(b)");assert(ev('game.fighters[0].stats.ringOuts')===1,'credit');assert(ev('game.fighters[1].stats.deaths')===1,'death')});
test('suicide ringout recorded',()=>{ev("selectedBots=1;selectedStocks=3;game=new Game();var b=game.fighters[1];b.lastAttacker=null;handleRingOut(b)");assert(ev('game.fighters[1].stats.suicides')===1,'suicide')});
test('last stock decides winner and result',()=>{ev("selectedBots=1;selectedStocks=1;game=new Game();var a=game.fighters[0],b=game.fighters[1];b.lastAttacker=a;b.lastHitAt=game.time;b.lastHitType='jumpkick';handleRingOut(b)");assert(ev('game.ended')===true,'ended');assert(ev('game.winner===game.fighters[0]')===true,'winner');ev('game.endTimer=0;update(1)');assert(!els.resultOverlay.classList.contains('hidden'),'overlay');assert(els.resultTitle.textContent.includes('승리'),'title')});
test('new Game resets stats/effects/map gimmick',()=>{ev("selectedMap='rooftop';selectedBots=1;selectedStocks=3;game=new Game();game.fighters[0].stats.hits=99;game.fighters[0].effects.speed=999;game.mapState.wind.phase='active';game=new Game()");assert(ev('game.fighters[0].stats.hits')===0,'stats reset');assert(ev('game.fighters[0].effects.speed')===0,'eff reset');assert(ev("game.mapState.wind.phase")==='wait','map reset')});
test('draw all maps and states without error',()=>{for(const m of ['rooftop','dojo']){ev(`selectedMap='${m}';selectedBots=3;game=new Game();draw()`)};for(const st of ['idle','walk','punch','kick','jump','jumpkick','dashpunch','dashkick','airpunch','hurt','down','getup']){ev(`game.fighters[0].state='${st}';game.fighters[0].stateTime=120;draw()`)};assert(true,'draw')});
test('all fighter numbers remain finite after simulation',()=>{ev("selectedMap='rooftop';selectedBots=3;game=new Game()");for(let i=0;i<300;i++)ev('update(16.67)');assert(finiteFighters(),'finite')});

test('WASD movement changes velocity',()=>{ev("selectedBots=0;game=new Game();var f=game.fighters[0];keys['KeyD']=true;updateHuman(f);keys['KeyD']=false");assert(ev('game.fighters[0].vx')>0,'move')});
test('Space jump sets Z velocity',()=>{ev("game=new Game();var f=game.fighters[0];pressed.add('Space');updateHuman(f);pressed.clear()");assert(ev('game.fighters[0].vz')>0,'jump')});
test('Shift+J triggers dash punch',()=>{ev("game=new Game();var f=game.fighters[0];keys['ShiftLeft']=true;pressed.add('KeyJ');updateHuman(f);keys['ShiftLeft']=false;pressed.clear()");assert(ev("game.fighters[0].state")==='dashpunch','dashpunch')});
test('Shift+K triggers dash kick',()=>{ev("game=new Game();var f=game.fighters[0];keys['ShiftLeft']=true;pressed.add('KeyK');updateHuman(f);keys['ShiftLeft']=false;pressed.clear()");assert(ev("game.fighters[0].state")==='dashkick','dashkick')});
test('air J triggers air punch',()=>{ev("game=new Game();var f=game.fighters[0];f.z=20;pressed.add('KeyJ');updateHuman(f);pressed.clear()");assert(ev("game.fighters[0].state")==='airpunch','airpunch')});
test('air K triggers jumpkick',()=>{ev("game=new Game();var f=game.fighters[0];f.z=20;pressed.add('KeyK');updateHuman(f);pressed.clear()");assert(ev("game.fighters[0].state")==='jumpkick','jumpkick')});
test('3/5 stock selection affects fighter stock',()=>{ev("selectedStocks=5;game=new Game()");assert(ev('game.fighters[0].stocks')===5,'5 stock');ev("selectedStocks=3;game=new Game()");assert(ev('game.fighters[0].stocks')===3,'3 stock')});


test('all four character selections create correct player',()=>{for(const c of ['jjigae','mandu','gamja','gucci']){ev(`selectedChar='${c}';selectedBots=0;game=new Game()`);assert(ev('game.fighters[0].def.key')===c,c)}});
test('normal J and K inputs preserved',()=>{ev("selectedChar='jjigae';game=new Game();var f=game.fighters[0];pressed.add('KeyJ');updateHuman(f);pressed.clear()");assert(ev("game.fighters[0].state")==='punch','punch');ev("game=new Game();var f=game.fighters[0];pressed.add('KeyK');updateHuman(f);pressed.clear()");assert(ev("game.fighters[0].state")==='kick','kick')});
test('invincible blocks normal hit',()=>{ev("selectedBots=1;game=new Game();var a=game.fighters[0],b=game.fighters[1];b.spawnShield=0;b.effects.invincible=1000;hit(a,b,'kick')");assert(ev('game.fighters[1].damage')===0,'invincible')});
test('getup shield blocks hit',()=>{ev("selectedBots=1;game=new Game();var a=game.fighters[0],b=game.fighters[1];b.spawnShield=0;b.getupShield=300;hit(a,b,'kick')");assert(ev('game.fighters[1].damage')===0,'getup')});
test('respawn shield blocks hit',()=>{ev("selectedBots=1;game=new Game();var a=game.fighters[0],b=game.fighters[1];b.spawnShield=800;hit(a,b,'kick')");assert(ev('game.fighters[1].damage')===0,'spawn')});
test('poop reverses horizontal input only',()=>{ev("selectedBots=0;game=new Game();var f=game.fighters[0];f.spawnShield=0;f.effects.reverse=1000;keys['KeyD']=true;updateHuman(f);keys['KeyD']=false");assert(ev('game.fighters[0].vx')<0,'reverse x')});
test('strong knockback creates trail',()=>{ev("game=new Game();var f=game.fighters[0];f.damage=100;f.vx=8;f.vy=0;f.spawnShield=0;updateFighter(f,16.67)");assert(ev("game.particles.some(p=>p.kind==='trail')")===true,'trail')});
test('jumpkick ringout statistic recorded',()=>{ev("selectedBots=1;selectedStocks=1;game=new Game();var a=game.fighters[0],b=game.fighters[1];b.lastAttacker=a;b.lastHitAt=game.time;b.lastHitType='jumpkick';handleRingOut(b)");assert(ev('game.fighters[0].stats.jumpkickOuts')===1,'jumpkick out')});
test('replay does not schedule duplicate RAF',()=>{const before=rafCount;ev('replayGame()');assert(rafCount===before,'raf duplicate')});

test('original BGM files configured',()=>{assert(ev("bgm.lobby.src").includes('Cold_Bell_Impact.mp3'),'lobby bgm');assert(ev("bgm.game.src").includes('The_Rooftop_Bout.mp3'),'game bgm')});
test('game/menu BGM switching',()=>{ev("running=false;playBgm('lobby',true)");assert(ev('currentBgm===bgm.lobby')===true,'lobby');ev("running=true;playBgm('game',true)");assert(ev('currentBgm===bgm.game')===true,'game')});

test('window listeners not duplicated at load',()=>{assert((listeners.keydown||[]).length===1,'keydown');assert((listeners.keyup||[]).length===1,'keyup')});

for(const r of results) console.log(r[0],r[1],r[2]||'');
const fails=results.filter(r=>r[0]==='FAIL');
console.log(`TOTAL ${results.length} PASS ${results.length-fails.length} FAIL ${fails.length}`);
if(fails.length) process.exit(1);
