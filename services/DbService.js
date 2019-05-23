'use strict'

const _ = require('lodash')
const firebase = require('../firebase')
const db = firebase.database()
const Fund = require('../models/Fund')
const Game = require('../models/Game')
const Team = require('../models/Team')
const Bet = require('../models/Bet')
const User = require('../models/User')
const Manager = require('../models/Manager')
const { isEmpty, getValueOfKey } = require('../utils')

/** Maps userIds to publicUserIds */
const publicUserIdMap = {}
/** Maps userIds to managerIds */
const managerIdMap = {}
/** Maps userIds to onfido applicantIds */
const applicantIdMap = {}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2
})

const onFeed = (ref, callback, Model) => {
  const feed = ref.on('value', snapshot => {
    if (snapshot.exists()) {
      if (Model) callback(new Model(snapshot.val()))
      else callback(snapshot.val())
    }
  })
  return {
    off: () => {
      ref.off('value', feed)
    }
  }
}

const onAddFeed = (ref, callback, Model) => {
  const addFeed = ref.on('child_added', snapshot => {
    if (snapshot.exists()) {
      if (Model) callback(new Model(snapshot.val()))
      else callback(snapshot.val())
    }
  })
  return {
    off: () => {
      ref.off('child_added', addFeed)
    }
  }
}

const onAddOrChangeFeed = (ref, callback, Model) => {
  const onEvent = snapshot => {
    if (snapshot.exists()) {
      if (Model) callback(new Model(snapshot.val()))
      else callback(snapshot.val())
    }
  }
  const addFeed = ref.on('child_added', onEvent)
  const changeFeed = ref.on('child_changed', onEvent)
  return {
    off: () => {
      ref.off('child_added', addFeed)
      ref.off('child_changed', changeFeed)
    }
  }
}

const onRemoveFeed = (ref, callback, Model) => {
  const removeFeed = ref.on('child_removed', snapshot => {
    if (snapshot.exists()) {
      if (Model) callback(new Model(snapshot.val()))
      else callback(snapshot.val())
    }
  })
  return {
    off: () => {
      ref.off('child_removed', removeFeed)
    }
  }
}

const createNewUserData = ({ userId, email, firstName, lastName, dob, ...address }) => {
  const newUser = {
    approved: false,
    balance: 0,
    email,
    id: userId,
    publicId: getNewUid(),
    joinDate: firebase.database.ServerValue.TIMESTAMP,
    name: `${firstName} ${lastName}`,
    preferences: {
      receiveBetEmail: true,
      receiveReturnEmail: true
    }
  }

  const newUserIdentity = {
    dateOfBirth: dob,
    dateUpdated: firebase.database.ServerValue.TIMESTAMP,
    emailAddress: email,
    firstName,
    id: userId,
    lastName,
    userId,
    ...address
  }

  const newPublicUser = {
    id: newUser.publicId,
    name: `${firstName} ${lastName.charAt()}.`,
    joinTimeMillis: firebase.database.ServerValue.TIMESTAMP
  }

  const emailVerification = {
    code: getNewUid(),
    expiration: Date.now() + 24 * 60 * 60 * 1000
  }

  const newData = {}
  newData[`users/${userId}`] = newUser
  newData[`userIdentities/${userId}`] = newUserIdentity
  newData[`public/users/${newUser.publicId}`] = newPublicUser
  newData[`emailVerifications/${userId}`] = emailVerification

  return firebase
    .database()
    .ref()
    .update(newData)
    .then(() => emailVerification.code)
}

const getNewUid = () =>
  firebase
    .database()
    .ref()
    .push().key

const getWeek = (timeMillis) => {
  const ONE_WEEK_MILLIS = 7 * 24 * 60 * 60 * 1000
  const millisSinceStart = timeMillis - 1528700400000 // Monday June 11th 12:00am PT
  return Math.floor(millisSinceStart / ONE_WEEK_MILLIS)
    .toLocaleString(undefined, { minimumIntegerDigits: 3 })
}

const getUserIdFromPublicUserId = async publicUserId => {
  let userId = Object.keys(publicUserIdMap).find(
    userId => publicUserIdMap[userId] === publicUserId
  )
  if (userId) return userId
  const snapshot = await db
    .ref('users')
    .orderByChild('publicId')
    .equalTo(publicUserId)
    .once('value')
  if (snapshot.exists() && snapshot.hasChildren()) {
    userId = Object.keys(snapshot.val())[0]
    publicUserIdMap[userId] = publicUserId
  }
  return userId
}

const getUserIdFromOnfidoApplicantId = async applicantId => {
  let userId = Object.keys(applicantIdMap).find(
    userId => applicantIdMap[userId] === applicantId
  )
  if (userId) return userId
  const snapshot = await db
    .ref('onfido/applicantIds')
    .orderByValue()
    .equalTo(applicantId)
    .once('value')
  if (snapshot.exists() && snapshot.hasChildren()) {
    userId = Object.keys(snapshot.val())[0]
    applicantIdMap[userId] = applicantId
  }
  return userId
}

const getPublicUserId = async userId => {
  if (publicUserIdMap[userId]) return publicUserIdMap[userId]
  const user = await getUser(userId)
  publicUserIdMap[userId] = user.publicId
  return user.publicId
}

const getManagerId = async userId => {
  if (managerIdMap[userId]) return managerIdMap[userId]
  const user = await getUser(userId)
  if (user.managerId) {
    managerIdMap[userId] = user.managerId
    return user.managerId
  }
  return null
}

const getOnfidoApplicantId = async userId => {
  if (applicantIdMap[userId]) return applicantIdMap[userId]
  const snapshot = await db
    .ref('onfido/applicantIds')
    .child(userId)
    .once('value')
  if (snapshot.exists()) applicantIdMap[userId] = snapshot.val()
  return snapshot.val()
}

const isUserApproved = async userId => {
  const snapshot = await db
    .ref('users')
    .child(userId)
    .child('approved')
    .once('value')
  return snapshot.val()
}

const getUser = async userId => {
  const snapshot = await db
    .ref('users')
    .child(userId)
    .once('value')
  return snapshot.exists() ? new User(snapshot.val()) : null
}

const getUserWithManagerId = async managerId => {
  const snapshot = await db
    .ref('users')
    .orderByChild('managerId')
    .equalTo(managerId)
    .once('value')
  if (snapshot.hasChildren()) {
    const userData = Object.values(snapshot.val())[0]
    return new User(userData)
  }
  return null
}

