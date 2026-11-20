#!/usr/bin/env python3
"""Build COACH: python3 build.py  ->  dist/ (the live files) and index.preview.html (one-file copy for demos).
The app is kept in parts under src/. src/parts.txt lists them in order and the
build simply joins them, so the order in that file is the order on the page.
The food tables go into foods.<hash>.js and the UK packets into packets.<hash>.txt.
Their names change only when their contents change, so the phone keeps them
between app updates."""
import hashlib, json, os, shutil, sys, zipfile
H = os.path.dirname(os.path.abspath(__file__))
V = open(os.path.join(H, 'VERSION')).read().strip()
D = os.path.join(H, 'dist')
shutil.rmtree(D, ignore_errors=True); os.makedirs(D)
def h8(b): return hashlib.sha256(b).hexdigest()[:10]
data = {}
for n in ['LABEL_DB', 'LOCAL_FOODS', 'UK_BLOB', 'AU_BLOB', 'USDA_BLOB', 'EXERCISES', 'STRENGTH']:
    ext = 'json' if n in ('LABEL_DB', 'LOCAL_FOODS', 'EXERCISES', 'STRENGTH') else 'txt'
    t = open(os.path.join(H, 'data', n + '.' + ext), encoding='utf-8').read()
    if ext == 'json': json.loads(t)   # refuse to build broken JSON
    data[n] = t
js = ('window.COACH_DATA=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n').encode('utf-8')
foods = 'foods.' + h8(js) + '.js'
open(os.path.join(D, foods), 'wb').write(js)
pk = open(os.path.join(H, 'static', 'uk_packets.txt'), 'rb').read()
packets = 'packets.' + h8(pk) + '.txt'
open(os.path.join(D, packets), 'wb').write(pk)
S = os.path.join(H, 'src')
parts = [l.strip() for l in open(os.path.join(S, 'parts.txt')) if l.strip()]
on_disk = sorted(os.path.relpath(os.path.join(r, f), S).replace(os.sep, '/') for r, _, fs in os.walk(S) for f in fs if f != 'parts.txt')
assert sorted(parts) == on_disk, 'src/parts.txt and the files in src/ do not match: ' + str(set(parts) ^ set(on_disk))
APP = ''.join(open(os.path.join(S, n), encoding='utf-8').read() for n in parts)
app = APP
assert app.count('<!--COACH_DATA-->') == 1
app = app.replace('<!--COACH_DATA-->',
    '<script>window.COACH_PACKETS = "' + packets + '"; window.COACH_VERSION = "' + V + '";</script>\n'
    '<script src="' + foods + '"></script>')
open(os.path.join(D, 'index.html'), 'w', encoding='utf-8').write(app)
sw = open(os.path.join(H, 'sw.template.js'), encoding='utf-8').read()
sw = sw.replace('__VERSION__', V).replace('__DATA_ASSETS__', json.dumps(['./' + foods, './' + packets]))
open(os.path.join(D, 'sw.js'), 'w', encoding='utf-8').write(sw)
for f in os.listdir(os.path.join(H, 'static')):
    if f != 'uk_packets.txt': shutil.copy(os.path.join(H, 'static', f), D)
# Kept under its old name too, for any copy of the app that still asks for it.
shutil.copy(os.path.join(H, 'static', 'uk_packets.txt'), D)
# One-file copy with the data inside, for previewing in a chat (not for deploying).
blocks = ''.join('<script type="text/plain" id="d-' + n + '">' + data[n] + '</script>\n' for n in data)
solo = APP.replace('<!--COACH_DATA-->',
    '<script>window.COACH_VERSION = "' + V + '";</script>\n' + blocks)
open(os.path.join(H, 'index.preview.html'), 'w', encoding='utf-8').write(solo)
print('built v' + V, foods, packets, '-> dist/')
