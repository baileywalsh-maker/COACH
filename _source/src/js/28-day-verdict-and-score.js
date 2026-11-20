// ============================================================
// WHAT MAKES A DAY COUNT
// ============================================================
// Three things, all of them, or the day does not count. Calories alone was
// never the question - a day of 3,000 kcal of ice cream is not a day on target
// on a build, and neither is a day that hit the calories and missed the protein.
//
// Each is a floor with an explicit reason for being where it is:
//
//   Calories     the goal's own band. On a build that is target to +20%; past
//                +20% a surplus stops being mostly muscle, which is why the
//                ceiling exists at all. On a cut it is -20% to the target.
//   Protein      90% of target by default. A floor, not a range: there is no
//                established upper limit for protein in healthy people, so
//                inventing a ceiling would be inventing a number.
//   Food quality the day's combined health score against a floor you set.
//                Default 75.
const HEALTH_FLOOR_DEFAULT = 75;
const PROTEIN_FLOOR_PCT_DEFAULT = 90;

function healthFloor(){
  const v = Number(loadProfile().healthFloor);
  return (v >= 0 && v <= 100) ? v : HEALTH_FLOOR_DEFAULT;
}
function proteinFloorPct(){
  const v = Number(loadProfile().proteinFloorPct);
  return (v >= 50 && v <= 100) ? v : PROTEIN_FLOOR_PCT_DEFAULT;
}
function proteinFloorFor(t){ return (Number(t && t.protein) || 0) * proteinFloorPct() / 100; }


/* ============================================================
   v92 - one score for the day, and the four things it is made of
   Three pass-or-fail ticks could not tell 2,640 calories from 1,900: both were
   a cross. And the twelve body systems - the part that says whether the food
   actually fed you - were not in the verdict at all.

   So: one number out of 100, built from four parts, each scored on a slope
   rather than a line in the sand.

     Calories      30   the lever that decides what your body does
     Protein       25   the lever that decides whether it is muscle
     Food quality  25   what the food was made of
     Body systems  20   whether it actually covered you

   Two rules that keep it honest:
     - a part COACH could not measure is not scored zero, it is left out and
       its weight shared among the rest. A home-cooked day with no label
       figures is not a bad day, it is an unmeasured one;
     - but a day measured on half the evidence cannot read 100 either, so the
       ceiling comes down with the evidence. Everything below 100 is earned.

   The pass-or-fail verdict is untouched: streaks, the week strip and every
   average still run on it, and this sits on top.
   ============================================================ */
const DS_WEIGHTS = {cal: 30, protein: 25, quality: 25, systems: 20};
const DS_WEIGHTS_HYD = {cal: 27, protein: 23, quality: 23, systems: 17, hyd: 10};

/* Outside the band you lose points at a rate, rather than falling off a cliff -
   but the rate is tied to the SAME bands the ring and the week strip use, so a
   day the ring calls "surplus high" cannot come out here as a near-perfect
   score. Full marks inside the band; down to 60 at the hard edge, where the
   surplus stops being muscle or the deficit stops being sustainable; zero a
   further step beyond that. */
function dsCalorieScore(kcal, band, target){
  if(!(target > 0)) return null;
  if(kcal >= band.lo && kcal <= band.hi) return 100;
  const over = kcal > band.hi;
  const edge = over ? band.hi : band.lo;
  // The hard edge is published for the direction of your goal; the other side
  // is mirrored at the same distance, so under-eating is judged as firmly as
  // over-eating.
  const hardOut = Math.max(target * 0.12, Math.abs(band.hard - (band.hard > target ? band.hi : band.lo)));
  const out = Math.abs(kcal - edge);
  if(out <= hardOut) return Math.max(0, Math.round(100 - 40 * (out / hardOut)));
  return Math.max(0, Math.round(60 - 60 * ((out - hardOut) / hardOut)));
}

function dsProteinScore(pro, target){
  if(!(target > 0)) return null;
  // Hitting it is 100. Past it earns nothing more - it is a floor, not a race.
  return Math.max(0, Math.min(100, Math.round(pro / target * 100)));
}

/* The twelve systems, averaged - but only across the ones enough of could be
   measured to mean anything. A system COACH could not read is not a system you
   failed. How many were readable is what decides the day's ceiling. */
function dsSystemScore(entries){
  if(typeof SYSTEMS === 'undefined' || !entries || !entries.length) return null;
  let sum = 0, n = 0, total = 0;
  SYSTEMS.forEach(sy=>{
    total++;
    let st = null;
    try{ st = systemState(sy, entries); }catch(e){ return; }
    if(!st || st.pct === null) return;
    if(typeof systemTrusted === 'function' && !systemTrusted(st)) return;
    sum += Math.min(100, st.pct);
    n++;
  });
  if(!n) return null;
  return {score: Math.round(sum / n), read: n, of: total};
}

