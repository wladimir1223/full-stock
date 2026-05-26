/**
 * app.js — Orquestador principal de Full Stock.
 *
 * Fase 1 — Rediseño UI Core:
 *  · Sidebar izquierdo con secciones agrupadas (Inventario / Configuración / Administración)
 *  · Offcanvas drawer para móvil (CSS class toggle, cero inline handlers)
 *  · Iconos SVG Heroicons en lugar de emojis
 *  · CSP-safe: toda la lógica de eventos vía addEventListener
 */

const App = (() => {
  let PANELS = {};
  let currentPanel = null;

  // ─── SVG icons para items de navegación (Heroicons outline) ──────────────────
  const NAV_ICONS = {
    catalog: `<svg xmlns="http://www.w3.org/2000/svg" class="w-[1.05rem] h-[1.05rem] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>`,
    content: `<svg xmlns="http://www.w3.org/2000/svg" class="w-[1.05rem] h-[1.05rem] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10"/></svg>`,
    settings: `<svg xmlns="http://www.w3.org/2000/svg" class="w-[1.05rem] h-[1.05rem] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`,
    builder: `<svg xmlns="http://www.w3.org/2000/svg" class="w-[1.05rem] h-[1.05rem] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>`,
    monitor: `<svg xmlns="http://www.w3.org/2000/svg" class="w-[1.05rem] h-[1.05rem] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>`,
    apihub:  `<svg xmlns="http://www.w3.org/2000/svg" class="w-[1.05rem] h-[1.05rem] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>`,
  };

  // ─── Agrupación de paneles en secciones de navegación ────────────────────────
  const NAV_SECTIONS = [
    { label: 'Inventario',     keys: ['catalog', 'content']  },
    { label: 'Configuración',  keys: ['settings']             },
    { label: 'Herramientas',   keys: ['builder']              },
    { label: 'Administración', keys: ['monitor', 'apihub']   },
  ];

  // ════════════════════════════════════════════════════════════
  // ROL / DETECCIÓN
  // ════════════════════════════════════════════════════════════

  function isDevMode() {
    return localStorage.getItem('fs_dev_mode') === '1';
  }

  function isSuperAdmin() {
    return Auth.getRole() === 'superadmin';
  }

  function getPanels() {
    const base = {
      catalog:  { label: 'Mis Categorías', module: () => Catalog  },
      content:  { label: 'Mis Productos',  module: () => Content  },
      settings: { label: 'Configuración',  module: () => Settings },
    };
    if (isDevMode()) {
      base.builder = { label: 'Builder', module: () => Builder, devOnly: true };
    }
    if (isSuperAdmin()) {
      base.monitor = { label: 'Monitoreo Global', module: () => SuperAdmin };
      base.apihub  = { label: 'API Hub',          module: () => ApiHub    };
    }
    return base;
  }

  // ════════════════════════════════════════════════════════════
  // INIT
  // ════════════════════════════════════════════════════════════

  function init() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('dev')) {
      params.get('dev') === '1'
        ? localStorage.setItem('fs_dev_mode', '1')
        : localStorage.removeItem('fs_dev_mode');
      history.replaceState(null, '', window.location.pathname);
    }
    Auth.isLoggedIn() ? renderApp() : showAuth('login');
  }

  // ════════════════════════════════════════════════════════════
  // AUTENTICACIÓN (Login + Registro)
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

          <!-- Tabs -->
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

            <!-- Mensaje externo -->
            <div id="auth-ext-msg"
                 class="${externalMsg ? '' : 'hidden'}"
                 style="background:#451a03;border:1px solid #92400e;border-radius:.5rem;
                        color:#fbbf24;font-size:.8rem;padding:.75rem 1rem;margin-bottom:1rem">
              ${externalMsg || ''}
            </div>

            <!-- ── LOGIN ── -->
            <div id="panel-login">
              <h2 style="color:#f1f5f9;font-size:1rem;font-weight:600;margin-bottom:1.25rem">
                Accede a tu panel
              </h2>
              <div style="display:flex;flex-direction:column;gap:.875rem">
                <div>
                  <label style="display:block;font-size:.7rem;font-weight:600;color:#94a3b8;
                                text-transform:uppercase;letter-spacing:.06em;margin-bottom:.35rem">Email</label>
                  <input id="li-email" type="email" placeholder="tu@negocio.com" autocomplete="email"
                    style="width:100%;box-sizing:border-box;background:#0f172a;border:1px solid #334155;
                           border-radius:.5rem;color:#f1f5f9;padding:.55rem .75rem;font-size:.875rem;outline:none"/>
                </div>
                <div>
                  <label style="display:block;font-size:.7rem;font-weight:600;color:#94a3b8;
                                text-transform:uppercase;letter-spacing:.06em;margin-bottom:.35rem">Contraseña</label>
                  <div style="position:relative">
                    <input id="li-pass" type="password" placeholder="••••••••" autocomplete="current-password"
                      style="width:100%;box-sizing:border-box;background:#0f172a;border:1px solid #334155;
                             border-radius:.5rem;color:#f1f5f9;padding:.55rem 2.5rem .55rem .75rem;
                             font-size:.875rem;outline:none"/>
                    <button id="li-toggle" type="button" title="Mostrar / ocultar"
                      style="position:absolute;right:.65rem;top:50%;transform:translateY(-50%);
                             background:none;border:none;cursor:pointer;color:#64748b;padding:.2rem;
                             display:flex;align-items:center;border-radius:.25rem;transition:color .15s">
                      <svg id="li-eye-icon" xmlns="http://www.w3.org/2000/svg"
                           style="width:1rem;height:1rem;display:block;pointer-events:none"
                           fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                        <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              <div id="li-error"
                   style="display:none;background:#450a0a;border:1px solid #991b1b;border-radius:.5rem;
                          color:#f87171;font-size:.8rem;padding:.65rem 1rem;margin-top:.875rem"></div>
              <button id="li-btn"
                style="margin-top:1.25rem;width:100%;background:linear-gradient(135deg,#6366f1,#8b5cf6);
                       color:#fff;font-weight:600;font-size:.875rem;padding:.65rem;border-radius:.5rem;
                       border:none;cursor:pointer;transition:opacity .15s">
                Entrar
              </button>
              <div style="text-align:center;margin-top:.875rem">
                <button id="btn-forgot" type="button"
                  style="background:none;border:none;cursor:pointer;color:#6366f1;font-size:.78rem;
                         font-weight:500;padding:.2rem .4rem;border-radius:.25rem;transition:color .15s">
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            </div>

            <!-- ── REGISTRO ── -->
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
                  <p id="re-slug-preview" style="font-size:.7rem;color:#64748b;margin-top:.3rem;min-height:1rem"></p>
                </div>
                <div>
                  <label style="display:block;font-size:.7rem;font-weight:600;color:#94a3b8;
                                text-transform:uppercase;letter-spacing:.06em;margin-bottom:.35rem">Email</label>
                  <input id="re-email" type="email" placeholder="tu@negocio.com" autocomplete="email"
                    style="width:100%;box-sizing:border-box;background:#0f172a;border:1px solid #334155;
                           border-radius:.5rem;color:#f1f5f9;padding:.55rem .75rem;font-size:.875rem;outline:none"/>
                </div>
                <div>
                  <label style="display:block;font-size:.7rem;font-weight:600;color:#94a3b8;
                                text-transform:uppercase;letter-spacing:.06em;margin-bottom:.35rem">
                    Contraseña <span style="color:#475569;font-weight:400">(mínimo 8 caracteres)</span>
                  </label>
                  <div style="position:relative">
                    <input id="re-pass" type="password" placeholder="••••••••" autocomplete="new-password"
                      style="width:100%;box-sizing:border-box;background:#0f172a;border:1px solid #334155;
                             border-radius:.5rem;color:#f1f5f9;padding:.55rem 2.5rem .55rem .75rem;
                             font-size:.875rem;outline:none"/>
                    <button id="re-toggle1" type="button" title="Mostrar / ocultar"
                      style="position:absolute;right:.65rem;top:50%;transform:translateY(-50%);
                             background:none;border:none;cursor:pointer;color:#64748b;padding:.2rem;
                             display:flex;align-items:center;border-radius:.25rem;transition:color .15s">
                      <svg xmlns="http://www.w3.org/2000/svg" style="width:1rem;height:1rem;display:block;pointer-events:none"
                           fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                        <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                      </svg>
                    </button>
                  </div>
                </div>
                <div>
                  <label style="display:block;font-size:.7rem;font-weight:600;color:#94a3b8;
                                text-transform:uppercase;letter-spacing:.06em;margin-bottom:.35rem">
                    Confirmar contraseña
                  </label>
                  <div style="position:relative">
                    <input id="re-pass2" type="password" placeholder="••••••••" autocomplete="new-password"
                      style="width:100%;box-sizing:border-box;background:#0f172a;border:1px solid #334155;
                             border-radius:.5rem;color:#f1f5f9;padding:.55rem 2.5rem .55rem .75rem;
                             font-size:.875rem;outline:none"/>
                    <button id="re-toggle2" type="button" title="Mostrar / ocultar"
                      style="position:absolute;right:.65rem;top:50%;transform:translateY(-50%);
                             background:none;border:none;cursor:pointer;color:#64748b;padding:.2rem;
                             display:flex;align-items:center;border-radius:.25rem;transition:color .15s">
                      <svg xmlns="http://www.w3.org/2000/svg" style="width:1rem;height:1rem;display:block;pointer-events:none"
                           fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              <div id="re-error"
                   style="display:none;background:#450a0a;border:1px solid #991b1b;border-radius:.5rem;
                          color:#f87171;font-size:.8rem;padding:.65rem 1rem;margin-top:.875rem"></div>
              <button id="re-btn"
                style="margin-top:1.25rem;width:100%;background:linear-gradient(135deg,#059669,#0d9488);
                       color:#fff;font-weight:600;font-size:.875rem;padding:.65rem;border-radius:.5rem;
                       border:none;cursor:pointer;transition:opacity .15s">
                Crear cuenta gratis
              </button>
              <p style="font-size:.7rem;color:#475569;margin-top:.875rem;text-align:center">
                Al registrarte se crea tu espacio aislado en el CMS.<br>Datos 100% privados.
              </p>
            </div>

          </div>
        </div>
      </div>

      <!-- Modal: Recuperar contraseña -->
      <div id="modal-forgot"
           style="display:none;position:fixed;inset:0;z-index:9999;
                  align-items:center;justify-content:center;padding:1rem">
        <div id="modal-forgot-bd"
             style="position:absolute;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(4px)"></div>
        <div style="position:relative;width:100%;max-width:400px;
                    background:#1e293b;border:1px solid #334155;
                    border-radius:1rem;padding:2rem;z-index:1;animation:fadeIn .2s ease-out">
          <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.5rem">
            <div style="width:2.5rem;height:2.5rem;border-radius:.625rem;flex-shrink:0;
                        background:linear-gradient(135deg,#6366f1,#8b5cf6);
                        display:flex;align-items:center;justify-content:center">
              <svg xmlns="http://www.w3.org/2000/svg" style="width:1.25rem;height:1.25rem"
                   fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round"
                      d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
              </svg>
            </div>
            <div>
              <h3 style="color:#f1f5f9;font-size:1rem;font-weight:700;margin:0 0 .2rem">Recuperar contraseña</h3>
              <p style="color:#64748b;font-size:.75rem;margin:0">Te enviaremos las instrucciones por email.</p>
            </div>
          </div>
          <label style="display:block;font-size:.7rem;font-weight:600;color:#94a3b8;
                         text-transform:uppercase;letter-spacing:.06em;margin-bottom:.35rem">
            Correo electrónico
          </label>
          <input id="forgot-email" type="email" placeholder="tu@negocio.com" autocomplete="email"
            style="width:100%;box-sizing:border-box;background:#0f172a;border:1px solid #334155;
                   border-radius:.5rem;color:#f1f5f9;padding:.6rem .75rem;font-size:.875rem;
                   outline:none;transition:border-color .15s"/>
          <div id="forgot-error"
               style="display:none;background:#450a0a;border:1px solid #991b1b;
                      border-radius:.5rem;color:#f87171;font-size:.8rem;
                      padding:.65rem 1rem;margin-top:.75rem"></div>
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

    // ── Tabs ──────────────────────────────────────────────────────────────────
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

    // ── Login ─────────────────────────────────────────────────────────────────
    const liEmail  = wrap.querySelector('#li-email');
    const liPass   = wrap.querySelector('#li-pass');
    const liBtn    = wrap.querySelector('#li-btn');
    const liError  = wrap.querySelector('#li-error');
    const liToggle = wrap.querySelector('#li-toggle');

    const SVG_EYE_OPEN =
      '<svg xmlns="http://www.w3.org/2000/svg" style="width:1rem;height:1rem;display:block;pointer-events:none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">' +
      '<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>' +
      '<path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>';
    const SVG_EYE_SLASH =
      '<svg xmlns="http://www.w3.org/2000/svg" style="width:1rem;height:1rem;display:block;pointer-events:none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">' +
      '<path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>';

    function togglePassInput(inputEl, btnEl) {
      const show   = inputEl.type === 'password';
      inputEl.type = show ? 'text' : 'password';
      btnEl.innerHTML = show ? SVG_EYE_SLASH : SVG_EYE_OPEN;
    }

    liToggle.addEventListener('click',     () => togglePassInput(liPass, liToggle));
    liToggle.addEventListener('mouseover', () => { liToggle.style.color = '#94a3b8'; });
    liToggle.addEventListener('mouseout',  () => { liToggle.style.color = '#64748b'; });
    [liEmail, liPass].forEach(el => {
      el.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    });
    liBtn.addEventListener('click', doLogin);
    if (defaultTab === 'login') liEmail.focus();

    async function doLogin() {
      const email = liEmail.value.trim();
      const pass  = liPass.value;
      if (!email || !pass) {
        liError.textContent   = 'Completa email y contraseña.';
        liError.style.display = '';
        return;
      }
      liError.style.display = 'none';
      liBtn.disabled    = true;
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
        liBtn.textContent = 'Entrar';
      }
    }

    // ── Registro ──────────────────────────────────────────────────────────────
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

    reName.addEventListener('input', () => {
      const slug = reName.value
        .toLowerCase().trim()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').slice(0, 40);
      reSlug.textContent = slug ? `Tu API pública: /api/v1/${slug}/collections/...` : '';
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
      reBtn.textContent = 'Creando cuenta…';
      try {
        const res = await API.auth.register(name, email, pass);
        Auth.setToken(res.token);
        showToast(`Bienvenido, ${res.user.name}. Tu espacio está listo.`, 'success');
        renderApp();
      } catch (err) {
        reError.textContent   = (err && err.message) ? err.message : 'Error al crear la cuenta.';
        reError.style.display = '';
        reBtn.disabled    = false;
        reBtn.textContent = 'Crear cuenta gratis';
      }
    }

    // ── Recuperar contraseña ──────────────────────────────────────────────────
    const modalForgot  = wrap.querySelector('#modal-forgot');
    const forgotEmail  = wrap.querySelector('#forgot-email');
    const forgotError  = wrap.querySelector('#forgot-error');
    const forgotSubmit = wrap.querySelector('#forgot-submit');
    const forgotCancel = wrap.querySelector('#forgot-cancel');
    const forgotBd     = wrap.querySelector('#modal-forgot-bd');
    const btnForgot    = wrap.querySelector('#btn-forgot');

    btnForgot.addEventListener('mouseover', () => { btnForgot.style.color = '#818cf8'; });
    btnForgot.addEventListener('mouseout',  () => { btnForgot.style.color = '#6366f1'; });
    btnForgot.addEventListener('click', () => {
      forgotEmail.value         = liEmail.value.trim();
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
        forgotError.textContent   = 'Introduce tu correo electrónico.';
        forgotError.style.display = '';
        forgotEmail.focus();
        return;
      }
      forgotError.style.display = 'none';
      forgotSubmit.disabled     = true;
      forgotSubmit.textContent  = 'Enviando…';
      try { await API.auth.recover(email); } catch (_) { /* siempre mostramos éxito */ }
      cerrarForgot();
      showToast('Si el correo está registrado, recibirás las instrucciones en breve.', 'success');
      forgotSubmit.disabled    = false;
      forgotSubmit.textContent = 'Recuperar contraseña';
    });
  }

  function showLogin(msg) { showAuth('login', msg); }

  // ════════════════════════════════════════════════════════════
  // HELPERS: Sidebar / Drawer HTML
  // ════════════════════════════════════════════════════════════

  /** Genera el HTML de las secciones de navegación (sidebar y drawer comparten el mismo markup). */
  function buildSidebarNav() {
    return NAV_SECTIONS
      .map(sec => {
        const available = sec.keys.filter(k => PANELS[k]);
        if (!available.length) return '';
        return `
          <div>
            <span class="nav-section-label">${sec.label}</span>
            <div class="space-y-0.5">
              ${available.map(k => `
                <button class="nav-tab w-full flex items-center gap-2.5 px-3 py-2
                               rounded-lg text-[0.8125rem] font-medium text-slate-400
                               hover:bg-slate-800 hover:text-slate-200 transition-colors
                               ${PANELS[k].devOnly ? 'border border-orange-900/30' : ''}"
                        data-panel="${k}">
                  ${NAV_ICONS[k] || ''}
                  ${PANELS[k].label}
                </button>
              `).join('')}
            </div>
          </div>`;
      })
      .join('');
  }

  /** Link "Ver mi tienda" en la parte baja del sidebar. */
  function buildSidebarFooter() {
    const slug = Auth.getTenantSlug();
    if (!slug) return '';
    return `
      <div class="px-3 py-3 border-t border-slate-800/60 shrink-0">
        <a href="/tienda/${escHtml(slug)}" target="_blank" rel="noopener"
           class="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium
                  text-slate-500 hover:text-indigo-400 hover:bg-slate-800/60 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 shrink-0"
               fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
          </svg>
          Ver mi tienda
        </a>
      </div>`;
  }

  // ════════════════════════════════════════════════════════════
  // LAYOUT PRINCIPAL (post-login)
  // ════════════════════════════════════════════════════════════

  function renderApp() {
    PANELS = getPanels();

    const tenantName = Auth.getName()       || 'Mi cuenta';
    const tenantSlug = Auth.getTenantSlug() || '';
    const initials   = tenantName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

    document.body.innerHTML = `
      <!-- Toast container -->
      <div id="toast-container"
           style="position:fixed;top:1.25rem;right:1.25rem;z-index:9999;
                  display:flex;flex-direction:column;gap:.5rem;pointer-events:none"></div>

      <div class="h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden">

        <!-- ══ Header ══════════════════════════════════════════════════════════ -->
        <header class="h-14 bg-slate-900 border-b border-slate-800 px-4
                        flex items-center gap-3 shrink-0 z-30">

          <!-- Hamburger (solo en móvil) -->
          <button id="nav-menu-btn"
                  class="lg:hidden p-2 rounded-lg text-slate-400
                         hover:text-slate-200 hover:bg-slate-800 transition"
                  title="Abrir menú">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none"
                 viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
          </button>

          <!-- Logo -->
          <div class="flex items-center gap-2.5 shrink-0">
            <div class="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600
                        flex items-center justify-center shadow-lg shadow-indigo-900/30">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-white" fill="none"
                   viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10"/>
              </svg>
            </div>
            <span class="text-[0.9375rem] font-bold tracking-tight hidden sm:inline">
              <span class="text-white">Full</span><span class="text-indigo-400">Stock</span>
            </span>
          </div>

          <div class="flex-1"></div>

          <!-- Acciones derecha -->
          <div class="flex items-center gap-1.5">

            <!-- User pill -->
            <div class="hidden sm:flex items-center gap-2 bg-slate-800/70 border border-slate-700/50
                        rounded-full pl-1.5 pr-3 py-1">
              <div class="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600
                          flex items-center justify-center text-white font-bold shrink-0"
                   style="font-size:.6rem">${initials}</div>
              <div class="leading-tight">
                <p class="text-[0.75rem] font-semibold text-slate-200">${escHtml(tenantName)}</p>
                ${tenantSlug
                  ? `<p class="text-indigo-400" style="font-size:.65rem">@${escHtml(tenantSlug)}</p>`
                  : ''}
              </div>
            </div>

            <!-- Soporte -->
            <button id="support-btn"
                    class="p-2 rounded-lg text-slate-400 hover:text-slate-200
                           hover:bg-slate-800 transition" title="Ayuda y soporte">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-[1.125rem] h-[1.125rem]"
                   fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172
                     L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0
                     9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"/>
              </svg>
            </button>

            <!-- Cerrar sesión -->
            <button id="logout-btn"
                    class="p-2 rounded-lg text-slate-400 hover:text-red-400
                           hover:bg-slate-800/60 transition" title="Cerrar sesión">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-[1.125rem] h-[1.125rem]"
                   fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7
                     a2 2 0 012-2h6a2 2 0 012 2v1"/>
              </svg>
            </button>

          </div>
        </header>

        <!-- ══ Body ════════════════════════════════════════════════════════════ -->
        <div class="flex flex-1 overflow-hidden">

          <!-- Sidebar desktop (visible en lg+) -->
          <aside class="hidden lg:flex flex-col w-56 bg-slate-900 border-r border-slate-800 shrink-0">
            <nav class="flex-1 overflow-y-auto py-5 px-3 space-y-5">
              ${buildSidebarNav()}
            </nav>
            ${buildSidebarFooter()}
          </aside>

          <!-- Overlay móvil -->
          <div id="nav-overlay"
               class="nav-overlay fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"></div>

          <!-- Drawer móvil (offcanvas desde la izquierda) -->
          <aside id="nav-drawer"
                 class="nav-drawer-panel fixed top-0 left-0 h-full w-64 bg-slate-900
                        border-r border-slate-800 z-50 flex flex-col lg:hidden">
            <!-- Cabecera del drawer -->
            <div class="h-14 flex items-center gap-3 px-4 border-b border-slate-800 shrink-0">
              <div class="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600
                          flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-white" fill="none"
                     viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round"
                    d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10"/>
                </svg>
              </div>
              <span class="font-bold text-[0.9375rem]">
                <span class="text-white">Full</span><span class="text-indigo-400">Stock</span>
              </span>
              <div class="flex-1"></div>
              <button id="nav-close-btn"
                      class="p-1.5 rounded-lg text-slate-500 hover:text-slate-300
                             hover:bg-slate-800 transition" title="Cerrar menú">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none"
                     viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <!-- Mismas secciones de nav que el sidebar -->
            <nav class="flex-1 overflow-y-auto py-5 px-3 space-y-5">
              ${buildSidebarNav()}
            </nav>
            ${buildSidebarFooter()}
          </aside>

          <!-- Contenido principal -->
          <main class="flex-1 overflow-y-auto bg-slate-950">
            <div class="px-5 py-7 max-w-6xl mx-auto">
              <div id="panel-content" data-panel="active"></div>
            </div>
          </main>

        </div>

        <!-- ══ Footer ══════════════════════════════════════════════════════════ -->
        <footer class="h-9 bg-slate-900 border-t border-slate-800 px-5
                        flex items-center justify-between shrink-0">
          <span class="flex items-center gap-2 text-xs text-slate-600">
            Full Stock v2.0
            ${isDevMode()
              ? `<span style="color:#fb923c;border:1px solid rgba(251,146,60,.2);border-radius:.25rem;
                              padding:.1rem .4rem;font-size:.65rem;font-weight:600"
                       title="Para desactivar: ?dev=0">Dev</span>`
              : ''}
            ${isSuperAdmin()
              ? `<span style="color:#a78bfa;border:1px solid rgba(167,139,250,.2);border-radius:.25rem;
                              padding:.1rem .4rem;font-size:.65rem;font-weight:600">SuperAdmin</span>`
              : ''}
          </span>
          ${tenantSlug
            ? `<code class="text-xs text-slate-700">/api/v1/${escHtml(tenantSlug)}/...</code>`
            : ''}
        </footer>

      </div>

      <!-- ══ Modal: Soporte técnico ═══════════════════════════════════════════ -->
      <div id="modal-support"
           style="display:none;position:fixed;inset:0;z-index:9999;
                  align-items:center;justify-content:center;padding:1rem">
        <div id="support-backdrop"
             style="position:absolute;inset:0;background:rgba(0,0,0,.75);
                    backdrop-filter:blur(4px)"></div>
        <div style="position:relative;width:100%;max-width:420px;
                    background:#1e293b;border:1px solid #334155;
                    border-radius:1rem;padding:2rem;z-index:1;animation:fadeIn .2s ease-out">
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
              <h3 style="color:#f1f5f9;font-size:1.1rem;font-weight:700;margin:0 0 .3rem;line-height:1.2">
                Soporte técnico
              </h3>
              <p style="color:#64748b;font-size:.8rem;margin:0;line-height:1.5">
                El equipo de <strong style="color:#94a3b8">Mascotizaciones</strong>
                está disponible para ayudarte.
              </p>
            </div>
          </div>
          <div style="border-top:1px solid #334155;margin-bottom:1.25rem"></div>
          <div style="background:#0f172a;border:1px solid #334155;border-radius:.625rem;
                      padding:1rem;margin-bottom:1.25rem">
            <p style="color:#64748b;font-size:.72rem;font-weight:600;
                       text-transform:uppercase;letter-spacing:.06em;margin:0 0 .5rem">
              Correo de soporte
            </p>
            <p style="color:#a5b4fc;font-size:.875rem;font-weight:500;margin:0 0 .25rem">
              agencia.mascotizaciones@gmail.com
            </p>
            <p style="color:#475569;font-size:.72rem;margin:0">
              Tiempo de respuesta habitual: mismo día hábil
            </p>
          </div>
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
              Enviar correo
            </a>
            <button id="support-close"
              style="padding:.7rem;background:#0f172a;color:#94a3b8;font-weight:500;
                     font-size:.875rem;border-radius:.5rem;border:1px solid #334155;
                     cursor:pointer;transition:background .15s">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    `;

    bindAppEvents();
    navigate('catalog');
  }

  // ════════════════════════════════════════════════════════════
  // DRAWER — Abrir / cerrar (CSS class toggle, CSP-safe)
  // ════════════════════════════════════════════════════════════

  function openNavDrawer() {
    const drawer  = document.getElementById('nav-drawer');
    const overlay = document.getElementById('nav-overlay');
    if (drawer)  drawer.classList.add('is-open');
    if (overlay) overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function closeNavDrawer() {
    const drawer  = document.getElementById('nav-drawer');
    const overlay = document.getElementById('nav-overlay');
    if (drawer)  drawer.classList.remove('is-open');
    if (overlay) overlay.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  // ════════════════════════════════════════════════════════════
  // BIND DE EVENTOS — sin un solo inline handler
  // ════════════════════════════════════════════════════════════

  function bindAppEvents() {
    // Nav items (sidebar + drawer — misma clase .nav-tab en ambos)
    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        navigate(btn.dataset.panel);
        closeNavDrawer();   // cerrar drawer tras navegar en móvil
      });
    });

    // Hamburgesa (abrir drawer)
    document.getElementById('nav-menu-btn').addEventListener('click', openNavDrawer);

    // Botón X del drawer
    document.getElementById('nav-close-btn').addEventListener('click', closeNavDrawer);

    // Overlay (cerrar al hacer clic fuera)
    document.getElementById('nav-overlay').addEventListener('click', closeNavDrawer);

    // Logout
    document.getElementById('logout-btn').addEventListener('click', () => {
      API.auth.logout();
      Auth.clear();
      showAuth('login');
      showToast('Sesión cerrada.', 'info');
    });

    // Modal de soporte
    const modalSupport     = document.getElementById('modal-support');
    const supportBackdrop  = document.getElementById('support-backdrop');
    const supportClose     = document.getElementById('support-close');
    const supportEmailLink = document.getElementById('support-email-link');

    document.getElementById('support-btn').addEventListener('click', () => {
      modalSupport.style.display = 'flex';
    });

    function cerrarSupport() { modalSupport.style.display = 'none'; }
    supportClose.addEventListener('click', cerrarSupport);
    supportBackdrop.addEventListener('click', cerrarSupport);

    if (supportEmailLink) {
      supportEmailLink.addEventListener('mouseover', () => { supportEmailLink.style.opacity = '.88'; });
      supportEmailLink.addEventListener('mouseout',  () => { supportEmailLink.style.opacity = '1'; });
    }
    supportClose.addEventListener('mouseover', () => { supportClose.style.background = '#1e293b'; });
    supportClose.addEventListener('mouseout',  () => { supportClose.style.background = '#0f172a'; });

    // Escape global: cierra drawer y modal de soporte
    document.addEventListener('keydown', function appEsc(e) {
      if (e.key === 'Escape') {
        closeNavDrawer();
        if (modalSupport && modalSupport.style.display === 'flex') cerrarSupport();
      }
    });
  }

  // ════════════════════════════════════════════════════════════
  // NAVEGACIÓN
  // ════════════════════════════════════════════════════════════

  async function navigate(panelKey, opts) {
    if (!PANELS[panelKey]) return;
    currentPanel = panelKey;

    // Actualizar estado activo en TODOS los .nav-tab (sidebar + drawer)
    document.querySelectorAll('.nav-tab').forEach(btn => {
      const active = btn.dataset.panel === panelKey;
      if (active) {
        btn.classList.add('nav-tab-active');
      } else {
        btn.classList.remove('nav-tab-active');
      }
    });

    const panelDiv = document.getElementById('panel-content');
    panelDiv.innerHTML = `
      <div class="flex items-center gap-2.5 text-slate-500 text-sm py-8">
        <div style="width:1rem;height:1rem;border:2px solid #6366f1;
                    border-top-color:transparent;border-radius:50%;
                    animation:spin .7s linear infinite"></div>
        Cargando…
      </div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    `;

    try {
      await PANELS[panelKey].module().render(panelDiv, opts || {});
    } catch (err) {
      panelDiv.innerHTML =
        `<p class="text-red-400 py-8">Error al cargar el panel: ${err.message || err}</p>`;
    }
  }

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
      'padding:.75rem 1rem;border-radius:.75rem;border:1px solid;' +
      'box-shadow:0 10px 25px rgba(0,0,0,.4);font-size:.875rem;color:#fff;' +
      'animation:fadeIn .2s ease;' + (colors[type] || colors.info);
    toast.innerHTML =
      `<span style="font-weight:700">${icons[type] || 'i'}</span>` +
      `<span>${escHtml(message)}</span>`;

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
