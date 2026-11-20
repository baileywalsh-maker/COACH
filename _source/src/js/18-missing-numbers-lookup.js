/* ============================================================
   v90 - looking the missing numbers up
   A phone app cannot read any page on the web: the browser will not let it,
   and there is no site that will hand over a nutrition panel on request. What
   it CAN do is ask the databases where that data actually lives - Open Food
   Facts, which holds the printed panel off millions of packets, and the USDA's
   list, which holds the lab work - and that covers the case this is for: a
   branded product whose label you would otherwise be typing in by hand.

   Rules, all of them the same rule in different places:
     - it only ever fills a BLANK. Anything already there, whether COACH put it
       there or you did, is left exactly as it is;
     - nothing is written until you have looked at the match and tapped it;
     - a match has to agree with the numbers you already have, so a different
       product with a similar name cannot quietly overwrite yours.
   ============================================================ */

// How well a candidate's macros agree with the ones already on the food. A
// packet and its database entry should be within a few per cent; anything
// further apart is a different product.
function luAgreement(mine, cand){
  const pairs = [['kcal100', 0.15, 20], ['p100', 0.25, 2], ['c100', 0.25, 3], ['f100', 0.25, 2]];
  let checked = 0, ok = 0;
  const bad = [];
  pairs.forEach(([k, frac, floor])=>{
    const a = Number(mine[k]), b = Number(cand[k]);
    if(!(a > 0) || b == null || isNaN(b)) return;
    checked++;
    const room = Math.max(a * frac, floor);
    if(Math.abs(a - b) <= room) ok++;
    else bad.push(k);
  });
  return {checked: checked, ok: ok, bad: bad,
          pass: checked === 0 ? false : (ok === checked),
          near: checked > 0 && ok >= checked - 1};
}

// What a candidate would actually add: the blanks it can fill.
function luWouldFill(mine, cand){
  const have = mine.micros100 || {};
  const got = cand.micros100 || {};
  const keys = Object.keys(got).filter(k=>got[k] != null && have[k] == null);
  const macro = [];
  if(mine.sug100 == null && cand.sug100 != null) macro.push('sugars');
  if(mine.sat100 == null && cand.sat100 != null) macro.push('saturates');
  return {keys: keys, macro: macro, n: keys.length + macro.length};
}

function luFromOffProduct(p){
  const n = p.nutriments || {};
  if(n['energy-kcal_100g'] == null) return null;
  return {
    name: (p.product_name || 'Product') +
          (p.brands ? ' (' + String(p.brands).split(',')[0].trim() + ')' : ''),
    src: 'Open Food Facts', tag: 'off', code: p.code || null,
    kcal100: Number(n['energy-kcal_100g']) || 0,
    p100: Number(n['proteins_100g']) || 0,
    c100: Number(n['carbohydrates_100g']) || 0,
    f100: Number(n['fat_100g']) || 0,
    sug100: (n['sugars_100g'] === undefined ? null : Number(n['sugars_100g'])),
    sat100: (n['saturated-fat_100g'] === undefined ? null : Number(n['saturated-fat_100g'])),
    micros100: extractMicros(n)
  };
}

