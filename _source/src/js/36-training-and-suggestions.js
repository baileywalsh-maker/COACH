// ---- Day type & calorie cycling ----
const TRAIN_KEY_PREFIX = 'calorietrain:';
const CYCLE_KEY = 'caloriecycle';

function trainKey(d){ return TRAIN_KEY_PREFIX + ymd(asDate(d)); }
function isTrainingDay(d){ return CS.getItem(trainKey(d)) === '1'; }
function setTrainingDay(d,v){
  if(v) lsSet(trainKey(d),'1'); else { CS.removeItem(trainKey(d)); dataEpoch++; scoreEpoch++; logEpoch++; }
  try{ museSyncSoon(); }catch(e){}
}

function loadCycle(){
  try{ return JSON.parse(CS.getItem(CYCLE_KEY)) || {on:false, trainingDays:4, boost:15}; }
  catch(e){ return {on:false, trainingDays:4, boost:15}; }
}
function saveCycle(cfg){ lsSet(CYCLE_KEY, JSON.stringify(cfg)); }

// How many days in a span were ticked as training days.
function trainingDaysIn(start, n){
  let c = 0;
  for(let i=0;i<n;i++){ try{ if(isTrainingDay(addDays(start, i))) c++; }catch(e){} }
  return c;
}
// Training per week over the last `days`, and over the same length before it.
// Only says something once you have actually ticked training days.
function trainingNote(days, under){
  const today = new Date(); today.setHours(0,0,0,0);
  const nowN  = trainingDaysIn(addDays(today, -days + 1), days);
  const prevN = trainingDaysIn(addDays(today, -2*days + 1), days);
  if(!nowN && !prevN) return '';
  const pw = n => (n / days * 7).toFixed(1).replace(/\.0$/, '');
  let t = ' You trained ' + pw(nowN) + ' days a week over this period' + (prevN ? ' (' + pw(prevN) + ' a week in the period before)' : '') + '.';
  if(under && prevN && nowN > prevN) t += ' More training burns more, which is likely part of why your weight moved less than planned.';
  return t;
}

// Returns the effective targets for a given date, honouring cycling.
// Weekly total is preserved: training-day surplus is funded by rest-day deficit.
function targetsFor(d){
  // v130: the same calories and protein every day, training or rest. The
  // training tick is information now (it still raises the water target), and
  // the reviews use it to explain progress. Your old cycling setting is left
  // in storage untouched; it is simply no longer read.
  if(CYCLING_RETIRED) return targets;
  const cfg = loadCycle();
  if(!cfg.on) return targets;
  const sexF = (loadProfile().sex==='female') ? 'f' : 'm';
  const floorF = sexF==='m' ? 1500 : 1200;
  if(targets.kcal <= floorF * 1.15) return targets;
  const t = Math.max(1, Math.min(7, cfg.trainingDays));
  const r = 7 - t;
  const boost = cfg.boost/100;

  const weekly = targets.kcal * 7;
  const sex = (loadProfile().sex==='female') ? 'f' : 'm';
  const floor = sex==='m' ? 1500 : 1200;

  // trainKcal = base*(1+boost); restKcal funds it so t*train + r*rest = weekly.
  // Clamp the boost so rest days never fall below the safe floor.
  let trainKcal = targets.kcal * (1+boost);
  let restKcal = r > 0 ? (weekly - t*trainKcal)/r : trainKcal;
  if(r > 0 && restKcal < floor){
    restKcal = floor;
    trainKcal = (weekly - r*floor)/t;
  }

  const isTrain = isTrainingDay(d);
  const kcal = Math.round(isTrain ? trainKcal : restKcal);

  // protein and fat held constant; carbs absorb the swing
  const carbs = Math.max(0, Math.round((kcal - targets.protein*4 - targets.fat*9)/4));
  return { kcal, protein: targets.protein, fat: targets.fat, carbs };
}

