const V="slovopad-v1",A=["./","index.html","manifest.webmanifest","icon-192.png","icon-512.png","apple-touch-icon.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(A)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{const r=e.request;if(r.method!=="GET"||new URL(r.url).origin!==location.origin)return;
e.respondWith(caches.match(r).then(h=>{const n=fetch(r).then(x=>{if(x&&x.ok){const c=x.clone();caches.open(V).then(ch=>ch.put(r,c))}return x}).catch(()=>h);return h||n}))});
