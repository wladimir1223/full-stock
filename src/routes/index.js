/**
 * routes/index.js — Rutas de Full Stock SaaS.
 *
 * ══════════════════════════════════════════════════════════════
 *  RUTAS PÚBLICAS (sin token)
 * ══════════════════════════════════════════════════════════════
 *  POST /auth/register
 *  POST /auth/login
 *  POST /auth/recover
 *
 *  GET  /api/v1/:tenant_slug/collections
 *  GET  /api/v1/:tenant_slug/collections/:collection_slug
 *
 * ══════════════════════════════════════════════════════════════
 *  RUTAS PROTEGIDAS (requieren Bearer JWT)
 * ══════════════════════════════════════════════════════════════
 *  GET    /admin/collections
 *  GET    /admin/collections/:slug
 *  POST   /admin/collections
 *  DELETE /admin/collections/:slug
 *
 *  GET    /admin/collections/:slug/items
 *  GET    /admin/collections/:slug/items/:id
 *  POST   /admin/collections/:slug/items
 *  PUT    /admin/collections/:slug/items/:id
 *  DELETE /admin/collections/:slug/items/:id
 *
 *  POST   /admin/upload
 */

const express    = require('express');
const cors       = require('cors');
const router     = express.Router();

// CORS abierto para el endpoint público de la API de integración.
// Permite que cualquier dominio externo (tiendaderoberto.cl, etc.) consuma el catálogo.
const openCors = cors({ origin: '*', methods: ['GET', 'OPTIONS'] });

const authCtrl   = require('../controllers/authController');
const colCtrl    = require('../controllers/collectionsController');
const contCtrl   = require('../controllers/contentController');  // listItems, getItem, createItem, updateItem, deleteItem, sellItem
const userDb     = require('../db/userDb');
const Collection = require('../models/Collection');
const Item       = require('../models/Item');
const upload     = require('../middleware/upload');
const cloudinary = require('../config/cloudinary');
const sharp      = require('sharp');
const { requireAuth }                        = require('../middleware/auth');
const { requireSuperAdmin }                  = require('../middleware/requireSuperAdmin');
const { authLimiter, checkoutLimiter }       = require('../middleware/security');
const storeCtrl                              = require('../controllers/storeController');
const { ActivityLog, logActivity }           = require('../models/ActivityLog');

// ════════════════════════════════════════════════════════════════
// AUTH — Registro, Login y Recuperación
// ════════════════════════════════════════════════════════════════

// authLimiter: máx. 10 intentos fallidos por IP cada 15 minutos
router.post('/auth/register', authLimiter, authCtrl.register);
router.post('/auth/login',    authLimiter, authCtrl.login);
router.post('/auth/recover',  authCtrl.recover);   // sin límite estricto (siempre responde success)

// Recuperación de contraseña — flujo de token temporal (1h) + email
router.post('/api/auth/forgot-password', authCtrl.forgotPassword); // genera token y envía correo
router.post('/api/auth/reset-password',  authCtrl.resetPassword);  // valida token y actualiza contraseña

// ════════════════════════════════════════════════════════════════
// API PÚBLICA — Consumo externo por tenant_slug
// Estas rutas alimentan los cliente-web.html de cada negocio.
// ════════════════════════════════════════════════════════════════

// GET /api/v1/:tenant_slug/collections
router.get('/api/v1/:tenant_slug/collections', async function (req, res) {
  try {
    const tenant = await userDb.findBySlug(req.params.tenant_slug);
    if (!tenant) return res.status(404).json({ success: false, message: 'Tenant no encontrado.' });

    const cols = await Collection.find({ tenantId: tenant.id }).sort({ createdAt: 1 });
    const list = cols.map(c => ({
      name:     c.name,
      slug:     c.slug,
      endpoint: `/api/v1/${tenant.slug}/collections/${c.slug}`,
      fields:   c.fields,
    }));

    res.json({ success: true, tenant: tenant.slug, data: list });

  } catch (err) {
    console.error('[public:listCollections]', err);
    res.status(500).json({ success: false, message: 'Error de servidor.' });
  }
});

