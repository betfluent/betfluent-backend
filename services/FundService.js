'use strict'

const {
  onAddFeed,
  onAddOrChangeFeed
} = require('./ServiceUtils')
const betService = require('./BetService')
const firebase = require('../firebase')
const Fund = require('../models/Fund')
const { requiredParam } = require('../utils')

const db = firebase.database()

const closeFund = fundId => {
  if (typeof fundId !== 'string' || fundId.trim().length === 0) {
    return Promise.reject(new Error('fundId must be a non-blank string'))
  }
  return db
    .ref('funds')
    .child(fundId)
    .transaction(fund => {
      if (fund) {
        if (fund.status !== 'OPEN') return // only OPEN funds may be closed
        if (fund.open) fund.open = false
        if (fund.playerCount > 0) {
          fund.status = 'PENDING'
        } else fund.status = 'RETURNED'
      }
      return fund
    })
    .then(result => {
      if (result.committed) {
        const fund = result.snapshot.val()
        betService.getFundBets(fundId).then(bets => {
          bets.forEach(bet => {
            if (!bet.wagered) {
              const pctOfFund = bet.pctOfFund ? bet.pctOfFund : 0
              bet.wagered = Math.floor(fund.amountWagered * pctOfFund / 100)
              betService.saveBet(bet)
            }
          })
        })
      }
      return result
    })
}

const createFund = ({
  closingTime = requiredParam('closingTime'),
  league = requiredParam('league'),
  managerId = requiredParam('managerId'),
  maxBalance = requiredParam('maxBalance'),
  maxInvestment = requiredParam('maxInvestment'),
  minInvestment = requiredParam('minInvestment'),
  name = requiredParam('name'),
  openTimeMillis = requiredParam('openTimeMillis'),
  pctOfFeeCommission = 25,
  percentFee = requiredParam('percentFee'),
  returnTimeMillis = requiredParam('returnTimeMillis'),
  sport = requiredParam('sport'),
  status = requiredParam('status'),
  type = requiredParam('type')
}) => {
  const fund = {
    amountReturned: 0,
    amountWagered: 0,
    balance: 0,
    closedTimeMillis: -1,
    closingTime,
    createdTimeMillis: firebase.database.ServerValue.TIMESTAMP,
    league,
    managerId,
    maxBalance,
    maxInvestment,
    minInvestment,
    name,
    openTimeMillis,
    pctOfFeeCommission,
    percentFee,
    playerCount: 0,
    returnCount: 0,
    returnTimeMillis,
    sport,
    status,
    type
  }
  const fundRef = db
    .ref('funds')
    .push()
  return fundRef
    .set(fund)
    .then(() => fundRef.key)
}

/**
 * @param {string} fundId Non-blank string
 * @returns a Promise containing void
 * @throws an Error if param is not a string or is blank
 */
const deleteFund = async fundId => {
  if (typeof fundId !== 'string' || fundId.trim().length === 0) {
    throw new Error('fundId must be a non-blank string')
  }
  const fund = await getFund(fundId)
  if (!fund || fund.status !== 'STAGED') {
    throw new Error('Only STAGED funds can be deleted')
  }
  const bets = await betService.getFundBets(fundId)
  bets.forEach(bet => {
    betService.deleteBet(bet.id)
  })
  return db
    .ref('funds')
    .child(fundId)
    .remove()
}

const getFund = async fundId => {
  const snapshot = await db
    .ref('funds')
    .child(fundId)
    .once('value')
  return snapshot.exists() ? new Fund(snapshot.val()) : null
}

/**
 * Opens a feed that calls the callback once for every fund with the queried status.
 * @param {string} status 'STAGED' | 'OPEN' | 'PENDING' | 'RETURNED'
 * @param {function} callback function with a single Fund object as an argument
 * @returns {object} An object with an off() function to turn the feed off
 */
const getFundsOnAddFeed = (status, callback) => {
  const ref = db
    .ref('funds')
    .orderByChild('status')
    .equalTo(status)
  return onAddFeed(ref, callback, Fund)
}

/**
 * Opens a feed that calls the callback for every fund with the queried status.
 * Callback may be called more than once per fund if the fund is updated.
 * @param {string} status 'STAGED' | 'OPEN' | 'PENDING' | 'RETURNED'
 * @param {function} callback function with a single Fund object as an argument
 * @returns {object} An object with an off() function to turn the feed off
 */
const getFundsOnAddOrChangeFeed = (status, callback) => {
  const ref = db
    .ref('funds')
    .orderByChild('status')
    .equalTo(status)
  return onAddOrChangeFeed(ref, callback, Fund)
}

const openFund = fundId => {
  if (typeof fundId !== 'string' || fundId.trim().length === 0) {
    return Promise.reject(new Error('fundId must be a non-blank string'))
  }
  return db
    .ref('funds')
    .child(fundId)
    .transaction(fund => {
      if (fund) {
        if (fund.status !== 'STAGED') return // only STAGED funds may be opened
        if (fund.open) fund.open = true
        fund.status = 'OPEN'
      }
      return fund
    })
}

const transactReturnedFundStats = fund => {
  const updateFundStats = fundStats => {
    const updateBaseStats = stats => {
      const incrementStat = stat => {
        stat.count = stat.returnedCount + 1 || 1
        stat.raisedAmount = stat.raisedAmount
          ? stat.raisedAmount + fund.amountWagered
          : fund.amountWagered
        stat.returnedAmount = stat.returnedAmount
          ? stat.returnedAmount + fund.amountReturned
          : fund.amountReturned
        const fundBetCount = fund.wagers
          ? Object.keys(fund.wagers).length
          : 0
        stat.betCount = stat.betCount
          ? stat.betCount + fundBetCount
          : fundBetCount
        stat.profitAmount = stat.profitAmount
          ? stat.profitAmount + fund.profitAmount
          : fund.profitAmount
      }
      incrementStat(stats)

      const type = fund.type.toLowerCase()
      if (!stats[type]) stats[type] = {}
      incrementStat(stats[type])
    }
    updateBaseStats(fundStats)

    const league = fund.league.toLowerCase()
    if (!fundStats.leagues) fundStats.leagues = {}
    if (!fundStats.leagues[league]) fundStats.leagues[league] = {}
    updateBaseStats(fundStats.leagues[league])
  }
  const fundStatsRef = db
    .ref('managerDetails')
    .child(fund.managerId)
    .child('fundStats')

  return fundStatsRef.transaction(fundStats => {
    if (fundStats) updateFundStats(fundStats)
    return fundStats
  }).then(result => {
    if (result.committed && !result.snapshot.exists()) {
      // There was no data at this node & the transaction didn't save data
      const fundStats = {}
      updateFundStats(fundStats)
      return fundStatsRef.set(fundStats)
        .then(() => result)
        .catch(() => ({ committed: false, snapshot: result.snapshot }))
    }
    return result
  })
}

module.exports = {
  closeFund,
  createFund,
  deleteFund,
  getFund,
  getFundsOnAddFeed,
  getFundsOnAddOrChangeFeed,
  openFund
}
