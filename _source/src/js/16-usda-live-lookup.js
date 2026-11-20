/* ============================ USDA FoodData Central ============================
   Open Food Facts covers packaged products; it is thin on whole foods and
   thinner still on vitamins, because EU labels are not required to declare them.
   FoodData Central is the other half: about 20,000 whole foods, each with a full
   laboratory profile rather than a label. Together they cover both ends.

   Everything here is inert without a key. No key means no request, no change in
   behaviour, and nothing different about anything already saved. That is the
   standing rule for this app and it applies to this feature like every other.
============================================================================== */

const FDC_KEY_K   = 'coachfdckey';
const FDC_FOOD_K  = 'coachfdcfoods';   // whole records, so a picked food works offline
const FDC_FILL_K  = 'coachfdcfill';    // micro top-ups for the built-in list
const FDC_HOST    = 'https://api.nal.usda.gov/fdc/v1';

function fdcKey(){ try{ return CS.getItem(FDC_KEY_K) || ''; }catch(e){ return ''; } }
function fdcHasKey(){ return fdcKey().length > 10; }
// Pasting from an email brings whitespace and sometimes a line break with it,
// and a key with a newline in it produces a malformed request rather than an
// honest rejection.
function fdcSaveKey(k){ return lsSet(FDC_KEY_K, String(k||'').replace(/\s+/g, '')); }

function fdcLoad(k){ try{ return JSON.parse(CS.getItem(k)) || {}; }catch(e){ return {}; } }

// FoodData Central nutrient numbers, and the unit COACH wants each one in.
// Sourced from the FDC nutrient table, not from memory of what a label says.
const FDC_NUTRIENTS = {
  1008:{k:'kcal',       u:'kcal'},
  1003:{k:'protein',    u:'g'},
  1005:{k:'carbs',      u:'g'},
  1004:{k:'fat',        u:'g'},
  2000:{k:'sugar',      u:'g'},
  1258:{k:'satfat',     u:'g'},
  1079:{k:'fiber',      u:'g'},
  1257:{k:'transfat',   u:'g'},
  1292:{k:'monofat',    u:'g'},
  1293:{k:'polyfat',    u:'g'},
  1253:{k:'cholesterol',u:'mg'},
  1093:{k:'sodium',     u:'mg'},
  1092:{k:'potassium',  u:'mg'},
  1087:{k:'calcium',    u:'mg'},
  1089:{k:'iron',       u:'mg'},
  1090:{k:'magnesium',  u:'mg'},
  1095:{k:'zinc',       u:'mg'},
  1091:{k:'phosphorus', u:'mg'},
  1103:{k:'selenium',   u:'ug'},
  1098:{k:'copper',     u:'mg'},
  1101:{k:'manganese',  u:'mg'},
  1100:{k:'iodine',     u:'ug'},
  1096:{k:'chromium',   u:'ug'},
  1102:{k:'molybdenum', u:'ug'},
  1106:{k:'vitamin-a',  u:'ug'},   // retinol activity equivalents
  1162:{k:'vitamin-c',  u:'mg'},
  1114:{k:'vitamin-d',  u:'ug'},   // D2 + D3
  1109:{k:'vitamin-e',  u:'mg'},   // alpha-tocopherol
  1185:{k:'vitamin-k',  u:'ug'},   // phylloquinone
  1165:{k:'vitamin-b1', u:'mg'},
  1166:{k:'vitamin-b2', u:'mg'},
  1167:{k:'vitamin-pp', u:'mg'},
  1170:{k:'vitamin-b5', u:'mg'},
  1175:{k:'vitamin-b6', u:'mg'},
  1176:{k:'vitamin-b7', u:'ug'},
  1177:{k:'vitamin-b9', u:'ug'},
  1178:{k:'vitamin-b12',u:'ug'},
  1180:{k:'choline',    u:'mg'}
};
// The omegas are reported as individual fatty acids, so they are summed rather
// than read. Preferring the specific chain over the total avoids counting the
// same fat twice when a food happens to publish both.
const FDC_O3 = [{id:1405, alt:1404}, {id:1272}, {id:1278}, {id:1280}];  // ALA, DHA, EPA, DPA
/* The nutrients Cronometer has and COACH did not. Two kinds:
   - EPA and DHA on their own. "Omega-3" lumps them in with ALA from seeds,
     and the guidance (SACN 450 mg a day, EFSA 250) is about the marine two,
     which the body barely makes from ALA.
   - The amino acids that decide whether protein does its job. Leucine is the
     one that triggers muscle protein synthesis; lysine and methionine are the
     ones plant-heavy diets run short of.
   Neither British nor Australian tables publish any of this, so these fill
   from FoodData Central only - and until the key is on, COACH says so rather
   than showing them as a gap in your diet.                                  */
