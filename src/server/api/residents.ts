// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PERMANENT RESIDENTS AND THEIR PERSONAL SPACES, OVER HTTP.
 *
 *   GET  /api/residents                                   residents, and the open proposals
 *   POST /api/residents/proposals                         a secretary proposes an agent
 *   POST /api/residents/proposals/:id/confirm             the person confirms: decision, residency, space
 *   POST /api/residents/proposals/:id/decline             the person says "Not now"
 *   GET  /api/residents/:agentId                          one resident, and its space for a caller that may read it
 *   GET  /api/residents/:agentId/space                    the space's files
 *   GET  /api/residents/:agentId/space/file?path=…        one file's bytes, or one stretch of them
 *   PUT  /api/residents/:agentId/space/file?path=…        the resident writes one new file
 *   POST /api/residents/:agentId/space/void               the resident or the person marks a file void
 *   POST /api/residents/:agentId/grants                   the resident gives an agent leave to read
 *   POST /api/residents/:agentId/grants/:grantId/end      the resident or the person ends it
 *   POST /api/residents/:agentId/successor                the person names a retired resident's successor
 *   POST /api/residents/:agentId/sleep                    the resident or the person: it sleeps
 *   POST /api/residents/:agentId/wake                     the resident or the person: it wakes, and is handed what was held
 *   POST /api/residents/:agentId/sleep/postpone           the resident itself postpones a sleep; nobody is told
 *   PUT  /api/residents/:agentId/sleep-time               the resident or the person: when its own sleep begins and how long
 *   POST /api/residents/:agentId/named                    the resident or the person: its picture and name are chosen
 *
 * NOTHING HERE REPEATS A RULE. Who may do what, the path rules, the limit and the session-origin file are in
 * src/server/lib/residents.ts and src/server/lib/session-origins.ts; this file turns them into routes and the
 * sentences GET /api publishes.
 */

import { closeSync, read } from 'node:fs'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { PanelError } from '../lib/panel-error.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { decodeReturnedFileBase64 } from '../lib/returnedfiles.ts'
import { typeOfBytes } from '@shared/file-signatures.ts'
import { openToSend, refuseAStretchItHasNoneOf, sendTheOpenFile, theStretchAskedFor, type OpenFile } from './files.ts'
import {
  confirmAResident,
  declineAResident,
  endLeave,
  everyResident,
  giveLeave,
  HAVING_A_SLEEP_TIME,
  markTheResidentNamed,
  postponeASleep,
  readTheSleepTime,
  setASleepTime,
  sleepAResident,
  theResidentToActOn,
  wakeAResident,
  inTheList,
  listTheSpace,
  maxPersonalSpaceBytes,
  nameASuccessor,
  oneResident,
  openResidencyProposals,
  proposeAResident,
  theBytesUsed,
  theFileToRead,
  theResidentNamed,
  voidAFile,
  writeAFile,
  WHAT_THE_OFFICE_CANNOT_STOP,
  type AFileInTheSpace,
  type AResidentInTheList,
  type ASleepAct,
  type Confirmed,
  type AWaking,
  type Residency,
  type TheResidentsList,
} from '../lib/residents.ts'
import { SLEEP_TIME_LONGEST_MINUTES, SLEEP_TIME_SHORTEST_MINUTES } from '@shared/residents.ts'

// ============================================================================ the sentences

const LIST_NOTE =
  'EVERY PERMANENT RESIDENT, AND EVERY RESIDENCY PROPOSAL THE OWNER HAS NOT ANSWERED. A resident is an agent the ' +
  'secretary proposed and the owner confirmed; each has a personal space of its own. ' +
  'Answers {residents:[{agentId, handle, name, since, retired, successor}], openProposals:[{id, workspaceId, title, ' +
  'agentId, handle, name, proposedAt, proposedBy, because, facts, settled}], limit}, where limit is the most bytes one ' +
  'space may hold. Writes nothing.'

