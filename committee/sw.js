const cacheName='midas-shell-12';
const files=['./','./index.html','./app.js','./model.js','./storage.js','./forms.js','./media.js','./style.css','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(cacheName);
  await cache.addAll(files);
  const response=await fetch('./deployment.json',{cache:'no-store'});
  if(response.ok&&(await response.clone().json()).mode==='demo') await cache.put('./deployment.json',response);
})()));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('midas-shell-')&&key!==cacheName).map(key=>caches.delete(key))))));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==location.origin) return;
  if(url.href===new URL('./deployment.json',self.registration.scope).href){
    event.respondWith(fetch(event.request).then(async response=>{
      if(response.ok && (await response.clone().json()).mode==='demo') {
        await (await caches.open(cacheName)).put(event.request,response.clone());
      } else { await (await caches.open(cacheName)).delete(event.request); }
      return response;
    }).catch(async()=>await caches.match(event.request)||Response.error()));
    return;
  }
  if(event.request.mode==='navigate'&&files.slice(0,2).some(file=>new URL(file,self.registration.scope).pathname===url.pathname)) {
    event.respondWith(fetch(event.request).catch(()=>caches.match('./index.html')));
    return;
  }
  if(files.some(file=>new URL(file,self.registration.scope).href===url.href)){
    event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request)));
  }
});
