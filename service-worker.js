const CACHE="rutina30-v35-9-1-notif-time-sync";

const CORE=[
  "./",
  "./index.html",
  "./styles.css?v=35-8-publicacion-fixes",
  "./app.js?v=35-9-1-notif-time-sync",
  "./backend-client.js?v=35-9-notif-identity",
  "./push-client.js?v=35-9-1-notif-time-sync",
  "./onboarding.js?v=35-9-notif-identity",
  "./onboarding.css?v=35-2-verified",
  "./manifest.webmanifest?v=35-8-publicacion-fixes",

  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",

  "./assets/D01_05_IMAGEN.jpg",
  "./assets/D01_06_IMAGEN.jpg",
  "./assets/D01_07_IMAGEN.jpg",
  "./assets/D01_08_VIDEO.mp4",

  "./assets/D02_05_IMAGEN.jpg",
  "./assets/D02_06_IMAGEN.jpg",
  "./assets/D02_07_IMAGEN.jpg",
  "./assets/D02_08_IMAGEN.jpg",
  "./assets/D02_09_IMAGEN.jpg",
  "./assets/D02_10_IMAGEN.jpg",
  "./assets/D02_11_IMAGEN.jpg",
  "./assets/D02_03_VIDEO.mp4",

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
  "./assets/D04_09_VIDEO.mp4",

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
  "./assets/D06_08_VIDEO.mp4",

  "./assets/D07_04_IMAGEN.jpg",
  "./assets/D07_05_IMAGEN.jpg",
  "./assets/D07_06_IMAGEN.jpg",
  "./assets/D07_03_VIDEO.mp4",
  "./assets/D07_07_VIDEO.mp4"
];

self.addEventListener("install",event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(async cache=>{
        const results = await Promise.allSettled(
          CORE.map(url=>cache.add(url))
        );

        results.forEach((result,index)=>{
          if(result.status==="rejected"){
            console.warn(
              "[service-worker] No se pudo precachear:",
              CORE[index],
              result.reason
            );
          }
        });
      })
      .then(()=>self.skipWaiting())
  );
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
self.addEventListener(
  "push",
  event => {
    let data = {
      title:
        "Rutina 30 Días",
      body:
        "Tenés una nueva actualización.",
      url: "/"
    };

    if (event.data) {
      try {
        data = {
          ...data,
          ...event.data.json()
        };
      } catch (error) {
        data.body =
          event.data.text();
      }
    }

    const tasks = [
      self.registration
        .showNotification(
          data.title,
          {
            body:
              data.body,
            data: {
              url:
                data.url || "/"
            },
            tag:
              data.tag ||
              "rutina30",
            renotify: true
          }
        )
    ];

    // iOS/iPadOS Home Screen web apps soportan Badging API.
    // Si está disponible, marcamos que hay una acción nueva.
    if (
      self.navigator &&
      "setAppBadge" in
        self.navigator
    ) {
      tasks.push(
        self.navigator
          .setAppBadge(1)
          .catch(() => {})
      );
    }

    event.waitUntil(
      Promise.all(tasks)
    );
  }
);

self.addEventListener(
  "notificationclick",
  event => {
    event.notification.close();

    if (
      self.navigator &&
      "clearAppBadge" in
        self.navigator
    ) {
      self.navigator
        .clearAppBadge()
        .catch(() => {});
    }

    const targetUrl =
      new URL(
        event.notification
          .data?.url || "/",
        self.location.origin
      ).href;

    event.waitUntil(
      clients
        .matchAll({
          type: "window",
          includeUncontrolled:
            true
        })
        .then(
          windowClients => {
            for (
              const client of
              windowClients
            ) {
              if (
                "focus" in client
              ) {
                client.navigate(
                  targetUrl
                );

                return client
                  .focus();
              }
            }

            if (
              clients.openWindow
            ) {
              return clients
                .openWindow(
                  targetUrl
                );
            }

            return null;
          }
        )
    );
  }
);
