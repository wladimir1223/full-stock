/**
 * fileDb.js — Abstracción de base de datos multi-tenant basada en archivos JSON.
 *
 * Aislamiento por tenant:
 *   src/data/tenants/{tenantId}/schemas.json          → definiciones de colecciones
 *   src/data/tenants/{tenantId}/content/{slug}.json   → items de cada colección
 *
 * TODAS las funciones reciben `tenantId` como primer argumento.
 * Nunca puede haber colisión de datos entre tenants distintos.
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

// ─── Rutas por tenant ─────────────────────────────────────────────────────────

function tenantDir(tenantId) {
  return path.join(DATA_DIR, 'tenants', tenantId);
}

function schemasPath(tenantId) {
  return path.join(tenantDir(tenantId), 'schemas.json');
}

function contentDir(tenantId) {
  return path.join(tenantDir(tenantId), 'content');
}

function contentPath(tenantId, slug) {
  return path.join(contentDir(tenantId), `${slug}.json`);
}

// ─── Bootstrap del tenant ─────────────────────────────────────────────────────

function ensureTenant(tenantId) {
  const tDir  = tenantDir(tenantId);
  const cDir  = contentDir(tenantId);
  const sPath = schemasPath(tenantId);
  if (!fs.existsSync(tDir))  fs.mkdirSync(tDir,  { recursive: true });
  if (!fs.existsSync(cDir))  fs.mkdirSync(cDir,  { recursive: true });
  if (!fs.existsSync(sPath)) fs.writeFileSync(sPath, '{}', 'utf8');
}

// ─── Helpers genéricos ────────────────────────────────────────────────────────

function readJSON(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// ─── Schemas (definiciones de colecciones) ────────────────────────────────────

function getSchemas(tenantId) {
  ensureTenant(tenantId);
  return readJSON(schemasPath(tenantId)) || {};
}

function getSchema(tenantId, slug) {
  return getSchemas(tenantId)[slug] || null;
}

function saveSchema(tenantId, slug, schema) {
  ensureTenant(tenantId);
  const all  = getSchemas(tenantId);
  all[slug]  = schema;
  writeJSON(schemasPath(tenantId), all);
}

function deleteSchema(tenantId, slug) {
  const all = getSchemas(tenantId);
  delete all[slug];
  writeJSON(schemasPath(tenantId), all);
}

// ─── Contenido (items dentro de una colección) ────────────────────────────────

function getItems(tenantId, slug) {
  const file = contentPath(tenantId, slug);
  if (!fs.existsSync(file)) return [];
  return readJSON(file) || [];
}

function getItem(tenantId, slug, id) {
  return getItems(tenantId, slug).find(item => item.id === id) || null;
}

function saveItems(tenantId, slug, items) {
  ensureTenant(tenantId);
  writeJSON(contentPath(tenantId, slug), items);
}

function createItem(tenantId, slug, item) {
  const items = getItems(tenantId, slug);
  items.push(item);
  saveItems(tenantId, slug, items);
  return item;
}

function updateItem(tenantId, slug, id, updates) {
  const items = getItems(tenantId, slug);
  const index = items.findIndex(i => i.id === id);
  if (index === -1) return null;
  items[index] = { ...items[index], ...updates };
  saveItems(tenantId, slug, items);
  return items[index];
}

function deleteItem(tenantId, slug, id) {
  const items    = getItems(tenantId, slug);
  const filtered = items.filter(i => i.id !== id);
  if (filtered.length === items.length) return false;
  saveItems(tenantId, slug, filtered);
  return true;
}

function deleteCollectionContent(tenantId, slug) {
  const file = contentPath(tenantId, slug);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

module.exports = {
  ensureTenant,
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
