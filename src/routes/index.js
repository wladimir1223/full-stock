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
const { requireAuth }              = require('../middleware/auth');
const { authLimiter }              = require('../middleware/security');

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
