// ============================================================
// PATTERNS — where it keeps going wrong, and what to do about it
// ============================================================
// A tip built from one day is noise. "Protein finished 20 g short" is not
// information you can act on; "protein has finished short on 5 of the last 7
// days, and lunch is the thin one" is. Everything here works over a window and
// reports WHERE the shortfall sits, not just that there was one.

// What each meal contributed on one day.
function mealBreakdown(dateOrStr){
  const es = loadEntriesRO(asDate(dateOrStr));
  const out = {};
  MEALS.forEach(m=>{ out[m] = {meal:m, kcal:0, protein:0, carbs:0, fat:0, items:0, names:[]}; });
  es.forEach(e=>{
    const m = MEALS.indexOf(e.meal) >= 0 ? e.meal : 'Snack';
    const b = out[m];
    b.kcal += Number(e.kcal) || 0;
    b.protein += Number(e.protein) || 0;
    b.carbs += Number(e.carbs) || 0;
    b.fat += Number(e.fat) || 0;
    b.items++;
    if(e.name) b.names.push(e.name);
  });
  return out;
}

// Every meal across a window, so a habit can be told apart from a bad Tuesday.
// `share` is the fraction of that day's protein the meal carried, averaged over
// the days the meal actually appeared - which is what makes "lunch is thin"
// meaningful even when lunch is not eaten every day.
function mealPatterns(nDays){
  const acc = {};
  MEALS.forEach(m=>{ acc[m] = {meal:m, days:0, kcal:0, protein:0, shareSum:0, shareDays:0}; });
  let daysCounted = 0;

  const end = new Date(); end.setHours(0,0,0,0);
  for(let i = 1; i <= nDays; i++){
    const d = addDays(end, -i);
    const ds = ymd(d);
    if(getDailyIntake(ds) <= 0) continue;
    daysCounted++;
    const b = mealBreakdown(ds);
    const dayPro = MEALS.reduce((s,m)=>s + b[m].protein, 0);
    MEALS.forEach(m=>{
      if(b[m].items === 0) return;
      const a = acc[m];
      a.days++; a.kcal += b[m].kcal; a.protein += b[m].protein;
      if(dayPro > 0){ a.shareSum += b[m].protein / dayPro; a.shareDays++; }
    });
  }

  const meals = MEALS.map(m=>{
    const a = acc[m];
    return {
      meal: m, days: a.days,
      // Averaged over the days the meal HAPPENED. Averaging over every day in
      // the window would make a meal you skip look weak rather than absent.
      avgKcal: a.days ? a.kcal / a.days : 0,
      avgProtein: a.days ? a.protein / a.days : 0,
      avgShare: a.shareDays ? a.shareSum / a.shareDays : 0,
      // How often it appears at all.
      frequency: daysCounted ? a.days / daysCounted : 0
    };
  });
  return {meals, daysCounted};
}

// The meal that is holding your protein back. Deliberately conservative: it
// needs the meal to appear on most days (a meal you rarely eat is not a habit
// to fix), and it needs a real gap against your other meals, or it says nothing.
const WEAK_MEAL_MIN_DAYS = 4;
const WEAK_MEAL_MIN_FREQ = 0.5;

function weakestProteinMeal(nDays){
  const p = mealPatterns(nDays);
  if(p.daysCounted < WEAK_MEAL_MIN_DAYS) return null;
  const eligible = p.meals.filter(m=>m.days >= WEAK_MEAL_MIN_DAYS && m.frequency >= WEAK_MEAL_MIN_FREQ);
  if(eligible.length < 2) return null;

  // Ranked by MISSED OPPORTUNITY, not by raw grams. Ranking on grams alone made
  // a 260 kcal bag of crisps "the meal where protein slips" and told you to put
  // 365 g of skyr in your snack - technically the lowest number, useless advice.
  // A snack is meant to be small; the question is which meal spends a lot of
  // calories and delivers little protein with them.
  //
  // needed = the protein density your whole day has to average.
  // shortfall = that meal's calories x how far below it the meal sits.
  const needed = (targets.kcal > 0) ? (targets.protein || 0) * 100 / targets.kcal : 0;
  if(!(needed > 0)) return null;

  const scored = eligible.map(m=>{
    const density = m.avgKcal > 0 ? m.avgProtein * 100 / m.avgKcal : 0;
    return Object.assign({}, m, {
      density,
      // Grams of protein this meal could have carried on the calories it already
      // spends, and did not.
      missed: Math.max(0, (needed - density) * m.avgKcal / 100)
    });
  }).sort((a,b)=>b.missed - a.missed);

  const weak = scored[0];
  // Under 8 g of missed opportunity is not worth a nag, and if every meal is
  // already pulling its weight there is nothing to say.
  if(weak.missed < 8) return null;

  const rest = scored.slice(1);
  const restAvg = rest.length ? rest.reduce((s,m)=>s+m.avgProtein, 0) / rest.length : 0;

  return {
    meal: weak.meal, avgProtein: weak.avgProtein, avgKcal: weak.avgKcal,
    density: weak.density, needed, missed: weak.missed, restAvg,
    // What to actually add to it.
    gap: Math.max(10, Math.round(weak.missed)),
    days: weak.days, daysCounted: p.daysCounted, all: scored
  };
}

// Energy-dense foods, for a calorie gap. Protein foods are the wrong answer
// here: chicken breast is 165 kcal per 100 g, so closing a 550 kcal gap with it
// means a third of a kilo of chicken. These are things that carry calories.
const CAL_MIN_DENSITY = 250;          // kcal per 100 g
// Things nobody eats by the plateful. A powder is an ingredient, not a way to
// add 550 kcal - suggesting 150 g of whey isolate is arithmetically correct and
// completely useless.
const NOT_A_MEAL_ADDITION = /(powder|isolate|gelatine|gelatin|bcaa|creatine|supplement|oil$|^oil|lard|ghee|dripping|stock cube|yeast extract|seasoning|spice|essence|extract)/i;

/* v141: things that kept turning up as suggestions and that nobody would act
   on: a chain's menu item ("15.5 pots of McDonald's Lurpak", a McDonald's
   latte for potassium), butter and spreads, sauces and dips, raw herbs by the
   plateful, and reference-table oddities (salted frozen egg yolk, brain).
   No lookbehind in these patterns: older iPhones can't parse it. */
