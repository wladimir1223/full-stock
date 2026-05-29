/**
 * content.js — Panel del Cliente (Gestor de Contenido Dinámico).
 * Genera formularios y tablas CRUD a partir del esquema de cada colección.
 * Soporta subida real de archivos para campos image_url via /admin/upload.
 */

const Content = (() => {
  let activeSlug   = null;
  let activeSchema = null;
  let editingId    = null; // null = creando, string = editando

  // ─── Render principal ──────────────────────────────────────────────────────

  async function render(container, options) {
    options = options || {};
    container.innerHTML = `
      <div class="flex flex-col lg:flex-row gap-4 lg:gap-6">
        <!-- Categorías: barra lateral en desktop, bloque completo en móvil -->
        <aside class="lg:w-48 xl:w-56 shrink-0">
          <h2 class="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
            Mis Categorías
          </h2>
          <nav id="col-nav" class="space-y-1">
            <div class="text-slate-500 text-sm">Cargando…</div>
          </nav>
        </aside>
        <main class="flex-1 min-w-0" id="content-main">
          <div class="flex flex-col items-center justify-center h-64 text-slate-500">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 mb-3 opacity-30"
                 fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                    d="M4 6h16M4 10h16M4 14h16M4 18h8"/>
            </svg>
            <p>Selecciona una categoría para ver y gestionar sus productos.</p>
          </div>
        </main>
      </div>
    `;
    await loadCollectionNav(container, options);
  }

  // ─── Sidebar ───────────────────────────────────────────────────────────────

  async function loadCollectionNav(container, options) {
    options = options || {};
    const nav = container.querySelector('#col-nav');
    try {
      const { data } = await API.collections.list();
      if (data.length === 0) {
        nav.innerHTML =
          '<p class="text-slate-500 text-sm">Sin categorías.<br/>' +
          'Ve a <strong class="text-slate-400">Mis Categorías</strong> para crear una.</p>';
        return;
      }
      nav.innerHTML = '';
      let autoTarget = null;
      data.forEach(col => {
        const btn = document.createElement('button');
        btn.className =
          'w-full text-left px-3 py-3 lg:py-2 rounded-lg text-sm text-slate-300 ' +
          'hover:bg-slate-700 hover:text-white transition nav-item';
        btn.dataset.slug = col.slug;
        btn.innerHTML = `
          <span class="block font-medium">${escHtml(col.name)}</span>
          <span class="block text-xs text-slate-500">${col.fields.length} campo${col.fields.length !== 1 ? 's' : ''}</span>
        `;
        btn.addEventListener('click', () => selectCollection(container, col));
        nav.appendChild(btn);
        if (options.autoSelectSlug && col.slug === options.autoSelectSlug) {
          autoTarget = col;
        }
      });
      // Auto-seleccionar si viene desde Catalog
      if (autoTarget) {
        await selectCollection(container, autoTarget, options);
      }
    } catch {
      nav.innerHTML = '<p class="text-red-400 text-sm">Error al cargar.</p>';
    }
  }

  function setActiveNavItem(container, slug) {
    container.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('bg-indigo-600',  el.dataset.slug === slug);
      el.classList.toggle('text-white',     el.dataset.slug === slug);
      el.classList.toggle('text-slate-300', el.dataset.slug !== slug);
    });
  }

  // ─── Seleccionar colección ─────────────────────────────────────────────────

  async function selectCollection(container, col, opts) {
    activeSlug   = col.slug;
    activeSchema = col;
    editingId    = null;
    setActiveNavItem(container, col.slug);
    await renderTable(container, opts || {});
  }

  // ─── Helpers de plan ──────────────────────────────────────────────────────

  const PLAN_META = {
    basic: { label: 'Basic',   bg: '#1e293b', border: '#334155', color: '#94a3b8', limit: 100  },
    pro:   { label: 'Pro ✨',  bg: '#1e1b4b', border: '#4338ca', color: '#a5b4fc', limit: 500  },
    full:  { label: 'Full 🚀', bg: '#2e1065', border: '#7c3aed', color: '#c4b5fd', limit: 1000 },
  };

  function buildUsageBar(usage) {
    const meta    = PLAN_META[usage.plan] || PLAN_META.basic;
    const pct     = Math.min(100, Math.round((usage.current / usage.limit) * 100));
    const atLimit = usage.current >= usage.limit;
    const barColor = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#22c55e';

    return `
      <div class="card mb-5" style="padding:1rem">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.6rem">
          <div style="display:flex;align-items:center;gap:.625rem">
            <span style="font-size:.72rem;font-weight:600;color:#94a3b8;text-transform:uppercase;
                         letter-spacing:.06em">Uso del Catálogo</span>
            <span style="background:${meta.bg};border:1px solid ${meta.border};color:${meta.color};
                         font-size:.65rem;font-weight:700;padding:.18rem .55rem;
                         border-radius:.375rem;text-transform:uppercase;letter-spacing:.05em">
              ${meta.label}
            </span>
          </div>
          <span style="font-size:.78rem;font-weight:700;color:${atLimit ? '#f87171' : '#94a3b8'}">
            ${usage.current} / ${usage.limit} productos
          </span>
        </div>
        <!-- barra de progreso -->
        <div style="background:#0f172a;border-radius:9999px;height:8px;overflow:hidden">
          <div style="height:8px;border-radius:9999px;width:${pct}%;
                      background:${barColor};transition:width .5s ease"></div>
        </div>
        ${atLimit ? `
        <div style="margin-top:.625rem;display:flex;align-items:center;gap:.5rem;
                    background:#450a0a;border:1px solid #7f1d1d;border-radius:.5rem;
                    padding:.5rem .875rem">
          <span style="font-size:1rem">⛔</span>
          <span style="font-size:.78rem;font-weight:600;color:#fca5a5">
            Has alcanzado el límite de tu plan.
            Contacta al administrador para subir de nivel.
          </span>
        </div>` : ''}
      </div>
    `;
  }

  // ─── Tabla ────────────────────────────────────────────────────────────────

  async function renderTable(container, opts) {
    opts = opts || {};
    const main = container.querySelector('#content-main');
    main.innerHTML = '<div class="text-slate-400 text-sm">Cargando datos…</div>';

    try {
      // Fetch en paralelo: esquema, items y uso del plan
      const [schemaRes, itemsRes, usageRes] = await Promise.all([
        API.collections.get(activeSlug),
        API.items.list(activeSlug),
        API.planUsage.get().catch(() => ({ data: { plan: 'basic', limit: 35, current: 0 } })),
      ]);
      activeSchema    = schemaRes.data;
      const data      = itemsRes.data;

      // Actualizar índice de búsqueda global del navbar
      if (window.App && typeof App.indexProducts === 'function') {
        App.indexProducts(activeSlug, schemaRes.data.name, data);
      }

      const usage     = (usageRes && usageRes.data) || { plan: 'basic', limit: 35, current: 0 };
      const atLimit   = usage.current >= usage.limit;

      main.innerHTML = `
        <!-- ── Cabecera de la colección ───────────────────────────────── -->
        <div class="flex items-center justify-between mb-4 gap-3 flex-wrap">

          <!-- Título + botón editar colección -->
          <div style="display:flex;align-items:center;gap:.625rem;min-width:0">
            <h2 class="text-xl font-bold text-white" style="margin:0;line-height:1.2">
              ${escHtml(activeSchema.name)}
            </h2>

            <!-- Botón editar colección (lápiz) — CSP-safe, sin inline handlers -->
            <button id="edit-collection-btn"
              title="Editar nombre de esta categoría"
              style="display:flex;align-items:center;justify-content:center;
                     width:2.75rem;height:2.75rem;border-radius:.4rem;flex-shrink:0;
                     background:transparent;border:1px solid #334155;
                     color:#475569;cursor:pointer;transition:all .15s">
              <svg xmlns="http://www.w3.org/2000/svg"
                   style="width:.9rem;height:.9rem;pointer-events:none"
                   fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5
                     m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
              </svg>
            </button>
          </div>

          <!-- Acciones: Importar / Exportar + Añadir -->
          <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
            <button id="ie-open-btn" class="btn-secondary"
              style="display:inline-flex;align-items:center;gap:.4rem;font-size:.8rem">
              <svg xmlns="http://www.w3.org/2000/svg"
                   style="width:.82rem;height:.82rem;flex-shrink:0;pointer-events:none"
                   fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/>
              </svg>
              Importar / Exportar
            </button>
            <button id="new-item-btn" class="btn-primary"
              ${atLimit ? 'disabled title="Límite de plan alcanzado"' : ''}>
              + Añadir ${escHtml(activeSchema.name.replace(/s$/i, ''))}
            </button>
          </div>
        </div>

        ${buildUsageBar(usage)}

        <div id="item-form-wrapper" class="hidden card mb-5 animate-fade-in"></div>
        <div class="overflow-x-auto rounded-xl border border-slate-700">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-slate-800 text-slate-400 text-left">
                ${activeSchema.fields.map(f => `<th class="px-4 py-3 font-medium">${escHtml(f.label)}</th>`).join('')}
                <th class="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody id="items-tbody" class="divide-y divide-slate-700/50">
              ${data.length === 0
                ? `<tr><td colspan="${activeSchema.fields.length + 1}"
                     class="px-4 py-8 text-center text-slate-500">
                     Sin datos. Añade el primer elemento.
                   </td></tr>`
                : data.map(item => renderRow(item)).join('')}
            </tbody>
          </table>
        </div>
      `;

      // ── Botón editar colección ────────────────────────────────────────────
      const editColBtn = main.querySelector('#edit-collection-btn');
      if (editColBtn) {
        editColBtn.addEventListener('mouseover', () => {
          editColBtn.style.borderColor = '#6366f1';
          editColBtn.style.color       = '#a5b4fc';
          editColBtn.style.background  = 'rgba(99,102,241,.1)';
        });
        editColBtn.addEventListener('mouseout', () => {
          editColBtn.style.borderColor = '#334155';
          editColBtn.style.color       = '#475569';
          editColBtn.style.background  = 'transparent';
        });
        editColBtn.addEventListener('click', () => {
          openEditCollectionModal(activeSchema, () => renderTable(container, opts));
        });
      }

      // ── Listeners de fila ────────────────────────────────────────────────
      // ── Importar / Exportar ────────────────────────────────────────────────
      const ieOpenBtn = main.querySelector('#ie-open-btn');
      if (ieOpenBtn) {
        ieOpenBtn.addEventListener('click', () => openImportExportModal(container));
      }

      if (!atLimit) {
        main.querySelector('#new-item-btn').addEventListener('click', () => openForm(main));
      }
      bindRowActions(main, data);

      // CSP-safe: onerror de imágenes vía addEventListener
      main.querySelectorAll('#items-tbody img').forEach(img => {
        img.addEventListener('error', function () {
          this.style.display = 'none';
          const fallback = this.nextElementSibling;
          if (fallback) fallback.style.display = 'flex';
        });
      });

      if (opts.autoOpenForm && !atLimit) {
        openForm(main);
        main.querySelector('#item-form-wrapper')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      // Apertura automática del editor para un item concreto (flujo "Escanear y Editar").
      if (opts.autoEditId) {
        const target = data.find(i => i.id === opts.autoEditId);
        if (target) {
          openForm(main, target);
          main.querySelector('#item-form-wrapper')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          App.showToast('El producto escaneado ya no está disponible.', 'info');
        }
      }
    } catch {
      main.innerHTML = '<p class="text-red-400">Error al cargar los datos.</p>';
    }
  }

  // ─── Fila de tabla ────────────────────────────────────────────────────────

  // Badge de stock con colores semafóricos
  function stockBadge(n) {
    n = Number(n ?? 0);
    if (n <= 0) return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-900/50 text-red-400 border border-red-700/50">⚠ Sin stock</span>`;
    if (n <= 9) return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-900/50 text-amber-400 border border-amber-700/50">▲ ${n}</span>`;
    return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-900/50 text-emerald-400 border border-emerald-700/50">✓ ${n}</span>`;
  }

  function renderRow(item) {
    const hasStock = activeSchema.fields.some(f => f.key === 'stock');

    const cells = activeSchema.fields.map(f => {
      const val = item[f.key];

      // Columna stock → badge de color
      if (f.key === 'stock') {
        return `<td class="px-4 py-3">${stockBadge(val)}</td>`;
      }

      if (isImageField(f) && val) {
        return `<td class="px-4 py-3">
          <img src="${escHtml(val)}" alt="" class="w-12 h-12 object-cover rounded-lg border border-slate-700"
            loading="lazy"
          />
          <div style="display:none"
            class="w-12 h-12 rounded-lg border border-slate-700 bg-slate-800 items-center justify-center text-slate-500 text-xs">
            ?
          </div>
        </td>`;
      }
      return `<td class="px-4 py-3 text-slate-200 max-w-xs truncate">${escHtml(String(val ?? '—'))}</td>`;
    }).join('');

    return `
      <tr class="hover:bg-slate-800/50 transition" data-id="${item.id}">
        ${cells}
        <td class="px-3 py-2 text-right whitespace-nowrap">
          ${hasStock ? `<button class="inline-flex items-center text-emerald-400 hover:text-emerald-300 text-xs font-semibold py-2 px-2.5 rounded-lg hover:bg-emerald-950/30 transition btn-sell"
            data-id="${item.id}">Vender 1</button>` : ''}
          <button class="inline-flex items-center text-indigo-400 hover:text-indigo-300 text-xs font-medium py-2 px-2.5 rounded-lg hover:bg-indigo-950/30 transition btn-edit"
            data-id="${item.id}">Editar</button>
          <button class="inline-flex items-center text-red-400 hover:text-red-300 text-xs font-medium py-2 px-2.5 rounded-lg hover:bg-red-950/30 transition btn-delete"
            data-id="${item.id}">Eliminar</button>
        </td>
      </tr>
    `;
  }

  function bindRowActions(main, data) {
    main.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = data.find(i => i.id === btn.dataset.id);
        if (item) openForm(main, item);
      });
    });
    main.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', () => deleteItemHandler(main, btn.dataset.id));
    });
    main.querySelectorAll('.btn-sell').forEach(btn => {
      btn.addEventListener('click', () => sellItemHandler(main, btn.dataset.id, btn));
    });
  }

  // ─── Formulario dinámico ──────────────────────────────────────────────────

  // Claves que se reconocen como campo "precio de venta" para el calculador
  const PRECIO_KEYS = ['precio', 'price', 'Price', 'Precio'];

  function openForm(main, item = null) {
    editingId     = item ? item.id : null;
    const isEdit  = editingId !== null;
    const wrapper = main.querySelector('#item-form-wrapper');

    // ── Detectar si existe un campo de precio para activar la calculadora ──
    const precioField    = activeSchema.fields.find(f => PRECIO_KEYS.includes(f.key));
    const hasPrecio      = !!precioField;
    const precioCostoVal = item ? (item.precioCosto ?? '') : '';

    // ── Construir campos, inyectando #precio-costo justo después de precio ──
    let fieldsHtml = '';
    for (const f of activeSchema.fields) {
      fieldsHtml += buildInput(f, item);
      if (hasPrecio && f.key === precioField.key) {
        fieldsHtml += `
          <div>
            <label class="label" for="precio-costo">Precio de Costo</label>
            <input type="number" id="precio-costo" class="input-field w-full"
              value="${escHtml(String(precioCostoVal))}"
              placeholder="Costo de adquisición"
              step="any" min="0"/>
          </div>
        `;
      }
    }

    // ── Indicador de ganancia (solo cuando hay campo precio) ────────────────
    const profitHtml = hasPrecio ? `
      <div id="profit-indicator"
           style="background:#0f172a;border:1px solid #1e293b;border-radius:.5rem;
                  padding:.625rem 1rem;margin-top:.125rem;margin-bottom:.125rem;
                  display:flex;align-items:center;justify-content:space-between;
                  gap:1rem;flex-wrap:wrap;transition:background .2s,border-color .2s">
        <span style="font-size:.7rem;color:#475569;font-weight:600;text-transform:uppercase;
                     letter-spacing:.06em">Ganancia por unidad</span>
        <span id="profit-value"
              style="font-size:.8rem;font-weight:700;color:#94a3b8;font-family:monospace;
                     transition:color .2s">
          $0.00 (0% margen)
        </span>
      </div>
    ` : '';

    wrapper.innerHTML = `
      <h3 class="text-base font-semibold text-white mb-4">
        ${isEdit ? 'Editar' : 'Nuevo'} ${activeSchema.name.replace(/s$/, '')}
      </h3>
      <div class="grid gap-4 sm:grid-cols-2">
        ${fieldsHtml}
      </div>
      ${profitHtml}
      <div id="form-error" class="hidden text-red-400 text-sm mt-3"></div>
      <div class="flex gap-3 mt-5">
        <button id="submit-form-btn" class="btn-primary flex-1">
          ${isEdit ? 'Actualizar' : 'Crear'}
        </button>
        <button id="cancel-form-btn" class="btn-secondary px-5">Cancelar</button>
      </div>
    `;

    wrapper.classList.remove('hidden');
    wrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Activar widgets de imagen luego de que el HTML esté en el DOM
    activeSchema.fields
      .filter(f => isImageField(f))
      .forEach(f => bindImageWidget(wrapper, f.key, item?.[f.key] ?? ''));

    // ── Calculadora de ganancia + sanitización defensiva (sin negativos) ──────
    // updateProfit se declara aquí para que los listeners de sanitización
    // también puedan llamarla sin depender del scope del bloque hasPrecio.
    let updateProfit = null;

    if (hasPrecio) {
      const pvEl  = wrapper.querySelector(`#field-${precioField.key}`);
      const pcEl  = wrapper.querySelector('#precio-costo');
      const indEl = wrapper.querySelector('#profit-indicator');
      const valEl = wrapper.querySelector('#profit-value');

      updateProfit = function () {
        const pv  = parseFloat(pvEl  ? pvEl.value  : 0) || 0;
        const pc  = parseFloat(pcEl  ? pcEl.value  : 0) || 0;
        const gan = pv - pc;
        const mar = pv > 0 ? (gan / pv * 100) : 0;
        const neg = gan < 0;

        if (valEl) {
          valEl.textContent = '$' + gan.toFixed(2) + ' (' + mar.toFixed(1) + '% margen)';
          valEl.style.color = neg ? '#f87171' : gan > 0 ? '#34d399' : '#94a3b8';
        }
        if (indEl) {
          indEl.style.borderColor = neg ? '#7f1d1d' : '#1e293b';
          indEl.style.background  = neg ? 'rgba(127,29,29,.12)' : '#0f172a';
        }
      };

      if (pvEl) pvEl.addEventListener('input', updateProfit);
      if (pcEl) pcEl.addEventListener('input', updateProfit);
      updateProfit(); // inicializa con los valores actuales
    }

    // ── Sanitización defensiva — intercepta en tiempo real ──────────────────
    // Aplica a TODOS los inputs numéricos del formulario (campos del esquema
    // + #precio-costo). Si el usuario escribe "-" o pega un valor negativo,
    // el campo se restablece a "0" al instante y se recalcula la ganancia.
    wrapper.querySelectorAll('input[type="number"]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        const v = parseFloat(this.value);
        if (!isNaN(v) && v < 0) {
          this.value = '0';
          if (updateProfit) updateProfit();
        }
      });
    });

    wrapper.querySelector('#cancel-form-btn').addEventListener('click', () => {
      wrapper.classList.add('hidden');
      editingId = null;
    });

    wrapper.querySelector('#submit-form-btn').addEventListener('click', () => submitForm(main, wrapper));
  }

  // ─── Construcción de inputs ───────────────────────────────────────────────

  function buildInput(field, item = null) {
    // Para items nuevos el campo "stock" siempre arranca en 0
    const value  = item ? (item[field.key] ?? '') : (field.key === 'stock' ? 0 : '');
    const baseId = `field-${field.key}`;
    const isWide = field.type === 'long_text' || isImageField(field);

    let inner;

    // Normalizar: si el campo se detecta como imagen por nombre, tratarlo igual que image_url
    const effectiveType = isImageField(field) ? 'image_url' : field.type;

    switch (effectiveType) {
      case 'long_text':
        inner = `
          <textarea id="${baseId}" class="input-field w-full" rows="3"
            placeholder="${field.label}">${escHtml(String(value))}</textarea>
        `;
        break;

      case 'number': {
        // Stock: enteros ≥ 0. Otros campos numéricos: decimal libre, también ≥ 0.
        // min="0" en todos impide que el navegador acepte negativos de forma nativa.
        const isStock = (field.key === 'stock');
        inner = `
          <input type="number" id="${baseId}" class="input-field w-full"
            value="${escHtml(String(value))}" placeholder="${field.label}"
            min="0" ${isStock ? 'step="1"' : 'step="any"'}/>
        `;
        break;
      }

      case 'image_url':
        // El widget se divide en:
        //   1. Input oculto que guarda la URL final (lo que se envía al servidor)
        //   2. Zona de drop / file picker
        //   3. Preview en tiempo real
        //   4. Input de URL manual como alternativa
        inner = `
          <!-- Valor real que se leerá al guardar -->
          <input type="hidden" id="${baseId}" value="${escHtml(String(value))}"/>

          <!-- Drop zone + file picker -->
          <div id="dropzone-${field.key}"
            class="relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-600 bg-slate-900 p-4 cursor-pointer transition hover:border-indigo-500 hover:bg-slate-800/50"
            style="min-height:120px">

            <!-- Preview de imagen (visible si ya hay valor) -->
            <img id="preview-${field.key}"
              src="${escHtml(String(value))}"
              alt="Preview"
              class="${value ? '' : 'hidden'} max-h-32 max-w-full rounded-lg object-contain mb-1 border border-slate-700"
            />

            <!-- Icono y texto cuando no hay imagen -->
            <div id="placeholder-${field.key}" class="${value ? 'hidden' : 'flex flex-col items-center gap-1'}">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
              <span class="text-xs text-slate-400">Haz clic o arrastra una imagen aquí</span>
              <span class="text-xs text-slate-600">PNG, JPG, WebP, GIF · máx. 5 MB</span>
            </div>

            <!-- Spinner durante la subida -->
            <div id="upload-spinner-${field.key}" class="hidden flex-col items-center gap-2">
              <div class="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              <span class="text-xs text-slate-400">Subiendo imagen…</span>
            </div>

            <!-- Input file invisible que cubre toda la zona -->
            <input type="file" id="file-${field.key}" accept="image/jpeg,image/png,image/webp,image/gif"
              class="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
          </div>

          <!-- Error de upload puntual -->
          <div id="upload-error-${field.key}" class="hidden text-red-400 text-xs mt-1"></div>

          <!-- URL manual como alternativa -->
          <div class="mt-2">
            <label class="text-xs text-slate-500 block mb-1">O pega una URL directamente:</label>
            <input type="url" id="url-input-${field.key}" class="input-field w-full text-xs"
              placeholder="https://ejemplo.com/imagen.jpg"
              value="${escHtml(String(value))}"/>
          </div>
        `;
        break;

      default: // short_text
        inner = `
          <input type="text" id="${baseId}" class="input-field w-full"
            value="${escHtml(String(value))}" placeholder="${field.label}"/>
        `;
    }

    return `
      <div class="${isWide ? 'sm:col-span-2' : ''}">
        <label class="label" for="${baseId}">${field.label}</label>
        ${inner}
      </div>
    `;
  }

  // ─── Widget de imagen: lógica de upload y preview ────────────────────────

  function bindImageWidget(wrapper, key, currentValue) {
    const hiddenInput  = wrapper.querySelector(`#field-${key}`);
    const fileInput    = wrapper.querySelector(`#file-${key}`);
    const preview      = wrapper.querySelector(`#preview-${key}`);
    const placeholder  = wrapper.querySelector(`#placeholder-${key}`);
    const spinner      = wrapper.querySelector(`#upload-spinner-${key}`);
    const uploadError  = wrapper.querySelector(`#upload-error-${key}`);
    const urlInput     = wrapper.querySelector(`#url-input-${key}`);
    const dropzone     = wrapper.querySelector(`#dropzone-${key}`);

    if (!fileInput) return;

    // Cuando el usuario escribe una URL manual → actualizar hidden + preview
    urlInput.addEventListener('input', () => {
      const url = urlInput.value.trim();
      hiddenInput.value = url;
      if (url) {
        preview.src = url;
        preview.classList.remove('hidden');
        placeholder.classList.add('hidden');
        placeholder.style.display = 'none';
      } else {
        preview.classList.add('hidden');
        placeholder.classList.remove('hidden');
        placeholder.style.display = '';
      }
    });

    // Drag & Drop sobre la dropzone
    dropzone.addEventListener('dragover', e => {
      e.preventDefault();
      dropzone.classList.add('border-indigo-500', 'bg-slate-800');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('border-indigo-500', 'bg-slate-800');
    });
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('border-indigo-500', 'bg-slate-800');
      const file = e.dataTransfer?.files?.[0];
      if (file) handleFileUpload(file, key, hiddenInput, preview, placeholder, spinner, uploadError, urlInput);
    });

    // Click en la dropzone → file picker
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) handleFileUpload(file, key, hiddenInput, preview, placeholder, spinner, uploadError, urlInput);
    });
  }

  async function handleFileUpload(file, key, hiddenInput, preview, placeholder, spinner, uploadError, urlInput) {
    // Validación client-side rápida
    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!ALLOWED.includes(file.type)) {
      uploadError.textContent = 'Tipo de archivo no permitido. Usa PNG, JPG, WebP o GIF.';
      uploadError.classList.remove('hidden');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      uploadError.textContent = 'El archivo supera el límite de 5 MB.';
      uploadError.classList.remove('hidden');
      return;
    }

    // UI: mostrar spinner, ocultar preview y placeholder
    uploadError.classList.add('hidden');
    preview.classList.add('hidden');
    placeholder.classList.add('hidden');
    placeholder.style.display = 'none';
    spinner.classList.remove('hidden');
    spinner.style.display = 'flex';

    try {
      const formData = new FormData();
      formData.append('image', file);

      // Usar API.upload() para que incluya el Bearer token automaticamente
      const json = await API.upload(formData);

      if (!json.success) throw new Error(json.message || 'Error al subir.');

      // Éxito: actualizar hidden input y mostrar preview
      hiddenInput.value = json.url;
      urlInput.value    = json.url;
      preview.src       = json.url;
      preview.classList.remove('hidden');
    } catch (err) {
      uploadError.textContent = err.message || 'Error al subir la imagen.';
      uploadError.classList.remove('hidden');
      // Restaurar estado previo
      if (hiddenInput.value) {
        preview.src = hiddenInput.value;
        preview.classList.remove('hidden');
      } else {
        placeholder.classList.remove('hidden');
        placeholder.style.display = '';
      }
    } finally {
      spinner.classList.add('hidden');
      spinner.style.display = 'none';
    }
  }

  // ─── Submit del formulario ────────────────────────────────────────────────

  async function submitForm(main, wrapper) {
    const payload = {};
    const errors  = [];

    for (const f of activeSchema.fields) {
      const el  = wrapper.querySelector(`#field-${f.key}`);
      const val = el ? el.value.trim() : '';

      if (val === '' && val !== 0) {
        errors.push(`El campo "${f.label}" es obligatorio.`);
        continue;
      }

      if (f.type === 'number') {
        const num = Number(val);
        // Validación defensiva: ningún campo numérico acepta negativos
        if (num < 0) {
          errors.push(
            f.key === 'stock'
              ? 'El stock no puede ser un número negativo.'
              : `"${f.label}" no puede ser un número negativo.`
          );
          continue;
        }
        payload[f.key] = num;
      } else {
        payload[f.key] = val;
      }
    }

    // ── Incluir precioCosto si el campo está presente en el formulario ────────
    const costoEl = wrapper.querySelector('#precio-costo');
    if (costoEl && costoEl.value.trim() !== '') {
      const costo = Number(costoEl.value);
      if (!isNaN(costo) && costo >= 0) payload.precioCosto = costo;
    }

    if (errors.length > 0) {
      const errDiv = wrapper.querySelector('#form-error');
      errDiv.textContent = errors[0];
      errDiv.classList.remove('hidden');
      return;
    }

    const btn = wrapper.querySelector('#submit-form-btn');
    btn.disabled    = true;
    btn.textContent = 'Guardando…';

    try {
      if (editingId) {
        await API.items.update(activeSlug, editingId, payload);
        App.showToast('Elemento actualizado.', 'success');
      } else {
        await API.items.create(activeSlug, payload);
        App.showToast('Elemento creado.', 'success');
      }
      wrapper.classList.add('hidden');
      editingId = null;
      await renderTable(main.closest('[data-panel]') || document.getElementById('panel-content'));
    } catch (err) {
      const msg = err.message || (Array.isArray(err.errors) ? err.errors.join(', ') : 'Error al guardar.');
      wrapper.querySelector('#form-error').textContent = msg;
      wrapper.querySelector('#form-error').classList.remove('hidden');
      btn.disabled    = false;
      btn.textContent = editingId ? 'Actualizar' : 'Crear';
    }
  }

  // ─── Registrar venta (Vender 1) ──────────────────────────────────────────

  async function sellItemHandler(main, id, btn) {
    const prev = btn.textContent;
    btn.disabled    = true;
    btn.textContent = '…';

    try {
      const result = await API.items.sell(activeSlug, id, 1);
      // Actualizar badge en la misma fila sin recargar toda la tabla
      const row      = main.querySelector(`tr[data-id="${id}"]`);
      const stockTd  = row?.querySelector('td:has(span[class*="rounded-full"])');
      if (stockTd) stockTd.innerHTML = stockBadge(result.data?.stock ?? 0);

      App.showToast(`Venta registrada. Stock: ${result.data?.stock ?? 0}`, 'success');
    } catch (err) {
      const msg = err.message || 'Error al registrar la venta.';
      // Si es stock insuficiente, mostrarlo claramente
      if (err.code === 'INSUFFICIENT_STOCK' || (err.stock !== undefined && err.stock === 0)) {
        App.showToast('Sin stock disponible.', 'error');
      } else {
        App.showToast(msg, 'error');
      }
    } finally {
      btn.disabled    = false;
      btn.textContent = prev;
    }
  }

  // ─── Eliminar item ────────────────────────────────────────────────────────

  async function deleteItemHandler(main, id) {
    if (!confirm('¿Eliminar este elemento? Esta acción no se puede deshacer.')) return;
    try {
      await API.items.delete(activeSlug, id);
      App.showToast('Elemento eliminado.', 'info');
      await renderTable(main.closest('[data-panel]') || document.getElementById('panel-content'));
    } catch {
      App.showToast('Error al eliminar.', 'error');
    }
  }

  // ─── Modal: Editar Colección ──────────────────────────────────────────────
  //
  // Abre un modal centralizado (montado en document.body, sobre todo el layout)
  // que permite renombrar la colección activa.
  // CSP-safe: cero inline handlers — toda la lógica vía addEventListener.
  //
  function openEditCollectionModal(schema, onSaved) {
    // Eliminar instancia anterior si quedó abierta
    document.getElementById('edit-col-modal')?.remove();

    const overlay = document.createElement('div');
    overlay.id    = 'edit-col-modal';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;' +
      'justify-content:center;padding:1rem;background:rgba(0,0,0,.7);' +
      'backdrop-filter:blur(4px)';

    overlay.innerHTML = `
      <div style="position:relative;width:100%;max-width:440px;
                  background:#1e293b;border:1px solid #334155;
                  border-radius:.875rem;padding:1.75rem;z-index:1;
                  animation:fadeIn .2s ease-out">

        <!-- Cabecera del modal -->
        <div style="display:flex;align-items:center;gap:.875rem;margin-bottom:1.5rem">
          <div style="width:2.375rem;height:2.375rem;border-radius:.5rem;flex-shrink:0;
                      background:linear-gradient(135deg,#6366f1,#8b5cf6);
                      display:flex;align-items:center;justify-content:center;
                      box-shadow:0 6px 16px rgba(99,102,241,.3)">
            <svg xmlns="http://www.w3.org/2000/svg"
                 style="width:1.1rem;height:1.1rem"
                 fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="1.75">
              <path stroke-linecap="round" stroke-linejoin="round"
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5
                   m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
            </svg>
          </div>
          <div>
            <h3 style="color:#f1f5f9;font-size:1rem;font-weight:700;margin:0 0 .15rem;
                       line-height:1.2">Editar categoría</h3>
            <p style="color:#64748b;font-size:.75rem;margin:0">
              Actualiza el nombre de esta colección.
            </p>
          </div>
        </div>

        <!-- Campo nombre -->
        <div style="margin-bottom:1rem">
          <label style="display:block;font-size:.7rem;font-weight:600;color:#94a3b8;
                         text-transform:uppercase;letter-spacing:.06em;margin-bottom:.375rem">
            Nombre de la categoría
          </label>
          <input id="ecm-name" type="text"
            placeholder="Ej: Productos, Menú, Servicios…"
            style="width:100%;box-sizing:border-box;background:#0f172a;
                   border:1px solid #334155;border-radius:.5rem;color:#f1f5f9;
                   padding:.6rem .75rem;font-size:.875rem;outline:none;
                   transition:border-color .15s"/>
        </div>

        <!-- Nota informativa -->
        <div style="background:#0f172a;border:1px solid #1e293b;border-radius:.5rem;
                    padding:.75rem 1rem;margin-bottom:1.25rem;
                    display:flex;gap:.625rem;align-items:flex-start">
          <svg xmlns="http://www.w3.org/2000/svg"
               style="width:.875rem;height:.875rem;color:#6366f1;flex-shrink:0;margin-top:.1rem"
               fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <p style="color:#64748b;font-size:.75rem;margin:0;line-height:1.5">
            Para añadir o eliminar campos de esta categoría, ve a
            <strong style="color:#94a3b8">Mis Categorías</strong>.
          </p>
        </div>

        <!-- Mensaje de error -->
        <div id="ecm-error"
             style="display:none;background:#450a0a;border:1px solid #991b1b;
                    border-radius:.5rem;color:#f87171;font-size:.8rem;
                    padding:.65rem 1rem;margin-bottom:1rem"></div>

        <!-- Botones de acción -->
        <div style="display:flex;gap:.75rem">
          <button id="ecm-save"
            style="flex:1;background:linear-gradient(135deg,#6366f1,#8b5cf6);
                   color:#fff;font-weight:600;font-size:.875rem;
                   padding:.65rem;border-radius:.5rem;border:none;
                   cursor:pointer;transition:opacity .15s">
            Guardar cambios
          </button>
          <button id="ecm-cancel"
            style="padding:.65rem 1.25rem;background:#0f172a;color:#94a3b8;
                   font-weight:500;font-size:.875rem;border-radius:.5rem;
                   border:1px solid #334155;cursor:pointer;transition:background .15s">
            Cancelar
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const nameInput = overlay.querySelector('#ecm-name');
    const saveBtn   = overlay.querySelector('#ecm-save');
    const cancelBtn = overlay.querySelector('#ecm-cancel');
    const errDiv    = overlay.querySelector('#ecm-error');

    // Pre-rellenar con el nombre actual
    nameInput.value = schema.name || '';

    function cerrar() { overlay.remove(); }

    // Focus ring CSP-safe
    nameInput.addEventListener('focus', () => { nameInput.style.borderColor = '#6366f1'; });
    nameInput.addEventListener('blur',  () => { nameInput.style.borderColor = '#334155'; });

    // Hover botón cancelar
    cancelBtn.addEventListener('mouseover', () => { cancelBtn.style.background = '#1e293b'; });
    cancelBtn.addEventListener('mouseout',  () => { cancelBtn.style.background = '#0f172a'; });

    // Cerrar con clic en backdrop o tecla Escape
    overlay.addEventListener('click', e => { if (e.target === overlay) cerrar(); });
    nameInput.addEventListener('keydown', e => {
      if (e.key === 'Enter')  saveBtn.click();
      if (e.key === 'Escape') cerrar();
    });
    cancelBtn.addEventListener('click', cerrar);

    // Guardar
    saveBtn.addEventListener('click', async () => {
      const newName = nameInput.value.trim();
      if (!newName) {
        errDiv.textContent   = 'El nombre no puede estar vacío.';
        errDiv.style.display = '';
        nameInput.focus();
        return;
      }

      errDiv.style.display    = 'none';
      saveBtn.disabled        = true;
      saveBtn.style.opacity   = '.6';
      saveBtn.textContent     = 'Guardando…';

      try {
        await API.collections.update(activeSlug, { name: newName });

        // Actualizar nombre en memoria para que el render inmediato lo use
        schema.name    = newName;
        activeSchema   = schema;

        cerrar();
        if (window.App) App.showToast(`Categoría renombrada a "${newName}".`, 'success');
        if (onSaved) await onSaved();
      } catch (err) {
        errDiv.textContent   = (err && err.message) ? err.message : 'Error al guardar.';
        errDiv.style.display = '';
        saveBtn.disabled     = false;
        saveBtn.style.opacity = '1';
        saveBtn.textContent  = 'Guardar cambios';
      }
    });

    // Foco automático en el input
    setTimeout(() => { nameInput.focus(); nameInput.select(); }, 60);
  }

  // ─── Detección de campos imagen ───────────────────────────────────────────
  // Devuelve true si el campo debe tratarse como imagen, ya sea por tipo
  // explícito (image_url) o por nombre clave (imagen, foto, photo, etc.)

  const IMAGE_KEYS = ['imagen', 'image', 'foto', 'photo', 'picture', 'img', 'thumbnail', 'miniatura'];

  function isImageField(field) {
    if (field.type === 'image_url') return true;
    return IMAGE_KEYS.includes((field.key || '').toLowerCase());
  }

  // ─── Utilidades ───────────────────────────────────────────────────────────

  function escHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');   // CVE-4: escape comilla simple
  }

  // ─── Importar / Exportar Masivo ─────────────────────────────────────────────
  //
  // Flujo: openImportExportModal → doExportCSV / doImport
  //   doImport: lee CSV (parseCSVNative) o XLSX (SheetJS lazy-loaded),
  //             mapea cabeceras con mapImportHeaders, sanea los valores y
  //             envía TODO el lote en UNA sola petición a /api/products/bulk-import.
  //             El backend auto-crea las categorías faltantes e inserta con
  //             insertMany (una única transacción).
  //
  // CSP-safe: cero inline handlers — toda la lógica via addEventListener.

  // ── Diccionario de sinónimos para auto-mapeo inteligente de cabeceras ────
  // Las claves son los campos normalizados que entiende el backend.
  const IMPORT_ALIASES = {
    nombre:      ['nombre','producto','title','name','articulo','item'],
    categoria:   ['categoria','category','grupo','coleccion','collection','tipo'],
    precioCosto: ['costo','preciocosto','cost','compra','coste','buyprice'],
    precioVenta: ['precio','precioventa','price','venta','valor','pvp','importe'],
    stock:       ['stock','cantidad','unidades','quantity','qty','existencias'],
    descripcion: ['descripcion','description','detalle','desc','notas'],
  };

  // Normaliza una cabecera: minúsculas, sin acentos, sin espacios/guiones.
  // "Precio Costo" → "preciocosto" · "Categoría" → "categoria"
  function normHeader(h) {
    return String(h).toLowerCase().trim()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')   // elimina acentos
      .replace(/[\s_-]+/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  function mapImportHeaders(headers) {
    const map = {};
    headers.forEach((h, idx) => {
      const norm = normHeader(h);
      for (const [field, aliases] of Object.entries(IMPORT_ALIASES)) {
        if (!(field in map) && aliases.includes(norm)) map[field] = idx;
      }
    });
    return map;
  }

  // ── SheetJS: lazy-load solo cuando se necesita (XLSX) ────────────────────
  function loadSheetJS() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js';
      s.addEventListener('load',  () => resolve(window.XLSX));
      s.addEventListener('error', () => reject(new Error('No se pudo cargar el módulo XLSX.')));
      document.head.appendChild(s);
    });
  }

  // ── Parser CSV nativo (sin dependencias) ─────────────────────────────────
  function parseCSVNative(text) {
    return text.split(/\r?\n/).map(line => {
      const cells = [];
      let inQ = false, cell = '';
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"')             { inQ = !inQ; }
        else if (ch === ',' && !inQ)     { cells.push(cell.trim()); cell = ''; }
        else                             { cell += ch; }
      }
      cells.push(cell.trim());
      return cells;
    }).filter(r => r.some(c => c !== ''));
  }

  // ── Exportar: genera CSV de todo el inventario y lo descarga ─────────────
  async function doExportCSV() {
    const { data: cols } = await API.collections.list();
    const rows = [['Nombre','Categoría','Precio Venta','Precio Costo','Stock','Descripción']];

    for (const col of cols) {
      const { data: items } = await API.items.list(col.slug);
      items.forEach(item => {
        const nombre      = item.nombre || item.name  || item.titulo || item.title  || '';
        const precio      = item.precio || item.price || item.valor  || 0;
        const precioCosto = item.precioCosto || item.costo || 0;
        const stock       = item.stock || 0;
        const desc        = item.descripcion || item.description || '';
        rows.push([nombre, col.name, precio, precioCosto, stock, desc]);
      });
    }

    const esc = c => {
      const s = String(c === null || c === undefined ? '' : c);
      return /[,"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const csv = rows.map(r => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'inventario-fullstock.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // ── Importar: parsea → mapea → sanea → UNA petición bulk al backend ──────
  async function doImport(file, container, { onProgress, onDone, onError }) {
    try {
      onProgress('Leyendo archivo…', 10);
      const ext = file.name.split('.').pop().toLowerCase();
      let rows  = [];

      if (ext === 'xlsx') {
        const XLSX = await loadSheetJS();
        const buf  = await file.arrayBuffer();
        const wb   = XLSX.read(buf, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      } else {
        rows = parseCSVNative(await file.text());
      }

      if (rows.length < 2) {
        onError('El archivo está vacío o solo tiene encabezados.'); return;
      }

      // ── Auto-detección de columnas por sinónimos ──────────────────────────
      onProgress('Detectando columnas…', 25);
      const headers  = rows[0].map(h => String(h));
      const fieldMap = mapImportHeaders(headers);

      if (!('nombre' in fieldMap)) {
        onError('No se encontró la columna "Nombre" (o equivalente: Producto, Title…).'); return;
      }

      // ── Saneamiento defensivo en cliente (NaN/vacío/negativo → 0) ─────────
      onProgress('Saneando datos…', 45);
      const clean = v => { const n = Number(v); return (!isFinite(n) || n < 0) ? 0 : n; };
      const cell  = (row, key) => (fieldMap[key] !== undefined ? row[fieldMap[key]] : '');

      const products = [];
      const dataRows = rows.slice(1);
      for (const row of dataRows) {
        const nombre = String(cell(row, 'nombre') || '').trim();
        if (!nombre) continue;   // se omite (sin nombre)
        products.push({
          nombre:      nombre,
          categoria:   String(cell(row, 'categoria')   || '').trim(),
          precioVenta: clean(cell(row, 'precioVenta')),
          precioCosto: clean(cell(row, 'precioCosto')),
          stock:       clean(cell(row, 'stock')),
          descripcion: String(cell(row, 'descripcion') || '').trim(),
        });
      }

      if (products.length === 0) {
        onError('No se encontró ninguna fila con un nombre válido.'); return;
      }

      const localSkipped = dataRows.length - products.length;

      // ── UNA sola petición: el backend crea categorías + insertMany ────────
      onProgress(`Enviando ${products.length} productos al servidor…`, 65);
      const res = await API.products.bulkImport(products);

      // ── Refrescar la tabla si hay una colección activa visible ────────────
      onProgress('Actualizando vista…', 95);
      if (activeSlug) {
        try { await renderTable(container, {}); } catch (_) {}
      }

      onDone({
        imported:          res.imported          || 0,
        categoriesCreated: res.categoriesCreated || 0,
        skipped:           localSkipped + (res.skipped || 0),
      });

    } catch (err) {
      const msg = (err && err.message)
        ? err.message
        : (err && Array.isArray(err.errors) ? err.errors.join(', ') : 'Error inesperado durante la importación.');
      onError(msg);
    }
  }

  // ── Modal principal Importar / Exportar ───────────────────────────────────
  function openImportExportModal(container) {
    document.getElementById('modal-import-export')?.remove();

    const overlay = document.createElement('div');
    overlay.id    = 'modal-import-export';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:9998;display:flex;align-items:center;' +
      'justify-content:center;padding:1rem;background:rgba(0,0,0,.75);' +
      'backdrop-filter:blur(4px)';

    overlay.innerHTML = `
      <div style="position:relative;width:100%;max-width:560px;background:#1e293b;
                  border:1px solid #334155;border-radius:1rem;overflow:hidden;
                  animation:fadeIn .2s ease-out;max-height:90vh;overflow-y:auto">

        <!-- Header -->
        <div style="padding:1.4rem 1.75rem 1.2rem;
                    background:linear-gradient(135deg,rgba(99,102,241,.1),rgba(139,92,246,.06));
                    border-bottom:1px solid #334155">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem">
            <div style="display:flex;align-items:center;gap:.875rem">
              <div style="width:2.5rem;height:2.5rem;border-radius:.625rem;flex-shrink:0;
                          background:linear-gradient(135deg,#6366f1,#8b5cf6);
                          display:flex;align-items:center;justify-content:center;
                          box-shadow:0 6px 16px rgba(99,102,241,.3)">
                <svg xmlns="http://www.w3.org/2000/svg" style="width:1.15rem;height:1.15rem"
                     fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="1.75">
                  <path stroke-linecap="round" stroke-linejoin="round"
                    d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/>
                </svg>
              </div>
              <div>
                <h3 style="color:#f1f5f9;font-size:1rem;font-weight:700;margin:0 0 .1rem">
                  Importar / Exportar
                </h3>
                <p style="color:#64748b;font-size:.75rem;margin:0">
                  Gestión masiva del inventario · CSV y Excel
                </p>
              </div>
            </div>
            <button id="ie-close-btn"
              style="width:2rem;height:2rem;border-radius:.375rem;border:1px solid #334155;
                     background:transparent;color:#475569;cursor:pointer;flex-shrink:0;
                     display:flex;align-items:center;justify-content:center;transition:all .15s">
              <svg xmlns="http://www.w3.org/2000/svg" style="width:.82rem;height:.82rem;pointer-events:none"
                   fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Body -->
        <div style="padding:1.5rem 1.75rem">

          <!-- ══ EXPORTAR ══════════════════════════════════════════════ -->
          <div style="margin-bottom:1.5rem">
            <p style="font-size:.68rem;font-weight:700;color:#475569;text-transform:uppercase;
                      letter-spacing:.09em;margin:0 0 .75rem">↓ Exportar</p>
            <p style="font-size:.8rem;color:#64748b;margin:0 0 .875rem;line-height:1.55">
              Descarga todo tu inventario (todas las categorías y productos) en un archivo
              <strong style="color:#a5b4fc">CSV compatible con Excel</strong> y Google Sheets.
              Incluye UTF-8 BOM para tildes y eñes.
            </p>
            <button id="ie-export-btn"
              style="display:inline-flex;align-items:center;gap:.5rem;
                     background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;
                     font-weight:600;font-size:.82rem;padding:.55rem 1.1rem;
                     border-radius:.5rem;border:none;cursor:pointer;transition:opacity .15s">
              <svg xmlns="http://www.w3.org/2000/svg"
                   style="width:.82rem;height:.82rem;flex-shrink:0;pointer-events:none"
                   fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              Descargar CSV
            </button>
          </div>

          <div style="border-top:1px solid #334155;margin-bottom:1.5rem"></div>

          <!-- ══ IMPORTAR ══════════════════════════════════════════════ -->
          <div>
            <p style="font-size:.68rem;font-weight:700;color:#475569;text-transform:uppercase;
                      letter-spacing:.09em;margin:0 0 .75rem">↑ Importar</p>
            <p style="font-size:.8rem;color:#64748b;margin:0 0 .875rem;line-height:1.55">
              Carga un archivo <strong style="color:#a5b4fc">.csv</strong> o
              <strong style="color:#a5b4fc">.xlsx</strong>.
              Las categorías nuevas se crean solas. Precios y stocks negativos
              se corrigen a 0 automáticamente.
            </p>

            <!-- Dropzone -->
            <div id="ie-dropzone"
              style="border:2px dashed #334155;border-radius:.75rem;
                     padding:1.75rem 1.25rem;text-align:center;cursor:pointer;
                     transition:all .2s;background:#0f172a;margin-bottom:.875rem">
              <svg xmlns="http://www.w3.org/2000/svg"
                   style="width:2.25rem;height:2.25rem;color:#334155;
                          margin:0 auto .625rem;display:block"
                   fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586
                     a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19
                     a2 2 0 01-2 2z"/>
              </svg>
              <p style="font-size:.82rem;font-weight:500;color:#94a3b8;margin:0 0 .25rem">
                Arrastra tu archivo aquí
              </p>
              <p style="font-size:.72rem;color:#475569;margin:0 0 .75rem">
                Acepta <span style="color:#818cf8">.csv</span> y
                <span style="color:#818cf8">.xlsx</span> · máx. 5 MB
              </p>
              <label id="ie-file-label"
                style="display:inline-flex;align-items:center;gap:.4rem;cursor:pointer;
                       background:#1e293b;border:1px solid #334155;color:#cbd5e1;
                       font-size:.78rem;font-weight:500;padding:.45rem .9rem;
                       border-radius:.375rem;transition:background .15s">
                <svg xmlns="http://www.w3.org/2000/svg"
                     style="width:.72rem;height:.72rem;flex-shrink:0;pointer-events:none"
                     fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round"
                    d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828
                       l6.414-6.586a4 4 0 00-5.656-5.656
                       l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
                </svg>
                Seleccionar archivo
                <input type="file" id="ie-file-input" accept=".csv,.xlsx"
                  style="display:none"/>
              </label>
              <div id="ie-file-name"
                style="margin-top:.625rem;font-size:.72rem;min-height:1rem;font-weight:500"></div>
            </div>

            <!-- Plantilla + nota cabeceras -->
            <div style="display:flex;align-items:center;justify-content:space-between;
                        flex-wrap:wrap;gap:.5rem;margin-bottom:1rem">
              <button id="ie-template-btn"
                style="font-size:.75rem;color:#6366f1;background:none;border:none;
                       cursor:pointer;padding:0;transition:color .15s;
                       text-decoration:underline;text-underline-offset:2px">
                ⬇ Descargar plantilla base
              </button>
              <span style="font-size:.68rem;color:#334155">
                Nombre · Categoría · Precio Venta · Precio Costo · Stock
              </span>
            </div>

            <!-- Barra de progreso -->
            <div id="ie-progress-wrap" style="display:none;margin-bottom:1rem">
              <div style="display:flex;justify-content:space-between;
                          font-size:.72rem;color:#94a3b8;margin-bottom:.35rem">
                <span id="ie-progress-label">Procesando…</span>
                <span id="ie-progress-pct">0%</span>
              </div>
              <div style="background:#0f172a;border-radius:9999px;height:5px;overflow:hidden">
                <div id="ie-progress-bar"
                  style="height:5px;border-radius:9999px;width:0%;
                         background:linear-gradient(90deg,#6366f1,#8b5cf6);
                         transition:width .3s ease"></div>
              </div>
            </div>

            <!-- Resultado -->
            <div id="ie-result" style="display:none;margin-bottom:1rem"></div>

            <!-- Botón Importar (oculto hasta que haya archivo válido) -->
            <button id="ie-import-btn"
              style="display:none;width:100%;padding:.7rem;border-radius:.5rem;
                     background:linear-gradient(135deg,#059669,#10b981);color:#fff;
                     font-weight:700;font-size:.875rem;border:none;cursor:pointer;
                     transition:opacity .15s">
              ⬆ Importar productos
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // ── Referencias ──────────────────────────────────────────────────────────
    const closeBtn      = overlay.querySelector('#ie-close-btn');
    const exportBtn     = overlay.querySelector('#ie-export-btn');
    const dropzone      = overlay.querySelector('#ie-dropzone');
    const fileLabel     = overlay.querySelector('#ie-file-label');
    const fileInput     = overlay.querySelector('#ie-file-input');
    const fileNameEl    = overlay.querySelector('#ie-file-name');
    const templateBtn   = overlay.querySelector('#ie-template-btn');
    const importBtn     = overlay.querySelector('#ie-import-btn');
    const progressWrap  = overlay.querySelector('#ie-progress-wrap');
    const progressBar   = overlay.querySelector('#ie-progress-bar');
    const progressLbl   = overlay.querySelector('#ie-progress-label');
    const progressPct   = overlay.querySelector('#ie-progress-pct');
    const resultEl      = overlay.querySelector('#ie-result');
    let   selectedFile  = null;

    // ── Cerrar ───────────────────────────────────────────────────────────────
    function cerrar() { overlay.remove(); }
    closeBtn.addEventListener('click', cerrar);
    overlay.addEventListener('click', e => { if (e.target === overlay) cerrar(); });
    const escH = e => { if (e.key === 'Escape') { cerrar(); document.removeEventListener('keydown', escH); } };
    document.addEventListener('keydown', escH);

    closeBtn.addEventListener('mouseover', () => {
      closeBtn.style.borderColor = '#6366f1'; closeBtn.style.color = '#a5b4fc';
      closeBtn.style.background  = 'rgba(99,102,241,.1)';
    });
    closeBtn.addEventListener('mouseout', () => {
      closeBtn.style.borderColor = '#334155'; closeBtn.style.color = '#475569';
      closeBtn.style.background  = 'transparent';
    });

    // ── Exportar ─────────────────────────────────────────────────────────────
    exportBtn.addEventListener('mouseover', () => { exportBtn.style.opacity = '.8'; });
    exportBtn.addEventListener('mouseout',  () => { exportBtn.style.opacity = '1'; });
    exportBtn.addEventListener('click', async () => {
      const orig = exportBtn.innerHTML;
      exportBtn.disabled    = true;
      exportBtn.textContent = 'Preparando…';
      try {
        await doExportCSV();
        App.showToast('Inventario exportado correctamente.', 'success');
      } catch (e) {
        App.showToast('Error al exportar: ' + (e.message || ''), 'error');
      } finally {
        exportBtn.disabled  = false;
        exportBtn.innerHTML = orig;
      }
    });

    // ── Plantilla base ────────────────────────────────────────────────────────
    templateBtn.addEventListener('mouseover', () => { templateBtn.style.color = '#818cf8'; });
    templateBtn.addEventListener('mouseout',  () => { templateBtn.style.color = '#6366f1'; });
    templateBtn.addEventListener('click', () => {
      const csv =
        '﻿Nombre,Categoría,Precio Venta,Precio Costo,Stock,Descripción\r\n' +
        'Café Americano,Bebidas,3500,1200,50,Café negro sin azúcar\r\n' +
        'Sandwich Club,Comida,5200,2100,20,Pan de molde con jamón y queso\r\n';
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = 'plantilla-fullstock.csv';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    });

    // ── Selección de archivo ──────────────────────────────────────────────────
    function onFileSelected(file) {
      if (!file) return;
      const ext = file.name.split('.').pop().toLowerCase();
      if (!['csv', 'xlsx'].includes(ext)) {
        fileNameEl.style.color = '#f87171';
        fileNameEl.textContent = '⚠ Formato no permitido. Usa .csv o .xlsx';
        importBtn.style.display = 'none'; selectedFile = null; return;
      }
      if (file.size > 5 * 1024 * 1024) {
        fileNameEl.style.color = '#f87171';
        fileNameEl.textContent = '⚠ El archivo supera los 5 MB.';
        importBtn.style.display = 'none'; selectedFile = null; return;
      }
      selectedFile = file;
      fileNameEl.style.color  = '#34d399';
      fileNameEl.textContent  = '✓ ' + file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
      importBtn.style.display = '';
      resultEl.style.display  = 'none';
      progressWrap.style.display = 'none';
      progressBar.style.width    = '0%';
    }

    fileInput.addEventListener('change', () => onFileSelected(fileInput.files?.[0]));

    dropzone.addEventListener('dragover', e => {
      e.preventDefault();
      dropzone.style.borderColor = '#6366f1';
      dropzone.style.background  = 'rgba(99,102,241,.05)';
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.style.borderColor = '#334155';
      dropzone.style.background  = '#0f172a';
    });
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.style.borderColor = '#334155';
      dropzone.style.background  = '#0f172a';
      onFileSelected(e.dataTransfer?.files?.[0]);
    });

    fileLabel.addEventListener('mouseover', () => { fileLabel.style.background = '#334155'; });
    fileLabel.addEventListener('mouseout',  () => { fileLabel.style.background = '#1e293b'; });

    // ── Importar ─────────────────────────────────────────────────────────────
    importBtn.addEventListener('mouseover', () => { importBtn.style.opacity = '.85'; });
    importBtn.addEventListener('mouseout',  () => { importBtn.style.opacity = '1'; });
    importBtn.addEventListener('click', async () => {
      if (!selectedFile) return;

      // Estado de carga: spinner + botón deshabilitado mientras el servidor
      // procesa el lote (puede ser pesado: cientos de productos).
      const importBtnHTML = importBtn.innerHTML;
      importBtn.disabled  = true;
      importBtn.innerHTML =
        '<span style="display:inline-flex;align-items:center;gap:.5rem;justify-content:center">' +
        '<span style="width:.95rem;height:.95rem;border:2px solid rgba(255,255,255,.4);' +
        'border-top-color:#fff;border-radius:9999px;display:inline-block;' +
        'animation:ieSpin .7s linear infinite"></span> Procesando lote…</span>';
      // Keyframes inyectados una sola vez (CSP: <style> sin inline handlers)
      if (!document.getElementById('ie-spin-style')) {
        const st = document.createElement('style');
        st.id = 'ie-spin-style';
        st.textContent = '@keyframes ieSpin{to{transform:rotate(360deg)}}';
        document.head.appendChild(st);
      }
      dropzone.style.pointerEvents = 'none';
      dropzone.style.opacity       = '.6';
      progressWrap.style.display   = '';
      resultEl.style.display       = 'none';

      function restoreBtn() {
        importBtn.disabled           = false;
        importBtn.innerHTML          = importBtnHTML;
        dropzone.style.pointerEvents = '';
        dropzone.style.opacity       = '1';
      }

      await doImport(selectedFile, container, {
        onProgress(label, pct) {
          progressLbl.textContent = label;
          progressPct.textContent = pct + '%';
          progressBar.style.width = pct + '%';
        },
        onDone(res) {
          progressBar.style.width = '100%';
          progressPct.textContent = '100%';
          progressLbl.textContent = '¡Completado!';
          resultEl.innerHTML = `
            <div style="background:rgba(5,150,105,.08);border:1px solid #059669;
                        border-radius:.625rem;padding:.875rem 1rem">
              <p style="color:#34d399;font-weight:700;font-size:.875rem;margin:0 0 .3rem">
                ✅ ¡Éxito!
              </p>
              <p style="color:#94a3b8;font-size:.8rem;margin:0;line-height:1.55">
                Se han importado <strong style="color:#f1f5f9">${res.imported}</strong>
                producto(s) y se crearon
                <strong style="color:#a5b4fc">${res.categoriesCreated}</strong>
                nueva(s) categoría(s) automáticamente.${res.skipped > 0
                  ? ` <span style="color:#f59e0b">${res.skipped} fila(s) omitida(s) por falta de nombre.</span>`
                  : ''}
              </p>
            </div>
          `;
          resultEl.style.display = '';
          App.showToast(`Importación completa: ${res.imported} productos.`, 'success');
          restoreBtn();
        },
        onError(msg) {
          progressWrap.style.display = 'none';
          resultEl.innerHTML = `
            <div style="background:#450a0a;border:1px solid #991b1b;border-radius:.625rem;
                        padding:.875rem 1rem;color:#f87171;font-size:.82rem;font-weight:500">
              ❌ ${escHtml(msg)}
            </div>
          `;
          resultEl.style.display = '';
          restoreBtn();
        },
      });
    });
  }

  return { render };
})();

window.Content = Content;
