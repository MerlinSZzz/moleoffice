// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HOLDS SITTING ON THE WAITING DOOR, IN THIS PROCESS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/handles/:handle/waiting` answers at once with everything queued for an agent. This
 * module lets that same door be asked to HOLD the answer open until a delivery row is written for
 * that agent, or a cap passes. It is the second half of criterion U7 of
 * design/settings/ACCEPTANCE.md: a waiter that cannot keep an event stream open stops cycling every
 * one to five seconds and asks once per answer instead.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A REGISTRY IN MEMORY, AND WHY THAT IS SOUND
 * ---------------------------------------------------------------------------------------
 *
 * The server is ONE process: one Fastify app at src/server/index.ts:1546-1562, and the doors for
 * other machines hand their raw requests to that same app at :2063-2080. There is no cluster and no
 * fork, so a wake written in one handler reaches a hold registered by another. `tests/
 * server-wiring.test.ts` and the measurement in the report hold the one-process claim.
 *
 * A held request cannot outlive the process holding it, so writing holds down would only leave
 * rows describing somebody who is gone. Nothing here touches the database.
 *
 * ---------------------------------------------------------------------------------------
 * THE WAKE RUNS NO SQL, AND THAT IS THE WHOLE POINT
 * ---------------------------------------------------------------------------------------
 *
 * `tellTheWaitersFor` is called from `writeTheDeliveries` in src/server/lib/messages.ts inside the
 * write's transaction. better-sqlite3 is synchronous. The wake waits for that write through
 * `whenStored` in src/server/db/told-when-stored.ts. It runs once the outermost transaction commits,
 * so a write that is rolled back wakes nobody. The wake does exactly one thing: it resolves a
 * promise and returns. It runs no SQL. The woken handler does its own read afterwards. Keeping SQL
 * in the handler leaves the wake responsible only for notification.
 *
 * ---------------------------------------------------------------------------------------
 * THE COST ACCEPTED, SAID OUT LOUD
 * ---------------------------------------------------------------------------------------
 *
 * There is no second wake mechanism and there must not be one. A delivery row written by a path
 * that never reaches `writeTheDeliveries` does not wake a hold: that hold times out at its cap, and
 * the ask that follows finds the message. Late, never lost. Every delivery row in this product is
 * written by `writeTheDeliveries`; a second writer would need a second wake and the two would drift
 * apart silently, which is the defect CLAUDE.md names first.
 */

import type { ParticipantRef } from '@shared/participants.ts'
import { whenStored } from '../db/told-when-stored.ts'
import { onlyChecking } from './only-checking.ts'

/**
 * ONE REQUEST WAITING FOR A DELIVERY. The promise resolves when somebody writes a delivery row for
 * this agent; it never rejects. The handler owns the cap and the caller going away, and calls
 * `stop` in a `finally` whichever of the three won.
 */
interface Waiter {
  readonly agentId: string
  /** Resolve the promise once. A second wake of the same waiter does nothing. */
  wake(): void
}

/** Every held request, by the agent id it is waiting for. A set, because two sessions may wait. */
const held = new Map<string, Set<Waiter>>()

/** How many requests are held right now. A diagnostic for the measurement and the tests. */
export function waitersHeld(): number {
  let n = 0
  for (const set of held.values()) n += set.size
  return n
}

/**
 * WHETHER A REQUEST IS HELD FOR THIS AGENT RIGHT NOW. An open wait receives the agent's letters: a delivery row for the
 * agent wakes it, and it answers with them. The reach reads this (`whyThisAgentCannotBeReached` in lib/worker.ts), so a
 * person's send to an agent whose only receiver is an open wait is not answered as a send nothing receives.
 */
export function aWaitIsHeldFor(agentId: string): boolean {
  return (held.get(agentId)?.size ?? 0) > 0
}

/** What a handler holds while it waits. */
export interface HeldWait {
  /** Resolves when a delivery row is written for this agent. */
  readonly woken: Promise<void>
  /** Deregister. Safe to call more than once; the promise is left unresolved either way. */
  stop(): void
}

/**
 * START WAITING FOR A DELIVERY ROW FOR THIS AGENT.
 *
 * REGISTER BEFORE THE FIRST READ. A handler that read the queue first and then registered could
 * lose a delivery written in the gap: the read returned empty, the write happened before the
 * registration, and no wake would ever come. Registering first makes the two orders safe — a write
 * before the read is seen by the read, and a write after the read wakes the registration.
 */
export function registerAWaiter(agentId: string): HeldWait {
  let resolve: (() => void) | null = null
  const woken = new Promise<void>((go) => {
    resolve = go
  })
  const waiter: Waiter = {
    agentId,
    wake() {
      const go = resolve
      resolve = null
      if (go !== null) go()
    },
  }
  let set = held.get(agentId)
  if (set === undefined) {
    set = new Set()
    held.set(agentId, set)
  }
  set.add(waiter)
  let stopped = false
  return {
    woken,
    stop() {
      if (stopped) return
      stopped = true
      const where = held.get(agentId)
      if (where === undefined) return
      where.delete(waiter)
      if (where.size === 0) held.delete(agentId)
    },
  }
}

/**
 * TELL EVERY HOLD WAITING FOR ONE OF THESE RECIPIENTS THAT A DELIVERY ROW WAS WRITTEN.
 *
 * Called from `writeTheDeliveries` for the recipients whose rows were really written, so a second
 * call about a message whose rows already exist wakes nobody. Recipients that are not agents hold
 * nothing here and are skipped.
 *
 * IT RUNS NO SQL. See the header.
 */
export function tellTheWaitersFor(recipients: readonly ParticipantRef[]): void {
  // A CHECK OF A WRITE WAKES NOBODY: the delivery rows it wrote are taken back (lib/only-a-check.ts).
  if (onlyChecking()) return
  // A rolled-back write would wake a request for a delivery that is not there. For a stored write,
  // the wake comes at the same moment as before because a wake only resolves a promise.
  whenStored(() => {
    for (const who of recipients) {
      if (who.kind !== 'agent') continue
      const set = held.get(who.id)
      if (set === undefined) continue
      for (const waiter of [...set]) waiter.wake()
    }
  })
}