const DEEP_NUTRIENTS = [
  {k:'epadha', u:'g',  re:/\b(20:5|22:6)\b.*n-3|EPA|DHA/i},
  {k:'leucine', u:'g', re:/^\s*leucine\s*$/i},
  {k:'lysine',  u:'g', re:/^\s*lysine\s*$/i},
  {k:'methionine', u:'g', re:/^\s*methionine\s*$/i}
];
const FDC_O6 = [{id:1269, alt:1316}, {id:1313}];                        // linoleic, arachidonic

const UNIT_SCALE = {G:1, GRM:1, MG:1e-3, MGRM:1e-3, UG:1e-6, UGRM:1e-6, MCG:1e-6, MCG_RE:1e-6, IU:null};
const WANT_SCALE = {g:1, mg:1e-3, ug:1e-6};
function fdcConvert(value, fromUnit, wantUnit){
  const f = UNIT_SCALE[String(fromUnit||'').toUpperCase()];
  const t = WANT_SCALE[wantUnit];
  // An International Unit is a different quantity per vitamin, so it cannot be
  // converted by a scale factor. Dropping it is correct; guessing is not.
  if(f == null || t == null) return null;
  return value * f / t;
}

// The search endpoint and the detail endpoint describe a nutrient differently.
// Reading both shapes here means the rest of the code never has to care which
// call the food arrived from.
function fdcReadRow(row){
  if(!row) return null;
  const id  = row.nutrientId != null ? row.nutrientId
            : (row.nutrient && row.nutrient.id != null ? row.nutrient.id : null);
  const amt = row.value != null ? row.value : (row.amount != null ? row.amount : null);
  const un  = row.unitName || (row.nutrient && row.nutrient.unitName) || '';
  const nm  = row.nutrientName || (row.nutrient && row.nutrient.name) || '';
  if(id == null || amt == null) return null;
  return {id: Number(id), amount: Number(amt), unit: un, name: String(nm)};
}

// A FoodData Central record -> the shape openPortion already understands.
// Values are per 100 g throughout, which is what FDC publishes and what COACH
// stores, so nothing is rescaled here.
function fdcToFood(rec){
  if(!rec) return null;
  const rows = (rec.foodNutrients || []).map(fdcReadRow).filter(x=>x);
  const by = {};
  rows.forEach(r=>{ if(by[r.id] == null) by[r.id] = r; });

  const val = (id, want)=>{
    const r = by[id];
    if(!r) return null;
    if(want === 'kcal') return String(r.unit||'').toUpperCase() === 'KCAL' ? r.amount : null;
    return fdcConvert(r.amount, r.unit, want);
  };
  const sumChain = chain => {
    let total = null;
    chain.forEach(c=>{
      let v = val(c.id, 'g');
      if(v == null && c.alt != null) v = val(c.alt, 'g');
      if(v != null) total = (total || 0) + v;
    });
    return total;
  };

  const kcal = val(1008, 'kcal');
  if(kcal == null) return null;               // no calories, no usable food

  const micros = {};
  Object.keys(FDC_NUTRIENTS).forEach(idStr=>{
    const def = FDC_NUTRIENTS[idStr];
    if(['kcal','protein','carbs','fat','sugar','satfat'].indexOf(def.k) >= 0) return;
    const v = val(Number(idStr), def.u);
    if(v != null) micros[def.k] = Math.round(v * 1000) / 1000;
  });
  // Matched on the name in the response rather than on a remembered ID
  // number: FDC sends both, and a wrong ID would quietly file lysine as
  // leucine with nothing on screen to give it away.
  DEEP_NUTRIENTS.forEach(d=>{
    let total = null;
    rows.forEach(r=>{
      if(!d.re.test(r.name || '')) return;
      const v = fdcConvert(r.amount, r.unit, d.u);
      if(v != null) total = (total || 0) + v;
    });
    if(total != null) micros[d.k] = Math.round(total * 1000) / 1000;
  });
  const o3 = sumChain(FDC_O3); if(o3 != null) micros.omega3 = Math.round(o3 * 1000) / 1000;
  const o6 = sumChain(FDC_O6); if(o6 != null) micros.omega6 = Math.round(o6 * 1000) / 1000;

  return {
    name: fdcTidyName(rec.description),
    src: 'fdc',
    fdcId: rec.fdcId || null,
    fdcDesc: rec.description || '',
    kcal100: Math.round(kcal),
    p100: val(1003,'g'), c100: val(1005,'g'), f100: val(1004,'g'),
    sug100: val(2000,'g'), sat100: val(1258,'g'),
    micros100: micros,
    basis: 'g'
  };
}

