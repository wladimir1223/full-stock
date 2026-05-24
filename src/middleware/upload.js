/**
 * upload.js — Multer con almacenamiento en memoria.
 *
 * Los archivos NO se guardan en disco; el buffer se mantiene en RAM
 * para poder enviarlo directamente a Cloudinary mediante upload_stream.
 *
 * Solo acepta JPEG, PNG, WebP y GIF. Límite: 5 MB por archivo.
 */

const multer = require('multer');

// Tipos MIME permitidos
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function fileFilter(_req, file, cb) {
  if (ALLOWED_MIME.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(
      `Tipo de archivo no permitido: ${file.mimetype}. ` +
      'Solo se aceptan JPEG, PNG, WebP y GIF.'
    ));
  }
}

const upload = multer({
  storage: multer.memoryStorage(),   // buffer en RAM → listo para Cloudinary
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

module.exports = upload;
