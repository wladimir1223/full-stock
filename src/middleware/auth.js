/**
 * auth.js — Middleware de autenticación JWT para Full Stock SaaS.
 *
 * Flujo:
 *   1. POST /auth/register  → crea cuenta + devuelve JWT
 *   2. POST /auth/login     → valida credenciales + devuelve JWT
 *   3. Cada request a /admin/* envía "Authorization: Bearer <jwt>"
 *   4. requireAuth() verifica firma y extrae req.tenant
 *
 * El JWT payload incluye: { tenantId, tenantSlug, email, name, iat, exp }
 * → req.tenant = { id, slug, email, name }
 *
 * Implementación JWT propia con Node.js crypto (sin dependencias externas).
 */

const crypto = require('crypto');
const config = require('../config');

const SECRET = config.jwt.secret;

// ─── Base64URL helpers ────────────────────────────────────────────────────────

function toB64url(buf) {
  return buf.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g,  '');
}

function fromB64url(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

// ─── JWT sign ────────────────────────────────────────────────────────────────

function signJWT(payload) {
  const header  = toB64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const now     = Math.floor(Date.now() / 1000);
  const body    = toB64url(Buffer.from(JSON.stringify({
    ...payload,
    iat: now,
    exp: now + config.jwt.expiresInHours * 3600,
  })));
  const sig = toB64url(
    crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest()
  );
  return `${header}.${body}.${sig}`;
}

// ─── JWT verify ──────────────────────────────────────────────────────────────

function verifyJWT(token) {
  const parts = (token || '').split('.');
  if (parts.length !== 3) throw new Error('Token malformado.');

  const [header, body, sig] = parts;

  const expectedSig = toB64url(
    crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest()
  );

  // Comparación en tiempo constante para evitar timing attacks
  if (
    sig.length !== expectedSig.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))
  ) {
    throw new Error('Firma inválida.');
  }

  const payload = JSON.parse(fromB64url(body).toString('utf8'));
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expirado.');
  }

  return payload;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractToken(req) {
  const auth = req.headers.authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
}

// ─── Middleware requireAuth ───────────────────────────────────────────────────

function requireAuth(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      code:    'UNAUTHORIZED',
      message: 'Se requiere autenticación. Inicia sesión en el panel.',
    });
  }

  try {
    const payload = verifyJWT(token);
    req.tenant = {
      id:    payload.tenantId,
      slug:  payload.tenantSlug,
      email: payload.email,
      name:  payload.name,
    };
    next();
  } catch (err) {
    const code = err.message.includes('expirado') ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
    res.status(401).json({ success: false, code, message: err.message });
  }
}

module.exports = { signJWT, verifyJWT, requireAuth };
