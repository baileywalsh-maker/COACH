/* ============================================================
   Something better, in the same aisle.

   A bad score on its own is a telling-off. What makes it useful is the next
   line: here is the thing you would have instead. The rule for what counts as
   "instead" is the hard part - suggesting an apple in place of crisps is not
   advice, it is a non-sequitur - so a swap must come from the same FAMILY.
   Families are written out below rather than guessed from macros, because
   "similar protein and fat" is how you end up recommending peanut butter to
   replace cheese.

   Everything suggested is scored by the same scorer as the food it replaces,
   from COACH's own tables. Nothing is invented and nothing is ranked by
   anything other than the score you would see if you logged it.
   ============================================================ */
/* A family is a shelf, not a keyword. Two things kept going wrong with loose
   matching and both are guarded here:

   a word can belong to another food entirely - "squash" put butternut squash
   in with the cola, "monster" put Monster Munch there, "butter" put a peanut
   butter smoothie in with the spreads - so each family carries a `not` for the
   words that look like it and are not;

   and a composite dish is not a swap for an ingredient - "fish and chips"
   scored better than crisps and was offered as an alternative to them, which
   is not advice, it is a different dinner. */
const SWAP_FAMILIES = [
  {k:'crisps',    n:'crisps and savoury snacks',
   re:/\b(crisps|tortilla chips|potato chips|dorito\w*|pringles?|wotsits?|monster munch|quavers?|skips|hula hoops?|popcorn|pretzels?|poppadom\w*|prawn crackers?|bombay mix)\b/i,
   not:/\b(chicken|shrimp|prawns|kfc)\b/i},
  {k:'biscuit',   n:'biscuits',
   re:/\b(biscuits?|cookies?|digestives?|hobnobs?|rich tea|shortbread|bourbons?|custard creams?|jaffa cakes?|oreos?|flapjacks?)\b/i},
  {k:'chocolate', n:'chocolate and sweets',
   re:/\b(chocolate|sweets|candy|haribo|gummy|gummies|mars bar|snickers|twix|bounty|kitkat|kit kat|galaxy|dairy milk|maltesers|skittles|fudge|toffee)\b/i,
   not:/\b(milkshake|drink|cereal|spread|biscuit|cake|ice cream|protein bar)\b/i},
  {k:'cake',      n:'cakes and pastries',
   re:/\b(cake|muffin|doughnuts?|donuts?|brownie|croissant|pain au chocolat|danish|pastry|scone|eclair|tart|crumble|cheesecake)\b/i,
   not:/\bjaffa cake\b/i},
  {k:'cereal',    n:'breakfast cereals',
   re:/\b(cereal|cornflakes|corn flakes|frosties|coco pops|cheerios|granola|muesli|weetabix|shreddies|crunchy nut|special k|porridge|oats|bran flakes)\b/i,
   not:/\bbar\b/i},
  {k:'bread',     n:'breads',
   re:/\b(bread|toast|bagel|baguette|ciabatta|pitta|naan|crumpet|brioche|wraps?)\b/i,
   not:/\b(pudding|sauce|french toast|avocado toast|beans on)\b/i},
  {k:'drink',     n:'soft drinks',
   re:/\b(cola|coke|pepsi|lemonade|fanta|sprite|irn.?bru|cordial|energy drink|red bull|lucozade|ribena|iced tea|tango|dr pepper)\b/i,
   not:/\b(butternut|spaghetti squash|munch|chicken)\b/i},
  {k:'juice',     n:'juices and smoothies',
   re:/\b(juice|smoothie|tropicana)\b/i},
  {k:'yoghurt',   n:'yoghurts',
   re:/\b(yoghurts?|yogurts?|skyr|fromage frais|muller|activia|petits filous)\b/i},
  {k:'milk',      n:'milks',
   re:/\b(milk|oat drink|soya drink|almond drink|alpro)\b/i,
   not:/\b(milkshake|chocolate|pudding|porridge|cereal|coffee|latte|tea)\b/i},
  {k:'cheese',    n:'cheeses',
   re:/\b(cheese|cheddar|brie|camembert|stilton|feta|halloumi|mozzarella|parmesan|babybel|dairylea|philadelphia)\b/i,
   not:/\b(cake|sandwich|toastie|pizza|macaroni|sauce|omelette|on toast)\b/i},
  {k:'spread',    n:'spreads',
   re:/\b(butter|margarine|spread|nutella|jam|marmalade|honey|lurpak|flora)\b/i,
   // "Butter chicken" is a curry and a smoothie is a drink, whatever is in them.
   not:/\b(chicken|smoothie|shake|pudding|cake|biscuit|sauce|beans|milk|popcorn|sandwich|on toast|bean)\b/i},
  {k:'sauce',     n:'sauces and condiments',
   re:/\b(ketchup|mayonnaise|mayo|salad cream|brown sauce|bbq sauce|sweet chilli|mustard|chutney|relish|gravy|dressing|hollandaise|pesto)\b/i},
  {k:'meat',      n:'processed meats',
   re:/\b(sausages?|bacon|ham|salami|pepperoni|chorizo|hot dogs?|frankfurters?|black pudding|luncheon meat|spam|corned beef)\b/i,
   not:/\b(roll|sandwich|baguette|pizza|casserole|hock|and )\b/i},
  {k:'fried',     n:'chips and fried things',
   re:/\b(chips|fries|nuggets?|fried chicken|scampi|battered|breaded|spring rolls?|samosas?|pakoras?|bhajis?|onion rings?|hash browns?)\b/i},
  {k:'ready',     n:'ready meals',
   re:/\b(lasagne|pizza|curry|chow mein|korma|tikka masala|shepherds pie|cottage pie|macaroni cheese|fish fingers|pasty|pie)\b/i},
  {k:'noodle',    n:'noodles and pasta',
   re:/\b(noodles?|pot noodle|ramen|pasta|spaghetti|macaroni|penne|fusilli|couscous)\b/i,
   not:/\b(cheese|bolognese|carbonara|salad|soup)\b/i},
  {k:'bar',       n:'bars',
   re:/\b(protein bar|cereal bar|granola bar|nutrigrain|breakfast bar|trek bar|grenade|fulfil|barebells)\b/i},
  {k:'icecream',  n:'frozen puddings',
   re:/\b(ice cream|gelato|sorbet|magnum|cornetto)\b/i},
  {k:'alcohol',   n:'alcoholic drinks',
   re:/\b(beer|lager|ale|stout|cider|wine|prosecco|gin|vodka|whisky|rum|cocktail)\b/i,
   not:/\b(vinegar|sauce|ginger)\b/i}
];

