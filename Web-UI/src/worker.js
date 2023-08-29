import * as Automerge from 'automerge'

function generateSyncMessage(data) {
    const [updatedAutomergeSyncState, syncMessage] = Automerge.generateSyncMessage(
        Automerge.load(data.automergeDoc),
        data.automergeSyncState
    )

    return {
        name: 'generateSyncMessage',
        data: {
            updatedAutomergeSyncState,
            syncMessage
        }
    }
}

function receiveSync(data) {
    const [updatedAutomergeDoc, updatedAutomergeSyncState] = Automerge.receiveSyncMessage(
        Automerge.load(data.automergeDoc),
        data.automergeSyncState,
        data.payload
    )

    return {
        name: 'receiveSyncComplete',
        data: {
            updatedAutomergeSyncState,
            updatedAutomergeDoc: Automerge.save(updatedAutomergeDoc)
        }
    }
}

self.addEventListener('message', (event) => {
    const eventData = event.data
    if(eventData.name === 'generateSyncMessage') {
        const result = generateSyncMessage(eventData.data)
        self.postMessage(result)
    }

    if(eventData.name === 'receiveSync') {
        const result = receiveSync(eventData.data)
        self.postMessage(result)
    }
})
