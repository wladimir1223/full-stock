/**
 * routes/index.js - Rutas de Full Stock.
 *
 * Rutas PUBLICAS  (sin token):
 *   POST /admin/login
 *   GET  /api/v1/collections
 *   GET  /api/v1/collections/:slug
 *
 * Rutas PROTEGIDAS (requieren Bearer token):
 *   POST   /admin/logout
 *   GET    /admin/collections
 *   POST   /admin/collections
 *   DELETE /admin/collections/:slug
 *   GET    /admin/collections/:slug
 *   GET    /admin/collections/:slug/items
 *   POST   /admin/collections/:slug/items
 *   PUT    /admin/collections/:slug/items/:id
 *   DELETE /admin/collections/:slug/items/:id
 *   POST   /admin/upload
 */

const express    = require('express');
const router     = express.Router();

const colCtrl    = require('../controllers/collectionsController');
const contCtrl   = require('../controllers/contentController');
const db         = require('../db/fileDb');
const upload     = require('../middleware/upload');
const { login, logout, requireAuth } = require('../middleware/auth');

// ============================================================
// RUTAS PUBLICAS
// ============================================================

// Login - sin proteccion
router.post('/admin/login', login);

// API publica - sin proteccion
router.get('/api/v1/collections', function(req, res) {
  var schemas = db.getSchemas();
  var list = Object.values(schemas).map(function(s) {
    return { name: s.name, slug: s.slug, endpoint: '/api/v1/collections/' + s.slug, fields: s.fields };
  });
  res.json({ success: true, data: list });
});

router.get('/api/v1/collections/:slug', function(req, res) {
  var schema = db.getSchema(req.params.slug);
  if (!schema) return res.status(404).json({ success: false, message: 'Coleccion no encontrada.' });
  var items = db.getItems(req.params.slug);
  res.json({ success: true, collection: { name: schema.name, slug: schema.slug }, total: items.length, data: items });
});

// ============================================================
// RUTAS PROTEGIDAS - requireAuth aplicado a cada una
// ============================================================

// Logout
router.post('/admin/logout', requireAuth, logout);

// Colecciones (esquemas)
router.get('/admin/collections',          requireAuth, colCtrl.listCollections);
router.get('/admin/collections/:slug',    requireAuth, colCtrl.getCollection);
router.post('/admin/collections',         requireAuth, colCtrl.createCollection);
router.delete('/admin/collections/:slug', requireAuth, colCtrl.deleteCollection);

// Contenido (items)
router.get('/admin/collections/:slug/items',         requireAuth, contCtrl.listItems);
router.get('/admin/collections/:slug/items/:id',     requireAuth, contCtrl.getItem);
router.post('/admin/collections/:slug/items',        requireAuth, contCtrl.createItem);
router.put('/admin/collections/:slug/items/:id',     requireAuth, contCtrl.updateItem);
router.delete('/admin/collections/:slug/items/:id',  requireAuth, contCtrl.deleteItem);

// Upload de imagenes
router.post('/admin/upload', requireAuth, function(req, res) {
  upload.single('image')(req, res, function(err) {
    if (err) return res.status(400).json({ success: false, message: err.message });
    if (!req.file) return res.status(400).json({ success: false, message: 'No se recibio ningun archivo.' });
    res.json({ success: true, url: '/uploads/' + req.file.filename, filename: req.file.filename, size: req.file.size });
  });
});

module.exports = router;
