/* ============================================================
   ONE LIST.

   There used to be six: your foods, built-in foods, saved whole foods,
   reference foods, USDA, packaged. Six headings meant the thing you wanted was
   usually in the fourth one, and it meant six different ideas of what "best
   match" means, none of which could be compared with another.

   Now every source produces candidates in the same shape, every candidate is
   costed by the same matchCost against what you typed, and the list is sorted
   by that cost. Where a food came from is a label on the row, not a section -
   it still shifts the cost (something you eat every week should beat a
   reference table entry that matches equally well), but it can never outrank a
   plainly better match.
   ============================================================ */

/* How much each source is worth, as a cost adjustment. Negative is a head
   start. These are small on purpose: they break ties between similar matches,
   they do not reorder a good match below a bad one. */
const SRC_BIAS = {
  hist:   -7,     // you have eaten this. Nothing beats that as a signal.
  mine:   -5,     // you saved it yourself
  local:   0,     // COACH's own list, hand-checked
  fdcsaved:-1,    // a whole food you already pulled down
  ukf:     1.5,   // the national tables - accurate, but clinically named
  fdc:     2,     // USDA, fetched
  brand:   2.5    // a packet off Open Food Facts
};
/* A row used to be labelled by WHERE IT CAME FROM - "whole food", "USDA",
   "your food". That is COACH's filing system, not an answer to any question
   you have, and it was actively wrong: nasi goreng was tagged "whole food"
   because it happened to arrive through the whole-food door. It is a meal.

   So a row now says what the thing IS. Meal, drink, snack, ingredient, or
   nothing at all for a plain food, where the name already says it. Where it
   came from is COACH's business and lives in the grey line, if anywhere. */
const KIND_DRINK = /\b(drink|juice|smoothie|shake|milkshake|cola|coke|pepsi|lemonade|squash|cordial|beer|lager|ale|stout|cider|wine|prosecco|gin|vodka|whisky|whiskey|rum|cocktail|coffee|espresso|latte|cappuccino|americano|tea|kombucha|lucozade|ribena|tonic|soda)\b/i;
const KIND_SNACK = /\b(crisps|biscuit|biscuits|cookie|cookies|chocolate|sweets|candy|cake|muffin|doughnut|donut|brownie|flapjack|popcorn|pretzel|crackers?|ice cream|dessert|pastry|croissant|scone)\b/i;
// "Pudding" is a dessert here and a sausage in "black pudding".
const KIND_PUDDING = /\bpudding\b/i, KIND_NOT_PUDDING = /\b(black|white|blood)\s+pudding\b/i;
/* Bare "pasta", "noodles" and "wrap" are NOT on this list. Dry pasta is an
   ingredient, and calling it a meal was the same mistake as calling nasi
   goreng a whole food - a word in a name is not the thing itself. A dish gets
   in here by being a named dish, or by the several-things rule below. */
const KIND_MEAL = /\b(curry|stew|casserole|pie|lasagne|risotto|paella|biryani|pilaf|stir fry|soup|broth|chowder|salad|sandwich|burrito|taco|tacos|quesadilla|burger|pizza|ramen|pho|hotpot|tagine|goulash|chilli|chili|omelette|frittata|kebab|gyros|souvlaki|shawarma|fajitas|enchiladas|moussaka|schnitzel|goreng|bibimbap|bulgogi|shakshuka|katsu|masala|jalfrezi|korma|vindaloo|chow mein|pad thai|jollof|feijoada|bolognese|carbonara|stroganoff|paella|risotto|kedgeree|moussaka|fried rice|nasi goreng|mie goreng|congee|shepherds pie|cottage pie|full english)\b/i;
/* An ingredient is the thing itself, not a word that appears in how something
   was tinned. "Tuna, canned in oil" is tuna; "Bell pepper" is a vegetable. So
   this is tested against the HEAD of the name only. */
const KIND_INGREDIENT = /^(flour|oil|vinegar|salt|black pepper|white pepper|peppercorns|spice|spices|herb|herbs|yeast|baking powder|cornflour|cornstarch|stock cube|gelatine|essence|extract)\b|\b(olive oil|rapeseed oil|sunflower oil|coconut oil|sesame oil|vegetable oil|plain flour|self raising flour|wholemeal flour)\b/i;

/* Words that look like a dish and are not one. A curry sauce is a jar, not a
   dinner; butternut squash is a vegetable that happens to share a word with a
   soft drink; an English muffin is bread. Every one of these was a real wrong
   label before it was written down here. */
const KIND_NOT = [
  [/\b(sauce|paste|powder|seasoning|marinade|dressing|stock|gravy|rub|spice mix)\b/i, ''],
  [/\b(butternut|spaghetti)\s+squash\b/i, ''],
  [/\benglish muffin\b/i, ''],
  [/\b(patty|meat|flesh)\s+only\b/i, ''],
  // A rich tea is a biscuit, not a cup of tea.
  [/\b(rich tea|tea biscuit|teacake|tea cake|tea loaf)\b/i, 'snack']
];

/* ---- whose food is it ----
   A row that says "Sausage roll" and a row that says "Greggs Sausage Roll" are
   answers to different questions, and the brand is usually the thing that tells
   you which one you actually ate. It is in the name for COACH's own list and
   for Open Food Facts, in capitals for USDA, and nowhere at all for the
   national tables - so it is dug out and shown in its own right rather than
   left buried in the middle of a long string. */
const BRANDS = new RegExp('\\b(' + [
  "greggs","nando's|nandos","subway","costa","starbucks","pret","wagamama",
  "domino's|dominos","papa john's|papa johns","pizza hut","mcdonald's|mcdonalds",
  "burger king","kfc","five guys","leon","itsu","wasabi","yo! sushi|yo sushi",
  "pizza express","wetherspoon\\w*","toby carvery","harvester","nero",
  "tesco","sainsbury's|sainsburys","asda","morrisons","aldi","lidl","waitrose",
  "marks ?&? ?spencer|m&s","co-?op","iceland","ocado",
  "walkers","mcvitie's|mcvities","cadbury","nestl[eé]","kellogg'?s","weetabix",
  "warburtons","hovis","kingsmill","heinz","hellmann'?s","branston","colman'?s",
  "quaker","alpro","oatly","yakult","actimel","muller|m[uü]ller","yeo valley",
  "arla","lurpak","flora","philadelphia","babybel","dairylea","cathedral city",
  "birds eye","youngs|young's","quorn","linda mccartney","richmond","wall'?s",
  "monster","red bull","lucozade","ribena","robinsons","innocent","tropicana",
  "coca-?cola","pepsi","fanta","sprite","irn-?bru","vimto","oasis",
  "grenade","fulfil","barebells","trek","nakd","graze","eat natural",
  "myprotein","optimum nutrition","huel","bulk","protein works",
  "ben & jerry'?s","haagen-?dazs","magnum","cornetto","mars","snickers","twix",
  "kitkat|kit kat","galaxy","maltesers","haribo","oreo","pringles","doritos",
  "tim hortons","wendy'?s","taco bell","popeyes"
].join('|') + ')\\b', 'i');

