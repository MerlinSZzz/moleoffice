// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A LINK'S GATE MUST SAY: the refusals for a malformed gate, the check a link write passes,
 * the checklist item ids a gate names, and the stage a gate resolves to. They were moved out of
 * src/server/lib/records.ts with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`. This file does not import records.ts.
 */
import { and, eq, isNull, sql } from 'drizzle-orm'
import { BLOCK_KIND, blockIdsOf } from '@shared/blocks.ts'
import { GATED_LINK_TYPE } from '@shared/gated-link-type.ts'
import { named } from '@shared/named.ts'
import type { LinkType } from '@shared/types.ts'
import { kindWord } from '@shared/words.ts'
import { GATE_KINDS, gateFault, withArticle, type Gate, type GateFault, type GateStageSort } from '@shared/work.ts'
import { db } from '../../db/client.ts'
import { records } from '../../db/schema.ts'
import { isJsonObject } from '../../db/the-decision-names-this-fork.ts'
import { PanelError } from '../panel-error.ts'
import { pipelinesHolding } from './pipeline-blocks.ts'

/**
 * What THIS carrier says about each way a gate can be malformed.
 *
 * The RULE is not here. `gateFault` in shared/work.ts decides which fault a gate has. It used to be
 * split between here and a `StepNeed` shape check, and the two disagreed for months with nothing
 * failing; the second carrier is gone now, and the rule stays a declaration rather than an `if`
 * inside this function because that is what let the two be compared at all. What IS here is the
 * wording for somebody writing a LINK, which can show the request body they should have sent.
 *
 * `Record<GateFault, …>` is exhaustive, so a third fault added in work.ts does not compile until
 * this carrier has said what it tells a caller about it.
 *
 * WHY THERE ARE TWO SENTENCES HERE AND THERE USED TO BE ONE. Until 2026-08-10 the link path knew
 * only "a partial gate has to say how far", because that was the whole rule it enforced. When the
 * hard-gate half moved into `gateFault`, both carriers started REFUSING the same gates and this one
 * went on giving one reason for both — so `{"kind":"hard","upTo":"…"}` came back 400 saying "a
 * partial gate has to say how far", which is about a request the caller did not make. Agreeing on
 * the verdict and disagreeing about why is the same defect one layer in.
 */
const LINK_GATE_REFUSALS: Readonly<Record<GateFault, (gate: Gate) => string>> = {
  partial_without_upTo: () =>
    `A partial gate has to say how far: send {"gate":{"kind":"partial","upTo":"<a checklist item id, a ` +
    `pipeline step id, or a stage in words>"}}. Without \`upTo\` there is nothing to show on the blocked ` +
    `record, and a partial gate that does not say how far is a hard gate that is lying — the whole reason ` +
    `"partial" exists is that "the growth model can be built and checked without the bench, but not ` +
    `validated without it" is a different fact from "nothing can start". Send "hard" if that is what ` +
    `you meant.`,
  hard_with_upTo: (gate) =>
    `A hard gate must not say how far, and this one carries upTo ${JSON.stringify(gate.upTo)}. "hard" means ` +
    `the blocked record cannot proceed at all, so there is no stage to name and nothing would ever read the ` +
    `one written here — it would be stored and never shown. Two ways on, and only you know which you meant: ` +
    `send {"gate":{"kind":"partial","upTo":${JSON.stringify(gate.upTo)}}} if the blocked record really may ` +
    `get that far, or {"gate":{"kind":"hard"}} if it may not start at all.`,
}

/**
 * Check a gate before it is stored, and refuse rather than trim, default or warn.
 *
 * A gate that is half written is the case this exists for. It is a 400 and not a warning because
 * the record on the receiving end is drawn from this: a partial gate stored with no stage reads as
 * "blocked as far as (unstated)", which is worse than the hard gate it would otherwise have been.
 */
export function checkGate(gate: Gate, type: LinkType): void {
  if (type !== GATED_LINK_TYPE) {
    throw new PanelError(
      `Only a "${GATED_LINK_TYPE}" link may carry a gate, and this one is "${type}". A gate says how hard a ` +
        `dependency is, and "${type}" does not state a dependency. That includes the order inside a pipeline: ` +
        `one block waiting on another is a "${GATED_LINK_TYPE}" link between the two block records, which is ` +
        `the same link and the same gate as every other dependency in Mole Office.`,
    )
  }
  if (!(GATE_KINDS as readonly string[]).includes(gate.kind)) {
    throw new PanelError(
      `"${gate.kind}" is not a gate kind. Send one of: ${GATE_KINDS.join(', ')}. "hard" means the blocked ` +
        `record cannot proceed at all; "partial" means it may proceed as far as a named stage.`,
    )
  }
  const fault = gateFault(gate)
  if (fault !== null) throw new PanelError(LINK_GATE_REFUSALS[fault](gate))
}

/** The ids of a record's checklist items: `data.parts[].items[].id`, wherever a record keeps one. */
function checklistItemIdsOf(data: unknown): Set<string> {
  const ids = new Set<string>()
  if (!isJsonObject(data) || !Array.isArray(data['parts'])) return ids
  for (const part of data['parts']) {
    if (!isJsonObject(part) || !Array.isArray(part['items'])) continue
    for (const item of part['items']) {
      if (isJsonObject(item) && typeof item['id'] === 'string') ids.add(item['id'])
    }
  }
  return ids
}

/**
 * WHICH SORT OF STAGE A PARTIAL GATE NAMES, worked out when the link is written.
 *
 * The gate is on the record the link points AT, because that is the record that is held up and may
 * go only so far. `upTo` is:
 *   - `item`  when it is the id of one of that record's checklist items;
 *   - `block` when it is the id of one of that record's blocks: a block a pipeline lists, or, for a
 *             block, the block itself or a block of any pipeline that lists it;
 *   - refused when it is the id of some OTHER record, or of a checklist item on some other record in
 *             this project. That is a stale reference, not a stage in words, and storing it would
 *             make it read like one;
 *   - `words` otherwise.
 *
 * A text that looks like an id and names nothing is stored as `words`. Nothing can tell it from a
 * single word of the same length, so it is not refused, and the reader is told it is words.
 */
export function resolveGateStage(
  on: { id: string; kind: string; title: string; data: unknown; workspaceId: string },
  upTo: string,
): GateStageSort {
  if (checklistItemIdsOf(on.data).has(upTo)) return 'item'

  const blocks = new Set<string>()
  if (on.kind === 'pipeline') for (const id of blockIdsOf({ data: on.data as Record<string, unknown> })) blocks.add(id)
  if (on.kind === BLOCK_KIND) {
    blocks.add(on.id)
    for (const pipeline of pipelinesHolding(on.id)) for (const id of blockIdsOf(pipeline)) blocks.add(id)
  }
  if (blocks.has(upTo)) return 'block'

  const whatIsAllowed =
    `A partial gate stops at a checklist item of the record it holds up, at one of that record's steps, or at ` +
    `a stage named in words. Nothing was written.`
  const named = db
    .select({ id: records.id, kind: records.kind, title: records.title })
    .from(records)
    .where(eq(records.id, upTo))
    .get()
  if (named !== undefined) {
    throw new PanelError(
      `The gate's stage "${upTo}" is the id of ${withArticle(kindWord(named.kind).text)}, "${named.title}", ` +
        `which is not a step of "${on.title}", the record this gate holds up. ${whatIsAllowed}`,
    )
  }

  // A checklist item of another record. The text is looked for in the stored JSON first, so only the
  // records that could hold it are read.
  const pattern = `%${upTo.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
  const candidates = db
    .select({ id: records.id, kind: records.kind, title: records.title, data: records.data })
    .from(records)
    .where(
      and(
        eq(records.workspaceId, on.workspaceId),
        isNull(records.deletedAt),
        sql`${records.id} != ${on.id}`,
        sql`${records.data} LIKE ${pattern} ESCAPE '\\'`,
      ),
    )
    .all()
  const holder = candidates.find((row) => checklistItemIdsOf(row.data).has(upTo))
  if (holder !== undefined) {
    throw new PanelError(
      `The gate's stage "${upTo}" is the id of a checklist item on ${withArticle(kindWord(holder.kind).text)}, ` +
        `"${holder.title}" (${holder.id}), and not on "${on.title}", the record this gate holds up. ${whatIsAllowed}`,
    )
  }
  return 'words'
}
