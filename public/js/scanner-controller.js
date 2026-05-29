/**
 * scanner-controller.js — Colector de Código de Barras (Full Stock).
 *
 * Convierte la cámara trasera del móvil en un escáner profesional con dos flujos:
 *   · Carga Rápida (+1)  → PATCH /api/products/quick-scan (suma stock atómica)
 *   · Escanear y Editar  → GET  /api/products/by-barcode  + abre modal de edición
 *
 * Motor de escaneo: librería universal `html5-qrcode` (ZXing internamente).
 * Funciona en iOS Safari, Android Chrome y escritorio — sin depender de la API
 * nativa BarcodeDetector (no soportada en iOS).
 *
 * Seguridad estricta (Zero-Inline / CSP): TODA la lógica de eventos se enlaza
 * mediante addEventListener. No hay ningún handler inline en el HTML.
 */

(function () {
  'use strict';

  const FullStockScanner = {
    // ── Estado interno ─────────────────────────────────────────────────────────
    reader:       null,          // instancia Html5Qrcode
    readerEl:     null,          // <div id="reader">
    started:      false,         // true mientras la cámara está activa
    watchId:      null,          // intervalo que detecta desmontaje del panel
    mode:         'quick-add',   // 'quick-add' | 'scan-edit'
    scanCooldown: false,         // bloquea lecturas durante 1.5 s tras detectar
    lastCode:     null,
    audioCtx:     null,
    dom:          {},            // referencias a elementos del DOM

    // ── init(): mapea el DOM, configura listeners y arranca la cámara ────────────
    async init(container) {
      // Detener cualquier sesión previa (p. ej. al re-renderizar el panel).
      this.stop();

      this.dom = {
        wrapper:   container.querySelector('#fullstock-camera-stream'),
        toggle:    container.querySelector('#scanner-mode-toggle'),
        label:     container.querySelector('#scanner-mode-label'),
        status:    container.querySelector('#scanner-status'),
        result:    container.querySelector('#scanner-result'),
        manualIn:  container.querySelector('#scanner-manual-input'),
        manualBtn: container.querySelector('#scanner-manual-btn'),
      };
      this.readerEl = container.querySelector('#reader');

      // ── Toggle de modo (Carga Rápida ⇄ Escanear y Editar) ─────────────────────
      if (this.dom.toggle) {
        this.dom.toggle.addEventListener('change', () => {
          this.mode = this.dom.toggle.checked ? 'scan-edit' : 'quick-add';
          this.updateModeLabel();
        });
      }
      this.updateModeLabel();

      // ── Entrada manual (fallback / lectores USB tipo teclado) ─────────────────
      if (this.dom.manualBtn && this.dom.manualIn) {
        const submitManual = () => {
          const code = (this.dom.manualIn.value || '').trim();
          if (code) {
            this.onCodeDetected(code);
            this.dom.manualIn.value = '';
          }
          this.dom.manualIn.focus();
        };
        this.dom.manualBtn.addEventListener('click', submitManual);
        this.dom.manualIn.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); submitManual(); }
        });
      }

      // ── Comprobar que la librería esté cargada ────────────────────────────────
      if (typeof window.Html5Qrcode === 'undefined') {
        this.setStatus('No se pudo cargar el motor de escaneo. Revisa tu conexión e inténtalo de nuevo, o usa la entrada manual.', 'error');
        return;
      }

      await this.startCamera();
      this.watchUnmount();
    },

    // ── startCamera(): arranca html5-qrcode con la cámara trasera ────────────────
    async startCamera() {
      try {
        this.reader = new Html5Qrcode('reader', /* verbose */ false);
      } catch (err) {
        console.error('[scanner] Html5Qrcode init', err);
        this.setStatus('No se pudo inicializar el escáner. Usa la entrada manual.', 'error');
        return;
      }

      // Configuración optimizada para códigos de barras 1D (no solo QR).
      const config = { fps: 10, qrbox: { width: 250, height: 100 } };

      // Si la librería expone el enum de formatos, restringimos a los de retail
      // para acelerar y robustecer la lectura de barras.
      if (window.Html5QrcodeSupportedFormats) {
        const F = window.Html5QrcodeSupportedFormats;
        config.formatsToSupport = [
          F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E,
          F.CODE_128, F.CODE_39, F.CODE_93, F.ITF, F.CODABAR, F.QR_CODE,
        ];
      }

      this.setStatus('Solicitando acceso a la cámara…', 'info');

      try {
        await this.reader.start(
          { facingMode: 'environment' },
          config,
          (decodedText) => { this.onCodeDetected(decodedText); },
          (_errorMessage) => { /* ignorar errores de frame vacío para no saturar la consola */ }
        );
        this.started = true;
        this.setStatus('Cámara lista. Apunta a un código de barras.', 'ready');
      } catch (err) {
        console.error('Error al iniciar cámara:', err);
        this.setStatus('Permite el acceso a la cámara para escanear, o usa la entrada manual.', 'error');
      }
    },

    // ── onCodeDetected(): punto de entrada único para cada lectura ───────────────
    onCodeDetected(rawCode) {
      const code = String(rawCode || '').replace(/[^a-zA-Z0-9]/g, '').trim();
      if (!code) return;

      // Bloquear lecturas duplicadas durante 1.5 s.
      if (this.scanCooldown) return;
      this.scanCooldown = true;
      this.lastCode     = code;
      setTimeout(() => { this.scanCooldown = false; }, 1500);

      // Retroalimentación inmediata: beep + vibración.
      this.beep();
      this.vibrate();

      if (this.mode === 'scan-edit') {
        this.handleScanEdit(code);
      } else {
        this.handleQuickAdd(code);
      }
    },

    // ── Flujo Carga Rápida (+1) ──────────────────────────────────────────────────
    async handleQuickAdd(code) {
      this.setStatus('Procesando ' + code + '…', 'info');
      try {
        const res = await API.products.quickScan(code);
        this.flashSuccess();
        this.showResult(res.message || ('Stock actualizado para ' + code + '.'), res.created);
        if (window.App && App.showToast) {
          App.showToast(res.message || 'Stock actualizado.', 'success');
        }
        this.setStatus('Cámara lista. Apunta a otro código.', 'ready');
      } catch (err) {
        const msg = (err && err.message) ? err.message : 'No se pudo registrar el escaneo.';
        this.showResult(msg, false, true);
        if (window.App && App.showToast) App.showToast(msg, 'error');
        this.setStatus('Cámara lista. Apunta a un código de barras.', 'ready');
      }
    },

    // ── Flujo Escanear y Editar ──────────────────────────────────────────────────
    async handleScanEdit(code) {
      this.setStatus('Buscando producto ' + code + '…', 'info');
      try {
        const res = await API.products.findByBarcode(code);
        if (res && res.found && res.data) {
          this.showResult('Producto encontrado. Abriendo editor…', false);
          if (typeof window.abrirModalEdicionConDatos === 'function') {
            // Libera la cámara antes de cambiar de panel.
            this.stop();
            window.abrirModalEdicionConDatos(res.data);
            return;
          }
        }
        // No debería ocurrir (404 lanza error), pero por si acaso:
        this.showResult('Producto no encontrado para ' + code + '.', false, true);
      } catch (err) {
        const notFound = err && (err.found === false || err.status === 404 ||
          /no se encontr/i.test(err.message || ''));
        const msg = notFound
          ? ('No existe un producto con el código ' + code + '. Cámbiate a "Carga Rápida" para crearlo.')
          : ((err && err.message) ? err.message : 'Error al buscar el producto.');
        this.showResult(msg, false, true);
        if (window.App && App.showToast) App.showToast(msg, notFound ? 'info' : 'error');
      }
    },

    // ── Beep nativo con AudioContext ──────────────────────────────────────────────
    beep() {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        if (!this.audioCtx) this.audioCtx = new Ctx();
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

        const osc  = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.18, this.audioCtx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.audioCtx.currentTime + 0.16);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.18);
      } catch (_) { /* audio no disponible; se ignora */ }
    },

    // ── Vibración háptica ─────────────────────────────────────────────────────────
    vibrate() {
      try { if (navigator.vibrate) navigator.vibrate(80); } catch (_) {}
    },

    // ── Flash verde de éxito sobre el visor ───────────────────────────────────────
    flashSuccess() {
      const el = this.dom.wrapper;
      if (!el) return;
      el.classList.add('border-emerald-500', 'ring-2', 'ring-emerald-500/60');
      setTimeout(() => {
        el.classList.remove('border-emerald-500', 'ring-2', 'ring-emerald-500/60');
      }, 650);
    },

    // ── Etiqueta del modo activo ───────────────────────────────────────────────────
    updateModeLabel() {
      if (!this.dom.label) return;
      if (this.mode === 'scan-edit') {
        this.dom.label.textContent = 'Modo: Escanear y Editar';
        this.dom.label.className   = 'text-sm font-semibold text-indigo-400';
      } else {
        this.dom.label.textContent = 'Modo: Carga Rápida (+1)';
        this.dom.label.className   = 'text-sm font-semibold text-emerald-400';
      }
    },

    // ── Texto de estado bajo el visor ───────────────────────────────────────────────
    setStatus(text, kind) {
      if (!this.dom.status) return;
      const colors = {
        ready: 'text-emerald-400',
        info:  'text-slate-400',
        error: 'text-red-400',
      };
      this.dom.status.textContent = text;
      this.dom.status.className    = 'mt-3 text-center text-sm ' + (colors[kind] || colors.info);
    },

    // ── Tarjeta con el resultado de la última lectura ────────────────────────────────
    showResult(message, created, isError) {
      if (!this.dom.result) return;
      const base = 'mt-4 rounded-lg border px-4 py-3 text-sm animate-fade-in ';
      let cls;
      if (isError)      cls = 'bg-red-950/40 border-red-800 text-red-300';
      else if (created) cls = 'bg-indigo-950/40 border-indigo-700 text-indigo-200';
      else              cls = 'bg-emerald-950/40 border-emerald-700 text-emerald-200';
      this.dom.result.className   = base + cls;
      this.dom.result.textContent = message;
      this.dom.result.classList.remove('hidden');
    },

    // ── watchUnmount(): libera la cámara al salir del panel ──────────────────────────
    // navigate() reemplaza el innerHTML del panel, eliminando #reader del DOM.
    // Detectamos esa eliminación para detener la cámara y no dejarla encendida.
    watchUnmount() {
      if (this.watchId) clearInterval(this.watchId);
      this.watchId = setInterval(() => {
        if (!this.readerEl || !document.body.contains(this.readerEl)) {
          this.stop();
        }
      }, 1000);
    },

    // ── stop(): detiene el escaneo y libera la cámara ────────────────────────────────
    stop() {
      if (this.watchId) { clearInterval(this.watchId); this.watchId = null; }
      this.scanCooldown = false;

      const r = this.reader;
      this.reader = null;

      if (r && this.started) {
        this.started = false;
        // stop() es asíncrono; clear() limpia el DOM que inyectó la librería.
        r.stop().then(() => { try { r.clear(); } catch (_) {} }).catch(() => {});
      } else {
        this.started = false;
      }
    },
  };

  // ── Plantilla HTML del colector (Bloque 1 — Interfaz) ──────────────────────────────
  function template() {
    return `
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6 transition-all duration-200"
           id="fullstock-camera-stream">

        <!-- Cabecera -->
        <div class="flex items-start gap-3 mb-5">
          <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-white" fill="none"
                 viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
              <path stroke-linecap="round" stroke-linejoin="round"
                    d="M3 4h2v16H3V4zm4 0h1v16H7V4zm3 0h2v16h-2V4zm4 0h1v16h-1V4zm3 0h2v16h-2V4z"/>
            </svg>
          </div>
          <div class="min-w-0">
            <h2 class="text-lg font-bold text-white leading-tight">Colector de Código de Barras</h2>
            <p class="text-sm text-slate-400 mt-0.5">
              Usa la cámara trasera de tu móvil para gestionar existencias en tiempo récord.
            </p>
          </div>
        </div>

        <!-- Interruptor de modo -->
        <div class="flex items-center justify-between gap-4 bg-slate-950/60 border border-slate-800 rounded-lg px-4 py-3 mb-5">
          <span id="scanner-mode-label" class="text-sm font-semibold text-emerald-400">
            Modo: Carga Rápida (+1)
          </span>
          <label class="relative inline-flex items-center cursor-pointer select-none">
            <input type="checkbox" id="scanner-mode-toggle" class="sr-only peer"/>
            <span class="w-11 h-6 bg-emerald-600/70 peer-checked:bg-indigo-600 rounded-full
                         transition-colors duration-200 block"></span>
            <span class="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full
                         transition-transform duration-200 peer-checked:translate-x-5"></span>
          </label>
        </div>

        <!-- Visor de cámara: html5-qrcode inyecta el <video> dentro de #reader -->
        <div class="relative w-full overflow-hidden rounded-lg bg-black border border-slate-800"
             style="aspect-ratio:4/3;max-height:60vh">
          <div id="reader" class="w-full h-full object-cover"></div>

          <!-- Línea de escaneo roja (decorativa, flotante encima) -->
          <div class="pointer-events-none absolute inset-0 flex items-center justify-center z-10">
            <div class="w-[78%] h-[1px] bg-red-500 shadow-[0_0_8px_2px_rgba(239,68,68,.8)]
                        animate-fs-scanline"></div>
          </div>
          <!-- Marco guía -->
          <div class="pointer-events-none absolute inset-6 border-2 border-white/15 rounded-lg z-10"></div>
        </div>

        <!-- Estado -->
        <p id="scanner-status" class="mt-3 text-center text-sm text-slate-400">
          Iniciando cámara…
        </p>

        <!-- Resultado de la última lectura -->
        <div id="scanner-result" class="hidden"></div>

        <!-- Entrada manual (fallback) -->
        <div class="mt-5 pt-5 border-t border-slate-800">
          <label class="label" for="scanner-manual-input">Entrada manual de código</label>
          <div class="flex gap-2">
            <input id="scanner-manual-input" type="text" inputmode="numeric"
                   class="input-field" placeholder="Escribe o escanea con lector USB…"
                   autocomplete="off"/>
            <button id="scanner-manual-btn" class="btn-primary shrink-0" type="button">
              Procesar
            </button>
          </div>
          <p class="text-xs text-slate-600 mt-2">
            Útil si tu navegador no permite la cámara o usas un lector externo.
          </p>
        </div>
      </div>
    `;
  }

  // Estilos del visor + keyframes de la línea de escaneo.
  // CSP-safe: <style> sin inline handlers (styleSrc permite 'unsafe-inline').
  // Además neutraliza los estilos/controles "feos" que html5-qrcode inyecta,
  // para mantener la estética slate/indigo premium.
  function injectScannerStyles() {
    if (document.getElementById('fs-scanner-style')) return;
    const st = document.createElement('style');
    st.id = 'fs-scanner-style';
    st.textContent = [
      '@keyframes fsScanline{0%{transform:translateY(-34%)}50%{transform:translateY(34%)}100%{transform:translateY(-34%)}}',
      '.animate-fs-scanline{animation:fsScanline 2.2s ease-in-out infinite}',
      // Contenedor que crea la librería
      '#reader{border:none!important;padding:0!important;width:100%!important;height:100%!important;background:#000;}',
      '#reader video{width:100%!important;height:100%!important;object-fit:cover!important;border-radius:0!important;display:block;}',
      '#reader canvas{display:none!important;}',
      // Ocultar el logo/imagen informativa y cualquier chrome de UI de la librería
      '#reader img{display:none!important;}',
      '#reader__dashboard,#reader__header_message,#reader__status_span{display:none!important;}',
      '#reader__dashboard_section,#reader__dashboard_section_csr,#reader__dashboard_section_swaplink{display:none!important;}',
      '#reader a{display:none!important;}',
    ].join('');
    document.head.appendChild(st);
  }

  // ── Módulo de panel para el orquestador (App) ────────────────────────────────────
  const Scanner = {
    render(container) {
      injectScannerStyles();
      container.innerHTML = template();
      // init es async, pero render no necesita esperar: la UI ya está montada.
      FullStockScanner.init(container).catch((err) => {
        console.error('[scanner] init', err);
      });
    },
  };

  // Liberar la cámara si la pestaña se cierra o recarga.
  window.addEventListener('beforeunload', () => FullStockScanner.stop());

  window.FullStockScanner = FullStockScanner;
  window.Scanner          = Scanner;
})();
