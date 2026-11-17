/* CivicFlow client — role aware, responsive, live-updating single page app. */
const $ = (s,root=document)=>root.querySelector(s), $$=(s,root=document)=>[...root.querySelectorAll(s)];
const app=$('#app'), modalRoot=$('#modal-root'), toastRoot=$('#toast-region');
const state={token:localStorage.getItem('civicflow-token'),user:JSON.parse(localStorage.getItem('civicflow-user')||'null'),page:'overview',data:null,loc:{},catalogs:{},socket:null,search:'',statusFilter:'all',priorityFilter:'all'};
const icon={overview:'▦',complaints:'▤',contractors:'♙',announcements:'◉',account:'◎'};
const pretty=s=>String(s||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initials=s=>String(s||'CF').split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
const date=s=>s?new Date(s).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'—';
const datetime=s=>s?new Date(s).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}):'';
const categories=['Roads & Potholes','Water & Drainage','Streetlights','Waste & Sanitation','Parks & Public Spaces','Public Safety','Public Transport','Other'];
const locationMeta={states:[],districts:[],subdistricts:[],cities:[]};
async function loadCatalogs(){
  try{
    const [states,districts,subs,cities,meta]=await Promise.all(['states','districts','subdistricts','urban_local_bodies','metadata'].map(n=>fetch(`/data/${n}.json`).then(r=>r.json())));
    Object.assign(locationMeta,{states,districts,subdistricts:subs,cities});state.catalogs=meta[0]||{};
  }catch(e){console.warn('Location catalog unavailable',e);}
}
async function api(url,options={}){
  const headers={...(options.headers||{})};if(state.token)headers.Authorization=`Bearer ${state.token}`;
  if(options.body && !(options.body instanceof FormData))headers['Content-Type']='application/json';
  const response=await fetch(url,{...options,headers});let data={};try{data=await response.json()}catch{}
  if(!response.ok)throw new Error(data.error||'Request failed.');return data;
}
function toast(message,type='success'){
  const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=message;toastRoot.append(el);setTimeout(()=>el.remove(),3900);
}
function field(label,name,type='text',placeholder='',required=true,extra=''){
  return `<div class="field"><label for="${esc(name)}">${esc(label)}${required?' *':''}</label><input id="${esc(name)}" name="${esc(name)}" type="${esc(type)}" placeholder="${esc(placeholder)}" ${required?'required':''} ${extra}></div>`;
}
function selectField(label,name,options,placeholder='Choose…',required=true){
  return `<div class="field"><label for="${esc(name)}">${esc(label)}${required?' *':''}</label><select id="${esc(name)}" name="${esc(name)}" ${required?'required':''}><option value="">${esc(placeholder)}</option>${options.map(o=>`<option value="${esc(o.value??o)}">${esc(o.label??o)}</option>`).join('')}</select></div>`;
}
function stateOptions(){return locationMeta.states.map(x=>({value:x.name,label:`${x.name}${x.type==='U'?' · UT':''}`}));}
function locationFields(prefix,{city=true,address=true,map=true,required=true}={}){
  return `<div class="location-control">
    ${selectField('State / Union Territory',`${prefix}-state`,stateOptions(),'Select state / UT',required)}
    ${selectField('District',`${prefix}-district`,[],'Select state first',required)}
    ${selectField('Taluka / Tehsil / Sub-district',`${prefix}-subdistrict`,[],'Select district first',required)}
    ${city?`<div class="field"><label for="${prefix}-city">City / Town / Local body${required?' *':''}</label><input id="${prefix}-city" name="${prefix}-city" list="${prefix}-city-list" placeholder="Type or choose a city / town" ${required?'required':''}><datalist id="${prefix}-city-list"></datalist><div class="hint">Search official urban local bodies or enter a settlement name.</div></div>`:''}
    ${address?`<div class="field span-two"><label for="${prefix}-address">Street / landmark / detailed address${required?' *':''}</label><input id="${prefix}-address" name="${prefix}-address" placeholder="Building, street, landmark, PIN code" ${required?'required':''}></div>`:''}
    ${map?`<div class="field span-two"><label>Precise location <span class="hint">(optional, helps route the crew)</span></label><div class="map-row"><input type="number" step="any" name="${prefix}-lat" placeholder="Latitude" aria-label="Latitude"><input type="number" step="any" name="${prefix}-lng" placeholder="Longitude" aria-label="Longitude"><button class="btn btn-quiet btn-sm" type="button" data-geolocate="${prefix}">⌖ Use my location</button></div><div class="map-note" id="${prefix}-geo-note">Device location stays optional. A street address is still required.</div></div>`:''}
  </div>`;
}
function wireLocation(root=document){
  $$('select[id$="-state"]',root).forEach(el=>{if(el.dataset.wired)return;el.dataset.wired='1';el.addEventListener('change',()=>{
    const prefix=el.id.slice(0,-6),stateName=el.value,stateItem=locationMeta.states.find(x=>x.name===stateName);
    const districtSel=$(`#${prefix}-district`,root),subSel=$(`#${prefix}-subdistrict`,root),city=$(`#${prefix}-city`,root);
    fillSelect(districtSel,locationMeta.districts.filter(d=>d.stateCode===stateItem?.code).map(d=>d.name),'Select district');fillSelect(subSel,[],'Select district first');
    if(city) fillCityList(prefix,stateItem?.code,null);
  });});
  $$('select[id$="-district"]',root).forEach(el=>{if(el.dataset.wired)return;el.dataset.wired='1';el.addEventListener('change',()=>{
    const prefix=el.id.slice(0,-9),districtName=el.value,d=locationMeta.districts.find(x=>x.name===districtName && x.stateCode===$(`#${prefix}-state`,root)?.selectedOptions[0]?.dataset?.statecode);
    const stateName=$(`#${prefix}-state`,root)?.value,st=locationMeta.states.find(x=>x.name===stateName),district=locationMeta.districts.find(x=>x.name===districtName&&x.stateCode===st?.code);
    fillSelect($(`#${prefix}-subdistrict`,root),locationMeta.subdistricts.filter(x=>x.districtCode===district?.code).map(x=>x.name),'Select taluka / tehsil');
    fillCityList(prefix,st?.code,district?.code);
  });});
  $$('[data-geolocate]',root).forEach(btn=>{if(btn.dataset.wired)return;btn.dataset.wired='1';btn.addEventListener('click',()=>{
    const p=btn.dataset.geolocate,note=$(`#${p}-geo-note`,root);if(!navigator.geolocation){note.textContent='This browser does not provide location access.';return;}
    note.textContent='Requesting device location…';navigator.geolocation.getCurrentPosition(pos=>{const form=btn.closest('form');form.elements[`${p}-lat`].value=pos.coords.latitude.toFixed(6);form.elements[`${p}-lng`].value=pos.coords.longitude.toFixed(6);note.textContent=`Location captured · accuracy about ${Math.round(pos.coords.accuracy)} m`;},()=>{note.textContent='Location permission was not available. Enter a map coordinate if needed.'},{enableHighAccuracy:true,timeout:12000});
  });});
}
function fillSelect(sel,values,placeholder){if(!sel)return;sel.innerHTML=`<option value="">${esc(placeholder)}</option>`+values.map(v=>`<option>${esc(v)}</option>`).join('');}
function fillCityList(prefix,stateCode,districtCode){const list=$(`#${prefix}-city-list`);if(!list)return;const items=locationMeta.cities.filter(x=>x.stateCode===stateCode&&(!districtCode||!x.districtCode||x.districtCode===districtCode));list.innerHTML=items.map(c=>`<option value="${esc(c.name)}"></option>`).join('');}

