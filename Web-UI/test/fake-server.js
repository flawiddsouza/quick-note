// An in-memory stand-in for the API with the rules of API/sync.js and API/routes.js, reached
// through fetch, so the sync module can be tested without Docker. The end-to-end suite runs
// the same scenarios against the real server (test/scenarios.js).
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const text = (status, body) => new Response(body, { status, headers: { 'content-type': 'text/plain' } })

const fail = (message, status = 400) => {
    const error = new Error(message)
    error.status = status
    throw error
}

export class FakeServer {
    constructor({ url = 'http://fake.test', pageSize = 500 } = {}) {
        this.url = url
        this.pageSize = pageSize
        this.users = new Map()
        this.tokens = new Map()
        this.requests = []
        this.delay = () => Promise.resolve()
    }

    install() {
        const original = globalThis.fetch
        this.uninstall = () => { globalThis.fetch = original }
        globalThis.fetch = async(input, init = {}) => {
            const url = String(input)
            if(!url.startsWith(this.url)) {
                return original(input, init)
            }
            return this.handle(url.slice(this.url.length), init)
        }
    }

    async handle(path, init) {
        const [pathname, query = ''] = path.split('?')
        const method = init.method ?? 'GET'
        const body = init.body ? JSON.parse(init.body) : {}
        this.requests.push({ method, pathname, body })
        await this.delay(pathname, method)

        try {
            const token = init.headers?.Authorization?.slice(7)
            const result = this.route(method, pathname, new URLSearchParams(query), body, token)
            return typeof result === 'string' ? text(200, result) : json(200, result)
        } catch(e) {
            return text(e.status ?? 400, e.message)
        }
    }

    userOf(token) {
        return this.tokens.get(token) ?? fail('Invalid bearer token provided', 401)
    }

    userByEmail(email) {
        return this.users.get(email) ?? fail('User not found')
    }

    login(user) {
        const token = `token-${user.email}-${this.tokens.size}`
        this.tokens.set(token, user)
        return { token, encrypted: user.encrypted, wrappedKey: user.encryption?.wrappedKey ?? null }
    }

    route(method, path, query, body, token) {
        if(method === 'POST' && path === '/register') {
            if(this.users.has(body.email)) {
                fail('Email already registered')
            }
            const user = { email: body.email, password: body.password, encrypted: Boolean(body.encryption), encryption: body.encryption ?? null, seq: 0, categories: new Map(), notes: new Map() }
            this.users.set(body.email, user)
            return this.login(user)
        }

        if(method === 'POST' && path === '/salt') {
            const user = this.userByEmail(body.email)
            return { encrypted: user.encrypted, salt: user.encryption?.salt ?? null }
        }

        if(method === 'POST' && path === '/login') {
            const user = this.userByEmail(body.email)
            return user.password === body.password ? this.login(user) : fail('Invalid password')
        }

        if(method === 'POST' && path === '/change-password') {
            const user = this.userOf(token)
            if(user.password !== body.currentPassword) {
                fail('Invalid current password')
            }
            if(user.encrypted && !body.encryption) {
                fail('encryption field is required')
            }
            user.password = body.newPassword
            if(user.encrypted) {
                user.encryption = { ...user.encryption, ...body.encryption }
            }
            return 'Password changed'
        }

        if(method === 'POST' && path === '/recovery') {
            const user = this.userByEmail(body.email)
            if(!user.encrypted) {
                fail('Account has no recovery phrase')
            }
            return { recoverySalt: user.encryption.recoverySalt, recoveryWrappedKey: user.encryption.recoveryWrappedKey }
        }

        if(method === 'POST' && path === '/reset-password') {
            const user = this.userByEmail(body.email)
            if(!user.encrypted || user.encryption.recoveryPassword !== body.recoveryPassword) {
                fail('Invalid recovery phrase')
            }
            user.password = body.password
            user.encryption = { ...user.encryption, ...body.encryption }
            return 'Password reset'
        }

        if(method === 'POST' && path === '/recovery-phrase') {
            const user = this.userOf(token)
            if(!user.encrypted) {
                fail('Account is not encrypted')
            }
            user.encryption = { ...user.encryption, recoverySalt: body.recoverySalt, recoveryWrappedKey: body.recoveryWrappedKey, recoveryPassword: body.recoveryPassword }
            return 'Recovery phrase set'
        }

        if(method === 'GET' && path === '/changes') {
            return this.pull(this.userOf(token), Number(query.get('since') ?? 0))
        }

        if(method === 'POST' && path === '/changes') {
            return this.push(this.userOf(token), body)
        }

        if(method === 'POST' && path === '/encrypt') {
            return this.encrypt(this.userOf(token), body)
        }

        fail('Not found', 404)
    }

    pull(user, since) {
        const after = rows => [...rows.values()].filter(row => row.seq > since).sort((a, b) => a.seq - b.seq)
        const categories = after(user.categories)
        const notes = after(user.notes)
        const more = notes.length > this.pageSize
        const page = notes.slice(0, this.pageSize)
        const seq = more ? page[page.length - 1].seq : user.seq
        return { seq, more, encrypted: user.encrypted, categories: categories.filter(row => row.seq <= seq), notes: page }
    }

    push(user, { categories = [], notes = [] }) {
        const before = user.seq
        const accepted = { categories: [], notes: [] }
        const rejected = { categories: [], notes: [] }

        const write = (table, rows, kind) => {
            for(const row of rows) {
                const current = table.get(row.id)
                if((current?.version ?? 0) !== row.version) {
                    // a row the server never had comes back as an empty tombstone at version 0
                    rejected[kind].push(current ?? { ...row, title: '', content: '', name: '', categoryId: null, version: 0, seq: 0, deleted: true })
                    continue
                }
                const version = row.version + 1
                const seq = ++user.seq
                table.set(row.id, { ...row, version, seq })
                accepted[kind].push({ id: row.id, version, seq })
            }
        }
        write(user.categories, categories, 'categories')
        write(user.notes, notes, 'notes')

        return { seq: user.seq, before, accepted, rejected }
    }

    encrypt(user, { password, encryption, categories = [], notes = [] }) {
        if(user.encrypted) {
            fail('Already encrypted')
        }
        const live = table => [...table.values()].filter(row => !row.deleted)
        const matches = (table, rows) => rows.length === live(table).length && rows.every(row => table.get(row.id)?.version === row.version && !table.get(row.id).deleted)
        if(!matches(user.categories, categories) || !matches(user.notes, notes)) {
            fail('Out of date', 409)
        }

        for(const row of categories) {
            const current = user.categories.get(row.id)
            user.categories.set(row.id, { ...current, name: row.name, version: current.version + 1, seq: ++user.seq })
        }
        for(const row of notes) {
            const current = user.notes.get(row.id)
            user.notes.set(row.id, { ...current, title: row.title, content: row.content, version: current.version + 1, seq: ++user.seq })
        }
        user.encrypted = true
        user.password = password
        user.encryption = encryption
        return { seq: user.seq }
    }
}
