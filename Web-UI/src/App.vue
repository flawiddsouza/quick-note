<script setup>
import { useStore } from './store'
import Home from './views/Home.vue'
import Note from './views/Note.vue'
import ReloadPrompt from './components/ReloadPrompt.vue'

const store = useStore()

store.loadDB()

window.addEventListener('popstate', async(event) => {
    if(store.navigatedToNote) {
        await store.goBack()
        window.history.replaceState({}, '', '/')
        store.navigatedToNote = false
    }
})
</script>

<template>
    <Home />
    <Note />
    <ReloadPrompt />
</template>
