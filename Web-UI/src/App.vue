<script setup>
import { useStore } from './store'
import Home from './views/Home.vue'
import Note from './views/Note.vue'
import Settings from './views/Settings.vue'
import ReloadPrompt from './components/ReloadPrompt.vue'
import { storeToRefs } from 'pinia'
import { watch } from 'vue'

const store = useStore()
const { token } = storeToRefs(store)

store.loadDB()

window.addEventListener('popstate', async(event) => {
    if(store.currentView === 'Note') {
        await store.goBack()
        window.history.replaceState({}, '', '/')
        store.currentView = 'Home'
    }

    if(store.currentView === 'Settings') {
        window.history.replaceState({}, '', '/')
        store.currentView = 'Home'
    }
})

watch(token, () => {
    if(token.value) {
        store.connectToWebSocket()
    }
})
</script>

<template>
    <Home v-show="store.currentView === 'Home'" />
    <Note v-show="store.currentView === 'Note'" />
    <Settings v-show="store.currentView === 'Settings'" />
    <ReloadPrompt />
</template>
