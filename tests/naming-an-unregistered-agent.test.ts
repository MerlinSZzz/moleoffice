// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT NOBODY REGISTERED IS NAMED, AND NOTHING ELSE HAPPENS TO IT.
 *
 * Criterion M14 of design/messages/ACCEPTANCE.md, the registry half, as it read when this test was
 * written: *An actor id on a request is looked up in the registries. A record write from an unknown
 * agent is accepted as today and the row is named unregistered on the runtime and dashboard pages
 * (F1's pattern: named, never stopped).* Since 30 September 2026 M14 says a record write from an
 * unknown agent over HTTP is refused with HTTP 403
 * (tests/a-write-under-an-unregistered-agent-id-is-refused.test.ts). The writes below are made in
 * process, through `t.api`, which the refusal does not ask, so they are still accepted and still
 * named; that is the half of M14 this file holds.
 *
 * The F1 answer:
 *
 * Name it, and never stop it. An agent is sometimes started for something unrelated, and a
 * rule that acted on whatever is unregistered would be too wide.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

type RegistryLib = typeof import('../src/server/lib/participants.ts')

let t: TestDb
let app: FastifyInstance
let registry: RegistryLib
/**
 * IMPORTED AFTER A WINDOW EXISTS. src/web/api.ts reads `window.localStorage` while it is being
 * evaluated, the runner's environment is `node`, and adding a DOM is a dependency this project has
 * ruled out — so the smallest stand-in goes in first, the way
 * tests/nothing-there-is-not-nobody-looked.test.ts does it.
 */
let UnregisteredAgents: typeof import('../src/web/components/UnregisteredAgents.tsx')['UnregisteredAgents']
/** The id is developer mode's since R5c, so the drawing tests choose a mode. */
let setMode: typeof import('../src/web/lib/mode.ts')['setMode']

beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  UnregisteredAgents = (await import('../src/web/components/UnregisteredAgents.tsx')).UnregisteredAgents
  setMode = (await import('../src/web/lib/mode.ts')).setMode
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  registry = await import('../src/server/lib/participants.ts')
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/** Each case writes as a stranger of its own, so its count is only the writes that case made. */
let caseNumber = 0
let A_STRANGER: { type: 'agent'; id: string } = { type: 'agent', id: 'claude-code/nobody-registered' }
let builder = 'builder-x'

beforeEach(async () => {
  caseNumber += 1
  A_STRANGER = { type: 'agent', id: `claude-code/nobody-registered-case-${String(caseNumber)}` }
  builder = `builder-x-case-${String(caseNumber)}`
  t.api.createRecord({
    workspaceId: 'default',
    kind: 'agent',
    title: `Builder X ${String(caseNumber)}`,
    data: { handle: builder, runtime: 'claude-code', state: 'active' },
    actor: { type: 'human', id: THE_PERSON },
  })
})

describe('the actor id on a write is looked up, and an unknown one is named', () => {
  it('accepts the write, exactly as before, and keeps what it wrote', () => {
    const made = t.api.createRecord({
      workspaceId: 'default',
      kind: 'note',
      title: 'Filed by an agent nobody registered',
      actor: A_STRANGER,
    })

    expect(made.title).toBe('Filed by an agent nobody registered')
  })

  it('names it with the id exactly as the header sent it, and counts what it wrote', () => {
    const before = new Set(registry.unregisteredAgentsSeen().map((row) => row.id))
    t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'One', actor: A_STRANGER })
    t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Two', actor: A_STRANGER })

    const named = registry.unregisteredAgentsSeen().filter((row) => !before.has(row.id))

    expect(named.map((row) => row.id)).toEqual([A_STRANGER.id])
    expect(named[0]?.writes).toBe(2)
    expect(named[0]?.lastWroteAt, 'nothing said when it last wrote').not.toBe('')
  })

  it('leaves out an agent the registry answers for, by its id and by its handle', () => {
    // A caller sends whatever it types in the header, and both of those are things a caller
    // reasonably types for one agent. Neither may be named as a stranger.
    const before = new Set(registry.unregisteredAgentsSeen().map((row) => row.id))
    t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'By id', actor: { type: 'agent', id: builder } })

    expect(registry.unregisteredAgentsSeen().filter((row) => !before.has(row.id))).toEqual([])
  })

  it('says nobody when every agent that has written is registered, rather than nothing at all', () => {
    const before = new Set(registry.unregisteredAgentsSeen().map((row) => row.id))
    expect(registry.unregisteredAgentsSeen().filter((row) => !before.has(row.id))).toEqual([])
  })

  it('names every one of them and not the first twenty, so the count is a real count', () => {
    // THE READING USED TO TAKE A LIMIT OF 20 AND SAY NOTHING ABOUT THE REST. On the owner's corpus
    // 110 distinct agent ids answered to no registry row and the page drew twenty of them, under a
    // sentence a reader takes as covering all of them. Problem `yKFPQXucwshV`. Twenty-five here,
    // because the number that matters is "more than the page draws at once".
    const before = new Set(registry.unregisteredAgentsSeen().map((row) => row.id))
    for (let n = 0; n < 25; n += 1) {
      t.api.createRecord({
        workspaceId: 'default',
        kind: 'note',
        title: `Filed by stranger ${String(n)}`,
        actor: { type: 'agent', id: `claude-code/stranger-${String(caseNumber)}-${String(n)}` },
      })
    }

    expect(registry.unregisteredAgentsSeen().filter((row) => !before.has(row.id))).toHaveLength(25)
  })

  it('is carried on the reading the page about who is working asks for', async () => {
    const before = await app.inject({ method: 'GET', url: '/api/working', headers: { 'x-mole-office-workspace': 'default' } })
    expect(before.statusCode, before.body).toBe(200)
    const already = new Set((before.json() as { unregistered: { id: string }[] }).unregistered.map((row) => row.id))
    t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'One', actor: A_STRANGER })

    const reply = await app.inject({
      method: 'GET',
      url: '/api/working',
      headers: { 'x-mole-office-workspace': 'default' },
    })

    expect(reply.statusCode, reply.body).toBe(200)
    const said = reply.json() as { unregistered: { id: string; writes: number }[] }
    const added = said.unregistered.filter((row) => !already.has(row.id))
    expect(added.map((row) => ({ id: row.id, writes: row.writes }))).toEqual([{ id: A_STRANGER.id, writes: 1 }])
  })
})

