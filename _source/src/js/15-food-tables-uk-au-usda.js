/* ======================= National food composition tables =====================
   Two government reference datasets, shipped inside the app. No key, no
   request, no signal needed, and the right data for food bought in either
   country:

     UK - McCance and Widdowson's Composition of Foods Integrated Dataset 2021
     AU - Australian Food Composition Database, Release 3 (FSANZ)

   Both are laboratory measurements of foods, not labels copied off packets.
   Neither is complete: CoFID carries no chromium, molybdenum or choline;
   AFCD carries no vitamin K or choline. Where one is blank the next source
   fills it, and a blank stays a blank rather than becoming a zero.
=========================================================================== */
/* ============================================================
   USDA FoodData Central: SR Legacy (ingredients, laboratory-grade) and FNDDS
   (dishes as people actually eat them). 13,109 foods, public domain, embedded
   whole so they work with no key, no signal and no setting to find.

   Same pipe-separated shape as the UK and Australian tables, with four columns
   those two do not have: the three amino acids COACH has been ESTIMATING from
   protein since the muscle panel was found to be short, and EPA + DHA. That is
   why this table carries its own key list rather than sharing NF_KEYS.

   It is deliberately NOT wired into the fill chain that tops up built-in
   foods. American flour is fortified with folic acid and iron by law and
   British flour is not, so letting these rows fill a British loaf would invent
   nutrients that are not in the bread he ate - the same trap the Australian
   table was already fenced off from.
   ============================================================ */
const USDA_KEYS = ["protein", "fat", "carbs", "kcal", "sugar", "satfat", "transfat", "monofat", "polyfat", "omega3", "omega6", "cholesterol", "fiber", "sodium", "potassium", "calcium", "magnesium", "phosphorus", "iron", "copper", "zinc", "manganese", "selenium", "iodine", "vitamin-a", "vitamin-d", "vitamin-e", "vitamin-k", "vitamin-b1", "vitamin-b2", "vitamin-pp", "vitamin-b6", "vitamin-b12", "vitamin-b9", "vitamin-b5", "vitamin-b7", "vitamin-c", "chromium", "molybdenum", "choline", "epadha", "leucine", "lysine", "methionine"];
const USDA_BLOB = coachData("USDA_BLOB");

const NF_TABLES = [
  {k:'UK', n:'UK', full:'the UK government food tables', blob:()=>UK_BLOB,
   fill:()=>UK_FILL, keys:NF_KEYS.concat(['epadha'])},
  {k:'AU', n:'AU', full:'the Australian food composition database', blob:()=>AU_BLOB, fill:()=>AU_FILL},
  // Its own key list, and no fill map - see the note above the data.
  {k:'US', n:'USDA', full:'USDA FoodData Central', blob:()=>USDA_BLOB,
   fill:()=>({}), keys:USDA_KEYS}
];

const nfRows = {};
/* v117: a table can be read a slice at a time (nfStep, used while the app is
   idle) or all at once (nfAll, when something needs it right now). Both run
   the same line reader and nfAll simply finishes whatever is left, so the
   result is identical either way - the difference is only that the idle path
   never holds up a tap. */
const nfPart = {};
function nfStep(tag, budgetMs){
  if(nfRows[tag]) return true;
  let st = nfPart[tag];
  if(!st){
    const t = NF_TABLES.filter(x=>x.k === tag)[0];
    if(!t){ nfRows[tag] = []; return true; }
    st = nfPart[tag] = {lines: t.blob().split('\n'), i: 0, out: [], keys: t.keys || NF_KEYS};
  }
  const end = budgetMs == null ? Infinity : performance.now() + budgetMs;
  const L = st.lines;
  while(st.i < L.length){
    st.out.push(nfParseLine(tag, st.keys, L[st.i++]));
    if((st.i & 255) === 0 && performance.now() > end) return false;
  }
  nfRows[tag] = st.out;
  delete nfPart[tag];
  return true;
}
function nfAll(tag){
  if(nfRows[tag]) return nfRows[tag];
  nfStep(tag, null);
  return nfRows[tag] || [];
}
function nfParseLine(tag, keys, line){
    const p = line.split('|');
    const micros = {};
    let kcal = 0, prot = null, carb = null, fat = null, sug = null, sat = null;
    for(let i = 0; i < keys.length; i++){
      const raw = p[i + 1];
      if(raw === '' || raw === undefined) continue;
      const v = Number(raw);
      if(isNaN(v)) continue;
      const k = keys[i];
      if(k === 'kcal') kcal = v;
      else if(k === 'protein') prot = v;
      else if(k === 'carbs') carb = v;
      else if(k === 'fat') fat = v;
      else if(k === 'sugar') sug = v;
      else if(k === 'satfat') sat = v;
      else micros[k] = v;
    }
    /* Two columns past the nutrients, where a table supplies them: something
       you can COUNT ("1 slice", "1 fillet") and how much one helping weighs.
       The second is the more useful of the two - it is what the amount box
       opens on, so a shepherd's pie starts at a plateful rather than at a
       flat 100 g and leaves you doing arithmetic. */
    const unit = p[keys.length + 1] || '';
    const uGrams = Number(p[keys.length + 2]) || 0;
    const row = {name: p[0], src:'nf', table: tag, kcal100: Math.round(kcal),
            p100: prot, c100: carb, f100: fat, sug100: sug, sat100: sat,
            micros100: micros, basis:'g'};
    if(unit && uGrams > 0){ row.unitName = unit; row.unitGrams = uGrams; }
    if(uGrams > 0) row.startAmount = uGrams;
    // Kept off the list of ordinary fields so it never travels into a food
    // that is copied from this row.
    Object.defineProperty(row, 'low', {value: String(p[0]).toLowerCase(), enumerable: false});
    return row;
}

// Naming the entry a built-in food was matched to is what makes the match
// checkable. A wrong match is invisible otherwise.
function nfMatchFor(name){
  for(const t of NF_TABLES){
    const i = t.fill()[name];
    if(i === undefined) continue;
    const r = nfAll(t.k)[i];
    if(r) return {table: t.k, full: t.full, name: r.name, micros: r.micros100};
  }
  return null;
}
// Everything both tables can say about this food, in order, so a nutrient the
// UK table lacks can still be filled from the Australian one.
// Australia fortifies bread by law: iodised salt since 2009 and folic acid in
// bread flour. The UK does neither in the same way, so an Australian bread's
// iodine and folate describe a different loaf. Letting them fill a British
// food gave rye bread 58 ug of iodine and naan 55 - numbers that would then
// have been recommended as an iodine source. For bread and flour products,
// those two come from the UK table or not at all.
const AU_FORTIFIED_ONLY = ['iodine', 'vitamin-b9'];
const BREADLIKE = /\b(bread|breads|loaf|roll|rolls|bagel|bagels|bun|buns|toast|wrap|wraps|pitta|pita|naan|chapati|roti|tortilla|crumpet|crumpets|muffin|muffins|croissant|brioche|scone|scones|flour|crispbread|crackers?|pizza|pasta|noodles?|cereal|biscuits?)\b/i;
function nfFillChain(name){
  const out = [];
  const breadlike = BREADLIKE.test(String(name || ''));
  for(const t of NF_TABLES){
    const i = t.fill()[name];
    if(i === undefined) continue;
    const r = nfAll(t.k)[i];
    if(!r) continue;
    let micros = r.micros100;
    if(t.k === 'AU' && breadlike){
      micros = Object.assign({}, micros);
      AU_FORTIFIED_ONLY.forEach(k=>{ delete micros[k]; });
    }
    out.push({table: t.k, micros: micros, sat100: r.sat100, sug100: r.sug100});
  }
  return out;
}

// These tables write "Chicken, breast, grilled, meat and skin". Typing
// "chicken breast" has to find it, so every word must appear somewhere in the
// name, in any order.
function nfSearch(q, limit){
  const want = String(q || '').toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length > 1);
  if(!want.length) return [];
  const out = [];
  NF_TABLES.forEach(t=>{
    const rows = nfAll(t.k);
    for(let i = 0; i < rows.length; i++){
      const low = rows[i].low || rows[i].name.toLowerCase();
      let all = true;
      for(let j = 0; j < want.length; j++){ if(low.indexOf(want[j]) < 0){ all = false; break; } }
      if(all) out.push(rows[i]);
    }
  });
  // Shortest name first: it is the plainest version of what was asked for, and
  // the longer ones are usually one specific preparation of it.
  out.sort((a,b)=>a.name.length - b.name.length);
  return out.slice(0, limit || 14);
}

/* ---- filling the blanks on foods the tables don't name ----
   A scanned packet in the UK prints about eight numbers: energy, fat,
   saturates, carbs, sugars, fibre (sometimes), protein and salt. No vitamins,
   no minerals. So a pint of Tesco semi-skimmed scored as if it had nothing in
   it, while the built-in "Semi-skimmed milk" - the same liquid - carried 28
   nutrients. This finds the plain food a product actually is and borrows its
   figures for the BLANKS ONLY. Anything the packet prints still wins.

   Two checks, and a match has to pass both:
   1. The name. Every word that names the plain food ("milk", "semi",
      "skimmed") has to be in the product's name. Words that only describe
      how it was cooked or sold don't have to be.
   2. The numbers. Calories within 20% and protein, carbs and fat each within
      30% (or a couple of grams). "Chocolate milk" fails this against milk, so
      it never borrows milk's figures by accident.                            */
const GF_STOP = new Set(('a an and the of with in on or for from to by style type british scottish english '+
  'welsh irish uk organic finest essential essentials value basics everyday original classic natural premium '+
  'luxury selected select deluxe taste difference best tesco asda sainsbury sainsburys morrisons waitrose aldi '+
  'lidl coop co op m s marks spencer iceland ocado pack packet bottle bottles tin jar pot pots multipack '+
  'fresh average pasteurised pasteurized homogenised homogenized retail purchased ready made homemade '+
  'home prepared standard regular ltr litre litres pint pints pt ml g kg x each approx per serving '+
  'recipe variety mixed brand own label farm dairy free range cage large medium small jumbo filtered '+
  'barista family size sharing big mini').split(' '));
