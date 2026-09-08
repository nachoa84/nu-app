// Rutina 30 Días · Estado local de la rutina
// Paso 11J: persistencia, completados, horarios y desbloqueos locales.
// La sincronización con backend permanece coordinada desde app.js.

const DEFAULT_UNLOCK_HOUR = 9;
let TOTAL_PROGRAM_DAYS = getActiveRoutineConfig().totalDays;
function getRoutineStateStorageKey() { return isBackendManagedRoutine() ? "routineState" : `routineState:${getActiveRoutineId()}`; }

function getRoutineState() {
  const fallback = {
    currentDay: 1,
    openedDays: {},
    nextUnlockAt: null,
    pendingNextDay: null,
    scheduleProfileSignature: null
  };

  try {
    const saved = JSON.parse(
      localStorage.getItem(getRoutineStateStorageKey()) || "null"
    );

    if (!saved) return fallback;

    return resolvePendingUnlockV131({
      currentDay: Number(saved.currentDay || 1),
      openedDays: saved.openedDays || {},
      nextUnlockAt: saved.nextUnlockAt || null,
      pendingNextDay: saved.pendingNextDay || null,
      scheduleProfileSignature:
        saved.scheduleProfileSignature || null
    });
  } catch (e) {
    return fallback;
  }
}

// El backend es la única fuente de verdad para desbloquear días.
// El cliente conserva nextUnlockAt solo para mostrar el estado pendiente;
// nunca adelanta currentDay por su cuenta.
function resolvePendingUnlockV131(state) {
  return state;
}

function saveRoutineState(state) {
  localStorage.setItem(
    getRoutineStateStorageKey(),
    JSON.stringify(state)
  );
}

function getDayCompleteStorageKey(day) {
  return isBackendManagedRoutine() ? `day${Number(day)}Complete` : `day:${getActiveRoutineId()}:${Number(day)}:complete`;
}

function getDayCompletedAtStorageKey(day) {
  return isBackendManagedRoutine()
    ? `day${Number(day)}CompletedAt`
    : `day:${getActiveRoutineId()}:${Number(day)}:completedAt`;
}

function rememberDayCompletionTimestamp(day, complete = true) {
  const key = getDayCompletedAtStorageKey(day);

  if (complete) {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, String(Date.now()));
    }
  } else {
    localStorage.removeItem(key);
  }
}

function isDayComplete(day) {
  return localStorage.getItem(
    getDayCompleteStorageKey(day)
  ) === "1";
}

function setDayComplete(day, complete = true) {
  const key = getDayCompleteStorageKey(day);

  if (complete) {
    localStorage.setItem(key, "1");
  } else {
    localStorage.removeItem(key);
  }

  rememberDayCompletionTimestamp(day, complete);
}

function clearCompletedDays(maxDays = TOTAL_PROGRAM_DAYS) {
  for (let day = 1; day <= Number(maxDays); day++) {
    setDayComplete(day, false);
  }
}

function replaceCompletedDays(
  completedDays = [],
  maxDays = TOTAL_PROGRAM_DAYS
) {
  const completedSet =
    new Set(
      completedDays
        .map(Number)
        .filter(day =>
          Number.isInteger(day) &&
          day >= 1 &&
          day <= Number(maxDays)
        )
    );

  for (let day = 1; day <= Number(maxDays); day++) {
    const completeKey = getDayCompleteStorageKey(day);
    const completedAtKey = getDayCompletedAtStorageKey(day);

    if (completedSet.has(day)) {
      localStorage.setItem(completeKey, "1");
    } else {
      localStorage.removeItem(completeKey);
      localStorage.removeItem(completedAtKey);
    }
  }
}

function getRoutineProfile() {
  try {
    return JSON.parse(
      localStorage.getItem("routineUserProfile") || "null"
    );
  } catch (e) {
    return null;
  }
}

function getDeviceTimezone() {
  try {
    return (
      Intl.DateTimeFormat()
        .resolvedOptions()
        .timeZone ||
      "America/Argentina/Buenos_Aires"
    );
  } catch (e) {
    return "America/Argentina/Buenos_Aires";
  }
}

function getScheduleProfile() {
  const profile = getRoutineProfile();

  return {
    timezone:
      profile?.timezone ||
      getDeviceTimezone(),
    notificationTime:
      profile?.notificationTime ||
      `${String(DEFAULT_UNLOCK_HOUR).padStart(2, "0")}:00`
  };
}

