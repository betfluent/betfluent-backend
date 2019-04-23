'use strict'

const firebase = require('./firebase')
const db = firebase.database()
const dbService = require('./services/DbService')
const authService = require('./services/AuthService')
const storageService = require('./services/StorageService')

const createManager = async (userEmail, managerName, company) => {
  const userId = await authService.getUserIdByEmail(userEmail)
  authService
    .setManagerAccessClaim(userId)
    .then(async () => {
      const user = (await db
        .ref('users')
        .child(userId)
        .once('value')).val()
      let name = managerName
      if (!name) {
        const userIdentity = await dbService.getUserIdentity(user.id)
        name = `${userIdentity.firstName.trim()} ${userIdentity.lastName
          .trim()
          .charAt()}.`
      }
      user.managerId = dbService.getNewUid()
      const manager = {
        id: user.managerId,
        name,
        joinTimeMillis: firebase.database.ServerValue.TIMESTAMP,
        isTraining: true
      }
      if (company) manager.company = company
      dbService.updateUser(user.id, user)
      dbService.updateManager(manager.id, manager)
    })
    .catch(err => console.log('ERROR:', err))
}

const createPublicUser = async user => {
  if (user.publicId) return
  const [firstName, lastName] = user.name.split(' ')
  user.publicId = dbService.getNewUid()
  const publicUser = {
    id: user.publicId,
    name: `${firstName.trim()} ${lastName.trim().charAt()}.`,
    joinTimeMillis: user.joinDate
  }
  dbService.updateUser(user.id, user)
  dbService.updatePublicUser(publicUser.id, publicUser)
  console.log('\n', user, publicUser)
}

const createPublicUsersForAll = () => {
  db.ref('users').on('child_added', snapshot => {
    const user = snapshot.val()
    createPublicUser(user)
  })
}

const replaceInteractionUserInfo = () => {
  db.ref('interactions').on('child_added', async snapshot => {
    const interaction = snapshot.val()
    if (interaction.type === 'Wager' || interaction.type === 'Return') {
      const user = await dbService.getUser(interaction.userId)
      const publicUser = await dbService.getPublicUser(user.publicId)
      interaction.userId = publicUser.id
      interaction.userName = publicUser.name
      dbService.saveInteraction(interaction, snapshot.key)
    }
  })
}

const addManagerInfoToFunds = () => {
  db.ref('funds').on('child_added', async snapshot => {
    const fund = snapshot.val()
    const manager = await dbService.getManager(fund.managerId)
    fund.manager = {
      id: manager.id,
      name: manager.name,
      avatarUrl: manager.avatarUrl
    }
    if (manager.company) fund.manager.company = manager.company
    delete fund.managerId
    db
      .ref('funds')
      .child(snapshot.key)
      .set(fund)
      .then(() => console.log('\n', fund))
  })
}

const removeManagerInfoFromFunds = () => {
  db.ref('funds').on('child_added', async snapshot => {
    const fund = snapshot.val()
    fund.managerId = fund.manager.id
    delete fund.manager
    db
      .ref('funds')
      .child(snapshot.key)
      .set(fund)
      .then(() => console.log('\n', fund))
  })
}

const signAvatarUrls = () => {
  db.ref('public/users').on('child_added', snapshot => {
    const publicUser = snapshot.val()
    if (!publicUser.avatarUrl) return
    storageService.updateAvatarUrl(
      'users/avatars/',
      snapshot.key,
      dbService.updatePublicUser
    )
  })
  db.ref('managers').on('child_added', snapshot => {
    const manager = snapshot.val()
    if (!manager.avatarUrl) return
    storageService.updateAvatarUrl(
      'managers/avatars/',
      snapshot.key,
      dbService.updateManager
    )
  })
}

const addOutcomeStatsForGame = async (gameLeague, gameId) => {
  const [game, bets] = await Promise.all([
    dbService.getGame(gameLeague, gameId),
    dbService.getGameBets(gameId)
  ])
  bets.forEach(async bet => {
    const users = await dbService.getPublicUsersWhoPredictedBet(bet.id)
    users.forEach(user => {
      dbService
        .transactPredictionOutcome(user.id, bet, game)
        .catch(err => console.log(err.message))
    })
  })
}

const addFlagsUrl = () => {
  db.ref('fifa/teams').on('child_added', snapshot => {
    const team = snapshot.val()
    const teamName = team.name.toLowerCase().replace(/ /g, '-')
    db.ref('fifa/teams')
      .child(snapshot.key)
      .update({
        avatarUrl: ``
      })
  })
}

module.exports = {
  createManager,
  createPublicUser,
  createPublicUsersForAll,
  addManagerInfoToFunds,
  removeManagerInfoFromFunds,
  replaceInteractionUserInfo,
  signAvatarUrls,
  addOutcomeStatsForGame,
  addFlagsUrl
}
