// ---- the seven days ending on the day you are looking at ----
// Deliberately not "this calendar week": the question the strip answers is
// "how has the last week gone", and that does not reset on a Monday.
function week7Days(endDate){
  const out = [];
  for(let i = 6; i >= 0; i--){
    const d = addDays(endDate, -i);
    const ds = ymd(d);
    const eaten = getDailyIntake(ds);
    const target = judgedTarget(d);
    // A day that is not over yet is not a verdict, so it is drawn but never
    // coloured as if it were finished.
    const settled = ds < todayYMD();
    const st = eaten > 0 ? calorieState(eaten, target, (loadProfile().goal || 'maintain'), settled) : null;
    const v = dayVerdict(ds);
    out.push({ date: d, ds, eaten, target, settled, v,
               zone: st ? st.zone : null,
               frac: target > 0 ? Math.max(0, Math.min(1.25, eaten/target)) : 0 });
  }
  return out;
}
// The three checks for the day on screen. Deliberately plain: a tick, what it
// was, and what it needed to be.
function renderOnTarget(){
  const box = document.getElementById('ontarget');
  if(!box) return;
  const ds = dayScoreParts(ymd(currentDate));
  if(!ds.logged){ box.innerHTML = ''; return; }
  const v = ds.verdict;

  const COL = {cal:'var(--accent)', protein:'var(--prot)', quality:'var(--carb)',
               systems:'var(--fat)', hyd:'#5aa8e0'};
  const band = dsBand(ds.score);
  const scoreCol = ds.score === null ? 'var(--text3)'
    : (typeof scoreColour === 'function' ? scoreColour(band.cls) : 'var(--text)');

  // The bar is the score itself, taken apart: each part as wide as the points
  // it actually put in, and the rest of the bar is what is still on the table.
  const segs = ds.parts.filter(x=>x.points > 0).map(x=>
    '<i style="width:' + x.points + '%; background:' + COL[x.k] + '"></i>').join('') +
    '<i style="flex:1; background:transparent"></i>';

  const rows = ds.parts.map(x=>{
    const dot = x.pct === null ? 'var(--border)' : COL[x.k];
    const share = Math.round((x.share || 0) * 100);
    return '<button class="ds-row" data-dspart="' + x.k + '">'+
      '<span class="ds-dot" style="background:' + dot + '"></span>'+
      '<span class="ds-n">' + x.label + '<s>' + esc(x.value) + ' · ' + esc(x.sub) + '</s></span>'+
      // The dot matches its slice of the bar; the figure is coloured by how it
      // actually did, so a 2 never reads as reassuring green.
      '<span class="ds-p" style="color:' + (x.pct === null ? 'var(--text3)'
          : scoreColour(dsBand(x.pct).cls)) + '">'+
        (x.pct === null ? '—' : x.pct) +
        '<s>' + (x.pct === null ? 'not measured' : x.points + ' of ' + share) + '</s>'+
      '</span></button>';
  }).join('');

  const missed = ds.parts.filter(x=>x.pct === null);
  let foot = '';
  if(missed.length){
    foot = '<div class="ds-foot">' + esc(missed.map(x=>x.label.toLowerCase()).join(' and ')) +
      ' could not be measured today, so ' +
      (missed.length === 1 ? 'its share was' : 'their shares were') +
      ' spread across the rest — and the most today can score is <b>' + ds.ceiling +
      '</b> until there is more to go on.</div>';
  }
  // The pass-or-fail floors are still what makes a day count toward your
  // averages and your streak, so they are still said out loud.
  foot += '<div class="ds-foot">' +
    (v.all ? 'All three floors met — today counts.'
           : v.met + ' of 3 floors met. A day counts toward your averages when calories, ' +
             'protein and quality all land.') + '</div>';

  // v138: the breakdown folds away. Tap the score to open or close it; the
  // choice is remembered (a new key, nothing else is touched).
  const folded = CS.getItem('coachscorefold') !== '0';
  box.innerHTML =
    '<div class="ont-card' + (folded ? ' ds-folded' : '') + '">'+
      '<button class="ds-top" id="ds-fold" aria-expanded="' + (folded ? 'false' : 'true') + '">'+
        '<span class="ds-num" style="color:' + scoreCol + '">' +
          (ds.score === null ? '—' : ds.score) + '</span>'+
        '<span class="ds-side">'+
          '<span class="ds-word" style="color:' + scoreCol + '">' + band.word + '</span>'+
          '<span class="ds-cap">' + (ds.provisional ? 'out of ' + ds.ceiling + ' today' : 'out of 100') +
            ' · ' + dayLabel(currentDate).toLowerCase() + '</span>'+
          '<span class="ds-bar">' + segs + '</span>'+
        '</span>'+
        '<i class="ti ti-chevron-right ds-chev" aria-hidden="true"></i>'+
      '</button>'+
      '<div class="ds-body">' + rows + foot + '</div>'+
    '</div>';
  document.getElementById('ds-fold').onclick = ()=>{
    lsSet('coachscorefold', folded ? '0' : '1');
    renderOnTarget();
  };

  // Each part goes to the thing that would move it.
  box.querySelectorAll('[data-dspart]').forEach(b=>{
    b.onclick = ()=>{
      const k = b.dataset.dspart;
      const es = loadEntries(currentDate);
      try{
        // The protein chip already opens the right sheet, so this goes through it
        // rather than keeping a second way in that could drift out of step.
        if(k === 'protein'){
          const chip = document.querySelector('[data-bdmacro="protein"]');
          if(chip) chip.click();
        }
        else if(k === 'quality'){ renderDayReview(currentDate); }
        else if(k === 'hyd'){ renderHydSheet(); openSheet('hyd-backdrop'); }
        else if(k === 'systems'){
          setNutrientView('body');
          const el = document.getElementById('body-panel');
          if(el && el.scrollIntoView) el.scrollIntoView({behavior:'smooth', block:'start'});
        }
        else {
          const el = document.querySelector('#view-day .ring-card');
          if(el && el.scrollIntoView) el.scrollIntoView({behavior:'smooth', block:'start'});
        }
      }catch(e){}
    };
  });
}

