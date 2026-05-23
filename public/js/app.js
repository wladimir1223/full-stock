/**
 * app.js — Orquestador principal de Full Stock SaaS.
 * Gestiona autenticación multi-tenant, navegación y sistema de toasts.
 */

const App = (() => {
  const PANELS = {
    builder: { label: 'Builder',          module: () => Builder },
    content: { label: 'Gestor Contenido', module: () => Content },
  };

  let currentPanel = null;

  // ════════════════════════════════════════════════════════════
  // INIT
  // ════════════════════════════════════════════════════════════

  function init() {
    if (Auth.isLoggedIn()) {
      renderApp();
    } else {
      showAuth('login');
    }
  }

  // ════════════════════════════════════════════════════════════
  // PANTALLA DE AUTENTICACIÓN (Login + Registro)
  // ════════════════════════════════════════════════════════════

  function showAuth(defaultTab, externalMsg) {
    defaultTab = defaultTab || 'login';
    document.body.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'min-h-screen bg-slate-950 flex items-center justify-center px-4 py-10';
    wrap.innerHTML = `
      <div style="width:100%;max-width:440px">

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
          <p class="text-slate-500 text-sm mt-1">Headless CMS · SaaS</p>
        </div>

        <!-- Card -->
        <div style="background:#1e293b;border:1px solid #334155;border-radius:1rem;padding:0">

          <!-- Tabs Login / Registrarse -->
          <div style="display:flex;border-bottom:1px solid #334155">
            <button id="tab-login"
              style="flex:1;padding:.85rem;font-size:.875rem;font-weight:600;border:none;
                     border-radius:1rem 0 0 0;cursor:pointer;transition:background .15s,color .15s"
              class="auth-tab" data-tab="login">Iniciar sesión</button>
            <button id="tab-register"
              style="flex:1;padding:.85rem;font-size:.875rem;font-weight:600;border:none;
                     border-radius:0 1rem 0 0;cursor:pointer;transition:background .15s,color .15s"
              class="auth-tab" data-tab="register">Crear cuenta</button>
          </div>

          <div style="padding:1.75rem">

            <!-- Mensaje externo (sesión expirada, etc.) -->
            <div id="auth-ext-msg"
                 class="${externalMsg ? '' : 'hidden'}"
                 style="background:#451a03;border:1px solid #92400e;border-radius:.5rem;
                        color:#fbbf24;font-size:.8rem;padding:.75rem 1rem;margin-bottom:1rem">
              ${externalMsg || ''}
            </div>

            <!-- ── PANEL LOGIN ── -->
            <div id="panel-login">
              <h2 style="color:#f1f5f9;font-size:1rem;font-weight:600;margin-bottom:1.25rem">
                Accede a tu panel
              </h2>
              <div style="display:flex;flex-direction:column;gap:.875rem">
                <div>
                  <label style="display:block;font-size:.7rem;font-weight:600;color:#94a3b8;
                                text-transform:uppercase;letter-spacing:.06em;margin-bottom:.35rem">
                    Email
                  </label>
                  <input id="li-email" type="email" placeholder="tu@negocio.com"
                    autocomplete="email"
                    style="width:100%;box-sizing:border-box;background:#0f172a;border:1px solid #334155;
                           border-radius:.5rem;color:#f1f5f9;padding:.55rem .75rem;font-size:.875rem;outline:none"/>
                </div>
                <div>
                  <label style="display:block;font-size:.7rem;font-weight:600;color:#94a3b8;
                                text-transform:uppercase;letter-spacing:.06em;margin-bottom:.35rem">
                    Contraseña
                  </label>
                  <div style="position:relative">
                    <input id="li-pass" type="password" placeholder="••••••••"
                      autocomplete="current-password"
                      style="width:100%;box-sizing:border-box;background:#0f172a;border:1px solid #334155;
                             border-radius:.5rem;color:#f1f5f9;padding:.55rem 2.5rem .55rem .75rem;
                             font-size:.875rem;outline:none"/>
                    <button id="li-toggle" type="button"
                      style="position:absolute;right:.65rem;top:50%;transform:translateY(-50%);
                             background:none;border:none;cursor:pointer;color:#64748b;padding:0">
                      👁
                    </button>
                  </div>
                </div>
              </div>
              <div id="li-error"
                   style="display:none;background:#450a0a;border:1px solid #991b1b;border-radius:.5rem;
                          color:#f87171;font-size:.8rem;padding:.65rem 1rem;margin-top:.875rem">
              </div>
              <button id="li-btn"
                style="margin-top:1.25rem;width:100%;background:linear-gradient(135deg,#6366f1,#8b5cf6);
                       color:#fff;font-weight:600;font-size:.875rem;padding:.65rem;border-radius:.5rem;
                       border:none;cursor:pointer;transition:opacity .15s">
                Entrar
              </button>
            </div>

            <!-- ── PANEL REGISTRO ── -->
            <div id="panel-register" style="display:none">
              <h2 style="color:#f1f5f9;font-size:1rem;font-weight:600;margin-bottom:1.25rem">
                Crea tu cuenta gratis
              </h2>
              <div style="display:flex;flex-direction:column;gap:.875rem">
                <div>
                  <label style="display:block;font-size:.7rem;font-weight:600;color:#94a3b8;
                                text-transform:uppercase;letter-spacing:.06em;margin-bottom:.35rem">
                    Nombre del negocio
                  </label>
                  <input id="re-name" type="text" placeholder="Ej: Café Lumière, Mi Tienda Online…"
                    autocomplete="organization"
                    style="width:100%;box-sizing:border-box;background:#0f172a;border:1px solid #334155;
                           border-radius:.5rem;color:#f1f5f9;padding:.55rem .75rem;font-size:.875rem;outline:none"/>
                  <p id="re-slug-preview"
                     style="font-size:.7rem;color:#64748b;margin-top:.3rem;min-height:1rem"></p>
                </div>
                <div>
                  <label style="display:block;font-size:.7rem;font-weight:600;color:#94a3b8;
                                text-transform:uppercase;letter-spacing:.06em;margin-bottom:.35rem">
                    Email
                  </label>
                  <input id="re-email" type="email" placeholder="tu@negocio.com"
                    autocomplete="email"
                    style="width:100%;box-sizing:border-box;background:#0f172a;border:1px solid #334155;
                           border-radius:.5rem;color:#f1f5f9;padding:.55rem .75rem;font-size:.875rem;outline:none"/>
                </div>
                <div>
                  <label style="display:block;font-size:.7rem;font-weight:600;color:#94a3b8;
                                text-transform:uppercase;letter-spacing:.06em;margin-bottom:.35rem">
                    Contraseña <span style="color:#475569;font-weight:400">(mínimo 8 caracteres)</span>
                  </label>
                  <input id="re-pass" type="password" placeholder="••••••••"
                    autocomplete="new-password"
                    style="width:100%;box-sizing:border-box;background:#0f172a;border:1px solid #334155;
                           border-radius:.5rem;color:#f1f5f9;padding:.55rem .75rem;font-size:.875rem;outline:none"/>
                </div>
                <div>
                  <label style="display:block;font-size:.7rem;font-weight:600;color:#94a3b8;
                                text-transform:uppercase;letter-spacing:.06em;margin-bottom:.35rem">
                    Confirmar contraseña
                  </label>
                  <input id="re-pass2" type="password" placeholder="••••••••"
                    autocomplete="new-password"
                    style="width:100%;box-sizing:border-box;background:#0f172a;border:1px solid #334155;
                           border-radius:.5rem;color:#f1f5f9;padding:.55rem .75rem;font-size:.875rem;outline:none"/>
                </div>
              </div>
              <div id="re-error"
                   style="display:none;background:#450a0a;border:1px solid #991b1b;border-radius:.5rem;
                          color:#f87171;font-size:.8rem;padding:.65rem 1rem;margin-top:.875rem">
              </div>
              <button id="re-btn"
                style="margin-top:1.25rem;width:100%;background:linear-gradient(135deg,#059669,#0d9488);
                       color:#fff;font-weight:600;font-size:.875rem;padding:.65rem;border-radius:.5rem;
                       border:none;cursor:pointer;transition:opacity .15s">
                Crear cuenta gratis
              </button>
              <p style="text-center;font-size:.7rem;color:#475569;margin-top:.875rem;text-align:center">
                Al registrarte se crea tu espacio aislado en el CMS.<br>Datos 100% privados.
              </p>
            </div>

          </div><!-- /padding -->
        </div><!-- /card -->
      </div>
    `;
    document.body.appendChild(wrap);

    // ── Lógica de tabs ──────────────────────────────────────────
    function activateTab(tab) {
      wrap.querySelectorAll('.auth-tab').forEach(btn => {
        const active = btn.dataset.tab === tab;
        btn.style.background = active ? '#1e293b' : '#0f172a';
        btn.style.color      = active ? '#e2e8f0' : '#64748b';
      });
      wrap.querySelector('#panel-login').style.display    = tab === 'login'    ? '' : 'none';
      wrap.querySelector('#panel-register').style.display = tab === 'register' ? '' : 'none';
    }

    activateTab(defaultTab);
    wrap.querySelectorAll('.auth-tab').forEach(btn => {
      btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    });

    // ── Login ────────────────────────────────────────────────────
    const liEmail  = wrap.querySelector('#li-email');
    const liPass   = wrap.querySelector('#li-pass');
    const liBtn    = wrap.querySelector('#li-btn');
    const liError  = wrap.querySelector('#li-error');
    const liToggle = wrap.querySelector('#li-toggle');

    liToggle.addEventListener('click', () => {
      liPass.type = liPass.type === 'password' ? 'text' : 'password';
    });

    [liEmail, liPass].forEach(el => {
      el.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    });
    liBtn.addEventListener('click', doLogin);
    if (defaultTab === 'login') liEmail.focus();

    async function doLogin() {
      const email = liEmail.value.trim();
      const pass  = liPass.value;
      if (!email || !pass) {
        liError.textContent = 'Completa email y contraseña.';
        liError.style.display = '';
        return;
      }
      liError.style.display = 'none';
      liBtn.disabled   = true;
      liBtn.textContent = 'Entrando…';
      try {
        const res = await API.auth.login(email, pass);
        Auth.setToken(res.token);
        renderApp();
      } catch (err) {
        liError.textContent   = (err && err.message) ? err.message : 'Error al iniciar sesión.';
        liError.style.display = '';
        liPass.value          = '';
        liPass.focus();
        liBtn.disabled    = false;
        liBtn.textContent  = 'Entrar';
      }
    }

    // ── Registro ─────────────────────────────────────────────────
    const reName    = wrap.querySelector('#re-name');
    const reEmail   = wrap.querySelector('#re-email');
    const rePass    = wrap.querySelector('#re-pass');
    const rePass2   = wrap.querySelector('#re-pass2');
    const reBtn     = wrap.querySelector('#re-btn');
    const reError   = wrap.querySelector('#re-error');
    const reSlug    = wrap.querySelector('#re-slug-preview');

    // Preview del slug en tiempo real
    reName.addEventListener('input', () => {
      const slug = reName.value
        .toLowerCase().trim()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').slice(0, 40);
      reSlug.textContent = slug
        ? `Tu API pública: /api/v1/${slug}/collections/...`
        : '';
    });

    [reName, reEmail, rePass, rePass2].forEach(el => {
      el.addEventListener('keydown', e => { if (e.key === 'Enter') doRegister(); });
    });
    reBtn.addEventListener('click', doRegister);
    if (defaultTab === 'register') reName.focus();

    async function doRegister() {
      const name  = reName.value.trim();
      const email = reEmail.value.trim();
      const pass  = rePass.value;
      const pass2 = rePass2.value;

      if (!name || !email || !pass || !pass2) {
        reError.textContent   = 'Completa todos los campos.';
        reError.style.display = '';
        return;
      }
      if (pass !== pass2) {
        reError.textContent   = 'Las contraseñas no coinciden.';
        reError.style.display = '';
        return;
      }
      if (pass.length < 8) {
        reError.textContent   = 'La contraseña debe tener al menos 8 caracteres.';
        reError.style.display = '';
        return;
      }

      reError.style.display = 'none';
      reBtn.disabled    = true;
      reBtn.textContent  = 'Creando cuenta…';

      try {
        const res = await API.auth.register(name, email, pass);
        Auth.setToken(res.token);
        showToast(`¡Bienvenido, ${res.user.name}! Tu espacio está listo.`, 'success');
        renderApp();
      } catch (err) {
        reError.textContent   = (err && err.message) ? err.message : 'Error al crear la cuenta.';
        reError.style.display = '';
        reBtn.disabled    = false;
        reBtn.textContent  = 'Crear cuenta gratis';
      }
    }
  }

  // Alias para compatibilidad con el handler 401 de api.js
  function showLogin(msg) { showAuth('login', msg); }

  // ════════════════════════════════════════════════════════════
  // LAYOUT PRINCIPAL (post-login)
  // ════════════════════════════════════════════════════════════

  function renderApp() {
    const tenantName = Auth.getName()       || 'Mi cuenta';
    const tenantSlug = Auth.getTenantSlug() || '';
    const initials   = tenantName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

    document.body.innerHTML = `
      <div id="toast-container"
           style="position:fixed;top:1.25rem;right:1.25rem;z-index:50;
                  display:flex;flex-direction:column;gap:.5rem;pointer-events:none"></div>

      <div class="min-h-screen bg-slate-950 text-slate-100 flex flex-col">

        <!-- Navbar -->
        <header class="bg-slate-900 border-b border-slate-800 px-6 py-3
                        flex items-center justify-between shrink-0 gap-4">

          <!-- Logo -->
          <div class="flex items-center gap-2 shrink-0">
            <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600
                        flex items-center justify-center shadow-lg shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-white"
                   fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10"/>
              </svg>
            </div>
            <span class="text-lg font-bold tracking-tight hidden sm:inline">
              <span class="text-white">Full</span><span class="text-indigo-400">Stock</span>
            </span>
          </div>

          <!-- Tabs -->
          <nav class="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
            ${Object.entries(PANELS).map(([key, p]) => `
              <button class="nav-tab text-sm px-4 py-1.5 rounded-md transition font-medium
                             text-slate-400" data-panel="${key}">${p.label}</button>
            `).join('')}
          </nav>

          <!-- Tenant info + Logout -->
          <div class="flex items-center gap-2 shrink-0">
            <!-- Avatar + Nombre del negocio -->
            <div class="hidden sm:flex items-center gap-2 border border-slate-700 rounded-full pl-1 pr-3 py-1">
              <div class="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600
                          flex items-center justify-center text-white font-bold shrink-0"
                   style="font-size:.6rem">${initials}</div>
              <div class="text-left leading-tight">
                <p class="text-xs font-semibold text-slate-200">${escHtml(tenantName)}</p>
                ${tenantSlug
                  ? `<p class="text-xs text-indigo-400" style="font-size:.65rem">@${escHtml(tenantSlug)}</p>`
                  : ''}
              </div>
            </div>
            <!-- Logout -->
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
          <span>Full Stock SaaS v2.0</span>
          ${tenantSlug
            ? `<span>API pública: <code class="text-slate-500">/api/v1/${escHtml(tenantSlug)}/collections/:slug</code></span>`
            : ''}
        </footer>
      </div>
    `;

    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.addEventListener('click', () => navigate(btn.dataset.panel));
    });

    document.getElementById('logout-btn').addEventListener('click', function() {
      API.auth.logout();
      Auth.clear();
      showAuth('login');
      showToast('Sesión cerrada.', 'info');
    });

    navigate('builder');
  }

  // ════════════════════════════════════════════════════════════
  // NAVEGACIÓN
  // ════════════════════════════════════════════════════════════

  async function navigate(panelKey) {
    if (!PANELS[panelKey]) return;
    currentPanel = panelKey;

    document.querySelectorAll('.nav-tab').forEach(btn => {
      const active = btn.dataset.panel === panelKey;
      btn.classList.toggle('bg-slate-700',  active);
      btn.classList.toggle('text-white',    active);
      btn.classList.toggle('text-slate-400', !active);
    });

    const panelDiv = document.getElementById('panel-content');
    panelDiv.innerHTML = `
      <div class="flex items-center gap-2 text-slate-500 text-sm">
        <div style="width:1rem;height:1rem;border:2px solid #6366f1;border-top-color:transparent;
                    border-radius:50%;animation:spin .7s linear infinite"></div>
        Cargando…
      </div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    `;

    try {
      await PANELS[panelKey].module().render(panelDiv);
    } catch (err) {
      panelDiv.innerHTML = `<p class="text-red-400">Error al cargar el panel: ${err.message || err}</p>`;
    }
  }

  // ════════════════════════════════════════════════════════════
  // TOASTS
  // ════════════════════════════════════════════════════════════

  function showToast(message, type) {
    type = type || 'info';
    const colors = {
      success: 'background:#065f46;border-color:#059669',
      error:   'background:#7f1d1d;border-color:#991b1b',
      info:    'background:#1e293b;border-color:#334155',
    };
    const icons = { success: '✓', error: '✕', info: 'i' };

    const toast = document.createElement('div');
    toast.style.cssText =
      'pointer-events:auto;display:flex;align-items:center;gap:.75rem;' +
      'padding:.75rem 1rem;border-radius:.75rem;border:1px solid;box-shadow:0 10px 25px rgba(0,0,0,.4);' +
      'font-size:.875rem;color:#fff;animation:fadeIn .2s ease;' + (colors[type] || colors.info);
    toast.innerHTML =
      '<span style="font-weight:700">' + (icons[type] || 'i') + '</span>' +
      '<span>' + escHtml(message) + '</span>';

    const container = document.getElementById('toast-container');
    if (container) {
      container.appendChild(toast);
      setTimeout(() => toast.remove(), 3500);
    }
  }

  // ════════════════════════════════════════════════════════════
  // UTILIDADES
  // ════════════════════════════════════════════════════════════

  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { init, navigate, showLogin, showAuth, showToast };
})();

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
