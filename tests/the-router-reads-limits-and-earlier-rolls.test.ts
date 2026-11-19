// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The router reads only fixture sessions in a disposable database; no provider or launcher runs. */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { theCastingRoll, ONLY_THE_OFFICE_WRITES_THE_CASTING_ROLL } from '../src/shared/casting-roll.ts'
import type { OwnEventReading } from '../src/shared/logins-week.ts'

let t: TestDb
let reader: typeof import('../src/server/lib/casting-roll.ts')
const now = Date.parse('2026-10-13T12:00:00Z')
const actor = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const roll = () => theCastingRoll({ role: 'worker', project: 'default', rows: [{ id: 20, program: 'codex', model: 'gpt-6.1-sol', effort: 'high', probability: 1, marked: true, labels: ['hard'], outUntil: null }], difficulty: 'hard', named: null, earlier: null, builderModel: null, limits: { limited: [], unreadableStops: [], week: 'The week was not read.' }, random: () => 0.25 }).record

function session(id: string, data: Record<string, unknown>, createdAt = '2026-10-13 10:00:00', workspace = 'default'): void {
  t.client.sqlite.prepare('INSERT INTO records (owner_id, id, workspace_id, kind, title, summary, data, created_at, updated_at, origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(THE_TEST_OFFICES_OWNER.id, id, workspace, 'session', `Synthetic router ${id}`, 'Fixture only.', JSON.stringify(data), createdAt, createdAt, 'fixture')
}
function stopped(id: string, runtime: string, model: string, at: string, resetsAt: string | null, changes: Record<string, unknown> = {}, workspace = 'default'): void {
  session(id, { state: 'crashed', closedHow: 'provider-event', runtime, model, stopCause: { kind: 'quota', said: 'Synthetic limit.', at, resetsAt }, ...changes }, undefined, workspace)
}

beforeAll(async () => {
  t = await freshDb()
  reader = await import('../src/server/lib/casting-roll.ts')
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: 'router-other', title: 'Synthetic other router project' })
  t.client.sqlite.prepare("INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, licence_source) VALUES ('router-avatar', 'avatar', 'default', NULL, 'image/svg+xml', NULL, '2026-10-13 10:00:00', 'generated')").run()
  t.client.sqlite.prepare("INSERT INTO agents (id, name, handle, avatar_asset_id, retired, created_at) VALUES ('router-agent', 'Synthetic router agent', 'router-agent', 'router-avatar', 0, '2026-10-13 10:00:00')").run()

}, 90_000)
afterAll(() => t?.close())

it('reads the newest qualifying stop per model across projects for at most seven days', () => {
  stopped('sol-old', 'codex', 'gpt-6.1-sol', '2026-10-12T09:00:00Z', 'Oct 14th, 2026 11:41 PM')
  stopped('sol-new-expired', 'codex', 'gpt-6.1-sol', '2026-10-13T09:00:00Z', 'Oct 13th, 2026 10:00 AM')
  stopped('luna-now', 'codex', 'openai/gpt-6-luna', '2026-10-13T09:00:00Z', 'Oct 13th, 2026 11:41 PM', {}, 'router-other')
  stopped('luna-login', 'codex', 'openai/gpt-6-luna', '2026-10-13T10:00:00Z', null, { stopCause: { kind: 'login', said: 'Login.', at: '2026-10-13T10:00:00Z', resetsAt: null } })
  stopped('claude-now', 'claude-code', 'claude-opus-5-5', '2026-10-13T09:00:00Z', '7:10pm (Europe/London)', { stopCause: { kind: 'session-limit', said: 'Session limit.', at: '2026-10-13T09:00:00Z', resetsAt: '7:10pm (Europe/London)' } })
  stopped('too-old', 'dsh', 'deepseek-old', '2026-10-05T09:00:00Z', 'Oct 15th, 2026 11:41 PM')
  stopped('unreadable', 'dsh', 'deepseek-v4.1-flash', '2026-10-13T09:00:00Z', 'tomorrow')
  stopped('not-crashed', 'codex', 'not-crashed', '2026-10-13T09:00:00Z', 'Oct 15th, 2026 11:41 PM', { state: 'finished' })
  stopped('not-provider', 'codex', 'not-provider', '2026-10-13T09:00:00Z', 'Oct 15th, 2026 11:41 PM', { closedHow: 'operator' })
  stopped('future-stop', 'codex', 'future', '2026-10-14T09:00:00Z', 'Oct 15th, 2026 11:41 PM')
  const answer = reader.theModelsLimitedAt(now, { officeZone: 'UTC' })
  expect(answer.limited.map(one => one.run).sort()).toEqual(['claude-now', 'luna-now'])
  expect(answer.limited.find(one => one.run === 'claude-now')).toMatchObject({ runtime: 'claude-code', model: null, kind: 'session-limit', until: Date.parse('2026-10-13T18:10:00Z') })
  expect(answer.limited.find(one => one.run === 'luna-now')).toMatchObject({ runtime: 'codex', model: 'gpt-6-luna' })
  expect(answer.limited.find(one => one.run === 'luna-now')?.says).toContain('office zone UTC')
  expect(answer.unreadableStops.map(one => one.run)).toEqual(['unreadable'])
  expect(answer.unreadableStops[0]?.says).toContain('reset could not be read')
  expect(answer.week).toContain('not read')
})

