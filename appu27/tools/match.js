// Render match-day media from data: node tools/match.js data.json outDir prefix
// -> <prefix>_post.jpg (1080x1350), <prefix>_story.jpg (1080x1920), <prefix>_reel.mp4 (1080x1920, music by mood), <prefix>_cover.jpg
const {chromium}=require('playwright');const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const [,,dataFile,outDir='out',prefix='match']=process.argv;
const M=JSON.parse(fs.readFileSync(dataFile,'utf8'));
const root=path.resolve(__dirname,'..');fs.mkdirSync(outDir,{recursive:true});
const frames=path.join(outDir,prefix+'_frames');fs.rmSync(frames,{recursive:true,force:true});fs.mkdirSync(frames);
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME||undefined});
 const p=await b.newPage({viewport:{width:1200,height:2000}});
 await p.goto('file://'+root+'/design/match.html#'+encodeURIComponent(JSON.stringify(M)));
 await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(600);
 const mood=await p.evaluate(()=>document.body.dataset.mood);
 const shot=async(id,file)=>{const png=path.join(outDir,file+'.png');await p.locator('#'+id).screenshot({path:png});
   execFileSync('convert',[png,'-quality','92',path.join(outDir,file+'.jpg')]);fs.unlinkSync(png);};
 // static: jump all animations to their end
 await p.evaluate(()=>document.getAnimations().forEach(a=>{a.pause();a.currentTime=4000}));
 await shot('post',prefix+'_post');await shot('story',prefix+'_story');
 // reel frames
 await p.evaluate(()=>{document.body.style.padding=0;document.getElementById('post').style.display='none'});
 const el=p.locator('#story'),fps=30,dur=9;
 for(let i=0;i<fps*dur;i++){const t=i*1000/fps;await p.evaluate(t=>document.getAnimations().forEach(a=>{a.pause();a.currentTime=t}),t);
  await el.screenshot({path:path.join(frames,`f${String(i).padStart(4,'0')}.png`)});}
 await b.close();
 const music=M.mode==='kickoff'?'appu27_matchday_hype.mp3':mood==='happy'?'appu27_win_celebration.mp3':mood==='sad'?'appu27_heartbreak.mp3':'appu27_matchday_hype.mp3';
 const mp4=path.join(outDir,prefix+'_reel.mp4');
 execFileSync('ffmpeg',['-y','-loglevel','error','-framerate',String(fps),'-i',path.join(frames,'f%04d.png'),'-i',path.join(root,'music',music),
  '-t',String(dur),'-af',`afade=t=out:st=${dur-1.2}:d=1.2`,'-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p',
  '-c:a','aac','-b:a','192k','-shortest','-movflags','+faststart',mp4]);
 fs.copyFileSync(path.join(outDir,prefix+'_story.jpg'),path.join(outDir,prefix+'_cover.jpg'));
 fs.rmSync(frames,{recursive:true,force:true});
 console.log(JSON.stringify({mood,music,files:[prefix+'_post.jpg',prefix+'_story.jpg',prefix+'_reel.mp4',prefix+'_cover.jpg']}));
})();
