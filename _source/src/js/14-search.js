// ---- Built-in database of generic foods ----
// Open Food Facts is a BARCODE database — it is excellent for packaged goods and
// close to useless for 'egg' or 'chicken breast'. These 300 staples are bundled
// so the everyday searches are instant, work with no signal, and never fail.
// Format: [name, kcal, protein, carbs, fat] per 100g, then optional [unit, grams].
const LOCAL_FOODS = JSON.parse(coachData("LOCAL_FOODS"));

// ---- Search ----
// The old version required every word to appear as a literal substring of the
// name, in whatever form you typed it. "ham and cheese toasted sandwich" found
// nothing because the entry is "Ham and cheese toasted sandwich" but "toastie",
// "sarnie" or a different word order all failed. This version works on tokens,
// so word order does not matter, and expands British/American/slang variants.

// Phrases are swapped before tokenising, because these map many words to many.
const PHRASE_SYNONYMS = [
  [/\btoastie\b/g, 'toasted sandwich'],
  [/\bjaffle\b/g, 'toasted sandwich'],
  [/\btoasted sarnie\b/g, 'toasted sandwich'],
  [/\bgrilled cheese\b/g, 'cheese toasted sandwich'],
  [/\bcheese toastie\b/g, 'cheese toasted sandwich'],
  [/\bfry up\b/g, 'full english breakfast'],
  [/\bcooked breakfast\b/g, 'full english breakfast'],
  [/\bspag bol\b/g, 'spaghetti bolognese'],
  [/\bmac and cheese\b/g, 'macaroni cheese'],
  [/\bbaked potato\b/g, 'jacket potato'],
  [/\bmeal prep\b/g, 'chicken and rice'],
  [/\bground beef\b/g, 'beef mince'],
  [/\bground turkey\b/g, 'turkey mince'],
  [/\bsoft drink\b/g, 'soda'],
  [/\bfizzy drink\b/g, 'soda']
];

// One word to a set of equivalents, applied in both directions.
const WORD_SYNONYMS = {
  sandwich:['sarnie','butty','sarny','sub','roll','bap'],
  sarnie:['sandwich'], butty:['sandwich','roll'], bap:['sandwich','roll'],
  toasted:['toastie','grilled'], toastie:['toasted'],
  chips:['fries'], fries:['chips'],
  crisps:['chips'],
  biscuit:['cookie'], cookie:['biscuit'],
  courgette:['zucchini'], zucchini:['courgette'],
  aubergine:['eggplant'], eggplant:['aubergine'],
  coriander:['cilantro'], cilantro:['coriander'],
  rocket:['arugula'], arugula:['rocket'],
  prawn:['shrimp'], prawns:['shrimp'], shrimp:['prawns','prawn'],
  mince:['ground'], ground:['mince'],
  yoghurt:['yogurt'], yogurt:['yoghurt'],
  wholemeal:['wholewheat','brown'], wholewheat:['wholemeal'],
  soda:['cola','fizzy','pop'], cola:['soda'],
  pepper:['capsicum'], capsicum:['pepper'],
  spud:['potato'], potato:['spud'],
  veg:['vegetable','vegetables'], vegetables:['veg','vegetable'], vegetable:['veg'],
  chicken:['poultry'],
  soda_water:['sparkling'],
  pb:['peanut','butter'],
  protein:['whey'], whey:['protein'],
  oats:['porridge','oatmeal'], porridge:['oats','oatmeal'], oatmeal:['oats','porridge'],
  chippy:['chips','fish'],
  brekkie:['breakfast'], breakfast:['brekkie'],
  veggie:['vegetarian'], vegetarian:['veggie'],
  doner:['kebab'], kebab:['doner','shish'],
  avo:['avocado'], avocado:['avo'],
  chocolate:['choc'], choc:['chocolate'],

  /* ---- the words a dish is filed under, when they are not the words you
     would type ----
     USDA files dishes under what is in them, in English: nasi goreng is
     "Rice, fried". These are translations of an INGREDIENT or a METHOD, never
     of a whole dish. "Jollof" meaning "rice" was the lesson: jollof rice then
     read as "rice rice" and matched every rice in the book, rice cakes
     included, which is worse than admitting COACH does not have it. If the
     word names the dish rather than what is in it, it is not on this list. */
  nasi:['rice'], goreng:['fried'], mie:['noodles'], bami:['noodles'],
  gai:['chicken'], khao:['rice'],
  arroz:['rice'], pollo:['chicken'], carne:['beef'], pescado:['fish'],
  bulgogi:['beef'], japchae:['noodles'],
  dal:['lentils'], dhal:['lentils'], daal:['lentils'],
  roti:['flatbread'], chapati:['flatbread'], paratha:['flatbread'],
  aloo:['potato'], gobi:['cauliflower'], saag:['spinach'], paneer:['cheese'],
  keema:['mince'], murgh:['chicken'], gosht:['lamb'],
  merguez:['sausage'], souvlaki:['pork'],
  pierogi:['dumpling'], pelmeni:['dumpling'], gyoza:['dumpling'],
  plantain:['banana']
};

// Words that carry no meaning in a food name — dropping them means
// "ham and cheese on toast" matches "Ham and cheese toasted sandwich".
const STOPWORDS = new Set(['and','with','a','an','the','of','on','in','some','my','&','plus']);

function normalise(s){
  let t = ' ' + String(s||'').toLowerCase()
    .replace(/&/g,' and ')
    .replace(/[^a-z0-9\s]/g,' ')
    .replace(/\s+/g,' ').trim() + ' ';
  for(const [re, to] of PHRASE_SYNONYMS) t = t.replace(re, to);
  return t.trim();
}

/* v143: "Müller", "Nestlé", "crème fraîche" lost their accented letter to
   normalise() and could never be found by typing them plainly. Search folds
   accents first. normalise() itself is left exactly as it was, because saved
   keys are built from it. */
function foldAccents(s){
  return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\u00df/g,'ss').replace(/[\u00f8\u00d8]/g,'o').replace(/[\u00e6\u00c6]/g,'ae');
}

function tokenise(s){
  return normalise(s).split(' ')
    // a leading count is how people type ("3 eggs", "2x coffee") and it matches nothing
    .filter(w => w && !STOPWORDS.has(w) && !/^\d+(x)?$/.test(w));
}

