<template>
    <div class="modal-container" @click="$emit('close')">
        <div class="modal">
            <slot></slot>
        </div>
    </div>
</template>

<style scoped>
.modal-container {
    z-index: 2;
    position: fixed;
    top: 0;
    height: 100%;
    width: 100%;
    display: grid;
    place-items: center;
    background-color: #00000082;
}

.modal {
    background-color: white;
    padding: 1rem;
    font-size: var(--secondary-font-size);
}

.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
