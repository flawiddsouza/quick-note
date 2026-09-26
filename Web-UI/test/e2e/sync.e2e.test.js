// The app's sync module against the real API in Docker (see setup.js): the same scenarios
// as against the in-memory server, plus the websocket, which tells the app to pull.
import { describe, it, expect, beforeEach, inject } from 'vitest'
import * as sync from '../../src/sync'
import * as account from '../../src/account'
import { note, ids, startClient, loginClient, otherDevice, until } from '../helpers'
import { syncScenarios } from '../scenarios'

const apiUrl = inject('apiUrl')
const websocketUrl = inject('websocketUrl')

// the websocket is the nudge here, so the app is expected to notice on its own
syncScenarios({ apiUrl, websocketUrl, nudged: condition => until(condition) })

describe('the websocket', () => {
    let client
    let user

    beforeEach(async() => {
        account.configure(apiUrl)
        user = { email: `websocket-${Date.now()}@test.invalid`, password: 'password' }
        await account.register(user)
        client = await startClient()
    })

    it('reports the connection and pulls on a nudge from the server', async() => {
        const { token } = await loginClient(apiUrl, user)
        sync.connect(`${websocketUrl}?token=${token}`)
        await until(() => client.connections.at(-1) === true, 'the connection')

        const other = await otherDevice(apiUrl, user)
        await other.saveNote(note('pushed-elsewhere'))
        await until(() => ids(client.latest().notes).includes('pushed-elsewhere'), 'the nudge to bring the note in')

        sync.disconnect()
        expect(client.connections.at(-1)).toBe(false)
    })

    it('pushes what was written while disconnected once it connects again', async() => {
        const { token } = await loginClient(apiUrl, user)
        const other = await otherDevice(apiUrl, user)

        await sync.saveNote(note('while-away'))
        await other.saveNote(note('meanwhile'))
        sync.connect(`${websocketUrl}?token=${token}`)
        await until(() => ids(client.latest().notes).length === 2, 'both notes on the app')
        await until(async() => ids((await other.pull()).notes()).length === 2, 'both notes on the other device')
        sync.disconnect()
    })

    it('refuses a bad token', async() => {
        sync.connect(`${websocketUrl}?token=nope`)
        await until(() => client.connections.length > 0 && client.connections.at(-1) === false, 'the refusal')
        sync.disconnect()
    })
})