function renderTrainToggle(){
  const isTrain = isTrainingDay(currentDate);
  const cfg = loadCycle();
  // v144: a logged workout names itself here ("Push · 62 min").
  let wl = null; try{ if(typeof trChipLabel === 'function') wl = trChipLabel(currentDate); }catch(e){}
  document.getElementById('traintoggle-label').textContent = wl || (isTrain ? 'Training day' : 'Rest day');
  document.getElementById('traintoggle').style.borderColor = isTrain ? 'var(--accent)' : 'var(--border)';
  const hint = document.getElementById('traintoggle-hint');
  if(CYCLING_RETIRED){
    // v130: calories no longer change with this; water does.
    hint.textContent = isTrain ? '+' + ((typeof trTopUpMl === 'function' ? trTopUpMl(currentDate) : 500) / 1000).toFixed(1) + ' L water' : 'Change';
    hint.style.color = isTrain ? 'var(--accent)' : 'var(--text2)';
  } else if(cfg.on){
    const t = targetsFor(currentDate);
    hint.textContent = t.kcal + ' kcal target';
    hint.style.color = 'var(--accent)';
  } else {
    hint.textContent = 'Change';
    hint.style.color = 'var(--text2)';
  }
}

document.getElementById('traintoggle').onclick = ()=>{
  setTrainingDay(currentDate, !isTrainingDay(currentDate));
  // The day's target is frozen the moment the first food is logged. Flipping
  // this afterwards changed what the day screen showed but not what was frozen,
  // so the budget, the history and the reviews went on judging the day against
  // a target the app had stopped displaying. Re-freeze it to what is now true.
  recordTargetSnapshot(currentDate);
  renderDay();
};

function renderCyclePreview(){
  const el = document.getElementById('cycle-preview');
  if(!el) return;
  const cfg = loadCycle();
  const sexC = (loadProfile().sex==='female') ? 'f' : 'm';
  const floorC = sexC==='m' ? 1500 : 1200;
  if(targets.kcal <= floorC * 1.15){
    el.innerHTML = '<span style="color:var(--danger);">Your daily target is already close to the minimum, so there is no room to shift calories between days. Cycling is off until your target is higher.</span>';
    return;
  }
  const t = Math.max(1, Math.min(7, cfg.trainingDays));
  const r = 7 - t;
  const weekly = targets.kcal*7;
  const sex = (loadProfile().sex==='female') ? 'f' : 'm';
  const floor = sex==='m' ? 1500 : 1200;
  let train = targets.kcal*(1+cfg.boost/100);
  let rest = r>0 ? (weekly - t*train)/r : train;
  let clamped = false;
  if(r>0 && rest < floor){ rest = floor; train = (weekly - r*floor)/t; clamped = true; }
  el.innerHTML = 'Training days: <strong style="color:var(--accent);">'+fmt0(train)+' kcal</strong> &nbsp;·&nbsp; Rest days: <strong style="color:var(--text);">'+fmt0(rest)+' kcal</strong>'+
    (clamped ? '<br><span style="color:var(--danger);">That split pushed rest days below the safe minimum, so it has been eased back. Reduce the boost or the number of training days for a cleaner split.</span>' : '');
}

document.getElementById('pring-toggle').onchange = (e)=>{
  setProteinRing(e.target.checked);
  applyHud();
};

document.getElementById('auto-toggle').onchange = (e)=>{
  setAuto(e.target.checked);
  if(e.target.checked){ runAutoAdapt(); renderAdjustLog(); }
  if(currentView==='day') renderDay(); else renderWeek();
};

/* v129: changing calorie cycling changes today's target without touching your
   base target, so it never showed up in the target history - the day screen
   moved and nothing said why. Now it is written down, and today's frozen copy
   is updated with it. */
function cycleChanged(before){
  try{
    const now = new Date(); now.setHours(0,0,0,0);
    recordTargetSnapshot(now);
    const after = Math.round(targetsFor(now).kcal);
    if(after !== before){
      const cfg = loadCycle();
      pushAdjust({date: todayYMD(), from: before, to: after, source: 'cycling',
        why: cfg.on ? 'Calorie cycling ' + (isTrainingDay(now) ? '(today is a training day)' : '(today is a rest day)') +
                      ': ' + cfg.trainingDays + ' training days a week, +' + cfg.boost + '%. Your weekly total stays at ' + fmtK(targets.kcal * 7) + '.'
                    : 'Calorie cycling turned off. Every day is back to ' + fmtK(targets.kcal) + '.'});
      try{ renderAdjustLog(); }catch(e){}
    }
  }catch(e){}
}
document.getElementById('cycle-toggle').onchange = (e)=>{
  const before = Math.round(targetsFor(new Date()).kcal);
  const cfg = loadCycle();
  cfg.on = e.target.checked;
  saveCycle(cfg);
  cycleChanged(before);
  renderCyclePreview();
  if(currentView==='day') renderDay(); else renderWeek();
};
['cycle-training','cycle-split'].forEach(id=>{
  document.getElementById(id).addEventListener('change', ()=>{
    const before = Math.round(targetsFor(new Date()).kcal);
    const cfg = loadCycle();
    cfg.trainingDays = Number(document.getElementById('cycle-training').value)||4;
    cfg.boost = Number(document.getElementById('cycle-split').value)||15;
    saveCycle(cfg);
    cycleChanged(before);
    renderCyclePreview();
    if(currentView==='day') renderDay(); else renderWeek();
  });
});


