/**
 * server.js — Punto de entrada de Full Stock.
 * Levanta Express, monta middleware y rutas.
 */

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const routes  = require('./src/routes/index');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());                          // CORS abierto para consumo externo
app.use(express.json());                  // Parsear body JSON
app.use(express.urlencoded({ extended: true }));

// ─── Archivos estáticos (frontend) ────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── Rutas de la API ───────────────────────────────────────────────────────────
app.use('/', routes);

// ─── Fallback: devuelve el frontend para cualquier ruta no-API ─────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Arranque ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  Full Stock corriendo en http://localhost:${PORT}`);
  console.log(`📦  Panel Admin  → http://localhost:${PORT}`);
  console.log(`🌐  API Pública  → http://localhost:${PORT}/api/v1/collections\n`);
});