it('limits Claude on a current reading of the sandboxes login at 100% of its seven days, and never on a stale one', () => {
  // MADE-UP FIGURES, for a reading round whose output was last written an hour before now.
  const week: OwnEventReading = {
    readFrom: 'own-event', login: 'sandboxes-claude', name: 'loginsWeek.login.sandboxesClaude', state: 'current',
    readAt: '2026-10-13 11:00:00', zone: 'UTC', round: { sandbox: 'sandbox-x', folder: 'round-x' },
    status: 'allowed_warning', windowType: 'seven_day', resetsAt: '2026-10-16 21:00:00',
    sevenDays: { used: 1, resetsAt: '2026-10-16 21:00:00', from: 'unifiedWindows' }, fiveHours: null,
    newerRoundWithNoEvent: null, says: 'Synthetic reading at its seven days.',
  }
  const atMark = reader.theModelsLimitedAt(now, { officeZone: 'UTC', week })
  expect(atMark.limited.find(one => one.kind === 'week')).toMatchObject({ runtime: 'claude-code', model: null, until: Date.parse('2026-10-16T21:00:00Z') })
  expect(atMark.limited.find(one => one.kind === 'week')?.says).toContain('sandbox-x/round-x')
  expect(reader.theModelsLimitedAt(now, { week: { ...week, sevenDays: { ...week.sevenDays!, used: 0.99 } } }).limited.some(one => one.kind === 'week')).toBe(false)
  const stale = reader.theModelsLimitedAt(now, { week: { ...week, state: 'stale' } })
  expect(stale.limited.some(one => one.kind === 'week')).toBe(false)
  expect(stale.week).toContain('Not read since 2026-10-13 11:00')
})

it('finds the newest actual roll serving the agent in its project', async () => {
  const secretary = t.client.sqlite.prepare('SELECT id, handle FROM agents LIMIT 1').get() as { id: string; handle: string }
  expect(secretary.id).toBeTruthy()
  const first = roll()
  session('actual-old', { servingAgentId: secretary.id, castingRoll: first }, '2026-10-10 10:00:00')
  session('actual-new', { servingAgent: secretary.handle, castingRoll: first }, '2026-10-11 10:00:00')
  session('named-newer', { servingAgentId: secretary.id, castingRoll: { ...first, choice: 'named', selected: { ...first.selected!, rowId: null, probability: null, share: null, number: null }, candidates: [] } }, '2026-10-12 10:00:00')
  session('marked-newer', { servingAgentId: secretary.id, castingRoll: { ...first, choice: 'marked', selected: { ...first.selected!, probability: null, share: null, number: null }, candidates: [] } }, '2026-10-12 11:00:00')
  session('kept-newer', { servingAgentId: secretary.id, castingRoll: { ...first, choice: 'kept', keptFrom: 'actual-new' } }, '2026-10-12 12:00:00')
  session('another-project', { servingAgentId: secretary.id, castingRoll: first }, '2026-10-13 12:00:00', 'router-other')
  session('no-choice-newest', { servingAgentId: secretary.id }, '2026-10-13 10:00:00')
  session('another-agent', { servingAgentId: 'nobody-here', castingRoll: first }, '2026-10-13 11:00:00')
  expect(reader.theEarlierCastingRoll('default', secretary.id)).toEqual({ run: 'actual-new', record: first })
  expect(reader.theEarlierCastingRoll('absent-project', secretary.id)).toBeNull()
  expect(reader.theEarlierCastingRoll('default', 'nobody-here')).toBeNull()
})

it('ordinary writes cannot set, change or drop the offices Casting roll', () => {
  const record = roll()
  const run = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Synthetic guarded roll', data: { state: 'running' }, actor, origin: 'fixture' })
  const held = { ...(run.data as Record<string, unknown>), castingRoll: record }
  t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(held), run.id)
  expect(() => t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Synthetic forgery', data: held, actor, origin: 'fixture' })).toThrow(ONLY_THE_OFFICE_WRITES_THE_CASTING_ROLL)
  for (const patch of [{ dataPatch: { castingRoll: record } }, { dataPatch: { castingRoll: null } }, { data: { ...held, castingRoll: {} } }, { data: { state: 'running' } }]) {
    expect(() => t.api.patchRecord(run.id, patch, actor)).toThrow(ONLY_THE_OFFICE_WRITES_THE_CASTING_ROLL)
  }
  t.api.patchRecord(run.id, { dataPatch: { detail: 'Synthetic ordinary edit.' } }, actor)
  expect((t.api.getRecord(run.id)!.data as Record<string, unknown>)['castingRoll']).toEqual(record)
})

it('reads worker-run asks only from sessions that can hold them', async () => {
  const agent = 'roll-reader-agent'
  const record = roll()
  session('roll-reader-ask', { workerRuns: { [agent]: { castingRoll: record } } }, '2026-10-15 10:00:00')
  session('roll-reader-no-ask', { state: 'finished' }, '2026-10-16 10:00:00')
  const sqlite = t.client.sqlite as unknown as { prepare: (text: string) => unknown }
  const original = sqlite.prepare
  const statements: string[] = []
  sqlite.prepare = function (this: unknown, text: string) {
    statements.push(text)
    return original.call(this, text)
  }
  try {
    expect(reader.theEarlierCastingRoll('default', agent)).toEqual({ run: 'roll-reader-ask', record })
  } finally {
    sqlite.prepare = original
  }
  const { STORED_FIELDS, theWordsOfAStoredField } = await import('../src/server/db/schema.ts')
  const asks = statements.filter((text) => text.includes("json_each(records.data, '$.workerRuns')"))
  expect(asks).toHaveLength(1)
  expect(asks[0]).toContain(theWordsOfAStoredField(STORED_FIELDS.sessionHoldsWorkerRuns, 'records.data'))
})