// Each query token becomes the set of words that would satisfy it.
function expandToken(t){
  // `prefix` variants may match the start of a word; `exact` ones must match it
  // whole. Plural stems go in `exact` — otherwise "fries" prefix-matches "fried".
  const prefix = new Set([t]);
  const exact = new Set();
  (WORD_SYNONYMS[t]||[]).forEach(x=>prefix.add(x));
  if(t.endsWith('s') && t.length > 3) exact.add(t.slice(0,-1));
  else exact.add(t+'s');
  // raw is kept so the scorer can tell "the word you typed, exactly" apart
  // from "something close enough to find".
  return {raw:t, prefix:[...prefix], exact:[...exact]};
}

/* One insertion, deletion, substitution OR swap apart. Enough for "chiken",
   "bannana", "yoghrt" and "chikcen" - the mistakes people actually make while
   typing fast. The swap was the missing one: two letters the wrong way round
   is two substitutions to a plain edit count, so "chikcen" failed here and the
   search had to fall back on dropping the word entirely, which is how you end
   up being shown every breast in the book. */
function within1(a, b){
  if(a === b) return true;
  const la = a.length, lb = b.length;
  if(Math.abs(la - lb) > 1) return false;
  // Two adjacent letters transposed, same length.
  if(la === lb){
    for(let k = 0; k < la - 1; k++){
      if(a[k] === b[k]) continue;
      if(a[k] === b[k+1] && a[k+1] === b[k] &&
         a.slice(k+2) === b.slice(k+2) && a.slice(0, k) === b.slice(0, k)) return true;
      break;
    }
  }
  let i = 0, j = 0, diff = 0;
  while(i < la && j < lb){
    if(a[i] === b[j]){ i++; j++; continue; }
    if(++diff > 1) return false;
    if(la > lb) i++;
    else if(lb > la) j++;
    else { i++; j++; }
  }
  return true;
}

/* v143: two slips in a long word ("bunderberg" for Bundaberg, "mozarella"
   plus a missed key). Only for words of 8+ letters that start with the same
   letter, so short words never turn into something else. */
function within2(a, b){
  const la = a.length, lb = b.length;
  if(Math.abs(la - lb) > 2 || a[0] !== b[0]) return false;
  let prev2 = null, prev = new Array(lb + 1);
  for(let j = 0; j <= lb; j++) prev[j] = j;
  for(let i = 1; i <= la; i++){
    const cur = new Array(lb + 1); cur[0] = i; let rowMin = i;
    for(let j = 1; j <= lb; j++){
      const c = a[i-1] === b[j-1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j-1] + 1, prev[j-1] + c);
      if(prev2 && i > 1 && j > 1 && a[i-1] === b[j-2] && a[i-2] === b[j-1]) v = Math.min(v, prev2[j-2] + 1);
      cur[j] = v; if(v < rowMin) rowMin = v;
    }
    if(rowMin > 2) return false;
    prev2 = prev; prev = cur;
  }
  return prev[lb] <= 2;
}

// HOW WELL a token matched, not just whether it did. "oats" found the word
// "oats" in "rolled oats" and the singular stem "oat" in "oat milk" — both
// counted as one match, both landed on the same score tier, and the tiebreak
// on name length then handed the top slot to the milk. Anything further from
// the word you actually typed now costs you.
const Q_EXACT = 0, Q_STEM = 1, Q_SYN = 2, Q_PREFIX = 3, Q_TYPO = 4, Q_TYPO2 = 6, Q_MISS = 9;
function tokenQuality(v, words){
  let best = Q_MISS;
  for(const w of words){
    if(w === v.raw) return Q_EXACT;                    // nothing beats this
    for(const e of v.exact) if(w === e && best > Q_STEM) best = Q_STEM;
    for(const p of v.prefix){
      if(w === p){ if(best > Q_SYN) best = Q_SYN; continue; }
      if(w.startsWith(p)){ if(best > Q_PREFIX) best = Q_PREFIX; continue; }
      // typed longer than the entry ("chickens" vs "chicken")
      if(p.length > 4 && w.length > 4 && p.startsWith(w)){ if(best > Q_PREFIX) best = Q_PREFIX; continue; }
      // a single typo anywhere in a reasonably long word
      if(p.length >= 5 && w.length >= 5 && within1(p, w)){ if(best > Q_TYPO) best = Q_TYPO; continue; }
      if(best > Q_TYPO2 && p.length >= 8 && w.length >= 7 && within2(p, w)) best = Q_TYPO2;
    }
  }
  return best;
}

function searchLocal(q, source, withScore){
  const hits = searchLocalStrict(q, source, withScore);
  if(hits.length) return hits;
  // Nothing matched with every word required. Try again allowing one word to
  // miss, so "greek yoghurt strawberry" still finds the yoghurt rather than
  // returning nothing at all.
  const toks = tokenise(String(q||'').toLowerCase().trim());
  if(toks.length < 2) return hits;
  // A shop you named is not a word to drop. "m&s tortilla chips" has no M&S
  // row among the built-in foods, and dropping "m&s" turned it into McDonald's
  // fries. When nothing built in carries that brand, say nothing here and let
  // the packet search answer.
  const named = brandAlias(String(q||'')).match(BRANDS);
  if(named){
    const want = brandAlias(named[0]).toLowerCase();
    const list = source || LOCAL_FOODS;
    let any = false;
    for(let i = 0; i < list.length && !any; i++){
      if(brandAlias(String(list[i][0])).toLowerCase().indexOf(want) >= 0) any = true;
    }
    if(!any) return hits;
  }
  const seen = new Set(); const out = [];
  /* Which word you drop matters enormously. "Jollof rice" with "jollof"
     dropped is every rice in the book - it came back with rice pudding and
     rice cakes - while "rice" dropped is still jollof. The distinctive word is
     the rare one, so dropping it costs far more than dropping a common one. */
  const commonness = tok => {
    let n = 0;
    const list = source || LOCAL_FOODS;
    for(let i = 0; i < list.length; i++){
      if(String(list[i][0]).toLowerCase().indexOf(tok) >= 0){ n++; if(n > 40) break; }
    }
    return n;
  };
  const rank = toks.map((t, i)=>({i: i, n: commonness(t)}));
  // Drop the most common word first; the rare one is the last thing to go.
  rank.sort((a, b)=>b.n - a.n);
  for(const r of rank){
    const skip = r.i;
    const sub = toks.filter((_,i)=>i!==skip).join(' ');
    /* Dropping a word nothing else shares is not a looser search, it is a
       different one. "Jollof rice" without "jollof" is every rice in the book,
       and rice pudding is not a worse answer to the question - it is not an
       answer to it. Nothing is the honest result, and it leaves room for the
       online databases below to have the dish. */
    if(r.n <= 2) continue;
    const penalty = 9;
    for(const hit of searchLocalStrict(sub, source, withScore)){
      const row = withScore ? hit.row : hit;
      if(seen.has(row[0])) continue;
      seen.add(row[0]);
      // A match that needed a word dropped is a worse match, and in one merged
      // list it has to say so rather than arriving looking like an exact hit.
      out.push(withScore ? {cost: hit.cost + penalty, row: row} : row);
    }
    if(out.length >= 8) break;
  }
  return out.slice(0, 12);
}


