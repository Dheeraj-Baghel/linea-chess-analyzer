import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { chessComResolver } from './server/chesscom-resolver';
import { lineaOfflineBuild } from './scripts/offline-build.mjs';

export default defineConfig({
  plugins: [react(), chessComResolver(), lineaOfflineBuild()],
  server: { host: '127.0.0.1', port: 4325, strictPort: true },
});
