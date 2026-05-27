/**
 * collectionsController.js — CRUD de colecciones (multi-tenant).
 *
 * Todas las operaciones están aisladas por req.tenant.id (tenantId).
 * Las respuestas JSON mantienen exactamente la misma forma que antes
 * para no romper el frontend ni los clientes externos.
 */

const Collection                = require('../models/Collection');
const Item                      = require('../models/Item');
const { logActivity, ACTIONS }  = require('../models/ActivityLog');

const VALID_TYPES = ['short_text', 'long_text', 'number', 'image_url'];

// ─── CVE-3: Sanitización backend (defensa en profundidad) ────────────────────
/**
 * Elimina etiquetas HTML completas del texto antes de persistirlo en MongoDB.
 * Ejemplo: '<script>alert(1)</script>Café' → 'Café'.
 */
function stripHtml(str) {
  return String(str).replace(/<[^>]*>/g, '').trim();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSlug(name) {
  return name
    .toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g,        '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g,         '-')
    .replace(/^-|-$/g,      '');
}

/** Convierte un documento Collection en el objeto plano que espera el frontend. */
function formatCollection(doc) {
  return {
    id:        doc._id.toString(),
    name:      doc.name,
    slug:      doc.slug,
    fields:    doc.fields,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// ─── GET /admin/collections ───────────────────────────────────────────────────

async function listCollections(req, res) {
  try {
    const cols = await Collection.find({ tenantId: req.tenant.id }).sort({ createdAt: 1 });
    res.json({ success: true, data: cols.map(formatCollection) });
  } catch (err) {
    console.error('[listCollections]', err);
    res.status(500).json({ success: false, message: 'Error al obtener las colecciones.' });
  }
}

// ─── GET /admin/collections/:slug ─────────────────────────────────────────────

async function getCollection(req, res) {
  try {
    const col = await Collection.findOne({ tenantId: req.tenant.id, slug: req.params.slug });
    if (!col) return res.status(404).json({ success: false, message: 'Colección no encontrada.' });
    res.json({ success: true, data: formatCollection(col) });
  } catch (err) {
    console.error('[getCollection]', err);
    res.status(500).json({ success: false, message: 'Error al obtener la colección.' });
  }
}

// ─── POST /admin/collections ──────────────────────────────────────────────────

async function createCollection(req, res) {
  try {
    const { name, fields } = req.body;

    // Validaciones
    if (!name || typeof name !== 'string' || name.trim() === '')
      return res.status(400).json({ success: false, message: 'El nombre de la colección es obligatorio.' });
    if (!Array.isArray(fields) || fields.length === 0)
      return res.status(400).json({ success: false, message: 'Debes definir al menos un campo.' });

    for (const field of fields) {
      if (!field.name || typeof field.name !== 'string' || field.name.trim() === '')
        return res.status(400).json({ success: false, message: 'Cada campo debe tener un nombre.' });
      if (!VALID_TYPES.includes(field.type))
        return res.status(400).json({
          success: false,
          message: `Tipo inválido: "${field.type}". Válidos: ${VALID_TYPES.join(', ')}.`,
        });
    }

    const slug = toSlug(name);
    if (!slug)
      return res.status(400).json({ success: false, message: 'Nombre de colección inválido.' });

    // Slug único por tenant
    const exists = await Collection.findOne({ tenantId: req.tenant.id, slug });
    if (exists)
      return res.status(409).json({ success: false, message: `Ya existe una colección con el slug "${slug}".` });

    const normalizedFields = fields.map(f => ({
      key:   f.name.toLowerCase().trim()
               .normalize('NFD').replace(/[̀-ͯ]/g, '')
               .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
      label: stripHtml(f.name),   // CVE-3: strip de etiquetas HTML en etiquetas de campo
      type:  f.type,
    }));

    // Garantizar que SIEMPRE exista un campo "stock" (control de inventario).
    // Si el usuario ya lo definió con cualquier nombre que normalice a "stock",
    // no lo duplicamos.
    const hasStock = normalizedFields.some(f => f.key === 'stock');
    if (!hasStock) {
      normalizedFields.push({ key: 'stock', label: 'Stock', type: 'number' });
    }

    const col = await Collection.create({
      tenantId: req.tenant.id,
      name:     stripHtml(name),   // CVE-3: strip de etiquetas HTML
      slug,
      fields:   normalizedFields,
    });

    logActivity(req.tenant, ACTIONS.CREATE_COLLECTION,
      `Creó la colección "${col.name}" (slug: ${col.slug}) con ${col.fields.length} campos`, col._id);

    res.status(201).json({ success: true, data: formatCollection(col) });

  } catch (err) {
    console.error('[createCollection]', err);
    res.status(500).json({ success: false, message: 'Error al crear la colección.' });
  }
}

// ─── DELETE /admin/collections/:slug ──────────────────────────────────────────

async function deleteCollection(req, res) {
  try {
    const { slug } = req.params;

    const col = await Collection.findOne({ tenantId: req.tenant.id, slug });
    if (!col) return res.status(404).json({ success: false, message: 'Colección no encontrada.' });

    // Eliminar la colección y todos sus items en paralelo
    await Promise.all([
      Collection.deleteOne({ _id: col._id }),
      Item.deleteMany({ tenantId: req.tenant.id, collectionSlug: slug }),
    ]);

    logActivity(req.tenant, ACTIONS.DELETE_COLLECTION,
      `Eliminó la colección "${col.name}" (slug: ${col.slug}) y todos sus items`, col._id);

    res.json({ success: true, message: `Colección "${col.name}" eliminada.` });

  } catch (err) {
    console.error('[deleteCollection]', err);
    res.status(500).json({ success: false, message: 'Error al eliminar la colección.' });
  }
}

module.exports = { listCollections, getCollection, createCollection, deleteCollection };
