// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RULES ON A PIPELINE'S BLOCKS, IN A MODULE OF THEIR OWN.
 *
 * The checks were moved whole out of src/server/lib/records.ts with no change of behaviour: why a
 * block cannot be filed on its own, which pipelines list it, the order a write may and may not
 * leave, and the refusal of an order that drops a live block. records.ts hands the names on with
 * `export *`, so no caller changed; refuseToDropLiveBlocks stays unexported.
 *
 * This file imports records.ts for toRecord only, inside a function body, so the cycle is safe.
 */
import { BLOCK_KIND, blockIdsOf } from '@shared/blocks.ts'
import { quotedUnlessAMessage } from '@shared/message-refusal-words.ts'
import type { PanelRecord } from '@shared/types.ts'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../../db/client.ts'
import { records } from '../../db/schema.ts'
import { PanelError } from '../panel-error.ts'
import { toRecord } from '../to-record.ts'

// ============================================================================ pipeline blocks
//
// A pipeline block is a record of kind `block`, and three rules about it are enforced here rather
// than in the shape checker, because each one needs other rows in the database and shared/kinds.ts
// runs in the browser where there are none. A check that cannot really run would be a check that
// quietly passes, which is the failure this whole change was built to remove.

/**
 * Why a bare `POST /api/records {"kind":"block"}` is refused, in the words the caller gets.
 *
 * A block cannot be filed on its own, and it is the only kind that cannot. Two facts about a block
 * live on its PIPELINE and nowhere else: its position, in that pipeline's ordered `blockIds`, and
 * its title, which is qualified by the pipeline's own title so that block names need not be unique
 * across the workspace. A record filed without a pipeline would have neither, so it would be a
 * block that is in no pipeline and whose title is a name somebody else may already be using.
 *
 * REFUSED RATHER THAN GUESSED AT. The alternative is picking a pipeline for the caller, which is
 * inventing a fact about the work; there is no default pipeline and there must not be one.
 */
export function blockMustBeFiledInAPipeline(title: string): string {
  return (
    `A block belongs to a pipeline, so it cannot be filed on its own: send POST /api/records/<pipeline id>/blocks ` +
    `{"name":${JSON.stringify(title)},"state":"todo"} instead. That mints the block record, calls it ` +
    `${JSON.stringify(title)} — a block's title is its own name — and appends it to that pipeline's blockIds in one ` +
    `transaction. Where a block comes in the order lives on its pipeline and nowhere else, so a block no pipeline ` +
    `lists is drawn nowhere. GET /api/records?kind=pipeline lists the pipelines.`
  )
}

/**
 * EVERY pipeline that lists this block, in the order the rows come back. Empty when none does.
 *
 * A scan over the pipeline records, and it is deliberately not an index. `blockIds` on the pipeline
 * is the ONE statement of membership; a `pipelineId` column on the block would be a second
 * statement of the same fact with nothing making the two agree, which is exactly what `modules[]`
 * titles beside `implements` links already was. This workspace has nine pipelines.
 *
 * IT RETURNS A LIST BECAUSE THERE CAN BE MORE THAN ONE, since 6 September 2026. Before that a
 * block belonged to exactly one pipeline and `checkBlockIds` refused a second; that restriction was removed. Every
 * caller asking "is this block in any pipeline at all" reads
 * this one, so that a block in two pipelines cannot be deleted or have its kind changed by way of
 * the one the scan happened to reach second.
 */
export function pipelinesHolding(blockId: string): PanelRecord[] {
  const rows = db
    .select()
    .from(records)
    .where(and(eq(records.kind, 'pipeline'), isNull(records.deletedAt)))
    .all()
  const out: PanelRecord[] = []
  for (const row of rows) {
    const record = toRecord(row)
    if (blockIdsOf(record).includes(blockId)) out.push(record)
  }
  return out
}

