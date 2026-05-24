/**
 * User.js — Modelo Mongoose para Tenants / Usuarios.
 *
 * Cada usuario ES un tenant (relación 1:1).
 * El _id de MongoDB (ObjectId) actúa como tenantId en JWT y en
 * las colecciones relacionadas.
 *
 * Campos:
 *   slug         → identificador URL-safe único  (ej: "cafe-lumiere")
 *   name         → nombre del negocio / cuenta
 *   email        → correo en minúsculas, único
 *   passwordHash → "salt:hash" generado con scrypt (Node.js nativo)
 */

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    slug:         { type: String, required: true, unique: true, trim: true },
    name:         { type: String, required: true, trim: true },
    email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  {
    timestamps: true,          // createdAt + updatedAt automáticos
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual "id" → _id.toString()  (compatibilidad con el resto del código)
userSchema.virtual('id').get(function () {
  return this._id.toString();
});

module.exports = mongoose.model('User', userSchema);
