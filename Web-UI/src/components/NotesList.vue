<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useStore } from '../store'
import * as sync from '../sync'
import Modal from './Modal.vue'
import dayjs from 'dayjs'
import ContextMenu from './ContextMenu.vue'
import { confirmDialog } from '../dialogs'

const store = useStore()

// Only the first page of notes is put in the DOM, more follow as the user scrolls towards
// the end. A library of thousands of notes would otherwise take seconds to lay out at startup.
const pageSize = 100
const shown = ref(pageSize)
const visibleNotes = computed(() => store.filteredNotes.slice(0, shown.value))
const moreSentinel = ref(null)
let observer = null

watch(() => [store.currentCategoryId, store.search], () => { shown.value = pageSize })

onMounted(() => {
    observer = new IntersectionObserver(entries => {
        if(entries.some(entry => entry.isIntersecting) && shown.value < store.filteredNotes.length) {
            shown.value += pageSize
        }
    })
    observer.observe(moreSentinel.value)
})

onBeforeUnmount(() => observer.disconnect())
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

// the list only holds the start of each text, the whole note is read when it is opened
async function viewNote(note) {
    await store.openNote(note)
    window.history.pushState({}, '', '/note')
    store.currentView = 'Note'
}

const contextMenu = {
    details() {
        showDetailsModal.value = true
        showContextMenu.value = false
    },
    async copy() {
        const { title } = contextMenuNote.value
        const content = await sync.getContent(contextMenuNote.value.id)
        let noteToCopy = ''

        if(title !== '' && content !== '') {
            noteToCopy = title + '\n' + content
        }

        if(title !== '' && content === '') {
            noteToCopy = title
        }

        if(title === '' && content !== '') {
            noteToCopy = content
        }

        navigator.clipboard.writeText(noteToCopy)

        showContextMenu.value = false
    },
    async share() {
        navigator.share({
            title: contextMenuNote.value.title,
            text: await sync.getContent(contextMenuNote.value.id)
        })

        showContextMenu.value = false
    },
    async delete() {
        const note = contextMenuNote.value
        showContextMenu.value = false
        if(!await confirmDialog({
            title: 'Delete note?',
            message: `Delete "${note.title || note.snippet || 'Untitled note'}"? This cannot be undone.`,
            confirmLabel: 'Delete note',
            destructive: true
        })) return
        if(store.notes.some(item => item.id === note.id)) store.deleteNote(note.id)
    }
}
</script>

<template>
    <div v-for="note in visibleNotes" :key="note.id" class="item" @contextmenu.prevent="openNoteContextMenu($event, note)" @click="viewNote(note)">
        <div
            class="item-primary"
            :style="{ color: store.settings.privacyModeEnabled ? `rgb(0 0 0 / ${100 - store.settings.privacyModePercent}%)` : false }"
        >{{ note.title !== '' ? note.title : note.snippet }}</div>
        <div
            class="item-secondary"
            :style="{ color: store.settings.privacyModeEnabled ? `rgb(0 0 0 / ${100 - store.settings.privacyModePercent}%)` : false }"
            v-if="note.title !== '' & note.snippet !== ''"
        >{{ note.snippet }}</div>
    </div>
    <div ref="moreSentinel" style="height: 1px"></div>
    <ContextMenu v-if="showContextMenu" @close="showContextMenu = false" :left="contextMenuPosition.x" :top="contextMenuPosition.y">
        <div @click="contextMenu.details">Details</div>
        <div @click="contextMenu.copy">Copy</div>
        <div @click="contextMenu.share">Share</div>
        <div @click="contextMenu.delete">Delete</div>
    </ContextMenu>
    <transition name="fade">
        <Modal v-if="showDetailsModal" label="Note details" @close="showDetailsModal = false">
            <div>Created on: {{ dayjs(contextMenuNote.created).format('DD-MMM-YY hh:mm A') }}</div>
            <div>Updated on: {{ dayjs(contextMenuNote.modified).format('DD-MMM-YY hh:mm A') }}</div>
        </Modal>
    </transition>
</template>

<style scoped>
.item {
    padding: 0.7rem 1rem;
    border-bottom: 1px solid var(--primary-border-color);
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
</style>
