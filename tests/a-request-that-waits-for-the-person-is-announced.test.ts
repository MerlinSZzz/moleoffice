// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REQUEST THAT WAITS FOR THE PERSON IS ANNOUNCED WHEN IT IS FILED, ANSWERED OR WITHDRAWN. Problem sPEo_5NxXX4X.
 *
 * The owner had Home open in the desktop window while a Claude registered itself. The row "<handle> registers itself"
 * came only after the owner went to another page and back, so a tester following the guide's admit step would find nothing
 * to press (docs/beta/for-your-ai.md, "Ask the person to admit you").
 *
 * WHY. GET /api/waiting lists every role request that answers to the person (source 5 in src/server/lib/waiting.ts).
 * The shell reads that list when the route changes (src/web/App.tsx) and Home reads it again once a minute. The one
 * thing that makes an open page read it at once is a `list.changed` naming `needsYou` (src/web/components/OnePress.tsx),
 * and until this file nothing announced one for a role request: filing the waiting row in
 * src/server/api/participants.ts went through the create door of src/server/lib/records.ts, which announced nothing
 * for that kind.
 *
 * WHAT IS MEASURED. A page of the person is opened on the server's own event list, and each write below is made
 * through its real door:
 *   1. a session that registers itself and waits;
 *   2. the person's press that admits it, which also names the new agent's registry for Agents at work;
 *   3. a card ask from an agent the person started, and its withdrawal by the asker with its own key;
 *   4. two controls that must announce no `needsYou`: a note, and a card ask that waits for another agent.
 * Each looks at what the page was sent while that one write ran.
 *
 * MUTATIONS, each after a control run: remove the call on the create door (cases 1 and 3 go red); remove the call on
 * the patch door (cases 2 and 3 go red); announce for every role request whoever it answers (case 4 goes red).
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { ChannelEvent, EventOnTheWire } from '../src/shared/events.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string, key?: string): Record<string, string> => ({
  ...PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  ...(key === undefined ? {} : { 'x-mole-office-key': key }),
})

let t: TestDb
let app: FastifyInstance
let heard: EventOnTheWire[] = []

async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, body?: unknown): Promise<Record<string, unknown>> {
  const res = await app.inject({ method, url, headers, ...(body === undefined ? {} : { payload: JSON.stringify(body) }) })
  expect(res.statusCode, `${method} ${url}: ${res.body}`).toBeLessThan(300)
  return res.json() as Record<string, unknown>
}

/** The events a page of the person was sent while `write` ran. */
async function whatAPageIsSent(write: () => Promise<unknown>): Promise<ChannelEvent[]> {
  heard = []
  await write()
  return heard.map((one) => one.event)
}

/** Whether a page was told to read Needs you again. */
const toldNeedsYou = (events: ChannelEvent[]): boolean => events.some((one) => one.name === 'list.changed' && one.lists.includes('needsYou'))

/** A durable agent the person started, with the key it was given. */
async function started(handle: string, by: Record<string, string>): Promise<string> {
  const made = await call('POST', '/api/agents/started', by, { handle, name: handle, role: 'worker' })
  return String((made['whatToGiveIt'] as { key: string }).key)
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  const events = await import('../src/server/lib/events.ts')
  events.pageOpened({ workspaceId: 'default', who: { kind: 'person', id: THE_PERSON }, send: (one) => heard.push(one) })
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a request that waits for the person', () => {
  let waiting = ''

  it('1. a session that registers itself and waits tells every open page that Needs you changed', async () => {
    const sent = await whatAPageIsSent(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/agents/register-myself',
        headers: asAgent('newcomer'),
        payload: JSON.stringify({ handle: 'newcomer', name: 'Newcomer', workingDirectory: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`, requestedRole: 'worker' }),
      })
      expect(res.statusCode, res.body).toBe(202)
      waiting = String((res.json() as { request: string }).request)
    })
    expect(toldNeedsYou(sent), `what the page was sent: ${JSON.stringify(sent)}`).toBe(true)
  })

  it('2. the press that admits it tells them again, and names the registry for Agents at work', async () => {
    const sent = await whatAPageIsSent(() => call('POST', `/api/roles/requests/${waiting}/grant`, PERSON, {}))
    expect(toldNeedsYou(sent), `what the page was sent: ${JSON.stringify(sent)}`).toBe(true)
    expect(sent.some((one) => one.name === 'list.changed' && one.lists.includes('participants'))).toBe(true)
  })

  it('3. a card ask from an agent, and its withdrawal by the asker, tell them too', async () => {
    const key = await started('asker', PERSON)
    let request = ''
    const filed = await whatAPageIsSent(async () => {
      request = String((await call('POST', '/api/roles/requests', asAgent('asker'), { asking: 'supervisor' }))['request'])
    })
    expect(toldNeedsYou(filed), `what the page was sent: ${JSON.stringify(filed)}`).toBe(true)
    const withdrawn = await whatAPageIsSent(() => call('POST', `/api/roles/requests/${request}/withdraw`, asAgent('asker', key), {}))
    expect(toldNeedsYou(withdrawn), `what the page was sent: ${JSON.stringify(withdrawn)}`).toBe(true)
  })

  it('4. a note, and a card ask that waits for another agent, do not', async () => {
    const note = await whatAPageIsSent(() => call('POST', '/api/records', PERSON, { kind: 'note', title: 'A made-up note', data: { body: 'Nothing waits on this.' } }))
    expect(toldNeedsYou(note), `what the page was sent: ${JSON.stringify(note)}`).toBe(false)
    const starterKey = await started('the-sup', PERSON)
    await started('the-worker', asAgent('the-sup', starterKey))
    const ask = await whatAPageIsSent(() => call('POST', '/api/roles/requests', asAgent('the-worker'), { asking: 'supervisor' }))
    const filed = await call('GET', '/api/waiting', PERSON)
    expect(JSON.stringify(filed)).not.toContain('the-worker')
    expect(toldNeedsYou(ask), `what the page was sent: ${JSON.stringify(ask)}`).toBe(false)
  })
})