// GET /api/v1/:tenant_slug/collections/:collection_slug
router.get('/api/v1/:tenant_slug/collections/:collection_slug', async function (req, res) {
  try {
    const tenant = await userDb.findBySlug(req.params.tenant_slug);
    if (!tenant) return res.status(404).json({ success: false, message: 'Tenant no encontrado.' });

    const col = await Collection.findOne({
      tenantId: tenant.id,
      slug:     req.params.collection_slug,
    });
    if (!col) return res.status(404).json({ success: false, message: 'Colección no encontrada.' });

    const items = await Item.find({
      tenantId:       tenant.id,
      collectionSlug: col.slug,
    }).sort({ createdAt: 1 });

    const data = items.map(item => ({
      id:        item._id.toString(),
      ...item.data,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));

    res.json({
      success:    true,
      tenant:     tenant.slug,
      collection: { name: col.name, slug: col.slug },
      total:      data.length,
      data,
    });

  } catch (err) {
    console.error('[public:getCollection]', err);
    res.status(500).json({ success: false, message: 'Error de servidor.' });
  }
});

// ════════════════════════════════════════════════════════════════
// API PÚBLICA DE INTEGRACIÓN — CORS abierto (sin JWT)
// Permite que dominios externos consuman el catálogo de un tenant.
// ════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/public/tenants/:slug/products
 *
 * Devuelve el catálogo completo de una tienda con stock disponible.
 * Diseñado para ser consumido por webs externas del cliente
 * (ej: tiendaderoberto.cl) sin restricciones de origen (CORS *).
 *
 * Respuesta:
 *   { success, storeName, slug, whatsapp, totalProducts, products[] }
 *   products[i]: { id, collectionName, collectionSlug, stock, ...campos }
 */
router.options('/api/v1/public/tenants/:slug/products', openCors);   // preflight
router.get('/api/v1/public/tenants/:slug/products', openCors, async (req, res) => {
  try {
    const User = require('../models/User');
    const tenant = await userDb.findBySlug(req.params.slug);

    if (!tenant) {
      return res.status(404).json({
        success: false,
        code:    'TENANT_NOT_FOUND',
        message: 'Tienda no encontrada. Verifica el slug.',
      });
    }

    // Obtener todas las colecciones del tenant
    const cols = await Collection.find({ tenantId: tenant.id }).sort({ createdAt: 1 }).lean();

    // Obtener todos los items con stock > 0
    const items = await Item.find({
      tenantId: tenant.id,
      // No filtramos por stock aquí — devolvemos todos e incluimos stock en la respuesta
    }).sort({ createdAt: 1 }).lean();

    // Construir mapa colección → nombre
    const colMap = Object.fromEntries(cols.map(c => [c.slug, c.name]));

    const products = items.map(item => {
      const stock = Number(item.data?.stock ?? item.data?.Stock ?? 0);
      return {
        id:             item._id.toString(),
        collectionName: colMap[item.collectionSlug] || item.collectionSlug,
        collectionSlug: item.collectionSlug,
        stock,
        ...item.data,   // todos los campos dinámicos del producto
        createdAt:      item.createdAt,
        updatedAt:      item.updatedAt,
      };
    });

    // Leer datos actualizados del tenant para nombre y whatsapp
    const fullUser = await User.findById(tenant.id).select('name whatsapp').lean();

    res.json({
      success:       true,
      storeName:     fullUser?.name    || tenant.name || tenant.slug,
      slug:          tenant.slug,
      whatsapp:      fullUser?.whatsapp || '',
      totalProducts: products.length,
      products,
    });

  } catch (err) {
    console.error('[publicApi:products]', err);
    res.status(500).json({ success: false, message: 'Error de servidor.' });
  }
});

// ════════════════════════════════════════════════════════════════
// SUPERADMIN — Monitoreo global (requiere role=superadmin)
// ════════════════════════════════════════════════════════════════

// GET /api/v1/superadmin/logs?limit=100&tenant=slug
//   Devuelve los últimos N logs de actividad.
//   Query params opcionales:
//     limit  → máx. de resultados (default 100, máx. 500)
//     tenant → filtrar por slug de tenant
router.get('/api/v1/superadmin/logs', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const limit     = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const filter    = {};
    if (req.query.tenant) filter.tenantSlug = req.query.tenant;

    const logs = await ActivityLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({ success: true, total: logs.length, data: logs });
  } catch (err) {
    console.error('[superadmin:logs]', err);
    res.status(500).json({ success: false, message: 'Error al obtener los logs.' });
  }
});

