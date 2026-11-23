// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The real confirmation answer supplies every waiting line. All runs here are invented in a throwaway office.
 *
 * As decided in November 2026 (explanations off the pages), the press that closes a run has no sentence above it, and a
 * closed run's panel draws its standing word without the fixed sentence. The waiting line names who may confirm.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { howARunStands, RUN_STANDING, whatTheRunWaitsFor } from '../src/shared/releasing.ts'
import type { PanelRecord } from '../src/shared/types.ts'

let db: TestDb
let app: FastifyInstance
let panel: typeof import('../src/web/components/TheCheckOnARun.tsx').TheCheckOnARun
let setMode: typeof import('../src/web/lib/mode.ts').setMode
let setWordLanguage: typeof import('../src/shared/i18n.ts').setWordLanguage
let word: typeof import('../src/shared/i18n.ts').t
const person = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const agent = (id: string, run?: string) => ({ 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id, ...(run ? { 'x-mole-office-session': run } : {}) })
const ref = (id: string) => ({ kind: 'agent' as const, id })
const names: Record<string, string> = {}
let sequence = 0

function data(run: string): Record<string, any> {
  return JSON.parse((db.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run) as { data: string }).data)
}
function put(run: string, more: Record<string, unknown>): void {
  db.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify({ ...data(run), ...more }), run)
}
async function open(handle: string): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers: agent(handle), payload: { kind: 'session', title: `Made-up confirmation run ${++sequence}`, data: { state: 'running', servingAgent: handle } } })
  expect(reply.statusCode, reply.body).toBe(201)
  const id = reply.json().record.id as string
  db.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(id)
  return id
}
async function fixture(options: { same?: boolean; noAsker?: boolean; nobodyTold?: boolean } = {}) {
  const asker = options.same ? 'registrar' : 'asker'
  const asking = await open(asker)
  const worker = await open('worker')
  const release = { by: ref(names['inspector']!), how: 'an inspector', at: '2026-10-15 09:00:00', ...(options.nobodyTold ? {} : { reportedTo: ref(names['registrar']!) }) }
  put(worker, { state: 'finished', released: release, ...(options.noAsker ? {} : { parentAttachment: asking }) })
  if (!options.noAsker) put(asking, { workerRuns: { worker: { state: 'started', askedAt: '2026-10-15 08:00:00', askedBy: { who: ref(names[asker]!), session: asking }, handle: 'worker', brief: { path: '/made/up/brief.md', sha256: 'a'.repeat(64), bytes: 120 }, sandbox: { folder: '/made/up', instance: 'made-up', container: 'made-up' }, started: { at: '2026-10-15 08:01:00', run: worker, runKeyId: 'made-up-key' } } } })
  return { asking, worker, asker }
}
async function read(run: string): Promise<Record<string, any>> {
  const reply = await app.inject({ method: 'GET', url: `/api/records/${run}`, headers: person })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json()
}
async function confirm(run: string, who: string, from?: string) {
  return app.inject({ method: 'POST', url: `/api/checks/${run}/confirm`, headers: who === 'person' ? person : agent(who, from), payload: { because: 'The made-up report answers the brief.' } })
}

let stepsPanel: typeof import('../src/web/components/FlowRunSteps.tsx').FlowRunSteps
beforeAll(async () => {
  db = await freshDb()
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  copyTheDefaultRegulationsOnce()
  app = (await apiApp()).app
  await app.ready()
  for (const [handle, role] of [['registrar', 'secretary'], ['asker', 'supervisor'], ['stranger', 'worker'], ['inspector', 'inspector'], ['worker', 'worker']] as const) {
    const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: handle === 'worker' ? agent('registrar') : person, payload: { handle, name: handle, role, ...(handle === 'worker' ? { chapters: ['5:full'], workArea: ['src/server/lib'] } : {}) } })
    expect(reply.statusCode, reply.body).toBe(201)
    names[handle] = (db.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
  }
  const store = new Map<string, string>()
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
  ;(globalThis as any).window = { localStorage: storage, sessionStorage: storage, location: { hash: '' }, addEventListener: () => {}, removeEventListener: () => {} }
  panel = (await import('../src/web/components/TheCheckOnARun.tsx')).TheCheckOnARun
  ;({ setWordLanguage, t: word } = await import('../src/shared/i18n.ts'))
  setMode = (await import('../src/web/lib/mode.ts')).setMode
  stepsPanel = (await import('../src/web/components/FlowRunSteps.tsx')).FlowRunSteps
  setWordLanguage('en')
  setMode('normal')
})
afterAll(async () => { setWordLanguage('en'); setMode?.('normal'); await app?.close(); db?.close() })
afterEach(() => {
  for (const row of db.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'session'").all() as { id: string }[]) {
    if (data(row.id)['servingAgent'] === 'asker') put(row.id, { state: 'paused' })
  }
})


