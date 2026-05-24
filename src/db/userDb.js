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

module.exports = { findByEmail, findBySlug, findById, create };
