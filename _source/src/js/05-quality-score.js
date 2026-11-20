/* ============================ the quality score, v3 ============================
   What the score is asking, in one line: for the calories it costs, how much
   of what you need does this food carry - and how much of your daily salt,
   saturated fat and free sugar does one normal portion of it use up?

   Why it changed. Until now the number was built on Nutri-Score, which is a
   label scheme for packets: it grades ENERGY, saturated fat, sugar, salt,
   fibre and protein per 100 g and nothing else. It cannot see a single
   vitamin or mineral, it treats 100 g of cheese and 100 g of crisps as
   comparable amounts, and every correction for what it misses had to be
   bolted on top - which is how mature cheddar came out below a bag of Doritos.
   COACH now holds real nutrient profiles for nearly every food, so the score
   is built from those instead.

   The method is the Nutrient Rich Foods approach (Drewnowski 2010, and the
   NRF9.3 index validated against the Healthy Eating Index), with three
   deliberate changes:
     1. YOUR targets, not a generic label reference - so the same food scores
        differently for a 2,650 kcal build than for a cut.
     2. The three things to limit are measured on a REALISTIC PORTION, not per
        100 kcal. A daily salt limit is an amount, not a density: measuring it
        per calorie makes baked beans look saltier than crisps.
     3. Ultra-processing is applied last, as a multiplier, because it is the
        part of the evidence (Srour 2019, Hall 2019) that nutrient numbers
        cannot see.

   Nothing here is hidden: the panel shows the nutrient half, the portion half
   and the processing cut as three lines that add up to the number, and the
   published Nutri-Score grade is still printed beside it as a second opinion.
============================================================================= */
const Q_CAP = 2.5;          // no single nutrient counts for more than 2.5 days' worth of density
const Q_LIM_W = 2.2;        // what overspending the day's salt / sat fat / free sugar costs
const Q_MID = 0.15, Q_SPREAD = 0.7;   // where the 0-100 curve sits (calibrated below)

/* v112: every food that gets a score asked for these again from scratch -
   profile, targets, training day, the lot - and a single screen scores
   hundreds of foods. They are the same for all of them. Kept until anything
   is saved, the day on screen changes, or a moment passes. */
let qtCache = null;
function qTargets(){
  const key = dataEpoch + '|' + (targets ? targets.kcal + '/' + targets.protein : '') + '|' +
    ((typeof currentDate !== 'undefined' && currentDate) ? +currentDate : '');
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  if(qtCache && qtCache.key === key && now - qtCache.at < 1500) return qtCache.v;
  const v = qTargetsRaw();
  qtCache = {key: key, at: now, v: v};
  return v;
}
function qTargetsRaw(){
  const specs = microTargetsFor([]);
  const kcalT = (targets && targets.kcal > 0) ? targets.kcal : 2400;
  return {
    kcalT: kcalT,
    proT: (targets && targets.protein > 0) ? targets.protein : 150,
    good: specs.filter(m=>!m.limit && !m.info && !m.unranged && m.target > 0),
    // The UK Chief Medical Officers' limit is 14 units a week, so the day's
    // share is 2 units - 16 g of alcohol. It sits with the other limits
    // because that is what it is: something to stay under, not a nutrient.
    lim: ['freesugar','satfat','sodium'].map(k=>specs.filter(m=>m.k === k)[0]).filter(x=>x)
          .concat([{k:'alcohol', n:'Alcohol', u:'g', target:16, limit:true}])
  };
}