/* What you typed, worked out once. Every source - your own history, the
   built-in list, the reference tables, a shelf of packets off Open Food Facts -
   is judged by the SAME function against this, which is the only way one
   merged list can be ordered honestly. */
function queryCtx(q){
  const raw = foldAccents(brandAlias(String(q||'').toLowerCase())).trim();
  if(!raw) return null;
  const qTokens = tokenise(raw);
  if(!qTokens.length) return null;
  return {raw: raw, tokens: qTokens, expanded: qTokens.map(expandToken), norm: normalise(raw)};
}

/* How far a name is from what you typed. Lower is closer; null means it does
   not match at all. Extracted from the built-in search so that a packet and a
   built-in food cannot be ranked by two different rulers. */
/* v117: a name is worked out once, not once per keystroke. normalise() runs
   a list of phrase rewrites over the text, and the search did that for all
   ~9,000 built-in names on every letter typed. The answer for a given name
   never changes, so it is kept. Bounded so it can never grow without limit. */
const NAME_MEMO = new Map();
function nameParts(name){
  name = String(name);
  let m = NAME_MEMO.get(name);
  if(m) return m;
  if(NAME_MEMO.size > 60000) NAME_MEMO.clear();
  const norm = normalise(foldAccents(brandAlias(name)));
  const c = name.indexOf(',');
  m = {norm: norm, words: norm.split(' '), lower: name.toLowerCase(),
       head: c < 0 ? null : normalise(foldAccents(name.slice(0, c))).split(' '), comma: c >= 0};
  NAME_MEMO.set(name, m);
  return m;
}
function matchCost(ctx, name, alias, opts){
  if(!ctx || !name) return null;
  const o = opts || {};
  const np = nameParts(name);
  const nameNorm = np.norm;
  const nameWords = np.words;
  const aliasWords = alias ? nameParts(alias).words : [];

  // every query token must be satisfied somewhere — order does not matter
  let matchedInName = 0, quality = 0, ok = true;
  for(const variants of ctx.expanded){
    const qn = tokenQuality(variants, nameWords);
    if(qn < Q_MISS){ matchedInName++; quality += qn; continue; }
    const qa = tokenQuality(variants, aliasWords);
    // reaching it through an alias is a step further out than reaching it
    // through the name, whatever the quality of the alias match
    if(qa < Q_MISS){ quality += qa + 2; continue; }
    ok = false; break;
  }
  // last resort: the whole query typed without spaces ("bigmac", "peanutbutter")
  if(!ok && ctx.tokens.length === 1){
    const squashed = nameNorm.replace(/ /g,'');
    const aliasSquashed = aliasWords.join('');
    const qs = ctx.tokens[0];
    if(qs.length > 4 && (squashed.includes(qs) || aliasSquashed.includes(qs))){
      ok = true; matchedInName = 1;
    }
  }
  if(!ok) return null;

  let score;
  if(nameNorm === ctx.norm) score = 0;
  // "Egg, whole" is the plain entry — it should beat "Egg yolk" for "egg"
  else if(np.lower.startsWith(ctx.norm + ',')) score = 2;
  else if(nameNorm.startsWith(ctx.norm + ' ')) score = 4;
  else if(nameNorm.startsWith(ctx.norm)) score = 8;
  else if(matchedInName === ctx.tokens.length) score = 14;   // all words in the name proper
  else score = 26;                                           // needed an alias to match

  // how far each word had to bend to match. Weighted so an exact word beats
  // a stem outright, but not so hard that a prefix match ("choc" ->
  // "chocolate") is pushed below something merely shorter.
  score += quality * 2;
  // Prefer names that are mostly the words you typed, not long ones that
  // happen to contain them. The discount for a comma tail only applies when
  // what you typed is in the HEAD — if it is in the tail, the tail is not a
  // qualifier as far as your query is concerned, it is the match.
  const hw = np.comma ? np.head : np.words;
  const inHead = hw.length !== nameWords.length &&
    ctx.expanded.every(v => tokenQuality(v, hw) < Q_MISS);
  /* A packet is allowed to be wordy. "Alpro Soya Unsweetened Long Life Drink"
     is one product, not a six-word dish, and the full built-in penalty buried
     every real branded match under something shorter and foreign. */
  const extra = Math.max(0, (inHead ? hw.length : nameWords.length) - ctx.tokens.length);
  score += extra * (o.wordy ? 0.35 : 1.1);
  if(np.comma) score += 0.4;   // a qualifier still costs something
  score += nameNorm.length * (o.wordy ? 0.004 : 0.015);
  return score;
}

function searchLocalStrict(q, source, withScore){
  const ctx = queryCtx(q);
  if(!ctx) return [];
  const scored = [];
  for(const f of (source || LOCAL_FOODS)){
    const c = matchCost(ctx, f[0], rowAlias(f));
    if(c === null) continue;
    scored.push([c, f]);
  }
  scored.sort((a,b)=>a[0]-b[0]);
  const top = scored.slice(0, 16);
  return withScore ? top.map(x=>({cost: x[0], row: x[1]})) : top.map(x=>x[1]);
}


