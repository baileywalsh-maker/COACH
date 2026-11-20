// ============================================================
// Food scoring
// ============================================================
// Nutri-Score's own tables. Three of them, not one: using only the general
// table gave olive oil and milk the same grade as a Pot Noodle.
const NS_E    = [335,670,1005,1340,1675,2010,2345,2680,3015,3350];  // kJ / 100 g
const NS_SUG  = [4.5,9,13.5,18,22.5,27,31,36,40,45];                // g / 100 g
const NS_SAT  = [1,2,3,4,5,6,7,8,9,10];                             // g / 100 g
const NS_SOD  = [90,180,270,360,450,540,630,720,810,900];           // mg / 100 g
const NS_FIB  = [0.9,1.9,2.8,3.7,4.7];
const NS_PRO  = [1.6,3.2,4.8,6.4,8.0];
const NS_FV   = [40,60,80];
// Drinks score fruit content on their own scale in the published scheme:
// 0, 2, 4 then 10 points, not the food table's 0, 1, 2 then 5.
const NS_BFV_PTS = [0, 2, 4, 10];                                         // % fruit/veg/pulses/nuts
// Drinks are scored far harder, which is the whole reason a cola lands at E.
const NS_BE   = [0,30,60,90,120,150,180,210,240,270];
const NS_BSUG = [0,1.5,3,4.5,6,7.5,9,10.5,12,13.5];
// Added fats score saturated fat as a SHARE of total fat, not in grams.
const NS_SATR = [10,16,22,28,34,40,46,52,58,64];

// Foods measured in millilitres that are NOT drinks for scoring. Milk, cream
// and soup are liquid, but grading them against Coca-Cola's table is
// indefensible - it is what made whole milk come out an E. They go through the
// food table, which is where the 2023 revision of the scheme puts them too.
const NS_FOOD_TABLE = new Set([
  "Whole milk","Semi-skimmed milk","Skimmed milk","Kefir",
  // Drunk as milk, and judged as milk. Grading oat milk against Coca-Cola's
  // table put it at 29, which is the same mistake dairy milk was rescued from.
  "Oat milk","Almond milk, unsweetened","Soy milk, unsweetened","Soya milk",
  "Coconut milk drink","Rice milk","Cashew milk",
  "Double cream","Single cream","Heavy cream","Coconut cream","Half and half",
  "Coconut milk, canned","Evaporated milk","Condensed milk",
  "Soup, tomato","Soup, chicken","Miso soup","Cream of tomato soup",
  "Lentil soup","Chicken noodle soup","Minestrone","Soup and roll",
  "Tomato soup with bread"
]);

// Fruit, vegetable, pulse and nut content as a percentage, which is worth up
// to five positive points. Only single-ingredient whole foods are listed, and
// only where the figure is not a judgement call: a banana is 100% fruit.
// Mixed dishes are deliberately absent - guessing the vegetable content of a
// curry would flatter it, and the scheme is generous with these points.
//
// Potatoes and other starchy tubers are NOT here. The scheme excludes them by
// design, and chips scoring as a vegetable is exactly what that rule prevents.
const FV_DB = {
  "Broccoli":100,"Cauliflower":100,"Carrot":100,"Spinach":100,"Kale":100,
  "Courgette":100,"Zucchini":100,"Bell pepper":100,"Capsicum":100,"Tomato":100,
  "Cucumber":100,"Lettuce":100,"Onion":100,"Mushrooms":100,"Asparagus":100,
  "Green beans":100,"Sweetcorn, canned":100,"Avocado":100,"Pak choi":100,
  "Radish":100,"Turnip":100,"Swede":100,"Swede, mashed":100,"Parsnip":100,
  "Fennel":100,"Watercress":100,"Samphire":100,"Bean sprouts":100,
  "Artichoke hearts":100,"Roasted red peppers":100,"Eggplant":100,
  "Aubergine, grilled":100,"Cilantro":100,"Arugula":100,"Scallion":100,
  "Ginger, fresh":100,"Sun-dried tomatoes":100,"Chopped tomatoes, tinned":100,
  "Passata":100,"Tomato puree":100,"Olives, green":100,"Side salad":95,
  "Kimchi":90,"Sauerkraut":90,"Pickles":85,
  "Banana":100,"Apple":100,"Orange":100,"Strawberries":100,"Blueberries":100,
  "Raspberries":100,"Grapes":100,"Pineapple":100,"Mango":100,"Watermelon":100,
  "Kiwi":100,"Peach":100,"Pear":100,"Passion fruit":100,"Figs, fresh":100,
  "Papaya":100,"Lychee":100,"Nectarine":100,"Apricot, fresh":100,
  "Gooseberries":100,"Dates, medjool":100,"Raisins":100,"Goji berries":100,
  "Orange juice":100,"Apple juice":100,"Lemon juice":100,"Lime juice":100,
  "Coconut water":100,
  "Chickpeas, canned":100,"Kidney beans, canned":100,"Black beans, cooked":100,
  "Lentils, cooked":100,"Peas, frozen":100,"Edamame, salted":100,
  "Baked beans":50,"Dal":50,"Lentil soup":40,"Minestrone":40,
  "Almonds":100,"Walnuts":100,"Cashews":100,"Peanuts":100,"Pine nuts":100,
  "Chestnuts":100,"Cashew butter":100,"Peanut butter":90,
  // The scheme counts rapeseed, walnut and olive oil with the fruit and veg.
  "Olive oil":100,"Rapeseed oil":100
};

function nsPts(v, cuts){ let n = 0; for(const c of cuts) if(v > c) n++; return n; }

// A drink for scoring purposes. Dairy goes through the food table — the
// official scheme agrees, and scoring milk like a soft drink is indefensible.
// Nutri-Score scores beverages on a deliberately harsher table, so whether a
// food is a drink moves its grade by a long way. That has to be a fact about
// the FOOD, not about which measure you happen to be viewing it in.
//
// This used to read foodBasis(), which honours the "Measure in ml instead"
// toggle - so flipping a smoothie from g to ml moved it from B to E with
// nothing on screen to say the toggle had done it, under a button whose own
// comment promised it "changes the label and the quick picks, never the
// number". The food's own basis is what counts; the toggle is display only.
// A scanned "British Semi Skimmed Milk (Tesco)" is not in the list above by
// name, so it was graded against Coca-Cola's table and came out an E - the
// exact mistake the list exists to stop. The same foods are recognised by
// what they are called, whatever the brand.
const NS_FOOD_LIKE = /\b(milk|kefir|cream|soup|broth|custard|yogurt|yoghurt|lassi|skyr|quark)\b/i;
const NS_REAL_DRINK = /\b(milkshake|shake|smoothie|juice|coffee|latte|cappuccino|mocha|frappuccino|hot chocolate|chocolate milk|flavoured|flavored|strawberry|banana|energy|protein drink|liqueur|baileys)\b/i;
function nsIsDrink(f){
  if(!f) return false;
  if(f.dairy) return false;
  if(NS_FOOD_TABLE.has(f.name)) return false;
  const n = String(f.name || '');
  if(NS_FOOD_LIKE.test(n) && !NS_REAL_DRINK.test(n)) return false;
  return f.basis === 'ml';
}
// The scheme's cheese category. Matched on the food itself rather than on a
// keyword in a dish name, so "cheese and onion sandwich" is not a cheese.
const CHEESES = ['cheddar','parmesan','feta','brie','halloumi','mozzarella','gouda',
 'emmental','ricotta','mascarpone','camembert','wensleydale','red leicester','babybel',
 'blue cheese','goats cheese','cream cheese','cottage cheese','paneer','stilton',
 'cheese string','processed cheese'];
