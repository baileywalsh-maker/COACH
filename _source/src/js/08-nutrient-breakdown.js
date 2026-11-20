// ---- Nutrient breakdown ----
//
// Every number on the day screen is a sum of the foods behind it, and until now
// there was no way to see them. Tapping any of them opens this.

// One description of a nutrient, whatever kind it is, so the sheet does not
// need to know whether it was handed a macro or a vitamin.
function macroSpecs(){
  let tg = targets;
  try{ tg = dayTargets(currentDate); }catch(e){}
  return [
    {k:'kcal',    n:'Calories', u:'',  col:'var(--accent)', target:tg.kcal,
     read:e=>e.kcal, dp:0},
    {k:'protein', n:'Protein',  u:'g', col:'var(--prot)',   target:tg.protein,
     read:e=>e.protein, dp:0},
    {k:'carbs',   n:'Carbs',    u:'g', col:'var(--carb)',   target:tg.carbs,
     read:e=>e.carbs, dp:0},
    {k:'fat',     n:'Fat',      u:'g', col:'var(--fat)',    target:tg.fat,
     read:e=>e.fat, dp:0}
  ];
}
function specForMacro(k){ return macroSpecs().filter(s=>s.k===k)[0] || null; }
// The day's entries have to come in here. Without them microTargetsFor() skips
// its "extras" block entirely - the nutrients that only exist because a scanned
// product published them, like iodine, omega-6 or caffeine - so tapping one of
// those rows found no spec, returned null, and did nothing at all, on a control
// that looks exactly like the ones that work.
function specForMicro(k, entries){
  const m = microTargetsFor(entries).filter(x=>x.k===k)[0];
  if(!m) return null;
  return { k:m.k, n:m.n, u:(m.u==='ug' ? '\u00b5g' : m.u), target:m.target,
           limit:!!m.limit, micro:m, read:e=>microValue(m,e),
           dp:(m.u==='ug' ? 0 : null) };
}

// Round the way the panel it came from rounds, so the sheet never disagrees
// with the number that was tapped to open it.
function bdFmt(spec, v){
  if(spec.dp === 0) return fmt0(v);
  return v < 10 ? Math.round(v*10)/10 : fmt0(v);
}

// Who contributed, largest first, and - for micronutrients - who could not,
// because they carry no figure for it. Those two lists are the whole point:
// "iron reads low" and "iron is low" are different claims.
function contributorsFor(entries, spec){
  const rows = [], missing = [];
  entries.forEach((e, i)=>{
    const v = spec.read(e);
    if(v === undefined || v === null){ missing.push({e:e, i:i}); return; }
    rows.push({e:e, i:i, v:Number(v) || 0});
  });
  rows.sort((a,b)=>b.v - a.v);
  const total = rows.reduce((s,r)=>s+r.v, 0);
  return {rows:rows, missing:missing, total:total};
}

// The weekly sheet groups by food, because seven separate porridge rows is a
// list of days, not an answer about the week.
function groupContributors(rows){
  const by = {};
  rows.forEach(r=>{
    const key = r.e.name || '';
    if(!by[key]) by[key] = {name:key, v:0, count:0};
    by[key].v += r.v; by[key].count++;
  });
  return Object.keys(by).map(k=>by[k]).sort((a,b)=>b.v - a.v);
}

let bdState = null;
function openBreakdown(spec, entries, opts){
  if(!spec) return;
  opts = opts || {};
  bdState = {spec:spec, entries:entries, opts:opts};
  renderBreakdown();
  openSheet('breakdown-backdrop');
}

/* ---- one nutrient, over time ----
   A single day of anything is noise. Iron on Tuesday means nothing; iron
   across a month is the thing worth knowing, and it is the view every serious
   tracker has and COACH did not. Days with nothing logged are left out rather
   than drawn as zero - an empty day is not a day you ate no iron.            */
