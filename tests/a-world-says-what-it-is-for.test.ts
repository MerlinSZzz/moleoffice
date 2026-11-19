// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION P87, FIRST AND SECOND PARTS: A WORLD THE TOOL STARTS IS A ROW CARRYING WHAT IT IS FOR
 * AND ITS REAL STARTER.
 *
 * Criterion P87 of design/permissions/ACCEPTANCE.md: the running test worlds could not be seen from the
 * main world. A world started by `tools/isolated-mole-office.mjs` is one row in the office's
 * worlds table with, among other things, what it is for and who started it.
 *
 * WHAT WAS MEASURED BEFORE THIS. Every server self-registers at boot, and the actor on that call is
 * the server itself, so row `aKOCfvX0LZmO` — started by the tool from
 * ~/.cache/mole-office/worktrees/<an agent's worktree> — read `startedBy: mole-office/the-api-server`, not the
 * agent that asked for it. And the table had no column at all for what the world was for.
 *
 * THE TOOL CARRIES BOTH INTO THE WORLD'S ENVIRONMENT, and `registerThisWorld` writes them onto the
 * row: `MOLE_OFFICE_WORLD_PURPOSE` is the sentence the starter gave, and `MOLE_OFFICE_WORLD_STARTED_BY`
 * is the agent the run works as, which the tool already reads from the office for rule 5 of chapter 8.
 *
 * THE MUTATION THIS IS WRITTEN AGAINST: stop passing the purpose through the tool's env block and the
 * first case goes red — the world's own row reads null. Control run first.
 *
 * PROBLEM 6Kp5LosUARas: the first and third cases give their worlds one `--vite-cache` folder, so the third case's world
 * does not bundle the browser app's dependencies again. MUTATIONS, each run alone after a green control (5 November
 * 2026): the tool drops the folder in environmentForTheWorld, in start, or on its command line, and the first and third
 * cases are red. On the tool before the option, the option is refused and the three cases that start or stop a world
 * are red.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { liveApp, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const run = promisify(execFile)
// THE WORLD IS NAMED FOR THIS PROCESS (problem b2WEgFgtb_uw): a stop that failed keeps its world's folder on purpose, and
// a later start of the same name in the same clone then refuses, so the queue's reruns, which are how it tells a flake
// from a real red, all failed at start. A name of this process's own never meets an earlier run's leftovers.
const name = `cw-purpose-${String(process.pid)}`

/**
 * ONE CACHE FOR BOTH WORLDS, named by --vite-cache (problem 6Kp5LosUARas). The tool gives every world a cache of its own,
 * in the world's folder, unless the option names one. So the MOLE_OFFICE_VITE_CACHE this file used to set reached no Vite,
 * and the third case's world bundled the browser app's dependencies again from nothing. In a suite run of 5 November 2026,
 * that world was still bundling when its 90 s wait for the first page ran out. The first world fills this folder, and the
 * third one reads it.
 */
const viteCache = () => join(app.dir, 'world-vite-cache')
/**
 * The file Vite writes once it has bundled the browser app's dependencies. A Vite that finds it stale deletes it before
 * its first page answers, and writes it again later.
 */
const bundled = () => join(viteCache(), 'deps', '_metadata.json')
/**
 * HOW LONG THE FIRST WORLD'S BUNDLE MAY TAKE AFTER ITS FIRST PAGE ANSWERS. Vite bundles after it has started to answer, and
 * it took 2.3 s on 5 November 2026 with nothing else running. The third case can only read the bundle if it was written
 * before the second case stops this world. The wait and the start fit in the case's 180 s.
 */
const BUNDLED_WITHIN_MS = 25_000

async function untilBundled(): Promise<boolean> {
  const deadline = Date.now() + BUNDLED_WITHIN_MS
  while (!existsSync(bundled())) {
    if (Date.now() > deadline) return false
    await new Promise((ok) => setTimeout(ok, 250))
  }
  return true
}
/**
 * EACH OF A START'S TWO WAITS, for the API and for the browser app, may take this long. Both fit in the 150 s a run of the
 * tool is given, so a slow start fails with the tool's own words and rolls itself back. The tool has no handler for the
 * signal the run limit sends, so a run killed at the limit leaves the world's servers running.
 */
const READY_WITHIN = '60'

let app: LiveApp

const asPerson: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': 'default',
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers: asPerson, body: JSON.stringify(body) })
  const said = (await res.json()) as Record<string, unknown>
  expect(res.status, JSON.stringify(said)).toBeLessThan(300)
  return said
}

beforeAll(async () => {
  app = await liveApp({ name: 'a-world-says-what-it-is-for', viewport: { width: 1440, height: 900 }, workspace: 'default' })
}, 180_000)

