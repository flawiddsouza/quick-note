import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        environment: 'node',
        setupFiles: ['./test/setup.js'],
        // the end-to-end tests need Docker, see vitest.e2e.config.js
        exclude: ['test/e2e/**', 'node_modules/**']
    }
})
