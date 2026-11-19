// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ISOLATED OFFICE STARTS ON A COPY WITH THOUSANDS OF CROSS-PROJECT LINKS. Problem P1-fTNDwwF2H.
 *
 * tools/isolated-mole-office.mjs runs src/server/db/migrate.ts on its copy through spawnSync. The workspace
 * migration printed one note of about 500 bytes per link joining two projects: 2,077 on the 3 October copy
 * of the owner's corpus, 1.1 MB, past spawnSync's default 1 MiB buffer. The child was killed, its status was
 * null, the tool said the migration had failed, and a 1.9 GB copy.db was left in a folder nothing lists.
 *
 * WHAT IS PROVED:
 *   1. a start on a seeded copy with 3,000 cross-project links (over 1 MiB of the old report) succeeds, and
 *      the migration says them in one count line, not one line each;
 *   2. a child killed because its output outgrew the buffer is reported as killed, and one ended by a signal
 *      as ended, never as "the migration failed";
 *   3. a start whose migration fails deletes its instance folder, so no copy is left that nothing lists;
 *   4. a start refuses a same-named folder that an earlier failed start left with something in it and no
 *      where.json, and touches nothing in it (round 21, note uMMNhE4c6fWS).
 *
 * MUTATIONS, in the commit message:
 *   - one note per link again in src/server/db/workspace-migration.ts: case 1 goes red;
 *   - the ENOBUFS branch taken out of whyTheMigrationStopped: case 2 goes red;
 *   - the rmSync taken out of failTheStart: case 3 goes red;
 *   - the refusal of a non-empty folder taken out of start(): case 4 goes red.
 *
 * Every copy this file makes is removed by its own path in afterAll, except a world whose stop was refused or failed.
 * That world's folder is kept, because it may still be running, and the file fails and says so. The ledger stand-in
 * answering 500 to the holding question makes the stop refuse: afterAll goes red, and the world is then stopped by hand.
 */
import { execFile, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import Database from 'better-sqlite3'
import { afterAll, describe, expect, it } from 'vitest'

import { whyTheMigrationStopped } from '../tools/isolated-mole-office.mjs'
import { freshDb, type TestDb } from './helpers.ts'

const run = promisify(execFile)
const LINKS = 3000
const FROM_HERE = 60
const FROM_THERE = 50
const started = `full-copy-${String(process.pid)}`
const refused = `full-copy-refused-${String(process.pid)}`
const leftOver = `full-copy-left-${String(process.pid)}`
const scratch = mkdtempSync(join(tmpdir(), 'mole-office-full-copy-'))

let seeded: TestDb | undefined

/** The tool's environment, without the database this test process points at. */
function toolEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env['MOLE_OFFICE_DB']
  return env
}

/**
 * A STAND-IN LEDGER FOR `stop`, which asks an office whether a live world holds the world's ports or its
 * database before it stops anything. This one holds nothing. Without it the stop
 * would ask the address in .env, which the test guard refuses, and the world would be left running.
 */
async function aLedgerThatHoldsNothing(): Promise<{ api: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    req.resume()
    res.setHeader('content-type', 'application/json')
    if (req.url?.startsWith('/api/resources/holding?') === true) {
      // The question is said back, as the real door says it back.
      const query = new URL(req.url, 'http://stand-in').searchParams
      const askedAbout = { ports: (query.get('ports') ?? '').split(',').filter((one) => one !== '').map(Number), database: query.get('database') }
      res.end(JSON.stringify({ askedAbout, holders: [], openButGone: [], says: 'No live ledger row holds them.' }))
      return
    }
    res.statusCode = 500
    res.end(JSON.stringify({ error: 'Unexpected test request: ' + String(req.url) }))
  })
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  const address = server.address() as AddressInfo
  return { api: `http://127.0.0.1:${String(address.port)}`, close: () => new Promise((ok) => server.close(() => ok())) }
}