const getUserEmailVerificationInfo = async userId => {
  const snapshot = await db
    .ref('emailVerifications')
    .child(userId)
    .once('value')
  return snapshot.val()
}

const getUserIdentity = async userId => {
  const snapshot = await db
    .ref('userIdentities')
    .child(userId)
    .once('value')
  return snapshot.val()
}

const getPublicUser = async publicUserId => {
  const snapshot = await db
    .ref('public/users')
    .child(publicUserId)
    .once('value')
  return snapshot.val()
}

const getManager = async managerId => {
  const snapshot = await db
    .ref('managers')
    .child(managerId)
    .once('value')
  return snapshot.exists() ? new Manager(snapshot.val()) : null
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

/**
 * Opens a feed that calls the callback for every game with the queried status.
 * Callback may be called more than once per game if the game is updated.
 * @param {string} league
 * @param {number} startTime
 * @param {function} callback function with a single Game object as an argument
 * @returns {object} An object with an off() function to turn the feed off
 */
const getGamesOnAddOrChangeFeed = (league, gameId, callback) => {
  const ref = db
    .ref(league)
    .child('games')
    .child(gameId)

  return onFeed(ref, callback, Game)
}

const getTeam = async (league, teamId) => {
  const snapshot = await db
    .ref(league.toLowerCase())
    .child('teams')
    .child(teamId)
    .once('value')
  return snapshot.exists() ? new Team(snapshot.val()) : null
}

const getGame = async (league, gameId) => {
  const snapshot = await db
    .ref(league.toLowerCase())
    .child('games')
    .child(gameId)
    .once('value')
  if (snapshot.exists()) {
    const game = snapshot.val()
    const [awayTeam, homeTeam] = await Promise.all([
      getTeam(league, game.awayTeamId),
      getTeam(league, game.homeTeamId)
    ])
    return new Game(game, awayTeam, homeTeam)
  }
  return null
}

const getGameByTimeAndTeams = async (league, timeMillis, teamNamesArr) => {
  const snapshot = await db
    .ref(league.toLowerCase())
    .child('games')
    .orderByChild('scheduledTimeUnix')
    .startAt(timeMillis - 60 * 60 * 1000)
    .endAt(timeMillis + 3 * 60 * 60 * 1000)
    .once('value')

  if (snapshot.exists() && snapshot.hasChildren()) {
    const games = Object.values(snapshot.val())
    return games.find(({ description }) => {
      const descriptionArr = description.toLowerCase().split(' at ')
      return teamNamesArr.reduce((bool, teamName) => {
        return bool && descriptionArr.includes(teamName.toLowerCase())
      }, true)
    })
  }
  return null
}

const getBet = async betId => {
  const snapshot = await db
    .ref('wagers')
    .child(betId)
    .once('value')
  return snapshot.exists() ? new Bet(snapshot.val()) : null
}

/**
 * @param {string} fundId Non-blank string
 * @returns A Promise containing an array of bets, or an empty array if no bets exist for this fund
 */
const getFundBets = async fundId => {
  const snapshot = await db
    .ref('wagers')
    .orderByChild('fundId')
    .equalTo(fundId)
    .once('value')
  if (snapshot.exists() && snapshot.hasChildren()) {
    const betsMap = snapshot.val()
    return Object.keys(betsMap).map(id => new Bet(betsMap[id]))
  } else return []
}

/**
 * @param {string} gameId Non-blank string
 * @returns A Promise containing an array of bets, or an empty array if no bets exist for this fund
 */
const getGameBets = async gameId => {
  const snapshot = await db
    .ref('wagers')
    .orderByChild('gameId')
    .equalTo(gameId)
    .once('value')
  if (snapshot.exists() && snapshot.hasChildren()) {
    const betsMap = snapshot.val()
    return Object.keys(betsMap).map(id => new Bet(betsMap[id]))
  } else return []
}

/**
 * @param {string} managerId Non-blank string
 * @returns A Promise containing an array of bets, or an empty array if no bets exist for this manager
 */
const getManagerBets = async managerId => {
  const snapshot = await db
    .ref('wagers')
    .orderByChild('managerId')
    .equalTo(managerId)
    .once('value')
  if (snapshot.exists() && snapshot.hasChildren()) {
    const betsMap = snapshot.val()
    return Object.keys(betsMap).map(id => new Bet(betsMap[id]))
  } else return []
}

/**
 * Opens a feed that calls the callback for every bet with the queried status.
 * Callback may be called more than once per bet if the bet is updated.
 * @param {string} status 'STAGED' | 'LIVE' | 'RETURNED'
 * @param {function} callback function with a single Bet object as an argument
 * @returns {object} An object with an off() function to turn the feed off
 */
const getBetsOnAddOrChangeFeed = (status, callback) => {
  const ref = db
    .ref('wagers')
    .orderByChild('status')
    .equalTo(status)
  return onAddOrChangeFeed(ref, callback, Bet)
}

const getGamesByFundOnAddOrChangeFeed = (fundId, callback) => {
  const ref = db
    .ref('fundDetails')
    .child(fundId)
    .child('potentialGames')

  return onFeed(ref, callback)
}

/**
 * Opens a feed that calls the callback once for every bet that is deleted.
 * @param {function} callback function with the deleted Bet object as an argument
 */
const getBetsOnRemoveFeed = callback =>
  onRemoveFeed(db.ref('wagers'), callback, Bet)

const getUserBetPrediction = async (publicUserId, betId) => {
  const snapshot = await db
    .ref('predictions')
    .child(publicUserId)
    .child(betId)
    .once('value')
  return snapshot.val()
}

const getUsersInFund = async fundId => {
  const snapshot = await db
    .ref('users')
    .orderByChild(`investments/${fundId}`)
    .once('value')
  if (snapshot.exists() && snapshot.hasChildren()) {
    const usersMap = snapshot.val()
    return Object.keys(usersMap).map(id => new User(usersMap[id]))
  } else return []
}

const getPublicUsersWhoPredictedBet = async betId => {
  const snapshot = await db
    .ref('predictions')
    .orderByChild(`${betId}/createdTimeMillis`)
    .startAt(0)
    .once('value')
  if (snapshot.exists() && snapshot.hasChildren()) {
    const usersMap = snapshot.val()
    return Promise.all(Object.keys(usersMap).map(id => getPublicUser(id)))
  } else return []
}

const getUserTransactions = async userId => {
  const snapshot = await db
    .ref('transactions')
    .orderByChild('userId')
    .equalTo(userId)
    .once('value')
  if (snapshot.exists() && snapshot.hasChildren()) {
    return Object.values(snapshot.val())
  } else return []
}

const getSession = async sessionId => {
  const snapshot = await db
    .ref('sessions')
    .child(sessionId)
    .once('value')
  return snapshot.val()
}

const getAllSessions = async () => {
  const snapshot = await db.ref('sessions').once('value')
  if (snapshot.exists() && snapshot.hasChildren()) {
    const sessionMap = snapshot.val()
    return Object.keys(sessionMap).map(id => sessionMap[id])
  } else return []
}

const getUserSessions = async userId => {
  const snapshot = await db
    .ref('sessions')
    .orderByChild('userId')
    .equalTo(userId)
    .once('value')
  if (snapshot.exists() && snapshot.hasChildren()) {
    const sessionMap = snapshot.val()
    return Object.keys(sessionMap).map(id => sessionMap[id])
  } else return []
}

const getSessionResponses = async sessionId => {
  const snapshot = await db
    .ref('sessionResponses')
    .orderByChild('sessionId')
    .equalTo(sessionId)
    .once('value')
  if (snapshot.exists() && snapshot.hasChildren()) {
    return Object.values(snapshot.val())
  } else return []
}

const getAllSessionResponses = async () => {
  const snapshot = await db.ref('sessionResponses').once('value')
  if (snapshot.exists() && snapshot.hasChildren()) {
    const sessionMap = snapshot.val()
    return Object.keys(sessionMap).map(id => sessionMap[id])
  } else return []
}

const getUserSessionResponses = async userId => {
  const snapshot = await db
    .ref('sessionResponses')
    .orderByChild('userId')
    .equalTo(userId)
    .once('value')
  if (snapshot.exists() && snapshot.hasChildren()) {
    const sessionMap = snapshot.val()
    return Object.keys(sessionMap).map(id => sessionMap[id])
  } else return []
}

const updateUser = (userId, updates) => {
  if (typeof userId !== 'string' || userId.trim().length === 0) {
    return Promise.reject(new Error('userId must be a non-blank string'))
  }
  return db
    .ref('users')
    .child(userId)
    .update(updates)
}

const updatePublicUser = (publicUserId, updates) => {
  if (typeof publicUserId !== 'string' || publicUserId.trim().length === 0) {
    return Promise.reject(new Error('publicUserId must be a non-blank string'))
  }
  return db
    .ref('public/users')
    .child(publicUserId)
    .update(updates)
}

const updateUserIdentity = (userId, updates) => {
  if (typeof userId !== 'string' || userId.trim().length === 0) {
    return Promise.reject(new Error('userId must be a non-blank string'))
  }
  return db
    .ref('userIdentities')
    .child(userId)
    .update(
      Object.assign(
        { updatedTimeMillis: firebase.database.ServerValue.TIMESTAMP },
        updates
      )
    )
}

const updateManager = (managerId, updates) => {
  if (typeof managerId !== 'string' || managerId.trim().length === 0) {
    return Promise.reject(new Error('managerId must be a non-blank string'))
  }
  return db
    .ref('managers')
    .child(managerId)
    .update(updates)
}

const saveSession = session => {
  if (typeof session.id !== 'string' || session.id.trim().length === 0) {
    return Promise.reject(new Error('session.id must be a non-blank string'))
  }
  session.createdTimeMillis = firebase.database.ServerValue.TIMESTAMP
  return db
    .ref('sessions')
    .child(session.id)
    .set(session)
    .then(() => console.log('---------- Session:', session))
}

const saveSessionResponse = (session, response) => {
  const sessionResponse = {
    userId: session.userId,
    createdTimeMillis: firebase.database.ServerValue.TIMESTAMP,
    sessionId: session.id,
    serviceType: session.serviceType,
    raw: JSON.stringify(response)
  }
  const reasonCodes = getValueOfKey('ReasonCodes', response)
  if (reasonCodes) {
    // Reduce the array of codes to a map where each code = true
    // This is to be able to query where code == true in database
    sessionResponse.reasonCodes = reasonCodes.reduce((map, code) => {
      map[code] = true
      return map
    }, {})
  }
  return db
    .ref('sessionResponses')
    .push(sessionResponse)
    .then(() => console.log('---------- SessionResponse:', sessionResponse))
}

const saveBet = bet => {
  if (!bet.id) {
    bet.id = db.ref('wagers').push().key
  }
  if (!bet.createdTimeMillis) {
    bet.createdTimeMillis = firebase.database.ServerValue.TIMESTAMP
  }
  return db
    .ref('wagers')
    .child(bet.id)
    .set(bet)
}

const savePrediction = prediction => {
  if (
    typeof prediction.userId !== 'string' ||
    prediction.userId.trim().length === 0
  ) {
    return Promise.reject(
      new Error('prediction.userId must be a non-blank string')
    )
  }
  if (
    typeof prediction.betId !== 'string' ||
    prediction.betId.trim().length === 0
  ) {
    return Promise.reject(
      new Error('prediction.betId must be a non-blank string')
    )
  }
  return db
    .ref('predictions')
    .child(prediction.userId)
    .child(prediction.betId)
    .set(prediction)
}

function saveInteraction(interaction, id) {
  console.log('---------- NEW INTERACTION: ', interaction)
  if (typeof id !== 'string') {
    return db.ref('interactions').push(interaction)
  } else {
    return db
      .ref('interactions')
      .child(id)
      .set(interaction)
  }
}

const saveTransaction = transaction => {
  if (
    typeof transaction.id !== 'string' ||
    transaction.id.trim().length === 0
  ) {
    return Promise.reject(
      new Error('transaction.id must be a non-blank string')
    )
  }
  if (
    typeof transaction.userId !== 'string' ||
    transaction.userId.trim().length === 0
  ) {
    return Promise.reject(
      new Error('transaction.userId must be a non-blank string')
    )
  }
  if (
    typeof transaction.sessionId !== 'string' ||
    transaction.sessionId.trim().length === 0
  ) {
    return Promise.reject(
      new Error('transaction.sessionId must be a non-blank string')
    )
  }
  transaction.updatedTimeMillis = firebase.database.ServerValue.TIMESTAMP
  let prevStatus
  const transactionRef = db.ref('transactions').child(transaction.id)
  return transactionRef
    .transaction(
      dbTransaction => {
        if (dbTransaction) {
          // do not allow duplicate updates of transactions
          if (dbTransaction.status === transaction.status) return
          prevStatus = dbTransaction.status

          Object.keys(transaction).forEach(key => {
            dbTransaction[key] = transaction[key]
          })
        }
        return dbTransaction
      },
      (err, committed, snapshot) => {
        if (err) {
          console.log('ERROR Save Transaction', err.message)
        } else if (committed && !snapshot.exists()) {
          // There was no data at this node & the transaction didn't save data
          transaction.createdTimeMillis =
            firebase.database.ServerValue.TIMESTAMP
          transactionRef.set(transaction)
        }
      }
    )
    .then(result => {
      result.prevStatus = prevStatus
      return result
    })
}

const saveOnfidoApplicantId = (userId, applicantId) => {
  if (typeof userId !== 'string' || userId.trim().length === 0) {
    return Promise.reject(new Error('userId must be a non-blank string'))
  }
  if (typeof applicantId !== 'string' || applicantId.trim().length === 0) {
    return Promise.reject(new Error('applicantId must be a non-blank string'))
  }
  applicantIdMap[userId] = applicantId
  return db
    .ref('onfido/applicantIds')
    .child(userId)
    .set(applicantId)
}

const saveLobCheck = check => {
  if (!check.createdTimeMillis) {
    check.createdTimeMillis = firebase.database.ServerValue.TIMESTAMP
  }
  return db
    .ref('checks')
    .child(check.id)
    .set(check)
}

/**
 * @param {string} betId Non-blank string
 * @returns a Promise containing void
 * @throws an Error if param is not a string or is blank
 */
const deleteBet = betId => {
  if (typeof betId !== 'string' || betId.trim().length === 0) {
    throw new Error('betId must be a non-blank string')
  }
  return db
    .ref('wagers')
    .child(betId)
    .remove()
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
  const bets = await getFundBets(fundId)
  bets.forEach(bet => {
    deleteBet(bet.id)
  })
  return db
    .ref('funds')
    .child(fundId)
    .remove()
}

const deleteLobCheck = checkId => {
  if (typeof checkId !== 'string' || checkId.trim().length === 0) {
    throw new Error('checkId must be a non-blank string')
  }
  return db
    .ref('checks')
    .child(checkId)
    .remove()
}

const deleteUserEmailVerificationInfo = userId => {
  if (typeof userId !== 'string' || userId.trim().length === 0) {
    throw new Error('userId must be a non-blank string')
  }
  return db
    .ref('emailVerifications')
    .child(userId)
    .remove()
}

const toggleIsUserApproved = (userId, isApproved) => {
  if (typeof userId !== 'string' || userId.trim().length === 0) {
    return Promise.reject(new Error('userId must be a non-blank string'))
  }
  if (typeof isApproved !== 'boolean') {
    return Promise.reject(new Error('isApproved must be a boolean value'))
  }
  return db
    .ref('users')
    .child(userId)
    .transaction(user => {
      if (user) {
        user.approved = isApproved
      }
      return user
    })
}

/**
 * Updates a user's documentStatus. Given a PENDING or VERIFIED documentStatus and
 * if their identity has been verified, the user.approved flag is set to true.
 * Given a FAIL or RETRY documentStatus, user.approved is set to false.
 * @param {string} userId Non-blank string
 * @param {string} newDocumentStatus 'PENDING' | 'VERIFIED' | 'FAIL' | 'RETRY'
 * @returns {object} A Promise object with a 'committed' boolean and a 'snapshot' firebase snapshot
 */
const updateUserDocumentStatus = (userId, newDocumentStatus) => {
  if (typeof userId !== 'string' || userId.trim().length === 0) {
    return Promise.reject(new Error('userId must be a non-blank string'))
  }
  switch (newDocumentStatus) {
    case 'PENDING':
    case 'VERIFIED':
    case 'FAIL':
    case 'RETRY':
      break
    default:
      return Promise.reject(
        new Error(
          'documentStatus must equal "PENDING" | "VERIFIED" | "FAIL" | "RETRY"'
        )
      )
  }
  return db
    .ref('users')
    .child(userId)
    .transaction(
      user => {
        if (user) {
          if (user.documentStatus === 'VERIFIED' || user.documentStatus === newDocumentStatus) {
            return // abort if user is already verified or if new status is same as existing to ensure no duplicate interactions
          }
          user.documentStatus = newDocumentStatus
          switch (newDocumentStatus) {
            case 'PENDING':
            case 'VERIFIED':
              if (user.identityVerified) {
                user.approved = true
              }
              break
            case 'FAIL':
            case 'RETRY':
              user.approved = false
              break
          }
        }
        return user
      },
      (_, committed, snapshot) => {
        if (
          committed &&
          (newDocumentStatus === 'VERIFIED' || newDocumentStatus === 'FAIL')
        ) {
          const user = snapshot.val()
          const interaction = {
            time: firebase.database.ServerValue.TIMESTAMP,
            type: `DOCUMENT ${newDocumentStatus}`,
            userId: user.id,
            userName: user.name
          }
          saveInteraction(interaction)
        }
      }
    )
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
        if (fund.balance > 0) {
          fund.status = 'PENDING'
        } else fund.status = 'RETURNED'
      }
      return fund
    })
    .then(result => {
      if (result.committed) {
        const fund = result.snapshot.val()
        getFundBets(fundId).then(bets => {
          bets.forEach(bet => {
            if (!bet.wagered) {
              const pctOfFund = bet.pctOfFund ? bet.pctOfFund : 0
              bet.wagered = Math.floor(fund.amountWagered * pctOfFund / 100)
              saveBet(bet)
            }
          })
        })
      }
      return result
    })
}

