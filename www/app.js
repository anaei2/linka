const A={editingMessage:null,chatIds:[],token:localStorage.getItem('ac_token')||sessionStorage.getItem('ac_token')||'',user:null,contacts:[],active:null,search:'',messages:[],typingTimer:null,remoteTyping:false,notifications:[],statuses:[],calls:[],call:{pc:null,stream:null,remote:null,peer:null,id:null,incoming:null,pendingCandidates:[],earlyCandidates:[],roomCode:null,roomRole:null,roomJoined:false,remoteRoomJoined:false,roomName:null,roomPhoto:null,mode:'audio',videoPc:null,videoLocal:null,videoRemote:null,videoOffer:null,videoIceQueue:[],videoRemoteIceQueue:[],audioContext:null,source:null,processor:null,silentGain:null,playTime:0,accepted:false,liveStarted:false,connectedAt:null,callTimer:null,ringContext:null,ringGain:null,ringTimer:null}};
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
      await Promise.all([loadContacts(),loadConversations(),loadNotifications()]);
      render();
      hideBoot();
      initNotifications();
      armNotificationActivation();
      connect();
      if('Notification' in window && Notification.permission!=='granted'){setTimeout(()=>{if(A.token&&document.visibilityState==='visible')toast('Ative as notificações no Menu para receber mensagens mesmo fora do Linka.')},1200)}
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
async function loadContacts(){const [contacts,blocked]=await Promise.all([api('/api/contacts'),api('/api/blocked').catch(()=>[])]);const ids=new Set((blocked||[]).map(x=>String(x.id)));A.contacts=(contacts||[]).filter(c=>!ids.has(String(c.id)))}
async function loadConversations(){A.chatIds=await api('/api/conversations')}
function render(){document.body.classList.remove('chat-open');document.body.innerHTML=`<div class="app"><aside class="side" id="side"><header class="top"><div class="profile" id="profile">${av(A.user)}<div><b>${esc(A.user.name)}</b><span>${esc('@'+A.user.username)}</span></div></div><button class="icon" id="menu">☰</button></header><div class="search">⌕<input id="search" placeholder="Pesquisar contatos ou conversas"></div><div class="tabs"><button class="tab active" id="chats">Conversas</button><button class="tab" id="contacts">Contatos</button><button class="tab" id="statusTab">Status</button><button class="tab" id="callsTab" aria-label="Ligações"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8c1.5 2.9 3.7 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.2 1 .3 2 .5 3 .5.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C11.5 21 3 12.5 3 2.5c0-.6.4-1 1-1H7c.6 0 1 .4 1 1 0 1 .2 2 .5 3 .1.4 0 .8-.2 1.1l-1.7 1.7z"/></svg><span>Ligações</span></button></div><div class="list" id="list"></div></aside><main class="main" id="main"><div class="welcome"><div class="mark">A</div><h1>Linka</h1><p>Selecione um contato para começar.</p></div></main><div id="modal"></div></div>`;$('#profile').onclick=profileModal;$('#menu').onclick=menuModal;$('#search').oninput=e=>{A.search=e.target.value.trim();renderList()};$('#chats').onclick=()=>{setTab($('#chats'));renderList()};$('#contacts').onclick=()=>{setTab($('#contacts'));contactsView()};$('#statusTab').onclick=statusView;$('#callsTab').onclick=callsView;renderList()}
function renderList(showAll=false){const q=A.search.toLowerCase();const xs=A.contacts.filter(c=>(showAll||A.chatIds.includes(String(c.id)))&&(c.name+' '+c.username).toLowerCase().includes(q));const list=$('#list');if(!list)return;if(!xs.length){list.innerHTML='<div class="empty">Nenhum contato.<br><button class="link" id="find" type="button">Adicionar contato</button></div>';const f=$('#find');if(f)f.onclick=addContactModal;return}list.innerHTML=xs.map(c=>`<button class="item" type="button" data-id="${esc(c.id)}" aria-label="Abrir conversa com ${esc(c.name)}">${av(c)}<div class="info"><b>${esc(c.name)}</b><span>@${esc(c.username)}</span><small class="presence" data-presence="${esc(c.id)}">${esc(lastSeenText(c))}</small></div></button>`).join('');list.querySelectorAll('.item').forEach(item=>{
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
function contactsView(){renderList(true);$('#list').insertAdjacentHTML('afterbegin','<div class="section"><b>Seus contatos</b><button class="smallbtn" id="add">＋ Adicionar</button></div>');$('#add').onclick=addContactModal;document.querySelectorAll('.item').forEach(item=>{item.ondblclick=()=>contactProfile(item.dataset.id)})}
async function contactProfile(id){const c=A.contacts.find(x=>String(x.id)===String(id));if(!c)return;modal(`<div class="contactProfile">${av(c,true)}<h2>${esc(c.name)}</h2><p class="muted">@${esc(c.username)}</p><p>${esc(c.status||'Disponível')}</p><div class="profileActions"><button class="primary" id="openChatP">Mensagem</button><button class="menurow" id="blockP">Bloquear contato</button><button class="danger" data-close>Fechar</button></div></div>`);$('#openChatP').onclick=()=>{$('#modal').innerHTML='';openChat(c.id)};$('#blockP').onclick=async()=>{try{await api('/api/blocked/'+c.id,{method:'POST'});await loadContacts();$('#modal').innerHTML='';renderList();toast('Contato bloqueado')}catch(e){toast(e.message)}}}
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
  modal(`<h2>Meu status</h2><p class="muted">Cada publicação fica disponível por 24 horas. Você pode publicar vários status seguidos.</p><label class="statusCaptionLabel">Legenda<textarea id="statusText" maxlength="500" placeholder="Adicione uma legenda..."></textarea></label><label class="mediaLabel">Adicionar foto ou vídeo<input id="statusMedia" type="file" accept="image/*,video/*" hidden></label><div id="statusPreview" class="statusPreview"></div><button class="primary" id="saveStatus">Publicar status</button><button class="danger" data-close>Cancelar</button>`);
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
    const media=x.mediaType?.startsWith('video/')?`<video id="statusVideo" class="statusFullMedia" autoplay playsinline src="${x.media}"></video>`:x.media?`<img class="statusFullMedia" src="${x.media}" alt="Status de ${esc(x.user.name)}">`:`<div class="statusTextOnly">${esc(x.text||'')}</div>`;
    const progress=list.map((_,i)=>`<span class="statusProgressPart ${i<current?'done':i===current?'current':''}"><i></i></span>`).join('');
    const liked=!!x.likedByMe;
    root.innerHTML=`<div class="statusScreen"><div class="statusTop"><button class="statusBack" id="statusBack" aria-label="Voltar">‹</button><div class="statusIdentity">${av(x.user)}<div><b>${esc(x.user.name)}</b><small>${formatStatusTime(x.createdAt)}</small></div></div><button class="statusMore" id="statusMore" aria-label="Mais opções">⋮</button></div><div class="statusProgress">${progress}</div><div class="statusStage"><button class="statusTapZone statusPrev" id="statusPrev" aria-label="Status anterior"></button>${media}<button class="statusTapZone statusNext" id="statusNext" aria-label="Próximo status"></button>${x.text?`<div class="statusCaptionOverlay">${esc(x.text)}</div>`:''}</div><div class="statusBottom"><button class="statusReply" id="statusReply"><span>Responder</span></button><button class="statusHeart ${liked?'liked':''}" id="statusHeart" aria-label="${liked?'Descurtir':'Curtir'}"><svg viewBox="0 0 24 24"><path d="M20.8 8.9c0 5.1-8.8 10-8.8 10s-8.8-4.9-8.8-10A4.7 4.7 0 0 1 8 4.2c1.5 0 2.8.7 4 2 1.2-1.3 2.5-2 4-2a4.7 4.7 0 0 1 4.8 4.7Z"/></svg></button></div></div>`;
    $('#statusBack').onclick=()=>root.innerHTML='';
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
async function settingsModal(){let blocked=[];try{blocked=await api('/api/blocked')}catch{}modal(`<h2>Configurações</h2><button class="menurow" id="setProfile">Perfil e privacidade</button><button class="menurow" id="setNotif">Notificações</button><button class="menurow" id="setBg">Fundo das conversas</button><button class="menurow" id="setBlocked">Contatos bloqueados ${blocked.length?`(${blocked.length})`:''}</button><button class="menurow" id="setAbout">Sobre o Linka</button><button class="danger" data-close>Fechar</button>`);$('#setProfile').onclick=profileModal;$('#setNotif').onclick=notificationsModal;$('#setBg').onclick=backgroundModal;$('#setBlocked').onclick=()=>blockedModal(blocked);$('#setAbout').onclick=()=>modal(`<h2>Sobre o Linka</h2><p class="muted">Mensagens, chamadas e status em um só lugar.</p><p class="muted">Versão 2.1</p><button class="danger" data-close>Fechar</button>`)}
function blockedModal(blocked){modal(`<h2>Contatos bloqueados</h2>${blocked.length?blocked.map(x=>`<div class="result">${av(x)}<div><b>${esc(x.name)}</b><span>@${esc(x.username)}</span></div><button data-unblock="${esc(x.id)}">Desbloquear</button></div>`).join(''):'<p class="muted">Nenhum contato bloqueado.</p>'}<button class="danger" data-close>Fechar</button>`);document.querySelectorAll('[data-unblock]').forEach(b=>b.onclick=async()=>{try{await api('/api/blocked/'+b.dataset.unblock,{method:'DELETE'});await loadContacts();settingsModal();toast('Contato desbloqueado')}catch(e){toast(e.message)}})}
function setTab(active){document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));if(active)active.classList.add('active')}
function formatCallTime(ts){const d=new Date(ts||Date.now()),today=new Date();const same=d.toDateString()===today.toDateString();return same?d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
function formatCallDuration(sec){sec=Math.max(0,Number(sec)||0);if(sec<60)return sec+'s';const m=Math.floor(sec/60),s=sec%60;return m+'min'+(s?` ${String(s).padStart(2,'0')}s`:'')}
async function callsView(){setTab($('#callsTab'));const list=$('#list');if(!list)return;list.innerHTML='<div class="empty">Carregando ligações...</div>';try{A.calls=await api('/api/calls');}catch(e){A.calls=[];toast('Não foi possível carregar as ligações.')}if(!A.calls.length){list.innerHTML='<div class="empty">Nenhuma ligação ainda.</div>';return;}list.innerHTML=A.calls.map(c=>{const o=c.other||{};const mine=String(c.from)===String(A.user.id);const missed=['rejected','busy'].includes(c.status)&&!mine;const label=missed?'Chamada perdida':mine?'Chamada efetuada':'Chamada recebida';const arrow=missed?'missed':mine?'outgoing':'incoming';const duration=c.duration?` · ${formatCallDuration(c.duration)}`:'';return `<button class="callHistoryItem" type="button" data-id="${esc(o.id||'')}">${av(o)}<div class="callHistoryInfo"><b>${esc(o.name||'Contato')}</b><span class="callMeta ${arrow}"><span class="callArrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 19 19 5M19 5H9M19 5v10"/></svg></span>${label} · ${formatCallTime(c.endedAt||c.startedAt)}${duration}</span></div><span class="callHistoryBtn" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6.6 10.8c1.5 2.9 3.7 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.2 1 .0 2 .5 3 .5.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C11.5 21 3 12.5 3 2.5c0-.6.4-1-1-1H7c.6 0 1 .4 1 1 0 1 .2 2 .5 3 .1.4 0 .8-.2 1.1l-1.7 1.7z"/></svg></span></button>`}).join('');list.querySelectorAll('.callHistoryItem').forEach(item=>item.onclick=()=>{const id=item.dataset.id;if(id)openChat(String(id))});}

async function openChat(id){const contact=A.contacts.find(x=>String(x.id)===String(id));if(!contact){toast('Contato não encontrado');return;}A.active=contact;A.messages=[];A.remoteTyping=false;document.body.classList.add('chat-open');$('#main').className='main mobile';$('#main').innerHTML=`<header class="head"><button class="icon back" id="back" type="button">‹</button>${av(contact)}<button class="headProfile" id="headProfile" type="button"><div class="headInfo"><b>${esc(contact.name)}</b><span id="chatPresence">${esc(presenceText(contact))}</span></div></button><button class="callBtn" id="call" type="button" aria-label="Ligar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8c1.5 2.9 3.7 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.2 1 .3 2 .5 3 .5.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C11.5 21 3 12.5 3 2.5c0-.6.4-1 1-1H7c.6 0 1 .4 1 1 0 1 .2 2 .5 3 .1.4 0 .8-.2 1.1l-1.7 1.7z"/></svg></button><button class="chatMore" id="chatMore" type="button" aria-label="Mais opções">⋮</button></header><div class="messages" id="msgs"><div class="empty">Carregando conversa...</div></div><form class="composer" id="composer"><label class="attach" aria-label="Enviar foto ou vídeo">＋<input id="mediaMsg" type="file" accept="image/*,video/*" hidden></label><button class="voice" id="voice" type="button" aria-label="Segure para gravar áudio"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="3" width="8" height="12" rx="4"></rect><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"></path></svg></button><input id="msg" placeholder="Digite uma mensagem…" autocomplete="off"><button class="send" type="submit" aria-label="Enviar mensagem">➤</button></form>`;const callBtn=$('#call');if(callBtn)callBtn.onclick=()=>startOutgoingCall(contact);const chatMore=$('#chatMore');if(chatMore)chatMore.onclick=chatMenu;$('#headProfile')?.addEventListener('click',()=>contactProfile(contact.id));const back=$('#back');if(back)back.onclick=()=>{if(A.call.peer&&String(A.call.peer)===String(contact.id))endCall(true);stopRecording(false);sendTyping(false);document.body.classList.remove('chat-open');$('#main').className='main';A.active=null;A.remoteTyping=false;$('#main').innerHTML='<div class="welcome"><div class="mark">L</div><h1>Linka</h1><p>Selecione um contato para começar.</p></div>';renderList()};const form=$('#composer');const input=$('#msg');const mediaInput=$('#mediaMsg');if(input){let lastTypingSent=0;input.addEventListener('input',()=>{if(!A.active)return;const now=Date.now();if(now-lastTypingSent>250){sendTyping(true);lastTypingSent=now}clearTimeout(A.typingTimer);A.typingTimer=setTimeout(()=>sendTyping(false),1400)});input.addEventListener('blur',()=>sendTyping(false))}if(mediaInput)mediaInput.onchange=async()=>{const f=mediaInput.files?.[0];if(!f)return;if(!/^image\/|^video\//.test(f.type)){toast('Escolha uma foto ou vídeo.');mediaInput.value='';return}if(f.size>9*1024*1024){toast('A foto ou vídeo deve ter no máximo 9 MB.');mediaInput.value='';return}try{const prepared=await prepareChatMedia(f);const media=prepared.data;const type=prepared.type;const m=await api('/api/messages/'+contact.id,{method:'POST',body:{type:'media',media,mediaType:type}});if(A.active&&String(A.active.id)===String(contact.id)){A.messages.push(m);if(!A.chatIds.includes(String(contact.id)))A.chatIds.push(String(contact.id));drawMessages();playSound('send')}}catch(e){toast(e.message||'Não foi possível enviar a mídia.')}finally{mediaInput.value=''}};if(form)form.onsubmit=async e=>{e.preventDefault();sendTyping(false);const input=$('#msg'),text=input.value.trim();if(!text)return;const editing=A.editingMessage;if(editing){try{const updated=await api(`/api/messages/${contact.id}/${editing.id}`,{method:'PATCH',body:{text}});const i=A.messages.findIndex(x=>String(x.id)===String(editing.id));if(i>=0)A.messages[i]=updated;A.editingMessage=null;input.value='';exitEditMode();drawMessages()}catch(e){toast(e.message)}return}input.value='';try{const m=await api('/api/messages/'+contact.id,{method:'POST',body:{text}});if(A.active&&String(A.active.id)===String(contact.id)){A.messages.push(m);if(!A.chatIds.includes(String(contact.id)))A.chatIds.push(String(contact.id));drawMessages();playSound('send')}}catch(e){input.value=text;toast(e.message)}};setupRecorder(contact);applyChatTheme(contact.id);try{A.messages=await api('/api/messages/'+contact.id);drawMessages();try{await api('/api/messages/'+contact.id+'/read',{method:'POST'});}catch{}}catch(e){A.messages=[];drawMessages();toast('Não foi possível carregar a conversa agora. Você ainda pode tentar enviar uma mensagem.')}}
let recorder=null,recordChunks=[],recordTimer=null,recordSeconds=0,recordContact=null,recordStartAt=0;
let soundCtx=null;
function playSound(kind='send'){
  try{
    soundCtx ||= new (window.AudioContext||window.webkitAudioContext)();
    if(soundCtx.state==='suspended')soundCtx.resume();
    const now=soundCtx.currentTime;
    const o=soundCtx.createOscillator(), g=soundCtx.createGain();
    o.type='sine';
    const freq=kind==='receive'?620:kind==='cancel'?180:kind==='delivered'?520:kind==='record'?410:720;
    o.frequency.setValueAtTime(freq,now);o.frequency.exponentialRampToValueAtTime(freq*(kind==='cancel'?.72:kind==='record'?1.35:1.12),now+0.09);
    g.gain.setValueAtTime(0.0001,now);g.gain.exponentialRampToValueAtTime(0.085,now+0.012);g.gain.exponentialRampToValueAtTime(0.0001,now+0.12);
    o.connect(g).connect(soundCtx.destination);o.start(now);o.stop(now+0.13);
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
    else{stopRecording(true);playSound('send');}
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
      reader.onload=async()=>{try{const data=String(reader.result||'');if(!/^data:audio\\//i.test(data)){toast('Áudio inválido. Tente gravar novamente.');return}const m=await api('/api/messages/'+contact.id,{method:'POST',body:{type:'audio',audio:data,duration}});if(A.active&&String(A.active.id)===String(contact.id)){A.messages.push(m);if(!A.chatIds.includes(String(contact.id)))A.chatIds.push(String(contact.id));drawMessages()}}catch(e){toast(e.message||'Não foi possível enviar o áudio.')}finally{resetVoice()}};
      reader.onerror=()=>{toast('Não foi possível preparar o áudio.');resetVoice()};reader.readAsDataURL(blob);
    };
    r.start(250);recordTimer=setInterval(()=>{recordSeconds=Math.max(1,Math.round((Date.now()-startedAt)/1000));const btn=$('#voice');if(btn)btn.textContent=formatRecordTime(recordSeconds);if(recordSeconds>=90)stopRecording(true)},250);
    const btn=$('#voice');if(btn){btn.classList.add('recording');btn.textContent='0:00'}const input=$('#msg');if(input)input.placeholder='Solte para enviar';
    return true;
  }catch(e){if(stream)try{stream.getTracks().forEach(t=>t.stop())}catch{};recorder=null;toast('Não foi possível acessar o microfone');resetVoice();return false}
}
function stopRecording(send=true){if(!recorder)return;try{if(recorder.state==='recording'||recorder.state==='paused'){recorder.__cancelled=!send;recorder.stop()}else resetVoice()}catch{resetVoice()}}
function resetVoice(){const b=$('#voice');if(b){b.classList.remove('recording','canceling');b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="3" width="8" height="12" rx="4"></rect><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"></path></svg>';b.setAttribute('aria-label','Segure para gravar áudio')}clearTimeout(window.__linkaHoldTimer);recorder=null;clearInterval(recordTimer);recordTimer=null;recordSeconds=0;recordStartAt=0;const input=$('#msg');if(input)input.placeholder='Digite uma mensagem…'}

function formatRecordTime(s){const m=Math.floor(s/60),sec=String(s%60).padStart(2,'0');return `${m}:${sec}`}
function bubble(m){
  if(Array.isArray(m.deletedForMe)&&m.deletedForMe.some(x=>String(x)===String(A.user.id))) return '';
  const time=new Date(m.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  const mine=String(m.from)===String(A.user.id);
  const tick=mine?`<span class="msgTicks ${m.status==='read'?'blue':''}" aria-label="${m.status==='read'?'Lida':m.status==='delivered'?'Entregue':'Enviada'}">${m.status==='sent'?'✓':'✓✓'}</span>`:'';
  const menu=`<button class="msgMore" type="button" aria-label="Opções" data-msg-menu="${esc(m.id)}">⋮</button>`;
  if(m.deletedForEveryone) return `<div class="bubble ${mine?'mine':''} deleted" data-mid="${esc(m.id)}"><span>Esta mensagem foi apagada</span><time>${time}${tick}</time>${menu}</div>`;
  if(m.type==='audio'&&m.audio)return `<div class="bubble audioBubble ${mine?'mine':''}" data-mid="${esc(m.id)}"><audio class="audioEl" preload="metadata" src="${esc(m.audio)}"></audio><button class="audioPlay" type="button" aria-label="Reproduzir áudio" data-audio-play="${esc(m.id)}">▶</button><div class="audioInfo"><div class="audioTrack"><span class="audioProgress"></span></div><div class="audioTimes"><span class="audioCurrent">0:00</span><span class="audioDuration">${Number.isFinite(Number(m.duration))&&Number(m.duration)>0?formatRecordTime(Number(m.duration)):'0:00'}</span></div></div><time>${time}${tick}</time>${menu}</div>`;
  if(m.type==='media'&&m.media)return `<div class="bubble mediaBubble ${mine?'mine':''}" data-mid="${esc(m.id)}">${String(m.mediaType||'').startsWith('video/')?`<video class="chatMedia" controls playsinline preload="metadata" src="${esc(m.media)}"></video>`:`<img class="chatMedia" loading="lazy" src="${esc(m.media)}" alt="Foto enviada">`}<time>${time}${tick}</time>${menu}</div>`;
  return `<div class="bubble ${mine?'mine':''}" data-mid="${esc(m.id)}"><span>${esc(m.text)}${m.editedAt?' <small>(editada)</small>':''}</span><time>${time}${tick}</time>${menu}</div>`;
}
function startEditMessage(m){A.editingMessage=m;const input=$('#msg');if(!input)return;input.value=m.text||'';input.focus();const form=$('#composer');form?.classList.add('editing');let bar=$('#editBar');if(!bar&&form){bar=document.createElement('div');bar.id='editBar';bar.className='editBar';bar.innerHTML='<span><b>Editar mensagem</b><small>Toque no X para cancelar</small></span><button type=\"button\" id=\"cancelEdit\" aria-label=\"Cancelar edição\">×</button>';form.parentElement?.insertBefore(bar,form);$('#cancelEdit').onclick=()=>{A.editingMessage=null;input.value='';exitEditMode()}}if(bar)bar.hidden=false}function exitEditMode(){const form=$('#composer');if(!form)return;form.classList.remove('editing');const bar=$('#editBar');if(bar)bar.hidden=true;const input=$('#msg');if(input)input.placeholder='Digite uma mensagem…'}
function messageMenu(m){
  const mine=String(m.from)===String(A.user.id); const opts=[];
  if(mine&&m.type==='text'&&!m.deletedForEveryone) opts.push(`<button data-msg-edit="${esc(m.id)}">Editar mensagem</button>`);
  if(mine&&!m.deletedForEveryone) opts.push(`<button data-msg-delete="${esc(m.id)}" data-mode="everyone">Apagar para todos</button>`);
  opts.push(`<button data-msg-delete="${esc(m.id)}" data-mode="me">Apagar para mim</button>`);
  modal(`<div class="messageActions"><h3>Opções da mensagem</h3>${opts.join('')}<button class="danger" data-close>Cancelar</button></div>`);
  document.querySelectorAll('[data-msg-edit]').forEach(b=>b.onclick=()=>{const m=A.messages.find(x=>String(x.id)===String(b.dataset.msgEdit));if(!m)return;$('#modal').innerHTML='';startEditMessage(m)});
  document.querySelectorAll('[data-msg-delete]').forEach(b=>b.onclick=async()=>{try{const updated=await api(`/api/messages/${A.active.id}/${m.id}`,{method:'DELETE',body:{mode:b.dataset.mode}});if(b.dataset.mode==='me')A.messages=A.messages.filter(x=>x.id!==m.id);else{const i=A.messages.findIndex(x=>x.id===m.id);if(i>=0)A.messages[i]=updated}$('#modal').innerHTML='';drawMessages()}catch(e){toast(e.message)}});
}

function drawMessages(){const box=$('#msgs');if(!box)return;box.innerHTML=A.messages.map(bubble).join('');box.scrollTop=box.scrollHeight;applyChatBg();box.querySelectorAll('[data-msg-menu]').forEach(b=>b.onclick=e=>{e.stopPropagation();const card=b.closest('.bubble');card?.classList.add('show-msg-menu');const m=A.messages.find(x=>String(x.id)===String(b.dataset.msgMenu));if(m)messageMenu(m)});box.querySelectorAll('.bubble').forEach(card=>{let holdTimer=null,held=false;const start=e=>{if(e.target.closest('button,a,audio'))return;held=false;clearTimeout(holdTimer);holdTimer=setTimeout(()=>{held=true;card.classList.add('show-msg-menu');},520)};const cancel=()=>{clearTimeout(holdTimer);holdTimer=null};card.addEventListener('pointerdown',start);card.addEventListener('pointerup',cancel);card.addEventListener('pointercancel',cancel);card.addEventListener('pointerleave',cancel);card.addEventListener('contextmenu',e=>{e.preventDefault();card.classList.add('show-msg-menu')});});box.querySelectorAll('.audioBubble').forEach(card=>{const audio=card.querySelector('.audioEl'),play=card.querySelector('.audioPlay'),progress=card.querySelector('.audioProgress'),cur=card.querySelector('.audioCurrent'),dur=card.querySelector('.audioDuration');const fmt=v=>{v=Math.max(0,Math.floor(v||0));return Math.floor(v/60)+':'+String(v%60).padStart(2,'0')};audio.onloadedmetadata=()=>{if(Number.isFinite(audio.duration)&&audio.duration>0)dur.textContent=fmt(audio.duration);};audio.ontimeupdate=()=>{cur.textContent=fmt(audio.currentTime);progress.style.width=audio.duration?((audio.currentTime/audio.duration)*100)+'%':'0%'};audio.onended=()=>{play.textContent='▶';progress.style.width='0%';cur.textContent='0:00'};play.onclick=()=>{document.querySelectorAll('.audioEl').forEach(a=>{if(a!==audio)a.pause()});if(audio.paused){audio.play().then(()=>play.textContent='❚❚').catch(()=>toast('Não foi possível reproduzir o áudio'))}else{audio.pause();play.textContent='▶'}}})}
function refreshPresence(){A.contacts.forEach(c=>{document.querySelectorAll('[data-presence]').forEach(el=>{if(String(el.dataset.presence)===String(c.id))el.textContent=presenceText(c)})});if(A.active){const c=A.contacts.find(x=>String(x.id)===String(A.active.id));if(c){A.active=c;const el=$('#chatPresence');if(el)el.textContent=presenceText(c)}}}
function addContactModal(){modal(`<h2>Adicionar contato</h2><p class="muted">Procure pelo nome ou pelo usuário. Não existe código de sala.</p><input id="findq" placeholder="Ex.: @gabriel"><div id="results"></div><button class="danger" data-close>Fechar</button>`);$('#findq').oninput=async e=>{const q=e.target.value.trim();if(q.length<2){$('#results').innerHTML='';return}try{const xs=await api('/api/users?q='+encodeURIComponent(q));const exact=xs.filter(u=>String(u.username).toLowerCase()===q.replace(/^@/,'').toLowerCase()||String(u.name).toLowerCase()===q.toLowerCase());for(const u of exact){if(!A.contacts.some(c=>String(c.id)===String(u.id))){try{await api('/api/contacts/'+u.id,{method:'POST'});await loadContacts()}catch{}}}$('#results').innerHTML=xs.length?xs.map(u=>`<div class="result">${av(u)}<div><b>${esc(u.name)}</b><span>@${esc(u.username)}</span></div><button data-add="${u.id}">${A.contacts.some(c=>String(c.id)===String(u.id))?'Adicionado':'Adicionar'}</button></div>`).join(''):'<p class="muted">Nenhum usuário encontrado.</p>';document.querySelectorAll('[data-add]').forEach(b=>b.onclick=async()=>{try{await api('/api/contacts/'+b.dataset.add,{method:'POST'});await loadContacts();$('#modal').innerHTML='';renderList();toast('Contato adicionado')}catch(e){toast(e.message)}})}catch(e){toast(e.message)}}}
async function prepareChatMedia(file){
  if(file.type.startsWith('video/')){
    const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Não foi possível ler o vídeo.'));r.readAsDataURL(file)});
    return {data:String(data||''),type:file.type};
  }
  const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Não foi possível ler a foto.'));r.readAsDataURL(file)});
  try{
    const img=await new Promise((resolve,reject)=>{const x=new Image();x.onload=()=>resolve(x);x.onerror=()=>reject(Error('Foto incompatível.'));x.src=data});
    const max=1280,scale=Math.min(1,max/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));
    const w=Math.max(1,Math.round((img.naturalWidth||img.width)*scale)),h=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));
    const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);
    return {data:c.toDataURL('image/jpeg',0.78),type:'image/jpeg'};
  }catch{return {data:String(data||''),type:file.type||'image/jpeg'}}
}
async function prepareProfilePhoto(file){if(!file)return '';if(!file.type.startsWith('image/'))throw Error('Escolha uma imagem válida.');const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Não foi possível ler a foto.'));r.readAsDataURL(file)});try{const img=await new Promise((resolve,reject)=>{const x=new Image();x.onload=()=>resolve(x);x.onerror=()=>reject(Error('Este formato de foto não é compatível com este navegador.'));x.src=data});const max=720;const scale=Math.min(1,max/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));const w=Math.max(1,Math.round((img.naturalWidth||img.width)*scale));const h=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);return c.toDataURL('image/jpeg',0.82)}catch{return data}}
function profileModal(){modal(`<h2>Meu perfil</h2><div class="center">${av(A.user,true)}</div><label>Foto <input id="photo" type="file" accept="image/jpeg,image/png,image/webp,image/*"></label><label>Nome<input id="name" value="${esc(A.user.name)}"></label><label>Sobre<input id="status" value="${esc(A.user.status||'Disponível')}"></label><button class="primary" id="save">Salvar</button><button class="danger" data-close>Cancelar</button>`);let selectedPhoto=A.user.photo||'';$('#photo').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{selectedPhoto=await prepareProfilePhoto(f);A.user.photo=selectedPhoto;$('.card .avatar.big')?.replaceWith(document.querySelector('.avatar.big')||$('.avatar.big'));}catch(err){toast(err.message)}};$('#save').onclick=async()=>{try{A.user=(await api('/api/me',{method:'PUT',body:{name:$('#name').value,status:$('#status').value,photo:selectedPhoto}})).user;$('#modal').innerHTML='';render()}catch(e){toast(e.message)}}}
async function loadNotifications(){try{A.notifications=await api('/api/notifications')}catch{A.notifications=[]}}
function unreadCount(){return A.notifications.filter(n=>!n.read).length}
async function notificationsModal(){await loadNotifications();const escN=s=>esc(s);const rows=A.notifications.length?A.notifications.map(n=>`<button class="notifrow ${n.read?'':'unread'}" data-notif="${escN(n.id)}" data-chat="${escN(n.chatId||'')}"><span class="notificon">${n.kind==='contact'?'👤':'💬'}</span><span><b>${escN(n.title)}</b><small>${escN(n.body)}</small><em>${new Date(n.createdAt).toLocaleString('pt-BR')}</em></span></button>`).join(''):'<p class="muted">Nenhuma notificação.</p>';const permission=('Notification' in window)?Notification.permission:'unsupported';const activate=permission!=='granted'?'<button class="primary" id="activateNotif">Ativar notificações</button>':'';modal(`<h2>Notificações <span class="notifcount">${unreadCount()}</span></h2>${permission==='denied'?'<p class="muted">As notificações estão bloqueadas neste navegador. Permita as notificações nas configurações do site e tente novamente.</p>':''}<div class="notiflist">${rows}</div>${activate}<button class="primary" id="readall">Marcar todas como lidas</button><button class="danger" data-close>Fechar</button>`);const act=$('#activateNotif');if(act)act.onclick=async()=>{await setupNotifications();if(Notification.permission==='granted')notificationsModal()};document.querySelectorAll('[data-notif]').forEach(b=>b.onclick=async()=>{const id=b.dataset.notif;try{await api('/api/notifications/'+id+'/read',{method:'POST'})}catch{};const chat=b.dataset.chat;if(chat){$('#modal').innerHTML='';openChat(chat)}else notificationsModal()});$('#readall').onclick=async()=>{try{await api('/api/notifications/read-all',{method:'POST'})}catch{};notificationsModal()}}
function updateNotifBell(){const b=$('#notifBell');if(!b)return;const n=unreadCount();b.innerHTML='🔔'+(n?`<span class="notifbadge">${n>99?'99+':n}</span>`:'');b.setAttribute('aria-label',n?`${n} notificações não lidas`:'Notificações')}
function menuModal(){modal(`<h2>Menu</h2><button class="menurow" id="newc">＋ Adicionar contato</button><button class="menurow" id="prof">Perfil</button><button class="menurow" id="notif">Notificações</button><button class="menurow" id="activateNotifMenu">Ativar notificações</button><button class="menurow" id="bg">Fundo das conversas</button><button class="menurow" id="settings">⚙ Configurações</button><button class="menurow" id="logout">Sair</button><button class="danger" data-close>Fechar</button>`);$('#newc').onclick=addContactModal;$('#prof').onclick=profileModal;$('#notif').onclick=notificationsModal;$('#activateNotifMenu').onclick=async()=>{await setupNotifications();};$('#bg').onclick=backgroundModal;$('#settings').onclick=settingsModal;$('#logout').onclick=async()=>{try{await api('/api/logout',{method:'POST'})}catch{}localStorage.removeItem('ac_token');sessionStorage.removeItem('ac_token');location.reload()}}
function backgroundModal(){modal(`<h2>Fundo das conversas</h2><p class="muted">Escolha o fundo que aparecerá nas mensagens.</p><div class="bggrid"><button class="bgpick" data-bg="">Padrão</button><button class="bgpick" data-bg="gradient">Escuro</button><button class="bgpick" data-bg="dots">Pontos</button></div><label>Ou escolha uma imagem<input id="bgfile" type="file" accept="image/*"></label><button class="primary" id="savebg">Salvar fundo</button><button class="danger" data-close>Cancelar</button>`);let chosen=A.user.chatBg||'';document.querySelectorAll('.bgpick').forEach(b=>b.onclick=()=>chosen=b.dataset.bg);$('#bgfile').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>chosen=r.result;r.readAsDataURL(f)};$('#savebg').onclick=async()=>{try{A.user=(await api('/api/me',{method:'PUT',body:{chatBg:chosen}})).user;$('#modal').innerHTML='';applyChatBg();toast('Fundo salvo')}catch(e){toast(e.message)}}}

function chatThemeKey(id){return 'linka_chat_theme_'+String(id)}
function getChatTheme(id){try{return localStorage.getItem(chatThemeKey(id))||''}catch{return ''}}
function setChatTheme(id,bg){try{localStorage.setItem(chatThemeKey(id),bg)}catch{}}
function applyChatTheme(id){const box=$('#msgs');if(!box)return;const bg=getChatTheme(id);box.style.background=bg&&bg.startsWith('data:')?`url(${bg}) center/cover fixed, radial-gradient(circle at top,#14232a,#0b141a 60%)`:bg==='gradient'?'linear-gradient(135deg,#081b22,#162a31)':bg==='dots'?'radial-gradient(circle at 20px 20px,#ffffff18 2px,transparent 3px) 0 0/32px 32px,#0b141a':'radial-gradient(circle at top,#14232a,#0b141a 60%)'}
function chatThemeModal(){if(!A.active)return;const id=A.active.id;modal(`<h2>Tema da conversa</h2><p class="muted">Escolha o fundo somente desta conversa.</p><div class="bggrid"><button class="bgpick" data-chat-bg="">Padrão</button><button class="bgpick" data-chat-bg="gradient">Escuro</button><button class="bgpick" data-chat-bg="dots">Pontos</button></div><label>Ou escolha uma imagem<input id="chatBgFile" type="file" accept="image/*"></label><button class="primary" id="saveChatBg">Salvar tema</button><button class="danger" data-close>Cancelar</button>`);let chosen=getChatTheme(id);document.querySelectorAll('[data-chat-bg]').forEach(b=>b.onclick=()=>chosen=b.dataset.chatBg);$('#chatBgFile').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>chosen=r.result;r.readAsDataURL(f)};$('#saveChatBg').onclick=()=>{setChatTheme(id,chosen);$('#modal').innerHTML='';applyChatTheme(id);toast('Tema da conversa salvo')}}
function chatMenu(){if(!A.active)return;const id=A.active.id;modal(`<h2>Opções da conversa</h2><button class="menurow" id="clearChat">Limpar conversa</button><button class="menurow" id="chatTheme">Tema da conversa</button><button class="danger" data-close>Cancelar</button>`);$('#clearChat').onclick=async()=>{if(!confirm('Limpar todas as mensagens desta conversa?'))return;try{await api('/api/messages/'+id,{method:'DELETE'});A.messages=[];$('#modal').innerHTML='';drawMessages();toast('Conversa limpa')}catch(e){toast(e.message)}};$('#chatTheme').onclick=()=>chatThemeModal()}
async function setupNotifications(opts={}){
  if(!('Notification' in window)){toast('Este dispositivo não suporta notificações');return false}
  try{
    let permission=Notification.permission;
    if(permission==='default' && !opts.noPrompt){ permission=await Notification.requestPermission(); }
    if(permission!=='granted'){ if(permission==='denied')toast('Ative as notificações nas configurações do site.'); return false; }
    if(!('serviceWorker' in navigator)){toast('Seu navegador não suporta notificações em segundo plano');return false}
    const cfg=await api('/api/firebase-config');
    if(!window.firebase){toast('Firebase não carregou');return false}
    if(!firebase.apps.length)firebase.initializeApp(cfg);
    const messaging=firebase.messaging();
    const reg=await navigator.serviceWorker.register('/firebase-messaging-sw.js',{scope:'/'});
    await navigator.serviceWorker.ready;
    const token=await messaging.getToken({vapidKey:cfg.vapidKey,serviceWorkerRegistration:reg});
    if(!token)throw new Error('Token FCM não foi gerado');
    if(token!==window.__linkaFcmToken){
      await api('/api/fcm/token',{method:'POST',body:{token}});
      window.__linkaFcmToken=token;
    }
    if(!window.__linkaFcmBound){
      window.__linkaFcmBound=true;
      messaging.onMessage(payload=>{
        const n=payload.notification||{}; const data=payload.data||{};
        const title=n.title||'Linka'; const body=n.body||'Nova notificação';
        if(document.visibilityState==='visible') toast(title+': '+body);
        loadNotifications().then(updateNotifBell).catch(()=>{});
      });
      if(typeof messaging.onTokenRefresh==='function') messaging.onTokenRefresh(async()=>{
        try{const t=await messaging.getToken({vapidKey:cfg.vapidKey,serviceWorkerRegistration:reg});if(t&&t!==window.__linkaFcmToken){await api('/api/fcm/token',{method:'POST',body:{token:t}});window.__linkaFcmToken=t}}catch(e){console.warn('FCM token refresh:',e)}});
    }
    window.__linkaNotificationsReady=true;
    return true;
  }catch(e){console.error('FCM:',e); if(!opts.silent)toast('Não foi possível ativar as notificações'); return false}
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
function setTypingBubble(active){const box=$('#msgs');if(!box)return;let el=$('#remoteTypingBubble');if(active){if(!el){el=document.createElement('div');el.id='remoteTypingBubble';el.className='bubble typingBubble';el.innerHTML='<span class="typingDots"><i></i><i></i><i></i></span>';box.appendChild(el)}box.scrollTop=box.scrollHeight}else if(el)el.remove()}
function showTyping(active,from){if(!A.active||String(A.active.id)!==String(from))return;const el=$('#chatPresence');if(!el)return;if(active){A.remoteTyping=true;el.textContent='digitando…';setTypingBubble(true)}else{A.remoteTyping=false;el.textContent=presenceText(A.active);setTypingBubble(false)}}
async function loadPendingCalls(){try{const list=await api('/api/calls/pending');for(const d of list){if(!A.call.id)handleCallRoomInvite(d)}}catch{}}
function connect(){const proto=location.protocol==='https:'?'wss':'ws';const ws=new WebSocket(proto+'://'+location.host+'/?token='+encodeURIComponent(A.token));window.__linkaPresenceIntentionalClose=false;ws.onopen=()=>{try{ws.send(JSON.stringify({type:document.visibilityState==='hidden'?'presence-offline':'presence-online'}))}catch{};loadPendingCalls()};ws.onmessage=async e=>{if(typeof e.data!=='string')return;let d;try{d=JSON.parse(e.data)}catch{return}if(d.type==='contact_added'){await loadContacts();renderList();toast('Novo contato adicionado')}if(d.type==='presence'){await loadContacts();refreshPresence()}if(d.type==='typing'){showTyping(!!d.active,d.from)}if(d.type==='call-room-invite'){const caller=A.contacts.find(x=>String(x.id)===String(d.from));inAppNotify('Chamada recebida',`${caller?.name||'Um contato'} está ligando para você`,()=>handleCallRoomInvite(d));handleCallRoomInvite(d)}if(d.type==='call-live-start'){handleLiveStart(d)}if(d.type==='call-live-ready'){handleLiveReady(d)}if(d.type==='call-live-audio'){handleLiveAudio(d)}if(d.type==='call-video-ready'){handleVideoReady(d)}if(d.type==='call-video-offer'){handleVideoOffer(d)}if(d.type==='call-video-answer'){handleVideoAnswer(d)}if(d.type==='call-video-ice'){handleVideoIce(d)}if(d.type==='call-offer'){handleIncomingOffer(d)}if(d.type==='call-answer'){handleCallAnswer(d)}if(d.type==='call-ice'){handleCallIce(d)}if(d.type==='call-reject'){toast('Chamada recusada');endCall(false)}if(d.type==='call-busy'){toast('Contato está em outra chamada');endCall(false)}if(d.type==='call-end'){toast('Chamada encerrada');endCall(false);if($('#callsTab')?.classList.contains('active'))callsView()}if(d.type==='notification'){A.notifications.unshift(d.notification);A.notifications=A.notifications.slice(0,100);updateNotifBell();if(d.notification.kind==='message'){toast('Nova mensagem de '+d.notification.title);notifyIncoming({from:d.notification.from,type:'text',text:d.notification.body})}else toast(d.notification.title);return}if(d.type==='message_updated'){if(A.active&&String(d.message.from)===String(A.active.id)){const i=A.messages.findIndex(x=>x.id===d.message.id);if(i>=0)A.messages[i]=d.message;drawMessages()}return}if(d.type==='message_updated'){if(A.active&&String(d.message.from)===String(A.active.id)){const i=A.messages.findIndex(x=>x.id===d.message.id);if(i>=0)A.messages[i]=d.message;drawMessages()}return}if(d.type==='message_status'){if(A.active&&String(d.message.from)===String(A.user.id)){const i=A.messages.findIndex(x=>x.id===d.messageId);if(i>=0){A.messages[i].status=d.status;drawMessages()}}return}if(d.type==='message'){if(A.active&&String(d.message.from)===String(A.active.id)){showTyping(false,d.message.from);A.messages.push(d.message);if(!A.chatIds.includes(String(d.message.from)))A.chatIds.push(String(d.message.from));drawMessages();playSound('receive');api('/api/messages/'+d.message.from+'/read',{method:'POST'}).catch(()=>{});}else{const sender=A.contacts.find(x=>String(x.id)===String(d.message.from));inAppNotify(sender?.name||'Nova mensagem',d.message.type==='audio'?'Enviou um áudio':(d.message.text||'Nova mensagem'),()=>openChat(String(d.message.from)));toast('Nova mensagem');notifyIncoming(d.message)}}};ws.onclose=()=>{if(!window.__linkaPresenceIntentionalClose)setTimeout(()=>A.token&&connect(),3000)};window.__linkaWs=ws}
let presenceVisibilityTimer=null;
document.addEventListener('visibilitychange',()=>{clearTimeout(presenceVisibilityTimer);if(!A.token)return;if(document.visibilityState==='hidden'){presenceVisibilityTimer=setTimeout(()=>{const ws=window.__linkaWs;if(ws?.readyState===1)try{ws.send(JSON.stringify({type:'presence-offline'}))}catch{}} ,500)}else{const ws=window.__linkaWs;if(ws?.readyState===1)try{ws.send(JSON.stringify({type:'presence-online'}))}catch{}}});
window.addEventListener('pagehide',()=>{const ws=window.__linkaWs;if(ws?.readyState===1)try{ws.send(JSON.stringify({type:'presence-offline'}))}catch{}});
setInterval(async()=>{if(!A.token||document.visibilityState==='hidden')return;try{await api('/api/ping',{method:'POST'});await loadContacts();refreshPresence()}catch{}if(window.__linkaWs?.readyState===1)try{window.__linkaWs.send(JSON.stringify({type:'ping'}))}catch{}},20000);
start();
