const CACHE="rutina30-v11";

const CORE=[
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./backend-client.js",
  "./onboarding.js",
  "./onboarding.css",
  "./manifest.webmanifest",

  "./assets/D01_05_IMAGEN.jpg",
  "./assets/D01_06_IMAGEN.jpg",
  "./assets/D01_07_IMAGEN.jpg",

  "./assets/D02_05_IMAGEN.jpg",
  "./assets/D02_06_IMAGEN.jpg",
  "./assets/D02_07_IMAGEN.jpg",
  "./assets/D02_08_IMAGEN.jpg",
  "./assets/D02_09_IMAGEN.jpg",
  "./assets/D02_10_IMAGEN.jpg",
  "./assets/D02_11_IMAGEN.jpg",

  "./assets/D03_05_IMAGEN.jpg",
  "./assets/D03_06_IMAGEN.jpg",
  "./assets/D03_07_IMAGEN.jpg",
  "./assets/D03_08_IMAGEN.jpg",
  "./assets/D03_09_IMAGEN.jpg",
  "./assets/D03_10_IMAGEN.jpg",

  "./assets/D04_04_IMAGEN.jpg",
  "./assets/D04_05_IMAGEN.jpg",
  "./assets/D04_06_IMAGEN.jpg",
  "./assets/D04_07_IMAGEN.jpg",
  "./assets/D04_08_IMAGEN.jpg",

  "./assets/D05_02_IMAGEN.jpg",
  "./assets/D05_03_IMAGEN.jpg",
  "./assets/D05_04_IMAGEN.jpg",
  "./assets/D05_05_IMAGEN.jpg",
  "./assets/D05_06_IMAGEN.jpg",

  "./assets/D06_03_IMAGEN.jpg",
  "./assets/D06_04_IMAGEN.jpg",
  "./assets/D06_05_IMAGEN.jpg",
  "./assets/D06_06_IMAGEN.jpg",
  "./assets/D06_07_IMAGEN.jpg",

  "./assets/D07_04_IMAGEN.jpg",
  "./assets/D07_05_IMAGEN.jpg",
  "./assets/D07_06_IMAGEN.jpg"
];

self.addEventListener("install",event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(cache=>cache.addAll(CORE))
  );

  self.skipWaiting();
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys().then(keys=>
      Promise.all(
        keys
          .filter(k=>k!==CACHE)
          .map(k=>caches.delete(k))
      )
    )
  );

  self.clients.claim();
});

self.addEventListener("fetch",event=>{
  const req=event.request;

  if(req.method!=="GET") return;

  // Para páginas HTML/navegaciones usamos network-first.
  // Esto evita que la URL base quede mostrando un index.html viejo
  // mientras una URL con ?demo=1 carga la versión nueva.
  if(req.mode==="navigate"){
    event.respondWith(
      fetch(req)
        .then(res=>{
          const copy=res.clone();

          caches.open(CACHE)
            .then(cache=>cache.put("./index.html",copy));

          return res;
        })
        .catch(()=>
          caches.match("./index.html")
            .then(cached=>cached || caches.match("./"))
        )
    );

    return;
  }

  // Para assets usamos cache-first y guardamos lo que falte.
  event.respondWith(
    caches.match(req).then(cached=>
      cached ||
      fetch(req).then(res=>{
        const copy=res.clone();

        caches.open(CACHE)
          .then(cache=>cache.put(req,copy));

        return res;
      })
    )
  );
});