/* A dish made of several things is not an alternative to one thing. A ham
   salad is not a swap for a sausage; fish and chips is not a swap for crisps. */
const SWAP_COMPOSITE = /\b(and|with|salad|sandwich|toastie|burger|wrap|baguette|roll|on toast|on a)\b/i;

function swapFamily(name){
  const n = String(name || '');
  for(const f of SWAP_FAMILIES){
    if(!f.re.test(n)) continue;
    if(f.not && f.not.test(n)) continue;
    return f;
  }
  return null;
}

/* Only offered when a food is actually in the red, and only when something in
   the same family is clearly better - not a point or two, which would be noise
   dressed up as advice. */
const SWAP_BAD_BELOW = 50;      // "Poor" and "Bad" on COACH's own bands
const SWAP_MIN_GAIN  = 15;

let swapCache = {};
function betterSwaps(food, limit){
  if(!food || !food.name) return [];
  let sc = null;
  try{ sc = foodScores(food); }catch(e){ return []; }
  if(!sc || sc.health == null || sc.health >= SWAP_BAD_BELOW) return [];
  const fam = swapFamily(food.name);
  if(!fam) return [];
  const key = fam.k + '|' + Math.round(sc.health) + '|' + String(food.name).toLowerCase();
  if(swapCache[key]) return swapCache[key].slice(0, limit || 3);

  const mineNames = new Set();
  const out = [];
  const fromComposite = SWAP_COMPOSITE.test(food.name);
  const consider = (name, mk, where)=>{
    const low = String(name || '').toLowerCase();
    if(!low || low === String(food.name).toLowerCase()) return;
    /* "Diet Coke" and "Diet Coke, 330ml can" are one suggestion, not two. The
       part before the comma is the food; what follows is the packet size. */
    const head = low.split(',')[0].trim();
    if(mineNames.has(low) || mineNames.has(head)) return;
    // It has to land in this family and no other - the same test the food
    // itself went through, so the two can never disagree.
    const cf = swapFamily(name);
    if(!cf || cf.k !== fam.k) return;
    // Swapping crisps for fish and chips is a different dinner, not a swap.
    if(!fromComposite && SWAP_COMPOSITE.test(name)) return;
    /* notASuggestion() is deliberately NOT used here. It exists to keep fried
       food and pure sugar out of "eat this to fix your iron", and it would
       throw away the honest answer to "what is a better biscuit" - which is
       a plainer biscuit, not a carrot. Family and score do the filtering. */
    let f = null, s2 = null;
    try{ f = mk(); s2 = f ? foodScores(f) : null; }catch(e){ return; }
    if(!f || !s2 || s2.health == null) return;
    if(s2.health < sc.health + SWAP_MIN_GAIN) return;
    mineNames.add(low); mineNames.add(head);
    out.push({name: f.name, health: s2.health, gain: s2.health - sc.health, food: f, where: where});
  };

  // Things you already eat come first - a swap you have bought before is one
  // you will actually make.
  try{
    eatenHistory().forEach(r=>consider(r.name, ()=>per100From(r.last), 'you eat this'));
  }catch(e){}
  try{
    loadMyFoods().forEach(m=>consider(m.name, ()=>myFoodToFood(m), 'your food'));
  }catch(e){}
  for(const row of LOCAL_FOODS) consider(row[0], ()=>localToFood(row), '');

  out.sort((a,b)=>{
    // A swap you already eat wins a tie, but never beats a much better food.
    const aw = a.where ? 6 : 0, bw = b.where ? 6 : 0;
    return (b.health + bw) - (a.health + aw);
  });
  const top = out.slice(0, 6);
  swapCache[key] = top;
  return top.slice(0, limit || 3);
}

/* What actually got better, in one short phrase, worked out from the two
   foods rather than asserted. */
function swapReason(from, to){
  try{
    const a = limitLoad(from), b = limitLoad(to);
    const by = {};
    (a.rows || []).forEach(r=>{ by[r.k] = (r.pct || 0); });
    let best = null;
    (b.rows || []).forEach(r=>{
      const was = by[r.k];
      if(was == null) return;
      const drop = was - (r.pct || 0);
      if(drop > 8 && (!best || drop > best.drop)) best = {n: r.n.toLowerCase(), drop: drop};
    });
    if(best) return 'less ' + best.n;
    const na = novaGroupOf(from), nb = novaGroupOf(to);
    if(na === 4 && nb < 4) return 'not ultra-processed';
    const ma = (from.micros100 || {}).fiber, mb = (to.micros100 || {}).fiber;
    if(ma != null && mb != null && mb > ma * 1.5) return 'more fibre';
  }catch(e){}
  return 'better per calorie';
}

