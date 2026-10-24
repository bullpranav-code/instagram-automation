const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1200,height:1400}});
await p.goto('file://'+process.cwd()+'/templates.html');await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(600);
for(const id of ['c1','c2','c3','c4','c5']){await p.locator('#'+id).screenshot({path:id+'.png'});}
await b.close()})();
