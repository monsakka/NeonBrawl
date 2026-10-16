import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Rapier ships its WASM inlined as base64 inside the JS bundle (~3 MB).
    chunkSizeWarningLimit: 6000,
  },
});
