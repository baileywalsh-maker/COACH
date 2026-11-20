// ---- Profile & goal calculator ----
const PROFILE_KEY = 'calorieprofile';
const WEIGHTLOG_KEY = 'calorieweightlog';
let selectedSex = 'male';

function loadProfile(){ try{ return JSON.parse(CS.getItem(PROFILE_KEY)) || {}; }catch(e){ return {}; } }
function saveProfile(p){ lsSet(PROFILE_KEY, JSON.stringify(p)); }
function loadWeightLog(){ try{ return JSON.parse(CS.getItem(WEIGHTLOG_KEY)) || []; }catch(e){ return []; } }
function pushWeight(kg, dateStr){
  const log = loadWeightLog();
  const key = dateStr || todayYMD();
  const existing = log.findIndex(e=>e.date===key);
  if(existing>=0) log[existing].kg = kg; else log.push({date:key, kg});
  log.sort((a,b)=>a.date.localeCompare(b.date));
  lsSet(WEIGHTLOG_KEY, JSON.stringify(log));
  try{ museSyncSoon(); }catch(e){}
}

function removeWeight(dateStr){
  const log = loadWeightLog().filter(e=>e.date!==dateStr);
  lsSet(WEIGHTLOG_KEY, JSON.stringify(log));
}

// A misplaced decimal point silently poisons the TDEE estimate for weeks, and
// nothing downstream can tell 8.75 from 87.5. Check it against the nearest
// existing reading before accepting.
function weightLooksWrong(kg, dateStr){
  const log = loadWeightLog().filter(e=>e.date!==dateStr);
  if(!log.length){
    // No other reading to compare against — fall back to the profile weight,
    // otherwise the very first correction accepts anything at all.
    const pw = loadProfile().weight;
    if(pw && Math.abs(kg - pw) > 10){
      return 'Your profile says ' + pw + 'kg. Is ' + kg + 'kg right?';
    }
    return null;
  }
  let nearest = log[0], bestGap = Infinity;
  for(const e of log){
    const gap = Math.abs(parseYMD(e.date) - parseYMD(dateStr));
    if(gap < bestGap){ bestGap = gap; nearest = e; }
  }
  const days = Math.max(1, Math.round(bestGap/86400000));
  const diff = Math.abs(kg - nearest.kg);
  // roughly 1kg of true change a day is already generous; below that it is noise
  if(diff > Math.max(3, days * 1.0)){
    return 'You were ' + nearest.kg + 'kg on ' + prettyDate(nearest.date) +
           '. Is ' + kg + 'kg right?';
  }
  return null;
}

function prettyDate(ymdStr){
  return parseYMD(ymdStr).toLocaleDateString(undefined,{weekday:'short', day:'numeric', month:'short'});
}

document.getElementById('profile-btn').onclick = ()=>{
  const p = loadProfile();
  if(p.sex) selectSex(p.sex);
  document.getElementById('p-age').value = p.age||'';
  document.getElementById('p-height').value = p.height||'';
  document.getElementById('p-weight').value = p.weight||'';
  document.getElementById('p-bodyfat').value = p.bodyfat||'';
  document.getElementById('p-health-floor').value = healthFloor();
  document.getElementById('p-protein-floor').value = String(proteinFloorPct());
  renderGoalNotes();
  if(p.activity) document.getElementById('p-activity').value = p.activity;
  if(p.goal) document.getElementById('p-goal').value = p.goal;
  if(p.pace) document.getElementById('p-pace').value = p.pace;
  document.getElementById('p-target-weight').value = p.targetWeight||'';
  try{ pfChips(); pfRender(false); }catch(e){}
  openSheet('profile-backdrop');
};

