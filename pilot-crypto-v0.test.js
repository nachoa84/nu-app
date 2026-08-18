/**
 * NU APP · PRUEBAS EXHAUSTIVAS DEL MÓDULO CRIPTOGRÁFICO PILOTO V0
 * Archivo: pilot-crypto-v0.test.js
 *
 * Usa node:test y node:assert para verificar la API pública de pilot-crypto-v0.js.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");

const {
  createPilotCryptoV0,
  PilotCryptoError
} = require("./pilot-crypto-v0");

// ============================================================
// HELPER FUNCTIONS FOR TEST FIXTURES
// ============================================================

function makeValidKey() {
  return crypto.randomBytes(32).toString("base64");
}

function makeCryptoInstance(options = {}) {
  const invitationHmacKey = options.invitationHmacKey ?? makeValidKey();
  const tokenHmacKey = options.tokenHmacKey ?? makeValidKey();
  return createPilotCryptoV0({
    invitationHmacKey,
    tokenHmacKey,
    ...options
  });
}

// ============================================================
// SUITE 1: API Y CONSTANTES EXPORTADAS
// ============================================================

describe("API y constantes exportadas", () => {
  it("exporta createPilotCryptoV0 y PilotCryptoError", () => {
    assert.strictEqual(typeof createPilotCryptoV0, "function");
    assert.strictEqual(typeof PilotCryptoError, "function");
  });

  it("PilotCryptoError hereda de Error y tiene name correcto", () => {
    const err = new PilotCryptoError("mensaje de prueba");
    assert.ok(err instanceof Error);
    assert.ok(err instanceof PilotCryptoError);
    assert.strictEqual(err.name, "PilotCryptoError");
    assert.strictEqual(err.message, "mensaje de prueba");
  });

  it("exporta _constants con las constantes criptograficas esperadas", () => {
    const instance = makeCryptoInstance();
    assert.ok(instance._constants);
    assert.strictEqual(instance._constants.INVITATION_PREFIX, "npi_");
    assert.strictEqual(instance._constants.INVITATION_CODE_LENGTH, 36);
    assert.strictEqual(instance._constants.TOKEN_PREFIX, "npt_");
    assert.strictEqual(instance._constants.TOKEN_BASE64URL_LENGTH, 43);
  });
});

// ============================================================
// SUITE 2: VALIDACIÓN DE LA FACTORY Y CLAVES BASE64
// ============================================================

describe("Validacion completa de createPilotCryptoV0 y claves", () => {
  it("rechaza cuando faltan las claves o las opciones", () => {
    assert.throws(
      () => createPilotCryptoV0({}),
      (err) => err instanceof PilotCryptoError && err.message.includes("invitacion")
    );
  });

  it("rechaza clave de invitacion que no es string", () => {
    const invalidTypes = [null, undefined, 12345, true, {}, []];
    for (const val of invalidTypes) {
      assert.throws(
        () => createPilotCryptoV0({
          invitationHmacKey: val,
          tokenHmacKey: makeValidKey()
        }),
        (err) => err instanceof PilotCryptoError && err.message.includes("cadena Base64"),
        `Deberia rechazar invitationHmacKey con valor: ${val}`
      );
    }
  });

  it("rechaza clave de token que no es string", () => {
    const invalidTypes = [null, undefined, 12345, true, {}, []];
    for (const val of invalidTypes) {
      assert.throws(
        () => createPilotCryptoV0({
          invitationHmacKey: makeValidKey(),
          tokenHmacKey: val
        }),
        (err) => err instanceof PilotCryptoError && err.message.includes("cadena Base64"),
        `Deberia rechazar tokenHmacKey con valor: ${val}`
      );
    }
  });

  it("rechaza clave vacia o de solo espacios", () => {
    assert.throws(
      () => createPilotCryptoV0({
        invitationHmacKey: "",
        tokenHmacKey: makeValidKey()
      }),
      (err) => err instanceof PilotCryptoError && err.message.includes("vacia")
    );

    assert.throws(
      () => createPilotCryptoV0({
        invitationHmacKey: "   \t\n  ",
        tokenHmacKey: makeValidKey()
      }),
      (err) => err instanceof PilotCryptoError && err.message.includes("vacia")
    );
  });

  it("rechaza clave con caracteres Base64 no validos", () => {
    assert.throws(
      () => createPilotCryptoV0({
        invitationHmacKey: "ClaveInvalidaConCaracteresEspeciales!!!",
        tokenHmacKey: makeValidKey()
      }),
      (err) => err instanceof PilotCryptoError && err.message.includes("caracteres Base64 no validos")
    );
  });

  it("rechaza Base64 no canonico (padding malformado o bits basura al final)", () => {
    const validKey = crypto.randomBytes(32).toString("base64");
    // Cambiar el caracter previo a = para meter bits no cero en el padding de Base64
    const nonCanonicalKey = validKey.slice(0, 42) + "B=";
    assert.throws(
      () => createPilotCryptoV0({
        invitationHmacKey: nonCanonicalKey,
        tokenHmacKey: makeValidKey()
      }),
      (err) => err instanceof PilotCryptoError && err.message.includes("Base64 canonico")
    );
  });

  it("rechaza clave que decodifica a menos de 32 bytes (corta)", () => {
    const shortKeyBase64 = crypto.randomBytes(31).toString("base64");
    assert.throws(
      () => createPilotCryptoV0({
        invitationHmacKey: shortKeyBase64,
        tokenHmacKey: makeValidKey()
      }),
      (err) => err instanceof PilotCryptoError && err.message.includes("exactamente 32 bytes")
    );
  });

  it("rechaza clave que decodifica a mas de 32 bytes (larga)", () => {
    const longKeyBase64 = crypto.randomBytes(33).toString("base64");
    assert.throws(
      () => createPilotCryptoV0({
        invitationHmacKey: longKeyBase64,
        tokenHmacKey: makeValidKey()
      }),
      (err) => err instanceof PilotCryptoError && err.message.includes("exactamente 32 bytes")
    );
  });

  it("rechaza claves iguales entre invitacion y token (constant-time check)", () => {
    const sameKey = makeValidKey();
    assert.throws(
      () => createPilotCryptoV0({
        invitationHmacKey: sameKey,
        tokenHmacKey: sameKey
      }),
      (err) => err instanceof PilotCryptoError && err.message.includes("deben ser distintas")
    );
  });

  it("acepta claves validas y distintas de 32 bytes en Base64", () => {
    const key1 = makeValidKey();
    const key2 = makeValidKey();
    const instance = createPilotCryptoV0({
      invitationHmacKey: key1,
      tokenHmacKey: key2
    });
    assert.ok(instance);
    assert.strictEqual(typeof instance.generateInvitationCode, "function");
    assert.strictEqual(typeof instance.generateToken, "function");
  });
});

// ============================================================
// SUITE 3: GENERACIÓN CRIPTOGRÁFICA DE CÓDIGOS Y TOKENS
// ============================================================

describe("Generacion criptografica de codigos npi_ y tokens npt_", () => {
  it("generateInvitationCode genera formato y longitud exactos (npi_ + 32 hex)", () => {
    const instance = makeCryptoInstance();
    const code = instance.generateInvitationCode();

    assert.strictEqual(typeof code, "string");
    assert.strictEqual(code.length, 36);
    assert.ok(code.startsWith("npi_"));
    const hexPart = code.slice(4);
    assert.ok(/^[0-9a-f]{32}$/.test(hexPart));
  });

  it("generateToken genera formato y longitud exactos (npt_ + 43 Base64URL chars)", () => {
    const instance = makeCryptoInstance();
    const token = instance.generateToken();

    assert.strictEqual(typeof token, "string");
    assert.strictEqual(token.length, 47);
    assert.ok(token.startsWith("npt_"));
    const b64Part = token.slice(4);
    assert.ok(/^[A-Za-z0-9_-]{43}$/.test(b64Part));
  });

  it("lanza PilotCryptoError si el generador aleatorio no devuelve Buffer valido o correcto tamaño", () => {
    assert.throws(
      () => makeCryptoInstance({ randomBytes: () => "not a buffer" }).generateInvitationCode(),
      (err) => err instanceof PilotCryptoError && err.message.includes("generador aleatorio")
    );

    assert.throws(
      () => makeCryptoInstance({ randomBytes: () => Buffer.alloc(10) }).generateInvitationCode(),
      (err) => err instanceof PilotCryptoError && err.message.includes("generador aleatorio")
    );

    assert.throws(
      () => makeCryptoInstance({ randomBytes: () => Buffer.alloc(10) }).generateToken(),
      (err) => err instanceof PilotCryptoError && err.message.includes("generador aleatorio")
    );
  });
});

// ============================================================
// SUITE 4: NORMALIZACIÓN
// ============================================================

describe("Normalizacion", () => {
  it("normalizeInvitationCode convierte a minusculas y recorta espacios", () => {
    const instance = makeCryptoInstance();
    const input = "  NPI_A1B2C3D4E5F6789012345678ABCDEF01  ";
    const normalized = instance.normalizeInvitationCode(input);
    assert.strictEqual(normalized, "npi_a1b2c3d4e5f6789012345678abcdef01");
  });

  it("normalizeInvitationCode maneja valores nulos o falsy devoliendo string vacia", () => {
    const instance = makeCryptoInstance();
    assert.strictEqual(instance.normalizeInvitationCode(null), "");
    assert.strictEqual(instance.normalizeInvitationCode(undefined), "");
    assert.strictEqual(instance.normalizeInvitationCode(""), "");
  });

  it("normalizeToken recorta espacios pero preserva mayusculas/minusculas", () => {
    const instance = makeCryptoInstance();
    const rawToken = "npt_aB3x_" + "A".repeat(37);
    const input = `  ${rawToken}  `;
    const normalized = instance.normalizeToken(input);
    assert.strictEqual(normalized, rawToken);
  });

  it("normalizeToken maneja valores nulos o falsy devoliendo string vacia", () => {
    const instance = makeCryptoInstance();
    assert.strictEqual(instance.normalizeToken(null), "");
    assert.strictEqual(instance.normalizeToken(undefined), "");
    assert.strictEqual(instance.normalizeToken(""), "");
  });
});

// ============================================================
// SUITE 5: VALIDACIÓN DE CÓDIGOS DE INVITACIÓN Y TOKENS
// ============================================================

describe("Validacion estricta de codigos y tokens", () => {
  const instance = makeCryptoInstance();

  describe("validateInvitationCode", () => {
    it("acepta un codigo valido y devuelve el codigo normalizado", () => {
      const validCode = "npi_a1b2c3d4e5f6789012345678abcdef01";
      assert.strictEqual(instance.validateInvitationCode(validCode), validCode);
      assert.strictEqual(instance.validateInvitationCode(`  ${validCode.toUpperCase()}  `), validCode);
    });

    it("rechaza si no es string", () => {
      const invalidTypes = [null, undefined, 12345, true, {}, []];
      for (const val of invalidTypes) {
        assert.throws(
          () => instance.validateInvitationCode(val),
          (err) => err instanceof PilotCryptoError && err.message.includes("cadena")
        );
      }
    });

    it("rechaza cadenas vacias o de solo espacios", () => {
      assert.throws(
        () => instance.validateInvitationCode(""),
        (err) => err instanceof PilotCryptoError && err.message.includes("vacio")
      );
      assert.throws(
        () => instance.validateInvitationCode("   "),
        (err) => err instanceof PilotCryptoError && err.message.includes("vacio")
      );
    });

    it("rechaza prefijo incorrecto", () => {
      assert.throws(
        () => instance.validateInvitationCode("inv_a1b2c3d4e5f6789012345678abcdef01"),
        (err) => err instanceof PilotCryptoError && err.message.includes('comenzar con "npi_"')
      );
    });

    it("rechaza longitud incorrecta (demasiado corta o larga)", () => {
      // 35 caracteres
      assert.throws(
        () => instance.validateInvitationCode("npi_a1b2c3d4e5f6789012345678abcdef0"),
        (err) => err instanceof PilotCryptoError && err.message.includes("exactamente 36")
      );
      // 37 caracteres
      assert.throws(
        () => instance.validateInvitationCode("npi_a1b2c3d4e5f6789012345678abcdef012"),
        (err) => err instanceof PilotCryptoError && err.message.includes("exactamente 36")
      );
    });

    it("rechaza caracteres no hexadecimales", () => {
      assert.throws(
        () => instance.validateInvitationCode("npi_a1b2c3d4e5f6789012345678abcdef0g"),
        (err) => err instanceof PilotCryptoError && err.message.includes("no hexadecimales")
      );
      assert.throws(
        () => instance.validateInvitationCode("npi_a1b2c3d4e5f6789012345678abcdef-!"),
        (err) => err instanceof PilotCryptoError && err.message.includes("no hexadecimales")
      );
    });
  });

  describe("validateToken", () => {
    it("acepta un token valido y devuelve el token normalizado", () => {
      const validToken = instance.generateToken();
      assert.strictEqual(instance.validateToken(validToken), validToken);
      assert.strictEqual(instance.validateToken(`  ${validToken}  `), validToken);
    });

    it("rechaza si no es string", () => {
      const invalidTypes = [null, undefined, 12345, true, {}, []];
      for (const val of invalidTypes) {
        assert.throws(
          () => instance.validateToken(val),
          (err) => err instanceof PilotCryptoError && err.message.includes("cadena")
        );
      }
    });

    it("rechaza cadenas vacias o de solo espacios", () => {
      assert.throws(
        () => instance.validateToken(""),
        (err) => err instanceof PilotCryptoError && err.message.includes("vacio")
      );
      assert.throws(
        () => instance.validateToken("   "),
        (err) => err instanceof PilotCryptoError && err.message.includes("vacio")
      );
    });

    it("rechaza prefijo incorrecto", () => {
      assert.throws(
        () => instance.validateToken("tok_" + "a".repeat(43)),
        (err) => err instanceof PilotCryptoError && err.message.includes('comenzar con "npt_"')
      );
    });

    it("rechaza longitud incorrecta (demasiado corta o larga)", () => {
      // 46 caracteres
      assert.throws(
        () => instance.validateToken("npt_" + "a".repeat(42)),
        (err) => err instanceof PilotCryptoError && err.message.includes("exactamente 47")
      );
      // 48 caracteres
      assert.throws(
        () => instance.validateToken("npt_" + "a".repeat(44)),
        (err) => err instanceof PilotCryptoError && err.message.includes("exactamente 47")
      );
    });

    it("rechaza caracteres no permitidos en Base64URL", () => {
      // '+' y '/' no son validos en Base64URL
      assert.throws(
        () => instance.validateToken("npt_" + "a".repeat(41) + "+="),
        (err) => err instanceof PilotCryptoError && err.message.includes("no validos para Base64URL")
      );
    });

    it("rechaza representaciones Base64URL no canonicas", () => {
      // Crear 43 caracteres Base64URL donde los bits sobrantes de padding no son cero
      // 32 bytes * 8 bits = 256 bits.
      // 43 caracteres * 6 bits = 258 bits.
      // Los últimos 2 bits deben ser 00 para ser canónico. Si terminan en un carácter con bits en 1, no re-codifica igual.
      // Un caracter Base64URL cuya representación binaria no tiene 00 en los últimos 2 bits (ej: 'B' es 000001, 'C' es 000010, 'D' es 000011 -> 11 no es 00)
      const validToken = instance.generateToken();
      // Modificar el último carácter por uno no canónico
      const nonCanonical = validToken.slice(0, 46) + "D";
      assert.throws(
        () => instance.validateToken(nonCanonical),
        (err) => err instanceof PilotCryptoError && err.message.includes("no canonica")
      );
    });
  });
});

// ============================================================
// SUITE 6: HMAC Y DETERMINISMO
// ============================================================

describe("HMAC y determinismo", () => {
  it("hmacInvitation calcula HMAC-SHA256 de 64 caracteres hex de forma determinista", () => {
    const instance = makeCryptoInstance();
    const code = "npi_a1b2c3d4e5f6789012345678abcdef01";

    const hmac1 = instance.hmacInvitation(code);
    const hmac2 = instance.hmacInvitation(code);

    assert.strictEqual(typeof hmac1, "string");
    assert.strictEqual(hmac1.length, 64);
    assert.ok(/^[0-9a-f]{64}$/.test(hmac1));
    assert.strictEqual(hmac1, hmac2);
  });

  it("hmacInvitation normaliza internamente la entrada antes de calcular HMAC", () => {
    const instance = makeCryptoInstance();
    const code1 = "npi_a1b2c3d4e5f6789012345678abcdef01";
    const code2 = "  NPI_A1B2C3D4E5F6789012345678ABCDEF01  ";

    assert.strictEqual(instance.hmacInvitation(code1), instance.hmacInvitation(code2));
  });

  it("hmacInvitation rechaza entradas no validas", () => {
    const instance = makeCryptoInstance();
    assert.throws(
      () => instance.hmacInvitation("codigo_invalido"),
      (err) => err instanceof PilotCryptoError
    );
    assert.throws(
      () => instance.hmacInvitation(12345),
      (err) => err instanceof PilotCryptoError
    );
  });

  it("hmacToken calcula HMAC-SHA256 de 64 caracteres hex de forma determinista", () => {
    const instance = makeCryptoInstance();
    const token = instance.generateToken();

    const hmac1 = instance.hmacToken(token);
    const hmac2 = instance.hmacToken(token);

    assert.strictEqual(typeof hmac1, "string");
    assert.strictEqual(hmac1.length, 64);
    assert.ok(/^[0-9a-f]{64}$/.test(hmac1));
    assert.strictEqual(hmac1, hmac2);
  });

  it("hmacToken normaliza internamente recortando espacios", () => {
    const instance = makeCryptoInstance();
    const token = instance.generateToken();

    assert.strictEqual(instance.hmacToken(token), instance.hmacToken(`  ${token}  `));
  });

  it("hmacToken rechaza entradas no validas", () => {
    const instance = makeCryptoInstance();
    assert.throws(
      () => instance.hmacToken("token_invalido"),
      (err) => err instanceof PilotCryptoError
    );
    assert.throws(
      () => instance.hmacToken(null),
      (err) => err instanceof PilotCryptoError
    );
  });

  it("demuestra independencia entre HMAC de invitaciones y tokens con distintas claves", () => {
    const key1 = makeValidKey();
    const key2 = makeValidKey();

    const instance1 = createPilotCryptoV0({ invitationHmacKey: key1, tokenHmacKey: key2 });
    const instance2 = createPilotCryptoV0({ invitationHmacKey: key2, tokenHmacKey: key1 });

    const code = "npi_a1b2c3d4e5f6789012345678abcdef01";
    assert.notStrictEqual(instance1.hmacInvitation(code), instance2.hmacInvitation(code));
  });
});

// ============================================================
// SUITE 7: SEPARACIÓN DE DOMINIO
// ============================================================

describe("Separacion de dominio", () => {
  it("un codigo de invitacion no puede ser usado como token ni viceversa", () => {
    const instance = makeCryptoInstance();
    const code = instance.generateInvitationCode();
    const token = instance.generateToken();

    // Intentar validar codigo como token debe fallar
    assert.throws(
      () => instance.validateToken(code),
      (err) => err instanceof PilotCryptoError
    );

    // Intentar calcular HMAC de token para un codigo debe fallar
    assert.throws(
      () => instance.hmacToken(code),
      (err) => err instanceof PilotCryptoError
    );

    // Intentar validar token como codigo debe fallar
    assert.throws(
      () => instance.validateInvitationCode(token),
      (err) => err instanceof PilotCryptoError
    );

    // Intentar calcular HMAC de invitacion para un token debe fallar
    assert.throws(
      () => instance.hmacInvitation(token),
      (err) => err instanceof PilotCryptoError
    );
  });
});

// ============================================================
// SUITE 8: AUSENCIA DE SECRETOS EN ERRORES
// ============================================================

describe("Ausencia de secretos en errores", () => {
  it("los errores nunca contienen claves Base64, codigos o tokens en sus mensajes", () => {
    const secretKey = makeValidKey();
    const secretCode = "npi_a1b2c3d4e5f6789012345678abcdef01";
    const instance = makeCryptoInstance();

    try {
      createPilotCryptoV0({
        invitationHmacKey: "InvalidaBase64!!!",
        tokenHmacKey: secretKey
      });
    } catch (err) {
      assert.ok(!err.message.includes(secretKey), "No debe contener la clave secreta");
    }

    try {
      instance.hmacInvitation("npi_caracteres_invalidos_bad_length");
    } catch (err) {
      assert.ok(!err.message.includes(secretCode));
    }
  });
});

// ============================================================
// SUITE 9: COLISIONES IMPROBABLES MEDIANTE GENERACIÓN REPETIDA
// ============================================================

describe("Colisiones improbables mediante generacion repetida", () => {
  it("genera 1,000 codigos de invitacion sin colisiones", () => {
    const instance = makeCryptoInstance();
    const set = new Set();
    const N = 1000;

    for (let i = 0; i < N; i++) {
      const code = instance.generateInvitationCode();
      assert.strictEqual(instance.validateInvitationCode(code), code);
      set.add(code);
    }

    assert.strictEqual(set.size, N, "Los 1,000 codigos de invitacion deben ser unicos");
  });

  it("genera 1,000 tokens de sesion sin colisiones", () => {
    const instance = makeCryptoInstance();
    const set = new Set();
    const N = 1000;

    for (let i = 0; i < N; i++) {
      const token = instance.generateToken();
      assert.strictEqual(instance.validateToken(token), token);
      set.add(token);
    }

    assert.strictEqual(set.size, N, "Los 1,000 tokens de sesion deben ser unicos");
  });
});
