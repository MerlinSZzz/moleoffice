#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * START A MOLE OFFICE OF YOUR OWN, ON A COPY OF THE CORPUS, SO YOUR TESTING CANNOT TOUCH THE REAL ONE.
 *
 * Several people test this product at once — a first-time user trying to plan a week, an agent
 * checking a claim, a browser review taking pictures. Each of them needs a running Mole Office and none
 * of them may write into the corpus the owner reads. Before this tool every one of them wrote its
 * own copy of the same forty lines, and the copies disagreed about which port was free, whether the
 * child was its own process group, and whether anything checked that the ports came back.
 *
 * WHAT IT DOES
 *
 *   node tools/isolated-mole-office.mjs start <name>     copies the database, picks two free ports,
 *                                                   starts the API and the browser app, waits until
 *                                                   both answer, and prints where they are.
 *   node tools/isolated-mole-office.mjs start <name> --from <db>
 *                                                   the same, from a database file you name — a
 *                                                   backup, an archive, an old copy — instead of
 *                                                   the live corpus.
 *   node tools/isolated-mole-office.mjs stop <name>      stops them by process GROUP and proves the
 *                                                   ports came back before it says so.
 *   node tools/isolated-mole-office.mjs list             every instance this tool believes is running.
 *
 * WHY `--from` EXISTS. A backup nobody has restored is a promise, not a backup. Until this argument
 * existed the only way to read one was to copy it over data/panelx.db — over the owner's corpus, the
 * one file this whole tool is built to keep hands off — and `npm run db:backup -- --check-only`
 * verifies a file without ever serving one, so nobody could see whether a person could actually read
 * the work back. `--from` serves it, on a copy, on its own ports, and deletes the copy on `stop`.
 *
 * IT IS NOT A WAY ROUND ANY OF THE PROTECTIONS BELOW, and that is the point of it. The file named is
 * a SOURCE to copy from, never a file to serve in place; the copy still lands inside
 * .logs/isolated/<name>/ and nothing is ever written back to it; the copy is still verified and is
 * still DELETED if it cannot be; and naming the live database is refused outright.
 *
 * Everything for one instance lives in .logs/isolated/<name>/ — the database copy, the two log
 * files, and one small file recording the ports and the process group. Nothing is written anywhere
 * else, and `stop` deletes the directory. In a git worktree .logs/isolated is a link to a folder of
 * its own beside the checkout, because an office will not write its data inside a worktree
 * (theWorldsFolderIn, problem 54K4oDbsvsZT).
 *
 * WHY IT KILLS BY GROUP. `npm run dev` and `tsx watch` both start children, so killing the pid you
 * were handed leaves the real server running and holding the port. Five orphaned-process incidents
 * in this project came from exactly that, and one of them served a deleted database into a
 * diagnosis somebody then worked from for an afternoon.
 *
 * WHY IT REFUSES TO POINT AT THE LIVE DATABASE. A copy is the whole point. If the copy cannot be
 * made, it stops rather than falling back to the original — a test that quietly ran against the
 * real corpus is worse than a test that did not run. `--from data/panelx.db` is refused by name for
 * the same reason: the live corpus is what a plain `start` already copies, so asking for it by path
 * is either a mistake or somebody talking the tool into serving the file itself.
 *
 * WHY THE COPY IS VERIFIED AND DELETED WHEN IT FAILS. A source named with `--from` is a file nobody
 * has opened — that is what a backup is — so the copy of it gets SQLite's integrity check, a check
 * that it holds Mole Office's own `records` table, and a row count per table compared against the source.
 * A copy that fails any of those is removed along with the instance directory, because a database
 * left lying in .logs/isolated/<name>/ is a file somebody will start a server against later and
 * whatever this run printed will be long gone. `scripts/backup.ts` deletes a failed copy for exactly
 * this reason and this is the same rule.
 *
 * WHY THE COPY IS MADE BY SQLITE AND NOT BY `cp`. Mole Office's database runs in WAL mode, which means
 * rows that are committed can still be sitting in `panelx.db-wal` rather than in `panelx.db`.
 * Copying the one file gets whatever the last checkpoint left behind — an older corpus, silently —
 * and a copy taken while somebody is writing can be a torn page. `VACUUM INTO` reads through the
 * write-ahead log and writes one consistent database, and the row counts of both are printed so a
 * complete copy is something you can see rather than something this comment claims.
 */

import { whyThisCheckoutMayNotOpenTheDatabase } from '../src/config/settings.mjs'
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { existsSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, readlinkSync, rmdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { apiAddressForThisProcess, theEnvironmentsAddressIsForAnotherCopy, canonicalDatabasePath, workspaceFrom, addressesForOtherMachines, settingValue } from '../src/config/settings.mjs'
// ONE STAMP FOR A ROW THIS TOOL CLOSES, from the same place every other close in the product reads
// it. Criterion M94's module already declares "what a person reads" timestamps, so a second
// spelling here would be the same fact worked out twice.
import { localStampOf } from '../src/config/stopped-run-cause.mjs'
// THE STATES IN WHICH A RUN IS STILL GOING, listed once for every reader.
import { saysStillGoing } from '../src/config/still-going.mjs'
import { fetchAFullList } from './a-full-list-read.mjs'
// WHICH TABLES A COPY IS EMPTIED OF, AND HOW IT IS EMPTIED AND SEARCHED, declared once for every program
// that copies the database.
import { emptyAndScrub, hashesLeftAfterAtMostOneRewrite, keyHashesACopyIsSearchedFor } from '../src/config/what-a-copy-must-not-carry.mjs'
// WHO THIS TOOL ASKS AS, AND THE KEY THAT PROVES IT, built by the one helper every agent's tool uses
// . With MOLE_AGENT_KEY set it sends the key under the caller's own handle;
// without one it sends the name it always sent.
import { anAgentsToolHeaders, theAgentKey, whyAPathIsTheStableCheckout } from './sandbox-common.mjs'
// WHERE NO WORLD KEEPS ITS BROWSER APP'S CACHE: as, in or around the stable checkout or the office's data folder, asked
// as the sandbox launcher asks them for a mount. Vite writes in that folder and deletes its own stale folders there.
import { whyAPathIsTheOfficesDataFolder } from './the-offices-data-folder.mjs'
// THE IDENTITY OF THE COPY, worked out by the same function the world's own server uses, so the row
// this tool registers at the office and the row the world registers later are one row.
import { databaseIdentity } from '../src/config/database-identity.mjs'
// WHETHER A LIVE WORLD HOLDS WHAT A STOP WOULD FREE, asked and judged in the one module db:reset asks
// through too.
import { askWhatHoldsIt } from './what-holds-it.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
/**
 * WHETHER THIS FILE WAS RUN, AS OPPOSED TO IMPORTED.
 *
 * `tests/a-worlds-copy-carries-no-key-hashes.test.ts` imports `copyDatabase` below to make a copy
 * and read the copy's table without starting two servers. Without this guard the import would parse
 * `process.argv` as a command and call `process.exit`, which inside a test runner ends the run.
 * `tools/stray-servers.mjs` carries the same guard for the same reason.
 */
const RUN_AS_A_COMMAND = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
const HOME = join(ROOT, '.logs', 'isolated')

/**
 * WHETHER `root` IS A LINKED GIT WORKTREE: its `.git` is a file naming a gitdir that carries a `commondir`, the main
 * clone's. The same reading as gitDirsOf in src/server/lib/git-checkout.ts, which this file, run by a plain `node`,
 * cannot import. A main clone, or no checkout at all, is not one.
 * @param {string} root
 */
function aLinkedWorktree(root) {
  try {
    const dot = join(root, '.git')
    if (!lstatSync(dot).isFile()) return false
    const said = readFileSync(dot, 'utf8').trim()
    if (!said.startsWith('gitdir:')) return false
    return existsSync(join(resolve(root, said.slice('gitdir:'.length).trim()), 'commondir'))
  } catch {
    return false
  }
}

/**
 * WHERE A CHECKOUT'S WORLDS GO, made ready for a start: `<root>/.logs/isolated`, which in a linked git worktree is a link
 * to a folder of its own outside the checkout (problem 54K4oDbsvsZT). Since cf998d4 an office refuses a database or a
 * key file inside a git worktree (problem nd7jOk5LCU4s), and it reads the folder through links, so a world started from
 * a worktree was refused while its copy was migrated, and six tests that start a world failed there. Through the link
 * every reader of `<checkout>/.logs/isolated/<name>/` (this tool, the office's list of worlds, the tests) reads the
 * same path as before, and what is written lands outside the checkout.
 *
 * THE FOLDER IS BESIDE THE WORKTREE, `<its parent>/.<its name>.worlds`, mode 700: a path the host and a sandbox's
 * container see alike, because a sandbox's folder is mounted at the same path in both. The office runs on the host and
 * reads a sandbox worktree's worlds through this link, so a folder in one side's own /tmp would be a link to nothing on
 * the other. A link whose folder is gone gets its folder again; a link to anywhere else is replaced. A real folder that
 * holds something is left as it is, and the answer says so: its worlds were started before this, and are stopped and
 * the folder removed by hand. A main clone is answered as before, with no link.
 *
 * Answers `{ folder, said }`: the folder to use, and one sentence when there is something to say, or null.
 * @param {string} root the checkout
 * @returns {{ folder: string, said: string | null }}
 */
function theWorldsFolderIn(root) {
  const folder = join(root, '.logs', 'isolated')
  if (!aLinkedWorktree(root)) return { folder, said: null }
  const outside = join(dirname(root), `.${basename(root)}.worlds`)
  /** @type {import('node:fs').Stats | null} */
  let held = null
  try {
    held = lstatSync(folder)
  } catch {
    held = null
  }
  if (held !== null && held.isSymbolicLink() && readlinkSync(folder) === outside) {
    mkdirSync(outside, { recursive: true, mode: 0o700 })
    return { folder, said: null }
  }
  if (held !== null && !held.isSymbolicLink()) {
    if (readdirSync(folder).length > 0) {
      return {
        folder,
        said:
          `${folder} is a folder inside the git worktree ${root}, and it already holds worlds started before their ` +
          'data was kept outside a worktree; an office refuses a database there. Stop those worlds and remove the ' +
          'folder, and the next start keeps its world outside the checkout.',
      }
    }
    rmdirSync(folder)
  } else if (held !== null) {
    unlinkSync(folder)
  }
  mkdirSync(outside, { recursive: true, mode: 0o700 })
  mkdirSync(dirname(folder), { recursive: true })
  try {
    symlinkSync(outside, folder, 'dir')
  } catch (error) {
    // ANOTHER START MADE THE SAME LINK FIRST.
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'EEXIST') throw error
  }
  return { folder, said: null }
}
// The database this checkout calls canonical, read from the declaration rather than spelled here.
// It used to be `join(ROOT, 'data', 'panelx.db')`, which is the declaration's default written a
// second time, free to disagree with it the day somebody set MOLE_OFFICE_DB. Criterion G1.
const LIVE_DB = canonicalDatabasePath()

/** How long to wait for each service to answer before giving up and saying what it printed. */
const READY_MS = 90_000
const INHERITED_DELIVERIES_FILE = 'inherited-deliveries.json'
/** How long a stopped process group gets before SIGKILL. */
const GRACE_MS = 5_000

/**
 * WHERE THE OWNER'S OWN MOLE OFFICE IS, read from the environment this checkout is configured with.
 *
 * It is the one this tool writes a world down in, and it is NOT the world it just started — a world
 * that registered itself in itself would vanish with the copy it was written into. `.env` names
 * MOLE_OFFICE_API; nothing derives it from MOLE_OFFICE_PORT, and .env.example says so at line 70.
 */
function theApi() {
  // `apiAddressForThisProcess`, NOT `whereIsTheApi`. Both answer this question from the same
  // declaration, but this one carries the rule that a real MOLE_OFFICE_PORT set in the environment
  // beats a MOLE_OFFICE_API written in the file. Problem f1uCdpMEB1hs is what that rule fixed: a
  // test's or a worktree's stack registered with the owner's live API. `whereIsTheApi` does not
  // carry it, so switching would put a fixed defect back to tidy a call site.
  // It asks the one reader's question first (problem JQ3yaANBi1JC): in a sandbox shell only the sandbox's own checkouts
  // take the environment's address. --api, read before this is asked, always wins.
  const refused = theEnvironmentsAddressIsForAnotherCopy(process.env)
  if (refused !== null) die(refused)
  return apiAddressForThisProcess().replace(/\/+$/, '')
}

