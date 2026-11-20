// ---- Swipe an entry left to reveal Delete ----
const SWIPE_W = 88;
let openSwipe = null;

function closeSwipe(){
  if(!openSwipe) return;
  openSwipe.classList.add('snap');
  openSwipe.style.transform = '';
  const el = openSwipe;
  setTimeout(()=>el.classList.remove('snap'), 220);
  openSwipe = null;
}

// How far a row must travel before letting go deletes it rather than parking.
// A share of the row's own width, so it feels the same on any screen.
const FULL_SWIPE_FRACTION = 0.55;

// ---------------------------------------------------------------------------
// HOLD A LOGGED FOOD, DROP IT ON ANOTHER MEAL
const MEAL_PRESS_MS = 320;   // long enough not to fire on a tap or a scroll
let mealDrag = null;

function mealDragging(){ return !!mealDrag; }

// iOS cannot be told to stop an in-progress scroll, but a long press means one
// has not started. This keeps it that way for the length of the drag.
function blockTouchScroll(e){ e.preventDefault(); }

function startMealDrag(row, x, y){
  const wrap = row.closest('.entry-wrap');
  const group = row.closest('[data-mealgroup]');
  if(!wrap || !group) return;
  const rect = row.getBoundingClientRect();
  const ghost = row.cloneNode(true);
  ghost.classList.add('drag-ghost');
  ghost.removeAttribute('data-edit');
  ghost.style.width = rect.width + 'px';
  ghost.style.left = rect.left + 'px';
  ghost.style.top = rect.top + 'px';
  document.body.appendChild(ghost);
  mealDrag = {
    idx: Number(row.dataset.edit),
    ghost: ghost, wrap: wrap,
    // The x is LOCKED to where the row already sits. This is a vertical list;
    // letting the ghost track the thumb sideways only pushes it off the edge of
    // the screen and makes it look broken.
    left: rect.left, offY: y - rect.top,
    from: group.dataset.mealgroup, over: null, x: x, y: y, raf: 0
  };
  wrap.classList.add('lifting');
  document.body.classList.add('meal-dragging');
  document.addEventListener('touchmove', blockTouchScroll, {passive:false});
  if(navigator.vibrate){ try{ navigator.vibrate(12); }catch(err){} }
  moveMealDrag(x, y);
  mealDrag.raf = requestAnimationFrame(mealDragEdgeScroll);
}

function moveMealDrag(x, y){
  if(!mealDrag) return;
  mealDrag.x = x; mealDrag.y = y;
  mealDrag.ghost.style.top  = (y - mealDrag.offY) + 'px';
  // The ghost is pointer-events:none, so this finds what is UNDER it. Guarded
  // the same way as setPointerCapture elsewhere: a throw in the hit test would
  // abandon the drag half-built, leaving a ghost stuck on screen with no
  // gesture left to clean it up.
  let el = null;
  try{ if(document.elementFromPoint) el = document.elementFromPoint(x, y); }catch(err){}
  const group = el && el.closest ? el.closest('[data-mealgroup]') : null;
  const name = group ? group.dataset.mealgroup : null;
  if(name === mealDrag.over) return;
  mealDrag.over = name;
  document.querySelectorAll('[data-mealgroup]').forEach(g=>{
    const isOver = g.dataset.mealgroup === name;
    g.classList.toggle('dropok',   isOver && name !== mealDrag.from);
    g.classList.toggle('dropsame', isOver && name === mealDrag.from);
  });
}

// The four meals do not always fit on one screen. Scroll when the ghost gets
// near an edge, at a speed that rises as it gets closer.
function mealDragEdgeScroll(){
  if(!mealDrag) return;
  const EDGE = 90, MAX = 14;
  const h = window.innerHeight || 800;
  let dy = 0;
  if(mealDrag.y < EDGE) dy = -MAX * (1 - mealDrag.y / EDGE);
  else if(mealDrag.y > h - EDGE) dy = MAX * (1 - (h - mealDrag.y) / EDGE);
  if(dy){
    const el = document.scrollingElement || document.documentElement;
    el.scrollTop += dy;
    moveMealDrag(mealDrag.x, mealDrag.y);
  }
  mealDrag.raf = requestAnimationFrame(mealDragEdgeScroll);
}

