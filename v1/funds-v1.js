'use strict'

const express = require('express')
const db = require('../services/DbService')
const fundService = require('../services/FundService')
const commentService = require('../services/FundCommentService')
const { ensureIsManager } = require('../middleware/authware')
const router = express.Router()

router.post('/', ensureIsManager, (req, res) => {
  const session = req.body
  const fund = session.request

  fundService.createFund(fund)
    .then(fundId => res.send({
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

router.patch('/:fundId', ensureIsManager, async (req, res) => {
  const userId = req.body.userId
  const fundId = req.params.fundId

  const [user, fund] = await Promise.all([
    db.getUser(userId),
    fundService.getFund(fundId)
  ])

  if (!fund) {
    return res.send({
      status: 'error',
      message: `Fund with id ${fundId} does not exist.`
    })
  }

  if (user.managerId !== fund.managerId) {
    return res.send({
      status: 'fail',
      message: 'Only the fund manager may update the fund.'
    })
  }

  if (req.body.openFund !== undefined) {
    fundService.openFund(fundId)
      .then(result => {
        if (result.committed) {
          return res.send({
            status: 'success',
            data: fundId,
            message: 'Fund successfully opened.'
          })
        }
        return res.send({
          status: 'fail',
          message: 'Only STAGED funds may be opened.'
        })
      })
      .catch(err => {
        res.send({
          status: 'error',
          message: err.message
        })
        console.log('ERROR', err)
      })
  } else if (req.body.closeFund !== undefined) {
    fundService.closeFund(fundId)
      .then(result => {
        if (result.committed) {
          const closedFund = result.snapshot.val()
          mailer.sendFundIsClosedEmailToManager(closedFund)
          return res.send({
            status: 'success',
            data: fundId,
            message: 'Fund successfully closed.'
          })
        }
        return res.send({
          status: 'fail',
          message: 'Only OPEN funds may be closed.'
        })
      })
      .catch(err => {
        res.send({
          status: 'error',
          message: err.message
        })
        console.log('ERROR', err)
      })
  }
})

router.delete('/:fundId', ensureIsManager, async (req, res) => {
  const userId = req.body.userId
  const fundId = req.params.fundId

  const [user, fund] = await Promise.all([
    db.getUser(userId),
    fundService.getFund(fundId)
  ])

  if (!fund) {
    return res.send({
      status: 'error',
      message: `Fund with id ${fundId} does not exist.`
    })
  }

  if (user.managerId !== fund.managerId) {
    return res.send({
      status: 'fail',
      message: 'Only the fund manager may delete the fund.'
    })
  }

  fundService.deleteFund(fundId)
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

router.delete('/:fundId/comments/:commentId', ensureIsManager, async (req, res) => {
  const userId = req.body.userId
  const { fundId, commentId } = req.params

  const [user, fund] = await Promise.all([
    db.getUser(userId),
    db.getFund(fundId)
  ])

  if (!fund) {
    return res.send({
      status: 'error',
      message: `Fund with id ${fundId} does not exist.`
    })
  }

  if (user.managerId !== fund.managerId) {
    return res.send({
      status: 'fail',
      message: 'Only the fund manager may delete comments.'
    })
  }

  commentService.deleteFundComment(fundId, commentId)
    .then(() => res.send({
      status: 'success',
      data: req.params
    }))
    .catch(err => {
      res.send({
        status: 'fail',
        message: err.message
      })
      console.log('ERROR', err)
    })
})

router.patch('/:fundId/comments/:commentId', async (req, res) => {
  const { fundId, commentId } = req.params

  if (req.body.reportedTimeMillis !== undefined) {
    commentService.reportFundComment(fundId, commentId)
      .then(() => res.send({
        status: 'success',
        data: req.params
      }))
      .catch(err => {
        res.send({
          status: 'fail',
          message: err.message
        })
        console.log('ERROR', err)
      })
  }
})

router.post('/:fundId/comments/:commentId/vote', async (req, res) => {
  const session = req.body
  const userId = session.userId
  const { vote } = session.request
  const { fundId, commentId } = req.params

  const publicUserId = await db.getPublicUserId(userId)

  commentService.transactFundCommentVote({ vote, commentId, fundId, publicUserId })
    .then(result => {
      if (result.committed) {
        res.send({ status: 'success' })
      } else res.send({ status: 'fail' })
    })
})

module.exports = router