const IDEA_CHAIN = /^(Starbucks|Domino['\u2019]s|McDonald['\u2019]s|Pizza Hut|Papa John['\u2019]s|Burger King|Costa|Tim Hortons|Nando['\u2019]s|Greggs|KFC|Subway|Five Guys)\b/i;
const IDEA_SPREAD = /\b(butter|spreadable|spread|margarine|lurpak|flora|clover|mayonnaise|mayo|ketchup|sauce|sauces|dip|dressing|gravy|pickle|relish|chutney)\b/i;
const IDEA_NUT_BUTTER = /\b(peanut|nut|almond|cashew|hazelnut|seed|sunflower|pumpkin|tahini) butter\b|\bbutter beans?\b|\bbutternut\b/i;
const IDEA_ODD = /\b(cilantro|coriander, (fresh|leaves|raw)|frozen, (salted|sugared)|(salted|sugared), frozen|pasteuri[sz]ed|brains?|spleen|lungs?|pancreas|thymus|chitterlings?|suet|caviar|dried egg|egg powder|egg, (yolk|white|whole), dried)\b|^coriander\b(?!.*seed)/i;
function oddIdea(name){
  name = String(name || '');
  if(IDEA_CHAIN.test(name) || IDEA_ODD.test(name)) return true;
  return IDEA_SPREAD.test(name) && !IDEA_NUT_BUTTER.test(name);
}
function calorieIdeas(gap, limit){
  const want = Math.max(150, Number(gap) || 0);
  const seen = {}, out = [];
  const push = (name, kcal100, p100, unitName, unitGrams, src)=>{
    const key = normalise(String(name||''));
    if(!key || seen[key] || !(kcal100 >= CAL_MIN_DENSITY)) return;
    // Real food only: not ultra-processed, not a pile of sugar, not a bottle of
    // oil, not something you measure in scoops.
    if(novaGroup(name) === 4) return;
    if(freeSugarFraction(name) === 1) return;
    if(kcal100 > 700) return;
    if(NOT_A_MEAL_ADDITION.test(String(name))) return;
    if(oddIdea(name)) return;
    seen[key] = true;
    let grams = want * 100 / kcal100;
    grams = Math.round(grams / 5) * 5;
    // If closing the gap needs an unreasonable amount of it, it is not the
    // answer for this gap. Better to say nothing than to suggest 300 g of nuts.
    if(grams < 15 || grams > 150) return;
    out.push({ name, grams, kcal: kcal100 * grams / 100, protein: (p100||0) * grams / 100,
               unitName, unitGrams, src, rank: (src === 'local' ? 1 : 0) });
  };
  loadMyFoods().forEach(f=> push(f.name, Number(f.kcal100), Number(f.p100), f.unitName, f.unitGrams, 'mine'));
  LOCAL_FOODS.forEach(f=>{ if(!isPerItemRow(f)) push(f[0], Number(f[1]), Number(f[2]), f[5], f[6], 'local'); });
  // Yours first, then the SMALLEST portion that closes the gap. Sorting by
  // protein instead put 145 g of nutritional yeast and 180 g of dried seaweed
  // at the top: high protein, technically enough calories, and not food anybody
  // adds by the plateful. The portion size is the honest test of density.
  out.sort((a,b)=> a.rank - b.rank || a.grams - b.grams);
  const picked = [], fam = {};
  for(const c of out){
    const k = foodFamily(c.name);
    if(fam[k]) continue;
    fam[k] = true;
    picked.push(c);
    if(picked.length >= (limit || 3)) break;
  }
  return picked;
}

// ---- concrete things to eat ----
// Suggestions are only worth anything if you would actually eat them, so foods
// you have logged before come first and the built-in table is the fallback.
//
// Two filters, both needed:
//   density  >= 10 g per 100 kcal  - it has to be mostly protein
//   per 100g >= 8 g                - and dense enough to eat a normal portion of.
// Watercress passes the first at 21 g/100 kcal and fails the second: you would
// need a kilo of it. Gelatine and BCAA powder pass both and fail on quality,
// which is what the DIAAS check is for.
// Three kinds of nut is one idea, not three. Coarse families, so a list of
// suggestions offers real alternatives rather than the same thing three times.
const FOOD_FAMILIES = [
  ['nut', /(nuts?\b|almonds?|cashews?|pecans?|walnuts?|pistachios?|hazelnuts?|macadamias?|peanuts?)/i],
  ['seed', /(seeds?\b|chia|flax|linseed|sunflower|sesame|tahini)/i],
  ['cheese', /(cheeses?|cheddar|mozzarella|feta|halloumi|parmesan|brie|gouda|paneer|ricotta|cottage)/i],
  ['yoghurt', /(yoghurts?|yogurts?|skyr|quark|kefir|fromage)/i],
  ['milk', /(milks?\b|creams?\b)/i],
  ['egg', /eggs?\b/i],
  ['poultry', /(chickens?|turkeys?|ducks?)\b/i],
  ['redmeat', /(beef|steaks?|mince|lamb|pork|gammon|bacon|hams?\b|venison)/i],
  ['fish', /(salmon|tuna|cod\b|haddock|mackerel|sardines?|prawns?|shrimps?|crab|trout|pollock|seafood|anchov)/i],
  ['pulse', /(beans?\b|lentils?|chickpeas?|hummus|tofu|tempeh|edamame|soya|soy\b)/i],
  ['grain', /(oats?\b|granola|muesli|rice\b|pasta|breads?\b|bagels?|couscous|quinoa|cereal|wrap)/i],
  ['driedfruit', /(raisins?|sultanas?|dates?\b|prunes?|figs?\b|dried fruit)/i],
  ['avocado', /avocados?/i],
  ['powder', /(powder|isolate|shake)/i],
  ['choc', /(chocolate|cacao|cocoa)/i]
];
function foodFamily(name){
  const n = String(name || '');
  for(const [key, re] of FOOD_FAMILIES) if(re.test(n)) return key;
  return 'x:' + normalise(n).split(' ')[0];
}

const PROTEIN_MIN_DENSITY = 10;
const PROTEIN_MIN_PER_100G = 8;

function proteinCandidates(){
  const out = [];
  const seen = {};
  const push = (name, kcal100, p100, unitName, unitGrams, src)=>{
    const key = normalise(String(name||''));
    if(!key || seen[key]) return;
    if(!(kcal100 > 0) || !(p100 >= PROTEIN_MIN_PER_100G)) return;
    const density = p100 * 100 / kcal100;
    if(density < PROTEIN_MIN_DENSITY) return;
    // A shake is a fine answer for protein, so powders stay - but gelatine and
    // BCAAs are not protein sources in any useful sense.
    if(/(gelatine|gelatin|bcaa|creatine|collagen)/i.test(String(name))) return;
    // A complete protein, judged the same way the health score judges one.
    if(proteinQuality(name, {kcal100, p100}) <= 0) return;
    seen[key] = true;
    out.push({name, kcal100, p100, density, unitName, unitGrams, src});
  };

  // Yours first.
  loadMyFoods().forEach(f=> push(f.name, Number(f.kcal100), Number(f.p100), f.unitName, f.unitGrams, 'mine'));
  loadRecents().forEach(r=>{
    const g = Number(r.grams) || 0;
    if(g > 0) push(r.name, (Number(r.kcal)||0)*100/g, (Number(r.protein)||0)*100/g, null, null, 'recent');
  });
  // Then the built-in table.
  LOCAL_FOODS.forEach(f=>{ if(!isPerItemRow(f)) push(f[0], Number(f[1]), Number(f[2]), f[5], f[6], 'local'); });
  return out;
}

