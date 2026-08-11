// NU APP · SESIONES HTTP V110
// Cookie HttpOnly + SameSite=Lax (Secure en producción) y middleware que
// resuelve el userId desde la sesión, nunca desde la URL ni el body.

function parseCookies(header) {
  const cookies = {};

  String(header || "")
    .split(";")
    .forEach(part => {
      const index = part.indexOf("=");
      if (index < 1) return;

      const name = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();

      if (!name) return;

      try {
        cookies[name] = decodeURIComponent(value);
      } catch (_) {
        cookies[name] = value;
      }
    });

  return cookies;
}

function readSessionToken(req, cookieName) {
  const cookies = parseCookies(req.headers?.cookie);
  return cookies[cookieName] || null;
}

function createAuthHttp({
  service,
  secureCookies = process.env.NODE_ENV === "production",
  cookieName = service.config.cookieName
}) {
  function setSessionCookie(res, token, expiresAt) {
    res.cookie(cookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookies,
      path: "/",
      expires: new Date(expiresAt)
    });
  }

  function clearSessionCookie(res) {
    res.clearCookie(cookieName, {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookies,
      path: "/"
    });
  }

  // Deja req.auth cuando hay sesión válida; no bloquea.
  async function attachSession(req, res, next) {
    try {
      const token = readSessionToken(req, cookieName);
      const session = await service.resolveSession(token);

      req.sessionToken = token;
      req.auth = session ? { userId: session.userId } : null;

      next();
    } catch (error) {
      next(error);
    }
  }

  function requireSession(req, res, next) {
    if (!req.auth?.userId) {
      return res.status(401).json({
        ok: false,
        authenticated: false,
        error: "Necesitás iniciar sesión con tu correo."
      });
    }

    return next();
  }

  // Único origen de verdad del userId en endpoints privados.
  function sessionUserId(req) {
    const userId = req.auth?.userId;

    if (!userId) {
      const error = new Error("Necesitás iniciar sesión con tu correo.");
      error.status = 401;
      throw error;
    }

    return userId;
  }

  function mountRoutes(app) {
    app.post("/api/auth/request-code", async (req, res, next) => {
      try {
        await service.requestCode(req.body?.email, { ip: req.ip });

        // Respuesta uniforme: no revela si el correo existe.
        res.json({
          ok: true,
          sent: true,
          expiresInSeconds: Math.round(service.config.codeTtlMs / 1000)
        });
      } catch (error) {
        next(error);
      }
    });

    app.post("/api/auth/verify-code", async (req, res, next) => {
      try {
        const result = await service.verifyCode(
          req.body?.email,
          req.body?.code,
          { ip: req.ip }
        );

        setSessionCookie(
          res,
          result.session.token,
          result.session.expiresAt
        );

        res.json({
          ok: true,
          authenticated: true,
          userId: result.user.id,
          email: result.user.email,
          isNewAccount: result.createdUser
        });
      } catch (error) {
        next(error);
      }
    });

    app.get("/api/auth/session", async (req, res, next) => {
      try {
        if (!req.auth?.userId) {
          return res.json({ ok: true, authenticated: false });
        }

        const user = await service.getUser(req.auth.userId);

        res.json({
          ok: true,
          authenticated: true,
          userId: req.auth.userId,
          email: user?.email || null
        });
      } catch (error) {
        next(error);
      }
    });

    app.post("/api/auth/logout", async (req, res, next) => {
      try {
        await service.logout(req.sessionToken);
        clearSessionCookie(res);
        res.json({ ok: true, authenticated: false });
      } catch (error) {
        next(error);
      }
    });

    app.post(
      "/api/auth/link-legacy-account",
      requireSession,
      async (req, res, next) => {
        try {
          const linked = await service.linkLegacyAccount(
            sessionUserId(req),
            req.body?.legacyUserId
          );

          res.json({
            ok: true,
            linked: true,
            userId: linked.userId
          });
        } catch (error) {
          next(error);
        }
      }
    );
  }

  return {
    attachSession,
    requireSession,
    sessionUserId,
    setSessionCookie,
    clearSessionCookie,
    mountRoutes,
    cookieName
  };
}

module.exports = {
  createAuthHttp,
  parseCookies,
  readSessionToken
};
