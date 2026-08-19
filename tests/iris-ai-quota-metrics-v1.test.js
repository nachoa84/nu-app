"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createInMemoryIrisProviderBudgetStoreV1,
  createInMemoryIrisUsageQuotaStoreV1,
  periodKeysV1
} = require("../iris-ai-quota-store-v1");
const {
  createInMemoryIrisMetricsStoreV1
} = require("../iris-ai-metrics-store-v1");

const TZ = "America/Argentina/Cordoba";

test("period keys honor configured timezone instead of server timezone", () => {
  const instant = new Date("2026-08-20T01:30:00Z");
  assert.deepEqual(periodKeysV1(instant, TZ), {
    day: "2026-08-19",
    month: "2026-08"
  });
});

test("usage quota requires a user daily limit", () => {
  assert.throws(
    () => createInMemoryIrisUsageQuotaStoreV1({ timeZone: TZ }),
    /userDailyLimit requerido/
  );
});

test("usage quota enforces user limit before a new consumption", () => {
  const store = createInMemoryIrisUsageQuotaStoreV1({
    timeZone: TZ,
    userDailyLimit: 2
  });
  const now = new Date("2026-08-19T18:00:00Z");
  assert.equal(store.consume({ userScope: "u_hash", now }).allowed, true);
  assert.equal(store.consume({ userScope: "u_hash", now }).allowed, true);
  const blocked = store.consume({ userScope: "u_hash", now });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, "user_usage_limit_exhausted");
});

test("usage quota enforces device limit independently", () => {
  const store = createInMemoryIrisUsageQuotaStoreV1({
    timeZone: TZ,
    userDailyLimit: 10,
    deviceDailyLimit: 1
  });
  const now = new Date("2026-08-19T18:00:00Z");
  assert.equal(store.consume({ userScope: "u1", deviceScope: "d_hash", now }).allowed, true);
  const blocked = store.consume({ userScope: "u2", deviceScope: "d_hash", now });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, "device_usage_limit_exhausted");
});

test("provider budget requires daily and monthly caps", () => {
  assert.throws(
    () => createInMemoryIrisProviderBudgetStoreV1({
      timeZone: TZ,
      monthlyLimit: 100,
      maxEscalationPercent: 20
    }),
    /dailyLimit requerido/
  );
  assert.throws(
    () => createInMemoryIrisProviderBudgetStoreV1({
      timeZone: TZ,
      dailyLimit: 10,
      maxEscalationPercent: 20
    }),
    /monthlyLimit requerido/
  );
});

test("provider reservation is fail-closed when escalation percentage is exceeded", () => {
  const store = createInMemoryIrisProviderBudgetStoreV1({
    timeZone: TZ,
    dailyLimit: 100,
    monthlyLimit: 1000,
    maxEscalationPercent: 20
  });
  const result = store.reserve({
    now: new Date("2026-08-19T18:00:00Z"),
    totalQuestionsInPeriod: 4
  });
  assert.equal(result.reserved, false);
  assert.equal(result.reason, "provider_escalation_budget_exhausted");
});

test("provider reservation respects daily and monthly caps", () => {
  const store = createInMemoryIrisProviderBudgetStoreV1({
    timeZone: TZ,
    dailyLimit: 1,
    monthlyLimit: 2,
    maxEscalationPercent: 100
  });
  const day1 = new Date("2026-08-19T18:00:00Z");
  const first = store.reserve({ now: day1, totalQuestionsInPeriod: 10 });
  assert.equal(first.reserved, true);
  store.finalize(first.reservationId);

  const blockedDaily = store.reserve({ now: day1, totalQuestionsInPeriod: 10 });
  assert.equal(blockedDaily.reason, "provider_daily_budget_exhausted");

  const day2 = new Date("2026-08-20T18:00:00Z");
  const second = store.reserve({ now: day2, totalQuestionsInPeriod: 10 });
  assert.equal(second.reserved, true);
  store.finalize(second.reservationId);

  const day3 = new Date("2026-08-21T18:00:00Z");
  const blockedMonthly = store.reserve({ now: day3, totalQuestionsInPeriod: 10 });
  assert.equal(blockedMonthly.reason, "provider_monthly_budget_exhausted");
});

