/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: './src/setupTests.ts',
    },
    server: {
        port: 5173,
        strictPort: true,
        allowedHosts: true,
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:8001',
                changeOrigin: true,
            },
        },
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: function (id) {
                    if (id.includes('node_modules/postprocessing')) {
                        return 'vendor-postprocessing';
                    }
                    if (id.includes('node_modules/three')) {
                        return 'vendor-three';
                    }
                    if (id.includes('node_modules/ogl')) {
                        return 'vendor-ogl';
                    }
                    if (id.includes('node_modules/motion')) {
                        return 'vendor-motion';
                    }
                    if (id.includes('node_modules/simplex-noise')) {
                        return 'vendor-noise';
                    }
                },
            },
        },
    },
});
