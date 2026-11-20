/* ============================================================
   v137 - weight against the plan.
   The goal is a rate (say +0.25 kg a week), so the chart draws that rate as a
   path with a band around it, the smoothed weight as a line and each weigh-in
   as a dot. Inside the band means the target is doing its job.
   ============================================================ */
// The planned weekly change for your goal and pace - one table, also used by
// the suggested change.
function planRate(){
  const p = loadProfile();
  const T = {
    lose:    { conservative:-0.35, moderate:-0.55, aggressive:-0.75 },
    build:   { conservative: 0.15, moderate: 0.25, aggressive: 0.35 },
    recomp:  { conservative:-0.10, moderate: 0.00, aggressive: 0.10 },
    maintain:{ conservative: 0.00, moderate: 0.00, aggressive: 0.00 }
  };
  const g = T[p.goal || 'maintain'] || T.maintain;
  const r = g[p.pace || 'moderate'];
  return typeof r === 'number' ? r : 0;
}
var WPATH_ALPHA = 0.25;      // the same smoothing as the "trend" figure
var WPATH_BASE = 0.3;        // kg either side at the start: day-to-day noise
var WPATH_DRIFT = 0.05;      // and this much more per week: a rate that is close enough
function weightPathModel(weights, rate){
  const pts = (weights || []).map(e=>({t: parseYMD(e.date).getTime(), kg: Number(e.kg)}))
    .filter(p=>p.kg > 0 && isFinite(p.t)).sort((a, b)=>a.t - b.t);
  if(pts.length < 3) return null;
  const WEEK = 7 * 86400000;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  if(t1 - t0 < WEEK) return null;
  // The path starts from the middle of the first three readings, so one odd
  // first weigh-in does not tilt the whole plan.
  const first3 = pts.slice(0, 3).map(p=>p.kg).sort((a, b)=>a - b);
  const start = first3[1];
  const path = t => start + rate * (t - t0) / WEEK;
  const half = t => WPATH_BASE + WPATH_DRIFT * (t - t0) / WEEK;
  // The trend smooths how far each weigh-in sits from the path, not the raw
  // weights. A plain running average always trails a weight that is moving,
  // so someone gaining exactly to plan would read as behind it.
  let s = pts[0].kg - start;
  const trend = pts.map((p, i)=>{ const dev = p.kg - path(p.t); if(i) s = WPATH_ALPHA * dev + (1 - WPATH_ALPHA) * s; return {t: p.t, kg: path(p.t) + s}; });
  const now = trend[trend.length - 1].kg;
  const diff = now - path(t1);
  return {pts: pts, trend: trend, t0: t0, t1: t1, start: start, rate: rate, path: path, half: half,
          now: now, plan: path(t1), diff: diff, inside: Math.abs(diff) <= half(t1),
          weekly: (now - trend[0].kg) / ((t1 - t0) / WEEK)};
}
function weightPathWord(m){
  const d = Math.abs(m.diff).toFixed(1);
  if(m.inside) return {cls: 'in', text: 'On plan' + (d === '0.0' ? '' : ', ' + d + ' kg ' + (m.diff > 0 ? 'above' : 'below') + ' the middle')};
  return {cls: 'out', text: 'Off plan, ' + d + ' kg ' + (m.diff > 0 ? 'above' : 'below') + ' the middle'};
}
function weightPathSVG(m){
  const W = 320, H = 150, L = 34, R = 8, T = 8, B = 20;
  const ys = m.pts.map(p=>p.kg).concat([m.path(m.t0) - m.half(m.t0), m.path(m.t0) + m.half(m.t0), m.path(m.t1) - m.half(m.t1), m.path(m.t1) + m.half(m.t1)]);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  const padY = Math.max(0.2, (y1 - y0) * 0.08); y0 -= padY; y1 += padY;
  const px = t => L + (t - m.t0) / (m.t1 - m.t0) * (W - L - R);
  const py = v => T + (y1 - v) / (y1 - y0) * (H - T - B);
  const f = n => n.toFixed(1);
  const band = [[m.t0, m.path(m.t0) - m.half(m.t0)], [m.t1, m.path(m.t1) - m.half(m.t1)],
                [m.t1, m.path(m.t1) + m.half(m.t1)], [m.t0, m.path(m.t0) + m.half(m.t0)]]
    .map(p=>f(px(p[0])) + ',' + f(py(p[1]))).join(' ');
  const line = m.trend.map(p=>f(px(p.t)) + ',' + f(py(p.kg))).join(' ');
  const dots = m.pts.map(p=>'<circle cx="' + f(px(p.t)) + '" cy="' + f(py(p.kg)) + '" r="2" fill="var(--t3)"/>').join('');
  const end = m.trend[m.trend.length - 1];
  const dl = t => new Date(t).toLocaleDateString(undefined, {day: 'numeric', month: 'short'});
  // Two labels on the left: the plan's start and where the plan is today.
  const la = m.path(m.t0), lb = m.path(m.t1);
  const lab = (v)=>'<text x="0" y="' + f(py(v) + 3) + '">' + v.toFixed(1) + '</text>';
  return '<svg class="wp-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Your weight against the planned path">' +
    '<polygon points="' + band + '" fill="var(--accent)" fill-opacity="0.13"/>' +
    '<line x1="' + f(px(m.t0)) + '" y1="' + f(py(la)) + '" x2="' + f(px(m.t1)) + '" y2="' + f(py(lb)) + '" stroke="var(--accent)" stroke-width="1" stroke-dasharray="3 4"/>' +
    dots +
    '<polyline points="' + line + '" fill="none" stroke="var(--t1)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>' +
    '<circle cx="' + f(px(end.t)) + '" cy="' + f(py(end.kg)) + '" r="4" fill="' + (m.inside ? 'var(--accent)' : 'var(--caution)') + '"/>' +
    lab(la) + (Math.abs(py(la) - py(lb)) > 12 ? lab(lb) : '') +
    '<text x="' + L + '" y="' + (H - 4) + '">' + dl(m.t0) + '</text><text x="' + (W - R) + '" y="' + (H - 4) + '" text-anchor="end">' + dl(m.t1) + '</text>' +
    '</svg>';
}
