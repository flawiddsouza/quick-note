import sql from './sql.js'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import Automerge from 'automerge'
import { serialize, deserialize } from 'bson'
import { logger } from './logger.js'

const saltRounds = 10

export async function createUser(email, password) {
    try {
        const hashedPassword = bcrypt.hashSync(password, saltRounds)
        const [createdUser] = await sql`
            insert into users(email, password) values(${email}, ${hashedPassword})
            returning id, created_at, updated_at
        `
        return createdUser
    } catch(e) {
        throw new Error('Email already registered')
    }
}

export async function findUserByEmail(email) {
    const [user] = await sql`select * from users where email = ${email}`

    if(!user) {
        throw new Error('User not found')
    }

    return user
}

export async function validateUser(email, password) {
    try {
        const user = await findUserByEmail(email)
        if(bcrypt.compareSync(password, user.password)) {
            return { id: user.id }
        } else {
            throw new Error('Invalid password')
        }
    } catch(e) {
        throw new Error(e.message)
    }
}

export async function findUserById(id) {
    const [user] = await sql`select * from users where id = ${id}`

    if(!user) {
        throw new Error('User not found')
    }

    return user
}

export async function changeUserPassword(userId, currentPassword, newPassword) {
    const user = await findUserById(userId)
    if(bcrypt.compareSync(currentPassword, user.password)) {
        const hashedPassword = bcrypt.hashSync(newPassword, saltRounds)
        await sql`update users set password=${hashedPassword}, updated_at=CURRENT_TIMESTAMP where id = ${userId}`
    } else {
        throw new Error('Invalid current password')
    }
}

export function generateToken(userId) {
    return jwt.sign({
        userId: userId
    }, process.env.JWT_SECRET, {
        expiresIn: '30s'
    });
}

export function validateToken(token) {
    return jwt.verify(token, process.env.JWT_SECRET)
}

async function getItem({ key, userId, clientId })  {
    try {
        let item
        if(clientId) {
            [item] = await sql`select * from user_client_store where key = ${key} AND user_id = ${userId} AND client_id = ${clientId}`
        } else {
            [item] = await sql`select * from user_store where key = ${key} AND user_id = ${userId}`
        }
        return item.value
    } catch(e) {
        return null
    }
}

async function setItem({ key, userId, clientId }, value) {
    if(clientId) {
        await sql`
            insert into user_client_store(user_id, client_id, key, value) values(${userId}, ${clientId}, ${key}, ${value})
            on conflict(user_id, client_id, key)
            do update set value = ${value}, updated_at = CURRENT_TIMESTAMP
        `
    } else {
        await sql`
            insert into user_store(user_id, key, value) values(${userId}, ${key}, ${value})
            on conflict(user_id, key)
            do update set value = ${value}, updated_at = CURRENT_TIMESTAMP
        `
    }
}

async function removeItem({ key, userId, clientId }) {
    if(clientId) {
        await sql`delete from user_client_store where user_id=${userId} AND client_id=${clientId} AND key=${key}`
    } else {
        await sql`delete from user_store where user_id=${userId} AND key=${key}`
    }
}

let automergeDocs = {}
let automergeSyncStates = {}

export async function getAutomergeDocForUser(userId) {
    if(userId in automergeDocs) {
        logger.log({ userId }, 'loaded savedAutomergeDoc from memory')
        return automergeDocs[userId]
    }

    const savedAutomergeDoc = await getItem({ key: 'automergeDoc', userId })

    if(savedAutomergeDoc) {
        automergeDocs[userId] = Automerge.load(savedAutomergeDoc)

        logger.log({ userId }, 'loaded savedAutomergeDoc')
    } else {
        const schema = Automerge.change(Automerge.init({ actorId: '0000' }), { time: 0 }, doc => {
            doc.categories = []
            doc.notes = []
        })

        const initChange = Automerge.getLastLocalChange(schema)

        const [ initDoc ] = Automerge.applyChanges(Automerge.init(), [ initChange ])

        automergeDocs[userId] = initDoc

        logger.log({ userId }, 'unable to find savedAutomergeDoc, initialized automergeDoc')
    }

    return automergeDocs[userId]
}

export async function saveAutomergeDocForUser(userId, updatedAutomergeDoc) {
    await setItem({ key: 'automergeDoc', userId }, Automerge.save(updatedAutomergeDoc))
    automergeDocs[userId] = updatedAutomergeDoc

    logger.log({ userId }, 'saved automergeDoc')
}

export async function getAutomergeSyncStateForClient(userId, clientId) {
    if(userId in automergeSyncStates === false) {
        automergeSyncStates[userId] = {}
    }

    if(clientId in automergeSyncStates[userId]) {
        logger.log({ userId, clientId }, 'loaded savedAutomergeSyncState from memory')

        return automergeSyncStates[userId][clientId]
    }

    const savedAutomergeSyncState = await getItem({ key: 'automergeSyncState', userId, clientId })

    if(savedAutomergeSyncState) {
        try {
            automergeSyncStates[userId][clientId] = deserialize(savedAutomergeSyncState, { promoteBuffers: true })

            logger.log({ userId, clientId }, 'loaded savedAutomergeSyncState')
        } catch(e) {
            automergeSyncStates[userId][clientId] = Automerge.initSyncState()

            logger.log({ userId, clientId }, 'getAutomergeSyncStateForClient failed when deserializing savedAutomergeSyncState', e.message)
        }
    } else {
        automergeSyncStates[userId][clientId] = Automerge.initSyncState()

        logger.log({ userId, clientId }, 'unable to find savedAutomergeSyncState, initialized automergeSyncState')
    }

    return automergeSyncStates[userId][clientId]
}

export async function saveAutomergeSyncStateForClient(userId, clientId, updatedAutomergeSyncState) {
    await setItem({ key: 'automergeSyncState', userId, clientId }, serialize(updatedAutomergeSyncState))
    automergeSyncStates[userId][clientId] = updatedAutomergeSyncState

    logger.log({ userId, clientId }, 'saved automergeSyncState')
}

export async function resetAutomergeSyncStateForClient(userId, clientId) {
    await removeItem({ key: 'automergeSyncState', userId, clientId })
    delete automergeSyncStates[userId][clientId]

    logger.log({ userId, clientId }, 'reset automergeSyncState')
}
