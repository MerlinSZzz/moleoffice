// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Whole and projected session rows must tell a page the same thing. The projected rows come from the clock's real
 * SQL, and both sets go through the presence and answering readers with the shared facts the clock hands them.
 * A proxy also records every top-level data key read or tested, including absent keys and reads inside helpers.
 * This catches a new dependency even when the fixture's value does not change the final answer.
 *
 * Each main branch has a complete row and a row with each field missing or JSON null in turn. Fixtures are built
 * independently of the projection's field list, so removing a field cannot remove the case that should catch it.
 * Hold and process facts read their own whole sessions in production; only rows the projection replaces are proxied.
 *
 * Since wave 13y round 143 the clock's rows are only the runs the dots read, not every run of the project. So the
 * projected reading is handed what `thePresenceOf` hands it with those rows: whether one run ran as an agent, asked of
 * every run (`aRunRanAsOneOf`). An agent whose only run has ended is not among the clock's rows, and is not called
 * Inactive for that.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { PanelRecord } from '../src/shared/types.ts'
import type { ResourceReport } from '../src/server/lib/resources.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { freshDb, type TestDb } from './helpers.ts'

const HERE = 'default'
const HUMAN = { type: 'human', id: THE_PERSON } as const
const NOW = new Date('2026-10-22T12:00:00Z')
const STAMP = localStamp(NOW)
const FUTURE = localStamp(new Date(NOW.getTime() + 20 * 60_000))
const PAST = localStamp(new Date(NOW.getTime() - 20 * 60_000))
type Data = Record<string, unknown>
type Agent = { id: string; handle: string; record: string }
type Scenario = { name: string; data?: Data; live?: boolean; hold?: boolean; role?: string; variants?: boolean }

const scenarios: Scenario[] = [
  { name: 'recent output', variants: true },
  { name: 'terminal', data: { extra: { inATerminal: { terminal: 'made-up-terminal' } } }, variants: true },
  { name: 'waiting', data: { state: 'finished', deliveringMessage: 'made-up-message', providerSession: 'made-up-conversation', waitsUntil: FUTURE, startedByMoleOffice: true }, variants: true },
  { name: 'live sandbox', live: true, data: { sandbox: { template: 'made-up-template', folder: '/made-up/instance' } }, variants: true },
  { name: 'message worker', data: { deliveringMessage: 'made-up-message', startedByMoleOffice: true }, variants: true },
  { name: 'held run', hold: true, data: { deliveringMessage: 'made-up-message', startedByMoleOffice: true }, variants: true },
  { name: 'kept conversation', role: 'supervisor', data: { state: 'finished', deliveringMessage: 'made-up-message', providerSession: 'made-up-conversation', waitsUntil: PAST }, variants: true },
  { name: 'secretary conversation', role: 'secretary', data: { state: 'finished', deliveringMessage: 'made-up-message', providerSession: 'made-up-conversation' } },
  { name: 'closed', data: { closedAt: STAMP } },
  { name: 'finished', data: { state: 'finished' } },
  { name: 'crashed', data: { state: 'crashed' } },
  { name: 'paused', data: { state: 'paused' } },
  { name: 'orphaned', data: { state: 'orphaned' } },
  { name: 'no output', data: { lastOutputAt: null } },
  { name: 'old output', data: { lastOutputAt: PAST } },
  { name: 'unreadable output', data: { lastOutputAt: 'unreadable' } },
  { name: 'handle only', live: true, data: { servingAgentId: null } },
  { name: 'registry id only', live: true, data: { servingAgent: null } },
  { name: 'sandbox instance', live: true, data: { sandbox: { instance: 'made-up-instance' } } },
  { name: 'sandbox without a name', live: true, data: { sandbox: {} } },
  { name: 'expired wait', data: { state: 'finished', deliveringMessage: 'made-up-message', providerSession: 'made-up-conversation', waitsUntil: PAST } },
  { name: 'unreadable wait', data: { state: 'finished', deliveringMessage: 'made-up-message', providerSession: 'made-up-conversation', waitsUntil: 'unreadable' } },
  { name: 'held terminal', hold: true },
  { name: 'bound by record', data: { ranAs: 'record' } },
  { name: 'bound by handle', data: { ranAs: 'handle' } },
  { name: 'bound elsewhere', data: { ranAs: [{ workspaceId: 'elsewhere', agentId: 'somebody-else' }] } },
]

