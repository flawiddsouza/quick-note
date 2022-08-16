import Automerge from 'automerge'
import {
    getAutomergeDocForUser,
    saveAutomergeDocForUser,
    getAutomergeSyncStateForClient,
    saveAutomergeSyncStateForClient,
    resetAutomergeSyncStateForClient
} from './db.js'
import { serialize, deserialize } from 'bson'
import { logger } from './logger.js'
import { randomUUID } from 'crypto'

let clients = {}
let clientSyncTracker = {}

async function createSync(userId, ws) {
    if(userId in clientSyncTracker === false) {
        clientSyncTracker[userId] = {}
    }

    if(ws.clientId in clientSyncTracker[userId] === false) {
        clientSyncTracker[userId][ws.clientId] = []
    }

    const [updatedAutomergeSyncState, syncMessage] = Automerge.generateSyncMessage(
        await getAutomergeDocForUser(userId),
        await getAutomergeSyncStateForClient(userId, ws.clientId)
    )

    if(syncMessage !== null) {
        const send = {
            eventName: 'syncMessage',
            payload: syncMessage
        }
        ws.send(serialize(send))
        clientSyncTracker[userId][ws.clientId].push(send)
        logger.log({ userId, clientId: ws.clientId, wsId: ws.id }, 'sent', send)
    } else {
        logger.log({ userId, clientId: ws.clientId, wsId: ws.id }, 'nothing to sync')
    }

    await saveAutomergeSyncStateForClient(userId, ws.clientId, updatedAutomergeSyncState)
}

export async function websocketConnectionHandler(ws, decodedToken) {
    ws.id = randomUUID()
    const userId = decodedToken.userId

    logger.log({ userId, wsId: ws.id }, 'client connected')

    ws.on('message', async(data) => {
        try {
            const { eventName, payload } = deserialize(data, { promoteBuffers: true })

            logger.log({ userId, clientId: ws.clientId, wsId: ws.id }, 'received', { eventName, payload })

            if(eventName === 'clientId') {
                ws.clientId = payload

                if(userId in clients === false) {
                    clients[userId] = []
                }

                clients[userId].push(ws)

                await createSync(userId, ws)
            }

            if(eventName === 'syncMessage') {
                const [updatedAutomergeDoc, updatedAutomergeSyncState] = Automerge.receiveSyncMessage(
                    await getAutomergeDocForUser(userId),
                    await getAutomergeSyncStateForClient(userId, ws.clientId),
                    payload
                )

                await saveAutomergeDocForUser(userId, updatedAutomergeDoc)
                await saveAutomergeSyncStateForClient(userId, ws.clientId, updatedAutomergeSyncState)

                // this fixes the infinite sync loop bug - a temporary fix until I find the real problem but it will have to do
                logger.log(`clientSyncTracker[${userId}][${ws.clientId}].length`, clientSyncTracker[userId][ws.clientId].length)
                if(clientSyncTracker[userId][ws.clientId].length >= 3) {
                    logger.log({ userId, clientId: ws.clientId, wsId: ws.id }, clientSyncTracker[userId][ws.clientId])
                    if(JSON.stringify(clientSyncTracker[userId][ws.clientId][0]) === JSON.stringify(clientSyncTracker[userId][ws.clientId][2])) {
                        logger.log({ userId, clientId: ws.clientId, wsId: ws.id }, 'duplicate sync detected for client')
                        await resetAutomergeSyncStateForClient(userId, ws.clientId)
                    } else {
                        logger.log({ userId, clientId: ws.clientId, wsId: ws.id }, 'duplicate sync not detected')
                    }
                    clientSyncTracker[userId][ws.clientId] = []
                }

                await createSync(userId, ws)

                const otherOnlineClientsOfUser = clients[userId].filter(client => client.clientId !== ws.clientId)
                for(const otherClientWs of otherOnlineClientsOfUser)  {
                    logger.log({ userId, clientId: otherClientWs.clientId, wsId: otherClientWs.id }, 'creating sync for other connected client')
                    createSync(userId, otherClientWs)
                }
            }
        } catch(e) {
            console.error('WebSocket: Invalid client message received', e.message, e.stack)
        }
    })

    ws.on('close', () => {
        logger.log({ userId, clientId: ws.clientId, wsId: ws.id }, 'client disconnected')
        const wsIndex = clients[userId].findIndex(wsEntry => wsEntry.id === ws.id)
        clients[userId].splice(wsIndex, 1)
    })
}
