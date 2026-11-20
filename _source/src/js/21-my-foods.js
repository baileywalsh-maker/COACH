// ---- My Foods ----
// Open Food Facts is a volunteer barcode database. It is missing plenty of real
// products, and it always will be. The fix is not a bigger built-in list, it is
// memory: a food that COACH could not find, once you have told it the numbers
// ONCE, is yours permanently — searched before the network, keyed by barcode
// when there is one, and carried in the JSON backup.
//
// The 'coach' prefix is deliberate: exportJSON() enumerates every key starting
// 'calorie' or 'coach', so the library is backed up and restored with no extra
// wiring. Do not rename it to something outside those two prefixes.
const MYFOODS_KEY = 'coachmyfoods';
const MYFOODS_MAX = 500;

function loadMyFoods(){
  try{
    const v = JSON.parse(CS.getItem(MYFOODS_KEY));
    return Array.isArray(v) ? v : [];
  }catch(e){ return []; }
}
function saveMyFoods(list){ return lsSet(MYFOODS_KEY, JSON.stringify(list)); }

// Identity is the barcode when one is known, otherwise the normalised name.
// Without this, scanning the same pack twice made a second copy.
function myFoodKey(f){
  const code = f && f.code ? String(f.code).trim() : '';
  return code ? ('c:' + code) : ('n:' + normalise(String((f && f.name) || '')));
}

// A key that is absent means "leave what is stored alone". A key passed as null
// means "clear it". Without that distinction, correcting the calories on a saved
// food wiped its serving size and micronutrients as a side effect.
//
// Shared by rememberFood (which finds the record by barcode or name) and
// updateMyFoodById (which finds it by id, so a rename is just a rename).
function applyFoodFields(rec, food, kcal){
  if(typeof gfOwn === 'function') food = gfOwn(food);
  const given = k => Object.prototype.hasOwnProperty.call(food, k);
  rec.name    = String(food.name);
  rec.kcal100 = kcal;
  if(given('p100'))      rec.p100      = Number(food.p100) || 0;
  if(given('c100'))      rec.c100      = Number(food.c100) || 0;
  if(given('f100'))      rec.f100      = Number(food.f100) || 0;
  if(given('sug100'))    rec.sug100    = food.sug100 === null ? null : (Number(food.sug100) || 0);
  // null, not 0: "not measured" and "measured as zero" score differently and
  // the difference is the whole point.
  if(given('sat100'))    rec.sat100    = food.sat100 === null ? null : (Number(food.sat100) || 0);
  if(given('fv100'))     rec.fv100     = food.fv100  === null ? null : (Number(food.fv100)  || 0);
  if(given('micros100')) rec.micros100 = food.micros100 || {};
  if(given('novaOverride')) rec.novaOverride = food.novaOverride || null;
  if(given('additives')) rec.additives = Array.isArray(food.additives) ? food.additives : null;
  if(given('unitName'))  rec.unitName  = food.unitName || null;
  if(given('unitGrams')) rec.unitGrams = Number(food.unitGrams) || null;
  if(given('basis')) rec.basis = food.basis === 'ml' ? 'ml' : 'g';
  // Remembered so the second scan of the same pack opens on the same amount
  // without another lookup.
  if(given('startAmount')) rec.startAmount = Number(food.startAmount) || null;
  if(given('brand')) rec.brand = food.brand ? String(food.brand).trim().slice(0, 40) : null;
  // Defaults for a brand-new record, so a partial first save is still complete.
  if(rec.p100      == null) rec.p100      = 0;
  if(rec.c100      == null) rec.c100      = 0;
  if(rec.f100      == null) rec.f100      = 0;
  if(rec.micros100 == null) rec.micros100 = {};
  if(rec.unitName  === undefined) rec.unitName  = null;
  if(rec.unitGrams === undefined) rec.unitGrams = null;
  if(rec.basis === undefined) rec.basis = 'g';
  if(rec.startAmount === undefined) rec.startAmount = null;
  if(food.code) rec.code = String(food.code).trim();
  return rec;
}

