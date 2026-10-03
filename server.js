const http=require('http'), fs=require('fs'), path=require('path'), crypto=require('crypto');
const express=require('express'), WebSocket=require('ws');
const app=express(); const server=http.createServer(app); const wss=new WebSocket.Server({server});
const PORT=process.env.PORT||3000, DATA=path.join(__dirname,'data.json');
app.use(express.json({limit:'2mb'})); app.use(express.static(path.join(__dirname,'www')));
let db={users:[],contacts:{},messages:{}};
try{if(fs.existsSync(DATA)) db=JSON.parse(fs.readFileSync(DATA,'utf8'));}catch(e){console.error(e)}
function save(){fs.writeFileSync(DATA,JSON.stringify(db));}
function id(){return crypto.randomBytes(12).toString('hex')}
function hash(p,s=crypto.randomBytes(16).toString('hex')){return {s, h:crypto.scryptSync(p,s,64).toString('hex')}}
function check(p,u){return crypto.timingSafeEqual(Buffer.from(hash(p,u.s).h,'hex'),Buffer.from(u.h,'hex'))}
function safe(u){return {id:u.id,username:u.username,name:u.name,status:u.status,photo:u.photo||'',createdAt:u.createdAt}}
const sessions=new Map();
function auth(req,res,next){const t=(req.headers.authorization||'').replace('Bearer ','');const uid=sessions.get(t);if(!uid)return res.status(401).json({error:'Sessão expirada'});req.user=db.users.find(x=>x.id===uid);if(!req.user)return res.status(401).json({error:'Usuário não encontrado'});next()}
function pair(a,b){return [a,b].sort().join(':')}
function sendUser(uid,msg){for(const [token,idv] of sessions){if(idv!==uid)continue;for(const c of wss.clients)if(c.readyState===1&&c.token===token)c.send(JSON.stringify(msg))}}
app.post('/api/register',(req,res)=>{let {name,username,password}=req.body||{};name=String(name||'').trim();username=String(username||'').trim().toLowerCase().replace(/^@/,'');password=String(password||'');if(name.length<2||username.length<3||password.length<6)return res.status(400).json({error:'Use nome, usuário com pelo menos 3 caracteres e senha com 6 caracteres.'});if(!/^[a-z0-9._-]+$/.test(username))return res.status(400).json({error:'Usuário: apenas letras, números, ponto, _ ou -.'});if(db.users.some(u=>u.username===username))return res.status(409).json({error:'Esse usuário já existe.'});const x=hash(password),u={id:id(),name,username,status:'Disponível',photo:'',s:x.s,h:x.h,createdAt:Date.now()};db.users.push(u);db.contacts[u.id]=[];save();const token=id();sessions.set(token,u.id);res.json({token,user:safe(u)});});
app.post('/api/login',(req,res)=>{const username=String(req.body?.username||'').trim().toLowerCase().replace(/^@/,'');const password=String(req.body?.password||'');const u=db.users.find(x=>x.username===username);if(!u||!check(password,u))return res.status(401).json({error:'Usuário ou senha inválidos.'});const token=id();sessions.set(token,u.id);res.json({token,user:safe(u)});});
app.post('/api/logout',auth,(req,res)=>{for(const [t,u] of sessions)if(u===req.user.id)sessions.delete(t);res.json({ok:true})});
app.get('/api/me',auth,(req,res)=>res.json({user:safe(req.user)}));
app.put('/api/me',auth,(req,res)=>{const {name,status,photo}=req.body||{};if(typeof name==='string'&&name.trim())req.user.name=name.trim().slice(0,40);if(typeof status==='string')req.user.status=status.trim().slice(0,100);if(typeof photo==='string'&&photo.length<1500000)req.user.photo=photo;save();res.json({user:safe(req.user)});});
app.get('/api/users',auth,(req,res)=>{const q=String(req.query.q||'').trim().toLowerCase().replace(/^@/,'');if(q.length<2)return res.json([]);res.json(db.users.filter(u=>u.id!==req.user.id&&(u.username.includes(q)||u.name.toLowerCase().includes(q))).slice(0,20).map(safe));});
app.get('/api/contacts',auth,(req,res)=>{const ids=db.contacts[req.user.id]||[];res.json(ids.map(i=>db.users.find(u=>u.id===i)).filter(Boolean).map(safe));});
app.post('/api/contacts/:id',auth,(req,res)=>{const other=db.users.find(u=>u.id===req.params.id);if(!other||other.id===req.user.id)return res.status(404).json({error:'Usuário não encontrado.'});db.contacts[req.user.id]??=[];if(!db.contacts[req.user.id].includes(other.id))db.contacts[req.user.id].push(other.id);save();sendUser(other.id,{type:'contact_added',by:safe(req.user)});res.json({user:safe(other)});});
app.delete('/api/contacts/:id',auth,(req,res)=>{db.contacts[req.user.id]=(db.contacts[req.user.id]||[]).filter(x=>x!==req.params.id);save();res.json({ok:true});});
app.get('/api/messages/:id',auth,(req,res)=>{const other=req.params.id;if(!db.users.some(u=>u.id===other))return res.status(404).json({error:'Usuário não encontrado.'});res.json(db.messages[pair(req.user.id,other)]||[]);});
app.post('/api/messages/:id',auth,(req,res)=>{const other=req.params.id;const u=db.users.find(x=>x.id===other);if(!u)return res.status(404).json({error:'Usuário não encontrado.'});const text=String(req.body?.text||'').trim();if(!text||text.length>4000)return res.status(400).json({error:'Mensagem inválida.'});const m={id:id(),from:req.user.id,to:other,text,createdAt:Date.now()};const k=pair(req.user.id,other);db.messages[k]??=[];db.messages[k].push(m);db.messages[k]=db.messages[k].slice(-500);save();sendUser(other,{type:'message',message:m});res.json(m);});
app.get(/.*/,(req,res)=>res.sendFile(path.join(__dirname,'www','index.html')));
wss.on('connection',(ws,req)=>{const token=new URL(req.url,'http://localhost').searchParams.get('token');const uid=sessions.get(token);if(!uid){ws.close();return}ws.token=token;ws.on('close',()=>{});});
server.listen(PORT,()=>console.log('Almeida Chat rodando na porta '+PORT));
