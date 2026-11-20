// ---- Drag sheets down to dismiss ----
// Drag from the handle anywhere, or from the sheet body when it is scrolled to
// the top — same behaviour as a native iOS sheet.
document.querySelectorAll('.sheet-backdrop').forEach(bd=>{
  const sheet = bd.querySelector('.sheet');
  if(!sheet) return;
  let startY = 0, lastY = 0, lastT = 0, vel = 0, dragging = false, armed = false;

  // Proportional to the sheet. A flat 120px is most of a short sheet — the kind
  // you want gone quickest — and barely a nudge on a tall one.
  const closeAt = ()=>{
    const h = sheet.offsetHeight || 0;
    return h > 0 ? Math.max(64, Math.min(130, h * 0.22)) : 90;
  };

  sheet.addEventListener('pointerdown', (e)=>{
    if(e.pointerType === 'mouse' && e.button !== 0) return;
    const onHandle = !!e.target.closest('.sheet-handle');
    // Never hijack a drag that starts on something you are trying to use.
    if(!onHandle && e.target.closest('input, select, textarea, button, #search-results, .recents-row')) return;
    if(!onHandle && sheet.scrollTop > 0) return;
    startY = lastY = e.clientY; lastT = performance.now(); vel = 0;
    armed = true; dragging = false;
  });

  sheet.addEventListener('pointermove', (e)=>{
    if(!armed) return;
    const dy = e.clientY - startY;
    if(!dragging){
      if(dy < 8) { if(dy < -4) armed = false; return; }  // upward move = scrolling
      dragging = true;
      sheet.classList.add('dragging');
      // Freeze the sheet's own scrolling for the duration, so a fast pull
      // cannot start scrolling the content halfway through the gesture.
      sheet.classList.add('nodrag');
      sheet.classList.remove('snapback');
      if(sheet.setPointerCapture) try{ sheet.setPointerCapture(e.pointerId); }catch(err){}
    }
    const now = performance.now();
    if(now > lastT){ vel = (e.clientY - lastY) / (now - lastT); lastT = now; lastY = e.clientY; }
    // Slight resistance past the top edge rather than a hard stop.
    const shift = dy < 0 ? dy / 4 : dy;
    sheet.style.transform = 'translateY('+shift+'px)';
    bd.style.background = 'rgba(0,0,0,'+Math.max(0.15, 0.6 - dy/900)+')';
    e.preventDefault();
  });

  const release = (e)=>{
    if(!armed) return;
    armed = false;
    if(!dragging) return;
    dragging = false;
    const dy = e.clientY - startY;
    sheet.classList.remove('dragging','nodrag');
    sheet.style.transform = '';
    bd.style.background = '';
    // Close on a long drag OR a quick flick. Both thresholds were too strict:
    // a deliberate pull that stopped at 100px snapped back, which reads as the
    // sheet refusing to close.
    if(dy > closeAt() || vel > 0.45){
      closeSheet(bd.id);
      if(bd.id === 'scan-backdrop') stopScan();
    } else {
      sheet.classList.add('snapback');
      setTimeout(()=>sheet.classList.remove('snapback'), 240);
    }
  };
  sheet.addEventListener('pointerup', release);
  sheet.addEventListener('pointercancel', release);
});

// Every empty state's button, wired in one place. Delegated, because the
// states are re-rendered constantly and per-render wiring goes stale.
document.addEventListener('click', e=>{
  const b = e.target.closest('[data-estate]');
  if(!b) return;
  if(b.dataset.estate === 'add') document.getElementById('open-add').click();
});

document.getElementById('undo-btn').onclick = doUndo;
// A stale bar after the sheet moves under it would offer to undo something you
// can no longer see, so it goes when you navigate.
document.getElementById('prev-day').addEventListener('click', hideUndo);
document.getElementById('next-day').addEventListener('click', hideUndo);

