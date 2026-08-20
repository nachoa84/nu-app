"use strict";

const crypto = require("node:crypto");
const {
  periodKeysV1
} = require("./iris-ai-quota-store-v1");
const {
  ALLOWED_METRIC_NAMES_V1
} = require("./iris-ai-metrics-store-v1");

class IrisAiPostgresStoreErrorV1 extends Error {
  constructor(message) {
    super(message);
    this.name = "IrisAiPostgresStoreErrorV1";
  }
}

class IrisAiPostgresStoreOperationalErrorV1 extends Error {
  constructor() {
    super("No se pudo completar la operación de persistencia de Iris AI.");
    this.name = "IrisAiPostgresStoreOperationalErrorV1";
  }
}

function safeLogV1(error, operation) {
  return {
    operation,
    errorCode:
      typeof error?.code === "string" ? error.code : "",
    constraint:
      typeof error?.constraint === "string"
        ? error.constraint
        : "",
    retryable: Boolean(
      error?.code === "40001" ||
      error?.code === "40P01" ||
      error?.code === "08006"
    )
  };
}

function emitSafeLogV1(logError, error, operation) {
  try {
    logError(safeLogV1(error, operation));
  } catch {
    // El logger nunca debe reemplazar el resultado principal.
  }
}

function assertPositiveIntegerV1(value, label, { optional = false } = {}) {
  if (value == null && optional) return null;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new IrisAiPostgresStoreErrorV1(`${label} inválido.`);
  }
  return value;
}

function assertPercentV1(value) {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    throw new IrisAiPostgresStoreErrorV1(
      "maxEscalationPercent inválido."
    );
  }
  return value;
}

function assertScopeV1(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > 200) {
    throw new IrisAiPostgresStoreErrorV1(`${label} inválido.`);
  }
  return normalized;
}

function monthStartV1(month) {
  return `${month}-01`;
}

function reservationIdV1() {
  return `r_${crypto.randomUUID()}`;
}

