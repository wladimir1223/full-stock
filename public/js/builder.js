/**
 * builder.js — Panel del Desarrollador (Collection Type Builder).
 * Permite crear colecciones con campos tipados.
 */

const Builder = (() => {
  let fields = [];  // Estado temporal de campos en el formulario

  // ─── Render principal ──────────────────────────────────────────────────────

  function render(container) {
    container.innerHTML = `
      <div class="max-w-2xl mx-auto">
        <h2 class="text-2xl font-bold text-white mb-1">Collection Builder</h2>
        <p class="text-slate-400 text-sm mb-6">Define la estructura de datos. El sistema generará la API automáticamente.</p>

        <div class="card">
          <div class="mb-4">
            <label class="label">Nombre de la colección</label>
            <input id="col-name" type="text" placeholder="Ej: Productos, Blog, Testimonios…"
              class="input-field" />
          </div>

          <div class="mb-2 flex items-center justify-between">
            <span class="label mb-0">Campos</span>
            <button id="add-field-btn" class="btn-secondary text-sm py-1 px-3">
              + Añadir campo
            </button>
          </div>

          <!-- Campo Stock permanente (siempre se incluye automáticamente) -->
          <div class="flex gap-2 items-center mb-2 px-3 py-2 rounded-lg bg-indigo-950/50 border border-indigo-800/40">
            <input type="text" value="Stock" disabled
              class="input-field flex-1 opacity-60 cursor-not-allowed" />
            <select disabled class="input-field w-44 opacity-60 cursor-not-allowed">
              <option>Número</option>
            </select>
            <span class="text-xs text-indigo-400 font-medium whitespace-nowrap px-1">Automático</span>
          </div>

          <div id="fields-container" class="space-y-3 mb-6">
            <!-- Los campos se insertan aquí dinámicamente -->
          </div>

          <div id="builder-error" class="hidden text-red-400 text-sm mb-3"></div>

          <div class="flex gap-3">
            <button id="save-collection-btn" class="btn-primary flex-1">
              Guardar Colección
            </button>
            <button id="reset-builder-btn" class="btn-danger py-2 px-4">
              Limpiar
            </button>
          </div>
        </div>

        <!-- Lista de colecciones existentes -->
        <h3 class="text-lg font-semibold text-white mt-8 mb-3">Colecciones existentes</h3>
        <div id="existing-collections" class="space-y-2">
          <div class="text-slate-500 text-sm">Cargando…</div>
        </div>
      </div>
    `;

    fields = [];
    bindBuilderEvents(container);
    renderExistingCollections(container);
  }

  // ─── Renderizar campo individual ───────────────────────────────────────────

  function renderField(index, field) {
    const div = document.createElement('div');
    div.className = 'flex gap-2 items-center animate-fade-in';
    div.dataset.fieldIndex = index;
    div.innerHTML = `
      <input type="text" placeholder="Nombre del campo" value="${field.name}"
        class="input-field flex-1" data-role="field-name" />
      <select class="input-field w-44" data-role="field-type">
        <option value="short_text"  ${field.type === 'short_text'  ? 'selected' : ''}>Texto Corto</option>
        <option value="long_text"   ${field.type === 'long_text'   ? 'selected' : ''}>Texto Largo</option>
        <option value="number"      ${field.type === 'number'      ? 'selected' : ''}>Número</option>
        <option value="image_url"   ${field.type === 'image_url'   ? 'selected' : ''}>URL de Imagen</option>
      </select>
      <button class="text-red-400 hover:text-red-300 transition p-1" data-role="remove-field" title="Eliminar campo">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    `;
    return div;
  }

  function refreshFieldsList(container) {
    const fc = container.querySelector('#fields-container');
    fc.innerHTML = '';
    if (fields.length === 0) {
      fc.innerHTML = '<p class="text-slate-500 text-sm">Sin campos. Pulsa "Añadir campo".</p>';
      return;
    }
    fields.forEach((f, i) => {
      const el = renderField(i, f);
      // Sincronizar cambios en tiempo real
      el.querySelector('[data-role="field-name"]').addEventListener('input', e => {
        fields[i].name = e.target.value;
      });
      el.querySelector('[data-role="field-type"]').addEventListener('change', e => {
        fields[i].type = e.target.value;
      });
      el.querySelector('[data-role="remove-field"]').addEventListener('click', () => {
        fields.splice(i, 1);
        refreshFieldsList(container);
      });
      fc.appendChild(el);
    });
  }

  // ─── Eventos ───────────────────────────────────────────────────────────────

  function bindBuilderEvents(container) {
    container.querySelector('#add-field-btn').addEventListener('click', () => {
      fields.push({ name: '', type: 'short_text' });
      refreshFieldsList(container);
    });

    container.querySelector('#reset-builder-btn').addEventListener('click', () => {
      fields = [];
      container.querySelector('#col-name').value = '';
      refreshFieldsList(container);
      showError(container, '');
    });

    container.querySelector('#save-collection-btn').addEventListener('click', () => saveCollection(container));
  }

  async function saveCollection(container) {
    const name   = container.querySelector('#col-name').value.trim();
    const errDiv = container.querySelector('#builder-error');

    if (!name) return showError(container, 'El nombre de la colección es obligatorio.');
    if (fields.length === 0) return showError(container, 'Añade al menos un campo.');
    for (const f of fields) {
      if (!f.name.trim()) return showError(container, 'Todos los campos deben tener nombre.');
    }

    errDiv.classList.add('hidden');
    const btn = container.querySelector('#save-collection-btn');
    btn.disabled    = true;
    btn.textContent = 'Guardando…';

    try {
      await API.collections.create({ name, fields: fields.map(f => ({ name: f.name, type: f.type })) });
      // Reset
      fields = [];
      container.querySelector('#col-name').value = '';
      refreshFieldsList(container);
      renderExistingCollections(container);
      App.showToast('Colección creada exitosamente.', 'success');
    } catch (err) {
      const msg = err.message || (err.errors && err.errors.join(', ')) || 'Error al guardar.';
      showError(container, msg);
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Guardar Colección';
    }
  }

  // ─── Listado de colecciones existentes ────────────────────────────────────

  async function renderExistingCollections(container) {
    const ec = container.querySelector('#existing-collections');
    ec.innerHTML = '<div class="text-slate-500 text-sm">Cargando…</div>';
    try {
      const { data } = await API.collections.list();
      if (data.length === 0) {
        ec.innerHTML = '<div class="text-slate-500 text-sm">No hay colecciones aún.</div>';
        return;
      }
      ec.innerHTML = '';
      data.forEach(col => {
        const card = document.createElement('div');
        card.className = 'card flex items-center justify-between py-3';
        card.innerHTML = `
          <div>
            <p class="font-semibold text-white">${col.name}</p>
            <p class="text-xs text-slate-400">slug: <code class="text-indigo-400">${col.slug}</code>
              · ${col.fields.length} campo${col.fields.length !== 1 ? 's' : ''}
              · API: <code class="text-emerald-400">/api/v1/${Auth.getTenantSlug()}/collections/${col.slug}</code>
            </p>
          </div>
          <button class="btn-danger text-xs py-1 px-3" data-delete="${col.slug}">Eliminar</button>
        `;
        card.querySelector('[data-delete]').addEventListener('click', () => confirmDelete(container, col));
        ec.appendChild(card);
      });
    } catch {
      ec.innerHTML = '<div class="text-red-400 text-sm">Error al cargar colecciones.</div>';
    }
  }

  async function confirmDelete(container, col) {
    if (!confirm(`¿Eliminar la colección "${col.name}" y todos sus datos? Esta acción no se puede deshacer.`)) return;
    try {
      await API.collections.delete(col.slug);
      renderExistingCollections(container);
      App.showToast(`Colección "${col.name}" eliminada.`, 'info');
    } catch {
      App.showToast('Error al eliminar la colección.', 'error');
    }
  }

  function showError(container, msg) {
    const div = container.querySelector('#builder-error');
    if (!msg) { div.classList.add('hidden'); return; }
    div.textContent = msg;
    div.classList.remove('hidden');
  }

  return { render };
})();

window.Builder = Builder;