document.getElementById('open-add').onclick = ()=>{ selectMeal(guessMeal()); disarmBarcode(); openSheet('add-backdrop'); };
document.getElementById('target-btn').onclick = ()=>{
  renderBin();
  renderMyFoodsCount();
  document.getElementById('target-input').value = targets.kcal;
  document.getElementById('target-p').value = targets.protein;
  document.getElementById('target-c').value = targets.carbs;
  document.getElementById('target-f').value = targets.fat;
  document.getElementById('pring-toggle').checked = proteinRingOn();
  document.getElementById('auto-toggle').checked = autoOn();
  document.getElementById('sound-toggle').checked = soundOn();
  renderAdjustLog();
  const cfg = loadCycle();
  document.getElementById('cycle-toggle').checked = cfg.on;
  document.getElementById('cycle-training').value = cfg.trainingDays;
  document.getElementById('cycle-split').value = cfg.boost;
  renderCyclePreview();
  renderFdcSettings();
  try{ stRefresh(); }catch(e){}
  openSheet('target-backdrop');
};
document.getElementById('target-save').onclick = ()=>{
  // Blank fields keep your current value — they used to reset you to 2400/150/250/80.
  const next = {
    kcal: Number(document.getElementById('target-input').value) || targets.kcal,
    protein: Number(document.getElementById('target-p').value) || targets.protein,
    carbs: Number(document.getElementById('target-c').value) || targets.carbs,
    fat: Number(document.getElementById('target-f').value) || targets.fat
  };
  setTargets(next, 'manual', 'You set this target by hand in Settings.');
  closeSheet('target-backdrop');
  if(currentView==='day') renderDay(); else renderWeek();
};

/* v133: the Daily target card. Steppers, a live check that the macros add up
   to the calories, and Save / Undo that only show once something changed. */
function stVals(){
  const n = id => Number(document.getElementById(id).value) || 0;
  return {kcal: n('target-input'), p: n('target-p'), c: n('target-c'), f: n('target-f')};
}
function stRefresh(){
  const v = stVals();
  const dirty = Math.round(v.kcal) !== Math.round(targets.kcal) || Math.round(v.p) !== Math.round(targets.protein) ||
                Math.round(v.c) !== Math.round(targets.carbs) || Math.round(v.f) !== Math.round(targets.fat);
  const hero = document.querySelector('.st-hero');
  if(hero) hero.classList.toggle('dirty', dirty);
  const kg = Number(loadProfile().weight) || 0;
  const pct = g => v.kcal > 0 ? Math.round(g / v.kcal * 100) + '% of kcal' : '';
  document.getElementById('st-pkg').textContent = kg && v.p ? (v.p / kg).toFixed(1) + ' g/kg' : '';
  document.getElementById('st-cpc').textContent = pct(v.c * 4);
  document.getElementById('st-fpc').textContent = pct(v.f * 9);
  const sum = Math.round(v.p * 4 + v.c * 4 + v.f * 9);
  const gap = sum - Math.round(v.kcal);
  const ck = document.getElementById('st-check');
  if(!v.kcal){ ck.innerHTML = ''; }
  else if(Math.abs(gap) <= 30){
    ck.className = 'st-check ok';
    ck.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg> Macros add up to ' + fmtK(sum) + ' kcal';
  } else {
    ck.className = 'st-check warn';
    ck.innerHTML = 'Macros add up to ' + fmtK(sum) + ' kcal, ' + fmtK(Math.abs(gap)) + (gap > 0 ? ' over' : ' under') +
      ' &middot; <button type="button" id="st-fit">Fit carbs to calories</button>';
    document.getElementById('st-fit').onclick = ()=>{
      document.getElementById('target-c').value = Math.max(0, Math.round((v.kcal - v.p * 4 - v.f * 9) / 4));
      try{ tick(); }catch(e){}
      stRefresh();
    };
  }
  const log = loadAdjustLog();
  const src = log.length ? ({weekly:'set at a weekly review', adaptive:'set from your data', formula:'from your profile', manual:'set by you', cycling:'changed by cycling'}[log[0].source] || 'updated') : '';
  document.getElementById('st-prov').textContent = log.length ? src + ' · ' + prettyDate(log[0].date) : '';
  const ver = document.getElementById('st-version');
  if(ver) ver.textContent = 'COACH v' + (window.COACH_VERSION || '') + ' · your data stays on this phone' + (typeof cloudOn === 'function' && cloudOn() ? ' and your GitHub' : '') + storageLine();
}
// v136: how full the phone's store is. iPhone gives a web app about 5 MB, and
// a full store is the one thing that can stop a day being saved.
const STORE_LIMIT_MB = 5;
/* v141: in BYTES, the way the iPhone counts it. Safari stores each character
   as 2 bytes (UTF-16), so its 5 MB is about 2.5 million characters. Counting
   characters showed half the real figure. */
