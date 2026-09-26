// Starts the API and its database in Docker for the end-to-end tests and stops them after.
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const composeFile = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docker-compose.test.yml')
const compose = (...args) => execFileSync('docker', ['compose', '-f', composeFile, ...args], { stdio: 'inherit' })

export default function({ provide }) {
    compose('up', '--build', '--wait', '--quiet-pull')
    provide('apiUrl', 'http://localhost:16943')
    provide('websocketUrl', 'ws://localhost:16943')

    return () => compose('down', '--volumes')
}
