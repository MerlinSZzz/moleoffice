// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'
import { signingPackages } from './signing-packages.ts'

const existingArchive = { existingArchive: true } as const

/** One ordered known act and its receipt, authored; inputs are checked JSON and the office writes its sentences. */
export const signingPackageItems = aPartTable(sqliteTable(
  'signing_package_items',
  {
    id: text('id').primaryKey(),
    packageId: text('package_id').notNull().references(() => signingPackages.id),
    position: integer('position').notNull(),
    act: text('act').notNull(),
    inputs: text('inputs').notNull(),
    why: text('why').notNull(),
    shows: text('shows').notNull(),
    changes: text('changes').notNull(),
    undone: text('undone').notNull(),
    state: text('state').notNull(),
    outcome: text('outcome'),
    doneAt: text('done_at'),
    carriedOut: text('carried_out').notNull().default('at-the-signature'),
    carriedOutBy: text('carried_out_by'),
    carriedOutIn: text('carried_out_in'),
  },
  (t) => [uniqueIndex('signing_package_items_position_idx').on(t.packageId, t.position)],
), existingArchive)
