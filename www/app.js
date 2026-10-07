const A={selectedMessageId:null,selectedMessageIds:new Set(),editingMessage:null,replyingMessage:null,pendingOffline:[],chatIds:[],token:localStorage.getItem('ac_token')||sessionStorage.getItem('ac_token')||'',user:null,contacts:[],active:null,search:'',messages:[],typingTimer:null,remoteTyping:false,notifications:[],statuses:[],calls:[],previews:{},call:{pc:null,stream:null,remote:null,peer:null,id:null,incoming:null,pendingCandidates:[],earlyCandidates:[],roomCode:null,roomRole:null,roomJoined:false,remoteRoomJoined:false,roomName:null,roomPhoto:null,mode:'audio',muted:false,videoPc:null,videoLocal:null,videoRemote:null,videoOffer:null,videoIceQueue:[],videoRemoteIceQueue:[],audioPc:null,audioLocal:null,audioRemote:null,audioRemoteIceQueue:[],audioOffer:null,audioContext:null,source:null,processor:null,silentGain:null,playTime:0,accepted:false,liveStarted:false,connectedAt:null,callTimer:null,callStartedAt:null,ringContext:null,ringGain:null,ringTimer:null,screenStream:null,screenSharing:false}};
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
function inAppNotify(title,body,action){
  let box=document.querySelector('#inAppNotifs');
  if(!box){box=document.createElement('div');box.id='inAppNotifs';box.className='inAppNotifs';document.body.appendChild(box)}
  const n=document.createElement('button');n.type='button';n.className='inAppNotif';
  n.innerHTML=`<div class=\"inAppNotifTitle\">${esc(title)}</div><div class=\"inAppNotifBody\">${esc(body)}</div>`;
  if(action)n.onclick=()=>{n.remove();action()};
  box.appendChild(n);
  setTimeout(()=>n.remove(),4200);
}
function lastSeenText(c){const t=Number(c?.lastSeen||0);if(!t)return 'offline';const d=new Date(t),now=new Date();const time=d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});const startToday=new Date(now.getFullYear(),now.getMonth(),now.getDate());const startYesterday=new Date(startToday.getTime()-86400000);if(d>=startToday)return 'visto por último hoje às '+time;if(d>=startYesterday)return 'visto por último ontem às '+time;return 'visto por último em '+d.toLocaleDateString('pt-BR')+' às '+time}
function presenceText(c){if(c?.online)return 'online';return lastSeenText(c)}
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
      await Promise.all([loadContacts(),loadConversations(),loadNotifications(),loadStatuses()]);
      render();
      hideBoot();
      window.addEventListener('online',()=>{flushOfflineQueue();if(A.active)toast('Conexão restaurada')});window.addEventListener('offline',()=>{if(A.active)showOfflineOnce()});setTimeout(flushOfflineQueue,1200);initNotifications();
      armNotificationActivation();
      connect();
      if('Notification' in window && Notification.permission!=='granted'){setTimeout(()=>{if(A.token&&document.visibilityState==='visible')toast('Ative as notificações no Menu para receber mensagens mesmo fora do Linka.')},1200)}
      const params=new URLSearchParams(location.search);const chat=params.get('chat');const user=params.get('user');if(chat)setTimeout(()=>openChat(chat),150);else if(user)setTimeout(async()=>{try{const xs=await api('/api/users?q='+encodeURIComponent(user));const hit=xs.find(x=>String(x.username).toLowerCase()===String(user).toLowerCase()||String(x.id)===String(user));if(hit){if(!A.contacts.some(c=>String(c.id)===String(hit.id)))await api('/api/contacts/'+hit.id,{method:'POST'}).catch(()=>{});await loadContacts();contactProfile(hit.id)}}catch{}},250);
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
async function loadContacts(){const [contacts,blocked]=await Promise.all([api('/api/contacts'),api('/api/blocked').catch(()=>[])]);const ids=new Set((blocked||[]).map(x=>String(x.id)));A.contacts=(contacts||[]).filter(c=>!ids.has(String(c.id)))}
async function loadConversations(){A.chatIds=await api('/api/conversations');try{const rows=await api('/api/conversation-previews');A.previews=Object.fromEntries((rows||[]).map(x=>[String(x.id),x.message]))}catch{A.previews={}}}
async function loadStatuses(){try{A.statuses=await api('/api/statuses')}catch{A.statuses=[]}}
function contactStatusInfo(id){const xs=(A.statuses||[]).filter(x=>String(x.user?.id)===String(id));if(!xs.length)return {has:false,unseen:false,index:-1};const firstUnseen=xs.find(x=>!x.viewedByMe);return {has:true,unseen:!!firstUnseen,index:firstUnseen?A.statuses.indexOf(firstUnseen):A.statuses.indexOf(xs[0])};}
function render(){applyAppSettings();document.body.classList.remove('chat-open');document.body.innerHTML=`<div class="app"><aside class="side" id="side"><header class="top"><div class="profile" id="profile">${av(A.user)}<div><b>${esc(A.user.name)}</b><span>${esc('@'+A.user.username)}</span></div></div><button class="icon" id="menu">☰</button></header><div class="search">⌕<input id="search" placeholder="Pesquisar contatos ou conversas"></div><div class="tabs"><button class="tab active" id="chats">Conversas</button><button class="tab" id="contacts">Contatos</button><button class="tab" id="statusTab">Status</button><button class="tab" id="callsTab" aria-label="Ligações"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8c1.5 2.9 3.7 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.2 1 .3 2 .5 3 .5.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C11.5 21 3 12.5 3 2.5c0-.6.4-1 1-1H7c.6 0 1 .4 1 1 0 1 .2 2 .5 3 .1.4 0 .8-.2 1.1l-1.7 1.7z"/></svg><span>Ligações</span></button></div><div class="list" id="list"></div></aside><main class="main" id="main"><div class="welcome"><div class="mark">A</div><h1>Linka</h1><p>Selecione um contato para começar.</p></div></main><div id="modal"></div></div>`;$('#profile').onclick=profileModal;$('#menu').onclick=menuModal;$('#search').oninput=e=>{A.search=e.target.value.trim();renderList()};$('#chats').onclick=()=>{setTab($('#chats'));renderList()};$('#contacts').onclick=()=>{setTab($('#contacts'));contactsView()};$('#statusTab').onclick=()=>statusView();$('#callsTab').onclick=callsView;renderList()}
function conversationPreview(m){if(!m)return '';if(m.deletedForEveryone)return 'Mensagem apagada';if(m.type==='audio')return '🎙️ Áudio';if(m.type==='sticker')return '✨ Sticker';if(m.type==='media')return String(m.mediaType||'').startsWith('video/')?'🎥 Vídeo':'📷 Foto';const t=String(m.text||'').trim();return t||'Mensagem'}
function renderList(showAll=false){const q=A.search.toLowerCase();const xs=A.contacts.filter(c=>(showAll||A.chatIds.includes(String(c.id)))&&(c.name+' '+c.username).toLowerCase().includes(q));const list=$('#list');if(!list)return;if(!xs.length){list.innerHTML='<div class="empty">Nenhum contato.<br><button class="link" id="find" type="button">Adicionar contato</button></div>';const f=$('#find');if(f)f.onclick=addContactModal;return}const ordered=showAll?xs:[...xs].sort((a,b)=>Number(A.previews?.[b.id]?.createdAt||0)-Number(A.previews?.[a.id]?.createdAt||0));list.innerHTML=ordered.map(c=>{const preview=A.previews?.[String(c.id)];const sub=showAll?('@'+c.username):(conversationPreview(preview)||'Nenhuma mensagem ainda');const si=contactStatusInfo(c.id);const avatar=si.has?`<span class="statusAvatar ${si.unseen?'statusNew':'statusSeen'}" data-status-index="${si.index}" title="${si.unseen?'Novo status':'Status visto'}">${av(c)}</span>`:av(c);return `<button class="item" type="button" data-id="${esc(c.id)}" aria-label="Abrir conversa com ${esc(c.name)}">${avatar}<div class="info"><b>${esc(c.name)}</b><small class="chatPreview" data-chat-preview="${esc(c.id)}">${esc(sub)}</small></div></button>`}).join('');list.querySelectorAll('.item').forEach(item=>{
  const id=String(item.dataset.id);
  item.onclick=(e)=>{if(longPressTriggered){longPressTriggered=false;return}if(e.target.closest('.statusAvatar'))return;openChat(id)};
  item.querySelector('.statusAvatar')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();const i=Number(e.currentTarget.dataset.statusIndex);if(Number.isFinite(i)&&i>=0)statusViewer(A.statuses,i)});
  item.addEventListener('pointerdown',()=>{longPressTriggered=false;clearTimeout(longPressTimer);longPressTimer=setTimeout(()=>{longPressTriggered=true;conversationActions(id)},650)},{passive:true});
  ['pointerup','pointercancel','pointerleave'].forEach(ev=>item.addEventListener(ev,()=>clearTimeout(longPressTimer),{passive:true}));
})} 
async function conversationActions(id){
  const c=A.contacts.find(x=>String(x.id)===String(id)); if(!c)return;
  modal(`<h2>${esc(c.name)}</h2><p class="muted">Escolha o que deseja apagar. O contato não será removido.</p><button class="menurow" id="deleteChat">Apagar caixa de mensagens</button><button class="menurow" id="deleteCalls">Apagar registros de ligações</button><button class="danger" data-close>Cancelar</button>`);
  $('#deleteChat').onclick=async()=>{try{await api('/api/messages/'+id,{method:'DELETE'});await loadConversations();$('#modal').innerHTML='';renderList();toast('Caixa de mensagens apagada')}catch(e){toast(e.message)}};
  $('#deleteCalls').onclick=async()=>{try{await api('/api/calls/'+id,{method:'DELETE'});$('#modal').innerHTML='';toast('Registros de ligações apagados')}catch(e){toast(e.message)}};
}
function contactsView(){renderList(true);$('#list').insertAdjacentHTML('afterbegin','<div class="section"><b>Seus contatos</b><button class="smallbtn" id="add">＋ Adicionar</button></div>');$('#add').onclick=addContactModal;document.querySelectorAll('.item').forEach(item=>{item.onclick=()=>openChat(item.dataset.id)})}
async function contactProfile(id){const c=A.contacts.find(x=>String(x.id)===String(id));if(!c)return;const nameKey='linka_contact_name_'+String(c.id);const displayName=localStorage.getItem(nameKey)||c.name;const key='linka_contact_note_'+String(c.id);const note=localStorage.getItem(key)||'';modal(`<div class="contactProfile"><div class="profileHero">${av(c,true)}<span class="profileOnlineDot"></span></div><h2>${esc(displayName)}</h2><p class="muted">@${esc(c.username)}</p><p class="profileStatus">${esc(c.status||'Disponível')}</p><div class="profileInfoGrid"><div><small>Usuário</small><b>@${esc(c.username)}</b></div><div><small>Contato</small><b>${esc(c.phone||'Adicionado ao Linka')}</b></div></div><label class="profileNoteLabel">Seu recado sobre esta pessoa<textarea id="contactNote" maxlength="500" placeholder="Ex.: amigo da escola, aniversário...">${esc(note)}</textarea></label><button class="primary" id="saveContactName">Editar nome</button><button class="primary" id="saveContactNote">Salvar recado</button><div class="profileActions"><button class="menurow" id="openChatP">Abrir conversa</button><button class="menurow" id="callProfileP">Ligar</button><button class="menurow" id="videoProfileP">Chamada de vídeo</button><button class="menurow" id="blockP">Bloquear contato</button><button class="danger" id="deleteContactP">Apagar contato</button><button class="danger" data-close>Fechar</button></div></div>`);$('#saveContactName').onclick=()=>{const n=prompt('Nome deste contato',displayName);if(n&&n.trim()){localStorage.setItem(nameKey,n.trim());$('#modal').innerHTML='';contactProfile(c.id);renderList();toast('Nome atualizado')}};$('#saveContactNote').onclick=()=>{localStorage.setItem(key,$('#contactNote').value.trim());toast('Recado salvo no perfil');};$('#openChatP').onclick=()=>{$('#modal').innerHTML='';openChat(c.id)};$('#callProfileP').onclick=async()=>{$('#modal').innerHTML='';await openChat(c.id);startOutgoingCall(c)};$('#videoProfileP').onclick=async()=>{$('#modal').innerHTML='';await openChat(c.id);startOutgoingVideoCall(c)};$('#blockP').onclick=async()=>{try{await api('/api/blocked/'+c.id,{method:'POST'});await loadContacts();$('#modal').innerHTML='';renderList();toast('Contato bloqueado')}catch(e){toast(e.message)}};$('#deleteContactP').onclick=async()=>{if(!confirm('Apagar este contato?'))return;try{await api('/api/contacts/'+c.id,{method:'DELETE'});await loadContacts();$('#modal').innerHTML='';renderList();toast('Contato apagado')}catch(e){toast(e.message)}}}
function statusViewer(list,index){
  if(!Array.isArray(list)||!list.length)return;
  let current=Math.max(0,Math.min(index,list.length-1));
  const root=$('#modal');
  function draw(){
    const x=list[current]; if(!x){return}
    const isMine=String(x.user.id)===String(A.user.id);
    if(!isMine&&!x.viewedByMe){x.viewedByMe=true;api('/api/statuses/'+x.user.id+'/'+encodeURIComponent(x.statusId)+'/view',{method:'POST'}).catch(()=>{}); }
    const statusSrc=x.mediaUrl?(x.mediaUrl+'?token='+encodeURIComponent(A.token)):x.media; const media=x.mediaType?.startsWith('video/')?`<video id="statusVideo" class="statusFullMedia" autoplay playsinline src="${esc(statusSrc||'')}"></video>`:statusSrc?`<img class="statusFullMedia" src="${esc(statusSrc)}" alt="Status de ${esc(x.user.name)}">`:`<div class="statusTextOnly">${esc(x.text||'')}</div>`;
    const progress=list.map((_,i)=>`<span class="statusProgressPart ${i<current?'done':i===current?'current':''}"><i></i></span>`).join('');
    const liked=!!x.likedByMe;
    root.innerHTML=`<div class="statusScreen"><div class="statusTop"><button class="statusBack" id="statusBack" aria-label="Voltar">‹</button><div class="statusIdentity">${av(x.user)}<div><b>${esc(x.user.name)}</b><small>${formatStatusTime(x.createdAt)}</small></div></div><button class="statusMore" id="statusMore" aria-label="Mais opções">⋮</button></div><div class="statusProgress">${progress}</div><div class="statusStage"><button class="statusTapZone statusPrev" id="statusPrev" aria-label="Status anterior"></button>${media}<button class="statusTapZone statusNext" id="statusNext" aria-label="Próximo status"></button>${x.text?`<div class="statusCaptionOverlay">${esc(x.text)}</div>`:''}</div><div class="statusBottom"><button class="statusReply" id="statusReply"><span>Responder</span></button><button class="statusHeart ${liked?'liked':''}" id="statusHeart" aria-label="${liked?'Descurtir':'Curtir'}"><svg viewBox="0 0 24 24"><path d="M20.8 8.9c0 5.1-8.8 10-8.8 10s-8.8-4.9-8.8-10A4.7 4.7 0 0 1 8 4.2c1.5 0 2.8.7 4 2 1.2-1.3 2.5-2 4-2a4.7 4.7 0 0 1 4.8 4.7Z"/></svg></button></div></div>`;
    $('#statusBack').onclick=()=>{root.innerHTML='';loadStatuses().then(()=>{if($('#chats')?.classList.contains('active'))renderList();})};
    $('#statusViewCount')?.addEventListener('click',async()=>{try{const d=await api('/api/statuses/'+x.user.id+'/'+encodeURIComponent(x.statusId)+'/views');modal(`<div class="statusViewsSheet"><h2>Visualizações</h2><p class="muted">${d.count} pessoa(s) viu seu status.</p><div class="statusViewsList">${d.viewers.length?d.viewers.map(v=>`<div class="statusViewerRow">${av(v)}<span><b>${esc(v.name)}</b><small>@${esc(v.username)}</small></span></div>`).join(''):'<p class="muted">Ainda ninguém viu seu status.</p>'}</div><button class="danger" data-close>Fechar</button></div>`)}catch(e){toast(e.message)}});
    $('#statusPrev').onclick=()=>{if(current>0){current--;draw()}};
    $('#statusNext').onclick=()=>{if(current<list.length-1){current++;draw()}else root.innerHTML=''};
    $('#statusReply').onclick=()=>{root.innerHTML='';openChat(x.user.id);setTimeout(()=>{const input=$('#msg');if(input){const prefix=x.text?`Respondendo ao status: “${x.text.slice(0,140)}”`:'Respondendo ao seu status';input.value=prefix;input.focus();input.setSelectionRange(input.value.length,input.value.length)}},120)};
    $('#statusHeart').onclick=async()=>{if(isMine)return;try{const r=await api('/api/statuses/'+x.user.id+'/'+encodeURIComponent(x.statusId)+'/like',{method:'POST'});x.likedByMe=r.liked;x.likeCount=r.likeCount;draw()}catch(e){toast(e.message)}};
    $('#statusMore').onclick=()=>{if(!isMine)return;modal(`<div class="statusDeleteSheet"><div class="statusDeleteTitle">Meu status</div><button class="menurow" id="statusViewsNow">Visualizações</button><button class="menurow statusDeleteAction" id="deleteStatusNow">Apagar status</button><button class="menurow" data-close>Cancelar</button></div>`);$('#statusViewsNow').onclick=async()=>{try{const d=await api('/api/statuses/'+x.user.id+'/'+encodeURIComponent(x.statusId)+'/views');modal('<div class="statusViewsSheet"><h2>Visualizações</h2><p class="muted">'+d.count+' pessoa(s) viu seu status.</p><div class="statusViewsList">'+(d.viewers.length?d.viewers.map(v=>'<div class="statusViewerRow">'+av(v)+'<span><b>'+esc(v.name)+'</b><small>@'+esc(v.username)+'</small></span></div>').join(''):'<p class="muted">Ainda ninguém viu seu status.</p>')+'</div><button class="danger" data-close>Fechar</button></div>')}catch(e){toast(e.message)}};$('#deleteStatusNow').onclick=async()=>{try{await api('/api/statuses/'+encodeURIComponent(x.statusId),{method:'DELETE'});$('#modal').innerHTML='';await statusView();toast('Status apagado')}catch(e){toast(e.message)}}};
    const progressBar=$('.statusProgressPart.current i');
    const advanceStatus=()=>{if(current<list.length-1){current++;draw()}else{root.innerHTML=''}};
    // Segurar o status pausa tudo e esconde a interface, como no WhatsApp.
    // Ao soltar, o status continua exatamente de onde parou.
    let holdTimer=null, holding=false;
    const stage=$('.statusStage');
    const pauseStatus=()=>{
      if(holding)return;
      holding=true;
      if(stage) stage.closest('.statusScreen')?.classList.add('holding');
      if(progressBar) progressBar.style.animationPlayState='paused';
      const video=$('#statusVideo');
      if(video) video.pause();
    };
    const resumeStatus=()=>{
      clearTimeout(holdTimer);
      if(!holding)return;
      holding=false;
      if(stage) stage.closest('.statusScreen')?.classList.remove('holding');
      if(progressBar) progressBar.style.animationPlayState='running';
      const video=$('#statusVideo');
      if(video) video.play().catch(()=>{});
    };
    let swipeStartY=0, swipeStartX=0;
    if(stage){
      stage.addEventListener('pointerdown',(ev)=>{swipeStartY=ev.clientY;swipeStartX=ev.clientX;
        clearTimeout(holdTimer);
        holdTimer=setTimeout(pauseStatus,180);
      },{passive:true});
      stage.addEventListener('pointerup',(ev)=>{const dy=ev.clientY-swipeStartY,dx=ev.clientX-swipeStartX;clearTimeout(holdTimer);if(isMine&&dy<-70&&Math.abs(dy)>Math.abs(dx)){resumeStatus();$('#statusViewCount')?.click();return}resumeStatus()},{passive:true});
      stage.addEventListener('pointercancel',resumeStatus,{passive:true});
      stage.addEventListener('pointerleave',()=>{if(holding)resumeStatus()},{passive:true});
    }
    if(progressBar) progressBar.onanimationend=advanceStatus;
    const v=$('#statusVideo');
    if(v){
      v.onloadedmetadata=()=>{
        if(Number.isFinite(v.duration)&&v.duration>0&&progressBar){
          progressBar.style.animationDuration=v.duration+'s';
        }
      };
      v.play().catch(()=>{});
      v.onended=advanceStatus;
    }
  }
  function formatStatusTime(ts){try{const d=new Date(Number(ts));const now=new Date();const same=d.toDateString()===now.toDateString();return same?'Hoje '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString('pt-BR')+' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}catch{return ''}}
  draw();
}
async function statusView(){
  setTab($('#statusTab')); const list=$('#list');
  if(!list)return;
  list.innerHTML='<div class="statusHeader"><b>Status</b><button class="smallbtn" id="newStatus">＋ Meu status</button></div><div class="empty">Carregando status...</div>';
  try{A.statuses=await api('/api/statuses');}catch(e){A.statuses=[];list.innerHTML='<div class="empty">Não foi possível carregar os status.</div>';return}
  const me=A.statuses.filter(x=>String(x.user.id)===String(A.user.id));
  const othersRaw=A.statuses.filter(x=>String(x.user.id)!==String(A.user.id));
  const groups=[]; const byUser=new Map();
  othersRaw.forEach(x=>{const key=String(x.user.id);if(!byUser.has(key)){const g={user:x.user,items:[]};byUser.set(key,g);groups.push(g)}byUser.get(key).items.push(x)});
  list.innerHTML=`<div class="statusHeader"><b>Status</b><button class="smallbtn" id="newStatus">＋ Meu status</button></div>${me.length?`<button class="statusItem" id="myStatus">${av(me[0].user)}<span><b>Meu status</b><small>${me.length} status ${me.length===1?'publicado':'publicados'}${me[0].viewCount!=null?` · ${me.reduce((n,x)=>n+(x.viewCount||0),0)} visualizações`:''}</small></span></button>`:'<div class="empty">Você ainda não publicou um status.</div>'}<div class="statusSection">ATUALIZAÇÕES DOS CONTATOS</div>${groups.length?groups.map(g=>{const first=g.items[0];const allSeen=g.items.every(x=>x.viewedByMe);const idx=A.statuses.indexOf(first);return `<button class="statusItem ${allSeen?'statusSeen':''}" data-status-index="${idx}">${av(g.user)}<span><b>${esc(g.user.name)}</b><small>${g.items.length} ${g.items.length===1?'status':'status'}</small></span><em class="statusCount">${g.items.length}</em></button>`}).join(''):'<div class="empty">Nenhum contato publicou status nas últimas 24 horas.</div>'}`;
  $('#newStatus').onclick=()=>statusEditor();
  $('#myStatus')?.addEventListener('click',()=>statusViewer(me,0));
  document.querySelectorAll('[data-status-index]').forEach(b=>b.onclick=()=>statusViewer(A.statuses,Number(b.dataset.statusIndex)));
}

function statusEditor(){
  modal(`<h2>Meu status</h2><p class="muted">Cada publicação fica disponível por 24 horas. Você pode publicar vários status seguidos.</p><label class="statusCaptionLabel">Legenda<textarea id="statusText" maxlength="500" placeholder="Adicione uma legenda..."></textarea></label><label class="mediaLabel">Adicionar foto ou vídeo<input id="statusMedia" type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar" hidden></label><div id="statusPreview" class="statusPreview"></div><button class="primary" id="saveStatus">Publicar status</button><button class="danger" data-close>Cancelar</button>`);
  const fileInput=$('#statusMedia'),preview=$('#statusPreview'); let mediaData='',mediaType='';
  function showPreview(){if(!mediaData){preview.innerHTML='';return}preview.innerHTML=mediaType.startsWith('video/')?`<video controls playsinline src="${mediaData}"></video>`:`<img src="${mediaData}" alt="Prévia do status">`}
  fileInput.onchange=()=>{const f=fileInput.files?.[0];if(!f)return;if(f.size>8*1024*1024){toast('A foto ou vídeo deve ter no máximo 8 MB.');fileInput.value='';return}const r=new FileReader();r.onload=()=>{mediaData=String(r.result||'');mediaType=f.type||'';showPreview()};r.readAsDataURL(f)};
  $('#saveStatus').onclick=async()=>{const btn=$('#saveStatus');try{const text=$('#statusText').value.trim();if(!text&&!mediaData){toast('Adicione um texto, foto ou vídeo.');return}btn.disabled=true;btn.textContent='Publicando…';await api('/api/statuses',{method:'POST',body:{text,media:mediaData,mediaType}});$('#modal').innerHTML='';A.statuses=[];statusView();toast('Status publicado')}catch(e){btn.disabled=false;btn.textContent='Publicar status';toast(e.message)}};
}

function statusViewer(list,index){
  if(!Array.isArray(list)||!list.length)return;
  let current=Math.max(0,Math.min(index,list.length-1));
  const root=$('#modal');
  function draw(){
    const x=list[current]; if(!x){return}
    const isMine=String(x.user.id)===String(A.user.id);
    if(!isMine&&!x.viewedByMe){x.viewedByMe=true;api('/api/statuses/'+x.user.id+'/'+encodeURIComponent(x.statusId)+'/view',{method:'POST'}).catch(()=>{}); }
    const statusSrc=x.mediaUrl?(x.mediaUrl+'?token='+encodeURIComponent(A.token)):x.media; const media=x.mediaType?.startsWith('video/')?`<video id="statusVideo" class="statusFullMedia" autoplay playsinline src="${esc(statusSrc||'')}"></video>`:statusSrc?`<img class="statusFullMedia" src="${esc(statusSrc)}" alt="Status de ${esc(x.user.name)}">`:`<div class="statusTextOnly">${esc(x.text||'')}</div>`;
    const progress=list.map((_,i)=>`<span class="statusProgressPart ${i<current?'done':i===current?'current':''}"><i></i></span>`).join('');
    const liked=!!x.likedByMe;
    root.innerHTML=`<div class="statusScreen"><div class="statusTop"><button class="statusBack" id="statusBack" aria-label="Voltar">‹</button><div class="statusIdentity">${av(x.user)}<div><b>${esc(x.user.name)}</b><small>${formatStatusTime(x.createdAt)}</small></div></div><button class="statusMore" id="statusMore" aria-label="Mais opções">⋮</button></div><div class="statusProgress">${progress}</div><div class="statusStage"><button class="statusTapZone statusPrev" id="statusPrev" aria-label="Status anterior"></button>${media}<button class="statusTapZone statusNext" id="statusNext" aria-label="Próximo status"></button>${x.text?`<div class="statusCaptionOverlay">${esc(x.text)}</div>`:''}</div><div class="statusBottom"><button class="statusReply" id="statusReply"><span>Responder</span></button><button class="statusHeart ${liked?'liked':''}" id="statusHeart" aria-label="${liked?'Descurtir':'Curtir'}"><svg viewBox="0 0 24 24"><path d="M20.8 8.9c0 5.1-8.8 10-8.8 10s-8.8-4.9-8.8-10A4.7 4.7 0 0 1 8 4.2c1.5 0 2.8.7 4 2 1.2-1.3 2.5-2 4-2a4.7 4.7 0 0 1 4.8 4.7Z"/></svg></button></div></div>`;
    $('#statusBack').onclick=()=>{root.innerHTML='';loadStatuses().then(()=>{if($('#chats')?.classList.contains('active'))renderList();})};
    $('#statusViewCount')?.addEventListener('click',async()=>{try{const d=await api('/api/statuses/'+x.user.id+'/'+encodeURIComponent(x.statusId)+'/views');modal(`<div class="statusViewsSheet"><h2>Visualizações</h2><p class="muted">${d.count} pessoa(s) viu seu status.</p><div class="statusViewsList">${d.viewers.length?d.viewers.map(v=>`<div class="statusViewerRow">${av(v)}<span><b>${esc(v.name)}</b><small>@${esc(v.username)}</small></span></div>`).join(''):'<p class="muted">Ainda ninguém viu seu status.</p>'}</div><button class="danger" data-close>Fechar</button></div>`)}catch(e){toast(e.message)}});
    $('#statusPrev').onclick=()=>{if(current>0){current--;draw()}};
    $('#statusNext').onclick=()=>{if(current<list.length-1){current++;draw()}else root.innerHTML=''};
    $('#statusReply').onclick=()=>{root.innerHTML='';openChat(x.user.id);setTimeout(()=>{const input=$('#msg');if(input){const prefix=x.text?`Respondendo ao status: “${x.text.slice(0,140)}”`:'Respondendo ao seu status';input.value=prefix;input.focus();input.setSelectionRange(input.value.length,input.value.length)}},120)};
    $('#statusHeart').onclick=async()=>{if(isMine)return;try{const r=await api('/api/statuses/'+x.user.id+'/'+encodeURIComponent(x.statusId)+'/like',{method:'POST'});x.likedByMe=r.liked;x.likeCount=r.likeCount;draw()}catch(e){toast(e.message)}};
    $('#statusMore').onclick=()=>{if(!isMine)return;modal(`<div class="statusDeleteSheet"><div class="statusDeleteTitle">Meu status</div><button class="menurow" id="statusViewsNow">Visualizações</button><button class="menurow statusDeleteAction" id="deleteStatusNow">Apagar status</button><button class="menurow" data-close>Cancelar</button></div>`);$('#statusViewsNow').onclick=async()=>{try{const d=await api('/api/statuses/'+x.user.id+'/'+encodeURIComponent(x.statusId)+'/views');modal('<div class="statusViewsSheet"><h2>Visualizações</h2><p class="muted">'+d.count+' pessoa(s) viu seu status.</p><div class="statusViewsList">'+(d.viewers.length?d.viewers.map(v=>'<div class="statusViewerRow">'+av(v)+'<span><b>'+esc(v.name)+'</b><small>@'+esc(v.username)+'</small></span></div>').join(''):'<p class="muted">Ainda ninguém viu seu status.</p>')+'</div><button class="danger" data-close>Fechar</button></div>')}catch(e){toast(e.message)}};$('#deleteStatusNow').onclick=async()=>{try{await api('/api/statuses/'+encodeURIComponent(x.statusId),{method:'DELETE'});$('#modal').innerHTML='';await statusView();toast('Status apagado')}catch(e){toast(e.message)}}};
    const progressBar=$('.statusProgressPart.current i');
    const advanceStatus=()=>{if(current<list.length-1){current++;draw()}else{root.innerHTML=''}};
    // Segurar o status pausa tudo e esconde a interface, como no WhatsApp.
    // Ao soltar, o status continua exatamente de onde parou.
    let holdTimer=null, holding=false;
    const stage=$('.statusStage');
    const pauseStatus=()=>{
      if(holding)return;
      holding=true;
      if(stage) stage.closest('.statusScreen')?.classList.add('holding');
      if(progressBar) progressBar.style.animationPlayState='paused';
      const video=$('#statusVideo');
      if(video) video.pause();
    };
    const resumeStatus=()=>{
      clearTimeout(holdTimer);
      if(!holding)return;
      holding=false;
      if(stage) stage.closest('.statusScreen')?.classList.remove('holding');
      if(progressBar) progressBar.style.animationPlayState='running';
      const video=$('#statusVideo');
      if(video) video.play().catch(()=>{});
    };
    let swipeStartY=0, swipeStartX=0;
    if(stage){
      stage.addEventListener('pointerdown',(ev)=>{swipeStartY=ev.clientY;swipeStartX=ev.clientX;
        clearTimeout(holdTimer);
        holdTimer=setTimeout(pauseStatus,180);
      },{passive:true});
      stage.addEventListener('pointerup',(ev)=>{const dy=ev.clientY-swipeStartY,dx=ev.clientX-swipeStartX;clearTimeout(holdTimer);if(isMine&&dy<-70&&Math.abs(dy)>Math.abs(dx)){resumeStatus();$('#statusViewCount')?.click();return}resumeStatus()},{passive:true});
      stage.addEventListener('pointercancel',resumeStatus,{passive:true});
      stage.addEventListener('pointerleave',()=>{if(holding)resumeStatus()},{passive:true});
    }
    if(progressBar) progressBar.onanimationend=advanceStatus;
    const v=$('#statusVideo');
    if(v){
      v.onloadedmetadata=()=>{
        if(Number.isFinite(v.duration)&&v.duration>0&&progressBar){
          progressBar.style.animationDuration=v.duration+'s';
        }
      };
      v.play().catch(()=>{});
      v.onended=advanceStatus;
    }
  }
  function formatStatusTime(ts){try{const d=new Date(Number(ts));const now=new Date();const same=d.toDateString()===now.toDateString();return same?'Hoje '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString('pt-BR')+' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}catch{return ''}}
  draw();
}
function appSettings(){try{return JSON.parse(localStorage.getItem('linka_settings')||'{}')}catch{return {}}}
function saveAppSettings(x){localStorage.setItem('linka_settings',JSON.stringify(x));applyAppSettings()}
function applyAppSettings(){const s=appSettings();document.body.classList.toggle('light-theme',s.theme==='light');document.body.classList.toggle('dark-theme',s.theme!=='light');document.documentElement.style.setProperty('--linka-font-size',(s.fontSize||16)+'px')}
function generalSettingsModal(){const s=appSettings();modal(`<h2>Personalização</h2><label>Tema<select id="themeSet"><option value="dark" ${s.theme!=='light'?'selected':''}>Escuro</option><option value="light" ${s.theme==='light'?'selected':''}>Claro</option></select></label><label>Tamanho da fonte<select id="fontSet"><option value="14">Pequena</option><option value="16">Normal</option><option value="18">Grande</option><option value="20">Muito grande</option></select></label><label><input type="checkbox" id="soundSet" ${s.sounds!==false?'checked':''}> Sons de mensagens</label><label><input type="checkbox" id="vibSet" ${s.vibration!==false?'checked':''}> Vibração</label><p class="muted">Os sons personalizados podem ser escolhidos abaixo.</p><label>Som personalizado<input id="customSound" type="file" accept="audio/*"></label><button class="primary" id="savePersonal">Salvar</button><button class="danger" data-close>Cancelar</button>`);$('#fontSet').value=String(s.fontSize||16);$('#savePersonal').onclick=()=>{const next={...s,theme:$('#themeSet').value,fontSize:Number($('#fontSet').value),sounds:$('#soundSet').checked,vibration:$('#vibSet').checked};const f=$('#customSound').files?.[0];if(f){const r=new FileReader();r.onload=()=>{next.customSound=r.result;saveAppSettings(next);$('#modal').innerHTML='';toast('Personalização salva')};r.readAsDataURL(f)}else{saveAppSettings(next);$('#modal').innerHTML='';toast('Personalização salva')}}}
async function settingsModal(){let blocked=[];try{blocked=await api('/api/blocked')}catch{}modal(`<h2>Configurações</h2><button class="menurow" id="setProfile">Perfil e privacidade</button><button class="menurow" id="setNotif">Notificações</button><button class="menurow" id="setBg">Fundo das conversas</button><button class="menurow" id="setPersonal">Tema, fonte, sons e vibração</button><button class="menurow" id="setBlocked">Contatos bloqueados ${blocked.length?`(${blocked.length})`:''}</button><button class="menurow" id="setStorage">Armazenamento</button><button class="menurow" id="setAbout">Sobre o Linka</button><button class="danger" data-close>Fechar</button>`);$('#setProfile').onclick=profileModal;$('#setNotif').onclick=notificationsModal;$('#setBg').onclick=backgroundModal;$('#setPersonal').onclick=generalSettingsModal;$('#setBlocked').onclick=()=>blockedModal(blocked);$('#setStorage').onclick=storageModal;$('#setAbout').onclick=()=>modal(`<h2>Sobre o Linka</h2><p class="muted">Mensagens, chamadas e status em um só lugar.</p><p class="muted">Versão 2.2</p><button class="danger" data-close>Fechar</button>`)}
function blockedModal(blocked){modal(`<h2>Contatos bloqueados</h2>${blocked.length?blocked.map(x=>`<div class="result">${av(x)}<div><b>${esc(x.name)}</b><span>@${esc(x.username)}</span></div><button data-unblock="${esc(x.id)}">Desbloquear</button></div>`).join(''):'<p class="muted">Nenhum contato bloqueado.</p>'}<button class="danger" data-close>Fechar</button>`);document.querySelectorAll('[data-unblock]').forEach(b=>b.onclick=async()=>{try{await api('/api/blocked/'+b.dataset.unblock,{method:'DELETE'});await loadContacts();settingsModal();toast('Contato desbloqueado')}catch(e){toast(e.message)}})}
function setTab(active){document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));if(active)active.classList.add('active')}
function formatCallTime(ts){const d=new Date(ts||Date.now()),today=new Date();const same=d.toDateString()===today.toDateString();return same?d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
function formatCallDuration(sec){sec=Math.max(0,Number(sec)||0);if(sec<60)return sec+'s';const m=Math.floor(sec/60),s=sec%60;return m+'min'+(s?` ${String(s).padStart(2,'0')}s`:'')}
async function callsView(){setTab($('#callsTab'));const list=$('#list');if(!list)return;list.innerHTML='<div class="empty">Carregando ligações...</div>';try{A.calls=await api('/api/calls');}catch(e){A.calls=[];toast('Não foi possível carregar as ligações.')}if(!A.calls.length){list.innerHTML='<div class="empty">Nenhuma ligação ainda.</div>';return;}list.innerHTML=A.calls.map(c=>{const o=c.other||{};const mine=String(c.from)===String(A.user.id);const missed=['rejected','busy'].includes(c.status)&&!mine;const label=missed?'Chamada perdida':mine?'Chamada efetuada':'Chamada recebida';const arrow=missed?'missed':mine?'outgoing':'incoming';const duration=c.duration?` · ${formatCallDuration(c.duration)}`:'';return `<button class="callHistoryItem" type="button" data-id="${esc(o.id||'')}">${av(o)}<div class="callHistoryInfo"><b>${esc(o.name||'Contato')}</b><span class="callMeta ${arrow}"><span class="callArrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 19 19 5M19 5H9M19 5v10"/></svg></span>${label} · ${formatCallTime(c.endedAt||c.startedAt)}${duration}</span></div><span class="callHistoryBtn" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6.6 10.8c1.5 2.9 3.7 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.2 1 .0 2 .5 3 .5.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C11.5 21 3 12.5 3 2.5c0-.6.4-1-1-1H7c.6 0 1 .4 1 1 0 1 .2 2 .5 3 .1.4 0 .8-.2 1.1l-1.7 1.7z"/></svg></span></button>`}).join('');list.querySelectorAll('.callHistoryItem').forEach(item=>item.onclick=()=>{const id=item.dataset.id;if(id)openChat(String(id))});}

function draftKey(id){return 'linka_draft_'+String(A.user?.id||'me')+'_'+String(id)}
function tempKey(id){return 'linka_temp_'+String(A.user?.id||'me')+'_'+String(id)}
function getTempSetting(id){try{return Number(localStorage.getItem(tempKey(id))||0)}catch{return 0}}
function saveDraft(id,text){try{const k=draftKey(id);if(text)localStorage.setItem(k,text);else localStorage.removeItem(k)}catch{}}
function loadDraft(id){try{return localStorage.getItem(draftKey(id))||''}catch{return ''}}
function setTempSetting(id,v){try{localStorage.setItem(tempKey(id),String(v||0))}catch{}}
function queueOfflineMessage(contactId,text,replyTo=null){try{const q=JSON.parse(localStorage.getItem('linka_offline_queue')||'[]');q.push({id:'q_'+Date.now()+'_'+Math.random().toString(36).slice(2),contactId:String(contactId),text,replyTo,createdAt:Date.now()});localStorage.setItem('linka_offline_queue',JSON.stringify(q));return true}catch{return false}}
function offlineQueue(){try{return JSON.parse(localStorage.getItem('linka_offline_queue')||'[]')}catch{return []}}
async function flushOfflineQueue(){if(!navigator.onLine)return;const q=offlineQueue();if(!q.length)return;const keep=[];for(const item of q){try{await api('/api/messages/'+encodeURIComponent(item.contactId),{method:'POST',body:{text:item.text,replyTo:item.replyTo,expiresIn:getTempSetting(item.contactId)}})}catch{keep.push(item)}}try{localStorage.setItem('linka_offline_queue',JSON.stringify(keep))}catch{}if(!keep.length&&A.active)drawMessages()}
function showOfflineOnce(){if(!A.active)return;const k='linka_offline_notice_'+String(A.active.id);try{if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,'1')}catch{};toast('Aguardando conexão')}
function qrProfileModal(){const code=String(A.user?.username||A.user?.id||'');const link=location.origin+'/?user='+encodeURIComponent(code);modal(`<h2>QR Code do meu perfil</h2><div class="qrBox"><img id="profileQr" alt="QR Code do perfil" src="https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(link)}"><p class="muted">Escaneie para abrir o perfil do Linka.</p></div><button class="primary" id="shareQr">Compartilhar QR Code</button><button class="danger" data-close>Fechar</button>`);$('#shareQr').onclick=async()=>{try{if(navigator.share)await navigator.share({title:'Meu perfil no Linka',text:'Meu perfil no Linka: '+link});else{await navigator.clipboard?.writeText(link);toast('Link do perfil copiado')}}catch{}}}
async function storageModal(){let d={messages:0,mediaCount:0,mediaBytes:0,audioCount:0,audioBytes:0,fileCount:0,fileBytes:0,totalBytes:0};try{d=await api('/api/storage')}catch(e){toast(e.message||'Não foi possível carregar o armazenamento');return}const mb=(Number(d.totalBytes||0)/1048576).toFixed(2);modal(`<h2>Armazenamento</h2><div class="storageTotal"><b>${mb} MB</b><span>usados pelo Linka</span></div><div class="storageRows"><div><b>Fotos e vídeos</b><span>${d.mediaCount||0} · ${(Number(d.mediaBytes||0)/1048576).toFixed(2)} MB</span></div><div><b>Áudios</b><span>${d.audioCount||0} · ${(Number(d.audioBytes||0)/1048576).toFixed(2)} MB</span></div><div><b>Documentos</b><span>${d.fileCount||0} · ${(Number(d.fileBytes||0)/1048576).toFixed(2)} MB</span></div></div><button class="danger" data-close>Fechar</button>`)}
function tempMessagesModal(){if(!A.active)return;const cur=getTempSetting(A.active.id);modal(`<h2>Mensagens temporárias</h2><p class="muted">Escolha por quanto tempo novas mensagens desta conversa ficam disponíveis.</p><select id="tempChoice"><option value="0">Desativadas</option><option value="86400000">24 horas</option><option value="604800000">7 dias</option><option value="7776000000">90 dias</option></select><button class="primary" id="saveTemp">Salvar</button><button class="danger" data-close>Cancelar</button>`);$('#tempChoice').value=String(cur);$('#saveTemp').onclick=()=>{setTempSetting(A.active.id,Number($('#tempChoice').value));$('#modal').innerHTML='';toast(Number($('#tempChoice').value)?'Mensagens temporárias ativadas':'Mensagens temporárias desativadas')}}
async function openChat(id){const contact=A.contacts.find(x=>String(x.id)===String(id));if(!contact){toast('Contato não encontrado');return;}A.active=contact;A.messages=[];A.remoteTyping=false;document.body.classList.add('chat-open');$('#main').className='main mobile';$('#main').innerHTML=`<header class="head"><button class="icon back" id="back" type="button">‹</button>${av(contact)}<button class="headProfile" id="headProfile" type="button"><div class="headInfo"><b>${esc(contact.name)}</b><span id="chatPresence">${esc(presenceText(contact))}</span></div></button><button class="callBtn" id="call" type="button" aria-label="Ligar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8c1.5 2.9 3.7 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.2 1 .3 2 .5 3 .5.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C11.5 21 3 12.5 3 2.5c0-.6.4-1 1-1H7c.6 0 1 .4 1 1 0 1 .2 2 .5 3 .1.4 0 .8-.2 1.1l-1.7 1.7z"/></svg></button><button class="callBtn videoBtn" id="videoCall" type="button" aria-label="Chamada de vídeo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h7A2.5 2.5 0 0 1 16 6.5v1.2l3.1-1.8A1.3 1.3 0 0 1 21 7v10a1.3 1.3 0 0 1-1.9 1.1L16 16.3v1.2a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 4 17.5v-11Z"/></svg></button><button class="chatMore" id="chatMore" type="button" aria-label="Mais opções">⋮</button></header><div class="messages" id="msgs"><div class="empty">Carregando conversa...</div></div><form class="composer" id="composer"><label class="attach" aria-label="Enviar foto ou vídeo">＋<input id="mediaMsg" type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar" hidden></label><button class="stickerBtn" id="stickerBtn" type="button" aria-label="Stickers" hidden>😊</button><button class="voice" id="voice" type="button" aria-label="Segure para gravar áudio"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="3" width="8" height="12" rx="4"></rect><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"></path></svg></button><input id="msg" placeholder="Digite uma mensagem…" autocomplete="off"><button class="send" type="submit" aria-label="Enviar mensagem">➤</button></form><div id="stickerPanel" class="stickerPanel" hidden>${['😀','😂','😍','🥰','😎','😭','😡','😮','🥳','🤩','😴','🤔','🙄','😇','🤯','👋','👍','❤️','🔥','💯','🎉','💔','✨','😂‍🔥'].map(x=>`<button type="button" data-sticker="${x}">${x}</button>`).join('')}</div>`;const callBtn=$('#call');if(callBtn)callBtn.onclick=()=>startOutgoingCall(contact);const videoBtn=$('#videoCall');if(videoBtn)videoBtn.onclick=()=>startOutgoingVideoCall(contact);const chatMore=$('#chatMore');if(chatMore)chatMore.onclick=()=>{if(A.selectedMessageIds.size>1)selectedMessagesMenu();else if(A.selectedMessageIds.size===1){const sm=A.messages.find(x=>String(x.id)===String(A.selectedMessageId));if(sm)messageMenu(sm);else{clearSelectedMessage();chatMenu()}}else chatMenu()};$('#headProfile')?.addEventListener('click',()=>contactProfile(contact.id));const back=$('#back');if(back)back.onclick=()=>{if(A.call.peer&&String(A.call.peer)===String(contact.id))endCall(true);stopRecording(false);sendTyping(false);document.body.classList.remove('chat-open');$('#main').className='main';A.active=null;A.remoteTyping=false;$('#main').innerHTML='<div class="welcome"><div class="mark">L</div><h1>Linka</h1><p>Selecione um contato para começar.</p></div>';renderList()};const form=$('#composer');const input=$('#msg');const mediaInput=$('#mediaMsg');if(input){input.value=loadDraft(contact.id)}const stickerBtn=$('#stickerBtn');const stickerPanel=$('#stickerPanel');
if(input&&stickerBtn){
 input.addEventListener('focus',()=>{stickerBtn.hidden=false});
 stickerBtn.onclick=()=>{if(stickerPanel)stickerPanel.hidden=!stickerPanel.hidden};
 document.querySelectorAll('[data-sticker]').forEach(b=>{b.onclick=async()=>{const sticker=b.dataset.sticker;if(!sticker)return;try{const m=await api('/api/messages/'+contact.id,{method:'POST',body:{type:'sticker',sticker}});if(A.active&&String(A.active.id)===String(contact.id)){A.messages.push(m);A.previews[String(contact.id)]=m;drawMessages();renderList();playSound('send')}}catch(e){toast(e.message||'Não foi possível enviar o sticker')}}});
 document.addEventListener('click',e=>{if(stickerPanel&&!stickerPanel.hidden&&!stickerPanel.contains(e.target)&&e.target!==stickerBtn)stickerPanel.hidden=true},{passive:true});
}
if(input){let lastTypingSent=0;input.addEventListener('input',()=>{if(!A.active)return;saveDraft(contact.id,input.value);if(!A.active)return;const now=Date.now();if(now-lastTypingSent>250){sendTyping(true);lastTypingSent=now}clearTimeout(A.typingTimer);A.typingTimer=setTimeout(()=>sendTyping(false),1400)});input.addEventListener('blur',()=>sendTyping(false))}if(mediaInput)mediaInput.onchange=async()=>{const files=Array.from(mediaInput.files||[]);if(!files.length)return;const albumId=files.length>1?'alb_'+Date.now().toString(36):null;try{for(const f of files){if(!/^image\/|^video\//.test(f.type)&&!/[.]pdf$|[.]docx?$|[.]xlsx?$|[.]txt$|[.]zip$|[.]rar$/i.test(f.name)){toast('Escolha uma foto, vídeo ou documento.');continue}if(f.size>9*1024*1024){toast('Arquivo muito grande: '+f.name);continue}if(!/^image\/|^video\//.test(f.type)){const r=await fetch('/api/messages/'+contact.id+'/file',{method:'POST',headers:{Authorization:'Bearer '+A.token,'Content-Type':'application/octet-stream','X-File-Type':f.type||'application/octet-stream','X-File-Name':encodeURIComponent(f.name),'X-Album-Id':albumId||'','X-Expires-In':String(getTempSetting(contact.id)||0)},body:f});if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error||'Não foi possível enviar o arquivo.');const m=await r.json();if(A.active&&String(A.active.id)===String(contact.id))A.messages.push(m);continue}const m=await uploadChatMedia(contact.id,f,albumId);if(A.active&&String(A.active.id)===String(contact.id))A.messages.push(m)}if(A.active&&String(A.active.id)===String(contact.id)){A.previews[String(contact.id)]=A.messages.at(-1);if(!A.chatIds.includes(String(contact.id)))A.chatIds.push(String(contact.id));drawMessages();renderList();playSound('send');if(albumId)toast('Álbum enviado')}}catch(e){toast(e.message||'Não foi possível enviar a mídia.')}finally{mediaInput.value=''}};if(form)form.onsubmit=async e=>{e.preventDefault();sendTyping(false);const input=$('#msg'),text=input.value.trim();if(!text)return;const editing=A.editingMessage;if(editing){try{const updated=await api(`/api/messages/${contact.id}/${editing.id}`,{method:'PATCH',body:{text,replyTo:A.replyingMessage?{id:A.replyingMessage.id,text:A.replyingMessage.text||A.replyingMessage.fileName||'Mensagem'}:null}});const i=A.messages.findIndex(x=>String(x.id)===String(editing.id));if(i>=0)A.messages[i]=updated;A.editingMessage=null;A.replyingMessage=null;input.value='';exitEditMode();drawMessages()}catch(e){toast(e.message)}return}const replyTo=A.replyingMessage?{id:A.replyingMessage.id,text:A.replyingMessage.text||A.replyingMessage.fileName||'Mensagem'}:null;const expiresIn=getTempSetting(contact.id);input.value='';saveDraft(contact.id,'');try{if(!navigator.onLine)throw new Error('OFFLINE');const m=await api('/api/messages/'+contact.id,{method:'POST',body:{text,replyTo,expiresIn}});if(A.active&&String(A.active.id)===String(contact.id)){A.messages.push(m);A.previews[String(contact.id)]=m;if(!A.chatIds.includes(String(contact.id)))A.chatIds.push(String(contact.id));drawMessages();renderList();playSound('send')}}catch(e){input.value=text;saveDraft(contact.id,text);if(e.message==='OFFLINE'||!navigator.onLine){queueOfflineMessage(contact.id,text,replyTo);showOfflineOnce();}else toast(e.message)}};setupRecorder(contact);applyChatTheme(contact.id);try{A.messages=await api('/api/messages/'+contact.id);drawMessages();try{await api('/api/messages/'+contact.id+'/read',{method:'POST'});}catch{}}catch(e){A.messages=[];drawMessages();toast('Não foi possível carregar a conversa agora. Você ainda pode tentar enviar uma mensagem.')}}
let recorder=null,recordChunks=[],recordTimer=null,recordSeconds=0,recordContact=null,recordStartAt=0;
let soundCtx=null;
function playSound(kind='send'){
  const ps=appSettings();if(ps.sounds===false)return;try{if(ps.customSound&&(kind==='receive'||kind==='callEnd')){const a=new Audio(ps.customSound);a.volume=.55;a.play().catch(()=>{});if(ps.vibration!==false&&navigator.vibrate)navigator.vibrate(kind==='callEnd'?[80,50,80]:60);return}if(ps.vibration!==false&&navigator.vibrate&&(kind==='receive'||kind==='callEnd'))navigator.vibrate(kind==='callEnd'?[80,50,80]:40);
    soundCtx ||= new (window.AudioContext||window.webkitAudioContext)();
    if(soundCtx.state==='suspended')soundCtx.resume();
    const now=soundCtx.currentTime;
    const presets={
      send:[760,0.16], receive:[540,0.20], cancel:[220,0.16], delivered:[620,0.14], record:[430,0.18], read:[880,0.12], callEnd:[420,0.20]
    };
    const [freq,vol]=presets[kind]||presets.send;
    if(kind==='callEnd'){
      const tones=[[520,0],[390,0.12]];
      tones.forEach(([f,offset])=>{
        const o=soundCtx.createOscillator(),g=soundCtx.createGain();
        o.type='sine';o.frequency.setValueAtTime(f,now+offset);
        g.gain.setValueAtTime(0.0001,now+offset);
        g.gain.exponentialRampToValueAtTime(vol,now+offset+0.012);
        g.gain.exponentialRampToValueAtTime(0.0001,now+offset+0.105);
        o.connect(g).connect(soundCtx.destination);o.start(now+offset);o.stop(now+offset+0.12);
      });
      return;
    }
    const o=soundCtx.createOscillator(),g=soundCtx.createGain();
    o.type='sine';
    o.frequency.setValueAtTime(freq,now);
    o.frequency.exponentialRampToValueAtTime(freq*1.12,now+0.08);
    g.gain.setValueAtTime(0.0001,now);
    g.gain.exponentialRampToValueAtTime(vol,now+0.018);
    g.gain.exponentialRampToValueAtTime(0.0001,now+0.20);
    o.connect(g).connect(soundCtx.destination);o.start(now);o.stop(now+0.21);
    if(kind==='send'||kind==='receive'||kind==='read'){
      const o2=soundCtx.createOscillator(),g2=soundCtx.createGain();
      o2.type='sine';o2.frequency.setValueAtTime(freq*1.28,now+0.075);
      g2.gain.setValueAtTime(0.0001,now+0.075);g2.gain.exponentialRampToValueAtTime(vol*0.62,now+0.095);g2.gain.exponentialRampToValueAtTime(0.0001,now+0.18);
      o2.connect(g2).connect(soundCtx.destination);o2.start(now+0.075);o2.stop(now+0.19);
    }
  }catch{}
}
function setupRecorder(contact){
  const b=$('#voice'); if(!b)return;
  let downX=0,moved=false,activeHold=false,holdTimer=null,pointerId=null,recordingStarted=false,session=null;
  const clearHold=()=>{if(holdTimer){clearTimeout(holdTimer);holdTimer=null;}};
  const begin=e=>{
    if(e.pointerType==='mouse'&&e.button!==0)return;
    e.preventDefault(); clearHold();
    session={active:true}; activeHold=true; recordingStarted=false; moved=false; downX=e.clientX; pointerId=e.pointerId;
    try{b.setPointerCapture?.(e.pointerId)}catch{}
    const input=$('#msg');if(input)input.placeholder='Segure para gravar…';
    holdTimer=setTimeout(async()=>{
      holdTimer=null;
      if(!session?.active||!activeHold||moved)return;
      recordingStarted=true; playSound('record');
      const ok=await startRecording(contact,session);
      if(!ok){recordingStarted=false;activeHold=false;session.active=false;resetVoice();}
    },320);
  };
  const move=e=>{
    if(!activeHold||!session)return;
    e.preventDefault();
    const dx=e.clientX-downX;
    if(dx<=-45){
      moved=true; session.cancelRequested=true; clearHold(); b.classList.add('canceling');
      const input=$('#msg');if(input)input.placeholder='Solte para cancelar';
      if(recordingStarted)cancelRecording();
    }else if(dx<0){
      const input=$('#msg');if(input)input.placeholder='Deslize para cancelar';
    }else if(recordingStarted){
      const input=$('#msg');if(input)input.placeholder='Solte para enviar';
    }
  };
  const end=e=>{
    if(!activeHold||!session)return;
    e.preventDefault(); activeHold=false; session.active=false; clearHold();
    try{if(pointerId!=null)b.releasePointerCapture?.(pointerId)}catch{} pointerId=null;
    if(!recordingStarted){moved=false;b.classList.remove('canceling');resetVoice();session=null;return;}
    if(moved||session.cancelRequested){cancelRecording();playSound('cancel');}
    else{stopRecording(true);}
    moved=false;b.classList.remove('canceling');session=null;
  };
  b.addEventListener('pointerdown',begin,{passive:false});
  b.addEventListener('pointermove',move,{passive:false});
  b.addEventListener('pointerup',end,{passive:false});
  b.addEventListener('pointercancel',e=>{if(!activeHold)return;e.preventDefault();activeHold=false;if(session)session.active=false;clearHold();if(recordingStarted){cancelRecording();playSound('cancel')}recordingStarted=false;moved=false;b.classList.remove('canceling');session=null;resetVoice()},{passive:false});
  b.addEventListener('click',e=>e.preventDefault());
}
function cancelRecording(){
  if(!recorder){resetVoice();return;}
  try{recorder.__cancelled=true;if(recorder.state==='recording'||recorder.state==='paused')recorder.stop();else resetVoice()}catch{resetVoice()}
}
async function startRecording(contact,sessionToken){
  if(recorder||!sessionToken?.active)return false;
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){toast('Seu navegador não suporta gravação de áudio');return false}
  let stream=null;
  try{
    stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    if(!sessionToken.active||sessionToken.cancelRequested){stream.getTracks().forEach(t=>t.stop());return false}
    const types=['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4'];
    const mime=types.find(x=>MediaRecorder.isTypeSupported(x))||'';
    const r=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
    recorder=r;recordChunks=[];recordSeconds=0;recordContact=contact;r.__cancelled=false;sessionToken.recorder=r;
    const startedAt=Date.now();
    r.ondataavailable=e=>{if(e.data&&e.data.size)recordChunks.push(e.data)};
    r.onerror=()=>{try{stream.getTracks().forEach(t=>t.stop())}catch{};recordChunks=[];recorder=null;resetVoice();toast('Não foi possível gravar o áudio.')};
    r.onstop=async()=>{
      const canceled=!!r.__cancelled||!!sessionToken.cancelRequested;
      try{stream.getTracks().forEach(t=>t.stop())}catch{}
      clearInterval(recordTimer);recordTimer=null;if(recorder===r)recorder=null;
      const elapsed=Math.max(1,Math.round((Date.now()-startedAt)/1000));
      const duration=Math.max(1,Math.min(90,Math.max(recordSeconds,elapsed)));
      if(canceled){recordChunks=[];resetVoice();return}
      const blob=new Blob(recordChunks,{type:r.mimeType||mime||'audio/webm'});recordChunks=[];
      if(!blob.size){toast('Áudio vazio. Segure o microfone por mais tempo.');resetVoice();return}
      if(blob.size>8*1024*1024){toast('Áudio muito grande. Grave por menos tempo.');resetVoice();return}
      const reader=new FileReader();
      reader.onload=async()=>{try{const data=String(reader.result||'');if(!/^data:audio\//i.test(data)){toast('Áudio inválido. Tente gravar novamente.');return}const m=await api('/api/messages/'+contact.id,{method:'POST',body:{type:'audio',audio:data,duration}});if(A.active&&String(A.active.id)===String(contact.id)){A.messages.push(m);if(!A.chatIds.includes(String(contact.id)))A.chatIds.push(String(contact.id));drawMessages();playSound('send')}}catch(e){toast(e.message||'Não foi possível enviar o áudio.')}finally{resetVoice()}};
      reader.onerror=()=>{toast('Não foi possível preparar o áudio.');resetVoice()};reader.readAsDataURL(blob);
    };
    r.start(250);recordTimer=setInterval(()=>{recordSeconds=Math.max(1,Math.round((Date.now()-startedAt)/1000));const btn=$('#voice');if(btn)btn.textContent=formatRecordTime(recordSeconds);const input=$('#msg');if(input)input.placeholder='Gravando áudio… '+formatRecordTime(recordSeconds);if(recordSeconds>=90)stopRecording(true)},250);
    const btn=$('#voice');if(btn){btn.classList.add('recording');btn.textContent='0:00'}const input=$('#msg');if(input)input.placeholder='Gravando áudio… 0:00';
    return true;
  }catch(e){if(stream)try{stream.getTracks().forEach(t=>t.stop())}catch{};recorder=null;toast('Não foi possível acessar o microfone');resetVoice();return false}
}
function stopRecording(send=true){if(!recorder)return;try{if(recorder.state==='recording'||recorder.state==='paused'){recorder.__cancelled=!send;recorder.stop()}else resetVoice()}catch{resetVoice()}}
function resetVoice(){const b=$('#voice');if(b){b.classList.remove('recording','canceling');b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="3" width="8" height="12" rx="4"></rect><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"></path></svg>';b.setAttribute('aria-label','Segure para gravar áudio')}clearTimeout(window.__linkaHoldTimer);recorder=null;clearInterval(recordTimer);recordTimer=null;recordSeconds=0;recordStartAt=0;const input=$('#msg');if(input)input.placeholder='Digite uma mensagem…'}

function formatRecordTime(s){const m=Math.floor(s/60),sec=String(s%60).padStart(2,'0');return `${m}:${sec}`}
function reactionSummary(m){const r=m.reactions||{};return Object.entries(r).filter(([,u])=>Array.isArray(u)&&u.length).map(([e,u])=>`<button class="reactionChip" data-react="${esc(e)}" data-mid="${esc(m.id)}" data-album="${esc(m.albumId||'')}">${e} ${u.length}</button>`).join('')}
function bubble(m){
  if(Array.isArray(m.deletedForMe)&&m.deletedForMe.some(x=>String(x)===String(A.user.id))) return '';
  const time=new Date(m.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),mine=String(m.from)===String(A.user.id);
  const tick=mine?`<span class="msgTicks ${m.status==='read'?'blue':''}">${m.status==='sent'?'✓':'✓✓'}</span>`:'';
  const menu='';
  const reply=m.replyTo?`<div class="replyPreview"><b>Respondendo</b><span>${esc(String(m.replyTo.text||'Mensagem').slice(0,90))}</span></div>`:'';
  const pinned=m.pinned?'<span class="pinnedMark" title="Mensagem fixada">📌</span>':'';
  if(m.deletedForEveryone)return `<div class="bubble ${mine?'mine':''} deleted" data-mid="${esc(m.id)}" data-album="${esc(m.albumId||'')}"><span>Esta mensagem foi apagada</span><time>${time}${tick}</time>${menu}</div>`;
  let body='';
  if(m.type==='call'){const icon=m.mode==='video'?'▣':'☎';body=`<div class="callMsgIcon">${icon}</div><div><b>${m.status==='missed'?'Chamada perdida':mine?'Chamada efetuada':'Chamada recebida'}</b><small>${esc(m.mode==='video'?'Vídeo':'Áudio')}${Number(m.duration)>0?' · '+formatCallDuration(Number(m.duration)):''}</small></div>`}
  else if(m.type==='sticker'&&m.sticker)body=`<div class="stickerBubble" aria-label="Sticker">${esc(m.sticker)}</div>`;
  else if(m.type==='audio'&&m.audio)body=`<div class="audioBubble"><audio class="audioEl" preload="metadata" src="${esc(m.audio)}"></audio><button class="audioPlay" type="button" data-audio-play="${esc(m.id)}" aria-label="Reproduzir áudio">▶</button><div class="audioInfo"><div class="audioTrack"><span class="audioProgress"></span></div><div class="audioTimes"><span class="audioCurrent">0:00</span><span class="audioDuration">${Number(m.duration)>0?formatRecordTime(Number(m.duration)):'0:00'}</span></div></div></div>`;
  else if(m.type==='file')body=`<button class="fileCard" type="button" data-file="${esc(m.id)}"><span class="fileIcon">📎</span><span><b>${esc(m.fileName||'Arquivo')}</b><small>${esc(m.fileType||'Arquivo')} · ${Math.max(1,Math.round((Number(m.fileSize)||0)/1024))} KB</small></span></button>`;
  else if(m.type==='media'&&(m.mediaUrl||m.media)){const src=(m.mediaUrl&&A.token)?m.mediaUrl+'?token='+encodeURIComponent(A.token):(m.mediaUrl||m.media);body=String(m.mediaType||'').startsWith('video/')?`<video class="chatMedia" controls playsinline preload="metadata" src="${esc(src)}"></video>`:`<img class="chatMedia" src="${esc(src)}" alt="Foto enviada" loading="eager">`}
  else body=`<span>${esc(m.text||'')}${m.editedAt?' <small>(editada)</small>':''}</span>`;
  return `<div class="bubble ${mine?'mine':''} ${m.type==='call'?'callMessage':''}" data-mid="${esc(m.id)}" data-album="${esc(m.albumId||'')}">${pinned}${reply}${body}<time>${time}${tick}</time>${reactionSummary(m)}${menu}</div>`;
}
function startEditMessage(m){A.editingMessage=m;const input=$('#msg');if(!input)return;input.value=m.text||'';input.focus();const form=$('#composer');form?.classList.add('editing');let bar=$('#editBar');if(!bar&&form){bar=document.createElement('div');bar.id='editBar';bar.className='editBar';bar.innerHTML='<span><b>Editar mensagem</b><small>Toque no X para cancelar</small></span><button type=\"button\" id=\"cancelEdit\" aria-label=\"Cancelar edição\">×</button>';form.parentElement?.insertBefore(bar,form);$('#cancelEdit').onclick=()=>{A.editingMessage=null;input.value='';exitEditMode()}}if(bar)bar.hidden=false}function exitEditMode(){const form=$('#composer');if(!form)return;form.classList.remove('editing');const bar=$('#editBar');if(bar)bar.hidden=true;const input=$('#msg');if(input)input.placeholder='Digite uma mensagem…'}
function clearSelectedMessage(){A.selectedMessageId=null;A.selectedMessageIds.clear();document.querySelectorAll('.bubble.selected-message').forEach(x=>x.classList.remove('selected-message'));updateSelectionBar()}
function selectMessage(m,card){const id=String(m.id);if(A.selectedMessageIds.size===0){A.selectedMessageId=id;A.selectedMessageIds.add(id)}else{A.selectedMessageIds.has(id)?A.selectedMessageIds.delete(id):A.selectedMessageIds.add(id);A.selectedMessageId=A.selectedMessageIds.size?Array.from(A.selectedMessageIds)[0]:null}document.querySelectorAll('.bubble.selected-message').forEach(x=>x.classList.remove('selected-message'));A.selectedMessageIds.forEach(mid=>document.querySelector(`.bubble[data-mid=\"${CSS.escape(mid)}\"]`)?.classList.add('selected-message'));updateSelectionBar()}
function updateSelectionBar(){const head=document.querySelector('.head');if(!head)return;let bar=document.getElementById('selectionBar');if(A.selectedMessageIds.size){if(!bar){bar=document.createElement('div');bar.id='selectionBar';bar.className='selectionBar';head.appendChild(bar)}bar.innerHTML=`<b>${A.selectedMessageIds.size} selecionada${A.selectedMessageIds.size>1?'s':''}</b><button type=\"button\" id=\"deleteSelected\">Apagar</button><button type=\"button\" id=\"cancelSelected\">Cancelar</button>`;bar.querySelector('#deleteSelected').onclick=deleteSelectedMessages;bar.querySelector('#cancelSelected').onclick=clearSelectedMessage}else bar?.remove()}
async function deleteSelectedMessages(){if(!A.active||!A.selectedMessageIds.size)return;if(!confirm(`Apagar ${A.selectedMessageIds.size} mensagem${A.selectedMessageIds.size>1?'s':''}?`))return;const ids=Array.from(A.selectedMessageIds);try{for(const id of ids){await api(`/api/messages/${A.active.id}/${id}`,{method:'DELETE',body:{mode:'me'}})}A.messages=A.messages.filter(m=>!ids.includes(String(m.id)));clearSelectedMessage();drawMessages();toast('Mensagens apagadas')}catch(e){toast(e.message)}}
function selectedMessagesMenu(){
 const ids=Array.from(A.selectedMessageIds).map(String);
 const selected=A.messages.filter(m=>ids.includes(String(m.id)));
 if(!selected.length){clearSelectedMessage();return;}
 const allMine=selected.every(m=>String(m.from)===String(A.user.id));
 const count=selected.length;
 const opts=[`<button data-multi-delete="me">Apagar para mim</button>`];
 if(allMine) opts.unshift(`<button data-multi-delete="everyone">Apagar para todos</button>`);
 modal(`<div class="messageActions"><h3>${count} mensagem${count>1?'s':''} selecionada${count>1?'s':''}</h3>${opts.join('')}<button class="danger" data-close>Cancelar</button></div>`);
 document.querySelectorAll('[data-multi-delete]').forEach(b=>b.onclick=async()=>{
   const mode=b.dataset.multiDelete;
   const chosen=Array.from(A.selectedMessageIds).map(String);
   try{
     for(const id of chosen){
       const updated=await api(`/api/messages/${A.active.id}/${id}`,{method:'DELETE',body:{mode}});
       if(mode==='me') A.messages=A.messages.filter(x=>String(x.id)!==id);
       else {const i=A.messages.findIndex(x=>String(x.id)===id);if(i>=0)A.messages[i]=updated;}
     }
     $('#modal').innerHTML='';clearSelectedMessage();drawMessages();toast(mode==='everyone'?'Mensagens apagadas para todos':'Mensagens apagadas para você');
   }catch(e){toast(e.message)}
 });
}
function messageMenu(m){
 const mine=String(m.from)===String(A.user.id),opts=[];
 if(mine&&m.type==='text'&&!m.deletedForEveryone)opts.push(`<button data-msg-edit="${esc(m.id)}">Editar mensagem</button>`);
 opts.push(`<button data-reply-msg="${esc(m.id)}">Responder</button>`);
 opts.push(`<button data-react-msg="${esc(m.id)}">Reagir</button>`);
 opts.push(`<button data-pin-msg="${esc(m.id)}">${m.pinned?'Desafixar mensagem':'Fixar mensagem'}</button>`);
 opts.push(`<button data-forward-msg="${esc(m.id)}">Encaminhar</button>`);
 if(mine&&!m.deletedForEveryone)opts.push(`<button data-msg-delete="${esc(m.id)}" data-mode="everyone">Apagar para todos</button>`);
 opts.push(`<button data-msg-delete="${esc(m.id)}" data-mode="me">Apagar para mim</button>`);
 modal(`<div class="messageActions"><h3>Opções da mensagem</h3>${opts.join('')}<button class="danger" data-close>Cancelar</button></div>`);
 document.querySelectorAll('[data-msg-edit]').forEach(b=>b.onclick=()=>{const x=A.messages.find(x=>String(x.id)===String(b.dataset.msgEdit));if(x){clearSelectedMessage();$('#modal').innerHTML='';startEditMessage(x)}});
 document.querySelectorAll('[data-reply-msg]').forEach(b=>b.onclick=()=>{const x=A.messages.find(x=>String(x.id)===String(b.dataset.replyMsg));if(x){clearSelectedMessage();A.replyingMessage=x;$('#modal').innerHTML='';const input=$('#msg');if(input){input.focus();input.placeholder='Respondendo a: '+String(x.text||x.fileName||'Mensagem').slice(0,45)}}});
 document.querySelectorAll('[data-react-msg]').forEach(b=>b.onclick=()=>{const x=A.messages.find(x=>String(x.id)===String(b.dataset.reactMsg));if(!x)return;modal(`<div class="reactionPicker"><h3>Reagir à mensagem</h3><div>${['❤️','😂','👍','😮','😢'].map(e=>`<button data-emoji="${e}">${e}</button>`).join('')}</div></div>`);document.querySelectorAll('[data-emoji]').forEach(q=>q.onclick=async()=>{try{const u=await api(`/api/messages/${A.active.id}/${x.id}/react`,{method:'POST',body:{emoji:q.dataset.emoji}});const i=A.messages.findIndex(z=>z.id===x.id);if(i>=0)A.messages[i]=u;$('#modal').innerHTML='';clearSelectedMessage();drawMessages()}catch(e){toast(e.message)}})});
 document.querySelectorAll('[data-pin-msg]').forEach(b=>b.onclick=async()=>{try{const u=await api(`/api/messages/${A.active.id}/${m.id}/pin`,{method:'POST',body:{pinned:!m.pinned}});const i=A.messages.findIndex(x=>x.id===m.id);if(i>=0)A.messages[i]=u;$('#modal').innerHTML='';clearSelectedMessage();drawMessages();toast(u.pinned?'Mensagem fixada':'Mensagem desafixada')}catch(e){toast(e.message)}});
 document.querySelectorAll('[data-forward-msg]').forEach(b=>b.onclick=()=>{modal(`<div class="forwardSheet"><h3>Encaminhar para</h3>${A.contacts.filter(c=>String(c.id)!==String(A.active?.id)).map(c=>`<button class="menurow" data-forward-target="${esc(c.id)}">${av(c)}<span>${esc(c.name)}</span></button>`).join('')||'<p class="muted">Nenhum outro contato.</p>'}<button class="danger" data-close>Cancelar</button></div>`);document.querySelectorAll('[data-forward-target]').forEach(q=>q.onclick=async()=>{try{const u=await api(`/api/messages/${A.active.id}/${m.id}/forward`,{method:'POST',body:{targetId:q.dataset.forwardTarget}});$('#modal').innerHTML='';clearSelectedMessage();toast('Mensagem encaminhada')}catch(e){toast(e.message)}})});
 document.querySelectorAll('[data-msg-delete]').forEach(b=>b.onclick=async()=>{try{const updated=await api(`/api/messages/${A.active.id}/${m.id}`,{method:'DELETE',body:{mode:b.dataset.mode}});if(b.dataset.mode==='me')A.messages=A.messages.filter(x=>x.id!==m.id);else{const i=A.messages.findIndex(x=>x.id===m.id);if(i>=0)A.messages[i]=updated}$('#modal').innerHTML='';clearSelectedMessage();drawMessages()}catch(e){toast(e.message)}});
}
function drawMessages(){const box=$('#msgs');if(!box)return;box.innerHTML=A.messages.map(bubble).join('');box.scrollTop=box.scrollHeight;box.onclick=e=>{if(A.selectedMessageId&&!e.target.closest('.bubble'))clearSelectedMessage()};if(A.active)applyChatTheme(A.active.id);else applyChatBg();box.querySelectorAll('[data-file]').forEach(b=>b.onclick=async()=>{try{window.open('/api/file/'+encodeURIComponent(b.dataset.file)+'?token='+encodeURIComponent(A.token),'_blank')}catch{}});box.querySelectorAll('.bubble').forEach(card=>{let holdTimer=null;const start=e=>{if(e.target.closest('button,a,audio'))return;clearTimeout(holdTimer);if(A.selectedMessageIds.size){const m=A.messages.find(x=>String(x.id)===String(card.dataset.mid));if(m){selectMessage(m,card);return}}holdTimer=setTimeout(()=>{const m=A.messages.find(x=>String(x.id)===String(card.dataset.mid));if(m)selectMessage(m,card)},520)};const cancel=()=>{clearTimeout(holdTimer);holdTimer=null};card.addEventListener('pointerdown',start);card.addEventListener('pointerup',cancel);card.addEventListener('pointercancel',cancel);card.addEventListener('pointerleave',cancel);card.addEventListener('contextmenu',e=>{e.preventDefault();const m=A.messages.find(x=>String(x.id)===String(card.dataset.mid));if(m)selectMessage(m,card)});});box.querySelectorAll('.audioBubble').forEach(card=>{const audio=card.querySelector('.audioEl'),play=card.querySelector('.audioPlay'),progress=card.querySelector('.audioProgress'),cur=card.querySelector('.audioCurrent'),dur=card.querySelector('.audioDuration');const fmt=v=>{v=Math.max(0,Math.floor(v||0));return Math.floor(v/60)+':'+String(v%60).padStart(2,'0')};audio.onloadedmetadata=()=>{if(Number.isFinite(audio.duration)&&audio.duration>0)dur.textContent=fmt(audio.duration);};audio.ontimeupdate=()=>{cur.textContent=fmt(audio.currentTime);progress.style.width=audio.duration?((audio.currentTime/audio.duration)*100)+'%':'0%'};audio.onended=()=>{play.textContent='▶';progress.style.width='0%';cur.textContent='0:00'};play.onclick=()=>{document.querySelectorAll('.audioEl').forEach(a=>{if(a!==audio)a.pause()});if(audio.paused){audio.play().then(()=>play.textContent='❚❚').catch(()=>toast('Não foi possível reproduzir o áudio'))}else{audio.pause();play.textContent='▶'}}});box.querySelectorAll('.mediaBubble .chatMedia').forEach(media=>{media.addEventListener('click',e=>{if(media.tagName==='VIDEO' && e.target.closest('video') && e.offsetX>0){if(media.controls && e.detail===1){/* still open on tap; controls remain available in viewer */}}const src=media.currentSrc||media.src;if(!src)return;const mediaItems=A.messages.filter(x=>x.type==='media'&&(x.mediaUrl||x.media)).map(x=>({src:(x.mediaUrl&&A.token)?x.mediaUrl+'?token='+encodeURIComponent(A.token):(x.mediaUrl||x.media),isVideo:String(x.mediaType||'').startsWith('video/'),alt:'Mídia'}));const idx=mediaItems.findIndex(x=>x.src===src);openMediaViewer(src,media.tagName==='VIDEO',media.getAttribute('alt')||'Mídia',mediaItems,idx<0?0:idx);e.preventDefault();e.stopPropagation()})});}
function openMediaViewer(src,isVideo=false,alt='Mídia',items=null,index=0){let v=$('#mediaViewer');if(!v){v=document.createElement('div');v.id='mediaViewer';v.className='mediaViewer';v.innerHTML='<button class="mediaViewerClose" type="button" aria-label="Fechar">×</button><button class="mediaPrev" type="button" aria-label="Anterior">‹</button><div class="mediaViewerStage"></div><button class="mediaNext" type="button" aria-label="Próxima">›</button>';document.body.appendChild(v);v.addEventListener('click',e=>{if(e.target===v||e.target.classList.contains('mediaViewerStage'))closeMediaViewer();});v.querySelector('.mediaViewerClose').onclick=closeMediaViewer}const arr=items||[{src,isVideo,alt}];let pos=Math.max(0,Math.min(index,arr.length-1));const stage=v.querySelector('.mediaViewerStage');const render=()=>{const x=arr[pos];stage.innerHTML=x.isVideo?`<video class="mediaViewerVideo" controls autoplay playsinline src="${esc(x.src)}"></video>`:`<img class="mediaViewerImage" src="${esc(x.src)}" alt="${esc(x.alt||'Mídia')}">`;v.querySelector('.mediaPrev').hidden=arr.length<2;v.querySelector('.mediaNext').hidden=arr.length<2};v.querySelector('.mediaPrev').onclick=e=>{e.stopPropagation();pos=(pos-1+arr.length)%arr.length;render()};v.querySelector('.mediaNext').onclick=e=>{e.stopPropagation();pos=(pos+1)%arr.length;render()};let sx=0;stage.ontouchstart=e=>{sx=e.touches[0].clientX};stage.ontouchend=e=>{const dx=e.changedTouches[0].clientX-sx;if(Math.abs(dx)>50){pos=(pos+(dx<0?1:-1)+arr.length)%arr.length;render()}};render();v.hidden=false;document.body.classList.add('media-viewer-open')}
function closeMediaViewer(){const v=$('#mediaViewer');if(!v)return;v.hidden=true;v.querySelector('.mediaViewerStage').innerHTML='';document.body.classList.remove('media-viewer-open')}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMediaViewer()});

function refreshPresence(){if(A.active){const c=A.contacts.find(x=>String(x.id)===String(A.active.id));if(c){A.active=c;const el=$('#chatPresence');if(el)el.textContent=presenceText(c)}}}
function addContactModal(){modal(`<h2>Adicionar contato</h2><p class="muted">Procure pelo nome ou pelo usuário, ou escaneie o QR Code do perfil.</p><div class="addContactTools"><input id="findq" placeholder="Ex.: @gabriel"><button class="menurow" id="scanQr">Escanear QR Code</button></div><div id="results"></div><button class="danger" data-close>Fechar</button>`);$('#scanQr').onclick=scanContactQr;$('#findq').oninput=async e=>{const q=e.target.value.trim();if(q.length<2){$('#results').innerHTML='';return}try{const xs=await api('/api/users?q='+encodeURIComponent(q));$('#results').innerHTML=xs.length?xs.map(u=>`<div class="result">${av(u)}<div><b>${esc(u.name)}</b><span>@${esc(u.username)}</span></div><button data-add="${u.id}">${A.contacts.some(c=>String(c.id)===String(u.id))?'Adicionado':'Adicionar'}</button></div>`).join(''):'<p class="muted">Nenhum usuário encontrado.</p>';document.querySelectorAll('[data-add]').forEach(b=>b.onclick=async()=>{try{await api('/api/contacts/'+b.dataset.add,{method:'POST'});await loadContacts();$('#modal').innerHTML='';renderList();toast('Contato adicionado')}catch(e){toast(e.message)}})}catch(e){toast(e.message)}}}
function qrUserCode(raw){try{const u=new URL(raw,location.origin);return u.searchParams.get('user')||u.searchParams.get('username')||raw}catch{return String(raw||'').trim()}}
async function addScannedUser(username){const q=String(username||'').replace(/^@/,'').trim();if(!q)return;const xs=await api('/api/users?q='+encodeURIComponent(q));const u=xs.find(x=>String(x.username).toLowerCase()===q.toLowerCase());if(!u)throw Error('Perfil não encontrado.');if(String(u.id)===String(A.user.id))throw Error('Esse QR Code é do seu próprio perfil.');$('#qrScanResult').innerHTML=`<div class="result">${av(u)}<div><b>${esc(u.name)}</b><span>@${esc(u.username)}</span></div><button id="addScanned">Adicionar</button></div>`;$('#addScanned').onclick=async()=>{try{await api('/api/contacts/'+u.id,{method:'POST'});await loadContacts();$('#modal').innerHTML='';contactProfile(u.id);toast('Contato adicionado')}catch(e){toast(e.message)}}}
async function scanContactQr(){let stream=null;try{if(!navigator.mediaDevices?.getUserMedia)throw Error('A câmera não está disponível neste aplicativo.');modal(`<h2>Escanear QR Code</h2><div class="qrScanner"><video id="qrVideo" autoplay playsinline muted></video><div class="qrFrame"></div></div><p class="muted" id="qrScanHint">Aponte a câmera para o QR Code do perfil.</p><div id="qrScanResult"></div><button class="danger" id="stopQr">Cancelar</button>`);const video=$('#qrVideo');stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});video.srcObject=stream;await video.play();let stopped=false;const stop=()=>{stopped=true;stream?.getTracks().forEach(t=>t.stop())};$('#stopQr').onclick=()=>{stop();$('#modal').innerHTML=''};const scan=async()=>{if(stopped)return;try{let value='';if('BarcodeDetector' in window){const detector=new BarcodeDetector({formats:['qr_code']});const codes=await detector.detect(video);if(codes[0]?.rawValue)value=codes[0].rawValue}else if(window.jsQR){const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(video,0,0,canvas.width,canvas.height);const code=ctx.getImageData(0,0,canvas.width,canvas.height);const found=window.jsQR(code.data,code.width,code.height,{inversionAttempts:'dontInvert'});if(found?.data)value=found.data}if(value){stop();$('#qrScanHint').textContent='QR Code encontrado.';await addScannedUser(qrUserCode(value));return}}catch(e){if(!stopped)$('#qrScanHint').textContent=e.message||'Não foi possível ler o QR Code.'}setTimeout(scan,350)};scan()}catch(e){stream?.getTracks().forEach(t=>t.stop());toast(e.message)}}

async function uploadChatMedia(contactId,file,albumId=null){
  const headers={'Content-Type':'application/octet-stream','X-Media-Type':file.type||'application/octet-stream','X-Album-Id':albumId||'','X-Expires-In':String(getTempSetting(contactId)||0),...(A.token?{Authorization:'Bearer '+A.token}:{})};
  const r=await fetch('/api/messages/'+encodeURIComponent(contactId)+'/media',{method:'POST',headers,body:file});
  let d={};try{d=await r.json()}catch{}if(!r.ok)throw Error(d.error||'Não foi possível enviar a mídia.');return d;
}
async function prepareChatMedia(file){
  if(file.type.startsWith('video/')){
    const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Não foi possível ler o vídeo.'));r.readAsDataURL(file)});
    return {data:String(data||''),type:file.type};
  }
  const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Não foi possível ler a foto.'));r.readAsDataURL(file)});
  try{
    const img=await new Promise((resolve,reject)=>{const x=new Image();x.onload=()=>resolve(x);x.onerror=()=>reject(Error('Foto incompatível.'));x.src=data});
    const max=1600,scale=Math.min(1,max/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));
    const w=Math.max(1,Math.round((img.naturalWidth||img.width)*scale)),h=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));
    const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);
    return {data:c.toDataURL('image/jpeg',0.82),type:'image/jpeg'};
  }catch{return {data:String(data||''),type:file.type||'image/jpeg'}}
}
async function prepareProfilePhoto(file){if(!file)return '';if(!file.type.startsWith('image/'))throw Error('Escolha uma imagem válida.');const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Não foi possível ler a foto.'));r.readAsDataURL(file)});try{const img=await new Promise((resolve,reject)=>{const x=new Image();x.onload=()=>resolve(x);x.onerror=()=>reject(Error('Este formato de foto não é compatível com este navegador.'));x.src=data});const max=720;const scale=Math.min(1,max/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));const w=Math.max(1,Math.round((img.naturalWidth||img.width)*scale));const h=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);return c.toDataURL('image/jpeg',0.82)}catch{return data}}
function profileModal(){modal(`<h2>Meu perfil</h2><div class="center">${av(A.user,true)}</div><label>Foto <input id="photo" type="file" accept="image/jpeg,image/png,image/webp,image/*"></label><label>Nome<input id="name" value="${esc(A.user.name)}"></label><label>Sobre<input id="status" value="${esc(A.user.status||'Disponível')}"></label><button class="primary" id="save">Salvar</button><button class="menurow" id="myQr">QR Code do meu perfil</button><button class="danger" data-close>Cancelar</button>`);let selectedPhoto=A.user.photo||'';$('#photo').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{selectedPhoto=await prepareProfilePhoto(f);A.user.photo=selectedPhoto;$('.card .avatar.big')?.replaceWith(document.querySelector('.avatar.big')||$('.avatar.big'));}catch(err){toast(err.message)}};$('#myQr').onclick=qrProfileModal;$('#save').onclick=async()=>{try{A.user=(await api('/api/me',{method:'PUT',body:{name:$('#name').value,status:$('#status').value,photo:selectedPhoto}})).user;$('#modal').innerHTML='';render()}catch(e){toast(e.message)}}}
async function loadNotifications(){try{A.notifications=await api('/api/notifications')}catch{A.notifications=[]}}
function unreadCount(){return A.notifications.filter(n=>!n.read).length}
async function notificationsModal(){
  await loadNotifications();
  const escN=s=>esc(s);
  const rows=A.notifications.length?A.notifications.map(n=>`<button class="notifrow ${n.read?'':'unread'}" data-notif="${escN(n.id)}" data-chat="${escN(n.chatId||'')}"><span class="notificon">${n.kind==='contact'?'👤':'💬'}</span><span><b>${escN(n.title)}</b><small>${escN(n.body)}</small><em>${new Date(n.createdAt).toLocaleString('pt-BR')}</em></span></button>`).join(''):'<p class="muted">Nenhuma notificação.</p>';
  const permission=('Notification' in window)?Notification.permission:'unsupported';
  const activate=permission!=='granted'?'<button class="primary" id="activateNotif">Ativar notificações</button>':'';
  const status=window.__linkaNotificationsReady?'🟢 FCM conectado':'⚪ FCM não conectado';
  modal(`<h2>Notificações <span class="notifcount">${unreadCount()}</span></h2><p class="muted">${status}</p>${permission==='denied'?'<p class="muted">As notificações estão bloqueadas. Verifique as permissões do aplicativo.</p>':''}<div class="notiflist">${rows}</div>${activate}<button class="primary" id="testNotif">Testar notificação</button><button class="primary" id="diagNotif">Diagnóstico FCM</button><div id="fcmDiagBox"></div><button class="primary" id="readall">Marcar todas como lidas</button><button class="danger" data-close>Fechar</button>`);
  const act=$('#activateNotif');
  if(act)act.onclick=async()=>{await setupNotifications();notificationsModal()};
  const diag=$('#diagNotif');
  if(diag)diag.onclick=async()=>{diag.disabled=true;diag.textContent='Analisando…';try{const d=await collectFcmDiagnostics();const box=$('#fcmDiagBox');if(box)box.innerHTML=renderFcmDiagnostic(d)}catch(e){toast('Não foi possível concluir o diagnóstico')}finally{diag.disabled=false;diag.textContent='Diagnóstico FCM'}};
  const test=$('#testNotif');
  if(test)test.onclick=async()=>{
    test.disabled=true; test.textContent='Enviando…';
    try{await setupNotifications({noPrompt:true});const r=await api('/api/fcm/test',{method:'POST'});toast(r.ok?'Notificação enviada. Verifique o aparelho.':'Não foi possível enviar')}catch(e){toast(e.message||'FCM não está configurado')}finally{test.disabled=false;test.textContent='Testar notificação'}
  };
  document.querySelectorAll('[data-notif]').forEach(b=>b.onclick=async()=>{const id=b.dataset.notif;try{await api('/api/notifications/'+id+'/read',{method:'POST'})}catch{};const chat=b.dataset.chat;if(chat){$('#modal').innerHTML='';openChat(chat)}else notificationsModal()});
  $('#readall').onclick=async()=>{try{await api('/api/notifications/read-all',{method:'POST'})}catch{};notificationsModal()}
}
function updateNotifBell(){const b=$('#notifBell');if(!b)return;const n=unreadCount();b.innerHTML='🔔'+(n?`<span class="notifbadge">${n>99?'99+':n}</span>`:'');b.setAttribute('aria-label',n?`${n} notificações não lidas`:'Notificações')}
function menuModal(){modal(`<h2>Menu</h2><button class="menurow" id="newc">＋ Adicionar contato</button><button class="menurow" id="prof">Perfil</button><button class="menurow" id="notif">Notificações</button><button class="menurow" id="activateNotifMenu">Ativar notificações</button><button class="menurow" id="bg">Fundo das conversas</button><button class="menurow" id="settings">⚙ Configurações</button><button class="menurow" id="logout">Sair</button><button class="danger" data-close>Fechar</button>`);$('#newc').onclick=addContactModal;$('#prof').onclick=profileModal;$('#notif').onclick=notificationsModal;$('#activateNotifMenu').onclick=async()=>{await setupNotifications();};$('#bg').onclick=backgroundModal;$('#settings').onclick=settingsModal;$('#logout').onclick=async()=>{try{await api('/api/logout',{method:'POST'})}catch{}localStorage.removeItem('ac_token');sessionStorage.removeItem('ac_token');location.reload()}}
function backgroundModal(){modal(`<h2>Fundo das conversas</h2><p class="muted">Escolha o fundo que aparecerá nas mensagens.</p><div class="bggrid"><button class="bgpick" data-bg="">Padrão</button><button class="bgpick" data-bg="gradient">Escuro</button><button class="bgpick" data-bg="dots">Pontos</button></div><label>Ou escolha uma imagem<input id="bgfile" type="file" accept="image/*"></label><button class="primary" id="savebg">Salvar fundo</button><button class="danger" data-close>Cancelar</button>`);let chosen=A.user.chatBg||'';document.querySelectorAll('.bgpick').forEach(b=>b.onclick=()=>chosen=b.dataset.bg);$('#bgfile').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>chosen=r.result;r.readAsDataURL(f)};$('#savebg').onclick=async()=>{try{A.user=(await api('/api/me',{method:'PUT',body:{chatBg:chosen}})).user;$('#modal').innerHTML='';applyChatBg();toast('Fundo salvo')}catch(e){toast(e.message)}}}

function chatThemeKey(id){return 'linka_chat_theme_'+String(id)}
function getChatTheme(id){try{const x=JSON.parse(localStorage.getItem(chatThemeKey(id))||'{}');return x.bg||''}catch{return ''}}
function setChatTheme(id,x){try{localStorage.setItem(chatThemeKey(id),JSON.stringify(x))}catch{}}
function applyChatTheme(id){const box=$('#msgs');if(!box)return;let theme={};try{theme=JSON.parse(localStorage.getItem(chatThemeKey(id))||'{}')}catch{};box.style.setProperty('--chat-font-size',(theme.font||16)+'px');box.dataset.bubbleStyle=theme.style||'default';const light=document.body.classList.contains('light-theme');const bg=getChatTheme(id);const fallback=light?'linear-gradient(180deg,#e9edef,#f5f7f8)':'radial-gradient(circle at top,#14232a,#0b141a 60%)';box.style.background=bg&&bg.startsWith('data:')?`url(${bg}) center/cover fixed, ${fallback}`:bg==='gradient'?(light?'linear-gradient(135deg,#dfeeea,#f7fbfa)':'linear-gradient(135deg,#081b22,#162a31)'):bg==='dots'?(light?'radial-gradient(circle at 20px 20px,#17212622 2px,transparent 3px) 0 0/32px 32px,#eef2f3':'radial-gradient(circle at 20px 20px,#ffffff18 2px,transparent 3px) 0 0/32px 32px,#0b141a'):fallback}
function chatThemeModal(){if(!A.active)return;const id=A.active.id;const cur=(()=>{try{return JSON.parse(localStorage.getItem(chatThemeKey(id))||'{}')}catch{return {}}})();modal(`<h2>Estilo da conversa</h2><div class="bggrid"><button class="bgpick" data-chat-bg="">Padrão</button><button class="bgpick" data-chat-bg="gradient">Escuro</button><button class="bgpick" data-chat-bg="dots">Pontos</button></div><label>Cor dos balões<select id="bubbleStyle"><option value="default">Padrão</option><option value="blue">Azul</option><option value="purple">Roxo</option><option value="pink">Rosa</option></select></label><label>Tamanho da fonte<select id="chatFont"><option value="14">Pequeno</option><option value="16">Normal</option><option value="18">Grande</option><option value="20">Muito grande</option></select></label><label>Imagem de fundo<input id="chatWall" type="file" accept="image/*"></label><button class="primary" id="saveChatTheme">Salvar</button><button class="danger" data-close>Cancelar</button>`);$('#bubbleStyle').value=cur.style||'default';$('#chatFont').value=String(cur.font||16);let chosen=cur.bg||'';document.querySelectorAll('[data-chat-bg]').forEach(b=>b.onclick=()=>chosen=b.dataset.chatBg);$('#chatWall').onchange=e=>{const f=e.target.files?.[0];if(f){const r=new FileReader();r.onload=()=>chosen=r.result;r.readAsDataURL(f)}};$('#saveChatTheme').onclick=()=>{const x={bg:chosen,style:$('#bubbleStyle').value,font:Number($('#chatFont').value)};setChatTheme(id,x);$('#modal').innerHTML='';applyChatTheme(id);toast('Estilo da conversa salvo')}}
function chatMenu(){if(!A.active)return;const id=A.active.id;modal(`<h2>Opções da conversa</h2><button class="menurow" id="clearChat">Limpar conversa</button><button class="menurow" id="tempMsg">Mensagens temporárias</button><button class="menurow" id="chatTheme">Tema da conversa</button><button class="danger" data-close>Cancelar</button>`);$('#clearChat').onclick=async()=>{if(!confirm('Limpar todas as mensagens desta conversa?'))return;try{await api('/api/messages/'+id,{method:'DELETE'});A.messages=[];$('#modal').innerHTML='';drawMessages();toast('Conversa limpa')}catch(e){toast(e.message)}};$('#tempMsg').onclick=tempMessagesModal;$('#chatTheme').onclick=()=>chatThemeModal()}
function fcmDiagMessage(){
  const d=window.__linkaFcmDiagnostic||{};
  if(d.reason)return d.reason;
  if(d.firebaseSupported===false)return 'O Firebase Messaging informou que este ambiente não é compatível com FCM Web.';
  if(d.pushManager===false)return 'Este APK não expõe a Push API necessária para o FCM Web. As notificações Android podem estar ativadas, mas isso é diferente de Web Push.';
  if(d.tokenRegistered===false)return 'O ambiente foi carregado, mas nenhum token FCM foi registrado no servidor.';
  return 'Nenhum erro detalhado foi registrado ainda.';
}

async function collectFcmDiagnostics(){
  const d={
    time:new Date().toISOString(),
    notification:('Notification' in window)?Notification.permission:'unsupported',
    serviceWorker:'serviceWorker' in navigator,
    pushManager:!!(window.PushManager && navigator.serviceWorker),
    webToApk:!!window.WebToApk,
    userAgent:navigator.userAgent,
    firebaseLoaded:!!window.firebase,
    firebaseSupported:null,
    swState:null,
    serverRegistered:null,
    firebaseReady:null,
    tokenRegistered:!!window.__linkaFcmToken,
    reason:window.__linkaFcmLastError||''
  };
  try{
    if(window.firebase && firebase.messaging && typeof firebase.messaging.isSupported==='function') d.firebaseSupported=await firebase.messaging.isSupported();
  }catch(e){d.firebaseSupported=false;d.reason=d.reason||('firebase.messaging.isSupported: '+(e.message||e))}
  try{
    if('serviceWorker' in navigator){
      const r=await navigator.serviceWorker.getRegistration('/');
      d.swState=r?(r.active?.state||r.installing?.state||r.waiting?.state||'registered'):'not-registered';
    }
  }catch(e){d.swState='error';d.reason=d.reason||('service worker: '+(e.message||e))}
  try{
    const st=await api('/api/fcm/status');
    d.serverRegistered=!!st.registered;
    d.firebaseReady=!!st.firebase;
    d.tokenRegistered=d.tokenRegistered||!!st.registered;
  }catch(e){d.reason=d.reason||('servidor: '+(e.message||e))}
  if(!d.reason){
    if(d.notification!=='granted')d.reason='A permissão Android/Web de notificações não está como granted.';
    else if(!d.serviceWorker)d.reason='Service Worker não está disponível neste ambiente.';
    else if(d.firebaseLoaded!==true)d.reason='O Firebase JavaScript não foi carregado.';
    else if(d.firebaseSupported===false)d.reason='Firebase Messaging não é compatível com este WebView/ambiente.';
    else if(d.pushManager===false)d.reason='A Push API necessária para FCM Web não está disponível neste APK.';
    else if(d.serverRegistered===false)d.reason='O token não está registrado no servidor do Linka.';
  }
  window.__linkaFcmDiagnostic=d;
  return d;
}

function renderFcmDiagnostic(d){
  const val=x=>x===true?'SIM':x===false?'NÃO':(x??'—');
  return `<div class="muted" style="text-align:left;line-height:1.55;margin:8px 0"><b>Diagnóstico FCM</b><br>Notificações: ${esc(String(val(d.notification)))}<br>Service Worker: ${esc(String(val(d.serviceWorker)))}<br>Push API: ${esc(String(val(d.pushManager)))}<br>Firebase carregado: ${esc(String(val(d.firebaseLoaded)))}<br>Firebase compatível: ${esc(String(val(d.firebaseSupported)))}<br>Service Worker registrado: ${esc(String(val(d.swState)))}<br>Firebase no servidor: ${esc(String(val(d.firebaseReady)))}<br>Token no servidor: ${esc(String(val(d.serverRegistered)))}<br><br><b>Resultado:</b> ${esc(fcmDiagMessage())}</div>`;
}

async function setupNotifications(opts={}){
  if(!('Notification' in window)){window.__linkaFcmLastError='A API de notificações não existe neste ambiente.';if(!opts.silent)toast('Este dispositivo não suporta notificações');return false}
  try{
    let permission=Notification.permission;
    if(permission==='default' && !opts.noPrompt) permission=await Notification.requestPermission();
    if(permission!=='granted'){
      window.__linkaFcmLastError='Permissão de notificações: '+permission;
      if(permission==='denied'&&!opts.silent)toast('Ative as notificações nas configurações do aplicativo.');
      return false;
    }
    if(!('serviceWorker' in navigator))throw new Error('Service Worker não disponível no APK.');
    const cfg=await api('/api/firebase-config');
    if(!window.firebase)throw new Error('Firebase JavaScript não carregou.');
    if(!firebase.apps.length)firebase.initializeApp(cfg);
    if(firebase.messaging && typeof firebase.messaging.isSupported==='function'){
      const supported=await firebase.messaging.isSupported();
      if(!supported)throw new Error('Firebase Messaging não é compatível com este ambiente WebView.');
    }
    if(!window.PushManager || !navigator.serviceWorker)throw new Error('A Push API não está disponível neste APK.');
    const messaging=firebase.messaging();
    const reg=await navigator.serviceWorker.register('/firebase-messaging-sw.js',{scope:'/'});
    await navigator.serviceWorker.ready;
    const token=await messaging.getToken({vapidKey:cfg.vapidKey,serviceWorkerRegistration:reg});
    if(!token)throw new Error('Firebase não gerou um token FCM neste ambiente.');
    await api('/api/fcm/token',{method:'POST',body:{token}});
    window.__linkaFcmToken=token;
    window.__linkaFcmLastError='';
    if(!window.__linkaFcmBound){
      window.__linkaFcmBound=true;
      messaging.onMessage(payload=>{
        const n=payload.notification||{};const data=payload.data||{};
        const title=data.title||n.title||'Linka';const body=data.body||n.body||'Nova notificação';
        if(document.visibilityState==='visible')toast(title+': '+body);
        loadNotifications().then(updateNotifBell).catch(()=>{});
      });
      if(typeof messaging.onTokenRefresh==='function')messaging.onTokenRefresh(async()=>{try{const t=await messaging.getToken({vapidKey:cfg.vapidKey,serviceWorkerRegistration:reg});if(t&&t!==window.__linkaFcmToken){await api('/api/fcm/token',{method:'POST',body:{token:t}});window.__linkaFcmToken=t}}catch(e){window.__linkaFcmLastError='Atualização do token: '+(e.message||e);console.warn('FCM token refresh:',e)}});
    }
    window.__linkaNotificationsReady=true;
    await collectFcmDiagnostics();
    return true;
  }catch(e){
    window.__linkaNotificationsReady=false;
    window.__linkaFcmLastError=String(e?.message||e);
    console.error('FCM:',e);
    await collectFcmDiagnostics().catch(()=>{});
    if(!opts.silent)toast('FCM: '+window.__linkaFcmLastError);
    return false;
  }
}

async function initNotifications(){
  try{
    if(!('serviceWorker' in navigator)||!window.firebase||!('Notification' in window))return;
    if(Notification.permission==='granted') await setupNotifications({noPrompt:true,silent:true});
  }catch(e){console.warn('FCM:',e)}
}

function armNotificationActivation(){
  if(window.__linkaNotifActivationArmed || !('Notification' in window))return;
  window.__linkaNotifActivationArmed=true;
  const activate=()=>{
    if(window.__linkaNotifActivationDone)return;
    if(Notification.permission==='granted'){window.__linkaNotifActivationDone=true;setupNotifications({noPrompt:true,silent:true});return}
    if(Notification.permission==='default'){
      window.__linkaNotifActivationDone=true;
      setupNotifications({silent:true});
    }
  };
  document.addEventListener('pointerdown',activate,{once:true,passive:true});
  document.addEventListener('touchstart',activate,{once:true,passive:true});
}

function modal(html){$('#modal').innerHTML=`<div class="modal"><div class="card">${html}</div></div>`;document.querySelector('[data-close]')?.addEventListener('click',()=>$('#modal').innerHTML='')}
function sendSignal(to,payload){const ws=window.__linkaWs;if(!to||!ws||ws.readyState!==1)return false;try{ws.send(JSON.stringify({to,...payload}));return true}catch{return false}}
function sendSignalReliable(to,payload,attempts=10){if(!to)return Promise.resolve(false);let n=0;return new Promise(resolve=>{const trySend=()=>{n++;if(sendSignal(to,payload)){resolve(true);return}if(n>=attempts){resolve(false);return}setTimeout(trySend,250)};trySend()})}
function ensureCallUi(){
  if($('#callOverlay'))return;
  document.body.insertAdjacentHTML('beforeend',`<div id="callOverlay" class="callOverlay" hidden>
    <div class="callCard" id="callCard">
      <div id="videoStage" class="videoStage" hidden><video id="callRemoteVideo" class="callRemoteVideo" autoplay playsinline></video><img id="callRemoteFrame" class="callRemoteVideo callRemoteFrame" alt="Vídeo da chamada" hidden><video id="callLocalVideo" class="callLocalVideo" autoplay muted playsinline></video></div>
      <div id="callAvatar" class="callAvatar"></div>
      <h2 id="callName">Chamada</h2>
      <p id="callStatus">Chamada</p><div id="callDuration" class="callDuration" hidden>00:00</div>
      <div class="callActions">
        <button id="callDecline" class="callDecline" type="button" aria-label="Recusar ou cancelar chamada"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.8 3.8 6c-.7.7-.8 1.8-.2 2.6 2.1 2.9 5 5.8 7.9 7.9.8.6 1.9.5 2.6-.2l1.2-1.2-3-3-1.1 1.1c-1.2-.9-2.5-2.2-3.4-3.4l1.1-1.1-3-3z"/><path d="m4 4 16 16"/></svg></button>
        <button id="callAccept" class="callAccept" type="button" aria-label="Atender chamada"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5.1 5.6 6.5c-.7.7-.8 1.8-.2 2.6 2.2 3 5.1 5.9 8.1 8.1.8.6 1.9.5 2.6-.2l1.4-1.4-2.8-2.8-1.3 1.3c-1.1-.8-2.3-2-3.1-3.1l1.3-1.3L7 5.1Z"/><path d="M14.5 5.5c2.2.4 3.6 1.8 4 4"/><path d="M14.5 2.5c3.9.5 6.4 3 7 6.9"/></svg></button>
      </div>
      <div class="callControls" id="callControls"><button id="callMute" class="callMute" type="button" aria-label="Desligar microfone"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5a4 4 0 0 1 8 0v5a4 4 0 0 1-8 0V5Zm-3 5a7 7 0 0 0 14 0M12 17v4M9 21h6M4 4l16 16"/></svg></button><button id="callMore" class="callMore" type="button" aria-label="Mais opções" hidden>•••</button><button id="callEnd" class="callEnd" type="button" aria-label="Encerrar chamada" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 16"/></svg><span>Encerrar</span></button></div><div id="callMoreMenu" class="callMoreMenu" hidden><button id="callShareScreen" type="button">Compartilhar tela</button><button id="callEffects" type="button">✨ Efeitos</button><div id="callEffectsPanel" class="callEffectsPanel" hidden><button type="button" data-effect="normal">Normal</button><button type="button" data-effect="mono">⚫ P&B</button><button type="button" data-effect="warm">🌅 Quente</button><button type="button" data-effect="cool">❄️ Frio</button><button type="button" data-effect="fun">😎 Divertido</button></div></div>
      <audio id="callRemoteAudio" autoplay playsinline></audio>
    </div>
  </div>`);
  $('#callAccept').onclick=acceptIncomingCall;
  $('#callDecline').onclick=()=>{const d=A.call.incoming;if(d?.from)sendSignal(d.from,{type:'call-reject',callId:d.callId});endCall(false)};
  $('#callEnd').onclick=()=>endCall(true);$('#callMute').onclick=toggleCallMute;$('#callMore').onclick=toggleCallMore;$('#callShareScreen').onclick=toggleScreenShare;$('#callEffects').onclick=()=>{const p=$('#callEffectsPanel');if(p)p.hidden=!p.hidden};document.querySelectorAll('[data-effect]').forEach(b=>b.onclick=()=>applyCallEffect(b.dataset.effect));const overlay=$('#callOverlay');if(overlay){let hideTimer;const show=()=>{const c=$('#callControls');if(!c||A.call.connectedAt===null)return;c.classList.add('visible');clearTimeout(hideTimer);hideTimer=setTimeout(()=>c.classList.remove('visible'),3500)};overlay.addEventListener('click',e=>{if(e.target.closest('.callActions,.callControls,.callMoreMenu'))return;show()});overlay.addEventListener('touchstart',e=>{if(e.target.closest('.callActions,.callControls,.callMoreMenu'))return;show()},{passive:true})}
}

function applyCallEffect(effect){const map={normal:'none',mono:'grayscale(1)',warm:'sepia(.28) saturate(1.25)',cool:'saturate(.8) hue-rotate(12deg)',fun:'saturate(1.45) contrast(1.08)'};const f=map[effect]||'none';['#callLocalVideo','#callRemoteVideo','#callRemoteFrame'].forEach(sel=>{const el=$(sel);if(el)el.style.filter=f});const p=$('#callEffectsPanel');if(p)p.hidden=true}
function toggleCallMute(){const muted=!!A.call.muted;const next=!muted;A.call.muted=next;[...(A.call.stream?.getAudioTracks?.()||[]),...(A.call.videoLocal?.getAudioTracks?.()||[])].forEach(t=>t.enabled=!next);const b=$('#callMute');if(b){b.classList.toggle('muted',next);b.setAttribute('aria-label',next?'Ligar microfone':'Desligar microfone');b.innerHTML=next?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5a4 4 0 0 1 8 0v5a4 4 0 0 1-8 0V5Zm-3 5a7 7 0 0 0 14 0M12 17v4M9 21h6M4 4l16 16"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5a4 4 0 0 1 8 0v5a4 4 0 0 1-8 0V5Zm-3 5a7 7 0 0 0 14 0M12 17v4M9 21h6"/></svg>'}}
function toggleCallMore(){const m=$('#callMoreMenu'),b=$('#callMore');if(!m||!b)return;m.hidden=!m.hidden;b.setAttribute('aria-expanded',String(!m.hidden));}
function closeCallMore(){const m=$('#callMore');if(m)m.hidden=true;const b=$('#callMore');if(b)b.setAttribute('aria-expanded','false')}
async function toggleScreenShare(){
  closeCallMore();
  if(A.call.mode!=='video'||!A.call.videoPc||!A.call.id)return;
  if(A.call.screenSharing){stopScreenShare();return}
  if(!navigator.mediaDevices?.getDisplayMedia){toast('Seu navegador não permite compartilhar a tela nesta chamada');return}
  try{
    const screen=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:20,max:30}},audio:false});
    const track=screen.getVideoTracks()[0]; if(!track)throw new Error('Tela indisponível');
    const sender=A.call.videoPc.getSenders().find(x=>x.track?.kind==='video')||A.call.videoPc.getSenders().find(x=>x.kind==='video');
    if(!sender)throw new Error('Canal de vídeo indisponível');
    A.call.screenStream=screen;A.call.screenSharing=true;await sender.replaceTrack(track);
    const local=$('#callLocalVideo');if(local){local.srcObject=screen;local.muted=true;local.play().catch(()=>{})}
    track.onended=()=>stopScreenShare();
    const btn=$('#callShareScreen');if(btn)btn.textContent='Parar compartilhamento';
    toast('Compartilhamento de tela ativado');
  }catch(e){console.warn('Compartilhar tela',e);if(e?.name!=='AbortError')toast('Não foi possível compartilhar a tela neste dispositivo')}
}
async function stopScreenShare(){
  const screen=A.call.screenStream;A.call.screenStream=null;A.call.screenSharing=false;
  try{screen?.getTracks?.().forEach(t=>t.stop())}catch{}
  const pc=A.call.videoPc,cam=A.call.videoLocal?.getVideoTracks?.()[0];
  try{const sender=pc?.getSenders?.().find(x=>x.track?.kind==='video')||pc?.getSenders?.().find(x=>x.kind==='video');if(sender&&cam)await sender.replaceTrack(cam)}catch(e){console.warn('Restaurar câmera',e)}
  const local=$('#callLocalVideo');if(local&&A.call.videoLocal){local.srcObject=A.call.videoLocal;local.muted=true;local.play().catch(()=>{})}
  const btn=$('#callShareScreen');if(btn)btn.textContent='Compartilhar tela';
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
    const ctx=new C();const gain=ctx.createGain();gain.gain.value=0.18;gain.connect(ctx.destination);A.call.ringContext=ctx;A.call.ringGain=gain;
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
  const now=Date.now();
  A.call.connectedAt=A.call.connectedAt||now;
  A.call.callStartedAt=A.call.connectedAt;
  const update=()=>{
    const base=Number(A.call.callStartedAt||A.call.connectedAt||Date.now());
    const sec=Math.max(0,Math.floor((Date.now()-base)/1000));
    const m=String(Math.floor(sec/60)).padStart(2,'0');
    const s=String(sec%60).padStart(2,'0');
    const text=m+':'+s;
    const el=$('#callDuration');
    if(el){el.hidden=false;el.textContent=text}
    const legacy=$('#callTimer');
    if(legacy)legacy.textContent=text;
  };
  update();
  A.call.callTimer=setInterval(update,250);
}
function markCallConnected(){
  if(A.call.connectedAt)return;
  A.call.connectedAt=Date.now();
  $('#callAccept').hidden=true;$('#callDecline').hidden=true;$('#callEnd').hidden=false;$('#callMore').hidden=A.call.mode!=='video';$('#callControls')?.classList.remove('visible');closeCallMore();
  $('#callStatus').textContent='Conectado';
  const duration=$('#callDuration');if(duration){duration.hidden=false;duration.textContent='00:00'}
  startCallTimer();
}