// Describe the food rather than name it. Matched if present, never required.
const GF_SOFT = new Set(('raw cooked boiled grilled fried roasted baked steamed stewed poached microwaved '+
  'canned drained dried frozen whole flesh only skin meat weighed edible portion unsalted salted '+
  'water brine oil sunflower rapeseed olive uht chilled plain lean fat free reduced light lite '+
  'sliced diced chopped mashed skinless boneless bone fillet fillets loin cut trimmed untrimmed '+
  'ns fortified unfortified unsweetened sweetened with without added '+
  // Filing words. The tables file halloumi as "Cheese, Halloumi" and
  // cornflakes as "Breakfast cereal, cornflakes"; nobody says either.
  'cheese breakfast cereal fruit vegetable dip').split(' '));
// The word the name is ABOUT: the last naming word before a comma or an
// "in"/"with". "Chocolate digestive" is a digestive, not chocolate, and must
// not borrow plain chocolate's figures just because both say "chocolate".
function gfHead(name){
  let s = String(name || '').toLowerCase().replace(/\([^)]*\)/g, ' ').split(',')[0];
  s = s.split(/\b(?:in|with|and)\b/)[0];
  const t = gfTokens(s).filter(w=>!GF_SOFT.has(w) && !/%/.test(w));
  return t.length ? t[t.length - 1] : null;
}
const GF_COOKED = /\b(cooked|boiled|grilled|fried|roasted|baked|steamed|stewed|poached|microwaved|toasted)\b/i;
function gfTokens(name){
  let s = String(name || '').toLowerCase()
    .replace(/\([^)]*\)/g, ' ')                  // the brand we append in brackets
    .replace(/yoghurt/g, 'yogurt').replace(/soya/g, 'soy')
    .replace(/semi[\s-]*skimmed/g, 'semi skimmed')
    .replace(/\d+(\.\d+)?\s*(g|kg|ml|l|cl|oz|pt|pints?|litres?|ltr|x)\b/g, ' ')
    .replace(/&/g, ' and ').replace(/[^a-z0-9%]+/g, ' ');
  const out = [];
  s.split(' ').forEach(w=>{
    if(w.length < 2 || /^\d+$/.test(w) || GF_STOP.has(w)) return;
    if(w.length > 3 && /[^s]s$/.test(w)) w = w.slice(0, -1);
    if(out.indexOf(w) < 0) out.push(w);
  });
  return out;
}
const gfIndex = {};
function gfPool(tag){
  if(gfIndex[tag]) return gfIndex[tag];
  let rows;
  if(tag === 'COACH'){
    rows = (typeof LOCAL_FOODS === 'undefined' ? [] : LOCAL_FOODS).map(f=>({
      name: f[0], kcal100: f[1], p100: f[2], c100: f[3], f100: f[4], local: true}));
  } else rows = nfAll(tag);
  gfIndex[tag] = rows.map((r, i)=>{
    const t = gfTokens(r.name);
    return {i: i, r: r, hard: t.filter(w=>!GF_SOFT.has(w) && !/%/.test(w)), all: t};
  }).filter(x=>x.hard.length && !(x.r.local && LOCAL_FOODS[x.i] && isPerItemRow(LOCAL_FOODS[x.i])));
  return gfIndex[tag];
}
function gfMacrosAgree(a, b){
  const near = (x, y, abs, rel)=>{
    x = Number(x) || 0; y = Number(y) || 0;
    return Math.abs(x - y) <= Math.max(abs, rel * Math.max(x, y));
  };
  if(!(a.kcal100 > 0) || !(b.kcal100 > 0)) return false;
  // Sugar, where both say. This is what stops chocolate milk passing for milk.
  if(a.sug100 != null && b.sug100 != null && !near(a.sug100, b.sug100, 3, 0.35)) return false;
  // Fruit and veg get more room on calories and carbs. American tables count
  // fibre inside carbohydrate and British ones don't, so the same leek reads
  // 61 kcal in one and 23 in the other. Protein and fat still have to agree.
  if(a.kcal100 < 100 && b.kcal100 < 100 && (Number(a.f100)||0) < 3){
    return near(a.kcal100, b.kcal100, 40, 0.2) && near(a.p100, b.p100, 1.5, 0.35) &&
           near(a.c100, b.c100, 8, 0.3) && near(a.f100, b.f100, 1, 0.5);
  }
  return near(a.kcal100, b.kcal100, 15, 0.2) && near(a.p100, b.p100, 2, 0.3) &&
         near(a.c100, b.c100, 2.5, 0.3) && near(a.f100, b.f100, 2.5, 0.35);
}
function gfDistance(a, b){
  const rel = (x, y)=>{ x = Number(x)||0; y = Number(y)||0;
    return Math.abs(x - y) / Math.max(1, x, y); };
  return rel(a.kcal100, b.kcal100) + (rel(a.p100, b.p100) + rel(a.c100, b.c100) + rel(a.f100, b.f100)) / 3;
}
// The best plain food in ONE table for this product, or null.
function gfBestIn(tag, food, skipName){
  const P = gfTokens(food.name);
  if(!P.length) return null;
  const head = gfHead(food.name);
  const cookedP = GF_COOKED.test(food.name || '');
  let best = null;
  gfPool(tag).forEach(c=>{
    if(skipName && c.r.name === skipName) return;
    if(head && c.all.indexOf(head) < 0) return;   // must be the same kind of thing
    let hardHit = 0;
    c.hard.forEach(w=>{ if(P.indexOf(w) >= 0) hardHit++; });
    if(hardHit < c.hard.length) return;           // every naming word, no exceptions
    let hit = 0;
    c.all.forEach(w=>{ if(P.indexOf(w) >= 0) hit++; });
    const covP = hit / P.length;
    if(covP < 0.34) return;                       // "milk" alone can't claim "milk chocolate buttons"
    if(!gfMacrosAgree(food, c.r)) return;
    // A soft drink must not borrow a beer's nutrients just because both say
    // "beer", and vice versa.
    if((typeof isAlcohol === 'function') && isAlcohol(food) !== isAlcohol(c.r)) return;
    // Raw against raw, cooked against cooked, where the name says which.
    const cookedC = GF_COOKED.test(c.r.name);
    const state = (cookedP === cookedC) ? 0.08 : 0;
    const score = covP + 0.05 * c.hard.length + state - 0.4 * gfDistance(food, c.r);
    if(!best || score > best.score) best = {tag: tag, i: c.i, row: c.r, score: score};
  });
  return best;
}
const gfCache = {};
function gfMatch(food){
  if(!food || !food.name || !(food.kcal100 > 0)) return null;
  const key = food.name + '|' + Math.round(food.kcal100) + '|' + Math.round(food.p100||0) + '|' +
              Math.round(food.c100||0) + '|' + Math.round(food.f100||0);
  if(key in gfCache) return gfCache[key];
  let pick = null;
  // COACH's own foods first: they already carry the UK, Australian and USDA
  // figures merged, so one match brings the most with it.
  const own = gfBestIn('COACH', food, food.src === 'local' ? food.name : null);
  if(own){
    const lf = LOCAL_FOODS.filter(f=>f[0] === own.row.name)[0];
    const x = lf ? localToFood(lf, true) : null;
    if(x) pick = {name: x.name, table: 'COACH', full: 'COACH’s own foods',
                  micros: x.micros100 || {}, sat100: x.sat100, sug100: x.sug100};
  }
  if(!pick){
    for(const t of NF_TABLES){
      const b = gfBestIn(t.k, food);
      if(b){ pick = {name: b.row.name, table: t.k, full: t.full, micros: b.row.micros100 || {},
                     sat100: b.row.sat100, sug100: b.row.sug100}; break; }
    }
  }
  gfCache[key] = pick;
  return pick;
}
// The food with its blanks filled. Never changes a number that is there.
function gapFillFood(food){
  if(!food || food.src === 'local' || food.src === 'combined' || food.perItem) return food;
  let m;
  try{ m = gfMatch(food); }catch(e){ m = null; }
  if(!m) return food;
  const out = Object.assign({}, food);
  const micros = Object.assign({}, food.micros100 || {});
  const filled = [];
  for(const k in m.micros){
    if(k.indexOf('off:') === 0) continue;
    if(micros[k] == null && m.micros[k] != null){ micros[k] = m.micros[k]; filled.push(k); }
  }
  // Fortification is the one thing a plain food can't stand in for: a
  // breakfast cereal's iron is added at the factory, and an unfortified oat
  // drink has no calcium to speak of. Blanks stay blank for those two.
  if(/\b(cereal|flakes|granola|muesli|(oat|almond|soy|rice|coconut|cashew|pea|hemp) (drink|milk)|plant based|dairy free)\b/i.test(food.name||'')){
    ['calcium','iron','vitamin-d','vitamin-b12','vitamin-b2','iodine','vitamin-b9'].forEach(k=>{
      const i = filled.indexOf(k);
      if(i >= 0){ filled.splice(i, 1); delete micros[k]; }
    });
  }
  if(out.sat100 == null && m.sat100 != null){ out.sat100 = m.sat100; filled.push('sat'); }
  if(out.sug100 == null && m.sug100 != null){ out.sug100 = m.sug100; filled.push('sugar'); }
  if(!filled.length) return food;
  out.micros100 = micros;
  out.gapFill = {name: m.name, table: m.table, full: m.full, keys: filled};
  return out;
}
// The same food with the borrowed figures taken back out. Used wherever a food
// is SAVED - to your foods or into the log - so storage only ever holds what a
// packet or a person actually said. The blanks are filled again on the way out.
function gfOwn(food){
  if(!food || !food.gapFill) return food;
  const out = Object.assign({}, food);
  const micros = Object.assign({}, food.micros100 || {});
  // A food rebuilt from a logged entry used to arrive here with no list at
  // all, and the throw that followed made the Add button do nothing (v109).
  (Array.isArray(food.gapFill.keys) ? food.gapFill.keys : []).forEach(k=>{
    if(k === 'sat') out.sat100 = null;
    else if(k === 'sugar') out.sug100 = null;
    else delete micros[k];
  });
  out.micros100 = micros;
  delete out.gapFill;
  return out;
}

/* ---- the log, filled on the way out ----
   Every day's entries are completed when they are READ, never when they are
   written. What is stored stays exactly what was logged, so nothing already
   saved changes and an improvement here reaches old days too. Each borrowed
   figure is recorded in e._fill with its value, and saveEntries takes back out
   only a value that is still the borrowed one - so a figure you type over it
   is yours and is kept.                                                     */
