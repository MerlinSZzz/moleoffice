// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `npm run db:reset` MUST NOT DELETE A DATABASE SOMEBODY IS USING.
 *
 * scripts/reset.ts deletes a database and seeds a fresh one. Its default target is the same path
 * the server uses, so a bare `npm run db:reset` destroyed the working corpus — one word away from
 * `npm run db:migrate` in the same package.json, on a project whose only copy of its own research
 * record lives at that path.
 *
 * Nobody had run it by accident yet. A cold acceptance campaign found it by reading the script, and
 * that is luck rather than a guard. The rule is the one this repository already keeps: fail loudly
 * on a broken assumption, and stay quiet where there is no assumption to break — an absent or empty
 * database is what this script is FOR.
 *
 * IT RUNS THE REAL COMMAND AS A SUBPROCESS, for the same reason tests/migration.test.ts does: the
 * guard is only reachable when node is pointed at the file, and a guard that silently stopped
 * firing would be the quietest possible failure.
 *
 * A STAND-IN OFFICE ANSWERS THE LEDGER. Before it deletes a file, the command asks the office whether
 * a live world holds it, so every run here is pointed at a server of this test's own that says
 * nothing holds it. No run reaches a real office. tests/a-reset-asks-the-ledger-first.test.ts is
 * where the ledger's other answers are tried.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const work = aTestDatabaseFolder('reset')

/** The stand-in office, and the database each request to it asked about. */
let office: Server
let api = ''
let asked: (string | null)[] = []

beforeAll(async () => {
  office = createServer((req, reply) => {
    req.resume()
    const url = new URL(req.url ?? '/', 'http://stand-in')
    const database = url.searchParams.get('database')
    asked.push(url.pathname === '/api/resources/holding' ? database : `another door: ${url.pathname}`)
    reply.writeHead(200, { 'content-type': 'application/json' })
    reply.end(JSON.stringify({ askedAbout: { ports: [], database }, holders: [], openButGone: [],
      says: `No live ledger row holds the database ${String(database)}.` }))
  })
  await new Promise<void>((done) => office.listen(0, '127.0.0.1', done))
  api = `http://127.0.0.1:${String((office.address() as AddressInfo).port)}`
})

beforeEach(() => {
  asked = []
})

afterAll(async () => {
  await new Promise<void>((done) => office.close(() => done()))
  rmSync(work, { recursive: true, force: true })
})

/**
 * Run the real command against `file`, and hand back what the operator would see. Not execFileSync:
 * a child that blocks this process would leave the stand-in office unable to answer it.
 */
