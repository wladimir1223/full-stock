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

  async function render(container) {
    container.innerHTML = `
      <div class="flex gap-6 h-full">
        <aside class="w-56 shrink-0">
          <h2 class="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Colecciones</h2>
          <nav id="col-nav" class="space-y-1">
            <div class="text-slate-500 text-sm">Cargando…</div>
          </nav>
        </aside>
        <main class="flex-1 min-w-0" id="content-main">
          <div class="flex flex-col items-center justify-center h-64 text-slate-500">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 10h16M4 14h16M4 18h8"/>
            </svg>
            <p>Selecciona una colección para gestionar su contenido.</p>
          </div>
        </main>
      </div>
    `;
    await loadCollectionNav(container);
  }

  // ─── Sidebar ───────────────────────────────────────────────────────────────

  async function loadCollectionNav(container) {
    const nav = container.querySelector('#col-nav');
    try {
      const { data } = await API.collections.list();
      if (data.length === 0) {
        nav.innerHTML = '<p class="text-slate-500 text-sm">Sin colecciones.<br>Crea una en el Builder.</p>';
        return;
      }
      nav.innerHTML = '';
      data.forEach(col => {
        const btn = document.createElement('button');
        btn.className = 'w-full text-left px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition nav-item';
        btn.dataset.slug = col.slug;
        btn.innerHTML = `
          <span class="block font-medium">${col.name}</span>
          <span class="block text-xs text-slate-500">${col.fields.length} campo${col.fields.length !== 1 ? 's' : ''}</span>
        `;
        btn.addEventListener('click', () => selectCollection(container, col));
        nav.appendChild(btn);
      });
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

  async function selectCollection(container, col) {
    activeSlug   = col.slug;
    activeSchema = col;
    editingId    = null;
    setActiveNavItem(container, col.slug);
    await renderTable(container);
  }

  // ─── Tabla ────────────────────────────────────────────────────────────────

  async function renderTable(container) {
    const main = container.querySelector('#content-main');
    main.innerHTML = '<div class="text-slate-400 text-sm">Cargando datos…</div>';

    try {
      const schema   = await API.collections.get(activeSlug);
      activeSchema   = schema.data;
      const { data } = await API.items.list(activeSlug);

      main.innerHTML = `
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="text-xl font-bold text-white">${activeSchema.name}</h2>
            <p class="text-xs text-slate-400">
              API pública: <code class="text-emerald-400">/api/v1/collections/${activeSlug}</code>
            </p>
          </div>
          <button id="new-item-btn" class="btn-primary">
            + Añadir ${activeSchema.name.replace(/s$/, '')}
          </button>
        </div>
        <div id="item-form-wrapper" class="hidden card mb-5 animate-fade-in"></div>
        <div class="overflow-x-auto rounded-xl border border-slate-700">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-slate-800 text-slate-400 text-left">
                ${activeSchema.fields.map(f => `<th class="px-4 py-3 font-medium">${f.label}</th>`).join('')}
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

      main.querySelector('#new-item-btn').addEventListener('click', () => openForm(main));
      bindRowActions(main, data);
    } catch {
      main.innerHTML = '<p class="text-red-400">Error al cargar los datos.</p>';
    }
  }

  // ─── Fila de tabla ────────────────────────────────────────────────────────

  function renderRow(item) {
    const cells = activeSchema.fields.map(f => {
      const val = item[f.key];
      if (f.type === 'image_url' && val) {
        return `<td class="px-4 py-3">
          <img src="${escHtml(val)}" alt="" class="w-12 h-12 object-cover rounded-lg border border-slate-700"
            loading="lazy"
            onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
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
        <td class="px-4 py-3 text-right whitespace-nowrap">
          <button class="text-indigo-400 hover:text-indigo-300 text-xs font-medium mr-3 btn-edit"
            data-id="${item.id}">Editar</button>
          <button class="text-red-400 hover:text-red-300 text-xs font-medium btn-delete"
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
      .filter(f => f.type === 'image_url')
      .forEach(f => bindImageWidget(wrapper, f.key, item?.[f.key] ?? ''));

    wrapper.querySelector('#cancel-form-btn').addEventListener('click', () => {
      wrapper.classList.add('hidden');
      editingId = null;
    });

    wrapper.querySelector('#submit-form-btn').addEventListener('click', () => submitForm(main, wrapper));
  }

  // ─── Construcción de inputs ───────────────────────────────────────────────

  function buildInput(field, item = null) {
    const value  = item ? (item[field.key] ?? '') : '';
    const baseId = `field-${field.key}`;
    const isWide = field.type === 'long_text' || field.type === 'image_url';

    let inner;

    switch (field.type) {
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

      const res  = await fetch('/admin/upload', { method: 'POST', body: formData });
      const json = await res.json();

      if (!res.ok || !json.success) throw new Error(json.message || 'Error al subir.');

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

  // ─── Utilidades ───────────────────────────────────────────────────────────

  function escHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return { render };
})();

window.Content = Content;
