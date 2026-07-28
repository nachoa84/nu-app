// Rutina 30 Dias - modulo de notificaciones
// Extraido sin reescribir la logica del Paso 11D estable.

function getOrCreateNotificationUserId() {
  const profile = getRoutineProfile() || {};
  const fromApi =
    typeof window.BackendAPI?.getUserId === "function"
      ? window.BackendAPI.getUserId()
      : null;

  const known =
    fromApi ||
    profile.userId ||
    profile.id ||
    localStorage.getItem("routineUserId") ||
    localStorage.getItem("routineUserUUID") ||
    localStorage.getItem("mrc_uid") ||
    localStorage.getItem("userId");

  if (known) return String(known);

  const generated =
    `routine_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  localStorage.setItem("routineUserId", generated);
  return generated;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }

  return output;
}

let appServiceWorkerRegistrationPromise = null;

function registerAppServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return Promise.reject(
      new Error("Este dispositivo no permite Service Workers.")
    );
  }

  if (!appServiceWorkerRegistrationPromise) {
    appServiceWorkerRegistrationPromise =
      navigator.serviceWorker
        .register("service-worker.js")
        .then(() => navigator.serviceWorker.ready)
        .catch(error => {
          appServiceWorkerRegistrationPromise = null;
          throw error;
        });
  }

  return appServiceWorkerRegistrationPromise;
}

async function ensureNotificationRegistration() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Este dispositivo no permite notificaciones web.");
  }

  return registerAppServiceWorker();
}

async function hasActivePushSubscription() {
  if (
    !("Notification" in window) ||
    Notification.permission !== "granted" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return false;
  }

  try {
    const registration = await ensureNotificationRegistration();
    return Boolean(await registration.pushManager.getSubscription());
  } catch (error) {
    return false;
  }
}

async function syncPushSubscription(subscription) {
  const json = subscription.toJSON();
  const profile = getRoutineProfile() || {};
  const schedule = getScheduleProfile();
  const userId = getOrCreateNotificationUserId();

  const flatPayload = {
    userId,
    endpoint: json.endpoint,
    expirationTime: json.expirationTime || null,
    keys: json.keys,
    subscription: json,
    userAgent: navigator.userAgent,
    name: profile.name || profile.firstName || "",
    timezone: schedule.timezone,
    notificationTime: schedule.notificationTime,
    schedule_time: schedule.notificationTime,
    reminder_enabled: true
  };

  let lastError = null;

  for (const endpoint of ["/api/push/subscribe", "/api/subscribe"]) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        credentials: "same-origin",
        body: JSON.stringify(flatPayload)
      });

      if (response.ok) return true;
      lastError = new Error(`${endpoint} respondió ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("No se pudo guardar la suscripción.");
}

async function tryExistingPushClient() {
  const candidates = [
    [window.PushClient, "subscribe"],
    [window.PushClient, "enable"],
    [window.PushNotifications, "subscribe"],
    [window.PushNotifications, "enable"],
    [window, "subscribeToPush"],
    [window, "enablePushNotifications"]
  ];

  for (const [owner, method] of candidates) {
    const fn = owner?.[method];
    if (typeof fn !== "function") continue;

    try {
      await fn.call(owner);
      if (await hasActivePushSubscription()) return true;
    } catch (error) {
      console.warn(`[push] ${method} no pudo completar la activación.`, error);
    }
  }

  return false;
}

async function activateNotificationsFromSettings() {
  if (!("Notification" in window) || !("PushManager" in window)) {
    throw new Error("Este navegador no soporta notificaciones.");
  }

  if (Notification.permission === "denied") {
    throw new Error("Las notificaciones están bloqueadas en los ajustes del dispositivo.");
  }

  let permission = Notification.permission;

  if (permission !== "granted") {
    permission = await Notification.requestPermission();
  }

  if (permission !== "granted") {
    throw new Error("No se concedió el permiso de notificaciones.");
  }

  if (await tryExistingPushClient()) {
    saveNotificationEnabledLocally(true);
    return true;
  }

  const registration = await ensureNotificationRegistration();
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    const configResponse = await fetch("/api/push/public-key", {
      cache: "no-store",
      credentials: "same-origin"
    });

    if (!configResponse.ok) {
      throw new Error("No se pudo obtener la configuración de notificaciones.");
    }

    const config = await configResponse.json();
    const publicKey = config.publicKey || config.vapidPublicKey || "";

    if (!publicKey) {
      throw new Error("Falta la clave pública de notificaciones.");
    }

    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
  }

  await syncPushSubscription(subscription);
  saveNotificationEnabledLocally(true);
  return true;
}