function showCallOverlay(name,photo,status,incoming=false){
  ensureCallUi();const o=$('#callOverlay');o.hidden=false;
  const accept=$('#callAccept'),decline=$('#callDecline'),end=$('#callEnd');
  accept.disabled=false;decline.disabled=false;
  accept.hidden=!incoming;decline.hidden=false;end.hidden=true;const duration=$('#callDuration');if(duration){duration.hidden=true;duration.textContent='00:00'}
  $('#callAvatar').innerHTML=photo?`<img src="${esc(photo)}">`:esc((name||'?')[0].toUpperCase());
  $('#callName').textContent=name||'Chamada';$('#callStatus').textContent=status||'Chamada';
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
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1},video:false});
  const ctx=new (window.AudioContext||window.webkitAudioContext)();await ctx.resume();
  const source=ctx.createMediaStreamSource(stream);
  const high=ctx.createBiquadFilter();high.type='highpass';high.frequency.value=120;high.Q.value=0.7;
  const low=ctx.createBiquadFilter();low.type='lowpass';low.frequency.value=7000;low.Q.value=0.7;
  const compressor=ctx.createDynamicsCompressor();compressor.threshold.value=-32;compressor.knee.value=20;compressor.ratio.value=3;compressor.attack.value=0.004;compressor.release.value=0.16;
  const processor=ctx.createScriptProcessor(4096,1,1);
  const silent=ctx.createGain();silent.gain.value=0;
  A.call.stream=stream;A.call.audioContext=ctx;A.call.source=source;A.call.processor=processor;A.call.silentGain=silent;A.call.playTime=ctx.currentTime+0.06;
  processor.onaudioprocess=e=>{
    if(!A.call.id||!A.call.peer||window.__linkaWs?.readyState!==1)return;
    const input=e.inputBuffer.getChannelData(0);
    let sum=0;for(let i=0;i<input.length;i++){const v=input[i];sum+=v*v}
    const rms=Math.sqrt(sum/Math.max(1,input.length));
    if(rms<0.012)return;
    const pcm=downsampleTo16k(input,ctx.sampleRate);if(!pcm.length)return;
    try{window.__linkaWs.send(JSON.stringify({to:A.call.peer,type:'call-live-audio',callId:A.call.id,pcm:pcm16Base64(pcm)}))}catch{}
  };
  source.connect(high);high.connect(low);low.connect(compressor);compressor.connect(processor);processor.connect(silent);silent.connect(ctx.destination);
  return true;
}
function playLiveAudio(b64){
  if(!A.call.audioContext||!b64)return;
  const ctx=A.call.audioContext;if(ctx.state==='suspended')ctx.resume().catch(()=>{});
  const samples=base64ToFloat32(b64);if(!samples.length)return;
  const buffer=ctx.createBuffer(1,samples.length,16000);buffer.copyToChannel(samples,0);
  const src=ctx.createBufferSource();src.buffer=buffer;
  const out=ctx.createGain();out.gain.value=0.72;src.connect(out);out.connect(ctx.destination);
  const now=ctx.currentTime;
  // Keep the playback queue short so delayed packets don't make the voice sound repeated.
  A.call.playTime=Math.max(now+0.025,Math.min(A.call.playTime||now+0.025,now+0.18));
  src.start(A.call.playTime);
  A.call.playTime+=Math.min(buffer.duration,0.28);
}
function audioIceServers(){return[{urls:['stun:stun.l.google.com:19302','stun:stun.cloudflare.com:3478']},{urls:'turn:openrelay.metered.ca:80',username:'openrelayproject',credential:'openrelayproject'},{urls:'turn:openrelay.metered.ca:443?transport=tcp',username:'openrelayproject',credential:'openrelayproject'},{urls:'turns:openrelay.metered.ca:443?transport=tcp',username:'openrelayproject',credential:'openrelayproject'}]}
function waitIceGathering(pc,timeout=5000){if(pc.iceGatheringState==='complete')return Promise.resolve();return new Promise(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;pc.removeEventListener('icegatheringstatechange',finish);clearTimeout(t);resolve()};const t=setTimeout(finish,timeout);pc.addEventListener('icegatheringstatechange',()=>{if(pc.iceGatheringState==='complete')finish()})})}
async function setupAudioMedia(){
  if(A.call.audioLocal)return A.call.audioLocal;
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('Microfone não disponível neste dispositivo');
  // Mantém cancelamento de eco/ruído também em WebViews Android que rejeitam algumas constraints.
  const tries=[
    {audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1},video:false},
    {audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false},
    {audio:true,video:false}
  ];
  let lastErr;
  for(const constraints of tries){
    try{
      const stream=await navigator.mediaDevices.getUserMedia(constraints);
      const track=stream.getAudioTracks()[0];
      if(track?.applyConstraints){
        try{await track.applyConstraints({echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1})}catch{}
      }
      A.call.audioLocal=stream;A.call.stream=stream;
      return stream;
    }catch(e){lastErr=e}
  }
  throw lastErr||new Error('Não foi possível acessar o microfone');
}
function setupAudioPeer(){
  if(A.call.audioPc)return A.call.audioPc;
  const pc=new RTCPeerConnection({iceServers:audioIceServers(),bundlePolicy:'max-bundle',rtcpMuxPolicy:'require',iceCandidatePoolSize:8});
  A.call.audioPc=pc;
  pc.onicecandidate=e=>{if(e.candidate&&A.call.peer&&A.call.id)sendSignal(A.call.peer,{type:'call-audio-ice',callId:A.call.id,candidate:e.candidate})};
  pc.ontrack=e=>{
    if(!e.streams[0])return;
    A.call.audioRemote=e.streams[0];
    const a=$('#callRemoteAudio');
    if(a){
      a.srcObject=e.streams[0];a.autoplay=true;a.playsInline=true;a.muted=false;a.volume=0.86;
      a.setAttribute('playsinline','');
      a.play().catch(()=>{document.addEventListener('pointerdown',()=>a.play().catch(()=>{}),{once:true,passive:true})});
    }
  };
  pc.onconnectionstatechange=()=>{
    if(pc.connectionState==='connected')markCallConnected();
    else if(pc.connectionState==='failed'){
      $('#callStatus').textContent='Falha na conexão de áudio';
      setTimeout(()=>{if(A.call.audioPc===pc)endCall(true)},900);
    }else if(pc.connectionState==='disconnected'){
      $('#callStatus').textContent='Reconectando áudio…';
      setTimeout(()=>{if(A.call.audioPc===pc&&pc.connectionState==='disconnected')pc.restartIce?.()},1000);
    }
  };
  pc.oniceconnectionstatechange=()=>{
    if(pc.iceConnectionState==='checking')$('#callStatus').textContent='Conectando áudio…';
    if(pc.iceConnectionState==='failed')$('#callStatus').textContent='Rede não conseguiu conectar o áudio';
  };
  return pc;
}
async function addAudioTracks(){
  const stream=await setupAudioMedia(),pc=setupAudioPeer();
  stream.getTracks().forEach(t=>{if(!pc.getSenders().some(s=>s.track===t))pc.addTrack(t,stream)});
  return pc;
}
async function startOutgoingAudioOffer(){
  // Fallback compatível com WebViews: o áudio da chamada é transportado pelo WebSocket do próprio Linka.
  await startLiveAudio();
  $('#callStatus').textContent='Conectado';
  markCallConnected();
  await sendSignalReliable(A.call.peer,{type:'call-live-start',callId:A.call.id,mode:'audio'});
}
async function acceptIncomingCall(){
  stopOutgoingRing();
  if(!A.call.id||!A.call.peer)return;
  if(A.call.mode==='video')return acceptIncomingVideoCall();
  if(A.call.accepted)return;
  const callId=A.call.id,peer=A.call.peer;
  try{
    $('#callAccept').disabled=true;$('#callStatus').textContent='Conectando áudio…';A.call.accepted=true;
    await startLiveAudio();
    markCallConnected();
    const ok=await sendSignalReliable(peer,{type:'call-live-ready',callId,mode:'audio'});
    if(!ok)throw new Error('sinalização indisponível');
  }catch(e){console.error(e);toast(e?.name==='NotAllowedError'?'Permita o microfone para atender a chamada':'Não foi possível conectar a chamada de voz');if(peer)sendSignal(peer,{type:'call-reject',callId});endCall(false)}
}
async function handleAudioReady(d){
  if(d?.callId!==A.call.id||A.call.mode!=='audio')return;
  try{await startOutgoingAudioOffer()}catch(e){console.error(e);toast('Não foi possível iniciar a chamada de voz');endCall(true)}
}
async function handleAudioOffer(d){
  if(d?.callId!==A.call.id||A.call.mode!=='audio'||!A.call.accepted)return;
  try{
    const pc=await addAudioTracks();
    await pc.setRemoteDescription(d.offer);
    for(const c of A.call.audioRemoteIceQueue.splice(0))try{await pc.addIceCandidate(c)}catch{}
    const answer=await pc.createAnswer();await pc.setLocalDescription(answer);await waitIceGathering(pc);
    const ok=await sendSignalReliable(d.from,{type:'call-audio-answer',callId:d.callId,answer:pc.localDescription});
    if(!ok)throw new Error('sinalização indisponível');
  }catch(e){console.error(e);toast('Falha ao conectar o áudio');endCall(true)}
}
async function handleAudioAnswer(d){
  if(d?.callId!==A.call.id||!A.call.audioPc)return;
  try{await A.call.audioPc.setRemoteDescription(d.answer);for(const c of A.call.audioRemoteIceQueue.splice(0))try{await A.call.audioPc.addIceCandidate(c)}catch{}}
  catch(e){console.error(e);toast('Falha ao finalizar a chamada de áudio');endCall(true)}
}
async function handleAudioIce(d){
  if(d?.callId!==A.call.id||!d.candidate)return;
  const pc=A.call.audioPc;
  if(!pc||!pc.remoteDescription){A.call.audioRemoteIceQueue.push(d.candidate);return}
  try{await pc.addIceCandidate(d.candidate)}catch(e){console.warn('ICE áudio',e)}
}
function videoIceServers(){return[{urls:['stun:stun.l.google.com:19302','stun:stun.cloudflare.com:3478']},{urls:'turn:openrelay.metered.ca:80',username:'openrelayproject',credential:'openrelayproject'},{urls:'turn:openrelay.metered.ca:443?transport=tcp',username:'openrelayproject',credential:'openrelayproject'},{urls:'turns:openrelay.metered.ca:443?transport=tcp',username:'openrelayproject',credential:'openrelayproject'}]}
async function setupVideoMedia(){
  if(A.call.videoLocal)return A.call.videoLocal;
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('Câmera não disponível neste dispositivo');
  const video={facingMode:{ideal:'user'},width:{ideal:480,max:720},height:{ideal:640,max:1280},frameRate:{ideal:24,max:30}};
  const tries=[
    {audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1},video},
    {audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video},
    {audio:true,video}
  ];
  let stream,lastErr;
  for(const constraints of tries){
    try{stream=await navigator.mediaDevices.getUserMedia(constraints);break}catch(e){lastErr=e}
  }
  if(!stream)throw lastErr||new Error('Não foi possível acessar câmera e microfone');
  const at=stream.getAudioTracks()[0];
  if(at?.applyConstraints){try{await at.applyConstraints({echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1})}catch{}}
  A.call.videoLocal=stream;
  const local=$('#callLocalVideo');if(local){local.srcObject=stream;local.muted=true;local.volume=0;local.play().catch(()=>{})}
  return stream;
}
function setupVideoPeer(){
  if(A.call.videoPc)return A.call.videoPc;
  const pc=new RTCPeerConnection({iceServers:videoIceServers(),bundlePolicy:'max-bundle',rtcpMuxPolicy:'require',iceCandidatePoolSize:8});A.call.videoPc=pc;
  pc.onicecandidate=e=>{if(e.candidate&&A.call.peer&&A.call.id)sendSignal(A.call.peer,{type:'call-video-ice',callId:A.call.id,candidate:e.candidate})};pc.oniceconnectionstatechange=()=>{if(pc.iceConnectionState==='failed'){console.warn('ICE vídeo falhou');$('#callStatus').textContent='Rede não conseguiu conectar o vídeo';}else if(pc.iceConnectionState==='checking')$('#callStatus').textContent='Conectando vídeo…'};
  pc.ontrack=e=>{
    if(!e.streams[0])return;
    A.call.videoRemote=e.streams[0];
    const v=$('#callRemoteVideo');
    if(v){v.srcObject=e.streams[0];v.autoplay=true;v.playsInline=true;v.muted=false;v.volume=1;v.play().catch(()=>{document.addEventListener('pointerdown',()=>v.play().catch(()=>{}),{once:true,passive:true})})}
  };
  pc.onconnectionstatechange=()=>{if(pc.connectionState==='connected')markCallConnected();else if(pc.connectionState==='failed'){$('#callStatus').textContent='Falha na conexão de vídeo';setTimeout(()=>endCall(true),1200)}else if(pc.connectionState==='disconnected'){$('#callStatus').textContent='Reconectando vídeo…';setTimeout(()=>{if(A.call.videoPc===pc&&pc.connectionState==='disconnected')pc.restartIce?.()},1200)}};
  return pc;
}
async function startLiveVideoRelay(){
  if(A.call.videoRelayTimer)return;
  const stream=await setupVideoMedia();
  const video=$('#callLocalVideo');
  if(video){video.srcObject=stream;video.muted=true;video.play().catch(()=>{})}
  const canvas=document.createElement('canvas');
  const ctx=canvas.getContext('2d',{alpha:false});
  A.call.videoRelayCanvas=canvas;
  A.call.videoRelayCtx=ctx;
  A.call.videoRelayTimer=setInterval(()=>{
    if(!A.call.id||!A.call.peer||window.__linkaWs?.readyState!==1)return;
    if(!video||video.readyState<2||!video.videoWidth)return;
    const maxW=360,maxH=640,scale=Math.min(1,maxW/video.videoWidth,maxH/video.videoHeight);
    canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
    ctx.drawImage(video,0,0,canvas.width,canvas.height);
    canvas.toBlob(blob=>{if(!blob||!A.call.id||window.__linkaWs?.readyState!==1)return;const r=new FileReader();r.onload=()=>{const b64=String(r.result||'').split(',')[1]||'';try{window.__linkaWs.send(JSON.stringify({to:A.call.peer,type:'call-live-video',callId:A.call.id,jpeg:b64}))}catch{}};r.readAsDataURL(blob)},'image/jpeg',0.52);
  },180);
}
function stopLiveVideoRelay(){if(A.call.videoRelayTimer)clearInterval(A.call.videoRelayTimer);A.call.videoRelayTimer=null;A.call.videoRelayCanvas=null;A.call.videoRelayCtx=null;const f=$('#callRemoteFrame');if(f){f.hidden=true;f.removeAttribute('src')}}
function handleLiveVideo(d){if(d?.callId!==A.call.id||A.call.mode!=='video'||!d.jpeg)return;const f=$('#callRemoteFrame');const v=$('#callRemoteVideo');if(f){f.hidden=false;f.src='data:image/jpeg;base64,'+d.jpeg;if(v)v.hidden=true}}
async function startOutgoingVideoRelay(contact){
  await startLiveVideoRelay();
  await startLiveAudio();
  markCallConnected();
  const ok=await sendSignalReliable(contact.id,{type:'call-live-ready',callId:A.call.id,mode:'video'});
  if(!ok)throw new Error('sinalização indisponível');
}

