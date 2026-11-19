// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

/**
 * THE KEYS THE OFFICE HAS ISSUED, KEPT AS THEIR SHA-256 AND NEVER AS THE KEY.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS TABLE EXISTS, AND WHY THE VALUE IS NOT IN IT
 * ---------------------------------------------------------------------------------------
 *
 * An agent's key is a secret the agent holds. The office keeps only its hash, the way
 * `visitor_credentials` keeps only its token's hash, so a database copied, backed up or exported
 * carries nothing anybody can present. The person's key and the office's own key are NOT here: they
 * live in the file beside the database that `src/server/lib/keys.ts` makes at first run, because
 * they are the secrets that open this database rather than credentials issued to somebody else.
 *
 * A ROW IS NEVER DELETED. Revoking writes `revoked_at` and who said why, and the row stays, the same
 * shape `trusted_machines` and `visitor_credentials` use: the office does not delete the evidence of
 * a key it once issued.
 *
 * IT IS MEASURED, NOT AUTHORED, and that is a decision this file states rather than hides: no backup
 * and no export carries it, which is exactly what a decision asks for: a world copy, a
 * backup and an export carry no key by their nature.
 */
export const heldKeys = aPartTable(sqliteTable(
  'held_keys',
  {
    /** nanoid. */
    id: text('id').primaryKey(),
    /** `agent`, `person` or `office`. The words are declared where the key is read, in keys.ts. */
    whoseKind: text('whose_kind').notNull(),
    /** The handle, the person's name or the office's own name, as the key's owner. */
    whoseId: text('whose_id').notNull(),
    /** HEX SHA-256 of the key. The one place a key is stored, and never the key itself. */
    keyHash: text('key_hash').notNull(),
    /** LOCAL wall clock. */
    madeAt: text('made_at').notNull(),
    /** LOCAL wall clock of the last request that carried it, or NULL because it has not been used. */
    lastUsedAt: text('last_used_at'),
    /** LOCAL wall clock, or NULL because the key still works. */
    revokedAt: text('revoked_at'),
    /** Why it was revoked, in the words of whoever revoked it. NULL exactly together with revoked_at. */
    revokedBecause: text('revoked_because'),
    /**
     * HOW THE CALL THAT MADE THIS KEY WAS PROVED, one word from `HowAKeysMintWasProved` in
     * src/server/lib/provedkeys.ts. Migration 0180. NULL means nobody recorded it, which is every key
     * made before that migration, and it is read as unproved.
     */
    mintProvedBy: text('mint_proved_by'),
  },
  (t) => [uniqueIndex('held_keys_hash_idx').on(t.keyHash), index('held_keys_whose_idx').on(t.whoseKind, t.whoseId)],
), { existingMeasured: true })
