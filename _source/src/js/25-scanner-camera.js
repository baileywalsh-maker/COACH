// ---- Camera: held only while the scanner is actually open ----
// This used to be acquired once and kept for the whole session, so that
// reopening the scanner never re-prompted for permission. The cost was that the
// iPhone recording indicator stayed lit for as long as the app was resident —
// on a home-screen PWA, days — with nothing being scanned. An indicator that
// says the camera is on when it is not is worse than an extra prompt, so the
// stream is now released the moment the scan sheet closes.
async function ensureStream(){
  if(stream && stream.active && stream.getVideoTracks().some(t=>t.readyState==='live')){
    clearTimeout(parkTimer); parkTimer = null;
    try{ stream.getVideoTracks().forEach(t=>{ t.enabled = true; }); }catch(e){}
    return stream;
  }
  // Whatever is here is being replaced, so stop it first. Reassigning `stream`
  // over a partly-live one orphans its tracks: nothing can reach them to stop
  // them afterwards, and the indicator stays on with no way to put it out.
  if(stream){
    try{ stream.getTracks().forEach(t=>{ try{ t.stop(); }catch(e){} }); }catch(e){}
    stream = null;
  }
  stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: 'environment' },
      // A barcode is small in frame; asking for more pixels makes 1D decoding
      // far more reliable than the default low-resolution stream.
      width:  { ideal: 1280 },
      height: { ideal: 720 }
    },
    audio: false
  });
  tuneTrack(stream);
  return stream;
}

// Continuous autofocus where the phone offers it (most Android phones do; an
// iPhone focuses by itself), and a torch button where there is a torch.
// Both are best-effort: a phone that refuses just carries on as before.
let torchOn = false;
function tuneTrack(st){
  const btn = document.getElementById('scan-torch');
  torchOn = false;
  if(btn){ btn.hidden = true; btn.classList.remove('on'); }
  try{
    const t = st.getVideoTracks()[0];
    const c = (t && t.getCapabilities) ? t.getCapabilities() : {};
    if(c.focusMode && c.focusMode.indexOf('continuous') >= 0){
      t.applyConstraints({advanced: [{focusMode: 'continuous'}]}).catch(()=>{});
    }
    if(c.torch && btn){
      btn.hidden = false;
      btn.onclick = ()=>{
        torchOn = !torchOn;
        t.applyConstraints({advanced: [{torch: torchOn}]})
          .then(()=>btn.classList.toggle('on', torchOn))
          .catch(()=>{ torchOn = false; btn.hidden = true; });
      };
    }
  }catch(e){}
}

// Stopping every track is the ONLY thing that puts the hardware indicator out.
// Pausing the video element, or setting track.enabled = false, leaves the camera
// running and the light on.
// v131: closing the scanner parks the camera instead of shutting it. Scanning
// again within a minute reuses it, so iPhone does not ask for permission again
// between items. After a minute, or as soon as the app is put away, it is shut
// properly and the camera light goes out.
let parkTimer = null;
function parkCamera(){
  pauseDecoding();
  const video = document.getElementById('scan-video');
  if(video){ try{ video.pause(); }catch(e){} }
  if(stream){ try{ stream.getVideoTracks().forEach(t=>{ t.enabled = false; }); }catch(e){} }
  clearTimeout(parkTimer);
  parkTimer = setTimeout(releaseCamera, 60000);
}
function releaseCamera(){
  clearTimeout(parkTimer); parkTimer = null;
  pauseDecoding();
  const video = document.getElementById('scan-video');
  // Detaching is what releases the element's hold on the stream. Do not add a
  // video.pause() here: it is not needed once srcObject is null, and any
  // in-flight play() promise is already caught at every call site.
  if(video){ try{ video.srcObject = null; }catch(e){} }
  if(stream){
    stream.getTracks().forEach(t=>{ try{ t.stop(); }catch(e){} });
    stream = null;
  }
}
// Belt and braces: also release when the app is backgrounded or closed, in case
// the scanner was open at the time.
document.addEventListener('visibilitychange', ()=>{ if(document.hidden) releaseCamera(); });
window.addEventListener('pagehide', releaseCamera);

function scanMsg(html){ document.getElementById('scan-status').innerHTML = html; }

// Opening the scanner from the Add sheet keeps the meal already chosen there.
// Opening it from the action bar has nothing to go on, so it guesses from the
// clock — and either way the portion sheet shows the answer before it logs.
document.getElementById('tab-to-scan').onclick = ()=>{
  closeSheet('add-backdrop');
  setTimeout(()=>startScan(false), HANDOFF);
};

document.getElementById('open-scan').onclick = ()=> startScan(true);

