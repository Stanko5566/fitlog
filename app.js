
const DB_NAME = "fitlog-db";
const DB_VERSION = 3;
let db;

const state = {
  goals: {startWeight:null,targetWeight:null,calories:null,protein:null,steps:null,water:null,sleep:null},
  supplements: [], weights: [], daily: [], supplementLogs: [],
  exercises: [], workouts: [], workoutTemplates: []
};

let workoutDraft = {date:null,name:"",note:"",exercises:[]};
let strengthMetric = "e1rm";
let restTimerInterval = null;
let restTimerRemaining = 0;
let restTimerEnd = Number(localStorage.getItem("fitlog-rest-end")||0);
let restTimerEndsAt = null;

const $ = (id) => document.getElementById(id);
const todayISO = (d=new Date()) => {
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
};
const fmtDate = (iso) => new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(iso+'T12:00:00'));
const num = v => (v === "" || v === null || v === undefined) ? null : Number(v);
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

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
      if(!d.objectStoreNames.contains("exercises")) d.createObjectStore("exercises",{keyPath:"id"});
      if(!d.objectStoreNames.contains("workouts")) d.createObjectStore("workouts",{keyPath:"id"});
      if(!d.objectStoreNames.contains("workoutTemplates")) d.createObjectStore("workoutTemplates",{keyPath:"id"});
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
  state.goals = {startWeight:null,targetWeight:null,calories:null,protein:null,steps:null,water:null,sleep:null,...(goals?.value||{})};
  state.supplements = await getAll("supplements");
  state.weights = (await getAll("weights")).sort((a,b)=>a.date.localeCompare(b.date));
  state.daily = (await getAll("daily")).sort((a,b)=>a.date.localeCompare(b.date));
  state.supplementLogs = await getAll("supplementLogs");
  state.exercises = (await getAll("exercises")).sort((a,b)=>a.name.localeCompare(b.name,"de"));
  state.workouts = (await getAll("workouts")).sort((a,b)=>`${a.date}${a.createdAt||""}`.localeCompare(`${b.date}${b.createdAt||""}`));
  state.workoutTemplates = (await getAll("workoutTemplates")).sort((a,b)=>a.name.localeCompare(b.name,"de"));
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
  renderTraining();
  renderSupplements();
  renderHistory();
  renderGoals();
}

function latestWeight(){return state.weights.length ? state.weights[state.weights.length-1] : null}
function movingAvg(days){
  const cutoff=new Date(); cutoff.setDate(cutoff.getDate()-days+1);
  const vals=state.weights.filter(w=>new Date(w.date+"T12:00:00")>=cutoff).map(w=>w.kg);
  return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
}
function workoutsOnDate(date){return state.workouts.filter(w=>w.date===date)}
function workoutSetCount(workout){return workout.exercises.reduce((n,e)=>n+(e.sets?.length||0),0)}
function workoutVolume(workout){
  return workout.exercises.reduce((total,e)=>total+(e.sets||[]).reduce((s,set)=>s+(Number(set.weight)||0)*(Number(set.reps)||0),0),0);
}

function renderDashboard(){
  const lw=latestWeight();
  $("dashWeight").textContent = lw ? `${lw.kg.toFixed(1)} kg` : "–";
  const avg7=movingAvg(7);
  if(lw && state.weights.length>1){
    const prev=state.weights[state.weights.length-2].kg, d=lw.kg-prev;
    $("dashWeightTrend").textContent=`${d>=0?"+":""}${d.toFixed(1)} kg zum letzten Eintrag · Ø7 ${avg7?.toFixed(1) ?? "–"} kg`;
  } else $("dashWeightTrend").textContent="Noch keine ausreichenden Daten";

  let p=null; const s=state.goals.startWeight, t=state.goals.targetWeight;
  if(lw && s!=null && t!=null && s!==t) p=clamp(((s-lw.kg)/(s-t))*100,0,100);
  const ring=$("weightProgressRing"), deg=p==null?0:(p/100)*360;
  ring.style.background=`conic-gradient(var(--accent) ${deg}deg,var(--line) ${deg}deg)`;
  $("weightProgressText").textContent=p==null?"–":`${Math.round(p)}%`;

  const d=state.daily.find(x=>x.date===todayISO())||{};
  const todayWorkouts=workoutsOnDate(todayISO());
  const trainingDone=todayWorkouts.length>0 || d.workout===true;
  const metrics=[
    ["Kalorien",d.calories,"kcal",state.goals.calories],["Protein",d.protein,"g",state.goals.protein],
    ["Schritte",d.steps,"",state.goals.steps],["Wasser",d.water,"L",state.goals.water],
    ["Schlaf",d.sleep,"h",state.goals.sleep],["Training",trainingDone?"Ja":"Nein","",null]
  ];
  $("todayMetricsGrid").innerHTML=metrics.map(([label,val,unit,goal])=>`
    <div class="metric-card"><div class="label">${label}</div>
    <div class="value">${val==null?"–":val}${unit?` <span style="font-size:13px">${unit}</span>`:""}</div>
    <div class="goal">${goal!=null?`Ziel ${goal} ${unit}`:""}</div></div>`).join("");

  if(todayWorkouts.length){
    const sets=todayWorkouts.reduce((n,w)=>n+workoutSetCount(w),0);
    const exercises=todayWorkouts.reduce((n,w)=>n+w.exercises.length,0);
    $("todayWorkoutBadge").textContent="Erledigt";
    $("todayWorkoutBadge").classList.add("success");
    $("todayWorkoutSummary").textContent=`${todayWorkouts.map(w=>w.name||"Workout").join(" · ")} · ${exercises} Übungen · ${sets} Sätze`;
  }else{
    $("todayWorkoutBadge").textContent=d.workout?"Manuell markiert":"Noch offen";
    $("todayWorkoutBadge").classList.toggle("success",!!d.workout);
    $("todayWorkoutSummary").textContent=d.workout?"Trainingstag wurde manuell markiert.":"Noch kein Workout gespeichert.";
  }
}

