import { defineConfig, type Plugin } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import manifest from './manifest.json';

/**
 * Copies runtime-fetched i18n catalogs to dist/.
 * Static HTML/vendor files now live in public/ and are copied by Vite.
 */
function copyI18nCatalogs(): Plugin {
  return {
    name: 'copy-i18n-catalogs',
    writeBundle() {
      const outDir = resolve(__dirname, 'dist');
      const outI18nDir = resolve(outDir, 'i18n');
      if (!existsSync(outI18nDir)) {
        mkdirSync(outI18nDir, { recursive: true });
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
  plugins: [crx({ manifest }), react(), tailwindcss(), copyI18nCatalogs()],
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
