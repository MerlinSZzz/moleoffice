// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN OLD BACKUP IS REWRITTEN THE WAY A BACKUP IS MADE NOW, OR LEFT EXACTLY AS IT WAS.
 *
 * scripts/rewrite-a-backup.ts is point (c) of a decision: each backup made before
 * 26 September 2026 is rewritten with its key store emptied and its visitor token
 * hashes cleared, in a working copy written with VACUUM INTO, and it replaces the old file only when every
 * other table's row count is unchanged and the byte search finds no key hash.
 *
 * EVERY BACKUP HERE IS A MADE-UP FIXTURE this file builds in its own temporary folder. The "office" is a
 * scratch database named by MOLE_OFFICE_DB for the child. Nothing here opens data/panelx.db or any
 * folder of the owner's. The keys are made up, only their hashes are written, and no assertion prints one.
 *
 * AN OLD BACKUP, MADE THE OLD WAY: SQLite's online backup of the office, then `DELETE FROM held_keys`
 * on the copy without VACUUM. Its `held_keys` reads empty and every hash is still in its free pages,
 * which is what was found in the owner's backups (problem REGoVTuHW1zo). It keeps its visitor's token
 * hash, as every backup did before the decision.
 *
 * TWO SEAMS, EACH A MODULE PASSED TO THE CHILD WITH `--import`, as tests/a-killed-backup-leaves-nothing-at-its-name.test.ts
 * does: the product carries no code that exists only for a test. Both wrap better-sqlite3's `prepare`
 * and act when the tool prepares the emptying of `held_keys` on its working copy, which is between the
 * copy and the rename, whichever way the working copy was written:
 *   - one sends the process SIGKILL there;
 *   - one deletes a row from the working copy there, so the copy honestly loses a row that the
 *     integrity check and the byte search cannot see. Only the row-count comparison can.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   1. Skip the row-count comparison in `rewriteOne` → the copy that lost a row replaces the original:
 *      "a copy that lost a row" goes red.
 *   2. Rewrite the original in place instead of a copy (the working copy's path is the file itself) →
 *      the killed run leaves the original changed: "killed between the copy and the rename" goes red.
 *   3. Take out the served-database refusal in `refusalOf` → the live path is read: its case goes red.
 *   4. Let `--dry` go on to the rewrite → the files change: the --dry case goes red.
 *   5. Write the copy to rewrite with `copyFileSync` from the original instead of `VACUUM INTO` → a key no
 *      search looks for stays in its free pages: "a key nobody holds any more" goes red.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Database from 'better-sqlite3'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { hashesFoundInTheBytesOf, REMOVED_MARK } from '../src/config/what-a-copy-must-not-carry.mjs'
import { canonicalDatabasePath } from '../src/config/settings.mjs'
import { migrateInPlace } from '../src/server/db/migrate.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'scripts', 'rewrite-a-backup.ts')
const BACKUP_SCRIPT = join(REPO, 'scripts', 'backup.ts')
const MIGRATIONS = join(REPO, 'drizzle')
const REWRITING = '.being-rewritten-'

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')
/** Two made-up agent keys and one made-up visitor token. No office ever issued them. */
const KEY_HASHES = [sha256('a made-up key for the rewrite test 7777'), sha256('another made-up key 7777')]
const TOKEN_HASH = sha256('a made-up visitor token for the rewrite test 7777')
const EVERY_HASH = [...KEY_HASHES, TOKEN_HASH]
/** A key hash neither the old backup's rows nor the office hold any more: only the backup's free pages do. No search looks for it. */
const HELD_BY_NOBODY = sha256('a made-up key nobody holds any more 7777')

let dir: string
let office: string

interface Ran {
  status: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
}

/** Run the tool, with any extra node options first, against the scratch office. */
function tool(args: readonly string[], nodeOptions: readonly string[] = []): Ran {
  const env: NodeJS.ProcessEnv = { ...process.env, MOLE_OFFICE_DB: office }
  for (const name of ['MOLE_OFFICE_API', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_SESSION', 'MOLE_OFFICE_AGENT']) delete env[name]
  const child = spawnSync(process.execPath, ['--import', 'tsx', ...nodeOptions, TOOL, ...args], {
    cwd: REPO,
    encoding: 'utf8',
    env,
    timeout: 120_000,
  })
  return { status: child.status, signal: child.signal, stdout: child.stdout ?? '', stderr: child.stderr ?? '' }
}

/** A scratch office: migrated, two held keys, and one confirmed visitor whose token hash is a held key too. */
function anOffice(at: string): string {
  mkdirSync(at, { recursive: true })
  const file = join(at, 'panelx.db')
  const db = new Database(file)
  try {
    db.pragma('journal_mode = WAL')
    migrateInPlace(db, MIGRATIONS)
    const hold = db.prepare(
      "INSERT INTO held_keys (id, whose_kind, whose_id, key_hash, made_at) VALUES (?, 'agent', ?, ?, '2026-09-25 10:00:00')",
    )
    KEY_HASHES.forEach((hash, i) => hold.run(`hk-${String(i)}`, `a-made-up-agent-${String(i)}`, hash))
    hold.run('hk-visitor', 'a-made-up-visitor', TOKEN_HASH)
    db.prepare(
      'INSERT INTO visitor_credentials (id, handle, name, role, token_hash, machine_how, standing, ' +
        'confirmed_by_kind, confirmed_by_id, confirmed_at, ends_at, issued_at) ' +
        "VALUES ('vc-rewrite-test', 'a-made-up-visitor', 'A made-up visitor', 'worker', ?, 'nobody could tell', " +
        `'trusted', 'person', '${THE_TEST_OFFICES_OWNER.id}', '2026-09-25 10:01:00', '2026-10-25 10:00:00', '2026-09-25 10:00:00')`,
    ).run(TOKEN_HASH)
  } finally {
    db.close()
  }
  return file
}

/** A backup made the old way: the online backup, then the key store emptied WITHOUT a rewrite. */
async function anOldBackup(to: string): Promise<string> {
  mkdirSync(join(to, '..'), { recursive: true })
  const source = new Database(office, { readonly: true, fileMustExist: true })
  try {
    await source.backup(to)
  } finally {
    source.close()
  }
  const db = new Database(to, { fileMustExist: true })
  try {
    db.prepare('DELETE FROM held_keys').run()
  } finally {
    db.close()
  }
  return to
}

/** Every table's row count, read from a copy so the file itself is never opened. */
function countsOf(file: string): Record<string, number> {
  const look = join(mkdtempSync(join(dir, 'look-')), 'look.db')
  copyFileSync(file, look)
  const db = new Database(look, { readonly: true, fileMustExist: true })
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]
    return Object.fromEntries(tables.map(({ name }) => [name, (db.prepare(`SELECT count(*) AS n FROM "${name}"`).get() as { n: number }).n]))
  } finally {
    db.close()
  }
}

/** One value read from a copy of the file. */
function oneValue<T>(file: string, sql: string): T {
  const look = join(mkdtempSync(join(dir, 'look-')), 'look.db')
  copyFileSync(file, look)
  const db = new Database(look, { readonly: true, fileMustExist: true })
  try {
    return (db.prepare(sql).get() as { v: T }).v
  } finally {
    db.close()
  }
}

/** Bytes and modification time, so "left exactly as it was" is a comparison and not a belief. */
function fingerprint(file: string): { bytes: Buffer; mtime: number } {
  return { bytes: readFileSync(file), mtime: statSync(file).mtimeMs }
}

/** A module for `--import` that wraps better-sqlite3's prepare and does `body` as the emptying of `held_keys` on the working copy is prepared. */
function aSeam(name: string, body: string): string {
  const at = join(dir, `${name}.mjs`)
  writeFileSync(
    at,
    `import { createRequire } from 'node:module'\n` +
      `const Database = createRequire(${JSON.stringify(join(REPO, 'package.json'))})('better-sqlite3')\n` +
      `const prepare = Database.prototype.prepare\n` +
      `Database.prototype.prepare = function (sql) {\n` +
      `  if (typeof sql === 'string' && sql.startsWith('DELETE FROM "held_keys"') && this.name.includes(${JSON.stringify(REWRITING)})) { ${body} }\n` +
      `  return prepare.call(this, sql)\n` +
      `}\n`,
  )
  return pathToFileURL(at).href
}

beforeAll(() => {
  dir = aTestDatabaseFolder('rewrite-a-backup')
  office = anOffice(join(dir, 'office'))
}, 60_000)

afterAll(() => {
  if (dir !== undefined) rmSync(dir, { recursive: true, force: true })
})

describe('a backup made the old way', () => {
  it('is rewritten with no key hash left in its bytes, its row counts unchanged and its integrity check ok', async () => {
    const backups = join(dir, 'old-way')
    const file = await anOldBackup(join(backups, 'mole-office-20260925-120000.db'))
    // THE FIXTURE SHOWS THE DEFECT, or a clean result below would prove nothing.
    expect(countsOf(file)['held_keys']).toBe(0)
    expect(hashesFoundInTheBytesOf(file, EVERY_HASH), 'the old-way fixture does not hold the hashes in its bytes').toBe(3)
    const before = countsOf(file)

    const run = tool([file])

    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0)
    expect(hashesFoundInTheBytesOf(file, EVERY_HASH), 'the rewritten backup still holds a hash').toBe(0)
    const after = countsOf(file)
    for (const [table, rows] of Object.entries(before)) expect(after[table], table).toBe(rows)
    expect(oneValue<string>(file, "SELECT token_hash AS v FROM visitor_credentials WHERE id = 'vc-rewrite-test'")).toBe(
      `${REMOVED_MARK}vc-rewrite-test`,
    )
    expect(oneValue<string>(file, 'SELECT integrity_check AS v FROM pragma_integrity_check')).toBe('ok')
    expect(run.stdout).toContain('Its bytes hold 3 of the 3 key hashes searched for')
    expect(run.stdout).toContain('REWRITTEN:')
    expect(run.stdout).toContain('1 visitor token hash cleared')
    expect(readdirSync(backups), 'the rewrite left something beside the backup').toEqual(['mole-office-20260925-120000.db'])
    for (const hash of EVERY_HASH) expect(run.stdout + run.stderr).not.toContain(hash)
  })

  it('and a key nobody holds any more, left in its free pages, is gone too: the rewrite starts from VACUUM INTO', async () => {
    const backups = join(dir, 'held-by-nobody')
    const file = await anOldBackup(join(backups, 'mole-office-20260925-150000.db'))
    const db = new Database(file, { fileMustExist: true })
    try {
      // PASTED INTO A ROW OF A TABLE THE BACKUP KEEPS, AND THAT ROW DELETED: the emptying of held_keys would
      // overwrite bytes in its own pages either way, so only how the working copy is written decides.
      db.pragma('secure_delete = OFF')
      db.prepare("INSERT INTO runtime_settings (name, value) VALUES ('a-made-up-note-held-by-nobody', ?)").run(`pasted by mistake: ${HELD_BY_NOBODY}`)
      db.prepare("DELETE FROM runtime_settings WHERE name = 'a-made-up-note-held-by-nobody'").run()
    } finally {
      db.close()
    }
    expect(hashesFoundInTheBytesOf(file, [HELD_BY_NOBODY]), 'the fixture does not hold the key in its bytes, so this proves nothing').toBe(1)

    const run = tool([file])

    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0)
    expect(hashesFoundInTheBytesOf(file, [HELD_BY_NOBODY]), 'the rewritten backup still holds a key nobody holds').toBe(0)
  })
})