// Capitalised words in a USDA name that are not a brand: nutrient acronyms,
// measures, and the publisher's own name.
const NOT_A_BRAND = new Set(['USDA','DHA','ARA','EPA','RTE','NFS','UPC','GTIN',
  'FDC','SR','NLEA','IU','MG','UG','KCAL','AOAC','WWEIA','FNDDS','PUFA','MUFA',
  'SFA','CLA','HFCS','GMO','USA','UK','EU','II','III','IV','AND','OR','WITH']);

// Brands whose own spelling plain title case gets wrong.
const BRAND_SHOW = {"mcdonald's":"McDonald's","mcdonalds":"McDonald's","kfc":"KFC",
  "m&s":"M&S","marks & spencer":"M&S","m&s food":"M&S","marks and spencer":"M&S","co-op":"Co-op","coop":"Co-op","itsu":"itsu",
  "yo! sushi":"YO! Sushi","yo sushi":"YO! Sushi","irn-bru":"Irn-Bru","irn bru":"Irn-Bru",
  "mcvitie's":"McVitie's","mcvities":"McVitie's"};

/* v117: the brand goes UNDER the name, not in it. "McDonald's Big Mac" is shown
   as "Big Mac" with McDonald's on the line below; "Fettuccine (M&S)" from a
   scan as "Fettuccine" with M&S below.

   This is display only. The stored name is untouched, so every saved entry,
   saved food, label and "my serving" still finds its match exactly as before -
   and search still reads the whole name, so "mcdonalds" or "m&s" still finds
   them.

   A leading brand is only taken off for restaurants and shops, where the rest
   is the product ("KFC Zinger Burger"). For a brand that IS the product - Mars,
   Weetabix, Pringles - taking it off would leave "bar" or "Original", so those
   keep their name whole. */
const SHOP_BRANDS = new RegExp('^(' + [
  "mcdonald's","mcdonalds","kfc","burger king","greggs","nando's","nandos","subway",
  "domino's","dominos","pizza hut","papa john's","papa johns","costa","starbucks",
  "tim hortons","five guys","pret","pret a manger","wagamama","leon","itsu","wendy's",
  "taco bell","popeyes","pizza express","wetherspoons?","toby carvery","harvester",
  "caffe nero","nero","tesco","sainsbury's","sainsburys","asda","morrisons","aldi",
  "lidl","waitrose","m&s","marks & spencer","co-op","iceland"
].join('|') + ')\\s+(?=[A-Za-z0-9])', 'i');
const LEAD_BRAND = new RegExp('^' + BRANDS.source + '\\s+(?=[A-Za-z0-9])', 'i');
const NAME_SPLIT = new Map();
function splitName(name, food){
  const n = String(name == null ? '' : name);
  const fb = food && food.brand ? String(food.brand).split(',')[0].trim() : '';
  const key = n + '\u0001' + fb + '\u0001' + (food && (food.code || food.src === 'off') ? 1 : 0);
  let hit = NAME_SPLIT.get(key);
  if(hit) return hit;
  let shown = n, brand = '';
  // A scanned packet: "Product (Brand)".
  const tail = n.match(/^(.*\S)\s+\(([^()]{1,40})\)$/);
  if(tail){
    const b = tail[2].trim();
    const scanned = !!(food && (food.code || food.src === 'off'));
    const known = BRANDS.test(b) && (b.match(BRANDS) || [''])[0].length >= b.length - 1;
    if(scanned || known || (fb && fb.toLowerCase() === b.toLowerCase())){ shown = tail[1]; brand = b; }
  }
  if(!brand){
    const m = n.match(SHOP_BRANDS);
    if(m && n.length - m[0].length >= 2){ shown = n.slice(m[0].length); brand = m[1]; }
  }
  // Any other brand comes off only when what is left still names the food on
  // its own: "Heinz Baked Beans" -> "Baked Beans", but "Mars bar", "Quorn
  // mince" and "Coca-Cola Zero, can" stay as they are.
  if(!brand){
    const m = n.match(LEAD_BRAND);
    if(m){
      const rest = n.slice(m[0].length);
      const head = rest.split(',')[0].trim().split(/\s+/).filter(Boolean);
      if(head.length >= 2){ shown = rest; brand = m[1]; }
    }
  }
  if(brand){
    const low = brand.toLowerCase();
    brand = BRAND_SHOW[low] || (brand === brand.toLowerCase() || brand === brand.toUpperCase()
      ? low.replace(/(^|[\s&-])(\w)/g, (x,a,c)=>a+c.toUpperCase()) : brand);
    // "KFC" and "Nando's" read right as typed; title-casing is for lower-case input.
    if(/^(kfc|m&s)$/i.test(brand)) brand = brand.toUpperCase();
  }
  if(!brand && fb) brand = fb;
  shown = shown.charAt(0).toUpperCase() + shown.slice(1);
  hit = {name: shown, brand: brand};
  if(NAME_SPLIT.size > 20000) NAME_SPLIT.clear();
  NAME_SPLIT.set(key, hit);
  return hit;
}
function shownName(name, food){ return splitName(name, food).name; }

