/* ============================================================
   v84 - the water page
   Reads waterMl() and waterSettings() and writes through the same
   saveWaterMl() the card uses, so a glass added here and a glass added on the
   card are the same glass. The colour test is the only thing on the page that
   remembers anything, and it remembers it for the day only.
   ============================================================ */
const WP_SHADES = ['#f2efd8','#f2e9b8','#eedd90','#e8cf68','#dfba45','#cf9f2e','#b8801f','#8f5a18'];
const WP_SAYS = [
 'Pale straw — you are well hydrated. Nothing to do.',
 'Light — this is the one to aim for. On track.',
 'Fine. Still in the good range.',
 'Getting dark. Have a glass in the next hour.',
 'Short. Two glasses over the next couple of hours, not in one go.',
 'Clearly short. Drink now, and keep going through the afternoon.',
 'Very concentrated. Drink steadily — do not try to fix it in one hit.',
 'Dark. If it stays this colour once you have drunk properly, that is worth a doctor.'
];
const WP_SIGNS = [
 '<b>Thirst arrives late.</b> By the time you notice it you are already down about 1 to 2% of your bodyweight in fluid.',
 'A dull headache in the afternoon, usually blamed on a screen.',
 'The same weights feeling heavier than they did on Monday.',
 'Feeling hungry an hour after eating — thirst is very easy to read as hunger.',
 'Light-headed standing up quickly.',
 'Dry mouth, cracked lips, and passing water less often than four or five times a day.'
];
const WP_TIPS = [
 'A glass with every meal and one when you wake up gets you most of the way there without thinking about it.',
 'Carry one bottle you know the size of. Guessing is what makes people miss by a litre.',
 'Front-load around training — 500 ml in the couple of hours before, then sip through it. Trying to catch up afterwards works badly.',
 'Alcohol pulls fluid out of you. A big night needs water beside it, not after it.',
 'Caffeine at normal amounts is not the problem it is made out to be — your coffee counts toward the total.',
 'If you are sweating hard for over an hour, put some salt back too, not just water.'
];

// The bottle. The fill is a rectangle behind two drifting waves, clipped to the
// bottle outline, and it slides up to today's level when the page opens.
function wpBottle(pct){
  const p = Math.max(0, Math.min(1.15, pct));
  // 0 -> the fill sits fully below the bottle; 1 -> its top edge is at the top.
  const shift = (1 - Math.min(1, p)) * 150;
  return '<div class="wp-bottle"><svg viewBox="0 0 112 168" aria-hidden="true">'+
    '<defs><clipPath id="wpclip">'+
      '<path d="M38 6 h36 a4 4 0 0 1 4 4 v14 c0 6 10 12 10 24 v104 a12 12 0 0 1 -12 12 h-40 '+
        'a12 12 0 0 1 -12 -12 v-104 c0 -12 10 -18 10 -24 v-14 a4 4 0 0 1 4 -4 z"/>'+
    '</clipPath></defs>'+
    '<g clip-path="url(#wpclip)">'+
      '<rect x="0" y="0" width="112" height="168" fill="var(--well)"/>'+
      '<g class="wp-fill" style="transform:translateY(150px)" data-wpfill="'+shift.toFixed(1)+'">'+
        '<g class="wp-wave"><path d="M0 14 q14 -9 28 0 t28 0 t28 0 t28 0 t28 0 t28 0 v160 H0 Z" '+
          'fill="#3f86b8"/></g>'+
        '<g class="wp-wave b"><path d="M0 18 q18 -10 36 0 t36 0 t36 0 t36 0 t36 0 v160 H0 Z" '+
          'fill="#5aa8e0"/></g>'+
      '</g>'+
    '</g>'+
    '<path d="M38 6 h36 a4 4 0 0 1 4 4 v14 c0 6 10 12 10 24 v104 a12 12 0 0 1 -12 12 h-40 '+
      'a12 12 0 0 1 -12 -12 v-104 c0 -12 10 -18 10 -24 v-14 a4 4 0 0 1 4 -4 z" '+
      'fill="none" stroke="var(--border)" stroke-width="1.5"/>'+
  '</svg></div>';
}

let wpShade = null;          // the colour you tapped, this session only
function renderWaterPage(){
  const {glassMl, trainingTopUp} = waterSettings();
  // v141: water's share of today's hydration target, as on the water card.
  const targetMl = waterGoalMl(currentDate);
  const ml = waterMl(currentDate);
  const pct = targetMl > 0 ? ml / targetMl : 0;

  const hero = document.getElementById('wp-hero');
  if(hero){
    hero.innerHTML = wpBottle(pct);
    const fill = hero.querySelector('[data-wpfill]');
    const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(fill){
      const to = 'translateY(' + fill.getAttribute('data-wpfill') + 'px)';
      if(still) fill.style.transform = to;
      else requestAnimationFrame(()=>requestAnimationFrame(()=>{ fill.style.transform = to; }));
    }
  }

  const L = v => (v / 1000).toFixed(2).replace(/0$/, '');
  document.getElementById('wp-big').textContent = L(ml) + ' L';
  document.getElementById('wp-of').textContent =
    'of ' + (targetMl / 1000).toFixed(1) + ' L' +
    (ml >= targetMl ? ' · hit' : ' · ' + L(targetMl - ml) + ' L to go');

  // Adding here writes the same key the card does, in whole glasses, so the
  // two never drift apart.
  const add = document.getElementById('wp-add');
  if(add){
    add.innerHTML = '<button data-wpadd="1">+1 glass</button>'+
      '<button data-wpadd="2">+2</button>'+
      '<button data-wpadd="-1">−1</button>';
    add.querySelectorAll('[data-wpadd]').forEach(b=>{
      b.onclick = ()=>{
        const n = Math.round(ml / glassMl) + Number(b.dataset.wpadd);
        waterSound(ml, Math.max(0, n) * glassMl, targetMl);
        saveWaterMl(currentDate, Math.max(0, n) * glassMl);
        renderWater();
        renderWaterPage();
      };
    });
  }
  document.getElementById('wp-cap').textContent =
    Math.round(glassMl) + ' ml a glass · ' + Math.round(targetMl / glassMl) +
    ' of them today' + (trainingTopUp ? ', including the training top-up' : '') + ', after your other drinks';

  // ---- seven days, from what is already stored ----
  const bars = document.getElementById('wp-bars');
  if(bars){
    const days = [];
    for(let i = 6; i >= 0; i--){
      const d = addDays(currentDate, -i);
      const dml = waterMl(d);
      const dt = waterGoalMl(d);
      days.push({d, ml: dml, target: dt});
    }
    const top = Math.max.apply(null, days.map(x=>Math.max(x.ml, x.target)).concat([1]));
    bars.innerHTML = days.map(x=>{
      const h = Math.max(3, Math.round((x.ml / top) * 46));
      const hit = x.target > 0 && x.ml >= x.target;
      return '<div><i class="'+(hit ? 'hit' : '')+'" style="height:'+h+'px"></i>'+
        '<span>'+['S','M','T','W','T','F','S'][x.d.getDay()]+'</span></div>';
    }).join('');
  }

  // The 2% figure is yours, not an average - it comes off your own weight.
  const kg = Number(loadProfile().weight);
  const two = (kg > 30 && kg < 250) ? (kg * 0.02).toFixed(1) + ' kg of fluid' : 'about a litre and a half';
  document.getElementById('wp-what').innerHTML =
    'You are about <b>60% water</b>, and every reaction in you happens in it. It is the volume in '+
    'your blood, the fluid in your joints, the way you shed heat, and the thing that carries '+
    'nutrients in and waste out. Lose <b>2% of your bodyweight</b> — ' + two + ' for you — and '+
    'endurance, strength and concentration all measurably drop before you have registered being '+
    'thirsty.';

  document.getElementById('wp-signs').innerHTML = dpSigns(WP_SIGNS);
  document.getElementById('wp-tips').innerHTML = dpSigns(WP_TIPS, 'do');

  document.getElementById('wp-train').innerHTML = trainingTopUp
    ? 'Today is marked as a training day, so your target has <b>' + fmtK(trainingTopUp) + ' ml</b> on it already. An hour '+
      'of hard work is commonly half a litre to a litre of sweat, and more in heat.'
    : 'Mark a day as a training day on the day screen and this target goes up by <b>500 ml</b> '+
      'automatically — an hour of hard work is commonly half a litre to a litre of sweat, and '+
      'more in heat.';

  // ---- the colour strip ----
  const sc = document.getElementById('wp-scale');
  if(sc){
    sc.innerHTML = WP_SHADES.map((c, i)=>
      '<button data-wpsh="'+i+'" aria-pressed="'+(wpShade === i)+'" '+
      'aria-label="Shade '+(i+1)+' of 8" style="background:'+c+'"></button>').join('');
    sc.querySelectorAll('[data-wpsh]').forEach(b=>{
      b.onclick = ()=>{ wpShade = Number(b.dataset.wpsh); renderWaterPage(); };
    });
  }
  if(wpShade !== null){
    const v = document.getElementById('wp-verdict');
    if(v) v.innerHTML = WP_SAYS[wpShade] +
      (wpShade >= 3 ? ' <b>' + Math.max(1, wpShade - 1) + ' glass' +
        (Math.max(1, wpShade - 1) === 1 ? '' : 'es') + '</b> would be a reasonable answer.' : '');
  }
}

