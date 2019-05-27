'use strict'

const request = require('request-promise')
const firebase = require('../firebase')
const express = require('express')
const router = express.Router()
// const identityService = require('../services/IdentityService')
// const db = require('../services/DbService')
// const cryptor = require('../cryptor')

const BASE_URL = 'http://api.ipstack.com/'

// define the player register route
// router.post('/register', function (req, res) {
//   const session = req.body
//   const identity = session.request

//   if (identity.ssnEncrypted) {
//     identity.ssn = cryptor.decryptFromHex(identity.ssnEncrypted)
//     delete identity.ssnEncrypted
//   }

//   identityService.verifyWithGidx(identity, session)
//     .then(response => {
//       res.send(response)
//       console.log('Identity Registration complete')
//     })
//     .catch(err => {
//       res.send({
//         status: 'error',
//         message: err.message
//       })
//       console.log('ERROR', err)
//     })
// })

// router.get('/document/sdkToken', (req, res) => {
//   const userId = req.body.userId

//   db.getOnfidoApplicantId(userId)
//     .then(async applicantId => {
//       if (!applicantId) {
//         const identity = await db.getUserIdentity(userId)
//         const applicant = await onfido.createApplicant(identity)
//         applicantId = applicant.id
//         db.saveOnfidoApplicantId(userId, applicant.id)
//       }
//       return onfido.getSdkToken(applicantId)
//     })
//     .then(sdkToken => res.send({
//       status: 'success',
//       data: sdkToken
//     }))
//     .catch(err => {
//       res.send({
//         status: 'error',
//         message: err.message
//       })
//       console.log('ERROR', err)
//     })
// })

// router.post('/document/onComplete', async (req, res) => {
//   const session = req.body
//   const userId = session.userId

//   const docCheckPromise = db.getOnfidoApplicantId(userId)
//     .then(applicantId => onfido.checkApplicantDocument(applicantId))

//   try {
//     const [user, docCheck] = await Promise.all([
//       db.getUser(userId),
//       docCheckPromise
//     ])

//     console.log('DOCUMENT CHECK', docCheck)
//     db.saveSessionResponse(session, docCheck)

//     if (docCheck.status === 'in_progress') {
//       const newStatus = user.documentStatus !== 'FAIL'
//         ? 'PENDING'
//         : 'RETRY'

//       db.updateUserDocumentStatus(userId, newStatus)
//       return res.send({
//         status: 'success',
//         data: newStatus
//       })
//     } else if (docCheck.result === 'clear') {
//       db.updateUserDocumentStatus(userId, 'VERIFIED')
//       return res.send({
//         status: 'success',
//         data: 'VERIFIED'
//       })
//     }
//     return res.send({
//       status: 'fail',
//       message: 'Your ID document could not be verified.'
//     })
//   } catch (err) {
//     res.send({
//       status: 'error',
//       message: err.message
//     })
//     console.log('ERROR', err)
//   }
// })

// define the player location route
router.get('/location', async (req, res) => {
  const session = req.body
  const ip = session.ipAddress

  const response = await request.get({
    url: `${BASE_URL}${ip}?access_key=${process.env.IP_STACK_KEY}`
  })

  const snapshot = await firebase.database().ref('legalStates').once('value')

  const legalStates = snapshot.val()

  const country = response['country_code']
  const state = response['region_code']

  if (country === 'US' && !Object.keys(legalStates).includes(state)) {
    res({ ok: false })
  } else {
    res({ ok: true })
  }
})



// router.post('/location', function (req, res) {
//   const session = req.body

//   gidx.checkLocation(session)
//     .then(body => {
//       console.log('---------- Identity Location Response:', body)

//       db.saveSessionResponse(session, body)

//       const locationApproved = approval.isLocationApproved(body)

//       console.log('---------- Identity Location complete')
//       res.send(locationApproved)
//     })
//     .catch(err => {
//       res.send({
//         status: 'error',
//         message: err.message
//       })
//       console.log('ERROR', err)
//     })
// })

// define the player monitor route
// router.post('/monitor', function (req, res) {
//   const session = req.body

//   gidx.monitorPlayer(session)
//     .then(body => {
//       console.log('---------- Identity Monitor Response:', body)

//       db.saveSessionResponse(session, body)

//       const approved = approval.isUserApproved(body)

//       console.log('---------- Identity Monitor complete')
//       res.send(approved)
//     })
//     .catch(err => {
//       res.send({
//         status: 'error',
//         message: err.message
//       })
//       console.log('ERROR', err)
//     })
// })

// router.post('/gidx/callback', async function (res, req) {
//   const userId = req.body.MerchantCustomerID || req.query.userId
//   console.log('GIDX Profile Notification callback: ', userId)

//   const session = {
//     id: db.getNewUid(),
//     serviceType: 'PROFILE',
//     userId
//   }
//   db.saveSession(session)

//   const playerProfile = await gidx.checkPlayerProfile(session)
//   db.saveSessionResponse(session, playerProfile)

//   if (playerProfile.ReasonCodes.includes('ID-VERIFIED')) {
//     db.transactUserUpdate(userId, user => {
//       user.identityVerified = true
//     })
//   }

//   res.send({ Accepted: true })
// })

// router.post('/onfido/callback', async (req, res) => {
//   const event = req.body
//   console.log('ONFIDO Webhook callback: ', event)
//   res.sendStatus(202)

//   switch (event.payload.action) {
//     case 'check.completed':
//       const check = await onfido.getHRef(event.payload.object.href)
//       const startSequence = '/applicants/'
//       const startIndex = check.href.indexOf(startSequence) + startSequence.length
//       const endIndex = check.href.indexOf('/checks/')
//       const applicantId = check.href.substring(startIndex, endIndex)
//       const userId = await db.getUserIdFromOnfidoApplicantId(applicantId)
//       check.reports.forEach(reportId => {
//         onfido.getReport(check.id, reportId).then(report => {
//           if (report.name !== 'document') return
//           if (report.result === 'clear') {
//             return db.updateUserDocumentStatus(userId, 'VERIFIED')
//           }
//           if (!report.breakdown) {
//             return db.updateUserDocumentStatus(userId, 'FAIL')
//           }
//           for (const type of Object.keys(report.breakdown)) {
//             if (
//               type === 'data_comparison' &&
//               report.breakdown[type].result === 'clear'
//             ) {
//               return db.updateUserDocumentStatus(userId, 'VERIFIED')
//             }
//           }
//           return db.updateUserDocumentStatus(userId, 'FAIL')
//         })
//       })
//       break
//   }
// })

module.exports = router
