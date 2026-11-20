// ---- the guard that makes filling 794 foods at once defensible ----
// A name search can return the wrong food, and a wrong profile attached to 794
// entries is invisible damage. Calories are an independent check: if COACH says
// a banana is 89 kcal per 100 g and the match says 89, it is the same food. If
// the match says 350, it is not, whatever it is called. Protein is the second
// signal, because sugar and flour have similar calories and nothing else alike.
const FILL_KCAL_TOL = 0.20;
function fdcMatchOk(localRow, food){
  if(!localRow || !food) return false;
  const lk = Number(localRow[1]), fk = Number(food.kcal100);
  if(!(lk > 0) || !(fk >= 0)) return false;
  // Near-zero-calorie foods cannot be compared as a percentage; 4 kcal of
  // difference on a stick of celery is 100%.
  const kcalOk = lk < 25 ? Math.abs(fk - lk) <= 15
                         : Math.abs(fk - lk) / lk <= FILL_KCAL_TOL;
  if(!kcalOk) return false;
  const lp = Number(localRow[2]), fp = Number(food.p100);
  if(!(lp >= 0) || fp == null || isNaN(fp)) return kcalOk;
  return Math.abs(fp - lp) <= Math.max(5, lp * 0.35);
}

/* ============================================================
   One big library, built once.

   COACH ships 794 foods and two national tables, which between them are very
   good on ingredients and thin on DISHES - "nasi goreng", "shakshuka",
   "jollof rice" and "pho" all returned nothing at all. FoodData Central has
   them, with a full laboratory nutrient profile, but only while you have
   signal and only one lookup at a time.

   So this walks a list of the dishes people actually eat and saves each one to
   this device, permanently. After it has run, searching "nasi goreng" answers
   instantly, offline, with 30-odd nutrients behind it - the same as if it had
   shipped in the app.

   The list below is NAMES ONLY. Not one figure here is COACH's invention;
   every number comes from FoodData Central at the moment it is fetched.
   ============================================================ */
