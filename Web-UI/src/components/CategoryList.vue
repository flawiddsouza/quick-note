<script setup>
import { ref } from 'vue'
import { useStore } from '../store'
import ContextMenu from './ContextMenu.vue'
import Modal from './Modal.vue'

const store = useStore()
const contextMenuPosition = ref({ x: '-9999px', y: 0 })
const showContextMenu = ref(false)
const contextMenuCategory = ref(null)
const contextMenuCategoryCopy = ref(null)
const showRenameCategoryModal = ref(false)

function openCategoryContextMenu(event, category) {
    // disable rename & delete context menu for the Main category
    if(category.id === null) {
        return
    }

    contextMenuPosition.value.x = event.pageX + 'px'
    contextMenuPosition.value.y = event.pageY + 'px'
    contextMenuCategory.value = category
    contextMenuCategoryCopy.value = JSON.parse(JSON.stringify(category))
    showContextMenu.value = true
}

function viewCategory(category) {
    store.currentCategoryId = category.id
    store.drawerOpen = false
}

function renameCategory() {
    store.updateCategory(contextMenuCategory.value, contextMenuCategoryCopy.value.name)
    showRenameCategoryModal.value = false
}

const contextMenu = {
    rename() {
        showRenameCategoryModal.value = true
        showContextMenu.value = false
    },
    delete() {
        if(!confirm('Deleting a category will also delete all the notes under it! Do you really want to do this?')) {
            showContextMenu.value = false
            return
        }

        store.deleteCategory(contextMenuCategory.value.id)

        showContextMenu.value = false
    }
}

const vFocus = {
    mounted(element) {
        element.focus()
    }
}
</script>

<template>
    <div
        v-for="category in store.categories"
        class="item"
        :style="{ borderLeft: store.currentCategoryId === category.id ? '4px solid #ff4181' : '4px solid transparent' }"
        @contextmenu.prevent="openCategoryContextMenu($event, category)"
        @click="viewCategory(category)"
    >
        {{ category.name }}
    </div>
    <ContextMenu v-if="showContextMenu" @close="showContextMenu = false" :left="contextMenuPosition.x" :top="contextMenuPosition.y">
        <div @click="contextMenu.rename">Rename</div>
        <div @click="contextMenu.delete">Delete</div>
    </ContextMenu>
    <Modal v-if="showRenameCategoryModal" @close="showRenameCategoryModal = false" style="padding: 1rem">
        <form @submit.prevent="renameCategory">
            <label>
                <div style="font-weight: 500; margin-bottom: 0.5rem;">Rename Category</div>
                <input type="text" spellcheck="false" v-model="contextMenuCategoryCopy.name" required v-focus>
            </label>
            <div style="text-align: right; margin-top: 1rem;">
                <button type="button" @click="showRenameCategoryModal = false">CANCEL</button>
                <button style="margin-left: 1rem">RENAME</button>
            </div>
        </form>
    </Modal>
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