function endMealDrag(commit){
  if(!mealDrag) return;
  const d = mealDrag;
  mealDrag = null;
  if(d.raf) cancelAnimationFrame(d.raf);
  document.removeEventListener('touchmove', blockTouchScroll, {passive:false});
  if(d.ghost && d.ghost.parentNode) d.ghost.parentNode.removeChild(d.ghost);
  if(d.wrap) d.wrap.classList.remove('lifting');
  document.body.classList.remove('meal-dragging');
  document.querySelectorAll('[data-mealgroup]').forEach(g=>g.classList.remove('dropok','dropsame'));
  // Nothing is written unless it landed somewhere else on purpose.
  if(commit && d.over && d.over !== d.from) moveEntryToMeal(d.idx, d.over);
}

function moveEntryToMeal(idx, meal){
  const es = loadEntries(currentDate);
  const e = es[idx];
  if(!e) return false;
  if((e.meal || 'Snack') === meal) return false;
  e.meal = meal;
  saveEntries(currentDate, es);
  renderDay();
  renderStreak();
  return true;
}

let tapOpenAt = 0;
document.addEventListener('click', e=>{
  if(tapOpenAt && Date.now() - tapOpenAt < 650){ tapOpenAt = 0; e.stopPropagation(); e.preventDefault(); }
}, true);
function attachSwipe(container){
  container.querySelectorAll('.entry').forEach(row=>{
    let startX=0, startY=0, dragging=false, armed=false, base=0;
    const wrap = row.closest('.entry-wrap');
    const del  = wrap ? wrap.querySelector('.swipe-del') : null;
    // If the row cannot be measured — not laid out yet, a hidden ancestor, a
    // browser that reports 0 — the threshold would be 0 and EVERY swipe would
    // count as a committed delete. Fail towards keeping the data: with no
    // usable width, full-swipe is simply unavailable and the row still parks.
    const commitAt = ()=>{
      const w = wrap ? wrap.offsetWidth : 0;
      return w > 40 ? w * FULL_SWIPE_FRACTION : Infinity;
    };

    // Tell the user the gesture has changed meaning, before they let go.
    const setArmed = (on)=>{
      if(!del) return;
      if(del.classList.contains('armed') === on) return;
      del.classList.toggle('armed', on);
      del.innerHTML = on
        ? '<i class="ti ti-trash" aria-hidden="true"></i>Release to delete'
        : '<i class="ti ti-trash" aria-hidden="true"></i>Delete';
    };

    // The long press lives here rather than in its own listener, because the
    // two gestures have to be able to cancel each other: a horizontal move must
    // kill a pending press, and a lift must kill the swipe.
    let pressTimer = null;
    const cancelPress = ()=>{ if(pressTimer){ clearTimeout(pressTimer); pressTimer = null; } };

    row.addEventListener('pointerdown', (e)=>{
      if(e.pointerType==='mouse' && e.button!==0) return;
      if(mealDragging()) return;
      // A different row is open — close it and let this gesture start fresh.
      if(openSwipe && openSwipe !== row) closeSwipe();
      startX = e.clientX; startY = e.clientY; row._downAt = Date.now();
      base = (openSwipe === row) ? -SWIPE_W : 0;
      armed = true; dragging = false;
      row.classList.remove('snap');
      row.classList.add('live');
      cancelPress();
      const px = e.clientX, py = e.clientY, pid = e.pointerId;
      pressTimer = setTimeout(()=>{
        pressTimer = null;
        if(dragging || openSwipe === row) return;   // it became a swipe instead
        armed = false;
        if(row.setPointerCapture) try{ row.setPointerCapture(pid); }catch(err){}
        startMealDrag(row, px, py);
      }, MEAL_PRESS_MS);
    });

    row.addEventListener('pointermove', (e)=>{
      if(mealDragging()){ moveMealDrag(e.clientX, e.clientY); e.preventDefault(); return; }
      if(!armed){ return; }
      const dx = e.clientX - startX, dy = e.clientY - startY;
      // Any real movement means this is a swipe or a scroll, not a hold.
      if(pressTimer && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) cancelPress();
      if(!dragging){
        // Vertical wins: let the page scroll instead of stealing the gesture.
        if(Math.abs(dy) > Math.abs(dx)){ armed = false; return; }
        if(Math.abs(dx) < 8) return;
        cancelPress();
        dragging = true;
        // Guarded: not every environment implements pointer capture, and an
        // uncaught throw here would abandon the gesture mid-drag.
        if(row.setPointerCapture) try{ row.setPointerCapture(e.pointerId); }catch(err){}
      }
      // Rightward drag is damped and never opens anything. Leftward runs free
      // now: damping past the stop was what made a full swipe feel like fighting
      // the row. Past the commit point the panel takes over.
      let x = base + dx;
      if(x > 0) x = x / 4;
      const past = Math.abs(x) >= commitAt();
      // Below the commit point, keep the old resistance past the button so the
      // parked position still has a detent to it.
      if(!past && x < -SWIPE_W) x = -SWIPE_W - (Math.abs(x) - SWIPE_W) / 4;
      setArmed(past);
      row.style.transform = 'translateX('+x+'px)';
      e.preventDefault();
    });

    const release = (e)=>{
      cancelPress();
      setTimeout(()=>row.classList.remove('live'), 260);
      const still = Math.abs(e.clientX - startX) < 10 && Math.abs(e.clientY - startY) < 10;
      // A lift ends the move; a cancelled pointer abandons it. Both before the
      // swipe logic, which has nothing to say about a drag it never owned.
      // v125: a hold that never moved was a slow tap - open the food.
      if(mealDragging()){
        endMealDrag(e.type === 'pointerup');
        if(e.type === 'pointerup' && still){ row._tapAt = tapOpenAt = Date.now(); openFoodDetail(Number(row.dataset.edit)); }
        return;
      }
      if(e.type === 'pointerup' && armed && !dragging && still){
        armed = false;
        row._tapAt = Date.now();
        if(openSwipe === row){ closeSwipe(); return; }
        tapOpenAt = Date.now();
        openFoodDetail(Number(row.dataset.edit));
        return;
      }
      if(!armed) return;
      armed = false;
      if(!dragging) return;
      dragging = false;
      const x = base + (e.clientX - startX);
      row.classList.add('snap');

      // Committed. Send the row out and delete the entry behind it.
      if(Math.abs(x) >= commitAt() && del && del.dataset.i != null){
        if(openSwipe === row) openSwipe = null;
        row.style.transform = 'translateX(-100%)';
        const idx = Number(del.dataset.i);
        if(wrap){
          wrap.style.maxHeight = wrap.offsetHeight + 'px';
          // Next frame, or the transition has nothing to animate from.
          requestAnimationFrame(()=>wrap.classList.add('going'));
        }
        setTimeout(()=>deleteEntryAt(idx), 210);
        return;
      }

      setArmed(false);
      if(x < -SWIPE_W/2){
        row.style.transform = 'translateX(-'+SWIPE_W+'px)';
        openSwipe = row;
      } else {
        row.style.transform = '';
        if(openSwipe === row) openSwipe = null;
      }
      setTimeout(()=>row.classList.remove('snap'), 220);
    };
    row.addEventListener('pointerup', release);
    row.addEventListener('pointercancel', release);

    // Tapping the row itself while it is open just closes it.
    row.addEventListener('click', (e)=>{
      if(row._tapAt && Date.now() - row._tapAt < 900){ e.stopPropagation(); return; }
      if(openSwipe === row){ e.stopPropagation(); closeSwipe(); }
    }, true);
  });
}