function plain(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim()
}
async function sentences(run: string, expected: string[], rule: string) {
  const answer = await read(run)
  const record = answer['record'] as PanelRecord
  const permission = answer['reportConfirmation']
  expect(permission.rule).toBe(rule)
  expect(permission.allowed).toEqual(expected.length ? expected.map(handle => ref(names[handle]!)) : null)
  const nameOf = (who: { id: string }) => Object.keys(names).find(handle => names[handle] === who.id) ?? null
  const stands = howARunStands(record.data, nameOf, permission)
  const shared = whatTheRunWaitsFor(record.data, stands, word, nameOf, permission)
  const html = renderToStaticMarkup(h(panel, { record, reportConfirmation: permission, participants: { agents: Object.entries(names).map(([handle, id]) => ({ id, handle, name: handle })) } as any }))
  const waiting = plain(/class="chk-waiting[^"]*">(.*?)<\/p>/s.exec(html)?.[1] ?? '')
  const press = /class="chk-part chk-confirm">(.*?)<\/section>/s.exec(html)?.[1]
  expect(press, 'the press is drawn').toBeDefined()
  expect(press, 'no sentence above the press').not.toContain('chk-said')
  const server = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: person })
  expect(server.statusCode, server.body).toBe(200)
  const serverWait = server.json().stands.waitingFor
  for (const [surface, sentence] of Object.entries({ shared, waiting, howARunStands: stands.waitingFor, server: serverWait })) {
    expect(sentence, surface).toBeTruthy()
    for (const handle of expected) expect(sentence, surface).toContain(handle)
    for (const handle of ['asker', 'registrar'].filter(handle => !expected.includes(handle))) expect(sentence, surface).not.toContain(handle)
    if (expected.length === 2) expect(sentence, surface).toContain(' or ')
    if (expected.length === 0) {
      expect(sentence, surface).toContain('anybody registered')
      expect(sentence, surface).not.toMatch(/supervisor|decision rather than a confirmation/)
    }
  }
  expect(waiting).toBe(shared)
  expect(stands.waitingFor).toBe(shared)
  expect(serverWait).toBe(shared)
}

describe('the confirm sentences are true on every path', () => {
  it('names the asker even when the release told the registrar', async () => {
    const f = await fixture()
    await sentences(f.worker, ['asker'], 'asker')
    expect(data(f.worker)['released'].reportedTo).toEqual(ref(names['registrar']!))
  })
  it('names both the asker and the registrar once the asking run has ended', async () => {
    const f = await fixture()
    put(f.asking, { state: 'paused' })
    await sentences(f.worker, ['asker', 'registrar'], 'registrar-after-asker-ended')
  })
  it('names the reported-to agent when no run asked', async () => {
    const f = await fixture({ noAsker: true })
    await sentences(f.worker, ['registrar'], 'reported-to')
  })
  it('says anybody registered when nobody was told and no run asked', async () => {
    const f = await fixture({ noAsker: true, nobodyTold: true })
    await sentences(f.worker, [], 'any-registered')
  })
  it('names no supervisor in the reporting heading or the no-verdict state, and keeps the stored standing word', () => {
    expect(RUN_STANDING.reporting.word).toBe('Waiting for its report to be confirmed')
    expect(word('chk.standing.reporting.word')).toBe(RUN_STANDING.reporting.word)
    expect(word('chk.noVerdictYetWord')).not.toContain('supervisor')
    expect(word('chk.says.standingNamed.reporting')).toBe('reporting')
  })
  for (const [who, path] of [['person', 'asker'], ['person', 'registrar-after-asker-ended'], ['person', 'reported-to'], ['person', 'any-registered'], ['registrar', 'registrar-after-asker-ended']] as const) {
    it(`says the report was confirmed when ${who} confirmed on ${path}, including the step the office writes`, async () => {
      const f = await fixture({ noAsker: path === 'reported-to' || path === 'any-registered', nobodyTold: path === 'any-registered' })
      if (path === 'registrar-after-asker-ended') put(f.asking, { state: 'paused' })
      const reply = await confirm(f.worker, who)
      expect(reply.statusCode, reply.body).toBe(201)
      const answer = await read(f.worker)
      const confirmed = answer['record'].data.confirmed
      expect(confirmed.by).toEqual(who === 'person' ? { kind: 'person', id: THE_PERSON } : ref(names['registrar']!))
      expect(RUN_STANDING.closed.sentence).toBe('The report was confirmed, so this run is over and what it was holding can be let go.')
      const html = plain(renderToStaticMarkup(h(panel, { record: answer['record'] })))
      expect(html).toContain(RUN_STANDING.closed.word)
      expect(html).not.toContain(RUN_STANDING.closed.sentence)
      expect(html).not.toContain('The supervisor confirmed')
      const row = db.client.sqlite.prepare("SELECT data FROM records WHERE kind = 'flow_run' AND json_extract(data, '$.run') = ?").get(f.worker) as { data: string }
      const steps = JSON.parse(row.data).stepsTaken as { does: string; actor?: unknown }[]
      const step = steps.find(step => step.does === 'The report was confirmed and the run was closed.')
      expect(step, 'the newly stored confirmation step names no supervisor').toBeDefined()
      expect(step?.actor).toEqual(confirmed.by)
    })
  }
})

