<script setup>
import { onBeforeMount, ref, watch } from 'vue'
import { useStore } from '../store'
import Frame from '../components/Frame.vue'

const store = useStore()
const note = ref({ title: '', content: '' })

const vFocus = {
    mounted(element) {
        element.focus()
    }
}

async function goBack() {
    if(store.note.id) {
        await store.updateNote(store.note, note.value.title, note.value.content)
    } else {
        await store.addNote(note.value.title, note.value.content)
    }
    store.note = null
}

watch(store, () => {
    if(store.note) {
        note.value.title = store.note.title
        note.value.content = store.note.content
    }
})
</script>

<template>
    <Frame v-if="store.note">
        <template #app-bar>
            <button class="app-bar-action-button" title="Go Back" style="margin-right: 0.5rem; margin-left: -0.5rem;" @click="goBack">
                <img src="/icons/ic_menu_back.png">
            </button>
            <input type="text" v-model="note.title">
        </template>
        <template #app-content>
            <textarea placeholder="Type here..." v-model="note.content" v-focus></textarea>
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

input {
    font: inherit;
    background-color: transparent;
    color: white;
    outline: 0;
    border: 0;
    width: 100%;
}

textarea {
    font: inherit;
    outline: 0;
    border: 0;
    margin: 1rem;
    resize: none;
}
</style>
