<script setup>
import { ref } from 'vue'
import { useStore } from '../store'

const store = useStore()
const contextMenuPosition = ref({ x: '-9999px', y: 0 })
const showContextMenu = ref(false)

function openCategoryContextMenu(event, category) {
    contextMenuPosition.value.x = event.pageX + 'px'
    contextMenuPosition.value.y = event.pageY + 'px'
    showContextMenu.value = true
}

function viewCategory(category) {
    store.category = category
}
</script>

<template>
    <div v-for="category in store.categories" class="item" @contextmenu.prevent="openCategoryContextMenu($event, category)" @click="viewCategory(category)">{{ category.name }}</div>
    <div class="context-menu-overlay" v-show="showContextMenu" @click="showContextMenu = false"></div>
    <div class="context-menu" :style="{ left: contextMenuPosition.x, top: contextMenuPosition.y }" v-show="showContextMenu">
        <div>Rename</div>
        <div>Delete</div>
    </div>
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
