// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DISPATCH RUN WHOSE WORKER DISAPPEARED SAYS SO ON THE AGENTS PAGE, AT EVERY WIDTH AND IN BOTH LOOKS.
 *
 * Wave 13n round 12 added the run state `crashed`: the office ends a claimed dispatch run as crashed when its
 * worker process is gone (src/server/lib/gone-dispatch-workers.ts). RUN_STATE_WORDS in
 * src/web/components/agent/context.ts gives it the words a row shows. This draws one crashed run in a test
 * world and reads the row at 1440 and 390 in light.
 *
 * The run is made crashed by writing its state in the test world's own database. The office's process check
 * that writes it for real is proved in tests/a-stopped-dispatch-worker-ends-its-run.test.ts; this file is
 * about what the page draws.
 *
 * MUTATION (after a green control, then restored): the `crashed` line taken out of RUN_STATE_WORDS. The row
 * then shows no words and this file goes red.
 *
 * CRASHED_RUN_SHOTS saves a picture of each width and look.
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const WORDS = 'Its worker stopped without answering'
const TITLE = 'Synthetic conversation whose worker disappeared'
let app: LiveApp

async function post<T>(path: string, body?: unknown): Promise<T> {
  const keys = JSON.parse(readFileSync(join(app.dir, 'keys.json'), 'utf8')) as { person: string }
  const response = await fetch(app.api + path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'human',
      'x-mole-office-actor-id': THE_PERSON,
      'x-mole-office-key': keys.person,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  expect(response.ok, await response.clone().text()).toBe(true)
  return await response.json() as T
}

beforeAll(async () => {
  app = await liveApp({ name: 'crashed-run-words', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const made = await post<{ thread: { id: string } }>('/api/agent/threads', { title: TITLE, mode: 'direct' })
  await post(`/api/agent/threads/${made.thread.id}/messages`, {
    intent: 'discuss', body: 'Synthetic words for an agent whose worker will disappear.', recipient: { kind: 'new' },
  })
  const sent = await post<{ runs: { id: string }[] }>(`/api/agent/threads/${made.thread.id}/dispatch`)
  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    db.prepare("UPDATE agent_runs SET state = 'crashed', error = ? WHERE id = ?")
      .run('Synthetic: its worker process is gone without a result.', sent.runs[0]!.id)
  } finally {
    db.close()
  }
  await app.page.goto(`${app.site}/#/conversations`)
  await waitForThePage(app.page)
  await app.page.locator('.px-thread-row', { hasText: TITLE }).click()
  await app.page.locator('.px-run').first().waitFor()
})

afterAll(async () => { await app?.stop() })

it('draws the crashed run in words at 1440 and 390 in light, inside the viewport', async () => {
  const shots = process.env['CRASHED_RUN_SHOTS']
  if (shots !== undefined) mkdirSync(shots, { recursive: true })
  for (const width of [1440, 390]) {
    await app.page.setViewportSize({ width, height: 1000 })
    for (const look of ['light'] as const) {
      await app.page.emulateMedia({ colorScheme: look })
      await app.page.evaluate((theme) => { document.documentElement.dataset['theme'] = theme }, look)
      const state = app.page.locator('.px-run-state').first()
      await state.scrollIntoViewIfNeeded()
      const where = `${String(width)} ${look}`
      expect(await state.textContent(), `${where}: the row's state words`).toBe(WORDS)
      const measured = await state.evaluate((element) => {
        const box = element.getBoundingClientRect()
        return { left: box.left, right: box.right, viewport: window.innerWidth, document: document.documentElement.scrollWidth }
      })
      expect(measured.document, `${where}: document width`).toBeLessThanOrEqual(measured.viewport)
      expect(measured.left, `${where}: left edge`).toBeGreaterThanOrEqual(0)
      expect(measured.right, `${where}: right edge`).toBeLessThanOrEqual(measured.viewport)
    }
  }
  if (shots !== undefined) {
    for (const width of [1440, 990, 660, 390]) {
      await app.page.setViewportSize({ width, height: 1000 })
      for (const look of ['light', 'dark'] as const) {
        await app.page.emulateMedia({ colorScheme: look })
        await app.page.evaluate((theme) => { document.documentElement.dataset['theme'] = theme }, look)
        await app.page.screenshot({ path: join(shots, `crashed-run-${String(width)}-${look}.png`) })
      }
    }
  }
})
