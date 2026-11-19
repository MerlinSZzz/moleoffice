// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TWO HUMAN PROJECTIONS: WHO IS WORKING ON WHAT, AND WHAT HAS BEEN SAID.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE TWO ARE IN ONE FILE
 * ---------------------------------------------------------------------------------------
 *
 * They are the two surfaces the owner's brief asks for in sections 21 and 22, they are both
 * read-only projections over stores other files own, and neither has a write of any kind. Keeping
 * them together is what makes the shared rule visible in one place: **an empty answer here says
 * which kind of empty it is**, and both replies carry the same three words for it.
 *
 * ---------------------------------------------------------------------------------------
 * NEITHER ROUTE STARTS ANYTHING, WAKES ANYBODY, OR WRITES A ROW
 * ---------------------------------------------------------------------------------------
 *
 * There is no `POST` in this file. Reading who is working does not attach anybody, does not open a
 * period of participation and does not touch a process. Both handlers are a `SELECT` and some
 * arithmetic.
 *
 * ---------------------------------------------------------------------------------------
 * `GET /api/working` NEVER FAILS BECAUSE THE WORK-STATE TABLE IS ABSENT
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/agents/:id/work-state` answers 503 when the transitions table is not on this database,
 * and that is right for a caller asking about one agent: the honest answer to *what did this agent
 * say* is *this cannot be answered yet*. A roster is a different question. One missing table would
 * take the whole page down and tell the owner nothing about the agents, the domains or the
 * overlaps, all of which are readable. So the roster asks the store once, draws every row it can,
 * and puts the absence on the reply in words. **That is not the refusal being swallowed.** The
 * refusal is reproduced on every row, as `workState.answer: 'reader-not-built'` with its own
 * sentence, and again once at the top of the reply.
 */

import type { FastifyInstance } from 'fastify'

import { z } from 'zod'
import { whatHasBeenSaid, type WhatHasBeenSaid } from '../lib/communication.ts'
import { parse } from '../lib/parse.ts'
import { route } from '../lib/route.ts'
import {
  theDoingLinesHomeDraws,
  theRosterHomeDraws,
  unregisteredSeen,
  whoIsWorking,
  type HomeDoing,
  type HomeRoster,
  type UnregisteredSeen,
  type WhoIsWorking,
} from '../lib/working.ts'
import { AGENT_ID_SHAPE, DOING_ASKED_AT_ONCE } from '@shared/working.ts'
import { workspaceOf } from '../lib/workspaces.ts'

const WORKING_NOTE =
  'WHO IS WORKING ON WHAT, right now, in this project. One row per durable agent that may still be given work, ' +
  'carrying two readings that are never derived from each other: what the agent said it is doing (its work state) ' +
  'and whether it can be reached (its presence). Beside them: its own sentence about what it is doing, every open ' +
  'work domain it owns, what those domains say they will write, whose open work they overlap, how many of those ' +
  'overlaps are two agents writing one thing, when one of its runs last wrote anything, and the run serving it now. ' +
  'NOTHING HERE IS STORED. There is no roster table, no cached work state and no presence column; every number is ' +
  'derived at read from rows that already exist, so this cannot go stale and cannot disagree with the records it is ' +
  'drawn from. IT STARTS NOTHING AND WAKES NOBODY. An empty answer says WHICH kind of empty it is: `absences` ' +
  'carries one entry per missing thing with `answer` reading "nothing-recorded" — the store was read and holds none ' +
  '— or "reader-not-built" — nobody looked, because there is nothing to look with. Those are different facts and ' +
  'this route refuses to draw them as one.'

const SAID_NOTE =
  'WHAT HAS BEEN SAID, in three directions: you to an agent, an agent to you, and one agent to another. `summary` ' +
  'comes first and is about things a person recognises — comments written, comments that have gone nowhere, ' +
  'reviews, conversations, and the runs a dispatch made. `directions` is underneath it, and every direction carries ' +
  'HOW FAR IT ACTUALLY GETS beside its counts: "completes" means something has gone the whole way at least once, ' +
  '"stops-short" means the way is built and nothing has ever arrived, and "no-door" means nothing on any screen ' +
  'starts one. A count without that word misleads, because a zero for a direction nobody can use reads the same as ' +
  'a zero for a direction that works and nobody wanted. States are the four that are useful to a person — queued, ' +
  'waiting, handled, failed — plus what cannot be sent because nobody was chosen, and what an agent wrote for you ' +
  'and you have not read. NO MESSAGE BODY IS ON THIS REPLY. It counts; the conversation page is where words are ' +
  'read.'

/**
 * THE TWO OPTIONS THIS ROUTE TAKES, and the only value each accepts. `only=unregistered` answers the
 * narrowed reading the front page draws — see `unregisteredSeen` for the measurement and why. An
 * unknown value is refused rather than ignored, so a typo cannot quietly return the whole roster.
 *
 * `shape=home` answers the roster with the fields Home's Agents at work draws — see
 * `theRosterHomeDraws` for the measurement. Asking for both is refused: they are two different
 * readings, and answering one of them would be answering a question nobody asked. The two are two
 * shapes of the query, so a query asking for both fits neither and is refused with the query's own
 * sentence, as an unknown value is.
 *
 * `shape=home&doing=<id>,<id>` answers what the runs serving those agents say they are doing, and nothing
 * else: a group Home opens asks it for its own agents (round 31b of wave 13k; `theDoingLinesHomeDraws`).
 * It is a part of Home's shape and is asked under the same route, project and reader rules as the roster.
 * The ids are agent record ids, comma-separated, each of `AGENT_ID_SHAPE`, at least one and at most
 * `DOING_ASKED_AT_ONCE`; a list that breaks any of these is refused with the query's own sentence.
 */
const DOING_IDS = z
  .string()
  .transform((list) => list.split(','))
  .pipe(z.array(z.string().regex(AGENT_ID_SHAPE)).min(1).max(DOING_ASKED_AT_ONCE))
const WORKING_QUERY = z.union([
  z.strictObject({ only: z.enum(['unregistered']).optional() }),
  z.strictObject({ shape: z.enum(['home']), doing: DOING_IDS.optional() }),
])

export async function workingRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/working',
    route('project.who-is-working', 'remote', WORKING_NOTE),
    async (req): Promise<WhoIsWorking | UnregisteredSeen | HomeRoster | HomeDoing> => {
      // THE NARROWED FORM THE FRONT PAGE ASKS FOR. The roster reads presence and progress for every
      // active agent, and the front page draws only the unregistered list. See `unregisteredSeen` in
      // the library for the measurement that made it.
      const asked = parse(WORKING_QUERY, req.query, 'That is not a reading of who is working:')
      // THE REQUESTS ASKED WITH THIS ONE START FIRST. Agents at work asks this door, the shell's attention and the review
      // bar's marks in one moment, and the reading below keeps the thread for most of a second at the live size. On the
      // made-up office of 4 November 2026 the marks waited 541 ms behind it, and took 2 ms with this line. A request that
      // arrives while the reading runs still waits for it.
      await new Promise<void>((resolve) => setImmediate(resolve))
      if ('shape' in asked) {
        return asked.doing === undefined ? theRosterHomeDraws(workspaceOf(req)) : theDoingLinesHomeDraws(workspaceOf(req), [...new Set(asked.doing)])
      }
      if (asked.only === 'unregistered') return unregisteredSeen(workspaceOf(req))
      return whoIsWorking(workspaceOf(req))
    },
  )

  app.get(
    '/communication',
    route('project.what-has-been-said', 'remote', SAID_NOTE),
    async (req): Promise<WhatHasBeenSaid> => {
      return whatHasBeenSaid(workspaceOf(req))
    },
  )
}
