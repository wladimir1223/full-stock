/**
 * storeController.js — API pública de tienda para consumo externo.
 *
 * No requiere JWT. Diseñada para ser consumida por un frontend e-commerce.
 *
 * GET  /api/v1/store/:tenantSlug/products
 *   → Devuelve todos los productos de todas las colecciones del tenant,
 *     agrupados por colección. Incluye stock actual.
 *
 * POST /api/v1/store/:tenantSlug/checkout
 *   → Procesa una compra:
 *     1. Valida la estructura del carrito
 *     2. Verifica stock de TODOS los productos (si uno falla → rollback total)
 *     3. Descuenta cantidades de forma atómica con $inc + $gte
 *     4. Devuelve resumen de la orden con stock restante
 *
 * Body del checkout:
 *   {
 *     "items": [
 *       { "collectionSlug": "productos", "productId": "64abc...", "quantity": 2 }
 *     ]
 *   }
 */

const mongoose                  = require('mongoose');
const userDb                    = require('../db/userDb');
const Collection                = require('../models/Collection');
const Item                      = require('../models/Item');
const { logActivity, ACTIONS }  = require('../models/ActivityLog');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/** Extrae el nombre del producto desde item.data (prueba claves comunes). */
function guessProductName(data = {}) {
  const nameKeys = ['nombre', 'name', 'titulo', 'title', 'producto', 'descripcion'];
  for (const k of nameKeys) {
    if (data[k] && typeof data[k] === 'string') return data[k];
  }
  // fallback: primer valor string
  for (const v of Object.values(data)) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return 'Producto';
}

