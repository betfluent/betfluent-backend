'use strict'

/**
 * https://lob.com/docs#checks
 */

const Lob = require('lob')(process.env.LOB_API_KEY)
const { requiredParam } = require('../utils')

const cancelCheck = (
  checkId = requiredParam('checkId')
) => Lob.checks.delete(checkId)

const createCheck = (
  name = requiredParam('name'),
  {
    address1 = requiredParam('address1'),
    address2,
    addressCity = requiredParam('addressCity'),
    addressState = requiredParam('addressState'),
    addressPostalCode = requiredParam('addressPostalCode')
  },
  amount = requiredParam('amount')
) => Lob.checks.create({
  description: 'Withdrawal Check',
  bank_account: process.env.LOB_BANK_ID,
  to: {
    name,
    address_line1: address1,
    address_line2: address2,
    address_city: addressCity,
    address_state: addressState,
    address_zip: addressPostalCode,
    address_country: 'US'
  },
  from: process.env.LOB_FROM_ADDRESS,
  amount: amount
})

module.exports = {
  cancelCheck,
  createCheck
}
