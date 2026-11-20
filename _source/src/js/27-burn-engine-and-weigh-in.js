// ---- Adaptive engine ----
const LASTPROMPT_KEY = 'calorielastprompt';
const KCAL_PER_KG = 7700;

function ewma(values, alpha){
  if(values.length===0) return null;
  let s = values[0];
  for(let i=1;i<values.length;i++) s = alpha*values[i] + (1-alpha)*s;
  return s;
}

function renderDayComplete(){
  const btn = document.getElementById('day-complete');
  if(!btn) return;
  const ds = ymd(currentDate);
  const done = isDayComplete(ds);
  const hasFood = getDailyIntake(ds) > 0;
  const box = document.getElementById('dc-box');
  const lab = document.getElementById('dc-label');
  const sub = document.getElementById('dc-sub');

  box.innerHTML = done ? '<i class="ti ti-check"></i>' : '';
  box.style.background = done ? 'var(--accent)' : 'transparent';
  box.style.borderColor = done ? 'var(--accent)' : 'var(--border)';
  box.style.color = done ? '#0b1a12' : 'transparent';
  btn.style.borderColor = done ? 'var(--accent)' : 'var(--border)';
  lab.style.color = done ? 'var(--accent)' : 'var(--text)';

  if(done){
    lab.textContent = 'Day confirmed complete';
    sub.textContent = 'Counting toward your averages — tap to undo';
  } else if(!hasFood){
    lab.textContent = 'Nothing logged yet';
    sub.textContent = 'Confirm the day once you have logged everything you ate';
  } else {
    lab.textContent = 'Everything logged for this day?';
    sub.textContent = 'Until you confirm, this day is left out of your averages';
  }
}

// ---- day completion ----
// A day only counts toward averages once you have confirmed you logged all of
// it. Otherwise a day where you forgot dinner reads as a 900 kcal day and drags
// every average — and the adaptive engine — down with it.
const COMPLETE_PREFIX = 'caloriecomplete:';
const COMPLETE_MIGRATED = 'coachcompletemigrated';

function isDayComplete(dateStr){
  return CS.getItem(COMPLETE_PREFIX+dateStr) === '1';
}
function setDayComplete(dateStr, val){
  if(val) lsSet(COMPLETE_PREFIX+dateStr, '1');
  else { CS.removeItem(COMPLETE_PREFIX+dateStr); dataEpoch++; scoreEpoch++; logEpoch++; }
  try{ museSyncSoon(); }catch(e){}
}

// One-time grandfathering. Every day logged before this feature existed is
// treated as complete — there is no way to know retrospectively, and the
// alternative wipes out all existing averages and the 14-day adaptive runway.
// force: run it again over whatever is now in storage. An old backup restored
// onto a device that had already migrated brought days in with no completion
// mark at all, so they were logged but counted nowhere.
function migrateCompletion(force){
  if(!force && CS.getItem(COMPLETE_MIGRATED) === '1') return;
  const keys = [];
  for(let i=0;i<CS.length;i++){
    const k = CS.key(i);
    if(k && k.indexOf(STORE_KEY_PREFIX)===0) keys.push(k.slice(STORE_KEY_PREFIX.length));
  }
  const today = todayYMD();
  for(const ds of keys){
    if(ds === today) continue;              // today is still in progress
    if(getDailyIntake(ds) > 0 && !isDayComplete(ds)) setDayComplete(ds, true);
  }
  lsSet(COMPLETE_MIGRATED, '1');
}
migrateCompletion();


function getDailyIntake(dateStr){
  try{
    const es = JSON.parse(CS.getItem(STORE_KEY_PREFIX+dateStr)) || [];
    return es.reduce((s,e)=>s+e.kcal,0);
  }catch(e){ return 0; }
}

