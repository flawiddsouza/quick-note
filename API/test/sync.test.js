import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pull, push, encrypt, validateRows, validateEncryptedRows, shutdown } from '../sync.js'
import { findUserById } from '../db.js'
import { createTestUser, deleteTestUser, category, note } from './helpers.js'
import sql from '../sql.js'

let userId

beforeAll(async() => {
    userId = await createTestUser('sync')
})

afterAll(async() => {
    shutdown()
    await deleteTestUser(userId)
    await sql.end()
})

const ids = rows => rows.map(row => row.id)

describe('push and pull', () => {
    it('starts empty at seq 0', async() => {
        expect(await pull(userId, 0)).toEqual({ seq: 0, more: false, encrypted: false, categories: [], notes: [] })
    })

    it('accepts new rows at version 0 and numbers each write', async() => {
        const result = await push(userId, { categories: [category('c1')], notes: [note('n1'), note('n2')] })

        expect(result.seq).toBe(3)
        expect(result.accepted).toEqual({ categories: [{ id: 'c1', version: 1, seq: 1 }], notes: [{ id: 'n1', version: 1, seq: 2 }, { id: 'n2', version: 1, seq: 3 }] })
        expect(result.rejected).toEqual({ categories: [], notes: [] })

        const pulled = await pull(userId, 0)
        expect(pulled.seq).toBe(3)
        expect(pulled.categories).toEqual([{ ...category('c1'), version: 1, seq: 1 }])
        expect(pulled.notes).toEqual([{ ...note('n1'), version: 1, seq: 2 }, { ...note('n2'), version: 1, seq: 3 }])
    })

    it('returns only rows written after since', async() => {
        const pulled = await pull(userId, 2)
        expect(ids(pulled.categories)).toEqual([])
        expect(ids(pulled.notes)).toEqual(['n2'])
        expect((await pull(userId, 3)).notes).toEqual([])
    })

    it('accepts an edit based on the current version and moves the row to the end', async() => {
        const result = await push(userId, { notes: [note('n1', { title: 'edited', version: 1 })] })
        expect(result.accepted.notes).toEqual([{ id: 'n1', version: 2, seq: 4 }])

        const pulled = await pull(userId, 3)
        expect(pulled.notes).toEqual([{ ...note('n1'), title: 'edited', version: 2, seq: 4 }])
    })

    it('rejects an edit based on an old version and hands back the current row', async() => {
        const result = await push(userId, { notes: [note('n1', { title: 'stale', version: 1 })] })
        expect(result.accepted.notes).toEqual([])
        expect(result.rejected.notes).toEqual([{ ...note('n1'), title: 'edited', version: 2, seq: 4 }])
        expect(result.seq).toBe(4)
        expect((await pull(userId, 4)).notes).toEqual([])
    })

    it('answers a row it never had, pushed as if it had, with an empty tombstone to build on', async() => {
        const result = await push(userId, { notes: [note('never', { version: 3 })], categories: [category('never', { version: 1 })] })
        expect(result.rejected.notes).toEqual([{ id: 'never', categoryId: null, title: '', content: '', created: '', modified: '', version: 0, seq: 0, deleted: true }])
        expect(result.rejected.categories[0]).toMatchObject({ id: 'never', version: 0, deleted: true })
        expect(result.seq).toBe(4)
    })

    it('rejects a second creation of an id the server already has', async() => {
        const result = await push(userId, { notes: [note('n1')] })
        expect(result.rejected.notes[0]).toMatchObject({ id: 'n1', version: 2 })
    })

    it('keeps a deleted row as a tombstone that later pulls see', async() => {
        const result = await push(userId, { notes: [note('n2', { title: '', content: '', version: 1, deleted: true })] })
        expect(result.accepted.notes).toEqual([{ id: 'n2', version: 2, seq: 5 }])

        const pulled = await pull(userId, 4)
        expect(pulled.notes).toEqual([{ ...note('n2'), title: '', content: '', version: 2, seq: 5, deleted: true }])
    })

    it('rejects an edit of a row that was deleted meanwhile with the tombstone', async() => {
        const result = await push(userId, { notes: [note('n2', { title: 'still typing', version: 1 })] })
        expect(result.rejected.notes[0]).toMatchObject({ id: 'n2', deleted: true, version: 2 })

        // the device brings it back by building on the tombstone
        const again = await push(userId, { notes: [note('n2', { title: 'still typing', version: 2 })] })
        expect(again.accepted.notes).toEqual([{ id: 'n2', version: 3, seq: 6 }])
        expect((await pull(userId, 5)).notes[0]).toMatchObject({ id: 'n2', title: 'still typing', deleted: false })
    })

    it('handles accepted and rejected rows in one push', async() => {
        const result = await push(userId, { categories: [category('c1', { name: 'renamed', version: 1 }), category('c2')], notes: [note('n1', { version: 0 })] })
        expect(ids(result.accepted.categories)).toEqual(['c1', 'c2'])
        expect(ids(result.rejected.notes)).toEqual(['n1'])
        expect(result.seq).toBe(8)
    })

    it('gives two pushes at the same moment their own seq numbers', async() => {
        const rows = Array.from({ length: 20 }, (_, index) => note(`burst-${index}`))
        const [a, b] = await Promise.all([
            push(userId, { notes: rows.slice(0, 10) }),
            push(userId, { notes: rows.slice(10) })
        ])
        const seqs = [...a.accepted.notes, ...b.accepted.notes].map(row => row.seq).sort((x, y) => x - y)
        expect(seqs).toEqual(Array.from({ length: 20 }, (_, index) => 9 + index))
        expect(Math.max(a.seq, b.seq)).toBe(28)
    })

    it('pages a long pull and says where to continue', async() => {
        const first = await pull(userId, 0, 10)
        expect(first.more).toBe(true)
        expect(first.notes.length).toBe(10)
        expect(first.seq).toBe(first.notes[9].seq)
        // categories beyond the page come with the next page instead
        expect(first.categories.every(row => row.seq <= first.seq)).toBe(true)

        const seen = [...first.notes]
        let { seq, more } = first
        while(more) {
            const page = await pull(userId, seq, 10)
            seen.push(...page.notes)
            ;({ seq, more } = page)
        }
        expect(seq).toBe(28)
        expect(new Set(ids(seen)).size).toBe(22)
    })
})

