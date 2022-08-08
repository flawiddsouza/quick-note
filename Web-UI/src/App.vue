<script setup>
import { useStore } from './store'
import Home from './views/Home.vue'
import Note from './views/Note.vue'

const store = useStore()

store.loadDB()
</script>

<template>
    <Home />
    <Note />
</template>
