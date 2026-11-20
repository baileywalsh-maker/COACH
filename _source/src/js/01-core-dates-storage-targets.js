const STORE_KEY_PREFIX = 'calorielog:';
const TARGET_KEY = 'calorietarget';
var CYCLING_RETIRED = true;   // v130: same calories every day - see targetsFor()
const RECENTS_KEY = 'calorierecents';
const TSNAP_PREFIX = 'calorietargetsnap:';   // what the target actually was on a given day
const REVIEWS_KEY = 'caloriereviews';        // history of weekly reviews
const LASTREVIEW_KEY = 'calorielastreview';  // week-start of the last review shown
let currentDate = new Date();
let targets = { kcal: 2400, protein: 150, carbs: 250, fat: 80 };
let stream = null, detector = null, scanLoop = null, zxingReader = null;
let currentView = 'day';

// Local calendar date as YYYY-MM-DD.
// NEVER use toISOString() to build a day key: it converts to UTC, so a
// local-midnight Date lands on the PREVIOUS day whenever the offset is
// ahead of UTC (BST, CEST, AEST...). That desynced the day view from the
// week/budget/adaptive views by one day for most of the year.
function ymd(d){
  const p = n => String(n).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
}
// Parse a YYYY-MM-DD key back to LOCAL midnight.
// new Date('2026-08-18') parses as UTC midnight — same bug in reverse.
function parseYMD(s){
  const [y,m,dd] = String(s).split('-').map(Number);
  return new Date(y, (m||1)-1, dd||1);
}
function todayYMD(){ return ymd(new Date()); }

function dkey(d){ return STORE_KEY_PREFIX + ymd(d); }
function fmt0(n){ return Math.round(n); }
// v120: display only - '2,650'. Never used for arithmetic; fmt0 still is.
function fmtK(n){ return Math.round(Number(n)||0).toLocaleString('en-GB'); }
// One decimal, but only when it says something: 2.5 g matters, 2.0 g does not.
function round1(x){ const v = Math.round(x*10)/10; return v === Math.round(v) ? String(Math.round(v)) : v.toFixed(1); }
function addDays(d,n){ const r = new Date(d); r.setDate(r.getDate()+n); return r; }

function loadTargets(){
  try{ const t = JSON.parse(CS.getItem(TARGET_KEY)); if(t) targets = t; }catch(e){}
}
function saveTargets(){ lsSet(TARGET_KEY, JSON.stringify(targets)); }

// Every path that changes your targets goes through here — manual, profile,
// adaptive, weekly review. That is what guarantees the history has no holes.
function setTargets(next, source, why){
  const before = Math.round(targets.kcal);
  targets = next;
  saveTargets();
  recordTargetSnapshot(new Date());
  if(Math.round(targets.kcal) !== before){
    pushAdjust({ date: todayYMD(), from: before, to: Math.round(targets.kcal), source, why });
  }
  renderTargetProvenance();
}

/* v112: a day used to be parsed and re-filled from the tables every time
   anything asked for it, and one screen can ask for the same day a dozen
   times. The filled result is now kept against the exact text that is stored,
   so the moment a day changes - by any route - it is read fresh. What comes
   back is always a copy, so nothing a caller does to it can leak into the
   next read. */
const dayCache = new Map();
function copyEntry(e){
  if(!e || typeof e !== 'object') return e;
  const c = Object.assign({}, e);
  if(e.micros && typeof e.micros === 'object') c.micros = Object.assign({}, e.micros);
  if(e._fill && typeof e._fill === 'object') c._fill = Object.assign({}, e._fill);
  return c;
}
function loadEntries(d){
  let key, raw = null;
  try{ key = dkey(d); raw = CS.getItem(key); }catch(e){ return []; }
  if(raw == null) return [];
  const hit = dayCache.get(key);
  if(hit && hit.raw === raw && hit.epoch === fillEpoch) return hit.es.map(copyEntry);
  const es = loadEntriesRaw(d, raw);
  if(dayCache.size > 400) dayCache.clear();
  dayCache.set(key, {raw: raw, epoch: fillEpoch, es: es.map(copyEntry)});
  return es;
}
// For loops that only LOOK at a day - counting it, adding it up. No copy is
// made, so nothing that uses this may change what it is handed.
function loadEntriesRO(d){
  let key, raw = null;
  try{ key = dkey(d); raw = CS.getItem(key); }catch(e){ return []; }
  if(raw == null) return [];
  const hit = dayCache.get(key);
  if(hit && hit.raw === raw && hit.epoch === fillEpoch) return hit.es;
  loadEntries(d);
  const now = dayCache.get(key);
  return now ? now.es : [];
}
function loadEntriesRaw(d, raw){
  let es;
  try{ es = JSON.parse(raw) || []; }
  catch(e){
    // Unreadable. Keep a copy before anything can save over it, so a bad
    // write is recoverable instead of silently replaced by an empty day.
    try{ if(raw && !CS.getItem('caloriecorrupt:' + ymd(asDate(d)))) lsSet('caloriecorrupt:' + ymd(asDate(d)), raw); }catch(err){}
    return [];
  }
  if(!Array.isArray(es)) return [];
  if(typeof hydrateEntry !== 'function') return es;
  return es.map(e=>{ try{ return hydrateEntry(e); }catch(err){ return e; } });
}
function saveEntries(d, entries){
  if(typeof dehydrateEntry === 'function') entries = (entries || []).map(dehydrateEntry);
  // v144: every entry gets a stable id, and `upd` when its food changed —
  // that is what lets Sync with Muse merge this day entry by entry.
  try{ entries = museSyncStampDay(d, entries); }catch(e){}
  lsSet(dkey(d), JSON.stringify(entries));
  try{ museSyncSoon(); }catch(e){}
  // Freeze the target in force on the first day it gets used, so a later
  // change to `targets` cannot retroactively rewrite what this day was judged against.
  if(!CS.getItem(snapKey(d))) recordTargetSnapshot(d);
}

