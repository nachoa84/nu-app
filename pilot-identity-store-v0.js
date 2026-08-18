/**
 * NU APP · SERVICIO TRANSACCIONAL DEL PILOTO DE IDENTIDAD V0
 * Archivo: pilot-identity-store-v0.js
 *
 * Responsabilidad exclusiva:
 *   - Gestión transaccional de invitaciones, credenciales y auditoría.
 *   - PostgreSQL es la única fuente de tiempo.
 *   - Nunca devuelve, almacena ni registra secretos.
 */

const { isIP } = require("node:net");

// ============================================================
// ERRORES
// ============================================================

class PilotStoreError extends Error {
  constructor(message) {
    super(message);
    this.name = "PilotStoreError";
  }
}

class PilotStoreOperationalError extends Error {
  constructor(message) {
    super(message);
    this.name = "PilotStoreOperationalError";
  }
}

// ============================================================
// CONSTANTES
// ============================================================

const MAX_AUDIT_DETAILS_SIZE = 64 * 1024; // 64 KB
const MAX_STRING_LENGTH = 256;
const FORBIDDEN_KEYS = [
  "token", "code", "hmac", "secret", "authorization", "password"
];

// ============================================================
// VALIDACIÓN DE DETALLES DE AUDITORÍA (recursiva, sin ciclos)
// ============================================================

function validateAuditDetails(details) {
  if (details === null || details === undefined) {
    return "VALID";
  }

  if (typeof details !== "object") {
    return "INVALID_STRUCTURE";
  }

  let jsonStr;
  try {
    jsonStr = JSON.stringify(details);
  } catch {
    return "INVALID_STRUCTURE";
  }

  if (jsonStr === undefined || Buffer.byteLength(jsonStr, "utf8") > MAX_AUDIT_DETAILS_SIZE) {
    return "INVALID_STRUCTURE";
  }

  let hasForbiddenKey = false;
  const seen = new WeakSet();

  function check(val) {
    if (val === null) {
      return "VALID";
    }
    if (val === undefined) {
      return "INVALID_STRUCTURE";
    }
    const type = typeof val;
    if (type === "boolean" || type === "string") {
      return "VALID";
    }
    if (type === "number") {
      if (!Number.isFinite(val)) {
        return "INVALID_STRUCTURE";
      }
      return "VALID";
    }
    if (type === "function" || type === "symbol" || type === "bigint") {
      return "INVALID_STRUCTURE";
    }
    if (type !== "object") {
      return "INVALID_STRUCTURE";
    }

    if (seen.has(val)) {
      return "INVALID_STRUCTURE";
    }
    seen.add(val);

    if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) {
        if (!(i in val) || val[i] === undefined) {
          return "INVALID_STRUCTURE";
        }
        const res = check(val[i]);
        if (res !== "VALID") {
          return res;
        }
      }
      return "VALID";
    }

    const keys = Object.keys(val);
    for (const key of keys) {
      const lowerKey = String(key).toLowerCase();
      if (FORBIDDEN_KEYS.includes(lowerKey)) {
        hasForbiddenKey = true;
      }
      const propVal = val[key];
      if (propVal === undefined) {
        return "INVALID_STRUCTURE";
      }
      const res = check(propVal);
      if (res === "INVALID_STRUCTURE") {
        return "INVALID_STRUCTURE";
      }
    }

    return hasForbiddenKey ? "FORBIDDEN_KEY" : "VALID";
  }

  return check(details);
}

// ============================================================
// HELPERS DE VALIDACIÓN
// ============================================================

function isValidString(value, maxLen = Infinity) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLen;
}

function isValidInteger(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function isValidClientIp(value) {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value !== "string") {
    return false;
  }
  return isIP(value.trim()) !== 0;
}

function anonymizeIpv4(ip) {
  const octets = ip.split(".");
  octets[3] = "0";
  return octets.join(".");
}

