#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COPY OF THE OFFICE'S DATABASE FOR ONE RUN IN A SANDBOX, WITH EVERY KEY AND ADDRESS TAKEN OUT, KEPT
 * COMPRESSED, AND KEPT ONLY AS LONG AS THE RUN.
 *
 *   node tools/office-copy.mjs make --to <sandbox> --for <run>   write <sandbox>/out/office-copy-<run>.db.gz
 *   node tools/office-copy.mjs open --in <sandbox> --for <run>   unpack it to <sandbox>/out/office-copy-<run>.db
 *   node tools/office-copy.mjs sweep                             remove every copy whose run has ended
 *
 * All three take --sandboxes <dir>, the folder the sandboxes are in. The default is the one
 * tools/sandbox.mjs uses, ~/.cache/mole-office/sandboxes.
 *
 * This is the data copy of the basic toolset: report i69HYz8BQhSx, block b-5 item 4, built as the
 * plan's block b-14 says (report KP0udNekYcAo). The secretary made three such copies by hand on
 * 25 September 2026. Vt0GdSlApWce: the copy is kept compressed and unpacked by `open`.
 * Problem iCqnLDtfsGzF added the run it is for, the addresses it clears and its end.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT `make` DOES, IN ORDER
 * ---------------------------------------------------------------------------------------
 *
 *   1. It runs `scripts/backup.ts --database-only` into a folder of its own inside the sandbox's out
 *      folder. That is the office's own backup: `VACUUM INTO` from MOLE_OFFICE_DB, opened read-only,
 *      emptied of NOT_CARRIED_TABLES, cleared of COLUMNS_A_COPY_CLEARS (the visiting agents' token
 *      hashes), searched (and rewritten once when the search still finds a hash), then checked row for
 *      row. Those steps are not written a second time here.
 *   2. It turns the copy's journal mode to DELETE, so opening the unpacked copy leaves no
 *      write-ahead log beside it.
 *   3. It clears the machine names and addresses in the copy, ADDRESSES_A_SANDBOX_COPY_MARKS by the mark
 *      and ADDRESSES_A_SANDBOX_COPY_SETS_TO_NULL to NULL (`clearTheAddresses`). The backup keeps them, so
 *      they are cleared here, in the copy alone, and scripts/backup.ts is not asked to.
 *   4. It writes the marker: one row of the copy's runtime_settings table, named MARKER, whose value
 *      says which run the copy is for, when it was made, by what, what was emptied, and what was
 *      cleared and how.
 *      The office reads that table by a setting's name, or by the prefix of an added role or of a page's
 *      words, so an office started on the copy acts on nothing in the row. An export of the whole of such
 *      an office lists the row among its runtime choices, as it lists every row. A row was chosen over a
 *      table of its own (message fckRl5PVvm9r): tests/schema-inventory.test.ts refuses a new table here,
 *      and a migration would put one in every office.
 *   5. It writes the copy again with `VACUUM INTO`, and the new file takes the copy's place. The clearing
 *      overwrites the old values with SQLite's `secure_delete` on, but over tables as large as `api_calls`
 *      that still leaves some of them in the bytes (21 October 2026: 139 of 3,040 planted addresses), and
 *      `VACUUM INTO` writes only what the copy holds now. It costs one more copy on disk for a moment; the
 *      rewrite with VACUUM it replaces built a second database in the temporary folder and wrote it back
 *      through the journal, two more.
 *   6. It checks the copy again, on its own: SQLite's integrity check, no row in a table a copy must
 *      not carry, every cleared column cleared, the marker naming the run, and the copy's schema the
 *      source's, every table, index, view and trigger by name and SQL. Then it reads every key hash and
 *      token hash the source holds, and looks for each one in the copy's bytes. One found anywhere
 *      stops the copy.
 *   7. It compresses the copy to <sandbox>/out/office-copy-<run>.db.gz, and removes its own folder.
 *
 * A step that fails removes this run's own folder, keeps nothing, and exits 1. The source is only
 * ever read. The hashes are compared in memory and never printed or logged.
 *
 * ---------------------------------------------------------------------------------------
 * A COPY LIVES ONLY AS LONG AS ITS RUN
 * ---------------------------------------------------------------------------------------
 *
 * The run is a session record in the office's own database, the one `settings().databasePath` names,
 * opened read-only. It has ended when its state is one of RUN_IS_OVER_STATES. A run whose record cannot
 * be read is treated as ended: no record has the id, the record is not a run, it was deleted, or the
 * database cannot be opened. `make` makes no copy for a run that has ended, and `open` opens none.
 *
 * THE SWEEP REMOVES A COPY WHOSE RUN HAS ENDED. It runs at the start of every `make` and every `open`,
 * after the refusals below, and as `sweep` on its own. It looks in the out folder of every sandbox in
 * the sandboxes folder. A packed copy's run is the run in its name: reading the marker inside would mean
 * unpacking the whole copy. An unpacked copy's run is the run its marker names, and the marker must agree
 * with the name. A file there with any other name is a copy when it is a database holding the marker, so
 * an unpacked copy renamed by hand is found by its marker. A database there that cannot be opened is
 * left, and the sweep says so, because nothing says it is a copy. A copy named `office-copy.db.gz` or
 * `office-copy.db` was made before a copy named its run, so its run cannot be read, and it is removed.
 * An unpacked copy goes with the write-ahead log, the shared-memory file and the journal beside it. Each
 * removal is written in that sandbox's log.
 *
 * THE REMOVAL IS A SWEEP THE HOST RUNS, AND NOT THE LAUNCHER AT THE RUN'S END. A run ends in ways the
 * launcher never sees: it crashes, it is left orphaned, somebody ends it from its page, or the host
 * restarts. Every end is written on the run's record, and the sweep reads the record. Nothing runs the
 * sweep on a timer, so a copy whose run has ended stays until the next make, open or sweep.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT REFUSES (exit 2)
 * ---------------------------------------------------------------------------------------
 *
 * Before it writes or removes anything:
 *
 *   - `make` or `open` without --for, or with a run id that is not letters, digits, `_` and `-`;
 *   - a sandbox name that is a path, or names a sandbox the host holds no copy of the facts of;
 *   - a sandboxes folder inside this checkout, or inside the home folder but outside
 *     ~/.cache/mole-office;
 *   - an out folder that is missing, or is a link, because then the write would land somewhere else.
 *
 * After the sweep, before it writes anything:
 *
 *   - a run that has ended, or cannot be read;
 *   - `make` when the run's packed copy is already there, and `open` when its unpacked copy is already
 *     there. Neither overwrites. Each says so and stops.
 *
 * `open` also refuses, and removes what it unpacked, when the marker inside does not name the run.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT EACH USE RECORDS
 * ---------------------------------------------------------------------------------------
 *
 * One block appended to <sandbox>/out/office-copy.log, on success and on failure, and the same
 * words printed. After a make or an open that worked, one line on the calling run's record as well:
 * decision Vt0GdSlApWce point d, through POST /api/toolset/uses (writeAUseLine in tools/use-line.mjs),
 * with the slug `data-copy` and the first line of what it did. That line is written only when
 * MOLE_OFFICE_API and MOLE_OFFICE_SESSION are both set, and MOLE_OFFICE_WORKSPACE and
 * MOLE_OFFICE_AGENT with them, because a use is never written in the person's name. The log says
 * whether the line was written, or why not: which variable was not set, or the office's own words.
 * The copy stands either way, and the exit code is the copy's.
 */

