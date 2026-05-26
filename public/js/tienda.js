/**
 * tienda.js — Lógica completa de la tienda pública.
 *
 * Sin inline handlers (CSP: script-src-attr 'none').
 * Todos los eventos se registran vía addEventListener / delegación.
 *
 * Funcionalidades:
 *  · Carga del catálogo multi-tenant (clean URL /tienda/:slug)
 *  · Offcanvas drawer de categorías (desliza desde la derecha)
 *  · Modal de pedido con selector de cantidad y precio total dinámico
 *  · Checkout POST → mensaje WhatsApp pre-formateado
 *  · Toast de notificación, skeletons de carga, badges de stock
 */
'use strict';

// ─── Config ───────────────────────────────────────────────────────────────────
// Slug del tenant — prioridad: clean URL /tienda/SLUG, fallback: ?tenant=SLUG
// El fallback mantiene compatibilidad con links guardados antes de la migración.
const _pathParts = window.location.pathname.split('/').filter(Boolean);
const _pathSlug  = _pathParts[0] === 'tienda' ? (_pathParts[1] || '') : '';
const TENANT     = _pathSlug || new URLSearchParams(window.location.search).get('tenant') || '';
const CATALOG_URL  = `/api/v1/store/${TENANT}/products`;
const CHECKOUT_URL = `/api/v1/store/${TENANT}/checkout`;

// ─── Estado global ────────────────────────────────────────────────────────────
let telefonoTiendaActual = '';   // número sin '+', cargado desde la API
let pendingOrder         = null; // { collectionSlug, productId, name, price, stock, cardEl }
const stockMap           = {};   // { [productId]: currentStock }

// ─── Detección de campos ──────────────────────────────────────────────────────
const ALIASES = {
  name:  ['nombre','name','titulo','title','producto','item'],
  price: ['precio','price','costo','cost','valor','value','monto','importe'],
  desc:  ['descripcion','description','detalle','detail','info','resumen','texto'],
  img:   ['imagen','image','foto','photo','picture','img','thumbnail','miniatura',
          'foto_url','image_url','imagen_url'],
};
function pick(item, type) {
  for (const k of ALIASES[type]) {
    const v = item[k];
    if (v != null && String(v).trim() !== '') return v;
  }
  return null;
}

// ─── SVG placeholder (sin imagen) ────────────────────────────────────────────
const SVG_PLACEHOLDER = `
  <div style="width:100%;height:100%;display:flex;align-items:center;
              justify-content:center;background:#1e293b">
    <svg xmlns="http://www.w3.org/2000/svg"
         style="width:2.75rem;height:2.75rem;color:#334155"
         fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
      <path stroke-linecap="round" stroke-linejoin="round"
        d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0
           01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504
           1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504
           -1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"/>
    </svg>
  </div>`;

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  showSkeletons();
  loadCatalog();

  // ══ Delegated click listener (CSP-safe — sin onclick inline) ═════════════
  document.addEventListener('click', function (e) {

    // 1. Botón "Comprar" en tarjeta de producto
    const buyBtn = e.target.closest('[data-action="comprar"]');
    if (buyBtn) { if (!buyBtn.disabled) abrirModal(buyBtn); return; }

    // 2. Cerrar modal — backdrop
    if (e.target.id === 'modal-bd') { cerrarModal(); return; }

    // 3. Cerrar modal — botón ✕
    if (e.target.closest('[data-action="cerrar-modal"]')) { cerrarModal(); return; }

    // 4. Confirmar pedido
    const confirmBtn = e.target.closest('#modal-confirm-btn');
    if (confirmBtn) { if (!confirmBtn.disabled) confirmarPedido(); return; }

    // 5. Reintentar carga
    if (e.target.closest('[data-action="reintentar"]')) { loadCatalog(); return; }

    // 6. Cantidad −
    if (e.target.closest('#qty-minus')) {
      const inp = document.getElementById('modal-qty');
      inp.value = String(Math.max(1, (parseInt(inp.value) || 1) - 1));
      updateTotalPrice(); return;
    }

    // 7. Cantidad +
    if (e.target.closest('#qty-plus')) {
      const inp = document.getElementById('modal-qty');
      inp.value = String(Math.min(parseInt(inp.max) || 99, (parseInt(inp.value) || 1) + 1));
      updateTotalPrice(); return;
    }

    // 8. Abrir drawer de categorías
    if (e.target.closest('[data-action="abrir-drawer"]')) { abrirDrawer(); return; }

    // 9. Cerrar drawer — botón ✕
    if (e.target.closest('[data-action="cerrar-drawer"]')) { cerrarDrawer(); return; }

    // 10. Cerrar drawer — overlay
    if (e.target.id === 'drawer-overlay') { cerrarDrawer(); return; }

    // 11. Link de categoría en el drawer → cerrar y hacer scroll suave
    const catLink = e.target.closest('[data-action="nav-cat"]');
    if (catLink) {
      cerrarDrawer();
      const target = document.getElementById(catLink.dataset.target);
      if (target) {
        // Esperar a que termine la animación de cierre (300 ms) antes del scroll
        setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 320);
      }
      return;
    }
  });

  // Input directo en el campo de cantidad
  document.getElementById('modal-qty').addEventListener('input', function () {
    const max = parseInt(this.max) || 99;
    let val   = parseInt(this.value) || 1;
    if (val < 1)   val = 1;
    if (val > max) val = max;
    this.value = String(val);
    updateTotalPrice();
  });

  // Escape cierra modal Y drawer
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { cerrarModal(); cerrarDrawer(); }
  });
});

