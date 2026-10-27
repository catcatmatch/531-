const CACHE='531-train-cache-v3-60m-roundtrip';
const STATIC=['./','./index.html','./style.css','./logic.js','./app.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(STATIC)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()]));
});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET')return;
 if(new URL(req.url).origin!==self.location.origin)return;
 event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(res=>{
   const copy=res.clone();if(res.ok)caches.open(CACHE).then(cache=>cache.put(req,copy));return res;
 }).catch(()=>caches.match('./index.html'))));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>cs.length?cs[0].focus():self.clients.openWindow('./index.html')));
});
