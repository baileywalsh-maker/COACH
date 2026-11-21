/* =====================================================================
   v144: TRAIN - the workout side of COACH.
   Everything here is saved under new names (coachtrain:*), so nothing that
   was saved before changes, and all of it goes into the daily backup like
   the rest of COACH.
     coachtrain:mode      'eat' | 'train'
     coachtrain:active    the workout in progress (saved on every change)
     coachtrain:idx       one line per finished workout
     coachtrain:w:<id>    a finished workout
     coachtrain:routines  saved routines
     coachtrain:custom    exercises you made yourself
     coachtrain:prefs     rest timer etc.
   ===================================================================== */
const TR_MODE = 'coachtrain:mode', TR_ACTIVE = 'coachtrain:active', TR_IDX = 'coachtrain:idx',
      TR_W = 'coachtrain:w:', TR_RT = 'coachtrain:routines', TR_CUSTOM = 'coachtrain:custom', TR_PREFS = 'coachtrain:prefs';

function trJSON(k, dflt){ try{ const v = JSON.parse(CS.getItem(k)); return v == null ? dflt : v; }catch(e){ return dflt; } }
function trSave(k, v){ lsSet(k, JSON.stringify(v)); }
function trPrefs(){ return Object.assign({rest: 120, preHours: 3}, trJSON(TR_PREFS, {})); }
function trUid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

/* ---------------------------------------------------------------------
   The exercise library: ~180 everyday gym exercises named the way Hevy names
   them, then the rest of the free-exercise-db (public domain), plus yours.
   Row: [name, equipment, primary muscle, secondary (a,b), set type,
         strength-standard id, other names (a|b), kind]
   Set types: w = kg x reps, b = bodyweight reps (+kg optional),
              a = assisted (kg taken off), t = time, c = distance + time
   --------------------------------------------------------------------- */
let TR_LIB = null, TR_BY = null, TR_ROWS = null;
function trLib(){
  if(TR_LIB) return TR_LIB;
  // v150 fix: the data block can only be read once, so keep the parsed rows.
  // Before, rebuilding the list (new custom exercise, Muse sync) lost the whole library.
  if(!TR_ROWS){ try{ TR_ROWS = JSON.parse(coachData('EXERCISES') || '[]'); }catch(e){ TR_ROWS = []; } }
  const rows = TR_ROWS;
  const custom = trJSON(TR_CUSTOM, []);
  TR_LIB = rows.map((r, i) => ({n: r[0], e: r[1], p: r[2], s: r[3] ? r[3].split(',') : [], t: r[4] || 'w', sl: r[5] || '',
                                al: r[6] ? r[6].split('|') : [], k: r[7] || '', img: r[8] || '', core: i < 180}));
  custom.forEach(c => TR_LIB.push(Object.assign({s: [], al: [], sl: '', k: '', core: true, mine: true}, c)));
  TR_BY = new Map(TR_LIB.map(x => [x.n, x]));
  TR_LIB.forEach(trIndexEx);
  return TR_LIB;
}
function trEx(name){ trLib(); return TR_BY.get(name) || {n: name, e: 'Other', p: 'Other', s: [], t: 'w', sl: '', al: [], k: ''}; }

/* Search. Same rules as food search: accents ignored, one slip forgiven in
   5+ letter words and two in 8+, and gym shorthand understood. */
const TR_SHORT = {db: 'dumbbell', dbs: 'dumbbell', bb: 'barbell', kb: 'kettlebell', bw: 'bodyweight', ez: 'ez',
  ohp: 'overhead press', rdl: 'romanian deadlift', sldl: 'stiff leg deadlift', bss: 'bulgarian split squat',
  cgbp: 'close grip bench press', hspu: 'handstand push up', lat: 'lat', lats: 'lat', tri: 'triceps', tris: 'triceps',
  bi: 'bicep', bis: 'bicep', delt: 'shoulders', delts: 'shoulders', quad: 'quads', ham: 'hamstrings', hammy: 'hamstrings',
  pullup: 'pull up', pullups: 'pull up', pushup: 'push up', pushups: 'push up', chinup: 'chin up', situp: 'sit up',
  pecdeck: 'pec deck', smith: 'smith', abs: 'abs', ab: 'abs', calf: 'calf', calves: 'calf', glute: 'glute', glutes: 'glute'};