/**
 * THE IDENTITY HEADERS OF A REQUEST THIS TOOL MAKES TO THE OFFICE. `withoutAKey` is the name the
 * request went under before keys, which is what it still goes under when this process holds no key.
 */
function asTheStarter(withoutAKey) {
  const agent = settingValue('MOLE_OFFICE_AGENT')
  return anAgentsToolHeaders({ self: agent, withoutAKey })
}

/** The name the tool's own writes went under before keys: the agent it runs for, or the tool. */
function theNameWithoutAKey() {
  return settingValue('MOLE_OFFICE_AGENT') ?? 'tools/isolated-mole-office.mjs'
}

function die(message) {
  process.stderr.write(message + '\n')
  process.exit(1)
}

function placeFor(name) {
  if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(name)) {
    die('A name is lower-case letters, digits and dashes, up to 41 characters. "' + name + '" is not.')
  }
  return join(HOME, name)
}

async function freePort() {
  return await new Promise((ok, bad) => {
    const probe = createServer()
    probe.on('error', bad)
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port
      probe.close(() => ok(port))
    })
  })
}

async function portIsFree(port) {
  return await new Promise((ok) => {
    const probe = createServer()
    probe.on('error', () => ok(false))
    probe.listen(port, '127.0.0.1', () => probe.close(() => ok(true)))
  })
}

async function answers(url, withinMs) {
  try {
    const reply = await fetch(url, { signal: AbortSignal.timeout(withinMs) })
    return reply.ok || reply.status === 404
  } catch {
    return false
  }
}

// Problem e-ZODNdmOYhE, wave 13t message JDCiM_ApIIZh: the starter must clean up
// after a readiness failure; exiting here used to abandon detached servers.
async function waitUntil(url, what, logPath, readyMs = READY_MS) {
  const until = Date.now() + readyMs
  while (Date.now() < until) {
    if (await answers(url, Math.min(4_294_967_295, Math.max(1, until - Date.now())))) return
    await new Promise((ok) => setTimeout(ok, Math.min(250, Math.max(0, until - Date.now()))))
  }
  const said = existsSync(logPath) ? readFileSync(logPath, 'utf8').split('\n').slice(-30).join('\n') : '(nothing was written to its log)'
  throw new Error(what + ' did not answer at ' + url + ' within ' + String(readyMs / 1000) + ' seconds. Its last words:\n' + said)
}

/** Every table in an open database with the number of rows in it. */
function tableCounts(db) {
  const tables = db
    .prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name")
    .all()
  const counts = new Map()
  for (const { name } of tables) {
    // The name came out of sqlite_master, so it is an existing identifier rather than input. Quoted
    // anyway, because a table called `order` would be a syntax error rather than a count.
    counts.set(name, db.prepare('select count(*) as n from "' + name + '"').get().n)
  }
  return counts
}

/**
 * Copy `from` into `to`, through SQLite, and prove the copy is a Mole Office database holding the same
 * rows. Returns the row counts of both. On failure the copy is DELETED and nothing is returned.
 *
 * WHY THE SOURCE IS COUNTED ON BOTH SIDES OF THE COPY. The live corpus is served by a running server
 * and may be written to while this runs, in which case a snapshot taken somewhere in the middle is
 * correct and every count in it lands between the two readings. Comparing against one reading only
 * reports a false failure on a busy database, which is the moment somebody most needs to believe the
 * answer. A file named with `--from` is not being written to, so there both readings are equal and
 * the comparison is exact.
 *
 * A DIFFERENCE INSIDE THAT RANGE IS REPORTED, NOT TREATED AS CORRUPTION, and `start` prints it.
 */
async function copyDatabase(from, to) {
  const destinationRefusal = whyThisCheckoutMayNotOpenTheDatabase(to)
  if (destinationRefusal !== null) throw new Error(destinationRefusal)
  const { default: Database } = await import('better-sqlite3')
  let source = null
  let before
  let after
  // THE KEY HASHES THE COPY IS SEARCHED FOR, read on both sides of the copy like the counts, the
  // visitors' token hashes among them, because the copy clears those too. They stay in memory, and
  // only their number is ever said.
  const keyHashes = new Set()
  try {
    // OPENING PROVES NOTHING. SQLite reads the header on the first QUERY, not on the open, so a
    // `--from` naming a text file gets a handle back and throws `file is not a database` one line
    // later. Both are inside this block for that reason — it was found by the test below going red.
    const pairingRefusal1 = whyThisCheckoutMayNotOpenTheDatabase(from)
    if (pairingRefusal1 !== null) throw new Error(pairingRefusal1)
    source = new Database(from, { readonly: true, fileMustExist: true })
    before = tableCounts(source)
    // MOLE OFFICE'S OWN MARK. A file that opens cleanly and holds a stranger's tables is not this
    // product's database, and the likeliest cause is a `--from` pointing at the wrong file.
    if (!before.has('records')) {
      return {
        problems: [
          from + ' has no `records` table, so it is not a Mole Office database. It holds ' +
            String(before.size) + ' table' + (before.size === 1 ? '' : 's') +
            (before.size === 0 ? '.' : ': ' + [...before.keys()].slice(0, 8).join(', ')),
        ],
      }
    }
    keyHashesACopyIsSearchedFor(source, keyHashes)
    source.prepare('VACUUM INTO ?').run(to)
    after = tableCounts(source)
    keyHashesACopyIsSearchedFor(source, keyHashes)
  } catch (err) {
    // A `--from` naming a text file, a directory or a half-written download lands here. Said as a
    // sentence rather than as a stack trace out of node_modules, because the operator's next move is
    // to look at the file and a stack trace does not tell them which one.
    return { problems: [from + ' could not be opened as a database: ' + String(err.message)] }
  } finally {
    if (source !== null) source.close()
  }

  const problems = []
  const pairingRefusal2 = whyThisCheckoutMayNotOpenTheDatabase(to)
  if (pairingRefusal2 !== null) throw new Error(pairingRefusal2)
  const copy = new Database(to, { readonly: true, fileMustExist: true })
  let copied
  try {
    // The check can THROW rather than answer, on a file damaged badly enough that SQLite cannot walk
    // it. Catching it is the difference between "SQLite says it is damaged" and a stack trace.
    try {
      const check = copy.pragma('integrity_check')
      if (check.length !== 1 || check[0]?.integrity_check !== 'ok') {
        problems.push('SQLite says the copy is DAMAGED: ' + check.map((r) => r.integrity_check).slice(0, 3).join('; '))
      }
    } catch (err) {
      problems.push('SQLite could not even finish checking the copy: ' + String(err.message))
    }
    copied = tableCounts(copy)
  } finally {
    copy.close()
  }
  if (!copied.has('records')) problems.push('the copy has no `records` table')

  const moved = []
  for (const table of new Set([...before.keys(), ...after.keys(), ...copied.keys()])) {
    const lo = Math.min(before.get(table) ?? 0, after.get(table) ?? 0)
    const hi = Math.max(before.get(table) ?? 0, after.get(table) ?? 0)
    const got = copied.get(table)
    if (got === undefined) problems.push('the copy has no `' + table + '` table and the source has one')
    else if (got < lo || got > hi) {
      problems.push('`' + table + '`: the copy holds ' + String(got) + ' rows, the source held ' + (lo === hi ? String(lo) : String(lo) + '–' + String(hi)))
    } else if (lo !== hi) moved.push(table + ' ' + String(lo) + '→' + String(hi))
  }

  if (problems.length > 0) {
    rmSync(to, { force: true })
    rmSync(to + '-wal', { force: true })
    rmSync(to + '-shm', { force: true })
    return { problems }
  }

  /**
   * THE COPY CARRIES NONE OF THE OFFICE'S KEY HASHES. Criterion P84's last clause, the copy-time
   * half, on problem `FmGa9AOxfaw1`.
   *
   * ---------------------------------------------------------------------------------------
   * WHY A COPY MUST BE EMPTIED
   * ---------------------------------------------------------------------------------------
   *
   * A world is one `VACUUM INTO` of the office's database, so before this every table came with it,
   * `held_keys` included. In a world, `howThisRequestProvedItself` (src/server/lib/keys.ts) reads
   * that copied table, so every agent key the office ever made proved that agent inside every world,
   * and a copied person's-device key made its holder THE PERSON there — a device the person paired,
   * or already ENDED, with no way to take it back from inside the world. Emptied here, a copied key
   * proves nothing in a world no matter what any later gate says, and the two halves of P84 leave no
   * gap: the proof-time gate covers the worlds already on disk, this covers every world made from now.
   *
   * NOTHING IS RE-INSERTED. The world still mints its own `person` and `office` keys at server start
   * (`ensureKeysExist`, src/server/index.ts) beside its own database; the office's key file is never
   * copied, and `keys.json` is not written here. A world's starter and secretary keep the owner's
   * authority by NAME, through the two settings the tool passes into the world's environment.
   *
   * ---------------------------------------------------------------------------------------
   * THE ONLY CONNECTION IT RUNS ON IS THE COPY'S, AND WHY IT CANNOT ADDRESS THE OFFICE
   * ---------------------------------------------------------------------------------------
   *
   * The handle below is `new Database(to, ...)` — `to` is the copy path this function was asked to
   * write, which `start` passes as `join(place, 'copy.db')` under `.logs/isolated/<name>/`. It is a
   * SECOND connection, opened on that path, and the emptying is handed `to` and never `from`. The
   * `source` handle above is a different file opened `readonly: true`, and `sourceFor` refuses the
   * live corpus by path before any of this runs, so a statement here cannot be aimed at the office.
   * The test below proves it: after the copy, the office still holds every row and a key that worked
   * there still does. The order is deliberate — the copy is verified first, so the row counts it
   * checks are the ones `VACUUM INTO` really wrote; only a verified copy is emptied.
   *
   * A SOURCE THAT PREDATES THE TABLE IS NOT AN ERROR. An old backup has no `held_keys`, so there is
   * nothing to empty and the check below skips it. The copy still never carries a hash.
   *
   * WHICH TABLES, FROM THE ONE LIST. `emptyAndScrub` in src/config/what-a-copy-must-not-carry.mjs
   * empties NOT_CARRIED_TABLES, the list the backup command, the restore proof and the sandbox copy
   * read too, so a table added there is emptied here with nothing else to change.
   *
   * AND WHAT IT HELD IS OVERWRITTEN, THEN THE COPY IS SEARCHED. A deleted row stays readable in the file's
   * free space (problem REGoVTuHW1zo), so `emptyAndScrub` deletes with SQLite's `secure_delete` on. The
   * copy came from `VACUUM INTO`, so nothing the office deleted long ago is in it either. Then the copy's
   * bytes are searched for every key hash and visitor token hash the source holds; when one is found, the
   * copy is rewritten once with `VACUUM INTO` and searched again (`hashesLeftAfterAtMostOneRewrite`). A
   * copy in which one is still found is DELETED like any other copy that fails, and the answer gives a
   * count, never a hash.
   *
   * AND THE VISITORS' TOKEN HASHES ARE CLEARED, by the same `emptyAndScrub`. A world does not need
   * them: its start binds no key from a copied credential, and a token the office gave out must not be
   * answered by the world's visitor gate. COLUMNS_A_COPY_CLEARS says which column and how.
   *
   * ---------------------------------------------------------------------------------------
   * AND THE COPY STOPS BEING THE OFFICE
   * ---------------------------------------------------------------------------------------
   *
   * `becomesAWorld` deletes the office's own home row from the copy, in the same step. THE_ROWS_A_WORLDS_COPY_REMOVES in src/config/what-a-copy-must-not-carry.mjs says
   * which rows and why. Without it the world read itself as the office, and its reports to the
   * office were never sent. The world's server writes its own row when it starts.
   */
  try {
    const pairingRefusal4 = whyThisCheckoutMayNotOpenTheDatabase(to)
    if (pairingRefusal4 !== null) throw new Error(pairingRefusal4)
    const toEmpty = new Database(to, { fileMustExist: true })
    try {
      emptyAndScrub(toEmpty, { becomesAWorld: true })
    } finally {
      toEmpty.close()
    }
  } catch (err) {
    rmSync(to, { force: true })
    rmSync(to + '-wal', { force: true })
    rmSync(to + '-shm', { force: true })
    return { problems: ["the copy could not be emptied of key hashes and of the office's home row: " + String(err.message)] }
  }
  let left
  try {
    ;({ left } = hashesLeftAfterAtMostOneRewrite(to, keyHashes, (file) => new Database(file, { readonly: true, fileMustExist: true })))
  } catch (err) {
    rmSync(to, { force: true })
    return { problems: ["the copy could not be searched for key hashes or rewritten: " + String(err.message)] }
  }
  if (left > 0) {
    rmSync(to, { force: true })
    rmSync(to + '-wal', { force: true })
    rmSync(to + '-shm', { force: true })
    const searched = keyHashes.size
    return {
      problems: [
        String(left) + ' of the ' + String(searched) + ' key hash' + (searched === 1 ? '' : 'es') + ' it searched for ' + (left === 1 ? 'is' : 'are') +
          " still in the copy's bytes after it was emptied and rewritten once with VACUUM INTO, so the copy was deleted",
      ],
    }
  }

  return {
    problems: [],
    moved,
    sourceRows: after.get('records') ?? 0,
    copiedRows: copied.get('records') ?? 0,
    tables: copied.size,
  }
}

