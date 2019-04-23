'use strict'

const express = require('express')
const router = express.Router()
const db = require('../services/DbService')

router.post('/prediction', async function (req, res) {
  const session = req.body
  const { bet, willWin } = session.request
  const user = await db.getUser(session.userId)

  console.log('---------- Bet Prediction v1:', { bet, willWin })
  if (bet.status === 'RETURNED') {
    return res.send({
      status: 'fail',
      message: 'Predictions must be made before the Bet is returned.'
    })
  }

  db.transactUserPrediction(user, bet, willWin)
    .then(result => {
      if (result.committed) {
        res.send({
          status: 'success',
          data: { bet, willWin }
        })
      } else {
        res.send({
          status: 'fail',
          message: 'A user can only make one prediction per bet.'
        })
      }
    })
    .catch(err => res.send({
      status: 'error',
      message: err.message
    }))
})

module.exports = router