function renderWeek7(){
  renderOnTarget();
  const strip = document.getElementById('week7');
  if(!strip) return;
  const days = week7Days(currentDate);
  const today = todayYMD(), sel = ymd(currentDate);
  strip.innerHTML = days.map(d=>{
    const h = Math.round(Math.max(d.eaten > 0 ? 8 : 0, Math.min(100, d.frac/1.25*100)));
    // Green means all three landed, amber two, red one or none. Colouring this
    // by the calorie zone alone said "good day" to a day that hit its calories
    // on ice cream and missed both the protein and the quality floor.
    const col = VERDICT_COLOUR[d.v.tone];
    const cls = 'w7d' + (d.ds === today ? ' today' : '') + (d.ds === sel ? ' sel' : '');
    const said = d.eaten > 0
      ? fmt0(d.eaten)+' kcal, '+d.v.met+' of 3 met'
      : 'nothing logged';
    return '<button class="'+cls+'" data-w7="'+d.ds+'" aria-label="'+
      d.date.toLocaleDateString(undefined,{weekday:'long'})+', '+said+'">'+
      '<span class="w7bar"><span class="w7fill" style="height:'+h+'%; background:'+col+'"></span></span>'+
      '<span class="w7lab">'+d.date.toLocaleDateString(undefined,{weekday:'narrow'})+'</span>'+
      '</button>';
  }).join('');
  const logged = days.filter(d=>d.eaten > 0).length;
  const full = days.filter(d=>d.v.all).length;
  const calOnly = days.filter(d=>d.v.cal).length;
  const note = document.getElementById('week7-note');
  // Two figures, because "2 of 7" on its own does not tell you WHICH part
  // slipped, and that is the only thing worth knowing from a bad week.
  if(note) note.innerHTML = logged === 0
    ? 'Seven days at a glance, once there is something to show.'
    : '<b>'+full+' of '+logged+'</b> logged '+(logged===1?'day':'days')+' on target'+
      (calOnly !== full ? ' \u00b7 '+calOnly+' hit calories' : '');
  strip.querySelectorAll('[data-w7]').forEach(b=> b.onclick = ()=>{
    currentDate = parseYMD(b.dataset.w7);
    renderDay();
  });
}