// Things that would close a gap of `gap` grams, with a portion that actually
// does it. Sorted so your own foods win ties.
function proteinIdeas(gap, limit){
  const want = Math.max(5, Number(gap) || 0);
  const cands = proteinCandidates();
  const rank = {mine:0, recent:1, local:2};
  const scored = cands.map(c=>{
    // A portion that covers the gap, rounded to something you would actually
    // weigh out, and capped so it never suggests half a kilo of anything.
    let grams = want * 100 / c.p100;
    grams = Math.min(400, Math.max(20, Math.round(grams / 5) * 5));
    const pro = c.p100 * grams / 100;
    const kcal = c.kcal100 * grams / 100;
    return {
      name: c.name, grams, protein: pro, kcal, density: c.density, src: c.src,
      unitName: c.unitName, unitGrams: c.unitGrams,
      // Covers most of the gap, for the fewest calories, preferring your foods.
      score: (pro >= want * 0.75 ? 0 : 1) * 100 + rank[c.src] * 10 + kcal / 100
    };
  });
  scored.sort((a,b)=>a.score - b.score);
  const out = [], fam = {};
  for(const s of scored){
    // One of each kind of thing: tuna, salmon and mackerel is one idea.
    const k = foodFamily(s.name);
    if(fam[k]) continue;
    fam[k] = true;
    out.push(s);
    if(out.length >= (limit || 3)) break;
  }
  return out;
}

function ideaLine(i){
  // The unit form only when it lands on something you could actually count.
  // "2.67 handfuls of pecans" is arithmetic, not an instruction - grams are
  // more use than a unit you cannot measure.
  let amt = fmt0(i.grams) + ' g';
  if(i.unitName && i.unitGrams > 0){
    const raw = i.grams / i.unitGrams;
    const rounded = Math.round(raw * 2) / 2;          // whole or half units
    if(rounded >= 0.5 && Math.abs(raw - rounded) <= raw * 0.12){
      amt = round2(rounded) + ' ' + pluralUnit(i.unitName, rounded) +
            ' (' + fmt0(i.unitGrams * rounded) + ' g)';
    }
  }
  return esc(i.name) + ' \u2014 <b>' + amt + '</b> is ' + fmt0(i.protein) +
         ' g protein for ' + fmt0(i.kcal) + ' kcal';
}

// ---- how often each of the three actually lands ----
function verdictRecord(nDays){
  const end = new Date(); end.setHours(0,0,0,0);
  let logged = 0, cal = 0, pro = 0, qual = 0, all = 0, qualKnown = 0;
  const calMiss = [], proMiss = [], qualMiss = [];
  for(let i = 1; i <= nDays; i++){
    const ds = ymd(addDays(end, -i));
    const v = dayVerdict(ds);
    if(!v.logged) continue;
    logged++;
    if(v.cal) cal++; else calMiss.push({ds, by: v.kcal - v.band.lo});
    if(v.protein) pro++; else proMiss.push({ds, by: v.proFloor - v.pro});
    if(v.healthKnown){ qualKnown++; if(v.quality) qual++; else qualMiss.push({ds, by: v.healthFloor - v.health}); }
    if(v.all) all++;
  }
  return {nDays, logged, cal, pro, qual, qualKnown, all, calMiss, proMiss, qualMiss};
}

// The tips. Every one of these is built from a WINDOW, names the shortfall in
// the units you think in, and ends with something you could do tomorrow. A tip
// that only describes the problem is not worth the space it takes.
//
// Ordered by what is costing the most days, not by what is easiest to detect.
const PATTERN_MIN_DAYS = 4;


/* ======================= Did the tip actually do anything? ===================
   COACH has been handing out advice and never once looking back to see whether
   it helped. That is the same fault as a trading rule nobody backtests.

   So: the first time a tip appears, the number it is about is written down.
   Every later appearance compares today's number to that one. A tip that has
   been up for three weeks with nothing moving is worth saying so about.

   The honest limit, stated on screen rather than hidden: this is a before and
   after, not an experiment. Something else could have caused the change. It
   still beats never looking.
=========================================================================== */
const TIPLOG_KEY = 'coachtiplog';
function loadTipLog(){ try{ return JSON.parse(CS.getItem(TIPLOG_KEY)) || {}; }catch(e){ return {}; } }
function saveTipLog(o){ return lsSet(TIPLOG_KEY, JSON.stringify(o)); }

// The miss rate for one kind of tip, as a share of the days that could be
// judged. A share, not a count, so a 7-day window and a 30-day window compare.
function tipMetric(kind, rec){
  if(!rec) return null;
  if(kind === 'protein'){
    if(!rec.logged) return null;
    return (rec.logged - rec.pro) / rec.logged;
  }
  if(kind === 'cal'){
    if(!rec.logged) return null;
    return (rec.logged - rec.cal) / rec.logged;
  }
  if(kind === 'quality'){
    if(!rec.qualKnown) return null;
    return (rec.qualKnown - rec.qual) / rec.qualKnown;
  }
  if(kind.indexOf('system:') === 0) return rec.systemRate == null ? null : rec.systemRate;
  return null;
}

// Called as a tip is rendered. Writes the starting figure once and keeps the
// latest, so the comparison is always first-sighting against now.
function noteTip(kind, value, when){
  if(value == null || !isFinite(value)) return null;
  const all = loadTipLog();
  // v140: the Data tab is drawn once, unseen, while the app loads. That is not
  // a sighting, so nothing is written.
  if(window.coachPredraw) return all[kind] || null;
  const today = when || todayYMD();
  let t = all[kind];
  if(!t){
    t = {first: today, firstValue: value, last: today, lastValue: value, seen: 1};
    all[kind] = t;
  } else {
    // One entry per day: opening the app five times is not five sightings.
    if(t.last !== today){ t.seen = (t.seen || 1) + 1; }
    t.last = today;
    t.lastValue = value;
  }
  saveTipLog(all);
  return t;
}

// What to say about it, or null when it is too soon to say anything.
// A week is the minimum: a tip given on Tuesday cannot be judged on Wednesday.
const TIP_MIN_DAYS = 7;
function tipProgress(kind, value){
  const t = loadTipLog()[kind];
  if(!t || t.firstValue == null) return null;
  const days = Math.round((parseYMD(todayYMD()) - parseYMD(t.first)) / 86400000);
  if(days < TIP_MIN_DAYS) return null;
  const now = (value == null ? t.lastValue : value);
  if(now == null) return null;
  const then = t.firstValue;
  const moved = then - now;                    // positive means fewer misses
  // Under five points of movement either way is the same week with different
  // rounding, not an improvement.
  const dir = Math.abs(moved) < 0.05 ? 'flat' : (moved > 0 ? 'better' : 'worse');
  return {days, then, now, moved, dir, first: t.first};
}

