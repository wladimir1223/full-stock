/**
 * apihub.js — Panel "API Hub / Integraciones" del SuperAdmin.
 *
 * Permite que clientes avanzados conecten sus webs externas
 * (tiendaderoberto.cl, etc.) a su catálogo en Full Stock mediante
 * un endpoint público con CORS abierto.
 *
 * Solo visible para role === 'superadmin'.
 */

const ApiHub = (() => {

  const BASE_URL = window.location.origin;   // https://full-stock-3cxb.onrender.com

  // ─── Endpoints documentados ───────────────────────────────────────────────
  const ENDPOINTS = [
    {
      method: 'GET',
      path:   '/api/v1/public/tenants/{slug}/products',
      desc:   'Catálogo completo con stock disponible. CORS abierto — consumible desde cualquier dominio.',
      auth:   false,
      status: 'stable',
    },
    {
      method: 'GET',
      path:   '/api/v1/store/{slug}/products',
      desc:   'Catálogo agrupado por colección. Usado por la tienda pública interna (/tienda/{slug}).',
      auth:   false,
      status: 'stable',
    },
    {
      method: 'POST',
      path:   '/api/v1/store/{slug}/checkout',
      desc:   'Descuenta stock atómicamente y registra el pedido. Límite: 5 compras / IP / 10 min.',
      auth:   false,
      status: 'stable',
    },
  ];

  const METHOD_COLORS = {
    GET:    { bg: '#042f2e', border: '#065f46', color: '#34d399' },
    POST:   { bg: '#0c2a4a', border: '#1e40af', color: '#93c5fd' },
    PUT:    { bg: '#1c1917', border: '#92400e', color: '#fde68a' },
    DELETE: { bg: '#450a0a', border: '#7f1d1d', color: '#f87171' },
  };

  // ─── Muestra de código JavaScript — fetch directo ─────────────────────────
  function sampleCode(slug) {
    return `// Conecta tu web externa a Full Stock
// Reemplaza 'SLUG' por el slug de tu tienda (ej: 'repuestos-julian')
const SLUG = '${escHtml(slug)}';
const API  = '${BASE_URL}';

fetch(\`\${API}/api/v1/public/tenants/\${SLUG}/products\`)
  .then(res => res.json())
  .then(({ success, storeName, whatsapp, products }) => {
    if (!success) return console.error('Error al cargar el catálogo.');

    console.log('Tienda:', storeName);
    console.log('WhatsApp:', whatsapp);
    console.log('Productos:', products.length);

    // products es un array — cada ítem tiene todos los campos
    // que definiste en tus colecciones, más: id, collectionName,
    // collectionSlug, stock, createdAt, updatedAt.
    products.forEach(p => {
      console.log(\`  - \${p.nombre || p.name} | Stock: \${p.stock}\`);
    });

    // Ejemplo: filtrar solo productos con stock disponible
    const disponibles = products.filter(p => p.stock > 0);

    // Aquí puedes maquetar el catálogo a tu gusto
    renderCatalogo(disponibles);
  })
  .catch(err => console.error('Error de red:', err));

function renderCatalogo(productos) {
  const contenedor = document.getElementById('mi-catalogo');
  contenedor.innerHTML = productos.map(p => \`
    <div class="producto">
      <h3>\${p.nombre || p.name || 'Producto'}</h3>
      <p>Precio: \${p.precio || p.price || '—'}</p>
      <p>Stock: \${p.stock} unidades</p>
    </div>
  \`).join('');
}`;
  }

  // ─── render() ─────────────────────────────────────────────────────────────
  async function render(container) {
    const slug = Auth.getTenantSlug() || 'mi-tienda';

    container.innerHTML = `
      <div class="animate-fade-in" style="max-width:900px;margin:0 auto">

        <!-- ── Cabecera ── -->
        <div style="margin-bottom:2rem">
          <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.5rem">
            <div style="width:2.25rem;height:2.25rem;border-radius:.625rem;
                        background:linear-gradient(135deg,#6366f1,#8b5cf6);
                        display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <svg xmlns="http://www.w3.org/2000/svg"
                   style="width:1.1rem;height:1.1rem;color:#fff"
                   fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656
                     l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656
                     l-1.1 1.1"/>
              </svg>
            </div>
            <div>
              <h1 style="font-size:1.25rem;font-weight:700;color:#f1f5f9;margin:0;line-height:1.2">
                API Hub <span style="color:#6366f1">/ Integraciones</span>
              </h1>
              <p style="color:#475569;font-size:.8rem;margin:0;line-height:1.4">
                Conecta cualquier sitio web externo directamente a tu inventario.
              </p>
            </div>
          </div>
        </div>

        <!-- ── Banner informativo ── -->
        <div style="background:#0f172a;border:1px solid #1e293b;border-left:3px solid #6366f1;
                    border-radius:.625rem;padding:1rem 1.25rem;margin-bottom:1.75rem;
                    display:flex;gap:1rem;align-items:flex-start">
          <svg xmlns="http://www.w3.org/2000/svg"
               style="width:1.1rem;height:1.1rem;color:#6366f1;flex-shrink:0;margin-top:.1rem"
               fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <p style="color:#94a3b8;font-size:.82rem;margin:0;line-height:1.6">
            Los endpoints públicos tienen <strong style="color:#e2e8f0">CORS completamente abierto</strong>
            (<code style="color:#6366f1;font-size:.78rem">Access-Control-Allow-Origin: *</code>).
            Cualquier dominio externo — ya sea <code style="color:#a5b4fc">tiendaderoberto.cl</code>,
            una SPA en React o una app móvil — puede consumirlos directamente con <code style="color:#a5b4fc">fetch()</code>
            sin necesidad de proxy ni configuración adicional.
          </p>
        </div>

        <!-- ── Sección 1: Tabla de endpoints ── -->
        <div style="margin-bottom:2rem">
          <h2 style="font-size:.75rem;font-weight:700;color:#475569;text-transform:uppercase;
                     letter-spacing:.08em;margin:0 0 .875rem">Endpoints disponibles</h2>

          <div style="background:#1e293b;border:1px solid #334155;border-radius:.75rem;
                      overflow:hidden">
            <div style="overflow-x:auto">
              <table style="width:100%;border-collapse:collapse">
                <thead>
                  <tr style="background:#0f172a;border-bottom:1px solid #334155">
                    ${th('Método')}
                    ${th('Endpoint')}
                    ${th('Descripción')}
                    ${th('Auth')}
                  </tr>
                </thead>
                <tbody>
                  ${ENDPOINTS.map(ep => endpointRow(ep)).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- ── Sección 2: Respuesta JSON de ejemplo ── -->
        <div style="margin-bottom:2rem">
          <h2 style="font-size:.75rem;font-weight:700;color:#475569;text-transform:uppercase;
                     letter-spacing:.08em;margin:0 0 .875rem">Estructura de la respuesta</h2>

          <div style="background:#1e293b;border:1px solid #334155;border-radius:.75rem;overflow:hidden">
            <!-- Header del bloque -->
            <div style="display:flex;align-items:center;justify-content:space-between;
                        padding:.625rem 1rem;background:#0f172a;border-bottom:1px solid #1e293b">
              <span style="display:flex;align-items:center;gap:.5rem">
                <span style="width:.5rem;height:.5rem;border-radius:50%;background:#ef4444;
                             display:inline-block"></span>
                <span style="width:.5rem;height:.5rem;border-radius:50%;background:#f59e0b;
                             display:inline-block"></span>
                <span style="width:.5rem;height:.5rem;border-radius:50%;background:#22c55e;
                             display:inline-block"></span>
                <code style="color:#475569;font-size:.72rem;margin-left:.25rem">
                  GET /api/v1/public/tenants/{slug}/products → 200 OK
                </code>
              </span>
              <button id="copy-json-btn"
                style="background:transparent;border:1px solid #334155;border-radius:.375rem;
                       color:#64748b;font-size:.7rem;font-weight:600;padding:.25rem .6rem;
                       cursor:pointer;transition:all .15s;display:flex;align-items:center;gap:.35rem">
                <svg xmlns="http://www.w3.org/2000/svg" style="width:.75rem;height:.75rem"
                     fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round"
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2
                       m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                </svg>
                Copiar
              </button>
            </div>
            <pre id="json-sample"
                 style="margin:0;padding:1.25rem;font-size:.75rem;line-height:1.7;
                        overflow-x:auto;color:#94a3b8;font-family:'Courier New',monospace;
                        background:transparent">${jsonSample()}</pre>
          </div>
        </div>

        <!-- ── Sección 3: Código de ejemplo ── -->
        <div style="margin-bottom:2rem">
          <div style="display:flex;align-items:center;justify-content:space-between;
                      margin-bottom:.875rem;flex-wrap:wrap;gap:.5rem">
            <h2 style="font-size:.75rem;font-weight:700;color:#475569;text-transform:uppercase;
                       letter-spacing:.08em;margin:0">Ejemplo de integración — JavaScript (Fetch)</h2>
            <div style="display:flex;align-items:center;gap:.5rem">
              <label style="font-size:.72rem;color:#475569">Tu slug:</label>
              <input id="hub-slug-input" type="text" value="${escHtml(slug)}"
                style="background:#0f172a;border:1px solid #334155;border-radius:.375rem;
                       color:#a5b4fc;font-size:.78rem;font-family:monospace;
                       padding:.3rem .6rem;outline:none;width:160px;
                       transition:border-color .15s"/>
            </div>
          </div>

          <div style="background:#1e293b;border:1px solid #334155;border-radius:.75rem;overflow:hidden">
            <!-- Header del bloque de código -->
            <div style="display:flex;align-items:center;justify-content:space-between;
                        padding:.625rem 1rem;background:#0f172a;border-bottom:1px solid #1e293b">
              <span style="display:flex;align-items:center;gap:.5rem">
                <span style="width:.5rem;height:.5rem;border-radius:50%;background:#ef4444;
                             display:inline-block"></span>
                <span style="width:.5rem;height:.5rem;border-radius:50%;background:#f59e0b;
                             display:inline-block"></span>
                <span style="width:.5rem;height:.5rem;border-radius:50%;background:#22c55e;
                             display:inline-block"></span>
                <code style="color:#475569;font-size:.72rem;margin-left:.25rem">
                  integracion.js
                </code>
              </span>
              <button id="copy-code-btn"
                style="background:transparent;border:1px solid #334155;border-radius:.375rem;
                       color:#64748b;font-size:.7rem;font-weight:600;padding:.25rem .6rem;
                       cursor:pointer;transition:all .15s;display:flex;align-items:center;gap:.35rem">
                <svg xmlns="http://www.w3.org/2000/svg" style="width:.75rem;height:.75rem"
                     fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round"
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2
                       m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                </svg>
                Copiar código
              </button>
            </div>
            <!-- Bloque de código con resaltado manual -->
            <pre id="code-block"
                 style="margin:0;padding:1.25rem;font-size:.77rem;line-height:1.75;
                        overflow-x:auto;font-family:'Courier New',monospace;
                        background:transparent">${highlightCode(sampleCode(slug))}</pre>
          </div>
        </div>

        <!-- Estilos locales del panel (sin inline handlers) -->
        <style>
          .hub-ep-row { transition: background .12s; }
          .hub-ep-row:hover { background: #162032; }
          @keyframes spin { to { transform: rotate(360deg); } }
        </style>

        <!-- ── Sección 4: Live tester ── -->
        <div style="margin-bottom:2rem">
          <h2 style="font-size:.75rem;font-weight:700;color:#475569;text-transform:uppercase;
                     letter-spacing:.08em;margin:0 0 .875rem">Prueba en vivo</h2>

          <div style="background:#1e293b;border:1px solid #334155;border-radius:.75rem;
                      padding:1.25rem">
            <div style="display:flex;gap:.625rem;align-items:center;flex-wrap:wrap;
                        margin-bottom:1rem">
              <code style="color:#475569;font-size:.8rem;flex-shrink:0">${BASE_URL}/api/v1/public/tenants/</code>
              <input id="test-slug" type="text" value="${escHtml(slug)}"
                placeholder="slug-del-tenant"
                style="background:#0f172a;border:1px solid #334155;border-radius:.375rem;
                       color:#a5b4fc;font-size:.8rem;font-family:monospace;
                       padding:.4rem .6rem;outline:none;width:180px;flex:1;min-width:120px;
                       transition:border-color .15s"/>
              <code style="color:#475569;font-size:.8rem;flex-shrink:0">/products</code>
              <button id="test-run-btn"
                style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;
                       font-weight:600;font-size:.8rem;padding:.45rem 1.1rem;
                       border-radius:.5rem;border:none;cursor:pointer;transition:opacity .15s;
                       display:flex;align-items:center;gap:.4rem;flex-shrink:0">
                <svg xmlns="http://www.w3.org/2000/svg" style="width:.85rem;height:.85rem"
                     fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 3l14 9-14 9V3z"/>
                </svg>
                Ejecutar
              </button>
            </div>

            <!-- Resultado -->
            <div id="test-result"
                 style="background:#0f172a;border:1px solid #1e293b;border-radius:.5rem;
                        min-height:3rem;font-size:.75rem;font-family:monospace;
                        color:#475569;padding:1rem;overflow-x:auto;
                        max-height:320px;overflow-y:auto">
              Ingresa un slug y pulsa Ejecutar para ver la respuesta real del API.
            </div>
          </div>
        </div>

      </div>
    `;

    bindEvents(container, slug);
  }

  // ─── Bind de eventos ──────────────────────────────────────────────────────
  function bindEvents(container, initialSlug) {
    const slugInput    = container.querySelector('#hub-slug-input');
    const codeBlock    = container.querySelector('#code-block');
    const copyCodeBtn  = container.querySelector('#copy-code-btn');
    const copyJsonBtn  = container.querySelector('#copy-json-btn');
    const jsonSampleEl = container.querySelector('#json-sample');
    const testSlug     = container.querySelector('#test-slug');
    const testRunBtn   = container.querySelector('#test-run-btn');
    const testResult   = container.querySelector('#test-result');

    // Focus rings CSP-safe
    [slugInput, testSlug].forEach(inp => {
      inp.addEventListener('focus', () => { inp.style.borderColor = '#6366f1'; });
      inp.addEventListener('blur',  () => { inp.style.borderColor = '#334155'; });
    });

    // Hover en botones de copia
    [copyCodeBtn, copyJsonBtn].forEach(btn => {
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

    // Actualizar código en tiempo real al cambiar el slug
    slugInput.addEventListener('input', () => {
      const s = slugInput.value.trim() || 'mi-tienda';
      codeBlock.innerHTML    = highlightCode(sampleCode(s));
      if (testSlug) testSlug.value = s;
    });

    // Sincronizar slug del tester con el campo de arriba
    testSlug.addEventListener('input', () => {
      if (slugInput) slugInput.value = testSlug.value;
      const s = testSlug.value.trim() || 'mi-tienda';
      codeBlock.innerHTML = highlightCode(sampleCode(s));
    });

    // Copiar código
    copyCodeBtn.addEventListener('click', () => {
      const s = slugInput.value.trim() || 'mi-tienda';
      navigator.clipboard.writeText(sampleCode(s)).then(() => {
        copyCodeBtn.innerHTML = checkIcon() + ' Copiado';
        setTimeout(() => {
          copyCodeBtn.innerHTML = copyIcon() + ' Copiar código';
        }, 2000);
      });
    });

    // Copiar JSON de ejemplo
    copyJsonBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(jsonRaw()).then(() => {
        copyJsonBtn.innerHTML = checkIcon() + ' Copiado';
        setTimeout(() => {
          copyJsonBtn.innerHTML = copyIcon() + ' Copiar';
        }, 2000);
      });
    });

    // Live tester — llama al endpoint real
    testRunBtn.addEventListener('click', async () => {
      const s = (testSlug.value || '').trim();
      if (!s) {
        testResult.style.color = '#f87171';
        testResult.textContent = 'Ingresa un slug para probar.';
        return;
      }

      testRunBtn.disabled         = true;
      testResult.style.color      = '#475569';
      testResult.innerHTML        =
        '<div style="display:flex;align-items:center;gap:.5rem">' +
        spinner() + ' Ejecutando…</div>';

      try {
        const url  = `${BASE_URL}/api/v1/public/tenants/${encodeURIComponent(s)}/products`;
        const res  = await fetch(url);
        const json = await res.json();

        testResult.style.color = '#94a3b8';
        testResult.innerHTML   =
          `<span style="color:#475569;font-size:.68rem">// HTTP ${res.status} — ${url}</span>\n` +
          syntaxHighlightJson(JSON.stringify(json, null, 2));
      } catch (err) {
        testResult.style.color = '#f87171';
        testResult.textContent = 'Error de red: ' + (err.message || String(err));
      } finally {
        testRunBtn.disabled = false;
      }
    });

    // Hover en botón ejecutar
    testRunBtn.addEventListener('mouseover', () => { testRunBtn.style.opacity = '.85'; });
    testRunBtn.addEventListener('mouseout',  () => { testRunBtn.style.opacity = '1'; });
  }

  // ─── Helpers de UI ────────────────────────────────────────────────────────

  function endpointRow(ep) {
    const mc = METHOD_COLORS[ep.method] || METHOD_COLORS.GET;
    // Sin inline handlers — el hover lo gestiona la clase CSS .hub-ep-row
    return `
      <tr class="hub-ep-row" style="border-bottom:1px solid #1e293b">
        <td style="padding:.65rem 1rem;white-space:nowrap">
          <span style="background:${mc.bg};border:1px solid ${mc.border};color:${mc.color};
                       font-size:.68rem;font-weight:700;padding:.2rem .55rem;
                       border-radius:.375rem;font-family:monospace;letter-spacing:.04em">
            ${ep.method}
          </span>
        </td>
        <td style="padding:.65rem 1rem">
          <code style="color:#a5b4fc;font-size:.75rem;word-break:break-all">${escHtml(ep.path)}</code>
        </td>
        <td style="padding:.65rem 1rem;font-size:.78rem;color:#94a3b8;max-width:320px">
          ${escHtml(ep.desc)}
        </td>
        <td style="padding:.65rem 1rem;white-space:nowrap">
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

  // JSON de ejemplo de la respuesta
  function jsonRaw() {
    return JSON.stringify({
      success:       true,
      storeName:     'Repuestos Julian',
      slug:          'repuestos-julian',
      whatsapp:      '56912345678',
      totalProducts: 2,
      products: [
        {
          id:             '64abc123def456',
          collectionName: 'Frenos',
          collectionSlug: 'frenos',
          stock:          12,
          nombre:         'Pastilla de freno Brembo',
          precio:         18990,
          descripcion:    'Compatible con Toyota Yaris 2015-2022',
          imagen:         'https://res.cloudinary.com/demo/image/upload/sample.jpg',
          createdAt:      '2025-01-15T10:30:00.000Z',
          updatedAt:      '2025-05-20T08:45:00.000Z',
        },
        {
          id:             '64abc789ghi012',
          collectionName: 'Aceites',
          collectionSlug: 'aceites',
          stock:          0,
          nombre:         'Aceite Mobil 5W-30 1L',
          precio:         8490,
          descripcion:    'Aceite sintético para motores modernos',
          imagen:         'https://res.cloudinary.com/demo/image/upload/sample2.jpg',
          createdAt:      '2025-02-01T09:00:00.000Z',
          updatedAt:      '2025-05-25T12:00:00.000Z',
        },
      ],
    }, null, 2);
  }

  function jsonSample() {
    return syntaxHighlightJson(jsonRaw());
  }

  // Resaltado de sintaxis básico para JSON (sin dependencias externas)
  function syntaxHighlightJson(json) {
    const safe = escHtml(json);
    return safe
      .replace(/"([^"]+)":/g,   '<span style="color:#f472b6">"$1"</span>:')   // clave
      .replace(/: "([^"]*)"/g,  ': <span style="color:#86efac">"$1"</span>') // string value
      .replace(/: (true|false)/g, ': <span style="color:#60a5fa">$1</span>')  // bool
      .replace(/: (null)/g,      ': <span style="color:#94a3b8">$1</span>')   // null
      .replace(/: (\d+\.?\d*)/g, ': <span style="color:#fb923c">$1</span>'); // número
  }

  // Resaltado de JS básico
  function highlightCode(code) {
    const esc = escHtml(code);
    return esc
      // comentarios
      .replace(/(\/\/[^\n]*)/g,
        '<span style="color:#475569;font-style:italic">$1</span>')
      // keywords
      .replace(/\b(const|let|var|function|return|if|forEach|filter)\b/g,
        '<span style="color:#c084fc">$1</span>')
      // strings con template literals
      .replace(/(`[^`]*`)/g,
        '<span style="color:#86efac">$1</span>')
      // strings simples
      .replace(/(&#39;[^&]*&#39;|&quot;[^&]*&quot;)/g,
        '<span style="color:#86efac">$1</span>')
      // fetch / console
      .replace(/\b(fetch|console\.log|console\.error)\b/g,
        '<span style="color:#38bdf8">$1</span>')
      // arrow
      .replace(/=&gt;/g,
        '<span style="color:#c084fc">=></span>');
  }

  function spinner() {
    return `<span style="display:inline-block;width:.85rem;height:.85rem;
                          border:2px solid #334155;border-top-color:#6366f1;
                          border-radius:50%;animation:spin .6s linear infinite"></span>`;
  }

  function copyIcon() {
    return `<svg xmlns="http://www.w3.org/2000/svg" style="width:.75rem;height:.75rem"
                 fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round"
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2
                   m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
            </svg>`;
  }

  function checkIcon() {
    return `<svg xmlns="http://www.w3.org/2000/svg" style="width:.75rem;height:.75rem"
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
