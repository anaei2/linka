const http=require('http'), fs=require('fs'), path=require('path'), crypto=require('crypto');
const express=require('express'), WebSocket=require('ws'), admin=require('firebase-admin');
const app=express(); const server=http.createServer(app); const wss=new WebSocket.Server({server});
const PORT=process.env.PORT||3000;
const DATA_DIR=process.env.DATA_DIR||path.join(__dirname);
const DATA=path.join(DATA_DIR,'data.json'), BACKUP=path.join(DATA_DIR,'data.json.bak');
const MEDIA_DIR=path.join(DATA_DIR,'media');
try{fs.mkdirSync(MEDIA_DIR,{recursive:true})}catch(e){console.error('Não foi possível criar MEDIA_DIR:',e)}
const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const SUPABASE_KEY=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'');
const REMOTE_ENABLED=!!(SUPABASE_URL&&SUPABASE_KEY);
try{fs.mkdirSync(DATA_DIR,{recursive:true})}catch(e){console.error('Não foi possível criar DATA_DIR:',e)}

// Upload binário de mídia: evita transformar vídeos em base64/JSON e deixa o envio bem mais rápido.
app.post('/api/messages/:id/media',express.raw({type:'application/octet-stream',limit:'30mb'}),auth,(req,res)=>{
  const other=String(req.params.id);
  if(!db.users.some(u=>String(u.id)===other))return res.status(404).json({error:'Usuário não encontrado.'});
  if((db.blocked[req.user.id]||[]).includes(other)||(db.blocked[other]||[]).includes(req.user.id))return res.status(403).json({error:'Este contato está bloqueado.'});
  const type=String(req.headers['x-media-type']||'');
  if(!/^(image\/|video\/)/.test(type))return res.status(400).json({error:'Tipo de mídia inválido.'});
  const body=Buffer.isBuffer(req.body)?req.body:Buffer.alloc(0);
  if(!body.length||body.length>22*1024*1024)return res.status(400).json({error:'Foto ou vídeo inválido ou muito grande.'});
  const mid=id(),ext=(type.split('/')[1]||'bin').replace(/[^a-z0-9.+-]/gi,'').slice(0,10)||'bin';
  const filename=mid+'.'+ext;
  try{fs.writeFileSync(path.join(MEDIA_DIR,filename),body)}catch(e){return res.status(500).json({error:'Não foi possível salvar a mídia.'})}
  const u=db.users.find(x=>x.id===other);
  const m={id:mid,from:req.user.id,to:other,type:'media',mediaFile:filename,mediaType:type,createdAt:Date.now(),status:'sent'};
  const k=pair(req.user.id,other);db.messages[k]??=[];db.messages[k].push(m);db.messages[k]=db.messages[k].slice(-500);save();
  const delivered=sendUser(other,{type:'message',message:clientMessage(m)});
  if(delivered>0){m.status='delivered';m.deliveredAt=Date.now();save();sendUser(req.user.id,{type:'message_status',messageId:m.id,message:clientMessage(m),status:'delivered'})}
  const preview=type.startsWith('video/')?'Vídeo recebido':'Foto recebida';
  const note=addNotification(other,{kind:'message',title:req.user.name||'Nova mensagem',body:preview,from:req.user.id,chatId:req.user.id});
  pushUser(other,{title:note.title,body:note.body,icon:'/icon-192.png',badge:'/icon-192.png',data:{chatId:req.user.id,notificationId:note.id}}).catch(()=>{});
  res.json(clientMessage(m));
});
app.post('/api/messages/:id/file',express.raw({type:'application/octet-stream',limit:'30mb'}),auth,(req,res)=>{
  const other=String(req.params.id); if(!db.users.some(u=>String(u.id)===other))return res.status(404).json({error:'Usuário não encontrado.'});
  if((db.blocked[req.user.id]||[]).includes(other)||(db.blocked[other]||[]).includes(req.user.id))return res.status(403).json({error:'Este contato está bloqueado.'});
  const type=String(req.headers['x-file-type']||'application/octet-stream'); let name=String(req.headers['x-file-name']||'arquivo');try{name=decodeURIComponent(name)}catch{}name=name.slice(0,160);
  const body=Buffer.isBuffer(req.body)?req.body:Buffer.alloc(0); if(!body.length||body.length>25*1024*1024)return res.status(400).json({error:'Arquivo inválido ou maior que 25 MB.'});
  const mid=id(),ext=(name.split('.').pop()||'bin').replace(/[^a-z0-9]/gi,'').slice(0,10)||'bin',filename=mid+'.'+ext;
  try{fs.writeFileSync(path.join(MEDIA_DIR,filename),body)}catch{return res.status(500).json({error:'Não foi possível salvar o arquivo.'})}
  const m={id:mid,from:req.user.id,to:other,type:'file',fileName:name,fileType:type,fileSize:body.length,fileUrl:'/api/file/'+encodeURIComponent(mid),createdAt:Date.now(),status:'sent'};
  const k=pair(req.user.id,other);db.messages[k]??=[];db.messages[k].push(m);db.messages[k]=db.messages[k].slice(-500);save();
  const delivered=sendUser(other,{type:'message',message:clientMessage(m)});if(delivered>0){m.status='delivered';m.deliveredAt=Date.now();save();sendUser(req.user.id,{type:'message_status',messageId:m.id,message:clientMessage(m),status:'delivered'})}
  const note=addNotification(other,{kind:'message',title:req.user.name||'Nova mensagem',body:'📎 '+name,from:req.user.id,chatId:req.user.id});pushUser(other,{title:note.title,body:note.body,icon:'/icon-192.png',badge:'/icon-192.png',data:{chatId:req.user.id,notificationId:note.id}}).catch(()=>{});
  res.json(clientMessage(m));
});
app.get('/api/file/:messageId',(req,res,next)=>{const qt=String(req.query?.token||'');if(qt)req.headers.authorization='Bearer '+qt;auth(req,res,next)},(req,res)=>{let found=null;for(const list of Object.values(db.messages))for(const m of list)if(String(m.id)===String(req.params.messageId)){found=m;break}if(!found||found.type!=='file')return res.status(404).end();const fn=path.basename(String(found.fileUrl||'').split('/').pop()||'');const files=fs.readdirSync(MEDIA_DIR);const candidate=files.find(x=>x.startsWith(found.id+'.'));if(!candidate)return res.status(404).end();res.setHeader('Content-Type',found.fileType||'application/octet-stream');res.setHeader('Content-Disposition',`inline; filename="${String(found.fileName||'arquivo').replace(/"/g,'')}"`);fs.createReadStream(path.join(MEDIA_DIR,candidate)).pipe(res)});
app.use(express.json({limit:'12mb'}));
app.get('/firebase-messaging-sw.js',(req,res)=>{
  const c=firebaseConfig();
  if(!c.apiKey||!c.projectId||!c.messagingSenderId||!c.appId){return res.status(503).type('application/javascript').send('/* Firebase FCM not configured */');}
  res.type('application/javascript').send(`importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');
firebase.initializeApp(${JSON.stringify(c)});
const messaging=firebase.messaging();
messaging.onBackgroundMessage((payload)=>{
  const n=payload.notification||{}; const d=payload.data||{};
  const title=d.title||n.title||'Linka'; const body=d.body||n.body||'Nova notificação';
  self.registration.showNotification(title,{body,icon:n.icon||'/icon-192.png',badge:n.badge||'/icon-192.png',tag:d.chatId?'linka-'+d.chatId:'linka',data:d});
});
self.addEventListener('notificationclick',(event)=>{event.notification.close();const d=event.notification.data||{};const url=d.chatId?'/?chat='+encodeURIComponent(d.chatId):'/';event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{for(const c of cs){if('focus' in c){c.navigate(url);return c.focus()}}return clients.openWindow(url)}));});`);
});
app.use(express.static(path.join(__dirname,'www')));
let db={users:[],contacts:{},messages:{},sessions:{},fcmTokens:{},notifications:{},callHistory:{}};
const pendingCalls=new Map();
const endedCallIds=new Set();
let firebaseReady=false;
function initFirebase(){
  try{
    if(admin.apps.length){firebaseReady=true;return}
    const raw=String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||'').trim();
    if(!raw){console.warn('Firebase FCM: FIREBASE_SERVICE_ACCOUNT_JSON não configurado.');return}
    const serviceAccount=JSON.parse(raw);
    admin.initializeApp({credential:admin.credential.cert(serviceAccount)});
    firebaseReady=true;
    console.log('Firebase FCM ativado.');
  }catch(e){console.error('Falha ao inicializar Firebase FCM:',e.message)}
}
function firebaseConfig(){return {
  apiKey:process.env.FIREBASE_API_KEY||'',
  authDomain:process.env.FIREBASE_AUTH_DOMAIN||'',
  projectId:process.env.FIREBASE_PROJECT_ID||'',
  storageBucket:process.env.FIREBASE_STORAGE_BUCKET||'',
  messagingSenderId:process.env.FIREBASE_MESSAGING_SENDER_ID||'',
  appId:process.env.FIREBASE_APP_ID||''
}}

