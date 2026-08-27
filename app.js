
const DB_NAME = "fitlog-db";
const DB_VERSION = 1;
let db;

const state = {
  goals: {startWeight:null,targetWeight:null,calories:null,protein:null,steps:null,water:null,sleep:null},
  supplements: [],
  weights: [],
  daily: [],
  supplementLogs: []
};

const $ = (id) => document.getElementById(id);
const todayISO = (d=new Date()) => {
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
};
const fmtDate = (iso) => new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(iso+'T12:00:00'));
const num = v => (v === "" || v === null || v === undefined) ? null : Number(v);
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

function toast(msg){
  const el=$("toast"); el.textContent=msg; el.classList.add("show");
  setTimeout(()=>el.classList.remove("show"),1800);
}

function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const d=req.result;
      if(!d.objectStoreNames.contains("settings")) d.createObjectStore("settings",{keyPath:"key"});
      if(!d.objectStoreNames.contains("weights")) d.createObjectStore("weights",{keyPath:"date"});
      if(!d.objectStoreNames.contains("daily")) d.createObjectStore("daily",{keyPath:"date"});
      if(!d.objectStoreNames.contains("supplements")) d.createObjectStore("supplements",{keyPath:"id"});
      if(!d.objectStoreNames.contains("supplementLogs")) d.createObjectStore("supplementLogs",{keyPath:"id"});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
