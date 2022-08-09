import 'dotenv/config'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import express from 'express'
import { parse } from 'url'
import routes from './routes.js'
import { validateToken } from './db.js'
import cors from 'cors'

const app = express()

app.use(express.json())
app.use(cors())

app.use('/', routes)

const server = createServer(app)

const wss = new WebSocketServer({
    noServer: true
})

wss.on('connection', (ws, decodedToken) => {
    console.log(decodedToken)
    ws.on('message', data => {
        console.log('client message received', data)
    })
})

server.on('upgrade', (req, socket, head) => {
    const { pathname, query } = parse(req.url)
    const queryParams = new URLSearchParams(query)

    if(pathname === '/') {
        try {
            const decodedToken = validateToken(queryParams.get('token'))

            wss.handleUpgrade(req, socket, head, ws => {
                wss.emit('connection', ws, decodedToken)
            })
        } catch(e) {
            if(e.name === 'TokenExpiredError') {
                console.error('WebSocket: Given token has expired')
            } else {
                console.error(`WebSocket: ${e.message}`)
            }
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy()
        }
    } else {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy()
    }
})

server.listen(6943, () => {
    console.log('HTTP API at http://localhost:6943\nWebSocket Server at ws://localhost:6943\n')
})
