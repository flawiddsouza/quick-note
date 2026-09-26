import sql from '../sql.js'
import { createUser } from '../db.js'
import { createServer } from '../server.js'

// a throwaway user for one test file, deleting it cascades to every row it owns
export async function createTestUser(label) {
    const user = await createUser(`${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.invalid`, 'password')
    return user.id
}

export async function deleteTestUser(userId) {
    await sql`delete from users where id = ${userId}`
}

export async function seedLegacyDocument(userId, bytes) {
    await sql`insert into user_store(user_id, key, value) values(${userId}, 'automergeDoc', ${Buffer.from(bytes)})`
}

export const category = (id, extra = {}) => ({ id, name: `name ${id}`, created: '2024-01-01T00:00:00.000Z', modified: '2024-01-01T00:00:00.000Z', version: 0, deleted: false, ...extra })
export const note = (id, extra = {}) => ({ id, categoryId: null, title: `title ${id}`, content: `content ${id}`, created: '2024-01-01T00:00:00.000Z', modified: '2024-01-01T00:00:00.000Z', version: 0, deleted: false, ...extra })

// the real HTTP and websocket server on a free port
export async function startServer() {
    const server = createServer()
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address()
    return {
        url: `http://127.0.0.1:${port}`,
        websocketUrl: `ws://127.0.0.1:${port}`,
        close: () => new Promise(resolve => server.close(resolve))
    }
}

export async function until(condition, what = 'condition') {
    for(let attempt = 0; attempt < 500 && !condition(); attempt++) {
        await new Promise(resolve => setTimeout(resolve, 10))
    }
    if(!condition()) {
        throw new Error(`timed out waiting for ${what}`)
    }
}