function dayScoreParts(dateOrStr){
  const d = asDate(dateOrStr);
  const es = loadEntries(d);
  const v = dayVerdict(ymd(d));
  const t = v.targets;

  const sys = dsSystemScore(es);
  // v128: from the day hydration arrived, it is a fifth part worth 10. Days
  // before that keep the four-part weights, so no past score moves.
  const hydOn = hydInScore(ymd(d));
  const W = hydOn ? DS_WEIGHTS_HYD : DS_WEIGHTS;
  const parts = [
    {k:'cal', label:'Calories', weight: W.cal,
     pct: v.logged ? dsCalorieScore(v.kcal, v.band, t.kcal) : null,
     value: fmt0(v.kcal), sub: 'of ' + fmt0(t.kcal)},
    {k:'protein', label:'Protein', weight: W.protein,
     pct: v.logged ? dsProteinScore(v.pro, t.protein) : null,
     value: fmt0(v.pro) + ' g', sub: 'of ' + fmt0(t.protein) + ' g'},
    {k:'quality', label:'Food quality', weight: W.quality,
     pct: v.healthKnown ? v.health : null,
     value: v.healthKnown ? String(v.health) : '—',
     sub: v.healthKnown ? 'out of 100'
        : (v.healthOf - v.healthUsed) + ' item' + ((v.healthOf - v.healthUsed) === 1 ? '' : 's') +
          ' need packet figures'},
    {k:'systems', label:'Body systems', weight: W.systems,
     pct: sys ? sys.score : null,
     value: sys ? sys.score + '%' : '—',
     sub: sys ? sys.read + ' of ' + sys.of + ' could be read'
              : 'nothing measurable yet today'}
  ];
  if(hydOn){
    let h = null;
    try{ h = hydDay(d); }catch(e){ h = null; }
    parts.push({k:'hyd', label:'Hydration', weight: W.hyd,
      pct: (h && h.any) ? h.pct : null,
      value: h ? fmtL(h.total) + ' L' : '—',
      sub: h ? 'of ' + fmtL(h.target) + ' L' : 'nothing logged'});
  }

  const measured = parts.filter(x=>x.pct !== null);
  const wMeasured = measured.reduce((a, x)=>a + x.weight, 0);
  if(!v.logged || !wMeasured){
    return {score: null, logged: v.logged, parts: parts, verdict: v,
            measuredWeight: 0, ceiling: 100, provisional: true, sys: sys};
  }

  // The weight of anything unmeasured is shared out across what WAS measured,
  // so the parts always add up to the whole.
  let score = 0;
  parts.forEach(x=>{
    x.share = x.pct === null ? 0 : x.weight / wMeasured;
    x.points = x.pct === null ? null : Math.round(x.pct * x.share);
    if(x.pct !== null) score += x.pct * x.share;
  });
  // Measured on half the evidence, capped near four fifths. All 100 weight
  // measured, no cap at all.
  const ceiling = Math.round(60 + 40 * (wMeasured / 100));
  const capped = Math.min(Math.round(score), ceiling);

  return {score: capped, raw: Math.round(score), logged: true, parts: parts,
          verdict: v, measuredWeight: wMeasured, ceiling: ceiling,
          provisional: wMeasured < 100, sys: sys};
}

function dsBand(n){
  if(n === null) return {cls:'none', word:'—'};
  if(n >= 85) return {cls:'good', word:'Strong day'};
  if(n >= 70) return {cls:'good', word:'Good day'};
  if(n >= 55) return {cls:'fair', word:'Fair day'};
  return {cls:'cost', word:'Off day'};
}

// The verdict on one day. Pure function of what is stored, so the day card, the
// week strip, the daily review and the Sunday review cannot disagree.
/* v112: one screen asks for the same day's verdict several times over (the
   Data screen: three times for each of ninety days). Worked out once per day,
   and thrown away the moment anything is saved or a moment has passed. */
const dvCache = new Map();
/* v131: kept until something it depends on actually changes - that day's
   food, its frozen target, your profile, your targets, or anything that can
   change how food is scored - instead of being thrown away after 1.5 seconds.
   That is what made the Data screen and the reviews score ninety days of food
   from scratch every time they opened. */
