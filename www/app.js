const A={chatIds:[],token:localStorage.getItem('ac_token')||sessionStorage.getItem('ac_token')||'',user:null,contacts:[],active:null,search:'',messages:[],typingTimer:null,remoteTyping:false,notifications:[],calls:[],call:{pc:null,stream:null,remote:null,peer:null,id:null,incoming:null,pendingCandidates:[],earlyCandidates:[],roomCode:null,roomRole:null,roomJoined:false,remoteRoomJoined:false,roomName:null,roomPhoto:null,mode:'audio',videoPc:null,videoLocal:null,videoRemote:null,videoOffer:null,videoIceQueue:[],videoRemoteIceQueue:[],audioContext:null,source:null,processor:null,silentGain:null,playTime:0,accepted:false,liveStarted:false,connectedAt:null,callTimer:null,ringContext:null,ringGain:null,ringTimer:null}};
// Impede o menu nativo de seleção/cópia do navegador dentro do aplicativo.
document.addEventListener('contextmenu',e=>e.preventDefault(),{capture:true});
let longPressTimer=null,longPressTriggered=false;
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
      await loadConversations();
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
async function loadConversations(){A.chatIds=await api('/api/conversations')}
function render(){document.body.classList.remove('chat-open');document.body.innerHTML=`<div class="app"><aside class="side" id="side"><header class="top"><div class="profile" id="profile">${av(A.user)}<div><b>${esc(A.user.name)}</b><span>${esc('@'+A.user.username)}</span></div></div><button class="icon" id="menu">☰</button></header><div class="search">⌕<input id="search" placeholder="Pesquisar contatos ou conversas"></div><div class="tabs"><button class="tab active" id="chats">Conversas</button><button class="tab" id="contacts">Contatos</button><button class="tab" id="callsTab" aria-label="Ligações"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8c1.5 2.9 3.7 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.2 1 .3 2 .5 3 .5.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C11.5 21 3 12.5 3 2.5c0-.6.4-1 1-1H7c.6 0 1 .4 1 1 0 1 .2 2 .5 3 .1.4 0 .8-.2 1.1l-1.7 1.7z"/></svg><span>Ligações</span></button></div><div class="list" id="list"></div></aside><main class="main" id="main"><div class="welcome"><div class="mark">A</div><h1>Linka</h1><p>Selecione um contato para começar.</p></div></main><div id="modal"></div></div>`;$('#profile').onclick=profileModal;$('#menu').onclick=menuModal;$('#search').oninput=e=>{A.search=e.target.value.trim();renderList()};$('#chats').onclick=()=>{setTab($('#chats'));renderList()};$('#contacts').onclick=()=>{setTab($('#contacts'));contactsView()};$('#callsTab').onclick=callsView;renderList()}
function renderList(showAll=false){const q=A.search.toLowerCase();const xs=A.contacts.filter(c=>(showAll||A.chatIds.includes(String(c.id)))&&(c.name+' '+c.username).toLowerCase().includes(q));const list=$('#list');if(!list)return;if(!xs.length){list.innerHTML='<div class="empty">Nenhum contato.<br><button class="link" id="find" type="button">Adicionar contato</button></div>';const f=$('#find');if(f)f.onclick=addContactModal;return}list.innerHTML=xs.map(c=>`<button class="item" type="button" data-id="${esc(c.id)}" aria-label="Abrir conversa com ${esc(c.name)}">${av(c)}<div class="info"><b>${esc(c.name)}</b><span>@${esc(c.username)}</span><small class="presence" data-presence="${esc(c.id)}">${esc(presenceText(c))}</small></div></button>`).join('');list.querySelectorAll('.item').forEach(item=>{
  const id=String(item.dataset.id);
  item.onclick=()=>{if(longPressTriggered){longPressTriggered=false;return}openChat(id)};
  item.addEventListener('pointerdown',()=>{longPressTriggered=false;clearTimeout(longPressTimer);longPressTimer=setTimeout(()=>{longPressTriggered=true;conversationActions(id)},650)},{passive:true});
  ['pointerup','pointercancel','pointerleave'].forEach(ev=>item.addEventListener(ev,()=>clearTimeout(longPressTimer),{passive:true}));
})} 
async function conversationActions(id){
  const c=A.contacts.find(x=>String(x.id)===String(id)); if(!c)return;
  modal(`<h2>${esc(c.name)}</h2><p class="muted">Escolha o que deseja apagar. O contato não será removido.</p><button class="menurow" id="deleteChat">Apagar caixa de mensagens</button><button class="menurow" id="deleteCalls">Apagar registros de ligações</button><button class="danger" data-close>Cancelar</button>`);
  $('#deleteChat').onclick=async()=>{try{await api('/api/messages/'+id,{method:'DELETE'});await loadConversations();$('#modal').innerHTML='';renderList();toast('Caixa de mensagens apagada')}catch(e){toast(e.message)}};
  $('#deleteCalls').onclick=async()=>{try{await api('/api/calls/'+id,{method:'DELETE'});$('#modal').innerHTML='';toast('Registros de ligações apagados')}catch(e){toast(e.message)}};
}
function contactsView(){renderList(true);$('#list').insertAdjacentHTML('afterbegin','<div class="section"><b>Seus contatos</b><button class="smallbtn" id="add">＋ Adicionar</button></div>');$('#add').onclick=addContactModal}function setTab(active){document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));if(active)active.classList.add('active')}
function formatCallTime(ts){const d=new Date(ts||Date.now()),today=new Date();const same=d.toDateString()===today.toDateString();return same?d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
function formatCallDuration(sec){sec=Math.max(0,Number(sec)||0);if(sec<60)return sec+'s';const m=Math.floor(sec/60),s=sec%60;return m+'min'+(s?` ${String(s).padStart(2,'0')}s`:'')}
async function callsView(){setTab($('#callsTab'));const list=$('#list');if(!list)return;list.innerHTML='<div class="empty">Carregando ligações...</div>';try{A.calls=await api('/api/calls');}catch(e){A.calls=[];toast('Não foi possível carregar as ligações.')}if(!A.calls.length){list.innerHTML='<div class="empty">Nenhuma ligação ainda.</div>';return;}list.innerHTML=A.calls.map(c=>{const o=c.other||{};const mine=String(c.from)===String(A.user.id);const missed=['rejected','busy'].includes(c.status)&&!mine;const label=missed?'Chamada perdida':mine?'Chamada efetuada':'Chamada recebida';const arrow=missed?'missed':mine?'outgoing':'incoming';const duration=c.duration?` · ${formatCallDuration(c.duration)}`:'';return `<button class="callHistoryItem" type="button" data-id="${esc(o.id||'')}">${av(o)}<div class="callHistoryInfo"><b>${esc(o.name||'Contato')}</b><span class="callMeta ${arrow}"><span class="callArrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 19 19 5M19 5H9M19 5v10"/></svg></span>${label} · ${formatCallTime(c.endedAt||c.startedAt)}${duration}</span></div><span class="callHistoryBtn" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6.6 10.8c1.5 2.9 3.7 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.2 1 .0 2 .5 3 .5.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C11.5 21 3 12.5 3 2.5c0-.6.4-1-1-1H7c.6 0 1 .4 1 1 0 1 .2 2 .5 3 .1.4 0 .8-.2 1.1l-1.7 1.7z"/></svg></span></button>`}).join('');list.querySelectorAll('.callHistoryItem').forEach(item=>item.onclick=()=>{const id=item.dataset.id;if(id)openChat(String(id))});}

async function openChat(id){const contact=A.contacts.find(x=>String(x.id)===String(id));if(!contact){toast('Contato não encontrado');return;}A.active=contact;A.messages=[];A.remoteTyping=false;document.body.classList.add('chat-open');$('#main').className='main mobile';$('#main').innerHTML=`<header class="head"><button class="icon back" id="back" type="button">‹</button>${av(contact)}<div class="headInfo"><b>${esc(contact.name)}</b><span id="chatPresence">${esc(presenceText(contact))}</span></div><button class="callBtn" id="call" type="button" aria-label="Ligar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8c1.5 2.9 3.7 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.2 1 .3 2 .5 3 .5.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C11.5 21 3 12.5 3 2.5c0-.6.4-1 1-1H7c.6 0 1 .4 1 1 0 1 .2 2 .5 3 .1.4 0 .8-.2 1.1l-1.7 1.7z"/></svg></button></header><div class="messages" id="msgs"><div class="empty">Carregando conversa...</div></div><form class="composer" id="composer"><button class="voice" id="voice" type="button" aria-label="Gravar áudio">●</button><input id="msg" placeholder="Digite uma mensagem…" autocomplete="off"><button class="send" type="submit" aria-label="Enviar mensagem">➤</button></form>`;const callBtn=$('#call');if(callBtn)callBtn.onclick=()=>startOutgoingCall(contact);const back=$('#back');if(back)back.onclick=()=>{if(A.call.peer&&String(A.call.peer)===String(contact.id))endCall(true);stopRecording(false);sendTyping(false);document.body.classList.remove('chat-open');$('#main').className='main';A.active=null;A.remoteTyping=false;$('#main').innerHTML='<div class="welcome"><div class="mark">L</div><h1>Linka</h1><p>Selecione um contato para começar.</p></div>';renderList()};const form=$('#composer');const input=$('#msg');if(input){input.addEventListener('input',()=>{if(!A.active)return;sendTyping(true);clearTimeout(A.typingTimer);A.typingTimer=setTimeout(()=>sendTyping(false),1400)});input.addEventListener('blur',()=>sendTyping(false))}if(form)form.onsubmit=async e=>{e.preventDefault();sendTyping(false);const input=$('#msg'),text=input.value.trim();if(!text)return;input.value='';try{const m=await api('/api/messages/'+contact.id,{method:'POST',body:{text}});if(A.active&&String(A.active.id)===String(contact.id)){A.messages.push(m);if(!A.chatIds.includes(String(contact.id)))A.chatIds.push(String(contact.id));drawMessages()}}catch(e){input.value=text;toast(e.message)}};setupRecorder(contact);try{A.messages=await api('/api/messages/'+contact.id);drawMessages()}catch(e){A.messages=[];drawMessages();toast('Não foi possível carregar a conversa agora. Você ainda pode tentar enviar uma mensagem.')}}
let recorder=null,recordChunks=[],recordTimer=null,recordSeconds=0,recordContact=null;
function setupRecorder(contact){recordContact=contact;const b=$('#voice');if(!b)return;b.onclick=()=>{if(recorder&&recorder.state==='recording')stopRecording(true);else startRecording(contact)};}
async function startRecording(contact){if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){toast('Seu navegador não suporta gravação de áudio');return}try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});const types=['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4'];const mime=types.find(x=>MediaRecorder.isTypeSupported(x))||'';recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);recordChunks=[];recordSeconds=0;recordContact=contact;recorder.ondataavailable=e=>{if(e.data.size)recordChunks.push(e.data)};recorder.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());clearInterval(recordTimer);recordTimer=null;const blob=new Blob(recordChunks,{type:recorder.mimeType||'audio/webm'});recordChunks=[];if(blob.size>8*1024*1024){toast('Áudio muito grande. Grave por menos tempo.');resetVoice();return}const reader=new FileReader();reader.onload=async()=>{try{const m=await api('/api/messages/'+contact.id,{method:'POST',body:{type:'audio',audio:reader.result}});if(A.active&&String(A.active.id)===String(contact.id)){A.messages.push(m);if(!A.chatIds.includes(String(contact.id)))A.chatIds.push(String(contact.id));drawMessages()}toast('Áudio enviado')}catch(e){toast(e.message)}resetVoice()};reader.readAsDataURL(blob)};recorder.start(250);recordTimer=setInterval(()=>{recordSeconds++;const b=$('#voice');if(b)b.textContent=formatRecordTime(recordSeconds);if(recordSeconds>=90)stopRecording(true)},1000);const b=$('#voice');if(b){b.classList.add('recording');b.textContent='■'}const input=$('#msg');if(input)input.placeholder='Gravando… toque para enviar'}catch(e){toast('Não foi possível acessar o microfone');resetVoice()}}
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
function sendSignal(to,payload){const ws=window.__linkaWs;if(!to||!ws||ws.readyState!==1)return false;try{ws.send(JSON.stringify({to,...payload}));return true}catch{return false}}
function ensureCallUi(){
  if($('#callOverlay'))return;
  document.body.insertAdjacentHTML('beforeend',`<div id="callOverlay" class="callOverlay" hidden>
    <div class="callCard" id="callCard">
      <div id="videoStage" class="videoStage" hidden><video id="callRemoteVideo" class="callRemoteVideo" autoplay playsinline></video><video id="callLocalVideo" class="callLocalVideo" autoplay muted playsinline></video></div>
      <div id="callAvatar" class="callAvatar"></div>
      <h2 id="callName">Chamada</h2>
      <p id="callStatus">Chamada</p>
      <div class="callActions">
        <button id="callDecline" class="callDecline" type="button" aria-label="Recusar ou cancelar chamada"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.8 3.8 6c-.7.7-.8 1.8-.2 2.6 2.1 2.9 5 5.8 7.9 7.9.8.6 1.9.5 2.6-.2l1.2-1.2-3-3-1.1 1.1c-1.2-.9-2.5-2.2-3.4-3.4l1.1-1.1-3-3z"/><path d="m4 4 16 16"/></svg></button>
        <button id="callAccept" class="callAccept" type="button" aria-label="Atender chamada"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5.1 5.6 6.5c-.7.7-.8 1.8-.2 2.6 2.2 3 5.1 5.9 8.1 8.1.8.6 1.9.5 2.6-.2l1.4-1.4-2.8-2.8-1.3 1.3c-1.1-.8-2.3-2-3.1-3.1l1.3-1.3L7 5.1Z"/><path d="M14.5 5.5c2.2.4 3.6 1.8 4 4"/><path d="M14.5 2.5c3.9.5 6.4 3 7 6.9"/></svg></button>
      </div>
      <button id="callEnd" class="callEnd" type="button" aria-label="Encerrar chamada" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 16"/></svg><span>Encerrar</span></button>
      <audio id="callRemoteAudio" autoplay playsinline></audio>
    </div>
  </div>`);
  $('#callAccept').onclick=acceptIncomingCall;
  $('#callDecline').onclick=()=>{const d=A.call.incoming;if(d?.from)sendSignal(d.from,{type:'call-reject',callId:d.callId});endCall(true)};
  $('#callEnd').onclick=()=>endCall(true);
}

