<script setup>
import { ref } from 'vue'
import { useStore } from '../store'
import Modal from './Modal.vue'
import dayjs from 'dayjs'

const store = useStore()
const contextMenuPosition = ref({ x: '-9999px', y: 0 })
const showContextMenu = ref(false)
const contextMenuNote = ref(null)
const showDetailsModal = ref(false)

function openNoteContextMenu(event, note) {
    contextMenuPosition.value.x = event.pageX + 'px'
    contextMenuPosition.value.y = event.pageY + 'px'
    contextMenuNote.value = note
    showContextMenu.value = true
}

function viewNote(note) {
    store.note = note
    window.history.pushState({}, '', '/note')
    store.navigatedToNote = true
}

const contextMenu = {
    details() {
        showDetailsModal.value = true
        showContextMenu.value = false
    },
    copy() {
        let noteToCopy = ''

        if(contextMenuNote.value.title !== '' && contextMenuNote.value.content !== '') {
            noteToCopy = contextMenuNote.value.title + '\n' + contextMenuNote.value.content
        }

        if(contextMenuNote.value.title !== '' && contextMenuNote.value.content === '') {
            noteToCopy = contextMenuNote.value.title
        }

        if(contextMenuNote.value.title === '' && contextMenuNote.value.content !== '') {
            noteToCopy = contextMenuNote.value.content
        }

        navigator.clipboard.writeText(noteToCopy)

        showContextMenu.value = false
    },
    share() {
        navigator.share({
            title: contextMenuNote.value.title,
            text: contextMenuNote.value.content
        })

        showContextMenu.value = false
    },
    delete() {
        if(!confirm('Do you really want to delete this?')) {
            return
        }

        store.deleteNote(contextMenuNote.value.id)

        showContextMenu.value = false
    }
}
</script>

<template>
    <div v-for="note in store.filteredNotes" class="item" @contextmenu.prevent="openNoteContextMenu($event, note)" @click="viewNote(note)">
        <div class="item-primary">{{ note.title !== '' ? note.title : note.content }}</div>
        <div class="item-secondary" v-if="note.title !== '' & note.content !== ''">{{ note.content }}</div>
    </div>
    <div class="context-menu-overlay" v-show="showContextMenu" @click="showContextMenu = false"></div>
    <div class="context-menu" :style="{ left: contextMenuPosition.x, top: contextMenuPosition.y }" v-show="showContextMenu">
        <div @click="contextMenu.details">Details</div>
        <div @click="contextMenu.copy">Copy</div>
        <div @click="contextMenu.share">Share</div>
        <div @click="contextMenu.delete">Delete</div>
    </div>
    <transition name="fade">
        <Modal v-if="showDetailsModal" @close="showDetailsModal = false">
            <div>Created on: {{ dayjs(contextMenuNote.created).format('DD-MMM-YY hh:mm A') }}</div>
            <div>Updated on: {{ dayjs(contextMenuNote.modified).format('DD-MMM-YY hh:mm A') }}</div>
        </Modal>
    </transition>
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

.item-primary {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.item-secondary {
    margin-top: 0.3rem;
    color: #676767;
    max-height: 2.7rem;
    overflow: hidden;
}

.context-menu-overlay {
    position: fixed;
    top: 0;
    height: 100%;
    width: 100%;
}

.context-menu {
    z-index: 3;
    position: fixed;
    background-color: white;
    box-shadow: 3px 3px 12px 3px #c9c9c9;
    min-width: 10rem;
}

.context-menu > div {
    padding: 0.7rem 1rem;
    cursor: pointer;
    user-select: none;
}

@media (hover: hover) {
    .context-menu > div:hover {
        cursor: pointer;
        background-color: #0000000f;
    }
}

.context-menu > div:active {
    cursor: pointer;
    background-color: #0000000f;
}
</style>
