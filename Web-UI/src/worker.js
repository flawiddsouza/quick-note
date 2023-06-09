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

self.addEventListener('message', (event) => {
    const eventData = event.data
    if(eventData.name === 'generateSyncMessage') {
        const result = generateSyncMessage(eventData.data)
        self.postMessage(result)
    }
})
