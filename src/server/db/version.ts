// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A RECORD HOLDS, AND THE SHORT TOKEN THAT NAMES IT. A record's content hash, and the same
 * hash over a file's bytes. No database.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THESE TWO ARE IN A FILE OF THEIR OWN
 * ---------------------------------------------------------------------------------------
 *
 * `versionOf` lived in src/server/lib/records.ts, which is where it is still exported from and where
 * every caller still reads it. It had to move because a SECOND caller arrived that may not import
 * that file: `src/server/db/revision-backfill.ts`, the data migration that gives every existing
 * record its first revision.
 *
 * The reason it may not is db/migrate.ts's own rule, written out in that file's header. Importing
 * src/server/lib/records.ts imports src/server/db/client.ts, which OPENS `./data/panelx.db` the
 * moment it is imported. A migration module that did that would open the owner's real database
 * merely by being loaded, which is why migrate.ts imports its client dynamically and inside a guard.
 *
 * So the choice was: compute the hash a second time inside the migration, or move it here. A second
 * hash is this codebase's recurring defect in its most expensive form — the token would silently
 * stop matching, every compare-and-set built from a backfilled revision would refuse every write,
 * and nothing would fail until somebody tried to use one.
 *
 * THIS FILE IMPORTS NOTHING BUT `node:crypto` AND A TYPE, so anything may import it. It is not in
 * src/shared/ because the browser is bundled from there and `node:crypto` has no place in it.
 *
 * `hashOfBytes` BELOW ARRIVED WITH CRITERION R3 on 16 September 2026, when a report started carrying
 * files. It is the same sha256 and the same short token as `versionOf`, so a file's hash and a
 * record's version are the same kind of thing and there is still one hashing routine in the product.
 */

import { createHash } from 'node:crypto'
import type { PanelRecord } from '@shared/types.ts'
import type { RecordKind } from '@shared/types.ts'

/**
 * The five things a write to a record can change, and the five things a revision stores.
 *
 * THE SAME FIVE `versionOf` HASHES, in the same order, which is not a coincidence: a revision's
 * identity IS its content hash, so what is hashed and what is kept have to be the same set or the
 * token would name something other than the row it sits on.
 */
export type RecordContent = Pick<PanelRecord, 'kind' | 'title' | 'summary' | 'data' | 'deletedAt'>

/**
 * A stored row's content, normalised exactly as every reader gets it.
 *
 * THE ONE PLACE THAT SAYS AN ABSENT `data` IS `{}`. `toRecord` in lib/records.ts builds the served
 * record from this, and the revision writer and the backfill both hash what this returns — so the
 * record a caller is handed, the version it is handed with it, and the revision stored beside it are
 * all about the same object. Working that rule out separately in each of those places is how a token
 * comes to never match, which is a compare-and-set that refuses every write.
 *
 * Today `records.data` is NOT NULL with a SQL default of `{}`, so in practice nothing is ever
 * normalised here. That is why this is written down rather than left to luck: the column being NOT
 * NULL is not the same fact as every reader agreeing what an absent value would mean.
 */
export function contentOf(row: {
  kind: string
  title: string
  summary: string | null
  data: Record<string, unknown> | null
  deletedAt: string | null
}): RecordContent {
  return {
    kind: row.kind as RecordKind,
    title: row.title,
    summary: row.summary,
    data: row.data ?? {},
    deletedAt: row.deletedAt,
  }
}

