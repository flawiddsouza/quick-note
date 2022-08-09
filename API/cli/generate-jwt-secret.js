import crypto from 'crypto'

function generateRandomString(size = 64) {
    return crypto.randomBytes(size).toString('base64').slice(0, size)
}

console.log(generateRandomString())
