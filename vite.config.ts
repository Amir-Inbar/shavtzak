import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps every path relative, so the build works under https://<user>.github.io/<repo>/
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2020', sourcemap: false },
});
