// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The asker confirms a worker's report. The registrar only registered the worker.
 * These are made-up runs in a throwaway office. Only the office writes workerRuns and releases,
 * so the fixture puts those facts in its own database, as the asker-reading criterion does.
 * The real confirmation door, record read, shared waiting sentence and rendered panel are exercised.
 * Reading (a): the asking run has ended and no other run of the asker's agent is live.
 * Both registry ids and stored handles count. Runs belonging to another agent do not count.
 * The reporting standing's sentence names nobody, so it stays true whoever the door allows.
 * At off, the gate who-confirms-a-report lets anybody registered confirm, and the reading, the waiting sentence and the
 * press say so (wave 13r round M, item 8, point 1). The door still counts a confirmation the gate would have refused.
 * MUTATIONS, after a control run: take the off answer out of whoMayConfirmThisReport, the off sentence out of
 * whatARunWaitsFor or out of the panel's press, or let confirmTheReport read the answer at the gate's position, and the
 * off case goes red.
 */
import { dirname, join } from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { GATES } from '../src/config/gates.mjs'
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
async function refused(run: string, who: string, rule: string, asking?: string) {
  // All record bytes and their revisions must survive an unsuccessful confirmation unchanged.
  const snapshot = () => db.client.sqlite.prepare('SELECT * FROM records ORDER BY id').all()
  const before = snapshot()
  const revisions = db.client.sqlite.prepare('SELECT COUNT(*) AS n FROM revisions').get()
  const reply = await confirm(run, who)
  expect(reply.statusCode, reply.body).toBe(403)
  expect(reply.body).toContain('Nothing was written')
  if (asking) {
    expect((await read(run))['reportConfirmation'].rule).toBe(rule)
    expect(reply.body).toContain(asking)
    expect(reply.body).toContain('asked for this worker')
    expect(reply.body).toContain('asker')
    expect(reply.body).toContain('registrar')
    expect(reply.body).toContain('ended')
    expect(reply.body).not.toContain('Reading (a)')
    expect(reply.body).not.toContain('registrar-after-asker-ended')
  }
  expect(snapshot()).toEqual(before)
  expect(db.client.sqlite.prepare('SELECT COUNT(*) AS n FROM revisions').get()).toEqual(revisions)
  return reply
}
async function waiting(run: string, expected: string | null, rule: string) {
  const answer = await read(run)
  expect(answer['reportConfirmation'], 'the record names the rule and allowed agent').toMatchObject({ rule, agent: expected === null ? null : ref(names[expected]!) })
  const record = answer['record'] as PanelRecord
  const permission = answer['reportConfirmation']
  const nameOf = (who: { id: string }) => Object.keys(names).find(handle => names[handle] === who.id) ?? null
  for (const lang of ['en', 'zh'] as const) {
    setWordLanguage(lang)
    const shared = whatTheRunWaitsFor(record.data, howARunStands(record.data), word, nameOf, permission)
    const html = renderToStaticMarkup(h(panel, { record, reportConfirmation: permission, participants: { agents: Object.entries(names).map(([handle, id]) => ({ id, handle, name: handle })) } as any }))
    const standing = /class="chk-waiting[^"]*">(.*?)<\/p>/s.exec(html)?.[1]?.replace(/&#x27;/g, "'")
    const press = /class="chk-part chk-confirm">.*?<p class="chk-said">(.*?)<\/p>/s.exec(html)?.[1]
    // The reporting sentence names nobody: the agent the run reported to may be refused while the asker's run is live.
    const reporting = /data-standing="reporting">.*?<\/p><p class="chk-said[^"]*">(.*?)<\/p>/s.exec(html)?.[1]?.replace(/&#x27;/g, "'")
    expect(reporting).toBe(word('chk.standing.reporting.sentence'))
    expect(reporting).toContain(lang === 'en' ? 'its report waits to be confirmed' : '它的报告正在等待确认')
    if (lang === 'en') expect(reporting).toBe(RUN_STANDING.reporting.sentence)
    expect(standing).toBe(shared)
    if (expected === null) {
      expect(press).toContain(lang === 'en' ? 'anybody registered' : '任何已注册')
    } else {
      expect(shared).toContain(expected)
      expect(press).toContain(expected)
      if (expected !== 'registrar') expect(press).not.toContain('registrar')
    }
  }
  setWordLanguage('en')
}

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
  setMode('normal')
})
afterAll(async () => { setWordLanguage('en'); setMode?.('normal'); await app?.close(); db?.close() })
afterEach(() => {
  for (const row of db.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'session'").all() as { id: string }[]) {
    if (data(row.id)['servingAgent'] === 'asker') put(row.id, { state: 'paused' })
  }
})

