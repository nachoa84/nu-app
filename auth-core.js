// NU APP · ACCESO POR CORREO Y CÓDIGO TEMPORAL V110
// Sesiones firmadas por el servidor: el navegador nunca elige su userId.
// Este módulo no conoce Express ni PostgreSQL directamente: recibe un store
// y un enviador de correo, así se puede probar en memoria sin servicios externos.

const crypto = require("crypto");

const DEFAULT_OPTIONS = {
  codeLength: 6,
  codeTtlMs: 10 * 60 * 1000,
  codeMaxAttempts: 5,
  sessionTtlMs: 30 * 24 * 60 * 60 * 1000,
  sessionRefreshMs: 24 * 60 * 60 * 1000,
  requestsPerEmailWindowMs: 15 * 60 * 1000,
  requestsPerEmailMax: 3,
  requestsPerIpWindowMs: 15 * 60 * 1000,
  requestsPerIpMax: 12,
  cookieName: "nu_session",
  legacyLinkingEnabled: true
};

const MIN_PEPPER_LENGTH = 16;

const EMAIL_PATTERN =
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();

  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    throw httpError("Correo inválido.", 400);
  }

  return email;
}

function generateNumericCode(length) {
  let code = "";

  while (code.length < length) {
    // randomInt evita el sesgo de Math.random y de % 10.
    code += String(crypto.randomInt(0, 10));
  }

  return code;
}

// Sólo para tokens de sesión (32 bytes aleatorios): no necesitan pepper
// porque no son adivinables.
function hashSecret(value) {
  return crypto
    .createHash("sha256")
    .update(String(value), "utf8")
    .digest("hex");
}

// Los códigos de seis dígitos sí son adivinables: se guardan como
// HMAC-SHA256 con un pepper que vive fuera de la base de datos.
function createCodeHasher(pepper) {
  const secret = String(pepper || "");

  if (secret.length < MIN_PEPPER_LENGTH) {
    throw new Error(
      `AUTH_CODE_PEPPER debe tener al menos ${MIN_PEPPER_LENGTH} caracteres.`
    );
  }

  return function hashCode(email, code) {
    return crypto
      .createHmac("sha256", secret)
      .update(`${String(email)}:${String(code)}`, "utf8")
      .digest("hex");
  };
}

// Validación de arranque: en producción no se admite el proveedor de
// consola ni la ausencia de pepper.
function assertProductionAuthConfig(env = process.env) {
  if (String(env.NODE_ENV || "").toLowerCase() !== "production") return;

  const pepper = String(env.AUTH_CODE_PEPPER || "");

  if (pepper.length < MIN_PEPPER_LENGTH) {
    throw new Error(
      "AUTH_CODE_PEPPER es obligatorio en producción " +
      `(mínimo ${MIN_PEPPER_LENGTH} caracteres).`
    );
  }

  const provider = String(env.EMAIL_PROVIDER || "").toLowerCase();

  if (!provider || provider === "console") {
    throw new Error(
      "En producción hace falta un proveedor de correo real: " +
      "EMAIL_PROVIDER=console está prohibido."
    );
  }

  // Falla temprano si el proveedor elegido no está bien configurado.
  createEmailSender(env);
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function defaultNameFromEmail(email) {
  const local = String(email).split("@")[0] || "Invitada";
  return local.slice(0, 60);
}

// Proveedor de correo configurable. Nunca incluye claves en el repositorio:
// las credenciales llegan por variables de entorno.
function createEmailSender(env = process.env, logger = console) {
  const provider = String(env.EMAIL_PROVIDER || "console").toLowerCase();
  const from = env.EMAIL_FROM || "no-reply@nu-app.local";
  const isProduction =
    String(env.NODE_ENV || "").toLowerCase() === "production";

  if (provider === "console") {
    if (isProduction) {
      throw new Error(
        "EMAIL_PROVIDER=console está prohibido en producción: " +
        "imprimiría los códigos en los logs."
      );
    }

    return async ({ to, subject, text }) => {
      logger.log(
        `[email:console] para=${to} asunto="${subject}" cuerpo="${text}"`
      );
      return { delivered: false, provider: "console" };
    };
  }

  if (provider === "webhook") {
    const url = env.EMAIL_WEBHOOK_URL;

    if (!url) {
      throw new Error(
        "EMAIL_PROVIDER=webhook requiere EMAIL_WEBHOOK_URL."
      );
    }

    return async ({ to, subject, text }) => {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(env.EMAIL_WEBHOOK_TOKEN
            ? { Authorization: `Bearer ${env.EMAIL_WEBHOOK_TOKEN}` }
            : {})
        },
        body: JSON.stringify({ from, to, subject, text })
      });

      if (!response.ok) {
        throw new Error(
          `El proveedor de correo respondió ${response.status}.`
        );
      }

      return { delivered: true, provider: "webhook" };
    };
  }

  throw new Error(`EMAIL_PROVIDER desconocido: ${provider}.`);
}