const LIBRARY_DISHES = [
  'nasi goreng', 'mie goreng', 'pad thai', 'pad see ew', 'tom yum soup', 'green curry',
  'red curry', 'massaman curry', 'pho', 'banh mi', 'bun cha', 'ramen',
  'miso soup', 'udon noodle soup', 'soba noodles', 'katsu curry', 'chicken teriyaki', 'sushi roll',
  'california roll', 'sashimi', 'gyoza', 'tempura prawns', 'okonomiyaki', 'takoyaki',
  'bibimbap', 'bulgogi', 'kimchi', 'korean fried chicken', 'japchae', 'tteokbokki',
  'chow mein', 'sweet and sour chicken', 'kung pao chicken', 'mapo tofu', 'wonton soup', 'spring roll',
  'dim sum', 'char siu', 'dan dan noodles', 'hot and sour soup', 'egg fried rice', 'singapore noodles',
  'butter chicken', 'chicken tikka masala', 'rogan josh', 'dal makhani', 'chana masala', 'palak paneer',
  'biryani', 'samosa', 'onion bhaji', 'naan bread', 'roti', 'dosa',
  'idli', 'sambar', 'vindaloo', 'korma', 'jalfrezi', 'saag aloo',
  'tandoori chicken', 'aloo gobi', 'raita', 'pakora', 'shakshuka', 'hummus',
  'falafel', 'tabbouleh', 'baba ganoush', 'shawarma', 'kebab', 'kofta',
  'tagine', 'couscous', 'harira', 'merguez', 'jollof rice', 'egusi soup',
  'suya', 'plantain fried', 'injera', 'doro wat', 'bobotie', 'paella',
  'tortilla espanola', 'gazpacho', 'patatas bravas', 'chorizo', 'jamon', 'croquetas',
  'pizza margherita', 'lasagne', 'carbonara', 'cacio e pepe', 'risotto', 'gnocchi',
  'minestrone', 'bruschetta', 'ravioli', 'tortellini', 'arancini', 'caprese salad',
  'pesto pasta', 'puttanesca', 'amatriciana', 'moussaka', 'souvlaki', 'gyros',
  'tzatziki', 'spanakopita', 'dolma', 'greek salad', 'goulash', 'schnitzel',
  'bratwurst', 'sauerkraut', 'spaetzle', 'pierogi', 'borscht', 'beef stroganoff',
  'ratatouille', 'coq au vin', 'cassoulet', 'quiche lorraine', 'croque monsieur', 'crepe',
  'beef bourguignon', 'french onion soup', 'tacos', 'burrito', 'quesadilla', 'enchiladas',
  'fajitas', 'nachos', 'guacamole', 'chilli con carne', 'empanada', 'arepa',
  'ceviche', 'feijoada', 'churrasco', 'jerk chicken', 'rice and peas', 'curry goat',
  'ackee and saltfish', 'fish and chips', 'shepherds pie', 'cottage pie', 'toad in the hole', 'bangers and mash',
  'full english breakfast', 'ploughmans lunch', 'beef wellington', 'yorkshire pudding', 'chicken tikka', 'steak and ale pie',
  'cornish pasty', 'scotch egg', 'black pudding', 'haggis', 'sunday roast', 'roast chicken',
  'roast beef', 'roast potatoes', 'cauliflower cheese', 'macaroni cheese', 'fish pie', 'kedgeree',
  'bubble and squeak', 'caesar salad', 'cobb salad', 'club sandwich', 'blt sandwich', 'grilled cheese sandwich',
  'mac and cheese', 'buffalo wings', 'pulled pork', 'brisket', 'cornbread', 'coleslaw',
  'clam chowder', 'lobster roll', 'philly cheesesteak', 'sloppy joe', 'meatloaf', 'pancakes',
  'waffles', 'french toast', 'eggs benedict', 'omelette', 'scrambled eggs', 'porridge',
  'overnight oats', 'granola bowl', 'acai bowl', 'smoothie bowl', 'avocado toast', 'beans on toast',
  'bacon sandwich', 'breakfast burrito', 'chicken noodle soup', 'tomato soup', 'lentil soup', 'split pea soup',
  'chicken broth', 'poke bowl', 'buddha bowl', 'burrito bowl', 'grain bowl', 'quinoa salad',
  'protein shake', 'whey protein', 'casein protein', 'mass gainer', 'stir fry vegetables', 'steamed vegetables',
  'roasted vegetables', 'mashed potato', 'baked potato', 'sweet potato mash', 'jacket potato', 'potato salad',
  'grilled chicken breast', 'grilled salmon', 'baked cod', 'tuna steak', 'prawn stir fry', 'steak sirloin',
  'steak ribeye', 'lamb chop', 'pork chop', 'turkey breast', 'duck breast', 'beef mince',
  'chicken thigh', 'chicken wings', 'meatballs', 'scrambled tofu', 'tofu stir fry', 'tempeh',
  'seitan', 'veggie burger', 'lentil curry', 'chickpea curry', 'black bean stew', 'three bean chilli',
  'cheeseburger', 'hamburger', 'hot dog', 'chicken burger', 'fish burger', 'doner kebab',
  'shish kebab', 'chicken wrap', 'tuna melt', 'apple pie', 'banoffee pie', 'sticky toffee pudding',
  'bread and butter pudding', 'tiramisu', 'panna cotta', 'creme brulee', 'cheesecake', 'brownie',
  'rice pudding', 'custard', 'trifle', 'eton mess', 'crumble'
];

const LIBDONE_KEY = 'coachlibdone';
function libDone(){ try{ return JSON.parse(CS.getItem(LIBDONE_KEY)) || {}; }catch(e){ return {}; } }
function libMark(name, got){
  const all = libDone();
  all[name] = got ? 1 : 0;      // 0 means "asked, not there" - never asked twice
  try{ lsSet(LIBDONE_KEY, JSON.stringify(all)); }catch(e){}
}
function libTodo(){
  const done = libDone();
  const saved = (typeof fdcSavedFoods === 'function') ? fdcSavedFoods() : {};
  return LIBRARY_DISHES.filter(n=>{
    if(done[n] !== undefined) return false;
    return !saved[String(n).toLowerCase()];
  });
}
function libCount(){
  const done = libDone();
  let n = 0;
  LIBRARY_DISHES.forEach(x=>{ if(done[x] === 1) n++; });
  return n;
}

