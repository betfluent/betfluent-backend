'use strict'

const firebase = require('../firebase')
const storage = firebase.storage()
const dbService = require('./DbService')

const uploadUserAvatar = (publicUserId, avatarBuffer, mimetype) => {
  return uploadAvatar(
    'users/avatars/',
    publicUserId,
    avatarBuffer,
    mimetype,
    dbService.updatePublicUser
  )
}

const uploadManagerAvatar = (managerId, avatarBuffer, mimetype) => {
  return uploadAvatar(
    'managers/avatars/',
    managerId,
    avatarBuffer,
    mimetype,
    dbService.updateManager
  )
}

const uploadAvatar = (path, id, avatarBuffer, mimetype, updateService) => {
  return new Promise((resolve, reject) => {
    storage.bucket()
      .file(`${path}${id}`)
      .createWriteStream({
        contentType: mimetype
      })
      .on('finish', () => {
        updateAvatarUrl(path, id, updateService)
        resolve()
      })
      .on('error', err => {
        console.log('uploadAvatar ERROR:', err.message)
        reject(err)
      })
      .end(avatarBuffer)
  })
}

const updateAvatarUrl = (path, id, updateService) => {
  const options = {
    action: 'read',
    expires: Date.now() + 1.577e+11 // 5 years from now
  }
  return storage.bucket()
    .file(`${path}${id}`)
    .getSignedUrl(options)
    .catch(err => console.log(err))
    .then(results => {
      const url = results[0]
      return updateService(id, {
        avatarUrl: url
      })
    })
}

module.exports = {
  uploadUserAvatar,
  uploadManagerAvatar,
  updateAvatarUrl
}