// ---- what the engine has actually learned ----
// COACH adapts the target from weight and intake and has never once said what
// it concluded. The sample size travels with the figure, because a maintenance
// estimate from nine days is a direction and one from a month is a number —
// the same discipline as refusing a verdict on twelve trades.
const TDEELOG_KEY = 'coachtdeelog';
const TDEELOG_MAX = 400;
function loadTdeeLog(){ try{ return JSON.parse(CS.getItem(TDEELOG_KEY)) || []; }catch(e){ return []; } }
function recordTdee(est){
  if(!(est > 0)) return;
  const log = loadTdeeLog();
  const today = todayYMD();
  const last = log[log.length-1];
  if(last && last.date === today){ last.est = Math.round(est); }
  else log.push({ date: today, est: Math.round(est) });
  try{ CS.setItem(TDEELOG_KEY, JSON.stringify(log.slice(-TDEELOG_MAX))); }catch(e){}
}
// The closest stored estimate at least `days` old. Null when the log does not
// reach back that far — which is said out loud rather than compared anyway.
function tdeeThen(days){
  const log = loadTdeeLog();
  const cut = ymd(addDays(new Date(), -days));
  const older = log.filter(e => e.date <= cut);
  return older.length ? older[older.length-1] : null;
}
function countInWindow(days){
  const today = new Date(); today.setHours(0,0,0,0);
  let confirmed = 0;
  for(let i = 1; i <= days; i++){
    const ds = ymd(addDays(today, -i));
    if(getDailyIntake(ds) > 0 && isDayComplete(ds)) confirmed++;
  }
  const from = ymd(addDays(today, -days));
  const weighIns = loadWeightLog().filter(e => e.date > from).length;
  return { confirmed, weighIns };
}
const LEARNED_WINDOW = 28;
function maintenanceReadout(){
  // v135: the same reading as the Week card and the suggestion.
  const b = burnNow();
  if(!b) return { ready:false };
  const a = {estTDEE: b.tdee};
  recordTdee(a.estTDEE);
  const n = countInWindow(LEARNED_WINDOW);
  // Three tiers, and the middle one is the honest default: enough to act on,
  // not enough to be certain.
  const tier = (n.confirmed >= 20 && n.weighIns >= 20) ? 'solid'
             : (n.confirmed >= 14 && n.weighIns >= 12) ? 'usable'
             : 'thin';
  const then = tdeeThen(21);
  const delta = then ? Math.round(a.estTDEE) - then.est : null;
  return { ready:true, est: Math.round(a.estTDEE), tier, delta,
           confirmed: n.confirmed, weighIns: n.weighIns, thenDate: then ? then.date : null };
}
function renderLearned(){
  const card = document.getElementById('learned-card');
  if(!card) return;
  const r = maintenanceReadout();
  if(!r.ready){ card.style.display = 'none'; return; }
  card.style.display = 'block';
  card.className = 'learned' + (r.tier === 'thin' ? ' thin' : '');
  document.getElementById('learned-fig').innerHTML =
    'About ' + fmt0(r.est) + '<span class="lu">kcal to maintain</span>';

  const dEl = document.getElementById('learned-delta');
  if(r.delta === null){
    dEl.textContent = 'First estimate. COACH will tell you when it moves.';
  } else if(Math.abs(r.delta) < 25){
    dEl.textContent = 'Unchanged since three weeks ago.';
  } else {
    dEl.textContent = (r.delta > 0 ? 'Up ' : 'Down ') + fmt0(Math.abs(r.delta)) +
                      ' on three weeks ago.';
  }

  // v143: one line - how much it rests on, and how far to trust it.
  const tail = { solid: 'solid', usable: 'good enough to act on', thin: 'thin, a rough guide' }[r.tier];
  document.getElementById('learned-sample').innerHTML =
    '<b>' + r.confirmed + '</b> day' + (r.confirmed===1?'':'s') + ' \u00b7 <b>' + r.weighIns + '</b> weigh-in' +
    (r.weighIns===1?'':'s') + ' \u00b7 4 weeks \u00b7 ' + tail;
}