// The whole day, not just its calories. A review that cannot see protein cannot
// say anything about whether a surplus became muscle.
function getDailyMacros(dateStr){
  try{
    const es = JSON.parse(CS.getItem(STORE_KEY_PREFIX+dateStr)) || [];
    return es.reduce((a,e)=>{
      a.kcal    += e.kcal || 0;
      a.protein += e.protein || 0;
      a.carbs   += e.carbs || 0;
      a.fat     += e.fat || 0;
      return a;
    }, {kcal:0, protein:0, carbs:0, fat:0});
  }catch(e){ return {kcal:0, protein:0, carbs:0, fat:0}; }
}

/* ---- how fast is the weight actually moving, and how sure can we be ----
   The adaptive engine works backwards: it takes what you ate, watches what
   your weight did, and calls the difference your maintenance. That means any
   error in the weight reading gets multiplied by 1100 kcal per kg per day
   before it reaches your target.

   Measured on a simulated bulk - 3000 kcal a day against a true maintenance
   of 2700 - the old two-window method read anywhere from 2287 to 3261 once
   normal daily weight swing was included. A 974 kcal spread, to measure a
   300 kcal surplus. Right on average, wrong most weeks.

   So this fits a straight line through every weigh-in instead of comparing
   two averages, and - the part that matters - it reports how uncertain that
   line is. A change smaller than its own uncertainty is not a change.        */


/* ---- what you actually burn ----
   Not a formula. Your weight went one way, your food went in, and the gap
   between them is your real maintenance - measured, not estimated from height
   and age. It is the one number a calculator cannot give you, it moves with
   training, sleep and NEAT, and watching it move is what tells you whether a
   plateau is a real stall or just water.

   The same arithmetic runs on each of the last eight weeks, so the number has
   a history rather than being a single reading you have to trust.            */
/* ---- expenditure, measured continuously ----
   The fortnightly window was a blunt instrument: it needed ten confirmed days
   out of fourteen, and every day outside it counted for nothing while every
   day inside it counted the same. This reads a MONTH and weights it - a
   weigh-in from yesterday carries about twice the weight of one from ten days
   ago (a ten-day half-life). Gaps stop mattering, the number moves the day
   after a real change rather than a fortnight later, and the error bar still
   falls out of the same arithmetic instead of being asserted.               */
const TDEE_WINDOW = 28, TDEE_HALFLIFE = 10;
function weightedTrend(points){
  let sw = 0, sx = 0, sy = 0;
  points.forEach(p=>{ sw += p.w; sx += p.w * p.day; sy += p.w * p.kg; });
  if(!(sw > 0)) return null;
  const mx = sx / sw, my = sy / sw;
  let sxx = 0, sxy = 0;
  points.forEach(p=>{ const dx = p.day - mx; sxx += p.w * dx * dx; sxy += p.w * dx * (p.kg - my); });
  if(!(sxx > 0)) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let ss = 0, sw2 = 0;
  points.forEach(p=>{ const r = p.kg - (intercept + slope * p.day); ss += p.w * r * r; sw2 += p.w * p.w; });
  // Effective sample size: six heavily-weighted points do not carry the
  // confidence of a dozen even ones, and the error bar has to know that.
  const nEff = (sw * sw) / sw2;
  if(points.length < 4 || nEff < 3) return null;
  const varResid = (ss / sw) * (nEff / Math.max(1, nEff - 2));
  const seSlope = Math.sqrt(varResid / sxx);
  const lastDay = Math.max.apply(null, points.map(p=>p.day));
  return {slope: slope, seSlope: seSlope, residSd: Math.sqrt(varResid), n: points.length, nEff: nEff,
          weekly: slope * 7, seWeekly: seSlope * 7, at: intercept + slope * lastDay};
}
function tdeeAt(endDate){
  const end = new Date(endDate); end.setHours(0,0,0,0);
  const start = addDays(end, -TDEE_WINDOW);
  const wt = age => Math.pow(0.5, age / TDEE_HALFLIFE);
  const pts = loadWeightLog()
    .map(e=>({d: parseYMD(e.date), kg: Number(e.kg)}))
    .filter(p=>p.d && p.d >= start && p.d <= end && isFinite(p.kg) && p.kg > 0)
    .map(p=>({day: Math.round((p.d - start) / 86400000), kg: p.kg,
              w: wt(Math.round((end - p.d) / 86400000))}))
    .sort((a,b)=>a.day - b.day);
  if(pts.length < 4) return null;
  const trend = weightedTrend(pts);
  if(!trend) return null;
  let sum = 0, wsum = 0, days = 0;
  // v134: the food that shows up on the scales at `end` is the food eaten
  // BEFORE that morning - so the days end-1 back, not `end` itself.
  for(let i = 1; i <= TDEE_WINDOW; i++){
    const ds = ymd(addDays(end, -i));
    const k = getDailyIntake(ds);
    if(!(k > 0) || !isDayComplete(ds)) continue;
    const w = wt(i);
    sum += k * w; wsum += w; days++;
  }
  if(days < 6 || !(wsum > 0)) return null;
  const avgIntake = sum / wsum;
  // Scales, water and what is still in your gut mean the real uncertainty is
  // never zero, however straight the line happens to look.
  return {tdee: avgIntake - (trend.slope * KCAL_PER_KG),
          se: Math.max(60, trend.seSlope * KCAL_PER_KG),
          avgIntake: avgIntake, weekly: trend.weekly, days: days, kg: trend.at,
          noiseKg: trend.residSd, weighIns: pts.length};
}