function storageUsedMB(){
  let n = 0;
  try{ for(let i=0;i<CS.length;i++){ const k = CS.key(i); n += k.length + (CS.getItem(k) || '').length; } }catch(e){}
  return n * 2 / 1048576;
}
function storageLine(){
  const mb = storageUsedMB();
  const used = (mb < 0.1 ? '<0.1' : mb.toFixed(1));
  // v142: in the bigger store the 5 MB cap no longer applies.
  if(CS.mode === 'idb') return ' · storage ' + used + ' MB, plenty of room';
  return ' · storage ' + used + ' of about ' + STORE_LIMIT_MB + ' MB';
}
document.querySelectorAll('[data-tstep]').forEach(b=>{
  b.onclick = ()=>{
    const [id, d] = b.dataset.tstep.split(':');
    const el = document.getElementById(id);
    el.value = Math.max(0, Math.round((Number(el.value) || 0) + Number(d)));
    try{ tick(); }catch(e){}
    stRefresh();
  };
});
['target-input','target-p','target-c','target-f'].forEach(id=>{
  document.getElementById(id).addEventListener('input', ()=>stRefresh());
});
document.getElementById('st-revert').onclick = ()=>{
  document.getElementById('target-input').value = targets.kcal;
  document.getElementById('target-p').value = targets.protein;
  document.getElementById('target-c').value = targets.carbs;
  document.getElementById('target-f').value = targets.fat;
  stRefresh();
};
document.getElementById('st-from-profile').onclick = ()=>{
  closeSheet('target-backdrop');
  setTimeout(()=>document.getElementById('profile-btn').click(), HANDOFF);
};

document.querySelectorAll('.tab[data-tab]').forEach(t=>{
  t.onclick = ()=>{
    document.querySelectorAll('.tab[data-tab]').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.tabpanel').forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    document.getElementById('tab-'+t.dataset.tab).classList.add('active');
  };
});

// A barcode scanned but not found, waiting to be attached to whatever you type
// into the manual form. Cleared once used so it can never land on the wrong food.
let pendingBarcode = null, pendingBarcodeName = '';

// A scan shows whatever Open Food Facts has filed under that barcode. Short
// supermarket codes (M&S, Aldi, Lidl use 8 digits) get reused and mis-filed,
// so the record can be a different product altogether - tortilla chips coming
// up as fettuccine. The barcode is shown so it can be checked, and "Fix it"
// saves the right product against it. Your own foods are checked before Open
// Food Facts on every scan, so the fix sticks.
let pendingBarcodeFix = false;
function renderPortionCode(food, note){
  const el = document.getElementById('portion-code');
  if(!el) return;
  // v124: every food that could have a barcode says whether it has one.
  if(!foodTakesBarcode(food)){ el.style.display = 'none'; el.innerHTML = ''; return; }
  const code = food && food.code ? String(food.code).replace(/\D/g, '') : '';
  const pre = food.prepared ? 'Figures are Open Food Facts\u2019 \u201cas prepared\u201d ones \u2014 check them against the tub.<br>' : '';
  el.innerHTML = pre + (code
    ? 'Barcode ' + esc(code) + ' &middot; <button type="button" id="portion-bcchange">Change</button>' +
      ' &middot; Wrong product? <button type="button" id="portion-fixcode">Fix it</button>'
    : '<span class="pc-none">No barcode linked</span> &middot; <button type="button" id="portion-bcchange">Add one</button>') +
    (note ? '<div class="bc-ok">' + esc(note) + '</div>' : '');
  el.style.display = '';
  const fx = document.getElementById('portion-fixcode');
  if(fx) fx.onclick = ()=> fixScannedProduct(code);
  document.getElementById('portion-bcchange').onclick = ()=>{ renderBarcodeEditor(pendingFood); };
}