// ---- Auto-adaptation ----
// Two regimes:
//  1. Before 14 weigh-ins: recompute the formula target as bodyweight changes.
//  2. After 14 weigh-ins: the adaptive engine supersedes the formula entirely,
//     since a measured TDEE beats a predicted one.
const AUTO_KEY = 'calorieauto';
const ADJUSTLOG_KEY = 'calorieadjustlog';
const LASTAUTO_KEY = 'calorielastauto';

function autoOn(){ return CS.getItem(AUTO_KEY) !== '0'; }
function setAuto(v){ lsSet(AUTO_KEY, v ? '1' : '0'); }

function loadAdjustLog(){ try{ return JSON.parse(CS.getItem(ADJUSTLOG_KEY))||[]; }catch(e){ return []; } }
function pushAdjust(entry){
  const log = loadAdjustLog();
  log.unshift(entry);
  lsSet(ADJUSTLOG_KEY, JSON.stringify(log.slice(0,20)));
}

// Recompute macros for a given calorie figure, holding the profile's protein/fat rules.
function macrosFor(kcal){
  const p = loadProfile();
  const weight = p.weight || 75;
  const goal = p.goal || 'maintain';
  const proteinPerKg = { lose:2.2, build:2.0, recomp:2.2, maintain:1.8 }[goal];
  const protein = Math.round(proteinPerKg * weight);
  const fat = Math.round(Math.max((kcal*0.25)/9, 0.6*weight));
  const carbs = Math.max(0, Math.round((kcal - protein*4 - fat*9)/4));
  return { kcal: Math.round(kcal), protein, carbs, fat };
}

// Formula target from current profile — used before the adaptive engine has data.
// Resting burn. Mifflin-St Jeor is the best validated equation when all you
// have is height, weight, age and sex - but if you know your body fat, Katch-
// McArdle is better, because it works off lean mass and stops two people of the
// same weight and very different composition being handed the same number.
// The field was collected and then never read; this is where it goes.
//
// Katch-McArdle: BMR = 370 + 21.6 x lean mass (kg).
function bmrFor(p){
  const bf = Number(p.bodyfat);
  // Outside this range the reading is a typo, not a body. Fall back rather than
  // hand the whole target over to a bad number.
  if(bf > 3 && bf < 60){
    const lean = p.weight * (1 - bf/100);
    return 370 + 21.6 * lean;
  }
  return p.sex==='female'
    ? (10*p.weight + 6.25*p.height - 5*p.age - 161)
    : (10*p.weight + 6.25*p.height - 5*p.age + 5);
}

function formulaTarget(){
  const p = loadProfile();
  if(!p.age || !p.height || !p.weight) return null;
  const bmr = bmrFor(p);
  const tdee = bmr * (p.activity || 1.55);
  const adj = {
    lose:    { conservative:-0.10, moderate:-0.20, aggressive:-0.25 },
    build:   { conservative: 0.10, moderate: 0.15, aggressive: 0.20 },
    recomp:  { conservative:-0.05, moderate: 0.00, aggressive: 0.05 },
    maintain:{ conservative: 0.00, moderate: 0.00, aggressive: 0.00 }
  }[p.goal||'maintain'][p.pace||'moderate'];
  let kcal = tdee * (1+adj);
  const floor = p.sex==='female' ? 1200 : 1500;
  if(kcal < floor) kcal = floor;
  return kcal;
}

// Ongoing adjustments now happen ONLY at the weekly review, so your target
// never moves mid-week. This handles one case: the very first calculation,
// so a new profile does not sit on the 2400 default until Monday.
/* v141: true once the target has ever been set by you, accepted from a
   suggestion or moved by cycling. Weekly entries written by the formula
   itself (they start "Your bodyweight is now") don't count. */