var fillSrcCache = {};
function entryFillSource(e){
  const g = Number(e.grams) || 0;
  const key = String(e.name || '') + '|' + (e.code || '') + '|' +
    [e.kcal, e.protein, e.carbs, e.fat].map(x=>Math.round((Number(x)||0) * 100 / g)).join('/');
  if(key in fillSrcCache) return fillSrcCache[key];
  const r = entryFillSourceRaw(e);
  fillSrcCache[key] = r;
  return r;
}
function entryFillSourceRaw(e){
  const name = String(e.name || '');
  const lf0 = localRowByName(name);
  const lf = (lf0 && isPerItemRow(lf0) === !!e.perItem) ? lf0 : null;
  if(lf0 && !lf) return null;
  if(lf){
    const f = localToFood(lf);
    const tags = filledKeysFor(name);
    return {food: f, tagFor: k => tags[k] || 'COACH'};
  }
  const saved = (e.code && typeof myFoodByCode === 'function') ? myFoodByCode(e.code) : null;
  if(saved){
    const f = gapFillFood(myFoodRecordToFood(saved));
    if(f.gapFill) return {food: f, tagFor: () => f.gapFill.table, from: f.gapFill.name};
  }
  const per = per100From(e, true);
  if(!per) return null;
  per.src = 'entry';
  const g = gapFillFood(per);
  return g.gapFill ? {food: g, tagFor: () => g.gapFill.table, from: g.gapFill.name} : null;
}
function hydrateEntry(e){
  if(!e || typeof e !== 'object' || e._fill) return e;
  // Logged under v115/v116 from one of the 143 rows it misread as per item.
  // The calories and weight on the entry were right all along; only the flag
  // was wrong, so it is dropped on reading. Nothing stored is rewritten here.
  if(e.perItem && Number(e.grams) > 0){
    const r = localRowByName(String(e.name || ''));
    if(r && !isPerItemRow(r) && rowAlias(r)){ e = Object.assign({}, e); delete e.perItem; }
  }
  const grams = Number(e.grams);
  if(!(grams > 0)) return e;
  const f = grams / 100;
  const m = Object.assign({}, e.micros || {});
  const fill = {};
  // Old scans stored a few nutrients under their Open Food Facts name before
  // COACH had a row for them. Those are real label figures: read them across.
  MICROS.forEach(spec=>{
    if(!spec.off) return;
    const v = m['off:' + spec.off];
    if(m[spec.k] == null && v != null && isFinite(v)){ m[spec.k] = v; fill[spec.k] = {t: null, v: v}; }
  });
  let src = null;
  try{ src = entryFillSource(e); }catch(err){ src = null; }
  const out = Object.assign({}, e);
  if(src && src.food){
    const s100 = src.food.micros100 || {};
    Object.keys(s100).forEach(k=>{
      if(k.indexOf('off:') === 0) return;
      const v = s100[k];
      if(m[k] == null && v != null && isFinite(v)){ m[k] = v * f; fill[k] = {t: src.tagFor(k), v: m[k]}; }
    });
    if(out.sugar == null && src.food.sug100 != null && isFinite(src.food.sug100)){
      out.sugar = Math.round(src.food.sug100 * f * 10) / 10;
      // `had` remembers whether the key was written as an explicit null, so
      // putting the entry back leaves it exactly as it was found.
      fill.sugar = {t: src.tagFor('sugar'), v: out.sugar, had: ('sugar' in e)};
    }
    if(out.sat == null && src.food.sat100 != null && isFinite(src.food.sat100)){
      out.sat = Math.round(src.food.sat100 * f * 10) / 10;
      fill.sat = {t: src.tagFor('sat'), v: out.sat, had: ('sat' in e)};
    }
  }
  if(!Object.keys(fill).length) return e;
  out.micros = m;
  out._fill = fill;
  out._hadMicros = ('micros' in e);
  if(src && src.from) out._fillFrom = src.from;
  return out;
}
function dehydrateEntry(e){
  if(!e || typeof e !== 'object' || !e._fill) return e;
  const out = Object.assign({}, e);
  const m = Object.assign({}, out.micros || {});
  Object.keys(e._fill).forEach(k=>{
    const x = e._fill[k];
    // Deleted, not set to null: an entry has to come back out exactly as it
    // went in, or every read-then-save quietly rewrites the day.
    if(k === 'sugar'){ if(out.sugar === x.v){ if(x.had) out.sugar = null; else delete out.sugar; } }
    else if(k === 'sat'){ if(out.sat === x.v){ if(x.had) out.sat = null; else delete out.sat; } }
    else if(m[k] === x.v) delete m[k];
  });
  // An empty micros object is noise, not data: if nothing of the entry's own
  // is left, the key goes entirely, so a read-then-save is byte for byte what
  // was already there.
  if(Object.keys(m).length || e._hadMicros) out.micros = m;
  else delete out.micros;
  delete out._fill; delete out._fillFrom; delete out._hadMicros;
  return out;
}