// How much of what you need it carries, for the calories it costs. 1.0 means
// "exactly the density your whole day needs"; anything above that is a food
// that pulls its weight.
function nutrientDensity(f){
  const t = qTargets();
  const m = (f && f.micros100) || {};
  if(!f || !(f.kcal100 > 0)) return null;
  const per = 100 / f.kcal100;
  let sum = 0, n = 0;
  const hits = [], rat = {};
  t.good.forEach(s=>{
    const v = m[s.k];
    if(v == null || !isFinite(v)) return;
    const need = s.target / t.kcalT * 100;
    if(!(need > 0)) return;
    const r = Math.min(Q_CAP, (v * per) / need);
    sum += r; n++; rat[s.k] = r;
    if(r >= 1) hits.push({k:s.k, n:s.n, r:r});
  });
  let proR = null;
  if(f.p100 != null && isFinite(f.p100)){
    proR = Math.min(Q_CAP, (f.p100 * per) / (t.proT / t.kcalT * 100));
    sum += proR; n++; rat.protein = proR;
    if(proR >= 1) hits.push({k:'protein', n:'Protein', r:proR});
  }
  if(!n) return null;
  const total = t.good.length + 1;
  const cover = n / total;
  // Missing figures are not zeros, and they are not free marks either. What is
  // not on record counts as an ORDINARY food's density, so a food with three
  // known nutrients cannot look like a superfood on the strength of them -
  // it drifts towards the middle until the figures are there.
  const PRIOR = 0.55;
  sum += PRIOR * (total - n);
  // Fat is where nutrient counting alone goes wrong: olive oil carries almost
  // nothing per calorie and is still the fat to cook with. Unsaturated fat in
  // a food that was not built in a factory earns a little back.
  let fatBonus = 0;
  const nova = novaGroupOf(f);
  if(nova !== 4 && f.f100 > 3 && f.sat100 != null && f.f100 > 0){
    // A label claiming negative saturated fat is a broken label, not a
    // miracle oil: clamp it before it can earn anything.
    const satC = Math.max(0, Number(f.sat100) || 0);
    const unsat = Math.max(0, 1 - satC / f.f100);
    const fatShare = Math.min(1, (f.f100 * 9) / (f.kcal100 || 1));
    fatBonus = 0.3 * Math.max(0, unsat - 0.5) * 2 * fatShare;
  }
  hits.sort((a,b)=>b.r - a.r);
  /* rat is every ratio it worked out, not just the ones above its own weight.
     The card uses it to say which part of the body a food is actually for -
     the figures were already here, nothing new is being invented. */
  return {v: sum / total, cover: cover, n: n, fatBonus: fatBonus, hits: hits, rat: rat};
}

// What one normal portion spends of the day's three limits.
function limitLoad(f){
  /* Handed a plate, this shares the answer out by calories instead of
     measuring one helping of the mixture. See the note in combinedFood: a
     plate got one fair share of the day where its parts each got their own,
     and that alone knocked lumps off perfectly ordinary bowls of food. */
  if(f && f.limitParts && f.limitParts.length){
    const ps = f.limitParts;
    const kc = ps.reduce((a, x)=>a + (Number(x.kcal) || 0), 0);
    if(kc > 0){
      let load = 0, portion = 0; const byKey = {};
      ps.forEach(x=>{
        const w = (Number(x.kcal) || 0) / kc;
        load += (Number(x.load) || 0) * w;
        portion += (Number(x.portion) || 0) * w;
        (x.rows || []).forEach(r=>{
          const b = byKey[r.k] || (byKey[r.k] = {k: r.k, n: r.n, pct: 0, over: 0});
          b.pct  += (Number(r.pct)  || 0) * w;
          b.over += (Number(r.over) || 0) * w;
        });
      });
      const rows = Object.keys(byKey).map(k=>({k: k, n: byKey[k].n,
        pct: Math.round(byKey[k].pct), over: Math.round(byKey[k].over)}));
      rows.sort((a,b)=>b.over - a.over || b.pct - a.pct);
      const fr0 = freeSugarFractionFor(f);
      return {load: load, known: rows.length, portion: Math.round(portion),
              fair: null, rows: rows, apportioned: true,
              matrix: ps.some(x=>x.matrix),
              freeAssumed: (fr0.assumed && f.free100 == null && f.sug100 != null && f.sug100 > 2)
                           || !!(f.freeAssumedAny && f.sug100 != null && f.sug100 > 2)};
    }
  }
  const t = qTargets();
  const m = (f && f.micros100) || {};
  /* One rule for everything: a normal portion. Single food or plate, the
     question is the same, so the measure has to be the same. */
  const portion = (typeof realisticPortion === 'function') ? realisticPortion(f) : 100;
  const g = portion / 100;
  // A portion is allowed its share of the day: 10% of your calories may fairly
  // use 10% of the day's salt. Only what it spends ABOVE that share counts
  // against it - which is what stops a 120 kcal tin of beans being marked
  // saltier than a 260 kcal bag of crisps, and lets a whole day that lands on
  // its limits score as neutral rather than as a disaster.
  const fair = Math.min(1, (f.kcal100 * g) / t.kcalT);
  const fr = freeSugarFractionFor(f);
  const nova = novaGroupOf(f);
  // The dairy matrix again: saturated fat inside cheese or yoghurt does not
  // move LDL the way the same grams in butter or a pie do.
  const matrix = (DAIRY_MATRIX.test(f.name || '') && nova !== 4) ? 0.67 : 1;
  const vals = {
    freesugar: (f.free100 != null) ? f.free100
             : ((f.sug100 != null) ? f.sug100 * fr.frac : null),
    satfat: f.sat100 == null ? null : f.sat100 * matrix,
    sodium: m.sodium,
    alcohol: alcoholPer100(f)
  };
  let load = 0, known = 0;
  const rows = [];
  t.lim.forEach(s=>{
    const v = vals[s.k];
    if(v == null || !isFinite(v) || !(s.target > 0)) return;
    const share = (v * g) / s.target;
    // Alcohol can cost more than the others: a pint is most of a day's limit on
    // its own, and nothing about the rest of the drink makes up for it.
    const over = Math.min(s.k === 'alcohol' ? 0.75 : 0.5, Math.max(0, share - fair));
    load += over; known++;
    rows.push({k:s.k, n:s.n, pct: Math.round(share * 100), over: Math.round(over * 100)});
  });
  rows.sort((a,b)=>b.over - a.over || b.pct - a.pct);
  return {load: load, known: known, portion: portion, fair: fair, rows: rows, matrix: matrix < 1,
          freeAssumed: (fr.assumed && f.free100 == null && f.sug100 != null && f.sug100 > 2)
                       || !!(f.freeAssumedAny && f.sug100 != null && f.sug100 > 2)};
}

