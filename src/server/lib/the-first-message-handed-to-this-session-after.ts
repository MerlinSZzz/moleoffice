// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theFirstMessageHandedToThisSessionAfter` was moved byte for byte out of src/server/lib/handles.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { parseAnyStamp } from '@shared/time.ts'
import { theLiveSessionTookIt } from '@shared/handles.ts'
import { sqlite } from '../db/client.ts'
import { isOneOf, theFiledAliasesReadOnce } from './registry-aliases/runs.ts'
import { theRegistryIdsOf } from './registry-aliases/stamps.ts'

/**
 * THE HAND-OVERS SQLITE MAY LEAVE OUT: a stamp in the exact form `nowStamp` writes, of a real date and time, earlier in
 * text than the bound. A year written with a leading zero is not vouched for, because `new Date` does not read a
 * two-digit year as written. The whole test is asked `IS NOT 1`, so a row for which any part is false or unknown is
 * kept, and no index can serve it. Both branches of the read add it, with the bound as the last value.
 */
const ONLY_THOSE_THAT_COULD_BE_LATER =
  " AND (d.at < ? AND d.at GLOB '[1-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]' AND strftime('%Y-%m-%d %H:%M:%S', d.at) = d.at) IS NOT 1"

/**
 * The bound: the UTC wall clock of `after` less 25 hours, in the stored form. When `after` names no instant, it is the
 * empty text, which no stamp sorts before, so nothing is left out.
 */
function theBoundFor(after: Date): string {
  const bound = new Date(after.getTime() - 25 * 60 * 60 * 1000)
  return Number.isNaN(bound.getTime()) ? '' : bound.toISOString().slice(0, 19).replace('T', ' ')
}

/**
 * THE FIRST MESSAGE HANDED TO THIS SESSION LATER THAN `after`, for the handle it holds now, or null when none was.
 *
 * Problem `-MLrleDe93wM`. A hand-over is the delivery row the took door writes when the session's
 * waiter takes a message: `theLiveSessionTookIt` in worker.ts writes the mark, the sentence
 * `theLiveSessionTookIt(session)` from @shared/handles.ts and the time, in one write. So the rows
 * whose sentence is that one sentence are the messages handed to this session, and `at` is when.
 *
 * THE MARK DOES NOT ESTABLISH A TRANSCRIPT TURN. The waiter marks delivered; the session's own
 * act can later mark seen. Both keep the hand-over sentence and time. lib/answering.ts asks for the
 * first hand-over later than the transcript's last write, to tell whether a turn followed it.
 *
 * ONLY THE AGENT OF THE LIVE HOLD, so the recipient index narrows the rows. A session that holds
 * nothing has been handed nothing it is still answering for, and gets null. A cross join is how
 * SQLite is told to start from the table named first. With plain joins it walked every delivery to
 * any agent and then looked for the hold: about 21 ms a read on a made-up office with 81,402
 * deliveries to agents (wave 13y round 75).
 *
 * ONLY THE ONE HAND-OVER ITS CALLER USES (wave 13y round 82). The hand-overs are read without the
 * records table. Only those later than `after` are looked up there, oldest first, until one is a
 * message that is not deleted: an earlier one that is not is passed over, and the next is the answer.
 * Looking every hand-over up took most of a read on a made-up office with 18,552 hand-overs to one
 * session, while the reading uses one. Times are compared as instants, never as stamp text: on the
 * day the clocks go back, a local hour comes twice, and its stamps do not sort by when they were
 * written.
 *
 * SQLITE HANDS BACK ONLY THE HAND-OVERS THAT COULD BE LATER, AND EVERY ONE WHOSE STAMP IT CANNOT
 * VOUCH FOR. It leaves a hand-over out only when its stamp is in the exact form `nowStamp` writes,
 * names a real date and time, and sorts as text before the bound: the UTC wall clock of `after`,
 * less 25 hours. Such a stamp reads, in any zone, as its own wall clock less one of that zone's
 * offsets from UTC. On the hour that is skipped it is the offset from before the change, and on the
 * hour that comes twice it is the first pass. No zone has ever been 25 hours behind UTC, so that
 * instant is earlier than `after`, and the rule below would pass the hand-over over. The margin is
 * the same in every zone, so the bound does not depend on the zone the server runs in. Every other
 * stamp is handed back and read as before. The test is written so that no index can serve it, so
 * the plan stays on the recipient index.
 *
 * Every stamp here is written by `nowStamp`, so one that will not read is a broken row. When its
 * message is a message that is not deleted, it stops the reading with the row's words rather than
 * being left out, because whether it came later cannot be told. The bound never leaves such a row
 * out, because a stamp it vouches for always reads. It only takes rows out of the walk, so the first
 * such row is the one it was before.
 */
export function theFirstMessageHandedToThisSessionAfter(sessionRecordId: string, after: Date): Date | null {
  const aliases = theFiledAliasesReadOnce(sqlite)
  const bound = theBoundFor(after)
  let rows: { at: string; messageId: string }[]
  if (!aliases.anyFiled()) {
    rows = sqlite
      .prepare(
        'SELECT d.at AS at, d.message_id AS messageId FROM handle_holds h ' +
          "CROSS JOIN message_delivery d ON d.recipient_kind = 'agent' AND d.recipient_id = h.agent_id " +
          "WHERE h.session_record_id = ? AND h.released_at IS NULL AND d.mark <> 'queued' AND d.because = ?" +
          ONLY_THOSE_THAT_COULD_BE_LATER,
      )
      .all(sessionRecordId, theLiveSessionTookIt(sessionRecordId), bound) as { at: string; messageId: string }[]
  } else {
    // WITH AN ALIAS FILED, the hold's agent is read first, and then its hand-overs under every id it alone answers to,
    // through the recipient index, because a row written before the alias was filed keeps the old id.
    const holders = sqlite.prepare('SELECT h.agent_id AS agentId FROM handle_holds h WHERE h.session_record_id = ? AND h.released_at IS NULL').all(sessionRecordId) as { agentId: string }[]
    const ids = [...new Set(holders.flatMap((one) => theRegistryIdsOf(sqlite, one.agentId, aliases)))]
    rows =
      ids.length === 0
        ? []
        : (sqlite
            .prepare(`SELECT d.at AS at, d.message_id AS messageId FROM message_delivery d WHERE d.recipient_kind = 'agent' AND d.recipient_id ${isOneOf(ids)} AND d.mark <> 'queued' AND d.because = ?${ONLY_THOSE_THAT_COULD_BE_LATER}`)
            .all(...ids, theLiveSessionTookIt(sessionRecordId), bound) as { at: string; messageId: string }[])
  }
  const aLiveMessage = sqlite.prepare("SELECT 1 AS found FROM records WHERE id = ? AND kind = 'message' AND deleted_at IS NULL")
  const isALiveMessage = (messageId: string): boolean => aLiveMessage.get(messageId) !== undefined
  const later: { at: Date; messageId: string }[] = []
  for (const row of rows) {
    const when = parseAnyStamp(row.at)
    if (when === null) {
      if (!isALiveMessage(row.messageId)) continue
      throw new Error(
        `The delivery of message ${row.messageId} to the session filed as record ${sessionRecordId} carries the time ` +
          `"${row.at}", which cannot be read, so whether that session read it cannot be worked out.`,
      )
    }
    if (when.getTime() > after.getTime()) later.push({ at: when, messageId: row.messageId })
  }
  later.sort((a, b) => a.at.getTime() - b.at.getTime())
  return later.find((one) => isALiveMessage(one.messageId))?.at ?? null
}