function nsIsCheese(f){
  const n = String((f && f.name) || '').toLowerCase();
  if(!n) return false;
  // Only when the cheese IS the food, not an ingredient in a named dish.
  if(/sandwich|toastie|melt|pizza|pasta|bake|sauce|salad|wrap|burger|roll/.test(n)) return false;
  return CHEESES.some(k=>n.indexOf(k) >= 0);
}

function nsIsAddedFat(f){
  return (f.f100||0) >= 50 && (f.p100||0) < 5 && (f.c100||0) < 10;
}

// Everything Nutri-Score needs. Anything missing comes back null so the caller
// can say so rather than treat it as zero — a missing sugar figure counted as
// zero would flatter almost every food in the table.
function nsInputs(f){
  if(!f) return null;
  const g = k => (f[k] === undefined || f[k] === null || isNaN(f[k])) ? null : Number(f[k]);
  const m = f.micros100 || {};
  const fib = (m.fiber !== undefined && m.fiber !== null) ? Number(m.fiber) : g('fib100');
  const sod = (m.sodium !== undefined && m.sodium !== null) ? Number(m.sodium) : g('sod100');
  return {
    kcal: g('kcal100'), pro: g('p100'), carb: g('c100'), fat: g('f100'),
    // Arithmetic, not estimation: a food with no carbohydrate has no sugar,
    // and a food with no fat has no saturated fat.
    sug: g('sug100') !== null ? g('sug100') : ((g('c100') === 0) ? 0 : null),
    sat: g('sat100') !== null ? g('sat100') : ((g('f100') === 0) ? 0 : null),
    fib: fib, sod: sod,
    fv: (f.fv100 === undefined || f.fv100 === null)
           ? (FV_DB[f.name] === undefined ? null : FV_DB[f.name])
           : Number(f.fv100)
  };
}
// What is actually missing, for the message. Only listed when its absence
// genuinely stops a score — a bounded figure is not missing in any way the
// user needs to act on.
function nsMissing(f){
  const i = nsInputs(f);
  if(!i || i.kcal === null) return ['everything'];
  const out = [];
  if(i.sug === null) out.push('sugar');
  if(i.sat === null) out.push('saturated fat');
  if(i.sod === null) out.push('salt');
  if(i.fib === null) out.push('fibre');
  return out;
}

function nsCompute(f, i, sug, sat, fib, drink){
  const neg = nsPts(i.kcal*4.184, drink ? NS_BE : NS_E)
            + nsPts(sug, drink ? NS_BSUG : NS_SUG)
            + (nsIsAddedFat(f) && i.fat > 0
                 ? nsPts(sat/i.fat*100, NS_SATR)
                 : nsPts(sat, NS_SAT))
            + nsPts(i.sod, NS_SOD);
  const fibP = nsPts(fib, NS_FIB);
  const fvP  = i.fv === null ? 0
             : drink ? NS_BFV_PTS[nsPts(i.fv, NS_FV)]
             : (i.fv > 80 ? 5 : nsPts(i.fv, NS_FV));
  const proP = nsPts(i.pro||0, NS_PRO);
  // The rule that stops a salty, fatty product buying its way back with
  // protein. Without it, processed meat scores like chicken.
  // The published scheme makes one exception to this rule, and it is for cheese:
  // protein counts however high the negatives are. Missing it had every hard
  // cheese scoring in the teens under a rule that does not apply to them.
  const pos = fibP + fvP + ((neg < 11 || nsIsCheese(f)) ? proP : 0);
  return { score: neg - pos, neg: neg, fibP: fibP, fvP: fvP, proP: proP, drink: drink };
}

// Where a figure is missing, BOUND it instead of inventing it. A food cannot
// hold more sugar than it holds carbohydrate, more saturated fat than fat, or
// more fibre than carbohydrate — that is arithmetic, not estimation. Score the
// food at both extremes; if the grade is the same either way, the grade is
// proven and can be shown. If the two disagree, the app says it does not know.
//
// This is what lets a broccoli score: its 0.4 g of fat cannot carry enough
// saturated fat to move it off an A, whatever the true figure is.
function nutriScore(f){
  const i = nsInputs(f);
  if(!i || i.kcal === null) return null;
  if(i.sod === null) return null;              // salt has no macro to bound it
  const carb = i.carb === null ? null : Math.max(0, i.carb);
  const fat  = i.fat  === null ? null : Math.max(0, i.fat);
  if(i.sug === null && carb === null) return null;
  if(i.sat === null && fat  === null) return null;
  if(i.fib === null && carb === null) return null;
  const drink = nsIsDrink(f);

  const sugLo = i.sug === null ? 0 : i.sug, sugHi = i.sug === null ? carb : i.sug;
  const satLo = i.sat === null ? 0 : i.sat, satHi = i.sat === null ? fat  : i.sat;
  const fibLo = i.fib === null ? 0 : i.fib, fibHi = i.fib === null ? carb : i.fib;

  const best  = nsCompute(f, i, sugLo, satLo, fibHi, drink);   // kindest reading
  const worst = nsCompute(f, i, sugHi, satHi, fibLo, drink);   // harshest
  if(nsGrade(best.score, drink) !== nsGrade(worst.score, drink)) return null;
  const exact = (i.sug !== null && i.sat !== null && i.fib !== null);
  // Take the harsher end, so an unknown never flatters a food.
  return Object.assign({}, worst, { bounded: !exact });
}

