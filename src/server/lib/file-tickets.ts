// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FILE TICKET OPENS ONE FILE, FOR A WHILE, IN THE BROWSER IT WAS MADE FOR. SEC-2, item 3.
 *
 * A browser proves the person with two halves of one device key. A picture, a video, a frame or a saved file is loaded
 * by the browser and not by the page, so it carries the cookie half and never the header half, and one half alone
 * proves nothing. So the page asks the ticket door (api/file-tickets.ts) with both halves for an address that opens one
 * file, and hands that address to the browser. The address carries a ticket.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A TICKET IS BOUND TO
 * ---------------------------------------------------------------------------------------
 *
 *   - one path, the one it was made for. Another path is refused.
 *   - GET /api/file, by a GET or a HEAD. Any other door and any write is refused, and writes nothing.
 *   - the cookie half it was made under. A copied address opens nothing in a browser that holds another cookie half,
 *     or none.
 *   - the device key it was made under, while that key is live. A key the person takes back ends its tickets.
 *   - 30 minutes after its last use, and 12 hours after it was made, however often it is used.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE IT IS KEPT
 * ---------------------------------------------------------------------------------------
 *
 * In this app's memory only, under the SHA-256 of the ticket. It is written to no table and no file, so a restart ends
 * every ticket, and the page asks for a new one. The book holds the SHA-256 of the device key and of the cookie half,
 * never either half.
 *
 * A ticketed request the book does not honour is refused, with 403 and the code `fileTicketNotHonoured`, before any
 * other key rule is asked. A request with no ticket in its address is not read here.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { sayInEnglish } from '@shared/i18n.ts'
import { keyHash, theHalvesOn, theHeldKeyRowWhoseHashIs } from '../db/the-key-on-this-request-was-made-for-a-run.ts'
import { PanelError } from './panel-error.ts'

/** A ticket ends this long after it was last used. */
export const A_TICKET_ENDS_UNUSED_AFTER_MS = 30 * 60 * 1000
/** A ticket ends this long after it was made, however often it is used. */
export const A_TICKET_ENDS_AFTER_MS = 12 * 60 * 60 * 1000
/** The one door a ticket opens. */
export const THE_DOOR_A_TICKET_OPENS = '/api/file'

/** One ticket the book holds: the SHA-256 of the key and of the cookie half it was made under, and its one path. */
interface AFileTicket {
  key: string
  cookieHalf: string
  path: string
  made: number
  lastUsed: number
}

/** The tickets one app made, under the SHA-256 of each ticket. */
export type AFileTicketBook = Map<string, AFileTicket>

/** A new, empty book. index.ts makes one for each app. */
export function aFileTicketBook(): AFileTicketBook {
  return new Map()
}

let now: () => number = Date.now

/** THE CLOCK THE TICKETS READ, AND ONLY THEY. A test moves it to reach an ending, and the rest of the office keeps the real time. */
export function useAClockForTickets(clock: () => number): void {
  now = clock
}

function hasEnded(ticket: AFileTicket, at: number): boolean {
  return at - ticket.lastUsed >= A_TICKET_ENDS_UNUSED_AFTER_MS || at - ticket.made >= A_TICKET_ENDS_AFTER_MS
}

/**
 * MAKE A TICKET for one path, under the SHA-256 of a device key and the cookie half the request carried. The ticket
 * itself goes back to the caller and is kept nowhere: the book holds its SHA-256. Every ticket that has ended is
 * dropped first.
 */
export function makeAFileTicket(book: AFileTicketBook, made: { key: string; cookieHalf: string; path: string }): string {
  const at = now()
  for (const [hash, ticket] of book) if (hasEnded(ticket, at)) book.delete(hash)
  const ticket = randomBytes(32).toString('base64url')
  book.set(keyHash(ticket), { key: made.key, cookieHalf: keyHash(made.cookieHalf), path: made.path, made: at, lastUsed: at })
  return ticket
}

/** The key a ticket stood in for on a request, by the request's own object, so it ends with the request. */
const THE_KEY_A_TICKET_STOOD_IN_FOR = new WeakMap<object, string>()

/**
 * THE SHA-256 OF THE DEVICE KEY A TICKET STOOD IN FOR ON THIS REQUEST, or undefined because no ticket was honoured on
 * it. `howThisRequestProvedItself` in lib/keys.ts reads it for a request that carries no whole key.
 */
export function theKeyAFileTicketStoodInFor(req: FastifyRequest): string | undefined {
  return THE_KEY_A_TICKET_STOOD_IN_FOR.get(req.raw)
}

function notHonoured(): PanelError {
  return new PanelError(sayInEnglish('server.fileTicketNotHonoured'), 403, undefined, undefined, undefined, {
    code: 'fileTicketNotHonoured',
    values: {},
  })
}

function theSameHash(a: string, b: string): boolean {
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
}

/** The ticket this request's address carries and the book honours for it, or undefined because it honours none. */
function theTicketThatHolds(req: FastifyRequest, book: AFileTicketBook, query: URLSearchParams, tickets: string[]): AFileTicket | undefined {
  const [ticket] = tickets
  if (tickets.length !== 1 || ticket === undefined) return undefined
  if (req.method !== 'GET' && req.method !== 'HEAD') return undefined
  if (req.url.slice(0, req.url.indexOf('?')) !== THE_DOOR_A_TICKET_OPENS) return undefined
  const hash = keyHash(ticket)
  const held = book.get(hash)
  if (held === undefined) return undefined
  if (hasEnded(held, now())) {
    book.delete(hash)
    return undefined
  }
  const cookieHalf = theHalvesOn(req).cookie
  if (cookieHalf === undefined || !theSameHash(keyHash(cookieHalf), held.cookieHalf)) return undefined
  const paths = query.getAll('path')
  if (paths.length !== 1 || paths[0] !== held.path) return undefined
  // A KEY THE PERSON TOOK BACK ENDS ITS TICKETS, at once and for good.
  const row = theHeldKeyRowWhoseHashIs(held.key)
  if (row === null || row.revokedAt !== null) {
    book.delete(hash)
    return undefined
  }
  return held
}

/**
 * HONOUR A TICKET OR REFUSE THE REQUEST, before every other key rule. index.ts adds this right after the Origin check,
 * so the refusal of one half of a device key in lib/keyheader.ts never sees a ticketed request first. A request whose
 * address carries no ticket is not read. An honoured ticket's last use is now, and the request is read as carrying
 * the key the ticket was made under.
 */
export function honourOrRefuseAFileTicket(app: FastifyInstance, book: AFileTicketBook): void {
  app.addHook('onRequest', async (req) => {
    const at = req.url.indexOf('?')
    if (at === -1) return
    const query = new URLSearchParams(req.url.slice(at + 1))
    const tickets = query.getAll('ticket')
    if (tickets.length === 0) return
    const held = theTicketThatHolds(req, book, query, tickets)
    if (held === undefined) throw notHonoured()
    held.lastUsed = now()
    THE_KEY_A_TICKET_STOOD_IN_FOR.set(req.raw, held.key)
  })
}
