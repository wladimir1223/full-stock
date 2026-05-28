/**
 * reset-password.js — Lógica de la vista de reseteo de contraseña.
 *
 * Flujo:
 *   1. Captura el token desde la URL (?token=...) vía URLSearchParams.
 *   2. Valida en cliente: contraseñas coinciden + mínimo 8 caracteres.
 *   3. POST /api/auth/reset-password { token, password }.
 *
 * CSP (Zero-Inline): toda la lógica vía addEventListener; sin handlers inline.
 */

(function () {
  'use strict';

  const MIN_LEN = 8;

  const form     = document.getElementById('reset-form');
  const passEl   = document.getElementById('password');
  const confEl   = document.getElementById('confirm');
  const submitEl = document.getElementById('submit-btn');
  const msgEl    = document.getElementById('msg');

  // ── Token desde la URL ──────────────────────────────────────────────────────
  const token = new URLSearchParams(window.location.search).get('token');

  // ── Helpers de UI ─────────────────────────────────────────────────────────
  function showError(text) {
    msgEl.className   = 'msg error';
    msgEl.textContent = text;
  }
  function showSuccess(text) {
    msgEl.className   = 'msg success';
    msgEl.textContent = text;
  }
  function clearMsg() {
    msgEl.className   = 'msg';
    msgEl.textContent = '';
  }
  function setLoading(on) {
    submitEl.disabled = on;
    submitEl.innerHTML = on
      ? '<span class="spinner"></span>Guardando…'
      : 'Guardar nueva contraseña';
  }

  // ── Sin token → bloquear el formulario ──────────────────────────────────────
  if (!token) {
    showError('Falta el token de recuperación. Solicita un nuevo enlace desde el inicio de sesión.');
    if (passEl)   passEl.disabled   = true;
    if (confEl)   confEl.disabled   = true;
    if (submitEl) submitEl.disabled = true;
    return;
  }

  // Limpia el mensaje al escribir.
  [passEl, confEl].forEach(function (el) {
    el.addEventListener('input', clearMsg);
  });

  // ── Submit ────────────────────────────────────────────────────────────────
  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const password = passEl.value;
    const confirm  = confEl.value;

    // Validación defensiva en cliente
    if (!password || !confirm) {
      showError('Completa ambos campos de contraseña.');
      return;
    }
    if (password.length < MIN_LEN) {
      showError('La contraseña debe tener al menos ' + MIN_LEN + ' caracteres.');
      passEl.focus();
      return;
    }
    if (password !== confirm) {
      showError('Las contraseñas no coinciden.');
      confEl.focus();
      return;
    }

    clearMsg();
    setLoading(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token: token, password: password }),
      });
      const data = await res.json().catch(function () { return {}; });

      if (!res.ok || !data.success) {
        showError(data.message || 'No se pudo restablecer la contraseña. El enlace puede haber expirado.');
        setLoading(false);
        return;
      }

      // Éxito: mensaje + redirección al login.
      form.style.display = 'none';
      showSuccess((data.message || 'Tu contraseña se actualizó correctamente.') + ' Redirigiendo al inicio de sesión…');
      setTimeout(function () { window.location.href = '/'; }, 2500);

    } catch (err) {
      showError('Error de conexión. Inténtalo de nuevo en unos momentos.');
      setLoading(false);
    }
  });
})();
