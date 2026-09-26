import { shallowRef } from 'vue'

export const currentDialog = shallowRef(null)
const queue = []

function showNext() {
    if(!currentDialog.value && queue.length) currentDialog.value = queue.shift()
}

function enqueueDialog(options) {
    return new Promise(resolve => {
        queue.push({ ...options, resolve })
        showNext()
    })
}

export function confirmDialog(options) {
    return enqueueDialog({ ...options, kind: 'confirm' })
}

export function showMessage(options) {
    return enqueueDialog({ ...options, kind: 'message' })
}

export function closeDialog(confirmed) {
    const dialog = currentDialog.value
    if(!dialog) return
    currentDialog.value = null
    dialog.resolve(confirmed)
    queueMicrotask(showNext)
}