function anonymizeClientIp(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const ip = value.trim();
  const version = isIP(ip);

  if (version === 4) {
    return anonymizeIpv4(ip);
  }

  if (version !== 6) {
    return null;
  }

  // Conserva el formato IPv4-mapped, pero elimina el último octeto.
  const embeddedIpv4 = ip.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (embeddedIpv4 && isIP(embeddedIpv4[2]) === 4) {
    return `${embeddedIpv4[1]}${anonymizeIpv4(embeddedIpv4[2])}`;
  }

  // Expande IPv6 y conserva únicamente los primeros 64 bits.
  const address = ip.split("%", 1)[0].toLowerCase();
  const halves = address.split("::");
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length > 1 && halves[1] ? halves[1].split(":") : [];
  const omitted = 8 - left.length - right.length;
  const hextets = halves.length > 1
    ? [...left, ...Array(omitted).fill("0"), ...right]
    : left;

  return [...hextets.slice(0, 4), "0", "0", "0", "0"].join(":");
}

// ============================================================
// SANITIZACIÓN DE ERRORES PARA LOGGING
// ============================================================

function sanitizeErrorForLog(error) {
  return {
    operation: error.operation || "unknown",
    errorCode: error.code || "",
    constraint: error.constraint || "",
    retryable: error.retryable || false
  };
}

// ============================================================
// TRANSACCIONES
// ============================================================

async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignorar errores de rollback
    }
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================
// FACTORY
// ============================================================