// GET /api/v1/superadmin/tenants
//   Resumen de todos los tenants con conteo de actividad.
router.get('/api/v1/superadmin/tenants', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const User = require('../models/User');
    const tenants = await User.find({}, 'name slug email role plan createdAt').sort({ createdAt: -1 }).lean();

    // Conteo de logs por tenant
    const counts = await ActivityLog.aggregate([
      { $group: { _id: '$tenantId', total: { $sum: 1 }, last: { $max: '$createdAt' } } },
    ]);
    const countMap = Object.fromEntries(counts.map(c => [c._id, { total: c.total, last: c.last }]));

    const data = tenants.map(t => ({
      id:          t._id.toString(),
      name:        t.name,
      slug:        t.slug,
      email:       t.email,
      role:        t.role,
      plan:        t.plan || 'basic',
      createdAt:   t.createdAt,
      activityCount: countMap[t._id.toString()]?.total || 0,
      lastActivity:  countMap[t._id.toString()]?.last  || null,
    }));

    res.json({ success: true, total: data.length, data });
  } catch (err) {
    console.error('[superadmin:tenants]', err);
    res.status(500).json({ success: false, message: 'Error al obtener tenants.' });
  }
});

// PUT /api/v1/superadmin/tenants/:id/plan
//   SuperAdmin cambia el plan de un tenant (basic | pro | full).
router.put('/api/v1/superadmin/tenants/:id/plan', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const User = require('../models/User');
    const VALID_PLANS = ['basic', 'pro', 'full'];
    const { plan } = req.body;

    if (!VALID_PLANS.includes(plan)) {
      return res.status(400).json({ success: false, message: `Plan inválido. Valores válidos: ${VALID_PLANS.join(', ')}.` });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { plan } },
      { new: true }
    );
    if (!user) return res.status(404).json({ success: false, message: 'Tenant no encontrado.' });

    logActivity(req.tenant, 'update_plan',
      `SuperAdmin cambió plan de @${user.slug} → "${plan}"`);

    res.json({ success: true, data: { id: user._id.toString(), slug: user.slug, name: user.name, plan: user.plan } });
  } catch (err) {
    console.error('[superadmin:updatePlan]', err);
    res.status(500).json({ success: false, message: 'Error al actualizar el plan.' });
  }
});

// ════════════════════════════════════════════════════════════════
// STORE — API pública de tienda (sin JWT)
// ════════════════════════════════════════════════════════════════

// GET /api/v1/store/:tenantSlug/products
//   Catálogo completo agrupado por colección, con stock actual.
router.get('/api/v1/store/:tenantSlug/products', storeCtrl.catalog);

// POST /api/v1/store/:tenantSlug/checkout
//   Procesa una compra: valida stock total → descuenta atómicamente.
//   Protegido con checkoutLimiter: máx. 5 compras por IP cada 10 minutos.
router.post('/api/v1/store/:tenantSlug/checkout', checkoutLimiter, storeCtrl.checkout);

// ════════════════════════════════════════════════════════════════
// ADMIN — Configuración del tenant (protegido)
// ════════════════════════════════════════════════════════════════

// GET /admin/settings — devuelve nombre, email, slug, whatsapp del tenant
router.get('/admin/settings', requireAuth, async (req, res) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.tenant.id).lean();
    if (!user) return res.status(404).json({ success: false, message: 'Cuenta no encontrada.' });
    res.json({
      success: true,
      data: {
        name:     user.name,
        email:    user.email,
        slug:     user.slug,
        whatsapp: user.whatsapp || '',
      },
    });
  } catch (err) {
    console.error('[settings:get]', err);
    res.status(500).json({ success: false, message: 'Error al obtener la configuración.' });
  }
});

