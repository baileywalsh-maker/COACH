/* ============================ Body systems ==================================
   The nutrient list answers "how much of each did I get". This answers the
   question underneath it: what is that actually doing for me. Every nutrient
   COACH tracks belongs to at least one system - the check below fails loudly if
   one ever stops belonging, so a nutrient can never be quietly dropped.

   The wording of what each nutrient does follows the EU register of authorised
   nutrient-function claims, so every line is something there is agreed evidence
   for rather than something that sounds right.
=========================================================================== */
const SYSTEMS = [
 {k:'bones', ico:'\u{1F9B4}', n:'Bones and teeth',
  blurb:'Bone is living tissue, taken apart and rebuilt constantly. Calcium is the raw material; the rest are what let your body lay it down and keep it there.',
  does:{calcium:'The mineral bone is built from.', phosphorus:'Pairs with calcium in the bone matrix.',
        magnesium:'Half the magnesium in your body sits in bone.',
        manganese:'Needed to form connective tissue.', zinc:'Part of the enzymes that build bone.',
        protein:'The collagen scaffold the minerals attach to.',
        'vitamin-d':'Without it you absorb almost none of the calcium you eat.',
        'vitamin-k':'Directs calcium into bone rather than into arteries.'}},
 {k:'muscle', ico:'\u{1F4AA}', n:'Muscle and movement',
  blurb:'A contraction is an electrical event. Calcium triggers it; magnesium and potassium let the muscle relax and reset between reps.',
  does:{protein:'What muscle is rebuilt from after training.',
        leucine:'The amino acid that actually switches muscle building on.',
        lysine:'Needed for the collagen that holds muscle to bone.',
        methionine:'Starts every protein chain your body builds.',
        calcium:'Triggers the contraction itself.', magnesium:'Lets the muscle relax again.',
        potassium:'Carries the signal that fires it.',
        'vitamin-d':'Contributes to normal muscle function.'}},
 {k:'blood', ico:'\u{1FA78}', n:'Blood and oxygen',
  blurb:'Red cells carry oxygen to everything else. Iron is the carrier; the rest are what build a working cell to put it in.',
  does:{iron:'Carries oxygen in haemoglobin.', copper:'Moves iron to where it is used.',
        'vitamin-b12':'Normal red blood cell formation.', 'vitamin-b9':'Normal blood formation.',
        'vitamin-b2':'Contributes to normal red blood cells.',
        'vitamin-b6':'Needed to build haemoglobin.',
        'vitamin-c':'Increases how much iron you absorb from plants.',
        'vitamin-k':'Normal blood clotting.'}},
 {k:'brain', ico:'\u{1F9E0}', n:'Brain and nerves',
  blurb:'Nerve signals are chemistry and electricity. These carry the charge, build the messengers and insulate the wiring.',
  does:{iron:'Oxygen to the brain, and dopamine production.',
        magnesium:'Normal nerve transmission.', potassium:'The charge a nerve signal travels on.',
        zinc:'Normal cognitive function.', copper:'Protects nerve tissue.',
        omega3:'DHA is structural fat in the brain.', iodine:'Normal nervous system function.',
        choline:'Raw material for acetylcholine, the memory messenger.',
        'vitamin-b1':'Normal psychological function.', 'vitamin-b2':'Normal nervous system function.',
        'vitamin-pp':'Normal psychological function.', 'vitamin-b5':'Normal mental performance.',
        'vitamin-b6':'Builds serotonin, dopamine and GABA.',
        'vitamin-b7':'Normal nervous system function.',
        'vitamin-b9':'Normal psychological function.',
        'vitamin-b12':'Builds the myelin sheath around nerves.',
        'vitamin-c':'Normal psychological function.'}},
 {k:'immune', ico:'\u{1F6E1}️', n:'Immune system',
  blurb:'White cells divide fast when you are fighting something, and fast division needs materials on hand.',
  does:{zinc:'Immune cells cannot divide without it.', selenium:'Normal immune response.',
        copper:'Normal immune function.', iron:'Normal immune function.',
        'vitamin-a':'Maintains the barriers a pathogen has to get through.',
        'vitamin-c':'Normal immune function, during and after hard exercise.',
        'vitamin-d':'Normal immune system function.', 'vitamin-b6':'Normal immune function.',
        'vitamin-b9':'Normal immune function.', 'vitamin-b12':'Normal immune function.'}},
 {k:'heart', ico:'❤️', n:'Heart and circulation',
  blurb:'What helps, and what to keep a lid on.',
  does:{potassium:'Helps keep blood pressure normal.', omega3:'EPA and DHA support heart function.',
        epadha:'The two marine omega-3s the guidance is actually about.',
        omega6:'Linoleic acid helps keep cholesterol normal.',
        monofat:'Swapping saturated fat for it helps keep cholesterol normal.',
        polyfat:'The same, and it carries the essential fats.',
        fiber:'Helps keep cholesterol in range.', sodium:'Too much raises blood pressure.',
        satfat:'Raises LDL cholesterol when it is high.',
        transfat:'Worse than saturated fat, gram for gram.',
        cholesterol:'Matters far less than the fats above, but it is measured, so it is shown.',
        'vitamin-b1':'Normal function of the heart.'}},
 {k:'gut', ico:'\u{1F331}', n:'Gut and digestion',
  blurb:'Fibre is food for the bacteria in your colon as much as it is bulk. They are the ones making the compounds that keep the gut wall healthy.',
  does:{fiber:'Feeds gut bacteria and keeps things moving.',
        freesugar:'Feeds the wrong end of that population.',
        sugar:'Total sugars, including what comes wrapped in fruit.',
        'vitamin-pp':'Normal function of the mucous membranes lining the gut.'}},
 {k:'energy', ico:'⚡', n:'Energy release',
  blurb:'Calories are only potential. These are what actually turn food into usable energy inside the cell.',
  does:{iron:'Oxygen for aerobic energy production.', magnesium:'Needed by every ATP reaction.',
        copper:'Part of the energy chain in your mitochondria.',
        manganese:'Energy-yielding metabolism.', phosphorus:'ATP is literally a phosphate molecule.',
        iodine:'Sets the rate everything else runs at.',
        chromium:'Normal metabolism of the big three macros.',
        'vitamin-b1':'Releases energy from carbohydrate.', 'vitamin-b2':'Energy-yielding metabolism.',
        'vitamin-pp':'Energy-yielding metabolism.', 'vitamin-b5':'Energy-yielding metabolism.',
        'vitamin-b6':'Energy-yielding metabolism.', 'vitamin-b7':'Energy-yielding metabolism.',
        'vitamin-b12':'Energy-yielding metabolism.', 'vitamin-c':'Reduces tiredness and fatigue.'}},
 {k:'thyroid', ico:'\u{1F98B}', n:'Thyroid and hormones',
  blurb:'Your thyroid sets your metabolic rate. It needs iodine to build the hormone and selenium to switch it on.',
  does:{iodine:'The hormone is built around it. Nothing substitutes.',
        selenium:'Converts thyroid hormone into its active form.',
        zinc:'Normal testosterone in the blood.',
        'vitamin-d':'Behaves more like a hormone than a vitamin.',
        chromium:'Helps keep blood glucose normal.'}},
 {k:'skin', ico:'✨', n:'Skin, hair and nails',
  blurb:'All three are protein and are replaced constantly, so they show a shortfall before anything else does.',
  does:{zinc:'Normal skin, hair and nails.', selenium:'Normal hair and nails.',
        copper:'Normal skin and hair pigmentation.', protein:'What all three are built from.',
        'vitamin-a':'Normal skin maintenance.', 'vitamin-c':'Needed to make collagen.',
        'vitamin-b2':'Normal skin maintenance.', 'vitamin-pp':'Normal skin maintenance.',
        'vitamin-b7':'Normal hair and skin.', iodine:'Normal skin maintenance.',
        'vitamin-e':'Protects skin cells from oxidative damage.'}},
 {k:'cells', ico:'\u{1F52C}', n:'Cell protection',
  blurb:'Normal metabolism throws off reactive by-products. These are part of the enzymes that mop them up.',
  does:{selenium:'Part of glutathione peroxidase.', zinc:'Protects cells from oxidative stress.',
        copper:'Protects cells from oxidative stress.',
        manganese:'Protects cells from oxidative stress.',
        'vitamin-c':'Protects cells from oxidative stress.',
        'vitamin-e':'The main antioxidant inside cell membranes.',
        'vitamin-b2':'Protects cells from oxidative stress.'}},
 {k:'liver', ico:'\u{1F9EA}', n:'Liver and metabolism',
  blurb:'Everything you eat passes through here. This is the clean-up crew: handling fat, processing amino acids, keeping homocysteine down.',
  does:{choline:'Normal liver function and fat metabolism.',
        molybdenum:'Normal sulphur amino acid metabolism.',
        'vitamin-b9':'Normal amino acid synthesis.',
        'vitamin-b12':'Normal homocysteine metabolism.',
        'vitamin-b6':'Normal homocysteine and protein metabolism.',
        'vitamin-b2':'Normal metabolism of iron.',
        chromium:'Normal metabolism of the big three macros.'}}
];
// A system's nutrient list IS the keys of its `does` map, so nothing can be
// listed without an explanation of why it is there.
SYSTEMS.forEach(s=>{ s.all = Object.keys(s.does); });

