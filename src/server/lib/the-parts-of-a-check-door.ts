// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PARTS OF A CHECK DOOR'S TIME, ONE LINE IN THE SERVER'S LOG FOR EVERY CALL (item 2o of the requirement list).
 *
 * The prompt door, the assembly door and the verdict door (src/server/api/inspection.ts) each took hundreds of ms or
 * more on the live office, and the log said only the whole. Each door now names its parts as it runs them, and when
 * its answer has been sent one info line says how long each part took, how much of that was inside SQLite, and the
 * time outside every part: the door's own code between the parts, and writing the answer.
 *
 * A part that waits for the seal-read thread (the-seal-read-apart.ts) is timed from the ask to the answer. The server
 * answers other requests during it, so its SQLite statements are not given to it: they are the request's, and the
 * request's own line counts them (slow-requests.ts).
 *
 * A WRITE THAT FINISHES A RUN IS TIMED THE SAME WAY (./a-finish-reads-git-apart.ts): each pass of the write, and each
 * wait for its git on the seal-read thread, under `finishParts` in the line rather than `checkDoorParts`.
 *
 * A PART MAY RUN INSIDE ANOTHER PART, as a part of a pass's work runs inside the pass. It names the part directly around
 * it, and its time and statements are already in that part's, so the time outside the parts leaves it out. A line with
 * such a part lists the parts in the order they started, and says so; a line with none is said as it always was.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { aFreshCount, countedApart, type WhatARequestDidInSqlite } from './slow-requests.ts'

/**
 * One part of a door's call, as it ran. `inSqlite` is null for a part that waited on another thread. `inside` is the
 * name of the part it ran inside, and is absent for a part that ran inside none.
 */
type AThreadTiming = { asksAhead: number; gitReadMs: number; threadWaitMs: number }
export type APartOfADoor = { name: string; ms: number; inSqlite: WhatARequestDidInSqlite | null; inside?: string; thread?: AThreadTiming }

/** What a door's line holds besides its sentence, so the log can be read by a program too. */
export type ThePartsOfACall = { door: string; ms: number; outside: number; parts: APartOfADoor[] }

export interface ThePartsOfADoor {
  /** Run `work` as the part `name`, and time it with what it did inside SQLite. */
  part<T>(name: string, work: () => T): T
  /** Wait for `waiting` as the part `name`, and time the wait. */
  waited<T>(name: string, waiting: () => Promise<T>, timing?: (answer: T) => AThreadTiming): Promise<T>
}

/** What a line of parts is said under: a check door's call, or a write that finishes a run. */
export type WhatThePartsAreOf = 'checkDoorParts' | 'finishParts'

const THE_CALLS = new WeakMap<FastifyRequest, { door: string; of: WhatThePartsAreOf; began: number; parts: APartOfADoor[] }>()

/** The parts of this call of `door`, said in the log when its answer has been sent (`sayThePartsOfTheCheckDoors`). */
export function thePartsOf(request: FastifyRequest, door: string, of: WhatThePartsAreOf = 'checkDoorParts'): ThePartsOfADoor {
  const parts: APartOfADoor[] = []
  // THE PARTS RUNNING NOW, innermost last. A part is listed when it starts, so the parts around a part come before it.
  const running: string[] = []
  const listed = (name: string, inSqlite: WhatARequestDidInSqlite | null): APartOfADoor => {
    const inside = running.at(-1)
    const one: APartOfADoor = { name, ms: 0, inSqlite, ...(inside === undefined ? {} : { inside }) }
    parts.push(one)
    return one
  }
  THE_CALLS.set(request, { door, of, began: performance.now(), parts })
  return {
    part(name, work) {
      const inSqlite = aFreshCount()
      const one = listed(name, inSqlite)
      running.push(name)
      const began = performance.now()
      try {
        return countedApart(inSqlite, work)
      } finally {
        one.ms = performance.now() - began
        running.pop()
      }
    },
    async waited(name, waiting, timing) {
      const one = listed(name, null)
      const began = performance.now()
      try {
        const answer = await waiting()
        if (timing !== undefined) one.thread = timing(answer)
        return answer
      } finally {
        one.ms = performance.now() - began
      }
    },
  }
}

/** The sentence for one call. Exported so the test reads the sentence the server writes. */
export function sayThePartsOfACall(call: ThePartsOfACall, of: WhatThePartsAreOf = 'checkDoorParts'): string {
  const round = (ms: number): string => (ms < 10 ? ms.toFixed(1) : String(Math.round(ms)))
  const named = (one: APartOfADoor): string => (one.inside === undefined ? one.name : `${one.name} (inside ${one.inside})`)
  const each = call.parts.map((one) =>
    one.inSqlite === null
      ? `${named(one)} ${round(one.ms)} ms, waited on another thread while the server answered other requests${one.thread === undefined ? '' : `, asks ahead: ${String(one.thread.asksAhead)}, thread wait: ${round(one.thread.threadWaitMs)} ms, git read: ${round(one.thread.gitReadMs)} ms`}`
      : `${named(one)} ${round(one.ms)} ms, ${round(one.inSqlite.ms)} ms of it inside SQLite in ${String(one.inSqlite.statements)} statements`,
  )
  // A PART INSIDE ANOTHER ONE ends before it, so a line with one says that its parts are listed as they started.
  const order = call.parts.some((one) => one.inside !== undefined) ? 'in the order they started' : 'in the order they ran'
  return (
    (of === 'checkDoorParts' ? `the door ${call.door}` : `the write that finishes a run at ${call.door}`) +
    ` took ${round(call.ms)} ms from its ${of === 'checkDoorParts' ? "handler's" : 'timing'} start to its answer sent. ` +
    (each.length === 0 ? 'It ran none of its parts. ' : `Its parts, ${order}: ${each.join('; ')}. `) +
    `Outside them, ${round(call.outside)} ms: its own code between the parts, and writing its answer.`
  )
}

/**
 * Say the parts of every call of a check door, and of every write that finishes a run, in this app's log, at info, once
 * its answer has been sent. A call is said once, whichever of the apps that ask this its route is in.
 */
export function sayThePartsOfTheCheckDoors(app: FastifyInstance): void {
  app.addHook('onResponse', (request, _reply, done) => {
    const call = THE_CALLS.get(request)
    if (call !== undefined) {
      THE_CALLS.delete(request)
      const ms = performance.now() - call.began
      // A PART INSIDE ANOTHER ONE is in that part's time already, so only the parts inside none are taken from the whole.
      const outermost = call.parts.filter((one) => one.inside === undefined)
      const said: ThePartsOfACall = { door: call.door, ms, outside: ms - outermost.reduce((sum, one) => sum + one.ms, 0), parts: call.parts }
      request.log.info({ [call.of]: said }, sayThePartsOfACall(said, call.of))
    }
    done()
  })
}