// PUT /admin/settings — actualiza whatsapp (y opcionalmente nombre)
router.put('/admin/settings', requireAuth, async (req, res) => {
  try {
    const User = require('../models/User');
    const { whatsapp, name } = req.body;
    const update = {};

    if (whatsapp !== undefined) {
      // Solo dígitos — formato internacional sin '+' (ej: "56912345678")
      update.whatsapp = String(whatsapp).replace(/\D/g, '').slice(0, 20);
    }
    if (name && typeof name === 'string' && name.trim()) {
      update.name = name.trim();
    }

    const user = await User.findByIdAndUpdate(
      req.tenant.id,
      { $set: update },
      { new: true }
    );
    if (!user) return res.status(404).json({ success: false, message: 'Cuenta no encontrada.' });

    logActivity(
      req.tenant, 'update_settings',
      `Actualizó configuración: ${Object.keys(update).join(', ')}`
    );

    res.json({
      success: true,
      data: { name: user.name, email: user.email, slug: user.slug, whatsapp: user.whatsapp || '' },
    });
  } catch (err) {
    console.error('[settings:put]', err);
    res.status(500).json({ success: false, message: 'Error al guardar la configuración.' });
  }
});

// GET /admin/plan-usage
//   Devuelve el plan actual del tenant y cuántos productos tiene vs. el límite.
router.get('/admin/plan-usage', requireAuth, async (req, res) => {
  try {
    const User = require('../models/User');
    const PLAN_LIMITS = { basic: 100, pro: 500, full: 1000 };

    const user    = await User.findById(req.tenant.id).select('plan').lean();
    const plan    = (user && user.plan) || 'basic';
    const limit   = PLAN_LIMITS[plan] ?? 100;
    const current = await Item.countDocuments({ tenantId: req.tenant.id });

    res.json({ success: true, data: { plan, limit, current } });
  } catch (err) {
    console.error('[planUsage:get]', err);
    res.status(500).json({ success: false, message: 'Error al obtener uso del plan.' });
  }
});

// ════════════════════════════════════════════════════════════════
// ADMIN — Colecciones (protegido)
// ════════════════════════════════════════════════════════════════

router.get('/admin/collections',          requireAuth, colCtrl.listCollections);
router.get('/admin/collections/:slug',    requireAuth, colCtrl.getCollection);
router.post('/admin/collections',         requireAuth, colCtrl.createCollection);
router.delete('/admin/collections/:slug', requireAuth, colCtrl.deleteCollection);

// PATCH /admin/collections/:slug — renombrar colección (solo el name, slug no cambia)
router.patch('/admin/collections/:slug', requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || !name.trim())
      return res.status(400).json({ success: false, message: 'El nombre es obligatorio.' });

    const col = await Collection.findOneAndUpdate(
      { tenantId: req.tenant.id, slug: req.params.slug },
      { $set: { name: name.trim() } },
      { new: true }
    );
    if (!col) return res.status(404).json({ success: false, message: 'Colección no encontrada.' });

    logActivity(req.tenant, 'UPDATE_COLLECTION',
      `Renombró la colección "${req.params.slug}" → "${col.name}"`);

    res.json({
      success: true,
      data: {
        id:        col._id.toString(),
        name:      col.name,
        slug:      col.slug,
        fields:    col.fields,
        createdAt: col.createdAt,
        updatedAt: col.updatedAt,
      },
    });
  } catch (err) {
    console.error('[updateCollection]', err);
    res.status(500).json({ success: false, message: 'Error al actualizar la colección.' });
  }
});

// ════════════════════════════════════════════════════════════════
// ADMIN — Items de contenido (protegido)
// ════════════════════════════════════════════════════════════════

router.get('/admin/collections/:slug/items',               requireAuth, contCtrl.listItems);
router.get('/admin/collections/:slug/items/:id',           requireAuth, contCtrl.getItem);
router.post('/admin/collections/:slug/items',              requireAuth, contCtrl.createItem);
router.put('/admin/collections/:slug/items/:id',           requireAuth, contCtrl.updateItem);
router.delete('/admin/collections/:slug/items/:id',        requireAuth, contCtrl.deleteItem);
// POST /admin/collections/:slug/items/:id/sell — registra venta y descuenta stock
router.post('/admin/collections/:slug/items/:id/sell',     requireAuth, contCtrl.sellItem);

// POST /api/products/bulk-import — importación masiva (auto-crea categorías)
router.post('/api/products/bulk-import',                   requireAuth, contCtrl.bulkImport);

// ════════════════════════════════════════════════════════════════
// ADMIN — Upload de imágenes (protegido)
// ════════════════════════════════════════════════════════════════

