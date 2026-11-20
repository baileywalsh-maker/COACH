// ---- Weekly review ----
/* v141: the hydration target a review is judged against - the average of
   each logged day's own target (training days are higher). Older saved
   reviews carry the per-day targets in .hyd, so this works for them too. */
function rvHydTarget(s){
  const xs = (s && s.hyd || []).filter(w => w && w.ml > 0 && w.target > 0);
  if(xs.length) return xs.reduce((a, w) => a + w.target, 0) / xs.length;
  try{ return hydTarget(new Date()); }catch(e){ return HYD_TARGET_ML; }
}
function loadReviews(){ try{ return JSON.parse(CS.getItem(REVIEWS_KEY))||[]; }catch(e){ return []; } }
// Monthly reviews live in their own list. Mixing them into the weekly one would
// make "the last review" ambiguous, and the adaptive engine reads that list.
const MREVIEWS_KEY = 'coachmonthreviews';
const LASTMREVIEW_KEY = 'coachlastmonthreview';
function loadMonthReviews(){ try{ return JSON.parse(CS.getItem(MREVIEWS_KEY))||[]; }catch(e){ return []; } }
function pushMonthReview(r){
  const all = loadMonthReviews();
  all.unshift(Object.assign({}, r, {stats: slimStats(r.stats)}));
  lsSet(MREVIEWS_KEY, JSON.stringify(all.slice(0,24)));
}
function monthStartOf(d){ const x = new Date(d.getFullYear(), d.getMonth(), 1); x.setHours(0,0,0,0); return x; }
function daysInMonthOf(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0).getDate(); }
function monthLabel(ymdStr){
  try{ const d = parseYMD(ymdStr); return d.toLocaleDateString(undefined,{month:'long', year:'numeric'}); }
  catch(e){ return ymdStr; }
}
// The per-day array is NOT stored. 52 weeks plus 24 months of it is well over
// 100KB of localStorage and it lands in every JSON backup, to hold something
// that is already derivable: reviewStats() rebuilds it from the day logs, which
// are the source of truth and are themselves backed up. The scalars stay, so a
// history row costs nothing to draw.
function slimStats(s){
  if(!s || !s.days) return s;
  const out = {};
  for(const k in s) if(k !== 'days') out[k] = s[k];
  return out;
}
function pushReview(r){
  const all = loadReviews();
  all.unshift(Object.assign({}, r, {stats: slimStats(r.stats)}));
  lsSet(REVIEWS_KEY, JSON.stringify(all.slice(0,52)));
}

// Everything that happened in the 7 days starting at `startDate` (a Monday).
// A week is this with n=7. Everything summariseWeek() ever returned is still
// returned, in the same shape — the adaptive engine and every stored review
// depend on it — with the per-day detail added alongside.
function summariseWeek(startDate){ return summariseRange(startDate, 7, 'week'); }

function summariseRange(startDate, nDays, periodWord){
  let spent = 0, daysLogged = 0, targetSum = 0, targetSumDone = 0, partialDays = 0;
  const water = [];
  // Per-day detail, and the macro sums built only from confirmed days — the
  // same rule the calorie average already followed, for the same reason.
  const days = [];
  let pSum = 0, cSum = 0, fSum = 0;
  let pTargetSum = 0, cTargetSum = 0, fTargetSum = 0;
  let inBand = 0, proteinHit = 0, proteinNear = 0;
  // The three-part verdict, alongside the older per-measure counts. Both are
  // kept: "2 of 7 on target" is the headline, and the separate counts are what
  // tell you WHICH part slipped.
  let onTarget = 0, metSum = 0, metDays = 0, hSum = 0, hDays = 0;
  const hydList = []; let hydSum = 0, hydDays = 0, hydHit = 0;
  let trainDays = 0;
  const goal = (loadProfile().goal || 'maintain');
  for(let i=0;i<nDays;i++){
    const d = addDays(startDate,i);
    const ds = ymd(d);
    const k = getDailyIntake(ds);
    // Averages are built only from days confirmed complete, so a day where
    // dinner never got logged cannot quietly pull the week's average down.
    if(k>0){
      if(isDayComplete(ds)){ spent += k; daysLogged++; }
      else partialDays++;
    }
    targetSum += targetForDay(d);
    if(k > 0 && isDayComplete(ds)) targetSumDone += targetForDay(d);
    // waterMl, not loadWater: this field is millilitres and every figure built
    // from it — the bars, the weekly total, the average — was 250x too small.
    water.push({ day: d.toLocaleDateString(undefined,{weekday:'short'}), ml: waterMl(d) });
    try{ if(isTrainingDay(d)) trainDays++; }catch(e){}
    // v128: hydration, alongside water - never instead of it.
    try{
      const hy = hydDay(d);
      hydList.push({ day: d.toLocaleDateString(undefined,{weekday:'short'}), ml: hy.any ? hy.total : 0, target: hy.target });
      if(hy.any){ hydSum += hy.total; hydDays++; if(hy.total >= hy.target) hydHit++; }
    }catch(e){ hydList.push({ day: '', ml: 0, target: HYD_TARGET_ML }); }

    const m = getDailyMacros(ds);
    const t = snapFor(d);
    const complete = k > 0 && isDayComplete(ds);
    // A finished day, judged by the same band the daily ring uses — so the
    // review and the day screen can never disagree about what a day was.
    const st = (k > 0) ? calorieState(k, t.kcal, goal, true) : null;
    const v = dayVerdict(ds);
    if(v.all) onTarget++;
    if(v.logged){ metSum += v.met; metDays++; }
    if(v.healthKnown){ hSum += v.health; hDays++; }
    if(complete){
      pSum += m.protein; cSum += m.carbs; fSum += m.fat;
      pTargetSum += t.protein; cTargetSum += t.carbs; fTargetSum += t.fat;
      if(st && st.zone === 'in') inBand++;
      if(t.protein > 0){
        // v141: the same line the day score and the Week/Data screens use -
        // your protein floor (a share of the target you set in Profile).
        const fl = proteinFloorFor(t);
        if(m.protein >= fl - 0.5) proteinHit++;
        else if(m.protein >= fl * 0.9) proteinNear++;
      }
    }
    days.push({
      day: d.toLocaleDateString(undefined,{weekday:'narrow'}),
      dayShort: d.toLocaleDateString(undefined,{weekday:'short'}),
      date: ds, dom: d.getDate(),
      kcal: k, target: t.kcal,
      protein: m.protein, carbs: m.carbs, fat: m.fat,
      pTarget: t.protein, pFloor: proteinFloorFor(t), cTarget: t.carbs, fTarget: t.fat,
      complete: complete, logged: k > 0,
      zone: st ? st.zone : null,
      verdict: v, tone: v.tone, met: v.met, health: v.health
    });
  }
  const waterDays = water.filter(w=>w.ml>0).length;
  const waterTotal = water.reduce((s,w)=>s+w.ml,0);
  const log = loadWeightLog();
  // The comparison window is the period's own length, not a hard-coded 7 —
  // otherwise a monthly review would compare a month against one week.
  const inWeek = log.filter(e=>{ const d=parseYMD(e.date); return d>=startDate && d<addDays(startDate,nDays); });
  const prevWeek = log.filter(e=>{ const d=parseYMD(e.date); return d>=addDays(startDate,-nDays) && d<startDate; });
  const wAvg = inWeek.length ? ewma(inWeek.map(e=>e.kg),0.3) : null;
  const pAvg = prevWeek.length ? ewma(prevWeek.map(e=>e.kg),0.3) : null;
  return {
    week: ymd(startDate),
    nDays: nDays, periodWord: periodWord || 'week',
    onTarget, avgMet: metDays ? metSum/metDays : 0, metDays,
    avgHealth: hDays ? Math.round(hSum/hDays) : null, healthDays: hDays,
    spent, daysLogged, targetSum, partialDays,
    water, waterDays, waterTotal,
    avgWater: waterDays ? waterTotal/waterDays : 0,
    avgIntake: daysLogged ? spent/daysLogged : 0,
    weighIns: inWeek.length,
    latestKg: inWeek.length ? inWeek[inWeek.length-1].kg : null,
    weightChange: (wAvg!==null && pAvg!==null) ? (wAvg-pAvg) : null,
    // Everything the charts draw from. Averages are per CONFIRMED day, which is
    // why they divide by daysLogged and not by nDays.
    days: days,
    // Averaged over the SAME days the intake average used. Comparing an
    // average built from four logged days with a target averaged over seven
    // was a straight mismatch, and on a cycling week it moved the answer.
    avgTarget:  daysLogged ? targetSumDone/daysLogged : 0,
    targetSumDone: targetSumDone,
    avgProtein: daysLogged ? pSum/daysLogged : 0,
    avgCarbs:   daysLogged ? cSum/daysLogged : 0,
    avgFat:     daysLogged ? fSum/daysLogged : 0,
    avgPTarget: daysLogged ? pTargetSum/daysLogged : 0,
    avgCTarget: daysLogged ? cTargetSum/daysLogged : 0,
    avgFTarget: daysLogged ? fTargetSum/daysLogged : 0,
    daysInBand: inBand, proteinHit: proteinHit, proteinNear: proteinNear,
    hyd: hydList, hydDays: hydDays, hydHit: hydHit, trainDays: trainDays,
    avgHyd: hydDays ? hydSum / hydDays : 0
  };
}

function reviewText(s){
  const parts = [];
  if(s.daysLogged === 0 && s.partialDays > 0){
    parts.push('You logged food on '+s.partialDays+' '+(s.partialDays===1?'day':'days')+
      ' but never confirmed '+(s.partialDays===1?'it':'them')+' complete, so there is no average to report. Tick the days off in History and this fills in.');
  } else if(s.daysLogged === 0){
    parts.push('You did not log any food last '+(s.periodWord||'week')+', so there is nothing to measure against.');
  } else {
    parts.push('You confirmed '+s.daysLogged+' of '+(s.nDays||7)+' days complete, averaging '+fmt0(s.avgIntake)+' kcal a day.' +
      (s.partialDays ? ' '+s.partialDays+' further '+(s.partialDays===1?'day has':'days have')+' food logged but '+
        (s.partialDays===1?'was':'were')+" never confirmed, so "+(s.partialDays===1?'it is':'they are')+' not in that average.' : ''));
    if(s.daysLogged >= 5){
      const n = s.nDays || 7;
      const word = s.periodWord || 'week';
      const diff = s.spent - s.targetSumDone;
      // The tolerance scales with the period: 500 kcal across a week is noise,
      // across a month it is nothing at all.
      const tol = 500 * (n/7);
      // Judged by the same band as the ring and the charts. Before v39 this was
      // goal-blind, so a build week could read "850 kcal above budget" in the
      // prose while the chart beside it called the same average on target.
      const goal = loadProfile().goal || 'maintain';
      const zone = calorieState(s.avgIntake, s.avgTarget || s.targetSum/n, goal, true).zone;
      if(Math.abs(diff) < tol || zone === 'in'){
        parts.push(goal === 'build' && diff > 0
          ? 'That is inside the surplus you are aiming for.'
          : 'That is right on the budget you set.');
      } else if(diff > 0){
        parts.push(goal === 'build'
          ? 'That is about '+fmt0(diff)+' kcal more than the surplus called for across the '+word+'.'
          : 'That is about '+fmt0(diff)+' kcal above budget across the '+word+'.');
      } else {
        parts.push(goal === 'build'
          ? 'That is about '+fmt0(Math.abs(diff))+' kcal short of the surplus across the '+word+'.'
          : 'That is about '+fmt0(Math.abs(diff))+' kcal below budget across the '+word+'.');
      }
    } else {
      parts.push('Fewer than 5 logged days makes the weekly numbers rough — target changes need '+ADAPT_MIN_DAYS+' confirmed days and '+ADAPT_MIN_WEIGHINS+' weigh-ins in the last four weeks.');
    }
  }
  if(s.waterDays === 0){
    parts.push('No water logged at all last '+(s.periodWord||'week')+'.');
  } else {
    parts.push('Water: '+(s.waterTotal/1000).toFixed(1)+'L across '+s.waterDays+' day'+(s.waterDays===1?'':'s')+
      ', averaging '+(s.avgWater/1000).toFixed(1)+'L on the days you logged it.');
  }
  if(s.weighIns === 0){
    parts.push('No weigh-ins last '+(s.periodWord||'week')+'. Weight is the only signal that tells COACH whether your target is actually right.');
  } else {
    let w = 'You weighed in '+s.weighIns+' time'+(s.weighIns===1?'':'s');
    if(s.latestKg) w += ', finishing at '+s.latestKg+' kg';
    if(s.weightChange !== null){
      const amt = Math.abs(s.weightChange).toFixed(2);
      const word = s.periodWord || 'week';
      w += Math.abs(s.weightChange) < 0.05
        ? ' — level on the '+word+' before'
        : ' — '+(s.weightChange>0?'up':'down')+' '+amt+' kg on the '+word+' before';
    }
    parts.push(w+'.');
  }
  return parts.join(' ');
}

