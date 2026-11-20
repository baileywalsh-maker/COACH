// ---- Meal selection & portion flow ----
const MEALS = ['Breakfast','Lunch','Snack','Dinner'];
let selectedMeal = 'Breakfast';
let pendingFood = null;

function guessMeal(){
  const h = new Date().getHours();
  if(h < 11) return 'Breakfast';
  if(h < 15) return 'Lunch';
  if(h < 18) return 'Snack';
  return 'Dinner';
}
function selectMeal(m){
  selectedMeal = m;
  document.querySelectorAll('.meal-tab').forEach(b=>b.classList.toggle('active', b.dataset.meal===m));
  // The portion sheet's picker is the same choice shown twice; it must never
  // disagree with the tabs behind it.
  document.querySelectorAll('#portion-meals [data-pmeal]')
    .forEach(b=>b.classList.toggle('active', b.dataset.pmeal===m));
  if(typeof updatePortionAddLabel === 'function') updatePortionAddLabel();
}

// The meal picker markup, in one place. It was written inline for the edit
// sheet in v40 and is now on the portion sheet too — two copies would have
// drifted the first time one of them changed.
const MEAL_ICONS = {Breakfast:'ti-sunrise', Lunch:'ti-sun', Snack:'ti-cookie', Dinner:'ti-moon'};
function mealTotalsToday(entries){
  const out = {};
  MEALS.forEach(m=>{ out[m] = 0; });
  (entries||[]).forEach(x=>{ const m = x.meal || 'Snack'; if(out[m] !== undefined) out[m] += x.kcal || 0; });
  return out;
}
function mealPickerHTML(active, attr, totals){
  return MEALS.map(m=>
    '<button class="meal-pick'+(active===m?' active':'')+'" '+attr+'="'+m+'">'+
    '<i class="ti '+MEAL_ICONS[m]+'" aria-hidden="true"></i>'+
    '<span class="mp-name">'+m+'</span>'+
    '<span class="mp-kcal">'+(totals && totals[m] ? fmt0(totals[m]) : '\u2014')+'</span></button>'
  ).join('');
}
document.querySelectorAll('.meal-tab').forEach(b=>{ b.onclick = ()=>selectMeal(b.dataset.meal); });


// Nutrients Open Food Facts publishes that have no row of their own. Kept so
// that a figure measured on a real packet is never silently discarded, and
// shown in the panel with its amount even though there is no range to draw.
const EXTRA_OFF = {
  'iodine_100g':      {n:'Iodine',      u:'ug', mult:1000000, nrv:150},
  'chromium_100g':    {n:'Chromium',    u:'ug', mult:1000000, nrv:40},
  'molybdenum_100g':  {n:'Molybdenum',  u:'ug', mult:1000000, nrv:50},
  'fluoride_100g':    {n:'Fluoride',    u:'mg', mult:1000,    nrv:3.5},
  'biotin_100g':      {n:'Biotin',      u:'ug', mult:1000000, nrv:50},
  'pantothenic-acid_100g':{n:'Pantothenic acid', u:'mg', mult:1000, nrv:6},
  'caffeine_100g':    {n:'Caffeine',    u:'mg', mult:1000,    nrv:null},
  'alcohol_100g':     {n:'Alcohol',     u:'g',  mult:1,       nrv:null},
  'starch_100g':      {n:'Starch',      u:'g',  mult:1,       nrv:null},
  'polyols_100g':     {n:'Polyols',     u:'g',  mult:1,       nrv:null},
  'taurine_100g':     {n:'Taurine',     u:'mg', mult:1000,    nrv:null},
  'omega-6-fat_100g': {n:'Omega-6',     u:'g',  mult:1,       nrv:null},
  'omega-9-fat_100g': {n:'Omega-9',     u:'g',  mult:1,       nrv:null},
  'water_100g':       {n:'Water',       u:'g',  mult:1,       nrv:null}
};
function extractMicros(n){
  const out = {};
  MICROS.forEach(m=>{
    const v = m.off ? n[m.off] : undefined;
    if(v !== undefined && v !== null && !isNaN(v)){
      out[m.k] = v * (m.mult || 1);
    }
  });
  // Anything else the label published. Read and kept rather than dropped -
  // unless it now has a row of its own, which already has it.
  for(const off in EXTRA_OFF){
    if(OFF_HAS_ROW[off]) continue;
    const v = n[off];
    if(v !== undefined && v !== null && !isNaN(v)){
      out['off:' + off] = v * (EXTRA_OFF[off].mult || 1);
    }
  }
  return out;
}
// A definition for a nutrient that arrived off a label without a row of its own,
// so the panel can draw it like any other.
const OFF_HAS_ROW = {};
MICROS.forEach(m=>{ if(m.off) OFF_HAS_ROW[m.off] = true; });
function offMicroDef(key){
  const off = key.slice(4), d = EXTRA_OFF[off];
  // Old scans stored iodine, omega-6 and the rest under both names. The row
  // is the one to show; drawing this too listed them twice.
  if(!d || OFF_HAS_ROW[off]) return null;
  return {k:key, n:d.n, u:d.u, target:d.nrv, rda:{m:d.nrv, f:d.nrv}, unranged: !d.nrv};
}

