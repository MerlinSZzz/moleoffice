// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SECRETARY IS TOLD WHEN NEW CHECKS ARE HELD FOR A 5-HOUR LIMIT, AND WHEN THEY START AGAIN (wave 13j). The holder
 * of the secretary card hears one office line when a hold starts, with the reset time, and one when it ends, because the
 * secretary of the check line keeps the checks moving. The person is told nothing: a check's limit asks nothing of them.
 *
 * The hold itself is read in lib/checks-in-merges-only.ts. This only says it. The reminders tick calls it each minute.
 *
 * THE LINES ALREADY WRITTEN ARE THE RECORD OF WHAT WAS SAID. Each carries `extra.checksHeld`, {login, until, session}, with
 * `until` as an instant. A start line is written once for each login and reset; an end line once for a reset that has a
 * start line and is no longer ahead. Nothing else is stored, so nothing can disagree with the lines.
 */
import { SYSTEM_LINES } from '@shared/groups.ts'
import { moleOffice, runtimeShownName } from '@shared/participants.ts'
import { localStamp } from '@shared/time.ts'
import { sqlite } from '../db/client.ts'
import { type AHoldOnALogin } from './checks-in-merges-only.ts'
import { theHoldOnNewChecks, theResetInWords } from './the-hold-on-new-checks.ts'
import { writeASystemLineToOne } from './groups.ts'
import { whoHoldsTheSecretaryCard } from './inspection.ts'
import type { Actor } from './records.ts'

/** How far back the earlier lines are read: a hold comes from a limit of the last day, and a day more for a clock change. */
const LINES_ARE_READ_FOR_MS = 2 * 24 * 3_600_000

/** The key of one hold: its login and its reset. */
function keyOf(login: string, until: string): string {
  return `${login}\u0000${until}`
}

/** The holds already told, by key, for the start lines and the end lines. */
function theLinesAlreadyWritten(nowMs: number): { started: Set<string>; ended: Set<string> } {
  // `+kind` KEEPS SQLITE OFF THE KIND INDEX, so it takes the recent rows by `records_updated_idx`.
  const rows = sqlite
    .prepare(
      "SELECT json_extract(data, '$.notice') AS notice, json_extract(data, '$.extra.checksHeld') AS held FROM records " +
        "WHERE +kind = 'message' AND updated_at >= ? AND deleted_at IS NULL AND json_extract(data, '$.sentBy.id') = ? " +
        "AND json_extract(data, '$.notice') IN ('checksAreHeldForALimit', 'checksGoOnAfterALimit')",
    )
    .all(localStamp(new Date(nowMs - LINES_ARE_READ_FOR_MS)), moleOffice().id) as { notice: string; held: unknown }[]
  const started = new Set<string>()
  const ended = new Set<string>()
  for (const row of rows) {
    let held: { login?: unknown; until?: unknown }
    try {
      held = typeof row.held === 'string' ? (JSON.parse(row.held) as typeof held) : {}
    } catch {
      continue
    }
    if (typeof held.login !== 'string' || typeof held.until !== 'string') continue
    ;(row.notice === 'checksAreHeldForALimit' ? started : ended).add(keyOf(held.login, held.until))
  }
  return { started, ended }
}

/**
 * TELL THE HOLDER OF THE SECRETARY CARD ONCE WHEN A HOLD STARTS AND ONCE WHEN IT ENDS. Answers what was said, one sentence
 * for each line written, and one when a line was owed and nobody holds the card.
 */
export function tellTheSecretaryOfTheHold(nowMs: number, by: Actor): string[] {
  const hold = theHoldOnNewChecks(nowMs)
  if (hold.held.size === 0 && hold.ended.length === 0) return []
  const already = theLinesAlreadyWritten(nowMs)
  const owed: { one: AHoldOnALogin; starts: boolean }[] = []
  for (const one of hold.held.values()) {
    if (!already.started.has(keyOf(one.login, new Date(one.until).toISOString()))) owed.push({ one, starts: true })
  }
  for (const one of hold.ended) {
    const key = keyOf(one.login, new Date(one.until).toISOString())
    if (already.started.has(key) && !already.ended.has(key)) owed.push({ one, starts: false })
  }
  if (owed.length === 0) return []
  const secretary = whoHoldsTheSecretaryCard()
  if (secretary === null) return [`Nobody holds the secretary card, so nobody was told that new checks are held for a 5-hour limit or start again.`]
  const said: string[] = []
  for (const { one, starts } of owed) {
    const shown = runtimeShownName(one.login)
    const until = theResetInWords(one.until, one.zone)
    const line = starts ? SYSTEM_LINES.checksAreHeldForALimit(shown, until, one.says) : SYSTEM_LINES.checksGoOnAfterALimit(shown, until)
    writeASystemLineToOne({ kind: 'agent', id: secretary.id }, one.workspaceId, line, by, one.checkedRun === null ? undefined : { run: one.checkedRun }, {
      checksHeld: { login: one.login, until: new Date(one.until).toISOString(), session: one.session },
    })
    said.push(`${secretary.handle} was told that new checks on ${shown} ${starts ? 'are held' : 'start again'} (reset ${until}).`)
  }
  return said
}