describe('validateRows', () => {
    it('accepts the wire shape and refuses anything else', () => {
        expect(validateRows({ categories: [category('c')], notes: [note('n'), note('m', { categoryId: 'c' })] })).toBe(true)
        expect(validateRows({})).toBe(true)
        expect(validateRows({ notes: [note('n', { version: -1 })] })).toBe(false)
        expect(validateRows({ notes: [note('n', { version: '1' })] })).toBe(false)
        expect(validateRows({ notes: [note('n', { deleted: 'yes' })] })).toBe(false)
        expect(validateRows({ notes: [note('n', { title: null })] })).toBe(false)
        expect(validateRows({ notes: [note('n', { categoryId: 5 })] })).toBe(false)
        expect(validateRows({ notes: [note('')] })).toBe(false)
        expect(validateRows({ notes: 'n' })).toBe(false)
        expect(validateRows({ categories: [{ id: 'c' }] })).toBe(false)
    })

    it('accepts only the encrypted fields with id and version for the switch to encryption', () => {
        expect(validateEncryptedRows({ categories: [{ id: 'c', version: 1, name: 'x' }], notes: [{ id: 'n', version: 2, title: 'x', content: 'y' }] })).toBe(true)
        expect(validateEncryptedRows({ notes: [{ id: 'n', version: 2, title: 'x' }] })).toBe(false)
        expect(validateEncryptedRows({ notes: [{ id: 'n', version: -1, title: 'x', content: 'y' }] })).toBe(false)
        expect(validateEncryptedRows({ categories: [{ id: 'c', version: 1 }] })).toBe(false)
    })
})

describe('encrypt', () => {
    const encryption = { salt: 's', wrappedKey: 'w', recoverySalt: 'rs', recoveryWrappedKey: 'rw', recoveryPassword: 'rp' }
    let encryptedUserId

    beforeAll(async() => {
        encryptedUserId = await createTestUser('sync-encrypt')
        await push(encryptedUserId, { categories: [category('c1')], notes: [note('n1'), note('n2'), note('gone')] })
        await push(encryptedUserId, { notes: [note('gone', { title: '', content: '', version: 1, deleted: true })] })
    })

    afterAll(() => deleteTestUser(encryptedUserId))

    const live = async() => {
        const { categories, notes } = await pull(encryptedUserId, 0)
        return { categories: categories.filter(row => !row.deleted), notes: notes.filter(row => !row.deleted) }
    }

    it('refuses when the device does not hold every live row at its current version', async() => {
        const { categories, notes } = await live()
        await expect(encrypt(encryptedUserId, { password: 'p', encryption, categories, notes: notes.slice(1) })).rejects.toThrow('Out of date')
        await expect(encrypt(encryptedUserId, { password: 'p', encryption, categories, notes: notes.map(row => ({ ...row, version: 0 })) })).rejects.toThrow('Out of date')
        expect((await findUserById(encryptedUserId)).encrypted).toBe(false)
        expect((await live()).notes[0].title).toBe('title n1')
    })

    it('replaces every live row with its encrypted form and turns the account on in one step', async() => {
        const { categories, notes } = await live()
        const before = (await pull(encryptedUserId, 0)).seq
        const result = await encrypt(encryptedUserId, {
            password: 'hashed-auth-key',
            encryption,
            categories: categories.map(row => ({ ...row, name: `enc:${row.name}` })),
            notes: notes.map(row => ({ ...row, title: `enc:${row.title}`, content: `enc:${row.content}` }))
        })
        expect(result.seq).toBe(before + 3)

        const user = await findUserById(encryptedUserId)
        expect(user.encrypted).toBe(true)
        expect(user.password).toBe('hashed-auth-key')
        expect(user.salt).toBe('s')
        expect(user.recovery_password).toBe('rp')

        // every live row is a new version, so other devices pull it again
        const pulled = await pull(encryptedUserId, before)
        expect(pulled.encrypted).toBe(true)
        expect(pulled.categories).toEqual([expect.objectContaining({ id: 'c1', name: 'enc:name c1', version: 2 })])
        expect(pulled.notes.map(row => [row.id, row.title, row.version])).toEqual([['n1', 'enc:title n1', 2], ['n2', 'enc:title n2', 2]])
    })

    it('cannot be done twice', async() => {
        const { categories, notes } = await live()
        await expect(encrypt(encryptedUserId, { password: 'p', encryption, categories, notes })).rejects.toThrow('Already encrypted')
    })
})
