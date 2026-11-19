// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PATCH A RECORD MAY BE GIVEN: THE SYMBOLS THAT MARK THE OFFICE'S OWN WRITES, AND THE CHECKLIST LINES A MODULE'S
 * DATA HOLDS. The section was moved whole out of src/server/lib/records.ts, with no change of behaviour. records.ts
 * hands the exported names on, so every caller keeps its import. The two private readers `checklistItemIds` and
 * `checklistItems`, which nothing called, were removed after the move.
 *
 * `isJsonObject` is read from the file that declares it, not from records.ts, which only hands it on. Reading it
 * through records.ts put this file in the largest runtime cycle.
 */
import type { RecordKind } from '@shared/types.ts'
import { THE_NOTEBOOK_DOOR } from '@shared/notebook.ts'
import { THE_INCIDENT_CLOSING_DOOR, THE_INCIDENT_TIMELINE_DOOR } from '@shared/incident.ts'
import { AN_EXPORT_IS_WRITTEN_BY_THE_SERVER } from './export-list-guards.ts'
import { isJsonObject } from '../../db/the-decision-names-this-fork.ts'

// ---------------------------------------------------------------------------- updating

/** Marks a write from the start-an-agent door. See `RecordPatch[THE_START_AN_AGENT_DOOR]`. */
export const THE_START_AN_AGENT_DOOR: unique symbol = Symbol('the start-an-agent door')
/** Marks the office rewriting the short words of its own line. See `RecordPatch[THE_OFFICES_OWN_LINE]`. */
export const THE_OFFICES_OWN_LINE: unique symbol = Symbol('the office rewriting its own line')
/** Marks the office folding its own old lines. See `RecordPatch[THE_OFFICE_FOLDS_ITS_LINES]`. */
export const THE_OFFICE_FOLDS_ITS_LINES: unique symbol = Symbol('the office folding its own old lines')
/** Marks the dead-letter sweep routing a letter. See `RecordPatch[THE_DEAD_LETTER_SWEEP]`. */
export const THE_DEAD_LETTER_SWEEP: unique symbol = Symbol('the dead-letter sweep')

/** What may be sent to patchRecord. `data` and `dataPatch` are alternatives, never both. */
export interface RecordPatch {
  /**
   * WHAT KIND OF THING THIS RECORD IS. Changing it is an ordinary edit, since 17 August 2026.
   *
   * An incorrect initial kind must remain correctable. Sending the
   * kind it already is changes nothing and writes nothing; the reply says so.
   *
   * It may not be sent together with `data` or `dataPatch`, and the refusal in `patchRecord` (records/patching.ts) says why.
   * Every field the new kind has no place for keeps its value under `extra`, and the reply names
   * every one that moved.
   */
  kind?: RecordKind
  title?: string
  summary?: string | null
  /** Replace `data` wholesale with this object. */
  data?: Record<string, unknown>
  /** Merge this into `data`, key by key. A null value deletes its key. See mergeData. */
  dataPatch?: Record<string, unknown>
  /**
   * THIS WRITE CAME FROM THE NOTEBOOK DOORS. Criterion N2, and nothing else may set it.
   *
   * A notebook entry says who wrote it and when. Both are written by the doors in
   * src/server/api/notebook.ts from the actor and the clock, never read from a body — the same rule
   * POST /api/records/:id/pass-the-question-on states, for the same reason: a name sent in a body is
   * a name anybody can send. So `checkTheNotebookEntries` refuses a write that touches
   * `data.entries` on a notebook unless this is set, and the four doors are the only callers that
   * set it. Without it, an agent could POST a notebook holding entries marked as the person's and
   * the next run would read its own instructions as the person's words.
   */
  [THE_NOTEBOOK_DOOR]?: true
  /**
   * THIS WRITE CAME FROM THE INCIDENT TIMELINE DOOR. Criteria I1 and I4, and nothing else may set
   * it. A timeline moment says who or what did it, what happened, when, and the record that is its
   * evidence, and its id is written by `POST /api/records/:id/timeline`, never read from a body. So
   * `checkTheIncidentTimeline` refuses a write that touches `data.timeline` on an incident unless
   * this is set, and that one route is the only caller that sets it.
   */
  [THE_INCIDENT_TIMELINE_DOOR]?: true
  /**
   * THIS WRITE CAME FROM THE INCIDENT CLOSING DOOR. Criterion I7, and nothing else may set it. See
   * `checkTheIncidentClosing`.
   */
  [THE_INCIDENT_CLOSING_DOOR]?: true
  /**
   * THIS WRITE CAME FROM THE START-AN-AGENT DOOR, `askForARunFor` in lib/worker.ts, and nothing else may
   * set it. It lets that door write `runWasAskedFor` on a message somebody else wrote, which no request
   * may do (`whatAChangeToAMessageMustCarry`). A symbol, so no request body can carry it.
   */
  [THE_START_AN_AGENT_DOOR]?: true
  /**
   * THE OFFICE REWRITING THE SHORT WORDS OF A LINE IT WROTE ITSELF, and nothing else may set it:
   * scripts/shorten-the-system-lines-written-before-m34.ts, which gives an old line of the office's the few words
   * criterion M34 asks for and keeps what it said as `saidInFull`. Nobody may change a notice from Mole Office through a
   * request; this is the office's own code, and it may change only `body` and `saidInFull`. A
   * symbol, so no request body can carry it.
   */
  [THE_OFFICES_OWN_LINE]?: true
  /**
   * THE OFFICE FOLDING AN OLD LINE OF ITS OWN UNDER A NEWER ONE, and nothing else may set it:
   * scripts/fold-the-old-dead-letter-lines.ts. It lets that write set `foldedInto` on a line Mole Office sent, and only
   * that field. It also writes no new delivery row: a line folded today is not handed to a member who joined the group
   * after it was written. A symbol, so no request body can carry it.
   */
  [THE_OFFICE_FOLDS_ITS_LINES]?: true
  /**
   * THIS WRITE CAME FROM THE DEAD-LETTER SWEEP, `sweepDeadLetters` in lib/deadletters.ts, and nothing else may
   * set it. It lets the sweep add entries to `routed` on a letter somebody else wrote, which
   * no request may do, and it may change nothing else. A symbol, so no request body can carry it.
   */
  [THE_DEAD_LETTER_SWEEP]?: true
  /**
   * "AND I MEAN TO EMPTY THE FIELDS THIS `data` DOES NOT CARRY."
   *
   * Only meaningful beside `data`, and only `true`. Without it, a `data` that would empty a field
   * the record holds is refused; see the guard in `patchRecord` for what that costs and why.
   */
  replace?: true
  /**
   * The `version` of the record this patch was written against. Optional, and refused when stale.
   *
   * This is the compare-and-set. Send the `version` that came back with the record you read, and
   * the write is applied only if nobody has changed the record since — otherwise it is refused with
   * 409 and NOTHING is written. Leave it out and the write is applied as it always was.
   *
   * It is optional because most writes cannot lose anything: a merge patch that names one key
   * cannot overwrite a key it does not name. It is worth sending whenever the patch was built from
   * a value that was READ, which is every whole-array write.
   */
  ifVersion?: string
  /**
   * SET BY `POST /api/bundles/export` AND BY NOTHING ELSE — the one write allowed to touch a
   * bundle's `exports`.
   *
   * IT IS A SYMBOL BECAUSE A REQUEST MUST NOT BE ABLE TO SET IT. `JSON.parse` never produces a
   * symbol-keyed property, so this key cannot arrive over the wire whatever a body says. See the
   * note on `AN_EXPORT_IS_WRITTEN_BY_THE_SERVER` and the guard it belongs to.
   */
  readonly [AN_EXPORT_IS_WRITTEN_BY_THE_SERVER]?: true
}