// Runs once per week, on the first app open on or after Monday.
// This is the ONLY place automatic target changes happen.
function runWeeklyReview(){
  const today = new Date(); today.setHours(0,0,0,0);
  const lastWeek = reviewableWeek(today);
  // Keyed on the week being reviewed, so moving the trigger from Monday to
  // Sunday cannot replay a week you have already seen. The second comparison is
  // the OLD key format, which stored the week you were in rather than the week
  // being reviewed - without it, upgrading would replay last week's review once.
  const seen = CS.getItem(LASTREVIEW_KEY);
  if(seen === ymd(lastWeek) || seen === ymd(addDays(lastWeek, 7))) return null;

  const s = summariseWeek(lastWeek);
  lsSet(LASTREVIEW_KEY, ymd(lastWeek));

  // Nothing happened last week — no review worth showing.
  if(s.daysLogged === 0 && s.partialDays === 0 && s.weighIns === 0) return null;

  let change = null;
  if(autoOn()){
    /* v135: the weekly review makes the change the suggestion card would, by
       the same rules - the same reading, the 75 kcal and noise checks, the
       week's rest after a change and your "not now". One engine, so the
       review can never pick a different number from the rest of the app. */
    let sg = null;
    try{ sg = adaptSuggestion(); }catch(e){ sg = null; }
    const a = {ready: !!(sg && sg.state !== 'wait' && sg.state !== 'noprofile' && sg.state !== 'off')};
    if(sg && sg.state === 'suggest'){
      const from = Math.round(targets.kcal);
      const why = adaptWhy(sg);
      setTargets(macrosFor(sg.to), 'weekly', why);
      change = { from, to: Math.round(targets.kcal), why: why };
    } else if(!a.ready){
      const f = formulaTarget();
      /* v111: once there is enough of your own data for COACH to suggest a
         change from it, the profile formula stops overriding the target. It
         used to put the formula figure back every week for as long as the
         strict two-week test was not met - which would undo a change you had
         just accepted from the suggestion card. */
      let measured = false;
      try{ const sg = adaptSuggestion(); measured = sg.state !== 'wait' && sg.state !== 'noprofile'; }catch(e){}
      /* v141: and never over a target you chose. The formula only follows your
         bodyweight while every change so far came from the formula itself. A
         few weeks without weigh-ins used to put it back over a hand-set
         target without asking. */
      if(!measured && f && Math.abs(f - targets.kcal) >= 50 && !targetChosenByYou()){
        const from = Math.round(targets.kcal);
        setTargets(macrosFor(f), 'weekly', narrativeFormula());
        change = { from, to: Math.round(targets.kcal), why: narrativeFormula() };
      }
    }
  }

  const review = { week: s.week, reviewed: todayYMD(), text: reviewText(s), change, stats: s };
  pushReview(review);
  try{ markReviewButton('week'); }catch(e){}
  return review;
}

// The band colours, exactly as the daily ring uses them. One vocabulary.
function zoneColour(z){
  return z === 'in'   ? 'var(--accent)'
       : z === 'far'  ? 'var(--danger)'
       : z === null   ? 'var(--border)'
       : 'var(--caution)';
}

// Three fractions. The honest summary of a period, and the only part that fits
// above the fold.
function reviewRatioLine(s){
  if(!s.days || !s.daysLogged) return '';
  const n = s.nDays || 7;
  const diff = Math.round(s.avgIntake - (s.avgTarget || s.targetSum / n));
  return '<div class="rv-card"><div class="rv-ratio">'+
    '<div><span class="sw" style="background:var(--accent)"></span>calories <b>'+s.daysInBand+'/'+s.daysLogged+
      '</b> <span class="t">days in band · avg '+(diff>=0?'+':'')+fmt0(diff)+'</span></div>'+
    '<div><span class="sw" style="background:var(--prot)"></span>protein <b>'+s.proteinHit+'/'+s.daysLogged+
      '</b> <span class="t">days hit · avg '+fmt0(s.avgProtein)+'g</span></div>'+
    '<div><span class="sw" style="background:var(--text3)"></span>logging <b>'+s.daysLogged+'/'+n+
      '</b> <span class="t">days confirmed</span></div>'+
    '</div></div>';
}

// Each day as its distance from THAT day's target. A raw-height chart of
// intake would be seven nearly identical bars; the deviation is the signal.
function reviewCalorieChart(s){
  if(!s.days || !s.daysLogged) return '';
  const shown = s.days;
  const dense = shown.length > 10;                 // a month: no room for values
  const devs = shown.filter(d=>d.logged).map(d=>Math.abs(d.kcal - d.target));
  // A floor on the scale, or a week that was within 20 kcal every day draws as
  // wild swings.
  const scale = Math.max(Math.max.apply(null, devs.concat([0])), (s.avgTarget || 2000) * 0.15);
  const hero = Math.round(s.avgIntake - (s.avgTarget || s.targetSum / (s.nDays || 7)));
  const heroZone = s.daysLogged ? calorieState(s.avgIntake, s.avgTarget || s.targetSum/(s.nDays||7),
                     loadProfile().goal || 'maintain', true).zone : null;
  let html = '<div class="section-title">Calories against target</div><div class="rv-card">'+
    '<div class="rv-hero"><span class="n" style="color:'+zoneColour(heroZone)+'">'+
      (hero>=0?'+':'')+fmt0(hero)+'</span><span class="u">kcal/day average</span></div>'+
    '<p class="rv-sub">'+fmt0(s.avgIntake)+' against a '+fmt0(s.avgTarget || s.targetSum/(s.nDays||7))+' target</p>'+
    '<div class="rv-dev" style="grid-template-columns:repeat('+shown.length+',1fr);">'+
    '<div class="rv-zero"></div>';
  shown.forEach((d,i)=>{
    const dev = d.logged ? (d.kcal - d.target) : 0;
    const pct = Math.min(50, Math.abs(dev)/scale*50);
    const lab = dense ? ((d.dom % 5 === 0 || i === 0) ? d.dom : '') : d.day;
    html += '<div class="rv-col">'+
      (d.logged ? '<div class="rv-bar '+(dev>=0?'up':'dn')+'" style="height:'+pct+'%; background:'+
        zoneColour(d.complete ? d.zone : null)+'"></div>' : '')+
      '<div class="rv-dlab">'+lab+'</div></div>';
  });
  html += '</div><p class="rv-cap">The line is that day\'s target · bars are the distance from it</p>';
  html += '<p style="font-size:12px; color:var(--text2); margin:0;"><b style="color:var(--text)">'+
    s.daysInBand+' of '+s.daysLogged+'</b> confirmed days landed in the band.</p>';
  return html + '</div>';
}

// One row per macro, name always visible. See the header comment: protein and
// fat are the same colour to a large minority of people, so the label is what
// carries identity and the colour only reinforces it.
function reviewMacroBars(s){
  if(!s.days || !s.daysLogged) return '';
  // The tick sits at 80% of the track, leaving room to overshoot rather than
  // clipping everything above target to a full bar.
  const TICK = 80;
  const row = (name, got, target, colour, lead)=>{
    const pct = target > 0 ? Math.min(100, (got/target) * TICK) : 0;
    return '<div class="rv-arow'+(lead?' lead':'')+'">'+
      '<span class="rv-aname">'+name+'</span>'+
      '<div class="rv-track"><div class="rv-fill" style="width:'+pct+'%; background:'+colour+'"></div>'+
      '<div class="rv-tick" style="left:'+TICK+'%"></div></div>'+
      '<span class="rv-aval">'+fmt0(got)+'<em> / '+fmt0(target)+'</em></span></div>';
  };
  return '<div class="section-title">Macros, daily average</div><div class="rv-card">'+
    row('Protein', s.avgProtein, s.avgPTarget, 'var(--prot)', true)+
    row('Carbs',   s.avgCarbs,   s.avgCTarget, 'var(--carb)', false)+
    row('Fat',     s.avgFat,     s.avgFTarget, 'var(--fat)',  false)+
    row('Calories',s.avgIntake,  s.avgTarget || s.targetSum/(s.nDays||7), 'var(--accent)', false)+
    '<p class="rv-cap" style="margin:10px 0 0;">The tick is target · past it is deliberate, not clipped</p>'+
    '</div>';
}

// An average of 159 against 160 reads like a week you nailed. It can also be
// five good days and two at 121.
function reviewProteinDots(s){
  if(!s.days || !s.daysLogged) return '';
  const dense = s.days.length > 10;
  let html = '<div class="section-title">Protein, day by day</div><div class="rv-card">'+
    '<div class="rv-hero"><span class="n" style="color:var(--prot)">'+s.proteinHit+
    '<span style="color:var(--text3); font-size:18px;">/'+s.daysLogged+'</span></span>'+
    '<span class="u">'+(s.days.some(d=>d.pFloor) ? 'days protein hit (your '+proteinFloorPct()+'% floor)' : 'days at or above target')+'</span></div>'+
    '<p class="rv-sub">averaging '+fmt0(s.avgProtein)+'g</p><div class="rv-dots">';
  s.days.forEach(d=>{
    let cls = 'none', style = '', txt = '';
    // v141: judged against the floor when the review has it (older saved reviews: the target, as they were).
    const line = d.pFloor ? d.pFloor - 0.5 : d.pTarget;
    if(d.complete && d.pTarget > 0){
      if(d.protein >= line){ cls=''; style='background:var(--prot)'; }
      else if(d.protein >= line*0.9){ cls='near'; style='background:rgba(185,143,224,.45)'; }
      else cls = 'miss';
      txt = dense ? '' : fmt0(d.protein);
    }
    html += '<div class="rv-dotwrap"><div class="rv-dot '+cls+(dense?' small':'')+'" style="'+style+'">'+txt+'</div>'+
      (dense ? '' : '<div class="rv-dotlab">'+d.day+'</div>')+'</div>';
  });
  return html + '</div><p class="rv-cap" style="margin:10px 0 0;">Solid hit · faded within 10% · hollow missed · dashed not confirmed</p></div>';
}

// Everything the charts need, whatever the stored review predates. A review is
// saved as finished text plus a stats blob, and blobs written before v39 have
// no per-day detail — so rather than show nothing, recompute from the logs.

/* ===================== Every nutrient, in every review =======================
   The day screen folds the unmeasured ones away, which is right for a glance
   but wrong for a review. A review is where you find out what you are missing,
   and something you never measured cannot be found by hiding it.

   So the reviews carry all of them, grouped, always - and keep the two kinds
   of problem apart. "Low" means eat differently. "Not measured" means log
   better. Same-looking gap, opposite fix.
=========================================================================== */

// Daily figures for a window of days. A nutrient is averaged across the days
// it was actually measured on, not across all of them - otherwise a fibre
// figure known on three days of seven reads as less than half of what you ate.
function nutrientWindow(dates){
  // Each day read once. This used to re-read every day for every nutrient.
  const cache = new Map();
  const loadEntries = d => {
    const k = ymd(asDate(d));
    if(!cache.has(k)) cache.set(k, window.loadEntries(d));
    return cache.get(k);
  };
  let days = (dates || []).filter(d=>loadEntries(d).length);
  // Confirmed days only, when there are any - the same days the calorie
  // average uses. A half-logged day dragged every nutrient down while the
  // calories beside it ignored that day.
  if(days.length > 1){
    const done = days.filter(d=>isDayComplete(ymd(asDate(d))));
    if(done.length) days = done;
  }
  const all = [];
  days.forEach(d=>{ loadEntries(d).forEach(e=>all.push(e)); });
  const specs = microTargetsFor(all);
  const vals = {}, daysFor = {};
  specs.forEach(m=>{
    let sum = 0, n = 0;
    days.forEach(d=>{
      const entries = loadEntries(d);
      let tot = 0, any = false;
      entries.forEach(e=>{
        const v = microValue(m, e);
        if(v !== undefined && v !== null){ tot += v; any = true; }
      });
      if(any){ sum += tot; n++; }
    });
    vals[m.k] = n ? sum / n : null;
    daysFor[m.k] = n;
  });
  // Protein is a macro and lives on the entry, but three body systems are
  // built out of it, so it travels with the rest.
  let psum = 0, pn = 0;
  days.forEach(d=>{
    const t = loadEntries(d).reduce((a,e)=>a + (Number(e.protein) || 0), 0);
    psum += t; pn++;
  });
  vals.protein = pn ? psum / pn : null;
  daysFor.protein = pn;
  return {vals, daysFor, days: days.length, specs, entries: all, specMap: (function(){
    const m = {};
    specs.forEach(s=>{ m[s.k] = s; });
    m.protein = proteinSpec();
    return m;
  })()};
}

// Four states, and the two middle ones are deliberately different colours from
// each other: "a bit under" and "well off" want different amounts of attention.
function nutrientState(spec, have){
  if(have === null || have === undefined) return {s:'none', pct:0};
  const target = Number(spec.target != null ? spec.target : (spec.rda && spec.rda.m));
  if(!(target > 0)) return {s:'none', pct:0};
  const pct = have / target * 100;
  // Informational: the number and its reference are shown, but it is never
  // reported as a fault. Total sugars reads 125 g against 75 on a day with six
  // pieces of fruit in it, and calling that "over the line" would be telling
  // you off for eating fruit. Free sugars carries the ceiling that matters.
  if(spec.info) return {s:'ok', pct: Math.min(140, pct), info:true};
  if(spec.limit) return {s: pct > 100 ? 'bad' : 'ok', pct: Math.min(140, pct)};
  if(spec.ul && have > spec.ul) return {s:'bad', pct:140};
  if(pct >= 85) return {s:'ok', pct: Math.min(140, pct)};
  if(pct >= 55) return {s:'low', pct};
  return {s:'bad', pct};
}

