/* ============================================================
   v125 - supplements.
   A supplement is logged as an entry with no calories and just the nutrient
   it carries (Vitamin D 25 ug, say), marked supp:true. Because it is an entry,
   everything that already adds up a day's nutrients - the nutrient panel, the
   body systems, the day score, the reviews - counts it with no other change.
   It sits in its own Supplements card, not in a meal, and is left out of the
   meal and food-quality scores, which judge food. The amounts are yours: COACH
   only offers common label doses to tap, and you can type any other.
   What you take is remembered (new key coachsupps) for one-tap logging.
   ============================================================ */
const SUPPS_KEY = 'coachsupps';
const SUPP_LIST = [
  {id:'vitd',  n:'Vitamin D3',       k:'vitamin-d',  u:'ug', doses:[10,25,50,100], iu:40},
  {id:'vitc',  n:'Vitamin C',        k:'vitamin-c',  u:'mg', doses:[250,500,1000]},
  {id:'b12',   n:'Vitamin B12',      k:'vitamin-b12',u:'ug', doses:[10,25,100,1000]},
  {id:'omega', n:'Omega-3 fish oil', k:'epadha',     u:'mg', doses:[250,500,1000], label:'EPA + DHA'},
  {id:'mag',   n:'Magnesium',        k:'magnesium',  u:'mg', doses:[100,200,375]},
  {id:'zinc',  n:'Zinc',             k:'zinc',       u:'mg', doses:[10,15,25]},
  {id:'iron',  n:'Iron',             k:'iron',       u:'mg', doses:[14,18,65]},
  {id:'calc',  n:'Calcium',          k:'calcium',    u:'mg', doses:[300,500,800]},
  {id:'folic', n:'Folic acid (B9)',  k:'vitamin-b9', u:'ug', doses:[200,400]},
  {id:'k2',    n:'Vitamin K2',       k:'vitamin-k',  u:'ug', doses:[75,100,200]},
  {id:'b6',    n:'Vitamin B6',       k:'vitamin-b6', u:'mg', doses:[2,10,25]},
  {id:'vita',  n:'Vitamin A',        k:'vitamin-a',  u:'ug', doses:[400,800]},
  {id:'vite',  n:'Vitamin E',        k:'vitamin-e',  u:'mg', doses:[12,67]},
  {id:'iod',   n:'Iodine',           k:'iodine',     u:'ug', doses:[150]},
  {id:'sel',   n:'Selenium',         k:'selenium',   u:'ug', doses:[55,100,200]},
  {id:'chol',  n:'Choline',          k:'choline',    u:'mg', doses:[250,500]}
];
const SUPP_UNIT = {ug:'µg', mg:'mg', g:'g'};
function loadSupps(){ try{ return JSON.parse(CS.getItem(SUPPS_KEY)) || []; }catch(e){ return []; } }
function saveSupps(list){ lsSet(SUPPS_KEY, JSON.stringify(list.slice(0, 40))); }
function suppMicroDef(k){ return MICROS.filter(m => m.k === k)[0] || null; }
function suppAmountText(nutr){
  return Object.keys(nutr).map(k=>{
    const d = suppMicroDef(k);
    const v = nutr[k];
    return (Math.round(v * 100) / 100) + ' ' + (d ? SUPP_UNIT[d.u] || d.u : '') + (Object.keys(nutr).length > 1 && d ? ' ' + d.n : '');
  }).join(', ');
}
// The micros an entry carries. Fish oil's EPA + DHA are omega-3 fats, so the
// same amount also counts towards omega-3 (which is kept in grams).
function suppMicros(nutr){
  const m = {};
  Object.keys(nutr).forEach(k=>{ const v = Number(nutr[k]); if(v > 0) m[k] = v; });
  if(m.epadha && m.omega3 == null) m.omega3 = Math.round(m.epadha) / 1000;
  return m;
}
function logSupplement(name, nutr){
  const micros = suppMicros(nutr);
  if(!Object.keys(micros).length) return false;
  const es = loadEntries(currentDate);
  es.push({name: name, kcal: 0, protein: 0, carbs: 0, fat: 0, meal: 'Supplement', supp: true,
           suppAmt: suppAmountText(nutr), micros: micros});
  saveEntries(currentDate, es);
  // Remembered as one of yours, at the amount you just took.
  const list = loadSupps().filter(s => s.name !== name);
  list.unshift({name: name, nutr: nutr, last: todayYMD()});
  saveSupps(list);
  try{ histCache = null; }catch(e){}
  buzz(); sfx('food');
  renderDay(); renderStreak();
  return true;
}
function renderSupps(entries){
  const box = document.getElementById('supp-card');
  if(!box) return;
  const all = entries.map((e, i) => ({e, i})).filter(x => x.e.supp);
  const taken = new Set(all.map(x => x.e.name));
  const mine = loadSupps().filter(s => !taken.has(s.name)).slice(0, 6);
  let html = '<div class="meal-head"><span class="mname">Supplements</span><span class="mkcal">' +
    (all.length ? all.length + ' taken' : 'None yet') + '</span></div>';
  if(all.length){
    html += '<div class="meal-card">' + all.map(x =>
      '<div class="supp-row"><div><div class="sp-n">' + esc(x.e.name) + '</div><div class="sp-a">' + esc(x.e.suppAmt || '') +
      '</div></div><button type="button" class="sp-del" data-sdel="' + x.i + '" aria-label="Remove ' + esc(x.e.name) + '">' +
      '<i class="ti ti-x" aria-hidden="true"></i></button></div>').join('') +
      '<button class="meal-add subtle" data-supp-open="1" aria-label="Add a supplement"><i class="ti ti-plus" aria-hidden="true"></i> Add</button></div>';
  } else {
    html += '<button class="meal-add" data-supp-open="1" aria-label="Add a supplement"><i class="ti ti-plus" aria-hidden="true"></i> Add a supplement</button>';
  }
  if(mine.length){
    html += '<div class="supp-mine">' + mine.map((s, j) =>
      '<button type="button" data-smine="' + j + '"><i class="ti ti-plus" aria-hidden="true"></i> ' + esc(s.name) +
      ' <s>' + esc(suppAmountText(s.nutr)) + '</s></button>').join('') + '</div>';
  }
  box.innerHTML = html;
  box.querySelectorAll('[data-sdel]').forEach(b => { b.onclick = ()=> deleteEntryAt(Number(b.dataset.sdel)); });
  box.querySelectorAll('[data-supp-open]').forEach(b => { b.onclick = ()=> openSuppSheet(); });
  box.querySelectorAll('[data-smine]').forEach(b => { b.onclick = ()=>{ const s = mine[Number(b.dataset.smine)]; logSupplement(s.name, s.nutr); }; });
}