function swapPanelHTML(food){
  const list = betterSwaps(food, 3);
  if(!list.length) return '';
  const fam = swapFamily(food.name);
  return '<div class="sc-sec">Better in the same aisle</div>'+
    '<p class="sw-note">Same kind of thing - ' + esc(fam ? fam.n : 'same sort of food') +
    ' - scored the same way, best first.</p>'+
    list.map((x,i)=>{
      const img = foodThumb(x.food);
      const link = foodLink(x.food);
      return '<div class="sw-item" data-swapi="'+i+'">'+
        '<span class="sw-th">'+(img
          ? '<img src="'+esc(img)+'" alt="" loading="lazy" onerror="this.style.display=\'none\'">'
          : '<i class="ti ti-tools-kitchen-2" aria-hidden="true"></i>')+'</span>'+
        '<button class="sw-row" data-swap="'+i+'">'+
          '<span class="sw-n">'+esc(x.name)+
            (x.where ? '<span class="sr-tag">'+x.where+'</span>' : '')+
            '<s>'+esc(swapReason(food, x.food))+'</s></span>'+
          '<span class="sw-v">'+x.health+'<i>+'+Math.round(x.gain)+'</i></span>'+
        '</button>'+
        /* Somewhere to go and actually look at the thing - the packet itself
           where it has a barcode, a search for it where it is a plain food. */
        (link ? '<a class="sw-link" href="'+esc(link)+'" target="_blank" rel="noopener noreferrer" '+
                'aria-label="Look up '+esc(x.name)+'"><i class="ti ti-search" aria-hidden="true"></i></a>' : '')+
      '</div>';
    }).join('');
}

function wireSwaps(food, boxId){
  const box = document.getElementById(boxId);
  if(!box) return;
  const list = betterSwaps(food, 3);
  // Three pictures, asked for once each, ever. See thumbFetch.
  list.forEach((x, i)=>{
    if(!x.food || foodThumb(x.food)) return;
    if(thumbGet(x.food.name) !== undefined) return;
    thumbFetch(x.food.name).then(url=>{
      if(!url) return;
      const el = box.querySelector('[data-swapi="'+i+'"] .sw-th');
      if(!el || el.querySelector('img')) return;
      el.innerHTML = '<img src="'+esc(url)+'" alt="" loading="lazy" onerror="this.style.display=\'none\'">';
    }).catch(()=>{});
  });
  box.querySelectorAll('[data-swap]').forEach(b=>{
    b.onclick = ()=>{
      const x = list[Number(b.dataset.swap)];
      if(!x) return;
      // Closing whatever is open first, so the portion sheet is not buried.
      closeSheet('fooddet-backdrop');
      setTimeout(()=>openPortion(Object.assign({}, x.food)), HANDOFF);
    };
  });
}