// What can be proved when the grade itself cannot be. Returns null when there
// is nothing to say - either the food scores exactly (nutriScore already
// published it) or too much is missing to bound it at all.
function nutriRange(f){
  const i = nsInputs(f);
  if(!i || i.kcal === null || i.sod === null) return null;
  const carb = i.carb === null ? null : Math.max(0, i.carb);
  const fat  = i.fat  === null ? null : Math.max(0, i.fat);
  if(i.sug === null && carb === null) return null;
  if(i.sat === null && fat  === null) return null;
  if(i.fib === null && carb === null) return null;
  const drink = nsIsDrink(f);
  const best  = nsCompute(f, i, i.sug===null?0:i.sug,    i.sat===null?0:i.sat,    i.fib===null?carb:i.fib, drink);
  const worst = nsCompute(f, i, i.sug===null?carb:i.sug, i.sat===null?fat:i.sat,  i.fib===null?0:i.fib,    drink);
  const a = nsGrade(best.score, drink), b = nsGrade(worst.score, drink);
  if(a === b) return null;
  const order = 'ABCDE';
  return order.indexOf(a) < order.indexOf(b) ? {lo:a, hi:b} : {lo:b, hi:a};
}

const NS_BANDS  = [[0,'A'],[2,'B'],[10,'C'],[18,'D']];
const NS_BANDS_D= [[-1,'A'],[1,'B'],[5,'C'],[9,'D']];
const NS_SPAN   = {A:[85,100], B:[70,84], C:[50,69], D:[30,49], E:[0,29]};
const NS_RANGE  = {A:[-15,0],  B:[1,2],   C:[3,10],  D:[11,18], E:[19,40]};
const NS_RANGE_D= {A:[-15,-1], B:[0,1],   C:[2,5],   D:[6,9],   E:[10,40]};
function nsGrade(score, drink){
  for(const [cut, g] of (drink ? NS_BANDS_D : NS_BANDS)) if(score <= cut) return g;
  return 'E';
}
// A 0-100 read-off inside each grade, so the number has resolution rather
// than five steps — but the grade is still the thing that is defensible.
function nsTo100(score, grade, drink){
  const [lo, hi] = (drink ? NS_RANGE_D : NS_RANGE)[grade];
  const [a, b] = NS_SPAN[grade];
  const t = hi === lo ? 0 : Math.max(0, Math.min(1, (score - lo)/(hi - lo)));
  return Math.round(b - t*(b - a));
}

// Additives with a documented position behind them. Short on purpose.
const ADDITIVE_FLAGS = {
  'e102':['Tartrazine','EU law requires a warning about children\u2019s attention'],
  'e104':['Quinoline yellow','EU law requires a warning about children\u2019s attention'],
  'e110':['Sunset yellow','EU law requires a warning about children\u2019s attention'],
  'e122':['Carmoisine','EU law requires a warning about children\u2019s attention'],
  'e124':['Ponceau 4R','EU law requires a warning about children\u2019s attention'],
  'e129':['Allura red','EU law requires a warning about children\u2019s attention'],
  'e171':['Titanium dioxide','Banned as a food additive in the EU since 2022'],
  'e249':['Potassium nitrite','Nitrites are the basis of the processed-meat warning'],
  'e250':['Sodium nitrite','Nitrites are the basis of the processed-meat warning'],
  'e251':['Sodium nitrate','Nitrates are the basis of the processed-meat warning'],
  'e252':['Potassium nitrate','Nitrates are the basis of the processed-meat warning'],
  'e320':['BHA','Classed by IARC as possibly carcinogenic'],
  'e321':['BHT','Under review by several agencies'],
  'e951':['Aspartame','IARC group 2B (2023) \u2014 contested, and worth knowing'],
};
// "en:e150d" -> "e150d" -> the base code, since OFF tags carry suffixes.
function additiveCode(tag){
  const t = String(tag||'').toLowerCase().replace(/^[a-z]{2}:/, '');
  const m = /^e\d+/.exec(t);
  return m ? m[0] : t;
}
function additivesOf(f){
  const list = (f && f.additives) || [];
  const flagged = [], other = [];
  list.forEach(tag=>{
    const c = additiveCode(tag);
    if(ADDITIVE_FLAGS[c]) flagged.push({code:c, name:ADDITIVE_FLAGS[c][0], why:ADDITIVE_FLAGS[c][1]});
    else other.push(c.toUpperCase());
  });
  return {flagged: flagged, other: other, count: list.length};
}
// Capped, and only for the flagged ones. A long ingredients list is not a
// health verdict; a legally required warning is a different thing.
function additivePenalty(f){
  const a = additivesOf(f);
  return a.flagged.length ? -Math.min(10, 4 * a.flagged.length) : 0;
}

// ---------------------------------------------------------------- health v2
// Nutrient reference values, EU Regulation 1169/2011 Annex XIII. The same法
// thresholds that govern what a packet is allowed to claim: 15% of the
// reference is "a source of", 30% is "high in".
const NRV = {
  potassium:3500, calcium:800, iron:14, magnesium:375, zinc:10, phosphorus:700,
  selenium:55, copper:1, manganese:2,
  'vitamin-a':800, 'vitamin-c':80, 'vitamin-d':5, 'vitamin-e':12, 'vitamin-k':75,
  'vitamin-b1':1.1, 'vitamin-b2':1.4, 'vitamin-pp':16, 'vitamin-b6':1.4,
  'vitamin-b9':200, 'vitamin-b12':2.5
};
// Fibre is deliberately absent: Nutri-Score already scores it, and counting it
// here as well was double-counting in the first draft.
//
// Measured PER 100 kcal rather than per 100 g, so nothing earns the credit
// merely by being calorie-dense. Returns null when the food has no
// micronutrient data at all, which the panel says out loud rather than
// silently treating as "none".
function microCredit(f){
  if(!f || !(f.kcal100 > 0)) return null;
  const m = f.micros100 || {};
  const per = 100 / f.kcal100;
  let known = false, src = 0, high = 0, src100 = 0, high100 = 0;
  const hits = [];
  for(const k in NRV){
    const v = m[k];
    if(v === undefined || v === null) continue;
    known = true;
    const pct = (v * per) / NRV[k] * 100;
    if(pct >= 30){ high++; hits.push({k:k, pct:pct, high:true}); }
    else if(pct >= 15){ src++; hits.push({k:k, pct:pct, high:false}); }
    // The other way of asking the same question, and the one the law uses on
    // a packet: how much is in 100 g of it. Per 100 kcal on its own punished
    // dense foods - 100 g of cheddar is most of a day's calcium and scored
    // almost nothing for it. This route is worth half as much, so a calorie
    // bomb still cannot buy a good score with one mineral.
    const pct100 = v / NRV[k] * 100;
    if(pct100 >= 30) high100++;
    else if(pct100 >= 15) src100++;
  }
  if(!known) return null;
  hits.sort((a,b)=>b.pct - a.pct);
  // Deliberately tighter than the first draft, so that reaching 100 stays rare
  // and means something.
  const byKcal = Math.min(15, high*4 + src*2);
  const byWeight = Math.min(7, Math.round((high100*4 + src100*2) / 2));
  return { v: Math.max(byKcal, byWeight), hits: hits, byWeight: byWeight > byKcal };
}

