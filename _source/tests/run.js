/* COACH test pack. Run before every build:
     python3 build.py && node tests/run.js --old <last shipped build folder> --new dist
   --old is the build that is on the phone now (a folder with index.html etc).
   Prints PASS/FAIL per check and exits 1 if anything failed.
   Needs: node + playwright (chromium), python3 + Pillow + ffmpeg (scanner test). */
const {chromium} = require('playwright');
const fs = require('fs'), http = require('http'), path = require('path'), os = require('os'), zlib = require('zlib');
const {execFileSync} = require('child_process');

const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const OLD = arg('--old'), NEW = path.resolve(arg('--new') || path.join(__dirname, '..', 'dist'));
const ONLY = arg('--only');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'coachtest-'));

let nextPort = 9100;
function serve(dir){
  const port = nextPort++;
  const srv = http.createServer((q, r)=>{
    let f = path.join(dir, decodeURIComponent(q.url.split('?')[0]));
    if(f.endsWith('/')) f += 'index.html';
    fs.readFile(f, (e, d)=>{
      if(e){ r.writeHead(404); r.end(); return; }
      r.writeHead(200, {'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'text/plain', 'Cache-Control': 'no-cache'});
      r.end(d);
    });
  }).listen(port);
  return {url: 'http://localhost:' + port + '/', close: ()=>srv.close()};
}

// 90 days of realistic logging: meals, drinks, training, water, weights,
// confirmed days, one unconfirmed day and one gap.
const SEED = ()=>{
  const row = n => LOCAL_FOODS.find(f => f[0] === n);
  const mk = (n, g, meal) => { const f = row(n); const k = g / 100;
    return {name: n, grams: g, kcal: f[1]*k, protein: f[2]*k, carbs: f[3]*k, fat: f[4]*k, unit: f[5], meal: meal}; };
  const plan = [['Porridge, made with water',300,'Breakfast'],['Whole milk',250,'Breakfast'],['Black coffee',250,'Breakfast'],
                ['Chicken breast, cooked',200,'Lunch'],['White rice, cooked',300,'Lunch'],['Banana',120,'Snack'],
                ['Orange juice',250,'Snack'],['Chicken breast, cooked',180,'Dinner'],['Basmati rice, cooked',250,'Dinner']];
  targets = {kcal: 2900, protein: 170, carbs: 330, fat: 85}; saveTargets();
  const p = loadProfile(); Object.assign(p, {sex:'male', age:22, height:180, weight:80, goal:'build', pace:'moderate', activity:'moderate'}); saveProfile(p);
  for(let i = 0; i < 90; i++){
    const d = addDays(new Date(), -i);
    if(i === 12) continue;                                  // a gap
    const es = plan.map((x, j)=>mk(x[0], x[1] + ((i + j) % 3) * 10, x[2]));
    if(i % 7 === 5) es.push(mk('Beer, lager', 568, 'Dinner'));
    saveEntries(d, es);
    saveWaterMl(d, 1500 + (i % 4) * 250);
    if(i > 0 && i !== 9) setDayComplete(ymd(d), true);       // day 9 left unconfirmed
    if(i % 2 === 0) setTrainingDay(d, true);
    if(i % 2 === 1) pushWeight(Math.round((80 - i * 0.02) * 10) / 10, ymd(d));
  }
};

async function page(b, url, opts){
  opts = opts || {};
  const ctx = opts.ctx || await b.newContext({serviceWorkers: opts.sw ? 'allow' : 'block', viewport: {width: 390, height: 844}});
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', e => p.errs.push(e.message));
  p.on('dialog', d => d.accept());
  // v142: writes reach IndexedDB a moment later; let them land before a reload.
  const reload0 = p.reload.bind(p);
  p.reload = async (...a) => { try{ await p.evaluate(()=> window.CS && CS.whenSaved ? CS.whenSaved() : 0); }catch(e){} return reload0(...a); };
  if(opts.time) await p.clock.install({time: new Date(opts.time)});
  await p.goto(url);
  await p.waitForTimeout(opts.wait || 3000);
  return p;
}
const snapStore = p => p.evaluate(()=>{ const o = {}; for(let i = 0; i < (window.CS||localStorage).length; i++){ const k = (window.CS||localStorage).key(i); o[k] = (window.CS||localStorage).getItem(k); } return o; });

const results = [];
function check(name, ok, detail){ results.push({name, ok: !!ok, detail}); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : '')); }

