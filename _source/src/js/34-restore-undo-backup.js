// ---- Import / restore ----
function importJSON(file){
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const data = JSON.parse(reader.result);
      const suite = readSuite(data);
      if(!suite) throw new Error('not a backup file');
      const store = (suite.coach && suite.coach.store) || {};
      const n = Object.keys(store).length;
      const when = suite.exported ? new Date(suite.exported).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}) : 'an unknown date';

      // A shared file with no COACH half must not touch COACH. It is still
      // worth keeping: the Ledger half rides along in the next backup.
      if(!n){
        if(suite.ledger){
          setCarry(suite.ledger, suite.exported ? suite.exported.slice(0,10) : todayYMD());
          alert('That file holds no COACH data, so nothing here was changed.\n\n'+
                'Its Ledger data is now carried in your next COACH backup, so one file covers both apps.');
          renderBackupNag();
          return;
        }
        throw new Error('backup is empty');
      }
      if(!confirm('Restore '+n+' items from a backup taken on '+when+'?\n\n'+
        'Anything in the backup replaces what is on this device. Days you have logged since, and are not in the file, are left alone.')) return;
      let failed = 0;
      Object.keys(store).forEach(k=>{ if(!lsSet(k, store[k])) failed++; });
      // Keep the other app's half so the next COACH backup still covers both.
      if(suite.ledger) setCarry(suite.ledger, suite.exported ? suite.exported.slice(0,10) : todayYMD());
      loadTargets();
      // Days that came in from a backup taken before COACH tracked completion
      // arrive with no mark, which leaves them logged but counted nowhere.
      migrateCompletion(true);
      currentDate = new Date();
      renderDay(); renderStreak();
      if(currentView==='week') renderWeek();
      alert(failed
        ? ('Restored '+(n-failed)+' of '+n+' items. '+failed+' could not be written — storage may be full.')
        : ('Backup restored — '+n+' items.'));
    }catch(e){
      alert('Could not read that file. Make sure it is a backup exported from this app.');
    }
  };
  reader.readAsText(file);
}

// ============================================================
// Undo.
//
// Deleting used to write straight through — splice, save, gone. Two
// mechanisms, because a mis-tap gets noticed at two very different moments:
// the bar for the one you watch happen, the bin for the one you find days
// later going back through your days.
//
// Everything needed to put an entry back travels with it: which day, which
// meal, and where it sat in that day. Restoring is an INSERT, never a
// whole-day write, so it cannot lose anything that happened since.
// ============================================================
const BIN_KEY = 'coachbin';
const BIN_MAX = 30;         // deletions kept
const BIN_DAYS = 14;        // how long they last
const UNDO_MS = 6000;       // how long the bar stays up

function loadBin(){
  try{ return JSON.parse(CS.getItem(BIN_KEY)) || []; }catch(e){ return []; }
}
function saveBin(list){ return lsSet(BIN_KEY, JSON.stringify(list)); }
// Old entries are dropped on every read-modify-write rather than on a timer,
// so the cap holds even if the app is never opened for a month.
function pruneBin(list){
  const cut = Date.now() - BIN_DAYS*86400000;
  return list.filter(b => (b.ts||0) >= cut).slice(-BIN_MAX);
}
function binPush(rec){
  rec.id = 'b'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  rec.ts = Date.now();
  const list = pruneBin(loadBin().concat([rec]));
  saveBin(list);
  return rec;
}
function binRemove(id){ saveBin(pruneBin(loadBin().filter(b => b.id !== id))); }