// Nutri-Score does not grade alcoholic drinks, and neither should COACH: the
// scale has nothing in it for the alcohol, so a pint came out an A on its
// sugar and salt alone.
const ALCOHOL_DRINK = /\b(beer|lager|ale|stout|cider|wine|prosecco|champagne|vodka|gin|whisky|whiskey|rum|tequila|brandy|liqueur|spirit|cocktail|mojito|martini|spritz|sangria|shandy|port|sherry|alcopop|guinness|stella|carling|heineken|corona|peroni|brewdog|strongbow|kopparberg|smirnoff)\b/i;
// Words that borrow a drink's name without being one. "Ginger beer" is a soft
// drink, apple cider vinegar is a vinegar, a steak and ale pie is a pie - and
// alcohol carries the harshest penalty in the score, so a false positive here
// is expensive.
const NOT_REALLY_BOOZE = /\b(vinegar|ginger beer|root beer|dandelion|burdock|gums?|pie|pies|sauce|gravy|ice cream|sorbet|cake|trifle|battered|bread|braised|marinade|flavour\w*|flavor\w*|cheese|salt|bitters|mocktail)\b/i;
function isAlcohol(f){
  const n = String((f && f.name) || '');
  if(!n) return false;
  if(/\b(free|0%|zero|non[- ]alcoholic|alcohol[- ]free)\b/i.test(n)) return false;
  if(NOT_REALLY_BOOZE.test(n)) return false;
  if(f && f.micros100 && f.micros100['off:alcohol_100g'] > 1.2) return true;
  return ALCOHOL_DRINK.test(n);
}

// Guidance targets the RATIO - replace saturated with unsaturated (SACN 2019,
// WHO 2023) - and Nutri-Score never looks at it, so butter and olive oil come
// out far closer than they should. Needs no new data.
function fatQuality(f){
  if(!f || f.f100 == null || f.sat100 == null) return 0;
  if(f.f100 < 3) return 0;                       // too little fat to judge
  const share = Math.max(0, Math.min(1, f.sat100 / f.f100));
  return Math.max(-8, Math.min(8, Math.round(8 - 16*share)));
}

// NOVA (Monteiro et al.), the classification Open Food Facts uses. Applied
// MULTIPLICATIVELY so a penalty cannot drive a food to an absurd number and the
// ordering within a group survives.
const NOVA4 = ['crisps','nugget','sausage roll','pot noodle','cereal bar','protein bar',
 'energy drink','coca-cola','coke','pepsi','lucozade','ribena','sweets','haribo','mars bar',
 'snickers','twix','kitkat','oreo','biscuit','doughnut','cake','muffin','margarine',
 'processed cheese','hot dog','pepperoni','salami','chorizo','prosciutto','corned beef',
 'stock cube','mayonnaise','ketchup','barbecue sauce','sweet chilli','pringles','doritos',
 'monster','red bull','gatorade','mcflurry','frappuccino','milk chocolate','ice cream',
 'instant','wotsits','hula hoops','quavers','jaffa','bacon','sausage','ham, sliced',
 'black pudding','pork scratchings','beef jerky','turkey rasher','flapjack','granola bar',
 // Named biscuits, puddings and drinks that carry no word the list above
 // caught. A chocolate digestive was reading as an untouched whole food.
 'digestive','rich tea','hobnob','shortbread','wafer','jammie','custard cream','bourbon cream',
 'cookie','brownie','cheesecake','trifle','jelly','sticky toffee','waffle','ice lolly',
 'marshmallow','fudge','toffee','candy','gummy','chewing gum','prawn cracker',
 'protein powder','whey isolate','whey protein','casein','mass gainer','bcaa','creatine',
 'electrolyte tablet','meal replacement','protein shake','protein pudding','protein yogurt',
 'stevia','sweetener','gelatine','stuffing mix','crouton','worcestershire','oyster sauce',
 'teriyaki','hoisin','tartare','ranch dressing','caesar dressing','salad cream','soda',
 'french fries','potato chips','scotch egg','pork pie','cornish pasty','banana chips',
 'nuggets','kebab','loaded fries','veggie burger','steak bake','pot noodle','bovril',
 // Brands whose names say nothing about what they are.
 'nutella','dairy milk','galaxy','maltesers','bounty','milkybar','yum yum','mccoy',
 'nature valley','belvita','mr kipling','angel slice','pringle','monster munch',
 'cheeseburger','burger','frappe','hot chocolate','milkshake','slush','squash, orange',
 'smoothie, fruit','innocent','ribena','fruit shoot','nesquik','horlicks','ovaltine',
 // Breakfast cereals: flaked, puffed or extruded and then fortified.
 'cornflakes','corn flakes','rice krispies','coco pops','frosties','crunchy nut','special k',
 'cheerios','shreddies','bran flakes','crunchy oat','breakfast cereal'];
const NOVA3 = ['bread','cheese','tinned','canned','pickle','olives','smoked','cured',
 'sourdough','bagel','pitta','tortilla','baked beans','granola','muesli','ham','jam',
 'dark chocolate','chocolate, dark','cacao nibs','cocoa powder',
 // Cheeses whose names do not contain the word "cheese", which had them
 // classified as untouched whole foods.
 'parmesan','feta','brie','halloumi','mozzarella','cheddar','gouda','emmental',
 'ricotta','mascarpone','camembert','wensleydale','babybel','paneer','stilton',
 // Made by fermenting, curing, tinning or drying a whole food: processed, but
 // not built in a factory out of ingredients you would not have at home.
 'beer','lager','ale','stout','cider','wine','prosecco','breadstick','panko','poppadom',
 'condensed milk','evaporated milk','coconut water','cranberries, dried','kefir','quark',
 'cranberry sauce','apple sauce','cheesy chips','chip butty','pie and mash','custard',
 'red leicester','weetabix','wheat biscuit','shredded wheat','porridge oats','oatcake',
 'pesto','double cream','single cream','heavy cream','soured cream',
 'creme fraiche','mascarpone','clotted cream','juice'];
// Group 2 is culinary ingredients - oil, butter, sugar, flour. Not penalised:
// olive oil is not junk food, and the evidence is about ULTRA-processing.
const NOVA2 = ['oil','butter','sugar','honey','syrup','ghee','lard','salt','flour','vinegar'];
// Foods whose name contains an ultra-processed word but which are not: a rice
// cake is not a cake, an English muffin is bread. Checked FIRST.
const NOVA_EXCEPT = [
  ['rice cake', 2], ['oatcake', 3], ['english muffin', 3], ['muffin, blueberry', 4],
  ['fish cake', 3], ['cottage cheese', 3], ['cream cheese', 3],
  // A dish that happens to contain a processed ingredient is not itself
  // ultra-processed. Checked before the keyword pass, which was reading the
  // "bacon" in "chicken and bacon salad".
  ['salad', 3], ['croissant', 3], ['pain au chocolat', 4]
];
// Multi-word keys still match as phrases; single words must match whole, so
// "cake" no longer fires inside "rice cake".
/* v112: this built a brand-new pattern for every keyword on every call - a
   couple of hundred per food, for every food on every screen that scores
   anything. It was most of the wait on the Data screen and the reviews. Each
   pattern is now made once and kept. Same answers, a fraction of the work. */
