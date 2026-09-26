<script setup>
import { ref, watch } from 'vue'
import { useStore } from '../store'
import * as sync from '../sync'
import Frame from '../components/Frame.vue'
import Modal from '../components/Modal.vue'
import { confirmDialog, showMessage } from '../dialogs'
import { storeToRefs } from 'pinia'

const store = useStore()
const { settings } = storeToRefs(store)
const accountView = ref('Login')
const loginForm = ref({
    email: '',
    password: ''
})
const registrationForm = ref({
    email: '',
    password: '',
    confirmPassword: ''
})
const resetForm = ref({
    email: '',
    phrase: '',
    password: '',
    confirmPassword: ''
})
const passwordForm = ref({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
})
const showPasswordForm = ref(false)
const formError = ref('')
const formProcessing = ref(false)

// the recovery phrase is shown once, right after it is made
const phrase = ref('')
const phraseSaved = ref(false)
const phraseCopied = ref(false)
const phraseCopyError = ref(false)

// runs a form's request, keeping the error and the busy state in one place
async function submit(task) {
    formProcessing.value = true
    formError.value = ''

    try {
        await task()
    } catch(e) {
        formError.value = e.message
    }

    formProcessing.value = false
}

const login = () => submit(async() => {
    await store.signIn(loginForm.value.email, loginForm.value.password)
    loginForm.value = { email: '', password: '' }
})

const register = () => submit(async() => {
    if(registrationForm.value.password !== registrationForm.value.confirmPassword) {
        throw new Error('Password and Confirm Password do not match')
    }

    phrase.value = await store.register(registrationForm.value.email, registrationForm.value.password)
    phraseSaved.value = false
    phraseCopied.value = false
    phraseCopyError.value = false
    registrationForm.value = { email: '', password: '', confirmPassword: '' }
})

const resetPassword = () => submit(async() => {
    if(resetForm.value.password !== resetForm.value.confirmPassword) {
        throw new Error('Password and Confirm Password do not match')
    }

    await store.resetPassword(resetForm.value.email, resetForm.value.phrase, resetForm.value.password)
    resetForm.value = { email: '', phrase: '', password: '', confirmPassword: '' }
    accountView.value = 'Login'
})

const changePassword = () => submit(async() => {
    if(passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
        throw new Error('New Password and Confirm Password do not match')
    }

    await store.changePassword(passwordForm.value.currentPassword, passwordForm.value.newPassword)
    passwordForm.value = { currentPassword: '', newPassword: '', confirmPassword: '' }
    showPasswordForm.value = false
    showMessage({ title: 'Password changed', message: 'Your new password is ready to use.' })
})

async function encryptAccount() {
    if(!await confirmDialog({
        title: 'Turn on encryption?',
        message: 'Your notes will be encrypted on this device before they are sent. Only your password or the recovery phrase shown next can unlock them. Encryption cannot be turned off.',
        confirmLabel: 'Turn on encryption'
    })) return
    await submit(async() => {
        phrase.value = await store.encryptAccount()
        phraseSaved.value = false
        phraseCopied.value = false
        phraseCopyError.value = false
    })
}

async function newRecoveryPhrase() {
    if(!await confirmDialog({
        title: 'Replace recovery phrase?',
        message: 'Your current recovery phrase will stop working. Write down the new phrase when it appears.',
        confirmLabel: 'Replace phrase',
        destructive: true
    })) return
    await submit(async() => {
        phrase.value = await store.newRecoveryPhrase()
        phraseSaved.value = false
        phraseCopied.value = false
        phraseCopyError.value = false
    })
}

async function copyPhrase() {
    try {
        await navigator.clipboard.writeText(phrase.value)
        phraseCopied.value = true
        phraseCopyError.value = false
    } catch {
        phraseCopied.value = false
        phraseCopyError.value = true
    }
}

async function logout() {
    if(!await confirmDialog({
        title: 'Log out?',
        message: 'Your notes will stop backing up, but they will remain on this device.',
        confirmLabel: 'Log out'
    })) return
    await store.logout()
}

