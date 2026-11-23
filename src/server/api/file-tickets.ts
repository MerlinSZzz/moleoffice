// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TICKET DOOR: an address a browser's own load opens one file with. SEC-2, item 3.
 *
 *   POST /api/file/ticket {path, record?, workspace?}   {address}, the GET /api/file address with a ticket in it
 *
 * The page asks it with both halves of the browser's device key, and hands the address to the browser for a picture,
 * a video, a frame or a saved file. Only such a request is given one: a whole key in the key header is refused, and so
 * is a request with no key, whether the key window is open or closed. lib/file-tickets.ts holds what a ticket is bound
 * to and how it ends.
 *
 * The door checks nothing about the path. GET /api/file checks every clause of its contract on each load, a ticketed
 * load as every other, so a ticket for a path no record names opens nothing.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { sayInEnglish } from '@shared/i18n.ts'
import { KEY_HEADER } from '../../config/key-header.mjs'
import { oneHeader, theHalvesOn, theHashOfTheKeyOnThisRequest } from '../db/the-key-on-this-request-was-made-for-a-run.ts'
import { makeAFileTicket, THE_DOOR_A_TICKET_OPENS, type AFileTicketBook } from '../lib/file-tickets.ts'
import { howThisRequestProvedItself } from '../lib/keys.ts'
import { PanelError } from '../lib/panel-error.ts'
import { parse } from '../lib/parse.ts'
import { route } from '../lib/route.ts'

const ticketBody = z.strictObject({
  path: z
    .string({ error: 'path must be text: the absolute path of the file, as GET /api/file takes it' })
    .min(1, { error: 'path must not be empty: it is the one file the ticket opens' }),
  record: z.string({ error: 'record must be text: the id of the record the page is drawing' }).min(1).optional(),
  workspace: z.string({ error: 'workspace must be text: the id of the project the record is in' }).min(1).optional(),
})

const FILE_TICKET_NOTE =
  'An address for one file that a browser\'s own load can open: a picture, a video, a frame or a saved file. Send ' +
  '{path, record?, workspace?} with both halves of a paired browser\'s device key; the answer is {address}, ' +
  'GET /api/file with those words and a ticket. The ticket opens that one path, by a GET or a HEAD, in the browser ' +
  'whose cookie half it was made under, while the key is live. It ends 30 minutes after its last use and 12 hours ' +
  'after it was made, and a restart ends every ticket: they are kept in memory and never written. A request without ' +
  'both halves is refused with 403 and the code fileTicketNeedsTwoHalves, a whole key in the key header included.'

function needsTwoHalves(): PanelError {
  return new PanelError(sayInEnglish('server.fileTicketNeedsTwoHalves'), 403, undefined, undefined, undefined, {
    code: 'fileTicketNeedsTwoHalves',
    values: {},
  })
}

export async function fileTicketRoutes(app: FastifyInstance, options: { book: AFileTicketBook }): Promise<void> {
  app.post('/file/ticket', route('source.ticket', 'remote', FILE_TICKET_NOTE), async (req, reply) => {
    const body = parse(ticketBody, req.body, 'The body is not usable:')
    const halves = theHalvesOn(req)
    const key = theHashOfTheKeyOnThisRequest(req)
    if (
      oneHeader(req.headers[KEY_HEADER]) !== undefined
      || halves.cookie === undefined
      || halves.header === undefined
      || key === null
      || howThisRequestProvedItself(req)?.how !== 'the-person-key'
    ) {
      throw needsTwoHalves()
    }
    const ticket = makeAFileTicket(options.book, { key, cookieHalf: halves.cookie, path: body.path })
    const words = new URLSearchParams({ path: body.path })
    if (body.record !== undefined) words.set('record', body.record)
    if (body.workspace !== undefined) words.set('workspace', body.workspace)
    words.set('ticket', ticket)
    return reply.header('cache-control', 'no-store').send({ address: `${THE_DOOR_A_TICKET_OPENS}?${words.toString()}` })
  })
}
