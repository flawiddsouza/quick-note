import sql from './sql.js'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

const saltRounds = 10

// An encrypted account stores salt and wrapped_key: the server never sees the password or
// the data key. `password` on the wire is a key derived from the password on the device,
// and wrapped_key is the data key encrypted with another key derived from the password.
// The recovery_* columns are the same pair derived from the recovery phrase.
export const hashPassword = password => bcrypt.hashSync(password, saltRounds)

export async function createUser(email, password, encryption = null) {
    try {
        const hashedPassword = hashPassword(password)
        const [createdUser] = encryption
            ? await sql`
                insert into users(email, password, encrypted, salt, wrapped_key, recovery_salt, recovery_wrapped_key, recovery_password)
                values(${email}, ${hashedPassword}, true, ${encryption.salt}, ${encryption.wrappedKey}, ${encryption.recoverySalt}, ${encryption.recoveryWrappedKey}, ${hashPassword(encryption.recoveryPassword)})
                returning id, created_at, updated_at
            `
            : await sql`
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
    const user = await findUserByEmail(email)

    if(bcrypt.compareSync(password, user.password)) {
        return user
    }

    throw new Error('Invalid password')
}

export async function findUserById(id) {
    const [user] = await sql`select * from users where id = ${id}`

    if(!user) {
        throw new Error('User not found')
    }

    return user
}

// the new password of an encrypted account comes with the data key wrapped under it again
export async function changeUserPassword(userId, currentPassword, newPassword, encryption = null) {
    const user = await findUserById(userId)
    if(!bcrypt.compareSync(currentPassword, user.password)) {
        throw new Error('Invalid current password')
    }
    if(user.encrypted && !encryption) {
        throw new Error('encryption field is required')
    }

    await sql`
        update users set password = ${hashPassword(newPassword)},
            salt = ${encryption?.salt ?? null}, wrapped_key = ${encryption?.wrappedKey ?? null},
            updated_at = CURRENT_TIMESTAMP
        where id = ${userId}
    `
}

// forgotten password: the recovery phrase proves the account and unlocks the data key on the device
export async function resetUserPassword(email, recoveryPassword, newPassword, encryption) {
    const user = await findUserByEmail(email)
    if(!user.encrypted || !bcrypt.compareSync(recoveryPassword, user.recovery_password)) {
        throw new Error('Invalid recovery phrase')
    }

    await sql`
        update users set password = ${hashPassword(newPassword)}, salt = ${encryption.salt}, wrapped_key = ${encryption.wrappedKey},
            updated_at = CURRENT_TIMESTAMP
        where id = ${user.id}
    `
}

export async function setUserRecovery(userId, { recoverySalt, recoveryWrappedKey, recoveryPassword }) {
    const updated = await sql`
        update users set recovery_salt = ${recoverySalt}, recovery_wrapped_key = ${recoveryWrappedKey},
            recovery_password = ${hashPassword(recoveryPassword)}, updated_at = CURRENT_TIMESTAMP
        where id = ${userId} and encrypted
        returning id
    `
    if(updated.length === 0) {
        throw new Error('Account is not encrypted')
    }
}

// The token is fetched by the client on every start and reused for websocket reconnects
// while the app stays open, so it has to outlive a session
export function generateToken(userId) {
    return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' })
}

export function validateToken(token) {
    return jwt.verify(token, process.env.JWT_SECRET)
}

export async function validateUserToken(token) {
    const { userId } = validateToken(token)
    const user = await findUserById(userId)
    return { id: user.id }
}

// document saved by the app before rows, used by cli/import-legacy-documents.js
export async function getLegacyDocument(userId) {
    const [row] = await sql`select value from user_store where user_id = ${userId} and key = 'automergeDoc'`
    return row ? new Uint8Array(row.value) : null
}

export async function markLegacyImported(userId) {
    await sql`update users set legacy_imported = true, updated_at = CURRENT_TIMESTAMP where id = ${userId}`
}

export async function listUsers() {
    return sql`select id, email, legacy_imported from users order by id`
}
