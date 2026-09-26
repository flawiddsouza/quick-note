import Dexie from 'dexie'

export const db = new Dexie('QuickNote')

// store: settings and the sync position (`seq`), plus the document of the build before rows
// until it has been read. notes holds what the list shows, contents the note texts, bases the
// row as the server last had it, kept while a row is changed here and not pushed yet.
// Booleans are 0 or 1, IndexedDB cannot index a boolean.
db.version(5).stores({
    store: '',
    categories: 'id, dirty',
    notes: 'id, categoryId, dirty',
    contents: 'id',
    bases: 'key'
})

export async function getItem(key) {
    return db.store.get(key)
}

export async function setItem(key, value) {
    return db.store.put(value, key)
}

export async function deleteItem(key) {
    return db.store.delete(key)
}
