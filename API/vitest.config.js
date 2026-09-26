import { defineConfig } from 'vitest/config'

// The tests need a Postgres database, pointed at by the usual PG* environment variables,
// with the migrations applied (npx ley up). They create their own users and remove them.
export default defineConfig({
    test: {
        environment: 'node',
        fileParallelism: false
    }
})
