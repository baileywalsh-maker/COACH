/* ============================================================
   v137 - today first.
   The backup reminder, the weigh-in nudge and the suggested change each used
   to be a full-width banner above the day card, which pushed the ring half way
   down the screen. They are now one row of chips. Each chip does exactly what
   its banner did; the banners themselves stay in the page (hidden by the style
   sheet) and still decide when they are due.
   ============================================================ */
function tfDue(id){ const el = document.getElementById(id); return !!el && el.style.display !== 'none'; }
function renderTodayChips(){
  const row = document.getElementById('tf-row');
  if(!row) return;
  const card = document.getElementById('adapt-card');
  const chips = [];
  if(tfDue('weigh-nudge')) chips.push(['weigh', 'var(--accent)', 'Weigh in']);
  if(tfDue('adapt-card')) chips.push(['adapt', '#7fb2ff', 'Target change']);
  else if(card) card.classList.remove('tf-open');
  if(tfDue('backup-nag')) chips.push(['backup', 'var(--caution)', 'Back up']);
  const sig = chips.map(c=>c[0]).join(',') + '|' + (card && card.classList.contains('tf-open') ? 1 : 0);
  if(row.dataset.sig === sig) return;
  row.dataset.sig = sig;
  row.style.display = chips.length ? 'flex' : 'none';
  row.innerHTML = chips.map(c=>'<button class="tf-chip' + (c[0] === 'adapt' && card.classList.contains('tf-open') ? ' on' : '') +
    '" data-tf="' + c[0] + '"><i style="background:' + c[1] + '"></i>' + c[2] + '</button>').join('');
}
(function(){
  const row = document.getElementById('tf-row');
  if(!row) return;
  row.addEventListener('click', ev=>{
    const b = ev.target.closest('[data-tf]');
    if(!b) return;
    const k = b.dataset.tf;
    if(k === 'weigh') document.getElementById('weigh-nudge').click();
    else if(k === 'backup') document.getElementById('backup-nag').click();
    else if(k === 'adapt'){ document.getElementById('adapt-card').classList.toggle('tf-open'); renderTodayChips(); }
  });
  // The banners are shown and hidden from several places. Watching them is the
  // one way to be sure the chips are never out of step.
  if(typeof MutationObserver === 'function'){
    const mo = new MutationObserver(()=>renderTodayChips());
    ['weigh-nudge', 'adapt-card', 'backup-nag'].forEach(id=>{
      const el = document.getElementById(id);
      if(el) mo.observe(el, {attributes: true, attributeFilter: ['style']});
    });
  }
  renderTodayChips();
})();
