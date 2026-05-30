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
    audioContext: null,          // se inicializa en la 1ª interacción (iOS/Android)
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

      // ── Desbloqueo de audio en la 1ª interacción (requisito iOS/Android) ──────
      // Cualquier toque dentro de la tarjeta del colector registra el gesto de
      // usuario necesario para que el AudioContext pueda sonar luego.
      if (this.dom.wrapper) {
        this.dom.wrapper.addEventListener('click', () => this.unlockAudio());
      }

      // ── Toggle de modo (Carga Rápida ⇄ Escanear y Editar) ─────────────────────
      if (this.dom.toggle) {
        this.dom.toggle.addEventListener('change', () => {
          this.unlockAudio();   // el cambio de switch cuenta como interacción
          this.mode = this.dom.toggle.checked ? 'scan-edit' : 'quick-add';
          this.updateModeLabel();
        });
      }
      this.updateModeLabel();

      // ── Entrada manual (fallback / lectores USB tipo teclado) ─────────────────
      if (this.dom.manualBtn && this.dom.manualIn) {
        const submitManual = () => {
          this.unlockAudio();   // clic/Enter del usuario → desbloquea audio
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
      this.triggerFeedback();

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

    // ── Desbloqueo de audio (iOS/Android exigen un gesto previo del usuario) ──────
    // Inicializa el AudioContext y lo reanuda si quedó suspendido. Debe llamarse
    // dentro de un handler de interacción (clic / change) para que surta efecto.
    unlockAudio() {
      try {
        if (!this.audioContext) {
          this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioContext.state === 'suspended') {
          this.audioContext.resume();
        }
      } catch (_) { /* audio no disponible en este navegador; se ignora */ }
    },

    // ── Beep agudo (1500 Hz) + vibración háptica ──────────────────────────────────
    triggerFeedback() {
      // Vibración para móviles (80 ms)
      if (navigator.vibrate) navigator.vibrate(80);

      // Generar Beep nativo (solo si el audio ya fue desbloqueado)
      if (!this.audioContext) return;

      try {
        const oscillator = this.audioContext.createOscillator();
        const gainNode   = this.audioContext.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(1500, this.audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.15, this.audioContext.currentTime); // Volumen al 15%

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + 0.1); // Duración: 100 ms
      } catch (_) { /* el contexto puede no estar listo; se ignora */ }
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

  // ── Plantilla HTML del colector (Bloque 1 — Interfaz premium) ──────────────────────
  // Diseño "cristal esmerilado": borde con degradado de luz (1px), fondo translúcido
  // con backdrop-blur, visor con halo índigo + retículo de puntería, tipografía
  // corporativa, input con sombra interior y botón 3D metálico.
  function template() {
    return `
      <!-- Contenedor con borde-degradado (light gradient) que refracta en oscuro -->
      <div id="fullstock-camera-stream"
           class="fs-scanner group relative mb-6 rounded-[1.65rem] p-px overflow-hidden
                  bg-gradient-to-br from-white/20 via-indigo-400/15 to-violet-500/10
                  shadow-[0_24px_70px_-20px_rgba(2,6,23,0.9)] transition-all duration-300">

        <!-- Resplandor ambiental superior (decorativo) -->
        <div class="pointer-events-none absolute -top-24 -right-16 w-72 h-72 rounded-full
                    bg-indigo-600/20 blur-3xl"></div>

        <!-- Panel de cristal esmerilado -->
        <div class="relative rounded-[calc(1.65rem-1px)] bg-slate-900/70 backdrop-blur-xl
                    ring-1 ring-white/5 p-6 sm:p-8">

          <!-- Cabecera -->
          <div class="flex items-start gap-4 mb-7">
            <!-- Icono personalizado: código de barras estilizado con halo -->
            <div class="relative w-12 h-12 rounded-2xl shrink-0 flex items-center justify-center
                        bg-gradient-to-br from-indigo-400 via-indigo-600 to-violet-700
                        shadow-[0_10px_28px_-6px_rgba(99,102,241,0.75)] ring-1 ring-white/15">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"
                   class="w-6 h-6 text-white drop-shadow">
                <rect x="2.5"  y="5" width="1.3" height="14" rx="0.45"/>
                <rect x="5"    y="5" width="2.5" height="14" rx="0.45"/>
                <rect x="8.7"  y="5" width="0.9" height="14" rx="0.45"/>
                <rect x="11"   y="5" width="2"   height="14" rx="0.45"/>
                <rect x="14.4" y="5" width="1.2" height="14" rx="0.45"/>
                <rect x="17"   y="5" width="2.7" height="14" rx="0.45"/>
                <rect x="20.8" y="5" width="0.8" height="14" rx="0.45"/>
              </svg>
              <span class="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/25"></span>
            </div>
            <div class="min-w-0">
              <p class="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-indigo-300/80 mb-1">
                Inventario en tiempo real
              </p>
              <h2 class="text-xl sm:text-2xl font-bold text-white leading-tight tracking-tight">
                Colector de Código de Barras
              </h2>
              <p class="text-sm text-slate-400 mt-1.5 leading-relaxed">
                Convierte la cámara trasera de tu móvil en un escáner profesional y gestiona
                existencias en tiempo récord.
              </p>
            </div>
          </div>

          <!-- Interruptor de modo -->
          <div class="flex items-center justify-between gap-4 rounded-2xl bg-slate-950/50
                      ring-1 ring-white/5 backdrop-blur-sm px-5 py-3.5 mb-7
                      shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]">
            <span id="scanner-mode-label" class="text-sm font-semibold text-emerald-400">
              Modo: Carga Rápida (+1)
            </span>
            <label class="relative inline-flex items-center cursor-pointer select-none">
              <input type="checkbox" id="scanner-mode-toggle" class="sr-only peer"/>
              <span class="w-12 h-7 bg-emerald-500/80 peer-checked:bg-indigo-500 rounded-full
                           transition-colors duration-300 block
                           shadow-[inset_0_1px_3px_rgba(0,0,0,0.45)]"></span>
              <span class="absolute left-0.5 top-0.5 w-6 h-6 bg-white rounded-full
                           shadow-[0_2px_6px_rgba(0,0,0,0.5)]
                           transition-transform duration-300 peer-checked:translate-x-5"></span>
            </label>
          </div>

          <!-- Visor de cámara con halo índigo -->
          <div class="relative">
            <!-- Halo de resplandor índigo alrededor del visor -->
            <div class="pointer-events-none absolute -inset-2 rounded-[1.9rem]
                        bg-indigo-500/20 blur-2xl opacity-80"></div>

            <!-- html5-qrcode inyecta el <video> dentro de #reader -->
            <div class="relative w-full overflow-hidden rounded-[1.4rem] bg-black
                        ring-1 ring-white/10 shadow-[0_0_45px_-10px_rgba(99,102,241,0.6)]"
                 style="aspect-ratio:4/3;max-height:60vh">
              <div id="reader" class="w-full h-full object-cover"></div>

              <!-- Retículo de puntería (target graphic) superpuesto -->
              <div class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                <div class="relative w-[72%] max-w-[300px] aspect-[5/2]">
                  <!-- Esquinas del retículo -->
                  <span class="absolute -top-px -left-px  w-8 h-8 border-t-2 border-l-2 border-indigo-300/90 rounded-tl-2xl"></span>
                  <span class="absolute -top-px -right-px w-8 h-8 border-t-2 border-r-2 border-indigo-300/90 rounded-tr-2xl"></span>
                  <span class="absolute -bottom-px -left-px  w-8 h-8 border-b-2 border-l-2 border-indigo-300/90 rounded-bl-2xl"></span>
                  <span class="absolute -bottom-px -right-px w-8 h-8 border-b-2 border-r-2 border-indigo-300/90 rounded-br-2xl"></span>
                  <!-- Láser de puntería fino (se desvanece en los extremos) -->
                  <div class="fs-laser absolute inset-x-4 h-px
                              bg-gradient-to-r from-transparent via-red-500 to-transparent
                              shadow-[0_0_10px_1px_rgba(239,68,68,0.75)]"></div>
                </div>
              </div>

              <!-- Viñeta sutil para dar profundidad al borde del visor -->
              <div class="pointer-events-none absolute inset-0 z-10 rounded-[1.4rem]
                          shadow-[inset_0_0_60px_rgba(0,0,0,0.55)]"></div>
            </div>
          </div>

          <!-- Estado -->
          <p id="scanner-status" class="mt-4 text-center text-sm text-slate-400">
            Iniciando cámara…
          </p>

          <!-- Resultado de la última lectura -->
          <div id="scanner-result" class="hidden"></div>

          <!-- Entrada manual (fallback) -->
          <div class="mt-7 pt-6 border-t border-white/5">
            <label class="block text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-slate-400 mb-2.5"
                   for="scanner-manual-input">
              Entrada manual de código
            </label>
            <div class="flex gap-3">
              <input id="scanner-manual-input" type="text" inputmode="numeric"
                     class="fs-input" placeholder="Escribe o escanea con lector USB…"
                     autocomplete="off"/>
              <button id="scanner-manual-btn" class="fs-btn-3d shrink-0" type="button">
                Procesar
              </button>
            </div>
            <p class="text-xs text-slate-500 mt-3">
              Útil si tu navegador no permite la cámara o usas un lector externo.
            </p>
          </div>
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
      // ── Tipografía corporativa (stack profesional, CSP-safe sin fuentes externas) ──
      ".fs-scanner{font-family:'Inter','Segoe UI Variable Text','Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}",
      '.fs-scanner h2{font-feature-settings:"ss01","cv01";}',

      // ── Láser de puntería: recorre verticalmente el retículo ──────────────────────
      '@keyframes fsLaser{0%{top:14%;opacity:.55}50%{top:84%;opacity:1}100%{top:14%;opacity:.55}}',
      '.fs-laser{animation:fsLaser 2.4s cubic-bezier(.45,0,.55,1) infinite;}',

      // ── Input manual: profundidad con sombra interior + foco pulido ──────────────
      '.fs-input{width:100%;background:#0b1220;border:1px solid #1e293b;border-radius:.85rem;color:#f1f5f9;padding:.7rem 1rem;font-size:.9rem;line-height:1.4;outline:none;box-shadow:inset 0 2px 6px rgba(0,0,0,.55),inset 0 0 0 1px rgba(255,255,255,.02);transition:border-color .18s,box-shadow .2s,background .2s;}',
      '.fs-input::placeholder{color:#475569;}',
      '.fs-input:focus{border-color:#6366f1;background:#0d1526;box-shadow:inset 0 2px 6px rgba(0,0,0,.5),0 0 0 4px rgba(99,102,241,.18),0 0 20px -2px rgba(99,102,241,.45);}',

      // ── Botón "Procesar": 3D metálico pulido + resplandor índigo ─────────────────
      ".fs-btn-3d{position:relative;border:none;border-radius:.85rem;padding:.7rem 1.6rem;font-weight:600;font-size:.9rem;letter-spacing:.01em;color:#fff;cursor:pointer;white-space:nowrap;background:linear-gradient(180deg,#818cf8 0%,#6366f1 46%,#4f46e5 100%);box-shadow:0 1px 0 rgba(255,255,255,.35) inset,0 -2px 6px rgba(49,46,129,.6) inset,0 6px 16px -4px rgba(79,70,229,.7),0 0 22px -4px rgba(99,102,241,.55);transition:transform .12s ease,box-shadow .2s ease,filter .2s ease;}",
      ".fs-btn-3d::before{content:'';position:absolute;left:1px;right:1px;top:1px;height:48%;border-radius:.8rem .8rem 40% 40%/.8rem .8rem 100% 100%;background:linear-gradient(180deg,rgba(255,255,255,.32),rgba(255,255,255,0));pointer-events:none;}",
      '.fs-btn-3d:hover{filter:brightness(1.08);box-shadow:0 1px 0 rgba(255,255,255,.4) inset,0 -2px 6px rgba(49,46,129,.6) inset,0 9px 22px -4px rgba(79,70,229,.85),0 0 32px -2px rgba(99,102,241,.7);}',
      '.fs-btn-3d:active{transform:translateY(2px);box-shadow:0 1px 2px rgba(0,0,0,.4) inset,0 2px 8px -2px rgba(79,70,229,.6);}',
      '.fs-btn-3d:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(99,102,241,.45),0 6px 16px -4px rgba(79,70,229,.7);}',

      // ── Contenedor que crea la librería html5-qrcode ─────────────────────────────
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
