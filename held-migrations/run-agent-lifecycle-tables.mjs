// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CREATE THE TWO LIFECYCLE TABLES ON A DATABASE YOU NAME. NEVER ON THE LIVE CORPUS.
 *
 *   node held-migrations/run-agent-lifecycle-tables.mjs <copy.db>
 *   node held-migrations/run-agent-lifecycle-tables.mjs <copy.db> --apply
 *
 * Without `--apply` it reads the database, says what it would create and writes nothing. With it,
 * it creates the tables, counts the rows in both — which must be zero — and then RUNS AGAIN and
 * prints that too, because "it is safe to run twice" is a claim somebody has to see.
 *
 * WHY THIS IS NOT `npm run db:migrate`. That command runs on every clone and on every server start.
 * This campaign has one announced migration window and the owner runs it; a migration registered
 * before then stops the owner's dev server at a moment nobody chose. Round ten's windows A and B were held
 * exactly this way, in a folder of their own, until the commit that registered them.
 *
 * WHAT IT REFUSES, AND WHY EACH ONE:
 *
 *   - the office's own database, before anything is opened. The settings give it three names, all read
 *     from src/config/settings.mjs, the one definition of the setting: the file MOLE_OFFICE_DB names
 *     (from the environment or .env), the settings' default (`data/mole-office.db` today), and the
 *     name before the rename, `data/panelx.db`, which an older office still uses. The path you give is
 *     refused when any of these holds:
 *       - its resolved path, or its real path with every symbolic link followed, ends in the default
 *         name or the old name, in any checkout;
 *       - its resolved path or its real path is the real path of one of the three names;
 *       - it is the same file (device and inode) as one of the three names that exists;
 *       - it has more than one name (a hard link), because another name may be the office's database
 *         in a place this runner cannot list. Copy the file instead: a copy has one name;
 *       - it is a symbolic link to a file that does not exist, because opening it would create that file.
 *     A path that does not exist and is no link is compared by its resolved name only. History: until
 *     2 October 2026 this refused only `data/panelx.db` (problem ZxFvofvzPrKz), and until round 12 of
 *     wave 13p it compared resolved strings, so a link to the database got through (problem
 *     Z8sP12_liDo0). Copy the database first.
 *   - a database with either table already present, unless `--apply` is repeated, in which case it
 *     says so and creates nothing. A `CREATE TABLE IF NOT EXISTS` would hide a half-applied run.
 *   - a database with no `records` table. That is not a Mole Office corpus, and creating two tables in
 *     an unrelated file is how a wrong path becomes a mess nobody can find.
 *
 * WHAT IT PROVES, PRINTED EVERY TIME: both tables exist, both are EMPTY, the three indexes are
 * there, and the count of session records that gained anything is zero. This migration invents no
 * history — the owner's section 15 — and the emptiness is how that is checked rather than asserted.
 */

import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import Database from 'better-sqlite3'
import {
  databasePathFrom,
  whyThisCheckoutMayNotOpenTheDatabase,
  mergedEnvironment,
  settingNamed,
  THE_DATABASE_BEFORE_THE_RENAME,
} from '../src/config/settings.mjs'

const SQL_FILE = fileURLToPath(new URL('./agent-lifecycle-tables.sql', import.meta.url))
const TABLES = ['agent_work_transitions', 'agent_wakes']
const INDEXES = ['agent_work_transitions_agent_idx', 'agent_wakes_poll_idx', 'agent_wakes_agent_idx']

const file = process.argv[2]
const apply = process.argv.includes('--apply')

