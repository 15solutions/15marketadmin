import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { VitePWA } from 'vite-plugin-pwa';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
export default defineConfig({
  optimizeDeps: {
    exclude: ['html-to-image'],
  },
  plugins: [
    react(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB
        // index.html is deliberately excluded. Precaching it makes the service
        // worker serve a stale document shell after a redeploy, so the browser
        // requests hashed chunk names that no longer exist and every component
        // fails to load. Navigations must always hit the network.
        globPatterns: ['**/*.{js,css,ico,png,svg,ttf,woff2,json}'],
      },
      manifest: {
        name: '15Market Systems',
        short_name: '15Market',
        theme_color: '#050505',
        background_color: '#050505',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'logo.png',
            sizes: '192x192',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    host: true,
    allowedHosts: [
      "revenues-margin-authorities-booth.trycloudflare.com",
      ".trycloudflare.com",
      ".preview.studio.arc.io"
    ],
    proxy: {
      '/api-binance': {
        target: 'https://api.binance.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api-binance/, '')
      },
      '/api-mexc': {
        target: 'https://api.mexc.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api-mexc/, '')
      },
      '/arc-api': {
        target: 'http://127.0.0.1:3010',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/arc-api/, '')
      }
    }
  }
});