const PROPOSE_NOTE =
  'A SECRETARY PROPOSES AN AGENT AS A PERMANENT RESIDENT. Body {"agentId":"<id or handle>","because":"<why, in your ' +
  'own words>","area"?:"<its long-term area of responsibility, one line of at most 200 characters>"}. Only an agent holding the secretary card, not retired, with its own key sent as x-mole-office-key. ' +
  'It files a `proposal` record in this project with one option, and the office adds the facts it measured: days ' +
  'since the agent became a citizen, days with a run, runs, records written, compactions its runs reported, retired ' +
  'or not, home world. The evidence then says whether each part of the decided criterion is met: three days with a ' +
  'run, five compactions reported, and a long-term area named. Nothing is refused for falling short of it; the ' +
  'person judges. An agent ' +
  'that is retired, already a resident, not a citizen of this world, or the mail tool is refused, and so is a second ' +
  'open proposal for the same agent. Answers 201 {proposal}.'

const CONFIRM_NOTE =
  'THE OWNER CONFIRMS A RESIDENCY PROPOSAL. No body. The person, with a proved request, or a secretary holding the ' +
  'person\'s grant where this office\'s list of what the grant carries says it may press this door. The grant never ' +
  'presses it for the agent that filed the proposal, so the agent that proposes can never also confirm. Under the grant ' +
  'the residency names the secretary as the one who confirmed it. In one act it files a `decision` ' +
  'settling the proposal, writes the residency on the agent, and makes the personal space with its session-origin ' +
  'file. If the folder cannot be made, nothing is recorded and the answer says why. In the same act a row asking for ' +
  'a picture and a name for the new resident is put on GET /api/waiting, until POST /api/residents/:agentId/named; ' +
  'right after it the resident is sent one office line saying it may choose its own picture. If that line could ' +
  'not be written, `reminder.agent` says why and so does `said`. Answers {resident, decision:{id, title}, ' +
  'firstOrigin, reminder:{person, agent}, said}.'

const DECLINE_NOTE =
  'THE OWNER SAYS "NOT NOW" TO A RESIDENCY PROPOSAL. Body {"because"?: "<the reason>"}. The person only, with a ' +
  'proved request. It files a `decision` that settles the proposal by declining it; the secretary may propose the ' +
  'same agent again later. Answers {decision:{id, title}}.'

const ONE_NOTE =
  'ONE PERMANENT RESIDENT: since when, who proposed it, who confirmed it, the facts measured at the proposal, ' +
  'whether it is retired, its successor, whether its picture and name were chosen (`naming`), its heartbeat (whether ' +
  'a session holds its handle now, when the hold last beat, whether it lapsed) and its sleep (asleep since, when its ' +
  'last sleep ended, and its postponed sleeps, newest first, at most five; when the office ends a sleep it began at the ' +
  'sleep time, and the sleep time itself with when the next sleep begins) and whether it holds the secretary card ' +
  '(`holdsTheSecretaryCard`, which a sleep time needs). For a caller that may read the space (the resident with its own key, ' +
  'the owner, an agent holding leave, the successor once the resident is retired) it also answers the space: the ' +
  'bytes used and the limit, every grant, every void mark, and whether the session-origin file is up to date. Any ' +
  'other caller is told only that the space is private: {space:{mayRead:false, private}}. Reading it brings the ' +
  'session-origin file up to date, which may append a line to it.'

const SPACE_NOTE =
  'THE FILES IN A RESIDENT\'S PERSONAL SPACE: each with its path, size, modified time, who last wrote it and when, ' +
  'its void mark, and its earlier versions (number, path, size, when kept, void mark). For the resident, the owner, an agent holding leave, and the successor once the resident is ' +
  'retired; anybody else is refused with "This space is private". Answers {files, used, limit, notes}. Reading it ' +
  'brings the session-origin file up to date, which may append a line to it.'

const FILE_READ_NOTE =
  'ONE FILE\'S BYTES, from a resident\'s personal space. ?path= is relative to the space. The same readers as the ' +
  'file list. The reply is the file itself, not JSON. A Range header of one stretch in bytes is answered 206 with ' +
  'that stretch, and a stretch the file has none of 416.'

const FILE_WRITE_NOTE =
  'THE RESIDENT WRITES ONE NEW FILE INTO ITS OWN SPACE. ?path= is relative, with forward slashes, no "." or ".." ' +
  'part, at most 255 characters. Body {"text":"<the file as text>"} or {"bytes":"<the file, base64>"}, exactly one. ' +
  'Only the resident, with its own key, while it is not retired. A path already written is replaced, and the office ' +
  'first keeps the old bytes as an earlier version under .versions/<path>/<n> in the space: nothing in a space is ever ' +
  'deleted. Earlier versions are listed under their file, read through the file door, written by nobody, and counted ' +
  'against the limit. session-origins.jsonl at the root and the .versions/ folder are the office\'s own and are ' +
  'refused. A write that would take the space past MOLE_OFFICE_PERSONAL_SPACE_MAX_BYTES is refused with the size used ' +
  'and the limit, and nothing is cut. Answers 201 {file}, with the file\'s versions.'