function renderDay(){
  try{ renderReviewPills(); }catch(e){}
  renderTargetProvenance();
  renderWeighNudge();
  try{ renderAdaptCard(); }catch(e){}
  renderBackupNag();
  document.getElementById('day-label').textContent = dayLabel(currentDate);
  document.getElementById('day-sub').textContent = currentDate.toLocaleDateString('en-GB',
    currentDate.getFullYear() === new Date().getFullYear()
      ? {weekday:'long', day:'numeric', month:'long'}
      : {weekday:'long', day:'numeric', month:'long', year:'numeric'});

  const entries = loadEntries(currentDate);
  const totK = entries.reduce((s,e)=>s+e.kcal,0);
  const totP = entries.reduce((s,e)=>s+(e.protein||0),0);
  const totC = entries.reduce((s,e)=>s+(e.carbs||0),0);
  const totF = entries.reduce((s,e)=>s+(e.fat||0),0);

  const dayT = dayTargets(currentDate);
  // The day being viewed is only "settled" once it is over — under-eating at
  // 4pm is not a verdict, so the amber only applies to past days.
  const dayGoal = loadProfile().goal || 'maintain';
  const settled = ymd(currentDate) < todayYMD();
  const st = calorieState(totK, dayT.kcal, dayGoal, settled);

  // v84: the ring reads "1,264 / of 2,650" — eaten over goal. It used to read
  // what was LEFT, with eaten and target repeated in a small grey line below
  // it; two figures in two places, one of them tiny. What is left is the gap
  // between the two numbers now on the ring, and the ring itself draws it.
  // When you go past the target the second line says by how much, so the
  // "+140 over" badge that line used to carry is not lost.
  const ringNum = document.getElementById('ring-num');
  const ringLab = document.getElementById('ring-lab');
  ringNum.textContent = fmtK(totK);
  ringNum.style.color = st.color;
  /* Two short lines, and the second one is a figure, not a sentence. It used
     to carry the full verdict - "+702 - surplus high" - which does not fit
     inside a 100px ring and spilled over the edge of it. The wording lives on
     the day card, which has room for it. */
  ringLab.innerHTML = 'of ' + fmtK(dayT.kcal) + ' kcal' +
    (st.diff > 0
      ? '<br><b style="color:' + st.color + '">+' + fmtK(st.diff) + '</b>'
      : '');
  // v120: the gap, said in words under the ring.
  const togo = document.getElementById('ring-togo');
  if(togo){
    const gap = Math.round(dayT.kcal - totK);
    const isToday = ymd(currentDate) === todayYMD();
    togo.innerHTML = gap >= 0
      ? '<b>' + fmtK(gap) + ' kcal</b> ' + (isToday ? 'to go today' : 'under target')
      : '<b style="color:' + st.color + '">' + fmtK(-gap) + ' kcal</b> over target';
  }
  try{ renderPace(totK, dayT.kcal); }catch(e){}
  try{ renderDayViews(); }catch(e){}

  const circumference = 264;
  document.getElementById('ring-progress').style.strokeDashoffset = circumference*(1-st.ringPct);
  document.getElementById('ring-progress').style.stroke = st.ringColor;
  setRingTick('ring-tick-target',  st.targetTick,  'var(--text)',    st.ringPct);
  setRingTick('ring-tick-ceiling', st.ceilingTick, 'var(--caution)', st.ringPct);

  const ps = proteinState(totP, dayT.protein);
  document.getElementById('pring-progress').style.strokeDashoffset = circumference*(1-ps.pct);
  document.getElementById('pring-progress').style.stroke = ps.color;
  // Same shape on protein: what you have had over what you are after. "hit"
  // is what the old label said when you got there, so it still says it.
  const pringNum = document.getElementById('pring-num');
  pringNum.textContent = fmt0(totP);
  pringNum.style.color = ps.color;
  document.getElementById('pring-lab').innerHTML =
    'of ' + fmt0(dayT.protein) + 'g' +
    (ps.met ? '<br><b style="color:var(--accent)">hit</b>' : '');

  // Both macro layouts are filled on EVERY render, visible or not. Filling only
  // the shown one leaves the other holding whatever day was last rendered
  // before the setting was flipped, which surfaces as stale numbers the first
  // time you toggle it — the kind of bug that looks like data loss.
  const setMacro = (bar,val,tot,tgt,unit)=>{
    document.getElementById(bar).style.width = Math.min(100,(tot/tgt)*100)+'%';
    document.getElementById(val).innerHTML = fmtK(tot)+'<s> / '+fmtK(tgt)+unit+'</s>';
  };
  setMacro('bar-p','val-p',totP,dayT.protein,'g');
  setMacro('bar-c','val-c',totC,dayT.carbs,'g');
  setMacro('bar-f','val-f',totF,dayT.fat,'g');

  const setChip = (k,tot,tgt)=>{
    document.getElementById('chip-'+k).textContent = fmt0(tot);
    document.getElementById('chipt-'+k).textContent = ' / '+tgt+'g';
    document.getElementById('chipbar-'+k).style.width = Math.min(100,(tot/tgt)*100)+'%';
  };
  setChip('p',totP,dayT.protein);
  setChip('c',totC,dayT.carbs);
  setChip('f',totF,dayT.fat);

  applyHud();
  renderTrainToggle();
  renderDayComplete();
  // Kept in step with the day on screen, so scrolling back to Tuesday shows
  // Tuesday's review rather than today's.
  renderDayReviewCard();

  const list = document.getElementById('entries');

  list.innerHTML = MEALS.map(meal=>{
    const items = entries.map((e,i)=>({e,i})).filter(x=>!x.e.supp && (x.e.meal||'Snack')===meal);
    const mk = items.reduce((s,x)=>s+x.e.kcal,0);
    // The meal's own score, beside its calories. Scored as one plate, like the
    // day is - see mealScore(). A meal where nothing carries label figures shows
    // nothing rather than a zero, because unknown is not the same as bad.
    const ms = items.length ? mealScore(items.map(x=>x.e)) : null;
    // v91: the pill opens the working out - what each item did to this number.
    const msPill = (ms && ms.score !== null)
      ? '<button class="mscore '+scoreBand(ms.score).cls+'" data-msq="'+meal+'">'+ms.score+'</button>'
      : (ms && ms.of ? '<button class="mscore none" data-msq="'+meal+'" title="'+(ms.of - ms.used)+
                       ' of '+ms.of+' items need packet figures">&mdash;</button>' : '');
    const head = '<div class="meal-head">'+
      '<span class="mname"><i class="ti '+MEAL_ICONS[meal]+'" aria-hidden="true"></i> '+meal+msPill+'</span>'+
      '<span class="mkcal">'+(items.length? fmtK(mk)+' kcal' : 'Nothing yet')+'</span></div>';

    const body = items.length===0
      ? '<button class="meal-add" data-meal="'+meal+'" aria-label="Add to '+meal+'">'+
        '<i class="ti ti-plus" aria-hidden="true"></i> Add '+meal.toLowerCase()+'</button>'
      : '<div class="meal-card">' + items.map(x=>
          '<div class="entry-wrap">'+
          '<button class="swipe-del" data-i="'+x.i+'" aria-label="Delete '+esc(x.e.name)+'">'+
          '<i class="ti ti-trash" aria-hidden="true"></i>Delete</button>'+
          '<div class="entry" data-edit="'+x.i+'"><div><div class="name">'+esc(shownName(x.e.name, x.e))+amountLabel(x.e)+'</div>'+
          '<div class="macros-mini">'+(splitName(x.e.name, x.e).brand ? esc(splitName(x.e.name, x.e).brand)+' &middot; ' : '')+'P '+fmt0(x.e.protein||0)+'g &middot; C '+fmt0(x.e.carbs||0)+'g &middot; F '+fmt0(x.e.fat||0)+'g</div></div>'+
          '<div class="right"><span class="kcal">'+fmtK(x.e.kcal)+'</span>'+
          '<i class="ti ti-chevron-left hint" aria-hidden="true"></i></div></div></div>'
        ).join('')
        + '<button class="meal-add subtle" data-meal="'+meal+'" aria-label="Add to '+meal+'">'+
          '<i class="ti ti-plus" aria-hidden="true"></i> Add</button></div>';

    // data-mealgroup is what elementFromPoint resolves to under the finger.
    return '<div class="meal-group'+(items.length ? '' : ' is-empty')+'" data-mealgroup="'+meal+'">'+head+body+'</div>';
  }).join('');

  list.querySelectorAll('[data-edit]').forEach(el=>{
    el.addEventListener('click', e=>{
      // v125: already handled when the finger lifted.
      if(el._tapAt && Date.now() - el._tapAt < 900) return;
      // A tap that ends a swipe closes the row instead of opening the editor.
      if(openSwipe === el){ e.stopPropagation(); closeSwipe(); return; }
      openFoodDetail(Number(el.dataset.edit));
    });
  });
  list.querySelectorAll('.swipe-del').forEach(b=>{
    b.onclick = ()=>deleteEntryAt(Number(b.dataset.i));
  });
  attachSwipe(list);
  list.querySelectorAll('[data-msq]').forEach(b=>{
    b.onclick = ev=>{
      ev.stopPropagation();
      const m = b.dataset.msq;
      openMealScore(m, entries.filter(e=>(e.meal || 'Snack') === m));
    };
  });
  list.querySelectorAll('.meal-add').forEach(b=>{
    b.onclick = ()=>{ selectMeal(b.dataset.meal); disarmBarcode(); openSheet('add-backdrop'); };
  });

  try{ renderSupps(entries); }catch(e){}
  renderMicros(entries);
  renderBody(entries);
  setNutrientView(nutrientView);
  renderWater();
  // Last, because both read the day that has just been rendered.
  renderWeek7();
  renderLearned();
}