// Alcohol is rarely printed as grams. Where a scanned label gives it, that is
// used; otherwise it is the calories nothing else explains - protein, carbs and
// fat account for their own, and what is left in a drink is the alcohol at
// 7 kcal a gram. Only ever applied to something that is actually a drink.
function alcoholPer100(f){
  if(!f) return null;
  const m = f.micros100 || {};
  if(m['off:alcohol_100g'] != null && isFinite(m['off:alcohol_100g'])) return m['off:alcohol_100g'];
  if(typeof isAlcohol !== 'function' || !isAlcohol(f)) return null;
  // Only ever worked out for something drunk by the glass. A solid food's
  // "missing" calories are fibre, polyols or rounding, not spirits.
  const unit = String(f.unitName || '').toLowerCase();
  const drinkish = f.basis === 'ml' || /pint|glass|can|bottle|shot|measure|ml/.test(unit) ||
                   (typeof LIQUID_FOODS !== 'undefined' && LIQUID_FOODS.has(String(f.name||'')));
  if(!drinkish) return null;
  const known = 4*(Number(f.p100)||0) + 4*(Number(f.c100)||0) + 9*(Number(f.f100)||0);
  const gap = (Number(f.kcal100)||0) - known;
  return gap > 7 ? gap/7 : null;
}

function qCurve(raw){
  return 100 / (1 + Math.exp(-(raw - Q_MID) / Q_SPREAD));
}

function healthV3(f){
  if(!f || !(f.kcal100 > 0)) return null;
  const nd = nutrientDensity(f);
  if(!nd) return null;
  const ll = limitLoad(f);
  // Judged on too little: say so rather than print a number built on two
  // figures off a packet.
  // What it takes to be scored at all: the calories, the protein, and at least
  // two of fibre, salt, saturated fat and sugar - in other words, a food label.
  // Everything else missing is handled by the prior above, and the score is
  // marked provisional until the real figures are there.
  const m0 = f.micros100 || {};
  const label = [m0.fiber, m0.sodium, f.sat100, f.sug100].filter(x=>x != null && isFinite(x)).length;
  if(f.p100 == null || label < 2) return null;
  const nutrients = nd.v + nd.fatBonus;
  const base = Math.round(qCurve(nutrients));
  const withLimits = Math.round(qCurve(nutrients - Q_LIM_W * ll.load));
  const novaR = novaFor(f);
  const nova = novaR.g;
  /* A plate carries a shared-out figure. A single food is its own group, so
     nothing changes for anything you log on its own. */
  const mult = (f.novaMultW != null && isFinite(f.novaMultW)) ? f.novaMultW
             : (NOVA_MULT[nova] === undefined ? 1 : NOVA_MULT[nova]);
  let total = Math.max(0, Math.min(100, Math.round(withLimits * mult)));
  // A food COACH knows almost nothing about cannot be called good. The less
  // there is on record, the closer the ceiling sits to the middle - because a
  // score built mostly on the stand-in figure is a guess, and a guess should
  // never beat a food whose real numbers are all there.
  const ceiling = 45 + Math.round(55 * Math.min(1, nd.cover / 0.6));
  if(total > ceiling) total = ceiling;
  const parts = [];
  if(withLimits !== base) parts.push({k:'limits', n:'Salt, saturated fat, free sugar', v: withLimits - base,
                                      rows: ll.rows, portion: ll.portion, matrix: ll.matrix,
                                      apportioned: !!ll.apportioned});
  if(total !== withLimits){
    const share = (f.novaMixShare != null) ? Math.round(f.novaMixShare * 100) : null;
    parts.push({k:'nova', n:'Processing', v: total - withLimits,
      nova: (f.novaMultW != null && f.novaTopGroup) ? f.novaTopGroup : nova,
      why: (f.novaMultW != null)
        ? ('counted in proportion' + (share != null
            ? ' · ' + (share > 0 ? share + '% of the calories here came from ultra-processed food'
                                 : 'nothing here is ultra-processed')
            : ''))
        : novaR.why,
      src: (f.novaMultW != null) ? 'plate' : novaR.src});
  }
  return {
    base: base, total: total, parts: parts, nutrients: nutrients, density: nd.v,
    fatBonus: nd.fatBonus, hits: nd.hits, cover: nd.cover, nCount: nd.n,
    limits: ll, nova: nova, novaSrc: novaR.src, novaWhy: novaR.why,
    provisional: nd.cover < 0.6, freeAssumed: ll.freeAssumed
  };
}