/**
 * @param {string} userId non-blank string
 * @param {function} updateUserFunc function with a single User object as an argument
 */
const transactUserUpdate = (userId, updateUserFunc) => {
  if (typeof userId !== 'string' || userId.trim().length === 0) {
    return Promise.reject(new Error('userId must be a non-blank string'))
  }
  return db
    .ref('users')
    .child(userId)
    .transaction(user => {
      if (user) updateUserFunc(user)
      return user
    })
}

const depositToUserBalance = function(userId, amount) {
  return db
    .ref('users')
    .child(userId)
    .transaction(
      user => {
        if (user) {
          if (amount < 0) return // Abort if amount is less than zero to avoid unexpected withdrawal behavior
          user.balance = user.balance ? user.balance + amount : amount
        }
        return user
      },
      (error, committed, snapshot) => {
        if (error) {
          console.log(
            'Transaction depositToUserBalance failed abnormally!',
            error
          )
        } else if (!committed) {
          console.log(
            'Aborted depositToUserBalance: Must deposit positive amounts.'
          )
        } else {
          let user = snapshot.val()
          let interaction = {
            time: firebase.database.ServerValue.TIMESTAMP,
            amount: amount,
            type: 'Deposit',
            userId: user.id,
            userName: user.name,
            userBalance: currencyFormatter.format(user.balance / 100)
          }
          saveInteraction(interaction)
        }
      }
    )
}

