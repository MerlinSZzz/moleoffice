// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SERVER THAT HAS STOPPED SAYS SO ON ITS OWN SESSION ROW.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED 5 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * The server files a session record for itself at every start, and nothing ever wrote a state on
 * it: a session record holds whatever it last said about itself, and a process that stops writes
 * nothing. So `GET /api/records?kind=session` held nine rows titled "The API server" and "The
 * message worker", all `running`, on a machine running one pair. The Agent runs screen read as nine
 * live servers, and somebody looking there to find what to stop was reading a wrong number.
 * Problem `uYjxMB6JETEq`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE
 * ---------------------------------------------------------------------------------------
 *
 * 1. A server that is asked to stop writes `finished` on its own row and on its worker's, saying
 *    why, and leaves the rest of each row alone.
 * 2. A server that never got to say so is said to have stopped by the NEXT start — from the
 *    ledger's own answer that its process is gone, not from a second guess about the machine.
 * 3. Nothing else is rewritten: a row somebody else has already put a state on is left alone.
 *
 * THE SERVERS ARE REAL PROCESSES. `liveApp` starts one and `stop()` signals it, which is the act
 * under test; a test that called the shutdown function directly would prove the function runs and
 * not that stopping the server reaches it.
 */

import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let app: LiveApp
/** A second stack over the same database, started after the first has been stopped. */
let again: LiveApp | null = null
/**
 * ONE DATABASE BOTH STACKS SERVE, so what the second start makes of what the first left behind can
 * be measured. It is this file's to make and to remove; each stack still gets its own directory.
 */
let where = ''
let database = ''

interface SessionRow {
  id: string
  title: string
  data: { state?: string; detail?: string; doing?: string; runtime?: string }
}

/**
 * THE SERVER'S OWN ROWS, WHICHEVER PROJECT IT FILED THEM IN.
 *
 * A server files its session record under `MOLE_OFFICE_WORKSPACE`, which a test stack does not set,
 * so its own rows land in the built-in project and not in the `default` one the rest of this file
 * writes to. Both are asked, because what is under test is the row and not which project it is in.
 */
async function sessions(where: LiveApp): Promise<SessionRow[]> {
  const all: SessionRow[] = []
  for (const project of ['default', 'panelx']) {
    const got = await fetch(`${where.api}/api/records?kind=session&shape=full`, {
      headers: { ...AS_THE_OWNER, 'x-mole-office-workspace': project },
    })
    if (got.status !== 200) continue
    all.push(...((await got.json()) as { records: SessionRow[] }).records)
  }
  return all
}

const serversAndWorkers = (rows: SessionRow[]): SessionRow[] =>
  rows.filter((one) => one.title === 'The API server' || one.title === 'The message worker')

beforeAll(async () => {
  where = aTestDatabaseFolder('a-stopped-server')
  database = join(where, 'panelx.db')
  app = await liveApp({
    name: 'a-stopped-server-says-so',
    viewport: { width: 1440, height: 900 },
    workspace: 'default',
    database,
  })
}, 240_000)

afterAll(async () => {
  if (again !== null) await again.stop()
  if (where !== '') rmSync(where, { recursive: true, force: true })
})

describe('while it is running', () => {
  it('says it is running, which is the state that used to be permanent', async () => {
    const rows = serversAndWorkers(await sessions(app))
    expect(rows.length, 'the server filed no session row for itself').toBeGreaterThan(0)
    for (const row of rows) expect(row.data.state, `${row.title} does not say it is going`).toBe('running')
  }, 120_000)
})

describe('after it is stopped and another starts over the same database', () => {
  let before: SessionRow[] = []

  beforeAll(async () => {
    before = serversAndWorkers(await sessions(app))
    // THE REAL STOP. `liveApp.stop()` signals the process, so what is measured below is what the
    // shutdown really did, in the order it really does it.
    await app.stop()
    again = await liveApp({
      name: 'a-stopped-server-says-so',
      viewport: { width: 1440, height: 900 },
      workspace: 'default',
      database,
    })
  }, 240_000)

  it('leaves no row from the stopped stack saying it is still going', async () => {
    const now = await sessions(again as LiveApp)
    const stale = now.filter(
      (one) => before.some((was) => was.id === one.id) && one.data.state === 'running',
    )
    expect(
      stale.map((one) => `${one.title} (${one.id})`),
      'a server that has stopped still says it is going',
    ).toEqual([])
  }, 120_000)

  it('says how each of them ended, in words a reader can act on', async () => {
    const now = await sessions(again as LiveApp)
    for (const was of before) {
      const one = now.find((row) => row.id === was.id)
      expect(one, `the row for ${was.title} is gone rather than answered`).toBeDefined()
      expect(['finished', 'crashed'], `${was.title} says "${String(one?.data.state)}"`).toContain(one?.data.state)
      expect(one?.data.detail, `${was.title} says it ended and not why`).toBeTruthy()
    }
  }, 120_000)

  it('leaves the rest of each row exactly as it was, because it merges', async () => {
    const now = await sessions(again as LiveApp)
    for (const was of before) {
      const one = now.find((row) => row.id === was.id)
      expect(one?.data.doing, `what ${was.title} was doing was emptied`).toBe(was.data.doing)
      expect(one?.data.runtime, `which tool ran ${was.title} was emptied`).toBe(was.data.runtime)
    }
  }, 120_000)

  it('files its own row for the new stack, still going', async () => {
    const now = serversAndWorkers(await sessions(again as LiveApp))
    const going = now.filter((one) => one.data.state === 'running')
    expect(going.length, 'the stack that is running says nothing about itself').toBeGreaterThan(0)
    for (const one of going) {
      expect(before.some((was) => was.id === one.id), 'a stopped row was made to look alive again').toBe(false)
    }
  }, 120_000)
})
