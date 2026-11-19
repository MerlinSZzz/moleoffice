// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theHoldOnNewChecks` was moved byte for byte out of src/server/lib/checks-in-merges-only.ts, with no change of behaviour.
 * `LIMITS_ARE_READ_FOR_MS` was moved byte for byte out of src/server/lib/checks-in-merges-only.ts, with no change of behaviour.
 * `theResetInWords` was moved byte for byte out of src/server/lib/checks-in-merges-only.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from '../db/client.ts'
import { A_FIVE_HOUR_LIMIT_RESETS_WITHIN_MS, theResetOfAFiveHourLimit } from '@shared/checks-in-merges-only.ts'
import { runtimeShownName } from '@shared/participants.ts'
import { momentOfAnInstant, theClockZone, stampInZone } from '@shared/time.ts'
import { theStopCauseOf } from '../../config/a-runs-stop-and-wait.mjs'
import { theSessionIdsAnywhereWhere } from './session-fields.ts'
import type { AHoldOnALogin, TheHoldOnNewChecks } from './checks-in-merges-only.ts'

/**
 * THE HOLD ON NEW CHECKS AFTER A 5-HOUR LIMIT, read from the check sessions of the last day whose stop cause is a session
 * limit, in every project: the login is machine-wide, so a limit hit by a check in one project holds checks in all.
 *
 * ONLY THE LOGIN THAT ANSWERED IS HELD. A check whose runtime is another login is not. A limit whose reset or login
 * cannot be told holds nothing, and says so while it can still matter: a guessed reset would hold checks on nothing
 * anyone read. A limit whose moment is not stored as an instant holds nothing and is not said.
 */
export function theHoldOnNewChecks(nowMs: number = Date.now()): TheHoldOnNewChecks {
  const limited = theSessionIdsAnywhereWhere((one) => one.stopCause === 'session-limit')
  const rows =
    limited.length === 0
      ? []
      : (sqlite
          .prepare(
            "SELECT id, workspace_id AS workspaceId, data FROM records WHERE id IN (SELECT value FROM json_each(?)) AND kind = 'session' " +
              "AND deleted_at IS NULL AND json_extract(data, '$.runtime') = 'inspection-tool'",
          )
          .all(JSON.stringify(limited)) as { id: string; workspaceId: string; data: string }[])
  const zone = theClockZone()
  const latest = new Map<string, Omit<AHoldOnALogin, 'says'>>()
  const untold: string[] = []
  for (const row of rows) {
    const data = JSON.parse(row.data) as Record<string, unknown>
    const cause = theStopCauseOf(data)
    if (cause === null || cause['kind'] !== 'session-limit') continue
    const said = typeof cause['said'] === 'string' ? cause['said'] : ''
    // THE MOMENT OF THE LIMIT is `at`, the instant with its offset at which the check's tool last wrote the words, read
    // by the check worker with them. Words with no offset are no moment: in the hour the clocks go back they name two.
    // A LIMIT WITH NO MOMENT holds nothing and is not said. Its record's last write is not the moment of the limit, and
    // the office does not say a limit from it.
    const atMs = typeof cause['at'] === 'string' ? momentOfAnInstant(cause['at']) : null
    if (atMs === null || nowMs - atMs > LIMITS_ARE_READ_FOR_MS) continue
    const recent = nowMs - atMs <= A_FIVE_HOUR_LIMIT_RESETS_WITHIN_MS
    const receipt = data['usageReceipt']
    const login = receipt !== null && typeof receipt === 'object' ? (receipt as Record<string, unknown>)['runtime'] : undefined
    if (typeof login !== 'string' || login === '') {
      if (recent) untold.push(`Check ${row.id} stopped on a 5-hour limit ("${said}"), but its record does not say which login ran it, so no check is held for it.`)
      continue
    }
    const reset = theResetOfAFiveHourLimit(typeof cause['resetsAt'] === 'string' ? cause['resetsAt'] : null, atMs, zone)
    if ('cannot' in reset) {
      if (recent) untold.push(`Check ${row.id} stopped on the 5-hour limit of ${runtimeShownName(login)} ("${said}"), but ${reset.cannot}, so no check is held for it.`)
      continue
    }
    const extra = data['extra']
    const checkedRun = extra !== null && typeof extra === 'object' ? (extra as Record<string, unknown>)['inspectionRun'] : undefined
    const before = latest.get(login)
    if (before === undefined || reset.until > before.until) {
      latest.set(login, { login, until: reset.until, zone: reset.zone, session: row.id, workspaceId: row.workspaceId,
        checkedRun: typeof checkedRun === 'string' ? checkedRun : null, said })
    }
  }
  const held = new Map<string, AHoldOnALogin>()
  const ended: AHoldOnALogin[] = []
  for (const one of [...latest.values()].sort((a, b) => a.login.localeCompare(b.login))) {
    const shown = runtimeShownName(one.login)
    const at = theResetInWords(one.until, one.zone)
    if (one.until > nowMs) {
      held.set(one.login, { ...one, says:
        `New checks on ${shown} are held until ${at}, because check ${one.session} stopped on the 5-hour limit of that login: "${one.said}". ` +
        'They start again by themselves at that time. A check on another login is not held.' })
    } else {
      ended.push({ ...one, says: `New checks on ${shown} were held until ${at}, and start again.` })
    }
  }
  const sentences = [...[...held.values()].map((one) => one.says), ...untold]
  return { held, ended, untold, says: sentences.length === 0 ? null : sentences.join(' ') }
}
/** How far back a limit is read. A 5-hour limit read a day ago has long reset; the secretary is told of an end within it. */
export const LIMITS_ARE_READ_FOR_MS = 24 * 3_600_000
/** A reset as a person reads it: `2026-10-16 19:10 Europe/London`. */
export function theResetInWords(until: number, zone: string): string {
  return `${stampInZone(until, zone).slice(0, 16)} ${zone}`
}
