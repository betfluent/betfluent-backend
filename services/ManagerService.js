'use strict'

const schedule = require('node-schedule')
const db = require('./DbService')
const mailer = require('./MailService')
const Fund = require('../models/Fund')
const { isEmpty } = require('../utils')

const returnFund = (fundId) => db.returnFund(fundId)
  .then(result => {
    if (result.data) {
      const { successes, fund } = result.data

      const emailSuccesses = async () => {
        const successUsers = await Promise.all(Object.keys(successes).map(userId => db.getUser(userId)))
        const emailUserAmounts = successUsers
          .filter(user => user.preferences.receiveReturnEmail)
          .reduce((map, user) => {
            map[user.id] = {
              user,
              amount: successes[user.id]
            }
            return map
          }, {})
          
        mailer.sendFundReturnedEmail(emailUserAmounts, fund)
      }
      if (successes && !isEmpty(successes)) emailSuccesses()

      if (result.status === 'success' && fund.isTraining) {
        db.updateManager(fund.managerId, { isTraining: null })
      }
    }
    return result
  })

const fundOpenJobs = {}
const fundCloseJobs = {}
const fundReturnJobs = {}

const scheduleFundOpening = (fundId, openTimeMillis) => {
  if (fundOpenJobs[fundId]) fundOpenJobs[fundId].cancel()
  const openingDate = new Date(openTimeMillis)
  fundOpenJobs[fundId] = schedule.scheduleJob(openingDate, () => {
    db.openFund(fundId)
  })
  console.log('----- FUND SCHEDULED TO OPEN: ', `${fundId} @ ${openingDate}`)
}

const scheduleFundClosing = (fundId, closeTimeMillis) => {
  if (fundCloseJobs[fundId]) fundCloseJobs[fundId].cancel()
  const closingDate = new Date(closeTimeMillis)
  fundCloseJobs[fundId] = schedule.scheduleJob(closingDate, async () => {
    const result = await db.closeFund(fundId)
    if (result.committed) {
      const fund = result.snapshot.val()
      mailer.sendFundIsClosedEmailToManager(fund)
    }
  })
  console.log('----- FUND SCHEDULED TO CLOSE: ', `${fundId} @ ${closingDate}`)
}

const scheduleFundReturning = (fundId, returnTimeMillis) => {
  if (fundReturnJobs[fundId]) fundReturnJobs[fundId].cancel()
  const returningDate = new Date(returnTimeMillis)
  fundReturnJobs[fundId] = schedule.scheduleJob(returningDate, () => {
    returnFund(fundId)
  })
  console.log('----- FUND SCHEDULED TO RETURN: ', `${fundId} @ ${returningDate}`)
}

const betPlaceJobs = {}

const scheduleBetPlacing = async (bet) => {
  const game = await db.getGame(bet.gameLeague, bet.gameId)
  if (game.status === 'complete' || game.status === 'closed') {
    db.deleteBet(bet.id)
    return
  }
  const betDate = new Date(game.scheduledTimeUnix - (10 * 60 * 1000))
  if (Date.now() >= betDate.getTime()) {
    placeFundBet(bet)
  } else {
    if (betPlaceJobs[bet.id]) betPlaceJobs[bet.id].cancel()
    betPlaceJobs[bet.id] = schedule.scheduleJob(betDate, () => {
      placeFundBet(bet)
    })
    console.log('----- BET SCHEDULED TO PLACE: ', `${bet.explanation()} @ ${betDate}`)
  }
}

const cancelStagedBet = (bet) => {
  if (betPlaceJobs[bet.id]) betPlaceJobs[bet.id].cancel()
  console.log('----- BET REMOVED: ', `${bet.explanation()}`)
}

const placeFundBet = async (bet) => {
  const fundBetTransaction = await db.transactFundBet(bet)

  const onTransactionSuccess = async () => {
    const fund = new Fund(fundBetTransaction.snapshot.val())
    const game = await db.getGame(bet.gameLeague, bet.gameId)
    const users = await db.getUsersInFund(bet.fundId)
    const usersToEmail = users.filter(user => user.preferences.receiveBetEmail)
    const longUsers = usersToEmail.filter(u => u.investments[fund.id] > 0)
    const fadeUsers = usersToEmail.filter(u => u.investments[fund.id] < 0)
    if (bet.fade) mailer.sendFundBetPlacedEmail(longUsers, fund, game, bet)
    else mailer.sendFundBetPlacedEmail(fadeUsers, fund, game, bet)
  }

  if (fundBetTransaction.committed) {
    onTransactionSuccess()
    return {
      status: 'success',
      data: bet
    }
  } else {
    return {
      status: 'fail',
      message: 'Cannot bet more than fund balance or less than zero'
    }
  }
}

