<script setup>
import { useStore } from '../store'

const store = useStore()

store.loadCategories()

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

function openCategoryContextMenu(category) {
    alert('long pressed on ' + category.name)
}

function viewCategory(category) {
    store.category = category
}
</script>

<template>
    <div v-for="category in store.categories" class="item" v-on-long-press="() => openCategoryContextMenu(category)" @click="viewCategory(category)">{{ category.name }}</div>
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
