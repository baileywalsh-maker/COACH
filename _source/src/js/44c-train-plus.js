/* =====================================================================
   v151: routines rebuilt.

   1. Routine page: a score out of 10, today's target for each exercise,
      ranks, and tips with one-tap fixes when the score is under 8.
   2. Routine editor: hold and drag to reorder, sets and rest per exercise.
   3. Gyms: machines and cables weigh differently at every gym. Bests,
      "previous" numbers and ranks for those use the gym you're at. The
      first time you do an exercise (per gym for machines, once ever for
      free weights) COACH asks you to confirm your best.
   4. Pictures: start and end positions from Free Exercise DB (public
      domain, github.com/yuhonas/free-exercise-db), looped like a clip,
      plus how-to steps, loaded when you open an exercise.
   5. Your week: sets per muscle across all routines.
   6. Workout feedback on the finish screen: session score, next time,
      vs last time, your balance.

   Research behind the scores (kept short in the app):
   - 10-20 hard sets per muscle a week (Schoenfeld 2017; Pelland 2024).
   - Rest over 90 s gives no extra growth (Singer 2024): 2 min default.
   - Reps 5-30 build muscle when sets go close to or to failure.
   - Bailey's own rules: trains to failure, short sessions (25-50 min),
     3-5 sessions a week.

   New keys only: coachtrain:gyms. Workouts get a `gym` field. Routine
   exercises may get `rest`. Everything syncs with Muse (coach* keys).
   ===================================================================== */

const TR_GYM = 'coachtrain:gyms';
const TR_IMG = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
const TR_IMG_EXTRA = {'Knee Raise Parallel Bars': 'Knee_Hip_Raise_On_Parallel_Bars'};

/* ---------- pictures ---------- */
function trImgId(name){ const x = trEx(name); return x.img || TR_IMG_EXTRA[name] || ''; }
function trThumb(name){
  const id = trImgId(name);
  if(!id) return '<div class="rx-th rx-th0">' + esc(TR_EQ_ICON[trEx(name).e] || '•') + '</div>';
  return '<div class="rx-th"><img loading="lazy" alt="" src="' + TR_IMG + id + '/0.jpg" onerror="this.parentNode.classList.add(\'rx-th0\');this.remove();">' +
    '<span class="rx-play"><svg width="7" height="7" viewBox="0 0 10 10"><path d="M2 1l7 4-7 4z" fill="#fff"/></svg></span></div>';
}
const trHowCache = {};
function trHowTo(name, box){
  const id = trImgId(name); if(!id || !box) return;
  const show = steps => { box.innerHTML = steps && steps.length ? '<div class="section-title">HOW TO</div><ol class="rx-steps">' + steps.map(s => '<li>' + esc(s) + '</li>').join('') + '</ol>' : ''; };
  if(trHowCache[id]) return show(trHowCache[id]);
  fetch(TR_IMG + id + '.json').then(r => r.ok ? r.json() : null).then(j => { if(j && Array.isArray(j.instructions)){ trHowCache[id] = j.instructions; show(j.instructions); } }).catch(() => {});
}
function trClipHTML(name){
  const id = trImgId(name); if(!id) return '';
  return '<div class="rx-clip"><img src="' + TR_IMG + id + '/0.jpg" alt=""><img class="b" src="' + TR_IMG + id + '/1.jpg" alt="" onerror="this.remove()"></div>';
}