function tipProgressLine(kind, value){
  const p = tipProgress(kind, value);
  if(!p) return '';
  const pct = x => Math.round(x * 100) + '%';
  if(p.dir === 'better'){
    return '<div class="pt-prog good">Working. First flagged '+p.days+' days ago, when this was '+
      'missing '+pct(p.then)+' of days. Now '+pct(p.now)+'.</div>';
  }
  if(p.dir === 'worse'){
    return '<div class="pt-prog bad">Going the wrong way. '+pct(p.then)+' of days '+p.days+
      ' days ago, '+pct(p.now)+' now.</div>';
  }
  return '<div class="pt-prog">No change in '+p.days+' days — still '+pct(p.now)+
    ' of days. The advice above has not worked, so try something else.</div>';
}


/* ---- which part of you keeps going short ----
   The Body view can see that bones scored badly four days running and says
   nothing about it. This turns that into a tip: which system is most often
   under par, which nutrient is doing it, and what to eat.

   Only systems with enough measured to be trusted are counted. A system that
   is grey because no food carried the figures is a data gap, not a shortfall,
   and telling someone to eat more of a nutrient nobody measured would be
   inventing a problem.                                                       */
const SYSTEM_PAR = 80;
function systemRecord(nDays){
  const end = new Date(); end.setHours(0,0,0,0);
  const tally = {};
  let days = 0;
  for(let i = nDays; i >= 1; i--){
    const d = addDays(end, -i);
    const entries = loadEntries(d);
    if(!entries.length || !isDayComplete(ymd(d))) continue;
    days++;
    SYSTEMS.forEach(s=>{
      const st = systemState(s, entries);
      if(!systemTrusted(st) || st.pct === null) return;
      const t = tally[s.k] || (tally[s.k] = {k:s.k, sys:s, judged:0, short:0, sum:0, gaps:{}});
      t.judged++;
      t.sum += st.pct;
      if(st.pct < SYSTEM_PAR){
        t.short++;
        // Which nutrient was actually low on the days it fell short. This is
        // what makes the tip specific rather than "eat better".
        st.seen.forEach(r=>{
          if(r.spec.limit || r.pct >= 70) return;
          t.gaps[r.k] = (t.gaps[r.k] || 0) + 1;
        });
      }
    });
  }
  return {days, tally};
}

// The one worth telling him about: judged often enough to mean something, and
// short more than half the time.
function weakestSystem(nDays){
  const r = systemRecord(nDays);
  const rows = Object.keys(r.tally).map(k=>r.tally[k])
    .filter(t=>t.judged >= Math.max(3, Math.round(r.days * 0.5)) && t.short >= 2)
    .sort((a,b)=>(b.short / b.judged) - (a.short / a.judged) || (a.sum/a.judged) - (b.sum/b.judged));
  if(!rows.length) return null;
  const t = rows[0];
  const worst = Object.keys(t.gaps).map(k=>({k, n: t.gaps[k]}))
    .sort((a,b)=>b.n - a.n).slice(0, 3);
  return {sys: t.sys, judged: t.judged, short: t.short, avg: Math.round(t.sum / t.judged),
          worst, days: r.days, rate: t.short / t.judged};
}


/* ---- what one person actually eats of a thing ----
   Every suggestion used to assume the same portion: 150 g, or less if that
   came to more than 300 kcal. For a chicken breast that is right. For
   Vegemite it meant 150 g - a whole jar - and a niacin figure of over 1,000%.
   The per-gram number was true; the portion was absurd. A serving of Vegemite
   is a teaspoon.

   So the portion now comes from what is known about the food, in this order:
     1. its class, where the class has an obvious serving (a teaspoon of yeast
        extract, a handful of nuts, a matchbox of cheese);
     2. its own unit, where COACH has one - a teaspoon, a tablespoon, an egg;
     3. only then the old 150 g / 300 kcal rule.                             */
const CLASS_PORTION = [
  [/\b(vegemite|marmite|bovril|promite|yeast extract)\b/i, 5],    // one teaspoon
  [/\bnutritional yeast\b/i, 10],                                  // a tablespoon or two
  [/\b(peanut|almond|cashew|hazelnut|nut)\s+butter\b/i, 30],       // two tablespoons
  [/\btahini\b/i, 20],
  [/\b(seed|seeds|linseed|flaxseed|chia)\b/i, 30],                 // three tablespoons
  [/\b(nut|nuts|almond|almonds|walnut|walnuts|cashew|cashews|pecan|pecans|pistachio|pistachios|hazelnut|hazelnuts|macadamia|macadamias|brazil nut|brazil nuts|pine nut|pine nuts)\b/i, 30],   // a handful
  [/\b(parmesan|pecorino|grana padano)\b/i, 20],
  [/\b(cheddar|gruyere|emmental|gouda|edam|red leicester|stilton|brie|camembert|halloumi|feta|goats cheese|cheese)\b/i, 40],
  [/\b(raisin|raisins|sultana|sultanas|currants|prune|prunes|date|dates|dried apricot|dried apricots|dried fig|dried figs|dried fruit|dried cranberr\w*)\b/i, 40],
  [/\banchov\w*/i, 30],                                            // a drained tin
  [/\b(liver|kidney|kidneys)\b/i, 100],
  [/\begg yolk\b/i, 34],                                           // two yolks
  [/\b(molasses|treacle)\b/i, 15],
  // A spoonful, because that is how they are used. Without this, icing sugar
  // took a 77 g "plate" and scored better than the bacon beside it.
  [/\b(sugar|caster|demerara|syrup|honey|agave|jam|marmalade|nutella|chocolate spread|ketchup|mayonnaise|salad cream|brown sauce|mustard|chutney|pickle|relish|gravy granules)\b/i, 15],
  [/\b(soy sauce|fish sauce|worcestershire|tabasco|hot sauce|sriracha|vinegar)\b/i, 10],
  [/\b(dark chocolate|cocoa)\b/i, 20]
];

// Real foods, but not ones worth suggesting to fix a gap: fried and battered
// dishes, pastry, and anything that is mostly added sugar. Shared by every
// suggestion list so they cannot drift apart.
const FRIED_OR_PASTRY = /\b(spring roll|samosa|pakora|bhaji|battered|breaded|scampi|pasty|pasties|sausage roll|pie|kebab|nuggets?|fried chicken|chips|crisps|fries)\b/i;
function notASuggestion(name){
  name = String(name || '');
  if(FRIED_OR_PASTRY.test(name)) return true;
  if(typeof freeSugarFraction === 'function' && freeSugarFraction(name) === 1) return true;
  return false;
}

