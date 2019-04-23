'use strict'

const moment = require('moment')
const db = require('../services/DbService')
const validator = require('../services/ValidateService')
const express = require('express')
const router = express.Router()

// define the wager route
router.post('/wager', async function (req, res) {
  const session = req.body
  const wager = session.request

  console.log('---------- Wagering v1:', wager)

  const [user, fund] = await Promise.all([
    db.getUser(session.userId),
    db.getFund(wager.fundId),
  ])

  const results = validator.validateWager(wager, user, fund)
  if (results.status === 'success') {
    db.transactUserWager(user.id, fund.id, wager.amount)
      .then(result => {
        if (!result.committed) {
          let response = {
            status: 'fail',
            message: 'User does not have available balance to cover the wager'
          }
          res.send(response)
        } else {
          res.send(results)
        }
      })
  } else {
    res.send(results)
  }
})

module.exports = router