let libBuilding = false, libStop = false;
async function buildLibrary(){
  if(libBuilding){ libStop = true; return; }
  if(!fdcHasKey()){ fdcStatusLine('Save a USDA key first - that is where the dishes come from.', 'bad'); return; }
  const todo = libTodo();
  const btn = document.getElementById('lib-build');
  if(!todo.length){
    fdcStatusLine('Your library already has every dish on the list (' + libCount() + ' of ' +
      LIBRARY_DISHES.length + ' were found).', 'good');
    return;
  }
  libBuilding = true; libStop = false;
  if(btn) btn.textContent = 'Stop';

  let got = 0, none = 0, i = 0;
  for(const name of todo){
    if(libStop) break;
    i++;
    fdcStatusLine('Building your library: ' + i + ' of ' + todo.length + ' \u00b7 ' + name +
      ' \u00b7 ' + got + ' saved');
    try{
      const hits = await fdcSearch(name);
      // A dish is worth keeping only if it came back with real nutrients on it.
      const cands = hits.map(fdcToFood).filter(f=>f && f.kcal100 > 0 &&
                    Object.keys(f.micros100 || {}).length >= 5);
      if(cands.length){
        const f = cands[0];
        /* Saved under the name YOU would search for, with what FoodData
           Central called it kept alongside, so the row can still say where the
           figures came from. */
        /* Marked as what it is at the moment it is saved. Everything on this
           list is a dish, so nothing has to guess later from the name. */
        const rec = Object.assign({}, f, {name: titleCase(name), fdcDesc: f.fdcDesc || f.name,
                                          kind: foodKind(null, name) || 'meal'});
        fdcRemember(rec);
        libMark(name, true); got++;
      } else {
        libMark(name, false); none++;
      }
    }catch(e){
      libBuilding = false;
      if(btn) btn.textContent = 'Build my food library';
      fdcStatusLine('Stopped: ' + e.message + '. ' + got + ' dishes saved so far, and kept. ' +
        'Tap again to carry on where it left off.', 'bad');
      renderLibRow();
      return;
    }
    await new Promise(r=>setTimeout(r, 220));
  }

  libBuilding = false;
  if(btn) btn.textContent = 'Build my food library';
  const left = libTodo().length;
  fdcStatusLine(got + ' dish' + (got === 1 ? '' : 'es') + ' saved to this device' +
    (none ? ', ' + none + ' not in the database' : '') +
    (left ? '. ' + left + ' still to do - tap again.' : '. That is the whole list.'), 'good');
  renderLibRow();
}

