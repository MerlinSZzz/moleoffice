// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * GET /api/where-you-stand: THE BRIEF, WHAT WAITS ON A PERSON AND WHAT IS STILL OPEN, IN ONE READ.
 *
 * Round 39 of wave 13n. The session hook (tools/session-hook.mjs) tells a session where it stands when
 * it starts and again after a compaction, and it waits 3 seconds for each read. At 07:16 on 5 October
 * 2026, at a load of about 19, a session was compacted and the hook said the brief, the waiting
 * list, the other runs and the open loops had all not answered. Measured on a made-up office of the live
 * shape at a load near 20 (wave 13n's round 39 report): alone, GET /api/brief took 2.0 to 2.6 s,
 * GET /api/waiting 2.2 to 3.3 s and GET /api/open-loops 0.9 to 1.6 s. They share the office's one thread,
 * so sent together as the hook sends them, the last of the seven arrived after 3.9 to 8.1 s. No order of
 * asking fits that in 3 seconds. Only an answer that was already worked out does.
 *
 * WHAT THIS DOOR DOES. It answers the three replies the three doors give, worked out once: the open loops
 * the brief ranks are the open loops it hands back. It keeps the last answer it worked out for each
 * caller. When the last time it worked one out took longer than `FRESH_WITHIN_MS`, the office is busy,
 * and a caller it already answered once gets the kept answer at once, with the time it was worked out and
 * how old it is. The kept answer is worked out again `REFRESH_AFTER_MS` later, after the hook has finished,
 * so the refresh does not hold up the hook's other reads. A kept answer older than `KEPT_FOR_AT_MOST_MS` is
 * never given (a condition, message xc233fjcrLe2): a session compacted hours after it last asked
 * would otherwise act on hours-old counts and loops. Otherwise, and for a caller with no kept answer young
 * enough, it works the answer out now.
 *
 * A KEPT ANSWER ALWAYS SAYS SO. `workedOut.kept` is true, and `workedOut.at` and `workedOut.ageSeconds`
 * say when it was worked out and how long before this request. The hook prints that sentence above the
 * three parts. Nothing here is ever presented as current when it is not.
 *
 * ONE CALLER IS ONE PROJECT, ONE IDENTITY AND ONE SESSION, because the brief and both lists depend on all
 * three: what a reader may read comes from who is asking, and the brief's "decided since you last ran"
 * comes from the session the caller names. A kept answer is never handed to anybody else.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { route } from '../lib/route.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { readForks } from '../lib/forks.ts'
import { openLoopsFor, type OpenLoops } from '../lib/openloops.ts'
import { theReadingOpenWorkIsRankedBy } from '../lib/openwork.ts'
import { theMessageReader, withEachNarrowingWorkedOutOnce } from '../lib/messages.ts'
import type { Actor } from '../lib/records.ts'
import { nowStamp } from '@shared/time.ts'
import { theBriefFor } from './brief.ts'
import { theWaitingReply, type WaitingReply } from './waiting.ts'
import { named } from '../lib/named-timers.ts'

/**
 * HOW LONG A FRESH ANSWER MAY HAVE TAKEN FOR THE NEXT ONE TO BE WORKED OUT FRESH. Half the hook's
 * 3-second wait, because the hook's other reads queue on the same thread. On the made-up office of the
 * live shape a fresh answer took about 1.0 s with the machine quiet and 4 s or more at a load near 20.
 */
export const FRESH_WITHIN_MS = 1_500

/** How long after a kept answer is given it is worked out again: after the hook's 10-second limit. */
export const REFRESH_AFTER_MS = 12_000

/**
 * HOW OLD A KEPT ANSWER MAY BE AND STILL BE GIVEN: 10 minutes. A kept answer is worked out
 * again 12 seconds after it is given, so a session that compacts again within minutes gets one that young;
 * one that last asked longer ago waits for the work, as every read did before this door.
 */
export const KEPT_FOR_AT_MOST_MS = 10 * 60_000

/** How many callers' answers are kept, about 400 KB each on the live shape. The least recently asked goes first. */
export const KEPT_AT_MOST = 50

/** The three replies, exactly as GET /api/brief, GET /api/waiting and GET /api/open-loops give them. */
export interface WhereYouStandParts {
  brief: ReturnType<typeof theBriefFor>
  waiting: WaitingReply
  openLoops: OpenLoops
}

/** When the answer was worked out, and whether it was kept from an earlier request. */
export interface WorkedOut {
  /** Local wall-clock time it was worked out. */
  at: string
  /** Whole seconds between then and this request. 0 for an answer worked out for this request. */
  ageSeconds: number
  kept: boolean
  /** How long working it out took, in milliseconds. */
  tookMs: number
  says: string
}

interface Kept {
  parts: WhereYouStandParts
  at: string
  atMs: number
  tookMs: number
}

const whereYouStandQuery = z.strictObject({})

function callerKey(workspaceId: string, actor: Actor): string {
  return JSON.stringify([workspaceId, actor.type, actor.id, actor.keyHolder ?? null, actor.sessionId ?? null, actor.ownKeyRun ?? null])
}

async function workOut(workspaceId: string, actor: Actor): Promise<Kept> {
  const started = performance.now()
  // THE ATTENTION RULE RUNS FIRST, ON ITS OWN THREAD, so the office answers other requests meanwhile, and
  // the rest is read after it (`theReadingOpenWorkIsRankedBy`, problem CtH8CGBkE5Bz).
  //
  // WHAT WAITS ON A PERSON IS READ WHILE THE RULE RUNS. It does not depend on the rule's reading, and it was
  // read after it: 0.7 to 0.9 s of this thread on the made-up office of the live size at a load near 43, added
  // to the rule's 1.1 to 2.3 s on its own thread (wave 13y round 22). Only the open loops have to be read after.
  const rankingRuns = theReadingOpenWorkIsRankedBy(workspaceId)
  const reader = theMessageReader(actor)
  let waiting: WaitingReply
  try {
    waiting = theWaitingReply(reader)
  } catch (error) {
    // The request fails with this error. The rule's reading is then not awaited by anybody, and its own failure,
    // if it has one, would end the process as an unhandled rejection; this request has already failed loudly.
    rankingRuns.catch(() => undefined)
    throw error
  }
  const ranking = await rankingRuns
  const forks = readForks()
  // THE OPEN LOOPS AND THE BRIEF EACH NARROW A LONG LIST OF MESSAGES FOR AN AGENT, and the narrowing is worked out once.
  const { openLoops, brief } = withEachNarrowingWorkedOutOnce(() => {
    const loops = openLoopsFor({ workspaceId, reader, forks })
    return { openLoops: loops, brief: theBriefFor(workspaceId, actor, forks, loops, ranking) }
  })
  return { parts: { brief, waiting, openLoops }, at: nowStamp(), atMs: Date.now(), tookMs: Math.round(performance.now() - started) }
}

export async function whereYouStandRoutes(app: FastifyInstance): Promise<void> {
  // HELD PER SERVER, never per module, so a test that builds a second office in one process starts with none.
  const kept = new Map<string, Kept>()
  const refreshes = new Map<string, ReturnType<typeof setTimeout>>()
  let lastTookMs: number | null = null

  const keep = (key: string, answer: Kept): void => {
    lastTookMs = answer.tookMs
    kept.delete(key)
    kept.set(key, answer)
    for (const oldest of kept.keys()) {
      if (kept.size <= KEPT_AT_MOST) break
      kept.delete(oldest)
    }
  }

  const refreshLater = (key: string, workspaceId: string, actor: Actor): void => {
    if (refreshes.has(key)) return
    // NAMED, so a long run is a line in the log and the loop watch can say whose a hold was (lib/named-timers.ts).
    const timer = setTimeout(named('the where-you-stand refresh', (line) => app.log.warn(line), () => {
      refreshes.delete(key)
      if (!kept.has(key)) return
      workOut(workspaceId, actor).then(
        (answer) => keep(key, answer),
        (error: unknown) => {
          // A REFRESH THAT FAILED LEAVES NOTHING KEPT, so the caller's next request works the answer out
          // itself and gets whatever error that gives, rather than an ever older answer.
          kept.delete(key)
          app.log.warn({ err: error }, 'GET /api/where-you-stand could not work a kept answer out again, so it dropped it')
        },
      )
    }), REFRESH_AFTER_MS)
    timer.unref()
    refreshes.set(key, timer)
  }

  app.addHook('onClose', async () => {
    for (const timer of refreshes.values()) clearTimeout(timer)
    refreshes.clear()
    kept.clear()
  })

  app.get(
    '/where-you-stand',
    route(
      'project.where-you-stand',
      'remote',
      'WHAT A SESSION IS TOLD WHEN IT STARTS AND AFTER A COMPACTION, IN ONE READ: the reply of GET /api/brief, ' +
        'of GET /api/waiting and of GET /api/open-loops, worked out once. When the office is busy, a caller it ' +
        'answered before gets the answer it kept, and `workedOut` says when that was worked out and how old it ' +
        'is; ask the three doors themselves for what holds now.',
    ),
    async (req) => {
      parse(whereYouStandQuery, req.query, 'Where you stand takes no options:')
      const workspaceId = workspaceOf(req)
      const actor = actorFrom(req, { proveOwnRun: true })
      const key = callerKey(workspaceId, actor)
      const held = kept.get(key)
      const youngEnough = held !== undefined && Date.now() - held.atMs <= KEPT_FOR_AT_MOST_MS
      if (held !== undefined && youngEnough && lastTookMs !== null && lastTookMs > FRESH_WITHIN_MS) {
        const ageSeconds = Math.max(0, Math.floor((Date.now() - held.atMs) / 1000))
        kept.delete(key)
        kept.set(key, held)
        refreshLater(key, workspaceId, actor)
        const workedOut: WorkedOut = {
          at: held.at,
          ageSeconds,
          kept: true,
          tookMs: held.tookMs,
          says:
            `This was worked out at ${held.at}, ${String(ageSeconds)} seconds before this request, and kept, because ` +
            `the office was busy: the last time it worked this out took ${String(lastTookMs)} ms. ` +
            'GET /api/brief, GET /api/waiting and GET /api/open-loops answer what holds now.',
        }
        return { ...held.parts, workedOut }
      }
      const fresh = await workOut(workspaceId, actor)
      keep(key, fresh)
      const workedOut: WorkedOut = {
        at: fresh.at,
        ageSeconds: 0,
        kept: false,
        tookMs: fresh.tookMs,
        says: `This was worked out for this request, at ${fresh.at}, in ${String(fresh.tookMs)} ms.`,
      }
      return { ...fresh.parts, workedOut }
    },
  )
}
