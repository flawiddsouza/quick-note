<script setup>
import { currentDialog, closeDialog } from '../dialogs'
import Modal from './Modal.vue'
</script>

<template>
    <Modal v-if="currentDialog" :label="currentDialog.title" @close="closeDialog(false)">
        <div class="dialog-title">{{ currentDialog.title }}</div>
        <div class="dialog-message">{{ currentDialog.message }}</div>
        <div class="dialog-actions">
            <button v-if="currentDialog.kind === 'confirm'" type="button" @click="closeDialog(false)">Cancel</button>
            <button type="button" :class="{ destructive: currentDialog.destructive }" @click="closeDialog(true)">
                {{ currentDialog.confirmLabel ?? (currentDialog.kind === 'confirm' ? 'Continue' : 'OK') }}
            </button>
        </div>
    </Modal>
</template>

<style scoped>
.dialog-title { font-weight: 500; }
.dialog-message { margin-top: 0.75rem; line-height: 1.4; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1.5rem; }
button { font: inherit; font-size: 0.9em; font-weight: 500; color: #e91e63; background: transparent; border: 1px solid var(--primary-border-color); padding: 0.4rem 0.8rem; cursor: pointer; }
button:hover { background: rgb(0 0 0 / 5%); }
button.destructive { color: #b00020; }
</style>
