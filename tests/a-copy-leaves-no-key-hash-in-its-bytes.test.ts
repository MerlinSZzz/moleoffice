// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COPY LEAVES NO KEY HASH IN ITS BYTES. Problems REGoVTuHW1zo, 9FnhMntsHc69 and FmGa9AOxfaw1;
 * the owner's decision holds that a copy, a backup and an export carry no key.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * The backup (scripts/backup.ts), the test world's copy (`copyDatabase` in
 * tools/isolated-mole-office.mjs) and the first copy tools/accept.mjs makes each deleted the rows of
 * `held_keys` and kept the file as it was. SQLite does not overwrite a deleted row, so every key hash
 * stayed readable in the file's free space: the secretary found all 346 key hashes made before the 18:27
 * backup in that backup's bytes. Each copy now goes through `emptyAndScrub` and
 * `hashesLeftAfterAtMostOneRewrite` in src/config/what-a-copy-must-not-carry.mjs.
 *
 * AND EVERY COPY STARTS WITH `VACUUM INTO` (since 21 October 2026). The copies were
 * rewritten with VACUUM, which peaked at about three databases on disk. Now each is written with `VACUUM
 * INTO` from its source, emptied with SQLite's `secure_delete` on, and rewritten once more only when the
 * byte search still finds a hash. A source that deleted a key long ago still holds its bytes in its free
 * pages; `deleted` is such a source, and no copy may carry that key, which no search looks for. `marked`
 * holds header values (user_version, application_id), which a copy must keep, as it keeps the schema and
 * `__drizzle_migrations`, so a migration check never meets a changed file.
 *
 * So every case here reads the copy's BYTES, as tests/a-sandbox-copy-carries-no-key.test.ts does,
 * and not only its rows. Each drives the real code on a scratch database this file builds, holding
 * one made-up key hash. It never opens data/panelx.db.
 *
 * FOUR SOURCES. `plain` holds the made-up hash in `held_keys` only. `pasted` holds it there and also
 * in a table a copy carries, the way a key hash pasted into a record would be. No rewrite can take
 * that one out, so it is how the byte check's refusal is driven for real.
 *
 * `visitor` and `visitorAndPasted` hold a confirmed visitor. Confirming a visitor registers its
 * token's SHA-256 in `held_keys` as well as in `visitor_credentials.token_hash`. A backup, a test world's
 * copy and accept's copy kept that column and left its hashes out of the byte search (problem `_NG9wFbPaZzs`)
 * until the owner's decision of 26 September 2026. Now every copy clears
 * the column (COLUMNS_A_COPY_CLEARS) and the search looks for every key hash and token hash the source
 * holds. `visitor` holds a made-up visitor token hash in both tables. `visitorAndPasted` holds that
 * too, and the first made-up hash in `held_keys` and pasted into a note, so the search finds that one
 * and says it searched for 2.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   1. Take `scrubbing` (secure_delete) out of `emptyAndScrub` → the emptied row stays in the copy's bytes,
 *      the search finds it and the backup is rewritten once: "writes a backup that carries none of the
 *      hash's bytes" goes red on its words.
 *   2. In src/server/lib/backup.ts, skip the byte check (`left > 0` never true) → the backup of `pasted`
 *      is kept and exits 0: "the backup's own byte check fails closed" goes red.
 *   3. In tools/isolated-mole-office.mjs, take out the call to `emptyAndScrub` → the world's copy
 *      keeps its `held_keys` row: its case goes red.
 *   4. In tools/accept.mjs, take out the call to `emptyAndScrub` → accept's copy keeps its row:
 *      its case goes red.
 *   5. In `emptyAndScrub`, stop clearing COLUMNS_A_COPY_CLEARS (skip the UPDATE) → the visitor's
 *      token hash stays in every copy, the byte search finds it, and each copy of `visitor` is refused
 *      and deleted: the three "leaves the visitor's row without its token hash" cases go red.
 *   6. In `hashesLeftAfterAtMostOneRewrite`, answer 0 after the rewrite without searching again → the
 *      backups of `pasted` are kept: both "fails closed" backup cases go red.
 *   7. In src/server/lib/backup.ts, copy with the online backup (`db.backup`) instead of `VACUUM INTO` →
 *      the backup of `deleted` carries the key it deleted: its case goes red. The same in
 *      tools/isolated-mole-office.mjs, tools/accept.mjs and tools/a-copy-of-a-live-database.mjs turns their
 *      own case red.
 *   8. In `emptyAndScrub`, set the copy's user_version to 0 → every "keeps what VACUUM INTO keeps" case
 *      goes red.
 *   9. In tools/time-the-attention-read.mjs, tools/accept.mjs or tools/isolated-mole-office.mjs, read the
 *      source's hashes only after the copy → that copy's case in "a token removed from the source between
 *      the copy and the search" goes red: the tokens it no longer holds are not searched for, and the
 *      emptying alone leaves some of them in the copy's bytes.
 *
 * THE KEY IS MADE UP and only its hash is ever written. Nothing here prints the hash: the assertions
 * say whether its bytes are present.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Database from 'better-sqlite3'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrateInPlace } from '../src/server/db/migrate.ts'
