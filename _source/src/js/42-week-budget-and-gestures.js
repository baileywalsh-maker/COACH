// ---- Weekly budget ----
function weekStart(d){
  const r = new Date(d); r.setHours(0,0,0,0);
  const day = (r.getDay()+6)%7; // Monday = 0
  r.setDate(r.getDate()-day);
  return r;
}

// The review lands on SUNDAY, on the week you are finishing rather than the one
// you have just started. It used to arrive on Monday morning about a week that
// already felt like history - by then the only thing you can do with it is
// nothing. Sunday evening it is still a week you can act on.
//
// The key is still the Monday that starts the week being reviewed, so a review
// already shown under the old timing is not shown again.
function reviewableWeek(today){
  const t = new Date(today); t.setHours(0,0,0,0);
  const isSunday = t.getDay() === 0;
  // v126: Sunday only counts as the end of the week once Sunday itself is
  // ticked complete. Before that the review ran first thing Sunday morning and
  // could only ever see 6 of the 7 days. Until then, it is still last week.
  if(isSunday && isDayComplete(ymd(t))) return weekStart(t);
  return addDays(weekStart(t), -7);
}

// v126: called when a day is ticked complete. If that day is today and it is
// Sunday, the week is now finished, so the weekly review runs. If this week's
// review was already made (e.g. by an older version that ran it on Sunday
// morning) it is re-read instead - same as the Update button: the numbers are
// refreshed, the target decision is never run twice.
function weekEndReview(ds){
  if(ds !== todayYMD()) return null;
  const d = parseYMD(ds);
  if(d.getDay() !== 0 || !isDayComplete(ds)) return null;
  const wk = ymd(weekStart(d));
  if(CS.getItem(LASTREVIEW_KEY) === wk){
    const r = loadReviews().find(x => String(x.week) === wk);
    if(!r) return null;
    const out = refreshStoredReview(r).review;
    try{ markReviewButton('week'); }catch(e){}
    return out;
  }
  return runWeeklyReview();
}
function showWeekEndReview(ds){
  let wr = null;
  try{ wr = weekEndReview(ds); }catch(e){ wr = null; }
  try{ renderReviewPills(); }catch(e){}
  if(!wr) return false;
  renderReviewSheet(wr);
  setTimeout(()=>openSheet('review-backdrop'), 260);
  return true;
}