function selectSex(sex){
  selectedSex = sex;
  document.querySelectorAll('[data-sex]').forEach(b=>b.classList.toggle('active', b.dataset.sex===sex));
  try{ if(document.getElementById('profile-backdrop').classList.contains('open')) pfRender(false); }catch(e){}
}
// v133: each choice is a row of chips drawn from its (hidden) select, so the
// value the rest of the app reads is exactly what it always was.
function pfChips(){
  document.querySelectorAll('[data-chips]').forEach(box=>{
    const sel = document.getElementById(box.dataset.chips);
    if(!sel) return;
    box.innerHTML = Array.from(sel.options).map(o=>
      '<button type="button" class="pf-chip' + (o.value === sel.value ? ' on' : '') + '" data-v="' + esc(o.value) + '">' +
        '<b>' + esc(o.dataset.t || o.textContent) + '</b>' + (o.dataset.s ? '<s>' + esc(o.dataset.s) + '</s>' : '') + '</button>').join('');
    box.querySelectorAll('.pf-chip').forEach(c=>{
      c.onclick = ()=>{
        sel.value = c.dataset.v;
        sel.dispatchEvent(new Event('change', {bubbles: true}));
        box.querySelectorAll('.pf-chip').forEach(x=>x.classList.toggle('on', x === c));
        try{ tick(); }catch(e){}
        pfRender(false);
        try{ renderGoalNotes(); }catch(e){}
      };
    });
  });
}
function pfSummary(){
  const el = document.getElementById('pf-sum');
  if(!el) return;
  const g = document.getElementById('p-goal'), pc = document.getElementById('p-pace');
  const w = Number(document.getElementById('p-weight').value), tw = Number(document.getElementById('p-target-weight').value);
  const gt = g.options[g.selectedIndex] ? (g.options[g.selectedIndex].dataset.t || '') : '';
  const pt = pc.options[pc.selectedIndex] ? (pc.options[pc.selectedIndex].dataset.t || '') : '';
  el.innerHTML = '<b>' + esc(gt) + '</b><span>' + esc(pt.toLowerCase()) + ' pace</span>' +
    (w ? '<em>' + w + ' kg' + (tw ? ' \u2192 ' + tw + ' kg' : '') + '</em>' : '');
}
['p-age','p-height','p-weight','p-bodyfat','p-target-weight'].forEach(id=>{
  const el = document.getElementById(id);
  if(el) el.addEventListener('input', ()=>{ try{ pfRender(false); }catch(e){} });
});
document.querySelectorAll('[data-qstep]').forEach(b=>{
  b.onclick = ()=>{
    const el = document.getElementById('p-health-floor');
    const v = Number(el.value || el.placeholder) || 75;
    el.value = Math.max(0, Math.min(100, v + Number(b.dataset.qstep)));
    el.dispatchEvent(new Event('input', {bubbles: true}));
    try{ tick(); renderGoalNotes(); }catch(e){}
  };
});
document.querySelectorAll('[data-sex]').forEach(b=>{ b.onclick = ()=>selectSex(b.dataset.sex); });

/* v133: the profile's numbers, worked out live as you change anything.
   Nothing is saved here - Save profile does that. */
