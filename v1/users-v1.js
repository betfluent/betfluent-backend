'use strict'

const express = require('express')
const mailer = require('../services/MailService')
const db = require('../services/DbService')
const authService = require('../services/AuthService')
const router = express.Router()

router.post('/', async (req, res) => {
  const session = req.body
  const userId = session.userId

  const user = await db.getUser(userId)
  if (user) {
    return res.send({
      status: 'fail',
      message: 'User already created.'
    })
  }

  db.createNewUserData(Object.assign({ userId }, session.request))
    .then(emailCode => {
      res.send({ status: 'success' })
      mailer.sendWelcomeEmail(session.request.email, emailCode)
      setTimeout(() => {
        mailer.sendNewUserEmailToRaymour(session.request)
      }, 1000)
    })
    .catch(err => res.send({
      status: 'error',
      message: err.message
    }))
})

router.post('/verify-email', async (req, res) => {
  const session = req.body
  const emailCode = session.request

  let emailAddress
    db.getUserEmailVerificationInfo(emailCode)
    .then(verifyInfo => {
      if (!verifyInfo) {
        throw new Error(`The verification code was not found in our records`)
      }
      const key = Object.keys(verifyInfo)[0]
      await authService.verifyUserEmail(key)
      await db.deleteUserEmailVerificationInfo(key)
      session.userId = key
      await db.saveSessionResponse(session, verifyInfo)

      res.send({
        status: 'success',
        message: `You have been successfully verified.`,
        customToken: await admin.auth().createCustomToken(key)
      })
    })
    .catch(err => {
      res.send({
        status: 'fail',
        message: err.message
      })
      db.saveSessionResponse(session, { message: err.message })
    })
})

module.exports = router