router.post('/admin/upload', requireAuth, function (req, res) {
  upload.single('image')(req, res, async function (err) {
    if (err)       return res.status(400).json({ success: false, message: err.message });
    if (!req.file) return res.status(400).json({ success: false, message: 'No se recibió ningún archivo.' });

    try {
      // ── Conversión a WebP con sharp (calidad 80, sin metadatos EXIF) ───────
      // Acepta JPG, PNG, WebP o GIF (primer fotograma) y los normaliza a WebP.
      // Reduce el tamaño promedio un 25-40 % respecto a JPEG equivalente.
      const webpBuffer = await sharp(req.file.buffer)
        .webp({ quality: 80 })
        .withMetadata(false)    // elimina EXIF / datos de ubicación
        .toBuffer();

      // ── Subir el buffer WebP a Cloudinary vía upload_stream ───────────────
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder:        'full-stock',
            resource_type: 'image',
            format:        'webp',             // fuerza salida WebP en Cloudinary
            public_id:     `img-${Date.now()}`,
          },
          (error, result) => {
            if (error) reject(error);
            else       resolve(result);
          }
        );
        stream.end(webpBuffer);
      });

      res.json({
        success:   true,
        url:       result.secure_url,   // URL HTTPS de Cloudinary (.webp)
        public_id: result.public_id,
        size:      result.bytes,        // tamaño ya en WebP
        format:    'webp',
      });

    } catch (uploadErr) {
      console.error('[upload:cloudinary]', uploadErr);
      res.status(500).json({ success: false, message: 'Error al subir la imagen a Cloudinary.' });
    }
  });
});

// ════════════════════════════════════════════════════════════════
// ADMIN — Analíticas de ventas (protegido)
// ════════════════════════════════════════════════════════════════

/**
 * GET /admin/analytics?days=30
 *
 * Devuelve métricas de ventas del tenant autenticado para los últimos N días.
 * Fuente: ActivityLog (acciones SELL_ITEM y CHECKOUT).
 * Los ingresos se calculan con los precios actuales de los ítems.
 *
 * Respuesta:
 *   { success, data: { period, totalTransactions, totalRevenue, avgTicket,
 *                      byChannel, byDay[], topProducts[] } }
 */
