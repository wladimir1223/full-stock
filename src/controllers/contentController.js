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
const PLAN_LIMITS = { basic: 100, pro: 500, full: 1000 };

// ─── CVE-3: Sanitización backend (defensa en profundidad) ────────────────────
/**
 * Elimina etiquetas HTML completas del texto antes de persistirlo en MongoDB.
 * Ejemplo: '<img src="x" onerror="alert(1)">' → '' (tag eliminado).
 * Los caracteres sueltos < > " ' sin formar un tag se preservan.
 * El frontend aplica escHtml() adicionalmente como segunda capa de defensa.
 */
function stripHtml(str) {
  return String(str).replace(/<[^>]*>/g, '').trim();
}

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
          data[field.key] = stripHtml(String(raw));   // CVE-3: strip de etiquetas HTML
        }
        break;

      case 'number':
        if (raw === undefined || raw === null || raw === '') {
          errors.push(`El campo "${field.label}" es obligatorio.`);
        } else {
          const num = Number(raw);
          if (isNaN(num)) {
            errors.push(`El campo "${field.label}" debe ser un número válido.`);
          } else if (field.key === 'stock' && num < 0) {
            errors.push('El stock no puede ser un número negativo.');   // CVE validación stock
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

/** Normaliza un nombre a slug (idéntico al de collectionsController). */
function toSlug(name) {
  return String(name)
    .toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g,        '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g,         '-')
    .replace(/^-|-$/g,      '');
}

/** Saneamiento numérico defensivo: vacío, NaN o negativo → 0. */
function cleanNum(v) {
  const n = Number(v);
  return (!isFinite(n) || n < 0) ? 0 : n;
}

// Esquema estándar para categorías auto-creadas durante la importación.
const DEFAULT_IMPORT_FIELDS = [
  { key: 'nombre',      label: 'Nombre',      type: 'short_text' },
  { key: 'precio',      label: 'Precio',      type: 'number'     },
  { key: 'stock',       label: 'Stock',       type: 'number'     },
  { key: 'descripcion', label: 'Descripción', type: 'long_text'  },
  { key: 'imagen',      label: 'Imagen',      type: 'image_url'  },
];

/**
 * Mapea un producto normalizado { nombre, precioVenta, precioCosto, stock, descripcion }
 * a un objeto `data` alineado con el esquema (fields) de la colección de destino.
 * Campos no reconocidos se rellenan con '' (texto) o 0 (número).
 */
function buildItemData(fields, prod) {
  const data = {};
  for (const f of fields) {
    const k = f.key;
    if (['nombre', 'name', 'titulo', 'title', 'producto', 'articulo'].includes(k)) {
      data[k] = prod.nombre;
    } else if (['precio', 'price', 'venta', 'valor', 'importe', 'pvp'].includes(k)) {
      data[k] = prod.precioVenta;
    } else if (k === 'stock' || ['cantidad', 'unidades'].includes(k)) {
      data[k] = Math.floor(prod.stock);
    } else if (['descripcion', 'description', 'detalle', 'desc'].includes(k)) {
      data[k] = prod.descripcion || '';
    } else if (f.type === 'number') {
      data[k] = 0;
    } else {
      data[k] = '';
    }
  }
  if (prod.precioCosto > 0) data.precioCosto = prod.precioCosto;
  return data;
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

    // ── Passthrough: precioCosto (no forma parte del esquema dinámico pero se
    //    persiste en data para que el endpoint de analíticas calcule ganancia neta) ──
    const rawCosto = req.body.precioCosto;
    if (rawCosto !== undefined && rawCosto !== null && rawCosto !== '') {
      const costo = Number(rawCosto);
      if (!isNaN(costo) && costo >= 0) data.precioCosto = costo;
    }

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

    // ── Passthrough: precioCosto ─────────────────────────────────────────────
    const rawCosto = req.body.precioCosto;
    if (rawCosto !== undefined && rawCosto !== null && rawCosto !== '') {
      const costo = Number(rawCosto);
      if (!isNaN(costo) && costo >= 0) data.precioCosto = costo;
    }

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

// ─── Colector de código de barras ─────────────────────────────────────────────

/**
 * Limpia un código de barras dejando solo caracteres alfanuméricos.
 * Los lectores/cámaras a veces añaden saltos de línea, espacios o caracteres
 * de control (Enter/Tab) al final del código; los eliminamos antes de buscar
 * en MongoDB para evitar falsos negativos.
 */
function cleanBarcode(raw) {
  return String(raw == null ? '' : raw).replace(/[^a-zA-Z0-9]/g, '').trim();
}

// Colección por defecto donde aterrizan los productos borrador creados al
// escanear un código de barras desconocido (flujo "Carga Rápida").
const SCAN_COLLECTION_SLUG   = 'colector';
const SCAN_COLLECTION_NAME   = 'Colector';
const SCAN_COLLECTION_FIELDS = [
  { key: 'nombre',      label: 'Nombre',           type: 'short_text' },
  { key: 'barcode',     label: 'Código de barras', type: 'short_text' },
  { key: 'precio',      label: 'Precio',           type: 'number'     },
  { key: 'stock',       label: 'Stock',            type: 'number'     },
  { key: 'descripcion', label: 'Descripción',      type: 'long_text'  },
  { key: 'imagen',      label: 'Imagen',           type: 'image_url'  },
];

/** Devuelve (creándola si no existe) la colección por defecto del colector. */
async function ensureScanCollection(tenantId) {
  let col = await Collection.findOne({ tenantId, slug: SCAN_COLLECTION_SLUG });
  if (!col) {
    col = await Collection.create({
      tenantId,
      name:   SCAN_COLLECTION_NAME,
      slug:   SCAN_COLLECTION_SLUG,
      fields: SCAN_COLLECTION_FIELDS,
    });
  }
  return col;
}

// ─── PATCH /api/products/quick-scan ────────────────────────────────────────────
//
// Carga Rápida (+1). Recibe un código de barras y suma 1 al stock del producto
// que lo tenga asignado. Si no existe ninguno, crea un producto borrador con
// stock 1 en la colección "Colector".
//
// Body: { barcode: "7790001234567" }
//
// Lógica (operación ATÓMICA para evitar colisiones entre escaneos simultáneos):
//   1. Limpiar el código (solo alfanuméricos).
//   2. findOneAndUpdate { tenantId, 'data.barcode': code } con $inc { 'data.stock': 1 }.
//   3. Si devuelve null → no existe → crear borrador con stock 1.
//
// Respuesta: { success, created, message, data: { id, ...campos, collectionSlug } }

async function quickScan(req, res) {
  try {
    const code = cleanBarcode(req.body.barcode);
    if (!code) {
      return res.status(400).json({ success: false, message: 'Código de barras inválido o vacío.' });
    }

    // ── 1. Intento atómico: si el producto ya existe, +1 al stock ──────────────
    const updated = await Item.findOneAndUpdate(
      { tenantId: req.tenant.id, 'data.barcode': code },
      { $inc: { 'data.stock': 1 } },
      { new: true }
    );

    if (updated) {
      const name = updated.data?.nombre || updated.data?.name || code;
      logActivity(req.tenant, ACTIONS.UPDATE_ITEM,
        `Carga rápida: +1 a "${name}" (código ${code}) en "${updated.collectionSlug}". Stock: ${updated.data.stock}`,
        updated._id);

      return res.json({
        success: true,
        created: false,
        message: `+1 a "${name}". Stock actual: ${updated.data.stock}.`,
        data:    { ...formatItem(updated), collectionSlug: updated.collectionSlug },
      });
    }

    // ── 2. No existe → crear borrador con stock 1 ──────────────────────────────
    // Respetar el límite de productos del plan antes de insertar.
    const user    = await User.findById(req.tenant.id).select('plan').lean();
    const plan    = (user && user.plan) || 'basic';
    const limit   = PLAN_LIMITS[plan] ?? PLAN_LIMITS.basic;
    const current = await Item.countDocuments({ tenantId: req.tenant.id });
    if (current >= limit) {
      return res.status(403).json({
        success: false,
        code:    'PLAN_LIMIT_REACHED',
        plan, limit, current,
        message: `Límite alcanzado: tu plan "${plan}" permite hasta ${limit} productos. ` +
                 `Contacta al administrador para subir de nivel.`,
      });
    }

    const col  = await ensureScanCollection(req.tenant.id);
    const item = await Item.create({
      tenantId:       req.tenant.id,
      collectionSlug: col.slug,
      data: {
        nombre:      'Producto sin nombre',
        barcode:     code,
        precio:      0,
        stock:       1,
        descripcion: '',
        imagen:      '',
      },
    });

    logActivity(req.tenant, ACTIONS.CREATE_ITEM,
      `Carga rápida: nuevo borrador (código ${code}) creado en "${col.slug}" con stock 1.`, item._id);

    return res.status(201).json({
      success: true,
      created: true,
      message: 'Producto nuevo detectado: borrador creado con stock 1. Edítalo para completar sus datos.',
      data:    { ...formatItem(item), collectionSlug: col.slug },
    });

  } catch (err) {
    console.error('[quickScan]', err);
    res.status(500).json({ success: false, message: 'Error al procesar el escaneo rápido.' });
  }
}

// ─── GET /api/products/by-barcode?code=... ─────────────────────────────────────
//
// Escanear y Editar. Busca un producto por su código de barras (sin modificar
// el stock) para abrir el modal de edición en el frontend.
//
// Respuesta:
//   200 { success, found:true,  data: { id, ...campos, collectionSlug } }
//   404 { success:false, found:false, message }

async function findByBarcode(req, res) {
  try {
    const code = cleanBarcode(req.query.code);
    if (!code) {
      return res.status(400).json({ success: false, message: 'Código de barras inválido o vacío.' });
    }

    const item = await Item.findOne({ tenantId: req.tenant.id, 'data.barcode': code });
    if (!item) {
      return res.status(404).json({
        success: false,
        found:   false,
        message: 'No se encontró ningún producto con ese código de barras.',
      });
    }

    res.json({
      success: true,
      found:   true,
      data:    { ...formatItem(item), collectionSlug: item.collectionSlug },
    });

  } catch (err) {
    console.error('[findByBarcode]', err);
    res.status(500).json({ success: false, message: 'Error al buscar el producto.' });
  }
}

// ─── POST /api/products/bulk-import ───────────────────────────────────────────
//
// Importación masiva. Recibe un lote de productos ya normalizados desde el
// frontend y los inserta en una sola operación (insertMany). Crea
// automáticamente las categorías (colecciones) que no existan.
//
// Body: { products: [ { nombre, categoria, precioVenta, precioCosto, stock, descripcion }, … ] }
//
// Respuesta:
//   { success, imported, categoriesCreated, skipped, message }

async function bulkImport(req, res) {
  try {
    const products = Array.isArray(req.body.products) ? req.body.products : null;
    if (!products || products.length === 0) {
      return res.status(400).json({ success: false, message: 'No se recibió ningún producto para importar.' });
    }
    if (products.length > 2000) {
      return res.status(400).json({ success: false, message: 'Máximo 2000 productos por importación.' });
    }

    // ── Validez mínima: descartar filas sin nombre ──────────────────────────
    const valid   = products.filter(p => String(p && p.nombre || '').trim() !== '');
    const skipped = products.length - valid.length;
    if (valid.length === 0) {
      return res.status(400).json({ success: false, message: 'Ninguna fila tiene un nombre válido.' });
    }

    // ── Plan limit (cuenta actual + lote ≤ límite) ──────────────────────────
    const user    = await User.findById(req.tenant.id).select('plan').lean();
    const plan    = (user && user.plan) || 'basic';
    const limit   = PLAN_LIMITS[plan] ?? PLAN_LIMITS.basic;
    const current = await Item.countDocuments({ tenantId: req.tenant.id });
    if (current + valid.length > limit) {
      return res.status(403).json({
        success: false,
        code:    'PLAN_LIMIT_REACHED',
        plan, limit, current,
        message: `Límite de plan alcanzado: tu plan "${plan}" permite hasta ${limit} productos. ` +
                 `Tienes ${current} y el archivo añadiría ${valid.length}.`,
      });
    }

    // ── Precargar colecciones existentes del tenant ─────────────────────────
    const existing = await Collection.find({ tenantId: req.tenant.id });
    const bySlug = {};   // slug → doc
    const byName = {};   // nombre(lower) → doc
    existing.forEach(c => {
      bySlug[c.slug] = c;
      byName[c.name.toLowerCase().trim()] = c;
    });

    // ── Resolver / auto-crear categorías del lote ───────────────────────────
    let categoriesCreated = 0;
    const distinctCats = [...new Set(
      valid.map(p => (String(p.categoria || '').trim() || 'Importados'))
    )];

    for (const catName of distinctCats) {
      const lower = catName.toLowerCase().trim();
      if (byName[lower]) continue;   // ya existe

      // Generar slug único (entre existentes + recién creados)
      let base = toSlug(catName) || 'categoria';
      let slug = base, n = 2;
      while (bySlug[slug]) { slug = base + '-' + n; n++; }

      const created = await Collection.create({
        tenantId: req.tenant.id,
        name:     stripHtml(catName),
        slug,
        fields:   DEFAULT_IMPORT_FIELDS,
      });
      bySlug[created.slug]               = created;
      byName[lower]                      = created;
      categoriesCreated++;
    }

    // ── Construir documentos de items con saneamiento defensivo ─────────────
    const docs = valid.map(p => {
      const catName = (String(p.categoria || '').trim() || 'Importados');
      const col     = byName[catName.toLowerCase().trim()];
      const prod = {
        nombre:      stripHtml(String(p.nombre || '')).slice(0, 200),
        precioVenta: cleanNum(p.precioVenta),
        precioCosto: cleanNum(p.precioCosto),
        stock:       cleanNum(p.stock),
        descripcion: stripHtml(String(p.descripcion || '')).slice(0, 2000),
      };
      return {
        tenantId:       req.tenant.id,
        collectionSlug: col.slug,
        data:           buildItemData(col.fields, prod),
      };
    });

    // ── Inserción masiva en una sola operación ──────────────────────────────
    const inserted = await Item.insertMany(docs, { ordered: false });

    logActivity(req.tenant, ACTIONS.CREATE_ITEM,
      `Importación masiva: ${inserted.length} producto(s) y ${categoriesCreated} categoría(s) nueva(s).`);

    res.status(201).json({
      success:           true,
      imported:          inserted.length,
      categoriesCreated,
      skipped,
      message: `Se importaron ${inserted.length} productos y se crearon ${categoriesCreated} categorías nuevas.`,
    });

  } catch (err) {
    console.error('[bulkImport]', err);
    res.status(500).json({ success: false, message: 'Error durante la importación masiva.' });
  }
}

module.exports = { listItems, getItem, createItem, updateItem, deleteItem, sellItem, bulkImport, quickScan, findByBarcode };