// Per-100g micronutrients for the whole foods that make up most of a normal
// day's logging. Local entries only ever carried protein/carbs/fat, so a
// banana genuinely had no fibre figure — this fills that in.
// Order: fibre g, sugars g, sodium mg, potassium mg, calcium mg, iron mg,
// magnesium mg, zinc mg, vitamin C mg, vitamin A ug, folate ug, B12 ug, vitamin D ug.
// These are reference values for the food, not a specific brand or cut.
const MICRO_DB = {
  "Almonds":[12.5,4.4,1,733,269,3.7,270,3.1,0,0,44,0,0],
  "Apple":[2.4,10.4,1,107,6,0.1,5,0.0,4.6,3,3,0,0],
  "Asparagus":[2.0,1.3,14,224,23,0.9,14,0.6,7.7,50,149,0,0],
  "Avocado":[6.7,0.7,7,485,12,0.6,29,0.6,10.0,7,81,0,0],
  "Back bacon, grilled":[0,0,1480,390,10,0.7,26,2.2,0,3,1,0.8,0.7],
  "Bacon, grilled":[0,0,1720,410,11,0.8,28,2.4,0,3,1,0.9,0.8],
  "Bagel, plain":[2.3,4.9,430,90,50,3.3,25,0.9,0,0,90,0,0],
  "Baked beans":[4.9,5.2,410,300,45,1.4,31,0.6,0,0,30,0,0],
  "Banana":[2.6,12.2,1,358,5,0.3,27,0.2,8.7,3,20,0,0],
  "Basmati rice, cooked":[0.6,0.1,2,40,10,0.3,13,0.5,0,0,50,0,0],
  "Beef mince 10% fat, raw":[0,0,70,315,15,2.2,20,4.7,0,0,7,2.3,0.1],
  "Beef mince 20% fat, raw":[0,0,75,270,18,2.0,17,4.2,0,0,6,2.1,0.1],
  "Beef mince 5% fat, raw":[0,0,66,340,12,2.3,22,4.8,0,0,7,2.4,0.1],
  "Beef steak, fillet, cooked":[0,0,52,380,17,2.9,26,5.0,0,0,9,2.7,0.1],
  "Beef steak, ribeye, cooked":[0,0,60,320,17,2.2,21,5.8,0,0,6,2.5,0.1],
  "Beef steak, sirloin, cooked":[0,0,55,370,18,2.6,25,5.4,0,0,8,2.6,0.1],
  "Bell pepper":[2.1,4.2,4,211,7,0.4,12,0.3,127.7,157,46,0,0],
  "Black beans, cooked":[8.7,0.3,2,355,27,2.1,70,1.1,0,0,149,0,0],
  "Blueberries":[2.4,10.0,1,77,6,0.3,6,0.2,9.7,3,6,0,0],
  "Boiled egg":[0,1.1,124,126,50,1.2,10,1.1,0,149,44,1.1,2.0],
  "Braising steak, cooked":[0,0,58,300,15,2.8,20,6.5,0,0,7,2.8,0.1],
  "Broccoli":[3.3,1.4,41,293,40,0.7,21,0.5,64.9,77,108,0,0],
  "Brown rice, cooked":[1.8,0.4,4,86,10,0.6,44,0.7,0,0,4,0,0],
  "Butter":[0,0.1,643,24,24,0.0,2,0.1,0,684,3,0.2,1.5],
  "Carrot":[2.8,4.7,69,320,33,0.3,12,0.2,5.9,835,19,0,0],
  "Cashews":[3.3,5.9,12,660,37,6.7,292,5.8,0.5,0,25,0,0],
  "Cauliflower":[2.3,1.6,15,142,16,0.3,9,0.2,44.3,0,44,0,0],
  "Cheddar cheese":[0,0.5,654,98,721,0.7,28,3.1,0,265,27,1.1,0.6],
  "Chia seeds":[34.4,0,16,407,631,7.7,335,4.6,1.6,0,49,0,0],
  "Chicken breast, cooked":[0,0,60,332,15,1.0,29,1.0,0,9,4,0.3,0.1],
  "Chicken breast, raw":[0,0,45,334,5,0.4,27,0.7,0,6,4,0.2,0.1],
  "Chicken drumstick, cooked":[0,0,95,220,12,1.1,22,2.5,0,17,7,0.5,0.1],
  "Chicken mince, raw":[0,0,70,270,9,0.8,25,1.3,0,12,5,0.4,0.1],
  "Chicken sausage, cooked":[0.5,1.0,760,240,20,1.0,18,1.5,0,6,4,0.5,0.3],
  "Chicken thigh, cooked":[0,0,85,230,11,1.3,23,2.1,0,18,6,0.6,0.1],
  "Chicken wings, cooked":[0,0,82,150,14,1.2,18,1.8,0,16,5,0.3,0.1],
  "Chickpeas, canned":[6.4,0.5,240,180,45,1.5,39,1.1,1,1,54,0,0],
  "Chips, oven":[3.2,0.4,280,540,12,0.7,25,0.4,10,0,20,0,0],
  "Chorizo":[0,1.0,1620,400,12,1.4,17,3.2,0,0,2,2.2,0.6],
  "Cod fillet, raw":[0,0,54,413,16,0.4,32,0.5,1,12,7,0.9,0.9],
  "Cod, cooked":[0,0,66,440,18,0.5,36,0.6,1,14,8,1.0,1.2],
  "Corned beef":[0,0,950,140,12,2.1,14,3.9,0,0,8,1.6,0.1],
  "Cottage cheese":[0,2.7,364,104,83,0.1,8,0.4,0,37,12,0.4,0.1],
  "Courgette":[1.0,2.5,8,261,16,0.4,18,0.3,17.9,10,24,0,0],
  "Couscous, cooked":[1.4,0.1,5,58,8,0.4,8,0.3,0,0,15,0,0],
  "Cream cheese":[0,3.2,314,138,98,0.1,9,0.5,0,308,11,0.2,0.2],
  "Cucumber":[0.5,1.7,2,147,16,0.3,13,0.2,2.8,5,7,0,0],
  "Dates, medjool":[8.0,63.4,2,656,39,1.0,43,0.4,0,0,15,0,0],
  "Double cream":[0,2.9,27,75,65,0.1,7,0.2,0.6,405,4,0.2,1.1],
  "Egg white":[0,0.7,166,163,7,0.1,11,0.0,0,0,4,0.1,0],
  "Egg yolk":[0,0.6,48,109,129,2.7,5,2.3,0,381,146,2.0,5.4],
  "Egg, whole":[0,0.4,142,138,56,1.8,12,1.3,0,160,47,1.1,2.0],
  "Feta":[0,4.1,1116,62,493,0.7,19,2.9,0,125,32,1.7,0.4],
  "Fried egg":[0,0.4,207,152,62,1.9,13,1.4,0,175,51,1.2,2.2],
  "Grapes":[0.9,16.3,2,191,10,0.4,7,0.1,3.2,3,2,0,0],
  "Greek yogurt, 0% fat":[0,3.6,36,141,110,0.1,11,0.5,0,0,7,0.8,0],
  "Greek yogurt, 5% fat":[0,4.0,35,141,100,0.0,11,0.5,0,27,7,0.8,0.1],
  "Greek yogurt, 2% fat":[0,3.8,36,141,105,0.1,11,0.5,0,14,7,0.8,0.1],
  "Green beans":[3.2,1.9,3,146,44,0.7,18,0.3,9.7,35,33,0,0],
  "Haddock, cooked":[0,0,80,420,17,0.3,30,0.5,0,13,10,1.4,1.5],
  "Ham, sliced":[0,1.0,1200,290,7,0.9,18,1.6,0,0,3,0.6,0.6],
  "Jacket potato":[2.2,1.2,10,420,9,0.5,25,0.4,10,0,12,0,0],
  "Kale":[4.1,0.8,53,348,254,1.6,33,0.4,93.4,500,141,0,0],
  "Kidney beans, canned":[6.4,0.3,220,255,35,1.7,42,0.9,1,0,48,0,0],
  "King prawns, raw":[0,0,300,190,64,0.4,35,1.3,0,50,17,1.2,0.1],
  "Kiwi":[3.0,9.0,3,312,34,0.3,17,0.1,92.7,4,25,0,0],
  "Lamb chop, cooked":[0,0,72,310,17,1.9,24,4.5,0,0,5,2.6,0.2],
  "Lamb mince, raw":[0,0,68,290,16,1.7,22,4.0,0,0,5,2.4,0.2],
  "Leg of lamb, cooked":[0,0,70,330,10,2.0,26,5.0,0,0,6,2.8,0.2],
  "Lentils, cooked":[7.9,1.8,2,369,19,3.3,36,1.3,1.5,0,181,0,0],
  "Lettuce":[1.3,0.8,28,194,36,0.9,13,0.2,9.2,370,38,0,0],
  "Liver, lamb, cooked":[0,0,105,300,10,10.2,22,6.0,2.0,7400,240,72,0.6],
  "Mackerel, cooked":[0,0,95,360,15,1.6,60,0.9,0,54,2,19.0,13.8],
  "Mango":[1.6,13.7,1,168,11,0.2,10,0.1,36.4,54,43,0,0],
  "Mashed potato":[1.5,1.4,320,300,20,0.3,18,0.3,7,20,9,0,0],
  "Mozzarella":[0,1.0,486,76,505,0.4,20,2.9,0,179,7,2.3,0.4],
  "Mushrooms":[1.0,2.0,5,318,3,0.5,9,0.5,2.1,0,17,0,0.2],
  "Mussels, cooked":[0,0,369,268,33,6.7,37,2.7,13,91,64,24.0,0.2],
  "Yoghurt, natural":[0,4.7,46,155,183,0.1,17,0.9,0.5,27,7,0.4,0.1],
  "Noodles, egg, cooked":[1.8,0.5,5,38,12,1.3,18,0.6,0,5,50,0.1,0],
  "Rolled oats, dry":[10.6,1.0,2,429,54,4.7,177,4.0,0,0,56,0,0],
  "Omelette, plain":[0,0.9,180,140,57,1.5,11,1.2,0,165,42,1.0,1.9],
  "Onion":[1.7,4.2,4,146,23,0.2,10,0.2,7.4,0,19,0,0],
  "Orange":[2.4,9.4,0,181,40,0.1,10,0.1,53.2,11,30,0,0],
  "Parmesan":[0,0.9,1529,125,1184,0.8,38,2.8,0,207,7,1.2,0.5],
  "Pasta, cooked":[1.8,0.6,1,44,7,0.5,18,0.5,0,0,7,0,0],
  "Peach":[1.5,8.4,0,190,6,0.3,9,0.2,6.6,16,4,0,0],
  "Peanut butter":[6.0,9.2,17,649,49,1.9,168,2.9,0,0,87,0,0],
  "Peanuts":[8.5,4.7,18,705,92,4.6,168,3.3,0,0,240,0,0],
  "Pear":[3.1,9.8,1,116,9,0.2,7,0.1,4.3,1,7,0,0],
  "Peas, frozen":[5.5,5.0,72,153,25,1.5,33,1.2,18.0,38,65,0,0],
  "Pepperoni":[0,0,1580,320,17,1.4,16,2.9,0,0,2,1.9,0.7],
  "Pineapple":[1.4,9.9,1,109,13,0.3,12,0.1,47.8,3,18,0,0],
  "Pitta bread":[2.6,1.6,520,120,86,2.5,25,0.8,0,0,70,0,0],
  "Pork chop, cooked":[0,0,62,420,20,0.9,28,2.4,0.6,2,1,0.7,1.1],
  "Pork loin, cooked":[0,0,55,430,18,0.8,29,2.2,0.6,2,1,0.6,1.0],
  "Pork mince, raw":[0,0,60,340,16,0.9,22,2.4,0.7,2,1,0.6,0.8],
  "Porridge, made with water":[1.7,0.3,4,61,8,0.7,26,0.6,0,0,8,0,0],
  "Potato, boiled":[1.8,0.9,4,379,8,0.3,20,0.3,13,0,10,0,0],
  "Prawns, cooked":[0,0,590,180,70,0.5,37,1.6,0,54,19,1.4,0.1],
  "Prosciutto":[0,0,2340,410,10,1.0,20,2.4,0,0,2,0.9,0.6],
  "Quinoa, cooked":[2.8,0.9,7,172,17,1.5,64,1.1,0,0,42,0,0],
  "Raisins":[3.7,59.2,11,749,50,1.9,32,0.2,2.3,0,5,0,0],
  "Raspberries":[6.5,4.4,1,151,25,0.7,22,0.4,26.2,2,21,0,0],
  "Rotisserie chicken":[0,0,330,240,14,1.1,24,1.6,0,15,5,0.4,0.1],
  "Rump steak, cooked":[0,0,56,360,16,2.5,24,5.2,0,0,8,2.5,0.1],
  "Salami":[0,1.5,1740,380,14,1.3,18,3.0,0,0,2,2.0,0.7],
  "Salmon fillet, raw":[0,0,44,363,9,0.3,27,0.4,0,12,26,3.2,11.0],
  "Salmon, cooked":[0,0,55,384,11,0.4,31,0.5,0,13,29,3.3,13.1],
  "Sardines, canned":[0,0,505,397,382,2.9,39,1.3,0,32,10,8.9,4.8],
  "Sausage, pork, cooked":[1.0,1.2,880,250,25,1.2,17,1.9,0,5,3,0.8,0.5],
  "Scrambled eggs":[0,1.3,155,132,66,1.5,11,1.2,0,150,40,0.9,1.8],
  "Sea bass, cooked":[0,0,87,380,13,0.4,49,0.5,0,60,6,3.8,2.3],
  "Semi-skimmed milk":[0,4.8,44,156,124,0.0,11,0.4,0,20,5,0.5,0.1],
  "Skimmed milk":[0,5.0,42,156,125,0.0,11,0.4,0,2,5,0.5,0.1],
  "Smoked salmon":[0,0,1880,175,11,0.9,18,0.3,0,26,2,3.3,17.1],
  "Sourdough bread":[2.9,2.0,480,120,40,2.4,25,0.8,0,0,60,0,0],
  "Spinach":[2.2,0.4,79,558,99,2.7,79,0.5,28.1,469,194,0,0],
  "Squid, raw":[0,0,44,246,32,0.7,33,1.5,5,10,5,1.3,0.1],
  "Strawberries":[2.0,4.9,1,153,16,0.4,13,0.1,58.8,1,24,0,0],
  "Sunflower seeds":[8.6,2.6,9,645,78,5.3,325,5.0,1.4,3,227,0,0],
  "Sweet potato, baked":[3.3,6.5,36,475,38,0.7,27,0.3,20,961,6,0,0],
  "Sweetcorn, canned":[2.4,4.5,15,270,3,0.5,32,0.6,5.5,10,42,0,0],
  "Tomato":[1.2,2.6,5,237,10,0.3,11,0.2,13.7,42,15,0,0],
  "Tortilla wrap":[2.3,2.1,570,110,120,2.9,20,0.6,0,0,60,0,0],
  "Tuna steak, cooked":[0,0,50,440,8,1.3,64,0.8,0,20,2,10.9,5.7],
  "Tuna, canned in oil":[0,0,340,200,11,1.2,31,0.8,0,6,4,2.5,1.9],
  "Tuna, canned in water":[0,0,320,240,10,1.0,28,0.7,0,5,3,2.2,1.7],
  "Turkey breast, cooked":[0,0,60,300,12,0.7,28,1.4,0,5,6,0.4,0.1],
  "Turkey mince, raw":[0,0,72,260,14,1.2,24,2.4,0,10,7,0.9,0.2],
  "Walnuts":[6.7,2.6,2,441,98,2.9,158,3.1,1.3,1,98,0,0],
  "Watermelon":[0.4,6.2,1,112,7,0.2,10,0.1,8.1,28,3,0,0],
  "White bread":[2.7,5.0,490,115,150,3.6,23,0.7,0,0,80,0,0],
  "White rice, cooked":[0.4,0.1,1,35,10,0.2,12,0.5,0,0,58,0,0],
  "Whole milk":[0,4.8,43,150,123,0.0,11,0.4,0,46,5,0.5,1.3],
  "Wholemeal bread":[7.0,3.9,450,254,107,2.7,76,1.8,0,0,42,0,0],
  "Wholewheat pasta, cooked":[4.5,0.8,3,62,15,1.1,42,1.1,0,0,5,0,0]
};

