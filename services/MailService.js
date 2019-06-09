'use strict'

const nodemailer = require('nodemailer')
const moment = require('moment')
const path = require('path')
const Email = require('email-templates')
const db = require('./DbService')

const textColor1 = 'rgba(0,0,0,0.87)'
const themeColor = 'rgb(26,102,26)'
const alertColor = '#d50000'

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2
})

const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: 'support@betfluent.com',
    pass: process.env.MAILER_PASSWORD
  }
})

const sender = '"Betfluent" <support@betfluent.com>'

const sendContactUsEmail = ({
  email,
  firstName,
  lastName,
  subject,
  message
}) => {
  const text = `From ${firstName} ${lastName} (${email}):\n\n${message}`
  const mailOptions = {
    from: sender,
    to: sender,
    subject,
    text
  }

  return new Promise((resolve, reject) => {
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        reject(error)
        return console.log(error)
      }
      resolve()
      console.log(`Contact Us Message sent from ${email}: ${info.messageId}`)
    })
  })
}

const sendPendingWithdrawalEmail = function(emailAddress, amount) {
  const formattedAmount = currencyFormatter.format(amount / 100)
  const mailOptions = {
    from: sender,
    to: emailAddress,
    bcc: sender,
    subject: 'Withdrawal Request',
    text: `We've recieved your request to withdraw ${formattedAmount}.`
  }

  return new Promise((resolve, reject) => {
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        reject(error)
        return console.log(error)
      }
      resolve()
      console.log(
        `Pending Withdrawal Message sent to ${emailAddress}: ${info.messageId}`
      )
    })
  })
}

const sendFundBetPlacedEmail = function(users, fund, game, bet) {
  let delay = 0
  users.forEach((user, i) => {
    setTimeout(() => sendUserBetPlacedEmail(user, fund, game, bet), delay)
    delay += 800

    if (i === users.length - 1) {
      setTimeout(() => sendManagerBetPlacedEmail(fund, game, bet), delay)
    }
  })
}

async function sendManagerBetPlacedEmail(fund, game, bet) {
  const manager = await db.getUserWithManagerId(fund.managerId)
  const gameTime = moment(game.scheduledTimeUnix).format('ddd, MMM Do @ h:mm a')
  const atStake = bet.wagered
  const formattedAtStake = currencyFormatter.format(atStake / 100)
  const betType = bet.type.replace('_', '/')

  let couldWin
  if (bet.returning < 0) {
    couldWin = atStake * 100 / Math.abs(bet.returning)
  } else couldWin = atStake * bet.returning / 100
  couldWin = Math.floor(couldWin) + atStake
  const formattedCouldWin = currencyFormatter.format(couldWin / 100)
  const formattedProfit = currencyFormatter.format((couldWin - atStake) / 100)

  const email = new Email({
    message: {
      from: sender
    },
    send: true,
    transport: transporter,
    juice: true,
    juiceResources: {
      preserveImportant: true,
      webResources: {
        relativeTo: path.resolve('emails')
      }
    }
  })

  return email.send({
    template: 'bet-placed',
    message: {
      to: manager.email
    },
    locals: {
      fundId: fund.id,
      fundName: fund.name,
      game,
      gameTime,
      bet,
      formattedAtStake,
      formattedCouldWin,
      formattedProfit,
      betType
    }
  })
}

function sendUserBetPlacedEmail(user, fund, game, bet) {
  const userBet = user.investments[fund.id]
  const gameTime = moment(game.scheduledTimeUnix).format('ddd, MMM Do @ h:mm a')
  const userPortion = Math.abs(userBet) / (userBet > 0 ? fund.amountWagered : fund.fadeAmountWagered)
  const atStake = Math.floor(userPortion * bet.wagered)
  const formattedAtStake = currencyFormatter.format(atStake / 100)
  const betType = bet.type.replace('_', '/')

  let couldWin
  if (bet.returning < 0) {
    couldWin = atStake * 100 / Math.abs(bet.returning)
  } else couldWin = atStake * bet.returning / 100
  couldWin = Math.floor(couldWin) + atStake
  const formattedCouldWin = currencyFormatter.format(couldWin / 100)
  const formattedProfit = currencyFormatter.format((couldWin - atStake) / 100)

  const email = new Email({
    message: {
      from: sender
    },
    send: true,
    transport: transporter,
    juice: true,
    juiceResources: {
      preserveImportant: true,
      webResources: {
        relativeTo: path.resolve('emails')
      }
    }
  })

  return email.send({
    template: 'bet-placed',
    message: {
      to: user.email
    },
    locals: {
      fundId: fund.id,
      fundName: fund.name,
      game,
      gameTime,
      bet,
      formattedAtStake,
      formattedCouldWin,
      formattedProfit,
      betType
    }
  })
}

const sendFundReturnedEmail = function(userAmounts, fund) {
  let delay = 0
  Object.keys(userAmounts).forEach(userId => {
    const user = userAmounts[userId].user
    const amount = userAmounts[userId].amount
    setTimeout(() => sendUserReturnEmail(user, amount, fund), delay)
    delay += 800
  })
}