function brandOf(food, name){
  const n = String((food && food.name) || name || '');
  if(!n) return '';
  if(food && food.brand) return String(food.brand).split(',')[0].trim();
  const m = n.match(BRANDS);
  // USDA shouts its brands. Title case reads as a name rather than a warning.
  if(m){
    const b = m[0].toLowerCase();
    if(BRAND_SHOW[b]) return BRAND_SHOW[b];
    return b.replace(/(^|[\s&-])(\w)/g, (x,a,c)=>a+c.toUpperCase());
  }
  /* USDA writes a brand in capitals - "Cereals ready-to-eat, WEETABIX whole
     grain cereal" - which is the only marker it gives. */
  const caps = n.match(/\b[A-Z][A-Z'&.-]{2,}\b/g) || [];
  for(const w of caps){
    const bare = w.replace(/[^A-Z]/g, '');
    if(NOT_A_BRAND.has(bare) || bare.length < 3) continue;
    return w.charAt(0) + w.slice(1).toLowerCase();
  }
  return '';
}

function foodKind(food, name){
  const n = String((food && food.name) || name || '');
  if(!n) return '';
  // Something COACH saved as a dish said so at the time; believe it.
  if(food && food.kind) return food.kind;
  for(const [re, k] of KIND_NOT) if(re.test(n)) return k;
  /* "Porridge, made with water" is not a drink. A word like "water" inside a
     method describes how a thing was cooked, so the test is the food's own
     measure - something poured is measured in millilitres - and a drink word
     at the head of the name. */
  /* Being measured in millilitres makes something pourable, not a drink -
     double cream is poured onto a pudding. A drink has to read like one. */
  const head = n.split(',')[0];
  const liquid = (food && food.basis === 'ml') ||
                 (typeof LIQUID_FOODS !== 'undefined' && LIQUID_FOODS.has(n));
  if(KIND_DRINK.test(head)) return 'drink';
  if(liquid && /\b(milk|juice|water|squash|smoothie|shake)\b/i.test(head)) return 'drink';
  if(/^(McDonald's|KFC|Burger King|Nando's|Greggs|Subway|Domino's|Costa|Starbucks|Tim Hortons|Papa John's|Wendy's|Taco Bell|Popeyes|Pret|Wagamama|LEON|Leon|itsu|Pizza Express|Wetherspoons|Pizza Hut|Five Guys) /.test(n) && !KIND_DRINK.test(n.split(',')[0])) return '';
  if(KIND_MEAL.test(n)) return 'meal';
  if(KIND_SNACK.test(n)) return 'snack';
  if(KIND_PUDDING.test(n) && !KIND_NOT_PUDDING.test(n)) return 'snack';
  if(KIND_INGREDIENT.test(head)) return 'ingredient';
  /* Several things joined by "and" or "with" is a plate of food, whatever the
     words happen to be - "beans on toast", "chicken and rice". */
  if(/\b(and|with|on toast)\b/i.test(n) && n.split(/\s+/).length >= 3) return 'meal';
  return '';
}

/* One result row. Name, the grey line that says which one it is, and the
   calories right-aligned - the number the eye runs down the list looking for.
   The score rides underneath as a dot and a number rather than a badge, so it
   is there when you want it and silent when you do not. */
/* No pictures in this list, on purpose. You are reading names and calories,
   and a column of thumbnails is forty things to look at instead of twenty.
   A photograph earns its place where you are being asked to CHOOSE something
   new - the swap rows - and not where you are looking up what you just ate. */
function srRowHTML(c, i){
  const sc = c.food ? (function(){ try{ return foodScores(c.food); }catch(e){ return null; } })() : null;
  const v = sc ? (sc.overall == null ? sc.protein : sc.overall) : null;
  const band = (v == null) ? null : scoreBand(v);
  const kcal = c.kcal;
  return '<button class="sr-row" data-r="'+i+'">'+
    '<span class="mid">'+
      '<span class="nm">'+esc(shownName(c.name, c.food))+
        (c.tag ? '<span class="sr-tag">'+esc(c.tag)+'</span>' : '')+'</span>'+
      '<span class="sb">'+c.sub+'</span>'+
    '</span>'+
    '<span class="rt">'+
      (kcal != null
        ? '<span class="kc">'+fmt0(kcal)+'</span><span class="kcu">'+esc(c.kcalUnit || 'kcal')+'</span>'
        : '')+
      (band ? '<span class="sd" style="color:'+scoreColour(band.cls)+'">'+
              '<i style="background:'+scoreColour(band.cls)+'"></i>'+v+'</span>' : '')+
    '</span>'+
  '</button>';
}

/* Pictures arrive after the list does. Only the rows on screen ask, only once
   per name, and a row that gets one swaps its icon for it in place - nothing
   re-renders, so nothing jumps under your finger. */
// The search list carries no pictures, so there is nothing to fill in. Kept as
// a no-op rather than deleted: the swap rows still fetch their own.
function srFillThumbs(){}

function searchCandidates(q){
  const ctx = queryCtx(q);
  if(!ctx) return [];
  const out = [];
  const push = (kind, name, cost, sub, food, onAdd, kcal, kcalUnit)=>{
    if(cost === null || cost === undefined) return;
    // Whose it is, first, because that is what tells one row from another.
    const brand = brandOf(food, name);
    out.push({kind: kind, name: name, cost: cost + (SRC_BIAS[kind] || 0),
              sub: brand ? (brand + ' \u00b7 ' + sub) : sub,
              food: food, onAdd: onAdd,
              kcal: kcal, kcalUnit: kcalUnit, tag: foodKind(food, name)});
  };

  // 1. what you actually eat
  searchLocal(q, historyAsRows(), true).forEach(h=>{
    const r = h.row.hist;
    let food = null; try{ food = per100From(r.last); }catch(e){}
    // Eaten often and recently is a stronger claim than eaten once.
    const lift = Math.min(4, Math.log(1 + r.n) * 1.3);
    const e = r.last;
    const g = Number(e.grams) || 0;
    const sub = ['you eat this',
                 (e.perItem && e.qty && e.unit) ? round2(e.qty) + ' ' + pluralUnit(e.unit, e.qty) : gramsText(e, g),
                 r.n > 1 ? r.n + ' times' : 'once',
                 r.daysAgo === 0 ? 'today' : r.daysAgo === 1 ? 'yesterday' : r.daysAgo + ' days ago'
                ].filter(x=>x).join(' · ');
    push('hist', r.name, h.cost - lift, sub, food,
      ()=> openFromHistory(r, selectedMeal),
      Number(e.kcal) || 0, 'as logged');
  });

  // 2. foods you saved
  const hkey = (n, b)=> String(n).toLowerCase() + '|' + String(b || '').toLowerCase();
  const seenHist = new Set(out.map(c=>hkey(c.name, c.food && c.food.brand)));
  searchLocal(q, myFoodsAsRows(), true).forEach(h=>{
    const f = h.row.mf;
    if(seenHist.has(hkey(f.name, f.brand))) return;
    const unit = h.row[8] === 'ml' ? 'ml' : 'g';
    const countable = h.row[5] && h.row[6];
    push('mine', f.name, h.cost,
      'saved by you \u00b7 ' +
      (countable ? ('per ' + h.row[5] + ' \u00b7 ' + fmt0(h.row[6]) + ' ' + unit) : ('per 100 ' + unit)),
      myFoodToFood(f), ()=>openPortion(myFoodToFood(f)),
      countable ? Math.round(h.row[1]*h.row[6]/100) : Math.round(h.row[1]),
      countable ? ('per ' + h.row[5]) : ('/100' + unit));
    seenHist.add(hkey(f.name, f.brand));
  });
  // v113: your own foods by brand too. "grenade" finds every Grenade bar you
  // have saved, whatever you called each one.
  (function(){
    const words = String(q || '').toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length > 1);
    if(!words.length) return;
    loadMyFoods().forEach(f=>{
      if(!f || !f.brand || seenHist.has(hkey(f.name, f.brand))) return;
      const hay = (String(f.brand) + ' ' + String(f.name)).toLowerCase();
      if(!words.every(w=>hay.indexOf(w) >= 0)) return;
      if(String(f.brand).toLowerCase().indexOf(words[0]) < 0 && !words.some(w=>String(f.brand).toLowerCase().indexOf(w) >= 0)) return;
      seenHist.add(hkey(f.name, f.brand));
      const unit = f.basis === 'ml' ? 'ml' : 'g';
      const countable = f.unitName && f.unitGrams;
      push('mine', f.name, 1,
        'saved by you \u00b7 ' + (countable ? ('per ' + f.unitName + ' \u00b7 ' + fmt0(f.unitGrams) + ' ' + unit) : ('per 100 ' + unit)),
        myFoodToFood(f), ()=>openPortion(myFoodToFood(f)),
        countable ? Math.round((Number(f.kcal100)||0)*f.unitGrams/100) : Math.round(Number(f.kcal100)||0),
        countable ? ('per ' + f.unitName) : ('/100' + unit));
    });
  })();

  // 3. the built-in list
  const hidden = overriddenLocals();
  searchLocal(q, null, true).forEach(h=>{
    const f = h.row;
    if(hidden.has(f[0])) return;
    const unit = LIQUID_FOODS.has(f[0]) ? 'ml' : 'g';
    const countable = f[5] && f[6];
    push('local', f[0], h.cost,
      isPerItemRow(f) ? ('per ' + f[5]) :
      countable ? ('per ' + f[5] + ' \u00b7 ' + fmt0(f[6]) + ' ' + unit) : ('per 100 ' + unit),
      localToFood(f), ()=>openPortion(localToFood(f)),
      countable ? Math.round(f[1]*f[6]/100) : Math.round(f[1]),
      countable ? ('per ' + f[5]) : ('/100' + unit));
  });

  // 4. whole foods already pulled down
  fdcSearchSaved(q).forEach(f=>{
    const n = Object.keys(f.micros100 || {}).length;
    push('fdcsaved', f.name, matchCost(ctx, f.name, ''),
      'per 100 g \u00b7 ' + n + ' nutrients', f,
      ()=>openPortion(Object.assign({}, f)), Math.round(f.kcal100), '/100g');
  });

  // 5. the national reference tables
  nfSearch(q).forEach(f=>{
    const n = Object.keys(f.micros100 || {}).length;
    // v117: a reference row with no figure for protein, carbs or fat (some
    // USDA branded rows) shows as "C 0g", which reads as a fact. It is kept,
    // but goes below the rows that have all three, and says what is missing.
    const gaps = [['protein', f.p100], ['carbs', f.c100], ['fat', f.f100]].filter(x=>x[1] == null).map(x=>x[0]);
    const c0 = matchCost(ctx, f.name, '');
    push('ukf', f.name, c0 == null ? null : c0 + (gaps.length ? 12 : 0),
      'per 100 g \u00b7 ' + (gaps.length ? 'no ' + andList(gaps) + ' figure' : n + ' nutrients'), f,
      ()=>openPortion(Object.assign({}, f)), Math.round(f.kcal100), '/100g');
  });

  return out;
}

/* Two things arriving from the network get folded into the same list the
   moment they land, rather than sitting in a section of their own. */
let searchQ = '', searchSeq = 0, searchExtra = [], searchPending = 0, searchNote = '';

let candMemo = {seq: -1, q: null, list: []};
function searchRender(){
  const box = document.getElementById('search-results');
  if(!box) return;
  const q = searchQ;
  /* v143: worked out once per letter typed. It used to be done twice (once
     straight away, once as the live search set off) for the same answer. */
  if(candMemo.seq !== searchSeq || candMemo.q !== q) candMemo = {seq: searchSeq, q: q, list: searchCandidates(q)};
  let list = candMemo.list.concat(searchExtra);

  /* One row per food. Where two places have the same thing and match about as
     well, the one that knows MORE about it wins - 30 nutrients beats 6, and
     the whole point of merging the sources is that you get the best version of
     each food rather than the first one filed. A clearly better match still
     wins outright; this only decides near-ties. */
  const nutrients = c => c.food ? Object.keys(c.food.micros100 || {}).length : 0;
  list.sort((a,b)=>a.cost - b.cost);
  const best = {};
  for(const c of list){
    // v113: a brand you set yourself keeps a food its own row.
    const k = String(c.name).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim() +
      ((c.kind === 'hist' || c.kind === 'mine') && c.food && c.food.brand ? '|' + String(c.food.brand).toLowerCase() : '');
    const had = best[k];
    if(!had){ best[k] = c; continue; }
    if(c.cost <= had.cost + 3 && nutrients(c) > nutrients(had) + 2) best[k] = c;
  }
  const sorted = Object.keys(best).map(k=>best[k]).sort((a,b)=>a.cost - b.cost);
  /* v135: once a row is on screen it stays where it is. Results that arrive
     later (live packets, USDA) are added BELOW what you can already see, so
     the row under your finger never changes. A new search starts fresh. */
  const keyOf = c => String(c.name).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim() +
    ((c.kind === 'hist' || c.kind === 'mine') && c.food && c.food.brand ? '|' + String(c.food.brand).toLowerCase() : '');
  const byKey = {};
  sorted.forEach(c=>{ byKey[keyOf(c)] = c; });
  let rows;
  if(searchShown.length){
    const kept = searchShown.filter(k=>byKey[k]).map(k=>byKey[k]);
    const keptSet = new Set(searchShown);
    const added = sorted.filter(c=>!keptSet.has(keyOf(c))).slice(0, Math.max(0, 40 - kept.length));
    rows = kept.concat(added);
  } else {
    rows = sorted.slice(0, 30);
  }
  if(rows.length) searchShown = rows.map(keyOf);

  let html = '';
  if(!rows.length){
    html = '<div class="sr-note">' + (searchPending
      ? 'Looking...'
      : 'Nothing found. Scanning the barcode is the surest way \u2014 it looks the product '+
        'up directly. Or add it by hand and it is saved for next time.') + '</div>';
  } else {
    html = rows.map((c, i)=>srRowHTML(c, i)).join('');
    if(searchPending) html += '<div class="sr-note">Still looking for packets...</div>';
    else if(searchNote) html += '<div class="sr-note">'+searchNote+'</div>';
  }
  box.innerHTML = html;
  box.querySelectorAll('.sr-row').forEach(btn=>{
    const c = rows[Number(btn.dataset.r)];
    if(c && c.onAdd) btn.onclick = c.onAdd;
  });
  srFillThumbs('search-results', rows);
}

function renderSearch(q){
  searchQ = q;
  searchExtra = [];
  searchNote = '';
  searchPending = 0;
  const seq = ++searchSeq;
  searchShown = [];
  if(q.length >= 3){
    // v135: UK packets kept on the phone are in the first list, not half a
    // second later - fewer rows arriving after you have started to tap.
    try{ brandRowsFrom(packetSearch(q, 40), q); }catch(e){}
  }
  searchRender();
  if(q.length < 3) return;

  // Packets, and the USDA rows if you have a key. Both fold into the list above
  // when they arrive; neither holds it up.
  searchPending++;
  scheduleMergedBranded(q, seq);
  if(typeof fdcHasKey === 'function' && fdcHasKey()){
    searchPending++;
    scheduleMergedUsda(q, seq);
  }
  searchRender();
}

// v135: turns packets into search rows. Used for the UK packets on the phone
// (straight away) and again when the live results arrive.
function brandRowsFrom(products, q, ctx){
  ctx = ctx || queryCtx(q);
  /* Every word you typed has to be on the packet. When that leaves fewer than
     five, a packet missing ONE word is let in below the full matches: M&S sell
     their tortilla chips as "Lightly Salted Tortillas", which never says chips.
     A shop's name is never the word let off. */
  const strictCost = p => matchCost(ctx, p.product_name,
    (p.brands ? String(p.brands).split(',')[0].trim() : '') + ' ' + (p.quantity || ''), {wordy: true});
  const strictN = ctx ? products.filter(p => strictCost(p) !== null).length : 0;
  const looseCtxs = [];
  if(ctx && strictN < 5 && ctx.tokens.length >= 2){
    const shop = new Set(['marks', 'spencer']);
    const named = ctx.raw.match(BRANDS);
    if(named) tokenise(brandAlias(named[0]).toLowerCase()).forEach(t => shop.add(t));
    ctx.tokens.forEach((t, i) => {
      if(shop.has(t)) return;
      const c = queryCtx(ctx.tokens.filter((_, j) => j !== i).join(' '));
      if(c) looseCtxs.push(c);
    });
  }
  const closeCtx = {};
  products.forEach(p=>{
    const brand = p.brands ? String(p.brands).split(',')[0].trim() : '';
    /* v143: a packet found through a close spelling of what you typed is
       judged against that spelling, and always sits below the exact ones. */
    if(p._close){
      const cc = closeCtx[p._close] || (closeCtx[p._close] = queryCtx(p._close));
      const c0 = matchCost(cc, p.product_name, brand + ' ' + (p.quantity || ''), {wordy: true});
      if(c0 === null) return;
      pushBrandRow(p, brand, c0 + 45, 'close spelling');
      return;
    }
    /* A packet is matched on its name AND its brand, and judged with the wordy
       rule, because a product name is a shelf label, not a dish. */
    let cost = matchCost(ctx, p.product_name, brand + ' ' + (p.quantity || ''), {wordy: true});
    if(cost === null && looseCtxs.length){
      for(const lc of looseCtxs){
        const c = matchCost(lc, p.product_name, brand + ' ' + (p.quantity || ''), {wordy: true});
        if(c !== null && (cost === null || c + 60 < cost)) cost = c + 60;
      }
    }
    if(cost === null) return;
    pushBrandRow(p, brand, cost);
  });
}
function pushBrandRow(p, brand, cost, note){
  const kc = Math.round(kcalFrom(p.nutriments, p));
  const food = offToFood(p);
  const bits = ['per 100 ' + (food.basis === 'ml' ? 'ml' : 'g')];
  if(brand) bits.push(brand);
  if(p.quantity) bits.push(String(p.quantity).trim());
  if(note) bits.push(note);
  searchExtra.push({kind: 'brand', name: p.product_name,
    cost: cost + offPlaceCost(p) + SRC_BIAS.brand,
    sub: esc(bits.join(' \u00b7 ')), tag: foodKind(food),
    kcal: kc, kcalUnit: '/100' + (food.basis === 'ml' ? 'ml' : 'g'),
    food: food, onAdd: ()=>openPortion(food)});
}

let mergedBrandTimer = null;
function scheduleMergedBranded(q, seq){
  clearTimeout(mergedBrandTimer);
  mergedBrandTimer = setTimeout(()=>mergedBranded(q, seq), 300);
}

async function mergedBranded(q, seq){
  const ctx = queryCtx(q);
  let products = [], err = null;
  try{ products = await brandedFetch(q); }catch(e){ err = e; }
  if(seq !== searchSeq) return;
  searchPending = Math.max(0, searchPending - 1);
  // v123: UK packets kept on the phone. Live results win where both have
  // the same barcode; the rest are added, so a shelf product turns up with
  // no signal at all.
  let local = [];
  try{ local = packetSearch(q, 40); }catch(e){ local = []; }
  if(err && !local.length){
    searchNote = 'Could not reach the product database ('+esc(err.message)+
      '). Everything above still works offline.';
    searchRender();
    return;
  }
  if(err) searchNote = 'No signal \u2014 showing UK packets saved on this phone.';
  /* v143: the live search found little and what you typed looks like a slip
     ("bunderberg"): ask again with the close spelling, shown below. */
  if(!err && products.length < 5){
    let fixed = null; try{ fixed = packetCorrect(q); }catch(e){}
    if(fixed){
      try{
        const more = await brandedFetch(fixed);
        if(seq !== searchSeq) return;
        const have = new Set(products.map(p => String(p.code || '')));
        more.forEach(p => { if(!have.has(String(p.code || ''))){ p._close = fixed; products.push(p); } });
      }catch(e){}
    }
  }
  if(local.length){
    const codes = new Set(products.map(p => String(p.code || '').replace(/^0+/, '')));
    products = products.concat(local.filter(p => !codes.has(String(p.code).replace(/^0+/, ''))));
  }
  brandRowsFrom(products, q, ctx);
  searchRender();
}

let mergedUsdaTimer = null;
function scheduleMergedUsda(q, seq){
  clearTimeout(mergedUsdaTimer);
  mergedUsdaTimer = setTimeout(()=>mergedUsda(q, seq), 300);
}

async function mergedUsda(q, seq){
  const ctx = queryCtx(q);
  let hits = [];
  try{
    hits = await fdcSearch(q);
    if(!hits.length) hits = await fdcSearch(q, {branded:true});
  }catch(e){
    if(seq !== searchSeq) return;
    searchPending = Math.max(0, searchPending - 1);
    searchRender();
    return;
  }
  if(seq !== searchSeq) return;
  searchPending = Math.max(0, searchPending - 1);
  hits.map(fdcToFood).filter(f=>f).slice(0, 12).forEach(f=>{
    const cost = matchCost(ctx, f.name, '', {wordy: true});
    if(cost === null) return;
    const n = Object.keys(f.micros100 || {}).length;
    searchExtra.push({kind: 'fdc', name: f.name, cost: cost + SRC_BIAS.fdc,
      sub: 'per 100 g \u00b7 '+n+' nutrient'+(n===1?'':'s'), tag: foodKind(f),
      kcal: Math.round(f.kcal100), kcalUnit: '/100g',
      food: f, onAdd: ()=>{ fdcRemember(f); openPortion(Object.assign({}, f)); }});
  });
  searchRender();
}

/* The fetching half of the old branded search, with the rendering taken out.
   The ladder of progressively looser queries and the legacy fallback are
   unchanged - they were the part that worked. */
async function brandedFetch(q){
  const wanted = brandAlias(String(q||'').toLowerCase()).split(/[^a-z0-9]+/).filter(w=>w && !SEARCH_FILLER.has(w));
  const seen = new Set();
  const found = [];
  let lastErr = null;

  const digits = String(q||'').replace(/[^0-9]/g,'');
  const terms = (digits.length >= 8 && digits.length <= 14 && digits === String(q||'').trim())
    ? [] : queryLadder(q);

  const take = list => {
    for(const p of list){
      const code = p.code || p._id || p.product_name;
      if(!code || seen.has(code)) continue;
      if(!p.product_name) continue;
      if(kcalFrom(p.nutriments, p) == null) continue;
      seen.add(code); found.push(p);
    }
  };

  try{
    if(!terms.length) take(await offByCode(digits));
    for(const term of terms){
      let hits = [];
      try{ hits = await offSearch(term); }catch(e){ lastErr = e; continue; }
      take(hits);
      const strong = found.filter(p=>productScore(p, wanted) >= wanted.length * 1000).length;
      if(strong >= 5) break;
      if(found.length >= 25) break;
    }
  }catch(e){ lastErr = e; }

  if(!found.length && terms.length){
    // The old endpoint does not understand the brand filter; plain words only.
    for(const term of terms.filter(t => t.indexOf('brands:') < 0).slice(0, 2)){
      let hits = [];
      try{ hits = await offSearchLegacy(term); }catch(e){ lastErr = e; continue; }
      take(hits);
      if(found.length) break;
    }
  }
  if(!found.length && lastErr) throw lastErr;
  return found;
}

const SEARCH_FILLER = new Set(['the','a','of','with','and','flavour','flavor',
  'flavoured','style','pack','multipack','bag','bottle','can','tin','box',
  'new','value','fresh','real','no','added']);

// Calories are not always published as energy-kcal_100g. Derive them rather
// than dropping a product that plainly has the information.
function kcalFrom(n, p){
  if(!n) return null;
  if(n['energy-kcal_100g'] != null) return Number(n['energy-kcal_100g']);
  if(n['energy-kj_100g']   != null) return Number(n['energy-kj_100g']) / 4.184;
  if(n['energy_100g'] != null){
    const v = Number(n['energy_100g']);
    // energy_100g is kJ unless the unit says otherwise
    return (n['energy_unit'] === 'kcal') ? v : v / 4.184;
  }
  // fall back to a per-serving figure scaled by the serving size
  const per = n['energy-kcal_serving'] != null ? Number(n['energy-kcal_serving'])
            : (n['energy_serving'] != null ? Number(n['energy_serving'])/4.184 : null);
  if(per != null && p && p.serving_quantity){
    const g = Number(p.serving_quantity);
    if(g > 0) return per * 100 / g;
  }
  return null;
}

/* v118: a scanned packet's figures per 100 g, wherever Open Food Facts keeps
   them. The scanner only ever looked at "energy-kcal_100g", so a product
   entered in kJ, or entered per serving - which is how most protein powders
   and supplements go in, one scoop at a time - came back as "no calorie
   information" even though the numbers were right there. Search already read
   them through kcalFrom(); now the scanner does too.
   Per-serving figures are scaled by the serving weight Open Food Facts holds,
   and only when that weight is in grams or millilitres. Nothing is guessed:
   no weight, no conversion. */
/* v118: some packets on Open Food Facts carry their figures ONLY in the "as
   prepared" columns - every Huel Complete Protein tub, for one, has
   proteins_prepared_100g and no proteins_100g. COACH read only the plain
   columns, so the scan said "no calorie information" and search dropped the
   product altogether. When a product has no as-sold energy at all, the
   prepared columns are read in their place and the food is marked so the
   portion sheet can say so. A product that has both keeps its as-sold
   figures; nothing is ever mixed. */
function offFixPrepared(p){
  if(!p || !p.nutriments || p._prepFixed) return p;
  const n = p.nutriments;
  const hasSold = n['energy-kcal_100g'] != null || n['energy-kj_100g'] != null || n['energy_100g'] != null ||
                  n['energy-kcal_serving'] != null || n['energy_serving'] != null;
  const hasPrep = n['energy-kcal_prepared_100g'] != null || n['energy-kj_prepared_100g'] != null ||
                  n['energy_prepared_100g'] != null || n['energy-kcal_prepared_serving'] != null;
  Object.defineProperty(p, '_prepFixed', {value: true, enumerable: false});
  if(hasSold || !hasPrep) return p;
  const out = {};
  Object.keys(n).forEach(k=>{
    const m = k.match(/^(.+)_prepared(_100g|_serving|_value)?$/);
    if(m) out[m[1] + (m[2] || '')] = n[k];
    else if(!(k in out)) out[k] = n[k];
  });
  p.nutriments = out;
  p.prepared = true;
  return p;
}
function offServingGrams(p){
  const g = Number(p && p.serving_quantity);
  if(!(g > 0)) return null;
  const u = String((p && p.serving_quantity_unit) || 'g').toLowerCase();
  return (u === 'g' || u === 'ml') ? g : null;
}
function offPer100(p){
  const n = (p && p.nutriments) || {};
  const kcal = kcalFrom(n, p && offServingGrams(p) ? Object.assign({}, p, {serving_quantity: offServingGrams(p)}) : null);
  if(kcal == null || !isFinite(kcal)) return null;
  const sg = offServingGrams(p);
  const v100 = k => {
    if(n[k + '_100g'] != null && !isNaN(n[k + '_100g'])) return Number(n[k + '_100g']);
    if(sg && n[k + '_serving'] != null && !isNaN(n[k + '_serving'])) return Number(n[k + '_serving']) * 100 / sg;
    return null;
  };
  const fromServing = n['energy-kcal_100g'] == null && n['energy-kj_100g'] == null && n['energy_100g'] == null;
  return {kcal: kcal, p: v100('proteins'), c: v100('carbohydrates'), f: v100('fat'),
          sug: v100('sugars'), sat: v100('saturated-fat'), fromServing: fromServing};
}
// The same product can be filed under its 13-digit EAN or its 12-digit UPC
// (the same number without the leading 0). Try the other form before giving up.
function barcodeVariants(code){
  const d = String(code || '').replace(/\D/g, '');
  const out = [d];
  if(d.length === 13 && d.charAt(0) === '0') out.push(d.slice(1));
  if(d.length === 12) out.push('0' + d);
  return out;
}

function num(n, keys){
  for(const k of keys){ if(n && n[k] != null && !isNaN(n[k])) return Number(n[k]); }
  return 0;
}

// Progressively looser queries. Anything that matches on a broader attempt is
// still ranked against the words you actually typed, so precision is not lost.
// "m&s", "m & s", "m and s", "marks and spencer", "marks & spencers" are one
// shop. Split on symbols, "m&s" became the two letters "m s", which match
// nearly anything, so the brand did nothing. Applied to what you type AND to
// the product's name and brand when ranking, so both sides agree. Never applied
// to stored names, so nothing saved changes.
function brandAlias(s){
  return String(s == null ? '' : s)
    .replace(/\bmarks\s*(?:&|and|\+)?\s*spencers?\b/gi, 'marks spencer')
    .replace(/\bm\s*(?:&|and|\+)\s*s\b/gi, 'marks spencer')
    .replace(/\bm\s*&amp;\s*s\b/gi, 'marks spencer');
}
function queryLadder(q){
  const raw = String(q||'').toLowerCase();
  const aliased = brandAlias(raw) !== raw;
  const words = brandAlias(raw).split(/[^a-z0-9]+/).filter(Boolean);
  // Keep the shop's name in one piece, so no rung searches "marks chips".
  for(let i = 0; i < words.length - 1; i++){
    if(words[i] === 'marks' && words[i+1] === 'spencer') words.splice(i, 2, 'marks spencer');
  }
  const out = [];
  const push = w => { const s = w.join(' ').trim(); if(s && out.indexOf(s) < 0) out.push(s); };
  // Open Food Facts' search matches ANY word and then sorts by popularity, so
  // "m&s tortilla chips" came back as Pringles and San Pellegrino. Asking for
  // the brand as a filter returns only M&S packets. Tried live: 61 M&S
  // results for tortilla chips, every one of them M&S.
  if(aliased){
    const rest = words.filter(w => w !== 'marks spencer' && !SEARCH_FILLER.has(w));
    // Words first, filter last: "brands:... AND tortilla chips" was read as a
    // filter on every field and returned nothing.
    const head = rest.length ? rest.join(' ') + ' ' : '';
    out.push(head + 'brands:"M&S"');
    out.push(head + 'brands:"Marks & Spencer"');
    if(rest.length > 1) out.push(rest[rest.length - 1] + ' brands:"M&S"');
  }
  push(words);
  // Open Food Facts files plenty of M&S packets under "M&S" alone, so ask both ways.
  if(aliased){
    const ms = raw.replace(/\bmarks\s*(?:&|and|\+)?\s*spencers?\b/gi, 'm&s')
                  .replace(/\bm\s*(?:and|\+|&)\s*s\b/gi, 'm&s').replace(/\s+/g, ' ').trim();
    if(ms && out.indexOf(ms) < 0) out.push(ms);
  }
  const core = words.filter(w => !SEARCH_FILLER.has(w));
  push(core);
  if(core.length > 3) push(core.slice(0, 3));
  // Also drop the LEADING word. If the first word is the wrong one ("king"),
  // every rung that keeps it returns the same narrow result; this is what
  // surfaces the rest of the range alongside it.
  if(core.length > 2) push(core.slice(1));
  if(core.length > 2) push(core.slice(0, 2));
  if(core.length > 2) push(core.slice(1, 3));
  if(core.length > 1) push([core[0], core[core.length-1]]);
  if(core.length) push([core[0]]);
  return out.slice(0, aliased ? 9 : 7);
}

/* v143: answers kept for the session, so going back a letter, or searching
   the same thing twice, is instant and costs nothing. */
const OFF_MEMO = new Map();
async function offSearch(term, signalSeq){
  const hit = OFF_MEMO.get(term);
  if(hit && Date.now() - hit.at < 30 * 60000) return hit.list.map(p => Object.assign({}, p));
  const list = await offSearchLive(term);
  OFF_MEMO.set(term, {at: Date.now(), list: list});
  if(OFF_MEMO.size > 80) OFF_MEMO.delete(OFF_MEMO.keys().next().value);
  return list.map(p => Object.assign({}, p));
}
async function offSearchLive(term){
  // Sorting by scan count puts the product people actually buy at the top,
  // instead of an obscure variant that happens to match the string.
  const url = 'https://search.openfoodfacts.org/search?q=' + encodeURIComponent(term) +
              '&page_size=40&page=1&sort_by=-unique_scans_n';
  const r = await fetch(url);
  if(!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json();
  return (d.hits || d.products || []).map(offFixPrepared);
}

// A typed barcode should just work.
async function offByCode(code){
  const r = await fetch('https://world.openfoodfacts.org/api/v2/product/' + encodeURIComponent(code) +
    '.json?fields=code,product_name,brands,quantity,product_quantity,product_quantity_unit,'+
    'serving_size,serving_quantity,serving_quantity_unit,nutrition_data_per,nutriments,additives_tags');
  if(!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json();
  return (d && d.status === 1 && d.product) ? [offFixPrepared(d.product)] : [];
}

// Search-a-licious is the current index and the right primary. It is also young,
// and it misses products the legacy full-text search still finds. This runs ONLY
// when the primary found nothing at all, at most twice, on a query that has
// already settled — never as search-as-you-type, which is what got the old
// endpoint rate-limited to 10 requests a minute in the first place.
async function offSearchLegacy(term){
  const url = 'https://world.openfoodfacts.org/cgi/search.pl?search_terms=' +
    encodeURIComponent(term) + '&search_simple=1&action=process&json=1&page_size=30' +
    '&fields=code,product_name,brands,quantity,product_quantity,product_quantity_unit,'+
    'serving_size,serving_quantity,serving_quantity_unit,nutrition_data_per,nutriments,additives_tags';
  const r = await fetch(url);
  if(!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json();
  return ((d && d.products) || []).map(offFixPrepared);
}

/* Open Food Facts is worldwide and volunteer-run, and its index happily puts a
   German or Japanese product at the top for an English word. You shop in the
   UK, so a UK packet in English should win, and a product whose name you
   cannot even read should not be first.

   This is a COST in the same units as matchCost - added to the match, lower is
   better - and every part of it is defensive: an Open Food Facts record that
   does not carry a field simply gets no adjustment, never a crash. */
function offPlaceCost(p){
  if(!p) return 0;
  let c = 0;
  const name = String(p.product_name || '');

  // 1. Can you read it? Anything outside the Latin alphabet goes to the bottom,
  //    whatever the index thought. This is the part that fixes "the first thing
  //    isn't English".
  const letters = name.replace(/[^\p{L}]/gu, '');
  if(letters){
    const latin = (name.match(/[\p{Script=Latin}]/gu) || []).length;
    const frac = latin / letters.length;
    if(frac < 0.5) c += 40;          // another script entirely
    else if(frac < 0.9) c += 12;     // mostly ours, with something else in it
  }

  // 2. Where it is sold. Tags look like "en:united-kingdom".
  const tags = []
    .concat(Array.isArray(p.countries_tags) ? p.countries_tags : [])
    .concat(typeof p.countries === 'string' ? p.countries.toLowerCase().split(/\s*,\s*/) : [])
    .map(x=>String(x).toLowerCase());
  const has = re => tags.some(t=>re.test(t));
  if(tags.length){
    if(has(/united-kingdom|\buk\b|united kingdom|royaume-uni/)) c -= 7;
    else if(has(/ireland|irlande/)) c -= 4;
    else if(has(/australia|new-zealand|new zealand|canada|united-states|united states/)) c -= 1;
    else c += 9;                     // sold somewhere you are not
  }

  // 3. The language the record was written in.
  const lang = String(p.lang || p.lc || '').toLowerCase();
  if(lang){ if(lang === 'en') c -= 2; else c += 6; }

  // 4. Popularity, as a nudge only - it decides ties, never the order.
  const scans = Number(p.unique_scans_n || p.scans_n || 0);
  if(scans > 0) c -= Math.min(3, Math.log10(scans + 1) * 1.2);

  // 5. A packet with nothing but a barcode for a name helps nobody.
  if(name.trim().length < 3) c += 25;
  return c;
}

function productScore(p, wanted){
  const hay = brandAlias(((p.product_name||'') + ' ' + (p.brands||'') + ' ' + (p.quantity||'')).toLowerCase());
  let hits = 0;
  for(const w of wanted) if(hay.indexOf(w) >= 0) hits++;
  // every word you typed that appears is worth more than raw popularity
  return hits * 1000 + Math.min(999, Number(p.unique_scans_n || 0));
}


/* The old per-section searchers lived here - scheduleBrandedSearch,
   scheduleUsdaSearch, usdaSearch and brandedSearch - each fetching and then
   rendering into a box of its own. The boxes are gone, because there is one
   list now, so they went with them. Everything of theirs that was worth
   keeping is in brandedFetch above and mergedBranded / mergedUsda. */
/* One packet, one conversion. This was written out longhand inside the search
   results' click handler, which meant the merged list below would have needed a
   second copy of it. */
function offToFood(p){
  const n = (p && p.nutriments) || {};
  const d = portionDefaultsFor(p);
  return {
    name: p.product_name + (p.brands ? ' ('+String(p.brands).split(',')[0].trim()+')' : ''),
    code: p.code || null,
    src: 'off',
    ...(p.prepared ? {prepared: true} : {}),
    // Kept with the food, so it is still there when the food comes back out of
    // your own library with no signal.
    image: offImageOf(p),
    kcal100: kcalFrom(n, p) || 0,
    p100: num(n, ['proteins_100g']),
    c100: num(n, ['carbohydrates_100g']),
    f100: num(n, ['fat_100g']),
    sug100: num(n, ['sugars_100g']),
    // Nutri-Score needs these two and they are on every EU label, so a
    // scanned product can always be scored properly.
    sat100: num(n, ['saturated-fat_100g']),
    fv100:  num(n, ['fruits-vegetables-nuts-estimate-from-ingredients_100g',
                    'fruits-vegetables-nuts_100g']),
    micros100: extractMicros(n),
    basis: detectBasis(p),
    // Same defaults as a scan. These were two separate copies of the
    // serving logic, which is how they came to disagree.
    unitName: d.unitName, unitGrams: d.unitGrams, startAmount: d.startAmount
  };
}


