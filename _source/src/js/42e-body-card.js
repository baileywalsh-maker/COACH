/* ============================================================
   v139 - four day views you slide between, like a photo post:
   Today (the ring), Body, Living day and Cockpit. Any of them can be set as
   the one the app opens on (a new key, coachdayview). Built on:
   v138 - the body card.
   The day card is a figure that fills as you eat, with the twelve body systems
   as dots on it, and the day's calories as a line underneath against your
   usual day. The old ring, bars and pace bar are still in the page (hidden by
   the style sheet) and still kept up to date, so everything that reads them or
   taps through them works as before.

   Everything here is a plain function: the day screen is first drawn before
   this part of the script has run, so nothing may depend on a top-level const.
   ============================================================ */
var bodyCard;          // everything the day views keep between draws
function bcColours(){ return {prot:'var(--prot)', carb:'var(--carb)', fat:'var(--fat)', mint:'var(--accent)', water:'#6fb7e8'}; }
function bcNodes(){ return {brain:[75,22], thyroid:[75,50], immune:[75,70], blood:[63,88], heart:[86,86], energy:[75,108],
                            liver:[65,126], gut:[80,146], muscle:[40,112], skin:[114,154], bones:[61,238], cells:[90,208]}; }
function bcTone(p){ return p === null ? 'var(--n3)' : p >= 80 ? 'var(--accent)' : p >= 55 ? 'var(--caution)' : 'var(--danger)'; }
function bcToneWord(p){ return p === null ? 'not enough data yet' : p >= 80 ? 'covered' : p >= 55 ? 'low' : 'short'; }
function bcFigure(){
  // One half of a standing figure, drawn once and mirrored, so both sides match.
  var half = 'M75 42 L82 42 C82 51 84 55 92 58 C103 61 110 66 112 78 C114 96 116 118 118 138 C120 152 124 166 125 180 ' +
    'C126 188 123 193 119 193 C115 193 114 188 113 182 C111 168 108 154 106 140 C104 124 103 108 101 94 ' +
    'C100 112 98 128 97 142 C96 152 99 162 101 172 C104 198 103 226 100 250 C98 266 99 284 97 306 ' +
    'C96 316 100 322 103 328 L84 328 C85 318 85 310 84 300 C83 282 83 266 82 252 C81 228 79 206 77 186 L75 184 Z';
  return '<ellipse cx="75" cy="23" rx="15.5" ry="18.5"/><path d="' + half + '"/><path d="' + half + '" transform="matrix(-1 0 0 1 150 0)"/>';
}
function bcModel(){
  var d = currentDate, es = loadEntries(d), t = dayTargets(d);
  var sum = function(k){ return es.reduce(function(a, e){ return a + (Number(e[k]) || 0); }, 0); };
  var isToday = ymd(d) === todayYMD(), open = isToday && !isDayComplete(todayYMD());
  var pu = null; try{ if(open) pu = paceUsual(); }catch(e){}
  var sys = SYSTEMS.map(function(sy){ var st = null; try{ st = systemState(sy, es); }catch(e){}
    // The same rule as the body pages: no figure on thin evidence.
    var ok = st && st.pct !== null && st.pct !== undefined && (typeof systemTrusted !== 'function' || systemTrusted(st));
    return {k: sy.k, n: sy.n, pct: ok ? Math.min(100, Math.round(st.pct)) : null}; });
  var score = null; try{ if(es.length) score = dayScoreParts(ymd(d)).score; }catch(e){}
  return {d: d, es: es, t: t, kcal: sum('kcal'), p: sum('protein'), c: sum('carbs'), f: sum('fat'), isToday: isToday, open: open,
          hyd: hydDay(d), pace: pu && pu.frac !== null ? pu.frac * t.kcal : null, sys: sys, score: score === null ? null : Math.round(score)};
}
// Your usual day as a curve: the middle share of calories logged by each half hour.
function bcUsualCurve(m){
  var key = todayYMD() + '|' + logEpoch + '|' + m.t.kcal;
  if(bodyCard.curveKey === key) return bodyCard.curve;
  bodyCard.curveKey = key; bodyCard.curve = null;
  var today = new Date(); today.setHours(0,0,0,0);
  var days = [];
  for(var i = 1; i <= PACE().WINDOW; i++){ var d = addDays(today, -i); if(isDayComplete(ymd(d)) && paceDayFrac(d, 1440) !== null) days.push(d); }
  if(days.length < PACE().MIN_DAYS) return null;
  var pts = [];
  for(var mins = 360; mins <= 1440; mins += 30){
    var fr = days.map(function(d){ return paceDayFrac(d, mins); }).sort(function(a, b){ return a - b; });
    var n = fr.length, med = n % 2 ? fr[(n - 1) / 2] : (fr[n / 2 - 1] + fr[n / 2]) / 2;
    pts.push({m: mins, k: med * m.t.kcal});
  }
  bodyCard.curve = pts; return pts;
}
function bcLine(m, W, H){
  W = W > 40 ? Math.round(W) : 330; H = H > 40 ? Math.round(H) : 132;
  var L = 4, R = 4, Tp = 14, B = 18, x0 = 360, x1 = 1440;
  var steps = m.es.filter(function(e){ return e.at && Number(e.kcal) > 0 && ymd(new Date(e.at)) === ymd(m.d); })
    .map(function(e){ var t = new Date(e.at); return {m: t.getHours() * 60 + t.getMinutes(), k: Number(e.kcal)}; }).sort(function(a, b){ return a.m - b.m; });
  var timed = steps.reduce(function(a, s){ return a + s.k; }, 0);
  var untimed = Math.max(0, m.kcal - timed);
  var u = m.isToday ? bcUsualCurve(m) : null, yMax = Math.max(m.t.kcal * 1.12, m.kcal * 1.05, 1);
  var px = function(mm){ return L + (Math.max(x0, Math.min(x1, mm)) - x0) / (x1 - x0) * (W - L - R); }, py = function(k){ return Tp + (1 - k / yMax) * (H - Tp - B); };
  var now = new Date(), nowM = m.open ? now.getHours() * 60 + now.getMinutes() : 1440;
  var endM = Math.max(nowM, steps.length ? steps[steps.length - 1].m : x0);
  var cum = untimed, d = 'M' + px(x0).toFixed(1) + ' ' + py(cum).toFixed(1), series = [{m: x0, k: cum}];
  steps.forEach(function(s){ d += ' H' + px(s.m).toFixed(1); cum += s.k; d += ' V' + py(cum).toFixed(1); series.push({m: s.m, k: cum}); });
  d += ' H' + px(endM).toFixed(1);
  var area = d + ' V' + py(0).toFixed(1) + ' H' + px(x0).toFixed(1) + ' Z';
  var ud = u ? u.map(function(p, i){ return (i ? 'L' : 'M') + px(p.m).toFixed(1) + ' ' + py(p.k).toFixed(1); }).join(' ') : '';
  var hrs = [6, 9, 12, 15, 18, 21, 24].map(function(hh){ return '<text x="' + px(hh * 60).toFixed(1) + '" y="' + (H - 4) + '" text-anchor="' + (hh === 6 ? 'start' : hh === 24 ? 'end' : 'middle') + '">' + (hh < 10 ? '0' : '') + hh + ':00</text>'; }).join('');
  var diff = m.pace !== null ? Math.round(m.kcal - m.pace) : null;
  var chip = diff === null ? '' : Math.abs(diff) < PACE().FLAT ? '<span class="bc-chip">on your usual pace</span>'
    : '<span class="bc-chip ' + (diff > 0 ? 'ahead' : 'behind') + '">' + fmtK(Math.abs(diff)) + ' kcal ' + (diff > 0 ? 'ahead of' : 'behind') + ' usual</span>';
  // v139: the chart is always there. With no log times yet it says why it is empty.
  var has = steps.length > 0;
  var hint = !has ? (m.kcal > 0 ? 'No log times saved for ' + (m.isToday ? 'today\u2019s food yet' : 'this day') + '. Food logged from v137 on keeps its time, and the line draws from there.'
                                : (m.isToday ? 'The line draws as you log food today.' : 'Nothing logged on this day.'))
    : 'Drag across the line to read any time.' + (u ? ' Dotted: your usual day.' : '');
  return {series: has ? series : null, u: u, nowM: nowM, px: px, py: py, x0: x0, x1: x1, hint: hint,
    html: '<div class="bc-line-h"><span class="t">' + (m.isToday ? 'Today' : 'This day') + ', hour by hour</span>' + chip + '</div>' +
      '<div class="bc-chart"><svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Calories through the day">' +
      '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + py(m.t.kcal).toFixed(1) + '" y2="' + py(m.t.kcal).toFixed(1) + '" stroke="var(--t4)" stroke-dasharray="3 4"/>' +
      '<text x="' + (W - R) + '" y="' + (py(m.t.kcal) - 4).toFixed(1) + '" text-anchor="end">target ' + fmtK(m.t.kcal) + '</text>' +
      '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + py(0).toFixed(1) + '" y2="' + py(0).toFixed(1) + '" stroke="var(--n3)"/>' +
      (ud ? '<path d="' + ud + '" fill="none" stroke="var(--t3)" stroke-width="1.4" stroke-dasharray="2 4"/>' : '') +
      (has ? '<path d="' + area + '" fill="var(--accent)" fill-opacity=".12"/><path d="' + d + '" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linejoin="round"/>' +
             '<circle cx="' + px(endM).toFixed(1) + '" cy="' + py(cum).toFixed(1) + '" r="3.6" fill="var(--accent)"/>' : '') +
      '<g class="xh" style="display:none"><line y1="' + Tp + '" y2="' + (H - B) + '" stroke="var(--t1)" stroke-width="1"/><circle r="3.4" fill="var(--t1)"/></g>' + hrs +
      '</svg></div><div class="bc-read">' + hint + '</div>'};
}
// Dragging across the line reads it. Shared by the Body and Cockpit views.
function bcLineWire(root, line){
  if(!line.series) return;
  var box = root.querySelector('.bc-chart'), xh = root.querySelector('.xh'), read = root.querySelector('.bc-read');
  var at = function(mn){ var k = 0; line.series.forEach(function(p){ if(p.m <= mn) k = p.k; }); return k; };
  var move = function(ev){ var r = box.getBoundingClientRect(), fx = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), mn = Math.min(line.nowM, Math.round((line.x0 + fx * (line.x1 - line.x0)) / 5) * 5);
    var k = at(mn), uk = null; if(line.u) line.u.forEach(function(p){ if(p.m <= mn) uk = p.k; });
    xh.style.display = ''; xh.setAttribute('transform', 'translate(' + line.px(mn).toFixed(1) + ',0)'); xh.querySelector('circle').setAttribute('cy', line.py(k).toFixed(1));
    read.innerHTML = '<b>' + String(Math.floor(mn / 60)).padStart(2, '0') + ':' + String(mn % 60).padStart(2, '0') + '</b> \u00b7 <b>' + fmtK(k) + '</b> kcal eaten' + (uk !== null ? ' \u00b7 usual ' + fmtK(uk) : ''); };
  var done = function(){ xh.style.display = 'none'; read.textContent = line.hint; };
  box.addEventListener('pointerdown', move);
  box.addEventListener('pointermove', function(ev){ if(ev.pointerType === 'mouse' || ev.pressure > 0) move(ev); });
  box.addEventListener('pointerup', done); box.addEventListener('pointercancel', done); box.addEventListener('pointerleave', done);
}
function bcBuild(){
  var bc = bodyCard, m = bc.model, C = bcColours(), N = bcNodes();
  if(!bc.sel || !N[bc.sel] || bc.selFor !== ymd(m.d)){
    var worst = m.sys.filter(function(s){ return s.pct !== null; }).sort(function(a, b){ return a.pct - b.pct; })[0];
    bc.sel = worst ? worst.k : 'bones'; bc.selFor = ymd(m.d);
  }
  var mm = function(key, k, v, t, u, col, pct){ return '<button class="bc-m" data-bc="' + key + '"><span class="k">' + k + '</span><span class="v">' + v + ' <s>/ ' + t + u + '</s></span><span class="b"><i style="width:' + Math.max(0, Math.min(100, pct || 0)) + '%; background:' + col + '"></i></span></button>'; };
  var nodes = m.sys.map(function(s){ var p = N[s.k]; if(!p) return '';
    return '<g class="node' + (s.k === bc.sel ? ' sel' : '') + '" data-k="' + s.k + '" role="button" aria-label="' + s.n + '"><circle class="halo" cx="' + p[0] + '" cy="' + p[1] + '" r="13"/>' +
      '<circle class="ring" cx="' + p[0] + '" cy="' + p[1] + '" r="7.5" fill="#0a0b0e" fill-opacity=".55" stroke="none"/><circle cx="' + p[0] + '" cy="' + p[1] + '" r="4.6" fill="' + bcTone(s.pct) + '"/></g>'; }).join('');
  var s = m.sys.filter(function(x){ return x.k === bc.sel; })[0] || m.sys[0];
  var numCol = ''; try{ numCol = document.getElementById('ring-num').style.color || ''; }catch(e){}
  var pct = function(a, b){ return b > 0 ? a / b * 100 : 0; };
  bc.host.innerHTML = '<div class="bc">' +
    '<div class="side"><button class="bc-kcal" data-bc="kcal"><span class="bc-num"' + (numCol ? ' style="color:' + numCol + '"' : '') + '>' + fmtK(m.kcal) + '</span><span class="bc-sub">of ' + fmtK(m.t.kcal) + ' kcal</span></button>' +
      mm('protein', 'Protein', fmt0(m.p), fmt0(m.t.protein), 'g', C.prot, pct(m.p, m.t.protein)) + mm('carbs', 'Carbs', fmt0(m.c), fmt0(m.t.carbs), 'g', C.carb, pct(m.c, m.t.carbs)) + '</div>' +
    '<svg class="bc-fig" viewBox="0 0 150 336" style="height:' + Math.max(160, (bc.H || 420) - 72) + 'px" role="img" aria-label="Your body today">' +
      '<defs><mask id="bcm"><g fill="#fff" stroke="#fff" stroke-width="0.6">' + bcFigure() + '</g></mask>' +
      '<linearGradient id="bcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9af0c6"/><stop offset="1" stop-color="#3fae7d"/></linearGradient></defs>' +
      '<g fill="#1c2027" stroke="#1c2027" stroke-width="1.2" stroke-linejoin="round">' + bcFigure() + '</g>' +
      '<g mask="url(#bcm)"><path class="liq" fill="url(#bcg)"/><path class="liq2" fill="#fff" fill-opacity=".10"/></g>' +
      '<line class="tl" x1="4" x2="146" y1="62" y2="62" stroke="var(--t1)" stroke-opacity=".55" stroke-dasharray="3 4"/>' + nodes +
    '</svg>' +
    '<div class="side r"><div class="bc-score"><span class="bc-num">' + (m.score === null ? '–' : m.score) + '</span><span class="bc-sub">day score</span></div>' +
      mm('fat', 'Fat', fmt0(m.f), fmt0(m.t.fat), 'g', C.fat, pct(m.f, m.t.fat)) + mm('water', 'Hydration', (m.hyd.total / 1000).toFixed(1), (m.hyd.target / 1000).toFixed(1), ' L', C.water, pct(m.hyd.total, m.hyd.target)) + '</div>' +
    '<button class="bc-sys"><span><span class="n">' + s.n + '</span><span class="w">' + bcToneWord(s.pct) + (m.isToday ? ' today' : '') + ' · tap to open</span></span><span class="p" style="color:' + (s.pct === null ? 'var(--t3)' : bcTone(s.pct)) + '">' + (s.pct === null ? '–' : s.pct + '%') + '</span></button>' +
    '</div>';
  bc.host.querySelectorAll('.node').forEach(function(n){ n.addEventListener('click', function(){ bodyCard.sel = n.dataset.k; bcBuild(); bcDraw(performance.now()); }); });
  bc.host.querySelector('.bc-sys').onclick = function(){ try{ openSystem(bodyCard.sel, bodyCard.model.es); }catch(e){} };
  // The old controls already open the right sheets, so the new ones go through them.
  bc.host.querySelectorAll('[data-bc]').forEach(function(b){ b.onclick = function(){ var k = b.dataset.bc;
    try{
      if(k === 'water'){ renderHydSheet(); openSheet('hyd-backdrop'); return; }
      var old = document.querySelector('#view-day .ring-card ' + (k === 'kcal' ? '.ring[data-bdmacro="kcal"]' : '[data-bdmacro="' + k + '"]'));
      if(old) old.click();
    }catch(e){} }; });
}
// Feet at y=328; the target sits at the shoulders (y=62) so going over still shows.
function bcDraw(ts){
  var bc = bodyCard; if(!bc || !bc.host) return;
  var liq = bc.host.querySelector('.liq'); if(!liq) return;
  var t = ts / 1000, y = 328 - Math.min(1.2, bc.level) * (328 - 62), d = 'M-4 340 L-4 ' + y.toFixed(1), d2 = d;
  for(var x = 0; x <= 156; x += 6){ d += ' L' + x + ' ' + (y + Math.sin(x / 17 + t * 1.6) * 2.6).toFixed(1); d2 += ' L' + x + ' ' + (y + 3 + Math.sin(x / 13 - t * 1.2 + 2) * 3).toFixed(1); }
  liq.setAttribute('d', d + ' L156 340 Z'); bc.host.querySelector('.liq2').setAttribute('d', d2 + ' L156 340 Z');
}

