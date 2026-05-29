/**
 * scanner-controller.js — Colector de Código de Barras (Full Stock).
 *
 * Convierte la cámara trasera del móvil en un escáner profesional con dos flujos:
 *   · Carga Rápida (+1)  → PATCH /api/products/quick-scan (suma stock atómica)
 *   · Escanear y Editar  → GET  /api/products/by-barcode  + abre modal de edición
 *
 * Usa la API nativa `BarcodeDetector` cuando está disponible. Si el navegador
 * no la soporta, se ofrece una entrada manual de código como alternativa.
 *
 * Seguridad estricta (Zero-Inline / CSP): TODA la lógica de eventos se enlaza
 * mediante addEventListener. No hay ningún handler inline en el HTML.
 */

(function () {
  'use strict';

  // Formatos de código soportados por BarcodeDetector (los más comunes en retail).
  const SUPPORTED_FORMATS = [
    'ean_13', 'ean_8', 'upc_a', 'upc_e',
    'code_128', 'code_39', 'code_93', 'itf', 'codabar', 'qr_code',
  ];

  const FullStockScanner = {
    // ── Estado interno ─────────────────────────────────────────────────────────
    video:        null,
    stream:       null,
    detector:     null,
    rafId:        null,
    running:      false,
    mode:         'quick-add',   // 'quick-add' | 'scan-edit'
    scanCooldown: false,         // bloquea lecturas durante 1.5 s tras detectar
    lastCode:     null,
    audioCtx:     null,
    dom:          {},            // referencias a elementos del DOM

    // ── init(): mapea el DOM, pide permisos de cámara y arranca el bucle ─────────
    async init(container) {
      // Detener cualquier sesión previa (p. ej. al re-renderizar el panel).
      this.stop();

      this.dom = {
        wrapper:   container.querySelector('#fullstock-camera-stream'),
        video:     container.querySelector('#scanner-video'),
        toggle:    container.querySelector('#scanner-mode-toggle'),
        label:     container.querySelector('#scanner-mode-label'),
        status:    container.querySelector('#scanner-status'),
        result:    container.querySelector('#scanner-result'),
        manualIn:  container.querySelector('#scanner-manual-input'),
        manualBtn: container.querySelector('#scanner-manual-btn'),
      };
      this.video = this.dom.video;

      // ── Toggle de modo (Carga Rápida ⇄ Escanear y Editar) ─────────────────────
      if (this.dom.toggle) {
        this.dom.toggle.addEventListener('change', () => {
          this.mode = this.dom.toggle.checked ? 'scan-edit' : 'quick-add';
          this.updateModeLabel();
        });
      }
      this.updateModeLabel();

      // ── Entrada manual (fallback / utilidad para teclados-lectores USB) ──────
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

      // ── Comprobar soporte de getUserMedia ────────────────────────────────────
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        this.setStatus('Tu navegador no permite acceder a la cámara. Usa la entrada manual.', 'error');
        return;
      }

      // ── Pedir la cámara trasera ──────────────────────────────────────────────
      try {
        this.setStatus('Solicitando acceso a la cámara…', 'info');
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
      } catch (err) {
        console.error('[scanner] getUserMedia', err);
        const msg = (err && err.name === 'NotAllowedError')
          ? 'Permiso de cámara denegado. Habilítalo en el navegador o usa la entrada manual.'
          : 'No se pudo acceder a la cámara. Usa la entrada manual.';
        this.setStatus(msg, 'error');
        return;
      }

      if (this.video) {
        this.video.srcObject = this.stream;
        this.video.setAttribute('playsinline', 'true');
        try { await this.video.play(); } catch (_) {}
      }

      // ── Preparar BarcodeDetector ──────────────────────────────────────────────
      if ('BarcodeDetector' in window) {
        try {
          let formats = SUPPORTED_FORMATS;
          if (typeof window.BarcodeDetector.getSupportedFormats === 'function') {
            const avail = await window.BarcodeDetector.getSupportedFormats();
            formats = SUPPORTED_FORMATS.filter((f) => avail.includes(f));
          }
          this.detector = new window.BarcodeDetector(
            formats.length ? { formats } : undefined
          );
          this.running = true;
          this.setStatus('Cámara lista. Apunta a un código de barras.', 'ready');
          this.loop();
        } catch (err) {
          console.error('[scanner] BarcodeDetector init', err);
          this.setStatus('No se pudo iniciar el detector. Usa la entrada manual.', 'error');
        }
      } else {
        this.setStatus(
          'Tu navegador no soporta detección automática. Escribe o escanea el código en la entrada manual.',
          'error'
        );
      }
    },

    // ── Bucle de detección con requestAnimationFrame ─────────────────────────────
    loop() {
      // Si el panel fue desmontado (navegación a otra sección), liberar la cámara.
      if (!this.video || !document.body.contains(this.video)) {
        this.stop();
        return;
      }
      if (!this.running) return;

      const scheduleNext = () => {
        this.rafId = requestAnimationFrame(() => this.loop());
      };

      if (this.scanCooldown || !this.detector ||
          !this.video.videoWidth || this.video.readyState < 2) {
        scheduleNext();
        return;
      }

      this.detector.detect(this.video)
        .then((codes) => {
          if (codes && codes.length && !this.scanCooldown) {
            const value = (codes[0].rawValue || '').trim();
            if (value) this.onCodeDetected(value);
          }
        })
        .catch(() => { /* fotograma no analizable; se ignora */ })
        .finally(scheduleNext);
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
      // Detener el bucle mientras se abre el modal de edición.
      this.running = false;
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
        this.resume();
      } catch (err) {
        const notFound = err && (err.found === false || err.status === 404 ||
          /no se encontr/i.test(err.message || ''));
        const msg = notFound
          ? ('No existe un producto con el código ' + code + '. Cámbiate a "Carga Rápida" para crearlo.')
          : ((err && err.message) ? err.message : 'Error al buscar el producto.');
        this.showResult(msg, false, true);
        if (window.App && App.showToast) App.showToast(msg, notFound ? 'info' : 'error');
        this.resume();
      }
    },

    // ── Reanudar el bucle tras un escaneo en modo edición ────────────────────────
    resume() {
      if (!this.video || !document.body.contains(this.video)) return;
      if (this.detector) {
        this.running = true;
        this.setStatus('Cámara lista. Apunta a un código de barras.', 'ready');
        this.loop();
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

    // ── stop(): libera la cámara y cancela el bucle ──────────────────────────────────
    stop() {
      this.running = false;
      if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
      if (this.stream) {
        try { this.stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
        this.stream = null;
      }
      if (this.video) {
        try { this.video.srcObject = null; } catch (_) {}
      }
      this.detector     = null;
      this.scanCooldown = false;
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

        <!-- Visor de cámara -->
        <div class="relative w-full overflow-hidden rounded-lg bg-black border border-slate-800"
             style="aspect-ratio:4/3;max-height:60vh">
          <video id="scanner-video" autoplay playsinline muted
                 class="w-full h-full object-cover"></video>

          <!-- Línea de escaneo roja -->
          <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div class="w-[78%] h-[1px] bg-red-500 shadow-[0_0_8px_2px_rgba(239,68,68,.8)]
                        animate-fs-scanline"></div>
          </div>
          <!-- Marco guía -->
          <div class="pointer-events-none absolute inset-6 border-2 border-white/15 rounded-lg"></div>
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
            Útil si tu navegador no soporta la detección por cámara o usas un lector externo.
          </p>
        </div>
      </div>
    `;
  }

  // Keyframes de la línea de escaneo (CSP-safe: <style> sin inline handlers).
  function injectScanlineStyle() {
    if (document.getElementById('fs-scanline-style')) return;
    const st = document.createElement('style');
    st.id = 'fs-scanline-style';
    st.textContent =
      '@keyframes fsScanline{0%{transform:translateY(-34%)}50%{transform:translateY(34%)}100%{transform:translateY(-34%)}}' +
      '.animate-fs-scanline{animation:fsScanline 2.2s ease-in-out infinite}';
    document.head.appendChild(st);
  }

  // ── Módulo de panel para el orquestador (App) ────────────────────────────────────
  const Scanner = {
    render(container) {
      injectScanlineStyle();
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