// ─── Fetch catálogo ───────────────────────────────────────────────────────────
async function loadCatalog() {
  hide('state-error'); hide('state-empty'); hide('catalog');

  // Sin slug → mostrar error sin hacer ninguna petición
  if (!TENANT) {
    document.getElementById('error-msg').textContent =
      'Tienda no encontrada. Por favor, solicita el enlace correcto al vendedor.';
    const retryBtn = document.querySelector('[data-action="reintentar"]');
    if (retryBtn) retryBtn.style.display = 'none';
    show('state-error');
    return;
  }

  show('skeleton-grid');

  try {
    const res  = await fetch(CATALOG_URL);
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'Error en la API.');

    hide('skeleton-grid');

    telefonoTiendaActual = (json.tenantWhatsapp || '').replace(/\D/g, '');

    const collections = (json.collections || []).filter(c => c.items && c.items.length);
    const totalItems  = json.totalItems || 0;

    if (collections.length === 0) { show('state-empty'); return; }

    const storeLabel = json.tenantName || toLabel(TENANT);
    document.getElementById('hero-title').textContent  = storeLabel;
    document.getElementById('hero-sub').textContent    =
      `${totalItems} producto${totalItems !== 1 ? 's' : ''} disponible${totalItems !== 1 ? 's' : ''}`;
    document.getElementById('nav-store').textContent   = storeLabel;
    document.getElementById('footer-name').textContent = storeLabel;
    document.getElementById('nav-count').textContent   =
      `${totalItems} producto${totalItems !== 1 ? 's' : ''}`;
    document.title = `${storeLabel} — Tienda`;

    buildDrawerLinks(collections);
    renderCatalog(collections);
    show('catalog');

  } catch (err) {
    hide('skeleton-grid');
    document.getElementById('error-msg').textContent = err.message || 'Error de red.';
    show('state-error');
  }
}

// ─── Offcanvas Drawer ─────────────────────────────────────────────────────────

/**
 * Construye los links del drawer a partir de las colecciones cargadas.
 * Cada botón tiene data-action="nav-cat" y data-target="col-{slug}".
 * El click se maneja en el delegated listener de arriba (punto 11).
 */
function buildDrawerLinks(collections) {
  document.getElementById('drawer-links').innerHTML = collections.map(col => `
    <button data-action="nav-cat" data-target="col-${esc(col.slug)}"
            class="w-full text-left px-3 py-2.5 rounded-md text-sm font-medium
                   text-slate-400 hover:text-slate-100 hover:bg-slate-800
                   transition-colors flex items-center gap-3">
      <span style="width:.375rem;height:.375rem;border-radius:50%;
                   background:#6366f1;flex-shrink:0;display:inline-block"></span>
      ${esc(col.name)}
    </button>
  `).join('');
}

/** Abre el panel lateral añadiendo la clase .is-open al drawer y al overlay. */
function abrirDrawer() {
  document.getElementById('drawer').classList.add('is-open');
  document.getElementById('drawer-overlay').classList.add('is-open');
  document.body.style.overflow = 'hidden';
}

/** Cierra el panel lateral quitando .is-open. La animación CSS hace el slide-out. */
function cerrarDrawer() {
  document.getElementById('drawer').classList.remove('is-open');
  document.getElementById('drawer-overlay').classList.remove('is-open');
  document.body.style.overflow = '';
}