/* ---------- gyms ---------- */
function trGyms(){
  const g = trJSON(TR_GYM, null) || {};
  if(!Array.isArray(g.list) || !g.list.length) g.list = [{id: 'g1', name: 'My gym'}];
  if(!g.cur || !g.list.some(x => x.id === g.cur)) g.cur = g.list[0].id;
  g.best = g.best || {}; g.asked = g.asked || {};
  return g;
}
function trGymSave(g){ trSave(TR_GYM, g); }
function trGymCur(){ return trGyms().cur; }
function trGymName(){ const g = trGyms(); return (g.list.find(x => x.id === g.cur) || {}).name || 'My gym'; }
// Machines, cables and smith machines weigh differently gym to gym.
function trMachineLike(name){ const x = trEx(name); return x.e === 'Machine' || x.e === 'Cable' || /Smith Machine/.test(name); }
function trGymKey(name){ return trMachineLike(name) ? trGymCur() : 'all'; }
function trGymBase(name){ return (trGyms().best[trGymKey(name)] || {})[name] || null; }
// The history that counts for this exercise right now.
function trGymHistory(name, excludeId){
  let hist = trHistoryOf(name).filter(h => h.id !== excludeId);
  if(trMachineLike(name)){ const cur = trGymCur(); hist = hist.filter(h => h.gym === cur); }
  const base = trGymBase(name);
  if(base && base.how !== 'same') hist = hist.filter(h => (h.start || 0) >= (base.at || 0));
  if(base && base.kg != null && base.how !== 'today') hist = hist.concat([{id: 'base', d: base.d || '', start: base.at || 0, base: true, sets: [{t: 'n', kg: base.kg, reps: base.reps, done: true}]}]);
  return hist;
}
// Does this exercise need its best confirmed before you lift?
function trGymNeeds(name){
  const x = trEx(name); if(x.t !== 'w' && x.t !== 'b') return false;
  const g = trGyms(), key = trGymKey(name);
  if((g.best[key] || {})[name]) return false;
  if(trMachineLike(name)) return !trHistoryOf(name).some(h => h.gym === g.cur);
  return !g.asked[name];
}
function trBestSetEver(name){
  let best = null, e1 = 0;
  trHistoryOf(name).forEach(h => h.sets.forEach(s => { const v = trE1rm(s.kg, s.reps) || (Number(s.reps) || 0) / 100; if(v > e1){ e1 = v; best = {kg: s.kg, reps: s.reps, d: h.d}; } }));
  return best;
}
// One sheet for every exercise that needs it.
let trGymQ = null;
function trGymAsk(names, done){
  const list = [...new Set(names)].filter(trGymNeeds);
  if(!list.length){ if(done) done(); return; }
  trGymQ = {rows: list.map(n => { const rec = trBestSetEver(n), mach = trMachineLike(n);
    return {n, rec, mach, how: rec ? (mach ? 'set' : 'same') : 'today', kg: rec ? rec.kg : '', reps: rec ? rec.reps : ''}; }), done};
  trGymRender(); openSheet('tr-gym-backdrop');
}
function trGymRender(){
  const q = trGymQ; if(!q) return;
  const dd = d => d ? asDate(d).toLocaleDateString('en-GB', {day: 'numeric', month: 'short'}) : '';
  let h = '<div class="rx-gym" id="tr-gym-name">📍 ' + esc(trGymName()) + '</div><h3 style="margin:0 0 4px;">' + (q.rows.length === 1 ? 'First time: ' + esc(q.rows[0].n) : 'Check your bests') + '</h3>' +
    '<p class="tr-mini" style="font-size:13.5px; margin:0 0 12px;">Machines and cables weigh differently at every gym, so COACH asks once per gym for those, and once ever for free weights.</p>';
  q.rows.forEach((r, i) => {
    h += '<div class="rx-ask"><div class="rx-ask-h">' + trThumb(r.n) + '<div><b>' + esc(r.n) + '</b><div class="tr-mini">' +
      (r.rec ? 'Best on record: ' + fmtKg(r.rec.kg || 0) + ' kg × ' + r.rec.reps + ' (' + dd(r.rec.d) + (r.mach ? ', maybe another gym' : '') + ')' : 'No best on record yet') + '</div></div></div>' +
      '<div class="rx-seg">' + (r.rec ? '<button data-gh="' + i + ':same" class="' + (r.how === 'same' ? 'on' : '') + '">Same</button>' : '') +
      '<button data-gh="' + i + ':set" class="' + (r.how === 'set' ? 'on' : '') + '">My best here</button><button data-gh="' + i + ':today" class="' + (r.how === 'today' ? 'on' : '') + '">Find it today</button></div>' +
      (r.how === 'set' ? '<div class="rx-in"><label><small>KG</small><input inputmode="decimal" data-gk="' + i + ':kg" value="' + esc(String(r.kg == null ? '' : r.kg)) + '"></label><label><small>REPS</small><input inputmode="numeric" data-gk="' + i + ':reps" value="' + esc(String(r.reps == null ? '' : r.reps)) + '"></label></div>' : '') +
      '</div>';
  });
  h += '<button class="save-btn" id="tr-gym-ok">Save</button>';
  const body = document.getElementById('tr-gym-body'); body.innerHTML = h;
  body.querySelectorAll('[data-gh]').forEach(b => b.onclick = () => { const [i, how] = b.dataset.gh.split(':'); q.rows[+i].how = how; trGymRender(); });
  body.querySelectorAll('[data-gk]').forEach(inp => inp.oninput = () => { const [i, k] = inp.dataset.gk.split(':'); q.rows[+i][k] = inp.value; });
  body.querySelector('#tr-gym-ok').onclick = () => {
    const g = trGyms(), now = Date.now();
    q.rows.forEach(r => {
      const key = r.mach ? g.cur : 'all';
      const o = {how: r.how, at: now, d: todayYMD()};
      if(r.how === 'same' && r.rec){ o.kg = Number(r.rec.kg) || 0; o.reps = Number(r.rec.reps) || 0; }
      if(r.how === 'set'){ const kg = parseFloat(String(r.kg).replace(',', '.')), reps = parseInt(r.reps, 10); if(kg >= 0 && reps > 0){ o.kg = kg; o.reps = reps; } else o.how = 'today'; }
      (g.best[key] = g.best[key] || {})[r.n] = o;
      if(!r.mach) g.asked[r.n] = 1;
    });
    trGymSave(g); trUsageCache = null;
    const d = q.done; trGymQ = null; closeSheet('tr-gym-backdrop'); trRefresh(); if(d) setTimeout(d, HANDOFF);
  };
}
// The gym chip on the Workout tab.
function trGymMenu(){
  const g = trGyms();
  const items = g.list.filter(x => x.id !== g.cur).map(x => ['Switch to ' + x.name, () => { const h = trGyms(); h.cur = x.id; trGymSave(h); trRefresh(); }]);
  items.push(['Rename “' + trGymName() + '”', () => { const n = prompt('Gym name', trGymName()); if(n && n.trim()){ const h = trGyms(); h.list.find(x => x.id === h.cur).name = n.trim().slice(0, 30); trGymSave(h); trRefresh(); } }]);
  items.push(['Add a gym', () => { const n = prompt('New gym name'); if(n && n.trim()){ const h = trGyms(); const id = 'g' + trUid(); h.list.push({id, name: n.trim().slice(0, 30)}); h.cur = id; trGymSave(h); trRefresh(); } }]);
  trMenu(items);
}

