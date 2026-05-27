/**
 * tailwind-config.js — Configuración de Tailwind CSS CDN.
 *
 * Extraído de index.html para eliminar el bloque <script> inline y
 * poder retirar 'unsafe-inline' de la directiva script-src del CSP.
 *
 * ORDEN DE CARGA en index.html y tienda.html:
 *   1. <script src="https://cdn.tailwindcss.com">   — CDN inicializa el motor
 *   2. <script src="/js/tailwind-config.js">         — este archivo aplica la config
 *
 * El CDN de Tailwind detecta la asignación a `tailwind.config` y re-procesa
 * los estilos automáticamente.
 */

tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        slate: {
          950: '#0a0f1e',
        }
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0', transform: 'translateY(-4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        }
      }
    }
  }
};