const NREV_COL = {ok:'var(--accent)', low:'var(--caution)', bad:'var(--danger)', none:'var(--border)'};
const NREV_GROUPS = ['Protein','Fats','Carbohydrate','Minerals','Vitamins'];
function nutrientGroupOf(k){ return k === 'protein' ? 'Protein' : microGroup(k); }

let nrevOpen = {};
function nrevTarget(spec){
  return Number(spec.target != null ? spec.target : (spec.rda && spec.rda.m));
}
function nrevNum(v){
  if(v == null) return '';
  return v < 10 ? Math.round(v*10)/10 : fmt0(v);
}
function nrevUnit(u){ return u === 'ug' ? 'µg' : u; }

function nutrientGroupCard(g, w){
  const list = Object.keys(w.specMap).map(k=>w.specMap[k])
    .filter(m=>nutrientGroupOf(m.k) === g && !m.unranged);
  if(!list.length) return '';
  const st = list.map(m=>{
    const s = nutrientState(m, w.vals[m.k]);
    return {m, s: s.s, pct: s.pct};
  });
  const n = x => st.filter(y=>y.s === x).length;
  const bits = [];
  if(n('ok'))   bits.push(n('ok') + ' fine');
  if(n('low'))  bits.push(n('low') + ' low');
  if(n('bad'))  bits.push(n('bad') + ' off');
  if(n('none')) bits.push(n('none') + ' unmeasured');
  const ORD = {ok:0, low:1, bad:2, none:3};

  let html = '<div class="nrev-g" data-nrevg="'+esc(g)+'">'+
    '<div class="nrev-gh"><span class="nrev-gn">'+esc(g)+'</span>'+
    '<span class="nrev-gc">'+st.length+' &middot; '+(nrevOpen[g] ? 'hide' : 'show')+'</span></div>'+
    '<div class="nrev-stack">'+
      st.slice().sort((a,b)=>ORD[a.s] - ORD[b.s])
        .map(x=>'<i style="flex:1; background:'+NREV_COL[x.s]+'"></i>').join('')+
    '</div><div class="nrev-gc" style="margin-top:7px;">'+esc(bits.join(' · '))+'</div>';

  if(nrevOpen[g]){
    html += '<div class="nrev-rows">' + st.sort((a,b)=>ORD[a.s] - ORD[b.s] || a.pct - b.pct)
      .map(x=>{
        const v = w.vals[x.m.k];
        return '<div class="nrev-r"><i class="nrev-dot" style="background:'+NREV_COL[x.s]+'"></i>'+
          '<span class="nrev-n">'+esc(x.m.n)+'</span>'+
          (x.s === 'none'
            ? '<span class="nrev-v" style="color:var(--text3)">'+
              (((typeof isSourceless === 'function') && isSourceless(x.m.k)) ? 'no source yet' : 'not measured')+'</span>'
            : '<span class="nrev-v"><b>'+nrevNum(v)+'</b> / '+(x.m.limit ? 'max ' : '')+
              nrevNum(nrevTarget(x.m))+' '+esc(nrevUnit(x.m.u))+'</span>')+
          '<span class="nrev-b"><i style="width:'+Math.min(100, x.pct).toFixed(0)+
            '%; background:'+NREV_COL[x.s]+'"></i></span></div>';
      }).join('') + '</div>';
  }
  return html + '</div>';
}

function nrevFoodChips(key){
  const f = foodsRichIn(key, 2);
  if(!f.length) return '';
  return '<div class="nrev-f">'+f.map(x=>'<span><b>'+esc(x.name)+'</b> '+
    x.portion+'g = '+Math.round(x.share*100)+'%</span>').join('')+'</div>';
}

// What to actually do. Worst first, three of each at most - a review listing
// fifteen things to fix gets read as noise and changes nothing.
function nutrientActions(w, label, opts){
  opts = opts || {};
  const st = Object.keys(w.specMap).map(k=>w.specMap[k]).filter(m=>!m.unranged)
    .map(m=>{ const s = nutrientState(m, w.vals[m.k]); return {m, s:s.s, pct:s.pct}; });
  const over = st.filter(x=>x.s === 'bad' && x.m.limit && !x.m.info);
  // Every shortfall when the list is compact - one line each is cheap, and
  // the point of the review is that nothing is left off it.
  const short = st.filter(x=>x.s === 'low' || (x.s === 'bad' && !x.m.limit))
                  .sort((a,b)=>a.pct - b.pct).slice(0, opts.compact ? 99 : 3);
  const noneAll = st.filter(x=>x.s === 'none');
  const noSourceAll = noneAll.filter(x=>(typeof isSourceless === 'function') && isSourceless(x.m.k));
  let gone = noneAll.filter(x=>noSourceAll.indexOf(x) < 0).slice(0, 3);
  let html = '';

  if(over.length){
    html += '<div class="section-title">Over the line</div>';
    over.forEach(x=>{
      html += '<div class="nrev-fix"><div class="nrev-fh">'+esc(x.m.n)+'</div>'+
        '<div class="nrev-fs">'+nrevNum(w.vals[x.m.k])+' '+esc(nrevUnit(x.m.u))+' '+esc(label)+
        ', against a ceiling of '+nrevNum(nrevTarget(x.m))+'.'+
        (x.m.k === 'sodium' ? ' Most of it is in bread, sauces and anything cured — not the salt pot.' : '')+
        '</div></div>';
    });
  }
  if(short.length && opts.compact){
    // The plan at the top already ranks the foods across every gap, so here
    // each shortfall gets one line and its single best food - a reference
    // list, not a second set of cards saying the same thing.
    html += '<div class="nrev-sec"><div class="nrev-sh">Under where you want it</div>'+
      '<div class="rv-card" style="padding:4px 14px;">'+short.map(x=>{
        const best = foodsRichIn(x.m.k, 1)[0];
        return '<div class="under-r"><span class="under-n"><i class="nrev-dot" style="background:'+
          (x.s === 'bad' ? 'var(--danger)' : 'var(--caution)')+'"></i>'+esc(x.m.n)+'</span>'+
          '<span class="under-p">'+Math.round(x.pct)+'%</span>'+
          (best ? '<span class="under-f">'+esc(best.name)+' <s>'+best.portion+'g</s></span>' : '')+
          '</div>';
      }).join('')+'</div></div>';
  } else if(short.length){
    html += '<div class="section-title">Under where you want it</div>';
    // The combined picks go first: one food that fixes three things beats
    // three separate lists you have to cross-reference yourself.
    html += combinedFixesHTML(w, label);
    if(html.indexOf('nrev-combo-h') >= 0){
      html += '<div class="nrev-combo-h" style="margin-top:14px;">One at a time</div>';
    }
    short.forEach(x=>{
      html += '<div class="nrev-fix"><div class="nrev-fh">'+esc(x.m.n)+' — '+
        Math.round(x.pct)+'% of target</div>'+
        '<div class="nrev-fs">'+nrevNum(w.vals[x.m.k])+' of '+nrevNum(nrevTarget(x.m))+' '+
        esc(nrevUnit(x.m.u))+' '+esc(label)+'.</div>'+ nrevFoodChips(x.m.k) +'</div>';
    });
  }
  // Nutrients no table COACH ships has a figure for are not YOUR gap: nothing
  // you could have eaten would have filled them in. They get their own line
  // instead of being listed as something to fix every week.
  const noSource = noSourceAll;
  if(noSource.length){
    html += '<div class="section-title">COACH cannot see these yet</div>'+
      '<p class="nrev-note">'+esc(noSource.map(x=>x.m.n).join(', '))+
      ': no figures in COACH\u2019s food tables. The USDA key in Settings fills '+(noSource.length > 1 ? 'them' : 'it')+' in.</p>';
  }
  if(gone.length){
    html += '<div class="section-title">Never measured</div>'+
      '<p class="nrev-note">Unknown, not low: nothing you logged had a figure for these. '+
      'The foods below cover them anyway.</p>';
    gone.forEach(x=>{
      // A ceiling is not a target. "Eat these to get more trans fat" would be
      // actively bad advice, so a limit is told the other way round.
      const chips = foodsRichIn(x.m.k, 2);
      html += '<div class="nrev-fix"><div class="nrev-fh">'+esc(x.m.n)+'</div>'+
        '<div class="nrev-fs">'+(x.m.limit
          ? 'A ceiling of '+nrevNum(nrevTarget(x.m))+' '+esc(nrevUnit(x.m.u))+
            ' a day, and nothing you logged declared it. Worth knowing where it hides:'
          : 'Target '+nrevNum(nrevTarget(x.m))+' '+esc(nrevUnit(x.m.u))+' a day.')+'</div>'+
        (chips.length
          ? '<div class="nrev-f">'+chips.map(c=>'<span><b>'+esc(c.name)+'</b>'+
              (x.m.limit ? '' : ' '+c.portion+'g = '+Math.round(c.share*100)+'%')+
              '</span>').join('')+'</div>'
          : '<div class="nrev-fs" style="margin-top:6px;">Nothing in the food tables carries a '+
            'figure for this yet — a USDA key in settings fills it.</div>')+'</div>';
    });
  }
  return html;
}

// The systems, worst first, each one a way in to its own breakdown.
function nutrientSystems(w, dates){
  const rows = SYSTEMS.map(s=>{
    const seen = s.all.filter(k=>w.specMap[k] && w.vals[k] != null);
    const cov = seen.length / s.all.length;
    let pct = null;
    if(seen.length){
      pct = Math.round(seen.reduce((a,k)=>{
        const m = w.specMap[k], x = nutrientState(m, w.vals[k]);
        return a + (m.limit ? Math.max(0, 100 - Math.max(0, x.pct - 100)) : Math.min(100, x.pct));
      }, 0) / seen.length);
    }
    return {s, pct, cov, seen: seen.length, total: s.all.length,
            trust: cov >= SYSTEM_COVERAGE_OK};
  }).sort((a,b)=>{
    const au = (!a.trust || a.pct === null), bu = (!b.trust || b.pct === null);
    return (au - bu) || (a.pct - b.pct);
  });

  return '<div class="rv-card" style="padding:4px 14px;">'+rows.map(r=>{
    const col = (!r.trust || r.pct === null) ? 'var(--border)'
      : r.pct >= 80 ? 'var(--accent)' : r.pct >= 55 ? 'var(--caution)' : 'var(--danger)';
    return '<div class="nrev-sys" data-nrevsys="'+esc(r.s.k)+'">'+
      '<span class="nrev-si">'+r.s.ico+'</span>'+
      '<span class="nrev-sn">'+esc(r.s.n)+'</span>'+
      '<span class="nrev-sb"><i style="width:'+
        ((!r.trust || r.pct === null) ? r.cov * 100 : r.pct)+'%; background:'+col+'"></i></span>'+
      '<span class="nrev-sp" style="color:'+((!r.trust || r.pct === null) ? 'var(--text3)' : col)+'">'+
        ((!r.trust || r.pct === null) ? '—' : r.pct+'%')+'</span>'+
      '<span class="nrev-sc">›</span></div>';
  }).join('')+'</div>';
}

// One system, opened: every nutrient it needs, measured or not, worst first.

/* ---- the foods that cover the most of one part of you ----
   "Superfood" has no definition; it is a marketing word. This gives it one:
   the foods that cover the MOST of a body system's nutrients in a single
   realistic portion. Not the richest source of one nutrient - foodsRichIn does
   that - but the best all-rounder. Sardines for bones, not a calcium tablet.

   Scoring: for each nutrient the system needs, what share of the daily target
   one portion gives, capped at 100% so a food cannot win on one enormous
   figure. Averaged across the system's nutrients. A nutrient the food has no
   figure for counts as nothing - it only gets credit for what is measured.  */
/* v143: the rules for which foods are worth suggesting, kept in one place.
   They were written out three times (best all-rounders, the nutrient plan and
   the system plan) and had drifted slightly apart. */
const FOOD_NOT_A_DISH = /\b(flour|beverage base|drink powder|lecithin|wattle|lupin|uncooked|giblets|gelatin|bran, |wheatgerm|wheat germ|germ,|meal,|protein isolate|powder)\b/i;
const FOOD_MEATY = /\b(beef|lamb|pork|chicken|turkey|liver|kidney|mince|steak|bacon|sausage|duck|venison|veal|salmon|squid|cod|tuna|prawn|prawns|mackerel|haddock|trout|scallop|scallops|octopus|mussel|mussels)\b/i;
const FOOD_OFFAL = /\b(liver|kidney|kidneys|heart|tongue|tripe|pate|p\u00e2t\u00e9|sweetbread|giblet)\b/i;
const FOOD_NUTSEED = /\b(nut|nuts|walnut|walnuts|almond|almonds|cashew|cashews|pecan|pecans|pistachio|pistachios|hazelnut|hazelnuts|macadamia|seed|seeds|linseed|flaxseed|chia|hemp)\b/i;
const FOOD_GENERIC = /^(seed|nut|meat|flesh|cooked|raw|canned|dried|fresh|boiled|grilled|roasted|fried|baked|fillet|breast|whole|plain|only|and|with|in|the|a|of|lean|fat|skin|stewed|average)$/i;
// Raw meat and fish are published raw in the tables, but nobody plans a meal that way.
function foodRawMeat(name){ return /\braw\b/i.test(name) && FOOD_MEATY.test(name); }

