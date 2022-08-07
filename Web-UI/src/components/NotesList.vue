<script setup>
import { useStore } from '../store'

const store = useStore()

function openNoteContextMenu(event, note) {
    alert('long pressed on ' + note.title)
}

function viewNote(note) {
    store.note = note
}

store.loadNotes()
</script>

<template>
    <div v-for="note in store.filteredNotes" class="item" @contextmenu.prevent="openNoteContextMenu($event, note)" @click="viewNote(note)">{{ note.title }}</div>
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