// ---- putting things back ----
// Each kind knows how to undo itself. Returns true only if something was
// actually restored, so the caller never claims a success it did not have.
function binRestore(rec){
  if(!rec) return false;
  if(rec.kind === 'entry'){
    const d = parseYMD(rec.date);
    const es = loadEntries(d);
    // Back where it was if the day is still at least that long; otherwise on
    // the end. Never an overwrite.
    const at = Math.max(0, Math.min(rec.index == null ? es.length : rec.index, es.length));
    es.splice(at, 0, rec.item);
    saveEntries(d, es);
    return true;
  }
  if(rec.kind === 'myfood'){
    const list = loadMyFoods();
    if(list.some(f => f.id === rec.item.id)) return true;   // already back
    list.push(rec.item);
    saveMyFoods(list);
    return true;
  }
  if(rec.kind === 'savedmeal'){
    const meals = loadSavedMeals();
    const at = Math.max(0, Math.min(rec.index == null ? meals.length : rec.index, meals.length));
    meals.splice(at, 0, rec.item);
    saveSavedMeals(meals);
    return true;
  }
  return false;
}
function binLabel(rec){
  if(!rec) return '';
  return rec.item && rec.item.name ? rec.item.name : 'Item';
}

// ---- the bar ----
let undoRec = null, undoTimer = null, undoRaf = null;
function hideUndo(){
  const bar = document.getElementById('undo-bar');
  if(bar) bar.classList.remove('on');
  undoRec = null;
  if(undoTimer){ clearTimeout(undoTimer); undoTimer = null; }
  if(undoRaf){ cancelAnimationFrame(undoRaf); undoRaf = null; }
}
function showUndo(rec, what){
  const bar = document.getElementById('undo-bar');
  if(!bar) return;
  // A second delete replaces the bar rather than queueing one. The first is
  // still in the bin, so nothing is lost by letting it go.
  if(undoTimer){ clearTimeout(undoTimer); undoTimer = null; }
  if(undoRaf){ cancelAnimationFrame(undoRaf); undoRaf = null; }
  undoRec = rec;
  document.getElementById('undo-text').innerHTML =
    'Deleted <b>' + esc(binLabel(rec)) + '</b>' + (what ? ' <span>\u00b7 ' + esc(what) + '</span>' : '');
  bar.classList.add('on');
  const prog = document.getElementById('undo-progress');
  const started = Date.now();
  const tick = ()=>{
    const left = Math.max(0, 1 - (Date.now() - started)/UNDO_MS);
    if(prog) prog.style.width = (left*100).toFixed(1) + '%';
    if(left > 0) undoRaf = requestAnimationFrame(tick);
  };
  tick();
  undoTimer = setTimeout(hideUndo, UNDO_MS);
}
function doUndo(){
  const rec = undoRec;
  hideUndo();
  if(!rec) return;
  if(binRestore(rec)){
    binRemove(rec.id);
    buzz();
    sfx('undo');
    renderDay(); renderStreak();
    if(currentView !== 'day') renderWeek();
    renderMyFoodsCount();
    renderBin();
  }
}

function renderBin(){
  const box = document.getElementById('bin-list');
  const note = document.getElementById('bin-note');
  if(!box) return;
  const list = pruneBin(loadBin()).slice().reverse();
  if(!list.length){
    box.innerHTML = '<div class="estate"><i class="ti ti-trash" aria-hidden="true"></i>'+
      '<div class="et">Nothing deleted recently</div>'+
      '<div class="es">Deleted items stay here for '+BIN_DAYS+' days.</div></div>';
    if(note) note.textContent = '';
    return;
  }
  box.innerHTML = list.map(b=>{
    const when = binWhen(b.ts);
    const where = b.kind === 'entry'
      ? (b.meal || 'Snack') + ' \u00b7 ' + dayLabelShort(b.date)
      : (b.kind === 'myfood' ? 'Saved food' : 'Saved meal');
    return '<div class="bin-row"><div><div class="bn">'+esc(binLabel(b))+'</div>'+
      '<div class="bd">'+esc(where)+' \u00b7 deleted '+esc(when)+'</div></div>'+
      '<button data-restore="'+esc(b.id)+'">Restore</button></div>';
  }).join('');
  if(note) note.textContent = 'Kept '+BIN_DAYS+' days, then cleared. Nothing here counts toward any total.';
  box.querySelectorAll('[data-restore]').forEach(btn=>{
    btn.onclick = ()=>{
      const rec = loadBin().find(x => x.id === btn.dataset.restore);
      if(!rec) return;
      if(binRestore(rec)){
        binRemove(rec.id);
        buzz();
        renderDay(); renderStreak();
        if(currentView !== 'day') renderWeek();
        renderMyFoodsCount();
        renderBin();
      }
    };
  });
}
function binWhen(ts){
  const mins = Math.floor((Date.now() - ts)/60000);
  if(mins < 1) return 'just now';
  if(mins < 60) return mins + ' min ago';
  const hrs = Math.floor(mins/60);
  if(hrs < 24) return hrs + (hrs===1 ? ' hour ago' : ' hours ago');
  const days = Math.floor(hrs/24);
  return days === 1 ? 'yesterday' : days + ' days ago';
}
function dayLabelShort(ds){
  try{ return parseYMD(ds).toLocaleDateString(undefined,{weekday:'short', day:'numeric', month:'short'}); }
  catch(e){ return ds; }
}

