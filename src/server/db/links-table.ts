// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { ActorType } from '@shared/types.ts'
// The gate vocabulary and well-formedness predicate live in shared/work.ts. Borrowing the types
// keeps the columns from drifting without restating or enforcing the rule here. See `gate` below.
import type { GateKind, GateStageSort } from '@shared/work.ts'
import type { BaseColumns } from './schema.ts'
import type { makeRecords } from './records-table.ts'

type RecordsTable = ReturnType<typeof makeRecords>

export const makeLinks = (base: BaseColumns, records: RecordsTable) => sqliteTable(
  'links',
  {
    ...base,
    fromId: text('from_id')
      .notNull()
      .references(() => records.id),
    toId: text('to_id')
      .notNull()
      .references(() => records.id),
    /** One of LINK_TYPES. Stored in one direction only; the reverse label is shown. */
    type: text('type').notNull(),
    /** 1 when Mole Office worked this out itself rather than being told. Displayed differently. */
    inferred: integer('inferred', { mode: 'boolean' }).notNull().default(false),
    /** Who made the link. No SQL default since the migration `the_owner_comes_from_the_installer`, for the reason `ownerId` gives. */
    createdBy: text('created_by').notNull(),
    /**
     * WHETHER A PERSON, AN AGENT OR THE OFFICE MADE THIS LINK: one of ACTOR_TYPES. Migration 0193.
     *
     * `createdBy` holds an id alone, and an id does not say whether it belongs to a person or an
     * agent. `createLink` writes the actor's type here beside the id.
     *
     * NULL MEANS NOT RECORDED. Every link written before migration 0193 holds NULL, and a reader
     * says so rather than guessing from the id.
     */
    createdByType: text('created_by_type').$type<ActorType>(),
    /**
     * How hard this dependency is, when somebody has said. One of GATE_KINDS: `hard` or `partial`.
     *
     * A GATE RIDES ON THE `blocks` LINK RATHER THAN BEING A SECOND DEPENDENCY MODEL. Mole Office already
     * stores "A blocks B" as a typed link, and a gate must integrate with that instead of becoming
     * a parallel table. So the link keeps its type and gains two
     * optional columns: every query that reads `links` today goes on working, backlinks still
     * resolve, and there is no new table for anybody to forget to join.
     *
     * NULL MEANS UNQUALIFIED, NOT HARD. Every `blocks` link written before this column existed has
     * NULL here, and NULL is the honest reading of it: the author said that A blocks B and said
     * nothing at all about how much. Reading NULL as `hard` would put a word in their mouth that
     * they never wrote, and it is the expensive direction of the two — it makes work that is mostly
     * doable look completely stuck, which is the exact mistake `partial` was added to stop. Reading
     * it as `partial` is worse still, because a partial gate needs a stage and there is none. A
     * reader shows an unqualified block as an unqualified block and says so in words.
     *
     * `$type<GateKind>` narrows the TypeScript type without writing the two words down a second
     * time — GATE_KINDS in shared/work.ts stays the only list. SQLite still stores plain text.
     *
     * NOTHING IS CHECKED HERE. `gateIsWellFormed` in shared/work.ts is the check, and it belongs on
     * the write path, where a refusal can be a sentence naming what is missing. A CHECK constraint
     * would be a second statement of one rule that could drift from the first, and all it could
     * ever say is "CHECK constraint failed".
     */
    gate: text('gate').$type<GateKind>(),
    /**
     * For a partial gate: the furthest stage the blocked thing may reach, which is `Gate.upTo`.
     *
     * A checklist item id, a BLOCK RECORD's id, or a stage named in words — shared/work.ts says so
     * and this column stores whichever of the three was written.
     *
     * It said "a pipeline step id" until blocks became records, and that was free text nothing could
     * check: a gate naming a step of the WRONG pipeline resolved to nothing and was drawn as prose,
     * so a broken reference and a stage named in words looked identical. A block id names a row. The
     * column is still unchecked here for the reason below, but a reader can now tell the two apart.
     *
     * Nullable, and it means nothing unless `gate` is `partial`. Its own column rather than JSON
     * packed into `gate`, so that "what is being held at stage X" is a WHERE clause rather than a
     * scan that has to parse every row to find out.
     */
    gateUpTo: text('gate_up_to'),
    /**
     * WHICH OF THE THREE THINGS `gateUpTo` IS: `item`, `block` or `words` (GATE_STAGE_SORTS in
     * shared/work.ts). Migration 0193.
     *
     * `createLink` works it out when the link is written, against the record the gate is on, and a
     * value that names a block or a checklist item of some OTHER record is refused there. NULL on a
     * partial gate means NOT RECORDED: the link was written before migration 0193, and a reader says
     * so rather than guessing from the shape of the text. NULL when there is no stage at all.
     */
    gateUpToSort: text('gate_up_to_sort').$type<GateStageSort>(),
    /**
     * WHAT MOVES ALONG THIS EDGE, as JSON: `{out: string, in?: string}[]`, naming ports the two
     * blocks declare. NULL means NOBODY SAID WHAT MOVES, which is a real answer and is what every
     * link written before this column holds.
     *
     * LEGAL ONLY ON A `feeds` LINK WITH A BLOCK RECORD AT BOTH ENDS. That rule is not written here:
     * it is on the write path, where a refusal can be a sentence naming the port that is missing and
     * listing the ones that are declared. A CHECK constraint would be a second statement of one rule
     * that could drift from the first, and all it could ever say is "CHECK constraint failed" — the
     * same argument `gate` above makes.
     *
     * NO INDEX. `links_type_idx` already narrows a scan to the rows that can have one.
     */
    carries: text('carries'),
  },
  (t) => ({
    // The same relationship must not be stored twice.
    pairIdx: uniqueIndex('links_pair_idx').on(t.fromId, t.toId, t.type),
    fromIdx: index('links_from_idx').on(t.fromId),
    toIdx: index('links_to_idx').on(t.toId),
    typeIdx: index('links_type_idx').on(t.type),
    // No index on `gate`. Every gate is on a `blocks` link, so `typeIdx` already narrows the scan
    // to the rows that could have one, and this workspace has 22 links in total. An index nothing
    // needs still has to be written on every link create and delete.
  }),
)
