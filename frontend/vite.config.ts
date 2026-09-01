import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    open: true,
    /**
     * Proxy API requests to the backend during development.
     *
     * MOCK MODE (default, VITE_USE_MOCK_DEALS=true):
     *   The frontend runs standalone with no backend. Set VITE_USE_MOCK_DEALS=false
     *   in frontend/.env to switch to real-backend mode.
     *
     * REAL-BACKEND MODE (VITE_USE_MOCK_DEALS=false):
     *   Requests to /api/* are proxied to the backend server.
     *   The backend handles authentication via the X-Mock-User header
     *   (from the persona switcher) or real JWT credentials.
     *
     * Production: build the frontend and serve it from the backend,
     * or deploy behind a reverse proxy that handles routing.
     */
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // The backend CORS is configured to allow localhost:3001 as an origin.
        // If you deploy the frontend elsewhere, update backend/.env CORS_ORIGIN.
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
