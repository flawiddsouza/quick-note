import { describe, it, expect, afterAll } from 'vitest'
import { importLegacyDocument } from '../migrate.js'
import { pull, push, shutdown } from '../sync.js'
import { findUserById } from '../db.js'
import { createTestUser, deleteTestUser, seedLegacyDocument, note } from './helpers.js'
import { legacyDocumentBytes, legacyDocumentContents } from './fixtures/legacy-document.js'
import sql from '../sql.js'

let userIds = []

async function user(label, seed = true) {
    const id = await createTestUser(label)
    userIds.push(id)
    if(seed) {
        await seedLegacyDocument(id, legacyDocumentBytes)
    }
    return findUserById(id)
}

afterAll(async() => {
    shutdown()
    for(const id of userIds) {
        await deleteTestUser(id)
    }
    await sql.end()
})

const plain = rows => rows.map(({ version, seq, deleted, ...row }) => row)

describe('importLegacyDocument', () => {
    it('copies the old document into rows, unencrypted, and marks the user', async() => {
        const legacyUser = await user('migrate')
        expect(await importLegacyDocument(legacyUser)).toEqual({ status: 'imported', notes: 2, categories: 1 })

        const pulled = await pull(legacyUser.id, 0)
        expect(pulled.encrypted).toBe(false)
        expect(plain(pulled.categories)).toEqual(legacyDocumentContents.categories)
        expect(plain(pulled.notes)).toEqual(legacyDocumentContents.notes)
        expect(pulled.notes.every(row => row.version === 1 && !row.deleted)).toBe(true)
        expect((await findUserById(legacyUser.id)).legacy_imported).toBe(true)
    })

    it('skips a user already imported, so the script can be rerun', async() => {
        const legacyUser = await user('migrate-rerun')
        await importLegacyDocument(legacyUser)
        expect(await importLegacyDocument(await findUserById(legacyUser.id))).toEqual({ status: 'already imported' })
        expect((await pull(legacyUser.id, 0)).notes.length).toBe(2)
    })

    it('marks a user without an old document as done', async() => {
        const newUser = await user('migrate-empty', false)
        expect(await importLegacyDocument(newUser)).toEqual({ status: 'nothing to import' })
        expect((await findUserById(newUser.id)).legacy_imported).toBe(true)
    })

    it('leaves a user alone whose rows already exist', async() => {
        const legacyUser = await user('migrate-rows')
        await push(legacyUser.id, { notes: [note(legacyDocumentContents.notes[0].id, { title: 'kept' })] })
        expect(await importLegacyDocument(legacyUser)).toEqual({ status: 'rows already present, not imported' })
        expect((await findUserById(legacyUser.id)).legacy_imported).toBe(false)
        expect((await pull(legacyUser.id, 0)).notes.find(row => row.title === 'kept')).toBeDefined()
    })
})