// Protein is a macro, not a micronutrient, but three systems are built out of
// it and leaving it out would make them read worse than they are.
function proteinSpec(){
  const t = (targets && targets.protein) ? Number(targets.protein) : 150;
  return {k:'protein', n:'Protein', u:'g', rda:{m:t, f:t}, ul:null, isMacro:true};
}
// microTargetsFor does the work of turning a reference intake into today's
// target - sugar and saturated fat are a share of what you ate, not a fixed
// number, so they move with your calorie target.
function systemSpecs(entries){
  const by = {};
  microTargetsFor(entries || []).forEach(m=>{ by[m.k] = m; });
  by.protein = proteinSpec();
  return by;
}

// Nothing tracked may go unshown. If a nutrient is added to MICROS and no
// system claims it, this returns it and the panel says so on screen rather
// than silently leaving it out of every view.
function orphanNutrients(){
  const claimed = {};
  SYSTEMS.forEach(s=>s.all.forEach(k=>{ claimed[k] = true; }));
  return MICROS.map(m=>m.k).filter(k=>!claimed[k]);
}
function unknownInSystems(){
  const by = systemSpecs([]);
  const out = [];
  SYSTEMS.forEach(s=>s.all.forEach(k=>{ if(!by[k] && out.indexOf(k) < 0) out.push(k); }));
  return out;
}

