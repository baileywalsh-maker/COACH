// ============================================================
// DATA — everything measured, over time
// ============================================================
let dataRange = 90;

// One pass over the window. Averages are built from CONFIRMED days only, the
// same rule the weekly review and the adaptive engine use: a day where dinner
// never got logged would otherwise drag every average down and make you look
// like you are eating less than you are.
function dataSeries(nDays){
  const out = [];
  const end = new Date(); end.setHours(0,0,0,0);
  for(let i = nDays - 1; i >= 0; i--){
    const d = addDays(end, -i);
    const ds = ymd(d);
    const kcal = getDailyIntake(ds);
    const m = getDailyMacros(ds);
    const v = dayVerdict(ds);
    let hyd = null; try{ const h = hydDay(d); hyd = {total: h.total, target: h.target, any: h.any}; }catch(e){}
    out.push({
      d, ds, kcal, protein: m.protein, carbs: m.carbs, fat: m.fat,
      water: waterMl(d), hyd: hyd, verdict: v,
      health: v.healthKnown ? v.health : null,
      complete: kcal > 0 && isDayComplete(ds),
      logged: kcal > 0,
      // v141: one rule for the Data cards that judge days - a day counts once
      // it is over or ticked complete (averages still use ticked days only).
      finished: kcal > 0 && (ds < todayYMD() || isDayComplete(ds))
    });
  }
  return out;
}

function dataSummary(nDays){
  const s = dataSeries(nDays);
  const conf = s.filter(x=>x.complete);
  const avg = (arr, f) => arr.length ? arr.reduce((a,x)=>a+f(x),0)/arr.length : null;
  const hDays = s.filter(x=>x.finished && x.health !== null);
  const wDays = s.filter(x=>x.water > 0 && (x.ds < todayYMD() || isDayComplete(x.ds)));
  const yDays = s.filter(x=>x.hyd && x.hyd.any && (x.ds < todayYMD() || isDayComplete(x.ds)));
  const log = loadWeightLog().filter(e=>{
    const d = parseYMD(e.date);
    return d >= addDays(new Date(), -(nDays-1)) && d <= new Date();
  });
  return {
    series: s, nDays,
    logged: s.filter(x=>x.logged).length,
    confirmed: conf.length,
    onTarget: s.filter(x=>x.verdict.all).length,
    avgKcal: avg(conf, x=>x.kcal),
    avgProtein: avg(conf, x=>x.protein),
    avgCarbs: avg(conf, x=>x.carbs),
    avgFat: avg(conf, x=>x.fat),
    avgHealth: hDays.length ? Math.round(avg(hDays, x=>x.health)) : null,
    healthDays: hDays.length,
    avgWater: wDays.length ? avg(wDays, x=>x.water)/1000 : null,
    waterDays: wDays.length,
    hydDays: yDays.length,
    avgHyd: yDays.length ? avg(yDays, x=>x.hyd.total)/1000 : null,
    avgHydTarget: yDays.length ? avg(yDays, x=>x.hyd.target)/1000 : null,
    hydHit: yDays.filter(x=>x.hyd.total >= x.hyd.target).length,
    finished: s.filter(x=>x.finished).length,
    weights: log,
    // A trend line, not the raw readings. Day-to-day weight is mostly water and
    // gut content; the smoothed line is the only part that means anything.
    trend: log.length >= 2 ? ewma(log.map(e=>e.kg), 0.25) : null,
    first: log.length ? log[0] : null,
    last: log.length ? log[log.length-1] : null
  };
}