// ─── Render secciones ─────────────────────────────────────────────────────────
function renderCatalog(collections) {
  const wrap = document.getElementById('catalog');
  wrap.innerHTML = '';

  collections.forEach((col, ci) => {
    const section     = document.createElement('section');
    section.id        = `col-${col.slug}`;
    section.className = ci > 0 ? 'mt-14' : '';

    const h2          = document.createElement('h2');
    h2.className      = 'col-title text-lg font-bold text-slate-200 mb-6';
    h2.textContent    = col.name;
    section.appendChild(h2);

    const grid        = document.createElement('div');
    grid.className    = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6';

    col.items.forEach(item => {
      stockMap[item.id] = Number(item.stock ?? 0);
      grid.appendChild(buildCard(item, col.slug));
    });

    section.appendChild(grid);
    wrap.appendChild(section);
  });
}

// ─── Tarjeta de producto ──────────────────────────────────────────────────────
function buildCard(item, collectionSlug) {
  const name  = pick(item, 'name')  || 'Producto';
  const price = pick(item, 'price');
  const desc  = pick(item, 'desc');
  const img   = pick(item, 'img');
  const stock = Number(item.stock ?? 0);

  const card         = document.createElement('article');
  card.className     = 'product-card bg-slate-900 border border-slate-800 rounded-xl overflow-hidden';
  card.dataset.id    = item.id;
  card.dataset.colsl = collectionSlug;

  const imgHTML = img
    ? `<img src="${esc(img)}" alt="${esc(name)}"
            class="w-full h-full object-cover transition duration-500 hover:scale-105"
            loading="lazy">`
    : SVG_PLACEHOLDER;

  const priceHTML = price != null
    ? `<span class="inline-block bg-indigo-600 text-white text-xs font-semibold
                    px-2.5 py-0.5 rounded-md tracking-wide">
         $${Number(price).toFixed(2)}
       </span>`
    : '';

  const btnHTML = stock <= 0
    ? `<button disabled
               class="w-full mt-4 py-2.5 rounded-lg text-sm font-medium
                      bg-slate-800 text-slate-600 cursor-not-allowed
                      border border-slate-700 btn-buy">Sin stock</button>`
    : `<button
         data-action="comprar"
         data-colslug="${esc(collectionSlug)}"
         data-id="${esc(item.id)}"
         data-name="${esc(name)}"
         data-price="${price != null ? Number(price) : 0}"
         data-img="${esc(img || '')}"
         data-stock="${stock}"
         class="w-full mt-4 py-2.5 rounded-lg text-sm font-semibold
                bg-indigo-600 hover:bg-indigo-500 text-white
                transition-colors duration-150 btn-buy">
         Comprar
       </button>`;

  card.innerHTML = `
    <div class="overflow-hidden h-48 bg-slate-800">${imgHTML}</div>
    <div class="p-4">
      <div class="flex items-start justify-between gap-2 mb-2">
        <h3 class="font-semibold text-slate-100 text-sm leading-snug flex-1">${esc(name)}</h3>
        ${priceHTML}
      </div>
      ${desc
        ? `<p class="text-slate-500 text-xs leading-relaxed mb-3 line-clamp-2">${esc(desc)}</p>`
        : '<div class="mb-3"></div>'}
      <div class="stock-badge">${buildStockBadge(stock)}</div>
      ${btnHTML}
    </div>`;

  // onerror inline viola CSP — se adjunta aquí vía addEventListener
  if (img) {
    const imgEl = card.querySelector('img');
    if (imgEl) {
      imgEl.addEventListener('error', function () {
        this.parentElement.innerHTML = SVG_PLACEHOLDER;
      });
    }
  }

  return card;
}

