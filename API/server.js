import { createServer as createHttpServer } from 'http'
import express from 'express'
import cors from 'cors'
import routes from './routes.js'
import { validateToken } from './db.js'
import { handleUpgrade } from './sync.js'

// the HTTP API and the websocket on one server; app.js listens with it, the tests take one of their own
export function createServer() {
    const app = express()

    // a first pull after login or an import can carry a whole library in one request
    app.use(express.json({ limit: '100mb' }))
    app.use(cors())
    app.use('/', routes)

    const server = createHttpServer(app)

    server.on('upgrade', (req, socket, head) => {
        const { pathname, searchParams } = new URL(req.url, 'http://localhost')

        if(pathname !== '/') {
            socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
            socket.destroy()
            return
        }

        let userId

        try {
            userId = validateToken(searchParams.get('token')).userId
        } catch(e) {
            if(e.name === 'TokenExpiredError') {
                console.error('WebSocket: Given token has expired')
            } else {
                console.error(`WebSocket: ${e.message}`)
            }
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
            socket.destroy()
            return
        }

        handleUpgrade(userId, req, socket, head)
    })

    return server
}
