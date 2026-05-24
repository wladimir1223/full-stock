/**
 * Collection.js — Modelo Mongoose para Colecciones (schemas de productos).
 *
 * Multi-tenant: cada documento pertenece a un tenant mediante `tenantId`
 * (string del ObjectId del User).
 *
 * Índice compuesto { tenantId, slug } garantiza que dos tenants
 * puedan tener colecciones con el mismo slug sin conflicto.
 *
 * Campos de `fields`:
 *   key   → nombre interno normalizado  (ej: "nombre", "precio")
 *   label → etiqueta visible            (ej: "Nombre", "Precio")
 *   type  → tipo de dato del campo
 */

const mongoose = require('mongoose');

const VALID_TYPES = ['short_text', 'long_text', 'number', 'image_url'];

const fieldSchema = new mongoose.Schema(
  {
    key:   { type: String, required: true },
    label: { type: String, required: true },
    type:  { type: String, required: true, enum: VALID_TYPES },
  },
  { _id: false }   // los campos no necesitan su propio _id
);

const collectionSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    name:     { type: String, required: true, trim: true },
    slug:     { type: String, required: true, trim: true },
    fields:   { type: [fieldSchema], default: [] },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Slug único por tenant (dos tenants distintos pueden tener "productos")
collectionSchema.index({ tenantId: 1, slug: 1 }, { unique: true });

// Virtual "id" para compatibilidad
collectionSchema.virtual('id').get(function () {
  return this._id.toString();
});

module.exports = mongoose.model('Collection', collectionSchema);
