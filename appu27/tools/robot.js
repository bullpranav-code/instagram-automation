// Appu27 match robot (runs on GitHub Actions, see .github/workflows/appu27-robot.yml).
// Finds finished Kerala Blasters matches via the Apps Script web app (a=data, API-Football cache),
// renders FT post + story + reel (mood music) with tools/match.js, pushes media to gh-pages
// and approval jobs to appu27/jobs. Each fixture is handled once (robot/state.json).
// Manual override (workflow_dispatch): MANUAL='{"home":"KBFC","away":"MCFC","hg":2,"ag":1,"scorers":{"home":["Luna 23\'"],"away":[]}}'
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const ROOT=path.resolve(__dirname,'..'), REPO=path.resolve(ROOT,'..');
const WEBAPP='https://script.google.com/macros/s/AKfycbzOQV6iArNbFbYKWCQgOtb6YjdBuSmYzTUdV68VciI3QCWM7S3uH3_9usJ-xZFzWL2Txg/exec';
const GHP=process.env.GHP_DIR||path.join(REPO,'..','ghp');           // checkout of gh-pages
const STATE=path.join(ROOT,'robot','state.json');
const TAGS='#KBFC #KeralaBlasters #ISL #ISL2026 #Manjappada #Appu27 #IndianFootball';
const NAMES=[[/kerala/i,'KBFC'],[/mumbai/i,'MCFC'],[/bengaluru|bengalore/i,'BFC'],[/chennaiyin/i,'CFC'],[/east bengal/i,'EBFC'],
 [/mohun|bagan/i,'MBSG'],[/goa/i,'FCG'],[/hyderabad/i,'HFC'],[/jamshedpur/i,'JFC'],[/north ?east/i,'NEU'],[/odisha/i,'OFC'],
 [/punjab/i,'PFC'],[/inter kashi/i,'IK'],[/delhi/i,'DEL'],[/mohammedan/i,'MSC']];
const code=n=>(NAMES.find(([r])=>r.test(n))||[0,n.replace(/[^A-Z]/g,'').slice(0,4)||n.slice(0,4).toUpperCase()])[1];
const sh=(c,a,o={})=>execFileSync(c,a,{stdio:['ignore','pipe','inherit'],...o}).toString().trim();
const istDate=(d=new Date())=>new Date(d.getTime()+5.5*3600e3).toISOString().slice(0,10);
const fmt=iso=>{const d=new Date(new Date(iso).getTime()+5.5*3600e3);return d.toUTCString().slice(0,3).toUpperCase()+' '+d.getUTCDate()+' '+d.toUTCString().slice(8,11).toUpperCase()};
async function data(q){const r=await fetch(WEBAPP+'?a=data&'+q,{redirect:'follow'});const t=await r.text();
 try{return JSON.parse(t)}catch(e){throw new Error('web app did not return JSON (is the deployment on v1.3?): '+t.slice(0,200))}}

