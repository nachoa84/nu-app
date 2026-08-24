// Modo de prueba del onboarding — SOLO PARA DESARROLLO.
// Activación: ?onboardingTest=1 en la URL.
//
// Objetivo: poder recorrer visualmente TODO el onboarding las veces que se
// quiera, sin escribir ni borrar ningún dato real (perfil, progreso de
// rutinas, favoritos, progreso de guía, notificaciones).
//
// Este archivo expone únicamente funciones puras de decisión — no toca
// localStorage, DOM ni APIs del navegador — para que:
//   (a) onboarding.js las use para gatear su comportamiento real, y
//   (b) se puedan testear con Node sin necesitar un navegador/DOM.
//
// Fácil de eliminar antes de producción: borrar este archivo, la línea
// <script> que lo carga en index.html, y los puntos marcados
// "OnboardingTestMode" dentro de onboarding.js.
(function (root) {
  "use strict";

  function detectOnboardingTestMode(search) {
    try {
      return new URLSearchParams(search || "").get("onboardingTest") === "1";
    } catch (error) {
      return false;
    }
  }

  // ¿Hay que mostrar el onboarding? En modo test, siempre — sin importar
  // si ya existe un perfil real guardado.
  function shouldShowOnboarding({ testMode, hasProfile }) {
    return Boolean(testMode) || !hasProfile;
  }

  // ¿Hay que persistir el perfil/flag de "onboarding completado" en
  // localStorage? Nunca en modo test.
  function shouldPersistProfile({ testMode }) {
    return !testMode;
  }

  // ¿Hay que resetear routineState/día seleccionado/días completados como
  // se hace para un usuario nuevo real? Nunca en modo test — evita pisar
  // el progreso real de rutinas del usuario.
  function shouldResetRoutineForNewUser({ testMode, firstProfile }) {
    return Boolean(firstProfile) && !testMode;
  }

  // ¿Hay que pedir permiso real de notificaciones (Notification.requestPermission)?
  // Nunca en modo test, aunque el resto de las condiciones (firstProfile,
  // soporte de Notification/Push, etc.) se cumplan.
  function shouldRequestNotificationPermission({ testMode, canRequestPush }) {
    return Boolean(canRequestPush) && !testMode;
  }

  // ¿Hay que correr el installation gate real (bloquear con "instalá la
  // app")? Nunca en modo test — permite recorrer el flujo visual sin tener
  // la PWA instalada, igual que el modo preview existente.
  function shouldRunInstallationGate({ testMode, previewMode }) {
    return !testMode && !previewMode;
  }

  // Al terminar el onboarding en modo test: nunca recargar la página completa
  // (eso perdería el estado en memoria y, como no se persistió nada real,
  // volvería a mostrar el onboarding en vez de pasar a Inicio). En modo
  // normal, sí se recarga cuando es el primer perfil, como ya hacía la app.
  function shouldReloadOnFinish({ testMode, firstProfile }) {
    return Boolean(firstProfile) && !testMode;
  }

  const api = {
    detectOnboardingTestMode,
    shouldShowOnboarding,
    shouldPersistProfile,
    shouldResetRoutineForNewUser,
    shouldRequestNotificationPermission,
    shouldRunInstallationGate,
    shouldReloadOnFinish
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.OnboardingTestMode = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
