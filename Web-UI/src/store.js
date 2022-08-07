import { defineStore } from 'pinia'

export const useStore = defineStore('store', {
    state: () => {
        return {
            categories: [],
            search: '',
            notes: [],
            note: null
        }
    },
    getters: {
        filteredNotes() {
            const searchString = this.search.toLowerCase()

            if(searchString === '') {
                return this.notes
            }

            return this.notes.filter(note => {
                return note.title.toLowerCase().includes(searchString) || note.content.toLowerCase().includes(searchString)
            })
        }
    },
    actions: {
        async loadCategories() {
            for(let i=1; i<=30; i++) {
                this.categories.push({
                    id: i,
                    name: 'Category ' + i
                })
            }
        },
        async loadNotes() {
            for(let i=1000; i>0; i--) {
                this.notes.push({
                    id: i,
                    title: 'Lorem Ipsum ' + i,
                    content: 'Test Note ' + i
                })
            }
        },
        async addNote(note) {
            this.notes.push(note)
            return note
        },
        async updateNote(note) {
            console.log(note)
        }
    }
})
