// The HTTP API and the websocket as a device uses them, on a real server.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import WebSocket from 'ws'
import { findUserByEmail } from '../db.js'
import { shutdown } from '../sync.js'
import { startServer, note, category, until } from './helpers.js'
import sql from '../sql.js'

let server
let emails = []
let sockets = []

const email = label => {
    const address = `routes-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.invalid`
    emails.push(address)
    return address
}

async function call(path, { token, ...body } = {}, method = 'POST') {
    const response = await fetch(`${server.url}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: method === 'GET' ? undefined : JSON.stringify(body)
    })
    const text = await response.text()
    return { status: response.status, body: response.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text }
}

function listen(token) {
    const ws = new WebSocket(`${server.websocketUrl}?token=${token}`)
    const messages = []
    ws.on('message', data => messages.push(JSON.parse(data)))
    sockets.push(ws)
    return new Promise((resolve, reject) => {
        ws.on('open', () => resolve(messages))
        ws.on('error', reject)
    })
}

const encryption = { salt: 'salt', wrappedKey: 'wrapped', recoverySalt: 'recovery-salt', recoveryWrappedKey: 'recovery-wrapped', recoveryPassword: 'recovery-auth' }

beforeAll(async() => {
    server = await startServer()
})

afterAll(async() => {
    for(const ws of sockets) {
        ws.terminate()
    }
    shutdown()
    await server.close()
    for(const address of emails) {
        await sql`delete from users where email = ${address}`
    }
    await sql.end()
})

describe('accounts without encryption', () => {
    const address = email('plain')
    let token

    it('registers and logs in with the password itself', async() => {
        const registered = await call('/register', { email: address, password: 'password' })
        expect(registered.status).toBe(200)
        expect(registered.body).toMatchObject({ encrypted: false, wrappedKey: null })

        expect((await call('/salt', { email: address })).body).toEqual({ encrypted: false, salt: null })

        const login = await call('/login', { email: address, password: 'password' })
        expect(login.status).toBe(200)
        expect(login.body).toMatchObject({ encrypted: false, wrappedKey: null })
        token = login.body.token

        expect((await call('/login', { email: address, password: 'wrong' })).status).toBe(400)
        expect((await call('/register', { email: address, password: 'password' })).body).toBe('Email already registered')
    })

    it('changes the password', async() => {
        expect((await call('/change-password', { token, currentPassword: 'wrong', newPassword: 'new' })).status).toBe(400)
        expect((await call('/change-password', { token, currentPassword: 'password', newPassword: 'new' })).status).toBe(200)
        expect((await call('/login', { email: address, password: 'new' })).status).toBe(200)
    })

    it('has no recovery phrase and cannot be given one', async() => {
        expect((await call('/recovery', { email: address })).status).toBe(400)
        expect((await call('/recovery-phrase', { token, recoverySalt: 'rs', recoveryWrappedKey: 'rw', recoveryPassword: 'ra' })).status).toBe(400)
    })
})

describe('accounts with encryption', () => {
    const address = email('encrypted')
    let token

    it('registers with the derived key and the wrapped data key, and hands the wrapped key back at login', async() => {
        expect((await call('/register', { email: address, password: 'auth-key', encryption: { salt: 'only' } })).status).toBe(400)

        const registered = await call('/register', { email: address, password: 'auth-key', encryption })
        expect(registered.status).toBe(200)
        expect(registered.body).toMatchObject({ encrypted: true, wrappedKey: 'wrapped' })

        expect((await call('/salt', { email: address })).body).toEqual({ encrypted: true, salt: 'salt' })

        const login = await call('/login', { email: address, password: 'auth-key' })
        expect(login.body).toMatchObject({ encrypted: true, wrappedKey: 'wrapped' })
        token = login.body.token

        // the server holds hashes, never the keys themselves
        const user = await findUserByEmail(address)
        expect(user.password).not.toBe('auth-key')
        expect(user.recovery_password).not.toBe('recovery-auth')
    })

    it('changes the password only together with the key wrapped under the new one', async() => {
        expect((await call('/change-password', { token, currentPassword: 'auth-key', newPassword: 'auth-key-2' })).status).toBe(400)
        expect((await call('/change-password', { token, currentPassword: 'auth-key', newPassword: 'auth-key-2', encryption: { salt: 'salt-2', wrappedKey: 'wrapped-2' } })).status).toBe(200)

        expect((await call('/salt', { email: address })).body).toEqual({ encrypted: true, salt: 'salt-2' })
        expect((await call('/login', { email: address, password: 'auth-key-2' })).body).toMatchObject({ wrappedKey: 'wrapped-2' })
    })

    it('resets a forgotten password with the recovery phrase', async() => {
        expect((await call('/recovery', { email: address })).body).toEqual({ recoverySalt: 'recovery-salt', recoveryWrappedKey: 'recovery-wrapped' })

        const wrong = await call('/reset-password', { email: address, recoveryPassword: 'wrong', password: 'auth-key-3', encryption: { salt: 'salt-3', wrappedKey: 'wrapped-3' } })
        expect(wrong.status).toBe(400)
        expect((await call('/login', { email: address, password: 'auth-key-2' })).status).toBe(200)

        const reset = await call('/reset-password', { email: address, recoveryPassword: 'recovery-auth', password: 'auth-key-3', encryption: { salt: 'salt-3', wrappedKey: 'wrapped-3' } })
        expect(reset.status).toBe(200)
        expect((await call('/login', { email: address, password: 'auth-key-3' })).body).toMatchObject({ wrappedKey: 'wrapped-3' })
        // the phrase stays valid
        expect((await call('/recovery', { email: address })).body.recoverySalt).toBe('recovery-salt')
    })

    it('replaces the recovery phrase', async() => {
        expect((await call('/recovery-phrase', { token, recoverySalt: 'rs-2', recoveryWrappedKey: 'rw-2', recoveryPassword: 'ra-2' })).status).toBe(200)
        expect((await call('/recovery', { email: address })).body).toEqual({ recoverySalt: 'rs-2', recoveryWrappedKey: 'rw-2' })
        expect((await call('/reset-password', { email: address, recoveryPassword: 'recovery-auth', password: 'x', encryption: { salt: 's', wrappedKey: 'w' } })).status).toBe(400)
        expect((await call('/reset-password', { email: address, recoveryPassword: 'ra-2', password: 'auth-key-4', encryption: { salt: 's4', wrappedKey: 'w4' } })).status).toBe(200)
    })
})

describe('changes', () => {
    let token
    let messages

    beforeAll(async() => {
        ;({ body: { token } } = await call('/register', { email: email('changes'), password: 'password' }))
        messages = await listen(token)
    })

    it('needs a token', async() => {
        expect((await call('/changes?since=0', {}, 'GET')).status).toBe(401)
        expect((await call('/changes', { notes: [] })).status).toBe(401)
    })

    it('pushes, pulls and nudges the websocket with the new seq', async() => {
        const pushed = await call('/changes', { token, categories: [category('c1')], notes: [note('n1')] })
        expect(pushed.status).toBe(200)
        expect(pushed.body.accepted.notes).toEqual([{ id: 'n1', version: 1, seq: 2 }])

        await until(() => messages.length > 0, 'the websocket nudge')
        expect(messages).toEqual([{ seq: 2 }])

        const pulled = await call('/changes?since=0', { token }, 'GET')
        expect(pulled.body).toMatchObject({ seq: 2, more: false, encrypted: false })
        expect(pulled.body.notes[0]).toMatchObject({ id: 'n1', version: 1 })
        expect((await call('/changes?since=2', { token }, 'GET')).body.notes).toEqual([])
    })

    it('refuses rows in the wrong shape and a bad since', async() => {
        expect((await call('/changes', { token, notes: [{ id: 'x' }] })).status).toBe(400)
        expect((await call('/changes?since=-1', { token }, 'GET')).status).toBe(400)
        expect((await call('/changes?since=abc', { token }, 'GET')).status).toBe(400)
    })

    it('turns an account on to encryption, refusing while the device is behind', async() => {
        const rows = { categories: [category('c1', { name: 'enc', version: 1 })], notes: [note('n1', { title: 'enc', content: 'enc', version: 1 })] }
        const behind = await call('/encrypt', { token, password: 'auth-key', encryption, categories: rows.categories, notes: [] })
        expect(behind.status).toBe(409)

        const done = await call('/encrypt', { token, password: 'auth-key', encryption, ...rows })
        expect(done.status).toBe(200)
        expect(done.body).toEqual({ seq: 4 })
        await until(() => messages.some(message => message.seq === 4), 'the nudge for the rewrite')

        expect((await call('/login', { email: emails.at(-1), password: 'auth-key' })).body).toMatchObject({ encrypted: true, wrappedKey: 'wrapped' })
        expect((await call('/login', { email: emails.at(-1), password: 'password' })).status).toBe(400)
        const pulled = await call('/changes?since=2', { token }, 'GET')
        expect(pulled.body.encrypted).toBe(true)
        expect(pulled.body.notes[0]).toMatchObject({ id: 'n1', title: 'enc', version: 2 })
    })

    it('rejects a websocket without a valid token', async() => {
        const ws = new WebSocket(`${server.websocketUrl}?token=nope`)
        sockets.push(ws)
        await new Promise(resolve => ws.on('error', resolve))
    })
})