/**
 * A short token naming exactly this content. Same content, same token, on any machine.
 *
 * THE DEFECT: A STALE READ IS ANSWERED 200. Two agents read one module, each rewrote `data.parts`
 * from what it read, and the second write replaced the first agent's checklist without a word:
 *
 *     item ids BEFORE: ['utc-defaults', 'panel-layouts', 'summary-comment']
 *     item ids AFTER : ['sc-1', 'sc-2', 'sc-3', 'sc-4']
 *     survived: []
 *
 * Zero survived, and the write was answered 200. That is a lost update, and parallel agents are
 * exactly what this product is for, so it is not a rare case.
 *
 * `version` is what a caller can hold to say WHICH record it read. It is a hash of everything a
 * write can change, so it moves on every write that changes anything and does not move for a write
 * that changes nothing -- the same rule the merge patch already applies to `updatedAt`.
 *
 * WHY NOT `updatedAt`. It is a wall-clock stamp to the SECOND, so two writes inside one second
 * carry the same one, and a precondition that compares them would pass a stale read and call it
 * safe. A precondition that is right most of the time is worse than none: it is trusted.
 *
 * Content and not a counter: if two writes leave the record holding what the caller read, the
 * caller's copy is not stale, and refusing it would be refusing a write that loses nothing.
 *
 * GIVE IT THE RECORD AS IT IS SERVED, never the raw database row, and the type says so. `contentOf`
 * above is what turns one into the other, and it is the only thing that should: hashing a row
 * directly would hash a different object from the one the caller was handed, and the record could
 * then never match its own version.
 *
 * `kind` IS IN THE HASH BECAUSE A PATCH CAN CHANGE IT. Until 17 August 2026 a record's kind was
 * fixed at creation, so leaving it out cost nothing. It costs something now: changing a `task` into
 * a `problem` moves no field when the task holds only fields a problem also declares, so title,
 * summary, data and deletedAt all come out identical and the token would not move. Two people would
 * then each be handed the same version by a read, one would change the kind, and the other's write
 * would be accepted against a record that is no longer the kind it read. The rule is that this is a
 * hash of everything a write can change, and `kind` is what keeps that true.
 *
 * KEY ORDER INSIDE `data` IS PART OF THE HASH, because this is a plain `JSON.stringify`. Two records
 * holding the same fields in a different order produce different tokens. That is ACCEPTABLE and it
 * is stated here because somebody will otherwise assume the opposite: a conservative token is never
 * wrongly EQUAL, which is the only direction that could let a stale write through. What follows from
 * it is that two different tokens are NOT proof that the content differs — `fieldsThatDiffer` in
 * src/shared/fielddiff.ts is what answers that question, and the revision ledger uses it rather than
 * comparing hashes.
 */
export function versionOf(record: RecordContent): string {
  const shape = JSON.stringify([record.kind, record.title, record.summary, record.data, record.deletedAt])
  return createHash('sha256').update(shape).digest('hex').slice(0, HASH_CHARS)
}

/**
 * HOW MANY CHARACTERS OF A SHA256 TOKEN THIS PRODUCT KEEPS. One number, read by both hashes here.
 *
 * It is short on purpose: the token names content for a reader and for a compare-and-set, and it is
 * never a security boundary. Stated once because `versionOf` and `hashOfBytes` below must produce
 * tokens of the SAME shape, and a second place holding `16` is how the two come apart.
 */
export const HASH_CHARS = 16

/**
 * THE SHORT SHA256 TOKEN OF SOME BYTES. Criterion R3.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE FILE BLOCK'S HASH LIVES HERE AND NOT BESIDE THE FILE STORE
 * ---------------------------------------------------------------------------------------
 *
 * This file is the only place this product hashes anything, and the reason is written above: a
 * second hash is the defect where the token silently stops matching. A file's bytes and a record's
 * content are hashed by the same function, so a reader comparing two tokens is comparing the same
 * kind of thing, and a change to the algorithm or the length happens in one place.
 *
 * IT TAKES BYTES RATHER THAN TEXT because the thing being named is a file, and text would force the
 * caller to choose an encoding first — which is a decision about the file that the file's own bytes
 * do not make. `versionOf` above hashes a string because a record's content IS JSON text.
 */
export function hashOfBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, HASH_CHARS)
}

/**
 * THE NAME A REVISION STORES IN PLACE OF A VALUE IT STORES ONCE: the whole sha256 of the value's JSON, 64 hex characters.
 *
 * NOT THE SHORT TOKEN. `versionOf` and `hashOfBytes` name content for a reader and a compare-and-set, where two values
 * that shared a token would only cost a refused write. This one is the key the value is read back by
 * (src/server/db/revision-stored-once.ts), so two values that shared it would make a revision read back with another
 * value in it. It is the same sha256, kept whole.
 */
export function partHashOf(json: string): string {
  return createHash('sha256').update(json).digest('hex')
}
