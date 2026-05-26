/**
 * settings.js — Panel de Configuración de la tienda.
 *
 * Permite al tenant actualizar su número de WhatsApp (y su nombre de negocio)
 * sin tocar la base de datos manualmente.
 *
 * Ruta admin: GET  /admin/settings
 *             PUT  /admin/settings  { whatsapp, name }
 */

const Settings = (() => {

  async function render(container) {
    container.innerHTML = `
      <div class="animate-fade-in" style="max-width:640px;margin:0 auto">

        <!-- Cabecera -->
        <div style="margin-bottom:1.75rem">
          <h1 style="font-size:1.375rem;font-weight:700;color:#f1f5f9;margin:0 0 .3rem">
            ⚙️ Configuración de la tienda
          </h1>
          <p style="color:#64748b;font-size:.85rem;margin:0">
            Ajusta los datos públicos de tu negocio.
          </p>
        </div>

        <!-- Card principal -->
        <div style="background:#1e293b;border:1px solid #334155;border-radius:.875rem;
                    overflow:hidden">

          <!-- Sección: Información básica -->
          <div style="padding:1.5rem;border-bottom:1px solid #334155">
            <h2 style="font-size:.8rem;font-weight:700;color:#475569;text-transform:uppercase;
                       letter-spacing:.07em;margin:0 0 1.25rem">Información básica</h2>

            <div style="display:flex;flex-direction:column;gap:1rem">
              <!-- Nombre del negocio -->
              <div>
                <label style="display:block;font-size:.7rem;font-weight:600;color:#94a3b8;
                               text-transform:uppercase;letter-spacing:.06em;margin-bottom:.35rem">
                  Nombre del negocio
                </label>
                <input id="cfg-name" type="text" placeholder="Mi Tienda"
                  style="width:100%;box-sizing:border-box;background:#0f172a;
                         border:1px solid #334155;border-radius:.5rem;color:#f1f5f9;
                         padding:.55rem .75rem;font-size:.875rem;outline:none;
                         transition:border-color .15s"
                  onfocus="this.style.borderColor='#6366f1'"
                  onblur="this.style.borderColor='#334155'"/>
              </div>

              <!-- Slug (solo lectura) -->
              <div>
                <label style="display:block;font-size:.7rem;font-weight:600;color:#94a3b8;
                               text-transform:uppercase;letter-spacing:.06em;margin-bottom:.35rem">
                  Slug de la tienda <span style="color:#475569;font-weight:400">(no editable)</span>
                </label>
                <div style="background:#0f172a;border:1px solid #1e293b;border-radius:.5rem;
                            color:#6366f1;padding:.55rem .75rem;font-size:.875rem;
                            font-family:monospace" id="cfg-slug">—</div>
              </div>

              <!-- Email (solo lectura) -->
              <div>
                <label style="display:block;font-size:.7rem;font-weight:600;color:#94a3b8;
                               text-transform:uppercase;letter-spacing:.06em;margin-bottom:.35rem">
                  Email <span style="color:#475569;font-weight:400">(no editable)</span>
                </label>
                <div style="background:#0f172a;border:1px solid #1e293b;border-radius:.5rem;
                            color:#64748b;padding:.55rem .75rem;font-size:.875rem"
                     id="cfg-email">—</div>
              </div>
            </div>
          </div>

          <!-- Sección: WhatsApp -->
          <div style="padding:1.5rem;border-bottom:1px solid #334155">
            <h2 style="font-size:.8rem;font-weight:700;color:#475569;text-transform:uppercase;
                       letter-spacing:.07em;margin:0 0 .5rem">WhatsApp de la tienda</h2>
            <p style="color:#64748b;font-size:.78rem;margin:0 0 1.25rem;line-height:1.5">
              Los clientes te enviarán sus pedidos a este número.
              Escríbelo en formato internacional <strong style="color:#94a3b8">sin el signo +</strong>
              (ej: <code style="color:#6366f1">56912345678</code> para Chile,
              <code style="color:#6366f1">5491112345678</code> para Argentina).
            </p>

            <div>
              <label style="display:block;font-size:.7rem;font-weight:600;color:#94a3b8;
                             text-transform:uppercase;letter-spacing:.06em;margin-bottom:.35rem">
                Número WhatsApp
              </label>
              <div style="display:flex;align-items:center;gap:.5rem">
                <span style="background:#0f172a;border:1px solid #334155;border-radius:.5rem .0 .0 .5rem;
                              color:#64748b;padding:.55rem .75rem;font-size:.875rem;
                              border-right:none;white-space:nowrap">+</span>
                <input id="cfg-whatsapp" type="tel"
                  placeholder="56912345678"
                  style="flex:1;background:#0f172a;border:1px solid #334155;
                         border-radius:0 .5rem .5rem 0;color:#f1f5f9;
                         padding:.55rem .75rem;font-size:.875rem;outline:none;
                         transition:border-color .15s"
                  onfocus="this.style.borderColor='#6366f1'"
                  onblur="this.style.borderColor='#334155'"/>
              </div>
            </div>

            <!-- Vista previa del link wa.me -->
            <div id="cfg-wa-preview"
                 style="margin-top:.875rem;background:#0f172a;border:1px solid #1e293b;
                        border-radius:.5rem;padding:.625rem .875rem;font-size:.75rem;
                        color:#475569;display:none">
              <span style="color:#25d366;font-weight:600">● </span>
              Enlace generado:
              <span id="cfg-wa-link" style="color:#6366f1;font-family:monospace"></span>
            </div>
          </div>

          <!-- Link de la tienda pública -->
          <div style="padding:1.5rem;border-bottom:1px solid #334155;background:#0f172a/20">
            <h2 style="font-size:.8rem;font-weight:700;color:#475569;text-transform:uppercase;
                       letter-spacing:.07em;margin:0 0 .75rem">Link de tu tienda pública</h2>
            <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
              <a id="cfg-store-link" href="#" target="_blank"
                 style="color:#6366f1;font-size:.8rem;font-family:monospace;
                        word-break:break-all;text-decoration:none;
                        padding:.4rem .75rem;background:#0f172a;
                        border:1px solid #334155;border-radius:.5rem;
                        transition:border-color .15s"
                 onmouseover="this.style.borderColor='#6366f1'"
                 onmouseout="this.style.borderColor='#334155'">—</a>
              <button id="cfg-copy-link"
                style="background:#1e293b;border:1px solid #334155;color:#94a3b8;
                       font-size:.75rem;font-weight:600;padding:.4rem .75rem;
                       border-radius:.5rem;cursor:pointer;transition:all .15s"
                onmouseover="this.style.background='#334155'"
                onmouseout="this.style.background='#1e293b'">
                📋 Copiar
              </button>
            </div>
          </div>

          <!-- Acciones -->
          <div style="padding:1.25rem 1.5rem;display:flex;align-items:center;
                      justify-content:flex-end;gap:.75rem">
            <div id="cfg-msg"
                 style="flex:1;font-size:.8rem;display:none"></div>
            <button id="cfg-save"
              style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;
                     font-weight:600;font-size:.875rem;padding:.6rem 1.5rem;
                     border-radius:.5rem;border:none;cursor:pointer;
                     transition:opacity .15s">
              Guardar cambios
            </button>
          </div>

        </div>
      </div>
    `;

    const cfgName      = container.querySelector('#cfg-name');
    const cfgWa        = container.querySelector('#cfg-whatsapp');
    const cfgWaPreview = container.querySelector('#cfg-wa-preview');
    const cfgWaLink    = container.querySelector('#cfg-wa-link');
    const cfgSave      = container.querySelector('#cfg-save');
    const cfgMsg       = container.querySelector('#cfg-msg');
    const cfgCopy      = container.querySelector('#cfg-copy-link');
    const cfgStoreLink = container.querySelector('#cfg-store-link');

    // Actualizar preview wa.me en tiempo real
    cfgWa.addEventListener('input', () => {
      const digits = cfgWa.value.replace(/\D/g, '');
      if (digits.length >= 7) {
        cfgWaLink.textContent    = `wa.me/${digits}`;
        cfgWaPreview.style.display = '';
      } else {
        cfgWaPreview.style.display = 'none';
      }
    });

    // Cargar datos actuales
    try {
      const res  = await API.settings.get();
      const data = res.data || {};

      cfgName.value = data.name || '';
      cfgWa.value   = data.whatsapp || '';
      container.querySelector('#cfg-slug').textContent  = data.slug  || '—';
      container.querySelector('#cfg-email').textContent = data.email || '—';

      const storeUrl = `${location.origin}/tienda/${data.slug}`;
      cfgStoreLink.href        = storeUrl;
      cfgStoreLink.textContent = storeUrl;
      cfgCopy.addEventListener('click', () => {
        navigator.clipboard.writeText(storeUrl).then(() => {
          cfgCopy.textContent = '✓ Copiado';
          setTimeout(() => { cfgCopy.textContent = '📋 Copiar'; }, 1800);
        });
      });

      if (data.whatsapp) {
        cfgWaLink.textContent    = `wa.me/${data.whatsapp}`;
        cfgWaPreview.style.display = '';
      }
    } catch (err) {
      showMsg(cfgMsg, 'error', 'Error al cargar la configuración.');
    }

    // Guardar
    cfgSave.addEventListener('click', async () => {
      cfgSave.disabled   = true;
      cfgSave.textContent = 'Guardando…';

      try {
        await API.settings.update({
          name:     cfgName.value.trim(),
          whatsapp: cfgWa.value.replace(/\D/g, ''),
        });
        showMsg(cfgMsg, 'success', '✓ Cambios guardados correctamente.');
        App.showToast('Configuración guardada.', 'success');
      } catch (err) {
        showMsg(cfgMsg, 'error', err.message || 'Error al guardar.');
      } finally {
        cfgSave.disabled    = false;
        cfgSave.textContent = 'Guardar cambios';
      }
    });
  }

  function showMsg(el, type, text) {
    el.style.display = '';
    el.style.color   = type === 'success' ? '#34d399' : '#f87171';
    el.textContent   = text;
    setTimeout(() => { el.style.display = 'none'; }, 4000);
  }

  return { render };
})();

window.Settings = Settings;
