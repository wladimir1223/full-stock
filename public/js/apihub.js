/**
 * apihub.js — Panel "API Hub / Integraciones" del SuperAdmin.
 *
 * Vista organizada en 3 carpetas colapsables (CSS class toggle, CSP-safe):
 *   📁 Credenciales de Conexión  — slug + URL pública por tenant
 *   📁 Scripts de Inserción Web  — snippet JS autogenerado por tenant
 *   📁 Documentación de Endpoints — tabla de endpoints + tester en vivo
 *
 * Solo visible para role === 'superadmin'.
 */

const ApiHub = (() => {

  const BASE_URL = window.location.origin;

  // Cache de tenants (carga única, compartida entre carpetas 1 y 2)
  let _tenantsCache = null;

  // ─── Endpoints documentados ───────────────────────────────────────────────
  const ENDPOINTS = [
    {
      method: 'GET',
      path:   '/api/v1/public/tenants/{slug}/products',
      desc:   'Catálogo completo con stock disponible. CORS abierto — consumible desde cualquier dominio.',
      auth:   false,
    },
    {
      method: 'GET',
      path:   '/api/v1/store/{slug}/products',
      desc:   'Catálogo agrupado por colección. Usado por la tienda pública interna (/tienda/{slug}).',
      auth:   false,
    },
    {
      method: 'POST',
      path:   '/api/v1/store/{slug}/checkout',
      desc:   'Descuenta stock atómicamente y registra el pedido. Límite: 5 compras / IP / 10 min.',
      auth:   false,
    },
  ];

  const METHOD_COLORS = {
    GET:    { bg: '#042f2e', border: '#065f46', color: '#34d399' },
    POST:   { bg: '#0c2a4a', border: '#1e40af', color: '#93c5fd' },
    PUT:    { bg: '#1c1917', border: '#92400e', color: '#fde68a' },
    DELETE: { bg: '#450a0a', border: '#7f1d1d', color: '#f87171' },
  };

  // ════════════════════════════════════════════════════════════
  // RENDER PRINCIPAL
  // ════════════════════════════════════════════════════════════

  async function render(container) {
    const slug = Auth.getTenantSlug() || 'mi-tienda';

    container.innerHTML = `
      <div class="animate-fade-in" style="max-width:960px;margin:0 auto">

        <!-- ── Cabecera ───────────────────────────────────────────────── -->
        <div style="margin-bottom:2rem">
          <h1 style="font-size:1.375rem;font-weight:700;color:#f1f5f9;margin:0 0 .3rem;
                     display:flex;align-items:center;gap:.625rem">
            <svg xmlns="http://www.w3.org/2000/svg"
                 style="width:1.25rem;height:1.25rem;color:#6366f1;flex-shrink:0"
                 fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
              <path stroke-linecap="round" stroke-linejoin="round"
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656
                   l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
            </svg>
            API Hub
            <span style="color:#6366f1">/ Integraciones</span>
          </h1>
          <p style="color:#64748b;font-size:.85rem;margin:0">
            Credenciales, scripts y documentación para conectar sitios externos al inventario.
          </p>
        </div>

        <!-- ── Banner CORS ────────────────────────────────────────────── -->
        <div style="background:#0f172a;border:1px solid #1e293b;border-left:3px solid #6366f1;
                    border-radius:.625rem;padding:.875rem 1.25rem;margin-bottom:1.75rem;
                    display:flex;gap:.875rem;align-items:flex-start">
          <svg xmlns="http://www.w3.org/2000/svg"
               style="width:1rem;height:1rem;color:#6366f1;flex-shrink:0;margin-top:.15rem"
               fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <p style="color:#94a3b8;font-size:.82rem;margin:0;line-height:1.6">
            Los endpoints públicos tienen <strong style="color:#e2e8f0">CORS completamente abierto</strong>
            (<code style="color:#6366f1;font-size:.78rem">Access-Control-Allow-Origin: *</code>).
            Cualquier dominio externo puede consumirlos directamente con
            <code style="color:#a5b4fc">fetch()</code> sin proxy ni configuración adicional.
          </p>
        </div>

        <!-- ════════════════════════════════════════════════════════ -->
        <!-- CARPETA 1 — Credenciales de Conexión                    -->
        <!-- ════════════════════════════════════════════════════════ -->
        <div style="margin-bottom:1rem">
          ${folderHeader('credentials', `
            <svg xmlns="http://www.w3.org/2000/svg" style="width:1rem;height:1rem;flex-shrink:0;color:#f59e0b"
                 fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
              <path stroke-linecap="round" stroke-linejoin="round"
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586
                   a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
            </svg>
            Credenciales de Conexión
          `, true)}
          <div class="hub-folder-body is-open" data-folder-body="credentials">
            <div style="background:#1e293b;border:1px solid #334155;
                        border-radius:0 0 .75rem .75rem;overflow:hidden">
              <div id="hub-creds-wrap">
                ${folderLoading()}
              </div>
            </div>
          </div>
        </div>

        <!-- ════════════════════════════════════════════════════════ -->
        <!-- CARPETA 2 — Scripts de Inserción Web                    -->
        <!-- ════════════════════════════════════════════════════════ -->
        <div style="margin-bottom:1rem">
          ${folderHeader('scripts', `
            <svg xmlns="http://www.w3.org/2000/svg" style="width:1rem;height:1rem;flex-shrink:0;color:#34d399"
                 fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
              <path stroke-linecap="round" stroke-linejoin="round"
                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>
            </svg>
            Scripts de Inserción Web
          `, true)}
          <div class="hub-folder-body is-open" data-folder-body="scripts">
            <div style="background:#1e293b;border:1px solid #334155;
                        border-radius:0 0 .75rem .75rem;overflow:hidden">
              <div id="hub-scripts-wrap">
                ${folderLoading()}
              </div>
            </div>
          </div>
        </div>

        <!-- ════════════════════════════════════════════════════════ -->
        <!-- CARPETA 3 — Documentación de Endpoints                  -->
        <!-- ════════════════════════════════════════════════════════ -->
        <div style="margin-bottom:1rem">
          ${folderHeader('docs', `
            <svg xmlns="http://www.w3.org/2000/svg" style="width:1rem;height:1rem;flex-shrink:0;color:#a5b4fc"
                 fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
              <path stroke-linecap="round" stroke-linejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293
                   l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            Documentación de Endpoints
          `, false)}
          <div class="hub-folder-body" data-folder-body="docs">
            <div style="background:#1e293b;border:1px solid #334155;
                        border-radius:0 0 .75rem .75rem;overflow:hidden;padding:1.5rem">
              ${buildDocsContent(slug)}
            </div>
          </div>
        </div>

        <!-- Estilos locales CSP-safe -->
        <style>
          .hub-ep-row { transition: background .12s; }
          .hub-ep-row:hover { background: #162032; }
          .hub-cred-row:hover { background: #162032; }
          @keyframes spin { to { transform: rotate(360deg); } }
        </style>

      </div>
    `;

    bindFolderEvents(container);
    bindDocsEvents(container, slug);

    // Cargar datos de tenants para carpetas 1 y 2
    loadTenantData(container);
  }

  // ════════════════════════════════════════════════════════════
  // CARGA DE TENANTS (lazy, con caché)
  // ════════════════════════════════════════════════════════════

  async function loadTenantData(container) {
    try {
      if (!_tenantsCache) {
        const res = await API.superadmin.tenants();
        _tenantsCache = res.data || [];
      }
      renderCredentials(container, _tenantsCache);
      renderScripts(container, _tenantsCache);
    } catch (err) {
      const errHtml = `<div style="padding:1.25rem;color:#f87171;font-size:.82rem">
        Error al cargar tenants: ${escHtml((err && err.message) || String(err))}
      </div>`;
      const credsWrap   = container.querySelector('#hub-creds-wrap');
      const scriptsWrap = container.querySelector('#hub-scripts-wrap');
      if (credsWrap)   credsWrap.innerHTML   = errHtml;
      if (scriptsWrap) scriptsWrap.innerHTML = errHtml;
    }
  }

  // ════════════════════════════════════════════════════════════
  // CARPETA 1 — Credenciales de Conexión
  // ════════════════════════════════════════════════════════════

  function renderCredentials(container, tenants) {
    const wrap = container.querySelector('#hub-creds-wrap');
    if (!wrap) return;

    if (tenants.length === 0) {
      wrap.innerHTML = `<div style="padding:1.25rem;color:#475569;font-size:.82rem;text-align:center">
        No hay tenants registrados aún.
      </div>`;
      return;
    }

    const rows = tenants.map(t => {
      const apiUrl = `${BASE_URL}/api/v1/public/tenants/${t.slug}/products`;
      return `
      <tr class="hub-cred-row" style="border-bottom:1px solid #1e293b;transition:background .1s"
          data-cred-url="${escHtml(apiUrl)}" data-cred-slug="${escHtml(t.slug || '')}">
        <td style="padding:.65rem 1rem;min-width:170px">
          <span style="color:#e2e8f0;font-size:.82rem;font-weight:500">
            ${escHtml(t.name || '—')}
          </span><br>
          <code style="color:#6366f1;font-size:.68rem">@${escHtml(t.slug || '—')}</code>
        </td>
        <td style="padding:.65rem 1rem">
          <code style="color:#a5b4fc;font-size:.72rem;word-break:break-all">
            ${escHtml(apiUrl)}
          </code>
        </td>
        <td style="padding:.65rem 1rem;white-space:nowrap;text-align:right">
          <button class="hub-copy-url"
            data-url="${escHtml(apiUrl)}"
            style="background:transparent;border:1px solid #334155;border-radius:.375rem;
                   color:#64748b;font-size:.7rem;font-weight:600;padding:.25rem .6rem;
                   cursor:pointer;transition:all .15s;display:inline-flex;
                   align-items:center;gap:.35rem">
            ${copyIcon()}
            Copiar URL
          </button>
        </td>
      </tr>`;
    }).join('');

    wrap.innerHTML = `
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#0f172a;border-bottom:1px solid #334155">
              ${th('Tienda')}
              ${th('Endpoint público')}
              <th style="padding:.55rem 1rem;font-size:.68rem;font-weight:600;
                          color:#475569;text-transform:uppercase;letter-spacing:.07em;
                          text-align:right"></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;

    // Bind copy buttons (CSP-safe)
    wrap.querySelectorAll('.hub-copy-url').forEach(btn => {
      btn.addEventListener('mouseover', () => {
        btn.style.background  = '#1e293b';
        btn.style.borderColor = '#6366f1';
        btn.style.color       = '#a5b4fc';
      });
      btn.addEventListener('mouseout', () => {
        btn.style.background  = 'transparent';
        btn.style.borderColor = '#334155';
        btn.style.color       = '#64748b';
      });
      btn.addEventListener('click', () => {
        const url = btn.dataset.url;
        navigator.clipboard.writeText(url).then(() => {
          const prev = btn.innerHTML;
          btn.innerHTML = checkIcon() + ' Copiado';
          setTimeout(() => { btn.innerHTML = prev; }, 2000);
        });
      });
    });
  }

  // ════════════════════════════════════════════════════════════
  // CARPETA 2 — Scripts de Inserción Web
  // ════════════════════════════════════════════════════════════

  function renderScripts(container, tenants) {
    const wrap = container.querySelector('#hub-scripts-wrap');
    if (!wrap) return;

    if (tenants.length === 0) {
      wrap.innerHTML = `<div style="padding:1.25rem;color:#475569;font-size:.82rem;text-align:center">
        No hay tenants registrados aún.
      </div>`;
      return;
    }

    const items = tenants.map((t, i) => {
      const snippet = generateEmbedSnippet(t.slug, t.name);
      return `
      <div style="border-bottom:1px solid #1e293b">
        <!-- Cabecera del tenant (colapsable) -->
        <button class="hub-script-toggle w-full"
                data-script-idx="${i}"
                style="width:100%;display:flex;align-items:center;gap:.75rem;
                       padding:.875rem 1.25rem;background:transparent;border:none;
                       cursor:pointer;text-align:left;transition:background .12s">
          <div style="width:1.75rem;height:1.75rem;border-radius:.375rem;flex-shrink:0;
                      background:linear-gradient(135deg,#059669,#0d9488);
                      display:flex;align-items:center;justify-content:center">
            <svg xmlns="http://www.w3.org/2000/svg" style="width:.875rem;height:.875rem;color:#fff"
                 fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round"
                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>
            </svg>
          </div>
          <div style="flex:1;min-width:0">
            <p style="color:#e2e8f0;font-size:.82rem;font-weight:600;margin:0">
              ${escHtml(t.name || '—')}
            </p>
            <code style="color:#6366f1;font-size:.68rem">@${escHtml(t.slug || '—')}</code>
          </div>
          <svg data-script-arrow="${i}"
               xmlns="http://www.w3.org/2000/svg"
               style="width:.9rem;height:.9rem;color:#475569;flex-shrink:0;
                      transition:transform .2s ease"
               fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
          </svg>
        </button>

        <!-- Snippet colapsable -->
        <div class="hub-script-body"
             data-script-body="${i}"
             style="max-height:0;overflow:hidden;transition:max-height .3s cubic-bezier(.4,0,.2,1)">
          <div style="padding:0 1.25rem 1.25rem">

            <!-- Info rápida -->
            <div style="background:#0f172a;border:1px solid #1e293b;border-radius:.5rem;
                        padding:.75rem 1rem;margin-bottom:.875rem;font-size:.75rem;
                        color:#64748b;line-height:1.6">
              <strong style="color:#94a3b8">Instrucciones:</strong>
              añade el contenedor HTML donde quieras mostrar el catálogo,
              luego pega el script antes del cierre del <code style="color:#6366f1">&lt;/body&gt;</code>.
            </div>

            <!-- Bloque de código -->
            <div style="background:#0a0f1e;border:1px solid #1e293b;border-radius:.5rem;
                        overflow:hidden">
              <div style="display:flex;align-items:center;justify-content:space-between;
                          padding:.5rem .875rem;background:#0f172a;border-bottom:1px solid #1e293b">
                <span style="display:flex;align-items:center;gap:.4rem">
                  <span style="width:.45rem;height:.45rem;border-radius:50%;background:#ef4444;display:inline-block"></span>
                  <span style="width:.45rem;height:.45rem;border-radius:50%;background:#f59e0b;display:inline-block"></span>
                  <span style="width:.45rem;height:.45rem;border-radius:50%;background:#22c55e;display:inline-block"></span>
                  <code style="color:#475569;font-size:.68rem;margin-left:.3rem">
                    embed-${escHtml(t.slug || 'tienda')}.html
                  </code>
                </span>
                <button class="hub-copy-snippet"
                  data-snippet="${escHtml(snippet)}"
                  style="background:transparent;border:1px solid #334155;border-radius:.35rem;
                         color:#64748b;font-size:.68rem;font-weight:600;
                         padding:.2rem .55rem;cursor:pointer;transition:all .15s;
                         display:inline-flex;align-items:center;gap:.3rem">
                  ${copyIcon()}
                  Copiar
                </button>
              </div>
              <pre style="margin:0;padding:1rem;font-size:.72rem;line-height:1.7;
                          overflow-x:auto;color:#94a3b8;
                          font-family:'Courier New',monospace;background:transparent">${highlightEmbed(snippet)}</pre>
            </div>

          </div>
        </div>
      </div>`;
    }).join('');

    wrap.innerHTML = items;

    // ── Bind: toggle snippets (CSP-safe) ────────────────────────────────────
    wrap.querySelectorAll('.hub-script-toggle').forEach(btn => {
      btn.addEventListener('mouseover', () => { btn.style.background = '#162032'; });
      btn.addEventListener('mouseout',  () => { btn.style.background = 'transparent'; });
      btn.addEventListener('click', () => {
        const idx   = btn.dataset.scriptIdx;
        const body  = wrap.querySelector(`[data-script-body="${idx}"]`);
        const arrow = wrap.querySelector(`[data-script-arrow="${idx}"]`);
        if (!body) return;

        const isOpen = body.style.maxHeight && body.style.maxHeight !== '0px';
        body.style.maxHeight = isOpen ? '0px' : '800px';
        if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(180deg)';
      });
    });

    // ── Bind: copy snippet buttons (CSP-safe) ───────────────────────────────
    wrap.querySelectorAll('.hub-copy-snippet').forEach(btn => {
      btn.addEventListener('mouseover', () => {
        btn.style.background  = '#1e293b';
        btn.style.borderColor = '#6366f1';
        btn.style.color       = '#a5b4fc';
      });
      btn.addEventListener('mouseout', () => {
        btn.style.background  = 'transparent';
        btn.style.borderColor = '#334155';
        btn.style.color       = '#64748b';
      });
      btn.addEventListener('click', () => {
        const raw = btn.dataset.snippet;
        navigator.clipboard.writeText(raw).then(() => {
          const prev = btn.innerHTML;
          btn.innerHTML = checkIcon() + ' Copiado';
          setTimeout(() => { btn.innerHTML = prev; }, 2000);
        });
      });
    });
  }

  // ════════════════════════════════════════════════════════════
  // GENERADOR DE SNIPPET (auto-embed por tenant)
  // ════════════════════════════════════════════════════════════

  function generateEmbedSnippet(slug, name) {
    return `<!-- Full Stock Widget — ${name || slug} -->
<!-- Paso 1: añade este contenedor donde quieras mostrar el catálogo -->
<div id="fullstock-catalog"></div>

<!-- Paso 2: pega este script antes del </body> de tu página -->
<script>
(function () {
  var SLUG = '${slug}';
  var API  = '${BASE_URL}/api/v1/public/tenants/' + SLUG + '/products';

  fetch(API)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.success) return;

      var el = document.getElementById('fullstock-catalog');
      if (!el) return;

      var disponibles = data.products.filter(function (p) { return p.stock > 0; });

      el.innerHTML = disponibles.length
        ? disponibles.map(function (p) {
            return '<div class="fs-item" style="border:1px solid #e2e8f0;border-radius:8px;'
                 + 'padding:16px;margin:8px;display:inline-block;min-width:180px;'
                 + 'vertical-align:top;font-family:sans-serif">'
                 + '<h3 style="margin:0 0 6px;font-size:15px;color:#1e293b">'
                 + (p.nombre || p.name || 'Producto') + '</h3>'
                 + (p.precio ? '<p style="color:#6366f1;font-weight:700;margin:0 0 4px">'
                 + '$' + p.precio + '</p>' : '')
                 + '<p style="color:#64748b;font-size:12px;margin:0">'
                 + 'Stock: ' + p.stock + '</p>'
                 + '</div>';
          }).join('')
        : '<p style="color:#64748b">No hay productos disponibles.</p>';
    })
    .catch(function () {
      console.error('[FullStock] No se pudo cargar el catálogo de ' + SLUG);
    });
})();
<\/script>`;
  }

  // ════════════════════════════════════════════════════════════
  // CARPETA 3 — Documentación de Endpoints (inline HTML)
  // ════════════════════════════════════════════════════════════

  function buildDocsContent(slug) {
    return `
      <!-- Tabla de endpoints -->
      <div style="margin-bottom:2rem">
        <h2 style="font-size:.75rem;font-weight:700;color:#475569;text-transform:uppercase;
                   letter-spacing:.08em;margin:0 0 .875rem">Endpoints disponibles</h2>
        <div style="border:1px solid #334155;border-radius:.625rem;overflow:hidden">
          <div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse">
              <thead>
                <tr style="background:#0f172a;border-bottom:1px solid #334155">
                  ${th('Método')}${th('Endpoint')}${th('Descripción')}${th('Auth')}
                </tr>
              </thead>
              <tbody>
                ${ENDPOINTS.map(ep => endpointRow(ep)).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Muestra de respuesta JSON -->
      <div style="margin-bottom:2rem">
        <h2 style="font-size:.75rem;font-weight:700;color:#475569;text-transform:uppercase;
                   letter-spacing:.08em;margin:0 0 .875rem">Estructura de la respuesta</h2>
        <div style="border:1px solid #334155;border-radius:.625rem;overflow:hidden">
          <div style="display:flex;align-items:center;justify-content:space-between;
                      padding:.5rem .875rem;background:#0f172a;border-bottom:1px solid #1e293b">
            <span style="display:flex;align-items:center;gap:.4rem">
              <span style="width:.45rem;height:.45rem;border-radius:50%;background:#ef4444;display:inline-block"></span>
              <span style="width:.45rem;height:.45rem;border-radius:50%;background:#f59e0b;display:inline-block"></span>
              <span style="width:.45rem;height:.45rem;border-radius:50%;background:#22c55e;display:inline-block"></span>
              <code style="color:#475569;font-size:.68rem;margin-left:.3rem">
                GET /api/v1/public/tenants/{slug}/products → 200 OK
              </code>
            </span>
            <button id="copy-json-btn"
              style="background:transparent;border:1px solid #334155;border-radius:.35rem;
                     color:#64748b;font-size:.68rem;font-weight:600;padding:.2rem .55rem;
                     cursor:pointer;transition:all .15s;display:inline-flex;
                     align-items:center;gap:.3rem">
              ${copyIcon()} Copiar
            </button>
          </div>
          <pre id="json-sample"
               style="margin:0;padding:1.25rem;font-size:.74rem;line-height:1.7;
                      overflow-x:auto;color:#94a3b8;font-family:'Courier New',monospace;
                      background:transparent">${jsonSample()}</pre>
        </div>
      </div>

      <!-- Código de ejemplo JS -->
      <div style="margin-bottom:2rem">
        <div style="display:flex;align-items:center;justify-content:space-between;
                    margin-bottom:.875rem;flex-wrap:wrap;gap:.5rem">
          <h2 style="font-size:.75rem;font-weight:700;color:#475569;text-transform:uppercase;
                     letter-spacing:.08em;margin:0">Ejemplo — JavaScript (Fetch)</h2>
          <div style="display:flex;align-items:center;gap:.5rem">
            <label style="font-size:.72rem;color:#475569">Tu slug:</label>
            <input id="hub-slug-input" type="text" value="${escHtml(slug)}"
              style="background:#0f172a;border:1px solid #334155;border-radius:.375rem;
                     color:#a5b4fc;font-size:.78rem;font-family:monospace;
                     padding:.3rem .6rem;outline:none;width:160px;
                     transition:border-color .15s"/>
          </div>
        </div>
        <div style="border:1px solid #334155;border-radius:.625rem;overflow:hidden">
          <div style="display:flex;align-items:center;justify-content:space-between;
                      padding:.5rem .875rem;background:#0f172a;border-bottom:1px solid #1e293b">
            <span style="display:flex;align-items:center;gap:.4rem">
              <span style="width:.45rem;height:.45rem;border-radius:50%;background:#ef4444;display:inline-block"></span>
              <span style="width:.45rem;height:.45rem;border-radius:50%;background:#f59e0b;display:inline-block"></span>
              <span style="width:.45rem;height:.45rem;border-radius:50%;background:#22c55e;display:inline-block"></span>
              <code style="color:#475569;font-size:.68rem;margin-left:.3rem">integracion.js</code>
            </span>
            <button id="copy-code-btn"
              style="background:transparent;border:1px solid #334155;border-radius:.35rem;
                     color:#64748b;font-size:.68rem;font-weight:600;padding:.2rem .55rem;
                     cursor:pointer;transition:all .15s;display:inline-flex;
                     align-items:center;gap:.3rem">
              ${copyIcon()} Copiar código
            </button>
          </div>
          <pre id="code-block"
               style="margin:0;padding:1.25rem;font-size:.74rem;line-height:1.75;
                      overflow-x:auto;font-family:'Courier New',monospace;
                      background:transparent">${highlightCode(sampleCode(slug))}</pre>
        </div>
      </div>

      <!-- Live tester -->
      <div>
        <h2 style="font-size:.75rem;font-weight:700;color:#475569;text-transform:uppercase;
                   letter-spacing:.08em;margin:0 0 .875rem">Prueba en vivo</h2>
        <div style="border:1px solid #334155;border-radius:.625rem;padding:1.25rem">
          <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin-bottom:1rem">
            <code style="color:#475569;font-size:.78rem;flex-shrink:0">
              ${BASE_URL}/api/v1/public/tenants/
            </code>
            <input id="test-slug" type="text" value="${escHtml(slug)}"
              placeholder="slug-del-tenant"
              style="background:#0f172a;border:1px solid #334155;border-radius:.375rem;
                     color:#a5b4fc;font-size:.78rem;font-family:monospace;
                     padding:.4rem .6rem;outline:none;flex:1;min-width:120px;
                     transition:border-color .15s"/>
            <code style="color:#475569;font-size:.78rem;flex-shrink:0">/products</code>
            <button id="test-run-btn"
              style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;
                     font-weight:600;font-size:.78rem;padding:.45rem 1rem;
                     border-radius:.5rem;border:none;cursor:pointer;
                     transition:opacity .15s;display:flex;align-items:center;
                     gap:.35rem;flex-shrink:0">
              <svg xmlns="http://www.w3.org/2000/svg" style="width:.8rem;height:.8rem"
                   fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 3l14 9-14 9V3z"/>
              </svg>
              Ejecutar
            </button>
          </div>
          <div id="test-result"
               style="background:#0f172a;border:1px solid #1e293b;border-radius:.5rem;
                      min-height:3rem;font-size:.73rem;font-family:monospace;
                      color:#475569;padding:1rem;overflow-x:auto;
                      max-height:320px;overflow-y:auto">
            Ingresa un slug y pulsa Ejecutar para ver la respuesta real del API.
          </div>
        </div>
      </div>`;
  }

  // ════════════════════════════════════════════════════════════
  // EVENTOS: Carpetas + Documentación
  // ════════════════════════════════════════════════════════════

  function bindFolderEvents(container) {
    container.querySelectorAll('[data-folder-btn]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key   = btn.dataset.folderBtn;
        const body  = container.querySelector(`[data-folder-body="${key}"]`);
        const arrow = container.querySelector(`[data-folder-arrow="${key}"]`);
        if (!body) return;

        const isOpen = body.classList.contains('is-open');
        body.classList.toggle('is-open', !isOpen);
        if (arrow) arrow.classList.toggle('is-open', !isOpen);
      });
    });
  }

  function bindDocsEvents(container, initialSlug) {
    // Los elementos de la carpeta 3 solo existen cuando la carpeta está
    // renderizada en el DOM — siempre están presentes (generados en buildDocsContent).
    const slugInput  = container.querySelector('#hub-slug-input');
    const codeBlock  = container.querySelector('#code-block');
    const copyCode   = container.querySelector('#copy-code-btn');
    const copyJson   = container.querySelector('#copy-json-btn');
    const testSlug   = container.querySelector('#test-slug');
    const testRunBtn = container.querySelector('#test-run-btn');
    const testResult = container.querySelector('#test-result');

    if (!slugInput) return;

    // Focus rings CSP-safe
    [slugInput, testSlug].forEach(inp => {
      if (!inp) return;
      inp.addEventListener('focus', () => { inp.style.borderColor = '#6366f1'; });
      inp.addEventListener('blur',  () => { inp.style.borderColor = '#334155'; });
    });

    // Hover en botones de copia
    [copyCode, copyJson].forEach(btn => {
      if (!btn) return;
      btn.addEventListener('mouseover', () => {
        btn.style.background  = '#1e293b';
        btn.style.borderColor = '#6366f1';
        btn.style.color       = '#a5b4fc';
      });
      btn.addEventListener('mouseout', () => {
        btn.style.background  = 'transparent';
        btn.style.borderColor = '#334155';
        btn.style.color       = '#64748b';
      });
    });

    // Actualizar código al cambiar slug
    slugInput.addEventListener('input', () => {
      const s = slugInput.value.trim() || 'mi-tienda';
      if (codeBlock) codeBlock.innerHTML = highlightCode(sampleCode(s));
      if (testSlug)  testSlug.value = s;
    });

    if (testSlug) {
      testSlug.addEventListener('input', () => {
        const s = testSlug.value.trim() || 'mi-tienda';
        if (slugInput)  slugInput.value = s;
        if (codeBlock) codeBlock.innerHTML = highlightCode(sampleCode(s));
      });
    }

    // Copiar código JS de ejemplo
    if (copyCode) {
      copyCode.addEventListener('click', () => {
        const s = slugInput.value.trim() || 'mi-tienda';
        navigator.clipboard.writeText(sampleCode(s)).then(() => {
          const prev = copyCode.innerHTML;
          copyCode.innerHTML = checkIcon() + ' Copiado';
          setTimeout(() => { copyCode.innerHTML = prev; }, 2000);
        });
      });
    }

    // Copiar JSON de ejemplo
    if (copyJson) {
      copyJson.addEventListener('click', () => {
        navigator.clipboard.writeText(jsonRaw()).then(() => {
          const prev = copyJson.innerHTML;
          copyJson.innerHTML = checkIcon() + ' Copiado';
          setTimeout(() => { copyJson.innerHTML = prev; }, 2000);
        });
      });
    }

    // Live tester
    if (testRunBtn) {
      testRunBtn.addEventListener('mouseover', () => { testRunBtn.style.opacity = '.85'; });
      testRunBtn.addEventListener('mouseout',  () => { testRunBtn.style.opacity = '1';  });
      testRunBtn.addEventListener('click', async () => {
        const s = (testSlug ? testSlug.value : '').trim();
        if (!s) {
          testResult.style.color = '#f87171';
          testResult.textContent = 'Ingresa un slug para probar.';
          return;
        }

        testRunBtn.disabled    = true;
        testResult.style.color = '#475569';
        testResult.innerHTML   =
          '<span style="display:inline-flex;align-items:center;gap:.5rem">'
          + spinner() + ' Ejecutando…</span>';

        try {
          const url  = `${BASE_URL}/api/v1/public/tenants/${encodeURIComponent(s)}/products`;
          const res  = await fetch(url);
          const json = await res.json();

          testResult.style.color = '#94a3b8';
          testResult.innerHTML   =
            `<span style="color:#475569;font-size:.68rem">// HTTP ${res.status} — ${escHtml(url)}</span>\n`
            + syntaxHighlightJson(JSON.stringify(json, null, 2));
        } catch (err) {
          testResult.style.color = '#f87171';
          testResult.textContent = 'Error de red: ' + ((err && err.message) || String(err));
        } finally {
          testRunBtn.disabled = false;
        }
      });
    }
  }

  // ════════════════════════════════════════════════════════════
  // HELPERS DE UI
  // ════════════════════════════════════════════════════════════

  /** Genera la barra de cabecera de una carpeta. */
  function folderHeader(key, labelHtml, open) {
    return `
      <button data-folder-btn="${key}"
              style="width:100%;display:flex;align-items:center;gap:.75rem;
                     background:#1e293b;border:1px solid #334155;
                     border-radius:${open ? '.75rem .75rem 0 0' : '.75rem'};
                     padding:.875rem 1.25rem;cursor:pointer;transition:background .12s;
                     text-align:left"
              id="folder-btn-${key}">
        ${labelHtml}
        <span style="flex:1"></span>
        <svg data-folder-arrow="${key}"
             xmlns="http://www.w3.org/2000/svg"
             class="${open ? 'is-open' : ''}"
             style="width:.9rem;height:.9rem;color:#475569;flex-shrink:0"
             fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
        </svg>
      </button>`;
  }

  // Wait — the button label HTML needs a text wrapper. Let me embed it properly.

  function folderLoading() {
    return `<div style="padding:1.5rem;text-align:center;color:#475569;font-size:.82rem">
              <div style="width:1.1rem;height:1.1rem;border:2px solid #6366f1;
                          border-top-color:transparent;border-radius:50%;
                          animation:spin .7s linear infinite;margin:0 auto .625rem"></div>
              Cargando datos…
            </div>`;
  }

  function endpointRow(ep) {
    const mc = METHOD_COLORS[ep.method] || METHOD_COLORS.GET;
    return `
      <tr class="hub-ep-row" style="border-bottom:1px solid #1e293b">
        <td style="padding:.6rem 1rem;white-space:nowrap">
          <span style="background:${mc.bg};border:1px solid ${mc.border};color:${mc.color};
                       font-size:.68rem;font-weight:700;padding:.2rem .55rem;
                       border-radius:.375rem;font-family:monospace;letter-spacing:.04em">
            ${ep.method}
          </span>
        </td>
        <td style="padding:.6rem 1rem">
          <code style="color:#a5b4fc;font-size:.75rem;word-break:break-all">
            ${escHtml(ep.path)}
          </code>
        </td>
        <td style="padding:.6rem 1rem;font-size:.78rem;color:#94a3b8;max-width:300px">
          ${escHtml(ep.desc)}
        </td>
        <td style="padding:.6rem 1rem;white-space:nowrap">
          ${ep.auth
            ? `<span style="background:#0c2a4a;border:1px solid #1e40af;color:#93c5fd;
                            font-size:.65rem;font-weight:600;padding:.18rem .5rem;
                            border-radius:.375rem">JWT</span>`
            : `<span style="background:#042f2e;border:1px solid #065f46;color:#34d399;
                            font-size:.65rem;font-weight:600;padding:.18rem .5rem;
                            border-radius:.375rem">Público</span>`}
        </td>
      </tr>`;
  }

  function th(label) {
    return `<th style="padding:.55rem 1rem;text-align:left;font-size:.67rem;font-weight:600;
                       color:#475569;text-transform:uppercase;letter-spacing:.07em;
                       white-space:nowrap">${label}</th>`;
  }

  function sampleCode(slug) {
    return `// Conecta tu web a Full Stock — slug: '${slug}'
const SLUG = '${slug}';
const API  = '${BASE_URL}';

fetch(\`\${API}/api/v1/public/tenants/\${SLUG}/products\`)
  .then(res => res.json())
  .then(({ success, storeName, whatsapp, products }) => {
    if (!success) return console.error('Error al cargar el catálogo.');

    // Filtrar solo productos con stock disponible
    const disponibles = products.filter(p => p.stock > 0);

    console.log('Tienda:', storeName, '| WhatsApp:', whatsapp);
    console.log('Productos disponibles:', disponibles.length);

    disponibles.forEach(p => {
      console.log(\`  - \${p.nombre || p.name} | Precio: \${p.precio} | Stock: \${p.stock}\`);
    });

    renderCatalogo(disponibles);
  })
  .catch(err => console.error('Error de red:', err));

function renderCatalogo(productos) {
  const contenedor = document.getElementById('mi-catalogo');
  contenedor.innerHTML = productos.map(p => \`
    <div class="producto">
      <h3>\${p.nombre || p.name || 'Producto'}</h3>
      <p>\${p.precio || '—'}</p>
      <small>Stock: \${p.stock}</small>
    </div>
  \`).join('');
}`;
  }

  function jsonRaw() {
    return JSON.stringify({
      success: true, storeName: 'Repuestos Julian', slug: 'repuestos-julian',
      whatsapp: '56912345678', totalProducts: 2,
      products: [
        { id: '64abc123', collectionName: 'Frenos', collectionSlug: 'frenos',
          stock: 12, nombre: 'Pastilla de freno Brembo', precio: 18990,
          descripcion: 'Compatible Toyota Yaris 2015-2022',
          imagen: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
          createdAt: '2025-01-15T10:30:00.000Z' },
        { id: '64abc789', collectionName: 'Aceites', collectionSlug: 'aceites',
          stock: 0, nombre: 'Aceite Mobil 5W-30 1L', precio: 8490,
          descripcion: 'Sintético para motores modernos',
          imagen: 'https://res.cloudinary.com/demo/image/upload/sample2.jpg',
          createdAt: '2025-02-01T09:00:00.000Z' },
      ],
    }, null, 2);
  }

  function jsonSample() { return syntaxHighlightJson(jsonRaw()); }

  function syntaxHighlightJson(json) {
    return escHtml(json)
      .replace(/"([^"]+)":/g,   '<span style="color:#f472b6">"$1"</span>:')
      .replace(/: "([^"]*)"/g,  ': <span style="color:#86efac">"$1"</span>')
      .replace(/: (true|false)/g, ': <span style="color:#60a5fa">$1</span>')
      .replace(/: (null)/g,      ': <span style="color:#94a3b8">$1</span>')
      .replace(/: (\d+\.?\d*)/g, ': <span style="color:#fb923c">$1</span>');
  }

  function highlightCode(code) {
    return escHtml(code)
      .replace(/(\/\/[^\n]*)/g,
        '<span style="color:#475569;font-style:italic">$1</span>')
      .replace(/\b(const|let|var|function|return|if|forEach|filter)\b/g,
        '<span style="color:#c084fc">$1</span>')
      .replace(/(`[^`]*`)/g, '<span style="color:#86efac">$1</span>')
      .replace(/(&#39;[^&]*&#39;|&quot;[^&]*&quot;)/g,
        '<span style="color:#86efac">$1</span>')
      .replace(/\b(fetch|console\.log|console\.error)\b/g,
        '<span style="color:#38bdf8">$1</span>')
      .replace(/=&gt;/g, '<span style="color:#c084fc">=></span>');
  }

  function highlightEmbed(snippet) {
    return escHtml(snippet)
      .replace(/(&lt;!--[^]*?--&gt;)/g,
        '<span style="color:#475569;font-style:italic">$1</span>')
      .replace(/\b(var|function|return|if|fetch|filter|map|join)\b/g,
        '<span style="color:#c084fc">$1</span>')
      .replace(/(&lt;\/?(?:div|script|p)[^&gt;]*&gt;)/g,
        '<span style="color:#f472b6">$1</span>')
      .replace(/(&#39;[^&]*&#39;)/g,
        '<span style="color:#86efac">$1</span>');
  }

  function spinner() {
    return `<span style="display:inline-block;width:.8rem;height:.8rem;
                          border:2px solid #334155;border-top-color:#6366f1;
                          border-radius:50%;animation:spin .6s linear infinite"></span>`;
  }

  function copyIcon() {
    return `<svg xmlns="http://www.w3.org/2000/svg" style="width:.75rem;height:.75rem;flex-shrink:0"
                 fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round"
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2
                   m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
            </svg>`;
  }

  function checkIcon() {
    return `<svg xmlns="http://www.w3.org/2000/svg" style="width:.75rem;height:.75rem;flex-shrink:0"
                 fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
            </svg>`;
  }

  function escHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  return { render };
})();

window.ApiHub = ApiHub;
