// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OWNER'S OWN PAGE KEEPS WORKING, AND A PROGRAM THAT SENDS NOTHING IS REFUSED.
 *
 * The built page, in a real browser, paired by the page's own press, with the key window closed by that browser. The
 * page proves it is the owner's page with the two halves of a device key: a cookie half the browser keeps, and a header
 * half the page keeps in its own storage and sends on its calls. Only the pairing press, or a device the owner confirmed,
 * puts them in a browser. So after the close the page still reads a message and still says it is paired, while a
 * program on the same computer that sends no key and no name is refused and told what to send.
 *
 * Three-run proof:
 *   node tools/run-named-tests.mjs tests/the-persons-page-keeps-working-after-the-close.test.ts
 * Mutation: in src/server/db/the-key-on-this-request-was-made-for-a-run.ts, `keyOn`, return
 * `oneHeader(req.headers[KEY_HEADER])` alone, so the office stops joining the two halves. The page then no longer proves
 * it is the owner's, the pairing page says it is not paired, and this goes red. Restore with cp and check with cmp.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DEVICE_HALF_HEADER } from '../src/config/key-header.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const WORDS = 'Synthetic words the page reads after the close.'

let app: LiveApp
let messageId = ''

/**
 * A request made as this browser: its cookies carry the cookie half, and the header half is read from the page's own
 * storage, as the page sends it.
 */
async function asThisBrowser(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const { DEVICE_HALF_KEY } = await import('../src/web/lib/the-device-half.ts')
  const headerHalf = await app.page.evaluate((key) => window.localStorage.getItem(key), DEVICE_HALF_KEY)
  if (headerHalf === null) throw new Error('the page keeps no header half, so this browser is not paired')
  const res = await app.context.request.fetch(`${app.api}${path}`, {
    method,
    headers: { ...OWNER, [DEVICE_HALF_HEADER]: headerHalf },
    ...(body === undefined ? {} : { data: JSON.stringify(body) }),
  })
  return { status: res.status(), json: (await res.json().catch(() => ({}))) as Record<string, unknown> }
}

beforeAll(async () => {
  app = await liveApp({ name: 'the-owners-page-after-the-close', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  // THE PAGE'S OWN PRESS, as the owner would make it.
  await app.page.goto(`${app.site}/#/pairing`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await app.page.getByRole('button', { name: 'Pair this browser', exact: true }).click()
  await app.page.getByText('This browser is paired.').waitFor({ timeout: 30_000 })
  const agent = await asThisBrowser('POST', '/api/records', {
    kind: 'agent', title: 'A synthetic reader', data: { handle: 'a-synthetic-reader', runtime: 'claude-code', state: 'active' },
  })
  expect(agent.status, JSON.stringify(agent.json)).toBe(201)
  const registry = (await asThisBrowser('GET', '/api/participants')).json as { agents: { id: string; handle: string }[] }
  const agentId = registry.agents.find((one) => one.handle === 'a-synthetic-reader')?.id ?? ''
  const made = await asThisBrowser('POST', '/api/records', {
    kind: 'message', title: 'A synthetic message', data: { body: WORDS, to: [{ kind: 'agent', id: agentId }] },
  })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(made.status, JSON.stringify(made.json)).toBe(409)
  messageId = (made.json['record'] as { id: string }).id
  const closed = await asThisBrowser('POST', '/api/office/key-window/close')
  expect(closed.status, JSON.stringify(closed.json)).toBe(200)
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

describe('after the close', () => {
  it('refuses a program on this computer that sends no key and no name, and tells it what to send', async () => {
    const res = await fetch(`${app.api}/api/records/${messageId}`, { headers: { 'x-mole-office-workspace': 'default' } })
    const said = (await res.json()) as { error?: string }
    expect(res.status, JSON.stringify(said)).toBe(403)
    expect(said.error).toContain('x-mole-office-key')
    expect(JSON.stringify(said)).not.toContain(WORDS)
  })

  it('shows the owner\'s page the message, and the page still says it is paired', async () => {
    await app.page.goto(`${app.site}/#/r/${messageId}`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    await app.page.getByText(WORDS).first().waitFor({ timeout: 30_000 })
    await app.page.goto(`${app.site}/#/pairing`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    await app.page.getByText('This browser is paired.').waitFor({ timeout: 30_000 })
  }, 120_000)
})
