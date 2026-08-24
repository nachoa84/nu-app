// Pruebas del modo de prueba del onboarding (?onboardingTest=1).
// Corren sobre la lógica pura de onboarding-test-mode.js (sin DOM/browser),
// que es exactamente el punto único de decisión que onboarding.js consulta
// en cada uno de los lugares sensibles (persistencia, reset de rutina,
// permiso de notificaciones, installation gate, reload al terminar).
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  detectOnboardingTestMode,
  shouldShowOnboarding,
  shouldPersistProfile,
  shouldResetRoutineForNewUser,
  shouldRequestNotificationPermission,
  shouldRunInstallationGate,
  shouldReloadOnFinish
} = require("../onboarding-test-mode");

test("detectOnboardingTestMode reconoce ?onboardingTest=1 y lo ignora en cualquier otro caso", () => {
  assert.equal(detectOnboardingTestMode("?onboardingTest=1"), true);
  assert.equal(detectOnboardingTestMode("?foo=bar&onboardingTest=1"), true);
  assert.equal(detectOnboardingTestMode(""), false);
  assert.equal(detectOnboardingTestMode("?onboardingTest=0"), false);
  assert.equal(detectOnboardingTestMode("?onboardingTest=true"), false);
  assert.equal(detectOnboardingTestMode(undefined), false);
});

// CASO A: usuario con onboarding ya completado + onboardingTest=1 => debe
// mostrar onboarding, ignorando que ya exista un perfil real.
test("CASO A: onboardingTest=1 fuerza el onboarding aunque haya perfil real", () => {
  assert.equal(
    shouldShowOnboarding({ testMode: true, hasProfile: true }),
    true
  );
});

// CASO B: usuario con onboarding ya completado sin el parámetro => no debe
// mostrar onboarding (comportamiento normal, intacto).
test("CASO B: sin el parámetro, un perfil existente no muestra el onboarding", () => {
  assert.equal(
    shouldShowOnboarding({ testMode: false, hasProfile: true }),
    false
  );
});

// Comportamiento normal sin perfil: se sigue mostrando (no se rompió nada).
test("sin parámetro y sin perfil, se sigue mostrando el onboarding como siempre", () => {
  assert.equal(
    shouldShowOnboarding({ testMode: false, hasProfile: false }),
    true
  );
});

// CASO C: terminar el onboarding en modo test no debe escribir el flag
// persistente real (routineUserProfile en localStorage).
test("CASO C: en modo test no se persiste el perfil/flag real", () => {
  assert.equal(shouldPersistProfile({ testMode: true }), false);
  // Y en modo normal se sigue persistiendo como siempre.
  assert.equal(shouldPersistProfile({ testMode: false }), true);
});

test("en modo test tampoco se resetea routineState/días completados", () => {
  assert.equal(
    shouldResetRoutineForNewUser({ testMode: true, firstProfile: true }),
    false
  );
  // Comportamiento normal intacto: si es el primer perfil real, sí resetea.
  assert.equal(
    shouldResetRoutineForNewUser({ testMode: false, firstProfile: true }),
    true
  );
  assert.equal(
    shouldResetRoutineForNewUser({ testMode: false, firstProfile: false }),
    false
  );
});

// CASO D: recargar con ?onboardingTest=1 debe volver a empezar. Como en
// modo test nunca se persiste nada (CASO C) y el perfil en memoria se
// pierde en cada carga de página, el estado "post reload" siempre es
// hasProfile:false — shouldShowOnboarding ya cubre que eso vuelve a
// mostrar el onboarding. Además, terminar el flujo en modo test nunca debe
// disparar un reload por sí mismo (si lo hiciera, y el usuario no hubiese
// tocado la URL, igual volvería a mostrar el onboarding en vez de pasar a
// Inicio, que es exactamente lo que el caso 5 pide evitar).
test("CASO D: sin nada persistido, recargar con el parámetro vuelve a mostrar el onboarding", () => {
  const postReloadHasProfile = false; // nada se escribió durante el modo test
  assert.equal(
    shouldShowOnboarding({ testMode: true, hasProfile: postReloadHasProfile }),
    true
  );
});

test("terminar el onboarding en modo test no fuerza un reload de página", () => {
  assert.equal(
    shouldReloadOnFinish({ testMode: true, firstProfile: true }),
    false
  );
  // Comportamiento normal intacto: el primer perfil real sigue recargando.
  assert.equal(
    shouldReloadOnFinish({ testMode: false, firstProfile: true }),
    true
  );
  assert.equal(
    shouldReloadOnFinish({ testMode: false, firstProfile: false }),
    false
  );
});

// CASO E: modo test + botón final => no debe pedir permiso real de
// notificaciones, aunque todas las demás condiciones para pedirlo se
// cumplan (primer perfil, browser con soporte, etc.).
test("CASO E: en modo test no se pide permiso real de notificaciones", () => {
  assert.equal(
    shouldRequestNotificationPermission({ testMode: true, canRequestPush: true }),
    false
  );
  // Comportamiento normal intacto.
  assert.equal(
    shouldRequestNotificationPermission({ testMode: false, canRequestPush: true }),
    true
  );
  assert.equal(
    shouldRequestNotificationPermission({ testMode: false, canRequestPush: false }),
    false
  );
});

// CASO F: modo test desde un navegador sin la PWA instalada => debe poder
// recorrerse el onboarding completo, sin que el installation gate lo
// bloquee.
test("CASO F: en modo test el installation gate nunca corre", () => {
  assert.equal(
    shouldRunInstallationGate({ testMode: true, previewMode: false }),
    false
  );
  // Comportamiento normal intacto en ambas direcciones.
  assert.equal(
    shouldRunInstallationGate({ testMode: false, previewMode: false }),
    true
  );
  assert.equal(
    shouldRunInstallationGate({ testMode: false, previewMode: true }),
    false
  );
});