afterAll(async () => {
  try {
    await run('node', ['tools/isolated-mole-office.mjs', 'stop', name])
  } catch (err) {
    // THE STOP TOOL SAYS WHY ON ITS STANDARD OUTPUT, which the error alone does not carry, so it is put into the
    // failure: the reason a release was refused was lost once already (problem b2WEgFgtb_uw).
    const said = err as { message?: string; stdout?: string; stderr?: string }
    if (!String(err).includes('Nothing here calls itself')) {
      throw new Error(`The world ${name} did not stop: ${said.message ?? String(err)}\n${said.stdout ?? ''}\n${said.stderr ?? ''}`)
    }
  }
  await app?.stop()
}, 120_000)

describe('the tool carries the purpose and the real starter into the world’s row', () => {
  it('writes what the world is for and the agent that started it, not the api server', async () => {
    const session = (await post('/api/records', {
      kind: 'session',
      title: 'The run that started a world for the person',
      data: { state: 'running', servingAgent: 'builder-cw' },
    }))['record'] as { id: string }

    await run(
      'node',
      [
        'tools/isolated-mole-office.mjs',
        'start',
        name,
        '--from',
        join(app.dir, 'panelx.db'),
        '--show-to-the-person',
        '--run',
        session.id,
        '--purpose',
        'the check panel on a run that was refused',
        '--api',
        app.api,
        '--workspace',
        'default',
        '--vite-cache',
        viteCache(),
        '--ready-within',
        READY_WITHIN,
      ],
      { timeout: 150_000 },
    )
    expect(await untilBundled(), `the world wrote no bundled dependencies within ${String(BUNDLED_WITHIN_MS / 1000)} s in ${viteCache()}, the folder --vite-cache names`).toBe(true)

    const where = JSON.parse(readFileSync(`.logs/isolated/${name}/where.json`, 'utf8')) as { db: string }
    // THE WORLD'S OWN ROW, read from the copy it serves. The office's copy is written by the world's
    // self-report, which a test runner refuses on purpose; this is the same write the office gets.
    const Database = (await import('better-sqlite3')).default
    const db = new Database(where.db, { readonly: true, fileMustExist: true })
    let rows: { name: string; purpose: string | null; started_by_id: string | null; kind: string }[]
    try {
      rows = db.prepare('SELECT name, purpose, started_by_id, kind FROM worlds').all() as typeof rows
    } finally {
      db.close()
    }
    const mine = rows.find((one) => one.purpose !== null) ?? null
    expect(mine, `no row in the world's own table carries a purpose: ${JSON.stringify(rows)}`).not.toBeNull()
    expect(mine?.purpose).toBe('the check panel on a run that was refused')
    expect(mine?.started_by_id).toBe('builder-cw')
    expect(mine?.started_by_id).not.toBe('mole-office/the-api-server')
  }, 180_000)
})