/* ---------- muscles and targets ---------- */
const TR_GROUP = {Chest: 'Chest', Shoulders: 'Shoulders', Biceps: 'Biceps', Triceps: 'Triceps', Lats: 'Back', 'Upper Back': 'Back', 'Lower Back': 'Back',
  Traps: 'Traps', Neck: 'Traps', Quads: 'Quads', Hamstrings: 'Hamstrings', Glutes: 'Glutes', Abductors: 'Glutes', Adductors: 'Quads', Calves: 'Calves', Abs: 'Abs', Forearms: 'Forearms'};
const TR_GROUPS = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Traps', 'Abs'];
// One good extra per muscle (first one not already in the routine wins).
const TR_SUGGEST = {Chest: ['Chest Fly (Machine)', 'Incline Bench Press (Dumbbell)', 'Cable Fly Crossovers'], Back: ['Seated Cable Row - V Grip (Cable)', 'Lat Pulldown (Cable)', 'Chest Supported Row (Machine)'],
  Shoulders: ['Lateral Raise (Cable)', 'Lateral Raise (Dumbbell)', 'Rear Delt Reverse Fly (Cable)'], Biceps: ['Hammer Curl (Dumbbell)', 'Bicep Curl (Cable)', 'Incline Curl (Dumbbell)'],
  Triceps: ['Overhead Triceps Extension (Cable)', 'Triceps Rope Pushdown', 'Skullcrusher (Barbell)'], Quads: ['Leg Extension (Machine)', 'Leg Press (Machine)', 'Hack Squat (Machine)'],
  Hamstrings: ['Seated Leg Curl (Machine)', 'Lying Leg Curl (Machine)', 'Romanian Deadlift (Barbell)'], Glutes: ['Hip Thrust (Barbell)', 'Hip Abduction (Machine)', 'Bulgarian Split Squat'],
  Calves: ['Standing Calf Raise (Machine)', 'Calf Press (Machine)'], Traps: ['Shrug (Dumbbell)', 'Shrug (Barbell)'], Abs: ['Cable Crunch', 'Hanging Leg Raise', 'Crunch (Machine)']};
function trLifts(ex){ return ex.filter(e => { const t = trEx(e.n).t; return t === 'w' || t === 'b' || t === 'a'; }); }
// Sets per muscle group a week, from every routine (each done once a week).
function trWeekSets(rts){
  const out = {}; TR_GROUPS.forEach(g => out[g] = 0);
  (rts || trJSON(TR_RT, [])).forEach(r => trLifts(r.ex).forEach(e => { const x = trEx(e.n), n = e.sets || 3;
    const p = TR_GROUP[x.p]; if(p) out[p] = (out[p] || 0) + n;
    const seen = new Set([p]); x.s.forEach(m => { const g = TR_GROUP[m]; if(g && !seen.has(g)){ seen.add(g); out[g] = (out[g] || 0) + n / 2; } }); }));
  Object.keys(out).forEach(k => out[k] = Math.round(out[k] * 2) / 2);
  return out;
}
function trStep(name){ const x = trEx(name); return x.e === 'Dumbbell' ? 2 : x.e === 'Kettlebell' ? 4 : 2.5; }
const trR25 = v => Math.round(v / 2.5) * 2.5;
// What to lift today. Built for sets taken to failure: judge on set 1.
function trTarget(name, sets){
  const x = trEx(name); const n = sets || 3;
  const prev = trPreviousGym(name).filter(s => s.t !== 'w');
  if(x.t === 'c' || x.t === 't'){ const p = prev[0]; return {txt: p ? (p.km ? fmtKg(p.km) + ' km · ' : '') + (p.sec ? fmtMins(p.sec / 60) : '') : 'Warm-up', hint: p ? 'Last: ' + trFmtSet(p, x) : ''}; }
  const reps = prev.map(s => Number(s.reps) || 0).filter(Boolean);
  if(x.t === 'b' || x.t === 'a'){
    const top = reps[0] || 0;
    return {txt: n + ' sets · to failure', hint: top ? 'Last: ' + reps.join(', ') + ' · beat ' + top + ' on set 1' : 'First time: find your max'};
  }
  const s0 = prev[0];
  if(!s0 || !(Number(s0.kg) >= 0) || !reps.length){
    const b = trGymBase(name);
    if(b && b.kg) return {kg: b.kg, txt: n + ' × 8–12 · ' + fmtKg(trR25((b.kg * (1 + (b.reps || 1) / 30)) / (1 + 10 / 30))) + ' kg', hint: 'From your best here: ' + fmtKg(b.kg) + ' × ' + b.reps};
    return {txt: n + ' × 8–12', hint: 'First time: find a weight you fail at 8–12'};
  }
  const kg = Number(s0.kg) || 0, r0 = Number(s0.reps) || 0, step = trStep(name);
  let to = kg, why;
  const trend = trSessionTrend(name);
  if(r0 >= 12){ to = kg + step; why = 'hit ' + r0 + ' last time → add ' + fmtKg(step) + ' kg'; }
  else if(r0 < 6 && kg > step){ to = kg - step; why = 'only ' + r0 + ' on set 1 → go lighter'; }
  else if(trend < 0 && kg > step){ to = kg - step; why = 'going down → lighter, build back up'; }
  else why = 'beat ' + r0 + ' on set 1';
  return {kg: to, txt: n + ' × 8–12 · ' + fmtKg(to) + ' kg', hint: 'Last: ' + reps.join(', ') + ' · ' + why};
}
// "Previous" that respects the gym for machines.
function trPreviousGym(name, excludeId){
  if(!trMachineLike(name)) return trPrevious(name, excludeId);
  const cur = trGymCur();
  const h = trHistoryOf(name).find(x => x.id !== excludeId && x.gym === cur);
  if(h) return h.sets;
  const b = trGymBase(name);
  return b && b.kg != null && b.how !== 'today' ? [{t: 'n', kg: b.kg, reps: b.reps, done: true}] : [];
}

