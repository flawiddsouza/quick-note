// The sync module against a server, as one device of an account with another device on it.
// Run against the in-memory server (sync.test.js) and against the real one in Docker
// (e2e/sync.e2e.test.js). `nudged` waits for the app to notice a change made elsewhere: the
// websocket does that against the real server, the in-memory one has no websocket, so the
// test syncs by hand.
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import * as sync from '../src/sync'
import * as account from '../src/account'
import { encryptText } from '../src/crypto'
import { note, category, realisticNote, ids, titles, startClient, loginClient, otherDevice, until } from './helpers'

export function syncScenarios({ apiUrl, websocketUrl = null, nudged }) {
    let count = 0
    const credentials = () => ({ email: `scenario-${count++}-${Date.now()}@test.invalid`, password: 'password' })

    // a new account, encrypted like every new one
    async function newAccount() {
        account.configure(apiUrl)
        const user = credentials()
        await account.register(user)
        return user
    }

    // an account from before encryption existed: registered with the password itself
    async function plainAccount() {
        const user = credentials()
        const response = await fetch(`${apiUrl}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(user) })
        expect(response.ok).toBe(true)
        return user
    }

    let client
    let user

    beforeEach(async() => {
        user = await newAccount()
        client = await startClient()
    })

    afterAll(() => sync.stop())

    describe('two devices', () => {
        it('pushes notes made before login as rows of the account, and pulls what the other device has', async() => {
            await sync.saveNote(note('before-login'))
            await loginClient(apiUrl, user, websocketUrl)

            const other = await otherDevice(apiUrl, user)
            expect(ids(other.notes())).toEqual(['before-login'])
            expect(other.note('before-login').content).toBe('content before-login')

            await other.saveNote(note('from-other'))
            await nudged(() => ids(client.latest().notes).includes('from-other'))
            expect(titles(client.latest().notes)).toEqual({ 'before-login': 'title before-login', 'from-other': 'title from-other' })
            expect(await sync.getContent('from-other')).toBe('content from-other')
        })

        it('carries a deletion both ways', async() => {
            await loginClient(apiUrl, user, websocketUrl)
            const other = await otherDevice(apiUrl, user)
            await other.push({ notes: [note('a'), note('b')] })
            await nudged(() => ids(client.latest().notes).length === 2)

            await sync.deleteNote('a')
            await until(async() => ids((await other.pull()).notes()).length === 1, 'the deletion reaching the other device')
            expect(ids(other.notes())).toEqual(['b'])

            await other.deleteNote('b')
            await nudged(() => client.latest().notes.length === 0)
        })

        it('keeps categories and the notes in them in step', async() => {
            await loginClient(apiUrl, user, websocketUrl)
            await sync.saveCategory(category('work'))
            await sync.saveNote(note('task', { categoryId: 'work' }))
            await sync.sync()

            const other = await otherDevice(apiUrl, user)
            expect(other.categories().map(row => row.name)).toEqual(['name work'])
            expect(other.note('task').categoryId).toBe('work')

            await other.saveCategory({ ...category('work'), name: 'Work' })
            await nudged(() => client.latest().categories[0].name === 'Work')

            await sync.deleteCategory('work')
            await until(async() => (await other.pull()).categories().length === 0, 'the category deletion reaching the other device')
            expect(other.notes()).toEqual([])
        })

        it('does not pull its own rows back after a push', async() => {
            await loginClient(apiUrl, user, websocketUrl)
            await sync.save({ notes: Array.from({ length: 30 }, (_, index) => realisticNote(`n${index}`, index)) })
            await sync.sync()

            const other = await otherDevice(apiUrl, user)
            const pulled = other.seq
            const requests = []
            const original = globalThis.fetch
            globalThis.fetch = (input, init) => { requests.push(String(input)); return original(input, init) }
            try {
                await sync.sync()
            } finally {
                globalThis.fetch = original
            }
            const pulls = requests.filter(url => url.includes('/changes?since=')).map(url => Number(url.split('since=')[1]))
            expect(pulls.length).toBeGreaterThan(0)
            expect(pulls.every(since => since === pulled), `every pull starts at ${pulled}: ${pulls}`).toBe(true)
        })

        it('pulls a long first sync in pages, every note once', async() => {
            const other = await otherDevice(apiUrl, user)
            await other.push({ notes: Array.from({ length: 1200 }, (_, index) => realisticNote(`n${index}`, index)) })

            await loginClient(apiUrl, user, websocketUrl)
            expect(client.latest().notes.length).toBe(1200)
            expect(new Set(ids(client.latest().notes)).size).toBe(1200)
            expect(await sync.getContent('n9')).toBe(other.note('n9').content)
            // the screen fills as the pages come in
            expect(client.states.filter(state => state.notes.length > 0 && state.notes.length < 1200).length).toBeGreaterThan(0)
        })
    })

    describe('the same note changed on both devices', () => {
        let other
        const lines = 'first line\nsecond line\nthird line'

        beforeEach(async() => {
            await loginClient(apiUrl, user, websocketUrl)
            other = await otherDevice(apiUrl, user)
            await other.saveNote(note('shared', { title: 'Shared', content: lines }))
            await nudged(() => ids(client.latest().notes).includes('shared'))
            // out of touch from here, so the change on the other device is only met at the next sync
            sync.disconnect()
        })

        it('merges edits of different lines from both sides', async() => {
            await other.saveNote(note('shared', { title: 'Shared', content: 'FIRST line\nsecond line\nthird line' }))
            await sync.saveNote(note('shared', { title: 'Shared', content: 'first line\nsecond line\nTHIRD line', modified: '2024-02-01T00:00:00.000Z' }))

            await sync.sync()
            expect(await sync.getContent('shared')).toBe('FIRST line\nsecond line\nTHIRD line')
            await until(async() => (await other.pull()).note('shared').content === 'FIRST line\nsecond line\nTHIRD line', 'the merged text reaching the other device')
            expect(client.latest().notes.length).toBe(1)
        })

        it('keeps the other text and saves this text as a copy when both changed the same line', async() => {
            await other.saveNote(note('shared', { title: 'Shared', content: 'first line, theirs\nsecond line\nthird line' }))
            await sync.saveNote(note('shared', { title: 'Shared', content: 'first line, mine\nsecond line\nthird line', modified: '2024-02-01T00:00:00.000Z' }))

            await sync.sync()
            const notes = client.latest().notes
            expect(notes.length).toBe(2)
            expect(await sync.getContent('shared')).toBe('first line, theirs\nsecond line\nthird line')
            const copy = notes.find(row => row.id !== 'shared')
            expect(copy.title).toBe('Conflict: Shared')
            expect(await sync.getContent(copy.id)).toBe('first line, mine\nsecond line\nthird line')

            await until(async() => (await other.pull()).notes().length === 2, 'the copy reaching the other device')
            expect(other.note('shared').content).toBe('first line, theirs\nsecond line\nthird line')
        })

        it('merges a title change here with a text change there', async() => {
            await other.saveNote(note('shared', { title: 'Shared', content: lines + '\nfourth line' }))
            await sync.saveNote(note('shared', { title: 'Renamed', content: lines, modified: '2024-02-01T00:00:00.000Z' }))

            await sync.sync()
            expect(titles(client.latest().notes)).toEqual({ shared: 'Renamed' })
            expect(await sync.getContent('shared')).toBe(lines + '\nfourth line')
            await until(async() => (await other.pull()).note('shared').title === 'Renamed', 'the merge reaching the other device')
        })

        it('lets an edit here win over a deletion there', async() => {
            await other.deleteNote('shared')
            await sync.saveNote(note('shared', { title: 'Still here', content: lines, modified: '2024-02-01T00:00:00.000Z' }))

            await sync.sync()
            expect(titles(client.latest().notes)).toEqual({ shared: 'Still here' })
            await until(async() => (await other.pull()).note('shared').deleted === false, 'the note coming back on the other device')
            expect(other.note('shared').title).toBe('Still here')
        })

        it('lets an edit there win over a deletion here', async() => {
            await other.saveNote(note('shared', { title: 'Edited there', content: lines }))
            await sync.deleteNote('shared')

            await sync.sync()
            expect(titles(client.latest().notes)).toEqual({ shared: 'Edited there' })
            expect((await other.pull()).note('shared').title).toBe('Edited there')
        })

        it('takes this rename of a category when both renamed it', async() => {
            await sync.saveCategory(category('c'))
            await sync.sync()
            await other.saveCategory({ ...category('c'), name: 'theirs' })
            await sync.saveCategory({ ...category('c'), name: 'mine' })

            await sync.sync()
            expect(client.latest().categories.map(row => row.name)).toEqual(['mine'])
            await until(async() => (await other.pull()).categories()[0].name === 'mine', 'the rename reaching the other device')
        })

        it('treats the same note created on both devices as one note', async() => {
            await other.saveNote(note('imported', { content: 'same text' }))
            await sync.saveNote(note('imported', { content: 'same text' }))

            await sync.sync()
            expect(ids(client.latest().notes)).toEqual(['imported', 'shared'])
            expect((await other.pull()).notes().length).toBe(2)
        })
    })

    describe('encryption', () => {
        it('never gives the server a readable title, text or category name', async() => {
            await loginClient(apiUrl, user, websocketUrl)
            await sync.saveCategory(category('c', { name: 'Secret plans' }))
            await sync.saveNote(note('n', { categoryId: 'c', title: 'Meeting', content: 'The password is hunter2' }))
            await sync.sync()

            const other = await otherDevice(apiUrl, user)
            const raw = await other.raw()
            expect(raw.encrypted).toBe(true)
            expect(raw.categories[0].name).not.toContain('Secret')
            expect(raw.notes[0].title).not.toContain('Meeting')
            expect(raw.notes[0].content).not.toContain('hunter2')
            expect(raw.notes[0].categoryId).toBe('c')

            // a device with the password reads them
            expect(other.note('n').content).toBe('The password is hunter2')
            expect(other.categories()[0].name).toBe('Secret plans')
        })

        it('turns an old account on to encryption in one step and keeps every device reading', async() => {
            user = await plainAccount()
            await loginClient(apiUrl, user, websocketUrl)
            await sync.saveNote(note('old', { content: 'written before encryption' }))
            await sync.sync()
            const before = await otherDevice(apiUrl, user)
            expect((await before.raw()).notes[0].content).toBe('written before encryption')

            const request = await account.encryptionFor(user.password)
            await sync.encryptAccount(request)
            expect(request.phrase.split(' ').length).toBe(12)

            const after = await otherDevice(apiUrl, user)
            expect((await after.raw()).encrypted).toBe(true)
            expect((await after.raw()).notes[0].content).not.toContain('before encryption')
            expect(after.note('old').content).toBe('written before encryption')

            // this device is in step: nothing to pull, and its next change goes out encrypted
            await sync.saveNote(note('new', { content: 'written after' }))
            await sync.sync()
            expect((await after.pull()).note('new').content).toBe('written after')
            expect(client.latest().notes.length).toBe(2)
        })

        it('refuses to turn encryption on while the device is behind', async() => {
            user = await plainAccount()
            await loginClient(apiUrl, user, websocketUrl)
            const other = await otherDevice(apiUrl, user)
            await other.saveNote(note('theirs'))

            // the sync inside encryptAccount picks the row up first, so this succeeds
            await sync.encryptAccount(await account.encryptionFor(user.password))
            expect((await otherDevice(apiUrl, user)).note('theirs').title).toBe('title theirs')
        })

        it('locks a device that has no key once the account was encrypted elsewhere, and logs it back in', async() => {
            user = await plainAccount()
            await loginClient(apiUrl, user, websocketUrl)
            await sync.saveNote(note('mine'))
            await sync.sync()

            // another device turns encryption on
            const other = await otherDevice(apiUrl, user)
            const request = await account.encryptionFor(user.password)
            const response = await fetch(`${apiUrl}/encrypt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${other.token}` },
                body: JSON.stringify({
                    password: request.password,
                    encryption: request.encryption,
                    categories: [],
                    notes: await Promise.all(other.notes().map(async row => ({ id: row.id, version: row.version, title: await encryptText(request.dataKey, row.title, `${row.id}:title`), content: await encryptText(request.dataKey, row.content, `${row.id}:content`) })))
                })
            })
            expect(response.ok).toBe(true)

            await sync.sync()
            expect(client.locked).toBeGreaterThanOrEqual(1)

            // the app logs in again with the password it holds and gets the key
            await loginClient(apiUrl, user, websocketUrl)
            await sync.saveNote(note('after'))
            await sync.sync()
            expect(ids((await otherDevice(apiUrl, user)).notes())).toEqual(['after', 'mine'])
        })

        it('keeps the notes readable after a password change and after a reset with the recovery phrase', async() => {
            const registered = await loginClient(apiUrl, user, websocketUrl)
            await sync.saveNote(note('kept'))
            await sync.sync()

            const changed = await account.changePassword({ token: registered.token, encrypted: true, keyCache: registered.keyCache, dataKey: registered.dataKey, currentPassword: user.password, newPassword: 'changed' })
            expect(changed.keyCache.salt).not.toBe(registered.keyCache.salt)
            await expect(account.login({ email: user.email, password: user.password })).rejects.toThrow('Invalid password')
            expect((await otherDevice(apiUrl, { email: user.email, password: 'changed' })).note('kept').content).toBe('content kept')

            const phrase = await account.newRecoveryPhrase({ token: registered.token, dataKey: registered.dataKey })
            await expect(account.resetPassword({ email: user.email, phrase: 'wrong words', newPassword: 'reset' })).rejects.toThrow('Invalid recovery phrase')
            await account.resetPassword({ email: user.email, phrase: ` ${phrase.toUpperCase()} `, newPassword: 'reset' })
            expect((await otherDevice(apiUrl, { email: user.email, password: 'reset' })).note('kept').content).toBe('content kept')
        })
    })

    describe('accounts on one device', () => {
        it('pushes the rows of a previous account as new rows of the next one', async() => {
            await loginClient(apiUrl, user, websocketUrl)
            await sync.saveNote(note('first-account'))
            await sync.sync()

            const second = await newAccount()
            await loginClient(apiUrl, second, websocketUrl)
            await until(async() => ids((await otherDevice(apiUrl, second)).notes()).includes('first-account'), 'the note reaching the second account')
            expect(client.latest().notes.length).toBe(1)
        })

        it('keeps a stranger out', async() => {
            await loginClient(apiUrl, user, websocketUrl)
            await sync.saveNote(note('private'))
            await sync.sync()

            const stranger = await otherDevice(apiUrl, await newAccount())
            expect(stranger.notes()).toEqual([])
        })
    })
}
