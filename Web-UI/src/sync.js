// Notes and categories are rows in IndexedDB, one per note, and the same rows on the server
// (see API/sync.js). Every row carries the version the server last gave it. A change made
// here marks the row dirty and keeps the row as the server had it (its base) until the change
// is pushed. Syncing pulls every row the server wrote after the seq this device last saw,
// then pushes the dirty rows with their versions. A push the server rejects, because the
// row changed on another device meanwhile, is merged three ways here (merge.js) and pushed
// again. The websocket only says "something changed, pull"; rows always travel over HTTP.
//
// The list of notes is kept small: the note texts live in their own table and are read when
// a note is opened, or all at once for a search. The store only ever sees plain rows.
//
// For an encrypted account, titles, contents and names are encrypted with the data key on
// the way out and decrypted on the way in. The rows on the device are plain.
import { nanoid } from 'nanoid'
import { db, getItem, setItem, deleteItem } from './db'
import { mergeNote, mergeCategory } from './merge'
import { encryptText, decryptText } from './crypto'

const snippetLength = 300
const pushBatchSize = 200

let listeners = { onChange: () => {}, onConnection: () => {}, onLocked: () => {}, onSyncFailed: () => {} }
let categories = new Map()
let notes = new Map()
let contents = new Map()
let contentsLoaded = false
let session = null
let accountEncrypted = false
let channel = null
let pushTimer = null

export class LockedError extends Error {}

const snippet = content => content.slice(0, snippetLength)
const live = map => [...map.values()].filter(row => !row.deleted)
const plainCategory = ({ id, name, created, modified }) => ({ id, name, created, modified })
const plainNote = ({ id, categoryId, title, snippet, created, modified }) => ({ id, categoryId, title, snippet, created, modified })
const byId = rows => new Map(rows.map(row => [row.id, row]))
const tables = () => [db.categories, db.notes, db.contents, db.bases]

function publish() {
    listeners.onChange({ categories: live(categories).map(plainCategory), notes: live(notes).map(plainNote) })
}

async function load() {
    const [categoryRows, noteRows] = await Promise.all([db.categories.toArray(), db.notes.toArray()])
    categories = byId(categoryRows)
    notes = byId(noteRows)
    contents = new Map()
    contentsLoaded = false
}

// the document of the build before rows, read once and turned into rows
async function importLegacyDocument() {
    const bytes = await getItem('automergeDoc')
    if(!bytes) {
        return
    }

    const { readLegacyDocument } = await import('./legacy')
    await save(await readLegacyDocument(bytes))

    for(const key of ['automergeDoc', 'automergeSyncState', 'clientId']) {
        await deleteItem(key)
    }
}

export async function start(newListeners) {
    listeners = newListeners
    await load()
    await importLegacyDocument()
    publish()

    // other tabs of this browser share the rows and are told to read them again
    if(typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel('quick-note')
        channel.onmessage = async() => {
            await load()
            publish()
        }
    }
}

// after every local write: the screen, the other tabs, then the server
function changed() {
    publish()
    channel?.postMessage('changed')
    clearTimeout(pushTimer)
    pushTimer = setTimeout(sync, 100)
}

export async function getContent(id) {
    if(!contents.has(id)) {
        contents.set(id, (await db.contents.get(id))?.content ?? '')
    }
    return contents.get(id)
}

// every note text, for a search; read once and kept until another tab changes something
export async function loadContents() {
    if(!contentsLoaded) {
        contents = new Map((await db.contents.toArray()).map(row => [row.id, row.content]))
        contentsLoaded = true
    }
    return contents
}

export const contentOf = id => contents.get(id)

