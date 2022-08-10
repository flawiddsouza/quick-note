import { defineStore } from 'pinia'
import { getItem, setItem } from './db'
import * as Automerge from 'automerge'
import { nanoid } from 'nanoid'
import PersistentWebSocket from 'pws'
import { serialize, deserialize } from 'bson'

let automergeDoc = null
let automergeSyncState = null

function saveAutomergeDoc(updatedAutomergeDoc) {
    automergeDoc = updatedAutomergeDoc
    setItem('automergeDoc', Automerge.save(updatedAutomergeDoc))
}

function saveAutomergeSyncState(updatedAutomergeSyncState) {
    automergeSyncState = updatedAutomergeSyncState
    setItem('automergeSyncState', Automerge.Backend.encodeSyncState(updatedAutomergeSyncState))
}

async function getToken(email, password) {
    let response

    try {
        response = await fetch(`${import.meta.env._API_URL}/login`, {
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
            clientId: null
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
        async loadNotesAndCategories() {
            this.categories = automergeDoc.categories ? JSON.parse(JSON.stringify(automergeDoc.categories)) : []

            this.categories.unshift({ id: null, name: 'Main' })

            this.notes = automergeDoc.notes ? JSON.parse(JSON.stringify(automergeDoc.notes)) : []
        },
        // should be run only once when the app is first loaded
        async loadDB() {
            this.settings = await getItem('settings') ?? {
                privacyModeEnabled: false,
                privacyModePercent: 50,
                email: '',
                password: ''
            }

            automergeDoc = Automerge.init()

            const savedAutomergeDoc = await getItem('automergeDoc')

            if(savedAutomergeDoc) {
                automergeDoc = Automerge.load(savedAutomergeDoc)
            }

            automergeSyncState = Automerge.initSyncState()

            const savedAutomergeSyncState = await getItem('automergeSyncState')

            if(savedAutomergeSyncState) {
                automergeSyncState = Automerge.Backend.decodeSyncState(savedAutomergeSyncState)
            }

            this.loadNotesAndCategories()

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
            const ws = new PersistentWebSocket(`${import.meta.env._WEBSOCKET_URL}?token=${this.token}`)

            ws.onopen = () => {
                console.log('connected to websocket')

                ws.send(serialize({ eventName: 'clientId', payload: this.clientId }))

                const [updatedAutomergeSyncState, syncMessage] = Automerge.generateSyncMessage(
                    automergeDoc,
                    automergeSyncState
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

                saveAutomergeSyncState(updatedAutomergeSyncState)
            }

            ws.onmessage = async event => {
                try {
                    const { eventName, payload } = deserialize(await event.data.arrayBuffer(), { promoteBuffers: true })

                    console.log('received', { eventName, payload })

                    if(eventName === 'syncMessage') {
                        const [updatedAutomergeDoc, updatedAutomergeSyncState] = Automerge.receiveSyncMessage(
                            automergeDoc,
                            automergeSyncState,
                            payload
                        )

                        saveAutomergeDoc(updatedAutomergeDoc)
                        saveAutomergeSyncState(updatedAutomergeSyncState)

                        this.loadNotesAndCategories()

                        {
                            const [updatedAutomergeSyncState, syncMessage] = Automerge.generateSyncMessage(
                                automergeDoc,
                                automergeSyncState
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

                            saveAutomergeSyncState(updatedAutomergeSyncState)
                        }
                    }
                } catch(e) {
                    console.error('WebSocket: Invalid client message received', e)
                }
            }

            ws.onclose = () => {
                console.log('websocket closed')
            }
        },
        async addCategory(name) {
            const category = {
                id: nanoid(),
                name,
                created: new Date().toISOString(),
                modified: new Date().toISOString()
            }

            this.categories.push(category)

            const updatedAutomergeDoc = Automerge.change(automergeDoc, automergeDocChange => {
                if(!automergeDocChange.categories) {
                    automergeDocChange.categories = []
                }
                automergeDocChange.categories.push(category)
            })

            saveAutomergeDoc(updatedAutomergeDoc)
        },
        async updateCategory(existingCategory, name) {
            if(existingCategory.name !== name) {
                existingCategory.name = name
                existingCategory.modified = new Date().toISOString()

                const updatedAutomergeDoc = Automerge.change(automergeDoc, automergeDocChange => {
                    const categoryToUpdateInAutomerge = automergeDocChange.categories.find(category => category.id === existingCategory.id)
                    categoryToUpdateInAutomerge.name = existingCategory.name
                    categoryToUpdateInAutomerge.modified = existingCategory.modified
                })

                saveAutomergeDoc(updatedAutomergeDoc)
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

            this.categories.splice(index, 1)

            const updatedAutomergeDoc = Automerge.change(automergeDoc, automergeDocChange => {
                // looks like item order is not guaranteed inside an automerge array, so can't use
                // the above found index to remove item as that will remove the incorrect item
                // so have to find index again
                const index2 = automergeDocChange.categories.findIndex(category => category.id === id)
                automergeDocChange.categories.splice(index2, 1)
            })

            saveAutomergeDoc(updatedAutomergeDoc)
        },
        async addNote(title, content) {
            if(title === '' && content === '') {
                return
            }

            const note = {
                id: nanoid(),
                categoryId: this.currentCategoryId,
                title,
                content,
                created: new Date().toISOString(),
                modified: new Date().toISOString()
            }

            this.notes.push(note)

            const updatedAutomergeDoc = Automerge.change(automergeDoc, automergeDocChange => {
                if(!automergeDocChange.notes) {
                    automergeDocChange.notes = []
                }
                automergeDocChange.notes.push(note)
            })

            saveAutomergeDoc(updatedAutomergeDoc)
        },
        async updateNote(existingNote, title, content) {
            if(title === '' && content === '') {
                await this.deleteNote(existingNote.id)
                return
            }

            if(existingNote.title !== title || existingNote.content !== content) {
                existingNote.title = title
                existingNote.content = content
                existingNote.modified = new Date().toISOString()

                const updatedAutomergeDoc = Automerge.change(automergeDoc, automergeDocChange => {
                    const noteToUpdateInAutomerge = automergeDocChange.notes.find(note => note.id === existingNote.id)
                    noteToUpdateInAutomerge.title = existingNote.title
                    noteToUpdateInAutomerge.content = existingNote.content
                    noteToUpdateInAutomerge.modified = existingNote.modified
                })

                saveAutomergeDoc(updatedAutomergeDoc)
            }
        },
        async deleteNote(id) {
            const index = this.notes.findIndex(note => note.id === id)

            this.notes.splice(index, 1)

            const updatedAutomergeDoc = Automerge.change(automergeDoc, automergeDocChange => {
                // looks like item order is not guaranteed inside an automerge array, so can't use
                // the above found index to remove item as that will remove the incorrect item
                // so have to find index again
                const index2 = automergeDocChange.notes.findIndex(note => note.id === id)
                automergeDocChange.notes.splice(index2, 1)
            })

            saveAutomergeDoc(updatedAutomergeDoc)
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
        }
    }
})