// Foods the tables don't name. An alias says which table row (or which of
// COACH's own foods) a built-in food simply IS; a recipe says what a dish is
// made of, by weight. Both only ever fill blanks. Every one was checked: the
// alias or the recipe has to land within 25% of the food's own calories.
const ALIAS_FILL = {"Beef mince 5% fat, raw":"UK:Beef, mince, raw, extra lean","Rump steak, cooked":"UK:Beef, rump steak, barbecued, lean and fat","Braising steak, cooked":"UK:Beef, braising steak, slow cooked, lean and fat","Pork loin, cooked":"UK:Pork, loin chops, grilled, lean","Pepperoni":"AU:Salami, pepperoni","Tinned salmon":"UK:Salmon, pink, canned in brine, drained","Duck breast, cooked":"UK:Duck, roasted, meat only","Ground beef, raw":"UK:Beef, mince, raw","Minced lamb, raw":"Lamb mince, raw","Minced pork, raw":"Pork mince, raw","KFC Original Recipe Chicken, drumstick":"UK:Chicken portions, battered, deep fried, takeaway","KFC Original Recipe Chicken, thigh":"UK:Chicken portions, battered, deep fried, takeaway","Oat milk":"AU:Oat beverage, fluid, added calcium & vitamins","Almond milk, unsweetened":"AU:Almond beverage, no added sugar, added Ca","Soy milk, unsweetened":"UK:Milk, soya, non-dairy alternative to milk, unsweetened, fortified","Greek yogurt, 0% fat":"UK:Cheese, Quark","Skyr":"UK:Cheese, Quark","Protein yogurt":"AU:Yoghurt, flavoured, low fat (0.2%), intense sweetened, increased protein","Feta":"UK:Cheese, Feta","Parmesan":"UK:Cheese, Parmesan, fresh","Soured cream":"AU:Cream, sour, light (~18% fat)","Kefir":"AU:Yoghurt, natural, regular fat (~3%)","Babybel":"UK:Cheese, Edam","Cheese string":"AU:Cheese, mozzarella","Processed cheese slice":"UK:Cheese, processed, plain","Heavy cream":"Double cream","Rolled oats, dry":"UK:Porridge oats, unfortified","Oatmeal, dry":"UK:Porridge oats, unfortified","Oat flour":"UK:Porridge oats, unfortified","Weetabix":"UK:Breakfast cereal, wheat biscuits, Weetabix type, fortified","Shreddies":"UK:Breakfast cereal, malted wheat, fortified","Granola":"AU:Muesli, granola, toasted, added nuts & seeds, unfortified","Pot Noodle, standard pot":"AU:Noodle, wheat, instant, flavoured, dry, uncooked","Pot Noodle King, large pot":"AU:Noodle, wheat, instant, flavoured, dry, uncooked","Bagel, plain":"AU:Bagel, from white flour, commercial","Tortilla wrap":"UK:Tortilla, wheat, soft","Brioche":"AU:Bread, brioche","Ciabatta":"UK:Bread, ciabatta","Baguette":"UK:Bread, white, French stick","Croutons":"UK:Bread, white, sliced, fried in rapeseed oil","Panko breadcrumbs":"AU:Breadcrumbs, white","Cornflour":"AU:Flour, cornflour, from maize starch","Whole wheat bread":"Wholemeal bread","Rice cake":"AU:Biscuit, savoury, rice cake, from brown rice, plain","Jacket potato":"UK:Potatoes, old, baked, flesh and skin","Chips, oven":"UK:Potato chips, oven ready, no batter, baked","Chips, fried":"UK:Potato chips, fine cut, from fast food outlets","French fries":"AU:Potato, fries, fast food outlet, deep fried, monounsaturated oil, salted","Sweet potato fries":"UK:Sweet potato, wedges, flesh and skin, baked in rapeseed oil","Hash brown":"UK:Potato cakes, fried in rapeseed oil","Edamame":"UK:Beans, edamame, frozen, boiled in unsalted water","Edamame, salted":"UK:Beans, edamame, frozen, boiled in unsalted water","Quorn mince":"UK:Quorn, pieces, as purchased","Kale":"UK:Curly kale, raw","Bell pepper":"UK:Pepper, capsicum, red, raw","Roasted red peppers":"UK:Pepper, capsicum, red, boiled in unsalted water","Leek":"UK:Leeks, raw","Watermelon":"UK:Melon, watermelon, flesh only","Lemon":"AU:Lemon, peeled, raw","Prunes":"AU:Prune (dried plum)","Passion fruit":"AU:Passionfruit, raw","Figs, fresh":"UK:Figs, whole green fruit, raw","Chestnuts":"AU:Nut, chestnut, roasted, unsalted","Sun-dried tomatoes":"AU:Tomato, sundried","Artichoke hearts":"AU:Artichoke heart, canned in brine, drained","Pickles":"UK:Gherkins, pickled, drained","Seaweed, dried":"AU:Seaweed, nori, dried","Cilantro":"UK:Coriander leaves, fresh","Arugula":"UK:Rocket, raw","Scallion":"Spring onion","Ginger, fresh":"UK:Ginger, fresh","Turmeric":"AU:Turmeric, dried, ground","Cinnamon":"AU:Cinnamon, dried, ground","Garlic powder":"UK:Garlic powder","Chilli flakes":"UK:Pepper, cayenne, ground","Passata":"AU:Tomato, puree, commercial","Chopped tomatoes, tinned":"UK:Tomatoes, canned, whole contents","Almond butter":"Almonds","Cashew butter":"Cashews","Almond flour":"AU:Nut, almond meal","Chia seeds":"AU:Seed, chia, dried","Flaxseed":"AU:Seed, linseed or flaxseed","Coconut flakes":"Coconut, desiccated","Extra virgin olive oil":"Olive oil","Nutella":"UK:Chocolate spread","Marmite":"UK:Yeast extract","Vegemite":"AU:Spread, yeast, vegemite","Bovril":"UK:Yeast extract","Ketchup":"UK:Tomato ketchup","Hot sauce":"AU:Sauce, tabasco, commercial","Salsa":"AU:Sauce, salsa, tomato-based, commercial","Katsu curry sauce":"UK:Sauce, curry, sweet, UK type, homemade","Apple cider vinegar":"AU:Vinegar (except balsamic vinegar)","Fish sauce":"AU:Sauce, fish, commercial","Gravy, made up":"AU:Gravy, prepared from dry powder with water","Dark chocolate 70%":"UK:Chocolate, plain","Chocolate digestive":"UK:Biscuits, digestive, half coated in chocolate","Rich tea biscuit":"UK:Biscuits, semi-sweet","Oreo":"UK:Biscuits, sandwich, cream","Doughnut, glazed":"UK:Doughnuts, ring, iced","Greggs Glazed Ring Doughnut":"UK:Doughnuts, ring, iced","Muffin, blueberry":"AU:Muffin, cake-style, berry, commercial","Brownie":"UK:Brownies, chocolate, homemade","Cookie":"UK:Biscuits, cookies, chocolate chip, standard","Crisps, ready salted":"Potato chips","Walkers Ready Salted Crisps":"UK:Potato crisps, fried in sunflower oil","Walkers Cheese and Onion Crisps":"AU:Potato crisps or chips, flavoured (other than salt & vinegar)","McCoy's Flame Grilled Steak":"AU:Potato crisps or chips, flavoured (other than salt & vinegar)","Pringles Original":"AU:Potato crisps or chips, reformed, salted","Hula Hoops Original":"AU:Potato crisps or chips, reformed, salted","Doritos Chilli Heatwave":"UK:Tortilla chips fried in sunflower oil","Monster Munch Pickled Onion":"AU:Snack, grain based, extruded, flavoured","Quavers Cheese":"AU:Extruded snack, cheese flavoured","Wotsits Cheese":"AU:Extruded snack, cheese flavoured","Granola bar":"Cereal bar","Nature Valley Crunchy Bar 2pc":"AU:Bar, snack, oat based, baked","Belvita Breakfast Biscuits":"UK:Biscuits, digestive, with oats, plain","Cadbury Dairy Milk 45g":"UK:Chocolate, milk","Galaxy Smooth Milk 42g":"UK:Chocolate, milk","Milkybar":"UK:Chocolate, white","Sticky toffee pudding":"UK:Pudding, sponge, with jam or treacle, homemade","Bread and butter pudding":"UK:Pudding, bread and butter, homemade","Coca-Cola, 330ml can":"UK:Cola","Soda, regular":"UK:Cola","Diet Coke":"UK:Cola, diet","Diet Coke, 330ml can":"UK:Cola, diet","Coke Zero, 330ml can":"UK:Cola, diet","Pepsi Max, 330ml can":"UK:Cola, diet","Energy drink":"AU:Soft drink, energy drink, V","Red Bull, 250ml":"AU:Soft drink, energy drink, Red Bull","Monster Energy, 500ml":"AU:Soft drink, energy drink, V","Lucozade Energy Original, 380ml":"UK:Lucozade","Ribena, 250ml":"UK:Blackcurrant juice drink/squash, diluted","Hot chocolate":"UK:Drinking chocolate powder, made up with semi-skimmed milk","Prosecco":"UK:Wine, white, sparkling","Vodka":"UK:Spirits, 40% volume","Gin":"UK:Spirits, 40% volume","Whisky":"UK:Spirits, 40% volume","Guinness Draught, pint":"UK:Beer, bitter, strong (>5% ABV)","Stella Artois, pint":"AU:Beer, high alcohol (5% v/v & above)","Carling, pint":"AU:Beer, full strength (alcohol 4-4.9% v/v)","Heineken, 330ml bottle":"AU:Beer, high alcohol (5% v/v & above)","Corona, 330ml bottle":"AU:Beer, full strength (alcohol 4-4.9% v/v)","Peroni, 330ml bottle":"AU:Beer, high alcohol (5% v/v & above)","BrewDog Punk IPA, 330ml":"AU:Beer, high alcohol (5% v/v & above)","Strongbow Original, pint":"UK:Cider, sweet","Kopparberg Mixed Fruit, 500ml":"AU:Cider, apple (alcohol ~4-5% v/v)","Chicken and mushroom pie":"UK:Pie, chicken, individual, baked","Cauliflower cheese":"UK:Cauliflower cheese, made with whole milk, homemade","Mac and cheese":"UK:Macaroni cheese, homemade","Beef stir fry":"UK:Beef, stir-fried with green peppers, homemade","Chicken tikka masala":"UK:Curry, chicken tikka masala, retail, reheated","Butter chicken":"UK:Curry, chicken tikka masala, retail, reheated","Lamb rogan josh":"UK:Curry, lamb rogan josh, homemade","Minestrone":"UK:Soup, minestrone, canned","Chicken noodle soup":"AU:Soup, chicken & noodle, cup of soup, prepared from instant dry mix with water","Hot dog":"UK:Frankfurter with bun","Cheeseburger":"UK:Burger, cheeseburger, takeaway","Burger King Whopper":"UK:Burger, Whopper, takeaway","McDonald's Hamburger":"UK:Burger, hamburger, takeaway","McDonald's Cheeseburger":"UK:Burger, cheeseburger, takeaway","McDonald's Chicken McNuggets 6pc":"AU:Chicken, nugget, purchased from independent takeaway & fast food chain, fried, undefined oil","McDonald's Chicken McNuggets 9pc":"AU:Chicken, nugget, purchased from independent takeaway & fast food chain, fried, undefined oil","McDonald's Chicken Selects 3pc":"UK:Chicken pieces, coated, takeaway","KFC Popcorn Chicken, regular":"UK:Chicken pieces, coated, takeaway","McDonald's Fries, small":"AU:Potato, fries, fast food outlet, deep fried, monounsaturated oil, salted","McDonald's Fries, medium":"AU:Potato, fries, fast food outlet, deep fried, monounsaturated oil, salted","McDonald's Fries, large":"AU:Potato, fries, fast food outlet, deep fried, monounsaturated oil, salted","Burger King Fries, medium":"AU:Potato, fries, fast food outlet, deep fried, monounsaturated oil, salted","KFC Fries, regular":"AU:Potato, chips, regular, fast food outlet, deep fried, monounsaturated oil, salted","Nando's Peri-Peri Chips, regular":"AU:Potato, chips, regular, fast food outlet, deep fried, monounsaturated oil, salted","Five Guys Fries, little":"AU:Potato, chips, regular, independent takeaway outlet, deep fried, blended oil, salted","KFC Gravy, regular":"AU:Gravy, prepared from dry powder with water","Nando's Coleslaw":"Coleslaw","McDonald's Apple Pie":"UK:Pie, fruit, individual, retail","Doner kebab":"UK:Doner kebab in pitta bread with salad","Chicken kebab with salad":"UK:Shish kebab in pitta bread with salad","Pepperoni pizza, whole":"UK:Pizza, meat topped, retail and takeaway","Margherita pizza, whole":"UK:Pizza, cheese and tomato, retail","Domino's Margherita Pizza, medium slice":"UK:Pizza, cheese and tomato, retail","Turkey mince, raw":"AU:Turkey, hindquarter, lean flesh, raw","Turkey rasher":"UK:Turkey slices","KFC Hot Wings 5pc":"UK:Chicken pieces, coated, takeaway","Chicken wings, six":"UK:Chicken wings, marinated, meat and skin, barbecued, weighed with bone","Nando's Chicken, quarter":"UK:Chicken, breast, grilled, meat and skin","Nando's Chicken, half":"UK:Chicken, breast, grilled, meat and skin","Nando's Garlic Bread":"Garlic bread","Domino's Garlic Pizza Bread":"Garlic bread","Greggs Sausage Roll":"Sausage roll","Greggs Steak Bake":"UK:Pie, beef, puff or shortcrust pastry, individual, retail","Greggs Chicken Bake":"UK:Pie, chicken, individual, baked","Greggs Cheese and Onion Bake":"UK:Cheese and onion rolls, pastry, retail","Greggs Yum Yum":"UK:Doughnuts, ring, iced","Pret Egg Mayo Sandwich":"UK:Sandwich, white bread, egg mayonnaise","Pret Posh Cheddar and Pickle Sandwich":"UK:Sandwich, white bread, cheddar cheese and pickle","Tuna mayo sandwich":"UK:Sandwich, white bread, tuna mayonnaise","BLT sandwich":"UK:Sandwich, white bread, bacon, lettuce and tomato","Chicken shawarma":"AU:Chicken, thigh, lean flesh, baked, no added fat","Chickpea curry":"UK:Curry, chick pea, UK type, homemade","Boiled eggs, two":"Boiled egg","Twix":"UK:Biscuits, fully coated with chocolate","KitKat 4 Finger":"AU:Bar, wafer & cream layers, chocolate-coated","Haribo Starmix":"UK:Fruit gums/jellies","Mr Kipling Angel Slice":"AU:Cake or cupcake, sponge, plain, commercial, iced, unfilled","Kimchi":"Sauerkraut","Whey isolate powder":"AU:Protein powder, whey based, protein >70%, unfortified","Cornflakes":"UK:Breakfast cereal, cornflakes, fortified","Swede, mashed":"UK:Swede, flesh only, boiled in unsalted water","Beer, lager":"UK:Lager, premium","Beer, ale":"UK:Beer, bitter, best, premium","Omelette, plain":"UK:Omelette, plain, homemade","Rotisserie chicken":"UK:Chicken, meat, average, roasted","Beef mince 20% fat, raw":"UK:Beef, mince, raw","Ham, sliced":"UK:Ham","Tuna, canned in water":"UK:Tuna, canned in brine, drained","Cod fillet, raw":"UK:Cod, flesh only, raw","King prawns, raw":"AU:Prawn, flesh, raw (green)","Natural yogurt":"AU:Yoghurt, natural, regular fat (~3%)","Mozzarella":"UK:Cheese, Mozzarella, fresh","Halloumi":"UK:Cheese, Halloumi","Brie":"AU:Cheese, brie","Aubergine":"UK:Aubergine, raw","Rocket":"UK:Rocket, raw","Red onion":"UK:Onions, raw","Green beans":"AU:Bean, green, fresh, raw","Orange":"UK:Oranges, flesh only","Blueberries":"UK:Blueberries","Raspberries":"UK:Raspberries, raw","Blackberries":"UK:Blackberries, raw","Melon, cantaloupe":"UK:Melon, flesh only, average","Kiwi":"UK:Kiwi fruit, flesh only, raw","Pear":"UK:Pears, average, raw, flesh only","Dates, medjool":"UK:Dates, dried, flesh and skin","Light mayonnaise":"UK:Mayonnaise, reduced fat","Coconut milk, canned":"AU:Coconut, milk, canned, regular fat","Croissant, chocolate":"UK:Croissants","Burger, beef, patty only":"UK:Burger, beef, fried in rapeseed oil, homemade","Coca-Cola":"UK:Cola","Smoothie, fruit":"UK:Smoothies","Nando's Butterfly Chicken Breast":"UK:Chicken, breast, grilled, meat and skin","Innocent Smoothie, 250ml":"UK:Smoothies","Tropicana Orange Juice, 300ml":"UK:Orange juice, chilled","Chicken breast, tinned":"AU:Chicken, breast, lean flesh, raw","Smoked mackerel fillet":"UK:Mackerel, flesh only, smoked","Crab meat":"AU:Crab, flesh, purchased steamed or boiled","Bean sprouts":"AU:Sprout, bean, fresh, raw","Swede":"UK:Swede, flesh only, raw","Fennel":"AU:Fennel, fresh, raw","Apricot, fresh":"AU:Apricot, raw","Quark":"UK:Cheese, Quark","Mascarpone":"UK:Cheese, Mascarpone","Ricotta":"UK:Cheese, Ricotta","Emmental":"UK:Cheese, Emmental","Gouda":"UK:Cheese, Gouda","Red Leicester":"UK:Cheese, Red Leicester","Wensleydale":"UK:Cheese, Wensleydale","Stuffing mix, dry":"UK:Stuffing mix, dried","Vinegar, white":"UK:Vinegar","Evaporated milk":"UK:Milk, evaporated, whole","Porridge with berries":"UK:Porridge, made with water","Ground turkey, raw":"UK:Turkey, whole, raw","Confectioners sugar":"AU:Sugar, raw","Pineapple":"UK:Pineapple, flesh only, raw","Pomegranate":"AU:Pomegranate, peeled, raw"};
const RECIPE_FILL = {"Greek yogurt, 2% fat":[["UK:Cheese, Quark",50],["UK:Yogurt, whole milk, plain",50]],"Greek yogurt, 5% fat":[["UK:Cheese, Quark",50],["UK:Yogurt, Greek style, plain",50]],"Creme fraiche":[["UK:Creme fraiche, full fat",70],["UK:Creme fraiche, half fat",30]],"Half and half":[["Whole milk",50],["Single cream",50]],"Coconut cream":[["Coconut, desiccated",50],["Water",50]],"Couscous, cooked":[["UK:Couscous, plain, raw",30],["Water",70]],"Bulgur wheat, cooked":[["UK:Wheat, bulgur, raw",25],["Water",75]],"Seitan":[["AU:Gluten, from wheat (vital wheat gluten)",38],["Water",58],["Soy sauce",4]],"Sourdough starter discard":[["Plain flour",45],["Water",55]],"Focaccia":[["UK:Bread, white, French stick",90],["Olive oil",8],["Salt",1]],"Tuna steak, cooked":[["UK:Tuna, flesh only, baked",95],["Olive oil",5]],"Stuffing":[["AU:Breadcrumbs, white",35],["Onion",25],["Butter",5],["Water",35]],"Pilau rice":[["UK:Rice, white, basmati, easy cook, boiled in unsalted water",90],["Ghee",5],["Onion",5]],"Raita":[["UK:Yogurt, Greek style, plain",50],["Yoghurt, natural",30],["Cucumber",18],["AU:Mint, fresh, raw",2]],"Protein shake, ready to drink":[["Whey protein powder",8],["Skimmed milk",92]],"Protein shake with milk":[["Whey protein powder",25],["Semi-skimmed milk",300]],"Protein shake with water":[["Whey protein powder",30],["Water",270]],"Teriyaki sauce":[["AU:Sauce, soy, commercial",70],["Sugar, white",12],["Water",18]],"Sriracha":[["UK:Chilli sauce",75],["Sugar, white",15],["Garlic",5],["UK:Vinegar",5]],"Sweet chilli sauce":[["Sugar, white",55],["UK:Chilli sauce",30],["UK:Vinegar",15]],"Mango chutney":[["Mango",40],["Sugar, white",50],["UK:Vinegar",10]],"Ranch dressing":[["Mayonnaise",60],["AU:Cream, sour, regular fat",25],["Semi-skimmed milk",15]],"Caesar dressing":[["Mayonnaise",60],["UK:Cheese, Parmesan, fresh",10],["Lemon juice",10],["Olive oil",5],["Water",15]],"Vinaigrette":[["Olive oil",30],["UK:Vinegar",55],["Mustard",10],["Sugar, white",5]],"Tuna mayo":[["Tuna, canned in water",60],["UK:Mayonnaise, reduced fat",40]],"Egg mayo":[["Boiled egg",80],["Mayonnaise",20]],"Ham and cheese toasted sandwich":[["White bread",80],["UK:Ham",30],["Cheddar cheese",25],["Butter",5]],"Ham and cheese sandwich":[["White bread",80],["UK:Ham",30],["Cheddar cheese",15],["Lettuce",20],["Tomato",20]],"Sausage sandwich":[["White bread",80],["Sausage, pork, cooked",60],["UK:Tomato ketchup",10],["Butter",5]],"Egg and cress sandwich":[["White bread",80],["Boiled egg",60],["UK:Mayonnaise, reduced fat",12],["Watercress",5]],"Chicken mayo sandwich":[["White bread",80],["Chicken breast, cooked",50],["Mayonnaise",15],["Lettuce",10]],"Club sandwich":[["White bread",120],["Chicken breast, cooked",50],["Back bacon, grilled",20],["Tomato",20],["Lettuce",15],["Mayonnaise",15]],"Ploughmans sandwich":[["White bread",80],["Cheddar cheese",30],["UK:Pickle, sweet",15],["Lettuce",10],["Tomato",15],["Butter",5]],"Cheese and pickle sandwich":[["White bread",80],["Cheddar cheese",25],["UK:Pickle, sweet",20],["Lettuce",10],["Tomato",15]],"Cheese and onion sandwich":[["White bread",80],["Cheddar cheese",25],["Spring onion",10],["UK:Mayonnaise, reduced fat",10],["Lettuce",15]],"Peanut butter sandwich":[["White bread",80],["Peanut butter",18]],"Jam sandwich":[["White bread",80],["Jam",25],["Butter",3]],"Toast with butter":[["UK:Bread, white, toasted",60],["Butter",10]],"Toast with peanut butter":[["UK:Bread, white, toasted",60],["Peanut butter",30]],"Toast with jam":[["UK:Bread, white, toasted",60],["Jam",20],["Butter",5]],"Toast with avocado":[["UK:Bread, white, toasted",40],["Avocado",60]],"Avocado toast":[["UK:Bread, white, toasted",40],["Avocado",60]],"Scrambled eggs on toast":[["UK:Bread, white, toasted",40],["Scrambled eggs",120]],"Poached eggs on toast":[["UK:Bread, white, toasted",40],["Boiled egg",100]],"Fried egg on toast":[["UK:Bread, white, toasted",30],["Fried egg",70]],"Cheese on toast":[["UK:Bread, white, toasted",50],["Cheddar cheese",30]],"Beans on toast":[["UK:Bread, white, toasted",60],["Baked beans",150],["Butter",3]],"French toast":[["White bread",60],["Egg, whole",40],["Semi-skimmed milk",20],["Butter",8]],"Bagel with cream cheese":[["AU:Bagel, from white flour, commercial",85],["Cream cheese",30]],"Egg and bacon roll":[["UK:Bread rolls, white, soft",70],["Fried egg",50],["Back bacon, grilled",40]],"Sausage and egg roll":[["UK:Bread rolls, white, soft",70],["Sausage, pork, cooked",60],["Fried egg",50]],"Eggs Benedict":[["English muffin",60],["Boiled egg",100],["UK:Ham",30],["Butter",12],["Egg yolk",8]],"Avocado and poached egg on sourdough":[["UK:Bread, white, crusty bloomer, unsliced, fresh, large",50],["Avocado",50],["Boiled egg",60]],"Chip butty":[["White bread",80],["UK:Potato chips, fried in commercial oil, from takeaway fish and chip shops",150],["Butter",8]],"Hummus and pitta":[["Pitta bread",60],["AU:Dip, hummus (hommus), commercial",50]],"Cheese and crackers":[["Cheddar cheese",30],["UK:Cream crackers",40]],"Rice cakes with peanut butter":[["AU:Biscuit, savoury, rice cake, from brown rice, plain",20],["Peanut butter",15]],"Apple and peanut butter":[["Apple",150],["Peanut butter",35]],"Full English breakfast":[["Sausage, pork, cooked",100],["Back bacon, grilled",50],["Fried egg",60],["Baked beans",100],["Mushrooms",50],["Tomato",60],["Black pudding",30],["UK:Bread, white, sliced, fried in rapeseed oil",40]],"Pancakes with syrup":[["Pancakes",150],["Maple syrup",30]],"Porridge with banana and honey":[["UK:Porridge, made with milk and water",250],["Banana",60],["Honey",10]],"Greek yogurt with granola and berries":[["UK:Yogurt, Greek style, plain",100],["AU:Muesli, granola, toasted, added nuts & seeds, unfortified",25],["Strawberries",40],["Blackberries",40]],"Protein oats":[["UK:Porridge oats, unfortified",50],["Whey protein powder",25],["Semi-skimmed milk",150],["Water",100]],"Overnight oats":[["UK:Porridge oats, unfortified",50],["Semi-skimmed milk",120],["Yoghurt, natural",50]],"Smoothie bowl":[["Banana",100],["Strawberries",100],["Yoghurt, natural",50],["AU:Muesli, granola, toasted, added nuts & seeds, unfortified",20]],"Acai bowl":[["Banana",100],["Blackberries",100],["AU:Muesli, granola, toasted, added nuts & seeds, unfortified",30],["Honey",10]],"Yogurt and berries":[["UK:Yogurt, low fat, plain",150],["Strawberries",50],["Blackberries",30]],"Banana and peanut butter smoothie":[["Banana",120],["Peanut butter",20],["Semi-skimmed milk",250]],"Berry protein smoothie":[["Strawberries",80],["Blackberries",70],["Whey protein powder",25],["Semi-skimmed milk",200]],"Three egg omelette":[["Egg, whole",150],["Butter",5],["Semi-skimmed milk",15]],"Mushroom omelette":[["Egg, whole",150],["Mushrooms",80],["Butter",5]],"Cheese and ham omelette":[["Egg, whole",150],["UK:Ham",30],["Cheddar cheese",20],["Butter",5]],"Breakfast burrito":[["UK:Tortilla, wheat, soft",60],["Scrambled eggs",80],["Back bacon, grilled",30],["Cheddar cheese",15],["AU:Sauce, salsa, tomato-based, commercial",20]],"Chicken rice and broccoli":[["Chicken breast, cooked",120],["Basmati rice, cooked",150],["Broccoli",80]],"Chicken and sweet potato":[["Chicken breast, cooked",120],["Sweet potato, baked",150]],"Chicken and rice meal prep box":[["Chicken breast, cooked",150],["Basmati rice, cooked",150],["Broccoli",60]],"Steak and chips":[["Beef steak, sirloin, cooked",150],["UK:Potato chips, homemade, fried in rapeseed oil",150],["Peas, frozen",50]],"Sausage and mash":[["Sausage, pork, cooked",120],["Mashed potato",200],["AU:Gravy, prepared from dry powder with water",80],["Peas, frozen",50]],"Chicken and bacon salad":[["Chicken breast, cooked",80],["Back bacon, grilled",25],["Lettuce",60],["Tomato",40],["Cucumber",30],["Olive oil",8]],"Tuna pasta salad":[["Pasta, cooked",120],["Tuna, canned in water",60],["UK:Mayonnaise, reduced fat",20],["Sweetcorn, canned",30]],"Greek salad":[["Tomato",80],["Cucumber",70],["UK:Cheese, Feta",30],["UK:Olives, green, in brine, drained, flesh and skin",15],["Red onion",15],["Olive oil",8]],"Halloumi salad":[["UK:Cheese, Halloumi",60],["Lettuce",50],["Tomato",50],["Cucumber",40],["Red onion",10],["Olive oil",7]],"Chicken caesar salad":[["Chicken breast, cooked",80],["AU:Lettuce, cos, raw",80],["UK:Cheese, Parmesan, fresh",10],["UK:Bread, white, sliced, fried in rapeseed oil",10],["Mayonnaise",15]],"Chicken salad bowl":[["Chicken breast, cooked",100],["Lettuce",60],["Tomato",50],["Cucumber",40],["Sweetcorn, canned",30],["Olive oil",5]],"Chicken breast and salad":[["Chicken breast, cooked",150],["Lettuce",50],["Tomato",50],["Cucumber",50]],"Ham salad":[["UK:Ham",60],["Boiled egg",50],["Lettuce",50],["Tomato",50],["Cucumber",30],["Olive oil",5]],"Side salad":[["Lettuce",40],["Tomato",30],["Cucumber",20],["Red onion",10],["Olive oil",2]],"Cheese ploughmans":[["Cheddar cheese",50],["UK:Bread, white, crusty bloomer, unsliced, fresh, large",60],["UK:Pickle, sweet",30],["Apple",50],["Lettuce",30],["Tomato",40]],"Chicken wrap":[["UK:Tortilla, wheat, soft",60],["Chicken breast, cooked",70],["Lettuce",20],["Tomato",20],["UK:Mayonnaise, reduced fat",10]],"Chicken caesar wrap":[["UK:Tortilla, wheat, soft",60],["Chicken breast, cooked",70],["AU:Lettuce, cos, raw",25],["UK:Cheese, Parmesan, fresh",5],["Mayonnaise",12]],"Falafel wrap":[["UK:Tortilla, wheat, soft",60],["UK:Falafel, fried in rapeseed oil, homemade",70],["AU:Dip, hummus (hommus), commercial",20],["Lettuce",20],["Tomato",20]],"Chicken shawarma wrap":[["Pitta bread",70],["AU:Chicken, thigh, lean flesh, baked, no added fat",80],["Mayonnaise",10],["Lettuce",20],["Tomato",20],["Onion",10]],"Chicken burrito bowl":[["White rice, cooked",120],["Chicken breast, cooked",80],["Kidney beans, canned",50],["Sweetcorn, canned",30],["AU:Sauce, salsa, tomato-based, commercial",30],["Lettuce",20],["Cheddar cheese",10]],"Beef burrito":[["UK:Tortilla, wheat, soft",70],["AU:Beef, mince, regular fat, stir-fried, no added fat",60],["White rice, cooked",60],["Kidney beans, canned",40],["Cheddar cheese",15],["AU:Sauce, salsa, tomato-based, commercial",25],["AU:Cream, sour, regular fat",10]],"Quesadilla":[["UK:Tortilla, wheat, soft",80],["Cheddar cheese",30],["Chicken breast, cooked",30]],"Taco, beef":[["AU:Taco shell, from corn flour, plain",25],["AU:Beef, mince, regular fat, stir-fried, no added fat",35],["Cheddar cheese",10],["Lettuce",15],["Tomato",15],["AU:Sauce, salsa, tomato-based, commercial",10]],"Nachos with cheese":[["Tortilla chips",50],["Cheddar cheese",20],["AU:Sauce, salsa, tomato-based, commercial",30]],"Nachos with cheese and salsa":[["Tortilla chips",50],["Cheddar cheese",20],["AU:Sauce, salsa, tomato-based, commercial",50],["Guacamole",20],["AU:Cream, sour, regular fat",20]],"Jacket potato with beans and cheese":[["UK:Potatoes, old, baked, flesh and skin",200],["Baked beans",100],["Cheddar cheese",30]],"Jacket potato with tuna mayo":[["UK:Potatoes, old, baked, flesh and skin",200],["Tuna, canned in water",60],["Mayonnaise",15]],"Jacket potato with cheese":[["UK:Potatoes, old, baked, flesh and skin",200],["Cheddar cheese",30],["Butter",5]],"Chicken pasta bake":[["Pasta, cooked",150],["Chicken breast, cooked",70],["Tomato pasta sauce",100],["Cheddar cheese",20]],"Carbonara":[["Pasta, cooked",150],["UK:Sauce, pasta, carbonara type",80],["Bacon, grilled",15],["UK:Cheese, Parmesan, fresh",5]],"Pesto pasta":[["Pasta, cooked",180],["Pesto",25],["UK:Cheese, Parmesan, fresh",5]],"Roast dinner":[["UK:Beef, silverside, pot-roasted, lean and fat",100],["Roast potatoes",200],["Yorkshire pudding",40],["Carrot",50],["Peas, frozen",50],["AU:Gravy, prepared from dry powder with water",80]],"Chicken curry with rice":[["Chicken curry",200],["White rice, cooked",150]],"Tikka masala with rice":[["UK:Curry, chicken tikka masala, retail, reheated",200],["UK:Rice, pilau, plain, homemade",150]],"Katsu curry with rice":[["White rice, cooked",150],["UK:Chicken breast/steak, coated, baked",80],["UK:Sauce, curry, sweet, UK type, homemade",80],["Lettuce",15]],"Wagamama Chicken Katsu Curry":[["White rice, cooked",150],["UK:Chicken breast/steak, coated, baked",80],["UK:Sauce, curry, sweet, UK type, homemade",80],["Lettuce",15]],"Stir fry with chicken and noodles":[["Noodles, egg, cooked",150],["Chicken breast, cooked",80],["UK:Vegetables, stir-fried, takeaway",100],["Soy sauce",10]],"Sweet and sour chicken with rice":[["UK:Sweet and sour chicken, takeaway",200],["White rice, cooked",150]],"Tomato soup with bread":[["UK:Soup, cream of tomato, canned",300],["White bread",40],["Butter",5]],"Soup and roll":[["UK:Soup, vegetable, homemade",300],["UK:Bread rolls, white, soft",60],["Butter",5]],"Poke bowl":[["White rice, cooked",150],["Salmon fillet, raw",80],["UK:Beans, edamame, frozen, boiled in unsalted water",30],["Avocado",30],["Cucumber",30],["Soy sauce",10]],"Sushi roll":[["UK:Sushi, vegetable",60],["UK:Sushi, salmon nigiri",40]],"Sushi platter":[["UK:Sushi, salmon nigiri",40],["UK:Sushi, tuna nigiri",30],["UK:Sushi, vegetable",30]],"Salmon and vegetables":[["Salmon, cooked",130],["Broccoli",80],["Green beans",50],["Carrot",50]],"Salmon rice and avocado":[["Salmon, cooked",120],["Basmati rice, cooked",150],["Avocado",50]],"Cod and potatoes":[["Cod, cooked",150],["Potato, boiled",200],["Peas, frozen",50]],"Prawn stir fry":[["Prawns, cooked",100],["UK:Vegetables, stir-fried, takeaway",150],["Noodles, egg, cooked",50],["Soy sauce",10]],"Tofu stir fry":[["Tofu, firm",120],["UK:Vegetables, stir-fried, takeaway",150],["Soy sauce",10]],"Dal and rice":[["Dal",200],["White rice, cooked",150]],"Veggie burger and chips":[["UK:Beanburger, soya, fried in rapeseed oil",90],["UK:Bread rolls, white, soft",60],["UK:Potato chips, oven ready, no batter, baked",150]],"Buddha bowl":[["Quinoa, cooked",100],["Chickpeas, canned",60],["Sweet potato, baked",80],["Spinach",30],["Avocado",30],["Tahini",10]],"Falafel and salad box":[["UK:Falafel, fried in rapeseed oil, homemade",100],["AU:Dip, hummus (hommus), commercial",30],["Lettuce",50],["Tomato",50],["Cucumber",40]],"Pad thai":[["Rice noodles, cooked",150],["Prawns, cooked",40],["Egg, whole",25],["UK:Beansprouts, mung, stir-fried in rapeseed oil",30],["Peanuts",8],["Sunflower oil",5],["AU:Sauce, fish, commercial",5],["Sugar, white",5],["Spring onion",5]],"Gyoza":[["Plain flour",35],["Water",15],["Pork mince, raw",35],["Cabbage",15],["Sunflower oil",3]],"Fish and chips":[["UK:Cod, in batter, fried, takeaway",180],["UK:Potato chips, fried in commercial oil, from takeaway fish and chip shops",250]],"Chicken nuggets and chips":[["Chicken nuggets",100],["UK:Potato chips, oven ready, no batter, baked",150]],"Burger and chips":[["UK:Burger, hamburger, takeaway",150],["UK:Potato chips, oven ready, no batter, baked",150]],"Pie and mash":[["UK:Pie, beef, puff or shortcrust pastry, individual, retail",150],["Mashed potato",150],["AU:Gravy, prepared from dry powder with water",100]],"Steak bake and chips":[["UK:Pie, beef, puff or shortcrust pastry, individual, retail",150],["UK:Potato chips, oven ready, no batter, baked",150]],"Coleslaw and chips":[["Coleslaw",80],["UK:Potato chips, oven ready, no batter, baked",150]],"Loaded fries":[["UK:Potato chips, oven ready, no batter, baked",200],["Cheddar cheese",30],["Back bacon, grilled",20],["AU:Cream, sour, regular fat",20]],"Cheesy chips":[["UK:Potato chips, oven ready, no batter, baked",200],["Cheddar cheese",30]],"Corn on the cob with butter":[["Corn on the cob",150],["Butter",10]],"Halloumi fries":[["UK:Cheese, Halloumi",85],["Plain flour",5],["Sunflower oil",2]],"Nando's Halloumi Sticks":[["UK:Cheese, Halloumi",70],["AU:Breadcrumbs, white",18],["Sunflower oil",4]],"Onion rings, portion":[["Onion",50],["AU:Breadcrumbs, white",25],["Plain flour",10],["Sunflower oil",15]],"Onion rings":[["Onion",40],["AU:Breadcrumbs, white",35],["Plain flour",5],["Sunflower oil",20]],"Garlic bread with cheese":[["Garlic bread",85],["AU:Cheese, mozzarella",15]],"Pizza, pepperoni":[["UK:Pizza, cheese and tomato, retail",85],["AU:Salami, pepperoni",15]],"Domino's Pepperoni Pizza, medium slice":[["UK:Pizza, cheese and tomato, retail",88],["AU:Salami, pepperoni",12]],"Pizza Hut Pepperoni Pan Pizza, medium slice":[["UK:Pizza, cheese and tomato, retail",88],["AU:Salami, pepperoni",12]],"Chicken burger":[["UK:Bread rolls, white, soft",60],["UK:Chicken breast/steak, coated, baked",100],["Lettuce",15],["Mayonnaise",10]],"McDonald's Big Mac":[["UK:Bread rolls, white, soft",80],["UK:Burger, beef, 98-99% beef, grilled",90],["UK:Cheese, processed, plain",17],["UK:Dressing, thousand island",20],["Lettuce",20],["Onion",5],["UK:Gherkins, pickled, drained",8]],"McDonald's Quarter Pounder with Cheese":[["UK:Bread rolls, white, soft",60],["UK:Burger, beef, 98-99% beef, grilled",80],["UK:Cheese, processed, plain",34],["UK:Tomato ketchup",10],["Mustard",3],["Onion",10],["UK:Gherkins, pickled, drained",6]],"McDonald's Double Quarter Pounder":[["UK:Bread rolls, white, soft",60],["UK:Burger, beef, 98-99% beef, grilled",160],["UK:Cheese, processed, plain",34],["UK:Tomato ketchup",10],["Mustard",3],["Onion",10],["UK:Gherkins, pickled, drained",6]],"McDonald's Double Cheeseburger":[["UK:Bread rolls, white, soft",50],["UK:Burger, beef, 98-99% beef, grilled",60],["UK:Cheese, processed, plain",34],["UK:Tomato ketchup",10],["Mustard",3],["Onion",5],["UK:Gherkins, pickled, drained",5]],"McDonald's McChicken Sandwich":[["UK:Bread rolls, white, soft",60],["UK:Burger, chicken/turkey, coated, retail, grilled",70],["Mayonnaise",12],["Lettuce",20]],"McDonald's McSpicy":[["UK:Bread rolls, white, soft",60],["UK:Chicken breast/steak, coated, baked",100],["Mayonnaise",12],["Lettuce",20]],"McDonald's Big Tasty":[["UK:Bread rolls, white, soft",70],["UK:Burger, beef, 98-99% beef, grilled",110],["UK:Cheese, processed, plain",34],["UK:Dressing, thousand island",25],["Lettuce",20],["Tomato",20],["Onion",10]],"McDonald's Filet-O-Fish":[["UK:Bread rolls, white, soft",55],["Fish fingers, cooked",55],["UK:Cheese, processed, plain",9],["Tartare sauce",15]],"McDonald's Hash Brown":[["UK:Potato cakes, fried in rapeseed oil",70],["Sunflower oil",5]],"McDonald's Sausage and Egg McMuffin":[["English muffin",60],["Sausage, pork, cooked",45],["Boiled egg",50],["UK:Cheese, processed, plain",17]],"McDonald's Egg McMuffin":[["English muffin",60],["Boiled egg",50],["Back bacon, grilled",25],["UK:Cheese, processed, plain",17],["Butter",3]],"McDonald's Bacon Roll":[["UK:Bread rolls, white, soft",70],["Back bacon, grilled",50],["UK:Tomato ketchup",10]],"McDonald's McFlurry, Oreo":[["UK:Ice cream, dairy, vanilla, soft scoop",90],["UK:Biscuits, sandwich, cream",10]],"McDonald's Latte, medium":[["Semi-skimmed milk",65],["AU:Coffee, espresso, from ground coffee beans",35]],"Burger King Bacon Double Cheeseburger":[["UK:Bread rolls, white, soft",55],["UK:Burger, beef, 98-99% beef, grilled",70],["UK:Cheese, processed, plain",17],["Back bacon, grilled",10],["UK:Tomato ketchup",8],["Mustard",2],["UK:Gherkins, pickled, drained",5]],"Burger King Chicken Royale":[["UK:Bread rolls, white, soft",70],["UK:Burger, chicken/turkey, coated, retail, grilled",100],["Mayonnaise",15],["Lettuce",20]],"KFC Zinger Burger":[["UK:Bread rolls, white, soft",60],["UK:Chicken breast/steak, coated, baked",100],["Mayonnaise",10],["Lettuce",20]],"KFC Fillet Burger":[["UK:Bread rolls, white, soft",60],["UK:Chicken breast/steak, coated, baked",100],["Mayonnaise",10],["Lettuce",20]],"KFC Mini Fillet Burger":[["UK:Bread rolls, white, soft",45],["UK:Chicken breast/steak, coated, baked",50],["Mayonnaise",6],["Lettuce",10]],"Nando's Spicy Rice":[["UK:Rice, white, basmati, easy cook, boiled in unsalted water",80],["Peas, frozen",8],["UK:Pepper, capsicum, red, raw",6],["Onion",3],["Olive oil",3]],"Nando's Macho Peas":[["Peas, frozen",94],["Olive oil",4],["AU:Mint, fresh, raw",2]],"Greggs Sausage Bean and Cheese Melt":[["AU:Pastry, puff, vegetable oil, commercial, baked",45],["Sausage, pork, cooked",20],["Baked beans",20],["Cheddar cheese",15]],"Greggs Bacon Roll":[["UK:Bread rolls, white, soft",70],["Back bacon, grilled",45]],"Subway 6 inch Chicken Teriyaki":[["UK:Bread rolls, white, soft",75],["Chicken breast, cooked",70],["UK:Sauce, Chinese stir fry",15],["Lettuce",20],["Tomato",20],["Cucumber",15],["Onion",5]],"Subway 6 inch Italian BMT":[["UK:Bread rolls, white, soft",75],["Salami",15],["AU:Salami, pepperoni",10],["UK:Ham",15],["UK:Cheese, processed, plain",10],["Lettuce",20],["Tomato",20],["Cucumber",15],["Onion",5]],"Subway 6 inch Meatball Marinara":[["UK:Bread rolls, white, soft",75],["UK:Meatballs, pork and beef, in tomato sauce, homemade",100],["UK:Cheese, processed, plain",10]],"Subway 6 inch Turkey Breast":[["UK:Bread rolls, white, soft",75],["UK:Turkey slices",40],["Lettuce",20],["Tomato",20],["Cucumber",15],["Onion",5]],"Subway 6 inch Veggie Delite":[["UK:Bread rolls, white, soft",75],["Lettuce",20],["Tomato",20],["Cucumber",20],["Onion",5],["UK:Pepper, capsicum, red, raw",10]],"Subway 6 inch Steak and Cheese":[["UK:Bread rolls, white, soft",75],["AU:Beef, stir-fry strips, lean, dry-fried, no added fat",50],["UK:Cheese, processed, plain",10],["Onion",10],["UK:Pepper, capsicum, red, raw",10],["Lettuce",15],["Tomato",15]],"Subway 6 inch Tuna":[["UK:Bread rolls, white, soft",75],["Tuna, canned in water",40],["Mayonnaise",15],["UK:Cheese, processed, plain",10],["Lettuce",15],["Tomato",15],["Cucumber",10]],"Five Guys Hamburger":[["UK:Bread rolls, white, soft",70],["UK:Burger, beef, 98-99% beef, grilled",140],["UK:Tomato ketchup",10],["Mustard",3],["Lettuce",15],["Tomato",15],["Onion",10],["UK:Gherkins, pickled, drained",8],["Mayonnaise",10]],"Five Guys Cheeseburger":[["UK:Bread rolls, white, soft",70],["UK:Burger, beef, 98-99% beef, grilled",140],["UK:Cheese, processed, plain",34],["UK:Tomato ketchup",10],["Mustard",3],["Lettuce",15],["Tomato",15],["Onion",10],["UK:Gherkins, pickled, drained",8],["Mayonnaise",10]],"Five Guys Bacon Cheeseburger":[["UK:Bread rolls, white, soft",70],["UK:Burger, beef, 98-99% beef, grilled",140],["UK:Cheese, processed, plain",34],["Back bacon, grilled",15],["UK:Tomato ketchup",10],["Mustard",3],["Lettuce",15],["Tomato",15],["Onion",10],["UK:Gherkins, pickled, drained",8],["Mayonnaise",10]],"Five Guys Little Hamburger":[["UK:Bread rolls, white, soft",70],["UK:Burger, beef, 98-99% beef, grilled",70],["UK:Tomato ketchup",10],["Mustard",3],["Lettuce",15],["Tomato",15],["Onion",10],["UK:Gherkins, pickled, drained",8],["Mayonnaise",10]],"Wagamama Chicken Ramen":[["Noodles, egg, cooked",150],["Chicken breast, cooked",60],["Water",250],["Stock cube",5],["Pak choi",30],["Spring onion",5],["Boiled egg",20]],"Wagamama Yaki Soba, chicken":[["Noodles, egg, cooked",150],["Chicken breast, cooked",50],["Egg, whole",20],["UK:Beansprouts, mung, stir-fried in rapeseed oil",30],["Onion",15],["UK:Pepper, capsicum, red, raw",15],["Sunflower oil",5],["Soy sauce",5]],"Pret Chicken Caesar Baguette":[["UK:Bread, white, French stick",70],["Chicken breast, cooked",40],["UK:Cheese, Parmesan, fresh",5],["Mayonnaise",12],["AU:Lettuce, cos, raw",15]],"Latte":[["AU:Coffee, espresso, from ground coffee beans",30],["Semi-skimmed milk",85],["Whole milk",85]],"Cappuccino":[["AU:Coffee, espresso, from ground coffee beans",40],["Semi-skimmed milk",120]],"Flat white":[["AU:Coffee, espresso, from ground coffee beans",60],["Whole milk",140]],"Costa Latte, medium":[["AU:Coffee, espresso, from ground coffee beans",30],["Whole milk",270]],"Costa Cappuccino, medium":[["AU:Coffee, espresso, from ground coffee beans",40],["Whole milk",180]],"Costa Flat White":[["AU:Coffee, espresso, from ground coffee beans",60],["Whole milk",160]],"Costa Mocha, medium":[["AU:Coffee, espresso, from ground coffee beans",30],["Whole milk",250],["UK:Drinking chocolate, powder",20],["Double cream",10]],"Costa Hot Chocolate, medium":[["Whole milk",270],["UK:Drinking chocolate, powder",30],["Double cream",10]],"Starbucks Caffe Latte, grande":[["AU:Coffee, espresso, from ground coffee beans",60],["Semi-skimmed milk",360]],"Starbucks Cappuccino, grande":[["AU:Coffee, espresso, from ground coffee beans",60],["Semi-skimmed milk",220]],"Starbucks Flat White":[["AU:Coffee, espresso, from ground coffee beans",60],["Whole milk",200]],"Starbucks Caramel Frappuccino, grande":[["Semi-skimmed milk",150],["Water",150],["Golden syrup",35],["AU:Coffee, espresso, from ground coffee beans",30],["Double cream",10]],"Gin and Tonic":[["UK:Spirits, 40% volume",50],["UK:Tonic water",150]],"Mojito":[["Rum",50],["Lime juice",25],["Sugar, white",12],["Water",120],["AU:Mint, fresh, raw",3]],"Espresso Martini":[["UK:Spirits, 40% volume",50],["UK:Liqueurs, low-medium strength",25],["AU:Coffee, espresso, from ground coffee beans",30]],"Hummus":[["Chickpeas, canned",60],["Tahini",12],["Olive oil",5],["Lemon juice",8],["Water",15]],"Sweet and sour chicken":[["UK:Chicken breast/steak, coated, baked",40],["UK:Sauce, Chinese cook in, sweet & sour",50],["UK:Pepper, capsicum, red, raw",5],["Pineapple",5]],"Maltesers 37g":[["UK:Chocolate, milk",60],["UK:Instant drinks powder, malted, unfortified",40]],"Snickers":[["AU:Bar, nougat & caramel centre, milk chocolate-coated",80],["Peanuts",20]],"Reese's Peanut Butter Cups 2pc":[["UK:Chocolate, milk",60],["Peanut butter",40]]};
const nfNameIdx = {};
function nfRowByName(tag, name){
  if(!nfNameIdx[tag]){
    const m = {};
    nfAll(tag).forEach((r, i)=>{ if(!(r.name in m)) m[r.name] = i; });
    nfNameIdx[tag] = m;
  }
  const i = nfNameIdx[tag][name];
  return i === undefined ? null : nfAll(tag)[i];
}
let localIdx = null;
function localRowByName(name){
  if(!localIdx){
    const idx = {};
    LOCAL_FOODS.forEach(f=>{ idx[f[0]] = f; });
    localIdx = idx;
  }
  return localIdx[name] || null;
}
// A reference as the recipes write it: "UK:<row>", "AU:<row>", "Water", or
// the name of one of COACH's own foods.
let refDepth = 0;
function fillRef(ref){
  if(ref === 'Water') return {water: true, kcal100: 0, micros100: {}, sat100: 0, sug100: 0};
  const m = /^(UK|AU):(.*)$/.exec(ref);
  if(m) return nfRowByName(m[1], m[2]);
  const lf = localRowByName(ref);
  if(!lf || refDepth > 1) return null;
  refDepth++;
  try{ return localToFood(lf); } finally { refDepth--; }
}
const extraFillCache = {};
// What an alias or a recipe can add to one built-in food, per 100 g.
function extraFillFor(name){
  if(name in extraFillCache) return extraFillCache[name];
  let out = null;
  try{
    if(ALIAS_FILL[name]){
      const r = fillRef(ALIAS_FILL[name]);
      if(r && !r.water){
        const tag = /^(UK|AU):/.test(ALIAS_FILL[name]) ? ALIAS_FILL[name].slice(0, 2) : 'COACH';
        out = {micros: Object.assign({}, r.micros100 || {}), sat100: r.sat100, sug100: r.sug100,
               tag: tag, from: ALIAS_FILL[name].replace(/^(UK|AU):/, '')};
      }
    } else if(RECIPE_FILL[name]){
      const parts = RECIPE_FILL[name].map(x=>({r: fillRef(x[0]), g: Number(x[1]) || 0}))
        .filter(x=>x.g > 0);
      const total = parts.reduce((a, x)=>a + x.g, 0);
      if(parts.length && total > 0 && parts.every(x=>x.r)){
        const keys = {};
        parts.forEach(x=>Object.keys(x.r.micros100 || {}).forEach(k=>{ if(k.indexOf('off:') !== 0) keys[k] = 1; }));
        // Water carries nothing, and says so: it counts as a known zero.
        const val = (get)=>{
          let sum = 0, known = 0;
          parts.forEach(x=>{
            const v = x.r.water ? 0 : get(x.r);
            if(v == null || !isFinite(v)) return;
            sum += v * x.g; known += x.g;
          });
          // A nutrient most of the dish can't vouch for stays blank rather
          // than being guessed from the one ingredient that had it.
          return known >= 0.85 * total ? sum / known : null;
        };
        // The recipe is scaled to the food's own calories, so a dish that is
        // wetter or drier than the recipe still gets the right density.
        const own = localRowByName(name);
        const rk = val(r=>r.kcal100);
        let scale = (own && rk > 0 && own[1] > 0) ? own[1] / rk : 1;
        scale = Math.max(0.75, Math.min(1.33, scale));
        const micros = {};
        Object.keys(keys).forEach(k=>{
          const v = val(r=>(r.micros100 || {})[k]);
          if(v != null) micros[k] = v * scale;
        });
        const sat = val(r=>r.sat100), sug = val(r=>r.sug100);
        out = {micros: micros, sat100: sat == null ? null : sat * scale,
               sug100: sug == null ? null : sug * scale, tag: 'Recipe',
               from: RECIPE_FILL[name].map(x=>x[0].replace(/^(UK|AU):/, '')).join(', ')};
      }
    }
  }catch(e){ return null; }        // not cached: it may just be too early in start-up
  if(refDepth === 0) extraFillCache[name] = out;
  return out;
}

