// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FLOW RUN'S PAGE HAS NO EDIT PRESS. Wave 13k round 44, piece 3.
 *
 * Only the office writes a flow run: assertMayWrite in src/server/lib/records.ts refuses every other writer, the
 * person included, and a step done by hand goes through the steps door. The record page still drew Edit on a flow
 * run, and every save on the page it led to was refused. The secretary, answering for 13p (message 1nUYgNOacCEs), agreed
 * the press goes.
 *
 * WHAT THIS FILE PROVES, in a real browser:
 *   1. a flow run's page draws no Edit press, and the flow it runs still draws one;
 *   2. a flow run opened at its editing address still draws Stop editing, so a typed address is not a dead end.
 *
 * MUTATION, after a control run (the commit that added this file names the logs): RecordPage.tsx draws the Edit
 * press whatever the kind, as before. Case 1 goes red.
 *
 * Set W13K_FLOW_RUN_SHOTS to a folder to also photograph the flow run's page at 1440, 990, 660 and 390, light and
 * dark, in English.
 *
 * Everything here is made up. `liveApp` starts its own API on ports of its own with a database of its own.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { editingAddress, recordPath } from '../src/web/components/router.tsx'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const THE_AGENT = 'fixture-writer'
const AS_THE_AGENT = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': THE_AGENT }

let app: LiveApp
const ids = { flow: '', flowRun: '' }

async function file(headers: Record<string, string>, kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify({ kind, title, data }) })
  expect(made.status, await made.clone().text()).toBe(201)
  return ((await made.json()) as { record: { id: string } }).record.id
}

beforeAll(async () => {
  app = await liveApp({ name: 'a-flow-runs-page-has-no-edit-press', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const registered = await fetch(`${app.api}/api/agents/started`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({ runtime: 'claude-code', handle: THE_AGENT, name: 'Fixture Writer', role: 'worker' }),
  })
  expect(registered.status, await registered.clone().text()).toBe(201)
  ids.flow = await file(AS_THE_PERSON, 'flow', 'Fixture flow', {})
  const run = await file(AS_THE_AGENT, 'session', 'Fixture run that names a flow', { state: 'finished', runtime: 'claude-code', flow: ids.flow })
  const flowRuns = await fetch(`${app.api}/api/records?kind=flow_run&limit=25&shape=full`, { headers: AS_THE_PERSON })
  expect(flowRuns.status, await flowRuns.clone().text()).toBe(200)
  const listed = ((await flowRuns.json()) as { records: { id: string; data: { run?: string } }[] }).records
  ids.flowRun = listed.find((one) => one.data.run === run)?.id ?? ''
  expect(ids.flowRun, 'the office filed a flow run for the run').not.toBe('')
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

/** The page at `address`. Each case waits for the part it reads. */
async function open(address: string): Promise<import('playwright').Page> {
  const page = app.page
  await page.goto(`${app.site}/?lang=en#${address}`)
  await waitForThePage(page, 60_000)
  return page
}

const press = (page: import('playwright').Page, words: string) => page.locator('a.rp-mode', { hasText: new RegExp(`^${words}$`) })

it('a flow run has no Edit press, and the flow it runs has one', async () => {
  const flow = await open(recordPath(ids.flow))
  await press(flow, 'Edit').waitFor({ timeout: 30_000 })

  const run = await open(recordPath(ids.flowRun))
  await run.locator('main').getByText('Open the flow').first().waitFor({ timeout: 30_000 })
  expect(await press(run, 'Edit').count()).toBe(0)
}, 120_000)

it('a flow run at its editing address still says Stop editing', async () => {
  const page = await open(editingAddress(recordPath(ids.flowRun)))
  await press(page, 'Stop editing').waitFor({ timeout: 30_000 })
  expect(await press(page, 'Edit').count()).toBe(0)
}, 120_000)

const shots = process.env.W13K_FLOW_RUN_SHOTS

it.skipIf(!shots)('pictures of a flow run, English, four widths, light and dark', async () => {
  mkdirSync(shots!, { recursive: true })
  for (const theme of ['light', 'dark'] as const) for (const width of [1440, 990, 660, 390]) {
    const context = await app.browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme })
    try {
      await context.addInitScript(`localStorage.setItem('mole-office.preset.theme', '${theme}')`)
      const page = await context.newPage()
      await page.goto(`${app.site}/?lang=en#${recordPath(ids.flowRun)}`)
      await waitForThePage(page, 60_000)
      await page.locator('main').getByText('Open the flow').first().waitFor({ timeout: 30_000 })
      await page.waitForTimeout(800)
      await page.screenshot({ path: join(shots!, `flow-run-${width}-${theme}-en.png`), fullPage: true })
    } finally {
      await context.close()
    }
  }
}, 600_000)
