/**
 * config.js — Configuración global de Full Stock SaaS.
 *
 * Variables de entorno en producción (Render):
 *   JWT_SECRET=<cadena aleatoria larga y segura>
 */

module.exports = {
  jwt: {
    secret:        process.env.JWT_SECRET || 'fullstock-saas-dev-secret-change-in-production-2024',
    expiresInHours: 8,
  },
};