function renderScorePanel(food, opts){
  opts = opts || {};
  const boxId = opts.box || 'score-panel';
  const box = document.getElementById(boxId);
  if(!box) return;
  const sc = food ? foodScores(food) : null;
  if(!sc){
    // No calories at all: there is no "quality per calorie" to work out, and
    // saying so is better than an empty space where a score should be.
    box.innerHTML = (food && !(food.kcal100 > 0))
      ? '<div class="section-title">Score</div><div class="sc-note"><i class="ti ti-info-circle" aria-hidden="true"></i>'+
        '<div>No calories in this, so there is nothing to score. It still counts towards '+
        'anything it carries \u2014 water, salt, minerals.</div></div>'
      : '';
    return;
  }
  if(sc.health === null && !sc.range && !sc.v3){
    box.innerHTML = '<div class="section-title">Score</div><div class="sc-note">'+
      '<i class="ti ti-alert-triangle" aria-hidden="true"></i><div>Too little on record to score this. '+
      'Scan the packet once and it is fixed for good. <button data-addlabel="1">Add it from the packet</button></div></div>';
    wireLabelButton(food, boxId);
    return;
  }
  const pb = scoreBand(sc.protein);

  // No health score is a real answer, and the app says which figures it is
  // short of rather than printing a number it has invented.
  if(sc.health === null){
    const r = sc.range;
    box.innerHTML =
      '<div class="section-title">Score</div>'+
      '<div class="sc-top">'+
        (r ? '<div class="sc-range">'+r.lo+'<span>&ndash;</span>'+r.hi+'</div>'
           : scoreMeter(sc.protein, pb.cls, 'add'))+
        '<div><div class="sc-t1">'+(r ? 'Health &middot; somewhere in D&ndash;E'.replace('D&ndash;E', r.lo+'&ndash;'+r.hi) : 'Protein value')+'</div>'+
        '<div class="sc-t2">'+(r
          ? 'No '+esc(sc.missing.join(' or '))+' is published for this, so it cannot be pinned to one grade. Protein value is '+sc.pd.toFixed(1)+' g per 100 kcal.'
          : sc.pd.toFixed(1)+' g per 100 kcal')+'</div></div></div>'+
      '<div class="sc-note"><i class="ti ti-alert-triangle" aria-hidden="true"></i><div>'+
        (r ? 'Narrow it down' : 'No health score')+' — this food has no '+
        esc(sc.missing.join(', '))+' on record. '+
        '<button data-addlabel="1">Add it from the packet</button></div></div>';
    wireLabelButton(food, boxId);
    return;
  }

  const ob = scoreBand(sc.overall), hb = scoreBand(sc.health);
  // The amount actually selected, which is the question being asked.
  const pf = portionFacts(food, opts.grams > 0 ? opts.grams
    : ((typeof portionGrams === 'function' && pendingFood === food) ? portionGrams() : 0));
  const seg = [['overall','Overall',sc.overall,ob],['health','Health',sc.health,hb],
               ['protein','Protein',sc.protein,pb]].map(([k,lab,v,b])=>
    '<button data-sctab="'+k+'"'+(scoreTab===k?' class="on"':'')+'>'+lab+
    '<span class="v" style="color:'+scoreColour(b.cls, k==='protein'?'add':null)+'">'+
    v+'</span></button>').join('');

  let portionBlock = '';
  if(pf){
    const amt = (food.unitName && food.unitGrams && isCountable(food))
      ? round2(pf.grams/food.unitGrams)+' '+pluralUnit(food.unitName, round2(pf.grams/food.unitGrams))+
        ' &middot; '+round2(pf.grams)+(foodBasis(food)==='ml'?' ml':' g')
      : round2(pf.grams)+(foodBasis(food)==='ml'?' ml':' g');
    portionBlock =
      '<div class="sc-pb"><div class="sc-ph"><span class="t">This portion</span>'+
        '<span class="a">'+amt+'</span></div>'+
      pf.rows.map(r=>'<div class="sc-pl"><span class="k">'+esc(r.n)+'</span>'+
        '<span class="v"'+(r.col?' style="color:'+r.col+'"':'')+'>'+r.v+r.u+
        (r.sub?'<s>'+esc(r.sub)+'</s>':'')+'</span></div>').join('')+
      (pf.src.length
        ? '<div class="sc-src">'+pf.src.map(s=>'<span'+(s.high?'':' class="mid"')+'>'+
            (s.high?'High in ':'Source of ')+esc(s.n)+' '+s.pct+'%</span>').join('')+'</div>'
        : '')+
      (sc.grade
        ? '<div class="sc-pn">Grade <b>'+sc.grade+'</b> describes <b>100 '+
          (foodBasis(food)==='ml'?'ml':'g')+'</b> of this. You are having <b>'+
          round2(pf.grams)+(foodBasis(food)==='ml'?' ml':' g')+'</b>.</div>'
        : '')+
      '</div>';
  }

  let body = '';
  if(scoreTab === 'protein'){
    const pin = Math.max(0, Math.min(100, sc.pd/12*100));
    body = '<div class="sc-top">'+scoreMeter(sc.protein, pb.cls, 'add')+
      '<div><div class="sc-t1">Protein value</div><div class="sc-t2"><b>'+sc.pd.toFixed(1)+
      ' g per 100 kcal</b></div></div></div>'+
      '<div class="sc-sec">Where it sits</div>'+
      '<div class="sc-scale"><div class="bar"><div class="pin" style="left:'+pin.toFixed(0)+'%"></div></div>'+
      '<div class="lb"><span>0 g</span><span>6 g</span><span>12 g+ per 100 kcal</span></div></div>';
  } else if(scoreTab === 'health' && sc.v3){
    const v3 = sc.v3, n = sc.ns;
    const lim = v3.limits;
    const cls = v=> v > 0 ? 'var(--accent)' : 'var(--danger)';
    body = '<div class="sc-top">'+scoreMeter(sc.health, hb.cls)+
      '<div><div class="sc-t1">'+hb.word+'</div>'+
      '<div class="sc-t2">What it carries for its calories, less what a normal portion '+
      'spends of your day\'s salt, saturated fat and free sugar.</div></div></div>';
    body += '<div class="sc-bd">'+
      '<div class="sc-bl"><span class="k">Nutrients for its calories<s>'+
        (v3.hits.length
          ? 'per calorie it is strong on '+v3.hits.slice(0,3).map(h=>esc(h.n)).join(', ')
          : 'thin on nutrients for what it costs')+
        (v3.fatBonus > 0.02 ? ', mostly unsaturated fat' : '')+'</s></span>'+
        '<span class="v">'+v3.base+'</span></div>'+
      v3.parts.map(pt=>{
        const why = pt.k === 'limits'
          ? (pt.apportioned ? 'counted in proportion, this dish uses ' : Math.round(pt.portion)+' g uses ')+
              pt.rows.filter(r=>r.over > 0)
              .map(r=>r.pct+'% of your '+r.n.toLowerCase()).join(', ')+
              (pt.matrix ? ' (saturated fat in cheese and yoghurt counted at two thirds)' : '')+
              (v3.freeAssumed ? ' \u00b7 assumed all its sugar is added, because COACH does not know this food' : '')
          : (NOVA_WHY[pt.nova] + ' \u00b7 ' + (pt.why || ''));
        return '<div class="sc-bl"><span class="k">'+esc(pt.n)+
          (why ? '<s>'+esc(why)+'</s>' : '')+'</span><span class="v" style="color:'+cls(pt.v)+'">'+
          (pt.v > 0 ? '+' : '')+pt.v+'</span></div>';
      }).join('')+
      '<div class="sc-bl tot"><span class="k">Quality score</span><span class="v" style="color:'+
        (hb.cls==='good'?'var(--accent)':hb.cls==='fair'?'var(--score-fair)':'var(--danger)')+'">'+
        v3.total+'</span></div>'+
      (sc.grade ? '<div class="sc-gate">Nutri-Score, the grade printed on packets, gives this a <b>'+
        sc.grade+'</b>. It reads energy, sugar, saturated fat, salt, fibre and protein per 100 g and '+
        'cannot see a single vitamin or mineral, which is why COACH no longer scores from it.</div>' : '')+
      (v3.freeAssumed
        ? (Array.isArray(food.freeAssumedNames) && food.freeAssumedNames.length
            ? '<div class="sc-gate">COACH does not recognise <b>'+
              esc(food.freeAssumedNames.join('</b>, <b>'))+'</b>, so half of '+
              (food.freeAssumedNames.length === 1 ? 'its' : 'their') +
              ' sugar is being counted as added. Open '+
              (food.freeAssumedNames.length === 1 ? 'it' : 'them') +
              ' from your log and say whether that sugar is natural, and this plate is worked '+
              'out again. Nothing else on the plate is affected.</div>'
            : '<div class="sc-gate">COACH does not recognise this food, so <b>half its sugar is '+
              'being counted as added</b> - the honest reading of something it cannot identify. '+
              'If that sugar is the lactose in milk or the fruit in fruit, say so and the score '+
              'is worked out again.'+
              '<div class="sc-free"><button data-freeset="0">It is natural</button>'+
              '<button data-freeset="0.5">Some of each</button>'+
              '<button data-freeset="1">It is added</button></div></div>')
        : '')+
      (v3.provisional ? '<div class="sc-gate">Only '+v3.nCount+' nutrient'+(v3.nCount===1?' is':'s are')+' on record for this, '+
        'so the top line is a partial picture and the score is capped until it is filled in. '+
        'Photograph the panel or type the figures and the cap lifts.</div>' : '')+
      '<button class="sc-relabel" id="nova-fix">Processing: '+NOVA_NAME[v3.nova]+
        ' \u00b7 change this</button>'+
      '</div>';
    body += '<div class="sc-sec">'+(lim.apportioned
        ? 'What this dish spends of your day' : 'What one portion spends of your day')+'</div>'+
      lim.rows.map(r=>scoreFac(r.over > 0 ? 'dn' : 'up', 'ti-arrow-'+(r.over > 0 ? 'down' : 'up'),
        r.n, r.pct+'% of your day\'s limit'+(lim.apportioned
          ? ', counting each thing by the calories it brought'
          : ', from '+Math.round(lim.portion)+' g'))).join('')+
      (lim.apportioned
        ? scoreFac('warn','ti-flame','How this is worked out',
            'every food on the plate is measured at a normal helping of itself, then counted by its share of the calories')
        : scoreFac('warn','ti-flame','Its share of your calories',
            Math.round(lim.fair*100)+'% of the day'));
  } else if(scoreTab === 'health'){
    const n = sc.ns, v2 = sc.v2;
    const moved = v2 && v2.total !== v2.base;
    body = '<div class="sc-top">'+scoreMeter(sc.health, hb.cls)+
      '<div><div class="sc-t1">Health &middot; grade '+sc.grade+
        (moved ? (v2.total > v2.base ? ', lifted to ' : ', cut to ')+v2.total : '')+'</div>'+
      '<div class="sc-t2">Nutri-Score'+(n.drink?', on the drinks table':'')+
        ', plus the things it does not measure.</div></div></div>';

    if(v2){
      body += '<div class="sc-bd">'+
        '<div class="sc-bl"><span class="k">Nutri-Score '+v2.grade+
          '<s>energy, sugar, saturated fat, salt, fibre, protein</s></span>'+
          '<span class="v">'+v2.base+'</span></div>'+
        v2.parts.map(pt=>{
          const why = pt.k === 'micro'
              ? (pt.hits && pt.hits.length
                  ? (pt.hits[0].high ? 'high in ' : 'source of ') +
                    pt.hits.slice(0,3).map(x=>microName(x.k)).join(', ')
                  : 'vitamins and minerals')
            : pt.k === 'fat'    ? (pt.share == null ? 'fat quality'
                                   : Math.round(pt.share*100)+'% of its fat is saturated')
            : pt.k === 'protein'? 'complete protein, '+sc.pd.toFixed(1)+' g per 100 kcal'
            : pt.k === 'sugar'  ? 'its sugars are not free sugars'
            : pt.k === 'additive' ? (pt.list||[]).map(x=>x.name).join(', ')
            : pt.k === 'nova'   ? NOVA_WHY[pt.nova]
            : '';
          return '<div class="sc-bl"><span class="k">'+esc(pt.n)+
            (why ? '<s>'+esc(why)+'</s>' : '')+'</span>'+
            '<span class="v" style="color:'+(pt.v>0?'var(--accent)':'var(--danger)')+'">'+
            (pt.v>0?'+':'')+pt.v+'</span></div>';
        }).join('')+
        '<div class="sc-bl tot"><span class="k">Health score</span>'+
          '<span class="v" style="color:'+(hb.cls==='good'?'var(--accent)':
            hb.cls==='fair'?'var(--score-fair)':'var(--danger)')+'">'+v2.total+'</span></div>'+
        (v2.skips && v2.skips.length
          ? '<div class="sc-gate">Nothing adjusted the published score. What was checked:<br>'+
            v2.skips.map(x=>'&middot; '+esc(x)).join('<br>')+'</div>'
          : '')+
        (v2.gated
          ? '<div class="sc-gate">Graded '+v2.grade+', so credits for protein, fat ratio and '+
            'sugar type do not apply &mdash; the published scheme stops counting protein once a '+
            'food\'s negatives are high, and those follow the same rule. Vitamins and minerals '+
            'still count, because what a food contains is true whatever its fat is doing.</div>'
          : ((!v2.microKnown && !(v2.skips && v2.skips.length))
            // Only when the checklist above has not already said it.
            ? '<div class="sc-gate">No vitamin or mineral figures on record for this, so it earns '+
              'no micronutrient credit. That is missing data, not an absence of nutrients.</div>'
            : ''))+
      '</div>';
    }
    body += '<div class="sc-sec">Inside the Nutri-Score</div>'+
      scoreFac('up','ti-arrow-up','Fibre', n.fibP+' / 5')+
      (n.fvP ? scoreFac('up','ti-arrow-up','Fruit, veg, pulses or nuts',
                        n.fvP+' / '+(n.drink?10:5)) : '')+
      (n.proP ? scoreFac('up','ti-arrow-up','Protein', n.proP+' / 5') : '')+
      scoreFac(n.neg > 10 ? 'dn' : 'warn','ti-arrow-down',
               'Energy, sugar, saturated fat and salt', n.neg+' points');
  } else {
    body = '<div class="sc-top">'+scoreMeter(sc.overall, ob.cls)+
      '<div><div class="sc-t1">'+ob.word+'</div><div class="sc-t2">'+
      (sc.labelOnly
        ? 'Worked out from the few figures on record, so treat it as rough \u2014 scan the packet and it firms up.'
        : 'Quality <b>'+sc.health+'</b> &middot; protein <b>'+sc.protein+'</b> g-for-calories. '+
          'Tap Health to see the working.')+'</div></div></div>';
  }
  // The way back into the packet figures. This button used to appear only while
  // a food was UNSCORABLE, so the moment you filled the figures in it vanished -
  // and a 50 typed where you meant 5 was locked in for good, quietly scoring
  // that food wrong for ever.
  const packetLine = '<button class="sc-relabel" data-addlabel="1">Nutrients</button>';

  const partial = (sc.v3 && sc.v3.provisional)
    ? '<div class="sc-partial"><i class="ti ti-help-circle" aria-hidden="true"></i>'+
      'Partial data \u2014 only '+sc.v3.nCount+' nutrient'+(sc.v3.nCount===1?'':'s')+' on record, so this score is a rough one. '+
      'Scanning the packet firms it up.</div>'
    : '';
  /* A bad score earns a next step rather than just a colour. */
  const swaps = swapPanelHTML(food);
  box.innerHTML = '<div class="section-title">Score</div>'+portionBlock+
    '<div class="sc-seg">'+seg+'</div>'+partial+body+swaps+packetLine;
  if(swaps) wireSwaps(food, boxId);
  box.querySelectorAll('[data-sctab]').forEach(b=>{
    b.onclick = ()=>{ scoreTab = b.dataset.sctab; renderScorePanel(food, opts); };
  });
  const nf = box.querySelector('#nova-fix');
  if(nf) nf.onclick = ()=> openNovaSheet(food, ()=>renderScorePanel(food, opts));
  // Settling the sugar question. Saved against the food's name, like every
  // other thing you have told COACH about a food, so it holds next time too.
  box.querySelectorAll('[data-freeset]').forEach(b=>{
    b.onclick = ()=>{
      const v = Number(b.dataset.freeset);
      if(!(v >= 0 && v <= 1) || !food || !food.name) return;
      saveLabel(food.name, {free: v});
      try{ if(typeof clearFoodCaches === 'function') clearFoodCaches(); }catch(e){}
      renderScorePanel(food, opts);
      try{ renderDay(); }catch(e){}
    };
  });
  wireLabelButton(food, boxId);
}
function wireLabelButton(food, boxId){
  const b = document.querySelector('#'+(boxId || 'score-panel')+' [data-addlabel]');
  if(b) b.onclick = ()=> openLabelSheet(food);
}