function openWaterPage(){
  renderWaterPage();
  const sh = document.querySelector('#waterpage-backdrop .sheet');
  if(sh) sh.scrollTop = 0;
  const wbar = document.querySelector('#waterpage-backdrop .pagebar');
  if(wbar) wbar.classList.remove('stuck');
  openSheet('waterpage-backdrop');
}

// Twelve marks, one per part of the body.
//
// Two lessons from the last two attempts. A solid shape filled from the bottom
// breaks up - half of it vanishes and you cannot tell what it is. A line
// drawing alone stays clear but just sits there, and the water bottle works
// because it FILLS. So both: the outline is always drawn, complete, and the
// colour rises inside it behind the same drifting wave the bottle uses.
//
// And not everything has to be the organ itself. Where the organ is obscure
// - a thyroid, a liver - a symbol that says what it DOES is clearer: a
// butterfly, a filter. Where the organ is the clearest thing there is - a
// heart, a brain, a droplet - it stays.
//
//   fill  a closed silhouette; the colour rises inside it
//   trace a single stroke that fills along its own length instead
//   s     strokes drawn on top, never clipped
const ORGAN3 = {
 // A bone. Nothing says skeleton faster.
 bones: { tone:'#e6dfcd', /* bone */ fill:'M48 22 a12 12 0 0 0 -12 14 a12 12 0 0 0 12 14 v20 a12 12 0 0 0 -12 14 a12 12 0 0 0 12 14 h24 a12 12 0 0 0 12-14 a12 12 0 0 0 -12-14 v-20 a12 12 0 0 0 12-14 a12 12 0 0 0 -12-14 z',
   s:[{d:'M48 22 a12 12 0 0 0 -12 14 a12 12 0 0 0 12 14 v20 a12 12 0 0 0 -12 14 a12 12 0 0 0 12 14 h24 a12 12 0 0 0 12-14 a12 12 0 0 0 -12-14 v-20 a12 12 0 0 0 12-14 a12 12 0 0 0 -12-14 z'},
      {d:'M52 56 h16 M52 64 h16 M52 72 h16', ink:1, o:.35}]},

 // What you do with it, rather than what it is.
 muscle: { tone:'#9fb0c2', /* steel */ fill:'M41 42 h11 v36 h-11 z M68 42 h11 v36 h-11 z M52 55 h16 v10 h-16 z M27 49 h11 v22 h-11 z M82 49 h11 v22 h-11 z',
   s:[{raw:'<rect x="41" y="42" width="11" height="36" rx="4"/><rect x="68" y="42" width="11" height="36" rx="4"/>'},
      {d:'M52 60 h16'},
      {raw:'<rect x="27" y="49" width="11" height="22" rx="4"/><rect x="82" y="49" width="11" height="22" rx="4"/>', o:.8}]},

 blood: { tone:'#d4433f', /* blood */ fill:'M60 16 c0 0 30 35 30 54 0 17-13 30-30 30 -17 0-30-13-30-30 0-19 30-54 30-54 z',
   s:[{d:'M60 16 c0 0 30 35 30 54 0 17-13 30-30 30 -17 0-30-13-30-30 0-19 30-54 30-54 z'},
      {d:'M50 74 a10 7 0 1 0 20 0 a10 7 0 1 0 -20 0', ink:1, o:.5}]},

 brain: { tone:'#dfa0aa', /* brain tissue */ fill:'M42 34 c0-13 9-22 21-22 11 0 20 6 23 16 8 1 14 8 14 17 0 5-2 10-6 13 3 4 5 8 5 13 0 12-10 21-23 21 -4 5-10 8-17 8 -14 0-25-10-25-23 0-3 1-7 2-10 -6-4-10-11-10-19 0-9 6-17 14-20 z',
   s:[{d:'M42 34 c0-13 9-22 21-22 11 0 20 6 23 16 8 1 14 8 14 17 0 5-2 10-6 13 3 4 5 8 5 13 0 12-10 21-23 21 -4 5-10 8-17 8 -14 0-25-10-25-23 0-3 1-7 2-10 -6-4-10-11-10-19 0-9 6-17 14-20 z'},
      {d:'M60 12 v84', ink:1, o:.3},
      {d:'M48 30 c-5 4-6 11-1 15 M72 30 c5 4 6 11 1 15 M60 48 c-7 1-11 6-11 12 M60 48 c7 1 11 6 11 12 M46 64 c-4 4-4 10 0 14 M74 64 c4 4 4 10 0 14', ink:1, o:.4}]},

 // A shield, not a white blood cell. Everyone reads a shield.
 immune: { tone:'#5a9bd6', /* a steel shield */ fill:'M60 16 l30 11 v30 c0 26-17 44-30 52 -13-8-30-26-30-52 v-30 z',
   s:[{d:'M60 16 l30 11 v30 c0 26-17 44-30 52 -13-8-30-26-30-52 v-30 z'},
      {d:'M48 60 l9 9 16-18', ink:1, o:.6, w:3.6}]},

 heart: { tone:'#c23b3b', /* blood */ fill:'M60 100 c-24-18-38-33-38-51 0-14 10-24 23-24 7 0 12 3 15 8 3-5 8-8 15-8 13 0 23 10 23 24 0 18-14 33-38 51 z',
   s:[{d:'M60 100 c-24-18-38-33-38-51 0-14 10-24 23-24 7 0 12 3 15 8 3-5 8-8 15-8 13 0 23 10 23 24 0 18-14 33-38 51 z'},
      {d:'M28 58 h12 l5-12 6 25 6-18 4 5 h21', ink:1, o:.6}]},

 // A tube, so it fills along its length rather than rising.
 gut: { tone:'#d98b7a', /* gut lining */ trace:'M60 18 c-17 0-25 8-25 17 0 9 8 14 20 14 13 0 22 6 22 15 0 9-9 15-22 15 -12 0-20 5-20 13 0 9 8 13 20 13 h12',
   s:[{d:'M44 30 a2.4 2.4 0 1 0 0-.1 M76 48 a2.4 2.4 0 1 0 0-.1 M40 78 a2.4 2.4 0 1 0 0-.1', ink:1, o:.5}]},

 energy: { tone:'#f2c63d', /* electricity */ fill:'M68 14 L36 66 h18 l-6 42 34-54 h-20 z',
   s:[{d:'M68 14 L36 66 h18 l-6 42 34-54 h-20 z'}]},

 // The thyroid is called butterfly-shaped. So: a butterfly.
 thyroid: { tone:'#e08a3c', /* a butterfly's wing */
   /* Each wing used to close along a line INSIDE the body, so its closing edge
      showed straight through - four seams crossing the middle. The wings now
      end at the body's own edge and the body is drawn last, over the joins. */
   fill:'M55 43 c-6-16-19-24-28-20 -10 4-11 17-3 25 6 7 17 11 31 13 z'+
        'M55 61 c-8 13-17 19-26 17 -9-2-10-13-3-20 6-5 15-8 29-8 z'+
        'M65 43 c6-16 19-24 28-20 10 4 11 17 3 25 -6 7-17 11-31 13 z'+
        'M65 61 c8 13 17 19 26 17 9-2 10-13 3-20 -6-5-15-8-29-8 z'+
        'M60 30 c3 0 6 5 6 13 v28 c0 9-3 15-6 15 -3 0-6-6-6-15 v-28 c0-8 3-13 6-13 z',
   s:[{d:'M55 43 c-6-16-19-24-28-20 -10 4-11 17-3 25 6 7 17 11 31 13 z'+
         'M55 61 c-8 13-17 19-26 17 -9-2-10-13-3-20 6-5 15-8 29-8 z'},
      {d:'M65 43 c6-16 19-24 28-20 10 4 11 17 3 25 -6 7-17 11-31 13 z'+
         'M65 61 c8 13 17 19 26 17 9-2 10-13 3-20 -6-5-15-8-29-8 z'},
      {d:'M60 30 c3 0 6 5 6 13 v28 c0 9-3 15-6 15 -3 0-6-6-6-15 v-28 c0-8 3-13 6-13 z'},
      {d:'M56 31 c-3-8-9-13-15-14 M64 31 c3-8 9-13 15-14', o:.75}]},

 // You, from the shoulders up - which is where skin, hair and nails show.
 skin: { tone:'#c99a74', /* skin */
   fill:'M60 20 a17 17 0 1 1 -0.1 0 z M24 102 c0-17 16-28 36-28 20 0 36 11 36 28 z M41 38 a19 19 0 0 1 38 0 c-3-8-10-12-19-12 -10 0-16 4-19 12 z',
   s:[{d:'M60 20 a17 17 0 1 1 -0.1 0 z'},
      {d:'M24 102 c0-17 16-28 36-28 20 0 36 11 36 28'},
      {d:'M41 38 a19 19 0 0 1 38 0 c-3-8-10-12-19-12 -10 0-16 4-19 12 z'},
      {d:'M50 28 c4-3 12-4 19-1', ink:1, o:.35}]},

 // A cell, drawn as the hexagon cells are always drawn, inside its guard ring.
 cells: { tone:'#4fb8a0', /* a living cell */ fill:'M60 20 l31 18 v36 l-31 18 -31-18 v-36 z',
   s:[{d:'M60 20 l31 18 v36 l-31 18 -31-18 v-36 z'},
      {d:'M60 46 a14 14 0 1 0 0.1 0', ink:1, o:.5},
      {d:'M60 8 a52 52 0 1 0 0.1 0', o:.3, dash:'4 7'}]},

 // Everything you eat and drink goes through it. So: a filter.
 liver: { tone:'#b07a42', /* everything you put through it */ fill:'M24 28 h72 l-27 33 v31 l-18 9 v-40 z',
   s:[{d:'M24 28 h72 l-27 33 v31 l-18 9 v-40 z'},
      {d:'M40 42 h40', ink:1, o:.4}]}
};
/* The mark for one part of the body: its outline, always complete, with the
   colour rising inside it behind the same drifting wave the water bottle uses.
   Tap it and the level runs up again. */