// A name typed for searching is not a name to read. "nasi goreng" becomes
// "Nasi goreng", the way every other food in COACH is written.
function titleCase(s){
  const t = String(s || '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

function renderLibRow(){
  const el = document.getElementById('lib-note');
  if(!el) return;
  const have = libCount(), all = LIBRARY_DISHES.length;
  el.textContent = have
    ? have + ' of ' + all + ' dishes saved to this device. They work offline and are in every backup.'
    : 'Not built yet. ' + all + ' dishes - nasi goreng, pho, shakshuka, jollof rice and the rest - ' +
      'fetched once from USDA and kept on this device for good.';
}

let fdcFilling = false, fdcStop = false;
async function fdcFillGaps(){
  if(fdcFilling){ fdcStop = true; return; }
  if(!fdcHasKey()){ fdcStatusLine('Save a key first.', 'bad'); return; }

  const names = fdcFillOrder();
  if(!names.length){
    fdcStatusLine('Nothing left to fill — every built-in food has been done.', 'good');
    return;
  }
  const rows = {};
  LOCAL_FOODS.forEach(f=>{ rows[f[0]] = f; });

  fdcFilling = true; fdcStop = false;
  const btn = document.getElementById('fdc-fill');
  if(btn) btn.textContent = 'Stop';

  let done = 0, rejected = 0, missed = 0, i = 0;
  for(const name of names){
    if(fdcStop) break;
    i++;
    fdcStatusLine(i + ' of ' + names.length + ' · ' + name + ' · ' +
      done + ' filled, ' + (rejected + missed) + ' skipped');
    try{
      const hits = await fdcSearch(name);
      const cands = hits.map(fdcToFood).filter(f=>f && Object.keys(f.micros100||{}).length);
      // The first candidate whose calories agree, not simply the first.
      const good = cands.filter(f=>fdcMatchOk(rows[name], f))[0];
      if(good){
        fdcPutFill(name, good.micros100, good.fdcDesc);
        done++;
      } else if(cands.length){
        // Found something, did not believe it. Recorded so the next run does
        // not spend a request proving the same thing again.
        fdcPutMiss(name, 'no match close enough on calories');
        rejected++;
      } else {
        fdcPutMiss(name, 'nothing found');
        missed++;
      }
    }catch(e){
      fdcFilling = false;
      if(btn) btn.textContent = 'Fill in every built-in food';
      fdcStatusLine('Stopped: ' + e.message + '. ' + done + ' filled so far, and saved. ' +
        'Tap again to carry on where it left off.', 'bad');
      if(typeof renderDay === 'function') renderDay();
      return;
    }
    await new Promise(r=>setTimeout(r, 220));
  }

  fdcFilling = false;
  if(btn) btn.textContent = 'Fill in every built-in food';
  const left = fdcFillOrder().length;
  renderFdcRetry();
  fdcStatusLine(done + ' filled in' +
    (rejected ? ', ' + rejected + ' rejected as a bad match' : '') +
    (missed ? ', ' + missed + ' not in the database' : '') +
    (left ? '. ' + left + ' still to do — tap again.' : '. That is the whole list.'),
    'good');
  if(typeof renderDay === 'function') renderDay();
  renderFdcSettings();
}

// ---- and the quiet version ----
// Logging a food that has gaps fetches it once, in the background, and never
// again. Nothing waits on it: the entry is already saved by the time this runs,
// and if the request fails the day is exactly as it would have been.
const fdcInFlight = {};
function fdcTopUpQuietly(name){
  if(!fdcHasKey() || fdcFilling) return;
  if(!name || fdcInFlight[name]) return;
  const rows = {};
  LOCAL_FOODS.forEach(f=>{ rows[f[0]] = f; });
  if(!rows[name] || !fdcNeedsFill(name)) return;
  fdcInFlight[name] = true;
  fdcSearch(name).then(hits=>{
    const cands = hits.map(fdcToFood).filter(f=>f && Object.keys(f.micros100||{}).length);
    const good = cands.filter(f=>fdcMatchOk(rows[name], f))[0];
    if(good) fdcPutFill(name, good.micros100, good.fdcDesc);
    else fdcPutMiss(name, cands.length ? 'no match close enough on calories' : 'nothing found');
    if(good && typeof renderDay === 'function') renderDay();
  }).catch(()=>{
    // A failed top-up is not an error worth showing. It will be retried the
    // next time this food is logged.
    delete fdcInFlight[name];
  });
}

(function wireFdc(){
  const save = document.getElementById('fdc-save');
  if(!save) return;
  save.onclick = async ()=>{
    const v = (document.getElementById('fdc-key').value || '').trim();
    if(!v){ fdcStatusLine('Paste the key first.', 'bad'); return; }
    fdcSaveKey(v);
    fdcStatusLine('Testing...');
    try{
      // A real lookup, not a ping. A key that cannot fetch a banana is no good
      // to you and you should find that out here rather than mid-search.
      const hits = await fdcSearch('banana raw');
      const f = hits.map(fdcToFood).filter(x=>x)[0];
      if(!f) throw new Error('the key worked but returned nothing usable');
      fdcStatusLine('Working — that key just pulled ' + Object.keys(f.micros100).length +
        ' nutrients for a banana. Whole-food search is on.', 'good');
    }catch(e){
      fdcStatusLine('Did not work: ' + e.message, 'bad');
    }
  };
  const clear = document.getElementById('fdc-clear');
  if(clear) clear.onclick = ()=>{
    // Only the key goes. Foods already downloaded are yours and stay put,
    // exactly like a food you typed in by hand.
    fdcSaveKey('');
    document.getElementById('fdc-key').value = '';
    renderFdcSettings();
  };
  const fill = document.getElementById('fdc-fill');
  if(fill) fill.onclick = fdcFillGaps;
  const lib = document.getElementById('lib-build');
  if(lib) lib.onclick = buildLibrary;
  renderLibRow();
  const retry = document.getElementById('fdc-retry');
  if(retry) retry.onclick = ()=>{
    const n = fdcClearMisses();
    renderFdcRetry();
    fdcStatusLine(n + ' put back in the queue. Tap fill again.', 'good');
  };
})();

document.getElementById('restore-btn').onclick = ()=>document.getElementById('restore-file').click();
document.getElementById('restore-file').onchange = (e)=>{ if(e.target.files[0]) importJSON(e.target.files[0]); };

(function(){
  const t = document.getElementById('scandiag-toggle');
  t.checked = CS.getItem('coachscandiag') === '1';
  t.onchange = ()=>{
    if(t.checked) lsSet('coachscandiag','1');
    else CS.removeItem('coachscandiag');
  };
})();

document.getElementById('open-weighin').onclick = ()=>{
  closeSheet('target-backdrop');
  setTimeout(()=>openWeighIn(todayYMD(), false), HANDOFF);
};

// ---- day watcher ----
// A home-screen PWA is not reloaded when you reopen it; iOS keeps the page
// alive for days. Without this, `currentDate` stays on whatever day the app
// was first opened, the header quietly reads "Yesterday", and everything you
// log lands in the wrong bucket.
let watchedDay = todayYMD();

function handleDayRollover(){
  const now = todayYMD();
  if(now === watchedDay) return;
  const wasOnToday = ymd(currentDate) === watchedDay;   // don't yank you out of history
  watchedDay = now;
  if(wasOnToday) currentDate = new Date();
  renderStreak();
  if(currentView==='day') renderDay(); else renderWeek();
  // same priority as boot: one popup at a time, review first
  const wr = runWeeklyReview();
  const mr = runMonthlyReview();
  try{ renderReviewPills(); }catch(e){}
  if(mr || wr){ renderReviewSheet(mr || wr); setTimeout(()=>openSheet('review-backdrop'), 400); }
  else maybePromptWeighIn();
}

document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) handleDayRollover(); });
window.addEventListener('focus', handleDayRollover);
window.addEventListener('pageshow', handleDayRollover);
setInterval(handleDayRollover, 60000);

