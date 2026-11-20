function renderStreak(){
  renderStreakBadge();
}

function renderWeek(){
  const today = new Date(); today.setHours(0,0,0,0);
  // v135: Monday to Sunday, the same week as the budget card above and the
  // weekly review. It used to be the last seven days, so the budget said
  // 3,978 spent while "Total kcal" underneath said 14,132.
  const days = [];
  const ws = weekStart(today);
  for(let i=0;i<7;i++) days.push(addDays(ws,i));
  const sofar = days.filter(d=>d <= today);

  let totalK=0, hitCount=0, sumP=0, sumC=0, sumF=0;
  const dayTotals = days.map(d=>{
    if(d > today) return 0;
    const es = loadEntries(d);
    const k = es.reduce((s,e)=>s+e.kcal,0);
    sumP += es.reduce((s,e)=>s+(e.protein||0),0);
    sumC += es.reduce((s,e)=>s+(e.carbs||0),0);
    sumF += es.reduce((s,e)=>s+(e.fat||0),0);
    totalK += k;
    // All three, the same as the strip on the day screen. Today only once it
    // is ticked complete - half a day is not a missed day.
    if(dayVerdict(ymd(d)).all && (d < today || isDayComplete(ymd(d)))) hitCount++;
    return k;
  });

  const maxK = Math.max(judgedTarget(today), ...dayTotals, 1);
  // The headline average uses confirmed days only, matching the weekly review
  // and the adaptive engine — one definition of "average" across the app.
  let confSum = 0, confDays = 0;
  days.forEach((d,i)=>{ if(dayTotals[i]>0 && isDayComplete(ymd(d))){ confSum += dayTotals[i]; confDays++; } });
  document.getElementById('w-avg').textContent = confDays ? fmtK(confSum/confDays) : '0';
  const judged = sofar.filter(d => d < today || isDayComplete(ymd(d))).length;
  document.getElementById('w-hit').textContent = hitCount+'/'+judged;
  document.getElementById('w-total').textContent = fmtK(totalK);

  const chart = document.getElementById('weekchart');
  chart.innerHTML = days.map((d,i)=>{
    const k = dayTotals[i];
    const h = Math.max(3, (k/maxK)*100);
    const isToday = d.getTime()===today.getTime();
    const cls = k===0 ? '' : (k>judgedTarget(d) ? 'over' : 'hit');
    if(d > today) return '<div class="wbar-col" style="opacity:.35;"><div class="wbar-track"></div>'+
      '<span class="dlabel">'+d.toLocaleDateString(undefined,{weekday:'narrow'})+'</span></div>';
    return '<button class="wbar-col'+(isToday?' today':'')+'" data-idx="'+i+'">'+
      '<div class="wbar-track"><div class="wbar '+cls+'" style="height:'+h+'%"></div></div>'+
      '<span class="dlabel">'+d.toLocaleDateString(undefined,{weekday:'narrow'})+'</span></button>';
  }).join('');
  chart.querySelectorAll('.wbar-col').forEach(btn=>{
    btn.onclick = ()=>{
      currentDate = new Date(days[Number(btn.dataset.idx)]);
      switchView('day');
    };
  });

  // v135: against each day's own target, for the days so far this week.
  const tsum = k => sofar.reduce((a,d)=>{ const t = dayTargets(d); return a + (Number(t[k]) || 0); }, 0);
  const setMacro = (bar,val,tot,tgt,unit)=>{
    document.getElementById(bar).style.width = Math.min(100, tgt > 0 ? (tot/tgt)*100 : 0)+'%';
    document.getElementById(val).textContent = fmt0(tot)+'/'+fmt0(tgt)+unit;
  };
  setMacro('wbar-p','wval-p',sumP,tsum('protein'),'g');
  setMacro('wbar-c','wval-c',sumC,tsum('carbs'),'g');
  setMacro('wbar-f','wval-f',sumF,tsum('fat'),'g');
}

