// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

/**
 * THE MACHINES THIS OFFICE TRUSTS. Criterion P73.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THERE IS A TABLE AT ALL, AND WHAT THERE WAS BEFORE
 * ---------------------------------------------------------------------------------------
 *
 * There was no way to adjust the trusted devices or addresses in Settings or in Worlds.
 *
 * MEASURED: there was nothing to adjust. No table, no list, no setting. Which callers
 * this office let in was decided by WHICH SOCKET a request arrived on — `stampArrival` in
 * src/server/lib/http.ts writes `this machine` or `another machine` and no header sets it — and the
 * one address anybody could name was the environment variable MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES,
 * read in one place, src/config/settings.mjs. Changing it means editing a file and restarting the
 * server, which is the thing chapter 10's fourth rule forbids asking the person to do.
 *
 * SO THIS IS THE OFFICE'S ANSWER TO ONE QUESTION: which machines does it trust. The row is the
 * answer, the presses are on the world's page, and Settings shows the same rows read-only.
 *
 * ---------------------------------------------------------------------------------------
 * A ROW IS NEVER DELETED
 * ---------------------------------------------------------------------------------------
 *
 * Removing a machine writes `removed_at` and who did it. The same shape as a visitor credential
 * being ended one table up, and for the same reason: the office does not delete the evidence of who
 * it once trusted.
 *
 * ---------------------------------------------------------------------------------------
 * `how` SAYS WHERE THE ROW CAME FROM, AND ONE OF THE THREE CANNOT BE REMOVED BY A PRESS
 * ---------------------------------------------------------------------------------------
 *
 * `a press` is somebody adding one at the world's page. `a credential` is the machine a visitor
 * credential was confirmed for, added by the confirmation. `the environment` is the address
 * MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES named, written in when the server starts so that the list
 * says what the office actually opened a door for; a press cannot remove one of those, because the
 * environment decides the bind and no press here unbinds a socket. The refusal says so.
 */
export const trustedMachines = aPartTable(sqliteTable(
  'trusted_machines',
  {
    /** nanoid. */
    id: text('id').primaryKey(),
    /**
     * THE MACHINE, AS IT WAS WRITTEN: a device name, a hostname or an address. It is stored as the
     * words somebody typed and compared by `theSameMachine`, which is the one reading of "the same
     * machine" this product has.
     */
    address: text('address').notNull(),
    /** What a person wrote about this machine, or NULL because nobody said. */
    note: text('note'),
    /** `a press`, `a credential`, or `the environment`. The words are declared in TypeScript. */
    how: text('how').notNull(),
    /** The credential whose confirmation added this row, or NULL. */
    credentialId: text('credential_id'),
    /** LOCAL wall clock. */
    addedAt: text('added_at').notNull(),
    addedByKind: text('added_by_kind'),
    addedById: text('added_by_id'),
    /** LOCAL wall clock, or NULL because this machine is still trusted. */
    removedAt: text('removed_at'),
    removedByKind: text('removed_by_kind'),
    removedById: text('removed_by_id'),
    /** Why it was removed, in the words of whoever removed it. NULL exactly together with removed_at. */
    removedBecause: text('removed_because'),
  },
  (t) => [index('trusted_machines_live_idx').on(t.removedAt, t.address)],
), existingArchive)
