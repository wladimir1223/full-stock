/**
 * server.js — Punto de entrada de Full Stock.
 *
 * Orden de arranque:
 *   1. Carga variables de entorno (.env en local, Render las inyecta en prod)
 *   2. Conecta a MongoDB
 *   3. Levanta Express con capas de seguridad
 *
 * Seguridad aplicada (de afuera hacia adentro):
 *   · trust proxy    → IP real del cliente detrás de Render/Nginx
 *   · helmet         → cabeceras HTTP de seguridad (CSP, HSTS, X-Frame, etc.)
 *   · cors           → orígenes permitidos via CORS_ORIGIN env var
 *   · mongoSanitize  → previene inyección NoSQL ($gt, $where, etc.)
 *   · apiLimiter     → máx. 200 req/min por IP en rutas de API y admin
 *   · authLimiter    → máx. 10 intentos fallidos/15 min en /auth/login y /auth/register
 */

require('dotenv').config();   // no-op si no existe .env (Render lo ignora sin error)

const express        = require('express');
const cors           = require('cors');
const helmet         = require('helmet');
const mongoSanitize  = require('express-mongo-sanitize');
const path           = require('path');
const connectDB      = require('./src/config/db');
const routes         = require('./src/routes/index');
const { apiLimiter } = require('./src/middleware/security');
const { initMailer } = require('./src/utils/mailer');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Proxy trust (Render usa un load-balancer) ────────────────────────────────
// Necesario para que express-rate-limit lea la IP real del cliente.
app.set('trust proxy', 1);

// ─── Helmet — cabeceras HTTP de seguridad ─────────────────────────────────────
// CSP configurado para Defensa en Profundidad (CVE-1 parcheado):
//
// scriptSrc            → solo 'self' + CDNs explícitos (Tailwind y Chart.js).
//                        'unsafe-inline' ELIMINADO: el config de Tailwind se
//                        sirve como archivo externo (/js/tailwind-config.js).
// scriptSrcAttr 'none' → bloquea onclick="...", onerror="..." etc. en HTML.
//                        Todos los handlers se registran vía addEventListener.
// imgSrc https:        → Cloudinary puede cambiar de subdominio; permitimos
//                        cualquier HTTPS en lugar de anclar el dominio.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", 'https://cdn.tailwindcss.com', 'https://cdn.jsdelivr.net', 'https://unpkg.com'],
      scriptSrcAttr:  ["'none'"],          // sin onclick / onerror / onfocus inline
      styleSrc:       ["'self'", "'unsafe-inline'"],
      imgSrc:         ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc:     ["'self'"],
      fontSrc:        ["'self'", 'https:', 'data:'],
      objectSrc:      ["'none'"],
      frameSrc:       ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  // Desactivar COEP para no bloquear imágenes cross-origin (Cloudinary)
  crossOriginEmbedderPolicy: false,
}));

// ─── CORS ────────────────────────────────────────────────────────────────────
// CORS_ORIGIN=*                         → abierto (dev / fase inicial)
// CORS_ORIGIN=https://tu-dominio.com    → un origen
// CORS_ORIGIN=https://a.com,https://b.com → varios orígenes separados por coma
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
app.use(cors({
  origin: CORS_ORIGIN === '*'
    ? '*'
    : CORS_ORIGIN.split(',').map(s => s.trim()),
  methods:        ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials:    CORS_ORIGIN !== '*',   // solo si hay origen fijo
}));

// ─── Parsers ──────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));           // limitar payload JSON
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ─── Mongo Sanitize — prevenir inyección NoSQL ────────────────────────────────
// Elimina claves que empiecen con $ o contengan . de req.body, req.params y req.query.
// Ejemplo bloqueado: POST /auth/login { "email": { "$gt": "" } }
app.use(mongoSanitize({
  replaceWith: '_',      // reemplaza caracteres peligrosos en lugar de eliminar
  allowDots:   false,
  onSanitizeError: (_req, _res, err) => {
    console.warn('[mongoSanitize] Intento de inyección bloqueado:', err.message);
  },
}));

// ─── Rate limiter global para API y Admin ─────────────────────────────────────
// 200 peticiones por IP por minuto en rutas de datos.
// Las rutas de archivos estáticos quedan fuera.
app.use('/api',   apiLimiter);
app.use('/admin', apiLimiter);
app.use('/auth',  apiLimiter);

// ─── Archivos estáticos (frontend) ────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── Rutas de la API ──────────────────────────────────────────────────────────
app.use('/', routes);

// ─── Tienda pública — Clean URL ───────────────────────────────────────────────
// GET /tienda/:slug → sirve tienda.html.
// El frontend extrae el slug de window.location.pathname; no se expone ?tenant=.
// Esta ruta debe ir ANTES del fallback SPA para que Express no la intercepte.
// Cache-Control: no-cache fuerza al navegador a revalidar con el servidor en cada
// visita, evitando que se sirva una versión obsoleta con handlers inline (CSP error).
app.get('/tienda/:slug', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, 'public', 'tienda.html'));
});

// ─── Fallback SPA ─────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Arranque (primero MongoDB, luego Express) ────────────────────────────────
async function start() {
  try {
    await connectDB();          // falla aquí si MONGODB_URI no está configurada

    initMailer();               // verifica conexión SMTP y lo reporta en consola

    app.listen(PORT, () => {
      console.log(`\n🚀  Full Stock corriendo en http://localhost:${PORT}`);
      console.log(`📦  Panel Admin  → http://localhost:${PORT}`);
      console.log(`🌐  API Pública  → http://localhost:${PORT}/api/v1/<tenant>/collections\n`);
    });

  } catch (err) {
    console.error('\n❌  No se pudo iniciar el servidor:', err.message);
    process.exit(1);   // salir con error para que Render lo detecte y alerte
  }
}

start();
