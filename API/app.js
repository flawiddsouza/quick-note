import 'dotenv/config'
import { createServer } from './server.js'
import { shutdown } from './sync.js'
import { logger } from './logger.js'

const server = createServer()

server.listen(6943, () => {
    logger.log('HTTP API at http://localhost:6943\nWebSocket Server at ws://localhost:6943\n')
})

for(const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
        shutdown()
        process.exit(0)
    })
}