// A short beep on a read. It has to be unlocked inside the tap that opened the
// scanner - iPhones refuse sound that starts any other way.
let scanAudio = null;
function unlockScanAudio(){
  try{
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return;
    if(!scanAudio) scanAudio = new AC();
    if(scanAudio.state === 'suspended') scanAudio.resume().catch(()=>{});
  }catch(e){}
}
function scanFeedback(){
  const wrap = document.getElementById('scan-wrap');
  if(wrap){ wrap.classList.add('hit'); setTimeout(()=>wrap.classList.remove('hit'), 900); }
  try{ if(navigator.vibrate) navigator.vibrate(40); }catch(e){}
  if(soundOn()){ sfx('scan'); return; }
  try{
    if(!scanAudio || scanAudio.state !== 'running') return;
    const t0 = scanAudio.currentTime;
    const o = scanAudio.createOscillator(), g = scanAudio.createGain();
    o.type = 'sine'; o.frequency.value = 1800;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);
    o.connect(g); g.connect(scanAudio.destination);
    o.start(t0); o.stop(t0 + 0.12);
  }catch(e){}
}

async function startScan(guess){
  unlockScanAudio();
  if(guess) selectMeal(guessMeal());
  openSheet('scan-backdrop');
  document.getElementById('scan-result').innerHTML = '';
  const video = document.getElementById('scan-video');

  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    scanMsg('This browser cannot use the camera. Type the barcode below.');
    return;
  }

  scanMsg('Starting camera...');
  try{
    await ensureStream();
  }catch(err){
    const n = err && err.name;
    scanMsg(
      n==='NotAllowedError' || n==='SecurityError' ? 'Camera permission denied. Allow it in your browser settings, or type the barcode below.' :
      n==='NotFoundError' ? 'No camera on this device. Type the barcode below.' :
      n==='NotReadableError' ? 'Another app is using the camera. Close it and try again.' :
      (location.protocol !== 'https:' && location.hostname !== 'localhost') ? 'The camera needs a secure (https) connection.' :
      'Could not start the camera. Type the barcode below.'
    );
    return;
  }

  scanTrace = [];
  scanDiag('stream ok');
  scanDiag('lib:' + (typeof ZXing !== 'undefined' ? 'loaded' : 'MISSING'));
  scanDiag('native:' + ('BarcodeDetector' in window ? 'yes' : 'no'));

  // ZXing's reset() may have detached the stream on a previous run.
  if(video.srcObject !== stream) video.srcObject = stream;
  video.setAttribute('playsinline','');
  video.muted = true;
  try{ await video.play(); }catch(e){ scanDiag('play failed: '+(e && e.name)); }

  // Decoding a video with no dimensions yet silently fails forever, which is
  // what made the scanner look broken: the sheet animates in while the first
  // frame is still arriving.
  if(!video.videoWidth){
    await new Promise(res=>{
      let done = false;
      const go = ()=>{ if(!done){ done = true; res(); } };
      video.addEventListener('loadedmetadata', go, {once:true});
      setTimeout(go, 2500);
    });
  }

  scanDiag('video ' + video.videoWidth + 'x' + video.videoHeight);
  startDecoding(video);
}

// A short trace of what the scanner actually did, shown only when diagnostics
// are switched on in settings. Turns "it doesn't work" into a specific stage.
let scanTrace = [];
function scanDiag(msg){
  scanTrace.push(msg);
  if(scanTrace.length > 12) scanTrace.shift();
  const el = document.getElementById('scan-diag');
  if(!el) return;
  const on = CS.getItem('coachscandiag') === '1';
  el.style.display = on ? 'block' : 'none';
  if(on) el.textContent = scanTrace.join(' → ');
}

let lastCode = null, lastCodeAt = 0;
// v131: on iPhone (the ZXing reader) a barcode has to read the same twice in a
// row before it counts. A blurred frame can decode as a different, valid-
// looking number - this is what sometimes brought up the wrong product.
let pendingRead = null, pendingReadAt = 0;
function onCode(text, needConfirm){
  if(!text) return false;
  text = String(text);
  const now = Date.now();
  if(missedCodes.has(text)) return false;                       // known not-found: keep looking
  if(text === lastCode && now - lastCodeAt < 4000) return false; // the same code re-read
  if(needConfirm){
    if(pendingRead !== text || now - pendingReadAt > 1500){ pendingRead = text; pendingReadAt = now; return false; }
  }
  pendingRead = null;
  lastCode = text; lastCodeAt = now;
  pauseDecoding();
  scanFeedback();
  lookupBarcode(text);
  return true;
}