/** Aplana un documento Item al mismo formato que usa el panel. */
function formatItem(doc) {
  return {
    id:        doc._id.toString(),
    ...doc.data,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// ─── GET /api/v1/store/:tenantSlug/products ───────────────────────────────────
//
// Devuelve el catálogo completo del tenant, agrupado por colección.
// Cada item incluye su stock actual para que el frontend pueda deshabilitar
// productos sin stock.

async function catalog(req, res) {
  try {
    const tenant = await userDb.findBySlug(req.params.tenantSlug);
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tienda no encontrada.' });
    }

    const collections = await Collection.find({ tenantId: tenant.id }).sort({ createdAt: 1 });

    const data = await Promise.all(
      collections.map(async col => {
        const items = await Item.find({
          tenantId:       tenant.id,
          collectionSlug: col.slug,
        }).sort({ createdAt: 1 });

        return {
          name:   col.name,
          slug:   col.slug,
          fields: col.fields,
          items:  items.map(formatItem),
        };
      })
    );

    res.json({
      success:     true,
      tenant:      tenant.slug,
      collections: data,
      // Conteo rápido útil para debug del frontend
      totalItems:  data.reduce((acc, c) => acc + c.items.length, 0),
    });

  } catch (err) {
    console.error('[store:catalog]', err);
    res.status(500).json({ success: false, message: 'Error de servidor.' });
  }
}

// ─── POST /api/v1/store/:tenantSlug/checkout ─────────────────────────────────
//
// Proceso de compra en dos fases:
//
//  FASE 1 — Validación total (sin escribir nada en DB)
//    · Estructura del carrito
//    · Existencia de cada producto
//    · Stock suficiente para cada ítem
//    → Si CUALQUIER validación falla, se devuelve 400 y no se modifica nada.
//
//  FASE 2 — Descuento atómico
//    · findOneAndUpdate con $inc + condición $gte (safe race-condition)
//    → Si una actualización falla (condición de carrera), se reporta el error.
//      Los ítems ya descontados en esa misma petición quedan descontados;
//      para stock transaccional completo se recomienda MongoDB Atlas M10+.

async function checkout(req, res) {
  try {
    // ── Validación del body ────────────────────────────────────────────────
    const { items } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: '"items" debe ser un array no vacío.',
      });
    }

    if (items.length > 50) {
      return res.status(400).json({
        success: false,
        message: 'El carrito no puede tener más de 50 productos distintos.',
      });
    }

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.collectionSlug || typeof it.collectionSlug !== 'string') {
        return res.status(400).json({ success: false, message: `items[${i}]: falta "collectionSlug".` });
      }
      if (!it.productId || !isValidId(it.productId)) {
        return res.status(400).json({ success: false, message: `items[${i}]: "productId" inválido.` });
      }
      const qty = parseInt(it.quantity, 10);
      if (!Number.isInteger(qty) || qty < 1) {
        return res.status(400).json({ success: false, message: `items[${i}]: "quantity" debe ser un entero ≥ 1.` });
      }
      items[i] = { ...it, quantity: qty }; // normalizar quantity
    }

    // ── Buscar tenant ──────────────────────────────────────────────────────
    const tenant = await userDb.findBySlug(req.params.tenantSlug);
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tienda no encontrada.' });
    }

    // ── FASE 1: Validar existencia y stock de todos los productos ──────────
    const resolved = []; // { cartItem, doc, name, currentStock }

    for (const cartItem of items) {
      const doc = await Item.findOne({
        _id:            cartItem.productId,
        tenantId:       tenant.id,
        collectionSlug: cartItem.collectionSlug,
      });

      if (!doc) {
        return res.status(404).json({
          success: false,
          message: `Producto "${cartItem.productId}" no encontrado en "${cartItem.collectionSlug}".`,
        });
      }

      const currentStock = Number(doc.data?.stock ?? 0);
      const name         = guessProductName(doc.data);

      if (currentStock < cartItem.quantity) {
        return res.status(400).json({
          success: false,
          code:    'INSUFFICIENT_STOCK',
          message: `Stock insuficiente para "${name}". Disponible: ${currentStock}, solicitado: ${cartItem.quantity}.`,
          product: {
            collectionSlug: cartItem.collectionSlug,
            productId:      cartItem.productId,
            name,
            stock:          currentStock,
          },
        });
      }

      resolved.push({ cartItem, doc, name, currentStock });
    }

    // ── FASE 2: Descontar stock atómicamente ──────────────────────────────
    const orderItems = [];

    for (const { cartItem, doc, name } of resolved) {
      const updated = await Item.findOneAndUpdate(
        {
          _id:          doc._id,
          tenantId:     tenant.id,
          'data.stock': { $gte: cartItem.quantity }, // guarda ante condición de carrera
        },
        { $inc: { 'data.stock': -cartItem.quantity } },
        { new: true }
      );

      if (!updated) {
        // Otro proceso consumió el stock entre la fase 1 y la fase 2
        return res.status(400).json({
          success: false,
          code:    'RACE_CONDITION',
          message: `Stock de "${name}" cambió durante el proceso. Reintenta la compra.`,
          product: { collectionSlug: cartItem.collectionSlug, productId: cartItem.productId, name },
        });
      }

      orderItems.push({
        collectionSlug: cartItem.collectionSlug,
        productId:      cartItem.productId,
        name,
        quantity:       cartItem.quantity,
        stockRestante:  Number(updated.data.stock),
      });
    }

    // ── Log del checkout ──────────────────────────────────────────────────
    const summary = orderItems.map(i => `${i.name} x${i.quantity}`).join(', ');
    logActivity(
      { id: tenant.id, name: tenant.name, slug: tenant.slug },
      ACTIONS.CHECKOUT,
      `Compra pública: ${summary}`
    );

    // ── Respuesta exitosa ──────────────────────────────────────────────────
    res.json({
      success: true,
      message: `Compra procesada. ${orderItems.length} producto${orderItems.length !== 1 ? 's' : ''} descontado${orderItems.length !== 1 ? 's' : ''}.`,
      order: {
        tenant: tenant.slug,
        items:  orderItems,
      },
    });

  } catch (err) {
    console.error('[store:checkout]', err);
    res.status(500).json({ success: false, message: 'Error de servidor.' });
  }
}

module.exports = { catalog, checkout };
