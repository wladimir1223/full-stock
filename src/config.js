/**
 * config.js - Credenciales y configuracion global de Full Stock.
 *
 * En produccion define estas variables de entorno antes de arrancar:
 *   FS_USERNAME=miusuario
 *   FS_PASSWORD=mipassword_seguro
 *   FS_TOKEN_SECRET=cadena_aleatoria_larga
 *
 * En desarrollo los valores por defecto son suficientes para pruebas locales.
 */

module.exports = {
  admin: {
    username: process.env.FS_USERNAME || 'admin',
    password: process.env.FS_PASSWORD || 'fullstock2024',
  },
  token: {
    // Tiempo de vida del token de sesion: 8 horas en ms
    expiresInMs: 8 * 60 * 60 * 1000,
  },
};