async function resetApplication() {
    if(!await confirmDialog({
        title: 'Reset application?',
        message: 'This will delete all local notes and settings from this device. Notes in a sync account can be restored by logging in again.',
        confirmLabel: 'Reset application',
        destructive: true
    })) return
    try {
        await store.resetApplication()
        showMessage({ title: 'Application reset', message: 'Local notes and settings were removed.' })
    } catch(e) {
        showMessage({ title: 'Reset failed', message: e.message })
    }
}

async function importFromWriter(e) {
    const fileInput = e.target.querySelector('input[type="file"]')
    const f = fileInput.files[0]
    const r = new FileReader()
    r.onload = async function() {
        try {
            const Uints = new Uint8Array(r.result)
            // sql.js and its WebAssembly are only fetched here, not at startup
            const [{ default: initSqlJs }, { default: sqlWasmUrl }] = await Promise.all([import('sql.js'), import('sql.js/dist/sql-wasm-browser.wasm?url')])
            const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl })
            const db = new SQL.Database(Uints)
            const categories = db.exec('SELECT * FROM categories')[0] ?? { values: [] }
            const notes = db.exec('SELECT * FROM entries')[0] ?? { values: [] }

            // ids already present are skipped by the store (= already imported)
            store.addAll({
                categories: categories.values.map(category => ({
                    id: category[0],
                    name: category[1],
                    created: new Date(category[2] + 'Z').toISOString(),
                    modified: new Date(category[3] + 'Z').toISOString()
                })),
                notes: notes.values.map(note => ({
                    id: note[0],
                    title: note[1],
                    content: note[2],
                    categoryId: note[5] ?? null,
                    created: new Date(note[3] + 'Z').toISOString(),
                    modified: new Date(note[4] + 'Z').toISOString()
                }))
            })

            showMessage({ title: 'Import complete', message: 'Your Writer backup was imported.' })
        } catch(e) {
            console.error('Import from Writer failed', e)
            showMessage({ title: 'Import failed', message: 'The backup could not be imported. Check the file and try again.' })
        }
    }
    r.onerror = () => showMessage({ title: 'Import failed', message: 'The Writer backup could not be read.' })
    r.readAsArrayBuffer(f)
}

function goBack() {
    history.back()
}

async function exportAllNotesAsJSON() {
    const data = JSON.stringify(await sync.allRows(), null, 4)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }))
    a.download = 'quick-note-backup.json'
    a.click()
}

watch(settings, () => {
    if(store.skipSettingsUpdate) {
        return
    }
    store.saveSettings()
}, { deep: true })

</script>