/**
 * Check a pipeline's `blockIds` against the rows it names, and refuse the whole write if any is bad.
 *
 * THE THREE RULES, and each one is a defect that was measurable before blocks were records:
 *
 *   1. Every id names a live record of kind `block`. A step id nothing held used to draw no edge
 *      and report nothing; an id nothing holds now refuses the write.
 *   2. No id appears twice IN ONE PIPELINE. Two steps sharing one id was accepted with a 201 and
 *      served the attention list two rows carrying one key. This is about one pipeline's own order:
 *      two DIFFERENT pipelines each listing the same block is allowed, see below.
 *   3. NO LIVE BLOCK THIS PIPELINE ALREADY HOLDS IS LEFT OUT. The first two rules both ask about
 *      the ids that ARE in the list, so a shorter list went through unread: `PATCH` with
 *      `{"data":{"blockIds":[]}}` answered 200 and left every one of that pipeline's blocks alive
 *      and listed by nothing. The reader then calls that state broken — renaming such a block is
 *      refused with "it is not listed by any pipeline ... it means the block is drawn nowhere" —
 *      and `PUT /api/records/:id/blocks` had refused the same act all along. Restoring an earlier
 *      revision of a pipeline was the second way in, because a restore is a patch underneath.
 *
 * AND EVERY BLOCK IS OF THE PIPELINE'S OWN PROJECT, `pipelineProject`, whether the pipeline listed it
 * already or not. A pipeline's page reads only its own project's records, so a block of another
 * project is drawn there as a hole in the order. It is asked after the checks above.
 *
 * THERE USED TO BE A FOURTH: no block is listed by two pipelines. That restriction was removed on 6
 * September 2026. Several pipelines may now list
 * the same block. The refusal is gone from the loop below, with the reason it gave.
 *
 * `pipelineId` is the pipeline doing the writing. It is NULL on a create, where there is no id yet.
 *
 * A BLOCK THAT IS ALREADY DELETED IS NOT "LEFT OUT" BY RULE 3. Nor is one deliberately removed
 * by the same act: `deleting` carries it whether it is deleted or remains listed by another live
 * pipeline. `removeBlock` takes the block out of this order and deletes it in the same transaction
 * only when no other live pipeline lists it. Rule 3 would otherwise refuse the shorter order while
 * the block is still alive. Rule 1 refuses an order that names a deleted block, so together the rules
 * keep deleted blocks out of orders and prevent an order from silently dropping a live block.
 * See `patchRecord`'s `deleting` parameter for why an in-process caller may say this and a request
 * may not.
 *
 * IT WAS CALLED FROM ONE PLACE AND PUBLISHED AS THREE RULES. Measured 2026-08-12 against the live
 * server: four ids nothing answers to → 201 with `incomplete: []`; a module's id → 201; another
 * pipeline's block → 201. Only a duplicate was refused, and that by a different check. `PATCH`
 * called this and `POST` did not, so a caller copying the worked example `GET /api/kinds/pipeline`
 * serves — which lists four block ids no record holds — produced the defect and was told it had
 * succeeded. The refusal sentences below were already written; nothing called them.
 *
 * What makes one entry bad is worked out in `badEntriesOf` below, and the import and the restore of a
 * deleted pipeline use the same function, each with its own words.
 */
export function checkBlockIds(
  pipelineId: string | null,
  pipelineProject: string,
  ids: readonly string[],
  deleting: ReadonlySet<string> = new Set(),
): void {
  const [bad] = badEntriesOf(pipelineProject, ids, (id) => db.select().from(records).where(eq(records.id, id)).get())
  if (bad !== undefined) {
    const { id } = bad
    if (bad.wrong === 'twice') {
      throw new PanelError(
        `blockIds lists "${id}" twice. A block is at one position or it is nowhere; a list holding it twice has ` +
          `no order at all, and two blocks sharing an id is the defect this kind was built to make impossible.`,
      )
    }
    if (bad.wrong === 'missing') {
      throw new PanelError(
        `blockIds names "${id}", and no record has that id. A pipeline that lists a block nothing holds draws a ` +
          `hole in its own order. ` +
          (pipelineId === null
            ? `File the pipeline with {"blockIds":[]} and add each block with POST /api/records/<this pipeline's ` +
              `id>/blocks, which is the only way to file a block. The worked example under GET /api/kinds/pipeline ` +
              `lists ids nothing holds; do not copy it.`
            : `Add a block with POST /api/records/${pipelineId}/blocks rather than writing an id by hand.`),
      )
    }
    const { row } = bad
    if (bad.wrong === 'notABlock') {
      throw new PanelError(
        `blockIds names "${id}", which is a ${row.kind}${quotedUnlessAMessage(row, ' called ', '')} and not a block. A pipeline's ` +
          `blockIds holds blocks; anything else it relates to is a link.`,
      )
    }
    if (bad.wrong === 'deleted') {
      throw new PanelError(
        `blockIds names "${id}" ("${row.title}"), which was deleted on ${row.deletedAt}. Restore it with ` +
          `POST /api/records/${id}/restore first, or leave it out of the order.`,
      )
    }
    if (bad.wrong === 'elsewhere') {
      throw new PanelError(
        `blockIds names "${row.title}" (${id}), a block of the project "${row.workspaceId}", and this pipeline is in ` +
          `"${pipelineProject}". A pipeline's page reads only its own project's records, so it would draw that block as a ` +
          `hole in its order. Nothing was written. ` +
          (pipelineId === null
            ? `File the pipeline with {"blockIds":[]} and add each block with POST /api/records/<this pipeline's ` +
              `id>/blocks, or move the block into this project first with POST /api/records/${id}/workspace ` +
              `{"to":"${pipelineProject}"}.`
            : `Add a block in this project with POST /api/records/${pipelineId}/blocks, or move one of the two records ` +
              `into the other's project with POST /api/records/${id}/workspace {"to":"${pipelineProject}"} or ` +
              `POST /api/records/${pipelineId}/workspace {"to":"${row.workspaceId}"}.`) +
          ` A move sent with "dryRun":true says what else would have to come with it, and writes nothing.`,
        409,
      )
    }
    // A BLOCK ALREADY LISTED BY ANOTHER PIPELINE IS ACCEPTED. That refusal was here until 6
    // September 2026 when the restriction was removed.
    // The reason it gave was that a block's title carries its pipeline's name, so a block in two
    // pipelines would have a title that is right for one and wrong for the other. That reason had
    // stopped being true: the retitle in src/server/db/block-identity.ts ran on the owner's corpus on 26
    // August 2026 and gave every block its own name, so no live block's title names a pipeline at
    // all. The aim is the same block in more than one pipeline — a rough set of clusters in the
    // pipeline and the detailed work in the plan, one block appearing in both.
  }

  refuseToDropLiveBlocks(pipelineId, new Set(ids), deleting)
}

