/**
 * app.js — Orquestador principal de Full Stock.
 * Gestiona autenticación multi-tenant, navegación y sistema de toasts.
 */

const App = (() => {
  // PANELS se construye dinámicamente en renderApp() según el rol del usuario
  let PANELS = {};

  let currentPanel = null;

  // ════════════════════════════════════════════════════════════
  // DETECCIÓN DE ROL
  // ════════════════════════════════════════════════════════════

  /**
   * "Modo Desarrollador" activo → muestra el Builder avanzado.
   * Para activarlo, añade ?dev=1 a la URL una sola vez.
   * Para desactivarlo, añade ?dev=0.
   */
  function isDevMode() {
    return localStorage.getItem('fs_dev_mode') === '1';
  }

  /**
   * Devuelve true si el usuario logueado tiene el rol 'superadmin'.
   * El rol se extrae del JWT al hacer login y se guarda en localStorage.
   */
  function isSuperAdmin() {
    return Auth.getRole() === 'superadmin';
  }

  /**
   * Devuelve los paneles disponibles según el rol:
   *   - Cliente normal    → Mis Categorías + Mis Productos
   *   - Modo Desarrollador → los anteriores + Builder Avanzado
   *   - SuperAdmin         → todos los anteriores + Monitoreo Global
   */
  function getPanels() {
    const base = {
      catalog:  { label: '🗂️ Mis Categorías', module: () => Catalog },
      content:  { label: '📦 Mis Productos',  module: () => Content },
      settings: { label: '⚙️ Configuración',  module: () => Settings },
    };
    if (isDevMode()) {
      base.builder = { label: '🔧 Builder', module: () => Builder, devOnly: true };
    }
    if (isSuperAdmin()) {
      base.monitor = { label: '🔭 Monitoreo Global', module: () => SuperAdmin };
    }
    return base;
  }

  // ════════════════════════════════════════════════════════════
  // INIT
  // ════════════════════════════════════════════════════════════

  function init() {
    // Leer param ?dev=1 / ?dev=0 para activar/desactivar modo desarrollador
    const params = new URLSearchParams(window.location.search);
    if (params.has('dev')) {
      if (params.get('dev') === '1') {
        localStorage.setItem('fs_dev_mode', '1');
      } else {
        localStorage.removeItem('fs_dev_mode');
      }
      // Limpiar la URL sin recargar
      history.replaceState(null, '', window.location.pathname);
    }

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
          <p class="text-slate-500 text-sm mt-1">Gestor de Inventario</p>
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
                    <button id="li-toggle" type="button" title="Mostrar / ocultar contraseña"
                      style="position:absolute;right:.65rem;top:50%;transform:translateY(-50%);
                             background:none;border:none;cursor:pointer;color:#64748b;padding:.2rem;
                             display:flex;align-items:center;border-radius:.25rem;
                             transition:color .15s">
                      <svg id="li-eye-icon" xmlns="http://www.w3.org/2000/svg" style="width:1rem;height:1rem;display:block;pointer-events:none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
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

              <!-- Forgot password link -->
              <div style="text-align:center;margin-top:.875rem">
                <button id="btn-forgot" type="button"
                  style="background:none;border:none;cursor:pointer;color:#6366f1;font-size:.78rem;
                         font-weight:500;padding:.2rem .4rem;border-radius:.25rem;transition:color .15s">
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
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
                  <div style="position:relative">
                    <input id="re-pass" type="password" placeholder="••••••••"
                      autocomplete="new-password"
                      style="width:100%;box-sizing:border-box;background:#0f172a;border:1px solid #334155;
                             border-radius:.5rem;color:#f1f5f9;padding:.55rem 2.5rem .55rem .75rem;
                             font-size:.875rem;outline:none"/>
                    <button id="re-toggle1" type="button" title="Mostrar / ocultar contraseña"
                      style="position:absolute;right:.65rem;top:50%;transform:translateY(-50%);
                             background:none;border:none;cursor:pointer;color:#64748b;padding:.2rem;
                             display:flex;align-items:center;border-radius:.25rem;transition:color .15s">
                      <svg xmlns="http://www.w3.org/2000/svg" style="width:1rem;height:1rem;display:block;pointer-events:none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                    </button>
                  </div>
                </div>
                <div>
                  <label style="display:block;font-size:.7rem;font-weight:600;color:#94a3b8;
                                text-transform:uppercase;letter-spacing:.06em;margin-bottom:.35rem">
                    Confirmar contraseña
                  </label>
                  <div style="position:relative">
                    <input id="re-pass2" type="password" placeholder="••••••••"
                      autocomplete="new-password"
                      style="width:100%;box-sizing:border-box;background:#0f172a;border:1px solid #334155;
                             border-radius:.5rem;color:#f1f5f9;padding:.55rem 2.5rem .55rem .75rem;
                             font-size:.875rem;outline:none"/>
                    <button id="re-toggle2" type="button" title="Mostrar / ocultar contraseña"
                      style="position:absolute;right:.65rem;top:50%;transform:translateY(-50%);
                             background:none;border:none;cursor:pointer;color:#64748b;padding:.2rem;
                             display:flex;align-items:center;border-radius:.25rem;transition:color .15s">
                      <svg xmlns="http://www.w3.org/2000/svg" style="width:1rem;height:1rem;display:block;pointer-events:none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
                    </button>
                  </div>
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

      <!-- ── Modal: Recuperar contraseña ──────────────────────────────── -->
      <div id="modal-forgot"
           style="display:none;position:fixed;inset:0;z-index:9999;
                  align-items:center;justify-content:center;padding:1rem">
        <!-- Backdrop -->
        <div id="modal-forgot-bd"
             style="position:absolute;inset:0;background:rgba(0,0,0,.75);
                    backdrop-filter:blur(4px)"></div>
        <!-- Card -->
        <div style="position:relative;width:100%;max-width:400px;
                    background:#1e293b;border:1px solid #334155;
                    border-radius:1rem;padding:2rem;z-index:1;
                    animation:fadeIn .2s ease-out">
          <!-- Header -->
          <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.5rem">
            <div style="width:2.5rem;height:2.5rem;border-radius:.625rem;flex-shrink:0;
                        background:linear-gradient(135deg,#6366f1,#8b5cf6);
                        display:flex;align-items:center;justify-content:center">
              <svg xmlns="http://www.w3.org/2000/svg"
                   style="width:1.25rem;height:1.25rem" fill="none" viewBox="0 0 24 24"
                   stroke="white" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round"
                      d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4
                         a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
              </svg>
            </div>
            <div>
              <h3 style="color:#f1f5f9;font-size:1rem;font-weight:700;margin:0 0 .2rem">
                Recuperar contraseña
              </h3>
              <p style="color:#64748b;font-size:.75rem;margin:0">
                Te enviaremos las instrucciones por email.
              </p>
            </div>
          </div>
          <!-- Input email -->
          <label style="display:block;font-size:.7rem;font-weight:600;color:#94a3b8;
                         text-transform:uppercase;letter-spacing:.06em;margin-bottom:.35rem">
            Correo electrónico
          </label>
          <input id="forgot-email" type="email" placeholder="tu@negocio.com"
            autocomplete="email"
            style="width:100%;box-sizing:border-box;background:#0f172a;border:1px solid #334155;
                   border-radius:.5rem;color:#f1f5f9;padding:.6rem .75rem;font-size:.875rem;
                   outline:none;transition:border-color .15s"/>
          <!-- Error -->
          <div id="forgot-error"
               style="display:none;background:#450a0a;border:1px solid #991b1b;
                      border-radius:.5rem;color:#f87171;font-size:.8rem;
                      padding:.65rem 1rem;margin-top:.75rem"></div>
          <!-- Acciones -->
          <div style="display:flex;gap:.75rem;margin-top:1.25rem">
            <button id="forgot-submit"
              style="flex:1;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;
                     font-weight:600;font-size:.875rem;padding:.65rem;border-radius:.5rem;
                     border:none;cursor:pointer;transition:opacity .15s">
              Recuperar contraseña
            </button>
            <button id="forgot-cancel"
              style="padding:.65rem 1rem;background:#0f172a;color:#94a3b8;
                     font-weight:500;font-size:.875rem;border-radius:.5rem;
                     border:1px solid #334155;cursor:pointer;transition:background .15s">
              Cancelar
            </button>
          </div>
        </div>
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
    liToggle.addEventListener('mouseover', () => { liToggle.style.color = '#94a3b8'; });
    liToggle.addEventListener('mouseout',  () => { liToggle.style.color = '#64748b'; });

    // ── Helper: ojo de contraseña (eye / eye-slash) ──────────────────
    const SVG_EYE_OPEN =
      '<svg xmlns="http://www.w3.org/2000/svg" style="width:1rem;height:1rem;display:block;pointer-events:none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">' +
      '<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>' +
      '<path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>' +
      '</svg>';
    const SVG_EYE_SLASH =
      '<svg xmlns="http://www.w3.org/2000/svg" style="width:1rem;height:1rem;display:block;pointer-events:none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">' +
      '<path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>' +
      '</svg>';
    function togglePassInput(inputEl, btnEl) {
      const show   = inputEl.type === 'password';
      inputEl.type = show ? 'text' : 'password';
      btnEl.innerHTML = show ? SVG_EYE_SLASH : SVG_EYE_OPEN;
    }
    liToggle.addEventListener('click', () => togglePassInput(liPass, liToggle));

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
    const reToggle1 = wrap.querySelector('#re-toggle1');
    const reToggle2 = wrap.querySelector('#re-toggle2');
    reToggle1.addEventListener('click',     () => togglePassInput(rePass,  reToggle1));
    reToggle2.addEventListener('click',     () => togglePassInput(rePass2, reToggle2));
    reToggle1.addEventListener('mouseover', () => { reToggle1.style.color = '#94a3b8'; });
    reToggle1.addEventListener('mouseout',  () => { reToggle1.style.color = '#64748b'; });
    reToggle2.addEventListener('mouseover', () => { reToggle2.style.color = '#94a3b8'; });
    reToggle2.addEventListener('mouseout',  () => { reToggle2.style.color = '#64748b'; });

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

    // ── Recuperar contraseña (modal) ──────────────────────────────────
    const modalForgot  = wrap.querySelector('#modal-forgot');
    const forgotEmail  = wrap.querySelector('#forgot-email');
    const forgotError  = wrap.querySelector('#forgot-error');
    const forgotSubmit = wrap.querySelector('#forgot-submit');
    const forgotCancel = wrap.querySelector('#forgot-cancel');
    const forgotBd     = wrap.querySelector('#modal-forgot-bd');

    const btnForgot = wrap.querySelector('#btn-forgot');
    btnForgot.addEventListener('mouseover', () => { btnForgot.style.color = '#818cf8'; });
    btnForgot.addEventListener('mouseout',  () => { btnForgot.style.color = '#6366f1'; });
    btnForgot.addEventListener('click', () => {
      forgotEmail.value         = liEmail.value.trim(); // pre-rellena si ya escribió el email
      forgotError.style.display = 'none';
      modalForgot.style.display = 'flex';
      setTimeout(() => forgotEmail.focus(), 60);
    });

    function cerrarForgot() { modalForgot.style.display = 'none'; }
    forgotCancel.addEventListener('click', cerrarForgot);
    forgotBd.addEventListener('click', cerrarForgot);
    forgotEmail.addEventListener('keydown', e => {
      if (e.key === 'Enter')  forgotSubmit.click();
      if (e.key === 'Escape') cerrarForgot();
    });

    forgotSubmit.addEventListener('click', async () => {
      const email = forgotEmail.value.trim();
      if (!email) {
        forgotError.textContent   = 'Introduce tu dirección de correo electrónico.';
        forgotError.style.display = '';
        forgotEmail.focus();
        return;
      }
      forgotError.style.display = 'none';
      forgotSubmit.disabled     = true;
      forgotSubmit.textContent  = 'Enviando…';

      try { await API.auth.recover(email); } catch (_) { /* siempre mostramos éxito */ }

      cerrarForgot();
      showToast(
        'Si el correo está registrado, te hemos enviado las instrucciones para restablecer tu contraseña.',
        'success'
      );
      forgotSubmit.disabled    = false;
      forgotSubmit.textContent = 'Recuperar contraseña';
    });
  }

  // Alias para compatibilidad con el handler 401 de api.js
  function showLogin(msg) { showAuth('login', msg); }

  // ════════════════════════════════════════════════════════════
  // LAYOUT PRINCIPAL (post-login)
  // ════════════════════════════════════════════════════════════

  function renderApp() {
    // Reconstruir paneles al renderizar (respeta el rol actual)
    PANELS = getPanels();

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
                             text-slate-400${p.devOnly ? ' border border-orange-900/40' : ''}"
                      data-panel="${key}"
                      title="${p.devOnly ? 'Modo Desarrollador activo' : ''}">${p.label}</button>
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
            <!-- Soporte -->
            <button id="support-btn"
              class="text-xs text-slate-400 hover:text-indigo-300 border border-slate-700
                     hover:border-indigo-700/60 rounded-lg px-3 py-1.5 transition
                     flex items-center gap-1.5"
              title="Soporte técnico – Mascotizaciones">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 shrink-0"
                   fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172
                     L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0
                     9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"/>
              </svg>
              Ayuda
            </button>

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
                        text-xs text-slate-600 flex justify-between items-center">
          <span class="flex items-center gap-2">
            Full Stock v2.0
            ${isDevMode()
              ? `<span class="text-orange-400/70 border border-orange-900/40 rounded px-1.5 py-0.5
                             text-[10px] font-semibold" title="Para salir del modo dev: ?dev=0">
                   ⚙ Modo Dev
                 </span>`
              : ''}
          ${isSuperAdmin()
              ? `<span class="text-violet-400/70 border border-violet-900/40 rounded px-1.5 py-0.5
                             text-[10px] font-semibold">
                   ⭐ SuperAdmin
                 </span>`
              : ''}
          </span>
          ${tenantSlug
            ? `<span>API: <code class="text-slate-500">/api/v1/${escHtml(tenantSlug)}/collections/:slug</code></span>`
            : ''}
        </footer>
      </div>

      <!-- ══ Modal: Soporte técnico ════════════════════════════════════ -->
      <div id="modal-support"
           style="display:none;position:fixed;inset:0;z-index:9999;
                  align-items:center;justify-content:center;padding:1rem">
        <!-- Backdrop -->
        <div id="support-backdrop"
             style="position:absolute;inset:0;background:rgba(0,0,0,.75);
                    backdrop-filter:blur(4px)"></div>
        <!-- Card -->
        <div style="position:relative;width:100%;max-width:420px;
                    background:#1e293b;border:1px solid #334155;
                    border-radius:1rem;padding:2rem;z-index:1;
                    animation:fadeIn .2s ease-out">

          <!-- Header -->
          <div style="display:flex;align-items:flex-start;gap:1rem;margin-bottom:1.5rem">
            <div style="width:3rem;height:3rem;border-radius:.75rem;flex-shrink:0;
                        background:linear-gradient(135deg,#6366f1,#8b5cf6);
                        display:flex;align-items:center;justify-content:center;
                        box-shadow:0 8px 20px rgba(99,102,241,.35)">
              <svg xmlns="http://www.w3.org/2000/svg" style="width:1.4rem;height:1.4rem"
                   fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round"
                      d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172
                         L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0
                         9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"/>
              </svg>
            </div>
            <div>
              <h3 style="color:#f1f5f9;font-size:1.1rem;font-weight:700;
                          margin:0 0 .3rem;line-height:1.2">
                ¿Necesitas ayuda?
              </h3>
              <p style="color:#64748b;font-size:.8rem;margin:0;line-height:1.5">
                El equipo de <strong style="color:#94a3b8">Mascotizaciones</strong>
                está disponible para ayudarte con la gestión de tu inventario.
              </p>
            </div>
          </div>

          <!-- Separador -->
          <div style="border-top:1px solid #334155;margin-bottom:1.25rem"></div>

          <!-- Info de contacto -->
          <div style="background:#0f172a;border:1px solid #334155;border-radius:.625rem;
                      padding:1rem;margin-bottom:1.25rem">
            <p style="color:#64748b;font-size:.72rem;font-weight:600;
                       text-transform:uppercase;letter-spacing:.06em;margin:0 0 .5rem">
              Soporte por correo electrónico
            </p>
            <p style="color:#a5b4fc;font-size:.875rem;font-weight:500;margin:0 0 .25rem">
              agencia.mascotizaciones@gmail.com
            </p>
            <p style="color:#475569;font-size:.72rem;margin:0">
              Tiempo de respuesta habitual: mismo día hábil
            </p>
          </div>

          <!-- Acciones -->
          <div style="display:flex;flex-direction:column;gap:.625rem">
            <a id="support-email-link"
               href="mailto:agencia.mascotizaciones@gmail.com?subject=Soporte%20Plataforma%20Full%20Stock"
               style="display:flex;align-items:center;justify-content:center;gap:.5rem;
                      background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;
                      font-weight:600;font-size:.875rem;padding:.75rem;border-radius:.5rem;
                      text-decoration:none;transition:opacity .15s;text-align:center">
              <svg xmlns="http://www.w3.org/2000/svg" style="width:1rem;height:1rem;flex-shrink:0"
                   fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round"
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7
                         a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
              Enviar correo a Soporte
            </a>
            <button id="support-close"
              style="padding:.7rem;background:#0f172a;color:#94a3b8;
                     font-weight:500;font-size:.875rem;border-radius:.5rem;
                     border:1px solid #334155;cursor:pointer;transition:background .15s">
              Cerrar
            </button>
          </div>

        </div>
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

    // ── Modal de soporte ─────────────────────────────────────────────
    const modalSupport    = document.getElementById('modal-support');
    const supportBackdrop = document.getElementById('support-backdrop');
    const supportClose    = document.getElementById('support-close');
    const supportEmailLink = document.getElementById('support-email-link');
    if (supportEmailLink) {
      supportEmailLink.addEventListener('mouseover', () => { supportEmailLink.style.opacity = '.88'; });
      supportEmailLink.addEventListener('mouseout',  () => { supportEmailLink.style.opacity = '1'; });
    }
    supportClose.addEventListener('mouseover', () => { supportClose.style.background = '#1e293b'; });
    supportClose.addEventListener('mouseout',  () => { supportClose.style.background = '#0f172a'; });

    document.getElementById('support-btn').addEventListener('click', () => {
      modalSupport.style.display = 'flex';
    });
    function cerrarSupport() { modalSupport.style.display = 'none'; }
    supportClose.addEventListener('click',    cerrarSupport);
    supportBackdrop.addEventListener('click', cerrarSupport);
    document.addEventListener('keydown', function escSupport(e) {
      if (e.key === 'Escape' && modalSupport.style.display === 'flex') cerrarSupport();
    });

    navigate('catalog');
  }

  // ════════════════════════════════════════════════════════════
  // NAVEGACIÓN
  // ════════════════════════════════════════════════════════════

  async function navigate(panelKey, opts) {
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
      await PANELS[panelKey].module().render(panelDiv, opts || {});
    } catch (err) {
      panelDiv.innerHTML = `<p class="text-red-400">Error al cargar el panel: ${err.message || err}</p>`;
    }
  }

  /**
   * Navega directamente al panel "Mis Productos" y selecciona
   * automáticamente la colección indicada. Si autoOpenForm es true,
   * abre el formulario de creación al instante.
   */
  function navigateToContent(slug, opts) {
    navigate('content', Object.assign({ autoSelectSlug: slug }, opts || {}));
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

  return { init, navigate, navigateToContent, showLogin, showAuth, showToast };
})();

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