let bdHistDays = 30;
function nutrientHistory(spec, nDays){
  const out = [];
  const today = new Date(); today.setHours(0,0,0,0);
  for(let i = nDays - 1; i >= 0; i--){
    const d = addDays(today, -i);
    const es = loadEntries(d);
    if(!es.length) continue;
    const specs = microTargetsFor(es, d);
    const m = specs.filter(x=>x.k === spec.k)[0] ||
              (spec.k === 'protein' ? {k:'protein', read:e=>Number(e.protein)||0, target: snapFor(d).protein} : null);
    if(!m) continue;
    let total = 0, any = false;
    es.forEach(e=>{
      const v = (typeof microValue === 'function' && m.read !== undefined) ? microValue(m, e)
              : (spec.k === 'protein' ? (Number(e.protein) || 0) : (e.micros ? e.micros[spec.k] : undefined));
      if(v !== undefined && v !== null && isFinite(v)){ total += v; any = true; }
    });
    if(!any) continue;
    out.push({date: ymd(d), y: total, target: m.target || spec.target || 0,
              complete: isDayComplete(ymd(d))});
  }
  return out;
}
function nutrientHistoryHTML(spec){
  const hist = nutrientHistory(spec, bdHistDays);
  if(hist.length < 3) return '';
  const target = hist[hist.length - 1].target || spec.target || 0;
  const pts = hist.map((h, i)=>({x: i, y: h.y}));
  const avg = hist.reduce((a, h)=>a + h.y, 0) / hist.length;
  const hit = spec.limit
    ? hist.filter(h=>h.target > 0 && h.y <= h.target).length
    : hist.filter(h=>h.target > 0 && h.y >= h.target * 0.9).length;
  const word = spec.limit ? 'under the limit' : 'at or near target';
  return '<div class="bd-lab" style="margin-top:22px;"><span>Over time</span>'+
    '<span class="bd-hist-tabs">'+[30, 90].map(n=>'<button data-bdhist="'+n+'"'+
      (bdHistDays === n ? ' class="on"' : '')+'>'+n+'d</button>').join('')+'</span></div>'+
    dataLine(pts, {colour: spec.limit ? 'var(--caution)' : 'var(--accent)', guide: target, h: 76}) +
    '<div class="bd-foot" style="margin-top:6px; padding-top:0;">'+
      '<b>'+bdFmt(spec, avg)+(spec.u === 'ug' ? 'µg' : spec.u)+'</b> a day on average across '+
      hist.length+' logged day'+(hist.length === 1 ? '' : 's')+
      (target > 0 ? ', and <b>'+hit+' of '+hist.length+'</b> '+word+'.' : '.')+
      (target > 0 ? ' The line across is your target.' : '')+'</div>';
}

