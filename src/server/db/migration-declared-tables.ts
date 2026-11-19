// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { AUTHORED_TABLES, type AuthoredTable } from './table-name-lists.ts'

/**
 * The one authored table a MIGRATION writes a row into by itself, so a row in it is not evidence
 * that anybody wrote anything.
 *
 * `migrateWorkspaces` declares the `default` workspace on every database it touches — scripts/
 * restore-check.ts states in writing that a migrated database always has it — so a freshly migrated,
 * completely empty database holds exactly one row, and it is in `workspaces`. Counting it as work
 * would make every fresh clone, every test database and every `tools/review.mjs` run look like a
 * corpus somebody would miss, and the guards that protect real work would be turned off within a
 * week.
 *
 * THIS IS THE ONE LIST HERE THAT IS NOT DERIVED, because nothing can compute it without running the
 * migrations. It is PROVED instead: `describe('the counted tables are the ones a migration does not
 * fill')` in tests/migration.test.ts migrates an empty database and asserts that the tables holding
 * rows are exactly this list and the tables holding none are exactly `IRREPLACEABLE_TABLES`. Adding
 * a data migration that seeds another table, or removing the one that seeds this one, turns that
 * test red rather than quietly changing what "holds work" means.
 */
export const MIGRATION_DECLARED_TABLES = [
  // THE LIST OF QUICK INPUTS THE OFFICE STARTS WITH, /context and /compact, written by migration 0272
  // and stamped as the migration's. Every database migrated past 0272 holds its one row, so a row here is
  // not evidence that anybody wrote anything. First, because it comes before `workspaces` in `AUTHORED_TABLES`.
  //
  // WHAT THIS COSTS, SAID PLAINLY. A list the person set or cleared is a row they wrote, and it is no longer counted:
  // a database whose only written row is that list reads as holding no work to the three guards that count
  // `IRREPLACEABLE_TABLES`. The asks, `quick_input_asks`, are still counted. The alternative is to write no starting
  // list, and then no agent could ask for anything until the person had set one.
  'quick_input_list',
  'workspaces',
  // THE ONE ROW SAYING THE STORED READING-MEASURE WORDS CARRY THEIR NEW NAMES, written by
  // `migrateMeasureWords` from migration 0173 on. Every migrated database holds exactly one row of
  // it, so a row here is not evidence that anybody wrote anything, the same as `installation` below.
  'measure_words_renamed',
  // THE OWNER'S OWN ROW AND THE PICTURE DRAWN FOR IT, both written by `migrateParticipants`. A row
  // in either is not evidence that anybody wrote anything, exactly as the `default` workspace is
  // not: a freshly migrated, completely empty database holds one person and one generated avatar.
  //
  // WHAT THIS COSTS, SAID PLAINLY. A database holding nothing but extra people would read as holding
  // no work to the three guards that count `IRREPLACEABLE_TABLES`. That is the same cost `workspaces`
  // has carried since the boundary arrived, and it is the price of a table a migration seeds at all.
  // The alternative — leaving these out of `AUTHORED_TABLES` — would keep them out of every backup,
  // and an uploaded avatar exists nowhere else.
  //
  // IN `AUTHORED_TABLES` ORDER, because the test that proves this list compares it against the
  // filled tables in that order.
  'assets',
  'people',
  // AND MOLE OFFICE'S OWN PARTICIPANT ROW, written by the same step from migration 0120 on. M11
  // makes Mole Office a participant so that the lines saying a group was opened, a member was added
  // or two claims are in conflict have a sender and are not faked as an agent's. A freshly migrated,
  // completely empty database therefore holds one agent, and a row in `agents` is no longer evidence
  // that anybody wrote anything.
  //
  // WHAT THIS COSTS, SAID PLAINLY, because it is the same cost `people` carries and it is now wider.
  // A database holding durable agents and nothing else reads as holding no work to the three guards
  // that count `IRREPLACEABLE_TABLES`. That is a database where somebody registered agents and wrote
  // nothing with them; `agent_records` and `records` are both still counted, so a corpus with any
  // agent record in it still reads as work. The alternative — leaving `agents` out of
  // `AUTHORED_TABLES` — would keep every durable agent out of every backup, and the name and picture
  // somebody chose for one exist nowhere else.
  'agents',
  // AND THE ONE ROW SAYING WHICH INSTALLATION THIS DATABASE BELONGS TO, written by
  // `migrateCitizenship` from migration 0122 on. Every migrated database holds exactly one row of
  // it, so a row here is not evidence that anybody wrote anything either. It costs nothing the two
  // above do not already cost: `installation` can never be the only table with rows in a database
  // that holds work, because it always has exactly one row whatever else is there.
  'installation',
] as const satisfies readonly AuthoredTable[]

/**
 * The tables whose rows only ever arrive because a person or an agent wrote something.
 *
 * WHAT "THIS DATABASE HOLDS WORK" MEANS, asked in three places that used to answer it differently:
 * the migration loss-guard, the boot guard in db/migrate.ts, and the refusal in scripts/reset.ts.
 * All three read this list now, so a database holding nothing but somebody's plan is work to all of
 * them or to none of them.
 */
export type IrreplaceableTable = Exclude<AuthoredTable, (typeof MIGRATION_DECLARED_TABLES)[number]>

export const IRREPLACEABLE_TABLES: readonly IrreplaceableTable[] = AUTHORED_TABLES.filter(
  (table): table is IrreplaceableTable => !(MIGRATION_DECLARED_TABLES as readonly string[]).includes(table),
)
