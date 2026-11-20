/* ============================ reading a label with the camera ==============
   Typing a nutrition panel in by hand is the reason most of them never get
   typed in at all. This photographs it instead: take the picture, drag the box
   round the table of figures, and COACH reads it and shows you what it got
   before anything is saved. Nothing is trusted blindly - every number lands in
   an editable row with the raw line it came from, because OCR misreads a 9 as
   a 0 often enough that a silent save would be worse than useless.

   The reading is done on the phone by Tesseract, fetched from a CDN the first
   time and cached by the service worker after that. No image ever leaves the
   device, which is the whole point of COACH holding its own data.
=========================================================================== */
const OCR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/tesseract.min.js';
let ocrLoading = null;
function loadOcrLib(){
  if(window.Tesseract) return Promise.resolve(window.Tesseract);
  if(ocrLoading) return ocrLoading;
  ocrLoading = new Promise((res, rej)=>{
    const sc = document.createElement('script');
    sc.src = OCR_LIB;
    sc.onload = ()=> window.Tesseract ? res(window.Tesseract) : rej(new Error('library did not start'));
    sc.onerror = ()=> rej(new Error('no connection'));
    document.head.appendChild(sc);
  });
  return ocrLoading;
}

let ocrFood = null, ocrThen = null, ocrImg = null, ocrBox = null, ocrRows = [];
// v118: true when the reading is for a packet that is not in any database yet.
// The figures then fill the manual form instead of being saved as a label.
let ocrToManual = false;
// Canvas pixels per screen pixel, so the box, its handle and the touch target
// stay the same size on screen whatever the photo's resolution.
let ocrK = 1;

// What a UK panel calls things, and what COACH calls them. Order matters:
// "of which saturates" has to be tried before "fat".
const OCR_FIELDS = [
  {k:'kcal',    u:'kcal', re:/\b(energy|kcal)\b/i, kcal:true},
  {k:'satfat',  u:'g',    re:/(of which\s+)?saturat/i},
  {k:'fat',     u:'g',    re:/^(?!.*\btrans).*\bfat\b/i},
  {k:'sugar',   u:'g',    re:/(of which\s+)?sugar/i},
  {k:'carbs',   u:'g',    re:/\bcarbohydrate?s?\b/i},
  {k:'fiber',   u:'g',    re:/\b(fibre|fiber)\b/i},
  {k:'protein', u:'g',    re:/\bprotein\b/i},
  {k:'salt',    u:'g',    re:/\bsalt\b/i},
  {k:'sodium',  u:'mg',   re:/\bsodium\b/i}
];
function ocrMicroFields(){
  // Everything else COACH tracks, matched on its own name plus the spellings
  // labels actually use.
  const extra = {
    'vitamin-c':/vitamin\s*c\b|ascorbic/i, 'vitamin-d':/vitamin\s*d\b/i,
    'vitamin-a':/vitamin\s*a\b|retinol/i, 'vitamin-e':/vitamin\s*e\b|tocopherol/i,
    'vitamin-k':/vitamin\s*k\b/i, 'vitamin-b1':/thiamin|vitamin\s*b\s*1\b/i,
    'vitamin-b2':/riboflavin|vitamin\s*b\s*2\b/i, 'vitamin-pp':/niacin|vitamin\s*b\s*3\b/i,
    'vitamin-b5':/pantothen/i, 'vitamin-b6':/vitamin\s*b\s*6\b|pyridox/i,
    'vitamin-b7':/biotin/i, 'vitamin-b9':/folate|folic/i,
    'vitamin-b12':/vitamin\s*b\s*12\b|cobalamin/i,
    calcium:/calcium/i, iron:/\biron\b/i, magnesium:/magnesium/i, zinc:/\bzinc\b/i,
    potassium:/potassium/i, phosphorus:/phosphor/i, selenium:/selenium/i,
    copper:/copper/i, manganese:/manganese/i, iodine:/iodine/i, chromium:/chromium/i,
    molybdenum:/molybden/i, choline:/choline/i, omega3:/omega\s*-?\s*3/i, omega6:/omega\s*-?\s*6/i,
    monofat:/mono-?unsaturat/i, polyfat:/poly-?unsaturat/i, cholesterol:/cholesterol/i,
    transfat:/\btrans\b/i
  };
  return MICROS.filter(m=>extra[m.k]).map(m=>({k:m.k, n:m.n, u:m.u, re:extra[m.k]}));
}
// "1,5 g" is 1.5 g, "<0.5" is under half, "2 180 kJ / 520 kcal" is two numbers.
function ocrNumbers(line){
  const cleaned = String(line || '')
    .replace(/[oO](?=\d)/g, '0').replace(/[lI](?=\d)/g, '1')
    .replace(/(\d)[,](\d)/g, '$1.$2')
    .replace(/\s+/g, ' ');
  const out = [];
  const re = /(<?\s*\d+(?:\.\d+)?)\s*(kcal|kj|mg|µg|ug|mcg|g|%)?/gi;
  let m;
  while((m = re.exec(cleaned))){
    const v = Number(String(m[1]).replace(/[<\s]/g, ''));
    if(!isFinite(v)) continue;
    out.push({v: v, unit: (m[2] || '').toLowerCase(), at: m.index});
  }
  return out;
}
function ocrConvert(value, fromUnit, wantUnit){
  const f = String(fromUnit || '').toLowerCase();
  const scale = {g:1, mg:1e-3, 'µg':1e-6, ug:1e-6, mcg:1e-6}[f];
  const want = {g:1, mg:1e-3, ug:1e-6}[wantUnit];
  if(scale == null || want == null) return null;
  return value * scale / want;
}
/* A decimal point is one pixel, and OCR loses it. "30.8 g" comes back as
   "308 g", which would be a tenfold error saved silently. Every figure is held
   to what is physically possible in 100 g of food, pulled back by factors of
   ten until it is, and flagged so the row is marked as one to look at. The
   calories are then checked against the macros, because 4/4/9 is arithmetic
   the label has to obey.                                                     */
