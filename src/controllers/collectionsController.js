/**
 * collectionsController.js — CRUD de esquemas de colecciones (multi-tenant).
 * Todas las operaciones están aisladas por req.tenant.id.
 */

const db              = require('../db/fileDb');
const { v4: uuidv4 }  = require('uuid');

// Convierte un nombre en slug URL-safe
function toSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g,        '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g,         '-')
    .replace(/^-|-$/g,      '');
}

const VALID_TYPES = ['short_text', 'long_text', 'number', 'image_url'];

// GET /admin/collections
function listCollections(req, res) {
  const schemas = db.getSchemas(req.tenant.id);
  res.json({ success: true, data: Object.values(schemas) });
}

// GET /admin/collections/:slug
function getCollection(req, res) {
  const schema = db.getSchema(req.tenant.id, req.params.slug);
  if (!schema) return res.status(404).json({ success: false, message: 'Colección no encontrada.' });
  res.json({ success: true, data: schema });
}

// POST /admin/collections
function createCollection(req, res) {
  const { name, fields } = req.body;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ success: false, message: 'El nombre de la colección es obligatorio.' });
  }
  if (!Array.isArray(fields) || fields.length === 0) {
    return res.status(400).json({ success: false, message: 'Debes definir al menos un campo.' });
  }

  for (const field of fields) {
    if (!field.name || typeof field.name !== 'string' || field.name.trim() === '') {
      return res.status(400).json({ success: false, message: 'Cada campo debe tener un nombre.' });
    }
    if (!VALID_TYPES.includes(field.type)) {
      return res.status(400).json({
        success: false,
        message: `Tipo inválido: "${field.type}". Válidos: ${VALID_TYPES.join(', ')}.`,
      });
    }
  }

  const slug = toSlug(name);
  if (!slug) return res.status(400).json({ success: false, message: 'Nombre de colección inválido.' });

  if (db.getSchema(req.tenant.id, slug)) {
    return res.status(409).json({ success: false, message: `Ya existe una colección con el slug "${slug}".` });
  }

  const normalizedFields = fields.map(f => ({
    key:   f.name.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
    label: f.name.trim(),
    type:  f.type,
  }));

  const schema = {
    id:        uuidv4(),
    name:      name.trim(),
    slug,
    fields:    normalizedFields,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.saveSchema(req.tenant.id, slug, schema);
  res.status(201).json({ success: true, data: schema });
}

// DELETE /admin/collections/:slug
function deleteCollection(req, res) {
  const { slug } = req.params;
  const schema   = db.getSchema(req.tenant.id, slug);
  if (!schema) return res.status(404).json({ success: false, message: 'Colección no encontrada.' });

  db.deleteSchema(req.tenant.id, slug);
  db.deleteCollectionContent(req.tenant.id, slug);
  res.json({ success: true, message: `Colección "${schema.name}" eliminada.` });
}

module.exports = { listCollections, getCollection, createCollection, deleteCollection };
