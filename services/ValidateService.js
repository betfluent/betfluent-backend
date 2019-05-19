'use strict'

const validateWager = function (wager, user, fund) {
  let response = {
    status: 'success',
    data: wager,
    message: 'Wager Succeeded'
  }
  // Check to see if wager is positive number
  if (wager.amount <= 0) {
    response = {
      status: 'error',
      message: 'Wager amount must be greater than 0'
    }
  }
  // Check to see if user actually has available balance
  if (user.balance < wager.amount) {
    response = {
      status: 'fail',
      message: 'You do not have the available balance to cover the wager'
    }
  }
  // Calculate total amount wagered if this is successful
  let totalWagerAmount = wager.amount
  if (user.investments && user.investments[fund.id]) {
    totalWagerAmount += Math.abs(user.investments[fund.id])
  }
  // Check to see if total wager is more than minimum
  if (totalWagerAmount < fund.minInvestment) {
    response = {
      status: 'error',
      message: 'Wager must be greater than min wager'
    }
  }
  // Check to see if total wager is less than max Investment
  if (totalWagerAmount > fund.maxInvestment) {
    response = {
      status: 'fail',
      message: 'Cumulative wager must be less than max wager'
    }
  }
  // Check to see if wager will exceed maxBalance for the fund
  if (fund.balance + wager.amount > fund.maxBalance) {
    response = {
      status: 'fail',
      message: 'Wager exceeds max balance for the fund'
    }
  }
  console.log('Validate Wager response: ', response)
  return response
}

module.exports = {
  validateWager
}