/**
 * BRING THE COPY UP TO DATE, BECAUSE A SERVER WILL NOT SERVE ONE THAT IS NOT.
 *
 * `npm run dev` refuses to start against a database holding authored work when a migration is
 * pending, and it is right to: it runs under `tsx watch`, so a migration would run unattended at a
 * moment nobody chose. That refusal fires against THIS copy too — it is a byte-for-byte copy of the
 * owner's corpus and looks exactly as authored — so the moment anybody added a migration, this whole
 * tool stopped working. Every agent asked to open the product in a browser got a server that would
 * not start and a log four screens long about a database nobody was trying to protect.
 *
 * A COPY IS SCRATCH, AND MIGRATING SCRATCH IS THE WHOLE POINT OF HAVING IT. The refusal exists to
 * stop a migration touching `data/panelx.db` unattended. This file is not that one: it was made
 * thirty milliseconds ago, in a directory `stop` deletes, and nothing else will ever read it.
 *
 * IT IS DONE HERE AND NOT BY THE SERVER, deliberately. The server's refusal stays exactly as it is —
 * loosening it would loosen it for the owner's database as well, which is the one thing it is for.
 * This is the caller saying "I know what this file is", which is the only party that can know.
 *
 * The report is PRINTED rather than swallowed. A migration that moves rows in a copy would move them
 * in the real one too, and somebody reading this output is the earliest anybody could find out.
 */
function migrateTheCopy(db) {
  const out = spawnSync(process.execPath, [join(ROOT, 'node_modules', '.bin', 'tsx'), join(ROOT, 'src', 'server', 'db', 'migrate.ts')], {
    cwd: ROOT,
    env: { ...process.env, MOLE_OFFICE_DB: db },
    encoding: 'utf8',
    maxBuffer: THE_MIGRATIONS_REPORT_MAY_BE,
  })
  const stopped = whyTheMigrationStopped(out, THE_MIGRATIONS_REPORT_MAY_BE)
  const said = String(out.stdout ?? '')
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.startsWith('>'))
  return { stopped, said, stderr: String(out.stderr ?? '') }
}

/**
 * HOW LARGE THE MIGRATION'S REPORT MAY GROW before spawnSync kills it: 256 MiB. Its default is 1 MiB, and a
 * report of one 500-byte line per cross-project link outgrew that on the 3 October copy of the owner's
 * corpus, which holds 2,077 of them (problem P1-fTNDwwF2H). The migration now says one line for all of
 * them; this bound is far above any report it has printed, so the buffer is not what decides a start.
 */
const THE_MIGRATIONS_REPORT_MAY_BE = 256 * 1024 * 1024

/**
 * WHY A MIGRATION CHILD DID NOT FINISH WELL, as what happened to it, or null when it exited 0. A child
 * killed because its report outgrew the buffer, or ended by a signal, did not fail: it was stopped before
 * it could say whether it would have succeeded, and saying "the migration failed" would be false.
 */
export function whyTheMigrationStopped(out, maxBuffer) {
  if (out.error?.code === 'ENOBUFS') {
    return (
      "the migration's report outgrew the " + String(maxBuffer) + '-byte output buffer, so the migration was killed ' +
      'before it finished. Nothing says it failed, and nothing says how far it got'
    )
  }
  if (out.signal !== null && out.signal !== undefined) {
    return 'the migration was ended by the signal ' + out.signal + ' before it finished. Nothing says whether it would have succeeded'
  }
  if (out.error !== undefined && out.error !== null) return 'the migration could not be run: ' + out.error.message
  if (out.status !== 0) return 'the migration failed: it exited ' + String(out.status)
  return null
}

/** How many of the migration's last lines a refused start prints. Its whole report can be far longer. */
const LINES_OF_A_STOPPED_MIGRATION = 60

/**
 * A START THAT FAILS LEAVES NOTHING UNLISTED (problem P1-fTNDwwF2H). Before `where.json` is written no
 * list names the instance folder, so a copy left in it is a large file nothing points to: the folder is
 * DELETED, and the refusal says so.
 */
function failTheStart(place, why) {
  rmSync(place, { recursive: true, force: true })
  die('Nothing was started: ' + why + '\n\nNo database was left behind: ' + place + ' has been DELETED. The source itself was only read; it is unchanged.')
}

/**
 * Which file `start` copies from, and every refusal that answer has to survive.
 *
 * `--from` is a SOURCE, and the live database is never one: `start <name>` on its own already copies
 * it, so naming it by path adds nothing and is the shape an attempt to serve the file itself would
 * take. The sidecars are refused with it — `panelx.db-wal` on its own is not a database, and pointing
 * a copy at one is a way of asking for half the corpus and being told nothing went wrong.
 */
function sourceFor(from) {
  if (from === null) {
    if (!existsSync(LIVE_DB)) die('There is no database at ' + LIVE_DB + ' to copy.')
    return LIVE_DB
  }
  const file = resolve(from)
  for (const forbidden of [LIVE_DB, LIVE_DB + '-wal', LIVE_DB + '-shm']) {
    if (file === forbidden) {
      die(
        'This tool will not be pointed at the live database (' + file + ').\n' +
          '  `node tools/isolated-mole-office.mjs start <name>` already serves a COPY of it, which is what you want.\n' +
          '  `--from` is for a file you name — a backup, an archive, an old copy — and the live corpus is not one.',
      )
    }
  }
  if (!existsSync(file)) die('There is no file at ' + file + ' to copy. `--from` names a database that already exists.')
  return file
}

/**
 * WRITE THIS WORLD DOWN IN THE OWNER'S MOLE OFFICE, so the office knows it is up. Criterion C31.
 *
 * The world is a natural test ground: a new feature can call an agent into a test world to look at
 * it, and then decide whether it needs changing.
 *
 * ---------------------------------------------------------------------------------------
 * ONLY WHEN SOMEBODY IS BEING ASKED TO LOOK, AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * Measured before this was written: `start` wrote NOTHING into Mole Office. It wrote
 * .logs/isolated/<name>/where.json and nothing else, so a world was on no list the office could
 * read, the person had no press that opened it and no press that stopped it, and a handback could
 * say only that one had existed. `stop` deleted the directory and the copy.
 *
 * IT STAYS OPT-IN. A builder testing a change starts a world, uses it and stops it, and that world
 * is nobody's business but its own: registering every one of them would fill the ledger with rows
 * nobody asked for. `--show-to-the-person` says this one is being kept up for somebody to look at,
 * and that is the only kind a handback carries.
 *
 * WHAT IT REGISTERS is the ordinary thing: a `process` row against the run that started it, so the
 * press that already stops a registered process — POST /api/resources/<id>/release, drawn in
 * SessionPanel.tsx, which names exactly what it would end before it ends it — is the press that
 * stops a world. A second stop button with its own idea of what it was killing would be a second
 * place deciding one fact.
 *
 * IT FAILS LOUDLY. A world meant to be looked at that could not be written down is not a world the
 * person can be pointed at, so the registration refusing stops the start rather than being noted.
 */
async function writeTheWorldDown(where, run, api, workspace) {
  const rows = []
  for (const part of [
    { pid: where.apiPgid, port: where.apiPort, what: 'the API' },
    { pid: where.webPgid, port: where.webPort, what: 'the browser app' },
  ]) {
    const res = await fetch(api + '/api/resources', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...asTheStarter(theNameWithoutAKey()),
        'x-mole-office-session': run,
        // WHICH PROJECT, on the write as on every other. Chapter 4's first rule. Without it the
        // office answered about "default", could not find the run, and refused the whole start —
        // which is the refusal working, and is how this line came to be written.
        'x-mole-office-workspace': workspace,
      },
      body: JSON.stringify({
        type: 'process',
        key: String(part.pid),
        sessionRecordId: run,
        detail:
          'A test world for somebody to look at: ' + part.what + ' of the isolated Mole Office "' + where.name +
          '", on port ' + String(part.port) + ', serving a copy of the corpus at ' + where.db +
          '. Open ' + where.web + '; API ' + where.api +
          (where.webForOtherMachines === null ? '. This world is reachable from this machine only.' :
            '; other machines open ' + where.webForOtherMachines + '; API ' + where.apiForOtherMachines + '.') +
          ' It is kept up on purpose. Stopping it stops the world.',
      }),
    })
    const text = await res.text()
    if (!res.ok) {
      throw new Error(
        'This world could not be written down in Mole Office at ' + api + ', so nobody can be pointed at it and ' +
          'nothing can stop it by a press. The office answered ' + String(res.status) + ': ' + text + '\n\n' +
          'It is still running. Stop it with: node tools/isolated-mole-office.mjs stop ' + where.name,
      )
    }
    rows.push(JSON.parse(text).resource.id)
    // RECORDED AS EACH ROW IS MADE, so a refusal later in this function can release what exists
    // rather than leaving the office saying a stopped world is up. See `rollBackTheWorld`.
    where.ledgerRows = rows
  }
  return rows
}

/**
 * TELL MOLE OFFICE THE WORLD IS GONE, at the moment this tool stops it.
 *
 * `force` is honest here and nowhere else: the release route refuses to act while the run that
 * registered the row is still going, because killing a live run's process is what that guard is
 * for. This tool has just killed the processes itself and proved both ports came back, so what is
 * left is the bookkeeping.
 *
 * A REFUSAL IS PRINTED AND NOT SWALLOWED. A row left behind is a world the office still says is up,
 * which is exactly the lie this whole criterion is against.
 */
async function sayTheWorldIsGone(where, api) {
  const left = []
  for (const id of where.ledgerRows ?? []) {
    try {
      const res = await fetch(api + '/api/resources/' + id + '/release', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...asTheStarter(theNameWithoutAKey()),
          // WHICH PROJECT, on this write as on the registration. Chapter 4's first rule, and it was
          // measured here twice: the registration was refused for want of it, and then the release
          // was, with "No resource with id … is in the ledger" — a row that IS in the ledger, read
          // in the wrong project. The same request with this header answered 200.
          'x-mole-office-workspace': where.workspace ?? workspaceFrom(process.env),
        },
        body: JSON.stringify({ force: true, note: 'The world "' + where.name + '" was stopped by its own tool.' }),
      })
      if (!res.ok) {
        const refusal = String(res.status) + ' ' + (await res.text())
        // k71snj7nSbLy, relayed in fJCmV3KH2mY0: read the row back rather than trusting
        // the 409. A 409 also means the resource moved; only the row says which.
        let found
        try {
          const listed = await fetch(api + '/api/resources?includeReleased=true', {
            headers: {
              ...asTheStarter(theNameWithoutAKey()),
              'x-mole-office-workspace': where.workspace ?? workspaceFrom(process.env),
            },
          })
          if (!listed.ok) {
            found = 'The ledger could not be read: ' + String(listed.status) + ' ' + (await listed.text())
          } else {
            const row = (await listed.json()).resources.find((one) => one.id === id)
            if (row !== undefined && typeof row.releasedAt === 'string' && row.releasedAt !== '') {
              process.stdout.write(
                'The ledger row ' + id + ' was already released at ' + row.releasedAt + ' by ' + row.releasedBy +
                  '; nothing more to do.\n',
              )
              continue
            }
            found = row === undefined ? 'The row was not found in the ledger.' : 'The row is still open.'
          }
        } catch (err) {
          found = 'The ledger could not be read: ' + String(err)
        }
        left.push(id)
        process.stdout.write(
          'The ledger row ' + id + ' could not be released: ' + refusal + ' ' + found +
            '\nMole Office still says this world is up. Release the row from the running-processes panel.\n',
        )
      }
    } catch (err) {
      left.push(id)
      process.stdout.write(
        'The ledger row ' + id + ' could not be released, because Mole Office at ' + api + ' could not be reached: ' +
          String(err) + '\nMole Office still says this world is up.\n',
      )
    }
  }
  return left
}


