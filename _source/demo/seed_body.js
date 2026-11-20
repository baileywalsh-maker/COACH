var SEED = ()=>{
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