// Writes plain categories and notes: unknown ids are added, known ids overwritten. A row
// the server knows keeps its base, the row as the server last had it, for a later merge.
export async function save({ categories: newCategories = [], notes: newNotes = [] }) {
    const written = { categories: [], notes: [] }

    await db.transaction('rw', ...tables(), async() => {
        for(const category of newCategories) {
            const existing = categories.get(category.id)
            if(existing && !existing.dirty && existing.version > 0) {
                await db.bases.put({ key: `category:${category.id}`, name: existing.name })
            }
            const row = { ...plainCategory(category), version: existing?.version ?? 0, dirty: 1, deleted: 0, rev: (existing?.rev ?? 0) + 1 }
            await db.categories.put(row)
            written.categories.push(row)
        }

        for(const note of newNotes) {
            const existing = notes.get(note.id)
            if(existing && !existing.dirty && existing.version > 0) {
                await db.bases.put({ key: `note:${note.id}`, title: existing.title, content: (await db.contents.get(note.id))?.content ?? '', categoryId: existing.categoryId })
            }
            const row = { ...plainNote({ ...note, snippet: snippet(note.content) }), version: existing?.version ?? 0, dirty: 1, deleted: 0, rev: (existing?.rev ?? 0) + 1 }
            await db.notes.put(row)
            await db.contents.put({ id: note.id, content: note.content })
            written.notes.push([row, note.content])
        }
    })

    for(const row of written.categories) {
        categories.set(row.id, row)
    }
    for(const [row, content] of written.notes) {
        notes.set(row.id, row)
        contents.set(row.id, content)
    }
    changed()
}

export const saveCategory = category => save({ categories: [category] })
export const saveNote = note => save({ notes: [note] })

// A row the server knows becomes a tombstone until the deletion is pushed; one it never
// saw just goes.
async function remove({ categories: categoryIds = [], notes: noteIds = [] }) {
    const dropped = { categories: [], notes: [] }
    const tombstones = { categories: [], notes: [] }

    await db.transaction('rw', ...tables(), async() => {
        for(const id of categoryIds) {
            const existing = categories.get(id)
            if(!existing) {
                continue
            }
            await db.bases.delete(`category:${id}`)
            if(existing.version === 0) {
                await db.categories.delete(id)
                dropped.categories.push(id)
            } else {
                const row = { ...existing, name: '', dirty: 1, deleted: 1, rev: existing.rev + 1 }
                await db.categories.put(row)
                tombstones.categories.push(row)
            }
        }

        for(const id of noteIds) {
            const existing = notes.get(id)
            if(!existing) {
                continue
            }
            await db.bases.delete(`note:${id}`)
            await db.contents.delete(id)
            if(existing.version === 0) {
                await db.notes.delete(id)
                dropped.notes.push(id)
            } else {
                const row = { ...existing, title: '', snippet: '', categoryId: null, dirty: 1, deleted: 1, rev: existing.rev + 1 }
                await db.notes.put(row)
                tombstones.notes.push(row)
            }
        }
    })

    for(const id of dropped.categories) {
        categories.delete(id)
    }
    for(const row of tombstones.categories) {
        categories.set(row.id, row)
    }
    for(const id of dropped.notes) {
        notes.delete(id)
        contents.delete(id)
    }
    for(const row of tombstones.notes) {
        notes.set(row.id, row)
        contents.delete(row.id)
    }
    changed()
}

export const deleteNote = id => remove({ notes: [id] })

// removes the category and every note in it
export function deleteCategory(id) {
    return remove({ categories: [id], notes: live(notes).filter(note => note.categoryId === id).map(note => note.id) })
}

// --- the server ---

// The account the rows belong to. Rows kept from another account, or from before any
// login, are pushed as new rows of this account.
export async function attach(email) {
    if(await getItem('account') === email) {
        return
    }

    await syncing
    await db.transaction('rw', db.store, ...tables(), async() => {
        await db.categories.filter(row => row.deleted === 1).delete()
        await db.notes.filter(row => row.deleted === 1).delete()
        await db.categories.toCollection().modify(row => { row.version = 0; row.dirty = 1; row.rev += 1 })
        await db.notes.toCollection().modify(row => { row.version = 0; row.dirty = 1; row.rev += 1 })
        await db.bases.clear()
        await db.store.put(0, 'seq')
        await db.store.put(email, 'account')
    })
    await load()
}