let superPool = null;
function superFoodPool(){
  if(superPool) return superPool;
  // COACH's everyday foods first, then the national tables. Same order and the
  // same reason as foodsRichIn: 4,400 reference foods ranked on nutrients alone
  // surface West Indian cherries and cream of tartar.
  // v117: built from the same rows as richPools instead of converting every
  // built-in food a second time; richOk() is the same five name checks.
  const rp = richPools();
  const out = [];
  const take = (f, tier)=>{
    const name = String(f.name || '');
    if(!(f.kcal100 > 0)) return;
    if(!richOk(f)) return;
    // Anything that is mostly added sugar is not a food to build a system on,
    // however many nutrients it happens to carry. Nor is a condiment or a
    // snack: ranking on how many nutrients a food touches let prawn crackers
    // and 136 g of hoisin sauce onto the heart list.
    if(/\b(sauce|sauces|crackers|crisps|chips|dip|dressing|mayonnaise|mayo|gravy|ketchup|pickle)\b/i.test(name)) return;
    out.push(tier === 0
      ? {name:f.name, kcal100:f.kcal100, p100:f.p100, micros100:f.micros100 || {},
         unitName:f.unitName, unitGrams:f.unitGrams, tier:0}
      : {name:f.name, kcal100:f.kcal100, p100:f.p100, micros100:f.micros100 || {}, tier:1});
  };
  rp[0].forEach(f=>take(f, 0));
  rp[1].forEach(f=>take(f, 1));
  superPool = out;
  return superPool;
}

function systemSuperFoods(sysKey, n, skip){
  const sk = Math.max(0, Number(skip) || 0);
  if(sk > 0){
    const all = systemSuperFoods(sysKey, (n || 4) + sk, 0);
    const out = all.slice(sk);
    return out.length ? out.slice(0, n || 4) : all.slice(0, n || 4);
  }
  const sys = SYSTEMS.filter(s=>s.k === sysKey)[0];
  if(!sys) return [];
  const spec = systemSpecs([]);
  // Ceilings are not things to eat more of, so they play no part in picking
  // what to eat.
  const keys = sys.all.filter(k=>spec[k] && !spec[k].limit);
  if(!keys.length) return [];
  const target = k => Number(spec[k].target != null ? spec[k].target : (spec[k].rda && spec[k].rda.m));
  const want = n || 4;

  // Ingredients and reference-table curiosities that score well and that
  // nobody eats as a portion of anything.
  const NOT_A_DISH = FOOD_NOT_A_DISH;
  // Offal genuinely is the richest all-rounder for most of these systems, and
  // it is worth saying once. Four kinds of it in one list is not four ideas.
  const OFFAL = FOOD_OFFAL;
  // Raw meat and offal are published as raw in the tables, but nobody plans a
  // meal around them that way.
  const RAW_MEAT = /\b(raw)\b/i;
  const MEATY = FOOD_MEATY;
  // Nuts and seeds really are dense all-rounders, which is exactly why they
  // filled the whole heart list on their own. Two is information; four is a
  // list of seeds.
  const NUTSEED = FOOD_NUTSEED;

  const rank = pool => {
    const scored = [];
    pool.forEach(f=>{
      if(NOT_A_DISH.test(f.name)) return;
      if(RAW_MEAT.test(f.name) && MEATY.test(f.name)) return;
      const portion = realisticPortion(f);
      let sum = 0; const hits = [];
      keys.forEach(k=>{
        const per100 = k === 'protein' ? f.p100 : f.micros100[k];
        const t = target(k);
        if(per100 == null || !(t > 0)) return;
        const share = (per100 * portion / 100) / t;
        sum += Math.min(1, share);
        if(share >= 0.2) hits.push({k: k, share: share});
      });
      // One strong nutrient is a good SOURCE, not an all-rounder. It has to
      // cover at least two, or a third of the system, whichever is more.
      if(hits.length < Math.max(2, Math.ceil(keys.length / 3))) return;
      hits.sort((a,b)=>b.share - a.share);
      scored.push({name: f.name, kcal: f.kcal100, portion: Math.round(portion),
                   cover: sum / keys.length, hits: hits, of: keys.length, tier: f.tier,
                   offal: OFFAL.test(f.name), nutseed: NUTSEED.test(f.name)});
    });
    // How MANY of the system's nutrients a food covers comes first - that is
    // what "all-rounder" means, and the card says "covers 6 of 8". Ranking on
    // total coverage alone put hemp seeds (4 of 8, but huge on two of them)
    // above anchovies (6 of 8), under a heading that promised the opposite.
    return scored.sort((a,b)=>(b.hits.length - a.hits.length) || (b.cover - a.cover));
  };

  const GENERIC = FOOD_GENERIC;
  const nouns = s => s.toLowerCase().split(/[^a-z0-9]+/)
    .map(x=>x.replace(/s$/, '')).filter(x=>x.length > 2 && !GENERIC.test(x));

  // Two passes, and the order is the whole point - the same lesson as
  // foodsRichIn. COACH's own everyday foods are searched first; the 4,400
  // reference-table entries only fill in if they cannot make a list of four.
  // Ranking everything together put hemp flour and wattle seed on top.
  const pool = superFoodPool();
  const passes = [pool.filter(f=>f.tier === 0), pool.filter(f=>f.tier === 1)];
  const taken = {}, out = [];
  let offalUsed = false, nutseedUsed = 0;
  for(const p of passes){
    for(const f of rank(p)){
      if(f.offal && offalUsed) continue;
      if(f.nutseed && nutseedUsed >= 2) continue;
      const ns = nouns(f.name);
      if(!ns.length || ns.some(x=>taken[x])) continue;
      ns.forEach(x=>{ taken[x] = true; });
      if(f.offal) offalUsed = true;
      if(f.nutseed) nutseedUsed++;
      out.push(f);
      if(out.length >= want) return out;
    }
  }
  return out;
}

// How far down each list the shuffle has walked, this session only. Nothing is
// stored: the lists are worked out from your own targets every time.
const shuffleAt = {};

function superFoodsHTML(sysKey){
  const skip = shuffleAt['sys:' + sysKey] || 0;
  const list = systemSuperFoods(sysKey, 4, skip);
  if(!list.length) return '';
  const spec = systemSpecs([]);
  const nm = k => k === 'protein' ? 'protein' : (spec[k] ? spec[k].n : k);
  return '<div class="section-title shufh"><span>Best all-rounders for this</span>'+
    '<button class="shufb" data-shufsys="'+esc(sysKey)+'">'+
    '<i class="ti ti-arrows-shuffle" aria-hidden="true"></i>Shuffle</button></div>'+
    '<p class="nrev-note">The foods that cover the most of what this part of you needs in one '+
    'normal portion — not the richest source of any single nutrient.</p>'+
    list.map(f=>'<div class="nrev-fix"><div class="nrev-fh">'+esc(f.name)+
      ' <span style="color:var(--text3); font-weight:400;">'+f.portion+'g</span></div>'+
      '<div class="nrev-fs">Covers '+f.hits.length+' of its '+f.of+' nutrients at a fifth of '+
      'your daily target or more.</div>'+
      '<div class="nrev-f">'+f.hits.slice(0, 6).map(x=>
        '<span><b>'+esc(nm(x.k))+'</b> '+Math.round(Math.min(x.share, 9.99) * 100)+'%</span>').join('')+
      '</div></div>').join('');
}

// Protein is a macro and has no micro spec, but three systems are built out
// of it, so it gets its own entry into the breakdown sheet.
function specForNutrient(k, entries){
  if(k === 'protein'){
    return {k:'protein', n:'Protein', u:'g', target: Number(targets && targets.protein) || 0,
            limit:false, read:e=>Number(e.protein) || 0, dp:null};
  }
  return specForMicro(k, entries);
}


/* ---- one food, several gaps ----
   The review used to list each shortfall with its own foods. Short on
   calcium, vitamin D and protein, you got three separate lists - and had to
   notice for yourself that sardines appear on all three. This does the
   noticing. Foods are ranked by how MANY of today's gaps one normal portion
   helps with, then by how much of them it closes.

   "Closes" is measured against what you were actually short, not against the
   full daily target: 20 mg of calcium matters a lot when you are 30 mg short
   and not at all when you are 700 mg short.                                  */
const COMBO_HELP = 0.25;      // closes at least a quarter of that gap
function combinedFixes(w, n){
  const gaps = [];
  Object.keys(w.specMap).forEach(k=>{
    const m = w.specMap[k];
    if(!m || m.limit || m.info || m.unranged) return;
    const have = w.vals[k];
    if(have == null) return;                         // unknown is not short
    const st = nutrientState(m, have);
    if(st.s !== 'low' && st.s !== 'bad') return;
    const t = nrevTarget(m);
    const short = t - have;
    if(short > 0) gaps.push({k: k, m: m, short: short});
  });
  if(gaps.length < 2) return {gaps: gaps, foods: []};

  const NOT_A_DISH = FOOD_NOT_A_DISH;
  const RAW = /\braw\b/i;
  const MEATY = FOOD_MEATY;
  const OFFAL = FOOD_OFFAL;
  const NUTSEED = FOOD_NUTSEED;

  const rank = pool => {
    const out = [];
    pool.forEach(f=>{
      if(NOT_A_DISH.test(f.name)) return;
      if(RAW.test(f.name) && MEATY.test(f.name)) return;
      const portion = realisticPortion(f);
      const helps = [];
      let closed = 0;
      gaps.forEach(g=>{
        const per100 = g.k === 'protein' ? f.p100 : (f.micros100 || {})[g.k];
        if(per100 == null || !(per100 > 0)) return;
        const amount = per100 * portion / 100;
        const c = Math.min(1, amount / g.short);
        closed += c;
        if(c >= COMBO_HELP) helps.push({k: g.k, n: g.m.n, closes: c});
      });
      if(helps.length < 2) return;
      helps.sort((a,b)=>b.closes - a.closes);
      out.push({name: f.name, portion: Math.round(portion),
                kcal: Math.round(f.kcal100 * portion / 100),
                helps: helps, closed: closed,
                offal: OFFAL.test(f.name), nutseed: NUTSEED.test(f.name)});
    });
    return out.sort((a,b)=>(b.helps.length - a.helps.length) || (b.closed - a.closed));
  };

  const GENERIC = FOOD_GENERIC;
  const nouns = s => s.toLowerCase().split(/[^a-z0-9]+/)
    .map(x=>x.replace(/s$/, '')).filter(x=>x.length > 2 && !GENERIC.test(x));

  // Everyday foods first; the reference tables only fill in.
  const pool = superFoodPool();
  const passes = [pool.filter(f=>f.tier === 0), pool.filter(f=>f.tier === 1)];
  const taken = {}, picked = [];
  let offal = false, nutseed = 0;
  for(const p of passes){
    for(const f of rank(p)){
      if(f.offal && offal) continue;
      if(f.nutseed && nutseed >= 1) continue;     // one handful of something is plenty
      const ns = nouns(f.name);
      if(!ns.length || ns.some(x=>taken[x])) continue;
      ns.forEach(x=>{ taken[x] = true; });
      if(f.offal) offal = true;
      if(f.nutseed) nutseed++;
      picked.push(f);
      if(picked.length >= (n || 3)) return {gaps: gaps, foods: picked};
    }
  }
  return {gaps: gaps, foods: picked};
}

function combinedFixesHTML(w, label){
  const r = combinedFixes(w, 3);
  if(!r.foods.length) return '';
  const total = r.gaps.length;
  return '<div class="nrev-combo-h">Best fixes, all at once</div>'+
    '<p class="nrev-note">You were short on '+total+' things '+esc(label)+'. These cover the most '+
    'of them in one normal portion. Percentages are how much of what you were <b>missing</b> '+
    'each one makes up.</p>'+
    r.foods.map((f, i)=>'<div class="nrev-fix nrev-combo'+(i === 0 ? ' top' : '')+'">'+
      '<div class="nrev-fh">'+esc(f.name)+' <span style="color:var(--text3); font-weight:400;">'+
        f.portion+'g &middot; '+f.kcal+' kcal</span></div>'+
      '<div class="nrev-fs">Helps with <b style="color:var(--text)">'+f.helps.length+' of your '+
        total+'</b> gaps.</div>'+
      '<div class="nrev-f">'+f.helps.map(x=>'<span><b>'+esc(x.n)+'</b> '+
        (x.closes >= 1 ? 'all of it' : Math.round(x.closes * 100)+'%')+'</span>').join('')+
      '</div></div>').join('');
}


/* ======================= The plan: what to start eating =====================
   The review listed each shortfall with its own foods, and each body system
   with its own foods, and left the cross-referencing to you. This does it.

   Every food is scored against EVERYTHING that came up short, and ranked:
     1. by how many weak parts of the body it helps (the most areas first);
     2. then by how much it closes - a nutrient that was badly short counts
        double one that was only a bit under (improving areas the most).
   "Closes" is always measured against what you were actually missing, not
   the full daily target.                                                    */

