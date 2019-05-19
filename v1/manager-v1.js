'use strict'

const express = require('express')
const router = express.Router()
const sharp = require('sharp')
const db = require('../services/DbService')
const storage = require('../services/StorageService')
const manager = require('../services/ManagerService')
const Bet = require('../models/Bet')
const Fund = require('../models/Fund')

router.post('/avatar', async function (req, res) {
  const { userId } = req.body
  console.log('---------- Manager Avatar v1:', userId)

  const resizePromise = sharp(req.file.buffer)
    .resize(320, 320)
    .toBuffer()

  const [resizedBuffer, managerId] = await Promise.all([
    resizePromise,
    db.getManagerId(userId)
  ])

  storage.uploadManagerAvatar(managerId, resizedBuffer, req.file.mimetype)
    .then(() => res.send({
      status: 'success'
    }))
    .catch(err => {
      res.send({
        status: 'error',
        message: err.message
      })
      console.log('ERROR', err)
    })
})

router.post('/bet', async function (req, res) {
  const session = req.body
  const bet = new Bet(Object.assign({}, session.request, session.request.line, { fade: false }))
  const fade = new Bet(Object.assign({}, session.request, session.request.fade, { fade: true }))

  if (!(bet.wagered || bet.pctOfFund)) {
    return res.send({
      status: 'error',
      message: 'Bets must have an amount or percent wagered.'
    })
  }

  if (!bet.status) bet.status = 'LIVE'
  switch (bet.status) {
    case 'LIVE':
      manager.placeFundBet(bet)
        .then(() => db.placeFundBet(fade))
        .then(result => res.send(result))
        .catch(err => {
          res.send({
            status: 'fail',
            message: err.message
          })
          console.log('ERROR', err)
        })
      break
    case 'STAGED':
      db.saveBet(bet)
        .then(() => db.saveBet(fade))
        .then(() => res.send({
          status: 'success',
          data: bet,
          message: 'Bet has been staged to be placed 10 minutes before the game.'
        }))
        .catch(err => {
          res.send({
            status: 'fail',
            message: err.message
          })
          console.log('ERROR', err)
        })
        
      break
    case 'RETURNED': break
  }
})

router.post('/result', async function (req, res) {
  const session = req.body
  const betId = session.request
  db.transactFundBetResult(betId)
    .then(result => {
      if (result.committed) {
        res.send({
          status: 'success',
          data: betId
        })

        const fund = new Fund(result.snapshot.val())
        const returnTime = fund.returnTimeMillis > 0
          ? fund.returnTimeMillis
          : Number.MAX_SAFE_INTEGER

        const autoReturn = (Date.now() >= returnTime || fund.balance === 0) && !fund.hasPendingBets()
        const trainingAutoReturn = fund.isTraining && Object.keys(fund.results).length === 10

        if (autoReturn || trainingAutoReturn) {
          manager.returnFund(fund.id)
        }
      } else {
        res.send({
          status: 'fail',
          message: 'A bet cannot be returned more than once.'
        })
      }
    })
    .catch(err => {
      res.send({
        status: 'error',
        message: err.message
      })
      console.log('ERROR', err)
    })
})

router.post('/return', async function (req, res) {
  const session = req.body
  const fundId = session.request

  console.log('---------- Return v1:', fundId)

  const result = await manager.returnFund(fundId)

  res.send(result)
})

router.delete('/funds/:fundId', (req, res) => {
  const fundId = req.params.fundId
  db.deleteFund(fundId)
    .then(() => res.send({
      status: 'success',
      data: fundId
    }))
    .catch(err => {
      res.send({
        status: 'fail',
        message: err.message
      })
      console.log('ERROR', err)
    })
})

router.delete('/bets/:betId', (req, res) => {
  const betId = req.params.betId
  db.deleteBet(betId)
    .then(() => res.send({
      status: 'success',
      data: betId
    }))
    .catch(err => {
      res.send({
        status: 'fail',
        message: err.message
      })
      console.log('ERROR', err)
    })
})

module.exports = router
