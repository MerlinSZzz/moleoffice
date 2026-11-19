// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ROLE CARD THE OLD DOOR WROTE, PUT STRAIGHT INTO A TEST OFFICE'S DATABASE. Wave 13r round 5, item 1.
 *
 * POST /api/roles/cards wrote a `role_card` record until a decision of the owner's switched that
 * entry off. The door
 * now refuses every write. The records it wrote stay, and the Role cards page still draws them, so a test that needs
 * one writes the row itself, with the title and the data the old door wrote. Everything in it is made up.
 */
import Database from 'better-sqlite3'
import { nanoid } from 'nanoid'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

/** When every made-up card here was written. The old door wrote local wall clock. */
export const WRITTEN_AT = '2026-10-01 10:00:00'

/** One `role_card` row with the given data, in the given project. The title and summary come from the card's name and duties. Answers the record's id. */
export function aRoleCardRow<Card extends { name: string; duties: string }>(database: string, card: Card, data: Record<string, unknown>, workspace = 'default'): string {
  const db = new Database(database)
  try {
    db.pragma('busy_timeout = 5000')
    const id = nanoid(12)
    db.prepare(
      'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, origin) ' +
        "VALUES (?, ?, ?, ?, ?, 'role_card', ?, ?, ?, 'authored')",
    ).run(id, workspace, THE_TEST_OFFICES_OWNER.id, WRITTEN_AT, WRITTEN_AT, `The ${card.name} role card`, card.duties, JSON.stringify(data))
    return id
  } finally {
    db.close()
  }
}

/** A card written in Mole Office, as the old door stored it: marked `madeHere`, with the time it was written. */
export function aRoleCardTheOldDoorWrote<Card extends { name: string; duties: string }>(database: string, card: Card, portrait?: string): string {
  return aRoleCardRow(database, card, { roleName: card.name, card, madeHere: true, madeAt: WRITTEN_AT, ...(portrait === undefined ? {} : { portrait }) })
}