import Database from 'better-sqlite3'
import { spawnSync } from 'node:child_process'
import {
  appendFileSync,
  closeSync,
  createReadStream,
  createWriteStream,
  existsSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { createGunzip, createGzip } from 'node:zlib'
import { settings, whyThisCheckoutMayNotOpenTheDatabase } from '../src/config/settings.mjs'
import { stopAnUnpairedStableStart } from '../src/config/the-office-tool-environment.mjs'
import { localStampOf } from '../src/config/stopped-run-cause.mjs'
import { RUN_IS_OVER_STATES } from '../src/config/the-session-note.mjs'
// WHAT A COPY MUST NOT CARRY, AND HOW A COPY'S BYTES ARE SEARCHED, declared once for every program
// that copies the database.
import {
  ADDRESSES_A_SANDBOX_COPY_MARKS,
  ADDRESSES_A_SANDBOX_COPY_SETS_TO_NULL,
  BY_THE_MARK,
  clearTheAddresses,
  COLUMNS_A_COPY_CLEARS,
  hashesFoundInTheBytesOf,
  keyHashesACopyIsSearchedFor,
  NOT_CARRIED_TABLES,
  REMOVED_MARK,
  TO_NULL,
  valuesNotCleared,
  valuesNotSetToNull,
} from '../src/config/what-a-copy-must-not-carry.mjs'
import { INSTANCE_FILE, readHostInstance, SANDBOXES_FOLDER } from './sandbox-common.mjs'
import { theOfficeInThisEnvironment, writeAUseLine } from './use-line.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BACKUP_SCRIPT = join(ROOT, 'scripts', 'backup.ts')
const TSX = join(ROOT, 'node_modules', '.bin', 'tsx')

/** A run's id as the office makes one, so it is safe as part of a file name. */
const A_RUN_ID = /^[A-Za-z0-9_-]{1,64}$/

/** The two files this tool writes into a sandbox's out folder for one run, and the log beside them. */
export const packedFor = (run) => `office-copy-${run}.db.gz`
export const unpackedFor = (run) => `office-copy-${run}.db`
export const LOG = 'office-copy.log'

/** A copy's file name, packed or unpacked, and the run in it. */
const A_COPYS_NAME = /^office-copy-([A-Za-z0-9_-]{1,64})\.db(\.gz)?$/

/** The names a copy had before a copy named its run. */
const BEFORE_A_COPY_NAMED_ITS_RUN = ['office-copy.db.gz', 'office-copy.db']

/** The name of the row of a copy's runtime_settings table that says which run it is for. No setting and no added role uses it. */
export const MARKER = 'office-copy.marker'

/** The first 16 bytes of every SQLite database. */
const A_DATABASES_HEADER = Buffer.from('SQLite format 3\0', 'latin1')

/** What the marker says made the copy. */
const MADE_BY = 'tools/office-copy.mjs'

const ADDRESSES = [...ADDRESSES_A_SANDBOX_COPY_MARKS, ...ADDRESSES_A_SANDBOX_COPY_SETS_TO_NULL].map((c) => `${c.table}.${c.column}`).join(', ')

const HELP = `node tools/office-copy.mjs — a copy of the office database for one run in a sandbox, with every key and address taken out.

  make --to <sandbox> --for <run>   copy MOLE_OFFICE_DB into <sandbox>/out/${packedFor('<run>')}
  open --in <sandbox> --for <run>   unpack it into <sandbox>/out/${unpackedFor('<run>')}
  sweep                             remove every copy whose run has ended

  --sandboxes <dir>                 the folder the sandboxes are in (default ${SANDBOXES_FOLDER})

make empties ${NOT_CARRIED_TABLES.join(', ')}, clears ${COLUMNS_A_COPY_CLEARS.map((c) => `${c.table}.${c.column}`).join(', ')}
and ${ADDRESSES}, rewrites the file so no deleted row is left in it, checks that no key hash of the source
is in it, and writes which run it is for in the row ${MARKER} of its runtime_settings table.
A copy lives only as long as its run. make and open first sweep: they remove every copy whose run has
ended, or whose run cannot be read. Neither makes nor opens a copy for such a run.
Neither command overwrites a file that is already there. Each use is written to <sandbox>/out/${LOG}.

A development checkout whose .env names MOLE_OFFICE_STABLE_CHECKOUT may not open the database that
.env names itself. To make, open or sweep a copy of it, run node tools/office-copy-through-the-stable-checkout.mjs
with the same arguments; that runs the stable checkout's own copy of this tool, paired with this checkout.`

/** Stop before anything is written. Exit 2 says the request was refused, not that a step failed. */
class Refusal extends Error {}

/** Is `inner` the folder `outer` or somewhere inside it? */
function within(inner, outer) {
  const r = relative(outer, inner)
  return r === '' || (!r.startsWith('..') && !isAbsolute(r))
}

function readArguments(argv) {
  const [command, ...rest] = argv
  if (command === undefined || command === '--help' || command === '-h') return { help: true }
  if (command !== 'make' && command !== 'open' && command !== 'sweep') {
    throw new Refusal(`The command is make, open or sweep, and "${command}" is none of them.\n\n${HELP}`)
  }
  const wanted = command === 'make' ? '--to' : command === 'open' ? '--in' : null
  const takes = wanted === null ? ['--sandboxes'] : [wanted, '--for', '--sandboxes']
  let name
  let run
  let sandboxes = SANDBOXES_FOLDER
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    const value = rest[i + 1]
    if (takes.includes(arg)) {
      if (value === undefined || value.startsWith('--')) throw new Refusal(`${arg} needs a value after it. Nothing was written.`)
      if (arg === wanted) name = value
      else if (arg === '--for') run = value
      else sandboxes = value
      i++
    } else {
      const said = wanted === null ? 'only --sandboxes <dir>' : `${wanted} <sandbox>, --for <run> and --sandboxes <dir>`
      throw new Refusal(`${command} takes ${said}, and not "${arg}". Nothing was written.`)
    }
  }
  if (wanted === null) return { command, sandboxes: resolve(sandboxes) }
  if (name === undefined) throw new Refusal(`${command} needs ${wanted} <sandbox>. Nothing was written.`)
  if (run === undefined) {
    throw new Refusal(`${command} needs --for <run>, the id of the run the copy is for. A copy is made for one run and lives only as long as it. Nothing was written.`)
  }
  if (!A_RUN_ID.test(run)) {
    throw new Refusal(`--for takes a run's id, which is letters, digits, _ and -, and "${run}" is not one. Nothing was written.`)
  }
  return { command, name, run, sandboxes: resolve(sandboxes) }
}

