// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'
import { workspaces } from './workspaces.ts'

const existingArchive = { existingArchive: true } as const

/**
 * WHO READ A CONVERSATION THEY WERE NOT PART OF, WHICH ONE, FROM WHICH SIDE, AND WHEN.
 *
 * Criterion M12 gives a person with the owner row the right to read a conversation between two
 * agents, from either side, and says the read is recorded. It was recorded on `api_calls`, which is
 * traffic and is pruned: an untraced row there is deleted after fourteen days with no summary kept,
 * and the browser sends no trace, so after a fortnight nothing said the read had happened.
 * Migration 0119 adds this table and its header carries the whole account.
 *
 * NOT THE SAME FACT AS THE `api_calls` ROW. That row says a request arrived and is deleted when the
 * traffic it belongs to stops being counted. This row says a person read a conversation and is kept.
 *
 * ONE ROW FOR EACH READER IN EACH CONVERSATION IN EACH PROJECT: the newest read, which is the
 * reader's read point, in wave 13s round 64.
 * Until then every read was a row of its own, and the table grew by about 130,000 rows a day while
 * every reader of it asked only for the newest. A newer read replaces the row, migration 0278 folded
 * the older ones away, and its unique index holds the rule. The project is part of the key because a
 * page narrowed to one project asks for the newest read in that project. Criterion M12 is met by the
 * newest row, which says who read, which conversation, from which side and when.
 */
export const conversationReads = aPartTable(sqliteTable(
  'conversation_reads',
  {
    /** nanoid, so one read can be cited. */
    id: text('id').primaryKey(),
    /** The project the conversation was read in. */
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    /** `person` or `agent`. Only a person may make this read, and the row says which kind anyway. */
    readerKind: text('reader_kind').notNull(),
    /** The reader's id in that registry. */
    readerId: text('reader_id').notNull(),
    /**
     * WHICH CONVERSATION WAS READ. Two shapes, and they cannot be confused for each other.
     *
     * The two agent ids with a tilde between them, in the order `pairKey` puts them, for a
     * conversation between two agents. Or one group's id, for a group (M11). A handle may not hold a
     * tilde and a group id is twelve characters of the nanoid alphabet, so no group id can look like
     * a pair. Migration 0119's own header says "the two agent ids" because groups did not exist when
     * it was written, and an applied migration is history and is never edited — this is the
     * correction, and it is where a reader is sent.
     */
    pair: text('pair').notNull(),
    /** The id of the agent, or the group member, whose side it was read as. */
    asSide: text('as_side').notNull(),
    /**
     * `person` or `agent`: whose id `as_side` is, written with it. NULL when it was read as neither side, and on a row
     * written before migration 0311 that its data half could not tell.
     */
    asSideKind: text('as_side_kind'),
    /** When it was read, as local wall-clock time. */
    at: text('at').notNull(),
  },
  (t) => [
    index('conversation_reads_pair_idx').on(t.workspaceId, t.pair),
    index('conversation_reads_reader_idx').on(t.readerKind, t.readerId),
    // A READER'S READ POINT IN ONE CONVERSATION, the newest of its reads of it. Migration 0210 says why.
    index('conversation_reads_newest_idx').on(t.readerKind, t.readerId, t.pair, t.at),
    // ONE ROW FOR EACH READER IN EACH CONVERSATION IN EACH PROJECT. Migration 0278 says why.
    uniqueIndex('conversation_reads_one_per_reader_idx').on(t.workspaceId, t.readerKind, t.readerId, t.pair),
  ],
), existingArchive)