function renderBudget(){
  const today = new Date(); today.setHours(0,0,0,0);
  const start = weekStart(today);

  // Sum the target that actually applied on each day. Multiplying today's
  // target by 7 re-judged Monday and Tuesday against a number that did not
  // exist yet whenever the target moved mid-week.
  let weekTarget = 0, spent = 0, spentBefore = 0;
  for(let i=0;i<7;i++){
    const d = addDays(start,i);
    weekTarget += targetForDay(d);
    if(d <= today) spent += getDailyIntake(ymd(d));
    if(d < today) spentBefore += getDailyIntake(ymd(d));
  }

  const left = weekTarget - spent;
  // Rounded, not floored. On the Sunday the clocks go forward the week so far
  // is 143 hours, not 144, so flooring made it one day short: the last day of
  // the week was never recognised as the last day, and what was left got spread
  // over two days instead of one - halving the figure, twice a year.
  const daysElapsed = Math.round((today-start)/86400000) + 1;
  // Today IS a remaining day: `spent` only holds what has been logged so far
  // today, so the rest of today's food still has to come out of `left`.
  // The old `7 - daysElapsed` divided the remainder across tomorrow onwards,
  // which inflated the per-day figure every day except Sunday.
  const daysLeft = 8 - daysElapsed;

  // Same band, applied to the week's totals. A build week that finishes
  // above the weekly target has done what it set out to do.
  const wGoal = loadProfile().goal || 'maintain';
  const wSt = calorieState(spent, weekTarget, wGoal, false);
  document.getElementById('budget-left').textContent = left < 0 ? '+' + fmtK(-left) : fmtK(left);
  document.getElementById('budget-left-lab').textContent = left < 0 ? 'kcal over budget' : 'kcal left this week';
  document.getElementById('budget-left').style.color = left < 0 ? wSt.color : 'var(--text)';
  const pct = Math.min(100, (spent/weekTarget)*100);
  const bar = document.getElementById('budget-bar');
  bar.style.width = pct+'%';
  bar.style.background = wSt.ringColor;
  document.getElementById('budget-spent').textContent = fmtK(spent)+' / '+fmtK(weekTarget)+' spent';

  const note = document.getElementById('budget-note');
  /* v135: what each remaining day gets, TODAY'S WHOLE DAY INCLUDED. Today's
     food so far was being counted as spent while today still counted as a day
     to come, so half-way through a normal day it looked like you were over. */
  const perDay = (weekTarget - spentBefore) / daysLeft;

  if(daysLeft <= 1){
    if(left >= 0){
      document.getElementById('budget-perday').textContent = fmtK(left)+' left today';
      note.textContent = 'Last day of the week — '+fmtK(left)+' kcal left to finish on budget.';
    } else if(wGoal === 'build' && wSt.zone !== 'far'){
      document.getElementById('budget-perday').textContent = fmtK(-left)+' in surplus';
      note.textContent = 'Last day of the week, '+fmtK(-left)+' kcal above the week\'s target — the direction you want. '+
        (wSt.zone === 'over' ? 'It is getting large though; ease back tomorrow.' : 'Eat to your daily target and reset Monday.');
    } else {
      document.getElementById('budget-perday').textContent = 'Over budget';
      note.textContent = 'Last day of the week, currently '+fmtK(Math.abs(left))+' kcal over. Eat to your daily target and reset Monday.';
    }
    return;
  }

  /* v141: say how much of today's share is still to eat, so the line adds up
     to "kcal left this week" (today's rest + each later day = left). */
  const todayRest = Math.max(0, Math.round(perDay - (spent - spentBefore)));
  const laterPer = (left - todayRest) / (daysLeft - 1);
  document.getElementById('budget-perday').textContent = left <= 0
    ? 'Week\'s budget used up'
    : (todayRest > 0 ? fmtK(todayRest)+' left today' : 'Today\'s share eaten') +
      ', then '+fmtK(laterPer) + (daysLeft - 1 > 1 ? '/day for '+(daysLeft - 1)+' days' : ' tomorrow');

  // Against what the remaining days are actually set to (cycling makes them differ).
  let remT = 0;
  for(let i=0;i<daysLeft;i++) remT += targetForDay(addDays(today, i));
  const diff = perDay - (daysLeft > 0 ? remT / daysLeft : targets.kcal);
  if(Math.abs(diff) < 50){
    note.textContent = 'Right on pace. Keep eating to your daily target.';
  } else if(diff > 0){
    note.textContent = wGoal === 'build'
      ? 'You are running under your surplus. There is '+fmtK(diff)+' kcal/day spare over the rest of the week — a surplus you do not eat is not a surplus.'
      : 'You are running under. You have '+fmtK(diff)+' kcal/day spare over the rest of the week — bank it for a meal out, or just eat to target and finish under.';
  } else {
    note.textContent = wGoal === 'build'
      ? 'You are running ahead of the surplus. Eating '+fmtK(perDay)+'/day for the rest of the week keeps the week where you planned it.'
      : 'You are running over. Eating '+fmtK(perDay)+'/day for the rest of the week brings you back to budget without a crash day.';
  }
}

function markTrainingDays(){
  const today = new Date(); today.setHours(0,0,0,0);
  document.querySelectorAll('.wbar-col').forEach(col=>{
    // v136: the chart is Monday to Sunday (since v135), so the barbell has to
    // count from Monday too. It was still counting back from today, which put
    // it over the wrong day.
    if(col.dataset.idx == null) return;
    const d = addDays(weekStart(today), Number(col.dataset.idx));
    if(isTrainingDay(d) && !col.querySelector('.tmark')){
      const lab = col.querySelector('.dlabel');
      if(lab) lab.insertAdjacentHTML('beforebegin','<i class="ti ti-barbell tmark" style="font-size:11px; color:var(--accent);" aria-hidden="true"></i>');
    }
  });
}


