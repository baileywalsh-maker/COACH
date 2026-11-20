// ---- Edit a logged item ----
// Entries store computed totals, not per-100g values. For anything with a
// weight we can recover the per-100g figures by dividing, which is what lets
// the amount be changed after the fact.
let editingIdx = null, eeMode = 'gram', eeFood = null;

// ownOnly leaves out anything the log borrowed to fill a blank, for the
// places that edit or save a food - so an estimate never becomes "yours".
function per100From(e, ownOnly){
  if(!e.grams || e.grams <= 0) return null;
  const f = 100 / e.grams;
  const m = e.micros || {};
  const fl = (ownOnly && e._fill) ? e._fill : {};
  const micros = {};
  Object.keys(m).forEach(k=>{ if(m[k] != null && !(k in fl && fl[k].v === m[k])) micros[k] = m[k]*f; });
  const sugOwn = ('sugar' in fl && fl.sugar.v === e.sugar) ? null : e.sugar;
  const satOwn = ('sat' in fl && fl.sat.v === e.sat) ? null : e.sat;
  return {
    // The name travels too. Without it the packet sheet titled itself
    // "undefined" and saved every figure you typed under the key "undefined",
    // where nothing could ever read it back.
    name: e.name,
    code: e.code || null,
    ...(e.brand ? {brand: e.brand} : {}),
    kcal100: (e.kcal||0)*f, p100: (e.protein||0)*f,
    c100: (e.carbs||0)*f, f100: (e.fat||0)*f,
    // And so do the figures the score is actually built on. Rescaling an
    // entry used to move the calories and leave these frozen at the old
    // amount, which quietly broke every score that reads them.
    sug100: sugOwn == null ? null : (sugOwn||0)*f,
    sat100: satOwn == null ? null : (satOwn||0)*f,
    micros100: micros,
    // Which plain food the log matched this to, so the score can tell that a
    // scanned "Tesco British Semi Skimmed Milk" is milk rather than something
    // it has never heard of.
    // `keys` is the list of figures that are borrowed and still in this food,
    // so adding it to the log again stores only what was really yours.
    gapFill: (function(){
      const keys = (ownOnly || !e._fill) ? [] : Object.keys(e._fill).filter(k=>{
        const x = e._fill[k];
        if(!x) return false;
        if(k === 'sugar') return e.sugar === x.v;
        if(k === 'sat') return e.sat === x.v;
        return m[k] === x.v;
      });
      if(!e._fillFrom && !keys.length) return undefined;
      return {name: e._fillFrom || null, keys: keys};
    })(),
    unitName: e.unit || null, unitGrams: (e.qty && e.unit && e.qty>0) ? e.grams/e.qty : null,
    ...(e.perItem ? {perItem: true} : {}),
    // The measure travels with the entry, not with the food, because the food
    // may have been re-measured since this line was logged.
    basis: entryBasis(e)
  };
}

// Which entry the detail sheet is showing.
let detailIdx = null;


/* ---- where a number came from ----
   Four sources, and they do not carry equal weight. A barcode is the label of
   the exact thing you ate. A reference database describes a typical example of
   that food, which is a different and weaker claim. Showing which is which is
   what makes the precedence rule something you can check rather than trust.  */
function entrySource(e){
  const name = (e && e.name) || '';
  if(!name) return null;
  if(labelFor(name)){
    return {tag:'yours', text:'You corrected these numbers off the packet. Nothing overwrites them.'};
  }
  const mine = (typeof loadMyFoods === 'function' ? loadMyFoods() : [])
    .filter(f => String(f.name||'').toLowerCase() === name.toLowerCase())[0];
  if(mine){
    const gm = (typeof gfMatch === 'function') ? gfMatch(myFoodRecordToFood(mine)) : null;
    const tail = gm ? ' Anything the label doesn’t list is filled from “'+gm.name+'” ('+
      gm.full+'), so you still get the vitamins and minerals.' : '';
    return mine.code
      ? {tag:'scan', text:'From the barcode you scanned. A label beats any database, so these win.'+tail}
      : {tag:'yours', text:'One of your own foods. These are the numbers you gave it.'+tail};
  }
  const isLocal = (typeof LOCAL_FOODS !== 'undefined') &&
                  LOCAL_FOODS.some(f => f[0] === name);
  if(!isLocal) return null;
  const nfm = (typeof nfMatchFor === 'function') ? nfMatchFor(name) : null;
  const fill = (typeof fdcFillFor === 'function') ? fdcFillFor(name) : null;
  // Naming the food it was matched to is what makes the match checkable. A
  // wrong match is invisible otherwise, and that is the whole risk with
  // joining two food lists by name.
  if(nfm){
    return {tag:'mixed', text:'COACH’s own figures, with the blanks filled from '+
      nfm.full+' — matched to “'+nfm.name+'”. Scan the packet and yours '+
      'will replace them.'};
  }
  const extra = (typeof extraFillFor === 'function') ? extraFillFor(name) : null;
  if(extra){
    return {tag:'mixed', text: extra.tag === 'Recipe'
      ? 'COACH’s own figures, with the blanks worked out from what it’s made of: '+extra.from+'. Scan the packet and yours will replace them.'
      : 'COACH’s own figures, with the blanks filled from “'+extra.from+'”. Scan the packet and yours will replace them.'};
  }
  return fill
    ? {tag:'mixed', text:'COACH’s own figures, with the blanks filled from USDA. Scan the packet and yours will replace them.'}
    : {tag:'built', text:'COACH’s built-in figures for this food. Scan the packet for the exact ones.'};
}