function saveNotificationTimeLocally(value) {
  const profile = getRoutineProfile() || {};
  const updatedProfile = {
    ...profile,
    timezone: profile.timezone || getDeviceTimezone(),
    notificationTime: value
  };

  localStorage.setItem(
    "routineUserProfile",
    JSON.stringify(updatedProfile)
  );

  window.dispatchEvent(
    new CustomEvent("routine-profile-updated", {
      detail: updatedProfile
    })
  );

  return updatedProfile;
}

function saveNotificationEnabledLocally(enabled) {
  const profile = getRoutineProfile() || {};
  const schedule = getScheduleProfile();
  const updatedProfile = {
    ...profile,
    timezone: profile.timezone || schedule.timezone,
    notificationTime: profile.notificationTime || schedule.notificationTime,
    reminderEnabled: Boolean(enabled),
    reminder_enabled: Boolean(enabled)
  };

  localStorage.setItem(
    "routineUserProfile",
    JSON.stringify(updatedProfile)
  );

  window.dispatchEvent(
    new CustomEvent("routine-profile-updated", {
      detail: updatedProfile
    })
  );

  return updatedProfile;
}

async function deactivateNotificationsFromSettings() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    saveNotificationEnabledLocally(false);
    return true;
  }

  // Preferimos el cliente push central porque elimina primero la fila
  // push_subscriptions del backend y luego desuscribe el dispositivo.
  if (typeof window.PushClient?.unsubscribe === "function") {
    await window.PushClient.unsubscribe();
    saveNotificationEnabledLocally(false);

    if ("clearAppBadge" in navigator) {
      navigator.clearAppBadge().catch(() => {});
    }

    return true;
  }

  const registration = await ensureNotificationRegistration();
  const subscription = await registration.pushManager.getSubscription();
  const profile = getRoutineProfile() || {};
  const userId =
    profile.userId ||
    profile.id ||
    getOrCreateNotificationUserId();

  if (subscription) {
    const response = await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      credentials: "same-origin",
      body: JSON.stringify({
        userId,
        endpoint: subscription.endpoint
      })
    });

    if (!response.ok && response.status !== 404) {
      throw new Error("No se pudo desactivar la suscripción en el servidor.");
    }

    const unsubscribed = await subscription.unsubscribe();

    if (!unsubscribed) {
      throw new Error("No se pudo desactivar la suscripción.");
    }
  }

  saveNotificationEnabledLocally(false);

  if ("clearAppBadge" in navigator) {
    navigator.clearAppBadge().catch(() => {});
  }

  return true;
}

async function syncNotificationTimeWithBackend(profile) {
  const api = window.BackendAPI;
  const time = profile.notificationTime;
  const reminderEnabled = await hasActivePushSubscription();
  const payload = {
    ...profile,
    userId: profile.userId || profile.id || getOrCreateNotificationUserId(),
    timezone: profile.timezone || getDeviceTimezone(),
    notificationTime: time,
    schedule_time: time,
    reminder_enabled: reminderEnabled
  };

  const candidates = [
    [api, "updateNotificationProfile", [payload]],
    [api, "updateProfile", [payload]],
    [api, "saveProfile", [payload]],
    [api, "syncProfile", [payload]],
    [api, "updateSchedule", [payload]],
    [api, "setNotificationTime", [time]]
  ];

  for (const [owner, method, args] of candidates) {
    const fn = owner?.[method];
    if (typeof fn !== "function") continue;

    try {
      await fn.apply(owner, args);
      return true;
    } catch (error) {
      console.warn(`[profile] ${method} no pudo sincronizar el horario.`, error);
    }
  }

  // Si ya hay una suscripción, la reenviamos con el horario actualizado.
  try {
    const registration = await ensureNotificationRegistration();
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await syncPushSubscription(subscription);
      return true;
    }
  } catch (error) {
    console.warn("No se pudo resincronizar la suscripción push.", error);
  }

  return false;
}

async function renderNotificationSettings() {
  const enable = document.getElementById("notificationEnableBtn");
  const timeValue = document.getElementById("notificationTimeValue");
  const schedule = getScheduleProfile();

  if (timeValue) timeValue.textContent = schedule.notificationTime;

  if (!enable) return;

  enable.disabled = true;
  enable.classList.remove("is-active");
  enable.removeAttribute("aria-pressed");
  enable.textContent = "Revisando...";

  const active = await hasActivePushSubscription();

  enable.dataset.notificationState = active ? "active" : "inactive";
  enable.setAttribute("aria-pressed", active ? "true" : "false");

  if (active) {
    enable.textContent = "Desactivar";
    enable.classList.add("is-active");
    enable.disabled = false;
    return;
  }

  enable.textContent = "Activar";
  enable.disabled = false;
}


