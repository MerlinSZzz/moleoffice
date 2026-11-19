// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN THE OFFICE WITHDREW SAYS SO ON THE AGENTS PAGE, AND NO WORKER CAN TAKE IT. Wave 13u round 19, on a
 * decision and the secretary's answer yMYX20nfBuep.
 *
 * Migration 0253's data step (src/server/db/withdraw-review-runs-migration.ts) sets the runs a sent review wrote and
 * no worker took to `withdrawn`, with a reason (tests/migration-0253-withdraws-only-a-sent-reviews-waiting-runs.test.ts
 * proves which runs). Here one run is made withdrawn in a test world's own database, the way that step writes it,
 * and then:
 *
 *   - the claim door refuses it with 409, says it is withdrawn and why, and leaves it withdrawn;
 *   - the run's row on the Agents page shows "Withdrawn, not tried" and the reason, at 1440 and 390 in light,
 *     inside the viewport;
 *   - its conversation reads as waiting for the person ("Nobody answered"), because nothing will answer it,
 *     and its state is not drawn in the colour of a failure, because nothing failed.
 *
 * Three-run proof, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/a-withdrawn-run-says-so-on-the-agents-page.test.ts
 * After a green control, copy the changed file before each mutation:
 *   1. in src/web/components/agent/context.ts, change the `withdrawn` word in RUN_STATE_WORDS to 'Failed';
 *   2. in src/server/lib/agents.ts, delete the `lastRunState === 'withdrawn' ||` line: the conversation no longer
 *      reads as waiting for the person.
 * Each one turns this file red. Restore each file with cp, check it with cmp, and run the command again for green.
 *
 * With TEST_SHOTS set, each width and look is kept as a picture. Every name and word here is made up.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { testShots, TEST_SHOTS } from './where-shots-go.ts'

const KEEP = (process.env[TEST_SHOTS] ?? '') !== ''
const SHOTS = testShots('withdrawn-run')

const WORDS = 'Withdrawn, not tried'
const TITLE = 'Made-up review of the kiln log'
const REASON = 'Made up: withdrawn before any worker took it, so nothing was tried.'
let app: LiveApp
let run = ''

function keys(): { person: string; office: string } {
  return JSON.parse(readFileSync(join(app.dir, 'keys.json'), 'utf8')) as { person: string; office: string }
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(app.api + path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'human',
      'x-mole-office-actor-id': THE_PERSON,
      'x-mole-office-key': keys().person,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  expect(response.ok, await response.clone().text()).toBe(true)
  return await response.json() as T
}

function stateOfTheRun(): string {
  const db = new Database(join(app.dir, 'panelx.db'), { readonly: true })
  try {
    return (db.prepare('SELECT state FROM agent_runs WHERE id = ?').get(run) as { state: string }).state
  } finally {
    db.close()
  }
}

beforeAll(async () => {
  app = await liveApp({ name: 'withdrawn-run-words', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const made = await post<{ thread: { id: string } }>('/api/agent/threads', { title: TITLE, mode: 'review' })
  await post(`/api/agent/threads/${made.thread.id}/messages`, {
    intent: 'discuss', body: 'Made-up words for a run the office will withdraw.', recipient: { kind: 'new' },
  })
  const sent = await post<{ runs: { id: string }[] }>(`/api/agent/threads/${made.thread.id}/dispatch`)
  run = sent.runs[0]!.id
  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    db.prepare("UPDATE agent_runs SET state = 'withdrawn', ended_at = '2026-10-13 09:00:00', error = ? WHERE id = ?").run(REASON, run)
  } finally {
    db.close()
  }
}, 240_000)

afterAll(async () => { await app?.stop() }, 60_000)

it('refuses a worker that asks to take the withdrawn run, says why, and leaves it withdrawn', async () => {
  const response = await fetch(`${app.api}/api/agent/runs/${run}/claim`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': 'mole-office-agent-worker',
      'x-mole-office-key': keys().office,
    },
    body: JSON.stringify({ worker: 'made-up-worker@bench' }),
  })
  const text = await response.text()
  expect(response.status, text).toBe(409)
  expect((JSON.parse(text) as { error: string }).error).toBe(`This run is "withdrawn" and cannot be taken. ${REASON}`)
  expect(stateOfTheRun()).toBe('withdrawn')
})

it('draws the withdrawn run in words, and its conversation as waiting for the person and not failed, at 1440 and 390 in light', async () => {
  for (const look of ['light'] as const) {
    for (const width of [1440, 390]) {
      const page = app.page
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      await page.goto('about:blank')
      await page.goto(`${app.site}/?lang=en#/conversations`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.evaluate((chosen) => localStorage.setItem('mole-office.preset.theme', chosen), look)
      await page.reload({ timeout: 60_000 })
      await waitForThePage(page, 60_000)
      const where = `${String(width)} ${look}`
      expect(await page.locator('html').getAttribute('data-theme'), where).toBe(look)

      const row = page.locator('.px-thread-row', { hasText: TITLE }).first()
      await row.waitFor({ timeout: 20_000 })
      expect(await row.getAttribute('data-needs-you'), `${where}: the conversation waits for the person`).toBe('true')
      expect(await row.locator('.px-ac-thread-meta').innerText(), where).toBe('Nobody answered')
      expect(await row.locator('.px-ac-state').getAttribute('data-state'), `${where}: not drawn as failed`).toBe('dispatched')

      await row.click()
      const state = page.locator('.px-run-state').first()
      await state.waitFor({ timeout: 20_000 })
      await state.scrollIntoViewIfNeeded()
      expect(await state.textContent(), `${where}: the row's state words`).toBe(WORDS)
      expect(await page.locator('.px-run .px-run-says').first().textContent(), `${where}: the reason`).toBe(REASON)
      const measured = await state.evaluate((element) => {
        const box = element.getBoundingClientRect()
        return { left: box.left, right: box.right, viewport: window.innerWidth, document: document.documentElement.scrollWidth }
      })
      expect(measured.document, `${where}: document width`).toBeLessThanOrEqual(measured.viewport)
      expect(measured.left, `${where}: left edge`).toBeGreaterThanOrEqual(0)
      expect(measured.right, `${where}: right edge`).toBeLessThanOrEqual(measured.viewport)
      if (KEEP) await page.screenshot({ path: join(SHOTS, `withdrawn-run-${String(width)}-${look}-en.png`) })
    }
  }
}, 600_000)