function targetChosenByYou(){
  return loadAdjustLog().some(e => e && (e.source === 'manual' || e.source === 'adaptive' || e.source === 'cycling' ||
    (e.source === 'weekly' && !/^Your bodyweight is now/.test(String(e.why || '')))));
}
function runAutoAdapt(){
  if(!autoOn()) return;
  if(loadAdjustLog().length > 0) return;
  const f = formulaTarget();
  if(!f) return;
  if(Math.abs(f - targets.kcal) < 50) return;
  const p = loadProfile();
  setTargets(macrosFor(f), 'formula',
    'First calculation from your profile at '+p.weight+' kg. From here your target is checked at each weekly review, once Sunday is ticked complete.');
}

/* ============================ v111 - suggested changes ======================
   The weekly review is the only thing that moves the target on its own, and it
   is strict: ten confirmed days in the last fourteen and three weigh-ins in
   each week. Miss either and it says nothing, for as many weeks as that lasts.

   This checks every time the day screen is drawn, off the month-long weighted
   reading the "what you actually burn" card already uses, and when a change is
   due it ASKS. It never moves the target itself. It asks only when:
     - there are at least 6 weigh-ins and 10 confirmed days in the last 4 weeks
     - the change is at least 75 kcal AND bigger than the reading's own error
     - the target has not changed in the last 7 days
     - you have not said "not now" in the last 7 days
   Otherwise the settings page says, in a sentence, what it is waiting for.   */
const ADAPT_SNOOZE_KEY = 'coachadaptsnooze';
const ADAPT_MIN_WEIGHINS = 6, ADAPT_MIN_DAYS = 10, ADAPT_MIN_MOVE = 75, ADAPT_COOLDOWN = 7;
function adaptSuggestion(){
  if(!autoOn()) return {state:'off'};
  const p = loadProfile();
  if(!p.weight) return {state:'noprofile'};
  const today = new Date(); today.setHours(0,0,0,0);
  const start = addDays(today, -TDEE_WINDOW);
  const weighIns = loadWeightLog().filter(e=>{ const d = parseYMD(e.date); return d && d >= start && d <= today && Number(e.kg) > 0; }).length;
  let fullDays = 0, openDays = 0;
  for(let i = 1; i <= TDEE_WINDOW; i++){
    const ds = ymd(addDays(today, -i));
    if(!(getDailyIntake(ds) > 0)) continue;
    if(isDayComplete(ds)) fullDays++; else openDays++;
  }
  const base = {weighIns: weighIns, fullDays: fullDays, openDays: openDays};
  if(weighIns < ADAPT_MIN_WEIGHINS || fullDays < ADAPT_MIN_DAYS)
    return Object.assign(base, {state:'wait',
      needWeigh: Math.max(0, ADAPT_MIN_WEIGHINS - weighIns), needDays: Math.max(0, ADAPT_MIN_DAYS - fullDays)});
  // v134: this morning's weight is the result of yesterday's eating. Until
  // yesterday is ticked complete, nothing is suggested - a weigh-in alone
  // never brings up a change.
  if(!isDayComplete(ymd(addDays(today, -1)))) return Object.assign(base, {state:'yesterday'});
  const t = burnNow();
  if(!t) return Object.assign(base, {state:'wait', needWeigh: 0, needDays: 0});
  const rate = planRate();
  const cur = Math.round(targets.kcal);
  const raw = t.tdee + rate * KCAL_PER_KG / 7;
  const cap = cur * 0.10;
  let to = Math.max(cur - cap, Math.min(cur + cap, raw));
  const capped = Math.abs(to - raw) > 1;
  const floor = p.sex === 'female' ? 1200 : 1500;
  let floored = false;
  if(to < floor){ to = floor; floored = true; }
  to = Math.round(to / 10) * 10;
  const out = Object.assign(base, {from: cur, to: to, tdee: t.tdee, se: t.se, avgIntake: t.avgIntake,
    weekly: t.weekly, rate: rate, capped: capped, floored: floored});
  const move = Math.abs(to - cur);
  if(move < ADAPT_MIN_MOVE) return Object.assign(out, {state:'fine'});
  if(move <= t.se) return Object.assign(out, {state:'noisy'});
  const log = loadAdjustLog();
  if(log.length && log[0].date){
    const next = ymd(addDays(parseYMD(log[0].date), ADAPT_COOLDOWN));
    if(next > todayYMD()) return Object.assign(out, {state:'cooldown', changed: log[0].date, next: next});
  }
  let sn = null;
  try{ sn = JSON.parse(CS.getItem(ADAPT_SNOOZE_KEY)); }catch(e){}
  if(sn && sn.until && sn.until > todayYMD()) return Object.assign(out, {state:'snoozed', next: sn.until});
  return Object.assign(out, {state:'suggest'});
}
function adaptWhy(a){
  const wk = Math.abs(a.weekly) < 0.05 ? 'your weight has held steady'
    : 'your weight has been going ' + (a.weekly > 0 ? 'up' : 'down') + ' about ' + Math.abs(a.weekly).toFixed(2) + ' kg a week';
  const want = Math.abs(a.rate) < 0.01 ? 'holding steady' : ((a.rate > 0 ? 'gaining ' : 'losing ') + Math.abs(a.rate).toFixed(2) + ' kg a week');
  let s = 'Over the last four weeks ' + wk + ' while you averaged ' + fmt0(a.avgIntake) +
    ' kcal a day. That puts what you actually burn at about ' + fmt0(a.tdee) + ' kcal (give or take ' + fmt0(a.se) +
    '). Your goal is ' + want + '. From ' + a.weighIns + ' weigh-ins and ' + a.fullDays + ' confirmed days.';
  if(a.capped) s += ' Capped at 10% so one change cannot swing your plan too hard.';
  if(a.floored) s += ' Stopped at the minimum calorie floor.';
  try{ s += trainingNote(TDEE_WINDOW, a.weekly < a.rate - 0.05); }catch(e){}
  return s;
}
/* v143: the card shows the reasons as three short lines. The full sentence
   (adaptWhy) is still what is saved with the change in the history. */