const LASTBACKUP_KEY = 'coachlastbackup';

// ============================================================
// The backup interval.
//
// iOS clears a web app's storage after roughly a week of not opening it, so a
// warning that waits a fortnight arrives after the thing it was meant to
// prevent. Seven days.
//
// The filename never changes. iOS cannot silently overwrite a file, but a
// SAVE with a name already in that folder offers Replace — so one tap a week
// keeps exactly one backup, instead of forty numbered copies in Files.
// ============================================================
const BACKUP_EVERY_DAYS = 7;
const BACKUP_FILENAME = 'coach-backup.json';
function daysSinceBackup(){
  const last = CS.getItem(LASTBACKUP_KEY);
  if(!last) return null;
  const n = Math.round((parseYMD(todayYMD()) - parseYMD(last))/86400000);
  return isFinite(n) ? n : null;
}
function backupDue(){
  const n = daysSinceBackup();
  return n === null || n >= BACKUP_EVERY_DAYS;
}


// localStorage is the single point of failure — iOS evicts it from apps you
// have not opened in a while, and it goes without warning.
function renderBackupNag(){
  const el = document.getElementById('backup-nag');
  if(!el) return;
  const last = CS.getItem(LASTBACKUP_KEY);
  // Spec-correct iteration — enumerating localStorage as a plain object is not
  // guaranteed and silently returns nothing where it is not supported.
  let days = 0;
  for(let i=0;i<CS.length;i++){
    const k = CS.key(i);
    if(k && k.indexOf('calorielog:')===0) days++;
  }
  let msg = '';
  const n = daysSinceBackup();
  if(!last){
    // Nothing to lose yet is not worth nagging about; a fortnight of logging is.
    if(days > 3) msg = 'You have never backed up. '+days+' day'+(days===1?'':'s')+
      ' of logging only exist on this device — tap to save a copy.';
  } else if(n >= BACKUP_EVERY_DAYS){
    msg = 'Last backup was '+n+' days ago. Tap to save over it — same file, no second copy.';
  }
  if(!msg){ el.style.display='none'; return; }
  el.style.display = 'flex';
  document.getElementById('backup-nag-text').textContent = msg;
}