// `dataKey` is the account's data key for an encrypted account, null otherwise
export function setSession(newSession) {
    session = newSession
    if(session) {
        sync()
    }
}

// a sync whose session was ended or replaced while a request was out stops there
class StaleSession extends Error {}

async function request(path, options = {}) {
    const current = session
    const response = await fetch(`${current.apiUrl}${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${current.token}` }
    })
    if(session !== current) {
        throw new StaleSession()
    }
    if(!response.ok) {
        const error = new Error(`${path}: ${response.status} ${await response.text()}`)
        error.status = response.status
        throw error
    }
    return response.json()
}

const withLock = task => globalThis.navigator?.locks ? navigator.locks.request('quick-note-sync', task) : task()

let syncing = null
let syncAgain = false

// Pulls, then pushes, and once more if anything came in meanwhile. One sync at a time per
// browser (tabs share the rows), and one request of it at a time per tab.
export function sync() {
    if(!session) {
        return Promise.resolve()
    }
    if(syncing) {
        syncAgain = true
        return syncing
    }

    syncing = (async() => {
        try {
            await withLock(async() => {
                do {
                    syncAgain = false
                    await pull()
                    await push()
                } while(syncAgain)
            })
        } catch(error) {
            if(error instanceof StaleSession) {
                // ended on purpose, nothing to report
            } else if(error instanceof LockedError) {
                listeners.onLocked()
            } else {
                console.error('Sync failed', error)
                listeners.onSyncFailed(error)
            }
        } finally {
            syncing = null
        }
    })()
    return syncing
}

const label = (id, field) => `${id}:${field}`

async function toWireCategory(row) {
    const name = row.deleted || !accountEncrypted ? row.name : await encryptText(session.dataKey, row.name, label(row.id, 'name'))
    return { id: row.id, name, created: row.created, modified: row.modified, version: row.version, deleted: Boolean(row.deleted) }
}

async function toWireNote(row, content) {
    const [title, text] = row.deleted || !accountEncrypted ? [row.title, content] : await Promise.all([
        encryptText(session.dataKey, row.title, label(row.id, 'title')),
        encryptText(session.dataKey, content, label(row.id, 'content'))
    ])
    return { id: row.id, categoryId: row.categoryId, title, content: text, created: row.created, modified: row.modified, version: row.version, deleted: Boolean(row.deleted) }
}

async function fromWireCategory(row, encrypted) {
    if(row.deleted || !encrypted) {
        return row
    }
    return { ...row, name: await decryptText(session.dataKey, row.name, label(row.id, 'name')) }
}

async function fromWireNote(row, encrypted) {
    if(row.deleted || !encrypted) {
        return row
    }
    const [title, content] = await Promise.all([
        decryptText(session.dataKey, row.title, label(row.id, 'title')),
        decryptText(session.dataKey, row.content, label(row.id, 'content'))
    ])
    return { ...row, title, content }
}

async function fromWire(rows, encrypted) {
    if(encrypted && !session.dataKey) {
        throw new LockedError('The account is encrypted and this device has no key')
    }
    return {
        categories: await Promise.all(rows.categories.map(row => fromWireCategory(row, encrypted))),
        notes: await Promise.all(rows.notes.map(row => fromWireNote(row, encrypted)))
    }
}

async function pull() {
    let since = await getItem('seq') ?? 0
    let more = true

    while(more) {
        const page = await request(`/changes?since=${since}`)
        accountEncrypted = page.encrypted
        const rows = await fromWire(page, page.encrypted)
        await applyServerRows(rows)
        since = page.seq
        more = page.more
        await setItem('seq', since)
        publish()
    }
}

