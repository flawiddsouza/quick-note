<script setup>
import { useStore } from './store'
import Home from './views/Home.vue'
import Note from './views/Note.vue'
import Settings from './views/Settings.vue'
import ReloadPrompt from './components/ReloadPrompt.vue'
import { storeToRefs } from 'pinia'
import { watch, onMounted } from 'vue'

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

// On page load
onMounted(() => {
    // If url ends with /settings, go to settings and give option to navigate back to home on pressing back button on browser
    if(document.location.pathname === '/settings') {
        window.history.pushState({}, '', '/')
        window.history.replaceState({}, '', '/settings')
        store.currentView = 'Settings'
    }

    // If url ends with /note, go to home and replace the navigation to /note with /, so history thinks the user actually navigated to /
    if(document.location.pathname === '/note') {
        window.history.replaceState({}, '', '/')
    }
})
</script>

<template>
    <Home v-show="store.currentView === 'Home'" />
    <Note v-show="store.currentView === 'Note'" />
    <Settings v-show="store.currentView === 'Settings'" />
    <ReloadPrompt />
</template>