// Accepts a Date or a 'YYYY-MM-DD' string. Half the app holds dates one way and
// half the other, and passing the wrong one used to throw inside ymd().
function asDate(d){ return (d instanceof Date) ? d : parseYMD(String(d)); }
function snapKey(d){ return TSNAP_PREFIX + ymd(asDate(d)); }
// Stores the whole macro set. It used to store a bare kcal number, which meant
// the protein target that applied on a past day was simply unrecoverable — and
// a review cannot say whether you hit a target it cannot name.
function recordTargetSnapshot(d){
  try{
    const t = targetsFor(asDate(d));
    lsSet(snapKey(d), JSON.stringify({k:t.kcal, p:t.protein, c:t.carbs, f:t.fat}));
  }catch(e){}
}
// The targets that applied on a given day: the frozen snapshot if there is one,
// otherwise today's (future days, or days logged before snapshots existed).
function snapFor(d){
  const raw = CS.getItem(snapKey(d));
  if(raw){
    if(raw.charAt(0) === '{'){
      try{
        const o = JSON.parse(raw);
        if(o && o.k > 0) return {kcal:o.k, protein:o.p||0, carbs:o.c||0, fat:o.f||0};
      }catch(e){}
    }
    // Pre-v39: a bare number. The macros are derived, so protein is g/kg of
    // CURRENT bodyweight rather than what it was that week. Approximate on
    // purpose, and only for days recorded before this version.
    const n = Number(raw);
    if(n > 0){ const m = macrosFor(n); m.kcal = n; return m; }
  }
  return targetsFor(d);
}
function targetForDay(d){ return snapFor(d).kcal; }

/* v129: THE target for a day, used by every screen. Past days: what was frozen
   on that day. Today and later: the live target (base, cycling, training
   day) - and today's frozen copy is brought into line with it on the spot, so
   the day screen and the reviews can never show two different numbers for
   today. Before this, the day screen always showed the LIVE target, even on a
   past day, while reviews used the frozen one. */
function dayTargets(d){
  d = asDate(d);
  const ds = ymd(d), today = todayYMD();
  if(ds < today) return snapFor(d);
  const live = targetsFor(d);
  if(ds === today){
    try{
      const s = snapFor(d);
      if(Math.round(s.kcal) !== Math.round(live.kcal) || Math.round(s.protein) !== Math.round(live.protein))
        recordTargetSnapshot(d);
    }catch(e){}
  }
  return live;
}

// The target a day was actually judged against. There were three answers to
// this in the app at once: the frozen snapshot, today's live target, and the
// bare `targets.kcal` global - so the day strip could read "5 of 6 in band"
// while the Week tab beside it read "1/7" for the same seven days. The snapshot
// is the right answer, because it is what the app was showing you at the time;
// targetsFor() only fills in for days logged before snapshots existed.
function judgedTarget(d){ return targetForDay(d); }


function loadRecents(){
  try{ return JSON.parse(CS.getItem(RECENTS_KEY)) || []; }catch(e){ return []; }
}
function pushRecent(item){
  let recents = loadRecents();
  recents = recents.filter(r=>r.name.toLowerCase()!==item.name.toLowerCase());
  recents.unshift(item);
  recents = recents.slice(0,10);
  lsSet(RECENTS_KEY, JSON.stringify(recents));
}

function dayLabel(d){
  const today = new Date(); today.setHours(0,0,0,0);
  const cmp = new Date(d); cmp.setHours(0,0,0,0);
  const diff = Math.round((cmp-today)/86400000);
  if(diff===0) return 'Today';
  if(diff===-1) return 'Yesterday';
  if(diff===1) return 'Tomorrow';
  return cmp.toLocaleDateString(undefined,{weekday:'short', day:'numeric', month:'short'});
}

const STREAK_MILESTONES = [3,7,14,21,30,50,75,100,150,200,250,300,365];
const LASTSTREAK_KEY = 'coachlaststreak';

function streakTier(n){
  if(n >= 100) return 'gold';
  if(n >= 30) return 'blaze';
  if(n >= 14) return 'hot';
  if(n >= 7) return 'warm';
  return '';
}

function renderStreakBadge(){
  const el = document.getElementById('streak-badge');
  if(!el) return;
  const n = computeStreak();
  const tier = streakTier(n);
  const isMilestone = STREAK_MILESTONES.includes(n);

  el.className = 'streak' + (tier ? ' '+tier : '');
  el.innerHTML = '<i class="ti ti-'+(n>=100?'trophy':'flame')+'" aria-hidden="true"></i> '+n;

  // Celebrate a milestone once, on the day it is reached — not every time the
  // day view re-renders, which would make it flap.
  const seen = CS.getItem(LASTSTREAK_KEY);
  if(isMilestone && seen !== String(n)){
    lsSet(LASTSTREAK_KEY, String(n));
    el.classList.add('milestone');
    setTimeout(()=>el.classList.remove('milestone'), 700);
    sfx('streak', 0.5);
  }
  if(!isMilestone && n === 0) CS.removeItem(LASTSTREAK_KEY);

  renderStreakNote(n);
}