function foodScores(f){
  if(!f || !(f.kcal100 > 0)) return null;
  // Counted per item, with no published weight: a per-100 g score would be
  // made up, so there is none.
  if(f.perItem) return null;
  const pd = proteinDensity(f);
  const protein = Math.round(100 * scoreLerp(pd, 0, 12));
  const v2 = healthV2(f);
  const v3 = healthV3(f);
  const ns = v2 ? v2.ns : nutriScore(f);
  // v3 is the score. The Nutri-Score grade stays beside it, because a
  // published scale you can check beats one app's opinion of your dinner.
  // v3 needs nutrient figures. A packet that carries nothing but the label -
  // no vitamins, no minerals, and no plain food to match it to - still gets the
  // published Nutri-Score number, clearly marked as what it is.
  const health = v3 ? v3.total : null;
  const labelOnly = !!(v3 && v3.provisional);
  const grade  = v2 ? v2.grade : null;
  // Protein density can still only ADD, but the bonus is smaller than it was:
  // protein QUALITY now sits inside health, and counting the same thing twice
  // would be exactly the kind of quiet inflation this rewrite exists to remove.
  // Protein density is already one of the nutrients inside the score, so it is
  // no longer added a second time on top. Overall and health are the same
  // number, and the protein figure stands on its own beside them.
  const overall = health;
  return { health: health, grade: grade, protein: protein, overall: overall, labelOnly: labelOnly,
           pd: pd, ns: ns, missing: nsMissing(f), v2: v2, v3: v3,
           // The published base, kept separate so the panel can show what the
           // adjustments moved.
           base: v2 ? v2.base : null,
           range: health === null ? nutriRange(f) : null };
}

// The word follows the published grade, not a cutoff I picked. The bands are
// the exact 0-100 spans each grade maps onto, so "Poor" means D and nothing
// else. This is the check that stops white sugar reading "Fair".
const SCORE_BANDS = [
  [85,'good','Excellent'],   // A
  [70,'good','Good'],        // B
  [50,'fair','OK'],          // C
  [30,'cost','Poor'],        // D
  [0, 'cost','Bad']          // E
];
function scoreBand(v){
  for(const [lo, cls, word] of SCORE_BANDS) if(v >= lo) return {cls, word};
  return {cls:'cost', word:'Bad'};
}