function renderBreakdown(){
  if(!bdState) return;
  const {spec, entries, opts} = bdState;
  const c = contributorsFor(entries, spec);
  // `weekly` meant exactly seven days. Reviews now open this over a month too,
  // so the window length is passed in and the target scaled to match - a
  // month's calcium against one week's target reads four times too high.
  const days = opts.days || (opts.weekly ? 7 : 1);
  const weekly = days > 1;
  const unit = spec.u;
  const total = c.total;
  const target = spec.target * days;

  document.getElementById('bd-title').textContent = spec.n;

  let head = '<div style="font-size:12.5px; color:var(--text3); margin-top:-6px;">'+
    (opts.label ? esc(opts.label) : weekly ? 'Last '+days+' days' : dayLabel(currentDate)) + ' &middot; ' +
    (c.missing.length
      ? c.rows.length+' of '+entries.length+' items had a figure'
      : entries.length+' item'+(entries.length===1?'':'s')+' logged') + '</div>';

  let pill = '';
  if(target > 0){
    if(spec.limit){
      pill = total > target
        ? '<span class="pill high">'+bdFmt(spec, total-target)+unit+' over</span>'
        : '<span class="pill">'+bdFmt(spec, target-total)+unit+' under the limit</span>';
    } else {
      pill = total < target
        ? '<span class="pill low">'+bdFmt(spec, target-total)+unit+' to go</span>'
        : '<span class="pill">target met</span>';
    }
  }
  const col = spec.col || (spec.limit
    ? (total > target ? 'var(--danger)' : 'var(--accent)')
    : (target > 0 && total/target < 0.7 ? 'var(--caution)' : 'var(--accent)'));

  head += '<div class="bd-tot"><span class="big">'+bdFmt(spec, total)+
    (unit ? '<s>'+unit+'</s>' : '')+'</span>'+
    (target > 0 ? '<span class="of">of '+fmt0(target)+unit+
       (spec.limit ? ' limit' : '')+'</span>' : '')+ pill + '</div>'+
    '<div class="bd-bar"><div style="width:'+
      (target > 0 ? Math.max(1, Math.min(100, total/target*100)) : 0).toFixed(0)+
      '%; background:'+col+'"></div></div>';

  // What it is for, before where it came from. A figure with no idea what it
  // does is just a number.
  let body = estimatedNote(spec) + nutrientInfoHTML(spec.k);
  if(days === 1 && (spec.trainBumped || spec.pufaSet)){
    body += '<div class="bd-foot" style="margin-top:10px; padding-top:0;">'+
      (spec.trainBumped
        ? 'Training day, so this is up on a rest day \u2014 sweat costs salt, potassium and magnesium, and your water target is 500 ml higher too.'
        : 'This target follows the polyunsaturated fat you ate today: 0.4 mg of vitamin E per gram of it.')+
      '</div>';
  }
  // Where the target came from, for the few that move with your own figures.
  if(days === 1 && (spec.perKcal || spec.pctEnergy)){
    body += '<div class="bd-foot" style="margin-top:10px; padding-top:0;">'+
      (spec.pctEnergy
        ? 'Your limit is '+Math.round(spec.pctEnergy*100)+'% of what you eat, so it moves with your calorie target.'
        : 'Your target is '+spec.perKcal+' '+(spec.u==='ug'?'µg':spec.u)+' per 1,000 kcal, so it moves with your calorie target.')+
      '</div>';
  }
  if(!c.rows.length){
    body += '<div class="bd-empty">Nothing logged has a figure for this yet.</div>';
  } else {
    const list = weekly ? groupContributors(c.rows) : c.rows;
    // Scaled to the biggest contributor, not the target - see the note above.
    const top = list[0].v || 1;
    body += '<div class="bd-lab"><span>Where it came from</span><span>'+
      list.length+' item'+(list.length===1?'':'s')+'</span></div>';
    body += list.map(r=>{
      const share = total > 0 ? Math.round(r.v/total*100) : 0;
      const name = weekly ? r.name : (r.e.name || '');
      const amt = weekly
        ? (r.count > 1 ? r.count+'&times;' : '')
        : esc(amountLabelPlain(r.e));
      const dim = r.v <= 0;
      const tappable = !weekly && !opts.noEdit;
      return '<button class="bd-row'+(tappable ? ' tap' : '')+'"'+
        (tappable ? ' data-bdrow="'+r.i+'"' : '')+'>'+
        '<div class="bd-fh"><span class="bd-fn">'+esc(name)+
          (amt ? '<span class="amt">'+amt+'</span>' : '')+'</span>'+
        '<span class="bd-fv" style="color:'+(dim ? 'var(--text3)' : col)+'">'+
          bdFmt(spec, r.v)+unit+'<span class="pc">'+share+'%</span></span></div>'+
        '<div class="bd-fb"><div style="width:'+
          Math.max(1, Math.round(r.v/top*100))+'%; background:'+
          (dim ? 'var(--n3)' : col)+'"></div></div></button>';
    }).join('');
  }

  // The honest part. Only ever shown when something really is missing, which
  // for a macro is never - every food has protein, carbs and fat.
  if(c.missing.length){
    const kcalMissing = c.missing.reduce((s,r)=>s+(r.e.kcal||0), 0);
    body += '<div class="bd-gap"><div class="gh"><i class="ti ti-alert-triangle" aria-hidden="true"></i>'+
      '<b>'+c.missing.length+' item'+(c.missing.length===1?'':'s')+' had no '+
      esc(spec.n.toLowerCase())+' figure</b></div>'+
      '<div class="gb">They added nothing to this total &mdash; not zero, just no published '+
      'number. Your real figure is higher than this by an unknown amount.</div>'+
      '<div style="margin-top:10px;">'+
      c.missing.map(r=>
        '<button class="bd-row'+((weekly || opts.noEdit) ? '' : ' tap')+'"'+
          ((weekly || opts.noEdit) ? '' : ' data-bdmiss="'+r.i+'"')+'>'+
        '<div class="bd-fh" style="margin-bottom:0;"><span class="bd-fn" style="color:var(--text2)">'+
          esc(r.e.name||'')+'</span>'+
        '<span class="bd-fv" style="color:var(--text3); font-weight:400;">'+
          fmt0(r.e.kcal||0)+' kcal</span></div></button>').join('')+
      '</div></div>';
    if(kcalMissing > 0 && !weekly){
      body += '<div class="bd-foot">That is <b>'+fmt0(kcalMissing)+' kcal</b> of today unaccounted for '+
        'on this nutrient. Tap one to add its figures.</div>';
    }
  } else if(c.rows.length > 2 && total > 0){
    const list = weekly ? groupContributors(c.rows) : c.rows;
    const topShare = Math.round(list[0].v/total*100);
    const top3 = Math.round(list.slice(0,3).reduce((s,r)=>s+r.v,0)/total*100);
    if(topShare >= 50){
      body += '<div class="bd-foot">One item is carrying <b>'+topShare+'%</b> of this.</div>';
    } else if(top3 >= 90){
      body += '<div class="bd-foot">Three items are <b>'+top3+'%</b> of it.</div>';
    }
  }

  // What to eat for MORE of it. The list above only says where today's came
  // from; this is the other half of the question. Skipped for limits (nobody
  // needs a list of salty foods) and for anything the tables can't rank.
  // The two with no column in any table COACH carries: named sources, no
  // invented figures.
  if(!spec.limit && !spec.info && RICH_NO_TABLE[spec.k]){
    const nt = RICH_NO_TABLE[spec.k];
    body += '<div class="bd-lab" style="margin-top:22px;"><span>Where to get it</span></div>'+
      '<p class="dp-p">'+nt.foods+'</p>'+
      '<p class="dp-foot" style="margin-top:0;">'+nt.note+'</p>';
  }
  if(!spec.limit && !spec.info && spec.k && !RICH_NO_TABLE[spec.k]){
    const nskip = shuffleAt['nut:' + spec.k] || 0;
    const best = foodsRichIn(spec.k, 6, nskip);
    if(best.length){
      const gap = target > 0 ? Math.max(0, target - total) : 0;
      body += '<div class="bd-lab shufh" style="margin-top:22px;"><span>Best foods for '+
        esc(spec.n.toLowerCase())+'</span>'+
        '<button class="shufb" data-shufnut="'+esc(spec.k)+'">'+
        '<i class="ti ti-arrows-shuffle" aria-hidden="true"></i>Shuffle</button></div>'+
        (RICH_VIA_PROTEIN[spec.k]
          ? '<p class="dp-foot" style="margin-top:0; margin-bottom:8px;">No food table COACH '+
            'carries lists amino acids separately, so this is ranked on protein instead — which '+
            'tracks it closely in meat, fish, eggs and dairy, and less closely in plants. The '+
            'percentages are of a day\'s protein, not of a day\'s '+esc(spec.n.toLowerCase())+'.</p>'
          : '')+
        best.map(x=>{
          // foodsRichIn already measures against your own daily target.
          const amt = x.share * spec.target;
          const pct = Math.round(x.share*100);
          const fills = days === 1 && gap > 0 && amt >= gap;
          return '<div class="bd-row bd-best"><div class="bd-fh"><span class="bd-fn">'+esc(x.name)+
            '<span class="amt">'+x.portion+'g</span></span>'+
            '<span class="bd-fv" style="color:var(--accent)">'+pct+'%<span class="pc">of a day</span></span></div>'+
            (fills ? '<div class="bd-fill">Covers what you\'re missing</div>' : '')+'</div>';
        }).join('');
    }
  }

  // The month behind this one day.
  let histHTML = '';
  try{ histHTML = nutrientHistoryHTML(spec); }catch(e){ histHTML = ""; }
  document.getElementById('bd-body').innerHTML = head + body + histHTML;
  document.getElementById('bd-body').querySelectorAll('[data-bdhist]').forEach(b=>{
    b.onclick = ()=>{ bdHistDays = Number(b.dataset.bdhist) || 30; renderBreakdown(); };
  });
  // Shuffle walks further down the same ranking and redraws this sheet.
  document.getElementById('bd-body').querySelectorAll('[data-shufnut]').forEach(b=>{
    b.onclick = ()=>{
      const id = 'nut:' + b.dataset.shufnut;
      shuffleAt[id] = (shuffleAt[id] || 0) + 6;
      renderBreakdown();
    };
  });
  // A chip walks through to the part of the body that needs this nutrient.
  // The breakdown closes first so the pages do not stack up on each other.
  document.getElementById('bd-body').querySelectorAll('[data-nisys]').forEach(b=>{
    b.onclick = ()=>{
      const k = b.dataset.nisys;
      closeSheet('breakdown-backdrop');
      setTimeout(()=>{ try{ openSystem(k, loadEntries(currentDate)); }catch(e){} }, HANDOFF);
    };
  });

  // Tapping a food goes back to the entry it came from. For one with no figure
  // it opens the label sheet instead, which is the thing that would fix it.
  document.getElementById('bd-body').querySelectorAll('[data-bdrow]').forEach(b=>{
    b.onclick = ()=>{
      const i = Number(b.dataset.bdrow);
      closeSheet('breakdown-backdrop');
      setTimeout(()=>openEntryEdit(i), HANDOFF);
    };
  });
  document.getElementById('bd-body').querySelectorAll('[data-bdmiss]').forEach(b=>{
    b.onclick = ()=>{
      const es = loadEntries(currentDate);
      const e = es[Number(b.dataset.bdmiss)];
      if(!e) return;
      closeSheet('breakdown-backdrop');
      setTimeout(()=>openLabelSheet(per100From(e, true)), HANDOFF);
    };
  });
}