function stopOutgoingRing(){
  try{if(A.call.ringTimer)clearInterval(A.call.ringTimer)}catch{}
  try{A.call.ringGain?.disconnect()}catch{}
  try{A.call.ringContext?.close()}catch{}
  A.call.ringTimer=null;A.call.ringGain=null;A.call.ringContext=null;
}
function startOutgoingRing(){
  stopOutgoingRing();
  try{
    const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
    const ctx=new C();const gain=ctx.createGain();gain.gain.value=0.34;gain.connect(ctx.destination);A.call.ringContext=ctx;A.call.ringGain=gain;
    const tone=()=>{
      if(!A.call.id||A.call.accepted===false||A.call.connectedAt)return;
      const now=ctx.currentTime;
      const a=ctx.createOscillator(),b=ctx.createOscillator(),g=ctx.createGain();
      a.type='sine';b.type='sine';a.frequency.value=440;b.frequency.value=554.37;
      g.gain.setValueAtTime(0.0001,now);g.gain.exponentialRampToValueAtTime(0.8,now+0.025);g.gain.exponentialRampToValueAtTime(0.0001,now+0.32);
      a.connect(g);b.connect(g);g.connect(gain);a.start(now);b.start(now);a.stop(now+0.34);b.stop(now+0.34);
    };
    tone();A.call.ringTimer=setInterval(tone,1800);
  }catch(e){console.warn('Som da chamada',e)}
}
function startCallTimer(){
  if(A.call.callTimer)clearInterval(A.call.callTimer);
  A.call.connectedAt=Date.now();
  const update=()=>{
    const sec=Math.max(0,Math.floor((Date.now()-A.call.connectedAt)/1000));
    const m=String(Math.floor(sec/60)).padStart(2,'0');
    const s=String(sec%60).padStart(2,'0');
    const el=$('#callTimer');
    if(el)el.textContent=m+':'+s;
  };
  update();
  A.call.callTimer=setInterval(update,1000);
}
function markCallConnected(){
  $('#callAccept').hidden=true;$('#callDecline').hidden=true;$('#callEnd').hidden=false;
  $('#callStatus').innerHTML='Conectado <span id="callTimer" class="callTimer">00:00</span>';
  startCallTimer();
}

