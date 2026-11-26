/* Scoped offline bundle. Personal records remain in localStorage. */
const PREFIX='531-train:'+self.registration.scope+':';
const CACHE=PREFIX+'v6.0.0';
const STATIC=['./','./index.html','./style.css','./logic.js','./model.js','./app.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
const ASSETS=new Set(STATIC.map(path=>new URL(path,self.registration.scope).href));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(STATIC)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))),self.clients.claim()])));
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET'||!ASSETS.has(req.url))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  try{const response=await fetch(req);if(response.ok)await cache.put(req,response.clone());return response;}
  catch(error){return await cache.match(req)||(req.mode==='navigate'?await cache.match('./index.html'):null)||Response.error();}
 })());
});
