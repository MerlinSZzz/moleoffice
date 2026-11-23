// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Throw the database away and build it again from scratch: delete the file, apply every
 * migration, re-seed. One command, `npm run db:reset`, for when the data has been poked at
 * during development and you want a known starting point.
 *
 * The imports below are deliberately dynamic (`await import(...)`). A normal import at the top
 * of the file runs before any of this file's own code does, so the database connection would
 * be opened — recreating the file — before the deletion below had a chance to happen.
 */

import { existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadPanelEnv } from '../src/server/lib/env.ts'
import { apiAddressForThisProcess, settingValue, settings, workspaceFrom, whyThisCheckoutMayNotOpenTheDatabase } from '../src/config/settings.mjs'
import { askWhatHoldsIt, LEDGER_WAIT_S } from '../tools/what-holds-it.mjs'
import { withTheWayForThisJob } from '../src/config/the-office-tool-environment.mjs'
// WHICH TABLES HOLD WORK IS THE SCHEMA'S ANSWER. Importing db/every-part-table.ts opens nothing — it and
// the files it imports declare tables, make lists of them and import drizzle — which is the whole reason the guard
// below can ask it before the file is deleted. See the refusal for what it cost when this script asked `records` alone.
import { irreplaceableTablesWithParts } from '../src/server/db/every-part-table.ts'

// `.env` before MOLE_OFFICE_DB is read, and this script has to do it itself: db/client.ts loads the
// settings for everything that opens the database, and this is the one command that must read the
// path WITHOUT opening it. Until it did, the refusal below protected ./data/panelx.db while the
// database the operator had configured in .env went unguarded. `lib/env.ts` opens nothing.
loadPanelEnv()

// The path and its default come from src/config/settings.mjs, which opens nothing — that is what
// makes it importable here, in the one command that must read the path WITHOUT opening the file.
// This line used to carry its own copy of the default, kept in step with db/client.ts by hand.
const file = settings().databasePath
const refusal = whyThisCheckoutMayNotOpenTheDatabase(file)
if (refusal !== null) throw new Error(withTheWayForThisJob(refusal))

/**
 * REFUSE TO DELETE A DATABASE THAT HOLDS WORK, unless the caller says so in words.
 *
 * This script deletes a database and seeds a fresh one. Its default target is the SAME PATH the
 * server uses, so `npm run db:reset` with nothing set destroys the working corpus — and it is one
 * word away from `npm run db:migrate` in the same package.json, on a project whose only copy of its
 * own research record lives at that path. A cold acceptance campaign found this by reading the
 * script; nobody had run it by accident yet, which is luck rather than a guard.
 *
 * The rule is the one this repository already keeps: fail loudly on a broken assumption. A database
 * that is absent or empty is what this script is FOR, so that case stays silent. One that holds
 * anybody's work is a database somebody is using, and the refusal names what is in it, where it is,
 * and the two ways on — point somewhere else, or say the word.
 *
 * IT COUNTS EVERY TABLE THAT HOLDS AUTHORED WORK, from `IRREPLACEABLE_TABLES` in db/migration-declared-tables.ts, and
 * it asked `records` alone until 2026-08-12. Measured on that day against a database holding one
 * planning draft, one capacity row and one recurrence and no records at all — which is exactly what
 * the drafts surface is FOR, rough thinking before it is anything — this command deleted it,
 * reseeded it with 290 fixture records, printed `reset: done` and exited 0. One `note` record was
 * enough to protect a database; a fortnight of planning was not.
 *
 * It counts by opening the file READ-ONLY through a plain driver rather than through
 * db/client.ts, which would open the real database for writing before the check could refuse. A
 * table that is not there at all is skipped rather than counted as empty: a database from before a
 * migration added one is not a database with nothing in that table.
 */