// Any tap elsewhere puts an open row back.
document.addEventListener('pointerdown', (e)=>{
  if(openSwipe && !e.target.closest('.entry-wrap')) closeSwipe();
}, true);

// ---- Tap sound ----
// A short, quiet click. Built with WebAudio rather than an audio file so there is
// nothing to download and no latency on the first tap.

// ============================================================
// Haptics. Deliberately rare: the tap sound fires on every control, so a
// second signal on every control would say nothing. This one fires ONLY where
// something is written — a food logged, a statement imported, a day confirmed
// — so the buzz means "that went in", every time, and nothing else.
// ============================================================
const HAPTIC_KEY = 'coachhaptic';
function hapticsOn(){ return CS.getItem(HAPTIC_KEY) !== 'off'; }
function buzz(kind){
  if(!hapticsOn()) return;
  try{
    if(!navigator.vibrate) return;      // iOS Safari ignores this; harmless
    navigator.vibrate(kind === 'big' ? [14, 40, 14] : 12);
  }catch(e){}
}

const SOUND_KEY = 'coachsound';
function soundOn(){ return CS.getItem(SOUND_KEY) !== 'off'; }
let audioCtx = null;
// A bubble pop is a fast UPWARD pitch bend with a very short decay — the
// opposite shape to a click. Sine wave through a lowpass keeps it soft.
function tick(){
  if(!soundOn()) return;
  // v122: Pluck, picked on the Sound Board - a small soft string, a touch
  // different every tap. Shares the event sounds' engine (defined below).
  try{
    if(!sfxCtx()) return;
    const f = sfxJ(760, .03);
    sfxTone({f0:f, f1:f*.85, dur:.07, attack:.002, peak:.12});
    sfxTone({f0:f*2, dur:.04, attack:.002, peak:.03});
  }catch(e){}
}

