/**
 * db.js — Conexión a MongoDB mediante Mongoose.
 *
 * La URI se lee de la variable de entorno MONGODB_URI.
 * En local: configúrala en .env  →  MONGODB_URI=mongodb+srv://...
 * En Render: agrégala como "Environment Variable" en el dashboard.
 */

const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error(
      '❌  MONGODB_URI no está definida.\n' +
      '   • Local: crea un archivo .env con MONGODB_URI=mongodb+srv://...\n' +
      '   • Render: agrégala en Settings → Environment Variables.'
    );
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 8000,   // falla rápido si no hay conexión
  });

  console.log('✅  MongoDB conectado correctamente.');

  mongoose.connection.on('error', err => {
    console.error('❌  Error de MongoDB:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️   MongoDB desconectado. Intentando reconectar…');
  });
}

module.exports = connectDB;
