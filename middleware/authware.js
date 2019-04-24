'use strict'

const admin = require('../firebase')

const ensureIsManager = function(req, res, next) {
  if (req.body.credential === 'ADMIN' || req.body.credential === 'MANAGER') {
    next()
  } else res.sendStatus(403)
}

const ensureIsOperator = (req, res, next) => {
  if (req.body.credential === 'ADMIN' || req.body.credential === 'OPERATOR') {
    next()
  } else res.sendStatus(403)
}

const verifyIdToken = function (req, res, next) {
  let idToken = req.headers.token
  if (!idToken) {
    console.log('---------- Identity token not received from client')
    res.sendStatus(401)
  } else {
    admin.auth().verifyIdToken(idToken).then(decodedToken => {
      let userId = decodedToken.uid
      req.body.userId = userId
      if (decodedToken.admin) {
        req.body.credential = 'ADMIN'
      } else if (decodedToken.manager) {
        req.body.credential = 'MANAGER'
      } else if (decodedToken.operator) {
        req.body.credential = 'OPERATOR'
      } else {
        req.body.credential = 'PLAYER'
      }
      next()
    }).catch(error => {
      console.log('---------- Identity token verification failed', error)
      res.sendStatus(498)
    })
  }
}

module.exports = {
  ensureIsManager,
  ensureIsOperator,
  verifyIdToken
}