// Lets the screen draw the tap first - the tab lighting up, the sheet rising -
// and does the heavy work in the frame after, so nothing feels stuck.
function afterPaint(fn){
  if(typeof requestAnimationFrame === 'function') requestAnimationFrame(()=>setTimeout(fn, 0));
  else setTimeout(fn, 0);
}
function switchView(v){
  // An old build could have stored 'day' or 'week' only; anything unknown
  // falls back to the day screen rather than showing nothing.
  if(v !== 'day' && v !== 'week' && v !== 'data') v = 'day';
  currentView = v;
  document.querySelectorAll('#eat-tabs .view-tab').forEach(t=>t.classList.toggle('active', t.dataset.view===v));
  document.getElementById('view-day').style.display = v==='day' ? '' : 'none';
  document.getElementById('view-week').style.display = v==='week' ? '' : 'none';
  const dv = document.getElementById('view-data');
  if(dv) dv.style.display = v==='data' ? '' : 'none';
  if(v==='day') renderDay();
  else if(v==='week') renderWeek();
  else afterPaint(()=>{ if(currentView === 'data') renderDataView(); });
  // v131: a short fade on the screen you switched to, so a change of page reads
  // as a change rather than a jump.
  try{
    const el = document.getElementById('view-' + v);
    if(el){ el.classList.remove('view-in'); void el.offsetWidth; el.classList.add('view-in'); }
  }catch(e){}
}

// The Data screen: the learned figure, the charts, and the line that says what
// set your current target - which used to be 11px grey under the ring.
function renderDataView(){
  try{ renderLearned(); }catch(e){}
  document.querySelectorAll('#data-range .tab').forEach(t=>
    t.classList.toggle('active', Number(t.dataset.drange) === dataRange));
  renderData();
  const el = document.getElementById('data-prov');
  if(el){
    const log = loadAdjustLog();
    const bits = [];
    if(log.length){
      const src = {weekly:'set at your weekly review', adaptive:'set from your measured data',
                   formula:'calculated from your profile', manual:'set by you', cycling:'changed by calorie cycling'}[log[0].source] || 'updated';
      bits.push('Your target was <b>'+src+'</b> on '+prettyDate(log[0].date)+'.');
    }
    try{
      const n = computeStreak();
      if(n > 0) bits.push('<b>'+n+'</b> day'+(n===1?'':'s')+' logged in a row.');
    }catch(e){}
    el.innerHTML = bits.join(' ');
  }
}

function renderRecents(){
  const recents = loadRecents();
  const wrap = document.getElementById('recents-wrap');
  const row = document.getElementById('recents-row');
  if(recents.length===0){ wrap.style.display='none'; return; }
  wrap.style.display='';
  row.innerHTML = recents.map((r,i)=>
    '<button class="recent-chip" data-i="'+i+'"><div class="n">'+esc(shownName(r.name, r))+'</div><div class="k">'+
      (splitName(r.name, r).brand ? esc(splitName(r.name, r).brand)+' \u00b7 ' : '')+fmt0(r.kcal)+' kcal</div></button>'
  ).join('');
  row.querySelectorAll('.recent-chip').forEach(btn=>{
    btn.onclick = ()=>{
      const r = recents[Number(btn.dataset.i)];
      addEntry(Object.assign({}, r, {meal: selectedMeal}));
      closeSheet('add-backdrop');
    };
  });
}

// Several logged items rolled into one entry, for a dish you cooked rather than
// a plate of separate things. The score reads one dish instead of four
// ingredients, which is what a curry actually is.
function plateEntry(items, name, meal){
  const list = (items || []).filter(x=>x);
  if(!list.length) return null;
  const sum = k => list.reduce((s,e)=>s + (Number(e[k]) || 0), 0);
  const grams = sum('grams');
  // Without weights there is nothing to combine into a per-100 basis later.
  if(!(grams > 0)) return null;

  // null and 0 differ: if ANY item never recorded its sugar, the dish's sugar
  // is unknown, not the sum of the ones that did. Pretending otherwise would
  // invent a figure and hand the scorer a number it should not have.
  const opt = k => list.some(e=>e[k] == null) ? null : sum(k);
  const microKeys = {};
  list.forEach(e=>{ Object.keys(e.micros || {}).forEach(k=>{ microKeys[k] = true; }); });
  const micros = {};
  Object.keys(microKeys).forEach(k=>{
    if(list.some(e=>!e.micros || e.micros[k] == null)) return;
    micros[k] = list.reduce((s,e)=>s + (Number(e.micros[k]) || 0), 0);
  });

  return {
    name: name || 'Plate',
    grams: Math.round(grams),
    basis: list.every(e=>entryBasis(e) === 'ml') ? 'ml' : 'g',
    qty: null, unit: null,
    kcal: Math.round(sum('kcal')),
    protein: Math.round(sum('protein')),
    carbs: Math.round(sum('carbs')),
    fat: Math.round(sum('fat')),
    sugar: opt('sugar') === null ? null : Math.round(opt('sugar') * 10) / 10,
    sat:   opt('sat')   === null ? null : Math.round(opt('sat')   * 10) / 10,
    micros: micros,
    meal: meal
  };
}