// 'egg' -> 'eggs'. Handles the units actually in the database.
// "3 eggs" reads better than "150g" for countable food; grams stay for everything else.
// ---------------------------------------------------------------------------
// MEASURE
//
// A food is measured in grams or in millilitres, never in both, and COACH never
// converts between them: there is no density table here and there is not going
// to be one, because a converted figure is a figure nobody measured.
const MEASURE_KEY = 'coachmeasure';        // per-food overrides
function loadMeasures(){ try{ return JSON.parse(CS.getItem(MEASURE_KEY))||{}; }catch(e){ return {}; } }
function measureKeyFor(food){ return food ? (food.code ? 'c:'+food.code : 'n:'+String(food.name||'').toLowerCase()) : null; }

// The override wins, then whatever the food itself claims, then grams. Grams is
// the fallback because it is what every pre-v35 food already was.
function foodBasis(food){
  if(!food) return 'g';
  const k = measureKeyFor(food);
  const ov = k ? loadMeasures()[k] : null;
  if(ov === 'g' || ov === 'ml') return ov;
  return food.basis === 'ml' ? 'ml' : 'g';
}
function setFoodMeasure(food, basis){
  const k = measureKeyFor(food);
  if(!k) return;
  const all = loadMeasures();
  all[k] = (basis === 'ml') ? 'ml' : 'g';
  lsSet(MEASURE_KEY, JSON.stringify(all));
}

// An entry logged before v35 has no basis. That is not missing data — it is a
// gram entry, because grams was the only thing COACH could record.
function entryBasis(e){ return (e && e.basis === 'ml') ? 'ml' : 'g'; }
// The weight of an entry as text, or nothing at all for a food counted per
// item - its "grams" are only a counter, not a weight anyone published.
function gramsText(e, g){
  if(e && e.perItem) return '';
  g = (g == null) ? (Number(e && e.grams) || 0) : g;
  return g > 0 ? fmt0(g) + (entryBasis(e) === 'ml' ? ' ml' : ' g') : '';
}

// Quick portions come from the food, not from a fixed list. Six buttons of
// 50-300g were the same for olive oil and for milk: the smallest option for oil
// was 442 kcal, and for milk they stopped short of a pint.
const PICKS_ML    = [100, 200, 250, 330, 500, 568];   // 568 is a pint
const PICKS_DENSE = [5, 10, 15, 20, 30, 50];          // oils, nuts, butter
const PICKS_GRAM  = [30, 50, 100, 150, 200, 250];
function quickPicks(food){
  if(foodBasis(food) === 'ml') return PICKS_ML;
  return (food && food.kcal100 > 500) ? PICKS_DENSE : PICKS_GRAM;
}
function amountStep(food){
  if(foodBasis(food) === 'ml') return 25;
  return (food && food.kcal100 > 500) ? 5 : 10;
}