/* ---------- routine score ---------- */
function trRtMins(r){
  const pref = trPrefs().rest || 120;
  return Math.round(r.ex.reduce((m, e) => { const x = trEx(e.n);
    if(x.t === 'c' || x.t === 't'){ const p = trPrevious(e.n)[0]; return m + (p && p.sec ? p.sec / 60 : 5); }
    const rest = e.rest != null ? e.rest : pref; return m + (e.sets || 3) * (0.75 + rest / 60); }, 0));
}
function trIsCompound(name){ const x = trEx(name); return x.s.length >= 2 || x.e === 'Barbell' || ['Quads', 'Hamstrings', 'Glutes', 'Lats', 'Upper Back'].indexOf(x.p) >= 0 && x.s.length >= 1; }
function trSessionTrend(name){
  const hist = trGymHistory(name).filter(h => !h.base).slice(0, 3);
  if(hist.length < 2) return null;
  const v = h => Math.max(...h.sets.map(s => trE1rm(s.kg, s.reps) || (Number(s.reps) || 0)));
  const now = v(hist[0]), then = v(hist[hist.length - 1]);
  return now > then * 1.01 ? 1 : now < then * 0.99 ? -1 : 0;
}
function trRtScore(r){
  const lifts = trLifts(r.ex);
  if(!lifts.length) return null;
  const week = trWeekSets(), parts = [], tips = [];
  const names = new Set(r.ex.map(e => e.n));
  // 1. Volume: the muscles this routine mainly trains, 10+ sets a week.
  const mains = [...new Set(lifts.map(e => TR_GROUP[trEx(e.n).p]).filter(Boolean))];
  const vol = mains.length ? mains.reduce((s, g) => s + Math.min(1, week[g] / 10), 0) / mains.length : 1;
  parts.push({n: 'Volume', v: Math.round(vol * 35), max: 35});
  mains.filter(g => week[g] < 10).sort((a, b) => week[a] - week[b]).forEach(g => {
    const own = lifts.map((e, i) => ({e, i: r.ex.indexOf(e)})).filter(o => TR_GROUP[trEx(o.e.n).p] === g && (o.e.sets || 3) < 4).sort((a, b) => (a.e.sets || 3) - (b.e.sets || 3))[0];
    if(own) tips.push({t: '<b>' + g + ' get ' + fmtKg(week[g]) + ' sets a week</b> (aim 10–20). Add a set to ' + esc(own.e.n) + '.', b: '+1 set', a: {k: 'set', i: own.i}});
    else { const add = (TR_SUGGEST[g] || []).find(n => !names.has(n) && TR_BY.has(n)); if(add) tips.push({t: '<b>' + g + ' get ' + fmtKg(week[g]) + ' sets a week</b> (aim 10–20). Add ' + esc(add) + '.', b: 'Add', a: {k: 'add', n: add}}); }
  });
  // 2. Progress: is each lift going up over its last 3 sessions?
  const tr = lifts.map(e => ({e, t: trSessionTrend(e.n)}));
  const known = tr.filter(o => o.t != null);
  const prog = known.length ? known.reduce((s, o) => s + (o.t > 0 ? 1 : o.t === 0 ? 0.6 : 0.2), 0) / known.length : 0.6;
  parts.push({n: 'Progress', v: Math.round(prog * 25), max: 25});
  known.filter(o => o.t < 0).forEach(o => tips.push({t: '<b>' + esc(o.e.n) + ' is going down.</b> Drop ' + fmtKg(trStep(o.e.n)) + ' kg and build back up.'}));
  // 3. Time: short sessions, 25-50 minutes.
  const mins = trRtMins(r);
  const time = mins < 20 ? 0.5 : mins < 25 ? 0.8 : mins <= 50 ? 1 : Math.max(0.3, 1 - (mins - 50) / 30);
  parts.push({n: 'Time', v: Math.round(time * 15), max: 15});
  if(mins > 55){ const big = lifts.slice().sort((a, b) => (b.sets || 3) - (a.sets || 3))[0]; if(big && (big.sets || 3) > 2) tips.push({t: '<b>About ' + mins + ' min.</b> Take a set off ' + esc(big.n) + ' to keep it short.', b: '−1 set', a: {k: 'unset', i: r.ex.indexOf(big)}}); }
  // 4. Reps: 5-30 reps to failure all build muscle.
  const reps = []; lifts.forEach(e => trPreviousGym(e.n).forEach(s => { if(s.t !== 'w' && Number(s.reps) > 0) reps.push(Number(s.reps)); }));
  const okReps = reps.length ? reps.filter(v => v >= 5 && v <= 30).length / reps.length : 1;
  parts.push({n: 'Reps', v: Math.round(okReps * 15), max: 15});
  lifts.forEach(e => { const p = trPreviousGym(e.n).filter(s => s.t !== 'w'); if(p.length && p.every(s => Number(s.reps) > 30)) tips.push({t: '<b>' + esc(e.n) + ' is over 30 reps.</b> Add weight.'}); });
  // 5. Rest: 90 s+ for big lifts, 60 s+ for small ones.
  const pref = trPrefs().rest || 120;
  const restOk = lifts.filter(e => { const rs = e.rest != null ? e.rest : pref; return rs >= (trIsCompound(e.n) ? 90 : 60); }).length / lifts.length;
  parts.push({n: 'Rest', v: Math.round(restOk * 10), max: 10});
  lifts.forEach(e => { const rs = e.rest != null ? e.rest : pref; if(rs < (trIsCompound(e.n) ? 90 : 60)) tips.push({t: '<b>' + esc(e.n) + ' rests ' + fmtDur(rs) + '.</b> 2 min lets you lift more next set.', b: '2 min', a: {k: 'rest', i: r.ex.indexOf(e)}}); });
  const total = parts.reduce((s, p) => s + p.v, 0);
  return {score: Math.round(total) / 10, parts, tips, mins, sets: lifts.reduce((s, e) => s + (e.sets || 3), 0), mains};
}
function trScoreWord(s){ return s >= 8 ? 'GREAT' : s >= 6.5 ? 'GOOD' : s >= 5 ? 'OK' : 'WEAK'; }
function trScoreCol(s){ return s >= 8 ? '#7fe0b0' : s >= 6.5 ? '#c7e07f' : s >= 5 ? '#e0b95f' : '#e2665f'; }
function trRing(s){
  const c = 2 * Math.PI * 36, col = trScoreCol(s);
  return '<div class="rx-ring"><svg viewBox="0 0 86 86"><circle cx="43" cy="43" r="36" fill="none" stroke="#23272f" stroke-width="8"/>' +
    '<circle cx="43" cy="43" r="36" fill="none" stroke="' + col + '" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + (c * s / 10).toFixed(1) + ' ' + c.toFixed(1) + '"/></svg>' +
    '<b>' + s.toFixed(1) + '<small style="color:' + col + '">' + trScoreWord(s) + '</small></b></div>';
}
// Apply a quick fix to a saved routine.
function trRtApply(id, a){
  const rts = trJSON(TR_RT, []); const r = rts.find(x => x.id === id); if(!r) return;
  if(a.k === 'set' && r.ex[a.i]) r.ex[a.i].sets = Math.min(8, (r.ex[a.i].sets || 3) + 1);
  if(a.k === 'unset' && r.ex[a.i]) r.ex[a.i].sets = Math.max(1, (r.ex[a.i].sets || 3) - 1);
  if(a.k === 'rest' && r.ex[a.i]) r.ex[a.i].rest = 120;
  if(a.k === 'add' && !r.ex.some(e => e.n === a.n)) r.ex.push({n: a.n, sets: 3, rest: 120});
  trSave(TR_RT, rts);
  try{ buzz(); sfx('scan'); }catch(e){}
}

