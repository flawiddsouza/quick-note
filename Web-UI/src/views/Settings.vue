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

function login() {

}

function register() {

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
                    <div style="margin-top: 1rem; font-size: var(--secondary-font-size); padding: 1rem;" class="tabs-container">
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
                                <div class="tabs">
                                    <div :class="{ 'active': accountView === 'Login' }" @click="accountView = 'Login'">Login</div>
                                    <div :class="{ 'active': accountView === 'Register' }" @click="accountView = 'Register'">Register</div>
                                </div>
                                <div style="padding: 1.5rem">
                                    <form @submit.prevent v-show="accountView === 'Login'">
                                        <div>
                                            <label>
                                                Email<br>
                                                <input type="text" required v-model="loginForm.email">
                                            </label>
                                        </div>
                                        <div style="margin-top: 1rem">
                                            <label>
                                                Password<br>
                                                <input type="password" required v-model="loginForm.password">
                                            </label>
                                        </div>
                                        <div style="margin-top: 1rem; text-align: right;">
                                            <button>Login</button>
                                        </div>
                                    </form>
                                    <form @submit.prevent v-show="accountView === 'Register'">
                                        <div>
                                            <label>
                                                Email<br>
                                                <input type="text" required v-model="registrationForm.email">
                                            </label>
                                        </div>
                                        <div style="margin-top: 1rem">
                                            <label>
                                                Password<br>
                                                <input type="password" required v-model="registrationForm.password">
                                            </label>
                                        </div>
                                        <div style="margin-top: 1rem">
                                            <label>
                                                Confirm Password<br>
                                                <input type="password" required v-model="registrationForm.confirmPassword">
                                            </label>
                                        </div>
                                        <div style="margin-top: 1rem; text-align: right;">
                                            <button>Register</button>
                                        </div>
                                    </form>
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

input[type="text"], input[type="password"] {
    font: inherit;
    background-color: transparent;
    outline: 0;
    border: 0;
    width: 100%;
    border-bottom: 2px solid var(--primary-border-color);
    color: black;
}

input[type="text"]:focus, input[type="password"]:focus {
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