async function startOutgoingVideoCall(contact){
  if(A.call.id){toast('Você já está em uma chamada');return}
  const callId=crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random();A.call.peer=contact.id;A.call.id=callId;A.call.incoming=null;A.call.accepted=true;A.call.liveStarted=false;A.call.mode='video';A.call.connectedAt=null;A.call.callTimer=null;A.call.roomName=contact.name;A.call.roomPhoto=contact.photo||'';
  showCallOverlay(contact.name,contact.photo,'Chamando…',false);showVideoStage();
  const ok=await sendSignalReliable(contact.id,{type:'call-room-invite',callId,mode:'video'});
  if(!ok){endCall(false);toast('Não foi possível iniciar a chamada de vídeo');return}
  setTimeout(()=>{if(A.call.id===callId&&!A.call.connectedAt){$('#callStatus').textContent='Aguardando a pessoa atender…'}},7000);
}
function showVideoStage(){ensureCallUi();const st=$('#videoStage');if(st)st.hidden=false;const av=$('#callAvatar');if(av)av.style.display='none';const card=$('#callCard');if(card)card.classList.add('videoCallCard');['#callLocalVideo','#callRemoteVideo'].forEach(sel=>{const v=$(sel);if(v)v.style.transform='none'})}
async function beginVideoOffer(){
  const stream=await setupVideoMedia();const pc=setupVideoPeer();stream.getTracks().forEach(t=>{if(!pc.getSenders().some(s=>s.track===t))pc.addTrack(t,stream)});
  const offer=await pc.createOffer({offerToReceiveAudio:true,offerToReceiveVideo:true});await pc.setLocalDescription(offer);await waitIceGathering(pc);const ok=await sendSignalReliable(A.call.peer,{type:'call-video-offer',callId:A.call.id,offer:pc.localDescription});if(!ok)throw new Error('sinalização indisponível');
  const callId=A.call.id;setTimeout(()=>{if(A.call.id===callId&&!A.call.connectedAt&&A.call.videoPc){$('#callStatus').textContent='Vídeo sem conexão de rede';}},15000);
}
async function acceptIncomingVideoCall(){
  if(!A.call.id||!A.call.peer||A.call.accepted)return;
  const callId=A.call.id,peer=A.call.peer;
  try{
    A.call.accepted=true;showVideoStage();$('#callAccept').disabled=true;$('#callStatus').textContent='Conectando vídeo…';
    await startLiveVideoRelay();
    await startLiveAudio();
    markCallConnected();
    const ok=await sendSignalReliable(peer,{type:'call-live-ready',callId,mode:'video'});
    if(!ok)throw new Error('sinalização indisponível');
  }catch(e){console.error(e);toast(e?.name==='NotAllowedError'?'Permita câmera e microfone para usar o vídeo':'Não foi possível atender a chamada de vídeo');if(peer)sendSignal(peer,{type:'call-reject',callId});endCall(false)}
}
async function handleVideoReady(d){if(d?.callId!==A.call.id||A.call.mode!=='video')return;try{await beginVideoOffer()}catch(e){console.error(e);toast('Não foi possível iniciar o vídeo');endCall(true)}}
async function handleVideoOffer(d){if(d?.callId!==A.call.id||A.call.mode!=='video'||!A.call.accepted)return;try{const stream=await setupVideoMedia();const pc=setupVideoPeer();stream.getTracks().forEach(t=>{if(!pc.getSenders().some(s=>s.track===t))pc.addTrack(t,stream)});await pc.setRemoteDescription(d.offer);for(const c of A.call.videoRemoteIceQueue.splice(0))try{await pc.addIceCandidate(c)}catch{}const answer=await pc.createAnswer();await pc.setLocalDescription(answer);await waitIceGathering(pc);const ok=await sendSignalReliable(d.from,{type:'call-video-answer',callId:d.callId,answer:pc.localDescription});if(!ok)throw new Error('sinalização indisponível')}catch(e){console.error(e);toast('Falha ao conectar o vídeo');endCall(true)}}
async function handleVideoAnswer(d){if(d?.callId!==A.call.id||!A.call.videoPc)return;try{await A.call.videoPc.setRemoteDescription(d.answer);for(const c of A.call.videoRemoteIceQueue.splice(0))try{await A.call.videoPc.addIceCandidate(c)}catch{}}catch(e){console.error(e);toast('Falha ao finalizar a chamada de vídeo');endCall(true)}}
async function handleVideoIce(d){if(d?.callId!==A.call.id||!d.candidate)return;const pc=A.call.videoPc;if(!pc||!pc.remoteDescription){A.call.videoRemoteIceQueue.push(d.candidate);return}try{await pc.addIceCandidate(d.candidate)}catch(e){console.warn('ICE vídeo',e)}}
function startOutgoingCall(contact){
  if(A.call.id){toast('Você já está em uma chamada');return}
  const callId=crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random();
  A.call.peer=contact.id;A.call.id=callId;A.call.incoming=null;A.call.accepted=true;A.call.liveStarted=false;A.call.mode='audio';A.call.connectedAt=null;A.call.callTimer=null;A.call.roomName=contact.name;A.call.roomPhoto=contact.photo||'';
  showCallOverlay(contact.name,contact.photo,'Chamando…',false);startOutgoingRing();
  sendSignalReliable(contact.id,{type:'call-room-invite',callId,mode:'audio'}).then(ok=>{if(!ok){endCall(false);toast('Não foi possível iniciar a chamada de voz')}});setTimeout(()=>{if(A.call.id===callId&&!A.call.connectedAt){$('#callStatus').textContent='Aguardando a pessoa atender…'}},7000);
}
function handleCallRoomInvite(d){
  if(A.call.id){if(d?.from)sendSignal(d.from,{type:'call-busy',callId:d.callId});return}
  const contact=A.contacts.find(x=>String(x.id)===String(d.from))||{};
  A.call.incoming=d;A.call.peer=d.from;A.call.id=d.callId;A.call.accepted=false;A.call.mode=d.mode==='video'?'video':'audio';A.call.liveStarted=false;A.call.connectedAt=null;A.call.callTimer=null;A.call.roomName=contact.name||'Contato';A.call.roomPhoto=contact.photo||'';
  showCallOverlay(A.call.roomName,A.call.roomPhoto,A.call.mode==='video'?'Chamada de vídeo recebida':'Chamada recebida',true);startOutgoingRing();if(A.call.mode==='video')showVideoStage();
}
function endCall(notifyPeer=false){
  stopOutgoingRing();
  try{$('#callAccept').disabled=false;$('#callDecline').disabled=false;$('#callMute').classList.remove('muted')}catch{}
  const peer=A.call.peer,id=A.call.id;
  const wasConnected=!!A.call.connectedAt;
  if(notifyPeer&&peer&&id)sendSignal(peer,{type:'call-end',callId:id,mode:A.call.mode});
  if(wasConnected)playSound('callEnd');
  stopLiveAudio();stopLiveVideoRelay();try{A.call.screenStream?.getTracks?.().forEach(t=>t.stop())}catch{};A.call.screenStream=null;A.call.screenSharing=false;try{A.call.videoLocal?.getTracks?.().forEach(t=>t.stop())}catch{}try{A.call.videoPc?.close()}catch{}try{A.call.audioPc?.close()}catch{}try{A.call.audioLocal?.getTracks?.().forEach(t=>t.stop())}catch{}const rv=$('#callRemoteVideo'),lv=$('#callLocalVideo'),ra=$('#callRemoteAudio');if(rv){rv.pause?.();rv.srcObject=null}if(lv){lv.pause?.();lv.srcObject=null}if(ra){ra.pause?.();ra.srcObject=null;ra.volume=0.86}const vst=$('#videoStage');if(vst)vst.hidden=true;const cb=$('#callCard');if(cb)cb.classList.remove('videoCallCard');if(A.call.callTimer)clearInterval(A.call.callTimer);const duration=$('#callDuration');if(duration){duration.hidden=true;duration.textContent='00:00'}A.call={pc:null,stream:null,remote:null,peer:null,id:null,incoming:null,pendingCandidates:[],earlyCandidates:[],roomCode:null,roomRole:null,roomJoined:false,remoteRoomJoined:false,roomName:null,roomPhoto:null,mode:'audio',muted:false,videoPc:null,videoLocal:null,videoRemote:null,videoOffer:null,videoIceQueue:[],videoRemoteIceQueue:[],audioPc:null,audioLocal:null,audioRemote:null,audioRemoteIceQueue:[],audioOffer:null,audioContext:null,source:null,processor:null,silentGain:null,playTime:0,accepted:false,liveStarted:false,connectedAt:null,callTimer:null,callStartedAt:null,ringContext:null,ringGain:null,ringTimer:null,screenStream:null,screenSharing:false};hideCallOverlay();
}
function sendTyping(active){if(!A.active||window.__linkaWs?.readyState!==1)return;try{window.__linkaWs.send(JSON.stringify({type:'typing',to:A.active.id,active:!!active}))}catch{}}
function setTypingBubble(active){const box=$('#msgs');if(!box)return;let el=$('#remoteTypingBubble');if(active){if(!el){el=document.createElement('div');el.id='remoteTypingBubble';el.className='bubble typingBubble';el.innerHTML='<span class="typingDots"><i></i><i></i><i></i></span>';box.appendChild(el)}box.scrollTop=box.scrollHeight}else if(el)el.remove()}
function showTyping(active,from){if(!A.active||String(A.active.id)!==String(from))return;const el=$('#chatPresence');if(!el)return;if(active){A.remoteTyping=true;el.textContent='digitando…';setTypingBubble(true)}else{A.remoteTyping=false;el.textContent=presenceText(A.active);setTypingBubble(false)}}
async function loadPendingCalls(){try{const list=await api('/api/calls/pending');for(const d of list){if(!A.call.id)handleCallRoomInvite(d)}}catch{}}
async function handleLiveReady(d){
  if(d?.callId!==A.call.id)return;
  try{
    if(A.call.mode==='video'){
      await startLiveVideoRelay();
      await startLiveAudio();
    }else{
      await startLiveAudio();
    }
    markCallConnected();
  }catch(e){
    console.error('Mídia da chamada',e);
    toast(e?.name==='NotAllowedError'?'Permita microfone/câmera para a chamada':'Não foi possível iniciar a mídia da chamada');
    endCall(true);
  }
}
function handleLiveAudio(d){
  if(d?.callId!==A.call.id||!d.pcm)return;
  playLiveAudio(d.pcm);
}
function connect(){const proto=location.protocol==='https:'?'wss':'ws';const ws=new WebSocket(proto+'://'+location.host+'/?token='+encodeURIComponent(A.token));window.__linkaPresenceIntentionalClose=false;ws.onopen=()=>{try{ws.send(JSON.stringify({type:document.visibilityState==='hidden'?'presence-offline':'presence-online'}))}catch{};loadPendingCalls()};ws.onmessage=async e=>{if(typeof e.data!=='string')return;let d;try{d=JSON.parse(e.data)}catch{return}if(d.type==='contact_added'){await loadContacts();renderList();toast('Novo contato adicionado')}if(d.type==='presence'){await loadContacts();refreshPresence()}if(d.type==='typing'){showTyping(!!d.active,d.from)}if(d.type==='call-room-invite'){const caller=A.contacts.find(x=>String(x.id)===String(d.from));inAppNotify('Chamada recebida',`${caller?.name||'Um contato'} está ligando para você`,()=>{});handleCallRoomInvite(d)}if(d.type==='call-live-start'){handleLiveStart(d)}if(d.type==='call-live-ready'){handleLiveReady(d)}if(d.type==='call-live-audio'){handleLiveAudio(d)}if(d.type==='call-live-video'){handleLiveVideo(d)}if(d.type==='call-audio-ready'){handleAudioReady(d)}if(d.type==='call-audio-offer'){handleAudioOffer(d)}if(d.type==='call-audio-answer'){handleAudioAnswer(d)}if(d.type==='call-audio-ice'){handleAudioIce(d)}if(d.type==='call-video-ready'){handleVideoReady(d)}if(d.type==='call-video-offer'){handleVideoOffer(d)}if(d.type==='call-video-answer'){handleVideoAnswer(d)}if(d.type==='call-video-ice'){handleVideoIce(d)}if(d.type==='call-offer'){handleIncomingOffer(d)}if(d.type==='call-answer'){handleCallAnswer(d)}if(d.type==='call-ice'){handleCallIce(d)}if(d.type==='call-reject'){toast('Chamada recusada');endCall(false)}if(d.type==='call-busy'){toast('Contato está em outra chamada');endCall(false)}if(d.type==='call-end'){toast('Chamada encerrada');if(d.callMessage&&A.active&&String(d.callMessage.from)===String(A.active.id)){A.messages.push(d.callMessage);drawMessages()}endCall(false);if($('#callsTab')?.classList.contains('active'))callsView()}if(d.type==='notification'){A.notifications.unshift(d.notification);A.notifications=A.notifications.slice(0,100);updateNotifBell();if(d.notification.kind==='message'){toast('Nova mensagem de '+d.notification.title);notifyIncoming({from:d.notification.from,type:'text',text:d.notification.body})}else toast(d.notification.title);return}if(d.type==='message_updated'){if(A.active&&String(d.message.from)===String(A.active.id)){const i=A.messages.findIndex(x=>x.id===d.message.id);if(i>=0)A.messages[i]=d.message;drawMessages()}return}if(d.type==='message_updated'){if(A.active&&String(d.message.from)===String(A.active.id)){const i=A.messages.findIndex(x=>x.id===d.message.id);if(i>=0)A.messages[i]=d.message;drawMessages()}return}if(d.type==='message_status'){if(A.active&&String(d.message.from)===String(A.user.id)){const i=A.messages.findIndex(x=>x.id===d.messageId);if(i>=0){A.messages[i].status=d.status;drawMessages()}}return}if(d.type==='message'){if(A.active&&String(d.message.from)===String(A.active.id)){showTyping(false,d.message.from);A.messages.push(d.message);A.previews[String(d.message.from)]=d.message;if(!A.chatIds.includes(String(d.message.from)))A.chatIds.push(String(d.message.from));drawMessages();renderList();playSound('receive');api('/api/messages/'+d.message.from+'/read',{method:'POST'}).catch(()=>{});}else{const sender=A.contacts.find(x=>String(x.id)===String(d.message.from));inAppNotify(sender?.name||'Nova mensagem',d.message.type==='audio'?'Enviou um áudio':(d.message.text||'Nova mensagem'),()=>openChat(String(d.message.from)));toast('Nova mensagem');notifyIncoming(d.message)}}};ws.onclose=()=>{if(!window.__linkaPresenceIntentionalClose)setTimeout(()=>A.token&&connect(),3000)};window.__linkaWs=ws}
let presenceVisibilityTimer=null;
document.addEventListener('visibilitychange',()=>{clearTimeout(presenceVisibilityTimer);if(!A.token)return;if(document.visibilityState==='hidden'){presenceVisibilityTimer=setTimeout(()=>{const ws=window.__linkaWs;if(ws?.readyState===1)try{ws.send(JSON.stringify({type:'presence-offline'}))}catch{}} ,500)}else{const ws=window.__linkaWs;if(ws?.readyState===1)try{ws.send(JSON.stringify({type:'presence-online'}))}catch{}}});
window.addEventListener('pagehide',()=>{const ws=window.__linkaWs;if(ws?.readyState===1)try{ws.send(JSON.stringify({type:'presence-offline'}))}catch{}});
setInterval(async()=>{if(!A.token||document.visibilityState==='hidden')return;try{await api('/api/ping',{method:'POST'});await loadContacts();refreshPresence()}catch{}if(window.__linkaWs?.readyState===1)try{window.__linkaWs.send(JSON.stringify({type:'ping'}))}catch{}},20000);
start();
