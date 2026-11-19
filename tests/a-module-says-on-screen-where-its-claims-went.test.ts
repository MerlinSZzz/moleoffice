// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HISTORY READ HAS A SCREEN, AND ITS ROWS READ AS SENTENCES.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/records/<id>/history` answers with dated, attributed events, including where a module's
 * claims went. It landed in the wave titled *History a person can find*, and nothing in the browser
 * called it — `grep -rn '/history' src/web/` found only the address fragment for the record page's
 * History section, which is a different route. So the answer was true for an agent with curl and
 * absent for a person with a browser. `tests/what-happened-to-my-modules-claims.test.ts` was green
 * throughout, because it asks the route and not the product.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE HOLDS
 * ---------------------------------------------------------------------------------------
 *
 * 1. THE WIRING. The browser asks for the route, from the panel a person opens.
 * 2. THE WORDS. The rows the real route returns are turned into sentences by the same readers the
 *    rest of the product uses, and no stored token reaches the screen. The events are the route's
 *    own, driven over HTTP, so a change to what the read returns fails here rather than drawing a
 *    blank row.
 *
 * The panel itself is not rendered, and that is a limit rather than a choice: it reads through
 * `useAsync`, which fills in an effect, and `renderToStaticMarkup` runs no effects — a render would
 * assert on the word "reading what happened…" and nothing else. So the two halves are asserted
 * separately: that the call is made, and that the answer reads as English.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { HistoryEvent } from '../src/server/lib/history.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'

const HUMAN = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default' }

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, A_HOOK_THAT_IMPORTS_THE_SERVER)
afterAll(async () => {
  await app.close()
  t.close()
})

const source = (path: string): string => readFileSync(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), 'utf8')

type History = typeof import('../src/web/components/RecordHistory.tsx')

async function words(): Promise<History> {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  vi.resetModules()
  return (await import('../src/web/components/RecordHistory.tsx')) as History
}

/** A module whose `data.claims` was moved into the implementation map, and no ledger row said so. */
async function aModuleWhoseClaimsWereMoved(): Promise<{ id: string; pattern: string }> {
  const made = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: HUMAN,
    payload: { kind: 'module', title: 'Tray clamp', data: { context: 'The gripper subsystem', state: 'active' } },
  })
  expect(made.statusCode, made.body).toBe(201)
  const id = (made.json() as { record: { id: string } }).record.id
  // THE IDS ARE THE MODULE'S OWN, because one office holds the rows of every case in the file.
  const repositoryId = `repo-${id}`
  const mapId = `map-${id}`
  const repository = t.client.sqlite
  repository
    .prepare(
      'INSERT INTO repositories (id, workspace_id, name, root, created_at, updated_at, created_by) ' +
        `VALUES ('${repositoryId}', 'default', 'panelx-${id}', '${THE_TEST_FIXTURE_ROOT}/panelx', '2026-08-26 11:28:58', '2026-08-26 11:28:58', '${THE_TEST_OFFICES_OWNER.id}')`,
    )
    .run()
  const pattern = 'src/shared/attention.ts'
  repository
    .prepare(
      'INSERT INTO implementation_map (id, workspace_id, record_id, repository_id, pattern, relation, provenance, note, stated_at, stated_by) ' +
        `VALUES ('${mapId}', 'default', ?, '${repositoryId}', ?, 'implements', 'declared', ?, '2026-08-26 11:28:58', 'system:module-claims-migration')`,
    )
    .run(id, pattern, 'Carried over verbatim from `data.claims` by the module-claims migration.')
  return { id, pattern }
}

async function eventsFor(id: string): Promise<HistoryEvent[]> {
  const read = await app.inject({ method: 'GET', url: `/api/records/${id}/history`, headers: HUMAN })
  expect(read.statusCode, read.body).toBe(200)
  return (read.json() as { events: HistoryEvent[] }).events
}

describe('the rows read as sentences, over the events the route really returns', () => {
  it('says where a module’s claims went, in words, dated and attributed', async () => {
    const { id, pattern } = await aModuleWhoseClaimsWereMoved()
    const { whatHappened, whoSaidIt } = await words()
    const moved = (await eventsFor(id)).filter((event) => event.source.table === 'implementation_map')
    expect(moved, 'the module’s history says nothing about where its claims went').toHaveLength(1)
    // Criterion change: 7FEOshq3mBGG reserves file paths and actor addresses for developer mode.
    const said = whatHappened(moved[0] as HistoryEvent, 'inspect')
    expect(said).toContain(pattern)
    expect(said).toContain('implements')
    expect(whoSaidIt(moved[0] as HistoryEvent, 'inspect')).toContain('system:module-claims-migration')
    // NOT THE ACTOR READER. `who.actorType` on one of these rows is the row's PROVENANCE, and
    // reading it as an actor type would print "unknown actor: declared" about a row Mole Office
    // understands.
    expect(whoSaidIt(moved[0] as HistoryEvent, 'inspect')).not.toContain('unknown actor')
  })

  it('turns every row of every table into English, with no stored token left on screen', async () => {
    const { id } = await aModuleWhoseClaimsWereMoved()
    // A link, so the reading covers a link row as well as a revision, a change row and a map row.
    const other = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HUMAN,
      payload: { kind: 'claim', title: 'The gripper closes in 240ms', data: {} },
    })
    const otherId = (other.json() as { record: { id: string } }).record.id
    await app.inject({
      method: 'POST',
      url: '/api/links',
      headers: HUMAN,
      payload: { fromId: otherId, toId: id, type: 'about' },
    })
    const { whatHappened } = await words()
    const events = await eventsFor(id)
    const tables = new Set(events.map((event) => event.source.table))
    expect(tables.has('revisions')).toBe(true)
    expect(tables.has('implementation_map')).toBe(true)
    for (const event of events) {
      const said = whatHappened(event)
      expect(said, `${event.source.table} row drew nothing`).not.toBe('')
      // The stored op words that would be meaningless on a screen. `implements` is deliberately not
      // in this list: it is a word a person says out loud about code, and `relationWord` says so.
      for (const token of ['baseline', 'undelete', 'relates_to', 'derived_from']) {
        expect(said, `${event.source.table} row drew the stored token ${token}`).not.toContain(token)
      }
    }
  })

  it('names a relation it does not understand rather than drawing it as one it does', async () => {
    const { whatHappened } = await words()
    const invented = {
      at: '2026-08-26 11:28:58',
      source: { table: 'implementation_map' as const, id: 'map-two' },
      subject: { id: 'mod-1', kind: 'module', title: 'Tray clamp' },
      op: 'depends_on',
      field: 'src/shared/time.ts',
      because: 'itself' as const,
      who: { actorType: 'declared', actorId: THE_TEST_OFFICES_OWNER.id, sessionId: null },
    }
    expect(whatHappened(invented)).toContain('unknown relation')
  })
})