function addEntry(entry){
  // Built a meal? Then this food belongs to the meal, not to the day.
  if(builderTarget){
    const copy = Object.assign({}, entry); delete copy.meal;
    builderItems.push(copy);
    builderTarget = false;
    closeSheet('add-backdrop'); closeSheet('scan-backdrop');
    setTimeout(()=>{ renderBuilder(); openSheet('builder-backdrop'); }, HANDOFF);
    return;
  }
  // v137: a food logged on today keeps the time it was logged, for the pace
  // line. Logging onto another day says nothing about when it was eaten.
  if(entry && typeof entry === 'object'){
    if(ymd(currentDate) === todayYMD()) entry.at = Date.now(); else delete entry.at;
  }
  // v144: food added from a workout's pre-workout card is marked as such.
  // It is still an ordinary entry, so it counts in the day's totals.
  try{ if(typeof trTagEntry === 'function') trTagEntry(entry); }catch(e){}
  const es = loadEntries(currentDate);
  const pBefore = es.reduce((a,e)=>a+(e.protein||0),0);
  es.push(entry);
  saveEntries(currentDate, es);
  try{ histCache = null; }catch(e){}
  buzz();
  sfx('food');
  try{
    const pT = targetsFor(currentDate).protein;
    if(pT > 0 && pBefore < pT && pBefore + (entry.protein||0) >= pT) sfx('protein', 0.32);
  }catch(e){}
  pushRecent(entry);
  renderDay();
  renderStreak();
  // Nothing above waits on this. The entry is already saved; if the lookup
  // fails or there is no signal, the day is exactly as it would have been.
  if(typeof fdcTopUpQuietly === 'function' && !(entry && entry.perItem)) fdcTopUpQuietly(entry && entry.name);
}

document.getElementById('day-complete').onclick = ()=>{
  const ds = ymd(currentDate);
  const now = !isDayComplete(ds);
  if(now) buzz('big');
  if(now && getDailyIntake(ds) <= 0){
    alert('Log what you ate first — an empty day confirmed as complete would pull your averages down.');
    return;
  }
  setDayComplete(ds, now);
  if(now) sfx('dayDone');
  renderDayComplete();
  renderDayReviewCard();
  renderStreak();
  runAutoAdapt();
  if(currentView==='week') renderWeek();
  // Only on the way IN. Un-ticking a day is a correction, not a review.
  // Ticking off Sunday finishes the week, so the weekly review opens instead.
  if(now && !showWeekEndReview(ds)) setTimeout(()=>renderDayReview(currentDate), 240);
};

document.getElementById('weigh-nudge').onclick = ()=> openWeighIn(todayYMD(), false);
// Tapping the warning takes the backup. Opening a settings sheet and leaving
// you to find the button is how a one-tap job becomes a four-tap job you skip.
document.getElementById('backup-nag').onclick = ()=>{ exportJSON(); renderBackupNag(); };

// Every macro number on the day screen, and the calorie ring.
document.querySelectorAll('[data-bdmacro]').forEach(b=>{
  b.onclick = ()=> openBreakdown(specForMacro(b.dataset.bdmacro), loadEntries(currentDate), {});
});
// The weekly rows ask a different question, so they get the whole week and the
// list is grouped by food rather than listed per day.
document.querySelectorAll('[data-bdweek]').forEach(b=>{
  b.onclick = ()=> openBreakdown(specForMacro(b.dataset.bdweek), weekEntries(), {weekly:true});
});

document.getElementById('day-review-card').onclick = ()=> renderDayReview(currentDate);

document.getElementById('water-cog').onclick = ()=>{
  waterSettingsOpen = !waterSettingsOpen;
  renderWater();
};

document.getElementById('prev-day').onclick = ()=>{ currentDate = addDays(currentDate,-1); renderDay(); };
document.getElementById('next-day').onclick = ()=>{ currentDate = addDays(currentDate,1); renderDay(); };
document.querySelectorAll('#eat-tabs .view-tab').forEach(t=>{ t.onclick = ()=>switchView(t.dataset.view); });


