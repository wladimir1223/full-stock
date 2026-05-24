/**
 * security.js — Rate limiters para Full Stock SaaS.
 *
 * authLimiter  → /auth/login y /auth/register
 *   · Máx. 10 intentos por IP cada 15 minutos.
 *   · skipSuccessfulRequests: true → solo cuentan los intentos FALLIDOS,
 *     un login correcto no consume cuota.
 *
 * apiLimiter   → /api/v1/* (API pública) y /admin/* (panel)
 *   · Máx. 200 peticiones por IP por minuto.
 *   · Protege contra scrapers y abuso de la API pública.
 *
 * Render corre detrás de un proxy/load-balancer; el servidor debe tener
 * app.set('trust proxy', 1) para que req.ip sea la IP real del cliente.
 */

const rateLimit = require('express-rate-limit');

// ─── Auth limiter ─────────────────────────────────────────────────────────────

const authLimiter = rateLimit({
  windowMs:               15 * 60 * 1000, // 15 minutos
  max:                    10,              // máx. 10 intentos fallidos por ventana
  standardHeaders:        true,           // devuelve RateLimit-* en cabeceras
  legacyHeaders:          false,          // deshabilita X-RateLimit-* antiguas
  skipSuccessfulRequests: true,           // login exitoso no consume cuota
  message: {
    success: false,
    code:    'TOO_MANY_ATTEMPTS',
    message: 'Demasiados intentos. Vuelve a intentarlo en 15 minutos.',
  },
});

// ─── API limiter ──────────────────────────────────────────────────────────────

const apiLimiter = rateLimit({
  windowMs:        60 * 1000, // 1 minuto
  max:             200,       // máx. 200 peticiones por minuto por IP
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    success: false,
    code:    'RATE_LIMITED',
    message: 'Demasiadas peticiones. Por favor espera un momento.',
  },
});

module.exports = { authLimiter, apiLimiter };
