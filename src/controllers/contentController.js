/**
 * contentController.js — CRUD de items dentro de una colección (multi-tenant).
 *
 * Los datos del item se guardan en el campo `data` (Mixed) en MongoDB
 * y se aplanan en la respuesta JSON para mantener la misma forma que
 * esperan el panel de administración y el cliente-web.html:
 *
 *   { id, nombre, precio, descripcion, imagen, createdAt, updatedAt }
 */

const Collection                = require('../models/Collection');
const Item                      = require('../models/Item');
const User                      = require('../models/User');
const mongoose                  = require('mongoose');
const { logActivity, ACTIONS }  = require('../models/ActivityLog');

// Límite de productos por plan  ← único lugar donde se define
const PLAN_LIMITS = { basic: 35, pro: 100, full: 200 };

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

    // ── Plan limit check ────────────────────────────────────────────────────
    const user    = await User.findById(req.tenant.id).select('plan').lean();
    const plan    = (user && user.plan) || 'basic';
    const limit   = PLAN_LIMITS[plan] ?? PLAN_LIMITS.basic;
    const current = await Item.countDocuments({ tenantId: req.tenant.id });
    if (current >= limit) {
      return res.status(403).json({
        success: false,
        code:    'PLAN_LIMIT_REACHED',
        plan,
        limit,
        current,
        message: `Límite alcanzado: tu plan "${plan}" permite hasta ${limit} productos. ` +
                 `Contacta al administrador para subir de nivel.`,
      });
    }
    // ────────────────────────────────────────────────────────────────────────

    const { errors, data } = validateAndSanitize(col.fields, req.body);
    if (errors.length > 0) return res.status(400).json({ success: false, errors });

    const item = await Item.create({
      tenantId:       req.tenant.id,
      collectionSlug: req.params.slug,
      data,
    });

    const productName = data.nombre || data.name || data.titulo || item._id.toString();
    logActivity(req.tenant, ACTIONS.CREATE_ITEM,
      `Creó producto "${productName}" en colección "${req.params.slug}"`, item._id);

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

    const productName = data.nombre || data.name || data.titulo || req.params.id;
    logActivity(req.tenant, ACTIONS.UPDATE_ITEM,
      `Editó producto "${productName}" en colección "${req.params.slug}"`, req.params.id);

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

    logActivity(req.tenant, ACTIONS.DELETE_ITEM,
      `Eliminó producto ID "${req.params.id}" de colección "${req.params.slug}"`, req.params.id);

    res.json({ success: true, message: 'Item eliminado.' });

  } catch (err) {
    console.error('[deleteItem]', err);
    res.status(500).json({ success: false, message: 'Error al eliminar el item.' });
  }
}

// ─── POST /admin/collections/:slug/items/:id/sell ────────────────────────────
//
// Registra una venta restando `quantity` unidades del stock del producto.
//
// Body: { quantity: 1 }
//
// Lógica:
//   1. Validar que quantity sea entero > 0
//   2. Leer el stock actual del documento
//   3. Si stock < quantity → 400 INSUFFICIENT_STOCK
//   4. Decremento atómico con $inc + condición $gte (safe race-condition)
//   5. Devuelve el documento actualizado

async function sellItem(req, res) {
  try {
    if (!isValidId(req.params.id))
      return res.status(404).json({ success: false, message: 'Producto no encontrado.' });

    const quantity = parseInt(req.body.quantity, 10);
    if (!Number.isInteger(quantity) || quantity < 1)
      return res.status(400).json({
        success: false,
        message: 'La cantidad debe ser un número entero positivo.',
      });

    // Verificar existencia y propiedad del tenant
    const existing = await Item.findOne({
      _id:            req.params.id,
      tenantId:       req.tenant.id,
      collectionSlug: req.params.slug,
    });
    if (!existing)
      return res.status(404).json({ success: false, message: 'Producto no encontrado.' });

    const currentStock = Number(existing.data?.stock ?? 0);

    if (currentStock < quantity) {
      return res.status(400).json({
        success: false,
        code:    'INSUFFICIENT_STOCK',
        message: `Stock insuficiente. Disponible: ${currentStock}, solicitado: ${quantity}.`,
        stock:   currentStock,
      });
    }

    // Decremento atómico: solo se aplica si en MongoDB sigue habiendo suficiente stock
    // (protege contra condiciones de carrera si hay peticiones simultáneas)
    const updated = await Item.findOneAndUpdate(
      {
        _id:          existing._id,
        tenantId:     req.tenant.id,
        'data.stock': { $gte: quantity },
      },
      { $inc: { 'data.stock': -quantity } },
      { new: true }
    );

    if (!updated) {
      return res.status(400).json({
        success: false,
        code:    'INSUFFICIENT_STOCK',
        message: 'Stock insuficiente (actualizado por otra operación simultánea). Recarga e intenta de nuevo.',
        stock:   0,
      });
    }

    const soldName = updated.data?.nombre || updated.data?.name || req.params.id;
    logActivity(req.tenant, ACTIONS.SELL_ITEM,
      `Vendió ${quantity} unidad(es) de "${soldName}" en "${req.params.slug}". Stock restante: ${updated.data.stock}`,
      req.params.id);

    res.json({
      success: true,
      message: `Venta registrada. Stock restante: ${updated.data.stock}.`,
      data:    formatItem(updated),
    });

  } catch (err) {
    console.error('[sellItem]', err);
    res.status(500).json({ success: false, message: 'Error al registrar la venta.' });
  }
}

module.exports = { listItems, getItem, createItem, updateItem, deleteItem, sellItem };
