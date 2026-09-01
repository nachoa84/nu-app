const CACHE="nuapp-v167-api-network-only";

const CORE=[
  "./",
  "./index.html",
  "./tokens.css?v=61b-progress-canonical",
  "./base.css?v=129-ios-horizontal-stability",
  "./splash.css?v=61b-progress-canonical",
  "./splash.js?v=61b-progress-canonical",
  "./navigation.css?v=81-home-navigation-legibility",
  "./app-navigation-floating-v1.css?v=20260830-floating-nav-v1",
  "./typography-poppins-v1.css?v=20260830-poppins-v1",
  "./home-redesign-v1.css?v=20260831-routine-state-scope",
  "./daily.css?v=109-routine-text-balanced",
  "./progress.css?v=83-routine-progress-legibility",
  "./media-preview.css?v=85a-media-legibility",
  "./shared.css?v=87-shared-ui-legibility",
  "./ui-core.css?v=143-iris-clean-2",
  "./notifications.css?v=86-notifications-legibility",
  "./foco-live.css?v=2",
  "./home.css?v=126-mobile-header-spacing",
  "./shell.css?v=61b-progress-canonical",
  "./bot.css?v=143-iris-layout-9",
  "./favorites.css?v=94-bot-folders",
  "./favorites-redesign-v1.css?v=146-wellspa-scale",
  "./bot-content.js?v=131-country-catalogs",
  "./ui-core.js?v=143-iris-clean-4",
  "./routine-content.js?v=103a-unified-app-store",
  "./routine-content-collagen-8-30.js?v=63-collagen-30",
  "./routine-products-v92.js?v=143-single-render",
  "./multiroutine-v92.css?v=106e-lumispa-interior-image",
  "./routine-state.js?v=136-unified-daily-unlock",
  "./routine-sync.js?v=136-unified-daily-unlock",
  "./bot.js?v=143-keyboard-layout",
  "./bot-shortcuts-v95.js?v=126-grid-access-icon",
  "./assets/custom/nuskin-logo-icon.svg",
  "./assets/custom/foco-live-card.png",
  "./assets/catalogos/catalogo-europa-02-2026.pdf",
  "./bot-sales-training-v102.js?v=102b-no-duplicate",
  "./favorites.js?v=96-material-names",
  "./notifications.js?v=143-single-sw",
  "./foco-live.js?v=2",
  "./home-view.js?v=20260830-home-continuity-v4",
  "./daily-view.js?v=110-routine-text-balanced",
  "./progress-view.js?v=63-collagen-30",
  "./media-preview.js?v=105-navigation-bot-fixes",
  "./app.js?v=143-single-sw",
  "./backend-client.js?v=136-unified-daily-unlock",
  "./push-client.js?v=61b-progress-canonical",
  "./onboarding.js?v=61b-progress-canonical",
  "./onboarding.css?v=88-onboarding-legibility",
  "./guide.css?v=119a-completion-lock",
  "./native-visual-v117.css?v=117-native-visual-polish",
  "./guide-content.js?v=61c-guide-prototype",
  "./guide-view.js?v=119a-completion-lock",
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
  "./assets/custom/routine-lumispa-hero-v4.png",
  "./assets/custom/routine-wellspa-hero-v3.png",
  "./assets/custom/routine-galvanicspa-hero-v3.png",
  "./assets/custom/routine-galvanicspa-hero-v4.png",
  "./assets/custom/routine-wellspa-home.jpg",
  "./assets/custom/routine-galvanicspa-home.webp",
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
  );
});

self.addEventListener("message", event => {
  if (event.data?.type === "NUAPP_SKIP_WAITING_V142" || event.data?.type === "NUAPP_SKIP_WAITING_V143") {
    self.skipWaiting();
  }
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

  const rawRange = rangeHeader.slice(6).split(",")[0].trim();
  const [rawStart = "", rawEnd = ""] = rawRange.split("-");

  let start;
  let end;
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
  headers.delete("Content-Encoding");

  return new Response(chunk, {
    status: 206,
    statusText: "Partial Content",
    headers
  });
}

async function handleRangeRequest(request) {
  const rangeHeader = request.headers.get("range");

  try {
    const networkResponse = await fetch(request);

    if (networkResponse.status === 206) {
      return networkResponse;
    }

    if (networkResponse.ok && networkResponse.status === 200) {
      const cache = await caches.open(CACHE);
      cache.put(request.url, networkResponse.clone()).catch(() => {});

      return createPartialContentResponse(
        networkResponse,
        rangeHeader
      );
    }
  } catch (error) {}

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

  const requestUrl = new URL(req.url);
  const isSameOriginApi =
    requestUrl.origin === self.location.origin &&
    requestUrl.pathname.startsWith("/api/");

  // El estado del usuario, progreso, configuración y demás respuestas API
  // siempre vienen del servidor. Nunca deben persistirse en Cache Storage.
  if (isSameOriginApi) {
    event.respondWith(fetch(req, { cache: "no-store" }));
    return;
  }

  if(req.headers.has("range")){
    event.respondWith(
      handleRangeRequest(req)
    );
    return;
  }

  // Replit Preview (replit.dev) debe mostrar siempre el workspace actual.
  // Evitamos Cache Storage para que los cambios de desarrollo aparezcan
  // inmediatamente y no diverjan de la PWA publicada.
  if (self.location.hostname.endsWith("replit.dev")) {
    event.respondWith(fetch(req, { cache: "no-store" }));
    return;
  }

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

  const isCurrentCodeAsset =
    requestUrl.origin === self.location.origin &&
    /\.(css|js)$/i.test(requestUrl.pathname);

  // CSS y JavaScript se consultan primero en red. Si no hay conexión,
  // se usa la copia offline. Así una página nueva no queda mezclada con
  // código o estilos de una versión anterior.
  if (isCurrentCodeAsset) {
    event.respondWith(
      fetch(req, { cache: "no-store" })
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

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
            data.url || "/",
          notificationId:
            data.notificationId ||
            data.tag ||
            null,
          focoKind:
            data.focoKind ||
            null
        },
        tag:
          data.tag ||
          "rutina30",
        renotify: false
          }
        )
    ];

    if (data.focoEvent && data.focoKind) {
      tasks.push(
        self.clients
          .matchAll({
            type: "window",
            includeUncontrolled: true
          })
          .then(windowClients =>
            Promise.all(
              windowClients.map(client =>
                client.postMessage({
                  type: "NU_FOCO_EVENT",
                  payload: data
                })
              )
            )
          )
      );
    }

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