import { expect } from 'vitest'
import * as sync from '../src/sync'
import * as account from '../src/account'
import * as crypto from '../src/crypto'
import { db } from '../src/db'

export const note = (id, extra = {}) => ({ id, categoryId: null, title: `title ${id}`, content: `content ${id}`, created: '2024-01-01T00:00:00.000Z', modified: '2024-01-01T00:00:00.000Z', ...extra })
export const category = (id, extra = {}) => ({ id, name: `name ${id}`, created: '2024-01-01T00:00:00.000Z', modified: '2024-01-01T00:00:00.000Z', ...extra })

// varied prose of about the given size, as a real note is, so nothing is the same twice
const words = 'the of and to in a is that for it as was with be by on not he this are or his from at which but have an had they you were their one all we can her has there been if more when will would who so no out up into than them some could time only its then two other these new may do first any my now such like our over man me even most made after also did many before must through back years where much your way well down should because each just those people how too little state good very make world still own see men work long get here between both life being under never day same another know while last might us great old year off come since against go came right used take three states himself few house use during without again place thought went say part once general high upon school every does got united left number course war until always away something fact though water less public put think almost hand enough far took head yet government system better set told nothing night end why called eyes find going look asked later knew point next program city business give group toward young days let room president side social given present several order national possible rather second face per among form important often things looking early white case become large big need four within felt along children saw best church ever least power development light thing family interest seemed seems want members mind country area others turned although open service certain kind problem began door different thus help means sense whole matter perhaps itself times human law line above name example action company hands local show whether five history gave either act feet across today taken anything seen having death experience body word really half already tell month child needed field study behind moment provide seven wife political wanted shall words themselves brought book college whose federal turn full fire hundred west evening reason street table'.split(' ')

export function prose(kb, seed = 1) {
    const random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
    const parts = []
    let size = 0
    while(size < kb * 1024) {
        const sentence = Array.from({ length: 8 + Math.floor(random() * 12) }, () => words[Math.floor(random() * words.length)]).join(' ') + (random() < 0.15 ? '.\n\n' : '. ')
        parts.push(sentence)
        size += sentence.length
    }
    return parts.join('')
}

// a note the size of a real one: most are a few KB, some much longer
export const realisticNote = (id, index) => note(id, {
    title: `Note ${index} ${words[index % words.length]}`,
    content: prose(index % 10 === 9 ? 5 + (index % 15) : 1 + (index % 4), index + 1),
    created: new Date(1700000000000 + index * 1000).toISOString(),
    modified: new Date(1700000000000 + index * 1000).toISOString()
})

export const ids = rows => rows.map(row => row.id).sort()
export const titles = rows => Object.fromEntries(rows.map(row => [row.id, row.title]))

// a fresh device: every table emptied, then the sync module started, collecting what it publishes
export async function startClient() {
    await sync.stop()
    await db.transaction('rw', db.store, db.categories, db.notes, db.contents, db.bases, async() => {
        for(const table of [db.store, db.categories, db.notes, db.contents, db.bases]) {
            await table.clear()
        }
    })

    const client = { states: [], connections: [], locked: 0, failures: [], latest: () => client.states[client.states.length - 1] }
    await sync.start({
        onChange: state => client.states.push(state),
        onConnection: connected => client.connections.push(connected),
        onLocked: () => { client.locked++ },
        onSyncFailed: error => client.failures.push(error)
    })
    return client
}

// logs the app in and syncs once; with a websocket url it also connects, as the app does
export async function loginClient(apiUrl, { email, password }, websocketUrl = null) {
    account.configure(apiUrl)
    const result = await account.login({ email, password })
    await sync.attach(email)
    sync.setSession({ apiUrl, token: result.token, dataKey: result.dataKey })
    if(websocketUrl) {
        sync.connect(`${websocketUrl}?token=${result.token}`)
        await until(() => sync.connected(), 'the websocket')
    }
    await sync.sync()
    return result
}

// waits for a condition, which may be async, checking it every few milliseconds
export async function until(condition, what = 'condition') {
    let met = false
    for(let attempt = 0; attempt < 500 && !met; attempt++) {
        met = await condition()
        if(!met) {
            await new Promise(resolve => setTimeout(resolve, 10))
        }
    }
    expect(met, `timed out waiting for ${what}`).toBe(true)
}

// The same account on another device, without the app: it pulls and pushes rows with
// fetch, holds the account's data key and encrypts and decrypts like the app does.
export async function otherDevice(apiUrl, { email, password }) {
    account.configure(apiUrl)
    const { token, encrypted, dataKey } = await account.login({ email, password })
    const rows = { categories: new Map(), notes: new Map() }
    const label = (id, field) => `${id}:${field}`

    async function request(path, options = {}) {
        const response = await fetch(`${apiUrl}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } })
        expect(response.ok, `${path}: ${response.status} ${await response.clone().text()}`).toBe(true)
        return response.json()
    }

    const device = {
        token,
        dataKey,
        seq: 0,
        async pull() {
            let more = true
            while(more) {
                const page = await request(`/changes?since=${device.seq}`)
                for(const row of page.categories) {
                    rows.categories.set(row.id, row.deleted || !page.encrypted ? row : { ...row, name: await crypto.decryptText(dataKey, row.name, label(row.id, 'name')) })
                }
                for(const row of page.notes) {
                    rows.notes.set(row.id, row.deleted || !page.encrypted ? row : {
                        ...row,
                        title: await crypto.decryptText(dataKey, row.title, label(row.id, 'title')),
                        content: await crypto.decryptText(dataKey, row.content, label(row.id, 'content'))
                    })
                }
                device.seq = page.seq
                more = page.more
            }
            return device
        },
        notes: () => [...rows.notes.values()].filter(row => !row.deleted),
        categories: () => [...rows.categories.values()].filter(row => !row.deleted),
        note: id => rows.notes.get(id),
        // pushes plain rows as this device's changes, on top of what the server has
        async push({ categories = [], notes = [] }) {
            await device.pull()
            const wire = {
                categories: await Promise.all(categories.map(async row => ({
                    ...row, version: rows.categories.get(row.id)?.version ?? 0, deleted: row.deleted ?? false,
                    name: !encrypted || row.deleted ? row.name : await crypto.encryptText(dataKey, row.name, label(row.id, 'name'))
                }))),
                notes: await Promise.all(notes.map(async row => ({
                    ...row, version: rows.notes.get(row.id)?.version ?? 0, deleted: row.deleted ?? false,
                    title: !encrypted || row.deleted ? row.title : await crypto.encryptText(dataKey, row.title, label(row.id, 'title')),
                    content: !encrypted || row.deleted ? row.content : await crypto.encryptText(dataKey, row.content, label(row.id, 'content'))
                })))
            }
            const result = await request('/changes', { method: 'POST', body: JSON.stringify(wire) })
            expect(result.rejected, 'the other device pushes on top of what it pulled').toEqual({ categories: [], notes: [] })
            await device.pull()
            return result
        },
        saveNote: row => device.push({ notes: [row] }),
        saveCategory: row => device.push({ categories: [row] }),
        deleteNote: id => device.push({ notes: [{ ...rows.notes.get(id), title: '', content: '', categoryId: null, deleted: true }] }),
        // the rows exactly as the server holds them
        raw: () => request('/changes?since=0')
    }
    return device.pull()
}
