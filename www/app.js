const A={token:localStorage.getItem('ac_token')||sessionStorage.getItem('ac_token')||'',user:null,contacts:[],active:null,search:'',messages:[],typingTimer:null,remoteTyping:false,notifications:[]};
// Impede o menu nativo de seleção/cópia do navegador dentro do aplicativo.
document.addEventListener('contextmenu',e=>e.preventDefault(),{capture:true});
document.addEventListener('selectstart',e=>e.preventDefault(),{capture:true});
document.addEventListener('dragstart',e=>e.preventDefault(),{capture:true});
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function hideBoot(){const b=document.querySelector('#boot');if(!b)return;b.classList.add('hide');setTimeout(()=>b.remove(),300)}
const api=async(path,opt={})=>{opt.headers={...(opt.headers||{}),...(A.token?{Authorization:'Bearer '+A.token}:{})};if(opt.body&&typeof opt.body!=='string'){opt.headers['Content-Type']='application/json';opt.body=JSON.stringify(opt.body)}const r=await fetch(path,opt);let d={};try{d=await r.json()}catch{}if(!r.ok)throw Error(d.error||'Erro');return d};
function av(x,big=false){return `<div class="avatar ${big?'big':''}">${x?.photo?`<img src="${x.photo}">`:esc((x?.name||'?')[0].toUpperCase())}</div>`}
function toast(t){const x=document.createElement('div');x.className='toast';x.textContent=t;document.body.appendChild(x);setTimeout(()=>x.remove(),2200)}
function presenceText(c){if(c?.online)return 'online';const t=Number(c?.lastSeen||0);if(!t)return 'offline';const sec=Math.max(0,Math.floor((Date.now()-t)/1000));if(sec<60)return 'online';if(sec<3600)return 'visto por último há '+Math.max(1,Math.floor(sec/60))+' min';if(sec<86400)return 'visto por último há '+Math.floor(sec/3600)+' h';return 'visto por último em '+new Date(t).toLocaleDateString('pt-BR')}
function applyChatBg(){const box=$('#msgs');if(!box)return;const bg=A.user?.chatBg||'';box.style.background=bg&&bg.startsWith('data:')?`url(${bg}) center/cover fixed, radial-gradient(circle at top,#14232a,#0b141a 60%)`:bg==='gradient'?'linear-gradient(135deg,#081b22,#162a31)':bg==='dots'?'radial-gradient(circle at 20px 20px,#ffffff18 2px,transparent 3px) 0 0/32px 32px,#0b141a':'radial-gradient(circle at top,#14232a,#0b141a 60%)'}
function login(){document.body.innerHTML=`<div class="auth"><div class="authbox"><div class="logo">L</div><h1>Linka</h1><p>Converse com seus contatos, sem código de sala.</p><div id="authForm"></div></div></div>`;showLogin()}
function showLogin(){const f=$('#authForm');f.innerHTML=`<input id="u" placeholder="Usuário" autocomplete="username"><input id="p" type="password" placeholder="Senha" autocomplete="current-password"><label class="remember"><input id="remember" type="checkbox" checked> Manter conectado neste dispositivo</label><button class="primary" id="go">Entrar</button><button class="link" id="new">Criar conta</button>`;$('#go').onclick=async()=>{try{const d=await api('/api/login',{method:'POST',body:{username:$('#u').value,password:$('#p').value}});A.token=d.token;if($('#remember').checked)localStorage.setItem('ac_token',A.token);else sessionStorage.setItem('ac_token',A.token);start()}catch(e){toast(e.message)}};$('#new').onclick=showRegister}
function showRegister(){const f=$('#authForm');f.innerHTML=`<input id="n" placeholder="Seu nome"><input id="u" placeholder="Crie um usuário (ex.: gabriel)"><input id="p" type="password" placeholder="Senha (mínimo 6 caracteres)"><button class="primary" id="go">Criar conta</button><button class="link" id="back">Já tenho conta</button>`;$('#go').onclick=async()=>{try{const d=await api('/api/register',{method:'POST',body:{name:$('#n').value,username:$('#u').value,password:$('#p').value}});A.token=d.token;localStorage.setItem('ac_token',A.token);sessionStorage.removeItem('ac_token');start()}catch(e){toast(e.message)}};$('#back').onclick=showLogin}
async function start(){
  if(!A.token){hideBoot();login();return}
  let attempts=0;
  while(A.token && attempts<12){
    try{
      const d=await api('/api/me');
      A.user=d.user;
      await loadContacts();
      await loadNotifications();
      render();
      hideBoot();
      initNotifications();
      connect();
      const chat=new URLSearchParams(location.search).get('chat');
      if(chat)setTimeout(()=>openChat(chat),150);
      return;
    }catch(e){
      attempts++;
      // Se o Render estiver acordando, aguarde e tente novamente.
      // Só apagamos a sessão quando o servidor realmente responde com 401.
      if(/Sessão expirada|Usuário não encontrado/i.test(e.message||'')){
        localStorage.removeItem('ac_token');sessionStorage.removeItem('ac_token');A.token='';hideBoot();login();return;
      }
      await new Promise(r=>setTimeout(r,Math.min(2000+attempts*500,5000)));
    }
  }
  hideBoot();
  toast('Não foi possível conectar ao servidor. Tente novamente.');
  login();
}
async function loadContacts(){A.contacts=await api('/api/contacts')}
function render(){document.body.classList.remove('chat-open');document.body.innerHTML=`<div class="app"><aside class="side" id="side"><header class="top"><div class="profile" id="profile">${av(A.user)}<div><b>${esc(A.user.name)}</b><span>${esc('@'+A.user.username)}</span></div></div><button class="icon" id="menu">☰</button></header><div class="search">⌕<input id="search" placeholder="Pesquisar contatos ou conversas"></div><div class="tabs"><button class="tab active" id="chats">Conversas</button><button class="tab" id="contacts">Contatos</button></div><div class="list" id="list"></div></aside><main class="main" id="main"><div class="welcome"><div class="mark">A</div><h1>Linka</h1><p>Selecione um contato para começar.</p></div></main><div id="modal"></div></div>`;$('#profile').onclick=profileModal;$('#menu').onclick=menuModal;$('#search').oninput=e=>{A.search=e.target.value.trim();renderList()};$('#contacts').onclick=contactsView;renderList()}
function renderList(){const q=A.search.toLowerCase();const xs=A.contacts.filter(c=>(c.name+' '+c.username).toLowerCase().includes(q));const list=$('#list');if(!list)return;if(!xs.length){list.innerHTML='<div class="empty">Nenhum contato.<br><button class="link" id="find" type="button">Adicionar contato</button></div>';const f=$('#find');if(f)f.onclick=addContactModal;return}list.innerHTML=xs.map(c=>`<button class="item" type="button" data-id="${esc(c.id)}" aria-label="Abrir conversa com ${esc(c.name)}">${av(c)}<div class="info"><b>${esc(c.name)}</b><span>@${esc(c.username)}</span><small class="presence" data-presence="${esc(c.id)}">${esc(presenceText(c))}</small></div></button>`).join('');list.querySelectorAll('.item').forEach(item=>{item.onclick=()=>openChat(String(item.dataset.id))})}
function contactsView(){renderList();$('#list').insertAdjacentHTML('afterbegin','<div class="section"><b>Seus contatos</b><button class="smallbtn" id="add">＋ Adicionar</button></div>');$('#add').onclick=addContactModal}
async function openChat(id){const contact=A.contacts.find(x=>String(x.id)===String(id));if(!contact){toast('Contato não encontrado');return;}A.active=contact;A.messages=[];A.remoteTyping=false;document.body.classList.add('chat-open');$('#main').className='main mobile';$('#main').innerHTML=`<header class="head"><button class="icon back" id="back" type="button">‹</button>${av(contact)}<div><b>${esc(contact.name)}</b><span id="chatPresence">${esc(presenceText(contact))}</span></div></header><div class="messages" id="msgs"><div class="empty">Carregando conversa...</div></div><form class="composer" id="composer"><button class="voice" id="voice" type="button" aria-label="Gravar áudio">●</button><input id="msg" placeholder="Digite uma mensagem…" autocomplete="off"><button class="send" type="submit" aria-label="Enviar mensagem">➤</button></form>`;const back=$('#back');if(back)back.onclick=()=>{stopRecording(false);sendTyping(false);document.body.classList.remove('chat-open');$('#main').className='main';A.active=null;A.remoteTyping=false;$('#main').innerHTML='<div class="welcome"><div class="mark">L</div><h1>Linka</h1><p>Selecione um contato para começar.</p></div>';renderList()};const form=$('#composer');const input=$('#msg');if(input){input.addEventListener('input',()=>{if(!A.active)return;sendTyping(true);clearTimeout(A.typingTimer);A.typingTimer=setTimeout(()=>sendTyping(false),1400)});input.addEventListener('blur',()=>sendTyping(false))}if(form)form.onsubmit=async e=>{e.preventDefault();sendTyping(false);const input=$('#msg'),text=input.value.trim();if(!text)return;input.value='';try{const m=await api('/api/messages/'+contact.id,{method:'POST',body:{text}});if(A.active&&String(A.active.id)===String(contact.id)){A.messages.push(m);drawMessages()}}catch(e){input.value=text;toast(e.message)}};setupRecorder(contact);try{A.messages=await api('/api/messages/'+contact.id);drawMessages()}catch(e){A.messages=[];drawMessages();toast('Não foi possível carregar a conversa agora. Você ainda pode tentar enviar uma mensagem.')}}
let recorder=null,recordChunks=[],recordTimer=null,recordSeconds=0,recordContact=null;
function setupRecorder(contact){recordContact=contact;const b=$('#voice');if(!b)return;b.onclick=()=>{if(recorder&&recorder.state==='recording')stopRecording(true);else startRecording(contact)};}
async function startRecording(contact){if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){toast('Seu navegador não suporta gravação de áudio');return}try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});const types=['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4'];const mime=types.find(x=>MediaRecorder.isTypeSupported(x))||'';recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);recordChunks=[];recordSeconds=0;recordContact=contact;recorder.ondataavailable=e=>{if(e.data.size)recordChunks.push(e.data)};recorder.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());clearInterval(recordTimer);recordTimer=null;const blob=new Blob(recordChunks,{type:recorder.mimeType||'audio/webm'});recordChunks=[];if(blob.size>8*1024*1024){toast('Áudio muito grande. Grave por menos tempo.');resetVoice();return}const reader=new FileReader();reader.onload=async()=>{try{const m=await api('/api/messages/'+contact.id,{method:'POST',body:{type:'audio',audio:reader.result}});if(A.active&&String(A.active.id)===String(contact.id)){A.messages.push(m);drawMessages()}toast('Áudio enviado')}catch(e){toast(e.message)}resetVoice()};reader.readAsDataURL(blob)};recorder.start(250);recordTimer=setInterval(()=>{recordSeconds++;const b=$('#voice');if(b)b.textContent=formatRecordTime(recordSeconds);if(recordSeconds>=90)stopRecording(true)},1000);const b=$('#voice');if(b){b.classList.add('recording');b.textContent='■'}const input=$('#msg');if(input)input.placeholder='Gravando… toque para enviar'}catch(e){toast('Não foi possível acessar o microfone');resetVoice()}}
function stopRecording(send=true){if(!recorder)return;if(recorder.state==='recording')recorder.stop();else resetVoice()}
function resetVoice(){const b=$('#voice');if(b){b.classList.remove('recording');b.textContent='●';b.setAttribute('aria-label','Gravar áudio')}recorder=null;clearInterval(recordTimer);recordTimer=null;recordSeconds=0;const input=$('#msg');if(input)input.placeholder='Digite uma mensagem…'}
function formatRecordTime(s){const m=Math.floor(s/60),sec=String(s%60).padStart(2,'0');return `${m}:${sec}`}
function bubble(m){const time=new Date(m.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});if(m.type==='audio'&&m.audio)return `<div class="bubble audioBubble ${m.from===A.user.id?'mine':''}" data-mid="${esc(m.id)}"><audio class="audioEl" preload="metadata" src="${esc(m.audio)}"></audio><button class="audioPlay" type="button" aria-label="Reproduzir áudio" data-audio-play="${esc(m.id)}">▶</button><div class="audioInfo"><div class="audioTrack"><span class="audioProgress"></span></div><div class="audioTimes"><span class="audioCurrent">0:00</span><span class="audioDuration">0:00</span></div></div><time>${time}</time></div>`;return `<div class="bubble ${m.from===A.user.id?'mine':''}">${esc(m.text)}<time>${time}</time></div>`}
function drawMessages(){const box=$('#msgs');if(!box)return;box.innerHTML=A.messages.map(bubble).join('');box.scrollTop=box.scrollHeight;applyChatBg();box.querySelectorAll('.audioBubble').forEach(card=>{const audio=card.querySelector('.audioEl'),play=card.querySelector('.audioPlay'),progress=card.querySelector('.audioProgress'),cur=card.querySelector('.audioCurrent'),dur=card.querySelector('.audioDuration');const fmt=v=>{v=Math.max(0,Math.floor(v||0));return Math.floor(v/60)+':'+String(v%60).padStart(2,'0')};audio.onloadedmetadata=()=>dur.textContent=fmt(audio.duration);audio.ontimeupdate=()=>{cur.textContent=fmt(audio.currentTime);progress.style.width=audio.duration?((audio.currentTime/audio.duration)*100)+'%':'0%'};audio.onended=()=>{play.textContent='▶';progress.style.width='0%';cur.textContent='0:00'};play.onclick=()=>{document.querySelectorAll('.audioEl').forEach(a=>{if(a!==audio)a.pause()});if(audio.paused){audio.play().then(()=>play.textContent='❚❚').catch(()=>toast('Não foi possível reproduzir o áudio'))}else{audio.pause();play.textContent='▶'}}})}
function refreshPresence(){A.contacts.forEach(c=>{document.querySelectorAll('[data-presence]').forEach(el=>{if(String(el.dataset.presence)===String(c.id))el.textContent=presenceText(c)})});if(A.active){const c=A.contacts.find(x=>String(x.id)===String(A.active.id));if(c){A.active=c;const el=$('#chatPresence');if(el)el.textContent=presenceText(c)}}}
function addContactModal(){modal(`<h2>Adicionar contato</h2><p class="muted">Procure pelo nome ou pelo usuário. Não existe código de sala.</p><input id="findq" placeholder="Ex.: @gabriel"><div id="results"></div><button class="danger" data-close>Fechar</button>`);$('#findq').oninput=async e=>{const q=e.target.value.trim();if(q.length<2){$('#results').innerHTML='';return}try{const xs=await api('/api/users?q='+encodeURIComponent(q));$('#results').innerHTML=xs.length?xs.map(u=>`<div class="result">${av(u)}<div><b>${esc(u.name)}</b><span>@${esc(u.username)}</span></div><button data-add="${u.id}">Adicionar</button></div>`).join(''):'<p class="muted">Nenhum usuário encontrado.</p>';document.querySelectorAll('[data-add]').forEach(b=>b.onclick=async()=>{try{await api('/api/contacts/'+b.dataset.add,{method:'POST'});await loadContacts();$('#modal').innerHTML='';renderList();toast('Contato adicionado')}catch(e){toast(e.message)}})}catch(e){toast(e.message)}}}
function profileModal(){modal(`<h2>Meu perfil</h2><div class="center">${av(A.user,true)}</div><label>Foto <input id="photo" type="file" accept="image/*"></label><label>Nome<input id="name" value="${esc(A.user.name)}"></label><label>Sobre<input id="status" value="${esc(A.user.status||'Disponível')}"></label><button class="primary" id="save">Salvar</button><button class="danger" data-close>Cancelar</button>`);$('#photo').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>A.user.photo=r.result;r.readAsDataURL(f)};$('#save').onclick=async()=>{try{A.user=(await api('/api/me',{method:'PUT',body:{name:$('#name').value,status:$('#status').value,photo:A.user.photo||''}})).user;$('#modal').innerHTML='';render()}catch(e){toast(e.message)}}}
async function loadNotifications(){try{A.notifications=await api('/api/notifications')}catch{A.notifications=[]}}
function unreadCount(){return A.notifications.filter(n=>!n.read).length}
async function notificationsModal(){await loadNotifications();const escN=s=>esc(s);const rows=A.notifications.length?A.notifications.map(n=>`<button class="notifrow ${n.read?'':'unread'}" data-notif="${escN(n.id)}" data-chat="${escN(n.chatId||'')}"><span class="notificon">${n.kind==='contact'?'👤':'💬'}</span><span><b>${escN(n.title)}</b><small>${escN(n.body)}</small><em>${new Date(n.createdAt).toLocaleString('pt-BR')}</em></span></button>`).join(''):'<p class="muted">Nenhuma notificação.</p>';const permission=('Notification' in window)?Notification.permission:'unsupported';const activate=permission!=='granted'?'<button class="primary" id="activateNotif">Ativar notificações</button>':'';modal(`<h2>Notificações <span class="notifcount">${unreadCount()}</span></h2>${permission==='denied'?'<p class="muted">As notificações estão bloqueadas neste navegador. Permita as notificações nas configurações do site e tente novamente.</p>':''}<div class="notiflist">${rows}</div>${activate}<button class="primary" id="readall">Marcar todas como lidas</button><button class="danger" data-close>Fechar</button>`);const act=$('#activateNotif');if(act)act.onclick=async()=>{await setupNotifications();if(Notification.permission==='granted')notificationsModal()};document.querySelectorAll('[data-notif]').forEach(b=>b.onclick=async()=>{const id=b.dataset.notif;try{await api('/api/notifications/'+id+'/read',{method:'POST'})}catch{};const chat=b.dataset.chat;if(chat){$('#modal').innerHTML='';openChat(chat)}else notificationsModal()});$('#readall').onclick=async()=>{try{await api('/api/notifications/read-all',{method:'POST'})}catch{};notificationsModal()}}
function updateNotifBell(){const b=$('#notifBell');if(!b)return;const n=unreadCount();b.innerHTML='🔔'+(n?`<span class="notifbadge">${n>99?'99+':n}</span>`:'');b.setAttribute('aria-label',n?`${n} notificações não lidas`:'Notificações')}
function menuModal(){modal(`<h2>Menu</h2><button class="menurow" id="newc">＋ Adicionar contato</button><button class="menurow" id="prof">Perfil</button><button class="menurow" id="notif">Notificações</button><button class="menurow" id="bg">Fundo das conversas</button><button class="menurow" id="logout">Sair</button><button class="danger" data-close>Fechar</button>`);$('#newc').onclick=addContactModal;$('#prof').onclick=profileModal;$('#notif').onclick=notificationsModal;$('#bg').onclick=backgroundModal;$('#logout').onclick=async()=>{try{await api('/api/logout',{method:'POST'})}catch{}localStorage.removeItem('ac_token');sessionStorage.removeItem('ac_token');location.reload()}}
function backgroundModal(){modal(`<h2>Fundo das conversas</h2><p class="muted">Escolha o fundo que aparecerá nas mensagens.</p><div class="bggrid"><button class="bgpick" data-bg="">Padrão</button><button class="bgpick" data-bg="gradient">Escuro</button><button class="bgpick" data-bg="dots">Pontos</button></div><label>Ou escolha uma imagem<input id="bgfile" type="file" accept="image/*"></label><button class="primary" id="savebg">Salvar fundo</button><button class="danger" data-close>Cancelar</button>`);let chosen=A.user.chatBg||'';document.querySelectorAll('.bgpick').forEach(b=>b.onclick=()=>chosen=b.dataset.bg);$('#bgfile').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>chosen=r.result;r.readAsDataURL(f)};$('#savebg').onclick=async()=>{try{A.user=(await api('/api/me',{method:'PUT',body:{chatBg:chosen}})).user;$('#modal').innerHTML='';applyChatBg();toast('Fundo salvo')}catch(e){toast(e.message)}}}
async function setupNotifications(){
  if(!('Notification' in window)){toast('Este dispositivo não suporta notificações web');return}
  try{
    const permission=await Notification.requestPermission();
    if(permission==='denied'){toast('Notificações estão bloqueadas. Permita-as nas configurações do site.');return}
    if(permission!=='granted'){toast('Notificações não autorizadas');return}
    if(!('serviceWorker' in navigator)){toast('Seu navegador não suporta notificações FCM');return}
    const cfg=await api('/api/firebase-config');
    if(!window.firebase){toast('Firebase não carregou');return}
    if(!firebase.apps.length)firebase.initializeApp(cfg);
    const messaging=firebase.messaging();
    const reg=await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token=await messaging.getToken({vapidKey:cfg.vapidKey,serviceWorkerRegistration:reg});
    if(!token)throw new Error('Token FCM não foi gerado');
    await api('/api/fcm/token',{method:'POST',body:{token}});
    window.__linkaFcmToken=token;
    toast('Notificações ativadas');
  }catch(e){console.error('FCM:',e);toast('Não foi possível ativar notificações')}
}
async function initNotifications(){
  try{
    if(!('serviceWorker' in navigator)||!window.firebase)return;
    const permission=Notification.permission;
    if(permission!=='granted')return;
    const cfg=await api('/api/firebase-config');
    if(!firebase.apps.length)firebase.initializeApp(cfg);
    const messaging=firebase.messaging();
    const reg=await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token=await messaging.getToken({vapidKey:cfg.vapidKey,serviceWorkerRegistration:reg});
    if(token){window.__linkaFcmToken=token;await api('/api/fcm/token',{method:'POST',body:{token}})}
    messaging.onMessage(payload=>{
      const n=payload.notification||{};
      const data=payload.data||{};
      const title=n.title||'Linka';
      const body=n.body||'Nova notificação';
      if(document.visibilityState!=='visible')try{new Notification(title,{body,icon:'/icon-192.png',tag:data.chatId?'linka-'+data.chatId:'linka'})}catch{}
      if(data.chatId){toast(title+': '+body)}else toast(body);
      loadNotifications().then(updateNotifBell).catch(()=>{});
    });
  }catch(e){console.warn('FCM:',e)}
}