router.get('/admin/analytics', requireAuth, async (req, res) => {
  try {
    const days  = Math.min(parseInt(req.query.days, 10) || 30, 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // ── 1. Logs del tenant en el período ─────────────────────────────────────
    const logs = await ActivityLog.find({
      tenantId:  req.tenant.id,
      action:    { $in: ['SELL_ITEM', 'CHECKOUT'] },
      createdAt: { $gte: since },
    }).sort({ createdAt: 1 }).lean();

    // ── 2. Ítems del tenant para lookup de precios ────────────────────────────
    const allItems = await Item.find({ tenantId: req.tenant.id })
      .select('_id data collectionSlug')
      .lean();

    const itemById = Object.fromEntries(allItems.map(i => [i._id.toString(), i]));

    // ── 3. Extrae precio del data dinámico del ítem ───────────────────────────
    const PRICE_KEYS = [
      'precio', 'price', 'costo', 'valor', 'monto', 'tarifa', 'importe',
      'Precio', 'Price', 'Costo', 'Valor', 'Monto',
    ];
    const SKIP_KEYS = new Set(['stock', 'cantidad', 'quantity', 'id',
                               'Stock', 'Cantidad', 'Quantity']);

    function extractPrice(data) {
      if (!data) return 0;
      for (const key of PRICE_KEYS) {
        const v = data[key];
        if (v !== undefined && !isNaN(Number(v)) && Number(v) > 0) return Number(v);
      }
      // Último recurso: primer campo numérico positivo que no sea stock
      for (const [k, v] of Object.entries(data)) {
        if (!SKIP_KEYS.has(k) && !isNaN(Number(v)) && Number(v) > 0) return Number(v);
      }
      return 0;
    }

    // ── Extrae precio de costo (precioCosto guardado como passthrough) ────────
    function extractCost(data) {
      if (!data) return 0;
      const c = data.precioCosto;
      if (c !== undefined && !isNaN(Number(c)) && Number(c) >= 0) return Number(c);
      return 0;
    }

    // ── 4. Busca ítem por nombre (para CHECKOUT) ──────────────────────────────
    function findItemByName(name) {
      const lc = name.toLowerCase();
      return allItems.find(it => {
        const n = it.data?.nombre || it.data?.name || it.data?.Nombre || it.data?.Name || '';
        return String(n).toLowerCase() === lc;
      }) || null;
    }

    // ── 5. Procesa logs ───────────────────────────────────────────────────────
    const byDayMap = {};
    const topMap   = {};
    let totalTransactions = 0;
    let totalRevenue      = 0;
    let totalCost         = 0;
    const byChannel = {
      web:    { count: 0, revenue: 0 },
      direct: { count: 0, revenue: 0 },
    };

    for (const log of logs) {
      const dateStr = log.createdAt.toISOString().slice(0, 10);
      if (!byDayMap[dateStr]) byDayMap[dateStr] = { date: dateStr, count: 0, revenue: 0, cost: 0 };

      if (log.action === 'SELL_ITEM') {
        // details: "Vendió N unidad(es) de "NAME" en "slug". Stock restante: M"
        const qMatch    = /Vendió (\d+) unidad/.exec(log.details || '');
        const nameMatch = /de "([^"]+)"/.exec(log.details || '');
        const qty  = qMatch ? parseInt(qMatch[1], 10) : 1;
        const name = nameMatch ? nameMatch[1] : 'Producto';

        const item  = log.entityId ? itemById[log.entityId] : null;
        const price = item ? extractPrice(item.data) : 0;
        const cost  = item ? extractCost(item.data) * qty : 0;
        const rev   = price * qty;

        totalTransactions             += 1;
        totalRevenue                  += rev;
        totalCost                     += cost;
        byDayMap[dateStr].count       += 1;
        byDayMap[dateStr].revenue     += rev;
        byDayMap[dateStr].cost        += cost;
        byChannel.direct.count        += 1;
        byChannel.direct.revenue      += rev;

        if (!topMap[name]) topMap[name] = { name, quantity: 0, revenue: 0 };
        topMap[name].quantity += qty;
        topMap[name].revenue  += rev;

      } else if (log.action === 'CHECKOUT') {
        // details: "Compra pública: ProductName x2, AnotherProduct x1"
        const body  = (log.details || '').replace(/^Compra pública:\s*/i, '');
        const parts = body.split(',').map(s => s.trim()).filter(Boolean);
        let orderRev  = 0;
        let orderCost = 0;

        for (const part of parts) {
          const m = /^(.+?)\s+x(\d+)$/.exec(part);
          if (!m) continue;
          const pName = m[1].trim();
          const qty   = parseInt(m[2], 10);
          const item  = findItemByName(pName);
          const price = item ? extractPrice(item.data) : 0;
          const cost  = item ? extractCost(item.data) * qty : 0;
          const rev   = price * qty;

          orderRev  += rev;
          orderCost += cost;
          if (!topMap[pName]) topMap[pName] = { name: pName, quantity: 0, revenue: 0 };
          topMap[pName].quantity += qty;
          topMap[pName].revenue  += rev;
        }

        totalTransactions           += 1;
        totalRevenue                += orderRev;
        totalCost                   += orderCost;
        byDayMap[dateStr].count     += 1;
        byDayMap[dateStr].revenue   += orderRev;
        byDayMap[dateStr].cost      += orderCost;
        byChannel.web.count         += 1;
        byChannel.web.revenue       += orderRev;
      }
    }

    // ── 6. Ordenar y proyectar ────────────────────────────────────────────────
    const byDay = Object.values(byDayMap).sort((a, b) => a.date.localeCompare(b.date));

    const topProducts = Object.values(topMap)
      .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
      .slice(0, 5)
      .map(p => ({ ...p, revenue: Math.round(p.revenue * 100) / 100 }));

    const avgTicket  = totalTransactions > 0
      ? Math.round(totalRevenue / totalTransactions * 100) / 100
      : 0;
    const netProfit  = Math.round((totalRevenue - totalCost) * 100) / 100;

    res.json({
      success: true,
      data: {
        period:            `${days}d`,
        totalTransactions,
        totalRevenue:      Math.round(totalRevenue * 100) / 100,
        totalCost:         Math.round(totalCost   * 100) / 100,
        netProfit,
        avgTicket,
        byChannel,
        byDay,
        topProducts,
      },
    });

  } catch (err) {
    console.error('[analytics:get]', err);
    res.status(500).json({ success: false, message: 'Error al obtener analíticas.' });
  }
});

module.exports = router;
