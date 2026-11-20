// ---- History browser ----
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
let histState = { level:'year', year:new Date().getFullYear(), month:null, weekStart:null, day:null, tab:'log' };

function monthStats(year, month){
  const last = new Date(year, month+1, 0).getDate();
  let kcal = 0, days = 0;
  for(let i=1;i<=last;i++){
    const k = getDailyIntake(ymd(new Date(year, month, i)));
    if(k>0){ kcal += k; days++; }
  }
  return { kcal, days, avg: days ? kcal/days : 0 };
}

function weeksInMonth(year, month){
  const first = new Date(year, month, 1);
  const last = new Date(year, month+1, 0);
  const weeks = [];
  let cur = weekStart(first);
  while(cur <= last){
    weeks.push(new Date(cur));
    cur = addDays(cur, 7);
  }
  return weeks;
}

function renderHistory(){
  const body = document.getElementById('hist-body');
  const crumb = document.getElementById('hist-crumb');
  const back = document.getElementById('hist-back');
  const s = histState;

  if(s.tab === 'reviews'){
    crumb.textContent = 'Weekly reviews';
    back.style.display = 'none';
    const reviews = loadReviews();
    body.innerHTML = reviews.length === 0
      ? '<div class="sr-note">No weekly reviews yet. The first one opens once you tick a Sunday complete.</div>'
      : reviews.map(r=>
          '<div class="hist-review"><div class="hr-top">'+
          '<span>Week of '+prettyDate(r.week)+'</span>'+
          (r.change ? '<span class="hr-change">'+r.change.from+' &rarr; <strong>'+r.change.to+'</strong></span>'
                    : '<span class="hr-none">no change</span>')+'</div>'+
          '<div class="hr-text">'+r.text+'</div>'+
          (r.change ? '<div class="hr-why">'+r.change.why+'</div>' : '')+'</div>').join('');
    return;
  }

  back.style.display = s.level === 'year' ? 'none' : 'block';

  if(s.level === 'year'){
    crumb.textContent = s.year;
    let cells = '';
    for(let m=0;m<12;m++){
      const st = monthStats(s.year, m);
      const dim = st.days === 0 ? ' dim' : '';
      cells += '<button class="hist-cell'+dim+'" data-month="'+m+'">'+
        '<div class="hc-title">'+MONTH_NAMES[m].slice(0,3)+'</div>'+
        '<div class="hc-sub">'+(st.days ? st.days+' days' : '—')+'</div>'+
        '<div class="hc-val">'+(st.days ? fmt0(st.avg)+' avg' : '')+'</div></button>';
    }
    body.innerHTML = '<div class="hist-yearnav">'+
      '<button id="hist-prev-year"><i class="ti ti-chevron-left"></i></button>'+
      '<span>'+s.year+'</span>'+
      '<button id="hist-next-year"><i class="ti ti-chevron-right"></i></button></div>'+
      '<div class="hist-grid">'+cells+'</div>';
    document.getElementById('hist-prev-year').onclick = ()=>{ s.year--; renderHistory(); };
    document.getElementById('hist-next-year').onclick = ()=>{ s.year++; renderHistory(); };
    body.querySelectorAll('[data-month]').forEach(b=>{
      b.onclick = ()=>{ s.month = Number(b.dataset.month); s.level='month'; renderHistory(); };
    });
    return;
  }

  if(s.level === 'month'){
    crumb.textContent = MONTH_NAMES[s.month]+' '+s.year;
    const weeks = weeksInMonth(s.year, s.month);
    body.innerHTML = weeks.map(w=>{
      let kcal=0, days=0, tgt=0;
      for(let i=0;i<7;i++){
        const d = addDays(w,i);
        const ds = ymd(d);
        const k = getDailyIntake(ds);
        // confirmed days only, so the month view agrees with everything else
        if(k>0 && isDayComplete(ds)){ kcal+=k; days++; tgt += targetForDay(d); }
      }
      const end = addDays(w,6);
      const range = w.getDate()+' '+MONTH_NAMES[w.getMonth()].slice(0,3)+' – '+end.getDate()+' '+MONTH_NAMES[end.getMonth()].slice(0,3);
      const delta = days ? kcal - tgt : 0;
      const tone = !days ? '' : (delta>0 ? 'over' : 'under');
      return '<button class="hist-row" data-week="'+ymd(w)+'">'+
        '<div><div class="hr-name">'+range+'</div>'+
        '<div class="hr-meta">'+(days ? days+' of 7 days confirmed' : 'nothing logged')+'</div></div>'+
        '<div class="hr-right '+tone+'">'+(days ? fmt0(kcal/days)+'<span>avg/day</span>' : '')+'</div></button>';
    }).join('');
    body.querySelectorAll('[data-week]').forEach(b=>{
      b.onclick = ()=>{ s.weekStart = b.dataset.week; s.level='week'; renderHistory(); };
    });
    return;
  }

  if(s.level === 'week'){
    const w = parseYMD(s.weekStart);
    const end = addDays(w,6);
    crumb.textContent = w.getDate()+' '+MONTH_NAMES[w.getMonth()].slice(0,3)+' – '+end.getDate()+' '+MONTH_NAMES[end.getMonth()].slice(0,3);
    let rows = '';
    for(let i=0;i<7;i++){
      const d = addDays(w,i);
      const dstr = ymd(d);
      const k = getDailyIntake(dstr);
      const t = targetForDay(d);
      const dayName = d.toLocaleDateString(undefined,{weekday:'short'});
      // Scaled against the same ring the day screen uses, so a build day at
      // +200 does not render as a full red bar in one place and a healthy
      // green ring in the other.
      const hSt = calorieState(k, t, loadProfile().goal||'maintain', dstr < todayYMD());
      const pct = t ? Math.min(100, hSt.ringPct*100) : 0;
      const hCol = k>0 ? hSt.ringColor : 'var(--accent)';
      rows += '<button class="hist-row" data-day="'+ymd(d)+'">'+
        '<div><div class="hr-name">'+dayName+' '+d.getDate()+'</div>'+
        '<div class="hr-meta">'+(k>0 ? ('target '+fmt0(t)+(isDayComplete(dstr)?'':' &middot; <span style="color:var(--text3);">unconfirmed</span>')) : 'nothing logged')+'</div>'+
        '<div class="hr-bar"><div style="width:'+pct+'%; background:'+hCol+'"></div></div></div>'+
        '<div class="hr-right" style="color:'+(k>0?hSt.color:'var(--text3)')+';">'+(k>0 ? fmt0(k)+'<span>kcal</span>' : '')+'</div></button>';
    }
    body.innerHTML = rows;
    body.querySelectorAll('[data-day]').forEach(b=>{
      b.onclick = ()=>{ s.day = b.dataset.day; s.level='day'; renderHistory(); };
    });
    return;
  }

  if(s.level === 'day'){
    const d = parseYMD(s.day);
    crumb.textContent = d.toLocaleDateString(undefined,{weekday:'long', day:'numeric', month:'long'});
    const entries = loadEntries(d);
    const t = targetForDay(d);
    const tot = entries.reduce((a,e)=>a+e.kcal,0);
    const totP = entries.reduce((a,e)=>a+(e.protein||0),0);
    const totC = entries.reduce((a,e)=>a+(e.carbs||0),0);
    const totF = entries.reduce((a,e)=>a+(e.fat||0),0);
    if(entries.length === 0){
      body.innerHTML = '<div class="estate"><i class="ti ti-calendar-off" aria-hidden="true"></i><div class="et">Nothing logged on this day</div><div class="es">A day with no food in it is left out of your averages, so it cannot drag your target around.</div></div>';
      return;
    }
    const meals = {};
    entries.forEach(e=>{ (meals[e.meal||'Other'] = meals[e.meal||'Other'] || []).push(e); });
    const dComplete = isDayComplete(s.day);
    let html = '<div class="hist-daytop"><div><strong>'+fmt0(tot)+'</strong> of '+fmt0(t)+' kcal</div>'+
      '<div class="hd-macros">'+fmt0(totP)+'p &middot; '+fmt0(totC)+'c &middot; '+fmt0(totF)+'f</div></div>';
    html += '<button id="hist-complete" style="width:100%; background:'+(dComplete?'var(--accent-dim)':'var(--card)')+
      '; border:0.5px solid '+(dComplete?'var(--accent)':'var(--border)')+'; border-radius:12px; padding:11px 13px; margin:10px 0 14px; '+
      'display:flex; align-items:center; gap:10px; color:'+(dComplete?'var(--accent)':'var(--text2)')+'; text-align:left; font-size:12.5px;">'+
      '<span style="width:18px; height:18px; border-radius:5px; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:11px; '+
      'border:1.5px solid '+(dComplete?'var(--accent)':'var(--border)')+'; background:'+(dComplete?'var(--accent)':'transparent')+'; color:'+(dComplete?'#0b1a12':'transparent')+';">'+
      (dComplete?'<i class="ti ti-check"></i>':'')+'</span>'+
      '<span>'+(dComplete ? 'Confirmed complete — counting toward your averages'
                          : 'Not confirmed — this day is left out of your averages. Tap if you logged all of it.')+'</span></button>';
    // v113: every line knows where it sits in the day, so tapping it opens that
    // exact item - History used to be look-but-don't-touch.
    entries.forEach((e, i)=>{ if(e) e.__i = i; });
    html += '<button id="hist-editday" class="save-btn" style="margin:0 0 12px;">Edit this day</button>';
    for(const m of ['Breakfast','Lunch','Dinner','Snack','Other']){
      if(!meals[m]) continue;
      html += '<div class="hist-meal">'+m+'</div>';
      html += meals[m].map(e=>'<button class="hist-entry hist-entry-tap" data-histidx="'+e.__i+'"><span>'+esc(shownName(e.name, e))+
        (splitName(e.name, e).brand ? '<small class="hist-brand">'+esc(splitName(e.name, e).brand)+'</small>' : '')+'</span>'+
        '<span>'+fmt0(e.kcal)+' <i class="ti ti-chevron-right" aria-hidden="true" style="color:var(--text3); font-size:12px;"></i></span></button>').join('');
    }
    body.innerHTML = html;
    // Straight to that day on the day screen, where everything can be changed,
    // added to or deleted - the same screen as today, just on that date.
    const goDay = then=>{
      currentDate = parseYMD(s.day);
      closeSheet('hist-backdrop');
      try{ switchView('day'); }catch(err){ renderDay(); }
      try{ window.scrollTo(0, 0); }catch(err){}
      if(then) setTimeout(then, HANDOFF);
    };
    const ed = document.getElementById('hist-editday');
    if(ed) ed.onclick = ()=> goDay(null);
    body.querySelectorAll('[data-histidx]').forEach(b=>{
      b.onclick = ()=>{ const i = Number(b.dataset.histidx); goDay(()=>openFoodDetail(i)); };
    });
    const hc = document.getElementById('hist-complete');
    if(hc) hc.onclick = ()=>{
      setDayComplete(s.day, !isDayComplete(s.day));
      renderHistory();
      runAutoAdapt();
      renderDay();
      if(currentView==='week') renderWeek();
      if(isDayComplete(s.day) && showWeekEndReview(s.day)) closeSheet('hist-backdrop');
    };
    return;
  }
}

function histBack(){
  const s = histState;
  if(s.level === 'day') s.level = 'week';
  else if(s.level === 'week') s.level = 'month';
  else if(s.level === 'month') s.level = 'year';
  renderHistory();
}

function openHistory(){
  histState.level = 'year';
  histState.year = new Date().getFullYear();
  histState.tab = 'log';
  document.querySelectorAll('#hist-tabs .tab').forEach(t=>t.classList.toggle('active', t.dataset.htab==='log'));
  renderHistory();
  openSheet('hist-backdrop');
}