test("reservation consumes the last unit synchronously so a concurrent attempt cannot reuse it", () => {
  const store = createInMemoryIrisProviderBudgetStoreV1({
    timeZone: TZ,
    dailyLimit: 1,
    monthlyLimit: 10,
    maxEscalationPercent: 100
  });
  const now = new Date("2026-08-19T18:00:00Z");
  const first = store.reserve({ now, totalQuestionsInPeriod: 10 });
  const second = store.reserve({ now, totalQuestionsInPeriod: 10 });
  assert.equal(first.reserved, true);
  assert.equal(second.reserved, false);
  assert.equal(second.reason, "provider_daily_budget_exhausted");
});

test("release reconciles a reservation when provider call never starts", () => {
  const store = createInMemoryIrisProviderBudgetStoreV1({
    timeZone: TZ,
    dailyLimit: 1,
    monthlyLimit: 10,
    maxEscalationPercent: 100
  });
  const now = new Date("2026-08-19T18:00:00Z");
  const first = store.reserve({ now, totalQuestionsInPeriod: 10 });
  assert.deepEqual(store.snapshot({ now }), { dailyUsed: 1, monthlyUsed: 1 });
  store.release(first.reservationId);
  assert.deepEqual(store.snapshot({ now }), { dailyUsed: 0, monthlyUsed: 0 });
  assert.equal(store.reserve({ now, totalQuestionsInPeriod: 10 }).reserved, true);
});

test("finalized reservation cannot be released or finalized twice", () => {
  const store = createInMemoryIrisProviderBudgetStoreV1({
    timeZone: TZ,
    dailyLimit: 10,
    monthlyLimit: 10,
    maxEscalationPercent: 100
  });
  const reservation = store.reserve({
    now: new Date("2026-08-19T18:00:00Z"),
    totalQuestionsInPeriod: 10
  });
  store.finalize(reservation.reservationId);
  assert.throws(() => store.finalize(reservation.reservationId), /Reserva inválida/);
  assert.throws(() => store.release(reservation.reservationId), /Reserva inválida/);
});

test("metrics store accepts only aggregate allowlisted metrics", () => {
  const metrics = createInMemoryIrisMetricsStoreV1();
  metrics.record({ name: "questions_total" });
  metrics.record({ name: "provider_input_tokens", value: 250 });
  metrics.record({ name: "response_direct_retrieval" });
  assert.deepEqual(metrics.snapshot(), {
    questions_total: 1,
    provider_input_tokens: 250,
    response_direct_retrieval: 1
  });
});

test("metrics store rejects any extra field, including sensitive data under unknown names", () => {
  const extras = [
    { question: "texto" },
    { answer: "texto" },
    { userId: "123" },
    { deviceId: "abc" },
    { documentKey: "doc_secret" },
    { storageKey: "private/key" },
    { arbitraryMetadata: "could-be-sensitive" }
  ];
  for (const extra of extras) {
    const metrics = createInMemoryIrisMetricsStoreV1();
    assert.throws(
      () => metrics.record({ name: "questions_total", ...extra }),
      /datos no permitidos/
    );
  }
});

test("metrics store rejects arbitrary metric names", () => {
  const metrics = createInMemoryIrisMetricsStoreV1();
  assert.throws(
    () => metrics.record({ name: "raw_user_question" }),
    /Métrica no permitida/
  );
});

test("invalid or missing timezone fails closed", () => {
  assert.throws(
    () => createInMemoryIrisProviderBudgetStoreV1({
      timeZone: "",
      dailyLimit: 1,
      monthlyLimit: 1,
      maxEscalationPercent: 10
    }),
    /Zona horaria/
  );
  assert.throws(
    () => createInMemoryIrisUsageQuotaStoreV1({
      timeZone: "Mars\/Olympus",
      userDailyLimit: 5
    }),
    /Zona horaria/
  );
});