/**
 * CLOSE THE HOLDING ROW THIS WORLD LEFT IN MOLE OFFICE, IF ONE IS OPEN.
 *
 * A world started without `--show-to-the-person` used to file a session record titled
 * `Holding isolated world <name>` and take a seven-day lease on its database and ports. A decision of 11 September 2026
 * withdrew the lease design. The code that wrote the row went with it (commit `081f7f50`), but
 * the rows it had already written stayed, reading `running` for worlds stopped long before. Problem `2G9jNsuJwJf4`.
 *
 * THE SWEEP CLOSES THESE TOO, from the list of what is running (`src/server/lib/isolated-worlds.ts`).
 * This is the other half: the tool itself knows it has just stopped the world, so it closes the row
 * at the moment the fact becomes true rather than within the hour the sweep takes.
 *
 * IT NAMES THE OFFICE IT ASKS. A world this tool started without `--show-to-the-person` in the
 * current version records no office, and guessing one would be this tool closing a row in a
 * database nobody pointed it at. When there is no recorded office the answer is "nothing to close",
 * which is true of every world this version starts.
 *
 * A REFUSAL IS PRINTED AND NOT SWALLOWED. A row left behind is a world the office still says is up.
 */
async function closeTheHoldingRowThisWorldLeft(name, api, workspace) {
  if (typeof api !== 'string' || api === '' || typeof workspace !== 'string' || workspace === '') {
    return { closed: [], why: 'this world was never written down in a named office, so there is no holding row here to close', failed: false }
  }
  const headers = {
    'content-type': 'application/json',
    ...asTheStarter(theNameWithoutAKey()),
    'x-mole-office-workspace': workspace,
  }
  let rows
  try {
    const listed = await fetchAFullList(fetch, api + '/api/records?kind=session&shape=full', { headers, signal: AbortSignal.timeout(10_000) })
    if (!listed.ok) {
      return { closed: [], why: 'the office at ' + api + ' answered ' + String(listed.status) + ' for its session records', failed: true }
    }
    rows = (await listed.json()).records ?? []
    // THE HOLDING ROW IS FOUND BY ITS STATE WORD, which a narrow row keeps, but the whole row is asked
    // for because this reads a world's own record to close it; a cut answer is refused by name.
    if (rows.some((one) => typeof one?.incompleteCount !== 'number')) {
      return { closed: [], why: 'the office at ' + api + ' answered the narrow session rows and not the whole ones this tool closes', failed: true }
    }
  } catch (err) {
    return { closed: [], why: 'the office at ' + api + ' could not be reached: ' + String(err), failed: true }
  }
  const title = 'Holding isolated world ' + name
  const closed = []
  let failed = false
  for (const row of rows) {
    if (row?.title !== title) continue
    const state = row?.data?.state
    if (!saysStillGoing(state)) continue
    const because = row?.data?.closedBecause
    if (typeof because === 'string' && because !== '') continue
    try {
      const patched = await fetch(api + '/api/records/' + row.id, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          dataPatch: {
            state: 'finished',
            closedAt: localStampOf(new Date()),
            closedBecause: 'the world is not running',
            closedHow: 'went-stale',
          },
        }),
        signal: AbortSignal.timeout(10_000),
      })
      if (patched.ok) closed.push(row.id)
      else {
        failed = true
        process.stdout.write(
          'The holding row ' + row.id + ' could not be closed: ' + String(patched.status) + ' ' + (await patched.text()) + '\n',
        )
      }
    } catch (err) {
      failed = true
      process.stdout.write('The holding row ' + row.id + ' could not be closed: ' + String(err) + '\n')
    }
  }
  return { closed, why: closed.length === 0 ? 'no holding row was open' : 'closed ' + closed.join(' and '), failed }
}


/**
 * WHO HOLDS THE OWNER'S AUTHORITY IN THE WORLD THIS IS ABOUT TO START. Criterion P84, rule 5 of
 * chapter 8.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS READ HERE AND PASSED IN, RATHER THAN READ INSIDE THE WORLD
 * ---------------------------------------------------------------------------------------
 *
 * Inside a test world its starter holds the highest permission. Its starter holds their
 * authority, and the secretary holds it in every test world.
 *
 * A world's database is a COPY, so anything read from inside it can be changed from inside it.
 * Reading who the secretaries are out of the copy would mean the answer to "who holds the owner's
 * authority here" could be edited by whoever is already in the world. So both are read from the
 * office the copy was taken from, at the moment the copy is taken, and written into the world's
 * environment.
 *
 * THE STARTER IS THE RUN'S OWN AGENT. `--run` names the session record the ledger rows are written
 * against, and that record says which agent the run is working as. A world started without
 * `--show-to-the-person` names no run and therefore no starter, which is honest: nobody is being
 * asked to look at it and nothing about it needs the owner's authority.
 *
 * IT FAILS QUIETLY AND SAYS SO. A world that could not be told is a world where every one of their
 * acts stays refused to every agent, exactly as in the office. That is the safe direction, and the
 * line printed at the end of `start` says which of the two happened.
 *
 * ---------------------------------------------------------------------------------------
 * WITHOUT `--show-to-the-person`, THIS ASKS THE OFFICE NOTHING AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * Measured in the sandbox v1 smoke test (INTEGRATION.md section 7, issue 1): a throwaway world —
 * one nobody is being asked to look at, started with a bare `start <name>` — still fetched
 * `officeApi + '/api/participants'` for the secretaries, which by default IS the live office, on
 * the configured port (`theApi()`). A world nobody will ever see has no reason to hold the owner's
 * authority for anybody, so it has no reason to ask a live office anything either. `showToThePerson` gates the
 * whole read now, not just the run lookup: `said.secretaries` stays `[]` and `said.problems` says
 * why, which is a real answer (`unknown`, not a guessed empty list) rather than a fetch nobody asked
 * this tool to make.
 */
async function whoHoldsTheOwnersAuthorityIn(showToThePerson, run, officeApi, workspace) {
  const said = { startedBy: null, secretaries: [], problems: [] }
  if (!showToThePerson) {
    said.problems.push(
      'this world is not shown to the person, so its authority was never asked of the office at ' + officeApi,
    )
    return said
  }
  const headers = {
    'x-mole-office-workspace': workspace,
    ...asTheStarter('tools/isolated-mole-office.mjs'),
  }
  if (run !== null) {
    try {
      const res = await fetch(officeApi + '/api/records/' + run, { headers })
      if (res.ok) {
        const body = await res.json()
        const serving = body?.record?.data?.servingAgent
        if (typeof serving === 'string' && serving.trim() !== '') said.startedBy = serving.trim()
        else await theAgentTheRunRanAs(body?.record?.data?.ranAs, run, officeApi, workspace, headers, said)
      } else {
        said.problems.push('the office answered ' + String(res.status) + ' for the run ' + run)
      }
    } catch (err) {
      said.problems.push('the run ' + run + ' could not be read: ' + String(err))
    }
  }
  // AND THE SECRETARIES OF THE OFFICE THIS COPY CAME FROM. The card word comes from the declaration
  // this checkout runs on, which is the only place the words live, so a card renamed there moves
  // this with it and no code changes.
  // The path is ROLE_CARDS_FILE in src/server/lib/roles.ts, typed here once more because this tool runs
  // under plain node, which cannot load that file: it imports through the @shared alias. Change both together.
  try {
    const decl = JSON.parse(readFileSync(join(ROOT, 'src', 'config', 'roles.json'), 'utf8'))
    const card = decl?.elevation?.onlyThisCardCanHoldIt
    if (typeof card !== 'string' || card === '') {
      said.problems.push('src/config/roles.json names no card that can act for the person')
    } else {
      const participantPages = []
      const participantPaths = new Set()
      let participantNext = '/api/participants'
      while (participantNext !== null) {
        const n = participantPages.length + 1
        if (participantPaths.has(participantNext)) throw new Error(`The participant roster read stopped at page ${String(n)}: the office named a page that was already read. No rows were used.`)
        if (participantPages.length >= 200) throw new Error(`The participant roster read stopped at page ${String(n)}: it reads at most ${String(200)} pages. No rows were used.`)
        participantPaths.add(participantNext)
        const response = await fetch(officeApi + participantNext, { headers })
        const participantAnswer = { ok: response.ok, body: response.ok ? await response.json() : null }
        if (!participantAnswer.ok || participantAnswer.body === null) throw new Error(`The participant roster read stopped at page ${String(n)}: the office refused that page. No rows were used.`)
        participantPages.push(participantAnswer.body)
        participantNext = participantAnswer.body.next ?? null
      }
      for (const one of participantPages.flatMap(page => page.agents ?? [])) {
        if (one?.role === card && one?.retired !== true && typeof one?.handle === 'string') said.secretaries.push(one.handle)
      }
    }
  } catch (err) {
    said.problems.push('the secretaries could not be read: ' + String(err))
  }
  return said
}

/**
 * THE AGENT A RUN WORKED AS, WHEN THE RUN NAMES IT ONLY IN `ranAs`. Problem nr56S4CEQCjl, half two.
 *
 * A session the hook filed names its agent in `data.ranAs` — one `{ workspaceId, agentId }` per project — and carries
 * no `servingAgent`. So a world a secretary started from her own session had no starter, and the tool said so. The
 * `agentId` there is the id of the agent's RECORD in that project (src/shared/kinds.ts, `ranAs`), and a world compares
 * its starter with the handle a request sends, so the record is read for its `handle`.
 *
 * ONLY THE ENTRY FOR THIS WORLD'S PROJECT IS READ. A run binds to at most one agent per project; an entry for another
 * project says who the run was there, which is not a question this world asks. No entry, an unreadable record, or a
 * record that is not an agent's leaves the starter unnamed, and the reason goes into `problems`, which `start` prints.
 */
async function theAgentTheRunRanAs(ranAs, run, officeApi, workspace, headers, said) {
  const entry = Array.isArray(ranAs) ? ranAs.find((one) => one?.workspaceId === workspace) : undefined
  const agentId = typeof entry?.agentId === 'string' ? entry.agentId.trim() : ''
  if (agentId === '') {
    said.problems.push(
      'the run ' + run + ' does not say which agent it is working as: it has no servingAgent and no ranAs entry for ' +
        'the project "' + workspace + '"',
    )
    return
  }
  try {
    const res = await fetch(officeApi + '/api/records/' + encodeURIComponent(agentId), { headers })
    if (!res.ok) {
      said.problems.push('the office answered ' + String(res.status) + ' for ' + agentId + ', the agent the run ' + run + ' ran as')
      return
    }
    const record = (await res.json())?.record
    const handle = record?.kind === 'agent' ? record?.data?.handle : undefined
    if (typeof handle === 'string' && handle.trim() !== '') said.startedBy = handle.trim()
    else said.problems.push('the run ' + run + ' ran as ' + agentId + ', which is not an agent record with a handle')
  } catch (err) {
    said.problems.push('the agent the run ' + run + ' ran as, ' + agentId + ', could not be read: ' + String(err))
  }
}

/**
 * REGISTER THE WORLD AT THE OFFICE WITH THE STARTER'S OWN KEY, AND TAKE THE KEY ITS REPORTS WILL CARRY.
 * Criteria P87 and P83 point 5; decision jjfwwrrJy-qV (answer B).
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE TOOL REGISTERS THE WORLD, BEFORE THE WORLD'S SERVER STARTS
 * ---------------------------------------------------------------------------------------
 *
 * A world's server reports to the office: that it started, what it is called, which visits it
 * holds, and that it ended. It holds only its own keys, which the office does not know, so those
 * reports proved nobody. The office makes a key of the starter for the world when the starter
 * registers it with its own key (POST /api/office/worlds), and answers it once. This tool is the
 * starter's process, so it registers the world and hands the key to the world's server through its
 * environment. The world's own registration at start finds the row this wrote, so there is one row.
 * It is also criterion P87: a world the tool starts is on the office's list from the moment it starts.
 *
 * ONLY FOR A WORLD SHOWN TO THE PERSON, AND ONLY WITH A KEY. A world nobody is shown asks the office
 * nothing (tests/a-throwaway-world-never-asks-the-live-office.test.ts). A starter with no key gets no
 * key for its world, and this registers nothing, so its world reports exactly as before.
 *
 * THE KEY IS RETURNED AND NEVER WRITTEN. It goes into the API's environment and nowhere else: not
 * where.json, not the output, not a log. Only the row's id is kept, so `stop` can close the row.
 *
 * A REFUSAL FAILS THE START, before any server runs. A world meant to be looked at that the office
 * would not write down is not one the person can be pointed at.
 */
