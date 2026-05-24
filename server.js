/**
 * server.js — Punto de entrada de Full Stock.
 *
 * Orden de arranque:
 *   1. Carga variables de entorno (.env en local, Render las inyecta en prod)
 *   2. Conecta a MongoDB
 *   3. Levanta Express
 */

require('dotenv').config();   // no-op si no existe .env (Render lo ignora sin error)

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const connectDB  = require('./src/config/db');
const routes     = require('./src/routes/index');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Archivos estáticos (frontend) ────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── Rutas de la API ──────────────────────────────────────────────────────────
app.use('/', routes);

// ─── Fallback SPA ─────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Arranque (primero MongoDB, luego Express) ────────────────────────────────
async function start() {
  try {
    await connectDB();          // falla aquí si MONGODB_URI no está configurada

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
