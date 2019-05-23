'use strict'

require('dotenv').config()
const bodyParser = require('body-parser')
const moment = require('moment')
const helmet = require('helmet')
const express = require('express')
const app = express()
const dbWatcher = require('./dbWatcher')
const v1 = require('./v1/index-v1')

app.enable('trust proxy')

const regexSsn = /^(\d{3}-?\d{2}-?\d{4}|XXX-XX-XXXX)$/

// Trims strings, revives ISO_8601 dates && replaces unencrypted ssn with ssnEncrypted
const reviver = function(key, value) {
  if (typeof value === 'string') {
    if (moment(value, moment.ISO_8601).isValid()) {
      return moment(value, moment.ISO_8601).toDate()
    }
    return value.trim()
  }
  return value
}

// "Catch-all" error handler used by this api.
function handleError(err, req, res, next) {
  console.log('ERROR: ' + err)
  res.sendStatus(err.status || 500)
}

app.use(
  bodyParser.urlencoded({
    extended: true
  })
)

app.use(
  bodyParser.json({
    reviver: reviver
  })
)

app.use(helmet())

app.get('/', function(req, res) {
  console.log('Homepage')
  res.send('Welcome to Boston!')
})

app.use('/api/v1', v1)

app.use(handleError)

dbWatcher.start()

//

const server = app.listen(process.env.PORT || 8080, function() {
  var port = server.address().port
  console.log('App now running on port', port)
})
