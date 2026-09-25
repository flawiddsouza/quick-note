import { defineStore } from 'pinia'
import { getItem, setItem, deleteItem } from './db'
import { nanoid } from 'nanoid'
import PersistentWebSocket from 'pws'
import { serialize, deserialize } from 'bson'
import WebWorker from './worker?worker'

// the automerge document lives in the worker, see worker.js
const webWorker = new WebWorker()
let websocket = null
let applyState = null
let pendingRequests = {}

function workerPost(name, data) {
    webWorker.postMessage({ name, data })
}

// like workerPost, but resolves once the worker has finished handling the message
function workerRequest(name, data) {
    return new Promise(resolve => {
        const requestId = nanoid()
        pendingRequests[requestId] = resolve
        webWorker.postMessage({ name, data, requestId })
    })
}

webWorker.addEventListener('message', (event) => {
    const { name, data, requestId } = event.data

    if(name === 'state') {
        applyState(data)
    }

    if(name === 'send') {
        if(websocket && websocket.readyState === websocket.OPEN) {
            const send = {
                eventName: 'syncMessage',
                payload: data
            }
            websocket.send(serialize(send))
            console.log('sent', send)
        }
    }

    if(name === 'done') {
        pendingRequests[requestId]()
        delete pendingRequests[requestId]
    }
})

async function getToken(email, password) {
    let response

    try {
        response = await fetch(`${import.meta.env.QUICK_NOTE_API_URL}/login`, {
            method: 'POST',
            body: JSON.stringify({
                email,
                password
            }),
            headers: {
                'Content-Type': 'application/json'
            }
        })
    } catch(e) {
        throw new Error('Unable to reach server')
    }

    if(response.status === 400) {
        throw new Error(await response.text())
    }

    const responseData = await response.json()

    return responseData.token
}

