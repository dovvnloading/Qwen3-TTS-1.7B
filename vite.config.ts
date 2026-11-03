import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    // No runtime environment needed for this local-only development server.
    return {
      server: {
        port: 3000,
        host: '127.0.0.1',
        // --- PROXY CONFIGURATION ---
        // This redirects /api calls on port 3000 to port 8000 during development
        proxy: {
          '/api': {
            target: 'http://127.0.0.1:8000',
            changeOrigin: true,
            secure: false,
          }
        }
      },
      plugins: [react(), tailwindcss()],
      // Build straight into the folder the FastAPI backend serves, so
      // `npm run build` needs no manual copy step afterwards.
      build: {
        outDir: 'Local-TTS/Local-TTS/dist',
        emptyOutDir: true,
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});