import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import * as sync from '../src/sync'
import { db, getItem, setItem } from '../src/db'
import { note, category, realisticNote, ids, titles, startClient, loginClient, otherDevice, until } from './helpers'
import { FakeServer } from './fake-server'
import { syncScenarios } from './scenarios'
import { legacyDocumentBytes, legacyDocumentContents } from './fixtures/legacy-document'

const server = new FakeServer()

beforeAll(() => server.install())
afterAll(() => {
    sync.stop()
    server.uninstall()
})

describe('on the device', () => {
    let client

    beforeEach(async() => {
        client = await startClient()
    })

    it('starts empty and publishes every save and delete as plain rows', async() => {
        expect(client.latest()).toEqual({ categories: [], notes: [] })

        await sync.saveCategory(category('c1'))
        await sync.saveNote(note('n1', { categoryId: 'c1', content: 'x'.repeat(1000) }))
        expect(client.latest().categories).toEqual([category('c1')])
        expect(client.latest().notes).toEqual([{ id: 'n1', categoryId: 'c1', title: 'title n1', snippet: 'x'.repeat(300), created: note('n1').created, modified: note('n1').modified }])
        expect(await sync.getContent('n1')).toBe('x'.repeat(1000))

        await sync.saveNote(note('n1', { title: 'edited' }))
        expect(titles(client.latest().notes)).toEqual({ n1: 'edited' })

        await sync.deleteNote('n1')
        expect(client.latest().notes).toEqual([])
        await sync.deleteCategory('c1')
        expect(client.latest().categories).toEqual([])
    })

    it('shows the rows from last time at once on the next start', async() => {
        await sync.save({ categories: [category('c1')], notes: Array.from({ length: 50 }, (_, index) => realisticNote(`n${index}`, index)) })

        await sync.stop()
        const states = []
        await sync.start({ onChange: state => states.push(state), onConnection: () => {}, onLocked: () => {}, onSyncFailed: () => {} })
        expect(states.length).toBe(1)
        expect(states[0].notes.length).toBe(50)
        expect(states[0].categories).toEqual([category('c1')])
        expect(await sync.getContent('n3')).toBe(realisticNote('n3', 3).content)
    })

    it('deleting a category deletes the notes in it', async() => {
        await sync.saveCategory(category('c1'))
        await sync.save({ notes: [note('in', { categoryId: 'c1' }), note('out')] })
        await sync.deleteCategory('c1')
        expect(ids(client.latest().notes)).toEqual(['out'])
    })

    it('reads every text once for a search and keeps them', async() => {
        await sync.save({ notes: [note('a', { content: 'apple pie' }), note('b', { content: 'banana bread' })] })
        expect(sync.contentOf('a')).toBe('apple pie')

        await sync.stop()
        await sync.start({ onChange: () => {}, onConnection: () => {}, onLocked: () => {}, onSyncFailed: () => {} })
        expect(sync.contentOf('a')).toBeUndefined()
        const contents = await sync.loadContents()
        expect([...contents.entries()].sort()).toEqual([['a', 'apple pie'], ['b', 'banana bread']])
        expect(sync.contentOf('b')).toBe('banana bread')
    })

    it('turns the document of the build before rows into rows once', async() => {
        await setItem('automergeDoc', legacyDocumentBytes)
        await setItem('automergeSyncState', new Uint8Array([1]))
        await setItem('clientId', 'old')

        await sync.stop()
        const states = []
        await sync.start({ onChange: state => states.push(state), onConnection: () => {}, onLocked: () => {}, onSyncFailed: () => {} })

        const latest = states[states.length - 1]
        expect(latest.categories).toEqual(legacyDocumentContents.categories)
        expect(latest.notes.map(({ snippet, ...row }) => row)).toEqual(legacyDocumentContents.notes.map(({ content, ...row }) => row))
        expect(await sync.getContent(legacyDocumentContents.notes[0].id)).toBe(legacyDocumentContents.notes[0].content)
        for(const key of ['automergeDoc', 'automergeSyncState', 'clientId']) {
            expect(await getItem(key)).toBeUndefined()
        }
        // marked as this device's own, unsynced rows
        expect((await db.notes.toArray()).every(row => row.dirty === 1 && row.version === 0)).toBe(true)
    })

    it('wipes everything on reset', async() => {
        await sync.saveNote(note('n1'))
        await setItem('seq', 5)
        await sync.reset()
        expect(client.latest()).toEqual({ categories: [], notes: [] })
        expect(await db.contents.count()).toBe(0)
        expect(await getItem('seq')).toBeUndefined()
    })
})

describe('against the in-memory server', () => {
    syncScenarios({ apiUrl: server.url, nudged: condition => sync.sync().then(() => until(condition)) })
})

describe('requests in flight', () => {
    let client
    const user = { email: 'timing@test.invalid', password: 'password' }

    beforeAll(async() => {
        await fetch(`${server.url}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(user) })
    })

    beforeEach(async() => {
        client = await startClient()
        server.delay = () => Promise.resolve()
    })

    it('keeps a note edited while its push is out dirty and pushes the edit next', async() => {
        await loginClient(server.url, user)
        await sync.saveNote(note('n', { title: 'first' }))

        // the request is held so the edit lands while it is in flight
        let release
        server.delay = (path, method) => method === 'POST' && path === '/changes' ? new Promise(resolve => { release = resolve }) : Promise.resolve()
        const syncing = sync.sync()
        await until(() => release !== undefined, 'the push to be in flight')
        await sync.saveNote(note('n', { title: 'second' }))
        server.delay = () => Promise.resolve()
        release()
        await syncing

        const other = await otherDevice(server.url, user)
        expect(other.note('n').title).toBe('second')
        expect(other.note('n').version).toBe(2)
        expect((await db.notes.get('n')).dirty).toBe(0)
    })

    it('pushes a change made while offline once the server is back', async() => {
        await loginClient(server.url, user)
        server.delay = () => { throw new Error('offline') }
        await sync.saveNote(note('offline', { title: 'typed offline' }))
        await sync.sync()
        expect(client.failures.length).toBe(1)
        expect((await db.notes.get('offline')).dirty).toBe(1)

        server.delay = () => Promise.resolve()
        await sync.sync()
        expect((await otherDevice(server.url, user)).note('offline').title).toBe('typed offline')
    })

    it('writes a changed row again as new when the server no longer has it', async() => {
        await loginClient(server.url, user)
        await sync.saveNote(note('lost', { title: 'first' }))
        await sync.sync()
        server.users.get(user.email).notes.delete('lost')

        await sync.saveNote(note('lost', { title: 'edited after the loss' }))
        await sync.sync()
        const other = await otherDevice(server.url, user)
        expect(other.note('lost')).toMatchObject({ title: 'edited after the loss', version: 1, deleted: false })
        expect((await db.notes.get('lost')).dirty).toBe(0)
    })

    it('does not sync without a session', async() => {
        server.requests.length = 0
        await sync.saveNote(note('local'))
        await sync.sync()
        expect(server.requests).toEqual([])
    })
})
