// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SETTING-CHANGE WRITE AND READING: the two writes that file a setting's change in the office's own change log,
 * the shape a setting's last change takes, and `theLastChangeOfASetting` that reads it. They were moved whole out of
 * src/server/lib/records.ts, with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`, and every caller still imports these names
 * from records.ts.
 *
 * THIS FILE IMPORTS records.ts FOR `logChange` AND THE `Actor` TYPE. Every reference it makes to that file is inside a
 * function body, and the type import is erased, so the cycle is safe and nothing of records.ts is read while it is
 * still being evaluated.
 */
import { and, desc, eq, sql } from 'drizzle-orm'
import { A_SETTING_ON_THE_LEDGER } from '@shared/a-setting-on-the-ledger.ts'
import { db } from '../../db/client.ts'
import { changes } from '../../db/schema.ts'
import { type Actor } from '../records.ts'
import { logChange } from '../log-change.ts'

/**
 * WRITE DOWN AN ACT A RAISE, OR THE PERSON'S QUOTED WORDS, CARRIED THAT WROTE NO RECORD. Every act done
 * under a raise is recorded as done under it. A secretary carrying the person's
 * words may set their office keys, the sandboxes' logins, their summons settings and the devices a summons tells, and the
 * office keeps the person's words with each change. A setting the office keeps outside its records (its installation row, a
 * file) has no revision to name the grant or the words, so one change row does, on `setting:<which>`, with what it was
 * and what it is now; `logChange` stores the grant or the warrant on it, and the period's page lists the acts under a
 * raise (actsUnderThePeriod). Written only when the raise or the words are what allowed the act, as every other ledger
 * row names them only then; a door calls it after the act succeeded, so nothing that failed is written down. Named for
 * the raise, the first key it wrote for.
 */
export function writeDownAnActUnderTheRaise(
  actor: Actor,
  act: { setting: string; field: string; before: unknown; after: unknown; workspaceId: string | null },
): boolean {
  const underTheRaise = actor.elevationUsed === true && actor.elevation !== undefined
  const onTheirWords = actor.warrantUsed === true && actor.warrant !== undefined
  if (!underTheRaise && !onTheirWords) return false
  logChange(`${A_SETTING_ON_THE_LEDGER}${act.setting}`, 'update', actor, act.field, act.before, act.after, act.workspaceId ?? undefined)
  return true
}

/**
 * WRITE DOWN EVERY CHANGE TO A SETTING: who changed it, from what, to what and when. A setting
 * changed on the Settings page kept only its new value. It is written in the office's own change log, on the same
 * `setting:<which>` row a raise already wrote (above), so there is one place a setting's changes are kept. The row is
 * filed under the project the press was made from, as those rows are; `theLastChangeOfASetting` reads across projects,
 * because a setting belongs to the whole office.
 *
 * A PRESS THAT CHANGED NOTHING WRITES NO ROW, unless a raise or the person's words allowed it; those acts
 * are written down every time. A door calls it after the act succeeded, so nothing that failed is written.
 *
 * Asked by the inject switch, the what-is-kept numbers and the machine names. The other settings doors still write
 * only an act under a raise.
 *
 * A NULL PROJECT IS A CHANGE NO PRESS MADE: the office's own step at start (lib/gpu-watcher.ts) changes a setting of
 * the whole office from no project, and its row says so with NULL.
 */
export function writeDownASettingChange(
  actor: Actor,
  act: { setting: string; field: string; before: unknown; after: unknown; workspaceId: string | null },
): void {
  if (JSON.stringify(act.before) === JSON.stringify(act.after)) {
    writeDownAnActUnderTheRaise(actor, act)
    return
  }
  logChange(`${A_SETTING_ON_THE_LEDGER}${act.setting}`, 'update', actor, act.field, act.before, act.after, act.workspaceId ?? undefined)
}

/** The newest recorded change to one setting, as the change log holds it. */
export interface ASettingsLastChange {
  /** The change row's id, and the order the office wrote it in: null for a row written before that order was kept. */
  id: string
  appendOrder: number | null
  /** Who changed it: the actor the change row names. */
  by: { type: string; id: string }
  /** When, LOCAL wall clock, as the change row stores it. */
  at: string
  /** What the row says was changed, in words. */
  field: string | null
  /** The value before and after, as the change row stores them: text, or JSON as text. Null when nothing was there. */
  from: string | null
  to: string | null
}

/**
 * THE NEWEST RECORDED CHANGE TO ONE SETTING, or null because the change log holds none.
 *
 * NULL IS "NOBODY RECORDED A CHANGE", NOT "IT WAS NEVER CHANGED". Before settings gained a general change log, only a change
 * made under a raise was written down, so a setting changed before then may have no row.
 */
export function theLastChangeOfASetting(setting: string): ASettingsLastChange | null {
  const row = db
    .select({
      id: changes.id,
      appendOrder: changes.appendOrder,
      actorType: changes.actorType,
      actorId: changes.actorId,
      at: changes.at,
      field: changes.field,
      oldValue: changes.oldValue,
      newValue: changes.newValue,
    })
    .from(changes)
    .where(and(eq(changes.recordId, `${A_SETTING_ON_THE_LEDGER}${setting}`), eq(changes.op, 'update')))
    .orderBy(desc(changes.at), sql`rowid desc`)
    .limit(1)
    .get()
  if (row === undefined) return null
  return { id: row.id, appendOrder: row.appendOrder, by: { type: row.actorType, id: row.actorId }, at: row.at, field: row.field, from: row.oldValue, to: row.newValue }
}
