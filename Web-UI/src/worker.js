// The worker is the only place that holds the automerge document and sync state.
// Every operation (local edits, incoming sync messages, generating sync messages) is applied
// here, one after the other, on the live document. The main thread only ever sees plain
// JSON copies of the notes and categories.
//
// Earlier versions kept the document on the main thread and sent a snapshot of it to the worker
// for each sync operation. If a note was saved while the worker was still busy, the worker's
// result (computed from the old snapshot) replaced the document and the note was lost.
import * as Automerge from 'automerge'
import { getItem, setItem, deleteItem } from './db'

let automergeDoc = null
let automergeSyncState = null
let online = false

function initialDoc() {
    const schema = Automerge.change(Automerge.init({ actorId: '0000' }), { time: 0 }, doc => {
        doc.categories = []
        doc.notes = []
    })

    const initChange = Automerge.getLastLocalChange(schema)

    const [ initDoc ] = Automerge.applyChanges(Automerge.init(), [ initChange ])

    return initDoc
}

async function load() {
    const savedAutomergeDoc = await getItem('automergeDoc')

    automergeDoc = savedAutomergeDoc ? Automerge.load(savedAutomergeDoc) : initialDoc()

    const savedAutomergeSyncState = await getItem('automergeSyncState')

    automergeSyncState = savedAutomergeSyncState ? Automerge.Backend.decodeSyncState(savedAutomergeSyncState) : Automerge.initSyncState()
}

function postState() {
    self.postMessage({
        name: 'state',
        data: {
            categories: automergeDoc.categories ? JSON.parse(JSON.stringify(automergeDoc.categories)) : [],
            notes: automergeDoc.notes ? JSON.parse(JSON.stringify(automergeDoc.notes)) : []
        }
    })
}

function saveAutomergeDoc(updatedAutomergeDoc) {
    automergeDoc = updatedAutomergeDoc
    setItem('automergeDoc', Automerge.save(automergeDoc))
}

function saveAutomergeSyncState(updatedAutomergeSyncState) {
    automergeSyncState = updatedAutomergeSyncState
    setItem('automergeSyncState', Automerge.Backend.encodeSyncState(automergeSyncState))
}

function createSync() {
    if(!online) {
        return
    }

    const [updatedAutomergeSyncState, syncMessage] = Automerge.generateSyncMessage(automergeDoc, automergeSyncState)

    saveAutomergeSyncState(updatedAutomergeSyncState)

    if(syncMessage !== null) {
        self.postMessage({ name: 'send', data: syncMessage })
    } else {
        console.log('nothing to sync')
    }
}

function change(callback) {
    saveAutomergeDoc(Automerge.change(automergeDoc, callback))
    createSync()
}

const handlers = {
    async init() {
        await load()
        postState()
    },
    // websocket opened or closed
    online(isOnline) {
        online = isOnline
        if(online) {
            // forget what was sent over the previous connection so the peers start with a
            // fresh exchange of heads, like they do after a page reload
            automergeSyncState = Automerge.Backend.decodeSyncState(Automerge.Backend.encodeSyncState(automergeSyncState))
            createSync()
        }
    },
    receiveSync(payload) {
        const [updatedAutomergeDoc, updatedAutomergeSyncState] = Automerge.receiveSyncMessage(automergeDoc, automergeSyncState, payload)
        saveAutomergeDoc(updatedAutomergeDoc)
        saveAutomergeSyncState(updatedAutomergeSyncState)
        postState()
        createSync()
    },
    addNote(note) {
        change(doc => {
            doc.notes.push(note)
        })
    },
    updateNote(note) {
        change(doc => {
            const noteToUpdate = doc.notes.find(item => item.id === note.id)
            if(noteToUpdate) {
                noteToUpdate.title = note.title
                noteToUpdate.content = note.content
                noteToUpdate.modified = note.modified
            } else {
                // the note was deleted by a sync while it was being edited, keep the edit
                doc.notes.push(note)
            }
        })
    },
    deleteNote(id) {
        change(doc => {
            const index = doc.notes.findIndex(item => item.id === id)
            if(index !== -1) {
                doc.notes.splice(index, 1)
            }
        })
    },
    addCategory(category) {
        change(doc => {
            doc.categories.push(category)
        })
    },
    updateCategory(category) {
        change(doc => {
            const categoryToUpdate = doc.categories.find(item => item.id === category.id)
            if(categoryToUpdate) {
                categoryToUpdate.name = category.name
                categoryToUpdate.modified = category.modified
            } else {
                doc.categories.push(category)
            }
        })
    },
    deleteCategory(id) {
        change(doc => {
            const index = doc.categories.findIndex(item => item.id === id)
            if(index !== -1) {
                doc.categories.splice(index, 1)
            }
        })
    },
    resetSyncState() {
        saveAutomergeSyncState(Automerge.initSyncState())
    },
    async reset() {
        await deleteItem('automergeDoc')
        await deleteItem('automergeSyncState')
        await load()
        postState()
    }
}

// messages are handled strictly one after the other, even the async ones
let queue = Promise.resolve()

self.addEventListener('message', (event) => {
    const { name, data, requestId } = event.data

    queue = queue
        .then(() => handlers[name](data))
        .catch(e => console.error(`worker: ${name} failed`, e))
        .then(() => {
            if(requestId !== undefined) {
                self.postMessage({ name: 'done', requestId })
            }
        })
})
