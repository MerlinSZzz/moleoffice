// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE DISCOVERY KEEPS ITS STAMP ON A SESSION RECORD, AND TWO QUESTIONS ABOUT IT.
 * `DISCOVERY_KEY`, `discoveryFiledItInACallersName` and `holdsADiscoveryStamp` were moved byte for byte out
 * of src/server/lib/sessions.ts, with no change of behaviour, with `discoveryBagOf` and
 * `FILED_IN_A_CALLERS_NAME`, which they read. sessions.ts re-exports the three and imports all five back,
 * so the two it did not export gained the export word.
 */

import type { PanelRecord } from '@shared/types.ts'

/**
 * The key inside `data.extra` that discovery owns, and the only one it writes.
 *
 * Namespaced into ONE key rather than spread across `extra` so that a sweep can replace
 * everything it knows without any chance of standing on a note somebody left in `extra` beside
 * it. `extra` is documented in shared/kinds.ts as "anything a session needs that this kind has no
 * field for", which is exactly what a log path and a resume command are today.
 *
 * KNOWN DEBT, WRITTEN DOWN RATHER THAN HIDDEN: that same description says a field a PAGE should
 * draw belongs in KIND_SPECS instead. It is right. `logPath`, `tool`, `externalId`,
 * `resumeCommand` and `startedAt` deserve to be declared fields of the `session` kind. They are
 * still not, so `GET /api/kinds/session` — which the README tells agents to read INSTEAD of the
 * source — does not mention the log path or the resume command, and an agent filing a session by
 * hand has nowhere to put them and no way to find out they exist.
 *
 * HALF OF THIS DEBT HAS BEEN PAID, AND THE PARAGRAPH KEPT ASKING FOR IT ANYWAY. It also asked
 * for `orphaned` on SESSION_STATES. That landed: `SESSION_STATES` in src/shared/types.ts now
 * declares all six words, `orphaned` and `unknown` included. The request is removed rather than
 * left standing, because a request that has been granted reads as a gap that is still open.
 */
export const DISCOVERY_KEY = 'discovered'

/**
 * The discovery bag on a record, or null when there is nothing usable there.
 *
 * One reading for every field discovery owns, so the process fields below cannot come to be read
 * out of a different object from the conversation fields.
 */
export function discoveryBagOf(record: Pick<PanelRecord, 'data'>): Record<string, unknown> | null {
  const extra = record.data['extra']
  if (typeof extra !== 'object' || extra === null || Array.isArray(extra)) return null
  const stamp = (extra as Record<string, unknown>)[DISCOVERY_KEY]
  if (typeof stamp !== 'object' || stamp === null || Array.isArray(stamp)) return null
  return stamp as Record<string, unknown>
}

/**
 * THE KEY IN THE STAMP THAT SAYS DISCOVERY FILED THE RUN IN A CALLER'S NAME.
 *
 * Only `ensureSessionRecord` writes it, as true, in the write that files the run. The caller asked for a sweep and did
 * not name the conversation the sweep found, so the run is not the caller's own. `theAgentsWhoseOwnRunThisIs` in
 * ./the-run-a-key-holds.ts reads it from the run's first revision, which a later sweep's stamp does not change.
 */
export const FILED_IN_A_CALLERS_NAME = 'filedInACallersName'

/** Whether this data is a run's as discovery filed it in a caller's name (`FILED_IN_A_CALLERS_NAME`). */
export function discoveryFiledItInACallersName(data: Record<string, unknown>): boolean {
  return discoveryBagOf({ data })?.[FILED_IN_A_CALLERS_NAME] === true
}

/** Whether this data holds a discovery stamp at all, whole or not, in the one place discovery keeps one. */
export function holdsADiscoveryStamp(data: Record<string, unknown>): boolean {
  return discoveryBagOf({ data }) !== null
}
