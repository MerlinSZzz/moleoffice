// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S RUNS ARE ITS NEWEST TEN, ONE ROW EACH, AND ONE LINE OPENS THEM ALL. As decided in November 2026: the runs
 * list, option A.
 *
 * The runs panel on an agent's page (developer mode) drew every run as a card with its model, effort, receipt and
 * compactions. It now draws the newest 10 runs, one row each: the title, the state and the time. A press on a row
 * opens the run's own page, which holds the rest. Under the rows one line, "All N runs", opens every run in pages of
 * 50 with the pager.
 *
 * WHAT IS CLAIMED, on an agent with 12 runs:
 *
 *   1. the panel draws 10 rows, the newest first, each with its title, state and time;
 *   2. the line under the rows counts every run, in the words the page reads;
 *   3. a press on that line draws all 12 rows;
 *   4. a press on a row opens that run's own page.
 *
 * MADE-UP RECORDS, in a fresh test database.
 *
 * WHAT WOULD MAKE EACH CASE GO RED
 *   the panel draws every run                         → case 1
 *   the line is not drawn, or counts only the 10 drawn → case 2
 *   the line's press draws no more rows               → case 3
 *   a row is not a link to its run                    → case 4
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { t as word } from '../src/shared/i18n.ts'
import { stateWord } from '../src/shared/words.ts'
import type { OneOfItsRuns, TheAgentsRuns } from '../src/shared/profile.ts'
import { recordPath } from '../src/web/components/router.tsx'

const HANDLE = 'twelve-runs'
const RUNS = 12

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let db: TestDb
let app: FastifyInstance
let live: LiveApp
/** The agent's runs as the server lists them, newest first. */
let runs: readonly OneOfItsRuns[] = []

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()

  const registered = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { runtime: 'claude-code', handle: HANDLE, name: 'Twelve runs', role: 'worker' },
  })
  expect(registered.statusCode, registered.body).toBe(201)
  const agent = String((registered.json() as { record: string }).record)

  // FILED OLDEST FIRST, so the page lists them the other way round. Filed historically, as the runs test files them.
  for (let n = 1; n <= RUNS; n += 1) {
    historicalSession(db, {
      workspaceId: 'default',
      actor: { type: 'human', id: THE_PERSON },
      kind: 'session',
      title: `Made-up run ${String(n)}`,
      data: { state: 'finished', servingAgent: HANDLE, runtime: 'claude-code', ranAs: [{ workspaceId: 'default', agentId: agent }] },
    })
  }

  const profile = await app.inject({ method: 'GET', url: `/api/participants/agent/${HANDLE}/profile`, headers: AS_THE_PERSON })
  expect(profile.statusCode, profile.body).toBe(200)
  const reading = (profile.json() as { agentRuns: TheAgentsRuns | null }).agentRuns
  expect(reading, 'an agent page carries its runs').not.toBeNull()
  runs = reading!.runs
  expect(runs).toHaveLength(RUNS)
  expect(runs[0]?.title, 'the newest first').toBe(`Made-up run ${String(RUNS)}`)

  live = await liveApp({ name: 'newest-ten-runs', viewport: { width: 1440, height: 1000 }, workspace: 'default', database: db.file })
}, 180_000)

afterAll(async () => {
  await live?.stop()
  await app?.close()
  db?.close()
})

/** The agent's page in developer mode, where the runs panel is drawn, ready to read. */
async function openTheAgent(): Promise<void> {
  await live.page.goto(`${live.site}/?mode=inspect#/who/agent/${HANDLE}`, { timeout: 60_000 })
  await waitForThePage(live.page, 60_000)
  await live.page.getByTestId('profile-run').first().waitFor()
}

describe("an agent's runs, one row each", () => {
  it('1: draws the newest 10 runs, each with its title, state and time', async () => {
    await openTheAgent()
    const rows = live.page.getByTestId('profile-run')
    expect(await rows.count()).toBe(10)
    const drawn = await rows.evaluateAll((all) => all.map((row) => row.getAttribute('data-run')))
    expect(drawn).toEqual(runs.slice(0, 10).map((run) => run.id))
    const first = runs[0]!
    const row = rows.first()
    expect(await row.locator('.prof-row-title').textContent()).toBe(first.title)
    expect(await row.locator('.prof-row-state').textContent()).toBe(stateWord(first.state, 'normal', 'session').text)
    expect(await row.locator('.prof-row-when').textContent()).toBe(first.when)
  }, 120_000)

  it('2: draws one line under the rows that counts every run', async () => {
    await openTheAgent()
    await expect(live.page.getByRole('button', { name: word('agentRuns.all', { n: RUNS }) }).count()).resolves.toBe(1)
  }, 120_000)

  it('3: a press on that line draws every run', async () => {
    await openTheAgent()
    await live.page.getByRole('button', { name: word('agentRuns.all', { n: RUNS }) }).click()
    await live.page.getByTestId('profile-run').nth(RUNS - 1).waitFor()
    const drawn = await live.page.getByTestId('profile-run').evaluateAll((all) => all.map((row) => row.getAttribute('data-run')))
    expect(drawn).toEqual(runs.map((run) => run.id))
  }, 120_000)

  it("4: a press on a row opens that run's own page", async () => {
    await openTheAgent()
    const second = runs[1]!
    await live.page.locator(`[data-testid="profile-run"][data-run="${second.id}"] a`).click()
    await live.page.waitForURL(`**#${recordPath(second.id, 'session')}`, { timeout: 30_000 })
    expect(new URL(live.page.url()).hash).toBe(`#${recordPath(second.id, 'session')}`)
  }, 120_000)
})