export type ABadEntry<Row> =
  | { id: string; wrong: 'twice' }
  | { id: string; wrong: 'missing' }
  | { id: string; wrong: 'notABlock' | 'deleted' | 'elsewhere'; row: Row }

export function badEntriesOf<Row extends { kind: string; workspaceId: string; deletedAt: string | null }>(
  pipelineProject: string,
  ids: readonly string[],
  rowOf: (id: string) => Row | undefined,
): ABadEntry<Row>[] {
  const bad: ABadEntry<Row>[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) {
      bad.push({ id, wrong: 'twice' })
      continue
    }
    seen.add(id)
    const row = rowOf(id)
    if (row === undefined) bad.push({ id, wrong: 'missing' })
    else if (row.kind !== BLOCK_KIND) bad.push({ id, wrong: 'notABlock', row })
    else if (row.deletedAt !== null) bad.push({ id, wrong: 'deleted', row })
    else if (row.workspaceId !== pipelineProject) bad.push({ id, wrong: 'elsewhere', row })
  }
  return bad
}

/** The same refusal for a whole-order write and an ordinary pipeline patch. */
export function blocksLeftOutWords(pipelineId: string, blocks: readonly { id: string; title: string }[]): string {
  const details = blocks.map((block) => {
    const others = pipelinesHolding(block.id).filter((pipeline) => pipeline.id !== pipelineId)
    const listed = others.length === 0 ? '' : ` It is also listed by ${others.map((pipeline) => JSON.stringify(pipeline.title)).join(', ')}.`
    return `${JSON.stringify(block.title)}.${listed} To remove it from this pipeline, send DELETE /api/records/${pipelineId}/blocks/${block.id}.`
  }).join(' ')
  return `blockIds leaves out ${blocks.length} of this pipeline's blocks. Send the whole order: a missing block does not say whether you meant to remove it. ${details} The last pipeline to remove a block deletes it. Nothing was written.`
}

/**
 * RULE 4: a pipeline's new order may not leave out a block that is still alive.
 *
 * Its own function because the three rules above walk the ids that ARE in the list, and this one
 * asks about the ids that are NOT — a loop over the arriving list can never see them, which is
 * exactly why the hole was there. `PUT /api/records/:id/blocks` has always refused this act and
 * says why: a list missing a block does not say whether the caller meant to remove it. Now the
 * ordinary `PATCH` door refuses it too, and so does
 * putting an earlier revision of a pipeline back, which is a patch underneath.
 *
 * A DELETED BLOCK IS NOT LEFT OUT BY THIS RULE. Rule 1 refuses an order that names a deleted
 * block, so an order that has just lost one is the state the product wants. `removeBlock` also
 * deliberately removes a live shared block while leaving it listed by another live pipeline.
 */
function refuseToDropLiveBlocks(
  pipelineId: string | null,
  arriving: ReadonlySet<string>,
  beingDeleted: ReadonlySet<string>,
): void {
  // Nothing is held yet on a create, and nothing was held by a record that was not a pipeline a
  // moment ago — a kind change into `pipeline` brings an order with it and drops nothing.
  if (pipelineId === null) return
  const holder = db.select().from(records).where(eq(records.id, pipelineId)).get()
  if (!holder || holder.kind !== 'pipeline') return

  const dropped = blockIdsOf(toRecord(holder)).filter((id) => !arriving.has(id) && !beingDeleted.has(id))
  if (dropped.length === 0) return
  // Only a live block is held: a record that is not a block deletes nothing by leaving the list.
  const live = dropped
    .map((id) => db.select().from(records).where(eq(records.id, id)).get())
    .filter((row): row is NonNullable<typeof row> => row !== undefined && row.kind === BLOCK_KIND && row.deletedAt === null)
  if (live.length === 0) return

  throw new PanelError(blocksLeftOutWords(pipelineId, live))
}