// ─── Abrir modal de pedido ────────────────────────────────────────────────────
function abrirModal(btnEl) {
  try {
    const colslug = btnEl.dataset.colslug;
    const id      = btnEl.dataset.id;
    const name    = btnEl.dataset.name;
    const price   = parseFloat(btnEl.dataset.price) || 0;
    const img     = btnEl.dataset.img || '';
    const stock   = parseInt(btnEl.dataset.stock) || 1;
    const card    = btnEl.closest('article');

    if (!colslug || !id) {
      toast('error', 'Error al leer los datos del producto. Recarga la página.');
      return;
    }

    pendingOrder = { collectionSlug: colslug, productId: id, name, price, stock, cardEl: card };

    // Resumen del producto
    const summaryEl = document.getElementById('modal-product-summary');
    document.getElementById('modal-product-name').textContent = name;

    const thumbHTML = img
      ? `<img src="${esc(img)}" alt="${esc(name)}"
              style="width:3.5rem;height:3.5rem;object-fit:cover;border-radius:.5rem;flex-shrink:0">`
      : `<div style="width:3.5rem;height:3.5rem;background:#0f172a;border:1px solid #334155;
                     border-radius:.5rem;flex-shrink:0;display:flex;align-items:center;
                     justify-content:center">
           <svg xmlns="http://www.w3.org/2000/svg"
                style="width:1.4rem;height:1.4rem;color:#334155"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
             <path stroke-linecap="round" stroke-linejoin="round"
               d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0
                  01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504
                  1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504
                  -1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"/>
           </svg>
         </div>`;

    summaryEl.innerHTML = `
      ${thumbHTML}
      <div>
        <p style="color:#e2e8f0;font-weight:600;font-size:.875rem;margin:0 0 .25rem">${esc(name)}</p>
        <p style="color:#94a3b8;font-size:.78rem;margin:0 0 .1rem">
          ${price > 0
            ? `Precio unitario: <strong style="color:#6366f1">$${Number(price).toFixed(2)}</strong>`
            : 'Precio a consultar'}
        </p>
        <p style="color:#475569;font-size:.72rem;margin:0">
          Stock disponible: <strong style="color:#94a3b8">${stock}</strong>
        </p>
      </div>`;

    // onerror en thumbnail también vía addEventListener
    if (img) {
      const thumbEl = summaryEl.querySelector('img');
      if (thumbEl) thumbEl.addEventListener('error', function () { this.style.display = 'none'; });
    }

    // Resetear selector de cantidad
    const qtyInput = document.getElementById('modal-qty');
    qtyInput.value = '1';
    qtyInput.max   = String(stock);
    updateTotalPrice();

    // Limpiar campos del formulario
    document.getElementById('modal-nombre').value     = '';
    document.getElementById('modal-direccion').value  = '';
    document.getElementById('modal-comentario').value = '';
    document.getElementById('modal-error').style.display = 'none';

    // Restaurar botón de confirmación a estado inicial
    const btn    = document.getElementById('modal-confirm-btn');
    btn.disabled = false;
    btn.style.background = 'linear-gradient(135deg,#25d366,#128c7e)';
    btn.style.color      = '#fff';
    btn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" style="width:1.1rem;height:1.1rem;flex-shrink:0"
           fill="currentColor" viewBox="0 0 24 24">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15
                 -.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463
                 -2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606
                 .134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371
                 -.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51
                 -.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04
                 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2
                 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118
                 .571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413
                 -.074-.124-.272-.198-.57-.347z"/>
        <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.532 5.857L.054 23.25
                 a.75.75 0 00.916.921l5.562-1.48A11.946 11.946 0 0012 24c6.627 0
                 12-5.373 12-12S18.627 0 12 0zm0 22c-1.891 0-3.659-.514-5.175-1.407
                 l-.371-.22-3.844 1.022 1.022-3.742-.242-.386A9.955 9.955 0 012 12
                 C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
      </svg>
      Enviar pedido por WhatsApp`;

    document.getElementById('modal-order').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('modal-nombre').focus(), 120);

  } catch (err) {
    console.error('[abrirModal]', err);
    toast('error', 'Error inesperado. Recarga la página.');
  }
}

function cerrarModal() {
  document.getElementById('modal-order').style.display = 'none';
  document.body.style.overflow = '';
  pendingOrder = null;
}

// ─── Precio total dinámico ────────────────────────────────────────────────────
function updateTotalPrice() {
  if (!pendingOrder) return;
  const qtyInput = document.getElementById('modal-qty');
  const qty      = Math.max(1, parseInt(qtyInput ? qtyInput.value : '1') || 1);
  const el       = document.getElementById('modal-total-price');
  if (!el) return;
  el.textContent = pendingOrder.price > 0
    ? `$${(pendingOrder.price * qty).toFixed(2)}`
    : '—';
}

// ─── Confirmar pedido — checkout + apertura WhatsApp ─────────────────────────
async function confirmarPedido() {
  if (!pendingOrder) return;

  const nombre     = document.getElementById('modal-nombre').value.trim();
  const direccion  = document.getElementById('modal-direccion').value.trim();
  const comentario = document.getElementById('modal-comentario').value.trim();
  const qty        = Math.max(1, parseInt(document.getElementById('modal-qty').value) || 1);
  const errEl      = document.getElementById('modal-error');

  if (!nombre) {
    errEl.textContent = 'Por favor ingresa tu nombre.';
    errEl.style.display = '';
    document.getElementById('modal-nombre').focus();
    return;
  }
  if (!direccion) {
    errEl.textContent = 'Por favor ingresa la dirección o punto de retiro.';
    errEl.style.display = '';
    document.getElementById('modal-direccion').focus();
    return;
  }
  errEl.style.display = 'none';

  // Validar que la tienda tenga WhatsApp configurado ANTES de tocar el stock
  if (!telefonoTiendaActual) {
    alert('Esta tienda aún no tiene un número de WhatsApp configurado para recibir pedidos.');
    return;
  }

  const btn     = document.getElementById('modal-confirm-btn');
  btn.disabled  = true;
  btn.innerHTML = '<span class="spin"></span> Verificando stock…';

  try {
    const res  = await fetch(CHECKOUT_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        items: [{
          collectionSlug: pendingOrder.collectionSlug,
          productId:      pendingOrder.productId,
          quantity:       qty,
        }],
      }),
    });
    const json = await res.json();

    if (!json.success) {
      if (json.code === 'INSUFFICIENT_STOCK' || json.code === 'RACE_CONDITION') {
        // Actualizar tarjeta a "Sin stock" sin recargar la página
        if (pendingOrder.cardEl) {
          const stockDiv = pendingOrder.cardEl.querySelector('.stock-badge');
          if (stockDiv) stockDiv.innerHTML = buildStockBadge(0);
          const buyBtnEl = pendingOrder.cardEl.querySelector('.btn-buy');
          if (buyBtnEl) {
            buyBtnEl.disabled    = true;
            buyBtnEl.textContent = 'Sin stock';
            buyBtnEl.style.cssText =
              'width:100%;margin-top:1rem;padding:.625rem;border-radius:.5rem;' +
              'background:#1e293b;color:#475569;border:1px solid #334155;' +
              'font-size:.875rem;font-weight:600;cursor:not-allowed';
          }
        }
        errEl.textContent    = json.message || 'Producto agotado.';
        errEl.style.display  = '';
        btn.disabled         = false;
        btn.innerHTML        = 'Sin stock disponible';
        btn.style.background = '#1e293b';
        btn.style.color      = '#64748b';
      } else {
        errEl.textContent   = json.message || 'Error al procesar el pedido.';
        errEl.style.display = '';
        btn.disabled        = false;
        btn.innerHTML       = 'Reintentar';
      }
      return;
    }

    // ── Stock descontado — actualizar badge y botón de la tarjeta ───────────
    const orderItem  = json.order.items[0];
    const nuevoStock = Number(orderItem.stockRestante);
    stockMap[pendingOrder.productId] = nuevoStock;

    if (pendingOrder.cardEl) {
      const stockDiv = pendingOrder.cardEl.querySelector('.stock-badge');
      if (stockDiv) stockDiv.innerHTML = buildStockBadge(nuevoStock);
      const buyBtnEl = pendingOrder.cardEl.querySelector('.btn-buy');
      if (nuevoStock <= 0) {
        if (buyBtnEl) {
          buyBtnEl.disabled    = true;
          buyBtnEl.textContent = 'Sin stock';
          buyBtnEl.style.cssText =
            'width:100%;margin-top:1rem;padding:.625rem;border-radius:.5rem;' +
            'background:#1e293b;color:#475569;border:1px solid #334155;' +
            'font-size:.875rem;font-weight:600;cursor:not-allowed';
        }
      } else {
        if (buyBtnEl) buyBtnEl.dataset.stock = String(nuevoStock);
      }
    }

    // ── Mensaje WhatsApp — recibo formal sin emojis ──────────────────────────
    const storeLabel = document.getElementById('nav-store').textContent || 'la tienda';
    const unitPrice  = pendingOrder.price > 0
      ? `$${Number(pendingOrder.price).toFixed(2)}`
      : 'a consultar';
    const totalStr   = pendingOrder.price > 0
      ? `$${(Number(pendingOrder.price) * qty).toFixed(2)}`
      : 'a consultar';
    const now = new Date().toLocaleString('es', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    let msg  = `*PEDIDO — ${storeLabel}*\n\n`;
    msg     += `*Cliente:* ${nombre}\n`;
    msg     += `*Entrega:* ${direccion}\n`;
    if (comentario) msg += `*Notas:* ${comentario}\n`;
    msg     += `\n*Producto:* ${pendingOrder.name}\n`;
    msg     += `*Cantidad:* ${qty} unidad${qty !== 1 ? 'es' : ''}\n`;
    msg     += `*Precio unitario:* ${unitPrice}\n`;
    msg     += `*Total:* ${totalStr}\n`;
    msg     += `\n${now}`;

    window.open(`https://wa.me/${telefonoTiendaActual}?text=${encodeURIComponent(msg)}`, '_blank');

    cerrarModal();
    toast('success', 'Pedido enviado. Revisa WhatsApp para confirmarlo.');

  } catch (err) {
    console.error('[confirmarPedido]', err);
    errEl.textContent   = 'Error de conexión. Intenta de nuevo.';
    errEl.style.display = '';
    btn.disabled        = false;
    btn.innerHTML       = 'Reintentar';
  }
}

