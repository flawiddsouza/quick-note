import sql from './sql.js'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

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