import { emptyAndScrub, NOT_CARRIED_TABLES, REMOVED_MARK } from '../src/config/what-a-copy-must-not-carry.mjs'
import { copyDatabase } from '../tools/isolated-mole-office.mjs'
import { copyTheCorpusInto } from '../tools/accept.mjs'
import { aCopyOfALiveDatabase } from '../tools/a-copy-of-a-live-database.mjs'
import { theTimersCopy } from '../tools/time-the-attention-read.mjs'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const BACKUP_SCRIPT = join(REPO, 'scripts', 'backup.ts')
const MIGRATIONS = join(REPO, 'drizzle')

/** The SHA-256 of a made-up key. No office ever issued it. */
const MADE_UP_HASH = createHash('sha256').update('a made-up key for the byte test 5555').digest('hex')

/** The SHA-256 of a made-up key the source held once and deleted long ago. No office ever issued it. */
const DELETED_LONG_AGO = createHash('sha256').update('a made-up key a source deleted long ago 5555').digest('hex')

/** Fifty made-up visitor token hashes. No office ever issued them. */
const FIFTY_TOKENS = Array.from({ length: 50 }, (_, i) => createHash('sha256').update(`a made-up visitor token ${String(i)} 5555`).digest('hex'))

/** Header values a copy must keep: a user_version, and an application_id ('MOLE'). */
const USER_VERSION = 12
const APPLICATION_ID = 0x4d4f4c45

/** The SHA-256 of a made-up visitor token. No office ever issued it. */
const MADE_UP_VISITOR_HASH = createHash('sha256').update('a made-up visitor token for the byte test 5555').digest('hex')

interface Ran {
  status: number
  stdout: string
  stderr: string
}

/** The environment a child gets: the scratch database, and none of the live office's four variables. */
function childEnv(databaseFile: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, MOLE_OFFICE_DB: databaseFile }
  for (const name of ['MOLE_OFFICE_API', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_SESSION', 'MOLE_OFFICE_AGENT']) delete env[name]
  return env
}

function backup(source: string, to: string): Ran {
  const run = spawnSync(process.execPath, [join(REPO, 'node_modules', '.bin', 'tsx'), BACKUP_SCRIPT, '--to', to, '--database-only'], {
    cwd: REPO,
    encoding: 'utf8',
    env: childEnv(source),
    timeout: 120_000,
  })
  return { status: run.status ?? -1, stdout: run.stdout ?? '', stderr: run.stderr ?? '' }
}

/** Whether the made-up hash is anywhere in a file's bytes, deleted pages included. */
function hashIsInTheBytesOf(file: string, hash = MADE_UP_HASH): boolean {
  return readFileSync(file).toString('latin1').includes(hash)
}

/** The one visitor credential's stored token hash column, as the file holds it. */
function tokenColumnOf(file: string): string {
  const db = new Database(file, { readonly: true, fileMustExist: true })
  try {
    return (db.prepare("SELECT token_hash AS v FROM visitor_credentials WHERE id = 'vc-byte-test'").get() as { v: string }).v
  } finally {
    db.close()
  }
}

function rowsIn(file: string, table: string): number {
  const db = new Database(file, { readonly: true, fileMustExist: true })
  try {
    return (db.prepare(`SELECT count(*) AS n FROM "${table}"`).get() as { n: number }).n
  } finally {
    db.close()
  }
}

/** A scratch office database holding the made-up hash, and, when `pasted`, the same hash in a carried table. */
function aSource(dir: string, pasted: boolean): string {
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'panelx.db')
  const db = new Database(file)
  try {
    db.pragma('journal_mode = WAL')
    migrateInPlace(db, MIGRATIONS)
    db.prepare(
      'INSERT INTO held_keys (id, whose_kind, whose_id, key_hash, made_at) ' +
        "VALUES ('hk-byte-test', 'agent', 'a-made-up-agent', ?, '2026-09-25 10:00:00')",
    ).run(MADE_UP_HASH)
    if (pasted) {
      db.exec('CREATE TABLE a_note_somebody_pasted (body TEXT)')
      db.prepare('INSERT INTO a_note_somebody_pasted (body) VALUES (?)').run(`pasted by mistake: ${MADE_UP_HASH}`)
    }
  } finally {
    db.close()
  }
  return file
}