async function push() {
    for(let round = 0; round < 5; round++) {
        const dirtyCategories = await db.categories.where('dirty').equals(1).toArray()
        const dirtyNotes = await db.notes.where('dirty').equals(1).toArray()
        if(dirtyCategories.length === 0 && dirtyNotes.length === 0) {
            return
        }

        let again = false
        for(let offset = 0; offset < Math.max(dirtyNotes.length, 1); offset += pushBatchSize) {
            const batch = { categories: offset === 0 ? dirtyCategories : [], notes: dirtyNotes.slice(offset, offset + pushBatchSize) }
            const sentContents = new Map()
            for(const row of batch.notes) {
                sentContents.set(row.id, row.deleted ? '' : await getContent(row.id))
            }
            const wire = {
                categories: await Promise.all(batch.categories.map(toWireCategory)),
                notes: await Promise.all(batch.notes.map(row => toWireNote(row, sentContents.get(row.id))))
            }

            const result = await request('/changes', { method: 'POST', body: JSON.stringify(wire) })
            if(await acceptPushed(batch, sentContents, result)) {
                again = true
            }

            if(result.rejected.categories.length > 0 || result.rejected.notes.length > 0) {
                again = true
                await applyServerRows(await fromWire(result.rejected, accountEncrypted))
                publish()
            }
        }

        if(!again) {
            return
        }
    }
}

// The accepted rows are clean now, unless they changed again while the request was out;
// then they stay dirty, what was sent becomes their base, and this returns true so they go
// out again. When nothing else reached the server since the last pull, the pull position
// moves past this push, so the rows are not pulled back.
async function acceptPushed(batch, sentContents, result) {
    const sentCategories = byId(batch.categories)
    const sentNotes = byId(batch.notes)
    let stillDirty = false

    await db.transaction('rw', db.store, ...tables(), async() => {
        for(const { id, version } of result.accepted.categories) {
            const sent = sentCategories.get(id)
            const current = await db.categories.get(id)
            if(!current) {
                continue
            }
            if(current.rev !== sent.rev) {
                stillDirty = true
                await db.categories.put({ ...current, version })
                await db.bases.put({ key: `category:${id}`, name: sent.name })
            } else if(sent.deleted) {
                await db.categories.delete(id)
            } else {
                await db.categories.put({ ...current, version, dirty: 0 })
                await db.bases.delete(`category:${id}`)
            }
        }

        for(const { id, version } of result.accepted.notes) {
            const sent = sentNotes.get(id)
            const current = await db.notes.get(id)
            if(!current) {
                continue
            }
            if(current.rev !== sent.rev) {
                stillDirty = true
                await db.notes.put({ ...current, version })
                await db.bases.put({ key: `note:${id}`, title: sent.title, content: sentContents.get(id), categoryId: sent.categoryId })
            } else if(sent.deleted) {
                await db.notes.delete(id)
            } else {
                await db.notes.put({ ...current, version, dirty: 0 })
                await db.bases.delete(`note:${id}`)
            }
        }

        if((await db.store.get('seq') ?? 0) === result.before) {
            await db.store.put(result.seq, 'seq')
        }
    })

    for(const { id } of result.accepted.categories) {
        const row = await db.categories.get(id)
        row ? categories.set(id, row) : categories.delete(id)
    }
    for(const { id } of result.accepted.notes) {
        const row = await db.notes.get(id)
        row ? notes.set(id, row) : notes.delete(id)
    }
    return stillDirty
}