/**
 * Every checklist line a module's `data` holds, keyed by WHICH PART IT IS IN and then by its id.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE PART IS IN THE KEY, AND WHAT IT COST WHEN IT WAS NOT
 * ---------------------------------------------------------------------------------------
 *
 * The first version of this flattened every part into one id→item map, and an agent asked to break
 * the guard found four ways through it in an afternoon, all answered 200:
 *
 *   - TWO PARTS HOLDING THE SAME ITEM ID. The flat map kept the LAST one, so a rewrite of the FIRST
 *     was invisible and a stale copy put it back. That is a checklist line's content lost behind a
 *     200, which is the exact thing this guard exists to stop.
 *   - A LINE MOVED BETWEEN PARTS. Part membership was not in the key, so moving it back looked like
 *     no change at all.
 *   - A PART RENAMED. Only `items` was compared; `part.name` was not, so a stale copy reverted it.
 *   - A PART WITH NO ITEMS DROPPED. An empty part holds no ids, so dropping it dropped nothing the
 *     comparison could see.
 *
 * Keying by `part.id + '\u0000' + item.id` makes all four visible: a moved line is a removal from
 * one key and an addition at another, and a duplicated id in two parts is two keys. The part's own
 * fields ride along under a key of their own — see `checklistParts` — because a part is a heading
 * somebody wrote and losing it loses the reason the lines beneath it are grouped.
 *
 * AN EARLIER READER COLLECTED IDS AND THREW EVERY OTHER KEY AWAY, and that is exactly what let a stale write
 * through: the guard in `patchRecord` (records/patching.ts) compared the SET OF IDS before and after, so a copy read an hour ago and
 * written back unchanged passed — every id was still there — while every field the work actually
 * lives in went back to what it said an hour ago. Measured on 2026-08-12: writer A set `i2` to
 * `failed` with the note "the bracket cracked", writer B wrote back its stale six-line copy, the
 * answer was 200, and the stored line read `done` with no note. The guard was not broken. It was
 * looking at the name of the line rather than at the line.
 */
export function checklistLines(data: unknown): Map<string, Record<string, unknown>> {
  const found = new Map<string, Record<string, unknown>>()
  if (!isJsonObject(data)) return found
  const parts = data['parts']
  if (!Array.isArray(parts)) return found
  for (const [index, part] of parts.entries()) {
    if (!isJsonObject(part)) continue
    const partKey = typeof part['id'] === 'string' ? part['id'] : `#${index}`
    const items = part['items']
    if (!Array.isArray(items)) continue
    for (const item of items) {
      if (isJsonObject(item) && typeof item['id'] === 'string') found.set(`${partKey}\u0000${item['id']}`, item)
    }
  }
  return found
}