// Everywhere worth asking, in the order worth asking. Each source is allowed
// to fail on its own without taking the others down with it.
async function luCandidates(food){
  const out = [];
  // Every source is allowed to fail on its own. If they ALL fail, that is not
  // "nothing matches", it is no connection, and saying the wrong one of those
  // sends you off photographing a packet for no reason.
  let tried = 0, failed = 0;
  const attempt = async fn => {
    tried++;
    try{ return await fn(); }
    catch(e){ failed++; return null; }
  };
  const name = String(food.name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  const brandy = String(food.name || '').trim();

  if(food.code){
    const byCode = await attempt(()=>offByCode(food.code));
    (byCode || []).forEach(p=>{ const c = luFromOffProduct(p); if(c){ c.exact = true; out.push(c); } });
  }
  for(const term of [brandy, name]){
    if(!term || out.length >= 12) continue;
    const hits = await attempt(()=>offSearch(term));
    (hits || []).slice(0, 10).forEach(p=>{ const c = luFromOffProduct(p); if(c) out.push(c); });
  }
  if(!out.length){
    const hits = await attempt(()=>offSearchLegacy(name));
    (hits || []).slice(0, 10).forEach(p=>{ const c = luFromOffProduct(p); if(c) out.push(c); });
  }
  // The USDA list, when a key has been set. Branded first - that is what this
  // is for - then the lab rows, which carry far more nutrients.
  if(typeof fdcKey === 'function' ? fdcKey() : false){
    for(const branded of [true, false]){
      if(out.length >= 16) break;
      {
        const rows = (await attempt(()=>fdcSearch(name, {branded: branded}))) || [];
        rows.slice(0, 6).forEach(r=>{
          let f = null;
          try{ f = fdcToFood(r); }catch(e){}
          if(!f || !(f.kcal100 > 0)) return;
          out.push({name: f.name, src: branded ? 'USDA branded' : 'USDA', tag: 'usda',
                    kcal100: f.kcal100, p100: f.p100, c100: f.c100, f100: f.f100,
                    sug100: f.sug100 == null ? null : f.sug100,
                    sat100: f.sat100 == null ? null : f.sat100,
                    micros100: f.micros100 || {}});
        });
      }
    }
  }
  /* The tables COACH already carries - UK CoFID, the Australian one, its own
     794 foods - matched on what this food plainly IS. A branded label prints
     about eight numbers; the plain food behind it carries thirty. This is
     usually the biggest single win on the list, so it belongs on it. */
  try{
    const m = (typeof gfMatch === 'function') ? gfMatch(food) : null;
    if(m && m.micros){
      out.push({name: m.name, src: m.full || m.table, tag: 'table', table: true,
                kcal100: food.kcal100, p100: food.p100, c100: food.c100, f100: food.f100,
                sug100: m.sug100 == null ? null : m.sug100,
                sat100: m.sat100 == null ? null : m.sat100,
                micros100: m.micros});
    }
  }catch(e){}

  /* Only now is it fair to call it a connection problem: the tables above need
     no signal, so if one of them matched there IS something to show. */
  if(tried > 0 && failed === tried){
    if(!out.length){
      const err = new Error('offline');
      err.offline = true;
      throw err;
    }
    // Something to show, but not everything there should be - say so.
    out.noSignal = true;
  }

  // Drop the duplicates the sources share.
  const seen = {}, uniq = [];
  uniq.noSignal = out.noSignal;
  out.forEach(c=>{
    const k = (c.code || '') + '|' + c.name.toLowerCase();
    if(seen[k]) return;
    seen[k] = 1;
    uniq.push(c);
  });
  return uniq;
}

let luFood = null, luSeq = 0, luJustFilled = '';

function luRender(list, state, noSignal){
  const box = document.getElementById('lu-body');
  const sub = document.getElementById('lu-sub');
  if(!box) return;
  if(state === 'busy'){
    sub.textContent = 'Asking Open Food Facts' +
      ((typeof fdcKey === 'function' && fdcKey()) ? ' and the USDA list' : '') + '…';
    box.innerHTML = '<div class="lu-busy">Looking…</div>';
    return;
  }
  if(state === 'offline'){
    sub.textContent = '';
    box.innerHTML = '<div class="bd-empty">No connection. This one needs the internet — '+
      'try again when you have signal, or photograph the panel instead.</div>';
    return;
  }
  const blanks = luBlankCount(luFood);
  sub.innerHTML = 'Matches for <b>' + esc(luFood.name) + '</b>. Tap one and it fills the ' +
    blanks + ' blank' + (blanks === 1 ? '' : 's') +
    ' — nothing already there is touched.';
  if(!list.length){
    box.innerHTML = '<div class="bd-empty">Nothing in either database matches this closely enough '+
      'to trust. Photographing the panel is the surer way in.</div>';
    return;
  }
  const warn = noSignal
    ? '<div class="bd-empty" style="margin-bottom:10px;">Could not reach the food databases just '+
      'now. This is what the tables already on your phone can fill — try again with signal for '+
      'the packet\u2019s own figures.</div>'
    : '';
  box.innerHTML = warn + list.map((c, i)=>{
    const ag = c._ag, fl = c._fill;
    const tags = [];
    if(c.exact) tags.push('<span class="lu-tag fit">same barcode</span>');
    tags.push('<span class="lu-tag ' + (c.tag === 'off' ? 'off' : '') + '">' + esc(c.src) + '</span>');
    tags.push('<span class="lu-tag ' + (ag.pass ? 'fit' : '') + '">' +
      (ag.pass ? 'numbers agree' : ag.bad.length + ' number' + (ag.bad.length === 1 ? '' : 's') +
       ' off') + '</span>');
    return '<button class="lu-row" data-lu="' + i + '">'+
      '<div class="lu-n">' + esc(c.name) + '</div>'+
      '<div class="lu-m">Would fill <b>' + fl.n + '</b> of your ' + blanks + ' blanks · ' +
        fmt0(c.kcal100) + ' kcal, ' + Math.round(c.p100) + 'g protein per 100' +
        (luFood.basis === 'ml' ? 'ml' : 'g') + '</div>'+
      '<div class="lu-tags">' + tags.join('') + '</div></button>';
  }).join('') +
  '<p class="lu-note">Everything here is a printed label or a laboratory figure somebody has '+
  'already published. It is filled in as looked up, not as yours — type over any of it and '+
  'yours wins.</p>';

  box.querySelectorAll('[data-lu]').forEach(b=>{
    b.onclick = ()=> luApply(list[Number(b.dataset.lu)]);
  });
}

function luBlankCount(food){
  const have = (food && food.micros100) || {};
  let n = 0;
  (typeof microEditable === 'function' ? microEditable() : []).forEach(spec=>{
    if(have[spec.k] == null) n++;
  });
  if(food && food.sug100 == null) n++;
  if(food && food.sat100 == null) n++;
  return n;
}

async function openLookup(food){
  if(!food) return;
  luFood = food;
  const seq = ++luSeq;
  openSheet('lookup-backdrop');
  luRender([], 'busy');
  let list = [];
  try{
    list = await luCandidates(food);
  }catch(e){
    if(seq === luSeq) luRender([], 'offline');
    return;
  }
  if(seq !== luSeq) return;
  // Score, then drop anything that plainly is not this food.
  list.forEach(c=>{
    // gfMatch has already put a candidate through a stricter version of this
    // check - every naming word present, calories within 20%, each macro within
    // 30% - so re-running it on figures copied from the food itself would only
    // ever say yes. It is marked as passing rather than tested twice.
    c._ag = c.table ? {checked: 4, ok: 4, bad: [], pass: true, near: true}
                    : luAgreement(food, c);
    c._fill = luWouldFill(food, c);
  });
  const ns = list.noSignal;
  list = list.filter(c=>(c.exact || c._ag.pass || c._ag.near) && c._fill.n > 0);
  list.noSignal = ns;
  list.sort((a, b)=>{
    if(!!b.exact !== !!a.exact) return b.exact ? 1 : -1;
    if(!!b.table !== !!a.table) return b.table ? 1 : -1;
    if(b._ag.pass !== a._ag.pass) return b._ag.pass ? 1 : -1;
    return b._fill.n - a._fill.n;
  });
  luRender(list.slice(0, 8), 'done', !!list.noSignal);
}

// Writing it down. Only the blanks, and only into the looked-up half of the
// record, so your own figures keep their place above it.
function luApply(c){
  if(!c || !luFood) return;
  const L = (typeof labelFor === 'function' ? labelFor(luFood.name) : null) || {};
  const prev = (L.web && L.web.micros) ? L.web.micros : {};
  const have = luFood.micros100 || {};
  const micros = Object.assign({}, prev);
  (c._fill ? c._fill.keys : Object.keys(c.micros100 || {})).forEach(k=>{
    if(have[k] == null && c.micros100[k] != null) micros[k] = c.micros100[k];
  });
  const web = {micros: micros, tag: c.src, src: c.name, code: c.code || null, at: Date.now()};
  if(luFood.sug100 == null && c.sug100 != null) web.sug = c.sug100;
  if(luFood.sat100 == null && c.sat100 != null) web.sat = c.sat100;
  saveLabel(luFood.name, {web: web});

  closeSheet('lookup-backdrop');
  const filled = (c._fill ? c._fill.n : Object.keys(micros).length);
  // No toast helper in the app, so the editor's own subtitle carries the news
  // when it reopens below.
  luJustFilled = filled + ' filled in from ' + c.src + '.';
  // Re-open the editor on the food as it now stands, so you can see what landed.
  try{
    const again = applyLabel(Object.assign({}, luFood));
    setTimeout(()=>openMicroEditor(again), HANDOFF);
  }catch(e){}
  try{ renderDay(); }catch(e){}
}


