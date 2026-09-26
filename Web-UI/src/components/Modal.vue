<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
    label: { type: String, required: true },
    dismissible: { type: Boolean, default: true }
})
const emit = defineEmits(['close'])
const panel = ref(null)
const previousFocus = document.activeElement

onMounted(async() => {
    await nextTick()
    const firstControl = panel.value?.querySelector('input:not([disabled]), button:not([disabled]), textarea:not([disabled])')
    ;(firstControl ?? panel.value)?.focus()
})

onBeforeUnmount(() => {
    if(previousFocus?.isConnected) previousFocus.focus()
})

function onBackdropClick(event) {
    if(props.dismissible && event.target === event.currentTarget) emit('close')
}

function onKeydown(event) {
    if(event.key === 'Escape' && props.dismissible) {
        event.stopPropagation()
        emit('close')
    }
    if(event.key !== 'Tab') return
    const controls = [...panel.value.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    if(controls.length === 0) {
        event.preventDefault()
        panel.value.focus()
        return
    }
    const first = controls[0]
    const last = controls.at(-1)
    if(event.shiftKey && (document.activeElement === first || document.activeElement === panel.value)) {
        event.preventDefault()
        last.focus()
    } else if(!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
    }
}
</script>

<template>
    <Teleport to="body">
        <div class="modal-container" @click="onBackdropClick" @keydown="onKeydown">
            <div ref="panel" class="modal" role="dialog" aria-modal="true" :aria-label="label" tabindex="-1">
                <slot></slot>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
.modal-container {
    z-index: 10;
    position: fixed;
    inset: 0;
    box-sizing: border-box;
    display: grid;
    place-items: center;
    padding: 1rem;
    background-color: #00000082;
}

.modal {
    box-sizing: border-box;
    width: fit-content;
    max-width: min(100%, 28rem);
    max-height: 100%;
    overflow-y: auto;
    background-color: white;
    padding: 1.2rem 1.5rem;
    font-size: var(--secondary-font-size);
    box-shadow: 0 8px 24px rgb(0 0 0 / 20%);
}

.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

.modal :deep(input[type="text"]) {
    box-sizing: border-box;
    width: 100%;
    font: inherit;
    color: black;
    background: transparent;
    border: 0;
    border-bottom: 2px solid #e91e63;
    outline: 0;
}

.modal :deep(button) {
    font: inherit;
    font-size: 0.9em;
    font-weight: 500;
    color: #e91e63;
    background: transparent;
    border: 1px solid var(--primary-border-color);
    padding: 0.4rem 0.8rem;
    cursor: pointer;
}

.modal :deep(button:disabled) {
    color: #999;
    cursor: default;
}
</style>