// v141: the streak note's element was removed in an earlier redesign; kept as a no-op for its callers.
function renderStreakNote(n){}

/* v117: the streak only needs to know whether a day has anything on it. It
   used to read and fully fill every day back to the start of the streak -
   150 days of nutrient look-ups just to count to 150 - on every open. A day
   that cannot be read counts as empty, exactly as loadEntries treats it. */
const dayCountMemo = new Map();
function dayEntryCount(d){
  let raw = null, k;
  try{ k = dkey(d); raw = CS.getItem(k); }catch(e){ return 0; }
  if(raw == null) return 0;
  const hit = dayCountMemo.get(k);
  if(hit && hit.raw === raw) return hit.n;
  let n = 0;
  try{ const es = JSON.parse(raw); n = Array.isArray(es) ? es.length : 0; }catch(e){ n = 0; }
  if(dayCountMemo.size > 500) dayCountMemo.clear();
  dayCountMemo.set(k, {raw: raw, n: n});
  return n;
}
function computeStreak(){
  let streak = 0;
  let d = new Date();
  // Today being empty at 9am is not a broken streak — it is a day that has
  // not happened yet. Count back from yesterday until today has an entry.
  if(dayEntryCount(d) === 0) d = addDays(d,-1);
  while(true){
    const n = dayEntryCount(d);
    if(n>0){ streak++; d = addDays(d,-1); } else break;
    if(streak>365) break;
  }
  return streak;
}

// The nudge stays until you have actually weighed in — unlike the morning
// popup, which you can dismiss once and lose for the day.
function renderWeighNudge(){
  const el = document.getElementById('weigh-nudge');
  if(!el) return;
  const p = loadProfile();
  const today = todayYMD();
  const log = loadWeightLog();
  const done = log.some(e=>e.date===today);
  if(!p.weight || done){ el.style.display='none'; return; }
  el.style.display = 'flex';
  document.getElementById('weigh-nudge-label').textContent =
    log.length ? "Log today's weight" : 'Log your first weigh-in';
}

// ---------------------------------------------------------------------------
// GOAL-AWARE CALORIE BANDS
//
// The target is not a ceiling for every goal. On `build` it is a FLOOR: the
// number was calculated as maintenance +15% precisely so that eating past it
// is the point. Colouring by the sign of (target - eaten) meant the app went
// red for doing exactly what it had asked for.
//
// Each goal gets a tolerance band, expressed as multiples of the target:
//   below lo    -> 'under'  you are not doing the thing
//   lo .. hi    -> 'in'     you are doing the thing
//   hi .. hard  -> 'over'   past it, recoverable
//   above hard  -> 'far'    past it enough to matter
//
// `lose` keeps hi === hard === 1.00 on purpose, so a cut behaves exactly as it
// did before v33: a cut's target IS a ceiling and red above it is correct.
const CAL_BANDS = {
  /* v93: a cut used to have no "over" at all - its hard edge WAS its target,
     so one calorie past the band went straight to "far gone", the same word as
     a thousand past it. Nine per cent over on a cut is a day that went over,
     not a day that fell apart. Twelve per cent is where it stops being a
     rounding error. */
  lose:     { lo: 0.80, hi: 1.00, hard: 1.12 },
  // 20% past the target is roughly where a lean surplus stops being lean.
  build:    { lo: 1.00, hi: 1.20, hard: 1.45 },
  recomp:   { lo: 0.95, hi: 1.05, hard: 1.25 },
  maintain: { lo: 0.95, hi: 1.05, hard: 1.25 }
};

/* v93: on a build the lower edge of the band IS the target, and on a cut the
   upper edge is - so 3,203 against a 3,204 target came out as a missed day by
   one calorie, which is nonsense. Nobody weighs food to a calorie, and no food
   table is accurate to one either.

   So both edges get a little give: fifty calories, or 1.5% of the target if
   that is bigger. It is applied here, in the band itself, so the ring, the day
   card, the week strip, the score and every average move together - the one
   thing that must never happen is two parts of the app disagreeing about
   whether a day landed. */
function calorieGrace(target){ return Math.max(50, Math.round(target * 0.015)); }

function calorieBand(target, goal){
  const g = CAL_BANDS[goal] ? goal : 'maintain';
  const b = CAL_BANDS[g];
  const grace = calorieGrace(target);
  return { goal: g,
           lo: Math.max(0, target*b.lo - grace),
           hi: target*b.hi + grace,
           // The give carries through to the hard edge, or a day one calorie
           // past it would jump two zones at once.
           hard: target*b.hard + grace,
           grace: grace,
           // The unrounded edges, for anything that needs to say what the band
           // actually is rather than where the give stops.
           rawLo: target*b.lo, rawHi: target*b.hi };
}

// How far round the ring the target sits. On a cut the ring ends AT the
// target, which is why it fills and stays full. On a build it has to run past
// the target or a correct surplus would have nowhere to be drawn.
function calorieScaleMax(target, goal){
  const g = CAL_BANDS[goal] ? goal : 'maintain';
  if(g === 'lose') return target;
  return g === 'build' ? target*1.25 : target*1.15;
}