const VOID_NOTE =
  'MARK A FILE IN A RESIDENT\'S SPACE VOID, with the reason. Body {"path":"<relative path>","because":"<why>"}. The ' +
  'resident with its own key, or the owner. The file stays, and a page draws it struck through with the reason. A ' +
  'mark is never taken off, and session-origins.jsonl is never marked. Answers 201 {voidMark}.'

const GRANT_NOTE =
  'THE RESIDENT GIVES ONE NAMED AGENT LEAVE TO READ ITS SPACE. Body {"readerAgentId":"<id or handle>","until":"YYYY-MM-DD ' +
  'HH:MM"}, in this office\'s local time. Only the resident, with its own key, while it is not retired. Leave covers ' +
  'reading only, and it stops when it is ended, when its end comes, or when the resident is retired. Answers 201 {grant}.'

const GRANT_END_NOTE =
  'END LEAVE TO READ A RESIDENT\'S SPACE. No body. The resident with its own key, or the owner. The grant is kept, ' +
  'with who ended it and when. Answers {grant}.'

const SLEEP_NOTE =
  'A PERMANENT RESIDENT GOES TO SLEEP. Body {"because"?:"<why>"}. The resident with its own key, or the person. ' +
  'Refused for an agent that is not a resident, a retired resident, and one already asleep. While it sleeps its ' +
  'handle\'s hold and heartbeat go on; its waiter (GET /api/handles/:handle/waiting) and the message worker are ' +
  'handed only urgent messages, and every other message is kept, unread and unchanged, until it wakes. Only a wake ' +
  'ends a sleep begun here. The office begins a sleep by itself only at a sleep time that was set ' +
  '(PUT /api/residents/:agentId/sleep-time). Answers 201 {said, sleep}.'

const WAKE_NOTE =
  'A PERMANENT RESIDENT WAKES. No body. The resident with its own key, or the person. Refused when it is not asleep. ' +
  'The messages its sleep held are handed over at its waiter\'s next read, unchanged and in order, and a waiter ' +
  'held open now is woken. Answers {said, held, sleep}, where held is how many messages were held.'

const POSTPONE_NOTE =
  'A PERMANENT RESIDENT POSTPONES A SLEEP. Body {"because":"<why>"}. The resident with its own key only, while it is ' +
  'not retired, and either awake or in a sleep the office began at its sleep time, which then ends; a sleep begun by ' +
  'a press is ended by waking, and refused here. It writes one row on the resident and sends nothing: no message and ' +
  'no row of what waits on the person. It is shown on the resident\'s profile and beside it in the chat. ' +
  'Answers 201 {said, sleep}.'

const SLEEP_TIME_NOTE =
  'A SECRETARY SETS ITS OWN SLEEP TIME. Body {"startsAt":"<time of day>","minutes":<how long>}. startsAt is hours ' +
  'and minutes on the office\'s clock, such as "03:00", "3:00" or "3.00", and is kept as HH:MM; minutes is a whole ' +
  `number from ${String(SLEEP_TIME_SHORTEST_MINUTES)} to ${String(SLEEP_TIME_LONGEST_MINUTES)}. ` +
  'The resident with its own key, or the person, for a resident that holds the secretary card ' +
  'and is not retired; either may change it. Setting it begins no sleep. Each day when the time opens the office ' +
  'begins the sleep, sends the resident one message asking it to update its memory, notes and handover and to tidy ' +
  'its work, and ends the sleep when the minutes are over. A resident already asleep is not put to sleep again, and one ' +
  'at work may postpone the sleep (POST /api/residents/:agentId/sleep/postpone). Answers {said, sleep}, where said ' +
  'names the time kept, the zone and when the next sleep begins.'

const NAMED_NOTE =
  'THE PICTURE AND THE NAME OF A PERMANENT RESIDENT ARE CHOSEN. No body. The resident with its own key, or the person, ' +
  'once. It records when and by whom, and takes the reminder off GET /api/waiting. It changes no picture and no name: ' +
  'POST /api/participants/agent/:id/avatar and PATCH /api/participants/agent/:id do that. Answers {resident, naming}.'

