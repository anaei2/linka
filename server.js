const http=require('http'), fs=require('fs'), path=require('path'), crypto=require('crypto');
const express=require('express'), WebSocket=require('ws'), admin=require('firebase-admin');
const app=express(); const server=http.createServer(app); const wss=new WebSocket.Server({server});
const PORT=process.env.PORT||3000;
const DATA_DIR=process.env.DATA_DIR||path.join(__dirname);
const DATA=path.join(DATA_DIR,'data.json'), BACKUP=path.join(DATA_DIR,'data.json.bak');
const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const SUPABASE_KEY=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'');
const REMOTE_ENABLED=!!(SUPABASE_URL&&SUPABASE_KEY);
try{fs.mkdirSync(DATA_DIR,{recursive:true})}catch(e){console.error('Não foi possível criar DATA_DIR:',e)}

app.use(express.json({limit:'12mb'}));
app.get('/firebase-messaging-sw.js',(req,res)=>{
  const c=firebaseConfig();
  if(!c.apiKey||!c.projectId||!c.messagingSenderId||!c.appId){return res.status(503).type('application/javascript').send('/* Firebase FCM not configured */');}
  res.type('application/javascript').send(`importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');
firebase.initializeApp(${JSON.stringify(c)});
const messaging=firebase.messaging();
messaging.onBackgroundMessage((payload)=>{
  const n=payload.notification||{};
  const d=payload.data||{};
  const title=String(n.title||'Linka');
  const body=String(n.body||'Nova mensagem');
  const options={
    body,
    icon:n.icon||'/icon-192.png',
    badge:n.badge||'/icon-192.png',
    tag:d.chatId?'linka-'+d.chatId:'linka',
    renotify:true,
    data:d
  };
  return self.registration.showNotification(title,options);
});
self.addEventListener('notificationclick',(event)=>{event.notification.close();const d=event.notification.data||{};const url=d.chatId?'/?chat='+encodeURIComponent(d.chatId):'/';event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{for(const c of cs){if('focus' in c){c.navigate(url);return c.focus()}}return clients.openWindow(url)}));});`);
});
app.use(express.static(path.join(__dirname,'www')));
let db={users:[],contacts:{},messages:{},sessions:{},fcmTokens:{},notifications:{}};
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
  db.users??=[]; db.contacts??={}; db.messages??={}; db.sessions??={}; db.fcmTokens??={}; db.notifications??={};
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
function isUserOnline(uid){for(const [token,idv] of sessions)if(idv===uid&&[...wss.clients].some(c=>c.readyState===1&&c.token===token))return true;const u=db.users.find(x=>x.id===uid);return !!(u&&u.lastSeen&&Date.now()-u.lastSeen<60000)}
function touch(uid){const u=db.users.find(x=>x.id===uid);if(u){u.lastSeen=Date.now();save()}}
const sessions=new Map();
function auth(req,res,next){const t=(req.headers.authorization||'').replace('Bearer ','');let uid=sessions.get(t)||db.sessions[t];if(uid){sessions.set(t,uid)}if(!uid)return res.status(401).json({error:'Sessão expirada'});req.user=db.users.find(x=>x.id===uid);if(!req.user)return res.status(401).json({error:'Usuário não encontrado'});next()}
function pair(a,b){return [a,b].sort().join(':')}
function sendUser(uid,msg){for(const [token,idv] of sessions){if(idv!==uid)continue;for(const c of wss.clients)if(c.readyState===1&&c.token===token)c.send(JSON.stringify(msg))}}
function addNotification(uid,n){db.notifications[uid]??=[];const item={id:id(),createdAt:Date.now(),read:false,...n};db.notifications[uid].unshift(item);db.notifications[uid]=db.notifications[uid].slice(0,100);save();sendUser(uid,{type:'notification',notification:item});return item}
async function pushUser(uid,payload){
  if(!firebaseReady)return {sent:0,skipped:true};
  const tokens=[...(db.fcmTokens[uid]||[])];
  if(!tokens.length)return {sent:0};
  const message={
    tokens,
    notification:{title:String(payload.title||'Linka'),body:String(payload.body||'')},
    data:Object.fromEntries(Object.entries(payload.data||{}).map(([k,v])=>[String(k),String(v)])),
    webpush:{
      notification:{icon:payload.icon||'/icon-192.png',badge:payload.badge||'/icon-192.png',tag:payload.tag||'linka'},
      fcmOptions:{link:payload.data?.chatId?`/?chat=${encodeURIComponent(payload.data.chatId)}`:'/'}
    }
  };
  try{
    const response=await admin.messaging().sendEachForMulticast(message);
    const invalid=[];
    response.responses.forEach((r,i)=>{
      if(!r.success && ['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(r.error?.code)) invalid.push(tokens[i]);
    });
    if(invalid.length){db.fcmTokens[uid]=(db.fcmTokens[uid]||[]).filter(t=>!invalid.includes(t));save()}
    return {sent:response.successCount,failed:response.failureCount};
  }catch(e){console.error('Falha ao enviar FCM:',e.message);return {sent:0,failed:tokens.length};}
}

app.post('/api/register',(req,res)=>{let {name,username,password}=req.body||{};name=String(name||'').trim();username=String(username||'').trim().toLowerCase().replace(/^@/,'');password=String(password||'');if(name.length<2||username.length<3||password.length<6)return res.status(400).json({error:'Use nome, usuário com pelo menos 3 caracteres e senha com 6 caracteres.'});if(!/^[a-z0-9._-]+$/.test(username))return res.status(400).json({error:'Usuário: apenas letras, números, ponto, _ ou -.'});if(db.users.some(u=>u.username===username))return res.status(409).json({error:'Esse usuário já existe.'});const x=hash(password),u={id:id(),name,username,status:'Disponível',photo:'',s:x.s,h:x.h,createdAt:Date.now()};db.users.push(u);db.contacts[u.id]=[];save();const token=id();sessions.set(token,u.id);db.sessions[token]=u.id;save();res.json({token,user:safe(u,true)});});
app.post('/api/login',(req,res)=>{const username=String(req.body?.username||'').trim().toLowerCase().replace(/^@/,'');const password=String(req.body?.password||'');const u=db.users.find(x=>x.username===username);if(!u||!check(password,u))return res.status(401).json({error:'Usuário ou senha inválidos.'});const token=id();sessions.set(token,u.id);db.sessions[token]=u.id;save();res.json({token,user:safe(u,true)});});
app.post('/api/logout',auth,(req,res)=>{touch(req.user.id);for(const [t,u] of sessions)if(u===req.user.id){sessions.delete(t);delete db.sessions[t]}for(const t of Object.keys(db.sessions))if(db.sessions[t]===req.user.id)delete db.sessions[t];save();res.json({ok:true})});
app.post('/api/ping',auth,(req,res)=>{touch(req.user.id);res.json({ok:true,lastSeen:req.user.lastSeen})});
app.get('/api/me',auth,(req,res)=>res.json({user:safe(req.user,true)}));
app.put('/api/me',auth,(req,res)=>{const {name,status,photo,chatBg}=req.body||{};if(typeof name==='string'&&name.trim())req.user.name=name.trim().slice(0,40);if(typeof status==='string')req.user.status=status.trim().slice(0,100);if(typeof photo==='string'&&photo.length<1500000)req.user.photo=photo;if(typeof chatBg==='string'&&chatBg.length<1500000)req.user.chatBg=chatBg;save();res.json({user:safe(req.user,true)});});
app.get('/api/users',auth,(req,res)=>{const q=String(req.query.q||'').trim().toLowerCase().replace(/^@/,'');if(q.length<2)return res.json([]);res.json(db.users.filter(u=>u.id!==req.user.id&&(u.username.includes(q)||u.name.toLowerCase().includes(q))).slice(0,20).map(safe));});
app.get('/api/contacts',auth,(req,res)=>{const ids=db.contacts[req.user.id]||[];res.json(ids.map(i=>db.users.find(u=>u.id===i)).filter(Boolean).map(safe));});
app.get('/api/users/:id',auth,(req,res)=>{const u=db.users.find(x=>x.id===req.params.id);if(!u)return res.status(404).json({error:'Usuário não encontrado.'});res.json(safe(u));});
app.post('/api/contacts/:id',auth,(req,res)=>{const other=db.users.find(u=>u.id===req.params.id);if(!other||other.id===req.user.id)return res.status(404).json({error:'Usuário não encontrado.'});db.contacts[req.user.id]??=[];if(!db.contacts[req.user.id].includes(other.id))db.contacts[req.user.id].push(other.id);save();const note=addNotification(other.id,{kind:'contact',title:'Novo contato',body:(req.user.name||'Alguém')+' adicionou você aos contatos.',from:req.user.id});sendUser(other.id,{type:'contact_added',by:safe(req.user)});pushUser(other.id,{title:note.title,body:note.body,icon:'/icon-192.png',badge:'/icon-192.png',data:{notificationId:note.id}}).catch(()=>{});res.json({user:safe(other)});});
app.delete('/api/contacts/:id',auth,(req,res)=>{db.contacts[req.user.id]=(db.contacts[req.user.id]||[]).filter(x=>x!==req.params.id);save();res.json({ok:true})});
app.get('/api/firebase-config',(req,res)=>{const c=firebaseConfig();if(!c.apiKey||!c.projectId||!c.messagingSenderId||!c.appId||!process.env.FIREBASE_VAPID_KEY)return res.status(503).json({error:'Firebase FCM ainda não está configurado no servidor.'});res.json({...c,vapidKey:process.env.FIREBASE_VAPID_KEY});});
app.post('/api/fcm/token',auth,(req,res)=>{const token=String(req.body?.token||'').trim();if(!token||token.length<20)return res.status(400).json({error:'Token FCM inválido.'});db.fcmTokens[req.user.id]??=[];const list=db.fcmTokens[req.user.id];if(!list.includes(token))list.push(token);db.fcmTokens[req.user.id]=list.slice(-10);save();res.json({ok:true});});
app.delete('/api/fcm/token',auth,(req,res)=>{const token=String(req.body?.token||'').trim();if(token)db.fcmTokens[req.user.id]=(db.fcmTokens[req.user.id]||[]).filter(t=>t!==token);save();res.json({ok:true})});
app.get('/api/notifications',auth,(req,res)=>{const list=db.notifications[req.user.id]||[];res.json(list.slice(0,100));});
app.post('/api/notifications/read-all',auth,(req,res)=>{const list=db.notifications[req.user.id]||[];list.forEach(n=>n.read=true);save();res.json({ok:true});});
app.post('/api/notifications/:id/read',auth,(req,res)=>{const n=(db.notifications[req.user.id]||[]).find(x=>x.id===req.params.id);if(!n)return res.status(404).json({error:'Notificação não encontrada.'});n.read=true;save();res.json({ok:true});});
app.get('/api/messages/:id',auth,(req,res)=>{const other=req.params.id;if(!db.users.some(u=>u.id===other))return res.status(404).json({error:'Usuário não encontrado.'});res.json(db.messages[pair(req.user.id,other)]||[])});
app.post('/api/messages/:id',auth,(req,res)=>{const other=req.params.id;const u=db.users.find(x=>x.id===other);if(!u)return res.status(404).json({error:'Usuário não encontrado.'});let m;if(req.body?.type==='audio'){const audio=String(req.body?.audio||'');if(!/^data:audio\/[A-Za-z0-9.+-]+(?:;[^,]*)?;base64,[A-Za-z0-9+/=]+$/.test(audio)||audio.length>10*1024*1024)return res.status(400).json({error:'Áudio inválido ou muito grande.'});m={id:id(),from:req.user.id,to:other,type:'audio',audio,createdAt:Date.now()};}else{const text=String(req.body?.text||'').trim();if(!text||text.length>4000)return res.status(400).json({error:'Mensagem inválida.'});m={id:id(),from:req.user.id,to:other,type:'text',text,createdAt:Date.now()};}const k=pair(req.user.id,other);db.messages[k]??=[];db.messages[k].push(m);db.messages[k]=db.messages[k].slice(-500);save();sendUser(other,{type:'message',message:m});const preview=m.type==='audio'?'Áudio recebido':m.text;const note=addNotification(other.id,{kind:'message',title:req.user.name||'Nova mensagem',body:preview,from:req.user.id,chatId:req.user.id});pushUser(other,{title:note.title,body:note.body,icon:'/icon-192.png',badge:'/icon-192.png',data:{chatId:req.user.id,notificationId:note.id}}).catch(()=>{});res.json(m);});
app.get(/.*/,(req,res)=>res.sendFile(path.join(__dirname,'www','index.html')));
wss.on('connection',(ws,req)=>{const token=new URL(req.url,'http://localhost').searchParams.get('token');const uid=sessions.get(token)||db.sessions[token];if(uid)sessions.set(token,uid);if(!uid){ws.close();return}ws.token=token;touch(uid);ws.on('message',buf=>{try{const d=JSON.parse(buf);if(d.type==='ping')touch(uid);if(d.type==='typing'&&d.to)sendUser(d.to,{type:'typing',from:uid,active:!!d.active})}catch{}});ws.on('close',()=>{touch(uid);sendUser(uid,{type:'presence',id:uid})});sendUser(uid,{type:'presence',id:uid})});

async function boot(){
  const remote=await loadRemote();
  if(remote){normalizeDB(remote);console.log('Linka: dados carregados do Supabase.');}
  else {normalizeDB(readLocal()||db);if(REMOTE_ENABLED){console.log('Linka: nenhum banco remoto encontrado; enviando os dados locais para o Supabase.');}}
  initFirebase();
  if(REMOTE_ENABLED){await pushRemote(JSON.parse(JSON.stringify(db)));console.log('Linka: persistência Supabase ativada.');}else console.warn('ATENÇÃO: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados; os dados continuarão temporários no Render Free.');
  server.listen(PORT,()=>console.log('Linka rodando na porta '+PORT));
}
boot().catch(e=>{console.error('Falha ao iniciar o Linka:',e);process.exit(1)});