function realisticPortion(f){
  const name = String((f && f.name) || '');
  for(const [re, g] of CLASS_PORTION) if(re.test(name)) return g;

  // The plateful: 150 g, capped by calories. Dried leaves and vegetables are
  // the exception - 140 g of dried spinach is a bin bag.
  const dried = /\bdried\b/i.test(name) &&
    !/fruit|raisin|sultana|date|apricot|fig|prune|cranberr|pasta|noodle|bean|lentil|pea\b|rice/i.test(name);
  const kc = f && f.kcal100 > 0 ? 300 / (f.kcal100 / 100) : 150;
  // A drink is not a plateful. Nobody pours 150 ml of beer or milk: a glass is
  // 250 ml, a can is 330 and a pint is 568, so a liquid takes its own measure
  // where it has one and a glass where it does not.
  // A can of beans is not a drink, so "can" only counts as one when what is in
  // it is dilute enough to be drunk.
  const unitName = String((f && f.unitName) || '');
  const DRINKY = /\b(cola|coke|pepsi|beer|lager|ale|stout|cider|wine|prosecco|juice|water|drink|energy|tonic|soda|lemonade|squash|milk|shake|smoothie|coffee|tea|latte|cappuccino|kombucha|lucozade|ribena|gatorade|monster|red bull)\b/i;
  const dilute = !(f && f.kcal100 > 120);
  const boozy = (typeof isAlcohol === 'function') && isAlcohol(f);
  const liquid = (f && (f.basis === 'ml' ||
                 (typeof LIQUID_FOODS !== 'undefined' && LIQUID_FOODS.has(name)) ||
                 /\b(pint|glass|mug|shot|measure)\b/i.test(unitName) ||
                 // A bottle of lager is a drink whatever the brand is called.
                 (boozy && /\b(pint|glass|can|bottle|shot|measure)\b/i.test(unitName)) ||
                 (boozy && /\b(pint|330ml|500ml|440ml|bottle|can)\b/i.test(name)) ||
                 (dilute && /\b(can|bottle)\b/i.test(unitName) && DRINKY.test(name)) ||
                 (dilute && DRINKY.test(name) && /\b(pint|330ml|500ml|bottle)\b/i.test(name))));
  if(liquid){
    const ugL = Number(f && f.unitGrams) || 0;
    const uL = String((f && f.unitName) || '').toLowerCase();
    // A measure of spirits is 25 ml and that IS the serving. The old floor of
    // 100 ml threw it away and poured five shots instead.
    if(ugL >= 20 && ugL <= 600 && !/^(tsp|teaspoon|tbsp|tablespoon)/.test(uL)) return ugL;
    return Math.max(30, Math.min(330, kc > 0 ? Math.max(100, Math.min(330, kc)) : 250, 250));
  }
  const plate = Math.max(15, Math.min(dried ? 25 : 150, kc));

  // The food's own unit, if COACH knows one - but a unit can only ever make a
  // portion SMALLER than a plateful, never bigger. Some units are the whole
  // pack: a 350 g block of tofu, a 400 g tin of beans, a 500 g ready meal.
  // Taking those as a serving put "tofu, 350 g" at the top of three lists.
  const u  = String((f && f.unitName) || '').toLowerCase();
  const ug = Number(f && f.unitGrams) || 0;
  if(ug > 0){
    if(/^(tsp|teaspoon)/.test(u)) return Math.min(ug, plate);          // one teaspoon
    if(/^(tbsp|tablespoon|dessertspoon)/.test(u)) return Math.min(ug * 2, plate);
    // A countable thing - an egg, a slice, a fillet - served as one to three
    // of them while that stays within a plateful. Tiny units (one almond, one
    // grape) say nothing about a serving and fall through to the plate.
    if(ug >= 10 && ug <= plate){
      const n = Math.max(1, Math.min(3, Math.floor(plate / ug)));
      return ug * n;
    }
  }
  return plate;
}

// Things that top a per-100g league table and that nobody eats 100 g of.
// Sorting purely by density put "Agar, dried" and "Parsley, curly, raw" at the
// top of the calcium list - technically correct and completely useless. This
// is the same lesson as the protein suggestions, which offered 145 g of
// nutritional yeast before NOT_A_MEAL_ADDITION was added.
const HERB_OR_SPICE = /(marjoram|oregano|thyme|rosemary|sage|basil|tarragon|dill|chervil|chives|bay leaf|parsley|coriander leaf|mint,|mixed herbs|herbs,|spice|cinnamon|paprika|cayenne|chilli powder|cumin|coriander seed|turmeric|curry powder|curry leaves|fenugreek|caraway|cardamom|celery seed|clove|nutmeg|mace|allspice|juniper|saffron|star anise|vanilla|mustard,|mustard seed|poppy seed|ginger|^garlic|garlic,|garlic$|chilli|chili|mustard|horseradish|tomato (puree|paste)|puree, tomato|flakes$|pepper, (black|white|cayenne)|(black|white|cayenne) pepper|peppercorn)/i;
const NOT_A_PORTION = /(agar|seaweed|kombu|nori|wakame|kelp|dulse|laver|baking|bicarbonate|salt,|^salt|gravy granules|winkle|whelk|cockle|tea, |coffee, |bran, |wheatgerm|yeast, dried|dried yeast|baker|stock,|bouillon|mint sauce|horseradish|wasabi|cream of tartar|psyllium|bombay duck|paste, (shrimp|fish)|fish paste)/i;

// Foods that genuinely carry the nutrient, taken from the national tables
// already in the app rather than from a list of things that sound healthy.
// Ranked by what a REALISTIC PORTION delivers, not by what 100 g would.
/* Rebuilding these two lists cost 46 ms EVERY time a nutrient was asked
   about - and the end-of-day review asks about a dozen of them, twice. That
   was most of the wait after ticking a day complete. The lists are the same
   all session, so they are built once; the answers are remembered too, keyed
   on the nutrient and the target, and thrown away whenever your own food data
   changes.                                                                   */