/**
 * A scratch office database holding a confirmed visitor whose token hash is also a held key, as
 * confirming a visitor leaves it. With `pastedToo`, it also holds `pasted`'s hash in both places.
 */
function aSourceWithAVisitor(dir: string, pastedToo: boolean): string {
  const file = aSource(dir, pastedToo)
  const db = new Database(file)
  try {
    db.prepare(
      'INSERT INTO visitor_credentials (id, handle, name, role, token_hash, machine_how, standing, ' +
        'confirmed_by_kind, confirmed_by_id, confirmed_at, ends_at, issued_at) ' +
        "VALUES ('vc-byte-test', 'a-made-up-visitor', 'A made-up visitor', 'worker', ?, 'nobody could tell', " +
        `'trusted', 'person', '${THE_TEST_OFFICES_OWNER.id}', '2026-09-25 10:01:00', '2026-10-25 10:00:00', '2026-09-25 10:00:00')`,
    ).run(MADE_UP_VISITOR_HASH)
    db.prepare(
      'INSERT INTO held_keys (id, whose_kind, whose_id, key_hash, made_at) ' +
        "VALUES ('hk-visitor-byte-test', 'agent', 'a-made-up-visitor', ?, '2026-09-25 10:01:00')",
    ).run(MADE_UP_VISITOR_HASH)
    if (!pastedToo) db.prepare("DELETE FROM held_keys WHERE id = 'hk-byte-test'").run()
  } finally {
    db.close()
  }
  return file
}

/**
 * A scratch office database that once held DELETED_LONG_AGO, pasted into a row of a table every copy keeps
 * (`runtime_settings`), and deleted that row with SQLite's secure_delete off, as the office's own file deletes:
 * its bytes stay in that table's free space. Nothing a copy empties or clears touches that table, so only how the
 * copy was written decides whether they come along: in a table the copy empties, the emptying overwrites them
 * either way.
 */
function aSourceThatDeletedAKey(dir: string): string {
  const file = aSource(dir, false)
  const db = new Database(file)
  try {
    db.pragma('secure_delete = OFF')
    db.prepare("INSERT INTO runtime_settings (name, value) VALUES ('a-made-up-note-deleted-long-ago', ?)").run(`pasted by mistake: ${DELETED_LONG_AGO}`)
    db.prepare("DELETE FROM runtime_settings WHERE name = 'a-made-up-note-deleted-long-ago'").run()
    db.pragma('wal_checkpoint(TRUNCATE)')
  } finally {
    db.close()
  }
  return file
}

/**
 * A scratch office database with fifty confirmed visitors, each token hash in `visitor_credentials` and in
 * `held_keys`, as confirming a visitor leaves it. Clearing fifty token hashes with secure_delete on still leaves
 * some of them in a copy's bytes (the check measured 19 of 50 on this schema), so only a search and a rewrite
 * after the emptying keep them out.
 */
function aSourceWithFiftyVisitors(dir: string): string {
  const file = aSource(dir, false)
  const db = new Database(file)
  try {
    const visitor = db.prepare(
      'INSERT INTO visitor_credentials (id, handle, name, role, token_hash, machine_how, standing, ' +
        'confirmed_by_kind, confirmed_by_id, confirmed_at, ends_at, issued_at) ' +
        "VALUES (?, ?, 'A made-up visitor', 'worker', ?, 'nobody could tell', " +
        `'trusted', 'person', '${THE_TEST_OFFICES_OWNER.id}', '2026-09-25 10:01:00', '2026-10-25 10:00:00', '2026-09-25 10:00:00')`,
    )
    const held = db.prepare("INSERT INTO held_keys (id, whose_kind, whose_id, key_hash, made_at) VALUES (?, 'agent', ?, ?, '2026-09-25 10:01:00')")
    FIFTY_TOKENS.forEach((hash, i) => {
      visitor.run(`vc-fifty-${String(i)}`, `a-made-up-visitor-${String(i)}`, hash)
      held.run(`hk-fifty-${String(i)}`, `a-made-up-visitor-${String(i)}`, hash)
    })
    db.pragma('wal_checkpoint(TRUNCATE)')
  } finally {
    db.close()
  }
  return file
}

