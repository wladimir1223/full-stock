/**
 * authController.js — Registro e inicio de sesión de tenants.
 *
 * POST /auth/register  → crea cuenta nueva + devuelve JWT
 * POST /auth/login     → valida credenciales + devuelve JWT
 *
 * Hashing de contraseñas: crypto.scryptSync (Node.js nativo, sin dependencias).
 * Slug del tenant: derivado del nombre del negocio, garantizado único.
 */

const crypto              = require('crypto');
const { v4: uuidv4 }      = require('uuid');
const userDb              = require('../db/userDb');
const fileDb              = require('../db/fileDb');
const { signJWT }         = require('../middleware/auth');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSlug(str) {
  return str
    .toLowerCase()
    .trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quitar tildes
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
      Buffer.from(hash, 'hex')
    );
  } catch {
    return false;
  }
}

// Construye la respuesta JWT con datos públicos del usuario
function buildJWTResponse(user) {
  const token = signJWT({
    tenantId:   user.id,
    tenantSlug: user.slug,
    email:      user.email,
    name:       user.name,
  });
  return {
    success: true,
    token,
    user: {
      email: user.email,
      name:  user.name,
      slug:  user.slug,
    },
  };
}

// ─── POST /auth/register ──────────────────────────────────────────────────────

function register(req, res) {
  const { name, email, password } = req.body;

  // Validaciones
  if (!name || String(name).trim() === '') {
    return res.status(400).json({ success: false, message: 'El nombre del negocio es obligatorio.' });
  }
  if (!email || String(email).trim() === '') {
    return res.status(400).json({ success: false, message: 'El email es obligatorio.' });
  }
  if (!password) {
    return res.status(400).json({ success: false, message: 'La contraseña es obligatoria.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ success: false, message: 'La contraseña debe tener al menos 8 caracteres.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ success: false, message: 'El email no tiene un formato válido.' });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Email único
  if (userDb.findByEmail(normalizedEmail)) {
    return setTimeout(() => {
      res.status(409).json({ success: false, message: 'Ya existe una cuenta con ese email.' });
    }, 300);
  }

  // Slug único — derivado del nombre del negocio
  let baseSlug = toSlug(name.trim()) || 'tenant';
  let slug     = baseSlug;
  let attempt  = 1;
  while (userDb.findBySlug(slug)) {
    slug = `${baseSlug}-${attempt++}`;
  }

  const user = {
    id:           uuidv4(),
    slug,
    name:         name.trim(),
    email:        normalizedEmail,
    passwordHash: hashPassword(password),
    createdAt:    new Date().toISOString(),
  };

  userDb.create(user);
  fileDb.ensureTenant(user.id);   // crea src/data/tenants/{id}/

  return res.status(201).json(buildJWTResponse(user));
}

// ─── POST /auth/login ─────────────────────────────────────────────────────────

function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email y contraseña son obligatorios.' });
  }

  const user = userDb.findByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    // Retardo para dificultar fuerza bruta
    return setTimeout(() => {
      res.status(401).json({ success: false, message: 'Credenciales incorrectas.' });
    }, 300);
  }

  return res.json(buildJWTResponse(user));
}

module.exports = { register, login };