// ─── Stock badge ──────────────────────────────────────────────────────────────
function buildStockBadge(n) {
  n = Number(n ?? 0);
  if (n <= 0) {
    return `<span style="display:inline-flex;align-items:center;font-size:.7rem;font-weight:600;
                         padding:.15rem .6rem;border-radius:.375rem;
                         background:rgba(127,29,29,.3);color:#f87171;
                         border:1px solid rgba(239,68,68,.2)">Agotado</span>`;
  }
  if (n <= 5) {
    return `<span style="display:inline-flex;align-items:center;font-size:.7rem;font-weight:600;
                         padding:.15rem .6rem;border-radius:.375rem;
                         background:rgba(120,53,15,.3);color:#fbbf24;
                         border:1px solid rgba(245,158,11,.2)">Últimas ${n} unidades</span>`;
  }
  return `<span style="display:inline-flex;align-items:center;font-size:.7rem;font-weight:600;
                       padding:.15rem .6rem;border-radius:.375rem;
                       background:rgba(6,78,59,.3);color:#34d399;
                       border:1px solid rgba(52,211,153,.2)">${n} en stock</span>`;
}

// ─── Skeletons de carga ───────────────────────────────────────────────────────
function showSkeletons() {
  document.getElementById('skeleton-grid').innerHTML = Array(8).fill(`
    <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div class="skeleton h-48 w-full rounded-none"></div>
      <div class="p-4 space-y-2.5">
        <div class="flex justify-between gap-2">
          <div class="skeleton h-4 flex-1"></div>
          <div class="skeleton h-4 w-16"></div>
        </div>
        <div class="skeleton h-3 w-full"></div>
        <div class="skeleton h-3 w-3/4"></div>
        <div class="skeleton h-4 w-28 mt-1"></div>
        <div class="skeleton h-9 w-full mt-2"></div>
      </div>
    </div>
  `).join('');
}

