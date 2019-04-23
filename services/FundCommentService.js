'use strict'

const firebase = require('../firebase')
const db = firebase.database()

const deleteFundComment = async (fundId, commentId) => {
  if (typeof fundId !== 'string' || fundId.trim().length === 0) {
    throw new Error('fundId must be a non-blank string')
  }
  if (typeof commentId !== 'string' || commentId.trim().length === 0) {
    throw new Error('commentId must be a non-blank string')
  }
  return db
    .ref('fundDetails')
    .child(fundId)
    .child('comments')
    .child(commentId)
    .remove()
}

const reportFundComment = async (fundId, commentId) => {
  if (typeof fundId !== 'string' || fundId.trim().length === 0) {
    throw new Error('fundId must be a non-blank string')
  }
  if (typeof commentId !== 'string' || commentId.trim().length === 0) {
    throw new Error('commentId must be a non-blank string')
  }
  return db
    .ref('fundDetails')
    .child(fundId)
    .child('comments')
    .child(commentId)
    .update({ reportedTimeMillis: firebase.database.ServerValue.TIMESTAMP })
}

const transactFundCommentVote = ({ fundId, commentId, publicUserId, vote }) => {
  if (typeof fundId !== 'string' || fundId.trim().length === 0) {
    throw new Error('fundId must be a non-blank string')
  }
  if (typeof commentId !== 'string' || commentId.trim().length === 0) {
    throw new Error('commentId must be a non-blank string')
  }
  if (typeof publicUserId !== 'string' || publicUserId.trim().length === 0) {
    throw new Error('publicUserId must be a non-blank string')
  }
  if (typeof vote !== 'boolean') throw new Error('vote must be a boolean value')

  return db
    .ref('fundDetails')
    .child(fundId)
    .child('comments')
    .child(commentId)
    .transaction(comment => {
      if (comment) {
        if (!comment.voteCount) comment.voteCount = 0
        if (!comment.votes) comment.votes = {}

        const prevVote = comment.votes[publicUserId]

        if (prevVote === undefined) {
          if (vote) comment.voteCount += 1
          else comment.voteCount -= 1
          comment.votes[publicUserId] = vote
        } else if (prevVote === vote) {
          if (vote) comment.voteCount -= 1
          else comment.voteCount += 1
          delete comment.votes[publicUserId]
        } else {
          if (vote) comment.voteCount += 2
          else comment.voteCount -= 2
          comment.votes[publicUserId] = vote
        }
      }
      return comment
    })
}

module.exports = {
  deleteFundComment,
  reportFundComment,
  transactFundCommentVote
}