function trWords(s){ return foldAccents(String(s || '').toLowerCase()).replace(/[‘’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean); }
function trIndexEx(x){
  const name = trWords(x.n), more = trWords(x.al.join(' ') + ' ' + x.e + ' ' + x.p + ' ' + x.s.join(' '));
  x._name = name; x._all = Array.from(new Set(name.concat(more)));
  x._key = name.join(' ');
}
function trQuery(q){
  let w = trWords(q);
  const out = [];
  w.forEach(t => { const s = TR_SHORT[t]; if(s) out.push(...s.split(' ')); else out.push(t); });
  return out.filter(t => !['the', 'a', 'with', 'and', 'of'].includes(t));
}
// How well one typed word fits one exercise: 0 best, null no fit.
function trWordFit(t, x){
  let best = null;
  for(const w of x._all){
    let c = null;
    if(w === t) c = 0;
    else if(w.startsWith(t)) c = 1;
    else if(t.length > 3 && t.endsWith('s') && w === t.slice(0, -1)) c = 1;
    else if(t.length >= 5 && w.length >= 5 && within1(t, w)) c = 3;
    else if(t.length === 4 && w.length >= 4 && w.length <= 5 && t[0] === w[0] && within1(t, w)) c = 3;
    else if(t.length >= 8 && w.length >= 7 && within2(t, w)) c = 4;
    if(c !== null && (best === null || c < best)) best = c;
    if(best === 0) break;
  }
  if(best !== null && !x._name.some(w => w === t || w.startsWith(t))) best += 1;   // matched only a muscle or kit
  return best;
}
function trSearch(q, filt){
  const lib = trLib();
  const toks = trQuery(q);
  const used = trUsage();
  const res = [];
  for(const x of lib){
    if(filt && filt.m && x.p !== filt.m && !(filt.m === 'Back' && /Back|Lats|Traps/.test(x.p))) continue;
    if(filt && filt.e && x.e !== filt.e) continue;
    if(filt && !filt.stretch && x.k === 'stretch' && !toks.length) continue;
    let cost = 0, close = false;
    for(const t of toks){
      const c = trWordFit(t, x);
      if(c === null){ cost = null; break; }
      if(c >= 3) close = true;
      cost += c;
    }
    if(cost === null) continue;
    if(toks.length && x._key.startsWith(toks.join(' '))) cost -= 3;
    if(!x.core) cost += 2;
    if(x.k === 'stretch') cost += 3;
    const u = used.get(x.n) || 0;
    cost -= Math.min(4, u);
    res.push({x, cost, close});
  }
  if(!toks.length) res.sort((a, b) => (used.get(b.x.n) || 0) - (used.get(a.x.n) || 0) || (b.x.core - a.x.core) || (a.x.k === 'stretch') - (b.x.k === 'stretch') || a.x.n.localeCompare(b.x.n));
  else res.sort((a, b) => a.cost - b.cost || (b.x.core - a.x.core) || a.x.n.length - b.x.n.length || a.x.n.localeCompare(b.x.n));
  return res;
}
// How often you have done each exercise (recent first counts most).
let trUsageCache = null;
function trUsage(){
  if(trUsageCache) return trUsageCache;
  const m = new Map();
  trIdx().slice(-60).forEach(w => (w.x || []).forEach(n => m.set(n, (m.get(n) || 0) + 1)));
  return (trUsageCache = m);
}

/* ---------------------------------------------------------------------
   Workouts on disk.
   --------------------------------------------------------------------- */
function trIdx(){ return trJSON(TR_IDX, []); }
function trLoadW(id){ return trJSON(TR_W + id, null); }
function trWorkoutsOn(ds){ return trIdx().filter(w => w.d === ds); }
function trActive(){ return trJSON(TR_ACTIVE, null); }
function trSaveActive(a){ if(a) trSave(TR_ACTIVE, a); else CS.removeItem(TR_ACTIVE); }

// Every finished set of one exercise, newest workout first.
function trHistoryOf(name){
  const out = [];
  const idx = trIdx();
  for(let i = idx.length - 1; i >= 0; i--){
    if(idx[i].x && idx[i].x.indexOf(name) < 0) continue;
    const w = trLoadW(idx[i].id); if(!w) continue;
    (w.ex || []).forEach(e => { if(e.n === name){ const sets = e.sets.filter(s => s.done && s.t !== 'w'); if(sets.length) out.push({id: w.id, d: w.d, start: w.start, gym: w.gym, sets}); } });
  }
  return out;
}
// What you did last time, set by set (for the "Previous" column).
function trPrevious(name, excludeId){
  const idx = trIdx();
  for(let i = idx.length - 1; i >= 0; i--){
    if(idx[i].id === excludeId) continue;
    if(idx[i].x && idx[i].x.indexOf(name) < 0) continue;
    const w = trLoadW(idx[i].id); if(!w) continue;
    const e = (w.ex || []).find(e => e.n === name);
    if(e) return e.sets.filter(s => s.done);
  }
  return [];
}

/* ---------------------------------------------------------------------
   Numbers.
   --------------------------------------------------------------------- */
// Estimated one-rep max (Epley). Past 12 reps it says little, so those sets
// count only for reps and volume.
function trE1rm(kg, reps){ kg = Number(kg) || 0; reps = Number(reps) || 0; if(kg <= 0 || reps <= 0) return 0; if(reps === 1) return kg; if(reps > 12) return 0; return kg * (1 + reps / 30); }
function trSetVol(s, x){ const kg = Number(s.kg) || 0, r = Number(s.reps) || 0; if(x.t === 'w') return kg * r; if(x.t === 'b') return kg * r; return 0; }
function trWorkoutStats(w){
  let vol = 0, sets = 0, reps = 0;
  (w.ex || []).forEach(e => { const x = trEx(e.n); e.sets.forEach(s => { if(!s.done) return; sets++; reps += Number(s.reps) || 0; vol += trSetVol(s, x); }); });
  const mins = Math.max(1, Math.round(((w.end || Date.now()) - w.start) / 60000));
  return {vol: Math.round(vol), sets, reps, mins};
}
function trBests(name, excludeId){
  const b = {kg: 0, e1: 0, vol: 0, reps: 0, sec: 0, km: 0};
  // v151: machines count this gym only; a confirmed best counts too.
  trGymHistory(name, excludeId).forEach(h => { h.sets.forEach(s => {
    b.kg = Math.max(b.kg, Number(s.kg) || 0); b.e1 = Math.max(b.e1, trE1rm(s.kg, s.reps));
    b.vol = Math.max(b.vol, (Number(s.kg) || 0) * (Number(s.reps) || 0)); b.reps = Math.max(b.reps, Number(s.reps) || 0);
    b.sec = Math.max(b.sec, Number(s.sec) || 0); b.km = Math.max(b.km, Number(s.km) || 0); }); });
  return b;
}
const fmtKg = v => { v = Math.round((Number(v) || 0) * 100) / 100; return String(v); };
function fmtDur(sec){ sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return h ? h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') : m + ':' + String(s).padStart(2, '0'); }
function fmtMins(m){ m = Math.round(m); return m >= 60 ? Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') : m + ' min'; }

/* Calories: Compendium of Physical Activities (2024) MET values x your
   weight x time. Shown as an estimate only - never added to your food
   target, because COACH already learns your real burn from your weight. */
const TR_MET = {weights: 3.5, Running: 9.8, Treadmill: 8.0, Walking: 3.5, 'Incline Walk (Treadmill)': 6.0, Cycling: 7.5, 'Stationary Bike': 6.8,
  'Rowing Machine': 7.0, Elliptical: 5.0, 'Stair Climber': 9.0, 'Assault Bike': 8.0, 'Ski Erg': 7.0, Swimming: 6.0, 'Jump Rope': 11.8, cardio: 7.0};
function trWeightKg(){
  try{ const log = loadWeightLog(); if(log.length) return Number(log[log.length - 1].kg); }catch(e){}
  const p = loadProfile(); return Number(p.weight) || 0;
}
function trBurn(w){
  const kg = trWeightKg(); if(!kg) return 0;
  const st = trWorkoutStats(w);
  let cardioMin = 0, cardioKcal = 0;
  (w.ex || []).forEach(e => { const x = trEx(e.n); if(x.t !== 'c' && !(x.p === 'Cardio')) return;
    e.sets.forEach(s => { if(!s.done) return; const m = (Number(s.sec) || 0) / 60; cardioMin += m; cardioKcal += (TR_MET[x.n] || TR_MET.cardio) * kg * m / 60; }); });
  const liftMin = Math.max(0, st.mins - cardioMin);
  return Math.round(cardioKcal + TR_MET.weights * kg * liftMin / 60);
}

/* Water: a workout makes the day a training day, and the top-up grows with
   how long you trained - half a litre an hour, never under the 0.5 L the
   training tick has always added. */
function trTopUpMl(d){
  let train = false; try{ train = isTrainingDay(d); }catch(e){}
  if(!train) return 0;
  let mins = 0; try{ trWorkoutsOn(ymd(asDate(d))).forEach(w => mins += w.m || 0); }catch(e){}
  return Math.max(500, Math.round(mins * 500 / 60 / 50) * 50);
}

/* ---------------------------------------------------------------------
   Ranks. Strength Level's standards (strengthlevel.com), built from millions
   of logged lifts, by sex and bodyweight. Five lines split six ranks:
   stronger than ~5% / 20% / 50% / 80% / 95% of lifters your size.
   --------------------------------------------------------------------- */
let TR_STD = null;
function trStd(){ if(TR_STD) return TR_STD; try{ TR_STD = JSON.parse(coachData('STRENGTH') || '{}').std || {}; }catch(e){ TR_STD = {}; } return TR_STD; }
const TR_RANKS = [
  {n: 'Rookie',     plain: 'Weak',               icon: '🌱', pct: 0},
  {n: 'Apprentice', plain: 'Well below average', icon: '🔨', pct: 5},
  {n: 'Contender',  plain: 'Below average',      icon: '🥊', pct: 20},
  {n: 'Strong',     plain: 'Above average',      icon: '💪', pct: 50},
  {n: 'Beast',      plain: 'Well above average', icon: '🦍', pct: 80},
  {n: 'Champion',   plain: 'Champion',           icon: '🏆', pct: 95}];
function trLines(slug){
  const s = trStd()[slug]; if(!s) return null;
  const p = loadProfile();
  const tab = (p.sex === 'female' && s.f) ? s.f : s.m;
  if(!tab || !tab.length) return null;
  const bw = trWeightKg() || (p.sex === 'female' ? 65 : 80);
  let lo = tab[0], hi = tab[tab.length - 1];
  for(let i = 0; i < tab.length - 1; i++) if(bw >= tab[i][0] && bw <= tab[i + 1][0]){ lo = tab[i]; hi = tab[i + 1]; break; }
  if(bw < tab[0][0]){ lo = hi = tab[0]; } else if(bw > tab[tab.length - 1][0]){ lo = hi = tab[tab.length - 1]; }
  const f = hi[0] === lo[0] ? 0 : (bw - lo[0]) / (hi[0] - lo[0]);
  return {u: s.u, v: [1, 2, 3, 4, 5].map(i => lo[i] + (hi[i] - lo[i]) * f), bw};
}
// Your rank on one exercise, from your best set ever.
function trRankOf(name){
  const x = trEx(name); if(!x.sl) return null;
  const L = trLines(x.sl); if(!L) return null;
  const b = trBests(name);
  const score = L.u === 'reps' ? b.reps : b.e1;
  if(!score) return {L, score: 0, tier: -1};
  let tier = 0; L.v.forEach((v, i) => { if(v > 0 && score >= v) tier = i + 1; });
  // Where you sit between two lines, as a rough "stronger than X%".
  const P = [0, 5, 20, 50, 80, 95, 99.5], V = [0].concat(L.v);
  let pct;
  if(tier >= 5) pct = Math.min(99.5, 95 + 4.5 * Math.min(1, (score - L.v[4]) / Math.max(1, L.v[4] * 0.2)));
  else { const a = V[tier], c = V[tier + 1]; pct = P[tier] + (P[tier + 1] - P[tier]) * Math.max(0, Math.min(1, (score - a) / Math.max(0.0001, c - a))); }
  const next = tier < 5 ? L.v[tier] : null;
  return {L, score, tier, pct: Math.min(99, Math.round(pct)), next, machine: x.e === 'Machine' || x.e === 'Cable'};
}
function trRankTag(r){
  if(!r || r.tier < 0) return '';
  const k = TR_RANKS[r.tier];
  return '<span class="tr-tag rk' + r.tier + '">' + k.icon + ' ' + k.n + '</span>';
}

/* ---------------------------------------------------------------------
   Eat / Train switch.
   --------------------------------------------------------------------- */
let trMode = 'eat', trView = 'workout';
function setMode(m, quiet){
  trMode = m === 'train' ? 'train' : 'eat';
  lsSet(TR_MODE, trMode);
  document.querySelectorAll('#mode-sw .mode-b').forEach(b => b.classList.toggle('on', b.dataset.mode === trMode));
  const train = trMode === 'train';
  document.getElementById('eat-tabs').style.display = train ? 'none' : '';
  document.getElementById('tr-tabs').style.display = train ? '' : 'none';
  ['view-day', 'view-week', 'view-data'].forEach(id => { const el = document.getElementById(id); if(el && train) el.style.display = 'none'; });
  document.getElementById('view-train').style.display = train ? '' : 'none';
  const fab = document.querySelector('.fab-row'); if(fab) fab.style.display = train ? 'none' : '';
  if(train) trShow(trView);
  else switchView(typeof currentView === 'string' ? currentView : 'day');
  trRestRender();
  if(!quiet){ try{ buzz(); }catch(e){} }
  window.scrollTo(0, 0);
}
document.querySelectorAll('#mode-sw .mode-b').forEach(b => b.onclick = () => { if(b.dataset.mode !== trMode) setMode(b.dataset.mode); });
document.querySelectorAll('#tr-tabs .view-tab').forEach(t => t.onclick = () => trShow(t.dataset.tv));
function trShow(v){
  trView = v;
  document.querySelectorAll('#tr-tabs .view-tab').forEach(t => t.classList.toggle('active', t.dataset.tv === v));
  const box = document.getElementById('view-train');
  if(v === 'history') trRenderHistory(box);
  else if(v === 'exercises') trRenderExercises(box);
  else trRenderWorkout(box);
  try{ box.classList.remove('view-in'); void box.offsetWidth; box.classList.add('view-in'); }catch(e){}
}
function trRefresh(){ if(trMode === 'train') trShow(trView); }

/* ---------------------------------------------------------------------
   Icons (inline: the app's icon font only carries what it already uses).
   --------------------------------------------------------------------- */
const TR_I = {
  plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>',
  timer: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="13" r="7"/><path d="M12 10v3l2 1M10 3h4"/></svg>',
  note: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>'};
const TR_EQ_ICON = {Barbell: 'BB', Dumbbell: 'DB', Machine: 'MC', Cable: 'CB', Bodyweight: 'BW', Kettlebell: 'KB', Band: 'BD', Plate: 'PL', Other: '•', 'Medicine Ball': 'MB', 'Exercise Ball': 'EB', 'Foam Roller': 'FR'};

/* ---------------------------------------------------------------------
   WORKOUT tab: home, or the workout in progress.
   --------------------------------------------------------------------- */
let trTick = null;
function trRenderWorkout(box){
  const a = trActive();
  if(a) return trRenderLive(box, a);
  clearInterval(trTick); trTick = null;
  const rts = trJSON(TR_RT, []);
  let h = '<button class="rx-gymchip" id="tr-gym">📍 ' + esc(trGymName()) + ' <span>›</span></button>' +
    '<button class="tr-big" id="tr-start">' + TR_I.plus + ' Start empty workout</button>';
  h += '<div class="section-title">ROUTINES</div>';
  if(!rts.length) h += '<div class="tr-mini" style="margin:-4px 0 10px;">Save a workout as a routine, or make one here.</div>';
  rts.forEach(r => {
    const sc = trRtScore(r);
    h += '<div class="tr-rt"><div class="tr-rt-h"><span data-rtedit="' + r.id + '">' + esc(r.name) + (sc ? ' <i class="rx-pill" style="color:' + trScoreCol(sc.score) + '">' + sc.score.toFixed(1) + '</i>' : '') + '</span><button class="tr-pill" data-rtstart="' + r.id + '">Start</button></div>' +
      '<div class="tr-rt-s" data-rtedit="' + r.id + '">' + esc(r.ex.map(e => e.n.replace(/ \((Barbell|Dumbbell|Machine|Cable)\)$/, '')).join(', ') || 'No exercises yet') + '</div></div>';
  });
  h += '<button class="tr-ghost" id="tr-newrt">' + TR_I.plus + ' New routine</button>';
  h += trWeekCardHTML();
  // This week, Monday to Sunday.
  const today = new Date(); const mon = addDays(today, -((today.getDay() + 6) % 7));
  const idx = trIdx(); let n = 0, vol = 0, mins = 0;
  let wk = '<div class="tr-wk">';
  for(let i = 0; i < 7; i++){
    const ds = ymd(addDays(mon, i)); const on = idx.filter(w => w.d === ds);
    on.forEach(w => { n++; vol += w.v || 0; mins += w.m || 0; });
    wk += '<div class="d' + (on.length ? ' on' : '') + (ds === todayYMD() ? ' today' : '') + '"><b>' + 'MTWTFSS'[i] + '</b><i></i></div>';
  }
  wk += '</div>';
  h += '<div class="section-title">THIS WEEK</div><div class="tr-card">' + wk +
    '<div class="tr-stats3"><div><b>' + n + '</b><span>workout' + (n === 1 ? '' : 's') + '</span></div><div><b>' + fmtK(vol) + '</b><span>kg lifted</span></div><div><b>' + (mins ? fmtMins(mins) : '0') + '</b><span>trained</span></div></div></div>';
  const last = idx[idx.length - 1];
  if(last){
    h += '<div class="section-title">LAST WORKOUT</div>' + trHistCard(last);
  }
  box.innerHTML = h;
  box.querySelector('#tr-start').onclick = () => trStart(null);
  box.querySelector('#tr-newrt').onclick = () => trEditRoutine(null);
  box.querySelectorAll('[data-rtstart]').forEach(b => b.onclick = () => trStart(b.dataset.rtstart));
  box.querySelectorAll('[data-rtedit]').forEach(b => b.onclick = () => trOpenRoutine(b.dataset.rtedit));
  box.querySelector('#tr-gym').onclick = trGymMenu;
  box.querySelectorAll('[data-wo]').forEach(b => b.onclick = () => trOpenWorkout(b.dataset.wo));
}

function trStart(rtId){
  if(trActive()) return trRefresh();
  const now = Date.now();
  const a = {id: trUid(), name: 'Workout', start: now, ex: [], d: todayYMD(), gym: trGymCur()};
  const h = new Date().getHours();
  a.name = h < 11 ? 'Morning workout' : h < 17 ? 'Afternoon workout' : 'Evening workout';
  if(rtId){
    const r = trJSON(TR_RT, []).find(r => r.id === rtId);
    if(r){ a.name = r.name; a.rt = r.id;
      a.ex = r.ex.map(e => { const prev = trPrevious(e.n); const n = Math.max(1, e.sets || prev.length || 3);
        return {n: e.n, rest: e.rest, sets: Array.from({length: n}, (_, i) => ({t: (prev[i] && prev[i].t === 'w') ? 'w' : 'n', done: false}))}; }); }
  }
  trSaveActive(a);
  try{ buzz('big'); }catch(e){}
  trView = 'workout'; trRefresh();
  // v151: confirm bests the first time (per gym for machines).
  if(a.ex.length) setTimeout(() => trGymAsk(a.ex.map(e => e.n)), HANDOFF);
}

function trPreFoods(a){
  // Food from the 3 hours before you started, plus anything added from here.
  const out = [];
  try{
    const es = loadEntries(asDate(a.d));
    const from = a.start - trPrefs().preHours * 3600000;
    es.forEach((e, i) => { if((e.at && e.at >= from && e.at <= a.start) || e.pw === a.id) out.push(e); });
  }catch(e){}
  return out.sort((x, y) => (x.at || 0) - (y.at || 0));
}
function trPreCard(a){
  const fs = trPreFoods(a);
  let h = '<div class="tr-card"><div class="tr-pre-h"><span>Pre-workout</span><span>last ' + trPrefs().preHours + ' hours</span></div>';
  if(!fs.length) h += '<div class="tr-pre-none">Nothing logged before this session.</div>';
  else {
    let c = 0, p = 0, k = 0;
    fs.forEach(e => { c += e.carbs || 0; p += e.protein || 0; k += e.kcal || 0;
      const t = e.at ? new Date(e.at).toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'}) : '';
      h += '<div class="tr-pre-f"><span>' + esc(e.name || 'Food') + '</span><span>' + t + '</span></div>'; });
    const first = fs.find(e => e.at);
    const gap = first ? Math.max(0, Math.round((a.start - first.at) / 60000)) : null;
    h += '<div class="tr-pre-m"><span><b>' + fmt0(c) + ' g</b> carbs</span><span><b>' + fmt0(p) + ' g</b> protein</span><span><b>' + fmtK(k) + '</b> kcal</span>' +
      (gap ? '<span><b>' + fmtMins(gap) + '</b> before</span>' : '') + '</div>';
  }
  h += '<button class="tr-ghost sm" id="tr-addpre">' + TR_I.plus + ' Add pre-workout food</button></div>';
  return h;
}
// Food added from the workout goes into the normal food log (so it counts in
// the day's totals) and is marked as this workout's pre-workout food.
let trPreFor = null;
function trTagEntry(entry){
  if(trPreFor && entry && typeof entry === 'object'){ entry.pw = trPreFor; setTimeout(trRefresh, 80); }
}

function trSetRow(a, ei, si, x, prev){
  const e = a.ex[ei], s = e.sets[si];
  const pv = prev[si] ? trFmtSet(prev[si], x) : '—';
  const label = s.t === 'w' ? 'W' : s.t === 'd' ? 'D' : s.t === 'f' ? 'F' : String(e.sets.slice(0, si + 1).filter(q => q.t !== 'w').length);
  const cls = 'tr-sets' + (x.t === 'c' ? ' c' : x.t === 't' ? ' t1' : '') + (s.done ? ' done' : '');
  const ph = (k) => prev[si] && prev[si][k] != null && prev[si][k] !== '' ? fmtKg(prev[si][k]) : '';
  const val = k => k === 'min' ? (s.sec ? fmtKg(Math.round(s.sec / 6) / 10) : '') : (s[k] != null && s[k] !== '' ? fmtKg(s[k]) : '');
  const inp = (k, mode, place) => '<input class="tr-in" inputmode="' + mode + '" data-in="' + ei + ':' + si + ':' + k + '" value="' + val(k) + '" placeholder="' + place + '">';
  let mid;
  if(x.t === 'c') mid = inp('km', 'decimal', ph('km') || 'km') + inp('min', 'decimal', prev[si] && prev[si].sec ? fmtKg(Math.round(prev[si].sec / 6) / 10) : 'min');
  else if(x.t === 't') mid = inp('min', 'decimal', prev[si] && prev[si].sec ? (prev[si].sec / 60).toFixed(1).replace(/\.0$/, '') : 'min');
  else mid = inp('kg', 'decimal', ph('kg') || (x.t === 'b' ? '+kg' : x.t === 'a' ? '−kg' : 'kg')) + inp('reps', 'numeric', ph('reps') || 'reps');
  return '<div class="' + cls + '"><button class="tr-sn ' + (s.t || 'n') + '" data-st="' + ei + ':' + si + '">' + label + (s.pr ? '<span class="tr-pr">🏆</span>' : '') + '</button><span>' + pv + '</span>' + mid +
    '<button class="tr-ck' + (s.done ? ' on' : '') + '" data-ck="' + ei + ':' + si + '" aria-label="Done">' + TR_I.check + '</button></div>';
}
function trFmtSet(s, x){
  if(x.t === 'c') return (s.km ? fmtKg(s.km) + ' km' : '') + (s.sec ? (s.km ? ' · ' : '') + fmtMins(s.sec / 60) : '') || '—';
  if(x.t === 't') return s.sec ? fmtDur(s.sec) : '—';
  if(x.t === 'b') return (s.kg ? '+' + fmtKg(s.kg) + ' × ' : '') + (s.reps || 0) + (s.kg ? '' : ' reps');
  if(x.t === 'a') return '−' + fmtKg(s.kg || 0) + ' × ' + (s.reps || 0);
  return fmtKg(s.kg || 0) + ' × ' + (s.reps || 0);
}

function trRenderLive(box, a){
  const st = trWorkoutStats(a);
  let h = '<div class="tr-liveh"><div style="min-width:0; flex:1;"><button class="tr-lt" id="tr-rename">' + esc(a.name) + '</button>' +
    '<div class="tr-ls" id="tr-clock">' + fmtDur((Date.now() - a.start) / 1000) + ' · ' + st.sets + ' set' + (st.sets === 1 ? '' : 's') + ' · ' + fmtK(st.vol) + ' kg</div></div>' +
    '<button class="tr-pill solid" id="tr-finish">Finish</button></div>';
  h += trPreCard(a);
  a.ex.forEach((e, ei) => {
    const x = trEx(e.n), prev = trPreviousGym(e.n, a.id), tgt = (x.t === 'w' || x.t === 'b') ? trTarget(e.n, e.sets.length) : null;
    const doneN = e.sets.filter(s => s.done).length;
    const rest = e.rest != null ? e.rest : trPrefs().rest;
    h += '<div class="tr-card tr-ex' + (e.fold ? ' collapsed' : '') + '"><div class="tr-ex-h"><button class="tr-ex-n rx-exn" data-exinfo="' + ei + '">' + trThumb(e.n) + '<span>' + esc(e.n) +
      (tgt && !e.fold ? '<small class="rx-tg">' + esc(tgt.txt.replace(/^\d+ × /, '')) + (tgt.hint ? ' · ' + esc(tgt.hint.replace(/^Last: [^·]*· ?/, '')) : '') + '</small>' : '') + '</span></button>' +
      (e.fold ? '<span class="tr-mini">' + doneN + ' / ' + e.sets.length + '</span>' : '') + '<button class="tr-ex-more" data-exmenu="' + ei + '">⋯</button></div><div class="tr-body">' +
      '<div class="tr-ex-r"><button data-rest="' + ei + '">' + TR_I.timer + ' Rest ' + (rest ? fmtDur(rest) : 'off') + '</button><button data-noteb="' + ei + '">' + TR_I.note + (e.note ? ' Note' : ' Add note') + '</button></div>' +
      (e.note != null ? '<textarea class="tr-note" rows="1" data-note="' + ei + '" placeholder="Note">' + esc(e.note || '') + '</textarea>' : '') +
      '<div class="tr-sets hd' + (x.t === 'c' ? ' c' : x.t === 't' ? ' t1' : '') + '"><span>SET</span><span>PREVIOUS</span>' +
      (x.t === 'c' ? '<span>KM</span><span>MIN</span>' : x.t === 't' ? '<span>MIN</span>' : '<span>' + (x.t === 'b' ? '+KG' : x.t === 'a' ? '−KG' : 'KG') + '</span><span>REPS</span>') + '<span>✓</span></div>';
    e.sets.forEach((s, si) => { h += trSetRow(a, ei, si, x, prev); });
    h += '<button class="tr-ghost sm" data-addset="' + ei + '">' + TR_I.plus + ' Add set</button></div></div>';
  });
  h += '<button class="tr-ghost" id="tr-addex">' + TR_I.plus + ' Add exercise</button>';
  h += '<button class="tr-ghost" id="tr-discard" style="border-style:solid; color:var(--danger); border-color:rgba(226,102,95,.3);">Discard workout</button>';
  h += '<div style="height:90px;"></div>';
  box.innerHTML = h;
  // Wiring.
  box.querySelector('#tr-finish').onclick = trFinish;
  box.querySelector('#tr-addex').onclick = () => trOpenPicker('add');
  box.querySelector('#tr-addpre').onclick = () => { trPreFor = a.id; openSheet('add-backdrop'); };
  box.querySelector('#tr-discard').onclick = () => { if(confirm('Discard this workout? Nothing from it will be saved.')){ trSaveActive(null); trRestStop(); trRefresh(); } };
  box.querySelector('#tr-rename').onclick = () => { const n = prompt('Workout name', a.name); if(n && n.trim()){ const b = trActive(); b.name = n.trim().slice(0, 40); trSaveActive(b); trRefresh(); } };
  box.querySelectorAll('[data-in]').forEach(inp => {
    inp.onfocus = () => { try{ inp.select(); }catch(e){} };
    inp.oninput = () => trInput(inp);
  });
  box.querySelectorAll('[data-ck]').forEach(b => b.onclick = () => trToggleSet(b.dataset.ck));
  box.querySelectorAll('[data-st]').forEach(b => b.onclick = () => trSetMenu(b.dataset.st));
  box.querySelectorAll('[data-addset]').forEach(b => b.onclick = () => { const x = trActive(); const e = x.ex[+b.dataset.addset]; const last = e.sets[e.sets.length - 1];
    e.sets.push({t: 'n', kg: last ? last.kg : '', reps: last ? last.reps : '', km: '', sec: last ? last.sec : '', done: false}); trSaveActive(x); trRefresh(); });
  box.querySelectorAll('[data-exmenu]').forEach(b => b.onclick = () => trExMenu(+b.dataset.exmenu));
  box.querySelectorAll('[data-exinfo]').forEach(b => b.onclick = () => trOpenExercise(a.ex[+b.dataset.exinfo].n));
  box.querySelectorAll('[data-rest]').forEach(b => b.onclick = () => trRestMenu(+b.dataset.rest));
  box.querySelectorAll('[data-noteb]').forEach(b => b.onclick = () => { const x = trActive(); const e = x.ex[+b.dataset.noteb]; if(e.note == null) e.note = ''; trSaveActive(x); trRefresh();
    setTimeout(() => { const t = document.querySelector('[data-note="' + b.dataset.noteb + '"]'); if(t) t.focus(); }, 30); });
  box.querySelectorAll('[data-note]').forEach(t => t.oninput = () => { const x = trActive(); x.ex[+t.dataset.note].note = t.value; trSaveActive(x); });
  clearInterval(trTick);
  trTick = setInterval(() => { const c = document.getElementById('tr-clock'); const x = trActive();
    if(!c || !x || trMode !== 'train'){ clearInterval(trTick); trTick = null; return; }
    const s = trWorkoutStats(x); c.textContent = fmtDur((Date.now() - x.start) / 1000) + ' · ' + s.sets + ' set' + (s.sets === 1 ? '' : 's') + ' · ' + fmtK(s.vol) + ' kg'; }, 1000);
}
// Typing saves straight away, without redrawing (so the keyboard stays up).
function trInput(inp){
  const [ei, si, k] = inp.dataset.in.split(':'); const a = trActive(); if(!a) return;
  const s = a.ex[+ei].sets[+si];
  const v = inp.value.replace(',', '.').trim();
  if(k === 'min') s.sec = v === '' ? '' : Math.round(parseFloat(v) * 60) || '';
  else s[k] = v === '' ? '' : (parseFloat(v) || 0);
  trSaveActive(a);
}
function trToggleSet(key){
  const [ei, si] = key.split(':').map(Number); const a = trActive(); const e = a.ex[ei], s = e.sets[si]; const x = trEx(e.n);
  if(!s.done){
    // An empty box takes last time's number, like Hevy.
    const prev = trPreviousGym(e.n, a.id)[si];
    const fill = k => { if((s[k] === '' || s[k] == null) && prev && prev[k] != null && prev[k] !== '') s[k] = prev[k]; };
    if(x.t === 'c'){ fill('km'); fill('sec'); } else if(x.t === 't') fill('sec'); else { fill('kg'); fill('reps'); }
    if(x.t !== 'c' && x.t !== 't' && !(Number(s.reps) > 0)){ try{ buzz(); }catch(_){} const r = document.querySelector('[data-in="' + ei + ':' + si + ':reps"]'); if(r) r.focus(); return; }
    if((x.t === 'c' || x.t === 't') && !(Number(s.sec) > 0) && !(Number(s.km) > 0)){ const r = document.querySelector('[data-in="' + ei + ':' + si + ':' + (x.t === 'c' ? 'km' : 'min') + '"]'); if(r) r.focus(); return; }
    s.done = true; s.at = Date.now();
    // A new best on this set?
    const b = trBests(e.n, a.id);
    const doneHere = e.sets.filter((q, i) => i !== si && q.done && q.t !== 'w');
    const e1 = trE1rm(s.kg, s.reps), here = Math.max(0, ...doneHere.map(q => trE1rm(q.kg, q.reps)));
    s.pr = s.t !== 'w' && trGymHistory(e.n, a.id).length > 0 && ((e1 > 0 && e1 > b.e1 && e1 > here) || (x.t === 'b' && !s.kg && Number(s.reps) > b.reps));
    try{ if(s.pr) sfx('protein'); else sfx('scan'); buzz(); }catch(_){}
    const rest = e.rest != null ? e.rest : trPrefs().rest;
    if(rest && s.t !== 'w') trRestStart(rest); else if(rest) trRestStart(Math.min(rest, 60));
  } else { s.done = false; s.pr = false; }
  trSaveActive(a); trRefresh();
}
function trSetMenu(key){
  const [ei, si] = key.split(':').map(Number);
  trMenu([['Warm-up set', () => trSetType(ei, si, 'w')], ['Normal set', () => trSetType(ei, si, 'n')], ['Drop set', () => trSetType(ei, si, 'd')],
          ['Failure set', () => trSetType(ei, si, 'f')], ['Remove set', () => { const a = trActive(); a.ex[ei].sets.splice(si, 1); trSaveActive(a); trRefresh(); }, true]]);
}
function trSetType(ei, si, t){ const a = trActive(); a.ex[ei].sets[si].t = t; trSaveActive(a); trRefresh(); }
function trExMenu(ei){
  const a = trActive(); const e = a.ex[ei];
  trMenu([[e.fold ? 'Show sets' : 'Fold away', () => { const b = trActive(); b.ex[ei].fold = !b.ex[ei].fold; trSaveActive(b); trRefresh(); }],
    ['Move up', () => trMoveEx(ei, -1)], ['Move down', () => trMoveEx(ei, 1)],
    ['Swap for another exercise', () => trOpenPicker('swap', ei)],
    ['How you rank / your bests', () => trOpenExercise(e.n)],
    ['Remove exercise', () => { const b = trActive(); b.ex.splice(ei, 1); trSaveActive(b); trRefresh(); }, true]]);
}
function trMoveEx(ei, d){ const a = trActive(); const j = ei + d; if(j < 0 || j >= a.ex.length) return; const t = a.ex[ei]; a.ex[ei] = a.ex[j]; a.ex[j] = t; trSaveActive(a); trRefresh(); }
function trRestMenu(ei){
  const opts = [0, 30, 45, 60, 90, 120, 150, 180, 240, 300];
  trMenu(opts.map(s => [s ? fmtDur(s) : 'Off', () => { const a = trActive(); a.ex[ei].rest = s; trSaveActive(a); trRefresh(); }]));
}
function trMenu(items){
  const body = document.getElementById('tr-menu-body');
  body.innerHTML = items.map((it, i) => '<button class="tr-menu-b' + (it[2] ? ' bad' : '') + '" data-mi="' + i + '">' + esc(it[0]) + '</button>').join('');
  body.querySelectorAll('[data-mi]').forEach(b => b.onclick = () => { closeSheet('tr-menu-backdrop'); setTimeout(items[+b.dataset.mi][1], 40); });
  openSheet('tr-menu-backdrop');
}

/* Rest timer: kept as an end time, so it is right even after the phone
   locks or the app is swapped out. */
let trRestT = null;
function trRestStart(sec){ const r = {end: Date.now() + sec * 1000, len: sec}; trSave('coachtrain:rest', r); trRestRender(); }
function trRestStop(){ CS.removeItem('coachtrain:rest'); trRestRender(); }
function trRestRender(){
  const el = document.getElementById('tr-rest'); if(!el) return;
  const r = trJSON('coachtrain:rest', null);
  clearInterval(trRestT); trRestT = null;
  if(!r || trMode !== 'train' || !trActive()){ el.style.display = 'none'; return; }
  const draw = () => {
    const left = Math.round((r.end - Date.now()) / 1000);
    if(left <= 0){ el.style.display = 'none'; clearInterval(trRestT); CS.removeItem('coachtrain:rest'); try{ sfx('waterGoal'); buzz('big'); }catch(e){} return; }
    el.querySelector('.tr-rest-t').textContent = fmtDur(left);
    el.querySelector('.tr-rest-bar i').style.width = Math.max(0, Math.min(100, left / r.len * 100)) + '%';
  };
  el.innerHTML = '<span class="tr-rest-t"></span><span style="color:var(--t2); font-size:13px;">rest</span><span class="tr-rest-b"><button data-r="-15">−15</button><button data-r="15">+15</button><button class="go" data-r="skip">Skip</button></span><div class="tr-rest-bar"><i></i></div>';
  el.style.display = 'flex';
  el.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { if(b.dataset.r === 'skip') return trRestStop();
    const x = trJSON('coachtrain:rest', null); if(!x) return; x.end += Number(b.dataset.r) * 1000; x.len = Math.max(x.len, Math.round((x.end - Date.now()) / 1000)); trSave('coachtrain:rest', x); trRestRender(); });
  draw(); trRestT = setInterval(draw, 250);
}

/* ---------------------------------------------------------------------
   Exercise picker.
   --------------------------------------------------------------------- */
let trPick = {mode: 'add', idx: null, sel: [], m: '', e: '', for: null};
const TR_MUSCLES = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs', 'Forearms', 'Cardio'];
const TR_KIT = ['Barbell', 'Dumbbell', 'Machine', 'Cable', 'Bodyweight', 'Kettlebell', 'Band'];
function trOpenPicker(mode, idx, forWhat){
  trPick = {mode, idx, sel: [], m: '', e: '', for: forWhat || null, chips: ''};
  document.getElementById('tr-pick-title').textContent = mode === 'swap' ? 'Swap exercise' : 'Add exercise';
  const q = document.getElementById('tr-pick-q'); q.value = '';
  trPickRender();
  openSheet('tr-pick-backdrop');
}
function trPickChips(){
  const c = document.getElementById('tr-pick-chips');
  if(trPick.chips === 'm') c.innerHTML = '<button class="tr-chip on" data-pc="back">‹ Muscle</button><button class="tr-chip' + (!trPick.m ? ' on' : '') + '" data-pm="">All</button>' + TR_MUSCLES.map(m => '<button class="tr-chip' + (trPick.m === m ? ' on' : '') + '" data-pm="' + m + '">' + m + '</button>').join('');
  else if(trPick.chips === 'e') c.innerHTML = '<button class="tr-chip on" data-pc="back">‹ Equipment</button><button class="tr-chip' + (!trPick.e ? ' on' : '') + '" data-pe="">All</button>' + TR_KIT.map(m => '<button class="tr-chip' + (trPick.e === m ? ' on' : '') + '" data-pe="' + m + '">' + m + '</button>').join('');
  else c.innerHTML = '<button class="tr-chip' + (trPick.m ? ' on' : '') + '" data-pc="m">' + (trPick.m || 'All muscles') + ' ▾</button><button class="tr-chip' + (trPick.e ? ' on' : '') + '" data-pc="e">' + (trPick.e || 'All equipment') + ' ▾</button>';
  c.querySelectorAll('[data-pc]').forEach(b => b.onclick = () => { trPick.chips = b.dataset.pc === 'back' ? '' : b.dataset.pc; trPickChips(); });
  c.querySelectorAll('[data-pm]').forEach(b => b.onclick = () => { trPick.m = b.dataset.pm; trPick.chips = ''; trPickRender(); });
  c.querySelectorAll('[data-pe]').forEach(b => b.onclick = () => { trPick.e = b.dataset.pe; trPick.chips = ''; trPickRender(); });
}
let trPickTimer = null;
document.getElementById('tr-pick-q').oninput = () => { clearTimeout(trPickTimer); trPickTimer = setTimeout(trPickRender, 60); };
function trPickRender(){
  trPickChips();
  const q = document.getElementById('tr-pick-q').value;
  const res = trSearch(q, {m: trPick.m, e: trPick.e});
  const list = document.getElementById('tr-pick-list');
  let h = '';
  if(!q.trim() && !trPick.m && !trPick.e){
    const recent = Array.from(trUsage().keys()).slice(-12).reverse();
    if(recent.length){ h += '<div class="tr-sec">Recent</div>' + recent.map(n => trPickRow(trEx(n), false)).join(''); h += '<div class="tr-sec">All exercises</div>'; }
  }
  const shown = res.slice(0, q.trim() ? 60 : 140);
  h += shown.map(r => trPickRow(r.x, r.close)).join('');
  if(!shown.length) h += '<div class="tr-empty">Nothing matches that.</div>';
  if(q.trim().length > 1) h += '<button class="tr-ghost" id="tr-mk">' + TR_I.plus + ' Create “' + esc(q.trim()) + '” as my own exercise</button>';
  list.innerHTML = h;
  list.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => trPickTap(b.dataset.pick, b));
  const mk = list.querySelector('#tr-mk'); if(mk) mk.onclick = () => trMakeExercise(q.trim());
  trPickFoot();
}
function trPickRow(x, close){
  const sel = trPick.sel.indexOf(x.n) >= 0;
  const r = trRankOf(x.n);
  const prev = trPrevious(x.n)[0];
  return '<button class="tr-exrow' + (sel ? ' sel' : '') + '" data-pick="' + esc(x.n) + '"><div class="tr-exi">' + (sel ? TR_I.check : (TR_EQ_ICON[x.e] || '•')) + '</div>' +
    '<div class="tr-exm"><div class="tr-exn">' + esc(x.n) + '</div><div class="tr-exs">' + esc(x.p) + ' · ' + esc(x.e) + (close ? ' · <span style="color:var(--accent)">close spelling</span>' : '') + (x.mine ? ' · yours' : '') + '</div></div>' +
    (r && r.tier >= 0 ? trRankTag(r) : prev ? '<span class="tr-last">last ' + esc(trFmtSet(prev, x)) + '</span>' : '') + '</button>';
}
function trPickTap(name, btn){
  if(trPick.mode === 'swap' || trPick.mode === 'one'){ trPick.sel = [name]; return trPickDone(); }
  const i = trPick.sel.indexOf(name);
  if(i >= 0) trPick.sel.splice(i, 1); else trPick.sel.push(name);
  btn.classList.toggle('sel', i < 0);
  btn.querySelector('.tr-exi').innerHTML = i < 0 ? TR_I.check : (TR_EQ_ICON[trEx(name).e] || '•');
  try{ buzz(); }catch(e){}
  trPickFoot();
}
function trPickFoot(){
  const f = document.getElementById('tr-pick-foot');
  f.style.display = trPick.sel.length && trPick.mode === 'add' ? '' : 'none';
  document.getElementById('tr-pick-add').textContent = 'Add ' + trPick.sel.length + ' exercise' + (trPick.sel.length === 1 ? '' : 's');
}
document.getElementById('tr-pick-add').onclick = () => trPickDone();
function trPickDone(){
  const names = trPick.sel.slice();
  closeSheet('tr-pick-backdrop');
  if(!names.length) return;
  if(trPick.for === 'routine'){ trRoutineAdd(names); return; }
  const a = trActive(); if(!a) return;
  const mk = n => { const prev = trPrevious(n); const k = Math.max(1, prev.length || 3);
    return {n, sets: Array.from({length: k}, (_, i) => ({t: prev[i] && prev[i].t === 'w' ? 'w' : 'n', done: false}))}; };
  if(trPick.mode === 'swap') a.ex[trPick.idx] = mk(names[0]);
  else names.forEach(n => a.ex.push(mk(n)));
  trSaveActive(a); trRefresh();
  setTimeout(() => trGymAsk(names), HANDOFF);
  setTimeout(() => { const cards = document.querySelectorAll('#view-train .tr-ex'); const c = cards[trPick.mode === 'swap' ? trPick.idx : cards.length - names.length]; if(c) c.scrollIntoView({behavior: 'smooth', block: 'start'}); }, 80);
}
function trMakeExercise(name){
  name = name.replace(/\s+/g, ' ').slice(0, 60);
  trMenu([['Weight × reps', () => trMake2(name, 'w')], ['Bodyweight reps', () => trMake2(name, 'b')], ['Time', () => trMake2(name, 't')], ['Distance + time', () => trMake2(name, 'c')]]);
}
function trMake2(name, t){
  const nice = name.replace(/\b\w/g, c => c.toUpperCase());
  const c = trJSON(TR_CUSTOM, []);
  if(!c.find(x => x.n === nice)) c.push({n: nice, e: t === 'b' ? 'Bodyweight' : 'Other', p: 'Other', t});
  trSave(TR_CUSTOM, c); TR_LIB = null; trLib();
  trPick.sel = trPick.mode === 'add' && trPick.for !== 'routine' ? trPick.sel.concat([nice]) : [nice];
  setTimeout(() => { openSheet('tr-pick-backdrop'); trPickDone(); }, 60);
}

/* ---------------------------------------------------------------------
   Finish.
   --------------------------------------------------------------------- */
function trFinish(){
  const a = trActive(); if(!a) return;
  // Sets you never ticked are dropped; exercises left with nothing go too.
  const kept = a.ex.map(e => Object.assign({}, e, {sets: e.sets.filter(s => s.done)})).filter(e => e.sets.length);
  if(!kept.length){
    if(confirm('No sets are ticked yet. Discard this workout?')){ trSaveActive(null); trRestStop(); trRefresh(); }
    return;
  }
  const w = {id: a.id, name: a.name, d: a.d, start: a.start, end: Date.now(), rt: a.rt || null, gym: a.gym || trGymCur(),
             ex: kept.map(e => ({n: e.n, note: e.note || '', sets: e.sets.map(s => { const o = {t: s.t || 'n', done: true};
               ['kg', 'reps', 'km', 'sec'].forEach(k => { if(s[k] !== '' && s[k] != null) o[k] = Number(s[k]); }); if(s.pr) o.pr = 1; return o; })}))};
  const st = trWorkoutStats(w);
  const prs = [];
  w.ex.forEach(e => e.sets.forEach(s => { if(s.pr) prs.push({n: e.n, s}); }));
  // Ranks before, to say which went up.
  const before = {}; w.ex.forEach(e => { const r = trRankOf(e.n); before[e.n] = r ? r.tier : -1; });
  trSave(TR_W + w.id, w);
  const idx = trIdx().filter(x => x.id !== w.id);
  idx.push({id: w.id, d: w.d, s: w.start, n: w.name, v: st.vol, k: st.sets, m: st.mins, x: w.ex.map(e => e.n)});
  idx.sort((p, q) => p.s - q.s);
  trSave(TR_IDX, idx);
  trSaveActive(null); trRestStop(); trUsageCache = null;
  // Linked: the day becomes a training day.
  try{ if(!isTrainingDay(w.d)) setTrainingDay(w.d, true); }catch(e){}
  try{ dataEpoch++; scoreEpoch++; logEpoch++; }catch(e){}
  const ups = []; w.ex.forEach(e => { const r = trRankOf(e.n); if(r && r.tier > before[e.n] && r.tier >= 0) ups.push({n: e.n, r, was: before[e.n]}); });
  trShowSummary(w, st, prs, ups, true);
  try{ sfx('dayDone'); buzz('big'); }catch(e){}
  trRefresh();
  try{ renderDay(); }catch(e){}
}
function trShowSummary(w, st, prs, ups, fresh){
  const burn = trBurn(w), top = trTopUpMl(w.d);
  let prot = null;
  try{ if(w.d === todayYMD()){ const es = loadEntries(asDate(w.d)); const got = es.reduce((x, e) => x + (e.protein || 0), 0); prot = Math.max(0, Math.round(targetsFor(asDate(w.d)).protein - got)); } }catch(e){}
  const t = d => new Date(d).toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'});
  let h = '<div class="tr-fin-t">' + esc(w.name) + (fresh ? ' done' : '') + '</div><div class="tr-mini" style="font-size:13px; margin-top:4px;">' +
    asDate(w.d).toLocaleDateString('en-GB', {weekday: 'long', day: 'numeric', month: 'long'}) + ' · ' + t(w.start) + '–' + t(w.end) + '</div>';
  h += '<div class="tr-grid4"><div class="tr-tile"><b>' + st.mins + '</b><span>minutes</span></div><div class="tr-tile"><b>' + fmtK(st.vol) + '</b><span>kg volume</span></div>' +
    '<div class="tr-tile"><b>' + st.sets + '</b><span>sets</span></div><div class="tr-tile' + (prs.length ? ' acc' : '') + '"><b>' + prs.length + '</b><span>new best' + (prs.length === 1 ? '' : 's') + '</span></div></div>';
  if(ups.length){
    h += '<div class="section-title">' + (ups.some(u => u.was >= 0) ? 'RANK UP' : 'RANKED') + '</div><div class="tr-card">' + ups.map(u => '<div class="tr-row"><span>' + esc(u.n) + '</span><span>' + trRankTag(u.r) + '</span></div>').join('') + '</div>';
  }
  if(prs.length){
    h += '<div class="section-title">NEW BESTS</div><div class="tr-card">' + prs.map(p => '<div class="tr-row"><span>🏆 ' + esc(p.n) + '</span><span><b>' + esc(trFmtSet(p.s, trEx(p.n))) + '</b></span></div>').join('') + '</div>';
  }
  try{ h += trFeedbackHTML(w); }catch(e){}
  h += '<div class="section-title">' + (fresh ? 'ADDED TO TODAY' : 'LINKED TO THAT DAY') + '</div><div class="tr-card">' +
    '<div class="tr-lk"><span class="tr-ok">✓</span><span>Marked as a training day</span></div>' +
    '<div class="tr-lk"><span class="tr-ok">✓</span><span>Water target <b>+' + (top / 1000).toFixed(1) + ' L</b> <span class="tr-mini">(' + fmtMins(trWorkoutsOn(w.d).reduce((x, y) => x + (y.m || 0), 0)) + ' training)</span></span></div>' +
    (burn ? '<div class="tr-lk"><span class="tr-dot"></span><span>Burned about <b>' + fmtK(burn) + ' kcal</b> <span class="tr-mini">— an estimate, not added to your target (your weight trend already counts it)</span></span></div>' : '') +
    (prot != null && prot > 0 ? '<div class="tr-lk"><span class="tr-dot"></span><span>Protein <b>' + prot + ' g</b> to go today</span></div>' : '') +
    '</div>';
  h += '<div class="section-title">EXERCISES</div><div class="tr-card">' + w.ex.map(e => '<div class="tr-row"><span>' + esc(e.n) + '</span><span class="tr-mini">' + e.sets.length + ' set' + (e.sets.length === 1 ? '' : 's') + '</span></div>').join('') + '</div>';
  if(fresh && !w.rt) h += '<button class="tr-ghost" id="tr-saveas">Save as a routine</button>';
  h += '<button class="save-btn" id="tr-fin-ok">Done</button>';
  const body = document.getElementById('tr-fin-body'); body.innerHTML = h;
  body.querySelector('#tr-fin-ok').onclick = () => closeSheet('tr-fin-backdrop');
  const sa = body.querySelector('#tr-saveas');
  if(sa) sa.onclick = () => { const rts = trJSON(TR_RT, []); const r = {id: trUid(), name: w.name, ex: w.ex.map(e => ({n: e.n, sets: e.sets.length}))};
    rts.push(r); trSave(TR_RT, rts); sa.textContent = 'Saved as “' + w.name + '”'; sa.disabled = true; trRefresh(); };
  openSheet('tr-fin-backdrop');
}

/* ---------------------------------------------------------------------
   HISTORY tab.
   --------------------------------------------------------------------- */
function trHistCard(w){
  const date = asDate(w.d).toLocaleDateString('en-GB', {weekday: 'short', day: 'numeric', month: 'short'});
  return '<button class="tr-card tr-hist" data-wo="' + w.id + '"><div class="tr-hist-h"><span>' + esc(w.n) + '</span><span>' + date + '</span></div>' +
    '<div class="tr-hist-s">' + fmtMins(w.m || 0) + ' · ' + fmtK(w.v || 0) + ' kg · ' + (w.k || 0) + ' sets</div>' +
    '<div class="tr-hist-x">' + esc((w.x || []).join(' · ')) + '</div></button>';
}
function trRenderHistory(box){
  const idx = trIdx().slice().reverse();
  // v150: Hevy import card at the top.
  if(!idx.length){ box.innerHTML = hevyCardHTML() + '<div class="tr-empty">Finished workouts show here.</div>'; hevyBindCard(box); return; }
  let h = hevyCardHTML(), month = '';
  idx.forEach(w => { const m = asDate(w.d).toLocaleDateString('en-GB', {month: 'long', year: 'numeric'});
    if(m !== month){ month = m; h += '<div class="section-title">' + m.toUpperCase() + '</div>'; } h += trHistCard(w); });
  box.innerHTML = h;
  box.querySelectorAll('[data-wo]').forEach(b => b.onclick = () => trOpenWorkout(b.dataset.wo));
  hevyBindCard(box);
}
function trOpenWorkout(id){
  const w = trLoadW(id); if(!w) return;
  const st = trWorkoutStats(w);
  const prs = []; w.ex.forEach(e => e.sets.forEach(s => { if(s.pr) prs.push({n: e.n, s}); }));
  trShowSummary(w, st, prs, [], false);
  const body = document.getElementById('tr-fin-body');
  // v150: the workout's own note (Hevy descriptions come in here).
  let sets = (w.note ? '<div class="section-title">NOTE</div><div class="tr-card" style="padding:12px 16px;">' + esc(w.note) + '</div>' : '') +
    '<div class="section-title">SETS</div>';
  w.ex.forEach(e => { const x = trEx(e.n); sets += '<div class="tr-card"><div class="tr-ex-n" style="margin-bottom:6px;">' + esc(e.n) + '</div>' +
    e.sets.map((s, i) => '<div class="tr-row"><span class="tr-mini">' + (s.t === 'w' ? 'Warm-up' : 'Set ' + (i + 1)) + '</span><span>' + esc(trFmtSet(s, x)) + (s.pr ? ' 🏆' : '') + '</span></div>').join('') +
    (e.note ? '<div class="tr-mini" style="margin-top:6px;">' + esc(e.note) + '</div>' : '') + '</div>'; });
  body.querySelector('#tr-fin-ok').insertAdjacentHTML('beforebegin', sets + '<button class="tr-ghost" id="tr-wo-del" style="border-style:solid; color:var(--danger); border-color:rgba(226,102,95,.3);">Delete workout</button>');
  body.querySelector('#tr-wo-del').onclick = () => {
    if(!confirm('Delete this workout? This cannot be undone.')) return;
    CS.removeItem(TR_W + id); trSave(TR_IDX, trIdx().filter(x => x.id !== id)); trUsageCache = null;
    closeSheet('tr-fin-backdrop'); trRefresh(); try{ renderDay(); }catch(e){}
  };
}

/* ---------------------------------------------------------------------
   EXERCISES tab: your ranks, then the whole library.
   --------------------------------------------------------------------- */
function trRenderExercises(box){
  const done = Array.from(trUsage().keys());
  const ranked = done.map(n => ({n, r: trRankOf(n)})).filter(o => o.r && o.r.tier >= 0).sort((a, b) => b.r.pct - a.r.pct);
  let h = '<div class="section-title" style="margin-top:4px;">MUSCLE MAP</div>' + trMuscleMap();
  // v144: highlights only - the top three lifts and your best and weakest
  // muscle groups. Everything else is in the stat library.
  h += '<div class="section-title">HIGHLIGHTS</div><div class="tr-card">';
  if(ranked.length){
    h += '<div class="tr-sub">Top lifts</div>' + ranked.slice(0, 3).map((o, i) => '<button class="tr-row tr-rowb" data-exo="' + esc(o.n) + '"><span><span class="tr-medal">' + ['🥇', '🥈', '🥉'][i] + '</span>' + esc(o.n) +
      '<span class="tr-mini tr-blk">stronger than ~' + o.r.pct + '% of lifters your size</span></span><span>' + trRankTag(o.r) + '</span></button>').join('');
    const S = trMuscleScores();
    const mus = Object.keys(S).filter(k => S[k].pct != null).sort((a, b) => S[b].pct - S[a].pct);
    if(mus.length){
      const best = mus[0], low = mus[mus.length - 1];
      h += '<div class="tr-sub" style="margin-top:10px;">Muscle groups</div>' +
        '<button class="tr-row tr-rowb" data-mug="' + best + '"><span>💪 Strongest: <b>' + best + '</b></span><span class="tr-mini">' + TR_MU_LOOK[S[best].k].n + ' · ~' + S[best].pct + '%</span></button>' +
        (mus.length > 1 ? '<button class="tr-row tr-rowb" data-mug="' + low + '"><span>🎯 Work on: <b>' + low + '</b></span><span class="tr-mini">' + TR_MU_LOOK[S[low].k].n + ' · ~' + S[low].pct + '%</span></button>' : '');
    }
  } else {
    h += '<div class="tr-rank"><div class="tr-badge">🏆</div><div><div style="font-weight:700;">No ranks yet</div><div class="tr-rank-s">Log the main lifts and each one is ranked against lifters of your sex and weight: Rookie, Apprentice, Contender, Strong, Beast, Champion.</div></div></div>';
  }
  h += '<button class="tr-lib-btn" id="tr-statlib"><span>📚 Stat library</span><span class="tr-mini">every muscle group and lift ›</span></button></div>';
  h += '<div class="tr-srch" style="margin-top:6px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10" cy="10" r="7"/><path d="M21 21l-6-6"/></svg><input id="tr-lib-q" type="search" placeholder="Search ' + fmtK(trLib().length) + ' exercises" autocomplete="off" spellcheck="false"></div>';
  h += '<div id="tr-lib-list" style="margin-top:6px;"></div>';
  box.innerHTML = h;
  box.querySelectorAll('[data-exo]').forEach(b => b.onclick = () => trOpenExercise(b.dataset.exo));
  trMuscleWire(box);
  box.querySelector('#tr-statlib').onclick = () => trStatLib(null);
  box.querySelectorAll('[data-mug]').forEach(b => b.onclick = () => trStatLib(b.dataset.mug));
  const q = box.querySelector('#tr-lib-q');
  const draw = () => {
    const res = trSearch(q.value, {}).slice(0, q.value.trim() ? 60 : 80);
    const list = document.getElementById('tr-lib-list');
    list.innerHTML = res.map(r => { const x = r.x; const rk = trRankOf(x.n);
      return '<button class="tr-exrow" data-exo="' + esc(x.n) + '"><div class="tr-exi">' + (TR_EQ_ICON[x.e] || '•') + '</div><div class="tr-exm"><div class="tr-exn">' + esc(x.n) + '</div><div class="tr-exs">' + esc(x.p) + ' · ' + esc(x.e) + (r.close ? ' · <span style="color:var(--accent)">close spelling</span>' : '') + '</div></div>' + (rk && rk.tier >= 0 ? trRankTag(rk) : '') + '</button>'; }).join('') ||
      '<div class="tr-empty">Nothing matches that.</div>';
    list.querySelectorAll('[data-exo]').forEach(b => b.onclick = () => trOpenExercise(b.dataset.exo));
  };
  let tm = null; q.oninput = () => { clearTimeout(tm); tm = setTimeout(draw, 60); };
  draw();
}

function trOpenExercise(name){
  const x = trEx(name);
  const hist = trHistoryOf(name).slice().reverse();         // oldest first for the chart
  const r = trRankOf(name);
  const b = trBests(name);
  let h = '<h3 style="margin-bottom:2px;">' + esc(name) + '</h3><div class="tr-mini" style="margin-bottom:14px;">' + esc([x.p].concat(x.s).join(' · ')) + ' · ' + esc(x.e) + '</div>';
  // v151: the moving picture, and this gym's best for machines.
  h += trClipHTML(name);
  if(trMachineLike(name) || trGymBase(name)){
    const gb = trGymBase(name);
    h += '<div class="tr-card" style="padding:12px 16px;"><div class="tr-row" style="padding:0;"><span><b>' + (trMachineLike(name) ? 'Best at ' + esc(trGymName()) : 'Your best') + '</b><div class="tr-mini">' +
      (gb && gb.kg != null && gb.how !== 'today' ? fmtKg(gb.kg) + ' kg × ' + gb.reps + ' (you set this)' : trGymHistory(name).length ? 'From your sets here' : 'Not set yet') + '</div></span>' +
      '<button class="tr-pill" id="tr-ex-best">Change</button></div></div>';
  }
  // Rank card.
  if(r){
    const L = r.L, unit = L.u === 'reps' ? ' reps' : ' kg';
    if(r.tier >= 0){
      const k = TR_RANKS[r.tier];
      h += '<div class="tr-card"><div class="tr-rank"><div class="tr-badge">' + k.icon + '</div><div><div class="tr-rank-n rk' + r.tier + '">' + k.n + '</div><div class="tr-rank-s">' + k.plain + ' · stronger than ~' + r.pct + '% of ' + (loadProfile().sex === 'female' ? 'women' : 'men') + ' around ' + Math.round(L.bw) + ' kg</div></div></div>' +
        '<div class="tr-ladder rk' + r.tier + '">' + TR_RANKS.map((q, i) => '<i class="' + (i <= r.tier ? 'on' : '') + '"></i>').join('') + '</div>' +
        '<div class="tr-ladder-l">' + TR_RANKS.map(q => '<span>' + q.icon + '</span>').join('') + '</div>' +
        '<div class="tr-row" style="margin-top:8px;"><span class="tr-mini">Your ' + (L.u === 'reps' ? 'best set' : 'estimated max') + '</span><span><b>' + fmtKg(Math.round(r.score * 2) / 2) + unit + '</b></span></div>' +
        (r.next ? '<div class="tr-row"><span class="tr-mini">Next: ' + TR_RANKS[r.tier + 1].icon + ' ' + TR_RANKS[r.tier + 1].n + '</span><span><b>' + fmtKg(Math.round(r.next * 2) / 2) + unit + '</b> <span class="tr-mini">(+' + fmtKg(Math.max(0.5, Math.round((r.next - r.score) * 2) / 2)) + ')</span></span></div>' : '') +
        (r.machine ? '<div class="tr-mini" style="margin-top:6px;">Machines and cables differ between gyms, so treat this rank as rough.</div>' : '') + '</div>';
    } else {
      h += '<div class="tr-card"><div class="tr-rank"><div class="tr-badge">🏆</div><div><div style="font-weight:700;">Not ranked yet</div><div class="tr-rank-s">Log a set and COACH ranks you against lifters of your sex and weight.</div></div></div></div>';
    }
    h += '<div class="tr-card"><div class="tr-sec" style="margin-top:0;">The lines for you</div>' + TR_RANKS.slice(1).map((q, i) => '<div class="tr-row"><span>' + q.icon + ' ' + q.n + ' <span class="tr-mini">' + q.plain.toLowerCase() + '</span></span><span>' + fmtKg(Math.round(L.v[i] * 2) / 2) + unit + '</span></div>').join('') +
      '<div class="tr-mini" style="margin-top:6px;">From Strength Level’s standards for ' + (loadProfile().sex === 'female' ? 'women' : 'men') + ' at ' + Math.round(L.bw) + ' kg' + (L.u === 'reps' ? ' (reps in one set)' : ' (one-rep max, worked out from your best set)') + '.</div></div>';
  }
  // Progress chart.
  const pts = hist.map(hh => { const v = x.t === 'b' || x.t === 't' || x.t === 'c'
      ? Math.max(...hh.sets.map(s => x.t === 'c' ? (Number(s.km) || 0) : x.t === 't' ? (Number(s.sec) || 0) / 60 : (Number(s.reps) || 0)))
      : Math.max(...hh.sets.map(s => trE1rm(s.kg, s.reps) || 0)); return {d: hh.d, v}; }).filter(p => p.v > 0);
  if(pts.length >= 2){
    const lab = x.t === 'b' ? 'Most reps' : x.t === 't' ? 'Longest (min)' : x.t === 'c' ? 'Furthest (km)' : 'Estimated max (kg)';
    const lo = Math.min(...pts.map(p => p.v)), hi = Math.max(...pts.map(p => p.v)), span = Math.max(1e-6, hi - lo);
    const xy = pts.map((p, i) => [6 + i * (308 / (pts.length - 1)), 104 - (p.v - lo) / span * 84]);
    const d0 = pts[pts.length - 1].v - pts[0].v;
    h += '<div class="tr-card tr-chart"><div class="tr-ch-v"><b>' + lab + '</b><span>' + (d0 >= 0 ? '+' : '') + fmtKg(Math.round(d0 * 10) / 10) + ' since ' + asDate(pts[0].d).toLocaleDateString('en-GB', {day: 'numeric', month: 'short'}) + '</span></div>' +
      '<svg viewBox="0 0 320 112" width="100%" height="112"><g stroke="#2b303a"><line x1="0" y1="20" x2="320" y2="20"/><line x1="0" y1="62" x2="320" y2="62"/><line x1="0" y1="104" x2="320" y2="104"/></g>' +
      '<polyline fill="none" stroke="#7fe0b0" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="' + xy.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ') + '"/>' +
      '<circle cx="' + xy[xy.length - 1][0].toFixed(1) + '" cy="' + xy[xy.length - 1][1].toFixed(1) + '" r="4" fill="#7fe0b0"/></svg>' +
      '<div class="tr-ch-x"><span>' + asDate(pts[0].d).toLocaleDateString('en-GB', {day: 'numeric', month: 'short'}) + '</span><span>' + asDate(pts[pts.length - 1].d).toLocaleDateString('en-GB', {day: 'numeric', month: 'short'}) + '</span></div></div>';
  }
  // Bests.
  if(hist.length){
    h += '<div class="section-title">BESTS</div><div class="tr-card">';
    if(x.t === 'c') h += '<div class="tr-row"><span>Furthest</span><span><b>' + fmtKg(b.km) + ' km</b></span></div><div class="tr-row"><span>Longest</span><span><b>' + fmtMins(b.sec / 60) + '</b></span></div>';
    else if(x.t === 't') h += '<div class="tr-row"><span>Longest</span><span><b>' + fmtDur(b.sec) + '</b></span></div>';
    else {
      if(b.kg) h += '<div class="tr-row"><span>Heaviest weight</span><span><b>' + fmtKg(b.kg) + ' kg</b></span></div>';
      if(b.e1) h += '<div class="tr-row"><span>Estimated max</span><span><b>' + fmtKg(Math.round(b.e1 * 2) / 2) + ' kg</b></span></div>';
      if(b.vol) h += '<div class="tr-row"><span>Best set volume</span><span><b>' + fmtK(b.vol) + ' kg</b></span></div>';
      h += '<div class="tr-row"><span>Most reps</span><span><b>' + b.reps + '</b></span></div>';
    }
    h += '</div><div class="section-title">HISTORY</div><div class="tr-card">' + hist.slice().reverse().slice(0, 30).map(hh =>
      '<div class="tr-row" style="align-items:flex-start;"><span class="tr-mini" style="font-size:13px;">' + asDate(hh.d).toLocaleDateString('en-GB', {day: 'numeric', month: 'short'}) + '</span><span style="font-size:12.5px; color:var(--t2);">' + hh.sets.map(s => esc(trFmtSet(s, x))).join(' · ') + '</span></div>').join('') + '</div>';
  } else h += '<div class="tr-empty">No sets logged yet.</div>';
  if(x.mine) h += '<button class="tr-ghost" id="tr-ex-del" style="border-style:solid; color:var(--danger);">Delete my exercise</button>';
  h += '<div id="tr-ex-how"></div>';
  const body = document.getElementById('tr-ex-body'); body.innerHTML = h;
  trHowTo(name, body.querySelector('#tr-ex-how'));
  const cb = body.querySelector('#tr-ex-best');
  if(cb) cb.onclick = () => { const g = trGyms(); const k = trGymKey(name); if(g.best[k]) delete g.best[k][name]; delete g.asked[name]; trGymSave(g);
    closeSheet('tr-ex-backdrop'); setTimeout(() => trGymAsk([name], () => trOpenExercise(name)), HANDOFF); };
  const del = body.querySelector('#tr-ex-del');
  if(del) del.onclick = () => { if(!confirm('Delete ' + name + '? Past workouts keep their sets.')) return; trSave(TR_CUSTOM, trJSON(TR_CUSTOM, []).filter(c => c.n !== name)); TR_LIB = null; closeSheet('tr-ex-backdrop'); trRefresh(); };
  openSheet('tr-ex-backdrop');
}

/* ---------------------------------------------------------------------
   Routines.
   --------------------------------------------------------------------- */
let trRtEdit = null;
function trEditRoutine(id){
  const rts = trJSON(TR_RT, []);
  trRtEdit = id ? JSON.parse(JSON.stringify(rts.find(r => r.id === id) || null)) : {id: trUid(), name: '', ex: [], fresh: true};
  if(!trRtEdit) return;
  trRtRender2();
  openSheet('tr-rt-backdrop');
}
function trRtRender(){
  const r = trRtEdit;
  let h = '<h3>' + (r.fresh ? 'New routine' : 'Edit routine') + '</h3><input class="tr-fld" id="tr-rt-name" placeholder="Name, e.g. Push" value="' + esc(r.name) + '">';
  h += r.ex.map((e, i) => '<div class="tr-rt-ex"><span>' + esc(e.n) + '<div class="tr-mini">' + (e.sets || 3) + ' sets</div></span><button data-rs="' + i + ':-1">−</button><button data-rs="' + i + ':1">+</button><button data-rx="' + i + '">✕</button></div>').join('');
  h += '<button class="tr-ghost" id="tr-rt-add" style="margin-top:12px;">' + TR_I.plus + ' Add exercises</button>';
  h += '<button class="save-btn" id="tr-rt-save">Save routine</button>';
  if(!r.fresh) h += '<button class="tr-ghost" id="tr-rt-del" style="border-style:solid; color:var(--danger); margin-top:12px;">Delete routine</button>';
  const body = document.getElementById('tr-rt-body'); body.innerHTML = h;
  body.querySelector('#tr-rt-name').oninput = ev => { r.name = ev.target.value; };
  body.querySelectorAll('[data-rs]').forEach(b => b.onclick = () => { const [i, d] = b.dataset.rs.split(':').map(Number); r.ex[i].sets = Math.max(1, Math.min(12, (r.ex[i].sets || 3) + d)); trRtRender(); });
  body.querySelectorAll('[data-rx]').forEach(b => b.onclick = () => { r.ex.splice(+b.dataset.rx, 1); trRtRender(); });
  body.querySelector('#tr-rt-add').onclick = () => { closeSheet('tr-rt-backdrop'); setTimeout(() => trOpenPicker('add', null, 'routine'), HANDOFF); };
  body.querySelector('#tr-rt-save').onclick = () => {
    r.name = (r.name || '').trim() || 'Routine';
    const rts = trJSON(TR_RT, []).filter(x => x.id !== r.id); const o = {id: r.id, name: r.name.slice(0, 40), ex: r.ex};
    const old = trJSON(TR_RT, []).findIndex(x => x.id === r.id);
    if(old >= 0) rts.splice(old, 0, o); else rts.push(o);
    trSave(TR_RT, rts); closeSheet('tr-rt-backdrop'); trRefresh();
  };
  const del = body.querySelector('#tr-rt-del');
  if(del) del.onclick = () => { if(!confirm('Delete this routine?')) return; trSave(TR_RT, trJSON(TR_RT, []).filter(x => x.id !== r.id)); closeSheet('tr-rt-backdrop'); trRefresh(); };
}
function trRoutineAdd(names){
  if(!trRtEdit) return;
  names.forEach(n => { if(!trRtEdit.ex.find(e => e.n === n)) trRtEdit.ex.push({n, sets: 3}); });
  setTimeout(() => { trRtRender2(); openSheet('tr-rt-backdrop'); }, HANDOFF);
}

/* ---------------------------------------------------------------------
   Links into the food side.
   --------------------------------------------------------------------- */
// The Training day chip on the day card names the session.
function trChipLabel(d){
  const ws = trWorkoutsOn(ymd(asDate(d)));
  if(!ws.length) return null;
  const m = ws.reduce((x, w) => x + (w.m || 0), 0);
  return (ws.length === 1 ? ws[0].n : ws.length + ' workouts') + ' · ' + fmtMins(m);
}
// For reviews: the period's training in one line.
function trPeriodSummary(fromYmd, toYmd){
  const ws = trIdx().filter(w => w.d >= fromYmd && w.d <= toYmd);
  if(!ws.length) return null;
  let prs = 0; ws.forEach(w => { const x = trLoadW(w.id); if(x) x.ex.forEach(e => e.sets.forEach(s => { if(s.pr) prs++; })); });
  const muscles = new Set(); ws.forEach(w => (w.x || []).forEach(n => { const x = trEx(n); if(x.p && x.p !== 'Other') muscles.add(x.p); }));
  const big = ['Chest', 'Upper Back', 'Lats', 'Shoulders', 'Quads', 'Hamstrings', 'Glutes'];
  return {n: ws.length, vol: ws.reduce((x, w) => x + (w.v || 0), 0), mins: ws.reduce((x, w) => x + (w.m || 0), 0), prs,
          missed: big.filter(m => !muscles.has(m))};
}

/* Start-up: back to the side you were on, and the rest timer if one is running. */
(function trInit(){
  try{
    const m = CS.getItem(TR_MODE);
    if(m === 'train' || trActive()) setMode(m === 'train' || trActive() ? 'train' : 'eat', true);
  }catch(e){}
  document.addEventListener('visibilitychange', () => { if(!document.hidden){ trRestRender(); if(trMode === 'train' && trView === 'workout' && trActive()){ /* clock restarts itself */ trRefresh(); } } });
})();

/* ---------------------------------------------------------------------
   v144: Muscle map. The same figure as the Day card, front and back, each
   muscle coloured from the ranks of the lifts that work it.
     red    weak       (Rookie, Apprentice: weaker than ~80% of lifters)
     yellow average    (Contender)
     green  strong     (Strong, Beast)
     gold   champion   (Champion: animated)
     grey   not sure   (no ranked lift works it yet)
   A lift counts fully for its main muscle and half for the others.
   --------------------------------------------------------------------- */
const TR_MU_FRONT = {
  Traps: 'M82 47 C85 53 89 56 93 58 L82 59 Z',
  Shoulders: 'M93 59 C102 60 109 65 111 75 C112 82 110 87 106 88 C103 82 99 74 94 70 Z',
  Chest: 'M76.5 64 C84 61 93 62 98 69 C101 76 100 85 95 90 C89 93 81 93 76.5 91 Z',
  Biceps: 'M103 91 C108 90 112 96 113 106 C114 116 112 126 109 130 C105 128 103 118 102 108 C101 100 101 94 103 91 Z',
  Forearms: 'M108 140 C113 138 117 146 119 158 C121 170 121 180 119 186 C115 184 112 174 110 164 C108 154 107 146 108 140 Z',
  Abs: 'M76.5 97 L87 97 C88 120 88 146 87 166 L76.5 172 Z',
  Obliques: 'M89 100 C94 104 97 116 97 136 C97 150 95 160 90 166 C90 146 90 120 89 100 Z',
  Quads: 'M80 190 C87 184 98 182 101 196 C103 214 102 232 99 246 C94 250 87 250 83 244 C81 228 79 208 80 190 Z',
  Adductors: 'M76.5 190 L80 194 C80 210 81 226 81 236 L76.5 226 Z',
  Calves: 'M88 262 C93 258 99 262 99 274 C99 288 97 298 93 302 C89 298 87 288 87 276 C87 270 87 265 88 262 Z'
};
const TR_MU_BACK = {
  Traps: 'M75 44 L82 46 C85 53 89 56 94 59 C88 66 82 74 79 86 L75 98 Z',
  Shoulders: 'M95 60 C103 61 109 66 111 75 C112 82 110 87 106 88 C103 81 99 73 95 68 Z',
  'Upper Back': 'M80 88 C83 78 88 70 95 70 C97 76 96 84 93 90 C89 96 84 104 79 110 Z',
  Lats: 'M95 92 C99 98 100 108 99 118 C98 132 94 144 87 150 C83 142 81 130 81 116 C84 108 90 98 95 92 Z',
  Triceps: 'M102 90 C107 89 112 95 113 105 C114 116 112 126 109 131 C105 128 103 118 102 108 C101 100 101 94 102 90 Z',
  Forearms: 'M108 140 C113 138 117 146 119 158 C121 170 121 180 119 186 C115 184 112 174 110 164 C108 154 107 146 108 140 Z',
  'Lower Back': 'M76.5 116 L80 114 C81 130 83 142 87 152 C84 158 80 162 76.5 164 Z',
  Glutes: 'M76.5 168 C84 162 98 162 101 178 C103 192 96 202 86 202 C80 201 76.5 196 76.5 188 Z',
  Hamstrings: 'M80 206 C88 202 99 204 101 216 C102 230 100 242 96 248 C90 250 84 246 82 238 C81 226 80 216 80 206 Z',
  Calves: 'M84 258 C91 250 100 256 100 270 C100 286 97 298 92 302 C87 298 84 290 83 278 C83 270 83 263 84 258 Z'
};
// Which logged muscle names feed each map region.
const TR_MU_FROM = {Traps: ['Traps', 'Neck'], Shoulders: ['Shoulders'], Chest: ['Chest'], Biceps: ['Biceps'], Triceps: ['Triceps'], Forearms: ['Forearms'],
  Abs: ['Abs'], Obliques: ['Abs'], Quads: ['Quads'], Adductors: ['Adductors', 'Abductors'], Calves: ['Calves'], 'Upper Back': ['Upper Back'], Lats: ['Lats'],
  'Lower Back': ['Lower Back'], Glutes: ['Glutes', 'Abductors'], Hamstrings: ['Hamstrings']};
const TR_MU_LOOK = {
  weak:  {c: '#e2665f', n: 'Weak'},
  avg:   {c: '#e0b95f', n: 'Average'},
  strong:{c: '#7fe0b0', n: 'Strong'},
  champ: {c: 'url(#trmu-gold)', n: 'Champion'},
  none:  {c: '#3a404b', n: 'Not sure yet'}};
function trMuscleScores(){
  const per = {};      // map region -> {w, sum, lifts:[]}
  trUsage().forEach((_, name) => {
    const r = trRankOf(name); if(!r || r.tier < 0) return;
    const x = trEx(name);
    Object.keys(TR_MU_FROM).forEach(reg => {
      const from = TR_MU_FROM[reg];
      const w = from.indexOf(x.p) >= 0 ? 1 : x.s.some(m => from.indexOf(m) >= 0) ? 0.5 : 0;
      if(!w) return;
      const o = per[reg] || (per[reg] = {w: 0, sum: 0, lifts: []});
      o.w += w; o.sum += w * r.pct; o.lifts.push({n: name, r, main: w === 1});
    });
  });
  const out = {};
  Object.keys(TR_MU_FROM).forEach(reg => {
    const o = per[reg];
    // One main lift, or two that only help, before a muscle gets a colour.
    if(!o || o.w < 1){ out[reg] = {k: 'none', pct: null, lifts: o ? o.lifts : []}; return; }
    // v151: a muscle is ranked on the lifts that mainly train it. Lifts where it only
    // helps (triceps on a press) count only when there's no main lift.
    const main = o.lifts.filter(l => l.main);
    const pct = main.length ? Math.round(main.reduce((s, l) => s + l.r.pct, 0) / main.length) : Math.round(o.sum / o.w);
    const k = pct >= 95 ? 'champ' : pct >= 50 ? 'strong' : pct >= 20 ? 'avg' : 'weak';
    out[reg] = {k, pct, lifts: o.lifts.sort((a, b) => b.main - a.main || b.r.pct - a.r.pct)};
  });
  return out;
}
function trMuscleMap(){
  const S = trMuscleScores();
  const fig = (typeof bcFigure === 'function') ? bcFigure() : '';
  const side = (paths, label, dx) => {
    let g = '<g transform="translate(' + dx + ' 0)"><g fill="#1c2027" stroke="#1c2027" stroke-width="1.2" stroke-linejoin="round">' + fig + '</g>';
    Object.keys(paths).forEach(reg => {
      const s = S[reg] || {k: 'none'}, L = TR_MU_LOOK[s.k];
      const one = '<path d="' + paths[reg] + '"/>', two = '<path d="' + paths[reg] + '" transform="matrix(-1 0 0 1 150 0)"/>';
      g += '<g class="trmu ' + s.k + '" data-mu="' + reg + '" fill="' + L.c + '" fill-opacity="' + (s.k === 'none' ? 1 : .9) + '" stroke="#171a20" stroke-width="1.1" stroke-linejoin="round">' + one + two + '</g>';
    });
    g += '<text x="75" y="350" text-anchor="middle" class="trmu-l">' + label + '</text></g>';
    return g;
  };
  const anyChamp = Object.values(S).some(s => s.k === 'champ');
  let h = '<svg viewBox="0 0 320 360" width="100%" class="trmu-svg" role="img" aria-label="Your muscles, front and back">' +
    '<defs><linearGradient id="trmu-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".35" stop-color="#ffd25e"><animate attributeName="offset" values=".1;.6;.1" dur="2.6s" repeatCount="indefinite"/></stop>' +
    '<stop offset=".6" stop-color="#ffb52e"/><stop offset="1" stop-color="#c47bff"><animate attributeName="stop-color" values="#c47bff;#ff8a5e;#c47bff" dur="3.4s" repeatCount="indefinite"/></stop></linearGradient></defs>' +
    side(TR_MU_FRONT, 'Front', 2) + side(TR_MU_BACK, 'Back', 168) + '</svg>';
  const legend = ['champ', 'strong', 'avg', 'weak', 'none'].filter(k => k !== 'champ' || anyChamp)
    .map(k => '<span class="trmu-k"><i class="' + k + '" style="background:' + (k === 'champ' ? 'linear-gradient(135deg,#fff3c4,#ffb52e,#c47bff)' : TR_MU_LOOK[k].c) + '"></i>' + TR_MU_LOOK[k].n + '</span>').join('');
  return '<div class="tr-card trmu-card">' + h + '<div class="trmu-legend">' + legend + '</div><div class="trmu-tip" id="trmu-tip">Tap a muscle to see the lifts behind it.</div></div>';
}
function trMuscleWire(root){
  const S = trMuscleScores();
  root.querySelectorAll('[data-mu]').forEach(g => g.onclick = () => {
    const reg = g.dataset.mu, s = S[reg], tip = root.querySelector('#trmu-tip'); if(!tip) return;
    root.querySelectorAll('.trmu.sel').forEach(x => x.classList.remove('sel'));
    root.querySelectorAll('[data-mu="' + reg + '"]').forEach(x => x.classList.add('sel'));
    if(!s || !s.lifts.length){ tip.innerHTML = '<b>' + reg + '</b> · not sure yet. Log a ranked lift that works it.'; return; }
    tip.innerHTML = '<div class="tr-row" style="padding:0 0 4px;"><b>' + reg + '</b><span class="tr-mini">' + (s.pct == null ? 'needs one main lift' : TR_MU_LOOK[s.k].n + ' · ~' + s.pct + '%') + '</span></div>' +
      s.lifts.slice(0, 5).map(l => '<div class="tr-row" style="padding:3px 0;"><span style="font-size:13px;">' + esc(l.n) + (l.main ? '' : ' <span class="tr-mini">(helps)</span>') + '</span><span>' + trRankTag(l.r) + '</span></div>').join('');
    try{ buzz(); }catch(e){}
  });
}

/* ---------------------------------------------------------------------
   v144: Stat library. Muscle groups, then the lifts in each, then the lift.
   --------------------------------------------------------------------- */
function trStatLib(group){
  const S = trMuscleScores();
  const body = document.getElementById('tr-wo-body');
  const done = Array.from(trUsage().keys());
  const liftsFor = reg => { const from = TR_MU_FROM[reg];
    return done.map(n => ({n, x: trEx(n)})).filter(o => from.indexOf(o.x.p) >= 0 || o.x.s.some(m => from.indexOf(m) >= 0))
      .map(o => ({n: o.n, x: o.x, main: from.indexOf(o.x.p) >= 0, r: trRankOf(o.n), b: trBests(o.n)}))
      .sort((a, b) => b.main - a.main || ((b.r && b.r.pct) || -1) - ((a.r && a.r.pct) || -1)); };
  const dot = k => '<i class="trmu-dot" style="background:' + (k === 'champ' ? 'linear-gradient(135deg,#fff3c4,#ffb52e,#c47bff)' : TR_MU_LOOK[k].c) + '"></i>';
  let h;
  if(!group){
    const regs = Object.keys(TR_MU_FROM).sort((a, b) => ((S[b].pct == null ? -1 : S[b].pct) - (S[a].pct == null ? -1 : S[a].pct)) || a.localeCompare(b));
    h = '<h3>Stat library</h3><div class="tr-mini" style="margin:-6px 0 12px;">Every muscle group, strongest first.</div><div class="tr-card">' +
      regs.map(reg => { const s = S[reg], n = liftsFor(reg).length;
        return '<button class="tr-row tr-rowb" data-sg="' + reg + '"><span>' + dot(s.k) + '<b>' + reg + '</b><span class="tr-mini tr-blk">' + n + ' lift' + (n === 1 ? '' : 's') + ' logged</span></span>' +
          '<span class="tr-mini">' + TR_MU_LOOK[s.k].n + (s.pct != null ? ' · ~' + s.pct + '%' : '') + ' ›</span></button>'; }).join('') + '</div>';
  } else {
    const s = S[group], L = liftsFor(group);
    h = '<button class="tr-back" id="tr-sl-back">‹ Stat library</button><h3>' + dot(s.k) + group + '</h3><div class="tr-mini" style="margin:-6px 0 12px;">' + TR_MU_LOOK[s.k].n +
      (s.pct != null ? ' · stronger than ~' + s.pct + '% of lifters your size' : ' · needs one ranked main lift') + '</div>';
    h += L.length ? '<div class="tr-card">' + L.map(o => {
        const st = o.x.t === 'c' ? (o.b.km ? fmtKg(o.b.km) + ' km best' : fmtMins(o.b.sec / 60) + ' best') : o.x.t === 't' ? fmtDur(o.b.sec) + ' best'
          : o.x.t === 'b' ? o.b.reps + ' reps best' : (o.b.e1 ? 'est. max ' + fmtKg(Math.round(o.b.e1 * 2) / 2) + ' kg' : 'best ' + fmtKg(o.b.kg) + ' kg');
        return '<button class="tr-row tr-rowb" data-exo="' + esc(o.n) + '"><span>' + esc(o.n) + '<span class="tr-mini tr-blk">' + st + (o.main ? '' : ' · helps') + '</span></span><span>' +
          (o.r && o.r.tier >= 0 ? trRankTag(o.r) : '<span class="tr-mini">no rank ›</span>') + '</span></button>'; }).join('') + '</div>'
      : '<div class="tr-empty">No lifts for this muscle logged yet.</div>';
  }
  body.innerHTML = h;
  body.querySelectorAll('[data-sg]').forEach(b => b.onclick = () => { trStatLib(b.dataset.sg); body.closest('.sheet').scrollTop = 0; });
  body.querySelectorAll('[data-exo]').forEach(b => b.onclick = () => { closeSheet('tr-wo-backdrop'); setTimeout(() => trOpenExercise(b.dataset.exo), HANDOFF); });
  const back = body.querySelector('#tr-sl-back'); if(back) back.onclick = () => trStatLib(null);
  if(!document.getElementById('tr-wo-backdrop').classList.contains('open')) openSheet('tr-wo-backdrop');
}
