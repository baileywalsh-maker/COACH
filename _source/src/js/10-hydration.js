/* ============================================================
   v128 - Hydration.
   Water stays exactly as it was. Hydration sits beside it: the water you
   logged, plus every drink in the food log, worked out from the drink's own
   figures. No new table of guesses - everything comes from what is already
   on the entry:

   1. Water in the drink = its volume, less the protein, carbs, fat, fibre and
      alcohol in it. Checked against the lab figures for milk, cola and orange
      juice in Maughan et al. 2016 (AJCN) - all within about 1%.
   2. Dairy milk counts at 1.5x its volume - the lab result for whole milk in
      the same study (1.50; skimmed measured 1.58, so 1.5 is the cautious end).
      In a latte or hot chocolate the milk is worked out from the protein:
      dairy milk carries about 3.4 g of protein per 100 ml. Plant milks have
      no lab figure, so they count as their water only.
   3. Coffee and tea: no penalty. Killer et al. 2014 (4 mugs a day, 3 days)
      and Maughan 2016 both found them no different from water.
   4. Alcohol is worked out from the calories the protein, carbs and fat do
      not explain (alcohol is 7 kcal a gram), and only for drinks that are
      alcoholic by name. The alcohol itself is not water, so it never counts.
      Wine and spirits (8% and over) also lose HYD_ALC_ML_PER_G of water for
      each gram - Polhuis et al. 2017 measured about 1 ml per gram over four
      hours (30 g as spirits: +31 ml of urine). Beer showed no loss at all.
   5. Ice is not counted. A cup size includes it, so iced drinks are only
      counted where the liquid volume is known.

   Target: 2.5 L, plus the same 500 ml the water target already adds on a
   training day. Nothing stored before this version changes. New keys only:
   coachdrinkflags (your "count as a drink" choices) and coachhydstart (the
   first day hydration counts in the day score).
   ============================================================ */
const HYD_FLAGS_KEY   = 'coachdrinkflags';
const HYD_START_KEY   = 'coachhydstart';
const HYD_TARGET_ML   = 2500;
const HYD_TRAIN_ML    = 500;
const HYD_MILK_BHI    = 1.5;
const HYD_MILK_PRO100 = 3.4;
const HYD_ALC_ML_PER_G = 1.0;
const HYD_ALC_STRONG  = 0.08;   // 8% ABV and over: the wine and spirits arm of Polhuis 2017

// Cup and bottle sizes the chains publish themselves; a drink with no known
// size is shown as "size unknown".
// v143: Nando's own menus print each glass: Coca-Cola Classic GLASS 300ml,
// Cloudy Lemonade GLASS 300ml, Orange Juice GLASS 295ml, RUBRO Iced Tea CAN
// 300ml, Karma Gingerella BOTTLE 300ml, Pip Organic CARTON 180ml. A bottomless
// drink is that same 300 ml glass, counted per glass.
const HYD_SIZES = {
  "Nando's Bottomless ": 300, "Nando's Coca-Cola Classic": 300, "Nando's Cloudy Lemonade": 300,
  "Nando's Orange Juice": 295, "Nando's RUBRO ": 300, "Nando's Karma Drinks Gingerella": 300,
  "Nando's Pip Organic": 180
};
/* v143: cup sizes as each chain prints them.
   Starbucks (its own nutrition guide): Short 240, Tall 355, Grande 473,
   Venti 591 ml. Iced drinks, liquid without the ice: Tall 192, Grande 273,
   Venti 326 ml.
   Tim Hortons UK (timhortons.co.uk, each drink's serving size): Small 12 oz,
   Medium 16 oz, Large 20 oz = 355, 473, 591 ml. No liquid-without-ice figure
   is published, so iced Tim Hortons drinks stay "size unknown".
   KFC and Costa: Costa names already carry their ml; KFC publishes no cup
   volumes (its bottles carry their size in the name). */