/* v112: getting the slow first-times out of the way. The food tables are
   parsed the first time anything searches them, and the two "best foods for"
   lists are built the first time a review or the Data screen wants them - so
   the first search and the first review each used to stall. They are now done
   a piece at a time just after the app opens, while nothing else is going on.
   Each piece is its own turn, so a tap in between is answered first. */
/* v117: each job now does at most a few milliseconds and says whether it has
   finished, so no single step is long enough to make a tap feel stuck. Before,
   reading the USDA table was one block of half a second, just after opening -
   exactly when you are most likely to tap something. */
/* v131: the summaries the Data screen and the reviews are built from, remembered
   until anything at all is saved. Opening the same screen twice no longer does
   the same three-month sum twice. A copy is handed out each time, so nothing a
   caller does to the answer can change the remembered one. */
(function memoSummaries(){
  const memo = new Map();
  const wrap = fn => function(){
    const tk = targets ? targets.kcal + '/' + targets.protein : '';
    let args = '';
    try{ args = JSON.stringify(Array.prototype.slice.call(arguments)); }catch(e){ return fn.apply(this, arguments); }
    const key = fn.name + '|' + args + '|' + logEpoch + '|' + fillEpoch + '|' + scoreEpoch + '|' + todayYMD() + '|' + tk;
    if(memo.has(key)){
      const v = memo.get(key);
      try{ return structuredClone(v); }catch(e){ return v; }
    }
    const v = fn.apply(this, arguments);
    if(memo.size > 60) memo.clear();
    memo.set(key, v);
    try{ return structuredClone(v); }catch(e){ return v; }
  };
  try{ verdictRecord = wrap(verdictRecord); }catch(e){}
  try{ systemRecord = wrap(systemRecord); }catch(e){}
  try{ worstQualityFoods = wrap(worstQualityFoods); }catch(e){}
  try{ dataSeries = wrap(dataSeries); }catch(e){}
  try{ dataSummary = wrap(dataSummary); }catch(e){}
  try{ patternTips = wrap(patternTips); }catch(e){}
})();