const NOVA_RE = {};
function novaHas(n, k){
  if(k.indexOf(' ') >= 0 || k.indexOf(',') >= 0 || k.indexOf('-') >= 0) return n.indexOf(k) >= 0;
  const re = NOVA_RE[k] || (NOVA_RE[k] = new RegExp('(^|[^a-z])' + k + '($|[^a-z])'));
  return re.test(n);
}
// One pass per list answers "does anything in it match", which is all the
// group needs. Built from the same keywords by the same rule, so it cannot
// disagree with the keyword-by-keyword check.
const NOVA_ANY = {};
function novaAny(n, list, tag){
  let c = NOVA_ANY[tag];
  if(!c){
    const words = [], phrases = [];
    list.forEach(k=>{ (k.indexOf(' ') >= 0 || k.indexOf(',') >= 0 || k.indexOf('-') >= 0 ? phrases : words).push(k); });
    const esc2 = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    c = NOVA_ANY[tag] = {
      re: words.length ? new RegExp('(^|[^a-z])(' + words.map(esc2).join('|') + ')($|[^a-z])') : null,
      phrases: phrases
    };
  }
  if(c.re && c.re.test(n)) return true;
  for(let i = 0; i < c.phrases.length; i++) if(n.indexOf(c.phrases[i]) >= 0) return true;
  return false;
}
// The answer for a name never changes, so it is worked out once per name.
const NAME_MEMO_MAX = 6000;
function nameMemo(fn){
  let m = new Map();
  return function(name){
    const k = String(name || '');
    if(m.has(k)) return m.get(k);
    const v = fn(k);
    if(m.size >= NAME_MEMO_MAX) m = new Map();
    m.set(k, v);
    return v;
  };
}
/* ---- how COACH decides a food is ultra-processed, and how you overrule it ----
   The old answer was a keyword list and nothing else, which had two failures
   you could drive a bus through. A brand it had never heard of - Kinder Bueno -
   came out GROUP 1, untouched whole food, and scored better than honey. And
   when it did call something ultra-processed, there was no way to see why or
   to say otherwise.

   Now there are four sources, in order, and the panel names the one it used:
     1. yours     - you told it, and that is final
     2. off       - Open Food Facts worked it out from the ingredients list
     3. keyword   - the name says what it is ("crisps", "sausage roll")
     4. numbers   - nothing recognised the name, so the composition is asked:
                    energy-dense, sugary or fatty, and no fibre to speak of is
                    what a factory food looks like on paper
   And where even that says nothing, the answer is "not sure", which is
   treated as lightly processed rather than as a clean whole food. Unknown
   must never be the best case: that is what let an unknown chocolate bar beat
   an apple.                                                                  */
function novaWhy(name){ const r = novaWhyMemo(name); return r ? {g: r.g, word: r.word} : null; }
const novaWhyMemo = nameMemo(novaWhyRaw);
function novaWhyRaw(name){
  const n = String(name || '').toLowerCase();
  for(const pair of NOVA_EXCEPT) if(n.indexOf(pair[0]) >= 0) return {g: pair[1], word: pair[0]};
  if(novaAny(n, NOVA4, '4')) for(const k of NOVA4) if(novaHas(n, k)) return {g: 4, word: k};
  if(novaAny(n, NOVA3, '3')) for(const k of NOVA3) if(novaHas(n, k)) return {g: 3, word: k};
  if(novaAny(n, NOVA2, '2')) for(const k of NOVA2) if(novaHas(n, k)) return {g: 2, word: k};
  return null;
}
// What a factory food looks like in numbers alone. Deliberately blunt, only
// ever used when nothing else knows, and always shown on screen as a guess.
function novaFromNumbers(f){
  if(!f || !(f.kcal100 > 0)) return null;
  const sug = Number(f.sug100) || 0, fat = Number(f.f100) || 0;
  const fib = (f.micros100 && f.micros100.fiber != null) ? Number(f.micros100.fiber) : null;
  const sod = (f.micros100 && f.micros100.sodium != null) ? Number(f.micros100.sodium) : null;
  const dense = f.kcal100 >= 350;
  const sugary = sug >= 20, fatty = fat >= 17, lowFibre = (fib != null && fib < 3);
  if(dense && sugary && fatty) return {g: 4, why: 'sugar and fat together at ' + Math.round(sug) + ' g and ' + Math.round(fat) + ' g per 100 g'};
  if(dense && sugary && lowFibre) return {g: 4, why: Math.round(sug) + ' g of sugar per 100 g and almost no fibre'};
  if(sod != null && sod >= 700 && dense) return {g: 4, why: 'energy-dense and very salty'};
  return null;
}
function novaFor(food){
  const name = String((food && food.name) || '');
  // 1. yours
  const L = (typeof labelFor === 'function') ? labelFor(name) : null;
  if(L && L.nova >= 1 && L.nova <= 4) return {g: L.nova, src: 'yours', why: 'you set this yourself'};
  // 2. the ingredients list, where a scan brought one
  if(food && food.novaOverride >= 1 && food.novaOverride <= 4){
    return {g: food.novaOverride, src: 'off',
            why: 'Open Food Facts worked this out from the ingredients on the packet'};
  }
  // 3. the name
  const w = novaWhy(name);
  if(w) return {g: w.g, src: 'keyword', why: 'the name says “' + w.word + '”'};
  // 3b. the plain food this was matched to. A scanned "Tesco British Semi
  // Skimmed Milk" is milk, and milk is not a factory food.
  if(food && food.gapFill && food.gapFill.name){
    const mw = novaWhy(food.gapFill.name);
    if(mw) return {g: mw.g, src: 'match',
                   why: 'matched to “' + food.gapFill.name + '”, which is ' +
                        (mw.g === 4 ? 'ultra-processed' : mw.g === 3 ? 'processed' :
                         mw.g === 2 ? 'a cooking ingredient' : 'a whole food')};
    if(typeof localRowByName === 'function' && localRowByName(food.gapFill.name)){
      return {g: 1, src: 'match', why: 'matched to “' + food.gapFill.name + '”, a plain food'};
    }
  }
  // 3c. COACH's own list is curated: if it is in there and no keyword fired,
  // it is a plain food, not something a factory built.
  if((food && food.src === 'local') || (typeof localRowByName === 'function' && localRowByName(name))){
    return {g: 1, src: 'builtin', why: 'one of COACH\u2019s own plain foods'};
  }
  // 4. the numbers
  const byNum = novaFromNumbers(food);
  if(byNum) return {g: byNum.g, src: 'numbers', why: 'nothing recognised the name, and the numbers look like a factory food: ' + byNum.why};
  // 5. not sure. Treated as processed, never as untouched.
  return {g: 3, src: 'unsure', why: 'COACH does not recognise this food, so it is treated as processed rather than assumed to be whole'};
}
function novaGroupOf(food){ return novaFor(food).g; }

