import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// During development (npm run dev:web) the LAN OS server runs on its own port and Vite forwards to it.
const server = 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': server,
      '/join': server,
      '/auth': server,
      '/theme.css': server,
      '/ws': { target: server, ws: true },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