function sysArt(key, pct, col){
  const o = ORGAN3[key];
  if(!o) return '';
  const p = Math.max(0, Math.min(100, pct === null ? 0 : pct));
  /* v88: what rises inside a mark is the thing itself - bone is bone-coloured,
     blood is red, the bolt is electric yellow - and the mark is outlined in the
     same colour, so it reads as an object rather than as a status light. How
     well fuelled you are is the figure underneath it, which is where red, amber
     and green belong. `col` is still taken so every caller keeps working. */
  const tone = o.tone || col;
  /* A detail - a fissure on the brain, the lattice in a bone, the trace across
     the heart - used to be drawn in the same colour as the mark, so the moment
     the fill rose past it it vanished. Details are drawn in ink instead: dark
     against the fill, and still just visible against the empty grey above it. */
  const strokes = o.s.map(x=>
    '<g stroke="'+(x.ink ? 'var(--bg)' : tone)+'" stroke-width="'+(x.w || 3.2)+
    '" opacity="'+(x.o == null ? 1 : x.o)+'"'+
    (x.dash ? ' stroke-dasharray="'+x.dash+'"' : '')+'>'+
    (x.raw || ('<path d="'+x.d+'"/>'))+'</g>').join('');

  let inner;
  if(o.trace){
    // A tube fills along its length. Rising would just cut it in half.
    inner = '<path d="'+o.trace+'" fill="none" stroke="var(--card2)" stroke-width="13" '+
        'stroke-linecap="round" stroke-linejoin="round"/>'+
      '<path class="sa-trace" d="'+o.trace+'" fill="none" stroke="'+tone+'" stroke-width="13" '+
        'stroke-linecap="round" stroke-linejoin="round" data-satrace="'+p+'"/>'+
      '<path d="'+o.trace+'" fill="none" stroke="'+tone+'" stroke-width="3.2" '+
        'stroke-linecap="round" stroke-linejoin="round"/>';
  } else {
    const y = 120 - (120 * p / 100);
    const id = 'sac-' + key;
    inner = '<defs><clipPath id="'+id+'"><path d="'+o.fill+'"/></clipPath></defs>'+
      '<g clip-path="url(#'+id+')">'+
        '<rect x="-30" y="-30" width="180" height="180" fill="var(--card2)"/>'+
        '<g class="sa-fill" style="transform:translateY(120px)" data-safill="'+y.toFixed(1)+'">'+
          '<g class="sa-wave"><path d="M-30 9 q15 -9 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 '+
            'v150 H-30 Z" fill="'+tone+'" opacity=".9"/></g>'+
        '</g>'+
      '</g>';
  }
  return '<svg class="sysart" viewBox="0 0 120 120" width="168" height="168" role="button" '+
    'tabindex="0" aria-label="Play the level again">'+ inner +
    '<g class="sa-ico" fill="none" stroke-linecap="round" stroke-linejoin="round">'+strokes+'</g>'+
  '</svg>';
}

// Run the level up a frame after the page is up, so the movement is seen rather
// than finished behind the opening animation. Tapping the mark runs it again.
function sysArtAnimate(root){
  const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const svg  = root.querySelector('.sysart');
  const fill = root.querySelector('[data-safill]');
  const tr   = root.querySelector('[data-satrace]');

  const play = ()=>{
    if(fill){
      const to = 'translateY(' + fill.getAttribute('data-safill') + 'px)';
      if(still){ fill.style.transform = to; }
      else {
        fill.style.transition = 'none';
        fill.style.transform = 'translateY(120px)';
        requestAnimationFrame(()=>requestAnimationFrame(()=>{
          fill.style.transition = '';
          fill.style.transform = to;
        }));
      }
    }
    if(tr && typeof tr.getTotalLength === 'function'){
      let L = 0;
      try{ L = tr.getTotalLength(); }catch(e){ L = 0; }
      if(L > 0){
        const to = L * (1 - (Number(tr.getAttribute('data-satrace')) || 0) / 100);
        tr.style.strokeDasharray = L;
        if(still){ tr.style.strokeDashoffset = to; }
        else {
          tr.style.transition = 'none';
          tr.style.strokeDashoffset = L;
          requestAnimationFrame(()=>requestAnimationFrame(()=>{
            tr.style.transition = '';
            tr.style.strokeDashoffset = to;
          }));
        }
      }
    }
  };
  play();
  if(svg){
    svg.addEventListener('click', play);
    svg.addEventListener('keydown', e=>{
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); play(); }
    });
  }
}

/* ============================================================
   v84 - the twelve body pages
   Each part of you gets a page rather than a list: a graphic that draws today,
   what it actually does, what running short tends to look like, what to do
   about it, every nutrient it needs, and the foods that cover the most of it.
   SYS_PAGE holds only words. Every figure on the page comes from the same
   systemState() the grid uses, so the page and the grid can never disagree.
   ============================================================ */
