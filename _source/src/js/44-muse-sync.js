/* =====================================================================
   Sync with Muse — v144. Opt-in, off by default.
   ---------------------------------------------------------------------
   How it works: your food, water, weight and training days are copied to
   ONE file, coach-sync.json, in a PRIVATE repo
   (baileywalsh-maker/coach-sync) that only you can see. Muse reads and
   writes that same file. Your phone and Muse never talk to each other
   directly — the private repo is the meeting point.

   This mirrors Jot's sync (jot/_source/SYNC.md) exactly: same token
   rules, same three-way merge, same quiet failures. The difference is
   the shape of the data. Jot syncs one flat list of notes; COACH syncs
   one record PER DAY, keyed by date, plus the weight log:

     days:   { "2026-11-19": { entries: [...], waterMl: 1500,
                               complete: true, training: true } }
     weight: [ { date: "2026-11-19", kg: 82.4 } ]
     workouts: {}   // reserved — no workout logging exists yet

   - What syncs: food entries (one day's log, `calorielog:`), plain
     water in ml (`caloriewater:`), the ticked-complete flag
     (`caloriecomplete:`), the training-day tick (`calorietrain:`), and
     the weight log (`calorieweightlog`).
   - v145: everything else COACH saves now syncs too (workouts, profile,
     targets, your foods, reviews, routines, settings...). Only secrets
     and throwaway caches stay out. See "v145: EVERYTHING" further down.
   - Food entries have no id of their own, so sync gives each one a
     stable id the first time it is saved (`museSyncStampDay`, in
     saveEntries) and stamps `upd` — when it last changed — the same
     way Jot does. An id is just a label; it changes nothing the app
     shows. Entries restored from a backup, which never had ids, get
     theirs on the next sync (`museSyncEnsureIds`).
   - The token that lets this phone write to the private repo is typed
     in by you in Settings. It lives ONLY in this phone's store
     ('coachmusesync-token'), is never written into a backup
     (backupPayload and exportJSON both skip every 'coachmusesync*'
     key), never put in the app's code, and is only ever sent to
     api.github.com. Make it a fine-grained token that can only
     read/write the coach-sync repo, and revoke it in GitHub any time
     to stop syncing.
   - Merge: each side remembers what the days looked like at the last
     successful sync (a snapshot). A day changed on one side only is
     taken from that side; a day added on either side is kept; a day
     deleted on one side and unchanged on the other is deleted. A day
     changed on BOTH sides is merged entry by entry, with Jot's rules:
     an entry changed on one side only is taken from that side, an
     entry added on either side is kept, and an entry changed on both
     sides keeps the newer copy (`upd`, then `at`) and Settings says
     so. Water changed on both sides keeps the larger amount (water
     only ever goes up during a day). Training and complete ticks
     changed on both sides are kept if either side ticked them.
     Nothing is ever deleted silently outside that rule.
   - The weight log merges by date. A weigh-in added on either side is
     kept; a date weighed on both sides keeps the phone's reading and
     Settings says so (the phone is where you step on the scales).
   ===================================================================== */
var MUSE_SYNC_OWNER = 'baileywalsh-maker';
var MUSE_SYNC_REPO = 'coach-sync';
var MUSE_SYNC_PATH = 'coach-sync.json';
var MUSE_SYNC_API = 'https://api.github.com/repos/' + MUSE_SYNC_OWNER + '/' + MUSE_SYNC_REPO + '/contents/' + MUSE_SYNC_PATH;
var MUSE_SYNC_STATE_KEY = 'coachmusesync';        // sync state (snapshot, version) — not a backup
var MUSE_SYNC_TOKEN_KEY = 'coachmusesync-token';  // the token — never in a backup, never in code
var museSyncBusy = false, museSyncSoonTimer = null, museSyncApplying = false;

