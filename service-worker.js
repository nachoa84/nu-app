const CACHE="nuapp-v92d-material-titles";

const CORE=[
  "./",
  "./index.html",
  "./tokens.css?v=61b-progress-canonical",
  "./base.css?v=61b-progress-canonical",
  "./splash.css?v=61b-progress-canonical",
  "./splash.js?v=61b-progress-canonical",
  "./navigation.css?v=81-home-navigation-legibility",
  "./daily.css?v=83-routine-progress-legibility",
  "./progress.css?v=83-routine-progress-legibility",
  "./media-preview.css?v=85a-media-legibility",
  "./shared.css?v=87-shared-ui-legibility",
  "./ui-core.css?v=87-shared-ui-legibility",
  "./notifications.css?v=86-notifications-legibility",
  "./home.css?v=81-home-navigation-legibility",
  "./shell.css?v=61b-progress-canonical",
  "./bot.css?v=80-bot-legibility",
  "./favorites.css?v=84-favorites-legibility",
  "./bot-content.js?v=79-loi-navegacion",
  "./ui-core.js?v=63e-ios-thumbnails",
  "./routine-content.js?v=61b-progress-canonical",
  "./routine-content-collagen-8-30.js?v=63-collagen-30",
  "./routine-products-v92.js?v=92c-multiroutine-polish",
  "./multiroutine-v92.css?v=92c-multiroutine-polish",
  "./routine-state.js?v=61b-progress-canonical",
  "./routine-sync.js?v=61b-progress-canonical",
  "./bot.js?v=68-tramites-espana",
  "./favorites.js?v=63e-ios-thumbnails",
  "./notifications.js?v=61b-progress-canonical",
  "./home-view.js?v=61b-progress-canonical",
  "./daily-view.js?v=92d-material-titles",
  "./progress-view.js?v=63-collagen-30",
  "./media-preview.js?v=63e-ios-thumbnails",
  "./app.js?v=63e-ios-thumbnails",
  "./backend-client.js?v=61b-progress-canonical",
  "./push-client.js?v=61b-progress-canonical",
  "./onboarding.js?v=61b-progress-canonical",
  "./onboarding.css?v=88-onboarding-legibility",
  "./guide.css?v=82-guide-legibility",
  "./guide-content.js?v=61c-guide-prototype",
  "./guide-view.js?v=61e-guide-home-sections",
  "./manifest.webmanifest?v=61b-progress-canonical",
  "./assets/guide/logo-nu-comunidad-transparent.png",
  "./assets/guide/community/community-01.jpg",
  "./assets/guide/community/community-02.jpg",
  "./assets/guide/community/community-03.jpg",
  "./assets/guide/community/community-04.jpg",
  "./assets/guide/community/community-05.jpg",
  "./assets/custom/nu-write-v2.mp4",
  "./assets/custom/nu-write-v2-poster.png",
  "./assets/custom/nu-app-word-v51.png",

  "./icons/nuapp-favicon-32.png?v=61b-progress-canonical",
  "./icons/nuapp-favicon-48.png?v=61b-progress-canonical",
  "./icons/nuapp-apple-180.png?v=61b-progress-canonical",
  "./icons/nuapp-icon-192.png?v=61b-progress-canonical",
  "./icons/nuapp-icon-512.png?v=61b-progress-canonical",
  "./icons/nuapp-maskable-512.png?v=61b-progress-canonical",
  "./assets/custom/routine-collagen-home.png",
  "./assets/custom/routine-lumispa-home.png",
  "./assets/custom/routine-pharmanex-home.png",
  "./assets/custom/collagen-day-hero.jpg",
  "./assets/D01_05_IMAGEN.jpg",
  "./assets/D01_06_IMAGEN.jpg",
  "./assets/D01_07_IMAGEN.jpg",
  "./assets/D01_08_VIDEO_POSTER.webp",

  "./assets/D02_05_IMAGEN.jpg",
  "./assets/D02_06_IMAGEN.jpg",
  "./assets/D02_07_IMAGEN.jpg",
  "./assets/D02_08_IMAGEN.jpg",
  "./assets/D02_09_IMAGEN.jpg",
  "./assets/D02_10_IMAGEN.jpg",
  "./assets/D02_11_IMAGEN.jpg",
  "./assets/D02_03_VIDEO_POSTER.webp",

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
  "./assets/D04_09_VIDEO_POSTER.webp",

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
  "./assets/D06_08_VIDEO_POSTER.webp",

  "./assets/D07_04_IMAGEN.jpg",
  "./assets/D07_05_IMAGEN.jpg",
  "./assets/D07_06_IMAGEN.jpg",
  "./assets/D07_03_VIDEO_POSTER.webp",
  "./assets/D07_07_VIDEO_POSTER.webp"
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

function parseByteRange(rangeHeader, totalSize) {
  if (
    !rangeHeader ||
    !rangeHeader.toLowerCase().startsWith("bytes=") ||
    !Number.isFinite(totalSize) ||
    totalSize <= 0
  ) {
    return null;
  }

  // Los reproductores de Safari/iOS usan un rango por request.
  // Si alguna vez llega una petición multipart, atendemos el primer rango.
  const rawRange = rangeHeader.slice(6).split(",")[0].trim();
  const [rawStart = "", rawEnd = ""] = rawRange.split("-");

  let start;
  let end;

  // Suffix range: bytes=-500
  if (rawStart === "") {
    const suffixLength = Number(rawEnd);

    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return null;
    }

    start = Math.max(totalSize - suffixLength, 0);
    end = totalSize - 1;
  } else {
    start = Number(rawStart);

    if (!Number.isFinite(start) || start < 0) {
      return null;
    }

    if (rawEnd === "") {
      end = totalSize - 1;
    } else {
      end = Number(rawEnd);

      if (!Number.isFinite(end)) {
        return null;
      }
    }
  }

  if (start >= totalSize || end < start) {
    return {
      unsatisfiable: true,
      totalSize
    };
  }

  end = Math.min(end, totalSize - 1);

  return {
    start,
    end,
    totalSize
  };
}