// The single source of truth for "how is this day going". Pure function of
// (eaten, target, goal) so the day ring, the weekly budget and the history
// rows cannot disagree with each other.
//
// `settled` matters: mid-day, being short of the target is not a failure, it
// is 4pm. Amber for under-eating only appears once the day is done.
function calorieState(eaten, target, goal, settled){
  const band = calorieBand(target, goal);
  const g = band.goal;
  const diff = eaten - target;                 // positive = past the target
  let zone;
  if(!(target > 0))            zone = 'in';
  else if(eaten < band.lo)     zone = 'under';
  else if(eaten <= band.hi)    zone = 'in';
  else if(eaten <= band.hard)  zone = 'over';
  else                         zone = 'far';

  const zoneColor = { under:'var(--caution)', in:'var(--accent)',
                      over:'var(--caution)', far:'var(--danger)' }[zone];
  const color     = (diff <= 0 && !settled) ? 'var(--text)' : zoneColor;
  const ringColor = (zone === 'under' && !settled) ? 'var(--accent)' : zoneColor;

  const scaleMax = calorieScaleMax(target, g);
  const ringPct  = scaleMax > 0 ? Math.min(1, eaten/scaleMax) : 0;

  let num, label, badge = '';
  if(diff <= 0){
    num   = fmt0(-diff);
    label = g === 'build' ? 'kcal to target' : 'kcal left';
  } else if(g === 'build'){
    num   = '+' + fmt0(diff);
    label = zone === 'in' ? 'in surplus' : (zone === 'over' ? 'surplus high' : 'well over');
    badge = '+' + fmt0(diff) + (zone === 'in' ? ' surplus' : ' — surplus high');
  } else if(g === 'lose'){
    num   = fmt0(diff);
    label = 'kcal over';
    badge = '+' + fmt0(diff) + ' over';
  } else {
    num   = (zone === 'in' ? '+' : '') + fmt0(diff);
    label = zone === 'in' ? 'within range' : 'kcal over';
    badge = '+' + fmt0(diff) + (zone === 'in' ? ' — in range' : ' over');
  }

  // fmt0() returns a Number, so `num` came back as a number on the plain
  // branches and a string on the ones that prefix a '+'. textContent hides
  // that; anything comparing the two would not. So it is a string, always.
  return {
    goal: g, zone, diff, color, ringColor, ringPct, scaleMax, num: String(num), label, badge,
    targetTick:  scaleMax > target ? target/scaleMax : null,
    ceilingTick: (band.hi > target && band.hi < scaleMax) ? band.hi/scaleMax : null
  };
}

// The second ring is a setting. Default ON — v33 shipped it on, and a default
// that changes under someone on upgrade is worse than a default you disagree
// with.
const PRING_KEY = 'coachproteinring';
function proteinRingOn(){ return CS.getItem(PRING_KEY) === '1'; }
function setProteinRing(on){ lsSet(PRING_KEY, on ? '1' : '0'); }

// Protein reads as REMAINING, because that is the number you can act on at six
// in the evening. Green at target and green forever after — overshooting
// protein is the least harmful thing you can do all day.
function proteinState(eaten, target){
  const met = target > 0 ? eaten >= target : false;
  return {
    met,
    pct:   target > 0 ? Math.min(1, eaten/target) : 0,
    num:   met ? fmt0(eaten) + 'g' : fmt0(Math.max(0, target - eaten)) + 'g',
    label: met ? 'protein hit' : 'protein to go',
    color: met ? 'var(--accent)' : 'var(--prot)'
  };
}

// Gaining weight is not a failure when the goal is to gain weight. This was
// hard-coded red-for-up in two places.
function weightDirColor(delta){
  if(Math.abs(delta) < 0.05) return 'var(--text3)';
  const g = loadProfile().goal || 'maintain';
  if(g === 'build') return delta > 0 ? 'var(--accent)' : 'var(--danger)';
  if(g === 'lose')  return delta < 0 ? 'var(--accent)' : 'var(--danger)';
  return 'var(--text2)';   // on maintain/recomp the direction is not a verdict
}

// A tick mark across the ring stroke at `frac` of the way round. The <svg> is
// rotated -90deg in CSS, so angle 0 here is 12 o'clock on screen. The stroke
// spans r=37.5..46.5, so the tick runs 36.5..47.5 and straddles it.
// `passed` is the ring's own fill fraction. A tick drawn in its own colour on
// top of a ring that has already reached it is invisible — the amber ceiling
// mark disappeared into an amber ring — so once the fill has gone past, the
// tick becomes a dark notch cut out of the stroke instead.
function setRingTick(id, frac, color, filled){
  const el = document.getElementById(id);
  if(!el) return;
  if(frac == null || !isFinite(frac) || frac <= 0.001 || frac >= 0.999){
    el.style.display = 'none';
    return;
  }
  if(filled != null && filled >= frac) color = 'var(--bg)';
  const a = frac * Math.PI * 2, cos = Math.cos(a), sin = Math.sin(a);
  el.setAttribute('x1', (50 + 36.5*cos).toFixed(2));
  el.setAttribute('y1', (50 + 36.5*sin).toFixed(2));
  el.setAttribute('x2', (50 + 47.5*cos).toFixed(2));
  el.setAttribute('y2', (50 + 47.5*sin).toFixed(2));
  el.style.stroke = color;
  el.style.display = '';
}

