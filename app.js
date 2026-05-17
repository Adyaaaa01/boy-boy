const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let authUser = null;
let profile = null;
let family = null;
let state = { tx:[], savings:[], loans:[], members:[], page:'home', charts:[] };

const $ = id => document.getElementById(id);
const fmt = n => (Number(n)||0).toLocaleString('en-US') + '₮';
const today = () => new Date().toISOString().slice(0,10);
function toast(msg){ const t=$('toast'); t.textContent=msg; t.style.display='block'; setTimeout(()=>t.style.display='none',3000); }
function closeM(){ $('modal').classList.remove('show'); }
function modal(html){ $('modalContent').innerHTML=html; $('modal').classList.add('show'); }

function setAuthMode(mode){
  ['login','register','forgot'].forEach(x=>{
    $(x+'Box').classList.toggle('hidden', x!==mode);
    $(x+'Tab').classList.toggle('active', x===mode);
  });
}

async function login(){
  const {error} = await sb.auth.signInWithPassword({email:$('loginEmail').value.trim(), password:$('loginPassword').value});
  if(error) return toast(error.message);
  await boot();
}

async function sendMagicOtp(){
  const email = $('loginEmail').value.trim();
  if(!email) return toast('Имэйлээ оруулна уу');
  const {error} = await sb.auth.signInWithOtp({email, options:{emailRedirectTo:location.origin}});
  if(error) return toast(error.message);
  toast('OTP / magic link имэйл рүү илгээгдлээ');
}

async function forgotPassword(){
  const email = $('forgotEmail').value.trim();
  const {error} = await sb.auth.resetPasswordForEmail(email, {redirectTo:location.origin});
  if(error) return toast(error.message);
  toast('Нууц үг сэргээх link имэйл рүү илгээгдлээ');
}

async function registerAdmin(){
  const name = $('regName').value || 'Администратор';
  const email = $('regEmail').value.trim();
  const password = $('regPassword').value;
  const familyName = $('familyName').value || 'Манай гэр бүл';

  const {data, error} = await sb.auth.signUp({email, password, options:{data:{name}}});
  if(error) return toast(error.message);
  authUser = data.user;
  if(!authUser){ toast('Имэйлээ баталгаажуулсны дараа нэвтэрнэ үү'); return; }

  const {data: fam, error: fe} = await sb.from('families').insert({name:familyName, owner_id:authUser.id}).select().single();
  if(fe) return toast(fe.message);

  await sb.from('profiles').insert({id:authUser.id, family_id:fam.id, name, email, role:'admin'});
  toast('Админ бүртгэл үүслээ');
  await boot();
}

async function logout(){ await sb.auth.signOut(); location.reload(); }

async function boot(){
  const {data:{session}} = await sb.auth.getSession();
  authUser = session?.user || null;
  if(!authUser){ $('authScreen').classList.remove('hidden'); $('app').classList.add('hidden'); $('mobilebar').classList.add('hidden'); return; }

  let {data:p} = await sb.from('profiles').select('*').eq('id',authUser.id).maybeSingle();

  if(!p){
    const invite = await sb.from('invites').select('*').eq('email',authUser.email).eq('status','pending').maybeSingle();
    if(invite.data){
      await sb.from('profiles').insert({id:authUser.id, family_id:invite.data.family_id, name:authUser.user_metadata?.name || authUser.email.split('@')[0], email:authUser.email, role:'member'});
      await sb.from('invites').update({status:'accepted'}).eq('id',invite.data.id);
      p = (await sb.from('profiles').select('*').eq('id',authUser.id).single()).data;
    }
  }

  if(!p){ toast('Танд family profile олдсонгүй. Админ бүртгэл үүсгэнэ үү.'); await sb.auth.signOut(); return; }

  profile = p;
  family = (await sb.from('families').select('*').eq('id',profile.family_id).single()).data;
  $('authScreen').classList.add('hidden'); $('app').classList.remove('hidden'); $('mobilebar').classList.remove('hidden');
  $('sideUser').textContent = profile.name; $('sideEmail').textContent = profile.email;
  await loadAll();
  attachNav();
  page('home');
}