function showCallOverlay(name,photo,status,incoming=false){
  ensureCallUi();const o=$('#callOverlay');o.hidden=false;
  $('#callAvatar').innerHTML=photo?`<img src="${esc(photo)}">`:esc((name||'?')[0].toUpperCase());
  $('#callName').textContent=name||'Chamada';$('#callStatus').textContent=status||'Chamada';
  $('#callAccept').hidden=!incoming;
  $('#callDecline').hidden=false;
  $('#callEnd').hidden=true;
}
function hideCallOverlay(){const o=$('#callOverlay');if(o)o.hidden=true}

function b64FromBytes(bytes){let s='';const step=0x8000;for(let i=0;i<bytes.length;i+=step)s+=String.fromCharCode(...bytes.subarray(i,i+step));return btoa(s)}
function bytesFromB64(b64){const s=atob(b64);const a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return a}
function downsampleTo16k(input,srcRate){if(srcRate===16000)return input;const ratio=srcRate/16000;const len=Math.round(input.length/ratio);const out=new Float32Array(len);let o=0,pos=0;while(o<len){const next=Math.round((o+1)*ratio);let sum=0,count=0;for(let i=Math.round(pos);i<Math.min(next,input.length);i++){sum+=input[i];count++}out[o++]=count?sum/count:0;pos=next}return out}
function pcm16Base64(samples){const a=new Int16Array(samples.length);for(let i=0;i<samples.length;i++){const v=Math.max(-1,Math.min(1,samples[i]));a[i]=v<0?v*32768:v*32767}return b64FromBytes(new Uint8Array(a.buffer))}
function base64ToFloat32(b64){const u=bytesFromB64(b64);const a=new Int16Array(u.buffer,u.byteOffset,Math.floor(u.byteLength/2));const out=new Float32Array(a.length);for(let i=0;i<a.length;i++)out[i]=a[i]/32768;return out}
function stopLiveAudio(){
  try{A.call.processor?.disconnect()}catch{} try{A.call.source?.disconnect()}catch{} try{A.call.silentGain?.disconnect()}catch{}
  A.call.stream?.getTracks().forEach(t=>t.stop());
  try{A.call.audioContext?.close()}catch{}
  A.call.processor=null;A.call.source=null;A.call.silentGain=null;A.call.audioContext=null;A.call.playTime=0;
}
async function startLiveAudio(){
  if(A.call.audioContext&&A.call.processor)return true;
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
  const ctx=new (window.AudioContext||window.webkitAudioContext)();await ctx.resume();
  const source=ctx.createMediaStreamSource(stream);
  const processor=ctx.createScriptProcessor(4096,1,1);
  const silent=ctx.createGain();silent.gain.value=0;
  A.call.stream=stream;A.call.audioContext=ctx;A.call.source=source;A.call.processor=processor;A.call.silentGain=silent;A.call.playTime=ctx.currentTime+0.08;
  processor.onaudioprocess=e=>{
    if(!A.call.id||!A.call.peer||window.__linkaWs?.readyState!==1)return;
    const input=e.inputBuffer.getChannelData(0);const pcm=downsampleTo16k(input,ctx.sampleRate);
    if(!pcm.length)return;
    try{window.__linkaWs.send(JSON.stringify({to:A.call.peer,type:'call-live-audio',callId:A.call.id,pcm:pcm16Base64(pcm)}))}catch{}
  };
  source.connect(processor);processor.connect(silent);silent.connect(ctx.destination);
  return true;
}
function playLiveAudio(b64){
  if(!A.call.audioContext||!b64)return;
  const ctx=A.call.audioContext;if(ctx.state==='suspended')ctx.resume().catch(()=>{});
  const samples=base64ToFloat32(b64);if(!samples.length)return;
  const buffer=ctx.createBuffer(1,samples.length,16000);buffer.copyToChannel(samples,0);
  const src=ctx.createBufferSource();src.buffer=buffer;src.connect(ctx.destination);
  const now=ctx.currentTime;A.call.playTime=Math.max(A.call.playTime||now+0.05,now+0.03);src.start(A.call.playTime);A.call.playTime+=buffer.duration;
}
async function acceptIncomingCall(){
  stopOutgoingRing();
  if(!A.call.id||!A.call.peer)return;
  if(A.call.mode==='video'){return acceptIncomingVideoCall()}
  try{
    $('#callAccept').disabled=true;$('#callDecline').disabled=true;$('#callStatus').textContent='Conectando áudio…';
    await startLiveAudio();
    A.call.accepted=true;
    sendSignal(A.call.peer,{type:'call-live-ready',callId:A.call.id});
  }catch(e){
    console.error(e);toast('Não foi possível acessar o microfone');
    if(A.call.peer)sendSignal(A.call.peer,{type:'call-reject',callId:A.call.id});
    endCall(false);
  }
}
async function handleLiveReady(d){
  if(d?.callId!==A.call.id)return;
  if(!A.call.accepted){return}
  if(!A.call.liveStarted){
    try{
      await startLiveAudio();
      A.call.liveStarted=true;
      $('#callStatus').textContent='Conectando áudio…';
      sendSignal(d.from,{type:'call-live-start',callId:d.callId});
    }catch(e){console.error(e);toast('Não foi possível acessar o microfone');sendSignal(d.from,{type:'call-reject',callId:d.callId});endCall(false)}
  }else{
    markCallConnected();
  }
}
async function handleLiveStart(d){
  if(!d?.callId||d.callId!==A.call.id)return;
  if(!A.call.accepted)return;
  try{
    await startLiveAudio();
    markCallConnected();
    sendSignal(d.from,{type:'call-live-ready',callId:d.callId});
  }catch(e){console.error(e);toast('Não foi possível acessar o microfone');sendSignal(d.from,{type:'call-reject',callId:d.callId});endCall(false)}
}
function handleLiveAudio(d){if(d?.callId===A.call.id&&A.call.peer===d.from)playLiveAudio(d.pcm)}