const withdrawFromUserBalance = function(userId, amount, isPending) {
  return db
    .ref('users')
    .child(userId)
    .transaction(
      user => {
        if (user) {
          if (amount < 0) return // Abort if amount is less than zero to avoid unexpected deposit behavior

          user.balance = user.balance ? user.balance - amount : -amount
          if (user.balance < 0) return // Abort if balance would drop below 0

          if (isPending) {
            user.amountHold = user.amountHold
              ? user.amountHold + amount
              : amount
          }
        }
        return user
      },
      (error, committed, snapshot) => {
        if (error) {
          console.log(
            'Transaction withdrawFromUserBalance failed abnormally!',
            error
          )
        } else if (!committed) {
          console.log(
            'Aborted withdrawFromUserBalance: Must withdraw positive amounts && user balance cannot fall below 0.'
          )
        } else {
          let user = snapshot.val()
          let interaction = {
            time: firebase.database.ServerValue.TIMESTAMP,
            amount: amount,
            type: 'Withdrawal',
            userId: user.id,
            userName: user.name,
            userBalance: currencyFormatter.format(user.balance / 100)
          }
          saveInteraction(interaction)
        }
      }
    )
}

const transactUserWager = function(userId, fundId, wager) {
  const { amount, fade } = wager
  const multiplier = fade ? -1 : 1
  let firstWager
  return db
    .ref('users')
    .child(userId)
    .transaction(
      user => {
        if (user) {
          if (amount < 0) return // Abort if amount is less than zero to avoid unexpected behavior

          user.balance = user.balance ? user.balance - amount : -amount
          if (user.balance < 0) return // Abort if balance would drop below 0

          if (!user.investments) user.investments = {}

          if (user.investments[fundId]) {
            firstWager = false
            user.investments[fundId] += amount * multiplier
          } else {
            firstWager = true
            user.investments[fundId] = amount * multiplier
          }
        }
        return user
      },
      (error, committed, snapshot) => {
        if (error) {
          console.log('Transaction transactUserWager failed abnormally!', error)
        } else if (!committed) {
          console.log(
            'Aborted transactUserWager: Must wager positive amounts && user balance cannot fall below 0.'
          )
        }
      }
    )
    .then(async result => {
      if (result.committed) {
        let user = result.snapshot.val()
        let publicUser = await getPublicUser(user.publicId)
        let interaction = {
          time: firebase.database.ServerValue.TIMESTAMP,
          amount: amount,
          type: fade ? 'Wager Against' : 'Wager',
          userId: publicUser.id,
          userName: publicUser.name,
          userBalance: currencyFormatter.format(user.balance / 100),
          public: true
        }
        return updateFundAfterUserWager(fundId, amount, firstWager, interaction, 0, fade)
      } else {
        result.userId = userId
        result.amount = amount
        return result
      }
    })
}

