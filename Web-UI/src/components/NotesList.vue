<script setup>
import { useStore } from '../store'

const store = useStore()

const vOnLongPress = {
    mounted(element, binding)  {
        let timer

        element.addEventListener('touchstart', () => {
            timer = setTimeout(() => {
                timer = null
                binding.value()
            }, 500)
        })

        function cancel() {
            clearTimeout(timer)
        }

        element.addEventListener('touchend', cancel)
        element.addEventListener('touchmove', cancel)
    }
}

function openNoteContextMenu(note) {
    alert('long pressed on ' + note.title)
}

function viewNote(note) {
    store.note = note
}

store.loadNotes()
</script>

<template>
    <div v-for="note in store.filteredNotes" class="item" v-on-long-press="() => openNoteContextMenu(note)" @click="viewNote(note)">{{ note.title }}</div>
</template>

<style scoped>
.item {
    padding: 0.7rem 1rem;
    border-bottom: 1px solid lightgrey;
    user-select: none;
}

/* prevent sticky hover on touch devices */
@media (hover: hover) {
    .item:hover {
        cursor: pointer;
        background-color: #0000000f;
    }
}

.item:active {
    cursor: pointer;
    background-color: #0000000f;
}
</style>
