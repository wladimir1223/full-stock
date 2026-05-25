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
const router     = express.Router();

const authCtrl   = require('../controllers/authController');
const colCtrl    = require('../controllers/collectionsController');
const contCtrl   = require('../controllers/contentController');  // listItems, getItem, createItem, updateItem, deleteItem, sellItem
const userDb     = require('../db/userDb');
const Collection = require('../models/Collection');
const Item       = require('../models/Item');
const upload     = require('../middleware/upload');
const cloudinary = require('../config/cloudinary');
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
    const PLAN_LIMITS = { basic: 35, pro: 100, full: 200 };

    const user    = await User.findById(req.tenant.id).select('plan').lean();
    const plan    = (user && user.plan) || 'basic';
    const limit   = PLAN_LIMITS[plan] ?? 35;
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

// ════════════════════════════════════════════════════════════════
// ADMIN — Upload de imágenes (protegido)
// ════════════════════════════════════════════════════════════════

router.post('/admin/upload', requireAuth, function (req, res) {
  upload.single('image')(req, res, async function (err) {
    if (err)       return res.status(400).json({ success: false, message: err.message });
    if (!req.file) return res.status(400).json({ success: false, message: 'No se recibió ningún archivo.' });

    try {
      // Subir el buffer en memoria directamente a Cloudinary vía upload_stream
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder:        'full-stock',
            resource_type: 'image',
            // Nombre público basado en timestamp para evitar colisiones
            public_id: `img-${Date.now()}`,
          },
          (error, result) => {
            if (error) reject(error);
            else       resolve(result);
          }
        );
        stream.end(req.file.buffer);
      });

      res.json({
        success:   true,
        url:       result.secure_url,   // URL HTTPS de Cloudinary
        public_id: result.public_id,
        size:      result.bytes,
      });

    } catch (uploadErr) {
      console.error('[upload:cloudinary]', uploadErr);
      res.status(500).json({ success: false, message: 'Error al subir la imagen a Cloudinary.' });
    }
  });
});

module.exports = router;