function reset(file: string, env: Record<string, string> = {}): Promise<{ code: number | null; out: string }> {
  const settings: NodeJS.ProcessEnv = { ...process.env, MOLE_OFFICE_DB: file, MOLE_OFFICE_API: api, ...env }
  for (const key of ['MOLE_OFFICE_PORT', 'MOLE_AGENT_KEY']) delete settings[key]
  return new Promise((done, bad) => {
    const child = spawn('npx', ['tsx', 'scripts/reset.ts'], { cwd: REPO, env: settings, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (bytes) => { out += String(bytes) })
    child.stderr.on('data', (bytes) => { out += String(bytes) })
    child.on('error', bad)
    child.on('close', (code) => done({ code, out }))
  })
}

/** A migrated database with nothing in it, which is the state every fixture below starts from. */
function migrated(file: string): void {
  execFileSync('npx', ['tsx', 'src/server/db/migrate.ts'], {
    cwd: REPO,
    env: { ...process.env, MOLE_OFFICE_DB: file },
    stdio: 'ignore',
  })
}

/** A database holding `n` records, made the way the product makes one. */
function withRecords(file: string, n: number): void {
  migrated(file)
  const db = new Database(file)
  try {
    const insert = db.prepare(
      "INSERT INTO records (id, kind, workspace_id, owner_id, title, summary, data, created_at, updated_at) " +
        `VALUES (?, 'note', 'default', '${THE_TEST_OFFICES_OWNER.id}', ?, NULL, '{}', '2026-08-12 09:00:00', '2026-08-12 09:00:00')`,
    )
    for (let i = 0; i < n; i += 1) insert.run(`r${i}`, `record ${i}`)
  } finally {
    db.close()
  }
}

/**
 * A database holding a fortnight of PLANNING and no records at all.
 *
 * NOT AN INVENTED SHAPE. It is what a plan is for — rough thinking before it is anything — and
 * `plans`, `plan_lines`, `planning_capacity` and `planning_recurrences` have no `workspace_id` and
 * no record between them. Somebody who opens Mole Office, writes a week of plan and has not yet filed
 * a record has exactly this file. (It used to be a row of `planning_drafts`, until migration 0196
 * moved every draft into a plan and dropped that table.)
 */
function withPlanOnly(file: string): void {
  migrated(file)
  const db = new Database(file)
  try {
    db.prepare(
      'INSERT INTO plans (id, title, state, read_at, created_at, updated_at, created_by, moved_from_draft) ' +
        'VALUES (?, ?, ?, NULL, ?, ?, ?, NULL)',
    ).run('p1', 'ICRA submission', 'open', STAMP, STAMP, `human:${THE_TEST_OFFICES_OWNER.id}`)
    db.prepare(
      'INSERT INTO plan_lines (id, plan_id, position, text, record_id, remark, updated_at, updated_by) ' +
        'VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)',
    ).run('l1', 'p1', 1, 'target: September', STAMP, `human:${THE_TEST_OFFICES_OWNER.id}`)
    db.prepare(
      'INSERT INTO planning_capacity (horizon, period, hours, note, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('week', '2026-W36', 22, 'three teaching days', STAMP, `human:${THE_TEST_OFFICES_OWNER.id}`)
    db.prepare(
      'INSERT INTO planning_recurrences (id, record_id, every, days, hours_each, created_at, updated_at, created_by) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run('r1', 'no-record-yet', 'weekdays', '1,3,5', 0.5, STAMP, STAMP, `human:${THE_TEST_OFFICES_OWNER.id}`)
    // THE FIXTURE IS ONLY WORTH ANYTHING IF THERE REALLY ARE NO RECORDS: the guard this is about
    // used to ask `records` and nothing else, so a fixture with one record would pass whatever the
    // product did.
    const records = (db.prepare('SELECT count(*) AS n FROM records').get() as { n: number }).n
    expect(records, 'the fixture holds records, so it does not test the planning-only case').toBe(0)
  } finally {
    db.close()
  }
}

/** One stamp for every fixture row. Local wall clock, the way shared/time.ts writes it. */
const STAMP = '2026-08-12 09:00:00'

describe('resetting a database that holds work', () => {
  it('refuses, names what is in it, and changes nothing', async () => {
    const file = join(work, 'held.db')
    withRecords(file, 3)

    const { code, out } = await reset(file)

    expect(code, 'the command succeeded against a database holding records').not.toBe(0)
    expect(out).toContain('REFUSING')
    // The count is the evidence, not an adjective: an operator has to be able to tell whether the
    // thing it is protecting is their corpus or a leftover.
    expect(out).toContain('3 records')
    expect(out).toContain(file)
    // Both ways on, so the refusal is actionable rather than merely obstructive.
    expect(out).toContain('MOLE_OFFICE_DB=/tmp/scratch.db')
    expect(out).toContain('MOLE_OFFICE_RESET_YES_DELETE_MY_DATA=1')

    const after = new Database(file, { readonly: true })
    try {
      expect((after.prepare('SELECT count(*) AS n FROM records').get() as { n: number }).n).toBe(3)
    } finally {
      after.close()
    }
  }, 120_000)

  it('goes ahead when the operator says so in words, once the ledger says no live world holds it', async () => {
    const file = join(work, 'consented.db')
    withRecords(file, 2)

    const { code, out } = await reset(file, { MOLE_OFFICE_RESET_YES_DELETE_MY_DATA: '1' })

    expect(code, out).toBe(0)
    // The word passes the count, and never the ledger: the file was asked about before it went.
    expect(asked).toEqual([file])
    // The seed replaced it, so the two hand-written rows are gone and the corpus is the seed's.
    const after = new Database(file, { readonly: true })
    try {
      const n = (after.prepare('SELECT count(*) AS n FROM records').get() as { n: number }).n
      expect(n).toBeGreaterThan(2)
    } finally {
      after.close()
    }
  }, 300_000)

  /**
   * THE CASE THE GUARD USED TO WALK STRAIGHT PAST, measured on 2026-08-12.
   *
   * `scripts/reset.ts` counted `records` and nothing else, so a database holding a draft, a
   * capacity row and a recurrence and NO records was deleted and reseeded: `reset: done — fresh
   * database at …`, exit 0, 290 fixture records where the plan had been, and not one word about
   * what had gone. One `note` record was enough to protect a database; a fortnight of planning was
   * not.
   *
   * The guard now reads `IRREPLACEABLE_TABLES` from db/migration-declared-tables.ts, so this test goes red the moment
   * it goes back to asking one table's name.
   */
  it('refuses a database holding only a plan, and names each table it found rows in', async () => {
    const file = join(work, 'plan-only.db')
    withPlanOnly(file)

    const { code, out } = await reset(file)

    expect(code, 'the command deleted a database holding a plan and no records').not.toBe(0)
    expect(out).toContain('REFUSING')
    // Each table by name with its count, because "1 plans" is what tells an operator
    // whether the thing being protected is their week or a leftover.
    expect(out).toContain('1 plans')
    expect(out).toContain('1 plan_lines')
    expect(out).toContain('1 planning_capacity')
    expect(out).toContain('1 planning_recurrences')
    expect(out).toContain(file)

    const after = new Database(file, { readonly: true })
    try {
      expect((after.prepare('SELECT count(*) AS n FROM plans').get() as { n: number }).n).toBe(1)
      expect((after.prepare('SELECT title FROM plans').get() as { title: string }).title).toBe(
        'ICRA submission',
      )
      // And nothing was reseeded over the top of it.
      expect((after.prepare('SELECT count(*) AS n FROM records').get() as { n: number }).n).toBe(0)
    } finally {
      after.close()
    }
  }, 120_000)

  it('says nothing at all where there is nothing to protect, and asks no office', async () => {
    // The case the script exists for. A guard that warned here would be a guard turned off within
    // a week, and the test suite and the review tool build throwaway databases constantly.
    const file = join(work, 'fresh.db')
    expect(existsSync(file)).toBe(false)

    const { code, out } = await reset(file)

    expect(code, out).toBe(0)
    expect(out).not.toContain('REFUSING')
    // No file, nothing to delete, so nothing for the ledger to be asked about.
    expect(asked).toEqual([])
  }, 300_000)
})
