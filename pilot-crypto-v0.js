/**
 * NU APP · MODULO CRIPTOGRAFICO PILOTO V0
 * Archivo: pilot-crypto-v0.js
 *
 * Responsabilidad exclusiva:
 *   - Generar y validar codigos de invitacion (128 bits).
 *   - Generar y validar tokens de sesion (256 bits).
 *   - Calcular HMAC-SHA256 con claves independientes.
 *
 * Seguridad:
 *   - Usa unicamente node:crypto.
 *   - Nunca almacena ni registra codigos o tokens legibles.
 *   - Los errores nunca incluyen claves, codigos ni tokens.
 *   - Las claves se reciben en Base64 y se validan estrictamente.
 */

const crypto = require("node:crypto");

// ============================================================
// CONSTANTES
// ============================================================

const INVITATION_PREFIX = "npi_";
const INVITATION_RANDOM_BYTES = 16;   // 128 bits
const INVITATION_CODE_LENGTH = INVITATION_PREFIX.length + 32; // npi_ + 32 hex chars

const TOKEN_PREFIX = "npt_";
const TOKEN_RANDOM_BYTES = 32;        // 256 bits
const TOKEN_BASE64URL_LENGTH = 43;    // ceil(32 * 8 / 6) = 43, sin padding

const HMAC_ALGORITHM = "sha256";
const HMAC_KEY_LENGTH = 32;           // 256 bits

// ============================================================
// ERRORES SEGUROS
// ============================================================

class PilotCryptoError extends Error {
  constructor(message) {
    super(message);
    this.name = "PilotCryptoError";
  }
}

// ============================================================
// VALIDACION DE CLAVES BASE64
// ============================================================

/**
 * Decodifica una clave Base64 y valida que sea exactamente 32 bytes.
 *
 * Rechaza:
 *   - Cadenas vacias o solo espacios.
 *   - Base64 malformado (caracteres no validos, padding incorrecto).
 *   - Longitud decodificada distinta de 32 bytes.
 *
 * @param {string} label - Etiqueta para mensajes de error ("invitacion" | "token").
 * @param {string} base64Key - Clave en formato Base64 estandar.
 * @returns {Buffer} - Buffer de exactamente 32 bytes.
 * @throws {PilotCryptoError} - Si la clave no es valida.
 */
function decodeAndValidateKey(label, base64Key) {
  if (typeof base64Key !== "string") {
    throw new PilotCryptoError(
      `La clave HMAC de ${label} debe ser una cadena Base64.`
    );
  }

  const trimmed = base64Key.trim();

  if (trimmed.length === 0) {
    throw new PilotCryptoError(
      `La clave HMAC de ${label} esta vacia.`
    );
  }

  // Rechazar Base64 no canonico: padding implicito o caracteres no estandar
  // Base64 estandar: A-Z, a-z, 0-9, +, /, = (padding al final)
  const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Pattern.test(trimmed)) {
    throw new PilotCryptoError(
      `La clave HMAC de ${label} contiene caracteres Base64 no validos.`
    );
  }

  let decoded;
  try {
    decoded = Buffer.from(trimmed, "base64");
  } catch {
    throw new PilotCryptoError(
      `La clave HMAC de ${label} no es Base64 valido.`
    );
  }

  // Validar que la decodificacion sea canonica (sin bytes fantasmas por padding malformado)
  const reencoded = decoded.toString("base64");
  if (reencoded !== trimmed) {
    throw new PilotCryptoError(
      `La clave HMAC de ${label} no es Base64 canonico.`
    );
  }

  if (decoded.length !== HMAC_KEY_LENGTH) {
    throw new PilotCryptoError(
      `La clave HMAC de ${label} debe decodificar exactamente ${HMAC_KEY_LENGTH} bytes, ` +
      `pero decodifico ${decoded.length}.`
    );
  }

  return decoded;
}

// ============================================================
// INVITACIONES
// ============================================================

/**
 * Genera un codigo de invitacion de 128 bits.
 *
 * Formato: "npi_" + 32 caracteres hexadecimales (16 bytes).
 * Ejemplo: npi_a1b2c3d4e5f6789012345678abcdef01
 *
 * @param {Function} randomBytesFn - Funcion que devuelve un Buffer de N bytes.
 * @returns {string} - Codigo de invitacion completo.
 */
function generateInvitationCode(randomBytesFn) {
  const random = randomBytesFn(INVITATION_RANDOM_BYTES);
  if (!Buffer.isBuffer(random) || random.length !== INVITATION_RANDOM_BYTES) {
    throw new PilotCryptoError(
      "El generador aleatorio no produjo el buffer esperado."
    );
  }
  return INVITATION_PREFIX + random.toString("hex");
}