let richPoolCache = null;
// v117: built a slice at a time while idle (richPoolStep), or all at once
// when something needs it now. Same rows, same order either way.
let richLocalPart = null;
function richPoolStep(budgetMs){
  if(richPoolCache) return true;
  if(!richLocalPart) richLocalPart = {i: 0, out: []};
  const st = richLocalPart;
  const end = budgetMs == null ? Infinity : performance.now() + budgetMs;
  while(st.i < LOCAL_FOODS.length){
    const row = LOCAL_FOODS[st.i++];
    if(!isPerItemRow(row)){
      const f = localToFood(row);
      if(f) st.out.push({name: f.name, kcal100: f.kcal100, micros100: f.micros100 || {},
                  p100: f.p100, sat100: f.sat100, sug100: f.sug100,
                  unitName: f.unitName, unitGrams: f.unitGrams, basis: f.basis});
    }
    if((st.i & 31) === 0 && performance.now() > end) return false;
  }
  richPoolCache = [st.out, [].concat.apply([], NF_TABLES.map(t=>nfAll(t.k)))];
  richLocalPart = null;
  return true;
}
function richPools(){
  if(richPoolCache) return richPoolCache;
  richPoolStep(null);
  return richPoolCache;
}
const richCache = {};
/* v87: `skip` is how the shuffle works. The ranking is fixed - the best source
   is the best source - so shuffling walks further down it rather than
   randomising, and wraps back to the top when it runs out. That way you get
   new ideas without ever being shown a worse one dressed up as a better one. */
function foodsRichIn(key, n, skip){
  const want = n || 3;
  const sk = Math.max(0, Number(skip) || 0);
  let sexK = 'm';
  try{ sexK = loadProfile().sex === 'female' ? 'f' : 'm'; }catch(e){}
  const ck = key + '|' + want + '|' + sk + '|' + sexK + '|' + ((targets && targets.kcal) || 0);
  if(ck in richCache) return richCache[ck];
  const all = foodsRichInRaw(key, want + sk);
  let out = all.slice(sk, sk + want);
  // Walked off the end: start again from the top rather than show nothing.
  if(!out.length && all.length) out = all.slice(0, want);
  richCache[ck] = out;
  return out;
}
/* Six things no UK or Australian food table carries a column for: the three
   amino acids, EPA and DHA on their own, and choline. They only ever get a
   figure from a scanned label or from USDA. Ranking foods by a nutrient no food
   in the list has a figure for would either return nothing or invent something,
   so instead:

     - the amino acids are ranked on PROTEIN, which is real data, and the page
       says that is what it did. Leucine, lysine and methionine track protein
       closely in animal foods, less so in plants, and the note says so.
     - EPA, DHA and choline get named sources and no numbers at all, because
       there is no honest number to show.

   Nothing here is a made-up figure. */
const RICH_VIA_PROTEIN = {leucine:1, lysine:1, methionine:1};
const RICH_NO_TABLE = {
  epadha: {
    note:'No UK or Australian food table carries EPA and DHA separately, so COACH cannot rank '+
         'foods on it — only a scanned label or an American table entry ever fills this in.',
    foods:'Salmon, mackerel, sardines, herring, trout, anchovies and mussels are where it comes '+
          'from, and two portions of oily fish a week is the usual target. If fish is out, algae '+
          'oil is the only plant source of the long-chain forms — flax and walnuts carry the '+
          'short-chain one, which your body converts very badly.'},
  choline: {
    note:'No UK or Australian food table carries choline, so there is nothing to rank foods on '+
         'here — it arrives from a scanned label or an American table entry.',
    foods:'Egg yolks are far and away the best source, then liver, then soya, chicken, cod, '+
          'beans, and cruciferous veg like broccoli and sprouts. Two eggs covers a good chunk '+
          'of a day.'}
};

/* v117: whether a food may be suggested at all, worked out once per food.
   These checks read only the food's name, so the answer is the same for every
   nutrient - and the reviews ask for a dozen nutrients over ~13,000 foods.
   Doing them once took the weekly review from about a second to a fraction. */
const RICH_OK = new WeakMap();
function richOk(f){
  let r = RICH_OK.get(f);
  if(r !== undefined) return r;
  const name = String(f.name || '');
  r = !(NOT_A_PORTION.test(name) || HERB_OR_SPICE.test(name) ||
        (typeof NOT_A_MEAL_ADDITION !== 'undefined' && NOT_A_MEAL_ADDITION.test(name)) ||
        (typeof novaGroup === 'function' && novaGroup(name) === 4) ||
        (typeof notASuggestion === 'function' && notASuggestion(name)) ||
        (typeof oddIdea === 'function' && oddIdea(name)));
  RICH_OK.set(f, r);
  return r;
}
const RICH_RAWMEAT = /\b(beef|lamb|pork|chicken|turkey|liver|kidney|mince|steak|bacon|sausage|duck|venison|veal|salmon|squid|cod|tuna|prawn|prawns|mackerel|haddock|trout|scallop|scallops|octopus|mussel|mussels)\b/i;
const RICH_PORTION = new WeakMap();
function richPortion(f){
  let r = RICH_PORTION.get(f);
  if(r === undefined){
    const name = String(f.name || '');
    r = (/\braw\b/i.test(name) && RICH_RAWMEAT.test(name)) ? -1 : realisticPortion(f);
    RICH_PORTION.set(f, r);
  }
  return r;
}
function foodsRichInRaw(key, n){
  // The amino acids borrow protein's ranking, which is real data.
  if(RICH_VIA_PROTEIN[key]) return foodsHighInProtein(n);
  if(key === 'protein')     return foodsHighInProtein(n);
  const spec = MICROS.filter(m=>m.k === key)[0];
  if(!spec) return [];
  // Your target, not the male one. Iron is 8 mg for a man and 18 for a woman,
  // so the male figure more than doubled every percentage a woman saw.
  let sexK = 'm';
  try{ sexK = loadProfile().sex === 'female' ? 'f' : 'm'; }catch(e){}
  const target = spec.rda ? spec.rda[sexK] : null;
  if(!(target > 0)) return [];
  // Two passes, and the order is the whole point. COACH's own 794 foods were
  // chosen as things a person actually eats, and they now carry the national
  // tables' figures anyway - so they are searched FIRST. Ranking the 4,400
  // reference foods by nutrient share surfaces cream of tartar, shrimp paste
  // and West Indian cherries: all true, none of them dinner.
  const pools = richPools();

  const collect = pool => {
    const out = [];
    pool.forEach(f=>{
      const v = f.micros100 ? f.micros100[key] : null;
      if(v == null || !(v > 0) || !(f.kcal100 > 0)) return;
      const name = String(f.name || '');
      if(!richOk(f)) return;
      // Published raw in the tables; nobody plans a meal around raw pork
      // mince or raw squid. (richPortion gives -1 for those.)
      const portion = richPortion(f);
      if(portion < 0) return;
      const share = (v * portion / 100) / target;
      // Under a fifth of the day's target in a full portion is not a source
      // of it, whatever the per-100g figure says.
      if(share < 0.2) return;
      out.push({name: name, kcal: f.kcal100, portion: Math.round(portion),
                share: share, per100: v / target});
    });
    out.sort((a,b)=>b.share - a.share);
    return out;
  };

  // "Liver, lamb, cooked" and "Ox liver, cooked" are one idea, not two, and
  // matching on the first word alone missed that. So each suggestion is
  // reduced to the words that actually name the food - dropping the ones that
  // only describe how it was prepared or what shape it comes in - and anything
  // sharing one of those with a pick already made is skipped.
  const GENERIC = /^(seed|nut|meat|flesh|cooked|raw|canned|dried|fresh|boiled|grilled|roasted|fried|baked|fillet|breast|whole|plain|only|and|with|in|the|a|of)$/i;
  const nouns = name => name.toLowerCase().split(/[^a-z0-9]+/)
    .map(x=>x.replace(/s$/, '')).filter(x=>x.length > 2 && !GENERIC.test(x));

  const want = n || 3;
  const taken = {}, picked = [];
  for(const pool of pools){
    for(const f of collect(pool)){
      const ns = nouns(f.name);
      if(!ns.length || ns.some(x=>taken[x])) continue;
      ns.forEach(x=>{ taken[x] = true; });
      picked.push(f);
      if(picked.length >= want) return picked;
    }
  }
  return picked;
}

