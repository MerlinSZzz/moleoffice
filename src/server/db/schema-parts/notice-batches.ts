// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable, theFillGivenBy } from '../part-tables.ts'

const archive = {
  exported: true as const,
  restore: 'compared' as const,
  noProjectBecause: 'notice deliveries belong to their recipients across every project',
  fillForTheProof: theFillGivenBy('src/holder/notice-batches.ts'),
}
export const noticeBatchDeliveries = aPartTable(sqliteTable('notice_batch_deliveries', {
  deliveryId: text('delivery_id').primaryKey(),
  heldAt: text('held_at').notNull(),
  releasedTurn: text('released_turn'),
}, table=>[index('notice_batch_pending_idx').on(table.releasedTurn)]), archive)
export const noticeBatchTurns = aPartTable(sqliteTable('notice_batch_turns', {
  id: text('id').notNull(),
  recipientKind: text('recipient_kind').notNull(),
  recipientId: text('recipient_id').notNull(),
  deliveryIds: text('delivery_ids').notNull(),
  acceptedAt: text('accepted_at'),
}, table=>[primaryKey({columns:[table.id,table.recipientKind,table.recipientId]})]), archive)
