<script setup>
const props = defineProps({
    left: String | 0,
    top: String | 0
})

const emit = defineEmits(['close'])
</script>

<template>
    <div class="context-menu-overlay" @click="emit('close')"></div>
    <div class="context-menu" :style="{ left: props.left, top: props.top }">
        <slot></slot>
    </div>
</template>

<style scoped>
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
    font-size: var(--secondary-font-size);
}

.context-menu > :slotted(div) {
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
