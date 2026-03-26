import { defineConfig, type Plugin } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import manifest from './manifest.json';

/**
 * Copies pre-built HTML pages and their referenced assets to dist/.
 * newtab.html and pairing.html reference pre-compiled bundle JS files
 * (no source .tsx exists for them), so they cannot go through Vite's
 * bundling pipeline. Instead we copy them as-is along with all the
 * shared asset chunks they depend on.
 */
function copyPrebuiltPages(): Plugin {
  return {
    name: 'copy-prebuilt-pages',
    writeBundle() {
      const filesToCopy = [
        // HTML pages
        'newtab.html',
        'pairing.html',
        // JS chunks referenced by newtab/pairing
        'assets/newtab-TOu5iTM4.js',
        'assets/pairing-Cx1kRNed.js',
        'assets/PairingPrompt-BbA5eUUf.js',
        // Shared chunks these pages import
        'assets/index-DiHrZgA3.js',
        'assets/index-BVS4T5_D.js',
        'assets/SchedulingFields-CMv4PHEZ.js',
        'assets/mcpServersStore-DckMFLwq.js',
        'assets/TasksTab-B7m0YvZn.js',
        'assets/SessionPool-ByzZJtWw.js',
        'assets/SavedPromptsService-Bz6yvo9U.js',
        // CSS referenced by newtab.html and pairing.html
        // Vendor files for offscreen (gif.js is UMD, loaded as classic script)
        'gif.js',
        'gif.worker.js'
      ];

      const outDir = resolve(__dirname, 'dist');
      const assetsDir = resolve(outDir, 'assets');
      const outI18nDir = resolve(outDir, 'i18n');
      if (!existsSync(assetsDir)) {
        mkdirSync(assetsDir, { recursive: true });
      }
      if (!existsSync(outI18nDir)) {
        mkdirSync(outI18nDir, { recursive: true });
      }

      for (const file of filesToCopy) {
        const src = resolve(__dirname, file);
        const dest = resolve(outDir, file);
        if (existsSync(src)) {
          copyFileSync(src, dest);
        }
      }

      // Copy i18n message catalogs used by IntlMessageLoaderProvider (loaded via fetch at runtime).
      const i18nDir = resolve(__dirname, 'i18n');
      if (existsSync(i18nDir)) {
        for (const file of readdirSync(i18nDir)) {
          if (!file.endsWith('.json')) continue;
          const src = resolve(i18nDir, file);
          const dest = resolve(outI18nDir, file);
          if (existsSync(src)) {
            copyFileSync(src, dest);
          }
        }
      }
    }
  };
}

export default defineConfig({
  plugins: [crx({ manifest }), react(), tailwindcss(), copyPrebuiltPages()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@components': resolve(__dirname, 'src/components')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // Extra HTML pages that are not listed in manifest.json
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        offscreen: resolve(__dirname, 'offscreen.html')
      },
      output: {
        entryFileNames: (chunkInfo) => {
          // Content scripts and service worker go to root level
          const noHashEntries = [
            'content-script',
            'accessibility-tree',
            'agent-visual-indicator',
            'service-worker-loader'
          ];
          if (noHashEntries.includes(chunkInfo.name)) {
            return '[name].js';
          }
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    },
    // Content scripts need to be self-contained
    target: 'chrome116',
    minify: false,
    sourcemap: true
  }
});
