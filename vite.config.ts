import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 2500,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 40 },
              { name: 'vendor-charts', test: /node_modules[\\/](recharts|d3-|victory-vendor)[\\/]/, priority: 30 },
              { name: 'vendor-supabase', test: /node_modules[\\/]@supabase[\\/]/, priority: 25 },
              { name: 'vendor-firebase', test: /node_modules[\\/]firebase[\\/]/, priority: 25 },
              { name: 'vendor-ui', test: /node_modules[\\/](lucide-react|motion|framer-motion)[\\/]/, priority: 20 },
              { name: 'vendor-deps', test: /node_modules[\\/]/, priority: 10 },
            ],
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