// Every system's standing for a window, and which of its nutrients are short.
function systemStandings(w){
  return SYSTEMS.map(s=>{
    const seen = s.all.filter(k=>w.specMap[k] && w.vals[k] != null);
    const cov = s.all.length ? seen.length / s.all.length : 0;
    let pct = null;
    const short = [];
    if(seen.length){
      pct = Math.round(seen.reduce((a,k)=>{
        const m = w.specMap[k], x = nutrientState(m, w.vals[k]);
        if(!m.limit && !m.info && (x.s === 'low' || x.s === 'bad')){
          short.push({k: k, m: m, pct: Math.round(x.pct), sev: x.s === 'bad' ? 2 : 1});
        }
        return a + (m.limit ? Math.max(0, 100 - Math.max(0, x.pct - 100)) : Math.min(100, x.pct));
      }, 0) / seen.length);
    }
    const trust = cov >= SYSTEM_COVERAGE_OK;
    const tone = (!trust || pct === null) ? 'grey' : pct >= 80 ? 'green' : pct >= 55 ? 'yellow' : 'red';
    short.sort((a,b)=>a.pct - b.pct);
    return {s: s, pct: pct, cov: cov, trust: trust, tone: tone, short: short};
  });
}

function reviewPlan(w, n, opts){
  opts = opts || {};
  const stand = systemStandings(w);
  const weak = stand.filter(x=>x.tone === 'red' || x.tone === 'yellow');
  // Which weak systems each nutrient belongs to, and how badly each is short.
  const gaps = {};
  Object.keys(w.specMap).forEach(k=>{
    const m = w.specMap[k];
    if(!m || m.limit || m.info || m.unranged) return;
    if(opts.only && opts.only.indexOf(k) < 0) return;
    const have = w.vals[k];
    if(have == null) return;                      // unknown is not short
    const st = nutrientState(m, have);
    if(st.s !== 'low' && st.s !== 'bad') return;
    const short = nrevTarget(m) - have;
    if(!(short > 0)) return;
    gaps[k] = {k: k, m: m, short: short, sev: st.s === 'bad' ? 2 : 1,
               systems: weak.filter(x=>x.s.all.indexOf(k) >= 0).map(x=>x.s)};
  });
  const gapKeys = Object.keys(gaps);
  if(!gapKeys.length) return {gaps: [], foods: [], weak: weak};

  const NOT_A_DISH = FOOD_NOT_A_DISH;
  const RAW_MEATY = {test: foodRawMeat};
  const OFFAL = FOOD_OFFAL;
  const NUTSEED = FOOD_NUTSEED;
  const needHelps = opts.minHelps || 1;

  const rank = pool => {
    const out = [];
    pool.forEach(f=>{
      if(NOT_A_DISH.test(f.name) || RAW_MEATY.test(f.name)) return;
      const portion = realisticPortion(f);
      const helps = [], sysSet = {};
      let score = 0;
      gapKeys.forEach(k=>{
        const g = gaps[k];
        const per100 = k === 'protein' ? f.p100 : (f.micros100 || {})[k];
        if(per100 == null || !(per100 > 0)) return;
        const c = Math.min(1, (per100 * portion / 100) / g.short);
        if(c < COMBO_HELP) return;
        // How much this matters: how much of the gap it closes, doubled when
        // the nutrient was badly short, and multiplied by how many weak parts
        // of the body that one nutrient is holding back. Vitamin D at 10%
        // drags muscle, bones, immune and thyroid at once; fixing it is worth
        // more than tidying four small gaps that each touch one system.
        score += g.sev * c * Math.max(1, g.systems.length);
        helps.push({k: k, n: g.m.n, closes: c, sev: g.sev});
        g.systems.forEach(s=>{ sysSet[s.k] = s; });
      });
      if(helps.length < needHelps) return;
      helps.sort((a,b)=>(b.sev - a.sev) || (b.closes - a.closes));
      out.push({name: f.name, portion: Math.round(portion),
                kcal: Math.round(f.kcal100 * portion / 100),
                helps: helps, score: score,
                systems: Object.keys(sysSet).map(k=>sysSet[k]),
                offal: OFFAL.test(f.name), nutseed: NUTSEED.test(f.name)});
    });
    // Ranked on the combined score, which already carries both halves of the
    // brief - the most areas, and improving them the most. Ranking on the
    // number of systems touched alone put three leafy greens on top: each
    // nudged four systems a little, and none touched the worst gap of the day.
    return out.sort((a,b)=>(b.score - a.score) || (b.systems.length - a.systems.length));
  };

  const GENERIC = FOOD_GENERIC;
  const nouns = s => s.toLowerCase().split(/[^a-z0-9]+/)
    .map(x=>x.replace(/s$/, '')).filter(x=>x.length > 2 && !GENERIC.test(x));

  const pool = superFoodPool();
  const passes = [pool.filter(f=>f.tier === 0), pool.filter(f=>f.tier === 1)];
  // Four foods from four different families. "Spinach, kale, watercress" is
  // one suggestion said three times.
  const FAMILIES = [
    ['greens', /\b(spinach|kale|watercress|chard|spring greens|cabbage|lettuce|rocket|pak choi|bok choy|collard|greens)\b/i],
    ['oilyfish', /\b(salmon|mackerel|sardine|sardines|herring|trout|anchov\w*|pilchard|pilchards|kipper)\b/i],
    ['whitefish', /\b(cod|haddock|pollock|hake|plaice|sole|tuna|basa)\b/i],
    ['shellfish', /\b(prawn|prawns|shrimp|crab|mussel|mussels|oyster|oysters|scallop|scallops|clam|clams|squid|lobster)\b/i],
    ['soy', /\b(tofu|tempeh|edamame|soya|soy)\b/i],
    ['legumes', /\b(lentil|lentils|bean|beans|chickpea|chickpeas|pea|peas|hummus)\b/i],
    ['dairy', /\b(milk|yogurt|yoghurt|kefir|skyr|quark|cheese|cheddar|mozzarella|feta|parmesan|halloumi|cottage)\b/i],
    ['redmeat', /\b(beef|lamb|pork|venison|steak|mince)\b/i],
    ['poultry', /\b(chicken|turkey|duck)\b/i],
    ['egg', /\b(egg|eggs|yolk)\b/i],
    ['citrus', /\b(orange|oranges|grapefruit|lemon|lime|clementine|satsuma|kiwi)\b/i],
    ['berries', /\b(berry|berries|strawberr\w*|blueberr\w*|raspberr\w*|blackberr\w*)\b/i],
    ['roots', /\b(potato|potatoes|sweet potato|carrot|carrots|parsnip|beetroot|squash|pumpkin)\b/i],
    ['cruciferous', /\b(broccoli|cauliflower|sprouts|brussels)\b/i],
    ['grains', /\b(oats|porridge|bread|rice|quinoa|pasta|barley|bulgur|couscous)\b/i]
  ];
  const familyOf = name => { for(const [k, re] of FAMILIES) if(re.test(name)) return k; return null; };
  const famUsed = {};
  const taken = {}, picked = [];
  const skip = opts.skip || {};
  let offal = false, nutseed = 0;
  for(const p of passes){
    for(const f of rank(p)){
      if(skip[f.name]) continue;
      if(f.offal && offal) continue;
      if(f.nutseed && nutseed >= 1) continue;
      const fam = familyOf(f.name);
      if(fam && famUsed[fam]) continue;
      const ns = nouns(f.name);
      if(!ns.length || ns.some(x=>taken[x])) continue;
      ns.forEach(x=>{ taken[x] = true; });
      if(f.offal) offal = true;
      if(f.nutseed) nutseed++;
      if(fam) famUsed[fam] = true;
      picked.push(f);
      if(picked.length >= (n || 4)) return {gaps: gapKeys.map(k=>gaps[k]), foods: picked, weak: weak};
    }
  }
  return {gaps: gapKeys.map(k=>gaps[k]), foods: picked, weak: weak};
}

const TONE_COL = {red:'var(--danger)', yellow:'var(--caution)', green:'var(--accent)', grey:'var(--border)'};

function planFoodCard(f, i, totalGaps){
  return '<div class="plan-food'+(i === 0 ? ' top' : '')+'">'+
    '<div class="plan-fh"><span class="plan-rank">'+(i + 1)+'</span>'+
      '<span class="plan-fn">'+esc(f.name)+'</span>'+
      '<span class="plan-fp">'+f.portion+'g &middot; '+f.kcal+' kcal</span></div>'+
    (f.systems.length
      ? '<div class="plan-sys">'+f.systems.map(s=>'<span>'+s.ico+' '+esc(s.n)+'</span>').join('')+'</div>'
      : '')+
    // Four at most. The rest are real but a card with eight chips is the
    // clutter this layout exists to avoid, so they are counted, not listed.
    '<div class="nrev-f">'+f.helps.slice(0, 4).map(x=>'<span'+(x.sev === 2 ? ' class="sev"' : '')+'><b>'+
      esc(x.n)+'</b> '+(x.closes >= 1 ? '\u2713' : Math.round(x.closes * 100)+'%')+'</span>').join('')+
      (f.helps.length > 4 ? '<span class="more">+'+(f.helps.length - 4)+' more</span>' : '')+
    '</div></div>';
}

// The top of every review: what to start eating, ranked.
function reviewPlanHTML(w, label){
  const r = reviewPlan(w, 4);
  if(!r.gaps.length){
    return '<div class="nrev-sec"><div class="nrev-sh">Your plan</div>'+
      '<p class="nrev-sub">Nothing measured came up short '+esc(label)+'. Keep doing what you are doing.</p></div>';
  }
  if(!r.foods.length) return '';
  const red = r.weak.filter(x=>x.tone === 'red').length;
  const yellow = r.weak.filter(x=>x.tone === 'yellow').length;
  const areas = red + yellow;
  return '<div class="nrev-sec"><div class="nrev-sh">Your plan</div>'+
    '<p class="nrev-sub"><b>'+r.gaps.length+' nutrient'+(r.gaps.length === 1 ? '' : 's')+' short.</b> Add these, top first.<br>'+
    '<span style="color:var(--text2)">\u2713 fills it &middot; % of the gap per portion &middot; red = badly short</span></p>'+
    r.foods.map((f, i)=>planFoodCard(f, i, r.gaps.length)).join('')+'</div>';
}

// Red first, then yellow. For each: what is dragging it down, and the two
// foods that fix that system's own gaps best.
function reviewWeakAreasHTML(w, label){
  const stand = systemStandings(w).filter(x=>x.tone === 'red' || x.tone === 'yellow')
    .sort((a,b)=>(a.tone === b.tone ? a.pct - b.pct : (a.tone === 'red' ? -1 : 1)));
  if(!stand.length) return '';
  return '<div class="nrev-sec"><div class="nrev-sh">Parts of you that need work</div>'+
    '<p class="nrev-sub">Worst first. Tap one for the full breakdown.</p>'+
    stand.map(x=>{
      const own = x.short.length
        ? reviewPlan(w, 2, {only: x.short.map(s=>s.k)}).foods
        : [];
      const dragging = x.short.slice(0, 4).map(s=>'<span style="color:'+
        (s.sev === 2 ? 'var(--danger)' : 'var(--caution)')+'">'+esc(s.m.n)+' '+s.pct+'%</span>').join(', ');
      return '<div class="weak-card" data-nrevsys="'+esc(x.s.k)+'" style="border-left-color:'+TONE_COL[x.tone]+'">'+
        '<div class="weak-h"><span class="weak-i">'+x.s.ico+'</span>'+
          '<span class="weak-n">'+esc(x.s.n)+'</span>'+
          '<span class="weak-p" style="color:'+TONE_COL[x.tone]+'">'+x.pct+'%</span>'+
          '<span class="nrev-sc">›</span></div>'+
        (dragging ? '<div class="weak-d">Held back by '+dragging+'</div>' : '')+
        (own.length ? '<div class="weak-f"><span class="weak-fl">Start with</span>'+
          own.map(f=>'<b>'+esc(f.name)+'</b> <s>'+f.portion+'g</s>').join(' <i>or</i> ')+'</div>' : '')+
        '</div>';
    }).join('')+'</div>';
}