// Open Food Facts is a volunteer database and its unit fields are uneven, so
// this asks four different ways before giving up. `nutrition_data_per` and the
// *_unit fields are authoritative when present; the serving and pack strings
// ("330 ml (1 can)", "1L") are what is left when they are not.
function detectBasis(p){
  if(!p) return 'g';
  const unit = String(p.serving_quantity_unit || p.product_quantity_unit || '').toLowerCase();
  if(unit === 'ml' || unit === 'l' || unit === 'cl') return 'ml';
  if(unit === 'g' || unit === 'kg') return 'g';
  const per = String(p.nutrition_data_per || '').toLowerCase();
  if(per.indexOf('ml') >= 0) return 'ml';
  if(per.indexOf('g') >= 0) return 'g';
  if(/[\d\s](ml|cl|litre|liter)\b/i.test(String(p.serving_size || ''))) return 'ml';
  if(/^\s*[\d.]+\s*l\b/i.test(String(p.serving_size || ''))) return 'ml';
  if(/[\d\s](ml|cl|litre|liter)\b/i.test(String(p.quantity || ''))) return 'ml';
  if(/^\s*[\d.]+\s*l\b/i.test(String(p.quantity || ''))) return 'ml';
  return 'g';
}

// Pack size, normalised to grams or millilitres. Returns the size of ONE item:
// for "4 x 25 g" that is 25, not the 100 the box weighs, because one is what
// you eat. That is also why the string is parsed before the numeric field —
// `product_quantity` only ever knows the total.
function parsePackString(s){
  s = String(s || '').trim();
  if(!s) return null;
  let count = 1, num = null, unit = null;
  let m = /(\d+)\s*[x\u00d7*]\s*([\d.]+)\s*(kg|g|ml|cl|litres?|liters?|l)\b/i.exec(s);
  if(m){ count = Number(m[1]); num = Number(m[2]); unit = m[3].toLowerCase(); }
  else {
    m = /([\d.]+)\s*(kg|g|ml|cl|litres?|liters?|l)\b/i.exec(s);
    if(!m) return null;
    num = Number(m[1]); unit = m[2].toLowerCase();
  }
  if(!isFinite(num) || num <= 0) return null;
  let basis = 'g', size = num;
  if(unit === 'kg'){ size = num * 1000; }
  else if(unit === 'ml'){ basis = 'ml'; }
  else if(unit === 'cl'){ basis = 'ml'; size = num * 10; }
  else if(unit === 'l' || unit.charAt(0) === 'l'){ basis = 'ml'; size = num * 1000; }
  if(!(size > 0) || size > 20000) return null;
  return { size: Math.round(size * 100) / 100, basis: basis, count: count };
}

function packSize(p){
  if(!p) return null;
  const fromString = parsePackString(p.quantity);
  // A multipack string beats the numeric total, which describes the box.
  if(fromString && fromString.count > 1) return fromString;
  const n = Number(p.product_quantity);
  if(isFinite(n) && n > 0 && n <= 20000){
    const u = String(p.product_quantity_unit || '').toLowerCase();
    const basis = (u === 'ml' || u === 'cl' || u.charAt(0) === 'l') ? 'ml' : 'g';
    let size = n;
    if(u === 'kg') size = n * 1000;
    else if(u === 'cl') size = n * 10;
    else if(u === 'l' || (u.charAt(0) === 'l' && u !== 'lb')) size = n * 1000;
    if(size > 0 && size <= 20000) return { size: Math.round(size*100)/100, basis: basis, count: 1 };
  }
  return fromString;
}

// Could this pack plausibly be one sitting? The ceilings matter more in the
// direction they refuse: offering a 1 kg bag of rice as "1 pack" would let a
// mis-tap log 3,500 kcal, which is far worse than defaulting to 100 g.
const PACK_MAX_G  = 500;
const PACK_MAX_ML = 600;
function packIsSingleServe(pack){
  if(!pack || !(pack.size > 0)) return false;
  return pack.basis === 'ml' ? pack.size <= PACK_MAX_ML : pack.size <= PACK_MAX_G;
}

// 1 pot beats 1 serving. Longest words first so "packet" is not swallowed by
// "pack", and "Pot Noodle" resolves to pot.
const PACK_WORDS = ['sachet','carton','bottle','packet','pouch','punnet','sleeve',
                    'slice','stick','block','pack','tube','tray','roll','bowl',
                    'jar','tin','tub','bar','box','can','cup','pot','bag'];
