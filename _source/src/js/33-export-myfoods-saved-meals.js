// ---- Export ----
function exportCSV(){
  const rows = [['date','meal','food','qty','unit','amount','measure','kcal','protein_g','carbs_g','fat_g']];
  const keys = CS.keys().filter(k=>k.startsWith(STORE_KEY_PREFIX)).sort();
  keys.forEach(k=>{
    const date = k.replace(STORE_KEY_PREFIX,'');
    let es = [];
    try{ es = JSON.parse(CS.getItem(k))||[]; }catch(e){}
    es.forEach(e=>rows.push([date, e.meal||'', '"'+String(e.name).replace(/"/g,'""')+'"', e.qty||'', e.unit||'', e.grams||'', entryBasis(e), e.kcal, e.protein||0, e.carbs||0, e.fat||0]));
  });
  const wl = loadWeightLog();
  rows.push([]); rows.push(['date','weight_kg']);
  wl.forEach(w=>rows.push([w.date, w.kg]));
  const csv = rows.map(r=>r.join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'calorie-log-'+todayYMD()+'.csv';
  a.click();
}

// ---- My Foods: management ----
function renderMyFoodsCount(){
  const el = document.getElementById('myfoods-count');
  if(el) el.textContent = loadMyFoods().length;
}

function renderMyFoodsList(filter){
  const box = document.getElementById('myfoods-list');
  if(!box) return;
  const q = String(filter||'').trim();
  let list = loadMyFoods();
  // Most recently used first — the ones you are most likely to want.
  list.sort((a,b)=> String(b.last||'').localeCompare(String(a.last||'')) ||
                    (Number(b.uses)||0)-(Number(a.uses)||0));
  if(q){
    const rows = searchMyFoods(q);
    const keep = new Set(rows.map(r=>r.mf.id));
    list = list.filter(f=>keep.has(f.id));
  }

  if(!list.length){
    box.innerHTML = (q
      ? '<div class="estate"><i class="ti ti-search" aria-hidden="true"></i><div class="et">Nothing matches that</div><div class="es">Try fewer letters, or scan the barcode instead.</div></div>'
      : '<div class="estate"><i class="ti ti-bookmark" aria-hidden="true"></i><div class="et">Nothing saved yet</div><div class="es">Foods you scan or log show up here.</div></div>');
    return;
  }

  // Anything obviously wrong goes to the top. A food stored a hundred times
  // too dense is not something to hunt for in an alphabetical list.
  list.sort((a,b)=> (foodLooksWrong(b)?1:0) - (foodLooksWrong(a)?1:0));

  box.innerHTML = list.map(f=>{
    const u = f.basis === 'ml' ? 'ml' : 'g';
    const per = isCountable(f)
      ? ' &middot; '+Math.round(f.kcal100*f.unitGrams/100)+' kcal per '+esc(f.unitName) : '';
    const code = f.code ? ' &middot; '+esc(f.code) : '';
    const wrong = foodLooksWrong(f);
    // A standing marker rather than a popup: the food is usable as it is, it
    // just cannot be scored, and you fix it when you happen to have the packet.
    const gap = scoreGapFor(myFoodToFood(f));
    const gapLine = gap
      ? '<button class="mf-gap" data-fig="'+esc(f.id)+'">'+
        (gap.range ? 'Scores somewhere in '+gap.range.lo+'\u2013'+gap.range.hi
                   : 'No health score')+
        ' \u2014 add '+esc(andList(gap.missing))+'</button>'
      : '';
    return '<div class="mf-row"><div><div class="n">'+esc(f.name)+'</div>'+
      '<div class="k">'+Math.round(f.kcal100)+' kcal / 100'+u+per+code+'</div>'+
      (wrong ? '<div class="warn">'+esc(wrong)+'</div>' : '')+gapLine+'</div>'+
      '<div class="mf-acts"><button data-log="'+esc(f.id)+'">Log</button>'+
      '<button data-edit="'+esc(f.id)+'">Edit</button>'+
      '<button data-del="'+esc(f.id)+'" aria-label="Delete"><i class="ti ti-trash" aria-hidden="true"></i></button>'+
      '</div></div>';
  }).join('');

  box.querySelectorAll('[data-log]').forEach(b=>{
    b.onclick = ()=>{
      const f = myFoodById(b.dataset.log);
      if(!f) return;
      closeSheet('myfoods-backdrop');
      selectMeal(guessMeal());
      openPortion(myFoodToFood(f));
    };
  });
  box.querySelectorAll('[data-edit]').forEach(b=>{
    b.onclick = ()=>{ openFoodEdit(b.dataset.edit); };
  });
  box.querySelectorAll('[data-fig]').forEach(b=>{
    b.onclick = ()=>{
      const f = myFoodById(b.dataset.fig);
      if(!f) return;
      closeSheet('myfoods-backdrop');
      setTimeout(()=>openLabelSheet(myFoodToFood(f)), HANDOFF);
    };
  });
  box.querySelectorAll('[data-del]').forEach(b=>{
    b.onclick = ()=>{
      const f = myFoodById(b.dataset.del);
      if(!f) return;
      if(!confirm('Remove "'+f.name+'" from your foods?\n\nAnything already logged stays exactly as it is, and this can be undone from Recently deleted.')) return;
      deleteMyFood(f.id);
      const rec = binPush({ kind:'myfood', item: f });
      showUndo(rec, 'saved food');
      renderBin();
      renderMyFoodsList(document.getElementById('myfoods-filter').value);
      renderMyFoodsCount();
    };
  });
}

// ---------------------------------------------------------------------------
// EDITING A SAVED FOOD
//
// Its own sheet. Sharing the manual ADD form meant the prefill had to keep pace
// with every field that form grew, and it did not: after v35 an edit dropped
// the food's measure and its unit without saying so.
let editingFoodId = null;

function setMfeMeasure(b){
  const basis = (b === 'ml') ? 'ml' : 'g';
  document.querySelectorAll('#mfe-measure .tab').forEach(t=>
    t.classList.toggle('active', t.dataset.mfebasis === basis));
  document.getElementById('mfe-amount').placeholder = 'Amount ('+basis+')';
  document.getElementById('mfe-amount-label').textContent = 'Amount ('+basis+')';
  document.getElementById('mfe-unit-size').placeholder = 'One is ('+basis+')';
  document.getElementById('mfe-unit-size-label').textContent = 'One is ('+basis+')';
  updateFoodEditPreview();
}
function mfeMeasure(){
  const on = document.querySelector('#mfe-measure .tab.active');
  return (on && on.dataset.mfebasis === 'ml') ? 'ml' : 'g';
}

// Correcting a food you are about to log. Packet data is wrong often enough
// that finding out at the moment you scan it, and being stuck with it, is the
// worst version of this - so the correction happens here and sticks.
//
// A scanned correction is saved against the BARCODE, so the next scan of the
// same pack uses your numbers and never asks Open Food Facts again. A built-in
// correction is saved under the same name and quietly replaces the built-in in
// search, so there is one row, not two - delete your copy and the built-in
// comes back on its own.
let editingPending = null;
// What the form was filled with, so a field you never touched is written back
// from the stored figure rather than from the rounded version on screen.
let mfeOpenedWith = null;

// One decimal is what a packet prints, and it survives the trip to 100 g and
// back on any realistic unit size. Whole grams did not.
function mfeNum(v){
  const n = Math.round((Number(v) || 0) * 10) / 10;
  return n;
}
function mfeSnapshot(){
  const g = id => document.getElementById(id).value;
  return {amount:g('mfe-amount'), kcal:g('mfe-kcal'), protein:g('mfe-protein'),
          carbs:g('mfe-carbs'), fat:g('mfe-fat')};
}

// The per-100 figures the form was built from. A field you did not touch is
// written back from these untouched, so opening a food to rename it cannot
// move its macros at all - not even by a rounding step.
let mfeSource = null;

// True when neither this field nor the amount it is measured against has been
// edited, so the stored figure is still the right answer.
function mfeUntouched(field){
  if(!mfeOpenedWith || !mfeSource) return false;
  const now = mfeSnapshot();
  if(now.amount !== mfeOpenedWith.amount) return false;
  return now[field] === mfeOpenedWith[field];
}

function openPendingEdit(){
  if(!pendingFood) return;
  editingPendingEntry = null;
  openPendingEditFor(pendingFood, false);
}

function openPendingEditFor(food, fromLog){
  if(!food) return;
  editingPending = food;
  editingFoodId = null;

  // If this exact food is already saved, edit that record rather than making a
  // second copy of it.
  const existing = food.code ? myFoodByCode(food.code) : null;
  if(existing) editingFoodId = existing.id;

  const amount = Number(food.unitGrams) || Number(food.startAmount) || 100;
  const scale = amount / 100;
  document.getElementById('mfe-title').textContent = 'Correct these numbers';
  document.getElementById('mfe-note').textContent =
    (fromLog ? 'This fixes the line already in your log, at the amount you had. ' : '') +
    (food.code
      ? 'Whatever you put here is saved against this barcode, so scanning it again uses your numbers.'
      : food.src === 'local'
        ? 'This saves your own copy and uses it instead of the built-in one from now on.'
        : 'This saves your corrected version to your foods.');
  document.getElementById('mfe-note').style.display = 'block';
  document.getElementById('mfe-name').value    = food.name || '';
  document.getElementById('mfe-amount').value  = round2(amount);
  document.getElementById('mfe-kcal').value    = Math.round((food.kcal100||0) * scale);
  document.getElementById('mfe-protein').value = mfeNum((food.p100||0) * scale);
  document.getElementById('mfe-carbs').value   = mfeNum((food.c100||0) * scale);
  document.getElementById('mfe-fat').value     = mfeNum((food.f100||0) * scale);
  mfeSource = {kcal100: food.kcal100||0, p100: food.p100||0, c100: food.c100||0, f100: food.f100||0};
  mfeOpenedWith = mfeSnapshot();
  const countable = isCountable(food);
  document.getElementById('mfe-countable').checked = countable;
  document.getElementById('mfe-unit-row').style.display = countable ? 'block' : 'none';
  document.getElementById('mfe-unit-name').value = countable ? food.unitName : '';
  document.getElementById('mfe-unit-size').value = countable ? round2(food.unitGrams) : '';
  document.getElementById('mfe-err').style.display = 'none';
  // Nothing to delete yet when the food is not saved, and deleting the food you
  // are in the middle of logging is not a thing anyone wants.
  document.getElementById('mfe-delete').style.display = 'none';
  setMfeMeasure(food.basis === 'ml' ? 'ml' : 'g');
  closeSheet('portion-backdrop');
  openSheet('mfedit-backdrop');
  updateFoodEditPreview();
}

document.getElementById('portion-edit').onclick = openPendingEdit;

// The same correction, reached from something already in the log. Catching a
// wrong figure after logging it was otherwise a dead end: the entry editor can
// only change how much you had, never what it was.
let editingPendingEntry = null;

function openLoggedNumbersEdit(){
  if(editingIdx === null || editingIdx === undefined) return;
  const es = loadEntries(currentDate);
  const e = es[editingIdx];
  if(!e) return;
  const per = per100From(e, true);
  if(!per){
    alert('This was entered by hand without a weight, so there are no per-100 figures to correct. Delete it and add it again.');
    return;
  }
  const saved = e.code ? myFoodByCode(e.code) : null;
  // Start from the saved food where there is one, so the sugar, saturated fat
  // and micronutrients it holds are carried through the correction rather than
  // rebuilt from the four figures the entry happens to store.
  const base = saved ? myFoodToFood(saved)
                     : Object.assign({}, per, {name: e.name, code: e.code || null, src: 'mine'});
  const food = Object.assign({}, base, per, {name: e.name, code: e.code || null,
                                             startAmount: Number(e.grams) || null});
  closeSheet('edit-backdrop');
  pendingFood = null;
  editingPendingEntry = editingIdx;
  openPendingEditFor(food, true);
}

document.getElementById('ee-fixnums').onclick = openLoggedNumbersEdit;

function openFoodEdit(id){
  const f = myFoodById(id);
  if(!f) return;
  editingFoodId = id;
  editingPending = null;
  editingPendingEntry = null;
  document.getElementById('mfe-title').textContent = 'Edit saved food';
  document.getElementById('mfe-note').style.display = 'none';
  document.getElementById('mfe-delete').style.display = '';
  // Describe the food at the size it is most naturally described: one unit if
  // it has one, otherwise the amount a scan opened it at, otherwise 100.
  const amount = Number(f.unitGrams) || Number(f.startAmount) || 100;
  const scale = amount / 100;
  document.getElementById('mfe-name').value    = f.name || '';
  document.getElementById('mfe-amount').value  = round2(amount);
  document.getElementById('mfe-kcal').value    = Math.round((f.kcal100||0) * scale);
  document.getElementById('mfe-protein').value = mfeNum((f.p100||0) * scale);
  document.getElementById('mfe-carbs').value   = mfeNum((f.c100||0) * scale);
  document.getElementById('mfe-fat').value     = mfeNum((f.f100||0) * scale);
  mfeSource = {kcal100: f.kcal100||0, p100: f.p100||0, c100: f.c100||0, f100: f.f100||0};
  mfeOpenedWith = mfeSnapshot();
  const countable = isCountable(f);
  const c = document.getElementById('mfe-countable');
  c.checked = countable;
  document.getElementById('mfe-unit-row').style.display = countable ? 'block' : 'none';
  document.getElementById('mfe-unit-name').value = countable ? f.unitName : '';
  document.getElementById('mfe-unit-size').value = countable ? round2(f.unitGrams) : '';
  document.getElementById('mfe-err').style.display = 'none';
  setMfeMeasure(f.basis === 'ml' ? 'ml' : 'g');
  closeSheet('myfoods-backdrop');
  closeSheet('add-backdrop');
  openSheet('mfedit-backdrop');
  updateFoodEditPreview();
}

// What the numbers in the boxes actually mean once they are stored per 100.
// This is the line that would have caught a portion typed as 1 gram: it reads
// "100 g = 21,400 kcal" the instant it happens.
function updateFoodEditPreview(){
  const el = document.getElementById('mfe-preview');
  if(!el) return;
  const u = mfeMeasure();
  const amount = Number(document.getElementById('mfe-amount').value) || 0;
  const kcal   = Number(document.getElementById('mfe-kcal').value) || 0;
  if(amount <= 0 || kcal <= 0){
    el.innerHTML = '<span style="color:var(--text3);">Enter an amount and its calories.</span>';
    return;
  }
  const per100 = kcal * 100 / amount;
  let html = '100'+u+' = <b>'+fmt0(per100)+' kcal</b>';
  const unitName = document.getElementById('mfe-unit-name').value.trim().toLowerCase();
  const unitSize = Number(document.getElementById('mfe-unit-size').value) || 0;
  if(document.getElementById('mfe-countable').checked && unitName && unitSize > 0){
    html += '<br>1 '+esc(unitName)+' ('+round2(unitSize)+u+') = <b>'+fmt0(per100*unitSize/100)+' kcal</b>';
  }
  if(per100 > KCAL_PER_100_MAX){
    html += '<br><span style="color:var(--caution);">Nothing is denser than about 900 kcal per 100'+u+
            '. Check the amount — a portion typed as 1 makes this a hundred times too big.</span>';
  }
  el.innerHTML = html;
}

document.getElementById('mfe-countable').onchange = (e)=>{
  document.getElementById('mfe-unit-row').style.display = e.target.checked ? 'block' : 'none';
  updateFoodEditPreview();
};
document.querySelectorAll('#mfe-measure .tab').forEach(t=>{
  t.onclick = ()=> setMfeMeasure(t.dataset.mfebasis);
});
['p-health-floor','p-protein-floor','p-target-weight'].forEach(id=>{
  const el = document.getElementById(id);
  if(el) el.addEventListener('input', renderGoalNotes);
  if(el) el.addEventListener('change', renderGoalNotes);
});

['mfe-amount','mfe-kcal','mfe-unit-name','mfe-unit-size'].forEach(id=>{
  document.getElementById(id).addEventListener('input', updateFoodEditPreview);
});

document.getElementById('mfe-save').onclick = ()=>{
  // Either an existing saved food, or one you are correcting mid-log that has
  // no id yet. Guarding on the id alone is what made Save do nothing at all.
  if(!editingFoodId && !editingPending) return;
  const err = document.getElementById('mfe-err');
  const fail = (m)=>{ err.textContent = m; err.style.display = 'block'; };
  const name = document.getElementById('mfe-name').value.trim();
  const amount = Number(document.getElementById('mfe-amount').value) || 0;
  const kcal = Number(document.getElementById('mfe-kcal').value) || 0;
  if(!name) return fail('Give the food a name');
  if(amount <= 0) return fail('The amount these numbers describe has to be above zero');
  if(kcal <= 0) return fail('Enter the calories for that amount');
  const countable = document.getElementById('mfe-countable').checked;
  const unitName = countable ? document.getElementById('mfe-unit-name').value.trim().toLowerCase() : '';
  const unitSize = countable ? (Number(document.getElementById('mfe-unit-size').value) || 0) : 0;
  if(countable && (!unitName || unitSize <= 0))
    return fail('Name the unit and give the size of one, or untick "count this in units"');
  err.style.display = 'none';
  // v110: these numbers are the newest word on this food. Calories or macros
  // typed earlier on the nutrient sheet would otherwise sit on top of them.
  try{
    [name, editingPending && editingPending.name].forEach(n=>{
      const L0 = n ? labelFor(n) : null;
      if(L0 && L0.mac) saveLabel(n, {mac: null});
    });
  }catch(e){}

  const scale = 100 / amount;
  // Only the six things on this form. Everything else the food knows - sugar,
  // saturated fat, fibre, the vitamins, the additive list - is deliberately
  // left out, because a key that is absent means "leave what is stored alone".
  // Listing them here as undefined would wipe them, and the health score with
  // them.
  // A field left exactly as it was found keeps its stored figure. Recomputing
  // it from the rounded number on screen is what turned a rename into a silent
  // macro rewrite.
  const keep = (field, per100key, inputId) =>
    mfeUntouched(field) ? mfeSource[per100key]
                        : (Number(document.getElementById(inputId).value) || 0) * scale;
  const fields = {
    name: name,
    kcal100: mfeUntouched('kcal') ? mfeSource.kcal100 : kcal * scale,
    p100: keep('protein', 'p100', 'mfe-protein'),
    c100: keep('carbs',   'c100', 'mfe-carbs'),
    f100: keep('fat',     'f100', 'mfe-fat'),
    basis: mfeMeasure(),
    // Unticking the box clears the unit rather than leaving the old one behind.
    unitName: countable ? unitName : null,
    unitGrams: countable ? unitSize : null,
    startAmount: countable ? unitSize : amount
  };

  // ---- correcting a food you are part-way through logging ----
  if(editingPending){
    const was = editingPending;
    // The scanned record, with your four numbers over the top of it. Spread
    // first so everything the packet did say survives the correction.
    const corrected = Object.assign({}, was, fields, {
      code: was.code || null,
      src: was.src === 'local' ? 'mine' : (was.src || 'mine')
    });
    // silent: correcting a food is not eating it, so it does not count as a use.
    const rec = rememberFood(corrected, {silent:true});
    if(rec && was.src === 'local' && !was.code){
      // Marks the built-in this replaces, so search shows one row rather than
      // your copy above the stale original. Removing your copy restores it.
      markOverride(rec.id, was.name);
    }
    const fixed = rec ? myFoodToFood(rec) : corrected;
    const entryIdx = editingPendingEntry;
    editingPending = null;
    editingPendingEntry = null;
    editingFoodId = null;
    closeSheet('mfedit-backdrop');

    // Came from the log: rewrite that line at the amount you actually had, and
    // leave every other entry alone. The weight is what you ate; only the
    // figures behind it were wrong.
    if(entryIdx !== null && entryIdx !== undefined){
      const es = loadEntries(currentDate);
      const e = es[entryIdx];
      if(e){
        const g = Number(e.grams) || 0;
        const s = g / 100;
        es[entryIdx] = Object.assign({}, e, {
          name: fixed.name || e.name,
          code: fixed.code || e.code || null,
          kcal:    Math.round(fixed.kcal100 * s),
          protein: Math.round(fixed.p100 * s),
          carbs:   Math.round(fixed.c100 * s),
          fat:     Math.round(fixed.f100 * s),
          sugar: fixed.sug100 == null ? null : Math.round(fixed.sug100 * s),
          sat:   fixed.sat100 == null ? null : Math.round(fixed.sat100 * s * 10) / 10,
          micros: (function(){
            const src = fixed.micros100 || {}, out = {};
            Object.keys(src).forEach(k=>{ out[k] = src[k] * s; });
            return out;
          })()
        });
        saveEntries(currentDate, es);
        buzz();
      }
      editingIdx = null;
      renderDay();
      return;
    }

    // Straight back to where you were, with the numbers you just fixed.
    openPortion(fixed);
    return;
  }

  updateMyFoodById(editingFoodId, fields);
  editingFoodId = null;
  closeSheet('mfedit-backdrop');
  openSheet('myfoods-backdrop');
  renderMyFoodsList(document.getElementById('myfoods-filter').value);
  renderMyFoodsCount();
};

document.getElementById('mfe-delete').onclick = ()=>{
  if(!editingFoodId) return;
  const f = myFoodById(editingFoodId);
  if(!f) return;
  // Same wording and the same safety net as the trash icon in the list. This
  // one used to delete outright, and its confirm text left out the sentence
  // promising it could be undone - because from here it could not.
  if(!confirm('Remove "'+f.name+'" from your foods?\n\nAnything already logged stays exactly as it is, and this can be undone from Recently deleted.')) return;
  deleteMyFood(editingFoodId);
  const rec = binPush({ kind:'myfood', item: f });
  showUndo(rec, 'saved food');
  renderBin();
  editingFoodId = null;
  closeSheet('mfedit-backdrop');
  openSheet('myfoods-backdrop');
  renderMyFoodsList(document.getElementById('myfoods-filter').value);
  renderMyFoodsCount();
};

document.getElementById('manual-myfoods').onclick = ()=>{
  closeSheet('add-backdrop');
  renderMyFoodsList('');
  document.getElementById('myfoods-filter').value = '';
  openSheet('myfoods-backdrop');
};

// ---- Saved meals ----
const MEALS_KEY = 'caloriesavedmeals';
let builderItems = [];
// Which saved meal is being edited, or null when building a new one.
let editingMealIdx = null;
let builderTarget = false;
// Bumped every time "the next food belongs to the meal" is switched on, so a
// check queued before that can tell it is stale.
let builderArm = 0;

function loadSavedMeals(){ try{ return JSON.parse(CS.getItem(MEALS_KEY))||[]; }catch(e){ return []; } }
function saveSavedMeals(m){ lsSet(MEALS_KEY, JSON.stringify(m)); }

function renderSavedMeals(){
  const meals = loadSavedMeals();
  const box = document.getElementById('saved-meals-list');
  if(meals.length===0){
    box.innerHTML = '<div style="font-size:13px; color:var(--text3); padding:10px 4px 14px;">No saved meals yet. Log the foods once, then bundle them here.</div>';
    return;
  }
  box.innerHTML = meals.map((m,i)=>{
    const k = m.items.reduce((s,x)=>s+x.kcal,0);
    return '<div class="saved-meal"><div><div class="sm-n">'+esc(m.name)+'</div>'+
      '<div class="sm-k">'+m.items.length+' items &middot; '+fmt0(k)+' kcal</div></div>'+
      '<div class="sm-actions"><button data-log="'+i+'">Log</button>'+
      '<button data-smedit="'+i+'">Edit</button>'+
      '<button data-del="'+i+'" aria-label="Delete"><i class="ti ti-trash" aria-hidden="true"></i></button></div></div>';
  }).join('');
  box.querySelectorAll('[data-log]').forEach(b=>{
    b.onclick = ()=>{
      const m = loadSavedMeals()[Number(b.dataset.log)];
      if(!m) return;
      // Through addEntry, like every other way of logging something. Pushing
      // onto the array directly meant a saved meal never reached Recents and
      // never buzzed, unlike the identical food logged any other way.
      closeSheet('add-backdrop');
      if(m.asPlate){
        const one = plateEntry(m.items, m.name, selectedMeal);
        // Falls back to logging the parts if they cannot be combined - an item
        // with no weight makes a per-100 basis impossible.
        if(one){ addEntry(one); return; }
      }
      m.items.forEach(it=>addEntry(Object.assign({}, it, {meal: selectedMeal})));
    };
  });
  // Reopens the meal in the builder it was made in. One wrong item used to mean
  // deleting the meal and rebuilding it from scratch out of today's log.
  box.querySelectorAll('[data-smedit]').forEach(b=>{
    b.onclick = ()=>{
      const at = Number(b.dataset.smedit);
      const m = loadSavedMeals()[at];
      if(!m) return;
      editingMealIdx = at;
      builderTarget = false;
      builderItems = m.items.map(it=>Object.assign({}, it));
      document.getElementById('builder-name').value = m.name || '';
      document.getElementById('builder-plate').checked = !!m.asPlate;
      document.getElementById('builder-err').style.display = 'none';
      document.getElementById('builder-save').textContent = 'Save changes';
      renderBuilder();
      closeSheet('add-backdrop');
      setTimeout(()=>openSheet('builder-backdrop'), HANDOFF);
    };
  });
  box.querySelectorAll('[data-del]').forEach(b=>{
    b.onclick = ()=>{
      const meals = loadSavedMeals();
      const at = Number(b.dataset.del);
      const gone = meals[at];
      meals.splice(at,1);
      saveSavedMeals(meals);
      if(gone){
        const rec = binPush({ kind:'savedmeal', index: at, item: gone });
        showUndo(rec, 'saved meal');
        renderBin();
      }
      renderSavedMeals();
    };
  });
}

// Where a scanned or searched food lands.
document.getElementById('bld-scan').onclick = ()=>{
  builderTarget = true; builderArm++;
  closeSheet('builder-backdrop');
  setTimeout(()=>startScan(false), HANDOFF);
};
document.getElementById('bld-search').onclick = ()=>{
  builderTarget = true; builderArm++;
  closeSheet('builder-backdrop');
  setTimeout(()=>{ selectMeal(selectedMeal); disarmBarcode(); openSheet('add-backdrop');
    const t = document.querySelector('.tab[data-tab="search"]'); if(t) t.click();
    const si = document.getElementById('search-input'); if(si) si.focus();
  }, 180);
};

document.getElementById('new-meal-btn').onclick = ()=>{
  builderTarget = false;
  editingMealIdx = null;
  builderItems = [];
  document.getElementById('builder-name').value = '';
  document.getElementById('builder-plate').checked = false;
  document.getElementById('builder-save').textContent = 'Save meal';
  document.getElementById('builder-err').style.display='none';
  renderBuilder();
  closeSheet('add-backdrop');
  openSheet('builder-backdrop');
};

// A plate scored from its combined totals, not by averaging its parts. Rice
// on its own scores badly and tells you nothing; rice next to chicken and
// broccoli is the thing you actually ate.
// Set while the plate below is being built, then hung on the food it returns.
let combinedBasis = null, combinedFreeAssumed = false, combinedFreeNames = [];

function combinedFood(entries){
  if(!entries || !entries.length) return null;
  combinedBasis = null;
  combinedFreeAssumed = false;
  combinedFreeNames = [];
  let g = 0, kcal = 0, pro = 0, carb = 0, fat = 0, sug = 0, sat = 0, fib = 0, sod = 0;
  let sugKnown = true, satKnown = true, fibKnown = true, sodKnown = true;
  for(const e of entries){
    const grams = Number(e.grams) || 0;
    if(!(grams > 0)) return null;                 // cannot combine without weights
    g += grams; kcal += Number(e.kcal)||0; pro += Number(e.protein)||0;
    carb += Number(e.carbs)||0; fat += Number(e.fat)||0;
    if(e.sugar == null) sugKnown = false; else sug += Number(e.sugar)||0;
    if(e.sat   == null) satKnown = false; else sat += Number(e.sat)||0;
    const m = e.micros || {};
    if(m.fiber  == null) fibKnown = false; else fib += Number(m.fiber)||0;
    if(m.sodium == null) sodKnown = false; else sod += Number(m.sodium)||0;
  }
  if(!(g > 0)) return null;
  const per = 100/g;
  // The plate is scored as one food, so it has to carry what its parts carried.
  // Named 'Meal' with no additive list, it was handed to novaGroup() as an
  // unrecognised word (processing group 1, no penalty) and to additivePenalty()
  // as a food with nothing in it - so a day of nothing but ultra-processed food
  // came out systematically kinder than any single item on it. The worst
  // processing group present, and every additive present, now travel with it.
  let worstNova = 1;
  const allAdditives = [];
  for(const e of entries){
    const g = e.name ? novaGroup(e.name) : 1;
    if(g > worstNova) worstNova = g;
    if(Array.isArray(e.additives)) for(const a of e.additives){
      if(allAdditives.indexOf(a) < 0) allAdditives.push(a);
    }
  }

  /* v97: the two penalties are carried in proportion, not taken from the worst
     thing on the plate.

     Positives still come from the mixture, and they should - blending is how a
     plate with one thin label gets carried by the rest of it, and how its
     nutrient coverage comes out real. But the two penalties were being read off
     the plate as though it were a single food, and that is where a bowl of
     yoghurt, berries and granola went from 59 to 41:

       Processing took the WORST group on the plate and applied it to all of it.
       A spoon of sweet chilli sauce made the chicken and rice ultra-processed
       too - nearly a fifth off the whole plate for a spoonful.

       Salt, sugar and saturated fat were measured against one helping of the
       mixture, while each food on its own got its own helping and its own fair
       share of the day. Four foods scored apart get four fair shares; the same
       four scored as a plate got one.

     Both are now shared out by the calories each thing brought - which is the
     same thing COACH already does one level up, when it weighs each plate into
     the meal and each meal into the day. Same operation at every level, so a
     number cannot change just because you grouped things. */
  const novaParts = [], limParts = [];
  let kcalW = 0;
  for(const e of entries){
    const k = Math.max(0, Number(e.kcal) || 0);
    let f1 = null;
    try{ f1 = (typeof per100From === 'function') ? per100From(e) : null; }catch(err){ f1 = null; }
    if(!f1 || !(f1.kcal100 > 0)) continue;
    kcalW += k;
    let gp = 1;
    try{ gp = novaGroupOf(f1); }catch(err){ gp = e.name ? novaGroup(e.name) : 1; }
    novaParts.push({kcal: k, mult: (NOVA_MULT[gp] === undefined ? 1 : NOVA_MULT[gp]), nova: gp});
    try{
      const ll = limitLoad(f1);
      limParts.push({kcal: k, load: ll.load, rows: ll.rows, portion: ll.portion, matrix: ll.matrix});
    }catch(err){}
  }
  // A plate of zero-calorie things cannot be shared out by calories, so it
  // falls back to the old reading rather than to nothing.
  let novaMultW = null, novaTop = null;
  if(kcalW > 0 && novaParts.length){
    let acc = 0; const byGroup = {};
    novaParts.forEach(x=>{
      acc += x.mult * x.kcal;
      byGroup[x.nova] = (byGroup[x.nova] || 0) + x.kcal;
    });
    novaMultW = acc / kcalW;
    novaTop = Number(Object.keys(byGroup).sort((a,b)=>byGroup[b] - byGroup[a])[0]) || 1;
  }
  return {
    name: 'Meal', novaOverride: worstNova,
    /* What the processing penalty is actually worked out from, and the group
       most of the plate's calories came from - which is what it should be
       called, rather than named after its worst spoonful. */
    novaMultW: novaMultW, novaTopGroup: novaTop,
    novaMixShare: (function(){
      if(!(kcalW > 0)) return null;
      let bad = 0;
      novaParts.forEach(x=>{ if(x.nova === 4) bad += x.kcal; });
      return bad / kcalW;
    })(),
    limitParts: (kcalW > 0 && limParts.length) ? limParts : null,
    additives: allAdditives.length ? allAdditives : null,
    kcal100: kcal*per, p100: pro*per, c100: carb*per, f100: fat*per,
    sug100: sugKnown ? sug*per : null,
    sat100: satKnown ? sat*per : null,
    micros100: (function(){
      // Every nutrient the plate carried, not just fibre and salt. A nutrient
      // counts only if the foods that carry a figure for it make up most of
      // the plate's calories - otherwise the total is an understatement
      // dressed up as a measurement.
      const tot = {}, seen = {};
      let kcalAll = 0;
      entries.forEach(e=>{
        const k = Number(e.kcal) || 0;
        kcalAll += k;
        const m = e.micros || {};
        for(const key in m){
          if(key.indexOf('off:') === 0) continue;
          const v = m[key];
          if(v == null || !isFinite(v)) continue;
          tot[key] = (tot[key] || 0) + v;
          seen[key] = (seen[key] || 0) + k;
        }
      });
      /* v94: this used to DELETE any nutrient whose carriers were not 85% of the
         plate's calories. The intent was not to understate - but the effect was
         that adding one food COACH had no figures for wiped out everything the
         other foods had measured. Porridge and banana scored 79; adding a drink
         it could not match took the plate to 28, because all 28 nutrients were
         thrown away and the thin-data ceiling came down. Adding food cannot
         make a plate know LESS about the food already on it.

         So nothing is thrown away lightly. A nutrient measured across at least
         half the plate's calories is scaled to the whole plate - assuming the
         unmeasured part is like the measured part per calorie, which is the
         least-bad assumption there is - and the scaling is capped at one and a
         half, so it can never run away with itself. Between a quarter and a
         half it is kept as measured, which understates it a little and is
         honest about it. Below a quarter it really is a token figure, and that
         is the only case that is dropped.

         microBasis records what share of the plate each nutrient was actually
         measured across, so anything downstream can say so rather than guess. */
      const out = {}, basis = {};
      for(const key in tot){
        if(!kcalAll){ out[key] = tot[key] * per; basis[key] = 1; continue; }
        const share = seen[key] / kcalAll;
        // Ten per cent is the line. Below that a figure really is a token one
        // carried by a crumb of the plate; above it, it is evidence, and
        // throwing evidence away is what caused the bug this rule replaced.
        if(share < 0.10) continue;
        const scale = share >= 0.5 ? Math.min(1 / share, 1.5) : 1;
        out[key] = tot[key] * per * scale;
        basis[key] = share;
      }
      if(fibKnown){ out.fiber = fib*per; basis.fiber = 1; }
      if(sodKnown){ out.sodium = sod*per; basis.sodium = 1; }
      combinedBasis = basis;
      return out;
    })(),
    // Free sugar is worked out per item, using each item's own name, because
    // "Meal" tells the classifier nothing.
    /* v95: this used to give up on the WHOLE plate the moment one item's sugar
       could not be classified - and limitLoad then fell back to applying the
       assumed fraction to every gram of sugar on it. So one unrecognised milk
       made COACH treat the banana's fruit sugar and the porridge's as added
       sugar too, and a breakfast lost 27 points to sugar that was never there.

       Each item now answers for its own sugar: the ones COACH knows are
       counted properly, and only the ones it does not are assumed - and only
       their own grams are. */
    free100: (function(){
      let f = 0, ok = true;
      entries.forEach(e=>{
        if(e.sugar == null){ ok = false; return; }
        /* Anything YOU have settled about an item counts here too. Without
           this, telling COACH the sugar in your milk is lactose fixed the
           milk's own score and did nothing to the plate it was on - which is
           the only place most people would look. */
        let fr = null;
        const L = (typeof labelFor === 'function') ? labelFor(e.name || '') : null;
        if(L && L.free != null && L.free >= 0 && L.free <= 1) fr = L.free;
        else fr = (typeof freeSugarFraction === 'function') ? freeSugarFraction(e.name || '') : null;
        if(fr === null){
          // Unknown, for this item only: the same half-and-half reading the
          // single-food scorer uses, applied to this item's sugar alone.
          combinedFreeAssumed = true;
          if(e.name && combinedFreeNames.indexOf(e.name) < 0) combinedFreeNames.push(e.name);
          fr = 0.5;
        }
        f += (Number(e.sugar) || 0) * fr;
      });
      return ok ? f*per : null;
    })(),
    // Alcohol, summed per item for the same reason as free sugar.
    micros100Alcohol: null,
    /* v96: the plate deliberately does NOT carry the weight you ate.
       It used to, and that was the bug behind "three foods scoring 80+ turn
       into a plate scoring 18". A health score answers "is this a good thing
       to eat", and every single food answers it at a normal portion of itself.
       A plate that answered it at its full served weight was being asked a
       different question - "is eating 360 g of this in one go sensible" - so
       the salt and saturated fat of three normal portions got measured against
       the day as though they were one portion, and the plate collapsed below
       every food on it. How MUCH you ate is already counted twice over: by the
       calorie target, and by the calorie-weighting that decides how much each
       plate matters to the meal and the day. It is not this number's job. */
    basis: 'g', src: 'combined',
    /* These three read what the closures above worked out, so they have to come
       after them - an object literal is evaluated top to bottom, and when they
       sat higher up they reported on an array that had not been filled yet. */
    microBasis: combinedBasis,
    freeAssumedAny: combinedFreeAssumed,
    freeAssumedNames: combinedFreeNames.slice()
  };
}
function renderBuilderScore(){
  const box = document.getElementById('builder-score');
  if(!box) return;
  const f = combinedFood(builderItems);
  const sc = f ? foodScores(f) : null;
  if(!sc){ box.innerHTML = ''; return; }
  const kcal = builderItems.reduce((a,e)=>a+(Number(e.kcal)||0),0);
  const pro  = builderItems.reduce((a,e)=>a+(Number(e.protein)||0),0);
  box.innerHTML = '<div class="bld-sum"><div class="bl"><b>Whole meal</b><br>'+
    fmt0(kcal)+' kcal &middot; '+fmt0(pro)+' g protein</div>'+
    scorePill(sc.overall === null ? sc.protein : sc.overall)+'</div>';
}

function renderBuilder(){
  const items = document.getElementById('builder-items');
  if(builderItems.length===0){
    items.innerHTML = '<div style="font-size:12px; color:var(--text3); padding-bottom:10px;">No items yet — add from today\'s log below.</div>';
  } else {
    items.innerHTML = builderItems.map((it,i)=>
      '<div class="builder-item"><span>'+esc(it.name)+(it.grams?' ('+it.grams+'g)':'')+'</span>'+
      '<span style="display:flex; align-items:center; gap:10px;"><span style="color:var(--text3);">'+fmt0(it.kcal)+'</span>'+
      '<button data-rm="'+i+'" aria-label="Remove"><i class="ti ti-x" aria-hidden="true"></i></button></span></div>'
    ).join('');
    items.querySelectorAll('[data-rm]').forEach(b=>{
      b.onclick = ()=>{ builderItems.splice(Number(b.dataset.rm),1); renderBuilder(); };
    });
  }

  renderBuilderScore();

  const src = document.getElementById('builder-source');
  const todays = loadEntries(currentDate);
  if(todays.length===0){
    src.innerHTML = '<div class="estate"><i class="ti ti-tools-kitchen-2" aria-hidden="true"></i><div class="et">Nothing logged today</div><div class="es">A meal is built from foods you have already logged. Log them first, then come back and bundle them into one.</div></div>';
    return;
  }
  src.innerHTML = todays.map((e,i)=>
    '<div class="builder-item"><span>'+esc(e.name)+(e.qty&&e.unit?' ('+e.qty+' '+pluralUnit(e.unit,e.qty)+')':(e.grams?' ('+e.grams+'g)':''))+'</span>'+
    '<button data-add="'+i+'" style="color:var(--accent); font-size:13px;">Add</button></div>'
  ).join('');
  src.querySelectorAll('[data-add]').forEach(b=>{
    b.onclick = ()=>{
      const e = loadEntries(currentDate)[Number(b.dataset.add)];
      const copy = Object.assign({}, e);
      delete copy.meal;
      builderItems.push(copy);
      renderBuilder();
    };
  });
}

document.getElementById('builder-save').onclick = ()=>{
  const name = document.getElementById('builder-name').value.trim();
  const err = document.getElementById('builder-err');
  if(!name){ err.textContent='Give the meal a name'; err.style.display='block'; return; }
  if(builderItems.length===0){ err.textContent='Add at least one item'; err.style.display='block'; return; }
  err.style.display='none';
  const asPlate = !!document.getElementById('builder-plate').checked;
  const meals = loadSavedMeals();
  if(editingMealIdx !== null && meals[editingMealIdx]){
    // Replaced in place, so an edited meal keeps its position in the list
    // rather than jumping to the top as if it were new.
    meals[editingMealIdx] = {name, items: builderItems.slice(), asPlate};
  } else {
    meals.unshift({name, items: builderItems.slice(), asPlate});
  }
  saveSavedMeals(meals);
  builderItems = [];
  editingMealIdx = null;
  document.getElementById('builder-save').textContent = 'Save meal';
  closeSheet('builder-backdrop');
  renderSavedMeals();
};