const OCR_MAX = {kcal:900, fat:100, carbs:100, protein:100, sugar:100, satfat:100,
                 fiber:60, salt:30, sodium:12000};
function ocrSane(k, v){
  const cap = OCR_MAX[k];
  if(cap == null || !(v > cap)) return {v: v, fixed: false};
  let x = v, n = 0;
  while(x > cap && n < 3){ x = x / 10; n++; }
  return {v: Math.round(x * 1000) / 1000, fixed: true};
}
/* The label has to obey 4/4/9, so the calories are a check on the macros -
   and, better than a check, a way to repair them. Each of protein, carbs and
   fat is tried as it was read and as a tenth of it; whichever combination
   lands closest to the printed calories wins, as long as it lands close. Two
   more rules the panel cannot break: sugars cannot exceed carbohydrate, and
   saturated fat cannot exceed fat.                                           */
function ocrReconcile(rows){
  const by = {};
  rows.forEach(r=>{ by[r.k] = r; });
  const need = ['kcal','protein','carbs','fat'];
  if(need.every(k=>by[k])){
    const kcal = by.kcal.v;
    const opts = [1, 10];
    let best = null;
    opts.forEach(dp=>opts.forEach(dc=>opts.forEach(df=>{
      const est = 4*(by.protein.v/dp) + 4*(by.carbs.v/dc) + 9*(by.fat.v/df);
      const off = Math.abs(est - kcal) / Math.max(1, kcal);
      if(!best || off < best.off) best = {off: off, dp: dp, dc: dc, df: df};
    })));
    if(best && best.off < 0.12){
      if(best.dp > 1){ by.protein.v = Math.round(by.protein.v / best.dp * 1000) / 1000; by.protein.suspect = true; }
      if(best.dc > 1){ by.carbs.v   = Math.round(by.carbs.v   / best.dc * 1000) / 1000; by.carbs.suspect = true; }
      if(best.df > 1){ by.fat.v     = Math.round(by.fat.v     / best.df * 1000) / 1000; by.fat.suspect = true; }
    }
  }
  if(by.sugar && by.carbs && by.sugar.v > by.carbs.v * 1.02){
    by.sugar.v = Math.round(by.sugar.v / 10 * 1000) / 1000; by.sugar.suspect = true;
  }
  if(by.satfat && by.fat && by.satfat.v > by.fat.v * 1.02){
    by.satfat.v = Math.round(by.satfat.v / 10 * 1000) / 1000; by.satfat.suspect = true;
  }
  if(by.fiber && by.carbs && by.fiber.v > by.carbs.v){
    by.fiber.v = Math.round(by.fiber.v / 10 * 1000) / 1000; by.fiber.suspect = true;
  }
  return rows;
}
function ocrEnergyCheck(rows){
  const by = {};
  rows.forEach(r=>{ by[r.k] = r.v; });
  if(by.kcal == null || by.protein == null || by.carbs == null || by.fat == null) return null;
  const est = 4 * by.protein + 4 * by.carbs + 9 * by.fat;
  if(!(by.kcal > 0)) return null;
  const off = Math.abs(est - by.kcal) / by.kcal;
  return off > 0.3 ? {est: Math.round(est), kcal: Math.round(by.kcal)} : null;
}

