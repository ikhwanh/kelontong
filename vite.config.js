import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  // GitHub Pages serves the app from /<repo>/, set by the deploy workflow.
  base: process.env.BASE_PATH || '/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    vue(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'prompt',
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,wasm,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
      },
      manifest: {
        name: 'POS',
        short_name: 'POS',
        description: 'Offline point of sale for one shop, cash only.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'any',
        background_color: '#F4F5F2',
        theme_color: '#0F6B5F',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        share_target: {
          action: 'share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { files: [{ name: 'file', accept: ['text/plain', '.txt'] }] },
        },
      },
    }),
  ],
  // Not Vite's default 5173/4173: a PWA's service worker and storage belong to the
  // origin, so sharing a port with another project's PWA serves that app instead.
  server: { port: 5180, strictPort: true },
  preview: { port: 4180, strictPort: true },
  optimizeDeps: {
    exclude: ['@vlcn.io/crsqlite-wasm', 'zxing-wasm'],
  },
  build: {
    target: 'es2022',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
