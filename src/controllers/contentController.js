/**
 * contentController.js — CRUD de items dentro de una colección (multi-tenant).
 *
 * Los datos del item se guardan en el campo `data` (Mixed) en MongoDB
 * y se aplanan en la respuesta JSON para mantener la misma forma que
 * esperan el panel de administración y el cliente-web.html:
 *
 *   { id, nombre, precio, descripcion, imagen, createdAt, updatedAt }
 */

const Collection = require('../models/Collection');
const Item       = require('../models/Item');
const mongoose   = require('mongoose');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convierte un documento Item en el objeto plano que espera el frontend.
 * Los campos del producto se aplanan desde `doc.data`.
 */
function formatItem(doc) {
  return {
    id:        doc._id.toString(),
    ...doc.data,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** Valida y sanitiza el body según el esquema de la colección. */
function validateAndSanitize(fields, body) {
  const errors = [];
  const data   = {};

  for (const field of fields) {
    const raw = body[field.key];

    switch (field.type) {
      case 'short_text':
      case 'image_url':
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

/** Comprueba si un string es un ObjectId válido de MongoDB. */
function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// ─── GET /admin/collections/:slug/items ───────────────────────────────────────

async function listItems(req, res) {
  try {
    const col = await Collection.findOne({ tenantId: req.tenant.id, slug: req.params.slug });
    if (!col) return res.status(404).json({ success: false, message: 'Colección no encontrada.' });

    const items = await Item.find({ tenantId: req.tenant.id, collectionSlug: req.params.slug })
                            .sort({ createdAt: 1 });

    const data = items.map(formatItem);
    res.json({ success: true, data, total: data.length });

  } catch (err) {
    console.error('[listItems]', err);
    res.status(500).json({ success: false, message: 'Error al obtener los items.' });
  }
}

// ─── GET /admin/collections/:slug/items/:id ───────────────────────────────────

async function getItem(req, res) {
  try {
    if (!isValidId(req.params.id))
      return res.status(404).json({ success: false, message: 'Item no encontrado.' });

    const col = await Collection.findOne({ tenantId: req.tenant.id, slug: req.params.slug });
    if (!col) return res.status(404).json({ success: false, message: 'Colección no encontrada.' });

    const item = await Item.findOne({
      _id:            req.params.id,
      tenantId:       req.tenant.id,
      collectionSlug: req.params.slug,
    });
    if (!item) return res.status(404).json({ success: false, message: 'Item no encontrado.' });

    res.json({ success: true, data: formatItem(item) });

  } catch (err) {
    console.error('[getItem]', err);
    res.status(500).json({ success: false, message: 'Error al obtener el item.' });
  }
}

// ─── POST /admin/collections/:slug/items ──────────────────────────────────────

async function createItem(req, res) {
  try {
    const col = await Collection.findOne({ tenantId: req.tenant.id, slug: req.params.slug });
    if (!col) return res.status(404).json({ success: false, message: 'Colección no encontrada.' });

    const { errors, data } = validateAndSanitize(col.fields, req.body);
    if (errors.length > 0) return res.status(400).json({ success: false, errors });

    const item = await Item.create({
      tenantId:       req.tenant.id,
      collectionSlug: req.params.slug,
      data,
    });

    res.status(201).json({ success: true, data: formatItem(item) });

  } catch (err) {
    console.error('[createItem]', err);
    res.status(500).json({ success: false, message: 'Error al crear el item.' });
  }
}

// ─── PUT /admin/collections/:slug/items/:id ───────────────────────────────────

async function updateItem(req, res) {
  try {
    if (!isValidId(req.params.id))
      return res.status(404).json({ success: false, message: 'Item no encontrado.' });

    const col = await Collection.findOne({ tenantId: req.tenant.id, slug: req.params.slug });
    if (!col) return res.status(404).json({ success: false, message: 'Colección no encontrada.' });

    const { errors, data } = validateAndSanitize(col.fields, req.body);
    if (errors.length > 0) return res.status(400).json({ success: false, errors });

    const item = await Item.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenant.id, collectionSlug: req.params.slug },
      { $set: { data } },
      { new: true }                // retorna el documento ya actualizado
    );
    if (!item) return res.status(404).json({ success: false, message: 'Item no encontrado.' });

    res.json({ success: true, data: formatItem(item) });

  } catch (err) {
    console.error('[updateItem]', err);
    res.status(500).json({ success: false, message: 'Error al actualizar el item.' });
  }
}

// ─── DELETE /admin/collections/:slug/items/:id ────────────────────────────────

async function deleteItem(req, res) {
  try {
    if (!isValidId(req.params.id))
      return res.status(404).json({ success: false, message: 'Item no encontrado.' });

    const col = await Collection.findOne({ tenantId: req.tenant.id, slug: req.params.slug });
    if (!col) return res.status(404).json({ success: false, message: 'Colección no encontrada.' });

    const result = await Item.deleteOne({
      _id:            req.params.id,
      tenantId:       req.tenant.id,
      collectionSlug: req.params.slug,
    });
    if (result.deletedCount === 0)
      return res.status(404).json({ success: false, message: 'Item no encontrado.' });

    res.json({ success: true, message: 'Item eliminado.' });

  } catch (err) {
    console.error('[deleteItem]', err);
    res.status(500).json({ success: false, message: 'Error al eliminar el item.' });
  }
}

module.exports = { listItems, getItem, createItem, updateItem, deleteItem };
