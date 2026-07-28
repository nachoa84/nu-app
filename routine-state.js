// Rutina 30 Días · Estado local de la rutina
// Paso 11J: persistencia, completados, horarios y desbloqueos locales.
// La sincronización con backend permanece coordinada desde app.js.

const DEFAULT_UNLOCK_HOUR = 9;
const TOTAL_PROGRAM_DAYS = 30;
const ROUTINE_STATE_STORAGE_KEY = "routineState";

function getRoutineState() {
  const fallback = {
    currentDay: 1,
    openedDays: {},
    nextUnlockAt: null,
    scheduleProfileSignature: null
  };

  try {
    const saved = JSON.parse(
      localStorage.getItem(ROUTINE_STATE_STORAGE_KEY) || "null"
    );

    if (!saved) return fallback;

    return {
      currentDay: Number(saved.currentDay || 1),
      openedDays: saved.openedDays || {},
      nextUnlockAt: saved.nextUnlockAt || null,
      scheduleProfileSignature:
        saved.scheduleProfileSignature || null
    };
  } catch (e) {
    return fallback;
  }
}

function saveRoutineState(state) {
  localStorage.setItem(
    ROUTINE_STATE_STORAGE_KEY,
    JSON.stringify(state)
  );
}

function getDayCompleteStorageKey(day) {
  return `day${Number(day)}Complete`;
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
  clearCompletedDays(maxDays);

  completedDays.forEach(day => {
    const safeDay = Number(day);

    if (
      Number.isInteger(safeDay) &&
      safeDay >= 1 &&
      safeDay <= Number(maxDays)
    ) {
      setDayComplete(safeDay, true);
    }
  });
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
