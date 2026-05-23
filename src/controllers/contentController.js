/**
 * contentController.js — CRUD de items dentro de una colección.
 * Valida los datos recibidos contra el esquema definido por el desarrollador.
 */

const db = require('../db/fileDb');
const { v4: uuidv4 } = require('uuid');

// Valida y sanitiza el payload de un item según el esquema de la colección
function validateAndSanitize(fields, body) {
  const errors = [];
  const data   = {};

  for (const field of fields) {
    const raw = body[field.key];

    switch (field.type) {
      case 'short_text':
      case 'image_url':
        if (raw === undefined || raw === null || String(raw).trim() === '') {
          errors.push(`El campo "${field.label}" es obligatorio.`);
        } else {
          data[field.key] = String(raw).trim();
        }
        break;

      case 'long_text':
        if (raw === undefined || raw === null || String(raw).trim() === '') {
          errors.push(`El campo "${field.label}" es obligatorio.`);
        } else {
          data[field.key] = String(raw).trim();
        }
        break;

      case 'number':
        if (raw === undefined || raw === null || raw === '') {
          errors.push(`El campo "${field.label}" es obligatorio.`);
        } else {
          const num = Number(raw);
          if (isNaN(num)) {
            errors.push(`El campo "${field.label}" debe ser un número válido.`);
          } else {
            data[field.key] = num;
          }
        }
        break;

      default:
        data[field.key] = raw;
    }
  }

  return { errors, data };
}

// GET /admin/collections/:slug/items
function listItems(req, res) {
  const schema = db.getSchema(req.params.slug);
  if (!schema) return res.status(404).json({ success: false, message: 'Colección no encontrada.' });

  const items = db.getItems(req.params.slug);
  res.json({ success: true, data: items, total: items.length });
}

// GET /admin/collections/:slug/items/:id
function getItem(req, res) {
  const schema = db.getSchema(req.params.slug);
  if (!schema) return res.status(404).json({ success: false, message: 'Colección no encontrada.' });

  const item = db.getItem(req.params.slug, req.params.id);
  if (!item) return res.status(404).json({ success: false, message: 'Item no encontrado.' });

  res.json({ success: true, data: item });
}

// POST /admin/collections/:slug/items
function createItem(req, res) {
  const schema = db.getSchema(req.params.slug);
  if (!schema) return res.status(404).json({ success: false, message: 'Colección no encontrada.' });

  const { errors, data } = validateAndSanitize(schema.fields, req.body);
  if (errors.length > 0) return res.status(400).json({ success: false, errors });

  const now  = new Date().toISOString();
  const item = {
    id:        uuidv4(),
    ...data,
    createdAt: now,
    updatedAt: now,
  };

  db.createItem(req.params.slug, item);
  res.status(201).json({ success: true, data: item });
}

// PUT /admin/collections/:slug/items/:id
function updateItem(req, res) {
  const schema = db.getSchema(req.params.slug);
  if (!schema) return res.status(404).json({ success: false, message: 'Colección no encontrada.' });

  const existing = db.getItem(req.params.slug, req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: 'Item no encontrado.' });

  const { errors, data } = validateAndSanitize(schema.fields, req.body);
  if (errors.length > 0) return res.status(400).json({ success: false, errors });

  const updated = db.updateItem(req.params.slug, req.params.id, {
    ...data,
    updatedAt: new Date().toISOString(),
  });

  res.json({ success: true, data: updated });
}

// DELETE /admin/collections/:slug/items/:id
function deleteItem(req, res) {
  const schema = db.getSchema(req.params.slug);
  if (!schema) return res.status(404).json({ success: false, message: 'Colección no encontrada.' });

  const deleted = db.deleteItem(req.params.slug, req.params.id);
  if (!deleted) return res.status(404).json({ success: false, message: 'Item no encontrado.' });

  res.json({ success: true, message: 'Item eliminado.' });
}

module.exports = { listItems, getItem, createItem, updateItem, deleteItem };