function renderPortionMeals(){
  const box = document.getElementById('portion-meals');
  if(!box) return;
  // Live totals for the day on screen, so you can see which meal you are
  // about to add to and what is already in it.
  box.innerHTML = mealPickerHTML(selectedMeal, 'data-pmeal', mealTotalsToday(loadEntries(currentDate)));
  box.querySelectorAll('[data-pmeal]').forEach(b=>{
    b.onclick = ()=> selectMeal(b.dataset.pmeal);
  });
}

/* ---- my serving ----
   A food's serving comes from whichever table found it, and tables measure
   for a laboratory: a cup, 100 g, half a side of salmon. What you actually
   use is your scoop, your bowl, the mug you drink out of. This lets you name
   it once - against the food, so it is there every time, in the backup, and
   on any day you log that food again. */
let msEditing = false;

function renderMyServe(){
  const box = document.getElementById('myserve');
  if(!box) return;
  const f = pendingFood;
  if(!f || !f.name || !(f.kcal100 > 0) || f.perItem){ box.style.display = 'none'; return; }
  box.style.display = 'block';
  const mine = myServing(f.name);
  const unit = foodBasis(f) === 'ml' ? 'ml' : 'g';
  const now = (typeof portionGrams === 'function') ? Math.round(portionGrams()) : 0;

  if(msEditing){
    box.innerHTML =
      '<div class="ms-row"><span class="ms-t">Call <b>' + fmt0(now) + ' ' + unit +
        '</b> of this what?</span></div>'+
      '<div class="ms-form">'+
        '<input id="ms-name" maxlength="18" autocapitalize="none" autocorrect="off" '+
          'spellcheck="false" placeholder="scoop, bowl, handful..." value="' +
          esc(mine ? mine.n : '') + '">'+
        '<button id="ms-save">Save</button>'+
      '</div>'+
      '<div class="ms-row" style="margin-top:9px;">'+
        '<span class="ms-t">It will be remembered for ' + esc(f.name) + '.</span>'+
        '<button id="ms-cancel">Cancel</button>'+
      '</div>';
    const inp = document.getElementById('ms-name');
    const save = ()=>{
      const g = (typeof portionGrams === 'function') ? portionGrams() : 0;
      if(!(g > 0)) return;
      setMyServing(f.name, inp.value, g);
      msEditing = false;
      // Re-open so the whole sheet picks the new unit up, amount included.
      const again = applyLabel(Object.assign({}, f));
      openPortion(again);
    };
    document.getElementById('ms-save').onclick = save;
    inp.onkeydown = e=>{ if(e.key === 'Enter'){ e.preventDefault(); save(); } };
    document.getElementById('ms-cancel').onclick = ()=>{ msEditing = false; renderMyServe(); };
    setTimeout(()=>{ try{ inp.focus(); }catch(e){} }, 50);
    return;
  }

  if(mine){
    box.innerHTML = '<div class="ms-row">'+
      '<span class="ms-t">Your serving: <b>1 ' + esc(mine.n) + '</b> = ' +
        fmt0(mine.g) + ' ' + unit + '</span>'+
      '<button id="ms-edit">Change</button>'+
      '<button id="ms-clear">Remove</button>'+
    '</div>';
    document.getElementById('ms-edit').onclick = ()=>{ msEditing = true; renderMyServe(); };
    document.getElementById('ms-clear').onclick = ()=>{
      clearMyServing(f.name);
      const again = Object.assign({}, f);
      delete again.myServe;
      // Back to whatever the food itself said before you overrode it.
      openPortion(applyLabel(Object.assign({}, again, {unitName: null, unitGrams: null,
        startAmount: null})));
    };
  } else {
    box.innerHTML = '<div class="ms-row">'+
      '<span class="ms-t">Always have the same amount? Set it once and count it '+
        'instead of weighing it.</span>'+
      '<button id="ms-set">My serving</button>'+
    '</div>';
    document.getElementById('ms-set').onclick = ()=>{ msEditing = true; renderMyServe(); };
  }
}