function pfRender(loud){
  const age = Number(document.getElementById('p-age').value);
  const height = Number(document.getElementById('p-height').value);
  const weight = Number(document.getElementById('p-weight').value);
  const activity = Number(document.getElementById('p-activity').value);
  const goal = document.getElementById('p-goal').value;
  const pace = document.getElementById('p-pace').value;

  if(!age || !height || !weight){
    if(loud) alert('Enter your age, height and weight first.');
    const pr = document.getElementById('profile-results');
    if(pr) pr.classList.add('empty');
    return null;
  }
  document.getElementById('profile-results').classList.remove('empty');

  // The same equation the rest of the app uses, so the number here and the
  // number the weekly review works from can never disagree.
  const bodyfat = Number(document.getElementById('p-bodyfat').value) || null;
  const bmr = bmrFor({weight, height, age, sex: selectedSex, bodyfat});

  const tdee = bmr * activity;

  const paceAdj = {
    lose:    { conservative:-0.10, moderate:-0.20, aggressive:-0.25 },
    build:   { conservative: 0.10, moderate: 0.15, aggressive: 0.20 },
    recomp:  { conservative:-0.05, moderate: 0.00, aggressive: 0.05 },
    maintain:{ conservative: 0.00, moderate: 0.00, aggressive: 0.00 }
  };
  const adj = paceAdj[goal][pace];
  let targetKcal = tdee * (1+adj);

  // protein g/kg bodyweight — Helms/Aragon/Schoenfeld ranges for resistance-trained individuals
  const proteinPerKg = { lose:2.2, build:2.0, recomp:2.2, maintain:1.8 }[goal];
  const proteinG = proteinPerKg * weight;
  const proteinKcal = proteinG * 4;

  // fat — minimum 25% of calories or 0.6g/kg, whichever is higher, for hormonal health
  let fatG = Math.max((targetKcal*0.25)/9, 0.6*weight);
  const fatKcal = fatG * 9;

  let carbsKcal = targetKcal - proteinKcal - fatKcal;
  let carbsG = carbsKcal/4;
  let warning = '';
  if(carbsG < 0){
    carbsG = Math.max(0, weight*1); // safety floor ~1g/kg
    targetKcal = proteinKcal + fatKcal + carbsG*4;
    warning = 'Protein + fat minimums exceeded your target calories at this weight/pace — carbs were floored and total calories adjusted up slightly. Consider a less aggressive pace.';
  }
  const floor = selectedSex==='male' ? 1500 : 1200;
  if(targetKcal < floor){
    warning = 'The maths for this goal and pace produced '+fmt0(targetKcal)+' kcal, which is below the generally recommended minimum of '+floor+'. The target has been raised to '+floor+' rather than recommending you eat less than that. A slower pace will get you there more reliably — and if you want to go lower than this, that is a conversation for a doctor or dietitian, not an app.';
    targetKcal = floor;
    // recompute the split against the floored target
    carbsG = Math.max(0, (targetKcal - proteinKcal - fatKcal)/4);
  }

  document.getElementById('r-bmr').textContent = fmtK(bmr)+' kcal';
  document.getElementById('r-tdee').textContent = fmtK(tdee)+' kcal';
  document.getElementById('r-protein').textContent = fmt0(proteinG)+'g';
  document.getElementById('r-carbs').textContent = fmt0(carbsG)+'g';
  document.getElementById('r-fat').textContent = fmt0(fatG)+'g';
  document.getElementById('r-kcal').textContent = fmtK(targetKcal);

  const goalText = {
    lose:'a fat-loss deficit', build:'a lean muscle-building surplus',
    recomp:'a slight deficit aimed at recomposition', maintain:'maintenance'
  }[goal];
  const paceText = {conservative:'a conservative', moderate:'a moderate', aggressive:'an aggressive'}[pace];
  // v133: said in one line.
  // v142: cut to the numbers.
  document.getElementById('r-rationale').textContent =
    'Maintenance ' + (adj === 0 ? 'as it is' : (adj > 0 ? '+' : '\u2212') + Math.abs(Math.round(adj*100)) + '%') + ', protein ' + proteinPerKg + ' g/kg.';
  void goalText;
  void paceText;

  const warnEl = document.getElementById('r-warning');
  if(warning){ warnEl.textContent = warning; warnEl.style.display='block'; } else { warnEl.style.display='none'; }

  document.getElementById('profile-results').dataset.kcal = Math.round(targetKcal);
  document.getElementById('profile-results').dataset.protein = Math.round(proteinG);
  document.getElementById('profile-results').dataset.carbs = Math.round(carbsG);
  document.getElementById('profile-results').dataset.fat = Math.round(fatG);


  // Once the adaptive engine has real data, the formula is the WORSE estimate.
  // Say so plainly instead of offering both as equals.
  const bn = burnNow();
  const adaptiveNow = bn ? {ready: true, estTDEE: bn.tdee} : {ready: false};
  const applyBtn = document.getElementById('apply-targets-btn');
  if(adaptiveNow.ready){
    applyBtn.textContent = 'Override with formula estimate';
    warnEl.textContent = 'Your data says you burn about '+fmt0(adaptiveNow.estTDEE)+
      ' kcal. Using the formula ('+fmt0(targetKcal)+' kcal) swaps that for a general estimate.';
    warnEl.style.display = 'block';
  } else {
    applyBtn.textContent = 'Apply as my targets';
  }

  try{ const cur = document.getElementById('pf-current'); if(cur) cur.textContent = fmtK(targets.kcal) + ' kcal'; }catch(e){}
  // v141: the measured figure, the same one the Week and Data screens show.
  try{ const me = document.getElementById('pf-measured'); if(me) me.textContent = bn ? fmtK(bn.tdee) + ' kcal' : 'not enough data yet'; }catch(e){}
  try{ pfSummary(); }catch(e){}
  return {age, height, weight, activity, goal, pace, targetKcal};
}

