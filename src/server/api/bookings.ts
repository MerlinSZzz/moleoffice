// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * BOOKINGS OF THE HOST GPU, OVER HTTP. The design is report peyJSnLoz_Bk; the shapes were agreed
 * in messages L0ZsT2z9ZKQW, sw9PGUtZN72K and arDoBp0zwpvM; a decision approved
 * it.
 *
 *   POST /api/bookings                          book the card; the caller holds the booking
 *   POST /api/bookings/:id/program              name the program doing its work; the booking is running
 *   POST /api/bookings/:id/cancel               take it back; its holder or the owner
 *   POST /api/bookings/:id/go-first             an agent asks to go ahead of one booking
 *   POST /api/bookings/:id/go-first/answer      grant or refuse that request
 *   POST /api/bookings/:id/cut-in/step          the watcher records what its cut-in step did
 *   POST /api/bookings/:id/use                  the GPU tool records what one use was
 *   POST /api/bookings/:id/progress             a running program says how far it is
 *   POST /api/bookings/:id/extend               its holder, a secretary or the owner moves its end later, with a reason
 *   GET  /api/resources/gpu                     where the card stands, answer first
 *   POST /api/resources/gpu/reading             the watcher hands in its reading of the card
 *
 * THE RULES ARE IN src/server/lib/bookings.ts. What is here is the door: what shape the body is, and
 * what comes back. Every door that names an id reads the booking first through `recordInWorkspace`, so an
 * id from another project is a 404 before anything is written.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { GRACE_MINUTES } from '@shared/bookings.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import {
  A_CUT_IN_STEP,
  A_EXTENSION,
  A_GO_FIRST,
  A_GO_FIRST_ANSWER,
  A_GPU_READING,
  A_NEW_BOOKING,
  A_PROGRAM,
  A_PROGRESS,
  A_USE,
  answerAGoFirst,
  askToGoFirst,
  book,
  cancelABooking,
  extendABooking,
  nameTheProgram,
  recordACutInStep,
  recordAUse,
  reportProgress,
  takeAGpuReading,
  theGpuNow,
} from '../lib/bookings.ts'

// ============================================================================ the sentences

const BOOK_NOTE =
  'BOOK THE HOST GPU. Body {"resource":"gpu","gib","minutes","purpose","start","cutIn"?,"repeat"?,"label"?}. `start` is "now", ' +
  '"when-free" or {"at":"YYYY-MM-DD HH:MM"} on the office computer\'s clock. "repeat": "daily" needs {"at"}, and the ' +
  'office books the same time the next day when this day\'s time comes. The caller holds the booking. A booking is ' +
  'placed at the time asked for, and nothing is refused or moved for memory: when the GiB ' +
  'booked at one time go over the card, every holder of those bookings is reminded with each declaration, the total ' +
  'and the card\'s size. An agent that asks for "when-free" waits, by its own choice, for the earliest time its GiB ' +
  'fit beside the others; without a reading of the card the office cannot tell when that is, and refuses with ' +
  'words. "cutIn" is the owner\'s own press, and it acts only when sent, on the running bookings in the owner\'s time: ' +
  `"now" (each holder is told and has ${String(GRACE_MINUTES)} minutes to stop, and its booking moves to after the owner's) ` +
  'or "after" (the owner\'s starts when the running ones end).'

const PROGRAM_NOTE =
  'NAME THE PROGRAM DOING A BOOKING\'S WORK. Body {"pid","startedAt"?,"sandbox"?} — the process group that pid is ' +
  'in — or {"resource","sandbox"?} — a process row or a container row of the ledger. Its holder or the owner. The ' +
  'booking is then running, and it ends when that program ends.'

const USE_NOTE =
  'RECORD WHAT ONE USE OF A BOOKING WAS. Body {"startedAt","endedAt","peakMiB","peakSays","ended"}: when the command ' +
  'started and its process group ended, the most card memory it held at one reading (null when the card could not ' +
  'be read, with why in peakSays), and how it ended. Its holder or the owner, once per booking. tools/gpu.mjs sends it. ' +
  'A caller that does not read the card sends {"startedAt","endedAt","peak":"from the readings","ended"} instead: the ' +
  "office records the most MiB the GPU watcher's readings saw for the booking's sandbox, or null with why."

const PROGRESS_NOTE =
  'SAY HOW FAR A RUNNING BOOKING\'S PROGRAM IS. Body {"done","of"}: whole steps done, of how many. Its holder or the ' +
  'owner. The office keeps the newest report, and GET /api/resources/gpu then says an expected end: the steps left at ' +
  'the pace since the program started. A running booking lasts until its program ends whatever this says.'

const EXTEND_NOTE =
  'EXTEND A BOOKING. Body {"until":"YYYY-MM-DD HH:MM","because"}: its new end, later than its end now and than now, ' +
  'and why. Its holder, a secretary or the owner. Nothing else in the line moves, and nothing is refused for memory: ' +
  'when in the added time the GiB booked go over the card, or the card has not been read ' +
  'since the server started, every holder of those bookings is reminded with each declaration, the total and the ' +
  'card\'s size, and the answer\'s `says` repeats it.'

const CANCEL_NOTE = 'CANCEL A BOOKING. No body. Its holder or the owner. Nothing else in the line moves.'

const GO_FIRST_NOTE =
  'ASK TO GO FIRST. Body {"ahead"}: the booking to go ahead of. The caller holds this booking, and it is waiting. ' +
  'Nothing moves until the request is granted. The owner may always grant it; as a rule the secretaries concerned ' +
  'grant it; when the two agents answer to different secretaries, one group is opened for the two agents and both ' +
  'secretaries, and it needs both their grants or the owner\'s. It lapses when this booking\'s own turn comes.'