describe('a rewrite killed between the copy and the rename', () => {
  it('leaves the original byte for byte as it was, and the folder of work in progress hidden', async () => {
    const backups = join(dir, 'killed')
    const file = await anOldBackup(join(backups, 'mole-office-20260925-130000.db'))
    const was = fingerprint(file)

    const killed = tool([file], ['--import', aSeam('kill-before-the-emptying', "process.kill(process.pid, 'SIGKILL')")])

    expect(killed.signal, `the tool was not killed:\n${killed.stdout}\n${killed.stderr}`).toBe('SIGKILL')
    const now = fingerprint(file)
    expect(now.bytes.equals(was.bytes), 'the killed rewrite changed the original').toBe(true)
    expect(now.mtime).toBe(was.mtime)
    const left = readdirSync(backups).sort()
    expect(left.length, left.join(', ')).toBe(2)
    expect(left[0]?.startsWith(`.mole-office-20260925-130000.db${REWRITING}`), left[0]).toBe(true)
    // AND A LATER RUN OVER THE FOLDER DOES NOT TAKE THAT HIDDEN FOLDER FOR A BACKUP.
    const dry = tool(['--dry', backups])
    expect(dry.status, dry.stderr).toBe(0)
    expect(dry.stdout).toContain('rewrite-a-backup --dry: 1 file.')
  })
})

