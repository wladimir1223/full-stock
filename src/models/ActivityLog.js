/**
 * ActivityLog.js — Registro de actividad por tenant.
 *
 * Campos:
 *   tenantId    → ID del tenant que realizó la acción
 *   tenantName  → Nombre del negocio (desnormalizado para consultas rápidas)
 *   tenantSlug  → Slug del tenant
 *   action      → Código de acción (ver ACTION_* constantes abajo)
 *   details     → Descripción legible de lo que ocurrió
 *   entityId    → ID del documento afectado (producto, colección, etc.)
 *   timestamp   → Fecha/hora del evento
 *
 * logActivity() — helper fire-and-forget para usar desde controladores.
 * Nunca lanza excepciones hacia el llamador; los errores se imprimen en consola.
 */

const mongoose = require('mongoose');

// ─── Acciones posibles ────────────────────────────────────────────────────────

const ACTIONS = {
  // Colecciones
  CREATE_COLLECTION: 'CREATE_COLLECTION',
  DELETE_COLLECTION: 'DELETE_COLLECTION',
  // Productos
  CREATE_ITEM:       'CREATE_ITEM',
  UPDATE_ITEM:       'UPDATE_ITEM',
  DELETE_ITEM:       'DELETE_ITEM',
  // Stock
  SELL_ITEM:         'SELL_ITEM',
  CHECKOUT:          'CHECKOUT',
  // Auth
  USER_REGISTER:     'USER_REGISTER',
  USER_LOGIN:        'USER_LOGIN',
};

// ─── Schema ───────────────────────────────────────────────────────────────────

const activityLogSchema = new mongoose.Schema(
  {
    tenantId:   { type: String, required: true, index: true },
    tenantName: { type: String, default: '' },
    tenantSlug: { type: String, default: '' },
    action:     { type: String, required: true, enum: Object.values(ACTIONS) },
    details:    { type: String, default: '' },
    entityId:   { type: String, default: null },
  },
  {
    // timestamps: false — usamos nuestro propio campo para control explícito
    timestamps: true,   // createdAt actúa como timestamp del evento
  }
);

// Índice compuesto para consultas de monitoreo (más recientes de un tenant)
activityLogSchema.index({ tenantId: 1, createdAt: -1 });

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

// ─── Helper fire-and-forget ───────────────────────────────────────────────────
//
// Uso: logActivity(req.tenant, 'CREATE_ITEM', `Creó producto "${nombre}"`, item.id)
// El segundo argumento puede ser un objeto { id, name, slug } o strings sueltos.

function logActivity(tenant, action, details = '', entityId = null) {
  const entry = {
    tenantId:   tenant.id   || tenant.tenantId   || '',
    tenantName: tenant.name || tenant.tenantName || '',
    tenantSlug: tenant.slug || tenant.tenantSlug || '',
    action,
    details,
    entityId: entityId ? String(entityId) : null,
  };

  // Fire-and-forget: nunca bloquea ni propaga errores al controlador
  ActivityLog.create(entry).catch(err =>
    console.error('[activityLog] Error al guardar log:', err.message)
  );
}

module.exports = { ActivityLog, logActivity, ACTIONS };
