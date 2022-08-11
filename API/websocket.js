import Automerge from 'automerge'
import {
    getAutomergeDocForUser,
    saveAutomergeDocForUse,
    getAutomergeSyncStateForClient,
    saveAutomergeSyncStateForClient
} from './db.js'
import { serialize, deserialize } from 'bson'

async function createSync(userId, ws) {
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
        console.log('sent', send)
    } else {
        console.log('nothing to sync')
    }

    await saveAutomergeSyncStateForClient(userId, ws.clientId, updatedAutomergeSyncState)
}

export async function websocketConnectionHandler(ws, decodedToken) {
    const userId = decodedToken.userId

    ws.on('message', async(data) => {
        try {
            const { eventName, payload } = deserialize(data, { promoteBuffers: true })

            console.log('received', { eventName, payload })

            if(eventName === 'clientId') {
                ws.clientId = payload

                await createSync(userId, ws)
            }

            if(eventName === 'syncMessage') {
                const [updatedAutomergeDoc, updatedAutomergeSyncState] = Automerge.receiveSyncMessage(
                    await getAutomergeDocForUser(userId),
                    await getAutomergeSyncStateForClient(userId, ws.clientId),
                    payload
                )

                await saveAutomergeDocForUse(userId, updatedAutomergeDoc)
                await saveAutomergeSyncStateForClient(userId, ws.clientId, updatedAutomergeSyncState)

                await createSync(userId, ws)
            }
        } catch(e) {
            console.error('WebSocket: Invalid client message received', e.message, e.stack)
        }
    })
}