function store(name,mode="readonly"){return db.transaction(name,mode).objectStore(name)}
function getAll(name){return new Promise((res,rej)=>{const r=store(name).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function getOne(name,key){return new Promise((res,rej)=>{const r=store(name).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function put(name,val){return new Promise((res,rej)=>{const r=store(name,"readwrite").put(val);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function del(name,key){return new Promise((res,rej)=>{const r=store(name,"readwrite").delete(key);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function clearStore(name){return new Promise((res,rej)=>{const r=store(name,"readwrite").clear();r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}

async function loadState(){
  const goals = await getOne("settings","goals");
  if(goals?.value) state.goals = {...state.goals,...goals.value};
  state.supplements = await getAll("supplements");
  state.weights = (await getAll("weights")).sort((a,b)=>a.date.localeCompare(b.date));
  state.daily = (await getAll("daily")).sort((a,b)=>a.date.localeCompare(b.date));
  state.supplementLogs = await getAll("supplementLogs");
}
async function refresh(){
  await loadState();
  renderAll();
}

function renderAll(){
  $("todayDate").textContent = fmtDate(todayISO());
  renderDashboard();
  renderTodayForm();
  renderSuppToday();
  renderWeight();
  renderSupplements();
  renderHistory();
  renderGoals();
}

function latestWeight(){
  return state.weights.length ? state.weights[state.weights.length-1] : null;
}
function movingAvg(days){
  const cutoff=new Date(); cutoff.setDate(cutoff.getDate()-days+1);
  const vals=state.weights.filter(w=>new Date(w.date+"T12:00:00")>=cutoff).map(w=>w.kg);
  return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
}
function renderDashboard(){
  const lw=latestWeight();
  $("dashWeight").textContent = lw ? `${lw.kg.toFixed(1)} kg` : "–";
  const avg7=movingAvg(7), avg30=movingAvg(30);
  if(lw && state.weights.length>1){
    const prev=state.weights[state.weights.length-2].kg;
    const d=lw.kg-prev;
    $("dashWeightTrend").textContent=`${d>=0?"+":""}${d.toFixed(1)} kg zum letzten Eintrag · Ø7 ${avg7?.toFixed(1) ?? "–"} kg`;
  } else $("dashWeightTrend").textContent="Noch keine ausreichenden Daten";

  let p=null;
  const s=state.goals.startWeight, t=state.goals.targetWeight;
  if(lw && s!=null && t!=null && s!==t){
    p=clamp(((s-lw.kg)/(s-t))*100,0,100);
  }
  const ring=$("weightProgressRing");
  const deg=p==null?0:(p/100)*360;
  ring.style.background=`conic-gradient(var(--accent) ${deg}deg,var(--line) ${deg}deg)`;
  $("weightProgressText").textContent=p==null?"–":`${Math.round(p)}%`;

  const d=state.daily.find(x=>x.date===todayISO())||{};
  const metrics=[
    ["Kalorien",d.calories,"kcal",state.goals.calories],
    ["Protein",d.protein,"g",state.goals.protein],
    ["Schritte",d.steps,"",state.goals.steps],
    ["Wasser",d.water,"L",state.goals.water],
    ["Schlaf",d.sleep,"h",state.goals.sleep],
    ["Training",d.workout===true?"Ja":d.workout===false?"Nein":"–","",null]
  ];
  $("todayMetricsGrid").innerHTML=metrics.map(([label,val,unit,goal])=>`
    <div class="metric-card">
      <div class="label">${label}</div>
      <div class="value">${val==null?"–":val}${unit?` <span style="font-size:13px">${unit}</span>`:""}</div>
      <div class="goal">${goal!=null?`Ziel ${goal} ${unit}`:""}</div>
    </div>`).join("");
}
function renderTodayForm(){
  const d=state.daily.find(x=>x.date===todayISO())||{};
  $("todayCalories").value=d.calories??"";
  $("todayProtein").value=d.protein??"";
  $("todaySteps").value=d.steps??"";
  $("todayWater").value=d.water??"";
  $("todaySleep").value=d.sleep??"";
  $("todayWorkout").checked=!!d.workout;
  $("todayNote").value=d.note??"";
}
async function saveToday(){
  const obj={date:todayISO(),calories:num($("todayCalories").value),protein:num($("todayProtein").value),
    steps:num($("todaySteps").value),water:num($("todayWater").value),sleep:num($("todaySleep").value),
    workout:$("todayWorkout").checked,note:$("todayNote").value.trim()};
  await put("daily",obj); toast("Tag gespeichert"); await refresh();
}

function renderSuppToday(){
  const wrap=$("suppTodayList");
  if(!state.supplements.length){wrap.className="stack-list empty-state";wrap.innerHTML="Noch keine Supplements angelegt.";$("suppTodaySummary").textContent="0/0";return}
  wrap.className="stack-list";
  const today=todayISO();
  const logs=state.supplementLogs.filter(l=>l.date===today);
  const daily=state.daily.find(x=>x.date===today)||{};
  const visible=state.supplements.filter(s=>s.schedule!=="training" || daily.workout);
  const taken=visible.filter(s=>logs.some(l=>l.supplementId===s.id && l.taken)).length;
  $("suppTodaySummary").textContent=`${taken}/${visible.length}`;
  wrap.innerHTML=visible.map(s=>{
    const log=logs.find(l=>l.supplementId===s.id);
    return `<div class="list-row">
      <label class="supp-check">
        <input type="checkbox" data-supp-check="${s.id}" ${log?.taken?"checked":""}>
        <span><div class="list-title">${escapeHtml(s.name)}</div><div class="list-sub">${s.dose} ${s.unit} · ${scheduleText(s.schedule)}</div></span>
      </label>
      <input class="amount-input" type="number" step="0.1" data-supp-amount="${s.id}" value="${log?.amount ?? s.dose}" aria-label="Menge">
    </div>`;
  }).join("");
  wrap.querySelectorAll("[data-supp-check]").forEach(ch=>ch.addEventListener("change",saveSuppToday));
  wrap.querySelectorAll("[data-supp-amount]").forEach(inp=>inp.addEventListener("change",saveSuppToday));
}
async function saveSuppToday(e){
  const id=e.target.dataset.suppCheck||e.target.dataset.suppAmount;
  const checked=document.querySelector(`[data-supp-check="${id}"]`);
  const amount=document.querySelector(`[data-supp-amount="${id}"]`);
  const log={id:`${todayISO()}_${id}`,date:todayISO(),supplementId:id,taken:checked.checked,amount:num(amount.value)};
  await put("supplementLogs",log); await refresh();
}
function scheduleText(v){return v==="daily"?"Täglich":v==="training"?"Trainingstage":"Nach Bedarf"}

async function saveWeight(){
  const date=$("weightDate").value, kg=num($("weightKg").value);
  if(!date||kg==null||kg<=0){toast("Datum und Gewicht eingeben");return}
  await put("weights",{date,kg,bodyfat:num($("weightBodyfat").value),note:$("weightNote").value.trim()});
  $("weightKg").value="";$("weightBodyfat").value="";$("weightNote").value="";
  toast("Gewicht gespeichert"); await refresh();
}
function renderWeight(){
  $("weightDate").value ||= todayISO();
  const days=$("weightRange").value;
  let arr=[...state.weights];
  if(days!=="all"){
    const cutoff=new Date();cutoff.setDate(cutoff.getDate()-Number(days)+1);
    arr=arr.filter(w=>new Date(w.date+"T12:00:00")>=cutoff);
  }
  drawLineChart($("weightChart"),arr.map(x=>({date:x.date,value:x.kg})), "kg");
  const stats=$("weightStats");
  if(arr.length){
    const vals=arr.map(x=>x.kg), first=vals[0], last=vals.at(-1);
    const avg7=movingAvg(7), avg30=movingAvg(30);
    stats.innerHTML=
      stat("Start",`${first.toFixed(1)} kg`)+
      stat("Aktuell",`${last.toFixed(1)} kg`)+
      stat("Änderung",`${last-first>=0?"+":""}${(last-first).toFixed(1)} kg`)+
      stat("Ø 7 Tage",avg7!=null?`${avg7.toFixed(1)} kg`:"–")+
      stat("Ø 30 Tage",avg30!=null?`${avg30.toFixed(1)} kg`:"–");
  } else stats.innerHTML=stat("Start","–")+stat("Aktuell","–")+stat("Änderung","–")+stat("Ø 7 Tage","–")+stat("Ø 30 Tage","–");
  $("weightList").innerHTML=state.weights.length?[...state.weights].reverse().slice(0,30).map(w=>`
    <div class="list-row"><div class="list-main"><div class="list-title">${w.kg.toFixed(1)} kg ${w.bodyfat!=null?`· ${w.bodyfat}% KF`:""}</div>
    <div class="list-sub">${fmtDate(w.date)}${w.note?` · ${escapeHtml(w.note)}`:""}</div></div>
    <button class="mini-btn delete-btn" data-del-weight="${w.date}">Löschen</button></div>`).join(""):"<div class='empty-state'>Noch keine Gewichtsdaten.</div>";
  document.querySelectorAll("[data-del-weight]").forEach(b=>b.onclick=async()=>{await del("weights",b.dataset.delWeight);await refresh()});
}
function stat(k,v){return `<div class="stat-box"><div class="k">${k}</div><div class="v">${v}</div></div>`}

async function addSupplement(){
  const name=$("suppName").value.trim(), dose=num($("suppDose").value), unit=$("suppUnit").value, schedule=$("suppSchedule").value;
  if(!name||dose==null){toast("Name und Dosis eingeben");return}
  const id=crypto.randomUUID?crypto.randomUUID():String(Date.now());
  await put("supplements",{id,name,dose,unit,schedule});
  $("suppName").value="";$("suppDose").value="";
  toast("Supplement hinzugefügt");await refresh();
}
function renderSupplements(){
  $("suppCount").textContent=state.supplements.length;
  $("suppList").innerHTML=state.supplements.length?state.supplements.map(s=>`
    <div class="list-row"><div class="list-main"><div class="list-title">${escapeHtml(s.name)}</div>
    <div class="list-sub">${s.dose} ${s.unit} · ${scheduleText(s.schedule)}</div></div>
    <button class="mini-btn delete-btn" data-del-supp="${s.id}">Löschen</button></div>`).join(""):"<div class='empty-state'>Noch keine Supplements.</div>";
  document.querySelectorAll("[data-del-supp]").forEach(b=>b.onclick=async()=>{
    await del("supplements",b.dataset.delSupp);
    const logs=state.supplementLogs.filter(l=>l.supplementId===b.dataset.delSupp);
    for(const l of logs) await del("supplementLogs",l.id);
    await refresh();
  });

  const now=new Date(), cutoff=new Date();cutoff.setDate(now.getDate()-29);
  $("suppComplianceList").innerHTML=state.supplements.length?state.supplements.map(s=>{
    const logs=state.supplementLogs.filter(l=>l.supplementId===s.id && new Date(l.date+"T12:00:00")>=cutoff && l.taken);
    const pct=Math.round((logs.length/30)*100);
    return `<div class="list-row"><div style="width:100%"><div class="card-title-row"><div class="list-title">${escapeHtml(s.name)}</div><div class="list-sub">${logs.length}/30 Tage · ${pct}%</div></div>
      <div class="progress-line"><span style="width:${clamp(pct,0,100)}%"></span></div></div></div>`;
  }).join(""):"<div class='empty-state'>Noch keine Supplements.</div>";
}

function renderHistory(){
  const metric=$("historyMetric").value;
  const arr=[...state.daily].slice(-30).map(d=>({date:d.date,value:d[metric]})).filter(x=>x.value!=null);
  const unit={calories:"kcal",protein:"g",steps:"",water:"L",sleep:"h"}[metric];
  drawLineChart($("historyChart"),arr,unit);
  const last30=state.daily.filter(d=>new Date(d.date+"T12:00:00")>=new Date(Date.now()-29*86400000));
  const avg=(key)=>{const vals=last30.map(d=>d[key]).filter(v=>v!=null);return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null}
  $("historySummary").innerHTML=[
    ["Ø Kalorien",avg("calories")?.toFixed(0)??"–"],
    ["Ø Protein",avg("protein")?.toFixed(0)?`${avg("protein").toFixed(0)} g`:"–"],
    ["Ø Schritte",avg("steps")?.toFixed(0)??"–"],
    ["Ø Wasser",avg("water")?.toFixed(1)?`${avg("water").toFixed(1)} L`:"–"],
    ["Ø Schlaf",avg("sleep")?.toFixed(1)?`${avg("sleep").toFixed(1)} h`:"–"],
    ["Trainings",String(last30.filter(d=>d.workout).length)]
  ].map(x=>stat(x[0],x[1])).join("");
  $("dailyHistoryList").innerHTML=state.daily.length?[...state.daily].reverse().slice(0,30).map(d=>`
    <div class="list-row"><div class="list-main"><div class="list-title">${fmtDate(d.date)} ${d.workout?"· Training":""}</div>
    <div class="list-sub">${d.calories??"–"} kcal · ${d.protein??"–"} g Protein · ${d.steps??"–"} Schritte · ${d.water??"–"} L · ${d.sleep??"–"} h</div></div>
    <button class="mini-btn delete-btn" data-del-daily="${d.date}">Löschen</button></div>`).join(""):"<div class='empty-state'>Noch keine Tagesdaten.</div>";
  document.querySelectorAll("[data-del-daily]").forEach(b=>b.onclick=async()=>{await del("daily",b.dataset.delDaily);await refresh()});
}

function renderGoals(){
  const g=state.goals;
  $("goalStartWeight").value=g.startWeight??"";
  $("goalTargetWeight").value=g.targetWeight??"";
  $("goalCalories").value=g.calories??"";
  $("goalProtein").value=g.protein??"";
  $("goalSteps").value=g.steps??"";
  $("goalWater").value=g.water??"";
  $("goalSleep").value=g.sleep??"";
}
async function saveGoals(){
  const value={startWeight:num($("goalStartWeight").value),targetWeight:num($("goalTargetWeight").value),
    calories:num($("goalCalories").value),protein:num($("goalProtein").value),steps:num($("goalSteps").value),
    water:num($("goalWater").value),sleep:num($("goalSleep").value)};
  await put("settings",{key:"goals",value});toast("Ziele gespeichert");await refresh();
}

function drawLineChart(canvas,data,unit=""){
  const rect=canvas.getBoundingClientRect(), dpr=window.devicePixelRatio||1;
  const w=Math.max(300,rect.width), h=220;
  canvas.width=w*dpr; canvas.height=h*dpr;
  const ctx=canvas.getContext("2d");ctx.scale(dpr,dpr);
  const styles=getComputedStyle(document.documentElement), text=styles.getPropertyValue("--muted").trim(), line=styles.getPropertyValue("--line").trim(), accent=styles.getPropertyValue("--text").trim();
  ctx.clearRect(0,0,w,h);
  if(!data.length){ctx.fillStyle=text;ctx.font="13px -apple-system";ctx.fillText("Noch keine Daten",16,40);return}
  const vals=data.map(x=>Number(x.value)), min=Math.min(...vals), max=Math.max(...vals), padY=(max-min||1)*.15;
  const lo=min-padY, hi=max+padY, left=38,right=12,top=14,bottom=28, cw=w-left-right,ch=h-top-bottom;
  ctx.strokeStyle=line;ctx.lineWidth=1;
  for(let i=0;i<4;i++){const y=top+(ch/3)*i;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(w-right,y);ctx.stroke()}
  ctx.fillStyle=text;ctx.font="10px -apple-system";
  for(let i=0;i<4;i++){const v=hi-((hi-lo)/3)*i;ctx.fillText(`${formatChart(v)}${unit?" "+unit:""}`,2,top+(ch/3)*i+3)}
  ctx.strokeStyle=accent;ctx.lineWidth=2.5;ctx.lineJoin="round";ctx.lineCap="round";ctx.beginPath();
  data.forEach((p,i)=>{const x=left+(data.length===1?cw/2:(cw*i/(data.length-1)));const y=top+ch-(p.value-lo)/(hi-lo)*ch;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});
  ctx.stroke();
  const points=[0,Math.floor((data.length-1)/2),data.length-1].filter((v,i,a)=>a.indexOf(v)===i);
  points.forEach(i=>{const x=left+(data.length===1?cw/2:(cw*i/(data.length-1)));ctx.fillStyle=text;ctx.fillText(data[i].date.slice(5),Math.max(left-6,Math.min(x-14,w-40)),h-8)});
}
function formatChart(v){return Math.abs(v)>=100?Math.round(v):v.toFixed(1)}

function escapeHtml(s=""){return s.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

function exportFile(name,content,type){
  const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
function exportBackup(){
  const payload={version:1,exportedAt:new Date().toISOString(),data:{goals:state.goals,supplements:state.supplements,weights:state.weights,daily:state.daily,supplementLogs:state.supplementLogs}};
  exportFile(`fitlog-backup-${todayISO()}.json`,JSON.stringify(payload,null,2),"application/json");toast("Backup exportiert")
}
async function importBackup(file){
  try{
    const raw=JSON.parse(await file.text());const d=raw.data||raw;
    for(const n of ["weights","daily","supplements","supplementLogs","settings"]) await clearStore(n);
    if(d.goals) await put("settings",{key:"goals",value:d.goals});
    for(const n of ["weights","daily","supplements","supplementLogs"]) for(const x of (d[n]||[])) await put(n,x);
    toast("Backup importiert");await refresh();
  }catch(e){console.error(e);toast("Backup konnte nicht gelesen werden")}
}
function csvEscape(v){const s=String(v??"");return `"${s.replaceAll('"','""')}"`}
function exportCSV(){
  const rows=[["Typ","Datum","Name","Wert1","Einheit/Wert2","Wert3","Notiz"]];
  state.weights.forEach(w=>rows.push(["Gewicht",w.date,"",w.kg,"kg",w.bodyfat??"",w.note??""]));
  state.daily.forEach(d=>rows.push(["Tag",d.date,"",d.calories??"",`${d.protein??""} g Protein`,`${d.steps??""} Schritte | ${d.water??""} L | ${d.sleep??""} h | Training ${d.workout?"Ja":"Nein"}`,d.note??""]));
  state.supplementLogs.forEach(l=>{const s=state.supplements.find(x=>x.id===l.supplementId);rows.push(["Supplement",l.date,s?.name??l.supplementId,l.amount??"",s?.unit??"",l.taken?"genommen":"nicht genommen",""])});
  const csv="\ufeff"+rows.map(r=>r.map(csvEscape).join(";")).join("\n");
  exportFile(`fitlog-export-${todayISO()}.csv`,csv,"text/csv;charset=utf-8");toast("CSV exportiert")
}

async function clearAll(){
  if(!confirm("Wirklich alle lokalen FitLog-Daten löschen?")) return;
  for(const n of ["weights","daily","supplements","supplementLogs","settings"]) await clearStore(n);
  toast("Alle Daten gelöscht");await refresh();
}

function bind(){
  document.querySelectorAll(".nav-btn").forEach(btn=>btn.onclick=()=>{
    document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b===btn));
    document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.dataset.view===btn.dataset.target));
    $("pageTitle").textContent={today:"Heute",weight:"Gewicht",supplements:"Supplements",history:"Verlauf",settings:"Ziele & Daten"}[btn.dataset.target];
    window.scrollTo({top:0,behavior:"smooth"});
    setTimeout(()=>renderAll(),60);
  });
  $("saveTodayBtn").onclick=saveToday;$("saveWeightBtn").onclick=saveWeight;$("addSuppBtn").onclick=addSupplement;
  $("saveGoalsBtn").onclick=saveGoals;$("weightRange").onchange=renderWeight;$("historyMetric").onchange=renderHistory;
  $("exportBackupBtn").onclick=exportBackup;$("exportCsvBtn").onclick=exportCSV;$("clearDataBtn").onclick=clearAll;
  $("importBackupInput").onchange=e=>e.target.files[0]&&importBackup(e.target.files[0]);
  $("themeBtn").onclick=()=>{
    const root=document.documentElement, next=root.dataset.theme==="dark"?"light":"dark";root.dataset.theme=next;localStorage.setItem("fitlog-theme",next);renderAll()
  };
  window.addEventListener("resize",()=>{renderWeight();renderHistory()});
}

async function init(){
  document.documentElement.dataset.theme=localStorage.getItem("fitlog-theme")||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");
  db=await openDB();bind();await refresh();
  if("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js").catch(console.error);
}
init();
