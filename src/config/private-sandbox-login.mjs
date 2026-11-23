// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Private jobs use a separate versioned door; ordinary terminals never acquire this capability. */
export const PRIVATE_LOGIN_VERSION = 1
export const PRIVATE_LOGIN_MS = 10 * 60 * 1000
export const PRIVATE_LOGIN_MAX_BYTES = 64 * 1024
export const PRIVATE_LOGIN_REASONS = Object.freeze(['Unavailable', 'Busy', 'Unsupported', 'Expired', 'Binding', 'InputUsed', 'Cancelled', 'PoolUnsafe', 'PoolChanged', 'PoolUnsaved', 'PoolUnknown', 'PoolFull', 'PoolDuplicate', 'Person', 'Shape'])
export class PrivateLoginError extends Error {
  constructor(reason) { super(PRIVATE_LOGIN_REASONS.includes(reason) ? reason : 'Unsupported'); this.reason = this.message }
}
const PRIVATE_LOGIN_ADDRESS = /^\/?(?:api\/)?office\/sandbox-logins\/claude(?:[/?#]|$)/i
/**
 * The doors through which the office passes the mail tool's state on to the person, and their three presses on to the tool:
 * the state holds their addresses, and the list they save is their addresses.
 */
const THE_MAIL_TOOLS_DOORS = /^\/?(?:api\/)?office\/mail-tool\/(state|addresses|account|test)([/?#].*)?$/is
/**
 * The door that gives an agent tool's key to the tool's own login (src/server/api/terminal-harnesses.ts). The key is in
 * its body, never its address, so the address is logged; an error is not, because a parser's error can quote the body.
 */
const THE_TOOL_KEY_DOOR = /^\/?(?:api\/)?harnesses\/[^/?#]*\/key(?:[/?#]|$)/i
export function privateRequestLogAddress(url) {
  // Treat malformed identifiers and queries as private too, before any logger serializes them.
  if (PRIVATE_LOGIN_ADDRESS.test(url)) return '/api/office/sandbox-logins/claude/[private]'
  // These doors take no query, so whatever follows a door's path is kept out of the log: it may be an address.
  const door = THE_MAIL_TOOLS_DOORS.exec(url)
  const tail = door?.[2]
  return door === null || tail === undefined ? withNoTicketInIt(url) : `/api/office/mail-tool/${door[1].toLowerCase()}${tail[0]}[private]`
}
/**
 * A FILE TICKET OPENS A FILE FOR WHOEVER HOLDS THE ADDRESS AND THE COOKIE HALF, so its value is kept out of the log, on
 * every door and whether the ticket was honoured or refused (src/server/lib/file-tickets.ts). A name that cannot be
 * decoded may be the ticket's, so its value is kept out too.
 */
function withNoTicketInIt(url) {
  const at = url.indexOf('?')
  if (at === -1) return url
  const pairs = url.slice(at + 1).split('&').map((pair) => {
    const equals = pair.indexOf('=')
    return aTicketsName(equals === -1 ? pair : pair.slice(0, equals)) ? 'ticket=[private]' : pair
  })
  return `${url.slice(0, at)}?${pairs.join('&')}`
}
function aTicketsName(name) {
  try {
    return decodeURIComponent(name.replace(/\+/g, ' ')) === 'ticket'
  } catch {
    return true
  }
}
export function isPrivateLoginRequest(url) { return PRIVATE_LOGIN_ADDRESS.test(url) }
/** Whether a request's error is kept out of the log as well as its address: a refusal names what it refused. */
export function isPrivateInTheLog(url) { return isPrivateLoginRequest(url) || THE_MAIL_TOOLS_DOORS.test(url) || THE_TOOL_KEY_DOOR.test(url) }