let t: TestDb
let presence: typeof import('../src/server/lib/presence.ts')
let worker: typeof import('../src/server/lib/worker.ts')
let participants: typeof import('../src/server/lib/participants.ts')
let identities: typeof import('../src/server/lib/agent-references.ts')
const labels = new Map<string, string>()
const machine: ResourceReport[] = []

function anAgent(label: string, role?: string): Agent {
  const handle = `made-up-field-reader-${labels.size}`
  const record = t.api.createRecord({ workspaceId: HERE, kind: 'agent', title: label, actor: HUMAN,
    data: { handle, runtime: 'claude-code', state: 'active', ...(role === undefined ? {} : { role }) } }).id
  const { id } = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }
  labels.set(id, label)
  return { id, handle, record }
}

/** A deterministic machine input, through the same seam the clock's shared reading uses. No process is started. */
function aLiveProcess(session: string): ResourceReport {
  return {
    id: `made-up-process-${session}`, sessionRecordId: session, type: 'process', key: 'made-up-pid', pgid: null,
    osStartedAt: null, detail: 'A made-up live process', registeredAt: STAMP, registeredBy: 'agent:made-up-worker',
    releasedAt: null, releasedBy: null, releaseNote: null, world: null, startedByTheProduct: false,
    liveness: { state: 'alive', detail: 'The fixture says it is alive.' }, age: { seconds: 0, human: '0 seconds' },
    session: { recordId: session, title: null, state: 'running', ended: false, endedAt: null, endedAtSource: null, note: null },
    orphanedFor: null, gpuMemory: null,
  }
}

beforeAll(async () => {
  t = await freshDb()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  presence = await import('../src/server/lib/presence.ts')
  worker = await import('../src/server/lib/worker.ts')
  participants = await import('../src/server/lib/participants.ts')
  identities = await import('../src/server/lib/agent-references.ts')
  const handles = await import('../src/server/lib/handles.ts')
  anAgent('no session')
  for (const scenario of scenarios) {
    // These keys come from the fixtures, never from PRESENCE_SESSION_FIELDS.
    const complete: Data = {
      ranAs: [], closedAt: null, state: 'running', lastOutputAt: STAMP, servingAgentId: '', servingAgent: '',
      extra: null, workingDirectory: '/made-up/work', startedAt: STAMP, deliveringMessage: null,
      providerSession: null, runtime: 'claude-code', waitsUntil: null, startedByMoleOffice: false, sandbox: null,
      ...scenario.data,
    }
    const variants: { field?: string; missing?: boolean }[] = [{}]
    if (scenario.variants) for (const field of Object.keys(complete)) variants.push({ field, missing: true }, { field })
    for (const variant of variants) {
      const label = `${scenario.name}${variant.field === undefined ? '' : `; ${variant.field} ${variant.missing ? 'missing' : 'null'}`}`
      const agent = anAgent(label, scenario.role)
      const data: Data = {
        ...complete,
        ranAs: [{ workspaceId: HERE, agentId: agent.id }], servingAgentId: agent.id, servingAgent: agent.handle,
        ...scenario.data,
      }
      if (scenario.name === 'bound by record' || scenario.name === 'bound by handle') {
        data['ranAs'] = [{ workspaceId: HERE, agentId: scenario.name === 'bound by record' ? agent.record : agent.handle }]
      }
      if (variant.field !== undefined) {
        if (variant.missing) delete data[variant.field]
        else data[variant.field] = null
      }
      const session = t.api.createRecord({ workspaceId: HERE, kind: 'session', title: label, actor: HUMAN,
        data: { state: 'running', runtime: 'claude-code' } }).id
      // Exact stored fixtures include historical states, JSON null and absent fields that a current write normalizes.
      t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), session)
      if (scenario.live) machine.push(aLiveProcess(session))
      if (scenario.hold) handles.holdTheHandle({ handle: agent.handle, session, workspaceId: HERE, machine: 'made-up-machine', runtime: 'claude-code' })
    }
  }
}, 120_000)

