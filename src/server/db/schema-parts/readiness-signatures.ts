// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'
import { readinessChecklists } from './readiness-checklists.ts'

const existingArchive = { existingArchive: true } as const

/** ONE SIGNER'S SIGNATURE ON ONE READINESS CHECKLIST. Migration 0252. Withdrawn keeps the row, with `withdrawnAt` set. */
export const readinessSignatures = aPartTable(sqliteTable(
  'readiness_signatures',
  {
    /** nanoid. */
    id: text('id').primaryKey(),
    /** The checklist it was given on. */
    checklistId: text('checklist_id')
      .notNull()
      .references(() => readinessChecklists.id),
    /** `person` or `agent`, and the id in that registry: who signed. */
    signerKind: text('signer_kind').notNull(),
    signerId: text('signer_id').notNull(),
    /** The checklist's `on_what` when it was signed: what the signer agreed to. */
    onWhat: text('on_what').notNull(),
    /** LOCAL wall clock. */
    signedAt: text('signed_at').notNull(),
    /** When the signer took it back, LOCAL wall clock, or NULL while it stands. */
    withdrawnAt: text('withdrawn_at'),
  },
  (t) => [uniqueIndex('readiness_signatures_one_per_signer_idx').on(t.checklistId, t.signerKind, t.signerId)],
), existingArchive)
