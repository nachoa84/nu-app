/* Nu App V171: revisionless canonical state publication gate.
 * This module is deliberately independent of DOM, storage and networking.
 * It prevents known progress regressions; it does not claim to order arbitrary
 * administrative corrections without a server revision. Explicit resets use
 * a new Collagen cycle. Product resets are not supported by this contract.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RoutineStateGateV171 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const IDS = Object.freeze(["lumispa-10", "wellspa-10", "galvanicspa-10"]);
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
  const copy = value => JSON.parse(JSON.stringify(value));
  const daySet = (values, max) => {
    if (!Array.isArray(values)) return null;
    const result = new Set();
    for (const value of values) {
      const day = Number(value);
      if (!integer(day, 1, max)) return null;
      result.add(day);
    }
    return [...result].sort((a, b) => a - b);
  };
  const superset = (next, previous) => previous.every(day => next.includes(day));
  const time = value => {
    const date = typeof value === "string" && !/^\d+$/.test(value) ? Date.parse(value) : Number(value);
    return Number.isFinite(date) && date > 0 ? date : null;
  };
  function dates(value, max) {
    if (value === undefined) return {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const result = {};
    for (const [raw, stamp] of Object.entries(value)) {
      const day = Number(raw), parsed = time(stamp);
      if (!integer(day, 1, max) || parsed === null) return null;
      result[day] = parsed;
    }
    return result;
  }
  function normalizeRoutine(value, max, product) {
    if (!value || typeof value !== "object") return null;
    if (product && value.initialized !== true && value.initialized !== false) return null;
    const currentDay = Number(value.currentDay);
    const completedDays = daySet(value.completedDays, max);
    const openedDays = dates(value.openedDays, max);
    const completedAtByDay = dates(value.completedAtByDay, max);
    if (!integer(currentDay, 1, max) || !completedDays || !openedDays || !completedAtByDay ||
        completedDays.some(day => day > currentDay) ||
        Object.keys(completedAtByDay).some(day => !completedDays.includes(Number(day)))) return null;
    const unlock = value.nextUnlockAt;
    const nextUnlockAt = unlock == null ? null : time(unlock);
    if (unlock != null && nextUnlockAt === null) return null;
    return { ...copy(value), currentDay, completedDays, openedDays,
      completedAtByDay, nextUnlockAt };
  }
  function mergeRoutine(previous, incoming, max, product, sequence) {
    if (!previous) return { value: incoming, sequence };
    if (product && previous.initialized && !incoming.initialized) return null;
    if (!product && incoming.cycle < previous.cycle) return null;
    if (!product && incoming.cycle > previous.cycle) return { value: incoming, sequence };
    if (incoming.currentDay < previous.currentDay ||
        !superset(incoming.completedDays, previous.completedDays)) return null;
    // A response from an older request must not replace newer schedule/profile
    // fields. Progress is monotonic; the next canonical read can refresh those.
    const stale = sequence < previous.__sequence;
    const { __sequence, ...prior } = previous;
    const result = { ...prior, ...incoming };
    result.openedDays = { ...previous.openedDays, ...incoming.openedDays };
    result.completedAtByDay = { ...previous.completedAtByDay, ...incoming.completedAtByDay };
    for (const [day, stamp] of Object.entries(previous.completedAtByDay)) {
      if (own(incoming.completedAtByDay, day) && incoming.completedAtByDay[day] !== stamp) {
        // The first completion timestamp is immutable in this contract.
        // A correction requires an explicit migration/revision, not a race.
        return null;
      }
    }
    for (const [day, stamp] of Object.entries(previous.openedDays)) {
      if (own(incoming.openedDays, day) && incoming.openedDays[day] !== stamp) return null;
    }
    if (stale) {
      result.nextUnlockAt = incoming.currentDay > previous.currentDay ? null : previous.nextUnlockAt;
      if (product === false) result.profile = previous.profile;
    }
    return { value: result, sequence: Math.max(sequence, previous.__sequence) };
  }
  function createGate({ getSession, onPublish = () => {} }) {
    if (typeof getSession !== "function" || typeof onPublish !== "function") throw new TypeError("Invalid gate dependencies");
    let epoch = null, account = null, sequence = 0;
    let collagen = null;
    const products = new Map();
    function session() {
      const value = getSession();
      if (!value || !String(value.userId || "") || !integer(value.epoch, 0, Number.MAX_SAFE_INTEGER)) return null;
      return { userId: String(value.userId), epoch: value.epoch };
    }
    function resetForSession(value) {
      if (account !== value.userId || epoch !== value.epoch) {
        account = value.userId; epoch = value.epoch;
        collagen = null; products.clear();
      }
    }
    function begin(scope = "collagen") {
      const value = session();
      if (!value || (scope !== "collagen" && scope !== "products")) return null;
      resetForSession(value);
      return Object.freeze({ ...value, scope, sequence: ++sequence });
    }
    function accept(raw, ticket) {
      const active = session();
      if (!active || !ticket || active.userId !== ticket.userId || active.epoch !== ticket.epoch ||
          raw?.userId !== ticket.userId || (ticket.scope !== "collagen" && ticket.scope !== "products")) return null;
      resetForSession(active);
      if (ticket.scope === "collagen") {
        const incoming = normalizeRoutine(raw, 30, false);
        const cycle = Number(raw?.cycle);
        if (!incoming || !integer(cycle, 1, Number.MAX_SAFE_INTEGER)) return null;
        incoming.cycle = cycle;
        const previous = collagen && { ...collagen.value, __sequence: collagen.sequence };
        const merged = mergeRoutine(previous, incoming, 30, false, ticket.sequence);
        if (!merged && !collagen) return null;
        const record = merged || collagen;
        const result = copy(record.value);
        if (merged && (!collagen || JSON.stringify(collagen.value) !== JSON.stringify(merged.value))) {
          onPublish(result, "collagen");
        }
        if (merged) collagen = merged;
        return result;
      }
      if (!raw.routines || typeof raw.routines !== "object" || Array.isArray(raw.routines)) return null;
      let changed = false;
      const next = new Map(products);
      for (const id of IDS) {
        if (!own(raw.routines, id)) continue;
        const incoming = normalizeRoutine(raw.routines[id], 10, true);
        if (!incoming) continue;
        const previousRecord = products.get(id);
        const previous = previousRecord && { ...previousRecord.value, __sequence: previousRecord.sequence };
        const merged = mergeRoutine(previous, incoming, 10, true, ticket.sequence);
        if (!merged) continue;
        if (!previousRecord || JSON.stringify(previousRecord.value) !== JSON.stringify(merged.value)) changed = true;
        next.set(id, merged);
      }
      if (!next.size) return null;
      const result = { userId: account, routines: {} };
      for (const [id, record] of next) result.routines[id] = copy(record.value);
      if (changed) onPublish(result, "products");
      products.clear();
      for (const [id, record] of next) products.set(id, record);
      return result;
    }
    function snapshot(scope) {
      const active = session();
      if (!active || active.userId !== account || active.epoch !== epoch) return null;
      if (scope === "collagen") return collagen ? copy(collagen.value) : null;
      if (scope === "products") {
        if (!products.size) return null;
        return { userId: account, routines: Object.fromEntries([...products].map(([id, record]) => [id, copy(record.value)])) };
      }
      return null;
    }
    return Object.freeze({ begin, accept, snapshot });
  }
  return Object.freeze({ createGate });
});
