/* ============================ v110 - one nutrient sheet =====================
   Every figure for a food in one place, in one order. Calories and the three
   macros come first, each with its parts underneath it - fibre and sugars
   under carbohydrate, the fats under fat. Everything else sits under the part
   of the body it mainly serves, alphabetically. A nutrient appears once.

   Nothing is stored in a new place except calories and macros (`mac` on the
   food's label record). Sugars, saturates, fibre, salt and the rest go where
   the two older sheets put them, so figures typed before this still show.  */
const NUT_PRIMARY = {
  calcium:'bones', phosphorus:'bones', 'vitamin-d':'bones', 'vitamin-k':'bones',
  magnesium:'muscle', potassium:'muscle',
  iron:'blood', copper:'blood', 'vitamin-b9':'blood', 'vitamin-b12':'blood',
  choline:'brain', 'vitamin-b6':'brain',
  zinc:'immune', 'vitamin-a':'immune', 'vitamin-c':'immune',
  'vitamin-b1':'energy', 'vitamin-b2':'energy', 'vitamin-pp':'energy', 'vitamin-b5':'energy',
  'vitamin-b7':'skin',
  iodine:'thyroid', selenium:'thyroid', chromium:'thyroid',
  'vitamin-e':'cells', manganese:'cells',
  molybdenum:'liver', sodium:'heart'
};
const NUT_FAT_SUBS = ['cholesterol','epadha','monofat','omega3','omega6','polyfat','transfat'];
let nutFood = null, nutCtx = null, nutEdits = {};

function nutLayout(){
  const byK = {};
  microEditable().forEach(m=>{ byK[m.k] = m; });
  const az = (a, b)=> a.n.localeCompare(b.n);
  const fatSubs = NUT_FAT_SUBS.filter(k=>byK[k]).map(k=>({id:k, n:byK[k].n, u:byK[k].u, sub:true}));
  fatSubs.push({id:'satfat', n:'Saturated fat', u:'g', sub:true});
  fatSubs.sort(az);
  const secs = [{n:'Energy and macros', ico:'', rows:[
    {id:'kcal', n:'Calories', u:'kcal', par:true, mac:true},
    {id:'carbs', n:'Carbohydrate', u:'g', par:true, mac:true},
    {id:'fiber', n:'Fibre', u:'g', sub:true},
    {id:'sugar', n:'Sugars', u:'g', sub:true},
    {id:'fat', n:'Fat', u:'g', par:true, mac:true}
  ].concat(fatSubs).concat([{id:'protein', n:'Protein', u:'g', par:true, mac:true}])}];
  const used = {fiber:1};
  NUT_FAT_SUBS.forEach(k=>{ used[k] = 1; });
  const bySys = {};
  microEditable().forEach(m=>{
    if(used[m.k]) return;
    let sys = NUT_PRIMARY[m.k];
    if(!sys){ const hit = SYSTEMS.filter(x=>x.does && x.does[m.k])[0]; sys = hit ? hit.k : '_other'; }
    (bySys[sys] = bySys[sys] || []).push(
      m.k === 'sodium' ? {id:'sodium', n:'Salt', u:'g'} : {id:m.k, n:m.n, u:m.u});
  });
  const sysSecs = Object.keys(bySys).map(k=>{
    const S = SYSTEMS.filter(x=>x.k === k)[0];
    return {n: S ? S.n : 'Other', ico: S ? S.ico : '', rows: bySys[k].sort(az)};
  }).sort(az);
  return secs.concat(sysSecs);
}
function nutCur(food, id){
  const m = food.micros100 || {};
  if(id === 'kcal') return food.kcal100;
  if(id === 'protein') return food.p100;
  if(id === 'carbs') return food.c100;
  if(id === 'fat') return food.f100;
  if(id === 'sugar') return food.sug100;
  if(id === 'satfat') return food.sat100;
  if(id === 'sodium') return m.sodium == null ? null : m.sodium * 2.5 / 1000;
  return m[id];
}
function nutOwn(L, id){
  const mi = (L.micros && typeof L.micros === 'object') ? L.micros : {};
  const mac = (L.mac && typeof L.mac === 'object') ? L.mac : {};
  if(id === 'kcal') return mac.kcal;
  if(id === 'protein') return mac.p;
  if(id === 'carbs') return mac.c;
  if(id === 'fat') return mac.f;
  if(id === 'sugar') return L.sug;
  if(id === 'satfat') return L.sat;
  if(id === 'fiber') return mi.fiber != null ? mi.fiber : L.fib;
  if(id === 'sodium'){
    const sd = mi.sodium != null ? mi.sodium : L.sod;
    return sd == null ? null : sd * 2.5 / 1000;
  }
  return mi[id];
}
function nutNum(v){
  if(v == null || !isFinite(v)) return '';
  return String(Number(Number(v).toPrecision(4)));
}
function nutPer(){ return (nutCtx && nutCtx.basis === 'portion' && nutCtx.grams > 0) ? nutCtx.grams / 100 : 1; }