/* v135: THE reading of what you burn, used by every screen - the Week card,
   the Data screen, Profile, the suggestion and the weekly review. It is read
   as of the morning after your last confirmed day: until yesterday is ticked,
   this morning's weigh-in waits for the food that explains it. Before this
   there were three engines giving three different numbers. */
function burnAnchor(){
  const t = new Date(); t.setHours(0,0,0,0);
  for(let i = 1; i <= 7; i++){
    if(isDayComplete(ymd(addDays(t, -i)))) return addDays(t, -i + 1);
  }
  return t;
}
function burnNow(){ return tdeeAt(burnAnchor()); }

function tdeeSeries(weeks){
  const out = [];
  const today = new Date(); today.setHours(0,0,0,0);
  for(let i = (weeks || 8) - 1; i >= 0; i--){
    const end = addDays(today, -7 * i);
    const t = tdeeAt(end);
    if(t) out.push({date: ymd(end), tdee: t.tdee, se: t.se, kg: t.kg, weekly: t.weekly});
  }
  return out;
}
// When you get there, at the rate the scales are actually moving.
function goalProjection(){
  const p = loadProfile();
  const goalKg = Number(p.targetWeight);
  const t = burnNow();
  if(!t || !(goalKg > 0) || !(t.kg > 0)) return null;
  const gap = goalKg - t.kg;
  if(Math.abs(gap) < 0.3) return {there: true, kg: t.kg, goalKg: goalKg};
  if(!t.weekly || (gap > 0) !== (t.weekly > 0)) return {stalled: true, kg: t.kg, goalKg: goalKg, weekly: t.weekly};
  const weeks = gap / t.weekly;
  if(!isFinite(weeks) || weeks <= 0 || weeks > 260) return {stalled: true, kg: t.kg, goalKg: goalKg, weekly: t.weekly};
  const when = addDays(new Date(), Math.round(weeks * 7));
  return {weeks: weeks, when: when, kg: t.kg, goalKg: goalKg, weekly: t.weekly};
}
/* Working backwards from a date instead of forwards from a pace. "85 kg by
   March" is the question people actually have; a weekly rate is the answer to
   it, not the question. Anything past about 1% of bodyweight a week is called
   out rather than quietly handed over.                                       */
