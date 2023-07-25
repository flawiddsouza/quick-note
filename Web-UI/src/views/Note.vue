<script setup>
import { nextTick, ref, watch } from 'vue'
import { useStore } from '../store'
import Frame from '../components/Frame.vue'
import { storeToRefs } from 'pinia'

const store = useStore()
const { note } = storeToRefs(store)
const textarea = ref(null)

const vFocus = {
    mounted(element) {
        element.focus()
    }
}

function goBack() {
    history.back()
}

watch(note, () => {
    if(store.note) {
        store.noteCopy.title = store.note.title
        store.noteCopy.content = store.note.content
        nextTick(() => {
            setTimeout(() => {
                if(!textarea) {
                    return
                }
                textarea.value.scrollTop = textarea.value.scrollHeight
            }, 100)
        })
    }
})
</script>

<template>
    <Frame v-if="store.note">
        <template #app-bar>
            <button class="app-bar-action-button" title="Go Back" style="margin-right: 0.5rem; margin-left: -0.5rem;" @click="goBack()">
                <img src="/icons/ic_menu_back.png">
            </button>
            <input type="text" spellcheck="false" v-model="store.noteCopy.title">
        </template>
        <template #app-content>
            <textarea
                placeholder="Type here..."
                spellcheck="false"
                :style="{ color: store.settings.privacyModeEnabled ? `rgb(0 0 0 / ${100 - store.settings.privacyModePercent}%)` : false }"
                v-model="store.noteCopy.content"
                v-focus
                ref="textarea"
            ></textarea>
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
    padding-left: 1rem;
    padding-right: 1rem;
    padding-bottom: 3rem;
    margin-top: 1rem;
    margin-bottom: 1rem;
    resize: none;
}
</style>
