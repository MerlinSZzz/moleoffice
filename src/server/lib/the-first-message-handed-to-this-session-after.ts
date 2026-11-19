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
 * Every stamp here is written by `nowStamp`, so one that will not read is a broken row. When its
 * message is a message that is not deleted, it stops the reading with the row's words rather than
 * being left out, because whether it came later cannot be told.
 */
export function theFirstMessageHandedToThisSessionAfter(sessionRecordId: string, after: Date): Date | null {
  const aliases = theFiledAliasesReadOnce(sqlite)
  let rows: { at: string; messageId: string }[]
  if (!aliases.anyFiled()) {
    rows = sqlite
      .prepare(
        'SELECT d.at AS at, d.message_id AS messageId FROM handle_holds h ' +
          "CROSS JOIN message_delivery d ON d.recipient_kind = 'agent' AND d.recipient_id = h.agent_id " +
          "WHERE h.session_record_id = ? AND h.released_at IS NULL AND d.mark <> 'queued' AND d.because = ?",
      )
      .all(sessionRecordId, theLiveSessionTookIt(sessionRecordId)) as { at: string; messageId: string }[]
  } else {
    // WITH AN ALIAS FILED, the hold's agent is read first, and then its hand-overs under every id it alone answers to,
    // through the recipient index, because a row written before the alias was filed keeps the old id.
    const holders = sqlite.prepare('SELECT h.agent_id AS agentId FROM handle_holds h WHERE h.session_record_id = ? AND h.released_at IS NULL').all(sessionRecordId) as { agentId: string }[]
    const ids = [...new Set(holders.flatMap((one) => theRegistryIdsOf(sqlite, one.agentId, aliases)))]
    rows =
      ids.length === 0
        ? []
        : (sqlite
            .prepare(`SELECT d.at AS at, d.message_id AS messageId FROM message_delivery d WHERE d.recipient_kind = 'agent' AND d.recipient_id ${isOneOf(ids)} AND d.mark <> 'queued' AND d.because = ?`)
            .all(...ids, theLiveSessionTookIt(sessionRecordId)) as { at: string; messageId: string }[])
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