describe('a copy that lost a row', () => {
  it('is caught by the row-count comparison, and the original is left as it was', async () => {
    const backups = join(dir, 'lost-a-row')
    const file = await anOldBackup(join(backups, 'mole-office-20260925-140000.db'))
    const was = fingerprint(file)
    const lose = aSeam('lose-a-row', "prepare.call(this, 'DELETE FROM visitor_credentials WHERE rowid = (SELECT min(rowid) FROM visitor_credentials)').run()")

    const run = tool([file], ['--import', lose])

    expect(run.status, run.stdout).toBe(1)
    expect(run.stdout).toContain('FAILED: the rewritten copy did not pass its checks')
    expect(run.stdout).toContain('`visitor_credentials`: the rewritten copy holds 0 rows, the original held 1')
    const now = fingerprint(file)
    expect(now.bytes.equals(was.bytes), 'a copy that lost a row replaced the original').toBe(true)
    expect(now.mtime).toBe(was.mtime)
    expect(readdirSync(backups)).toEqual(['mole-office-20260925-140000.db'])
  })
})

describe('what it refuses', () => {
  it('refuses the database this checkout serves, however it is named, and reads nothing of it', () => {
    const link = join(dir, 'a-link-to-the-office.db')
    symlinkSync(office, link)
    const was = fingerprint(office)
    for (const named of [office, link, canonicalDatabasePath()]) {
      const run = tool([named])
      expect(run.status, `${named}\n${run.stdout}`).toBe(1)
      expect(run.stdout).toContain('REFUSED: it is the database this checkout serves, not a backup.')
    }
    expect(fingerprint(office).bytes.equals(was.bytes)).toBe(true)
    expect(readdirSync(join(dir, 'office')).some((name) => name.includes(REWRITING))).toBe(false)
  })

  it('refuses a file that is not a backup of this office, and one of another installation', async () => {
    const place = join(dir, 'strangers')
    mkdirSync(place, { recursive: true })
    const text = join(place, 'notes.db')
    writeFileSync(text, 'not a database\n')
    const stranger = join(place, 'stranger.db')
    const db = new Database(stranger)
    db.exec('CREATE TABLE something_else (x)')
    db.close()
    const elsewhere = await anOldBackup(join(place, 'elsewhere.db'))
    const edit = new Database(elsewhere)
    edit.prepare("UPDATE installation SET id = 'another-installation' WHERE only_row = 1").run()
    edit.close()
    const was = [text, stranger, elsewhere].map(fingerprint)

    const run = tool([text, stranger, elsewhere])

    expect(run.status).toBe(1)
    expect(run.stdout).toContain("REFUSED: it does not start with SQLite's header, so it is not a backup of this office.")
    expect(run.stdout).toContain('REFUSED: it is not a Mole Office database this tool can rewrite.')
    expect(run.stdout).toContain('REFUSED: it is a backup of another installation')
    ;[text, stranger, elsewhere].forEach((file, i) => expect(fingerprint(file).bytes.equals(was[i]!.bytes), file).toBe(true))
  })

  it('names no folder by itself: with no path it prints its help and exits 2', () => {
    const run = tool([])
    expect(run.status).toBe(2)
    expect(run.stderr).toContain('Name at least one backup file or folder.')
  })
})

