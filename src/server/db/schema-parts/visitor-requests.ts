// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

/**
 * ONE REQUEST MADE UNDER A CREDENTIAL, WITH WHAT WAS FOUND WHEN THE FACTS WERE COMPARED.
 *
 * ---------------------------------------------------------------------------------------
 * WHY EVERY REQUEST IS A ROW AND NOT ONLY THE MISMATCHES
 * ---------------------------------------------------------------------------------------
 *
 * The point is to count them and supervise them. Criterion P26 asks the Embassy row for how
 * many requests a visitor made, what it wrote, and how many did not match, and all three are counts
 * over these rows. A table of mismatches alone would answer the third and leave the other two to be
 * stored somewhere else, which is the ninth invariant broken to save rows.
 *
 * `mismatch` IS THE EVIDENCE AND NOT A FLAG. It is the JSON list criterion P27 asks for — each entry
 * naming the fact, what the credential was issued with, and what this request sent — because a row
 * saying only "these did not match" cannot be read a week later.
 *
 * AUTHORED. A request happened, and nothing can recreate a moment.
 */
export const visitorRequests = aPartTable(sqliteTable(
  'visitor_requests',
  {
    /** nanoid. */
    id: text('id').primaryKey(),
    /** The `visitor_credentials` row this request came under. */
    credentialId: text('credential_id').notNull(),
    /** LOCAL wall clock. */
    at: text('at').notNull(),
    method: text('method').notNull(),
    /** The route as Fastify matched it, so two writes to two records read as one route. */
    route: text('route').notNull(),
    /** The act the route declared, or NULL for a route outside the API. */
    operation: text('operation'),
    /**
     * 1 when this act writes. Read off the operation's own declaration in src/shared/ops.ts and
     * never guessed from the verb: a count of what a visitor has written that was built by looking
     * for POST would count every read that happens to be a POST, and a supervision number nobody
     * can trust is worse than none.
     */
    wrote: integer('wrote', { mode: 'boolean' }).notNull(),
    /** What the request was refused with, or NULL because it was answered. */
    refusedBecause: text('refused_because'),
    /** JSON: the facts that did not match, or NULL because they all did. Criterion P27. */
    mismatch: text('mismatch'),

    /**
     * WHETHER THIS REQUEST CAME FROM A MACHINE THE OFFICE TRUSTS. Criterion P73.
     *
     * 1 yes, 0 no, NULL because nobody could tell which machine it was — which is the answer for
     * every request that arrived on the loopback door, where the caller's address says nothing about
     * whose machine it is. Three answers and not two: `not trusted` and `nobody could tell` lead a
     * reader to do different things.
     *
     * IT REFUSES NOTHING. Whether a request from a machine the office does not trust is refused or
     * only marked is question Q2 of design/permissions/ACCEPTANCE.md section 6, which is the person's to
     * answer. This column is what lets the person see it before they answer.
     */
    fromATrustedMachine: integer('from_a_trusted_machine', { mode: 'boolean' }),
  },
  (t) => [
    index('visitor_requests_credential_idx').on(t.credentialId),
    index('visitor_requests_mismatch_idx').on(t.credentialId, t.mismatch),
  ],
), existingArchive)