// FDC descriptions are written for a database, not for a phone screen:
// "Chicken, broilers or fryers, breast, meat only, cooked, roasted". The full
// text is kept on the record so you can always see exactly what was matched.
function fdcTidyName(desc){
  let s = String(desc || '').trim();
  s = s.replace(/,\s*(UPC|GTIN)[:\s].*$/i, '');
  const parts = s.split(',').map(x=>x.trim()).filter(x=>x);
  // Only boilerplate that can never tell two foods apart is dropped. "Raw" is
  // NOT on this list and must never be: raw and roasted chicken breast differ
  // by 40 calories, and trimming the word made both rows read identically.
  const drop = /^(all classes|all commercial varieties|broilers or fryers|composite of trimmed retail cuts|includes foods for usda's food distribution program|nfs|upc|gtin)$/i;
  const keep = parts.filter(p=>!drop.test(p));
  const use = keep.length ? keep : parts;
  const full = use.join(', ');
  if(full.length <= 52 || use.length <= 3) return full;
  // Too long for a row. The distinguishing words sit at the END of an FDC
  // description, so the middle is what goes, never the tail.
  return use[0] + ', ' + use.slice(-2).join(', ');
}

async function fdcRequest(path){
  const key = fdcKey();
  if(!key) throw new Error('No USDA key saved');
  const sep = path.indexOf('?') >= 0 ? '&' : '?';
  const r = await fetch(FDC_HOST + path + sep + 'api_key=' + encodeURIComponent(key));
  if(r.status === 403) throw new Error('That key was rejected');
  if(r.status === 429) throw new Error('Hourly limit reached — try again shortly');
  if(!r.ok){
    // FoodData Central explains a 400 in the body. Printing "HTTP 400" and
    // throwing that away leaves nothing to act on.
    let why = '';
    try{
      const body = await r.json();
      why = body && (body.message || body.error || (body.errors &&
            (body.errors.message || JSON.stringify(body.errors))));
    }catch(e){}
    throw new Error('HTTP ' + r.status + (why ? ' — ' + why : ''));
  }
  return r.json();
}

// Whole foods only. Branded is deliberately excluded: it is label data, which
// is what Open Food Facts already does better, and it would bury the laboratory
// profiles that are the reason for coming here.
const FDC_TYPES = ['Foundation', 'SR Legacy', 'Survey (FNDDS)'];
// The commas separating the list must stay literal commas. Running the whole
// list through encodeURIComponent turns them into %2C, which FoodData Central
// reads as ONE data type named "Foundation,SR Legacy,Survey (FNDDS)" - and
// answers with a 400. Each value is encoded; the separators are not.
function fdcTypeParam(){ return FDC_TYPES.map(encodeURIComponent).join(','); }

async function fdcSearch(q, opts){
  opts = opts || {};
  const base = '/foods/search?query=' + encodeURIComponent(q) + '&pageSize=25';
  // Typing a brand should find the brand. The lab-grade rows are still first
  // for plain foods; this only adds the packaged ones when you ask for them.
  if(opts.branded){
    try{
      const d = await fdcRequest(base + '&dataType=Branded');
      return (d && d.foods) || [];
    }catch(e){ return []; }
  }
  try{
    /* requireAllWords used to be on here. It is right for "chicken breast" and
       wrong for everything else: FoodData Central files a dish under the words
       IT uses, so "nasi goreng" or "jollof rice" came back empty because no row
       contains both words in that order. The merged list is ranked by how well
       each name matches anyway, so a loose search costs nothing and finds the
       dish. */
    return (await fdcRequest(base + '&dataType=' + fdcTypeParam())).foods || [];
  }catch(e){
    // If the filter itself is what it objects to, the search is still worth
    // doing unfiltered - branded rows are dropped below anyway.
    if(!/HTTP 400/.test(e.message)) throw e;
    const d = await fdcRequest(base);
    return ((d && d.foods) || []).filter(f=>f && f.dataType !== 'Branded');
  }
}

// Picked foods are kept whole. After the first time, that food is yours: it
// searches instantly, works with no signal, and never depends on the key still
// being valid.
function fdcRemember(food){
  if(!food || !food.name) return;
  const all = fdcLoad(FDC_FOOD_K);
  all[food.name.toLowerCase()] = food;
  lsSet(FDC_FOOD_K, JSON.stringify(all));
}
function fdcSavedFoods(){ return fdcLoad(FDC_FOOD_K); }
function fdcSearchSaved(q){
  const want = String(q||'').toLowerCase().split(/[^a-z0-9]+/).filter(w=>w);
  if(!want.length) return [];
  const all = fdcSavedFoods();
  return Object.keys(all)
    .filter(n => want.every(w => n.indexOf(w) >= 0))
    .map(n => all[n])
    .slice(0, 10);
}

/* ---- filling the gaps in the built-in list ----
   794 built-in foods, of which 137 carry a micronutrient profile, and those 137
   carry 13 of the 36 nutrients. This tops them up from the same source. It only
   ever ADDS a nutrient that was missing - a figure already in the app wins,
   because it was put there deliberately.                                     */
function fdcFills(){ return fdcLoad(FDC_FILL_K); }
function fdcFillFor(name){
  const f = fdcFills()[String(name||'').toLowerCase()];
  return (f && f.micros) ? f.micros : null;
}
function fdcPutFill(name, micros, desc){
  const all = fdcFills();
  all[String(name||'').toLowerCase()] = {micros: micros, desc: desc || '', at: Date.now()};
  return lsSet(FDC_FILL_K, JSON.stringify(all));
}
// A food that was looked up and could not be matched is recorded as such, so
// the next run spends its requests on foods it has not tried yet.
// A rejection is a judgement, and judgements can be wrong. This is the way
// back: it clears only the refusals, never a figure that was accepted.
function fdcClearMisses(){
  const all = fdcFills();
  let n = 0;
  Object.keys(all).forEach(k=>{ if(all[k] && all[k].miss){ delete all[k]; n++; } });
  lsSet(FDC_FILL_K, JSON.stringify(all));
  return n;
}
function fdcMissCount(){
  return Object.keys(fdcFills()).filter(k=>fdcFills()[k] && fdcFills()[k].miss).length;
}
function fdcPutMiss(name, why){
  const all = fdcFills();
  all[String(name||'').toLowerCase()] = {miss: true, why: why || '', at: Date.now()};
  return lsSet(FDC_FILL_K, JSON.stringify(all));
}


// Error messages can carry anything; never inject them raw into innerHTML.
// Every write goes through here. An unguarded setItem throws when storage is
// full or Safari is in a restricted mode, and an uncaught throw inside a click
// handler means the meal you just logged disappears with no error at all.
let lsWarned = false;
/* v112: two counters that cached answers are checked against. dataEpoch moves
   on every write of any kind; fillEpoch moves only when something changes what
   a logged entry gets filled with. A cache that remembers the number it was
   built under can never outlive the data it was built from. */
var dataEpoch = 0, fillEpoch = 0, scoreEpoch = 0, logEpoch = 0;
// v131: moves when anything a summary is built from is written - food, ticks,
// targets, weights, water, training. Bookkeeping writes (streak, backups) do not.
const LOG_KEYS_RE = /^(calorielog:|caloriecomplete:|calorietargetsnap:|calorieweightlog|calorietarget|calorieprofile|caloriewater:|calorietrain:|coachdrinkflags|coachhydstart)/;
/* v131: writes that cannot change how a day's FOOD is scored. Anything not on
   this list (an override, a setting, a key added later) moves scoreEpoch, and
   every remembered day score is worked out again. The day's own food, target
   and profile are checked separately, by their stored text. */
const SCORE_NEUTRAL_RE = /^(caloriewater:|calorielog:|caloriecomplete:|calorietargetsnap:|calorietrain:|caloriereviews|calorielastreview|coachmonthreviews|coachlastmonthreview|coachreviewbtn|calorierecents|calorieweightlog|coachhydstart|coachdrinkflags|coachsound|coachhaptic|coachtdeelog|coachlaststreak|calorielastprompt|coachlastbackup|coachtiplog|calorieadjustlog|calorielastauto|coachadaptsnooze|coachbin|coachthumbs|coachcarry|coachgoaldate|coachdemoseed|coachcyclingretired|coachscandiag|coachproteinring|coachoffcache|coachcloud|coachdayview|coachscorefold|coachautobackup|coachfdckey|caloriesavedmeals|caloriecorrupt|coachmusesync)/; // v144: + sync state and token (they never change a score) // v141: + view, fold and backup keys (they never change a score)
function lsSet(k, v){
  dataEpoch++;
  // v145: anything COACH saves gets to Muse (a few seconds later, batched).
  try{ if(typeof museSyncSoon === 'function' && /^(coach|calorie)/.test(k) && !/^(coachmusesync|coachtrain:active|coachtrain:rest|coachoffcache|coachthumbs|coachscandiag)/.test(k)) museSyncSoon(); }catch(e){}
  if(!SCORE_NEUTRAL_RE.test(String(k))) scoreEpoch++;
  if(LOG_KEYS_RE.test(String(k))) logEpoch++;
  // A change to your foods, your label corrections or the USDA top-ups changes
  // what a logged entry gets filled with, so the remembered answers go.
  if(k === 'coachmyfoods' || k === 'coachlabels' || k === 'coachfdcfill' || k === 'coachfdcfoods'){
    fillEpoch++;
    try{ for(const x in fillSrcCache) delete fillSrcCache[x]; }catch(e){}
    try{ for(const x in gfCache) delete gfCache[x]; }catch(e){}
    try{ for(const x in extraFillCache) delete extraFillCache[x]; }catch(e){}
    try{ for(const x in richCache) delete richCache[x]; }catch(e){}
    try{ richPoolCache = null; superPool = null; }catch(e){}
  }
  try{
    CS.setItem(k, v);
    return true;
  }catch(e){
    if(!lsWarned){
      lsWarned = true;
      setTimeout(()=>alert(
        'Your device would not save that — storage is full or blocked.\n\n'+
        'Back up from settings, then clear some space. Nothing already saved has been lost.'), 50);
    }
    return false;
  }
}

function esc(x){
  return String(x==null?'':x).replace(/[&<>"']/g, c=>(
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
  ));
}

// Built-in foods that are poured rather than weighed. Curated by hand rather
// than pattern-matched: "Beef steak" contains "tea", "Ice cream" contains
// "cream", and "Smoothie bowl" is eaten with a spoon. A regex got all three
// wrong. Anything missed here is one tap to fix on the portion sheet, and that
// choice sticks.
const LIQUID_FOODS = new Set([
  "Whole milk", "Semi-skimmed milk", "Skimmed milk",
  "Oat milk", "Almond milk, unsweetened", "Soy milk, unsweetened",
  "Coconut milk, canned", "Evaporated milk", "Double cream",
  "Single cream", "Heavy cream", "Coconut cream",
  "Soup, tomato", "Soup, chicken", "Miso soup",
  "Cream of tomato soup", "Lentil soup", "Chicken noodle soup",
  "Beer, lager", "Beer, ale", "Cider",
  "Red wine", "White wine", "Vodka",
  "Gin", "Whisky", "Rum",
  "Strongbow Original, pint", "Gin and Tonic", "Espresso Martini",
  "Coca-Cola", "Diet Coke", "Coca-Cola, 330ml can",
  "Diet Coke, 330ml can", "Coke Zero, 330ml can", "Pepsi Max, 330ml can",
  "Soda, regular", "Energy drink", "Sugar-free energy drink",
  "Lucozade Energy Original, 380ml", "Red Bull, 250ml", "Red Bull Sugarfree, 250ml",
  "Monster Energy, 500ml", "Monster Ultra, 500ml", "Orange juice",
  "Apple juice", "Lemon juice", "Lime juice",
  "Coconut water", "Tropicana Orange Juice, 300ml", "Innocent Smoothie, 250ml",
  "Smoothie, fruit", "Green smoothie", "Berry protein smoothie",
  "Banana and peanut butter smoothie", "Black coffee", "Latte",
  "Cappuccino", "Tea, black", "Tea with milk",
  "Hot chocolate", "McDonald's Latte, medium", "Costa Latte, medium",
  "Costa Cappuccino, medium", "Costa Hot Chocolate, medium", "Starbucks Caffe Latte, grande",
  "Starbucks Cappuccino, grande", "Huel Ready-to-Drink", "Protein shake, ready to drink",
  "Meal replacement shake", "Protein shake with milk", "Protein shake with water",
  "Kefir", "Water", "Apple cider vinegar",
  "McDonald's Americano",
  "McDonald's Banana Milkshake Medium",
  "McDonald's Banana Milkshake Small",
  "McDonald's Cappuccino Regular",
  "McDonald's Caramel Iced Frappe Regular",
  "McDonald's Chocolate Milkshake Medium",
  "McDonald's Chocolate Milkshake Small",
  "McDonald's Coca-Cola Medium",
  "McDonald's Coca-Cola Small",
  "McDonald's Coca-Cola Zero Sugar Medium",
  "McDonald's Coca-Cola Zero Sugar Small",
  "McDonald's Double Espresso",
  "McDonald's Espresso Single",
  "McDonald's Fanta Orange Zero - Regular",
  "McDonald's Fanta Orange Zero - Small",
  "McDonald's Flat White",
  "McDonald's Green Apple X Sprite",
  "McDonald's Guava x Sprite Zero",
  "McDonald's Hot Chocolate Regular",
  "McDonald's Irn Bru Medium",
  "McDonald's Irn Bru Small",
  "McDonald's Mango & Pineapple Iced Fruit Smoothie Regular",
  "McDonald's Oasis Zero Summer Fruits - Regular",
  "McDonald's Oasis Zero Summer Fruits - Small",
  "McDonald's Organic Milk",
  "McDonald's Robinsons Fruit Shoot",
  "McDonald's Semi Skimmed Milk - 250ml",
  "McDonald's Strawberry Milkshake Medium",
  "McDonald's Strawberry Milkshake Small",
  "McDonald's Tea (Regular)",
  "McDonald's Tropicana Apple Juice",
  "McDonald's Tropicana Orange Juice",
  "McDonald's Vanilla Milkshake Medium",
  "McDonald's Vanilla Milkshake Small",
  "McDonald's White Coffee Regular",
  "McDonald's Americano Large",
  "McDonald's Banana Flavour Milk",
  "McDonald's Banana Milkshake Large",
  "McDonald's Belgian Chocolate and Vanilla Iced Frappe Large",
  "McDonald's Belgian Chocolate and Vanilla Iced Frappe Regular",
  "McDonald's Berry Burst Iced Fruit Smoothie Large",
  "McDonald's Berry Burst Iced Fruit Smoothie Regular",
  "McDonald's Biscoff Frapp\u00e9 - large",
  "McDonald's Biscoff Frapp\u00e9 - regular",
  "McDonald's Cappuccino - Large",
  "McDonald's Caramel Iced Frappe Large",
  "McDonald's Caramel Iced Latte",
  "McDonald's Caramel Waffle Latte - Large",
  "McDonald's Caramel Waffle Latte - Regular",
  "McDonald's Cherry Kiss X Sprite",
  "McDonald's Choco Fudge Latte Large",
  "McDonald's Choco Fudge Latte Regular",
  "McDonald's Chocolate Flavour Milk",
  "McDonald's Chocolate Honeycomb Frappe Large",
  "McDonald's Chocolate Honeycomb Frappe Regular",
  "McDonald's Chocolate Milkshake Large",
  "McDonald's Coca-Cola Large",
  "McDonald's Coca-Cola Zero Sugar Large",
  "McDonald's Coconut Hot Chocolate",
  "McDonald's Coconut latte - Large",
  "McDonald's Coconut latte - Regular",
  "McDonald's Donut Latte - Large",
  "McDonald's Donut Latte - Regular",
  "McDonald's Espresso Milkshake",
  "McDonald's Fanta No Added Sugar - Large",
  "McDonald's Fanta No Added Sugar - Medium",
  "McDonald's Fanta No Added Sugar - Small",
  "McDonald's Fanta Orange Large",
  "McDonald's Fanta Orange Zero - Large",
  "McDonald's Galaxy Caramel Hot Chocolate",
  "McDonald's Galaxy Caramel Latte - Large",
  "McDonald's Galaxy Caramel Latte - Regular",
  "McDonald's Grimace Shake Large",
  "McDonald's Grimace Shake Medium",
  "McDonald's Grinch Frozen Lemonade - Large",
  "McDonald's Grinch Frozen Lemonade - Regular",
  "McDonald's Honeycomb Latte - Large",
  "McDonald's Honeycomb Latte - Regular",
  "McDonald's Hot Chocolate Deluxe",
  "McDonald's Hot Chocolate Large",
  "McDonald's Hot Cross Bun Latte - Large",
  "McDonald's Hot Cross Bun Latte - Regular",
  "McDonald's Iced Latte - Large",
  "McDonald's Iced Latte - Regular",
  "McDonald's Irn Bru (New Recipe) - Small",
  "McDonald's Large Frozen Cherry Lemonade",
  "McDonald's Large Spanish Fruit Punch",
  "McDonald's Large Vanilla Matcha Frapp\u00e9",
  "McDonald's Latte - Large",
  "McDonald's Mango & Pineapple Iced Fruit Smoothie Large",
  "McDonald's Mango Passionfruit X Sprite",
  "McDonald's Millionaire's Iced Frapp\u00e9 - large",
  "McDonald's Millionaire's Iced Frapp\u00e9 - regular",
  "McDonald's Millionaire's Latte Large",
  "McDonald's Millionaire's Latte Regular",
  "McDonald's Mini Eggs Frappe",
  "McDonald's Mint Choc Chip Iced Frapp\u00e9 - large",
  "McDonald's Mint Choc Chip Iced Frapp\u00e9 - regular",
  "McDonald's Oasis - Small",
  "McDonald's Oasis Large",
  "McDonald's Oasis Medium",
  "McDonald's Oasis Zero - Large",
  "McDonald's Oreo Frapp\u00e9 - Large",
  "McDonald's Oreo Frapp\u00e9 - Regular",
  "McDonald's Pink Dragonfruit X Sprite",
  "McDonald's Raspberry Ripple Iced Cooler Large",
  "McDonald's Raspberry Ripple Iced Cooler Regular",
  "McDonald's Red Bull Blueberry Boost Energiser",
  "McDonald's Red Bull Energy Drink - 250ml",
  "McDonald's Red Bull Green Apple Energiser",
  "McDonald's Regular Frozen Cherry Lemonade",
  "McDonald's Regular Mini Eggs Frappe",
  "McDonald's Regular Vanilla Matcha Frapp\u00e9",
  "McDonald's Sakura x Sprite",
  "McDonald's Salted Caramel Latte - Large",
  "McDonald's Salted Caramel Latte - Regular",
  "McDonald's Shamrock Shake - Large",
  "McDonald's Shamrock Shake - Medium",
  "McDonald's Shamrock Shake - Small",
  "McDonald's Spanish Fruit Punch - regular",
  "McDonald's Strawberry & Banana Iced Fruit Smoothie - large",
  "McDonald's Strawberry Candyfloss Frappe - Large",
  "McDonald's Strawberry Candyfloss Frappe - Regular",
  "McDonald's Strawberry Milkshake Large",
  "McDonald's Strawberry Watermelon Refresher",
  "McDonald's Strawberry and Vanilla Cream Iced Frappe Large",
  "McDonald's Strawberry and Vanilla Cream Iced Frappe Regular",
  "McDonald's Tea (Large)",
  "McDonald's Toasted Marshmallow Hot Chocolate",
  "McDonald's Toasted Marshmallow Latte - Large",
  "McDonald's Toasted Marshmallow Latte - Regular",
  "McDonald's Toffee Latte - Large",
  "McDonald's Toffee Latte - Regular",
  "McDonald's Tropic Pineapple Refresher",
  "McDonald's Twix Latte - Large",
  "McDonald's Twix Latte - Regular",
  "McDonald's Vanilla Milkshake Large",
  "McDonald's White Coffee - Large",
  "Greggs Regular Americano",
  "Greggs Large Americano",
  "Greggs Regular Cappuccino",
  "Greggs Large Cappuccino",
  "Greggs Regular Caramel Latte",
  "Greggs Large Caramel Latte",
  "Greggs Large Mocha",
  "Greggs Regular White Coffee",
  "Greggs Large White Coffee",
  "Greggs Flat White",
  "Greggs Regular Green Tea",
  "Greggs Small Orange Juice",
  "Greggs Large Orange Juice",
  "Greggs Fairtrade Apple Juice",
  "Greggs Large Still Water",
  "Greggs Sparkling Raspberry Lemonade"
]);

// Label figures you have typed in from a packet, keyed by food name. This is
// how the built-in table fills its gaps: 30 seconds, once, for a food you
// actually eat, and it scores for ever after. Nothing is estimated.
// Reference label figures per 100 g for the built-in foods: sugars, saturated
// fat, fibre, sodium in mg. Together with the macros already in the table this
// is everything a Nutri-Score needs, which is what turns "no score yet" into a
// grade for most of the list. null means the figure was never published, and
// the scoring code treats that as unknown rather than as zero.
//
// Three rules decided what went in.
//
// GENERIC FOODS are in, because composition is a property of the food. A banana
// is a banana.
//
// TAKEAWAY FOOD is in, from the chain's own published nutrition panel, because
// a Big Mac has no barcode and never will - leaving it to a scan would have
// meant leaving it unscored for ever. Those panels are published per serving
// and none of them print a portion weight, so the weight is DERIVED from the
// calories COACH already held, and then TESTED: the published protein, carbs
// and fat, put through that same derived weight, have to land on the protein,
// carbs and fat COACH already held. Rows where they did not are rejected
// outright rather than reconciled - see tools/restaurant.py. Nine were.
//
// PACKAGED PRODUCTS WITH A BARCODE are still out. Those are somebody's recipe,
// they change without notice, and one scan reads the real label off the packet
// and remembers it. A guess from me would be worse than the scan.
//
// Salt and baking powder are out as well: a health grade for them would be
// meaningless. Every row survived tools/checkfood.py - sugar cannot exceed
// carbohydrate, saturated cannot exceed total fat, fibre cannot exceed
// carbohydrate, and the macros have to add up to the stated calories.
const LABEL_DB = JSON.parse(coachData("LABEL_DB"));
function labelDbFor(name){
  const r = LABEL_DB[name];
  return r ? {sug:r[0], sat:r[1], fib:r[2], sod:r[3]} : null;
}

const LABELS_KEY = 'coachlabels';
function loadLabels(){ try{ return JSON.parse(CS.getItem(LABELS_KEY)) || {}; }catch(e){ return {}; } }
function labelFor(name){ return loadLabels()[String(name||'').toLowerCase()] || null; }
function saveLabel(name, vals){
  const all = loadLabels();
  const key = String(name||'').toLowerCase();
  // Merged, not replaced: the four boxes on the label sheet must not wipe the
  // nutrients you typed in by hand on the other sheet, and vice versa.
  all[key] = Object.assign({}, all[key] || {}, vals);
  return lsSet(LABELS_KEY, JSON.stringify(all));
}
function applyLabel(food){
  if(!food) return food;
  const L = labelFor(food.name);
  if(!L) return food;
  const out = Object.assign({}, food);
  /* v110: calories, protein, carbs and fat typed on the nutrient sheet. The
     figures the food came with are kept beside them, so clearing what you
     typed puts the originals back rather than leaving your number behind. */
  if((L.mac && typeof L.mac === 'object') || out._mac0){
    const base = out._mac0 || {kcal100: out.kcal100, p100: out.p100, c100: out.c100, f100: out.f100};
    Object.assign(out, base);
    const mc = (L.mac && typeof L.mac === 'object') ? L.mac : null;
    if(mc){
      out._mac0 = base;
      if(mc.kcal != null) out.kcal100 = mc.kcal;
      if(mc.p != null) out.p100 = mc.p;
      if(mc.c != null) out.c100 = mc.c;
      if(mc.f != null) out.f100 = mc.f;
    } else delete out._mac0;
  }
  if(L.sug != null) out.sug100 = L.sug;
  if(L.sat != null) out.sat100 = L.sat;
  if(L.sod != null){ out.micros100 = Object.assign({}, out.micros100||{}, {sodium: L.sod}); }
  if(L.fib != null){ out.micros100 = Object.assign({}, out.micros100||{}, {fiber: L.fib}); }
  /* v90: numbers looked up from the food databases for THIS product. They sit
     below anything COACH already had and below anything you typed, and only
     ever land where there was a blank - so looking a food up can add to it but
     can never quietly change a figure you put there yourself. They are kept in
     the same record as the rest of the label, which the backup already
     covers. */
  if(L.web && L.web.micros && !out.perItem){
    const wm = Object.assign({}, out.micros100 || {});
    for(const k in L.web.micros){
      if(wm[k] == null && L.web.micros[k] != null) wm[k] = L.web.micros[k];
    }
    out.micros100 = wm;
    if(out.sug100 == null && L.web.sug != null) out.sug100 = L.web.sug;
    if(out.sat100 == null && L.web.sat != null) out.sat100 = L.web.sat;
  }
  // Anything you typed in by hand. Yours beats every database, including a
  // scanned label, because you are the one holding the packet.
  if(L.micros && typeof L.micros === 'object'){
    const m = Object.assign({}, out.micros100 || {});
    for(const k in L.micros){ if(L.micros[k] != null) m[k] = L.micros[k]; }
    out.micros100 = m;
  }
  /* Your own serving. USDA will tell you a cup of something weighs 158 g and
     CoFID will not tell you anything at all, but you know your scoop is 30 g
     and your bowl is the one in your cupboard. Once set, the food counts in
     YOUR measure everywhere it appears. */
  if(L.serve && L.serve.g > 0 && !out.perItem){
    out.unitName = L.serve.n || 'serving';
    out.unitGrams = L.serve.g;
    out.startAmount = L.serve.g;
    out.myServe = true;
  }
  return out;
}

function myServing(name){
  const L = labelFor(name);
  return (L && L.serve && L.serve.g > 0) ? L.serve : null;
}
function setMyServing(name, unit, grams){
  const g = Number(grams) || 0;
  if(!(g > 0)) return false;
  const n = String(unit || '').trim().toLowerCase().replace(/[^a-z0-9 -]/g, '').slice(0, 18);
  saveLabel(name, {serve: {n: n || 'serving', g: Math.round(g * 10) / 10}});
  return true;
}
function clearMyServing(name){ saveLabel(name, {serve: null}); }

/* ---- filling in a nutrient by hand ----
   Every other route into the nutrient panel is a database: COACH's own list,
   the UK and Australian tables, USDA, a scanned barcode. This is the one route
   that is just you, reading a packet or a lab result. It wins over all of them
   and it is remembered against the food's name, so it applies every time that
   food is logged again - past days included, because the log fills itself in
   when it is read.                                                           */
/* The processing group, in words, and how to argue with it. Note 3 in his own
   list: "the score said ultra-processed, I want to know how it decided". So
   the panel prints the reason and this is the answer button.                 */
const NOVA_NAME = {1:'whole food', 2:'cooking ingredient', 3:'processed', 4:'ultra-processed'};
const NOVA_EG = {
  1:'Food as it comes: fruit, veg, meat, fish, eggs, milk, plain grains.',
  2:'Things you cook WITH rather than eat alone: oil, butter, sugar, salt, flour.',
  3:'A whole food preserved or changed simply: bread, cheese, tinned beans, bacon, beer.',
  4:'Built in a factory from ingredients you would not have at home: sweets, crisps, most cereals, soft drinks, protein bars.'
};
let novaFood = null, novaThen = null;
function openNovaSheet(food, then){
  if(!food) return;
  novaFood = food; novaThen = then || null;
  const r = novaFor(food);
  document.getElementById('nova-title').textContent = food.name;
  document.getElementById('nova-sub').innerHTML =
    'COACH calls this <b>' + esc(NOVA_NAME[r.g]) + '</b> because ' + esc(r.why) + '.' +
    (r.src === 'yours' ? '' : ' Processing costs an ultra-processed food a quarter of its score, so it is worth getting right.');
  document.getElementById('nova-body').innerHTML = [1,2,3,4].map(g=>
    '<button class="nova-opt'+(r.g === g ? ' on' : '')+'" data-nova="'+g+'">'+
    '<span class="nv-t">'+esc(NOVA_NAME[g])+'</span><span class="nv-s">'+esc(NOVA_EG[g])+'</span></button>').join('');
  document.getElementById('nova-body').querySelectorAll('[data-nova]').forEach(b=>{
    b.onclick = ()=>{
      const L = labelFor(novaFood.name) || {};
      saveLabel(novaFood.name, {nova: Number(b.dataset.nova)});
      buzz();
      closeSheet('nova-backdrop');
      if(novaThen) novaThen();
      renderDay();
    };
  });
  openSheet('nova-backdrop');
}

