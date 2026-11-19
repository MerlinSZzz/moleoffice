// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY NOTICE MOLE OFFICE AND THE INSPECTOR WRITE HAS A ROW THAT SAYS WHETHER IT WAKES ITS READER.
 *
 * A message that does not need its reader is not pushed to them; it is there when they look. A decision on problem
 * 2-AtvZiEfVO9 says so. The one place that says which is which is the table `NOTICES` in
 * src/server/lib/notices.ts.
 *
 * WHAT IS PROVED HERE:
 *
 *   3. A person's message, and an agent's that is not an inspector's, always wake. Only Mole Office's
 *      notices and an inspector's can be quiet, and only when their row says so.
 *   4. Only Mole Office and an inspector may store a kind: anybody else is refused, and so is a kind
 *      the table does not hold. Nobody changes a kind afterwards.
 *
 * The waiting door's own behaviour, a quiet notice held back and a waking one handed over, is proved in
 * tests/an-office-notice-that-asks-nothing-wakes-no-waiter.test.ts. Nothing here opens ./data/panelx.db:
 * `freshDb` makes a throwaway database.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { moleOffice } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const SERVER = fileURLToPath(new URL('../src/server', import.meta.url))

let t: TestDb
let app: FastifyInstance
let notices: typeof import('../src/server/lib/notices.ts')

const as = (type: 'agent' | 'human', id: string) => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
})
const AS_THE_OWNER = as('human', THE_PERSON)

/** Every .ts file under src/server, read whole. */
function everyServerFile(dir = SERVER): { path: string; text: string }[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return everyServerFile(path)
    return path.endsWith('.ts') ? [{ path, text: readFileSync(path, 'utf8') }] : []
  })
}

/** The registry id of the agent registered under this handle. */
function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `nothing is registered as ${handle}`).toBeDefined()
  return row!.id
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  notices = await import('../src/server/lib/notices.ts')
  for (const payload of [
    { handle: 'an-inspector', name: 'An Inspector', role: 'inspector' },
    { handle: 'a-worker', name: 'A Worker', role: 'worker' },
  ]) {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_OWNER, payload })
    expect(r.statusCode, r.body).toBe(201)
  }
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('who can be quiet', () => {
  const QUIET = 'aRunWasSealed'
  const WAKING = 'anEntryLanded'

  it('lets a notice of Mole Office be quiet only when its row says so', () => {
    // THE CONTROL: the two rows are what this case reads them as.
    expect(notices.NOTICES[QUIET].wakes).toBe(false)
    expect(notices.NOTICES[WAKING].wakes).toBe(true)
    expect(notices.whyThisWakesNoWaiter(moleOffice(), QUIET)).toContain(`"${QUIET}"`)
    expect(notices.whyThisWakesNoWaiter(moleOffice(), WAKING)).toBeNull()
    expect(notices.whyThisWakesNoWaiter(moleOffice(), undefined), 'a notice with no kind woke nobody').toBeNull()
    expect(notices.whyThisWakesNoWaiter(moleOffice(), 'aKindNobodyMade')).toBeNull()
  })

  it('lets an inspector be quiet too, by the same row', () => {
    expect(notices.whyThisWakesNoWaiter({ kind: 'agent', id: idOf('an-inspector') }, QUIET)).toContain('the inspector')
  })

  it('keeps a stored notice of a retired quiet kind quiet, while a kind nobody made still wakes', () => {
    // A KIND LEAVES THE TABLE WHEN NOTHING WRITES IT ANY MORE, but its rows stay stored. One of them must not start
    // waking a waiter because its kind was retired. "Read as a checklist item" was a quiet row until the five
    // checklist lines replaced it.
    const RETIRED = 'theOfficeReadThePersonsWordsAsAnItem'
    // THE CONTROL: the kind is retired, so the table does not hold it.
    expect(notices.isANoticeKind(RETIRED), 'the retired kind is still in the table').toBe(false)
    expect(notices.whyThisWakesNoWaiter(moleOffice(), RETIRED), 'a stored row of the retired kind wakes its reader').toContain(`"${RETIRED}"`)
    expect(notices.whyThisWakesNoWaiter({ kind: 'agent', id: idOf('an-inspector') }, RETIRED)).toContain(`"${RETIRED}"`)
    expect(notices.whyThisWakesNoWaiter(moleOffice(), 'aKindNobodyMade'), 'a kind nobody made woke nobody').toBeNull()
    expect(notices.whyThisWakesNoWaiter({ kind: 'person', id: THE_PERSON }, RETIRED), "a person's message woke nobody").toBeNull()
  })

  it("always wakes for a person's message and for an agent's that is not an inspector's", () => {
    expect(notices.whyThisWakesNoWaiter({ kind: 'person', id: THE_PERSON }, QUIET), "a person's message woke nobody").toBeNull()
    expect(notices.whyThisWakesNoWaiter({ kind: 'agent', id: idOf('a-worker') }, QUIET), "a worker's message woke nobody").toBeNull()
    expect(notices.whyThisWakesNoWaiter(null, QUIET)).toBeNull()
  })
})