async function registerTheWorldAtTheOffice({ showToThePerson, officeApi, workspace, run, name, db, apiAddress, apiForOtherMachines, purpose, handback }) {
  if (!showToThePerson) {
    return { atTheOffice: null, key: null, holder: null, says: 'This world is not shown to the person, so it was not registered at the office and its reports carry no key.' }
  }
  if (theAgentKey() === null) {
    return {
      atTheOffice: null, key: null, holder: null,
      says:
        'This tool holds no key (MOLE_AGENT_KEY is not set), so it did not register this world at the office and the ' +
        'world\'s reports carry no key. They go under the office\'s own name, as they did before keys.',
    }
  }
  const identity = databaseIdentity(db)
  if (identity.id === 'unknown') throw new Error('The copy has no identity, so the office could not find its row again: ' + identity.how)
  const { default: Database } = await import('better-sqlite3')
  const pairingRefusal5 = whyThisCheckoutMayNotOpenTheDatabase(db)
  if (pairingRefusal5 !== null) throw new Error(pairingRefusal5)
  const copy = new Database(db, { readonly: true, fileMustExist: true })
  let installation
  try {
    installation = copy.prepare("select id from installation where only_row = 1").get()?.id ?? null
  } finally {
    copy.close()
  }
  if (typeof installation !== 'string' || installation === '') {
    throw new Error('The copy names no installation, so the office cannot say which installation this world belongs to.')
  }
  const res = await fetch(officeApi + '/api/office/worlds', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-workspace': workspace,
      ...asTheStarter(theNameWithoutAKey()),
      ...(run === null ? {} : { 'x-mole-office-session': run }),
    },
    body: JSON.stringify({
      name,
      purpose,
      handback,
      kind: 'agent-made',
      startedBy: { kind: 'agent', id: settingValue('MOLE_OFFICE_AGENT') },
      checkout: ROOT,
      databaseIdentity: identity.id,
      address: apiAddress,
      addressForOtherMachines: apiForOtherMachines,
      standing: 'scratch',
      installation,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error('The office at ' + officeApi + ' would not register this world. It answered ' + String(res.status) + ': ' + text)
  }
  const said = JSON.parse(text)
  const key = typeof said?.reportsKey?.key === 'string' ? said.reportsKey.key : null
  const holder = typeof said?.reportsKey?.holder === 'string' ? said.reportsKey.holder : null
  const made = key !== null && holder !== null
  return {
    atTheOffice: typeof said?.world?.id === 'string' ? said.world.id : null,
    key: made ? key : null,
    holder: made ? holder : null,
    // THE OFFICE'S SENTENCE SAYS "IN THIS REPLY", which is true of its reply and not of this tool's
    // output, where the key is never printed. So a key that was made is said in this tool's own words.
    says: made
      ? 'The office made a key of ' + holder + ' for this world\'s reports. It is in the environment of the world\'s ' +
        'API and nowhere else, and the office takes it back when it marks the world ended.'
      : String(said?.reportsKeySays ?? 'The office did not say whether it made a key for this world.'),
  }
}

/**
 * TELL THE OFFICE THIS WORLD HAS ENDED, by the row this tool registered, so it revokes the key the
 * world's reports carried. `stop` and the rollback both ask this. Answers one sentence saying what
 * happened; a refusal is said, never swallowed.
 */
async function closeTheWorldAtTheOffice(where, because) {
  if (typeof where.worldAtTheOffice !== 'string' || where.worldAtTheOffice === '') return null
  const api = where.registeredWith ?? theApi()
  try {
    const res = await fetch(api + '/api/office/worlds/' + encodeURIComponent(where.worldAtTheOffice) + '/close', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-mole-office-workspace': where.workspace ?? workspaceFrom(process.env), ...asTheStarter(theNameWithoutAKey()) },
      body: JSON.stringify({ because }),
      signal: AbortSignal.timeout(10_000),
    })
    if (res.ok) return { closed: true, says: 'The office marked the world ' + where.worldAtTheOffice + ' ended and took back the key its reports carried.' }
    return {
      closed: false,
      says:
        'The office did not mark the world ' + where.worldAtTheOffice + ' ended: it answered ' + String(res.status) + ' ' +
        (await res.text()) + '. Its row and its key stay until the sweep finds nothing at its address.',
    }
  } catch (err) {
    return {
      closed: false,
      says:
        'The office at ' + api + ' could not be reached to mark the world ' + where.worldAtTheOffice + ' ended (' + String(err) +
        '). Its row and its key stay until the sweep finds nothing at its address.',
    }
  }
}

/**
 * TAKE BACK A WORLD THAT DID NOT BECOME READY OR THAT MOLE OFFICE REFUSED TO RECORD.
 *
 * The registration is asked for AFTER the two servers are up, because a ledger row must name the
 * process group that owns it. A readiness timeout or a refusal there used to leave a running
 * world behind an exit 1, and a running world and a
 * failed one read the same to whoever called this. Here the world is stopped, its copy and its
 * directory are deleted, and any ledger rows written before the refusal are released, so an exit 1
 * can only mean that nothing is running.
 *
 * THE FAILURE IS PRINTED FIRST, including the service address, wait and last words for a timeout.
 * Problem e-ZODNdmOYhE, wave 13t message JDCiM_ApIIZh.
 *
 * IF THE PROCESSES CANNOT BE STOPPED the world is still running, and this says so and keeps its
 * directory rather than deleting the only record of how to stop it. That is the one case an exit 1
 * cannot promise has nothing running, and it is said out loud instead of hidden.
 */
async function rollBackTheWorld(where, place, officeApi, why, readinessFailed = false) {
  process.stderr.write(
    (readinessFailed
      ? 'This world did not become ready, so it is being stopped:\n'
      : 'Mole Office refused to record this world, so it is being stopped rather than left running:\n') +
      (why instanceof Error ? why.message : String(why)) + '\n',
  )
  // Problem e-ZODNdmOYhE, wave 13t's JDCiM_ApIIZh: retain the group ids even
  // when the first wait fails, so the printed stop command can actually find them.
  writeFileSync(join(place, 'where.json'), JSON.stringify(where, null, 2))
  const stuck = await stopTheProcesses(where)
  if (stuck.length > 0) {
    const stopped = [['API', where.apiPgid], ['browser app', where.webPgid]]
      .filter(([, pgid]) => Number.isInteger(pgid) && pgid > 0 && !groupIsRunning(pgid))
      .map(([service, pgid]) => 'the ' + service + ' group ' + String(pgid))
    process.stderr.write(
      (stopped.length > 0 ? 'Stopped ' + stopped.join(' and ') + '. ' : '') +
      'The world is STILL RUNNING: ' + stuck.join(' and ') +
        '. Its directory is kept. Stop it with: node tools/isolated-mole-office.mjs stop ' + where.name + '\n',
    )
    process.exit(1)
  }
  const left = (where.ledgerRows ?? []).length > 0 ? await sayTheWorldIsGone(where, officeApi) : []
  const closed = await closeTheWorldAtTheOffice(where, 'the tool that started it stopped it, because ' +
    (readinessFailed ? 'a service did not become ready' : 'the office refused to record it'))
  if (closed !== null) process.stderr.write(closed.says + '\n')
  rmSync(place, { recursive: true, force: true })
  process.stderr.write(
    'Nothing is running: ' +
      (where.webPgid === null
        ? 'its API is stopped, the browser app was not started, ports '
        : 'its API and browser app are stopped, ports ') + String(where.apiPort) + ' and ' +
      String(where.webPort) + ' came back, its copy is deleted, and its directory is gone.' +
      (left.length === 0
        ? ''
        : ' Ledger rows ' + left.join(' and ') + ' could NOT be released, so the office still says this world is up.') +
      '\n',
  )
  process.exit(1)
}

/**
 * THE ENVIRONMENT A WORLD'S OWN API AND BROWSER APP RUN IN. Pulled out of `start` so a test can read
 * it back without paying for two real servers, the way `whoHoldsTheOwnersAuthorityIn` is separate
 * for the same reason.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH PROJECT THE WORLD'S OWN SERVER SERVES IS SET HERE, EXPLICITLY
 * ---------------------------------------------------------------------------------------
 *
 * Measured in the sandbox v1 smoke test (INTEGRATION.md section 7, issue 2): a fresh, migrated
 * database holds only the "default" project's rows. Before this, nothing here set
 * MOLE_OFFICE_WORKSPACE at all, so the child inherited whatever `...base` happened to carry — usually
 * nothing, in which case its own message worker fell back to WORKSPACE_FALLBACK ("panelx",
 * src/config/settings.mjs) and sat watching a project the fresh copy has no rows for. It answered
 * nothing, and looked exactly like a worker that was simply idle.
 *
 * `workspace` is the same value `start` already resolves for the OUTER office's own headers (from
 * `--workspace`, or `workspaceFrom(process.env)` failing that) — sent again here so the world it
 * starts cannot silently disagree with it. This is why `--workspace` no longer needs
 * `--show-to-the-person`: it now says which project the world itself serves, which matters whether
 * or not anybody is being asked to look at it.
 */
function environmentForTheWorld({ base, db, apiPort, webPort, withMessageWorker, authority, purpose, handback, otherHost, place, workspace, viteCache = null }) {
  /**
   * NO AGENT'S KEY REACHES THE WORLD FROM THIS PROCESS. Decision jjfwwrrJy-qV, answer B: a
   * world reports with a key made for it, never with its starter's own key. `base` is this tool's
   * own environment, which holds the starter's MOLE_AGENT_KEY when it has one, so that is taken out
   * here. So are the two report variables, so a world is never handed a key left over from a world
   * that started this process; `start` adds the key made for THIS world to the API's environment.
   */
  const { MOLE_AGENT_KEY: startersKey, MOLE_WORLD_REPORT_KEY: leftOverKey, MOLE_WORLD_REPORT_AS: leftOverName, ...withoutAKey } = base
  void startersKey
  void leftOverKey
  void leftOverName
  return {
    ...withoutAKey,
    MOLE_OFFICE_DB: db,
    // xu5TbkLdRk_F: a copied queue must not start runs during an ordinary world review.
    MOLE_OFFICE_MESSAGE_WORKER: withMessageWorker ? 'on' : 'off',
    // WHICH PROJECT THIS WORLD'S OWN SERVER AND WORKER SERVE. See the function comment above.
    MOLE_OFFICE_WORKSPACE: workspace,
    /**
     * INSIDE A TEST WORLD, ITS STARTER AND THE SECRETARY HOLD THE OWNER'S AUTHORITY. Criterion P84,
     * rule 5 of chapter 8: inside a test world its starter holds the highest permission.
     *
     * Both are sent whatever they are, including empty, because deleting a name from an environment
     * does not reach a file: the real environment can override what `.env` says and cannot take it
     * away. An empty value is read as nobody, which is what it means.
     */
    MOLE_OFFICE_WORLD_STARTED_BY: authority.startedBy ?? '',
    MOLE_OFFICE_WORLD_SECRETARIES: authority.secretaries.join(','),
    MOLE_OFFICE_WORLD_INHERITED_DELIVERIES: join(place, INHERITED_DELIVERIES_FILE),
    /**
     * WHAT THIS WORLD IS FOR. Criterion P87. The row had no sentence saying what a reader was being
     * asked to look at, so the tool that started the world writes the starter's own words into the
     * environment and the world's server puts them on the row. An empty value is an honest "nothing
     * was said": deleting a name from an environment does not reach a file, so it is sent either way.
     */
    MOLE_OFFICE_WORLD_PURPOSE: purpose ?? '',
    /**
     * WHICH HANDBACK THIS WORLD BELONGS TO, by record id. Criterion C33. A world is a copy taken
     * when it starts, so the handback that asks them to look at it is filed afterwards on their
     * office and is not in here; this is the pointer back. Empty is an honest "nobody said", for
     * the reason the purpose above gives.
     */
    MOLE_OFFICE_WORLD_HANDBACK: handback ?? '',
    MOLE_OFFICE_PORT: String(apiPort),
    MOLE_OFFICE_WEB_PORT: String(webPort),
    // The addresses as well as the ports: a checkout's `.env` may name MOLE_OFFICE_API, and Vite's
    // registration plugin takes the address over the port. The account is in tests/helpers.ts.
    MOLE_OFFICE_API: 'http://127.0.0.1:' + String(apiPort),
    MOLE_OFFICE_WEB: 'http://127.0.0.1:' + String(webPort),
    // A handback follows the office's declared interface. Other scratch copies stay local.
    MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES: otherHost ?? 'none',
    /**
     * WHERE THE WORLD'S BROWSER APP KEEPS ITS PRE-BUNDLED DEPENDENCIES: the folder `--vite-cache` names, or else the
     * world's own folder, which `stop` deletes. A world in its own folder bundles them again from nothing: its Vite used
     * 23 s of CPU in its first 16 s on 5 November 2026, and 4 s with a cache already filled. Under load, a world that was
     * still bundling ran out of its 90 s wait (problem 6Kp5LosUARas). A MOLE_OFFICE_VITE_CACHE in `base` never reaches the
     * world: only the option shares a cache.
     */
    MOLE_OFFICE_VITE_CACHE: viteCache ?? join(place, 'vite-cache'),
    LOG_LEVEL: 'warn',
  }
}