const SUCCESSOR_NOTE =
  'THE OWNER NAMES THE SUCCESSOR OF A RETIRED RESIDENT. Body {"agentId":"<id or handle>"}. The person only, with a ' +
  'proved request, once the resident is retired, and once. Taking the retired agent\'s handle does not make an agent ' +
  'its successor; only this press does. The successor may then read the space. Answers {resident}.'

// ============================================================================ what the doors answer

/** POST /api/residents/proposals/:id/confirm. A 200 means the space was made: when it cannot be, nothing is recorded. */
export interface TheConfirmReply {
  resident: AResidentInTheList
  decision: { id: string; title: string }
  firstOrigin: string | null
  reminder: Confirmed['reminder']
  said: string
}

/** POST /api/residents/:agentId/named. */
export interface TheNamedReply {
  resident: AResidentInTheList
  naming: Residency['naming']
}

/** POST /api/residents/proposals/:id/decline. */
export interface TheDeclineReply {
  decision: { id: string; title: string }
}

/** GET /api/residents/:agentId/space. */
export interface TheSpaceListing {
  files: AFileInTheSpace[]
  used: number
  limit: number
  notes: string
}

// ============================================================================ what a caller sends

const proposalSent = z.object({ agentId: z.string().min(1), because: z.string(), area: z.string().max(200).optional() }).strict()
const sleepSent = z.object({ because: z.string().max(500).optional() }).strict()
const postponeSent = z.object({ because: z.string().max(500) }).strict()
const sleepTimeSent = z.object({ startsAt: z.string().max(40), minutes: z.number() }).strict()
const declineSent = z.object({ because: z.string().optional() }).strict()
const residentPath = z.object({ agentId: z.string().min(1) }).strict()
const proposalPath = z.object({ id: z.string().min(1) }).strict()
const grantPath = z.object({ agentId: z.string().min(1), grantId: z.string().min(1) }).strict()
const filePath = z.object({ path: z.string() }).strict()
const fileSent = z.object({ text: z.string().optional(), bytes: z.string().optional() }).strict()
const voidSent = z.object({ path: z.string(), because: z.string() }).strict()
const grantSent = z.object({ readerAgentId: z.string().min(1), until: z.string() }).strict()
const successorSent = z.object({ agentId: z.string().min(1) }).strict()

/** The largest request the file door reads: the whole limit as base64, and room around it. */
function bodyLimitForAFile(limit: number): number {
  return Math.ceil((limit * 4) / 3) + 4096
}

/** The bytes a PUT carries, from exactly one of `text` and `bytes`. */
function theBytesSent(sent: z.output<typeof fileSent>): Buffer {
  if ((sent.text === undefined) === (sent.bytes === undefined)) {
    throw new PanelError('Send the file as exactly one of "text" (the file as text) or "bytes" (the file, base64). Nothing was written.', 400)
  }
  if (sent.text !== undefined) return Buffer.from(sent.text, 'utf8')
  return decodeReturnedFileBase64(sent.bytes ?? '', 'That file')
}

/** The most of a file held at once while its type is read: a megabyte. */
const A_PIECE = 1024 * 1024

/** Fill `into` from the open file at `position`, or as far as the file goes, and answer how many bytes were read. */
async function aPieceOf(file: OpenFile, into: Buffer, position: number): Promise<number> {
  let got = 0
  while (got < into.length) {
    const more = await new Promise<number>((done, fail) => {
      read(file.fd, into, got, into.length - got, position + got, (err, bytesRead) => (err === null ? done(bytesRead) : fail(err)))
    })
    if (more === 0) break
    got += more
  }
  return got
}

/**
 * WHAT A SERVED FILE IS SAID TO BE: a picture or a PDF by its first bytes, text when the whole of it reads as UTF-8,
 * else bytes. The same answer as decoding the whole file at once, read a piece at a time from the open file, so a
 * large file is never held whole (wave 13y round 34). The decoder is told that more follows each piece, so a character
 * a piece's end cuts is read with the next piece, and told at the end that nothing follows, so a character the file's
 * end cuts is not UTF-8.
 */