function scheduleProfileSignature() {
  const profile = getScheduleProfile();

  return (
    `${profile.timezone}|` +
    `${profile.notificationTime}`
  );
}

function getZonedParts(date, timeZone) {
  const formatter =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
      }
    );

  const parts = {};

  formatter
    .formatToParts(date)
    .forEach(part => {
      if (part.type !== "literal") {
        parts[part.type] =
          Number(part.value);
      }
    });

  return parts;
}

function zonedWallTimeToTimestamp({
  year,
  month,
  day,
  hour,
  minute,
  timeZone
}) {
  const desiredAsUTC =
    Date.UTC(
      year,
      month - 1,
      day,
      hour,
      minute,
      0,
      0
    );

  let guess = desiredAsUTC;

  // Ajuste iterativo para convertir una hora "de pared"
  // en una zona IANA a un timestamp UTC.
  for (let i = 0; i < 4; i++) {
    const actual =
      getZonedParts(
        new Date(guess),
        timeZone
      );

    const actualAsUTC =
      Date.UTC(
        actual.year,
        actual.month - 1,
        actual.day,
        actual.hour,
        actual.minute,
        actual.second || 0,
        0
      );

    const diff =
      desiredAsUTC - actualAsUTC;

    guess += diff;

    if (Math.abs(diff) < 1000) {
      break;
    }
  }

  return guess;
}

function nextUnlockTimestampFromProfile(
  openedAt = Date.now()
) {
  const {
    timezone,
    notificationTime
  } = getScheduleProfile();

  const [hour, minute] =
    notificationTime
      .split(":")
      .map(Number);

  const openedParts =
    getZonedParts(
      new Date(openedAt),
      timezone
    );

  // Calculamos el día calendario siguiente
  // dentro de la zona horaria del usuario.
  const nextCalendar =
    new Date(
      Date.UTC(
        openedParts.year,
        openedParts.month - 1,
        openedParts.day + 1,
        0,
        0,
        0
      )
    );

  return zonedWallTimeToTimestamp({
    year:
      nextCalendar.getUTCFullYear(),
    month:
      nextCalendar.getUTCMonth() + 1,
    day:
      nextCalendar.getUTCDate(),
    hour:
      Number.isFinite(hour)
        ? hour
        : DEFAULT_UNLOCK_HOUR,
    minute:
      Number.isFinite(minute)
        ? minute
        : 0,
    timeZone: timezone
  });
}

function rescheduleNextUnlockFromProfile(
  force = false
) {
  // Compatibilidad con módulos antiguos.
  // Desde V54 el cliente no puede recalcular ni persistir nextUnlockAt.
  void force;
  return false;
}

function advanceRoutineIfEligible() {
  // Compatibilidad con módulos antiguos.
  // Desde V54 currentDay solo avanza con estado confirmado por backend.
  return false;
}


// NU APP · AVANCE INMEDIATO MULTIRUTINA V100
function getNextPendingProductRoutineDayV100(routineId, totalDays = 10) {
  for (let day = 1; day <= Number(totalDays); day++) {
    if (localStorage.getItem(`day:${routineId}:${day}:complete`) !== "1") {
      return day;
    }
  }
  return Number(totalDays);
}

setDayComplete = function setDayCompleteV100(day, complete = true) {
  const safeDay = Number(day);
  const key = getDayCompleteStorageKey(safeDay);

  if (complete) localStorage.setItem(key, "1");
  else localStorage.removeItem(key);

  rememberDayCompletionTimestamp(safeDay, complete);

  if (isBackendManagedRoutine()) return;

  const routineId = getActiveRoutineId();
  const state = getRoutineState();

  if (!complete) {
    state.pendingNextDay = null;
    state.nextUnlockAt = null;
    localStorage.setItem(`routineState:${routineId}`, JSON.stringify(state));
  }

  if (typeof renderRoutineCardsV92a === "function") renderRoutineCardsV92a();

  // Desde V171 el POST de completado se ejecuta únicamente desde
  // RoutineCompletionV171/confirmRoutineDayV171. Esta función solo aplica
  // estado local ya confirmado o limpia marcas locales.
  void routineId;
};
