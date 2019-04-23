'use strict'

const { onAddOrChangeFeed, onRemoveFeed } = require('./ServiceUtils')
const firebase = require('../firebase')
const Bet = require('../models/Bet')

const db = firebase.database()

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

const getBet = async betId => {
  const snapshot = await db
    .ref('wagers')
    .child(betId)
    .once('value')
  return snapshot.exists() ? new Bet(snapshot.val()) : null
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

/**
 * Opens a feed that calls the callback once for every bet that is deleted.
 * @param {function} callback function with the deleted Bet object as an argument
 */
const getBetsOnRemoveFeed = callback =>
  onRemoveFeed(db.ref('wagers'), callback, Bet)

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
 * @returns A Promise containing an array of bets, or an empty array if no bets exist for this game
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

module.exports = {
  deleteBet,
  getBet,
  getBetsOnAddOrChangeFeed,
  getBetsOnRemoveFeed,
  getFundBets,
  getGameBets,
  getManagerBets,
  saveBet
}
