// The account calls: login, registration, passwords and the recovery phrase. For an
// encrypted account (every new one) the password is stretched on the device and the server
// only gets a key derived from it, see crypto.js. `keyCache` is that stretched key with the
// salt it came from, kept in settings so the slow step runs once per password on a device.
import * as crypto from './crypto'

let apiUrl = ''

export function configure(url) {
    apiUrl = url
}

async function post(path, body, token = null) {
    let response

    try {
        response = await fetch(`${apiUrl}${path}`, {
            method: 'POST',
            body: JSON.stringify(body),
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
        })
    } catch(e) {
        throw new Error('Unable to reach server')
    }

    if(!response.ok) {
        const error = new Error(await response.text())
        error.status = response.status
        throw error
    }

    return response.headers.get('content-type')?.includes('json') ? response.json() : response.text()
}

export async function login({ email, password, keyCache = null }) {
    const { encrypted, salt } = await post('/salt', { email })

    if(!encrypted) {
        const { token } = await post('/login', { email, password })
        return { token, encrypted: false, dataKey: null, keyCache: null }
    }

    const masterKey = keyCache?.salt === salt ? keyCache.masterKey : await crypto.deriveMasterKey(password, salt)
    const { token, wrappedKey } = await post('/login', { email, password: await crypto.authKey(masterKey) })
    return { token, encrypted: true, dataKey: await crypto.unwrapKey(wrappedKey, masterKey), keyCache: { salt, masterKey } }
}

// the account's keys under a password and a recovery phrase, as the server stores them
async function keysFor(password, dataKey) {
    const phrase = crypto.generatePhrase()
    const account = await crypto.wrapUnder(password, dataKey)
    const recovery = await crypto.wrapUnder(crypto.normalizePhrase(phrase), dataKey)
    return {
        phrase,
        authKey: account.authKey,
        keyCache: { salt: account.salt, masterKey: account.masterKey },
        encryption: {
            salt: account.salt,
            wrappedKey: account.wrappedKey,
            recoverySalt: recovery.salt,
            recoveryWrappedKey: recovery.wrappedKey,
            recoveryPassword: recovery.authKey
        }
    }
}

// new accounts are encrypted; the recovery phrase is shown once and never stored
export async function register({ email, password }) {
    const dataKey = crypto.generateDataKey()
    const { phrase, authKey, keyCache, encryption } = await keysFor(password, dataKey)
    const { token } = await post('/register', { email, password: authKey, encryption })
    return { token, encrypted: true, dataKey, keyCache, phrase }
}

// what an existing account needs to turn encryption on, see sync.encryptAccount
export async function encryptionFor(password) {
    const dataKey = crypto.generateDataKey()
    const { phrase, authKey, keyCache, encryption } = await keysFor(password, dataKey)
    return { password: authKey, encryption, dataKey, keyCache, phrase }
}

// the typed current password is checked by the server, as the derived key it maps to
export async function changePassword({ token, encrypted, keyCache, dataKey, currentPassword, newPassword }) {
    if(!encrypted) {
        await post('/change-password', { currentPassword, newPassword }, token)
        return { keyCache: null }
    }

    const currentMasterKey = await crypto.deriveMasterKey(currentPassword, keyCache.salt)
    const next = await crypto.wrapUnder(newPassword, dataKey)
    await post('/change-password', {
        currentPassword: await crypto.authKey(currentMasterKey),
        newPassword: next.authKey,
        encryption: { salt: next.salt, wrappedKey: next.wrappedKey }
    }, token)
    return { keyCache: { salt: next.salt, masterKey: next.masterKey } }
}

// a forgotten password: the phrase unlocks the data key here, and proves the account to the server
export async function resetPassword({ email, phrase, newPassword }) {
    const { recoverySalt, recoveryWrappedKey } = await post('/recovery', { email })
    const recoveryMasterKey = await crypto.deriveMasterKey(crypto.normalizePhrase(phrase), recoverySalt)

    let dataKey
    try {
        dataKey = await crypto.unwrapKey(recoveryWrappedKey, recoveryMasterKey)
    } catch(e) {
        throw new Error('Invalid recovery phrase')
    }

    const next = await crypto.wrapUnder(newPassword, dataKey)
    await post('/reset-password', {
        email,
        recoveryPassword: await crypto.authKey(recoveryMasterKey),
        password: next.authKey,
        encryption: { salt: next.salt, wrappedKey: next.wrappedKey }
    })
}

export async function newRecoveryPhrase({ token, dataKey }) {
    const phrase = crypto.generatePhrase()
    const recovery = await crypto.wrapUnder(crypto.normalizePhrase(phrase), dataKey)
    await post('/recovery-phrase', { recoverySalt: recovery.salt, recoveryWrappedKey: recovery.wrappedKey, recoveryPassword: recovery.authKey }, token)
    return phrase
}
