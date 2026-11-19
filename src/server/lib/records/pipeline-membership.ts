// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH PIPELINE A BLOCK IS IN: `pipelineTitlesByBlock`, the one-scan reading of every block's pipeline title, and
 * `pipelineHolding`, the one pipeline that lists a block or null when none does. They were moved whole out of
 * src/server/lib/records.ts, with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`, and every caller still imports these names
 * from records.ts.
 *
 * THIS FILE DOES NOT IMPORT records.ts. It takes `pipelinesHolding` from ./pipeline-blocks.ts and `toRecord` from
 * ../to-record.ts.
 */
import { and, eq, isNull } from 'drizzle-orm'
import { blockIdsOf } from '@shared/blocks.ts'
import type { PanelRecord } from '@shared/types.ts'
import { db } from '../../db/client.ts'
import { records } from '../../db/schema.ts'
import { pipelinesHolding } from './pipeline-blocks.ts'
import { toRecord } from '../to-record.ts'

/**
 * WHICH PIPELINE EACH OF THESE BLOCKS IS IN, by that pipeline's title, in one scan.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A QUERY NOW AND USED TO BE A STRING SPLIT
 * ---------------------------------------------------------------------------------------
 *
 * A block's title used to be `<its pipeline's title> › <its own name>`, so every surface that wanted
 * to say WHICH PIPELINE a step is in read it off the front of the title. Since 6 September 2026, a block's title
 * is its own name. The fact did not go anywhere —
 * a pipeline's `blockIds` is where it always really lived — so the readers ask for it here instead
 * of cutting it out of a string.
 *
 * ONE SCAN FOR A WHOLE PAGE. `pipelinesHolding` walks every live pipeline per block, which is fine
 * for one refusal and wrong for a plan drawing forty cards. Both callers hand over every id they
 * are about to draw.
 *
 * THE FIRST PIPELINE THAT LISTS IT, and several may. Saying one of them on a card is what the card
 * has room for; a caller that needs all of them asks `pipelinesHolding` and names them.
 */
export function pipelineTitlesByBlock(blockIds: Iterable<string>): Map<string, string> {
  const wanted = new Set(blockIds)
  const found = new Map<string, string>()
  if (wanted.size === 0) return found
  const rows = db
    .select()
    .from(records)
    .where(and(eq(records.kind, 'pipeline'), isNull(records.deletedAt)))
    .all()
  for (const row of rows) {
    for (const id of blockIdsOf(toRecord(row))) {
      if (wanted.has(id) && !found.has(id)) found.set(id, row.title)
    }
  }
  return found
}

/**
 * ONE pipeline that lists this block, or null when none does — the first the scan meets.
 *
 * IT IS NOT "THE" PIPELINE ANY MORE, and every caller has to be able to say why one of several is
 * good enough for it. Where the question is "is it held at all", ask `pipelinesHolding` in records/pipeline-blocks.ts and
 * name all of them: a refusal that names one of two pipelines sends the reader to the wrong record.
 */
export function pipelineHolding(blockId: string): PanelRecord | null {
  return pipelinesHolding(blockId)[0] ?? null
}