/** How many of these hashes are in a file's bytes. */
function howManyAreInTheBytesOf(file: string, hashes: readonly string[]): number {
  const bytes = readFileSync(file).toString('latin1')
  return hashes.filter((hash) => bytes.includes(hash)).length
}

/**
 * Runs `copying` with every visitor's token and every held key taken out of `source` right after the copy's
 * VACUUM INTO from it: the rows of visitor_credentials and held_keys are deleted between the copy and the search,
 * as a visitor's removal or a key's would be while a copy of a live office is made. better-sqlite3's prepare and
 * exec are wrapped while it runs, as tests/a-killed-backup-leaves-nothing-at-its-name.test.ts wraps prepare, and
 * put back after.
 */
async function withTheTokensRemovedRightAfterTheCopy<T>(source: string, copying: () => T | Promise<T>): Promise<T> {
  const { prepare, exec } = Database.prototype
  let removed = false
  const removeThem = (from: Database.Database): void => {
    if (removed || resolve(from.name) !== resolve(source)) return
    removed = true
    const writer = new Database(source, { fileMustExist: true })
    try {
      writer.exec('DELETE FROM visitor_credentials; DELETE FROM held_keys')
    } finally {
      writer.close()
    }
  }
  Database.prototype.prepare = function (this: Database.Database, sql: string) {
    const statement = prepare.call(this, sql)
    if (sql.startsWith('VACUUM INTO')) {
      const run = statement.run as (...values: unknown[]) => Database.RunResult
      statement.run = ((...values: unknown[]) => {
        const ran = run.apply(statement, values)
        removeThem(this)
        return ran
      }) as typeof statement.run
    }
    return statement
  } as typeof prepare
  Database.prototype.exec = function (this: Database.Database, sql: string) {
    const ran = exec.call(this, sql)
    if (sql.startsWith('VACUUM INTO')) removeThem(this)
    return ran
  } as typeof exec
  try {
    return await copying()
  } finally {
    Database.prototype.prepare = prepare
    Database.prototype.exec = exec
  }
}

/** A scratch office database with a user_version and an application_id in its header. */
function aSourceWithHeaderValues(dir: string): string {
  const file = aSource(dir, false)
  const db = new Database(file)
  try {
    db.pragma(`user_version = ${String(USER_VERSION)}`)
    db.pragma(`application_id = ${String(APPLICATION_ID)}`)
  } finally {
    db.close()
  }
  return file
}

/** What a copy must keep of its source: the header values, the schema, and the migrations it records. */
function whatACopyKeeps(file: string): { userVersion: unknown; applicationId: unknown; schema: unknown[]; migrations: unknown[] } {
  const db = new Database(file, { readonly: true, fileMustExist: true })
  try {
    return {
      userVersion: db.pragma('user_version', { simple: true }),
      applicationId: db.pragma('application_id', { simple: true }),
      schema: db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all(),
      migrations: db.prepare('SELECT * FROM __drizzle_migrations ORDER BY id').all(),
    }
  } finally {
    db.close()
  }
}

let place: string
let deleted: string
let marked: string
let fiftyVisitors: string
let plain: string
let pasted: string
let visitor: string
let visitorAndPasted: string

beforeAll(() => {
  place = aTestDatabaseFolder('w13m-copies-bytes')
  plain = aSource(join(place, 'plain'), false)
  pasted = aSource(join(place, 'pasted'), true)
  visitor = aSourceWithAVisitor(join(place, 'visitor'), false)
  visitorAndPasted = aSourceWithAVisitor(join(place, 'visitor-and-pasted'), true)
  deleted = aSourceThatDeletedAKey(join(place, 'deleted'))
  marked = aSourceWithHeaderValues(join(place, 'marked'))
  fiftyVisitors = aSourceWithFiftyVisitors(join(place, 'fifty-visitors'))
}, 120_000)

afterAll(() => {
  if (place !== undefined) rmSync(place, { recursive: true, force: true })
})

describe('the scratch sources', () => {
  it('hold the made-up hash in their bytes, so a search that finds nothing in a copy means something', () => {
    expect(hashIsInTheBytesOf(plain)).toBe(true)
    expect(rowsIn(plain, 'held_keys')).toBe(1)
  })

  it('and deleting the row without rewriting leaves the hash in the bytes, which is the defect', async () => {
    const copy = join(place, 'delete-only.db')
    const source = new Database(plain, { readonly: true, fileMustExist: true })
    try {
      await source.backup(copy)
    } finally {
      source.close()
    }
    const db = new Database(copy, { fileMustExist: true })
    try {
      db.prepare('DELETE FROM held_keys').run()
    } finally {
      db.close()
    }
    expect(rowsIn(copy, 'held_keys')).toBe(0)
    expect(hashIsInTheBytesOf(copy), 'SQLite overwrote the deleted row, so this file cannot show the defect').toBe(true)
  })
})