afterAll(() => {
  vi.useRealTimers()
  t?.close()
})

/** The same calls and shared inputs as the clock's presence and answering looks. */
function read(rows: readonly PanelRecord[], ranAsOneOf?: (references: readonly string[]) => boolean) {
  const registry = participants.listParticipants().agents
  const identityOf = identities.everyAgentsIdentityReadOnce(t.client.sqlite)
  const shared = presence.thePresenceReadingsOf(HERE, undefined, identityOf, undefined, false, () => rows)
  const facts = presence.theAgentFactsReadOnce(NOW, true, () => registry, identityOf, () => shared.waiting().map((one) => one.session))
  return registry.map((agent) => ({
    label: labels.get(agent.id) ?? agent.id,
    presence: presence.participantPresence({ kind: 'agent', id: agent.id }, HERE, NOW, null, true,
      () => machine, shared.sessions, shared.waiting, shared.processes, shared.agentRecords, shared.runningRows, undefined,
      { facts, messageRows: shared.messageRows, sessionsOf: shared.sessionsOf, ...(ranAsOneOf === undefined ? {} : { ranAsOneOf }) }),
    answering: worker.theAnsweringReading(agent.id, HERE, shared.sessions(), shared.waiting(), {
      machine: () => machine, readOnly: true, at: NOW.getTime(), runningRows: shared.runningRows,
      messageRows: shared.messageRows, hold: facts.hold(agent.id), cardOf: facts.cardOf, runOrigin: facts.runOrigin, identityOf,
    }),
  }))
}

function wholeAndProjected() {
  const touched = new Set<string>()
  const record = (key: string | symbol): void => { if (typeof key === 'string') touched.add(key) }
  const rows = presence.sessionRecordsIn(HERE).map((row) => ({
    ...row,
    data: new Proxy(row.data, {
      get(target, key, receiver) { record(key); return Reflect.get(target, key, receiver) },
      has(target, key) { record(key); return Reflect.has(target, key) },
    }),
  }))
  const whole = read(rows)
  // This calls thePresenceSessionData through the real database query used by the clock.
  const projected = read(presence.presenceSessionRowsForOneClock()(HERE), (references) => presence.aRunRanAsOneOf(HERE, references))
  return { whole, projected, touched }
}

describe('the presence session projection', () => {
  it('declares every data key the presence and answering readers touch', () => {
    const { touched } = wholeAndProjected()
    expect(touched.size, 'the readers really accessed session data').toBeGreaterThan(0)
    expect([...touched].filter((key) => !new Set<string>(presence.PRESENCE_SESSION_FIELDS).has(key)).sort(),
      'session fields read but absent from PRESENCE_SESSION_FIELDS').toEqual([])
  })

  it('gives identical presence and answering from whole rows and real SQL projections, including null and missing fields', () => {
    const { whole, projected } = wholeAndProjected()
    expect(projected).toEqual(whole)
    // Prove that these fixtures reach the branches whose output depends on the projected fields.
    const complete = new Map(whole.map((one) => [one.label, one]))
    expect(complete.get('recent output')?.presence.says).toContain('output')
    expect(complete.get('terminal')?.presence.word).toBe('In a terminal')
    expect(complete.get('waiting')?.answering.answering.how).toBe('a waiting run')
    expect(complete.get('live sandbox')?.answering.answering.says).toContain('instance')
    expect(complete.get('held run')?.answering.answering.how).toBe('a run')
    expect(complete.get('kept conversation')?.answering.answering.how).toBe('its own conversation')
    expect(complete.get('handle only')?.answering.answering.how).toBe('a run')
    expect(complete.get('registry id only')?.answering.answering.how).toBe('a run')
    expect(complete.get('no session')?.presence.word).toBe('Inactive')
    // AN AGENT WHOSE ONLY RUN HAS ENDED has a run recorded, though the clock's rows leave that run out.
    expect(complete.get('closed')?.presence.word).not.toBe('Inactive')
  })
})
