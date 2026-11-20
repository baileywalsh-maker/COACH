/* COACH concepts 8 (Living day), 9 (Cockpit), 10 (Body). Prototype only.
   Each one replaces what is inside the real day card and reads the real app's
   own figures, so what is on screen is what would ship. */
(function(){
var C = {prot:'#b98fe0', carb:'#e0b95f', fat:'#7fa8e0', mint:'#7fe0b0', water:'#6fb7e8', t1:'#eef0f3', t3:'#7d848f', t4:'#6b727d', n3:'#1f232a', caution:'#e0b95f', danger:'#e2665f'};
var active = 0, raf = 0, host = null, model = null, anim = {level: 0, t: 0}, sel = null;
try{ active = Number(localStorage.getItem('coachconceptdemo')) || 10; }catch(e){ active = 10; }

function M(){
  var d = currentDate, es = loadEntries(d), t = dayTargets(d);
  var sum = function(k){ return es.reduce(function(a, e){ return a + (Number(e[k]) || 0); }, 0); };
  var isToday = ymd(d) === todayYMD();
  var h = hydDay(d), pu = null;
  try{ if(isToday && !isDayComplete(todayYMD())) pu = paceUsual(); }catch(e){}
  var sys = SYSTEMS.map(function(sy){ var st = null; try{ st = systemState(sy, es); }catch(e){}
    return {k: sy.k, n: sy.n, pct: st && st.pct !== null && st.pct !== undefined ? Math.min(100, Math.round(st.pct)) : null}; });
  var score = null; try{ if(es.length) score = Math.round(dayScoreParts(ymd(d)).score); }catch(e){}
  return {d: d, es: es, t: t, kcal: sum('kcal'), p: sum('protein'), c: sum('carbs'), f: sum('fat'), isToday: isToday,
          hyd: h, pace: pu && pu.frac !== null ? pu.frac * t.kcal : null, sys: sys, score: score};
}
function tone(p){ return p === null ? C.n3 : p >= 80 ? C.mint : p >= 55 ? C.caution : C.danger; }
function toneWord(p){ return p === null ? 'not enough data' : p >= 80 ? 'covered' : p >= 55 ? 'low' : 'short'; }
function togo(m){ var g = Math.round(m.t.kcal - m.kcal); return g >= 0 ? fmtK(g) + ' kcal to go' + (m.isToday ? ' today' : '') : fmtK(-g) + ' kcal over target'; }
function legend(m){
  var r = function(c, n, v, t){ return '<span><i style="background:' + c + '"></i>' + n + ' <b>' + fmt0(v) + '</b> / ' + fmt0(t) + 'g</span>'; };
  return '<div class="cx-leg">' + r(C.prot, 'Protein', m.p, m.t.protein) + r(C.carb, 'Carbs', m.c, m.t.carbs) + r(C.fat, 'Fat', m.f, m.t.fat) +
    '<span><i style="background:' + C.water + '"></i>Water <b>' + (m.hyd.total / 1000).toFixed(1) + '</b> / ' + (m.hyd.target / 1000).toFixed(1) + ' L</span></div>';
}

/* ---------- 8: living day ---------- */
function build8(m){
  host.innerHTML = '<div class="cx8-tank"><canvas></canvas><div class="cx8-over"><span class="cx-num">' + fmtK(m.kcal) + '</span><span class="cx-sub">' + togo(m) + '</span></div></div>' + legend(m);
}
var bubbles = [];
function draw8(){
  var cv = host.querySelector('canvas'); if(!cv) return;
  var m = model, r = cv.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1);
  if(cv.width !== Math.round(r.width * dpr)){ cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
  var g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  var W = r.width, H = r.height, yT = H * 0.30, span = H - yT, T = m.t.kcal || 1, t = anim.t;
  g.clearRect(0, 0, W, H);
  var lvl = anim.level;                                   // eaten / target, eased
  var scale = m.kcal > 0 ? lvl * T / m.kcal : 0;          // strata grow together
  var bands = [[m.f * 9, C.fat], [m.c * 4, C.carb], [m.p * 4, C.prot]];
  var known = bands.reduce(function(a, b){ return a + b[0]; }, 0);
  if(m.kcal - known > 20) bands.push([m.kcal - known, C.mint]);
  var y = H, top = H - Math.min(1.28, lvl) * span;
  var wave = function(yy, amp, ph, sp){ g.lineTo(-2, yy); for(var x = 0; x <= W + 6; x += 6) g.lineTo(x, yy + Math.sin(x / 46 + t * sp + ph) * amp + Math.sin(x / 19 - t * sp * 1.4 + ph) * amp * 0.35); };
  bands.forEach(function(b, i){
    var hgt = b[0] * scale / T * span; if(hgt <= 0.5) return;
    var y0 = y, y1 = Math.max(top, y - hgt); y = y1;
    var last = i === bands.length - 1 || y1 <= top + 0.5;
    var gr = g.createLinearGradient(0, y1, 0, y0); gr.addColorStop(0, b[1]); gr.addColorStop(1, shade(b[1], -0.28));
    g.beginPath(); g.moveTo(-2, y0 + 4); wave(y1, last ? 5 : 2.2, i * 1.7, last ? 1.1 : 0.7); g.lineTo(W + 6, y0 + 4); g.closePath();
    g.globalAlpha = 0.92; g.fillStyle = gr; g.fill(); g.globalAlpha = 1;
  });
  // surface highlight
  if(m.kcal > 0){ g.beginPath(); g.moveTo(-2, top); for(var x = 0; x <= W + 6; x += 6) g.lineTo(x, top + Math.sin(x / 46 + t * 1.1 + (bands.length - 1) * 1.7) * 5 + Math.sin(x / 19 - t * 1.54 + (bands.length - 1) * 1.7) * 1.75);
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.5; g.stroke(); }
  // bubbles: more of them the better hydrated you are
  var want = Math.round(Math.min(1, m.hyd.total / (m.hyd.target || 1)) * 16);
  while(bubbles.length < want) bubbles.push({x: Math.random(), y: Math.random(), r: 1.5 + Math.random() * 3, s: 0.05 + Math.random() * 0.09});
  bubbles.length = Math.min(bubbles.length, want);
  bubbles.forEach(function(b){ b.y -= b.s * 0.016; if(b.y < 0) { b.y = 1; b.x = Math.random(); }
    var by = top + 8 + b.y * (H - top - 12); if(H - top < 24) return;
    g.beginPath(); g.arc(b.x * W + Math.sin(t * 1.3 + b.x * 20) * 3, by, b.r, 0, 6.3); g.fillStyle = 'rgba(255,255,255,.22)'; g.fill(); });
  // target line
  g.setLineDash([4, 5]); g.strokeStyle = 'rgba(238,240,243,.75)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, yT); g.lineTo(W, yT); g.stroke(); g.setLineDash([]);
  g.font = '700 11px Manrope, sans-serif'; g.textAlign = 'right'; g.fillStyle = 'rgba(238,240,243,.9)';
  g.fillText('target ' + fmtK(T), W - 14, yT - 7);
  if(m.pace !== null){ var yp = H - Math.min(1.2, m.pace / T) * span;
    g.fillStyle = C.t1; g.beginPath(); g.moveTo(W, yp - 6); g.lineTo(W - 9, yp); g.lineTo(W, yp + 6); g.closePath(); g.fill();
    g.fillStyle = 'rgba(238,240,243,.9)'; g.fillText('usual by now', W - 14, yp + 4); }
}
function shade(hex, k){ var n = parseInt(hex.slice(1), 16), f = function(v){ return Math.max(0, Math.min(255, Math.round(v + (k < 0 ? v * k : (255 - v) * k)))); };
  return 'rgb(' + f(n >> 16) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')'; }

/* ---------- 9: cockpit ---------- */
var usualCurve = null, usualKey = '';
function usual(m){
  var key = ymd(m.d) + '|' + logEpoch;
  if(usualKey === key) return usualCurve; usualKey = key; usualCurve = null;
  var today = new Date(); today.setHours(0,0,0,0); var pts = [];
  for(var mins = 360; mins <= 1440; mins += 30){ var fr = [];
    for(var i = 1; i <= 28; i++){ var d = addDays(today, -i); if(!isDayComplete(ymd(d))) continue; var f = paceDayFrac(d, mins); if(f !== null) fr.push(f); }
    if(fr.length < 10) return null; fr.sort(function(a, b){ return a - b; });
    pts.push({m: mins, k: fr[Math.floor(fr.length / 2)] * m.t.kcal}); }
  usualCurve = pts; return pts;
}
function build9(m){
  var W = 330, H = 150, L = 4, R = 4, Tp = 8, B = 18, x0 = 360, x1 = 1440;
  var steps = m.es.filter(function(e){ return e.at && e.kcal > 0; }).map(function(e){ var t = new Date(e.at); return {m: t.getHours() * 60 + t.getMinutes(), k: Number(e.kcal)}; }).sort(function(a, b){ return a.m - b.m; });
  var untimed = m.kcal - steps.reduce(function(a, s){ return a + s.k; }, 0);
  var u = usual(m), yMax = Math.max(m.t.kcal * 1.12, m.kcal * 1.05);
  var px = function(mm){ return L + (Math.max(x0, Math.min(x1, mm)) - x0) / (x1 - x0) * (W - L - R); }, py = function(k){ return Tp + (1 - k / yMax) * (H - Tp - B); };
  var now = new Date(), nowM = m.isToday ? now.getHours() * 60 + now.getMinutes() : 1440;
  var cum = Math.max(0, untimed), d = 'M' + px(x0).toFixed(1) + ' ' + py(cum).toFixed(1), series = [{m: x0, k: cum}];
  steps.forEach(function(s){ d += ' H' + px(s.m).toFixed(1); cum += s.k; d += ' V' + py(cum).toFixed(1); series.push({m: s.m, k: cum}); });
  d += ' H' + px(nowM).toFixed(1);
  var area = d + ' V' + py(0).toFixed(1) + ' H' + px(x0).toFixed(1) + ' Z';
  var ud = u ? u.map(function(p, i){ return (i ? 'L' : 'M') + px(p.m).toFixed(1) + ' ' + py(p.k).toFixed(1); }).join(' ') : '';
  var hrs = [6, 9, 12, 15, 18, 21, 24].map(function(hh){ return '<text x="' + px(hh * 60).toFixed(1) + '" y="' + (H - 4) + '" text-anchor="' + (hh === 6 ? 'start' : hh === 24 ? 'end' : 'middle') + '">' + (hh < 10 ? '0' : '') + hh + ':00</text>'; }).join('');
  var diff = m.pace !== null ? Math.round(m.kcal - m.pace) : null;
  var chip = diff === null ? '<span class="cx9-chip">' + togo(m) + '</span>' : Math.abs(diff) < 50 ? '<span class="cx9-chip">on usual pace</span>'
    : '<span class="cx9-chip ' + (diff > 0 ? 'ahead' : 'behind') + '">' + (diff > 0 ? '+' : '−') + fmtK(Math.abs(diff)) + ' vs usual</span>';
  var tile = function(k, v, sub, pct, col){ return '<div class="cx9-tile"><div class="k">' + k + '</div><div class="v">' + v + (sub ? ' <s>' + sub + '</s>' : '') + '</div>' +
    (pct === null ? '' : '<div class="b"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%; background:' + col + '"></i></div>') + '</div>'; };
  var burn = null; try{ var bn = burnNow(); if(bn && bn.tdee) burn = Math.round(bn.tdee); }catch(e){}
  var wk = ''; var ws = weekStart(new Date());
  for(var i = 0; i < 7; i++){ var dd = addDays(ws, i), k = dd > new Date() ? 0 : getDailyIntake(ymd(dd)), tg = dayTargets(dd).kcal || 1, v = k > 0 ? dayVerdict(ymd(dd)) : null;
    wk += '<i style="height:' + Math.max(6, Math.min(100, k / tg * 82)) + '%; background:' + (!v ? C.n3 : ymd(dd) === todayYMD() && !isDayComplete(ymd(dd)) ? C.t4 : v.all ? C.mint : v.met === 2 ? C.caution : C.danger) + '"></i>'; }
  host.innerHTML =
    '<div class="cx9-top"><div><span class="cx-num">' + fmtK(m.kcal) + '</span> <span class="cx-sub">/ ' + fmtK(m.t.kcal) + ' kcal</span></div>' + chip + '</div>' +
    '<div class="cx9-chart"><svg viewBox="0 0 ' + W + ' ' + H + '">' +
      '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + py(m.t.kcal).toFixed(1) + '" y2="' + py(m.t.kcal).toFixed(1) + '" stroke="' + C.t4 + '" stroke-dasharray="3 4"/>' +
      '<text x="' + (W - R) + '" y="' + (py(m.t.kcal) - 4).toFixed(1) + '" text-anchor="end">target ' + fmtK(m.t.kcal) + '</text>' +
      (ud ? '<path d="' + ud + '" fill="none" stroke="' + C.t3 + '" stroke-width="1.4" stroke-dasharray="2 4"/>' : '') +
      '<path d="' + area + '" fill="' + C.mint + '" fill-opacity=".12"/><path d="' + d + '" fill="none" stroke="' + C.mint + '" stroke-width="2.2" stroke-linejoin="round"/>' +
      '<circle cx="' + px(nowM).toFixed(1) + '" cy="' + py(cum).toFixed(1) + '" r="3.6" fill="' + C.mint + '"/>' +
      '<g class="xh" style="display:none"><line y1="' + Tp + '" y2="' + (H - B) + '" stroke="' + C.t1 + '" stroke-width="1"/><circle r="3.4" fill="' + C.t1 + '"/></g>' + hrs +
    '</svg></div>' +
    '<div class="cx9-read">' + (steps.length ? 'Drag across the chart to read any time of day.' : 'No log times for this day.') + (u ? ' Dotted line: your usual day.' : '') + '</div>' +
    '<div class="cx9-grid">' +
      tile('Protein', fmt0(m.p), '/ ' + fmt0(m.t.protein) + 'g', m.p / m.t.protein * 100, C.prot) + tile('Carbs', fmt0(m.c), '/ ' + fmt0(m.t.carbs) + 'g', m.c / m.t.carbs * 100, C.carb) +
      tile('Fat', fmt0(m.f), '/ ' + fmt0(m.t.fat) + 'g', m.f / m.t.fat * 100, C.fat) + tile('Water', (m.hyd.total / 1000).toFixed(1), '/ ' + (m.hyd.target / 1000).toFixed(1) + ' L', m.hyd.total / m.hyd.target * 100, C.water) +
      tile('Day score', m.score === null ? '–' : m.score, '/ 100', m.score, m.score >= 75 ? C.mint : m.score >= 55 ? C.caution : C.danger) + tile('You burn', burn === null ? '–' : fmtK(burn), 'kcal', null) +
    '</div><div class="cx9-week">' + wk + '</div>';
  var box = host.querySelector('.cx9-chart'), xh = host.querySelector('.xh'), read = host.querySelector('.cx9-read');
  var at = function(mm){ var k = 0; series.forEach(function(s){ if(s.m <= mm) k = s.k; }); return k; };
  var move = function(ev){ var r = box.getBoundingClientRect(), fx = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), mm = Math.min(nowM, Math.round((x0 + fx * (x1 - x0)) / 5) * 5);
    var k = at(mm), uk = null; if(u) u.forEach(function(p){ if(p.m <= mm) uk = p.k; });
    xh.style.display = ''; xh.setAttribute('transform', 'translate(' + px(mm).toFixed(1) + ',0)'); xh.querySelector('circle').setAttribute('cy', py(k).toFixed(1));
    read.innerHTML = '<b>' + String(Math.floor(mm / 60)).padStart(2, '0') + ':' + String(mm % 60).padStart(2, '0') + '</b> · <b>' + fmtK(k) + '</b> kcal eaten' + (uk !== null ? ' · usual ' + fmtK(uk) : ''); };
  box.addEventListener('pointerdown', move); box.addEventListener('pointermove', function(ev){ if(ev.pointerType === 'mouse' || ev.pressure > 0) move(ev); });
}

/* ---------- 10: body ---------- */
var NODES = {brain:[75,22], thyroid:[75,50], immune:[75,70], blood:[63,88], heart:[86,86], energy:[75,108], liver:[65,126], gut:[80,146], muscle:[40,112], skin:[114,154], bones:[61,238], cells:[90,208]};
function figure(){
  // One half of a standing figure, drawn once and mirrored, so both sides match.
  var half = 'M75 42 L82 42 C82 51 84 55 92 58 C103 61 110 66 112 78 C114 96 116 118 118 138 C120 152 124 166 125 180 ' +
    'C126 188 123 193 119 193 C115 193 114 188 113 182 C111 168 108 154 106 140 C104 124 103 108 101 94 ' +
    'C100 112 98 128 97 142 C96 152 99 162 101 172 C104 198 103 226 100 250 C98 266 99 284 97 306 ' +
    'C96 316 100 322 103 328 L84 328 C85 318 85 310 84 300 C83 282 83 266 82 252 C81 228 79 206 77 186 L75 184 Z';
  return '<ellipse cx="75" cy="23" rx="15.5" ry="18.5"/><path d="' + half + '"/><path d="' + half + '" transform="matrix(-1 0 0 1 150 0)"/>';
}
function build10(m){
  if(!sel || !NODES[sel]){ var worst = m.sys.filter(function(s){ return s.pct !== null; }).sort(function(a, b){ return a.pct - b.pct; })[0]; sel = worst ? worst.k : 'bones'; }
  var mm = function(k, v, t, u, col, pct){ return '<div class="cx10-m"><div class="k">' + k + '</div><div class="v">' + v + ' <s>/ ' + t + u + '</s></div><div class="b"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%; background:' + col + '"></i></div></div>'; };
  var nodes = m.sys.map(function(s){ var p = NODES[s.k]; if(!p) return '';
    return '<g class="node' + (s.k === sel ? ' sel' : '') + '" data-k="' + s.k + '"><circle class="halo" cx="' + p[0] + '" cy="' + p[1] + '" r="13"/>' +
      '<circle class="ring" cx="' + p[0] + '" cy="' + p[1] + '" r="7.5" fill="#0a0b0e" fill-opacity=".55" stroke="none"/><circle cx="' + p[0] + '" cy="' + p[1] + '" r="4.6" fill="' + tone(s.pct) + '"/></g>'; }).join('');
  var s = m.sys.filter(function(x){ return x.k === sel; })[0];
  host.innerHTML = '<div class="cx10">' +
    '<div class="side"><div><span class="cx-num big">' + fmtK(m.kcal) + '</span><div class="cx-sub">of ' + fmtK(m.t.kcal) + ' kcal</div></div>' +
      mm('Protein', fmt0(m.p), fmt0(m.t.protein), 'g', C.prot, m.p / m.t.protein * 100) + mm('Carbs', fmt0(m.c), fmt0(m.t.carbs), 'g', C.carb, m.c / m.t.carbs * 100) + '</div>' +
    '<svg class="cx10-fig" viewBox="0 0 150 336" role="img" aria-label="Your body today">' +
      '<defs><mask id="cxm"><g fill="#fff" stroke="#fff" stroke-width="0.6">' + figure() + '</g></mask>' +
      '<linearGradient id="cxg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9af0c6"/><stop offset="1" stop-color="#3fae7d"/></linearGradient></defs>' +
      '<g fill="#1c2027" stroke="#1c2027" stroke-width="1.2" stroke-linejoin="round">' + figure() + '</g>' +
      '<g mask="url(#cxm)"><path class="liq" fill="url(#cxg)"/><path class="liq2" fill="#fff" fill-opacity=".10"/></g>' +
      '<g class="tl"><line x1="4" x2="146" stroke="' + C.t1 + '" stroke-opacity=".55" stroke-dasharray="3 4"/></g>' + nodes +
    '</svg>' +
    '<div class="side r"><div><span class="cx-num big">' + (m.score === null ? '–' : m.score) + '</span><div class="cx-sub">day score</div></div>' +
      mm('Fat', fmt0(m.f), fmt0(m.t.fat), 'g', C.fat, m.f / m.t.fat * 100) + mm('Water', (m.hyd.total / 1000).toFixed(1), (m.hyd.target / 1000).toFixed(1), ' L', C.water, m.hyd.total / m.hyd.target * 100) + '</div>' +
    '<button class="cx10-sys"><span><span class="n">' + s.n + '</span><span class="w">' + toneWord(s.pct) + ' today · tap to open</span></span><span class="p" style="color:' + tone(s.pct) + '">' + (s.pct === null ? '–' : s.pct + '%') + '</span></button></div>';
  host.querySelectorAll('.node').forEach(function(n){ n.addEventListener('click', function(){ sel = n.dataset.k; build10(model); draw10(); }); });
  host.querySelector('.cx10-sys').onclick = function(){ try{ openSystem(sel, model.es); }catch(e){} };
}
// feet at y=328, top of head at y=7; the target sits at the shoulders so going over shows
var FEET = 328, FULL = 62;
function draw10(){
  var liq = host.querySelector('.liq'); if(!liq) return;
  var t = anim.t, y = FEET - Math.min(1.2, anim.level) * (FEET - FULL), d = 'M-4 340 L-4 ' + y.toFixed(1), d2 = d;
  for(var x = 0; x <= 156; x += 6){ d += ' L' + x + ' ' + (y + Math.sin(x / 17 + t * 1.6) * 2.6).toFixed(1); d2 += ' L' + x + ' ' + (y + 3 + Math.sin(x / 13 - t * 1.2 + 2) * 3).toFixed(1); }
  liq.setAttribute('d', d + ' L156 340 Z'); host.querySelector('.liq2').setAttribute('d', d2 + ' L156 340 Z');
  var tl = host.querySelector('.tl line'); tl.setAttribute('y1', FULL); tl.setAttribute('y2', FULL);
}

/* ---------- mount ---------- */
function ensureHost(){
  var card = document.querySelector('#view-day .ring-card'); if(!card) return null;
  host = card.querySelector('.cx');
  if(!host){ host = document.createElement('div'); host.className = 'cx'; card.insertBefore(host, card.firstChild); }
  return host;
}
function render(){
  var view = document.getElementById('view-day');
  view.classList.toggle('cx-on', !!active);
  if(!ensureHost()) return;
  if(!active){ host.style.display = 'none'; host.innerHTML = ''; return; }
  host.style.display = '';
  model = M();
  if(active === 8) build8(model); else if(active === 9) build9(model); else build10(model);
  if(!raf) raf = requestAnimationFrame(tick);
}
function tick(ts){
  raf = 0;
  if(!active || !host || !model) return;
  var target = (model.t.kcal > 0 ? model.kcal / model.t.kcal : 0);
  anim.level += (target - anim.level) * 0.07; if(Math.abs(target - anim.level) < 0.0005) anim.level = target;
  anim.t = ts / 1000;
  if(document.getElementById('view-day').style.display !== 'none'){ if(active === 8) draw8(); else if(active === 10) draw10(); }
  if(active !== 9) raf = requestAnimationFrame(tick);
}
var _rd = renderDay;
renderDay = function(){ _rd.apply(this, arguments); try{ render(); }catch(e){ console.error('concept', e); } };
window.coachConcept = function(n){ active = n; try{ localStorage.setItem('coachconceptdemo', String(n)); }catch(e){} anim.level = 0; currentView === 'day' ? renderDay() : switchView('day'); window.scrollTo(0, 0);
  document.querySelectorAll('#cx-switch button').forEach(function(b){ b.classList.toggle('on', Number(b.dataset.cx) === n); }); };
var sw = document.createElement('div'); sw.id = 'cx-switch';
sw.innerHTML = [[10, '10 Body'], [8, '8 Living day'], [9, '9 Cockpit'], [0, 'Now']].map(function(x){ return '<button data-cx="' + x[0] + '"' + (x[0] === active ? ' class="on"' : '') + '>' + x[1] + '</button>'; }).join('');
sw.addEventListener('click', function(e){ var b = e.target.closest('button'); if(b) window.coachConcept(Number(b.dataset.cx)); });
document.body.appendChild(sw);
try{ renderDay(); }catch(e){}
})();