// The last seven days flattened into one list, matching the window the weekly
// view already charts.
function weekEntries(){
  const today = new Date(); today.setHours(0,0,0,0);
  let all = [];
  for(let i=6;i>=0;i--) all = all.concat(loadEntries(addDays(today,-i)));
  return all;
}

// The amount as text, without the markup amountLabel() wraps it in.
function amountLabelPlain(e){
  if(!e) return '';
  if(e.qty && e.unit) return e.qty+' '+pluralUnit(e.unit, e.qty);
  if(e.grams && !e.perItem) return e.grams + (entryBasis(e)==='ml' ? ' ml' : 'g');
  return '';
}

// The four numbers the full review leads with. The suggestions stay inside it -
// they are a paragraph each and would swamp the day screen.
function renderDayReviewCard(){
  const card = document.getElementById('day-review-card');
  if(!card) return;
  const ds = ymd(currentDate);
  // Only for a day that has been confirmed, which is the same condition that
  // opens the review in the first place.
  if(!isDayComplete(ds) || getDailyIntake(ds) <= 0){
    card.style.display = 'none';
    return;
  }
  const r = dayReviewData(currentDate);
  const t = r.targets;
  const pct = (a,b) => b > 0 ? Math.max(0, Math.min(100, a/b*100)) : 0;
  const col = z => z === 'in' ? 'var(--accent)' : z === 'far' ? 'var(--danger)' : 'var(--score-fair)';
  const tgtL = r.hydTL;
  const cell = (lab, val, unit, sub, w, c) =>
    '<div class="rvc-cell"><div class="rvl">'+lab+'</div>'+
    '<div class="rvv" style="color:'+c+'">'+val+(unit?'<s>'+unit+'</s>':'')+'</div>'+
    '<div class="rvs">'+sub+'</div>'+
    '<div class="rvb"><div style="width:'+w.toFixed(0)+'%; background:'+c+'"></div></div></div>';

  document.getElementById('drc-title').textContent =
    (ds === todayYMD() ? "Today's review" : dayLabel(currentDate)+"'s review");

  document.getElementById('drc-grid').innerHTML =
    cell('Kcal', fmt0(r.kcal), '', 'of '+fmt0(t.kcal), pct(r.kcal, t.kcal), col(r.zone)) +
    cell('Protein', fmt0(r.pro), 'g', 'of '+fmt0(t.protein)+'g', pct(r.pro, t.protein),
         r.pro >= t.protein ? 'var(--accent)' : 'var(--score-fair)') +
    cell('Hydration', r.hydL.toFixed(1), 'L', 'of '+tgtL.toFixed(1)+'L', pct(r.hydL, tgtL),
         r.hydL >= tgtL ? 'var(--accent)' : 'var(--score-fair)') +
    (r.food.score === null
      ? cell('Food', '&mdash;', '', 'not scored', 0, 'var(--text3)')
      : cell('Food', String(r.food.score), '', 'quality', r.food.score,
             scoreBand(r.food.score).cls === 'good' ? 'var(--accent)'
               : scoreBand(r.food.score).cls === 'fair' ? 'var(--score-fair)' : 'var(--danger)'));

  card.style.display = '';
}

