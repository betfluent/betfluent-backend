'use strict'

const admin = require('firebase-admin')
const config = require('./config.js')

const serviceAccount = JSON.parse(process.env.FIREBASE_PRODUCTION_SERVICE_ACCT)

const databaseURL = config.firebase.databaseURL

const storageBucket = config.firebase.storageBucket

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL,
  storageBucket
})

module.exports = admin