/* ---------- routine page ---------- */
let trRtOpen = null;
function trOpenRoutine(id){
  const r = trJSON(TR_RT, []).find(x => x.id === id); if(!r) return;
  trRtOpen = id;
  const sc = trRtScore(r);
  let h = '<div class="rx-hero">' + (sc ? trRing(sc.score) : '') + '<div style="min-width:0;"><div class="rx-h1">' + esc(r.name) + '</div><div class="rx-chips">' +
    '<span class="rx-chip">≈ ' + trRtMins(r) + ' min</span><span class="rx-chip">' + (sc ? sc.sets : r.ex.length) + ' sets</span>' +
    (sc && sc.mains.length ? '<span class="rx-chip">' + esc(sc.mains.slice(0, 3).join(' · ')) + '</span>' : '') + '</div></div></div>';
  if(sc){
    h += '<div class="rx-bars">' + sc.parts.map(p => { const f = p.v / p.max; return '<div class="rx-bar"><span>' + p.n + '<b>' + p.v + '/' + p.max + '</b></span><i><em class="' + (f >= 0.85 ? '' : f >= 0.5 ? 'mid' : 'low') + '" style="width:' + Math.round(f * 100) + '%"></em></i></div>'; }).join('') + '</div>';
    const tips = sc.score < 8 ? sc.tips : sc.tips.filter(t => t.a).slice(0, 1);
    if(sc.score >= 8 && !tips.length) h += '<div class="rx-fix ok">✓<span><b>Great routine.</b> Keep beating set 1 every session.</span></div>';
    tips.slice(0, 4).forEach((t, i) => { h += '<div class="rx-fix">⚡<span>' + t.t + '</span>' + (t.a ? '<button class="rx-q" data-tip="' + i + '">' + t.b + '</button>' : '') + '</div>'; });
    trOpenRoutine.tips = tips;
  }
  h += '<button class="rx-start" id="rx-go">Start routine</button>';
  h += '<div class="section-title">TARGETS FOR TODAY</div>';
  r.ex.forEach((e, i) => {
    const t = trTarget(e.n, e.sets), rk = trRankOf(e.n);
    h += '<button class="rx-ex" data-rxo="' + i + '">' + trThumb(e.n) + '<div class="mid"><div class="n">' + esc(e.n) + '</div><div class="t">' + esc(t.txt) + '</div>' +
      (t.hint ? '<div class="l">' + esc(t.hint) + '</div>' : '') + '</div>' + (rk && rk.tier >= 0 ? '<span class="rk rk' + rk.tier + '">' + TR_RANKS[rk.tier].n.toUpperCase() + '</span>' : '') + '</button>';
  });
  if(!r.ex.length) h += '<div class="tr-empty">No exercises yet. Tap Edit to add some.</div>';
  h += '<div class="rx-two"><button class="tr-ghost" id="rx-edit">Edit routine</button></div>';
  if(sc) h += '<div class="tr-mini" style="margin:10px 2px 0;">Score: sets per muscle each week (aim 10–20), each lift going up, 25–50 min, 5–30 reps to failure, and enough rest. Under 8 gets tips.</div>';
  const body = document.getElementById('tr-rt-body'); body.innerHTML = h;
  body.querySelector('#rx-go').onclick = () => { closeSheet('tr-rt-backdrop'); setTimeout(() => trStart(id), HANDOFF); };
  body.querySelector('#rx-edit').onclick = () => trEditRoutine(id);
  body.querySelectorAll('[data-rxo]').forEach(b => b.onclick = () => { const n = r.ex[+b.dataset.rxo].n; closeSheet('tr-rt-backdrop'); setTimeout(() => trOpenExercise(n), HANDOFF); });
  body.querySelectorAll('[data-tip]').forEach(b => b.onclick = () => { const t = trOpenRoutine.tips[+b.dataset.tip]; if(t && t.a){ trRtApply(id, t.a); trOpenRoutine(id); trRefresh(); } });
  if(!document.getElementById('tr-rt-backdrop').classList.contains('open')) openSheet('tr-rt-backdrop');
}