// The one place the two day-card layouts are chosen between. Called from
// renderDay so it cannot drift out of sync with the numbers, and directly from
// the settings toggle so flipping it is instant.
function applyHud(){
  const on = proteinRingOn();
  const pring = document.getElementById('pring');
  const card  = document.querySelector('.ring-card');
  if(!pring || !card) return;
  pring.style.display = on ? '' : 'none';
  card.classList.toggle('solo', !on);
  document.getElementById('macro-chips').style.display = on ? '' : 'none';
  document.getElementById('macro-bars').style.display  = on ? 'none' : '';
}


/* v93: a meal is not a plate.
   It used to blend everything logged under "Breakfast" into one per-100 g
   profile and score that. Eggs, toast, butter, a coffee and a yoghurt are not
   one dish, and mashing them together meant no item could be judged on its own
   and a small strong thing got averaged into invisibility - or, the other way
   round, dragged everything with it.

   Now: each item is scored as itself, and the meal is those scores weighted by
   the calories each one carried. Things that genuinely ARE one dish - a curry
   and its rice, a sandwich and its filling - are grouped by you, with Group
   into a plate, and a group is scored as one food the way a dish should be.

   Old days keep working: an entry with no plate tag is simply a group of one.
*/
function mealGroups(entries){
  const list = (entries || []).filter(x=>x);
  const groups = [];
  const byPlate = {};
  list.forEach((e, i)=>{
    const tag = e && e.plate ? String(e.plate) : null;
    if(!tag){ groups.push({plate: null, items: [e], idx: [i]}); return; }
    if(byPlate[tag] === undefined){
      byPlate[tag] = groups.length;
      groups.push({plate: tag, items: [], idx: []});
    }
    groups[byPlate[tag]].items.push(e);
    groups[byPlate[tag]].idx.push(i);
  });
  return groups;
}

// One group's score: a single item is itself, a plate is its parts combined.
function groupScore(items){
  const list = (items || []).filter(x=>x);
  if(!list.length) return null;
  if(list.length === 1){
    try{ return foodScores(per100From(list[0])); }catch(e){ return null; }
  }
  const f = combinedFood(list);
  if(!f) return null;
  try{ return foodScores(f); }catch(e){ return null; }
}

function mealScore(entries){
  const all = (entries || []).filter(e => !e.supp);
  // Only items carrying enough of a label to be judged at all.
  const scorable = e => (Number(e.grams) || 0) > 0 && e.sugar != null && e.sat != null
                        && e.micros && e.micros.fiber != null && e.micros.sodium != null;

  const groups = mealGroups(all).map(g=>({
    plate: g.plate,
    items: g.items.filter(scorable),
    kcal: g.items.filter(scorable).reduce((s, e)=>s + (Number(e.kcal) || 0), 0)
  })).filter(g=>g.items.length && g.kcal > 0);

  const used = groups.reduce((s, g)=>s + g.items.length, 0);
  if(!used) return { score:null, health:null, of: all.length, used:0 };

  let oNum = 0, hNum = 0, den = 0;
  groups.forEach(g=>{
    const sc = groupScore(g.items);
    if(!sc || sc.overall === null) return;
    oNum += sc.overall * g.kcal;
    hNum += (sc.health === null || sc.health === undefined ? sc.overall : sc.health) * g.kcal;
    den  += g.kcal;
  });
  if(!(den > 0)) return { score:null, health:null, of: all.length, used: used };
  return { score: Math.round(oNum/den), health: Math.round(hNum/den),
           of: all.length, used: used };
}

