// ---- filling a gap from the packet ----
let labelFood = null;
function openLabelSheet(food){ return openNutFor(food); }
document.getElementById('lab-cancel').onclick = ()=> closeSheet('label-backdrop');
document.getElementById('lab-more').onclick = ()=>{
  const f = labelFood;
  closeSheet('label-backdrop');
  setTimeout(()=>openMicroEditor(f), HANDOFF);
};
document.getElementById('micro-cancel').onclick = ()=> closeSheet('micro-backdrop');
document.getElementById('nova-cancel').onclick = ()=> closeSheet('nova-backdrop');
document.getElementById('ocr-cancel').onclick = ()=>{ ocrToManual = false; closeSheet('ocr-backdrop'); };
document.getElementById('ocr-read').onclick = ()=> ocrRun();
document.getElementById('ocr-save').onclick = ()=> ocrSave();
document.getElementById('ocr-file').onchange = (e)=>{
  const f = e.target.files && e.target.files[0];
  if(f) ocrShowImage(f);
  e.target.value = '';
};
document.getElementById('lab-photo').onclick = ()=>{
  const f = labelFood;
  closeSheet('label-backdrop');
  setTimeout(()=>openOcrSheet(f), HANDOFF);
};
document.getElementById('micro-photo').onclick = ()=>{
  const f = microEditFood;
  closeSheet('micro-backdrop');
  setTimeout(()=>openOcrSheet(f, ()=>openMicroEditor(f)), HANDOFF);
};
// Dragging the crop box: move it from anywhere inside, resize from the corner.
(function(){
  const cv = document.getElementById('ocr-canvas');
  if(!cv) return;
  let mode = null, ox = 0, oy = 0;
  const at = ev=>{
    const r = cv.getBoundingClientRect();
    const t = ev.touches ? ev.touches[0] : ev;
    return {x: (t.clientX - r.left) * (cv.width / r.width),
            y: (t.clientY - r.top) * (cv.height / r.height)};
  };
  const down = ev=>{
    if(!ocrBox) return;
    const pnt = at(ev);
    const corner = Math.abs(pnt.x - (ocrBox.x + ocrBox.w)) < 26 * ocrK && Math.abs(pnt.y - (ocrBox.y + ocrBox.h)) < 26 * ocrK;
    mode = corner ? 'size' : 'move';
    ox = pnt.x - ocrBox.x; oy = pnt.y - ocrBox.y;
    ev.preventDefault();
  };
  const move = ev=>{
    if(!mode || !ocrBox) return;
    const pnt = at(ev);
    if(mode === 'move'){
      ocrBox.x = Math.max(0, Math.min(cv.width - ocrBox.w, pnt.x - ox));
      ocrBox.y = Math.max(0, Math.min(cv.height - ocrBox.h, pnt.y - oy));
    } else {
      ocrBox.w = Math.max(40 * ocrK, Math.min(cv.width - ocrBox.x, pnt.x - ocrBox.x));
      ocrBox.h = Math.max(40 * ocrK, Math.min(cv.height - ocrBox.y, pnt.y - ocrBox.y));
    }
    ocrDraw();
    ev.preventDefault();
  };
  const up = ()=>{ mode = null; };
  cv.addEventListener('pointerdown', down);
  cv.addEventListener('pointermove', move);
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
})();
document.getElementById('nova-auto').onclick = ()=>{
  if(!novaFood) return;
  saveLabel(novaFood.name, {nova: null});
  closeSheet('nova-backdrop');
  if(novaThen) novaThen();
  renderDay();
};
document.getElementById('micro-clear').onclick = ()=>{
  if(!microEditFood) return;
  if(!confirm('Drop the figures you typed for ' + microEditFood.name + '? The databases fill back in behind them.')) return;
  const L = labelFor(microEditFood.name) || {};
  saveLabel(microEditFood.name, {sug: L.sug == null ? null : L.sug, sat: L.sat == null ? null : L.sat,
                                 fib: L.fib == null ? null : L.fib, sod: L.sod == null ? null : L.sod,
                                 micros: null});
  closeSheet('micro-backdrop');
  renderDay();
};
document.getElementById('micro-save').onclick = ()=>{
  if(!microEditFood) return;
  const L = labelFor(microEditFood.name) || {};
  const micros = Object.assign({}, (L.micros && typeof L.micros === 'object') ? L.micros : {});
  let n = 0;
  document.querySelectorAll('#micro-body [data-microk]').forEach(el=>{
    const k = el.dataset.microk;
    const raw = String(el.value).trim();
    if(raw === ''){ delete micros[k]; return; }
    const v = Number(raw);
    if(!isFinite(v) || v < 0) return;
    micros[k] = v; n++;
  });
  saveLabel(microEditFood.name, {sug: L.sug == null ? null : L.sug, sat: L.sat == null ? null : L.sat,
                                 fib: L.fib == null ? null : L.fib, sod: L.sod == null ? null : L.sod,
                                 micros: Object.keys(micros).length ? micros : null});
  buzz();
  closeSheet('micro-backdrop');
  if(pendingFood && pendingFood.name === microEditFood.name){
    pendingFood = applyLabel(pendingFood);
    renderScorePanel(pendingFood);
  }
  renderDay();
};
document.getElementById('lab-save').onclick = ()=>{
  if(!labelFood) return;
  const num = id =>{
    const v = document.getElementById(id).value;
    if(v === '' || v === null) return null;
    const n = Number(v);
    return (isFinite(n) && n >= 0) ? n : null;
  };
  const salt = num('lab-salt');
  saveLabel(labelFood.name, {
    sug: num('lab-sug'), sat: num('lab-sat'), fib: num('lab-fib'),
    // UK labels print salt; Nutri-Score wants sodium in mg.
    sod: salt === null ? null : Math.round(salt*1000/2.5)
  });
  buzz();
  closeSheet('label-backdrop');
  // Re-read the food so the panel scores off what was just typed.
  if(pendingFood && pendingFood.name === labelFood.name){
    pendingFood = applyLabel(pendingFood);
    renderScorePanel(pendingFood);
  }
  renderDay();
};