const NOTIFICATION_HOURS = Array.from(
  { length: 24 },
  (_, index) => String(index).padStart(2, "0")
);
const NOTIFICATION_MINUTES = ["00", "15", "30", "45"];
const NOTIFICATION_WHEEL_ITEM_HEIGHT = 44;
let notificationPickerHour = "09";
let notificationPickerMinute = "00";
let notificationWheelScrollTimer = null;

function notificationWheelValues(wheel) {
  return wheel?.id === "notificationHourWheel"
    ? NOTIFICATION_HOURS
    : NOTIFICATION_MINUTES;
}

function selectedNotificationWheelIndex(wheel) {
  const values = notificationWheelValues(wheel);
  if (!wheel || !values.length) return 0;

  return Math.max(
    0,
    Math.min(
      values.length - 1,
      Math.round(wheel.scrollTop / NOTIFICATION_WHEEL_ITEM_HEIGHT)
    )
  );
}

function updateNotificationWheelSelection(wheel, announce = false) {
  if (!wheel) return;

  const values = notificationWheelValues(wheel);
  const index = selectedNotificationWheelIndex(wheel);
  const value = values[index];

  wheel.querySelectorAll(".notification-time-option").forEach((option, optionIndex) => {
    const selected = optionIndex === index;
    option.classList.toggle("is-selected", selected);
    option.setAttribute("aria-selected", selected ? "true" : "false");
  });

  if (wheel.id === "notificationHourWheel") {
    notificationPickerHour = value;
  } else {
    notificationPickerMinute = value;
  }

  if (announce) {
    wheel.setAttribute("aria-valuetext", value);
  }
}

function scrollNotificationWheelToIndex(wheel, index, smooth = false) {
  if (!wheel) return;

  const values = notificationWheelValues(wheel);
  const safeIndex = Math.max(0, Math.min(values.length - 1, index));
  wheel.scrollTo({
    top: safeIndex * NOTIFICATION_WHEEL_ITEM_HEIGHT,
    behavior: smooth ? "smooth" : "auto"
  });

  window.setTimeout(() => updateNotificationWheelSelection(wheel, true), smooth ? 180 : 0);
}

function buildNotificationTimeWheel(wheel, values) {
  if (!wheel || wheel.dataset.ready === "true") return;

  wheel.innerHTML = values
    .map(
      (value, index) =>
        `<button class="notification-time-option" type="button" role="option" aria-selected="false" data-index="${index}" data-value="${value}">${value}</button>`
    )
    .join("");

  wheel.dataset.ready = "true";

  wheel.addEventListener("scroll", () => {
    clearTimeout(notificationWheelScrollTimer);
    notificationWheelScrollTimer = window.setTimeout(() => {
      updateNotificationWheelSelection(wheel, true);
    }, 80);
  }, { passive: true });

  wheel.addEventListener("click", event => {
    const option = event.target.closest(".notification-time-option");
    if (!option) return;
    scrollNotificationWheelToIndex(wheel, Number(option.dataset.index), true);
  });

  wheel.addEventListener("keydown", event => {
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();

    const current = selectedNotificationWheelIndex(wheel);
    let next = current;
    if (event.key === "ArrowUp") next = current - 1;
    if (event.key === "ArrowDown") next = current + 1;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = values.length - 1;
    scrollNotificationWheelToIndex(wheel, next, true);
  });
}

function setupNotificationTimePicker() {
  const hourWheel = document.getElementById("notificationHourWheel");
  const minuteWheel = document.getElementById("notificationMinuteWheel");

  buildNotificationTimeWheel(hourWheel, NOTIFICATION_HOURS);
  buildNotificationTimeWheel(minuteWheel, NOTIFICATION_MINUTES);
}

function setNotificationPickerValue(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value || "");
  const hour = match?.[1] || "09";
  const rawMinute = Number(match?.[2] || "00");
  const minute = NOTIFICATION_MINUTES.reduce((nearest, candidate) =>
    Math.abs(Number(candidate) - rawMinute) < Math.abs(Number(nearest) - rawMinute)
      ? candidate
      : nearest
  , "00");

  notificationPickerHour = hour;
  notificationPickerMinute = minute;

  const hourWheel = document.getElementById("notificationHourWheel");
  const minuteWheel = document.getElementById("notificationMinuteWheel");

  scrollNotificationWheelToIndex(hourWheel, NOTIFICATION_HOURS.indexOf(hour));
  scrollNotificationWheelToIndex(minuteWheel, NOTIFICATION_MINUTES.indexOf(minute));
}