function packUnitName(p){
  const fromServing = servingUnitName(p);
  if(fromServing !== 'serving') return fromServing;
  const name = String((p && p.product_name) || '').toLowerCase();
  for(let i=0;i<PACK_WORDS.length;i++){
    if(new RegExp('\\b'+PACK_WORDS[i]+'s?\\b').test(name)) return PACK_WORDS[i];
  }
  return 'pack';
}

// Everything the portion sheet needs to open on the right amount. One function
// so the barcode path and the branded-search path cannot drift apart — they
// already had two copies of the serving logic between them.
function portionDefaultsFor(p){
  const parsed = parseServingText(p && p.serving_size);
  const servG = Number(p && p.serving_quantity) || null;
  // The text wins. serving_quantity is Open Food Facts' guess at the leading
  // number and is simply wrong whenever the packet counts things before it
  // weighs them, which is most of them.
  let serving = null;
  if(parsed && parsed.size > 0) serving = Math.round(parsed.size*100)/100;
  else if(servG && servG > 0 && servG < 1500) serving = Math.round(servG);
  // A "serving" of one or two grams is not a serving, it is a miscount. Refuse
  // it rather than open the sheet on it.
  if(serving !== null && serving < 3) serving = null;
  const pack = packSize(p);

  // A pack that holds several servings: the serving is the useful unit.
  if(serving && pack && pack.size / serving >= 1.5){
    return { unitName: servingUnitName(p), unitGrams: serving, startAmount: serving };
  }
  // A pack you finish in one go: the pack is the portion. This is the Pot
  // Noodle case — 114 g, and COACH used to open at 100.
  if(packIsSingleServe(pack)){
    return { unitName: packUnitName(p), unitGrams: pack.size, startAmount: pack.size };
  }
  // No usable pack size. Fall back to the declared serving, as before v36.
  if(serving){
    return { unitName: servingUnitName(p), unitGrams: serving, startAmount: serving };
  }
  return { unitName: null, unitGrams: null, startAmount: null };
}

