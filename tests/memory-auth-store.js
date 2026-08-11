// NU APP · STORE EN MEMORIA PARA PRUEBAS V110
// Réplica del contrato de auth-store-pg.js sin servicios externos.
// Reproduce las restricciones reales de PostgreSQL que importan al acceso:
// índice único parcial sobre users.email, consumo atómico del código y
// vinculación heredada transaccional con ROLLBACK completo.

function storeError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function uniqueEmailViolation() {
  const error = new Error(
    'duplicate key value violates unique constraint "idx_users_email_unique"'
  );
  error.code = "23505";
  return error;
}

function createMemoryAuthStore({
  users = [],
  progressUserIds = [],
  faults = {}
} = {}) {
  const codes = [];
  const sessions = new Map();
  const userRows = new Map(
    users.map(user => [
      user.id,
      { email: null, emailVerifiedAt: null, ...user }
    ])
  );
  const withProgress = new Set(progressUserIds);
  let nextCodeId = 1;

  // Índice único parcial sobre users.email (sólo filas con correo).
  function assertEmailFree(email, ownerId) {
    if (!email) return;

    for (const user of userRows.values()) {
      if (user.email === email && user.id !== ownerId) {
        throw uniqueEmailViolation();
      }
    }
  }

  function snapshot() {
    return {
      users: [...userRows.entries()].map(([id, user]) => [id, { ...user }]),
      sessions: [...sessions.entries()].map(([hash, session]) => [
        hash,
        { ...session }
      ])
    };
  }

  function restore(state) {
    userRows.clear();
    state.users.forEach(([id, user]) => userRows.set(id, user));
    sessions.clear();
    state.sessions.forEach(([hash, session]) => sessions.set(hash, session));
  }

  async function runFault(name) {
    const fault = faults[name];
    if (typeof fault === "function") await fault();
  }

  const store = {
    codes,
    sessions,
    users: userRows,
    faults,

    async countCodesSince(email, since) {
      return codes.filter(
        code => code.email === email && code.createdAt >= since
      ).length;
    },

    async countCodesByIpSince(ip, since) {
      return codes.filter(
        code => code.requestIp === ip && code.createdAt >= since
      ).length;
    },

    async invalidateCodesForEmail(email) {
      codes.forEach(code => {
        if (code.email === email && !code.consumedAt) {
          code.consumedAt = new Date();
        }
      });
    },

    async createCode({ email, codeHash, expiresAt, createdAt, requestIp }) {
      const record = {
        id: nextCodeId++,
        email,
        codeHash,
        attempts: 0,
        expiresAt,
        consumedAt: null,
        createdAt: createdAt || new Date(),
        requestIp: requestIp || null
      };

      codes.push(record);

      return record;
    },

    // Equivalente al UPDATE ... WHERE consumed_at IS NULL ... RETURNING:
    // el ceder el turno ocurre antes, y la decisión y la escritura pasan
    // en un único bloque síncrono, como una operación atómica del motor.
    async consumeMatchingCode({ email, codeHash, now, maxAttempts }) {
      await runFault("beforeConsume");

      const record = [...codes]
        .reverse()
        .find(code => code.email === email && !code.consumedAt);

      if (!record) return { status: "not_found" };

      const reference = now ? new Date(now) : new Date();

      if (new Date(record.expiresAt).getTime() <= reference.getTime()) {
        return { status: "expired" };
      }

      if (record.attempts >= maxAttempts) {
        return { status: "too_many_attempts" };
      }

      if (record.codeHash !== codeHash) {
        record.attempts += 1;
        return { status: "mismatch", attempts: record.attempts };
      }

      record.consumedAt = reference;

      return { status: "consumed", id: record.id };
    },

    async findUserByEmail(email) {
      return (
        [...userRows.values()].find(user => user.email === email) || null
      );
    },

    async findUserById(userId) {
      return userRows.get(userId) || null;
    },

    async createUser({ id, email, name }) {
      assertEmailFree(email, id);

      const user = { id, email, name, emailVerifiedAt: null };
      userRows.set(id, user);
      return user;
    },

    async markEmailVerified(userId, verifiedAt) {
      const user = userRows.get(userId);
      if (user) user.emailVerifiedAt = verifiedAt || new Date();
    },

    async attachEmailToUser(userId, email, verifiedAt) {
      const user = userRows.get(userId);

      if (!user || user.email) {
        throw storeError("Esa cuenta ya está vinculada a un correo.", 409);
      }

      assertEmailFree(email, userId);

      user.email = email;
      user.emailVerifiedAt = verifiedAt || new Date();
    },

    async userHasProgress(userId) {
      return withProgress.has(userId);
    },

    async deleteUser(userId) {
      userRows.delete(userId);
    },

    async createSession({ tokenHash, userId, createdAt, expiresAt }) {
      sessions.set(tokenHash, {
        tokenHash,
        userId,
        createdAt: createdAt || new Date(),
        lastSeenAt: createdAt || new Date(),
        expiresAt
      });
    },

    async findSessionByHash(tokenHash) {
      return sessions.get(tokenHash) || null;
    },

    async touchSession(tokenHash, seenAt) {
      const session = sessions.get(tokenHash);
      if (session) session.lastSeenAt = seenAt || new Date();
    },

    async deleteSessionByHash(tokenHash) {
      return sessions.delete(tokenHash);
    },

    async moveSessions(fromUserId, toUserId) {
      sessions.forEach(session => {
        if (session.userId === fromUserId) session.userId = toUserId;
      });
    },

    // Misma secuencia que la transacción PostgreSQL, con undo completo.
    async linkLegacyAccount({ sessionUserId, legacyUserId, email, now }) {
      const before = snapshot();

      try {
        const current = userRows.get(sessionUserId);
        const legacy = userRows.get(legacyUserId);

        if (!current) throw storeError("Sesión inválida.", 401);

        if (!legacy) {
          throw storeError("No encontramos esa cuenta anterior.", 404);
        }

        if (legacy.email) {
          throw storeError("Esa cuenta ya está vinculada a un correo.", 409);
        }

        if (current.email !== email) {
          throw storeError("Sesión inválida.", 401);
        }

        if (withProgress.has(sessionUserId)) {
          throw storeError(
            "Tu cuenta actual ya tiene progreso. " +
            "Escribinos para unificarlas manualmente.",
            409
          );
        }

        current.email = null;
        current.emailVerifiedAt = null;

        await runFault("afterReleaseEmail");

        assertEmailFree(email, legacyUserId);
        legacy.email = email;
        legacy.emailVerifiedAt = now || new Date();

        await runFault("afterAttachEmail");

        sessions.forEach(session => {
          if (session.userId === sessionUserId) {
            session.userId = legacyUserId;
          }
        });

        await runFault("beforeDeleteUser");

        userRows.delete(sessionUserId);

        return { userId: legacyUserId, email };
      } catch (error) {
        restore(before);
        throw error;
      }
    },

    async deleteExpired(now) {
      const reference = now ? new Date(now) : new Date();
      let removedSessions = 0;

      sessions.forEach((session, hash) => {
        if (new Date(session.expiresAt).getTime() < reference.getTime()) {
          sessions.delete(hash);
          removedSessions += 1;
        }
      });

      const cutoff = reference.getTime() - 24 * 60 * 60 * 1000;
      let removedCodes = 0;

      for (let index = codes.length - 1; index >= 0; index--) {
        if (new Date(codes[index].createdAt).getTime() < cutoff) {
          codes.splice(index, 1);
          removedCodes += 1;
        }
      }

      return { sessions: removedSessions, codes: removedCodes };
    }
  };

  return store;
}

module.exports = { createMemoryAuthStore };