function renderTodayForm(){
  const d=state.daily.find(x=>x.date===todayISO())||{};
  $("todayCalories").value=d.calories??""; $("todayProtein").value=d.protein??"";
  $("todaySteps").value=d.steps??""; $("todayWater").value=d.water??"";
  $("todaySleep").value=d.sleep??""; $("todayWorkout").checked=!!d.workout || workoutsOnDate(todayISO()).length>0;
  $("todayNote").value=d.note??"";
}
async function saveToday(){
  const existing=state.daily.find(x=>x.date===todayISO());
  const obj={date:todayISO(),calories:num($("todayCalories").value),protein:num($("todayProtein").value),
    steps:num($("todaySteps").value),water:num($("todayWater").value),sleep:num($("todaySleep").value),
    workout:$("todayWorkout").checked || workoutsOnDate(todayISO()).length>0,note:$("todayNote").value.trim()};
  await put("daily",{...existing,...obj}); toast("Tag gespeichert"); await refresh();
}

/* Supplements */
function renderSuppToday(){
  const wrap=$("suppTodayList");
  if(!state.supplements.length){wrap.className="stack-list empty-state";wrap.innerHTML="Noch keine Supplements angelegt.";$("suppTodaySummary").textContent="0/0";return}
  wrap.className="stack-list";
  const today=todayISO(), logs=state.supplementLogs.filter(l=>l.date===today);
  const daily=state.daily.find(x=>x.date===today)||{};
  const isTraining=daily.workout || workoutsOnDate(today).length>0;
  const visible=state.supplements.filter(s=>s.schedule!=="training" || isTraining);
  const taken=visible.filter(s=>logs.some(l=>l.supplementId===s.id && l.taken)).length;
  $("suppTodaySummary").textContent=`${taken}/${visible.length}`;
  wrap.innerHTML=visible.map(s=>{
    const log=logs.find(l=>l.supplementId===s.id);
    return `<div class="list-row"><label class="supp-check">
      <input type="checkbox" data-supp-check="${s.id}" ${log?.taken?"checked":""}>
      <span><div class="list-title">${escapeHtml(s.name)}</div><div class="list-sub">${s.dose} ${s.unit} · ${scheduleText(s.schedule)}</div></span>
      </label><input class="amount-input" type="number" step="0.1" data-supp-amount="${s.id}" value="${log?.amount ?? s.dose}" aria-label="Menge"></div>`;
  }).join("");
  wrap.querySelectorAll("[data-supp-check]").forEach(ch=>ch.addEventListener("change",saveSuppToday));
  wrap.querySelectorAll("[data-supp-amount]").forEach(inp=>inp.addEventListener("change",saveSuppToday));
}
async function saveSuppToday(e){
  const id=e.target.dataset.suppCheck||e.target.dataset.suppAmount;
  const checked=document.querySelector(`[data-supp-check="${id}"]`), amount=document.querySelector(`[data-supp-amount="${id}"]`);
  await put("supplementLogs",{id:`${todayISO()}_${id}`,date:todayISO(),supplementId:id,taken:checked.checked,amount:num(amount.value)});
  await refresh();
}
function scheduleText(v){return v==="daily"?"Täglich":v==="training"?"Trainingstage":"Nach Bedarf"}

/* Weight */
async function saveWeight(){
  const date=$("weightDate").value, kg=num($("weightKg").value);
  if(!date||kg==null||kg<=0){toast("Datum und Gewicht eingeben");return}
  await put("weights",{date,kg,bodyfat:num($("weightBodyfat").value),note:$("weightNote").value.trim()});
  $("weightKg").value="";$("weightBodyfat").value="";$("weightNote").value="";
  toast("Gewicht gespeichert"); await refresh();
}
function renderWeight(){
  $("weightDate").value ||= todayISO();
  const days=$("weightRange").value; let arr=[...state.weights];
  if(days!=="all"){
    const cutoff=new Date();cutoff.setDate(cutoff.getDate()-Number(days)+1);
    arr=arr.filter(w=>new Date(w.date+"T12:00:00")>=cutoff);
  }
  drawLineChart($("weightChart"),arr.map(x=>({date:x.date,value:x.kg})), "kg");
  if(arr.length){
    const first=arr[0].kg,last=arr.at(-1).kg,avg7=movingAvg(7),avg30=movingAvg(30);
    $("weightStats").innerHTML=stat("Start",`${first.toFixed(1)} kg`)+stat("Aktuell",`${last.toFixed(1)} kg`)+
      stat("Änderung",`${last-first>=0?"+":""}${(last-first).toFixed(1)} kg`)+
      stat("Ø 7 Tage",avg7!=null?`${avg7.toFixed(1)} kg`:"–")+stat("Ø 30 Tage",avg30!=null?`${avg30.toFixed(1)} kg`:"–");
  } else $("weightStats").innerHTML=stat("Start","–")+stat("Aktuell","–")+stat("Änderung","–")+stat("Ø 7 Tage","–")+stat("Ø 30 Tage","–");
  $("weightList").innerHTML=state.weights.length?[...state.weights].reverse().slice(0,30).map(w=>`
    <div class="list-row"><div class="list-main"><div class="list-title">${w.kg.toFixed(1)} kg ${w.bodyfat!=null?`· ${w.bodyfat}% KF`:""}</div>
    <div class="list-sub">${fmtDate(w.date)}${w.note?` · ${escapeHtml(w.note)}`:""}</div></div>
    <button class="mini-btn delete-btn" data-del-weight="${w.date}">Löschen</button></div>`).join(""):"<div class='empty-state'>Noch keine Gewichtsdaten.</div>";
  document.querySelectorAll("[data-del-weight]").forEach(b=>b.onclick=async()=>{await del("weights",b.dataset.delWeight);await refresh()});
}
function stat(k,v){return `<div class="stat-box"><div class="k">${k}</div><div class="v">${v}</div></div>`}

