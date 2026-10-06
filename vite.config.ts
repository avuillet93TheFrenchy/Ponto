import { sentryVitePlugin } from '@sentry/vite-plugin';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig, normalizePath, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const host = process.env.TAURI_DEV_HOST;
const isDev = process.env.TAURI_ENV_DEBUG === 'true';
const isAndroid = process.env.TAURI_ENV_PLATFORM === 'android' || process.env.ANDROID === 'true';
const isProductionBuild = process.env.NODE_ENV === 'production';
// Same value for the app (`release` in src/instrument.js) and the Sentry source map upload.
const appVersion = process.env.npm_package_version;

const srcDir = normalizePath(fileURLToPath(new URL('./src', import.meta.url)));
const tauriDir = normalizePath(fileURLToPath(new URL('./src/tauri', import.meta.url)));
const jsDir = normalizePath(fileURLToPath(new URL('./src/js', import.meta.url)));

// Web build only: the Cloudflare files (`_headers`, `.assetsignore`) and the PWA icons live in
// `public-web/`, outside `public/`, so the Tauri build (.exe, .apk) does not ship them. They are
// emitted at the root of `dist/`, and the iOS home-screen icon link is injected the same way.
const webPublicDir = fileURLToPath(new URL('./public-web', import.meta.url));
const webPublicPlugin = (): Plugin => ({
  name: 'ponto-web-public',
  generateBundle() {
    for (const fileName of readdirSync(webPublicDir)) {
      this.emitFile({ type: 'asset', fileName, source: readFileSync(join(webPublicDir, fileName)) });
    }
  },
  transformIndexHtml: () => [
    { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }, injectTo: 'head' },
  ],
});

// Web (PWA) build only: `vite build --mode web`. The Tauri build never ships a service worker.
// Colors come from src/style.scss: --bg (light) and --accent (light).
const pwaPlugin = () => VitePWA({
  injectRegister: false,
  registerType: 'prompt',
  manifest: {
    name: 'Ponto',
    short_name: 'Ponto',
    description: 'Traduction FR/EN avec DeepL et Lara',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    lang: 'fr',
    theme_color: '#2451D6',
    background_color: '#F4F3EF',
    icons: [
      { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [/^\/api\//],
    skipWaiting: false,
    clientsClaim: false,
  },
});

export default defineConfig(({ mode }) => ({
  clearScreen: false,
  publicDir: 'public',

  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host ? {
      protocol: 'ws', host, port: 1421,
    }
      : undefined,
    watch: {
      usePolling: isAndroid,
      ignored: [
        '**/src-tauri/**',
        '**/node_modules/**',
        '**/.git/**',
        '**/gen/**',
      ],
    },
  },

  envPrefix: ['VITE_', 'TAURI_ENV_*'],

  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
  },

  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    copyPublicDir: true,

    target: ['edge100', 'chrome100', 'firefox100'],
    cssTarget: ['edge100', 'chrome100', 'firefox100'],

    sourcemap: 'hidden',

    modulePreload: {
      polyfill: false,
    },

    minify: isDev ? false : 'terser',

    terserOptions: {
      compress: {
        drop_console: isDev ? false : ['log'],
        drop_debugger: true,
        passes: 2,
      },
      mangle: {
        toplevel: true,
      },
      format: {
        comments: false,
      },
    },

    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
      },

      output: {
        codeSplitting: {
          groups: [
            { test: /@tauri-apps/, name: 'tauri' },
            { test: /node_modules/, name: 'vendor' },
          ],
        },

        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',

        assetFileNames: ({ name }: { name?: string }) => {
          if (!name) return 'assets/[name]-[hash][extname]';

          if (name.endsWith('.css')) {
            return 'assets/css/[name]-[hash][extname]';
          }

          return 'assets/[name]-[hash][extname]';
        },
      },
    },

    chunkSizeWarningLimit: 800,

    cssCodeSplit: false,

    assetsInlineLimit: 2048,
  },

  preview: {
    port: 4173,
    host: 'localhost',
    strictPort: true,
    cors: true,
  },

  resolve: {
    alias: [
      { find: /^@tauri$/, replacement: `${tauriDir}/index.js` },
      { find: /^@tauri\/(.+)$/, replacement: `${tauriDir}/$1` },
      { find: /^@js\/(.+)$/, replacement: `${jsDir}/$1` },
      { find: /^@\/(.+)$/, replacement: `${srcDir}/$1` },
    ],
  },

  css: {
    devSourcemap: !isProductionBuild,
  },

  plugins: [...(isProductionBuild
    ? [
      sentryVitePlugin({
        org: 'alexandre69coder',
        project: 'javascript',
        release: { name: appVersion },
      }),
    ]
    : []), ...(process.env.ANALYZE === 'true'
    ? [
      visualizer({
        filename: 'stats.html',
        open: true,
        gzipSize: true,
        brotliSize: true,
      }),
    ]
    : []), ...(mode === 'web' ? [webPublicPlugin(), pwaPlugin()] : []),
  ],
}));