// ─── Toast de notificación ────────────────────────────────────────────────────
function toast(type, msg) {
  const prev = document.querySelector('.fs-toast');
  if (prev) {
    prev.style.animation = 'toastOut .2s ease forwards';
    setTimeout(() => prev.remove(), 200);
  }
  const colors = {
    success: 'background:#064e3b;border-color:#065f46',
    error:   'background:#7f1d1d;border-color:#991b1b',
    info:    'background:#1e293b;border-color:#334155',
  };
  const el = document.createElement('div');
  el.className  = 'fs-toast';
  el.style.cssText =
    'position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);z-index:9999;' +
    'display:flex;align-items:center;gap:.5rem;padding:.65rem 1.25rem;' +
    'border-radius:.5rem;border:1px solid;font-size:.8125rem;font-weight:500;color:#fff;' +
    'white-space:nowrap;max-width:calc(100vw - 2rem);letter-spacing:.01em;' +
    'box-shadow:0 8px 24px rgba(0,0,0,.4);animation:toastIn .25s ease;' +
    (colors[type] || colors.info);
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => {
    if (el.parentNode) {
      el.style.animation = 'toastOut .25s ease forwards';
      setTimeout(() => el.remove(), 250);
    }
  }, 3500);
}

// ─── Utilidades ───────────────────────────────────────────────────────────────
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function toLabel(slug) {
  return slug.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }
