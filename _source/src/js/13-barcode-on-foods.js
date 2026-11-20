/* ============================================================
   v124 - see and change the barcode on any food.
   The How much? sheet always says whether a barcode is linked. "Add one" or
   "Change" opens a box under it: type the number or scan it. Saving puts the
   barcode on your own copy of the food (your saved foods, the same place a
   scan already looks first), so scanning that pack opens this food from then
   on. One barcode belongs to one food: if another saved food had it, it is
   taken off that one and you are told which. Restaurant food has no barcode,
   so the line is not shown for it. Nothing that is already logged changes.
   ============================================================ */
const NO_BARCODE_BRANDS = /^(McDonald's|KFC|Burger King|Greggs|Nando's|Subway|Domino's|Pizza Hut|Papa John's|Costa|Starbucks|Tim Hortons|Five Guys|Pret|Wagamama|LEON|Leon|itsu|Wendy's|Taco Bell|Popeyes|Pizza Express|Wetherspoons)$/i;
let barcodeLinkCb = null;     // set only while the scanner is open to link a barcode
function barcodeDigits(v){ return String(v == null ? '' : v).replace(/\D/g, ''); }
function foodTakesBarcode(food){
  if(!food || food.perItem) return false;
  const b = splitName(food.name, food).brand;
  return !(b && NO_BARCODE_BRANDS.test(b));
}
function linkBarcode(food, code){
  const list = loadMyFoods();
  const old = barcodeDigits(food.code);
  let rec = null;
  if(food.src === 'mine'){
    rec = list.filter(x => old ? barcodeDigits(x.code) === old : myFoodKey(x) === myFoodKey(food))[0] || null;
  }
  let movedFrom = null;
  list.forEach(x=>{
    if(x !== rec && barcodeDigits(x.code) === code){ delete x.code; movedFrom = x.name; }
  });
  if(rec){
    rec.code = code;
    saveMyFoods(list);
  } else {
    saveMyFoods(list);
    const copy = Object.assign({}, food, {code: code});
    delete copy.src;
    const r = rememberFood(copy, {silent: true});
    // A built-in food you have put a barcode on: your copy stands in for it in
    // search, so it shows once rather than twice.
    if(r && food.src === 'local') markOverride(r.id, food.name);
  }
  return {movedFrom: movedFrom};
}
function renderBarcodeEditor(food, msg){
  const el = document.getElementById('portion-code');
  const code = barcodeDigits(food.code);
  el.innerHTML =
    '<div class="bc-edit">'+
      '<label class="bc-lab" for="bc-input">'+(code ? 'Change the barcode' : 'Link a barcode')+'</label>'+
      '<div class="bc-row">'+
        '<input id="bc-input" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="Barcode number" value="'+esc(code)+'">'+
        '<button type="button" id="bc-scan" class="bc-btn" aria-label="Scan the barcode"><i class="ti ti-barcode" aria-hidden="true"></i></button>'+
      '</div>'+
      '<div class="bc-msg" id="bc-msg">'+(msg ? esc(msg) : 'Type the number under the bars, or scan it.')+'</div>'+
      '<div class="bc-acts"><button type="button" id="bc-cancel" class="bc-ghost">Cancel</button>'+
      '<button type="button" id="bc-save" class="bc-save">Save barcode</button></div>'+
    '</div>';
  el.style.display = '';
  const inp = document.getElementById('bc-input');
  inp.oninput = ()=>{ const m = document.getElementById('bc-msg'); if(m.classList.contains('bad')){ m.classList.remove('bad'); m.textContent = 'Type the number under the bars, or scan it.'; } };
  document.getElementById('bc-cancel').onclick = ()=>{ renderPortionCode(pendingFood); };
  document.getElementById('bc-scan').onclick = ()=>{
    barcodeLinkCb = got => {
      renderBarcodeEditor(pendingFood, 'Scanned. Check the number, then save.');
      document.getElementById('bc-input').value = barcodeDigits(got);
    };
    startScan(false);
  };
  document.getElementById('bc-save').onclick = ()=>{
    const v = barcodeDigits(inp.value);
    const m = document.getElementById('bc-msg');
    if(v.length < 8 || v.length > 14){ m.textContent = 'A barcode is 8 to 14 digits.'; m.classList.add('bad'); return; }
    if(v === code){ renderPortionCode(pendingFood); return; }
    const r = linkBarcode(pendingFood, v);
    pendingFood.code = v;
    if(pendingFood.src !== 'mine') pendingFood.src = 'mine';
    
    renderPortionCode(pendingFood, 'Saved. Scanning this barcode now opens this food' +
      (r.movedFrom ? ' (taken off ' + r.movedFrom + ').' : '.'));
    try{ buzz(); }catch(e){}
  };
}

function fixScannedProduct(code){
  closeSheet('portion-backdrop');
  setTimeout(()=>{
    clearManualForm();
    pendingBarcode = code; pendingBarcodeName = ''; pendingBarcodeFix = true;
    const ab = document.getElementById('add-backdrop');
    if(!ab.classList.contains('open')) openSheet('add-backdrop');
    const t = document.querySelector('.tab[data-tab="manual"]');
    if(t) t.click();
    renderManualCodeNote();
    const err = document.getElementById('manual-err');
    if(err) err.style.display = 'none';
    document.getElementById('m-name').focus();
  }, 200);
}

function renderManualCodeNote(){
  const note = document.getElementById('m-code-note');
  if(!note) return;
  note.textContent = pendingBarcode
    ? ('\u00b7 barcode ' + pendingBarcode + (pendingBarcodeFix ? ' - replaces the wrong product' : ' attached')) : '';
}

// What the figures currently on the form would produce. Built by actually
// scoring them rather than by counting filled boxes, so the hint can never
// promise a grade the scorer would not give.
//
// Salt is the gate: without it there is no score at all, because sodium is the
// one input with no macro to bound it. Each of the other three narrows the
// range rather than unlocking it - which is worth saying, because "fill in all
// four" reads as four chores and "salt alone gets you a score" is one.
// "sugar and saturated fat and fibre" is not English.
function andList(arr){
  const a = (arr || []).filter(Boolean);
  if(!a.length) return '';
  if(a.length === 1) return a[0];
  return a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
}

function manualScorePreview(){
  const num = id => {
    const v = document.getElementById(id).value;
    return v === '' ? null : (Number(v) || 0);
  };
  const kcal = num('m-kcal'), grams = num('m-qty');
  const el = document.getElementById('m-scorehint');
  if(!el) return;
  if(!(kcal > 0)){ el.className = 'scorehint'; el.innerHTML =
    'Fill these in off the packet and this food gets a health score. Leave them blank and it is logged without one.'; return; }

  const scale = (grams && grams > 0) ? 100 / grams : 1;
  const salt = num('m-salt');
  const f = {
    name: document.getElementById('m-name').value.trim() || 'Food',
    kcal100: kcal * scale,
    p100: (num('m-protein') || 0) * scale,
    c100: (num('m-carbs') || 0) * scale,
    f100: (num('m-fat') || 0) * scale,
    sug100: num('m-sugar') === null ? null : num('m-sugar') * scale,
    sat100: num('m-sat') === null ? null : num('m-sat') * scale,
    micros100: {},
    basis: manualMeasure()
  };
  if(num('m-fibre') !== null) f.micros100.fiber = num('m-fibre') * scale;
  // Packets print salt; the score works in sodium. 1 g salt = 400 mg sodium.
  if(salt !== null) f.micros100.sodium = salt * scale * 1000 / 2.5;

  const sc = foodScores(f);
  if(sc && sc.health !== null){
    el.className = 'scorehint full';
    el.innerHTML = 'This food will score <b>' + sc.health + '</b> out of 100. Everything the score needs is here.';
  } else if(sc && sc.range){
    el.className = 'scorehint part';
    el.innerHTML = 'Scores somewhere in <b>' + sc.range.lo + '\u2013' + sc.range.hi + '</b> \u2014 too wide to be much use. '+
      'Add ' + esc(andList(sc.missing)) + ' and it lands on one number.';
  } else {
    el.className = 'scorehint none';
    el.innerHTML = 'No health score without these. <b>Salt is the one that matters most</b> \u2014 without it there '+
      'is no score at all, and the other three narrow it down.';
  }
}

['m-kcal','m-qty','m-protein','m-carbs','m-fat','m-sugar','m-sat','m-fibre','m-salt','m-name'].forEach(id=>{
  const el = document.getElementById(id);
  if(el) el.addEventListener('input', manualScorePreview);
});

/* v118: label figures read off a photo are per 100 g (the first column on a UK
   panel). They go into the form at a 100 g portion, and while you have not
   typed over them, changing the portion rescales them - so a 30 g scoop is a
   matter of typing 30, not doing the sums. Any box you edit yourself is left
   exactly as you typed it. */
let manualBase = null;
const MANUAL_SCALED = [['m-kcal','kcal'],['m-protein','protein'],['m-carbs','carbs'],['m-fat','fat'],
                       ['m-sugar','sugar'],['m-sat','satfat'],['m-fibre','fiber'],['m-salt','salt']];
function fillManualPer100(vals){
  const v = Object.assign({}, vals || {});
  if(v.salt == null && v.sodium != null) v.salt = Math.round(v.sodium * 2.5 / 1000 * 100) / 100;
  manualBase = {};
  MANUAL_SCALED.forEach(([id, k])=>{
    const el = document.getElementById(id);
    if(!el) return;
    if(v[k] != null){ el.value = round2(v[k]); manualBase[id] = Number(v[k]); }
  });
  const q = document.getElementById('m-qty');
  if(q) q.value = 100;
  const err = document.getElementById('manual-err');
  if(err) err.style.display = 'none';
  try{ manualScorePreview(); }catch(e){}
  const nm = document.getElementById('m-name');
  if(nm) nm.focus();
}
(function(){
  const q = document.getElementById('m-qty');
  if(q) q.addEventListener('input', ()=>{
    if(!manualBase) return;
    const g = Number(q.value);
    if(!(g > 0)) return;
    MANUAL_SCALED.forEach(([id])=>{
      if(manualBase[id] == null) return;
      const el = document.getElementById(id);
      if(el) el.value = round2(manualBase[id] * g / 100);
    });
    try{ manualScorePreview(); }catch(e){}
  });
  // Typing in a box takes it out of the rescaling, for that box only.
  MANUAL_SCALED.forEach(([id])=>{
    const el = document.getElementById(id);
    if(el) el.addEventListener('input', ()=>{ if(manualBase) delete manualBase[id]; });
  });
})();

function clearManualForm(){
  manualBase = null;
  ['m-sugar','m-sat','m-fibre','m-salt'].forEach(id=>{
    const el = document.getElementById(id); if(el) el.value = '';
  });
  // The unit fields belong here too. A unit name left behind from the last food
  // is how "1 bar" ends up attached to a bowl of rice.
  ['m-name','m-brand','m-kcal','m-qty','m-protein','m-carbs','m-fat','m-unit-name','m-unit-size']
    .forEach(id=>{ const el = document.getElementById(id); if(el) el.value=''; });
  pendingBarcode = null; pendingBarcodeName = ''; pendingBarcodeFix = false;
  const rem = document.getElementById('m-remember');
  if(rem) rem.checked = true;
  const c = document.getElementById('m-countable');
  if(c && c.checked){ c.checked = false; c.onchange({target:c}); }
  setManualMeasure('g');
  renderManualCodeNote();
  manualScorePreview();
}

// The measure chosen on the manual sheet. Kept in a variable rather than read
// off a class at save time so the placeholders and the saved food cannot
// disagree about what was picked.
let mBasisSel = 'g';
function manualMeasure(){ return mBasisSel === 'ml' ? 'ml' : 'g'; }

function setManualMeasure(b){
  mBasisSel = (b === 'ml') ? 'ml' : 'g';
  const u = manualMeasure();
  document.querySelectorAll('#m-measure .tab').forEach(t=>
    t.classList.toggle('active', t.dataset.mbasis === mBasisSel));
  document.getElementById('m-qty').placeholder = 'Portion ('+u+')';
  document.getElementById('m-unit-size').placeholder = 'One is ('+u+')';
}
document.querySelectorAll('#m-measure .tab').forEach(t=>{
  t.onclick = ()=> setManualMeasure(t.dataset.mbasis);
});
document.getElementById('m-countable').onchange = (e)=>{
  const on = e.target.checked;
  document.getElementById('m-unit-row').style.display = on ? 'flex' : 'none';
  document.getElementById('m-unit-hint').style.display = on ? 'block' : 'none';
};

document.getElementById('manual-save').onclick = ()=>{
  const name = document.getElementById('m-name').value.trim();
  // v113: who made it. Kept apart from the name, so "Protein bar" from two
  // brands stays two foods you can tell apart, and a brand search finds both.
  const mBrandEl = document.getElementById('m-brand');
  const mBrand = mBrandEl ? mBrandEl.value.trim().replace(/\s+/g, ' ').slice(0, 40) : '';
  const kcal = Number(document.getElementById('m-kcal').value);
  const err = document.getElementById('manual-err');
  if(!name || !kcal || kcal<=0){
    err.textContent = 'Enter a food name and a valid calorie value';
    err.style.display='block';
    return;
  }
  const mBasis = manualMeasure();
  const countable = document.getElementById('m-countable').checked;
  const mUnitName = countable ? document.getElementById('m-unit-name').value.trim().toLowerCase() : '';
  const mUnitSize = countable ? (Number(document.getElementById('m-unit-size').value) || 0) : 0;
  if(countable && (!mUnitName || mUnitSize <= 0)){
    err.textContent = 'Name the unit and give the size of one, or untick "count this in units"';
    err.style.display = 'block';
    return;
  }
  err.style.display='none';
  // "One bar, 210 kcal, 45 g" is how a wrapper reads. If the size of one is
  // given and the portion is left blank, the portion IS one — no reason to make
  // him type 45 twice.
  let grams = Number(document.getElementById('m-qty').value)||null;
  if(!grams && mUnitSize > 0) grams = mUnitSize;
  const protein = Number(document.getElementById('m-protein').value)||0;
  const carbs   = Number(document.getElementById('m-carbs').value)||0;
  const fat     = Number(document.getElementById('m-fat').value)||0;

  // The packet figures, if they were given. null and 0 are different answers:
  // "no saturated fat on the label" and "the label says zero" score differently,
  // and collapsing them would invent data.
  const opt = id => {
    const v = document.getElementById(id).value;
    return v === '' ? null : (Number(v) || 0);
  };
  const mSugar = opt('m-sugar'), mSat = opt('m-sat'),
        mFibre = opt('m-fibre'), mSalt = opt('m-salt');
  // Packets print salt, the score works in sodium: 2.5 g salt = 1000 mg sodium.
  const mSodium = mSalt === null ? null : mSalt * 1000 / 2.5;

  const remember = document.getElementById('m-remember');
  if(!remember || remember.checked){
    // Placed here so the block below reads in one piece; see manualMeasure().
    // Convert what you typed to a per-100g basis so it can be portioned later.
    // With a weight given, that is straight arithmetic. Without one, the numbers
    // describe one serving, so the food is stored as a serving that happens to
    // weigh 100g — logging "1 serving" then reproduces exactly what you entered.
    const scale = grams && grams > 0 ? (100 / grams) : 1;
    const micros = {};
    if(mFibre  !== null) micros.fiber  = mFibre * scale;
    if(mSodium !== null) micros.sodium = mSodium * scale;
    rememberFood({
      ...(pendingBarcode ? {sug100: null, sat100: null, fv100: null, novaOverride: null,
                            additives: null, startAmount: null, micros100: {}, brand: null} : {}),
      name: name,
      code: pendingBarcode,
      ...(mBrand ? {brand: mBrand} : {}),
      kcal100: kcal * scale,
      p100: protein * scale,
      c100: carbs * scale,
      f100: fat * scale,
      // Only sent when given. applyFoodFields treats an absent key as "leave
      // what is stored alone", so re-saving a food without retyping the packet
      // figures cannot wipe the ones already on it.
      ...(mSugar  !== null ? {sug100: mSugar * scale} : {}),
      ...(mSat    !== null ? {sat100: mSat   * scale} : {}),
      ...(Object.keys(micros).length ? {micros100: micros} : {}),
      basis: mBasis,
      // A named unit with a size is what makes every later portion work out on
      // its own. Without a weight at all, the numbers describe one serving, so
      // the food is stored as a serving that happens to be 100 — logging "1
      // serving" then reproduces exactly what was typed.
      unitName:  mUnitName || (grams && grams > 0 ? null : 'serving'),
      unitGrams: mUnitSize || (grams && grams > 0 ? null : 100)
    });
  }

  addEntry({
    name, kcal,
    ...(mBrand ? {brand: mBrand} : {}),
    grams: grams,
    basis: mBasis,
    qty:  (mUnitName && mUnitSize) ? round2(grams/mUnitSize) : null,
    unit: (mUnitName && mUnitSize) ? mUnitName : null,
    protein: protein,
    carbs: carbs,
    fat: fat,
    // On the entry these are the amounts IN the portion, which is what was
    // typed - no scaling, unlike the per-100 figures stored on the food.
    sugar: mSugar,
    sat: mSat,
    micros: (function(){
      const m = {};
      if(mFibre  !== null) m.fiber  = mFibre;
      if(mSodium !== null) m.sodium = mSodium;
      return m;
    })(),
    meal: selectedMeal
  });
  clearManualForm();
  closeSheet('add-backdrop');
};