/** The queued recipient rows that were already in a world's copied database. */
export async function writeTheWorldsInheritedDeliveryIds(databaseFile, place) {
  const { default: Database } = await import('better-sqlite3')
  const pairingRefusal6 = whyThisCheckoutMayNotOpenTheDatabase(databaseFile)
  if (pairingRefusal6 !== null) throw new Error(pairingRefusal6)
  const database = new Database(databaseFile, { readonly: true, fileMustExist: true })
  let ids
  try {
    ids = database
      .prepare("SELECT id FROM message_delivery WHERE mark = 'queued' AND recipient_kind = 'agent' ORDER BY id")
      .all()
      .map((row) => row.id)
  } finally {
    database.close()
  }
  writeFileSync(join(place, INHERITED_DELIVERIES_FILE), JSON.stringify(ids) + '\n')
  return ids
}

/**
 * THE LINE `start` PRINTS SAYING WHICH PROJECT THIS WORLD SERVES. Its own function, so a test can
 * read the exact words without paying for a real start. Section 7 issue 2 of INTEGRATION.md: before
 * this, nothing said which project a fresh world's worker would watch, and finding out meant
 * watching it answer nothing.
 */
function sentenceAboutTheWorldsProject(workspace, withMessageWorker) {
  return (
    'This world\'s own server serves the project "' + workspace + '"' +
    (withMessageWorker ? ', and its message worker is watching only that project' : '') +
    '. A copy that holds a different project\'s rows will look empty here.\n'
  )
}

async function start(name, from, showToThePerson, run, officeApi, workspace, withMessageWorker, purpose, handback, readyMs = READY_MS, viteCache = null) {
  const worlds = theWorldsFolderIn(ROOT)
  if (worlds.said !== null) process.stderr.write(worlds.said + '\n')
  const place = placeFor(name)
  if (existsSync(join(place, 'where.json'))) {
    die('There is already an instance called "' + name + '". Read it with `list`, or stop it first.')
  }
  // A FOLDER WITH NO where.json BUT SOMETHING IN IT was left by an earlier start that did not finish
  // (note uMMNhE4c6fWS). Reusing it would let this start's own failure delete what is there,
  // and `list` names no such folder, so nobody would know it had been there.
  const leftHere = existsSync(place) ? readdirSync(place) : []
  if (leftHere.length > 0) {
    die(
      'Nothing was started: the folder ' + place + ' already holds ' + String(leftHere.length) + ' thing(s) (' +
        leftHere.slice(0, 5).join(', ') + (leftHere.length > 5 ? ', …' : '') + ') and no where.json, so an ' +
        'earlier start of "' + name + '" did not finish. It is not an instance, `list` does not show it, and ' +
        'nothing in it was touched. Look at it and remove it yourself, or start under another name.',
    )
  }
  const source = sourceFor(from)

  mkdirSync(place, { recursive: true })
  const db = join(place, 'copy.db')
  const copied = await copyDatabase(source, db)
  if (copied.problems.length > 0) {
    // DELETED, both the copy and the directory holding it. A database left here is one somebody
    // starts a server against tomorrow, long after this message has scrolled away.
    rmSync(place, { recursive: true, force: true })
    die(
      'Nothing was started from ' + source + ':\n\n' +
        copied.problems.map((p) => '  - ' + p).join('\n') +
        '\n\nNo database was left behind — ' + place + ' has been DELETED. The source itself was only ' +
        'read; it is unchanged.',
    )
  }
  const migrated = migrateTheCopy(db)
  if (migrated.stopped !== null) {
    const lines = [...migrated.said, ...migrated.stderr.split('\n').filter((line) => line.trim() !== '')]
    failTheStart(
      place,
      'the copy could not be brought up to date, because ' + migrated.stopped + '. What the migration said' +
        (lines.length > LINES_OF_A_STOPPED_MIGRATION ? ', its last ' + String(LINES_OF_A_STOPPED_MIGRATION) + ' of ' + String(lines.length) + ' lines' : '') +
        ':\n\n' + lines.slice(-LINES_OF_A_STOPPED_MIGRATION).join('\n'),
    )
  }
  // EVERY STEP BEFORE `where.json` IS WRITTEN leaves a copy that no list names, so a throw in any of them
  // deletes the instance folder rather than leaving it (problem P1-fTNDwwF2H).
  let otherHost = null
  let apiPort, webPort, authority, env, remote
  try {
    await writeTheWorldsInheritedDeliveryIds(db, place)

    if (showToThePerson) {
      const response = await fetch(officeApi + '/api/runtime', { headers: {
        'x-mole-office-workspace': workspace,
        ...asTheStarter(theNameWithoutAKey()),
        'x-mole-office-session': run,
      }, signal: AbortSignal.timeout(10_000) })
      if (!response.ok) throw new Error('The office could not say where other machines reach it: ' + response.status)
      const runtime = await response.json()
      if (!runtime.addresses || !Object.hasOwn(runtime.addresses, 'forOtherMachines')) {
        throw new Error('The office did not report its address for other machines. Nothing was started.')
      }
      otherHost = runtime.addresses.forOtherMachines?.host ?? null
    }
    apiPort = await freePort()
    webPort = await freePort()
    // WHO HOLDS THE OWNER'S AUTHORITY IN THIS WORLD, read from the office the copy was taken from and
    // written into the world's environment below. Criterion P84.
    authority = await whoHoldsTheOwnersAuthorityIn(showToThePerson, run, officeApi, workspace)
    env = environmentForTheWorld({
      base: process.env,
      db, apiPort, webPort, withMessageWorker, authority, purpose, handback, otherHost, place, workspace, viteCache,
    })

    remote = addressesForOtherMachines(env)
  } catch (why) {
    failTheStart(place, why instanceof Error ? why.message : String(why))
  }
  // THE WORLD IS REGISTERED AT THE OFFICE BEFORE ITS SERVER STARTS, because the key its reports carry
  // has to be in that server's environment when it starts. See `registerTheWorldAtTheOffice`. If a
  // server then never comes up, rollback closes the row and takes its key back
  // (problem e-ZODNdmOYhE, wave 13t message JDCiM_ApIIZh).
  let registered
  try {
    registered = await registerTheWorldAtTheOffice({
      showToThePerson, officeApi, workspace, run, name, db,
      apiAddress: 'http://127.0.0.1:' + String(apiPort),
      apiForOtherMachines: remote?.apiAddress ?? null,
      purpose, handback,
    })
  } catch (why) {
    rmSync(place, { recursive: true, force: true })
    die('Nothing was started: ' + (why instanceof Error ? why.message : String(why)) + '\n' + place + ' has been DELETED.')
  }
  const apiLog = join(place, 'api.log')
  const webLog = join(place, 'web.log')
  // THE KEY GOES INTO THE API'S ENVIRONMENT ONLY. The browser app makes no report to the office, so
  // it is not handed a key it would never send. `theHeadersThisWorldReportsUnder` in
  // src/server/lib/office.ts reads these two names.
  const apiEnv = registered.key === null
    ? env
    : { ...env, MOLE_WORLD_REPORT_KEY: registered.key, MOLE_WORLD_REPORT_AS: registered.holder }
  const where = {
    name,
    api: 'http://127.0.0.1:' + String(apiPort),
    web: 'http://127.0.0.1:' + String(webPort),
    apiForOtherMachines: remote?.apiAddress ?? null,
    webForOtherMachines: remote?.webAddress ?? null,
    apiPort, webPort,
    apiPgid: null, webPgid: null,
    db, apiLog, webLog,
    // WHICH FILE THIS INSTANCE IS SHOWING, recorded rather than assumed. An instance holding a
    // backup from March and one holding this morning's corpus look identical in a browser.
    from: source,
    records: copied.copiedRows,
    startedAt: localStampOf(new Date()), // local wall-clock time, as `list` prints it for a person (acceptance finding 63)
    /**
     * WHAT THE STARTER SAID THIS WORLD IS FOR, or null because nobody said. Kept in `where.json`
     * so `list` and a later reader can say it without opening the world's database.
     */
    purpose: purpose ?? null,
    /** The handback this world belongs to, by record id, or null because nobody said. C33. */
    handback: handback ?? null,
    /**
     * THE OFFICE'S ROW FOR THIS WORLD, when this tool registered it there, or null. `stop` closes it,
     * which takes back the key the world's reports carry. The key itself is never written here.
     */
    worldAtTheOffice: registered.atTheOffice,
    ...(registered.atTheOffice === null ? {} : { registeredWith: officeApi, workspace }),
  }
  // Record each group before waiting. Both kinds of rollback use this same record.
  // Problem e-ZODNdmOYhE, wave 13t message JDCiM_ApIIZh.
  try {
    // i9VElsSu06sE: Vite reloads the page, so the API must reload too or a world shows mixed code.
    // Reuse the directory-watching supervisor: tsx watch loses its watches across git rewrites
    // (7XK5_FQcvEjl). Its signal handler stops its API child when this recorded group is stopped.
    const api = spawn(process.execPath, ['tools/serve-dev.mjs'], {
      cwd: ROOT, env: apiEnv, detached: true, stdio: ['ignore', openSync(apiLog, 'a'), openSync(apiLog, 'a')],
    })
    api.unref()
    where.apiPgid = api.pid
    writeFileSync(join(place, 'where.json'), JSON.stringify(where, null, 2))
    await waitUntil('http://127.0.0.1:' + String(apiPort) + '/api/health', 'The API', apiLog, readyMs)

    const web = spawn(join(ROOT, 'node_modules', '.bin', 'vite'), ['--strictPort', '--host', '127.0.0.1'], {
      cwd: ROOT, env, detached: true, stdio: ['ignore', openSync(webLog, 'a'), openSync(webLog, 'a')],
    })
    web.unref()
    where.webPgid = web.pid
    writeFileSync(join(place, 'where.json'), JSON.stringify(where, null, 2))
    await waitUntil('http://127.0.0.1:' + String(webPort) + '/', 'The browser app', webLog, readyMs)

    if (remote !== null) {
      // Ask the public health door, as on loopback; access can require credentials.
      // A decision says refusal there does not mean the server is down.
      await waitUntil(remote.apiAddress + '/api/health', 'The API for other machines', apiLog, readyMs)
      await waitUntil(remote.webAddress + '/', 'The browser app for other machines', webLog, readyMs)
    }
  } catch (why) {
    await rollBackTheWorld(where, place, officeApi, why, true)
  }

  // WRITTEN DOWN IN MOLE OFFICE ONLY WHEN SOMEBODY IS BEING ASKED TO LOOK AT IT. Criterion C31.
  // It happens after both services answer, so a row is never written for a world that never came
  // up. A REFUSAL HERE ROLLS THE WORLD BACK RATHER THAN LEAVING IT RUNNING behind an exit 1: both
  // servers are already up, so without that, a running world and a failed one read the same from
  // the exit code. `rollBackTheWorld` never returns; it exits 1 with nothing running.
  try {
    if (showToThePerson) {
      where.ledgerRows = await writeTheWorldDown(where, run, officeApi, workspace)
      where.shownToThePerson = true
      where.registeredWith = officeApi
      where.workspace = workspace
      writeFileSync(join(place, 'where.json'), JSON.stringify(where, null, 2))
    }
    // A WORLD SHOWN TO NOBODY WRITES NOTHING DOWN. It used to take a seven-day lease here, so a
    // third party's cleanup would refuse to remove its database or free its ports while it lived;
    // that hold went with the lease design, under a decision of 11 September 2026 and the acceptance of what the
    // removal takes with it. A world that is written down is covered by its ledger rows.
  } catch (why) {
    await rollBackTheWorld(where, place, officeApi, why)
  }

  process.stdout.write(JSON.stringify(where, null, 2) + '\n')
  process.stdout.write(
    '\nThe copy holds ' + String(copied.copiedRows) + ' records in ' + String(copied.tables) + ' tables; ' +
      source + ' held ' + String(copied.sourceRows) + ' when it was read' +
      (copied.sourceRows === copied.copiedRows ? '.\n' : ', so somebody wrote to it in between.\n'),
  )
  if (copied.moved.length > 0) {
    process.stdout.write(
      'It was being written to while this ran (' + copied.moved.join(', ') + '), so this is a ' +
        'point-in-time snapshot from somewhere in that range.\n',
    )
  }
  if (migrated.said.length > 0) {
    process.stdout.write('\nBringing the copy up to date said:\n')
    for (const line of migrated.said) process.stdout.write('  ' + line + '\n')
  }
  // WHICH PROJECT THIS WORLD'S OWN SERVER AND WORKER SERVE, said out loud rather than left to be
  // discovered from a worker that answers nothing. Section 7 issue 2 of INTEGRATION.md: a fresh
  // database holds only "default", and reading nothing back from a worker watching "panelx" by
  // silent default looked exactly like a worker that had nothing to do.
  process.stdout.write(sentenceAboutTheWorldsProject(workspace, withMessageWorker))
  // WHO MAY DO THE OWNER'S ACTS IN THIS WORLD, said out loud. Criterion P84: a world that could not
  // be told is a world where every one of their acts stays refused to every agent, and that is a fact
  // somebody about to work in it needs before they meet the refusal.
  process.stdout.write(
    '\nInside this world the owner\'s authority is held by: ' +
      ([
        ...(authority.startedBy === null ? [] : [authority.startedBy + ' (it started this world)']),
        ...authority.secretaries.map((one) => one + ' (secretary in the office this copy came from)'),
      ].join(', ') || 'nobody, so every one of the person\'s acts is refused here exactly as in their office') +
      '.\n',
  )
  for (const line of authority.problems) {
    process.stdout.write('  It could not read one of them: ' + line + '\n')
  }
  // WHETHER THIS WORLD'S REPORTS TO THE OFFICE CARRY A KEY, said out loud either way. A keyless
  // starter's world reports as it always did, and the line says so rather than leaving it silent.
  process.stdout.write(registered.says + '\n')
  process.stdout.write('Open ' + where.web + ' — it is a copy, so nothing you do reaches the real corpus.\n')
  process.stdout.write('Stop it with: node tools/isolated-mole-office.mjs stop ' + name + '\n')
  if (showToThePerson) {
    process.stdout.write(
      '\nThis world is written down in Mole Office at ' + officeApi + ', so it is on the list of what is running and ' +
        'there is a press that stops it.\nLedger ' + (where.ledgerRows ?? []).join(' and ') + '.\n\n' +
        'The block to put in the handback report, so the person has a press that opens it:\n' +
        JSON.stringify(
          {
            id: 'b-the-world',
            type: 'world',
            label: '<what the person should go and look at>',
            web: where.web,
            api: where.api,
            ...(where.webForOtherMachines === null ? {} : { webForOtherMachines: where.webForOtherMachines, apiForOtherMachines: where.apiForOtherMachines }),
            ledgerRow: (where.ledgerRows ?? [])[0],
            because: '<what the person is being asked to decide by looking>',
          },
          null,
          2,
        ) + '\n',
    )
  }
}

