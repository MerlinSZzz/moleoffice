// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION I4: the usage page tells a person which tool the agents ran in, where they were turned
 * away and why, and how long each run took before it wrote anything — with the charts drawn in the
 * page rather than pasted into it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED, AND WHY IN A BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * The numbers are proved against the route in the same file, because a page that draws the right
 * shape from the wrong numbers is not worth much. The browser half proves the other thing: that a
 * person opening `#/agent-use` sees them, and that the charts are drawn by the page — an `svg`
 * element the page built — and are not pictures somebody exported and dropped in.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIXTURE IS TWO RUNS THAT DIFFER IN THE ONE WAY THAT MATTERS
 * ---------------------------------------------------------------------------------------
 *
 * One run says which tool it was and writes something. One says which tool it was and writes
 * nothing. A third set of calls names no session at all. Those are the three cases the reading has
 * to keep apart: a time to a first write, a run with no first write, and calls nobody recorded a
 * tool for. A reading that turned the second into a zero would say the run wrote immediately.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { liveApp, waitForThePage, type LiveApp, thePersonsKeyHeader } from './helpers.ts'
import { en } from '../src/shared/words/en.ts'

let app: LiveApp
/** The registry id of the agent this file registers, whose page draws its runs. */
let agentId = ''

const WORKSPACE = 'default'

/** A second project, so a reading that dropped the project would look different from one that kept it. */
const OTHER_WORKSPACE = 'panelx'

async function readAgents(): Promise<Record<string, unknown>> {
  const reply = await fetch(`${app.api}/api/usage/agents`, { headers: { 'x-mole-office-workspace': WORKSPACE } })
  expect(reply.status, 'GET /api/usage/agents did not answer').toBe(200)
  return (await reply.json()) as Record<string, unknown>
}