function videoIceServers(){return[{urls:['stun:stun.l.google.com:19302','stun:stun.cloudflare.com:3478']},{urls:'turn:openrelay.metered.ca:80',username:'openrelayproject',credential:'openrelayproject'},{urls:'turn:openrelay.metered.ca:443?transport=tcp',username:'openrelayproject',credential:'openrelayproject'},{urls:'turns:openrelay.metered.ca:443?transport=tcp',username:'openrelayproject',credential:'openrelayproject'}]}
async function setupVideoMedia(){
  if(A.call.videoLocal)return A.call.videoLocal;
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:{facingMode:'user',width:{ideal:720},height:{ideal:1280}}});
  A.call.videoLocal=stream;const local=$('#callLocalVideo');if(local){local.srcObject=stream;local.muted=true;local.play().catch(()=>{})}return stream;
}
function setupVideoPeer(){
  if(A.call.videoPc)return A.call.videoPc;
  const pc=new RTCPeerConnection({iceServers:videoIceServers(),bundlePolicy:'max-bundle'});A.call.videoPc=pc;
  pc.onicecandidate=e=>{if(e.candidate&&A.call.peer&&A.call.id)sendSignal(A.call.peer,{type:'call-video-ice',callId:A.call.id,candidate:e.candidate})};
  pc.ontrack=e=>{const v=$('#callRemoteVideo');if(v&&e.streams[0]){A.call.videoRemote=e.streams[0];v.srcObject=e.streams[0];v.play().catch(()=>{})}};
  pc.onconnectionstatechange=()=>{if(pc.connectionState==='connected')markCallConnected();else if(pc.connectionState==='failed'){$('#callStatus').textContent='Falha na conexão de vídeo';setTimeout(()=>endCall(true),1500)}};
  return pc;
}
async function startOutgoingVideoCall(contact){
  if(A.call.id){toast('Você já está em uma chamada');return}
  const callId=crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random();A.call.peer=contact.id;A.call.id=callId;A.call.incoming=null;A.call.accepted=true;A.call.liveStarted=false;A.call.mode='audio';A.call.mode='video';A.call.connectedAt=null;A.call.callTimer=null;A.call.roomName=contact.name;A.call.roomPhoto=contact.photo||'';
  showCallOverlay(contact.name,contact.photo,'Chamando…',false);showVideoStage();
  if(!sendSignal(contact.id,{type:'call-room-invite',callId,mode:'video'})){endCall(false);toast('Não foi possível iniciar a chamada de vídeo');return}
}
function showVideoStage(){ensureCallUi();const st=$('#videoStage');if(st)st.hidden=false;const av=$('#callAvatar');if(av)av.style.display='none';const card=$('#callCard');if(card)card.classList.add('videoCallCard')}
async function beginVideoOffer(){
  const stream=await setupVideoMedia();const pc=setupVideoPeer();stream.getTracks().forEach(t=>pc.addTrack(t,stream));
  const offer=await pc.createOffer({offerToReceiveAudio:true,offerToReceiveVideo:true});await pc.setLocalDescription(offer);sendSignal(A.call.peer,{type:'call-video-offer',callId:A.call.id,offer:pc.localDescription});
}
async function acceptIncomingVideoCall(){
  try{showVideoStage();$('#callAccept').disabled=true;$('#callDecline').disabled=true;$('#callStatus').textContent='Conectando vídeo…';await setupVideoMedia();const pc=setupVideoPeer();A.call.accepted=true;sendSignal(A.call.peer,{type:'call-video-ready',callId:A.call.id})}catch(e){console.error(e);toast('Não foi possível acessar câmera e microfone');if(A.call.peer)sendSignal(A.call.peer,{type:'call-reject',callId:A.call.id});endCall(false)}}
