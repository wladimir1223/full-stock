/**
 * mailer.js — Envío de correos transaccionales vía Nodemailer (SMTP).
 *
 * Credenciales por variables de entorno:
 *   EMAIL_USER    → usuario/correo de la cuenta SMTP (ej: micuenta@gmail.com)
 *   EMAIL_PASS    → contraseña de aplicación (NO la del correo personal)
 *   EMAIL_SERVICE → opcional, servicio Nodemailer (default: "gmail")
 *   EMAIL_FROM    → opcional, remitente visible (default: "Full Stock <EMAIL_USER>")
 *
 * Modo degradado (dev / sin SMTP configurado):
 *   Si faltan EMAIL_USER/EMAIL_PASS, NO se rompe el flujo: se imprime el enlace
 *   de reseteo en la consola del servidor para poder probar localmente.
 */

const nodemailer = require('nodemailer');

let _transporter = null;

/** Crea (o reutiliza) el transporter. Devuelve null si faltan credenciales. */
function getTransporter() {
  if (_transporter) return _transporter;

  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!user || !pass) return null;

  _transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: { user, pass },
  });
  return _transporter;
}

/** Plantilla HTML oscura/índigo coherente con la identidad de Full Stock. */
function buildResetEmailHTML(resetUrl) {
  return `
  <div style="margin:0;padding:0;background:#020617;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#020617;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#0f172a;border:1px solid #1e293b;border-radius:16px;overflow:hidden;">

          <!-- Header -->
          <tr><td style="padding:32px 32px 8px;text-align:center;">
            <div style="display:inline-block;width:56px;height:56px;border-radius:14px;background:linear-gradient(135deg,#6366f1,#8b5cf6);line-height:56px;font-size:26px;color:#fff;font-weight:800;">FS</div>
            <h1 style="margin:16px 0 0;font-size:20px;color:#f1f5f9;font-weight:700;">
              <span style="color:#ffffff;">Full</span><span style="color:#818cf8;">Stock</span>
            </h1>
          </td></tr>

          <!-- Body -->
          <tr><td style="padding:8px 32px 0;">
            <h2 style="margin:16px 0 8px;font-size:17px;color:#f1f5f9;font-weight:600;">Restablece tu contraseña</h2>
            <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#94a3b8;">
              Recibimos una solicitud para restablecer la contraseña de tu cuenta.
              Pulsa el botón para crear una nueva. <strong style="color:#cbd5e1;">Este enlace caduca en 1 hora.</strong>
            </p>
          </td></tr>

          <!-- Botón -->
          <tr><td style="padding:0 32px 24px;text-align:center;">
            <a href="${resetUrl}"
               style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:10px;">
              Restablecer contraseña
            </a>
          </td></tr>

          <!-- Fallback link -->
          <tr><td style="padding:0 32px 24px;">
            <p style="margin:0 0 6px;font-size:12px;color:#64748b;">Si el botón no funciona, copia este enlace en tu navegador:</p>
            <p style="margin:0;font-size:12px;word-break:break-all;"><a href="${resetUrl}" style="color:#818cf8;">${resetUrl}</a></p>
          </td></tr>

          <!-- Footer -->
          <tr><td style="padding:20px 32px;border-top:1px solid #1e293b;">
            <p style="margin:0;font-size:12px;line-height:1.5;color:#475569;">
              Si no solicitaste este cambio, ignora este correo. Tu contraseña permanecerá igual.
            </p>
          </td></tr>

        </table>
        <p style="margin:16px 0 0;font-size:11px;color:#334155;">© Full Stock — Panel de Administración</p>
      </td></tr>
    </table>
  </div>`;
}

/**
 * Envía el correo de reseteo de contraseña.
 * @param {string} to        correo destino
 * @param {string} resetUrl  enlace completo con ?token=...
 * @returns {Promise<{delivered:boolean, devLink?:string}>}
 */
async function sendPasswordResetEmail(to, resetUrl) {
  const transporter = getTransporter();

  // Modo degradado: sin credenciales SMTP, registramos el link en consola.
  if (!transporter) {
    console.warn('[mailer] EMAIL_USER/EMAIL_PASS no configurados — modo dev.');
    console.warn('[mailer] Enlace de reseteo para', to, '→', resetUrl);
    return { delivered: false, devLink: resetUrl };
  }

  await transporter.sendMail({
    from:    process.env.EMAIL_FROM || `"Full Stock" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Restablece tu contraseña — Full Stock',
    html:    buildResetEmailHTML(resetUrl),
  });

  return { delivered: true };
}

module.exports = { sendPasswordResetEmail };