<template>
    <Frame>
        <template #app-bar>
            <div style="display: flex; align-items: center;">
                <button class="app-bar-action-button" title="Go Back" style="margin-right: 0.5rem; margin-left: -0.5rem;" @click="goBack()">
                    <img src="/icons/ic_menu_back.png">
                </button>
                Settings
            </div>
        </template>
        <template #app-content>
            <div>
                <div style="padding: 1rem;">
                    <div style="font-weight: 500">Privacy Mode</div>
                    <div style="margin-top: 1rem; font-size: var(--secondary-font-size); padding: 1.5rem; width: 15rem;" class="tabs-container">
                        <label>
                            <input type="checkbox" v-model="settings.privacyModeEnabled"> Enable Privacy Mode
                        </label>
                        <div style="margin-top: 0.5rem">
                            <input type="range" min="1" max="100" v-model.number="settings.privacyModePercent" style="width: 100%">
                        </div>
                        <div
                            style="margin-top: 0.5rem; text-align: center"
                            :style="{ color: settings.privacyModeEnabled ? `rgb(0 0 0 / ${100 - settings.privacyModePercent}%)` : false }"
                            :key="settings.privacyModeEnabled"
                        >Observe this text.</div>
                    </div>
                </div>
                <div style="border-top: 1px solid var(--primary-border-color)"></div>
                <div style="padding: 1rem;">
                    <div style="font-weight: 500">Sync Account</div>
                    <div style="font-size: var(--secondary-font-size)">
                        <div style="margin-top: 1rem;">This account will be used to save and sync notes between devices and can be used to get back your notes in case of data loss.</div>
                        <div style="margin-top: 1rem">
                            <div class="tabs-container">
                                <div class="tabs" v-if="settings.email === ''">
                                    <div :class="{ 'active': accountView === 'Login' }" @click="accountView = 'Login'; formError = ''">Login</div>
                                    <div :class="{ 'active': accountView === 'Register' }" @click="accountView = 'Register'; formError = ''">Register</div>
                                </div>
                                <div style="padding: 1.5rem; width: 15rem;">
                                    <template v-if="settings.email === ''">
                                        <form @submit.prevent="login" v-show="accountView === 'Login'">
                                            <div>
                                                <label>
                                                    Email<br>
                                                    <input type="email" spellcheck="false" required v-model="loginForm.email" :disabled="formProcessing">
                                                </label>
                                            </div>
                                            <div style="margin-top: 1rem">
                                                <label>
                                                    Password<br>
                                                    <input type="password" required v-model="loginForm.password" :disabled="formProcessing">
                                                </label>
                                            </div>
                                            <div style="margin-top: 1rem; display: flex; justify-content: space-between; align-items: center;">
                                                <a href="#" @click.prevent="accountView = 'Reset'; formError = ''">Forgot password?</a>
                                                <button v-if="!formProcessing">Login</button>
                                                <button disabled v-else>Logging in...</button>
                                            </div>
                                        </form>
                                        <form @submit.prevent="register" v-show="accountView === 'Register'">
                                            <div>
                                                <label>
                                                    Email<br>
                                                    <input type="email" spellcheck="false" required v-model="registrationForm.email" :disabled="formProcessing">
                                                </label>
                                            </div>
                                            <div style="margin-top: 1rem">
                                                <label>
                                                    Password<br>
                                                    <input type="password" required v-model="registrationForm.password" :disabled="formProcessing">
                                                </label>
                                            </div>
                                            <div style="margin-top: 1rem">
                                                <label>
                                                    Confirm Password<br>
                                                    <input type="password" required v-model="registrationForm.confirmPassword" :disabled="formProcessing">
                                                </label>
                                            </div>
                                            <div style="margin-top: 1rem;">Your notes are encrypted on your device before they are sent, so only you can read them. You will get a recovery phrase for a forgotten password.</div>
                                            <div style="margin-top: 1rem; text-align: right;">
                                                <button v-if="!formProcessing">Register</button>
                                                <button disabled v-else>Registration in progress...</button>
                                            </div>
                                        </form>
                                        <form @submit.prevent="resetPassword" v-show="accountView === 'Reset'">
                                            <div style="font-weight: 500">Reset Password</div>
                                            <div style="margin-top: 0.5rem">Enter the recovery phrase you were given when the account was made or encrypted.</div>
                                            <div style="margin-top: 1rem">
                                                <label>
                                                    Email<br>
                                                    <input type="email" spellcheck="false" required v-model="resetForm.email" :disabled="formProcessing">
                                                </label>
                                            </div>
                                            <div style="margin-top: 1rem">
                                                <label>
                                                    Recovery Phrase<br>
                                                    <input type="text" spellcheck="false" autocomplete="off" required v-model="resetForm.phrase" :disabled="formProcessing">
                                                </label>
                                            </div>
                                            <div style="margin-top: 1rem">
                                                <label>
                                                    New Password<br>
                                                    <input type="password" required v-model="resetForm.password" :disabled="formProcessing">
                                                </label>
                                            </div>
                                            <div style="margin-top: 1rem">
                                                <label>
                                                    Confirm Password<br>
                                                    <input type="password" required v-model="resetForm.confirmPassword" :disabled="formProcessing">
                                                </label>
                                            </div>
                                            <div style="margin-top: 1rem; display: flex; justify-content: space-between; align-items: center;">
                                                <a href="#" @click.prevent="accountView = 'Login'; formError = ''">Back to login</a>
                                                <button v-if="!formProcessing">Reset Password</button>
                                                <button disabled v-else>Resetting...</button>
                                            </div>
                                        </form>
                                    </template>
                                    <template v-else>
                                        You are logged in as <span style="color: green; font-weight: 500;">{{ settings.email }}</span>
                                        <div style="margin-top: 1rem" v-if="!showPasswordForm">
                                            <button @click="showPasswordForm = true; formError = ''">Change Password</button>
                                            <button @click="logout" style="margin-left: 1rem">Logout</button>
                                        </div>
                                        <form @submit.prevent="changePassword" v-else style="margin-top: 1rem">
                                            <div>
                                                <label>
                                                    Current Password<br>
                                                    <input type="password" required v-model="passwordForm.currentPassword" :disabled="formProcessing">
                                                </label>
                                            </div>
                                            <div style="margin-top: 1rem">
                                                <label>
                                                    New Password<br>
                                                    <input type="password" required v-model="passwordForm.newPassword" :disabled="formProcessing">
                                                </label>
                                            </div>
                                            <div style="margin-top: 1rem">
                                                <label>
                                                    Confirm Password<br>
                                                    <input type="password" required v-model="passwordForm.confirmPassword" :disabled="formProcessing">
                                                </label>
                                            </div>
                                            <div style="margin-top: 1rem; text-align: right;">
                                                <button type="button" @click="showPasswordForm = false" :disabled="formProcessing">Cancel</button>
                                                <button style="margin-left: 1rem" v-if="!formProcessing">Change Password</button>
                                                <button style="margin-left: 1rem" disabled v-else>Changing...</button>
                                            </div>
                                        </form>
                                    </template>
                                    <div style="margin-top: 1rem; color: red; text-align: center;" v-if="formError">
                                        Error: {{ formError }}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <template v-if="settings.email !== ''">
                    <div style="border-top: 1px solid var(--primary-border-color)"></div>
                    <div style="padding: 1rem;">
                        <div style="font-weight: 500">End-to-End Encryption</div>
                        <div style="font-size: var(--secondary-font-size)">
                            <template v-if="settings.encrypted">
                                <div style="margin-top: 1rem;">Your notes are encrypted on this device before they are sent to the server. Only your password or your recovery phrase can unlock them.</div>
                                <div style="margin-top: 1rem">
                                    <button @click="newRecoveryPhrase" :disabled="formProcessing">New Recovery Phrase</button>
                                </div>
                            </template>
                            <template v-else>
                                <div style="margin-top: 1rem;">Your notes are stored readable on the server. Turn encryption on to have them encrypted on this device before they are sent, so only you can read them. You will get a recovery phrase for a forgotten password: without your password or the phrase, nobody can get the notes back.</div>
                                <div style="margin-top: 1rem">
                                    <button @click="encryptAccount" :disabled="formProcessing || store.connectionStatus !== 'Connected'">Turn On Encryption</button>
                                    <span style="margin-left: 1rem" v-if="store.connectionStatus !== 'Connected'">Connect first</span>
                                </div>
                            </template>
                        </div>
                    </div>
                </template>
                <div style="border-top: 1px solid var(--primary-border-color)"></div>
                <div style="padding: 1rem;">
                    <div style="font-weight: 500">Reset Application</div>
                    <div style="font-size: var(--secondary-font-size)">
                        <div style="margin-top: 1rem;">Resetting the application will wipe all your local notes and settings! But you can get them back by logging in again if you're currently using a sync account. This operation is useful if you're facing any issues with the app or if you want to clear your data from the device.</div>
                        <div style="margin-top: 1rem">
                            <button @click="resetApplication">Reset Application</button>
                        </div>
                    </div>
                </div>
                <div style="border-top: 1px solid var(--primary-border-color)"></div>
                <div style="padding: 1rem;">
                    <div style="font-weight: 500">Import From <a href="https://play.google.com/store/apps/details?id=com.flawiddsouza.writer" target="_blank">Writer</a></div>
                    <div style="font-size: var(--secondary-font-size)">
                        <div style="margin-top: 1rem;">Import your Writer backup here</div>
                        <form @submit.prevent="importFromWriter" style="margin-top: 1rem">
                            <div>
                                <input type="file" required accept=".db">
                            </div>
                            <div style="margin-top: 1rem">
                                <button>Import Writer Backup</button>
                            </div>
                        </form>
                    </div>
                </div>
                <div style="border-top: 1px solid var(--primary-border-color)"></div>
                <div style="padding: 1rem;">
                    <div style="font-weight: 500">Export Data</div>
                    <div style="font-size: var(--secondary-font-size)">
                        <div style="margin-top: 1rem;">Keep a copy of your data as JSON.</div>
                        <div style="margin-top: 1rem">
                            <button @click="exportAllNotesAsJSON">Export All Notes as JSON</button>
                        </div>
                    </div>
                </div>
            </div>
            <Modal v-if="phrase" label="Your recovery phrase" :dismissible="false">
                <div style="font-weight: 500">Your Recovery Phrase</div>
                <div style="margin-top: 0.5rem; font-size: var(--secondary-font-size)">Write these twelve words down and keep them somewhere safe. They are the only way back into your notes if you forget your password. They are shown once and not stored anywhere.</div>
                <div class="phrase">{{ phrase }}</div>
                <div style="margin-top: 1rem; font-size: var(--secondary-font-size)">
                    <button type="button" @click="copyPhrase">{{ phraseCopied ? 'Copied' : 'Copy' }}</button>
                    <div v-if="phraseCopyError" role="alert" style="margin-top: 0.5rem; color: #b00020;">Could not copy. Select the words above and copy them.</div>
                </div>
                <div style="margin-top: 1rem; font-size: var(--secondary-font-size)">
                    <label>
                        <input type="checkbox" v-model="phraseSaved"> I have written it down
                    </label>
                </div>
                <div style="text-align: right; margin-top: 1rem;">
                    <button type="button" :disabled="!phraseSaved" @click="phrase = ''">Done</button>
                </div>
            </Modal>
        </template>
    </Frame>