function updateFundAfterUserWager(
  fundId,
  amount,
  firstWager,
  pendingInteraction,
  attempts = 0,
  fade
) {
  return db
    .ref('funds')
    .child(fundId)
    .transaction(
      fund => {
        if (fund) {
          if (fade) {
            fund.counterBalance = fund.counterBalance ? fund.counterBalance + amount : amount
            fund.fadeAmountWagered = fund.fadeAmountWagered
              ? fund.fadeAmountWagered + amount
              : amount
            if (firstWager) { fund.fadePlayerCount = fund.fadePlayerCount ? fund.fadePlayerCount + 1 : 1 }
          } else {
            fund.balance = fund.balance ? fund.balance + amount : amount
            fund.amountWagered = fund.amountWagered
              ? fund.amountWagered + amount
              : amount
              if (firstWager) { fund.playerCount = fund.playerCount ? fund.playerCount + 1 : 1 }
          }       
        }
        return fund
      },
      (error, committed, snapshot) => {
        if (error) {
          console.log(
            'Transaction updateFundAfterUserWager failed abnormally!',
            error
          )
        } else {
          let fund = snapshot.val()
          pendingInteraction.fundId = fundId
          pendingInteraction.fundName = fund.name
          if (fade) {
            pendingInteraction.fundCounterBalance = currencyFormatter.format(
              fund.counterBalance / 100
            )
          } else {
            pendingInteraction.fundBalance = currencyFormatter.format(
              fund.balance / 100
            )
          }
          saveInteraction(pendingInteraction)
        }
      }
    )
    .then(result => {
      if (result.committed || attempts >= 5) {
        result.amount = amount
        return result
      } else {
        return updateFundAfterUserWager(
          fundId,
          amount,
          firstWager,
          pendingInteraction,
          ++attempts,
          fade
        )
      }
    })
}

function transactUserReturn(userId, fundId, amount) {
  return db
    .ref('users')
    .child(userId)
    .transaction(
      user => {
        if (user) {
          // if (amount < 0) return // Abort if amount is less than zero to avoid unexpected behavior

          user.balance = user.balance ? user.balance + Math.abs(amount) : Math.abs(amount)

          if (!user.returns) user.returns = {}

          if (user.returns[fundId]) return // Abort if a return for this fund already exists. Users get one return per fund
          else user.returns[fundId] = amount
        }
        return user
      },
      (error, committed, snapshot) => {
        if (error) {
          console.log(
            'Transaction transactUserReturn failed abnormally!',
            error
          )
        } else if (!committed) {
          console.log(
            'Aborted transactUserReturn: Must return positive amounts && only one return per user per fund.'
          )
        }
      }
    )
    .then(async result => {
      if (result.committed) {
        let user = result.snapshot.val()
        let publicUser = await getPublicUser(user.publicId)
        let interaction = {
          time: firebase.database.ServerValue.TIMESTAMP,
          amount: Math.abs(amount),
          type: 'Return',
          userId: publicUser.id,
          userName: publicUser.name,
          userBalance: currencyFormatter.format(user.balance / 100),
          public: true
        }
        return updateFundAfterUserReturn(userId, fundId, amount, interaction)
      } else {
        result.status = 'fail'
        result.userId = userId
        result.amount = amount
        return result
      }
    })
}

