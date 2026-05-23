/**
 * fileDb.js — Abstracción de base de datos basada en archivos JSON.
 * Todas las operaciones son síncronas respecto a la lógica de negocio
 * pero usan fs/promises para no bloquear el event loop.
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR    = path.join(__dirname, 'data');
const SCHEMAS_FILE = path.join(DATA_DIR, 'schemas.json');
const CONTENT_DIR  = path.join(DATA_DIR, 'content');

// Garantiza que los directorios existan al arrancar el módulo
function ensureDirs() {
  if (!fs.existsSync(DATA_DIR))    fs.mkdirSync(DATA_DIR,    { recursive: true });
  if (!fs.existsSync(CONTENT_DIR)) fs.mkdirSync(CONTENT_DIR, { recursive: true });
  if (!fs.existsSync(SCHEMAS_FILE)) fs.writeFileSync(SCHEMAS_FILE, '{}', 'utf8');
}
ensureDirs();

// ─── Helpers genéricos ────────────────────────────────────────────────────────

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// ─── Schemas (definiciones de colecciones) ────────────────────────────────────

function getSchemas() {
  return readJSON(SCHEMAS_FILE) || {};
}

function getSchema(slug) {
  return getSchemas()[slug] || null;
}

function saveSchema(slug, schema) {
  const all = getSchemas();
  all[slug]  = schema;
  writeJSON(SCHEMAS_FILE, all);
}

function deleteSchema(slug) {
  const all = getSchemas();
  delete all[slug];
  writeJSON(SCHEMAS_FILE, all);
}

// ─── Contenido (items dentro de una colección) ────────────────────────────────

function contentPath(slug) {
  return path.join(CONTENT_DIR, `${slug}.json`);
}

function getItems(slug) {
  const file = contentPath(slug);
  if (!fs.existsSync(file)) return [];
  return readJSON(file) || [];
}

function getItem(slug, id) {
  return getItems(slug).find(item => item.id === id) || null;
}

function saveItems(slug, items) {
  writeJSON(contentPath(slug), items);
}

function createItem(slug, item) {
  const items = getItems(slug);
  items.push(item);
  saveItems(slug, items);
  return item;
}

function updateItem(slug, id, updates) {
  const items   = getItems(slug);
  const index   = items.findIndex(i => i.id === id);
  if (index === -1) return null;
  items[index]  = { ...items[index], ...updates };
  saveItems(slug, items);
  return items[index];
}

function deleteItem(slug, id) {
  const items    = getItems(slug);
  const filtered = items.filter(i => i.id !== id);
  if (filtered.length === items.length) return false;
  saveItems(slug, filtered);
  return true;
}

function deleteCollectionContent(slug) {
  const file = contentPath(slug);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

module.exports = {
  getSchemas,
  getSchema,
  saveSchema,
  deleteSchema,
  getItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  deleteCollectionContent,
};