function attachNav(){
  document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>page(b.dataset.page));
}

async function loadAll(){
  const fid = profile.family_id;
  const [tx,sav,loans,members] = await Promise.all([
    sb.from('transactions').select('*').eq('family_id',fid).order('date',{ascending:false}),
    sb.from('savings').select('*').eq('family_id',fid).order('created_at',{ascending:false}),
    sb.from('loans').select('*').eq('family_id',fid).order('created_at',{ascending:false}),
    sb.from('profiles').select('*').eq('family_id',fid)
  ]);
  state.tx = tx.data||[]; state.savings=sav.data||[]; state.loans=loans.data||[]; state.members=members.data||[];
}

function page(p){
  state.page=p;
  document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page==p));
  render[p]();
}

const sum = type => state.tx.filter(x=>x.type===type).reduce((a,b)=>a+Number(b.amount),0);
const savingTotal = () => state.savings.reduce((a,b)=>a+Number(b.current_amount),0);
const loanBalance = () => state.loans.reduce((a,b)=>a+(Number(b.total_amount)-Number(b.paid_amount)),0);
const balance = () => sum('income') - sum('expense') + savingTotal() - loanBalance();
const memberName = id => (state.members.find(m=>m.id===id)||{}).name || 'Гишүүн';

const render = {
home(){
  html(`
    <div class="hero"><div class="avatar">${(profile.name||'A')[0]}</div><div>Сайн байна уу</div><h1>${profile.name}</h1><div class="sub" style="color:#dfffe5">Энэ сарын үлдэгдэл</div><div class="balance">${fmt(balance())}</div></div>
    <div class="quick"><button class="bg-green" onclick="openTx('income')">↗<br>Орлого</button><button class="bg-red" onclick="openTx('expense')">↘<br>Зарлага</button><button class="bg-blue" onclick="openSaving()">🐷<br>Хуримтлал</button><button class="bg-purple" onclick="openLoan()">💳<br>Зээл</button></div>
    <div class="grid">
      <div class="card metric"><div class="label">Орлого</div><div class="value green">${fmt(sum('income'))}</div></div>
      <div class="card metric"><div class="label">Зарлага</div><div class="value red">${fmt(sum('expense'))}</div></div>
      <div class="card metric"><div class="label">Хуримтлал</div><div class="value blue">${fmt(savingTotal())}</div></div>
      <div class="card metric"><div class="label">Зээлийн үлдэгдэл</div><div class="value purple">${fmt(loanBalance())}</div></div>
    </div>
    <div class="card"><h2>Сүүлийн гүйлгээ</h2>${txList(state.tx.slice(0,8))}</div>
  `);
},
analytics(){
  html(`<div class="grid"><div class="card metric"><div class="label">Нийт орлого</div><div class="value green">${fmt(sum('income'))}</div></div><div class="card metric"><div class="label">Нийт зарлага</div><div class="value red">${fmt(sum('expense'))}</div></div><div class="card metric"><div class="label">Цэвэр үлдэгдэл</div><div class="value blue">${fmt(sum('income')-sum('expense'))}</div></div><div class="card metric"><div class="label">Зээл</div><div class="value purple">${fmt(loanBalance())}</div></div></div>
  <div class="grid2"><div class="card"><h2>Орлого болон Зарлага</h2><canvas id="bar"></canvas></div><div class="card"><h2>Зардлын ангилал</h2><canvas id="pie"></canvas></div><div class="card"><h2>Хуримтлалын өсөлт</h2><canvas id="line"></canvas></div><div class="card"><h2>Долоо хоногийн зарцуулалт</h2><canvas id="week"></canvas></div></div>`);
  drawCharts();
},
savings(){
  html(`<div class="card"><h2>Хуримтлал <button class="btn" style="float:right" onclick="openSaving()">+ Нэмэх</button></h2>${state.savings.map(s=>`<div class="row" onclick="savingDetail('${s.id}')" style="cursor:pointer"><div><div class="row-title">${s.name}</div><div class="sub">Зорилго: ${fmt(s.target_amount)} · ${s.months} сар · ${s.monthly_rate}% сарын хүү</div><div class="progress" style="margin-top:10px"><b style="width:${Math.min(100,Number(s.current_amount)/Number(s.target_amount)*100)}%"></b></div></div><div class="amount green">${fmt(s.current_amount)}</div></div>`).join('') || '<p class="sub">Хуримтлал байхгүй</p>'}</div>`);
},
loans(){
  html(`${state.loans.map(l=>loanCard(l)).join('') || '<div class="card"><h2>Зээл байхгүй</h2></div>'}<button class="btn full" onclick="openLoan()">+ Зээл нэмэх</button>`);
},
members(){
  html(`<div class="card"><h2>Гэр бүлийн гишүүд <button class="btn" style="float:right" onclick="openMember()">+ Урих</button></h2><p class="sub">Гишүүд өөрийн имэйлээр OTP / magic link авч нэвтрээд нэг family дата дээр ажиллана.</p>${state.members.map(m=>`<div class="row"><div class="icon">${(m.name||'A')[0]}</div><div style="flex:1"><div class="row-title">${m.name} <span class="sub" style="background:var(--green3);padding:4px 8px;border-radius:999px">${m.role}</span></div><div class="sub">${m.email}</div></div><b>🛡️</b></div>`).join('')}</div>`);
},
ai(){
  html(`<div class="card ai-box"><h2>🤖 AI зөвлөх</h2><div class="chat" id="chat"><div class="bubble bot">Сайн байна уу! Би таны гэр бүлийн санхүүгийн AI зөвлөх. Асуултаа доор бичээрэй.</div></div><div class="chat-input"><input id="aiInput" placeholder="Асуултаа энд бичнэ үү..." onkeydown="if(event.key==='Enter')askAI()"><button class="btn" onclick="askAI()">➤</button></div></div>`);
},
settings(){
  html(`<div class="card"><h2>Профайл</h2><label>Нэр</label><input id="setName" value="${profile.name||''}"><label>Имэйл</label><input value="${profile.email}" disabled><button class="btn" onclick="saveProfile()">Хадгалах</button></div><div class="card"><h2 class="red">Өгөгдөл удирдлага</h2><button class="btn red full" onclick="clearDemo()">Туршилтын дата устгах</button></div>`);
}
};