function novaGroup(name){ return novaGroupMemo(name); }
const novaGroupMemo = nameMemo(novaGroupRaw);
function novaGroupRaw(name){
  const n = String(name||'').toLowerCase();
  for(const pair of NOVA_EXCEPT) if(n.indexOf(pair[0]) >= 0) return pair[1];
  if(novaAny(n, NOVA4, '4')) return 4;
  if(novaAny(n, NOVA3, '3')) return 3;
  if(novaAny(n, NOVA2, '2')) return 2;
  return 1;
}
// Ultra-processing is the part of the evidence the published grade does not
// look at at all (Srour 2019, Fiolet 2018, Hall 2019), so it is the part COACH
// adds. A fifth off, not a fifth of a point.
const NOVA_MULT = {1:1, 2:1, 3:0.95, 4:0.72};

// FAO DIAAS / PDCAAS by food class. Nutri-Score counts protein by weight, so 20 g
// of wheat protein scored exactly like 20 g of whey.
const DIAAS = [
  [['whey','casein','milk','yogurt','yoghurt','skyr','quark','kefir','cheese','egg'], 1.10],
  [['chicken','turkey','beef','pork','lamb','steak','mince','fish','salmon','tuna','cod',
    'prawn','haddock','mackerel','sardine','duck','venison','liver','ham','bacon'], 1.00],
  [['soy','tofu','tempeh','edamame','quorn'], 0.90],
  [['lentil','bean','chickpea','pea','hummus','dal','falafel'], 0.70],
  [['nut','almond','cashew','walnut','peanut','seed','tahini'], 0.55],
  [['bread','pasta','rice','oat','cereal','flour','couscous','noodle','wheat'], 0.50]
];
function proteinQuality(name, f){
  if(!f || !(f.kcal100 > 0)) return 0;
  const p = f.p100 || 0;
  if(p <= 0) return 0;
  const density = p * 100 / f.kcal100;
  if(density < 4) return 0;                      // not a protein food; quality is moot
  const n = String(name||'').toLowerCase();
  let d = null;
  for(const pair of DIAAS){ if(pair[0].some(k=>n.indexOf(k)>=0)){ d = pair[1]; break; } }
  if(d === null) return 0;
  return Math.round(8 * Math.min(1,(d-0.4)/0.7) * Math.min(1, density/10));
}

// SACN and WHO guidance is about FREE sugars - added sugar plus honey, syrups
// and juice. Sugars inside whole fruit, veg and milk are not free. Nutri-Score
// counts total, which is why plain yoghurt and fruit are penalised for it.
/* ---- free sugar, or sugar that came wrapped in a food ----
   The health difference is not fructose against glucose. Table sugar is half
   of each, and so is an apple. What separates them is whether the sugar is
   FREE - added, or in honey, syrup or juice, with nothing slowing it down -
   or INTRINSIC, still inside the cell walls of a whole food, packaged with
   fibre and water. That is the split WHO and SACN limit, and it is the one
   that moves health outcomes.

   Dried fruit is intrinsic under both definitions, even at 60 g of sugar per
   100 g. Fruit JUICE is free, because crushing it releases the sugar.

   The old version matched bare substrings in two flat lists, which made
   "Pepperoni" match "pepper" and collect a fruit-sugar bonus, and made
   "Butternut squash" match "squash" the soft drink and get penalised as if it
   were pure syrup. These rules are ordered, most specific first, and each one
   is anchored to whole words.                                              */