/* Foods by protein, in the same shape foodsRichIn returns, so everything that
   renders one of those lists can render this one too. Ranked on your own daily
   protein target, and on one normal portion rather than per 100 g, so a food
   nobody eats 100 g of does not win. */
function foodsHighInProtein(n){
  const target = Number(targets && targets.protein) || 0;
  if(!(target > 0)) return [];
  const pools = richPools();
  const GENERIC = /^(seed|nut|meat|flesh|cooked|raw|canned|dried|fresh|boiled|grilled|roasted|fried|baked|fillet|breast|whole|plain|only|and|with|in|the|a|of)$/i;
  const nouns = name => String(name).toLowerCase().split(/[^a-z0-9]+/)
    .map(x=>x.replace(/s$/, '')).filter(x=>x.length > 2 && !GENERIC.test(x));

  const collect = pool => {
    const out = [];
    pool.forEach(f=>{
      const p100 = Number(f.p100);
      if(!(p100 > 0) || !(f.kcal100 > 0)) return;
      const name = String(f.name || '');
      if(!richOk(f)) return;
      const portion = (f.unitGrams > 0 && f.unitGrams <= 400) ? f.unitGrams
                    : (f.basis === 'ml' ? 250 : 100);
      const grams = p100 * portion / 100;
      if(!(grams >= 4)) return;                  // not a protein source in any real sense
      out.push({name: name, portion: Math.round(portion), grams: grams,
                share: grams / target, kcal100: f.kcal100});
    });
    return out.sort((a,b)=>b.share - a.share);
  };

  const want = n || 3;
  const taken = {}, picked = [];
  for(const pool of pools){
    for(const f of collect(pool)){
      const ns = nouns(f.name);
      if(!ns.length || ns.some(x=>taken[x])) continue;
      ns.forEach(x=>{ taken[x] = true; });
      picked.push(f);
      if(picked.length >= want) return picked;
    }
  }
  return picked;
}

function patternTips(nDays, opts){
  opts = opts || {};
  const r = verdictRecord(nDays);
  const tips = [];
  if(r.logged < PATTERN_MIN_DAYS){
    return {tips, record: r, thin: true};
  }
  // v141: say the window actually used (the Data screen passes 90 for 90 days and the year).
  const word = nDays <= 8 ? 'this week' : nDays <= 31 ? 'this month' : 'in the last '+nDays+' days';
  const missed = [
    {k:'protein', n: r.logged - r.pro},
    {k:'cal',     n: r.logged - r.cal},
    {k:'quality', n: r.qualKnown - r.qual}
  ].sort((a,b)=>b.n - a.n);

  for(const m of missed){
    if(m.n < 2) continue;                      // once is a bad day, not a pattern

    if(m.k === 'protein'){
      const avgShort = r.proMiss.reduce((s,x)=>s+x.by,0) / r.proMiss.length;
      const weak = weakestProteinMeal(nDays);
      const ideas = proteinIdeas(weak ? weak.gap : avgShort, 3);
      // v143: the point first, in a line or two.
      let body = 'Short on <b>'+m.n+' of '+r.logged+'</b> days '+word+', by '+fmt0(avgShort)+' g on average.';
      if(weak){
        body += ' <b>'+esc(weak.meal)+'</b> is the gap: '+fmt0(weak.avgKcal)+' kcal but only '+
                fmt0(weak.avgProtein)+' g protein. Room for about '+fmt0(weak.missed)+' g more, same calories.';
      }
      tips.push({key:'protein', title: weak ? 'Your '+weak.meal.toLowerCase()+' is where protein slips'
                                            : 'Protein keeps finishing short',
                 body, ideas,
                 ideaLead: weak ? 'Worth adding to '+weak.meal.toLowerCase()+':' : 'Worth adding:'});
    }

    if(m.k === 'cal'){
      const under = r.calMiss.filter(x=>x.by < 0);
      const over = r.calMiss.filter(x=>x.by > 0);
      const mp = mealPatterns(nDays);
      if(under.length >= over.length && under.length){
        const avg = under.reduce((s,x)=>s+Math.abs(x.by),0) / under.length;
        // The meal most often missing entirely on the short days is the easiest
        // thing to change - adding a meal beats enlarging three of them.
        const rare = mp.meals.filter(x=>x.frequency > 0 && x.frequency < 0.6)
                             .sort((a,b)=>a.frequency - b.frequency)[0];
        let body = 'Under on <b>'+under.length+' of '+r.logged+'</b> days, by '+fmt0(avg)+' kcal on average.';
        if(rare){
          body += ' '+esc(rare.meal)+' was skipped on '+Math.round((1 - rare.frequency)*100)+
                  '% of days \u2014 adding it back is '+fmt0(rare.avgKcal)+' kcal.';
        }
        tips.push({key:'cal', title:'Under the calorie band', body,
                   ideas: calorieIdeas(avg, 3),
                   ideaLead:'Calorie-dense, so it does not mean a third meal:'});
      } else if(over.length){
        const avg = over.reduce((s,x)=>s+x.by,0) / over.length;
        const big = mp.meals.slice().sort((a,b)=>b.avgKcal - a.avgKcal)[0];
        tips.push({key:'cal',
          title:'Over the top of the band',
          body:'Over on <b>'+over.length+' of '+r.logged+'</b> days, by '+fmt0(avg)+' kcal on average.'+
               (big ? ' Biggest meal: '+esc(big.meal)+', '+fmt0(big.avgKcal)+' kcal.' : ''),
          ideas: [], ideaLead:''});
      }
    }

    if(m.k === 'quality' && r.qualKnown >= PATTERN_MIN_DAYS){
      const avgShort = r.qualMiss.reduce((s,x)=>s+x.by,0) / r.qualMiss.length;
      const worst = worstQualityFoods(nDays, 3);
      tips.push({key:'quality',
        title:'Food quality is under your floor',
        body:'Under '+healthFloor()+' on <b>'+m.n+' of '+r.qualKnown+'</b> days '+word+', by '+fmt0(avgShort)+' points on average.',
        ideas: [], ideaLead:'',
        worst: worst});
    }
  }

  // The Body view could already see this and said nothing about it. A part of
  // you that keeps finishing under par is a more useful thing to fix than a
  // nutrient in isolation, because it says WHY it matters.
  const weakSys = weakestSystem(nDays);
  if(weakSys){
    const names = {};
    MICROS.forEach(m=>{ names[m.k] = m.n; });
    const lowNames = weakSys.worst.map(x=>names[x.k] || x.k);
    let body = 'Under par on <b>'+weakSys.short+' of '+weakSys.judged+'</b> days '+word+' (average '+weakSys.avg+'%).';
    if(lowNames.length) body += ' Short on '+esc(andList(lowNames))+'.';
    // Foods that genuinely carry the nutrient, taken from the national tables
    // rather than from a list of things that sound healthy.
    const rich = weakSys.worst.length ? foodsRichIn(weakSys.worst[0].k, 3) : [];
    tips.push({
      key: 'system:' + weakSys.sys.k,
      metric: weakSys.rate,
      title: weakSys.sys.ico + ' ' + weakSys.sys.n + ' keeps finishing short',
      body: body, ideas: [], ideaLead: '', rich: rich,
      richLead: rich.length ? 'Most ' + (names[weakSys.worst[0].k] || '') +
                              ' for the calories:' : ''
    });
  }

  // Each tip carries the number it is about, so its first sighting can be
  // written down and every later one measured against it.
  tips.forEach(t=>{ if(t.metric == null) t.metric = tipMetric(t.key, r); });

  return {tips: tips.slice(0, 4), record: r, thin: false};
}

