// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The way back runs the previous stable version on the database the newer version left behind, and
 * never rolls that database back. The previous version can do that only when every change made to the
 * database since then only adds: a new table, a new column that may be empty or has a constant default
 * that meets its checks, or a new index. A trigger, a DELETE, or a new unique index on an older table
 * may pass too, but only when a reviewed list in the way back's configuration names the migration.
 * These rules read the migrations and the in-place steps of both versions from Git, and name the first
 * change that does anything else. A column that may not be empty is tried by SQLite in a database the
 * newer version's own migrations build in memory, so no table is made here.
 */
import { relative } from 'node:path'
import Database from 'better-sqlite3'
import { REPO_ROOT, THE_MIGRATIONS_FOLDER } from '../../src/config/settings.mjs'
import { THE_STATEMENT_BREAKPOINT } from '../../src/config/migration-look.mjs'

const fail = (s) => { throw new Error(s) }
/** Where every version keeps its migrations, as a path inside its tree. */
export const THE_MIGRATIONS_PATH = relative(REPO_ROOT, THE_MIGRATIONS_FOLDER)
/** The file whose THE_STEPS list names the in-place steps an ordinary start runs. */
export const THE_STEPS_FILE = 'src/server/db/migrate.ts'

const shortened = (text) => (text.length > 80 ? `${text.slice(0, 80)}…` : text)

/** One SQL statement without its comments, quotes around names, or runs of white space. */
function plain(statement) {
  let text = '', quoted = false
  for (let i = 0; i < statement.length; i++) {
    const c = statement[i]
    if (quoted) { text += c; if (c === "'") quoted = false; continue }
    if (c === "'") { quoted = true; text += c; continue }
    if (c === '-' && statement[i + 1] === '-') { while (i < statement.length && statement[i] !== '\n') i++; text += ' '; continue }
    if (c === '/' && statement[i + 1] === '*') { const end = statement.indexOf('*/', i + 2); i = end < 0 ? statement.length : end + 1; text += ' '; continue }
    text += '`"[]'.includes(c) ? '' : c
  }
  return text.replace(/\s+/g, ' ').trim().replace(/;$/, '').trim()
}

