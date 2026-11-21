/* =====================================================================
   v150: one-time import of your Hevy history.

   In Hevy: Profile > Settings > Export & Import Data > Export workouts.
   That saves a CSV file. In COACH: Train > History > Import from Hevy,
   and pick that file. Everything stays on the phone (the file is read
   here; nothing is sent anywhere).

   Also reads Hevy's JSON (the API's workout shape), in case a file comes
   that way.

   Safe to run again: a workout that starts in the same minute as one you
   already have is skipped, so nothing doubles up and nothing is replaced.
   New keys only: workouts go in coachtrain:w:<id> like any other, and the
   list (coachtrain:idx) is merged, never rebuilt from scratch.
   ===================================================================== */

// Hevy names that COACH calls something else. Anything not here and not in
// the library becomes one of your own exercises.
const HEVY_NAMES = {
  'Seated Incline Curl (Dumbbell)': 'Incline Curl (Dumbbell)',
  'Seated Shoulder Press (Machine)': 'Shoulder Press (Machine)'
};
const HEVY_SET_TYPE = {warmup: 'w', normal: 'n', dropset: 'd', failure: 'f'};

// CSV with quotes, commas and line breaks inside quoted cells.
function hevyParseCSV(text){
  const rows = []; let row = [], cell = '', q = false;
  text = String(text || '').replace(/^﻿/, '');
  for(let i = 0; i < text.length; i++){
    const c = text[i];
    if(q){
      if(c === '"'){ if(text[i + 1] === '"'){ cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if(c === '"') q = true;
    else if(c === ','){ row.push(cell); cell = ''; }
    else if(c === '\n' || c === '\r'){
      if(c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = ''; if(row.some(x => x !== '')) rows.push(row); row = [];
    } else cell += c;
  }
  row.push(cell); if(row.some(x => x !== '')) rows.push(row);
  return rows;
}
const HEVY_MON = {jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11};
// "19 Nov 2026, 14:28" (Hevy's CSV, local time) or an ISO time (JSON).
function hevyTime(s){
  s = String(s || '').trim(); if(!s) return 0;
  const m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4}),?\s+(\d{1,2}):(\d{2})/);
  if(m && HEVY_MON[m[2].toLowerCase()] != null) return new Date(+m[3], HEVY_MON[m[2].toLowerCase()], +m[1], +m[4], +m[5]).getTime();
  const t = Date.parse(s); return isNaN(t) ? 0 : t;
}
const hevyNum = v => { if(v === '' || v == null) return null; const n = Number(String(v).replace(',', '.')); return isFinite(n) ? n : null; };

// Turn a file's text into plain workouts: {title, start, end, desc, ex:[{n, note, sets:[{t,kg,reps,km,sec}]}]}
function hevyRead(text){
  const t = String(text || '').trim();
  if(t[0] === '{' || t[0] === '['){
    let j = JSON.parse(t); const list = Array.isArray(j) ? j : (j.workouts || []);
    return list.map(w => ({title: w.title || 'Workout', start: hevyTime(w.start_time), end: hevyTime(w.end_time), desc: w.description || '',
      ex: (w.exercises || []).map(e => ({n: e.title, note: e.notes || '', sets: (e.sets || []).map(s => ({
        t: HEVY_SET_TYPE[s.type] || 'n', kg: s.weight_kg, reps: s.reps,
        km: s.distance_meters != null ? s.distance_meters / 1000 : null, sec: s.duration_seconds}))}))}));
  }
  const rows = hevyParseCSV(t); if(rows.length < 2) return [];
  const head = rows[0].map(h => h.trim().toLowerCase());
  const col = n => head.indexOf(n);
  const C = {title: col('title'), start: col('start_time'), end: col('end_time'), desc: col('description'), ex: col('exercise_title'),
    note: col('exercise_notes'), type: col('set_type'), kg: col('weight_kg'), lbs: col('weight_lbs'), reps: col('reps'),
    km: col('distance_km'), mi: col('distance_miles'), m: col('distance_meters'), sec: col('duration_seconds')};
  if(C.start < 0 || C.ex < 0) throw new Error('not a Hevy export');
  const byKey = new Map(), out = [];
  rows.slice(1).forEach(r => {
    const g = i => i >= 0 ? (r[i] || '') : '';
    const key = g(C.title) + '|' + g(C.start) + '|' + g(C.end);
    let w = byKey.get(key);
    if(!w){ w = {title: g(C.title) || 'Workout', start: hevyTime(g(C.start)), end: hevyTime(g(C.end)), desc: g(C.desc), ex: []}; byKey.set(key, w); out.push(w); }
    const name = g(C.ex).trim(); if(!name) return;
    let e = w.ex[w.ex.length - 1];
    if(!e || e.n !== name){ e = {n: name, note: g(C.note), sets: []}; w.ex.push(e); }
    let kg = hevyNum(g(C.kg)); if(kg == null && C.lbs >= 0 && hevyNum(g(C.lbs)) != null) kg = Math.round(hevyNum(g(C.lbs)) * 0.45359237 * 100) / 100;
    let km = hevyNum(g(C.km)); if(km == null && hevyNum(g(C.mi)) != null) km = hevyNum(g(C.mi)) * 1.609344; if(km == null && hevyNum(g(C.m)) != null) km = hevyNum(g(C.m)) / 1000;
    e.sets.push({t: HEVY_SET_TYPE[g(C.type).trim().toLowerCase()] || 'n', kg, reps: hevyNum(g(C.reps)), km, sec: hevyNum(g(C.sec))});
  });
  return out;
}

// What kind of exercise a set list looks like, for names COACH doesn't know.
function hevyKind(sets){
  if(sets.some(s => s.km)) return 'c';
  if(sets.some(s => s.kg > 0 && s.reps)) return 'w';
  if(sets.some(s => s.reps)) return 'b';
  if(sets.some(s => s.sec)) return 't';
  return 'w';
}

// Save them. Returns {added, skipped, made: [new exercise names], days}.
function hevyImport(text){
  const list = hevyRead(text).filter(w => w.start && w.ex.length).sort((a, b) => a.start - b.start);
  trLib();
  const idx = trIdx();
  const haveMin = new Set(idx.map(x => Math.floor((x.s || 0) / 60000)));
  const custom = trJSON(TR_CUSTOM, []); const made = [];
  const nameOf = (n, sets) => {
    n = HEVY_NAMES[n] || n;
    if(TR_BY.has(n)) return n;
    if(!custom.find(c => c.n === n)){ const t = hevyKind(sets); custom.push({n, e: t === 'b' ? 'Bodyweight' : 'Other', p: 'Other', t}); made.push(n); }
    return n;
  };
  // Running bests per exercise, so the trophies land on the sets that really were new bests.
  const best = {}; trIdx().forEach(x => { const w = trLoadW(x.id); if(w) w.ex.forEach(e => e.sets.forEach(s => {
    best[e.n] = Math.max(best[e.n] || 0, trE1rm(s.kg, s.reps)); })); });
  let added = 0, skipped = 0; const days = new Set();
  list.forEach(h => {
    if(haveMin.has(Math.floor(h.start / 60000))){ skipped++; return; }
    const d = ymd(new Date(h.start));
    const id = 'hevy' + h.start.toString(36);
    const w = {id, name: h.title, d, start: h.start, end: h.end || h.start, rt: null, src: 'hevy', ex: h.ex.map(e => {
      const n = nameOf(e.n, e.sets);
      return {n, note: e.note || '', sets: e.sets.map(s => {
        const o = {t: s.t || 'n', done: true};
        if(s.kg != null) o.kg = Math.round(s.kg * 100) / 100;
        if(s.reps != null) o.reps = s.reps;
        if(s.km != null && s.km > 0) o.km = Math.round(s.km * 1000) / 1000;
        if(s.sec != null && s.sec > 0) o.sec = s.sec;
        if(o.t !== 'w'){ const e1 = trE1rm(o.kg, o.reps); if(e1 > 0 && best[n] > 0 && e1 > best[n]) o.pr = 1; if(e1 > (best[n] || 0)) best[n] = e1; }
        return o; })};
    })};
    if(h.desc) w.note = h.desc;
    trSave(TR_W + id, w);
    const st = trWorkoutStats(w);
    idx.push({id, d, s: w.start, n: w.name, v: st.vol, k: st.sets, m: st.mins, x: w.ex.map(e => e.n)});
    haveMin.add(Math.floor(h.start / 60000)); days.add(d); added++;
  });
  if(made.length) trSave(TR_CUSTOM, custom);
  if(added){
    idx.sort((p, q) => p.s - q.s); trSave(TR_IDX, idx);
    days.forEach(d => { try{ if(!isTrainingDay(d)) setTrainingDay(d, true); }catch(e){} });
    TR_LIB = null; trUsageCache = null;
    try{ dataEpoch++; scoreEpoch++; logEpoch++; }catch(e){}
  }
  return {added, skipped, made, days: days.size};
}

// The card at the top of Train > History.
function hevyCardHTML(){
  const done = trIdx().some(x => String(x.id).indexOf('hevy') === 0);
  return '<div class="tr-card" id="hevy-card" style="padding:14px 16px;">' +
    '<div class="tr-row" style="padding:0;"><span><b>' + (done ? 'Hevy history imported' : 'Bring in your Hevy history') + '</b></span>' +
    '<button class="tr-pill' + (done ? '' : ' solid') + '" id="hevy-pick">' + (done ? 'Import again' : 'Import from Hevy') + '</button></div>' +
    '<div class="tr-mini" id="hevy-msg" style="margin-top:6px;">' + (done ? 'Safe to run again: workouts you already have are skipped.' :
      'In Hevy: Settings › Export & Import Data › Export workouts. Then pick that file here.') + '</div>' +
    '<input type="file" id="hevy-file" accept=".csv,.json,text/csv,application/json,text/plain" style="display:none;"></div>';
}
function hevyBindCard(box){
  const pick = box.querySelector('#hevy-pick'), file = box.querySelector('#hevy-file'), msg = box.querySelector('#hevy-msg');
  if(!pick || !file) return;
  pick.onclick = () => file.click();
  file.onchange = () => {
    const f = file.files && file.files[0]; if(!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try{
        const r = hevyImport(rd.result);
        msg.textContent = r.added ? 'Added ' + r.added + ' workout' + (r.added === 1 ? '' : 's') + ' (' + r.days + ' training day' + (r.days === 1 ? '' : 's') + ')' +
          (r.skipped ? ', skipped ' + r.skipped + ' you already had' : '') + (r.made.length ? '. New exercises: ' + r.made.join(', ') : '') + '.'
          : (r.skipped ? 'Nothing new: all ' + r.skipped + ' are already here.' : 'No workouts found in that file.');
        if(r.added){ try{ sfx('dayDone'); }catch(e){} setTimeout(() => { trRefresh(); try{ renderDay(); }catch(e){} }, 1200); }
      }catch(e){ msg.textContent = 'That file isn’t a Hevy export. Use Export workouts in Hevy’s settings.'; }
      file.value = '';
    };
    rd.readAsText(f);
  };
}
