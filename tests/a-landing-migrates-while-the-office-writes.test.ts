// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LANDING THAT BRINGS A MIGRATION LANDS WHILE THE OFFICE KEEPS WRITING.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS FILE IS ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * On 10 October 2026 entry aKWEE_-0OCN2 brought migration 0212. The merge tool migrates the live database before
 * it moves main, and it tried ten times between 19:32 and 20:19. Each try failed with "database is locked" while
 * the live server went on writing, and the entry stalled in 'landing'. `migrateInPlace` read the file first and
 * wrote later in a plain transaction. SQLite refuses that first write at once when another connection committed
 * in between, and the busy timeout does not wait for it. The fourth try also said "THE ROLLBACK DID NOT HOLD"
 * over `records 55252 -> 55253`: the counts were compared after the lock was let go, so the server's own rows
 * were blamed on the migration.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS ASSERTED
 * ---------------------------------------------------------------------------------------
 *
 * A made-up office one migration behind main, and one small writer process writing a row every 2 ms while the
 * landing migrates it (tests/fixtures/a-server-that-keeps-writing.mjs). The landing must apply the migration
 * once, the writer must lose no write and must have written while it ran, and a refusal must say nothing was
 * written without blaming anything on the migration. Nothing else loads the machine.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { MIGRATIONS, oneMigrationBehind, theNewestMigration } from './an-office-one-migration-behind.ts'
import { afterEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { migrateInPlace } from '../src/server/db/migrate.ts'
import { THE_MIGRATION_JOURNAL_TABLE } from '../src/config/migration-look.mjs'

const WRITER = fileURLToPath(new URL('./fixtures/a-server-that-keeps-writing.mjs', import.meta.url))
const TRIALS = 5

const open: { dir: string; db: Database.Database; writer: ChildProcessWithoutNullStreams | null }[] = []

afterEach(() => {
  while (open.length > 0) {
    const one = open.pop()
    if (one === undefined) continue
    if (one.writer !== null && one.writer.exitCode === null) one.writer.kill('SIGTERM')
    one.db.close()
    rmSync(one.dir, { recursive: true, force: true })
  }
})

interface AnOffice {
  db: Database.Database
  file: string
  keep: (typeof open)[number]
}

/** A live office one migration behind main, in WAL mode as the server opens it. */
function anOfficeOneMigrationBehind(name: string): AnOffice {
  const dir = mkdtempSync(join(tmpdir(), `mole-office-${name}-`))
  const file = join(dir, 'panelx.db')
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  migrateInPlace(db, oneMigrationBehind(dir))
  const keep = { dir, db, writer: null }
  open.push(keep)
  return { db, file, keep }
}

/** Start the writer and wait for its first row. Stop it to learn how many it wrote and how many failed. */
async function aServerThatKeepsWriting(office: AnOffice): Promise<() => Promise<{ wrote: number; failed: number }>> {
  const writer = spawn(process.execPath, [WRITER, office.file, THE_TEST_OFFICES_OWNER.id, '2'])
  office.keep.writer = writer
  let out = ''
  writer.stdout.on('data', (chunk: Buffer) => {
    out += String(chunk)
  })
  await new Promise<void>((ready, failed) => {
    writer.stdout.on('data', () => {
      if (out.includes('ready\n')) ready()
    })
    writer.once('exit', (code) => failed(new Error(`the writer stopped before its first row, code ${String(code)}`)))
  })
  // Long enough that the writer is between writes many times over before the landing starts.
  await new Promise((wait) => setTimeout(wait, 100))
  return async () => {
    const exited = new Promise((done) => writer.once('exit', done))
    writer.stdin.write('stop\n')
    await exited
    const last = out.trim().split('\n').at(-1) ?? ''
    return JSON.parse(last) as { wrote: number; failed: number }
  }
}

function writerRows(db: Database.Database): number {
  const row = db.prepare("SELECT count(*) AS n FROM records WHERE id LIKE 'keptwriting%'").get() as { n: number }
  return row.n
}

function journaled(db: Database.Database, hash: string): number {
  const row = db.prepare(`SELECT count(*) AS n FROM "${THE_MIGRATION_JOURNAL_TABLE}" WHERE hash = ?`).get(hash) as { n: number }
  return row.n
}

describe('a landing migrates the live office while it writes', () => {
  it(`applies the migration once, in ${String(TRIALS)} landings out of ${String(TRIALS)}, and the writer loses no write`, async () => {
    const newest = theNewestMigration()
    for (let trial = 1; trial <= TRIALS; trial++) {
      const office = anOfficeOneMigrationBehind(`landing-${String(trial)}`)
      // THE CONTROL: the office really is one migration behind before the landing.
      expect(journaled(office.db, newest), `trial ${String(trial)}: the office already had the newest migration`).toBe(0)
      const stop = await aServerThatKeepsWriting(office)
      const rowsBefore = writerRows(office.db)

      let said: string | null = null
      let outcome: ReturnType<typeof migrateInPlace> | null = null
      try {
        outcome = migrateInPlace(office.db, MIGRATIONS)
      } catch (err) {
        said = err instanceof Error ? err.message : String(err)
      }
      // Wait until the writer has written after the landing, so "it went on writing" is a fact and not a hope.
      while (writerRows(office.db) <= rowsBefore + 2) await new Promise((wait) => setTimeout(wait, 5))
      const writer = await stop()

      expect(said, `trial ${String(trial)}: the landing refused while the office wrote`).toBeNull()
      expect(outcome?.newlyApplied, `trial ${String(trial)}`).toBe(1)
      expect(journaled(office.db, newest), `trial ${String(trial)}`).toBe(1)
      expect(writer.failed, `trial ${String(trial)}: the writer lost writes while the landing held the lock`).toBe(0)
      expect(writerRows(office.db), `trial ${String(trial)}`).toBe(writer.wrote)
      expect(outcome?.heldTheWriteLockMs, `trial ${String(trial)}`).toBeGreaterThanOrEqual(0)
    }
  }, 60_000)

  it('says nothing was written when a step refuses, and blames none of the writer\'s rows on the migration', async () => {
    const newest = theNewestMigration()
    for (let trial = 1; trial <= TRIALS; trial++) {
      const office = anOfficeOneMigrationBehind(`refusal-${String(trial)}`)
      // The module-claims step refuses a module with claims in a project with no repository
      // (tests/a-refusal-writes-nothing.test.ts says why).
      const at = '2026-10-10 20:00:00'
      office.db
        .prepare(
          'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data) ' +
            "VALUES ('refusemodule1', 'default', ?, ?, ?, 'module', 'Tray clamp control', null, ?)",
        )
        .run(THE_TEST_OFFICES_OWNER.id, at, at, JSON.stringify({ context: 'the hand', claims: ['src/gripper'] }))
      const stop = await aServerThatKeepsWriting(office)

      let said = ''
      try {
        migrateInPlace(office.db, MIGRATIONS)
      } catch (err) {
        said = err instanceof Error ? err.message : String(err)
      }
      const writer = await stop()

      // THE CONTROL: the step refused, so the sentences below are about a refusal that happened.
      expect(said, `trial ${String(trial)}`).toContain('will not decide which repository a claim is relative to')
      expect(said, `trial ${String(trial)}`).not.toContain('THE ROLLBACK DID NOT HOLD')
      expect(said, `trial ${String(trial)}`).toContain('NOTHING WAS WRITTEN BY ANY STEP OF THIS COMMAND')
      expect(journaled(office.db, newest), `trial ${String(trial)}: the schema half was kept`).toBe(0)
      expect(writer.failed, `trial ${String(trial)}`).toBe(0)
      expect(writerRows(office.db), `trial ${String(trial)}`).toBe(writer.wrote)
    }
  }, 60_000)
})
