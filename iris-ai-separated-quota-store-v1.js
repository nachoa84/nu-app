"use strict";

const { periodKeysV1 } = require("./iris-ai-quota-store-v1");

class IrisAiSeparatedQuotaStoreErrorV1 extends Error {
  constructor(message) {
    super(message);
    this.name = "IrisAiSeparatedQuotaStoreErrorV1";
  }
}

function assertPoolV1(pool) {
  if (!pool || typeof pool.connect !== "function") {
    throw new IrisAiSeparatedQuotaStoreErrorV1("PostgreSQL pool requerido.");
  }
}

function assertScopeV1(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > 200) {
    throw new IrisAiSeparatedQuotaStoreErrorV1(`${label} inválido.`);
  }
  return normalized;
}

function assertOptionalLimitV1(value, label) {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new IrisAiSeparatedQuotaStoreErrorV1(`${label} inválido.`);
  }
  return value;
}

function monthStartV1(month) {
  return `${month}-01`;
}

function createIrisAiSeparatedQuotaStoreV1({ pool, config } = {}) {
  assertPoolV1(pool);
  if (!config || typeof config !== "object") {
    throw new IrisAiSeparatedQuotaStoreErrorV1("config requerido.");
  }

  const userDailyLimit = assertOptionalLimitV1(
    config.providerUserDailyLimit,
    "providerUserDailyLimit"
  );
  const deviceDailyLimit = assertOptionalLimitV1(
    config.providerDeviceDailyLimit,
    "providerDeviceDailyLimit"
  );

  if (userDailyLimit == null) {
    throw new IrisAiSeparatedQuotaStoreErrorV1(
      "providerUserDailyLimit requerido."
    );
  }

  async function withTransactionV1(work) {
    const client = await pool.connect();
    let committed = false;
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      committed = true;
      return result;
    } finally {
      if (!committed) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Preserve original error.
        }
      }
      client.release();
    }
  }

  async function recordQuestion({ now = new Date() } = {}) {
    const { month } = periodKeysV1(now, config.budgetTimezone);
    const periodMonth = monthStartV1(month);

    return withTransactionV1(async client => {
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
        [periodMonth, now]
      );

      const selected = await client.query(
        `SELECT total_questions
         FROM iris_ai_question_counters
         WHERE period_month = $1
         FOR UPDATE`,
        [periodMonth]
      );

      const previousTotal = Number(selected.rows[0]?.total_questions || 0);

      await client.query(
        `UPDATE iris_ai_question_counters
         SET total_questions = total_questions + 1,
             updated_at = $2
         WHERE period_month = $1`,
        [periodMonth, now]
      );

      return {
        allowed: true,
        reason: "question_recorded",
        totalQuestionsInPeriod: previousTotal + 1
      };
    });
  }

  async function ensureProviderCounterV1(client, scopeType, scopeKey, day, now) {
    await client.query(
      `INSERT INTO iris_ai_provider_usage_counters (
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
       FROM iris_ai_provider_usage_counters
       WHERE scope_type = $1
         AND scope_key = $2
         AND period_day = $3
       FOR UPDATE`,
      [scopeType, scopeKey, day]
    );

    return Number(selected.rows[0]?.used_count || 0);
  }

  async function consumeProviderUsage({
    userScope,
    deviceScope = null,
    now = new Date()
  } = {}) {
    const userKey = assertScopeV1(userScope, "userScope");
    const deviceKey =
      deviceScope == null ? null : assertScopeV1(deviceScope, "deviceScope");

    if (deviceDailyLimit != null && !deviceKey) {
      throw new IrisAiSeparatedQuotaStoreErrorV1(
        "deviceScope requerido cuando existe límite de dispositivo."
      );
    }

    const { day } = periodKeysV1(now, config.budgetTimezone);

    return withTransactionV1(async client => {
      const userUsed = await ensureProviderCounterV1(
        client,
        "user",
        userKey,
        day,
        now
      );

      if (userUsed >= userDailyLimit) {
        return {
          allowed: false,
          reason: "provider_user_usage_limit_exhausted"
        };
      }

      let deviceUsed = 0;
      if (deviceKey) {
        deviceUsed = await ensureProviderCounterV1(
          client,
          "device",
          deviceKey,
          day,
          now
        );

        if (deviceDailyLimit != null && deviceUsed >= deviceDailyLimit) {
          return {
            allowed: false,
            reason: "provider_device_usage_limit_exhausted"
          };
        }
      }

      await client.query(
        `UPDATE iris_ai_provider_usage_counters
         SET used_count = used_count + 1,
             updated_at = $4
         WHERE scope_type = $1
           AND scope_key = $2
           AND period_day = $3`,
        ["user", userKey, day, now]
      );

      if (deviceKey) {
        await client.query(
          `UPDATE iris_ai_provider_usage_counters
           SET used_count = used_count + 1,
               updated_at = $4
           WHERE scope_type = $1
             AND scope_key = $2
             AND period_day = $3`,
          ["device", deviceKey, day, now]
        );
      }

      return {
        allowed: true,
        reason: "provider_usage_reserved"
      };
    });
  }

  return Object.freeze({
    recordQuestion,
    consumeProviderUsage
  });
}

module.exports = {
  IrisAiSeparatedQuotaStoreErrorV1,
  createIrisAiSeparatedQuotaStoreV1,
  monthStartV1
};