// How well one system is fuelled today.
// A limit nutrient scores full marks until it is exceeded and falls away after,
// because "more salt" is never the answer to a low heart score.
function systemState(sys, entries){
  entries = entries || [];
  const by = systemSpecs(entries);
  const seen = [], gap = [];
  let sum = 0;
  sys.all.forEach(k=>{
    const spec = by[k];
    if(!spec){ return; }
    const total = k === 'protein'
      ? entries.reduce((s,e)=>s + (Number(e.protein)||0), 0)
      : entries.reduce((s,e)=>{ const v = microValue(spec, e); return s + (v || 0); }, 0);
    const any = k === 'protein'
      ? entries.some(e=>e.protein != null)
      : entries.some(e=>microValue(spec, e) !== undefined);
    if(!any){ gap.push(k); return; }
    const target = Number(spec.target != null ? spec.target : (spec.rda && spec.rda.m));
    if(!(target > 0)){ gap.push(k); return; }
    const pct = total / target * 100;
    seen.push({k:k, spec:spec, total:total, target:target, pct:pct});
    sum += spec.limit ? Math.max(0, 100 - Math.max(0, pct - 100)) : Math.min(100, pct);
  });
  const total = seen.length + gap.length;
  return {
    sys: sys, seen: seen, gap: gap, total: total,
    coverage: total ? seen.length / total : 0,
    pct: seen.length ? Math.round(sum / seen.length) : null
  };
}