function nutrientSystemHTML(key, w, label){
  const s = SYSTEMS.filter(x=>x.k === key)[0];
  if(!s) return '';
  const ORD = {bad:0, low:1, none:2, ok:3};
  const st = s.all.map(k=>{
    const m = w.specMap[k];
    if(!m) return null;
    const x = nutrientState(m, w.vals[k]);
    return {m, k, s:x.s, pct:x.pct, v:w.vals[k]};
  }).filter(x=>x).sort((a,b)=>ORD[a.s] - ORD[b.s] || a.pct - b.pct);

  const seen = st.filter(x=>x.s !== 'none');
  const cov = st.length ? seen.length / st.length : 0;
  const trust = cov >= SYSTEM_COVERAGE_OK;
  const pct = seen.length ? Math.round(seen.reduce((a,x)=>
    a + (x.m.limit ? Math.max(0, 100 - Math.max(0, x.pct - 100)) : Math.min(100, x.pct)), 0) / seen.length) : null;
  const col = (!trust || pct === null) ? 'var(--border)'
    : pct >= 80 ? 'var(--accent)' : pct >= 55 ? 'var(--caution)' : 'var(--danger)';

  let html = '<button class="nrev-back" id="nrev-back">← Back to the review</button>'+
    '<div class="rv-card"><div style="display:flex; align-items:center; gap:13px;">'+
    '<span style="font-size:29px;">'+s.ico+'</span><div>'+
    '<div style="font-size:17px; font-weight:700;">'+esc(s.n)+'</div>'+
    '<div style="font-size:11.5px; color:var(--text3); margin-top:3px;">'+
      ((pct === null) ? 'Nothing measurable yet'
        : trust ? pct+'% fuelled '+esc(label)
                : 'Too little measured to put a number on it')+
      ' · '+seen.length+' of '+st.length+' visible</div></div></div>'+
    '<div class="nrev-b" style="width:100%; height:6px; margin-top:12px;">'+
      '<i style="width:'+((trust && pct !== null) ? pct : cov*100)+'%; background:'+col+'"></i></div>'+
    '<p style="font-size:12.5px; color:var(--text2); line-height:1.55; margin:12px 0 0;">'+
      esc(s.blurb)+'</p></div>';

  html += '<div class="section-title">Every nutrient it needs</div>'+
    '<div class="rv-card">' + st.map(x=>{
      const c = NREV_COL[x.s];
      const needsFood = (x.s === 'low' || x.s === 'none' || (x.s === 'bad' && !x.m.limit));
      return '<div class="nrev-nr" data-nrevnut="'+esc(x.k)+'"><div class="nrev-nt">'+
        '<span class="nrev-nn"><i class="nrev-dot" style="background:'+c+'"></i>'+esc(x.m.n)+
          (x.s === 'none' ? '' : '<span class="nrev-chev">\u203a</span>')+'</span>'+
        (x.s === 'none'
          ? '<span class="nrev-v" style="color:var(--text3)">not measured</span>'
          : '<span class="nrev-v"><b style="color:'+(x.s === 'ok' ? 'var(--text)' : c)+'">'+
            nrevNum(x.v)+'</b> / '+(x.m.limit ? 'max ' : '')+nrevNum(nrevTarget(x.m))+' '+
            esc(nrevUnit(x.m.u))+'</span>')+'</div>'+
        '<div class="nrev-b"><i style="width:'+Math.min(100, x.pct).toFixed(0)+
          '%; background:'+c+'"></i></div>'+
        '<div class="nrev-nd">'+esc(s.does[x.k] || '')+'</div>'+
        (needsFood && !x.m.limit ? nrevFoodChips(x.k) : '')+'</div>';
    }).join('') + '</div>';

  const gaps = st.filter(x=>x.s === 'none').length;
  if(gaps){
    html += '<p class="nrev-note">'+gaps+' of these had no figure in anything you logged, so '+
      'the percentage above is built on the rest. That is a logging gap, not a shortfall — '+
      'they could be fine.</p>';
  }
  html += '<p class="nrev-note">Tap a nutrient to see which foods it came from.</p>';
  return html + superFoodsHTML(key);
}

// The whole block, as it appears in a review.
// Ordered as questions, answer first:
//   what should I eat          -> the plan
//   what is wrong, and why     -> the weak areas
//   how is everything else     -> every system, every nutrient
//   what else should I know    -> over the line, under, never measured
// Each block is its own section with space around it, so the review reads as
// five short things rather than one long one.
function nutrientReviewHTML(w, label){
  return '<div class="nrev-wrap">'+
    reviewPlanHTML(w, label)+
    reviewWeakAreasHTML(w, label)+
    '<div class="nrev-sec"><div class="nrev-sh">Every part of you</div>'+
      '<p class="nrev-sub">Tap any of them for its nutrients, what each does, and where yours came from.</p>'+
      nutrientSystems(w)+'</div>'+
    '<div class="nrev-sec"><div class="nrev-sh">Every nutrient, '+esc(label === 'today' ? 'today' : 'per day')+'</div>'+
      NREV_GROUPS.map(g=>nutrientGroupCard(g, w)).join('')+
      '<div class="nrev-leg">'+
        '<span><i style="background:var(--accent)"></i>in range</span>'+
        '<span><i style="background:var(--caution)"></i>a bit under</span>'+
        '<span><i style="background:var(--danger)"></i>well off</span>'+
        '<span><i style="background:var(--border)"></i>not measured</span></div></div>'+
    '<div class="nrev-sec">'+nutrientActions(w, label, {compact: true})+'</div>'+
    '</div>';
}

// Wiring, shared by all three reviews. The container and a redraw function are
// passed in, because the day card and the review sheet live in different
// places and neither should know about the other.
function wireNutrientReview(root, w, label, redraw){
  if(!root) return;
  root.querySelectorAll('[data-nrevg]').forEach(el=>{
    el.onclick = ()=>{ const g = el.dataset.nrevg; nrevOpen[g] = !nrevOpen[g]; redraw(); };
  });
  root.querySelectorAll('[data-nrevsys]').forEach(el=>{
    el.onclick = ()=>{
      root.innerHTML = nutrientSystemHTML(el.dataset.nrevsys, w, label);
      root.scrollIntoView({block:'start'});
      const back = root.querySelector('#nrev-back');
      if(back) back.onclick = redraw;
      root.querySelectorAll('[data-nrevnut]').forEach(r=>{
        r.onclick = ()=>{
          const spec = specForNutrient(r.dataset.nrevnut, w.entries || []);
          if(!spec) return;
          // A review is a summary of days already gone. Tapping a food in it
          // must not open that food for editing on whatever day is on screen.
          openBreakdown(spec, w.entries || [], {
            days: Math.max(1, w.days || 1),
            label: label === 'today' ? 'Today' : 'Last '+(w.days || 1)+' days',
            noEdit: label !== 'today'
          });
        };
      });
    };
  });
}

/* v141: reviews saved before v141 counted protein against the full target
   while their own "on target" boxes used the floor. For showing them, count
   from each day's own verdict (what the day score said). Nothing saved changes. */
function rvProteinNow(s){
  if(!s.days.some(d => d && d.verdict && 'protein' in d.verdict) || s.days.some(d => d && d.pFloor)) return s;
  const out = Object.assign({}, s);
  out.proteinHit = s.days.filter(d => d.complete && d.verdict && d.verdict.protein).length;
  out.days = s.days.map(d => d && d.pTarget > 0 ? Object.assign({}, d, {pFloor: proteinFloorFor({protein: d.pTarget})}) : d);
  return out;
}
function reviewStats(shown){
  const s = shown && shown.stats;
  if(s && s.days && s.days.length) return rvProteinNow(s);
  if(!shown || !shown.week) return null;
  try{
    const start = parseYMD(shown.week);
    return shown.month
      ? summariseRange(start, new Date(start.getFullYear(), start.getMonth()+1, 0).getDate(), 'month')
      : summariseWeek(start);
  }catch(e){ return null; }
}

// The week the way a day is judged: all three, or it did not count. This sits
// above the older per-measure lines, which stay because they are what tell you
// which of the three slipped.
function reviewOnTarget(s){
  const days = (s.days || []).filter(d=>d.logged);
  if(!days.length) return '';
  const full = days.filter(d=>d.verdict && d.verdict.all).length;
  const calOnly = days.filter(d=>d.verdict && d.verdict.cal).length;
  const proOnly = days.filter(d=>d.verdict && d.verdict.protein).length;
  const qOnly = days.filter(d=>d.verdict && d.verdict.quality).length;

  const strip = days.map(d=>{
    const tone = d.verdict ? d.verdict.tone : 'none';
    return '<div class="rvot-d"><div class="rvot-b" style="background:'+VERDICT_COLOUR[tone]+'"></div>'+
      '<div class="rvot-l">'+esc(d.day)+'</div></div>';
  }).join('');

  const worst = [['calories', calOnly], ['protein', proOnly], ['food quality', qOnly]]
    .sort((a,b)=>a[1]-b[1])[0];

  return '<div class="rv-card">'+
    '<div class="rvot-top"><span class="rvot-n" style="color:'+
      (full === days.length ? 'var(--accent)' : full ? 'var(--caution)' : 'var(--danger)')+'">'+
      full+'<span>/'+days.length+'</span></span>'+
      '<span class="rvot-w">days on target<s>all three landed</s></span></div>'+
    '<div class="rvot-strip">'+strip+'</div>'+
    '<div class="rvot-split">'+
      '<div><b>'+calOnly+'</b><span>calories</span></div>'+
      '<div><b>'+proOnly+'</b><span>protein</span></div>'+
      '<div><b>'+qOnly+'</b><span>quality</span></div>'+
    '</div>'+
    (full === days.length
      ? '<div class="rvot-note">Every logged day counted. Nothing to change.</div>'
      : '<div class="rvot-note">'+esc(worst[0].charAt(0).toUpperCase()+worst[0].slice(1))+
        ' is what cost you most \u2014 it landed on '+worst[1]+' of '+days.length+' days.</div>')+
    '</div>';
}


// The nutrient block inside the weekly or monthly review. Figures are daily
// averages across the days in the period, so they read against the same daily
// target as the day review rather than a made-up weekly one.
function drawReviewNutrients(shown){
  const box = document.getElementById('review-nutrients');
  if(!box) return;
  const s = reviewStats(shown);
  if(!s || !s.days || !s.days.length){ box.innerHTML = ''; return; }
  // summariseRange calls the field `date`, not `ds`. Reading the wrong one
  // gave a window with no days in it, so every nutrient in the weekly and
  // monthly reviews rendered as "not measured".
  const dates = s.days.map(x=>parseYMD(x.date)).filter(x=>x);
  if(!dates.length){ box.innerHTML = ''; return; }
  const w = nutrientWindow(dates);
  const label = 'on an average day';
  const redraw = ()=>{
    box.innerHTML = nutrientReviewHTML(w, label);
    wireNutrientReview(box, w, label, redraw);
  };
  redraw();
}

// Fires on the first open of a new month, and reviews the month before it.
//
// It does NOT touch your targets. The weekly review is the only place an
// automatic target change happens, and adding a second one would mean two
// engines adjusting the same number on different schedules — which is how a
// target ends up moving twice for the same week of data.
function runMonthlyReview(){
  const today = new Date(); today.setHours(0,0,0,0);
  const thisMonth = monthStartOf(today);
  if(CS.getItem(LASTMREVIEW_KEY) === ymd(thisMonth)) return null;
  const lastMonth = monthStartOf(addDays(thisMonth, -1));
  const s = summariseRange(lastMonth, daysInMonthOf(lastMonth), 'month');
  lsSet(LASTMREVIEW_KEY, ymd(thisMonth));
  if(s.daysLogged === 0 && s.partialDays === 0 && s.weighIns === 0) return null;
  const review = { week: s.week, month: true, reviewed: todayYMD(),
                   text: reviewText(s), change: null, stats: s };
  pushMonthReview(review);
  try{ markReviewButton('month'); }catch(e){}
  return review;
}

/* v119: the day a review lands, a small button under Day / Week / Data opens
   it again. It is only there for that day - stored as the date it arrived, so
   tomorrow it is gone without anything having to clear it. Nothing about the
   reviews themselves is stored differently. */
const REVIEW_BTN_KEY = 'coachreviewbtn';
function markReviewButton(kind){
  let m = {};
  try{ m = JSON.parse(CS.getItem(REVIEW_BTN_KEY)) || {}; }catch(e){ m = {}; }
  m[kind] = todayYMD();
  lsSet(REVIEW_BTN_KEY, JSON.stringify(m));
}
function renderReviewPills(){
  const box = document.getElementById('review-pills');
  if(!box) return;
  let m = {};
  try{ m = JSON.parse(CS.getItem(REVIEW_BTN_KEY)) || {}; }catch(e){ m = {}; }
  const today = todayYMD();
  const pills = [];
  if(m.week === today && loadReviews().length)
    pills.push('<button class="rv-pill" data-rvp="week"><i class="ti ti-calendar" aria-hidden="true"></i>'+
               '<span>Weekly review</span><i class="ti ti-chevron-right rv-go" aria-hidden="true"></i></button>');
  if(m.month === today && loadMonthReviews().length){
    const r = loadMonthReviews()[0];
    let label = 'Monthly review';
    try{ label = monthLabel(r.week).split(' ')[0] + ' review'; }catch(e){}
    pills.push('<button class="rv-pill month" data-rvp="month"><i class="ti ti-calendar" aria-hidden="true"></i>'+
               '<span>'+esc(label)+'</span><i class="ti ti-chevron-right rv-go" aria-hidden="true"></i></button>');
  }
  box.innerHTML = pills.join('');
  box.style.display = pills.length ? 'flex' : 'none';
  box.querySelectorAll('[data-rvp]').forEach(b=>{
    b.onclick = ()=>{
      const month = b.dataset.rvp === 'month';
      reviewPeriod = month ? 'month' : 'week';
      const r = month ? loadMonthReviews()[0] : loadReviews()[0];
      renderReviewSheet(r || null);
      openSheet('review-backdrop');
    };
  });
}

// Which period the sheet is showing. The tab is also how you look at a month
// without waiting for the 1st.
let reviewPeriod = 'week';