function adaptWhyShort(a){
  const sg = v => (v > 0 ? '+' : v < 0 ? '\u2212' : '') + Math.abs(v).toFixed(2);
  const goal = Math.abs(a.rate) < 0.01 ? 'hold' : sg(a.rate);
  const row = (k, v) => '<div style="display:flex; justify-content:space-between; gap:10px; padding:3px 0;">' +
    '<span style="color:var(--text3);">' + k + '</span><span style="color:var(--text); font-weight:600; text-align:right;">' + v + '</span></div>';
  let notes = [];
  if(a.capped) notes.push('capped at 10%');
  if(a.floored) notes.push('stopped at the minimum');
  return '<div style="font-size:12.5px; line-height:1.45; margin-top:4px;">' +
    row('Weight', sg(a.weekly) + ' kg/wk <span style="color:var(--text3); font-weight:400;">(goal ' + goal + ')</span>') +
    row('You burn', '~' + fmt0(a.tdee) + ' kcal <span style="color:var(--text3); font-weight:400;">\u00b1' + fmt0(a.se) + '</span>') +
    row('You ate', fmt0(a.avgIntake) + ' kcal/day') +
    '<div style="color:var(--text3); font-size:11px; margin-top:4px;">' + a.weighIns + ' weigh-ins \u00b7 ' + a.fullDays +
      ' days \u00b7 4 weeks' + (notes.length ? ' \u00b7 ' + notes.join(' \u00b7 ') : '') + '</div></div>';
}
function renderAdaptCard(){
  const el = document.getElementById('adapt-card');
  if(!el) return;
  let a = null;
  // Only on today. A suggestion about now does not belong on a day in the past.
  try{ if(ymd(currentDate) === todayYMD()) a = adaptSuggestion(); }catch(e){ a = null; }
  if(!a || a.state !== 'suggest'){ el.style.display = 'none'; el.innerHTML = ''; return; }
  const up = a.to > a.from;
  el.style.display = 'block';
  el.innerHTML =
    '<div style="font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--accent); font-weight:600;">Suggested change</div>' +
    '<div style="font-size:19px; font-weight:700; margin:6px 0 4px;">' + fmt0(a.from) + ' \u2192 ' + fmt0(a.to) +
      ' kcal <span style="font-size:13px; font-weight:500; color:var(--text3);">(' + (up ? '+' : '\u2212') + fmt0(Math.abs(a.to - a.from)) + ')</span></div>' +
    adaptWhyShort(a) +
    '<div style="display:flex; gap:8px; margin-top:12px;">' +
      '<button id="adapt-apply" class="save-btn" style="margin:0; flex:1; padding:11px;">Apply</button>' +
      '<button id="adapt-later" class="save-btn" style="margin:0; flex:1; padding:11px; background:none; color:var(--text2); border:0.5px solid var(--border); font-weight:500;">Not now</button>' +
    '</div>';
  document.getElementById('adapt-apply').onclick = ()=>{
    const now = adaptSuggestion();
    if(now.state !== 'suggest') { renderAdaptCard(); return; }
    setTargets(macrosFor(now.to), 'adaptive', adaptWhy(now));
    try{ buzz('big'); }catch(e){}
    renderDay();
    try{ if(currentView === 'week') renderWeek(); }catch(e){}
  };
  document.getElementById('adapt-later').onclick = ()=>{
    lsSet(ADAPT_SNOOZE_KEY, JSON.stringify({until: ymd(addDays(new Date(), ADAPT_COOLDOWN)), to: a.to}));
    renderAdaptCard();
  };
}
function adaptStatusText(){
  let a;
  try{ a = adaptSuggestion(); }catch(e){ return ''; }
  const nice = d => { try{ return prettyDate(d); }catch(e){ return d; } };
  if(a.state === 'off') return 'Switched off, so COACH will not suggest or make changes.';
  if(a.state === 'noprofile') return 'Add your weight to your profile and COACH can start checking your target.';
  if(a.state === 'wait'){
    const bits = [];
    if(a.needWeigh > 0) bits.push(a.needWeigh + ' more weigh-in' + (a.needWeigh === 1 ? '' : 's'));
    if(a.needDays > 0) bits.push(a.needDays + ' more day' + (a.needDays === 1 ? '' : 's') + ' ticked complete');
    return '<b>Waiting on data.</b> To suggest a change COACH needs ' + (bits.join(' and ') || 'a little more data') +
      ' (it reads the last 4 weeks: ' + a.weighIns + ' weigh-ins and ' + a.fullDays + ' confirmed days so far).' +
      (a.openDays > 0 ? ' ' + a.openDays + ' day' + (a.openDays === 1 ? ' has' : 's have') +
        ' food logged but ' + (a.openDays === 1 ? 'was' : 'were') + ' never ticked complete \u2014 ticking ' +
        (a.openDays === 1 ? 'it' : 'them') + ' off in History counts ' + (a.openDays === 1 ? 'it' : 'them') + '.' : '');
  }
  if(a.state === 'yesterday') return '<b>Waiting on yesterday.</b> Today\u2019s weigh-in is the result of yesterday\u2019s food, so COACH checks your target once yesterday is ticked complete.';
  if(a.state === 'fine') return '<b>Checked today: no change needed.</b> You burn about ' + fmt0(a.tdee) +
    ' kcal, and your target is within ' + ADAPT_MIN_MOVE + ' kcal of where that says it should be.';
  if(a.state === 'noisy') return '<b>Checked today: holding.</b> The data points to about ' + fmt0(a.to) +
    ' kcal, but your weight is bouncing too much to trust that yet (give or take ' + fmt0(a.se) + ' kcal). More weigh-ins firm it up.';
  if(a.state === 'cooldown') return '<b>Holding for now.</b> Your target changed on ' + nice(a.changed) +
    ', so COACH gives it a week to show up on the scales. Next check ' + nice(a.next) + '.';
  if(a.state === 'snoozed') return '<b>Snoozed.</b> You said not now to a change to ' + fmt0(a.to) + ' kcal. COACH will ask again on ' + nice(a.next) + '.';
  return '<b>A change is waiting.</b> ' + fmt0(a.from) + ' \u2192 ' + fmt0(a.to) + ' kcal \u2014 it is at the top of today\u2019s screen.';
}
function renderAdjustLog(){
  const st = document.getElementById('adapt-status');
  if(st){ const tx = adaptStatusText(); st.innerHTML = tx; st.style.display = tx ? 'block' : 'none'; }
  const el = document.getElementById('adjust-log');
  if(!el) return;
  const log = loadAdjustLog();
  if(log.length===0){
    el.innerHTML = '<div style="font-size:12px; color:var(--text3);">No adjustments yet.</div>';
    return;
  }
  el.innerHTML = log.slice(0,8).map(a=>{
    const up = a.to > a.from;
    return '<div style="padding:10px 0; border-bottom:0.5px solid var(--border);">'+
      '<div style="display:flex; justify-content:space-between; font-size:13px;">'+
      '<span style="color:var(--text3);">'+a.date+'</span>'+
      '<span><span style="color:var(--text3);">'+a.from+'</span> → <strong style="color:'+(up?'var(--accent)':'var(--danger)')+';">'+a.to+'</strong> kcal</span></div>'+
      '<div style="font-size:11px; color:var(--text3); line-height:1.5; margin-top:3px;">'+a.why+'</div></div>';
  }).join('');
}