/**
 * THE SANDBOXES FOLDER, OR A REFUSAL. A copy is never written into this checkout, nor into the home folder
 * outside ~/.cache/mole-office, and the sweep never removes anything from either.
 */
function theSandboxesFolder(sandboxes) {
  const home = homedir()
  if (within(sandboxes, ROOT)) {
    throw new Refusal(`The sandboxes folder ${sandboxes} is inside this checkout. A copy of the office is never written into the checkout. Nothing was written.`)
  }
  if (within(sandboxes, home) && !within(sandboxes, join(home, '.cache', 'mole-office'))) {
    throw new Refusal(`The sandboxes folder ${sandboxes} is in the home folder and outside ${join(home, '.cache', 'mole-office')}. Nothing was written.`)
  }
  return sandboxes
}

/**
 * THE SANDBOX'S OUT FOLDER, OR A REFUSAL. The only folder this tool writes in.
 *
 * The name is one folder name, never a path, so it cannot climb out of the sandboxes folder. The
 * host must hold a copy of the sandbox's facts (readHostInstance), which `tools/sandbox.mjs up`
 * writes, so a mistyped name is refused rather than made. The copy in the sandbox's folder is not
 * read: a run there can write it. And the out folder must be a real folder, not a link, because a
 * link would carry the write to wherever it points.
 */
