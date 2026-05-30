import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  base: '/',
  // The Planes scene (visualizations/planes) references __ASSET_VERSION__ in its
  // asset-url helper for cache-busting; define it here so the root build resolves it.
  define: {
    __ASSET_VERSION__: JSON.stringify(Date.now().toString()),
  },
  server: {
    // Planes' live-flight layer calls /opensky-api in dev; proxy it to OpenSky to
    // avoid CORS. In production opensky.js hits opensky-network.org/api directly.
    proxy: {
      '/opensky-api': {
        target: 'https://opensky-network.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/opensky-api/, '/api'),
      },
    },
  },
  // Pre-bundle the heavier geospatial deps so dev startup for the Planes scene is stable.
  optimizeDeps: {
    include: [
      '@takram/three-atmosphere',
      '@takram/three-clouds',
      '3d-tiles-renderer',
    ],
  },
  resolve: {
    // The root app imports visualization source directly from submodules that
    // also have their own node_modules trees. Dedupe shared runtime packages so
    // scene switches don't mix separate React/Three instances at runtime.
    dedupe: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'scheduler',
      'three',
      '@react-three/fiber',
      '@react-three/drei',
      '@react-three/postprocessing',
      'postprocessing',
      'lil-gui',
      'troika-three-text',
    ],
  },
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) {
            return 'react-vendor';
          }

          if (id.includes('node_modules/@react-three')) {
            return 'r3f-vendor';
          }

          if (id.includes('node_modules/three/addons')) {
            return 'three-addons';
          }

          if (id.includes('node_modules/three')) {
            return 'three-core';
          }

          if (id.includes('node_modules/troika-three-text')) {
            return 'troika-text';
          }

          if (id.includes('/src/monolith/')) {
            return 'monolith-runtime';
          }
        },
      },
    },
  },
}));
