/* ============================================================
   v123 - UK supermarket packets, kept on the phone.
   27,000-odd UK products from Open Food Facts (the most scanned, plus each big
   supermarket's own range), in uk_packets.txt next to the app. Read once, a
   few seconds after the app opens, so it never slows the start. Figures are
   exactly what Open Food Facts holds; nothing is filled in or estimated.
   Search shows them beside the live results, and a scan with no signal looks
   here before giving up. Nothing here is written to storage.
   Line: code|name|brand|quantity|serving g|kcal|protein|carbs|fat|sugars|sat|fibre|salt
   ============================================================ */
let pkLines = null, pkHay = null, pkByCode = null, pkLoading = null, pkWords = null;
function packetsLoad(){
  if(pkLines || pkLoading) return pkLoading;
  pkLoading = fetch(window.COACH_PACKETS || 'uk_packets.txt').then(r=>{
    if(!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  }).then(t=>{
    const L = t.split('\n').filter(Boolean);
    const hay = new Array(L.length), by = new Map();
    for(let i = 0; i < L.length; i++){
      const p = L[i].split('|', 4);
      hay[i] = foldAccents((p[1] + ' ' + p[2]).toLowerCase()).replace(/[‘’']/g, '');
      by.set(p[0].replace(/^0+/, ''), i);
    }
    pkLines = L; pkHay = hay; pkByCode = by; pkWords = null;
    // The word list for close spellings is built when the phone is idle.
    if('requestIdleCallback' in window) requestIdleCallback(()=>packetWords(), {timeout: 4000});
  }).catch(()=>{ pkLoading = null; });
  return pkLoading;
}
// Quietly, after the app has opened and settled.
setTimeout(()=>{
  const go = ()=>packetsLoad();
  if('requestIdleCallback' in window) requestIdleCallback(go, {timeout: 8000}); else go();
}, 3500);

// One line back into the shape Open Food Facts itself returns, so everything
// downstream (brand under the name, servings, scores) treats it the same.
function packetProduct(i){
  const p = pkLines[i].split('|');
  const n = {};
  const put = (k, v)=>{ if(v !== '' && v !== undefined) n[k] = Number(v); };
  put('energy-kcal_100g', p[5]); put('proteins_100g', p[6]); put('carbohydrates_100g', p[7]);
  put('fat_100g', p[8]); put('sugars_100g', p[9]); put('saturated-fat_100g', p[10]);
  put('fiber_100g', p[11]); put('salt_100g', p[12]);
  if(n['salt_100g'] !== undefined) n['sodium_100g'] = Math.round(n['salt_100g'] / 2.5 * 10000) / 10000;
  const prod = {code: p[0], product_name: p[1], brands: p[2], quantity: p[3], nutriments: n, _packet: true};
  if(p[4]) prod.serving_quantity = Number(p[4]);
  return prod;
}
function packetQueryWords(q){
  return tokenise(foldAccents(brandAlias(String(q || '').toLowerCase())).replace(/[‘’']/g, ''))
    .filter(w => w && !SEARCH_FILLER.has(w));
}
function packetHits(q, max){
  if(!pkLines) return [];
  const words = packetQueryWords(q);
  if(!words.length) return [];
  max = max || 40;
  const out = [];
  // The file is in order of how often each product is scanned, so the first
  // matches are the ones people actually buy.
  for(let i = 0; i < pkHay.length && out.length < max; i++){
    const h = pkHay[i];
    let all = true;
    for(const w of words){ if(h.indexOf(w) < 0){ all = false; break; } }
    if(all) out.push(i);
  }
  // v143: one word typed with no spaces ("mullerlight", "cocacola").
  if(out.length < 5 && words.length === 1 && words[0].length >= 6){
    const w = words[0], have = new Set(out);
    for(let i = 0; i < pkHay.length && out.length < max; i++){
      if(have.has(i)) continue;
      if(pkHay[i].replace(/[^a-z0-9]/g, '').indexOf(w) >= 0) out.push(i);
    }
  }
  return out.map(packetProduct);
}

/* v143: close spellings. Every word on every packet, each pointing at the
   packets it is on. Built once, when the phone is idle. */
function packetWords(){
  if(pkWords || !pkHay) return pkWords;
  const m = new Map();
  for(let i = 0; i < pkHay.length; i++){
    const seen = new Set();
    for(const w of pkHay[i].split(/[^a-z0-9]+/)){
      if(w.length < 4 || seen.has(w)) continue;
      seen.add(w);
      let a = m.get(w); if(!a){ a = []; m.set(w, a); } a.push(i);
    }
  }
  pkWords = m;
  return m;
}
// The packet words close to one you typed, most common first.
function packetNear(w){
  const m = packetWords();
  if(!m || w.length < 4) return [];
  const out = [];
  for(const [v, rows] of m){
    if(v === w || Math.abs(v.length - w.length) > 2) continue;
    if((w.length >= 5 && v.length >= 5 && within1(w, v)) || (w.length >= 8 && within2(w, v)) ||
       (w.length === 4 && v.length === 4 && within1(w, v) && w[0] === v[0])) out.push([v, rows]);
  }
  return out.sort((a, b) => b[1].length - a[1].length).slice(0, 6);
}
/* What you typed with each word nobody uses swapped for its closest real
   one: "bunderberg ginger" -> "bundaberg ginger". Null if nothing changed. */
function packetCorrect(q){
  const words = packetQueryWords(q);
  if(!words.length || !packetWords()) return null;
  let changed = false;
  const fixed = words.map(w => {
    if(w.length < 4 || pkWords.has(w)) return w;
    // A word that is the start of real words is just not finished yet.
    for(const v of pkWords.keys()){ if(v.length > w.length && v.startsWith(w)) return w; }
    const near = packetNear(w);
    if(!near.length) return w;
    changed = true; return near[0][0];
  });
  return changed ? fixed.join(' ') : null;
}
/* Exact matches first. When there are fewer than five, packets matching a
   close spelling of what you typed are added below them, marked _close. */
function packetSearch(q, max){
  const exact = packetHits(q, max);
  if(exact.length >= 5 || !pkLines) return exact;
  const fixed = packetCorrect(q);
  if(!fixed) return exact;
  const have = new Set(exact.map(p => p.code));
  const close = packetHits(fixed, (max || 40) - exact.length)
    .filter(p => !have.has(p.code)).map(p => { p._close = fixed; return p; });
  return exact.concat(close);
}
function packetByCode(code){
  if(!pkByCode) return null;
  for(const c of barcodeVariants(code)){
    const i = pkByCode.get(String(c).replace(/^0+/, ''));
    if(i !== undefined) return packetProduct(i);
  }
  return null;
}

let searchTimer = null;
var searchShown = [];   // v135: keys of the rows on screen, in order
document.getElementById('search-input').addEventListener('input', (e)=>{
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  const box = document.getElementById('search-results');
  if(q.length<1){ renderUsuals(); return; }
  // Local search is instant — no debounce needed, no network involved.
  searchTimer = setTimeout(()=>renderSearch(q), 60);
});

/* A scan that worked once should work again with no signal. Every product Open
   Food Facts hands over is kept here, and the lookup falls back to the copy
   when the network cannot be reached. Your own saved foods still come first:
   this is only for packets you looked at but never logged.                   */
const OFF_CACHE_K = 'coachoffcache';
const OFF_CACHE_MAX = 300;
function offCacheGet(code){
  try{
    const all = JSON.parse(CS.getItem(OFF_CACHE_K)) || {};
    return all[String(code)] || null;
  }catch(e){ return null; }
}
function offCachePut(code, product){
  try{
    const all = JSON.parse(CS.getItem(OFF_CACHE_K)) || {};
    all[String(code)] = {p: product, at: Date.now()};
    const keys = Object.keys(all);
    if(keys.length > OFF_CACHE_MAX){
      keys.sort((a,b)=>(all[a].at||0) - (all[b].at||0));
      keys.slice(0, keys.length - OFF_CACHE_MAX).forEach(k=>{ delete all[k]; });
    }
    lsSet(OFF_CACHE_K, JSON.stringify(all));
  }catch(e){}
}

/* A second place to look. Open Food Facts is volunteer-run and best in Europe;
   FoodData Central's Branded set is about 400,000 American products, each with
   the barcode printed on the pack (its GTIN). Between the two, a packet that
   exists anywhere in the English-speaking world is usually findable - and
   anything neither has, you type once and it is yours for good.
   Needs the USDA key, which is already how the nutrient top-ups work.        */
async function fdcByBarcode(code){
  if(typeof fdcHasKey !== 'function' || !fdcHasKey()) return null;
  const digits = String(code || '').replace(/\D/g, '');
  if(digits.length < 8) return null;
  // A UPC-A barcode is the same product as the 13-digit EAN with a leading
  // zero, and FDC stores them both ways round, so try each.
  const tries = [digits];
  if(digits.length === 13 && digits.charAt(0) === '0') tries.push(digits.slice(1));
  if(digits.length === 12) tries.push('0' + digits);
  for(const q of tries){
    try{
      const d = await fdcRequest('/foods/search?query=' + encodeURIComponent(q) +
                                 '&dataType=Branded&pageSize=5');
      const hit = ((d && d.foods) || []).filter(f=>{
        const g = String(f.gtinUpc || '').replace(/^0+/, '');
        return g && g === q.replace(/^0+/, '');
      })[0];
      if(hit){
        const full = await fdcRequest('/food/' + hit.fdcId);
        const food = fdcToFood(full || hit);
        if(food){
          food.code = String(code);
          food.src = 'off';                 // treated like any scanned packet
          if(hit.brandOwner || hit.brandName){
            food.name = food.name + ' (' + String(hit.brandName || hit.brandOwner).trim() + ')';
          }
          return food;
        }
      }
    }catch(e){ /* try the next spelling of the barcode */ }
  }
  return null;
}

async function lookupBarcode(code){
  const status = document.getElementById('scan-status');
  if(barcodeLinkCb){
    const cb = barcodeLinkCb; barcodeLinkCb = null;
    stopScan(); closeSheet('scan-backdrop');
    // v137: if the food it was for has been closed in the meantime, do nothing
    // rather than fail.
    try{ cb(String(code)); }catch(e){}
    return;
  }

  // Your own library first. A product you have already saved resolves instantly,
  // with no request, no signal and no chance of Open Food Facts having dropped it.
  const mine = myFoodByCode(code);
  if(mine){
    status.textContent = 'Found in your foods';
    stopScan();
    openPortion(myFoodToFood(mine));
    return;
  }

  // v131: a packet already on the phone (looked up before, or in the UK
  // packets) opens instantly, with no wait on the network. Anything that is
  // wrong can still be fixed with "Wrong product? Fix it".
  try{
    const kept = offCacheGet(code);
    let local = (kept && kept.p) ? offFixPrepared(kept.p) : null;
    if(!(local && offPer100(local))) local = packetByCode(code);
    if(local && offPer100(local)){
      stopScan();
      status.textContent = 'Found on this phone';
      openPortion(gapFillFood(offToScanFood(local, code)));
      return;
    }
  }catch(e){}

  status.textContent = 'Got it \u2014 looking up '+code+'...';
  try{
    // v2 endpoint with an explicit field list — smaller, faster, and stable.
    // The unit fields are what tell milk from mince. They are not present on
    // every record, which is why detectBasis() falls back to the strings.
    // nova_group is Open Food Facts' own processing classification, worked out
    // from the ingredients list. It beats guessing from the product's name.
    const fields = 'product_name,brands,quantity,quantity_unit,product_quantity,product_quantity_unit,'+
                   'serving_size,serving_quantity,serving_quantity_unit,nutrition_data_per,nutriments,additives_tags,nova_group';
    // Nine seconds, then say so. On a weak signal the request could otherwise
    // hang with "Looking up..." on screen and no way forward.
    const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timer = ctl ? setTimeout(()=>ctl.abort(), 9000) : null;
    let data = null;
    try{
      for(const c of barcodeVariants(code)){
        let r;
        try{
          r = await fetch('https://world.openfoodfacts.org/api/v2/product/'+c+'.json?fields='+fields,
                          ctl ? {signal: ctl.signal} : undefined);
        }catch(err){
          throw new Error(err && err.name === 'AbortError' ? 'It took too long to answer' : (err && err.message) || 'No connection');
        }
        // Open Food Facts answers a product it does not have with a 404.
        if(r.status === 404){ data = {status: 0}; continue; }
        if(!r.ok) throw new Error('HTTP '+r.status);
        data = await r.json();
        if(data && data.status === 1 && data.product) break;
      }
    }finally{ if(timer) clearTimeout(timer); }
    if(!data || data.status!==1 || !data.product){
      const alt = await fdcByBarcode(code);
      if(alt){ stopScan(); status.textContent = 'Found in the USDA branded list'; openPortion(gapFillFood(alt)); return; }
      scanNotFound(code, null); return;
    }
    const p = offFixPrepared(data.product);
    offCachePut(code, p);
    const n = p.nutriments || {};
    const per = offPer100(p);
    if(!per){
      // Open Food Facts knows the product but nobody has filled the numbers in.
      const alt = await fdcByBarcode(code);
      if(alt){ stopScan(); status.textContent = 'Found in the USDA branded list'; openPortion(gapFillFood(alt)); return; }
      scanNotFound(code, p.product_name || 'That product'); return;
    }
    stopScan();
    // What one of these actually is: a 114 g pot, a 330 ml can, a 75 g serving
    // out of a kilo bag. See portionDefaultsFor().
    const pd = portionDefaultsFor(p);
    openPortion(gapFillFood({
      name: (p.product_name || 'Scanned item') + (p.brands ? ' ('+String(p.brands).split(',')[0].trim()+')' : ''),
      code: code,
      src: 'off',
      ...(p.prepared ? {prepared: true} : {}),
      novaOverride: (Number(p.nova_group) >= 1 && Number(p.nova_group) <= 4) ? Number(p.nova_group) : undefined,
      kcal100: Math.round(per.kcal * 10) / 10,
      p100: per.p || 0,
      c100: per.c || 0,
      f100: per.f || 0,
      sug100: per.sug,
      additives: Array.isArray(p.additives_tags) ? p.additives_tags.slice(0, 40) : null,
      sat100: per.sat,
      fv100:  (n['fruits-vegetables-nuts-estimate-from-ingredients_100g'] !== undefined
                 ? n['fruits-vegetables-nuts-estimate-from-ingredients_100g']
                 : (n['fruits-vegetables-nuts_100g'] === undefined ? null
                    : n['fruits-vegetables-nuts_100g'])),
      micros100: extractMicros(n),
      basis: detectBasis(p),
      unitName: pd.unitName,
      unitGrams: pd.unitGrams,
      startAmount: pd.startAmount
    }));
  }catch(e){
    // No signal, but this packet may have been looked up before.
    const keep = offCacheGet(code);
    if(keep && keep.p && offPer100(offFixPrepared(keep.p))){
      stopScan();
      const kp = offFixPrepared(keep.p), kn = kp.nutriments || {};
      const kper = offPer100(kp);
      const kpd = portionDefaultsFor(kp);
      status.textContent = 'No signal \u2014 using the copy saved on this phone';
      openPortion(gapFillFood({
        name: (kp.product_name || 'Scanned item') + (kp.brands ? ' ('+String(kp.brands).split(',')[0].trim()+')' : ''),
        code: code, src: 'off',
        novaOverride: (Number(kp.nova_group) >= 1 && Number(kp.nova_group) <= 4) ? Number(kp.nova_group) : undefined,
        kcal100: kper ? Math.round(kper.kcal * 10) / 10 : 0,
        p100: (kper && kper.p) || 0, c100: (kper && kper.c) || 0, f100: (kper && kper.f) || 0,
        sug100: kper ? kper.sug : null,
        sat100: kper ? kper.sat : null,
        additives: Array.isArray(kp.additives_tags) ? kp.additives_tags.slice(0, 40) : null,
        fv100: (kn['fruits-vegetables-nuts-estimate-from-ingredients_100g'] !== undefined
                  ? kn['fruits-vegetables-nuts-estimate-from-ingredients_100g'] : null),
        micros100: extractMicros(kn), basis: detectBasis(kp),
        unitName: kpd.unitName, unitGrams: kpd.unitGrams, startAmount: kpd.startAmount
      }));
      return;
    }
    // v123: no signal, never looked up before - the UK packets on the phone.
    const pk = packetByCode(code);
    if(pk && offPer100(pk)){
      stopScan();
      const pper = offPer100(pk), pn = pk.nutriments || {}, ppd = portionDefaultsFor(pk);
      status.textContent = 'No signal \u2014 found in the UK packets on this phone';
      openPortion(gapFillFood({
        name: pk.product_name + (pk.brands ? ' (' + String(pk.brands).split(',')[0].trim() + ')' : ''),
        code: code, src: 'off',
        kcal100: Math.round(pper.kcal * 10) / 10,
        p100: pper.p || 0, c100: pper.c || 0, f100: pper.f || 0,
        sug100: pper.sug, sat100: pper.sat, fv100: null,
        micros100: extractMicros(pn), basis: detectBasis(pk),
        unitName: ppd.unitName, unitGrams: ppd.unitGrams, startAmount: ppd.startAmount
      }));
      return;
    }
    scanFailed(code, e.message);
  }
}

// v131: one Open Food Facts record (live, saved, or from the UK packets) into
// the food the portion sheet takes - the same fields the live path builds.
function offToScanFood(p, code){
  const n = p.nutriments || {};
  const per = offPer100(p);
  const pd = portionDefaultsFor(p);
  return {
    name: (p.product_name || 'Scanned item') + (p.brands ? ' ('+String(p.brands).split(',')[0].trim()+')' : ''),
    code: code, src: 'off',
    ...(p.prepared ? {prepared: true} : {}),
    novaOverride: (Number(p.nova_group) >= 1 && Number(p.nova_group) <= 4) ? Number(p.nova_group) : undefined,
    kcal100: Math.round(per.kcal * 10) / 10,
    p100: per.p || 0, c100: per.c || 0, f100: per.f || 0,
    sug100: per.sug, sat100: per.sat,
    additives: Array.isArray(p.additives_tags) ? p.additives_tags.slice(0, 40) : null,
    fv100: (n['fruits-vegetables-nuts-estimate-from-ingredients_100g'] !== undefined
              ? n['fruits-vegetables-nuts-estimate-from-ingredients_100g']
              : (n['fruits-vegetables-nuts_100g'] === undefined ? null : n['fruits-vegetables-nuts_100g'])),
    micros100: extractMicros(n), basis: detectBasis(p),
    unitName: pd.unitName, unitGrams: pd.unitGrams, startAmount: pd.startAmount
  };
}

// A barcode that finds nothing is the commonest scan outcome, so say so plainly
// and give the way forward rather than a line of grey text.
// v131: codes that came back "not found" this time the scanner was open. They
// are skipped, so the camera keeps looking for the next barcode instead of
// stopping on one it already knows it cannot find.
const missedCodes = new Set();
function scanNotFound(code, name){
  if(code) missedCodes.add(String(code));
  scanMsg('Not found \u2014 still scanning. Try another barcode on the pack, or use an option below.');
  // Keep the camera going (the sheet is still open, so this resumes reading).
  setTimeout(()=>{ try{ resumeDecoding(); }catch(e){} }, 150);
  // Carry the barcode across to the manual form. Entering the numbers off the
  // packet once attaches them to this barcode permanently, so the next scan of
  // the same product is instant and never touches the network again.
  pendingBarcode = code || null;
  pendingBarcodeName = name || '';
  pendingBarcodeFix = false;
  document.getElementById('scan-result').innerHTML =
    '<div class="scan-miss">'+
    '<div class="sm-title"><i class="ti ti-barcode-off" aria-hidden="true"></i> Cannot find product</div>'+
    '<div class="sm-body">'+
    (name ? '<strong>'+esc(name)+'</strong> is on Open Food Facts but has no calorie information.'
          : 'Barcode <strong>'+esc(code)+'</strong> is not in the Open Food Facts database.')+
    '<br><br>Photo the nutrition table once and it is saved against this barcode &mdash; scanning it again will just work, even with no signal.</div>'+
    '<div class="sm-actions">'+
    '<button class="sm-btn" id="miss-photo"><i class="ti ti-camera" aria-hidden="true"></i> Photo the label</button>'+
    '<button class="sm-btn" id="miss-manual">Type it in</button>'+
    '<button class="sm-btn" id="miss-search">Search by name</button>'+
    '<button class="sm-btn ghost" id="miss-retry">Scan again</button>'+
    '</div></div>';
  wireScanMiss();
}

function scanFailed(code, why){
  scanMsg('Lookup failed');
  // v118: the barcode comes along to the form here too, so a packet typed in
  // while offline is still found by its barcode next time.
  pendingBarcode = code || null;
  pendingBarcodeName = '';
  pendingBarcodeFix = false;
  document.getElementById('scan-result').innerHTML =
    '<div class="scan-miss">'+
    '<div class="sm-title"><i class="ti ti-wifi-off" aria-hidden="true"></i> Could not check that barcode</div>'+
    '<div class="sm-body">'+(why ? String(why)+'. ' : '')+
    'Open Food Facts could not be reached. The built-in foods still work offline.</div>'+
    '<div class="sm-actions">'+
    '<button class="sm-btn" id="miss-search">Search by name</button>'+
    '<button class="sm-btn" id="miss-photo"><i class="ti ti-camera" aria-hidden="true"></i> Photo the label</button>'+
    '<button class="sm-btn" id="miss-manual">Type it in</button>'+
    '<button class="sm-btn ghost" id="miss-retry">Try again</button>'+
    '</div></div>';
  wireScanMiss();
}

// A barcode from a failed scan is armed for ONE trip to the manual form. It
// used to be cleared only after a successful save, so backing out of a
// not-found scan left it armed indefinitely - and the next food you typed by
// hand, whenever that happened, was filed under someone else's barcode. The
// real product then resolved to the wrong food for ever, with nothing on
// screen to show why.
function disarmBarcode(){
  pendingBarcode = null;
  pendingBarcodeName = '';
  pendingBarcodeFix = false;
  const el = document.getElementById('manual-barcode');
  if(el) el.value = '';
  renderManualCodeNote();
}

function wireScanMiss(){
  const go = (tab)=>{
    stopScan(); closeSheet('scan-backdrop');
    setTimeout(()=>{
      openSheet('add-backdrop');
      const t = document.querySelector('.tab[data-tab="'+tab+'"]');
      if(t) t.click();
      if(tab === 'manual'){
        // Open Food Facts sometimes knows the name but not the calories. Keep
        // whichever half it did know rather than making you retype it.
        if(pendingBarcodeName) document.getElementById('m-name').value = pendingBarcodeName;
        renderManualCodeNote();
        document.getElementById('m-kcal').focus();
      } else if(tab === 'search' && pendingBarcodeName){
        const si = document.getElementById('search-input');
        si.value = pendingBarcodeName;
        renderSearch(pendingBarcodeName);
      }
    }, 200);
  };
  const s = document.getElementById('miss-search');
  const m = document.getElementById('miss-manual');
  const ph = document.getElementById('miss-photo');
  // v118: the camera reads the table, the figures land in the form with the
  // barcode attached, and all that is left is the name.
  if(ph) ph.onclick = ()=>{ go('manual'); setTimeout(()=>{ ocrToManual = true; openOcrSheet(null); }, 420); };
  const r = document.getElementById('miss-retry');
  if(s) s.onclick = ()=>go('search');
  if(m) m.onclick = ()=>go('manual');
  if(r) r.onclick = ()=>{
    document.getElementById('scan-result').innerHTML = '';
    lastCode = null;
    missedCodes.clear();
    scanMsg('Point at a barcode');
    resumeDecoding();
  };
}

document.getElementById('lookup-barcode-btn').onclick = ()=>{
  const v = document.getElementById('manual-barcode').value.replace(/\D/g, '');
  if(v) lookupBarcode(v);
};
document.getElementById('manual-barcode').addEventListener('keydown', ev=>{
  if(ev.key === 'Enter'){ ev.preventDefault(); document.getElementById('lookup-barcode-btn').click(); }
});