function openPortion(food){
  /* Whatever found this food - COACH's list, a national table, a barcode -
     anything YOU have said about it applies from here on. Before, only COACH's
     own foods ran through this, so a serving you set on a USDA row was
     remembered and then ignored. */
  try{ food = applyLabel(food); }catch(e){}
  pendingFood = food;
  scoreTab = 'overall';
  renderPortionMeals();
  // Not scored yet: the amount boxes below are still holding the last food's
  // numbers. updatePortionPreview() at the end of this function draws it, once
  // there is an amount to score.
  document.getElementById('portion-name').textContent = shownName(food.name, food);
  const pb = document.getElementById('portion-brand');
  if(pb){ const b = splitName(food.name, food).brand; pb.textContent = b; pb.style.display = b ? '' : 'none'; }
  renderPortionCode(food);
  // What it is for, before you have even logged it.
  renderFoodSystems(food, 'portion-sys');
  // A sensible starting amount in the food's own measure. 100 ml of squash is a
  // stranger opening bid than 100 g of chicken, so liquids start at a glass.
  const basis = foodBasis(food);
  // A scanned pack knows its own size. Only fall back to the generic opening
  // amount when nothing on the packet said.
  document.getElementById('portion-grams').value =
    (food.startAmount > 0) ? round2(food.startAmount) : (basis === 'ml' ? 250 : 100);
  refreshPortionMeasure();

  const countable = isCountable(food);
  document.getElementById('portion-modes').style.display = (countable && !food.perItem) ? 'flex' : 'none';

  if(countable){
    document.getElementById('portion-qty').value = 1;
    document.getElementById('portion-unit-label').textContent = pluralUnit(food.unitName, 1);
    // Quick picks in whole units, not grams — 2 eggs, not 100g of egg.
    document.getElementById('qty-quick').innerHTML = [0.5,1,2,3,4,6].map(n=>
      '<button class="qp" data-q="'+n+'">'+n+' '+pluralUnit(food.unitName,n)+'</button>').join('');
    document.querySelectorAll('#qty-quick .qp').forEach(b=>{
      b.onclick = ()=>{ document.getElementById('portion-qty').value = b.dataset.q; updatePortionPreview(); };
    });
    setPortionMode('unit');
  } else {
    setPortionMode('gram');
  }

  msEditing = false;
  renderMyServe();
  updatePortionPreview();
  closeSheet('add-backdrop');
  closeSheet('scan-backdrop');
  openSheet('portion-backdrop');
}