async function main(){
 const state=fs.existsSync(STATE)?JSON.parse(fs.readFileSync(STATE,'utf8')):{done:[]};
 let matches=[];
 if(process.env.MANUAL&&process.env.MANUAL.trim()){
  const m=JSON.parse(process.env.MANUAL);matches.push({id:'manual_'+istDate()+'_'+m.home+m.away,date:m.date||fmt(new Date().toISOString()),venue:m.venue||'',...m,source:m.source||'Official ISL'});
 } else {
  const today=istDate(), yday=istDate(new Date(Date.now()-864e5));
  const j=await data(`from=${yday}&to=${today}`);
  if(j.error||!Array.isArray(j.response)) throw new Error('no fixture data: '+JSON.stringify(j).slice(0,300));
  console.log('::notice::api errors '+JSON.stringify(j.errors||{})+' results '+j.results+' params '+JSON.stringify(j.parameters||{}));
  console.log('::notice::fixtures '+yday+'..'+today+': '+j.response.length+' | '+j.response.filter(f=>/kerala/i.test(f.teams.home.name+f.teams.away.name)).map(f=>`${f.teams.home.name} ${f.goals.home}-${f.goals.away} ${f.teams.away.name} [${f.fixture.status.short} ${f.fixture.status.elapsed||''}']`).join('; '));
  for(const f of j.response){
   const st=f.fixture.status.short, H=f.teams.home.name, A=f.teams.away.name;
   if(!['FT','AET','PEN'].includes(st)||!/kerala/i.test(H+A)||state.done.includes(f.fixture.id)) continue;
   const d=await data('id='+f.fixture.id), ev=((d.response||[])[0]||{}).events||[];
   const sc={home:[],away:[]};
   ev.filter(e=>e.type==='Goal'&&e.detail!=='Missed Penalty').forEach(e=>{
     const side=e.team.name===H?'home':'away', own=/own/i.test(e.detail);
     const who=(e.player.name||'').split(' ').slice(-1)[0];
     const tgt=own?(side==='home'?'away':'home'):side;   // API lists own goals under the player's team
     sc[tgt].push(`${who} ${e.time.elapsed}${e.time.extra?'+'+e.time.extra:''}'${own?' (OG)':/penalty/i.test(e.detail)?' (pen)':''}`);});
   matches.push({id:f.fixture.id,home:code(H),away:code(A),hg:f.goals.home,ag:f.goals.away,scorers:sc,
     date:fmt(f.fixture.date),venue:((f.fixture.venue||{}).city||'').toUpperCase(),source:'API-Football',pen:st==='PEN'?f.score.penalty:null});
  }
 }
 if(!matches.length){console.log('::notice::nothing new to post');return;}
 // next Blasters fixture
 let next='';
 try{const n=await data(`from=${istDate(new Date(Date.now()+864e5))}&to=${istDate(new Date(Date.now()+15*864e5))}`);
  const f=(n.response||[]).filter(x=>/kerala/i.test(x.teams.home.name+x.teams.away.name)).sort((a,b)=>a.fixture.timestamp-b.fixture.timestamp)[0];
  if(f){const opp=/kerala/i.test(f.teams.home.name)?f.teams.away.name:f.teams.home.name;next=`Next: vs ${opp}, ${fmt(f.fixture.date)}`;}}catch(e){}

 const day=istDate().replace(/-/g,''), mdir=path.join(GHP,'m',day);fs.mkdirSync(mdir,{recursive:true});
 const jobs=[];
 for(const m of matches){
  const kb=m.home==='KBFC'?'h':'a', gf=kb==='h'?m.hg:m.ag, ga=kb==='h'?m.ag:m.hg, opp=kb==='h'?m.away:m.home;
  const res=gf>ga?'W':gf<ga?'L':'D';
  m.mode='ft'; m.next=next; m.pill=m.pen?'FULL TIME · PENS':'FULL TIME';
  m.tag={W:'ജയിച്ചു മക്കളേ!',L:'സാരമില്ല, തിരിച്ചുവരും!',D:'സമനില!'}[res];
  const prefix=`ft_${m.home}_${m.away}`.toLowerCase();
  if(JSON.parse(fs.readFileSync(path.join(ROOT,'jobs','index.json'),'utf8')).includes(`${day}_${prefix}_post.json`)){console.log('::notice::already queued '+prefix);state.done.push(m.id);continue;}
  const tmp=path.join(ROOT,'out','robot');fs.mkdirSync(tmp,{recursive:true});
  const df=path.join(tmp,prefix+'.json');fs.writeFileSync(df,JSON.stringify(m));
  console.log(sh('node',[path.join(ROOT,'tools','match.js'),df,tmp,prefix],{cwd:ROOT}));
  for(const f of ['_post.jpg','_story.jpg','_reel.mp4','_cover.jpg']) fs.copyFileSync(path.join(tmp,prefix+f),path.join(mdir,prefix+f));
  const all=[...m.scorers.home,...m.scorers.away];
  const line=`${m.home} ${m.hg}–${m.ag} ${m.away}`;
  const head={W:`WE WON! 💛🎉 ${line}`,L:`Full time, ${line}. Tough one 💔`,D:`All square in ${m.venue?m.venue[0]+m.venue.slice(1).toLowerCase():'this one'}. ${line} 🤝`}[res];
  const body={W:'ജയിച്ചു മക്കളേ! Three points for the Blasters.',L:'സാരമില്ല, തിരിച്ചുവരും! We go again.',D:'സമനില! A point each.'}[res];
  const cap=`${head}\n${body}\n\n${all.length?'⚽ '+all.join(' · ')+'\n\n':''}Player of the match for you? Comment below 👇${next?'\n'+next+'.':''}\n\nScore source: ${m.source}. Fan page, not affiliated with ISL or the clubs.\n\n${TAGS} #KBFC${opp}`;
  jobs.push({key:`${day}_${prefix}`,prefix,cap});
  state.done.push(m.id);
 }
 if(!jobs.length){fs.mkdirSync(path.dirname(STATE),{recursive:true});fs.writeFileSync(STATE,JSON.stringify(state,null,1));console.log('::notice::nothing new to post');return;}
 if(process.env.DRY==='1'){console.log('::notice::DRY run rendered '+jobs.map(j=>j.key).join(', ')+' | '+jobs.map(j=>j.cap.split('\n')[0]).join(' / '));return;}
 // push media
 sh('git',['-C',GHP,'add','m/'+day]);
 sh('git',['-C',GHP,'commit','-m','Appu27 robot: full-time media '+day]);
 sh('git',['-C',GHP,'push','origin','HEAD:gh-pages']);
 const SHA=sh('git',['-C',GHP,'rev-parse','HEAD']);
 const u=f=>`https://cdn.jsdelivr.net/gh/bullpranav-code/instagram-automation@${SHA}/m/${day}/${f}`;
 const idxF=path.join(ROOT,'jobs','index.json'), idx=JSON.parse(fs.readFileSync(idxF,'utf8'));
 for(const j of jobs){
  const w=(name,obj)=>{fs.writeFileSync(path.join(ROOT,'jobs',name),JSON.stringify(obj,null,1));if(!idx.includes(name))idx.push(name);};
  w(j.key+'_story.json',{type:'STORY',files:[u(j.prefix+'_story.jpg')],preview:u(j.prefix+'_story.jpg'),caption:'',group:j.key+'_story',format:'Full time',topic:j.prefix.slice(3).toUpperCase().replace('_',' vs ')});
  w(j.key+'_post.json',{type:'POST',files:[u(j.prefix+'_post.jpg')],preview:u(j.prefix+'_post.jpg'),caption:j.cap,group:j.key+'_post',format:'Full time',topic:j.prefix.slice(3).toUpperCase().replace('_',' vs ')});
  w(j.key+'_reel.json',{type:'REEL',files:[u(j.prefix+'_reel.mp4')],preview:u(j.prefix+'_cover.jpg'),caption:j.cap,group:j.key+'_reel',format:'Full time',topic:j.prefix.slice(3).toUpperCase().replace('_',' vs ')});
 }
 fs.writeFileSync(idxF,JSON.stringify(idx));
 fs.mkdirSync(path.dirname(STATE),{recursive:true});fs.writeFileSync(STATE,JSON.stringify(state,null,1));
 sh('git',['-C',REPO,'add','appu27/jobs','appu27/robot']);
 sh('git',['-C',REPO,'commit','-m','Appu27 robot: full-time jobs '+day]);
 sh('git',['-C',REPO,'pull','--rebase','origin','main']);
 sh('git',['-C',REPO,'push','origin','HEAD:main']);
 console.log('::notice::queued '+jobs.map(j=>j.key).join(', '));
}
main().catch(e=>{console.log('::error::'+String(e.message).replace(/\n/g,' ').slice(0,900));process.exit(1)});
