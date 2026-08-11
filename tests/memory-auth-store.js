// NU APP · STORE EN MEMORIA PARA PRUEBAS V110
// Réplica del contrato de auth-store-pg.js sin servicios externos.

function createMemoryAuthStore({ users = [], progressUserIds = [] } = {}) {
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

  return {
    codes,
    sessions,
    users: userRows,

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

    async findActiveCode(email) {
      return (
        [...codes]
          .reverse()
          .find(code => code.email === email && !code.consumedAt) || null
      );
    },

    async incrementCodeAttempts(id) {
      const record = codes.find(code => code.id === id);
      if (record) record.attempts += 1;
    },

    async consumeCode(id, consumedAt) {
      const record = codes.find(code => code.id === id);
      if (record) record.consumedAt = consumedAt || new Date();
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
        const error = new Error("Esa cuenta ya está vinculada a un correo.");
        error.status = 409;
        throw error;
      }

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
    }
  };
}

module.exports = { createMemoryAuthStore };
