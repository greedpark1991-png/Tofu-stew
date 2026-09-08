const fs=require('fs');
const path=require('path');
const root=__dirname;
const chars=['jjigae','mandu','gamja','gucci'];
let pass=0,fail=0;
function check(cond,msg){if(cond){console.log('[PASS]',msg);pass++;}else{console.error('[FAIL]',msg);fail++;}}
for(const c of chars){
  const p=path.join(root,'public','assets','characters',`${c}.png`);
  const orig=path.join(root,'public','assets','source-originals',`${c}_original.png`);
  check(fs.existsSync(p)&&fs.statSync(p).size>1000,`${c}.png runtime sprite exists and is non-empty`);
  check(fs.existsSync(orig)&&fs.statSync(orig).size>1000,`${c}_original.png canonical source is preserved`);
}
const js=fs.readFileSync(path.join(root,'public','game.js'),'utf8');
check(!/humanoid|stickman|robot sprite|mannequin/i.test(js),'No humanoid/robot/mannequin sprite code');
check(js.includes('this.stocks=3'),'3 Stock rule is present');
check(js.includes('other.damage=Math.min(999,other.damage+dmg)'), 'Damage percentage accumulation is present');
check(js.includes("hammer:{")&&js.includes("meat:{")&&js.includes("snack:{")&&js.includes("star:{")&&js.includes("poop:{")&&js.includes("squeak:{"),'All six requested item archetypes are present');
check(js.includes("living:")&&js.includes("bath:")&&js.includes("walk:")&&js.includes("soccer:"),'Four cute life-style maps are present');
check(js.includes('ctx.drawImage(img,-w/2,-h,w,h)'), 'Whole-body canonical PNG rendering is used for combat');
check(!/drawImage\([^\n]*arm|drawImage\([^\n]*leg/i.test(js),'No detached arm/leg attack sprite rendering');
console.log(`\n${pass} passed, ${fail} failed`);process.exit(fail?1:0);