const SYS_PAGE = {
 bones: {
  why:'Bone is living tissue, taken apart and rebuilt constantly — you replace roughly a tenth '+
      'of your skeleton every year. Calcium is the raw material. The rest of the list is what lets '+
      'your body lay it down and keep it there. Peak bone mass is set in your twenties, so what you '+
      'do now sets the ceiling you live off later.',
  signs:['Shin, hip or foot niggles that come back every time you add load',
         'Cramp late in sessions, or at night',
         'Teeth feeling more sensitive than they used to'],
  tips:['Spread calcium across the day rather than one big hit — you absorb roughly 500 mg at a time.',
        'Between October and March there is no useful UVB in Scotland, so vitamin D has to come from '+
        'food or a supplement, not sunlight.',
        'Load it. Squats, deadlifts, carries and jumps build bone; bone only responds to force.']},
 muscle: {
  why:'A contraction is an electrical event. Calcium fires it, magnesium and potassium let the muscle '+
      'relax and reset. Protein is the material it is rebuilt from, and leucine is the switch that '+
      'starts the rebuilding — which happens in the day or two after training, not during it.',
  signs:['Strength flat or sliding across sessions at the same bodyweight',
         'Soreness lasting longer than it used to',
         'Cramping in the back half of a session'],
  tips:['1.6 to 2.2 g of protein per kg of bodyweight a day covers everything the research supports. '+
        'More is not harmful, it is just not doing anything.',
        'Split it across three or four feeds of 30 to 40 g rather than one large one — each feed '+
        'needs enough leucine to trip the switch.',
        'On a sweaty session, salt and potassium matter more than most people think. Cramp is usually '+
        'one of those, not effort.']},
 blood: {
  why:'Red cells carry oxygen to everything else, and iron is the part that holds it. Copper moves '+
      'iron to where it is used, B12 and folate build the cell to put it in, and vitamin C decides how '+
      'much of the iron in plants you actually absorb.',
  signs:['Out of breath on a warm-up you used to walk through',
         'Tired in a way sleep is not fixing',
         'Cold hands and feet, pale inner eyelids'],
  tips:['Eat plant iron with something high in vitamin C — peppers, citrus, tomatoes. It can several '+
        'times the amount you absorb.',
        'Keep tea and coffee an hour clear of iron-heavy meals. The tannins block it.',
        'Red meat and shellfish carry haem iron, which your gut takes up far more readily than the '+
        'plant form.']},
 brain: {
  why:'Nerve signals need B vitamins to run and omega-3 to build the membranes they run through. '+
      'Choline becomes acetylcholine, which is the signal itself. Magnesium keeps the whole thing from '+
      'over-firing.',
  signs:['Concentration harder to hold than usual',
         'Sleep that does not leave you rested',
         'Shorter fuse than normal'],
  tips:['Oily fish twice a week, or an algae or fish oil if that is not happening. The long-chain '+
        'omega-3s are the ones that matter and plants do not carry them.',
        'Eggs are the cheapest choline there is, and most people get nowhere near enough.',
        'Caffeine after early afternoon costs sleep you pay for tomorrow — it has a half-life of '+
        'about five hours.']},
 immune: {
  why:'None of this stops you catching things. What it does is keep the machinery that fights them '+
      'working: zinc to build new immune cells, vitamin D to switch the response on, vitamin C and '+
      'selenium to keep it from damaging you in the process.',
  signs:['Colds that hang around longer than a week',
         'Cuts and grazes healing slowly',
         'Going down with something after a heavy training block'],
  tips:['Zinc every day beats a big dose the moment you feel something coming.',
        'Vitamin D through the winter is the one supplement with a clear case behind it in the UK.',
        'Sleep is the biggest lever on this whole list and no nutrient substitutes for it.']},
 heart: {
  why:'Potassium and sodium set your blood pressure between them, and almost everyone has the ratio '+
      'the wrong way round — too much salt, not enough potassium. Omega-3 brings triglycerides down, '+
      'and soluble fibre physically carries cholesterol out of you.',
  signs:['Resting heart rate drifting up week on week',
         'Rings or shoes tight in the evening',
         'Blood pressure creeping at check-ups'],
  tips:['Chase potassium rather than cutting salt alone — potatoes, beans, bananas, leafy greens.',
        'Six grams of salt a day is the UK ceiling. Most of it is already in bread, sauces and '+
        'processed meat before you pick up a shaker.',
        'Oily fish twice a week does more for this than any supplement aisle.']},
 gut: {
  why:'Fibre is not for you, it is for the bacteria living in you — they turn it into the short-chain '+
      'fatty acids your gut lining runs on. Two kinds do different jobs: soluble fibre slows things '+
      'down and feeds them, insoluble keeps things moving.',
  signs:['Bloating that follows the same meals',
         'Going less often, or less predictably, than normal',
         'Hungry again an hour after eating'],
  tips:['Thirty grams of fibre a day. Build up to it over a couple of weeks or you will regret the '+
        'first one.',
        'Thirty different plants a week beats thirty portions of the same three. Variety is what the '+
        'bacteria respond to.',
        'Fibre needs water to work. More fibre and the same water makes things worse, not better.']},
 energy: {
  why:'The B vitamins contain no energy at all — they release it. Each one runs a different step of '+
      'turning food into ATP, and iron and magnesium finish the job. Which is why being short shows up '+
      'as flatness rather than hunger.',
  signs:['Flat afternoons you are getting through on caffeine',
         'Warm-ups feeling heavy before anything is heavy',
         'Needing something sweet mid-afternoon most days'],
  tips:['Wholegrains carry the B vitamins the refined version had stripped out of it.',
        'Do not fix a dip with sugar. It books the next one.',
        'Alcohol burns through B1 faster than anything else you do.']},
 thyroid: {
  why:'Your thyroid sets the speed everything else runs at. It needs iodine to build the hormone and '+
      'selenium to activate it, and both are easy to miss entirely on a diet with no dairy and no '+
      'seafood. A long hard deficit slows this down on its own, which is felt as the diet stopping '+
      'working.',
  signs:['Cold when nobody else is',
         'Weight loss stalling further than the deficit explains',
         'Dry skin, hair thinning'],
  tips:['Iodine comes from dairy, white fish and iodised salt — and UK table salt usually is not '+
        'iodised, unlike most of Europe.',
        'Two brazil nuts covers a day of selenium. Three is not better; it has a low ceiling.',
        'Do not run a deep deficit indefinitely. Diet breaks exist for this.']},
 skin: {
  why:'Skin rebuilds itself about every four weeks and hair grows roughly a centimetre a month, out of '+
      'the same protein and mineral budget as everything else — and they are last in the queue. Which '+
      'makes them the first place a shortfall shows.',
  signs:['Nails splitting, peeling or ridged',
         'Shedding more hair than normal in the shower',
         'Cuts taking longer to close'],
  tips:['Protein first. Hair and nails are made of it and nothing else compensates.',
        'Zinc and vitamin A do the repairing. Liver, eggs, shellfish and orange vegetables.',
        'Biotin supplements only help someone who was short of biotin, which is rare. Save the money.']},
 cells: {
  why:'Training deliberately creates oxidative stress — that is part of how it works. Vitamins C and '+
      'E, selenium, zinc and manganese are the clean-up crew that stops the damage outlasting the '+
      'signal. A spread of colour does more than any single one of them.',
  signs:['Nothing you can feel day to day. This one is played long — it is about the next thirty '+
         'years, not tomorrow'],
  tips:['Eat colour rather than supplements. Berries, dark leaves, peppers, beetroot.',
        'High-dose antioxidant pills taken around training can blunt the adaptation you trained for. '+
        'Food does not do this.',
        'Not smoking is worth more than every antioxidant on the list combined.']},
 liver: {
  why:'Everything you eat and drink goes through it. It packages fat for storage or for burning, holds '+
      'years of B12, and clears alcohol at about a unit an hour whatever else is queued behind it. It '+
      'is also the quietest organ you have — it rarely complains until late.',
  signs:['Nothing obvious, usually, which is the problem — this one is watched with blood tests, not '+
         'symptoms'],
  tips:['Alcohol is the single biggest lever here, and it is not close.',
        'Choline, mostly from eggs, is what stops fat accumulating in it.',
        'Coffee, oddly, is protective — one of the few things the liver data is consistent about.']}
};

// The colour of a nutrient dot in the hero ring.
function dpDotCol(r){
  if(!r || r.missing) return 'var(--border)';
  const t = r.spec && r.spec.limit ? (r.pct > 100 ? 'short' : 'good') : sysTone(Math.min(100, r.pct));
  return SYS_COL[t] || 'var(--border)';
}

/* The graphic. An arc for how well fuelled this part of you is today, and a
   ring of dots around it - one per nutrient it needs, coloured by where that
   nutrient stands, grey when nothing you ate carried a figure for it. Tapping a
   dot jumps to that nutrient below. The arc animates from empty on open, and
   holds still for anyone who has asked their phone to stop moving things. */


function dpSigns(list, kind){
  const ico = kind === 'do' ? 'ti-check' : 'ti-alert-triangle';
  return '<div class="dp-list">'+list.map(x=>'<div class="dp-li'+(kind==='do'?' do':'')+'">'+
    '<i class="ti '+ico+'" aria-hidden="true"></i><div>'+x+'</div></div>').join('')+'</div>';
}

