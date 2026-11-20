/* ============================================================
   v91 - what each thing on the plate did to the plate
   The question this answers: "butter scores 21, but I only had 15 g of it with
   eggs on toast - is it really ruining the meal?" The meal score is already
   worked out per 100 g of the WHOLE plate, so 15 g of butter only counts for
   the share of the meal it actually is. But the badge next to butter in the log
   says 21, because that is what butter is, and the two numbers together look
   like a contradiction.

   So: take the item out, score the meal again, and show the difference. That is
   the honest answer to "what did this cost me" - not the food's own score, but
   what it did HERE, at the amount you actually ate.
   ============================================================ */
function mealContributions(entries){
  const list = (entries || []).filter(x=>x);
  const base = mealScore(list);
  const kcalAll = list.reduce((s, e)=>s + (Number(e.kcal) || 0), 0);
  // A row is a GROUP: one item, or a plate you made out of several.
  const groups = mealGroups(list);
  const rows = groups.map((g, gi)=>{
    const without = [];
    groups.forEach((o, oi)=>{ if(oi !== gi) o.items.forEach(x=>without.push(x)); });
    const w = without.length ? mealScore(without) : {health: null};
    const kcal = g.items.reduce((a, e)=>a + (Number(e.kcal) || 0), 0);
    const grams = g.items.reduce((a, e)=>a + (Number(e.grams) || 0), 0);
    const sc = groupScore(g.items);
    return {
      entry: g.items[0], items: g.items, plate: g.plate, gi: gi,
      name: g.items.length === 1 ? g.items[0].name
            : ((g.items[0] && g.items[0].plateName) || g.items.map(x=>x.name).join(' + ')),
      kcal: kcal, grams: grams,
      share: kcalAll > 0 ? kcal / kcalAll : 0,
      // Positive means the meal is better for having it.
      effect: (base.health != null && w.health != null) ? base.health - w.health : null,
      alone: sc ? (sc.health == null ? sc.overall : sc.health) : null,
      only: without.length === 0
    };
  });
  return {score: base.health, of: base.of, used: base.used, kcal: kcalAll, rows: rows,
          groups: groups.length, items: list.length};
}

/* Which items you have ticked while grouping, and the meal being grouped.
   Nothing here is stored - the tag on the entries is. */
let plPick = {}, plMeal = null, plMode = false, plJustSaved = '', plName = '', plKeep = false;

function plTagFor(){
  // Short, unique, and readable if anyone ever looks at the saved data.
  return 'p' + Date.now().toString(36) + Math.floor(Math.random()*1000).toString(36);
}

// Tagging, rather than merging. The entries stay exactly as they were logged -
// they just gain a note saying they are one dish - so it can be undone, the
// parts keep their own figures, and nothing you saved is ever rewritten away.
/* A plate you will eat again is worth keeping. Saved the same way the meal
   builder saves one - same store, same shape, asPlate set - so it turns up in
   Saved meals with everything else and logs back as a single dish rather than
   as its parts. */
function plSave(name, items){
  const list = (items || []).filter(x=>x);
  if(!list.length) return false;
  const clean = list.map(e=>{
    const c = Object.assign({}, (typeof dehydrateEntry === 'function') ? dehydrateEntry(e) : e);
    // A saved meal is a recipe, not a day: which meal it was eaten at, and the
    // plate it was on today, are not part of it.
    delete c.meal; delete c.plate; delete c.plateName;
    return c;
  });
  const meals = loadSavedMeals();
  const nm = String(name || '').trim() || clean.map(x=>x.name).join(' + ');
  // Saving the same plate twice should update it rather than stack up copies.
  const at = meals.findIndex(m=>String(m.name || '').toLowerCase() === nm.toLowerCase());
  const rec = {name: nm, items: clean, asPlate: true};
  if(at >= 0) meals[at] = rec; else meals.push(rec);
  saveSavedMeals(meals);
  return true;
}

function plApply(meal, name, keep){
  const es = loadEntries(currentDate);
  const idx = Object.keys(plPick).filter(k=>plPick[k]).map(Number);
  if(idx.length < 2) return;
  const tag = plTagFor();
  const nm = String(name || '').trim();
  idx.forEach(i=>{
    if(!es[i]) return;
    const add = {plate: tag};
    if(nm) add.plateName = nm;
    es[i] = Object.assign({}, es[i], add);
  });
  saveEntries(currentDate, es);
  if(keep) plSave(nm, idx.map(i=>es[i]).filter(x=>x));
  plMode = false; plPick = {};
  plJustSaved = keep ? (nm || 'That plate') : '';
  renderDay();
  openMealScore(meal, loadEntries(currentDate).filter(e=>(e.meal || 'Snack') === meal));
}