function theOutFolder(name, sandboxes) {
  if (name === '' || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
    throw new Refusal(`"${name}" is a path, not a sandbox's name, so the copy would be written outside a sandbox's out folder. Nothing was written.`)
  }
  theSandboxesFolder(sandboxes)
  const dir = join(sandboxes, name)
  if (readHostInstance(dir) === null) {
    throw new Refusal(
      existsSync(join(dir, INSTANCE_FILE))
        ? `The sandbox at ${dir} was made before the host kept its own copy of a sandbox's facts. node tools/sandbox.mjs status ${name} checks the copy in its folder once and keeps it; then ask again. Nothing was written.`
        : `No sandbox is at ${dir}: the host holds no copy of its facts, which tools/sandbox.mjs up writes. Nothing was written.`,
    )
  }
  const out = join(dir, 'out')
  let stat
  try {
    stat = lstatSync(out)
  } catch {
    throw new Refusal(`The sandbox has no out folder at ${out}. Nothing was written.`)
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Refusal(`${out} is ${stat.isSymbolicLink() ? 'a link' : 'not a folder'}, so a write there would land outside the sandbox's out folder. Nothing was written.`)
  }
  return out
}

/** Is anything at this path, a broken link included? */
function somethingIsAt(path) {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}

/** Append one use to the log beside the copy, and print the same words. Answers the first line. */
function record(out, lines) {
  const block = `${localStampOf(new Date())}\n${lines.map((line) => `  ${line}`).join('\n')}\n\n`
  appendFileSync(join(out, LOG), block)
  console.log(lines.join('\n'))
  return lines[0]
}

/** The slug of this tool's entry in the toolset catalogue. */
export const SLUG = 'data-copy'

/**
 * WRITE ONE USE ON THE CALLING RUN, AND SAY IN THE LOG WHETHER IT WAS WRITTEN (writeAUseLine in tools/use-line.mjs).
 * It never changes the exit code: the copy is already made, and a use line that could not be written does not unmake
 * it.
 */
async function writeTheUse(out, firstLine) {
  const { words } = await writeAUseLine({ tool: SLUG, said: firstLine, office: theOfficeInThisEnvironment() })
  appendFileSync(join(out, LOG), `${localStampOf(new Date())}\n  ${words}\n\n`)
  console.log(words)
}

/** How many rows one table holds, or 0 because the table is not there. */
function rowsIn(db, table) {
  const present = db.prepare("SELECT 1 AS one FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)
  if (present === undefined) return 0
  return db.prepare(`SELECT count(*) AS n FROM "${table}"`).get().n
}

/** Megabytes, for a person. */
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

/** SQLite's integrity check, or an error that names what it found. */
function assertIntact(db, what) {
  const integrity = db.pragma('integrity_check')
  if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') {
    throw new Error(`SQLite says ${what} is damaged: ${integrity.map((r) => r.integrity_check).slice(0, 3).join('; ')}`)
  }
}

// ============================================================================ the run a copy is for

/**
 * THE RUN, AS THE OFFICE'S OWN DATABASE HOLDS IT, read-only. Answers `{ over: false }` for a run that may
 * still be going, or `{ over: true, said }`, where `said` finishes the sentence "The run <id> …".
 *
 * `running`, `idle`, `unknown` and no state at all are a run that may still be going, as `theRunHasEnded`
 * in src/server/lib/keys.ts reads them. A run whose record cannot be read is treated as ended.
 */
function theRun(id) {
  const file = settings().databasePath
  const unread = (why) => ({ over: true, said: `cannot be read, so it is treated as ended: ${why}` })
  // THE PAIRING GUARD STANDS BEFORE THE TRY, so a refusal is not read as a run that has ended.
  const pairingRefusal1 = whyThisCheckoutMayNotOpenTheDatabase(file)
  if (pairingRefusal1 !== null) throw new Error(pairingRefusal1)
  let db
  try {
    db = new Database(file, { readonly: true, fileMustExist: true, timeout: 5000 })
  } catch (err) {
    return unread(`the office's database at ${file} could not be opened (${err.message})`)
  }
  try {
    const row = db.prepare('SELECT kind, data, deleted_at AS deletedAt FROM records WHERE id = ?').get(id)
    if (row === undefined) return unread(`no record in the office's database at ${file} has this id`)
    if (row.kind !== 'session') return unread(`its record is a ${String(row.kind)}, not a run`)
    if (row.deletedAt !== null) return unread(`its record was deleted at ${String(row.deletedAt)}`)
    let data
    try {
      data = JSON.parse(String(row.data))
    } catch {
      return unread('its record holds data that is not JSON')
    }
    const state = data?.state
    if (typeof state === 'string' && RUN_IS_OVER_STATES.includes(state)) return { over: true, said: `has ended: its state is ${state}` }
    return { over: false }
  } catch (err) {
    return unread(`the office's database at ${file} could not be read (${err.message})`)
  } finally {
    db.close()
  }
}