(function warmUp(){
  const SLICE = 8;
  const each = (list, fn)=>{ let k = 0; return ()=>{ const end = performance.now() + SLICE;
    while(k < list().length){ fn(list()[k++]); if(performance.now() > end) return false; } return true; }; };
  const jobs = [
    ()=>nfStep('UK', SLICE), ()=>nfStep('AU', SLICE), ()=>nfStep('US', SLICE),
    // Search names, worked out ahead of the first letter typed.
    each(()=>LOCAL_FOODS, f=>{ nameParts(f[0]); const a = rowAlias(f); if(a) nameParts(a); }),
    ()=>{ eatenHistory(); return true; },
    ()=>richPoolStep(SLICE),
    each(()=>richPools()[0], f=>{ richOk(f); richPortion(f); }),
    each(()=>richPools()[1], f=>{ if(f.kcal100 > 0){ richOk(f); richPortion(f); } }),
    ()=>{ superFoodPool(); return true; }
  ];
  // v131: straight after the food tables, score the last 90 days one at a time
  // and build the Data screen's and the reviews' summaries, so they open with
  // the work already done. Each day is its own small step.
  jobs.splice(3, 0,
    each(()=>Array.from({length: 90}, (_, k)=>k), k=>{ try{ dayVerdict(addDays(new Date(), -k)); }catch(e){} }),
    ()=>{ try{ patternTips(7); }catch(e){} return true; },
    ()=>{ try{ patternTips(30); }catch(e){} return true; },
    ()=>{ try{ const n = (typeof dataRange !== 'undefined' && dataRange) ? dataRange : 30; dataSummary(n); patternTips(Math.min(90, n)); }catch(e){} return true; },
    // v140: draw the other two tabs once, hidden, so the first tap on them is instant.
    ()=>{ try{ renderWeek(); }catch(e){} return true; },
    ()=>{ window.coachPredraw = true; try{ renderDataView(); }catch(e){} window.coachPredraw = false; return true; }
  );
  // v140: the loading screen stays up while this runs, so the app is ready
  // the moment it shows: scores, summaries, search names and all three tabs.
  // The work is done back to back while the screen is covered, with a cap so
  // a slow phone never waits more than about 3 seconds. Anything left over
  // carries on quietly in the background, as before.
  const CAP = 3000, started = performance.now();
  let i = 0, covered = true;
  const bar = document.querySelector('#boot-splash i');
  if(bar){ bar.style.animation = 'none'; bar.style.transform = 'none'; bar.style.width = '6%'; bar.style.transition = 'width .2s ease'; }
  const uncover = ()=>{
    if(!covered) return;
    covered = false;
    if(bar) bar.style.width = '100%';
    try{ afterPaint(()=>{ try{ window.hideBootSplash(); }catch(e){} }); }catch(e){ try{ window.hideBootSplash(); }catch(_){} }
  };
  const next = ()=>{
    if(i >= jobs.length){ uncover(); return; }
    // Not while you are looking at something else in another app.
    if(!covered && document.hidden){ setTimeout(next, 2000); return; }
    let done = true;
    try{ done = jobs[i]() !== false; }catch(e){ done = true; }
    if(done) i++;
    if(covered){
      if(bar) bar.style.width = Math.max(6, Math.round(i / jobs.length * 100)) + '%';
      if(performance.now() - started > CAP) uncover();
      setTimeout(next, 0);
    } else setTimeout(next, done ? 60 : 16);
  };
  window.coachWarm = ()=>({done: i, of: jobs.length, covered: covered});
  // Today is drawn already; start straight after the first paint.
  afterPaint(next);
})();

if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').then(reg=>{
    // Check for a new deployment every time the app is opened or resumed.
    reg.update().catch(()=>{});
    document.addEventListener('visibilitychange', ()=>{
      if(!document.hidden) reg.update().catch(()=>{});
    });
  }).catch(()=>{});

  // When a new version activates, reload once so the user sees it immediately.
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', ()=>{
    if(refreshing) return;
    refreshing = true;
    // v142: let anything just written reach the store first.
    Promise.race([CS.whenSaved(), new Promise(r=>setTimeout(r, 1500))]).then(()=>window.location.reload());
  });
}