describe('what the page draws for one, and what it must never draw', () => {
  const rows = [{ id: 'claude-code/nobody-registered', writes: 2, lastWroteAt: '2026-09-03 22:15:00' }]

  afterEach(() => setMode('normal'))

  it('draws how much it wrote, and the id in developer mode only', () => {
    setMode('normal')
    const html = renderToStaticMarkup(h(UnregisteredAgents, { rows }))

    expect(html, 'normal mode shows no raw id').not.toContain('claude-code/nobody-registered')
    expect(html).toContain('2 writes')
    // TO THE MINUTE IN NORMAL MODE, as every time on Home is; the stored stamp, seconds and all, is
    // developer mode's (problem ejarlQfb3Caz).
    expect(html).toContain('22:15')
    expect(html, 'normal mode shows the stamp as stored').not.toContain('2026-09-03 22:15:00')
    setMode('inspect')
    const inspected = renderToStaticMarkup(h(UnregisteredAgents, { rows }))
    expect(inspected).toContain('claude-code/nobody-registered')
    expect(inspected, 'developer mode shows the stamp as stored').toContain('2026-09-03 22:15:00')
  })

  it('offers nothing to press that acts on anybody, because naming is the whole of what happens', () => {
    // F1'S PATTERN, HELD BY A TEST. A button here would be a way to act on something that is
    // to be left alone, and it would arrive looking like a convenience. The fold that shows the rest
    // of the list is allowed and is checked below: it acts on the list and on nobody in it, so it
    // is the one thing here a reader may press.
    const html = renderToStaticMarkup(h(UnregisteredAgents, { rows }))

    expect(html).not.toContain('<button')
    expect(html).not.toContain('<form')
    expect(html).not.toContain('<input')
    expect(html, 'a short list needs no fold, so nothing here is pressable at all').not.toContain('<summary')
  })

  it('says how many it is drawing of how many there are, and offers the rest behind one press', () => {
    const many = Array.from({ length: 25 }, (_, n) => ({
      id: `claude-code/stranger-${String(n)}`,
      writes: 1,
      lastWroteAt: '2026-09-03 22:15:00',
    }))

    setMode('inspect')
    const html = renderToStaticMarkup(h(UnregisteredAgents, { rows: many }))

    expect(html).toContain('20 of 25')
    expect(html).toContain('most recent first')
    expect(html).toContain('Show the other 5')
    // AND EVERY ONE OF THEM IS REALLY THERE, behind the fold rather than left out of the page. Their
    // ids are what tells them apart, so this reads the developer-mode drawing.
    for (const one of many) expect(html).toContain(one.id)
  })

  it('says the count is the whole count when nothing is folded away', () => {
    const html = renderToStaticMarkup(h(UnregisteredAgents, { rows }))

    expect(html).toContain('1 of 1')
    expect(html).not.toContain('Show the other')
  })

  it('draws nothing at all when every agent that has written is registered', () => {
    // NOT AN EMPTY PANEL. A heading with nothing under it on the front page is a line a reader pays
    // for on every visit, and the ordinary case is that there is nobody to name.
    expect(renderToStaticMarkup(h(UnregisteredAgents, { rows: [] }))).toBe('')
  })
})
