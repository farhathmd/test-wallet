import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Vite + Vitest configuration.
 *
 * `vitest/config` is used instead of `vite` so the `test` block below is typed. The dashboard talks to
 * the API through VITE_API_URL (see .env.example), which means the same build works locally, in
 * Docker and on a static host with no code change.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Fail loudly instead of silently moving to another port, which would break the API's CORS origin.
    strictPort: true,
  },
  preview: { port: 4173 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    // Chart.js draws to a real canvas; component tests mock react-chartjs-2 (see src/tests).
    clearMocks: true,
    restoreMocks: true,
  },
});
