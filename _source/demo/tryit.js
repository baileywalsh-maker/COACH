// "Try v150" buttons for the demo. Edit per version.
(function(){
  const closeAll = () => ['add-backdrop','review-backdrop','weighin-backdrop','tr-pick-backdrop','tr-ex-backdrop','tr-fin-backdrop','tr-rt-backdrop','tr-menu-backdrop'].forEach(id => { try{ closeSheet(id); }catch(e){} });
  // Sample training so the demo has history, ranks and routines to show.
  function seed(){
    if(trIdx().length) return;
    const pr = loadProfile(); if(!pr.sex) pr.sex = 'male'; lsSet('calorieprofile', JSON.stringify(pr));
    trSave(TR_RT, [{id: 'r1', name: 'Push', ex: [{n: 'Bench Press (Barbell)', sets: 3}, {n: 'Incline Bench Press (Dumbbell)', sets: 3}, {n: 'Overhead Press (Dumbbell)', sets: 3}, {n: 'Lateral Raise (Dumbbell)', sets: 3}, {n: 'Triceps Pushdown', sets: 3}]},
                   {id: 'r2', name: 'Pull', ex: [{n: 'Deadlift (Barbell)', sets: 3}, {n: 'Lat Pulldown (Cable)', sets: 3}, {n: 'Seated Cable Row - V Grip (Cable)', sets: 3}, {n: 'Face Pull', sets: 3}, {n: 'Hammer Curl (Dumbbell)', sets: 3}]},
                   {id: 'r3', name: 'Legs', ex: [{n: 'Squat (Barbell)', sets: 3}, {n: 'Romanian Deadlift (Barbell)', sets: 3}, {n: 'Leg Press (Machine)', sets: 3}, {n: 'Lying Leg Curl (Machine)', sets: 3}, {n: 'Standing Calf Raise (Machine)', sets: 3}]}]);
    const plan = [['Push', -16, [['Bench Press (Barbell)', 85, 8], ['Overhead Press (Dumbbell)', 22, 10], ['Lateral Raise (Dumbbell)', 10, 12], ['Triceps Pushdown', 22, 10]]],
                  ['Pull', -14, [['Deadlift (Barbell)', 140, 5], ['Lat Pulldown (Cable)', 65, 10], ['Pull Up', 0, 9]]],
                  ['Legs', -12, [['Squat (Barbell)', 110, 6], ['Romanian Deadlift (Barbell)', 100, 8], ['Leg Press (Machine)', 200, 10]]],
                  ['Push', -9, [['Bench Press (Barbell)', 87.5, 8], ['Overhead Press (Dumbbell)', 24, 9], ['Lateral Raise (Dumbbell)', 10, 14]]],
                  ['Pull', -7, [['Deadlift (Barbell)', 145, 5], ['Lat Pulldown (Cable)', 67.5, 10], ['Pull Up', 0, 10], ['Hammer Curl (Dumbbell)', 14, 10]]],
                  ['Legs', -5, [['Squat (Barbell)', 115, 6], ['Romanian Deadlift (Barbell)', 105, 8], ['Leg Press (Machine)', 210, 10], ['Standing Calf Raise (Machine)', 260, 10]]],
                  ['Push', -2, [['Bench Press (Barbell)', 90, 8], ['Overhead Press (Dumbbell)', 24, 10], ['Lateral Raise (Dumbbell)', 12, 12]]]];
    const idx = [];
    plan.forEach(([n, off, ex], i) => { const d = addDays(new Date(), off); d.setHours(17, 30, 0, 0); const start = d.getTime(), end = start + 58 * 60000;
      const w = {id: 'demo' + i, name: n, d: ymd(d), start, end, ex: ex.map(([en, kg, reps]) => ({n: en, sets: [1, 2, 3].map(k => kg ? {t: 'n', done: true, kg, reps: reps - (k === 3 ? 1 : 0)} : {t: 'n', done: true, reps: reps - k + 1})}))};
      trSave(TR_W + w.id, w); const st = trWorkoutStats(w); idx.push({id: w.id, d: w.d, s: start, n, v: st.vol, k: st.sets, m: st.mins, x: w.ex.map(e => e.n)});
      try{ setTrainingDay(w.d, true); }catch(e){} });
    trSave(TR_IDX, idx); trUsageCache = null;
  }
  const go = fn => () => { closeAll(); seed(); setTimeout(fn, 120); };
  window.TRYIT = [
    ['Food log', () => { closeAll(); setMode('eat'); const el = document.querySelector('#view-day .meal-group'); if(el) window.scrollTo({top: el.getBoundingClientRect().top + scrollY - 90, behavior: 'smooth'}); }],
    ['Tap a food', () => { closeAll(); setMode('eat'); const e = document.querySelector('#view-day .meal-card .entry'); if(e) openFoodDetail(Number(e.dataset.edit)); }],
    ['Body systems', () => { closeAll(); setMode('eat'); const el = document.querySelector('#view-day .sysgrid'); if(el) window.scrollTo({top: el.getBoundingClientRect().top + scrollY - 140, behavior: 'smooth'}); }],
    ['Eat / Train switch', go(() => setMode(trMode === 'train' ? 'eat' : 'train'))],
    ['Start "Push"', go(() => { setMode('train'); if(!trActive()) trStart('r1'); })],
    ['Log a set', go(() => { setMode('train'); if(!trActive()) trStart('r1'); const a = trActive(); const s = a.ex[0].sets.find(x => !x.done); if(s){ s.kg = 92.5; s.reps = 8; trSaveActive(a); trRefresh(); trToggleSet('0:' + a.ex[0].sets.indexOf(s)); } window.scrollTo({top: 260, behavior: 'smooth'}); })],
    ['Search "benh pres"', go(() => { setMode('train'); if(!trActive()) trStart('r1'); trOpenPicker('add'); const q = document.getElementById('tr-pick-q'); q.value = 'benh pres'; trPickRender(); })],
    ['Finish', go(() => { setMode('train'); if(!trActive()) trStart('r1'); const a = trActive(); a.start = Math.min(a.start, Date.now() - 62 * 60000);
      a.ex.forEach((e, i) => e.sets.forEach((s, j) => { if(!s.done){ const p = trPrevious(e.n, a.id)[j]; s.kg = p ? p.kg : 20; s.reps = p ? p.reps : 10; s.done = true; } })); trSaveActive(a); trFinish(); })],
    ['Muscle map', go(() => { setMode('train'); trShow('exercises'); })],
    ['Highlights', go(() => { setMode('train'); trShow('exercises'); setTimeout(() => { const el = document.querySelector('#view-train .tr-lib-btn'); if(el) el.scrollIntoView({block: 'center', behavior: 'smooth'}); }, 100); })],
    ['Stat library', go(() => { setMode('train'); trShow('exercises'); trStatLib(null); })],
    ['Library: Chest', go(() => { setMode('train'); trShow('exercises'); trStatLib('Chest'); })],
    ['Bench rank', go(() => { setMode('train'); trOpenExercise('Bench Press (Barbell)'); })],
    ['History', go(() => { setMode('train'); trShow('history'); })],
    ['Day screen link', go(() => { setMode('eat'); switchView('day'); window.scrollTo({top: 280, behavior: 'smooth'}); })]
  ];
})();