function renderBody(entries){
  const panel = document.getElementById('body-panel');
  if(!panel) return;
  entries = entries || [];

  if(!entries.length){
    panel.innerHTML = '<div style="background:var(--card); border:0.5px solid var(--border); '+
      'border-radius:14px; padding:14px 16px;"><div class="estate">'+
      '<i class="ti ti-leaf" aria-hidden="true"></i>'+
      '<div class="et">Nothing to measure yet</div>'+
      '<div class="es">Log a food and this shows how well today is fuelling each part of you. '+
      'A part goes grey when too little of it could be measured to say.</div>'+
      '<button data-estate="add">Log a food</button></div></div>';
    return;
  }

  const states = SYSTEMS.map(s=>systemState(s, entries));

  // A nutrient with no home would otherwise vanish from every view. Saying so
  // on screen is the only way that gets noticed.
  const orph = orphanNutrients(), unk = unknownInSystems();
  let html = (orph.length || unk.length)
    ? '<div class="sysorphan">Not shown by any part of the body: '+
      esc(orph.concat(unk).join(', '))+'. This is a fault in COACH, not in your food.</div>'
    : '';

  html += '<div class="sysgrid">' + states.map(st=>{
    const trust = systemTrusted(st);
    const tone = sysTone(st.pct);
    const w = trust ? (st.pct === null ? 0 : Math.min(100, st.pct)) : st.coverage * 100;
    const col = trust ? SYS_COL[tone] : 'var(--border)';
    return '<button class="sysc'+(trust ? '' : ' dim')+'" data-sys="'+esc(st.sys.k)+'">'+
      '<div class="si">'+st.sys.ico+'</div>'+
      '<div class="sn">'+esc(st.sys.n)+'</div>'+
      '<div class="ss">'+st.seen.length+' of '+st.total+' nutrients visible</div>'+
      '<div class="sbar"><i style="width:'+w.toFixed(0)+'%; background:'+col+'"></i></div>'+
      '<div class="sp" style="color:'+(trust ? SYS_COL[tone] : 'var(--text3)')+'">'+
      (st.pct === null ? '—' : trust ? st.pct+'%' : 'too little to say')+
      '</div></button>';
  }).join('') + '</div>';

  html += '<div class="syslegend">'+
    '<span><i style="background:var(--accent)"></i>well fuelled</span>'+
    '<span><i style="background:var(--caution)"></i>running low</span>'+
    '<span><i style="background:var(--danger)"></i>short</span>'+
    '<span><i style="background:var(--border)"></i>too little measured</span></div>';

  const grey = states.filter(st=>!systemTrusted(st)).length;
  html += '<p style="font-size:11px; color:var(--text3); line-height:1.5; margin-top:11px;">'+
    (grey
      ? esc(grey + ' of ' + states.length + ' are grey because too little of them could be ' +
        'measured today. Scanning packets and filling the food data from settings is what ' +
        'turns those on.')
      : 'Every part of you had enough measured today to put a number on it.')+'</p>';

  panel.innerHTML = html;
  panel.querySelectorAll('[data-sys]').forEach(b=>{
    b.onclick = ()=> openSystem(b.dataset.sys, entries);
  });
  // v141: the empty-state Add button is handled by the shared [data-estate] tap handler.
}

function openSystem(key, entries){
  const sys = SYSTEMS.filter(s=>s.k === key)[0];
  if(!sys) return;
  const st = systemState(sys, entries || loadEntries(currentDate));
  const trust = systemTrusted(st);
  const tone = sysTone(st.pct);

  document.getElementById('sysd-ico').textContent = sys.ico;
  document.getElementById('sysd-name').textContent = sys.n;
  const bt = document.getElementById('sysd-bartitle');
  if(bt) bt.textContent = sys.n;
  document.getElementById('sysd-stat').textContent =
    (st.pct === null ? 'Nothing measurable yet'
      : trust ? st.pct + '% fuelled today'
              : 'Not enough of this could be measured to put a number on it') +
    ' · ' + st.seen.length + ' of ' + st.total + ' nutrients visible';
  const ring = document.getElementById('sysd-ring');
  ring.style.width = (trust ? (st.pct === null ? 0 : Math.min(100, st.pct)) : st.coverage * 100) + '%';
  ring.style.background = trust ? SYS_COL[tone] : 'var(--border)';
  document.getElementById('sysd-blurb').textContent = sys.blurb;

  // ---- the graphic: the arc is today, the dots are its nutrients ----
  const byAll = systemSpecs(entries || []);
  const dotRows = st.seen.slice().concat(
    st.gap.map(k=>({k:k, spec: byAll[k], missing:true, pct:0})).filter(x=>x.spec));
  const heroCol = trust ? SYS_COL[tone] : 'var(--border)';
  const hero = document.getElementById('sysd-hero');
  if(hero){
    // v85: the part of the body itself, drawn, filling to how fuelled it is -
    // the same idea as the water bottle, one drawing per system. The nutrient
    // dots moved out of a ring around it into a row underneath, which reads
    // more clearly and gives each one a proper thumb-sized target.
    const artPct = trust ? (st.pct === null ? 0 : st.pct) : st.coverage * 100;
    hero.innerHTML =
      sysArt(key, artPct, heroCol) +
      '<div class="wp-big" style="color:'+(trust ? heroCol : 'var(--text2)')+'">'+
        (st.pct === null ? '—'
          : (trust ? st.pct + '%' : st.seen.length + ' of ' + st.total)) + '</div>'+
      '<div class="wp-of">'+
        (st.pct === null ? 'nothing measurable yet today'
                         : (trust ? 'fuelled today'
                                  : 'nutrients measured — too few to score it')) + '</div>'+
      '<div class="sysdots">'+ dotRows.map(r=>
        '<button data-dpdot="'+esc(r.k)+'" aria-label="'+esc(r.spec ? r.spec.n : r.k)+'">'+
        '<i style="background:'+dpDotCol(r)+'"></i></button>').join('') +'</div>';
    sysArtAnimate(hero);
    // A dot is the nutrient. Tapping it scrolls to that nutrient's row and
    // marks it, rather than opening a second page on top of this one.
    hero.querySelectorAll('[data-dpdot]').forEach(g=>{
      g.addEventListener('click', ()=>{
        const row = document.querySelector('#sysd-rows [data-sysrow="'+g.dataset.dpdot+'"]');
        if(!row) return;
        row.scrollIntoView({block:'center', behavior:'smooth'});
        row.classList.remove('dp-flash');
        void row.offsetWidth;
        row.classList.add('dp-flash');
      });
    });
  }

  // ---- the words ----
  const page = SYS_PAGE[key] || {};
  const whyEl = document.getElementById('sysd-why');
  if(whyEl) whyEl.textContent = page.why || '';
  // The one-line version is already the opening of the longer one, so it only
  // shows when there is no longer one to show.
  document.getElementById('sysd-blurb').style.display = page.why ? 'none' : '';
  const sg = document.getElementById('sysd-signs');
  if(sg) sg.innerHTML = page.signs ? dpSigns(page.signs) : '';
  const tp = document.getElementById('sysd-tips');
  if(tp) tp.innerHTML = page.tips ? dpSigns(page.tips, 'do') : '';

  const fmtv = v => v < 10 ? Math.round(v * 10) / 10 : fmt0(v);
  // Every nutrient the system needs, measured or not. Showing only the ones
  // with a figure made a short list look like a complete one.
  const by = systemSpecs(entries || []);
  const unseen = st.gap.map(k=>({k:k, spec: by[k], total:null, target:null, pct:0, missing:true}))
                      .filter(x=>x.spec);
  document.getElementById('sysd-rows').innerHTML =
    st.seen.sort((a,b)=>a.pct - b.pct).concat(unseen).map(r=>{
      if(r.missing){
        const spec = r.spec;
        const unit = spec.u === 'ug' ? '\u00b5g' : spec.u;
        const tgt = Number(spec.target != null ? spec.target : (spec.rda && spec.rda.m));
        return '<div class="sysd-r" data-sysrow="'+esc(r.k)+'"><div class="sysd-rt">'+
          '<span class="sysd-rn" style="color:var(--text3)">'+esc(spec.n)+'</span>'+
          '<span class="sysd-rv" style="color:var(--text3); font-weight:400;">not measured</span>'+
          '</div><div class="sysd-bar"></div>'+
          '<div class="sysd-d">'+esc(sys.does[r.k] || '')+
          (tgt > 0 ? ' <span style="color:var(--text3)">Target '+fmtv(tgt)+' '+esc(unit)+
                     ' a day.</span>' : '')+'</div></div>';
      }
      return sysdRow(r);
    }).join('');

  function sysdRow(r){
      const spec = r.spec;
      const t = spec.limit ? (r.pct > 100 ? 'short' : 'good') : sysTone(Math.min(100, r.pct));
      const unit = spec.u === 'ug' ? 'µg' : spec.u;
      return '<div class="sysd-r" data-sysnut="'+esc(r.k)+'" data-sysrow="'+esc(r.k)+
        '" style="cursor:pointer;"><div class="sysd-rt">'+
        '<span class="sysd-rn">'+esc(spec.n)+'<span class="nrev-chev">\u203a</span></span>'+
        '<span class="sysd-rv" style="color:'+(t === 'good' ? 'var(--text)' : SYS_COL[t])+'">'+
        (spec.estimated ? '<em style="font-style:normal; color:var(--text3); font-weight:400; '+
          'font-size:11px;">est </em>' : '')+
        fmtv(r.total)+'<s> / '+(spec.limit ? 'max ' : '')+fmtv(r.target)+' '+esc(unit)+'</s>'+
        '</span></div>'+
        '<div class="sysd-bar"><em style="width:'+Math.min(100, r.pct).toFixed(0)+
        '%; background:'+SYS_COL[t]+'"></em></div>'+
        '<div class="sysd-d">'+esc(sys.does[r.k] || '')+'</div></div>';
  }

  // Every row with a figure opens the list of foods that supplied it. This is
  // the Body view, so it is always today and the foods can be edited.
  document.querySelectorAll('#sysd-rows [data-sysnut]').forEach(row=>{
    row.onclick = ()=>{
      const spec = specForNutrient(row.dataset.sysnut, entries || []);
      if(spec) openBreakdown(spec, entries || [], {});
    };
  });

  document.getElementById('sysd-missing').innerHTML = st.gap.length
    ? '<div class="fd-none" style="margin-top:12px;">No food you logged today carried a figure '+
      'for '+esc(andList(st.gap.map(k=>(by[k] ? by[k].n : k))))+'. COACH tracks all of them — '+
      'the food data is what is missing, not the nutrient.</div>'
    : '<div class="fd-none" style="margin-top:12px;">Every nutrient this part of you needs was '+
      'measured today. This bar is the whole picture.</div>';
  document.getElementById('sysd-missing').innerHTML +=
    '<p class="nrev-note" style="margin-top:12px;">Tap a nutrient to see which foods it came from, '+
    'and the foods that would top it up.</p>';
  const sup = document.getElementById('sysd-super');
  if(sup){
    const paint = ()=>{
      sup.innerHTML = superFoodsHTML(key);
      const b = sup.querySelector('[data-shufsys]');
      if(b) b.onclick = ()=>{
        const id = 'sys:' + key;
        shuffleAt[id] = (shuffleAt[id] || 0) + 4;
        paint();
      };
    };
    paint();
  }

  // Always open at the top - the sheet is a page now and it is reused.
  const sh = document.querySelector('#sysdet-backdrop .sheet');
  if(sh) sh.scrollTop = 0;
  const sbar = document.querySelector('#sysdet-backdrop .pagebar');
  if(sbar) sbar.classList.remove('stuck');
  openSheet('sysdet-backdrop');
}

