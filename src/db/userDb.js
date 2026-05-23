/**
 * userDb.js — Gestión de usuarios / tenants.
 * Almacena en: src/data/users.json
 * Cada usuario ES un tenant (relación 1:1).
 *
 * Estructura de cada usuario:
 * {
 *   id:           string  (UUID — también es el tenant_id)
 *   slug:         string  (identificador URL-safe único, ej: "cafe-lumiere")
 *   name:         string  (nombre del negocio / cuenta)
 *   email:        string  (lowercase)
 *   passwordHash: string  ("salt:hash" generado con scrypt)
 *   createdAt:    string  (ISO)
 * }
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR   = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// ─── Bootstrap ────────────────────────────────────────────────────────────────

function ensureFile() {
  if (!fs.existsSync(DATA_DIR))   fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]', 'utf8');
}
ensureFile();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')) || [];
  } catch {
    return [];
  }
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

// ─── Consultas ────────────────────────────────────────────────────────────────

function findByEmail(email) {
  return readUsers().find(u => u.email === email.toLowerCase().trim()) || null;
}

function findBySlug(slug) {
  return readUsers().find(u => u.slug === slug) || null;
}

function findById(id) {
  return readUsers().find(u => u.id === id) || null;
}

// ─── Escritura ────────────────────────────────────────────────────────────────

function create(user) {
  const users = readUsers();
  users.push(user);
  writeUsers(users);
  return user;
}

module.exports = { findByEmail, findBySlug, findById, create };