function modal(html){$('#modal').innerHTML=`<div class="modal"><div class="card">${html}</div></div>`;document.querySelector('[data-close]')?.addEventListener('click',()=>$('#modal').innerHTML='')}
function sendTyping(active){if(!A.active||window.__linkaWs?.readyState!==1)return;try{window.__linkaWs.send(JSON.stringify({type:'typing',to:A.active.id,active:!!active}))}catch{}}
function notifyIncoming(m){
  if(!('Notification' in window)||Notification.permission!=='granted')return;
  const title=m?.type==='audio'?'Áudio recebido':(m?.from?'Nova mensagem':'Linka');
  const body=m?.type==='audio'?'Você recebeu um áudio':String(m?.text||'Nova mensagem');
  if(document.visibilityState==='visible')return;
  try{new Notification(title,{body,icon:'/icon-192.png',tag:'linka-incoming'})}catch{}
}

function showTyping(active,from){if(!A.active||String(A.active.id)!==String(from))return;const el=$('#chatPresence');if(!el)return;if(active){A.remoteTyping=true;el.innerHTML='<span class="typingDots"><i></i><i></i><i></i></span>'}else{A.remoteTyping=false;el.textContent=presenceText(A.active)}}
function connect(){const proto=location.protocol==='https:'?'wss':'ws';const ws=new WebSocket(proto+'://'+location.host+'/?token='+encodeURIComponent(A.token));ws.onopen=()=>{try{ws.send(JSON.stringify({type:'ping'}))}catch{}};ws.onmessage=async e=>{const d=JSON.parse(e.data);if(d.type==='contact_added'){await loadContacts();renderList();toast('Novo contato adicionado')}if(d.type==='presence'){await loadContacts();refreshPresence()}if(d.type==='typing'){showTyping(!!d.active,d.from)}if(d.type==='notification'){A.notifications.unshift(d.notification);A.notifications=A.notifications.slice(0,100);updateNotifBell();if(d.notification.kind==='message'){toast('Nova mensagem de '+d.notification.title);notifyIncoming({from:d.notification.from,type:'text',text:d.notification.body})}else toast(d.notification.title);return}if(d.type==='message'){if(A.active&&String(d.message.from)===String(A.active.id)){showTyping(false,d.message.from);A.messages.push(d.message);drawMessages()}else{toast('Nova mensagem');notifyIncoming(d.message)}}};ws.onclose=()=>setTimeout(()=>A.token&&connect(),3000);window.__linkaWs=ws}
setInterval(async()=>{if(!A.token)return;try{await api('/api/ping',{method:'POST'});await loadContacts();refreshPresence()}catch{}if(window.__linkaWs?.readyState===1)try{window.__linkaWs.send(JSON.stringify({type:'ping'}))}catch{}},20000);
start();
