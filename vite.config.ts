import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Spotify rejects "localhost" redirect URIs, so dev runs on the loopback IP.
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true },
});
