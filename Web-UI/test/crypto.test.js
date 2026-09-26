import { describe, it, expect } from 'vitest'
import * as crypto from '../src/crypto'
import { prose } from './helpers'

describe('keys', () => {
    it('stretches a password the same way every time for one salt, and differently per salt', async() => {
        const salt = crypto.randomSalt()
        const a = await crypto.deriveMasterKey('password', salt)
        expect(a).toBe(await crypto.deriveMasterKey('password', salt))
        expect(a).toHaveLength(64)
        expect(a).not.toBe(await crypto.deriveMasterKey('password', crypto.randomSalt()))
        expect(a).not.toBe(await crypto.deriveMasterKey('Password', salt))
    })

    it('derives an auth key that gives nothing away about the wrapping key', async() => {
        const masterKey = await crypto.deriveMasterKey('password', crypto.randomSalt())
        const dataKey = crypto.generateDataKey()
        const auth = await crypto.authKey(masterKey)
        const wrapped = await crypto.wrapKey(dataKey, masterKey)

        expect(auth).not.toBe(masterKey)
        expect(await crypto.unwrapKey(wrapped, masterKey)).toBe(dataKey)
        await expect(crypto.unwrapKey(wrapped, auth)).rejects.toThrow()
        await expect(crypto.unwrapKey(wrapped, await crypto.deriveMasterKey('other', crypto.randomSalt()))).rejects.toThrow()
    })

    it('wraps under a secret with everything the server stores', async() => {
        const dataKey = crypto.generateDataKey()
        const { salt, masterKey, authKey, wrappedKey } = await crypto.wrapUnder('password', dataKey)
        expect(masterKey).toBe(await crypto.deriveMasterKey('password', salt))
        expect(authKey).toBe(await crypto.authKey(masterKey))
        expect(await crypto.unwrapKey(wrappedKey, masterKey)).toBe(dataKey)
    })
})

describe('text', () => {
    const dataKey = crypto.generateDataKey()

    it('encrypts to something different every time and decrypts back', async() => {
        const a = await crypto.encryptText(dataKey, 'hello', 'n1:title')
        const b = await crypto.encryptText(dataKey, 'hello', 'n1:title')
        expect(a).not.toBe(b)
        expect(a).not.toContain('hello')
        expect(await crypto.decryptText(dataKey, a, 'n1:title')).toBe('hello')
        expect(await crypto.decryptText(dataKey, b, 'n1:title')).toBe('hello')
    })

    it('refuses another key, another field and a changed byte', async() => {
        const sealed = await crypto.encryptText(dataKey, 'hello', 'n1:title')
        await expect(crypto.decryptText(crypto.generateDataKey(), sealed, 'n1:title')).rejects.toThrow()
        await expect(crypto.decryptText(dataKey, sealed, 'n2:title')).rejects.toThrow()
        const bytes = crypto.fromBase64(sealed)
        bytes[bytes.length - 1] ^= 1
        await expect(crypto.decryptText(dataKey, crypto.toBase64(bytes), 'n1:title')).rejects.toThrow()
    })

    it('handles empty text, every kind of character and a note of real size', async() => {
        for(const text of ['', 'ünïcödé 日本語 🎉\n\ttabs', prose(20, 3)]) {
            expect(await crypto.decryptText(dataKey, await crypto.encryptText(dataKey, text, 'x:content'), 'x:content')).toBe(text)
        }
    })
})

describe('recovery phrase', () => {
    it('is twelve words from the list, different every time, and read back however it is typed', () => {
        const phrase = crypto.generatePhrase()
        expect(phrase.split(' ')).toHaveLength(12)
        expect(phrase).toMatch(/^[a-z]+( [a-z]+){11}$/)
        expect(crypto.generatePhrase()).not.toBe(phrase)
        expect(crypto.normalizePhrase(`  ${phrase.toUpperCase().replace(/ /g, '   ')}\n`)).toBe(phrase)
    })
})

describe('encoding', () => {
    it('round-trips bytes through hex and base64, including long ones', () => {
        const bytes = Uint8Array.from({ length: 100000 }, (_, index) => (index * 7919) % 256)
        expect(crypto.fromHex(crypto.toHex(bytes))).toEqual(bytes)
        expect(crypto.fromBase64(crypto.toBase64(bytes))).toEqual(bytes)
        expect(crypto.toBase64(new Uint8Array(0))).toBe('')
    })
})
