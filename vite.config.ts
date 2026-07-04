import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Disable service worker in dev — it intercepts requests and caches
      // the JS bundle, causing code changes to not appear in the browser.
      devOptions: { enabled: false },
      // Use the static public/manifest.webmanifest — do not let the plugin
      // generate one, which avoids the dev-mode JSON syntax error.
      manifest: false,
      includeManifestIcons: false,
      // Include all tiles and icons in the service worker's precache manifest
      includeAssets: ['icons/*.svg', 'tiles/**/*.png', 'manifest.webmanifest'],
      workbox: {
        // Precache all built JS/CSS/HTML
        globPatterns: ['**/*.{js,css,html,ico,svg}'],
        // Runtime caching strategies
        runtimeCaching: [
          {
            // Offline map tiles — CacheFirst, large quota
            urlPattern: /\/tiles\/.+\.png$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'mesh-tiles',
              expiration: {
                maxEntries: 5000,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Python/Express API — NetworkFirst with offline fallback
            urlPattern: /\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'mesh-api',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 5, // 5 min
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // OSM CDN tiles (fallback when local tiles miss)
            urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: {
                maxEntries: 1000,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