function startDecoding(video){
  // Decoder 1 — native, on Android and desktop Chrome.
  if('BarcodeDetector' in window){
    try{
      detector = new BarcodeDetector({
        formats: ['ean_13','ean_8','upc_a','upc_e','code_128','code_39','itf']
      });
      scanMsg('Point at a barcode');
      // Twice as often as before, and never two reads at once: a slow frame
      // used to queue the next one behind it.
      let busy = false;
      scanLoop = setInterval(async ()=>{
        if(busy || video.readyState < 2 || !video.videoWidth) return;
        busy = true;
        try{
          const codes = await detector.detect(video);
          if(codes && codes.length) onCode(codes[0].rawValue);
        }catch(e){}
        busy = false;
      }, 150);
      return;
    }catch(e){ detector = null; }
  }

  // Decoder 2 — ZXing, which is what iOS actually uses.
  //
  // We do NOT use BrowserMultiFormatReader's own video helpers. Two of them
  // are traps, both verified against the library source:
  //   1. decodeFromVideoElement(el, cb) is the ONE-SHOT method and silently
  //      ignores the callback — the old code used it for continuous scanning,
  //      so a scan could never be reported. This alone made the scanner dead.
  //   2. decodeFromVideoElementContinuously() waits on its own playback
  //      lifecycle, and tryPlayVideo() returns early when the video is already
  //      playing. We start playback ourselves, so the 'playing' event it waits
  //      for has already fired and its promise never resolves.
  // Instead we own the frame grab and call the core reader directly, with a
  // fresh decode each frame rather than decodeWithState().
  if(typeof ZXing !== 'undefined' && ZXing.MultiFormatReader){
    try{
      const F = ZXing.BarcodeFormat, D = ZXing.DecodeHintType;
      const hints = new Map();
      // Restricting formats keeps it off 2D symbologies; TRY_HARDER matters
      // most — without it a real product barcode often will not resolve.
      hints.set(D.POSSIBLE_FORMATS, [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.ITF]);
      hints.set(D.TRY_HARDER, true);

      const reader = new ZXing.MultiFormatReader();
      reader.setHints(hints);

      const canvas = document.createElement('canvas');
      const cx = canvas.getContext('2d', { willReadFrequently: true });

      zxingReader = { reader, stop(){ this._stopped = true; }, _stopped:false };
      scanMsg('Point at a barcode');
      scanDiag('zxing running');

      // The old loop decoded the whole 1280x720 frame every 200 ms, most of
      // it outside the square you can see. Now: the strip inside the aiming
      // box, scaled to at most 720 px, about every 70 ms - several times the
      // reads per second on an iPhone. Every fourth frame still looks at the
      // whole visible square, for a barcode held off-centre or turned.
      let frameN = 0;
      const tick = ()=>{
        if(!zxingReader || zxingReader._stopped) return;
        try{
          const vw = video.videoWidth, vh = video.videoHeight;
          if(vw && vh){
            const side = Math.min(vw, vh);                // the square the sheet shows
            const whole = (frameN++ % 4) === 3;
            const sw = side, sh = whole ? side : Math.round(side * 0.5);
            const sx = Math.round((vw - sw) / 2), sy = Math.round((vh - sh) / 2);
            const k = Math.min(1, 720 / sw);
            const dw = Math.round(sw * k), dh = Math.round(sh * k);
            if(canvas.width !== dw || canvas.height !== dh){ canvas.width = dw; canvas.height = dh; }
            cx.drawImage(video, sx, sy, sw, sh, 0, 0, dw, dh);
            const src = new ZXing.HTMLCanvasElementLuminanceSource(canvas);
            const bmp = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(src));
            // decode() re-applies hints each call, so no state carries over
            // between frames the way decodeWithState() lets it.
            const res = reader.decode(bmp, hints);
            if(res){
              scanDiag('decoded');
              // Only stop the loop once a read has actually been accepted.
              if(onCode(res.getText ? res.getText() : res.text, true)) return;
            }
          }
        }catch(e){ /* NotFoundException on most frames — expected */ }
        scanLoop = setTimeout(tick, 70);
      };
      tick();
      return;
    }catch(e){
      scanDiag('zxing threw: '+(e && e.message ? e.message : e));
      scanMsg('Scanner could not start. Type the barcode below.');
      return;
    }
  }

  scanMsg('Scanner library did not load. Check your connection, or type the barcode below.');
}

function pauseDecoding(){
  // scanLoop is a setInterval for the native detector and a setTimeout for the
  // ZXing loop; clearing both is harmless and covers either.
  if(scanLoop){ clearInterval(scanLoop); clearTimeout(scanLoop); scanLoop = null; }
  if(zxingReader){
    try{ zxingReader.stop(); }catch(e){}
    zxingReader = null;
  }
}

// The stream is now released on close, so resuming has to be able to acquire a
// new one rather than assuming the old one is still alive.
async function resumeDecoding(){
  const video = document.getElementById('scan-video');
  if(!video) return;
  if(!document.getElementById('scan-backdrop').classList.contains('open')) return;
  try{
    await ensureStream();
  }catch(e){
    scanMsg('Could not restart the camera. Type the barcode below.');
    return;
  }
  if(video.srcObject !== stream){
    video.srcObject = stream;
    video.setAttribute('playsinline','');
    video.muted = true;
  }
  // A parked camera has its video paused, so always start it again.
  try{ await video.play(); }catch(e){}
  if(document.getElementById('scan-backdrop').classList.contains('open')){
    startDecoding(video);
  }
}

// "Stop scanning" means stop scanning — camera included. Every existing caller
// (backdrop tap, drag-to-dismiss, a successful lookup, the scan-miss screen)
// wants the camera off, and none of them wanted it left running.
function stopScan(){ parkCamera(); }
document.getElementById('scan-backdrop').addEventListener('click', e=>{
  if(e.target.id === 'scan-backdrop') barcodeLinkCb = null;
});

