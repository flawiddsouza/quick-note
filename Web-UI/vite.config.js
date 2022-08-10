import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        vue(),
        VitePWA({
            includeAssets: [
                'favicon.png',
                'favicon.ico',
                'apple-touch-icon.png',
                'fonts/*.woff',
                'fonts/*.woff2',
                'icons/*.png',
                'icons/*.svg',
            ],
            manifest: {
                name: 'Quick Note',
                short_name: 'Quick Note',
                description: 'Offline first tiny note taking app with cross device sync',
                theme_color: '#ffffff',
                icons: [
                    {
                        src: 'pwa-192x192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: 'pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png'
                    },
                    {
                        src: 'pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any maskable'
                    }
                ]
            }
        })
    ],
    envPrefix: 'QUICK_NOTE_'
})