/** Is this a file, not a link, that begins as a SQLite database does? */
function aDatabaseFile(path) {
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.size < A_DATABASES_HEADER.length) return false
  const head = Buffer.alloc(A_DATABASES_HEADER.length)
  const fd = openSync(path, 'r')
  try {
    readSync(fd, head, 0, head.length, 0)
  } finally {
    closeSync(fd)
  }
  return head.equals(A_DATABASES_HEADER)
}

/**
 * THE MARKER IN ONE DATABASE, read-only. `{ marker: false }` when the database holds none; `{ marker: true,
 * run }` when it names a run; `{ marker: true, run: null, why }` when it names none; `{ unread: why }` when
 * the database cannot be read, so whether it holds one is not known.
 */
function theMarkerIn(file) {
  // THE PAIRING GUARD STANDS BEFORE THE TRY, so a refusal is not read as a database that could not be read.
  const pairingRefusal2 = whyThisCheckoutMayNotOpenTheDatabase(file)
  if (pairingRefusal2 !== null) throw new Error(pairingRefusal2)
  let row
  try {
    const db = new Database(file, { readonly: true, fileMustExist: true, timeout: 5000 })
    try {
      const table = db.prepare("SELECT 1 AS one FROM sqlite_master WHERE type = 'table' AND name = 'runtime_settings'").get()
      row = table === undefined ? undefined : db.prepare('SELECT value FROM runtime_settings WHERE name = ?').get(MARKER)
    } finally {
      db.close()
    }
  } catch (err) {
    return { unread: err.message }
  }
  if (row === undefined) return { marker: false }
  let said
  try {
    said = JSON.parse(String(row.value))
  } catch {
    return { marker: true, run: null, why: 'its marker is not JSON' }
  }
  const run = said?.forRun
  if (typeof run !== 'string' || !A_RUN_ID.test(run)) return { marker: true, run: null, why: "its marker names no run's id" }
  return { marker: true, run }
}

/**
 * WHICH RUN ONE FILE IN AN OUT FOLDER IS A COPY FOR. Null when the file is not a copy. `{ run }` names the
 * run; `{ run: null, why }` says why its run cannot be read. `byItsMarker` is true for a copy whose name is
 * not a copy's, found by the marker inside it. `{ left }` says why a database whose name is not a copy's
 * could not be read.
 */
function theRunACopyIsFor(out, name) {
  if (BEFORE_A_COPY_NAMED_ITS_RUN.includes(name)) {
    return { run: null, why: 'it was made before a copy named its run' }
  }
  const named = A_COPYS_NAME.exec(name)
  if (named !== null && named[2] !== undefined) return { run: named[1] }
  const file = join(out, name)
  if (named === null && !aDatabaseFile(file)) return null
  const marked = theMarkerIn(file)
  if (named === null) {
    if (marked.unread !== undefined) return { left: `it is a database that could not be read (${marked.unread}), so whether it is a copy is not known` }
    if (!marked.marker) return null
    return marked.run === null ? { run: null, why: marked.why, byItsMarker: true } : { run: marked.run, byItsMarker: true }
  }
  const run = named[1]
  if (marked.unread !== undefined) return { run: null, why: `its marker could not be read (${marked.unread})` }
  if (!marked.marker) return { run: null, why: 'it holds no marker' }
  if (marked.run === null) return { run: null, why: marked.why }
  if (marked.run !== run) return { run: null, why: `its marker names the run ${marked.run}, and its name the run ${run}` }
  return { run }
}

/**
 * REMOVE EVERY COPY WHOSE RUN HAS ENDED, OR CANNOT BE READ, from the out folder of every sandbox in the
 * folder. A link is never followed. Each removal is written in that sandbox's log and printed. Answers
 * how many copies it looked at and the lines it said. A removal that fails throws.
 */
