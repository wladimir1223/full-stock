/**
 * userDb.js — Abstracción de acceso a la colección de Usuarios/Tenants.
 *
 * Todas las funciones son async y retornan objetos planos con un
 * campo `id` (string) para mantener compatibilidad con los controladores
 * y el módulo de autenticación JWT.
 */

const User = require('../models/User');

// ─── Helpers internos ─────────────────────────────────────────────────────────

/** Convierte un documento Mongoose en objeto plano con `id` como string. */
function toPlain(doc) {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject() : doc;
  return { ...obj, id: obj._id.toString() };
}

// ─── Consultas ────────────────────────────────────────────────────────────────

async function findByEmail(email) {
  const doc = await User.findOne({ email: email.toLowerCase().trim() });
  return toPlain(doc);
}

async function findBySlug(slug) {
  const doc = await User.findOne({ slug });
  return toPlain(doc);
}

async function findById(id) {
  const doc = await User.findById(id).catch(() => null);
  return toPlain(doc);
}

/**
 * Busca un usuario por token de reseteo VÁLIDO (no expirado).
 * Devuelve null si el token no existe o ya caducó.
 */
async function findByResetToken(token) {
  if (!token) return null;
  const doc = await User.findOne({
    resetPasswordToken:   token,
    resetPasswordExpires: { $gt: new Date() },
  });
  return toPlain(doc);
}

// ─── Escritura ────────────────────────────────────────────────────────────────

/**
 * Crea un nuevo usuario/tenant en MongoDB.
 * Recibe: { slug, name, email, passwordHash }
 * Devuelve el documento con `id` como string.
 */
async function create(userData) {
  const doc = await User.create({
    slug:         userData.slug,
    name:         userData.name,
    email:        userData.email,
    passwordHash: userData.passwordHash,
  });
  return toPlain(doc);
}

/**
 * Guarda el token de reseteo y su expiración en el usuario indicado.
 * @param {string} id       _id del usuario
 * @param {string} token    token hex generado con crypto
 * @param {Date}   expires  fecha de caducidad (Date.now() + 1h)
 */
async function setResetToken(id, token, expires) {
  await User.findByIdAndUpdate(id, {
    resetPasswordToken:   token,
    resetPasswordExpires: expires,
  });
}

/**
 * Actualiza la contraseña (hash) y LIMPIA los campos del token de reseteo.
 * Se usa al completar el flujo /api/auth/reset-password.
 */
async function updatePassword(id, passwordHash) {
  await User.findByIdAndUpdate(id, {
    passwordHash,
    $unset: { resetPasswordToken: '', resetPasswordExpires: '' },
  });
}

module.exports = {
  findByEmail, findBySlug, findById, create,
  findByResetToken, setResetToken, updatePassword,
};
