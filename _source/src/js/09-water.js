// ---- Water ----
const WATER_KEY_PREFIX = 'caloriewater:';
const WATER_SEGMENTS = 8;
const WATER_SEG_ML = 250;

function waterKey(d){ return WATER_KEY_PREFIX + ymd(d); }
// GLASSES, not millilitres — that is the stored format. Anything that wants a
// volume must go through waterMl(), because reading this as though it were a
// quantity is precisely the bug that made the weekly review report 0.0L on
// every day for a week.
function loadWater(d){ return Number(CS.getItem(waterKey(d))) || 0; }
// Millilitres from here on. A count would have to be reinterpreted every time
// the glass size changed, which would quietly rewrite every past day.
function saveWaterMl(d, ml){ lsSet(waterKey(d), String(Math.max(0, Math.round(ml)))); try{ museSyncSoon(); }catch(e){} }
// The one place a stored water reading becomes millilitres.
//
// The UI writes GLASSES (0..WATER_SEGMENTS), but an older build stored
// millilitres directly, and tests/ctest.js still seeds that way. Multiplying a
// legacy reading by 250 would turn 2.5L into 625L, so anything larger than the
// most glasses that can be logged is taken as millilitres it already is.
// 8ml of water is not a reading anyone has ever taken, so the two ranges cannot
// collide in practice.
function waterMl(d){
  const v = loadWater(d);
  // Anything at or below the old eight-glass maximum is a legacy glass count.
  // Nobody has ever logged 8 ml of water, so the two ranges cannot collide.
  return v > WATER_SEGMENTS ? v : v * WATER_SEG_ML;
}

let waterSettingsOpen = false;
function waterSound(fromMl, toMl, targetMl){
  if(toMl <= fromMl) return;                     // taking a glass off makes the normal tap
  sfx(fromMl < targetMl && toMl >= targetMl ? 'waterGoal' : 'water');
}
function renderWater(){
  const {glassMl} = waterSettings();
  // v141: water's share of today's hydration target (other drinks counted).
  const targetMl = waterGoalMl(currentDate);
  const ml = waterMl(currentDate);
  const litres = ml / 1000;
  // How many glasses the target is worth, and how many have actually gone in.
  const targetGlasses = Math.max(1, Math.round(targetMl / glassMl));
  const filled = Math.round(ml / glassMl);
  const extra = Math.max(0, filled - targetGlasses);

  document.getElementById('water-val').textContent =
    litres.toFixed(2).replace(/0$/,'') + ' / ' + (targetMl/1000).toFixed(1) + ' L';

  const setTo = n => { waterSound(ml, Math.max(0, n) * glassMl, targetMl); saveWaterMl(currentDate, Math.max(0, n) * glassMl); renderWater(); };
  const seg = (i, cls) =>
    '<button class="wseg'+cls+'" data-wg="'+i+'" aria-label="Glass '+(i+1)+'"></button>';

  // The target row, then anything on top of it. Extra glasses read as a bonus
  // rather than as an overflow, because more water is not a problem.
  let html = '<div class="wsegrow">' +
    Array.from({length:targetGlasses},(_,i)=>seg(i, i<filled?' filled':'')).join('') +
    '</div>';
  const extraSlots = Math.max(extra, 0);
  html += '<div class="wsegrow extra-row">' +
    Array.from({length:extraSlots},(_,i)=>seg(targetGlasses+i, ' extra')).join('') +
    '<button class="wseg plus" data-wplus="1" aria-label="Another glass">+</button>' +
    '<span class="wspacer"></span></div>';

  const segs = document.getElementById('water-segs');
  segs.innerHTML = html;
  segs.querySelectorAll('[data-wg]').forEach(b=>{
    b.onclick = ()=>{
      const idx = Number(b.dataset.wg);
      // Tapping the last full glass empties it, so a mis-tap is one tap back.
      setTo(idx+1 === filled ? idx : idx+1);
    };
  });
  const plus = segs.querySelector('[data-wplus]');
  if(plus) plus.onclick = ()=> setTo(filled + 1);

  const note = document.getElementById('water-note');
  if(note){
    let fromDrinks = 0; try{ fromDrinks = hydDay(currentDate).fromDrinks; }catch(e){}
    const drinkBit = fromDrinks >= 50
      ? 'Other drinks gave '+(fromDrinks/1000).toFixed(1)+' L, so water\u2019s share today is '+(targetMl/1000).toFixed(1)+' L.' : '';
    note.innerHTML = extra > 0
      ? 'Target hit &mdash; <b>+'+((extra*glassMl)/1000).toFixed(2).replace(/0$/,'')+' L</b> on top.'
      : (drinkBit || (glassMl !== WATER_GLASS_ML_DEFAULT
          ? Math.round(glassMl)+' ml a glass.'
          : ''));
  }
  renderWaterSettings();
  try{ renderHydration(); }catch(e){}
}

// Two dials, folded away. They are in the card rather than on a settings screen
// because that is where the question occurs to you.