/* Some nutrients have no source in anything COACH ships. Choline is the
   example: neither the UK tables nor the Australian ones publish it, and
   COACH's own list never carried it - so it can only ever arrive from the USDA
   top-up, and until then it is UNKNOWABLE rather than missing from your diet.
   Saying "never measured" about it, week after week, is COACH's fault being
   reported as yours.                                                          */
let tableKeyCache = null;
function tableKeys(){
  if(tableKeyCache) return tableKeyCache;
  const seen = {};
  try{
    NF_TABLES.forEach(t=>{
      nfAll(t.k).forEach(r=>{
        const m = r.micros100 || {};
        for(const k in m){ if(m[k] != null) seen[k] = true; }
      });
    });
  }catch(e){ return {}; }
  tableKeyCache = seen;
  return seen;
}
let sourcelessCache = null;
function sourcelessNutrients(){
  if(sourcelessCache) return sourcelessCache;
  const out = {};
  try{
    MICROS.forEach(m=>{
      if(m.read || m.info) return;
      if(MICRO_ORDER.indexOf(m.k) >= 0) return;          // COACH's own columns
      // The tables have a COLUMN for choline and not one figure in it, so the
      // column list proves nothing. Look at the rows.
      if(tableKeys()[m.k]) return;
      // A USDA top-up, a scanned label or one of your own foods can still
      // fill it. Only call it sourceless when nothing on the device has one.
      let seen = false;
      const fills = (typeof fdcFills === 'function') ? fdcFills() : {};
      for(const n in fills){ if(fills[n] && fills[n][m.k] != null){ seen = true; break; } }
      if(!seen && typeof EXTRA_MICRO !== 'undefined'){
        for(const n in EXTRA_MICRO){ if(EXTRA_MICRO[n] && EXTRA_MICRO[n][m.k] != null){ seen = true; break; } }
      }
      if(!seen) out[m.k] = true;
    });
  }catch(e){ return {}; }
  sourcelessCache = out;
  return out;
}
function isSourceless(k){ return !!sourcelessNutrients()[k]; }