describe('npm run db:backup', () => {
  it('writes a backup that carries none of the hash’s bytes, and says it searched them', () => {
    const to = join(place, 'backup-of-plain.db')
    const run = backup(plain, to)
    expect(run.status, run.stderr).toBe(0)
    for (const table of NOT_CARRIED_TABLES) expect(rowsIn(to, table), table).toBe(0)
    expect(hashIsInTheBytesOf(to), 'the backup still holds the key hash in its bytes').toBe(false)
    expect(run.stdout).toContain('what it held was overwritten where it lay')
    expect(run.stdout, 'the backup needed a second rewrite, so the emptying left the hash in its bytes').not.toContain('rewritten once with VACUUM INTO')
    expect(run.stdout).toContain('None of the 1 key hash the source holds is in its bytes')
    expect(run.stdout + run.stderr).not.toContain(MADE_UP_HASH)
    // The source was only read.
    expect(rowsIn(plain, 'held_keys')).toBe(1)
  })

  it('fails closed when its own byte check finds a hash of the source: the copy is deleted and it exits 1', () => {
    const to = join(place, 'backup-of-pasted.db')
    const run = backup(pasted, to)
    expect(run.status, 'a backup holding a key hash in its bytes was kept').toBe(1)
    expect(run.stderr).toContain('1 of the 1 key hash it searched for is still in the copy')
    // THE ONE REWRITE RAN, AND THE SECOND SEARCH STILL FOUND IT: the hash is in a row the copy keeps.
    expect(run.stderr).toContain('rewritten once with VACUUM INTO, but 1 of the 1 key hash')
    expect(run.stderr).toContain('DELETED')
    expect(existsSync(to), 'a backup holding a key hash was left where it would be trusted').toBe(false)
    expect(existsSync(`${to}-wal`)).toBe(false)
    expect(existsSync(`${to}-shm`)).toBe(false)
    expect(run.stdout + run.stderr).not.toContain(MADE_UP_HASH)
    expect(rowsIn(pasted, 'held_keys')).toBe(1)
  })

  it('leaves the visitor’s row without its token hash, and says so', () => {
    const to = join(place, 'backup-of-visitor.db')
    const run = backup(visitor, to)
    expect(run.status, run.stderr).toBe(0)
    expect(existsSync(to)).toBe(true)
    expect(rowsIn(to, 'held_keys')).toBe(0)
    expect(rowsIn(to, 'visitor_credentials')).toBe(1)
    expect(tokenColumnOf(to)).toBe(`${REMOVED_MARK}vc-byte-test`)
    expect(hashIsInTheBytesOf(to, MADE_UP_VISITOR_HASH), 'the backup still carries the visitor’s token hash').toBe(false)
    expect(run.stdout).toContain('It carries no key hashes')
    expect(run.stdout).toContain('None of the 1 key hash the source holds is in its bytes.')
    expect(run.stdout).toContain(
      'It carries no visitor token hash: its 1 visitor credential keeps its row without its token hash, because ' +
        'a decision leaves them out of every backup, so after a restore each visitor must pair again before it can work.',
    )
    expect(run.stdout).not.toContain('on purpose')
    expect(run.stdout + run.stderr).not.toContain(MADE_UP_VISITOR_HASH)
    // The source was only read: it still holds the visitor's token hash.
    expect(tokenColumnOf(visitor)).toBe(MADE_UP_VISITOR_HASH)
  })

  it('says both counts to a machine too', () => {
    const run = spawnSync(
      process.execPath,
      [join(REPO, 'node_modules', '.bin', 'tsx'), BACKUP_SCRIPT, '--to', join(place, 'backup-of-visitor-json.db'), '--database-only', '--json'],
      { cwd: REPO, encoding: 'utf8', env: childEnv(visitor), timeout: 120_000 },
    )
    expect(run.status, run.stderr).toBe(0)
    const said = JSON.parse(run.stdout) as Record<string, unknown>
    expect(said['keyHashesSearchedInBytes']).toBe(1)
    expect(said['rewrittenAfterTheSearch']).toBe(false)
    expect(said['cleared']).toEqual({ 'visitor_credentials.token_hash': 1 })
    expect(said).not.toHaveProperty('keyHashesCarriedAsVisitorTokens')
  })

  it('fails closed on a held key hash pasted into a row the copy keeps, and searched for the visitor’s too', () => {
    const to = join(place, 'backup-of-visitor-and-pasted.db')
    const run = backup(visitorAndPasted, to)
    expect(run.status, 'a backup holding a key hash in its bytes was kept').toBe(1)
    expect(run.stderr).toContain('1 of the 2 key hashes it searched for is still in the copy')
    expect(existsSync(to)).toBe(false)
    expect(run.stdout + run.stderr).not.toContain(MADE_UP_HASH)
    expect(run.stdout + run.stderr).not.toContain(MADE_UP_VISITOR_HASH)
  })
})

