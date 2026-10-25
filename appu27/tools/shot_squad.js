const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME||undefined});const p=await b.newPage({viewport:{width:1200,height:2000}});
await p.goto('file://'+process.cwd()+'/design/squad.html');await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(800);
const ids=['s1','s2','sq1','sq2','sq3','sq4','sq5','f0','f1','f2','f3','f4','f5','f6','sw'];
for(const id of ids){await p.locator('#'+id).screenshot({path:'out/'+id+'.png'});}
await b.close()})();
