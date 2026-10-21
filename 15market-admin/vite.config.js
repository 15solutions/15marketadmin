import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
    plugins: [
        react(),
        nodePolyfills({
            globals: {
                Buffer: true,
                global: true,
                process: true,
            },
            protocolImports: true,
        }),
    ],
    resolve: {
        dedupe: ['react', 'react-dom', '@tanstack/react-query'],
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    optimizeDeps: {
        exclude: []
    },
    build: {
        // Raise the chunk-size warning threshold — admin is a dashboard, not a user-facing app
        chunkSizeWarningLimit: 1000,
        rollupOptions: {
            output: {
                manualChunks: {
                    'react-vendor': ['react', 'react-dom', 'react-is'],
                    'wagmi-vendor': ['wagmi', 'viem', '@wagmi/core', '@reown/appkit', '@reown/appkit-adapter-wagmi'],
                    'charts': ['recharts', 'lightweight-charts'],
                    'motion': ['framer-motion'],
                    'ui': ['lucide-react', 'clsx', 'tailwind-merge', '@radix-ui/react-label', '@radix-ui/react-scroll-area', '@radix-ui/react-select', '@radix-ui/react-slot', '@radix-ui/react-tabs'],
                }
            }
        }
    },
    server: {
        port: 3001,
        host: true,
        proxy: {
            '/api-mexc': {
                target: 'https://api.mexc.com',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api-mexc/, '')
            }
        }
    }
});