// The Month tab computes a month live when nothing is stored yet, so the tab
// is never an empty room. The Week tab did not, which meant the nutrient
// breakdown was invisible until the first Monday came round. Same treatment.
function currentWeekReview(){
  const saved = loadReviews();
  if(saved.length) return saved[0];
  const today = new Date(); today.setHours(0,0,0,0);
  const start = reviewableWeek(today);
  if(!start) return null;
  const s = summariseWeek(start);
  if(!s.daysLogged && !s.partialDays && !s.weighIns) return null;
  return { week: s.week, text: reviewText(s), change: null, stats: s, live: true };
}

function currentMonthReview(){
  const saved = loadMonthReviews();
  if(saved.length) return saved[0];
  // Nothing stored yet — show the month just gone, computed live, so the tab is
  // never an empty room.
  const today = new Date(); today.setHours(0,0,0,0);
  const lastMonth = monthStartOf(addDays(monthStartOf(today), -1));
  const s = summariseRange(lastMonth, daysInMonthOf(lastMonth), 'month');
  if(!s.daysLogged && !s.partialDays && !s.weighIns) return null;
  return { week: s.week, month: true, text: reviewText(s), change: null, stats: s, live: true };
}

/* A week's logging lives in one place - this phone - and iOS throws away a web
   app's storage after about a week of not opening it. The nag on the home
   screen catches that, but a nag is something you swipe past. The review is
   the one time you are deliberately sitting down with COACH and reading it, so
   that is where the ask belongs: read the week, save the week.

   Only ever shown on the review you are currently in, never on an old one you
   are flicking back through - there is nothing to back up about last March. */
function reviewBackupHTML(){
  const last = CS.getItem(LASTBACKUP_KEY);
  const n = daysSinceBackup();
  const due = backupDue();
  let line;
  if(!last) line = 'Everything COACH knows is on this phone and nowhere else. ' +
    'One tap saves a copy you can restore from.';
  else if(n === 0) line = 'Saved today. Nothing to do.';
  else if(due) line = 'Last saved ' + n + ' day' + (n === 1 ? '' : 's') + ' ago. ' +
    'Save over the same file - one backup, not forty.';
  else line = 'Last saved ' + n + ' day' + (n === 1 ? '' : 's') + ' ago. You can save again now if you like.';
  return '<div class="rv-bk' + (due ? ' due' : '') + '" id="rv-bk">'+
    '<h4>' + (due ? 'Back this week up' : 'Your backup') + '</h4>'+
    '<p>' + line + '</p>'+
    (n === 0 ? '<div class="ok"><i class="ti ti-check" aria-hidden="true"></i>Backed up today</div>'
             : '<button id="rv-bk-go">Save a backup</button>')+
  '</div>';
}

function wireReviewBackup(){
  const b = document.getElementById('rv-bk-go');
  if(!b) return;
  b.onclick = ()=>{
    exportJSON();
    // exportJSON stamps the date itself; redraw so the block agrees with it.
    if(typeof renderBackupNag === 'function') renderBackupNag();
    const box = document.getElementById('rv-bk');
    if(box){
      box.classList.remove('due');
      box.innerHTML = '<h4>Your backup</h4><p>Saved. Same file as last time, so there is still only one.</p>'+
        '<div class="ok"><i class="ti ti-check" aria-hidden="true"></i>Backed up today</div>';
    }
  };
}


/* ============================================================
   v125 - the review, in sections, with an Update button and closing remarks.
   Everything here is worked out from the same summary the review always had
   (summariseRange). Update re-reads your logs for that week - so a day you
   confirmed afterwards now counts - and saves the fresh numbers into the same
   stored review, same shape. The target decision made at the time is never
   re-run: that would move your target twice for one week.
   ============================================================ */
function rvGoal(){ return loadProfile().goal || 'maintain'; }
function rvKcalLine(s){
  if(!s.daysLogged) return 'No confirmed days, so there is no calorie average yet.';
  const t = s.avgTarget || 0;
  const zone = t ? calorieState(s.avgIntake, t, rvGoal(), true).zone : null;
  const verdict = zone === 'in' ? 'on budget'
    : (s.avgIntake > t ? fmtK(s.avgIntake - t) + ' a day over' : fmtK(t - s.avgIntake) + ' a day under');
  let range = '';
  // v129: say plainly when the days had different targets, so an average that
  // differs from the day screen is never a mystery.
  const tk = (s.days || []).filter(d => d.complete && d.target > 0).map(d => d.target);
  // v143: key points, not a paragraph.
  if(tk.length && Math.max(...tk) - Math.min(...tk) >= 25)
    range = 'targets ' + fmtK(Math.min(...tk)) + '–' + fmtK(Math.max(...tk)) + ' (averaged)';
  const tr = (s.trainDays != null) ? 'trained ' + s.trainDays + ' of ' + (s.nDays || 7) + ' days' : '';
  return rvKeys(['<b>' + fmtK(s.avgIntake) + ' kcal</b> a day', verdict + ' (target ' + fmtK(t) + ')', range, tr]);
}
/* v143: the review's summary lines are short points joined by dots, so the
   main fact is the first thing you read. */
function rvKeys(parts){ return parts.filter(Boolean).join(' <span class="rvx-dot">·</span> '); }
function rvTile(v, l, tone){
  return '<div class="rvx-tile"><b' + (tone ? ' class="' + tone + '"' : '') + '>' + v + '</b><span>' + l + '</span></div>';
}
function reviewTilesHTML(s){
  const n = s.nDays || 7;
  const logged = (s.days || []).filter(d => d.logged).length;
  const t = s.avgTarget || 0;
  const zone = (s.daysLogged && t) ? calorieState(s.avgIntake, t, rvGoal(), true).zone : null;
  const wc = s.weightChange;
  return '<div class="rvx-tiles">' +
    rvTile(s.daysLogged ? fmtK(s.avgIntake) : '—', 'avg kcal a day' + (t ? ' · avg target ' + fmtK(t) : ''),
           zone === 'in' ? 'good' : (zone ? 'warn' : '')) +
    rvTile((s.onTarget || 0) + '<i>/' + (logged || n) + '</i>', 'days fully on target',
           logged && s.onTarget === logged ? 'good' : (s.onTarget ? 'warn' : 'bad')) +
    rvTile((s.proteinHit || 0) + '<i>/' + (s.daysLogged || 0) + '</i>', 'protein hit',
           s.daysLogged && s.proteinHit >= s.daysLogged * 0.7 ? 'good' : 'warn') +
    rvTile(wc === null || wc === undefined ? (s.weighIns ? String(s.weighIns) : '0')
             : ((wc > 0 ? '+' : '') + wc.toFixed(1) + '<i> kg</i>'),
           wc === null || wc === undefined ? 'weigh-ins' : 'weight vs the ' + (s.periodWord || 'week') + ' before', '') +
  '</div>';
}
// v127: a calendar of the review's days, shown only while some of them are
// not yet confirmed complete. Read live from the logs every time, so it is
// right even on an old stored review. Tapping a day takes you to it.
function reviewCalendarHTML(shown, monthly){
  if(!shown || !shown.week) return '';
  let start;
  try{ start = parseYMD(shown.week); }catch(e){ return ''; }
  const n = monthly ? daysInMonthOf(start) : 7;
  const today = todayYMD();
  let part = 0, none = 0;
  const cells = [];
  for(let i=0;i<n;i++){
    const d = addDays(start, i), ds = ymd(d);
    let cls, tag;
    if(ds > today){ cls = 'fut'; tag = ''; }
    else if(isDayComplete(ds)){ cls = 'done'; tag = '✓'; }
    else if(getDailyIntake(ds) > 0){ cls = 'part'; tag = 'tick'; part++; }
    else { cls = 'none'; tag = 'log'; none++; }
    cells.push({d, ds, cls, tag});
  }
  if(!part && !none) return '';
  const lead = (start.getDay() + 6) % 7;   // Monday-first
  let g = ['M','T','W','T','F','S','S'].map(w=>'<div class="rvc-w">'+w+'</div>').join('');
  for(let i=0;i<lead;i++) g += '<div class="rvc-x"></div>';
  g += cells.map(c => c.cls === 'fut'
    ? '<div class="rvc-d fut">' + c.d.getDate() + '</div>'
    : '<button type="button" class="rvc-d ' + c.cls + '" data-rvday="' + c.ds + '">' + c.d.getDate() + '<i>' + c.tag + '</i></button>').join('');
  const bits = [];
  if(none) bits.push('<b>' + none + '</b> not logged');
  if(part) bits.push('<b>' + part + '</b> logged but not ticked');
  return '<div class="rvc"><p class="rvc-h">' + bits.join(' · ') + '. Tap a day to finish it, then come back and tap Update.</p>' +
    '<div class="rvc-g">' + g + '</div>' +
    '<div class="rvc-k"><span class="k1">Done</span><span class="k2">Needs ticking</span><span class="k3">Not logged</span></div></div>';
}
function wireReviewCalendar(){
  document.querySelectorAll('#review-body [data-rvday]').forEach(b=>{
    b.onclick = ()=>{
      try{ tick(); }catch(e){}
      currentDate = parseYMD(b.dataset.rvday);
      closeSheet('review-backdrop');
      try{ switchView('day'); }catch(err){ renderDay(); }
      try{ renderDay(); window.scrollTo(0, 0); }catch(err){}
    };
  });
}

function reviewBodyHTML(shown, monthly){
  const s = reviewStats(shown) || shown.stats || {};
  const label = monthly ? monthLabel(shown.week) : 'Week of ' + prettyDate(shown.week);
  const canUpdate = !shown.live;
  let html = '<div class="rvx-head"><span>' + label +
    (shown.updated ? ' · updated ' + prettyDate(shown.updated) : '') + '</span>' +
    (canUpdate ? '<button type="button" id="rvx-update" class="rvx-upd"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg> Update</button>' : '') +
    '</div><div class="rvx-note" id="rvx-note"></div>';
  html += reviewTilesHTML(s);
  html += reviewCalendarHTML(shown, monthly);
  if(!s.days || !s.daysLogged){
    html += '<p class="rvx-p">' + shown.text + '</p>';
  } else {
    html += '<div class="section-title">On target</div>' + reviewOnTarget(s);
    html += '<div class="section-title">Calories</div><p class="rvx-p">' + rvKcalLine(s) + '</p>' +
            reviewRatioLine(s) + reviewCalorieChart(s).replace('<div class="section-title">Calories against target</div>', '');
    html += '<div class="section-title">Protein and macros</div><p class="rvx-p">' + rvKeys(['Protein <b>' + fmt0(s.avgProtein) +
            'g</b> a day (target ' + fmt0(s.avgPTarget) + 'g)', 'hit ' + s.proteinHit + ' of ' + s.daysLogged + ' days',
            s.avgHealth != null ? 'quality <b>' + s.avgHealth + '</b>/100' : '']) + '</p>' +
            reviewMacroBars(s).replace('<div class="section-title">Macros, daily average</div>', '') +
            reviewProteinDots(s);
  }
  // Water
  const water = s.water || (shown.stats && shown.stats.water) || [];
  // v141: plain water has no target of its own - it is part of hydration,
  // which is judged below against each day's own target.
  html += '<div class="section-title">Water</div><p class="rvx-p">' + (s.waterDays
    ? rvKeys(['<b>' + (s.avgWater / 1000).toFixed(1) + ' L</b> a day', 'logged ' + s.waterDays + ' day' + (s.waterDays === 1 ? '' : 's'),
      'counts towards Hydration below'])
    : 'No water logged.') + '</p>';
  if(water.length && s.waterDays){
    const maxMl = Math.max(1, ...water.map(w => w.ml));
    html += '<div class="rv-card">' + water.map(w =>
      '<div class="rvx-wrow"><span>' + w.day + '</span><div><i style="width:' + (w.ml / maxMl * 100) + '%"></i></div>' +
      '<em>' + (w.ml > 0 ? (w.ml / 1000).toFixed(1) + 'L' : '—') + '</em></div>').join('') + '</div>';
  }
  // v128: Hydration - water plus every other drink.
  if(s.hyd){
    html += '<div class="section-title">Hydration</div><p class="rvx-p">' + (s.hydDays
      ? rvKeys(['<b>' + (s.avgHyd / 1000).toFixed(1) + ' L</b> a day, water and drinks', 'target ' + (rvHydTarget(s) / 1000).toFixed(1) + ' L',
        'hit <b>' + s.hydHit + '</b> of ' + s.hydDays + ' days'])
      : 'No drinks or water logged.') + '</p>';
    if(s.hydDays){
      const maxH = Math.max(1, ...s.hyd.map(w => Math.max(w.ml, w.target || 0)));
      html += '<div class="rv-card">' + s.hyd.map(w =>
        '<div class="rvx-wrow"><span>' + w.day + '</span><div><i style="width:' + (w.ml / maxH * 100) + '%;' +
        (w.ml >= (w.target || HYD_TARGET_ML) ? ' background:var(--accent);' : '') + '"></i></div>' +
        '<em>' + (w.ml > 0 ? (w.ml / 1000).toFixed(1) + 'L' : '—') + '</em></div>').join('') + '</div>';
    }
  }
  // v144: Training, from the Train side.
  try{
    if(typeof trPeriodSummary === 'function' && s.week){
      const tr = trPeriodSummary(s.week, ymd(addDays(parseYMD(s.week), (s.nDays || 7) - 1)));
      if(tr){
        html += '<div class="section-title">Training</div><p class="rvx-p">' + rvKeys(['<b>' + tr.n + '</b> workout' + (tr.n === 1 ? '' : 's'),
          '<b>' + fmtK(tr.vol) + '</b> kg lifted', fmtMins(tr.mins) + ' trained', tr.prs ? '<b>' + tr.prs + '</b> new best' + (tr.prs === 1 ? '' : 's') : '']) +
          (tr.missed.length && tr.missed.length < 7 ? '<br><span style="color:var(--text2)">Not trained: ' + esc(tr.missed.join(', ')) + '</span>' : '') + '</p>';
      }
    }
  }catch(e){}
  // Weight
  let wl = 'No weigh-ins.';
  if(s.weighIns){
    const wbits = [s.latestKg ? 'now <b>' + s.latestKg + ' kg</b>' : ''];
    if(s.weightChange !== null && s.weightChange !== undefined){
      wbits.push(Math.abs(s.weightChange) < 0.05 ? 'level on last ' + (s.periodWord || 'week')
        : (s.weightChange > 0 ? '+' : '−') + Math.abs(s.weightChange).toFixed(2) + ' kg on last ' + (s.periodWord || 'week'));
    }
    wbits.push(s.weighIns + ' weigh-in' + (s.weighIns === 1 ? '' : 's'));
    wl = rvKeys(wbits);
  }
  html += '<div class="section-title">Weight</div><p class="rvx-p">' + wl + '</p>';
  if(s.days && s.daysLogged) html += '<div id="review-nutrients"></div>';
  html += '<div class="section-title">Target</div>';
  return html;
}

