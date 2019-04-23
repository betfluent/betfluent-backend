'use strict'

const express = require('express')
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
    })
    .catch(err => res.send({
      status: 'error',
      message: err.message
    }))
})

router.post('/verify-email', (req, res) => {
  const session = req.body
  const userId = session.userId
  const emailCode = session.request

  let emailAddress
  authService.getUserRecord(userId)
    .then(userRecord => {
      emailAddress = userRecord.email
      if (userRecord.emailVerified) {
        throw new Error(`${emailAddress} has already been verified.`)
      }
    })
    .then(() => db.getUserEmailVerificationInfo(userId))
    .then(verifyInfo => {
      if (!verifyInfo || verifyInfo.code !== emailCode) {
        throw new Error(`The verification code for ${emailAddress} does not match the one provided.`)
      }
      return authService.verifyUserEmail(userId)
    })
    .then(userRecord => {
      res.send({
        status: 'success',
        message: `${emailAddress} has been successfully verified.`
      })
      db.deleteUserEmailVerificationInfo(userId)
      db.saveSessionResponse(session, userRecord)
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