// A sheet that vanishes between frames reads as a glitch. `.open` still comes
// off synchronously — state is never a lie, and anything that closes then
// immediately reopens or asserts sees the truth — while `.closing` keeps the
// backdrop painted for the 200ms the animation needs.
function playSheetExit(bd){
  if(!bd || typeof bd.animate !== 'function') return;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduce) return;
  const sheet = bd.querySelector('.sheet');
  bd.classList.add('closing');
  const done = ()=> bd.classList.remove('closing');
  try{
    const a = bd.animate([{opacity:1},{opacity:0}], {duration:190, easing:'ease-out'});
    a.onfinish = done;
    if(sheet && typeof sheet.animate === 'function'){
      // A page goes back the way it came in - sideways. A sheet drops.
      const sideways = bd.classList.contains('pagemode');
      sheet.animate(sideways
        ? [{transform:'translateX(0)'},{transform:'translateX(100%)'}]
        : [{transform:'translateY(0)'},{transform:'translateY(100%)'}],
        {duration:210, easing:'cubic-bezier(.32,.72,.28,1)'});
    }
    // If onfinish never lands — a backgrounded tab, an interrupted animation —
    // the backdrop must not be left painted over the app.
    setTimeout(done, 400);
  }catch(e){ done(); }
}

/* Page behaviour, shared by the body pages and the water page: the title in the
   bar fades in once you have scrolled past the big one, the bar grows a hairline
   at the same moment, and a finger dragged in from the left edge takes the page
   away. None of it touches stored data - it is all presentation. */
function wirePage(backdropId, closeFn){
  const bd = document.getElementById(backdropId);
  if(!bd) return;
  const sheet = bd.querySelector('.sheet');
  const bar = bd.querySelector('.pagebar');
  if(!sheet || !bar) return;

  const back = bar.querySelector('[data-pageback]');
  if(back) back.onclick = closeFn;

  sheet.addEventListener('scroll', ()=>{
    bar.classList.toggle('stuck', sheet.scrollTop > 56);
  }, {passive:true});

  // Drag in from the left edge to go back.
  let x0 = null, y0 = null, dx = 0, live = false;
  sheet.addEventListener('touchstart', e=>{
    if(e.touches.length !== 1) return;
    const t = e.touches[0];
    const left = sheet.getBoundingClientRect().left;
    if(t.clientX - left > 28) return;        // only from the very edge
    x0 = t.clientX; y0 = t.clientY; dx = 0; live = false;
    sheet.classList.remove('swipeback');
  }, {passive:true});

  sheet.addEventListener('touchmove', e=>{
    if(x0 === null) return;
    const t = e.touches[0];
    const ax = t.clientX - x0, ay = t.clientY - y0;
    // Sideways only. A vertical drag is a scroll and is left alone.
    if(!live && (Math.abs(ay) > Math.abs(ax) || ax < 6)){ x0 = null; return; }
    live = true;
    dx = Math.max(0, ax);
    sheet.classList.add('swiping');
    sheet.style.transform = 'translateX(' + dx + 'px)';
  }, {passive:true});

  const release = ()=>{
    if(x0 === null){ return; }
    const w = sheet.getBoundingClientRect().width || 400;
    const go = dx > Math.min(110, w * 0.3);
    x0 = null;
    sheet.classList.remove('swiping');
    if(go){ sheet.style.transform = ''; closeFn(); return; }
    sheet.classList.add('swipeback');
    sheet.style.transform = '';
    setTimeout(()=>sheet.classList.remove('swipeback'), 240);
  };
  sheet.addEventListener('touchend', release, {passive:true});
  sheet.addEventListener('touchcancel', release, {passive:true});
}

function openSheet(id){
  if(id==='add-backdrop'){
    renderRecents(); renderSavedMeals();
    // v143: opened before the packets had loaded? Start now, not in a few seconds.
    try{ if(typeof packetsLoad === 'function') packetsLoad(); }catch(e){}
    // The sheet opens on what you actually eat, not on an empty box.
    const si = document.getElementById('search-input');
    if(si && !si.value.trim()) renderUsuals();
  }
  const bd = document.getElementById(id);
  // Reopening mid-exit must cancel the exit, or the new sheet inherits a
  // backdrop that is still fading out.
  bd.classList.remove('closing');
  // v112: and the exit ANIMATION with it. Sheets now hand over without the
  // old pause, so one can be asked back while it is still on its way down.
  try{
    if(bd.getAnimations) bd.getAnimations().forEach(a=>a.cancel());
    const sh = bd.querySelector('.sheet');
    if(sh && sh.getAnimations) sh.getAnimations().forEach(a=>{ if(!a.animationName) a.cancel(); });
  }catch(e){}
  bd.classList.add('open');
  syncScrollLock();
}
/* v112: how long one sheet waits before taking over from another. It was
   160-260 ms in twenty places, which is a pause you can feel on every step of
   a flow. The sheet leaving animates out on its own, so the next one does not
   need to wait for it. */
