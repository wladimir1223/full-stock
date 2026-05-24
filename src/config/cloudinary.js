/**
 * cloudinary.js — Configuración del SDK de Cloudinary.
 *
 * Requiere las siguientes variables de entorno:
 *   CLOUDINARY_CLOUD_NAME   → ej. draxq9rmv
 *   CLOUDINARY_API_KEY      → ej. 715883444238486
 *   CLOUDINARY_API_SECRET   → cadena secreta del dashboard
 *
 * En local: agrégalas en .env
 * En Render: agrégalas en Settings → Environment Variables.
 */

const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true,   // siempre usa https
});

module.exports = cloudinary;