const ANSWER_NOTE =
  'GRANT OR REFUSE A REQUEST TO GO FIRST. Body {"grant":true|false}. The owner decides alone. A secretary holding ' +
  'the person\u2019s grant may press the person\u2019s answer for them where this office\u2019s list of what the grant ' +
  'carries says so, the secretary card keeps it for the person by default, and that answer decides alone as the ' +
  'owner\u2019s does. Any other secretary\'s answer counts only when the request needs it, which is only for its own ' +
  'agents. Granted, the booking starts at the time ' +
  'it asked for, or now, and nobody is moved; when the GiB booked then go over the card, the holders are reminded.'

const STEP_NOTE =
  'RECORD A CUT-IN STEP. Body {"sandbox","did":"down"|"no-gpu"}. The GPU watcher (GET /api/office/gpu-watcher says ' +
  'which agent) or the owner, on a booking that went first with a cut-in.'

const GPU_NOTE =
  'WHERE THE HOST GPU STANDS, ANSWER FIRST: `says`, who you are and whether you are the owner, the card\'s size, what ' +
  'is free now, what is running, your own bookings and the next one. ?secondLevel=show adds the whole line, each ' +
  'request to go first with whether your answer to it counts (`mayAnswer`), the latest reading of the card with its ' +
  'age, the processes on the card that no booking accounts for, and this week\'s use by holder and without a ' +
  'booking, counted from the watcher\'s readings since `countedSince`. Writes nothing: a booking whose program has ' +
  'ended is named so, and is ended by the next booking write.'

const READING_NOTE =
  'HAND IN A READING OF THE CARD. Body {"readAt","totalMiB","usedMiB","processes":[{"pid","pgid","mib","who"}]} or ' +
  '{"readAt","error"}. `who` is {"kind":"sandbox","name"}, {"kind":"host","unit"} or {"kind":"unknown","why"}. The ' +
  'GPU watcher (GET /api/office/gpu-watcher says which agent) or the owner. The office keeps only the latest, in ' +
  'memory, and settles the bookings first.'

// ============================================================================ the params

const whichBooking = z.object({ id: z.string().min(1) }).strict()
const gpuQuery = z.object({ secondLevel: z.literal('show').optional() }).strict()

// ============================================================================ the routes

export async function bookingRoutes(app: FastifyInstance): Promise<void> {
  app.post('/bookings', route('booking.make', 'remote', BOOK_NOTE), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const said = parse(A_NEW_BOOKING, req.body, 'The booking')
    const done = book({ workspaceId, said, actor: actorFrom(req) })
    void reply.code(201)
    return { ...done, workspaceId }
  })

  app.post('/bookings/:id/program', route('booking.program', 'remote', PROGRAM_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichBooking, req.params, 'The booking')
    const said = parse(A_PROGRAM, req.body, 'The program')
    return { ...nameTheProgram({ workspaceId, id, said, actor: actorFrom(req) }), workspaceId }
  })

  app.post('/bookings/:id/cancel', route('booking.cancel', 'remote', CANCEL_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichBooking, req.params, 'The booking to cancel')
    return { ...cancelABooking({ workspaceId, id, actor: actorFrom(req) }), workspaceId }
  })

  app.post('/bookings/:id/go-first', route('booking.goFirst', 'remote', GO_FIRST_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichBooking, req.params, 'The booking that asks')
    const said = parse(A_GO_FIRST, req.body, 'The request')
    return { ...askToGoFirst({ workspaceId, id, said, actor: actorFrom(req) }), workspaceId }
  })

  app.post('/bookings/:id/go-first/answer', route('booking.answer', 'remote', ANSWER_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichBooking, req.params, 'The booking whose request is answered')
    const said = parse(A_GO_FIRST_ANSWER, req.body, 'The answer')
    return { ...answerAGoFirst({ workspaceId, id, said, actor: actorFrom(req) }), workspaceId }
  })

  app.post('/bookings/:id/cut-in/step', route('booking.cutInStep', 'remote', STEP_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichBooking, req.params, 'The booking')
    const said = parse(A_CUT_IN_STEP, req.body, 'The step')
    return { ...recordACutInStep({ workspaceId, id, said, actor: actorFrom(req) }), workspaceId }
  })

  app.post('/bookings/:id/use', route('booking.use', 'remote', USE_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichBooking, req.params, 'The booking')
    const said = parse(A_USE, req.body, 'The use')
    return { ...recordAUse({ workspaceId, id, said, actor: actorFrom(req) }), workspaceId }
  })

  app.post('/bookings/:id/progress', route('booking.progress', 'remote', PROGRESS_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichBooking, req.params, 'The booking')
    const said = parse(A_PROGRESS, req.body, 'The progress')
    return { ...reportProgress({ workspaceId, id, said, actor: actorFrom(req) }), workspaceId }
  })

  app.post('/bookings/:id/extend', route('booking.extend', 'remote', EXTEND_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichBooking, req.params, 'The booking to extend')
    const said = parse(A_EXTENSION, req.body, 'The extension')
    return { ...extendABooking({ workspaceId, id, said, actor: actorFrom(req) }), workspaceId }
  })

  app.get('/resources/gpu', route('runtime.resources', 'remote', GPU_NOTE), async (req) => {
    const { secondLevel } = parse(gpuQuery, req.query ?? {}, 'The question')
    return theGpuNow({ actor: actorFrom(req), secondLevel: secondLevel === 'show' })
  })

  app.post('/resources/gpu/reading', route('booking.reading', 'remote', READING_NOTE), async (req) => {
    const said = parse(A_GPU_READING, req.body, 'The reading')
    return takeAGpuReading({ said, actor: actorFrom(req) })
  })
}