// Writes rows that came from the server. A row not changed here is taken as it is. A row
// changed here too is merged: an edit wins over a deletion, a change on one side only wins,
// and a change of the same lines on both sides keeps the server text and saves this
// device's text as a copy.
async function applyServerRows(rows) {
    const conflictCopies = []
    const touched = { categories: new Set(), notes: new Set() }

    await db.transaction('rw', ...tables(), async() => {
        for(const server of rows.categories) {
            touched.categories.add(server.id)
            const local = categories.get(server.id)
            const base = local?.dirty ? await db.bases.get(`category:${server.id}`) : null
            await db.bases.delete(`category:${server.id}`)

            const takeServer = async() => {
                if(server.deleted) {
                    await db.categories.delete(server.id)
                } else {
                    await db.categories.put({ ...plainCategory(server), version: server.version, dirty: 0, deleted: 0, rev: (local?.rev ?? 0) + 1 })
                }
            }
            const keepLocal = async merged => {
                await db.categories.put({ ...local, name: merged.name, version: server.version, rev: local.rev + 1 })
                if(!server.deleted) {
                    await db.bases.put({ key: `category:${server.id}`, name: server.name })
                }
            }

            if(!local?.dirty || local.deleted) {
                await takeServer()
            } else if(server.deleted) {
                await keepLocal(local)
            } else {
                const merged = mergeCategory(base ?? server, local, server)
                merged.name === server.name ? await takeServer() : await keepLocal(merged)
            }
        }

        for(const server of rows.notes) {
            touched.notes.add(server.id)
            const local = notes.get(server.id)
            const base = local?.dirty ? await db.bases.get(`note:${server.id}`) : null
            await db.bases.delete(`note:${server.id}`)

            const takeServer = async() => {
                if(server.deleted) {
                    await db.notes.delete(server.id)
                    await db.contents.delete(server.id)
                } else {
                    await db.notes.put({ ...plainNote({ ...server, snippet: snippet(server.content) }), version: server.version, dirty: 0, deleted: 0, rev: (local?.rev ?? 0) + 1 })
                    await db.contents.put({ id: server.id, content: server.content })
                }
            }
            const keepLocal = async merged => {
                await db.notes.put({ ...local, title: merged.title, snippet: snippet(merged.content), categoryId: merged.categoryId, version: server.version, rev: local.rev + 1 })
                await db.contents.put({ id: server.id, content: merged.content })
                if(!server.deleted) {
                    await db.bases.put({ key: `note:${server.id}`, title: server.title, content: server.content, categoryId: server.categoryId })
                }
            }

            if(!local?.dirty || local.deleted) {
                await takeServer()
            } else if(server.deleted) {
                await keepLocal({ ...local, content: await getContent(local.id) })
            } else {
                const localNote = { ...local, content: await getContent(local.id) }
                // A row created on both sides with the same id has no base. The same text is
                // simply the same row; otherwise the later save wins, there is nothing to merge against.
                if(!base) {
                    const same = localNote.title === server.title && localNote.content === server.content && localNote.categoryId === server.categoryId
                    same || localNote.modified <= server.modified ? await takeServer() : await keepLocal(localNote)
                    continue
                }
                const { note, conflict } = mergeNote(base, localNote, server)
                if(conflict) {
                    await takeServer()
                    conflictCopies.push({
                        id: nanoid(),
                        categoryId: localNote.categoryId,
                        title: localNote.title === '' ? 'Conflict' : `Conflict: ${localNote.title}`,
                        content: localNote.content,
                        created: new Date().toISOString(),
                        modified: new Date().toISOString()
                    })
                } else if(note.title === server.title && note.content === server.content && note.categoryId === server.categoryId) {
                    await takeServer()
                } else {
                    await keepLocal(note)
                }
            }
        }
    })

    for(const id of touched.categories) {
        const row = await db.categories.get(id)
        row ? categories.set(id, row) : categories.delete(id)
    }
    for(const id of touched.notes) {
        const row = await db.notes.get(id)
        row ? notes.set(id, row) : notes.delete(id)
        const content = row && !row.deleted ? await db.contents.get(id) : null
        content ? contents.set(id, content.content) : contents.delete(id)
    }

    if(conflictCopies.length > 0) {
        await save({ notes: conflictCopies })
    }
}

