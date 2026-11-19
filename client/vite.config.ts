import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // In development, /api goes to the local Node server
    proxy: { '/api': 'http://localhost:4000' },
  },
});