function museSyncUid(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function museSyncHash(s){
  var h = 5381;
  s = String(s);
  for(var i = 0; i < s.length; i++){ h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; }
  return h.toString(36);
}
// The entry as sync sees it: everything that is the food, without the
// bookkeeping (id, upd) and without the transient fill notes hydration
// leaves on it (_fill and friends), which are re-worked out on every
// read and must never count as a change.
function museSyncEntryCore(e){
  if(!e || typeof e !== 'object') return e;
  var c = Object.assign({}, e);
  delete c.id; delete c.upd; delete c._fill; delete c._fillFrom; delete c._hadMicros;
  if(e.micros && typeof e.micros === 'object') c.micros = Object.assign({}, e.micros);
  return c;
}
function museSyncEntryHash(e){ return museSyncHash(JSON.stringify(museSyncEntryCore(e))); }
function museSyncState(){
  var s = null;
  try{ s = JSON.parse(CS.getItem(MUSE_SYNC_STATE_KEY)); }catch(e){}
  return s && typeof s === 'object'
    ? s
    : {enabled:false, version:0, sha:null, snapshot:null, lastSync:null, lastError:null, conflicts:[]};
}
function museSyncSaveState(s){ try{ lsSet(MUSE_SYNC_STATE_KEY, JSON.stringify(s)); }catch(e){} }
function museSyncToken(){
  try{ return CS.getItem(MUSE_SYNC_TOKEN_KEY) || null; }catch(e){ return null; }
}
function museSyncSetToken(t){
  try{
    if(t) lsSet(MUSE_SYNC_TOKEN_KEY, String(t));
    else CS.removeItem(MUSE_SYNC_TOKEN_KEY);
    return true;
  }catch(e){ return false; }
}
function museSyncEnabled(){ return !!museSyncState().enabled; }
function museSyncSetEnabled(on){
  var st = museSyncState();
  st.enabled = !!on;
  museSyncSaveState(st);
}

// Every entry saved gets a stable id if it has none, and `upd` stamped
// when its food actually changed — the same job Jot's syncStampUpd does
// in lsSet. Called from saveEntries, the one place every day write
// passes through. Skipped while a sync is being applied, so a merged
// day keeps the `upd` values the merge decided on.
function museSyncStampDay(d, entries){
  if(museSyncApplying || !Array.isArray(entries)) return entries;
  var old = [];
  try{ old = JSON.parse(CS.getItem(dkey(d))) || []; }catch(e){ old = []; }
  if(!Array.isArray(old)) old = [];
  var oldById = {};
  old.forEach(function(e){ if(e && e.id) oldById[e.id] = e; });
  var now = Date.now();
  entries.forEach(function(e){
    if(!e || typeof e !== 'object') return;
    if(!e.id){ e.id = museSyncUid(); e.upd = now; return; }
    var o = oldById[e.id];
    if(!o){ e.upd = now; return; }
    if(museSyncEntryHash(e) !== museSyncEntryHash(o)) e.upd = now;
  });
  return entries;
}
// Entries that arrived without ids (a restore from a backup, which never
// carried them) get ids now, before a sync reads them — an id made up
// fresh on every sync would look like a new entry each time. Runs once
// at the start of a sync; a day whose entries already have ids is left
// exactly as it is.
function museSyncEnsureIds(){
  if(museSyncApplying) return;
  var dates = museSyncDayDates();
  dates.forEach(function(ds){
    var raw = null;
    try{ raw = CS.getItem(dkey(parseYMD(ds))); }catch(e){ return; }
    if(raw == null) return;
    var es = null;
    try{ es = JSON.parse(raw); }catch(e){ return; }
    if(!Array.isArray(es) || !es.some(function(e){ return e && typeof e === 'object' && !e.id; })) return;
    var stamped = es.map(function(e){
      if(!e || typeof e !== 'object' || e.id) return e;
      var c = Object.assign({}, e);
      c.id = museSyncUid(); c.upd = Date.now();
      return c;
    });
    try{ saveEntries(parseYMD(ds), stamped); }catch(e){}
  });
}
// Every date with anything sync owns on it.
function museSyncDayDates(){
  var out = {}, i, k;
  try{
    for(i = 0; i < CS.length; i++){
      k = CS.key(i);
      if(!k) continue;
      if(k.indexOf('calorielog:') === 0 || k.indexOf('caloriewater:') === 0 ||
         k.indexOf('caloriecomplete:') === 0 || k.indexOf('calorietrain:') === 0)
        out[k.slice(k.indexOf(':') + 1)] = 1;
    }
  }catch(e){}
  return Object.keys(out).sort();
}
function museSyncDayLocal(ds){
  var d = parseYMD(ds), day = {};
  var es = [];
  try{ es = loadEntries(d); }catch(e){ es = []; }
  if(typeof dehydrateEntry === 'function') es = (es || []).map(dehydrateEntry);
  if(Array.isArray(es) && es.length) day.entries = es;
  var ml = 0;
  try{ ml = waterMl(d); }catch(e){ ml = 0; }
  if(ml > 0) day.waterMl = ml;
  try{ if(isDayComplete(ds)) day.complete = true; }catch(e){}
  try{ if(isTrainingDay(d)) day.training = true; }catch(e){}
  return day;
}
function museSyncPackLocal(){
  var st = museSyncState();
  var days = {};
  museSyncDayDates().forEach(function(ds){
    var day = museSyncDayLocal(ds);
    if(day.entries || day.waterMl || day.complete || day.training) days[ds] = day;
  });
  var weight = [];
  try{ weight = loadWeightLog() || []; }catch(e){ weight = []; }
  return {
    __coachSync: 1, version: (st.version || 0) + 1,
    updatedAt: new Date().toISOString(), updatedBy: 'phone',
    days: days,
    weight: weight.map(function(w){ return {date: w.date, kg: w.kg}; }),
    workouts: museSyncWorkoutsLocal(),
    store: museSyncStoreLocal(),
    insights: museSyncInsights()
  };
}

/* ---------------------------------------------------------------------
   v145: EVERYTHING. Muse sees and can change all of COACH, not just the
   food days. Three more parts of the file:

     workouts: { "<id>": a finished workout - name, date, start/end,
                 every exercise and every set }        (coachtrain:w:<id>)
     store:    { "<key>": value } - every other thing COACH saves, under
                its own name: profile, targets, your foods, label fixes,
                supplements, reviews, the adjust log, routines, your own
                exercises, settings, per-day target snapshots... A value
                that is JSON is shown as JSON; anything else is
                {"__raw": "text"}.
     insights: read-only, worked out fresh on every sync for Muse to read:
                ranks, muscle map, bests, today's targets. Muse writing
                here changes nothing.

   Left out on purpose, and only these:
     - secrets: the sync token and state (coachmusesync*), the backup
       token (coachcloudtoken) and the USDA key (coachfdckey);
     - throwaway copies: the Open Food Facts cache, photo thumbnails,
       scan diagnostics, local backups, corrupt-day copies, the rest
       timer and the workout list (rebuilt from the workouts).
   Merging works like the days: each workout and each store item is
   compared with the last good sync. Changed on one side only: that side
   wins. Added on either side: kept. Deleted on one side and untouched on
   the other: deleted. Changed on both: a workout keeps the newer copy, a
   store item keeps this phone's (Settings lists it).
   --------------------------------------------------------------------- */
var MUSE_SYNC_SKIP = /^(coachmusesync|coachcloudtoken$|coachfdckey$|coachoffcache|coachthumbs|coachscandiag|coachbackup|coachautobackup|caloriecorrupt:|coachtrain:rest$|coachtrain:idx$|coachtrain:w:|coach:|calorielog:|caloriewater:|caloriecomplete:|calorietrain:|calorieweightlog$)/;
function museSyncStoreKey(k){ return /^(coach|calorie)/.test(k) && !MUSE_SYNC_SKIP.test(k); }
function museSyncStoreLocal(){
  var out = {}, i, k, raw;
  try{
    for(i = 0; i < CS.length; i++){
      k = CS.key(i);
      if(!k || !museSyncStoreKey(k)) continue;
      raw = CS.getItem(k);
      if(raw == null) continue;
      try{ out[k] = JSON.parse(raw); }catch(e){ out[k] = {__raw: String(raw)}; }
    }
  }catch(e){}
  return out;
}
function museSyncStoreRaw(v){
  if(v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && typeof v.__raw === 'string') return v.__raw;
  return JSON.stringify(v);
}
function museSyncWorkoutsLocal(){
  var out = {};
  try{
    var idx = JSON.parse(CS.getItem('coachtrain:idx') || '[]') || [];
    idx.forEach(function(w){ try{ var x = JSON.parse(CS.getItem('coachtrain:w:' + w.id)); if(x && x.id) out[x.id] = x; }catch(e){} });
  }catch(e){}
  return out;
}
// Read-only summary for Muse. Never merged back.
function museSyncInsights(){
  var o = {note: 'Read-only. Worked out by COACH on each sync; edits here are ignored.', at: new Date().toISOString()};
  try{
    var t = targetsFor(new Date());
    o.todayTargets = {kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat};
  }catch(e){}
  try{ o.hydrationTargetMl = hydTarget(new Date()); }catch(e){}
  try{
    if(typeof trUsage === 'function'){
      var ranks = [], bests = {};
      trUsage().forEach(function(_, name){
        var b = trBests(name); bests[name] = b;
        var r = trRankOf(name);
        if(r && r.tier >= 0) ranks.push({exercise: name, rank: TR_RANKS[r.tier].n, meaning: TR_RANKS[r.tier].plain,
          strongerThanPct: r.pct, score: Math.round(r.score * 10) / 10, unit: r.L.u === 'reps' ? 'reps' : 'kg est. max',
          nextRankAt: r.next ? Math.round(r.next * 10) / 10 : null, roughBecauseMachine: !!r.machine});
      });
      o.ranks = ranks.sort(function(a, b){ return b.strongerThanPct - a.strongerThanPct; });
      o.bests = bests;
      var S = trMuscleScores(), mm = {};
      Object.keys(S).forEach(function(k){ mm[k] = {status: TR_MU_LOOK[S[k].k].n, strongerThanPct: S[k].pct, lifts: S[k].lifts.map(function(l){ return l.n; })}; });
      o.muscles = mm;
      o.rankSource = 'Strength Level standards (strengthlevel.com) by sex and bodyweight';
    }
  }catch(e){}
  return o;
}
// Three-way merge of a keyed map (workouts or store), against the hashes
// from the last good sync. bothChanged(l, r) picks when both sides changed.
function museSyncMergeMap(l, r, s, name, bothChanged){
  l = l || {}; r = r || {}; s = s || {};
  var out = {}, conflicts = [], keys = {};
  Object.keys(l).forEach(function(k){ keys[k] = 1; });
  Object.keys(r).forEach(function(k){ keys[k] = 1; });
  Object.keys(keys).forEach(function(k){
    var a = l[k], b = r[k], h = s[k];
    var ha = a !== undefined ? museSyncHash(JSON.stringify(a)) : null, hb = b !== undefined ? museSyncHash(JSON.stringify(b)) : null;
    if(a !== undefined && b === undefined){
      if(!h){ out[k] = a; return; }
      if(ha !== h){ out[k] = a; conflicts.push('Kept your ' + name(k, a) + ' \u2014 it was deleted in the synced copy.'); }
      return;
    }
    if(b !== undefined && a === undefined){
      if(!h){ out[k] = b; return; }
      if(hb !== h){ out[k] = b; conflicts.push('Kept the synced ' + name(k, b) + ' \u2014 it was deleted on this phone.'); }
      return;
    }
    if(ha === hb){ out[k] = a; return; }
    var ac = h && ha !== h, bc = h && hb !== h;
    if(ac && !bc){ out[k] = a; return; }
    if(bc && !ac){ out[k] = b; return; }
    if(!h){ out[k] = a; return; }
    var pick = bothChanged(a, b);
    out[k] = pick;
    conflicts.push(name(k, pick) + ' was changed in both places \u2014 kept ' + (pick === a ? 'this phone\u2019s' : 'the newer') + ' copy.');
  });
  return {map: out, conflicts: conflicts};
}
function museSyncHashMap(m){ var o = {}; Object.keys(m || {}).forEach(function(k){ o[k] = museSyncHash(JSON.stringify(m[k])); }); return o; }
function museSyncSnapOf(pack){
  var snap = {days:{}, weight:''};
  Object.keys(pack.days || {}).sort().forEach(function(ds){
    var day = pack.days[ds] || {};
    var entries = {};
    (day.entries || []).forEach(function(e){
      if(e && e.id) entries[e.id] = museSyncEntryHash(e);
    });
    snap.days[ds] = {
      hash: museSyncHash(JSON.stringify(day)),
      entries: entries,
      waterMl: day.waterMl || 0,
      complete: !!day.complete,
      training: !!day.training
    };
  });
  snap.weight = museSyncHash(JSON.stringify(pack.weight || []));
  snap.weightByDate = {};
  (pack.weight || []).forEach(function(w){ if(w && w.date) snap.weightByDate[w.date] = Number(w.kg); });
  snap.workouts = museSyncHashMap(pack.workouts);
  snap.store = museSyncHashMap(pack.store);
  return snap;
}
function museSyncSnapEqual(a, b){
  if(!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}
// One entry's merge, Jot's rules by entry id.
function museSyncMergeEntries(localEs, remoteEs, snapEntries){
  snapEntries = snapEntries || {};
  var conflicts = [], byId = {};
  (localEs || []).forEach(function(n){ if(n && n.id) (byId[n.id] = byId[n.id] || {}).local = n; });
  (remoteEs || []).forEach(function(n){ if(n && n.id) (byId[n.id] = byId[n.id] || {}).remote = n; });
  var merged = [];
  Object.keys(byId).forEach(function(id){
    var e = byId[id], inSnap = snapEntries[id];
    var lHash = e.local ? museSyncEntryHash(e.local) : null;
    var rHash = e.remote ? museSyncEntryHash(e.remote) : null;
    var nm = function(x){ return String((x && x.name) || 'an item').slice(0, 40); };
    if(e.local && !e.remote){
      if(!inSnap){ merged.push(e.local); return; }                        // added here
      if(lHash !== inSnap){ merged.push(e.local); conflicts.push('Kept your newer copy of \u201c' + nm(e.local) + '\u201d \u2014 it was deleted in the synced copy.'); return; }
      return;                                                             // deleted over there, unchanged here
    }
    if(e.remote && !e.local){
      if(!inSnap){ merged.push(e.remote); return; }                       // added over there
      if(rHash !== inSnap){ merged.push(e.remote); conflicts.push('Kept the synced copy of \u201c' + nm(e.remote) + '\u201d \u2014 it was deleted on this phone.'); return; }
      return;                                                             // deleted here, unchanged over there
    }
    if(lHash === rHash){ merged.push(e.local); return; }
    var lChanged = inSnap && lHash !== inSnap, rChanged = inSnap && rHash !== inSnap;
    if(lChanged && !rChanged){ merged.push(e.local); return; }
    if(rChanged && !lChanged){ merged.push(e.remote); return; }
    if(!inSnap){ merged.push(e.local); return; }                          // both added it: same id, keep this phone's
    var lUpd = (e.local.upd || e.local.at || 0), rUpd = (e.remote.upd || e.remote.at || 0);
    var pick = rUpd > lUpd ? e.remote : e.local;
    merged.push(pick);
    conflicts.push('\u201c' + nm(pick) + '\u201d was changed in both places \u2014 kept the newer copy.');
  });
  return {entries: merged, conflicts: conflicts};
}
// Three-way merge: local (this phone) vs remote (the private repo),
// against the snapshot from the last good sync. Returns {pack, conflicts}.
function museSyncMerge(local, remote, snap){
  snap = snap || {days:{}, weight:''};
  snap.days = snap.days || {};
  var conflicts = [];
  var days = {};
  var dates = {};
  Object.keys(local.days || {}).forEach(function(ds){ dates[ds] = 1; });
  Object.keys(remote.days || {}).forEach(function(ds){ dates[ds] = 1; });
  Object.keys(dates).sort().forEach(function(ds){
    var l = (local.days || {})[ds], r = (remote.days || {})[ds], s = snap.days[ds];
    var lHash = l ? museSyncHash(JSON.stringify(l)) : null;
    var rHash = r ? museSyncHash(JSON.stringify(r)) : null;
    if(l && !r){
      if(!s){ days[ds] = l; return; }                                     // added here
      if(lHash !== s.hash){ days[ds] = l; conflicts.push('Kept your ' + ds + ' \u2014 it changed here after it was deleted in the synced copy.'); return; }
      return;                                                             // deleted over there, unchanged here
    }
    if(r && !l){
      if(!s){ days[ds] = r; return; }                                     // added over there
      if(rHash !== s.hash){ days[ds] = r; conflicts.push('Kept the synced copy of ' + ds + ' \u2014 it changed there after it was deleted on this phone.'); return; }
      return;                                                             // deleted here, unchanged over there
    }
    if(lHash === rHash){ days[ds] = l; return; }
    var lChanged = s && lHash !== s.hash, rChanged = s && rHash !== s.hash;
    if(lChanged && !rChanged){ days[ds] = l; return; }
    if(rChanged && !lChanged){ days[ds] = r; return; }
    if(!s){ days[ds] = l; return; }                                       // both added it: keep this phone's
    // Changed on both sides: merge entry by entry, then the day's numbers.
    var em = museSyncMergeEntries(l.entries, r.entries, s.entries);
    conflicts = conflicts.concat(em.conflicts);
    var day = {entries: em.entries};
    var lw = l.waterMl || 0, rw = r.waterMl || 0;
    if(lw !== rw){
      day.waterMl = Math.max(lw, rw);
      if(lw !== (s.waterMl || 0) && rw !== (s.waterMl || 0))
        conflicts.push('Water on ' + ds + ' was logged in both places \u2014 kept the larger amount (' + Math.max(lw, rw) + ' ml).');
    } else if(lw) day.waterMl = lw;
    if(l.complete || r.complete) day.complete = true;
    if(l.training || r.training) day.training = true;
    days[ds] = day;
  });
  // The weight log merges by date. A date weighed on both sides keeps the
  // phone's reading: the phone is where you step on the scales.
  var weight = [], byDate = {};
  (local.weight || []).forEach(function(w){ if(w && w.date) (byDate[w.date] = byDate[w.date] || {}).local = w; });
  (remote.weight || []).forEach(function(w){ if(w && w.date) (byDate[w.date] = byDate[w.date] || {}).remote = w; });
  var snapW = snap.weightByDate || {};
  Object.keys(byDate).sort().forEach(function(dt){
    var e = byDate[dt];
    var lKg = e.local ? Number(e.local.kg) : null, rKg = e.remote ? Number(e.remote.kg) : null;
    var sKg = snapW[dt];
    if(e.local && !e.remote){
      if(sKg === undefined){ weight.push(e.local); return; }
      if(lKg !== sKg){ weight.push(e.local); conflicts.push('Kept your weigh-in for ' + dt + ' (' + lKg + ' kg) \u2014 it was deleted in the synced copy.'); return; }
      return;
    }
    if(e.remote && !e.local){
      if(sKg === undefined){ weight.push(e.remote); return; }
      if(rKg !== sKg){ weight.push(e.remote); conflicts.push('Kept the synced weigh-in for ' + dt + ' (' + rKg + ' kg) \u2014 it was deleted on this phone.'); return; }
      return;
    }
    if(lKg === rKg){ weight.push(e.local); return; }
    var lChanged = sKg !== undefined && lKg !== sKg, rChanged = sKg !== undefined && rKg !== sKg;
    if(lChanged && !rChanged){ weight.push(e.local); return; }
    if(rChanged && !lChanged){ weight.push(e.remote); return; }
    weight.push(e.local);
    conflicts.push('You weighed in twice on ' + dt + ' \u2014 kept this phone\u2019s ' + lKg + ' kg.');
  });
  // v145: workouts (newer copy wins when both changed) and everything else
  // (this phone's copy wins when both changed).
  var wm = museSyncMergeMap(local.workouts, remote.workouts, snap.workouts,
    function(k, w){ return 'workout \u201c' + ((w && w.name) || k) + '\u201d'; },
    function(a, b){ return ((b.upd || b.end || 0) > (a.upd || a.end || 0)) ? b : a; });
  var sm = museSyncMergeMap(local.store, remote.store, snap.store,
    function(k){ return 'setting \u201c' + k + '\u201d'; },
    function(a){ return a; });
  conflicts = conflicts.concat(wm.conflicts, sm.conflicts);
  return {
    pack: {
      __coachSync: 1, version: Math.max(local.version || 0, remote.version || 0) + 1,
      updatedAt: new Date().toISOString(), updatedBy: 'phone',
      days: days, weight: weight, workouts: wm.map, store: sm.map, insights: local.insights || {}
    },
    conflicts: conflicts
  };
}
function museSyncApply(pack){
  museSyncApplying = true;
  try{
    var localDates = museSyncDayDates();
    var mergedDates = Object.keys(pack.days || {});
    localDates.forEach(function(ds){
      if(mergedDates.indexOf(ds) < 0){
        // The merge deleted this whole day: take its keys away.
        try{ CS.removeItem(dkey(parseYMD(ds))); }catch(e){}
        try{ CS.removeItem(waterKey(parseYMD(ds))); }catch(e){}
        try{ CS.removeItem(COMPLETE_PREFIX + ds); }catch(e){}
        try{ CS.removeItem(trainKey(parseYMD(ds))); }catch(e){}
      }
    });
    mergedDates.forEach(function(ds){
      var day = pack.days[ds] || {}, d = parseYMD(ds);
      var es = Array.isArray(day.entries) ? day.entries : [];
      try{ saveEntries(d, es); }catch(e){}
      try{
        if(day.waterMl > 0) saveWaterMl(d, day.waterMl);
        else CS.removeItem(waterKey(d));
      }catch(e){}
      try{ setDayComplete(ds, !!day.complete); }catch(e){}
      try{ setTrainingDay(d, !!day.training); }catch(e){}
    });
    try{ lsSet(WEIGHTLOG_KEY, JSON.stringify(pack.weight || [])); }catch(e){}
    // v145: everything else, written back under its own name.
    var store = pack.store || {}, haveStore = museSyncStoreLocal();
    Object.keys(store).forEach(function(k){
      if(!museSyncStoreKey(k)) return;                       // never a secret or a cache
      var raw = museSyncStoreRaw(store[k]);
      if(CS.getItem(k) !== raw){ try{ lsSet(k, raw); }catch(e){} }
    });
    if(pack.store) Object.keys(haveStore).forEach(function(k){ if(!(k in store)){ try{ CS.removeItem(k); }catch(e){} } });
    // Workouts, then the list of them rebuilt from what is there.
    if(pack.workouts){
      var ws = pack.workouts, have = museSyncWorkoutsLocal();
      Object.keys(have).forEach(function(id){ if(!ws[id]){ try{ CS.removeItem('coachtrain:w:' + id); }catch(e){} } });
      var idx = [];
      Object.keys(ws).forEach(function(id){
        var w = ws[id]; if(!w || !w.id || !w.d || !Array.isArray(w.ex)) return;
        try{ lsSet('coachtrain:w:' + id, JSON.stringify(w)); }catch(e){}
        var st = (typeof trWorkoutStats === 'function') ? trWorkoutStats(w) : {vol: 0, sets: 0, mins: 0};
        idx.push({id: w.id, d: w.d, s: w.start || 0, n: w.name || 'Workout', v: st.vol, k: st.sets, m: st.mins, x: w.ex.map(function(e){ return e.n; })});
      });
      idx.sort(function(a, b){ return a.s - b.s; });
      try{ lsSet('coachtrain:idx', JSON.stringify(idx)); }catch(e){}
      try{ trUsageCache = null; TR_LIB = null; }catch(e){}
    }
  }finally{ museSyncApplying = false; }
}
async function museSyncFetch(token){
  var r;
  try{
    r = await fetch(MUSE_SYNC_API, {headers:{'Authorization':'Bearer ' + token, 'Accept':'application/vnd.github+json'}, cache:'no-store'});
  }catch(e){ var err = new Error('offline'); err.code = 'offline'; throw err; }
  if(r.status === 404) return {pack:null, sha:null};
  if(r.status === 401 || r.status === 403){ var err2 = new Error('auth'); err2.code = 'auth'; throw err2; }
  if(!r.ok){ var err3 = new Error('http ' + r.status); err3.code = 'http'; throw err3; }
  var d = await r.json();
  var pack = null;
  try{ pack = JSON.parse(decodeURIComponent(escape(atob(String(d.content || '').replace(/\n/g, ''))))); }catch(e){ pack = null; }
  // v145: a file over 1 MB comes back without its content; fetch it raw.
  if(!pack && d && d.size > 0 && !d.content){
    try{
      var rr = await fetch(MUSE_SYNC_API, {headers:{'Authorization':'Bearer ' + token, 'Accept':'application/vnd.github.raw+json'}, cache:'no-store'});
      if(rr.ok) pack = JSON.parse(await rr.text());
    }catch(e){ pack = null; }
  }
  if(!pack || pack.__coachSync !== 1){ var err4 = new Error('bad file'); err4.code = 'badfile'; throw err4; }
  return {pack: pack, sha: d.sha};
}
async function museSyncPut(token, pack, sha){
  var body = {message:'Coach sync v' + pack.version + ' (' + pack.updatedBy + ')',
    content:btoa(unescape(encodeURIComponent(JSON.stringify(pack))))};
  if(sha) body.sha = sha;
  var r;
  try{
    r = await fetch(MUSE_SYNC_API, {method:'PUT', headers:{'Authorization':'Bearer ' + token, 'Accept':'application/vnd.github+json', 'Content-Type':'application/json'}, body:JSON.stringify(body)});
  }catch(e){ var err = new Error('offline'); err.code = 'offline'; throw err; }
  if(r.status === 401 || r.status === 403){ var err2 = new Error('auth'); err2.code = 'auth'; throw err2; }
  if(r.status === 409){ var err3 = new Error('conflict'); err3.code = 'conflict'; throw err3; }
  if(!r.ok){ var err4 = new Error('http ' + r.status); err4.code = 'http'; throw err4; }
  var d = await r.json();
  return d.content && d.content.sha ? d.content.sha : sha;
}
function museSyncLocalChanged(st){
  if(!st.snapshot) return true;
  var cur = museSyncSnapOf(museSyncPackLocal());
  if(cur.weight !== st.snapshot.weight) return true;
  if(JSON.stringify(cur.workouts || {}) !== JSON.stringify(st.snapshot.workouts || {})) return true;
  if(JSON.stringify(cur.store || {}) !== JSON.stringify(st.snapshot.store || {})) return true;
  var dates = {};
  Object.keys(cur.days).forEach(function(ds){ dates[ds] = 1; });
  Object.keys(st.snapshot.days || {}).forEach(function(ds){ dates[ds] = 1; });
  return Object.keys(dates).some(function(ds){
    var a = cur.days[ds], b = (st.snapshot.days || {})[ds];
    return JSON.stringify(a || null) !== JSON.stringify(b || null);
  });
}
function museSyncStatusText(){
  var st = museSyncState();
  if(!st.enabled) return 'Off \u2014 switch it on to let Muse help with your food, water, weight and training days';
  if(!museSyncToken()) return 'On, but no token yet \u2014 paste one below';
  if(st.lastError) return 'Last sync failed: ' + st.lastError;
  if(st.lastSync){
    var m = Math.floor((Date.now() - new Date(st.lastSync).getTime()) / 60000);
    var when = m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.floor(m / 60) + 'h ago';
    return 'Last synced ' + when + (st.conflicts && st.conflicts.length ? ' \u2014 ' + st.conflicts.length + ' thing' + (st.conflicts.length > 1 ? 's' : '') + ' changed in both places, kept the newer copy' : '');
  }
  return 'On \u2014 not synced yet';
}
function museSyncRenderRow(){
  var box = document.getElementById('musesync-box');
  if(!box) return;
  var st = museSyncState();
  var on = !!st.enabled;
  var tok = museSyncToken();
  var conflicts = (st.conflicts || []).map(function(c){
    return '<p class="cl-p" style="margin-top:6px;">' + esc(c) + '</p>';
  }).join('');
  if(!on){
    box.innerHTML =
      '<p class="cl-p">Let Muse see your food, water, weight and training days, and add to them for you. Off until you switch it on. Your days sync to a private place only you and Muse can see \u2014 never to this public app. Your profile and targets never sync.</p>' +
      '<label class="st-row" style="border:0; padding-left:0; padding-right:0;"><span class="st-l">Sync with Muse</span><input type="checkbox" class="st-sw" id="musesync-toggle"></label>' +
      '<p class="cl-p" id="musesync-state">' + esc(museSyncStatusText()) + '</p>';
  } else if(!tok){
    box.innerHTML =
      '<label class="st-row" style="border:0; padding-left:0; padding-right:0;"><span class="st-l">Sync with Muse</span><input type="checkbox" class="st-sw" id="musesync-toggle" checked></label>' +
      '<p class="cl-p">Make a token in GitHub that can only read and write the private coach-sync repo. It stays on this phone \u2014 it is never sent anywhere except GitHub, and never backed up.</p>' +
      '<input type="password" id="musesync-token" placeholder="Paste your GitHub token here" autocomplete="off" autocapitalize="off" spellcheck="false">' +
      '<p class="cl-p" id="musesync-state" style="margin-top:8px;">' + esc(museSyncStatusText()) + '</p>';
  } else {
    box.innerHTML =
      '<label class="st-row" style="border:0; padding-left:0; padding-right:0;"><span class="st-l">Sync with Muse</span><input type="checkbox" class="st-sw" id="musesync-toggle" checked></label>' +
      '<p class="cl-p" id="musesync-state">' + esc(museSyncStatusText()) + '</p>' +
      conflicts +
      '<div style="display:flex; gap:8px; margin-top:8px;">' +
        '<button class="save-btn" id="musesync-now" style="margin:0; flex:1; background:none; color:var(--text2); border:0.5px solid var(--border); font-weight:500;">Sync now</button>' +
        '<button class="save-btn" id="musesync-forget" style="margin:0; flex:1; background:none; color:var(--text2); border:0.5px solid var(--border); font-weight:500;">Remove token</button>' +
      '</div>';
  }
  var tog = document.getElementById('musesync-toggle');
  if(tog) tog.onchange = function(e){
    museSyncSetEnabled(e.target.checked);
    try{ if(typeof buzz === 'function') buzz('tap'); }catch(err){}
    museSyncRenderRow();
    if(e.target.checked && museSyncToken()) museSyncNow({auto:true, quiet:true});
  };
  var inp = document.getElementById('musesync-token');
  if(inp) inp.onchange = function(e){
    var v = e.target.value.trim();
    if(v){ museSyncSetToken(v); } else museSyncSetToken(null);
    museSyncRenderRow();
    if(v) museSyncNow({auto:true, quiet:true});
  };
  var now = document.getElementById('musesync-now');
  if(now) now.onclick = function(){ museSyncNow({}); };
  var forget = document.getElementById('musesync-forget');
  if(forget) forget.onclick = function(){
    museSyncSetToken(null);
    museSyncRenderRow();
  };
}
// The main sync. Quiet when automatic (opening the app, leaving it);
// chatty when you tap Sync now. Returns a small result for tests.
async function museSyncNow(opts){
  opts = opts || {};
  if(museSyncBusy) return {ok:false, reason:'busy'};
  if(!museSyncEnabled()) return {ok:false, reason:'off'};
  var token = museSyncToken();
  if(!token){
    if(!opts.quiet) alert('Add your sync token in Settings first');
    return {ok:false, reason:'notoken'};
  }
  museSyncBusy = true;
  var stateEl = document.getElementById('musesync-state');
  if(stateEl) stateEl.textContent = 'Syncing\u2026';
  try{
    museSyncEnsureIds();
    var st = museSyncState();
    var fetched;
    try{ fetched = await museSyncFetch(token); }
    catch(e){
      st.lastError = e.code === 'auth' ? 'GitHub did not accept the token \u2014 check it, or make a new one'
        : e.code === 'offline' ? 'No connection \u2014 try again when you are back online'
        : 'GitHub said no (' + e.message + ')';
      museSyncSaveState(st); museSyncRenderRow();
      if(!opts.quiet) alert(st.lastError);
      return {ok:false, reason:e.code};
    }
    var local = museSyncPackLocal();
    if(!fetched.pack){
      // First sync ever: this phone's days become the synced copy.
      var sha0 = await museSyncPut(token, local, null);
      var ns0 = {enabled:true, version:local.version, sha:sha0, snapshot:museSyncSnapOf(local), lastSync:new Date().toISOString(), lastError:null, conflicts:[]};
      museSyncSaveState(ns0); museSyncRenderRow();
      try{ renderDay(); renderStreak(); }catch(e){}
      if(!opts.quiet) alert('Synced \u2014 ' + Object.keys(local.days).length + ' days, ' + Object.keys(local.workouts || {}).length + ' workouts and everything else now shared with Muse');
      return {ok:true, pushed:Object.keys(local.days).length, pulled:0, conflicts:[]};
    }
    var remote = fetched.pack;
    var localChanged = museSyncLocalChanged(st);
    // Changed remotely if the remote copy no longer matches the snapshot —
    // version numbers alone are not trusted, Muse may write any version.
    var remoteChanged = !st.snapshot || !museSyncSnapEqual(museSyncSnapOf(remote), st.snapshot);
    if(!localChanged && !remoteChanged){
      st.lastSync = new Date().toISOString(); st.lastError = null; museSyncSaveState(st); museSyncRenderRow();
      if(!opts.quiet) alert('Already up to date');
      return {ok:true, pushed:0, pulled:0, conflicts:[]};
    }
    var merged = museSyncMerge(local, remote, st.snapshot);
    var sha = fetched.sha, tries = 0;
    while(tries < 2){
      try{ sha = await museSyncPut(token, merged.pack, sha); break; }
      catch(e){
        if(e.code !== 'conflict' || tries) throw e;
        tries++;
        var again = await museSyncFetch(token);
        if(!again.pack) throw e;
        merged = museSyncMerge(museSyncPackLocal(), again.pack, st.snapshot);
        sha = again.sha;
      }
    }
    var beforeDays = Object.keys(local.days).length;
    museSyncApply(merged.pack);
    var ns = {enabled:true, version:merged.pack.version, sha:sha, snapshot:museSyncSnapOf(merged.pack),
      lastSync:new Date().toISOString(), lastError:null, conflicts:merged.conflicts};
    museSyncSaveState(ns); museSyncRenderRow();
    try{ renderDay(); renderStreak(); }catch(e){}
    var pulled = Object.keys(merged.pack.days).length - beforeDays;
    if(!opts.quiet){
      try{ if(typeof buzz === 'function') buzz('big'); }catch(e){}
      alert(merged.conflicts.length ? 'Synced \u2014 kept the newer copy of ' + merged.conflicts.length + ' thing' + (merged.conflicts.length > 1 ? 's' : '') + ' changed in both places (see Settings)'
        : pulled > 0 ? 'Synced \u2014 ' + pulled + ' day' + (pulled > 1 ? 's' : '') + ' came in from Muse'
        : 'Synced');
    }
    return {ok:true, pushed:localChanged ? 1 : 0, pulled:pulled, conflicts:merged.conflicts};
  }catch(e){
    var st2 = museSyncState();
    st2.lastError = e.code === 'auth' ? 'GitHub did not accept the token \u2014 check it, or make a new one'
      : e.code === 'offline' ? 'No connection \u2014 try again when you are back online'
      : 'Sync failed (' + (e.message || 'unknown') + ')';
    museSyncSaveState(st2); museSyncRenderRow();
    if(!opts.quiet) alert(st2.lastError);
    return {ok:false, reason:e.code || 'error'};
  }finally{ museSyncBusy = false; }
}
function museSyncSoon(){
  try{
    if(museSyncApplying) return;
    if(!museSyncEnabled() || !museSyncToken()) return;
    clearTimeout(museSyncSoonTimer);
    museSyncSoonTimer = setTimeout(function(){ museSyncNow({auto:true, quiet:true}); }, 8000);
  }catch(e){}
}
// Startup: paint the Settings row, sync quietly shortly after opening,
// and once more when the app is put away — the same three moments Jot uses.
try{ museSyncRenderRow(); }catch(e){}
setTimeout(function(){ try{ museSyncNow({auto:true, quiet:true}); }catch(e){} }, 2000);
document.addEventListener('visibilitychange', function(){
  if(document.visibilityState === 'hidden'){ try{ museSyncNow({auto:true, quiet:true}); }catch(e){} }
});
