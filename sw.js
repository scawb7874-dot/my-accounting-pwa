const CACHE_NAME="accounting-pwa-v7";

const FILES_TO_CACHE=[
  "./",
  "./index.html",
  "./style.css?v=7",
  "./app.js?v=7",
  "./manifest.json?v=7"
];

self.addEventListener("install",event=>{
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache=>cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys
        .filter(key=>key!==CACHE_NAME)
        .map(key=>caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;

  event.respondWith(
    fetch(event.request,{cache:"no-store"})
      .then(response=>{
        if(response&&response.ok){
          const copy=response.clone();
          caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));
        }
        return response;
      })
      .catch(async()=>{
        const cached=await caches.match(event.request);
        return cached||caches.match("./index.html");
      })
  );
});