var HANDOFF = 60;

/* v112: the page underneath does not move while a sheet is open.
   A sheet only stops a scroll from leaking through when it has something to
   scroll itself - a short one, or the dimmed area around it, passed every
   drag straight to the day screen behind. The page is now pinned in place for
   as long as anything is open and put back exactly where it was after. */
var scrollLocked = false, scrollLockY = 0;
function syncScrollLock(){
  const any = !!document.querySelector('.sheet-backdrop.open');
  const b = document.body;
  if(any && !scrollLocked){
    scrollLockY = window.scrollY || window.pageYOffset || 0;
    scrollLocked = true;
    b.style.position = 'fixed';
    b.style.top = (-scrollLockY) + 'px';
    b.style.left = '0'; b.style.right = '0'; b.style.width = '100%';
  } else if(!any && scrollLocked){
    scrollLocked = false;
    b.style.position = ''; b.style.top = ''; b.style.left = ''; b.style.right = ''; b.style.width = '';
    const root = document.documentElement;
    const was = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, scrollLockY);
    root.style.scrollBehavior = was;
  }
}
function closeSheet(id){
  const bd = document.getElementById(id);
  const wasOpen = bd.classList.contains('open');
  bd.classList.remove('open');
  const sheet = bd.querySelector('.sheet');
  if(sheet){ sheet.style.transform=''; sheet.classList.remove('dragging','snapback','nodrag'); }
  bd.style.background = '';
  if(wasOpen) playSheetExit(bd);
  syncScrollLock();
  // Every route out of the scanner ends here, including openPortion() after a
  // successful scan — which is the path that used to leave the camera running
  // with the indicator on. Releasing here means no dismissal can miss it.
  if(id === 'scan-backdrop'){ try{ parkCamera(); missedCodes.clear(); pendingRead = null; }catch(e){ try{ releaseCamera(); }catch(_){} } }

  /* Leaving the Add sheet empties the search box. Coming back to yesterday's
     half-typed word, and to results for a food you already logged, is clutter
     you have to clear before you can start - and it hides your usuals, which
     is what the empty box is for. */
  if(id === 'add-backdrop'){
    try{ if(typeof trPreFor !== 'undefined') trPreFor = null; }catch(e){}
    const si = document.getElementById('search-input');
    if(si) si.value = '';
    searchQ = ''; searchExtra = []; searchNote = ''; searchPending = 0; searchSeq++;
    const box = document.getElementById('search-results');
    if(box) box.innerHTML = '';
  }

  // "The next food goes into the meal I am building" is only true while you are
  // still somewhere in that flow. Backing out of the scanner or the Add sheet
  // without adding anything used to leave it set, and the next food you logged
  // anywhere in the app was silently diverted into the half-built meal instead
  // of into your day. A tick later, if none of these sheets is open, you have
  // left the flow and the flag cannot apply to anything.
  if(BUILDER_FLOW.indexOf(id) >= 0){
    // Which arming this check belongs to. Sheets in this flow close constantly
    // as one hands over to the next, so without this a check queued by an
    // earlier close would land after you had just started building a meal and
    // switch it back off.
    const armed = builderArm;
    setTimeout(()=>{
      if(builderArm !== armed) return;     // re-armed since: not ours to clear
      const stillInIt = BUILDER_FLOW.some(x=>{
        const el = document.getElementById(x);
        return el && el.classList.contains('open');
      });
      if(!stillInIt) builderTarget = false;
    }, 300);
  }
}
const BUILDER_FLOW = ['add-backdrop','scan-backdrop','portion-backdrop','builder-backdrop'];
(function(){
  if(typeof MutationObserver !== 'function') return;
  const mo = new MutationObserver(()=>syncScrollLock());
  document.querySelectorAll('.sheet-backdrop').forEach(bd=>mo.observe(bd, {attributes:true, attributeFilter:['class']}));
})();
document.querySelectorAll('.sheet-backdrop').forEach(bd=>{
  bd.addEventListener('click',(e)=>{ if(e.target===bd) { closeSheet(bd.id); if(bd.id==='scan-backdrop') stopScan(); } });
});