const ALLOW = 'MOLE_OFFICE_RESET_YES_DELETE_MY_DATA'
if (existsSync(file) && settingValue(ALLOW) !== '1') {
  const { default: Database } = await import('better-sqlite3')
  const probe = new Database(file, { readonly: true, fileMustExist: true })
  const held: string[] = []
  try {
    for (const table of irreplaceableTablesWithParts()) {
      const there = probe.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)
      if (there === undefined) continue
      // Interpolated because SQLite takes no bound parameter in a table position. The name comes
      // from the schema's own list; nothing a request or a file could have written reaches it.
      const n = (probe.prepare(`SELECT count(*) AS n FROM "${table}"`).get() as { n: number }).n
      if (n > 0) held.push(`${n} ${table}`)
    }
  } finally {
    probe.close()
  }
  if (held.length > 0) {
    console.error(
      `reset: REFUSING to delete ${file}. It holds ${held.join(', ')}, so it is a database somebody is ` +
        `using — and this command deletes it and seeds a fresh one in its place.\n\n` +
        `  To reset a throwaway database instead:  MOLE_OFFICE_DB=/tmp/scratch.db npm run db:reset\n` +
        `  To really delete THIS one:              ${ALLOW}=1 npm run db:reset\n\n` +
        `Nothing has been changed. Take a copy first if the contents matter — and take it with ` +
        `\`npm run db:backup\`, not with cp: this database is in WAL mode, so a plain copy of the ` +
        `.db file leaves behind everything written since the last checkpoint, which on the live ` +
        `corpus was measured at 6 records and 55 minutes of work.`,
    )
    process.exit(1)
  }
}

/**
 * AND NO LIVE WORLD MAY HOLD IT. The count above reads what is in the file, not who has it open. The
 * word passes it, and so does a file with no authored rows, and either way this would delete a
 * database a running server is serving. Read on 15 October 2026: five live ledger rows held the
 * database the main checkout's server serves, and nothing here asked about them. So before anything is removed,
 * the ledger is asked the question a world's stop asks before it frees a port or a database, through
 * tools/what-holds-it.mjs, and any holder refuses. The ledger decides what holds a file, and that
 * module alone decides what counts as its answer; this only says what each answer means here.
 *
 * ONE FAILURE TO ASK HAS A WAY ON. A refused connection means nothing listens at the address, which
 * is how a server is left before its own database is reset, and a second word passes that. A timeout
 * never does: an office that hangs still holds its database and does not answer. Nor does an error
 * answer, or an answer that is not the ledger's.
 */
const WITHOUT_THE_LEDGER = 'MOLE_OFFICE_RESET_WITHOUT_THE_LEDGER'

/** Null when nothing holds the file, or the end of the sentence that refuses to delete it. */
async function whyTheLedgerKeepsIt(database: string): Promise<string | null> {
  const api = apiAddressForThisProcess().replace(/\/+$/, '')
  const said = await askWhatHoldsIt({ api, workspace: workspaceFrom(process.env), tool: 'scripts/reset.ts', database })
  switch (said.got) {
    case 'nothing-holds-it':
      return null
    case 'held':
      return `the ledger at ${api} says a live world holds it. ${said.says} Stop that world before you reset its database.`
    case 'timeout':
      return `the office at ${api} gave no answer within ${String(LEDGER_WAIT_S)} s. An office that hangs still holds its database, so no word passes this.`
    case 'refused':
      if (settingValue(WITHOUT_THE_LEDGER) === '1') {
        console.log(
          `reset: the ledger was not asked whether a live world holds ${database}: the connection to ${api} was refused, ` +
            `and ${WITHOUT_THE_LEDGER}=1 says to go on without it.`,
        )
        return null
      }
      return (
        `the connection to ${api} was refused, so no office listens there to say. ` +
        `If no other office uses this database either, say so in words:\n\n` +
        `  ${WITHOUT_THE_LEDGER}=1 npm run db:reset`
      )
    case 'unreachable':
      return `the office at ${api} could not be asked: ${said.message}. No word passes this.`
    case 'an-error-answer':
      return `the office at ${api} answered ${String(said.status)}: ${said.replied}. No word passes this.`
    case 'not-the-ledgers':
      return `the office at ${api} answered with something that is not the ledger's answer about this file: ${said.text}. No word passes this.`
  }
}

if (existsSync(file)) {
  const kept = await whyTheLedgerKeepsIt(resolve(file))
  if (kept !== null) {
    console.error(
      `reset: REFUSING to delete ${file}. Before it deletes a database, this command asks the ledger whether a live ` +
        `world holds it, and ${kept}\n\nNothing has been changed.`,
    )
    process.exit(1)
  }
}

// Write-ahead logging keeps two sidecar files next to the database. Deleting the main file and
// leaving these behind gives SQLite a journal for a database that no longer exists.
let removed = 0
for (const f of [file, `${file}-wal`, `${file}-shm`]) {
  if (!existsSync(f)) continue
  rmSync(f)
  console.log(`reset: removed ${f}`)
  removed++
}
if (removed === 0) console.log(`reset: no database at ${file} yet, starting from nothing`)

