/* ============================================================
   v137 - the pace line.
   The ring says how much you have eaten. It cannot say whether that is good
   for this time of day. From v137 every food logged on today keeps the time it
   was logged (a new field, `at`; nothing already saved is touched). Once ten
   confirmed days carry times, the day card marks where you usually are by now.
   ============================================================ */
// Plain functions, not consts: the day screen is first drawn before this part
// of the script has run, and a const would not exist yet.
function PACE(){ return {MIN_DAYS: 10, WINDOW: 28, FLAT: 50}; }
// The share of one day's calories that was logged by `mins` past midnight.
// null when that day's times are missing (most of its calories carry none).
function paceDayFrac(d, mins){
  const ds = ymd(d);
  let tot = 0, timed = 0, by = 0;
  loadEntriesRO(d).forEach(e=>{
    const k = Number(e.kcal) || 0;
    if(k <= 0) return;
    tot += k;
    if(!e.at) return;
    const t = new Date(e.at);
    if(ymd(t) !== ds) return;
    timed += k;
    if(t.getHours() * 60 + t.getMinutes() <= mins) by += k;
  });
  if(tot <= 0 || timed < tot * 0.8) return null;
  return by / timed;
}
function paceUsual(now){
  now = now || new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const today = new Date(now); today.setHours(0,0,0,0);
  const fr = [];
  for(let i = 1; i <= PACE().WINDOW; i++){
    const d = addDays(today, -i);
    if(!isDayComplete(ymd(d))) continue;
    const f = paceDayFrac(d, mins);
    if(f !== null) fr.push(f);
  }
  fr.sort((a, b)=>a - b);
  const n = fr.length;
  const med = n ? (n % 2 ? fr[(n - 1) / 2] : (fr[n / 2 - 1] + fr[n / 2]) / 2) : null;
  return {days: n, need: PACE().MIN_DAYS, frac: n >= PACE().MIN_DAYS ? med : null};
}
function renderPace(eaten, target){
  const el = document.getElementById('pace-row');
  if(!el) return;
  const isToday = ymd(currentDate) === todayYMD();
  if(!isToday || !(target > 0) || isDayComplete(todayYMD())){ el.style.display = 'none'; el.innerHTML = ''; return; }
  const u = paceUsual();
  el.style.display = '';
  if(u.frac === null){
    el.innerHTML = '<div class="pace-note">Pace line: learning your usual day, ' + u.days + ' of ' + u.need + ' confirmed days so far.</div>';
    return;
  }
  const usual = u.frac * target, diff = Math.round(eaten - usual);
  const word = Math.abs(diff) < PACE().FLAT ? 'On your usual pace'
    : fmtK(Math.abs(diff)) + ' kcal ' + (diff > 0 ? 'ahead of' : 'behind') + ' your usual pace';
  const cls = Math.abs(diff) < PACE().FLAT ? 'flat' : diff > 0 ? 'ahead' : 'behind';
  const pct = v => Math.max(0, Math.min(100, v / target * 100)).toFixed(1);
  el.innerHTML =
    '<div class="pace-top"><span class="pace-word ' + cls + '">' + word + '</span><span class="pace-by">usual ' + fmtK(usual) + '</span></div>' +
    '<div class="pace-track"><i class="pace-fill" style="width:' + pct(eaten) + '%"></i><i class="pace-mark" style="left:' + pct(usual) + '%"></i></div>';
}