function setNutrientView(v){
  nutrientView = v;
  const tabs = document.getElementById('ntabs');
  if(tabs) tabs.querySelectorAll('[data-nv]').forEach(b=>
    b.classList.toggle('on', b.dataset.nv === v));
  const bp = document.getElementById('body-panel');
  const mp = document.getElementById('micro-panel');
  const cov = document.getElementById('micro-coverage');
  if(bp) bp.style.display = v === 'body' ? '' : 'none';
  if(mp) mp.style.display = v === 'list' ? '' : 'none';
  if(cov) cov.style.display = v === 'list' ? '' : 'none';
}

(function wireNutrientTabs(){
  const tabs = document.getElementById('ntabs');
  if(!tabs) return;
  tabs.querySelectorAll('[data-nv]').forEach(b=>{
    b.onclick = ()=>{ setNutrientView(b.dataset.nv); };
  });
  const c = document.getElementById('sysd-close');
  if(c) c.onclick = ()=> closeSheet('sysdet-backdrop');
  setNutrientView('body');
})();

/* Rescaling an entry lived inside the edit sheet's save button. The card now
   changes amounts too, and two copies of this would drift apart - the last time
   that happened, tripling a portion tripled the calories and left the sugar,
   saturated fat and micronutrients at the old figure. One function. */
function rescaleEntry(e, food, g, qty, unit){
  if(!e || !food || !(g > 0)) return false;
  const f = g/100;
  e.grams = Math.round(g);
  e.kcal = Math.round(food.kcal100*f);
  e.protein = Math.round((food.p100||0)*f);
  e.carbs = Math.round((food.c100||0)*f);
  e.fat = Math.round((food.f100||0)*f);
  e.sugar = food.sug100 == null ? null : Math.round(food.sug100*f*10)/10;
  e.sat   = food.sat100 == null ? null : Math.round(food.sat100*f*10)/10;
  e.micros = (function(){
    const src = food.micros100 || {}, out = {};
    Object.keys(src).forEach(k=>{ if(src[k] != null && isFinite(src[k])) out[k] = src[k]*f; });
    return out;
  })();
  e.basis = food.basis === 'ml' ? 'ml' : 'g';
  if(qty != null && unit){ e.qty = qty; e.unit = unit; }
  else { e.qty = null; e.unit = null; }
  return true;
}

/* Something you have eaten before, opened as a food rather than logged on the
   spot. The amount you had last time is already in the box, so it is still one
   tap to repeat - but it is a tap on Add, with the card in front of you, and
   not a silent write you only notice afterwards in the log. */
function openFromHistory(r, meal){
  if(!r || !r.last) return;
  let f = null;
  try{ f = per100From(r.last); }catch(e){ f = null; }
  if(!f){ addFromHistory(r, meal); return; }   // no weight to scale: nothing to choose
  const g = Number(r.last.grams) || 0;
  const food = Object.assign({}, f);
  if(g > 0) food.startAmount = g;
  // The meal you usually have it at, unless you are already adding to one.
  if(meal) selectMeal(meal);
  else if(r.usualMeal) selectMeal(r.usualMeal);
  openPortion(food);
}

/* The amount at the top of the card. What you logged is already in the box, so
   changing it is one tap of + or a typed number - no second sheet to open. */
let fdAmtFood = null, fdAmtBase = 0, fdAmtUnits = false;

function fdAmtGrams(){
  const el = document.getElementById('fd-amt-val');
  const v = Math.max(0, Number(el && el.value) || 0);
  return fdAmtUnits && fdAmtFood && fdAmtFood.unitGrams ? v * fdAmtFood.unitGrams : v;
}

function fdAmtRender(){
  if(!fdAmtFood) return;
  const g = fdAmtGrams();
  const u = fdAmtFood.basis === 'ml' ? ' ml' : ' g';
  const kc = document.getElementById('fd-amt-kcal');
  const q = Number(document.getElementById('fd-amt-val').value) || 0;
  if(fdAmtUnits){
    document.getElementById('fd-amt-unit').textContent = pluralUnit(fdAmtFood.unitName, q);
    kc.textContent = fmt0(fdAmtFood.kcal100 * g/100) + ' kcal \u00b7 ' + fmt0(g) + u;
  } else {
    kc.textContent = fmt0(fdAmtFood.kcal100 * g/100) + ' kcal';
  }
  const changed = Math.round(g) !== Math.round(fdAmtBase) && g > 0;
  document.getElementById('fd-amt-save').style.display = changed ? 'block' : 'none';
}

function fdAmtStep(dir){
  const el = document.getElementById('fd-amt-val');
  let v = Number(el.value) || 0;
  // Half a unit at a time while there is only one of something, then whole
  // ones. Grams move in tens, because nobody nudges a portion by one gram.
  const step = fdAmtUnits ? (v < 2 ? 0.5 : 1) : (v <= 20 ? 5 : 10);
  v = Math.max(0, v + dir*step);
  el.value = fdAmtUnits ? Math.round(v*2)/2 : Math.round(v);
  fdAmtRender();
}

function fdAmtSetup(e){
  const box = document.getElementById('fd-amt');
  fdAmtFood = null;
  // Typed in with no weight: there is nothing to scale, so the row stays away.
  let f = null;
  try{ f = per100From(e, true); }catch(err){ f = null; }
  if(!f || !(Number(e.grams) > 0)){ box.style.display = 'none'; return; }
  fdAmtFood = f;
  fdAmtBase = Number(e.grams) || 0;
  // Logged as units, shown as units. Logged by weight, shown by weight.
  fdAmtUnits = !!(e.qty && e.unit && f.unitGrams);
  const el = document.getElementById('fd-amt-val');
  el.value = fdAmtUnits ? round2(e.qty) : Math.round(fdAmtBase);
  document.getElementById('fd-amt-unit').textContent =
    fdAmtUnits ? pluralUnit(f.unitName, e.qty) : (f.basis === 'ml' ? 'ml' : 'g');
  box.style.display = 'block';
  fdAmtRender();
}