// The single worst item on one day, by the same measure the window version uses.
function worstQualityToday(entries){
  let worst = null;
  (entries || []).forEach(e=>{
    const g = Number(e.grams) || 0;
    if(!(g > 0) || e.sugar == null || e.sat == null) return;
    const per = 100 / g;
    const sc = foodScores({ name:e.name, kcal100:(e.kcal||0)*per, p100:(e.protein||0)*per,
      c100:(e.carbs||0)*per, f100:(e.fat||0)*per, sug100:(e.sugar||0)*per, sat100:(e.sat||0)*per,
      micros100:(function(){ const m=e.micros||{}, o={};
        Object.keys(m).forEach(k=>{ o[k]=m[k]*per; }); return o; })(),
      basis: entryBasis(e) });
    if(!sc || sc.health === null) return;
    const drag = Math.max(0, 50 - sc.health) * (Number(e.kcal) || 0);
    if(drag <= 0) return;
    if(!worst || drag > worst.drag) worst = {name:e.name, score:sc.health, kcal:Number(e.kcal)||0, drag};
  });
  return worst;
}

// The items doing the most damage to the day score, across the window. Weighted
// by how much of them you ate and how badly they score, so one bad thing eaten
// often beats one terrible thing eaten once.
function worstQualityFoods(nDays, limit){
  const end = new Date(); end.setHours(0,0,0,0);
  const acc = {};
  for(let i = 1; i <= nDays; i++){
    const es = loadEntriesRO(addDays(end, -i));
    es.forEach(e=>{
      const g = Number(e.grams) || 0;
      if(!(g > 0) || e.sugar == null || e.sat == null) return;
      const per = 100 / g;
      const f = { name: e.name, kcal100:(e.kcal||0)*per, p100:(e.protein||0)*per,
                  c100:(e.carbs||0)*per, f100:(e.fat||0)*per,
                  sug100:(e.sugar||0)*per, sat100:(e.sat||0)*per,
                  micros100:(function(){ const m=e.micros||{}, o={};
                    Object.keys(m).forEach(k=>{ o[k]=m[k]*per; }); return o; })(),
                  basis: entryBasis(e) };
      const sc = foodScores(f);
      if(!sc || sc.health === null) return;
      const key = normalise(String(e.name||''));
      if(!key) return;
      if(!acc[key]) acc[key] = {name:e.name, times:0, kcal:0, worst:sc.health, sum:0};
      const a = acc[key];
      a.times++; a.kcal += Number(e.kcal)||0; a.sum += sc.health;
      if(sc.health < a.worst) a.worst = sc.health;
    });
  }
  return Object.keys(acc).map(k=>{
    const a = acc[k];
    const avg = a.sum / a.times;
    // How much this item drags: how far below 50 it scores, times how much of it
    // you ate. Something scoring 45 once is not the problem.
    return {name:a.name, times:a.times, kcal:a.kcal, score: Math.round(avg),
            drag: Math.max(0, 50 - avg) * a.kcal};
  }).filter(x=>x.drag > 0).sort((a,b)=>b.drag - a.drag).slice(0, limit || 3);
}

// One block of HTML for a set of tips, used by the day, week and month reviews
// so all three say the same thing in the same shape.
function tipsHTML(res){
  if(res.thin || !res.tips.length) return '';
  return res.tips.map(t=>{
    // Written down the first time this tip appears, compared every time after.
    // A tip that has been up for three weeks with nothing moving should say so
    // rather than repeat itself in the same confident voice.
    const prog = (t.metric != null) ? (noteTip(t.key, t.metric), tipProgressLine(t.key, t.metric)) : '';
    let html = '<div class="ptip"><div class="pt-h">'+esc(t.title)+'</div>'+
               '<div class="pt-b">'+t.body+'</div>' + prog;
    if(t.rich && t.rich.length){
      html += '<div class="pt-lead">'+esc(t.richLead)+'</div>'+
        '<div class="pt-ideas">'+t.rich.map(f=>'<div class="pt-i">'+esc(f.name)+
          ' <s>'+fmt0(f.kcal)+' kcal / 100g</s></div>').join('')+'</div>';
    }
    if(t.ideas && t.ideas.length){
      html += '<div class="pt-lead">'+esc(t.ideaLead)+'</div>'+
        '<div class="pt-ideas">'+t.ideas.map(i=>'<div class="pt-i">'+ideaLine(i)+
          (i.src !== 'local' ? '<s>already in your foods</s>' : '')+'</div>').join('')+'</div>';
    }
    if(t.worst && t.worst.length){
      html += '<div class="pt-lead">Pulling the score down most:</div>'+
        '<div class="pt-ideas">'+t.worst.map(x=>'<div class="pt-i">'+esc(x.name)+
          ' \u2014 scores <b>'+x.score+'</b>, eaten '+x.times+' time'+(x.times===1?'':'s')+
          ' ('+fmt0(x.kcal)+' kcal)</div>').join('')+'</div>';
    }
    return html + '</div>';
  }).join('');
}