function createPostgresIrisAiStoreV1({
  pool,
  logError = () => {}
} = {}) {
  if (!pool || typeof pool.connect !== "function") {
    throw new IrisAiPostgresStoreErrorV1(
      "Se requiere un pool PostgreSQL válido."
    );
  }

  if (typeof logError !== "function") {
    throw new IrisAiPostgresStoreErrorV1(
      "logError debe ser una función."
    );
  }

  async function withTransactionV1(operation, work) {
    let client;
    let committed = false;

    try {
      client = await pool.connect();
      await client.query("BEGIN");

      const result = await work(client);

      await client.query("COMMIT");
      committed = true;

      return result;
    } catch (error) {
      if (client && !committed) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          emitSafeLogV1(
            logError,
            rollbackError,
            `${operation}_rollback`
          );
        }
      }

      if (error instanceof IrisAiPostgresStoreErrorV1) {
        throw error;
      }

      emitSafeLogV1(logError, error, operation);
      throw new IrisAiPostgresStoreOperationalErrorV1();
    } finally {
      if (client) {
        try {
          client.release();
        } catch (error) {
          emitSafeLogV1(
            logError,
            error,
            "release_database_client_v1"
          );
        }
      }
    }
  }

  async function ensureUsageCounterV1(
    client,
    scopeType,
    scopeKey,
    day,
    now
  ) {
    await client.query(
      `INSERT INTO iris_ai_usage_counters (
         scope_type,
         scope_key,
         period_day,
         used_count,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, 0, $4, $4)
       ON CONFLICT (scope_type, scope_key, period_day)
       DO NOTHING`,
      [scopeType, scopeKey, day, now]
    );

    const selected = await client.query(
      `SELECT used_count
       FROM iris_ai_usage_counters
       WHERE scope_type = $1
         AND scope_key = $2
         AND period_day = $3
       FOR UPDATE`,
      [scopeType, scopeKey, day]
    );

    return Number(selected.rows[0]?.used_count || 0);
  }

  async function ensureQuestionCounterV1(
    client,
    monthStart,
    now
  ) {
    await client.query(
      `INSERT INTO iris_ai_question_counters (
         period_month,
         total_questions,
         created_at,
         updated_at
       )
       VALUES ($1, 0, $2, $2)
       ON CONFLICT (period_month)
       DO NOTHING`,
      [monthStart, now]
    );

    const selected = await client.query(
      `SELECT total_questions
       FROM iris_ai_question_counters
       WHERE period_month = $1
       FOR UPDATE`,
      [monthStart]
    );

    return Number(
      selected.rows[0]?.total_questions || 0
    );
  }

  async function consumeUsage({
    userScope,
    deviceScope = null,
    now = new Date(),
    timeZone,
    userDailyLimit,
    deviceDailyLimit = null
  } = {}) {
    const userKey = assertScopeV1(userScope, "userScope");
    const deviceKey =
      deviceScope == null
        ? null
        : assertScopeV1(deviceScope, "deviceScope");

    const safeUserLimit =
      assertPositiveIntegerV1(
        userDailyLimit,
        "userDailyLimit"
      );

    const safeDeviceLimit =
      assertPositiveIntegerV1(
        deviceDailyLimit,
        "deviceDailyLimit",
        { optional: true }
      );

    if (safeDeviceLimit != null && !deviceKey) {
      throw new IrisAiPostgresStoreErrorV1(
        "deviceScope requerido cuando existe límite de dispositivo."
      );
    }

    const { day, month } = periodKeysV1(
      now,
      timeZone
    );

    return withTransactionV1(
      "consume_iris_ai_usage_v1",
      async client => {
        const userUsed =
          await ensureUsageCounterV1(
            client,
            "user",
            userKey,
            day,
            now
          );

        if (userUsed >= safeUserLimit) {
          return {
            allowed: false,
            reason: "user_usage_limit_exhausted",
            totalQuestionsInPeriod: 0
          };
        }

        let deviceUsed = 0;

        if (deviceKey) {
          deviceUsed =
            await ensureUsageCounterV1(
              client,
              "device",
              deviceKey,
              day,
              now
            );

          if (
            safeDeviceLimit != null &&
            deviceUsed >= safeDeviceLimit
          ) {
            return {
              allowed: false,
              reason: "device_usage_limit_exhausted",
              totalQuestionsInPeriod: 0
            };
          }
        }

        await client.query(
          `UPDATE iris_ai_usage_counters
           SET used_count = used_count + 1,
               updated_at = $4
           WHERE scope_type = $1
             AND scope_key = $2
             AND period_day = $3`,
          ["user", userKey, day, now]
        );

        if (deviceKey) {
          await client.query(
            `UPDATE iris_ai_usage_counters
             SET used_count = used_count + 1,
                 updated_at = $4
             WHERE scope_type = $1
               AND scope_key = $2
               AND period_day = $3`,
            ["device", deviceKey, day, now]
          );
        }

        const monthStart = monthStartV1(month);

        const previousTotal =
          await ensureQuestionCounterV1(
            client,
            monthStart,
            now
          );

        await client.query(
          `UPDATE iris_ai_question_counters
           SET total_questions = total_questions + 1,
               updated_at = $2
           WHERE period_month = $1`,
          [monthStart, now]
        );

        return {
          allowed: true,
          reason: "usage_reserved",
          totalQuestionsInPeriod:
            previousTotal + 1
        };
      }
    );
  }

  async function ensureBudgetCounterV1(
    client,
    periodType,
    periodStart,
    now
  ) {
    await client.query(
      `INSERT INTO iris_ai_provider_budget_counters (
         period_type,
         period_start,
         used_count,
         created_at,
         updated_at
       )
       VALUES ($1, $2, 0, $3, $3)
       ON CONFLICT (period_type, period_start)
       DO NOTHING`,
      [periodType, periodStart, now]
    );

    const selected = await client.query(
      `SELECT used_count
       FROM iris_ai_provider_budget_counters
       WHERE period_type = '${periodType}'
         AND period_start = $1
       FOR UPDATE`,
      [periodStart]
    );

    return Number(selected.rows[0]?.used_count || 0);
  }

  async function reserveProviderBudget({
    now = new Date(),
    timeZone,
    dailyLimit,
    monthlyLimit,
    maxEscalationPercent,
    totalQuestionsInPeriod
  } = {}) {
    const safeDailyLimit =
      assertPositiveIntegerV1(
        dailyLimit,
        "dailyLimit"
      );

    const safeMonthlyLimit =
      assertPositiveIntegerV1(
        monthlyLimit,
        "monthlyLimit"
      );

    const safePercent =
      assertPercentV1(maxEscalationPercent);

    const safeTotal =
      assertPositiveIntegerV1(
        totalQuestionsInPeriod,
        "totalQuestionsInPeriod"
      );

    const { day, month } = periodKeysV1(
      now,
      timeZone
    );

    const monthStart = monthStartV1(month);

    return withTransactionV1(
      "reserve_iris_ai_provider_budget_v1",
      async client => {
        const dailyUsed =
          await ensureBudgetCounterV1(
            client,
            "day",
            day,
            now
          );

        const monthlyUsed =
          await ensureBudgetCounterV1(
            client,
            "month",
            monthStart,
            now
          );

        const nextEscalationPercent =
          ((monthlyUsed + 1) / safeTotal) * 100;

        if (dailyUsed >= safeDailyLimit) {
          return {
            reserved: false,
            reason:
              "provider_daily_budget_exhausted"
          };
        }

        if (monthlyUsed >= safeMonthlyLimit) {
          return {
            reserved: false,
            reason:
              "provider_monthly_budget_exhausted"
          };
        }

        if (
          nextEscalationPercent >
          safePercent
        ) {
          return {
            reserved: false,
            reason:
              "provider_escalation_budget_exhausted"
          };
        }

        await client.query(
          `UPDATE iris_ai_provider_budget_counters
           SET used_count = used_count + 1,
               updated_at = $2
           WHERE period_type = 'day'
             AND period_start = $1`,
          [day, now]
        );

        await client.query(
          `UPDATE iris_ai_provider_budget_counters
           SET used_count = used_count + 1,
               updated_at = $2
           WHERE period_type = 'month'
             AND period_start = $1`,
          [monthStart, now]
        );

        const reservationId =
          reservationIdV1();

        await client.query(
          `INSERT INTO iris_ai_provider_reservations (
             reservation_key,
             period_day,
             period_month,
             state,
             created_at,
             reconciled_at
           )
           VALUES (
             $1,
             $2,
             $3,
             'reserved',
             $4,
             NULL
           )`,
          [
            reservationId,
            day,
            monthStart,
            now
          ]
        );

        return {
          reserved: true,
          reason:
            "provider_budget_reserved",
          reservationId
        };
      }
    );
  }

  async function finalizeProviderReservation({
    reservationId,
    now = new Date()
  } = {}) {
    const safeReservationId =
      assertScopeV1(
        reservationId,
        "reservationId"
      );

    return withTransactionV1(
      "finalize_iris_ai_provider_reservation_v1",
      async client => {
        const selected = await client.query(
          `SELECT
             state,
             period_day,
             period_month
           FROM iris_ai_provider_reservations
           WHERE reservation_key = $1
           FOR UPDATE`,
          [safeReservationId]
        );

        const record = selected.rows[0];

        if (
          !record ||
          record.state !== "reserved"
        ) {
          throw new IrisAiPostgresStoreErrorV1(
            "Reserva inválida o ya reconciliada."
          );
        }

        await client.query(
          `UPDATE iris_ai_provider_reservations
           SET state = 'finalized',
               reconciled_at = $2
           WHERE reservation_key = $1`,
          [safeReservationId, now]
        );

        return { finalized: true };
      }
    );
  }

  async function releaseProviderReservation({
    reservationId,
    now = new Date()
  } = {}) {
    const safeReservationId =
      assertScopeV1(
        reservationId,
        "reservationId"
      );

    return withTransactionV1(
      "release_iris_ai_provider_reservation_v1",
      async client => {
        const selected = await client.query(
          `SELECT
             state,
             period_day,
             period_month
           FROM iris_ai_provider_reservations
           WHERE reservation_key = $1
           FOR UPDATE`,
          [safeReservationId]
        );

        const record = selected.rows[0];

        if (
          !record ||
          record.state !== "reserved"
        ) {
          throw new IrisAiPostgresStoreErrorV1(
            "Reserva inválida o ya reconciliada."
          );
        }

        await client.query(
          `UPDATE iris_ai_provider_budget_counters
           SET used_count = GREATEST(0, used_count - 1),
               updated_at = $3
           WHERE
             (period_type = 'day' AND period_start = $1)
             OR
             (period_type = 'month' AND period_start = $2)`,
          [
            record.period_day,
            record.period_month,
            now
          ]
        );

        await client.query(
          `UPDATE iris_ai_provider_reservations
           SET state = 'released',
               reconciled_at = $2
           WHERE reservation_key = $1`,
          [safeReservationId, now]
        );

        return { released: true };
      }
    );
  }

  async function recordMetric({
    name,
    value = 1,
    now = new Date()
  } = {}) {
    const metricName = String(name || "");

    if (!ALLOWED_METRIC_NAMES_V1.has(metricName)) {
      throw new IrisAiPostgresStoreErrorV1(
        "Métrica no permitida."
      );
    }

    if (!Number.isFinite(value) || value < 0) {
      throw new IrisAiPostgresStoreErrorV1(
        "Valor de métrica inválido."
      );
    }

    return withTransactionV1(
      "record_iris_ai_metric_v1",
      async client => {
        await client.query(
          `INSERT INTO iris_ai_metrics (
             metric_name,
             metric_value,
             updated_at
           )
           VALUES ($1, $2, $3)
           ON CONFLICT (metric_name)
           DO UPDATE SET
             metric_value =
               iris_ai_metrics.metric_value
               + EXCLUDED.metric_value,
             updated_at = EXCLUDED.updated_at`,
          [metricName, value, now]
        );

        return { recorded: true };
      }
    );
  }

  return Object.freeze({
    consumeUsage,
    reserveProviderBudget,
    finalizeProviderReservation,
    releaseProviderReservation,
    recordMetric
  });
}

module.exports = {
  IrisAiPostgresStoreErrorV1,
  IrisAiPostgresStoreOperationalErrorV1,
  createPostgresIrisAiStoreV1,
  safeLogV1
};