/* ---------- Living day: one tank, the day's food in layers ---------- */
function dvTogo(m){ var g = Math.round(m.t.kcal - m.kcal); return g >= 0 ? fmtK(g) + ' kcal to go' + (m.isToday ? ' today' : '') : fmtK(-g) + ' kcal over target'; }
function dvLegend(m){
  var r = function(c, n, v, t){ return '<span><i style="background:' + c + '"></i>' + n + ' <b>' + fmt0(v) + '</b> / ' + fmt0(t) + 'g</span>'; };
  return '<div class="dv-leg">' + r('#b98fe0', 'Protein', m.p, m.t.protein) + r('#e0b95f', 'Carbs', m.c, m.t.carbs) + r('#7fa8e0', 'Fat', m.f, m.t.fat) +
    '<span><i style="background:#6fb7e8"></i>Hydration <b>' + (m.hyd.total / 1000).toFixed(1) + '</b> / ' + (m.hyd.target / 1000).toFixed(1) + ' L</span></div>';
}
function dvBuildLive(host, m){
  host.innerHTML = '<div class="dv-tank"><canvas></canvas><div class="dv-over"><span class="bc-num">' + fmtK(m.kcal) + '</span><span class="bc-sub">' + dvTogo(m) + '</span></div></div>' + dvLegend(m);
}
function dvShade(hex, k){ var n = parseInt(hex.slice(1), 16), f = function(v){ return Math.max(0, Math.min(255, Math.round(v + v * k))); };
  return 'rgb(' + f(n >> 16) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')'; }