function buildCodeEmail(code, ttlMinutes) {
  return {
    subject: "Tu código de acceso a Nu App",
    text:
      `Tu código de acceso es ${code}. ` +
      `Vence en ${ttlMinutes} minutos y sirve una sola vez. ` +
      "Si no pediste este código, ignorá este mensaje."
  };
}

function createAuthService({
  store,
  sendEmail,
  codePepper,
  now = () => new Date(),
  options = {}
}) {
  if (!store) throw new Error("createAuthService requiere un store.");
  if (typeof sendEmail !== "function") {
    throw new Error("createAuthService requiere sendEmail.");
  }

  const config = { ...DEFAULT_OPTIONS, ...options };
  const hashCode = createCodeHasher(codePepper);

  async function assertRateLimits(email, ip) {
    const current = now().getTime();

    const emailCount = await store.countCodesSince(
      email,
      new Date(current - config.requestsPerEmailWindowMs)
    );

    if (emailCount >= config.requestsPerEmailMax) {
      throw httpError(
        "Pediste demasiados códigos para este correo. Esperá unos minutos.",
        429
      );
    }

    if (ip) {
      const ipCount = await store.countCodesByIpSince(
        ip,
        new Date(current - config.requestsPerIpWindowMs)
      );

      if (ipCount >= config.requestsPerIpMax) {
        throw httpError(
          "Demasiadas solicitudes desde esta conexión. Esperá unos minutos.",
          429
        );
      }
    }
  }

  async function requestCode(rawEmail, { ip = null } = {}) {
    const email = normalizeEmail(rawEmail);

    await assertRateLimits(email, ip);

    const code = generateNumericCode(config.codeLength);
    const issuedAt = now();
    const expiresAt = new Date(issuedAt.getTime() + config.codeTtlMs);

    // Un correo tiene como mucho un código vigente.
    await store.invalidateCodesForEmail(email);

    await store.createCode({
      email,
      codeHash: hashCode(email, code),
      expiresAt,
      createdAt: issuedAt,
      requestIp: ip
    });

    const message = buildCodeEmail(
      code,
      Math.round(config.codeTtlMs / 60000)
    );

    await sendEmail({ to: email, ...message });

    return {
      email,
      expiresAt,
      // Solo para pruebas locales; nunca se expone en la respuesta HTTP.
      code
    };
  }

  async function verifyCode(rawEmail, rawCode, { ip = null } = {}) {
    const email = normalizeEmail(rawEmail);
    const code = String(rawCode || "").trim();

    if (!/^\d{4,10}$/.test(code)) {
      throw httpError("Código inválido.", 400);
    }

    // Consumo atómico: el store marca consumed_at en una sola operación
    // condicional, así dos verificaciones simultáneas del mismo código
    // no pueden abrir dos sesiones.
    const outcome = await store.consumeMatchingCode({
      email,
      codeHash: hashCode(email, code),
      now: now(),
      maxAttempts: config.codeMaxAttempts
    });

    if (outcome.status === "expired") {
      throw httpError("El código venció. Pedí uno nuevo.", 401);
    }

    if (outcome.status === "too_many_attempts") {
      throw httpError(
        "Se agotaron los intentos para este código. Pedí uno nuevo.",
        429
      );
    }

    if (outcome.status !== "consumed") {
      throw httpError("Código inválido o vencido.", 401);
    }

    let user = await store.findUserByEmail(email);
    let createdUser = false;

    if (!user) {
      user = await store.createUser({
        id: `usr_${crypto.randomUUID()}`,
        email,
        name: defaultNameFromEmail(email),
        createdAt: now()
      });
      createdUser = true;
    }

    await store.markEmailVerified(user.id, now());

    const session = await createSessionForUser(user.id, { ip });

    return { user, session, createdUser };
  }

  async function createSessionForUser(userId, { ip = null } = {}) {
    const token = generateSessionToken();
    const createdAt = now();

    await store.createSession({
      tokenHash: hashSecret(token),
      userId,
      createdAt,
      expiresAt: new Date(createdAt.getTime() + config.sessionTtlMs),
      requestIp: ip
    });

    return {
      token,
      expiresAt: new Date(createdAt.getTime() + config.sessionTtlMs)
    };
  }

  // Devuelve la sesión válida o null. Nunca lanza por token ausente.
  async function resolveSession(token) {
    if (!token) return null;

    const record = await store.findSessionByHash(hashSecret(token));

    if (!record) return null;

    const current = now().getTime();

    if (new Date(record.expiresAt).getTime() <= current) {
      await store.deleteSessionByHash(record.tokenHash);
      return null;
    }

    if (
      config.sessionRefreshMs > 0 &&
      current - new Date(record.lastSeenAt || record.createdAt).getTime() >
        config.sessionRefreshMs
    ) {
      await store.touchSession(record.tokenHash, now());
    }

    return { userId: record.userId, expiresAt: record.expiresAt };
  }

  async function logout(token) {
    if (!token) return false;
    return store.deleteSessionByHash(hashSecret(token));
  }

  // Transición limitada V110: una cuenta local anterior (sin correo) puede
  // reclamarse una sola vez, desde una sesión ya verificada por correo.
  async function linkLegacyAccount(sessionUserId, rawLegacyUserId) {
    if (!config.legacyLinkingEnabled) {
      throw httpError(
        "La vinculación de cuentas anteriores está deshabilitada.",
        403
      );
    }

    const legacyUserId = String(rawLegacyUserId || "").trim();

    if (!legacyUserId || legacyUserId.length > 128) {
      throw httpError("Identificador anterior inválido.", 400);
    }

    if (legacyUserId === sessionUserId) {
      throw httpError("Esa cuenta ya es la tuya.", 409);
    }

    const current = await store.findUserById(sessionUserId);

    if (!current) throw httpError("Sesión inválida.", 401);

    const legacy = await store.findUserById(legacyUserId);

    if (!legacy) throw httpError("No encontramos esa cuenta anterior.", 404);

    if (legacy.email) {
      throw httpError(
        "Esa cuenta ya está vinculada a un correo.",
        409
      );
    }

    if (await store.userHasProgress(sessionUserId)) {
      throw httpError(
        "Tu cuenta actual ya tiene progreso. Escribinos para unificarlas manualmente.",
        409
      );
    }

    // Todo el traspaso ocurre en una sola transacción del store:
    // vuelve a validar las condiciones con las dos filas bloqueadas,
    // libera el correo de la cuenta temporal, se lo asigna a la anterior,
    // mueve las sesiones y borra la temporal. Cualquier error deshace todo.
    return store.linkLegacyAccount({
      sessionUserId,
      legacyUserId,
      email: current.email,
      now: now()
    });
  }

  async function getUser(userId) {
    return store.findUserById(userId);
  }

  return {
    config,
    getUser,
    requestCode,
    verifyCode,
    resolveSession,
    createSessionForUser,
    logout,
    linkLegacyAccount
  };
}

module.exports = {
  DEFAULT_OPTIONS,
  MIN_PEPPER_LENGTH,
  assertProductionAuthConfig,
  buildCodeEmail,
  createCodeHasher,
  createAuthService,
  createEmailSender,
  generateNumericCode,
  hashSecret,
  httpError,
  normalizeEmail
};