// Marks a saved food as standing in for a built-in one. Deliberately not routed
// through updateMyFoodById: that goes via applyFoodFields, which expects a whole
// food and would overwrite the name with "undefined" if handed one field.
function markOverride(id, builtInName){
  const list = loadMyFoods();
  for(const x of list){
    if(x.id === id){ x.overrides = String(builtInName); saveMyFoods(list); return x; }
  }
  return null;
}

// Edit an existing record IN PLACE, found by its id. rememberFood() cannot do
// this: it looks the record up by barcode or by normalised name, so renaming a
// food through it produced a second copy and left the original behind.
function updateMyFoodById(id, food){
  const list = loadMyFoods();
  let rec = null;
  for(const x of list){ if(x.id === id){ rec = x; break; } }
  if(!rec) return null;
  const kcal = Number(food.kcal100);
  if(!isFinite(kcal) || kcal < 0) return null;
  applyFoodFields(rec, food, kcal);
  rec.last = todayYMD();
  saveMyFoods(list);
  return rec;
}

// Nothing edible is denser than about 900 kcal per 100 g — that is pure fat.
// Anything above it is an entry mistake, most likely a portion typed as 1 when
// it meant one serving, which stores the food a hundred times too dense.
const KCAL_PER_100_MAX = 900;
// What a saved food still needs before it can be scored, and how badly. Used
// by the list marker and the review prompt, so both say the same thing.
function scoreGapFor(food){
  const sc = foodScores(food);
  if(!sc) return null;
  if(sc.health !== null) return null;                       // fully scored
  return { range: sc.range || null, missing: sc.missing || [] };
}

function foodLooksWrong(f){
  const k = Number(f && f.kcal100);
  if(!isFinite(k) || k <= 0) return 'no calories recorded';
  if(k > KCAL_PER_100_MAX) return 'check this — '+fmt0(k)+' kcal per 100'+((f.basis==='ml')?'ml':'g');
  return null;
}

// Remember a food, or update the one already stored under the same key.
// opts.silent -> do not count this as a use (used when editing, not logging).
function rememberFood(food, opts){
  opts = opts || {};
  if(!food || !food.name) return null;
  const kcal = Number(food.kcal100);
  if(!isFinite(kcal) || kcal < 0) return null;

  const list = loadMyFoods();
  const key = myFoodKey(food);
  const today = todayYMD();
  let rec = null;
  for(const x of list){ if(myFoodKey(x) === key){ rec = x; break; } }
  if(!rec){
    rec = {
      id: 'mf' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      added: today, uses: 0
    };
    list.push(rec);
  }
  applyFoodFields(rec, food, kcal);
  rec.last = today;
  if(!opts.silent) rec.uses = (rec.uses || 0) + 1;

  // Bounded so the library can never grow until storage refuses a write.
  // Least recently used goes first; a tie breaks on how often it was logged.
  if(list.length > MYFOODS_MAX){
    list.sort((a, b) =>
      String(b.last || '').localeCompare(String(a.last || '')) ||
      (Number(b.uses) || 0) - (Number(a.uses) || 0));
    list.length = MYFOODS_MAX;
  }
  saveMyFoods(list);
  return rec;
}

function deleteMyFood(id){
  saveMyFoods(loadMyFoods().filter(f => f.id !== id));
}

function myFoodById(id){
  for(const f of loadMyFoods()) if(f.id === id) return f;
  return null;
}

function myFoodByCode(code){
  const c = String(code == null ? '' : code).trim();
  if(!c) return null;
  for(const f of loadMyFoods()) if(String(f.code || '') === c) return f;
  return null;
}

// Presented in the same array shape as LOCAL_FOODS so the existing ranking,
// synonym and single-typo tolerance all apply to your own foods unchanged.