/** A path as a name relative to a checkout, without a leading `./`. */
const asATail = (path) => String(path).replace(/^\.\//u, '')

/** The three names the settings give the office's database, each with why it is refused. */
const THE_NAMES = [
  { path: databasePathFrom(mergedEnvironment()), why: 'the database this office\'s settings name (MOLE_OFFICE_DB)' },
  { path: databasePathFrom({}), why: 'the settings\' default database' },
  { path: databasePathFrom({ MOLE_OFFICE_DB: THE_DATABASE_BEFORE_THE_RENAME }), why: 'the database an office made before 30 September 2026 still uses' },
]

/** The two names refused in any checkout, by how a path ends. */
const THE_TAILS = [
  { tail: asATail(settingNamed('MOLE_OFFICE_DB').fallback), why: 'the settings\' default database' },
  { tail: asATail(THE_DATABASE_BEFORE_THE_RENAME), why: 'the database an office made before 30 September 2026 still uses' },
]

/** The real path of an existing file, every symbolic link followed, or null when nothing is there. */
const realPathOf = (path) => (existsSync(path) ? realpathSync(path) : null)

/**
 * WHY `path` IS THE OFFICE'S OWN DATABASE, or null when it is not. The rules are the ones the header
 * lists, in the same order.
 */
function whyItIsTheOffices(path) {
  const named = resolve(path)
  const real = realPathOf(path)
  for (const one of THE_TAILS) {
    if (named.endsWith(one.tail) || (real !== null && real.endsWith(one.tail))) return one.why
  }
  for (const one of THE_NAMES) {
    const itsReal = realPathOf(one.path)
    if (named === one.path || (itsReal !== null && (named === itsReal || real === itsReal))) return one.why
    if (real !== null && itsReal !== null) {
      const mine = statSync(path)
      const its = statSync(one.path)
      if (mine.dev === its.dev && mine.ino === its.ino) return `${one.why}, under another name`
    }
  }
  if (real !== null && statSync(path).nlink > 1) {
    return 'a file with more than one name (a hard link), and another of its names may be the office\'s database'
  }
  let isALink = false
  try {
    isALink = lstatSync(path).isSymbolicLink()
  } catch {
    // Nothing at this path, and no link either: there is nothing to follow.
  }
  if (isALink && real === null) return 'a symbolic link to a file that does not exist, which opening it would create'
  return null
}

if (file === undefined) {
  throw new Error(
    `Name the database to run against. Never the office's own database (${asATail(settingNamed('MOLE_OFFICE_DB').fallback)} ` +
      'by default, or the file MOLE_OFFICE_DB names): copy it first.',
  )
}
const refusedAs = whyItIsTheOffices(file)
const pairingRefusal = whyThisCheckoutMayNotOpenTheDatabase(file)
if (pairingRefusal !== null) throw new Error(pairingRefusal)
if (refusedAs !== null) {
  throw new Error(`${file} is the live corpus: ${refusedAs}. Copy it and run against the copy. Nothing was written.`)
}

const say = (line) => process.stdout.write(line + '\n')

/** Which of the two tables this database already has. */
function tablesPresent(db) {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (?, ?)")
    .all(TABLES[0], TABLES[1])
  return rows.map((r) => r.name)
}

/** Which of the three indexes this database already has. */
function indexesPresent(db) {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all()
  return INDEXES.filter((name) => rows.some((r) => r.name === name))
}

/** How many rows each of the two tables holds. Only called once they exist. */
function counts(db) {
  return Object.fromEntries(TABLES.map((t) => [t, db.prepare(`SELECT count(*) AS n FROM ${t}`).get().n]))
}

const db = new Database(file)
say(`--- ${file}`)

const isMoleOfficeCorpus = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'records'").get()
if (isMoleOfficeCorpus === undefined) {
  throw new Error(`${file} has no "records" table, so it is not a Mole Office corpus. Nothing was written.`)
}

const sessionsBefore = db.prepare("SELECT count(*) AS n FROM records WHERE kind = 'session'").get().n
const stampedBefore = db
  .prepare("SELECT count(*) AS n FROM records WHERE kind = 'session' AND json_extract(data, '$.extra.discovered') IS NOT NULL")
  .get().n
say(`session records: ${sessionsBefore}, of which ${stampedBefore} carry a discovery stamp`)

const already = tablesPresent(db)
say(already.length === 0 ? 'neither lifecycle table is here yet' : `already present: ${already.join(', ')}`)

if (!apply) {
  say(`would create: ${TABLES.join(', ')} and the indexes ${INDEXES.join(', ')}`)
  say('Nothing was written. Add --apply to run it.')
  process.exit(0)
}

if (already.length === TABLES.length) {
  say('Both tables are already here, so this run created nothing. That is what running it twice looks like.')
} else if (already.length > 0) {
  throw new Error(
    `${already.join(', ')} exists and ${TABLES.filter((t) => !already.includes(t)).join(', ')} does not. ` +
      'That is a half-applied run and this will not paper over it. Nothing was written.',
  )
} else {
  db.exec(readFileSync(SQL_FILE, 'utf8'))
  say(`created: ${TABLES.join(', ')}`)
}

const rows = counts(db)
say(`rows now: ${TABLES.map((t) => `${t} ${rows[t]}`).join(', ')}`)
say(`indexes now: ${indexesPresent(db).join(', ')}`)

const sessionsAfter = db.prepare("SELECT count(*) AS n FROM records WHERE kind = 'session'").get().n
const stampedAfter = db
  .prepare("SELECT count(*) AS n FROM records WHERE kind = 'session' AND json_extract(data, '$.extra.discovered') IS NOT NULL")
  .get().n
say(`session records: ${sessionsAfter}, of which ${stampedAfter} carry a discovery stamp — unchanged by this migration`)

const invented = []
if (rows[TABLES[0]] !== 0) invented.push(`${TABLES[0]} holds ${rows[TABLES[0]]} rows`)
if (rows[TABLES[1]] !== 0) invented.push(`${TABLES[1]} holds ${rows[TABLES[1]]} rows`)
if (sessionsAfter !== sessionsBefore) invented.push(`the session count moved from ${sessionsBefore} to ${sessionsAfter}`)
if (stampedAfter !== stampedBefore) invented.push(`the stamped count moved from ${stampedBefore} to ${stampedAfter}`)
if (invented.length > 0) {
  throw new Error(`This migration invented history it never observed: ${invented.join('; ')}.`)
}
say('nothing was invented: both tables are empty and no session record gained anything')

// AND AGAIN, so that "safe to run twice" is something a reader watched happen rather than read.
const second = tablesPresent(db)
say(`run twice: both tables already present (${second.join(', ')}), so a second run creates nothing`)
db.close()
