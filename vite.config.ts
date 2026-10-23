import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { defineConfig, normalizePath } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const require = createRequire(import.meta.url)
const pdfjsDirectory = dirname(require.resolve('pdfjs-dist/package.json'))

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: ['cmaps', 'standard_fonts', 'wasm'].map(directory => ({
        src: normalizePath(resolve(pdfjsDirectory, directory, '*')),
        dest: `pdfjs/${directory}`,
        rename: { stripBase: true },
      })),
    }),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'pwa-192.png', 'pwa-512.png', 'pwa-maskable-512.png'],
      manifest: {
        id: './',
        name: 'PDFy Studio',
        short_name: 'PDFy',
        description: 'View, edit and organize PDFs locally on your device.',
        start_url: './',
        scope: './',
        display: 'standalone',
        theme_color: '#0B0F17',
        background_color: '#0B0F17',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Cache application assets only. Documents stay in memory, never in CacheStorage.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,webmanifest,bcmap,pfb,ttf,wasm}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/(?:^|\/)pdfjs\//, /\.pdf(?:$|\?)/i],
        cleanupOutdatedCaches: true,
        skipWaiting: false,
        clientsClaim: false,
        runtimeCaching: [],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 3000,
    host: '0.0.0.0',
    hmr: false,
  },
})

