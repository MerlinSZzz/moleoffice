// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RUN BEFORE THIS ONE, for the caller that is asking.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Criterion P36 of `design/permissions/ACCEPTANCE.md`: an agent that arrives later is told what has
 * already been decided about the project. To do that, the
 * brief has to know when this caller was last here, and nothing knew.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT TIES A RUN TO A CALLER, MEASURED RATHER THAN ASSUMED
 * ---------------------------------------------------------------------------------------
 *
 * There are three candidates and only one of them is populated. Measured on a copy of the owner's corpus on
 * 7 September 2026, over 1,076 `session` records:
 *
 *   - `data.ranAs` names the durable agent for its own project on **2** of them.
 *   - `data.servingAgent` is set on **10** — the message worker writes it, and nothing else does.
 *   - the run's own **create row in the change log** names the actor that filed it on all of them,
 *     because every write is attributed. `claude-code/builder-au` filed 27 of them, `claude-code` 72.
 *
 * So the tie read here is the change log: THE RUNS FILED UNDER THE NAME YOU ARE WRITING UNDER. That
 * is a narrower claim than "the runs of this agent" and it is the one the data supports, so it is
 * the sentence the reply says out loud. A bare `claude-code` shares its name with every other run
 * that wrote under it, and the reply names the run it found so a reader can check rather than trust.
 *
 * ---------------------------------------------------------------------------------------
 * THIS RUN IS EXCLUDED BY ITS OWN ID, AND NEVER BY A GUESS ABOUT TIME
 * ---------------------------------------------------------------------------------------
 *
 * The caller's own run is almost always the newest one under its name, because a hook files it
 * before the caller asks anything. Excluding it by "the newest one is probably you" would answer
 * every first run with a boundary of its own start and report nothing new for ever. So it is
 * excluded by the id the caller sent in `x-mole-office-session`, and a caller that sent none is told
 * that it did not, rather than being given a boundary nothing stands behind.
 */

import { and, eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.ts'
import { changes, records } from '../db/schema.ts'
import type { Actor } from './records.ts'

/** What was found out about the caller's previous run, and why nothing was where nothing was. */
export interface TheRunBefore {
  /** The run the caller said it is, as it sent it. Null when it sent none. */
  youSaidYouAre: string | null
  /** The newest earlier run filed under the caller's name, or null. */
  before: { id: string; title: string; openedAt: string } | null
  /**
   * Why `before` is null, in one sentence, or null when it is not.
   *
   * A real answer either way: *nothing has run under this name before* and *you did not say which
   * run you are* are different facts and lead to different fixes.
   */
  because: string | null
}

/**
 * The name a caller is writing under, or null for a request that named nobody.
 *
 * `stated: false` is the one thing that means *this request sent no attribution at all*: where `actorFrom`
 * answers such a request at all, it answers it as the person. The decision says where it does.
 * The name on it is a default rather than something anybody said, and a default is not a name whose
 * runs can be looked up.
 */
function theNameItWritesUnder(actor: Actor): string | null {
  if (actor.stated === false) return null
  const id = actor.id.trim()
  return id === '' ? null : id
}

/**
 * The newest run filed under this caller's name before the run it says it is.
 *
 * Reads `session` records joined to their own create row in the change log. A record has exactly one
 * create row, so the join cannot multiply the rows.
 */
export function theRunBeforeThisOne(input: { workspaceId: string; actor: Actor }): TheRunBefore {
  const name = theNameItWritesUnder(input.actor)
  const thisRun = typeof input.actor.sessionId === 'string' && input.actor.sessionId !== '' ? input.actor.sessionId : null

  if (name === null) {
    return {
      youSaidYouAre: thisRun,
      before: null,
      because:
        'This request named no actor, so nothing here knows whose runs to look for. Send ' +
        'x-mole-office-actor-type and x-mole-office-actor-id, and x-mole-office-session naming your own run.',
    }
  }
  if (thisRun === null) {
    return {
      youSaidYouAre: null,
      before: null,
      because:
        `This request did not say which run it is, so this cannot tell your last run from the one you are in ` +
        `now. Send x-mole-office-session with your own session record's id, and this will answer what was ` +
        `decided since the run before it.`,
    }
  }

  const rows = db
    .select({ id: records.id, title: records.title, openedAt: records.createdAt })
    .from(records)
    .innerJoin(changes, eq(changes.recordId, records.id))
    .where(
      and(
        eq(records.kind, 'session'),
        eq(records.workspaceId, input.workspaceId),
        isNull(records.deletedAt),
        eq(changes.op, 'create'),
        eq(changes.actorType, input.actor.type),
        eq(changes.actorId, name),
      ),
    )
    .all()

  // NEWEST FIRST, AND THE ID BREAKS A TIE. Stamps are wall-clock to the second, so two runs filed in
  // the same second would otherwise come back in whatever order the store gave and "the run before"
  // would mean a different run on each read.
  const mine = rows
    .filter((one) => one.id !== thisRun)
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt) || b.id.localeCompare(a.id))

  const before = mine[0] ?? null
  if (before === undefined || before === null) {
    return {
      youSaidYouAre: thisRun,
      before: null,
      because: `Nothing has run under the name "${name}" before this run, so there is no earlier run to measure from.`,
    }
  }
  return { youSaidYouAre: thisRun, before, because: null }
}