const GOALDATE_KEY = 'coachgoaldate';
function goalDatePlan(){
  let iso = '';
  try{ iso = CS.getItem(GOALDATE_KEY) || ''; }catch(e){}
  if(!iso) return null;
  const when = parseYMD(iso);
  const now = burnNow();
  const goalKg = Number(loadProfile().targetWeight);
  if(!when || !isFinite(when.getTime()) || !now || !(goalKg > 0)) return {iso: iso, noData: !now};
  const today = new Date(); today.setHours(0,0,0,0);
  const weeks = (when - today) / (7 * 86400000);
  if(!(weeks > 0.5)) return {past: true, iso: iso};
  const gap = goalKg - now.kg;
  const rate = gap / weeks;
  const kcal = now.tdee + (rate * KCAL_PER_KG / 7);
  const pct = Math.abs(rate) / Math.max(1, now.kg) * 100;
  const floor = (loadProfile().sex === 'female') ? 1200 : 1500;
  return {iso: iso, when: when, weeks: weeks, rate: rate, kcal: Math.round(kcal),
          gap: gap, kg: now.kg, goalKg: goalKg, tdee: now.tdee,
          hard: pct > 1, silly: pct > 1.5, belowFloor: kcal < floor, floor: floor};
}

function renderExpenditure(){
  const card = document.getElementById('expend-card');
  const box = document.getElementById('expend-body');
  if(!card || !box) return;
  const now = burnNow();
  if(!now){ card.style.display = 'none'; return; }
  card.style.display = '';
  const series = tdeeSeries(8);
  const lo = Math.round(now.tdee - now.se), hi = Math.round(now.tdee + now.se);
  const proj = goalProjection();
  const drift = series.length > 2 ? Math.round(series[series.length-1].tdee - series[0].tdee) : null;

  let html = '<div style="display:flex; align-items:baseline; gap:8px;">'+
    '<span style="font-size:30px; font-weight:700; letter-spacing:-0.5px;">'+fmt0(now.tdee)+'</span>'+
    '<span style="font-size:12.5px; color:var(--text3);">kcal a day, measured</span></div>'+
    '<div style="font-size:12px; color:var(--text3); margin-top:2px;">Somewhere between <b style="color:var(--text2)">'+
      fmt0(lo)+'</b> and <b style="color:var(--text2)">'+fmt0(hi)+'</b> — '+now.days+
      ' confirmed days against '+fmt0(now.avgIntake)+' eaten.</div>';

  if(series.length >= 3){
    const pts = series.map((x,i)=>({x:i, y:x.tdee}));
    html += '<div style="margin-top:12px;">'+dataLine(pts, {colour:'var(--accent)', h:64})+'</div>'+
      '<div style="display:flex; justify-content:space-between; font-size:10.5px; color:var(--text3); margin-top:-2px;">'+
      '<span>'+(series.length - 1)+' weeks ago</span><span>now</span></div>';
    if(drift !== null && Math.abs(drift) >= 75){
      html += '<div style="font-size:12px; color:var(--text2); line-height:1.5; margin-top:8px;">Your burn has '+
        (drift > 0 ? 'risen' : 'dropped')+' by about <b>'+fmt0(Math.abs(drift))+' kcal</b> over that stretch.'+
        (drift < 0 ? ' That is normal on a cut — eat to the new number, not the old one.' : '')+'</div>';
    }
  }
  if(proj){
    html += '<div style="font-size:12.5px; color:var(--text2); line-height:1.55; margin-top:10px; padding-top:10px; border-top:0.5px solid var(--border);">';
    if(proj.there) html += 'You are at your goal weight of <b>'+round2(proj.goalKg)+' kg</b>.';
    else if(proj.stalled) html += 'At <b>'+round2(proj.kg)+' kg</b>, going the wrong way for a <b>'+round2(proj.goalKg)+
      ' kg</b> goal, or not moving. Nothing to project until that changes.';
    else html += 'At <b>'+(proj.weekly > 0 ? '+' : '')+round2(proj.weekly)+' kg a week</b> you reach <b>'+
      round2(proj.goalKg)+' kg</b> around <b>'+proj.when.toLocaleDateString(undefined,{day:'numeric',month:'long',year:'numeric'})+
      '</b> — about '+Math.round(proj.weeks)+' weeks.';
    html += '</div>';
  }
  const plan = goalDatePlan();
  html += '<div style="margin-top:12px; padding-top:10px; border-top:0.5px solid var(--border);">'+
    '<div style="display:flex; align-items:center; gap:8px; justify-content:space-between;">'+
    '<span style="font-size:12px; color:var(--text3);">Want it by a date?</span>'+
    '<input type="date" id="goaldate-input" value="'+esc(plan && plan.iso ? plan.iso : '')+'" '+
    'style="background:var(--card2); border:0.5px solid var(--border); color:var(--text); '+
    'border-radius:8px; padding:5px 8px; font:inherit; font-size:12px;"></div>';
  if(plan && plan.when && !plan.past){
    // A date that cannot be met has no calorie figure worth printing:
    // "-7,125 kcal a day" is not information, it is noise.
    const impossible = plan.belowFloor || plan.silly;
    html += '<div style="font-size:12.5px; color:var(--text2); line-height:1.55; margin-top:8px;">'+
      (impossible
        ? 'To be <b>'+round2(plan.goalKg)+' kg</b> by then you would have to '+
          (plan.rate < 0 ? 'lose' : 'gain')+' <b>'+round2(Math.abs(plan.rate))+' kg a week</b> \u2014 not '+
          'something a body does'+(plan.belowFloor ? ' on food you could actually eat' : ' without giving up muscle')+
          '. Pick a later date.'
        : 'To be <b>'+round2(plan.goalKg)+' kg</b> by then you need <b>'+
          (plan.rate > 0 ? '+' : '')+round2(plan.rate)+' kg a week</b> \u2014 about <b>'+
          fmt0(plan.kcal)+' kcal a day</b> against the '+fmt0(plan.tdee)+' you burn.'+
          (plan.hard ? ' That is the aggressive end \u2014 doable, but it costs some muscle if you hold it for months.'
                     : ' That is a sensible pace.'))+'</div>';
  } else if(plan && plan.past){
    html += '<div style="font-size:12px; color:var(--text3); margin-top:8px;">That date has been and gone.</div>';
  }
  html += '</div>';
  box.innerHTML = html;
  const gi = document.getElementById('goaldate-input');
  if(gi) gi.onchange = ()=>{
    if(gi.value) lsSet(GOALDATE_KEY, gi.value); else CS.removeItem(GOALDATE_KEY);
    renderExpenditure();
  };
}

