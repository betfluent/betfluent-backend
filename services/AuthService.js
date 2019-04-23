'use strict'

const admin = require('../firebase')
const { requiredParam } = require('../utils')

const createUser = (
  {
    email = requiredParam('email'),
    password = requiredParam('password')
  },
  accessClaim
) => {
  return admin.auth().createUser({
    email,
    password
  }).then(userRecord => {
    if (accessClaim) {
      return setAccessClaim(userRecord.uid, accessClaim)
        .then(() => userRecord)
    }
    return userRecord
  })
}

const deleteUser = userId => admin.auth().deleteUser(userId)

const deleteAllUsers = () => {
  getAllUserIds().then(users => {
    let timeout = 0
    users.forEach(userId => {
      timeout += 500
      setTimeout(() => {
        deleteUser(userId)
      }, timeout)
    })
  })
}

const getAllUserIds = () => {
  const userIds = []
  // Get batch of users, 1000 at a time.
  const getNextPage = (nextPageToken) => admin.auth()
    .listUsers(1000, nextPageToken)
    .then(result => {
      result.users.forEach(userRecord => userIds.push(userRecord.uid))
      if (result.pageToken) {
        // Get next batch of users.
        return getNextPage(result.pageToken)
      } else return userIds
    })
    .catch(error => {
      console.log('Error listing users:', error)
    })
  return getNextPage()
}

const getUserIdByEmail = (emailAddress) =>
  admin.auth().getUserByEmail(emailAddress)
    .then(userRecord => userRecord.uid)

const getUserRecord = (userId) => admin.auth().getUser(userId)

const removeAccessClaim = (userId, claim) => {
  const claims = {}
  claims[claim] = false
  return admin.auth().setCustomUserClaims(userId, claims)
}

const revokeUserRefreshTokens = (userId) =>
  admin.auth().revokeRefreshTokens(userId)
    .then(() => admin.auth().getUser(userId))
    .then(userRecord => new Date(userRecord.tokensValidAfterTime).getTime())
    .then(revokeTime => {
      return admin.database()
        .ref('metadata')
        .child(userId)
        .set({
          revokeTime: revokeTime
        })
        .then(() => console.log('Tokens revoked at: ', revokeTime))
    })

const setAccessClaim = (userId, claim) => {
  const claims = {}
  claims[claim] = true
  return admin.auth().setCustomUserClaims(userId, claims)
}

/**
 * Grants a particular user manager access - can read any user object in Firebase.
 * Meant for users who will be placing bets.
 * @param {string} userId
 */
const setManagerAccessClaim = (userId) => setAccessClaim(userId, 'manager')

/**
 * Grants a particular user operator access - can read any Firebase database data.
 * Meant for users who operate a sports-book.
 * @param {string} userId
 */
const setOperatorAccessClaim = (userId) => setAccessClaim(userId, 'operator')

const verifyUserEmail = (userId) => admin.auth().updateUser(userId, {
  emailVerified: true
})

module.exports = {
  createUser,
  deleteUser,
  deleteAllUsers,
  getAllUserIds,
  getUserRecord,
  getUserIdByEmail,
  removeAccessClaim,
  revokeUserRefreshTokens,
  setManagerAccessClaim,
  setOperatorAccessClaim,
  verifyUserEmail
}