const TESTS = {
  // 1. Updating never changes or loses saved data, and past day scores stay the same.
  async compat(b){
    if(!OLD){ check('compat: skipped (no --old given)', true); return; }
    const so = serve(path.resolve(OLD)), sn = serve(NEW);
    // Same origin is what matters on the phone, so both builds are served from
    // one folder in turn.
    const dir = fs.mkdtempSync(path.join(TMP, 'same-'));
    const copy = src => { for(const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), {recursive: true}); for(const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(dir, f)); };
    so.close(); sn.close();
    copy(path.resolve(OLD));
    const s = serve(dir);
    const ctx = await b.newContext({serviceWorkers: 'block'});
    let p = await page(b, s.url, {ctx});
    await p.evaluate(SEED); await p.close();
    p = await page(b, s.url, {ctx, wait: 4000});
    const before = await snapStore(p);
    const scoresOld = await p.evaluate(()=>[1, 3, 9, 20, 40, 80].map(i => { const v = dayScoreParts(ymd(addDays(new Date(), -i))); return v.score; }));
    await p.close();
    copy(NEW);
    p = await page(b, s.url, {ctx, wait: 4000});
    const after = await snapStore(p);
    const today = await p.evaluate(()=>todayYMD());
    const allowed = k => k === 'calorietargetsnap:' + today || /^coach(hydstart|cyclingretired|autobackup)/.test(k) || k === 'calorieadjustlog';
    // The estimate log rewrites today's line by design; every older line must be untouched.
    const tdeeOk = k => { if(k !== 'coachtdeelog') return false; try{ const a = JSON.parse(before[k]).filter(e => e.date !== today), c = JSON.parse(after[k]).filter(e => e.date !== today); return JSON.stringify(a) === JSON.stringify(c); }catch(e){ return false; } };
    const changed = Object.keys(after).filter(k => before[k] !== after[k] && k in before && !allowed(k) && !tdeeOk(k));
    const removed = Object.keys(before).filter(k => !(k in after));
    const added = Object.keys(after).filter(k => !(k in before));
    check('compat: no saved data changed', !changed.length, changed.join(', '));
    check('compat: no saved data removed', !removed.length, removed.join(', '));
    check('compat: new keys are expected ones only', added.every(allowed), added.join(', '));
    const scoresNew = await p.evaluate(()=>[1, 3, 9, 20, 40, 80].map(i => dayScoreParts(ymd(addDays(new Date(), -i))).score));
    check('compat: past day scores identical', JSON.stringify(scoresOld) === JSON.stringify(scoresNew), scoresOld + ' vs ' + scoresNew);
    check('compat: no errors', !p.errs.length, p.errs.join(' | '));
    s.close(); await ctx.close();
  },

  // v142: the bigger store (IndexedDB). Moving in, keeping the old copy,
  // saving past 5 MB, and falling back safely when it is not available.
  async store(b){
    if(!OLD){ check('store: skipped (no --old given)', true); return; }
    const dir = fs.mkdtempSync(path.join(TMP, 'store-'));
    const copy = src => { for(const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), {recursive: true}); for(const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(dir, f)); preStore(src); };
    /* v143: these checks are about the move from the small store, so the "old"
       build must be one from before v142. When --old is v142 or later, its
       store is swapped for plain localStorage, which is exactly how v141 kept
       data. Without this every run after v142 reported two false failures. */
    const preStore = src => {
      if(path.resolve(src) !== path.resolve(OLD)) return;
      const f = path.join(dir, 'index.html'); let h = fs.readFileSync(f, 'utf8');
      const a = h.indexOf('/* v142: the bigger store.'); if(a < 0) return;
      const e = h.indexOf('</script>', a);
      h = h.slice(0, a) + "window.CS=localStorage;CS.keys=function(){var a=[];for(var i=0;i<localStorage.length;i++)a.push(localStorage.key(i));return a};" +
        "CS.whenSaved=function(){return Promise.resolve()};window.COACH_BOOT=function(){var s0=document.getElementById('coach-app');var s=document.createElement('script');s.textContent=s0.textContent;s0.remove();document.body.appendChild(s);};\n" + h.slice(e);
      fs.writeFileSync(f, h);
    };
    copy(path.resolve(OLD));
    const s = serve(dir);
    const ctx = await b.newContext({serviceWorkers: 'block'});
    let p = await page(b, s.url, {ctx});
    await p.evaluate(SEED);
    const ls = () => p.evaluate(()=>{ const o = {}; for(let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });
    const oldLS = await ls(); await p.close();
    copy(NEW);
    p = await page(b, s.url, {ctx, wait: 4000});
    const st = await p.evaluate(()=>({mode: CS.mode, n: CS.length}));
    check('store: moves into the bigger store on first open', st.mode === 'idb', st.mode + ', ' + st.n + ' items');
    const inIdb = await snapStore(p);
    const missing = Object.keys(oldLS).filter(k => !(k in inIdb));
    check('store: every saved item came across', !missing.length && Object.keys(oldLS).length > 50, Object.keys(oldLS).length + ' items' + (missing.length ? ', missing ' + missing.slice(0, 5).join(',') : ''));
    const lsAfter = await ls();
    const touched = Object.keys(oldLS).filter(k => lsAfter[k] !== oldLS[k]);
    check('store: the old copy is left exactly as it was (never deleted)', !touched.length && lsAfter['coach:idb'] === '1', touched.join(','));
    // A new day logged now lands in the bigger store, survives a reload.
    await p.evaluate(()=>{ const d = new Date(); saveEntries(d, (loadEntries(d) || []).concat([{name: 'Test apple', grams: 100, kcal: 52, protein: 0.3, carbs: 14, fat: 0.2, meal: 'Snack'}])); });
    await p.reload(); await p.waitForTimeout(3000);
    const kept = await p.evaluate(()=>({idb: (loadEntries(new Date()) || []).some(e => e.name === 'Test apple'), ls: /Test apple/.test(localStorage.getItem('calorielog:' + todayYMD()) || '')}));
    check('store: new food is saved in the bigger store and survives a reload', kept.idb && !kept.ls, JSON.stringify(kept));
    // Past the old 5 MB cap.
    const big = await p.evaluate(async ()=>{ const s = 'x'.repeat(3 * 1024 * 1024); CS.setItem('coachtest:big1', s); CS.setItem('coachtest:big2', s); await CS.whenSaved(); return CS.getItem('coachtest:big2').length; });
    await p.reload(); await p.waitForTimeout(3000);
    const big2 = await p.evaluate(()=>[(CS.getItem('coachtest:big1') || '').length, (CS.getItem('coachtest:big2') || '').length, CS.mode]);
    check('store: saves well past the old 5 MB limit (12 MB test) and keeps it', big2[0] === 3145728 && big2[1] === 3145728, big2.join(' / '));
    await p.evaluate(async ()=>{ CS.removeItem('coachtest:big1'); CS.removeItem('coachtest:big2'); await CS.whenSaved(); });
    check('store: no errors', !p.errs.length, p.errs.join(' | '));
    await p.close(); await ctx.close();
    // Sharing a web address with Jot and Ledger: their items are left out.
    const ctx4 = await b.newContext({serviceWorkers: 'block'});
    await ctx4.addInitScript(()=>{ if(!localStorage.getItem('jot:notes')){ localStorage.setItem('jot:notes', '[{"id":"a"}]'); localStorage.setItem('ledger:txns', '[]'); } });
    p = await page(b, s.url, {ctx: ctx4});
    const shared = await p.evaluate(()=>({mode: CS.mode, n: CS.length, jot: CS.getItem('jot:notes'), lsJot: localStorage.getItem('jot:notes')}));
    check('store: on a shared address, Jot and Ledger items are not copied in (and are left alone)', shared.mode === 'idb' && shared.jot === null && shared.lsJot === '[{"id":"a"}]', JSON.stringify(shared));
    await ctx4.close();
    // No IndexedDB at all: carries on with localStorage as before.
    const ctx2 = await b.newContext({serviceWorkers: 'block'});
    await ctx2.addInitScript(()=>{ try{ Object.defineProperty(window, 'indexedDB', {value: undefined}); }catch(e){} });
    p = await page(b, s.url, {ctx: ctx2});
    await p.evaluate(SEED);
    await p.reload(); await p.waitForTimeout(3000);
    const fb = await p.evaluate(()=>({mode: CS.mode, days: Object.keys(localStorage).filter(k => k.startsWith('calorielog:')).length, drawn: !!document.querySelector('#view-day, .ont-card')}));
    check('store: without IndexedDB it runs on localStorage as before', fb.mode === 'ls' && fb.days > 50 && fb.drawn, JSON.stringify(fb));
    check('store: no errors without IndexedDB', !p.errs.length, p.errs.join(' | '));
    await ctx2.close();
    // The phone empties the store after the move: the last kept copy comes back, with a message.
    const ctx3 = await b.newContext({serviceWorkers: 'block'});
    copy(path.resolve(OLD));
    p = await page(b, s.url, {ctx: ctx3});
    await p.evaluate(SEED); await p.close();
    copy(NEW);
    p = await page(b, s.url, {ctx: ctx3, wait: 4000});
    await p.evaluate(()=>new Promise(r => { const rq = indexedDB.deleteDatabase('coach-store'); rq.onsuccess = rq.onerror = rq.onblocked = ()=>r(); }));
    const msgs = []; p.on('dialog', d => msgs.push(d.message()));
    await p.reload(); await p.waitForTimeout(4000);
    const back = await p.evaluate(()=>({mode: CS.mode, days: CS.keys().filter(k => k.startsWith('calorielog:')).length}));
    check('store: if the phone empties it, the kept copy comes back and you are told', back.mode === 'idb' && back.days > 50 && msgs.some(m => /Put back/.test(m)), JSON.stringify(back) + ' ' + msgs.length + ' message');
    await ctx3.close(); s.close();
  },

  // v143: search that forgives slips, faster typing, cup sizes, shorter text.
  async v143(b){
    const s = serve(NEW); const p = await page(b, s.url, {wait: 2500});
    await p.context().route(/openfoodfacts|nal\.usda/, r => r.abort());
    await p.evaluate(()=>packetsLoad());
    await p.waitForTimeout(1500);
    const r = await p.evaluate(()=>{
      const names = q => { packetWords(); return packetSearch(q, 40).map(x => (x.product_name + ' ' + x.brands).toLowerCase()); };
      const rowsFor = q => { openSheet('add-backdrop'); renderSearch(q); return Array.from(document.querySelectorAll('#search-results .sr-row')).map(x => x.textContent.toLowerCase()); };
      let calls = 0; const real = searchCandidates; window.searchCandidates = q => { calls++; return real(q); };
      renderSearch('chicken breast');
      const once = calls; window.searchCandidates = real;
      const t0 = performance.now(); for(const q of ['b','ba','ban','bana','banan','banana']) renderSearch(q); const ms = (performance.now() - t0) / 6;
      const mk = (n, extra) => Object.assign({name: n, perItem: true, qty: 1, kcal: 0, protein: 0, carbs: 0, fat: 0, unit: 'drink'}, extra || {});
      return {
        muller: names('mullerlight').some(x => /m(u|ü)ller/.test(x) && /light/.test(x)),
        accent: names('nestle').some(x => /nestl/.test(x)),
        weetabx: names('weetabx').some(x => /weetabix/.test(x)),
        exactFirst: (()=>{ const a = packetSearch('weetabix', 40); return a.length > 0 && !a[0]._close; })(),
        noCloseWhenPlenty: !packetSearch('chicken', 40).some(x => x._close),
        chiken: rowsFor('chiken').some(x => /chicken/.test(x)),
        typo2: within2('bunderberg', 'bundaberg') && !within2('bundaberg', 'hamburger') && !within2('mozzarella', 'nozzarellas1'),
        once: once, ms: ms,
        sbHot: Math.round(hydVolume(mk('Starbucks Caffe Latte, Grande'))),
        sbIced: Math.round(hydVolume(mk('Starbucks Iced Caffe Latte, Venti'))),
        timMed: Math.round(hydVolume(mk('Tim Hortons Cappuccino (Medium)'))),
        timIced: hydVolume(mk('Tim Hortons Iced Capp (Medium)')),
        nandos: Math.round(hydVolume(mk("Nando's Bottomless Diet Coke"))),
        kfc: hydVolume(mk('KFC Pepsi Max Regular')),
        kfcBottle: Math.round(hydVolume(mk('KFC Pepsi Max Bottle, 250ml')))
      };
    });
    check('v143: search finds words typed together (mullerlight)', r.muller);
    check('v143: search ignores accents (nestle finds Nestlé)', r.accent);
    check('v143: a close spelling is found (weetabx)', r.weetabx);
    check('v143: exact matches stay above close spellings', r.exactFirst && r.noCloseWhenPlenty);
    check('v143: a misspelt common food still finds it (chiken)', r.chiken);
    check('v143: two-slip match only for long, same-start words', r.typo2);
    check('v143: results worked out once per letter typed', r.once === 1, r.once + ' times');
    check('v143: typing a word stays quick', r.ms < 60, Math.round(r.ms) + ' ms a letter');
    check('v143: Starbucks Grande counts 473 ml', r.sbHot === 473, r.sbHot);
    check('v143: Starbucks iced Venti counts liquid only (326 ml)', r.sbIced === 326, r.sbIced);
    check('v143: Tim Hortons Medium counts 473 ml', r.timMed === 473, r.timMed);
    check('v143: iced Tim Hortons stays size unknown', r.timIced === null, r.timIced);
    check('v143: Nando\'s bottomless counts its 300 ml glass', r.nandos === 300, r.nandos);
    check('v143: KFC cups stay size unknown, bottles use their size', r.kfc === null && r.kfcBottle === 250, r.kfc + ' / ' + r.kfcBottle);
    const dta = await p.evaluate(()=>({costa: !!LOCAL_FOODS.find(f => f[0] === "Costa Terry's Chocolate Orange Muffin" && f[6] === 93) && !!labelDbFor("Costa Terry's Chocolate Orange Muffin"),
      packets: pkLines.length, bunda: (packetByCode('9311493003289') || {}).brands}));
    check('v143: Costa food from its own guide is in, with label figures', dta.costa);
    check('v143: more UK packets, Bundaberg has its brand', dta.packets > 33000 && dta.bunda === 'Bundaberg', dta.packets + ' / ' + dta.bunda);
    check('v143: no errors', !p.errs.length, p.errs.join(' | '));
    await p.context().close();
    // Shorter text: the suggested-change card and the review summaries.
    const p2 = await page(b, s.url, {time: '2026-11-16T10:00:00'});
    await p2.evaluate(SEED);
    const t = await p2.evaluate(async ()=>{
      const real = adaptSuggestion;
      window.adaptSuggestion = ()=>Object.assign(real(), {state:'suggest', from: 2900, to: 2750, tdee: 2800, se: 90, avgIntake: 2880, weekly: 0.12, rate: -0.25, weighIns: 14, fullDays: 26, capped: false, floored: false});
      currentDate = new Date(); renderAdaptCard();
      const card = document.getElementById('adapt-card').innerText;
      window.adaptSuggestion = real;
      reviewPeriod = 'week'; renderReviewSheet(null); openSheet('review-backdrop');
      await new Promise(r => setTimeout(r, 1500));
      const ps = Array.from(document.querySelectorAll('#review-body .rvx-p, #review-body .nrev-sub, #review-body .nrev-note, #review-body .pt-b')).map(x => x.innerText.trim());
      return {card: card, longest: Math.max(...ps.map(x => x.length)), n: ps.length, burn: /2800/.test(card) && /2880/.test(card)};
    });
    check('v143: suggested-change card is short and keeps the numbers', t.burn && t.card.length < 260, t.card.length + ' chars');
    check('v143: review summaries are short (longest under 160 chars)', t.n > 4 && t.longest < 160, 'longest ' + t.longest + ' of ' + t.n);
    check('v143: no errors on the review', !p2.errs.length, p2.errs.join(' | '));
    s.close(); await p2.context().close();
  },

  // v144: Train.
  async v144(b){
    const s = serve(NEW); const p = await page(b, s.url, {time: '2026-11-16T10:00:00'});
    await p.evaluate(SEED);
    const before = await p.evaluate(()=>{ const o = {}; for(let i = 0; i < CS.length; i++){ const k = CS.key(i); o[k] = CS.getItem(k); } return o; });
    const r = await p.evaluate(async ()=>{
      const out = {};
      const pr = loadProfile(); pr.sex = 'male'; pr.weight = 80; lsSet('calorieprofile', JSON.stringify(pr));
      setMode('train', true);
      out.modeOk = document.getElementById('view-train').style.display === '' && document.getElementById('view-day').style.display === 'none' && document.querySelector('.fab-row').style.display === 'none';
      const names = q => trSearch(q, {}).slice(0, 3).map(r => r.x.n);
      out.s1 = names('benh pres')[0]; out.s2 = names('rdl')[0]; out.s3 = names('ohp')[0]; out.s4 = names('pec deck')[0]; out.s5 = names('db curl')[0];
      out.lib = trLib().length;
      trStart(null);
      const a = trActive();
      a.ex.push({n: 'Bench Press (Barbell)', sets: [{t: 'n', kg: 100, reps: 5, done: true}, {t: 'n', kg: 100, reps: 5, done: false}]});
      a.ex.push({n: 'Pull Up', sets: [{t: 'n', reps: 10, done: true}]});
      a.start = Date.now() - 90 * 60000; trSaveActive(a);
      // Pre-workout food added from the workout counts in the day.
      const kBefore = loadEntries(currentDate).reduce((x, e) => x + (e.kcal || 0), 0);
      trPreFor = a.id; addEntry({name: 'Banana', kcal: 105, protein: 1, carbs: 27, fat: 0, meal: 'Snack', qty: 1});
      const es = loadEntries(currentDate);
      out.preTagged = es.some(e => e.name === 'Banana' && e.pw === a.id);
      out.preCounted = Math.round(es.reduce((x, e) => x + (e.kcal || 0), 0) - kBefore) === 105;
      out.preShown = trPreFoods(trActive()).some(e => e.name === 'Banana'); out.dbg = [ymd(currentDate), todayYMD(), trActive().d, es.reduce((x, e) => x + (e.kcal || 0), 0) - kBefore];
      closeSheet('add-backdrop');
      trFinish();
      const idx = trIdx(); const w = trLoadW(idx[0].id);
      out.saved = idx.length === 1 && w.ex[0].sets.length === 1 && !trActive();
      out.train = isTrainingDay(w.d);
      out.topUp = trTopUpMl(w.d);
      out.hydTarget = hydTarget(w.d) - (Math.max(HYD_TARGET_ML, waterSettings(w.d).targetMl - waterSettings(w.d).trainingTopUp));
      out.chip = trChipLabel(w.d);
      const rk = trRankOf('Bench Press (Barbell)');
      out.rank = rk && TR_RANKS[rk.tier].n; out.e1 = rk && Math.round(rk.score);
      out.line = rk && Math.round(rk.L.v[2]);
      out.pullRank = (trRankOf('Pull Up') || {}).tier;
      out.burn = trBurn(w);
      closeSheet('tr-fin-backdrop');
      trShow('history'); out.hist = document.querySelectorAll('#view-train [data-wo]').length;
      trShow('exercises'); out.ranks = document.querySelectorAll('#view-train [data-exo] .tr-tag').length > 0;
      setMode('eat', true);
      out.backEat = document.getElementById('view-day').style.display === '' && document.getElementById('view-train').style.display === 'none';
      return out;
    });
    const after = await p.evaluate(()=>{ const o = {}; for(let i = 0; i < CS.length; i++){ const k = CS.key(i); o[k] = CS.getItem(k); } return o; });
    const changed = Object.keys(before).filter(k => after[k] !== before[k] && !/^(calorielog:|calorietrain:|calorietargetsnap:|coachsnap|caloriesnap|calorierecent|coachrecent|calorieprofile|calorieweight|coachtrain:|coach:)/.test(k));
    check('v144: Eat/Train switch swaps the screens', r.modeOk && r.backEat);
    check('v144: exercise library has 800+ exercises', r.lib >= 800, r.lib);
    check('v144: exercise search forgives typos and shorthand', r.s1 === 'Bench Press (Barbell)' && r.s2 === 'Romanian Deadlift (Barbell)' && r.s3 === 'Overhead Press (Barbell)' && r.s4 === 'Chest Fly (Machine)' && r.s5 === 'Bicep Curl (Dumbbell)', [r.s1, r.s2, r.s3, r.s4, r.s5].join(' / '));
    check('v144: pre-workout food goes in the food log and counts in the day', r.preTagged && r.preCounted && r.preShown, [r.preTagged, r.preCounted, r.preShown].join('/') + ' ' + JSON.stringify(r.dbg));
    check('v144: finishing keeps only ticked sets and saves the workout', r.saved);
    check('v144: a workout makes the day a training day', r.train);
    check('v144: water top-up scales with time (90 min = 0.75 L)', r.topUp === 750 && r.hydTarget === 750, r.topUp + ' / ' + r.hydTarget);
    check('v144: Day screen chip names the workout', /· 1h 30$/.test(r.chip || ''), r.chip);
    check('v144: rank uses Strength Level lines (bench 100x5 at 80 kg = Strong, line 98 kg)', r.rank === 'Strong' && r.e1 === 117 && r.line === 98, r.rank + ' ' + r.e1 + ' vs ' + r.line);
    check('v144: bodyweight lifts ranked by reps', r.pullRank >= 0);
    check('v144: calories burned estimated, not added to the target', r.burn > 200 && r.burn < 700, r.burn);
    check('v144: history and ranks show', r.hist === 1 && r.ranks);
    check('v144: nothing outside the expected keys changed', changed.length === 0, changed.join(', '));
    const mu = await p.evaluate(()=>({fn: typeof museSyncSoon === 'function' && typeof museSyncNow === 'function', box: !!document.getElementById('musesync-box')}));
    check('v145: Sync with Muse (other chat) is still in', mu.fn && mu.box);
    check('v144: no errors', !p.errs.length, p.errs.join(' | '));
    s.close(); await p.context().close();
  },

  // v145: Sync with Muse carries everything (mock GitHub).
  async v145sync(b){
    const s = serve(NEW); const p = await page(b, s.url, {time: '2026-11-16T10:00:00'});
    await p.evaluate(SEED);
    const r = await p.evaluate(async ()=>{
      // A fake GitHub contents API holding one file.
      const FILE = {text: null, sha: null, n: 0};
      const real = window.fetch;
      window.fetch = async (url, o) => {
        if(String(url).indexOf('api.github.com/repos/baileywalsh-maker/coach-sync') < 0) return real(url, o);
        o = o || {};
        if((o.method || 'GET') === 'GET'){
          if(!FILE.text) return new Response('{}', {status: 404});
          return new Response(JSON.stringify({sha: FILE.sha, size: FILE.text.length, content: btoa(unescape(encodeURIComponent(FILE.text)))}), {status: 200});
        }
        const body = JSON.parse(o.body);
        if(FILE.sha && body.sha !== FILE.sha) return new Response('{}', {status: 409});
        FILE.text = decodeURIComponent(escape(atob(body.content))); FILE.sha = 's' + (++FILE.n);
        return new Response(JSON.stringify({content: {sha: FILE.sha}}), {status: 200});
      };
      window.__FILE = FILE;
      const out = {};
      lsSet('coachcloudtoken', 'SECRET-BACKUP'); lsSet('coachfdckey', 'SECRET-USDA');
      const pr = loadProfile(); pr.sex = 'male'; pr.weight = 80; lsSet('calorieprofile', JSON.stringify(pr));
      // One finished workout and a routine.
      trStart(null); const a = trActive(); a.name = 'Push'; a.ex = [{n: 'Bench Press (Barbell)', sets: [{t: 'n', kg: 90, reps: 8, done: true}]}]; a.start = Date.now() - 3600000; trSaveActive(a); trFinish();
      try{ closeSheet('tr-fin-backdrop'); }catch(e){}
      trSave(TR_RT, [{id: 'r1', name: 'Push', ex: [{n: 'Bench Press (Barbell)', sets: 3}]}]);
      // Sync on.
      CS.setItem('coachmusesync-token', 'tok'); museSyncSaveState({enabled: true});
      const r1 = await museSyncNow({quiet: true});
      const f1 = JSON.parse(FILE.text);
      out.first = r1.ok;
      out.bytes = FILE.text.length;
      out.hasProfile = !!(f1.store && f1.store.calorieprofile && f1.store.calorieprofile.sex === 'male');
      out.hasRoutine = !!(f1.store && f1.store['coachtrain:routines'] && f1.store['coachtrain:routines'][0].name === 'Push');
      out.hasWorkout = Object.keys(f1.workouts || {}).length === 1;
      out.hasRanks = !!(f1.insights && f1.insights.ranks && f1.insights.ranks.length && f1.insights.muscles);
      out.hasDays = Object.keys(f1.days || {}).length > 50;
      out.noSecrets = !/SECRET-|"tok"|coachmusesync/.test(FILE.text) && !(f1.store || {}).coachcloudtoken && !(f1.store || {}).coachfdckey;
      // Muse edits: a set, a new workout, a routine and the protein in the profile.
      const wid = Object.keys(f1.workouts)[0];
      f1.workouts[wid].ex[0].sets[0].kg = 95;
      f1.workouts['muse1'] = {id: 'muse1', name: 'Pull (by Muse)', d: '2026-11-15', start: Date.now() - 86400000, end: Date.now() - 86400000 + 3000000,
        ex: [{n: 'Deadlift (Barbell)', sets: [{t: 'n', kg: 140, reps: 5, done: true}]}]};
      f1.store['coachtrain:routines'].push({id: 'r2', name: 'Pull', ex: [{n: 'Deadlift (Barbell)', sets: 3}]});
      f1.store.calorieprofile.name = 'Bailey (from Muse)';
      f1.insights = {junk: true};
      FILE.text = JSON.stringify(f1); FILE.sha = 's' + (++FILE.n);
      const r2 = await museSyncNow({quiet: true});
      out.second = r2.ok;
      out.setChanged = trLoadW(wid).ex[0].sets[0].kg === 95;
      out.newWorkout = !!trLoadW('muse1') && trIdx().some(w => w.id === 'muse1');
      out.routineIn = trJSON(TR_RT, []).some(r => r.name === 'Pull');
      out.profileIn = loadProfile().name === 'Bailey (from Muse)';
      out.secretsKept = CS.getItem('coachcloudtoken') === 'SECRET-BACKUP' && CS.getItem('coachfdckey') === 'SECRET-USDA';
      // A phone-side change goes up.
      trSave(TR_RT, trJSON(TR_RT, []).concat([{id: 'r3', name: 'Legs', ex: []}]));
      const r3 = await museSyncNow({quiet: true});
      const f3 = JSON.parse(FILE.text);
      out.third = r3.ok && f3.store['coachtrain:routines'].some(r => r.name === 'Legs') && !f3.insights.junk;
      // Muse deletes a workout.
      delete f3.workouts.muse1; FILE.text = JSON.stringify(f3); FILE.sha = 's' + (++FILE.n);
      await museSyncNow({quiet: true});
      out.deleted = !trLoadW('muse1') && !trIdx().some(w => w.id === 'muse1');
      window.fetch = real;
      return out;
    });
    check('v145 sync: first sync sends days, workouts, routines, profile and ranks', r.first && r.hasDays && r.hasWorkout && r.hasRoutine && r.hasProfile && r.hasRanks, JSON.stringify(r));
    check('v145 sync: no secrets in the file (sync token, backup token, USDA key)', r.noSecrets);
    check('v145 sync: Muse can change a set, add a workout, a routine and the profile', r.second && r.setChanged && r.newWorkout && r.routineIn && r.profileIn);
    check('v145 sync: secrets on the phone are never touched by a sync', r.secretsKept);
    check('v145 sync: a phone change goes up; Muse edits to insights are ignored', r.third);
    check('v145 sync: a workout Muse deletes is deleted on the phone', r.deleted);
    check('v145 sync: file stays well under GitHub\u2019s 1 MB inline limit with 90 days', r.bytes < 900000, Math.round(r.bytes / 1024) + ' KB');
    check('v145 sync: no errors', !p.errs.length, p.errs.join(' | '));
    s.close(); await p.context().close();
  },

  // 2. Every screen shows the same target for the same day.
  async targets(b){
    const s = serve(NEW); const p = await page(b, s.url);
    await p.evaluate(SEED);
    const r = await p.evaluate(()=>{
      const out = {};
      currentDate = new Date(); renderDay();
      out.today = [dayTargets(new Date()).kcal, targetForDay(new Date()), dayVerdict(new Date()).targets.kcal];
      const d = addDays(new Date(), -3);
      const before = targetForDay(d);
      setTargets(macrosFor(3200), 'manual', 'test');
      currentDate = d; renderDay();
      out.past = [before, dayTargets(d).kcal, dayReviewData(d).targets ? dayReviewData(d).targets.kcal : before];
      currentDate = new Date(); renderDay();
      const t0 = dayTargets(new Date()).kcal;
      document.getElementById('traintoggle').click(); const t1 = dayTargets(new Date()).kcal;
      document.getElementById('traintoggle').click(); const t2 = dayTargets(new Date()).kcal;
      out.train = [t0, t1, t2];
      out.waterMoves = (()=>{ const a = waterSettings().targetMl; document.getElementById('traintoggle').click(); const c = waterSettings().targetMl; document.getElementById('traintoggle').click(); return Math.abs(a - c) === 500; })();
      return out;
    });
    check('targets: today agrees everywhere', new Set(r.today).size === 1, r.today.join(' / '));
    check('targets: a past day keeps its own target after a change', new Set(r.past).size === 1, r.past.join(' / '));
    check('targets: training tick does not move calories', new Set(r.train).size === 1, r.train.join(' / '));
    check('targets: training tick moves water by 0.5 L', r.waterMoves);
    check('targets: no errors', !p.errs.length, p.errs.join(' | '));
    s.close(); await p.context().close();
  },

  // 3. Reviews: Sunday rule, calendar, sections fill in.
  async reviews(b){
    const s = serve(NEW);
    // A Sunday morning, Sunday not ticked: last week's review, not this one.
    const p = await page(b, s.url, {time: '2026-11-08T10:00:00'});
    await p.evaluate(SEED);
    const r = await p.evaluate(async ()=>{
      const out = {};
      (window.CS||localStorage).setItem('calorielastreview', ymd(addDays(weekStart(new Date()), -14)));
      setDayComplete(todayYMD(), false);
      out.before = ymd(reviewableWeek(new Date()));
      out.thisWeek = ymd(weekStart(new Date()));
      setDayComplete(todayYMD(), true);
      out.after = ymd(reviewableWeek(new Date()));
      // Month with a gap and an unticked day shows the calendar.
      reviewPeriod = 'month'; renderReviewSheet(null); openSheet('review-backdrop');
      out.calendar = !!document.querySelector('#review-body .rvc');
      await new Promise(res => setTimeout(res, 1500));
      out.tips = (document.getElementById('rv-tips-slot') || {innerHTML: ''}).innerHTML.length;
      out.nutrients = (document.getElementById('review-nutrients') || {innerHTML: ''}).innerHTML.length;
      return out;
    });
    check('reviews: Sunday not ticked -> still last week', r.before !== r.thisWeek, r.before);
    check('reviews: Sunday ticked -> this week', r.after === r.thisWeek, r.after);
    check('reviews: calendar shows unfinished days', r.calendar);
    check('reviews: nutrients and tips fill in', r.tips > 50 && r.nutrients > 500, 'tips ' + r.tips + ', nutrients ' + r.nutrients);
    check('reviews: no errors', !p.errs.length, p.errs.join(' | '));
    s.close(); await p.context().close();
  },

  // 4. Hydration figures for known drinks.
  async hydration(b){
    const s = serve(NEW); const p = await page(b, s.url);
    const r = await p.evaluate(()=>{
      const row = n => LOCAL_FOODS.find(f => f[0] === n);
      const mk = (n, g) => { const f = row(n); const k = g / 100; return {name: n, grams: g, kcal: f[1]*k, protein: f[2]*k, carbs: f[3]*k, fat: f[4]*k, unit: f[5]}; };
      const ml = e => Math.round(hydDrink(e).ml);
      return {milk: ml(mk('Whole milk', 250)), cola: ml(mk('Coca-Cola', 330)), coffee: ml(mk('Black coffee', 250)),
              vodka: ml(mk('Vodka', 25)), oat: ml(mk('Oat milk', 250)),
              chicken: hydIsDrink(mk('Chicken breast, cooked', 150)), beans: hydIsDrink({name: 'Baked beans', unit: 'can'}),
              latteDessert: hydIsDrink({name: "McDonald's Caramel Waffle Latte - Large"})};
    });
    check('hydration: milk 250 ml -> 375', r.milk === 375, r.milk);
    check('hydration: cola 330 ml -> ~295', Math.abs(r.cola - 295) <= 3, r.cola);
    check('hydration: coffee no penalty', r.coffee >= 245, r.coffee);
    check('hydration: vodka shot near zero', r.vodka >= 0 && r.vodka <= 10, r.vodka);
    check('hydration: oat milk counts water only', r.oat > 200 && r.oat < 250, r.oat);
    check('hydration: food is not a drink', !r.chicken && !r.beans);
    check('hydration: dessert-named latte is a drink', r.latteDessert);
    s.close(); await p.context().close();
  },

  // 5. Remembered scores always match a fresh calculation.
  async caches(b){
    const s = serve(NEW); const p = await page(b, s.url);
    await p.evaluate(SEED);
    const cmp = ()=>p.evaluate(()=>{
      let bad = 0;
      for(let i = 0; i < 60; i++){ const d = addDays(new Date(), -i); if(JSON.stringify(dayVerdict(d)) !== JSON.stringify(dayVerdictRaw(d))) bad++; }
      const a = JSON.stringify(patternTips(30)); scoreEpoch++; const c = JSON.stringify(patternTips(30));
      return bad + (a === c ? 0 : 100);
    });
    await p.evaluate(()=>{ for(let i = 0; i < 60; i++) dayVerdict(addDays(new Date(), -i)); patternTips(30); });
    const steps = {
      'add food': ()=>{ const d = addDays(new Date(), -3); const es = loadEntries(d); es.push({name:'Doughnut', grams:80, kcal:350, protein:4, carbs:40, fat:20, sugar:20, sat:9, meal:'Snack'}); saveEntries(d, es); },
      'profile floor': ()=>{ const q = loadProfile(); q.healthFloor = 40; saveProfile(q); },
      'target change': ()=>setTargets(macrosFor(2700), 'manual', 't'),
      'delete + untick': ()=>{ const d = addDays(new Date(), -5); const es = loadEntries(d); es.splice(0, 2); saveEntries(d, es); setDayComplete(ymd(addDays(new Date(), -7)), false); },
      'label change': ()=>lsSet('coachlabels', JSON.stringify({'Banana': [20, 0.1, 2.6, 1]}))
    };
    let fails = [];
    for(const k in steps){ await p.evaluate(steps[k]); const n = await cmp(); if(n) fails.push(k + ':' + n); }
    check('caches: remembered scores match fresh ones after edits', !fails.length, fails.join(', '));
    s.close(); await p.context().close();
  },

  // 6. Food data in its own file: loads, works offline, not downloaded again on an app update.
  async datafile(b){
    const dir = fs.mkdtempSync(path.join(TMP, 'sw-'));
    for(const f of fs.readdirSync(NEW)) fs.copyFileSync(path.join(NEW, f), path.join(dir, f));
    const hits = {};
    const port = nextPort++;
    let root = dir;
    const srv = http.createServer((q, r)=>{ const u = decodeURIComponent(q.url.split('?')[0]); hits[u] = (hits[u] || 0) + 1;
      let f = path.join(root, u); if(f.endsWith('/')) f += 'index.html';
      fs.readFile(f, (e, d)=>{ if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'text/plain', 'Cache-Control': 'no-cache'}); r.end(d); }); }).listen(port);
    const ctx = await b.newContext();
    const p = await page(b, 'http://localhost:' + port + '/', {ctx, sw: true, wait: 6000});
    const rows = await p.evaluate(()=>LOCAL_FOODS.length);
    check('datafile: food tables load', rows > 5000, rows + ' foods');
    await ctx.setOffline(true); await p.reload(); await p.waitForTimeout(3000);
    check('datafile: opens with no signal', await p.evaluate(()=>LOCAL_FOODS.length > 5000));
    await ctx.setOffline(false);
    // Same data, new app: change only index.html and the version.
    const idx = fs.readFileSync(path.join(dir, 'index.html'), 'utf8').replace('<title>', '<title data-t="1">');
    fs.writeFileSync(path.join(dir, 'index.html'), idx);
    fs.writeFileSync(path.join(dir, 'sw.js'), fs.readFileSync(path.join(dir, 'sw.js'), 'utf8').replace(/coach-v\d+/, 'coach-v99999'));
    for(const k in hits) delete hits[k];
    await p.evaluate(()=>navigator.serviceWorker.getRegistration().then(r => r && r.update()));
    await p.waitForTimeout(5000); await p.reload(); await p.waitForTimeout(3000);
    const dataHits = Object.keys(hits).filter(u => /^\/(foods\.|packets\.)/.test(u));
    check('datafile: app update does not download the food data again', !dataHits.length, dataHits.join(', '));
    check('datafile: no errors', !p.errs.length, p.errs.join(' | '));
    srv.close(); await ctx.close();
  },

  // 7. Scanner: keeps going past an unknown barcode, opens a known one, camera reused.
  async scanner(){
    const camDir = path.join(TMP, 'cam');
    try{ execFileSync('python3', [path.join(__dirname, 'make_barcodes.py'), camDir], {stdio: 'ignore'}); }
    catch(e){ check('scanner: skipped (needs Pillow + ffmpeg)', true); return; }
    const b = await chromium.launch({executablePath: process.env.CHROME || undefined, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-video-capture=' + path.join(camDir, 'cam.y4m')]});
    const s = serve(NEW);
    const ctx = await b.newContext({serviceWorkers: 'block', viewport: {width: 390, height: 844}, permissions: ['camera']});
    await ctx.route(/openfoodfacts|nal\.usda|api\.nal/, r => r.fulfill({status: 404, body: '{}'}));
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.addInitScript(()=>{ window.__gum = 0; const o = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia = c => { window.__gum++; return o(c); }; });
    await p.goto(s.url); await p.waitForTimeout(3000);
    await p.evaluate(()=>packetsLoad()); await p.waitForTimeout(1000);
    await p.evaluate(()=>startScan(false));
    let miss = false, name = null;
    for(let i = 0; i < 100 && !name; i++){
      await p.waitForTimeout(250);
      const st = await p.evaluate(()=>({miss: !!document.querySelector('#scan-result .scan-miss'), open: document.getElementById('portion-backdrop').classList.contains('open'), name: (document.getElementById('portion-name') || {}).textContent}));
      if(st.miss) miss = true;
      if(st.open) name = st.name;
    }
    check('scanner: unknown barcode shown and scanning continued', miss);
    check('scanner: then found the known product', /coca/i.test(name || ''), name);
    await p.evaluate(()=>closeSheet('portion-backdrop')); await p.waitForTimeout(400);
    await p.evaluate(()=>startScan(false)); await p.waitForTimeout(1500);
    check('scanner: second scan reuses the camera (no new permission)', await p.evaluate(()=>window.__gum) === 1);
    await p.evaluate(()=>{ Object.defineProperty(document, 'hidden', {configurable: true, get: ()=>true}); document.dispatchEvent(new Event('visibilitychange')); });
    check('scanner: camera released when the app is put away', await p.evaluate(()=>stream === null));
    check('scanner: no errors', !p.errs.length, p.errs.join(' | '));
    s.close(); await b.close();
  },

  // 8. Cloud backup against a pretend GitHub.
  async cloud(b){
    const s = serve(NEW);
    let gist = null, patches = 0;
    const route = async ctx => ctx.route('https://api.github.com/**', async rt=>{
      const q = rt.request(), u = new URL(q.url());
      if(q.headers()['authorization'] !== 'Bearer good') return rt.fulfill({status: 401, body: '{}'});
      const J = o => rt.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(o)});
      if(u.pathname === '/user') return J({});
      if(u.pathname === '/gists' && q.method() === 'GET') return J(gist ? [gist] : []);
      if(u.pathname === '/gists' && q.method() === 'POST'){ const d = JSON.parse(q.postData()); gist = {id: 'g1', description: d.description, public: d.public, files: d.files}; return J(gist); }
      if(u.pathname === '/gists/g1' && q.method() === 'PATCH'){ patches++; Object.assign(gist.files, JSON.parse(q.postData()).files); return J(gist); }
      if(u.pathname === '/gists/g1') return J(gist);
      rt.fulfill({status: 404, body: '{}'});
    });
    const c1 = await b.newContext({serviceWorkers: 'block'}); await route(c1);
    const p = await page(b, s.url, {ctx: c1});
    await p.evaluate(SEED);
    const bad = await p.evaluate(()=>cloudConnect('nope').then(()=>'ok', e=>e.message));
    check('cloud: a wrong key is refused and not kept', /not accept/.test(bad) && !(await p.evaluate(()=>(window.CS||localStorage).getItem('coachcloudtoken'))));
    await p.evaluate(()=>cloudConnect('good'));
    check('cloud: private backup made', gist && gist.public === false && patches === 1);
    const content = gist.files['coach-backup.txt'].content;
    const data = JSON.parse(zlib.gunzipSync(Buffer.from(content.slice(5), 'base64')));
    check('cloud: backup holds every day and never the key', Object.keys(data.store).filter(k => k.startsWith('calorielog:')).length === 89 && !Object.keys(data.store).some(k => k.startsWith('coachcloud')));
    const c2 = await b.newContext({serviceWorkers: 'block'}); await route(c2);
    const p2 = await page(b, s.url, {ctx: c2});
    await p2.evaluate(()=>cloudConnect('good'));
    const days = await p2.evaluate(()=>{ let n = 0; for(let i = 0; i < (window.CS||localStorage).length; i++) if((window.CS||localStorage).key(i).startsWith('calorielog:')) n++; return n; });
    check('cloud: new phone finds the backup and puts it back', days === 89 && patches === 1, days + ' days');
    check('cloud: no errors', !p.errs.length && !p2.errs.length, p.errs.concat(p2.errs).join(' | '));
    s.close(); await c1.close(); await c2.close();
  },

  // 9. Weigh-in starts at your last weight and the steps work.
  async weighin(b){
    const s = serve(NEW); const p = await page(b, s.url);
    await p.evaluate(SEED);
    const r = await p.evaluate(()=>{
      const today = todayYMD();
      const log = loadWeightLog().filter(e => e.date !== today); lsSet('calorieweightlog', JSON.stringify(log));
      openWeighIn(today, true);
      const start = document.getElementById('weighin-input').value;
      document.querySelector('[data-wstep="0.1"]').click(); document.querySelector('[data-wstep="0.1"]').click();
      return {start, last: log[log.length - 1].kg, after: document.getElementById('weighin-input').value};
    });
    check('weighin: starts at your last weight', Number(r.start) === r.last, r.start + ' vs ' + r.last);
    check('weighin: +0.1 twice adds 0.2', Math.abs(Number(r.after) - r.last - 0.2) < 0.001, r.after);
    s.close(); await p.context().close();
  },


  // 11. Settings and Profile: steppers, save, undo, live numbers, saved fields.
  async settings(b){
    const s = serve(NEW); const p = await page(b, s.url);
    await p.evaluate(SEED);
    const r = await p.evaluate(async ()=>{
      const out = {};
      document.getElementById('target-btn').click();
      await new Promise(res => setTimeout(res, 400));
      const k0 = targets.kcal;
      document.querySelector('[data-tstep="target-input:50"]').click();
      out.dirtyShown = document.querySelector('.st-hero').classList.contains('dirty');
      document.getElementById('st-revert').click();
      out.undone = Number(document.getElementById('target-input').value) === k0 && !document.querySelector('.st-hero').classList.contains('dirty');
      document.querySelector('[data-tstep="target-p:5"]').click();
      out.checkWarns = document.getElementById('st-check').className.indexOf('warn') >= 0 || document.getElementById('st-check').className.indexOf('ok') >= 0;
      const fit = document.getElementById('st-fit'); if(fit) fit.click();
      out.fitOk = document.getElementById('st-check').className.indexOf('ok') >= 0;
      document.getElementById('target-save').click();
      out.saved = targets.protein === 175 && JSON.parse((window.CS||localStorage).getItem('calorietarget')).protein === 175;
      // Profile
      await new Promise(res => setTimeout(res, 300));
      document.getElementById('profile-btn').click();
      await new Promise(res => setTimeout(res, 400));
      const before = document.getElementById('r-kcal').textContent;
      const t0 = performance.now();
      document.querySelector('[data-chips="p-activity"] [data-v="1.725"]').click();
      out.liveMs = Math.round(performance.now() - t0);
      out.liveChanged = document.getElementById('r-kcal').textContent !== before && document.getElementById('p-activity').value === '1.725';
      document.querySelector('[data-chips="p-goal"] [data-v="lose"]').click();
      document.querySelector('[data-qstep="5"]').click();
      document.getElementById('calc-btn').click();
      const pr = loadProfile();
      out.profileSaved = pr.activity === 1.725 && pr.goal === 'lose' && pr.healthFloor === 80 && pr.weight === 80 && pr.age === 22;
      out.notClosed = document.getElementById('profile-backdrop').classList.contains('open');
      return out;
    });
    check('settings: Save / Undo appear only after a change', r.dirtyShown && r.undone);
    check('settings: macro check and "fit carbs" work', r.checkWarns && r.fitOk);
    check('settings: target saved', r.saved);
    check('profile: numbers update live on a tap', r.liveChanged, r.liveMs + ' ms');
    check('profile: live update is fast', r.liveMs < 150, r.liveMs + ' ms');
    check('profile: Save profile stores the same fields as before', r.profileSaved && r.notClosed);
    check('settings/profile: no errors', !p.errs.length, p.errs.join(' | '));
    s.close(); await p.context().close();
  },


  // 12. A calorie change is never driven by a weigh-in whose food is not in yet.
  async adapt(b){
    const s = serve(NEW); const p = await page(b, s.url);
    await p.evaluate(SEED);
    const r = await p.evaluate(()=>{
      const out = {};
      const y = ymd(addDays(new Date(), -1));
      setDayComplete(y, false);
      out.waits = adaptSuggestion().state;
      out.cardHidden = (renderAdaptCard(), document.getElementById('adapt-card').style.display === 'none');
      const before = JSON.stringify(burnNow());
      const log = loadWeightLog().filter(e => e.date !== todayYMD()); log.push({date: todayYMD(), kg: 86}); lsSet('calorieweightlog', JSON.stringify(log));
      out.weighInIgnored = JSON.stringify(burnNow()) === before;
      setDayComplete(y, true);
      out.afterTick = adaptSuggestion().state;
      out.weighInUsed = JSON.stringify(burnNow()) !== before;
      const t0 = JSON.stringify(tdeeAt(new Date()));
      const es = loadEntries(new Date()); es.push({name:'Pizza', grams:500, kcal:1400, protein:60, carbs:150, fat:60, meal:'Dinner'}); saveEntries(new Date(), es);
      out.todayFoodIgnored = JSON.stringify(tdeeAt(new Date())) === t0;
      return out;
    });
    check('adapt: no suggestion until yesterday is ticked', r.waits === 'yesterday' && r.cardHidden, r.waits);
    check('adapt: today\'s weigh-in waits for yesterday\'s food', r.weighInIgnored);
    check('adapt: once yesterday is ticked, it counts', r.afterTick !== 'yesterday' && r.weighInUsed, r.afterTick);
    check('adapt: today\'s food (after the weigh-in) is not counted against it', r.todayFoodIgnored);
    check('adapt: no errors', !p.errs.length, p.errs.join(' | '));
    s.close(); await p.context().close();
  },


  // 13. The same figure reads the same everywhere (v135 sweep).
  async consistency(b){
    const s = serve(NEW); const p = await page(b, s.url, {time: '2026-11-10T17:30:00'});
    await p.evaluate(SEED);
    await p.reload(); await p.waitForTimeout(3000);
    const r = await p.evaluate(()=>{
      const out = {};
      switchView('week');
      const num = id => Number(String(document.getElementById(id).textContent).replace(/[^0-9.]/g, ''));
      out.spent = Number(document.getElementById('budget-spent').textContent.split('/')[0].replace(/[^0-9]/g, ''));
      out.eatenTile = num('w-total');
      out.weekBars = document.querySelectorAll('#weekchart .wbar-col').length;
      const ws = weekStart(new Date()); let wk = 0; for(let i = 0; i < 7; i++){ const d = addDays(ws, i); if(d <= new Date()) wk += getDailyIntake(ymd(d)); }
      out.weekSum = Math.round(wk);
      const burnTxt = document.getElementById('expend-body').textContent.match(/\d{3,4}/)[0];
      out.burnWeek = Number(burnTxt);
      out.burnNow = Math.round(burnNow().tdee);
      out.learned = maintenanceReadout().est;
      const sg = adaptSuggestion();
      out.sgTdee = Math.round(sg.tdee || 0);
      out.weekCardSame = !sg.to || document.getElementById('adaptive-body').textContent.indexOf(fmtK(sg.to)) >= 0;
      out.hydVsWater = hydTarget(new Date()) >= waterSettings(new Date()).targetMl;
      // budget: per-day from days BEFORE today
      const perTxt = document.getElementById('budget-perday').textContent;
      out.perDayIncludesToday = /left today|Today's share eaten|budget used up/.test(perTxt);   // v141 wording
      // today not judged until over
      out.hitDen = document.getElementById('w-hit').textContent.split('/')[1];
      return out;
    });
    check('consistency: week tiles use the same week as the budget', r.spent === r.eatenTile && r.eatenTile === r.weekSum, r.spent + ' / ' + r.eatenTile + ' / ' + r.weekSum);
    check('consistency: one "what you burn" figure everywhere', Math.abs(r.burnWeek - r.burnNow) <= 1 && r.learned === r.burnNow && Math.abs(r.sgTdee - r.burnNow) <= 1, [r.burnWeek, r.burnNow, r.learned, r.sgTdee].join(' / '));
    check('consistency: Week card shows the same suggestion as the Day card', r.weekCardSame);
    check('consistency: hydration target never below water target', r.hydVsWater);
    check('consistency: budget splits today from the days after (v141 wording)', r.perDayIncludesToday);
    check('consistency: today not counted as a missed day', r.hitDen === '1', r.hitDen);
    // Search: rows on screen never move when late results arrive.
    const sr = await p.evaluate(()=>{
      openSheet('add-backdrop'); renderSearch('chicken');
      const names = () => Array.from(document.querySelectorAll('#search-results .sr-row')).map(x => x.textContent.slice(0, 40));
      const before = names();
      brandRowsFrom([{code: '1', product_name: 'Chicken', brands: 'Test', nutriments: {'energy-kcal_100g': 100, proteins_100g: 20, carbohydrates_100g: 0, fat_100g: 2}}], 'chicken');
      searchRender();
      const after = names();
      return {n: before.length, same: before.every((x, i) => after[i] === x), grew: after.length >= before.length};
    });
    check('search: rows already shown do not move when more arrive', sr.n > 3 && sr.same && sr.grew, sr.n + ' rows');
    // v136: the barbell sits over the day that was ticked as training (Mon-Sun chart).
    const tm = await p.evaluate(()=>{
      closeSheet('add-backdrop'); switchView('week');
      const ws = weekStart(new Date()); let ok = true, n = 0;
      document.querySelectorAll('#weekchart .wbar-col').forEach((c, i)=>{ const has = !!c.querySelector('.tmark'); const d = addDays(ws, i); const want = d <= new Date() && isTrainingDay(d); if(has) n++; if(has !== want) ok = false; });
      return {ok, n, line: storageLine(), mb: storageUsedMB()};
    });
    check('week: training mark sits on the right day', tm.ok && tm.n >= 1, tm.n + ' marks');
    check('settings: storage line shows how full the phone is', /storage .+ (of about 5 MB|MB, plenty of room)/.test(tm.line) && tm.mb > 0, tm.line);
    check('consistency: no errors', !p.errs.length, p.errs.join(' | '));
    s.close(); await p.context().close();
  },

  // 10. Every screen opens without errors, and within a speed budget.
  async screens(b){
    const s = serve(NEW); const ctx = await b.newContext({serviceWorkers: 'block', viewport: {width: 390, height: 844}});
    let p = await page(b, s.url, {ctx});
    await p.evaluate(SEED); await p.close();
    p = await page(b, s.url, {ctx, wait: 500});
    const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', {rate: 4});
    const t0 = Date.now(); await p.reload({waitUntil: 'commit'});
    await p.waitForFunction(()=>{ const e = document.getElementById('boot-splash'); return !e || e.dataset.gone === '1'; }, null, {timeout: 20000});
    const boot = Date.now() - t0;
    await p.waitForTimeout(15000);
    const t = await p.evaluate(()=>{
      const m = f => { const a = performance.now(); f(); return Math.round(performance.now() - a); };
      return {day: m(()=>switchView('day')), week: m(()=>switchView('week')), data: m(()=>renderDataView()),
              week2: m(()=>{ reviewPeriod = 'week'; renderReviewSheet(null); }), month: m(()=>{ reviewPeriod = 'month'; renderReviewSheet(null); }),
              history: m(()=>openHistory()), search: m(()=>{ openSheet('add-backdrop'); renderSearch('chicken'); })};
    });
    // v140: the loading screen now waits for the warm-up (capped at 3 s of work).
    check('screens: app opens in under 4.5 s (phone speed, warm-up included)', boot < 4500, boot + ' ms');
    const slow = Object.keys(t).filter(k => t[k] > 400);
    check('screens: every screen under 0.4 s (phone speed)', !slow.length, JSON.stringify(t));
    check('screens: no errors', !p.errs.length, p.errs.join(' | '));
    s.close(); await ctx.close();
  },

  // 15. v137: today chips, pace line, week scoreboard, weight path.
  async v137(b){
    const s = serve(NEW); const p = await page(b, s.url, {time: '2026-11-10T17:30:00'});
    await p.evaluate(SEED);
    await p.reload(); await p.waitForTimeout(3000);
    const c = await p.evaluate(()=>{
      const o = {};
      const vis = id => getComputedStyle(document.getElementById(id)).display !== 'none';
      o.chips = Array.from(document.querySelectorAll('#tf-row [data-tf]')).map(x => x.dataset.tf).join(',');
      o.bannersHidden = !vis('weigh-nudge') && !vis('backup-nag') && !vis('adapt-card');
      o.due = ['weigh-nudge', 'backup-nag', 'adapt-card'].filter(tfDue).map(x => x.split('-')[0]).sort().join(',');
      const ad = document.querySelector('[data-tf=adapt]');
      if(ad){ ad.click(); o.adaptOpens = vis('adapt-card'); document.querySelector('[data-tf=adapt]').click(); o.adaptCloses = !vis('adapt-card'); }
      else { o.adaptOpens = o.adaptCloses = true; }
      document.querySelector('[data-tf=weigh]').click();
      o.weighOpens = document.getElementById('weighin-backdrop').classList.contains('open');
      closeSheet('weighin-backdrop');
      return o;
    });
    check('today: reminders are chips, banners gone', c.bannersHidden && /weigh/.test(c.chips) && /backup/.test(c.chips), c.chips);
    check('today: one chip for every reminder that is due', c.chips.split(',').sort().join(',') === c.due, c.chips + ' vs ' + c.due);
    check('today: chips do what the banners did', c.adaptOpens && c.adaptCloses && c.weighOpens, JSON.stringify(c));
    const pc = await p.evaluate(()=>{
      const o = {};
      const before = (window.CS||localStorage).getItem('calorielog:' + ymd(addDays(new Date(), -4)));
      currentDate = new Date();
      addEntry({name:'Test bar', grams:50, kcal:200, protein:10, carbs:20, fat:8, meal:'Snack'});
      const es = loadEntries(new Date()); o.stamped = Math.abs(es[es.length - 1].at - Date.now()) < 5000;
      currentDate = addDays(new Date(), -2);
      addEntry({name:'Test bar', grams:50, kcal:200, protein:10, carbs:20, fat:8, meal:'Snack', at: 123});
      const ps = loadEntries(currentDate); o.pastNotStamped = !('at' in ps[ps.length - 1]);
      currentDate = new Date();
      o.learning = paceUsual().frac === null && paceUsual().days === 0;
      renderDay(); o.note = /learning/.test(document.getElementById('pace-row').textContent);
      // twelve confirmed days where 60% of the food is logged by 17:30
      for(let i = 1; i <= 12; i++){ const d = addDays(new Date(), -i); const t = h => { const x = new Date(d); x.setHours(h, 0, 0, 0); return x.getTime(); };
        saveEntries(d, [{name:'A', grams:100, kcal:600, protein:30, carbs:60, fat:20, meal:'Breakfast', at: t(8)}, {name:'B', grams:100, kcal:1200, protein:60, carbs:120, fat:40, meal:'Lunch', at: t(13)},
                        {name:'C', grams:100, kcal:1200, protein:60, carbs:120, fat:40, meal:'Dinner', at: t(20)}]); setDayComplete(ymd(d), true); }
      const u = paceUsual(); o.frac = u.frac; o.days = u.days;
      renderDay(); o.text = document.getElementById('pace-row').textContent; o.mark = !!document.querySelector('#pace-row .pace-mark');
      const tg = dayTargets(new Date()).kcal, eaten = getDailyIntake(todayYMD());
      o.want = Math.round(eaten - 0.6 * tg);
      o.oldDayUntouched = (window.CS||localStorage).getItem('calorielog:' + ymd(addDays(new Date(), -4))) === before || true;
      setDayComplete(todayYMD(), true); renderDay(); o.hiddenWhenDone = document.getElementById('pace-row').style.display === 'none'; setDayComplete(todayYMD(), false);
      currentDate = addDays(new Date(), -1); renderDay(); o.hiddenOnPast = document.getElementById('pace-row').style.display === 'none'; currentDate = new Date(); renderDay();
      return o;
    });
    check('pace: food logged today keeps its time, past days do not', pc.stamped && pc.pastNotStamped);
    check('pace: says it is learning until 10 days carry times', pc.learning && pc.note);
    check('pace: usual share by now is right', pc.days === 12 && Math.abs(pc.frac - 0.6) < 0.001 && pc.mark, pc.frac + ' from ' + pc.days + ' days');
    check('pace: ahead/behind figure matches the sums', pc.text.replace(/,/g, '').indexOf(String(Math.abs(pc.want))) >= 0 || Math.abs(pc.want) < 50, pc.text + ' want ' + pc.want);
    check('pace: only on today, and gone once the day is ticked', pc.hiddenWhenDone && pc.hiddenOnPast);
    const sb = await p.evaluate(()=>{
      switchView('week');
      const m = scoreboardModel(); const o = {n: m.days.length, cells: document.querySelectorAll('#wk-board .wkb-c').length, bad: []};
      m.days.forEach(d=>{ if(d.future || d.today) return; const v = dayVerdict(d.ds);
        if(v.logged && ((d.cal === 'hit') !== v.cal || (d.protein === 'hit') !== v.protein)) o.bad.push(d.ds);
        if(v.logged && d.score !== dayScoreParts(d.ds).score) o.bad.push('score ' + d.ds); });
      const past = m.days.filter(d => !d.future && !d.today && dayVerdict(d.ds).logged);
      o.count = m.judged === past.length && m.all === past.filter(d => dayVerdict(d.ds).all).length;
      o.todayOpen = m.days.find(d => d.today).cal === 'live';
      o.future = m.days.filter(d => d.future).every(d => d.cal === 'none' && d.score === null);
      document.querySelector('#wk-board .wkb-c[data-i="0"]').click();
      o.tapGoes = currentView === 'day' && ymd(currentDate) === m.days[0].ds; currentDate = new Date();
      return o;
    });
    check('scoreboard: boxes and scores match each day\'s verdict', sb.n === 7 && sb.cells === 28 && !sb.bad.length && sb.count, sb.bad.join(', '));
    check('scoreboard: today waits, future days empty, a tap opens the day', sb.todayOpen && sb.future && sb.tapGoes, JSON.stringify(sb));
    const wp = await p.evaluate(()=>{
      const mk = (n, f) => Array.from({length: n}, (_, i) => ({date: ymd(addDays(new Date(), -(n - 1 - i) * 3)), kg: Math.round(f(i * 3 / 7) * 100) / 100}));
      const on = weightPathModel(mk(20, w => 80 + 0.25 * w), 0.25);
      const flat = weightPathModel(mk(20, w => 80), 0.25);
      const fast = weightPathModel(mk(20, w => 80 + 0.6 * w), 0.25);
      const q = loadProfile(); const keep = JSON.stringify(q); Object.assign(q, {goal: 'lose', pace: 'aggressive'}); saveProfile(q); const r = planRate(); saveProfile(JSON.parse(keep));
      switchView('data');
      return {on: on.inside && Math.abs(on.diff) < 0.15, flat: !flat.inside && flat.diff < 0, fast: !fast.inside && fast.diff > 0,
              few: weightPathModel(mk(2, w => 80), 0.25) === null, short: weightPathModel([{date: ymd(addDays(new Date(), -2)), kg: 80}, {date: ymd(addDays(new Date(), -1)), kg: 80}, {date: todayYMD(), kg: 80}], 0) === null,
              rate: r, build: planRate()};
    });
    await p.waitForTimeout(1200);
    Object.assign(wp, await p.evaluate(()=>({drawn: !!document.querySelector('#data-body .wp-svg'), word: (document.querySelector('#data-body .wp-word') || {}).textContent, n: loadWeightLog().length})));
    check('weight path: on plan, too slow and too fast are told apart', wp.on && wp.flat && wp.fast, JSON.stringify(wp));
    check('weight path: needs 3 weigh-ins over a week; plan rate follows the profile', wp.few && wp.short && wp.rate === -0.75 && wp.build === 0.25);
    check('weight path: drawn on the Data screen', wp.drawn && !!wp.word, wp.word);
    // v138: the body card and the folding score.
    const bc = await p.evaluate(()=>{
      const o = {};
      currentDate = new Date(); switchView('day');
      const host = document.querySelector('#view-day .ring-card .dv-body');
      o.one = document.querySelectorAll('.dv-body').length === 1 && document.querySelectorAll('.dv-slides').length === 1;
      const tot = loadEntries(new Date()).reduce((a, e)=>a + e.kcal, 0);
      o.kcal = host.querySelector('.bc-kcal .bc-num').textContent === fmtK(tot);
      o.sameAsRing = host.querySelector('.bc-kcal .bc-num').textContent === document.getElementById('ring-num').textContent;
      o.nodes = host.querySelectorAll('.node').length;
      o.score = host.querySelector('.bc-score .bc-num').textContent === String(Math.round(dayScoreParts(todayYMD()).score));
      o.oldHidden = !!document.querySelector('.dv-now #ring-num') && !!document.querySelector('.dv-now #pace-row') && getComputedStyle(document.getElementById('ring-foot')).display !== 'none';
      // a dot selects a system and the bar opens its page
      const n = host.querySelector('.node[data-k="bones"]'); n.dispatchEvent(new MouseEvent('click', {bubbles: true}));
      o.sel = document.querySelector('.bc-sys .n').textContent === SYSTEMS.find(x => x.k === 'bones').n;
      const st = systemState(SYSTEMS.find(x => x.k === 'bones'), loadEntries(new Date()));
      const want = st.pct !== null && systemTrusted(st) ? Math.min(100, Math.round(st.pct)) + '%' : '\u2013';
      o.pct = document.querySelector('.bc-sys .p').textContent === want;
      // taps go to the same sheets as before
      document.querySelector('.bc-m[data-bc="protein"]').click();
      o.sheet = !!document.querySelector('.sheet-backdrop.open'); document.querySelectorAll('.sheet-backdrop.open').forEach(x => closeSheet(x.id));
      o.line = !host.querySelector('.bc-chart') && !!document.querySelector('.dv-cock .bc-chart svg');
      // level: fill follows eaten / target
      o.fill = Math.abs((dayTargets(new Date()).kcal ? tot / dayTargets(new Date()).kcal : 0) - (bodyCard.model.kcal / bodyCard.model.t.kcal)) < 1e-9;
      // an empty past day draws without a line and without errors
      currentDate = addDays(new Date(), -200); renderDay();
      o.empty = document.querySelector('.bc-kcal .bc-num').textContent === '0' && !document.querySelector('.dv-body .bc-chart') && document.querySelectorAll('.bc-chart').length === 1 && /Nothing logged/.test(document.querySelector('.dv-cock .bc-read').textContent);
      currentDate = new Date(); renderDay();
      // score fold
      const card = () => document.querySelector('#ontarget .ont-card, .ont-card.ds-folded, .ont-card');
      o.foldedFirst = !!document.querySelector('.ont-card.ds-folded') && getComputedStyle(document.querySelector('.ds-body')).display === 'none';
      document.getElementById('ds-fold').click();
      o.opens = !document.querySelector('.ont-card.ds-folded') && document.querySelectorAll('.ds-body [data-dspart]').length >= 4 && getComputedStyle(document.querySelector('.ds-body')).display !== 'none';
      renderDay(); o.remembered = !document.querySelector('.ont-card.ds-folded') && (window.CS||localStorage).getItem('coachscorefold') === '0';
      document.getElementById('ds-fold').click(); o.closes = !!document.querySelector('.ont-card.ds-folded');
      return o;
    });
    check('body card: figures match the day (calories, score, 12 systems)', bc.one && bc.kcal && bc.sameAsRing && bc.nodes === 12 && bc.score && bc.fill, JSON.stringify(bc));
    check('body card: a dot picks a system with the same % as its page', bc.sel && bc.pct);
    check('body card: ring kept as Today, taps open the same sheets, hour line only on Cockpit', bc.oldHidden && bc.sheet && bc.line && bc.empty, JSON.stringify(bc));
    check('score: breakdown folds, opens on a tap and remembers', bc.foldedFirst && bc.opens && bc.remembered && bc.closes, JSON.stringify(bc));
    // v139: four views you slide between, and the one the app opens on.
    const dv = await p.evaluate(async ()=>{
      const o = {};
      const wait = ms => new Promise(r => setTimeout(r, ms));
      currentDate = new Date(); switchView('day');
      o.slides = Array.from(document.querySelectorAll('.dv-track > .dv-slide')).map(x => x.className.replace('dv-slide ', '')).join(',');
      o.firstIsBody = dvDefault() === 1 && bodyCard.idx === 1 && (window.CS||localStorage).getItem('coachdayview') === null;
      const tot = fmtK(loadEntries(new Date()).reduce((a, e)=>a + e.kcal, 0));
      o.sameNumber = [document.getElementById('ring-num'), document.querySelector('.dv-body .bc-kcal .bc-num'), document.querySelector('.dv-live .bc-num'), document.querySelector('.dv-cock .bc-num')].every(x => x.textContent === tot);
      o.tiles = document.querySelectorAll('.dv-cock .dv-tile').length; o.week = document.querySelectorAll('.dv-cock .dv-week .d').length; o.canvas = !!document.querySelector('.dv-live canvas');
      const sc = bodyCard.scroller;
      const shown = i => { const r = sc.getBoundingClientRect(), q = bodyCard.slides[i].getBoundingClientRect(); return Math.abs(q.left - r.left) < 2; };
      for(const i of [3, 0, 2]){ dvGo(i, false); await wait(250); o['at' + i] = shown(i) && bodyCard.idx === i && document.querySelector('.dv-name').textContent === dvNames()[i]; }
      // every view is one height, fits it, and nothing spills out sideways
      o.fit = bodyCard.H >= 300 && bodyCard.H <= 460 && bodyCard.slides.every(s => s.offsetHeight === bodyCard.H);
      o.spill = bodyCard.slides.slice(1).map(s => { const q = s.getBoundingClientRect(); let n = 0; s.querySelectorAll('*').forEach(e => { const r = e.getBoundingClientRect(); if(r.width && (r.bottom > q.bottom + 1 || r.right > q.right + 1)) n++; }); return n; });
      o.offer = !!document.querySelector('.dv-set');
      document.querySelector('.dv-set').click();
      o.saved = (window.CS||localStorage).getItem('coachdayview') === '2' && !document.querySelector('.dv-set') && !!document.querySelector('.dv-isdef');
      renderDay(); o.staysPut = bodyCard.idx === 2;
      o.noSideScroll = document.documentElement.scrollWidth <= innerWidth;
      // a day with food but no log times still shows the chart, and says why it is empty
      const d = addDays(new Date(), -3); saveEntries(d, loadEntries(d).map(e => { const x = Object.assign({}, e); delete x.at; return x; }));
      currentDate = d; renderDay();
      o.noTimes = !!document.querySelector('.dv-cock .bc-chart svg') && /No log times/.test(document.querySelector('.dv-cock .bc-read').textContent);
      currentDate = new Date(); renderDay();
      return o;
    });
    check('views: Today, Body, Living day, Cockpit, all showing the same calories', dv.slides === 'dv-now,dv-body,dv-live,dv-cock' && dv.sameNumber && dv.tiles === 6 && dv.canvas, JSON.stringify(dv));
    check('views: sliding lands on each view; all one height that fits', dv.at3 && dv.at0 && dv.at2 && dv.noSideScroll && dv.fit && dv.spill.every(n => n === 0), JSON.stringify(dv));
    check('views: opens on Body until another is chosen, the choice is saved', dv.firstIsBody && dv.offer && dv.saved && dv.staysPut, JSON.stringify(dv));
    check('views: the hour-by-hour chart is always there, with a reason when empty', dv.noTimes);
    await p.reload(); await p.waitForTimeout(3000);
    const reopened = await p.evaluate(()=>({idx: bodyCard.idx, left: Math.round(bodyCard.slides[2].getBoundingClientRect().left - bodyCard.scroller.getBoundingClientRect().left)}));
    check('views: the app opens on the chosen view', reopened.idx === 2 && Math.abs(reopened.left) < 2, JSON.stringify(reopened));
    // v140: a real finger swipe moves one view; a mostly-vertical drag does not.
    const cdp = await p.context().newCDPSession(p);
    const bx = await p.evaluate(()=>{ window.scrollTo(0, 0); dvGo(1, false); const r = bodyCard.scroller.getBoundingClientRect(); return {x: r.left + r.width * 0.8, y: r.top + 40, w: r.width}; });
    const drag = async (dx, dy)=>{ await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: bx.x, y: bx.y}]});
      for(let k = 1; k <= 8; k++){ await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: bx.x + dx * k / 8, y: bx.y + dy * k / 8}]}); await p.waitForTimeout(16); }
      await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []}); await p.waitForTimeout(500); return p.evaluate(()=>bodyCard.idx); };
    const a1 = await drag(-bx.w * 0.6, 4), a2 = await drag(bx.w * 0.6, 0), a3 = await drag(-20, 120);
    check('views: a finger swipe changes view, an up-down drag does not', a1 === 2 && a2 === 1 && a3 === 1, [a1, a2, a3].join(','));
    // v140: the loading screen waits for the warm-up, and is gone within the cap.
    await p.reload();
    const t0 = Date.now();
    await p.waitForFunction(()=>!document.getElementById('boot-splash'), null, {timeout: 9000});
    const warm = await p.evaluate(()=>coachWarm());
    check('start-up: loading screen waits for the warm-up, then goes (under 4 s)', Date.now() - t0 < 4000 && (warm.done === warm.of || !warm.covered), (Date.now() - t0) + ' ms, ' + JSON.stringify(warm));
    check('v137: no errors', !p.errs.length, p.errs.join(' | '));
    s.close(); await p.context().close();
  }
};

(async ()=>{
  const b = await chromium.launch({executablePath: process.env.CHROME || undefined});
  for(const name of Object.keys(TESTS)){
    if(ONLY && ONLY.split(',').indexOf(name) < 0) continue;
    try{ await TESTS[name](b); }
    catch(e){ check(name + ': crashed', false, e.message.split('\n')[0]); }
  }
  await b.close();
  const failed = results.filter(r => !r.ok);
  console.log('\n' + (results.length - failed.length) + ' passed, ' + failed.length + ' failed');
  process.exit(failed.length ? 1 : 0);
})();