// The day's food quality: each MEAL scored as its own plate, then averaged by
// the share of the day's calories that meal carried.
//
// This used to combine the whole day into one plate and score it per 100 g,
// which weighted everything by WEIGHT. Two things went wrong with that:
//
//   35 kcal of Haribo - ten grams, one percent of the day - cost 19 points,
//   almost as much as 262 kcal of crisps. A mouthful of sweets does not ruin
//   a day and should not score as though it did.
//
//   500 ml of sparkling water cost 4 points. Zero calories, no nutrients,
//   and it made the day look worse, because 500 g of nothing dilutes the
//   per-100 g profile the positives are measured on.
//
// Weighting by calories fixes both: a food counts in proportion to how much of
// your day it actually was, and a zero-calorie drink counts for nothing.
//
// Scoring each MEAL as a plate first, rather than each item on its own, is what
// keeps the context. Rice alone scores badly and olive oil scores terribly;
// chicken, rice, oil and broccoli is a good lunch. Scoring the items separately
// and weighting those marked that lunch down to 88 - the meal-level version
// leaves it at 97, which is the honest answer.
function dayFoodScore(entries){
  const all = (entries || []).filter(e => !e.supp);
  const usable = e => (Number(e.grams)||0) > 0 && e.sugar != null && e.sat != null
                       && e.micros && e.micros.fiber != null && e.micros.sodium != null;
  const scored = all.filter(usable);
  if(!scored.length) return { score:null, health:null, of: all.length, used:0 };

  let oNum = 0, hNum = 0, den = 0;
  MEALS.forEach(m=>{
    const items = scored.filter(e => (MEALS.indexOf(e.meal) >= 0 ? e.meal : 'Snack') === m);
    if(!items.length) return;
    const ms = mealScore(items);
    if(ms.score === null) return;
    const kcal = items.reduce((s,e)=>s + (Number(e.kcal)||0), 0);
    // A meal with no calories in it carries no weight, which is exactly why
    // a glass of water can no longer move the number.
    if(!(kcal > 0)) return;
    oNum += ms.score * kcal;
    hNum += (ms.health === null || ms.health === undefined ? ms.score : ms.health) * kcal;
    den  += kcal;
  });

  if(!(den > 0)) return { score:null, health:null, of: all.length, used: scored.length };
  return { score: Math.round(oNum/den), health: Math.round(hNum/den),
           of: all.length, used: scored.length };
}
// Defaults, not rules. Both are settable and both are read from the profile
// everywhere, so nothing in the app is pinned to two litres any more.
const WATER_TARGET_ML_DEFAULT = 2000;
const WATER_GLASS_ML_DEFAULT = 250;
const WATER_TARGET_MIN = 500, WATER_TARGET_MAX = 6000, WATER_TARGET_STEP = 250;
const WATER_GLASS_CHOICES = [200, 250, 330, 500, 750];
function waterSettings(forDate){
  const p = loadProfile();
  const t = Number(p.waterTargetMl);
  const g = Number(p.waterGlassMl);
  // Until you set one yourself, the target follows your weight - 35 ml per kg,
  // which is the usual clinical rule for an adult - rounded to a glass.
  const kg = Number(p.weight);
  const byWeight = (kg > 30 && kg < 250)
    ? Math.min(WATER_TARGET_MAX, Math.max(WATER_TARGET_MIN, Math.round(kg * 35 / 250) * 250))
    : WATER_TARGET_ML_DEFAULT;
  // A session adds sweat you have to put back: half a litre is the usual
  // rule of thumb for an hour in the gym.
  let train = false;
  try{ train = isTrainingDay(forDate || (typeof currentDate !== 'undefined' ? currentDate : new Date())); }catch(e){}
  const set = (t >= WATER_TARGET_MIN && t <= WATER_TARGET_MAX) ? t : byWeight;
  // v144: a logged workout sets the top-up by its length (0.5 L an hour,
  // never under 0.5 L). With no workout logged it is the same 500 ml as before.
  let top = train ? 500 : 0;
  try{ if(train && typeof trTopUpMl === 'function') top = trTopUpMl(forDate || (typeof currentDate !== 'undefined' ? currentDate : new Date())); }catch(e){}
  return {
    trainingTopUp: top,
    targetMl: Math.min(WATER_TARGET_MAX, set + top),
    glassMl:  (WATER_GLASS_CHOICES.indexOf(g) >= 0) ? g : WATER_GLASS_ML_DEFAULT
  };
}
function setWaterSetting(key, val){
  const p = loadProfile(); p[key] = val; saveProfile(p);
}
// Kept as a number rather than a constant so the review, the tips and the card
// all move together when the target changes.
function waterTargetL(d){ return waterSettings(d).targetMl / 1000; }

function dayReviewData(d){
  const ds = ymd(d);
  const es = loadEntries(d);
  const t = dayTargets(d);
  const kcal = es.reduce((a,e)=>a+(Number(e.kcal)||0),0);
  const pro  = es.reduce((a,e)=>a+(Number(e.protein)||0),0);
  // Through the converter, like everything else. Reading the stored value
  // directly is the bug this line used to be.
  const litres = waterMl(d)/1000;
  // v141: judged as hydration (water plus every drink), like the day score.
  const hyd = (typeof hydForReview === 'function') ? hydForReview(d) : {l: litres, tl: waterTargetL(d)};
  const fs = dayFoodScore(es);
  const goal = (loadProfile().goal) || 'maintain';
  const st = calorieState(kcal, t.kcal, goal, true);
  return { ds, es, kcal, pro, litres, hydL: hyd.l, hydTL: hyd.tl, targets: t, food: fs, zone: st.zone, state: st };
}

// Suggestions come from where the day actually fell short, in the order the
// shortfalls matter, and there are never more than three — a list of eight
// things to fix tomorrow is a list nobody reads.
function dayReviewTips(r){
  const tips = [];
  const t = r.targets;
  const proGap = t.protein - r.pro;
  if(proGap > 15){
    // Which meal on THIS day carried the least protein, so the fix has a place
    // to go. "Add a protein-led item" is advice; "your lunch was 9 g, here are
    // three things that fit it" is a decision already made for you.
    const mb = mealBreakdown(r.ds);
    const eaten = MEALS.filter(m=>mb[m].items > 0);
    const thin = eaten.length > 1
      ? eaten.slice().sort((a,b)=>mb[a].protein - mb[b].protein)[0]
      : null;
    const ideas = proteinIdeas(proGap, 2);
    let s = 'Protein finished <b>'+fmt0(proGap)+' g short</b>.';
    if(thin && mb[thin].protein < r.pro / Math.max(1, eaten.length)){
      s += ' Your '+esc(thin.toLowerCase())+' carried the least \u2014 '+fmt0(mb[thin].protein)+
           ' g of the day\u2019s '+fmt0(r.pro)+' g.';
    }
    if(ideas.length){
      s += '<br><span style="color:var(--text3);">' +
           ideas.map(i=>ideaLine(i)).join('<br>') + '</span>';
    }
    tips.push(s);
  }
  if(r.zone === 'far' || r.zone === 'over'){
    tips.push('Calories came in <b>'+fmt0(r.kcal - t.kcal)+' over</b>. Worth looking at which item '+
              'carried it — the log is sorted by meal.');
  } else if(r.zone === 'under' && (t.kcal - r.kcal) > 250){
    tips.push('Calories finished <b>'+fmt0(t.kcal - r.kcal)+' under</b>. Under-eating on a build day '+
              'costs you as much as over-eating does on a cut.');
  }
  if(r.hydL < r.hydTL - 0.3){
    tips.push('Hydration came to <b>'+r.hydL.toFixed(1)+' L</b>. Another '+
              (r.hydTL - r.hydL).toFixed(1)+' L would have hit the mark.');
  }
  if(r.food.score !== null && r.food.score < healthFloor()){
    // Name the actual item rather than telling you to find it yourself.
    const worst = worstQualityToday(r.es);
    tips.push('The day scored <b>'+r.food.score+'</b> on food quality, under your '+healthFloor()+' floor.'+
      (worst ? ' <b>'+esc(worst.name)+'</b> scored '+worst.score+' and was '+fmt0(worst.kcal)+
               ' kcal of it \u2014 that is the cheapest single swap.'
             : ' Swapping the lowest-scoring item is the cheapest fix.'));
  }
  if(!tips.length){
    tips.push('Nothing to fix — calories, protein and hydration all landed. Repeat it.');
  }
  return tips.slice(0, 3);
}