/* Works out what the sheet is being opened FROM, so the one button behaves the
   same everywhere: on a logged item it shows your portion, on the card it
   knows the amount in the box, anywhere else it is plain per-100. */
function openNutFor(food){
  const fdOpen = document.getElementById('fooddet-backdrop').classList.contains('open');
  if(fdOpen && detailIdx !== null && detailIdx !== undefined){
    const e = loadEntries(currentDate)[detailIdx];
    if(e){
      const per = per100From(e);
      if(!per){
        alert('This was entered by hand without a weight, so there are no per-100 figures to show. Delete it and add it again with an amount.');
        return;
      }
      const tags = {};
      if(e._fill) Object.keys(e._fill).forEach(k=>{ if(e._fill[k] && e._fill[k].t) tags[k] = e._fill[k].t; });
      return openNutSheet(applyLabel(per), {entryIdx: detailIdx, grams: Number(e.grams) || 0, basis: 'portion', tags: tags});
    }
  }
  if(!food) return;
  const pOpen = document.getElementById('portion-backdrop').classList.contains('open');
  let g = 0;
  if(pOpen && pendingFood && pendingFood.name === food.name){ try{ g = portionGrams(); }catch(e){ g = 0; } }
  return openNutSheet(food, {entryIdx: null, grams: g, basis: 'per100'});
}
function openNutSheet(food, opts){
  if(!food) return;
  const same = nutFood && nutCtx && nutFood.name === food.name;
  nutCtx = opts ? {entryIdx: (opts.entryIdx === undefined ? null : opts.entryIdx), grams: opts.grams || 0,
                   basis: opts.basis || 'per100', tags: opts.tags || null}
                : (same ? nutCtx : {entryIdx: null, grams: 0, basis: 'per100', tags: null});
  nutFood = food;
  nutEdits = {};
  document.getElementById('nut-title').textContent = food.name;
  document.getElementById('nut-err').style.display = 'none';
  const blanks = (typeof luBlankCount === 'function') ? luBlankCount(food) : 0;
  const lub = document.getElementById('nut-lookup');
  lub.style.display = blanks > 0 ? '' : 'none';
  lub.textContent = 'Look up ' + blanks + ' missing';
  nutRender();
  const sh = document.querySelector('#nut-backdrop .sheet');
  if(sh) sh.scrollTop = 0;
  openSheet('nut-backdrop');
}
function nutRender(){
  const food = nutFood;
  if(!food) return;
  const L = labelFor(food.name) || {};
  const per = nutPer();
  const ml = food.basis === 'ml';
  const filled = Object.assign(
    (typeof filledKeysFor === 'function') ? filledKeysFor(food.name) : {},
    (typeof webFilledKeysFor === 'function') ? webFilledKeysFor(food.name) : {},
    nutCtx.tags || {});
  const tabs = document.getElementById('nut-basis');
  tabs.style.display = nutCtx.grams > 0 ? 'flex' : 'none';
  const pi = !!food.perItem;
  const piU = pi ? String(food.unitName || 'item') : '';
  document.getElementById('nut-b-portion').textContent = pi ? 'What you had' : 'This portion (' + nutNum(nutCtx.grams) + (ml ? ' ml' : ' g') + ')';
  document.getElementById('nut-b-100').textContent = pi ? 'Per ' + piU : (ml ? 'Per 100 ml' : 'Per 100 g');
  tabs.querySelectorAll('[data-nb]').forEach(b=>b.classList.toggle('active', b.dataset.nb === nutCtx.basis));
  document.getElementById('nut-sub').innerHTML =
    (luJustFilled ? '<b style="color:var(--accent)">' + esc(luJustFilled) + '</b> ' : '') +
    (per === 1 ? (pi ? 'Amounts per ' + piU + ', as the shop publishes them. ' : 'Amounts per ' + (ml ? '100 ml' : '100 g') + ', as a packet prints them. ')
               : 'Amounts in the portion you had. ') +
    'Grey numbers are what COACH already has. Type over any of them and yours wins.';
  luJustFilled = '';
  const unit = u => u === 'ug' ? '\u00b5g' : u;
  const tagKey = {satfat:'sat'};
  document.getElementById('nut-body').innerHTML = nutLayout().map(sec=>
    '<div class="section-title nu-h">' + (sec.ico ? sec.ico + ' ' : '') + esc(sec.n) + '</div>' +
    sec.rows.map(r=>{
      const own = (r.id in nutEdits) ? nutEdits[r.id] : nutOwn(L, r.id);
      const cur = nutCur(food, r.id);
      const from = own != null ? 'yours'
                 : (cur == null ? 'not recorded' : (r.mac ? '' : String(filled[tagKey[r.id] || r.id] || '').toLowerCase()));
      return '<div class="me-row' + (r.par ? ' nu-par' : '') + (r.sub ? ' nu-sub' : '') + '">' +
        '<span class="me-n">' + esc(r.n) + '<s>' + unit(r.u) + (from ? ' \u00b7 ' + esc(from) : '') + '</s></span>' +
        '<input type="number" inputmode="decimal" step="any" min="0" data-nut="' + esc(r.id) + '" ' +
        'value="' + (own != null ? nutNum(own * per) : '') + '" ' +
        'placeholder="' + (cur == null ? '\u2014' : nutNum(cur * per)) + '"></div>';
    }).join('')).join('');
}
function nutFixEntry(idx, name, macs){
  // The line already in your log, at the amount you had. Only the figures you
  // just changed move; everything else on it stays as it was.
  if(idx === null || idx === undefined) return;
  const es = loadEntries(currentDate);
  const e = es[idx];
  const g = e ? Number(e.grams) || 0 : 0;
  if(!e || e.name !== name || !(g > 0)) return;
  const s = g / 100;
  let hit = false;
  const mi = Object.assign({}, e.micros || {});
  Object.keys(macs).forEach(id=>{
    const v = macs[id];
    if(v == null || !isFinite(v)) return;   // a cleared box leaves the line alone
    hit = true;
    if(id === 'kcal' || id === 'protein' || id === 'carbs' || id === 'fat') e[id] = Math.round(v * s);
    else if(id === 'sugar') e.sugar = Math.round(v * s * 10) / 10;
    else if(id === 'satfat') e.sat = Math.round(v * s * 10) / 10;
    else if(id === 'sodium') mi.sodium = Math.round(v * 1000 / 2.5) * s;   // typed as salt, kept as sodium
    else mi[id] = v * s;
  });
  if(hit){ e.micros = mi; saveEntries(currentDate, es); }
}
function nutSave(){
  const food = nutFood;
  if(!food) return;
  const errEl = document.getElementById('nut-err');
  const L = labelFor(food.name) || {};
  const eff = id => (id in nutEdits) ? nutEdits[id] : (nutOwn(L, id) != null ? nutOwn(L, id) : nutCur(food, id));
  // A part cannot be bigger than the whole. Only checked on what you just
  // typed, so a rounding quirk already in a database never blocks a save.
  const subs = [['sugar','carbs','Sugars','carbohydrate'], ['fiber','carbs','Fibre','carbohydrate'],
                ['satfat','fat','Saturated fat','fat'], ['transfat','fat','Trans fat','fat'],
                ['monofat','fat','Monounsaturated','fat'], ['polyfat','fat','Polyunsaturated','fat'],
                ['omega3','fat','Omega-3','fat'], ['omega6','fat','Omega-6','fat']];
  for(const c of subs){
    if(!(c[0] in nutEdits) && !(c[1] in nutEdits)) continue;
    const a = eff(c[0]), b = eff(c[1]);
    if(a != null && b != null && a > b * 1.02 + 0.05){
      errEl.textContent = c[2] + ' cannot be more than the ' + c[3] + ' it is part of. Check those two numbers.';
      errEl.style.display = 'block';
      return;
    }
  }
  if('kcal' in nutEdits && nutEdits.kcal !== null && !(nutEdits.kcal > 0)){
    errEl.textContent = 'Calories has to be above zero. Clear the box to go back to the original figure.';
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';
  const micros = Object.assign({}, (L.micros && typeof L.micros === 'object') ? L.micros : {});
  const mac = Object.assign({}, (L.mac && typeof L.mac === 'object') ? L.mac : {});
  const patch = {};
  const macKey = {kcal:'kcal', protein:'p', carbs:'c', fat:'f'};
  const macNow = Object.assign({}, nutEdits);
  let macTouched = false;
  Object.keys(nutEdits).forEach(id=>{
    const v = nutEdits[id];
    if(macKey[id]){
      macTouched = true;
      if(v == null) delete mac[macKey[id]]; else mac[macKey[id]] = v;
    }
    else if(id === 'sugar') patch.sug = v;
    else if(id === 'satfat') patch.sat = v;
    else if(id === 'fiber'){ patch.fib = v; delete micros.fiber; }
    else if(id === 'sodium'){ patch.sod = v == null ? null : Math.round(v * 1000 / 2.5); delete micros.sodium; }
    else if(v == null) delete micros[id];
    else micros[id] = v;
  });
  patch.micros = Object.keys(micros).length ? micros : null;
  if(macTouched) patch.mac = Object.keys(mac).length ? mac : null;
  if(!saveLabel(food.name, patch)) return;
  buzz();
  const ctx = nutCtx;
  closeSheet('nut-backdrop');
  nutFixEntry(ctx.entryIdx, food.name, macNow);
  nutAfterChange(ctx);
}
function nutAfterChange(ctx){
  if(pendingFood && nutFood && pendingFood.name === nutFood.name){
    pendingFood = applyLabel(pendingFood);
    try{ updatePortionPreview(); }catch(e){}
  }
  try{ renderDay(); }catch(e){}
  if(ctx && ctx.entryIdx !== null && ctx.entryIdx !== undefined &&
     document.getElementById('fooddet-backdrop').classList.contains('open')){
    try{ openFoodDetail(ctx.entryIdx); }catch(e){}
  }
}
(function wireNutSheet(){
  const body = document.getElementById('nut-body');
  if(!body) return;
  body.addEventListener('input', ev=>{
    const el = ev.target;
    if(!el || !el.dataset || !el.dataset.nut) return;
    const raw = String(el.value).trim();
    if(raw === ''){ nutEdits[el.dataset.nut] = null; return; }
    const v = Number(raw);
    if(isFinite(v) && v >= 0) nutEdits[el.dataset.nut] = v / nutPer();
  });
  document.querySelectorAll('#nut-basis [data-nb]').forEach(b=>{
    b.onclick = ()=>{ if(!nutCtx) return; nutCtx.basis = b.dataset.nb; nutRender(); };
  });
  document.getElementById('nut-cancel').onclick = ()=>{
    const ctx = nutCtx;
    closeSheet('nut-backdrop');
    // A photo or a lookup may have changed the food while this was open.
    if(ctx && ctx.entryIdx !== null && ctx.entryIdx !== undefined &&
       document.getElementById('fooddet-backdrop').classList.contains('open')){
      try{ openFoodDetail(ctx.entryIdx); }catch(e){}
    }
  };
  document.getElementById('nut-save').onclick = nutSave;
  document.getElementById('nut-clear').onclick = ()=>{
    if(!nutFood) return;
    if(!confirm('Drop every figure you typed for ' + nutFood.name + '? The originals and the databases fill back in behind them.')) return;
    saveLabel(nutFood.name, {sug: null, sat: null, fib: null, sod: null, micros: null, mac: null});
    const ctx = nutCtx;
    closeSheet('nut-backdrop');
    nutAfterChange(ctx);
  };
  document.getElementById('nut-photo').onclick = ()=>{
    const f = nutFood;
    closeSheet('nut-backdrop');
    setTimeout(()=>openOcrSheet(f, ()=>setTimeout(()=>openNutSheet(applyLabel(f)), HANDOFF)), HANDOFF);
  };
  document.getElementById('nut-lookup').onclick = ()=>{
    const f = nutFood;
    closeSheet('nut-backdrop');
    setTimeout(()=>openLookup(f), HANDOFF);
  };
})();

function openMicroEditor(food){ return openNutSheet(food); }

/* v117: the 8th slot of a built-in row is EITHER a list of extra search words
   ("Pot Noodle ... instant noodle snack") OR the number 1, meaning "these
   figures are for one item". v115 read any value there as the second, so 143
   ordinary foods - Pot Noodle, toasties - were shown with no weight, no score
   and no grams option. Calories were never affected. Only the number 1 means
   per item now. */
function isPerItemRow(f){ return !!f && f[7] === 1; }
function rowAlias(f){ return (f && typeof f[7] === 'string') ? f[7] : ''; }
function localToFood(f){
  const m = isPerItemRow(f) ? {micros: {}} : microsForLocal(f[0]);
  const L = labelDbFor(f[0]);
  const micros = Object.assign({}, m.micros);
  if(L){
    // null is "not known", and must not arrive as a measured zero.
    if(micros.fiber == null && L.fib != null) micros.fiber = L.fib;
    if(micros.sodium == null && L.sod != null) micros.sodium = L.sod;
  }
  const satOwn = (f[4] === 0 ? 0 : (L && L.sat != null ? L.sat : null));
  const sugOwn = (m.sugars != null ? m.sugars : (L && L.sug != null ? L.sug : null));
  return applyLabel({
    name: f[0], kcal100: f[1], p100: f[2], c100: f[3], f100: f[4],
    // A food with no fat has no saturated fat. Arithmetic, not a guess.
    sat100: satOwn != null ? satOwn : (m.satFill != null ? m.satFill : null),
    sug100: sugOwn != null ? sugOwn : (m.sugFill != null ? m.sugFill : null), micros100: micros,
    unitName: f[5] || null, unitGrams: f[6] || null,
    basis: LIQUID_FOODS.has(f[0]) ? 'ml' : 'g',
    src: 'local',
    ...(isPerItemRow(f) ? {perItem: true} : {})
  });
}