function updateFundAfterUserReturn(
  userId,
  fundId,
  amount,
  pendingInteraction,
  attempts = 0
) {
  return db
    .ref('funds')
    .child(fundId)
    .transaction(
      fund => {
        if (fund) {
          if (amount > 0) {
            fund.balance = fund.balance ? fund.balance - amount : -amount
            fund.amountReturned = fund.amountReturned
              ? fund.amountReturned + amount
              : amount
            fund.returnCount = fund.returnCount ? fund.returnCount + 1 : 1
          } else {
            fund.counterBalance = fund.counterBalance ? fund.counterBalance + amount : amount
            fund.fadeReturned = fund.fadeReturned
              ? fund.fadeReturned - amount
              : -amount
            fund.fadeReturnCount = fade.returnCount ? fade.returnCount + 1 : 1
          }
          if (fund.returnCount === fund.playerCount && fund.fadeReturnCount === fund.fadePlayerCount) {
            fund.returnTimeMillis = firebase.database.ServerValue.TIMESTAMP
            fund.status = 'RETURNED'
            delete fund.isReturning
          }
        }
        return fund
      },
      (error, committed, snapshot) => {
        if (error) {
          console.log(
            'Transaction updateFundAfterUserReturn failed abnormally!',
            error
          )
        } else {
          let fund = snapshot.val()
          pendingInteraction.fundId = fundId
          pendingInteraction.fundName = fund.name
          pendingInteraction.fundBalance = currencyFormatter.format(
            fund.balance / 100
          )
          saveInteraction(pendingInteraction)
        }
      }
    )
    .then(result => {
      if (result.committed || attempts >= 5) {
        result.userId = userId
        result.amount = amount
        return result
      } else {
        return updateFundAfterUserReturn(
          userId,
          fundId,
          amount,
          pendingInteraction,
          ++attempts
        )
      }
    })
}

const returnFund = async fundId => {
  const setReturning = await db
    .ref('funds')
    .child(fundId)
    .transaction(fund => {
      if (fund) {
        const fundModel = new Fund(fund)
        if (
          fund.status !== 'PENDING' ||
          fundModel.hasPendingBets() ||
          fund.isReturning
        ) {
          return
        }
        if (fund.playerCount === 0) {
          fund.status = 'RETURNED'
        } else {
          fund.isReturning = true
        }
        fund.returnTimeMillis = firebase.database.ServerValue.TIMESTAMP
      }
      return fund
    })

  // if the fund is not PENDING or has pending bets, send an error
  if (!setReturning.committed) {
    return {
      status: 'fail',
      message: 'Only pending funds with no outstanding bets may be returned'
    }
  }

  const fund = new Fund(setReturning.snapshot.val())

  if (setReturning.committed && fund.status === 'RETURNED') {
    return {
      status: 'success',
      data: { fund }
    }
  }

  const returns = []
  const users = await getUsersInFund(fundId)
  users.forEach(user => {
    const fundClone = _.cloneDeep(setReturning.snapshot.val())
    const userFund = new Fund(fundClone)
    if (user.returns && user.returns[fundId]) return
    const amount = userFund.userReturn(user.investments[fundId])
    const userReturn = transactUserReturn(user.id, fundId, amount)
    returns.push(userReturn)
  })

  const successes = {}
  const failures = {}
  const results = await Promise.all(returns)
  results.forEach(result => {
    if (!result.committed) {
      if (result.status === 'fail') failures[result.userId] = result.amount
      else {
        successes[result.userId] = result.amount
        console.log(
          `Fund ${fundId} is has an extra ${
            result.amount
          } cents after a half-failed return`
        )
      }
    } else {
      successes[result.userId] = result.amount
    }
  })

  if (isEmpty(failures)) {
    return {
      status: 'success',
      data: {
        fund,
        successes
      }
    }
  }
  return {
    status: 'fail',
    data: {
      fund,
      successes,
      failures
    }
  }
}

const transactFundBet = bet => {
  if (!bet.id) {
    bet.id = getNewUid()
  }
  return db
    .ref('funds')
    .child(bet.fundId)
    .transaction(
      fund => {
        if (fund) {
          if (!bet.wagered) {
            const pctOfFund = bet.pctOfFund || 0
            if (bet.fade) bet.wagered = Math.floor(fund.fadeAmountWagered * pctOfFund / 100) // separate balance
            else bet.wagered = Math.floor(fund.amountWagered * pctOfFund / 100)
          }

          if (bet.wagered <= 0) return

          if (bet.fade) {
            fund.counterBalance -= bet.wagered
            if (fund.counterBalance < 0) return
            if (!fund.fadeWagers) fund.fadeWagers = {}
            fund.fadeWagers[bet.id] = bet.wagered
          } else {
            fund.balance -= bet.wagered
            if (fund.balance < 0) return
            if (!fund.wagers) fund.wagers = {}
            fund.wagers[bet.id] = bet.wagered
          }

          if (!fund.games) fund.games = {}
          if (!fund.games[bet.gameId]) fund.games[bet.gameId] = bet.gameLeague
        }
        return fund
      },
      (error, committed, snapshot) => {
        if (error) {
          console.log('Transaction transactFundBet failed abnormally!', error)
        } else if (!committed) {
          console.log(
            'Aborted transactFundBet: Must bet positive amounts && fund balance cannot fall below 0.'
          )
        }
      }
    )
    .then(result => {
      if (result.committed) {
        let fund = result.snapshot.val()
        let interaction = {
          time: firebase.database.ServerValue.TIMESTAMP,
          amount: bet.wagered,
          type: 'Bet',
          managerId: bet.managerId,
          fundId: fund.id,
          fundName: fund.name,
          fundBalance: currencyFormatter.format(fund.balance / 100),
          wagerId: bet.id,
          wagerSummary: bet.summary(),
          gameId: bet.gameId,
          gameLeague: bet.gameLeague
        }
        bet.liveTimeMillis = firebase.database.ServerValue.TIMESTAMP
        bet.status = 'LIVE'
        return saveBet(bet).then(() => {
          if (!bet.fade) {
            saveInteraction(interaction)
            updateUserBetStatsAfterPlacing(fund.managerId, bet)
          }
          db
            .ref(bet.gameLeague.toLowerCase())
            .child('live')
            .child(bet.gameId)
            .set(true)
          return result
        })
      } else {
        return result
      }
    })
}

