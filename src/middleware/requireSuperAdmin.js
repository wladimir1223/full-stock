/**
 * requireSuperAdmin.js — Middleware de control de rol.
 *
 * Debe usarse SIEMPRE después de requireAuth, que ya valida el JWT
 * y pone req.tenant (con req.tenant.role) en la petición.
 *
 * Uso en rutas:
 *   router.get('/superadmin/logs', requireAuth, requireSuperAdmin, handler)
 */

function requireSuperAdmin(req, res, next) {
  if (!req.tenant) {
    // requireAuth no se ejecutó antes — error de configuración de rutas
    return res.status(401).json({
      success: false,
      code:    'UNAUTHORIZED',
      message: 'Autenticación requerida.',
    });
  }

  if (req.tenant.role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      code:    'FORBIDDEN',
      message: 'Acceso denegado. Se requiere rol de super administrador.',
    });
  }

  next();
}

module.exports = { requireSuperAdmin };
