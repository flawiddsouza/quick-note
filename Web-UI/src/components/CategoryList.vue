<script setup>
import { ref } from 'vue'
import { useStore } from '../store'
import ContextMenu from './ContextMenu.vue'

const store = useStore()
const contextMenuPosition = ref({ x: '-9999px', y: 0 })
const showContextMenu = ref(false)

function openCategoryContextMenu(event, category) {
    contextMenuPosition.value.x = event.pageX + 'px'
    contextMenuPosition.value.y = event.pageY + 'px'
    showContextMenu.value = true
}

function viewCategory(category) {
    store.currentCategoryId = category.id
    store.drawerOpen = false
}
</script>

<template>
    <div v-for="category in store.categories" class="item" @contextmenu.prevent="openCategoryContextMenu($event, category)" @click="viewCategory(category)">{{ category.name }}</div>
    <ContextMenu v-if="showContextMenu" @close="showContextMenu = false" :left="contextMenuPosition.x" :top="contextMenuPosition.y">
        <div>Rename</div>
        <div>Delete</div>
    </ContextMenu>
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