function updatePortionPreview(){
  if(!pendingFood) return;
  const g = portionGrams();
  const f = g/100;
  const u = foodBasis(pendingFood) === 'ml' ? ' ml' : ' g';
  // Nothing selected is not zero calories, it is no answer yet.
  if(g <= 0){
    document.getElementById('portion-kcal').textContent = '—';
    document.getElementById('portion-macros').textContent = 'Choose an amount';
  } else {
    document.getElementById('portion-kcal').innerHTML = fmtK(pendingFood.kcal100*f)+'<span class="pk-u">kcal</span>';
    const tile = (lab, col, v)=>'<div><s style="color:'+col+'">'+lab+'</s><b>'+v+'</b></div>';
    // A figure the source never gave stays a dash, not a zero.
    const gOr = v => (v === null || v === undefined || isNaN(v)) ? '—' : fmtK(v*f)+'g';
    document.getElementById('portion-macros').innerHTML = '<div class="pm-tiles">'+
      tile('PROTEIN','var(--prot)', gOr(pendingFood.p100))+
      tile('CARBS','var(--carb)', gOr(pendingFood.c100))+
      tile('FAT','var(--fat)', gOr(pendingFood.f100))+'</div>';
  }
  updatePortionAddLabel();

  // Both panels always say what the amount is in the OTHER measure, so nothing
  // is hidden behind whichever tab you happen to be on.
  const countable = isCountable(pendingFood);
  if(portionMode === 'unit' && pendingFood.unitGrams){
    const q = Number(document.getElementById('portion-qty').value) || 0;
    document.getElementById('portion-unit-label').textContent = pluralUnit(pendingFood.unitName, q);
    document.getElementById('portion-equiv').textContent = (g > 0 && !pendingFood.perItem) ? '= '+fmt0(g)+u : '';
  }
  const ge = document.getElementById('portion-gram-equiv');
  if(ge){
    ge.textContent = (countable && g > 0)
      ? '= '+round2(g/pendingFood.unitGrams)+' '+pluralUnit(pendingFood.unitName, round2(g/pendingFood.unitGrams))
      : '';
  }

  // The score panel reads the amount selected, so it has to be redrawn when the
  // amount changes. It was only ever drawn once, when the sheet opened and
  // before the boxes had been filled in - so a 330 g pizza was scored with the
  // words "you are having 100 g" and picking two of them changed nothing.
  renderScorePanel(pendingFood);
}