// A line chart in plain SVG. No library, because the app is offline-first and
// one chart is not worth 60 KB of dependency.
function dataLine(points, opts){
  opts = opts || {};
  if(!points || points.length < 2) return '';
  const W = 320, H = opts.h || 84, pad = 4;
  const xs = points.map(p=>p.x), ys = points.map(p=>p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = opts.min !== undefined ? opts.min : Math.min(...ys);
  let y1 = opts.max !== undefined ? opts.max : Math.max(...ys);
  // A guide line the scale cannot reach gets drawn nowhere while the caption
  // still promises it. Stretch to include it: seeing how far off the goal is
  // IS the point of drawing the goal.
  if(opts.guide !== undefined && opts.min === undefined && opts.max === undefined){
    y0 = Math.min(y0, opts.guide);
    y1 = Math.max(y1, opts.guide);
  }
  if(y1 - y0 < 0.01){ y0 -= 1; y1 += 1; }
  // A little headroom, so the line never sits on the frame.
  const padY = (y1 - y0) * 0.12; y0 -= padY; y1 += padY;
  const px = v => pad + (x1 === x0 ? W/2 : (v - x0)/(x1 - x0) * (W - pad*2));
  const py = v => H - pad - (v - y0)/(y1 - y0) * (H - pad*2);
  const dPath = points.map((p,i)=>(i?'L':'M')+px(p.x).toFixed(1)+' '+py(p.y).toFixed(1)).join(' ');
  const area = dPath + ' L '+px(x1).toFixed(1)+' '+(H-pad)+' L '+px(x0).toFixed(1)+' '+(H-pad)+' Z';
  const col = opts.colour || 'var(--accent)';
  const id = 'g'+Math.random().toString(36).slice(2,7);
  return '<svg viewBox="0 0 '+W+' '+H+'" style="width:100%; height:'+H+'px; display:block;" '+
    'preserveAspectRatio="none" aria-hidden="true">'+
    '<defs><linearGradient id="'+id+'" x1="0" y1="0" x2="0" y2="1">'+
      '<stop offset="0%" stop-color="'+col+'" stop-opacity="0.22"/>'+
      '<stop offset="100%" stop-color="'+col+'" stop-opacity="0"/></linearGradient></defs>'+
    (opts.guide !== undefined && opts.guide >= y0 && opts.guide <= y1
      ? '<line x1="0" y1="'+py(opts.guide).toFixed(1)+'" x2="'+W+'" y2="'+py(opts.guide).toFixed(1)+
        '" stroke="var(--border)" stroke-width="1" stroke-dasharray="3 3"/>' : '')+
    '<path d="'+area+'" fill="url(#'+id+')"/>'+
    '<path d="'+dPath+'" fill="none" stroke="'+col+'" stroke-width="2" '+
      'stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>'+
    '</svg>';
}

// Past this many days, one bar per day is a hairline and the chart stops being
// readable - ninety 1-pixel columns is not information. Longer ranges group
// into weeks instead, coloured by how much of that week landed.
const DAY_BARS_MAX = 45;

function dayToneBars(series){
  if(series.length <= DAY_BARS_MAX){
    return '<div class="dt-bars">'+ series.map(x=>
      '<div style="height:'+(x.logged ? Math.max(18, x.verdict.met/3*100) : 8)+'%; background:'+
      VERDICT_COLOUR[x.verdict.tone]+'"></div>').join('') +'</div>'+
      '<div class="dt-ax"><span>'+prettyDate(series[0].ds)+'</span>'+
      '<span>'+prettyDate(series[series.length-1].ds)+'</span></div>';
  }
  // Whole weeks, ending on the most recent day so the last column is now.
  const weeks = [];
  for(let i = series.length; i > 0; i -= 7){
    const chunk = series.slice(Math.max(0, i-7), i);
    const logged = chunk.filter(x=>x.logged);
    const full = chunk.filter(x=>x.verdict.all).length;
    const frac = logged.length ? full/logged.length : 0;
    weeks.unshift({
      logged: logged.length, full, frac,
      from: chunk[0].ds, to: chunk[chunk.length-1].ds,
      tone: !logged.length ? 'none' : frac >= 0.66 ? 'good' : frac >= 0.33 ? 'part' : 'bad'
    });
  }
  return '<div class="dt-bars">'+ weeks.map(wk=>
      '<div style="height:'+(wk.logged ? Math.max(18, wk.frac*100) : 8)+'%; background:'+
      VERDICT_COLOUR[wk.tone]+'" title="'+esc(prettyDate(wk.from))+' \u2013 '+esc(prettyDate(wk.to))+
      ': '+wk.full+' of '+wk.logged+'"></div>').join('') +'</div>'+
    '<div class="dt-ax"><span>'+prettyDate(weeks[0].from)+'</span>'+
    '<span>by week \u00b7 '+prettyDate(weeks[weeks.length-1].to)+'</span></div>';
}

function renderData(){
  const box = document.getElementById('data-body');
  if(!box) return;
  const s = dataSummary(dataRange);
  const num = (v, dp) => v === null ? '\u2014' : (dp ? v.toFixed(dp) : fmt0(v));
  let html = '';

  // ---- weight ----
  const wp = s.weights.map(e=>({x: parseYMD(e.date).getTime(), y: e.kg}));
  const gw = goalWeight();
  const prog = goalWeightProgress();
  html += '<div class="dt-card">'+
    '<div class="dt-h"><span class="t">Weight</span><span class="s">'+
      (s.weights.length ? s.weights.length+' weigh-in'+(s.weights.length===1?'':'s') : 'nothing yet')+
    '</span></div>';
  if(wp.length < 2){
    html += '<div class="dt-empty">Two weigh-ins and the line appears.</div>';
  } else {
    // v137: against the plan, once there is enough to draw one.
    let wpm = null;
    try{ wpm = weightPathModel(s.weights, planRate()); }catch(e){ wpm = null; }
    const change = Math.round((s.last.kg - s.first.kg) * 10) / 10;
    html += '<div class="dt-stats">'+
      '<div><b>'+s.last.kg+'<span style="font-size:11px; color:var(--text3)"> kg</span></b><span>latest</span></div>'+
      '<div><b style="color:'+(change === 0 ? 'var(--text)' : weightDirColor(change))+'">'+
        (change>0?'+':'')+change.toFixed(1)+'</b><span>over '+s.nDays+' days</span></div>'+
      (wpm ? '<div><b>'+wpm.now.toFixed(1)+'</b><span>trend</span></div>' : s.trend !== null ? '<div><b>'+s.trend.toFixed(1)+'</b><span>trend</span></div>' : '')+
      (gw ? '<div><b>'+gw+'</b><span>goal</span></div>' : '')+
    '</div>';
    if(wpm){
      const ww = weightPathWord(wpm);
      html += '<div class="wp-word ' + ww.cls + '">' + ww.text + '</div>' + weightPathSVG(wpm) +
        '<div class="dt-legend"><span><i style="background:var(--accent); opacity:.4"></i>the plan: ' +
        (Math.abs(wpm.rate) < 0.01 ? 'hold steady' : (wpm.rate > 0 ? '+' : '\u2212') + Math.abs(wpm.rate).toFixed(2) + ' kg a week') +
        '</span><span><i style="background:var(--t1)"></i>your trend: ' + (wpm.weekly >= 0 ? '+' : '\u2212') + Math.abs(wpm.weekly).toFixed(2) + ' a week</span></div>';
    } else html += dataLine(wp, {colour:'var(--accent)', guide: gw || undefined, h:92});
    if(prog && Math.abs(prog.toGo) >= 0.15){
      html += '<div class="dt-legend"><span>'+
        (gw && !wpm ? '<i style="background:var(--border)"></i>dashed line is your '+gw+' kg goal \u00b7 ' : '')+
        Math.abs(prog.toGo)+' kg to '+(prog.toGo>0?'gain':'lose')+(gw && wpm ? ' to reach '+gw+' kg' : '')+'</span></div>';
    }
  }
  html += '</div>';

  // ---- how the days went ----
  // v135: today is not judged until it is over (or ticked complete) - half a
  // day of food was being counted as a missed target.
  const logged = s.series.filter(x=>x.finished);
  s.onTarget = logged.filter(x=>x.verdict.all).length;
  html += '<div class="dt-card">'+
    '<div class="dt-h"><span class="t">Days on target</span><span class="s">'+
      logged.length+' finished of '+s.nDays+'</span></div>';
  if(!logged.length){
    html += '<div class="dt-empty">Nothing logged in this window.</div>';
  } else {
    const pct = Math.round(s.onTarget/logged.length*100);
    html += '<div class="dt-stats">'+
      '<div><b style="color:'+(pct>=70?'var(--accent)':pct>=40?'var(--caution)':'var(--danger)')+'">'+
        s.onTarget+'<span style="font-size:11px; color:var(--text3)">/'+logged.length+'</span></b>'+
        '<span>all three</span></div>'+
      '<div><b>'+logged.filter(x=>x.verdict.cal).length+'</b><span>calories</span></div>'+
      '<div><b>'+logged.filter(x=>x.verdict.protein).length+'</b><span>protein</span></div>'+
      '<div><b>'+logged.filter(x=>x.verdict.quality).length+'</b><span>quality</span></div>'+
    '</div>'+
    dayToneBars(s.series)+
    '<div class="dt-legend">'+
      '<span><i style="background:var(--accent)"></i>all three</span>'+
      '<span><i style="background:var(--caution)"></i>two</span>'+
      '<span><i style="background:var(--danger)"></i>one or none</span>'+
      '<span><i style="background:var(--border)"></i>'+
        (s.series.length > DAY_BARS_MAX ? 'a week with nothing in it' : 'not logged')+'</span>'+
    '</div>';
  }
  html += '</div>';

  // ---- what you actually ate ----
  html += '<div class="dt-card">'+
    '<div class="dt-h"><span class="t">Averages</span><span class="s">'+
      s.confirmed+' confirmed day'+(s.confirmed===1?'':'s')+'</span></div>';
  if(!s.confirmed){
    html += '<div class="dt-empty">Only ticked-complete days count here. Tick a few and this fills in.</div>';
  } else {
    html += '<div class="dt-stats">'+
      '<div><b>'+num(s.avgKcal)+'</b><span>kcal a day</span></div>'+
      '<div><b style="color:var(--prot)">'+num(s.avgProtein)+'</b><span>protein g</span></div>'+
      '<div><b style="color:var(--carb)">'+num(s.avgCarbs)+'</b><span>carbs g</span></div>'+
      '<div><b style="color:var(--fat)">'+num(s.avgFat)+'</b><span>fat g</span></div>'+
    '</div>';
    const kp = s.series.filter(x=>x.complete).map(x=>({x:x.d.getTime(), y:x.kcal}));
    if(kp.length >= 2){
      // v129: the targets those days actually had, not today's base.
      const tks = s.series.filter(x=>x.complete).map(x=>judgedTarget(x.d));
      const avgTk = tks.reduce((a,b)=>a+b,0) / tks.length;
      const varies = Math.max(...tks) - Math.min(...tks) >= 25;
      html += dataLine(kp, {colour:'var(--accent)', guide: avgTk, h:70});
      html += '<div class="dt-legend"><span><i style="background:var(--border)"></i>dashed line is your '+
        (varies ? 'average target, ' : '') + fmtK(avgTk)+' kcal' + (varies ? ' (days ranged ' + fmtK(Math.min(...tks)) + '–' + fmtK(Math.max(...tks)) + ')' : ' target') + '</span></div>';
    }
  }
  html += '</div>';

  // ---- food quality ----
  html += '<div class="dt-card">'+
    '<div class="dt-h"><span class="t">Food quality</span><span class="s">'+
      s.healthDays+' day'+(s.healthDays===1?'':'s')+' scored</span></div>';
  if(s.healthDays < 2){
    html += '<div class="dt-empty">Days get a score once their food has label figures. Scanned packets have them.</div>';
  } else {
    const hp = s.series.filter(x=>x.finished && x.health !== null).map(x=>({x:x.d.getTime(), y:x.health}));
    html += '<div class="dt-stats">'+
      '<div><b style="color:'+scoreColour(scoreBand(s.avgHealth).cls)+'">'+s.avgHealth+'</b><span>average</span></div>'+
      '<div><b>'+healthFloor()+'</b><span>your floor</span></div>'+
      '<div><b>'+hp.filter(p=>p.y >= healthFloor()).length+'<span style="font-size:11px; color:var(--text3)">/'+
        hp.length+'</span></b><span>days over it</span></div>'+
    '</div>'+
    dataLine(hp, {colour:'var(--accent)', guide: healthFloor(), min:0, max:100, h:70})+
    '<div class="dt-legend"><span><i style="background:var(--border)"></i>dashed line is your '+
      healthFloor()+' floor</span></div>';
  }
  html += '</div>';

  // ---- the standing pattern over whatever range is selected ----
  const pat = patternTips(Math.min(90, s.nDays));
  const patHTML = tipsHTML(pat);
  if(patHTML){
    html += '<div class="dt-card"><div class="dt-h"><span class="t">What to change</span>'+
      '<span class="s">over '+pat.record.logged+' logged day'+(pat.record.logged===1?'':'s')+'</span></div>'+
      patHTML+'</div>';
  } else if(pat.thin){
    html += '<div class="dt-card"><div class="dt-h"><span class="t">What to change</span>'+
      '<span class="s">'+pat.record.logged+' logged</span></div>'+
      '<div class="dt-empty">Patterns show from four logged days.</div></div>';
  } else {
    html += '<div class="dt-card"><div class="dt-h"><span class="t">What to change</span>'+
      '<span class="s">over '+pat.record.logged+' logged days</span></div>'+
      '<div class="dt-empty">No problem patterns. Calories '+pat.record.cal+', protein '+pat.record.pro+
      ', quality '+pat.record.qual+' of '+pat.record.logged+' days.</div></div>';
  }

  // ---- hydration ----
  // v141: judged the way the day score judges it - water plus every drink,
  // each day against its own target (training days get +0.5 L).
  html += '<div class="dt-card">'+
    '<div class="dt-h"><span class="t">Hydration</span><span class="s">'+
      s.hydDays+' day'+(s.hydDays===1?'':'s')+' recorded</span></div>'+
    (s.avgHyd === null
      ? '<div class="dt-empty">Nothing recorded in this window.</div>'
      : '<div class="dt-stats">'+
        '<div><b style="color:#4aa8d6">'+num(s.avgHyd,1)+'<span style="font-size:11px; color:var(--text3)"> L</span></b>'+
        '<span>a day</span></div>'+
        '<div><b>'+num(s.avgHydTarget,1)+'</b><span>target L</span></div>'+
        '<div><b>'+s.hydHit+'<span style="font-size:11px; color:var(--text3)">/'+s.hydDays+'</span></b><span>days hit</span></div>'+
      '</div>'+
      (s.avgWater !== null ? '<div class="dt-legend"><span>Plain water: '+num(s.avgWater,1)+' L a day \u00b7 '+s.waterDays+' day'+(s.waterDays===1?'':'s')+' logged</span></div>' : ''))+
  '</div>';

  box.innerHTML = html;
}


// ---- weight history ----
function renderWeightHistory(){
  renderMissedWeighDays();
  const log = loadWeightLog().slice().reverse();
  const box = document.getElementById('whist-list');
  if(!log.length){
    box.innerHTML = '<div style="font-size:13px; color:var(--text3); padding:14px 0;">No weigh-ins logged yet.</div>';
    return;
  }
  box.innerHTML = log.map((e,i)=>{
    const prev = log[i+1];
    let delta = '';
    if(prev){
      const d = e.kg - prev.kg;
      const col = weightDirColor(d);
      delta = '<span style="font-size:12px; color:'+col+';">'+(d>0?'+':'')+d.toFixed(1)+'</span>';
    }
    return '<button data-wd="'+e.date+'" style="width:100%; display:flex; align-items:center; justify-content:space-between; '+
      'background:none; border:none; border-bottom:0.5px solid var(--border); padding:11px 2px; color:var(--text); text-align:left;">'+
      '<span style="font-size:13px; color:var(--text2);">'+prettyDate(e.date)+'</span>'+
      '<span style="display:flex; align-items:center; gap:10px;">'+delta+
      '<span style="font-size:15px; font-weight:600;">'+e.kg+'kg</span></span></button>';
  }).join('');
  box.querySelectorAll('[data-wd]').forEach(b=>{
    b.onclick = ()=> openWeightEdit(b.dataset.wd);
  });
}

let editingWeighDate = null;
function openWeightEdit(dateStr){
  editingWeighDate = dateStr;
  const e = loadWeightLog().find(x=>x.date===dateStr);
  document.getElementById('wedit-title').textContent = prettyDate(dateStr);
  document.getElementById('wedit-input').value = e ? e.kg : '';
  document.getElementById('wedit-err').style.display = 'none';
  openSheet('wedit-backdrop');
}

document.getElementById('whist-add').onclick = ()=>{
  const v = document.getElementById('whist-date').value;
  if(!v) return;
  if(v > todayYMD()){ alert('That day has not happened yet.'); return; }
  closeSheet('whist-backdrop');
  setTimeout(()=>openWeighIn(v, false, 'history'), HANDOFF);
};

document.getElementById('weighin-history').onclick = ()=>{
  closeSheet('weighin-backdrop');
  setTimeout(()=>{ renderWeightHistory(); openSheet('whist-backdrop'); }, HANDOFF);
};
document.getElementById('whist-close').onclick = ()=> closeSheet('whist-backdrop');

document.getElementById('wedit-save').onclick = ()=>{
  const v = Number(document.getElementById('wedit-input').value);
  const err = document.getElementById('wedit-err');
  if(!v || v<=0 || v>400){ err.textContent='Enter a valid weight'; err.style.display='block'; return; }
  const warn = weightLooksWrong(v, editingWeighDate);
  if(warn && !confirm(warn)) return;
  pushWeight(v, editingWeighDate);
  syncProfileWeight();
  closeSheet('wedit-backdrop');
  setTimeout(renderWeightHistory, 200);
  runAutoAdapt(); renderDay(); if(currentView==='week') renderWeek();
};

document.getElementById('wedit-delete').onclick = ()=>{
  if(!confirm('Delete the weigh-in for '+prettyDate(editingWeighDate)+'?')) return;
  removeWeight(editingWeighDate);
  syncProfileWeight();
  closeSheet('wedit-backdrop');
  setTimeout(renderWeightHistory, 200);
  runAutoAdapt(); renderDay(); if(currentView==='week') renderWeek();
};

// Profile weight should always mirror the newest reading in the log.
function syncProfileWeight(){
  const log = loadWeightLog();
  if(!log.length) return;
  const p = loadProfile();
  p.weight = log[log.length-1].kg;
  saveProfile(p);
}

document.querySelectorAll('#weighin-steps [data-wstep]').forEach(b=>{
  b.onclick = ()=>{
    const inp = document.getElementById('weighin-input');
    const v = Number(inp.value) || 0;
    if(!v) return;
    inp.value = (Math.round((v + Number(b.dataset.wstep)) * 10) / 10).toFixed(1);
    try{ tick(); }catch(e){}
  };
});
document.getElementById('weighin-save').onclick = ()=>{
  const v = Number(document.getElementById('weighin-input').value);
  const err = document.getElementById('weighin-err');
  if(!v || v<=0 || v>400){
    err.textContent = 'Enter a valid weight';
    err.style.display='block';
    return;
  }
  const forDate = weighinDate || todayYMD();
  const warn = weightLooksWrong(v, forDate);
  if(warn && !confirm(warn)) return;
  err.style.display='none';
  pushWeight(v, forDate);
  // only the most recent reading represents "current weight"
  const log = loadWeightLog();
  if(log.length && log[log.length-1].date === forDate){
    const p = loadProfile();
    p.weight = v;
    saveProfile(p);
  }
  // Filling in last Tuesday is not this morning's weigh-in, so it must not
  // count as having been asked today.
  if(forDate === todayYMD()) lsSet(LASTPROMPT_KEY, todayYMD());
  document.getElementById('weighin-input').value='';
  closeSheet('weighin-backdrop');
  // Back to the list if that is where you came from, so a run of missed days
  // can be filled in without reopening it each time.
  if(weighinFrom === 'history'){
    setTimeout(()=>{ renderWeightHistory(); openSheet('whist-backdrop'); }, HANDOFF);
  }
  weighinFrom = null;
  runAutoAdapt();
  renderDay();
  renderStreak();
  if(currentView==='week') renderWeek();
};
document.getElementById('weighin-skip').onclick = ()=>{
  lsSet(LASTPROMPT_KEY, todayYMD());
  closeSheet('weighin-backdrop');
};

renderWeek = function(){ _origRenderWeek(); renderBudget(); renderWeightTrend(); renderExpenditure(); renderAdaptive(); markTrainingDays(); renderScoreboard(); };

