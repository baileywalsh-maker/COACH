/* ============================================================
   What you actually eat.

   Every tracker with a database worth using leans on the same fact: a person
   eats about forty things, over and over. COACH already had a Recent strip of
   the last ten, which is not the same thing - it forgets the porridge you have
   every weekday the moment you eat ten other things, and it cannot be searched
   at all.

   This reads the day logs that are already there. Nothing new is stored, no
   new key, no migration - which also means it works on the history you already
   have, from the first launch.
   ============================================================ */
const HIST_DAYS = 120;
let histCache = null, histCacheAt = 0, histCacheDay = '';

function eatenHistory(){
  const today = todayYMD();
  // Cheap to build, but not on every keystroke.
  if(histCache && histCacheDay === today && (Date.now() - histCacheAt) < 20000) return histCache;
  const end = new Date(); end.setHours(0,0,0,0);
  const by = {};
  for(let i = 0; i < HIST_DAYS; i++){
    const d = addDays(end, -i);
    let es = [];
    try{ es = loadEntries(d); }catch(e){ es = []; }
    for(const e of es){
      if(!e || !e.name || e.supp) continue;
      // v113: the same name from two brands is two foods.
      const k = String(e.name).toLowerCase() + '|' + String(e.brand || '').toLowerCase();
      let rec = by[k];
      if(!rec){
        // The first one seen is the most recent, because this walks backwards.
        rec = by[k] = {name: e.name, n: 0, daysAgo: i, last: e, meals: {}};
      }
      rec.n++;
      const m = e.meal || 'Snack';
      rec.meals[m] = (rec.meals[m] || 0) + 1;
    }
  }
  const out = Object.keys(by).map(k=>{
    const r = by[k];
    // Which meal you usually have it at, so re-adding it lands in the right place.
    r.usualMeal = Object.keys(r.meals).sort((a,b)=>r.meals[b] - r.meals[a])[0] || null;
    /* Times eaten is the signal; recency breaks the tie. A thing eaten 40
       times and not for two months should still rank below one eaten 30 times
       and twice this week, which is what the decay does. */
    r.rank = r.n * (1 + 2 / (1 + r.daysAgo / 14));
    return r;
  });
  out.sort((a,b)=>b.rank - a.rank || a.daysAgo - b.daysAgo);
  histCache = out; histCacheAt = Date.now(); histCacheDay = today;
  return out;
}

// The same row shape My Foods uses, so the same matcher - and the same typo
// tolerance - applies to your own history for free.
function historyAsRows(){
  return eatenHistory().map(r=>{
    const e = r.last;
    const g = Number(e.grams) || 0;
    const per = g > 0 ? 100 / g : 0;
    const row = [r.name,
      per ? (Number(e.kcal) || 0) * per : 0,
      per ? (Number(e.protein) || 0) * per : 0,
      per ? (Number(e.carbs) || 0) * per : 0,
      per ? (Number(e.fat) || 0) * per : 0,
      e.unit || null, (e.unit && e.qty) ? g / e.qty : null, '',
      entryBasis(e) === 'ml' ? 'ml' : 'g'];
    row.hist = r;
    return row;
  });
}


// One tap puts it back exactly as you had it, at the meal you usually have it.
function addFromHistory(r, meal){
  const e = Object.assign({}, r.last);
  delete e.plate; delete e.plateName;
  e.meal = meal || selectedMeal || r.usualMeal || 'Snack';
  addEntry(e);
}

function myFoodsAsRows(){
  return loadMyFoods().map(f => {
    const row = [f.name, Number(f.kcal100) || 0, Number(f.p100) || 0,
                 Number(f.c100) || 0, Number(f.f100) || 0,
                 f.unitName || null, f.unitGrams || null, f.code ? String(f.code) : '',
                 f.basis === 'ml' ? 'ml' : 'g'];
    row.mf = f;
    return row;
  });
}

// Packet figures you typed in are stored against the food's NAME, separately
// from the food itself, and applied at score time - the same way a built-in
// food picks its own up through localToFood. Without the applyLabel here,
// filling in the figures for a food you added by hand wrote them somewhere
// nothing ever read: the food stayed unscored and the prompt never went away.
function myFoodToFood(f){ return gapFillFood(applyLabel(myFoodRecordToFood(f))); }

function myFoodRecordToFood(f){
  return {
    name: f.name, kcal100: Number(f.kcal100) || 0,
    p100: Number(f.p100) || 0, c100: Number(f.c100) || 0, f100: Number(f.f100) || 0,
    sug100: (f.sug100 === undefined || f.sug100 === null) ? null : Number(f.sug100),
    sat100: (f.sat100 === undefined || f.sat100 === null) ? null : Number(f.sat100),
    fv100:  (f.fv100  === undefined || f.fv100  === null) ? null : Number(f.fv100),
    micros100: f.micros100 || {},
    novaOverride: f.novaOverride || undefined,
    additives: Array.isArray(f.additives) ? f.additives : null,
    unitName: f.unitName || null, unitGrams: f.unitGrams || null,
    basis: f.basis === 'ml' ? 'ml' : 'g',
    startAmount: Number(f.startAmount) || null,
    brand: f.brand || null,
    code: f.code || null, src: 'mine'
  };
}


function searchMyFoods(q){ return searchLocal(q, myFoodsAsRows()); }

