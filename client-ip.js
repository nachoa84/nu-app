// NU APP · IDENTIFICACIÓN DEL CLIENTE DETRÁS DEL PROXY V110
// Replit publica la app detrás de un único proxy inverso que agrega
// X-Forwarded-For. La política es explícita y acotada:
//
//   TRUST_PROXY_HOPS=1 (por defecto) => Express confía sólo en el último
//   salto, así req.ip es la IP que el proxy vio, y no un valor elegido
//   por el cliente encadenando cabeceras falsas.
//
//   TRUST_PROXY_HOPS=0 => sin proxy (desarrollo local): se usa la IP
//   de la conexión TCP.
//
// Si el valor fuese incorrecto todos los usuarios compartirían la misma
// clave de rate limiting, por eso resolveClientKey nunca cae en una clave
// constante silenciosamente: marca el caso como "desconocida".

const DEFAULT_TRUST_PROXY_HOPS = 1;

function resolveTrustProxy(env = process.env) {
  const raw = env.TRUST_PROXY_HOPS;

  if (raw === undefined || raw === "") return DEFAULT_TRUST_PROXY_HOPS;

  const hops = Number(raw);

  if (!Number.isInteger(hops) || hops < 0) {
    throw new Error(
      "TRUST_PROXY_HOPS debe ser un entero mayor o igual a 0."
    );
  }

  // 0 salto = no confiar en ninguna cabecera de proxy.
  return hops === 0 ? false : hops;
}

// Clave de rate limiting por cliente. req.ip ya viene resuelto por la
// política de trust proxy de Express.
function clientKey(req) {
  const ip = String(req?.ip || "").trim();

  return ip ? `ip:${ip}` : "ip:desconocida";
}

module.exports = {
  DEFAULT_TRUST_PROXY_HOPS,
  clientKey,
  resolveTrustProxy
};