/**
 * THE WORLD CASE 1 STARTED IS STOPPED BY THE TOOL'S OWN STOP, which deletes the world's folder once the world has
 * stopped. A stop that is refused or fails leaves the world running, and its where.json is the only place its process
 * groups are written. So that folder and the scratch folder the world reads are kept, and the file fails and says so.
 * Deleting them anyway once left serve-dev, its server and vite running with nothing that recorded their group ids.
 */
afterAll(async () => {
  const world = join('.logs', 'isolated', started)
  let notStopped: string | null = null
  if (existsSync(join(world, 'where.json'))) {
    const ledger = await aLedgerThatHoldsNothing()
    notStopped = await run('node', ['tools/isolated-mole-office.mjs', 'stop', started], { env: { ...toolEnv(), MOLE_OFFICE_API: ledger.api }, timeout: 120_000 })
      .then(() => (existsSync(world) ? 'its stop exited 0 and left its folder' : null), (err: unknown) => (err instanceof Error ? err.message : String(err)))
      .finally(() => ledger.close())
  }
  for (const place of [join('.logs', 'isolated', refused), join('.logs', 'isolated', leftOver)]) rmSync(place, { recursive: true, force: true })
  seeded?.close()
  if (notStopped !== null) {
    throw new Error(
      `the world "${started}" was not stopped, so it may still be running. Its folder ${world} is kept, and its ` +
        `where.json names its process groups; so is ${scratch}. \`node tools/stray-servers.mjs\` names what is left. ` +
        `The stop said: ${notStopped}`,
    )
  }
  rmSync(world, { recursive: true, force: true })
  rmSync(scratch, { recursive: true, force: true })
}, 180_000)

describe('an isolated office on a copy with thousands of cross-project links', () => {
  it('starts, and the migration says the links in one count line', async () => {
    seeded = await freshDb()
    const t = seeded
    t.client.sqlite
      .prepare("INSERT INTO workspaces (id, title, created_at, updated_at) VALUES ('elsewhere', 'Elsewhere', ?, ?)")
      .run('2026-10-04 12:00:00', '2026-10-04 12:00:00')
    const actor = { type: 'agent' as const, id: 'full-copy-test' }
    const here = Array.from({ length: FROM_HERE }, (_, i) => t.api.createRecord({ workspaceId: 'default', kind: 'task', title: `here ${String(i)}`, data: { state: 'todo' }, actor }).id)
    const there = Array.from({ length: FROM_THERE }, (_, i) => t.api.createRecord({ workspaceId: 'elsewhere', kind: 'task', title: `there ${String(i)}`, data: { state: 'todo' }, actor }).id)
    const link = t.client.sqlite.prepare(
      'INSERT INTO links (owner_id, id, workspace_id, from_id, to_id, type, created_by, created_at, updated_at) ' +
        "SELECT owner_id, ?, 'default', ?, ?, 'relates_to', 'full-copy-test', '2026-10-04 12:00:00', '2026-10-04 12:00:00' FROM records WHERE id = ?",
    )
    t.client.sqlite.transaction(() => {
      let n = 0
      for (const from of here) for (const to of there) link.run(`cross-${String(n++)}`, from, to, from)
    })()
    t.client.sqlite.pragma('wal_checkpoint(TRUNCATE)')
    const crossing = t.client.sqlite
      .prepare('SELECT COUNT(*) AS n FROM links l JOIN records a ON a.id = l.from_id JOIN records b ON b.id = l.to_id WHERE a.workspace_id <> b.workspace_id')
      .get() as { n: number }
    expect(crossing.n).toBe(LINKS)

    const out = await run('node', ['tools/isolated-mole-office.mjs', 'start', started, '--from', t.file], { env: toolEnv(), timeout: 240_000, maxBuffer: 64 * 1024 * 1024 })
    expect(existsSync(join('.logs', 'isolated', started, 'where.json'))).toBe(true)
    expect(out.stdout).toContain(`${String(LINKS)} links join two records in different projects`)
    expect(out.stdout).not.toContain('DELETE /api/links/cross-')
    expect(out.stdout.length, 'the whole output of the start').toBeLessThan(256 * 1024)
  }, 300_000)
})

