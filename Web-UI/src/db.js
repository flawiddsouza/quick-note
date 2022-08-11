import Dexie from 'dexie'

export const db = new Dexie('QuickNote')

db.version(4).stores({
    store: ''
})

export async function getItem(key) {
    return db.store.get(key)
}

export async function setItem(key, value) {
    db.store.put(value, key)
}

export async function deleteItem(key) {
    db.store.delete(key)
}
