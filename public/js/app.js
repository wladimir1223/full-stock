/**
 * app.js - Orquestador principal de la SPA Full Stock.
 * Gestiona autenticacion, navegacion entre paneles y sistema de toasts.
 */

const App = (() => {
  const PANELS = {
    builder: { label: 'Builder',          module: () => Builder },
    content: { label: 'Gestor Contenido', module: () => Content },
  };

  let currentPanel = null;

  // ========================================================
  // INIT
  // ========================================================

  function init() {
    if (Auth.isLoggedIn()) {
      renderApp();
    } else {
      showLogin();
    }
  }

  // ========================================================
  // PANTALLA DE LOGIN
  // ========================================================

  function showLogin(errorMsg) {
    document.body.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'min-h-screen bg-slate-950 flex items-center justify-center px-4';
    wrap.innerHTML = `
      <div style="width:100%;max-width:420px">

        <!-- Logo -->
        <div class="text-center mb-8">
          <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600
                      flex items-center justify-center mx-auto mb-4 shadow-2xl shadow-indigo-900/40">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-white" fill="none"
                 viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10"/>
            </svg>
          </div>
          <h1 class="text-2xl font-bold">
            <span class="text-white">Full</span><span class="text-indigo-400">Stock</span>
          </h1>
          <p class="text-slate-500 text-sm mt-1">Panel de Administracion</p>
        </div>

        <!-- Card -->
        <div style="background:#1e293b;border:1px solid #334155;border-radius:1rem;padding:2rem">

          <h2 class="text-lg font-semibold text-white mb-6">Iniciar sesion</h2>

          <!-- Error externo (session expirada, etc.) -->
          <div id="login-ext-error"
               class="${errorMsg ? '' : 'hidden'} text-amber-400 text-sm bg-amber-900/30
                      border border-amber-700 rounded-lg px-4 py-3 mb-4">
            ${errorMsg || ''}
          </div>

          <!-- Formulario -->
          <div class="space-y-4">
            <div>
              <label class="label" for="login-user">Usuario</label>
              <input id="login-user" type="text" placeholder="admin"
                autocomplete="username" class="input-field"
                style="background:#0f172a;border:1px solid #334155;border-radius:.5rem;
                       color:#f1f5f9;padding:.5rem .75rem;font-size:.875rem;
                       outline:none;width:100%;box-sizing:border-box"/>
            </div>
            <div>
              <label class="label" for="login-pass" style="display:block;font-size:.75rem;
                font-weight:500;color:#94a3b8;margin-bottom:.375rem;text-transform:uppercase;
                letter-spacing:.05em">Contrasena</label>
              <div style="position:relative">
                <input id="login-pass" type="password" placeholder="••••••••"
                  autocomplete="current-password"
                  style="background:#0f172a;border:1px solid #334155;border-radius:.5rem;
                         color:#f1f5f9;padding:.5rem 2.5rem .5rem .75rem;font-size:.875rem;
                         outline:none;width:100%;box-sizing:border-box"/>
                <button id="toggle-pass" type="button" title="Mostrar/ocultar"
                  style="position:absolute;right:.6rem;top:50%;transform:translateY(-50%);
                         background:none;border:none;cursor:pointer;color:#64748b;padding:0">
                  <svg id="eye-icon" xmlns="http://www.w3.org/2000/svg" style="width:1.1rem;height:1.1rem"
                       fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7
                         -1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <!-- Error de credenciales -->
          <div id="login-error"
               class="hidden text-red-400 text-sm bg-red-900/30 border border-red-800
                      rounded-lg px-4 py-3 mt-4">
          </div>

          <!-- Boton -->
          <button id="login-btn"
            style="margin-top:1.5rem;width:100%;background:linear-gradient(135deg,#6366f1,#8b5cf6);
                   color:#fff;font-weight:600;font-size:.875rem;padding:.6rem 1.25rem;
                   border-radius:.5rem;border:none;cursor:pointer;transition:opacity .15s">
            Entrar
          </button>

          <!-- Credenciales de prueba -->
          <p class="text-center text-xs text-slate-600 mt-5">
            Credenciales por defecto:
            <code class="text-slate-500">admin</code> /
            <code class="text-slate-500">fullstock2024</code>
          </p>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);

    const userInput = wrap.querySelector('#login-user');
    const passInput = wrap.querySelector('#login-pass');
    const loginBtn  = wrap.querySelector('#login-btn');
    const errDiv    = wrap.querySelector('#login-error');
    const toggleBtn = wrap.querySelector('#toggle-pass');

    // Toggle visibilidad contrasena
    toggleBtn.addEventListener('click', () => {
      const isPass = passInput.type === 'password';
      passInput.type = isPass ? 'text' : 'password';
      toggleBtn.style.color = isPass ? '#6366f1' : '#64748b';
    });

    // Enter en cualquier campo dispara login
    [userInput, passInput].forEach(el => {
      el.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    });
    loginBtn.addEventListener('click', doLogin);
    userInput.focus();

    async function doLogin() {
      const user = userInput.value.trim();
      const pass = passInput.value;

      if (!user || !pass) {
        errDiv.textContent = 'Completa usuario y contrasena.';
        errDiv.classList.remove('hidden');
        return;
      }

      errDiv.classList.add('hidden');
      loginBtn.disabled   = true;
      loginBtn.textContent = 'Entrando...';

      try {
        const res = await API.auth.login(user, pass);
        Auth.setToken(res.token);
        Auth.setUser(res.username);
        Auth.setExpiry(res.expiresAt);
        renderApp();
      } catch (err) {
        errDiv.textContent = (err && err.message) ? err.message : 'Error al iniciar sesion.';
        errDiv.classList.remove('hidden');
        passInput.value     = '';
        passInput.focus();
        loginBtn.disabled   = false;
        loginBtn.textContent = 'Entrar';
      }
    }
  }

  // ========================================================
  // LAYOUT PRINCIPAL (post-login)
  // ========================================================

  function renderApp() {
    document.body.innerHTML = `
      <div id="toast-container"
           style="position:fixed;top:1.25rem;right:1.25rem;z-index:50;
                  display:flex;flex-direction:column;gap:.5rem;pointer-events:none"></div>

      <div class="min-h-screen bg-slate-950 text-slate-100 flex flex-col">

        <!-- Navbar -->
        <header class="bg-slate-900 border-b border-slate-800 px-6 py-3
                        flex items-center justify-between shrink-0">
          <!-- Logo -->
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600
                        flex items-center justify-center shadow-lg">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-white"
                   fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10"/>
              </svg>
            </div>
            <span class="text-lg font-bold tracking-tight">
              <span class="text-white">Full</span><span class="text-indigo-400">Stock</span>
            </span>
            <span class="text-xs text-slate-500 hidden sm:inline">Headless CMS</span>
          </div>

          <!-- Tabs -->
          <nav class="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
            ${Object.entries(PANELS).map(([key, p]) => `
              <button class="nav-tab text-sm px-4 py-1.5 rounded-md transition font-medium
                             text-slate-400" data-panel="${key}">${p.label}</button>
            `).join('')}
          </nav>

          <!-- Usuario + Logout -->
          <div class="flex items-center gap-3">
            <div class="hidden sm:flex items-center gap-2 text-xs text-slate-400
                        border border-slate-700 rounded-full px-3 py-1">
              <div class="w-4 h-4 rounded-full bg-indigo-600 flex items-center justify-center
                          text-white font-bold" style="font-size:.6rem">
                ${(Auth.getUser() || 'A')[0].toUpperCase()}
              </div>
              <span>${Auth.getUser() || 'admin'}</span>
            </div>
            <button id="logout-btn"
              class="text-xs text-slate-400 hover:text-red-400 border border-slate-700
                     hover:border-red-800 rounded-lg px-3 py-1.5 transition flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none"
                   viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7
                     a2 2 0 012-2h6a2 2 0 012 2v1"/>
              </svg>
              Salir
            </button>
          </div>
        </header>

        <!-- Panel activo -->
        <div class="flex-1 overflow-auto px-6 py-6">
          <div id="panel-content" data-panel="active"></div>
        </div>

        <!-- Footer -->
        <footer class="bg-slate-900 border-t border-slate-800 px-6 py-2
                        text-xs text-slate-600 flex justify-between">
          <span>Full Stock v1.0 — Headless CMS MVP</span>
          <span>API: <code class="text-slate-500">/api/v1/collections/:slug</code></span>
        </footer>
      </div>
    `;

    // Nav tabs
    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.addEventListener('click', () => navigate(btn.dataset.panel));
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', async () => {
      try { await API.auth.logout(); } catch (_) {}
      Auth.clear();
      showLogin();
      showToast('Sesion cerrada.', 'info');
    });

    navigate('builder');
  }

  // ========================================================
  // NAVEGACION
  // ========================================================

  async function navigate(panelKey) {
    if (!PANELS[panelKey]) return;
    currentPanel = panelKey;

    document.querySelectorAll('.nav-tab').forEach(btn => {
      const active = btn.dataset.panel === panelKey;
      btn.classList.toggle('bg-slate-700', active);
      btn.classList.toggle('text-white',   active);
      btn.classList.toggle('text-slate-400', !active);
    });

    const panelDiv = document.getElementById('panel-content');
    panelDiv.innerHTML = `
      <div class="flex items-center gap-2 text-slate-500 text-sm">
        <div style="width:1rem;height:1rem;border:2px solid #6366f1;border-top-color:transparent;
                    border-radius:50%;animation:spin .7s linear infinite"></div>
        Cargando...
      </div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    `;

    try {
      await PANELS[panelKey].module().render(panelDiv);
    } catch (err) {
      panelDiv.innerHTML = `<p class="text-red-400">Error al cargar el panel: ${err.message || err}</p>`;
    }
  }

  // ========================================================
  // TOASTS
  // ========================================================

  function showToast(message, type) {
    type = type || 'info';
    const colors = {
      success: 'background:#065f46;border-color:#059669',
      error:   'background:#7f1d1d;border-color:#991b1b',
      info:    'background:#1e293b;border-color:#334155',
    };
    const icons = { success: '✓', error: '✕', info: 'i' };

    const toast = document.createElement('div');
    toast.style.cssText = 'pointer-events:auto;display:flex;align-items:center;gap:.75rem;' +
      'padding:.75rem 1rem;border-radius:.75rem;border:1px solid;box-shadow:0 10px 25px rgba(0,0,0,.4);' +
      'font-size:.875rem;color:#fff;animation:fadeIn .2s ease;' + (colors[type] || colors.info);
    toast.innerHTML = '<span style="font-weight:700">' + (icons[type] || 'i') + '</span><span>' + message + '</span>';

    const container = document.getElementById('toast-container');
    if (container) {
      container.appendChild(toast);
      setTimeout(() => toast.remove(), 3500);
    }
  }

  return { init, navigate, showLogin, showToast };
})();

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
