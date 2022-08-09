import express from 'express'
import * as db from './db.js'
import { requestValidator, authCheck } from './middlewares.js'

const router = express.Router()

router.get('/', (_req, res) => {
    res.send('Quick Note API')
})

router.post('/register', requestValidator(['email', 'password']), async(req, res) => {
    try {
        const createdUser = await db.createUser(req.body.email, req.body.password)
        const token = db.generateToken(createdUser.id)
        res.send({ token })
    } catch(e) {
        res.status(400).send(e.message)
    }
})

router.post('/login', requestValidator(['email', 'password']), async(req, res) => {
    try {
        const user = await db.validateUser(req.body.email, req.body.password) // will throw error if validation fails
        const token = db.generateToken(user.id)
        res.send({ token })
    } catch(e) {
        res.status(400).send(e.message)
    }
})

router.post('/change-password', authCheck, requestValidator(['currentPassword', 'newPassword']), async(req, res) => {
    try {
        await db.changeUserPassword(req.user.id, req.body.currentPassword, req.body.newPassword)
        res.send('Password changed')
    } catch(e) {
        res.status(400).send(e.message)
    }
})

export default router