function dvDrawLive(ts){
  var bc = bodyCard, host = bc.slides[2], cv = host.querySelector('canvas'); if(!cv) return;
  var m = bc.model, r = cv.getBoundingClientRect(); if(r.width < 2) return;
  var dpr = Math.min(3, window.devicePixelRatio || 1);
  if(cv.width !== Math.round(r.width * dpr)){ cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
  var g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  var W = r.width, H = r.height, yT = Math.max(H * 0.30, 96), span = H - yT, T = m.t.kcal || 1, t = ts / 1000;
  g.clearRect(0, 0, W, H);
  var lvl = bc.level, scale = m.kcal > 0 ? lvl * T / m.kcal : 0;      // the layers rise together
  var bands = [[m.f * 9, '#7fa8e0'], [m.c * 4, '#e0b95f'], [m.p * 4, '#b98fe0']];
  var known = bands.reduce(function(a, b){ return a + b[0]; }, 0);
  if(m.kcal - known > 20) bands.push([m.kcal - known, '#7fe0b0']);
  var y = H, top = H - Math.min(1.28, lvl) * span;
  var wave = function(yy, amp, ph, sp){ g.lineTo(-2, yy); for(var x = 0; x <= W + 6; x += 6) g.lineTo(x, yy + Math.sin(x / 46 + t * sp + ph) * amp + Math.sin(x / 19 - t * sp * 1.4 + ph) * amp * 0.35); };
  bands.forEach(function(b, i){
    var hgt = b[0] * scale / T * span; if(hgt <= 0.5) return;
    var y0 = y, y1 = Math.max(top, y - hgt); y = y1;
    var last = i === bands.length - 1 || y1 <= top + 0.5;
    var gr = g.createLinearGradient(0, y1, 0, y0); gr.addColorStop(0, b[1]); gr.addColorStop(1, dvShade(b[1], -0.28));
    g.beginPath(); g.moveTo(-2, y0 + 4); wave(y1, last ? 5 : 2.2, i * 1.7, last ? 1.1 : 0.7); g.lineTo(W + 6, y0 + 4); g.closePath();
    g.globalAlpha = 0.92; g.fillStyle = gr; g.fill(); g.globalAlpha = 1;
  });
  if(m.kcal > 0){ g.beginPath(); g.moveTo(-2, top); for(var x = 0; x <= W + 6; x += 6) g.lineTo(x, top + Math.sin(x / 46 + t * 1.1 + (bands.length - 1) * 1.7) * 5 + Math.sin(x / 19 - t * 1.54 + (bands.length - 1) * 1.7) * 1.75);
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.5; g.stroke(); }
  // bubbles: more of them the better hydrated you are
  var want = Math.round(Math.min(1, m.hyd.total / (m.hyd.target || 1)) * 16);
  while(bc.bubbles.length < want) bc.bubbles.push({x: Math.random(), y: Math.random(), r: 1.5 + Math.random() * 3, s: 0.05 + Math.random() * 0.09});
  bc.bubbles.length = Math.min(bc.bubbles.length, want);
  bc.bubbles.forEach(function(b){ b.y -= b.s * 0.016; if(b.y < 0){ b.y = 1; b.x = Math.random(); }
    if(H - top < 24) return; var by = top + 8 + b.y * (H - top - 12);
    g.beginPath(); g.arc(b.x * W + Math.sin(t * 1.3 + b.x * 20) * 3, by, b.r, 0, 6.3); g.fillStyle = 'rgba(255,255,255,.22)'; g.fill(); });
  g.setLineDash([4, 5]); g.strokeStyle = 'rgba(238,240,243,.75)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, yT); g.lineTo(W, yT); g.stroke(); g.setLineDash([]);
  g.font = '700 11px Manrope, sans-serif'; g.textAlign = 'right'; g.fillStyle = 'rgba(238,240,243,.9)';
  g.fillText('target ' + fmtK(T), W - 14, yT - 7);
  if(m.pace !== null){ var yp = H - Math.min(1.2, m.pace / T) * span;
    g.fillStyle = '#eef0f3'; g.beginPath(); g.moveTo(W, yp - 6); g.lineTo(W - 9, yp); g.lineTo(W, yp + 6); g.closePath(); g.fill();
    g.fillStyle = 'rgba(238,240,243,.9)'; g.fillText('usual by now', W - 14, yp + 4); }
}

/* ---------- Cockpit: the line, six tiles, the week ---------- */
function dvBuildCockpit(host, m){
  var tile = function(k, v, sub, pct, col){ return '<div class="dv-tile"><div class="k">' + k + '</div><div class="v">' + v + (sub ? ' <s>' + sub + '</s>' : '') + '</div>' +
    (pct === null ? '' : '<div class="b"><i style="width:' + Math.max(0, Math.min(100, pct || 0)) + '%; background:' + col + '"></i></div>') + '</div>'; };
  var pct = function(a, b){ return b > 0 ? a / b * 100 : 0; };
  var burn = null; try{ var bn = burnNow(); if(bn && bn.tdee) burn = Math.round(bn.tdee); }catch(e){}
  var numCol = ''; try{ numCol = document.getElementById('ring-num').style.color || ''; }catch(e){}
  host.innerHTML =
    '<div class="dv-ctop"><span class="bc-num"' + (numCol ? ' style="color:' + numCol + '"' : '') + '>' + fmtK(m.kcal) + '</span> <span class="bc-sub">/ ' + fmtK(m.t.kcal) + ' kcal</span></div>' +
    '<div class="dv-cline"></div>' +
    '<div class="dv-grid">' +
      tile('Protein', fmt0(m.p), '/ ' + fmt0(m.t.protein) + 'g', pct(m.p, m.t.protein), 'var(--prot)') + tile('Carbs', fmt0(m.c), '/ ' + fmt0(m.t.carbs) + 'g', pct(m.c, m.t.carbs), 'var(--carb)') +
      tile('Fat', fmt0(m.f), '/ ' + fmt0(m.t.fat) + 'g', pct(m.f, m.t.fat), 'var(--fat)') + tile('Hydration', (m.hyd.total / 1000).toFixed(1), '/ ' + (m.hyd.target / 1000).toFixed(1) + ' L', pct(m.hyd.total, m.hyd.target), '#6fb7e8') +
      tile('Day score', m.score === null ? '\u2013' : m.score, '/ 100', m.score === null ? 0 : m.score, m.score >= 75 ? 'var(--accent)' : m.score >= 55 ? 'var(--caution)' : 'var(--danger)') +
      tile('You burn', burn === null ? '\u2013' : fmtK(burn), 'kcal', null) +
    '</div>';
  dvCockpitLine(host, m);
}
// The chart is drawn at the exact size of the room left for it, so it is never
// stretched and the view always fits.
function dvCockpitLine(host, m){
  var box = host.querySelector('.dv-cline'); if(!box) return;
  var fixed = 0;
  Array.prototype.forEach.call(host.children, function(c){ if(c !== box) fixed += c.offsetHeight; });
  var w = box.clientWidth || (host.clientWidth || 330);
  var h = Math.max(70, (bodyCard.H || 420) - fixed - 76);       // 76: the line's title, its readout and the gaps
  var line = bcLine(m, w, h);
  box.innerHTML = line.html;
  bcLineWire(host, line);
}

/* ---------- the slides ---------- */
function dvNames(){ return ['Today', 'Body', 'Living day', 'Cockpit']; }
function dvDefault(){ var v = CS.getItem('coachdayview'); v = v === null ? 1 : Number(v); return v >= 0 && v <= 3 ? v : 1; }
function dvSetup(card){
  var bc = bodyCard, foot = document.getElementById('ring-foot');
  var now = document.createElement('div'); now.className = 'dv-slide dv-now';
  Array.prototype.slice.call(card.childNodes).forEach(function(n){ if(n !== foot) now.appendChild(n); });
  bc.scroller = document.createElement('div'); bc.scroller.className = 'dv-slides';
  bc.track = document.createElement('div'); bc.track.className = 'dv-track';
  bc.scroller.appendChild(bc.track);
  bc.slides = [now];
  ['dv-body', 'dv-live', 'dv-cock'].forEach(function(c){ var s = document.createElement('div'); s.className = 'dv-slide ' + c; bc.slides.push(s); });
  bc.slides.forEach(function(s){ bc.track.appendChild(s); });
  bc.host = bc.slides[1];
  bc.bar = document.createElement('div'); bc.bar.className = 'dv-bar';
  card.insertBefore(bc.scroller, foot); card.insertBefore(bc.bar, foot);
  document.getElementById('view-day').classList.add('dv-on');
  bc.idx = dvDefault();
  dvSwipe(bc);
  bc.bar.addEventListener('click', function(ev){
    var d = ev.target.closest('[data-dv]');
    if(d){ dvGo(Number(d.dataset.dv), true); return; }
    if(ev.target.closest('.dv-set')){ lsSet('coachdayview', String(bc.idx)); dvBar(); }
  });
  var rz = 0;
  window.addEventListener('resize', function(){ clearTimeout(rz); rz = setTimeout(function(){ if(dvFit()) renderDayViews(); else dvGo(bodyCard.idx, false); }, 150); });
  document.addEventListener('visibilitychange', function(){ if(!document.hidden && bodyCard && !bodyCard.raf) bodyCard.raf = requestAnimationFrame(bcTick); });
}
// v140: the swipe is done by hand rather than by the browser's scrolling. The
// card follows the finger, a short flick is enough, and up-and-down still
// scrolls the page. Dragging on the Cockpit chart reads the chart instead.
function dvSwipe(bc){
  var sc = bc.scroller, x0 = 0, y0 = 0, t0 = 0, dx = 0, lock = null, id = null, moved = false;
  var set = function(px, anim){
    bc.track.style.transition = anim ? 'transform .34s cubic-bezier(.2,.8,.2,1)' : 'none';
    bc.track.style.transform = 'translate3d(' + (-bc.idx * sc.clientWidth + px) + 'px,0,0)';
  };
  sc.addEventListener('pointerdown', function(e){
    if(e.pointerType === 'mouse' && e.button !== 0) return;
    if(e.target.closest('.bc-chart')){ id = null; return; }
    id = e.pointerId; x0 = e.clientX; y0 = e.clientY; t0 = Date.now(); dx = 0; lock = null; moved = false;
  });
  sc.addEventListener('pointermove', function(e){
    if(e.pointerId !== id) return;
    var mx = e.clientX - x0, my = e.clientY - y0;
    if(lock === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)){
      lock = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
      if(lock === 'x'){ try{ sc.setPointerCapture(id); }catch(_){} }
    }
    if(lock !== 'x') return;
    moved = true;
    dx = mx;
    var edge = (bc.idx === 0 && dx > 0) || (bc.idx === 3 && dx < 0);
    set(edge ? dx * 0.3 : dx, false);
    if(e.cancelable) e.preventDefault();
  });
  var end = function(e){
    if(e.pointerId !== id) return;
    id = null;
    if(lock !== 'x'){ lock = null; return; }
    var w = sc.clientWidth || 1, v = dx / Math.max(1, Date.now() - t0);
    var i = bc.idx;
    if((dx < -w * 0.18 || v < -0.35) && i < 3) i++;
    else if((dx > w * 0.18 || v > 0.35) && i > 0) i--;
    lock = null;
    dvGo(i, true);
  };
  sc.addEventListener('pointerup', end);
  sc.addEventListener('pointercancel', function(e){ if(e.pointerId === id && lock === 'x') end(e); else { id = null; lock = null; } });
  // A swipe that ends over a button must not also press it.
  sc.addEventListener('click', function(e){ if(moved){ moved = false; e.stopPropagation(); e.preventDefault(); } }, true);
}
function dvGo(i, smooth){
  var bc = bodyCard, w = bc.scroller.clientWidth; if(!w) return false;
  bc.idx = Math.max(0, Math.min(3, i));
  bc.track.style.transition = smooth ? 'transform .34s cubic-bezier(.2,.8,.2,1)' : 'none';
  bc.track.style.transform = 'translate3d(' + (-bc.idx * w) + 'px,0,0)';
  dvBar();
  if(!bc.raf) bc.raf = requestAnimationFrame(bcTick);
  return true;
}
// Every view is the same height: what is left between the top of the card and
// the Add food bar, so a whole view is on screen at once. Never below 300px
// (small phones scroll a little), never above 460px. Returns true if it changed.
function dvFit(){
  var bc = bodyCard, card = bc.scroller.parentNode;
  var top = card.getBoundingClientRect().top + (window.scrollY || 0);
  var fab = document.querySelector('.fab-row');
  var bottom = fab && fab.offsetHeight ? fab.getBoundingClientRect().top : window.innerHeight;
  var foot = document.getElementById('ring-foot');
  var cs = getComputedStyle(card);
  var room = bottom - top - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0) - (bc.bar.offsetHeight + 32) - (foot ? foot.offsetHeight : 64) - 40;
  var H = Math.round(Math.max(300, Math.min(460, room)));
  if(!(H > 0) || H === bc.H) return false;
  bc.H = H;
  bc.scroller.style.height = H + 'px';
  return true;
}
function dvBar(){
  var bc = bodyCard, def = dvDefault(), names = dvNames();
  bc.bar.innerHTML = '<span class="dv-dots">' + names.map(function(n, i){ return '<button data-dv="' + i + '" class="' + (i === bc.idx ? 'on' : '') + '" aria-label="' + n + '"></button>'; }).join('') + '</span>' +
    '<span class="dv-name">' + names[bc.idx] + '</span>' +
    (bc.idx === def ? '<span class="dv-isdef">Opens here</span>' : '<button class="dv-set">Open on this</button>');
}
function bcTick(ts){
  var bc = bodyCard; if(!bc) return;
  bc.raf = 0;
  if(!bc.scroller || !bc.model) return;
  var view = document.getElementById('view-day');
  var showing = view && view.style.display !== 'none' && !document.hidden;
  var target = bc.model.t.kcal > 0 ? bc.model.kcal / bc.model.t.kcal : 0;
  var still = false; try{ still = window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){}
  var moving = bc.idx === 1 || bc.idx === 2;                    // only these two views move
  if(still || !moving){ bc.level = target; if(bc.idx === 1) bcDraw(0); else if(bc.idx === 2) dvDrawLive(0); return; }
  if(showing){
    bc.level += (target - bc.level) * 0.07; if(Math.abs(target - bc.level) < 0.0005) bc.level = target;
    bc.frame = (bc.frame || 0) + 1;
    if(bc.frame % 2 === 0 || bc.level !== target){ if(bc.idx === 1) bcDraw(ts); else dvDrawLive(ts); }   // the idle ripple runs at half rate
    bc.raf = requestAnimationFrame(bcTick);
  }
}
function renderDayViews(){
  var card = document.querySelector('#view-day .ring-card'); if(!card) return;
  if(!bodyCard) bodyCard = {H: 0, track: null, host: null, model: null, sel: null, selFor: '', level: 0, raf: 0, frame: 0, curve: null, curveKey: '', bubbles: [], idx: 1, placed: false};
  var bc = bodyCard;
  if(!bc.scroller) dvSetup(card);
  if(!bc.H) dvFit();
  bc.model = bcModel();
  bcBuild();
  dvBuildLive(bc.slides[2], bc.model);
  dvBuildCockpit(bc.slides[3], bc.model);
  // The app opens on the view you chose. It can only be placed once the screen has a width.
  if(!bc.placed){ bc.idx = dvDefault(); if(dvGo(bc.idx, false)) bc.placed = true; }
  else dvGo(bc.idx, false);
  dvBar();
  var now = typeof performance !== 'undefined' ? performance.now() : 0;
  bcDraw(now); dvDrawLive(now);
  if(!bc.raf) bc.raf = requestAnimationFrame(bcTick);
}
// The first draw of the day screen happened before this part existed.
try{ renderDayViews(); }catch(e){}