// ============================================================
// v121 - event sounds, picked on the COACH Sound Board.
// Made live with WebAudio like the tap above: no files, works offline. Every
// play is jittered a little, so the tenth glass of the day is not a loop.
// Obeys the same Sound setting as the tap. Nothing here touches stored data.
// ============================================================
let sfxBus = null, sfxNoise = null, sfxLastAt = 0;
const sfxLast = {};
function sfxCtx(){
  if(!audioCtx){
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return null;
    audioCtx = new AC();
  }
  if(audioCtx.state === 'suspended') audioCtx.resume();
  if(!sfxBus){
    sfxBus = audioCtx.createGain(); sfxBus.gain.value = 0.42;
    const comp = audioCtx.createDynamicsCompressor();
    sfxBus.connect(comp); comp.connect(audioCtx.destination);
    sfxNoise = audioCtx.createBuffer(1, audioCtx.sampleRate * 1.5, audioCtx.sampleRate);
    const d = sfxNoise.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i] = Math.random()*2-1;
  }
  return audioCtx;
}
const sfxR = (a,b)=> a + Math.random()*(b-a);
const sfxJ = (x,p=0.06)=> x * sfxR(1-p, 1+p);
function sfxTone({t=0, type='sine', f0, f1, glide, dur, attack=0.004, peak=0.3, lp}){
  const c = audioCtx, s = c.currentTime + 0.005 + t;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, s);
  if(f1) o.frequency.exponentialRampToValueAtTime(f1, s + (glide || dur));
  g.gain.setValueAtTime(0.0001, s);
  g.gain.exponentialRampToValueAtTime(peak, s + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
  let n = o;
  if(lp){ const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; n.connect(f); n = f; }
  n.connect(g); g.connect(sfxBus); o.start(s); o.stop(s + dur + 0.02);
}
function sfxNoiseHit({t=0, dur, attack=0.003, peak=0.3, type='bandpass', f0=1000, f1, Q=1}){
  const c = audioCtx, s = c.currentTime + 0.005 + t;
  const src = c.createBufferSource(); src.buffer = sfxNoise;
  const f = c.createBiquadFilter(); f.type = type; f.Q.value = Q;
  f.frequency.setValueAtTime(f0, s);
  if(f1) f.frequency.exponentialRampToValueAtTime(f1, s + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, s);
  g.gain.exponentialRampToValueAtTime(peak, s + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
  src.connect(f); f.connect(g); g.connect(sfxBus);
  src.start(s, Math.random()*0.5); src.stop(s + dur + 0.02);
}
function sfxBell({t=0, f, ratios=[1,2,2.76,5.4], amps=[.3,.12,.1,.04], dur=1.2}){
  ratios.forEach((k,i)=> sfxTone({t, f0:f*k, dur:dur/(1+i*0.6), attack:0.002, peak:amps[i]||.03}));
}
function sfxDrop(t=0, base=700, size=1){
  const f = sfxJ(base, .18);
  sfxTone({t, f0:f, f1:f*sfxR(2.2,2.8), glide:0.045*size, dur:0.09*size, attack:0.002, peak:.32});
}
const SFX = {
  water(){ sfxDrop(0, 600); sfxDrop(sfxR(.085,.11), 820, .85); },                                   // Double drip
  waterGoal(){ for(let i=0;i<8;i++) sfxDrop(i*.06, 300 + i*85, .9); },                              // Bottle full
  food(){ sfxBell({f:sfxJ(1180,.04), ratios:[1,2.41,3.98], amps:[.18,.08,.04], dur:.45});           // Plate
          sfxNoiseHit({dur:.02, f0:4000, Q:.8, peak:.06}); },
  scan(){ sfxTone({f0:1320, dur:.06, peak:.2}); sfxTone({t:.07, f0:1760, dur:.08, peak:.2}); },     // Double blip
  del(){ sfxNoiseHit({dur:.24, f0:sfxJ(2600), f1:380, Q:1.2, peak:.22, attack:.03}); },            // Swoosh
  undo(){ sfxTone({type:'triangle', f0:sfxJ(380), f1:900, dur:.16, peak:.22}); },                   // Blip back
  protein(){ [523,659,784,1047].forEach((f,i)=> sfxTone({t:i*.07, type:'triangle', f0:f, dur:i===3?.45:.12, peak:.2})); }, // Level up
  dayDone(){ [262,330,392,523].forEach((f,i)=> sfxTone({t:i*.025, type:'triangle', f0:f, dur:1.1, attack:.04, peak:.09, lp:2000})); }, // Warm chord
  streak(){ sfxNoiseHit({dur:.45, f0:300, f1:2400, Q:.9, peak:.2, attack:.2});                      // Flame
            for(let i=0;i<6;i++) sfxNoiseHit({t:.2+sfxR(0,.3), dur:.012, type:'highpass', f0:3500, peak:.1});
            sfxBell({t:.38, f:1568, dur:.8}); },
};
// delay: seconds to wait, so a win can follow the sound of the thing that caused it.
function sfx(name, delay){
  if(!soundOn() || !SFX[name]) return;
  const now = Date.now();
  // A saved meal logs several foods in one go: one plate, not five.
  if(sfxLast[name] && now - sfxLast[name] < 150) return;
  sfxLast[name] = now; sfxLastAt = now;
  try{
    if(!sfxCtx()) return;
    if(delay) setTimeout(()=>{ try{ SFX[name](); }catch(e){} }, delay*1000);
    else SFX[name]();
  }catch(e){}
}

// `click`, not `pointerdown`: a pointerdown fires the moment a finger lands, so
// brushing past or starting a scroll would trigger it. A click only fires on a
// completed press-and-release on the same element — real activation.
document.addEventListener('click', (e)=>{
  const el = e.target.closest('button, .tab, .wseg, .recent-chip, .entry, .saved-meal, .hist-cell, label');
  if(el && !el.classList.contains('nosound')){
    const at = Date.now();
    setTimeout(()=>{ if(sfxLastAt < at) tick(); }, 0);
  }
}, true);

function narrativeFormula(){
  const p = loadProfile();
  return 'Your bodyweight is now '+p.weight+' kg, so the estimate from your profile moved with it. '+
    'This is still a general formula — once you have '+ADAPT_MIN_WEIGHINS+' weigh-ins and '+ADAPT_MIN_DAYS+' confirmed days in four weeks, COACH switches to maintenance measured from your own data.';
}