function html(h){ $('page').innerHTML=h; }

function txList(arr){
  return arr.map(t=>`<div class="row"><div class="icon">${t.type==='income'?'💵':'🧾'}</div><div style="flex:1"><div class="row-title">${t.category}</div><div class="sub">${t.date} · ${t.note||''} · ${memberName(t.member_id)}</div></div><div class="amount ${t.type==='income'?'green':'red'}">${t.type==='income'?'+':'-'}${fmt(t.amount)}</div></div>`).join('') || '<p class="sub">Гүйлгээ байхгүй</p>';
}

function loanCard(l){
  const bal = Number(l.total_amount)-Number(l.paid_amount);
  const pct = Math.min(100, Number(l.paid_amount)/Number(l.total_amount)*100);
  return `<div class="loan-hero"><h2>${l.name}</h2><div class="sub" style="color:#f4e8ff">Эхэлсэн: ${l.start_date||'-'} · Дуусах: ${l.end_date||'-'}</div><div class="progress" style="margin:22px 0 8px"><b style="width:${pct}%"></b></div><div style="display:flex;justify-content:space-between"><b>Төлсөн ${pct.toFixed(1)}%</b><b>Үлдсэн ${(100-pct).toFixed(1)}%</b></div></div>
  <div class="grid"><div class="card metric"><div class="label">Нийт зээл</div><div class="value">${fmt(l.total_amount)}</div></div><div class="card metric"><div class="label">Үлдэгдэл</div><div class="value red">${fmt(bal)}</div></div><div class="card metric"><div class="label">Төлсөн дүн</div><div class="value green">${fmt(l.paid_amount)}</div></div><div class="card metric"><div class="label">Сарын төлбөр</div><div class="value green">${fmt(l.monthly_payment)}</div></div></div>
  <div class="card"><h2>↗ Хүүгийн дэлгэрэнгүй</h2><div class="row"><span>Жилийн хүүгийн хувь</span><b>${l.annual_rate}%</b></div><div class="row"><span>Сарын хүүгийн хувь</span><b>${(Number(l.annual_rate)/12).toFixed(3)}%</b></div><div class="row"><span>Энэ сарын хүү</span><b class="red">${fmt(bal*(Number(l.annual_rate)/12/100))}</b></div><div class="row"><span>Дуусах хугацаа</span><b>${l.remaining_months} сар</b></div></div>`;
}