function sweep(sandboxes) {
  /** @type {string[]} */
  const said = []
  let looked = 0
  if (!existsSync(sandboxes)) return { looked, said }
  for (const entry of readdirSync(sandboxes, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const out = join(sandboxes, entry.name, 'out')
    let stat
    try {
      stat = lstatSync(out)
    } catch {
      continue
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) continue
    /** @type {string[]} */
    const removed = []
    /** @type {string[]} */
    const left = []
    for (const name of readdirSync(out).sort()) {
      const copy = theRunACopyIsFor(out, name)
      if (copy === null) continue
      if (copy.left !== undefined) {
        left.push(`sweep: left ${join(out, name)}: ${copy.left}.`)
        continue
      }
      looked++
      const run = copy.run === null ? { over: true, said: `cannot be read, so it is treated as ended: ${copy.why}` } : theRun(copy.run)
      if (!run.over) continue
      const beside = name.endsWith('.gz') ? [] : [`${name}-wal`, `${name}-shm`, `${name}-journal`]
      for (const one of [name, ...beside]) rmSync(join(out, one), { force: true })
      removed.push(
        `sweep: removed ${join(out, name)},${copy.byItsMarker === true ? ' a copy found by its marker,' : ''} because the run it is for${copy.run === null ? '' : `, ${copy.run},`} ${run.said}.`,
      )
    }
    if (removed.length + left.length > 0) {
      record(out, [...removed, ...left])
      said.push(...removed)
    }
  }
  return { looked, said }
}

/** Refuse a run that has ended or cannot be read, naming what the sweep removed for it. */
function refuseARunThatIsOver(run, command, swept) {
  const state = theRun(run)
  if (!state.over) return
  const removed = swept.said.filter((line) => line.includes(`, ${run},`))
  throw new Refusal(
    `The run ${run} ${state.said}. A copy lives only as long as its run, so ${command} ${command === 'make' ? 'makes' : 'opens'} none for it.` +
      (removed.length === 0 ? '' : ` The sweep removed its copy: ${removed.join(' ')}`) +
      ' No copy was written.',
  )
}

// ============================================================================ make and open

/**
 * EVERY TABLE, INDEX, VIEW AND TRIGGER IN A DATABASE, by type, name and SQL. A copy's must equal its
 * source's: a copy that lost its triggers was refused by the office started on it, after two starts
 * (wave 13j, problem mJeksZTpVoUZ).
 */
function theSchemaOf(db) {
  const rows = db.prepare('SELECT type, name, sql FROM sqlite_master ORDER BY type, name').all()
  return new Map(rows.map((row) => [`${String(row.type)} ${String(row.name)}`, row.sql === null ? null : String(row.sql)]))
}

/** Throws, naming the first differences, when the copy's schema is not the source's. */
function assertTheSameSchema(source, copy) {
  const missing = [...source.keys()].filter((key) => !copy.has(key))
  const extra = [...copy.keys()].filter((key) => !source.has(key))
  const changed = [...source.keys()].filter((key) => copy.has(key) && copy.get(key) !== source.get(key))
  if (missing.length + extra.length + changed.length === 0) return
  const some = (what, keys) => (keys.length === 0 ? [] : [`${what} ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? ', …' : ''}`])
  throw new Error(
    `the copy's schema is not the source's: ${[...some('missing', missing), ...some('not in the source', extra), ...some('with other SQL', changed)].join('; ')}`,
  )
}

/** The text written for a missing or blank variable of the environment: NULL, because nobody named one. */
const orNull = (value) => (typeof value === 'string' && value.trim() !== '' ? value : null)

async function make(out, name, run, swept) {
  const packed = join(out, packedFor(run))
  if (somethingIsAt(packed)) {
    throw new Refusal(`${packed} is already there. make never overwrites a copy. Nothing was written.`)
  }
  const work = mkdtempSync(join(out, '.office-copy-'))
  const copy = join(work, unpackedFor(run))
  try {
    // 1. THE OFFICE'S OWN BACKUP, of the database alone.
    const backup = spawnSync(TSX, [BACKUP_SCRIPT, '--to', copy, '--database-only', '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: process.env,
      maxBuffer: 64 * 1024 * 1024,
    })
    if (backup.status !== 0) {
      throw new Error(`the backup of the database failed (exit ${String(backup.status)}): ${(backup.stderr || backup.stdout).trim()}`)
    }
    const said = JSON.parse(backup.stdout)
    const source = String(said.from)

    // WHAT THE BACKUP CLEARED, as it said it, and how: every copy clears those columns by the mark. The
    // backup clears them in the same step as the emptying, before its rewrite; the check below reads the
    // copy for itself.
    const clearedSaid = /** @type {Record<string, { how: string, rows: number }>} */ ({})
    for (const [where, rows] of Object.entries(said.cleared ?? {})) clearedSaid[where] = { how: BY_THE_MARK, rows: Number(rows) }

    // 2. THE COPY LEAVES WAL MODE. A backup keeps the source's journal mode, and a database in WAL mode
    // writes a write-ahead log and a shared-memory file beside itself whenever it is opened, even
    // read-only. The unpacked copy sits in a sandbox's out folder, where those two files would be
    // left beside it.
    // 3. THE ADDRESSES, cleared in this copy alone.
    // 4. THE MARKER: a new row leaves nothing deleted behind it. A source that
    // already holds a marker is itself a copy, and the insert fails on the row's name.
    const pairingRefusal3 = whyThisCheckoutMayNotOpenTheDatabase(copy)
    if (pairingRefusal3 !== null) throw new Error(pairingRefusal3)
    const toChange = new Database(copy, { fileMustExist: true })
    try {
      toChange.pragma('journal_mode = DELETE')
      for (const one of clearTheAddresses(toChange)) clearedSaid[`${one.table}.${one.column}`] = { how: one.how, rows: one.rows }
      const office = theOfficeInThisEnvironment()
      const marker = {
        madeBy: MADE_BY,
        forRun: run,
        madeAt: localStampOf(new Date()),
        madeByAgent: orNull(office.agent),
        madeByRun: orNull(office.session),
        emptied: NOT_CARRIED_TABLES,
        cleared: clearedSaid,
      }
      toChange.prepare('INSERT INTO runtime_settings (name, value) VALUES (?, ?)').run(MARKER, JSON.stringify(marker))
      // 5. THE COPY WRITTEN AGAIN with VACUUM INTO, so none of the old values is left in its bytes; the new
      // file takes the copy's place below, once this handle is closed.
      toChange.prepare('VACUUM INTO ?').run(`${copy}.rewritten`)
    } finally {
      toChange.close()
    }
    renameSync(`${copy}.rewritten`, copy)
    const cleared = Object.entries(clearedSaid).map(([where, { how, rows }]) => `${where} (${String(rows)} row${rows === 1 ? '' : 's'}, ${how})`)

    // 6. CHECK THE COPY, AND LOOK FOR EVERY HASH OF THE SOURCE IN ITS BYTES.
    const pairingRefusal4 = whyThisCheckoutMayNotOpenTheDatabase(source)
    if (pairingRefusal4 !== null) throw new Error(pairingRefusal4)
    const original = new Database(source, { readonly: true, fileMustExist: true })
    let hashes
    let sourceSchema
    try {
      hashes = keyHashesACopyIsSearchedFor(original)
      sourceSchema = theSchemaOf(original)
    } finally {
      original.close()
    }
    const pairingRefusal5 = whyThisCheckoutMayNotOpenTheDatabase(copy)
    if (pairingRefusal5 !== null) throw new Error(pairingRefusal5)
    const check = new Database(copy, { readonly: true, fileMustExist: true })
    let triggers
    try {
      assertIntact(check, 'the copy')
      for (const table of NOT_CARRIED_TABLES) {
        const rows = rowsIn(check, table)
        if (rows > 0) throw new Error(`the copy still holds ${String(rows)} row${rows === 1 ? '' : 's'} in ${table}`)
      }
      for (const [columns, left] of /** @type {const} */ ([
        [COLUMNS_A_COPY_CLEARS, valuesNotCleared(check, COLUMNS_A_COPY_CLEARS)],
        [ADDRESSES_A_SANDBOX_COPY_MARKS, valuesNotCleared(check, ADDRESSES_A_SANDBOX_COPY_MARKS)],
        [ADDRESSES_A_SANDBOX_COPY_SETS_TO_NULL, valuesNotSetToNull(check, ADDRESSES_A_SANDBOX_COPY_SETS_TO_NULL)],
      ])) {
        if (left > 0) {
          const where = columns.map((c) => `${c.table}.${c.column}`).join(', ')
          throw new Error(`the copy still holds ${String(left)} value${left === 1 ? '' : 's'} in ${where}`)
        }
      }
      const marked = theMarkerIn(copy)
      if (marked.run !== run) {
        throw new Error(`the copy's marker does not name the run ${run}: ${marked.unread ?? marked.why ?? (marked.marker ? `it names ${marked.run}` : 'there is none')}`)
      }
      const schema = theSchemaOf(check)
      assertTheSameSchema(sourceSchema, schema)
      triggers = [...schema.keys()].filter((key) => key.startsWith('trigger ')).length
    } finally {
      check.close()
    }
    const left = hashesFoundInTheBytesOf(copy, hashes)
    if (left > 0) {
      throw new Error(`${String(left)} of the source's ${String(hashes.size)} key and token hashes are still in the copy's bytes`)
    }

    // 7. COMPRESS, AND PUT IT IN PLACE WITHOUT OVERWRITING. A link fails when the name is taken.
    const partial = join(work, packedFor(run))
    await pipeline(createReadStream(copy), createGzip(), createWriteStream(partial, { flags: 'wx' }))
    const unpackedBytes = statSync(copy).size
    const packedBytes = statSync(partial).size
    try {
      linkSync(partial, packed)
    } catch (err) {
      if (err.code === 'EEXIST') throw new Refusal(`${packed} appeared while this copy was made. make never overwrites a copy. Nothing was kept.`)
      throw err
    }
    rmSync(work, { recursive: true, force: true })
    return record(out, [
      `make: copied ${source}`,
      `  to ${packed}`,
      `  for the run ${run}. The row ${MARKER} of the copy's runtime_settings says so, and the copy is removed once the run has ended.`,
      `  ${mb(unpackedBytes)} before compression, ${mb(packedBytes)} after.`,
      `  Emptied: ${NOT_CARRIED_TABLES.join(', ')}. Cleared: ${cleared.length === 0 ? 'nothing, because no such table is in this database' : cleared.join(', ')}.`,
      `  ${BY_THE_MARK}: each value is replaced by "${REMOVED_MARK}" and the row's id. ${TO_NULL}: each value is set to NULL.`,
      `  The machine names and addresses in ${ADDRESSES} are cleared in this copy only. The office's own backups keep them.`,
      `  The file was written again with VACUUM INTO after its addresses were cleared, and none of the source's ${String(hashes.size)} key and token hashes is in it.`,
      `  Its schema is the source's: every table, index, view and trigger (${String(triggers)} trigger${triggers === 1 ? '' : 's'}), by name and SQL.`,
      ...(swept.said.length === 0 ? [] : [`  The sweep before it removed ${String(swept.said.length)} cop${swept.said.length === 1 ? 'y' : 'ies'} whose run had ended.`]),
      `  Unpack it with: node tools/office-copy.mjs open --in ${name} --for ${run}`,
    ])
  } catch (err) {
    rmSync(work, { recursive: true, force: true })
    throw err
  }
}

async function open(out, run, swept) {
  const packed = join(out, packedFor(run))
  const unpacked = join(out, unpackedFor(run))
  if (!existsSync(packed)) {
    throw new Refusal(`There is no ${packed} to open. make writes it. Nothing was written.`)
  }
  for (const beside of [unpacked, `${unpacked}-wal`, `${unpacked}-shm`]) {
    if (somethingIsAt(beside)) {
      throw new Refusal(`${beside} is already there. open never overwrites an unpacked copy. Nothing was written.`)
    }
  }
  // `wx` fails if the name was taken since the check above, so this never overwrites either.
  try {
    await pipeline(createReadStream(packed), createGunzip(), createWriteStream(unpacked, { flags: 'wx' }))
    const pairingRefusal6 = whyThisCheckoutMayNotOpenTheDatabase(unpacked)
    if (pairingRefusal6 !== null) throw new Error(pairingRefusal6)
    const check = new Database(unpacked, { readonly: true, fileMustExist: true })
    try {
      assertIntact(check, 'the unpacked copy')
      for (const table of NOT_CARRIED_TABLES) {
        const rows = rowsIn(check, table)
        if (rows > 0) throw new Error(`the unpacked copy holds ${String(rows)} row${rows === 1 ? '' : 's'} in ${table}`)
      }
    } finally {
      check.close()
    }
    const marked = theRunACopyIsFor(out, unpackedFor(run))
    if (marked?.run !== run) {
      throw new Refusal(`${packed} is not a copy for the run ${run}: ${marked?.why ?? 'it has no marker'}. What was unpacked was removed.`)
    }
  } catch (err) {
    if (err?.code !== 'EEXIST') rmSync(unpacked, { force: true })
    throw err
  }
  return record(out, [
    `open: unpacked ${packed}`,
    `  to ${unpacked}, ${mb(statSync(unpacked).size)}, for the run ${run}. SQLite's integrity check passes.`,
    ...(swept.said.length === 0 ? [] : [`  The sweep before it removed ${String(swept.said.length)} cop${swept.said.length === 1 ? 'y' : 'ies'} whose run had ended.`]),
  ])
}

async function main() {
  let out
  let command
  try {
    const parsed = readArguments(process.argv.slice(2))
    if (parsed.help) {
      console.log(HELP)
      return
    }
    command = parsed.command
    const pairingRefusal = whyThisCheckoutMayNotOpenTheDatabase(settings().databasePath)
    if (pairingRefusal !== null) {
      throw new Error(`${pairingRefusal} To make, open or sweep a copy of that database, run node tools/office-copy-through-the-stable-checkout.mjs with the same arguments.`)
    }
    if (command === 'sweep') {
      const swept = sweep(theSandboxesFolder(parsed.sandboxes))
      console.log(
        `sweep: looked at ${String(swept.looked)} cop${swept.looked === 1 ? 'y' : 'ies'} in ${parsed.sandboxes}, and removed ${String(swept.said.length)}, whose run had ended or could not be read.`,
      )
      return
    }
    out = theOutFolder(parsed.name, parsed.sandboxes)
    const swept = sweep(parsed.sandboxes)
    refuseARunThatIsOver(parsed.run, command, swept)
    const firstLine = command === 'make' ? await make(out, parsed.name, parsed.run, swept) : await open(out, parsed.run, swept)
    await writeTheUse(out, firstLine)
  } catch (err) {
    const refused = err instanceof Refusal
    const words = `${command ?? 'office-copy'}: ${refused ? 'refused' : 'FAILED, and nothing was kept'}: ${err.message}`
    if (out !== undefined) appendFileSync(join(out, LOG), `${localStampOf(new Date())}\n  ${words}\n\n`)
    console.error(words)
    process.exitCode = refused ? 2 : 1
  }
}

// THE START CHECK (wave 13q), before the arguments are read: a stable checkout at a dated stable tag started without the
// pairing would read its own defaults.
stopAnUnpairedStableStart()
await main()