function createPilotIdentityStoreV0({
  pool,
  crypto,
  logError,
  generateUserId,
  normalizeProfile,
  credentialTtlDays = 30,
  registrationInvitationTtlHours = 48,
  recoveryInvitationTtlHours = 24,
  maxCollisionRetries = 5
}) {
  // ── Validación de parámetros de factory ──
  if (!pool || typeof pool.connect !== "function" || typeof pool.query !== "function") {
    throw new PilotStoreError("El pool de PostgreSQL no es valido.");
  }
  if (!crypto || typeof crypto.generateInvitationCode !== "function") {
    throw new PilotStoreError("El modulo criptografico no es valido.");
  }
  if (typeof logError !== "function") {
    throw new PilotStoreError("El logger de errores debe ser una funcion.");
  }
  if (typeof generateUserId !== "function") {
    throw new PilotStoreError("generateUserId debe ser una funcion.");
  }
  const testUserId = generateUserId();
  if (typeof testUserId !== "string" || testUserId.trim().length === 0 || testUserId.length > 64) {
    throw new PilotStoreError("generateUserId debe producir un string no vacio de longitud razonable.");
  }
  if (typeof normalizeProfile !== "function") {
    throw new PilotStoreError("normalizeProfile debe ser una funcion.");
  }
  if (!isValidInteger(credentialTtlDays, 1, 90)) {
    throw new PilotStoreError("credentialTtlDays debe ser un entero entre 1 y 90.");
  }
  if (!isValidInteger(registrationInvitationTtlHours, 1, 168)) {
    throw new PilotStoreError("registrationInvitationTtlHours debe ser un entero entre 1 y 168.");
  }
  if (!isValidInteger(recoveryInvitationTtlHours, 1, 168)) {
    throw new PilotStoreError("recoveryInvitationTtlHours debe ser un entero entre 1 y 168.");
  }
  if (!isValidInteger(maxCollisionRetries, 1, 10)) {
    throw new PilotStoreError("maxCollisionRetries debe ser un entero entre 1 y 10.");
  }

  // ============================================================
  // HELPERS INTERNOS
  // ============================================================

  function logOperationalError(operation, pgError, retryable = false) {
    const sanitized = sanitizeErrorForLog({
      operation,
      code: pgError.code || "",
      constraint: pgError.constraint || "",
      retryable
    });
    try {
      logError(sanitized);
    } catch {
      // Ignorar fallos del logger
    }
  }

  function isTokenCollisionError(error) {
    return error.code === "23505" && error.constraint === "pilot_credentials_token_hmac_unique";
  }

  // ============================================================
  // 6.1 createRegistrationInvitation
  // ============================================================

  async function createRegistrationInvitation({ expiresInHours, adminKeyId, clientIp = null }) {
    if (!isValidString(adminKeyId, MAX_STRING_LENGTH)) {
      throw new PilotStoreError("El identificador de administrador no es valido.");
    }
    if (!isValidClientIp(clientIp)) {
      throw new PilotStoreError("La direccion IP no es valida.");
    }

    const ttl = expiresInHours !== undefined ? expiresInHours : registrationInvitationTtlHours;
    if (!isValidInteger(ttl, 1, 168)) {
      throw new PilotStoreError("El tiempo de expiracion no es valido.");
    }

    for (let attempt = 0; attempt < maxCollisionRetries; attempt++) {
      const code = crypto.generateInvitationCode();
      const hmac = crypto.hmacInvitation(code);

      try {
        const result = await withTransaction(pool, async (client) => {
          const insertRes = await client.query(
            `INSERT INTO pilot_invitations (
              code_hmac, invitation_type, recovery_user_id,
              created_at, expires_at, used_at, used_by_user_id
            ) VALUES (
              $1, 'registration', NULL,
              CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + ($2::integer * INTERVAL '1 hour'), NULL, NULL
            )
            ON CONFLICT (code_hmac) DO NOTHING
            RETURNING id, created_at, expires_at`,
            [hmac, ttl]
          );

          if (insertRes.rowCount === 0) {
            throw new PilotStoreOperationalError("COLLISION");
          }

          const row = insertRes.rows[0];

          await client.query(
            `INSERT INTO pilot_admin_audit (
              admin_key_id, action, target_user_id, details, client_ip, created_at
            ) VALUES (
              $1, 'create_registration_invitation', NULL, NULL, $2::inet, CURRENT_TIMESTAMP
            )`,
            [adminKeyId, anonymizeClientIp(clientIp)]
          );

          return {
            id: Number(row.id),
            code,
            expiresAt: row.expires_at
          };
        });

        return { ok: true, invitation: result };
      } catch (error) {
        if (error.message === "COLLISION") {
          continue;
        }
        logOperationalError("createRegistrationInvitation", error);
        throw new PilotStoreOperationalError("No se pudo completar la operacion.");
      }
    }

    logOperationalError("createRegistrationInvitation", { code: "23505", constraint: "pilot_invitations_code_hmac_unique" }, true);
    throw new PilotStoreOperationalError("No se pudo completar la operacion.");
  }

  // ============================================================
  // 6.2 createRecoveryInvitation
  // ============================================================

  async function createRecoveryInvitation({ userId, expiresInHours, adminKeyId, clientIp = null }) {
    if (!isValidString(adminKeyId, MAX_STRING_LENGTH)) {
      throw new PilotStoreError("El identificador de administrador no es valido.");
    }
    if (!isValidClientIp(clientIp)) {
      throw new PilotStoreError("La direccion IP no es valida.");
    }
    if (typeof userId !== "string" || userId.trim().length === 0) {
      throw new PilotStoreError("Usuario no encontrado.");
    }

    const ttl = expiresInHours !== undefined ? expiresInHours : recoveryInvitationTtlHours;
    if (!isValidInteger(ttl, 1, 168)) {
      throw new PilotStoreError("El tiempo de expiracion no es valido.");
    }

    for (let attempt = 0; attempt < maxCollisionRetries; attempt++) {
      const code = crypto.generateInvitationCode();
      const hmac = crypto.hmacInvitation(code);

      try {
        const result = await withTransaction(pool, async (client) => {
          const userRes = await client.query(
            "SELECT id FROM users WHERE id = $1 FOR KEY SHARE",
            [userId]
          );

          if (userRes.rowCount === 0) {
            throw new PilotStoreError("Usuario no encontrado.");
          }

          const insertRes = await client.query(
            `INSERT INTO pilot_invitations (
              code_hmac, invitation_type, recovery_user_id,
              created_at, expires_at, used_at, used_by_user_id
            ) VALUES (
              $1, 'recovery', $2,
              CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + ($3::integer * INTERVAL '1 hour'), NULL, NULL
            )
            ON CONFLICT (code_hmac) DO NOTHING
            RETURNING id, recovery_user_id, created_at, expires_at`,
            [hmac, userId, ttl]
          );

          if (insertRes.rowCount === 0) {
            throw new PilotStoreOperationalError("COLLISION");
          }

          const row = insertRes.rows[0];

          await client.query(
            `INSERT INTO pilot_admin_audit (
              admin_key_id, action, target_user_id, details, client_ip, created_at
            ) VALUES (
              $1, 'create_recovery_invitation', $2, NULL, $3::inet, CURRENT_TIMESTAMP
            )`,
            [adminKeyId, userId, anonymizeClientIp(clientIp)]
          );

          return {
            id: Number(row.id),
            code,
            recoveryUserId: row.recovery_user_id,
            expiresAt: row.expires_at
          };
        });

        return { ok: true, invitation: result };
      } catch (error) {
        if (error instanceof PilotStoreError) {
          throw error;
        }
        if (error.message === "COLLISION") {
          continue;
        }
        logOperationalError("createRecoveryInvitation", error);
        throw new PilotStoreOperationalError("No se pudo completar la operacion.");
      }
    }

    logOperationalError("createRecoveryInvitation", { code: "23505", constraint: "pilot_invitations_code_hmac_unique" }, true);
    throw new PilotStoreOperationalError("No se pudo completar la operacion.");
  }

  // ============================================================
  // 6.3 registerUser
  // ============================================================

  async function registerUser({ invitationCode, profile }) {
    let userId;
    let normalizedProfile;
    try {
      userId = generateUserId();
      if (typeof userId !== "string" || userId.trim().length === 0 || userId.length > 64) {
        throw new Error("Invalid userId");
      }
      normalizedProfile = normalizeProfile({ ...profile, userId });
    } catch {
      throw new PilotStoreError("El perfil no es valido.");
    }

    let hmac;
    try {
      const normalizedCode = crypto.normalizeInvitationCode(invitationCode);
      hmac = crypto.hmacInvitation(normalizedCode);
    } catch {
      throw new PilotStoreError("La invitacion no es valida o ya fue utilizada.");
    }

    for (let attempt = 0; attempt < maxCollisionRetries; attempt++) {
      const token = crypto.generateToken();
      const tokenHmac = crypto.hmacToken(token);

      try {
        const result = await withTransaction(pool, async (client) => {
          const invRes = await client.query(
            `SELECT id, invitation_type, recovery_user_id, used_at, expires_at, created_at,
                    expires_at > CURRENT_TIMESTAMP AS is_unexpired
             FROM pilot_invitations
             WHERE code_hmac = $1
             FOR UPDATE`,
            [hmac]
          );

          if (invRes.rowCount !== 1) {
            throw new PilotStoreError("La invitacion no es valida o ya fue utilizada.");
          }

          const inv = invRes.rows[0];
          if (
            inv.invitation_type !== "registration" ||
            inv.recovery_user_id !== null ||
            inv.used_at !== null ||
            !inv.is_unexpired
          ) {
            throw new PilotStoreError("La invitacion no es valida o ya fue utilizada.");
          }

          await client.query(
            `INSERT INTO users (
              id, name, country, timezone, notification_time,
              current_day, cycle, next_unlock_at,
              created_at, updated_at, last_seen_at
            ) VALUES (
              $1, $2, $3, $4, $5,
              1, 1, NULL,
              CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )`,
            [
              normalizedProfile.userId,
              normalizedProfile.name,
              normalizedProfile.country,
              normalizedProfile.timezone,
              normalizedProfile.notificationTime
            ]
          );

          const credRes = await client.query(
            `INSERT INTO pilot_credentials (
              user_id, token_hmac, created_at, expires_at, revoked_at, last_used_at
            ) VALUES (
              $1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + ($3::integer * INTERVAL '1 day'), NULL, CURRENT_TIMESTAMP
            )
            RETURNING expires_at`,
            [normalizedProfile.userId, tokenHmac, credentialTtlDays]
          );

          await client.query(
            `UPDATE pilot_invitations
             SET used_at = CURRENT_TIMESTAMP,
                 used_by_user_id = $1
             WHERE id = $2`,
            [normalizedProfile.userId, inv.id]
          );

          return {
            user: {
              userId: normalizedProfile.userId,
              name: normalizedProfile.name,
              country: normalizedProfile.country,
              timezone: normalizedProfile.timezone,
              notificationTime: normalizedProfile.notificationTime,
              currentDay: 1,
              cycle: 1
            },
            credential: {
              token,
              expiresAt: credRes.rows[0].expires_at
            }
          };
        });

        return { ok: true, ...result };
      } catch (error) {
        if (error instanceof PilotStoreError) {
          throw error;
        }
        if (isTokenCollisionError(error)) {
          continue;
        }
        logOperationalError("registerUser", error);
        throw new PilotStoreOperationalError("No se pudo completar la operacion.");
      }
    }

    logOperationalError("registerUser", { code: "23505", constraint: "pilot_credentials_token_hmac_unique" }, true);
    throw new PilotStoreOperationalError("No se pudo completar la operacion.");
  }

  // ============================================================
  // 6.4 recoverAccess
  // ============================================================

  async function recoverAccess({ invitationCode }) {
    let hmac;
    let prelimUserId = null;

    try {
      const normalizedCode = crypto.normalizeInvitationCode(invitationCode);
      hmac = crypto.hmacInvitation(normalizedCode);
    } catch {
      throw new PilotStoreError("La invitacion no es valida o ya fue utilizada.");
    }

    try {
      const prelimRes = await pool.query(
        "SELECT recovery_user_id FROM pilot_invitations WHERE code_hmac = $1",
        [hmac]
      );
      if (prelimRes.rowCount === 1) {
        prelimUserId = prelimRes.rows[0].recovery_user_id;
      }
    } catch (error) {
      logOperationalError("recoverAccess", error);
      throw new PilotStoreOperationalError("No se pudo completar la operacion.");
    }

    for (let attempt = 0; attempt < maxCollisionRetries; attempt++) {
      const token = crypto.generateToken();
      const tokenHmac = crypto.hmacToken(token);

      try {
        const result = await withTransaction(pool, async (client) => {
          let userId = prelimUserId;

          if (userId) {
            const userRes = await client.query(
              "SELECT id FROM users WHERE id = $1 FOR UPDATE",
              [userId]
            );
            if (userRes.rowCount === 0) {
              throw new PilotStoreError("La invitacion no es valida o ya fue utilizada.");
            }
          }

          const invRes = await client.query(
            `SELECT id, invitation_type, recovery_user_id, used_at, expires_at, created_at,
                    expires_at > CURRENT_TIMESTAMP AS is_unexpired
             FROM pilot_invitations
             WHERE code_hmac = $1
             FOR UPDATE`,
            [hmac]
          );

          if (invRes.rowCount !== 1) {
            throw new PilotStoreError("La invitacion no es valida o ya fue utilizada.");
          }

          const inv = invRes.rows[0];
          if (
            inv.invitation_type !== "recovery" ||
            inv.recovery_user_id === null ||
            inv.used_at !== null ||
            !inv.is_unexpired
          ) {
            throw new PilotStoreError("La invitacion no es valida o ya fue utilizada.");
          }

          if (!userId) {
            userId = inv.recovery_user_id;
            const userRes = await client.query(
              "SELECT id FROM users WHERE id = $1 FOR UPDATE",
              [userId]
            );
            if (userRes.rowCount === 0) {
              throw new PilotStoreError("La invitacion no es valida o ya fue utilizada.");
            }
          } else if (userId !== inv.recovery_user_id) {
            throw new PilotStoreError("La invitacion no es valida o ya fue utilizada.");
          }

          const credRes = await client.query(
            `SELECT id, user_id, token_hmac, created_at, expires_at, revoked_at
             FROM pilot_credentials
             WHERE user_id = $1 AND revoked_at IS NULL
             FOR UPDATE`,
            [userId]
          );

          if (credRes.rowCount === 1) {
            const cred = credRes.rows[0];
            const credCreatedAt = new Date(cred.created_at).getTime();
            const invCreatedAt = new Date(inv.created_at).getTime();
            if (credCreatedAt > invCreatedAt) {
              throw new PilotStoreError("La invitacion no es valida o ya fue utilizada.");
            }
          }

          await client.query(
            `UPDATE pilot_credentials
             SET revoked_at = CURRENT_TIMESTAMP
             WHERE user_id = $1 AND revoked_at IS NULL`,
            [userId]
          );

          const newCredRes = await client.query(
            `INSERT INTO pilot_credentials (
              user_id, token_hmac, created_at, expires_at, revoked_at, last_used_at
            ) VALUES (
              $1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + ($3::integer * INTERVAL '1 day'), NULL, CURRENT_TIMESTAMP
            )
            RETURNING expires_at`,
            [userId, tokenHmac, credentialTtlDays]
          );

          await client.query(
            `UPDATE pilot_invitations
             SET used_at = CURRENT_TIMESTAMP,
                 used_by_user_id = $1
             WHERE id = $2`,
            [userId, inv.id]
          );

          const userRes = await client.query(
            "SELECT id, name, country, timezone, notification_time FROM users WHERE id = $1",
            [userId]
          );

          const userRow = userRes.rows[0];

          return {
            user: {
              userId: userRow.id,
              name: userRow.name,
              country: userRow.country,
              timezone: userRow.timezone,
              notificationTime: userRow.notification_time
            },
            credential: {
              token,
              expiresAt: newCredRes.rows[0].expires_at
            }
          };
        });

        return { ok: true, ...result };
      } catch (error) {
        if (error instanceof PilotStoreError) {
          throw error;
        }
        if (isTokenCollisionError(error)) {
          continue;
        }
        logOperationalError("recoverAccess", error);
        throw new PilotStoreOperationalError("No se pudo completar la operacion.");
      }
    }

    logOperationalError("recoverAccess", { code: "23505", constraint: "pilot_credentials_token_hmac_unique" }, true);
    throw new PilotStoreOperationalError("No se pudo completar la operacion.");
  }

  // ============================================================
  // 6.5 renewCredential
  // ============================================================

  async function renewCredential({ currentToken }) {
    let tokenHmac;
    let prelimUserId = null;

    try {
      const normalizedToken = crypto.normalizeToken(currentToken);
      tokenHmac = crypto.hmacToken(normalizedToken);
    } catch {
      throw new PilotStoreError("La sesion no es valida o ha expirado.");
    }

    try {
      const prelimRes = await pool.query(
        "SELECT user_id FROM pilot_credentials WHERE token_hmac = $1",
        [tokenHmac]
      );
      if (prelimRes.rowCount === 1) {
        prelimUserId = prelimRes.rows[0].user_id;
      } else {
        throw new PilotStoreError("La sesion no es valida o ha expirado.");
      }
    } catch (error) {
      if (error instanceof PilotStoreError) {
        throw error;
      }
      logOperationalError("renewCredential", error);
      throw new PilotStoreOperationalError("No se pudo completar la operacion.");
    }

    for (let attempt = 0; attempt < maxCollisionRetries; attempt++) {
      const newToken = crypto.generateToken();
      const newTokenHmac = crypto.hmacToken(newToken);

      try {
        const result = await withTransaction(pool, async (client) => {
          await client.query(
            "SELECT id FROM users WHERE id = $1 FOR UPDATE",
            [prelimUserId]
          );

          const credRes = await client.query(
            `SELECT id, user_id, expires_at, revoked_at,
                    expires_at > CURRENT_TIMESTAMP AS is_unexpired
             FROM pilot_credentials
             WHERE token_hmac = $1
             FOR UPDATE`,
            [tokenHmac]
          );

          if (credRes.rowCount !== 1) {
            throw new PilotStoreError("La sesion no es valida o ha expirado.");
          }

          const cred = credRes.rows[0];
          if (cred.revoked_at !== null || !cred.is_unexpired) {
            throw new PilotStoreError("La sesion no es valida o ha expirado.");
          }

          await client.query(
            "UPDATE pilot_credentials SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1",
            [cred.id]
          );

          const newCredRes = await client.query(
            `INSERT INTO pilot_credentials (
              user_id, token_hmac, created_at, expires_at, revoked_at, last_used_at
            ) VALUES (
              $1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + ($3::integer * INTERVAL '1 day'), NULL, CURRENT_TIMESTAMP
            )
            RETURNING expires_at`,
            [prelimUserId, newTokenHmac, credentialTtlDays]
          );

          return {
            token: newToken,
            expiresAt: newCredRes.rows[0].expires_at
          };
        });

        return { ok: true, credential: result };
      } catch (error) {
        if (error instanceof PilotStoreError) {
          throw error;
        }
        if (isTokenCollisionError(error)) {
          continue;
        }
        logOperationalError("renewCredential", error);
        throw new PilotStoreOperationalError("No se pudo completar la operacion.");
      }
    }

    logOperationalError("renewCredential", { code: "23505", constraint: "pilot_credentials_token_hmac_unique" }, true);
    throw new PilotStoreOperationalError("No se pudo completar la operacion.");
  }

  // ============================================================
  // 6.6 authenticateCredential
  // ============================================================

  async function authenticateCredential({ token }) {
    let tokenHmac;
    try {
      const normalizedToken = crypto.normalizeToken(token);
      tokenHmac = crypto.hmacToken(normalizedToken);
    } catch {
      throw new PilotStoreError("La sesion no es valida o ha expirado.");
    }

    try {
      const res = await pool.query(
        `SELECT user_id, expires_at
         FROM pilot_credentials
         WHERE token_hmac = $1
           AND revoked_at IS NULL
           AND expires_at > CURRENT_TIMESTAMP`,
        [tokenHmac]
      );

      if (res.rowCount !== 1) {
        throw new PilotStoreError("La sesion no es valida o ha expirado.");
      }

      const row = res.rows[0];
      return {
        ok: true,
        userId: row.user_id,
        expiresAt: row.expires_at
      };
    } catch (error) {
      if (error instanceof PilotStoreError) {
        throw error;
      }
      logOperationalError("authenticateCredential", error);
      throw new PilotStoreOperationalError("No se pudo completar la operacion.");
    }
  }

  // ============================================================
  // 6.7 revokeAllCredentials
  // ============================================================

  async function revokeAllCredentials({ userId, adminKeyId, clientIp = null }) {
    if (!isValidString(adminKeyId, MAX_STRING_LENGTH)) {
      throw new PilotStoreError("El identificador de administrador no es valido.");
    }
    if (!isValidClientIp(clientIp)) {
      throw new PilotStoreError("La direccion IP no es valida.");
    }
    if (typeof userId !== "string" || userId.trim().length === 0) {
      throw new PilotStoreError("No se pudieron revocar las credenciales.");
    }

    try {
      const result = await withTransaction(pool, async (client) => {
        const userRes = await client.query(
          "SELECT id FROM users WHERE id = $1 FOR UPDATE",
          [userId]
        );

        if (userRes.rowCount === 0) {
          throw new PilotStoreError("El usuario no existe.");
        }

        const revokeRes = await client.query(
          `UPDATE pilot_credentials
           SET revoked_at = CURRENT_TIMESTAMP
           WHERE user_id = $1 AND revoked_at IS NULL`,
          [userId]
        );

        await client.query(
          `INSERT INTO pilot_admin_audit (
            admin_key_id, action, target_user_id, details, client_ip, created_at
          ) VALUES (
            $1, 'revoke_all_credentials', $2, NULL, $3::inet, CURRENT_TIMESTAMP
          )`,
          [adminKeyId, userId, anonymizeClientIp(clientIp)]
        );

        return { revokedCount: revokeRes.rowCount };
      });

      return { ok: true, ...result };
    } catch (error) {
      if (error instanceof PilotStoreError) {
        throw error;
      }
      logOperationalError("revokeAllCredentials", error);
      throw new PilotStoreOperationalError("No se pudo completar la operacion.");
    }
  }

  // ============================================================
  // 6.8 getCredentialExpiry
  // ============================================================

  async function getCredentialExpiry({ token }) {
    let tokenHmac;
    try {
      const normalizedToken = crypto.normalizeToken(token);
      tokenHmac = crypto.hmacToken(normalizedToken);
    } catch {
      throw new PilotStoreError("La sesion no es valida o ha expirado.");
    }

    try {
      const res = await pool.query(
        `SELECT expires_at,
               GREATEST(
                 0,
                 CEIL(EXTRACT(EPOCH FROM (expires_at - CURRENT_TIMESTAMP)) / 86400)
               )::INTEGER AS days_until_expiry
         FROM pilot_credentials
         WHERE token_hmac = $1
           AND revoked_at IS NULL
           AND expires_at > CURRENT_TIMESTAMP`,
        [tokenHmac]
      );

      if (res.rowCount !== 1) {
        throw new PilotStoreError("La sesion no es valida o ha expirado.");
      }

      const row = res.rows[0];
      return {
        ok: true,
        expiresAt: row.expires_at,
        daysUntilExpiry: row.days_until_expiry
      };
    } catch (error) {
      if (error instanceof PilotStoreError) {
        throw error;
      }
      logOperationalError("getCredentialExpiry", error);
      throw new PilotStoreOperationalError("No se pudo completar la operacion.");
    }
  }

  // ============================================================
  // 6.9 recordAdminAudit
  // ============================================================

  async function recordAdminAudit({ adminKeyId, action, targetUserId = null, details = null, clientIp = null }) {
    if (!isValidString(adminKeyId, MAX_STRING_LENGTH)) {
      throw new PilotStoreError("El identificador de administrador no es valido.");
    }

    if (!isValidString(action, MAX_STRING_LENGTH)) {
      throw new PilotStoreError("La accion no es valida.");
    }

    if (!isValidClientIp(clientIp)) {
      throw new PilotStoreError("La direccion IP no es valida.");
    }

    if (details !== null && details !== undefined) {
      const result = validateAuditDetails(details);
      if (result === "FORBIDDEN_KEY") {
        throw new PilotStoreError("Los detalles de auditoria contienen campos no permitidos.");
      }
      if (result === "INVALID_STRUCTURE") {
        throw new PilotStoreError("Los detalles de auditoria no son validos.");
      }
    }

    if (targetUserId !== null && targetUserId !== undefined) {
      if (typeof targetUserId !== "string" || targetUserId.trim().length === 0) {
        throw new PilotStoreError("El usuario objetivo no es valido.");
      }
    }

    try {
      const result = await withTransaction(pool, async (client) => {
        const res = await client.query(
          `INSERT INTO pilot_admin_audit (
            admin_key_id, action, target_user_id, details, client_ip, created_at
          ) VALUES (
            $1, $2, $3, $4::jsonb, $5::inet, CURRENT_TIMESTAMP
          )
          RETURNING id`,
          [
            adminKeyId,
            action,
            targetUserId,
            details !== null ? JSON.stringify(details) : null,
            anonymizeClientIp(clientIp)
          ]
        );

        return { auditId: Number(res.rows[0].id) };
      });

      return { ok: true, ...result };
    } catch (error) {
      logOperationalError("recordAdminAudit", error);
      throw new PilotStoreOperationalError("No se pudo completar la operacion.");
    }
  }

  // ============================================================
  // RETORNO
  // ============================================================

  return {
    createRegistrationInvitation,
    createRecoveryInvitation,
    registerUser,
    recoverAccess,
    renewCredential,
    authenticateCredential,
    revokeAllCredentials,
    getCredentialExpiry,
    recordAdminAudit
  };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  createPilotIdentityStoreV0,
  PilotStoreError,
  PilotStoreOperationalError
};