const HYD_CHAIN_SIZES = {
  'Starbucks': {Short: {hot: 240}, Tall: {hot: 355, icedLiquid: 192}, Grande: {hot: 473, icedLiquid: 273},
                Venti: {hot: 591, icedLiquid: 326}},
  'Tim Hortons': {Small: {hot: 355}, Medium: {hot: 473}, Large: {hot: 591}}
};

// Never a drink, whatever else the name says.
const HYD_HARD_NOT = /\b(cakes?|cookies?|biscuits?|mcflurry|sundae|pies?|brownies?|muffins?|fries|crisps|munch|tinned|canned|sardines|beans|chickpeas|tomato(es)?|porridge|cereal|ice cream|yogh?urt|cheese|powder|dry mix|soup|minestrone|broth|sauce|curry|bread|pudding|custard|doughnuts?|croissant|pain au|pancakes?|waffles?|chocolate bar|milk chocolate|dairy milk|white chocolate|teacakes?|tea cake|tea loaf|in water|made with water|made up with water, as purchased|jelly|sorbet|lolly|cream liqueur truffle|bar\b|buttons|spread|fudge|toffee pieces|gums?|chestnuts?|butternut|melon|rice|noodles?|pasta|evaporated|condensed|coconut milk, canned|vinegar|syrup|gravy|stock|marinade|dressing)\b|\b\d+\s*g\b/i;
// Words that make something a drink on their own.
const HYD_STRONG_RE = /\b(velvetino|latte|cappuccino|coffee|americano|espresso|macchiato|mocha|cortado|flat white|gal[aã]o|brew|hot chocolate|chocolate milk|milkshake|shake|frapp\w*|smoothie|juice|iced tea|tea|chai|matcha|lemonade|cola|coke|pepsi|tango|oasis|fruit shoot|robinsons|vimto|capri[- ]sun|squash|cordial|refresher|cooler|infusion|punch|kombucha|kefir|energy drink|red bull|monster (energy|ultra)|lucozade|gatorade|powerade|ribena|fanta|sprite|irn[- ]?bru|7up|dr pepper|club orange|oatly|lager|beer|ale|stout|porter|ipa|pilsner|cider|wine|prosecco|champagne|cava|vodka|gin|rum|whisky|whiskey|tequila|brandy|cognac|liqueur|cocktail|spritz|mojito|margarita|daiquiri|sangria|martini|negroni|guinness|stella|carling|heineken|corona|peroni|brewdog|strongbow|kopparberg)\b/i;
// Words that only make something a drink when nothing food-like is in the name.
const HYD_WEAK_RE = /\b(water|milk|drink|beverage|spirits?|tonic|soda|pint|shot|cocoa)\b/i;
const HYD_SOFT_NOT = /\b(tuna|fish|salmon|cod|prawn|chicken|beef|pork|lamb|steak|egg|sandwich|wrap|burger|pizza|chips|nuts?|seeds?|oats?(?! ?milk)|roll|granola|muesli|shortbread|wafer|kitkat|twix|aero|galaxy|milky way|milkybar|flake|portion)\b/i;
// Drunk from these. "can" and "carton" are left out: beans come in cans.
const HYD_DRINK_UNITS = {drink:1, glass:1, bottle:1, pint:1, mug:1, shot:1, cup:1};
const HYD_PLANT_RE = /\b(oat|oatly|almond|soy|soya|coconut|rice milk|plant|hazelnut|cashew|pea milk|alpro|macadamia|hemp)\b/i;
const HYD_DAIRY_RE = /\b(milk|latte|cappuccino|flat white|macchiato|mocha|cortado|hot chocolate|cocoa|milkshake|frapp\w*|chai latte|white coffee|with milk)\b/i;
const HYD_PLAIN_MILK_RE = /^(whole|semi[- ]?skimmed|skimmed|full[- ]fat|1%|2%|organic|fresh|lactose[- ]free)?\s*(cow'?s\s*)?milk\b(?!shake)/i;
const HYD_ALC_RE = /\b(lager|beer|ale|stout|porter|ipa|pilsner|cider|wine|prosecco|champagne|cava|spirits?|vodka|gin|rum|whisky|whiskey|tequila|brandy|cognac|liqueur|baileys|jagermeister|sambuca|cocktail|spritz|aperol|pimm'?s|mojito|margarita|daiquiri|sangria|martini|negroni|sherry|port wine|mead|shandy|alcopop|wkd|smirnoff|guinness|stella|carling|heineken|corona|peroni|brewdog|strongbow|kopparberg|bitter|alcohol)\b/i;
const HYD_NO_ALC_RE = /\b(alcohol[- ]free|non[- ]alcoholic|low[- ]alcohol|0\.0|0%|ginger ale|ginger beer|root beer|bitter lemon|zero alcohol|dealcoholi[sz]ed)\b/i;

function hydFlags(){ try{ return JSON.parse(CS.getItem(HYD_FLAGS_KEY)) || {}; }catch(e){ return {}; } }
function setHydFlag(name, val){
  const f = hydFlags();
  if(val === null) delete f[name]; else f[name] = !!val;
  lsSet(HYD_FLAGS_KEY, JSON.stringify(f));
  try{ dataEpoch++; scoreEpoch++; logEpoch++; }catch(e){}
}

// Is this entry a drink? Your own choice wins; otherwise the name and unit decide.
function hydAutoDrink(e){
  const n = String(e && e.name || '');
  if(!n) return false;
  // A latte named after a dessert ("Caramel Waffle Latte") is still a latte.
  if(/\b(latte|cappuccino|macchiato|mocha|frapp\w*|milkshake|hot chocolate)\b/i.test(n) &&
     !/\b(mcflurry|sundae|cakes?|cookies?|biscuits?|pies?|brownies?|muffins?|bar\b|powder|ice cream)\b/i.test(n)) return true;
  if(HYD_HARD_NOT.test(n)) return false;
  if(HYD_STRONG_RE.test(n)) return true;
  const n2 = n.replace(/^Burger King\s+/i, '');      // the brand is not a burger
  if(HYD_WEAK_RE.test(n2) && !HYD_SOFT_NOT.test(n2)) return true;
  return !!HYD_DRINK_UNITS[String(e.unit || '').toLowerCase()] && !HYD_SOFT_NOT.test(n2);
}
function hydIsDrink(e){
  if(!e || e.supp) return false;
  const f = hydFlags();
  if(Object.prototype.hasOwnProperty.call(f, e.name)) return !!f[e.name];
  return hydAutoDrink(e);
}

// The liquid you actually drank, in ml - or null when nobody published it.
function hydVolume(e){
  const qty = Number(e.qty) > 0 ? Number(e.qty) : 1;
  if(!e.perItem){
    const g = Number(e.grams) || 0;
    return g > 0 ? g : null;              // logged by ml or g: ml and g are within a few % for drinks
  }
  const n = String(e.name || '');
  // A size printed in the name: "Red Bull, 250ml", "Monster Energy, 500ml"
  const m = n.match(/(\d+(?:\.\d+)?)\s*(ml|cl|l)\b/i);
  if(m){
    const v = Number(m[1]) * (m[2].toLowerCase() === 'cl' ? 10 : m[2].toLowerCase() === 'l' ? 1000 : 1);
    if(v > 0 && v < 3000) return v * qty;
  }
  if(/\bpint\b/i.test(n)) return 568 * qty;
  for(const k in HYD_SIZES){ if(n.indexOf(k) === 0 || n === k){ return HYD_SIZES[k] * qty; } }
  // Chain cup sizes: "Starbucks ..., Grande" etc, once their published sizes are in.
  const sz = hydChainSize(n);
  return sz ? sz * qty : null;
}
function hydChainSize(n){
  if(typeof HYD_CHAIN_SIZES === 'undefined') return null;
  for(const chain in HYD_CHAIN_SIZES){
    if(n.indexOf(chain) !== 0) continue;
    const t = HYD_CHAIN_SIZES[chain];
    const iced = /\b(iced|frapp\w*|cold brew|refresher|shaken)\b/i.test(n);
    for(const size in t){
      if(new RegExp('\\b' + size + '\\b', 'i').test(n)){
        const v = t[size];
        if(typeof v === 'number') return v;
        // Iced drinks: only the liquid counts, and only if it is published.
        return iced ? (v.icedLiquid || null) : (v.hot || null);
      }
    }
  }
  return null;
}

// One drink, worked out. Every step kept so the breakdown can show it.
function hydDrink(e){
  const name = String(e.name || '');
  const vol = hydVolume(e);
  if(vol === null) return {name, unknown: true, ml: 0};
  const P = Number(e.protein) || 0, C = Number(e.carbs) || 0, F = Number(e.fat) || 0;
  const fib = Number(e.micros && e.micros.fiber) || 0;
  const kcal = Number(e.kcal) || 0;
  let alcG = 0;
  if(HYD_ALC_RE.test(name) && !HYD_NO_ALC_RE.test(name)){
    alcG = Math.max(0, (kcal - 4*P - 4*C - 9*F) / 7);
    alcG = Math.min(alcG, vol * 0.789 * 0.6);     // never more than a 60% spirit could hold
  }
  // Alcohol takes up its own VOLUME (it is lighter than water: 0.789 g per ml).
  const water = Math.max(0, vol - P - C - F - fib - alcG / 0.789);
  // Dairy milk in it
  let milk = 0;
  if(!HYD_PLANT_RE.test(name)){
    if(HYD_PLAIN_MILK_RE.test(name)) milk = vol;
    else if(HYD_DAIRY_RE.test(name)) milk = Math.min(vol, P / HYD_MILK_PRO100 * 100);
  }
  // The milk part counts at 1.5x its volume; its own water is already in `water`.
  const milkWater = milk * (water / vol);
  const milkBonus = Math.max(0, milk * HYD_MILK_BHI - milkWater);
  const abv = vol > 0 ? (alcG / 0.789) / vol : 0;
  const alcLoss = abv >= HYD_ALC_STRONG ? alcG * HYD_ALC_ML_PER_G : 0;
  const ml = water + milkBonus - alcLoss;
  return {name, vol, water, milk, milkBonus, alcG, abv, alcLoss, ml, unknown: false};
}

function hydTarget(d){
  let train = false;
  try{ train = isTrainingDay(d); }catch(e){}
  // v135: never below your water target - plain water is part of hydration, so
  // a 2.8 L water target with a 2.5 L hydration target could not both be right.
  let waterBase = 0;
  try{ const w = waterSettings(d); waterBase = w.targetMl - w.trainingTopUp; }catch(e){}
  // v144: the training top-up grows with how long you trained (Train side).
  let top = train ? HYD_TRAIN_ML : 0;
  try{ if(train && typeof trTopUpMl === 'function') top = trTopUpMl(d); }catch(e){}
  return Math.max(HYD_TARGET_ML, waterBase) + top;
}

// The day: water you logged + every drink.
function hydDay(dateOrStr){
  const d = (typeof asDate === 'function') ? asDate(dateOrStr) : new Date(dateOrStr);
  const waterLog = waterMl(d);
  const es = loadEntries(d);
  const drinks = [];
  es.forEach((e, i)=>{ if(hydIsDrink(e)){ const x = hydDrink(e); x.idx = i; drinks.push(x); } });
  const fromDrinks = drinks.reduce((a, x)=>a + (x.unknown ? 0 : x.ml), 0);
  const total = Math.max(0, waterLog + fromDrinks);
  const target = hydTarget(d);
  return {waterLog, fromDrinks, total, target, drinks,
          unknown: drinks.filter(x=>x.unknown).length,
          any: waterLog > 0 || drinks.some(x=>!x.unknown),
          pct: Math.min(100, Math.round(total / target * 100))};
}

/* v141: one target for everything you drink. Plain water's share of it is
   what is left once your other drinks are counted, so the water card, the
   Water page and the Hydration card can never disagree. With no other
   drinks it is the same number as before. */
function waterGoalMl(d){
  try{ const h = hydDay(d); return Math.max(0, h.target - h.fromDrinks); }
  catch(e){ return waterSettings(d).targetMl; }
}
// Hydration for a day as the day review shows it.
function hydForReview(d){
  try{ const h = hydDay(d); return {l: h.total / 1000, tl: h.target / 1000}; }
  catch(e){ return {l: waterMl(d) / 1000, tl: waterTargetL(d)}; }
}

// The day score only takes hydration in from the day this version first ran,
// so no day you have already scored changes.
function hydScoreStart(){
  let s = CS.getItem(HYD_START_KEY);
  if(!s){ s = todayYMD(); lsSet(HYD_START_KEY, s); }
  return s;
}
function hydInScore(ds){ return String(ds) >= hydScoreStart(); }

const fmtL = ml => (Math.round(ml / 100) / 10).toFixed(1);

function renderHydration(){
  const box = document.getElementById('hyd-card');
  if(!box) return;
  const h = hydDay(currentDate);
  const pct = Math.min(100, h.total / h.target * 100);
  const wPct = Math.min(pct, h.waterLog / h.target * 100);
  const done = h.total >= h.target;
  box.innerHTML =
    '<div class="hyd-top"><span class="hyd-t"><i class="ti ti-droplet" aria-hidden="true"></i> Hydration'+
      '<i class="ti ti-chevron-right" style="color:var(--text3); font-size:14px;" aria-hidden="true"></i></span>'+
      '<span class="hyd-v'+(done ? ' ok' : '')+'">'+fmtL(h.total)+' / '+fmtL(h.target)+' L</span></div>'+
    '<div class="hyd-bar"><i class="w" style="width:'+wPct+'%"></i><i class="d" style="width:'+Math.max(0, pct - wPct)+'%"></i></div>'+
    '<div class="hyd-sub"><span><b class="w"></b>Water '+fmtL(h.waterLog)+' L</span>'+
      '<span><b class="d"></b>Other drinks '+fmtL(h.fromDrinks)+' L</span>'+
      (h.unknown ? '<span class="hyd-unk">'+h.unknown+' size unknown</span>' : '')+'</div>';
  box.onclick = ()=>{ try{ tick(); }catch(e){} renderHydSheet(); openSheet('hyd-backdrop'); };
}

function hydLine(x){
  const bits = [];
  if(x.unknown) bits.push('size unknown, not counted');
  else {
    bits.push(fmt0(x.vol)+' ml drink, '+fmt0(x.water)+' ml water');
    if(x.milkBonus > 0.5) bits.push('+'+fmt0(x.milkBonus)+' milk bonus');
    if(x.alcG > 0.5) bits.push(fmt0(x.alcG)+' g alcohol' + (x.alcLoss > 0.5 ? ', −'+fmt0(x.alcLoss)+' ml' : ''));
  }
  return '<div class="hyd-row"><div><b>'+esc(shownName(x.name))+'</b><s>'+esc(bits.join(' · '))+'</s></div>'+
    '<em'+(x.unknown ? ' class="u"' : '')+'>'+(x.unknown ? '—' : (x.ml >= 0 ? '+' : '−')+fmt0(Math.abs(x.ml))+' ml')+'</em></div>';
}

function renderHydSheet(){
  const h = hydDay(currentDate);
  const body = document.getElementById('hyd-body');
  if(!body) return;
  let train = false; try{ train = isTrainingDay(currentDate); }catch(e){}
  let html = '<div class="hyd-big"><b>'+fmtL(h.total)+'</b><span>of '+fmtL(h.target)+' L'+
    (train ? ' · training day, +' + ((typeof trTopUpMl === 'function' ? trTopUpMl(currentDate) : 500) / 1000).toFixed(1) + ' L' : '')+'</span></div>';
  html += '<div class="hyd-row"><div><b>Water</b><s>what you logged on the water card</s></div><em>+'+fmt0(h.waterLog)+' ml</em></div>';
  html += h.drinks.length ? h.drinks.map(hydLine).join('')
    : '<p class="rvx-p" style="margin-top:8px;">No other drinks logged today.</p>';
  html += '<div class="section-title">How it is worked out</div><ul class="rvx-list">'+
    '<li>Each drink counts the water in it: its volume, less the protein, carbs, fat, fibre and alcohol.</li>'+
    '<li>Dairy milk counts at 1.5× its volume — the lab result for milk against water. In a latte the milk is worked out from its protein.</li>'+
    '<li>Coffee and tea have no penalty: studies found them no different from water.</li>'+
    '<li>Alcohol never counts as water. Wine and spirits also take away '+HYD_ALC_ML_PER_G+' ml per gram of alcohol.</li>'+
    '<li>Ice is not counted. A food can be switched in or out on its own page.</li></ul>';
  body.innerHTML = html;
}

// The switch on a food's own page.
function renderHydDetail(e){
  let box = document.getElementById('fd-hyd');
  const nb = document.getElementById('fd-nutrients');
  if(!box && nb){ box = document.createElement('div'); box.id = 'fd-hyd'; nb.parentNode.insertBefore(box, nb.nextSibling); }
  if(!box || !e) return;
  if(e.supp){ box.innerHTML = ''; return; }
  const on = hydIsDrink(e);
  const x = on ? hydDrink(e) : null;
  box.innerHTML = '<div class="section-title">Hydration</div><div class="fd-nut">'+
    (x ? hydLine(x) : '<p class="rvx-p" style="margin:0 0 8px;">Not counted as a drink.</p>')+
    '<label class="hyd-sw"><span>Count as a drink</span><input type="checkbox" id="fd-hyd-sw"'+(on ? ' checked' : '')+'></label></div>';
  const sw = document.getElementById('fd-hyd-sw');
  if(sw) sw.onchange = ()=>{
    // Back to automatic when your choice matches what the name already says.
    setHydFlag(e.name, sw.checked === hydAutoDrink(e) ? null : sw.checked);
    renderHydDetail(e);
    try{ renderWater(); renderOnTarget(); }catch(err){}
  };
}

function renderWaterSettings(){
  const box = document.getElementById('water-settings');
  if(!box) return;
  const {targetMl, glassMl} = waterSettings();
  box.style.display = waterSettingsOpen ? '' : 'none';
  if(!waterSettingsOpen){ box.innerHTML = ''; return; }
  box.innerHTML =
    '<div class="wset"><span class="wsl">Daily target, all drinks</span>'+
      '<button class="wsb" data-wt="-1">&minus;</button>'+
      '<span class="wsv">'+(targetMl/1000).toFixed(2).replace(/0$/,'')+' L</span>'+
      '<button class="wsb" data-wt="1">+</button></div>'+
    '<div class="wset"><span class="wsl">One glass</span>'+
      '<span class="wschoices">'+WATER_GLASS_CHOICES.map(g=>
        '<button class="wsc'+(g===glassMl?' on':'')+'" data-wglass="'+g+'">'+g+'</button>').join('')+
      '</span></div>';
  box.querySelectorAll('[data-wt]').forEach(b=>{
    b.onclick = ()=>{
      const step = Number(b.dataset.wt) * WATER_TARGET_STEP;
      const next = Math.min(WATER_TARGET_MAX, Math.max(WATER_TARGET_MIN, targetMl + step));
      setWaterSetting('waterTargetMl', next);
      renderWater();
    };
  });
  box.querySelectorAll('[data-wglass]').forEach(b=>{
    b.onclick = ()=>{
      // Only the drawing changes. What is already logged stays the volume it was.
      setWaterSetting('waterGlassMl', Number(b.dataset.wglass));
      renderWater();
    };
  });
}