describe('a stopped world is judged by its ledger rows', () => {
  /**
   * k71snj7nSbLy mutation: count every release answer that is not ok as left behind again.
   * "deletes the copy when the office already released its rows" goes red on the stop exit code.
   */
  it('deletes the copy when the office already released its rows', async () => {
    const file = join('.logs', 'isolated', name, 'where.json')
    const where = JSON.parse(readFileSync(file, 'utf8')) as { db: string; ledgerRows: string[] }
    const ledger = await (await fetch(app.api + '/api/resources', { headers: asPerson })).json() as {
      resources: { id: string; sessionRecordId: string }[]
    }
    const earlier: { id: string; releasedAt: string; releasedBy: string }[] = []
    try {
      for (const id of where.ledgerRows) {
        const row = ledger.resources.find((one) => one.id === id)
        expect(row, 'the world has no open ledger row to release before stop').toBeDefined()
        const released = await fetch(app.api + '/api/resources/' + id + '/release', {
          method: 'POST',
          headers: { ...asPerson, 'x-mole-office-session': row!.sessionRecordId },
          body: JSON.stringify({ signalNothing: true, note: 'Synthetic: released through the office before the tool stops.' }),
        })
        expect(released.status, await released.text()).toBe(200)
      }
      const history = await (await fetch(app.api + '/api/resources?includeReleased=true', { headers: asPerson })).json() as {
        resources: typeof earlier
      }
      for (const id of where.ledgerRows) {
        const row = history.resources.find((one) => one.id === id)
        expect(row?.releasedAt).toEqual(expect.any(String))
        expect(row?.releasedBy).toBe(`human:${THE_PERSON}`)
        earlier.push(row!)
      }
      expect(existsSync(where.db)).toBe(true)
      const stopped = await run('node', ['tools/isolated-mole-office.mjs', 'stop', name])
      expect(existsSync(where.db)).toBe(false)
      expect(existsSync(file)).toBe(false)
      for (const row of earlier) {
        expect(stopped.stdout).toContain(
          `The ledger row ${row.id} was already released at ${row.releasedAt} by ${row.releasedBy}; nothing more to do.\n`,
        )
      }
      expect(stopped.stdout).toContain('Mole Office has been told it is gone.')
    } finally {
      // A mutation can keep the copy after both processes stopped. Drop only this fixture's ledger
      // claims before asking the tool to clean up, so mutation proof leaves no running world.
      if (existsSync(file)) {
        writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), ledgerRows: [] }))
        await run('node', ['tools/isolated-mole-office.mjs', 'stop', name])
      }
    }
  }, 120_000)

  /**
   * k71snj7nSbLy mutation: count every refused row as released, even when the row is still open.
   * "keeps the copy when a refused row is still open" goes red on the stop exit code.
   */
  it('keeps the copy when a refused row is still open', async () => {
    const refusedName = `cw-open-row-${String(process.pid)}`
    const file = join('.logs', 'isolated', refusedName, 'where.json')
    const session = (await post('/api/records', {
      kind: 'session', title: 'Synthetic: a world whose lock row cannot be released', data: { state: 'running' },
    }))['record'] as { id: string }
    const lock = join(app.dir, 'synthetic-world.lock')
    writeFileSync(lock, 'Synthetic: evidence for the refused ledger row test.\n')
    const row = (await post('/api/resources', {
      type: 'lock', key: lock, sessionRecordId: session.id, detail: 'Synthetic: a world with a refused, open row.',
    }))['resource'] as { id: string }
    // THIS WORLD DOES NOT BUNDLE AGAIN: the first case's world bundled into the same folder. A Vite that found that bundle
    // stale would have deleted it before its first page answered, so the file is read again as soon as the start returns.
    expect(existsSync(bundled()), 'the first case did not leave its bundled dependencies; run this file whole').toBe(true)
    const before = { bytes: readFileSync(bundled()), at: statSync(bundled()).mtimeMs }
    try {
      await run('node', ['tools/isolated-mole-office.mjs', 'start', refusedName, '--from', join(app.dir, 'panelx.db'), '--vite-cache', viteCache(), '--ready-within', READY_WITHIN], {
        env: { ...process.env, MOLE_OFFICE_API: app.api },
        timeout: 150_000,
      })
      expect(statSync(bundled()).mtimeMs, 'the second world bundled the browser app\'s dependencies again').toBe(before.at)
      expect(readFileSync(bundled()).equals(before.bytes)).toBe(true)
      const where = JSON.parse(readFileSync(file, 'utf8')) as { db: string }
      writeFileSync(file, JSON.stringify({ ...where, ledgerRows: [row.id], registeredWith: app.api, workspace: 'default' }))
      const stopped = await run('node', ['tools/isolated-mole-office.mjs', 'stop', refusedName]).then(
        (out) => ({ ...out, code: 0 }),
        (err: { stdout: string; stderr: string; code: number }) => err,
      )
      expect(stopped.code, stopped.stdout + stopped.stderr).toBe(1)
      expect(stopped.stdout).toContain('Mole Office will not delete lock files')
      expect(stopped.stdout).toContain('The row is still open.')
      expect(stopped.stderr).toContain('The world stopped, but ledger rows could not be released: ' + row.id)
      expect(stopped.stdout).not.toContain('Mole Office has been told it is gone.')
      expect(existsSync(where.db)).toBe(true)
      expect(existsSync(file)).toBe(true)
      const ledger = await (await fetch(app.api + '/api/resources?includeReleased=true', { headers: asPerson })).json() as {
        resources: { id: string; releasedAt: string | null }[]
      }
      expect(ledger.resources.find((one) => one.id === row.id)?.releasedAt).toBeNull()
    } finally {
      if (existsSync(file)) {
        writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), ledgerRows: [] }))
        await run('node', ['tools/isolated-mole-office.mjs', 'stop', refusedName])
      }
    }
  }, 180_000)
})

describe('the office keeps the purpose a world registers with', () => {
  it('answers with it on the row a person reads', async () => {
    await post('/api/office/worlds', {
      name: 'a world with a purpose',
      purpose: 'the words on the five standings, after the refusal',
      kind: 'agent-made',
      databaseIdentity: 'dddddddddddddddd',
      address: 'http://127.0.0.1:41777',
      standing: 'scratch',
      installation: 'this-installation',
    })
    const listed = await (
      await fetch(`${app.api}/api/office/worlds`, { headers: { 'x-mole-office-workspace': 'default' } })
    ).json()
    const mine = (listed.worlds as { databaseIdentity: string; purpose: string | null }[]).find(
      (one) => one.databaseIdentity === 'dddddddddddddddd',
    )
    expect(mine?.purpose).toBe('the words on the five standings, after the refusal')
  })
})
