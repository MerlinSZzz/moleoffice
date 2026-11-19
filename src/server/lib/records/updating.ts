// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CHANGING A RECORD IN THE COMMON FORM: `updateRecord`. It was moved whole out of src/server/lib/records.ts, with no
 * change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`, and every caller still imports this name
 * from records.ts. Nothing still in records.ts calls `updateRecord`, so records.ts imports no name from here.
 *
 * WHAT MOVED is every top-level declaration that only the update path calls, found by call graph and not by line
 * number. That is `updateRecord` alone: the one function it calls is `patchRecord`, which records/patching.ts already
 * holds. No declaration in records.ts gained the export word for the move.
 *
 * THIS FILE READS NOTHING OF records.ts AT RUN TIME. `Actor` is declared in records/actor.ts and is imported from
 * records.ts as a type only, which the compiler erases. `patchRecord` is imported from records/patching.ts directly.
 */
import type { PanelRecord } from '@shared/types.ts'
import type { Actor } from '../records.ts'
import { patchRecord } from './patching.ts'

/** Change a record. The common form: everything except what a merge patch did. */
export function updateRecord(
  id: string,
  patch: Partial<Pick<PanelRecord, 'title' | 'summary' | 'data'>> & { replace?: true },
  actor: Actor,
): PanelRecord {
  return patchRecord(id, patch, actor).record
}
