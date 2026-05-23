/**
 * catalog.js — Gestor de Catálogo (vista cliente final).
 *
 * Oculta la complejidad técnica del Collection Builder.
 * Al crear una categoría auto-genera los 4 campos estándar de e-commerce.
 */

const Catalog = (() => {

  // 4 campos estándar que se crean automáticamente en cada categoría
  const CAMPOS_ESTANDAR = [
    { name: 'nombre',      type: 'short_text', icon: '✏️',  label: 'Nombre'      },
    { name: 'precio',      type: 'number',     icon: '💲',  label: 'Precio'      },
    { name: 'descripcion', type: 'long_text',  icon: '📝',  label: 'Descripción' },
    { name: 'imagen',      type: 'image_url',  icon: '🖼️',  label: 'Imagen'      },
  ];

  // ─── Render principal ──────────────────────────────────────────────────────

  async function render(container) {
    container.innerHTML = `
      <div class="max-w-5xl mx-auto">

        <!-- ── Encabezado ─────────────────────────────────────────────────── -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h2 class="text-2xl font-bold text-white">🗂️ Mis Categorías</h2>
            <p class="text-slate-400 text-sm mt-1">
              Organiza tu inventario por tipo de producto.
              Cada categoría tiene su propia lista de artículos.
            </p>
          </div>
          <button id="btn-nueva-cat"
            class="shrink-0 flex items-center gap-2
                   bg-gradient-to-r from-indigo-500 to-violet-600
                   hover:from-indigo-600 hover:to-violet-700
                   text-white font-bold text-sm px-5 py-3 rounded-xl
                   shadow-lg shadow-indigo-900/30 transition-all duration-200
                   hover:scale-105 active:scale-95">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 shrink-0" fill="none"
                 viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5"
                    d="M12 4v16m8-8H4"/>
            </svg>
            Crear Nueva Categoría de Productos
          </button>
        </div>

        <!-- ── Modal: Crear categoría ─────────────────────────────────────── -->
        <div id="modal-cat" class="hidden fixed inset-0 z-50 flex items-center justify-center px-4">
          <!-- Backdrop -->
          <div id="modal-backdrop"
               class="absolute inset-0 bg-black/75 backdrop-blur-sm"></div>

          <!-- Card del modal -->
          <div class="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl
                      w-full max-w-[420px] p-7 z-10 animate-fade-in">

            <!-- Icono + título -->
            <div class="flex items-center gap-3.5 mb-6">
              <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600
                          flex items-center justify-center text-2xl shadow-lg shrink-0">
                🗂️
              </div>
              <div>
                <h3 class="font-extrabold text-white text-lg leading-tight">
                  Nueva Categoría
                </h3>
                <p class="text-slate-400 text-xs mt-0.5">
                  Solo necesitas darle un nombre.
                </p>
              </div>
            </div>

            <!-- Input nombre -->
            <label class="block text-[10px] font-bold text-slate-400 uppercase
                          tracking-widest mb-2">
              Nombre de la categoría
            </label>
            <input id="cat-nombre" type="text" autocomplete="off"
              placeholder="Ej: Manzanas, Camisetas, Laptops, Zapatillas…"
              class="w-full bg-slate-900 border border-slate-600 focus:border-indigo-500
                     text-white rounded-xl px-4 py-3 text-sm outline-none transition
                     placeholder:text-slate-600" />

            <!-- Preview slug -->
            <p id="cat-slug-preview"
               class="text-[11px] text-slate-500 mt-1.5 min-h-[1.1rem] transition-all"></p>

            <!-- Campos auto-generados -->
            <div class="mt-4 bg-slate-900/70 rounded-xl p-4 border border-slate-700/50">
              <p class="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                ✨ Campos que se crean automáticamente
              </p>
              <div class="grid grid-cols-2 gap-y-2 gap-x-3">
                ${CAMPOS_ESTANDAR.map(f => `
                  <div class="flex items-center gap-2 text-xs">
                    <span class="text-base leading-none">${f.icon}</span>
                    <span class="text-slate-300 font-semibold">${f.label}</span>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- Error -->
            <div id="modal-error"
                 class="hidden mt-3 text-red-400 text-sm bg-red-950/50
                        border border-red-900/50 rounded-lg px-3 py-2"></div>

            <!-- Acciones -->
            <div class="flex gap-3 mt-5">
              <button id="btn-guardar-cat"
                class="flex-1 bg-gradient-to-r from-indigo-500 to-violet-600
                       hover:from-indigo-600 hover:to-violet-700
                       text-white font-bold text-sm py-3 rounded-xl
                       transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]">
                Crear y comenzar a agregar productos →
              </button>
              <button id="btn-cancelar-cat"
                class="px-4 bg-slate-700 hover:bg-slate-600 text-slate-300
                       font-semibold text-sm rounded-xl transition">
                Cancelar
              </button>
            </div>

          </div>
        </div>

        <!-- ── Grid de categorías ──────────────────────────────────────────── -->
        <div id="cat-grid"
             class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <!-- Skeleton de carga -->
          ${[1,2,3].map(() => `
            <div class="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-5 animate-pulse">
              <div class="w-12 h-12 rounded-xl bg-slate-700 mb-4"></div>
              <div class="h-4 bg-slate-700 rounded w-3/4 mb-2"></div>
              <div class="h-3 bg-slate-700/50 rounded w-1/2 mb-4"></div>
              <div class="h-8 bg-slate-700/50 rounded-lg"></div>
            </div>
          `).join('')}
        </div>

      </div>
    `;

    bindEvents(container);
    await cargarCategorias(container);
  }

  // ─── Bind de eventos del modal ─────────────────────────────────────────────

  function bindEvents(container) {
    const modal    = container.querySelector('#modal-cat');
    const input    = container.querySelector('#cat-nombre');
    const preview  = container.querySelector('#cat-slug-preview');
    const errDiv   = container.querySelector('#modal-error');
    const btnAbrir = container.querySelector('#btn-nueva-cat');
    const btnGuard = container.querySelector('#btn-guardar-cat');
    const btnCancel= container.querySelector('#btn-cancelar-cat');
    const backdrop = container.querySelector('#modal-backdrop');

    // Preview del identificador en tiempo real
    input.addEventListener('input', () => {
      const slug = toSlug(input.value);
      preview.textContent = slug
        ? `Identificador interno: /${slug}`
        : '';
    });

    // Abrir modal
    btnAbrir.addEventListener('click', () => {
      input.value            = '';
      preview.textContent    = '';
      errDiv.classList.add('hidden');
      modal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      setTimeout(() => input.focus(), 60);
    });

    // Cerrar modal
    function cerrar() {
      modal.classList.add('hidden');
      document.body.style.overflow = '';
    }
    btnCancel.addEventListener('click', cerrar);
    backdrop.addEventListener('click', cerrar);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter')  btnGuard.click();
      if (e.key === 'Escape') cerrar();
    });

    // Guardar
    btnGuard.addEventListener('click', () =>
      crearCategoria(container, input, errDiv, btnGuard, cerrar)
    );
  }

  // ─── Crear categoría ───────────────────────────────────────────────────────

  async function crearCategoria(container, input, errDiv, btn, cerrar) {
    const nombre = input.value.trim();
    if (!nombre) {
      errDiv.textContent = 'Escribe el nombre de la categoría para continuar.';
      errDiv.classList.remove('hidden');
      input.focus();
      return;
    }

    errDiv.classList.add('hidden');
    btn.disabled    = true;
    btn.textContent = 'Creando…';

    try {
      const res = await API.collections.create({
        name:   nombre,
        fields: CAMPOS_ESTANDAR.map(f => ({ name: f.name, type: f.type })),
      });

      cerrar();
      App.showToast(`✅ Categoría "${nombre}" creada. ¡Ahora añade tus productos!`, 'success');

      // Redirigir al gestor de productos con el form abierto automáticamente
      const slug = (res && res.data && res.data.slug) ? res.data.slug : toSlug(nombre);
      App.navigateToContent(slug, { autoOpenForm: true });

    } catch (err) {
      errDiv.textContent = (err && err.message) ? err.message : 'Error al crear la categoría.';
      errDiv.classList.remove('hidden');
      btn.disabled    = false;
      btn.textContent = 'Crear y comenzar a agregar productos →';
    }
  }

  // ─── Cargar y renderizar grid ──────────────────────────────────────────────

  async function cargarCategorias(container) {
    const grid = container.querySelector('#cat-grid');
    try {
      const { data } = await API.collections.list();

      if (data.length === 0) {
        grid.innerHTML = renderEstadoVacio();
        return;
      }

      grid.innerHTML = '';
      data.forEach(col => {
        const card = document.createElement('div');
        card.className =
          'group bg-slate-800/60 border border-slate-700/80 rounded-2xl p-5 ' +
          'hover:border-indigo-500/60 hover:bg-slate-800 ' +
          'transition-all duration-200';

        card.innerHTML = `
          <!-- Icono + badge campos -->
          <div class="flex items-start justify-between gap-2 mb-4">
            <div class="w-12 h-12 rounded-xl
                        bg-gradient-to-br from-indigo-500/15 to-violet-600/15
                        border border-indigo-500/25 flex items-center justify-center text-2xl
                        group-hover:from-indigo-500/25 group-hover:to-violet-600/25 transition-all">
              📦
            </div>
            <span class="text-[11px] bg-slate-700/80 text-slate-400
                         px-2.5 py-1 rounded-full font-semibold shrink-0">
              ${col.fields.length} campo${col.fields.length !== 1 ? 's' : ''}
            </span>
          </div>

          <!-- Nombre -->
          <h3 class="font-extrabold text-white text-base mb-0.5
                     group-hover:text-indigo-300 transition-colors leading-tight">
            ${xss(col.name)}
          </h3>
          <p class="text-slate-600 text-[11px] mb-4">
            id: <code class="text-indigo-500/70">${xss(col.slug)}</code>
          </p>

          <!-- Acciones -->
          <div class="flex items-center gap-2">
            <button class="btn-ver flex-1 flex items-center justify-center gap-1.5
                           bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold
                           py-2.5 rounded-xl transition-colors"
                    data-slug="${xss(col.slug)}">
              Ver y gestionar productos
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none"
                   viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5"
                      d="M9 5l7 7-7 7"/>
              </svg>
            </button>
            <button class="btn-del shrink-0 p-2.5 text-red-400/50 hover:text-red-400
                           hover:bg-red-950/40 rounded-xl transition-colors"
                    data-slug="${xss(col.slug)}" data-name="${xss(col.name)}"
                    title="Eliminar categoría">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none"
                   viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995
                         -1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1
                         1v3M4 7h16"/>
              </svg>
            </button>
          </div>
        `;

        // Ver productos
        card.querySelector('.btn-ver').addEventListener('click', () => {
          App.navigateToContent(col.slug);
        });

        // Eliminar categoría
        card.querySelector('.btn-del').addEventListener('click', async () => {
          if (!confirm(
            `¿Eliminar la categoría "${col.name}" y todos sus productos?\n` +
            `Esta acción no se puede deshacer.`
          )) return;
          try {
            await API.collections.delete(col.slug);
            App.showToast(`Categoría "${col.name}" eliminada.`, 'info');
            await cargarCategorias(container);
          } catch {
            App.showToast('Error al eliminar la categoría.', 'error');
          }
        });

        grid.appendChild(card);
      });

    } catch {
      grid.innerHTML =
        '<p class="text-red-400 text-sm col-span-full text-center py-10">' +
        'Error al cargar las categorías. Recarga la página e inténtalo de nuevo.' +
        '</p>';
    }
  }

  // ─── Estado vacío ──────────────────────────────────────────────────────────

  function renderEstadoVacio() {
    return `
      <div class="col-span-full flex flex-col items-center justify-center py-20 text-center">
        <div class="w-24 h-24 rounded-3xl bg-slate-800 border border-slate-700
                    flex items-center justify-center text-5xl mb-6 shadow-inner">
          🗂️
        </div>
        <h3 class="text-white font-extrabold text-xl mb-2">
          Aún no tienes categorías
        </h3>
        <p class="text-slate-400 text-sm max-w-xs leading-relaxed mb-8">
          Crea tu primera categoría y empieza a añadir productos en segundos.
          Nosotros nos encargamos de la configuración técnica.
        </p>
        <button onclick="document.getElementById('btn-nueva-cat').click()"
          class="bg-gradient-to-r from-indigo-500 to-violet-600 text-white
                 font-bold text-sm px-7 py-3.5 rounded-xl hover:opacity-90
                 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-indigo-900/30">
          + Crear mi primera categoría
        </button>
      </div>
    `;
  }

  // ─── Utilidades ───────────────────────────────────────────────────────────

  function toSlug(str) {
    return String(str || '').toLowerCase().trim()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-').slice(0, 60);
  }

  function xss(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { render };
})();

window.Catalog = Catalog;
