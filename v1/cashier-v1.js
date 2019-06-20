'use strict'
const PayPalService = require('../services/PayPalService')
const lob = require('../apis/LobApi')
const db = require('../services/DbService')
const mailer = require('../services/MailService')
const validator = require('../services/ValidateService')
const express = require('express')
const moment = require('moment')
const router = express.Router()

const getLastUserWithdrawal = userId => {
  return db
    .getUserTransactions(userId)
    .then(transactions => transactions
      .filter(
        it => it.type === 'WITHDRAW' && it.status !== 'FAIL'
      ).sort(
        (a, b) => a.updatedTimeMillis - b.updatedTimeMillis
      ).pop()
    )
}


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
    db.transactUserWager(user.id, fund.id, wager)
      .then(result => {
        if (!result.committed) {
          let response = {
            status: 'fail',
            message: 'User does not have available balance to cover the wager'
          }
          res.send(response)
        } else {
          mailer.sendUserWageredOnFundEmail(user, wager.amount, fund)
          res.send(results)
        }
      })
  } else {
    res.send(results)
  }
})

router.post('/deposit', async function (req, res) {
  const { orderID, userId } = req.body;

  const response = await PayPalService(orderID)

  let amount = 0;

  if (response.result) {
    response.result.purchase_units.forEach(item => {
      item.payments.captures.forEach(item => {
        if (item.amount.value) amount += parseFloat(item.amount.value).toFixed(2) * 100
      })
    })
  }

  db.depositToUserBalance(userId, amount)

  res.send({ status: !!amount ? 'success' : 'fail' })
});

// define the withdraw route
router.post('/withdraw', async function (req, res) {
  const session = req.body
  const {
    orderId,
    transactionId,
    amount,
    pin,
    ...address
  } = session.request

  console.log('---------- Withdrawal v1:', session.request)

  const [user, lastWithdrawal] = await Promise.all([
    db.getUser(session.userId),
    getLastUserWithdrawal(session.userId)
  ])

  const aWeekAgo = moment().subtract(7, 'days')
  if (lastWithdrawal && moment(lastWithdrawal.updatedTimeMillis).isAfter(aWeekAgo)) {
    return res.send({
      status: 'fail',
      message: 'You are allowed only one withdrawal per week.'
    })
  }

  let response = {
    status: 'success',
    data: session.request
  }

  if (pin !== user.pin) {
    return ({
      status: 'fail',
      message: 'PIN submitted does not match PIN on file.'
    })
  }

  if (amount > user.balance && amount > 2000) {
    return ({
      status: 'fail',
      message: 'Cannot withdraw more than available balance and less than $20. Please email support@betfluent.com'
    })
  }

  const getTransaction = status => ({
    id: transactionId,
    sessionId: session.id,
    userId: user.id,
    amount,
    type: 'WITHDRAW',
    status
  })

  db.saveTransaction(getTransaction('COMPLETE'))
  mailer.sendPendingWithdrawalEmail(user.email, amount)
  db.withdrawFromUserBalance(user.id, amount)
  res.send(response)
})

module.exports = router