function cats(type){ return type==='income' ? ['Цалин','Бизнес','Бэлэг','Бусад'] : ['Хоол хүнс','Байр/Түрээс','Унаа','Эрүүл мэнд','Боловсрол','Хүүхэд','Дэлгүүр','Цахилгаан','Интернет','Бусад']; }
function pickCat(el){ document.querySelectorAll('.cat').forEach(c=>c.classList.remove('active')); el.classList.add('active'); }

function openTx(type){
  modal(`<div class="sheet-head ${type==='income'?'bg-green':'bg-red'}"><button class="close" onclick="closeM()">×</button><h2>${type==='income'?'Орлого':'Зарлага'} нэмэх</h2><h1 id="preview">0₮</h1></div><div class="sheet-body"><label>Дүн (₮)</label><input id="amt" type="number" oninput="preview.textContent=fmt(this.value)" placeholder="0"><label>Ангилал</label><div class="catgrid">${cats(type).map((c,i)=>`<div class="cat ${i===0?'active':''}" onclick="pickCat(this)">${c}</div>`).join('')}</div><div class="form2"><div><label>Огноо</label><input id="date" type="date" value="${today()}"></div><div><label>Гишүүн</label><select id="member">${state.members.map(m=>`<option value="${m.id}">${m.name}</option>`).join('')}</select></div></div><label>Тайлбар</label><input id="note" placeholder="Тайлбар"><button class="btn full ${type==='expense'?'red':''}" onclick="addTx('${type}')">Хадгалах</button></div>`);
}
async function addTx(type){
  const row={family_id:profile.family_id,member_id:$('member').value,type,amount:+$('amt').value,category:document.querySelector('.cat.active').textContent,date:$('date').value,note:$('note').value};
  const {error}=await sb.from('transactions').insert(row);
  if(error) return toast(error.message);
  closeM(); await loadAll(); render[state.page]();
}