beforeAll(async () => {
  app = await liveApp({ name: 'usage-tools', viewport: { width: 1440, height: 1000 } })

  // THE AGENT THIS FILE'S CALLS ARE ATTRIBUTED TO IS REGISTERED FIRST. The records door refuses a
  // write under an agent id no registry row holds, and the PATCH below is a write under `the-test`.
  const registered = await fetch(`${app.api}/api/agents/started`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-workspace': WORKSPACE,
      'x-mole-office-actor-type': 'human',
      'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
    },
    body: JSON.stringify({ handle: 'the-test', name: 'The Test' }),
  })
  if (!registered.ok) throw new Error(`registering the test agent answered ${String(registered.status)}: ${await registered.text()}`)
  const registration = (await registered.json()) as { record: string; agent: { id: string } }
  agentId = registration.agent.id

  // Two session records, so the reading has a tool to join on. One of them will write; the other
  // will not, and the difference is the thing this file is about.
  const filed: string[] = []
  for (const title of ['A run that wrote something', 'A run that wrote nothing']) {
    const reply = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mole-office-workspace': WORKSPACE,
        'x-mole-office-actor-type': 'human',
        'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
      },
      body: JSON.stringify({ kind: 'session', title, data: { state: 'finished', runtime: 'claude-code', adaptedTool: 'claude-code' } }),
    })
    const said = await reply.text()
    expect(reply.status, `the session record "${title}" was refused: ${said}`).toBe(201)
    const body = JSON.parse(said) as { record: { id: string } }
    filed.push(body.record.id)
  }
  const [wrote, silent] = filed as [string, string]

  // A RUN WITH ONLY A FREE WORD, so the receipts panel has a run that declared no tool (problem uh6-H72Zik9H).
  const freeWordOnly = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    // WITH THE OWNER'S KEY, because a session for an agent is filed only by the person with the owner's key, the agent or those above it.
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) },
    // BOUND TO THE TEST AGENT, so the agent's own page has a run that declared no tool to draw as well.
    body: JSON.stringify({ kind: 'session', title: 'A run that only says vite', data: { state: 'running', runtime: 'vite', ranAs: [{ workspaceId: WORKSPACE, agentId: registration.record }] } }),
  })
  expect(freeWordOnly.status, await freeWordOnly.text()).toBe(201)

  // One write under the first session, so it has a first useful write to time.
  const patched = await fetch(`${app.api}/api/records/${wrote}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-workspace': WORKSPACE,
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': 'the-test',
      'x-mole-office-session': wrote,
    },
    body: JSON.stringify({ summary: 'It wrote this.' }),
  })
  const patchedSaid = await patched.text()
  expect(patched.status, patchedSaid).toBe(200)

  // THE CALLS ARE REAL REQUESTS, so the recorder writes the rows and the whole path is under test:
  // the header a run sends, the row the recorder writes, and the reading over it. Writing rows into
  // the table by hand would test the reading against rows nothing in the product ever wrote.
  const as = (sessionId: string | null, actorId: string): Record<string, string> => ({
    'content-type': 'application/json',
    'x-mole-office-workspace': WORKSPACE,
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': actorId,
    ...(sessionId === null ? {} : { 'x-mole-office-session': sessionId }),
  })
  // The run that wrote nothing: it reads, and it is refused a write only a person may make.
  await fetch(`${app.api}/api/records?kind=note`, { headers: as(silent, 'the-test') })
  const forbidden = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: as(silent, 'the-test'),
    body: JSON.stringify({ kind: 'decision', title: 'An agent may not write one of these', data: {} }),
  })
  expect(forbidden.status, 'writing a decision as an agent was not refused, so there is no 403 to count').toBe(403)
  // Calls nobody recorded a tool for: no session header, and an actor no registry holds.
  await fetch(`${app.api}/api/records?kind=note`, { headers: as(null, 'somebody-with-no-registry-row') })
  const missing = await fetch(`${app.api}/api/records/nosuchrecord`, {
    headers: as(null, 'somebody-with-no-registry-row'),
  })
  expect(missing.status, 'reading a record that is not there was not refused, so there is no 404 to count').toBe(404)
  // A call in a second project, so the split by project has two things to keep apart. With one
  // project a reading that dropped the project entirely would look exactly the same.
  const madeIt = await fetch(`${app.api}/api/workspaces`, {
    method: 'POST',
    headers: { ...as(null, 'the-test'), 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
    body: JSON.stringify({ id: OTHER_WORKSPACE, title: 'Another project' }),
  })
  const madeItSaid = await madeIt.text()
  expect(madeIt.status, `the second project was not created: ${madeItSaid}`).toBe(201)
  const elsewhere = await fetch(`${app.api}/api/records?kind=note`, {
    headers: { ...as(null, 'somebody-with-no-registry-row'), 'x-mole-office-workspace': OTHER_WORKSPACE },
  })
  expect(elsewhere.status, 'the read in the other project was refused, so there is nothing to split').toBe(200)
}, 300_000)

afterAll(async () => {
  await app.stop()
})

describe('the usage page says which tool and how long', () => {
  it('splits the calls by the tool that made them, and says when nobody recorded one', async () => {
    const reading = await readAgents()
    const byFramework = reading.byFramework as { adaptedTool: string | null; calls: number; why?: string }[]
    const claude = byFramework.find((row) => row.adaptedTool === 'claude-code')
    expect(claude, 'the calls made under a run that declared claude-code were not attributed to it').toBeTruthy()
    const nameless = byFramework.find((row) => row.adaptedTool === null)
    expect(nameless, 'the calls with no session were not kept apart').toBeTruthy()
    expect(nameless?.why, 'the rows nobody recorded a tool for do not say why').toBeTruthy()
    const notAttributed = reading.notAttributed as { calls: number }
    expect(notAttributed.calls, 'the unattributed calls were not counted').toBeGreaterThan(0)
  })

  it('splits the calls by project', async () => {
    const reading = await readAgents()
    const byProject = reading.byProject as { workspaceId: string | null; calls: number }[]
    const here = byProject.find((row) => row.workspaceId === WORKSPACE)
    expect(here, 'the project the calls were made in is not in the reading').toBeTruthy()
    expect(here?.calls).toBeGreaterThan(0)
    // The reading is asked for one project, so it must carry that one and not the other.
    expect(
      byProject.map((row) => row.workspaceId),
      'the reading answered about a project it was not asked about',
    ).toEqual([WORKSPACE])
  })

  it('groups refusals by what the refusal meant, not only by its number', async () => {
    const reading = await readAgents()
    const refusals = reading.refusals as { status: number; reason: string; count: number }[]
    const forbidden = refusals.find((row) => row.status === 403)
    expect(forbidden, 'the 403 was not counted').toBeTruthy()
    expect(forbidden?.reason, 'a refusal is reported with no words for what it meant').toContain('may not')
    expect(refusals.find((row) => row.status === 404)?.reason).toBeTruthy()
  })

  it('times a run that wrote, and says in words that a run which wrote nothing has no time', async () => {
    const reading = await readAgents()
    const arrivals = reading.arrivals as { msToFirstWrite: number | null; why?: string }[]
    // Every run with no time says why in words, and none of them reports a negative duration.
    for (const row of arrivals) {
      if (row.msToFirstWrite === null) {
        expect(row.why, 'a run with no time to its first write does not say why').toBeTruthy()
      } else {
        expect(row.msToFirstWrite, 'a duration came back negative instead of being called unmeasurable').toBeGreaterThanOrEqual(0)
      }
    }
    const untimed = arrivals.find((row) => row.msToFirstWrite === null)
    expect(untimed, 'the run that wrote nothing is missing from the reading altogether').toBeTruthy()
    expect(untimed?.why, 'a run with no first write is reported without saying why').toBeTruthy()
  })

  it('draws all of it on the page a person opens, with the charts drawn there', async () => {
    const page = app.page
    await page.goto(`${app.site}/#/agent-use`)
    await waitForThePage(page, 60_000)
    await page.waitForSelector('svg.pxc-svg', { timeout: 30_000 })
    const text = await page.locator('main').innerText()
    // The panel titles are read from the word list (plan 7FEOshq3mBGG, G9) and are labels, which the
    // light look draws in capitals; innerText returns them as drawn, so they are compared without case.
    const drawn = text.toLowerCase()
    expect(drawn, 'the page does not say which tool the agents ran in').toContain(en['dev.usage.whichToolTheAgentsRanInAnd'].toLowerCase())
    expect(drawn, 'the page does not say where agents are turned away').toContain(en['dev.usage.whereAgentsAreTurnedAwayAndWhy'].toLowerCase())
    expect(drawn, 'the page does not say how long a run took to write anything').toContain(en['dev.usage.fromAnAgentArrivingToItsFirst'].toLowerCase())
    expect(text, 'the tool word is not on the page').toContain('claude-code')
    // DRAWN, NOT PASTED. `svg.pxc-svg` is the chart component's own drawing — plain `svg` would
    // also match the icons the rest of the page draws, and did: a run with every chart deleted
    // still passed on that assertion.
    const charts = await page.locator('main svg.pxc-svg').count()
    expect(charts, 'the page drew no chart at all').toBeGreaterThanOrEqual(3)
    const images = await page.locator('main img[src$=".png"]').count()
    expect(images, 'the page is showing a pasted picture of a chart instead of drawing one').toBe(0)
  }, 240_000)


  it('is photographed at four widths in both themes, when a folder for the pictures is named', async () => {
    // CHAPTER 6 RULE 1, for the two pages this change draws on. Nothing is asserted here that the case above
    // does not hold; it only takes the pictures a person looks at, and takes none without USAGE_DECLARED_SHOTS.
    const shots = process.env['USAGE_DECLARED_SHOTS']
    if (shots === undefined || shots === '') return
    mkdirSync(shots, { recursive: true })
    const page = app.page
    for (const theme of ['light', 'dark'] as const) {
      await page.goto(`${app.site}/`)
      await page.evaluate((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
      for (const width of [1440, 990, 660, 390]) {
        await page.setViewportSize({ width, height: 1000 })
        for (const [name, route] of [['usage', '#/agent-use'], ['agent-runs', `#/who/agent/${agentId}`]] as const) {
          await page.goto('about:blank')
          await page.goto(`${app.site}/`)
          // The agent's runs are drawn in developer mode only (wave 13k's G6b); the usage page in normal mode.
          await page.evaluate((mode) => localStorage.setItem('mole-office.mode', mode), name === 'agent-runs' ? 'inspect' : 'normal')
          await page.goto(`${app.site}/?lang=en${route}`)
          await waitForThePage(page, 60_000)
          await page.locator('[data-testid="receipt-totals"] summary', { hasText: /runtime/i }).click()
          await page.locator('[data-testid="receipt-totals"]').scrollIntoViewIfNeeded()
          await page.screenshot({ path: join(shots, `${name}-${String(width)}-${theme}-en.png`), fullPage: true })
        }
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
  }, 480_000)
})