describe('a test world’s copy, made by copyDatabase in tools/isolated-mole-office.mjs', () => {
  // THE COPY FUNCTION IS DRIVEN DIRECTLY, as tests/a-worlds-copy-carries-no-key-hashes.test.ts does:
  // starting a world would start two servers to reach the same function.
  it('carries none of the hash’s bytes', async () => {
    const to = join(place, 'world-of-plain.db')
    const copied = (await copyDatabase(plain, to)) as { problems: string[] }
    expect(copied.problems).toEqual([])
    expect(rowsIn(to, 'held_keys')).toBe(0)
    expect(hashIsInTheBytesOf(to), 'the world’s copy still holds the key hash in its bytes').toBe(false)
    expect(rowsIn(plain, 'held_keys')).toBe(1)
  })

  it('refuses and deletes a copy in which its byte check finds a hash of the source', async () => {
    const to = join(place, 'world-of-pasted.db')
    const copied = (await copyDatabase(pasted, to)) as { problems: string[] }
    expect(copied.problems.join('\n')).toContain("still in the copy's bytes")
    expect(copied.problems.join('\n')).not.toContain(MADE_UP_HASH)
    expect(existsSync(to)).toBe(false)
  })

  it('leaves the visitor’s row without its token hash', async () => {
    const to = join(place, 'world-of-visitor.db')
    const copied = (await copyDatabase(visitor, to)) as { problems: string[] }
    expect(copied.problems).toEqual([])
    expect(rowsIn(to, 'held_keys')).toBe(0)
    expect(rowsIn(to, 'visitor_credentials')).toBe(1)
    expect(tokenColumnOf(to)).toBe(`${REMOVED_MARK}vc-byte-test`)
    expect(hashIsInTheBytesOf(to, MADE_UP_VISITOR_HASH), 'the world’s copy still carries the visitor’s token hash').toBe(false)
  })

  it('refuses a copy holding a held key hash pasted into a row, having searched for the visitor’s too', async () => {
    const to = join(place, 'world-of-visitor-and-pasted.db')
    const copied = (await copyDatabase(visitorAndPasted, to)) as { problems: string[] }
    expect(copied.problems.join('\n')).toContain("1 of the 2 key hashes it searched for is still in the copy's bytes")
    expect(copied.problems.join('\n')).not.toContain(MADE_UP_HASH)
    expect(existsSync(to)).toBe(false)
  })
})

describe('the first copy tools/accept.mjs makes, copyTheCorpusInto', () => {
  it('carries none of the hash’s bytes', () => {
    const worktree = join(place, 'accept-plain')
    const copy = copyTheCorpusInto(worktree, plain)
    expect(copy).toBe(join(worktree, 'data', 'panelx.db'))
    expect(rowsIn(copy, 'held_keys')).toBe(0)
    expect(hashIsInTheBytesOf(copy), 'accept’s copy still holds the key hash in its bytes').toBe(false)
    expect(rowsIn(plain, 'held_keys')).toBe(1)
  })

  it('throws and deletes a copy in which a hash of the source is found', () => {
    const worktree = join(place, 'accept-pasted')
    expect(() => copyTheCorpusInto(worktree, pasted)).toThrow(/still in the bytes of the copy/)
    expect(existsSync(join(worktree, 'data', 'panelx.db'))).toBe(false)
  })

  it('leaves the visitor’s row without its token hash', () => {
    const copy = copyTheCorpusInto(join(place, 'accept-visitor'), visitor)
    expect(rowsIn(copy, 'held_keys')).toBe(0)
    expect(rowsIn(copy, 'visitor_credentials')).toBe(1)
    expect(tokenColumnOf(copy)).toBe(`${REMOVED_MARK}vc-byte-test`)
    expect(hashIsInTheBytesOf(copy, MADE_UP_VISITOR_HASH), 'accept’s copy still carries the visitor’s token hash').toBe(false)
  })

  it('throws on a held key hash pasted into a row, having searched for the visitor’s too', () => {
    const worktree = join(place, 'accept-visitor-and-pasted')
    expect(() => copyTheCorpusInto(worktree, visitorAndPasted)).toThrow(/1 of the 2 key hashes it searched for/)
    expect(existsSync(join(worktree, 'data', 'panelx.db'))).toBe(false)
  })
})