// v120: "Add to lunch · 508 kcal". Redrawn whenever the amount or the meal changes.
function updatePortionAddLabel(){
  const btn = document.getElementById('portion-add');
  if(!btn) return;
  const g = pendingFood ? portionGrams() : 0;
  btn.textContent = 'Add to ' + String(selectedMeal || 'log').toLowerCase() +
    (pendingFood && g > 0 ? ' · ' + fmtK(pendingFood.kcal100*g/100) + ' kcal' : '');
}

function bumpQty(delta){
  const inp = document.getElementById('portion-qty');
  let q = Number(inp.value) || 0;
  // Half steps below 2 (half an avocado is normal), whole steps above.
  const step = q < 2 ? 0.5 : 1;
  q = Math.max(0, Math.round((q + delta*step) * 2) / 2);
  inp.value = q;
  updatePortionPreview();
}

// The amount panel gets a stepper too. Step size follows the measure: 25 for
// ml, 5 for anything over 500 kcal/100g, 10 otherwise.
function bumpAmount(delta){
  const inp = document.getElementById('portion-grams');
  const step = amountStep(pendingFood);
  const v = Math.max(0, (Number(inp.value) || 0) + delta*step);
  inp.value = round2(v);
  updatePortionPreview();
}
document.getElementById('amt-minus').onclick = ()=>bumpAmount(-1);
document.getElementById('amt-plus').onclick = ()=>bumpAmount(1);

// The escape hatch for a scanned product whose record did not say. It changes
// the label and the quick picks, never the number — there is no density table
// here, and a converted figure is a figure nobody measured.
document.getElementById('portion-flip').onclick = ()=>{
  if(!pendingFood) return;
  const next = foodBasis(pendingFood) === 'ml' ? 'g' : 'ml';
  setFoodMeasure(pendingFood, next);
  pendingFood.basis = next;
  if(pendingFood.src === 'mine') rememberFood({ name: pendingFood.name, code: pendingFood.code,
    kcal100: pendingFood.kcal100, basis: next }, { silent: true });
  refreshPortionMeasure();
  updatePortionPreview();
};

document.getElementById('qty-minus').onclick = ()=>bumpQty(-1);
document.getElementById('qty-plus').onclick = ()=>bumpQty(1);
document.getElementById('portion-qty').addEventListener('input', updatePortionPreview);
document.getElementById('portion-grams').addEventListener('input', updatePortionPreview);
document.querySelectorAll('#portion-modes .tab').forEach(t=>{
  t.onclick = ()=>{
    // EXACT, both ways. The old version rounded the quantity to the nearest
    // half unit here, so 130 g of egg came back as 125 g with no warning — and
    // the comment on this line said it could not happen.
    if(t.dataset.pmode === 'gram') document.getElementById('portion-grams').value = round2(portionGrams());
    else if(pendingFood && pendingFood.unitGrams){
      document.getElementById('portion-qty').value = round2(portionGrams()/pendingFood.unitGrams);
    }
    setPortionMode(t.dataset.pmode);
  };
});

document.getElementById('portion-add').onclick = ()=>{
  if(!pendingFood) return;
  const g = portionGrams();
  if(!g || g<=0) return;
  const f = g/100;
  // What gets stored is only what the packet or the tables said about THIS
  // food. Borrowed figures are filled back in whenever the log is read.
  const pendingOwn = gfOwn(pendingFood);
  const qty = (portionMode==='unit' && pendingFood.unitGrams)
    ? (Number(document.getElementById('portion-qty').value) || 0) : null;
  addEntry({
    name: pendingFood.name,
    // Carried so a wrong figure can be corrected from the log later and the fix
    // still lands on the right barcode. Absent on everything logged before this,
    // which falls back to matching the food by name.
    code: pendingFood.code || null,
    ...(pendingFood.brand && typeof pendingFood.brand === 'string' ? {brand: pendingFood.brand.slice(0, 40)} : {}),
    grams: Math.round(g),
    // What the number means. Absent on everything logged before v35, which
    // reads as grams — the only thing COACH could record back then.
    basis: foodBasis(pendingFood),
    ...(pendingFood.perItem ? {perItem: true} : {}),
    qty: qty,
    unit: qty ? pendingFood.unitName : null,
    kcal: Math.round(pendingFood.kcal100*f),
    protein: Math.round(pendingFood.p100*f),
    carbs: Math.round(pendingFood.c100*f),
    fat: Math.round(pendingFood.f100*f),
    // One decimal, like saturated fat beside it. Whole grams threw away most of
    // the figure on small portions, and sugar drives the Nutri-Score.
    sugar: pendingOwn.sug100 == null ? null : Math.round(pendingOwn.sug100*f*10)/10,
    sat:   pendingOwn.sat100 == null ? null : Math.round(pendingOwn.sat100*f*10)/10,
    micros: (function(){
      const src = pendingOwn.micros100||{}; const out={};
      Object.keys(src).forEach(k=>{ if(src[k] != null && isFinite(src[k])) out[k] = src[k]*f; });
      return out;
    })(),
    meal: selectedMeal
  });
  // Anything that came off the network, or out of your own library, is kept and
  // its recency bumped. Built-in foods are already permanent, so they are skipped.
  if(pendingFood.src === 'off' || pendingFood.src === 'mine') rememberFood(pendingFood);
  pendingFood = null;
  closeSheet('portion-backdrop');
  document.getElementById('search-input').value='';
  // What you just logged belongs at the top of your usuals next time.
  histCache = null;
  document.getElementById('search-results').innerHTML='';
};

