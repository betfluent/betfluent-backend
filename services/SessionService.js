'use strict'

const dbService = require('./DbService')

const getAllSessionsAndResponses = async () => {
  const [sessions, responses] = await Promise.all([
    dbService.getAllSessions(),
    dbService.getAllSessionResponses()
  ])
  return sessions.map(session => {
    return {
      session,
      responses: responses.filter(r => r.sessionId === session.id)
    }
  })
}

const getAllSessionTypesCount = async () => {
  return getAllSessionsAndResponses()
    .then(results => {
      return results.reduce((data, item) => {
        const sessions = data.sessions
        const sessionType = item.session.serviceType
        sessions[sessionType] = sessions[sessionType]
          ? sessions[sessionType] + 1
          : 1
        const responses = data.responses
        item.responses.forEach(response => {
          const responseType = response.serviceType
          responses[responseType] = responses[responseType]
            ? responses[responseType] + 1
            : 1
        })
        return data
      }, { sessions: {}, responses: {} })
    })
}

const getSessionAndResponses = async sessionId => {
  const [session, responses] = await Promise.all([
    dbService.getSession(sessionId),
    dbService.getSessionResponses(sessionId)
  ])
  return { session, responses }
}

const getUserSessionsAndResponses = async (userId) => {
  const [sessions, responses] = await Promise.all([
    dbService.getUserSessions(userId),
    dbService.getUserSessionResponses(userId)
  ])
  return sessions.map(session => {
    return {
      session,
      responses: responses.filter(r => r.sessionId === session.id)
    }
  })
}

const getUserSessionsOfType = async (userId, type) => {
  const [sessions, responses] = await Promise.all([
    dbService.getUserSessions(userId),
    dbService.getUserSessionResponses(userId)
  ])
  return sessions
    .filter(session => session.serviceType === type.toUpperCase())
    .map(session => {
      return {
        session,
        responses: responses.filter(r => r.sessionId === session.id)
      }
    })
}

module.exports = {
  getAllSessionsAndResponses,
  getAllSessionTypesCount,
  getSessionAndResponses,
  getUserSessionsAndResponses,
  getUserSessionsOfType
}
