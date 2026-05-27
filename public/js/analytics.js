/**
 * analytics.js — Dashboard de Ventas y Analíticas.
 *
 * Muestra KPIs, gráfico de ingresos por día (Chart.js), top productos
 * y desglose por canal para el tenant autenticado.
 *
 * Seguridad CSP: cero inline handlers — toda lógica vía addEventListener.
 * Chart.js se inicializa solo si el canvas #analytics-chart existe en el DOM.
 */

const Analytics = (() => {

  let _chartInstance = null;
  let _currentPeriod = 30;

  // ══════════════════════════════════════════════════════════════════════════════
  // RENDER PRINCIPAL
  // ══════════════════════════════════════════════════════════════════════════════

  async function render(container) {
    // Destruir gráfico anterior si el panel se re-renderiza (navegación repetida)
    if (_chartInstance) {
      _chartInstance.destroy();
      _chartInstance = null;
    }

    container.innerHTML = buildShell();
    bindPeriodButtons(container);
    await loadAndRender(container, _currentPeriod);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // SHELL — estructura fija del panel (sin datos)
  // ══════════════════════════════════════════════════════════════════════════════

  function buildShell() {
    return `
      <div class="animate-fade-in">

        <!-- Cabecera -->
        <div style="display:flex;align-items:flex-start;justify-content:space-between;
                    flex-wrap:wrap;gap:1rem;margin-bottom:1.75rem">
          <div>
            <h1 style="font-size:1.375rem;font-weight:700;color:#f1f5f9;margin:0 0 .3rem;
                       display:flex;align-items:center;gap:.625rem">
              <svg xmlns="http://www.w3.org/2000/svg"
                   style="width:1.25rem;height:1.25rem;color:#6366f1;flex-shrink:0"
                   fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
              </svg>
              Ventas y Analíticas
            </h1>
            <p style="color:#64748b;font-size:.85rem;margin:0">
              Resumen de actividad comercial de tu tienda.
            </p>
          </div>

          <!-- Selector de período -->
          <div style="display:flex;gap:.375rem;background:#0f172a;
                      border:1px solid #334155;border-radius:.5rem;padding:.25rem;
                      align-self:flex-start">
            <button class="period-btn" data-days="7"
              style="padding:.35rem .85rem;font-size:.78rem;font-weight:600;border:none;
                     border-radius:.375rem;cursor:pointer;transition:all .15s;
                     background:transparent;color:#64748b">7 días</button>
            <button class="period-btn" data-days="30"
              style="padding:.35rem .85rem;font-size:.78rem;font-weight:600;border:none;
                     border-radius:.375rem;cursor:pointer;transition:all .15s;
                     background:#6366f1;color:#fff">30 días</button>
            <button class="period-btn" data-days="90"
              style="padding:.35rem .85rem;font-size:.78rem;font-weight:600;border:none;
                     border-radius:.375rem;cursor:pointer;transition:all .15s;
                     background:transparent;color:#64748b">90 días</button>
          </div>
        </div>

        <!-- KPI Cards (skeleton mientras carga) -->
        <!-- grid-cols responsive: 1 col en móvil → 2 en sm → 4 en lg -->
        <div id="analytics-kpis"
             class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          ${kpiSkeleton()}
          ${kpiSkeleton()}
          ${kpiSkeleton()}
          ${kpiSkeleton()}
        </div>

        <!-- Gráfico -->
        <div style="background:#1e293b;border:1px solid #334155;
                    border-radius:.75rem;padding:1.25rem;margin-bottom:1rem">
          <div style="display:flex;align-items:center;justify-content:space-between;
                      margin-bottom:1rem;flex-wrap:wrap;gap:.5rem">
            <h2 style="font-size:.875rem;font-weight:600;color:#e2e8f0;margin:0">
              Ingresos y Ganancia por día
            </h2>
            <span id="analytics-chart-period"
                  style="font-size:.7rem;color:#475569;font-weight:500"></span>
          </div>
          <div style="position:relative;height:220px">
            <canvas id="analytics-chart"></canvas>
          </div>
        </div>

        <!-- Top Productos + Canales: 1 col en móvil → 2 cols en lg -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

          <!-- Top productos -->
          <div style="background:#1e293b;border:1px solid #334155;
                      border-radius:.75rem;padding:1.25rem">
            <h2 style="font-size:.875rem;font-weight:600;color:#e2e8f0;margin:0 0 1rem">
              Lo más vendido
            </h2>
            <div id="analytics-top">
              ${skeletonRow()}${skeletonRow()}${skeletonRow()}
            </div>
          </div>

          <!-- Desglose por canal -->
          <div style="background:#1e293b;border:1px solid #334155;
                      border-radius:.75rem;padding:1.25rem">
            <h2 style="font-size:.875rem;font-weight:600;color:#e2e8f0;margin:0 0 1rem">
              Canales de venta
            </h2>
            <div id="analytics-channels">
              ${skeletonRow()}${skeletonRow()}
            </div>
          </div>

        </div>

        <!-- Nota -->
        <p style="font-size:.72rem;color:#334155;text-align:center;margin-top:1rem">
          Los ingresos se estiman con los precios actuales de los productos · Solo se registran
          ventas mediante el panel (Venta directa) o la tienda pública (Checkout web).
        </p>

      </div>
    `;
  }

  function kpiSkeleton() {
    return `
      <div style="background:#1e293b;border:1px solid #334155;border-radius:.75rem;
                  padding:1.25rem;animation:analytPulse 1.5s ease-in-out infinite">
        <div style="height:.65rem;background:#334155;border-radius:.25rem;
                    width:55%;margin-bottom:.875rem"></div>
        <div style="height:1.75rem;background:#334155;border-radius:.25rem;
                    width:70%"></div>
      </div>
      <style>@keyframes analytPulse{0%,100%{opacity:1}50%{opacity:.45}}</style>
    `;
  }

  function skeletonRow() {
    return `
      <div style="height:.75rem;background:#334155;border-radius:.25rem;
                  margin-bottom:.875rem;opacity:.5;animation:analytPulse 1.5s ease-in-out infinite"></div>
    `;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // DATA LOADING
  // ══════════════════════════════════════════════════════════════════════════════

  async function loadAndRender(container, days) {
    setLoadingState(container, true);

    // Opacidad durante recarga de período (no en carga inicial con skeleton)
    var kpis     = container.querySelector('#analytics-kpis');
    var topEl    = container.querySelector('#analytics-top');
    var chEl     = container.querySelector('#analytics-channels');

    try {
      var res  = await API.analytics.get(days);
      var data = res.data;

      renderKPIs(container, data);
      renderChart(container, data, days);
      renderTopProducts(container, data);
      renderChannels(container, data);

    } catch (err) {
      if (kpis) {
        kpis.innerHTML =
          '<p style="color:#f87171;font-size:.85rem;grid-column:1/-1;padding:.75rem 0">' +
          'Error al cargar datos: ' + escHtml(err.message || 'inténtalo de nuevo.') +
          '</p>';
      }
      if (topEl)    topEl.innerHTML    = '';
      if (chEl)     chEl.innerHTML     = '';
    } finally {
      setLoadingState(container, false);
    }
  }

  function setLoadingState(container, loading) {
    container.querySelectorAll('.period-btn').forEach(function(b) {
      b.disabled      = loading;
      b.style.opacity = loading ? '.55' : '1';
    });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // KPI CARDS
  // ══════════════════════════════════════════════════════════════════════════════

  function renderKPIs(container, data) {
    var el = container.querySelector('#analytics-kpis');
    if (!el) return;

    var profit     = typeof data.netProfit === 'number' ? data.netProfit : (data.totalRevenue || 0);
    var profColor  = profit < 0 ? '#f87171' : profit > 0 ? '#34d399' : '#94a3b8';

    el.innerHTML =
      kpiCard(
        'Total Ingresos',
        fmtCurrency(data.totalRevenue || 0),
        '#6366f1',
        '<path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>'
      ) +
      kpiCard(
        'Ganancia Neta',
        fmtCurrency(profit),
        '#10b981',
        '<path stroke-linecap="round" stroke-linejoin="round" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>',
        'rgba(16,185,129,.12)',
        profColor
      ) +
      kpiCard(
        'Transacciones',
        String(data.totalTransactions || 0),
        '#8b5cf6',
        '<path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>'
      ) +
      kpiCard(
        'Ticket Promedio',
        fmtCurrency(data.avgTicket || 0),
        '#a78bfa',
        '<path stroke-linecap="round" stroke-linejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z"/>'
      );
  }

  // iconBg y valueColor son opcionales (backward-compatible)
  function kpiCard(label, value, color, iconPath, iconBg, valueColor) {
    iconBg     = iconBg     || 'rgba(99,102,241,.12)';
    valueColor = valueColor || '#f1f5f9';
    return `
      <div style="background:#1e293b;border:1px solid #334155;border-radius:.75rem;padding:1.25rem">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem">
          <div style="min-width:0">
            <p style="font-size:.68rem;font-weight:600;color:#64748b;
                      text-transform:uppercase;letter-spacing:.08em;margin:0 0 .5rem">
              ${label}
            </p>
            <p style="font-size:1.5rem;font-weight:700;color:${valueColor};margin:0;line-height:1.2;
                      word-break:break-all">
              ${value}
            </p>
          </div>
          <div style="width:2.25rem;height:2.25rem;border-radius:.5rem;flex-shrink:0;
                      background:${iconBg};
                      display:flex;align-items:center;justify-content:center">
            <svg xmlns="http://www.w3.org/2000/svg"
                 style="width:1.1rem;height:1.1rem;color:${color}"
                 fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
              ${iconPath}
            </svg>
          </div>
        </div>
      </div>
    `;
  }

  function fmtCurrency(n) {
    var num = Number(n) || 0;
    if (num >= 1000000) return '$' + (num / 1000000).toFixed(1).replace('.0', '') + 'M';
    if (num >= 1000)    return '$' + (num / 1000).toFixed(1).replace('.0', '') + 'K';
    return '$' + num.toLocaleString('es-CL');
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // CHART (Chart.js 4.x UMD)
  // ══════════════════════════════════════════════════════════════════════════════

  function renderChart(container, data, days) {
    var canvas = container.querySelector('#analytics-chart');
    if (!canvas) return;

    var periodEl = container.querySelector('#analytics-chart-period');
    if (periodEl) periodEl.textContent = 'Últimos ' + days + ' días';

    // Destruir instancia anterior
    if (_chartInstance) {
      _chartInstance.destroy();
      _chartInstance = null;
    }

    // Guard: Chart.js debe estar disponible
    if (typeof Chart === 'undefined') {
      canvas.parentElement.innerHTML =
        '<p style="color:#475569;font-size:.8rem;text-align:center;padding:3rem 0">' +
        'Gráfico no disponible (Chart.js no cargó).</p>';
      return;
    }

    // Construir serie temporal completa (rellenar días sin ventas)
    var allDates = [];
    for (var i = days - 1; i >= 0; i--) {
      var d = new Date(Date.now() - i * 86400000);
      allDates.push(d.toISOString().slice(0, 10));
    }

    var dataMap  = {};
    (data.byDay || []).forEach(function(row) { dataMap[row.date] = row; });

    var labels   = allDates.map(function(dt) { return formatDateLabel(dt, days); });
    var revenues = allDates.map(function(dt) { return (dataMap[dt] && dataMap[dt].revenue) || 0; });
    var profits  = allDates.map(function(dt) {
      var row  = dataMap[dt];
      var rev  = (row && row.revenue) || 0;
      var cost = (row && row.cost)    || 0;
      return rev - cost;
    });
    var counts   = allDates.map(function(dt) { return (dataMap[dt] && dataMap[dt].count) || 0; });

    _chartInstance = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label:           'Ingresos Brutos',
            data:            revenues,
            backgroundColor: 'rgba(99,102,241,.55)',
            borderColor:     '#6366f1',
            borderWidth:     1,
            borderRadius:    3,
            hoverBackgroundColor: '#818cf8',
          },
          {
            label:           'Ganancia Neta',
            data:            profits,
            backgroundColor: 'rgba(16,185,129,.55)',
            borderColor:     '#10b981',
            borderWidth:     1,
            borderRadius:    3,
            hoverBackgroundColor: '#34d399',
          },
        ],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        interaction:         { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            labels: {
              color:    '#94a3b8',
              font:     { size: 11 },
              boxWidth: 10,
              padding:  14,
            },
          },
          tooltip: {
            backgroundColor: '#1e293b',
            borderColor:     '#334155',
            borderWidth:     1,
            titleColor:      '#e2e8f0',
            bodyColor:       '#94a3b8',
            padding:         10,
            callbacks: {
              label: function(ctx) {
                var sym = ctx.dataset.label === 'Ganancia Neta' ? '📈 ' : '💰 ';
                return ' ' + sym + ctx.dataset.label + ': $' + ctx.parsed.y.toLocaleString('es-CL');
              },
              afterLabel: function(ctx) {
                if (ctx.datasetIndex !== 0) return '';
                var c = counts[ctx.dataIndex];
                if (!c) return '';
                return ' ' + c + ' transacción' + (c > 1 ? 'es' : '');
              },
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color:        '#475569',
              font:         { size: 10 },
              maxRotation:  0,
              autoSkip:     true,
              maxTicksLimit: days <= 14 ? days : 15,
            },
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: '#475569',
              font:  { size: 10 },
              callback: function(v) {
                if (v >= 1000000) return '$' + (v / 1000000).toFixed(0) + 'M';
                if (v >= 1000)    return '$' + (v / 1000).toFixed(0) + 'K';
                return '$' + v;
              },
            },
            grid: { color: 'rgba(51,65,85,.5)' },
          },
        },
      },
    });
  }

  function formatDateLabel(dateStr, days) {
    var parts = dateStr.split('-');
    var d = new Date(
      parseInt(parts[0], 10),
      parseInt(parts[1], 10) - 1,
      parseInt(parts[2], 10)
    );
    if (days <= 7)  return d.toLocaleDateString('es-CL', { weekday: 'short' });
    return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // TOP PRODUCTOS
  // ══════════════════════════════════════════════════════════════════════════════

  function renderTopProducts(container, data) {
    var el = container.querySelector('#analytics-top');
    if (!el) return;

    var top = data.topProducts || [];

    if (!top.length) {
      el.innerHTML =
        '<p style="color:#475569;font-size:.82rem;padding:.5rem 0">Sin ventas en el período.</p>';
      return;
    }

    var maxQty = Math.max.apply(null, top.map(function(p) { return p.quantity; })) || 1;

    el.innerHTML = top.map(function(p, i) {
      var pct = Math.round(p.quantity / maxQty * 100);
      return `
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.875rem">
          <span style="width:1.2rem;text-align:center;font-size:.7rem;font-weight:700;
                       color:#475569;flex-shrink:0;line-height:1">${i + 1}</span>
          <div style="flex:1;min-width:0">
            <div style="display:flex;justify-content:space-between;align-items:baseline;
                        margin-bottom:.28rem;gap:.5rem">
              <span style="font-size:.8rem;font-weight:500;color:#e2e8f0;
                           white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
                           max-width:55%" title="${escHtml(p.name)}">${escHtml(p.name)}</span>
              <span style="font-size:.7rem;color:#64748b;flex-shrink:0;white-space:nowrap">
                ${p.quantity} ud · $${(p.revenue || 0).toLocaleString('es-CL')}
              </span>
            </div>
            <div style="height:4px;background:#0f172a;border-radius:2px">
              <div style="height:4px;border-radius:2px;
                          background:linear-gradient(90deg,#6366f1,#8b5cf6);
                          width:${pct}%;transition:width .45s ease"></div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // CANALES DE VENTA
  // ══════════════════════════════════════════════════════════════════════════════

  function renderChannels(container, data) {
    var el = container.querySelector('#analytics-channels');
    if (!el) return;

    var ch    = data.byChannel || { web: { count: 0, revenue: 0 }, direct: { count: 0, revenue: 0 } };
    var total = (ch.web.count || 0) + (ch.direct.count || 0);

    function pct(n) { return total ? Math.round((n || 0) / total * 100) : 0; }

    el.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:1.125rem">
        ${channelRow(
          'Tienda Web',
          'Pedidos vía checkout público',
          ch.web.count   || 0,
          ch.web.revenue || 0,
          pct(ch.web.count || 0),
          '#6366f1',
          '<path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>'
        )}
        ${channelRow(
          'Venta Directa',
          'Registradas desde el panel',
          ch.direct.count   || 0,
          ch.direct.revenue || 0,
          pct(ch.direct.count || 0),
          '#8b5cf6',
          '<path stroke-linecap="round" stroke-linejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/>'
        )}
      </div>
      ${total === 0
        ? '<p style="color:#334155;font-size:.78rem;text-align:center;margin-top:1rem">Sin actividad en el período.</p>'
        : ''}
    `;
  }

  function channelRow(name, subtitle, count, revenue, pct, color, iconPath) {
    return `
      <div>
        <div style="display:flex;align-items:center;gap:.625rem;margin-bottom:.45rem">
          <div style="width:2rem;height:2rem;border-radius:.375rem;flex-shrink:0;
                      background:rgba(99,102,241,.1);
                      display:flex;align-items:center;justify-content:center">
            <svg xmlns="http://www.w3.org/2000/svg"
                 style="width:.9rem;height:.9rem;color:${color}"
                 fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
              ${iconPath}
            </svg>
          </div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:.5rem">
              <span style="font-size:.8rem;font-weight:600;color:#cbd5e1">${name}</span>
              <span style="font-size:.75rem;font-weight:700;color:#a5b4fc;flex-shrink:0">${pct}%</span>
            </div>
            <span style="font-size:.7rem;color:#475569">
              ${count} transacción${count !== 1 ? 'es' : ''} · $${(revenue || 0).toLocaleString('es-CL')}
            </span>
          </div>
        </div>
        <div style="height:5px;background:#0f172a;border-radius:3px">
          <div style="height:5px;border-radius:3px;background:${color};
                      width:${pct}%;transition:width .5s ease"></div>
        </div>
      </div>
    `;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // SELECTOR DE PERÍODO (CSP-safe: addEventListener)
  // ══════════════════════════════════════════════════════════════════════════════

  function bindPeriodButtons(container) {
    container.querySelectorAll('.period-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var days = parseInt(btn.dataset.days, 10);
        if (days === _currentPeriod) return;
        _currentPeriod = days;

        // Estado visual del botón activo
        container.querySelectorAll('.period-btn').forEach(function(b) {
          var active = parseInt(b.dataset.days, 10) === days;
          b.style.background = active ? '#6366f1' : 'transparent';
          b.style.color      = active ? '#fff'    : '#64748b';
        });

        loadAndRender(container, days);
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // UTIL
  // ══════════════════════════════════════════════════════════════════════════════

  function escHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');   // CVE-4: escape comilla simple
  }

  return { render };

})();

window.Analytics = Analytics;
