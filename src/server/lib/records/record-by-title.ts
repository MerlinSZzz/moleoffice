// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RECORD A TITLE NAMES, and three record-door rules declared beside it: only the upgrade-notice door writes the
 * structured upgrade event, only the criticism door writes the independent mark, and why a block name may not
 * repeat. They were moved out of src/server/lib/records.ts with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`. This file does not import records.ts.
 */
import { sameJson } from '@shared/same-json.ts'
import { STABLE_UPGRADE_NOTICE_EVENT } from '@shared/stable-upgrade-notices.ts'
import { titleNamesMoreThanOne } from '@shared/title-names-more-than-one.ts'
import type { PanelRecord } from '@shared/types.ts'
import { isJsonObject } from '../../db/the-decision-names-this-fork.ts'
import { PanelError } from '../panel-error.ts'
import { recordsByTitle } from '../records-by-title.ts'

/** A synchronous field-door mark; no request can supply it. */
let writingStableUpgradeNotice = false

export function asStableUpgradeNoticeDoor<T>(write: () => T): T {
  const previous = writingStableUpgradeNotice
  writingStableUpgradeNotice = true
  try { return write() } finally { writingStableUpgradeNotice = previous }
}

function upgradeNoticeField(data: unknown): unknown {
  if (!isJsonObject(data)) return undefined
  const extra = data['extra']
  return isJsonObject(extra) ? extra[STABLE_UPGRADE_NOTICE_EVENT] : undefined
}

export function refuseAGenericUpgradeNotice(before: unknown, after: unknown): void {
  if (!writingStableUpgradeNotice && !sameJson(upgradeNoticeField(before), upgradeNoticeField(after))) {
    throw new PanelError('Only POST /api/office/upgrades/notice writes the structured upgrade event. Nothing was written.', 403)
  }
}

/**
 * THE REFUSAL BOTH RECORD DOORS GIVE the independent mark on a criticism. See
 * `theIndependentCriticismStep` on a create and the patch guard in records/patching.ts: the mark is written
 * once, by the door that files the criticism, and no ordinary create or patch may add or change it.
 */
export const ONLY_THE_CRITICISM_DOOR_WRITES_INDEPENDENT =
  'Only the criticism door writes the independent mark on a criticism. A criticism filed through the ordinary ' +
  'record door carries none. Nothing was written.'

/**
 * Why two blocks of one pipeline may not have one name, in the words both refusals use.
 *
 * THIS USED TO BE THE RULE FOR EVERY RECORD and it is not any more. It was
 * `WHY_A_TITLE_MAY_NOT_REPEAT`, "Titles are unique because typing a title is how you link to
 * something", and the owner overturned it on 16 August 2026: **ID is identity. Title is
 * presentation. Titles may repeat.** The owner met the old rule by deleting a plan line, writing it
 * again, and being refused because work with that title already existed.
 *
 * WHAT SURVIVES IS SMALLER AND IS ABOUT BLOCKS ONLY. A block does not have a title somebody typed:
 * the server builds it as `<its pipeline's title> › <its own name>`, and a pipeline is read as an
 * ordered list of those names. Two live blocks of one pipeline called the same thing are two rows
 * a reader cannot tell apart on the one page they both appear on. So a block name is still refused
 * when a LIVE record already holds the title it would build. A deleted record no longer holds one —
 * that was the half of this rule that produced the owner's defect.
 *
 * NO FULL STOP AT THE END. Both callers put one there and then start a new sentence saying what was
 * not written. The punctuation belongs to the caller.
 */
export const WHY_A_BLOCK_NAME_MAY_NOT_REPEAT =
  'A block is read as a name inside its pipeline, so two live blocks cannot answer to one name'

/**
 * The record with this exact title, DELETED ROWS INCLUDED. Read the next paragraph before changing
 * that.
 *
 * THIS IS THE ANSWER TO "DOES ANYTHING AT ALL ANSWER TO THIS NAME", live or deleted, which is a
 * different question from "which record does somebody mean". `liveRecordByTitle` answers the second
 * one and is what a caller that resolves a typed name should use. Two callers need this one:
 * `upsert` in scripts/seed.ts, which restores seeded records it finds deleted, and any caller that
 * wants to avoid minting a title something else already carries. Filtering `deletedAt` here would
 * break the seed silently — seed.ts:88 writes up the day it did exactly that, and the symptom was a
 * seed reporting nineteen records while the app could see nine.
 *
 * IT REFUSES WHEN THE TITLE NAMES MORE THAN ONE RECORD. It used to end in `.get()` and hand back
 * SQLite's first row, with no count and nothing saying there had been a choice. Now it reads
 * `recordsByTitle` and throws a 409 naming every candidate.
 *
 * SO IT IS THE WRONG FUNCTION FOR A CALLER THAT ONLY WANTS TO KNOW WHETHER A NAME IS FREE, now that
 * titles may repeat: two records of one name is an ordinary state, and such a caller would get a
 * refusal where the honest answer is "yes, twice over". `uniqueTitle` in lib/sessions.ts and
 * `refuseTakenTitle` in lib/blocks.ts both used to be here and both now count `recordsByTitle`
 * themselves.
 *
 * A caller that wants to see the candidates rather than a refusal calls `recordsByTitle` itself.
 *
 * NO DOOR CALLS IT, so it takes no reader. Its callers are scripts/seed.ts,
 * tools/demonstration-pipeline.ts and the tests; none of them answers an agent, and each needs every
 * record of the name, a message included.
 */
export function getRecordByTitle(title: string, workspaceId: string): PanelRecord | null {
  const matches = recordsByTitle(title, workspaceId)
  if (matches.length > 1) {
    throw new PanelError(
      titleNamesMoreThanOne(
        title,
        workspaceId,
        matches,
        'Ask for the one you mean by its id, which names exactly one record.',
      ),
      409,
    )
  }
  return matches[0] ?? null
}