export const useStore = defineStore('store', {
    state: () => {
        return {
            categories: [],
            currentCategoryId: null,
            search: '',
            notes: [],
            note: null,
            noteCopy: { title: '', content: '' },
            drawerOpen: false,
            currentView: 'Home',
            settings: {
                privacyModeEnabled: false,
                privacyModePercent: 50,
                email: '',
                password: ''
            },
            skipSettingsUpdate: true,
            token: null,
            clientId: null,
            connectionStatus: 'Connecting'
        }
    },
    getters: {
        filteredNotes() {
            const searchString = this.search.toLowerCase()

            let notes = this.notes.filter(note => note.categoryId === this.currentCategoryId)

            if(searchString !== '') {
                notes = notes.filter(note => {
                    return note.title.toLowerCase().includes(searchString) || note.content.toLowerCase().includes(searchString)
                })
            }

            return notes.sort((a, b) => b.modified.localeCompare(a.modified))
        }
    },
    actions: {
        async loadNotesAndCategories({ categories, notes }) {
            this.categories = categories

            this.categories.unshift({ id: null, name: 'Main' })

            this.notes = notes
        },
        // should be run only once when the app is first loaded
        async loadDB() {
            this.settings = await getItem('settings') ?? {
                privacyModeEnabled: false,
                privacyModePercent: 50,
                email: '',
                password: ''
            }

            applyState = state => this.loadNotesAndCategories(state)

            await workerRequest('init')

            // to avoid unncessary db write when settings are loaded from the db for the first time
            this.skipSettingsUpdate = false

            this.clientId = await getItem('clientId')

            if(this.clientId === undefined) {
                this.clientId = nanoid()
                await setItem('clientId', this.clientId)
            }

            if(this.settings.email !== '') {
                this.token = await getToken(this.settings.email, this.settings.password)
            }
        },
        // called whenever store.token changes, watch handler in App.vue
        async connectToWebSocket() {
            const ws = new PersistentWebSocket(`${import.meta.env.QUICK_NOTE_WEBSOCKET_URL}?token=${this.token}`)

            ws.onopen = () => {
                console.log('connected to websocket')

                this.connectionStatus = 'Connected'

                ws.send(serialize({ eventName: 'clientId', payload: this.clientId }))

                websocket = ws

                workerPost('online', true)
            }

            ws.onmessage = async event => {
                try {
                    const { eventName, payload } = deserialize(await event.data.arrayBuffer(), { promoteBuffers: true })

                    console.log('received', { eventName, payload })

                    if(eventName === 'syncMessage') {
                        workerPost('receiveSync', payload)
                    }
                } catch(e) {
                    console.error('WebSocket: Invalid client message received', e)
                }
            }

            ws.onclose = () => {
                console.log('websocket closed')
                this.connectionStatus = 'Disconnected'
                // a socket replaced by a newer one (re-login) must not take the worker offline
                if(websocket === ws) {
                    workerPost('online', false)
                }
            }
        },
        async addCategory(name, fieldOverrides={}) {
            const category = {
                id: 'id' in fieldOverrides ? fieldOverrides.id : nanoid(),
                name,
                created: 'created' in fieldOverrides ? fieldOverrides.created : new Date().toISOString(),
                modified: 'modified' in fieldOverrides ? fieldOverrides.modified : new Date().toISOString()
            }

            this.categories.push(category)

            workerPost('addCategory', category)
        },
        async updateCategory(existingCategory, name) {
            if(existingCategory.name !== name) {
                existingCategory.name = name
                existingCategory.modified = new Date().toISOString()

                workerPost('updateCategory', JSON.parse(JSON.stringify(existingCategory)))
            }
        },
        async deleteCategory(id) {
            // switch current category to Main if the category being deleted is the active one
            if(this.currentCategoryId === id) {
                this.currentCategoryId = null
            }

            // delete all notes matching category before deleting category
            for(const note of this.notes.filter(note => note.categoryId === id)) {
                await this.deleteNote(note.id)
            }

            const index = this.categories.findIndex(category => category.id === id)

            if(index !== -1) {
                this.categories.splice(index, 1)
            }

            workerPost('deleteCategory', id)
        },
        async addNote(title, content, fieldOverrides={}) {
            if(title === '' && content === '') {
                return
            }

            const note = {
                id: 'id' in fieldOverrides ? fieldOverrides.id : nanoid(),
                categoryId: 'categoryId' in fieldOverrides ? fieldOverrides.categoryId : this.currentCategoryId,
                title,
                content,
                created: 'created' in fieldOverrides ? fieldOverrides.created : new Date().toISOString(),
                modified: 'modified' in fieldOverrides ? fieldOverrides.modified : new Date().toISOString()
            }

            this.notes.push(note)

            workerPost('addNote', note)
        },
        async updateNote(originalNote, title, content) {
            const noteId = originalNote.id

            if(title === '' && content === '') {
                await this.deleteNote(noteId)
                return
            }

            if(originalNote.title !== title || originalNote.content !== content) {
                let note = this.notes.find(note => note.id === noteId)

                if(!note) {
                    // the note was removed from the list by a sync while it was being edited, keep the edit
                    note = JSON.parse(JSON.stringify(originalNote))
                    this.notes.push(note)
                }

                note.title = title
                note.content = content
                note.modified = new Date().toISOString()

                workerPost('updateNote', JSON.parse(JSON.stringify(note)))
            }
        },
        async deleteNote(id) {
            const index = this.notes.findIndex(note => note.id === id)

            if(index !== -1) {
                this.notes.splice(index, 1)
            }

            workerPost('deleteNote', id)
        },
        async goBack() {
            if(this.note.id) {
                await this.updateNote(this.note, this.noteCopy.title, this.noteCopy.content)
            } else {
                await this.addNote(this.noteCopy.title, this.noteCopy.content)
            }
            this.note = null
        },
        async saveSettings() {
            await setItem('settings', JSON.parse(JSON.stringify(this.settings)))
        },
        async logout() {
            // destroy websocket
            if(websocket) {
                websocket.close()
                websocket = null
            }
            // clear credentials
            this.settings.email = ''
            this.settings.password = ''
            this.token = null
            // reset sync state
            workerPost('online', false)
            workerPost('resetSyncState')
            // reset client id
            this.clientId = nanoid()
            setItem('clientId', this.clientId)
        },
        async resetApplication() {
            // destroy websocket
            if(websocket) {
                websocket.close()
                websocket = null
            }
            await deleteItem('settings')
            await deleteItem('clientId')
            workerPost('online', false)
            await workerRequest('reset')
            await this.loadDB()
        }
    }
})