const FREE_RULES = [
  // --- exceptions, first, because they are the ones a loose match eats ---
  // The name is normalised to spaces before these run, so the comma in
  // "Squash, butternut" is already gone - matching on one would never fire.
  {f:0, re:/\b(butternut|acorn|spaghetti|crookneck|summer|winter)\s+squash\b/},
  {f:0, re:/\bsquash\s+(butternut|acorn|spaghetti)\b/},
  {f:1, re:/\bpepperoni\b/},                    // not a pepper; settled before produce
  {f:1, re:/\bpepper\s*(sauce|relish|jelly)\b/},

  // --- unambiguously free: added, or released from the food ---
  {f:1, re:/\b(sugar|sugars|sucrose|glucose|dextrose|fructose|maltodextrin|syrup|molasses|treacle|honey|agave|nectar)\b/},
  {f:1, re:/\b(juice|juices|smoothie|squash|cordial|nectar)\b/},
  {f:1, re:/\b(jam|marmalade|conserve|jelly|compote|curd)\b/},
  {f:1, re:/\b(cola|lemonade|tonic|soda|pop|energy drink|sports drink|iced tea|milkshake|frappe|frappuccino)\b/},
  {f:1, re:/\b(sweets|candy|haribo|gummy|gummies|liquorice|licorice|toffee|fudge|caramel|marshmallow|nougat|praline)\b/},
  {f:1, re:/\b(chocolate|choc|cocoa)\b/},
  {f:1, re:/\b(biscuit|biscuits|cookie|cookies|digestive|shortbread|wafer|flapjack)\b/},
  {f:1, re:/\b(cake|cakes|brownie|muffin|doughnut|donut|pastry|pastries|croissant|danish|scone|eclair|tart|pie|crumble|cheesecake|trifle|pudding)\b/},
  {f:1, re:/\b(ice cream|gelato|sorbet|sherbet|frozen yogurt|froyo)\b/},
  {f:1, re:/\b(ketchup|barbecue sauce|bbq sauce|sweet chilli|sweet and sour|hoisin|teriyaki|brown sauce|sriracha|relish|chutney|glaze|marinade|salad cream|worcestershire|oyster sauce|mint sauce|plum sauce|cranberry sauce|apple sauce|tartare|burger sauce|dipping sauce)\b/},
  {f:1, re:/\b(granola|muesli|cereal bar|granola bar|protein bar|energy bar|breakfast bar)\b/},
  {f:1, re:/\b(cornflakes|frosties|coco pops|rice krispies|shreddies|weetabix|cheerios|crunchy nut|special k)\b/},
  {f:1, re:/\b(condensed milk|evaporated milk|hot chocolate|malted drink|horlicks|ovaltine)\b/},
  {f:1, re:/\b(custard|angel delight|instant whip|mousse|panna cotta|creme brulee|rice pudding|semolina)\b/},
  {f:1, re:/\b(brioche|teacake|hot cross bun|bun|buns|iced finger|yum yum|jam roly|swiss roll|battenberg)\b/},
  // A gainer or meal-replacement powder is sugar with protein in it. Named
  // rather than left to NOVA, which calls half of these group 1 by name.
  {f:1, re:/\b(mass gainer|weight gainer|gainer|meal replacement|slim ?fast|complan|build ?up)\b/},
  {f:1, re:/\b(liqueur|cider|alcopop|cocktail|mojito|daiquiri|spritz|martini|sangria|punch)\b/},
  {f:1, re:/\b(yogurt|yoghurt)\b.*\b(fruit|strawberry|vanilla|flavour|flavored|flavoured|drink|corner)\b/},
  {f:1, re:/\b(fruit|strawberry|vanilla|chocolate)\b.*\b(yogurt|yoghurt)\s*(drink|smoothie)\b/},

  // --- intrinsic: whole foods, and milk ---
  // Dried fruit included on purpose. WHO and SACN both exclude it from free
  // sugars; only juice and puree are caught. Its calorie density is what
  // keeps it honest, not a sugar penalty.
  {f:0, re:/\b(apple|apples|banana|bananas|orange|oranges|pear|pears|peach|peaches|plum|plums|apricot|apricots|grape|grapes|mango|mangoes|melon|watermelon|kiwi|pineapple|papaya|lychee|nectarine|fig|figs|pomegranate|guava|persimmon|passion fruit|clementine|satsuma|tangerine|mandarin)\b/},
  {f:0, re:/\b(strawberr\w*|blueberr\w*|raspberr\w*|blackberr\w*|cranberr\w*|gooseberr\w*|redcurrant|blackcurrant|berries|berry)\b/},
  {f:0, re:/\b(date|dates|raisin|raisins|sultana|sultanas|prune|prunes|currants)\b/},
  {f:0, re:/\b(carrot|carrots|tomato|tomatoes|onion|onions|pepper|peppers|capsicum|beetroot|parsnip|swede|turnip|sweetcorn|corn|pea|peas|squash|pumpkin|courgette|aubergine|eggplant)\b/},
  {f:0, re:/\b(broccoli|spinach|cabbage|kale|lettuce|cucumber|celery|leek|cauliflower|sprouts|asparagus|greens)\b/},
  {f:0, re:/\b(sweet potato|potato|potatoes|yam)\b/},
  {f:0, re:/\b(milk|skyr|quark|kefir|buttermilk)\b/},
  {f:0, re:/\b(yogurt|yoghurt)\b/},             // after the flavoured rule above
  {f:0, re:/\b(cherry|cherries|blackcurrant|elderberry|damson|greengage|rhubarb)\b/},
  // Whole nuts and seeds: what little sugar they carry is intrinsic.
  {f:0, re:/\b(almond|almonds|walnut|walnuts|cashew|cashews|pistachio|pistachios|hazelnut|hazelnuts|pecan|pecans|chestnut|chestnuts|macadamia|brazil nut|peanut|peanuts|pine nut|nuts|seed|seeds)\b/},
  {f:0, re:/\b(oats|oatmeal|porridge)\b/}
];

function freeSugarFraction(name){ return freeSugarMemo(name); }
const freeSugarMemo = nameMemo(freeSugarFractionRaw);
function freeSugarFractionRaw(name){
  const n = ' ' + String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ';
  for(const r of FREE_RULES) if(r.re.test(n)) return r.f;
  // Nothing recognised. Ultra-processed food is overwhelmingly added sugar, so
  // that is a safe fallback for FREE. There is deliberately no matching
  // fallback for intrinsic: being wrong the other way hands out a bonus that
  // was not earned, and NOVA by name calls Cornflakes and brown sauce group 1.
  if(typeof novaGroup === 'function' && novaGroup(name) === 4) return 1;
  return null;                                   // unknown: no correction at all
}

/* Unknown used to mean "no limit at all", which rewarded COACH not knowing a
   food: 45 g of sugar per 100 g cost a Kinder Bueno nothing, while honey - a
   food COACH understands perfectly - took the full hit. The honest reading of
   an unknown is the harsh one, the same convention the bounded Nutri-Score
   already uses, and the panel says out loud that it assumed.                 */
function freeSugarFractionFor(f){
  /* v95: you get the last word. Assuming every unknown sugar is added is the
     right default - it is what stopped a chocolate bar scoring well on COACH
     not knowing it - but it is brutal on the case it cannot tell apart: the
     lactose in a milk it has never heard of, or the fruit in an own-brand
     smoothie. Saying which it is takes one tap, and after that it is a fact
     rather than an assumption. */
  const L = (typeof labelFor === 'function' && f && f.name) ? labelFor(f.name) : null;
  if(L && L.free != null && L.free >= 0 && L.free <= 1){
    return {frac: L.free, assumed: false, yours: true};
  }
  const known = freeSugarFraction((f && f.name) || '');
  if(known !== null) return {frac: known, assumed: false};
  /* v95: an assumption should not cost as much as a fact. This used to charge
     an unrecognised food for every gram of its sugar as though it were added,
     which is what took a plate of porridge, banana and an own-brand milk down
     by half - the lactose was being read as syrup.

     Halving it does NOT let the chocolate bar back in: a bar reads as group 4
     from its own numbers, and group 4 returns a KNOWN fraction of 1 above,
     never reaching this line. This is only for the genuinely ambiguous, where
     the honest position is that COACH does not know - and where one tap now
     settles it either way. */
  return {frac: 0.5, assumed: true};
}

function freeSugarAdjust(name, f){
  const frac = freeSugarFraction(name);
  if(frac === null || !f || f.sug100 == null) return 0;
  const free = f.sug100 * frac;
  // Re-score only the sugar component with the correct input and take the
  // difference, so the correction is the published table, correctly fed.
  return Math.max(-8, Math.min(8, (nsPts(f.sug100, NS_SUG) - nsPts(free, NS_SUG)) * 2));
}

/* ---- the dairy matrix ----
   Saturated fat inside cheese does not behave like the same fat in butter.
   Feeding trials and meta-analyses (Hjerpsted 2011, de Goede 2015, Feeney
   2018, and SACN's 2019 review) keep finding a smaller effect on LDL, and no
   raised heart-disease risk for cheese and yoghurt. Nutri-Score counts the
   grams and stops there, which is how mature cheddar came out below a bag of
   crisps. So COACH shows the published figure AND a line for this, rather
   than quietly rewriting the grade: the credit is the difference the published
   scale itself gives when that saturated fat is counted at two thirds.       */