// ============================================================
// One backup, both apps.
//
// Two separate export files is two chances to lose half your history, and
// the half you lose is always the one you forgot. Both apps now read and
// write ONE envelope:
//
//   { __suite:1, exported:ISO, <your own half at the top level>, <other app>:{...} }
//
// Your own half stays at the TOP level, in exactly the shape your app has
// always written — so a build from before this change still reads the file
// and restores from it. The other app's half sits under its own key and is
// carried through untouched. So: back up in COACH, restore that file in
// Ledger (which takes nothing from it but keeps the COACH half), back up in
// Ledger — and that file now holds both. From then on one file is the whole
// backup, and neither app has to be on the newest version to read it.
//
// The rule that makes this safe: restoring a file with no section for you
// changes nothing of yours. A shared file must never be able to wipe an app
// just because the other app wrote it.
// ============================================================
const SUITE_VERSION = 1;
const CARRY_KEY = 'coachcarry';          // Ledger's half, held for the shared file
const CARRYWHEN_KEY = 'coachcarrywhen';
function loadCarry(){ try{ return JSON.parse(CS.getItem(CARRY_KEY)) || null; }catch(e){ return null; } }
function setCarry(section, when){
  if(!section){ return; }
  try{
    CS.setItem(CARRY_KEY, JSON.stringify(section));
    CS.setItem(CARRYWHEN_KEY, when || todayYMD());
  }catch(e){}
}
// Find each app's half wherever it sits: under its own key, or at the top
// level in that app's own legacy shape. The same three lines run in Ledger.
function coachHalf(d){
  if(d && d.coach && d.coach.store) return d.coach;
  if(d && d.store) return { store: d.store };
  return null;
}
function ledgerHalf(d){
  if(d && d.ledger && d.ledger.txns) return d.ledger;
  if(d && d.txns && d.accts) return d;
  return null;
}
function readSuite(data){
  if(!data || typeof data !== 'object') return null;
  const coach = coachHalf(data), ledger = ledgerHalf(data);
  if(!coach && !ledger) return null;
  return { coach, ledger, exported: data.exported, shared: !!data.__suite };
}

/* ---- backups that happen on their own ----
   Two layers, because they fail in different ways.

   1. A copy inside the phone, in IndexedDB, rewritten every day the app is
      opened. This survives the thing that actually goes wrong most often: a
      bad write, a corrupted day, a mis-tap. It does NOT survive losing the
      phone, and it never pretends to.
   2. A real file, written to a folder you pick, under one name so each save
      REPLACES the last. Browsers only allow that silently where the File
      System Access API exists (desktop Chrome, some Android). Where it does
      not - an iPhone, mainly - COACH asks once a week with a single button,
      which is as automatic as Safari permits.                                 */
const AUTO_DB = 'coachbackup', AUTO_STORE = 'snaps';
function autoDb(){
  return new Promise((res, rej)=>{
    try{
      const r = indexedDB.open(AUTO_DB, 1);
      r.onupgradeneeded = ()=>{ try{ r.result.createObjectStore(AUTO_STORE); }catch(e){} };
      r.onsuccess = ()=>res(r.result);
      r.onerror = ()=>rej(r.error);
    }catch(e){ rej(e); }
  });
}
function autoPut(key, val){
  return autoDb().then(db=>new Promise((res, rej)=>{
    const tx = db.transaction(AUTO_STORE, 'readwrite');
    tx.objectStore(AUTO_STORE).put(val, key);
    tx.oncomplete = ()=>res(true); tx.onerror = ()=>rej(tx.error);
  }));
}
function autoGet(key){
  return autoDb().then(db=>new Promise((res, rej)=>{
    const tx = db.transaction(AUTO_STORE, 'readonly');
    const q = tx.objectStore(AUTO_STORE).get(key);
    q.onsuccess = ()=>res(q.result || null); q.onerror = ()=>rej(q.error);
  }));
}
function backupPayload(){
  const store = {};
  for(let i=0;i<CS.length;i++){
    const k = CS.key(i);
    if(!k) continue;
    if(k.indexOf('coachcloud')===0) continue;      // v132: your GitHub key never goes into a backup
    if(k.indexOf('coachmusesync')===0) continue;    // v144: the Muse sync token and state never go into a backup either
    if(k.indexOf('calorie')===0 || k.indexOf('coach')===0) store[k] = CS.getItem(k);
  }
  return { __suite: SUITE_VERSION, __calorieapp: 1, exported: new Date().toISOString(),
           store: store, ledger: loadCarry() };
}