const MICRO_ORDER = ['fiber','sodium','potassium','calcium','iron','magnesium','zinc','vitamin-c','vitamin-a','vitamin-b9','vitamin-b12','vitamin-d'];

// Nutrients MICRO_DB has no column for. Additive: a name here is merged over
// whatever MICRO_DB already holds, never replacing it.
//
// Sourced, not remembered - the same rule the food labels were held to.
// Dark chocolate: USDA SR via myfooddata (FDC 170273), per 100 g.
const EXTRA_MICRO = {
  "Dark chocolate 70%": {copper:1.79, manganese:1.96, phosphorus:312, selenium:6.8,
    'vitamin-e':0.61, 'vitamin-k':7.5, 'vitamin-b1':0.036, 'vitamin-b2':0.071,
    'vitamin-pp':1.07, 'vitamin-b6':0.036}
};

const NF_KEYS = ["protein", "fat", "carbs", "kcal", "sugar", "satfat", "transfat", "monofat", "polyfat", "omega3", "omega6", "cholesterol", "fiber", "sodium", "potassium", "calcium", "magnesium", "phosphorus", "iron", "copper", "zinc", "manganese", "selenium", "iodine", "vitamin-a", "vitamin-d", "vitamin-e", "vitamin-k", "vitamin-b1", "vitamin-b2", "vitamin-pp", "vitamin-b6", "vitamin-b12", "vitamin-b9", "vitamin-b5", "vitamin-b7", "vitamin-c", "chromium", "molybdenum", "choline"];
const UK_FILL = {"Almonds":5,"Anchovies":11,"Apple":24,"Apple crumble":880,"Apple juice":13,"Apple sauce":14,"Asparagus":46,"Avocado":57,"Back bacon, grilled":68,"Bacon sandwich":2409,"Bacon, grilled":79,"Bagel, plain":83,"Baked beans":84,"Banana":92,"Barbecue sauce":96,"Basmati rice, cooked":2320,"Beef steak, fillet, cooked":187,"Beef steak, sirloin, cooked":244,"Beetroot":270,"Black pudding":346,"Blue cheese":594,"Boiled egg":1073,"Bounty":367,"Brazil nuts":372,"Breadsticks":412,"Broccoli":446,"Brown rice, cooked":2305,"Brown rice, raw":2306,"Brown sauce":450,"Brown sugar":2596,"Brussels sprouts":454,"Butter":476,"Butter beans, canned":124,"Butternut squash":2569,"Cabbage":484,"Carrot":531,"Cashews":536,"Cauliflower":564,"Celery":569,"Cereal bar":571,"Cheddar cheese":593,"Cheese toasted sandwich":2410,"Cheesecake":633,"Cherries":636,"Cherry tomatoes":2689,"Chicken and rice":703,"Chicken breast, cooked":664,"Chicken burger":473,"Chicken curry":930,"Chicken curry with rice":937,"Chicken drumstick, cooked":680,"Chicken salad sandwich":2411,"Chicken satay":657,"Chicken thigh, cooked":704,"Chicken wings, cooked":715,"Chilli con carne with rice":728,"Chorizo":749,"Chow mein":752,"Cider":761,"Coconut oil":1753,"Coconut, desiccated":775,"Cod, cooked":780,"Coleslaw":811,"Condensed milk":1637,"Corned beef":836,"Cornish pasty":838,"Coronation chicken":842,"Cottage cheese":620,"Cottage pie":1968,"Courgette":848,"Crab meat":857,"Cream of tomato soup":2529,"Croissant":879,"Crumpet":889,"Cucumber":891,"Curry powder":900,"Curry sauce":2429,"Custard":1001,"Dal":1009,"Digestive biscuit":321,"Double cream":870,"Egg fried rice":2312,"Egg white":1070,"Egg yolk":1081,"Egg, whole":1073,"Energy drink":1089,"English muffin":1690,"Fish fingers, cooked":1115,"Flapjack":1136,"Fried egg":1076,"Fried rice":2312,"Garlic bread":387,"Garlic mushrooms":1186,"Gelatine":1191,"Ghee":1193,"Goats cheese":622,"Golden syrup":2633,"Gooseberries":1208,"Grapefruit":1220,"Grapes":1225,"Gravy, made up":1227,"Green beans":135,"Guacamole":1238,"Haddock, cooked":1251,"Hazelnuts":1284,"Honey":1303,"Horseradish sauce":1309,"Ice cream, vanilla":1318,"Icing sugar":2597,"Jaffa Cakes":1335,"Jam":1339,"Jelly":1343,"Kebab, doner":1026,"Kidney beans, canned":152,"King prawns, raw":2214,"Lamb chop, cooked":1444,"Lamb mince, raw":1459,"Lasagne":1495,"Leg of lamb, cooked":1427,"Lemon juice":1510,"Lentil soup":2534,"Lentils, cooked":1529,"Lettuce":1535,"Lime juice":1536,"Liver, lamb, cooked":1553,"Lychee":1574,"Macadamia nuts":1575,"Macaroni cheese":1576,"Mackerel, cooked":1578,"Mango":1586,"Mars Bar":1594,"Mashed potato":2198,"Mayonnaise":1600,"Milk chocolate":746,"Mint sauce":1669,"Mixed herbs":1673,"Mixed nuts":1749,"Molasses":1674,"Muesli":1686,"Mushrooms":1708,"Naan bread":391,"Nectarine":1726,"Noodles, egg, cooked":1732,"Oatcake":1750,"Olive oil":1760,"Onion":1785,"Orange juice":1796,"Ox liver, cooked":1556,"Pak choi":1812,"Pancakes":1830,"Papaya":1836,"Parsnip":1844,"Pasta, cooked":1863,"Peach":1907,"Peanut butter":1909,"Peanuts":1911,"Peas, frozen":1931,"Pecans":1943,"Pesto":1961,"Pine nuts":2012,"Pineapple":2013,"Pistachios":2020,"Pitta bread":392,"Pizza, cheese":2023,"Plain flour":1154,"Plum":2049,"Pork chop, cooked":2099,"Pork mince, raw":2119,"Pork pie":2068,"Pork scratchings":2069,"Porridge, made with water":2147,"Potato, boiled":2196,"Potato, raw":2202,"Prawn crackers":2210,"Pumpkin seeds":2246,"Quiche lorraine":2251,"Radish":2268,"Raisins":2269,"Rapeseed oil":1763,"Red wine":2820,"Rice noodles, cooked":1733,"Rice pudding":2235,"Roast potatoes":2192,"Rum":2361,"Salami":2382,"Salmon, cooked":2397,"Salt":2403,"Samosa":2408,"Sardines, canned":2416,"Sauerkraut":2447,"Sausage roll":2449,"Sausage, pork, cooked":2454,"Scotch egg":2478,"Scrambled eggs":1079,"Sea bass, cooked":107,"Seeded bread":393,"Self-raising flour":1155,"Semi-skimmed milk":1646,"Sesame oil":1765,"Sesame seeds":2490,"Shepherds pie":2499,"Shrimp, cooked":2507,"Single cream":871,"Skimmed milk":1651,"Soup, chicken":659,"Soup, tomato":2529,"Spaghetti bolognese":2549,"Spinach":2557,"Spring onion":2565,"Spring roll":2566,"Squid, raw":2575,"Strawberries":2587,"Sugar, white":2598,"Sunflower oil":1767,"Sunflower seeds":2600,"Sweet potato, baked":2614,"Sweet potato, raw":2613,"Sweetcorn, canned":2618,"Tahini":2636,"Tartare sauce":2655,"Tea with milk":2668,"Tea, black":2662,"Tempeh":2669,"Tomato":2684,"Tomato pasta":1854,"Tomato pasta sauce":2436,"Tomato puree":2686,"Tortilla chips":2705,"Trifle":2711,"Tuna, canned in oil":2725,"Turkey breast, cooked":2733,"Turnip":2759,"Vegetable curry with rice":996,"Venison, cooked":2779,"Waffle":2784,"Walnuts":2785,"Water":2788,"Watercress":2789,"White bread":406,"White rice, raw":2328,"White wine":2824,"Whole milk":1658,"Wholemeal bread":380,"Wholemeal flour":1156,"Wholewheat pasta, cooked":1871,"Yorkshire pudding":2852};
const UK_BLOB = coachData("UK_BLOB");
const AU_FILL = {"Anchovies":13,"Apple":14,"Apple juice":681,"Asparagus":39,"Avocado":40,"Baked beans":49,"Balsamic vinegar":1534,"Banana":56,"Banana chips":54,"Barbecue sauce":1296,"Beef steak, sirloin, cooked":134,"Beetroot":171,"Black coffee":485,"Black pepper":1059,"Blackberries":215,"Blue cheese":377,"Boiled egg":571,"Brazil nuts":925,"Broccoli":293,"Brown rice, raw":1258,"Brown sugar":1429,"Brussels sprouts":301,"Butter":315,"Cabbage":323,"Capers":350,"Capsicum":354,"Carrot":361,"Cauliflower":372,"Celery":376,"Cheddar cheese":382,"Cherries":402,"Cherry tomatoes":1473,"Chicken breast, cooked":407,"Chicken breast, raw":409,"Chicken drumstick, cooked":413,"Chicken nuggets":424,"Chicken sausage, cooked":1326,"Chicken thigh, cooked":434,"Chicken wings, cooked":440,"Chickpeas, canned":446,"Cider":468,"Cocoa powder":471,"Coconut oil":956,"Coconut water":1537,"Coconut, desiccated":479,"Cod, cooked":482,"Condensed milk":842,"Corn on the cob":512,"Corned beef":111,"Cranberries, dried":521,"Cranberry sauce":1298,"Cream cheese":386,"Croissant":532,"Cucumber":538,"Cumin":539,"Curry sauce":1312,"Custard":547,"Dried apricots":29,"Egg fried rice":1260,"Egg white":569,"Egg yolk":578,"Egg, whole":574,"Eggplant":580,"English muffin":878,"Evaporated milk":841,"Fish fingers, cooked":593,"Fried rice":1260,"Garlic":626,"Garlic bread":260,"Gelatine":628,"Ghee":632,"Goats cheese":389,"Golden syrup":1446,"Grapefruit":660,"Grapes":657,"Hemp seeds":1345,"Hoisin sauce":1300,"Honey":668,"Ice cream, vanilla":674,"Icing sugar":1432,"Jam":676,"Jelly":680,"Kidney beans, canned":94,"Lamb chop, cooked":741,"Lasagne":765,"Leg of lamb, cooked":737,"Lemon juice":683,"Lettuce":779,"Lime juice":684,"Lychee":798,"Macadamia nuts":932,"Macaroni cheese":799,"Mango":810,"Maple syrup":1448,"Mayonnaise":821,"Milk chocolate":460,"Muesli":876,"Mushrooms":891,"Mustard":896,"Naan bread":230,"Nectarine":909,"Noodles, egg, cooked":914,"Olive oil":965,"Onion":982,"Oyster sauce":1301,"Pancakes":995,"Papaya":996,"Paprika":998,"Parsnip":1001,"Pasta, cooked":1009,"Pasta, dry":1017,"Peach":1044,"Peanut butter":1049,"Peanuts":1049,"Pear":1057,"Pine nuts":938,"Pineapple":1071,"Plain flour":612,"Plum":1090,"Pomegranate":1091,"Poppy seeds":1347,"Pork chop, cooked":1107,"Pork mince, raw":1139,"Potato chips":1163,"Potato, boiled":1171,"Potato, raw":1193,"Prawns, cooked":1196,"Prosciutto":1205,"Pumpkin seeds":1348,"Quinoa, cooked":1237,"Radish":1244,"Raisins":1245,"Red onion":979,"Red wine":1552,"Rice noodles, cooked":911,"Rye bread":239,"Salami":1279,"Salmon fillet, raw":1281,"Salmon, cooked":1289,"Salt":1291,"Sausage, pork, cooked":1331,"Scallops":1337,"Scrambled eggs":576,"Self-raising flour":617,"Sesame oil":970,"Sesame seeds":1349,"Soy sauce":1313,"Spinach":1405,"Spring onion":983,"Spring roll":1411,"Squid, raw":1419,"Stock cube":1422,"Strawberries":1428,"Sugar, white":1432,"Sunflower oil":972,"Sunflower seeds":1350,"Sweet potato, baked":1437,"Tahini":1452,"Tea with milk":1463,"Tea, black":1462,"Tofu, firm":1472,"Tomato":1473,"Tomato pasta sauce":1307,"Tuna, canned in water":1492,"Turkey breast, cooked":1496,"Venison, cooked":1530,"Water":1538,"Watercress":1540,"Whey protein powder":1207,"White bread":243,"White rice, cooked":1261,"White rice, raw":1262,"White wine":1560,"Wholemeal bread":257,"Wholemeal flour":616,"Worcestershire sauce":1295,"Yoghurt, natural":1576,"Zucchini":1584};
const AU_BLOB = coachData("AU_BLOB");

