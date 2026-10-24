const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1200,height:2000}});
await p.goto('file://'+process.cwd()+'/reel.html');await p.evaluate(()=>document.fonts.ready);
await p.evaluate(()=>{document.body.style.padding=0;[...document.body.children].forEach(c=>{if(c.id!=='story'&&c.tagName==='DIV')c.style.display='none'})});
await p.waitForTimeout(300);const el=p.locator('#story');const fps=30,dur=9;
require('fs').mkdirSync('frames',{recursive:true});
for(let i=0;i<fps*dur;i++){const t=i*1000/fps;await p.evaluate(t=>document.getAnimations().forEach(a=>{a.pause();a.currentTime=t}),t);
 await el.screenshot({path:`frames/f${String(i).padStart(4,'0')}.png`});}
await b.close()})();