describe('storing a kind', () => {
  const aMessage = (notice: string) => ({
    kind: 'message',
    title: 'Test: a message that says it is a notice',
    data: { body: 'Test: a message that says it is a notice', to: [{ kind: 'agent', id: idOf('a-worker') }], notice },
  })

  it('refuses a kind from a person and from an agent that is not an inspector, and writes nothing', async () => {
    const before = (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'message'").get() as { n: number }).n
    const fromThePerson = await app.inject({ method: 'POST', url: '/api/records', headers: AS_THE_OWNER, payload: aMessage('aRunWasSealed') })
    expect(fromThePerson.statusCode, fromThePerson.body).toBe(403)
    expect(fromThePerson.body).toContain('Only Mole Office and the inspector write `notice`')
    const fromAWorker = await app.inject({ method: 'POST', url: '/api/records', headers: as('agent', 'a-worker'), payload: aMessage('aRunWasSealed') })
    expect(fromAWorker.statusCode, fromAWorker.body).toBe(403)
    const after = (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'message'").get() as { n: number }).n
    expect(after).toBe(before)
  })

  it('stores a kind from an inspector, and refuses one the table does not hold', async () => {
    // This case asks about notice kinds, so keep its reader held just for the inspector's send.
    const holder = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'A synthetic holder', actor: t.api.HUMAN,
      data: { state: 'running', runtime: 'claude-code' } }).id
    const { registerResource } = await import('../src/server/lib/resources.ts')
    registerResource({ workspaceId: 'default', sessionRecordId: holder, type: 'process', key: String(process.pid), actor: t.api.HUMAN })
    const held = await app.inject({ method: 'POST', url: '/api/handles/a-worker/hold', headers: AS_THE_OWNER,
      payload: { session: holder, machine: 'a-synthetic-machine', runtime: 'claude-code' } })
    expect(held.statusCode).toBe(201)
    let known
    try {
      known = await app.inject({ method: 'POST', url: '/api/records', headers: as('agent', 'an-inspector'), payload: aMessage('theCheckEnded') })
    } finally {
      const released = await app.inject({ method: 'POST', url: '/api/handles/a-worker/release', headers: AS_THE_OWNER,
        payload: { session: holder, because: 'The synthetic send is complete.' } })
      expect(released.statusCode).toBe(200)
    }
    expect(known.statusCode, known.body).toBe(201)
    const id = (known.json() as { record: { id: string; data: Record<string, unknown> } }).record
    expect(id.data['notice']).toBe('theCheckEnded')
    const unknown = await app.inject({ method: 'POST', url: '/api/records', headers: as('agent', 'an-inspector'), payload: aMessage('aKindNobodyMade') })
    expect(unknown.statusCode, unknown.body).toBe(422)
    expect(unknown.body).toContain('is not a kind of notice the office knows')
    // A RETIRED KIND IS REFUSED THE SAME WAY: its stored rows stay quiet, and nothing writes a new one.
    const retired = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: as('agent', 'an-inspector'),
      payload: aMessage('theOfficeReadThePersonsWordsAsAnItem'),
    })
    expect(retired.statusCode, retired.body).toBe(422)
  })

  it('refuses a patch that sets or changes a kind', async () => {
    const groups = await import('../src/server/lib/groups.ts')
    const line = groups.writeASystemLineToOne(
      { kind: 'agent', id: idOf('a-worker') },
      'default',
      SYSTEM_LINES.aRunAnswered,
      { type: 'system', id: moleOffice().id },
    )
    const stored = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(line.id) as { data: string }
    expect((JSON.parse(stored.data) as { notice: string }).notice).toBe('aRunAnswered')
    const version = (await app.inject({ method: 'GET', url: `/api/records/${line.id}`, headers: AS_THE_OWNER })).json() as { record: { version: string } }
    const changed = await app.inject({
      method: 'PATCH',
      url: `/api/records/${line.id}`,
      headers: AS_THE_OWNER,
      payload: { ifVersion: version.record.version, dataPatch: { notice: 'aCounterFired' } },
    })
    expect(changed.statusCode, changed.body).toBe(403)
  })
})