// A percentage built on a third of the evidence is not a percentage. Below
// two-thirds coverage the number is withheld and the bar shows how much of the
// system can be seen at all - otherwise "Thyroid 100%" reads as reassurance
// when what it means is "we found the one nutrient we can measure".
const SYSTEM_COVERAGE_OK = 0.66;

/* What a single food is FOR.

   Every system is a list of nutrients, and the scorer already works out how
   much of each one a food carries for the calories it costs - 1.0 meaning
   "exactly the density your whole day needs". Averaging those ratios across a
   system's nutrients answers the question you actually want answered when you
   scan something: what is this good for?

   Only systems with at least half their nutrients on record are named. A
   system judged on one figure out of eight is a guess, and "great for thyroid"
   off the back of a single number is the kind of claim a packet makes.        */
const SYS_BANDS = [[2.15, 'Exceptional'], [1.75, 'Great'], [1.35, 'Good']];
/* Which of a system's nutrients COULD ever be measured. A system's list
   includes things that are not nutrients to get more of - gut names free sugar
   and total sugar as well as fibre - and the amino acids are worked out from
   protein, so counting them counts protein three times. Neither belongs in the
   sum, and neither belongs in "how much of this system can be seen" either,
   which is what made a food with fibre and nothing else read as a full house
   for the gut. */
const SYS_SKIP = {leucine:1, lysine:1, methionine:1};
let sysGoodKeys = null;
function systemCountable(sys){
  if(!sysGoodKeys){
    sysGoodKeys = {protein: 1};
    try{ qTargets().good.forEach(g=>{ sysGoodKeys[g.k] = 1; }); }catch(e){}
  }
  return (sys.all || []).filter(k=>!SYS_SKIP[k] && sysGoodKeys[k]);
}
function systemStrength(f, limit){
  if(!f || typeof SYSTEMS === 'undefined') return [];
  let nd = null;
  try{ nd = nutrientDensity(f); }catch(e){ return []; }
  if(!nd || !nd.rat) return [];
  const out = [];
  SYSTEMS.forEach(sys=>{
    const keys = systemCountable(sys);
    if(keys.length < 2) return;
    /* The nutrient the system is named for counts double. A plain average
       makes chicken ordinary for muscle, because muscle's list also names the
       calcium and vitamin D that fire and reset the contraction - real, but
       not what you reach for chicken for. */
    let sum = 0, n = 0, wt = 0;
    keys.forEach((k, i)=>{
      const r = nd.rat[k];
      if(r == null || !isFinite(r)) return;
      const w = i === 0 ? 2 : 1;
      sum += r * w; n++; wt += w;
    });
    if(n < 2 || n / keys.length < 0.6) return;
    /* The nutrient a system is really about is the one it is listed under
       first - fibre for the gut, calcium for bone, iron for blood. Without
       this, white bread came out "good for gut and digestion": UK flour is
       fortified with niacin, niacin is on the gut's list, and one spike was
       enough to carry a food with less fibre than average. If a food is short
       on the nutrient the system is named for, it is not a food for that
       system, whatever else it happens to carry. */
    const prime = keys[0];
    const pr = nd.rat[prime];
    if(pr != null && isFinite(pr) && pr < 1) return;
    const mean = sum / wt;
    let band = null;
    for(const [cut, word] of SYS_BANDS) if(mean >= cut){ band = word; break; }
    if(!band) return;
    out.push({k: sys.k, n: sys.n, ico: sys.ico, mean: mean, band: band, seen: n, of: keys.length});
  });
  out.sort((a,b)=>b.mean - a.mean);
  return limit > 0 ? out.slice(0, limit) : out;
}
function systemTrusted(st){ return st.coverage >= SYSTEM_COVERAGE_OK; }


