import { WebSocketServer } from 'ws'
import sql from './sql.js'
import { logger } from './logger.js'

// Notes and categories are rows, one per note, with a version that counts the writes to the
// row and a seq that says when it was last written on the user's change counter. A device
// pulls every row written after the seq it last saw, and pushes its changed rows with the
// version each change was based on. A push whose base version is not the current version
// is rejected with the current row, and the device merges the two (see Web-UI/src/merge.js)
// before pushing again. A deleted row stays as a tombstone with blank fields.
//
// For an encrypted account, title, content and name arrive encrypted on the device and are
// stored as given. The server only ever sees ids, category ids, dates, versions and seqs.

const pageSize = 500

const isText = value => typeof value === 'string'
const isId = value => isText(value) && value.length > 0 && value.length <= 64
const isVersion = value => Number.isInteger(value) && value >= 0

// the row shape on the wire; a bad row is refused before anything is written
function validateCategory(row) {
    return row && isId(row.id) && isVersion(row.version) && typeof row.deleted === 'boolean'
        && isText(row.name) && isText(row.created) && isText(row.modified)
}

function validateNote(row) {
    return row && isId(row.id) && isVersion(row.version) && typeof row.deleted === 'boolean'
        && (row.categoryId === null || isId(row.categoryId))
        && isText(row.title) && isText(row.content) && isText(row.created) && isText(row.modified)
}

export function validateRows({ categories = [], notes = [] }) {
    return Array.isArray(categories) && Array.isArray(notes) && categories.every(validateCategory) && notes.every(validateNote)
}

// the rows sent to turn encryption on carry only the fields that get encrypted
export function validateEncryptedRows({ categories = [], notes = [] }) {
    return Array.isArray(categories) && Array.isArray(notes)
        && categories.every(row => row && isId(row.id) && isVersion(row.version) && isText(row.name))
        && notes.every(row => row && isId(row.id) && isVersion(row.version) && isText(row.title) && isText(row.content))
}

const toCategory = row => ({
    id: row.id, name: row.name, created: row.created, modified: row.modified,
    version: row.version, seq: Number(row.seq), deleted: row.deleted
})

const toNote = row => ({
    id: row.id, categoryId: row.category_id, title: row.title, content: row.content, created: row.created, modified: row.modified,
    version: row.version, seq: Number(row.seq), deleted: row.deleted
})

// what a device gets back for a row it says the server has, but the server does not: a
// tombstone at version 0, so the device builds on it and the row is written as new
const missingCategory = id => ({ id, name: '', created: '', modified: '', version: 0, seq: 0, deleted: true })
const missingNote = id => ({ id, categoryId: null, title: '', content: '', created: '', modified: '', version: 0, seq: 0, deleted: true })

// Every row written after `since`, oldest first, a page at a time. `seq` is where the next
// pull continues; it is the user's counter once nothing is left, so an empty pull is cheap.
export async function pull(userId, since, limit = pageSize) {
    const [user] = await sql`select seq, encrypted from users where id = ${userId}`
    const categories = await sql`
        select * from categories where user_id = ${userId} and seq > ${since} order by seq
    `
    const notes = await sql`
        select * from notes where user_id = ${userId} and seq > ${since} order by seq limit ${limit + 1}
    `

    const more = notes.length > limit
    if(more) {
        notes.length = limit
    }
    const seq = more ? Number(notes[notes.length - 1].seq) : Number(user.seq)

    return {
        seq,
        more,
        encrypted: user.encrypted,
        categories: categories.map(toCategory).filter(row => row.seq <= seq),
        notes: notes.map(toNote)
    }
}