describe("the supervisor who asked for a worker confirms its report", () => {
  it('the live asker confirms from any run of its agent; the registrar and a stranger cannot', async () => {
    const f = await fixture()
    await waiting(f.worker, 'asker', 'asker')
    await refused(f.worker, 'registrar', 'asker', f.asking)
    await refused(f.worker, 'stranger', 'asker', f.asking)
    const other = await open('asker')
    const reply = await confirm(f.worker, 'asker', other)
    expect(reply.statusCode, reply.body).toBe(201)
    expect(data(f.worker)['confirmed'].by).toEqual(ref(names['asker']!))
    expect(data(f.worker)['released'].reportedTo).toEqual(ref(names['registrar']!))
  })
  it('the registrar takes over only after the asking run ends and no other run of the asker is live', async () => {
    const f = await fixture()
    put(f.asking, { state: 'finished' })
    const other = await open('asker')
    // First the stored handle alone holds the door; then the registry id does, even with another handle.
    await waiting(f.worker, 'asker', 'asker')
    await refused(f.worker, 'registrar', 'asker', f.asking)
    put(other, { servingAgentId: names['asker'], servingAgent: 'stranger' })
    await waiting(f.worker, 'asker', 'asker')
    await refused(f.worker, 'registrar', 'asker', f.asking)
    // End every other run, including the one in the first case. The rule counts all runs of this agent.
    for (const row of db.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'session'").all() as { id: string }[]) {
      if (data(row.id)['servingAgent'] === 'asker') put(row.id, { state: 'paused' })
    }
    put(other, { state: 'paused' })
    const different = await open('stranger')
    put(different, { servingAgentId: names['stranger'], servingAgent: 'asker' })
    expect(data(other)['state']).toBe('paused')
    await waiting(f.worker, 'registrar', 'registrar-after-asker-ended')
    await refused(f.worker, 'stranger', 'registrar-after-asker-ended', f.asking)
    const reply = await confirm(f.worker, 'registrar')
    expect(reply.statusCode, reply.body).toBe(201)
    expect(data(f.worker)['confirmed'].by).toEqual(ref(names['registrar']!))
  })
  for (const ended of [false, true]) {
    it(`the person confirms when the asking run is ${ended ? 'ended' : 'live'}`, async () => {
      const f = await fixture()
      if (ended) put(f.asking, { state: 'crashed' })
      await waiting(f.worker, ended ? 'registrar' : 'asker', ended ? 'registrar-after-asker-ended' : 'asker')
      expect((await confirm(f.worker, 'person')).statusCode).toBe(201)
    })
  }
  it('the asker still may confirm after the registrar becomes available', async () => {
    const f = await fixture()
    put(f.asking, { state: 'orphaned' })
    await waiting(f.worker, 'registrar', 'registrar-after-asker-ended')
    expect((await confirm(f.worker, 'asker')).statusCode).toBe(201)
  })
  it('the same agent may register the worker and ask for its run', async () => {
    const f = await fixture({ same: true })
    await waiting(f.worker, 'registrar', 'asker')
    expect((await read(f.worker))['reportConfirmation'].registrarMayConfirmWhen).toBeNull()
    expect((await confirm(f.worker, 'registrar')).statusCode).toBe(201)
  })
  it('an asker still owns the report where the release told nobody', async () => {
    const f = await fixture({ nobodyTold: true })
    await waiting(f.worker, 'asker', 'asker')
    await refused(f.worker, 'stranger', 'asker', f.asking)
    expect((await confirm(f.worker, 'asker')).statusCode).toBe(201)
  })
  it('with no asker the reported-to agent still confirms and a stranger cannot', async () => {
    const f = await fixture({ noAsker: true })
    await waiting(f.worker, 'registrar', 'reported-to')
    const reply = await refused(f.worker, 'stranger', 'reported to')
    expect(reply.json().error).toBe(`Run ${f.worker} reported to agent registrar, and confirming that report is theirs to do. stranger is neither the supervisor it reported to nor the person. Nothing was written.`)
    expect((await confirm(f.worker, 'registrar')).statusCode).toBe(201)
  })
  it('with no asker and nobody told any registered participant still confirms', async () => {
    const f = await fixture({ noAsker: true, nobodyTold: true })
    await waiting(f.worker, null, 'any-registered')
    expect((await confirm(f.worker, 'stranger')).statusCode).toBe(201)
  })
  it('with no asker and no inspector the panel keeps the sentence saying that no check happened', async () => {
    const f = await fixture({ noAsker: true, nobodyTold: true })
    put(f.worker, { released: undefined, theCheck: { reviewLevel: 'none', askedAt: '2026-10-15 09:00:00' } })
    const answer = await read(f.worker)
    for (const lang of ['en', 'zh'] as const) {
      setWordLanguage(lang)
      const html = renderToStaticMarkup(h(panel, { record: answer['record'], reportConfirmation: answer['reportConfirmation'] })).replace(/&#x27;/g, "'")
      expect(html).toContain(word('chk.noInspectorConfirm'))
    }
    setWordLanguage('en')
  })
  it('at off, the reading, the waiting sentence and the press say anybody registered may confirm, and the door counts the stranger it lets confirm', async () => {
    const gate = GATES.find(row => row.id === 'who-confirms-a-report')!
    const asThePerson = { ...person, ...thePersonsKeyHeader(join(dirname(db.file), 'keys.json')), 'content-type': 'application/json' }
    const setTheGate = async (value: 'off' | null) => {
      const saved = await app.inject({ method: 'POST', url: '/api/office/settings', headers: asThePerson, payload: { changes: [{ name: gate.setting, value }], because: 'A made-up reason for the confirmation gate.' } })
      expect(saved.statusCode, saved.body).toBe(200)
    }
    const counted = () => db.client.sqlite.prepare('SELECT COALESCE(SUM(would_stop), 0) AS would_stop, COALESCE(SUM(stopped), 0) AS stopped FROM gate_counts WHERE gate = ?').get(gate.id) as { would_stop: number; stopped: number }
    const f = await fixture()
    await setTheGate('off')
    try {
      const answer = await read(f.worker)
      expect(answer['reportConfirmation']).toMatchObject({ rule: 'any-registered-at-off', agent: null, allowed: null })
      const record = answer['record'] as PanelRecord
      const nameOf = (who: { id: string }) => Object.keys(names).find(handle => names[handle] === who.id) ?? null
      for (const lang of ['en', 'zh'] as const) {
        setWordLanguage(lang)
        const shared = whatTheRunWaitsFor(record.data, howARunStands(record.data), word, nameOf, answer['reportConfirmation'])
        expect(shared).toBe(word('chk.says.waits.anybodyAtOff'))
        const html = renderToStaticMarkup(h(panel, { record, reportConfirmation: answer['reportConfirmation'], participants: { agents: Object.entries(names).map(([handle, id]) => ({ id, handle, name: handle })) } as any }))
        expect(/class="chk-waiting[^"]*">(.*?)<\/p>/s.exec(html)?.[1]?.replace(/&#x27;/g, "'")).toBe(shared)
        expect(/class="chk-part chk-confirm">.*?<p class="chk-said">(.*?)<\/p>/s.exec(html)?.[1]).toBe(word('chk.anybodyConfirmsAtOff'))
      }
      setWordLanguage('en')
      const before = counted()
      const reply = await confirm(f.worker, 'stranger')
      expect(reply.statusCode, reply.body).toBe(201)
      expect(data(f.worker)['confirmed'].by).toEqual(ref(names['stranger']!))
      const after = counted()
      expect({ would_stop: after.would_stop - before.would_stop, stopped: after.stopped - before.stopped }).toEqual({ would_stop: 1, stopped: 0 })
    } finally {
      setWordLanguage('en')
      await setTheGate(null)
    }
    // BACK AT BLOCK, the reading names the asker again and the stranger is refused.
    const g = await fixture()
    await waiting(g.worker, 'asker', 'asker')
    await refused(g.worker, 'stranger', 'asker', g.asking)
  })
})