function getNotificationPickerValue() {
  return `${notificationPickerHour}:${notificationPickerMinute}`;
}

function openNotificationSettings() {
  const modal = document.getElementById("notificationSettings");
  if (!modal) return;

  const currentState = getRoutineState();
  localStorage.setItem(
    "notificationLastSeenDay",
    String(currentState.currentDay)
  );
  document.getElementById("homeBellBtn")?.classList.remove("has-badge");

  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("notification-settings-open");
  document.getElementById("notificationTimeEditor")?.setAttribute("hidden", "");
  renderNotificationSettings();
}

function closeNotificationSettings() {
  const modal = document.getElementById("notificationSettings");
  if (!modal || modal.hidden) return;

  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("notification-settings-open");
  document.getElementById("notificationTimeEditor")?.setAttribute("hidden", "");
}

function setupNotificationSettings() {
  const modal = document.getElementById("notificationSettings");
  if (!modal) return;

  const close = document.getElementById("notificationSettingsClose");
  const backdrop = document.getElementById("notificationSettingsBackdrop");
  const enable = document.getElementById("notificationEnableBtn");
  const change = document.getElementById("notificationChangeTimeBtn");
  const editor = document.getElementById("notificationTimeEditor");
  const cancel = document.getElementById("notificationTimeCancelBtn");
  const save = document.getElementById("notificationTimeSaveBtn");

  setupNotificationTimePicker();

  if (close) close.innerHTML = ICONS.close;
  close?.addEventListener("click", closeNotificationSettings);
  backdrop?.addEventListener("click", closeNotificationSettings);

  enable?.addEventListener("click", async () => {
    enable.disabled = true;

    const active = await hasActivePushSubscription();
    enable.textContent = active ? "Desactivando..." : "Activando...";

    try {
      if (active) {
        await deactivateNotificationsFromSettings();
        await renderNotificationSettings();
        toast("Notificaciones desactivadas", { type: "success" });
        return;
      }

      await activateNotificationsFromSettings();
      await renderNotificationSettings();
      toast("Notificaciones activadas", { type: "success" });
    } catch (error) {
      console.warn("No se pudo cambiar el estado de las notificaciones.", error);
      await renderNotificationSettings();
      toast(error.message || "No se pudo cambiar el estado de las notificaciones.", {
        type: "error",
        duration: 3600
      });
    }
  });

  change?.addEventListener("click", () => {
    const schedule = getScheduleProfile();
    editor?.removeAttribute("hidden");
    requestAnimationFrame(() => {
      setNotificationPickerValue(schedule.notificationTime);
      document.getElementById("notificationHourWheel")?.focus({ preventScroll: true });
    });
  });

  cancel?.addEventListener("click", () => {
    editor?.setAttribute("hidden", "");
  });

  save?.addEventListener("click", async () => {
    const hourWheel = document.getElementById("notificationHourWheel");
    const minuteWheel = document.getElementById("notificationMinuteWheel");

    // El scroll de la rueda se procesa con un pequeño debounce.
    // Al guardar, forzamos una lectura inmediata de la posición visual real
    // para no persistir por error el horario anterior.
    updateNotificationWheelSelection(hourWheel, true);
    updateNotificationWheelSelection(minuteWheel, true);

    const value = getNotificationPickerValue();
    const previousValue = getScheduleProfile().notificationTime;
    const profile = saveNotificationTimeLocally(value);

    save.disabled = true;
    save.setAttribute("aria-busy", "true");

    try {
      const synced = await syncNotificationTimeWithBackend(profile);

      if (!synced) {
        throw new Error("No se pudo guardar el horario en el servidor.");
      }

      editor?.setAttribute("hidden", "");
      await renderNotificationSettings();
      toast(`Horario actualizado a ${value}`, { type: "success" });
    } catch (error) {
      console.warn("No se pudo guardar el horario de notificaciones.", error);

      // Si el backend no confirmó el cambio, restauramos el valor local
      // para que la interfaz no muestre un horario que el servidor no tiene.
      const restoredProfile = saveNotificationTimeLocally(previousValue);
      setNotificationPickerValue(previousValue);
      await renderNotificationSettings();

      toast(
        error.message || "No se pudo guardar el horario.",
        { type: "error", duration: 3600 }
      );
    } finally {
      save.disabled = false;
      save.removeAttribute("aria-busy");
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !modal.hidden) {
      closeNotificationSettings();
    }
  });
}