function renderAdaptive(){
  // v135: the same check as the Day screen card and Settings - one number.
  const body = document.getElementById('adaptive-body');
  const actions = document.getElementById('adaptive-actions');
  actions.style.display = 'none';
  let a = null;
  try{ a = adaptSuggestion(); }catch(e){ a = null; }
  if(!a){ body.innerHTML = ''; return; }
  if(a.state === 'suggest'){
    const up = a.to > a.from;
    body.innerHTML = '<div style="font-size:19px; font-weight:700; color:var(--text); margin:2px 0 6px;">' + fmtK(a.from) + ' \u2192 ' + fmtK(a.to) +
      ' kcal <span style="font-size:13px; font-weight:500; color:var(--text3);">(' + (up ? '+' : '\u2212') + fmtK(Math.abs(a.to - a.from)) + ')</span></div>' + esc(adaptWhy(a));
    actions.style.display = 'block';
    document.getElementById('apply-adaptive-btn').dataset.kcal = a.to;
    return;
  }
  body.innerHTML = adaptStatusText();
}

document.getElementById('apply-adaptive-btn').onclick = (e)=>{
  // v135: applies exactly what the suggestion says now, by its rules.
  const now = adaptSuggestion();
  if(now.state !== 'suggest'){ renderWeek(); return; }
  setTargets(macrosFor(now.to), 'adaptive', adaptWhy(now));
  lsSet(LASTAUTO_KEY, todayYMD());
  try{ buzz('big'); }catch(err){}

  renderWeek();
  renderAdjustLog();
};