const MICROS = [
  // Some targets really do move with your size, and they do it through your
  // calories: fibre, thiamin and niacin are all set per 1000 kcal eaten
  // (SACN 2015 for fibre, COMA/EFSA for the two B vitamins). The rest of the
  // vitamins and minerals are set by sex and age, and a taller or heavier
  // person needs no more of them - so COACH does not pretend otherwise.
  {k:'fiber',        n:'Fibre',        u:'g',  off:'fiber_100g',        rda:{m:30,f:25},
   perKcal:14, ul:null},
  // Limits, not targets. `read` because these two live on the entry itself
  // rather than in its micros, and `pctEnergy` because the guideline is a share
  // of what you eat, not a fixed number.
  // Two sugar rows on purpose. Total sugars is what a label prints and is
  // mostly informational; free sugars is the one with a ceiling worth caring
  // about, because that is the split WHO and SACN limit. An apple and a glass
  // of apple juice have almost the same total and completely different free.
  // The UK recommendation is 5% of energy, which is why this is tighter than
  // the 10% on the row below it.
  {k:'freesugar',    n:'Free sugars',  u:'g',  limit:true, pctEnergy:0.05, kcalPerG:4,
   read:e=>{
     if(!e || e.sugar == null) return undefined;
     const fr = freeSugarFraction(e.name);
     // Unknown means unknown. Guessing a zero here would quietly hand a
     // processed food the same standing as a banana.
     return fr === null ? undefined : e.sugar * fr;
   },
   rda:{m:30,f:30}, ul:null},
  {k:'sugar',        n:'Sugars',       u:'g',  limit:true, info:true, pctEnergy:0.10, kcalPerG:4,
   read:e=>(e && e.sugar != null) ? e.sugar : undefined, rda:{m:60,f:60}, ul:null},
  {k:'satfat',       n:'Saturated fat',u:'g',  limit:true, pctEnergy:0.10, kcalPerG:9,
   read:e=>(e && e.sat != null) ? e.sat : undefined, rda:{m:30,f:20}, ul:null},
  // Fats beyond the saturated share. Every one of these is published by Open
  // Food Facts, so a scanned product fills them in on the spot.
  {k:'transfat',     n:'Trans fat',    u:'g',  limit:true, off:'trans-fat_100g',
   rda:{m:5,f:5}, ul:null},
  {k:'monofat',      n:'Monounsaturated', u:'g', off:'monounsaturated-fat_100g',
   rda:{m:60,f:50}, ul:null},
  {k:'polyfat',      n:'Polyunsaturated', u:'g', off:'polyunsaturated-fat_100g',
   rda:{m:20,f:17}, ul:null},
  {k:'omega3',       n:'Omega-3',      u:'g',  off:'omega-3-fat_100g',
   rda:{m:1.6,f:1.1}, ul:null},
  // Linoleic acid. An adequate intake, not an RDA - there is no deficiency
  // study to set one against, so the figure is the median intake of healthy
  // adults (IOM). Same basis as the omega-3 line above.
  {k:'omega6',       n:'Omega-6',      u:'g',  off:'omega-6-fat_100g',
   rda:{m:17,f:12}, ul:null},
  {k:'cholesterol',  n:'Cholesterol',  u:'mg', off:'cholesterol_100g', mult:1000,
   limit:true, rda:{m:300,f:300}, ul:null},
  {k:'sodium',       n:'Sodium',       u:'mg', off:'sodium_100g', mult:1000,
   limit:true, rda:{m:2300,f:2300}, ul:2300, ulLabel:'CDRR'},
  {k:'potassium',    n:'Potassium',    u:'mg', off:'potassium_100g',    mult:1000, rda:{m:3400,f:2600}, ul:null},
  {k:'calcium',      n:'Calcium',      u:'mg', off:'calcium_100g',      mult:1000, rda:{m:1000,f:1000}, ul:2500},
  {k:'iron',         n:'Iron',         u:'mg', off:'iron_100g',         mult:1000, rda:{m:8,f:18},      ul:45},
  {k:'magnesium',    n:'Magnesium',    u:'mg', off:'magnesium_100g',    mult:1000, rda:{m:400,f:310},   ul:null},
  {k:'zinc',         n:'Zinc',         u:'mg', off:'zinc_100g',         mult:1000, rda:{m:11,f:8},      ul:40},
  {k:'phosphorus',   n:'Phosphorus',   u:'mg', off:'phosphorus_100g',   mult:1000, rda:{m:700,f:700},   ul:4000},
  {k:'selenium',     n:'Selenium',     u:'ug', off:'selenium_100g',     mult:1000000, rda:{m:55,f:55},  ul:400},
  {k:'copper',       n:'Copper',       u:'mg', off:'copper_100g',       mult:1000, rda:{m:0.9,f:0.9},   ul:10},
  {k:'manganese',    n:'Manganese',    u:'mg', off:'manganese_100g',    mult:1000, rda:{m:2.3,f:1.8},   ul:11},
  {k:'iodine',       n:'Iodine',       u:'ug', off:'iodine_100g',       mult:1000000, rda:{m:150,f:150}, ul:1100},
  {k:'chromium',     n:'Chromium',     u:'ug', off:'chromium_100g',     mult:1000000, rda:{m:35,f:25},   ul:null},
  {k:'molybdenum',   n:'Molybdenum',   u:'ug', off:'molybdenum_100g',   mult:1000000, rda:{m:45,f:45},   ul:2000},
  {k:'vitamin-a',    n:'Vitamin A',    u:'ug', off:'vitamin-a_100g',    mult:1000000, rda:{m:900,f:700}, ul:3000},
  {k:'vitamin-c',    n:'Vitamin C',    u:'mg', off:'vitamin-c_100g',    mult:1000, rda:{m:90,f:75},     ul:2000},
  {k:'vitamin-d',    n:'Vitamin D',    u:'ug', off:'vitamin-d_100g',    mult:1000000, rda:{m:15,f:15},  ul:100},
  {k:'vitamin-e',    n:'Vitamin E',    u:'mg', off:'vitamin-e_100g',    mult:1000, rda:{m:15,f:15},     ul:1000},
  {k:'vitamin-k',    n:'Vitamin K',    u:'ug', off:'vitamin-k_100g',    mult:1000000, rda:{m:120,f:90}, ul:null},
  {k:'vitamin-b1',   n:'Thiamin (B1)', u:'mg', off:'vitamin-b1_100g',   mult:1000, rda:{m:1.2,f:1.1},   perKcal:0.4, ul:null},
  {k:'vitamin-b2',   n:'Riboflavin (B2)',u:'mg',off:'vitamin-b2_100g',  mult:1000, rda:{m:1.3,f:1.1},   ul:null},
  {k:'vitamin-pp',   n:'Niacin (B3)',  u:'mg', off:'vitamin-pp_100g',   mult:1000, rda:{m:16,f:14},
   perKcal:6.6, ul:null},  // UL 35 mg is for supplements, not food
  {k:'vitamin-b5',   n:'Pantothenic acid (B5)', u:'mg', off:'pantothenic-acid_100g', mult:1000,
   rda:{m:5,f:5}, ul:null},
  {k:'vitamin-b6',   n:'Vitamin B6',   u:'mg', off:'vitamin-b6_100g',   mult:1000, rda:{m:1.3,f:1.3},   ul:100},
  {k:'vitamin-b7',   n:'Biotin (B7)',  u:'ug', off:'biotin_100g',       mult:1000000, rda:{m:30,f:30},  ul:null},
  {k:'vitamin-b9',   n:'Folate (B9)',  u:'ug', off:'vitamin-b9_100g',   mult:1000000, rda:{m:400,f:400},ul:null},  // UL 1000 ug is for folic acid, not food folate
  {k:'vitamin-b12',  n:'Vitamin B12',  u:'ug', off:'vitamin-b12_100g',  mult:1000000, rda:{m:2.4,f:2.4},ul:null},
  // Not a vitamin by the strict definition, but it is grouped with the B
  // complex everywhere it is measured and it is the one most often short in a
  // normal diet. Eggs and liver carry most of it.
  {k:'choline',      n:'Choline',      u:'mg', off:'choline_100g',      mult:1000, rda:{m:550,f:425}, ul:3500},
  // SACN's 450 mg a day of long-chain omega-3, which is roughly two portions
  // of oily fish a week spread out.
  {k:'epadha',       n:'EPA + DHA',    u:'mg', mult:1000, rda:{m:450,f:450}, ul:null},
  // WHO's requirement is per kilo of bodyweight: 39 mg of leucine, 30 of
  // lysine, 15 of methionine and cysteine together. COACH scales them to you.
  /* v87: no UK or Australian table lists individual amino acids, so these
     three were never measured on any day - which left Muscle and movement
     permanently stuck at five of eight nutrients and greyed out. They are
     worked out from the protein you actually ate instead, at the average
     share of protein each one makes up across a mixed diet. Estimates, and
     every row that shows one says so: a day of bread and rice runs lower on
     lysine than these figures suggest, a day of meat, fish, eggs and dairy
     runs a little higher. */
  {k:'leucine',      n:'Leucine',      u:'g',  rda:{m:3.1,f:3.1}, perKg:0.039, ul:null,
   fromProtein:0.080, estimated:true,
   read:e=>(e && e.protein != null) ? (Number(e.protein)||0) * 0.080 : undefined},
  {k:'lysine',       n:'Lysine',       u:'g',  rda:{m:2.4,f:2.4}, perKg:0.030, ul:null,
   fromProtein:0.065, estimated:true,
   read:e=>(e && e.protein != null) ? (Number(e.protein)||0) * 0.065 : undefined},
  {k:'methionine',   n:'Methionine',   u:'g',  rda:{m:1.2,f:1.2}, perKg:0.015, ul:null,
   fromProtein:0.022, estimated:true,
   read:e=>(e && e.protein != null) ? (Number(e.protein)||0) * 0.022 : undefined}
];


