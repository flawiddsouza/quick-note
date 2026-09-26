import { defineStore } from 'pinia'
import { getItem, setItem, deleteItem } from './db'
import { nanoid } from 'nanoid'
import * as sync from './sync'
import * as account from './account'
import { showMessage } from './dialogs'

const apiUrl = import.meta.env.QUICK_NOTE_API_URL
const websocketUrl = import.meta.env.QUICK_NOTE_WEBSOCKET_URL

let loginRetry = null
let loginRetryDelay = 5000
let loginInFlight = null

// password is kept for an account without encryption; an encrypted account keeps keyCache
// instead, the stretched password and its salt, and the password itself is never stored
const defaultSettings = () => ({
    privacyModeEnabled: false,
    privacyModePercent: 50,
    email: '',
    password: '',
    encrypted: false,
    keyCache: null
})

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
            settings: defaultSettings(),
            skipSettingsUpdate: true,
            token: null,
            dataKey: null,
            connectionStatus: 'Connecting',
            contentsVersion: 0
        }
    },
    getters: {
        filteredNotes() {
            const searchString = this.search.toLowerCase()

            let notes = this.notes.filter(note => note.categoryId === this.currentCategoryId)

            if(searchString !== '') {
                // the note texts are read from the database on the first search, see loadContents
                this.contentsVersion
                notes = notes.filter(note => {
                    return note.title.toLowerCase().includes(searchString) || (sync.contentOf(note.id) ?? note.snippet).toLowerCase().includes(searchString)
                })
            }

            return notes.sort((a, b) => b.modified.localeCompare(a.modified))
        }
    },
    actions: {
        // called by sync whenever the rows change, locally or from another device or tab
        applyRows({ categories, notes }) {
            this.categories = [{ id: null, name: 'Main' }, ...categories]
            this.notes = notes
            this.contentsVersion++
        },
        // should be run only once when the app is first loaded
        async loadDB() {
            this.settings = { ...defaultSettings(), ...(await getItem('settings') ?? {}) }
            account.configure(apiUrl)

            try {
                await sync.start({
                    onChange: rows => this.applyRows(rows),
                    onConnection: connected => { this.connectionStatus = connected ? 'Connected' : 'Disconnected' },
                    onLocked: () => this.login(),
                    onSyncFailed: error => {
                        this.connectionStatus = 'Sync failed'
                        if(error.status === 401) {
                            this.login()
                        }
                    }
                })
            } catch(e) {
                console.error('Could not open notes', e)
                showMessage({ title: 'Could not open notes', message: 'Please reload the app and try again.' })
                return
            }

            // to avoid unncessary db write when settings are loaded from the db for the first time
            this.skipSettingsUpdate = false

            if(this.settings.email !== '') {
                await this.login()
            }
        },
        // Logs in with what settings hold and starts syncing; also how a device gets the data
        // key once the account was encrypted from another device, and how a token past its
        // 30 days is replaced. A server that cannot be reached is tried again, slower each time.
        login() {
            if(this.settings.email === '') {
                return Promise.resolve()
            }
            // one login at a time, whoever asks; a failure is handled inside, never thrown
            loginInFlight ??= this.tryLogin().finally(() => { loginInFlight = null })
            return loginInFlight
        },
        async tryLogin() {
            this.connectionStatus = 'Connecting'
            clearTimeout(loginRetry)
            let result

            try {
                result = await account.login({ email: this.settings.email, password: this.settings.password, keyCache: this.settings.keyCache })
            } catch(e) {
                if(e.status === 400) {
                    // the password or the account changed elsewhere
                    await this.logout()
                    showMessage({ title: 'Login failed', message: `${e.message}. Please log in again.` })
                } else {
                    this.connectionStatus = 'Disconnected'
                    loginRetry = setTimeout(() => this.login(), loginRetryDelay)
                    loginRetryDelay = Math.min(loginRetryDelay * 2, 60000)
                }
                return
            }

            loginRetryDelay = 5000
            this.useLogin(result)
        },
        useLogin({ token, encrypted, dataKey, keyCache }) {
            this.settings.encrypted = encrypted
            this.settings.keyCache = keyCache
            if(encrypted) {
                this.settings.password = ''
            }
            this.dataKey = dataKey
            this.token = token
        },
        // called whenever store.token changes, watch handler in App.vue
        async connect() {
            await sync.attach(this.settings.email)
            sync.setSession({ apiUrl, token: this.token, dataKey: this.dataKey })
            sync.connect(`${websocketUrl}?token=${this.token}`)
        },
        async signIn(email, password) {
            const result = await account.login({ email, password })
            this.settings.email = email
            this.settings.password = password
            this.useLogin(result)
        },
        // returns the recovery phrase, to be shown once
        async register(email, password) {
            const result = await account.register({ email, password })
            this.settings.email = email
            this.useLogin(result)
            return result.phrase
        },
        // turns an account without encryption on to it; returns the recovery phrase
        async encryptAccount() {
            const { password, encryption, dataKey, keyCache, phrase } = await account.encryptionFor(this.settings.password)
            await sync.encryptAccount({ password, encryption, dataKey })
            this.useLogin({ token: this.token, encrypted: true, dataKey, keyCache })
            return phrase
        },
        async changePassword(currentPassword, newPassword) {
            const { keyCache } = await account.changePassword({
                token: this.token,
                encrypted: this.settings.encrypted,
                keyCache: this.settings.keyCache,
                dataKey: this.dataKey,
                currentPassword,
                newPassword
            })
            this.settings.keyCache = keyCache
            if(!this.settings.encrypted) {
                this.settings.password = newPassword
            }
        },
        async resetPassword(email, phrase, newPassword) {
            await account.resetPassword({ email, phrase, newPassword })
            await this.signIn(email, newPassword)
        },
        async newRecoveryPhrase() {
            return account.newRecoveryPhrase({ token: this.token, dataKey: this.dataKey })
        },
        async openNote(note) {
            this.note = { ...note, content: await sync.getContent(note.id) }
        },
        async loadContents() {
            await sync.loadContents()
            this.contentsVersion++
        },
        async addCategory(name, fieldOverrides={}) {
            sync.saveCategory({
                id: 'id' in fieldOverrides ? fieldOverrides.id : nanoid(),
                name,
                created: 'created' in fieldOverrides ? fieldOverrides.created : new Date().toISOString(),
                modified: 'modified' in fieldOverrides ? fieldOverrides.modified : new Date().toISOString()
            })
        },
        async updateCategory(existingCategory, name) {
            if(existingCategory.name === name) {
                return
            }

            sync.saveCategory({ ...existingCategory, name, modified: new Date().toISOString() })
        },
        async deleteCategory(id) {
            // switch current category to Main if the category being deleted is the active one
            if(this.currentCategoryId === id) {
                this.currentCategoryId = null
            }

            sync.deleteCategory(id)
        },
        async addNote(title, content, fieldOverrides={}) {
            if(title === '' && content === '') {
                return
            }

            sync.saveNote({
                id: 'id' in fieldOverrides ? fieldOverrides.id : nanoid(),
                categoryId: 'categoryId' in fieldOverrides ? fieldOverrides.categoryId : this.currentCategoryId,
                title,
                content,
                created: 'created' in fieldOverrides ? fieldOverrides.created : new Date().toISOString(),
                modified: 'modified' in fieldOverrides ? fieldOverrides.modified : new Date().toISOString()
            })
        },
        async updateNote(originalNote, title, content) {
            if(title === '' && content === '') {
                await this.deleteNote(originalNote.id)
                return
            }

            if(originalNote.title === title && originalNote.content === content) {
                return
            }

            sync.saveNote({ ...originalNote, title, content, modified: new Date().toISOString() })
        },
        async deleteNote(id) {
            sync.deleteNote(id)
        },
        // adds many at once, skipping ids already present, in a single write
        async addAll({ categories = [], notes = [] }) {
            const knownCategories = new Set(this.categories.map(category => category.id))
            const knownNotes = new Set(this.notes.map(note => note.id))

            sync.save({
                categories: categories.filter(category => !knownCategories.has(category.id)),
                notes: notes.filter(note => !knownNotes.has(note.id))
            })
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
            clearTimeout(loginRetry)
            sync.disconnect()
            sync.setSession(null)
            this.settings.email = ''
            this.settings.password = ''
            this.settings.encrypted = false
            this.settings.keyCache = null
            this.token = null
            this.dataKey = null
        },
        async resetApplication() {
            clearTimeout(loginRetry)
            this.token = null
            this.dataKey = null
            await deleteItem('settings')
            await sync.reset()
            this.settings = defaultSettings()
        }
    }
})