// Read a serving_size string the way a person reads a packet.
//
// The shapes that actually turn up: "27 g", "1 bag (27 g)", "2 biscuits (25 g)",
// "330 ml (1 can)", "1 portion (30 g)". The WEIGHT is whichever number carries a
// real unit - g, kg, ml, cl, l - wherever in the string it sits, brackets
// included. The NAME is the descriptive noun sitting next to a bare count.
//
// This is the part Open Food Facts gets wrong for us: its serving_quantity is
// just the leading number, so every "1 bag (27 g)" arrives as a 1.
const SERV_UNIT_RE = /([\d]+(?:[.,][\d]+)?)\s*(kg|g|ml|cl|l)\b/i;
const SERV_COUNT_RE = /(?:^|\()\s*([\d]+(?:[.,][\d]+)?)\s*([a-z][a-z\s-]{1,17}?)\s*(?=\)|\(|$|,)/i;
function parseServingText(txt){
  const s = String(txt || '').trim();
  if(!s) return null;
  const mu = SERV_UNIT_RE.exec(s);
  let size = null;
  if(mu){
    let v = parseFloat(mu[1].replace(',', '.'));
    const u = mu[2].toLowerCase();
    if(u === 'kg' || u === 'l') v *= 1000;
    else if(u === 'cl') v *= 10;
    if(isFinite(v) && v > 0 && v <= 1500) size = Math.round(v*100)/100;
  }
  // The noun, and how many of it. A match whose "noun" is really a unit is not
  // a count at all - that is the "330 ml" half of "330 ml (1 can)".
  let name = null, count = null;
  const re = new RegExp(SERV_COUNT_RE.source, 'gi');
  let m;
  while((m = re.exec(s)) !== null){
    const word = m[2].trim().toLowerCase().replace(/\s+/g, ' ');
    if(/^(kg|g|ml|cl|l|gram|grams|millilitre|millilitres|litre|litres|oz|fl oz)$/.test(word)) continue;
    if(word.length > 18) continue;
    name = word; count = parseFloat(m[1].replace(',', '.'));
    break;
  }
  if(name){
    // "2 biscuits (25 g)" - the serving is the pair, so it is a serving, not a
    // biscuit. Only a count of one lets the noun name the unit.
    if(count !== 1) name = 'serving';
    // "glass" is not the plural of "glas". Only strip an s that is really a
    // plural marker.
    else if(!/(ss|us|is|os)$/.test(name)) name = name.replace(/s$/, '');
  }
  return { size: size, name: name };
}

// "330 ml (1 can)" is more useful than "serving".
function servingUnitName(p){
  const parsed = parseServingText(p && p.serving_size);
  if(parsed && parsed.name) return parsed.name;
  return 'serving';
}

function amountLabel(e){
  if(!e) return '';
  let txt = '';
  if(e.qty && e.unit) txt = e.qty+' '+pluralUnit(e.unit, e.qty);
  else if(e.grams && !e.perItem) txt = e.grams + (entryBasis(e)==='ml' ? ' ml' : 'g');
  return txt ? ' <span style="color:var(--text3); font-weight:400;">'+txt+'</span>' : '';
}

function pluralUnit(u, n){
  if(Math.abs(n - 1) < 0.001) return u;
  if(/(s|sh|ch|x)$/.test(u)) return u + 'es';
  return u + 's';
}

// Is this food genuinely countable in whole things - 1 bag, 2 eggs - rather
// than just weighable? A unit has to have a real size and a real name.
// "1 g" fails both tests and is the fingerprint of a serving size that was
// mis-read at scan time, which is why it is checked here and not only fixed at
// the source: records saved before the fix are still on the phone.
const NOT_A_UNIT_NAME = /^(g|kg|ml|cl|l|gram|grams|millilitre|millilitres|litre|litres)$/i;
function isCountable(f){
  if(!f) return false;
  const size = Number(f.unitGrams);
  const name = String(f.unitName || '').trim();
  if(!(size >= 3)) return false;
  if(!name || NOT_A_UNIT_NAME.test(name)) return false;
  return true;
}

let portionMode = 'gram';   // 'unit' when the food is countable

// Two decimal places. Enough that 130 g of a 50 g egg round-trips as 2.6 and
// back to 130, and few enough that the box never shows 2.5999999999999996.
function round2(x){ return Math.round(x*100)/100; }

function setPortionMode(mode){
  portionMode = mode;
  document.getElementById('portion-unit-panel').style.display = mode==='unit' ? 'block' : 'none';
  document.getElementById('portion-gram-panel').style.display = mode==='unit' ? 'none' : 'block';
  document.querySelectorAll('#portion-modes .tab').forEach(t=>
    t.classList.toggle('active', t.dataset.pmode === mode));
  updatePortionPreview();
}

// The single source of truth for how much food is selected, whichever mode you
// are in, expressed in the food's own measure. Clamped at zero: a typed minus
// sign used to preview -214 kcal, which the Add button then refused without
// saying why.
function portionGrams(){
  if(portionMode === 'unit' && pendingFood && pendingFood.unitGrams){
    const q = Number(document.getElementById('portion-qty').value);
    return Math.max(0, (isFinite(q) ? q : 0) * pendingFood.unitGrams);
  }
  return Math.max(0, Number(document.getElementById('portion-grams').value) || 0);
}

// Everything that has to change when a food's measure changes: the tab label,
// the unit beside the input, the quick picks, and the offer to flip it back.
function refreshPortionMeasure(){
  if(!pendingFood) return;
  const basis = foodBasis(pendingFood);
  const u = basis === 'ml' ? 'ml' : 'g';
  document.getElementById('pmode-amount').textContent = basis === 'ml' ? 'ml' : 'Grams';
  document.getElementById('portion-amount-label').textContent = u;
  document.getElementById('portion-flip').textContent =
    basis === 'ml' ? 'Measure in grams instead' : 'Measure in ml instead';
  const picks = quickPicks(pendingFood);
  document.getElementById('gram-quick').innerHTML = picks.map(g=>
    '<button class="qp" data-g="'+g+'">'+g+(basis==='ml' ? 'ml' : 'g')+'</button>').join('');
  document.querySelectorAll('#gram-quick .qp').forEach(b=>{
    b.onclick = ()=>{ document.getElementById('portion-grams').value = b.dataset.g; updatePortionPreview(); };
  });
}

let scoreTab = 'overall';
// `kind` of 'add' means a score that can only ever help. Low is not bad there,
// it is simply "not much", so it reads neutral rather than red.
function scoreColour(cls, kind){
  if(cls === 'good') return 'var(--accent)';
  if(cls === 'fair') return 'var(--score-fair)';
  return kind === 'add' ? 'var(--t2)' : 'var(--danger)';
}
function scoreMeter(v, cls, kind){
  const C = 2*Math.PI*24;
  const col = scoreColour(cls, kind);
  return '<div class="sc-meter"><svg width="60" height="60" viewBox="0 0 60 60">'+
    '<circle cx="30" cy="30" r="24" stroke="var(--well)" stroke-width="6" fill="none"/>'+
    '<circle cx="30" cy="30" r="24" stroke="'+col+'" stroke-width="6" fill="none" stroke-linecap="round" '+
    'stroke-dasharray="'+C.toFixed(1)+'" stroke-dashoffset="'+(C*(1-v/100)).toFixed(1)+'"/></svg>'+
    '<div class="mv"><span class="mn" style="color:'+col+'">'+v+'</span></div></div>';
}
const NOVA_WHY = {1:'', 2:'a culinary ingredient', 3:'processed',
                  4:'ultra-processed (NOVA 4)'};
// The display name for a nutrient key, so the breakdown can name what it found.
function microName(k){
  // As printed in the panel. Lower-casing turned "Vitamin B12" into "vitamin b12".
  for(const m of MICROS) if(m.k === k) return m.n;
  return k;
}

function scoreFac(kind, icon, label, val){
  return '<div class="sc-fac '+kind+'"><i class="ti '+icon+'" aria-hidden="true"></i>'+
         '<span class="fl">'+label+'</span><span class="fv">'+val+'</span></div>';
}
// What the amount on screen actually does, against the day's own figures. The
// EU labelling thresholds again: 15% of a daily reference is "a source of",
// 30% is "high in".
function portionFacts(food, grams){
  if(!food || !(grams > 0) || !(food.kcal100 > 0)) return null;
  const k = grams/100, t = targets || {};
  const rows = [];
  const kcal = food.kcal100 * k;
  rows.push({n:'Calories', v: fmt0(kcal), u:'',
             sub: t.kcal > 0 ? Math.round(kcal/t.kcal*100)+'% of today' : ''});
  const pro = (food.p100||0) * k;
  if(pro >= 1) rows.push({n:'Protein', v: round1(pro), u:'g', col:'var(--prot)',
             sub: t.protein > 0 ? Math.round(pro/t.protein*100)+'% of your target' : ''});
  const defs = microTargetsFor();
  const lim = k2 => defs.filter(d=>d.k===k2)[0];
  [['sugar', food.sug100, 'Sugars'], ['satfat', food.sat100, 'Saturated fat']].forEach(pair=>{
    const d = lim(pair[0]);
    if(pair[1] == null || !d || !(d.target > 0)) return;
    const amt = pair[1]*k;
    if(amt < 0.5) return;
    const pct = Math.round(amt/d.target*100);
    rows.push({n:pair[2], v:round1(amt), u:'g', sub:pct+'% of your limit',
               col: pct >= 25 ? 'var(--score-fair)' : null});
  });
  // Anything this portion is a meaningful source of.
  const src = [];
  defs.forEach(d=>{
    if(d.limit || !(d.target > 0)) return;
    const v = (food.micros100||{})[d.k];
    if(v == null) return;
    const pct = (v*k)/d.target*100;
    if(pct >= 15) src.push({n:d.n, pct:Math.round(pct), high: pct >= 30});
  });
  src.sort((a,b)=>b.pct-a.pct);
  return {rows: rows, src: src.slice(0,4), grams: grams};
}

// opts.box    which container to write into (default: the portion sheet's)
// opts.grams   the amount to score, when it is not the portion sheet's own
//
// Both exist so the food detail sheet can show the SAME panel for a portion you
// already ate. One renderer, so the breakdown you see from the log and the one
// you see before logging can never disagree.
