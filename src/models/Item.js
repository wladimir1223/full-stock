/**
 * Item.js — Modelo Mongoose para Productos / Contenido de una colección.
 *
 * Multi-tenant: aislado por (tenantId + collectionSlug).
 *
 * Los datos del producto se guardan en el campo `data` como Mixed
 * porque cada colección puede tener campos completamente distintos.
 * Los controladores aplanan `data` en la respuesta JSON para que
 * el frontend lo reciba con la misma forma de siempre:
 *
 *   { id, nombre, precio, descripcion, imagen, createdAt, updatedAt }
 *
 * en lugar de:
 *
 *   { id, data: { nombre, precio, ... }, createdAt, updatedAt }
 */

const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema(
  {
    tenantId:       { type: String, required: true },
    collectionSlug: { type: String, required: true },
    data:           { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Índice compuesto para filtrar items por tenant + colección eficientemente
itemSchema.index({ tenantId: 1, collectionSlug: 1 });

// Virtual "id" para compatibilidad
itemSchema.virtual('id').get(function () {
  return this._id.toString();
});

module.exports = mongoose.model('Item', itemSchema);