/* Training / exercises */
function exerciseById(id){return state.exercises.find(e=>e.id===id)}
function estimated1RM(weight,reps){
  weight=Number(weight)||0; reps=Number(reps)||0;
  if(weight<=0||reps<=0) return 0;
  if(reps===1) return weight;
  return weight*(1+Math.min(reps,30)/30);
}
function ensureWorkoutDraft(){
  workoutDraft.date ||= $("workoutDate")?.value || todayISO();
  $("workoutDate").value ||= workoutDraft.date;
}
function renderTraining(){
  ensureWorkoutDraft();
  renderExerciseSelectors();
  renderWorkoutTemplates();
  renderExerciseLibrary();
  renderWorkoutBuilder();
  renderStrength();
  renderPROverview();
  renderWorkoutHistory();
  renderRestTimer();
}
function renderWorkoutTemplates(){
  $("templateCount").textContent=state.workoutTemplates.length;
  const select=$("workoutTemplateSelect");
  const current=select.value;
  select.innerHTML=state.workoutTemplates.length
    ? state.workoutTemplates.map(t=>`<option value="${t.id}">${escapeHtml(t.name)} · ${t.exercises.length} Übungen</option>`).join("")
    : '<option value="">Noch keine Vorlage</option>';
  if(current && state.workoutTemplates.some(t=>t.id===current)) select.value=current;
}
function latestExerciseSession(exerciseId,beforeDate=null){
  const sessions=state.workouts.filter(w=>(!beforeDate || w.date<beforeDate) && w.exercises.some(e=>e.exerciseId===exerciseId));
  if(!sessions.length) return null;
  const w=sessions.at(-1), ex=w.exercises.find(e=>e.exerciseId===exerciseId);
  return {workout:w,exercise:ex};
}
function progressionTip(exerciseId,tracking){
  const ex=exerciseById(exerciseId)||{};
  const last=latestExerciseSession(exerciseId,workoutDraft.date||todayISO());
  if(!last || !last.exercise.sets?.length) return "Noch keine Vergleichsdaten.";
  const sets=last.exercise.sets.filter(s=>(Number(s.reps)||0)>0);
  if(!sets.length) return "Noch keine Vergleichsdaten.";
  const repMin=Math.max(1,Number(ex.repMin)||6);
  const repMax=Math.max(repMin,Number(ex.repMax)||10);
  const increment=Math.max(.5,Number(ex.increment)||2.5);
  const reps=sets.map(s=>Number(s.reps)||0);
  const maxRpe=Math.max(...sets.map(s=>Number(s.rpe)||0));

  if(tracking==="reps"){
    const best=Math.max(...reps);
    if(best>=repMax) return `Rep-Ziel erreicht: nächstes Mal ${best+1}–${best+2} Wiederholungen oder eine schwierigere Variante.`;
    if(best<repMin) return `Unter ${repMin} Wiederholungen: Variante halten und zuerst Wiederholungen aufbauen.`;
    return `Im Zielbereich ${repMin}–${repMax}: nächstes Mal insgesamt mindestens +1 Wiederholung.`;
  }

  const topWeight=Math.max(...sets.map(s=>Number(s.weight)||0));
  if(reps.every(r=>r>=repMax) && (maxRpe===0 || maxRpe<=8.5))
    return `Oberes Rep-Ziel erreicht: wenn Technik passt ca. ${topWeight+increment} kg versuchen.`;
  if(reps.some(r=>r<repMin))
    return `Mindestens ein Satz unter ${repMin} Wdh.: Gewicht halten und den Rep-Bereich stabilisieren.`;
  return `Gewicht halten und im Bereich ${repMin}–${repMax} Wdh. insgesamt mindestens +1 Wiederholung erzielen.`;
}
async function saveWorkoutTemplate(){
  updateDraftFromDOM();
  if(!workoutDraft.exercises.length){toast("Erst Übungen zum Workout hinzufügen");return}
  const name=workoutDraft.name || prompt("Name der Vorlage", "Mein Workout");
  if(!name) return;
  const template={id:uid(),name:name.trim(),exercises:workoutDraft.exercises.map(e=>({exerciseId:e.exerciseId,setCount:Math.max(1,e.sets?.length||1)}))};
  await put("workoutTemplates",template);toast("Vorlage gespeichert");await refresh();
}
async function loadWorkoutTemplate(){
  const id=$("workoutTemplateSelect").value, t=state.workoutTemplates.find(x=>x.id===id);
  if(!t){toast("Keine Vorlage ausgewählt");return}
  workoutDraft={date:todayISO(),name:t.name,note:"",exercises:t.exercises.map(te=>{
    const ex=exerciseById(te.exerciseId), last=latestExerciseSession(te.exerciseId);
    let sets=[];
    if(last?.exercise?.sets?.length){
      sets=Array.from({length:te.setCount},(_,i)=>({...last.exercise.sets[Math.min(i,last.exercise.sets.length-1)]}));
    } else sets=Array.from({length:te.setCount},()=>({weight:null,reps:null,rpe:null}));
    return {exerciseId:te.exerciseId,exerciseName:ex?.name||"Übung",tracking:ex?.tracking||"weight",sets};
  }).filter(e=>exerciseById(e.exerciseId))};
  renderTraining();toast("Vorlage geladen");
}
async function deleteWorkoutTemplate(){
  const id=$("workoutTemplateSelect").value;
  if(!id){toast("Keine Vorlage ausgewählt");return}
  if(!confirm("Vorlage wirklich löschen?")) return;
  await del("workoutTemplates",id);toast("Vorlage gelöscht");await refresh();
}
function renderRestTimer(){
  const display=$("restTimerDisplay"); if(!display) return;
  if(restTimerEnd>0) restTimerRemaining=Math.max(0,Math.ceil((restTimerEnd-Date.now())/1000));
  const m=Math.floor(restTimerRemaining/60),s=restTimerRemaining%60;
  display.textContent=`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  document.querySelector(".rest-card")?.classList.toggle("timer-running",restTimerRemaining>0);
  if(restTimerRemaining<=0 && restTimerEnd>0){
    restTimerEnd=0;localStorage.removeItem("fitlog-rest-end");
    if(restTimerInterval){clearInterval(restTimerInterval);restTimerInterval=null}
    toast("Pause beendet");
    if(navigator.vibrate) navigator.vibrate([150,80,150]);
  }
}
function startRestTimer(seconds){
  if(restTimerInterval) clearInterval(restTimerInterval);
  restTimerRemaining=Number(seconds)||0;
  restTimerEnd=Date.now()+restTimerRemaining*1000;
  localStorage.setItem("fitlog-rest-end",String(restTimerEnd));
  renderRestTimer();
  restTimerInterval=setInterval(renderRestTimer,250);
}
function stopRestTimer(){
  if(restTimerInterval) clearInterval(restTimerInterval);
  restTimerInterval=null;restTimerRemaining=0;restTimerEnd=0;
  localStorage.removeItem("fitlog-rest-end");
  renderRestTimer();
}

function renderExerciseSelectors(){
  const opts=state.exercises.length?state.exercises.map(e=>`<option value="${e.id}">${escapeHtml(e.name)} · ${escapeHtml(e.muscle)}</option>`).join(""):`<option value="">Noch keine Übung</option>`;
  const currentWorkout=$("workoutExerciseSelect").value;
  $("workoutExerciseSelect").innerHTML=opts;
  if(currentWorkout && state.exercises.some(e=>e.id===currentWorkout)) $("workoutExerciseSelect").value=currentWorkout;

  const currentStrength=$("strengthExerciseSelect").value;
  $("strengthExerciseSelect").innerHTML=opts;
  if(currentStrength && state.exercises.some(e=>e.id===currentStrength)) $("strengthExerciseSelect").value=currentStrength;
}
async function addExercise(){
  const name=$("exerciseName").value.trim();
  if(!name){toast("Übungsname eingeben");return}
  const duplicate=state.exercises.some(e=>e.name.toLowerCase()===name.toLowerCase());
  if(duplicate){toast("Diese Übung gibt es bereits");return}
  const repMin=Math.max(1,Number($("exerciseRepMin").value)||6);
  const repMax=Math.max(repMin,Number($("exerciseRepMax").value)||10);
  const increment=Math.max(.5,Number($("exerciseIncrement").value)||2.5);
  await put("exercises",{id:uid(),name,muscle:$("exerciseMuscle").value,tracking:$("exerciseTracking").value,repMin,repMax,increment});
  $("exerciseName").value="";
  toast("Übung hinzugefügt"); await refresh();
}
function renderExerciseLibrary(){
  $("exerciseCount").textContent=state.exercises.length;
  $("exerciseList").innerHTML=state.exercises.length?state.exercises.map(e=>{
    const uses=state.workouts.reduce((n,w)=>n+(w.exercises.some(x=>x.exerciseId===e.id)?1:0),0);
    return `<div class="list-row"><div class="list-main"><div class="list-title">${escapeHtml(e.name)}</div>
      <div class="list-sub">${escapeHtml(e.muscle)} · ${e.tracking==="reps"?"Nur Wiederholungen":"Gewicht + Wiederholungen"} · Ziel ${e.repMin||6}–${e.repMax||10} Wdh.${e.tracking==="reps"?"":` · +${e.increment||2.5} kg`} · ${uses} Workouts</div></div>
      <button class="mini-btn delete-btn" data-del-exercise="${e.id}">Löschen</button></div>`;
  }).join(""):"<div class='empty-state'>Lege deine erste Übung an, z. B. Bankdrücken, Kniebeuge oder Latzug.</div>";
  document.querySelectorAll("[data-del-exercise]").forEach(b=>b.onclick=async()=>{
    const used=state.workouts.some(w=>w.exercises.some(e=>e.exerciseId===b.dataset.delExercise));
    if(used && !confirm("Diese Übung ist bereits in gespeicherten Workouts. Löschen? Historische Sätze bleiben im Workout erhalten.")) return;
    await del("exercises",b.dataset.delExercise);
    workoutDraft.exercises=workoutDraft.exercises.filter(x=>x.exerciseId!==b.dataset.delExercise);
    await refresh();
  });
}
function addExerciseToWorkout(){
  const id=$("workoutExerciseSelect").value;
  if(!id){toast("Lege zuerst eine Übung an");return}
  if(workoutDraft.exercises.some(e=>e.exerciseId===id)){toast("Übung ist schon im Workout");return}
  const ex=exerciseById(id);
  workoutDraft.exercises.push({exerciseId:id,exerciseName:ex?.name||"Übung",tracking:ex?.tracking||"weight",sets:[{weight:null,reps:null,rpe:null}]});
  renderWorkoutBuilder();
}
function updateDraftFromDOM(){
  workoutDraft.date=$("workoutDate").value||todayISO();
  workoutDraft.name=$("workoutName").value.trim();
  workoutDraft.note=$("workoutNote").value.trim();
  document.querySelectorAll("[data-workout-exercise]").forEach(block=>{
    const ex=workoutDraft.exercises.find(x=>x.exerciseId===block.dataset.workoutExercise);
    if(!ex) return;
    ex.sets=[...block.querySelectorAll("[data-set-row]")].map(row=>({
      weight:num(row.querySelector("[data-set-weight]")?.value),
      reps:num(row.querySelector("[data-set-reps]")?.value),
      rpe:num(row.querySelector("[data-set-rpe]")?.value)
    }));
  });
}
function renderWorkoutBuilder(){
  $("workoutDraftCount").textContent=`${workoutDraft.exercises.length} ${workoutDraft.exercises.length===1?"Übung":"Übungen"}`;
  $("workoutDate").value=workoutDraft.date||todayISO();
  $("workoutName").value=workoutDraft.name||"";
  $("workoutNote").value=workoutDraft.note||"";
  const wrap=$("workoutBuilder");
  if(!workoutDraft.exercises.length){wrap.className="workout-builder empty-state";wrap.innerHTML=state.exercises.length?"Füge eine Übung zum Workout hinzu.":"Lege zuerst Übungen an und füge sie dann zum Workout hinzu.";return}
  wrap.className="workout-builder";
  wrap.innerHTML=workoutDraft.exercises.map(exDraft=>{
    const ex=exerciseById(exDraft.exerciseId)||{name:exDraft.exerciseName||"Gelöschte Übung",tracking:exDraft.tracking||"weight"};
    const weighted=ex.tracking!=="reps";
    return `<div class="workout-exercise" data-workout-exercise="${exDraft.exerciseId}">
      <div class="workout-exercise-head"><div><div class="workout-exercise-title">${escapeHtml(ex.name)}</div>
      <div class="list-sub">${weighted?"Gewicht + Wiederholungen":"Wiederholungen"}</div></div>
      <button class="mini-btn delete-btn" data-remove-workout-exercise="${exDraft.exerciseId}">Entfernen</button></div>
      ${previousPerformanceHtml(exDraft.exerciseId,ex.tracking)}
      <div class="sets-head"><span>Satz</span><span>${weighted?"kg":"–"}</span><span>Wdh.</span><span>RPE</span><span></span></div>
      <div class="sets-wrap">${(exDraft.sets||[]).map((set,i)=>setRowHtml(exDraft.exerciseId,set,i,weighted)).join("")}</div>
      <div class="set-actions"><button class="mini-btn" data-add-set="${exDraft.exerciseId}">+ Satz</button>
      <button class="mini-btn" data-copy-last-set="${exDraft.exerciseId}">Letzten kopieren</button></div>
    </div>`;
  }).join("");
  bindWorkoutBuilderEvents();
}
function previousPerformanceHtml(exerciseId,tracking){
  const ex=exerciseById(exerciseId)||{};
  const last=latestExerciseSession(exerciseId,workoutDraft.date||todayISO());
  const target=`Ziel ${ex.repMin||6}–${ex.repMax||10} Wdh.${tracking==="reps"?"":` · +${ex.increment||2.5} kg`}`;
  if(!last) return `<div class="previous-performance"><div class="prev-title">Letzte Leistung · ${target}</div><div class="prev-sets muted">Noch kein früheres Workout.</div><div class="progression-tip">${progressionTip(exerciseId,tracking)}</div></div>`;
  const sets=last.exercise.sets||[];
  const text=tracking==="reps"
    ? sets.map(s=>`${Number(s.reps)||0} Wdh.${s.rpe?` @${s.rpe}`:""}`).join(" · ")
    : sets.map(s=>`${Number(s.weight)||0} kg × ${Number(s.reps)||0}${s.rpe?` @${s.rpe}`:""}`).join(" · ");
  return `<div class="previous-performance"><div class="prev-title">Letzte Leistung · ${fmtDate(last.workout.date)} · ${target}</div><div class="prev-sets">${text}</div><div class="progression-tip">${progressionTip(exerciseId,tracking)}</div></div>`;
}
function setRowHtml(exerciseId,set,i,weighted){
  return `<div class="set-row" data-set-row>
    <span class="set-index">${i+1}</span>
    <input data-set-weight type="number" step="0.5" inputmode="decimal" placeholder="${weighted?"kg":"–"}" value="${set.weight??""}" ${weighted?"":"disabled"}>
    <input data-set-reps type="number" step="1" inputmode="numeric" placeholder="Wdh." value="${set.reps??""}">
    <input class="rpe-input" data-set-rpe type="number" min="1" max="10" step="0.5" inputmode="decimal" placeholder="RPE" value="${set.rpe??""}">
    <button class="set-remove" data-remove-set="${exerciseId}" data-set-index="${i}">×</button>
  </div>`;
}
function bindWorkoutBuilderEvents(){
  document.querySelectorAll("[data-add-set]").forEach(b=>b.onclick=()=>{
    updateDraftFromDOM(); const ex=workoutDraft.exercises.find(x=>x.exerciseId===b.dataset.addSet);
    ex.sets.push({weight:null,reps:null,rpe:null}); renderWorkoutBuilder();
  });
  document.querySelectorAll("[data-copy-last-set]").forEach(b=>b.onclick=()=>{
    updateDraftFromDOM(); const ex=workoutDraft.exercises.find(x=>x.exerciseId===b.dataset.copyLastSet);
    const last=ex.sets.at(-1)||{weight:null,reps:null,rpe:null}; ex.sets.push({...last}); renderWorkoutBuilder();
  });
  document.querySelectorAll("[data-remove-set]").forEach(b=>b.onclick=()=>{
    updateDraftFromDOM(); const ex=workoutDraft.exercises.find(x=>x.exerciseId===b.dataset.removeSet);
    ex.sets.splice(Number(b.dataset.setIndex),1); if(!ex.sets.length) ex.sets.push({weight:null,reps:null,rpe:null}); renderWorkoutBuilder();
  });
  document.querySelectorAll("[data-remove-workout-exercise]").forEach(b=>b.onclick=()=>{
    updateDraftFromDOM(); workoutDraft.exercises=workoutDraft.exercises.filter(x=>x.exerciseId!==b.dataset.removeWorkoutExercise); renderWorkoutBuilder();
  });
  document.querySelectorAll("#workoutBuilder input").forEach(inp=>inp.addEventListener("change",updateDraftFromDOM));
}
async function saveWorkout(){
  updateDraftFromDOM();
  if(!workoutDraft.date){toast("Datum fehlt");return}
  if(!workoutDraft.exercises.length){toast("Mindestens eine Übung hinzufügen");return}
  const cleanExercises=workoutDraft.exercises.map(e=>{
    const ex=exerciseById(e.exerciseId);
    const sets=(e.sets||[]).filter(s=>(s.reps??0)>0 || (s.weight??0)>0).map(s=>({weight:s.weight??0,reps:s.reps??0,rpe:s.rpe}));
    return {exerciseId:e.exerciseId,exerciseName:ex?.name||e.exerciseName||"Übung",muscle:ex?.muscle||"",tracking:ex?.tracking||e.tracking||"weight",sets};
  }).filter(e=>e.sets.length);
  if(!cleanExercises.length){toast("Mindestens einen Satz eintragen");return}
  const workout={id:uid(),date:workoutDraft.date,name:workoutDraft.name||"Workout",note:workoutDraft.note,createdAt:new Date().toISOString(),exercises:cleanExercises};
  await put("workouts",workout);

  const daily=state.daily.find(x=>x.date===workout.date)||{date:workout.date,calories:null,protein:null,steps:null,water:null,sleep:null,note:""};
  await put("daily",{...daily,workout:true});

  workoutDraft={date:todayISO(),name:"",note:"",exercises:[]};
  toast("Workout gespeichert"); await refresh();
}
function clearWorkoutDraft(){
  if(workoutDraft.exercises.length && !confirm("Workout-Entwurf wirklich leeren?")) return;
  workoutDraft={date:todayISO(),name:"",note:"",exercises:[]}; renderWorkoutBuilder();
}
function workoutExerciseMetrics(exerciseId){
  return state.workouts.map(w=>{
    const ex=w.exercises.find(e=>e.exerciseId===exerciseId);
    if(!ex) return null;
    const sets=ex.sets||[];
    if(!sets.length) return null;
    const weighted=ex.tracking!=="reps";
    const topWeight=Math.max(...sets.map(s=>Number(s.weight)||0));
    const topReps=Math.max(...sets.map(s=>Number(s.reps)||0));
    const e1rm=Math.max(...sets.map(s=>estimated1RM(s.weight,s.reps)));
    const volume=sets.reduce((n,s)=>n+(Number(s.weight)||0)*(Number(s.reps)||0),0);
    return {date:w.date,workoutId:w.id,name:w.name,topWeight,topReps,e1rm,volume,weighted};
  }).filter(Boolean).sort((a,b)=>a.date.localeCompare(b.date));
}
function renderStrength(){
  const id=$("strengthExerciseSelect").value;
  if(!id){
    drawLineChart($("strengthChart"),[],"");
    $("strengthStats").innerHTML=stat("Aktuell","–")+stat("Bestwert","–")+stat("Veränderung","–");
    return;
  }
  const ex=exerciseById(id), data=workoutExerciseMetrics(id);
  let key=strengthMetric, unit="";
  if(ex?.tracking==="reps" && ["e1rm","weight","volume"].includes(key)) key="reps";
  if(key==="e1rm"||key==="weight") unit="kg";
  if(key==="volume") unit="kg";
  if(key==="reps") unit="Wdh.";
  const points=data.map(x=>({date:x.date,value:x[key]})).filter(x=>Number.isFinite(x.value));
  drawLineChart($("strengthChart"),points,unit);

  if(points.length){
    const current=points.at(-1).value,best=Math.max(...points.map(x=>x.value)),first=points[0].value,change=current-first;
    const format=v=>key==="volume"?`${Math.round(v)} kg`:key==="reps"?`${Math.round(v)} Wdh.`:`${v.toFixed(1)} kg`;
    $("strengthStats").innerHTML=stat("Aktuell",format(current))+stat("Bestwert",format(best))+
      stat("Seit Start",`${change>=0?"+":""}${key==="volume"||key==="reps"?Math.round(change):change.toFixed(1)} ${unit}`)+
      stat("Workouts",String(points.length));
  }else $("strengthStats").innerHTML=stat("Aktuell","–")+stat("Bestwert","–")+stat("Seit Start","–")+stat("Workouts","0");
}
function renderPROverview(){
  const entries=state.exercises.map(ex=>{
    const data=workoutExerciseMetrics(ex.id); if(!data.length) return null;
    if(ex.tracking==="reps"){
      const best=Math.max(...data.map(x=>x.topReps||0));
      const session=[...data].reverse().find(x=>(x.topReps||0)===best);
      return {name:ex.name,muscle:ex.muscle,value:`${best} Wdh.`,sub:session?fmtDate(session.date):"",score:best};
    }
    const best=Math.max(...data.map(x=>x.e1rm||0));
    const session=[...data].reverse().find(x=>Math.abs((x.e1rm||0)-best)<0.001);
    return {name:ex.name,muscle:ex.muscle,value:`${best.toFixed(1)} kg e1RM`,sub:session?fmtDate(session.date):"",score:best};
  }).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name,"de"));
  $("prOverviewList").innerHTML=entries.length
    ? entries.map(x=>`<div class="list-row pr-row"><div><div class="list-title">${escapeHtml(x.name)}</div><div class="list-sub">${escapeHtml(x.muscle||"")}</div></div><div class="pr-value">${x.value}<div class="pr-sub">${x.sub}</div></div></div>`).join("")
    : '<div class="empty-state">PRs erscheinen automatisch nach deinen ersten Workouts.</div>';
}
function renderWorkoutHistory(){
  if(!state.workouts.length){$("workoutHistoryList").innerHTML="<div class='empty-state'>Noch keine Workouts gespeichert.</div>";return}
  const allExerciseBest={};
  state.exercises.forEach(ex=>{
    const metrics=workoutExerciseMetrics(ex.id);
    allExerciseBest[ex.id]=metrics.length?Math.max(...metrics.map(m=>ex.tracking==="reps"?(m.topReps||0):(m.e1rm||0))):0;
  });
  $("workoutHistoryList").innerHTML=[...state.workouts].reverse().slice(0,30).map(w=>{
    const exerciseLines=w.exercises.map(ex=>{
      const sets=ex.sets||[];
      const tracking=ex.tracking||exerciseById(ex.exerciseId)?.tracking||"weight";
      const metric=tracking==="reps"?Math.max(0,...sets.map(s=>Number(s.reps)||0)):
        Math.max(0,...sets.map(s=>estimated1RM(s.weight,s.reps)));
      const isPr=metric>0 && Math.abs(metric-(allExerciseBest[ex.exerciseId]||0))<0.0001;
      const setText=tracking==="reps"
        ? sets.map(s=>`${Number(s.reps)||0} Wdh.${s.rpe?` @${s.rpe}`:""}`).join(" · ")
        : sets.map(s=>`${Number(s.weight)||0} kg × ${Number(s.reps)||0}${s.rpe?` @${s.rpe}`:""}`).join(" · ");
      return `<div class="history-exercise"><strong>${escapeHtml(ex.exerciseName||exerciseById(ex.exerciseId)?.name||"Übung")}</strong>${isPr?'<span class="pr-badge">PR</span>':""}
        <div class="history-sets">${setText}</div></div>`;
    }).join("");
    return `<div class="list-row workout-history-row"><div class="list-main" style="width:100%">
      <div class="card-title-row"><div><div class="list-title">${escapeHtml(w.name||"Workout")}</div>
      <div class="list-sub">${fmtDate(w.date)} · ${w.exercises.length} Übungen · ${workoutSetCount(w)} Sätze · ${Math.round(workoutVolume(w)).toLocaleString("de-DE")} kg Volumen</div></div>
      <button class="mini-btn delete-btn" data-del-workout="${w.id}">Löschen</button></div>
      <div class="workout-detail">${exerciseLines}${w.note?`<div class="list-sub" style="margin-top:8px">Notiz: ${escapeHtml(w.note)}</div>`:""}</div>
    </div></div>`;
  }).join("");
  document.querySelectorAll("[data-del-workout]").forEach(b=>b.onclick=async()=>{
    if(!confirm("Workout wirklich löschen?")) return;
    const w=state.workouts.find(x=>x.id===b.dataset.delWorkout);
    await del("workouts",b.dataset.delWorkout);
    if(w && workoutsOnDate(w.date).length===1){
      const daily=state.daily.find(x=>x.date===w.date);
      if(daily) await put("daily",{...daily,workout:false});
    }
    await refresh();
  });
}

/* Supplements library */
async function addSupplement(){
  const name=$("suppName").value.trim(), dose=num($("suppDose").value), unit=$("suppUnit").value, schedule=$("suppSchedule").value;
  if(!name||dose==null){toast("Name und Dosis eingeben");return}
  await put("supplements",{id:uid(),name,dose,unit,schedule});
  $("suppName").value="";$("suppDose").value=""; toast("Supplement hinzugefügt");await refresh();
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
  const cutoff=new Date();cutoff.setDate(cutoff.getDate()-29);
  $("suppComplianceList").innerHTML=state.supplements.length?state.supplements.map(s=>{
    const logs=state.supplementLogs.filter(l=>l.supplementId===s.id && new Date(l.date+"T12:00:00")>=cutoff && l.taken);
    const pct=Math.round((logs.length/30)*100);
    return `<div class="list-row"><div style="width:100%"><div class="card-title-row"><div class="list-title">${escapeHtml(s.name)}</div><div class="list-sub">${logs.length}/30 Tage · ${pct}%</div></div>
      <div class="progress-line"><span style="width:${clamp(pct,0,100)}%"></span></div></div></div>`;
  }).join(""):"<div class='empty-state'>Noch keine Supplements.</div>";
}

/* General history */
function renderHistory(){
  const metric=$("historyMetric").value;
  const arr=[...state.daily].slice(-30).map(d=>({date:d.date,value:d[metric]})).filter(x=>x.value!=null);
  const unit={calories:"kcal",protein:"g",steps:"",water:"L",sleep:"h"}[metric];
  drawLineChart($("historyChart"),arr,unit);
  const cutoff=new Date();cutoff.setDate(cutoff.getDate()-29);
  const last30=state.daily.filter(d=>new Date(d.date+"T12:00:00")>=cutoff);
  const avg=(key)=>{const vals=last30.map(d=>d[key]).filter(v=>v!=null);return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null}
  const workouts30=state.workouts.filter(w=>new Date(w.date+"T12:00:00")>=cutoff);
  $("historySummary").innerHTML=[
    ["Ø Kalorien",avg("calories")?.toFixed(0)??"–"],["Ø Protein",avg("protein")!=null?`${avg("protein").toFixed(0)} g`:"–"],
    ["Ø Schritte",avg("steps")?.toFixed(0)??"–"],["Ø Wasser",avg("water")!=null?`${avg("water").toFixed(1)} L`:"–"],
    ["Ø Schlaf",avg("sleep")!=null?`${avg("sleep").toFixed(1)} h`:"–"],["Workouts",String(workouts30.length)]
  ].map(x=>stat(x[0],x[1])).join("");
  $("dailyHistoryList").innerHTML=state.daily.length?[...state.daily].reverse().slice(0,30).map(d=>`
    <div class="list-row"><div class="list-main"><div class="list-title">${fmtDate(d.date)} ${d.workout?"· Training":""}</div>
    <div class="list-sub">${d.calories??"–"} kcal · ${d.protein??"–"} g Protein · ${d.steps??"–"} Schritte · ${d.water??"–"} L · ${d.sleep??"–"} h</div></div>
    <button class="mini-btn delete-btn" data-del-daily="${d.date}">Löschen</button></div>`).join(""):"<div class='empty-state'>Noch keine Tagesdaten.</div>";
  document.querySelectorAll("[data-del-daily]").forEach(b=>b.onclick=async()=>{await del("daily",b.dataset.delDaily);await refresh()});
}

/* Goals */
function renderGoals(){
  const g=state.goals;
  $("goalStartWeight").value=g.startWeight??"";$("goalTargetWeight").value=g.targetWeight??"";
  $("goalCalories").value=g.calories??"";$("goalProtein").value=g.protein??"";
  $("goalSteps").value=g.steps??"";$("goalWater").value=g.water??"";$("goalSleep").value=g.sleep??"";
}
async function saveGoals(){
  const value={startWeight:num($("goalStartWeight").value),targetWeight:num($("goalTargetWeight").value),
    calories:num($("goalCalories").value),protein:num($("goalProtein").value),steps:num($("goalSteps").value),
    water:num($("goalWater").value),sleep:num($("goalSleep").value)};
  await put("settings",{key:"goals",value});toast("Ziele gespeichert");await refresh();
}

/* Charts */
function drawLineChart(canvas,data,unit=""){
  const rect=canvas.getBoundingClientRect(), dpr=window.devicePixelRatio||1;
  const w=Math.max(300,rect.width), h=220; canvas.width=w*dpr; canvas.height=h*dpr;
  const ctx=canvas.getContext("2d");ctx.scale(dpr,dpr);
  const styles=getComputedStyle(document.documentElement), text=styles.getPropertyValue("--muted").trim(), line=styles.getPropertyValue("--line").trim(), accent=styles.getPropertyValue("--text").trim();
  ctx.clearRect(0,0,w,h);
  if(!data.length){ctx.fillStyle=text;ctx.font="13px -apple-system";ctx.fillText("Noch keine Daten",16,40);return}
  const vals=data.map(x=>Number(x.value)), min=Math.min(...vals), max=Math.max(...vals), padY=(max-min||1)*.15;
  const lo=min-padY, hi=max+padY, left=45,right=12,top=14,bottom=28, cw=w-left-right,ch=h-top-bottom;
  ctx.strokeStyle=line;ctx.lineWidth=1;
  for(let i=0;i<4;i++){const y=top+(ch/3)*i;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(w-right,y);ctx.stroke()}
  ctx.fillStyle=text;ctx.font="10px -apple-system";
  for(let i=0;i<4;i++){const v=hi-((hi-lo)/3)*i;ctx.fillText(`${formatChart(v)}${unit?" "+unit:""}`,2,top+(ch/3)*i+3)}
  ctx.strokeStyle=accent;ctx.lineWidth=2.5;ctx.lineJoin="round";ctx.lineCap="round";ctx.beginPath();
  data.forEach((p,i)=>{const x=left+(data.length===1?cw/2:(cw*i/(data.length-1)));const y=top+ch-(p.value-lo)/(hi-lo)*ch;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});
  ctx.stroke();
  data.forEach((p,i)=>{const x=left+(data.length===1?cw/2:(cw*i/(data.length-1)));const y=top+ch-(p.value-lo)/(hi-lo)*ch;ctx.fillStyle=accent;ctx.beginPath();ctx.arc(x,y,2.6,0,Math.PI*2);ctx.fill()});
  const points=[0,Math.floor((data.length-1)/2),data.length-1].filter((v,i,a)=>a.indexOf(v)===i);
  points.forEach(i=>{const x=left+(data.length===1?cw/2:(cw*i/(data.length-1)));ctx.fillStyle=text;ctx.fillText(data[i].date.slice(5),Math.max(left-6,Math.min(x-14,w-40)),h-8)});
}
function formatChart(v){return Math.abs(v)>=100?Math.round(v):v.toFixed(1)}
function escapeHtml(s=""){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

/* Backup / import / CSV */
function exportFile(name,content,type){
  const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
function exportBackup(){
  const payload={version:3,exportedAt:new Date().toISOString(),data:{
    goals:state.goals,supplements:state.supplements,weights:state.weights,daily:state.daily,
    supplementLogs:state.supplementLogs,exercises:state.exercises,workouts:state.workouts,workoutTemplates:state.workoutTemplates
  }};
  exportFile(`fitlog-backup-${todayISO()}.json`,JSON.stringify(payload,null,2),"application/json");toast("Backup exportiert")
}
async function importBackup(file){
  try{
    const raw=JSON.parse(await file.text()),d=raw.data||raw;
    const stores=["weights","daily","supplements","supplementLogs","exercises","workouts","workoutTemplates","settings"];
    for(const n of stores) await clearStore(n);
    if(d.goals) await put("settings",{key:"goals",value:d.goals});
    for(const n of ["weights","daily","supplements","supplementLogs","exercises","workouts","workoutTemplates"]) for(const x of (d[n]||[])) await put(n,x);
    toast("Backup importiert");await refresh();
  }catch(e){console.error(e);toast("Backup konnte nicht gelesen werden")}
}
function csvEscape(v){const s=String(v??"");return `"${s.replaceAll('"','""')}"`}
function exportCSV(){
  const rows=[["Typ","Datum","Workout","Übung","Satz","Gewicht","Wiederholungen","RPE","Weitere Daten/Notiz"]];
  state.weights.forEach(w=>rows.push(["Gewicht",w.date,"","","",w.kg,"","","Körperfett: "+(w.bodyfat??"")+" | "+(w.note??"")]));
  state.daily.forEach(d=>rows.push(["Tag",d.date,"","","","","","","Kalorien "+(d.calories??"")+" | Protein "+(d.protein??"")+" | Schritte "+(d.steps??"")+" | Wasser "+(d.water??"")+" | Schlaf "+(d.sleep??"")+" | Training "+(d.workout?"Ja":"Nein")+" | "+(d.note??"")]));
  state.supplementLogs.forEach(l=>{const s=state.supplements.find(x=>x.id===l.supplementId);rows.push(["Supplement",l.date,"",s?.name??l.supplementId,"",l.amount??"","","",`${s?.unit??""} | ${l.taken?"genommen":"nicht genommen"}`])});
  state.workouts.forEach(w=>w.exercises.forEach(ex=>ex.sets.forEach((s,i)=>rows.push(["Workout",w.date,w.name,ex.exerciseName,i+1,s.weight??0,s.reps??0,s.rpe??"",w.note??""]))));
  const csv="\ufeff"+rows.map(r=>r.map(csvEscape).join(";")).join("\n");
  exportFile(`fitlog-export-${todayISO()}.csv`,csv,"text/csv;charset=utf-8");toast("CSV exportiert")
}
async function clearAll(){
  if(!confirm("Wirklich alle lokalen FitLog-Daten löschen?")) return;
  for(const n of ["weights","daily","supplements","supplementLogs","exercises","workouts","workoutTemplates","settings"]) await clearStore(n);
  workoutDraft={date:todayISO(),name:"",note:"",exercises:[]};
  toast("Alle Daten gelöscht");await refresh();
}

/* Bind */
function bind(){
  document.querySelectorAll(".nav-btn").forEach(btn=>btn.onclick=()=>{
    document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b===btn));
    document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.dataset.view===btn.dataset.target));
    $("pageTitle").textContent={today:"Heute",weight:"Gewicht",training:"Training",supplements:"Supplements",history:"Verlauf",settings:"Ziele & Daten"}[btn.dataset.target];
    window.scrollTo({top:0,behavior:"smooth"}); setTimeout(()=>renderAll(),60);
  });

  $("saveTodayBtn").onclick=saveToday;$("saveWeightBtn").onclick=saveWeight;
  $("addSuppBtn").onclick=addSupplement;$("saveGoalsBtn").onclick=saveGoals;
  $("weightRange").onchange=renderWeight;$("historyMetric").onchange=renderHistory;
  $("exportBackupBtn").onclick=exportBackup;$("exportCsvBtn").onclick=exportCSV;$("clearDataBtn").onclick=clearAll;
  $("importBackupInput").onchange=e=>e.target.files[0]&&importBackup(e.target.files[0]);

  $("loadTemplateBtn").onclick=loadWorkoutTemplate;
  $("saveTemplateBtn").onclick=saveWorkoutTemplate;
  $("deleteTemplateBtn").onclick=deleteWorkoutTemplate;
  document.querySelectorAll("[data-rest-seconds]").forEach(b=>b.onclick=()=>startRestTimer(Number(b.dataset.restSeconds)));
  $("stopRestTimerBtn").onclick=stopRestTimer;

  $("addExerciseBtn").onclick=addExercise;
  $("addExerciseToWorkoutBtn").onclick=()=>{updateDraftFromDOM();addExerciseToWorkout()};
  $("saveWorkoutBtn").onclick=saveWorkout;
  $("clearWorkoutDraftBtn").onclick=clearWorkoutDraft;
  $("workoutDate").onchange=()=>workoutDraft.date=$("workoutDate").value;
  $("workoutName").onchange=()=>workoutDraft.name=$("workoutName").value.trim();
  $("workoutNote").onchange=()=>workoutDraft.note=$("workoutNote").value.trim();
  $("strengthExerciseSelect").onchange=renderStrength;
  document.querySelectorAll("[data-strength-metric]").forEach(b=>b.onclick=()=>{
    strengthMetric=b.dataset.strengthMetric;
    document.querySelectorAll("[data-strength-metric]").forEach(x=>x.classList.toggle("active",x===b));
    renderStrength();
  });

  $("themeBtn").onclick=()=>{
    const root=document.documentElement,next=root.dataset.theme==="dark"?"light":"dark";
    root.dataset.theme=next;localStorage.setItem("fitlog-theme",next);renderAll()
  };
  window.addEventListener("resize",()=>{renderWeight();renderHistory();renderStrength()});
  document.addEventListener("visibilitychange",()=>{if(!document.hidden && restTimerEndsAt) tickRestTimer()});
}

async function init(){
  document.documentElement.dataset.theme=localStorage.getItem("fitlog-theme")||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");
  workoutDraft.date=todayISO();
  db=await openDB();bind();await refresh();
  if(restTimerEnd>Date.now()){
    restTimerInterval=setInterval(renderRestTimer,250);
    renderRestTimer();
  } else {
    restTimerEnd=0;localStorage.removeItem("fitlog-rest-end");renderRestTimer();
  }
  if("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js").catch(console.error);
}
init();