/* The one line you want when you scan something: what is this for?
   Worked out from the food's own figures against your own targets - see
   systemStrength - and it links straight through to that system, because the
   next question is always "and what else is". */
function renderFoodSystems(food, boxId){
  const box = document.getElementById(boxId || 'fd-sys');
  if(!box) return;
  const list = (typeof systemStrength === 'function') ? systemStrength(food, 3) : [];
  if(!list.length){ box.innerHTML = ''; box.style.display = 'none'; return; }
  box.style.display = 'flex';
  const cls = {Exceptional: 'b3', Great: 'b2', Good: 'b1'};
  box.innerHTML = list.map(x=>
    '<button data-fdsys="' + esc(x.k) + '"><span class="si">' + x.ico + '</span>'+
    '<span><b class="' + cls[x.band] + '">' + x.band + '</b> for ' + esc(x.n.toLowerCase()) + '</span></button>'
  ).join('');
  box.querySelectorAll('[data-fdsys]').forEach(b=>{
    b.onclick = ()=> openSystem(b.dataset.fdsys, loadEntries(currentDate));
  });
}

function openFoodDetail(idx){
  const es = loadEntries(currentDate);
  const e = es[idx];
  if(!e) return;
  detailIdx = idx;

  const grams = Number(e.grams) || 0;
  // The food as it was logged, at 100-unit basis, so the same scorer can run on
  // it. per100From also carries the sugar, saturated fat and micros the score
  // needs - and the name, which is what the packet sheet keys on.
  const food = per100From(e);

  document.getElementById('fd-name').textContent = e.name ? shownName(e.name, e) : 'Food';
  fdAmtSetup(e);
  const fdBrand = e.name ? splitName(e.name, e).brand : '';
  const unitPart = (fdBrand ? fdBrand + ' \u00b7 ' : '') +
    ((e.qty && e.unit) ? round2(e.qty) + ' ' + pluralUnit(e.unit, e.qty) + ' \u00b7 ' : '');
  document.getElementById('fd-sub').textContent =
    unitPart + (grams > 0 && !e.perItem ? round2(grams) + (entryBasis(e) === 'ml' ? ' ml' : ' g') + ' \u00b7 ' : '') +
    fmt0(e.kcal || 0) + ' kcal \u00b7 ' + (e.meal || 'Snack');
  // v147: the Day rows no longer show protein, carbs and fat, so the food's page does.
  const fdMac = document.getElementById('fd-macros');
  if(fdMac) fdMac.textContent = 'Protein ' + fmt0(e.protein || 0) + 'g \u00b7 Carbs ' + fmt0(e.carbs || 0) + 'g \u00b7 Fat ' + fmt0(e.fat || 0) + 'g';

  renderFoodSystems(food, 'fd-sys');
  try{ renderHydDetail(e); }catch(err){}

  const scoreBox = document.getElementById('fd-score');
  if(!food){
    // Hand-typed with no weight: nothing to scale, so nothing to score.
    scoreBox.innerHTML = '<div class="section-title">Score</div>'+
      '<div class="fd-nut"><div class="fd-none">This was entered without a weight, so there is nothing '+
      'to score it against. Delete it and add it again with an amount if you want it scored.</div></div>';
  } else {
    scoreTab = 'overall';
    renderScorePanel(food, {box:'fd-score', grams: grams});
  }

  // Everything measured, in the amount you actually had.
  const nb = document.getElementById('fd-nutrients');
  const rows = [];
  const fromUSDA = filledKeysFor(e.name);
  if(e._fill) Object.keys(e._fill).forEach(k=>{ if(e._fill[k].t) fromUSDA[k] = e._fill[k].t; });
  const add = (k, v, u, sub, key)=>{ if(v === null || v === undefined) return;
    // A figure that came from a reference database is marked as one. It is not
    // wrong, it is just a weaker claim than a label, and you should be able to
    // see which rows are which at a glance.
    const from = key ? fromUSDA[key] : null;
    const mark = from
      ? '<span style="font-size:9.5px; color:var(--text3); border:0.5px solid var(--border);'+
        ' border-radius:4px; padding:1px 4px; margin-left:6px; vertical-align:middle;">'+
        esc(from)+'</span>'
      : '';
    rows.push('<div class="fd-nr"><span class="k">'+esc(k)+mark+'</span>'+
      '<span class="v">'+v+(u||'')+(sub?'<s>'+esc(sub)+'</s>':'')+'</span></div>'); };
  add('Calories', fmt0(e.kcal||0), ' kcal');
  add('Protein', fmt0(e.protein||0), ' g');
  add('Carbs', fmt0(e.carbs||0), ' g');
  if(e.sugar != null) add('\u2014 of which sugars', round2(e.sugar), ' g');
  add('Fat', fmt0(e.fat||0), ' g');
  if(e.sat != null) add('\u2014 of which saturates', round2(e.sat), ' g');
  const m = e.micros || {};
  MICROS.forEach(spec=>{
    const v = m[spec.k];
    if(v === null || v === undefined) return;
    if(spec.k === 'sodium'){
      add('Salt', round2(v * 2.5 / 1000), ' g', fmt0(v)+' mg sodium', 'sodium');
      return;
    }
    add(spec.n, (v < 10 ? Math.round(v*10)/10 : fmt0(v)),
        ' ' + (spec.u === 'ug' ? '\u00b5g' : spec.u), null, spec.k);
  });
  // Anything else the entry carries that MICROS does not list - the extras a
  // scanned product publishes, like iodine, omega-6 or caffeine. "In this
  // portion" has to mean everything in this portion, not everything the panel
  // happens to know about.
  const known = {};
  MICROS.forEach(s=>{ known[s.k] = true; });
  Object.keys(m).forEach(k=>{
    if(known[k] || m[k] === null || m[k] === undefined) return;
    const def = (typeof offMicroDef === 'function') ? offMicroDef(k) : null;
    const v = m[k];
    add(def ? def.n : k, (v < 10 ? Math.round(v*10)/10 : fmt0(v)),
        ' ' + (def ? (def.u === 'ug' ? '\u00b5g' : def.u) : ''));
  });

  const missing = [];
  if(e.sugar == null) missing.push('sugars');
  if(e.sat == null) missing.push('saturates');
  if(m.fiber == null) missing.push('fibre');
  if(m.sodium == null) missing.push('salt');
  const srcInfo = entrySource(e);
  const srcLine = srcInfo
    ? '<div class="fd-none" style="margin:0 0 9px; padding-bottom:8px; '+
      'border-bottom:0.5px solid var(--border);">'+esc(srcInfo.text)+'</div>'
    : '';
  nb.innerHTML = '<div class="section-title">In this portion</div><div class="fd-nut">'+
    srcLine + rows.join('') +
    (missing.length
      ? '<div class="fd-none" style="margin-top:9px;">Not recorded: '+esc(andList(missing))+
        '. Tap <b>Nutrients</b> to add them off the packet.</div>'
      : '') +
    '</div>';
  // v110: the full list lives on the Nutrients sheet now, in one order. What
  // stays here is where the figures came from and what is still missing.
  nb.innerHTML = (srcLine || missing.length)
    ? '<div class="fd-nut">' + srcLine.replace('margin:0 0 9px; padding-bottom:8px; border-bottom:0.5px solid var(--border);', 'margin:0;') +
      (missing.length ? '<div class="fd-none" style="margin-top:'+(srcLine?'8':'0')+'px;">Not recorded: '+esc(andList(missing))+
        '. Tap <b>Nutrients</b> to add them off the packet.</div>' : '') + '</div>'
    : '';

  openSheet('fooddet-backdrop');
}

document.getElementById('fd-close').onclick = ()=> closeSheet('fooddet-backdrop');
document.getElementById('fd-amt-minus').onclick = ()=> fdAmtStep(-1);
document.getElementById('fd-amt-plus').onclick = ()=> fdAmtStep(1);
document.getElementById('fd-amt-val').addEventListener('input', fdAmtRender);
document.getElementById('fd-amt-save').onclick = ()=>{
  const g = fdAmtGrams();
  if(!fdAmtFood || !(g > 0)) return;
  const es = loadEntries(currentDate);
  const e = es[detailIdx];
  if(!e) return;
  const useUnits = fdAmtUnits && fdAmtFood.unitGrams;
  rescaleEntry(e, fdAmtFood, g,
    useUnits ? (Number(document.getElementById('fd-amt-val').value) || 0) : null,
    useUnits ? fdAmtFood.unitName : null);
  saveEntries(currentDate, es);
  renderDay(); renderStreak();
  // The card stays open and catches up: new calories, new score, new nutrients.
  openFoodDetail(detailIdx);
};

