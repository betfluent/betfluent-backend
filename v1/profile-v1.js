'use strict'

const express = require('express')
const router = express.Router()
const sharp = require('sharp')
const db = require('../services/DbService')
const storage = require('../services/StorageService')
const managerService = require('../services/ManagerService')

router.post('/avatar', async function (req, res) {
  const { userId } = req.body
  console.log('---------- Profile Avatar v1:', userId)

  const resizePromise = sharp(req.file.buffer)
    .resize(320, 320)
    .toBuffer()

  const [resizedBuffer, publicUserId] = await Promise.all([
    resizePromise,
    db.getPublicUserId(userId)
  ])

  storage.uploadUserAvatar(publicUserId, resizedBuffer, req.file.mimetype)
    .then(() => res.send({
      status: 'success'
    }))
    .catch(err => res.send({
      status: 'error',
      message: err.message
    }))
})

router.get('/manager/:managerId', function (req, res) {
  const managerId = req.params.managerId

  managerService.getPastBetPerformance(managerId, req.query)
    .then(betPerformance => res.send({
      status: 'success',
      data: betPerformance
    }))
    .catch(err => res.send({
      status: 'error',
      message: err.message
    }))
})

module.exports = router