function plUngroup(meal, tag){
  const es = loadEntries(currentDate);
  let n = 0;
  const out = es.map(e=>{
    if(e && e.plate === tag){
      n++;
      const c = Object.assign({}, e);
      delete c.plate; delete c.plateName;
      return c;
    }
    return e;
  });
  if(!n) return;
  saveEntries(currentDate, out);
  renderDay();
  openMealScore(meal, loadEntries(currentDate).filter(e=>(e.meal || 'Snack') === meal));
}

function openMealScore(meal, entries){
  const c = mealContributions(entries);
  document.getElementById('msq-title').textContent = meal;
  const band = (typeof scoreBand === 'function') ? scoreBand(c.score) : {cls:''};
  const col = (typeof scoreColour === 'function') ? scoreColour(band.cls) : 'var(--text)';

  let html = '<div class="msq-top"><span class="msq-big" style="color:'+col+'">'+
    (c.score == null ? '—' : c.score) + '</span>'+
    '<span class="msq-of">out of 100 · ' + fmt0(c.kcal) + ' kcal in the meal</span></div>';

  if(c.score == null){
    html += '<div class="bd-empty">Nothing here carries enough label figures to score yet.</div>';
    document.getElementById('msq-body').innerHTML = html;
    openSheet('mealscore-backdrop');
    return;
  }

  html += '<p class="msq-note">Everything here is scored as itself, then weighed by the '+
    'calories it carried — so a little of something strong counts for a little. '+
    'Things that really are one dish can be grouped, and a group is scored as one food.</p>';

  const rows = c.rows.slice().sort((a, b)=>{
    const av = a.effect == null ? -999 : a.effect, bv = b.effect == null ? -999 : b.effect;
    return av - bv;                              // the biggest cost first
  });

  // Grouping mode: tick the things that are one dish.
  if(plMode && plMeal === meal){
    const es = loadEntries(currentDate);
    const picked = Object.keys(plPick).filter(k=>plPick[k]).length;
    html += '<div class="section-title">Which of these are one dish?</div>' +
      es.map((e, i)=>{
        if((e.meal || 'Snack') !== meal) return '';
        const on = !!plPick[i];
        return '<button class="pl-pick" data-plpick="' + i + '" aria-pressed="' + on + '">'+
          '<span class="pl-box">' + (on ? '✓' : '') + '</span>'+
          '<span class="pl-n">' + esc(e.name) +
            '<s>' + fmt0(e.grams || 0) + (entryBasis(e) === 'ml' ? ' ml' : ' g') + ' · ' +
            fmt0(e.kcal || 0) + ' kcal' + (e.plate ? ' · already on a plate' : '') + '</s></span>'+
        '</button>';
      }).join('') +
      (picked >= 2
        ? '<input class="pl-name" id="pl-name" type="text" autocomplete="off" '+
          'autocapitalize="sentences" placeholder="Name it \u2014 chicken curry, eggs on toast" '+
          'value="' + esc(plName) + '">'+
          '<button class="pl-keep" data-plkeep="1" aria-pressed="' + plKeep + '">'+
            '<span class="pl-box">' + (plKeep ? '\u2713' : '') + '</span>'+
            '<span>Save this plate<s>Keeps it in Saved meals, ready to log again as one dish</s></span>'+
          '</button>'
        : '')+
      '<div class="pl-bar">'+
        '<button data-plcancel="1">Cancel</button>'+
        '<button class="go" data-plgo="1"' + (picked < 2 ? ' disabled' : '') + '>'+
          (picked < 2 ? 'Pick two or more' : (plKeep ? 'Make it and save' : 'Make these one plate')) +
        '</button>'+
      '</div>'+
      '<p class="msq-note">They stay in your log exactly as you logged them — they are just '+
      'scored as one dish from now on, the way a curry and its rice should be. You can undo it '+
      'any time.</p>';
    document.getElementById('msq-body').innerHTML = html;
    const box = document.getElementById('msq-body');
    box.querySelectorAll('[data-plpick]').forEach(b=>{
      b.onclick = ()=>{
        const i = Number(b.dataset.plpick);
        plPick[i] = !plPick[i];
        openMealScore(meal, entries);
      };
    });
    const c = box.querySelector('[data-plcancel]');
    if(c) c.onclick = ()=>{ plMode = false; plPick = {}; plName = ''; plKeep = false;
      openMealScore(meal, entries); };
    const nameEl = box.querySelector('#pl-name');
    if(nameEl){
      nameEl.oninput = ()=>{ plName = nameEl.value; };
      // Suggest a name from what is ticked, but only until you type your own.
      if(!plName){
        const es2 = loadEntries(currentDate);
        const picked2 = Object.keys(plPick).filter(k=>plPick[k]).map(Number)
          .map(i=>es2[i]).filter(x=>x).map(x=>x.name);
        nameEl.placeholder = picked2.length ? picked2.join(' + ').slice(0, 48)
                                            : 'Name it';
      }
    }
    const kb = box.querySelector('[data-plkeep]');
    if(kb) kb.onclick = ()=>{
      plKeep = !plKeep;
      if(nameEl) plName = nameEl.value;
      openMealScore(meal, entries);
    };
    const g = box.querySelector('[data-plgo]');
    if(g) g.onclick = ()=>{
      const el = document.getElementById('pl-name');
      plApply(meal, el ? el.value : plName, plKeep);
    };
    openSheet('mealscore-backdrop');
    return;
  }

  html += '<div class="section-title">What each thing did</div>' + rows.map(r=>{
    const e = r.entry;
    const eff = r.effect;
    const up = eff != null && eff > 0;
    const c2 = eff == null ? 'var(--text3)' : (up ? 'var(--accent)' : (eff < 0 ? 'var(--danger)' : 'var(--text2)'));
    const w = eff == null ? 0 : Math.min(100, Math.abs(eff) * 4);
    const isPlate = r.items && r.items.length > 1;
    return '<div class="msq-r"><div class="msq-n">'+
      '<div class="msq-nn">' + esc(r.name) +
        (isPlate ? '<span class="pl-tag">one plate</span>' : '') + '</div>'+
      '<div class="msq-ns">' + fmt0(r.grams || 0) + (entryBasis(e) === 'ml' ? ' ml' : ' g') +
        ' · ' + fmt0(r.kcal || 0) + ' kcal · ' + Math.round(r.share * 100) +
        '% of the meal' + (r.alone != null ? ' · scores ' + r.alone + ' on its own' : '') +
        (isPlate ? ' · ' + r.items.length + ' things' : '') +
      '</div></div>'+
      '<span class="msq-bar"><i style="width:' + w.toFixed(0) + '%; background:' + c2 + '"></i></span>'+
      '<span class="msq-v" style="color:' + c2 + '">'+
        (r.only ? 'all of it' : (eff == null ? '—' : (eff > 0 ? '+' : '') + eff))+
        (r.only ? '' : '<s>points</s>')+
      '</span></div>';
  }).join('');

  // The single biggest cost, said in a sentence, because that is the bit worth
  // acting on.
  const worst = rows.filter(r=>r.effect != null && r.effect < 0 && !r.only)[0];
  if(worst){
    html += '<p class="msq-note" style="margin-top:14px;"><b>' + esc(worst.name) + '</b> is '+
      Math.round(worst.share * 100) + '% of this meal’s calories and costs it <b>' +
      Math.abs(worst.effect) + ' points</b>. Without it the meal scores <b>' +
      (c.score - worst.effect) + '</b>.</p>';
  }
  const lifts = rows.filter(r=>r.effect != null && r.effect > 0 && !r.only);
  if(lifts.length){
    const best = lifts[lifts.length - 1];
    html += '<p class="msq-note"><b>' + esc(best.name) + '</b> is carrying it: it is worth '+
      '<b>+' + best.effect + '</b> here.</p>';
  }
  if(c.used < c.of){
    html += '<p class="msq-note" style="color:var(--text3);">' + (c.of - c.used) + ' of the ' + c.of +
      ' items here have no packet figures, so they are not in this at all.</p>';
  }

  const plated = c.rows.filter(r=>r.items && r.items.length > 1);
  if(plJustSaved){
    html += '<p class="msq-note"><b style="color:var(--accent)">' + esc(plJustSaved) +
      '</b> is in your saved meals \u2014 log it again from Add food.</p>';
    plJustSaved = '';
  }
  html += '<div class="pl-bar">'+
    (c.items > 1 ? '<button data-plstart="1">Group into a plate</button>' : '') +
    plated.map(r=>'<button data-plsave="' + esc(r.plate) + '">Save this plate</button>'+
                  '<button data-plundo="' + esc(r.plate) + '">Ungroup</button>').join('')+
  '</div>';

  document.getElementById('msq-body').innerHTML = html;
  (function(){
    const box = document.getElementById('msq-body');
    const st = box.querySelector('[data-plstart]');
    if(st) st.onclick = ()=>{
      plMode = true; plMeal = meal; plPick = {}; plName = ''; plKeep = false;
      openMealScore(meal, entries);
    };
    box.querySelectorAll('[data-plundo]').forEach(b=>{
      b.onclick = ()=> plUngroup(meal, b.dataset.plundo);
    });
    box.querySelectorAll('[data-plsave]').forEach(b=>{
      b.onclick = ()=>{
        const tag = b.dataset.plsave;
        const items = loadEntries(currentDate).filter(e=>e && e.plate === tag);
        const nm = (items[0] && items[0].plateName) || items.map(x=>x.name).join(' + ');
        if(plSave(nm, items)){
          plJustSaved = nm;
          openMealScore(meal, loadEntries(currentDate).filter(e=>(e.meal || 'Snack') === meal));
        }
      };
    });
  })();
  const sh = document.querySelector('#mealscore-backdrop .sheet');
  if(sh) sh.scrollTop = 0;
  openSheet('mealscore-backdrop');
}