// Built-in foods you have corrected. Your copy stands in for the original so
// the search shows one row, not your version above a stale one. This is derived
// from your saved foods rather than kept as a second list, so deleting the copy
// brings the built-in straight back with nothing left to tidy up.
function overriddenLocals(){
  const s = new Set();
  for(const f of loadMyFoods()) if(f.overrides) s.add(String(f.overrides));
  return s;
}
// f[7] is the search-alias string and is never shown or used as data.

// The pill. `null` is a real answer and gets its own quiet form rather than a
// number the app has made up.
function scorePill(v){
  if(v === null || v === undefined) return '<span class="spill none">no data</span>';
  const b = scoreBand(v);
  return '<span class="spill '+b.cls+'"><span class="sd"></span>'+
         '<span class="sn">'+v+'</span> '+b.word+'</span>';
}
/* ---- a picture of the thing, and a way to go and look at it ----

   Open Food Facts photographs what its volunteers scan, so anything with a
   barcode can carry its own front-of-pack shot. COACH's own 800 foods are
   generic - there is no one photograph of "digestive biscuit" - so for those
   it asks Open Food Facts for the most-scanned product of that name and uses
   that picture, cached so it is asked once ever.

   Everything here degrades to nothing: no signal, no picture, same list. */
const THUMB_KEY = 'coachthumbs';
const THUMB_MAX = 400;
let thumbMem = null;
function thumbStore(){
  if(thumbMem) return thumbMem;
  try{ thumbMem = JSON.parse(CS.getItem(THUMB_KEY)) || {}; }catch(e){ thumbMem = {}; }
  return thumbMem;
}
function thumbKey(name){ return String(name || '').toLowerCase().trim().slice(0, 60); }
function thumbGet(name){
  const v = thumbStore()[thumbKey(name)];
  // '' is a real answer - "asked, nothing there" - and stops it asking again.
  return (v === undefined) ? undefined : (v || null);
}
function thumbPut(name, url){
  const all = thumbStore();
  all[thumbKey(name)] = url || '';
  const keys = Object.keys(all);
  if(keys.length > THUMB_MAX) keys.slice(0, keys.length - THUMB_MAX).forEach(k=>{ delete all[k]; });
  try{ lsSet(THUMB_KEY, JSON.stringify(all)); }catch(e){}
}

function offImageOf(p){
  if(!p) return null;
  return p.image_front_small_url || p.image_front_thumb_url || p.image_small_url ||
         p.image_thumb_url || p.image_front_url || p.image_url || null;
}

// What a food already knows about its own picture, with no request at all.
function foodThumb(food){
  if(!food) return null;
  if(food.image) return food.image;
  const cached = thumbGet(food.name);
  return cached || null;
}

/* Somewhere to go and look at it. A barcode goes straight to that product;
   anything else goes to a search for the name, which is the honest link for a
   food that is not one particular packet. */
function foodLink(food){
  if(!food) return null;
  if(food.code) return 'https://world.openfoodfacts.org/product/' + encodeURIComponent(food.code);
  if(!food.name) return null;
  return 'https://world.openfoodfacts.org/cgi/search.pl?search_terms=' +
         encodeURIComponent(food.name) + '&search_simple=1&action=process';
}

/* Fetch a picture for a food that has none. Only ever called for the handful of
   rows on screen, only once per name, and it never blocks anything. */
async function thumbFetch(name){
  if(thumbGet(name) !== undefined) return thumbGet(name);
  let url = null;
  try{
    const hits = await offSearch(String(name).slice(0, 60));
    for(const p of (hits || [])){
      const img = offImageOf(p);
      if(img){ url = img; break; }
    }
  }catch(e){ return undefined; }        // no signal: ask again another day
  thumbPut(name, url);
  return url;
}


/* An empty search box used to be an empty screen. Since a person eats about
   forty things, the most useful thing to show before a single letter is typed
   is those forty - most-eaten first, one tap to log again at the amount you
   had last time. */
function renderUsuals(){
  const box = document.getElementById('search-results');
  if(!box) return;
  const all = eatenHistory();
  if(!all.length){
    box.innerHTML = '<div class="sr-note">Nothing logged yet. Search for a food, or scan a packet '+
      'and it will be waiting here next time.</div>';
    return;
  }
  const top = all.slice(0, 12).map(r=>{
    let food = null;
    try{ food = per100From(r.last); }catch(e){ food = null; }
    const e = r.last;
    const g = Number(e.grams) || 0;
    return {name: r.name, food: food, kcal: Number(e.kcal) || 0, kcalUnit: 'as logged',
      tag: foodKind(food, r.name),
      sub: [(e.perItem && e.qty && e.unit) ? round2(e.qty) + ' ' + pluralUnit(e.unit, e.qty) : gramsText(e, g),
                     r.n > 1 ? r.n + ' times' : 'once',
                     r.daysAgo === 0 ? 'today' : r.daysAgo === 1 ? 'yesterday' : r.daysAgo + ' days ago'
                    ].filter(x=>x).join(' \u00b7 '),
      onAdd: ()=> openFromHistory(r, selectedMeal)};
  });
  box.innerHTML = '<div class="sr-head">Your usuals<span style="text-transform:none; letter-spacing:0;">'+
    'most eaten first</span></div>' + top.map((c, i)=>srRowHTML(c, i)).join('');
  box.querySelectorAll('.sr-row').forEach(btn=>{
    const c = top[Number(btn.dataset.r)];
    if(c && c.onAdd) btn.onclick = c.onAdd;
  });
  srFillThumbs('search-results', top);
}