/**
 * After a bet is placed, update the user/manager betStats
 * @param {string} publicId publicUserId or managerId
 * @param {object} bet bet that was just placed
 */
const updateUserBetStatsAfterPlacing = (publicId, bet) => {
  const updateBetStats = betStats => {
    const updateBaseStats = stats => {
      const incrementStat = stat => {
        stat.placedCount = stat.placedCount + 1 || 1
        stat.placedAmount = stat.placedAmount + bet.wagered || bet.wagered
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

    updateBaseStats(betStats)

    const league = bet.gameLeague.toLowerCase()
    if (!betStats.leagues) betStats.leagues = {}
    if (!betStats.leagues[league]) betStats.leagues[league] = {}
    updateBaseStats(betStats.leagues[league])
  }
  const week = getWeek(Date.now()) // TODO: link this to game.scheduledTimeUnix instead
  const betStatsRef = db
    .ref('betStats')
    .child(`${publicId}_w${week}`)

  return betStatsRef.transaction(betStats => {
    if (betStats) updateBetStats(betStats)
    return betStats
  }).then(result => {
    if (result.committed && !result.snapshot.exists()) {
      // There was no data at this node & the transaction didn't save data
      const betStats = {
        userId: publicId,
        week
      }
      updateBetStats(betStats)
      return betStatsRef.set(betStats)
        .then(() => result)
        .catch(() => ({ committed: false, snapshot: result.snapshot }))
    }
    return result
  })
}

const transactFundBetResult = async betId => {
  const bet = await getBet(betId)
  if (bet.returned !== -1 || bet.status !== 'LIVE') {
    return { committed: false } // Do not return a bet more than once && only return live bets
  }
  const game = await getGame(bet.gameLeague, bet.gameId)
  if (game.status !== 'complete' && game.status !== 'closed') {
    return { committed: false } // Do not calculate result with game still being played
  }
  const resultAmount = bet.resultAmount(game)
  if (typeof resultAmount === 'undefined') return { committed: false } // Cannot automatically return Prop bet

  const fundUpdate = await db
    .ref('funds')
    .child(bet.fundId)
    .transaction(fund => {
      if (fund) {
        if (bet.fade) {
          fund.counterBalance += resultAmount
          if (!fund.fadeResults) fund.fadeResults = {}
          fund.fadeResults[bet.id] = resultAmount
        } else {
          fund.balance += resultAmount
          if (!fund.results) fund.results = {}
          fund.results[bet.id] = resultAmount
        }
      }
      return fund
    })

  if (!fundUpdate.committed) {
    console.log('ERROR IN BET CLOSING:', bet.id, bet.summary())
    return fundUpdate
  }
  const fund = new Fund(fundUpdate.snapshot.val())

  bet.returnTimeMillis = firebase.database.ServerValue.TIMESTAMP
  bet.returned = resultAmount
  bet.status = 'RETURNED'

  let interactionType
  if (resultAmount === 0) interactionType = 'Result Lose'
  else if (resultAmount === bet.wagered) interactionType = 'Result Push'
  else interactionType = 'Result Win'

  const interaction = {
    time: firebase.database.ServerValue.TIMESTAMP,
    amount: resultAmount,
    type: interactionType,
    managerId: bet.managerId,
    fundId: fund.id,
    fundName: fund.name,
    fundBalance: currencyFormatter.format(fund.balance / 100),
    wagerId: bet.id,
    wagerSummary: bet.summary(),
    wagerAmount: bet.wagered,
    gameId: bet.gameId,
    gameLeague: bet.gameLeague
  }

  if (!bet.fade) saveInteraction(interaction)

  return saveBet(bet).then(() => {
    console.log(`\n---------- ${interactionType}:`, bet)

    if (!bet.fade) updateUserBetStatsAfterResult(fund.managerId, bet, game)
    getPublicUsersWhoPredictedBet(betId).then(publicUsers => {
      for (const publicUser of publicUsers) {
        transactPredictionOutcome(publicUser.id, bet, game)
      }
    })
    return fundUpdate
  })
}

/**
 * After a bet result, update the user/manager betStats
 * @param {string} publicId publicUserId or managerId
 * @param {object} bet bet that was just returned
 */
const updateUserBetStatsAfterResult = (publicId, bet, game) => {
  const updateBetStats = betStats => {
    const updateBaseStats = stats => {
      const incrementStat = stat => {
        if (!stat.currentStreak) stat.currentStreak = 0
        if (bet.returned === 0) {
          stat.loseCount = stat.loseCount + 1 || 1
          stat.loseAmount = stat.loseAmount
            ? stat.loseAmount + bet.relativeResultAmount()
            : bet.relativeResultAmount()
          stat.currentStreak =
            stat.currentStreak < 0 ? stat.currentStreak - 1 : -1
        } else if (bet.returned > bet.wagered) {
          stat.winCount = stat.winCount + 1 || 1
          stat.winAmount = stat.winAmount
            ? stat.winAmount + bet.relativeResultAmount()
            : bet.relativeResultAmount()
          stat.currentStreak = stat.currentStreak > 0 ? stat.currentStreak + 1 : 1
        } else if (bet.returned === bet.wagered) {
          stat.pushCount = stat.pushCount + 1 || 1
          stat.pushAmount = stat.pushAmount + bet.wagered || bet.wagered
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

    updateBaseStats(betStats)

    const league = bet.gameLeague.toLowerCase()
    updateBaseStats(betStats.leagues[league])
  }
  const week = getWeek(game.scheduledTimeUnix)

  return db
    .ref('betStats')
    .child(`${publicId}_w${week}`)
    .transaction(betStats => {
      if (betStats) updateBetStats(betStats)
      return betStats
    })
}

const transactUserPrediction = async (user, bet, willWin) => {
  if (typeof willWin !== 'boolean') {
    throw new Error('Prediction must be a boolean value')
  }

  let [prediction, game] = await Promise.all([
    getUserBetPrediction(user.publicId, bet.id),
    getGame(bet.gameLeague, bet.gameId)
  ])

  if (prediction) throw new Error(`Only one prediction per bet is allowed.`)

  const firstPrediction = !(user.firstTimes.prediction > 0)
  const contestWeek = getWeek(game.scheduledTimeUnix)

  const btbRef = db
    .ref('public/beatTheBettor')
    .child(`${user.publicId}_w${contestWeek}`)

  return btbRef.transaction(
    btb => {
      if (btb) {
        btb.predictionCount = btb.predictionCount + 1 || 1

        if (!btb.leagues) btb.leagues = {}
        const leagues = btb.leagues
        const league = bet.gameLeague.toLowerCase()

        if (!leagues[league]) leagues[league] = {}
        leagues[league].predictionCount = leagues[league].predictionCount + 1 || 1
      }
      return btb
    }
  ).then(result => {
    if (result.committed) {
      const onSuccess = () => {
        if (firstPrediction) {
          transactUserUpdate(user.id, user => {
            if (!user.firstTimes) user.firstTimes = {}
            user.firstTimes['prediction'] = firebase.database.ServerValue.TIMESTAMP
          })
        }
        savePrediction(prediction)
        return updateBetAfterUserPrediction(bet.id, willWin)
      }
      prediction = {
        willWin,
        league: bet.gameLeague,
        createdTimeMillis: firebase.database.ServerValue.TIMESTAMP,
        outcome: 'PENDING',
        userId: user.publicId,
        betId: bet.id
      }
      if (!result.snapshot.exists()) {
        // There was no data at this node & the transaction didn't save data
        const btb = {
          userId: user.publicId,
          week: contestWeek,
          predictionCount: 1
        }
        btb.leagues = {}
        btb.leagues[bet.gameLeague.toLowerCase()] = {
          predictionCount: 1
        }
        return btbRef.set(btb)
          .then(() => onSuccess())
          .catch(() => ({ committed: false, snapshot: result.snapshot }))
      }
      return onSuccess()
    } else {
      return result
    }
  })
}

const updateBetAfterUserPrediction = (betId, willWin) => {
  return db
    .ref('wagers')
    .child(betId)
    .transaction(bet => {
      if (bet) {
        if (willWin) bet.agreeCount = bet.agreeCount ? bet.agreeCount + 1 : 1
        else bet.disagreeCount = bet.disagreeCount ? bet.disagreeCount + 1 : 1
      }
      return bet
    })
}

const transactPredictionOutcome = async (publicUserId, bet, game) => {
  let prediction = await getUserBetPrediction(publicUserId, bet.id)
  if (!prediction) { throw new Error(`User ${publicUserId} did not predict bet ${bet.id}.`) }

  const contestWeek = getWeek(game.scheduledTimeUnix)

  return db
    .ref('public/beatTheBettor')
    .child(`${publicUserId}_w${contestWeek}`)
    .transaction(btb => {
      if (btb) {
        let betResult = 'PUSH'
        if (bet.returned === 0) betResult = 'LOSE'
        else if (bet.returned > bet.wagered) betResult = 'WIN'

        let outcome = 'PUSH'
        if (
          (prediction.willWin && betResult === 'WIN') ||
          (!prediction.willWin && betResult === 'LOSE')
        ) {
          outcome = 'RIGHT'
        } else if (
          (prediction.willWin && betResult === 'LOSE') ||
          (!prediction.willWin && betResult === 'WIN')
        ) {
          outcome = 'WRONG'
        }

        let points = outcome === 'RIGHT' ? 100 : 0
        const relativePredictionTime =
          prediction.createdTimeMillis - game.scheduledTimeUnix
        if (points > 0 && relativePredictionTime > 0) {
          const gameLengthMillis =
            game.completedTimeMillis - game.scheduledTimeUnix
          points *= 1 - relativePredictionTime / gameLengthMillis
          points = Math.floor(points)
        }

        prediction.points = points
        prediction.outcome = outcome
        prediction.outcomeTimeMillis = firebase.database.ServerValue.TIMESTAMP

        const applyOutcome = stats => {
          stats.points = stats.points + points || points
          if (!stats.currentStreak) stats.currentStreak = 0

          if (outcome === 'PUSH') {
            stats.pushCount = stats.pushCount + 1 || 1
          } else if (outcome === 'RIGHT') {
            stats.rightCount = stats.rightCount + 1 || 1
            stats.currentStreak =
              stats.currentStreak > 0 ? stats.currentStreak + 1 : 1
          } else if (outcome === 'WRONG') {
            stats.wrongCount = stats.wrongCount + 1 || 1
            stats.currentStreak =
              stats.currentStreak < 0 ? stats.currentStreak - 1 : -1
          }
          if (stats.currentStreak) {
            if (
              !stats.longestStreak ||
              Math.abs(stats.currentStreak) > Math.abs(stats.longestStreak)
            ) {
              stats.longestStreak = stats.currentStreak
            }
          }
        }
        const sportStats = btb.leagues[bet.gameLeague.toLowerCase()]
        applyOutcome(btb)
        applyOutcome(sportStats)
      }
      return btb
    })
    .then(result => {
      if (result.committed) {
        savePrediction(prediction)
      }
      return result
    })
}

module.exports = {
  createNewUserData,
  getNewUid,
  getUserIdFromPublicUserId,
  getUserIdFromOnfidoApplicantId,
  getPublicUserId,
  getManagerId,
  getOnfidoApplicantId,
  isUserApproved,
  getUser,
  getUserWithManagerId,
  getUserEmailVerificationInfo,
  getUserIdentity,
  getPublicUser,
  getFund,
  getFundsOnAddFeed,
  getFundsOnAddOrChangeFeed,
  getGamesOnAddOrChangeFeed,
  getTeam,
  getGame,
  getGameByTimeAndTeams,
  getBet,
  getFundBets,
  getGameBets,
  getManagerBets,
  getBetsOnAddOrChangeFeed,
  getGamesByFundOnAddOrChangeFeed,
  getBetsOnRemoveFeed,
  getManager,
  getUsersInFund,
  getPublicUsersWhoPredictedBet,
  getUserTransactions,
  getSession,
  getAllSessions,
  getUserSessions,
  getSessionResponses,
  getAllSessionResponses,
  getUserSessionResponses,
  updateUser,
  updatePublicUser,
  updateUserIdentity,
  updateManager,
  saveSession,
  saveSessionResponse,
  saveBet,
  saveInteraction,
  saveTransaction,
  saveOnfidoApplicantId,
  saveLobCheck,
  deleteBet,
  deleteFund,
  deleteLobCheck,
  deleteUserEmailVerificationInfo,
  toggleIsUserApproved,
  updateUserDocumentStatus,
  openFund,
  closeFund,
  transactUserUpdate,
  depositToUserBalance,
  withdrawFromUserBalance,
  transactUserWager,
  returnFund,
  transactFundBet,
  transactFundBetResult,
  transactUserPrediction,
  transactPredictionOutcome
}