function renderAuth(mode='login',role='citizen'){
  state.token=null;state.user=null;localStorage.removeItem('civicflow-token');localStorage.removeItem('civicflow-user');
  app.innerHTML=`<section class="auth-wrap"><div class="auth-visual"><div class="brand-lockup"><div class="brand-mark">C</div><div>CivicFlow<small>PUBLIC SERVICE, MADE VISIBLE</small></div></div>
    <div class="auth-copy"><div class="eyebrow">A better way to get things moving</div><h1>City issues.<br>Clear action.</h1><p>Report an issue, follow every update, and see the people working to make your neighborhood better.</p><div class="visual-metrics"><div><strong>36</strong><span>States & territories</span></div><div><strong>1 clear path</strong><span>From report to resolution</span></div></div></div>
    <div class="auth-foot">A connected civic operations workspace · India</div></div>
    <div class="auth-side"><div class="auth-card"><div class="eyebrow">CIVICFLOW · INDIA</div><h2>${mode==='register'?'Create your account':'Welcome back'}</h2><p>${mode==='register'?'Join your local civic response network.':'Sign in to your city workspace.'}</p>
    ${mode==='login'?`<div class="auth-tabs"><button class="${role==='citizen'?'active':''}" data-role="citizen">Citizen</button><button class="${role==='admin'?'active':''}" data-role="admin">Admin / Head</button><button class="${role==='contractor'?'active':''}" data-role="contractor">Contractor</button></div>
      <form id="login-form">${field('Email address','email','email','you@example.com')}${field('Password','password','password','Enter your password')}<button class="btn btn-primary btn-block" type="submit">Sign in <span>→</span></button></form>
      <div class="demo-box"><div class="demo-box-head">Demo access · tap to fill</div>
        <div class="demo-account"><span>Admin · city supervisor</span><button data-demo="admin">Fill login</button></div>
        <div class="demo-account"><span>Citizen · submit & track</span><button data-demo="citizen">Fill login</button></div>
        <div class="demo-account"><span>Contractor · progress updates</span><button data-demo="contractor">Fill login</button></div>
      </div><p class="hint" style="margin-top:16px">New citizen? <button class="link-button" data-auth-mode="register">Create an account</button> · Contractor? <button class="link-button" data-register-contractor>Apply to join</button></p>
    `:`<form id="register-form"><div class="auth-tabs"><button type="button" class="${role==='citizen'?'active':''}" data-role="citizen">Citizen</button><button type="button" class="${role==='contractor'?'active':''}" data-role="contractor">Contractor</button></div><input type="hidden" name="role" value="${role}">
      ${field('Full name','fullName','text','As shown on your profile')}${field('Email address','email','email','you@example.com')}${field('Mobile number','phone','tel','+91 98765 43210')}${field('Create password','password','password','At least 8 characters')}
      ${role==='contractor'?`<div class="form-section">Contractor profile & service coverage</div>${field('Company / contractor firm','company','text','Registered company or team name')}
        ${locationFields('service',{city:true,address:false,map:false})}
        <div class="grid-two">${field('GSTIN (optional)','gst','text','GST registration number',false)}${field('Experience','experience','text','e.g. 5 years') }</div>
        <div class="grid-two">${field('Business address','business-address','text','Office / base address')}${field('Coverage radius','service-radius','text','e.g. 30 km')}</div>
        <div class="field"><label>Work categories *</label><div class="chip-select">${categories.map(c=>`<label><input type="checkbox" name="categories" value="${esc(c)}"> ${esc(c)}</label>`).join('')}</div></div>
        <div class="account-note">Contractor applications are reviewed by the city admin. You can sign in after approval. Add a district-specific service area during registration; admins can refine it later.</div>`:''}
      <button class="btn btn-primary btn-block" type="submit">${role==='contractor'?'Send contractor application':'Create citizen account'} <span>→</span></button></form>
      <p class="hint" style="margin-top:16px">Already registered? <button class="link-button" data-auth-mode="login">Back to sign in</button></p>`}
    </div></div></section>`;
  $$('[data-role]',app).forEach(btn=>btn.addEventListener('click',()=>{const next=btn.dataset.role;if(mode==='register')renderAuth('register',next);else renderAuth('login',next);}));
  $$('[data-auth-mode]',app).forEach(btn=>btn.addEventListener('click',()=>renderAuth(btn.dataset.authMode,'citizen')));
  $('[data-register-contractor]',app)?.addEventListener('click',()=>renderAuth('register','contractor'));
  $$('[data-demo]',app).forEach(btn=>btn.addEventListener('click',()=>{
    const data={admin:['admin@civicflow.demo','Admin@12345'],citizen:['citizen@civicflow.demo','Citizen@123'],contractor:['contractor@civicflow.demo','Contractor@123']}[btn.dataset.demo];
    $('#login-form').elements.email.value=data[0];$('#login-form').elements.password.value=data[1];
  }));
  $('#login-form')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('[type=submit]');b.disabled=true;b.textContent='Signing in…';try{const r=await api('/api/auth/login',{method:'POST',body:JSON.stringify({email:f.elements.email.value,password:f.elements.password.value})});setSession(r);await loadWorkspace();}catch(x){toast(x.message,'error');b.disabled=false;b.innerHTML='Sign in <span>→</span>';}});
  $('#register-form')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,fd=new FormData(f),body={fullName:fd.get('fullName'),email:fd.get('email'),phone:fd.get('phone'),password:fd.get('password'),role:fd.get('role')};
    if(body.role==='contractor'){
      body.company=fd.get('company');body.categories=fd.getAll('categories');body.serviceStates=[fd.get('service-state')].filter(Boolean);body.serviceDistricts=[fd.get('service-district')].filter(Boolean);
      body.state=fd.get('service-state');body.district=fd.get('service-district');body.subdistrict=fd.get('service-subdistrict');body.city=fd.get('service-city');body.address=fd.get('business-address');body.gst=fd.get('gst');body.experience=fd.get('experience');body.serviceRadius=fd.get('service-radius');
      if(!body.categories.length)return toast('Select at least one service category.','error');
    }
    try{const r=await api('/api/auth/register',{method:'POST',body:JSON.stringify(body)});if(r.pending){toast(r.message);renderAuth('login','contractor');}else{setSession(r);await loadWorkspace();}}catch(x){toast(x.message,'error');}
  });
  wireLocation(app);
  const svc=$('#service-state',app);svc?.addEventListener('change',()=>fillSelect($('#service-district',app),locationMeta.districts.filter(d=>d.stateCode===locationMeta.states.find(s=>s.name===svc.value)?.code).map(d=>d.name),'Choose service district'));
}
function setSession(r){state.token=r.token;state.user=r.user;localStorage.setItem('civicflow-token',r.token);localStorage.setItem('civicflow-user',JSON.stringify(r.user));}
function logout(){if(state.socket)state.socket.disconnect();state.token=null;state.user=null;localStorage.removeItem('civicflow-token');localStorage.removeItem('civicflow-user');renderAuth();}
async function loadWorkspace(silent=false){
  try{state.data=await api('/api/dashboard');if(!silent)renderShell();else renderPage();connectLive();}
  catch(e){toast(e.message,'error');logout();}
}
function connectLive(){if(state.socket)state.socket.disconnect();state.socket=io();state.socket.on('connect',()=>state.socket.emit('join-user',{token:state.token}));state.socket.on('complaint:changed',()=>loadWorkspace(true));state.socket.on('contractor:changed',()=>loadWorkspace(true));state.socket.on('announcement:new',()=>loadWorkspace(true));}
function renderShell(){
  const u=state.user,isAdmin=u.role==='admin';
  const nav=[['overview','Overview'],['complaints',u.role==='citizen'?'My complaints':u.role==='contractor'?'Assigned work':'Complaint desk']];if(isAdmin)nav.push(['contractors','Contractors'],['announcements','City notices']);nav.push(['account','Account']);
  app.innerHTML=`<div class="site-layout"><aside class="sidebar" id="sidebar"><div class="brand-lockup"><div class="brand-mark">C</div><div>CivicFlow<small>INDIA · CITY OPERATIONS</small></div></div>
    <div class="nav-label">Workspace</div><nav class="nav-list">${nav.map(([key,label])=>`<button class="nav-item ${state.page===key?'active':''}" data-page="${key}"><span class="nav-icon">${icon[key]||'◦'}</span>${label}${key==='complaints'&&isAdmin&&state.data.stats?.urgent?`<span class="nav-badge">${state.data.stats.urgent}</span>`:''}</button>`).join('')}</nav>
    <div class="sidebar-bottom"><div class="city-card"><strong><span class="city-dot"></span>City services connected</strong><small>India-wide location directory</small></div><div class="user-mini"><div class="avatar">${initials(u.full_name)}</div><div><strong>${esc(u.full_name)}</strong><small>${esc(u.role==='admin'?'City supervisor':u.role)}</small></div><button class="logout" title="Sign out" data-logout>↪</button></div></div></aside>
    <section class="main-area"><header class="topbar"><div style="display:flex;align-items:center;gap:10px"><button class="mobile-menu" data-menu>☰</button><div class="crumb">City workspace <span> / </span> <strong>${pretty(state.page)}</strong></div></div><div class="top-actions"><div class="live-pill"><i></i>Live updates</div><span class="role-pill">${esc(u.role==='admin'?'Admin / Head':u.role)}</span><div class="avatar">${initials(u.full_name)}</div></div></header><div class="content" id="content"></div></section></div>`;
  $$('[data-page]',app).forEach(b=>b.addEventListener('click',()=>{state.page=b.dataset.page;renderShell();}));
  $('[data-logout]',app).addEventListener('click',logout);$('[data-menu]',app).addEventListener('click',()=>$('#sidebar',app).classList.toggle('open'));
  renderPage();
}
function heading(title,sub,actions=''){return `<div class="page-heading"><div><div class="eyebrow">${state.user.role==='admin'?'CITY OPERATIONS':state.user.role==='contractor'?'CONTRACTOR WORKSPACE':'CITIZEN PORTAL'}</div><h1>${title}</h1><p>${sub}</p></div><div class="heading-actions">${actions}</div></div>`;}
function stats(){const d=state.data.stats||{};const cards=[['Total reports',d.total||0,'▤','Across your workspace'],['Active cases',d.active||0,'◷','Moving through response'],['Urgent priority',d.urgent||0,'⚑','Needs focused attention'],['Resolved',d.resolved||0,'✓','Completed cases']];return `<div class="stat-grid">${cards.map((x,i)=>`<article class="stat-card"><div class="stat-top"><span>${x[0]}</span><span class="stat-icon">${x[2]}</span></div><div class="stat-value">${x[1]}</div><div class="stat-foot">${i===2&&x[1]>0?'<em>Review now</em> · ':''}${x[3]}</div></article>`).join('')}</div>`;}
function renderPage(){const c=$('#content');if(!c)return;
  if(state.page==='overview')c.innerHTML=renderOverview();else if(state.page==='complaints')c.innerHTML=renderComplaintsPage();else if(state.page==='contractors')c.innerHTML=renderContractorsPage();else if(state.page==='announcements')c.innerHTML=renderAnnouncementsPage();else c.innerHTML=renderAccountPage();
  bindPageEvents(c);
}
function renderOverview(){
  const u=state.user,comp=state.data.complaints||[],actions=u.role==='citizen'?`<button class="btn btn-primary" data-new-complaint>＋ Report an issue</button>`:'';
  const welcome=u.role==='admin'?'A clear view of what needs attention across the city.':u.role==='contractor'?'Your assigned work, updates, and service progress in one place.':'A clear path from your report to a city response.';
  let top=`${heading(`Good ${new Date().getHours()<12?'morning':new Date().getHours()<17?'afternoon':'evening'}, ${esc((u.full_name||'').split(' ')[0])}.`,welcome,actions)}${stats()}`;
  if(u.role==='admin'){
    const unassigned=comp.filter(x=>!x.assigned_to&&x.status!=='resolved').length;
    top+=`<div class="priority-banner"><div><h2>${unassigned?`${unassigned} report${unassigned===1?'':'s'} need contractor coverage`:'The response desk is up to date'}</h2><p>${unassigned?'Review the category and location match, then assign a crew.':'Keep an eye on priority cases and contractor updates.'}</p></div><button class="btn btn-light btn-sm" data-page="complaints">Open complaint desk →</button></div>`;
  } else if(u.role==='citizen') top+=`<div class="priority-banner"><div><h2>See something that needs attention?</h2><p>Share the location and details. We’ll route it to the right city team.</p></div><button class="btn btn-light btn-sm" data-new-complaint>Submit a report →</button></div>`;
  else top+=`<div class="priority-banner"><div><h2>Keep residents in the loop</h2><p>Post dated updates and photos as work progresses.</p></div><button class="btn btn-light btn-sm" data-page="complaints">Open assigned work →</button></div>`;
  const recent=comp.slice(0,5);
  const latest=`<section class="panel"><div class="panel-head"><div><div class="panel-title">${u.role==='contractor'?'Your active work':'Recent activity'}</div><div class="panel-subtitle">A live view of the latest reports and updates</div></div><button class="btn btn-quiet btn-sm" data-page="complaints">View all →</button></div>${recent.length?`<div class="feed-list">${recent.map(c=>`<div class="feed-card" data-detail="${c.id}" role="button"><div class="feed-pin">${categoryIcon(c.category)}</div><div style="flex:1;min-width:0"><strong>${esc(c.title)}</strong><p>${esc(c.city)}, ${esc(c.district)} · ${esc(c.category)}</p><small>#CF-${String(c.id).padStart(5,'0')} · ${date(c.created_at)}</small></div><span class="badge status-${esc(c.status)}">${pretty(c.status)}</span></div>`).join('')}</div>`:empty('No activity yet','New reports and work updates will appear here.')}</section>`;
  const breakdown=categories.map(cat=>({cat,n:comp.filter(x=>x.category===cat).length})).filter(x=>x.n).sort((a,b)=>b.n-a.n).slice(0,5);
  const side=`<section class="panel"><div class="panel-head"><div><div class="panel-title">By service category</div><div class="panel-subtitle">Report volume in this workspace</div></div></div>${breakdown.length?breakdown.map(x=>`<div class="priority-row"><span>${categoryIcon(x.cat)} &nbsp;${esc(x.cat)}</span><div style="display:flex;align-items:center;gap:10px"><div class="meter"><i style="width:${Math.max(7,x.n/Math.max(1,comp.length)*100)}%"></i></div><strong>${x.n}</strong></div></div>`).join(''):empty('Waiting for reports','Category trends appear as reports arrive.')}</section>
    <section class="panel"><div class="panel-head"><div><div class="panel-title">City notices</div><div class="panel-subtitle">Updates from operations</div></div>${u.role==='admin'?'<button class="btn btn-quiet btn-sm" data-page="announcements">Manage</button>':''}</div>${(state.data.notices||[]).length?state.data.notices.slice(0,3).map(noticeHTML).join(''):empty('No notices posted','Important service updates will be shared here.')}</section>`;
  return top+`<div class="two-col">${latest}<div>${side}</div></div>`;
}
function categoryIcon(c){return {'Roads & Potholes':'⌁','Water & Drainage':'◉','Streetlights':'☼','Waste & Sanitation':'♲','Parks & Public Spaces':'❋','Public Safety':'◇','Public Transport':'↗','Other':'◦'}[c]||'◦';}
function empty(title,text){return `<div class="empty-state"><div class="empty-icon">⌕</div><strong>${title}</strong><p>${text}</p></div>`;}
function noticeHTML(n){return `<div class="announcement ${esc(n.severity)}"><strong>${esc(n.title)}</strong><p>${esc(n.body)}</p><small>${date(n.created_at)} · ${pretty(n.severity)}</small></div>`;}
function mediaHref(url){const name=String(url||'').split('/').pop();return `/api/media/${encodeURIComponent(name)}?token=${encodeURIComponent(state.token||'')}`;}
function renderComplaintsPage(){
  const role=state.user.role;
  const title=role==='citizen'?'My complaints':role==='contractor'?'Assigned work':'Complaint desk';
  const sub=role==='citizen'?'Track progress and follow every update on your reports.':role==='contractor'?'Update work status and share progress evidence with residents.':'Review incoming reports, priority, location, and contractor coverage.';
  let list=state.data.complaints||[];
  if(state.search)list=list.filter(c=>`${c.title} ${c.category} ${c.city} ${c.district} ${c.state} ${c.id} ${c.status}`.toLowerCase().includes(state.search.toLowerCase()));
  if(state.statusFilter!=='all')list=list.filter(c=>c.status===state.statusFilter);
  if(state.priorityFilter!=='all')list=list.filter(c=>c.priority===state.priorityFilter);
  const rows=list.map(c=>`<tr><td><div class="issue-title">${esc(c.title)}</div><div class="issue-id">#CF-${String(c.id).padStart(5,'0')} · ${esc(c.category)}</div></td><td><span class="badge status-${esc(c.status)}">${pretty(c.status)}</span></td><td><span class="badge priority-${esc(c.priority)}">${pretty(c.priority)}</span></td><td>${esc(c.city)}<div class="subtle">${esc(c.district)}, ${esc(c.state)}</div></td><td>${role==='admin'?esc(c.contractor_name||'Unassigned'):role==='citizen'?esc(c.contractor_name||'Awaiting assignment'):esc(c.citizen_name)}<div class="subtle">${date(c.created_at)}</div></td><td><button class="table-action" data-detail="${c.id}">Open ↗</button></td></tr>`).join('');
  return `${heading(title,sub,role==='citizen'?'<button class="btn btn-primary" data-new-complaint>＋ New complaint</button>':'')}
    <section class="panel"><div class="panel-head"><div><div class="panel-title">${list.length} ${list.length===1?'case':'cases'}</div><div class="panel-subtitle">Search by issue, category, or location</div></div><div class="toolbar"><div class="search-box"><input id="complaint-search" value="${esc(state.search)}" placeholder="Search complaints…"></div><select class="filter-select" id="status-filter"><option value="all">All statuses</option>${['submitted','assigned','in_progress','on_hold','resolved','closed'].map(s=>`<option ${state.statusFilter===s?'selected':''} value="${s}">${pretty(s)}</option>`).join('')}</select><select class="filter-select" id="priority-filter"><option value="all">All priorities</option>${['urgent','high','normal','low'].map(s=>`<option ${state.priorityFilter===s?'selected':''} value="${s}">${pretty(s)}</option>`).join('')}</select></div></div>
    ${rows?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Complaint</th><th>Status</th><th>Priority</th><th>Location</th><th>${role==='admin'?'Assigned contractor':'Reported by / crew'}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`:empty('No matching complaints','Try changing your filters, or create a new report.')}</section>`;
}
function renderContractorsPage(){
  const list=state.data.contractors||[];
  return `${heading('Contractor network','Review applications and keep category coverage ready for incoming work.')}
    <div class="stat-grid"><article class="stat-card"><div class="stat-top">Approved contractors <span class="stat-icon">♙</span></div><div class="stat-value">${list.filter(x=>x.approval_status==='approved').length}</div><div class="stat-foot">Eligible for auto-assignment</div></article><article class="stat-card"><div class="stat-top">Pending review <span class="stat-icon">◷</span></div><div class="stat-value">${list.filter(x=>x.approval_status==='pending').length}</div><div class="stat-foot">Approve profiles to activate</div></article><article class="stat-card"><div class="stat-top">Categories covered <span class="stat-icon">◇</span></div><div class="stat-value">${new Set(list.filter(x=>x.approval_status==='approved').flatMap(x=>x.categories||[])).size}</div><div class="stat-foot">Across active contractors</div></article><article class="stat-card"><div class="stat-top">Location coverage <span class="stat-icon">⌖</span></div><div class="stat-value">${new Set(list.filter(x=>x.approval_status==='approved').flatMap(x=>x.service_states||[])).size}</div><div class="stat-foot">States / Union Territories</div></article></div>
    <section class="panel"><div class="panel-head"><div><div class="panel-title">Profiles & applications</div><div class="panel-subtitle">Contractors are eligible for category and location based routing after approval.</div></div><select id="contractor-filter" class="filter-select"><option value="all">All profiles</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></div>
    <div id="contractor-cards">${list.length?list.map(contractorCard).join(''):empty('No contractor profiles yet','Applications submitted from registration appear here.')}</div></section>`;
}
function contractorCard(c){const active=(state.data.complaints||[]).filter(x=>x.assigned_to===c.id&&['assigned','in_progress'].includes(x.status)).length,p=c.profile_json||{};return `<article class="contractor-card" data-approval-state="${esc(c.approval_status)}"><div><div style="display:flex;gap:8px;align-items:center"><div class="avatar">${initials(c.company||c.full_name)}</div><div><strong>${esc(c.company||c.full_name)}</strong><div class="subtle">${esc(c.full_name)} · ${esc(c.phone)}</div></div></div><div class="tags">${(c.categories||[]).map(x=>`<span class="tag">${esc(x)}</span>`).join('')}</div><p>⌖ ${(c.service_states||[]).map(esc).join(', ')||'No state set'}${(c.service_districts||[]).length?` · ${(c.service_districts||[]).map(esc).join(', ')}`:''}${p.subdistrict?` · ${esc(p.subdistrict)}`:''}${p.city?` · ${esc(p.city)}`:''}<br>Business base: ${esc(p.address||'Not provided')}${p.serviceRadius?` · Coverage ${esc(p.serviceRadius)}`:''} &nbsp; · &nbsp; ${active} active assignment${active===1?'':'s'}</p><div class="subtle">${esc(c.email)} · Applied ${date(c.created_at)} ${p.experience?`· ${esc(p.experience)} experience`:''}${p.gst?` · GSTIN ${esc(p.gst)}`:''}</div></div><div class="approval-row">${c.approval_status==='pending'?`<button class="btn btn-primary btn-sm" data-approve="${c.id}">Approve</button><button class="btn btn-danger btn-sm" data-reject="${c.id}">Decline</button>`:`<span class="badge status-${c.approval_status==='approved'?'resolved':'on_hold'}">${pretty(c.approval_status)}</span>`}</div></article>`;}
function renderAnnouncementsPage(){return `${heading('City notices','Share service updates with residents and contractors.')}<div class="two-col"><section class="panel"><div class="panel-head"><div><div class="panel-title">Post a notice</div><div class="panel-subtitle">Keep it clear, specific, and time relevant.</div></div></div><form id="notice-form"><div class="field"><label>Notice title *</label><input name="title" maxlength="140" required placeholder="e.g. Water supply interruption — Ward 8"></div><div class="field"><label>Details *</label><textarea name="body" maxlength="1000" required placeholder="What is changing, where, and when?"></textarea></div><div class="grid-two">${selectField('Severity','severity',['info','warning','urgent'],'Select severity')}${selectField('Audience','audience',['all','citizen','contractor'],'Everyone')}</div><button class="btn btn-primary" type="submit">Publish city notice →</button></form></section><section class="panel"><div class="panel-head"><div><div class="panel-title">Recent notices</div><div class="panel-subtitle">Visible to the selected audience</div></div></div>${(state.data.notices||[]).length?state.data.notices.map(noticeHTML).join(''):empty('No notices yet','Your published notices will be listed here.')}</section></div>`;}
function renderAccountPage(){const u=state.user;return `${heading('Your account','Profile and access details for this CivicFlow workspace.')}<section class="panel"><div style="display:flex;gap:15px;align-items:center"><div class="avatar" style="width:52px;height:52px;font-size:16px">${initials(u.full_name)}</div><div><div class="panel-title">${esc(u.full_name)}</div><div class="panel-subtitle">${esc(u.email)} · ${esc(u.phone||'No phone number')}</div><span class="account-pill">${esc(u.role)}</span></div></div><div class="form-section">Account access</div><div class="location-grid"><div class="location-summary">Account role<strong>${pretty(u.role==='admin'?'Admin / Head':u.role)}</strong></div><div class="location-summary">Session<strong>Secure, expires after 12 hours</strong></div>${u.role==='contractor'?`<div class="location-summary">Company<strong>${esc(u.company||'—')}</strong></div><div class="location-summary">Approval<strong>${pretty(u.approval_status)}</strong></div>`:''}</div><div class="callout">For this demonstration, seeded accounts and local uploads are intended for a classroom or local network. Change the demo credentials and JWT secret before any public deployment.</div><button class="btn btn-quiet" data-logout>Sign out</button></section>`;}

function bindPageEvents(root){
  $$('[data-page]',root).forEach(b=>b.addEventListener('click',()=>{state.page=b.dataset.page;renderShell();}));
  $$('[data-new-complaint]',root).forEach(b=>b.addEventListener('click',openComplaintForm));
  $$('[data-detail]',root).forEach(b=>b.addEventListener('click',()=>openDetail(Number(b.dataset.detail))));
  $$('[data-logout]',root).forEach(b=>b.addEventListener('click',logout));
  $('#complaint-search',root)?.addEventListener('input',e=>{state.search=e.target.value;const pos=e.target.selectionStart;renderPage();const input=$('#complaint-search');input?.focus();input?.setSelectionRange(pos,pos);});
  $('#status-filter',root)?.addEventListener('change',e=>{state.statusFilter=e.target.value;renderPage();});
  $('#priority-filter',root)?.addEventListener('change',e=>{state.priorityFilter=e.target.value;renderPage();});
  $('#contractor-filter',root)?.addEventListener('change',e=>$$('[data-approval-state]',root).forEach(c=>c.style.display=e.target.value==='all'||c.dataset.approvalState===e.target.value?'':'none'));
  $$('[data-approve]',root).forEach(b=>b.addEventListener('click',()=>approval(b.dataset.approve,'approved')));
  $$('[data-reject]',root).forEach(b=>b.addEventListener('click',()=>approval(b.dataset.reject,'rejected')));
  $('#notice-form',root)?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;try{await api('/api/announcements',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(f)))});toast('Notice published to the selected audience.');await loadWorkspace(true);}catch(x){toast(x.message,'error');}});
}
async function approval(id,status){try{await api(`/api/contractors/${id}/approval`,{method:'PATCH',body:JSON.stringify({status})});toast(status==='approved'?'Contractor approved.':'Application declined.');await loadWorkspace(true);}catch(e){toast(e.message,'error');}}

function openComplaintForm(){
  modalRoot.innerHTML=`<div class="modal-backdrop"><section class="modal"><div class="modal-head"><div><h2>Report a city issue</h2><p>Share what happened and where. The right service team can take it from there.</p></div><button class="close-modal" data-close>×</button></div><form id="complaint-form"><div class="modal-body"><div class="grid-two">${selectField('Service category','category',categories,'Choose a category')}${selectField('Priority','priority',[{value:'normal',label:'Normal'},{value:'low',label:'Low'},{value:'high',label:'High'},{value:'urgent',label:'Urgent · safety / urgent service'}],'Choose priority')}</div>
    <div class="field"><label>Short title *</label><input name="title" maxlength="140" required placeholder="What needs attention? e.g. Pothole at the main crossing"></div><div class="field"><label>Describe the issue *</label><textarea name="description" maxlength="3000" required placeholder="Tell us what you noticed, when it started, and who may be affected."></textarea><div class="hint">Please do not include sensitive personal or medical details.</div></div>
    <div class="form-section">Where is the issue?</div>${locationFields('complaint')}
    <div class="form-section">Photo or document evidence <span class="hint">· up to 5 files, 8 MB each</span></div><div class="upload-box"><input name="photos" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple><div class="hint">A photo can help the team understand the issue before they arrive.</div></div>
    <div class="callout">Your report is visible to the assigned city team. Your phone and email stay private. You can follow all progress updates here.</div>
    </div><div class="modal-foot"><button type="button" class="btn btn-quiet" data-close>Cancel</button><button type="submit" class="btn btn-primary">Submit complaint →</button></div></form></section></div>`;
  wireLocation(modalRoot);wireModalClose();
  $('#complaint-form',modalRoot).addEventListener('submit',async e=>{e.preventDefault();const b=e.currentTarget.querySelector('[type=submit]');b.disabled=true;b.textContent='Submitting…';const fd=new FormData(e.currentTarget);fd.set('state',fd.get('complaint-state'));fd.set('district',fd.get('complaint-district'));fd.set('subdistrict',fd.get('complaint-subdistrict'));fd.set('city',fd.get('complaint-city'));fd.set('address',fd.get('complaint-address'));fd.set('lat',fd.get('complaint-lat'));fd.set('lng',fd.get('complaint-lng'));try{const r=await api('/api/complaints',{method:'POST',body:fd});closeModal();toast(r.autoAssigned?'Complaint submitted and routed to a matching contractor.':'Complaint submitted. It is awaiting contractor coverage.');state.page='complaints';await loadWorkspace(true);}catch(x){toast(x.message,'error');b.disabled=false;b.textContent='Submit complaint →';}});
}
function wireModalClose(){ $$('[data-close]',modalRoot).forEach(b=>b.addEventListener('click',closeModal));$('.modal-backdrop',modalRoot)?.addEventListener('click',e=>{if(e.target.classList.contains('modal-backdrop'))closeModal();}); }
function closeModal(){modalRoot.innerHTML='';}
function openDetail(id){const c=(state.data.complaints||[]).find(x=>x.id===id);if(!c)return;
  const updates=c.updates||[],isAdmin=state.user.role==='admin',isWorker=state.user.role==='contractor',assigned=c.assigned_to;
  const history=[...updates].reverse();
  const photoLinks=(c.photos||[]).map(p=>`<a target="_blank" rel="noopener" href="${esc(mediaHref(p))}">View attachment ↗</a>`).join('');
  const approvedContractors=(state.data.contractors||[]).filter(x=>x.approval_status==='approved');
  const matchingContractors=approvedContractors.filter(x=>(x.categories||[]).includes(c.category)&&(!x.service_states?.length||x.service_states.includes(c.state))&&(!x.service_districts?.length||x.service_districts.includes(c.district)));
  const contractorList=matchingContractors.length?matchingContractors:approvedContractors;
  modalRoot.innerHTML=`<div class="modal-backdrop"><section class="modal"><div class="modal-head"><div><div class="issue-id">#CF-${String(c.id).padStart(5,'0')} · ${esc(c.category)}</div><h2>${esc(c.title)}</h2><p>${esc(c.city)}, ${esc(c.district)}, ${esc(c.state)} · submitted ${datetime(c.created_at)}</p></div><button class="close-modal" data-close>×</button></div><div class="modal-body"><div class="detail-grid"><div><div class="detail-box"><h4>Report details</h4><div style="display:flex;gap:7px;margin-bottom:9px"><span class="badge status-${esc(c.status)}">${pretty(c.status)}</span><span class="badge priority-${esc(c.priority)}">${pretty(c.priority)} priority</span></div><p>${esc(c.description)}</p>${photoLinks?`<div class="photo-strip">${photoLinks}</div>`:''}</div>
      <div class="detail-box"><h4>Location & routing</h4><p>⌖ ${esc(c.address)}<br>${esc(c.subdistrict)} · ${esc(c.city)}, ${esc(c.district)}, ${esc(c.state)}</p>${c.latitude&&c.longitude?`<p style="margin-top:7px"><a href="https://www.openstreetmap.org/?mlat=${c.latitude}&mlon=${c.longitude}#map=17/${c.latitude}/${c.longitude}" target="_blank" rel="noopener" style="color:#2867e8">Open map location ↗</a></p>`:''}</div>
      <div class="detail-box"><h4>Assigned contractor</h4>${c.contractor_name?`<p><strong>${esc(c.contractor_company||c.contractor_name)}</strong><br>${esc(c.contractor_name)} · <a href="tel:${esc(c.contractor_phone)}">${esc(c.contractor_phone)}</a></p>`:`<p>Awaiting an eligible contractor assignment.</p>`}</div>
      ${isAdmin?`<div class="detail-box"><h4>Assignment control</h4><div class="field"><label>${matchingContractors.length?"Eligible category and location matches":"No category / location match · admin override"}</label><select id="assign-contractor" class="filter-select" style="width:100%"><option value="">${c.contractor_name?'Unassign contractor':'Keep unassigned'}</option>${contractorList.map(x=>`<option value="${x.id}" ${x.id===c.assigned_to?'selected':''}>${esc(x.company||x.full_name)} · ${esc(x.phone)}</option>`).join('')}</select></div><div class="field"><label>Admin note / reason</label><input id="assign-reason" placeholder="Optional reason for manual assignment"></div><button class="btn btn-primary btn-sm" data-save-assignment="${c.id}">Save assignment</button></div>`:''}
      ${(isWorker&&assigned===state.user.id)||isAdmin?`<div class="detail-box"><h4>Post a progress update</h4><form id="progress-form" data-id="${c.id}"><div class="field"><label>Work status</label><select name="status" class="filter-select" style="width:100%"><option value="">Keep current status · ${pretty(c.status)}</option>${['assigned','in_progress','on_hold','resolved'].map(s=>`<option value="${s}">${pretty(s)}</option>`).join('')}</select></div><div class="field"><label>Update for the resident *</label><textarea name="message" maxlength="1000" required placeholder="What has been checked or completed? Include an expected next step."></textarea></div><div class="field"><label>Photos / evidence</label><input type="file" name="files" multiple accept="image/jpeg,image/png,image/webp,application/pdf"></div><button class="btn btn-primary btn-sm" type="submit">Post progress update →</button></form></div>`:''}
      </div><div><div class="detail-box"><h4>Response timeline</h4>${history.length?`<div class="timeline">${history.map(u=>`<div class="timeline-item"><strong>${esc(u.author_name||'City team')} · ${pretty(u.status||'update')}</strong><p>${esc(u.message)}</p>${(u.files||[]).map(f=>`<a href="${esc(mediaHref(f.url))}" target="_blank" rel="noopener" style="font-size:10px;color:#2867e8;margin-right:7px">${esc(f.name||'Evidence')} ↗</a>`).join('')}<small>${datetime(u.created_at)}</small></div>`).join('')}</div>`:empty('No updates yet','Updates from the assigned team will appear here.')}</div>
      <div class="detail-box"><h4>Service target</h4><p>Target: respond within 48 hours<br>Due ${date(c.due_at)}${c.due_at&&new Date(c.due_at)<new Date()&&!['resolved','closed'].includes(c.status)?'<br><span style="color:#c84049;font-weight:700">This case is overdue</span>':''}</p></div>
      <div class="detail-box"><h4>Privacy & contact</h4><p>Reporter: ${esc(c.citizen_name)}<br>Reporter contact is only shared with authorized city staff.</p></div></div></div></div></section></div>`;
  wireModalClose();
  $('[data-save-assignment]',modalRoot)?.addEventListener('click',async b=>{try{await api(`/api/complaints/${id}/assign`,{method:'PATCH',body:JSON.stringify({contractorId:$('#assign-contractor',modalRoot).value||null,reason:$('#assign-reason',modalRoot).value})});toast('Assignment updated.');closeModal();await loadWorkspace(true);}catch(e){toast(e.message,'error');}});
  $('#progress-form',modalRoot)?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('[type=submit]');b.disabled=true;b.textContent='Posting…';try{await api(`/api/complaints/${id}/progress`,{method:'POST',body:new FormData(f)});toast('Progress update posted.');closeModal();await loadWorkspace(true);}catch(x){toast(x.message,'error');b.disabled=false;b.textContent='Post progress update →';}});
}

(async()=>{
  await loadCatalogs();
  if(state.token&&state.user){try{const r=await api('/api/auth/me');state.user=r.user;await loadWorkspace();}catch{logout();}}
  else renderAuth();
})();
