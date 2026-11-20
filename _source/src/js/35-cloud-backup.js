/* ============================================================
   v132 - Cloud backup, to a private (secret) gist on your own GitHub.
   Once a day, the first time the app is opened, the whole backup is
   compressed and saved over the same gist. GitHub keeps every earlier
   version as the gist's history, so nothing is ever overwritten for good.
   The key lives only on this phone, and is left out of every backup.
   ============================================================ */
const CLOUD_TOKEN_K = 'coachcloudtoken';
const CLOUD_GIST_K  = 'coachcloudgist';
const CLOUD_LAST_K  = 'coachcloudlast';     // ISO time of the last good upload
const CLOUD_FILE    = 'coach-backup.txt';
function cloudToken(){ return CS.getItem(CLOUD_TOKEN_K) || ''; }
function cloudOn(){ return !!(cloudToken() && CS.getItem(CLOUD_GIST_K)); }
function cloudApi(path, opts){
  opts = opts || {};
  return fetch('https://api.github.com' + path, Object.assign({}, opts, {
    headers: Object.assign({'Authorization': 'Bearer ' + cloudToken(),
                            'Accept': 'application/vnd.github+json'}, opts.headers || {})
  })).then(r=>{
    if(r.status === 401) throw new Error('GitHub did not accept the key. Make a new one and paste it in again.');
    if(r.status === 404) throw new Error('The backup on GitHub could not be found.');
    if(!r.ok) throw new Error('GitHub answered ' + r.status + '.');
    return r.json();
  });
}
// gzip + base64: a few MB of logs becomes a few hundred KB.
async function cloudPack(obj){
  const json = JSON.stringify(obj);
  if(typeof CompressionStream === 'undefined') return 'json:' + json;
  const buf = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  const b = new Uint8Array(buf); let bin = '';
  for(let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return 'gz64:' + btoa(bin);
}
async function cloudUnpack(text){
  text = String(text || '').trim();
  if(text.indexOf('json:') === 0) return JSON.parse(text.slice(5));
  if(text.indexOf('gz64:') !== 0) throw new Error('That backup is not in a form COACH knows.');
  const bin = atob(text.slice(5)); const b = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  const json = await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return JSON.parse(json);
}
async function cloudUpload(){
  const content = await cloudPack(backupPayload());
  const body = JSON.stringify({files: {[CLOUD_FILE]: {content: content}}});
  await cloudApi('/gists/' + CS.getItem(CLOUD_GIST_K), {method: 'PATCH', body: body});
  lsSet(CLOUD_LAST_K, new Date().toISOString());
  lsSet(LASTBACKUP_KEY, todayYMD());          // the weekly "back up" reminder can rest
  try{ renderBackupNag(); }catch(e){}
  renderCloudRow();
  return true;
}
// Turning it on: check the key, then make the private gist once.
async function cloudConnect(token){
  token = String(token || '').trim();
  if(!token) throw new Error('Paste the key first.');
  lsSet(CLOUD_TOKEN_K, token);
  try{
    await cloudApi('/user');
    let id = CS.getItem(CLOUD_GIST_K);
    if(id){ try{ await cloudApi('/gists/' + id); }catch(e){ id = null; } }
    // A new phone, or the app reinstalled: find the backup already on GitHub
    // rather than starting a second one.
    if(!id){
      try{
        const list = await cloudApi('/gists?per_page=100');
        const g = (list || []).find(x => x && x.files && x.files[CLOUD_FILE] && String(x.description || '').indexOf('COACH backup') === 0);
        if(g){
          id = g.id; lsSet(CLOUD_GIST_K, id);
          // If GitHub holds more days than this phone, offer to put them back
          // first - never save a near-empty phone over a full backup.
          const days = st => Object.keys(st || {}).filter(k => k.indexOf('calorielog:') === 0).length;
          let here = 0;
          for(let i = 0; i < CS.length; i++){ const k = CS.key(i); if(k && k.indexOf('calorielog:') === 0) here++; }
          const full = await cloudApi('/gists/' + id);
          const f = full.files && full.files[CLOUD_FILE];
          let text = f && f.content;
          if(f && (f.truncated || !text)){ text = await (await fetch(f.raw_url)).text(); }
          let data = null; try{ data = await cloudUnpack(text); }catch(e){}
          if(data && days(data.store) > here){
            await cloudRestore();
            renderCloudRow();
            return;
          }
        }
      }catch(e){}
    }
    if(!id){
      const g = await cloudApi('/gists', {method: 'POST', body: JSON.stringify({
        description: 'COACH backup (private) - kept automatically by the app',
        public: false,
        files: {[CLOUD_FILE]: {content: 'json:{}'}}})});
      id = g.id;
      lsSet(CLOUD_GIST_K, id);
    }
    await cloudUpload();
  }catch(e){
    CS.removeItem(CLOUD_TOKEN_K);
    throw e;
  }
}
// Once a day, on opening. Quiet: a failure just waits for tomorrow, and the
// settings row says what went wrong.
let cloudErr = '';
function cloudDaily(){
  if(!cloudOn() || !navigator.onLine) return;
  const last = CS.getItem(CLOUD_LAST_K) || '';
  if(last && ymd(new Date(last)) === todayYMD()) return;
  cloudUpload().then(()=>{ cloudErr = ''; }).catch(e=>{ cloudErr = (e && e.message) || 'Could not reach GitHub.'; renderCloudRow(); });
}
async function cloudRestore(){
  const g = await cloudApi('/gists/' + CS.getItem(CLOUD_GIST_K));
  const f = g.files && g.files[CLOUD_FILE];
  if(!f) throw new Error('There is no backup in it yet.');
  let text = f.content;
  if(f.truncated || !text){ const r = await fetch(f.raw_url); text = await r.text(); }
  const data = await cloudUnpack(text);
  const store = (data && data.store) || {};
  const n = Object.keys(store).length;
  if(!n) throw new Error('That backup is empty.');
  const when = data.exported ? new Date(data.exported).toLocaleString() : 'the last backup';
  if(!confirm('Put back the cloud backup from ' + when + '?\n\n' + n + ' items. Anything saved since, and not in the backup, is left alone.')) return false;
  let failed = 0;
  Object.keys(store).forEach(k=>{ if(k.indexOf('coachcloud') !== 0 && !lsSet(k, store[k])) failed++; });
  loadTargets();
  try{ migrateCompletion(true); }catch(e){}
  currentDate = new Date();
  renderDay(); renderStreak();
  alert(failed ? ('Put back ' + (n - failed) + ' of ' + n + ' items.') : ('Put back ' + n + ' items from ' + when + '.'));
  return true;
}
function renderCloudRow(){
  const box = document.getElementById('cloud-box');
  if(!box) return;
  if(!cloudOn()){
    box.innerHTML =
      '<p class="cl-p">Off. Paste a GitHub key (<b>gist</b> box ticked) to back up once a day.</p>' +
      '<input type="password" id="cloud-key" placeholder="Paste your GitHub key" autocomplete="off" autocapitalize="none" spellcheck="false">' +
      '<button class="save-btn" id="cloud-on" style="margin-top:8px;">Turn on cloud backup</button>' +
      '<p class="cl-p" style="margin-top:8px;">New phone? Paste the same key to put your backup back.</p>' +
      (cloudErr ? '<p class="cl-p bad">' + esc(cloudErr) + '</p>' : '');
    const btn = document.getElementById('cloud-on');
    btn.onclick = ()=>{
      btn.disabled = true; btn.textContent = 'Checking…';
      cloudConnect(document.getElementById('cloud-key').value)
        .then(()=>{ cloudErr = ''; renderCloudRow(); try{ buzz('big'); }catch(e){} })
        .catch(e=>{ cloudErr = e.message; renderCloudRow(); });
    };
    return;
  }
  const last = CS.getItem(CLOUD_LAST_K);
  box.innerHTML =
    '<p class="cl-p"><b style="color:var(--accent);">On.</b> ' +
      (last ? 'Last saved ' + new Date(last).toLocaleString(undefined, {weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}) + '.' : 'Not saved yet.') +
      ' It saves again the first time you open COACH each day. Every earlier copy is kept in its history on GitHub.</p>' +
    (cloudErr ? '<p class="cl-p bad">' + esc(cloudErr) + '</p>' : '') +
    '<div style="display:flex; gap:8px; margin-top:8px;">' +
      '<button class="save-btn" id="cloud-now" style="margin:0; flex:1; background:none; color:var(--text2); border:0.5px solid var(--border); font-weight:500;">Save now</button>' +
      '<button class="save-btn" id="cloud-restore" style="margin:0; flex:1; background:none; color:var(--text2); border:0.5px solid var(--border); font-weight:500;">Put back</button>' +
    '</div>' +
    '<button id="cloud-off" style="background:none; border:0; color:var(--text3); font-size:12px; margin-top:8px; padding:4px 0;">Turn off (your backup stays on GitHub)</button>';
  document.getElementById('cloud-now').onclick = (ev)=>{
    const b = ev.currentTarget; b.textContent = 'Saving…';
    cloudUpload().then(()=>{ cloudErr = ''; }).catch(e=>{ cloudErr = e.message; renderCloudRow(); });
  };
  document.getElementById('cloud-restore').onclick = ()=>{
    cloudRestore().catch(e=>{ alert(e.message || 'Could not put the backup back.'); });
  };
  document.getElementById('cloud-off').onclick = ()=>{
    if(!confirm('Stop backing up to GitHub? The copy already there is kept.')) return;
    CS.removeItem(CLOUD_TOKEN_K); renderCloudRow();
  };
}

const AUTO_LAST_K = 'coachautobackup';      // the day the on-device copy was taken
function snapshotToDevice(){
  const today = todayYMD();
  if(CS.getItem(AUTO_LAST_K) === today) return Promise.resolve(false);
  const payload = JSON.stringify(backupPayload());
  // Yesterday's copy is kept as well, so a bad day cannot overwrite the only
  // good one you had.
  return autoGet('latest')
    .then(prev=>prev ? autoPut('prev', prev) : null)
    .then(()=>autoPut('latest', {at: new Date().toISOString(), json: payload}))
    .then(()=>{ lsSet(AUTO_LAST_K, today); return true; })
    .catch(()=>false);
}
// The picked file, remembered between sessions. Handles survive in IndexedDB;
// they cannot be kept in localStorage, which is text only.
function autoFileSupported(){ return typeof window !== 'undefined' && !!window.showSaveFilePicker; }
function setupAutoFile(){
  if(!autoFileSupported()){
    alert('This browser cannot write a file on its own. COACH will ask you once a week instead, '+
          'and one tap saves over the same file.');
    return;
  }
  window.showSaveFilePicker({suggestedName: BACKUP_FILENAME,
      types: [{description:'COACH backup', accept:{'application/json':['.json']}}]})
    .then(h=>autoPut('handle', h))
    .then(()=>{ writeAutoFile(true); renderAutoBackupRow(); })
    .catch(()=>{});
}
function writeAutoFile(force){
  if(!autoFileSupported()) return Promise.resolve(false);
  return autoGet('handle').then(h=>{
    if(!h) return false;
    if(!force && CS.getItem(LASTBACKUP_KEY) === todayYMD()) return false;
    return h.queryPermission({mode:'readwrite'}).then(perm=>{
      if(perm !== 'granted') return false;
      return h.createWritable().then(w=>w.write(JSON.stringify(backupPayload())).then(()=>w.close()))
        .then(()=>{ lsSet(LASTBACKUP_KEY, todayYMD()); renderBackupNag(); return true; });
    });
  }).catch(()=>false);
}
// The copy inside the app, put back. Same restore path as a file, so there is
// only one piece of code that can ever overwrite your days.
function restoreFromDevice(which){
  autoGet(which || 'latest').then(snap=>{
    if(!snap || !snap.json){
      alert('There is no copy saved inside the app yet. It is written the first time you open COACH each day.');
      return;
    }
    const when = new Date(snap.at).toLocaleString();
    let data;
    try{ data = JSON.parse(snap.json); }catch(e){ alert('That copy could not be read.'); return; }
    const store = (data && data.store) || {};
    const n = Object.keys(store).length;
    if(!n){ alert('That copy is empty.'); return; }
    if(!confirm('Put back the copy taken on '+when+'?\n\n'+n+' items. Anything saved since, and not in the copy, is left alone.')) return;
    let failed = 0;
    Object.keys(store).forEach(k=>{ if(!lsSet(k, store[k])) failed++; });
    loadTargets();
    migrateCompletion(true);
    currentDate = new Date();
    renderDay(); renderStreak();
    alert(failed ? ('Put back '+(n-failed)+' of '+n+' items.') : ('Put back '+n+' items from '+when+'.'));
  }).catch(()=>alert('Could not read the copy inside the app.'));
}

function renderAutoBackupRow(){
  const el = document.getElementById('autobackup-note');
  if(!el) return;
  if(!autoFileSupported()){
    el.textContent = 'This browser cannot write files by itself, so COACH keeps a copy inside the app and asks you once a week to save the file.';
    return;
  }
  autoGet('handle').then(h=>{
    el.textContent = h
      ? 'On. COACH writes over the same file every day you open it.'
      : 'Off. Pick a file once and every backup after that happens on its own.';
  }).catch(()=>{});
}
function runAutoBackup(){
  try{
    snapshotToDevice();
    writeAutoFile(false);
  }catch(e){}
  try{ cloudDaily(); }catch(e){}
}

function exportJSON(){
  const store = {};
  // Enumerate the spec-correct way. CS.keys() is not guaranteed
  // to list stored keys, and the 'calorie' prefix alone silently skipped every
  // 'coach' key — so settings and the completion-migration flag were never in
  // the backup at all.
  for(let i=0;i<CS.length;i++){
    const k = CS.key(i);
    if(!k) continue;
    if(k.indexOf('coachcloud')===0) continue;
    if(k.indexOf('coachmusesync')===0) continue;   // v144: the Muse sync token and state never go into a backup
    if(k.indexOf('calorie')===0 || k.indexOf('coach')===0) store[k] = CS.getItem(k);
  }
  if(!Object.keys(store).length){
    alert('There is nothing saved to back up yet.');
    return;
  }
  const carried = loadCarry();
  // store stays at the top level: that is the shape every COACH before v43
  // wrote and can still read, so a shared file never locks out an old build.
  const payload = { __suite: SUITE_VERSION, __calorieapp: 1,
                    exported: new Date().toISOString(),
                    store: store, ledger: carried };
  const blob = new Blob([JSON.stringify(payload)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  lsSet(LASTBACKUP_KEY, todayYMD());
  // No date in the name, on purpose: saving over last week's file is a
  // Replace, and one current backup beats fifty stale ones.
  a.download = BACKUP_FILENAME;
  a.click();
}



