/* ============================================================
   v137 - the week as a scoreboard.
   A day counts when calories, protein and quality all land. The Week tab only
   drew calorie bars, so which of the three slipped, and on which day, took a
   tap into every day to find out. One box per measure per day, plus water and
   the day score. Today is only judged once it is ticked complete.
   ============================================================ */
function scoreboardModel(now){
  const today = new Date(now || new Date()); today.setHours(0,0,0,0);
  const ws = weekStart(today);
  const days = [];
  let judged = 0, all = 0;
  for(let i = 0; i < 7; i++){
    const d = addDays(ws, i), ds = ymd(d);
    const future = d > today, isToday = d.getTime() === today.getTime();
    const o = {ds: ds, letter: d.toLocaleDateString(undefined, {weekday: 'narrow'}), today: isToday, future: future,
               cal: 'none', protein: 'none', quality: 'none', water: 'none', score: null};
    if(!future){
      const v = dayVerdict(ds), done = isDayComplete(ds);
      const live = isToday && !done;
      const h = hydDay(d);
      const waterHit = h.total >= h.target;
      if(v.logged){
        // Today, before it is ticked: a box lights as soon as it is reached, and
        // otherwise waits. Calories and quality can still move, so they wait.
        o.cal = live ? 'live' : v.cal ? 'hit' : 'miss';
        o.protein = v.protein ? 'hit' : live ? 'live' : 'miss';
        o.quality = live ? 'live' : !v.healthKnown ? 'none' : v.quality ? 'hit' : 'miss';
        if(!live){ judged++; if(v.all) all++; try{ o.score = dayScoreParts(ds).score; }catch(e){} }
      } else if(live){ o.cal = o.protein = o.quality = 'live'; }
      o.water = waterHit ? 'hit' : live ? 'live' : (h.any ? 'miss' : 'none');
    }
    days.push(o);
  }
  return {days: days, judged: judged, all: all};
}
function renderScoreboard(){
  const box = document.getElementById('wk-board');
  if(!box) return;
  const m = scoreboardModel();
  const row = (label, k)=>'<span class="wkb-r">' + label + '</span>' +
    m.days.map((d, i)=>'<button class="wkb-c ' + d[k] + '" data-i="' + i + '" aria-label="' + label + ' ' + d.ds + '"></button>').join('');
  box.innerHTML =
    '<div class="wkb-h"><span class="t">This week</span><span class="s">' +
      (m.judged ? m.all + ' of ' + m.judged + ' day' + (m.judged === 1 ? '' : 's') + ' hit all three' : 'no finished days yet') + '</span></div>' +
    '<div class="wkb-grid"><span></span>' +
      m.days.map(d=>'<span class="wkb-d' + (d.today ? ' today' : '') + '">' + d.letter + '</span>').join('') +
      row('Calories', 'cal') + row('Protein', 'protein') + row('Quality', 'quality') + row('Hydration', 'water') +
      '<span class="wkb-r">Score</span>' +
      m.days.map(d=>'<span class="wkb-s' + (d.score === null ? ' dim' : '') + '">' + (d.score === null ? '–' : Math.round(d.score)) + '</span>').join('') +
    '</div>' +
    '<div class="wkb-leg"><span><i class="hit"></i>Hit</span><span><i class="miss"></i>Missed</span><span><i class="live"></i>Today, still open</span></div>';
  box.querySelectorAll('.wkb-c').forEach(b=>{
    b.onclick = ()=>{
      const d = m.days[Number(b.dataset.i)];
      if(d.future) return;
      currentDate = parseYMD(d.ds);
      switchView('day');
    };
  });
}