// Every nutrient that could be shown: the defined rows, plus anything measured
// on a label today that has no row of its own.
// What a training day changes, and by how much.
const TRAIN_BUMP = {sodium: 1.20, potassium: 1.10, magnesium: 1.10};
function microTargetsFor(entries, forDate){
  const p = loadProfile();
  let training = false;
  try{
    training = isTrainingDay(forDate || (typeof currentDate !== 'undefined' ? currentDate : new Date()));
  }catch(e){ training = false; }
  const bodyKg = Number(p.weight) || 0;
  // Polyunsaturated fat actually eaten, which is what sets the vitamin E target.
  let pufa = 0;
  (entries || []).forEach(e=>{
    const v = e && e.micros ? e.micros.polyfat : null;
    if(v != null && isFinite(v)) pufa += v;
  });
  // The limits move with the calorie target, and on a cycling week that target
  // is different on a training day - and different again on a day whose target
  // was frozen weeks ago. Judge each day against the target it actually had.
  let dayT = targets;
  try{
    if(forDate) dayT = snapFor(forDate);
    else if(typeof targetsFor === 'function' && typeof currentDate !== 'undefined') dayT = targetsFor(currentDate);
  }catch(e){ dayT = targets; }
  const kcalFor = (dayT && dayT.kcal > 0) ? dayT.kcal : (targets ? targets.kcal : 0);
  const sex = (p.sex==='female') ? 'f' : 'm';
  const extras = [];
  if(entries && entries.length){
    const seen = {};
    entries.forEach(e=>{
      const m = e.micros || {};
      for(const k in m){
        if(k.indexOf('off:') !== 0 || seen[k] || m[k] == null) continue;
        const d = offMicroDef(k);
        if(d){ seen[k] = 1; extras.push(d); }
      }
    });
  }
  return MICROS.map(m=>{
    let target = m.rda[sex];
    const base = target;
    // A limit set as a share of energy moves with the calorie target, so it
    // stays right on a cut and on a build without being edited.
    if(m.pctEnergy && kcalFor > 0){
      target = Math.round(kcalFor * m.pctEnergy / m.kcalPerG);
    }
    // Per 1000 kcal, never below the flat figure for your sex. A 2,650 kcal
    // day needs more fibre and more niacin than a 1,800 kcal one.
    if(m.perKcal && kcalFor > 0){
      const byEnergy = m.perKcal * kcalFor / 1000;
      target = Math.max(target, Math.round(byEnergy * 10) / 10);
    }
    // Vitamin E only has a job because of polyunsaturated fat - it is what
    // stops it oxidising - so the requirement is usually written as 0.4 mg per
    // gram of PUFA eaten (EFSA, and the old UK safe intake). Eat more nuts,
    // seeds and oily fish and the target follows.
    // Set per kilo of bodyweight, like protein itself.
    if(m.perKg && bodyKg > 0) target = Math.round(m.perKg * bodyKg * 100) / 100;
    if(m.k === 'vitamin-e' && pufa > 0) target = Math.max(target, Math.round(0.4 * pufa * 10) / 10);
    // A gym session costs sweat, not vitamins. Sodium is the big one (0.5-1.5 g
    // per litre of sweat), with potassium and magnesium behind it. Nothing else
    // moves, because nothing else has evidence behind it for one session.
    if(training && TRAIN_BUMP[m.k]) target = Math.round(target * TRAIN_BUMP[m.k]);
    return { ...m, target: target, trainBumped: training && !!TRAIN_BUMP[m.k],
             pufaSet: m.k === 'vitamin-e' && pufa > 0 && target > base };
  }).concat(extras);
}