/**
 * THE FRESH DATABASE IS WRITTEN WITH FIXED IDS AND AT A FIXED TIME, so that two reviews draw the
 * same pages (wave 13y rounds 37 and 38). Two resets on the same day write the same rows, byte for byte,
 * when the path is the same.
 *
 * The ids are made in turn (`idsInTurn` in src/server/lib/ids.ts), so the n-th id is the same on
 * every reset. The clock reads midnight this morning, local, from here until the seed, its data
 * migrations, first-start chapters, card words, secretary schedules and secretariat have finished
 * (wave 13y round 39). `new Date()` and `Date.now()` give that instant and nothing else, so every
 * stamp the migrations, seed and first-start functions write is that instant or an offset the seed
 * worked out from it. Midnight because the seed
 * already dates everything from it (THE DEMO CLOCK in scripts/seed.ts), and it is
 * never in the future. A date built from a value is built as it always was.
 *
 * What it costs: a record the seed writes as happening now says midnight. The running sessions
 * read as quiet since midnight, by however long the day has run when somebody looks.
 *
 * Only here. `npm run db:seed` on a database that already holds rows draws its ids at random and
 * reads the real clock, as before, and so does a test that imports the seed.
 */
const RealDate = Date
const MIDNIGHT = new RealDate()
MIDNIGHT.setHours(0, 0, 0, 0)
const THE_FIXED_INSTANT = MIDNIGHT.getTime()
class TheFixedClock extends RealDate {
  constructor(...value: [] | [string | number | Date]) {
    if (value.length === 0) super(THE_FIXED_INSTANT)
    else super(...(value as [string | number | Date]))
  }
  static override now(): number {
    return THE_FIXED_INSTANT
  }
}
globalThis.Date = TheFixedClock as DateConstructor
const { idsInTurn } = await import('../src/server/lib/ids.ts')
const theIdsAreRandomAgain = idsInTurn('mole-office reset')
console.log(`reset: ids are made in turn, and the clock reads ${MIDNIGHT.toString()} until the seed and first-start records are done`)

const { sqlite } = await import('../src/server/db/client.ts')
const { migrateInPlace, MIGRATIONS_FOLDER } = await import('../src/server/db/migrate.ts')

// THE PRODUCT'S OWN MIGRATION PATH, not drizzle's `migrate` on its own — the same correction
// tests/helpers.ts and scripts/restore-check.ts each needed, found here the same way and last.
// `migrateInPlace` runs the SQL migrations AND the data migrations, and one of those is what
// declares that the default workspace exists.
//
// What the SQL alone left, measured 2026-08-12: 290 records, seven journal rows, and an EMPTY
// `workspaces` table — every record saying `workspace_id = 'default'` with no workspace of that
// name. `npx tsx scripts/reindex.ts` against it dies with the product's own sentence, "A database
// that has been migrated always has the default workspace", and restore-check.ts says in writing
// that this state cannot exist. It healed itself on the next server start, through the exemption
// for a database whose records are all fixture — which is to say the damage was invisible.
//
// The product declares the migration folder, independent of the working directory (wave 13y round 38).
migrateInPlace(sqlite, MIGRATIONS_FOLDER)
console.log('reset: migrations applied')

// Importing the seed script runs it; it prints its own summary.
await import('./seed.ts')

// Bring the seed's rows through the same migrations before filing authored first-start records
// (wave 13y round 38). These writes belong under the seed clock and ids too.
// The server migrates only a database whose every record is seed data (wave 13y round 39).
migrateInPlace(sqlite, MIGRATIONS_FOLDER)

// File the same first-start records before the seed clock and ids end (wave 13y round 38).
const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
console.log(copyTheDefaultRegulationsOnce().line)
const { readTheRoleCardsAtStart, theCommitTheCardWordsComeFrom } = await import('../src/server/lib/role-cards-at-start.ts')
readTheRoleCardsAtStart()
// Sync the secretary's schedule and secretariat in the server's order (wave 13y round 39).
const { syncTheSecretariatGroup } = await import('../src/server/lib/secretariat.ts')
syncTheSecretariatGroup()
const { syncTheBroadcastSchedules } = await import('../src/server/lib/broadcast.ts')
syncTheBroadcastSchedules()
const { fileTheCardWordsOnce } = await import('../src/server/lib/card-words.ts')
console.log(fileTheCardWordsOnce(theCommitTheCardWordsComeFrom()).line)

theIdsAreRandomAgain()
globalThis.Date = RealDate
sqlite.close()
console.log(`reset: done — fresh database at ${file}`)