function normalizeDB(x){
  db=x&&typeof x==='object'?x:db;
  db.users??=[]; db.contacts??={}; db.messages??={}; db.sessions??={}; db.fcmTokens??={}; db.notifications??={}; db.callHistory??={}; db.blocked??={}; db.statuses??={};
  return db;
}
function readLocal(){
  try{
    if(fs.existsSync(DATA)) return JSON.parse(fs.readFileSync(DATA,'utf8'));
    if(fs.existsSync(BACKUP)) return JSON.parse(fs.readFileSync(BACKUP,'utf8'));
  }catch(e){console.error('Falha ao ler armazenamento local:',e)}
  return null;
}
async function supabaseRequest(pathname,options={}){
  if(!REMOTE_ENABLED) return null;
  const r=await fetch(SUPABASE_URL+'/rest/v1/'+pathname,{
    ...options,
    headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY,'Content-Type':'application/json',Prefer:'return=representation',...(options.headers||{})}
  });
  if(!r.ok){const body=await r.text().catch(()=> '');throw new Error(`Supabase ${r.status}: ${body.slice(0,500)}`)}
  const text=await r.text(); return text?JSON.parse(text):null;
}
async function loadRemote(){
  if(!REMOTE_ENABLED)return null;
  try{
    const rows=await supabaseRequest('linka_state?id=eq.1&select=data,updated_at',{method:'GET'});
    return rows?.[0]?.data||null;
  }catch(e){console.error('Falha ao carregar banco Supabase:',e);return null}
}
let saveTimer=null, saveRunning=false, saveAgain=false;
function writeLocal(){
  try{
    const tmp=DATA+'.tmp', text=JSON.stringify(db);
    fs.writeFileSync(tmp,text);
    if(fs.existsSync(DATA)){try{fs.copyFileSync(DATA,BACKUP)}catch(e){}}
    fs.renameSync(tmp,DATA);
  }catch(e){console.error('Falha ao salvar localmente:',e)}
}
async function pushRemote(snapshot){
  if(!REMOTE_ENABLED)return;
  try{
    await supabaseRequest('linka_state?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({id:1,data:snapshot,updated_at:new Date().toISOString()})});
  }catch(e){console.error('Falha ao salvar no Supabase:',e)}
}
function save(){
  writeLocal();
  if(!REMOTE_ENABLED)return;
  clearTimeout(saveTimer);
  saveTimer=setTimeout(async()=>{
    if(saveRunning){saveAgain=true;return}
    saveRunning=true; saveAgain=false;
    const snapshot=JSON.parse(JSON.stringify(db));
    await pushRemote(snapshot);
    saveRunning=false;
    if(saveAgain)save();
  },250);
}

function id(){return crypto.randomBytes(12).toString('hex')}
function hash(p,s=crypto.randomBytes(16).toString('hex')){return {s,h:crypto.scryptSync(p,s,64).toString('hex')}}
function check(p,u){try{return crypto.timingSafeEqual(Buffer.from(hash(p,u.s).h,'hex'),Buffer.from(u.h,'hex'))}catch{return false}}
function safe(u,self=false){return {id:u.id,username:u.username,name:u.name,status:u.status,photo:u.photo||'',...(self?{chatBg:u.chatBg||''}:{}),lastSeen:u.lastSeen||u.createdAt,online:isUserOnline(u.id),createdAt:u.createdAt}}
function isUserOnline(uid){for(const [token,idv] of sessions)if(idv===uid&&!offlinePresence.has(token)&&[...wss.clients].some(c=>c.readyState===1&&c.token===token))return true;const u=db.users.find(x=>x.id===uid);return !!(u&&u.lastSeen&&Date.now()-u.lastSeen<60000)}
function touch(uid){const u=db.users.find(x=>x.id===uid);if(u){u.lastSeen=Date.now();save()}}
const sessions=new Map();
const offlinePresence=new Set();
function auth(req,res,next){const t=(req.headers.authorization||'').replace('Bearer ','');let uid=sessions.get(t)||db.sessions[t];if(uid){sessions.set(t,uid)}if(!uid)return res.status(401).json({error:'Sessão expirada'});req.user=db.users.find(x=>x.id===uid);if(!req.user)return res.status(401).json({error:'Usuário não encontrado'});next()}
function pair(a,b){return [a,b].sort().join(':')}
function sendUser(uid,msg){let count=0;for(const [token,idv] of sessions){if(idv!==uid)continue;for(const c of wss.clients)if(c.readyState===1&&c.token===token){try{c.send(JSON.stringify(msg));count++}catch{}}}return count}
function addNotification(uid,n){db.notifications[uid]??=[];const item={id:id(),createdAt:Date.now(),read:false,...n};db.notifications[uid].unshift(item);db.notifications[uid]=db.notifications[uid].slice(0,100);save();sendUser(uid,{type:'notification',notification:item});return item}
async function pushUser(uid,payload){
  if(!firebaseReady)return {sent:0,skipped:true,error:'Firebase Admin não inicializado'};
  const tokens=[...(db.fcmTokens[uid]||[])].filter(Boolean);
  if(!tokens.length)return {sent:0,skipped:true,error:'Usuário sem token FCM'};
  const data={...Object.fromEntries(Object.entries(payload.data||{}).map(([k,v])=>[String(k),String(v)])),title:String(payload.title||'Linka'),body:String(payload.body||'')};
  const link=payload.data?.chatId?`/?chat=${encodeURIComponent(payload.data.chatId)}`:'/';
  const message={
    tokens,
    data,
    webpush:{
      headers:{Urgency:payload.data?.type==='call'?'high':'normal'},
      notification:{icon:payload.icon||'/icon-192.png',badge:payload.badge||'/icon-192.png',tag:payload.tag||'linka',renotify:true,requireInteraction:payload.data?.type==='call'},
      fcmOptions:{link}
    }
  };
  try{
    const response=await admin.messaging().sendEachForMulticast(message);
    const invalid=[];
    response.responses.forEach((r,i)=>{
      const code=r.error?.code||'';
      if(!r.success && ['messaging/registration-token-not-registered','messaging/invalid-registration-token','messaging/invalid-argument'].includes(code)) invalid.push(tokens[i]);
    });
    if(invalid.length){db.fcmTokens[uid]=(db.fcmTokens[uid]||[]).filter(t=>!invalid.includes(t));save()}
    if(response.failureCount)console.warn(`FCM: ${response.successCount} enviado(s), ${response.failureCount} falhou(aram) para ${uid}.`);
    return {sent:response.successCount,failed:response.failureCount};
  }catch(e){console.error('Falha ao enviar FCM:',e.message);return {sent:0,failed:tokens.length,error:e.message};}
}

app.post('/api/register',(req,res)=>{let {name,username,password}=req.body||{};name=String(name||'').trim();username=String(username||'').trim().toLowerCase().replace(/^@/,'');password=String(password||'');if(name.length<2||username.length<3||password.length<6)return res.status(400).json({error:'Use nome, usuário com pelo menos 3 caracteres e senha com 6 caracteres.'});if(!/^[a-z0-9._-]+$/.test(username))return res.status(400).json({error:'Usuário: apenas letras, números, ponto, _ ou -.'});if(db.users.some(u=>u.username===username))return res.status(409).json({error:'Esse usuário já existe.'});const x=hash(password),u={id:id(),name,username,status:'Disponível',photo:'',s:x.s,h:x.h,createdAt:Date.now()};db.users.push(u);db.contacts[u.id]=[];save();const token=id();sessions.set(token,u.id);db.sessions[token]=u.id;save();res.json({token,user:safe(u,true)});});
app.post('/api/login',(req,res)=>{const username=String(req.body?.username||'').trim().toLowerCase().replace(/^@/,'');const password=String(req.body?.password||'');const u=db.users.find(x=>x.username===username);if(!u||!check(password,u))return res.status(401).json({error:'Usuário ou senha inválidos.'});const token=id();sessions.set(token,u.id);db.sessions[token]=u.id;save();res.json({token,user:safe(u,true)});});
app.post('/api/logout',auth,(req,res)=>{touch(req.user.id);for(const [t,u] of sessions)if(u===req.user.id){sessions.delete(t);delete db.sessions[t]}for(const t of Object.keys(db.sessions))if(db.sessions[t]===req.user.id)delete db.sessions[t];save();res.json({ok:true})});
app.post('/api/ping',auth,(req,res)=>{touch(req.user.id);res.json({ok:true,lastSeen:req.user.lastSeen})});
app.get('/api/me',auth,(req,res)=>res.json({user:safe(req.user,true)}));
app.put('/api/me',auth,(req,res)=>{const {name,status,photo,chatBg,settings}=req.body||{};if(typeof name==='string'&&name.trim())req.user.name=name.trim().slice(0,40);if(typeof status==='string')req.user.status=status.trim().slice(0,100);if(typeof photo==='string'&&photo.length<4000000)req.user.photo=photo;if(typeof chatBg==='string'&&chatBg.length<1500000)req.user.chatBg=chatBg;if(settings&&typeof settings==='object')req.user.settings={...(req.user.settings||{}),...settings};save();res.json({user:safe(req.user,true)});});
app.get('/api/users',auth,(req,res)=>{const q=String(req.query.q||'').trim().toLowerCase().replace(/^@/,'');if(q.length<2)return res.json([]);const xs=db.users.filter(u=>u.id!==req.user.id&&(u.username.includes(q)||u.name.toLowerCase().includes(q))).slice(0,20);res.json(xs.filter(u=>!(db.blocked[req.user.id]||[]).includes(u.id)).map(safe));});
app.get('/api/contacts',auth,(req,res)=>{const ids=db.contacts[req.user.id]||[];res.json(ids.map(i=>db.users.find(u=>u.id===i)).filter(Boolean).map(safe));});
app.get('/api/conversations',auth,(req,res)=>{const ids=db.contacts[req.user.id]||[];res.json(ids.filter(id=>db.users.some(u=>String(u.id)===String(id))));});
app.get('/api/conversation-previews',auth,(req,res)=>{const ids=db.contacts[req.user.id]||[];const out=[];for(const other of ids){const list=db.messages[pair(req.user.id,other)]||[];const visible=list.filter(m=>!(Array.isArray(m.deletedForMe)&&m.deletedForMe.some(x=>String(x)===String(req.user.id))));const m=visible[visible.length-1];if(m)out.push({id:String(other),message:clientMessage(m)});}out.sort((a,b)=>Number(b.message?.createdAt||0)-Number(a.message?.createdAt||0));res.json(out);});
app.get('/api/users/:id',auth,(req,res)=>{const u=db.users.find(x=>x.id===req.params.id);if(!u)return res.status(404).json({error:'Usuário não encontrado.'});res.json(safe(u));});
app.post('/api/contacts/:id',auth,(req,res)=>{const other=db.users.find(u=>u.id===req.params.id);if(!other||other.id===req.user.id)return res.status(404).json({error:'Usuário não encontrado.'});if((db.blocked[req.user.id]||[]).includes(other.id))return res.status(403).json({error:'Desbloqueie este contato antes de adicionar.'});db.contacts[req.user.id]??=[];db.contacts[other.id]??=[];if(!db.contacts[req.user.id].includes(other.id))db.contacts[req.user.id].push(other.id);if(!db.contacts[other.id].includes(req.user.id))db.contacts[other.id].push(req.user.id);save();const note=addNotification(other.id,{kind:'contact',title:'Novo contato',body:(req.user.name||'Alguém')+' adicionou você aos contatos.',from:req.user.id});sendUser(other.id,{type:'contact_added',by:safe(req.user)});pushUser(other.id,{title:note.title,body:note.body,icon:'/icon-192.png',badge:'/icon-192.png',data:{notificationId:note.id}}).catch(()=>{});res.json({user:safe(other)});});
app.delete('/api/contacts/:id',auth,(req,res)=>{db.contacts[req.user.id]=(db.contacts[req.user.id]||[]).filter(x=>x!==req.params.id);save();res.json({ok:true})});
app.get('/api/blocked',auth,(req,res)=>{const ids=db.blocked[req.user.id]||[];res.json(ids.map(i=>db.users.find(u=>u.id===i)).filter(Boolean).map(safe))});
app.post('/api/blocked/:id',auth,(req,res)=>{const other=db.users.find(u=>u.id===req.params.id);if(!other||other.id===req.user.id)return res.status(404).json({error:'Usuário não encontrado.'});db.blocked[req.user.id]??=[];if(!db.blocked[req.user.id].includes(other.id))db.blocked[req.user.id].push(other.id);save();res.json({ok:true});});
app.delete('/api/blocked/:id',auth,(req,res)=>{db.blocked[req.user.id]=(db.blocked[req.user.id]||[]).filter(x=>x!==req.params.id);save();res.json({ok:true});});
app.get('/api/statuses',auth,(req,res)=>{
  const blocked=new Set((db.blocked[req.user.id]||[]).map(String));
  const ids=[req.user.id,...(db.contacts[req.user.id]||[]).filter(id=>!blocked.has(String(id)))];
  const now=Date.now(); const list=[];
  for(const uid of ids){
    const u=db.users.find(x=>String(x.id)===String(uid));
    if(!u) continue;
    let raw=db.statuses[uid];
    if(raw && !Array.isArray(raw)) raw=[raw];
    if(!Array.isArray(raw)) continue;
    raw=raw.filter(st=>st && now-Number(st.createdAt||0)<=86400000);
    db.statuses[uid]=raw;
    for(const st of raw){
      st.id=st.id||String(st.createdAt||'status-'+uid);
      st.likes=Array.isArray(st.likes)?st.likes:[]; st.views=Array.isArray(st.views)?st.views:[];
      const isMine=String(uid)===String(req.user.id);
      list.push({statusId:st.id,user:safe(u),text:st.text||'',mediaUrl:(st.media||st.mediaFile)?('/api/status-media/'+encodeURIComponent(uid)+'/'+encodeURIComponent(st.id)):'' ,mediaType:st.mediaType||'',createdAt:st.createdAt,likeCount:st.likes.length,likedByMe:st.likes.some(x=>String(x)===String(req.user.id)),viewedByMe:!isMine&&st.views.some(v=>String(v.userId)===String(req.user.id)),viewCount:isMine?st.views.length:undefined});
    }
  }
  list.sort((a,b)=>Number(a.createdAt)-Number(b.createdAt));
  res.json(list);
});
app.post('/api/statuses',auth,(req,res)=>{
  const text=String(req.body?.text||'').trim().slice(0,500), media=String(req.body?.media||''), mediaType=String(req.body?.mediaType||'');
  if(!text&&!media)return res.status(400).json({error:'Adicione um texto, foto ou vídeo.'});
  if(media){if(!/^data:(image\/|video\/)[A-Za-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/.test(media))return res.status(400).json({error:'Foto ou vídeo inválido.'});if(media.length>11*1024*1024)return res.status(400).json({error:'A mídia do status é muito grande.'});if(!/^(image\/|video\/)/.test(mediaType))return res.status(400).json({error:'Tipo de mídia inválido.'});}
  db.statuses[req.user.id]=Array.isArray(db.statuses[req.user.id])?db.statuses[req.user.id]: (db.statuses[req.user.id]?[db.statuses[req.user.id]]:[]);
  const st={id:id(),text,media:media||'',mediaType:mediaType||'',createdAt:Date.now(),likes:[],views:[]};
  db.statuses[req.user.id].push(st); db.statuses[req.user.id]=db.statuses[req.user.id].slice(-20); save(); res.json({ok:true,statusId:st.id});
});
function findStatus(owner,statusId){
  const raw=db.statuses[owner]; const arr=Array.isArray(raw)?raw:(raw?[raw]:[]); return arr.find(st=>String(st.id||st.createdAt)===String(statusId))||null;
}
app.get('/api/status-media/:owner/:statusId',(req,res,next)=>{const qt=String(req.query?.token||'');if(qt)req.headers.authorization='Bearer '+qt;auth(req,res,next)},(req,res)=>{
  const owner=String(req.params.owner),sid=String(req.params.statusId);
  const ids=db.contacts[req.user.id]||[]; if(owner!==String(req.user.id)&&!ids.map(String).includes(owner))return res.status(403).end();
  const st=findStatus(owner,sid); if(!st||Date.now()-Number(st.createdAt||0)>86400000||(!st.media&&!st.mediaFile))return res.status(404).end();
  try{let buf,type=String(st.mediaType||'application/octet-stream');if(st.mediaFile)buf=fs.readFileSync(path.join(MEDIA_DIR,path.basename(st.mediaFile)));else{const parts=String(st.media).match(/^data:([^;]+);base64,(.*)$/s);if(!parts)return res.status(404).end();type=parts[1];buf=Buffer.from(parts[2],'base64')}res.setHeader('Content-Type',type);res.setHeader('Content-Length',String(buf.length));res.setHeader('Cache-Control','private, max-age=3600');res.end(buf)}catch{res.status(404).end()}
});
app.post('/api/statuses/:owner/:statusId/like',auth,(req,res)=>{const owner=String(req.params.owner),statusId=String(req.params.statusId);if(owner===String(req.user.id))return res.status(400).json({error:'Você não pode curtir seu próprio status.'});const ids=db.contacts[req.user.id]||[];if(!ids.map(String).includes(owner))return res.status(403).json({error:'Você precisa ter este contato para curtir o status.'});const st=findStatus(owner,statusId),u=db.users.find(x=>String(x.id)===owner);if(!st||!u||Date.now()-Number(st.createdAt||0)>86400000)return res.status(404).json({error:'Status não encontrado.'});st.likes=Array.isArray(st.likes)?st.likes:[];const i=st.likes.findIndex(x=>String(x)===String(req.user.id));const liked=i<0;if(liked)st.likes.push(req.user.id);else st.likes.splice(i,1);save();if(liked){const note=addNotification(owner,{kind:'status_like',title:'Curtida no seu status',body:(req.user.name||'Alguém')+' curtiu seu status.',from:req.user.id});pushUser(owner,{title:note.title,body:note.body,icon:'/icon-192.png',badge:'/icon-192.png',data:{notificationId:note.id,statusUserId:owner,statusId}}).catch(()=>{});}sendUser(owner,{type:'status_like',statusUserId:owner,statusId,from:req.user.id,liked});res.json({ok:true,liked,likeCount:st.likes.length});});
app.post('/api/statuses/:owner/:statusId/view',auth,(req,res)=>{const owner=String(req.params.owner),statusId=String(req.params.statusId);if(owner===String(req.user.id))return res.json({ok:true,viewed:false});const ids=db.contacts[req.user.id]||[];if(!ids.map(String).includes(owner))return res.status(403).json({error:'Você precisa ter este contato para ver o status.'});const st=findStatus(owner,statusId),u=db.users.find(x=>String(x.id)===owner);if(!st||!u||Date.now()-Number(st.createdAt||0)>86400000)return res.status(404).json({error:'Status não encontrado.'});st.views=Array.isArray(st.views)?st.views:[];if(!st.views.some(v=>String(v.userId)===String(req.user.id))){st.views.push({userId:req.user.id,viewedAt:Date.now()});save();}res.json({ok:true,viewCount:st.views.length});});
app.get('/api/statuses/:owner/:statusId/views',auth,(req,res)=>{const owner=String(req.params.owner),statusId=String(req.params.statusId);if(owner!==String(req.user.id))return res.status(403).json({error:'Somente o dono do status pode ver as visualizações.'});const st=findStatus(owner,statusId);if(!st||Date.now()-Number(st.createdAt||0)>86400000)return res.status(404).json({error:'Status não encontrado.'});st.views=Array.isArray(st.views)?st.views:[];const viewers=st.views.map(v=>db.users.find(u=>String(u.id)===String(v.userId))).filter(Boolean).map(u=>safe(u));res.json({count:viewers.length,viewers});});
app.delete('/api/statuses/:statusId',auth,(req,res)=>{const uid=String(req.user.id),sid=String(req.params.statusId);const raw=db.statuses[uid];const arr=Array.isArray(raw)?raw:(raw?[raw]:[]);db.statuses[uid]=arr.filter(st=>String(st.id||st.createdAt)!==sid);save();res.json({ok:true});});
app.delete('/api/statuses',auth,(req,res)=>{delete db.statuses[req.user.id];save();res.json({ok:true});});

app.get('/api/firebase-config',(req,res)=>{const c=firebaseConfig();if(!c.apiKey||!c.projectId||!c.messagingSenderId||!c.appId||!process.env.FIREBASE_VAPID_KEY)return res.status(503).json({error:'Firebase FCM ainda não está configurado no servidor.'});res.json({...c,vapidKey:process.env.FIREBASE_VAPID_KEY});});
app.get('/api/fcm/status',auth,(req,res)=>res.json({registered:(db.fcmTokens[req.user.id]||[]).length>0, firebase:firebaseReady}));
app.post('/api/fcm/token',auth,(req,res)=>{const token=String(req.body?.token||'').trim();if(!token||token.length<20)return res.status(400).json({error:'Token FCM inválido.'});db.fcmTokens[req.user.id]??=[];const list=db.fcmTokens[req.user.id];if(!list.includes(token))list.push(token);db.fcmTokens[req.user.id]=list.slice(-10);save();res.json({ok:true});});
app.delete('/api/fcm/token',auth,(req,res)=>{const token=String(req.body?.token||'').trim();if(token)db.fcmTokens[req.user.id]=(db.fcmTokens[req.user.id]||[]).filter(t=>t!==token);save();res.json({ok:true})});
app.post('/api/fcm/test',auth,async(req,res)=>{const note=await pushUser(req.user.id,{title:'Linka',body:'Sua notificação do Linka está funcionando! 🔔',icon:'/icon-192.png',badge:'/icon-192.png',data:{type:'test'}});if(!note.sent)return res.status(503).json({ok:false,error:note.error||'Nenhum dispositivo FCM recebeu a mensagem.',details:note});res.json({ok:true,details:note});});
app.get('/api/calls/pending',auth,(req,res)=>{const list=pendingCalls.get(req.user.id)||[];res.json(list);});
app.get('/api/notifications',auth,(req,res)=>{const list=db.notifications[req.user.id]||[];res.json(list.slice(0,100));});
app.post('/api/notifications/read-all',auth,(req,res)=>{const list=db.notifications[req.user.id]||[];list.forEach(n=>n.read=true);save();res.json({ok:true});});
app.post('/api/notifications/:id/read',auth,(req,res)=>{const n=(db.notifications[req.user.id]||[]).find(x=>x.id===req.params.id);if(!n)return res.status(404).json({error:'Notificação não encontrada.'});n.read=true;save();res.json({ok:true});});
app.get('/api/calls',auth,(req,res)=>{
  const list=db.callHistory[req.user.id]||[];
  const out=list.slice().sort((a,b)=>(b.endedAt||b.startedAt||0)-(a.endedAt||a.startedAt||0)).slice(0,100).map(c=>{
    const otherId=c.from===req.user.id?c.to:c.from;
    const other=db.users.find(u=>u.id===otherId);
    return {...c,other:other?safe(other):null};
  });
  res.json(out);
});
function addCallHistory(uid,entry){db.callHistory[uid]??=[];db.callHistory[uid].push(entry);db.callHistory[uid]=db.callHistory[uid].slice(-200);}
function createCallRecord(from,to,callId,mode='audio'){
  if(!callId||!from||!to)return;
  const entry={id:callId,from,to,mode:mode==='video'?'video':'audio',status:'ringing',startedAt:Date.now(),connectedAt:null,endedAt:null,duration:0};
  addCallHistory(from,entry);addCallHistory(to,entry);save();
}
function updateCallRecord(callId,patch){
  if(!callId)return;
  let changed=false;
  for(const uid of Object.keys(db.callHistory)){
    const c=(db.callHistory[uid]||[]).find(x=>x.id===callId);
    if(c){Object.assign(c,patch);changed=true;}
  }
  if(changed)save();
}

app.delete('/api/messages/:id',auth,(req,res)=>{const other=req.params.id;if(!db.users.some(u=>u.id===other))return res.status(404).json({error:'Usuário não encontrado.'});const k=pair(req.user.id,other);delete db.messages[k];save();res.json({ok:true});});
app.patch('/api/messages/:id/:messageId',auth,(req,res)=>{const other=String(req.params.id),mid=String(req.params.messageId);if(!db.users.some(u=>String(u.id)===other))return res.status(404).json({error:'Usuário não encontrado.'});const list=db.messages[pair(req.user.id,other)]||[];const m=list.find(x=>String(x.id)===mid);if(!m)return res.status(404).json({error:'Mensagem não encontrada.'});if(String(m.from)!==String(req.user.id)||m.type!=='text'||m.deletedForEveryone)return res.status(403).json({error:'Só é possível editar suas mensagens de texto.'});const text=String(req.body?.text||'').trim();if(!text||text.length>4000)return res.status(400).json({error:'Mensagem inválida.'});m.text=text;m.editedAt=Date.now();save();sendUser(other,{type:'message_updated',message:clientMessage(m)});res.json(clientMessage(m));});
app.delete('/api/messages/:id/:messageId',auth,(req,res)=>{const other=String(req.params.id),mid=String(req.params.messageId),mode=req.body?.mode==='everyone'?'everyone':'me';if(!db.users.some(u=>String(u.id)===other))return res.status(404).json({error:'Usuário não encontrado.'});const list=db.messages[pair(req.user.id,other)]||[];const m=list.find(x=>String(x.id)===mid);if(!m)return res.status(404).json({error:'Mensagem não encontrada.'});if(mode==='everyone'){if(String(m.from)!==String(req.user.id))return res.status(403).json({error:'Só quem enviou pode apagar para todos.'});m.deletedForEveryone=true;m.deletedAt=Date.now();m.text='Esta mensagem foi apagada';m.audio='';m.type='text';save();sendUser(other,{type:'message_updated',message:clientMessage(m)});return res.json(clientMessage(m));}m.deletedForMe=Array.isArray(m.deletedForMe)?m.deletedForMe:[];if(!m.deletedForMe.some(x=>String(x)===String(req.user.id)))m.deletedForMe.push(req.user.id);save();res.json({ok:true,id:mid,hidden:true});});
app.delete('/api/calls/:id',auth,(req,res)=>{const other=req.params.id;if(!db.users.some(u=>u.id===other))return res.status(404).json({error:'Usuário não encontrado.'});const list=db.callHistory[req.user.id]||[];db.callHistory[req.user.id]=list.filter(c=>{const otherId=String(c.from)===String(req.user.id)?String(c.to):String(c.from);return otherId!==String(other)});save();res.json({ok:true});});
function clientMessage(m){
  if(!m)return m;
  const out={...m};
  if(out.type==='media' && (out.media || out.mediaFile)){
    out.mediaUrl='/api/media/'+encodeURIComponent(out.id);
    delete out.media;
    delete out.mediaFile;
  }
  return out;
}
app.post('/api/messages/:id/:messageId/react',auth,(req,res)=>{const other=String(req.params.id),mid=String(req.params.messageId),emoji=String(req.body?.emoji||'').trim();if(!['❤️','😂','👍','😮','😢'].includes(emoji))return res.status(400).json({error:'Reação inválida.'});const list=db.messages[pair(req.user.id,other)]||[],m=list.find(x=>String(x.id)===mid);if(!m)return res.status(404).json({error:'Mensagem não encontrada.'});m.reactions=m.reactions||{};for(const e of Object.keys(m.reactions))m.reactions[e]=(m.reactions[e]||[]).filter(x=>String(x)!==String(req.user.id));m.reactions[emoji]=m.reactions[emoji]||[];m.reactions[emoji].push(req.user.id);save();const out=clientMessage(m);sendUser(other,{type:'message_updated',message:out});res.json(out)});
app.post('/api/messages/:id/:messageId/pin',auth,(req,res)=>{const other=String(req.params.id),mid=String(req.params.messageId),list=db.messages[pair(req.user.id,other)]||[],m=list.find(x=>String(x.id)===mid);if(!m)return res.status(404).json({error:'Mensagem não encontrada.'});m.pinned=req.body?.pinned!==false;m.pinnedBy=req.user.id;m.pinnedAt=m.pinned?Date.now():null;save();const out=clientMessage(m);sendUser(other,{type:'message_updated',message:out});res.json(out)});
app.post('/api/messages/:id/:messageId/forward',auth,(req,res)=>{const other=String(req.params.id),target=String(req.body?.targetId||''),list=db.messages[pair(req.user.id,other)]||[],src=list.find(x=>String(x.id)===String(req.params.messageId));if(!src||!db.users.some(u=>String(u.id)===target))return res.status(404).json({error:'Mensagem ou contato não encontrado.'});const m={...src,id:id(),from:req.user.id,to:target,createdAt:Date.now(),status:'sent',forwarded:true,deletedForMe:[],deletedForEveryone:false};delete m.reactions;delete m.pinned;const k=pair(req.user.id,target);db.messages[k]??=[];db.messages[k].push(m);db.messages[k]=db.messages[k].slice(-500);save();const delivered=sendUser(target,{type:'message',message:clientMessage(m)});if(delivered>0){m.status='delivered';save();}const preview=m.type==='audio'?'Áudio encaminhado':m.type==='file'?'📎 '+m.fileName:m.type==='media'?'Mídia encaminhada':m.text||'Mensagem encaminhada';const note=addNotification(target,{kind:'message',title:req.user.name||'Nova mensagem',body:preview,from:req.user.id,chatId:req.user.id});pushUser(target,{title:note.title,body:note.body,icon:'/icon-192.png',badge:'/icon-192.png',data:{chatId:req.user.id,notificationId:note.id}}).catch(()=>{});res.json(clientMessage(m))});
app.get('/api/media/:messageId',(req,res,next)=>{const qt=String(req.query?.token||'');if(qt){req.headers.authorization='Bearer '+qt}auth(req,res,next)},(req,res)=>{
  const mid=String(req.params.messageId);
  let found=null;
  for(const list of Object.values(db.messages)){
    if(Array.isArray(list)){ const m=list.find(x=>String(x.id)===mid); if(m){found=m;break;} }
  }
  if(!found || found.type!=='media' || (!found.media && !found.mediaFile)) return res.status(404).end();
  const pairKey=pair(found.from,found.to);
  const allowed=(String(req.user.id)===String(found.from)||String(req.user.id)===String(found.to));
  if(!allowed) return res.status(403).end();
  let buf,contentType=String(found.mediaType||'application/octet-stream');
  try{
    if(found.mediaFile){buf=fs.readFileSync(path.join(MEDIA_DIR,path.basename(found.mediaFile)))}
    else {const parts=String(found.media).match(/^data:([^;]+);base64,(.*)$/s);if(!parts)return res.status(404).end();contentType=parts[1];buf=Buffer.from(parts[2],'base64')}
  }catch{return res.status(404).end()}
  res.setHeader('Content-Type',contentType);
  res.setHeader('Content-Length',String(buf.length));
  res.setHeader('Cache-Control','private, max-age=86400');
  res.end(buf);
});
app.get('/api/messages/:id',auth,(req,res)=>{const other=req.params.id;if(!db.users.some(u=>u.id===other))return res.status(404).json({error:'Usuário não encontrado.'});res.json((db.messages[pair(req.user.id,other)]||[]).filter(m=>!(Array.isArray(m.deletedForMe)&&m.deletedForMe.some(x=>String(x)===String(req.user.id)))).map(clientMessage));})
app.post('/api/messages/:id/read',auth,(req,res)=>{const other=String(req.params.id);if(!db.users.some(u=>String(u.id)===other))return res.status(404).json({error:'Usuário não encontrado.'});const list=db.messages[pair(req.user.id,other)]||[];let changed=false;for(const m of list){if(String(m.to)===String(req.user.id)&&m.status!=='read'){m.status='read';m.readAt=Date.now();changed=true;sendUser(String(m.from),{type:'message_status',messageId:m.id,message:clientMessage(m),status:'read'});}}if(changed)save();res.json({ok:true})});
app.post('/api/messages/:id',auth,(req,res)=>{const other=req.params.id;if((db.blocked[req.user.id]||[]).includes(other)||(db.blocked[other]||[]).includes(req.user.id))return res.status(403).json({error:'Este contato está bloqueado.'});const u=db.users.find(x=>x.id===other);if(!u)return res.status(404).json({error:'Usuário não encontrado.'});let m;if(req.body?.type==='sticker'){const sticker=String(req.body?.sticker||'').trim();if(!/^[\u{1F300}-\u{1FAFF}\u2600-\u26FF\u2700-\u27BF]+$/u.test(sticker)||sticker.length>32)return res.status(400).json({error:'Sticker inválido.'});m={id:id(),from:req.user.id,to:other,type:'sticker',sticker,createdAt:Date.now()};}else if(req.body?.type==='audio'){const audio=String(req.body?.audio||'');if(!/^data:audio\/[A-Za-z0-9.+-]+(?:;[^,]*)?;base64,[A-Za-z0-9+/=]+$/.test(audio)||audio.length>10*1024*1024)return res.status(400).json({error:'Áudio inválido ou muito grande.'});const duration=Math.max(1,Math.min(90,Number(req.body?.duration)||1));m={id:id(),from:req.user.id,to:other,type:'audio',audio,duration,createdAt:Date.now()};}else if(req.body?.type==='media'){const media=String(req.body?.media||''),mediaType=String(req.body?.mediaType||'');if(!/^(image\/|video\/)/.test(mediaType)||!new RegExp('^data:'+mediaType.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:;[^,]*)?;base64,[A-Za-z0-9+/=]+$').test(media)||media.length>14*1024*1024)return res.status(400).json({error:'Foto ou vídeo inválido ou muito grande.'});m={id:id(),from:req.user.id,to:other,type:'media',media,mediaType,createdAt:Date.now()};}else{const text=String(req.body?.text||'').trim();if(!text||text.length>4000)return res.status(400).json({error:'Mensagem inválida.'});m={id:id(),from:req.user.id,to:other,type:'text',text,createdAt:Date.now()};}m.replyTo=req.body?.replyTo||null;const k=pair(req.user.id,other);m.status='sent';db.messages[k]??=[];db.messages[k].push(m);db.messages[k]=db.messages[k].slice(-500);save();const delivered=sendUser(other,{type:'message',message:clientMessage(m)});if(delivered>0){m.status='delivered';m.deliveredAt=Date.now();save();sendUser(req.user.id,{type:'message_status',messageId:m.id,message:clientMessage(m),status:'delivered'});}const preview=m.type==='audio'?'Áudio recebido':m.type==='media'?(String(m.mediaType).startsWith('video/')?'Vídeo recebido':'Foto recebida'):m.type==='sticker'?'Sticker':m.text;const note=addNotification(other,{kind:'message',title:req.user.name||'Nova mensagem',body:preview,from:req.user.id,chatId:req.user.id});pushUser(other,{title:note.title,body:note.body,icon:'/icon-192.png',badge:'/icon-192.png',data:{chatId:req.user.id,notificationId:note.id}}).catch(()=>{});res.json(m);});
app.get(/.*/,(req,res)=>res.sendFile(path.join(__dirname,'www','index.html')));
wss.on('connection',(ws,req)=>{const token=new URL(req.url,'http://localhost').searchParams.get('token');const uid=sessions.get(token)||db.sessions[token];if(uid)sessions.set(token,uid);if(!uid){ws.close();return}ws.token=token;touch(uid);ws.on('message',buf=>{try{const d=JSON.parse(buf);if(d.type==='ping'){offlinePresence.delete(token);touch(uid);sendUser(uid,{type:'presence',id:uid})}if(d.type==='presence-offline'){offlinePresence.add(token);touch(uid);sendUser(uid,{type:'presence',id:uid})}if(d.type==='presence-online'){offlinePresence.delete(token);touch(uid);sendUser(uid,{type:'presence',id:uid})};if(d.type==='typing'&&d.to)sendUser(d.to,{type:'typing',from:uid,active:!!d.active});if(d.type==='call-room-invite'&&d.to){createCallRecord(uid,d.to,d.callId,d.mode);const item={...d,from:uid,createdAt:Date.now()};pendingCalls.set(d.to,[...(pendingCalls.get(d.to)||[]).filter(x=>x.callId!==d.callId),item].slice(-5));sendUser(d.to,item);const caller=db.users.find(u=>u.id===uid);pushUser(d.to,{title:d.mode==='video'?'Chamada de vídeo':'Chamada recebida',body:`${caller?.name||'Um contato'} está ligando para você`,icon:'/icon-192.png',badge:'/icon-192.png',tag:`linka-call-${d.callId}`,data:{type:'call',callId:d.callId,from:uid,mode:d.mode||'audio'}}).catch(()=>{});}if(d.type==='call-live-ready'&&d.to){updateCallRecord(d.callId,{status:'connected',connectedAt:Date.now()});sendUser(d.to,{...d,from:uid});}if(d.type==='call-reject'&&d.to){updateCallRecord(d.callId,{status:'rejected',endedAt:Date.now(),duration:0});pendingCalls.set(uid,(pendingCalls.get(uid)||[]).filter(x=>x.callId!==d.callId));pendingCalls.set(d.to,(pendingCalls.get(d.to)||[]).filter(x=>x.callId!==d.callId));sendUser(d.to,{...d,from:uid});}if(d.type==='call-busy'&&d.to){updateCallRecord(d.callId,{status:'busy',endedAt:Date.now(),duration:0});pendingCalls.set(uid,(pendingCalls.get(uid)||[]).filter(x=>x.callId!==d.callId));pendingCalls.set(d.to,(pendingCalls.get(d.to)||[]).filter(x=>x.callId!==d.callId));sendUser(d.to,{...d,from:uid});}if(d.type==='call-end'&&d.to){if(endedCallIds.has(d.callId)){pendingCalls.set(uid,(pendingCalls.get(uid)||[]).filter(x=>x.callId!==d.callId));pendingCalls.set(d.to,(pendingCalls.get(d.to)||[]).filter(x=>x.callId!==d.callId));return}endedCallIds.add(d.callId);pendingCalls.set(uid,(pendingCalls.get(uid)||[]).filter(x=>x.callId!==d.callId));pendingCalls.set(d.to,(pendingCalls.get(d.to)||[]).filter(x=>x.callId!==d.callId));const now=Date.now();const all=[];for(const arr of Object.values(db.callHistory))for(const c of arr)if(c.id===d.callId)all.push(c);const base=all.find(c=>c.connectedAt)||all[0];const duration=base?.connectedAt?Math.max(0,Math.floor((now-base.connectedAt)/1000)):0;updateCallRecord(d.callId,{status:'ended',endedAt:now,duration});const pairKey=pair(uid,d.to);db.messages[pairKey]??=[];const mode=d.mode==='video'?'video':'audio';const callMsg={id:id(),from:uid,to:d.to,type:'call',mode,status:'ended',duration,createdAt:now};db.messages[pairKey].push(callMsg);db.messages[pairKey]=db.messages[pairKey].slice(-500);save();sendUser(d.to,{...d,from:uid,callMessage:callMsg});sendUser(uid,{type:'call-end',from:d.to,to:uid,callId:d.callId,callMessage:callMsg});}if(['call-room-join','call-room-joined','call-room-error','call-live-start','call-live-audio','call-live-video','call-audio-ready','call-audio-offer','call-audio-answer','call-audio-ice','call-video-ready','call-video-offer','call-video-answer','call-video-ice'].includes(d.type)&&d.to)sendUser(d.to,{...d,from:uid})}catch{}});ws.on('close',()=>{offlinePresence.delete(token);touch(uid);sendUser(uid,{type:'presence',id:uid})});sendUser(uid,{type:'presence',id:uid});for(const call of (pendingCalls.get(uid)||[]))sendUser(uid,call)});

async function boot(){
  const remote=await loadRemote();
  if(remote){normalizeDB(remote);console.log('Linka: dados carregados do Supabase.');}
  else {normalizeDB(readLocal()||db);if(REMOTE_ENABLED){console.log('Linka: nenhum banco remoto encontrado; enviando os dados locais para o Supabase.');}}
  initFirebase();
  if(REMOTE_ENABLED){await pushRemote(JSON.parse(JSON.stringify(db)));console.log('Linka: persistência Supabase ativada.');}else console.warn('ATENÇÃO: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados; os dados continuarão temporários no Render Free.');
  server.listen(PORT,()=>console.log('Linka rodando na porta '+PORT));
}
boot().catch(e=>{console.error('Falha ao iniciar o Linka:',e);process.exit(1)});