/* ---- the best things you ate ----
   Not the healthiest food in the abstract: the one that did the most FOR THIS
   DAY. Three things decide it, and all three matter.
     1. What it delivered - how much of each day's target it actually put in
        you, counting every nutrient, capped at half a day from one food so a
        single mad figure cannot win it on its own.
     2. What it cost - its share of the day's calories. Delivering a third of
        your calcium on 4% of your calories is the whole point; delivering it
        on 40% is not.
     3. What it is - the quality score, so a fortified sugary cereal cannot
        top the list by carrying a lot of added vitamins.
   The reason line names the nutrients it actually won on, so it is checkable
   rather than a gold star.                                                   */
function bestOfDay(entries, n){
  const es = (entries || []).filter(e=>Number(e.grams) > 0 && Number(e.kcal) > 0);
  if(es.length < 2) return [];
  const dayKcal = es.reduce((a, e)=>a + (Number(e.kcal) || 0), 0);
  if(!(dayKcal > 0)) return [];
  const specs = microTargetsFor(es).filter(m=>!m.limit && !m.info && !m.unranged && m.target > 0);
  const proT = (targets && targets.protein > 0) ? targets.protein : 0;
  const out = [];
  es.forEach((e, i)=>{
    const per = per100From(e);
    const sc = per ? foodScores(per) : null;
    const q = sc && sc.health != null ? sc.health : null;
    let delivered = 0;
    const wins = [];
    specs.forEach(m=>{
      const v = (e.micros || {})[m.k];
      if(v == null || !isFinite(v)) return;
      const share = v / m.target;
      delivered += Math.min(0.5, share);
      if(share >= 0.15) wins.push({n: m.n, pct: Math.round(share * 100)});
    });
    const pro = Number(e.protein) || 0;
    if(proT > 0 && pro > 0){
      const share = pro / proT;
      delivered += Math.min(0.5, share);
      if(share >= 0.15) wins.push({n: 'Protein', pct: Math.round(share * 100)});
    }
    if(!(delivered > 0)) return;
    const costShare = Math.max(0.01, (Number(e.kcal) || 0) / dayKcal);
    const punch = delivered / costShare;
    // Quality is a multiplier, not a tie-break: an ultra-processed food with
    // vitamins sprayed on does not get to win the day.
    const quality = q == null ? 0.55 : Math.pow(Math.max(0, q) / 100, 1.5);
    wins.sort((a, b)=>b.pct - a.pct);
    out.push({i: i, name: e.name, grams: Number(e.grams) || 0, kcal: Number(e.kcal) || 0,
              basis: entryBasis(e), score: punch * quality, quality: q,
              costPct: Math.round(costShare * 100), wins: wins, unscored: q == null});
  });
  out.sort((a, b)=>b.score - a.score);
  return out.slice(0, n || 3);
}
function bestOfDayHTML(entries){
  const best = bestOfDay(entries, 3);
  if(!best.length) return '';
  const medal = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
  return '<div class="section-title">Best things you ate</div>'+
    '<p class="nrev-note">What each one put in you, against what it cost you in calories.</p>'+
    best.map((b, i)=>{
      const amt = Math.round(b.grams) + (b.basis === 'ml' ? ' ml' : ' g');
      const why = b.wins.length
        ? b.wins.slice(0, 3).map(w=>'<span>'+esc(w.n)+' <s>'+w.pct+'%</s></span>').join('')
        : '<span>steady across the board</span>';
      return '<div class="bod-row"><div class="bod-h"><span class="bod-m">'+medal[i]+'</span>'+
        '<span class="bod-n">'+esc(b.name)+'<s>'+amt+' · '+fmt0(b.kcal)+' kcal · '+
        b.costPct+'% of the day</s></span>'+
        '<span class="bod-q">'+(b.unscored ? '—' : b.quality)+'</span></div>'+
        '<div class="bod-w">'+why+'</div></div>';
    }).join('');
}