function openSaving(){
  modal(`<div class="sheet-head bg-blue"><button class="close" onclick="closeM()">×</button><h2>Хуримтлал нэмэх</h2></div><div class="sheet-body"><label>Нэр</label><input id="sname" placeholder="Жишээ: Аялал, фонд"><label>Зорилтот дүн</label><input id="starget" type="number" placeholder="5000000"><label>Одоогийн дүн</label><input id="scurrent" type="number" value="0"><label>% Сарын хүү</label><select id="srate"><option>1.2</option><option>1.4</option><option>1.6</option><option>1.8</option><option>2</option></select><label>Хадгалах хугацаа</label><select id="smonths"><option value="1">1 сар</option><option value="3">3 сар</option><option value="6">6 сар</option><option value="12">1 жил</option><option value="24">2 жил</option><option value="36">3 жил</option></select><label>Сар бүрийн мэдэгдлийн өдөр</label><input id="sday" type="number" value="1" min="1" max="31"><button class="btn full" onclick="addSaving()">Хадгалах</button></div>`);
}
async function addSaving(){
  const row={family_id:profile.family_id,name:$('sname').value,target_amount:+$('starget').value,current_amount:+$('scurrent').value,monthly_rate:+$('srate').value,months:+$('smonths').value,reminder_day:+$('sday').value};
  const {error}=await sb.from('savings').insert(row);
  if(error) return toast(error.message);
  closeM(); await loadAll(); render.savings();
}
function savingDetail(id){
  const s=state.savings.find(x=>x.id===id); if(!s) return;
  const pct=Math.min(100,Number(s.current_amount)/Number(s.target_amount)*100);
  modal(`<div class="sheet-head bg-blue"><button class="close" onclick="closeM()">×</button><h2>${s.name}</h2><p>Хуримтлалын дэлгэрэнгүй</p></div><div class="sheet-body"><div class="grid2"><div class="card metric"><div class="label">Зорилтот дүн</div><div class="value blue">${fmt(s.target_amount)}</div></div><div class="card metric"><div class="label">Одоогийн дүн</div><div class="value green">${fmt(s.current_amount)}</div></div></div><label>Явц</label><div class="progress"><b style="width:${pct}%"></b></div><div class="row"><span>Биелэлт</span><b>${pct.toFixed(1)}%</b></div><div class="row"><span>Сарын хүү</span><b>${s.monthly_rate}%</b></div><div class="row"><span>Хугацаа</span><b>${s.months} сар</b></div><div class="row"><span>Сануулгын өдөр</span><b>${s.reminder_day}</b></div></div>`);
}

function openLoan(){
  modal(`<div class="sheet-head bg-purple"><button class="close" onclick="closeM()">×</button><h2>Зээл нэмэх</h2></div><div class="sheet-body"><label>Зээлийн нэр</label><input id="lname" placeholder="Орон сууцны зээл"><label>Нийт дүн</label><input id="ltotal" type="number"><label>Төлсөн дүн</label><input id="lpaid" type="number" value="0"><label>Сарын төлбөр</label><input id="lmonthly" type="number"><label>Жилийн хүү (%)</label><input id="lrate" type="number" value="12"><label>Үлдсэн сар</label><input id="lmonths" type="number" value="12"><div class="form2"><div><label>Эхэлсэн</label><input id="lstart" type="date" value="${today()}"></div><div><label>Дуусах</label><input id="lend" type="date"></div></div><button class="btn full" onclick="addLoan()">Хадгалах</button></div>`);
}
async function addLoan(){
  const row={family_id:profile.family_id,name:$('lname').value,total_amount:+$('ltotal').value,paid_amount:+$('lpaid').value,monthly_payment:+$('lmonthly').value,annual_rate:+$('lrate').value,remaining_months:+$('lmonths').value,start_date:$('lstart').value,end_date:$('lend').value||null};
  const {error}=await sb.from('loans').insert(row);
  if(error) return toast(error.message);
  closeM(); await loadAll(); render.loans();
}

function openMember(){
  modal(`<div class="sheet-head bg-green"><button class="close" onclick="closeM()">×</button><h2>Гишүүн урих</h2><p>Имэйл рүү OTP / magic link явуулна.</p></div><div class="sheet-body"><label>Нэр</label><input id="mname" placeholder="Гишүүний нэр"><label>Имэйл</label><input id="memail" placeholder="email@gmail.com"><label>Үүрэг</label><select id="mrole"><option>member</option><option>parent</option><option>child</option></select><button class="btn full" onclick="inviteMember()">Урих</button></div>`);
}
async function inviteMember(){
  const email=$('memail').value.trim(); const name=$('mname').value; const role=$('mrole').value;
  const {error:e1}=await sb.from('invites').insert({family_id:profile.family_id,email,name,role,invited_by:profile.id});
  if(e1) return toast(e1.message);
  const {error:e2}=await sb.auth.signInWithOtp({email, options:{emailRedirectTo:location.origin, data:{name}}});
  if(e2) return toast(e2.message);
  closeM(); toast('Урилга болон OTP имэйл рүү илгээгдлээ');
}