async function handleVideoReady(d){if(d?.callId!==A.call.id||A.call.mode!=='video')return;try{await beginVideoOffer()}catch(e){console.error(e);toast('Não foi possível iniciar o vídeo');endCall(true)}}
async function handleVideoOffer(d){if(d?.callId!==A.call.id||A.call.mode!=='video'||!A.call.accepted)return;try{const stream=await setupVideoMedia();const pc=setupVideoPeer();stream.getTracks().forEach(t=>{if(!pc.getSenders().some(s=>s.track===t))pc.addTrack(t,stream)});await pc.setRemoteDescription(d.offer);for(const c of A.call.videoRemoteIceQueue.splice(0))try{await pc.addIceCandidate(c)}catch{}const answer=await pc.createAnswer();await pc.setLocalDescription(answer);sendSignal(d.from,{type:'call-video-answer',callId:d.callId,answer:pc.localDescription})}catch(e){console.error(e);toast('Falha ao conectar o vídeo');endCall(true)}}
async function handleVideoAnswer(d){if(d?.callId!==A.call.id||!A.call.videoPc)return;try{await A.call.videoPc.setRemoteDescription(d.answer);for(const c of A.call.videoRemoteIceQueue.splice(0))try{await A.call.videoPc.addIceCandidate(c)}catch{}}catch(e){console.error(e)}}
async function handleVideoIce(d){if(d?.callId!==A.call.id||!d.candidate)return;const pc=A.call.videoPc;if(!pc||!pc.remoteDescription){A.call.videoRemoteIceQueue.push(d.candidate);return}try{await pc.addIceCandidate(d.candidate)}catch(e){console.warn('ICE vídeo',e)}}
function startOutgoingCall(contact){
  if(A.call.id){toast('Você já está em uma chamada');return}
  const callId=crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random();
  A.call.peer=contact.id;A.call.id=callId;A.call.incoming=null;A.call.accepted=true;A.call.liveStarted=false;A.call.connectedAt=null;A.call.callTimer=null;A.call.roomName=contact.name;A.call.roomPhoto=contact.photo||'';
  showCallOverlay(contact.name,contact.photo,'Chamando…',false);startOutgoingRing();
  if(!sendSignal(contact.id,{type:'call-room-invite',callId})){endCall(false);toast('Não foi possível iniciar a chamada')}
}
function handleCallRoomInvite(d){
  if(A.call.id){if(d?.from)sendSignal(d.from,{type:'call-busy',callId:d.callId});return}
  const contact=A.contacts.find(x=>String(x.id)===String(d.from))||{};
  A.call.incoming=d;A.call.peer=d.from;A.call.id=d.callId;A.call.accepted=false;A.call.mode=d.mode==='video'?'video':'audio';A.call.liveStarted=false;A.call.connectedAt=null;A.call.callTimer=null;A.call.roomName=contact.name||'Contato';A.call.roomPhoto=contact.photo||'';
  showCallOverlay(A.call.roomName,A.call.roomPhoto,A.call.mode==='video'?'Chamada de vídeo recebida':'Chamada recebida',true);if(A.call.mode==='video')showVideoStage();
}
function endCall(notifyPeer=false){
  stopOutgoingRing();
  const peer=A.call.peer,id=A.call.id;if(notifyPeer&&peer&&id)sendSignal(peer,{type:'call-end',callId:id});
  stopLiveAudio();if(A.call.callTimer)clearInterval(A.call.callTimer);A.call={pc:null,stream:null,remote:null,peer:null,id:null,incoming:null,pendingCandidates:[],earlyCandidates:[],roomCode:null,roomRole:null,roomJoined:false,remoteRoomJoined:false,roomName:null,roomPhoto:null,mode:'audio',videoPc:null,videoLocal:null,videoRemote:null,videoOffer:null,videoIceQueue:[],videoRemoteIceQueue:[],audioContext:null,source:null,processor:null,silentGain:null,playTime:0,accepted:false,liveStarted:false,connectedAt:null,callTimer:null,ringContext:null,ringGain:null,ringTimer:null};hideCallOverlay();
}
function sendTyping(active){if(!A.active||window.__linkaWs?.readyState!==1)return;try{window.__linkaWs.send(JSON.stringify({type:'typing',to:A.active.id,active:!!active}))}catch{}}
function showTyping(active,from){if(!A.active||String(A.active.id)!==String(from))return;const el=$('#chatPresence');if(!el)return;if(active){A.remoteTyping=true;el.innerHTML='<span class="typingDots"><i></i><i></i><i></i></span>'}else{A.remoteTyping=false;el.textContent=presenceText(A.active)}}
function connect(){const proto=location.protocol==='https:'?'wss':'ws';const ws=new WebSocket(proto+'://'+location.host+'/?token='+encodeURIComponent(A.token));ws.onopen=()=>{try{ws.send(JSON.stringify({type:'ping'}))}catch{}};ws.onmessage=async e=>{if(typeof e.data!=='string')return;let d;try{d=JSON.parse(e.data)}catch{return}if(d.type==='contact_added'){await loadContacts();renderList();toast('Novo contato adicionado')}if(d.type==='presence'){await loadContacts();refreshPresence()}if(d.type==='typing'){showTyping(!!d.active,d.from)}if(d.type==='call-room-invite'){handleCallRoomInvite(d)}if(d.type==='call-live-start'){handleLiveStart(d)}if(d.type==='call-live-ready'){handleLiveReady(d)}if(d.type==='call-live-audio'){handleLiveAudio(d)}if(d.type==='call-video-ready'){handleVideoReady(d)}if(d.type==='call-video-offer'){handleVideoOffer(d)}if(d.type==='call-video-answer'){handleVideoAnswer(d)}if(d.type==='call-video-ice'){handleVideoIce(d)}if(d.type==='call-offer'){handleIncomingOffer(d)}if(d.type==='call-answer'){handleCallAnswer(d)}if(d.type==='call-ice'){handleCallIce(d)}if(d.type==='call-reject'){toast('Chamada recusada');endCall(false)}if(d.type==='call-busy'){toast('Contato está em outra chamada');endCall(false)}if(d.type==='call-end'){toast('Chamada encerrada');endCall(false);if($('#callsTab')?.classList.contains('active'))callsView()}if(d.type==='notification'){A.notifications.unshift(d.notification);A.notifications=A.notifications.slice(0,100);updateNotifBell();if(d.notification.kind==='message'){toast('Nova mensagem de '+d.notification.title);notifyIncoming({from:d.notification.from,type:'text',text:d.notification.body})}else toast(d.notification.title);return}if(d.type==='message'){if(A.active&&String(d.message.from)===String(A.active.id)){showTyping(false,d.message.from);A.messages.push(d.message);if(!A.chatIds.includes(String(d.message.from)))A.chatIds.push(String(d.message.from));drawMessages()}else{toast('Nova mensagem');notifyIncoming(d.message)}}};ws.onclose=()=>setTimeout(()=>A.token&&connect(),3000);window.__linkaWs=ws}
setInterval(async()=>{if(!A.token)return;try{await api('/api/ping',{method:'POST'});await loadContacts();refreshPresence()}catch{}if(window.__linkaWs?.readyState===1)try{window.__linkaWs.send(JSON.stringify({type:'ping'}))}catch{}},20000);
start();
