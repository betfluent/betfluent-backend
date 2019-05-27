'use strict'

const express = require('express')
const router = express.Router()
const firebase = require('../firebase')
const authService = require('../services/AuthService')
const db = require('../services/DbService')

router.post('/create-manager', (req, res) => {
  const session = req.body
  const { userId, name, company } = session.request

  if (!userId) {
    return res.send({
      status: 'error',
      message: 'userId is required'
    })
  }

  authService
    .setManagerAccessClaim(userId)
    .then(async () => {
      const userSnapshot = await firebase.database()
        .ref('users')
        .child(userId)
        .once('value')

      const user = userSnapshot.val()

      const publicSnapshot = await firebase.database()
        .ref('public')
        .child(`users/${user.publicId}`)
        .once('value')

      const publicUser = publicSnapshot.val()

      user.managerId = user.managerId || db.getNewUid()
      const manager = {
        id: user.managerId,
        name: publicUser.name,
        avatarUrl: publicUser.avatarUrl || "",
        joinTimeMillis: firebase.database.ServerValue.TIMESTAMP,
        isTraining: false
      }
      if (company) manager.company = company
      await db.updateUser(user.id, user)
      await db.updateManager(manager.id, manager)
      res.send({
        status: 'success',
        data: manager.id
      })
    })
    .catch(err => res.send({
      status: 'error',
      message: err.message
    }))
})

module.exports = router
