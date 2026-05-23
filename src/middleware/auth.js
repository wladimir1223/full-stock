/**
 * auth.js - Middleware de autenticacion para Full Stock.
 *
 * Estrategia: Bearer token aleatorio almacenado en memoria del servidor.
 * Al reiniciar el servidor todos los tokens se invalidan (comportamiento esperado en MVP).
 *
 * Flujo:
 *   1. POST /admin/login  -> valida credenciales -> devuelve token
 *   2. Cliente envia "Authorization: Bearer <token>" en cada request
 *   3. requireAuth() verifica el token contra el store en memoria
 *   4. POST /admin/logout -> elimina el token del store
 */

const crypto = require('crypto');
const config = require('../config');

// Store en memoria: Map<token_string, { username, expiresAt }>
const sessions = new Map();

// --- Helpers -----------------------------------------------------------------

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function extractToken(req) {
  const auth = req.headers.authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
}

// Limpieza periodica de tokens expirados cada 30 minutos
setInterval(function pruneExpired() {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (now > session.expiresAt) sessions.delete(token);
  }
}, 30 * 60 * 1000);

// --- Handlers ----------------------------------------------------------------

function login(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Usuario y contrasena requeridos.' });
  }

  if (username !== config.admin.username || password !== config.admin.password) {
    // Retardo de 300ms para dificultar ataques de fuerza bruta
    return setTimeout(() => {
      res.status(401).json({ success: false, message: 'Credenciales incorrectas.' });
    }, 300);
  }

  const token     = generateToken();
  const expiresAt = Date.now() + config.token.expiresInMs;
  sessions.set(token, { username, expiresAt });

  res.json({
    success:   true,
    token,
    expiresAt,
    username,
    message:   'Inicio de sesion exitoso.',
  });
}

function logout(req, res) {
  const token = extractToken(req);
  if (token) sessions.delete(token);
  res.json({ success: true, message: 'Sesion cerrada.' });
}

// --- Middleware requireAuth --------------------------------------------------

function requireAuth(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      code:    'UNAUTHORIZED',
      message: 'Se requiere autenticacion. Inicia sesion en el panel.',
    });
  }

  const session = sessions.get(token);

  if (!session) {
    return res.status(401).json({
      success: false,
      code:    'INVALID_TOKEN',
      message: 'Token invalido. Vuelve a iniciar sesion.',
    });
  }

  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return res.status(401).json({
      success: false,
      code:    'TOKEN_EXPIRED',
      message: 'Sesion expirada. Vuelve a iniciar sesion.',
    });
  }

  req.user = { username: session.username };
  next();
}

module.exports = { login, logout, requireAuth };
