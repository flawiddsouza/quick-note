<script setup>
import { ref, watch } from 'vue'
import { useStore } from '../store'
import Frame from '../components/Frame.vue'
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
const formError = ref('')
const formProcessing = ref(false)

async function login() {
    formProcessing.value = true

    formError.value = null

    let response

    try {
        response = await fetch(`${import.meta.env._API_URL}/login`, {
            method: 'POST',
            body: JSON.stringify(loginForm.value),
            headers: {
                'Content-Type': 'application/json'
            }
        })
    } catch(e) {
        formError.value = 'Unable to reach server'
        formProcessing.value = false
        return
    }

    if(response.status === 400) {
        formError.value = await response.text()
        formProcessing.value = false
        return
    }

    const responseData = await response.json()

    settings.value.email = loginForm.value.email
    settings.value.password = loginForm.value.password

    store.token = responseData.token

    loginForm.value.email = ''
    loginForm.value.password = ''

    formProcessing.value = false
}

async function register() {
    formProcessing.value = true

    formError.value = null

    if(registrationForm.value.password !== registrationForm.value.confirmPassword) {
        formError.value = 'Password and Confirm Password do not match'
        formProcessing.value = false
        return
    }

    let response

    try {
        response = await fetch(`${import.meta.env._API_URL}/register`, {
            method: 'POST',
            body: JSON.stringify(registrationForm.value),
            headers: {
                'Content-Type': 'application/json'
            }
        })
    } catch(e) {
        formError.value = 'Unable to reach server'
        formProcessing.value = false
        return
    }

    if(response.status === 400) {
        formError.value = await response.text()
        formProcessing.value = false
        return
    }

    const responseData = await response.json()

    settings.value.email = registrationForm.value.email
    settings.value.password = registrationForm.value.password

    store.token = responseData.token

    registrationForm.value.email = ''
    registrationForm.value.password = ''
    registrationForm.value.confirmPassword = ''

    formProcessing.value = false
}

function changePassword() {
    alert('Not Implemented')
}

function logout() {
    if(!confirm('Your notes will no longer be backed up once you log out but you\'ll still be able to access them on this device. Are you sure you want to proceed?')) {
        return
    }

    settings.value.email = ''
    settings.value.password = ''
    store.token = null
}

function goBack() {
    history.back()
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
                        <div style="margin-top: 0.5rem; text-align: center">Observe this text.</div>
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
                                    <div :class="{ 'active': accountView === 'Login' }" @click="accountView = 'Login'">Login</div>
                                    <div :class="{ 'active': accountView === 'Register' }" @click="accountView = 'Register'">Register</div>
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
                                            <div style="margin-top: 1rem; text-align: right;">
                                                <button v-if="!formProcessing">Login</button>
                                                <button disabled v-else>Logging in...</button>
                                            </div>
                                            <div style="margin-top: 1rem; color: red; text-align: center;" v-if="formError">
                                                Error: {{ formError }}
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
                                            <div style="margin-top: 1rem; text-align: right;">
                                                <button v-if="!formProcessing">Register</button>
                                                <button disabled v-else>Registration in progress...</button>
                                            </div>
                                            <div style="margin-top: 1rem; color: red; text-align: center;" v-if="formError">
                                                Error: {{ formError }}
                                            </div>
                                        </form>
                                    </template>
                                    <template v-else>
                                        You are logged in as <span style="color: green; font-weight: 500;">{{ settings.email }}</span>
                                        <div style="margin-top: 1rem">
                                            <button @click="changePassword">Change Password</button>
                                            <button @click="logout" style="margin-left: 1rem">Logout</button>
                                        </div>
                                    </template>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
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

@media (hover: hover) {
    button:hover {
        background-color: rgba(0, 0, 0, 0.048);
    }
}

button:active {
    background-color: rgba(0, 0, 0, 0.048);
}
</style>
