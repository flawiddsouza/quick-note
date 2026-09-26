import express from 'express'
import * as db from './db.js'
import { pull, push, encrypt, validateRows, validateEncryptedRows } from './sync.js'
import { requestValidator, authCheck } from './middlewares.js'

// For an encrypted account, `password` on the wire is never the password itself but a key the
// device derives from it (see Web-UI/src/crypto.js), and the same goes for recoveryPassword
// and the recovery phrase. The server hashes and checks them like any password.
const router = express.Router()

const isText = value => typeof value === 'string' && value !== ''
const hasFields = (object, fields) => object != null && typeof object === 'object' && fields.every(field => isText(object[field]))
const accountKeys = ['salt', 'wrappedKey']
const recoveryKeys = ['recoverySalt', 'recoveryWrappedKey', 'recoveryPassword']

router.get('/', (_req, res) => {
    res.send('Quick Note API')
})

// encryption is given for an account whose notes are encrypted on the device, the default for new accounts
router.post('/register', requestValidator(['email', 'password']), async(req, res) => {
    const { encryption } = req.body
    if(encryption !== undefined && !hasFields(encryption, [...accountKeys, ...recoveryKeys])) {
        return res.status(400).send('encryption field is incomplete')
    }

    try {
        const createdUser = await db.createUser(req.body.email, req.body.password, encryption)
        const token = db.generateToken(createdUser.id)
        res.send({ token, encrypted: Boolean(encryption), wrappedKey: encryption?.wrappedKey ?? null })
    } catch(e) {
        res.status(400).send(e.message)
    }
})

// what the device needs before it can log in: whether to derive a key, and the salt to do it with
router.post('/salt', requestValidator(['email']), async(req, res) => {
    try {
        const user = await db.findUserByEmail(req.body.email)
        res.send({ encrypted: user.encrypted, salt: user.salt })
    } catch(e) {
        res.status(400).send(e.message)
    }
})

router.post('/login', requestValidator(['email', 'password']), async(req, res) => {
    try {
        const user = await db.validateUser(req.body.email, req.body.password) // will throw error if validation fails
        const token = db.generateToken(user.id)
        res.send({ token, encrypted: user.encrypted, wrappedKey: user.wrapped_key })
    } catch(e) {
        res.status(400).send(e.message)
    }
})

router.post('/change-password', authCheck, requestValidator(['currentPassword', 'newPassword']), async(req, res) => {
    const { encryption } = req.body
    if(encryption !== undefined && !hasFields(encryption, accountKeys)) {
        return res.status(400).send('encryption field is incomplete')
    }

    try {
        await db.changeUserPassword(req.user.id, req.body.currentPassword, req.body.newPassword, encryption)
        res.send('Password changed')
    } catch(e) {
        res.status(400).send(e.message)
    }
})

// the recovery phrase unlocks the data key on the device, so the wrapped key is handed out
// with the salt; it is useless without the phrase
router.post('/recovery', requestValidator(['email']), async(req, res) => {
    try {
        const user = await db.findUserByEmail(req.body.email)
        if(!user.encrypted) {
            throw new Error('Account has no recovery phrase')
        }
        res.send({ recoverySalt: user.recovery_salt, recoveryWrappedKey: user.recovery_wrapped_key })
    } catch(e) {
        res.status(400).send(e.message)
    }
})

router.post('/reset-password', requestValidator(['email', 'recoveryPassword', 'password']), async(req, res) => {
    if(!hasFields(req.body.encryption, accountKeys)) {
        return res.status(400).send('encryption field is incomplete')
    }

    try {
        await db.resetUserPassword(req.body.email, req.body.recoveryPassword, req.body.password, req.body.encryption)
        res.send('Password reset')
    } catch(e) {
        res.status(400).send(e.message)
    }
})

router.post('/recovery-phrase', authCheck, async(req, res) => {
    if(!hasFields(req.body, recoveryKeys)) {
        return res.status(400).send('recovery fields are incomplete')
    }

    try {
        await db.setUserRecovery(req.user.id, req.body)
        res.send('Recovery phrase set')
    } catch(e) {
        res.status(400).send(e.message)
    }
})

// every row written after `since`, see sync.js
router.get('/changes', authCheck, async(req, res) => {
    const since = Number(req.query.since ?? 0)
    if(!Number.isInteger(since) || since < 0) {
        return res.status(400).send('since must be a whole number')
    }

    res.send(await pull(req.user.id, since))
})

router.post('/changes', authCheck, async(req, res) => {
    if(!validateRows(req.body)) {
        return res.status(400).send('Invalid rows')
    }

    res.send(await push(req.user.id, req.body))
})

// turns an existing account on to encryption, see sync.js
router.post('/encrypt', authCheck, requestValidator(['password']), async(req, res) => {
    const { encryption } = req.body
    if(!hasFields(encryption, [...accountKeys, ...recoveryKeys]) || !validateEncryptedRows(req.body)) {
        return res.status(400).send('Invalid request')
    }

    try {
        res.send(await encrypt(req.user.id, {
            password: db.hashPassword(req.body.password),
            encryption: { ...encryption, recoveryPassword: db.hashPassword(encryption.recoveryPassword) },
            categories: req.body.categories ?? [],
            notes: req.body.notes ?? []
        }))
    } catch(e) {
        res.status(e.message === 'Out of date' ? 409 : 400).send(e.message)
    }
})

export default router