function renderDayReview(d){
  const r = dayReviewData(d);
  const t = r.targets;
  const pct = (a, b) => b > 0 ? Math.max(0, Math.min(100, a/b*100)) : 0;
  const col = z => z === 'in' ? 'var(--accent)' : z === 'far' ? 'var(--danger)' : 'var(--score-fair)';
  const card = (lab, val, sub, w, c) =>
    '<div class="dr-card"><div class="dl">'+lab+'</div><div class="dv">'+val+'</div>'+
    '<div class="ds">'+sub+'</div>'+
    (w === null ? '' : '<div class="track"><div style="width:'+w.toFixed(0)+'%; background:'+c+'"></div></div>')+
    '</div>';

  const proPct = pct(r.pro, t.protein);
  const fq = r.food.score;
  const fb = fq === null ? null : scoreBand(fq);

  const v = dayVerdict(ymd(d));
  const tickOf = (s)=> s === true ? '<div class="ont-tick y">\u2713</div>'
    : s === null ? '<div class="ont-tick q">?</div>' : '<div class="ont-tick n">\u00d7</div>';
  const goalNow = loadProfile().goal || 'maintain';
  const calWant = goalNow === 'lose' ? 'up to '+fmt0(v.targets.kcal)
                                     : fmt0(v.band.lo)+' \u2013 '+fmt0(v.band.hi);
  // The verdict first. Four cards of figures never answered the one question
  // the review exists to answer: did this day count or not.
  const verdictBlock = !v.logged ? '' :
    '<div class="ont-card" style="margin-bottom:14px;">'+
      '<div class="ont-head"><span class="h1x">Did it count</span>'+
      '<span class="h2x" style="color:'+VERDICT_COLOUR[v.tone]+'">'+
        (v.all ? 'Yes \u2014 all three' : v.met+' of 3')+'</span></div>'+
      '<div class="ont-row">'+tickOf(v.cal)+
        '<div class="ont-t">Calories<s>needed '+calWant+'</s></div>'+
        '<div class="ont-v">'+fmt0(v.kcal)+'</div></div>'+
      '<div class="ont-row">'+tickOf(v.protein)+
        '<div class="ont-t">Protein<s>needed '+fmt0(v.proFloor)+' g or more</s></div>'+
        '<div class="ont-v">'+fmt0(v.pro)+' g</div></div>'+
      '<div class="ont-row">'+tickOf(v.healthKnown ? v.quality : null)+
        '<div class="ont-t">Food quality<s>'+
          (v.healthKnown ? 'needed '+v.healthFloor+' or more'
                         : 'no label data on '+(v.healthOf - v.healthUsed)+' of '+v.healthOf+' items')+
        '</s></div>'+
        '<div class="ont-v">'+(v.healthKnown ? v.health : '\u2014')+'</div></div>'+
    '</div>';

  document.getElementById('dayrev-title').textContent = dayLabel(d) + ' — done';
  // Every nutrient, every night. A review is where you find out what you are
  // missing, and something never measured cannot be found by hiding it.
  const nrevW = nutrientWindow([d]);
  const drawDayRev = ()=>{
    const box = document.getElementById('dayrev-nutrients');
    if(!box) return;
    box.innerHTML = nutrientReviewHTML(nrevW, 'today');
    wireNutrientReview(box, nrevW, 'today', drawDayRev);
  };
  // The sheet goes up with the answer on it, and the heavy half - every
  // nutrient, the plan, the foods to fix each gap - lands a frame later. It
  // used to build all of that before anything appeared, which is why ticking
  // a day complete felt like the app had hung.
  document.getElementById('dayrev-body').innerHTML =
    verdictBlock +
    '<div class="dr-grid">'+
      card('Calories', fmt0(r.kcal), 'of '+fmt0(t.kcal)+' target',
           pct(r.kcal, t.kcal), col(r.zone)) +
      card('Protein', fmt0(r.pro)+'g', 'of '+fmt0(t.protein)+'g target',
           proPct, proPct >= 90 ? 'var(--accent)' : 'var(--score-fair)') +
      card('Hydration', r.hydL.toFixed(1)+' L', 'of '+r.hydTL.toFixed(1)+' L',
           pct(r.hydL, r.hydTL),
           r.hydL >= r.hydTL ? 'var(--accent)' : 'var(--score-fair)') +
      (fq === null
        ? card('Food quality', '—',
               r.food.of ? (r.food.of - r.food.used)+' of '+r.food.of+' items need figures' : 'nothing logged', null, null)
        : card('Food quality', String(fq),
               r.food.used + ' of ' + r.food.of + ' items scored',
               fq, fb.cls === 'good' ? 'var(--accent)' : fb.cls === 'fair' ? 'var(--score-fair)' : 'var(--danger)')) +
    '</div>'+
    '<div id="dayrev-best"></div>'+
    '<div class="section-title">Tomorrow</div>'+
    dayReviewTips(r).map(x=>'<div class="dr-tip"><i class="ti ti-arrow-right" aria-hidden="true"></i><div>'+x+'</div></div>').join('')+
    '<div id="dayrev-nutrients"><div class="drev-wait">Working out the rest\u2026</div></div>';
  openSheet('dayrev-backdrop');
  const fill = ()=>{
    const bb = document.getElementById('dayrev-best');
    if(bb) bb.innerHTML = bestOfDayHTML(loadEntries(d));
    drawDayRev();
  };
  // Two frames: one to paint the sheet, one to do the work.
  if(typeof requestAnimationFrame === 'function') requestAnimationFrame(()=>requestAnimationFrame(fill));
  else setTimeout(fill, 30);
}
document.getElementById('dayrev-close').onclick = ()=> closeSheet('dayrev-backdrop');

