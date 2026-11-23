// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE INTERRUPTED RUNS PAGE, IN A BROWSER: ONE PRESS ASKS FOR A RESUME, AND A RUN THAT CANNOT RESUME
 * HAS NO BUTTON, ONLY ITS REASON. Criterion W7 (piece H7 of plan hp7Z-IW9JWSX).
 *
 * The office is this test's own (`liveApp`), never the live office. Its server runs under the test
 * runner, so it starts no message worker, and the two runs are filed as the worker files them: a run
 * a shutdown paused with its conversation recorded, and a run stopped mid-turn that never named one.
 * Both are labelled synthetic in their titles and words. That a press really resumes the tool's own
 * conversation is proved with real offices in tests/an-interrupted-run-resumes-with-one-press.test.ts;
 * this file proves what the page draws and that its button sends the press.
 *
 * The browser pairs on the Pairing page first, because only the proved person may resume a run.
 *
 * Three-run proofs, with `npm run build` before each run because the page is served built:
 *   node tools/run-named-tests.mjs tests/the-interrupted-runs-page-presses-resume.test.ts
 * MUTATIONS:
 *   - src/web/pages/InterruptedRunsPage.tsx draws the button whether or not the run can resume: red,
 *     because the run with no conversation has a button;
 *   - src/web/api.ts `resumeARun` posts to the list's address instead of the run's: red, because the
 *     press asks for nothing.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { t } from '../src/shared/i18n.ts'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'

/** The checkout this test's office serves from, which is the folder a resumable run must have worked in. */
const REPO = fileURLToPath(new URL('..', import.meta.url))

let app: LiveApp
let paused = ''
let stopped = ''

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const keys = JSON.parse(readFileSync(join(app.dir, 'keys.json'), 'utf8')) as { person: string }
  const headers = {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_PERSON,
    'x-mole-office-key': keys.person,
  }
  const response = await fetch(app.api + path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  expect(response.status, `${method} ${path}: ${await response.clone().text()}`).toBe(
    method === 'POST' ? theAnswerToAWriteInATestOffice(headers, body) : 200,
  )
  return (await response.json()) as T
}

beforeAll(async () => {
  app = await liveApp({ name: 'interrupted-runs-page', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  await call('POST', '/api/records', { kind: 'agent', title: 'synthetic-runner', data: { handle: 'synthetic-runner', runtime: 'opencode', state: 'active' } })
  const listed = await call<{ agents?: { id: string; handle: string }[] }>('GET', '/api/participants')
  const agentId = (listed.agents ?? []).find((one) => one.handle === 'synthetic-runner')!.id
  const aMessage = async (title: string) =>
    (await call<{ record: { id: string } }>('POST', '/api/records', { kind: 'message', title, data: { body: 'Synthetic words.', to: [{ kind: 'agent', id: agentId }] } })).record.id
  const first = await aMessage('Synthetic message a shutdown interrupted')
  const second = await aMessage('Synthetic message a stop interrupted')
  const serving = { servingAgent: 'synthetic-runner', servingAgentId: agentId, startedByMoleOffice: true, workingDirectory: REPO }
  paused = (await call<{ record: { id: string } }>('POST', '/api/records', {
    kind: 'session',
    title: 'Synthetic run a shutdown paused',
    data: {
      ...serving,
      state: 'paused',
      runtime: 'opencode',
      deliveringMessage: first,
      providerSession: 'synthetic-conversation',
      paused: { at: '2026-10-03 09:15:00', time: '2026-10-03T09:15:00.000Z', by: { kind: 'person', id: THE_PERSON }, because: 'Synthetic: the office was shut down for the night.' },
    },
  })).record.id
  stopped = (await call<{ record: { id: string } }>('POST', '/api/records', {
    kind: 'session',
    title: 'Synthetic run stopped mid-turn',
    data: { ...serving, state: 'crashed', runtime: 'claude-code', deliveringMessage: second, doing: 'Synthetic: a person stopped this run mid-turn.' },
  })).record.id

  await app.page.goto(`${app.site}/#/pairing`)
  await waitForThePage(app.page)
  await app.page.getByRole('button', { name: 'Pair this browser', exact: true }).click()
  await app.page.getByText('This browser is paired.', { exact: true }).waitFor()
}, 180_000)

afterAll(async () => {
  await app?.stop()
})

it('draws a run that cannot resume with its reason and no button, and presses resume on one that can', async () => {
  await app.page.goto(`${app.site}/#/interrupted`)
  await waitForThePage(app.page)
  await expect.poll(() => app.page.locator('h1.ir-title').textContent()).toBe('Interrupted runs')

  // THE RUN THAT CANNOT RESUME: its reason, as a short state, and no button anywhere in it.
  const cannot = app.page.locator(`.ir-run[data-run="${stopped}"]`)
  await cannot.waitFor()
  expect(await cannot.getAttribute('data-can-resume')).toBe('no')
  expect(await cannot.locator('.ir-cannot strong').textContent()).toBe(t('w13t.interrupted.cannot'))
  expect(await cannot.locator('.ir-cannot').textContent()).toBe(
    `${t('w13t.interrupted.cannot')}${t('w13t.interrupted.cannotState.no-conversation')}`,
  )
  expect(await cannot.getByRole('button').count()).toBe(0)
  expect(await cannot.textContent()).toContain('Synthetic: a person stopped this run mid-turn.')

  // THE RUN THAT CAN: which message, why it stopped, what was measured, and one button.
  const can = app.page.locator(`.ir-run[data-run="${paused}"]`)
  expect(await can.getAttribute('data-can-resume')).toBe('yes')
  expect(await can.textContent()).toContain('Synthetic message a shutdown interrupted')
  expect(await can.textContent()).toContain('Synthetic: the office was shut down for the night.')
  expect(await can.textContent()).toContain(t('w13t.interrupted.measuredState.resumes'))
  await can.getByRole('button', { name: 'Resume', exact: true }).click()

  // THE PRESS WAS SENT AND WRITTEN: the page says the resume was asked, and the run's record says who asked.
  await can.locator('.ir-asked').waitFor()
  expect(await can.locator('.ir-asked').textContent()).toContain(t('w13t.interrupted.resumeAsked'))
  expect(await can.getByRole('button').count()).toBe(0)
  const record = await call<{ record: { data: Record<string, unknown> } }>('GET', `/api/records/${paused}`)
  expect((record.record.data['resume'] as { askedBy: unknown }).askedBy).toEqual({ kind: 'person', id: THE_PERSON })
}, 120_000)