describe('every copy starts with VACUUM INTO, so nothing its source deleted long ago is in it', () => {
  it('the source still holds the key it deleted in its bytes, and not in a row, or this proves nothing', () => {
    expect(hashIsInTheBytesOf(deleted, DELETED_LONG_AGO)).toBe(true)
    const db = new Database(deleted, { readonly: true, fileMustExist: true })
    try {
      expect(db.prepare("SELECT count(*) AS n FROM runtime_settings WHERE instr(value, ?) > 0").get(DELETED_LONG_AGO)).toEqual({ n: 0 })
    } finally {
      db.close()
    }
  })

  it('npm run db:backup', () => {
    const to = join(place, 'backup-of-deleted.db')
    const run = backup(deleted, to)
    expect(run.status, run.stderr).toBe(0)
    expect(hashIsInTheBytesOf(to, DELETED_LONG_AGO), 'the backup carries a key its source deleted').toBe(false)
  })

  it('a test world’s copy, copyDatabase in tools/isolated-mole-office.mjs', async () => {
    const to = join(place, 'world-of-deleted.db')
    const copied = (await copyDatabase(deleted, to)) as { problems: string[] }
    expect(copied.problems).toEqual([])
    expect(hashIsInTheBytesOf(to, DELETED_LONG_AGO), 'the world’s copy carries a key its source deleted').toBe(false)
  })

  it('accept’s first copy, copyTheCorpusInto in tools/accept.mjs', () => {
    const copy = copyTheCorpusInto(join(place, 'accept-deleted'), deleted)
    expect(hashIsInTheBytesOf(copy, DELETED_LONG_AGO), 'accept’s copy carries a key its source deleted').toBe(false)
  })

  it('the attention timer’s copy, theTimersCopy in tools/time-the-attention-read.mjs', () => {
    const to = join(place, 'timer-of-deleted.db')
    theTimersCopy(deleted, to)
    expect(hashIsInTheBytesOf(to, DELETED_LONG_AGO), 'the timer’s copy carries a key its source deleted').toBe(false)
  })
})

describe('a copy keeps what VACUUM INTO keeps: the header values, the schema and the migrations', () => {
  it('the source holds them, or this proves nothing', () => {
    const source = whatACopyKeeps(marked)
    expect(source.userVersion).toBe(USER_VERSION)
    expect(source.applicationId).toBe(APPLICATION_ID)
    expect(source.migrations.length).toBeGreaterThan(0)
  })

  it('npm run db:backup', () => {
    const to = join(place, 'backup-of-marked.db')
    const run = backup(marked, to)
    expect(run.status, run.stderr).toBe(0)
    expect(whatACopyKeeps(to)).toEqual(whatACopyKeeps(marked))
  })

  it('a test world’s copy', async () => {
    const to = join(place, 'world-of-marked.db')
    const copied = (await copyDatabase(marked, to)) as { problems: string[] }
    expect(copied.problems).toEqual([])
    expect(whatACopyKeeps(to)).toEqual(whatACopyKeeps(marked))
  })

  it('accept’s first copy', () => {
    const copy = copyTheCorpusInto(join(place, 'accept-marked'), marked)
    expect(whatACopyKeeps(copy)).toEqual(whatACopyKeeps(marked))
  })
})