const sendUserReturnEmail = async (user, amount, fund) => {
  const userWagerAmount = user.investments[fund.id] / 100
  const userPortion = userWagerAmount * 100 / fund.amountWagered
  const userReturnAmount = amount / 100
  const userReturnPct = (
    (userReturnAmount - userWagerAmount) *
    100 /
    userWagerAmount
  ).toFixed(2)
  let userReturnColor = textColor1
  if (userReturnPct > 0) {
    userReturnColor = themeColor
  }
  if (userReturnPct < 0) {
    userReturnColor = alertColor
  }
  const league = fund.league
  let gamePromises = []
  let games
  if (!fund.games) {
    games = null
  } else {
    Object.keys(fund.games).forEach(key => {
      gamePromises.push(db.getGame(league, key))
    })
    games = await Promise.all(gamePromises)
    games.forEach(async game => {
      const bets = await db.getGameBets(game.id)
      game.bets = bets.filter(bet => bet.fundId === fund.id)
      game.bets.forEach(bet => {
        const userBetResult = (
          (bet.returned - bet.wagered) *
          userPortion /
          100
        ).toFixed(2)
        let userBetResultColor = textColor1
        if (userBetResult > 0) {
          userBetResultColor = themeColor
        }
        if (userBetResult < 0) {
          userBetResultColor = alertColor
        }
        bet.userBetResult = currencyFormatter.format(userBetResult)
        bet.userBetResultColor = userBetResultColor
      })
    })
  }

  const email = new Email({
    message: {
      from: sender
    },
    send: true,
    transport: transporter,
    juice: true,
    juiceResources: {
      preserveImportant: true,
      webResources: {
        relativeTo: path.resolve('emails')
      }
    }
  })

  return email.send({
    template: 'fund-returned',
    message: {
      to: user.email
    },
    locals: {
      fundName: fund.name,
      userReturnAmount: currencyFormatter.format(userReturnAmount),
      userReturnColor,
      userWagerAmount: currencyFormatter.format(userWagerAmount),
      userReturnPct,
      games
    }
  })
}

const sendWelcomeEmail = (emailAddress, emailCode) => {
  const email = new Email({
    message: {
      from: sender
    },
    send: true,
    transport: transporter,
    juice: true,
    juiceResources: {
      preserveImportant: true,
      webResources: {
        relativeTo: path.resolve('emails')
      }
    }
  })

  const siteUrl = process.env.BACKEND_ENV === 'debug' ? 'rhode-island-02108.herokuapp.com' : 'www.betfluent.com'

  return email.send({
    template: 'welcome',
    message: {
      to: emailAddress
    },
    locals: {
      emailCode,
      siteUrl
    }
  })
}

const sendTestEmail = async () => {
  const emailCode = '123'
  const email = new Email({
    message: {
      from: sender
    },
    send: true,
    transport: transporter,
    juice: true,
    juiceResources: {
      preserveImportant: true,
      webResources: {
        relativeTo: path.resolve('emails')
      }
    }
  })

  return email.send({
    template: 'welcome',
    message: {
      to: 'jian@betfluent.com, nishon@betfluent.com'
    },
    locals: {
      emailCode
    }
  })
}

const sendManagerTrainingCompleteEmail = async (managerId) => {
  const [user, manager] = await Promise.all([
    db.getUserWithManagerId(managerId),
    db.getManager(managerId)
  ])
  const text = `Manager Training Complete: ${manager.name} (${user.name}) - ${user.email}`
  const mailOptions = {
    from: sender,
    to: 'support@betfluent.com',
    subject: 'BettorHalf: New User',
    text
  }

  return new Promise((resolve, reject) => {
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        reject(error)
        return console.log(error)
      }
      resolve()
      console.log(`Manager completed training with email ${user.email}: ${info.messageId}`)
    })
  })
}

const sendNewUserEmailToRaymour = ({ firstName, lastName, email }) => {
  if (process.env.BACKEND_ENV === 'debug') return
  const text = `New User: ${firstName} ${lastName} (${email})`
  const mailOptions = {
    from: sender,
    to: 'support@betfluent.com',
    subject: 'BettorHalf: New User',
    text
  }

  return new Promise((resolve, reject) => {
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        reject(error)
        return console.log(error)
      }
      resolve()
      console.log(`New User signed up with address ${email}: ${info.messageId}`)
    })
  })
}

const sendUserWageredOnFundEmail = async (user, amount, fund) => {
  const managerUser = await db.getUserWithManagerId(fund.managerId)
  const formattedAmount = currencyFormatter.format(Math.abs(amount) / 100)
  const text = amount > 0 ? `${user.name} contributed ${formattedAmount} to ${fund.name}` : `${user.name} faded ${fund.name} by ${formattedAmount}`
  const mailOptions = {
    from: sender,
    to: managerUser.email,
    subject: `${user.name} contributed to ${fund.name}`,
    text
  }

  return new Promise((resolve, reject) => {
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        reject(error)
        return console.log(error)
      }
      resolve()
    })
  })
}

const sendFundIsClosedEmailToManager = async fund => {
  if (fund.playerCount > 0) {
    const managerUser = await db.getUserWithManagerId(fund.managerId)
    const formattedAmount = currencyFormatter.format(fund.amountWagered / 100)
    const text = `${fund.playerCount} user${fund.playerCount === 1 ? ' has' : 's have'} pooled a total of ${
      formattedAmount} with ${fund.name} for you to manage.`
    const mailOptions = {
      from: sender,
      to: managerUser.email,
      subject: `${fund.name} has closed and is ready for betting!`,
      text
    }

    return new Promise((resolve, reject) => {
      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          reject(error)
          return console.log(error)
        }
        resolve()
      })
    })
  }
}

module.exports = {
  sendContactUsEmail,
  sendPendingWithdrawalEmail,
  sendFundBetPlacedEmail,
  sendFundReturnedEmail,
  sendWelcomeEmail,
  sendTestEmail,
  sendManagerTrainingCompleteEmail,
  sendNewUserEmailToRaymour,
  sendUserWageredOnFundEmail,
  sendFundIsClosedEmailToManager
}