/* v110: what a label says without printing the number. UK and EU packets give
   vitamins and minerals as a share of a fixed daily reference (the NRVs in
   EU Regulation 1169/2011, Annex XIII), so a line that reads "Calcium 15%"
   with no amount still pins the amount down exactly. These are the legal
   reference values, in the unit COACH keeps each nutrient in - not estimates
   of what is in any food. */
const OCR_NRV = {
  'vitamin-a':800, 'vitamin-d':5, 'vitamin-e':12, 'vitamin-k':75, 'vitamin-c':80,
  'vitamin-b1':1.1, 'vitamin-b2':1.4, 'vitamin-pp':16, 'vitamin-b6':1.4, 'vitamin-b9':200,
  'vitamin-b12':2.5, 'vitamin-b7':50, 'vitamin-b5':6,
  potassium:2000, calcium:800, phosphorus:700, magnesium:375, iron:14, zinc:10,
  copper:1, manganese:2, selenium:55, chromium:40, molybdenum:50, iodine:150
};
// Read a whole panel out of the OCR text.
function ocrParse(text){
  const lines = String(text || '').split(/\n+/).map(l=>l.trim()).filter(l=>l.length > 1);
  const micros = ocrMicroFields();
  const found = [];
  const seen = {};
  lines.forEach(line=>{
    const nums = ocrNumbers(line);
    if(!nums.length) return;
    // Percentages are reference intakes, not amounts.
    const amounts = nums.filter(x=>x.unit !== '%');
    if(!amounts.length){
      // No amount on the line, only a percentage of the daily reference.
      const pct = nums.filter(x=>x.unit === '%')[0];
      if(!pct || !(pct.v > 0) || pct.v > 1000) return;
      for(const m of micros){
        if(seen[m.k] || !m.re.test(line) || OCR_NRV[m.k] == null) continue;
        found.push({k:m.k, n:m.n, u:m.u, v: Math.round(OCR_NRV[m.k] * pct.v / 100 * 1000) / 1000,
                    line: line, micro:true, note:'worked out from ' + pct.v + '% of the UK daily reference'});
        seen[m.k] = 1;
        return;
      }
      return;
    }
    for(const f of OCR_FIELDS){
      if(seen[f.k] || !f.re.test(line)) continue;
      if(f.kcal){
        let kc = amounts.filter(x=>x.unit === 'kcal')[0] ||
                   (amounts.length > 1 ? amounts[1] : amounts[0]);
        let kjNote = null;
        // Only kilojoules printed: calories are that divided by 4.184, exactly.
        if(kc && kc.unit === 'kj' && !amounts.some(x=>x.unit === 'kcal')){
          const kj = amounts.filter(x=>x.unit === 'kj')[0];
          kc = {v: Math.round(kj.v / 4.184), unit:'kcal'};
          kjNote = 'worked out from ' + kj.v + ' kJ';
        }
        if(kc){ const sane = ocrSane('kcal', kc.v);
                found.push({k:'kcal', n:'Calories', u:'kcal', v: sane.v, line: line, suspect: sane.fixed, note: kjNote});
                seen.kcal = 1; }
        return;
      }
      const a = amounts[0];
      let v = a.unit ? ocrConvert(a.v, a.unit, f.u === 'kcal' ? 'g' : f.u) : a.v;
      if(v == null) v = a.v;
      const sane = ocrSane(f.k, Math.round(v * 1000) / 1000);
      found.push({k:f.k, n:f.k === 'salt' ? 'Salt' : (f.k.charAt(0).toUpperCase() + f.k.slice(1)),
                  u:f.u, v: sane.v, line: line, suspect: sane.fixed});
      seen[f.k] = 1;
      return;
    }
    for(const m of micros){
      if(seen[m.k] || !m.re.test(line)) continue;
      const a = amounts[0];
      const v = ocrConvert(a.v, a.unit || m.u, m.u);
      if(v == null) continue;
      found.push({k:m.k, n:m.n, u:m.u, v: Math.round(v * 1000) / 1000, line: line, micro:true});
      seen[m.k] = 1;
      return;
    }
  });
  return found;
}