const DAIRY_MATRIX = /\b(cheese|cheddar|parmesan|feta|brie|halloumi|mozzarella|gouda|emmental|ricotta|camembert|wensleydale|paneer|stilton|leicester|yogurt|yoghurt|skyr|quark|kefir|curd)\b/i;
function dairyMatrixCredit(f, ns){
  if(!f || !ns || !ns.score && ns.score !== 0) return 0;
  const n = String(f.name || '');
  if(!DAIRY_MATRIX.test(n)) return 0;
  if(novaGroupOf(f) === 4) return 0;   // not a processed cheese slice
  const i = nsInputs(f);
  if(!i || i.sat === null) return 0;
  const drink = nsIsDrink(f);
  const soft = nsCompute(f, i, i.sug === null ? 0 : i.sug, i.sat * 0.67,
                         i.fib === null ? 0 : i.fib, drink);
  const base = nsTo100(ns.score, nsGrade(ns.score, drink), drink);
  const lift = nsTo100(soft.score, nsGrade(soft.score, drink), drink) - base;
  return Math.max(0, Math.min(12, Math.round(lift)));
}

// The composite. Every part is returned so the panel can show its working -
// nothing is hidden inside a total.
// When nothing adjusted the base, the card would otherwise show an empty space
// where a reason belongs. These are the reasons, in the same order the credits
// would have appeared in.
function healthV2Skips(f, canGain){
  const out = [];
  // Nutrient credit: its own gate, so its reasons are listed on their own.
  const mc = microCredit(f);
  if(!mc) out.push('No vitamin or mineral figures on record');
  else if(novaGroup(f.name || '') === 4) out.push('Ultra-processed, so nutrient credit does not apply');
  else if(!mc.v) out.push('Nothing reaching 15% of a daily reference per 100 kcal');
  // Everything below is a macro-profile credit, and the grade gate covers them
  // all at once when it applies.
  if(!canGain) return out;
  if(f.f100 == null || f.sat100 == null) out.push('No saturated fat figure, so fat quality is unknown');
  else if(f.f100 < 3) out.push('Too little fat to judge its quality');
  const p = f.p100 || 0, dens = f.kcal100 > 0 ? p*100/f.kcal100 : 0;
  if(dens < 4) out.push('Not a protein food, so protein quality does not apply');
  else if(!proteinQuality(f.name || '', f)) out.push('No published protein quality for this food');
  if(freeSugarFraction(f.name || '') === null && f.sug100) {
    out.push('Unknown how much of its sugar is free sugar');
  }
  return out;
}

function healthV2(f){
  const ns = nutriScore(f);
  if(!ns) return null;
  const grade = nsGrade(ns.score, ns.drink);
  const base = nsTo100(ns.score, grade, ns.drink);
  const name = f.name || '';
  let parts = [];
  // THE GATE. Not my invention: Nutri-Score already refuses protein points to a
  // food whose negatives are high, so that a salty fatty product cannot buy its
  // way back. Every credit here obeys the same rule, for the same reason.
  // Cheese is the published scheme's own exception - it counts protein however
  // high the negatives are - so the credits here follow the same rule. Without
  // this, mature cheddar came out below a bag of crisps.
  const canGain = (grade === 'A' || grade === 'B' || grade === 'C') || nsIsCheese(f);
  const g0 = novaGroupOf(f);
  // Nutrient content is gated on ultra-processing rather than on grade - see
  // the note above the function for why the two credits differ.
  const nutrientsCount = (g0 !== 4);
  const mc = microCredit(f);
  if(mc && mc.v && nutrientsCount) parts.push({k:'micro', n:'Micronutrients', v:mc.v, hits:mc.hits});
  // Credit for the KIND of fat and the QUALITY of protein is about a whole
  // food's make-up. A fried snack built from refined oil was collecting the
  // unsaturated-fat credit - it was most of what put crisps above cheese - so
  // ultra-processed foods no longer earn either. Debits still apply to them.
  const fq = fatQuality(f);
  if(fq && (fq < 0 || (canGain && nutrientsCount))) parts.push({k:'fat', n:'Fat quality', v:fq,
    share: (f.f100 ? f.sat100/f.f100 : null)});
  const pq = proteinQuality(name, f);
  if(pq && canGain && nutrientsCount) parts.push({k:'protein', n:'Protein quality', v:pq});
  const dm = dairyMatrixCredit(f, ns);
  if(dm && canGain) parts.push({k:'dairy', n:'Dairy matrix', v:dm});
  const fs = freeSugarAdjust(name, f);
  if(fs && (fs < 0 || canGain)) parts.push({k:'sugar', n:'Free sugars', v:fs});
  // A debit, so it applies whatever the grade - the same as every other debit.
  const ad = additivePenalty(f);
  if(ad) parts.push({k:'additive', n:'Additives', v:ad, list:additivesOf(f).flagged});

  // Debits apply in full. Credits are capped by the headroom the base leaves,
  // so the nearer a food already sits to the top of the published scale, the
  // less room an adjustment has left to add. This is why 100 is nearly
  // unreachable, and it applies to every food in one line rather than being a
  // special case for any of them.
  let credit = 0, debit = 0;
  parts.forEach(x=>{ if(x.v > 0) credit += x.v; else debit += x.v; });
  const room = Math.max(0, Math.round((100 - base) * 0.6));
  if(credit > room){
    // Scale the CREDITS, and show them scaled. Trimming the total while the
    // lines still claimed their full value would make the breakdown a lie.
    const k = room / credit;
    let spent = 0, biggest = null;
    parts.forEach(x=>{
      if(x.v <= 0) return;
      x.full = x.v;                       // kept so the panel can say it was capped
      x.v = Math.round(x.v * k);
      spent += x.v;
      if(!biggest || x.v > biggest.v) biggest = x;
    });
    // Settle the rounding on the largest credit so the column adds up exactly.
    if(biggest && spent !== room) biggest.v += (room - spent);
    parts = parts.filter(x=>x.v !== 0);
    credit = room;
  }
  let total = base + credit + debit;
  const g = novaGroupOf(f);
  if(NOVA_MULT[g] !== 1){
    const before = Math.round(total);
    total = Math.round(before * NOVA_MULT[g]);
    parts.push({k:'nova', n:'Processing', v: total - before, nova:g});
  }
  return { base: base, grade: grade, total: Math.max(0, Math.min(100, Math.round(total))),
           parts: parts, microKnown: !!mc, gated: !canGain, nova: g, ns: ns,
           // Only worth computing when there is a gap to explain.
           skips: parts.length ? [] : healthV2Skips(f, canGain) };
}

function proteinDensity(f){
  if(!f || !(f.kcal100 > 0)) return 0;
  return (Number(f.p100)||0) * 100 / Number(f.kcal100);
}
function scoreLerp(x, a, b){ return b === a ? 0 : Math.max(0, Math.min(1, (x-a)/(b-a))); }

// The three numbers. `health` is null when the data cannot support one, and
// the caller must say so rather than print a number it has invented.
