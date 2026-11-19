// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

/**
 * THE OFFICE: EVERY WORLD THIS INSTALLATION HAS EVER HAD, WITH ITS BIRTH AND ITS DEATH.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion C2 of design/messages/ACCEPTANCE.md section 8: a bridge was missing, like a foreign
 * office in real life. A place that answers "which worlds
 * are there", where a trip is registered, and which records a world appearing and disappearing.
 *
 * ONE TABLE, IN THE MAIN WORLD. The table is created in every database, because there is one schema
 * and one migration folder; what makes a database the office is that its file is the one the
 * declaration calls canonical. `thisIsTheMainWorld()` in src/server/lib/office.ts is the one place
 * that decides, and a world that is not the main one writes no row here — it registers at the main
 * world over HTTP, and reads the mirror when the main world does not answer.
 *
 * ---------------------------------------------------------------------------------------
 * A WORLD IS A DATABASE, AND THAT IS WHY THE UNIQUE INDEX IS WHAT IT IS
 * ---------------------------------------------------------------------------------------
 *
 * The identity of a world is the identity of the database it answers from. So there is at most one
 * LIVE row per database identity: a second server started against the same database is the same
 * world answering twice, not a second world, and registering finds the row that is already there.
 * A world that has died and is started again gets a new row, so the office keeps the whole history
 * of appearances and disappearances.
 *
 * ---------------------------------------------------------------------------------------
 * WHY `address` IS NOT THE IDENTITY
 * ---------------------------------------------------------------------------------------
 *
 * A port is handed back to the machine when a process ends, and the next thing to take it is not the
 * same world. The address is kept because it is how somebody reaches a world that is alive now; it
 * is never what a row is looked up by.
 */
export const worlds = aPartTable(sqliteTable(
  'worlds',
  {
    /** nanoid. A world can be cited, and its database identity is not unique across dead rows. */
    id: text('id').primaryKey(),

    /**
     * The name a person reads. Criterion C5: a home world is called "my world" until the person
     * renames it, an agent-made world is "<agent handle>'s <purpose>", a test world is named after
     * its test file. The hash stays the identity; this is only what it is called.
     */
    name: text('name').notNull(),
    /**
     * WHAT THE WORLD IS FOR, in the starter's own words, or NULL because nobody recorded it.
     *
     * Criterion P87. A world is a copy of the corpus kept up so somebody can look at a change, and
     * the row said where it was and who started it and not what the reader was being asked to look
     * at. The tool that starts a world writes it here, through the world's own server, from the
     * sentence its starter gave on the command line.
     *
     * NULL IS A REAL ANSWER and not an empty one: a world whose starter said nothing says so on the
     * page, rather than being given a purpose nobody wrote. The fifth invariant.
     */
    purpose: text('purpose'),

    /**
     * THE HANDBACK THIS WORLD BELONGS TO, by record id, or NULL because nobody tied it to one.
     *
     * Criterion C33: a handback filed after a world starts cannot be found inside that world. A
     * world is a copy taken when it starts, so a handback filed afterwards lives on the person's office and
     * not inside the world; the row had no way to say where that handback was.
     *
     * A RECORD ID AND NOT A LINK. A link needs two records and a world is a row in this table, not
     * a record: `RECORD_KINDS` in src/shared/types.ts has no `world`, and the links door refuses an
     * end that is not a record. The criticised design of 8 September says the tool writes this as a
     * field (design/permissions/DESIGN-2026-09-08-perm-5.md version 2).
     *
     * NOTHING CHECKS THAT THE RECORD EXISTS, deliberately: a world is usually started before its
     * handback is written, so a check would refuse the ordinary case. A page that draws it says so
     * when the record is not there rather than drawing a dead address.
     */
    handback: text('handback'),
    /** `home`, `agent-made`, `test` or `remote`. The four in src/shared/worlds.ts and no fifth. */
    kind: text('kind').notNull(),
    /** The participant who started it, or NULL because nobody recorded one. */
    startedByKind: text('started_by_kind'),
    startedById: text('started_by_id'),
    /** The checkout its code came from, absolute, or NULL because it did not say. */
    checkout: text('checkout'),
    /**
     * The commit that checkout was on, short, or NULL because it did not say.
     *
     * `head`, WHICH IS THIS PROJECT'S STORED WORD FOR IT. The world header writes `head=`, `World`
     * in src/shared/runtime.ts calls it `head`, and `WORLD_FIELDS` already says the word a reader
     * sees for it is "the commit". A column called `commit` would be a second name for one fact, and
     * it is also a reserved word in SQLite, so every hand-written query would have to quote it.
     */
    head: text('head'),
    /** The sixteen hex characters of the database it answers from. THE IDENTITY. */
    databaseIdentity: text('database_identity').notNull(),
    /** Where it was reachable when it registered, or NULL because it did not say. */
    address: text('address'),

    /**
     * WHERE ANOTHER MACHINE CAN REACH IT, or NULL because this world serves nobody but this one.
     *
     * A SECOND ADDRESS AND NOT A REPLACEMENT. `address` is the loopback one every world has; this is
     * the one a server declaring `MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES` also binds. The office
     * held only the first, so a person opening Mole Office from another machine read a list of
     * worlds whose every address was 127.0.0.1, and Enter answered
     * "Failed to fetch".
     */
    addressForOtherMachines: text('address_for_other_machines'),
    /** `canonical` or `scratch`, the word the world header already carries. */
    standing: text('standing').notNull(),
    /** The `worlds` row of the world that started this one, or NULL. */
    parentWorld: text('parent_world'),
    /** LOCAL wall clock. No SQL default, for the reason `reader_anchors` gives. */
    bornAt: text('born_at').notNull(),
    /** When it stopped answering. NULL means it is alive as far as the office knows. */
    diedAt: text('died_at'),
    /** One plain sentence saying why it ended. NULL exactly when `died_at` is NULL. */
    diedBecause: text('died_because'),
    /** The installation this world belongs to, from the `installation` row of its own database. */
    installation: text('installation').notNull(),

    /**
     * THE `held_keys` ROW OF THE KEY THIS WORLD'S REPORTS CARRY, or NULL because no key was made.
     *
     * Criterion P83 point 5, answer B, migration 0179. When an agent
     * registers a world with its own key, the office makes one more live key of that agent, as it
     * does for a run, and answers it once; the world's server sends it on every report it makes to
     * this office. `closeWorldHere` in src/server/lib/office.ts revokes it in the same write that
     * marks the world ended. Only the row's id is here; the key itself is never stored anywhere.
     *
     * NOT EXPORTED. It names a `held_keys` row, and no archive carries that table.
     */
    runKeyId: text('run_key_id'),
  },
  (t) => [
    index('worlds_database_idx').on(t.databaseIdentity),
    index('worlds_installation_idx').on(t.installation),
    uniqueIndex('worlds_one_live_per_database_idx').on(t.databaseIdentity).where(sql`died_at IS NULL`),
  ],
), existingArchive)