// ---- App-like gestures ----
// Horizontal swipe moves between days; vertical scrolling is untouched.
(function(){
  const target = document.getElementById('view-day');
  if(!target) return;
  let x0=null, y0=null, locked=null, skip=false;

  target.addEventListener('touchstart', e=>{
    if(e.touches.length!==1) return;
    // Anything that owns its own horizontal gesture handles it alone. Without
    // this, swiping a row to delete ALSO dragged the whole day sideways.
    skip = !!e.target.closest('.entry-wrap, .recents-row, .quick-portions, .hr-bar, .dv-slides');
    if(skip || openSwipe){ x0=null; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; locked=null;
  }, {passive:true});

  target.addEventListener('touchmove', e=>{
    if(skip || x0===null || e.touches.length!==1) return;
    const dx = e.touches[0].clientX - x0;
    const dy = e.touches[0].clientY - y0;
    if(locked===null && (Math.abs(dx)>10 || Math.abs(dy)>10)){
      // Needs to be decisively sideways, not just marginally — a 1.5x ratio
      // stops a slightly-diagonal scroll from flipping the day.
      locked = Math.abs(dx) > Math.abs(dy)*1.5 ? 'x' : 'y';
    }
    if(locked==='x'){
      // follow the finger a little so the gesture feels connected
      target.style.transform = 'translateX('+(dx*0.25)+'px)';
    }
  }, {passive:true});

  target.addEventListener('touchend', e=>{
    if(skip || x0===null) return;
    const dx = (e.changedTouches[0].clientX - x0);
    target.style.transition = 'transform .18s ease-out';
    target.style.transform = '';
    setTimeout(()=>{ target.style.transition=''; }, 200);
    if(locked==="x" && Math.abs(dx) > 90){
      currentDate = addDays(currentDate, dx < 0 ? 1 : -1);
      renderDay();
    }
    x0=null; y0=null; locked=null;
  }, {passive:true});
})();

// There used to be a SECOND drag implementation here, bound to the same
// handles as the pointer one above: touch-based, passive, closing at 80px where
// the other closes proportionally. Both fired for the same finger, overwrote
// each other's transform every frame, and applied competing transitions on
// release. That fight is why sheets — the weekly review worst of all — felt
// like they resisted being pulled down. Do not add a second one.

// Prevent double-tap zoom without blocking normal taps.
let lastTouch = 0;
document.addEventListener('touchend', e=>{
  const now = Date.now();
  if(now - lastTouch < 300) e.preventDefault();
  lastTouch = now;
}, {passive:false});


// If the Tabler icon font fails (offline, CDN blocked), swap icon-only controls
// for text so nothing is ever an invisible button.
(function(){
  function iconFontLoaded(){
    try{
      const probe = document.createElement('i');
      probe.className='ti ti-home';
      probe.style.cssText='position:absolute;visibility:hidden;font-size:24px;';
      document.body.appendChild(probe);
      const w = probe.offsetWidth;
      document.body.removeChild(probe);
      return w > 6;
    }catch(e){ return true; }
  }
  function applyFallback(){
    if(iconFontLoaded()) return;
    document.body.classList.add('no-icons');
    const labels = {
      'ti-plus':'+', 'ti-x':'\u00d7', 'ti-trash':'Del', 'ti-flame':'',
      'ti-barbell':'', 'ti-droplet':'', 'ti-wallet':'', 'ti-barcode':'',
      'ti-sunrise':'', 'ti-sun':'', 'ti-cookie':'', 'ti-moon':'',
      'ti-adjustments-alt':'', 'ti-chevron-left':'\u2039', 'ti-chevron-right':'\u203a'
    };
    document.querySelectorAll('i.ti').forEach(el=>{
      const cls=[...el.classList].find(x=>x.startsWith('ti-'));
      const t = labels[cls];
      if(t !== undefined && t !== '') el.textContent = t;
      el.style.fontStyle='normal';
    });
  }
  if(document.fonts && document.fonts.ready){
    document.fonts.ready.then(()=>setTimeout(applyFallback,150));
  } else {
    window.addEventListener('load', ()=>setTimeout(applyFallback,600));
  }
})();

loadTargets();
runAutoAdapt();
// v130: if cycling was on, say once in the target history that every day is
// now the same. Today's frozen copy is then brought in line just below.
try{
  if(loadCycle().on && CS.getItem('coachcyclingretired') !== '1'){
    const from = Math.round(targetForDay(new Date()));
    const to = Math.round(targets.kcal);
    if(from !== to) pushAdjust({date: todayYMD(), from: from, to: to, source: 'cycling',
      why: 'Calorie cycling removed. Every day is now ' + fmtK(to) + ' kcal, training or rest. Training days are still recorded and used to explain your progress.'});
    lsSet('coachcyclingretired', '1');
  }
}catch(e){}
recordTargetSnapshot(new Date());

document.getElementById('review-close').onclick = ()=>closeSheet('review-backdrop');
document.getElementById('hyd-close').onclick = ()=>closeSheet('hyd-backdrop');
document.querySelectorAll('#review-tabs .tab').forEach(t=>{
  t.onclick = ()=>{
    reviewPeriod = t.dataset.rperiod;
    document.querySelectorAll('#review-tabs .tab').forEach(x=>x.classList.toggle('active', x === t));
    afterPaint(()=>renderReviewSheet(null));
  };
});
// This used to open the History list, which is the prose with none of the
// charts - so the calorie chart, macro bars, protein dots and the water week
// were only ever visible in the popup that appears by itself on a Monday, and a
// monthly review you dismissed was gone for good.
document.getElementById('open-reviews').onclick = ()=>{
  closeSheet('target-backdrop');
  setTimeout(()=>{ openSheet('review-backdrop'); afterPaint(()=>renderReviewSheet(null)); }, HANDOFF);
};
document.getElementById('open-hist').onclick = openHistory;
(function(){
  const c = document.getElementById('lu-close');
  if(c) c.onclick = ()=> closeSheet('lookup-backdrop');
  const m = document.getElementById('msq-close');
  if(m) m.onclick = ()=> closeSheet('mealscore-backdrop');
})();
(function(){
  const w = document.getElementById('water-open');
  if(w) w.onclick = openWaterPage;
  const c = document.getElementById('wp-close');
  if(c) c.onclick = ()=> closeSheet('waterpage-backdrop');
  wirePage('waterpage-backdrop', ()=> closeSheet('waterpage-backdrop'));
  wirePage('sysdet-backdrop',    ()=> closeSheet('sysdet-backdrop'));
})();
// v84: the Data screen's own reviews row. The button of the same job inside the
// target sheet keeps its own id and its own wiring above.
(function(){
  const r = document.getElementById('open-reviews-row');
  if(r) r.onclick = ()=>{ openSheet('review-backdrop'); afterPaint(()=>renderReviewSheet(null)); };
})();
document.querySelectorAll('#data-range .tab').forEach(t=>{
  t.onclick = ()=>{
    dataRange = Number(t.dataset.drange) || 90;
    document.querySelectorAll('#data-range .tab').forEach(x=>
      x.classList.toggle('active', x === t));
    renderData();
  };
});
document.getElementById('hist-back').onclick = histBack;
document.querySelectorAll('#hist-tabs .tab').forEach(t=>{
  t.onclick = ()=>{
    document.querySelectorAll('#hist-tabs .tab').forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    histState.tab = t.dataset.htab;
    if(histState.tab === 'log') histState.level = 'year';
    renderHistory();
  };
});
document.getElementById('sound-toggle').checked = soundOn();
document.getElementById('haptic-toggle').checked = hapticsOn();
document.getElementById('haptic-toggle').onchange = (e)=>{
  lsSet(HAPTIC_KEY, e.target.checked ? 'on' : 'off');
  if(e.target.checked) buzz();
};
document.getElementById('sound-toggle').onchange = (e)=>{
  lsSet(SOUND_KEY, e.target.checked ? 'on' : 'off');
  if(e.target.checked) tick();
};

renderDay();
renderStreak();

// One popup at a time, in order of how much it has to say: the month, then the
// week, then the weigh-in nudge. On the 1st both are due, and the month is the
// one worth reading — the week behind it is still in the list.
const weeklyReview = runWeeklyReview();
const monthlyReview = runMonthlyReview();
try{ renderReviewPills(); }catch(e){}
if(monthlyReview || weeklyReview){
  renderReviewSheet(monthlyReview || weeklyReview);
  setTimeout(()=>openSheet('review-backdrop'), 500);
} else {
  maybePromptWeighIn();
}
// Monday is a review day AND the start of a week, and the nudge used to be
// skipped entirely whenever a review was due - so the one morning the adaptive
// engine most needs a reading was the one morning it never asked for one. It
// waits for the review to be read rather than stacking on top of it.
if(monthlyReview || weeklyReview){
  const nudgeAfterReview = ()=>{
    const bd = document.getElementById('review-backdrop');
    if(bd && bd.classList.contains('open')) return;
    document.removeEventListener('click', nudgeAfterReview, true);
    setTimeout(maybePromptWeighIn, 400);
  };
  document.addEventListener('click', nudgeAfterReview, true);
}
document.getElementById('export-btn').onclick = exportCSV;
document.getElementById('myfoods-btn').onclick = ()=>{
  document.getElementById('myfoods-filter').value = '';
  renderMyFoodsList('');
  openSheet('myfoods-backdrop');
};
document.getElementById('myfoods-filter').addEventListener('input', (e)=>{
  renderMyFoodsList(e.target.value);
});
document.getElementById('backup-btn').onclick = ()=>{ exportJSON(); renderBackupNag(); };
document.getElementById('autobackup-btn').onclick = ()=>{ setupAutoFile(); };
document.getElementById('devicerestore-btn').onclick = ()=>{ restoreFromDevice('latest'); };
renderAutoBackupRow();
try{ renderCloudRow(); }catch(e){}
runAutoBackup();
window.addEventListener('focus', ()=>{ try{ runAutoBackup(); }catch(e){} });

/* ---- settings: the key, and filling the gaps ---- */

function fdcStatusLine(msg, tone){
  const el = document.getElementById('fdc-status');
  if(!el) return;
  el.style.color = tone === 'bad' ? 'var(--danger)' : tone === 'good' ? 'var(--accent)' : 'var(--text3)';
  el.textContent = msg;
}

// The retry only appears when there is something to retry.
function renderFdcRetry(){
  const b = document.getElementById('fdc-retry');
  if(!b) return;
  const n = fdcMissCount();
  b.style.display = n ? '' : 'none';
  b.textContent = 'Try the ' + n + ' rejected one' + (n===1?'':'s') + ' again';
}

function renderFdcSettings(){
  renderFdcRetry();
  const box = document.getElementById('fdc-key');
  if(!box) return;
  box.value = fdcKey();
  const saved = Object.keys(fdcSavedFoods()).length;
  const filled = Object.keys(fdcFills()).length;
  if(!fdcHasKey()){
    fdcStatusLine('No key saved. Everything works as before; whole-food search is off.');
  } else {
    fdcStatusLine('Connected. ' + saved + ' whole food' + (saved===1?'':'s') +
      ' saved for offline use, ' + filled + ' built-in food' + (filled===1?'':'s') +
      ' topped up.', 'good');
  }
}

// Every food name you have ever logged, most-used first. The point of ordering
// it that way is that the request budget goes on chicken and oats rather than
// the one time you logged a scotch egg.
function loggedFoodNames(){
  const count = {};
  for(let i = 0; i < CS.length; i++){
    const k = CS.key(i);
    if(!k || k.indexOf(STORE_KEY_PREFIX) !== 0) continue;
    let entries = [];
    try{ entries = JSON.parse(CS.getItem(k)) || []; }catch(e){ continue; }
    entries.forEach(e=>{
      const n = e && e.name;
      if(n) count[n] = (count[n] || 0) + 1;
    });
  }
  return Object.keys(count).sort((a,b)=>count[b] - count[a]);
}

// Which built-in foods are still missing nutrients. A food with a full profile
// is skipped, and so is one already tried and found to have no good match -
// otherwise every run would spend its budget failing at the same 40 foods.
function fdcNeedsFill(name){
  const fills = fdcFills();
  // The national tables ship inside the app and cover a British or Australian
  // food better than USDA does, so a food they already filled does not need a
  // request spent on it.
  const rec = fills[String(name||'').toLowerCase()];
  if(rec && (rec.micros || rec.miss)) return false;
  const have = Object.keys(microsForLocal(name).micros || {}).length;
  return have < MICROS.length - 4;   // sugar and sat fat live on the entry, not here
}

// Most-logged first, so a run that gets cut short has still done the foods you
// actually eat.
function fdcFillOrder(){
  const rank = {};
  loggedFoodNames().forEach((n,i)=>{ rank[n] = i; });
  return LOCAL_FOODS.map(f=>f[0]).filter(fdcNeedsFill).sort((a,b)=>{
    const ra = rank[a] == null ? 1e6 : rank[a];
    const rb = rank[b] == null ? 1e6 : rank[b];
    return ra - rb;
  });
}