/**
 * Normaliza un codigo de invitacion: minusculas, sin espacios.
 *
 * @param {string} code - Codigo en cualquier formato mixto.
 * @returns {string} - Codigo normalizado.
 */
function normalizeInvitationCode(code) {
  return String(code || "").trim().toLowerCase();
}

/**
 * Valida estrictamente un codigo de invitacion.
 *
 * Rechaza:
 *   - Valores que no sean string.
 *   - Cadenas vacias.
 *   - Prefijos incorrectos.
 *   - Longitudes distintas de 36 caracteres (npi_ + 32 hex).
 *   - Caracteres no hexadecimales despues del prefijo.
 *
 * @param {string} code - Codigo a validar.
 * @returns {string} - Codigo normalizado y validado.
 * @throws {PilotCryptoError} - Si el codigo es invalido.
 */
function validateInvitationCode(code) {
  if (typeof code !== "string") {
    throw new PilotCryptoError(
      "El codigo de invitacion debe ser una cadena."
    );
  }

  const normalized = normalizeInvitationCode(code);

  if (normalized.length === 0) {
    throw new PilotCryptoError("El codigo de invitacion esta vacio.");
  }

  if (!normalized.startsWith(INVITATION_PREFIX)) {
    throw new PilotCryptoError(
      `El codigo de invitacion debe comenzar con "${INVITATION_PREFIX}".`
    );
  }

  if (normalized.length !== INVITATION_CODE_LENGTH) {
    throw new PilotCryptoError(
      `El codigo de invitacion debe tener exactamente ${INVITATION_CODE_LENGTH} ` +
      `caracteres, pero tiene ${normalized.length}.`
    );
  }

  const hexPart = normalized.slice(INVITATION_PREFIX.length);
  if (!/^[0-9a-f]+$/.test(hexPart)) {
    throw new PilotCryptoError(
      "El codigo de invitacion contiene caracteres no hexadecimales."
    );
  }

  return normalized;
}

/**
 * Calcula el HMAC-SHA256 de un codigo de invitacion.
 * Normaliza y valida internamente antes de calcular.
 *
 * @param {Buffer} key - Clave HMAC de 32 bytes.
 * @param {string} code - Codigo de invitacion (sera normalizado y validado).
 * @returns {string} - HMAC en formato hexadecimal (64 caracteres).
 * @throws {PilotCryptoError} - Si el codigo no es string o es invalido.
 */
function hmacInvitation(key, code) {
  if (typeof code !== "string") {
    throw new PilotCryptoError(
      "El codigo de invitacion debe ser una cadena."
    );
  }
  const validated = validateInvitationCode(code);
  return crypto
    .createHmac(HMAC_ALGORITHM, key)
    .update(validated, "utf8")
    .digest("hex");
}

// ============================================================
// TOKENS DE SESION
// ============================================================

/**
 * Codifica un buffer en Base64URL sin padding (RFC 4648 seccion 5).
 *
 * @param {Buffer} buffer - Buffer a codificar.
 * @returns {string} - Cadena Base64URL sin padding.
 */