// Which nutrients on a built-in food arrived from USDA rather than from COACH.
// Only meaningful for a built-in food: a scanned product never receives a fill.
function filledKeysFor(name){
  const out = {};
  if(typeof LOCAL_FOODS === 'undefined' || !LOCAL_FOODS.some(f => f[0] === name)) return out;
  // A key is borrowed only where COACH had nothing of its own, and the merge
  // in microsForLocal works the same way, so this reports what happened rather
  // than guessing at it. The value says WHICH table it came from, because a UK
  // lab figure and an American one are not the same claim about your dinner.
  const own = {};
  const row = MICRO_DB[name];
  if(row){
    own['fiber'] = row[0] != null;
    MICRO_ORDER.slice(1).forEach((k,i)=>{ own[k] = row[i+2] != null; });
  }
  const x = EXTRA_MICRO[name];
  if(x) for(const k in x) own[k] = true;

  const chain = (typeof nfFillChain === 'function') ? nfFillChain(name) : [];
  chain.forEach(s=>{
    Object.keys(s.micros).forEach(k=>{ if(!own[k] && !out[k]) out[k] = s.table; });
  });
  const extra = (typeof extraFillFor === 'function') ? extraFillFor(name) : null;
  if(extra) Object.keys(extra.micros).forEach(k=>{ if(!own[k] && !out[k]) out[k] = extra.tag; });
  const fill = (typeof fdcFillFor === 'function') ? fdcFillFor(name) : null;
  if(fill) Object.keys(fill).forEach(k=>{ if(!own[k] && !out[k]) out[k] = 'USDA'; });
  return out;
}

// Where a looked-up figure came from, for any food - including the ones that
// are not in the built-in list, which filledKeysFor() does not cover.
function webFilledKeysFor(name){
  const out = {};
  const L = (typeof labelFor === 'function') ? labelFor(name) : null;
  if(L && L.web && L.web.micros){
    Object.keys(L.web.micros).forEach(k=>{ if(L.web.micros[k] != null) out[k] = L.web.tag || 'looked up'; });
  }
  return out;
}


/* ---- the Body view ---- */
let nutrientView = 'body';

const SYS_COL = {good:'var(--accent)', low:'var(--caution)', short:'var(--danger)',
                 none:'var(--border)'};
function sysTone(pct){
  if(pct === null) return 'none';
  return pct >= 80 ? 'good' : pct >= 55 ? 'low' : 'short';
}



/* Every nutrient now says what it is for. The words already existed - each
   system describes what each of its nutrients does - so this reads them back
   the other way round: given a nutrient, which parts of you need it and why.
   That means all 42 are covered without a second set of text to keep in step,
   and the chips walk you through to those parts of the body. */
// Anything worked out rather than measured says so, everywhere it appears.
function estimatedNote(spec){
  if(!spec || !spec.estimated) return '';
  return '<div class="dp-foot" style="margin-top:8px;">Worked out from the protein you ate — '+
    'no food table COACH carries lists amino acids separately. '+
    Math.round((spec.fromProtein || 0) * 1000) / 10 + ' g per 100 g of protein is the mixed-diet '+
    'average; a day built on bread and rice runs lower, a day of meat, fish, eggs and dairy a '+
    'little higher.</div>';
}

function nutrientInfoHTML(key){
  if(!key) return '';
  const hits = SYSTEMS.filter(sy=>sy.does && sy.does[key]);
  if(!hits.length) return '';
  const seen = {};
  const rows = hits.filter(sy=>{
    const t = String(sy.does[key]).trim().toLowerCase();
    if(seen[t]) return false;
    seen[t] = 1;
    return true;
  });
  return '<div class="bd-lab" style="margin-top:20px;"><span>What it does</span>'+
    '<span>'+hits.length+' part'+(hits.length===1?'':'s')+' of you</span></div>'+
    '<div class="ninfo">'+rows.map(sy=>'<div class="ninfo-r">'+
      '<span class="ni-ico">'+sy.ico+'</span><div>'+
      '<div class="ni-n">'+esc(sy.n)+'</div>'+
      '<div class="ni-t">'+esc(sy.does[key])+'</div></div></div>').join('')+'</div>'+
    (hits.length > 1
      ? '<div class="ni-chips">'+hits.map(sy=>'<button data-nisys="'+esc(sy.k)+'">'+
        sy.ico+' '+esc(sy.n)+'</button>').join('')+'</div>'
      : '');
}