/* ---------- routine editor with drag to reorder ---------- */
function trRtRender2(){
  const r = trRtEdit;
  const pref = trPrefs().rest || 120;
  let h = '<h3>' + (r.fresh ? 'New routine' : 'Edit routine') + '</h3><input class="tr-fld" id="tr-rt-name" placeholder="Name, e.g. Legs" value="' + esc(r.name) + '">';
  if(r.ex.length > 1) h += '<div class="tr-mini" style="margin:-4px 0 10px;">Hold ⋮⋮ (or the card) and drag to change the order.</div>';
  h += '<div id="rx-list">' + r.ex.map((e, i) => { const x = trEx(e.n), timed = x.t === 'c' || x.t === 't', rest = e.rest != null ? e.rest : pref;
    return '<div class="rx-ex rx-ed" data-i="' + i + '"><span class="rx-grip" data-grip="' + i + '">⋮⋮</span>' + trThumb(e.n) +
      '<div class="mid"><div class="n">' + esc(e.n) + '</div>' + (timed ? '<div class="l">Timed</div>' :
      '<div class="rx-ctl"><span class="rx-set"><button data-rs="' + i + ':-1">−</button><b>' + (e.sets || 3) + '</b><button data-rs="' + i + ':1">+</button></span><button class="rx-rest" data-rr="' + i + '">Rest ' + fmtDur(rest) + '</button></div>') +
      '</div><button class="rx-x" data-rx="' + i + '">✕</button></div>'; }).join('') + '</div>';
  h += '<button class="tr-ghost" id="tr-rt-add" style="margin-top:4px;">' + TR_I.plus + ' Add exercises</button>';
  h += '<button class="save-btn" id="tr-rt-save">Save routine</button>';
  if(!r.fresh) h += '<button class="tr-ghost" id="tr-rt-del" style="border-style:solid; color:var(--danger); margin-top:12px;">Delete routine</button>';
  const body = document.getElementById('tr-rt-body'); body.innerHTML = h;
  body.querySelector('#tr-rt-name').oninput = ev => { r.name = ev.target.value; };
  body.querySelectorAll('[data-rs]').forEach(b => b.onclick = () => { const [i, d] = b.dataset.rs.split(':').map(Number); r.ex[i].sets = Math.max(1, Math.min(12, (r.ex[i].sets || 3) + d)); trRtRender2(); });
  body.querySelectorAll('[data-rr]').forEach(b => b.onclick = () => { const i = +b.dataset.rr; const opts = [60, 90, 120, 180]; const cur = r.ex[i].rest != null ? r.ex[i].rest : pref;
    r.ex[i].rest = opts[(opts.indexOf(cur) + 1) % opts.length] || 120; trRtRender2(); });
  body.querySelectorAll('[data-rx]').forEach(b => b.onclick = () => { r.ex.splice(+b.dataset.rx, 1); trRtRender2(); });
  body.querySelector('#tr-rt-add').onclick = () => { closeSheet('tr-rt-backdrop'); setTimeout(() => trOpenPicker('add', null, 'routine'), HANDOFF); };
  body.querySelector('#tr-rt-save').onclick = () => {
    r.name = (r.name || '').trim() || 'Routine';
    const all = trJSON(TR_RT, []); const o = {id: r.id, name: r.name.slice(0, 40), ex: r.ex};
    const at = all.findIndex(x => x.id === r.id);
    if(at >= 0) all[at] = o; else all.push(o);
    trSave(TR_RT, all); trRefresh(); trOpenRoutine(r.id);
  };
  const del = body.querySelector('#tr-rt-del');
  if(del) del.onclick = () => { if(!confirm('Delete this routine?')) return; trSave(TR_RT, trJSON(TR_RT, []).filter(x => x.id !== r.id)); closeSheet('tr-rt-backdrop'); trRefresh(); };
  trDragWire(body.querySelector('#rx-list'), order => { r.ex = order.map(i => r.ex[i]); trRtRender2(); });
}
// Hold and drag. Works with the grip straight away, or a long press on the card.
function trDragWire(list, done){
  if(!list) return;
  const GAP = 8;
  const begin = (row, ev) => {
    let y0 = ev.clientY;
    row.classList.add('lift'); try{ buzz(); }catch(e){}
    const move = e => {
      e.preventDefault();
      let dy = e.clientY - y0;
      const next = row.nextElementSibling, prev = row.previousElementSibling;
      if(next && dy > next.offsetHeight / 2){ list.insertBefore(next, row); y0 += next.offsetHeight + GAP; dy = e.clientY - y0; }
      else if(prev && dy < -prev.offsetHeight / 2){ list.insertBefore(row, prev); y0 -= prev.offsetHeight + GAP; dy = e.clientY - y0; }
      row.style.transform = 'translateY(' + dy + 'px)';
    };
    const end = () => {
      document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', end); document.removeEventListener('pointercancel', end);
      row.classList.remove('lift'); row.style.transform = '';
      const order = [...list.children].map(el => +el.dataset.i);
      if(order.some((v, i) => v !== i)) done(order);
    };
    document.addEventListener('pointermove', move, {passive: false}); document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
  };
  [...list.children].forEach(row => {
    const grip = row.querySelector('[data-grip]');
    if(grip) grip.addEventListener('pointerdown', ev => { ev.preventDefault(); begin(row, ev); });
    let t = null, sx = 0, sy = 0;
    row.addEventListener('pointerdown', ev => { if(ev.target.closest('button,[data-grip]')) return; sx = ev.clientX; sy = ev.clientY;
      t = setTimeout(() => { t = null; begin(row, ev); }, 420); });
    const cancel = ev => { if(t && (!ev || Math.abs(ev.clientX - sx) > 8 || Math.abs(ev.clientY - sy) > 8 || ev.type !== 'pointermove')){ clearTimeout(t); t = null; } };
    row.addEventListener('pointermove', cancel); row.addEventListener('pointerup', cancel); row.addEventListener('pointercancel', cancel);
  });
}