// Turns the account on to encryption: every live row goes to the server encrypted with the
// data key, together with the account's new keys, in one request (see API/sync.js). Every
// row has to be in step with the server first.
export async function encryptAccount({ password, encryption, dataKey }) {
    await sync()
    if(await db.categories.where('dirty').equals(1).count() > 0 || await db.notes.where('dirty').equals(1).count() > 0) {
        throw new Error('Some notes are not synced yet. Check the connection and try again.')
    }

    const liveCategories = live(categories)
    const liveNotes = live(notes)
    const wire = {
        password,
        encryption,
        categories: await Promise.all(liveCategories.map(async row => ({ id: row.id, version: row.version, name: await encryptText(dataKey, row.name, label(row.id, 'name')) }))),
        notes: await Promise.all(liveNotes.map(async row => ({
            id: row.id,
            version: row.version,
            title: await encryptText(dataKey, row.title, label(row.id, 'title')),
            content: await encryptText(dataKey, await getContent(row.id), label(row.id, 'content'))
        })))
    }

    const result = await request('/encrypt', { method: 'POST', body: JSON.stringify(wire) })

    // the server gave every live row the next version, in this order, so nothing needs pulling back
    await db.transaction('rw', db.store, db.categories, db.notes, async() => {
        for(const row of liveCategories) {
            await db.categories.update(row.id, { version: row.version + 1 })
        }
        for(const row of liveNotes) {
            await db.notes.update(row.id, { version: row.version + 1 })
        }
        await db.store.put(result.seq, 'seq')
    })
    for(const row of [...liveCategories, ...liveNotes]) {
        row.version += 1
    }
    session = { ...session, dataKey }
    accountEncrypted = true
}

// every live row with its text, for the export
export async function allRows() {
    await loadContents()
    return {
        categories: live(categories).map(plainCategory),
        notes: live(notes).map(row => ({ ...plainNote(row), content: contents.get(row.id) ?? '' })).map(({ snippet, ...note }) => note)
    }
}

// --- the websocket ---

let websocket = null
let websocketUrl = null
let reconnectTimer = null
let reconnectDelay = 1000

// Opens the websocket and keeps it open, reconnecting with a growing pause. Each connection
// starts with a sync, and every message from the server that names a seq ahead of this
// device's triggers one.
export function connect(url) {
    disconnect()
    websocketUrl = url
    reconnectDelay = 1000
    openWebsocket()
}

function openWebsocket() {
    const ws = new WebSocket(websocketUrl)
    websocket = ws

    ws.onopen = () => {
        reconnectDelay = 1000
        listeners.onConnection(true)
        sync()
    }
    ws.onmessage = async event => {
        const { seq } = JSON.parse(event.data)
        if(seq > (await getItem('seq') ?? 0)) {
            sync()
        }
    }
    ws.onclose = () => {
        if(websocket !== ws) {
            return
        }
        websocket = null
        listeners.onConnection(false)
        reconnectTimer = setTimeout(openWebsocket, reconnectDelay)
        reconnectDelay = Math.min(reconnectDelay * 2, 30000)
    }
    ws.onerror = () => {}
}

export function disconnect() {
    clearTimeout(reconnectTimer)
    websocketUrl = null
    if(websocket) {
        const ws = websocket
        websocket = null
        ws.close()
        listeners.onConnection(false)
    }
}

export const connected = () => websocket?.readyState === WebSocket.OPEN

// stops syncing and listening; the rows stay. Resolves once a sync in flight has stopped.
export function stop() {
    disconnect()
    session = null
    clearTimeout(pushTimer)
    channel?.close()
    channel = null
    return syncing ?? Promise.resolve()
}

// wipes every row and starts over; the tabs stay in touch
export async function reset() {
    disconnect()
    session = null
    clearTimeout(pushTimer)
    await syncing
    await db.transaction('rw', db.store, ...tables(), async() => {
        for(const table of tables()) {
            await table.clear()
        }
        await db.store.delete('seq')
        await db.store.delete('account')
    })
    await load()
    publish()
    channel?.postMessage('changed')
}