document.getElementById('fd-amount').onclick = ()=>{
  const i = detailIdx;
  closeSheet('fooddet-backdrop');
  setTimeout(()=>openEntryEdit(i), HANDOFF);
};
document.getElementById('fd-numbers').onclick = ()=>{
  // v110: one sheet for every figure, opened over this card and showing the
  // portion you had.
  openNutFor(null);
};

function openEntryEdit(idx){
  const es = loadEntries(currentDate);
  const e = es[idx];
  if(!e) return;
  editingIdx = idx;
  eeFood = per100From(e, true);

  document.getElementById('ee-name').textContent = e.name;

  // meal picker — the same builder the portion sheet uses. The figures are
  // live totals including this item where it currently sits, which is what is
  // on screen behind the sheet; a second, adjusted set would just disagree.
  eeMealFrom = e.meal || 'Snack';
  document.getElementById('ee-meals').innerHTML =
    mealPickerHTML(eeMealFrom, 'data-eemeal', mealTotalsToday(es));
  document.querySelectorAll('[data-eemeal]').forEach(b=>{
    b.onclick = ()=>{
      document.querySelectorAll('[data-eemeal]').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      renderEeSaveLabel();
    };
  });
  renderEeSaveLabel();

  const canScale = !!eeFood;
  document.getElementById('ee-amount-wrap').style.display = canScale ? 'block' : 'none';
  document.getElementById('ee-fixed').style.display = canScale ? 'none' : 'block';
  if(!canScale){
    // Clear the panels so a previous item's numbers cannot linger behind them.
    document.getElementById('ee-grams').value = '';
    document.getElementById('ee-qty').value = '';
    document.getElementById('ee-equiv').textContent = '';
  }

  if(canScale){
    const countable = isCountable(eeFood);
    document.getElementById('ee-modes').style.display = countable ? 'flex' : 'none';
    const eu = eeFood.basis === 'ml' ? 'ml' : 'Grams';
    document.getElementById('ee-amount-title').textContent = eu;
    document.getElementById('ee-amount-tab').textContent = eu;
    document.getElementById('ee-grams').value = Math.round(e.grams);
    if(countable){
      document.getElementById('ee-qty').value = e.qty;
      setEeMode('unit');
    } else {
      setEeMode('gram');
    }
  }
  updateEePreview();
  openSheet('edit-backdrop');
}

// The meal the entry was in when the sheet opened, so the button can tell a
// move apart from an amount edit.
let eeMealFrom = null;

// "Save changes" does not say whether tapping Lunch already did anything. This
// does: the button becomes the move.
function renderEeSaveLabel(){
  const btn = document.getElementById('ee-save');
  if(!btn) return;
  const on = document.querySelector('[data-eemeal].active');
  const to = on ? on.dataset.eemeal : null;
  btn.textContent = (to && eeMealFrom && to !== eeMealFrom) ? ('Move to ' + to) : 'Save changes';
}

function setEeMode(m){
  eeMode = m;
  document.getElementById('ee-unit-panel').style.display = m==='unit' ? 'block' : 'none';
  document.getElementById('ee-gram-panel').style.display = m==='unit' ? 'none' : 'block';
  document.querySelectorAll('#ee-modes .tab').forEach(t=>t.classList.toggle('active', t.dataset.emode===m));
  updateEePreview();
}

function eeGrams(){
  if(!eeFood) return 0;
  if(eeMode==='unit' && eeFood.unitGrams){
    const q = Number(document.getElementById('ee-qty').value);
    return Math.max(0, (isFinite(q)?q:0) * eeFood.unitGrams);
  }
  return Math.max(0, Number(document.getElementById('ee-grams').value) || 0);
}

function updateEePreview(){
  const es = loadEntries(currentDate);
  const e = es[editingIdx];
  if(!e) return;
  if(!eeFood){
    document.getElementById('ee-kcal').textContent = fmt0(e.kcal)+' kcal';
    document.getElementById('ee-macros').textContent =
      'P '+fmt0(e.protein||0)+'g · C '+fmt0(e.carbs||0)+'g · F '+fmt0(e.fat||0)+'g';
    return;
  }
  const g = eeGrams(), f = g/100;
  document.getElementById('ee-kcal').textContent = fmt0(eeFood.kcal100*f)+' kcal';
  document.getElementById('ee-macros').textContent =
    'P '+fmt0(eeFood.p100*f)+'g · C '+fmt0(eeFood.c100*f)+'g · F '+fmt0(eeFood.f100*f)+'g';
  const u = eeFood.basis === 'ml' ? ' ml' : ' g';
  if(eeMode==='unit' && eeFood.unitGrams){
    const q = Number(document.getElementById('ee-qty').value)||0;
    document.getElementById('ee-unit-label').textContent = pluralUnit(eeFood.unitName, q);
    document.getElementById('ee-equiv').textContent = g > 0 ? '= '+fmt0(g)+u : '';
  }
  const ge = document.getElementById('ee-gram-equiv');
  if(ge){
    const n = (eeFood.unitGrams && eeFood.unitName && g > 0) ? round2(g/eeFood.unitGrams) : null;
    ge.textContent = n ? '= '+n+' '+pluralUnit(eeFood.unitName, n) : '';
  }
}

document.getElementById('ee-minus').onclick = ()=>{
  const i = document.getElementById('ee-qty');
  let q = Number(i.value)||0;
  const step = q < 2 ? 0.5 : 1;
  i.value = Math.max(0, Math.round((q-step)*2)/2);
  updateEePreview();
};
document.getElementById('ee-plus').onclick = ()=>{
  const i = document.getElementById('ee-qty');
  let q = Number(i.value)||0;
  const step = q < 2 ? 0.5 : 1;
  i.value = Math.round((q+step)*2)/2;
  updateEePreview();
};
document.getElementById('ee-qty').addEventListener('input', updateEePreview);
document.getElementById('ee-grams').addEventListener('input', updateEePreview);
document.querySelectorAll('#ee-modes .tab').forEach(t=>{
  t.onclick = ()=>{
    // The same exact conversion as the add sheet. This carried its own copy of
    // the half-unit snap, so editing an entry could quietly change its size.
    if(t.dataset.emode === 'gram') document.getElementById('ee-grams').value = round2(eeGrams());
    else if(eeFood && eeFood.unitGrams) document.getElementById('ee-qty').value = round2(eeGrams()/eeFood.unitGrams);
    setEeMode(t.dataset.emode);
  };
});

document.getElementById('ee-save').onclick = ()=>{
  const es = loadEntries(currentDate);
  const e = es[editingIdx];
  if(!e) return;
  const meal = (document.querySelector('[data-eemeal].active')||{dataset:{eemeal:e.meal}}).dataset.eemeal;
  e.meal = meal;
  const sameAmount = eeFood && Math.round(eeGrams()) === Math.round(Number(e.grams) || 0);
  // Moving an item to another meal is not a change to what you ate. Rebuilding
  // the figures anyway re-rounded them every time - grams, sugar and saturated
  // fat drifted a little on each move.
  if(eeFood && !sameAmount){
    const g = eeGrams();
    if(!g || g <= 0){ alert('Enter an amount above zero, or delete the item.'); return; }
    // Everything the entry carries moves with the amount - see rescaleEntry.
    const useUnits = eeMode === 'unit' && eeFood.unitGrams;
    rescaleEntry(e, eeFood, g,
      useUnits ? (Number(document.getElementById('ee-qty').value) || 0) : null,
      useUnits ? eeFood.unitName : null);
  }
  saveEntries(currentDate, es);
  closeSheet('edit-backdrop');
  renderDay(); renderStreak();
};

document.getElementById('ee-delete').onclick = ()=>{
  // Straight through deleteEntryAt, which is what the swipe and the trash icon
  // use. This used to splice the array by hand, so the same food deleted from
  // in here was gone for good while the same food deleted by swiping sat in
  // Recently deleted waiting to be undone.
  const idx = editingIdx;
  closeSheet('edit-backdrop');
  editingIdx = null;
  deleteEntryAt(idx);
};

