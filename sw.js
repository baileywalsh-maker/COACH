const CACHE = 'coach-v151';
// v132: the food tables and the UK packets sit in their own cache, which is
// kept from one app version to the next. Their file names change only when
// their contents do, so an app update no longer downloads ~7 MB again.
const DATA_CACHE = 'coach-data';
const DATA_ASSETS = ["./foods.b9a7754327.js", "./packets.cca60f15fc.txt"];
// The barcode library now ships with the app rather than loading from a CDN,
// so it is a normal first-party asset and cannot fail independently.
const ASSETS = ['./index.html', './manifest.json', './zxing.js', './icon-180.png', './icon-192.png', './icon-512.png'];
const EXTRA = [];

self.addEventListener('install', e=>{
  e.waitUntil(
    caches.open(CACHE).then(async c=>{
      await c.addAll(ASSETS);
      // Only the data files this version does not already have are fetched.
      const dc = await caches.open(DATA_CACHE);
      for(const u of DATA_ASSETS){ if(!(await dc.match(u))) await dc.add(u); }
      // Best effort: a third-party fetch failing must not break the install.
      await Promise.all(EXTRA.map(u=>c.add(u).catch(()=>{})));
    }).then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate', e=>{
  e.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE && k!==DATA_CACHE).map(k=>caches.delete(k))))
      // Old data files this version no longer uses.
      .then(()=>caches.open(DATA_CACHE)).then(dc=>dc.keys().then(reqs=>Promise.all(reqs.map(r=>{
        const p = './' + new URL(r.url).pathname.split('/').pop();
        return DATA_ASSETS.indexOf(p) >= 0 ? null : dc.delete(r);
      }))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch', e=>{
  const url = new URL(e.request.url);
  if(e.request.method !== 'GET') return;

  // Live data — never cache.
  if(url.hostname.includes('openfoodfacts')) return;

  // App shell (HTML): network-first, so a redeploy lands immediately when online.
  // Falls back to cache when offline.
  const isDoc = e.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/';
  if(isDoc){
    e.respondWith(
      fetch(e.request)
        .then(res=>{
          // fetch() resolves for 402, 404, 503 and every other error status, so
          // without this check a paused host or a billing wall gets cached over
          // the app and served from then on, offline, forever. Only a response
          // the server actually called OK is allowed to replace the shell.
          if(!res || !res.ok) throw new Error('bad shell response ' + (res && res.status));
          const clone = res.clone();
          caches.open(CACHE).then(c=>c.put('./index.html', clone));
          return res;
        })
        // Offline, or the server returned something that is not the app: keep
        // running the last good copy rather than replacing it with an error.
        .catch(()=>caches.match('./index.html').then(hit=> hit || Response.error()))
    );
    return;
  }

  // Data files: named by their contents, so the cached copy is always right.
  const file = './' + url.pathname.split('/').pop();
  if(DATA_ASSETS.indexOf(file) >= 0){
    e.respondWith(caches.open(DATA_CACHE).then(dc=>dc.match(e.request, {ignoreSearch:true}).then(hit=> hit || fetch(e.request).then(res=>{
      if(res && res.ok){ const c = res.clone(); dc.put(e.request, c); }
      return res;
    }))));
    return;
  }

  // Everything else (icons, CDN fonts, libraries): cache-first, refreshed in background.
  e.respondWith(
    caches.match(e.request).then(hit=>{
      const network = fetch(e.request).then(res=>{
        if(res && (res.ok || res.type==='opaque')){
          const clone = res.clone();
          caches.open(CACHE).then(c=>c.put(e.request, clone));
        }
        return res;
      }).catch(()=> hit || Response.error());   // never resolve to undefined
      return hit || network;
    })
  );
});

self.addEventListener('message', e=>{
  if(e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('push', e=>{
  let data = {title:'Morning weigh-in', body:'Log your weight to keep your targets accurate.'};
  try{ if(e.data) data = e.data.json(); }catch(err){}
  e.waitUntil(self.registration.showNotification(data.title, {body:data.body}));
});