// Writes the rows whose version matches the row on the server (0 for a row the server has
// never seen) and returns the current row for each one that does not. The user's row is
// locked for the whole push, so two devices pushing at once take turns and each accepted
// write gets its own seq. `before` is the counter as the push found it: a device whose last
// pull ended there knows nothing else came in and need not pull its own rows back.
export async function push(userId, { categories = [], notes = [] }) {
    const result = await sql.begin(async sql => {
        const [user] = await sql`select seq from users where id = ${userId} for update`
        const before = Number(user.seq)
        let seq = before
        const accepted = { categories: [], notes: [] }
        const rejected = { categories: [], notes: [] }

        for(const row of categories) {
            const [current] = await sql`select * from categories where user_id = ${userId} and id = ${row.id}`
            if((current?.version ?? 0) !== row.version) {
                rejected.categories.push(current ? toCategory(current) : missingCategory(row.id))
                continue
            }
            const version = row.version + 1
            seq++
            await sql`
                insert into categories(user_id, id, name, created, modified, version, seq, deleted)
                values(${userId}, ${row.id}, ${row.name}, ${row.created}, ${row.modified}, ${version}, ${seq}, ${row.deleted})
                on conflict(user_id, id) do update set name = excluded.name, created = excluded.created, modified = excluded.modified,
                    version = excluded.version, seq = excluded.seq, deleted = excluded.deleted
            `
            accepted.categories.push({ id: row.id, version, seq })
        }

        for(const row of notes) {
            const [current] = await sql`select * from notes where user_id = ${userId} and id = ${row.id}`
            if((current?.version ?? 0) !== row.version) {
                rejected.notes.push(current ? toNote(current) : missingNote(row.id))
                continue
            }
            const version = row.version + 1
            seq++
            await sql`
                insert into notes(user_id, id, category_id, title, content, created, modified, version, seq, deleted)
                values(${userId}, ${row.id}, ${row.categoryId}, ${row.title}, ${row.content}, ${row.created}, ${row.modified}, ${version}, ${seq}, ${row.deleted})
                on conflict(user_id, id) do update set category_id = excluded.category_id, title = excluded.title, content = excluded.content,
                    created = excluded.created, modified = excluded.modified, version = excluded.version, seq = excluded.seq, deleted = excluded.deleted
            `
            accepted.notes.push({ id: row.id, version, seq })
        }

        if(seq !== before) {
            await sql`update users set seq = ${seq}, updated_at = CURRENT_TIMESTAMP where id = ${userId}`
        }

        return { seq, before, accepted, rejected }
    })

    // only once the rows are committed, or a device pulling at once would see nothing
    if(result.seq !== result.before) {
        notify(userId, result.seq)
    }
    return result
}

// Turns the account on to encryption in one step: the given rows, already encrypted on the
// device, replace every live row, and the account gets its keys and its new password. The
// device must hold the current version of every live row, or nothing changes and it has to
// sync first. Other devices see the flag and the rewritten rows on their next pull.
export async function encrypt(userId, { password, encryption, categories, notes }) {
    const result = await sql.begin(async sql => {
        const [user] = await sql`select seq, encrypted from users where id = ${userId} for update`
        if(user.encrypted) {
            throw new Error('Already encrypted')
        }

        const [live] = await sql`
            select (select count(*) from categories where user_id = ${userId} and not deleted) as categories,
                (select count(*) from notes where user_id = ${userId} and not deleted) as notes
        `
        if(Number(live.categories) !== categories.length || Number(live.notes) !== notes.length) {
            throw new Error('Out of date')
        }

        let seq = Number(user.seq)
        for(const row of categories) {
            const updated = await sql`
                update categories set name = ${row.name}, version = version + 1, seq = ${++seq}
                where user_id = ${userId} and id = ${row.id} and version = ${row.version} and not deleted
                returning id
            `
            if(updated.length === 0) {
                throw new Error('Out of date')
            }
        }
        for(const row of notes) {
            const updated = await sql`
                update notes set title = ${row.title}, content = ${row.content}, version = version + 1, seq = ${++seq}
                where user_id = ${userId} and id = ${row.id} and version = ${row.version} and not deleted
                returning id
            `
            if(updated.length === 0) {
                throw new Error('Out of date')
            }
        }

        await sql`
            update users set encrypted = true, password = ${password}, seq = ${seq},
                salt = ${encryption.salt}, wrapped_key = ${encryption.wrappedKey},
                recovery_salt = ${encryption.recoverySalt}, recovery_wrapped_key = ${encryption.recoveryWrappedKey},
                recovery_password = ${encryption.recoveryPassword},
                updated_at = CURRENT_TIMESTAMP
            where id = ${userId}
        `
        return { seq }
    })

    notify(userId, result.seq)
    return result
}

// The websocket only tells a user's devices that there is something to pull; the rows go
// over HTTP. A device pulls when its seq is behind the one in the message.
const wss = new WebSocketServer({ noServer: true })
const sockets = new Map()

function notify(userId, seq) {
    for(const ws of sockets.get(userId) ?? []) {
        ws.send(JSON.stringify({ seq }))
    }
}

export function handleUpgrade(userId, request, socket, head) {
    wss.handleUpgrade(request, socket, head, ws => {
        if(!sockets.has(userId)) {
            sockets.set(userId, new Set())
        }
        sockets.get(userId).add(ws)
        logger.log({ userId }, 'client connected')

        ws.on('close', () => {
            sockets.get(userId).delete(ws)
            logger.log({ userId }, 'client disconnected')
        })
        ws.on('error', error => logger.log({ userId }, 'client error', error.message))
    })
}

// a ping every half minute keeps idle connections open through proxies that drop quiet ones
const pings = setInterval(() => {
    for(const ws of wss.clients) {
        ws.ping()
    }
}, 30000)

export function shutdown() {
    clearInterval(pings)
    for(const ws of wss.clients) {
        ws.terminate()
    }
}