// How much of this nutrient one entry contributed. Most live in `micros`; the
// two limits read straight off the entry. undefined means "no figure", which is
// not the same as zero and is counted separately everywhere.
function microValue(m, e){
  if(m.read) return m.read(e);
  return (e && e.micros) ? e.micros[m.k] : undefined;
}

// Tapping the button and swiping the whole way must do exactly the same thing,
// so both go through here rather than each having their own copy.
function deleteEntryAt(i){
  const es = loadEntries(currentDate);
  if(!(i >= 0 && i < es.length)) return;
  const item = es[i];
  es.splice(i, 1);
  saveEntries(currentDate, es);
  sfx('del');
  // Everything needed to put it back exactly where it was.
  const rec = binPush({ kind:'entry', date: ymd(currentDate), index: i,
                        meal: item.meal || 'Snack', item: item });
  showUndo(rec, fmt0(item.kcal||0) + ' kcal');
  renderBin();
  openSwipe = null;
  renderDay(); renderStreak();
  if(currentView !== 'day') renderWeek();
}

// Which family a nutrient belongs to, for the full view. Fibre is neither a
// mineral nor a vitamin, so it gets its own line rather than being filed wrongly.
// Grouped the way a nutrition label is laid out, which is the order the figures
// are read in when you are holding the packet.
const GROUP_FATS = ['satfat','transfat','monofat','polyfat','omega3','omega6','cholesterol','epadha'];
// The amino acids get their own block: they are protein, not minerals.
const GROUP_AMINO = ['leucine','lysine','methionine'];
const GROUP_CARB = ['sugar','freesugar','fiber'];
const OFF_GROUP = {
  'off:omega-9-fat_100g':'Fats',
  'off:starch_100g':'Carbohydrate', 'off:polyols_100g':'Carbohydrate'
};
// Nutrients in the vitamin block whose key does not begin with 'vitamin-'.
const GROUP_VITS = ['choline'];
function microGroup(k){
  if(GROUP_AMINO.indexOf(k) >= 0) return 'Protein quality';
  if(GROUP_FATS.indexOf(k) >= 0) return 'Fats';
  if(GROUP_VITS.indexOf(k) >= 0) return 'Vitamins';
  if(GROUP_CARB.indexOf(k) >= 0) return 'Carbohydrate';
  if(k.indexOf('off:') === 0) return OFF_GROUP[k] || 'Other measured';
  return k.indexOf('vitamin-') === 0 ? 'Vitamins' : 'Minerals';
}
const MICRO_GROUPS = ['Fats','Carbohydrate','Protein quality','Minerals','Vitamins','Other measured'];