function openOcrSheet(food, then){
  ocrFood = food; ocrThen = then || null;
  ocrImg = null; ocrRows = [];
  document.getElementById('ocr-title').textContent = food ? food.name : 'Read a label';
  ocrStage('pick');
  openSheet('ocr-backdrop');
}
function ocrStage(stage, msg){
  const pick = document.getElementById('ocr-pick');
  const crop = document.getElementById('ocr-crop-wrap');
  const res  = document.getElementById('ocr-results');
  const note = document.getElementById('ocr-note');
  const act  = document.getElementById('ocr-read');
  const save = document.getElementById('ocr-save');
  pick.hidden = stage !== 'pick';
  crop.hidden = stage !== 'crop';
  res.hidden  = stage !== 'done';
  act.hidden  = stage !== 'crop';
  save.hidden = stage !== 'done';
  note.textContent = msg || (
    stage === 'pick' ? 'Take a photo of the nutrition table, straight on and filling the frame.' :
    stage === 'crop' ? 'Drag the box round the figures only — leave the ingredients out.' :
    stage === 'busy' ? 'Reading…' : 'Check every figure before saving. Tap one to fix it.');
}
function ocrShowImage(file){
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = ()=>{
    ocrImg = img;
    const cv = document.getElementById('ocr-canvas');
    // The canvas used to be 360 pixels wide and then stretched over a screen
    // with three pixels to every one of those, which is what made the photo
    // look blurred. It is now drawn at the screen's real resolution.
    const maxW = Math.min(360, window.innerWidth - 60);
    const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    const pxW = Math.max(1, Math.min(img.width, Math.round(maxW * dpr)));
    const scale = pxW / img.width;
    cv.width = Math.round(img.width * scale);
    cv.height = Math.round(img.height * scale);
    ocrK = cv.width / maxW;
    ocrBox = {x: cv.width * 0.06, y: cv.height * 0.12,
              w: cv.width * 0.88, h: cv.height * 0.62};
    ocrDraw();
    ocrStage('crop');
    URL.revokeObjectURL(url);
  };
  img.onerror = ()=> ocrStage('pick', 'That image could not be opened.');
  img.src = url;
}
function ocrDraw(){
  const cv = document.getElementById('ocr-canvas');
  const cx = cv.getContext('2d');
  if(!ocrImg) return;
  cx.imageSmoothingEnabled = true;
  try{ cx.imageSmoothingQuality = 'high'; }catch(e){}
  cx.drawImage(ocrImg, 0, 0, cv.width, cv.height);
  cx.fillStyle = 'rgba(0,0,0,0.45)';
  cx.fillRect(0, 0, cv.width, ocrBox.y);
  cx.fillRect(0, ocrBox.y + ocrBox.h, cv.width, cv.height - (ocrBox.y + ocrBox.h));
  cx.fillRect(0, ocrBox.y, ocrBox.x, ocrBox.h);
  cx.fillRect(ocrBox.x + ocrBox.w, ocrBox.y, cv.width - (ocrBox.x + ocrBox.w), ocrBox.h);
  cx.strokeStyle = '#7bd88f'; cx.lineWidth = 2 * ocrK;
  cx.strokeRect(ocrBox.x, ocrBox.y, ocrBox.w, ocrBox.h);
  cx.fillStyle = '#7bd88f';
  cx.fillRect(ocrBox.x + ocrBox.w - 11 * ocrK, ocrBox.y + ocrBox.h - 11 * ocrK, 14 * ocrK, 14 * ocrK);
}
// The cropped strip, blown up and flattened to black on white, which is what
// an OCR engine reads best.
function ocrPrepared(){
  const cv = document.getElementById('ocr-canvas');
  const sx = ocrBox.x / cv.width, sy = ocrBox.y / cv.height;
  const sw = ocrBox.w / cv.width, sh = ocrBox.h / cv.height;
  const out = document.createElement('canvas');
  const srcW = ocrImg.width * sw, srcH = ocrImg.height * sh;
  const scale = Math.min(3, Math.max(1, 1500 / Math.max(1, srcW)));
  out.width = Math.round(srcW * scale);
  out.height = Math.round(srcH * scale);
  const ox = out.getContext('2d');
  ox.drawImage(ocrImg, ocrImg.width * sx, ocrImg.height * sy, srcW, srcH, 0, 0, out.width, out.height);
  const data = ox.getImageData(0, 0, out.width, out.height);
  const d = data.data;
  let min = 255, max = 0;
  for(let i = 0; i < d.length; i += 4){
    const g = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
    d[i] = d[i+1] = d[i+2] = g;
    if(g < min) min = g;
    if(g > max) max = g;
  }
  const span = Math.max(1, max - min);
  for(let i = 0; i < d.length; i += 4){
    const v = (d[i] - min) / span * 255;
    const s = v < 128 ? Math.max(0, v * 0.6) : Math.min(255, 128 + (v - 128) * 1.6);
    d[i] = d[i+1] = d[i+2] = s;
  }
  ox.putImageData(data, 0, 0);
  return out;
}
async function ocrRun(){
  ocrStage('busy', 'Reading the label… the first time also downloads the reader.');
  document.getElementById('ocr-read').hidden = true;
  let T;
  try{ T = await loadOcrLib(); }
  catch(e){
    ocrStage('crop', 'The reader could not be downloaded (' + e.message + '). It needs a connection the first time. You can still type the figures in.');
    return;
  }
  try{
    const canvas = ocrPrepared();
    const res = await T.recognize(canvas, 'eng');
    const text = (res && res.data && res.data.text) || '';
    ocrRows = ocrReconcile(ocrParse(text));
    if(!ocrRows.length){
      ocrStage('crop', 'Nothing readable in that box. Try again closer, straighter, or with more light.');
      return;
    }
    ocrRenderRows(text);
    ocrStage('done');
  }catch(e){
    ocrStage('crop', 'That did not read: ' + ((e && e.message) || 'unknown error'));
  }
}
function ocrRenderRows(rawText){
  const box = document.getElementById('ocr-rows');
  const warn = ocrEnergyCheck(ocrRows);
  const suspect = ocrRows.filter(r=>r.suspect).length;
  box.innerHTML =
    (suspect ? '<div class="ocr-warn">' + suspect + ' figure' + (suspect === 1 ? '' : 's') +
      ' looked impossible and ' + (suspect === 1 ? 'was' : 'were') + ' pulled back by a decimal point \u2014 ' +
      'a lost dot is the commonest thing a camera gets wrong. Check ' + (suspect === 1 ? 'it' : 'them') + '.</div>' : '') +
    (warn ? '<div class="ocr-warn">These macros add up to about ' + warn.est + ' kcal, but the label reads ' +
      warn.kcal + '. One of them has been misread.</div>' : '') +
    ocrRows.map((r, i)=>
      '<div class="me-row"><span class="me-n">' + esc(r.n) + (r.suspect ? ' \u26a0' : '') +
      '<s>' + esc(r.u === 'ug' ? '\u00b5g' : r.u) + ' \u00b7 read as \u201c' +
      esc(String(r.line).slice(0, 34)) + '\u201d' + (r.note ? ' \u00b7 ' + esc(r.note) : '') + '</s></span>' +
      '<input type="number" inputmode="decimal" step="any" min="0" data-ocrk="' + i + '" value="' + r.v + '"></div>').join('');
  document.getElementById('ocr-raw').textContent = rawText ? rawText.slice(0, 600) : '';
}
function ocrSave(){
  if(!ocrFood && !ocrToManual) return;
  const vals = {};
  document.querySelectorAll('#ocr-rows [data-ocrk]').forEach(el=>{
    const r = ocrRows[Number(el.dataset.ocrk)];
    const raw = String(el.value).trim();
    if(!r || raw === '') return;
    const v = Number(raw);
    if(isFinite(v) && v >= 0) vals[r.k] = v;
  });
  if(ocrToManual){ ocrToManual = false; closeSheet('ocr-backdrop'); fillManualPer100(vals); return; }
  const L = labelFor(ocrFood.name) || {};
  const micros = Object.assign({}, (L.micros && typeof L.micros === 'object') ? L.micros : {});
  Object.keys(vals).forEach(k=>{
    if(['kcal','fat','carbs','protein','sugar','satfat','salt','sodium','fiber'].indexOf(k) >= 0) return;
    micros[k] = vals[k];
  });
  if(vals.fiber != null) micros.fiber = vals.fiber;
  if(vals.sodium != null) micros.sodium = vals.sodium;
  else if(vals.salt != null) micros.sodium = Math.round(vals.salt * 1000 / 2.5);
  const ocrMac = Object.assign({}, (L.mac && typeof L.mac === 'object') ? L.mac : {});
  const ocrMacNow = {};
  if(vals.kcal > 0){ ocrMac.kcal = vals.kcal; ocrMacNow.kcal = vals.kcal; }
  if(vals.protein != null){ ocrMac.p = vals.protein; ocrMacNow.protein = vals.protein; }
  if(vals.carbs != null){ ocrMac.c = vals.carbs; ocrMacNow.carbs = vals.carbs; }
  if(vals.fat != null){ ocrMac.f = vals.fat; ocrMacNow.fat = vals.fat; }
  saveLabel(ocrFood.name, {
    mac: Object.keys(ocrMac).length ? ocrMac : (L.mac == null ? null : L.mac),
    sug: vals.sugar != null ? vals.sugar : (L.sug == null ? null : L.sug),
    sat: vals.satfat != null ? vals.satfat : (L.sat == null ? null : L.sat),
    fib: vals.fiber != null ? vals.fiber : (L.fib == null ? null : L.fib),
    sod: micros.sodium != null ? micros.sodium : (L.sod == null ? null : L.sod),
    micros: Object.keys(micros).length ? micros : null
  });
  buzz();
  closeSheet('ocr-backdrop');
  try{
    if(nutCtx && nutFood && nutFood.name === ocrFood.name){
      const all = Object.assign({}, ocrMacNow);
      Object.keys(vals).forEach(k=>{
        if(['kcal','fat','carbs','protein','salt','sodium'].indexOf(k) < 0) all[k] = vals[k];
      });
      if(micros.sodium != null && (vals.sodium != null || vals.salt != null)) all.sodium = micros.sodium * 2.5 / 1000;
      nutFixEntry(nutCtx.entryIdx, ocrFood.name, all);
    }
  }catch(e){}
  if(ocrThen) ocrThen();
  if(pendingFood && ocrFood && pendingFood.name === ocrFood.name){
    pendingFood = applyLabel(pendingFood);
    renderScorePanel(pendingFood);
  }
  renderDay();
}

let microEditFood = null;
function microEditable(){
  // Sugars and saturated fat have their own boxes on the label sheet, and free
  // sugars is worked out rather than typed.
  return MICROS.filter(m=>!m.read && m.k !== 'freesugar' && m.k.indexOf('off:') !== 0);
}

