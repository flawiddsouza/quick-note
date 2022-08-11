import sql from './sql.js'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import Automerge from 'automerge'
import { promises as fs } from 'fs'
import { serialize, deserialize } from 'bson'

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
        await sql`update users set password=${hashedPassword} where id = ${userId}`
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

function generateFileKey(key, userId, clientId) {
    let generatedFileKey = `${userId}-${key}`
    if(clientId) {
        generatedFileKey += `-${clientId}`
    }
    return generatedFileKey
}

async function getItem({ key, userId, clientId })  {
    try {
        return await fs.readFile(`./store/${generateFileKey(key, userId, clientId)}`)
    } catch(e) {
        return null
    }
}

async function setItem({ key, userId, clientId }, value) {
    await fs.writeFile(`./store/${generateFileKey(key, userId, clientId)}`, value)
}

let automergeDocs = {}
let automergeSyncStates = {}

export async function getAutomergeDocForUser(userId) {
    const savedAutomergeDoc = await getItem({ key: 'automergeDoc', userId })

    if(savedAutomergeDoc) {
        automergeDocs[userId] = Automerge.load(savedAutomergeDoc)
    } else {
        const schema = Automerge.change(Automerge.init({ actorId: '0000' }), { time: 0 }, doc => {
            doc.categories = []
            doc.notes = []
        })

        const initChange = Automerge.getLastLocalChange(schema)

        const [ initDoc ] = Automerge.applyChanges(Automerge.init(), [ initChange ])

        automergeDocs[userId] = initDoc
    }

    return automergeDocs[userId]
}

export async function saveAutomergeDocForUse(userId, updatedAutomergeDoc) {
    await setItem({ key: 'automergeDoc', userId }, Automerge.save(updatedAutomergeDoc))
    automergeDocs[userId] = updatedAutomergeDoc
}

export async function getAutomergeSyncStateForClient(userId, clientId) {
    if(userId in automergeSyncStates === false) {
        automergeSyncStates[userId] = {}
    }

    const savedAutomergeSyncState = await getItem({ key: 'automergeSyncState', userId, clientId })

    if(savedAutomergeSyncState) {
        automergeSyncStates[userId][clientId] = deserialize(savedAutomergeSyncState, { promoteBuffers: true })
    } else {
        automergeSyncStates[userId][clientId] = Automerge.initSyncState()
    }

    return automergeSyncStates[userId][clientId]
}

export async function saveAutomergeSyncStateForClient(userId, clientId, updatedAutomergeSyncState) {
    await setItem({ key: 'automergeSyncState', userId, clientId }, serialize(updatedAutomergeSyncState))
    automergeSyncStates[userId][clientId] = updatedAutomergeSyncState
}
