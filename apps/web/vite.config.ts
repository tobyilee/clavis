import { execSync } from 'node:child_process';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In dev, the Worker runs separately under `wrangler dev` on :8787.
const worker = 'http://localhost:8787';

// The commit a build came from, shown with the version (sidebar tooltip); empty outside git.
function commit() {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

export default defineConfig({
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  define: { __APP_COMMIT__: JSON.stringify(commit()) },
  server: {
    port: 5173,
    proxy: { '/api': worker, '/mcp': worker, '/files': worker },
  },
});
