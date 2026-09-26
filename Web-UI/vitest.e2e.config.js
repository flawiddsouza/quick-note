import { defineConfig } from 'vitest/config'
import baseConfig from './vitest.config.js'

// End-to-end tests: the app's sync module against the real API in Docker (npm run test:e2e)
export default defineConfig({
    ...baseConfig,
    test: {
        ...baseConfig.test,
        include: ['test/e2e/**/*.test.js'],
        exclude: ['node_modules/**'],
        globalSetup: ['./test/e2e/setup.js'],
        testTimeout: 30000,
        hookTimeout: 120000
    }
})