// Expanded sections persist for the session but are deliberately not saved —
// the useful default every morning is the short view.
let microOpen = {range:false, none:false};

function microState(m, entries){
  if(m.unranged){
    const tot = entries.reduce((s,e)=>{ const v = microValue(m,e); return s + (v || 0); }, 0);
    const any = entries.some(e=>microValue(m,e) !== undefined);
    const d = v => v < 10 ? Math.round(v*10)/10 : fmt0(v);
    return {m:m, total:tot, anyData:any, cls: any ? 'flat' : 'none',
            disp:d(tot), tdisp:'', pct:0};
  }
  const total = entries.reduce((s,e)=>{ const v = microValue(m,e); return s + (v || 0); }, 0);
  const anyData = entries.some(e=>microValue(m,e) !== undefined);
  let cls = 'none';
  if(anyData){
    // Shown with its number and its reference figure, but never coloured as a
    // fault. Total sugars is the case this exists for: six pieces of fruit put
    // a day at 125 g against a 75 g reference, which read as "over the line"
    // for eating fruit. The ceiling that means something sits on free sugars,
    // and that one is still a limit.
    if(m.info) cls = 'flat';
    // A limit is only ever fine or exceeded. Reading "low" on sugar would be
    // telling you to eat more of it.
    else if(m.limit) cls = (total > m.target) ? 'high' : 'ok';
    else if(m.ul && total > m.ul) cls = 'high';
    else if(total / m.target < 0.7) cls = 'low';
    else cls = 'ok';
  }
  // One decimal under 10 for every unit. Whole micrograms turned 1.6 ug of
  // B12 into "2 of 2" and coloured it short.
  const dp = v => (v<10 ? (Math.round(v*10)/10).toString() : fmt0(v));
  return {m, total, anyData, cls,
          disp: dp(total), tdisp: dp(m.target),
          pct: m.target > 0 ? total / m.target : 0};
}

// One bar. The target tick sits at 70% of the width so that going over reads as
// going over, rather than as a bar that happens to be full.
function microBar(s){
  const m = s.m;
  if(!s.anyData){
    const noSrc = (typeof isSourceless === 'function') && isSourceless(m.k);
    return '<button class="nrow none" data-bdmicro="'+esc(m.k)+'"><div class="nhead">'+
      '<span class="nname">'+esc(m.n)+'<i>&rsaquo;</i></span><span class="nval">'+
      (noSrc ? 'no source yet' : 'not measured')+'</span></div>'+
      '<div class="track none"></div></button>';
  }
  // No reference to measure against, so no bar - just the figure, which is the
  // whole of what is known.
  if(m.unranged){
    return '<button class="nrow" data-bdmicro="'+esc(m.k)+'"><div class="nhead">'+
      '<span class="nname">'+esc(m.n)+'<i>&rsaquo;</i></span>'+
      '<span class="nval">'+s.disp+' '+esc(m.u==='ug'?'\u00b5g':m.u)+'</span></div></button>';
  }
  const TICK = 70;
  const w = Math.max(2, Math.min(100, s.pct * TICK));
  // The tick marks where the target sits on the bar. The special case exists
  // for a nutrient with a SEPARATE upper limit above its target - old sodium
  // was 1500 adequate, 2300 maximum - so the two lines are distinguishable.
  // A limit nutrient has no such gap: the target IS the limit, and computing
  // target/limit there just pushed the marker off the end of its own bar.
  const tickPos = (!m.limit && m.ul && m.ul > 0 && s.cls === 'high')
    ? Math.max(8, Math.min(92, (m.target / m.ul) * 100))
    : TICK;
  return '<button class="nrow" data-bdmicro="'+esc(m.k)+'"><div class="nhead">'+
    '<span class="nname">'+esc(m.n)+'<i>&rsaquo;</i></span>'+
    '<span class="nval">'+s.disp+' / '+s.tdisp+' '+esc(m.u==='ug'?'\u00b5g':m.u)+
      (m.limit ? ' max' : '')+'</span></div>'+
    '<div class="track"><div class="fill '+s.cls+'" style="width:'+w+'%"></div>'+
    '<div class="tick" style="left:'+tickPos+'%"></div></div></button>';
}


