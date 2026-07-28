(() => {
  const splash = document.getElementById("appSplash");
  const video = document.getElementById("nuSplashVideo");

  if (!splash) return;

  let brandShown = false;
  let exitStarted = false;
  const timers = new Set();

  const later = (callback, delay) => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      callback();
    }, delay);
    timers.add(id);
    return id;
  };

  const removeSplash = () => {
    if (!splash.isConnected) return;
    splash.style.pointerEvents = "none";
    splash.remove();
    timers.forEach(id => window.clearTimeout(id));
    timers.clear();
  };

  const startExit = () => {
    if (exitStarted || !splash.isConnected) return;
    exitStarted = true;

    splash.classList.add("is-content-exiting");

    later(() => {
      splash.classList.add("is-background-exiting");
      splash.style.pointerEvents = "none";
      later(removeSplash, 200);
    }, 280);
  };

  const showBrand = () => {
    if (brandShown || !splash.isConnected) return;
    brandShown = true;

    splash.classList.add("is-nu-written");
    later(() => splash.classList.add("is-loading-visible"), 430);
    later(startExit, 1350);
  };

  const usePoster = () => {
    splash.classList.add("use-poster");
    showBrand();
  };

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  if (reducedMotion) {
    usePoster();
  } else if (video) {
    video.addEventListener("ended", showBrand, { once: true });
    video.addEventListener("error", usePoster, { once: true });

    const playAttempt = video.play();
    if (playAttempt && typeof playAttempt.catch === "function") {
      playAttempt.catch(usePoster);
    }

    // Safari/Android safety: never wait forever for media events.
    later(showBrand, 4300);
  } else {
    usePoster();
  }

  // Absolute safety: an invisible splash can never block Home.
  later(removeSplash, 6200);
})();