/* ---------- your week ---------- */
function trWeekCardHTML(){
  const rts = trJSON(TR_RT, []); if(!rts.length) return '';
  const w = trWeekSets(rts);
  const rows = TR_GROUPS.map(g => [g, w[g] || 0]).sort((a, b) => b[1] - a[1]);
  const col = v => v >= 10 ? '#7fe0b0' : v >= 5 ? '#e0b95f' : '#e2665f';
  const low = rows.filter(r => r[1] < 10).length;
  return '<div class="section-title">YOUR WEEK · SETS PER MUSCLE</div><div class="rx-wk"><div class="tr-mini" style="margin-bottom:6px;">From your ' + rts.length + ' routine' + (rts.length === 1 ? '' : 's') +
    ', each done once a week. Shaded band = 10–20 sets.</div>' +
    rows.map(([g, v]) => '<div class="rx-wr"><span>' + g + '</span><i><em style="width:' + Math.min(100, v / 30 * 100) + '%;background:' + col(v) + '"></em></i><b style="color:' + col(v) + '">' + fmtKg(v) + '</b></div>').join('') +
    (low ? '<div class="tr-mini" style="margin-top:8px;">' + low + ' of ' + rows.length + ' under 10. Open a routine for one-tap fixes.</div>' : '') + '</div>';
}