async function theTypeOf(file: OpenFile): Promise<string> {
  const piece = Buffer.alloc(Math.min(A_PIECE, file.size))
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let at = 0
  while (at < file.size) {
    const got = await aPieceOf(file, piece, at)
    if (got === 0) break
    if (at === 0) {
      const signed = typeOfBytes(piece.subarray(0, got))
      if (signed !== null) return signed
    }
    try {
      decoder.decode(piece.subarray(0, got), { stream: true })
    } catch {
      return 'application/octet-stream'
    }
    at += got
  }
  try {
    decoder.decode()
    return 'text/plain; charset=utf-8'
  } catch {
    return 'application/octet-stream'
  }
}

// ============================================================================ the routes

export async function residentsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/residents', route('resident.list', 'remote', LIST_NOTE), async (): Promise<TheResidentsList> => ({
    residents: everyResident().map(inTheList),
    openProposals: openResidencyProposals(),
    limit: maxPersonalSpaceBytes(),
  }))

  app.post('/residents/proposals', route('resident.propose', 'remote', PROPOSE_NOTE), async (req, reply) => {
    const sent = parse(proposalSent, req.body ?? {}, 'The proposal')
    const proposal = proposeAResident(sent, actorFrom(req), workspaceOf(req))
    reply.code(201)
    return { proposal }
  })

  app.post('/residents/proposals/:id/confirm', route('resident.confirm', 'remote', CONFIRM_NOTE), async (req): Promise<TheConfirmReply> => {
    const asked = parse(proposalPath, req.params, 'The proposal')
    const done = confirmAResident(asked.id, actorFrom(req))
    return {
      resident: inTheList(done.residency),
      decision: { id: done.decision.id, title: done.decision.title },
      firstOrigin: done.firstOrigin,
      reminder: done.reminder,
      said: done.said,
    }
  })

  app.post('/residents/proposals/:id/decline', route('resident.decline', 'remote', DECLINE_NOTE), async (req): Promise<TheDeclineReply> => {
    const asked = parse(proposalPath, req.params, 'The proposal')
    const sent = parse(declineSent, req.body ?? {}, 'The answer')
    const decision = declineAResident(asked.id, sent.because, actorFrom(req))
    return { decision: { id: decision.id, title: decision.title } }
  })

  app.get('/residents/:agentId', route('resident.one', 'remote', ONE_NOTE), async (req) => {
    const asked = parse(residentPath, req.params, 'The resident')
    return oneResident(theResidentNamed(asked.agentId, 'reading'), actorFrom(req))
  })

  app.get('/residents/:agentId/space', route('resident.space', 'remote', SPACE_NOTE), async (req): Promise<TheSpaceListing> => {
    const asked = parse(residentPath, req.params, 'The resident')
    const residency = theResidentNamed(asked.agentId, 'reading')
    const files = listTheSpace(residency, actorFrom(req))
    return { files, used: theBytesUsed(residency.agentId), limit: maxPersonalSpaceBytes(), notes: WHAT_THE_OFFICE_CANNOT_STOP }
  })

  app.get('/residents/:agentId/space/file', route('resident.file.read', 'remote', FILE_READ_NOTE), async (req, reply) => {
    const asked = parse(residentPath, req.params, 'The resident')
    const query = parse(filePath, req.query ?? {}, 'The file')
    const found = theFileToRead(theResidentNamed(asked.agentId, 'reading'), query.path, actorFrom(req))
    // SENT FROM THE FILE, whole or one stretch, and not read whole first (wave 13y round 34).
    const file = openToSend(found.at)
    let stretch: ReturnType<typeof theStretchAskedFor>
    let type: string
    try {
      stretch = theStretchAskedFor(typeof req.headers.range === 'string' ? req.headers.range : undefined, file.size)
      type = stretch === 'none of it' ? '' : await theTypeOf(file)
    } catch (err) {
      closeSync(file.fd)
      throw err
    }
    if (stretch === 'none of it') return refuseAStretchItHasNoneOf(req, reply, found.path, file)
    // A stretch is said to be what the whole file is.
    void reply.header('content-type', type)
    // KEPT BY THE BROWSER ONLY UNTIL IT ASKS AGAIN, which is what the version tag gave this file while it was read
    // whole: a resident replaces a file under its own name, and leave to read it can end.
    void reply.header('cache-control', 'private, no-cache')
    void reply.header('accept-ranges', 'bytes')
    return sendTheOpenFile(req, reply, found.at, file, stretch)
  })

  const limit = maxPersonalSpaceBytes()
  app.put(
    '/residents/:agentId/space/file',
    { bodyLimit: bodyLimitForAFile(limit), ...route('resident.file.write', 'remote', FILE_WRITE_NOTE) },
    async (req, reply) => {
      const asked = parse(residentPath, req.params, 'The resident')
      const query = parse(filePath, req.query ?? {}, 'The file')
      const sent = parse(fileSent, req.body ?? {}, 'The file')
      const residency = theResidentNamed(asked.agentId, 'writing')
      const file = writeAFile(residency, query.path, theBytesSent(sent), actorFrom(req))
      reply.code(201)
      return { file }
    },
  )

  app.post('/residents/:agentId/space/void', route('resident.void', 'remote', VOID_NOTE), async (req, reply) => {
    const asked = parse(residentPath, req.params, 'The resident')
    const sent = parse(voidSent, req.body ?? {}, 'The void mark')
    const voidMark = voidAFile(theResidentNamed(asked.agentId, 'writing'), sent.path, sent.because, actorFrom(req))
    reply.code(201)
    return { voidMark }
  })

  app.post('/residents/:agentId/grants', route('resident.grant', 'remote', GRANT_NOTE), async (req, reply) => {
    const asked = parse(residentPath, req.params, 'The resident')
    const sent = parse(grantSent, req.body ?? {}, 'The leave')
    const grant = giveLeave(theResidentNamed(asked.agentId, 'writing'), sent, actorFrom(req))
    reply.code(201)
    return { grant }
  })

  app.post('/residents/:agentId/grants/:grantId/end', route('resident.grant.end', 'remote', GRANT_END_NOTE), async (req) => {
    const asked = parse(grantPath, req.params, 'The leave')
    const grant = endLeave(theResidentNamed(asked.agentId, 'writing'), asked.grantId, actorFrom(req))
    return { grant }
  })

  app.post('/residents/:agentId/sleep', route('resident.sleep', 'remote', SLEEP_NOTE), async (req, reply): Promise<ASleepAct> => {
    const asked = parse(residentPath, req.params, 'The resident')
    const sent = parse(sleepSent, req.body ?? {}, 'The sleep')
    const done = sleepAResident(theResidentToActOn(asked.agentId, 'sleep'), sent.because, actorFrom(req))
    reply.code(201)
    return done
  })

  app.post('/residents/:agentId/wake', route('resident.wake', 'remote', WAKE_NOTE), async (req): Promise<AWaking> => {
    const asked = parse(residentPath, req.params, 'The resident')
    return wakeAResident(theResidentToActOn(asked.agentId, 'wake'), actorFrom(req))
  })

  app.post('/residents/:agentId/sleep/postpone', route('resident.sleep.postpone', 'remote', POSTPONE_NOTE), async (req, reply): Promise<ASleepAct> => {
    const asked = parse(residentPath, req.params, 'The resident')
    const sent = parse(postponeSent, req.body ?? {}, 'The postponed sleep')
    const done = postponeASleep(theResidentToActOn(asked.agentId, 'postpone a sleep'), sent.because, actorFrom(req))
    reply.code(201)
    return done
  })

  app.put('/residents/:agentId/sleep-time', route('resident.sleep.time', 'remote', SLEEP_TIME_NOTE), async (req): Promise<ASleepAct> => {
    const asked = parse(residentPath, req.params, 'The resident')
    const sent = parse(sleepTimeSent, req.body ?? {}, 'The sleep time')
    const time = readTheSleepTime(sent)
    return setASleepTime(theResidentToActOn(asked.agentId, HAVING_A_SLEEP_TIME), time, actorFrom(req))
  })

  app.post('/residents/:agentId/named', route('resident.named', 'remote', NAMED_NOTE), async (req): Promise<TheNamedReply> => {
    const asked = parse(residentPath, req.params, 'The resident')
    const residency = markTheResidentNamed(theResidentToActOn(asked.agentId, 'have its picture and name marked chosen'), actorFrom(req))
    return { resident: inTheList(residency), naming: residency.naming }
  })

  app.post('/residents/:agentId/successor', route('resident.successor', 'remote', SUCCESSOR_NOTE), async (req) => {
    const asked = parse(residentPath, req.params, 'The resident')
    const sent = parse(successorSent, req.body ?? {}, 'The successor')
    const residency = nameASuccessor(theResidentNamed(asked.agentId, 'writing'), sent.agentId, actorFrom(req))
    return { resident: inTheList(residency) }
  })
}
