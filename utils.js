const util = require('util')

function isEmpty(obj) {
  for (const prop in obj) {
    if (obj.hasOwnProperty(prop)) return false
  }
  return true
}

const logFull = (any) => console.log(util.inspect(any, false, null))

/**
 * Recursively search through a given object for the value of a given key.
 * Finds the most shallowly nested key:value pair, or null if none is present.
 * @param {string} key key of the value to find
 * @param {object} obj object to search through
 */
function getValueOfKey(key, obj) {
  if (obj[key]) return obj[key]
  for (const prop in obj) {
    if (obj.hasOwnProperty(prop)) {
      if (prop === key) return obj[prop]
      if (obj[prop] !== null && typeof obj[prop] === 'object') {
        const nestedVal = getValueOfKey(key, obj[prop])
        if (nestedVal) return nestedVal
      }
    }
  }
  return null
}

const getLastPartOfPath = (path = '') => {
  if (path.slice(-1) === '/') {
    path = path.slice(0, -1)
  }
  const index = path.lastIndexOf('/') + 1
  return path.substring(index)
}

function requiredParam(param) {
  const requiredParamError = new Error(
    `Required parameter, "${param}" is missing.`
  )
  // preserve original stack trace
  if (typeof Error.captureStackTrace === 'function') {
    Error.captureStackTrace(
      requiredParamError,
      requiredParam
    )
  }
  throw requiredParamError
}

module.exports = {
  logFull,
  isEmpty,
  getValueOfKey,
  getLastPartOfPath,
  requiredParam
}