function base64UrlEncode(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Decodifica Base64URL sin padding.
 *
 * @param {string} str - Cadena Base64URL sin padding.
 * @returns {Buffer} - Buffer decodificado.
 */
function base64UrlDecode(str) {
  let padded = str;
  const paddingNeeded = (4 - (str.length % 4)) % 4;
  padded += "=".repeat(paddingNeeded);
  const standard = padded.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(standard, "base64");
}

/**
 * Genera un token de sesion de 256 bits.
 *
 * Formato: "npt_" + 43 caracteres Base64URL sin padding.
 * Ejemplo: npt_aB3x... (43 chars after prefix)
 *
 * @param {Function} randomBytesFn - Funcion que devuelve un Buffer de N bytes.
 * @returns {string} - Token completo.
 */
function generateToken(randomBytesFn) {
  const random = randomBytesFn(TOKEN_RANDOM_BYTES);
  if (!Buffer.isBuffer(random) || random.length !== TOKEN_RANDOM_BYTES) {
    throw new PilotCryptoError(
      "El generador aleatorio no produjo el buffer esperado."
    );
  }
  return TOKEN_PREFIX + base64UrlEncode(random);
}

/**
 * Normaliza un token: sin espacios.
 *
 * @param {string} token - Token en cualquier formato.
 * @returns {string} - Token normalizado.
 */
function normalizeToken(token) {
  return String(token || "").trim();
}

/**
 * Valida estrictamente un token de sesion.
 *
 * Rechaza:
 *   - Valores que no sean string.
 *   - Cadenas vacias.
 *   - Prefijos incorrectos.
 *   - Longitud distinta de 47 caracteres (npt_ + 43 Base64URL).
 *   - Caracteres no Base64URL despues del prefijo.
 *   - Base64URL malformado (no decodifica a 32 bytes).
 *   - Representaciones Base64URL no canonicas.
 *
 * @param {string} token - Token a validar.
 * @returns {string} - Token normalizado y validado.
 * @throws {PilotCryptoError} - Si el token es invalido.
 */
function validateToken(token) {
  if (typeof token !== "string") {
    throw new PilotCryptoError(
      "El token debe ser una cadena."
    );
  }

  const normalized = normalizeToken(token);

  if (normalized.length === 0) {
    throw new PilotCryptoError("El token esta vacio.");
  }

  if (!normalized.startsWith(TOKEN_PREFIX)) {
    throw new PilotCryptoError(
      `El token debe comenzar con "${TOKEN_PREFIX}".`
    );
  }

  if (normalized.length !== TOKEN_PREFIX.length + TOKEN_BASE64URL_LENGTH) {
    throw new PilotCryptoError(
      `El token debe tener exactamente ${TOKEN_PREFIX.length + TOKEN_BASE64URL_LENGTH} ` +
      `caracteres, pero tiene ${normalized.length}.`
    );
  }

  const b64Part = normalized.slice(TOKEN_PREFIX.length);
  const b64UrlPattern = /^[A-Za-z0-9_-]+$/;
  if (!b64UrlPattern.test(b64Part)) {
    throw new PilotCryptoError(
      "El token contiene caracteres no validos para Base64URL."
    );
  }

  // Verificar que decodifica exactamente a 32 bytes
  let decoded;
  try {
    decoded = base64UrlDecode(b64Part);
  } catch {
    throw new PilotCryptoError("El token no es Base64URL valido.");
  }

  if (decoded.length !== TOKEN_RANDOM_BYTES) {
    throw new PilotCryptoError(
      `El token debe decodificar a ${TOKEN_RANDOM_BYTES} bytes, ` +
      `pero decodifico ${decoded.length}.`
    );
  }

  // Verificar canonicidad: re-codificar y exigir igualdad exacta
  const reencoded = base64UrlEncode(decoded);
  if (reencoded !== b64Part) {
    throw new PilotCryptoError(
      "El token contiene una representacion Base64URL no canonica."
    );
  }

  return normalized;
}

/**
 * Calcula el HMAC-SHA256 de un token.
 * Normaliza y valida internamente antes de calcular.
 *
 * @param {Buffer} key - Clave HMAC de 32 bytes.
 * @param {string} token - Token (sera normalizado y validado).
 * @returns {string} - HMAC en formato hexadecimal (64 caracteres).
 * @throws {PilotCryptoError} - Si el token no es string o es invalido.
 */
function hmacToken(key, token) {
  if (typeof token !== "string") {
    throw new PilotCryptoError(
      "El token debe ser una cadena."
    );
  }
  const validated = validateToken(token);
  return crypto
    .createHmac(HMAC_ALGORITHM, key)
    .update(validated, "utf8")
    .digest("hex");
}

// ============================================================
// FACTORY
// ============================================================

/**
 * Crea una instancia del modulo criptografico del piloto.
 *
 * @param {Object} options
 * @param {string} options.invitationHmacKey - Clave HMAC para invitaciones, en Base64 (32 bytes).
 * @param {string} options.tokenHmacKey - Clave HMAC para tokens, en Base64 (32 bytes).
 * @param {Function} [options.randomBytes] - Funcion de generacion aleatoria. Por defecto: crypto.randomBytes.
 * @returns {Object} - API del modulo criptografico.
 * @throws {PilotCryptoError} - Si las claves no son validas o son identicas.
 */
function createPilotCryptoV0({
  invitationHmacKey,
  tokenHmacKey,
  randomBytes = crypto.randomBytes
}) {
  const invitationKey = decodeAndValidateKey("invitacion", invitationHmacKey);
  const tokenKey = decodeAndValidateKey("token", tokenHmacKey);

  // Rechazar claves identicas usando comparacion segura en tiempo constante
  if (crypto.timingSafeEqual(invitationKey, tokenKey)) {
    throw new PilotCryptoError(
      "Las claves HMAC de invitacion y token deben ser distintas."
    );
  }

  return {
    // Invitaciones
    generateInvitationCode: () => generateInvitationCode(randomBytes),
    normalizeInvitationCode,
    validateInvitationCode,
    hmacInvitation: (code) => hmacInvitation(invitationKey, code),

    // Tokens
    generateToken: () => generateToken(randomBytes),
    normalizeToken,
    validateToken,
    hmacToken: (token) => hmacToken(tokenKey, token),

    // Utilidades expuestas para pruebas avanzadas
    _constants: {
      INVITATION_PREFIX,
      INVITATION_CODE_LENGTH,
      TOKEN_PREFIX,
      TOKEN_BASE64URL_LENGTH
    }
  };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  createPilotCryptoV0,
  PilotCryptoError
};
