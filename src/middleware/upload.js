/**
 * upload.js — Configuración de Multer para subida de imágenes.
 * Guarda los archivos en public/uploads/ con nombre único basado en timestamp.
 * Solo acepta JPEG, PNG, WebP y GIF. Límite: 5 MB por archivo.
 */

const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const UPLOAD_DIR = path.join(__dirname, '../../public/uploads');

// Garantiza que la carpeta de destino exista
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Tipos MIME permitidos
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),

  filename: (_req, file, cb) => {
    // Sanitizar el nombre original y añadir timestamp para evitar colisiones
    const ext      = path.extname(file.originalname).toLowerCase();
    const base     = path.basename(file.originalname, ext)
                       .replace(/[^a-zA-Z0-9_-]/g, '_')
                       .slice(0, 40);
    const unique   = `${Date.now()}-${base}${ext}`;
    cb(null, unique);
  },
});

function fileFilter(_req, file, cb) {
  if (ALLOWED_MIME.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}. Solo se aceptan JPEG, PNG, WebP y GIF.`));
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

module.exports = upload;
