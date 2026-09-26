// End-to-end encryption, all WebCrypto. The password never leaves the device: it is stretched
// into a master key (PBKDF2), and two keys are derived from that (HKDF). The auth key is what
// the server gets as the password. The wrapping key encrypts the data key, a random key that
// encrypts every note title, note content and category name with AES-GCM. The recovery phrase
// is a second password with its own master key and its own wrapping of the data key.
//
// Keys are passed around as hex strings, so they can sit in settings; wrapped keys and
// encrypted fields are base64 with the random nonce in front.
import { wordlist } from '@scure/bip39/wordlists/english.js'

const subtle = globalThis.crypto.subtle
const iterations = 600000
const encoder = new TextEncoder()
const decoder = new TextDecoder()

export const toHex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
export const fromHex = hex => Uint8Array.from(hex.match(/../g) ?? [], pair => parseInt(pair, 16))

export function toBase64(bytes) {
    let binary = ''
    for(let index = 0; index < bytes.length; index += 4096) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 4096))
    }
    return btoa(binary)
}

export const fromBase64 = text => Uint8Array.from(atob(text), char => char.charCodeAt(0))

export const randomBytes = length => globalThis.crypto.getRandomValues(new Uint8Array(length))
export const randomSalt = () => toBase64(randomBytes(16))
export const generateDataKey = () => toHex(randomBytes(32))

// the slow step, once per password on a device; the result is cached in settings
export async function deriveMasterKey(secret, salt) {
    const key = await subtle.importKey('raw', encoder.encode(secret), 'PBKDF2', false, ['deriveBits'])
    const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(salt), iterations }, key, 256)
    return toHex(new Uint8Array(bits))
}

async function subKey(masterKey, info) {
    const key = await subtle.importKey('raw', fromHex(masterKey), 'HKDF', false, ['deriveBits'])
    const bits = await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: encoder.encode(info) }, key, 256)
    return new Uint8Array(bits)
}

// sent to the server as the password
export const authKey = async masterKey => toHex(await subKey(masterKey, 'auth'))

const aesKey = (bytes, usages) => subtle.importKey('raw', bytes, 'AES-GCM', false, usages)

async function seal(keyBytes, plaintext, additionalData) {
    const key = await aesKey(keyBytes, ['encrypt'])
    const nonce = randomBytes(12)
    const ciphertext = await subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: encoder.encode(additionalData) }, key, plaintext)
    const sealed = new Uint8Array(12 + ciphertext.byteLength)
    sealed.set(nonce)
    sealed.set(new Uint8Array(ciphertext), 12)
    return toBase64(sealed)
}

async function open(keyBytes, sealed, additionalData) {
    const bytes = fromBase64(sealed)
    const key = await aesKey(keyBytes, ['decrypt'])
    return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12), additionalData: encoder.encode(additionalData) }, key, bytes.subarray(12)))
}

export async function wrapKey(dataKey, masterKey) {
    return seal(await subKey(masterKey, 'wrap'), fromHex(dataKey), 'key')
}

export async function unwrapKey(wrappedKey, masterKey) {
    return toHex(await open(await subKey(masterKey, 'wrap'), wrappedKey, 'key'))
}

// `label` names the field the text belongs to, so a value cannot be moved to another field or row
export async function encryptText(dataKey, text, label) {
    return seal(fromHex(dataKey), encoder.encode(text), label)
}

export async function decryptText(dataKey, sealed, label) {
    return decoder.decode(await open(fromHex(dataKey), sealed, label))
}

// twelve words from the BIP39 list, 132 bits, written down and typed back by hand
export function generatePhrase() {
    const indices = globalThis.crypto.getRandomValues(new Uint16Array(12))
    return Array.from(indices, index => wordlist[index % wordlist.length]).join(' ')
}

export const normalizePhrase = phrase => phrase.trim().toLowerCase().split(/\s+/).join(' ')

// everything the server stores for a secret: the salt it was stretched with and the data key wrapped under it
export async function wrapUnder(secret, dataKey) {
    const salt = randomSalt()
    const masterKey = await deriveMasterKey(secret, salt)
    return { salt, masterKey, authKey: await authKey(masterKey), wrappedKey: await wrapKey(dataKey, masterKey) }
}