/***************************
 *
 * PERFORMANCE STATISTICS
 *
 **************************/

const getPastBetPerformance = async (managerId, { onlyTraining, sinceTimeMillis }) => {
  const updateBetPlacedStats = (stats, bet) => {
    const incrementStat = (stat) => {
      stat.placedCount = (stat.placedCount + 1 || 1)
      stat.placedAmount = (stat.placedAmount + bet.wagered || bet.wagered)
    }

    incrementStat(stats)
    switch (bet.type) {
      case 'MONEYLINE':
      case 'SPREAD':
        const type = bet.type.toLowerCase()
        if (!stats[type]) stats[type] = {}
        incrementStat(stats[type])
        break
      case 'OVER_UNDER':
        if (!stats.overUnder) stats.overUnder = {}
        incrementStat(stats.overUnder)
        break
    }
  }

  const updateBetResultStats = (stats, bet) => {
    const incrementStat = (stat) => {
      if (!stat.currentStreak) stat.currentStreak = 0
      if (bet.returned === 0) {
        stat.loseCount = (stat.loseCount + 1 || 1)
        stat.loseAmount = stat.loseAmount
          ? stat.loseAmount + bet.relativeResultAmount()
          : bet.relativeResultAmount()
        stat.currentStreak = stat.currentStreak < 0
          ? stat.currentStreak - 1
          : -1
      } else if (bet.returned > bet.wagered) {
        stat.winCount = (stat.winCount + 1 || 1)
        stat.winAmount = stat.winAmount
          ? stat.winAmount + bet.relativeResultAmount()
          : bet.relativeResultAmount()
        stat.currentStreak = stat.currentStreak > 0
          ? stat.currentStreak + 1
          : 1
      } else if (bet.returned === bet.wagered) {
        stat.pushCount = (stat.pushCount + 1 || 1)
        stat.pushAmount = (stat.pushAmount + bet.wagered || bet.wagered)
      }
      if (stat.currentStreak) {
        if (
          !stat.longestStreak ||
          Math.abs(stat.currentStreak) > Math.abs(stat.longestStreak)
        ) {
          stat.longestStreak = stat.currentStreak
        }
      }
    }
    incrementStat(stats)
    switch (bet.type) {
      case 'MONEYLINE':
      case 'SPREAD':
        const type = bet.type.toLowerCase()
        if (!stats[type]) stats[type] = {}
        incrementStat(stats[type])
        break
      case 'OVER_UNDER':
        if (!stats.overUnder) stats.overUnder = {}
        incrementStat(stats.overUnder)
        break
    }
  }

  const baseStats = () => ({
    currentStreak: 0,
    longestStreak: 0,
    loseAmount: 0,
    loseCount: 0,
    placedAmount: 0,
    placedCount: 0,
    pushAmount: 0,
    pushCount: 0,
    winAmount: 0,
    winCount: 0
  })
  const betStats = Object.assign(baseStats(), {
    moneyline: baseStats(),
    overUnder: baseStats(),
    spread: baseStats()
  })

  const bets = await db.getManagerBets(managerId)
  bets
    .filter(bet => {
      let meetsRequirements = bet.status !== 'STAGED' &&
        onlyTraining === 'true' ? bet.isTraining : !bet.isTraining

      if (meetsRequirements && sinceTimeMillis > 0) {
        meetsRequirements = meetsRequirements && bet.createdTimeMillis > sinceTimeMillis
      }
      return meetsRequirements
    })
    .sort((bet1, bet2) => {
      if (!bet1.createdTimeMillis && bet2.createdTimeMillis) {
        return -1
      } else if (bet1.createdTimeMillis && !bet2.createdTimeMillis) {
        return 1
      }
      return bet1.createdTimeMillis - bet2.createdTimeMillis
    })
    .forEach(bet => {
      updateBetPlacedStats(betStats, bet)

      const league = bet.gameLeague.toLowerCase()
      if (!betStats[league]) betStats[league] = {}
      updateBetPlacedStats(betStats[league], bet)
      if (bet.returned !== -1) {
        updateBetResultStats(betStats, bet)
        updateBetResultStats(betStats[league], bet)
      }
    })
  return betStats
}

module.exports = {
  returnFund,
  scheduleFundOpening,
  scheduleFundClosing,
  scheduleFundReturning,
  scheduleBetPlacing,
  cancelStagedBet,
  placeFundBet,
  getPastBetPerformance
}
