'use strict'

const firebase = require('../firebase')

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

/**
 * Feeds based on Firebase Realtime Database DatabaseReferences
 */

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

module.exports = {
  getNewUid,
  getWeek,
  onAddFeed,
  onAddOrChangeFeed,
  onRemoveFeed
}
