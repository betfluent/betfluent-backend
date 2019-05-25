'use strict'

const db = require('./services/DbService')
const manager = require('./services/ManagerService')

const watchStagedFunds = () => {
  db.getFundsOnAddOrChangeFeed('STAGED', fund => {
    if (Date.now() >= fund.openTimeMillis) {
      db.openFund(fund.id)
    } else if (fund.openTimeMillis) {
      manager.scheduleFundOpening(fund.id, fund.openTimeMillis)
    }
  })
}

const watchOpenFunds = () => {
  db.getFundsOnAddOrChangeFeed('OPEN', async fund => {
    if (Date.now() >= fund.closingTime * 1000) {
      const result = await db.closeFund(fund.id)
      if (result.committed) {
        const closedFund = result.snapshot.val()
      }
    } else {
      manager.scheduleFundClosing(fund.id, fund.closingTime * 1000)
    }
  })
}

const watchPendingFunds = () => {
  db.getFundsOnAddOrChangeFeed('PENDING', fund => {
    let returning = false
    db.getGamesByFundOnAddOrChangeFeed(fund.id, games => {
      const gamesClosed = Object.keys(games).reduce((obj, gameId) => {
        obj[gameId] = false
        return obj
      }, {})
      Object.keys(games).map(gameId => {
        db.getGamesOnAddOrChangeFeed(
          fund.league.toLowerCase(),
          gameId,
          game => {
            if (game.status === 'closed') gamesClosed[game.id] = true
            const fundDone = Object.keys(gamesClosed).every(gameId =>
              gamesClosed[gameId]
            )
            if (fundDone && !returning) {
              returning = true
              manager.scheduleFundReturning(fund.id, Date.now() + 15 * 60 * 1000)
            }
          })
      })
    })
  })
}

const watchStagedBets = () => {
  db.getBetsOnAddOrChangeFeed('STAGED', bet => {
    manager.scheduleBetPlacing(bet)
  })
}

const watchCancelledBets = () => {
  db.getBetsOnRemoveFeed(bet => {
    manager.cancelStagedBet(bet)
  })
}

const start = function () {
  watchStagedFunds()
  watchOpenFunds()
  watchPendingFunds()
  watchStagedBets()
  watchCancelledBets()
}

module.exports = {
  start
}
