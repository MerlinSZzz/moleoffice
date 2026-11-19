// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'
import { workspaces } from './workspaces.ts'

const existingArchive = { existingArchive: true } as const

/** A secretary's package and the person's answer, authored; only the signing-package doors write it. */
export const signingPackages = aPartTable(sqliteTable(
  'signing_packages',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
    broughtBy: text('brought_by').notNull(),
    forAgent: text('for_agent').notNull(),
    task: text('task').notNull(),
    state: text('state').notNull(),
    broughtAt: text('brought_at').notNull(),
    answeredAt: text('answered_at'),
    answeredByKind: text('answered_by_kind'),
    answeredById: text('answered_by_id'),
    outcome: text('outcome'),
    holdEndsAt: text('hold_ends_at'),
    holdEndedAt: text('hold_ended_at'),
    holdEndedHow: text('hold_ended_how'),
  },
  (t) => [index('signing_packages_state_idx').on(t.state, t.broughtAt)],
), existingArchive)