/* ---------- workout feedback (finish screen) ---------- */
function trFeedbackHTML(w){
  const lifts = w.ex.filter(e => { const t = trEx(e.n).t; return t === 'w' || t === 'b' || t === 'a'; });
  if(!lifts.length) return '';
  const val = (sets, x) => Math.max(0, ...sets.filter(s => s.t !== 'w').map(s => x.t === 'w' ? (trE1rm(s.kg, s.reps) || 0) : (Number(s.reps) || 0)));
  const cmp = lifts.map(e => {
    const x = trEx(e.n);
    let before = trHistoryOf(e.n).filter(h => h.id !== w.id && (h.start || 0) < (w.start || 0));
    if(trMachineLike(e.n)) before = before.filter(h => h.gym === w.gym);
    const now = val(e.sets, x), was = before.length ? val(before[0].sets, x) : null;
    const reps = (sets) => sets.filter(s => s.t !== 'w').map(s => Number(s.reps) || 0);
    const dr = was != null ? reps(e.sets).reduce((a, b) => a + b, 0) - reps(before[0].sets).reduce((a, b) => a + b, 0) : 0;
    const k = was == null ? 'new' : now > was * 1.01 ? 'up' : now < was * 0.99 ? 'down' : 'same';
    return {e, x, k, dr, was};
  });
  const pts = cmp.map(c => c.k === 'up' ? 1 : c.k === 'same' ? 0.7 : c.k === 'new' ? 0.75 : 0.35);
  const prs = w.ex.reduce((n, e) => n + e.sets.filter(s => s.pr).length, 0);
  const score = Math.min(10, Math.round((pts.reduce((a, b) => a + b, 0) / pts.length * 9 + Math.min(1, prs * 0.5)) * 10) / 10);
  let h = '<div class="rx-sess"><span>Session score</span><b style="color:' + trScoreCol(score) + '">' + score.toFixed(1) + '<small>/10</small></b></div>';
  h += '<div class="section-title">NEXT TIME</div><div class="tr-card">' + lifts.map(e => { const t = trTargetFrom(e, w); return '<div class="tr-row"><span>' + esc(e.n) + '</span><span><b>' + esc(t.a) + '</b> <span class="tr-mini">' + esc(t.b) + '</span></span></div>'; }).join('') + '</div>';
  const up = cmp.filter(c => c.k === 'up').length, dn = cmp.filter(c => c.k === 'down').length, same = cmp.filter(c => c.k === 'same').length;
  h += '<div class="section-title">VS LAST TIME</div><div class="tr-card">' + cmp.map(c => {
    const lab = c.k === 'new' ? '<span class="tr-mini">first time</span>' : c.k === 'same' ? '<span class="tr-mini"><b>= same</b></span>' :
      '<span style="color:' + (c.k === 'up' ? '#7fe0b0' : '#ff8a7a') + '"><b>' + (c.k === 'up' ? '▲ ' + (c.dr > 0 ? '+' + c.dr + ' rep' + (c.dr === 1 ? '' : 's') : 'heavier') :
        '▼ ' + (c.dr < 0 ? c.dr + ' rep' + (c.dr === -1 ? '' : 's') : 'lighter')) + '</b></span>';
    return '<div class="tr-row"><span>' + esc(c.e.n) + '</span>' + lab + '</div>'; }).join('') +
    '<div class="tr-lk"><span class="tr-dot"></span><span>' + up + ' up, ' + same + ' same, ' + dn + ' down.</span></div></div>';
  // Balance: weakest group, and groups not trained for 7+ days.
  let bal = '';
  try{
    const S = trMuscleScores(); const ranked = Object.keys(S).filter(k => S[k].pct != null).sort((a, b) => S[a].pct - S[b].pct);
    if(ranked.length) bal += '<div class="tr-lk"><span class="tr-dot"></span><span><b>' + esc(ranked[0]) + '</b> is your weakest group (' + TR_MU_LOOK[S[ranked[0]].k].n.toLowerCase() + ', ~' + S[ranked[0]].pct + '%).</span></div>';
    const last = {}; const idx = trIdx();
    idx.forEach(x => (x.x || []).forEach(n => { const g = TR_GROUP[trEx(n).p]; if(g) last[g] = x.d > (last[g] || '') ? x.d : last[g]; }));
    const want = new Set(); trJSON(TR_RT, []).forEach(r => trLifts(r.ex).forEach(e => { const g = TR_GROUP[trEx(e.n).p]; if(g) want.add(g); }));
    const today = todayYMD();
    const stale = [...want].filter(g => !last[g] || Math.round((asDate(today) - asDate(last[g])) / 864e5) >= 7);
    stale.slice(0, 3).forEach(g => { const days = last[g] ? Math.round((asDate(today) - asDate(last[g])) / 864e5) : null;
      bal += '<div class="tr-lk"><span class="tr-dot"></span><span><b>' + g + '</b>: ' + (days ? 'not trained in ' + days + ' days' : 'not trained yet') + '.</span></div>'; });
    if(!stale.length) bal += '<div class="tr-lk"><span class="tr-ok">✓</span><span>Every muscle in your routines trained this week.</span></div>';
  }catch(e){}
  if(bal) h += '<div class="section-title">YOUR BALANCE</div><div class="tr-card">' + bal + '</div>';
  return h;
}
// Next-time target from this workout's own sets (set 1 rules).
function trTargetFrom(e, w){
  const x = trEx(e.n); const work = e.sets.filter(s => s.t !== 'w');
  const s0 = work[0]; if(!s0) return {a: '', b: ''};
  if(x.t !== 'w') return {a: 'beat ' + (Number(s0.reps) || 0), b: 'reps on set 1'};
  const kg = Number(s0.kg) || 0, r0 = Number(s0.reps) || 0, step = trStep(e.n);
  if(r0 >= 12) return {a: fmtKg(kg + step) + ' kg', b: 'all ' + r0 + 's → heavier'};
  if(r0 < 6 && kg > step) return {a: fmtKg(kg - step) + ' kg', b: 'reps too low'};
  return {a: fmtKg(kg) + ' kg', b: 'beat ' + r0 + ' on set 1'};
}