async function createPartialContentResponse(fullResponse, rangeHeader) {
  const buffer = await fullResponse.arrayBuffer();
  const totalSize = buffer.byteLength;
  const range = parseByteRange(rangeHeader, totalSize);

  if (!range || range.unsatisfiable) {
    return new Response(null, {
      status: 416,
      statusText: "Range Not Satisfiable",
      headers: {
        "Content-Range": `bytes */${totalSize}`,
        "Accept-Ranges": "bytes"
      }
    });
  }

  const chunk = buffer.slice(range.start, range.end + 1);
  const headers = new Headers(fullResponse.headers);

  headers.set("Accept-Ranges", "bytes");
  headers.set(
    "Content-Range",
    `bytes ${range.start}-${range.end}/${range.totalSize}`
  );
  headers.set("Content-Length", String(chunk.byteLength));

  // El body entregado por fetch ya está decodificado.
  // Evitamos conservar un Content-Encoding incompatible con el slice.
  headers.delete("Content-Encoding");

  return new Response(chunk, {
    status: 206,
    statusText: "Partial Content",
    headers
  });
}

async function handleRangeRequest(request) {
  const rangeHeader = request.headers.get("range");

  // V35.11.1: online usamos primero el Range nativo del servidor.
  // Esto evita leer el MP4 completo desde Cache Storage para cada pequeño
  // fragmento que pide Safari y mejora mucho el tiempo de inicio del video.
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.status === 206) {
      return networkResponse;
    }

    // Algunos servidores ignoran Range y devuelven el archivo entero con 200.
    // En ese caso generamos nosotros el 206 para mantener compatibilidad iOS.
    if (networkResponse.ok && networkResponse.status === 200) {
      const cache = await caches.open(CACHE);
      cache.put(request.url, networkResponse.clone()).catch(() => {});

      return createPartialContentResponse(
        networkResponse,
        rangeHeader
      );
    }
  } catch (error) {
    // Sin red: seguimos abajo con el archivo completo ya cacheado.
  }

  // Fallback offline: si tenemos la copia completa en Cache Storage,
  // construimos el fragmento 206 que Safari necesita para reproducir.
  const cached = await caches.match(request.url);

  if (cached && cached.ok && cached.status === 200) {
    return createPartialContentResponse(cached, rangeHeader);
  }

  return new Response(null, {
    status: 503,
    statusText: "Media unavailable offline"
  });
}

self.addEventListener("fetch",event=>{
  const req=event.request;

  if(req.method!=="GET") return;

  // Safari/iOS pide MP4 y otros recursos multimedia mediante Range requests.
  // Un asset completo cacheado debe convertirse en 206 Partial Content.
  if(req.headers.has("range")){
    event.respondWith(
      handleRangeRequest(req)
    );
    return;
  }

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

  // Los videos se sirven bajo demanda y no se guardan automáticamente
  // en Cache Storage. Esto evita que la PWA acumule cientos de MB.
  const requestUrl = new URL(req.url);
  const isVideoAsset = /\.(mp4|mov|m4v|webm)$/i.test(requestUrl.pathname);

  if (isVideoAsset) {
    event.respondWith(
      fetch(req)
        .catch(() => caches.match(req))
        .then(response =>
          response ||
          new Response(null, {
            status: 503,
            statusText: "Media unavailable offline"
          })
        )
    );
    return;
  }

  // Para el resto de los assets usamos cache-first y guardamos lo que falte.
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
        "Nu App",
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