describe('a migration child that did not finish', () => {
  it('is reported as killed when its report outgrew the buffer, and as ended when a signal stopped it', () => {
    const oneMiB = 1024 * 1024
    const outgrew = spawnSync(process.execPath, ['-e', `process.stdout.write('x'.repeat(${String(2 * oneMiB)}))`], { encoding: 'utf8', maxBuffer: oneMiB })
    const said = whyTheMigrationStopped(outgrew, oneMiB)
    expect(said).toContain("the migration's report outgrew the 1048576-byte output buffer")
    expect(said).not.toContain('the migration failed')

    const killed = spawnSync(process.execPath, ['-e', "process.kill(process.pid, 'SIGKILL')"], { encoding: 'utf8' })
    const ended = whyTheMigrationStopped(killed, oneMiB)
    expect(ended).toContain('ended by the signal SIGKILL')
    expect(ended).not.toContain('the migration failed')

    const fine = spawnSync(process.execPath, ['-e', "process.stdout.write('ok')"], { encoding: 'utf8' })
    expect(whyTheMigrationStopped(fine, oneMiB)).toBeNull()
  })
})

describe('a start that fails', () => {
  it('deletes its instance folder, so no copy is left that nothing lists', async () => {
    // A FILE WITH A `records` TABLE AND NOTHING ELSE: the copy step takes it, and the migration then fails on it.
    const source = join(scratch, 'only-a-records-table.db')
    const db = new Database(source)
    db.exec("CREATE TABLE records (id TEXT PRIMARY KEY); INSERT INTO records (id) VALUES ('one')")
    db.close()

    const ended = await run('node', ['tools/isolated-mole-office.mjs', 'start', refused, '--from', source], { env: toolEnv(), timeout: 120_000 }).then(
      () => null,
      (err: { code?: number; stderr?: string }) => err,
    )
    expect(ended, 'the start was expected to be refused').not.toBeNull()
    expect(ended?.code).toBe(1)
    expect(ended?.stderr ?? '').toContain('the copy could not be brought up to date, because the migration failed: it exited 1')
    expect(ended?.stderr ?? '').toContain('has been DELETED')
    expect(existsSync(join('.logs', 'isolated', refused))).toBe(false)
  }, 180_000)
})

describe('a folder left by an earlier start that did not finish', () => {
  it('is refused with its contents untouched, instead of being reused', async () => {
    // WHAT AN EARLIER FAILED START LEAVES: something in the folder, and no where.json.
    const folder = join('.logs', 'isolated', leftOver)
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, 'copy.db'), 'left by an earlier start')
    // A source the migration fails on, so a start that reused the folder would fail and delete it.
    const source = join(scratch, 'only-a-records-table-again.db')
    const db = new Database(source)
    db.exec("CREATE TABLE records (id TEXT PRIMARY KEY); INSERT INTO records (id) VALUES ('one')")
    db.close()

    const ended = await run('node', ['tools/isolated-mole-office.mjs', 'start', leftOver, '--from', source], { env: toolEnv(), timeout: 120_000 }).then(
      () => null,
      (err: { code?: number; stderr?: string }) => err,
    )
    expect(ended, 'the start was expected to be refused').not.toBeNull()
    expect(ended?.code).toBe(1)
    expect(ended?.stderr ?? '').toContain('already holds 1 thing(s) (copy.db) and no where.json')
    expect(ended?.stderr ?? '').toContain('nothing in it was touched')
    expect(readFileSync(join(folder, 'copy.db'), 'utf8')).toBe('left by an earlier start')
  }, 180_000)
})
