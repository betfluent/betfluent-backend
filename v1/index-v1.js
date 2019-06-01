'use strict'

const path = require('path')
const db = require('../services/DbService')
const express = require('express')
const router = express.Router()
const cors = require('cors')
const RateLimit = require('express-rate-limit')
const publicIp = require('public-ip')
const moment = require('moment')
const multer = require('multer')
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4e7 }, // 40 MB
  fileFilter: (req, file, callback) => {
    const ext = path.extname(file.originalname)
    // only allow images (no gifs)
    if (file.mimetype.includes('image') && ext !== '.gif') {
      callback(null, true)
    } else {
      callback(null, false)
    }
  }
})
const {
  ensureIsManager,
  ensureIsOperator,
  verifyIdToken
} = require('../middleware/authware')

const logRequest = function (req, res, next) {
  console.log('---------- REQUEST INCOMING ----------')
  console.log('---------- PATH: ', req.path)
  console.log('---------- BODY: ', req.body)
  console.log('---------- QUERY: ', req.query)
  next()
}

const determineIpAddress = function (req, res, next) {
  var ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress
  if ((ipAddress === '127.0.0.1') || (ipAddress === '::ffff:127.0.0.1') || (ipAddress === '::1')) {
    publicIp.v4().then(myPublicIp => {
      req.body.ipAddress = myPublicIp
      next()
    })
  } else {
    req.body.ipAddress = ipAddress
    next()
  }
}

const validateSession = function (req, res, next) {
  let session = req.body
  if (session.id) {
    session.url = req.originalUrl
    if (session.serviceType === 'ID_REGISTER' && session.request) {
      // Ensure that no SSN info is stored - encrypted or not
      session = Object.assign({}, session)
      delete session.request.ssn
      delete session.request.ssnEncrypted
    }
    db.saveSession(session)
    next()
  } else {
    console.log('---------- Missing session id')
    res.sendStatus(401)
  }
}

const formatDeviceLocation = function (req, res, next) {
  let deviceLocation = req.body.deviceLocation
  if (deviceLocation) {
    for (let key in deviceLocation) {
      let value = deviceLocation[key]
      if (value instanceof Date) {
        deviceLocation[key] = moment(value).utc().format('MM/DD/YYYY hh:mm:ss') + ' GMT'
      }
    }
    next()
  } else {
    console.log('---------- Missing device location')
    res.sendStatus(401)
  }
}

const unless = function(paths, middleware) {
  return function(req, res, next) {
    let match
    for (const path of paths) {
      match = req.path.match(path)
      if (match) break
    }
    if (match) return next()
    else return middleware(req, res, next)
  }
}

router.all('*', cors())

router.use('/*/avatar', upload.single('avatar'))

router.use(logRequest)

router.use(determineIpAddress)

router.use(unless(['/users/verify-email', '/identity/*', '/*/callback', '/public/*', '/profile/manager/*'], verifyIdToken))

router.post('*', unless(['/*/callback', '/public/*', '/*/avatar'], validateSession))

// router.post(['/identity', '/cashier', '/webcashier'], unless(['/*/callback', '/*/withdraw'], formatDeviceLocation))

router.use('/identity', require('./identity-v1'))

router.use('/cashier', require('./cashier-v1'))

router.use('/profile', require('./profile-v1'))

router.use('/manager', ensureIsManager)

router.use('/manager', require('./manager-v1'))

router.use('/bet', require('./bet-v1'))

router.use('/operator', require('./operator-v1'))

router.use('/funds', require('./funds-v1'))

router.use('/users', require('./users-v1'))

module.exports = router
