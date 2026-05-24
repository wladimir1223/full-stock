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

const crypto         = require('crypto');
const userDb         = require('../db/userDb');
const { signJWT }    = require('../middleware/auth');

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

module.exports = { register, login, recover };
