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

          <!-- Botón añadir producto -->
          <button id="new-item-btn" class="btn-primary"
            ${atLimit ? 'disabled title="Límite de plan alcanzado"' : ''}>
            + Añadir ${escHtml(activeSchema.name.replace(/s$/i, ''))}
          </button>
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

  function openForm(main, item = null) {
    editingId     = item ? item.id : null;
    const isEdit  = editingId !== null;
    const wrapper = main.querySelector('#item-form-wrapper');

    wrapper.innerHTML = `
      <h3 class="text-base font-semibold text-white mb-4">
        ${isEdit ? 'Editar' : 'Nuevo'} ${activeSchema.name.replace(/s$/, '')}
      </h3>
      <div class="grid gap-4 sm:grid-cols-2">
        ${activeSchema.fields.map(f => buildInput(f, item)).join('')}
      </div>
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

      case 'number':
        inner = `
          <input type="number" id="${baseId}" class="input-field w-full"
            value="${escHtml(String(value))}" placeholder="${field.label}" step="any"/>
        `;
        break;

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
      payload[f.key] = f.type === 'number' ? Number(val) : val;
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

  return { render };
})();

window.Content = Content;
