// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Apply the SCHEMA migrations only, then put one row into each of the four authored side tables
// that are empty in the live database — including a `step:` presentation intent, which is the one
// the block migration has to rewrite. Read/write on a COPY only.
import { whyThisCheckoutMayNotOpenTheDatabase } from '../../src/config/settings.mjs'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { join } from 'node:path'
import { THE_MIGRATION_JOURNAL_TABLE, theMigrationsInTheFolder, theMigrationsNotYetApplied } from '../../src/config/migration-look.mjs'
import { REPO_ROOT } from '../../src/config/settings.mjs'

const file = process.argv[2]
const pairingRefusal = whyThisCheckoutMayNotOpenTheDatabase(file)
if (pairingRefusal !== null) throw new Error(pairingRefusal)
const db = new Database(file)
db.pragma('journal_mode = WAL')
// Follow migrate.ts's MIGRATIONS_FOLDER rule so a copy uses this checkout's migrations from any cwd.
// Use settings.mjs's REPO_ROOT because this plain Node tool cannot load migrate.ts's path aliases.
// A COPY THAT ALREADY HAS A JOURNAL TABLE TAKES WHAT IT IS MISSING, BY THE ONE RULE migrate.ts uses
// (theMigrationsNotYetApplied), in index order. drizzle's own function applies only a migration whose `when` is
// later than the newest it holds, so one that sat behind main's newest was skipped without a word (wave 13v
// round 23). A file with no journal table yet is built by drizzle, which on an empty file applies everything.
const folder = join(REPO_ROOT, 'drizzle')
const hasJournal = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(THE_MIGRATION_JOURNAL_TABLE) !== undefined
if (!hasJournal) migrate(drizzle(db), { migrationsFolder: folder })
else {
  const rows = db.prepare(`SELECT hash, created_at FROM "${THE_MIGRATION_JOURNAL_TABLE}"`).all()
  const journal = db.prepare(`INSERT INTO "${THE_MIGRATION_JOURNAL_TABLE}" ("hash", "created_at") VALUES (?, ?)`)
  db.transaction(() => {
    for (const migration of theMigrationsNotYetApplied(rows, theMigrationsInTheFolder(folder))) {
      for (const statement of migration.sql) db.prepare(statement).run()
      journal.run(migration.hash, migration.when)
    }
  })()
}

const at = '2026-08-10 09:00:00'
// THE ROWS ARE WRITTEN AS THE COPY'S OWN OWNER, read off the session record the last row is about. It was the real
// owner's id written out, which a copy owned by anybody else, such as a test office's invented owner, does not hold.
const session = db.prepare("SELECT id, owner_id FROM records WHERE kind='session' LIMIT 1").get()
const owner = session.owner_id
db.prepare(
  "INSERT INTO presentation_intent (workspace_id, scope, target, intent, updated_at, updated_by) VALUES ('default', ?, ?, ?, ?, ?)",
).run('pipeline:g1Q-TqSWqPZH', 'step:hv2-04', JSON.stringify({ lane: 'on the real bench', emphasis: 'blocked' }), at, owner)
// One that names a step no pipeline holds, so the "reported, never rewritten to a guess" path runs.
db.prepare(
  "INSERT INTO presentation_intent (workspace_id, scope, target, intent, updated_at, updated_by) VALUES ('default', ?, ?, ?, ?, ?)",
).run('pipeline:g1Q-TqSWqPZH', 'step:hv2-99', JSON.stringify({ lane: 'later' }), at, owner)

db.prepare("INSERT INTO reader_anchors (workspace_id, reader, last_seen_at) VALUES ('default',?,?)").run(owner, at)
db.prepare(
  "INSERT INTO panel_layouts (workspace_id, id, layout, updated_at, updated_by) VALUES ('default','home',?,?,?)",
).run(JSON.stringify({ order: ['since', 'attention'] }), at, owner)
db.prepare(
  "INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, pgid, os_started_at, detail, registered_at, registered_by) " +
    "VALUES ('res-1','default',?,'port','29411',12345,?,'a review server',?,?)",
).run(session.id, at, at, owner)

console.log('pre-seeded the four authored side tables, including two `step:` intent rows')
db.close()
