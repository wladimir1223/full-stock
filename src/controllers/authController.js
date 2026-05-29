/**
 * authController.js — Registro, login y recuperación de contraseña.
 *
 * POST /auth/register  → crea cuenta nueva + devuelve JWT
 * POST /auth/login     → valida credenciales + devuelve JWT
 * POST /auth/recover   → solicitud de recuperación (siempre success)
 *
 * Hashing: crypto.scryptSync (Node.js nativo, sin dependencias).
 * Slug del tenant: derivado del nombre del negocio, garantizado único en MongoDB.
 */

const crypto                    = require('crypto');
const userDb                    = require('../db/userDb');
const { signJWT }               = require('../middleware/auth');
const { logActivity, ACTIONS }  = require('../models/ActivityLog');
const { sendPasswordResetEmail } = require('../utils/mailer');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSlug(str) {
  return str
    .toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g,        '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g,         '-')
    .replace(/^-|-$/g,      '')
    .slice(0, 40);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, storedHash] = stored.split(':');
  if (!salt || !storedHash) return false;
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(storedHash, 'hex'),
      Buffer.from(hash,       'hex')
    );
  } catch {
    return false;
  }
}

function buildJWTResponse(user) {
  const token = signJWT({
    tenantId:   user.id,      // ObjectId.toString() — coincide con req.tenant.id
    tenantSlug: user.slug,
    email:      user.email,
    name:       user.name,
    role:       user.role || 'tenant',
  });
  return {
    success: true,
    token,
    user: { email: user.email, name: user.name, slug: user.slug },
  };
}

// ─── POST /auth/register ──────────────────────────────────────────────────────

async function register(req, res) {
  try {
    const { name, email, password } = req.body;

    // Validaciones básicas
    if (!name || String(name).trim() === '')
      return res.status(400).json({ success: false, message: 'El nombre del negocio es obligatorio.' });
    if (!email || String(email).trim() === '')
      return res.status(400).json({ success: false, message: 'El email es obligatorio.' });
    if (!password)
      return res.status(400).json({ success: false, message: 'La contraseña es obligatoria.' });
    if (password.length < 8)
      return res.status(400).json({ success: false, message: 'La contraseña debe tener al menos 8 caracteres.' });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email))
      return res.status(400).json({ success: false, message: 'El email no tiene un formato válido.' });

    const normalizedEmail = email.toLowerCase().trim();

    // Email único
    const existing = await userDb.findByEmail(normalizedEmail);
    if (existing) {
      return setTimeout(() =>
        res.status(409).json({ success: false, message: 'Ya existe una cuenta con ese email.' })
      , 300);
    }

    // Slug único derivado del nombre del negocio
    let baseSlug = toSlug(name.trim()) || 'tenant';
    let slug     = baseSlug;
    let attempt  = 1;
    while (await userDb.findBySlug(slug)) {
      slug = `${baseSlug}-${attempt++}`;
    }

    const user = await userDb.create({
      slug,
      name:         name.trim(),
      email:        normalizedEmail,
      passwordHash: hashPassword(password),
    });

    logActivity(user, ACTIONS.USER_REGISTER, `Nueva cuenta registrada: ${user.email}`);
    return res.status(201).json(buildJWTResponse(user));

  } catch (err) {
    console.error('[register]', err);
    res.status(500).json({ success: false, message: 'Error interno del servidor.' });
  }
}

// ─── POST /auth/login ─────────────────────────────────────────────────────────

async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ success: false, message: 'Email y contraseña son obligatorios.' });

    const user = await userDb.findByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return setTimeout(() =>
        res.status(401).json({ success: false, message: 'Credenciales incorrectas.' })
      , 300);
    }

    logActivity(user, ACTIONS.USER_LOGIN, `Login exitoso: ${user.email}`);
    return res.json(buildJWTResponse(user));

  } catch (err) {
    console.error('[login]', err);
    res.status(500).json({ success: false, message: 'Error interno del servidor.' });
  }
}