describe('fifty visitors: the emptying alone leaves some token hashes, and the search and one rewrite take them out', () => {
  it('the emptying alone leaves some of them in a copy’s bytes, or this proves nothing', () => {
    const to = join(place, 'fifty-emptied-only.db')
    aCopyOfALiveDatabase(fiftyVisitors, to)
    const db = new Database(to, { fileMustExist: true })
    try {
      emptyAndScrub(db, { becomesAWorld: true })
    } finally {
      db.close()
    }
    expect(howManyAreInTheBytesOf(to, FIFTY_TOKENS), 'the emptying took every token hash out, so nothing here can show the search is needed').toBeGreaterThan(0)
  })

  it('the attention timer’s copy carries none of them', () => {
    const to = join(place, 'timer-of-fifty.db')
    theTimersCopy(fiftyVisitors, to)
    expect(howManyAreInTheBytesOf(to, FIFTY_TOKENS), 'the timer’s copy carries visitor token hashes').toBe(0)
  })

  it('the attention timer removes its copy and throws when a hash of the source is in a row the copy keeps', () => {
    const to = join(place, 'timer-of-pasted.db')
    expect(() => theTimersCopy(pasted, to)).toThrow(/still in the bytes of the copy at .* so it was removed and nothing was timed/)
    expect(existsSync(to), 'the timer kept a copy holding a hash of the source').toBe(false)
  })

  it('npm run db:backup carries none of them', () => {
    const to = join(place, 'backup-of-fifty.db')
    const run = backup(fiftyVisitors, to)
    expect(run.status, run.stderr).toBe(0)
    expect(howManyAreInTheBytesOf(to, FIFTY_TOKENS), 'the backup carries visitor token hashes').toBe(0)
  })

  it('a test world’s copy and accept’s first copy carry none of them', async () => {
    const world = join(place, 'world-of-fifty.db')
    const copied = (await copyDatabase(fiftyVisitors, world)) as { problems: string[] }
    expect(copied.problems).toEqual([])
    expect(howManyAreInTheBytesOf(world, FIFTY_TOKENS), 'the world’s copy carries visitor token hashes').toBe(0)
    const accepted = copyTheCorpusInto(join(place, 'accept-fifty'), fiftyVisitors)
    expect(howManyAreInTheBytesOf(accepted, FIFTY_TOKENS), 'accept’s copy carries visitor token hashes').toBe(0)
  })
})

describe('a token removed from the source between the copy and the search is still searched for: the hashes are read on both sides of the copy', () => {
  it('the source no longer holds them by the search, and the emptying alone leaves some of them in a copy, or this proves nothing', async () => {
    for (const becomesAWorld of [true, false]) {
      const source = aSourceWithFiftyVisitors(join(place, `race-proof-${String(becomesAWorld)}`))
      const to = join(place, `race-emptied-only-${String(becomesAWorld)}.db`)
      await withTheTokensRemovedRightAfterTheCopy(source, () => aCopyOfALiveDatabase(source, to))
      expect(rowsIn(source, 'visitor_credentials'), 'the tokens were not removed between the copy and the search').toBe(0)
      expect(rowsIn(source, 'held_keys')).toBe(0)
      const db = new Database(to, { fileMustExist: true })
      try {
        emptyAndScrub(db, { becomesAWorld })
      } finally {
        db.close()
      }
      expect(howManyAreInTheBytesOf(to, FIFTY_TOKENS), `the emptying (becomesAWorld ${String(becomesAWorld)}) took every token hash out, so nothing here can show the reading before the copy is needed`).toBeGreaterThan(0)
    }
  })

  it('the attention timer’s copy carries none of them', async () => {
    const source = aSourceWithFiftyVisitors(join(place, 'race-timer'))
    const to = join(place, 'race-timer.db')
    await withTheTokensRemovedRightAfterTheCopy(source, () => theTimersCopy(source, to))
    expect(rowsIn(source, 'visitor_credentials'), 'the tokens were not removed between the copy and the search').toBe(0)
    expect(howManyAreInTheBytesOf(to, FIFTY_TOKENS), 'the timer’s copy carries token hashes its source no longer held at the search').toBe(0)
  })

  it('accept’s first copy carries none of them', async () => {
    const source = aSourceWithFiftyVisitors(join(place, 'race-accept-source'))
    const copy = await withTheTokensRemovedRightAfterTheCopy(source, () => copyTheCorpusInto(join(place, 'race-accept'), source))
    expect(rowsIn(source, 'visitor_credentials'), 'the tokens were not removed between the copy and the search').toBe(0)
    expect(howManyAreInTheBytesOf(copy, FIFTY_TOKENS), 'accept’s copy carries token hashes its source no longer held at the search').toBe(0)
  })

  it('a test world’s copy carries none of them', async () => {
    const source = aSourceWithFiftyVisitors(join(place, 'race-world-source'))
    const to = join(place, 'race-world.db')
    const copied = (await withTheTokensRemovedRightAfterTheCopy(source, () => copyDatabase(source, to))) as { problems: string[] }
    expect(copied.problems).toEqual([])
    expect(rowsIn(source, 'visitor_credentials'), 'the tokens were not removed between the copy and the search').toBe(0)
    expect(howManyAreInTheBytesOf(to, FIFTY_TOKENS), 'the world’s copy carries token hashes its source no longer held at the search').toBe(0)
  })
})