// The sheet: pick a supplement, set the amount, add it.
let suppPick = null, suppIU = false;
function openSuppSheet(){
  suppPick = null; suppIU = false;
  renderSuppSheet();
  openSheet('supp-backdrop');
}
function renderSuppSheet(){
  const body = document.getElementById('supp-body');
  if(!suppPick){
    body.innerHTML = '<p class="sp-intro">Pick what you took. It counts towards your nutrients, body systems and day score.</p>' +
      '<div class="sp-grid">' + SUPP_LIST.map(s =>
        '<button type="button" data-spick="' + s.id + '"><b>' + esc(s.n) + '</b><span>' + (s.label || suppMicroDef(s.k).n) + '</span></button>').join('') +
      '<button type="button" data-spick="custom"><b>Multivitamin or other</b><span>Type it in off the label</span></button></div>';
    body.querySelectorAll('[data-spick]').forEach(b => { b.onclick = ()=>{ suppPick = b.dataset.spick; renderSuppSheet(); }; });
    return;
  }
  if(suppPick === 'custom'){ renderSuppCustom(body); return; }
  const s = SUPP_LIST.filter(x => x.id === suppPick)[0];
  const d = suppMicroDef(s.k);
  const target = (()=>{ try{ return microTargetsFor(loadEntries(currentDate)).filter(m => m.k === s.k)[0]; }catch(e){ return null; } })();
  const unit = suppIU ? 'IU' : SUPP_UNIT[s.u];
  body.innerHTML = '<button type="button" class="sp-back" id="sp-back"><i class="ti ti-chevron-left" aria-hidden="true"></i> All supplements</button>' +
    '<h4 class="sp-h">' + esc(s.n) + '</h4>' +
    '<label class="sp-lab" for="sp-amt">How much is in one dose? (' + (s.label || d.n) + ')</label>' +
    '<div class="sp-amt"><input id="sp-amt" type="number" inputmode="decimal" min="0" step="any" placeholder="Amount">' +
    '<span>' + unit + '</span>' + (s.iu ? '<button type="button" id="sp-iu">' + (suppIU ? 'Use µg' : 'Use IU') + '</button>' : '') + '</div>' +
    '<div class="sp-doses">' + s.doses.map(v => '<button type="button" data-sdose="' + v + '">' +
      (suppIU ? (v * s.iu) + ' IU' : v + ' ' + SUPP_UNIT[s.u]) + '</button>').join('') + '</div>' +
    '<p class="sp-note" id="sp-note">' + (target ? 'Your daily target is ' + (Math.round(target.target * 10) / 10) + ' ' + SUPP_UNIT[d.u] +
      (d.ul ? ', upper limit ' + d.ul + ' ' + SUPP_UNIT[d.u] : '') + '.' : '') + '</p>' +
    '<button type="button" class="save-btn" id="sp-add">Add supplement</button>';
  const inp = document.getElementById('sp-amt');
  const prev = loadSupps().filter(x => x.name === s.n)[0];
  if(prev && prev.nutr[s.k]) inp.value = suppIU ? prev.nutr[s.k] * s.iu : prev.nutr[s.k];
  document.getElementById('sp-back').onclick = ()=>{ suppPick = null; renderSuppSheet(); };
  const iu = document.getElementById('sp-iu');
  if(iu) iu.onclick = ()=>{ const v = Number(inp.value); suppIU = !suppIU; renderSuppSheet();
    if(v > 0) document.getElementById('sp-amt').value = suppIU ? v * s.iu : Math.round(v / s.iu * 100) / 100; };
  body.querySelectorAll('[data-sdose]').forEach(b => { b.onclick = ()=>{ inp.value = suppIU ? Number(b.dataset.sdose) * s.iu : b.dataset.sdose; }; });
  document.getElementById('sp-add').onclick = ()=>{
    let v = Number(inp.value);
    if(!(v > 0)){ document.getElementById('sp-note').textContent = 'Enter the amount on the label.'; return; }
    if(suppIU) v = v / s.iu;           // 40 IU of vitamin D is 1 ug, by definition
    const nutr = {}; nutr[s.k] = Math.round(v * 100) / 100;
    logSupplement(s.n, nutr);
    closeSheet('supp-backdrop');
  };
}
function renderSuppCustom(body){
  const opts = MICROS.filter(m => !m.read && !m.limit && !m.info && !m.estimated)
    .map(m => '<option value="' + m.k + '">' + esc(m.n) + ' (' + (SUPP_UNIT[m.u] || m.u) + ')</option>').join('');
  const row = '<div class="sp-crow"><select>' + '<option value="">Nutrient…</option>' + opts + '</select>' +
    '<input type="number" inputmode="decimal" min="0" step="any" placeholder="Amount"></div>';
  body.innerHTML = '<button type="button" class="sp-back" id="sp-back"><i class="ti ti-chevron-left" aria-hidden="true"></i> All supplements</button>' +
    '<h4 class="sp-h">From the label</h4>' +
    '<label class="sp-lab" for="sp-name">Name</label><input id="sp-name" type="text" placeholder="e.g. Multivitamin" autocapitalize="sentences">' +
    '<label class="sp-lab">What one dose contains</label><div id="sp-rows">' + row + row + row + '</div>' +
    '<button type="button" class="sp-more" id="sp-more"><i class="ti ti-plus" aria-hidden="true"></i> Another nutrient</button>' +
    '<p class="sp-note" id="sp-note">Only nutrients COACH tracks are listed, so each one counts.</p>' +
    '<button type="button" class="save-btn" id="sp-add">Add supplement</button>';
  document.getElementById('sp-back').onclick = ()=>{ suppPick = null; renderSuppSheet(); };
  document.getElementById('sp-more').onclick = ()=>{ document.getElementById('sp-rows').insertAdjacentHTML('beforeend', row); };
  document.getElementById('sp-add').onclick = ()=>{
    const name = document.getElementById('sp-name').value.trim();
    const nutr = {};
    document.querySelectorAll('#sp-rows .sp-crow').forEach(r=>{
      const k = r.querySelector('select').value, v = Number(r.querySelector('input').value);
      if(k && v > 0) nutr[k] = (nutr[k] || 0) + v;
    });
    const note = document.getElementById('sp-note');
    if(!name){ note.textContent = 'Give it a name.'; return; }
    if(!Object.keys(nutr).length){ note.textContent = 'Add at least one nutrient and its amount.'; return; }
    logSupplement(name, nutr);
    closeSheet('supp-backdrop');
  };
}