function microsForLocal(name){
  const row = MICRO_DB[name];
  // Anything downloaded from FoodData Central is a top-up, never a replacement.
  // A figure the app already ships was chosen deliberately and keeps priority,
  // so turning this on can change a blank into a number but can never change a
  // number into a different number.
  const nat  = (typeof nfFillChain === 'function') ? nfFillChain(name) : [];
  const fill = (typeof fdcFillFor   === 'function') ? fdcFillFor(name)  : null;
  // Order matters and it is deliberate: COACH's own figure, then the UK
  // tables, then the Australian ones, then USDA. Each source only ever fills
  // a blank left by the one above it, so nothing is overwritten - only
  // completed. The UK leads because that is where the food was bought.
  const extra = extraFillFor(name);
  const topUp = m => {
    nat.forEach(s=>{ for(const k in s.micros){ if(m[k] == null) m[k] = s.micros[k]; } });
    if(extra) for(const k in extra.micros){ if(m[k] == null && extra.micros[k] != null) m[k] = extra.micros[k]; }
    if(fill) for(const k in fill){ if(m[k] == null) m[k] = fill[k]; }
    return m;
  };
  // Saturated fat and sugars, for the foods COACH shipped without them.
  let sat = null, sug = null;
  nat.forEach(s=>{ if(sat == null && s.sat100 != null) sat = s.sat100;
                   if(sug == null && s.sug100 != null) sug = s.sug100; });
  if(extra){ if(sat == null && extra.sat100 != null) sat = extra.sat100;
             if(sug == null && extra.sug100 != null) sug = extra.sug100; }
  if(!row){
    const only = EXTRA_MICRO[name];
    return {micros: topUp(only ? Object.assign({}, only) : {}), sugars: null, satFill: sat, sugFill: sug};
  }
  const micros = {};
  // row[0] is fibre, row[1] is sugars, then the ordered micros from index 2
  micros['fiber'] = row[0];
  MICRO_ORDER.slice(1).forEach((k,i)=>{ micros[k] = row[i+2]; });
  const x = EXTRA_MICRO[name];
  if(x) for(const k in x){ if(micros[k] == null) micros[k] = x[k]; }
  return {micros: topUp(micros), sugars: row[1], satFill: sat, sugFill: sug};
}