describe('--dry', () => {
  it('lists each backup with how many key hashes its bytes hold, and writes nothing', async () => {
    const backups = join(dir, 'dry')
    const old = await anOldBackup(join(backups, 'mole-office-20260925-150000.db'))
    // A BACKUP MADE THE NEW WAY, by the real command, beside it.
    const env: NodeJS.ProcessEnv = { ...process.env, MOLE_OFFICE_DB: office }
    for (const name of ['MOLE_OFFICE_API', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_SESSION', 'MOLE_OFFICE_AGENT']) delete env[name]
    const made = spawnSync(process.execPath, ['--import', 'tsx', BACKUP_SCRIPT, '--to', join(backups, 'mole-office-20260926-150000.db'), '--database-only'], {
      cwd: REPO,
      encoding: 'utf8',
      env,
      timeout: 120_000,
    })
    expect(made.status, made.stderr).toBe(0)
    writeFileSync(join(backups, 'mole-office-20260925-150000.left-out.txt'), 'a list of files left out\n')
    const names = readdirSync(backups).sort()
    const was = names.map((name) => fingerprint(join(backups, name)))

    const run = tool(['--dry', backups])

    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0)
    expect(run.stdout).toContain('rewrite-a-backup --dry: 2 files.')
    const [oldPart, newPart] = run.stdout.split(join(backups, 'mole-office-20260926-150000.db'))
    expect(oldPart).toContain(old)
    expect(oldPart).toContain('Its bytes hold 3 of the 3 key hashes searched for')
    expect(newPart).toContain('Its bytes hold 0 of the 3 key hashes searched for')
    expect(run.stdout).toContain('--dry changed nothing.')
    expect(run.stdout).toContain("it does not start with SQLite's header, so it is not a backup and was left alone.")
    expect(readdirSync(backups).sort(), 'the dry run added or removed something').toEqual(names)
    names.forEach((name, i) => {
      const now = fingerprint(join(backups, name))
      expect(now.bytes.equals(was[i]!.bytes), `${name} changed`).toBe(true)
      expect(now.mtime, `${name} was touched`).toBe(was[i]!.mtime)
    })
    for (const hash of EVERY_HASH) expect(run.stdout + run.stderr).not.toContain(hash)
    expect(existsSync(old)).toBe(true)
  })
})