function renderMicros(entries){
  const panel = document.getElementById('micro-panel');
  const defs = microTargetsFor(entries);
  const states = defs.map(m=>microState(m, entries));
  // The ring answers "how much of what I am aiming for could be measured".
  // Limits are not aims, so they are left out of both halves of the fraction.
  const aims = states.filter(s=>!s.m.limit);
  const withData = aims.filter(s=>s.anyData).length;

  const low   = states.filter(s=>s.cls === 'low');
  const high  = states.filter(s=>s.cls === 'high');
  const okS   = states.filter(s=>s.cls === 'ok');
  const noneS = states.filter(s=>!s.anyData);
  const itemsWith = entries.filter(e=>e.micros && Object.keys(e.micros).length).length;

  if(!entries.length){
    panel.innerHTML = '<div class="estate"><i class="ti ti-leaf" aria-hidden="true"></i><div class="et">Nothing to measure yet</div><div class="es">Log a food and this fills in. Anything without a published profile counts as unknown rather than zero, so the panel says how much it actually knows.</div><button data-estate="add">Log a food</button></div>';
    document.getElementById('micro-coverage').textContent = 'Log food to see micronutrient coverage.';
    return;
  }

  // The coverage ring leads, because how much is known governs what any of the
  // rest of it means.
  const R = 21, C = 2 * Math.PI * R;
  const frac = aims.length ? withData / aims.length : 0;
  let html =
    '<div class="mhead">'+
    '<svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true" style="flex:0 0 auto;">'+
      '<circle cx="26" cy="26" r="'+R+'" fill="none" stroke="var(--card2)" stroke-width="6"/>'+
      '<circle cx="26" cy="26" r="'+R+'" fill="none" stroke="var(--accent)" stroke-width="6" '+
        'stroke-linecap="round" stroke-dasharray="'+C.toFixed(1)+' '+C.toFixed(1)+'" '+
        'stroke-dashoffset="'+(C * (1 - frac)).toFixed(1)+'" transform="rotate(-90 26 26)"/>'+
    '</svg>'+
    '<div><div class="hnum">'+withData+'<span>/'+aims.length+'</span></div>'+
    '<div class="hsub">nutrients measured from<br>'+itemsWith+' of your '+entries.length+
      ' item'+(entries.length===1?'':'s')+' today</div></div></div>';

  if(low.length){
    html += '<div class="mgroup">Running low</div>' +
      low.sort((a,b)=>a.pct-b.pct).map(microBar).join('');
  }
  if(high.length){
    html += '<div class="mgroup">Over the limit</div>' + high.map(microBar).join('');
  }
  if(!low.length && !high.length && withData){
    html += '<div style="font-size:12.5px; color:var(--accent); padding:2px 0 4px;">'+
      'Everything measured is within range today.</div>';
  }

  // Everything fine, and everything unknown, folded away behind a tap.
  html += '<button class="mfold" data-mfold="range">'+
    '<span>In range</span><span class="cnum">'+okS.length+' nutrients '+
    (microOpen.range ? '&#8963;' : '&#8250;')+'</span></button>';
  if(microOpen.range){
    html += '<div style="margin-top:12px;">' + MICRO_GROUPS.map(g=>{
      const rows = okS.filter(s=>microGroup(s.m.k) === g);
      return rows.length ? '<div class="mgroup">'+g+'</div>' + rows.map(microBar).join('') : '';
    }).join('') + '</div>';
  }

  if(noneS.length){
    html += '<button class="mfold quiet" data-mfold="none">'+
      '<span style="color:var(--text3)">Not measured today</span>'+
      '<span class="cnum">'+noneS.length+' '+(microOpen.none ? '&#8963;' : '&#8250;')+'</span></button>';
    if(microOpen.none){
      html += '<div style="margin-top:12px;">' + MICRO_GROUPS.map(g=>{
        const rows = noneS.filter(s=>microGroup(s.m.k) === g);
        return rows.length ? '<div class="mgroup">'+g+'</div>' + rows.map(microBar).join('') : '';
      }).join('') + '</div>';
    }
  }

  panel.innerHTML = html;
  panel.querySelectorAll('[data-bdmicro]').forEach(b=>{
    b.onclick = ()=> openBreakdown(specForMicro(b.dataset.bdmicro, entries), entries, {});
  });
  panel.querySelectorAll('[data-mfold]').forEach(b=>{
    b.onclick = ()=>{
      const k = b.dataset.mfold;
      microOpen[k] = !microOpen[k];
      renderMicros(entries);
    };
  });

  // The headline already states the counts, so this is only the caveat.
  const note = document.getElementById('micro-coverage');
  note.innerHTML =
    (itemsWith < entries.length
      ? 'Foods without a published profile add nothing to these totals, so anything reading low may simply be unmeasured. '
      : '') +
    'Treat this as a rough coverage check, not a deficiency diagnosis.';
}