/** The text inside each CHECK of one statement, as written. CHECK and brackets in quotes or comments do not count. */
function theChecks(statement) {
  let blanked = ''
  for (let i = 0; i < statement.length;) {
    const run = [["'", "'"], ['"', '"'], ['`', '`'], ['[', ']'], ['--', '\n'], ['/*', '*/']].find(([open]) => statement.startsWith(open, i))
    if (!run) { blanked += statement[i++]; continue }
    const end = statement.indexOf(run[1], i + run[0].length)
    const next = end < 0 ? statement.length : end + run[1].length
    blanked += ' '.repeat(next - i); i = next
  }
  return [...blanked.matchAll(/\bCHECK\s*\(/gi)].map((found) => {
    const from = found.index + found[0].length
    let depth = 1, i = from
    for (; i < blanked.length && depth > 0; i++) depth += blanked[i] === '(' ? 1 : blanked[i] === ')' ? -1 : 0
    return statement.slice(from, i - 1)
  })
}

/**
 * Why SQLite refuses a row the previous version writes, in a table where `statement` added a column
 * that may not be empty, or null when it does not. `earlier` is every statement of the newer version's
 * migrations before this one; SQLite runs them in an empty database in memory, and one it cannot run
 * throws. The table gets one row first, as an older row would be there, with foreign keys and checks
 * off for that write. SQLite then runs the statement with foreign keys on, and refuses on its own a
 * default that is not a constant, DEFAULT NULL, and a default on a REFERENCES column. Last, SQLite
 * reads each CHECK in the statement against that row with the new column alone: the row holds the
 * default as the column stores it, with its type and collation, and a check that names another column
 * cannot be read, which refuses too.
 */
function whatSQLiteRefuses(table, statement, earlier) {
  const db = new Database(':memory:')
  try {
    for (const one of earlier.filter(plain)) {
      try { db.prepare(one).run() } catch (error) { fail(`The newer version's migrations cannot be built in memory: SQLite refuses "${shortened(plain(one))}": ${error.message}`) }
    }
    const name = table.split('.').map((part) => `"${part}"`).join('.')
    const quoted = (column) => `"${column.replaceAll('"', '""')}"`
    const columns = () => db.prepare('SELECT name, "notnull", dflt_value, hidden FROM pragma_table_xinfo(?)').all(table)
    try {
      const older = columns(), needed = older.filter((c) => c.notnull && c.dflt_value === null && !c.hidden)
      db.pragma('foreign_keys = OFF')
      db.pragma('ignore_check_constraints = ON')
      db.prepare(needed.length ? `INSERT INTO ${name} (${needed.map((c) => quoted(c.name)).join(', ')}) VALUES (${needed.map(() => '1').join(', ')})` : `INSERT INTO ${name} DEFAULT VALUES`).run()
      db.pragma('foreign_keys = ON')
      db.prepare(statement).run()
      db.pragma('ignore_check_constraints = OFF')
      const added = columns().filter((c) => !older.some((o) => o.name === c.name))
      if (added.length !== 1) return `SQLite shows ${added.length} new columns in ${table}, not one`
      for (const check of theChecks(statement)) {
        if (db.prepare(`SELECT 1 FROM (SELECT ${quoted(added[0].name)} FROM ${name}) WHERE NOT (${check})`).get()) return `its default fails the check (${check.trim()})`
      }
      return null
    } catch (error) {
      return error.message
    }
  } finally { db.close() }
}

/**
 * What one statement does when it does more than add, or null when it only adds. `reviewable` says
 * whether a reviewed list may allow it: only a trigger, a DELETE, or a new unique index on an older table.
 * `earlier` is every statement of the newer version's migrations before this one.
 */
export function whatAStatementChanges(statement, created, earlier) {
  const text = plain(statement)
  if (!text) return null
  const refused = (says, reviewable = false) => ({ says, reviewable })
  const table = text.match(/^CREATE (?:VIRTUAL )?TABLE (?:IF NOT EXISTS )?([\w.]+)/i)
  if (table) { created.add(table[1].toLowerCase()); return null }
  if (/^CREATE INDEX (?:IF NOT EXISTS )?[\w.]+ ON [\w.]+/i.test(text)) return null
  const unique = text.match(/^CREATE UNIQUE INDEX (?:IF NOT EXISTS )?[\w.]+ ON ([\w.]+)/i)
  if (unique) return created.has(unique[1].toLowerCase()) ? null : refused(`it adds a unique index to the table ${unique[1]}, which the previous version writes`, true)
  // A read changes nothing, and rows written into a table these migrations made are part of adding it.
  if (/^SELECT\b/i.test(text)) return null
  const rows = text.match(/^INSERT (?:OR (?:IGNORE|ABORT|FAIL|ROLLBACK|REPLACE) )?INTO ([\w.]+)/i)
  if (rows && created.has(rows[1].toLowerCase())) return null
  const column = text.match(/^ALTER TABLE ([\w.]+) ADD (?:COLUMN )?([\w.]+)(.*)$/i)
  if (column) {
    const [, on, name, rest] = column
    if (/\b(?:PRIMARY KEY|UNIQUE)\b/i.test(rest)) return refused(`it adds the column ${on}.${name} with a key on it`)
    if (!/\bNOT NULL\b/i.test(rest)) return null
    // A generated column has no default, yet SQLite's own test lets it through, so the text must give one.
    if (!/\bDEFAULT\b/i.test(rest)) return refused(`it adds the column ${on}.${name}, which may not be empty and has no default`)
    const refusal = whatSQLiteRefuses(on, statement, earlier)
    return refusal ? refused(`it adds the column ${on}.${name}, which may not be empty, and SQLite refuses a row that leaves it out: ${refusal}`) : null
  }
  const trigger = text.match(/^CREATE (?:TEMP |TEMPORARY )?TRIGGER (?:IF NOT EXISTS )?([\w.]+).*? ON ([\w.]+)/i)
  if (trigger) return refused(`it adds the trigger ${trigger[1]} on the table ${trigger[2]}`, true)
  const deleted = text.match(/^DELETE FROM ([\w.]+)/i)
  if (deleted) return refused(`it deletes rows from the table ${deleted[1]}`, true)
  return refused(`one statement is "${shortened(text)}"`)
}

/** The fields of one entry in the way back's reviewed list. */
export const REVIEWED_MIGRATION_FIELDS = Object.freeze(['migration', 'safeBecause', 'reviewedBy', 'reviewedAt'])
const REVIEWED_AT = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/

/**
 * The reviewed list as the configuration gives it, or [] when it gives none. A list the way back cannot
 * read refuses: it must be an array of entries with only the known fields, each naming one migration
 * file once. What an entry says is read later, by whatAnEntryLacks, when its migration needs it.
 */
export function theReviewedList(value) {
  if (value === undefined) return []
  if (!Array.isArray(value)) fail('reviewedMigrations must be a list of entries.')
  const named = new Set()
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail('Each entry in reviewedMigrations must be an object.')
    const extra = Object.keys(entry).filter((key) => !REVIEWED_MIGRATION_FIELDS.includes(key))
    if (extra.length) fail(`An entry in reviewedMigrations names ${extra.join(', ')}; an entry holds only ${REVIEWED_MIGRATION_FIELDS.join(', ')}.`)
    if (typeof entry.migration !== 'string' || !/^[\w-]+\.sql$/.test(entry.migration)) fail(`An entry in reviewedMigrations names the migration ${JSON.stringify(entry.migration)}; name the file, such as 0001_a_name.sql.`)
    if (named.has(entry.migration)) fail(`reviewedMigrations names ${entry.migration} twice.`)
    named.add(entry.migration)
  }
  return value
}

