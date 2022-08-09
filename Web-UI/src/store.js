import { defineStore } from 'pinia'
import { getItem, setItem } from './db'
import * as Automerge from 'automerge'
import { nanoid } from 'nanoid'

let automergeDoc = null

function saveAutoMergeDoc(updatedAutomergeDoc) {
    automergeDoc = updatedAutomergeDoc
    setItem('automergeDoc', Automerge.save(updatedAutomergeDoc))
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
            navigatedToNote: true,
            drawerOpen: false
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
        // should be run only once when the app is first loaded
        async loadDB() {
            automergeDoc = Automerge.init()

            const savedAutomergeDoc = await getItem('automergeDoc')

            if(savedAutomergeDoc) {
                automergeDoc = Automerge.load(savedAutomergeDoc)
            }

            this.categories = automergeDoc.categories ? JSON.parse(JSON.stringify(automergeDoc.categories)) : []

            this.categories.unshift({ id: null, name: 'Main' })

            this.notes = automergeDoc.notes ? JSON.parse(JSON.stringify(automergeDoc.notes)) : []
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

            saveAutoMergeDoc(updatedAutomergeDoc)
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

            saveAutoMergeDoc(updatedAutomergeDoc)
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

                saveAutoMergeDoc(updatedAutomergeDoc)
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

            saveAutoMergeDoc(updatedAutomergeDoc)
        },
        async goBack() {
            if(this.note.id) {
                await this.updateNote(this.note, this.noteCopy.title, this.noteCopy.content)
            } else {
                await this.addNote(this.noteCopy.title, this.noteCopy.content)
            }
            this.note = null
        }
    }
})