// Closing remarks: what went well, and what to focus on next. Every line is a
// number from this review; nothing is said that the figures do not show.
function reviewClosingHTML(shown){
  const s = reviewStats(shown) || shown.stats || {};
  const n = s.nDays || 7, word = s.periodWord || 'week', goal = rvGoal();
  const logged = s.daysLogged || 0;
  const t = s.avgTarget || 0;
  const zone = (logged && t) ? calorieState(s.avgIntake, t, goal, true).zone : null;
  const good = [], focus = [];
  if(logged >= n) good.push('Every day logged and confirmed.');
  else if(logged >= Math.ceil(n * 0.7)) good.push(logged + ' of ' + n + ' days logged and confirmed.');
  if(logged && s.onTarget >= Math.max(1, Math.ceil(logged * 0.6))) good.push(s.onTarget + ' of ' + logged + ' days fully on target.');
  if(zone === 'in') good.push('Calories on budget, ' + fmtK(s.avgIntake) + ' a day against ' + fmtK(t) + '.');
  if(logged && s.proteinHit >= Math.ceil(logged * 0.7)) good.push('Protein hit on ' + s.proteinHit + ' of ' + logged + ' days.');
  if(s.avgHealth != null && s.avgHealth >= 70) good.push('Food quality averaged ' + s.avgHealth + ' out of 100.');
  if(s.hydDays && s.hydHit >= Math.ceil(n * 0.7)) good.push('Hydration target reached on ' + s.hydHit + ' of ' + n + ' days.');
  if(s.weighIns >= Math.ceil(n * 0.6)) good.push(s.weighIns + ' weigh-ins, so your target can learn from them.');
  const wc = s.weightChange;
  if(wc !== null && wc !== undefined && ((goal === 'build' && wc > 0.05) || (goal === 'lose' && wc < -0.05) ||
     ((goal === 'maintain' || goal === 'recomp') && Math.abs(wc) <= 0.2))) good.push('Weight moved the way your goal wants (' + (wc > 0 ? '+' : '') + wc.toFixed(2) + ' kg).');

  if(s.partialDays) focus.push('Confirm your days as complete — ' + s.partialDays + ' day' + (s.partialDays === 1 ? ' has' : 's have') +
    ' food logged but ' + (s.partialDays === 1 ? 'does' : 'do') + ' not count yet. Tick ' + (s.partialDays === 1 ? 'it' : 'them') + ', then tap Update.');
  if(logged < Math.min(5, n)) focus.push('Log and confirm at least 5 full days, so the ' + word + '’s numbers mean something.');
  if(zone && zone !== 'in') focus.push(s.avgIntake > t
    ? 'Bring calories down towards ' + fmtK(t) + ' a day (you averaged ' + fmtK(s.avgIntake) + ').'
    : 'Eat up to ' + fmtK(t) + ' a day (you averaged ' + fmtK(s.avgIntake) + ').');
  if(logged && s.avgPTarget && s.proteinHit < Math.ceil(logged * 0.5)) focus.push('Protein: averaged ' + fmt0(s.avgProtein) + 'g against ' +
    fmt0(s.avgPTarget) + 'g. Add a protein source to the meal where it slips.');
  if(s.weighIns < 4) focus.push('Weigh in at least 4 mornings next ' + word + ' (' + (s.weighIns || 0) + ' this ' + word + ').');
  if(s.hydDays && s.avgHyd < rvHydTarget(s) * 0.8) focus.push('Hydration: averaged ' + (s.avgHyd / 1000).toFixed(1) + ' L against ' + (rvHydTarget(s) / 1000).toFixed(1) + ' L, counting every drink.');
  if(!s.waterDays && !s.hydDays) focus.push('Log your water — none was logged this ' + word + '.');
  if(s.avgHealth != null && s.avgHealth < 60) focus.push('Food quality averaged ' + s.avgHealth + ' — swap one processed item a day for a whole food.');

  const li = a => '<ul class="rvx-list">' + a.map(x => '<li>' + x + '</li>').join('') + '</ul>';
  return '<div class="section-title">Closing remarks</div><div class="rvx-close">' +
    '<h4 class="good"><i class="ti ti-check" aria-hidden="true"></i> Done well</h4>' +
    (good.length ? li(good.slice(0, 4)) : '<p class="rvx-p">Nothing stood out yet. A full ' + word + ' of confirmed days gives this something to say.</p>') +
    '<h4 class="focus"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg> Focus next ' + word + '</h4>' +
    (focus.length ? li(focus.slice(0, 3)) : '<p class="rvx-p">Keep doing exactly this.</p>') +
  '</div>' + '<div id="rv-tips-slot"></div>';
}
// The detailed tips the review always had - where protein slips, which foods
// pull quality down, what to put in instead - kept, now after the remarks.
function rvTips(shown){
  if(!(reviewStats(shown) || {}).daysLogged) return '';
  let ph = '';
  const n = shown && shown.month ? 30 : 7;
  try{ ph = tipsHTML(patternTips(n)); }catch(e){ ph = ''; }
  // v141: these look back from today, not over the reviewed week, so say so.
  return ph ? '<div class="section-title">What to change</div><p class="rvx-p" style="color:var(--text3)">From your last ' + n + ' days.</p>' + ph : '';
}

// Re-read the logs for a stored review and save the fresh numbers into it.
function refreshStoredReview(shown){
  const monthly = !!shown.month;
  const start = parseYMD(shown.week);
  const s = monthly ? summariseRange(start, daysInMonthOf(start), 'month') : summariseWeek(start);
  const list = monthly ? loadMonthReviews() : loadReviews();
  const i = list.findIndex(r => String(r.week) === String(shown.week));
  const before = i >= 0 && list[i].stats ? list[i].stats : (shown.stats || {});
  const upd = Object.assign({}, i >= 0 ? list[i] : shown, {text: reviewText(s), stats: slimStats(s), updated: todayYMD()});
  if(i >= 0){
    list[i] = upd;
    lsSet(monthly ? MREVIEWS_KEY : REVIEWS_KEY, JSON.stringify(list));
  }
  return {review: upd, before: before, after: s};
}
function wireReviewUpdate(shown){
  const b = document.getElementById('rvx-update');
  if(!b) return;
  b.onclick = ()=>{
    const r = refreshStoredReview(shown);
    renderReviewSheet(r.review);
    const was = r.before.daysLogged || 0, now = r.after.daysLogged || 0;
    const note = document.getElementById('rvx-note');
    if(note){
      note.textContent = now !== was
        ? 'Updated — ' + now + ' confirmed day' + (now === 1 ? '' : 's') + ' now count (was ' + was + ').'
        : 'Updated — nothing had changed since this review was made.';
      note.classList.add('on');
    }
    try{ buzz(); }catch(e){}
  };
}

function renderReviewSheet(current){
  const body = document.getElementById('review-body');
  const hist = document.getElementById('review-history');
  if(current) reviewPeriod = current.month ? 'month' : 'week';
  const monthly = reviewPeriod === 'month';
  document.getElementById('review-title').textContent = monthly ? 'Your month' : 'Your week';
  document.querySelectorAll('#review-tabs .tab').forEach(t=>
    t.classList.toggle('active', t.dataset.rperiod === reviewPeriod));

  const reviews = monthly ? loadMonthReviews() : loadReviews();
  const shown = (current && (!!current.month === monthly)) ? current
              : (monthly ? currentMonthReview() : currentWeekReview());

  if(!shown){
    body.innerHTML = monthly
      ? '<p style="color:var(--text3);">No monthly review yet. The first one lands on the 1st, once there is a month of logging behind it.</p>'
      : '<p style="color:var(--text3);">No weekly review yet. The first one lands once you tick off a Sunday, with a week of logging behind it.</p>';
  } else {
    let html = reviewBodyHTML(shown, monthly);
    if(shown.change){
      html += '<div style="background:var(--card2); border:0.5px solid var(--border); border-radius:12px; padding:12px 14px; margin-bottom:4px;">'+
        '<div style="font-size:13px; margin-bottom:6px;"><span style="color:var(--text3);">'+shown.change.from+'</span> → '+
        '<strong style="color:var(--accent);">'+shown.change.to+' kcal</strong></div>'+
        '<div style="font-size:12px; color:var(--text2); line-height:1.6;">'+shown.change.why+'</div></div>';
    } else {
      // A monthly review never adjusts the target - only the weekly one does -
      // so "nothing in last week's data called for it" on the Month tab reported
      // a decision that was never taken, about the wrong period.
      html += monthly
        ? '<p style="color:var(--text3); font-size:12px;">Targets are reviewed weekly, not monthly. This is the month as it happened.</p>'
        : '<p style="color:var(--text3); font-size:12px;">Your target has not changed. Nothing in last week\'s data called for it.</p>';
    }
    /* Only on the newest review. Flicking back to March is reading history,
       not doing a review, and a backup prompt there is just noise. */
    html += reviewClosingHTML(shown);
    const newest = (monthly ? currentMonthReview() : currentWeekReview()) || reviews[0];
    if(newest && String(newest.week) === String(shown.week)) html += reviewBackupHTML();
    body.innerHTML = html;
    // Filled in after the markup lands, because the block is interactive.
    // v131: the sheet opens straight away; the nutrient detail and the tips
    // (the slow parts) fill in a moment later instead of holding it up.
    const nbox = document.getElementById('review-nutrients');
    if(nbox) nbox.innerHTML = '<p class="rvx-p" style="color:var(--text3);">Working out nutrients…</p>';
    const token = (renderReviewSheet._tok = (renderReviewSheet._tok || 0) + 1);
    afterPaint(()=>{
      if(token !== renderReviewSheet._tok) return;
      try{ drawReviewNutrients(shown); }catch(e){}
      afterPaint(()=>{
        if(token !== renderReviewSheet._tok) return;
        const slot = document.getElementById('rv-tips-slot');
        if(slot){ try{ slot.innerHTML = rvTips(shown); }catch(e){} }
      });
    });
    wireReviewBackup();
    wireReviewUpdate(shown);
    wireReviewCalendar();
  }

  const past = reviews.filter(r=>!shown || r.week !== shown.week);
  hist.innerHTML = past.length === 0
    ? '<div style="font-size:12px; color:var(--text3);">No earlier reviews yet.</div>'
    : past.slice(0,12).map(r=>
        // A button, not a div: an old review holds the same charts as this
        // week's and there was no way to see them.
        '<button data-rewind="'+esc(String(r.week))+'" style="display:block; width:100%; text-align:left; background:none; '+
        'border:0; border-bottom:0.5px solid var(--border); padding:12px 0; color:var(--text);">'+
        '<div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">'+
        '<span style="color:var(--text3);">'+(monthly ? monthLabel(r.week) : 'Week of '+prettyDate(r.week))+
        ' <i class="ti ti-chevron-right" style="font-size:11px;"></i></span>'+
        (r.change ? '<span><span style="color:var(--text3);">'+r.change.from+'</span> → <strong>'+r.change.to+'</strong> kcal</span>'
                  : '<span style="color:var(--text3);">no change</span>')+'</div>'+
        '<div style="font-size:12px; color:var(--text2); line-height:1.6;">'+r.text+'</div>'+
        (r.change ? '<div style="font-size:11px; color:var(--text3); line-height:1.6; margin-top:5px;">'+r.change.why+'</div>' : '')+
        '</button>').join('');

  hist.querySelectorAll('[data-rewind]').forEach(b=>{
    b.onclick = ()=>{
      const pick = reviews.find(r=>String(r.week) === b.dataset.rewind);
      if(pick) renderReviewSheet(pick);
      const sheet = document.querySelector('#review-backdrop .sheet');
      if(sheet) sheet.scrollTop = 0;
    };
  });
}

// v141: its element was removed in an earlier redesign (Settings shows the source now); a no-op for its callers.
function renderTargetProvenance(){}

