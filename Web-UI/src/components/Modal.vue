<script setup>
const emit = defineEmits(['close'])

function closeModalOnBackgroundClick(e) {
    // document.body.contains(e.target) is needed when the clicked element is no longer in the DOM
    // if you don't add it, the orphaned e.target element will close the modal, as its "closest" will
    // not yield the .modal class element or any other elements for that matter
    // because it has been removed by the user
    if(e.target.closest('.modal') === null && document.body.contains(e.target)) {
        emit('close')
    }
}
</script>

<template>
    <div class="modal-container" @click="closeModalOnBackgroundClick">
        <div class="modal">
            <slot></slot>
        </div>
    </div>
</template>

<style scoped>
.modal-container {
    z-index: 3;
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
    padding: 1.2rem 1.5rem;
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

:slotted(input) {
    font: inherit;
    background-color: transparent;
    outline: 0;
    border: 0;
    width: 100%;
    border-bottom: 2px solid #e91e63 !important;
    color: black !important;
}

:slotted(button) {
    font: inherit;
    font-size: 0.9em;
    font-weight: 500;
    background-color: transparent;
    border: 0;
    color: #e91e63;
    cursor: pointer;
}
</style>
