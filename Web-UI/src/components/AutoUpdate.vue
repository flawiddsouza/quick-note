<script setup>
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { watch } from 'vue'
import { useStore } from '../store'

const store = useStore()

const { needRefresh, updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
        if(registration) {
            setInterval(() => registration.update(), 60 * 60 * 1000)
        }
    }
})

// a note is only saved when the user leaves it, so never reload while one is open,
// and not on the settings page either, where a form may be half filled in
watch([needRefresh, () => store.currentView], ([updateAvailable, currentView]) => {
    if(updateAvailable && currentView === 'Home') {
        updateServiceWorker(true)
    }
})
</script>

<template></template>