// ─── POST /auth/recover ───────────────────────────────────────────────────────
// Siempre responde success para prevenir enumeración de emails.

async function recover(req, res) {
  try {
    const { email } = req.body;

    if (!email || String(email).trim() === '')
      return res.status(400).json({ success: false, message: 'El email es obligatorio.' });

    // Verificación interna (el resultado no se revela al cliente)
    await userDb.findByEmail(String(email).toLowerCase().trim());

    return setTimeout(() => res.json({ success: true }), 300);

  } catch (err) {
    console.error('[recover]', err);
    res.status(500).json({ success: false, message: 'Error interno del servidor.' });
  }
}

// ─── POST /api/auth/forgot-password ───────────────────────────────────────────
// Genera un token temporal (1h) y envía el correo de reseteo.
// SIEMPRE responde con un mensaje genérico para evitar enumeración de usuarios.

const GENERIC_FORGOT_MSG = 'Si el correo existe, recibirás un enlace para restablecer tu contraseña.';

async function forgotPassword(req, res) {
  try {
    const { email } = req.body;

    if (!email || String(email).trim() === '')
      return res.status(400).json({ success: false, message: 'El email es obligatorio.' });

    const normalizedEmail = String(email).toLowerCase().trim();
    const user            = await userDb.findByEmail(normalizedEmail);

    // Solo generamos token + correo si el usuario existe; en cualquier caso
    // la respuesta es idéntica (anti-enumeración).
    if (user) {
      const token   = crypto.randomBytes(20).toString('hex');
      const expires = new Date(Date.now() + 3600000); // 1 hora

      await userDb.setResetToken(user.id, token, expires);

      // Base URL: APP_URL si está definida, si no se deriva del request.
      const baseUrl  = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
      const resetUrl = `${baseUrl}/reset-password.html?token=${token}`;

      try {
        await sendPasswordResetEmail(user.email, resetUrl);
      } catch (mailErr) {
        // No revelamos el fallo al cliente, pero registramos el error COMPLETO
        // en consola para diagnosticar la respuesta exacta del proveedor SMTP.
        console.error('❌ [forgotPassword] Falló el envío del correo de reseteo.');
        console.error('   → message:', mailErr.message);
        console.error('   → code   :', mailErr.code);
        console.error('   → error completo:', mailErr);
      }
    }

    // Pequeño delay uniforme para mitigar ataques de temporización.
    return setTimeout(() => res.json({ success: true, message: GENERIC_FORGOT_MSG }), 300);

  } catch (err) {
    console.error('[forgotPassword]', err);
    res.status(500).json({ success: false, message: 'Error interno del servidor.' });
  }
}

// ─── POST /api/auth/reset-password ─────────────────────────────────────────────
// Valida token + expiración, encripta la nueva contraseña y limpia el token.

async function resetPassword(req, res) {
  try {
    const { token, password } = req.body;

    if (!token || String(token).trim() === '')
      return res.status(400).json({ success: false, message: 'Token de recuperación no proporcionado.' });
    if (!password)
      return res.status(400).json({ success: false, message: 'La nueva contraseña es obligatoria.' });
    if (password.length < 8)
      return res.status(400).json({ success: false, message: 'La contraseña debe tener al menos 8 caracteres.' });

    const user = await userDb.findByResetToken(String(token).trim());
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'El enlace de recuperación es inválido o ha expirado. Solicita uno nuevo.',
      });
    }

    // Reutiliza el mismo hashing que el registro (scrypt) y limpia el token.
    await userDb.updatePassword(user.id, hashPassword(password));

    logActivity(user, ACTIONS.PASSWORD_RESET, `Contraseña restablecida: ${user.email}`);
    return res.json({ success: true, message: 'Tu contraseña se actualizó correctamente. Ya puedes iniciar sesión.' });

  } catch (err) {
    console.error('[resetPassword]', err);
    res.status(500).json({ success: false, message: 'Error interno del servidor.' });
  }
}

module.exports = { register, login, recover, forgotPassword, resetPassword };