</template>

<style scoped>
.app-bar-action-button {
    padding: 0;
    border: 0;
    background-color: transparent;
    cursor: pointer;
}

.app-bar-action-button img {
    height: 28px;
}

.tabs {
    display: flex;
}

.tabs > div {
    padding: 0.5rem;
    cursor: pointer;
    width: 100%;
    text-align: center;
}

.tabs > div:not(:first-child) {
    border-left: 1px solid var(--primary-border-color);
}

.tabs > div:not(.active) {
    border-bottom: 1px solid var(--primary-border-color);
}

.tabs-container {
    display: inline-block;
    border: 1px solid var(--primary-border-color);
    box-shadow: 0px 0px 2px rgb(0 0 0 / 12%), 0px 1px 8px -5px rgb(0 0 0 / 24%);
}

.phrase {
    margin-top: 1rem;
    padding: 1rem;
    border: 1px solid var(--primary-border-color);
    font-family: monospace;
    line-height: 1.6;
    user-select: all;
}

input[type="text"], input[type="email"], input[type="password"] {
    font: inherit;
    background-color: transparent;
    outline: 0;
    border: 0;
    width: 100%;
    border-bottom: 2px solid var(--primary-border-color);
    color: black;
}

input[type="text"]:focus, input[type="email"]:focus, input[type="password"]:focus {
    border-color: #e91e63;
}

input[type="file"] {
    border: 1px solid var(--primary-border-color);
    padding: 0.5rem;
}

@media (hover: hover) {
    input[type="file"]:hover {
        background-color: rgba(95, 95, 95, 0.048);
    }
}

input[type="file"]:active {
    background-color: rgba(95, 95, 95, 0.048);
}

button {
    font: inherit;
    font-size: 0.9em;
    font-weight: 500;
    background-color: transparent;
    border: 0;
    color: #e91e63;
    cursor: pointer;
    border: 1px solid var(--primary-border-color);
    padding: 0.4rem 0.8rem;
}

button:disabled {
    color: #999;
    cursor: default;
}

@media (hover: hover) {
    button:hover:not(:disabled) {
        background-color: rgba(0, 0, 0, 0.048);
    }
}

button:active:not(:disabled) {
    background-color: rgba(0, 0, 0, 0.048);
}

a {
    color: #e91e63;
}
</style>
