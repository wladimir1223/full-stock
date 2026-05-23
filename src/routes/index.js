/**
 * routes/index.js — Rutas de Full Stock SaaS.
 *
 * ══════════════════════════════════════════════════════════════
 *  RUTAS PÚBLICAS (sin token)
 * ══════════════════════════════════════════════════════════════
 *  POST /auth/register
 *  POST /auth/login
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
const contCtrl   = require('../controllers/contentController');
const db         = require('../db/fileDb');
const userDb     = require('../db/userDb');
const upload     = require('../middleware/upload');
const { requireAuth } = require('../middleware/auth');

// ════════════════════════════════════════════════════════════════
// AUTH — Registro y Login
// ════════════════════════════════════════════════════════════════

router.post('/auth/register', authCtrl.register);
router.post('/auth/login',    authCtrl.login);

// ════════════════════════════════════════════════════════════════
// API PÚBLICA — Consumo externo por tenant_slug
// ════════════════════════════════════════════════════════════════

// GET /api/v1/:tenant_slug/collections
router.get('/api/v1/:tenant_slug/collections', function(req, res) {
  const tenant = userDb.findBySlug(req.params.tenant_slug);
  if (!tenant) return res.status(404).json({ success: false, message: 'Tenant no encontrado.' });

  const schemas = db.getSchemas(tenant.id);
  const list    = Object.values(schemas).map(function(s) {
    return {
      name:     s.name,
      slug:     s.slug,
      endpoint: `/api/v1/${tenant.slug}/collections/${s.slug}`,
      fields:   s.fields,
    };
  });
  res.json({ success: true, tenant: tenant.slug, data: list });
});

// GET /api/v1/:tenant_slug/collections/:collection_slug
router.get('/api/v1/:tenant_slug/collections/:collection_slug', function(req, res) {
  const tenant = userDb.findBySlug(req.params.tenant_slug);
  if (!tenant) return res.status(404).json({ success: false, message: 'Tenant no encontrado.' });

  const schema = db.getSchema(tenant.id, req.params.collection_slug);
  if (!schema) return res.status(404).json({ success: false, message: 'Colección no encontrada.' });

  const items = db.getItems(tenant.id, req.params.collection_slug);
  res.json({
    success:    true,
    tenant:     tenant.slug,
    collection: { name: schema.name, slug: schema.slug },
    total:      items.length,
    data:       items,
  });
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

router.get('/admin/collections/:slug/items',        requireAuth, contCtrl.listItems);
router.get('/admin/collections/:slug/items/:id',    requireAuth, contCtrl.getItem);
router.post('/admin/collections/:slug/items',       requireAuth, contCtrl.createItem);
router.put('/admin/collections/:slug/items/:id',    requireAuth, contCtrl.updateItem);
router.delete('/admin/collections/:slug/items/:id', requireAuth, contCtrl.deleteItem);

// ════════════════════════════════════════════════════════════════
// ADMIN — Upload de imágenes (protegido)
// ════════════════════════════════════════════════════════════════

router.post('/admin/upload', requireAuth, function(req, res) {
  upload.single('image')(req, res, function(err) {
    if (err)        return res.status(400).json({ success: false, message: err.message });
    if (!req.file)  return res.status(400).json({ success: false, message: 'No se recibió ningún archivo.' });
    res.json({
      success:  true,
      url:      '/uploads/' + req.file.filename,
      filename: req.file.filename,
      size:     req.file.size,
    });
  });
});

module.exports = router;