document.getElementById('calc-btn').onclick = ()=>{
  const pr = pfRender(true);
  if(!pr) return;
  const {age, height, weight, activity, goal, pace, targetKcal} = pr;
  const prev = loadProfile();
  // Merged over what is saved, not written fresh: a new object dropped every
  // setting this form doesn't show - the water target and glass size went back
  // to their defaults each time you pressed Calculate.
  saveProfile(Object.assign({}, prev, {
    sex:selectedSex, age, height, weight,
    bodyfat: Number(document.getElementById('p-bodyfat').value)||null,
    healthFloor: (function(){
      // An empty box is "not set", not zero. Number('') is 0, which quietly
      // switched the food-quality part of the verdict off.
      const raw = String(document.getElementById('p-health-floor').value).trim();
      const v = Number(raw);
      return (raw !== '' && v >= 0 && v <= 100) ? v : HEALTH_FLOOR_DEFAULT;
    })(),
    proteinFloorPct: Number(document.getElementById('p-protein-floor').value) || PROTEIN_FLOOR_PCT_DEFAULT,
    activity, goal, pace,
    targetWeight: Number(document.getElementById('p-target-weight').value)||null
  }));

  // This used to call pushWeight() outright, with none of the checks the two
  // real weigh-in paths run. Opening Profile to change your goal therefore
  // wrote whatever stale number was sitting in the weight box over today's
  // weigh-in, silently - and that figure drives the adaptive target.
  const already = loadWeightLog().find(e=>e.date === todayYMD());
  if(!already || Math.abs(already.kg - weight) > 0.05){
    const warn = weightLooksWrong(weight, todayYMD());
    if(!warn || confirm(warn)) pushWeight(weight);
  }

  // A goal or pace change is a deliberate decision, not weekly noise —
  // it takes effect now rather than waiting for Monday.
  if(autoOn() && (prev.goal !== goal || prev.pace !== pace) && prev.goal){
    const goalWord = {lose:'losing fat', build:'building muscle', recomp:'recomposition', maintain:'maintaining'}[goal];
    setTargets(macrosFor(Math.round(targetKcal)), 'manual',
      'You changed your goal to '+goalWord+' at a '+pace+' pace, so the target was recalculated straight away.');
  }
  // v133: say it worked, without leaving the sheet.
  const sb = document.getElementById('calc-btn');
  sb.textContent = 'Saved \u2713'; sb.classList.add('done');
  try{ buzz(); }catch(e){}
  clearTimeout(sb._t); sb._t = setTimeout(()=>{ sb.textContent = 'Save profile'; sb.classList.remove('done'); }, 1600);
  try{ renderGoalNotes(); pfRender(false); }catch(e){}
  if(currentView==='day') renderDay(); else renderWeek();
};

document.getElementById('apply-targets-btn').onclick = ()=>{
  const r = document.getElementById('profile-results').dataset;
  const a = {ready: !!burnNow()};
  const why = a.ready
    ? 'You applied the profile estimate by hand, replacing the maintenance figure measured from your own data.'
    : 'You applied the estimate calculated from your profile.';
  setTargets({ kcal:Number(r.kcal), protein:Number(r.protein), carbs:Number(r.carbs), fat:Number(r.fat) }, 'manual', why);
  closeSheet('profile-backdrop');
  if(currentView==='day') renderDay(); else renderWeek();
};

function renderWeightTrend(){
  const log = loadWeightLog();
  const card = document.getElementById('weight-trend-card');
  if(log.length===0){ card.style.display='none'; return; }
  const today = new Date(); today.setHours(0,0,0,0);
  const weekAgo = addDays(today,-7);
  const inWeek = log.filter(e=> parseYMD(e.date) >= weekAgo);
  const latest = log[log.length-1];
  card.style.display = 'flex';
  document.getElementById('wt-latest').textContent = latest.kg+' kg';
  // v135: the same trend line the burn reading and the suggestion use, as a
  // weekly rate - not a separate split-the-week sum that could disagree.
  let bn = null; try{ bn = burnNow(); }catch(e){}
  if(bn && isFinite(bn.weekly)){
    document.getElementById('wt-label').textContent = 'Weight trend';
    const el = document.getElementById('wt-change');
    el.textContent = (bn.weekly>=0?'+':'\u2212')+Math.abs(bn.weekly).toFixed(2)+' kg a week';
    el.style.color = weightDirColor(bn.weekly);
    return;
  }
  document.getElementById('wt-label').textContent = 'Weight trend (7d)';
  if(inWeek.length>=2){
    const half = Math.ceil(inWeek.length/2);
    const first = ewma(inWeek.slice(0,half).map(e=>e.kg), 0.3);
    const second = ewma(inWeek.slice(half).map(e=>e.kg), 0.3);
    const change = second - first;
    const el = document.getElementById('wt-change');
    el.textContent = (change>=0?'+':'')+change.toFixed(1)+' kg';
    el.style.color = weightDirColor(change);
  } else {
    document.getElementById('wt-change').textContent = 'Log more to see trend';
  }
}

const _origRenderWeek = renderWeek;