/** What a reviewed entry lacks, or null when it gives a reason, a reviewer and a time. */
export function whatAnEntryLacks(entry) {
  const said = (value) => typeof value === 'string' && value.trim() !== ''
  const lacks = [
    !said(entry.safeBecause) && 'no reason (safeBecause)',
    !said(entry.reviewedBy) && 'no reviewer (reviewedBy)',
    !(typeof entry.reviewedAt === 'string' && REVIEWED_AT.test(entry.reviewedAt)) && 'no time of review (reviewedAt, as YYYY-MM-DD HH:MM)',
  ].filter(Boolean)
  return lacks.length ? lacks.join(' and ') : null
}

/** The names in the THE_STEPS list of a version's migrate.ts, or null when the list cannot be read. */
export function theStepNames(text) {
  const start = text.indexOf('\nexport const THE_STEPS')
  const end = start < 0 ? -1 : text.indexOf('\n]', start)
  if (end < 0) return null
  const names = [...text.slice(start, end).matchAll(/^ {4}name: '([^'\n]+)',$/gm)].map((m) => m[1])
  return names.length ? names : null
}

/**
 * Whether the previous version `older` may run on the database that `newer` migrated. `git(args)`
 * reads the stable checkout, and `reviewed` is the way back's reviewed list. A version that cannot be
 * read throws; a change that does more than add comes back as `refusal`, naming it, and nothing is
 * changed by reading. `checked` names the migrations that only add, `reviewed` the entries that
 * allowed the others, and `unused` the entries this way back did not need.
 */
export function theWayBackCheck(git, older, newer, reviewed = []) {
  const files = (commit) => new Map(git(['ls-tree', '-r', '-z', commit, '--', THE_MIGRATIONS_PATH]).split('\0').filter(Boolean).map((line) => {
    const tab = line.indexOf('\t')
    return [line.slice(tab + 1), line.slice(0, tab).split(' ')[2]]
  }))
  const migrations = (commit) => {
    const blobs = files(commit)
    const journal = blobs.get(`${THE_MIGRATIONS_PATH}/meta/_journal.json`)
    if (!journal) fail(`The migrations of ${commit} cannot be read: it has no ${THE_MIGRATIONS_PATH}/meta/_journal.json.`)
    let entries
    try { entries = JSON.parse(git(['cat-file', 'blob', journal])).entries } catch (error) { fail(`The migration journal of ${commit} cannot be read: ${error.message}`) }
    if (!Array.isArray(entries) || entries.some((entry) => typeof entry?.tag !== 'string')) fail(`The migration journal of ${commit} does not list its migrations by name.`)
    return entries.map(({ tag }) => {
      const blob = blobs.get(`${THE_MIGRATIONS_PATH}/${tag}.sql`)
      if (!blob) fail(`The migration journal of ${commit} names ${tag}, but its file is not in that version.`)
      return { tag, blob }
    })
  }
  const before = migrations(older), after = migrations(newer)
  const now = new Map(after.map((m) => [m.tag, m.blob]))
  const checked = [], used = []
  const result = (refusal) => ({ checked, reviewed: used, unused: reviewed.filter((entry) => !used.some((u) => u.migration === entry.migration)).map((entry) => entry.migration), refusal })
  for (const { tag, blob } of before) {
    if (!now.has(tag)) return result(`The newer version no longer has the migration ${tag}.`)
    if (now.get(tag) !== blob) return result(`The migration ${tag} differs between the two versions.`)
  }
  const known = new Set(before.map((m) => m.tag)), created = new Set(), earlier = []
  for (const { tag, blob } of after) {
    const statements = git(['cat-file', 'blob', blob]).split(THE_STATEMENT_BREAKPOINT)
    if (known.has(tag)) { earlier.push(...statements); continue }
    const changes = []
    for (const statement of statements) {
      const change = whatAStatementChanges(statement, created, earlier)
      if (change && !change.reviewable) return result(`The migration ${tag} does more than add: ${change.says}. No reviewed list can allow that.`)
      if (change) changes.push(change.says)
      earlier.push(statement)
    }
    if (!changes.length) { checked.push(tag); continue }
    const file = `${tag}.sql`, entry = reviewed.find((e) => e.migration === file), lacks = entry ? whatAnEntryLacks(entry) : null
    if (!entry || lacks) return result(`The migration ${tag} does more than add: ${changes.join('; ')}. Only a migration on the reviewed list may do that, and ${entry ? `its entry there has ${lacks}, so it counts as missing` : `reviewedMigrations does not name ${file}`}.`)
    used.push({ migration: file, changes, safeBecause: entry.safeBecause, reviewedBy: entry.reviewedBy, reviewedAt: entry.reviewedAt })
  }
  const steps = (commit) => theStepNames(git(['show', `${commit}:${THE_STEPS_FILE}`])) ?? fail(`The in-place steps of ${commit} cannot be read from ${THE_STEPS_FILE}.`)
  const had = new Set(steps(older))
  const added = steps(newer).find((name) => !had.has(name))
  if (added) return result(`The newer version adds the in-place step "${added}", which changes rows where they are.`)
  return result(null)
}