async function saveProfile(){
  const {error}=await sb.from('profiles').update({name:$('setName').value}).eq('id',profile.id);
  if(error) return toast(error.message);
  await loadAll(); profile.name=$('setName').value; toast('Хадгаллаа');
}

async function clearDemo(){
  if(!confirm('Энэ family-ийн бүх гүйлгээ, зээл, хуримтлалыг устгах уу?')) return;
  await sb.from('transactions').delete().eq('family_id',profile.family_id);
  await sb.from('savings').delete().eq('family_id',profile.family_id);
  await sb.from('loans').delete().eq('family_id',profile.family_id);
  await loadAll(); page('home');
}

function askAI(){
  const input=$('aiInput'); const q=input.value.trim(); if(!q) return;
  const chat=$('chat'); chat.innerHTML += `<div class="bubble me">${q}</div>`; input.value='';
  const answer = localAI(q);
  chat.innerHTML += `<div class="bubble bot">${answer}</div>`;
  chat.scrollTop = chat.scrollHeight;
}
function localAI(q){
  const exp=sum('expense'), inc=sum('income'), sav=savingTotal(), loan=loanBalance();
  if(q.includes('зээл')) return `Танай гэр бүлийн нийт зээлийн үлдэгдэл ${fmt(loan)} байна. Сарын орлогын 10–20%-ийг нэмэлт төлөлтөд ашиглавал зээлийн хугацаа богиносож, нийт хүү буурна.`;
  if(q.includes('хуримт')) return `Одоогийн хуримтлал ${fmt(sav)} байна. Орлого орсон өдөр шууд ${fmt(inc*0.15)} орчим буюу 15%-ийг автоматаар хуримтлуулахыг зөвлөж байна.`;
  if(q.includes('төсөв')) return `Санал болгож буй төсөв: хэрэгцээ 50% (${fmt(inc*.5)}), хүсэл 30% (${fmt(inc*.3)}), хуримтлал/зээл 20% (${fmt(inc*.2)}).`;
  return `Энэ сарын орлого ${fmt(inc)}, зарлага ${fmt(exp)} байна. Зарлагыг 10% бууруулбал ${fmt(exp*.1)} хэмнэх боломжтой.`;
}

function drawCharts(){
  state.charts.forEach(c=>c.destroy?.()); state.charts=[];
  setTimeout(()=>{
    const inc=[0,0,0,0,0,0], exp=[0,0,0,0,0,0];
    state.tx.forEach(x=>{ const m=new Date(x.date).getMonth()%6; (x.type==='income'?inc:exp)[m]+=Number(x.amount); });
    state.charts.push(new Chart($('bar'),{type:'bar',data:{labels:['11','12','01','02','03','04'],datasets:[{label:'Орлого',data:inc,backgroundColor:'#20c45a'},{label:'Зарлага',data:exp,backgroundColor:'#ef4444'}]}}));
    const cats={}; state.tx.filter(x=>x.type==='expense').forEach(x=>cats[x.category]=(cats[x.category]||0)+Number(x.amount));
    state.charts.push(new Chart($('pie'),{type:'doughnut',data:{labels:Object.keys(cats),datasets:[{data:Object.values(cats),backgroundColor:['#20c45a','#ef4444','#8b5cf6','#f59e0b','#4b82df','#06b6d4']}]}}));
    state.charts.push(new Chart($('line'),{type:'line',data:{labels:['1 сар','2 сар','3 сар','4 сар','5 сар','6 сар'],datasets:[{label:'Хуримтлал',data:[0,800000,1600000,2500000,3500000,savingTotal()],borderColor:'#4b82df',tension:.35}]}}));
    state.charts.push(new Chart($('week'),{type:'bar',data:{labels:['Да','Мя','Лх','Пү','Ба','Бя','Ня'],datasets:[{label:'Зарцуулалт',data:[73000,82000,92000,0,64000,0,60000],backgroundColor:'#8b5cf6'}]}}));
  },50);
}

sb.auth.onAuthStateChange((_event, session)=>{ if(session?.user && !authUser) boot(); });
boot();