function stopGroup(pgid) {
  if (!Number.isInteger(pgid) || pgid <= 0) return
  try { process.kill(-pgid, 'SIGTERM') } catch { /* already gone */ }
}

// A group can still be running before its port opens. Exclude zombies: they cannot
// serve anything and only their parent can reap them. Problem e-ZODNdmOYhE,
// wave 13t message JDCiM_ApIIZh. Inspect only ids recorded by this start.
function groupIsRunning(pgid) {
  if (!Number.isInteger(pgid) || pgid <= 0) return false
  for (const pid of readdirSync('/proc').filter((one) => /^\d+$/.test(one))) {
    try {
      const stat = readFileSync('/proc/' + pid + '/stat', 'utf8')
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
      if (Number(fields[2]) === pgid && fields[0] !== 'Z' && fields[0] !== 'X') return true
    } catch (err) {
      if (err.code !== 'ENOENT' && err.code !== 'ESRCH') throw err
    }
  }
  return false
}

/**
 * STOP A WORLD'S TWO PROCESS GROUPS AND PROVE BOTH PORTS CAME BACK. Returns the groups or ports still held.
 *
 * ONE PLACE DECIDES HOW A WORLD IS STOPPED. `stop` and the rollback in `start` both ask this,
 * because a world killed by one rule and cleaned up by another is how the two drift.
 */
async function stopTheProcesses(where) {
  stopGroup(where.apiPgid)
  stopGroup(where.webPgid)
  const until = Date.now() + GRACE_MS
  while (Date.now() < until) {
    if (!groupIsRunning(where.apiPgid) && !groupIsRunning(where.webPgid) &&
      await portIsFree(where.apiPort) && await portIsFree(where.webPort)) break
    await new Promise((ok) => setTimeout(ok, 200))
  }
  for (const pgid of [where.apiPgid, where.webPgid]) {
    if (!Number.isInteger(pgid) || pgid <= 0) continue
    try { process.kill(-pgid, 'SIGKILL') } catch { /* already gone */ }
  }
  const stuck = []
  for (const port of [where.apiPort, where.webPort]) {
    let back = false
    for (let n = 0; n < 20 && !back; n += 1) {
      back = await portIsFree(port)
      if (!back) await new Promise((ok) => setTimeout(ok, 250))
    }
    if (!back) stuck.push('port ' + String(port) + ' is still held')
  }
  for (const [service, pgid] of [['API', where.apiPgid], ['browser app', where.webPgid]]) {
    for (let n = 0; n < 20 && groupIsRunning(pgid); n += 1) {
      await new Promise((ok) => setTimeout(ok, 250))
    }
    if (groupIsRunning(pgid)) stuck.push(service + ' group ' + String(pgid) + ' is still running')
  }
  return stuck
}

/**
 * WHY THE LEDGER KEEPS THIS WORLD UP, or null when nothing it records holds what stopping the world frees.
 *
 * A decision says a cleanup that would remove a database or free a port first asks the ledger whether a live world
 * holds it, and refuses if so. Stopping a world frees its two ports and deletes the folder its
 * database is in, so all three are asked about, in one read that stops and closes nothing.
 * The asking and the judging of the answer are tools/what-holds-it.mjs's, which db:reset uses too. An
 * office that cannot be asked, or that answers with anything but the ledger's answer about these three,
 * also keeps the world up. A step that stops or deletes something does not go ahead on a failed read,
 * and the lease check before this one refused in the same way. Unlike db:reset, no word passes a
 * refused connection here.
 *
 * A shown world's own ledger rows are process rows for its two group leaders, and they carry no world,
 * so they do not hold its ports or its database. Measured in round 40: the stop in
 * tests/a-world-says-what-it-is-for.test.ts found nothing holding them. If such a row ever carries a
 * world, this stop refuses and names that row, and the reader sees the world's own run in the sentence.
 */
async function whyTheLedgerKeepsIt(where, api, workspace) {
  const asking = 'whether a live world holds port ' + String(where.apiPort) + ', port ' + String(where.webPort) +
    ' or the database ' + String(where.db)
  if (![where.apiPort, where.webPort].every((port) => Number.isInteger(port) && port > 0) || typeof where.db !== 'string' || where.db === '') {
    return 'its where.json does not name both ports and its database, so the ledger could not be asked what stopping it would free.'
  }
  const said = await askWhatHoldsIt({ api, workspace, tool: 'tools/isolated-mole-office.mjs', ports: [where.apiPort, where.webPort], database: where.db })
  switch (said.got) {
    case 'nothing-holds-it':
      return null
    case 'held':
      return 'the ledger says a live world holds what stopping it would free. ' + said.says
    case 'refused':
    case 'timeout':
    case 'unreachable':
      return 'the office at ' + api + ' could not be asked ' + asking + ': ' + said.message + '.'
    case 'an-error-answer':
    case 'not-the-ledgers':
      return 'the office at ' + api + ' did not answer ' + asking + '. It replied ' + String(said.status) + ': ' + said.replied
  }
  throw new Error('tools/what-holds-it.mjs answered "' + String(said.got) + '", which this stop has no sentence for.')
}

async function stop(name) {
  const place = placeFor(name)
  const file = join(place, 'where.json')
  if (!existsSync(file)) die('Nothing here calls itself "' + name + '". Try `list`.')
  const where = JSON.parse(readFileSync(file, 'utf8'))

  // The lease of the old design is gone, as a decision of 11 September 2026 says. What stopping
  // a world stands on now is four things. The first is the ledger's answer that no live world holds its ports or its
  // database, as a decision says below. The others are the process groups this tool wrote into
  // where.json when it started the world, its own proof that both ports came back, and — for a world that was written
  // down — the ledger rows, whose release keeps the office's own guards against a process that has changed identity
  // since it was registered.
  const kept = await whyTheLedgerKeepsIt(where, where.registeredWith ?? theApi(), where.workspace ?? workspaceFrom(process.env))
  if (kept !== null) {
    die('"' + name + '" was not stopped and nothing was deleted: ' + kept + '\n' +
      '  Its process groups are ' + String(where.apiPgid) + ' (API) and ' + String(where.webPgid) + ' (browser app), in ' + file + '.')
  }

  const stuck = await stopTheProcesses(where)
  if (stuck.length > 0) {
    die('Stopped what it could, but ' + stuck.join(' and ') + '. Nothing was deleted so you can look.\n' +
      '  Stop it with: node tools/isolated-mole-office.mjs stop ' + name)
  }
  // AND MOLE OFFICE IS TOLD, before the directory holding the row ids is deleted. Criterion C31: a
  // world the office still says is up, after it has gone, is the lie this whole criterion is
  // against — and the ids are only in where.json, so this is the last moment they exist.
  const left =
    (where.ledgerRows ?? []).length > 0 ? await sayTheWorldIsGone(where, where.registeredWith ?? theApi()) : []

  // AND THE HOLDING ROW THIS WORLD LEFT, if one was ever written. The tool no longer creates one —
  // the lease design that did was withdrawn on 11 September 2026 — so this closes the rows it left
  // reading `running` for worlds stopped long before. The sweep closes them too, from the list of
  // what is running; this is the moment the fact becomes true.
  // AND THE OFFICE'S ROW FOR THIS WORLD, when this tool registered one, which takes back the key its
  // reports carried. Null when there is no such row: a world shown to nobody, or a keyless starter's.
  const atTheOffice = await closeTheWorldAtTheOffice(where, 'the world "' + name + '" was stopped by its own tool')

  const holding = await closeTheHoldingRowThisWorldLeft(
    name,
    where.registeredWith ?? (typeof where.workspace === 'string' ? theApi() : ''),
    where.workspace ?? workspaceFrom(process.env),
  )

  if (left.length) throw new Error('The world stopped, but ledger rows could not be released: ' + left.join(', ') + '. Its copy and evidence are kept.')
  rmSync(place, { recursive: true, force: true })
  // WHAT IT SAYS IS WHAT HAPPENED. The first version of this line said "Mole Office has been told it
  // is gone" whenever there had been rows to release, including the run where both releases were
  // refused with a 404 three lines above it — a reply that says a thing was done must mean it was
  // done, and that is the first invariant. The row ids are printed because the directory holding
  // them has just been deleted and this is the last moment they exist.
  process.stdout.write(
    '"' + name + '" is stopped, both ports came back, and its copy is deleted.' +
      ((where.ledgerRows ?? []).length === 0
        ? ''
        : left.length === 0
          ? ' Mole Office has been told it is gone.'
          : ' MOLE OFFICE STILL SAYS THIS WORLD IS UP: ' + left.join(' and ') + ' could not be released, and the ' +
            'directory holding those ids is now deleted, so they are written here. Release them from the ' +
            'running-processes panel.') +
      (holding.closed.length === 0
        ? ''
        : ' The holding row it left says the world is not running: ' + holding.closed.join(' and ') + '.') +
      (holding.failed
        ? ' MOLE OFFICE STILL SAYS THIS WORLD IS UP: its holding row could not be closed (' + holding.why + '), and ' +
          'the sweep will try again against the list of what is running.'
        : '') +
      (atTheOffice === null ? '' : ' ' + atTheOffice.says) +
      '\n',
  )
}