// ---- Morning weigh-in prompt ----
function maybePromptWeighIn(){
  const todayStr = todayYMD();
  const log = loadWeightLog();
  if(log.some(e=>e.date===todayStr)) return;
  if(CS.getItem(LASTPROMPT_KEY) === todayStr) return;
  const profile = loadProfile();
  if(!profile.weight) return; // don't prompt before setup
  const hour = new Date().getHours();
  if(hour < 4 || hour > 12) return; // morning window only
  // There used to be a Notification here. It only ever fired while the app was
  // already open and on screen, six tenths of a second before the sheet below
  // appeared - so it told you nothing the sheet was not about to tell you, and
  // it was the only reason the app asked for notification permission at all.
  setTimeout(()=>openWeighIn(todayStr, true), 600);
}

let weighinDate = null;

// Opens the weigh-in sheet for a given day. `auto` means the morning prompt
// raised it, so the skip button stays; opened by hand it is not a prompt to skip.
// Set when the sheet was opened to fill in a missed day, so saving can drop you
// back into the list to do the next one rather than out to the day screen.
let weighinFrom = null;

function openWeighIn(dateStr, auto, from){
  weighinFrom = from || null;
  weighinDate = dateStr || todayYMD();
  const isToday = weighinDate === todayYMD();
  const log = loadWeightLog();
  const existing = log.find(e=>e.date===weighinDate);
  document.getElementById('weighin-title').textContent =
    existing ? 'Update weigh-in' : (isToday && auto ? 'Morning weigh-in' : 'Log weight');
  document.getElementById('weighin-for').textContent =
    (isToday ? 'For today' : 'For ' + prettyDate(weighinDate)) +
    (existing ? ' — currently ' + existing.kg + 'kg' : '');
  // v132: start from your most recent weight before this day, so a normal
  // morning is a tap on +0.1 / −0.1 and Save, not typing a number.
  const before = log.filter(e=>e.date < weighinDate).slice(-1)[0];
  document.getElementById('weighin-input').value = existing ? existing.kg : (before ? before.kg : '');
  document.getElementById('weighin-last').textContent = (!existing && before)
    ? 'Started at your last weigh-in (' + before.kg + ' kg, ' + prettyDate(before.date) + '). Adjust and save.' : '';
  document.getElementById('weighin-err').style.display = 'none';
  document.getElementById('weighin-skip').style.display = auto ? '' : 'none';
  openSheet('weighin-backdrop');
}

// The days in the last fortnight with no weigh-in. Adaptive wants three a week
// across two weeks, so one missed morning used to quietly push the whole
// feature out of reach with nothing in the app able to fill it back in.
const WEIGH_BACKFILL_DAYS = 14;
function missedWeighDays(){
  const have = new Set(loadWeightLog().map(e=>e.date));
  const out = [];
  const d = new Date(); d.setHours(0,0,0,0);
  for(let i = 0; i < WEIGH_BACKFILL_DAYS; i++){
    const key = ymd(d);
    if(!have.has(key)) out.push(key);
    d.setDate(d.getDate() - 1);
  }
  return out;
}

function renderMissedWeighDays(){
  const box = document.getElementById('whist-missed');
  if(!box) return;
  const missed = missedWeighDays();
  if(!missed.length){ box.innerHTML = ''; return; }
  box.innerHTML = '<div class="section-title" style="margin-top:0;">Missed days</div>'+
    '<div class="quick-portions" style="margin-bottom:12px;">' +
    missed.map(d=>'<button class="qp" data-wmiss="'+d+'">'+
      esc(parseYMD(d).toLocaleDateString('en-GB',{weekday:'short', day:'numeric', month:'short'}))+
      '</button>').join('') + '</div>';
  box.querySelectorAll('[data-wmiss]').forEach(b=>{
    b.onclick = ()=>{
      closeSheet('whist-backdrop');
      setTimeout(()=>openWeighIn(b.dataset.wmiss, false, 'history'), HANDOFF);
    };
  });
}

