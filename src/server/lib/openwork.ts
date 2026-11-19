// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sqlite } from '../db/client.ts'
import { attentionAndItsLastChangeOnItsOwnThread } from './attention-thread.ts'
import type { ReadOnTheThread } from './attention-thread-worker.ts'
import type { OpenLoop, OpenLoops } from './openloops.ts'

/**
 * THE OPEN WORK OF A PROJECT, IN THE ATTENTION RULE'S ORDER, WITH WHY EACH ONE IS WHERE IT IS.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY IT IS A FILE OF ITS OWN
 * ---------------------------------------------------------------------------------------------
 *
 * It was written inside the closure of `GET /api/brief` and nothing else could reach it, so the
 * brief an arriving agent is handed and the copy a person pastes into a window Mole Office does not
 * run put the same open work in two different orders — the attention rule's, and last-changed
 * first. Two orders for one question, and no way to tell from either which one somebody meant.
 *
 * A copy should use the readings the fast context routes are made of, a decision says.
 * Criterion B20 of `design/bundle/ACCEPTANCE.md` is where that goes. THIS IS NOT THE BRIEF
 * MERGED INTO THE COPY: the brief is a different assembler with a different reply, criterion B17
 * says so, and `src/server/api/brief.ts` still does not import the copy's assembler. One reader is
 * shared and each writes its own answer out of it.
 *
 * ---------------------------------------------------------------------------------------------
 * MEMBERSHIP IS NOT DECIDED HERE
 * ---------------------------------------------------------------------------------------------
 *
 * `openLoopsFor` decides what is open and does its own trimming. This only reorders what that
 * reading carried, and says on what authority each place was chosen. A loop the attention rule did
 * not select keeps its place in the reading's own order and says that is what happened, because
 * *the rule did not pick this* and *the rule was not run* are different facts.
 */
export interface RankedLoop extends OpenLoop {
  /** Its place in the attention rule's order, or null when the rule did not select it. */
  rank: number | null
  /** The rule's score, or null for the same reason. */
  score: number | null
  /** Why it is ranked where it is, in one sentence. */
  ranking: string
}

/** What the attention rule did not select, said once rather than per loop. */
const NOT_SELECTED =
  'The attention rule did not select this. It selects work owed outside this project, work ' +
  'that stopped short, and work paused past its date. This is none of those, so it is listed ' +
  'in the order it was last changed.'

/**
 * THE READING THE OPEN WORK IS RANKED BY, worked out on the attention thread (problem CtH8CGBkE5Bz).
 *
 * It used to be worked out inside `rankOpenWork`, on the thread that reads requests, so every brief,
 * every where-you-stand and every copy with the open loops in it held the whole office for as long as
 * GET /api/attention did. A session's start hook timed out on where-you-stand at 16:5x on 6 October 2026.
 * Same rule, same input as before: the project, no machine sweep, every message read.
 *
 * ASK IT BEFORE READING THE OPEN LOOPS. Before, the loops and the rule were read in one step, and no
 * write could land between them. Now the office takes writes while the rule runs on its thread. Read
 * in this order, every change that lands between the two is past the reading's `lastChange`, and
 * `rankOpenWork` finds it there and says so on the loop it changed.
 */
export function theReadingOpenWorkIsRankedBy(workspaceId: string): Promise<ReadOnTheThread> {
  return attentionAndItsLastChangeOnItsOwnThread({ workspaceId, resources: [] })
}

export function rankOpenWork(loops: OpenLoops, read: ReadOnTheThread): RankedLoop[] {
  const attention = read.reading
  const place = new Map<string, { rank: number; score: number }>()
  const ranked = [...attention.visible, ...attention.remainder]
  ranked.forEach((row, index) => {
    if (row.recordId === null) return
    if (place.has(row.recordId)) return
    place.set(row.recordId, { rank: index + 1, score: row.score })
  })
  // WHAT WAS WRITTEN AFTER THE RULE RAN, by record: an empty map on an office nobody wrote to meanwhile,
  // which is the reading as it was when both were read in one step. A loop whose own record changed
  // since was ranked, or not ranked, as it was before that change, and its sentence says so. A change to
  // something else that would move its score (a link, a message about it) is not looked for here.
  //
  // THE INDEX ON THE APPEND ORDER IS NAMED. Left to choose, SQLite walked the whole change log by
  // `changes_record_idx` to save sorting the groups, and read every row to find none: 1.1 s on the made-up
  // office of the live size with the machine quiet, and 2.7 to 4.7 s of every where-you-stand at a load
  // near 30 (wave 13y round 22). Searched by the append order it reads only the rows written since, which
  // is none or a few. A database without the index refuses the statement rather than walking the log.
  const since = new Map(
    sqlite
      .prepare<[number], { recordId: string; at: string }>(
        'SELECT record_id AS recordId, MAX(at) AS at FROM changes INDEXED BY changes_append_order_idx ' +
          'WHERE append_order > ? GROUP BY record_id',
      )
      .all(read.lastChange ?? 0)
      .map((row) => [row.recordId, row.at]),
  )
  const withPlace: RankedLoop[] = loops.loops.map((loop) => {
    const found = place.get(loop.id)
    const changedAt = since.get(loop.id)
    const after =
      changedAt === undefined
        ? ''
        : ` It changed at ${changedAt}, after the attention rule was run at ${attention.at}, so this place is from before that change.`
    if (found === undefined) return { ...loop, rank: null, score: null, ranking: NOT_SELECTED + after }
    return {
      ...loop,
      rank: found.rank,
      score: found.score,
      ranking: `The attention rule puts this ${String(found.rank)} of ${String(ranked.length)}, with a score of ${String(found.score)}.${after}`,
    }
  })
  return withPlace.sort((a, b) => {
    if (a.rank !== null && b.rank !== null) return a.rank - b.rank
    if (a.rank !== null) return -1
    if (b.rank !== null) return 1
    return 0
  })
}
