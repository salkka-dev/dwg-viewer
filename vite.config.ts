import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const modulePath = (p: string) =>
  fileURLToPath(new URL(`./node_modules/${p}`, import.meta.url)).replace(/\\/g, '/')

export default defineConfig({
  // Relative base so the same build works on GitHub Pages (/repo/) or any host.
  base: './',
  resolve: {
    alias: [
      // Use the ESM `lib` build of pdf-renderer everywhere so its internals
      // (root collection, renderer) can be shared with our page splitter.
      {
        find: /^@mlightcad\/pdf-renderer$/,
        replacement: modulePath('@mlightcad/pdf-renderer/lib/index.js')
      },
      {
        find: /^pdf-renderer-lib\/(.*)$/,
        replacement: `${modulePath('@mlightcad/pdf-renderer/lib')}/$1`
      },
      // Glyph provider lives in cad-pdf-plugin but is not re-exported; the
      // package root would also drag in pdf.js for PDF import, which we skip.
      {
        find: /^cad-pdf-plugin-lib\/(.*)$/,
        replacement: `${modulePath('@mlightcad/cad-pdf-plugin/lib')}/$1`
      }
    ]
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 6000
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        id: './',
        name: '도면 뷰어',
        short_name: '도면뷰어',
        description: 'DWG 도면 보기와 페이지별 PDF 변환. 광고 없음, 파일은 기기 밖으로 나가지 않음.',
        lang: 'ko',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0e1016',
        theme_color: '#0e1016',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: [
          '**/*.{js,css,html,wasm,png,svg,ico,woff,woff2,ttf,shx,json,dxf,webmanifest}'
        ],
        // libredwg-web.wasm is ~11 MB.
        maximumFileSizeToCacheInBytes: 24 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true
      }
    })
  ]
})
