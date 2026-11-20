#!/usr/bin/env python3
"""Build demo/coach_demo.html from index.preview.html: 90 days of example data
(seed_body.js) and the "Try" buttons (tryit.js)."""
import os
H = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(H)
app = open(os.path.join(R, 'index.preview.html'), encoding='utf-8').read()
V = open(os.path.join(R, 'VERSION')).read().strip()
seed = open(os.path.join(H, 'seed_body.js'), encoding='utf-8').read()
tryit = open(os.path.join(H, 'tryit.js'), encoding='utf-8').read()
inject = '''<script>
''' + seed + '''
''' + tryit + '''
(function(){
  function ready(f){ var t = setInterval(function(){ if(typeof saveEntries === 'function' && typeof renderDay === 'function' && window.CS){ clearInterval(t); f(); } }, 100); }
  ready(function(){
    var has = window.CS.keys().some(function(k){ return k.indexOf('calorielog:') === 0; });
    if(!has){ try{ SEED(); }catch(e){} (CS.whenSaved ? CS.whenSaved() : Promise.resolve()).then(function(){ location.reload(); }); return; }
    var bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:100000;display:flex;gap:6px;overflow-x:auto;padding:8px;background:rgba(10,11,14,.92);border:1px solid #2a2f38;border-radius:14px;font:600 12px system-ui';
    var t = document.createElement('span'); t.textContent = 'Try v''' + V + ''':'; t.style.cssText = 'color:#7fe0b0;align-self:center;white-space:nowrap;padding:0 4px'; bar.appendChild(t);
    (window.TRYIT || []).forEach(function(b){ var x = document.createElement('button'); x.textContent = b[0];
      x.style.cssText = 'white-space:nowrap;background:#1a1d23;color:#e9ecf1;border:1px solid #2a2f38;border-radius:10px;padding:8px 10px;font:inherit';
      x.onclick = function(){ document.querySelectorAll('.sheet-backdrop.open').forEach(function(s){ try{ closeSheet(s.id); }catch(e){} }); setTimeout(b[1], 350); }; bar.appendChild(x); });
    document.body.appendChild(bar);
  });
})();
</script>
'''
i = app.rindex('</body>')
open(os.path.join(H, 'coach_demo.html'), 'w', encoding='utf-8').write(app[:i] + inject + app[i:])
print('demo ->', os.path.join(H, 'coach_demo.html'))
