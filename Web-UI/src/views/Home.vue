<script setup>
import { ref } from 'vue'
import { useStore } from '../store'
import Frame from '../components/Frame.vue'
import NotesList from '../components/NotesList.vue'
import CategoryList from '../components/CategoryList.vue'

const store = useStore()
const drawerOpen = ref(false)
const search = ref(false)

const vFocus = {
    mounted(element) {
        element.focus()
    }
}
</script>

<template>
    <Frame v-show="store.note === null">
        <template #app-bar>
            <div style="display: flex; align-items: center; width: 100%">
                <button class="app-bar-action-button" title="Go Back" style="margin-right: 0.5rem; margin-left: -0.5rem;" @click="drawerOpen = !drawerOpen">
                    <img src="icons/menu_white_24dp.svg">
                </button>
                <div class="app-bar-title" v-if="!search">
                    Quick Note
                </div>
                <input type="text" v-model="store.search" v-focus v-else>
            </div>
            <div style="white-space: nowrap">
                <button class="app-bar-action-button" title="Search" v-if="search === false" @click="search = true" >
                    <img src="icons/ic_menu_search.png">
                </button>
                <button class="app-bar-action-button" title="Search" style="margin-left: 1rem" v-else @click="search = false; store.search = ''">
                    <img src="icons/ic_menu_close_clear_cancel.png">
                </button>
                <button class="app-bar-action-button" title="Settings" style="margin-left: 1rem">
                    <img src="icons/ic_menu_preferences.png" >
                </button>
            </div>
        </template>
        <template #app-content>
            <transition name="fade">
                <div class="drawer-overlay" v-if="drawerOpen" @click="drawerOpen = false"></div>
            </transition>
            <transition name="slide">
                <div class="drawer" v-if="drawerOpen">
                    <CategoryList />
                </div>
            </transition>
            <div style="overflow-y: auto">
                <NotesList />
            </div>
        </template>
        <template #app-action-area>
            <div class="app-action-button" @click="store.note = { title: '', note: '' }">
                <div class="app-action-button-inner">+</div>
            </div>
        </template>
    </Frame>
</template>

<style scoped>
.app-bar-title {
    font-weight: 500;
}

.app-bar-action-button {
    padding: 0;
    border: 0;
    background-color: transparent;
    cursor: pointer;
}

.app-bar-action-button img {
    height: 32px;
}

.app-action-button {
    height: 2.5rem;
    width: 2.5rem;
    padding: 0.5rem;
    background-color: #ff4181;
    color: white;
    cursor: pointer;
    user-select: none;
    display: grid;
    place-items: center;
    border-radius: 50px/50px;
    box-shadow: 3px 3px 12px 3px #c9c9c9;
}

.app-action-button-inner {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 0.5rem;
    width: 0.5rem;
    padding: 0.5rem;
    background-color: white;
    border-radius: 50px/50px;
    color: hotpink;
    font-size: 1.1rem;
}

.drawer-overlay {
    z-index: 2;
    position: absolute;
    top: 0;
    height: 100%;
    width: 100%;
    background-color: #00000082;
}

.drawer {
    z-index: 3;
    position: absolute;
    top: 0;
    height: 100%;
    min-width: 15rem;
    background-color: white;
    border-right: 1px solid lightgrey;
    overflow-y: auto;
    white-space: nowrap;
}

input {
    font: inherit;
    background-color: transparent;
    color: white;
    outline: 0;
    border: 0;
    width: 100%;
}

.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

.slide-leave-active,
.slide-enter-active {
    transition: 0.5s;
}

.slide-enter {
    transform: translate(100%, 0);
}

.slide-enter-from, .slide-leave-to {
    transform: translate(-100%, 0);
}
</style>