function dayVerdict(dateOrStr){
  const d0 = asDate(dateOrStr);
  const ds0 = ymd(d0);
  const tk = targets ? targets.kcal + '/' + targets.protein + '/' + targets.carbs + '/' + targets.fat : '';
  let raw = null, snap = null, prof = null;
  try{ raw = CS.getItem(dkey(d0)); snap = CS.getItem(snapKey(d0)); prof = CS.getItem(PROFILE_KEY); }catch(e){}
  const hit = dvCache.get(ds0);
  if(hit && hit.raw === raw && hit.snap === snap && hit.prof === prof && hit.tk === tk &&
     hit.fe === fillEpoch && hit.se === scoreEpoch) return Object.assign({}, hit.v);
  const v = dayVerdictRaw(dateOrStr);
  if(dvCache.size > 800) dvCache.clear();
  dvCache.set(ds0, {raw: raw, snap: snap, prof: prof, tk: tk, fe: fillEpoch, se: scoreEpoch, v: v});
  return Object.assign({}, v);
}
function dayVerdictRaw(dateOrStr){
  const d = asDate(dateOrStr);
  const ds = ymd(d);
  const es = loadEntries(d);
  const t = snapFor(d);
  const kcal = es.reduce((a,e)=>a+(Number(e.kcal)||0),0);
  const pro  = es.reduce((a,e)=>a+(Number(e.protein)||0),0);
  const fs = dayFoodScore(es);
  const goal = loadProfile().goal || 'maintain';
  const band = calorieBand(t.kcal, goal);
  const logged = kcal > 0;

  const proFloor = proteinFloorFor(t);
  const hFloor = healthFloor();

  const calOK = logged && calorieState(kcal, t.kcal, goal, true).zone === 'in';
  const proOK = logged && t.protein > 0 && pro >= proFloor - 0.5;
  // No score is not a failed score. A day whose food carries no label data
  // cannot be judged on quality, so it is marked unknown rather than missed -
  // and an unknown cannot make a day count.
  const hKnown = fs.score !== null;
  const hOK = logged && hKnown && fs.score >= hFloor;

  const met = (calOK?1:0) + (proOK?1:0) + (hOK?1:0);
  return {
    ds, logged, kcal, pro, targets: t, band,
    health: fs.score, healthKnown: hKnown, healthUsed: fs.used, healthOf: fs.of,
    proFloor, healthFloor: hFloor,
    cal: calOK, protein: proOK, quality: hOK,
    met, all: met === 3,
    // Green all three, amber two, red one or none. Only for a day with
    // something logged - an empty day is not a bad day, it is an empty one.
    tone: !logged ? 'none' : met === 3 ? 'good' : met === 2 ? 'part' : 'bad'
  };
}

const VERDICT_COLOUR = { good:'var(--accent)', part:'var(--caution)',
                         bad:'var(--danger)', none:'var(--border)' };

// Your goal weight, and how far along you are.
function goalWeight(){
  const v = Number(loadProfile().targetWeight);
  return v > 0 ? v : null;
}
function goalWeightProgress(){
  const gw = goalWeight();
  const log = loadWeightLog();
  if(!gw || !log.length) return null;
  const now = log[log.length-1].kg;
  const start = log[0].kg;
  const span = gw - start;
  const done = now - start;
  return {
    goal: gw, now, start,
    toGo: Math.round((gw - now) * 10) / 10,
    pct: Math.abs(span) < 0.05 ? 100 : Math.max(0, Math.min(100, done/span*100))
  };
}

// What the two floors mean in actual grams and points, and how far the goal
// weight is. A percentage on its own is not a number you can act on.
function renderGoalNotes(){
  const fn = document.getElementById('p-floor-note');
  if(fn){
    const pf = Number(document.getElementById('p-protein-floor').value) || PROTEIN_FLOOR_PCT_DEFAULT;
    const hf = Number(document.getElementById('p-health-floor').value);
    const grams = Math.round((targets.protein || 0) * pf / 100);
    // v133: shorter.
    fn.innerHTML = 'So: at least <b>' + grams + ' g protein</b>, and food quality <b>' +
      ((hf >= 0 && hf <= 100) ? hf : HEALTH_FLOOR_DEFAULT) + '+</b>.';
  }
  const gn = document.getElementById('p-goalweight-note');
  if(gn){
    const g = goalWeightProgress();
    if(!g){ gn.textContent = ''; }
    else if(Math.abs(g.toGo) < 0.15){
      gn.innerHTML = '<b style="color:var(--accent)">You are there.</b> ' + g.now + ' kg.';
    } else {
      const dir = g.toGo > 0 ? 'to gain' : 'to lose';
      gn.innerHTML = 'You are ' + g.now + ' kg \u2014 <b>' + Math.abs(g.toGo) + ' kg ' + dir + '</b>' +
        (g.pct > 0 ? ' \u00b7 ' + Math.round(g.pct) + '% of the way' : '') + '.';
    }
  }
}