function list() {
  if (!existsSync(HOME)) { process.stdout.write('Nothing has been started.\n'); return }
  const names = readdirSync(HOME).filter((one) => existsSync(join(HOME, one, 'where.json')))
  if (names.length === 0) { process.stdout.write('Nothing has been started.\n'); return }
  for (const name of names) {
    const where = JSON.parse(readFileSync(join(HOME, name, 'where.json'), 'utf8'))
    let alive = false
    try { process.kill(where.apiPgid, 0); alive = true } catch { alive = false }
    process.stdout.write([
      name,
      where.web,
      where.api,
      alive ? 'the API process is alive' : 'the API process is GONE, so this record is stale — run stop to tidy it',
      // Instances started before `--from` existed have no `from`, and they all held the live corpus.
      // Said as `unrecorded` rather than assumed, because a guess here names the wrong database.
      'from ' + (where.from ?? '(unrecorded — this instance predates --from)'),
      'started ' + where.startedAt,
    ].join('  ·  ') + '\n')
  }
}

const USAGE = [
  'node tools/isolated-mole-office.mjs start <name>              a Mole Office of your own on a copy of the corpus',
  'node tools/isolated-mole-office.mjs start <name> --from <db>  the same, from a database file you name',
  'node tools/isolated-mole-office.mjs start <name> --show-to-the-person --run <session>',
  '                                                              the same, kept up for somebody to look at:',
  '                                                              it is written down in Mole Office, so it is on',
  '                                                              the list of what is running, there is a press',
  '                                                              that stops it, and a handback can carry a block',
  '                                                              with a press that opens it. Criterion C31.',
  'node tools/isolated-mole-office.mjs start <name> --show-to-the-person --run <session> --api <url>',
  '                                                              the same, written down in the Mole Office you name',
  'node tools/isolated-mole-office.mjs start <name> --purpose <sentence> --handback <record id>',
  '                                                              what this world is for, in your own words, written',
  '                                                              onto its row so a reader knows what to look at',
  'node tools/isolated-mole-office.mjs start <name> --ready-within <seconds>  wait a positive whole number of seconds (default 90)',
  'node tools/isolated-mole-office.mjs start <name> --vite-cache <folder>',
  '                                                              keep the browser app\'s pre-bundled dependencies in',
  '                                                              <folder>, which stop leaves in place, so a later',
  '                                                              world given the same folder does not bundle them again;',
  '                                                              worlds that start at the same time need folders of',
  '                                                              their own, and none may be in or around the stable',
  '                                                              checkout or the office\'s data folder',
  'node tools/isolated-mole-office.mjs stop <name>               stop it, prove the ports came back, delete the copy,',
  '                                                              and tell Mole Office the world is gone',
  'node tools/isolated-mole-office.mjs list                      what is running',
  'Worlds start no message worker by default. --with-message-worker starts one explicitly for a delivery test.',
  'node tools/isolated-mole-office.mjs start <name> --from <db> --with-message-worker --workspace <project>',
  '                                                              say which project a copied database\'s worker',
  '                                                              serves. Unset falls back to the environment,',
  '                                                              which a fresh, empty database usually does not',
  '                                                              hold — the world\'s own start output says which',
  '                                                              project it resolved to either way.',
].join('\n') + '\n'

/**
 * Read the command line. `--from` belongs to `start` alone: it says which file to copy, and `stop`
 * and `list` are about an instance that already exists, so accepting it there would accept a word
 * that could not mean anything.
 */
function readArguments(argv) {
  const [what, ...rest] = argv
  let name = null
  let from = null
  let showToThePerson = false
  let withMessageWorker = false
  let run = null
  let api = null
  let workspace = null
  let purpose = null
  let handback = null
  let readyMs = READY_MS
  let readyWithinSeen = false
  let viteCache = null
  // WHAT EACH FLAG WANTS, IN ITS OWN WORDS. `--from` names a database file and says so: its
  // sentence is the one tests/serving-a-backup.test.ts holds, and a generic "needs a value" would
  // have told somebody less while looking tidier.
  const wanted = {
    '--ready-within': 'a positive whole number of seconds',
    '--from': 'a path to a database file',
    '--run': 'a session record id',
    '--api': 'an address',
    '--workspace': 'a project',
    '--purpose': 'a sentence saying what the world is for',
    '--handback': 'the record id of the handback this world belongs to',
    '--vite-cache': 'a folder for the browser app\'s pre-bundled dependencies',
  }
  // A VALUE IS REFUSED ONLY WHEN THERE IS NONE, OR WHEN IT IS ONE OF THIS TOOL'S OWN FLAGS, which is what a
  // forgotten value looks like. A record id may begin with `--` (acceptance finding 49, report EnJvvsDTF_Dx):
  // one in 4,096 does, and `--run` and `--handback` take ids.
  const theFlags = new Set([...Object.keys(wanted), '--with-message-worker', '--show-to-the-person'])
  const wants = (flag, value) => {
    if (value === undefined || theFlags.has(value)) return '`' + flag + '` needs ' + wanted[flag] + ' after it.'
    if (what !== 'start') return '`' + flag + '` belongs to `start`. `' + String(what) + '` reads an instance that already exists.'
    return null
  }
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (arg === '--ready-within') {
      // Problem e-ZODNdmOYhE, wave 13t message JDCiM_ApIIZh: refuse before start.
      const bad = wants(arg, rest[i + 1])
      if (bad !== null) return { bad }
      if (readyWithinSeen) return { bad: '`--ready-within` was given twice. One wait limit per start.' }
      const seconds = rest[i + 1]
      if (!/^\d+$/.test(seconds) || Number(seconds) <= 0 || !Number.isSafeInteger(Number(seconds) * 1000)) {
        return { bad: '`--ready-within` needs a positive whole number of seconds.' }
      }
      readyMs = Number(seconds) * 1000
      readyWithinSeen = true
      i++
    } else if (arg === '--from') {
      const bad = wants('--from', rest[i + 1])
      if (bad !== null) return { bad }
      if (from !== null) return { bad: '`--from` was given twice. One source, one instance.' }
      from = rest[i + 1]
      i++
    } else if (arg === '--with-message-worker') {
      if (what !== 'start') return {bad:'`--with-message-worker` belongs to `start`.'}
      withMessageWorker = true
    } else if (arg === '--show-to-the-person') {
      if (what !== 'start') return { bad: '`--show-to-the-person` belongs to `start`.' }
      showToThePerson = true
    } else if (arg === '--run') {
      const bad = wants('--run', rest[i + 1])
      if (bad !== null) return { bad }
      run = rest[i + 1]
      i++
    } else if (arg === '--api') {
      const bad = wants('--api', rest[i + 1])
      if (bad !== null) return { bad }
      api = rest[i + 1]
      i++
    } else if (arg === '--workspace') {
      const bad = wants('--workspace', rest[i + 1])
      if (bad !== null) return { bad }
      workspace = rest[i + 1]
      i++
    } else if (arg === '--handback') {
      const bad = wants('--handback', rest[i + 1])
      // EVERY OTHER FLAG RETURNS `{ bad }`, NOT THE BARE STRING. This one returned the string
      // itself, so at the call site `args.bad !== undefined` was false — `args` is a string, and a
      // string has no `.bad` — and a missing `--handback` value fell through to printing USAGE and
      // exiting 0, not the refusal above. Caught only once a .ts file read `readArguments`'s return
      // value under `allowJs`: TypeScript could then say the inferred type did not match the use.
      if (bad !== null) return { bad }
      handback = rest[i + 1]
      i += 1
    } else if (arg === '--purpose') {
      const bad = wants('--purpose', rest[i + 1])
      if (bad !== null) return { bad }
      purpose = rest[i + 1]
      i++
    } else if (arg === '--vite-cache') {
      const bad = wants('--vite-cache', rest[i + 1])
      if (bad !== null) return { bad }
      if (viteCache !== null) return { bad: '`--vite-cache` was given twice. One cache per start.' }
      // Resolved against the folder the tool was run from, as a path on a command line is; Vite runs in the checkout.
      viteCache = resolve(rest[i + 1])
      const kept = whyAPathIsTheStableCheckout(viteCache) ?? whyAPathIsTheOfficesDataFolder(viteCache)
      if (kept !== null) return { bad: '`--vite-cache` ' + kept + ' Vite writes in the folder it is given and deletes files there, so no world keeps its cache there either. Nothing was started.' }
      i++
    } else if (arg.startsWith('--')) return { bad: 'Unknown option "' + arg + '".' }
    else if (name !== null) return { bad: 'One name at a time. "' + name + '" and "' + arg + '" were both given.' }
    else name = arg
  }
  // A WORLD WRITTEN DOWN IS WRITTEN DOWN AGAINST A RUN, and there is no default for that. The
  // ledger's own registration refuses a row that names no session, and guessing one here would file
  // somebody else's world under this tool's name. So it is asked for, in the same words.
  if (showToThePerson && run === null) {
    return {
      bad:
        '`--show-to-the-person` needs `--run <session record id>` beside it. A world kept up for somebody to ' +
        'look at is written down in Mole Office against the run that started it, and that is what makes it ' +
        'stoppable by a press and findable when nobody remembers starting it.',
    }
  }
  // `--run` AND `--api` SAY WHERE A WORLD IS WRITTEN DOWN IN THE OFFICE, so both need
  // `--show-to-the-person`, exactly as before. `--workspace` used to be checked here too, but it now
  // ALSO says which project the world's own server and worker serve (see `environmentForTheWorld`),
  // which matters whether or not anybody is being asked to look — a throwaway world with
  // `--with-message-worker` needs it as much as one shown to the person does. So it is no longer
  // refused without `--show-to-the-person`.
  if (!showToThePerson && (run !== null || api !== null)) {
    return {
      bad:
        '`--run` and `--api` say where a world is written down, and a world is only written ' +
        'down with `--show-to-the-person`. A world nobody is being asked to look at is nobody\'s business but yours.',
    }
  }
  return { what, name, from, showToThePerson, withMessageWorker, run, api: api ?? theApi(), workspace: workspace ?? workspaceFrom(process.env), purpose, handback, readyMs, viteCache }
}

// IMPORTING THIS FILE MUST NOT RUN A COMMAND. `copyDatabase` is exported so a test can make a copy
// and read its table without two servers; `RUN_AS_A_COMMAND` above is what makes that import safe.
if (RUN_AS_A_COMMAND) {
  const args = readArguments(process.argv.slice(2))
  if (args.bad !== undefined) die(args.bad + '\n\n' + USAGE)
  else if (args.what === 'start' && typeof args.name === 'string')
    await start(args.name, args.from, args.showToThePerson, args.run, args.api, args.workspace, args.withMessageWorker, args.purpose, args.handback, args.readyMs, args.viteCache)
  else if (args.what === 'stop' && typeof args.name === 'string') await stop(args.name)
  else if (args.what === 'list' && args.name === null) list()
  else {
    process.stdout.write(USAGE)
    process.exit(args.what === undefined ? 0 : 1)
  }
}

// `copyDatabase` lets a test make a copy and read its table without two real servers.
// `whoHoldsTheOwnersAuthorityIn`, `environmentForTheWorld`, `sentenceAboutTheWorldsProject` and
// `readArguments` let a test read back what `start` would ask, what it would send a spawned world,
// and what it would print, without paying for either server. `registerTheWorldAtTheOffice` lets a
// test register a world the way `start` does, against an office the test started.
// placeFor lets a test inspect the tool's own directory without repeating its layout, and theWorldsFolderIn lets it
// make a worktree's link out of the checkout without starting a world.
export {
  placeFor,
  theWorldsFolderIn,
  copyDatabase,
  registerTheWorldAtTheOffice,
  whoHoldsTheOwnersAuthorityIn,
  environmentForTheWorld,
  sentenceAboutTheWorldsProject,
  readArguments,
}
