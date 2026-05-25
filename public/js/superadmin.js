/**
 * superadmin.js — Panel de Monitoreo Global.
 *
 * Solo visible para usuarios con role === 'superadmin'.
 * Consume:
 *   GET /api/v1/superadmin/logs?limit=N&tenant=slug
 *   GET /api/v1/superadmin/tenants
 */

const SuperAdmin = (() => {

  // ─── Estilos por acción ───────────────────────────────────────────────────
  const ACTION_STYLES = {
    'create_collection': { bg: '#064e3b', border: '#065f46', color: '#34d399',  label: 'Nueva colección' },
    'delete_collection': { bg: '#450a0a', border: '#7f1d1d', color: '#f87171',  label: 'Eliminó colección' },
    'create_item':       { bg: '#0c2a4a', border: '#1e40af', color: '#93c5fd',  label: 'Nuevo producto' },
    'update_item':       { bg: '#1e1b4b', border: '#4338ca', color: '#a5b4fc',  label: 'Editó producto' },
    'delete_item':       { bg: '#450a0a', border: '#7f1d1d', color: '#fca5a5',  label: 'Eliminó producto' },
    'sell_item':         { bg: '#2e1065', border: '#7c3aed', color: '#c4b5fd',  label: 'Venta directa' },
    'checkout':          { bg: '#022c22', border: '#065f46', color: '#6ee7b7',  label: 'Checkout público' },
    'user_register':     { bg: '#0c2a4a', border: '#1d4ed8', color: '#7dd3fc',  label: 'Registro' },
    'user_login':        { bg: '#1e293b', border: '#334155', color: '#94a3b8',  label: 'Login' },
    'update_plan':       { bg: '#1c1917', border: '#92400e', color: '#fde68a',  label: 'Cambio de plan' },
    'update_settings':   { bg: '#0f2617', border: '#166534', color: '#86efac',  label: 'Config. tienda' },
  };

  // ─── Plan badge ───────────────────────────────────────────────────────────
  const PLAN_STYLES = {
    basic: { bg: '#1e293b', border: '#334155', color: '#94a3b8', label: 'Basic'   },
    pro:   { bg: '#1e1b4b', border: '#4338ca', color: '#a5b4fc', label: 'Pro ✨'  },
    full:  { bg: '#2e1065', border: '#7c3aed', color: '#c4b5fd', label: 'Full 🚀' },
  };

  function planBadge(plan) {
    const s = PLAN_STYLES[plan] || PLAN_STYLES.basic;
    return `<span class="plan-badge-span"
                  style="background:${s.bg};border:1px solid ${s.border};color:${s.color};
                         font-size:.68rem;font-weight:700;padding:.18rem .55rem;
                         border-radius:.375rem;display:inline-block">
              ${escHtml(s.label)}
            </span>`;
  }

  function actionBadge(action) {
    const s = ACTION_STYLES[action] || { bg: '#1e293b', border: '#334155', color: '#64748b', label: action };
    return `<span style="background:${s.bg};border:1px solid ${s.border};color:${s.color};` +
           `font-size:.68rem;font-weight:600;padding:.18rem .55rem;border-radius:.375rem;` +
           `white-space:nowrap;display:inline-block">${escHtml(s.label)}</span>`;
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  }

  // ─── render() ─────────────────────────────────────────────────────────────

  async function render(container) {
    container.innerHTML = `
      <div class="animate-fade-in" style="max-width:1200px;margin:0 auto">

        <!-- Cabecera -->
        <div style="display:flex;align-items:flex-start;justify-content:space-between;
                    margin-bottom:1.5rem;flex-wrap:wrap;gap:1rem">
          <div>
            <h1 style="font-size:1.375rem;font-weight:700;color:#f1f5f9;margin:0 0 .25rem">
              🔭 Monitoreo Global
            </h1>
            <p style="color:#64748b;font-size:.85rem;margin:0">
              Registro de actividad de todos los tenants de la plataforma.
            </p>
          </div>

          <!-- Controles -->
          <div style="display:flex;gap:.625rem;align-items:center;flex-wrap:wrap">
            <input id="sa-filter-tenant" type="text" placeholder="Filtrar por slug…"
              style="background:#0f172a;border:1px solid #334155;border-radius:.5rem;
                     color:#f1f5f9;padding:.4rem .75rem;font-size:.8rem;outline:none;
                     width:150px;transition:border-color .15s"/>

            <select id="sa-filter-limit"
              style="background:#0f172a;border:1px solid #334155;border-radius:.5rem;
                     color:#f1f5f9;padding:.4rem .75rem;font-size:.8rem;
                     outline:none;cursor:pointer">
              <option value="50">50 logs</option>
              <option value="100" selected>100 logs</option>
              <option value="250">250 logs</option>
              <option value="500">500 logs</option>
            </select>

            <button id="sa-refresh-btn"
              style="display:flex;align-items:center;gap:.4rem;
                     background:linear-gradient(135deg,#6366f1,#8b5cf6);
                     color:#fff;font-weight:600;font-size:.8rem;
                     padding:.45rem 1rem;border-radius:.5rem;border:none;cursor:pointer;
                     transition:opacity .15s">
              <svg xmlns="http://www.w3.org/2000/svg"
                   style="width:.9rem;height:.9rem;flex-shrink:0"
                   fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11
                     4v5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              Actualizar
            </button>
          </div>
        </div>

        <!-- Tarjetas de estadísticas -->
        <div id="sa-stats"
          style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
                 gap:1rem;margin-bottom:1.5rem">
          ${statCardLoading()}
        </div>

        <!-- Tabla de logs -->
        <div style="background:#1e293b;border:1px solid #334155;border-radius:.75rem;
                    overflow:hidden;margin-bottom:1.5rem">
          <div id="sa-logs-wrap">
            ${tableLoading('Cargando registros…')}
          </div>
        </div>

        <!-- Sección de tenants -->
        <h2 style="font-size:.95rem;font-weight:600;color:#cbd5e1;margin:0 0 .875rem">
          👥 Tenants registrados
        </h2>
        <div style="background:#1e293b;border:1px solid #334155;border-radius:.75rem;
                    overflow:hidden">
          <div id="sa-tenants-wrap">
            ${tableLoading('Cargando tenants…')}
          </div>
        </div>

        <style>
          @keyframes spin{to{transform:rotate(360deg)}}
          .sa-hover-row:hover { background:#162032; }
          .plan-select:focus  { outline:none; border-color:#6366f1; }
        </style>
      </div>
    `;

    const refreshBtn    = container.querySelector('#sa-refresh-btn');
    const filterTenant  = container.querySelector('#sa-filter-tenant');
    const filterLimit   = container.querySelector('#sa-filter-limit');

    async function load() {
      refreshBtn.disabled      = true;
      refreshBtn.style.opacity = '.55';

      const tenant = filterTenant.value.trim() || undefined;
      const limit  = parseInt(filterLimit.value, 10) || 100;

      try {
        const [logsRes, tenantsRes] = await Promise.all([
          API.superadmin.logs(limit, tenant),
          tenant ? Promise.resolve(null) : API.superadmin.tenants(),
        ]);

        renderStats(container, logsRes, tenantsRes);
        renderLogs(container, logsRes.data || []);
        if (tenantsRes) renderTenants(container, tenantsRes.data || []);

      } catch (err) {
        const msg = (err && err.message) ? err.message : JSON.stringify(err);
        container.querySelector('#sa-logs-wrap').innerHTML =
          `<div style="padding:1.5rem;color:#f87171;font-size:.875rem">
             ✕ Error al cargar los datos: ${escHtml(msg)}
           </div>`;
      } finally {
        refreshBtn.disabled      = false;
        refreshBtn.style.opacity = '1';
      }
    }

    // Focus ring CSP-safe (sin onfocus/onblur inline)
    filterTenant.addEventListener('focus', () => { filterTenant.style.borderColor = '#6366f1'; });
    filterTenant.addEventListener('blur',  () => { filterTenant.style.borderColor = '#334155'; });

    refreshBtn.addEventListener('click', load);
    filterLimit.addEventListener('change', load);
    filterTenant.addEventListener('keydown', e => { if (e.key === 'Enter') load(); });

    await load();
  }

  // ─── Estadísticas ─────────────────────────────────────────────────────────

  function renderStats(container, logsRes, tenantsRes) {
    const logs = logsRes.data || [];
    const counts = {};
    logs.forEach(l => { counts[l.action] = (counts[l.action] || 0) + 1; });

    const stats = [
      { label: 'Total logs',         value: logsRes.total || 0,            color: '#f1f5f9' },
      { label: 'Ventas directas',    value: counts['sell_item']   || 0,    color: '#c4b5fd' },
      { label: 'Checkouts públicos', value: counts['checkout']    || 0,    color: '#6ee7b7' },
      { label: 'Productos creados',  value: counts['create_item'] || 0,    color: '#93c5fd' },
      { label: 'Tenants',            value: tenantsRes ? tenantsRes.total : '—', color: '#fbbf24' },
    ];

    container.querySelector('#sa-stats').innerHTML = stats.map(s => `
      <div style="background:#0f172a;border:1px solid #1e293b;border-radius:.625rem;padding:1rem">
        <p style="color:#475569;font-size:.68rem;text-transform:uppercase;
                  letter-spacing:.06em;margin:0 0 .35rem">${escHtml(s.label)}</p>
        <p style="color:${s.color};font-size:1.5rem;font-weight:700;margin:0;line-height:1">${s.value}</p>
      </div>
    `).join('');
  }

  // ─── Tabla de logs ────────────────────────────────────────────────────────

  function renderLogs(container, logs) {
    if (logs.length === 0) {
      container.querySelector('#sa-logs-wrap').innerHTML =
        `<div style="padding:2rem;text-align:center;color:#475569;font-size:.875rem">
           No hay registros de actividad aún.
         </div>`;
      return;
    }

    const rows = logs.map(log => `
      <tr class="sa-hover-row" style="border-bottom:1px solid #1e293b;transition:background .1s">
        <td style="padding:.6rem 1rem;white-space:nowrap;font-size:.75rem;color:#64748b">
          ${escHtml(formatDate(log.createdAt))}
        </td>
        <td style="padding:.6rem 1rem">
          <span style="color:#e2e8f0;font-size:.82rem;font-weight:500">
            ${escHtml(log.tenantName || '—')}
          </span>
          ${log.tenantSlug
            ? `<br><code style="color:#6366f1;font-size:.68rem">@${escHtml(log.tenantSlug)}</code>`
            : ''}
        </td>
        <td style="padding:.6rem 1rem">${actionBadge(log.action)}</td>
        <td style="padding:.6rem 1rem;font-size:.78rem;color:#94a3b8;
                   max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
            title="${escHtml(log.details || '')}">
          ${escHtml(log.details || '—')}
        </td>
      </tr>
    `).join('');

    container.querySelector('#sa-logs-wrap').innerHTML = `
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#0f172a;border-bottom:2px solid #334155">
              ${th('Fecha y hora')}
              ${th('Tienda / Usuario')}
              ${th('Acción')}
              ${th('Detalles')}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  // ─── Tabla de tenants ─────────────────────────────────────────────────────

  function renderTenants(container, tenants) {
    const wrap = container.querySelector('#sa-tenants-wrap');

    if (tenants.length === 0) {
      wrap.innerHTML =
        `<div style="padding:1.5rem;text-align:center;color:#475569;font-size:.875rem">
           No hay tenants registrados.
         </div>`;
      return;
    }

    const rows = tenants.map(t => {
      const plan = t.plan || 'basic';
      return `
      <tr class="sa-hover-row" style="border-bottom:1px solid #1e293b;transition:background .1s">
        <td style="padding:.6rem 1rem">
          <span style="color:#e2e8f0;font-size:.82rem;font-weight:500">
            ${escHtml(t.name || '—')}
          </span>
          <br>
          <code style="color:#6366f1;font-size:.68rem">@${escHtml(t.slug || '—')}</code>
        </td>
        <td style="padding:.6rem 1rem;font-size:.78rem;color:#64748b">
          ${escHtml(t.email || '—')}
        </td>
        <td style="padding:.6rem 1rem">
          ${t.role === 'superadmin'
            ? `<span style="background:#1e1b4b;border:1px solid #4338ca;color:#a5b4fc;
                            font-size:.68rem;font-weight:600;padding:.18rem .55rem;
                            border-radius:.375rem">⭐ SuperAdmin</span>`
            : `<span style="background:#1e293b;border:1px solid #334155;color:#64748b;
                            font-size:.68rem;font-weight:500;padding:.18rem .55rem;
                            border-radius:.375rem">Tenant</span>`}
        </td>
        <td style="padding:.6rem 1rem">
          ${planBadge(plan)}
          ${t.role !== 'superadmin' ? `
          <br>
          <select class="plan-select"
            data-tenant-id="${escHtml(t.id)}"
            data-current-plan="${escHtml(plan)}"
            style="margin-top:.35rem;background:#0f172a;border:1px solid #334155;
                   border-radius:.375rem;color:#f1f5f9;font-size:.68rem;
                   padding:.2rem .5rem;cursor:pointer;outline:none;
                   transition:border-color .15s">
            <option value="basic" ${plan === 'basic' ? 'selected' : ''}>Basic  (35 prod.)</option>
            <option value="pro"   ${plan === 'pro'   ? 'selected' : ''}>Pro    (100 prod.)</option>
            <option value="full"  ${plan === 'full'  ? 'selected' : ''}>Full   (200 prod.)</option>
          </select>` : ''}
        </td>
        <td style="padding:.6rem 1rem;font-size:.78rem;color:#64748b">
          ${t.activityCount || 0} acciones
          ${t.lastActivity
            ? `<br><span style="font-size:.68rem;color:#475569">
                 última: ${escHtml(formatDate(t.lastActivity))}
               </span>`
            : ''}
        </td>
        <td style="padding:.6rem 1rem;font-size:.75rem;color:#475569;white-space:nowrap">
          ${escHtml(formatDate(t.createdAt))}
        </td>
      </tr>
    `}).join('');

    wrap.innerHTML = `
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#0f172a;border-bottom:2px solid #334155">
              ${th('Negocio')}
              ${th('Email')}
              ${th('Rol')}
              ${th('Plan')}
              ${th('Actividad')}
              ${th('Registrado')}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;

    // ── Bind plan selectors (CSP-safe — sin onchange inline) ──────────────
    wrap.querySelectorAll('.plan-select').forEach(sel => {
      sel.addEventListener('change', async function () {
        const tenantId  = this.dataset.tenantId;
        const newPlan   = this.value;
        const prevPlan  = this.dataset.currentPlan;

        this.disabled = true;
        try {
          await API.superadmin.updatePlan(tenantId, newPlan);
          this.dataset.currentPlan = newPlan;

          // Actualizar el badge en la misma celda
          const badge = this.closest('td')?.querySelector('.plan-badge-span');
          if (badge) {
            const s = PLAN_STYLES[newPlan] || PLAN_STYLES.basic;
            badge.style.background  = s.bg;
            badge.style.borderColor = s.border;
            badge.style.color       = s.color;
            badge.textContent       = s.label;
          }

          if (window.App) window.App.showToast(`Plan de @${tenantId.slice(0,6)}… → ${newPlan}`, 'success');
        } catch (err) {
          this.value = prevPlan;   // revertir visualmente
          if (window.App) window.App.showToast(
            (err && err.message) ? err.message : 'Error al actualizar el plan.',
            'error'
          );
        } finally {
          this.disabled = false;
        }
      });
    });
  }

  // ─── Helpers de UI ────────────────────────────────────────────────────────

  function th(label) {
    return `<th style="padding:.6rem 1rem;text-align:left;font-size:.68rem;font-weight:600;
                        color:#475569;text-transform:uppercase;letter-spacing:.07em;
                        white-space:nowrap">${label}</th>`;
  }

  function tableLoading(msg) {
    return `<div style="padding:2rem;text-align:center;color:#475569;font-size:.875rem">
              <div style="width:1.25rem;height:1.25rem;border:2px solid #6366f1;
                          border-top-color:transparent;border-radius:50%;
                          animation:spin .7s linear infinite;margin:0 auto .75rem"></div>
              ${escHtml(msg)}
            </div>`;
  }

  function statCardLoading() {
    return `<div style="background:#0f172a;border:1px solid #1e293b;border-radius:.625rem;
                        padding:1rem;color:#475569;font-size:.8rem">Cargando…</div>`;
  }

  function escHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { render };
})();

window.SuperAdmin = SuperAdmin;
