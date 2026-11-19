// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE RETIRE READS THE AGENT REGISTRY ONCE, HOWEVER MANY RUNS AND AGENTS THE OFFICE HOLDS.
 * Problem QJV5hVBKPsUN.
 *
 * MEASURED FIRST, 26 September 2026, on a copy of the owner's office (4,094 session records, 606 agent
 * rows): POST /api/participants/agent/:id/retire took about 10 seconds, on the office's one thread.
 * The CPU profile put 9.3 of those seconds in `whatRetiringWhileACheckIsOwed`. It walks every run in
 * every project to find the runs of the agent being retired, and for each run that named an agent it
 * read the whole registry again with `listParticipants`: 1,379 reads, 835,674 agent rows. The door
 * now reads the registry once and places every run against that one list.
 *
 * WHAT IS COUNTED. The calls to `listParticipants` made from inside `whatRetiringWhileACheckIsOwed`
 * during one retire. It is wrapped where it is imported, so every call is counted. The count is taken
 * twice, each time for an agent with one run of its own: once on a small office, and again after more
 * agents and many more runs are added. It must be the same both times. It is two: one read to place
 * every run, and one made by `whereARunStands` for the agent's own run. Wall time is not measured.
 *
 * WHAT IS KEPT, checked on the same office with all those runs in it:
 *   - a run of the agent that is still owed a check is found under each name a run may give its
 *     agent: the handle, the registry id, the agent record id in `ranAs`, and the handle in `ranAs`
 *     (the one the finish seal also reads); the refusal names every one and writes nothing;
 *   - a retire that is not refused keeps the row, writes the reason on it, and the agent's record
 *     follows with `state: retired` and the same reason.
 *
 * CONTROL: green. MUTATION: in `whatRetiringWhileACheckIsOwed` (src/server/lib/inspection.ts), place
 * each run with `theAgentOfARunForItsSeal(run)` again, which reads the registry once per run: the
 * count case is red. A second mutation, for the kept behaviour: in `theAgentOfARunForItsSealAmong`,
 * return null in place of `theAgentAStoredStringNames(id, agents)`: the refusal case is red, because
 * the run that names its agent by the handle in `ranAs` is no longer found. A third, in the retire
 * door (src/server/api/participants.ts): patch the agent's record only when there is none
 * (`record === null`): the last case is red, because the record no longer follows. RESTORE: green.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const calls = vi.hoisted(() => ({ listParticipants: 0 }))

vi.mock('../src/server/lib/participants.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/server/lib/participants.ts')>()
  return {
    ...actual,
    listParticipants: (...args: Parameters<typeof actual.listParticipants>) => {
      // ONLY THE READS MADE WHILE PLACING RUNS FOR A RETIRE. Other doors read the registry too, and
      // the stack says which one is asking.
      if (/whatRetiringWhileACheckIsOwed/.test(new Error().stack ?? '')) calls.listParticipants += 1
      return actual.listParticipants(...args)
    },
  }
})

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string): Record<string, string> => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })
const BECAUSE = 'its piece of work is done'

async function register(handle: string): Promise<{ id: string; recordId: string }> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: handle === THE_TEST_OFFICES_SECRETARY.handle ? AS_THE_PERSON : asAgent(THE_TEST_OFFICES_SECRETARY.handle),
    payload: { handle, name: handle, role: handle === THE_TEST_OFFICES_SECRETARY.handle ? 'secretary' : 'worker' },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(handle) as { id: string }
  const mapped = t.client.sqlite.prepare('SELECT record_id AS recordId FROM agent_records WHERE agent_id = ?').get(row.id) as { recordId: string }
  return { id: row.id, recordId: mapped.recordId }
}

/** A run of one agent, filed the way tests/a-retire-is-refused-while-a-check-or-a-report-is-still-owed.test.ts files one. */
function aRun(handle: string, data: Record<string, unknown>): string {
  return historicalSession(t, {
    workspaceId: 'default',
    kind: 'session',
    title: `${handle}'s run`,
    actor: { type: 'agent', id: handle },
    data: { cutFrom: 'main', doing: 'building it', ...data },
  }).id
}

/** A check the office asked for, which makes a finished run stand `inspecting`: still owed. */
const OWED = (message: string): Record<string, unknown> => ({
  state: 'finished',
  theCheck: { askedAt: '2026-09-26 10:00:00', askedOf: 'an anonymous-inspector', message, checkout: {}, says: 'The office asked an inspector to check this run.' },
})

/** Agents that are not retired here, each with runs that owe nothing. They are the crowd the door walks. */
async function aCrowd(prefix: string, agents: number, runsEach: number): Promise<void> {
  for (let a = 0; a < agents; a++) {
    const handle = `${prefix}-${String(a)}`
    await register(handle)
    for (let r = 0; r < runsEach; r++) aRun(handle, { state: 'running', servingAgent: handle })
  }
}

async function retire(handle: string): Promise<{ code: number; said: Record<string, unknown>; counted: number }> {
  calls.listParticipants = 0
  const reply = await app.inject({
    method: 'POST',
    url: `/api/participants/agent/${handle}/retire`,
    headers: { ...AS_THE_PERSON, 'x-mole-office-workspace': 'default' },
    payload: { because: BECAUSE },
  })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown>, counted: calls.listParticipants }
}

function runsIn(): number {
  return (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'session' AND deleted_at IS NULL").get() as { n: number }).n
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await register(THE_TEST_OFFICES_SECRETARY.handle)
  await aCrowd('crowd-first', 3, 4)
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('POST /api/participants/agent/:id/retire on an office with many runs', () => {
  it('reads the agent registry no more often when runs and agents are added', async () => {
    await register('retire-small')
    aRun('retire-small', { state: 'running', servingAgent: 'retire-small' })
    const small = await retire('retire-small')
    expect(small.code, JSON.stringify(small.said)).toBe(200)

    await aCrowd('crowd-more', 6, 10)
    await register('retire-large')
    aRun('retire-large', { state: 'running', servingAgent: 'retire-large' })
    const runs = runsIn()
    expect(runs, 'the second retire walks many more runs').toBeGreaterThan(60)
    const large = await retire('retire-large')
    expect(large.code, JSON.stringify(large.said)).toBe(200)

    expect(large.counted, `the registry was read ${String(small.counted)} times, then ${String(large.counted)} for ${String(runs)} runs`).toBe(
      small.counted,
    )
    expect(large.counted, 'the reads do not follow the number of runs').toBeLessThan(5)
  })

  it('still finds an owed run under each name a run may give its agent, refuses, and writes nothing', async () => {
    const owes = await register('owes-four')
    const byHandle = aRun('owes-four', { ...OWED('check-by-handle'), servingAgent: 'owes-four' })
    const byId = aRun('owes-four', { ...OWED('check-by-registry-id'), servingAgent: owes.id })
    const byRecord = aRun('owes-four', { ...OWED('check-by-record-id'), ranAs: [{ workspaceId: 'default', agentId: owes.recordId }] })
    // THE HANDLE IN `ranAs` IS A STORED SHAPE THE FINISH SEAL READS (problem 2plCt-8-b-pW), and the kinds
    // gate no longer writes it, so it is put into the stored row the way an older run holds it.
    const byRanAsHandle = aRun('owes-four', { ...OWED('check-by-ranas-handle'), ranAs: [{ workspaceId: 'default', agentId: owes.recordId }] })
    const stored = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(byRanAsHandle) as { data: string }
    const data = JSON.parse(stored.data) as Record<string, unknown>
    data['ranAs'] = [{ workspaceId: 'default', agentId: 'owes-four' }]
    t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), byRanAsHandle)

    const { code, said } = await retire('owes-four')
    expect(code, JSON.stringify(said)).toBe(409)
    const why = String(said['error'])
    for (const [run, check] of [
      [byHandle, 'check-by-handle'],
      [byId, 'check-by-registry-id'],
      [byRecord, 'check-by-record-id'],
      [byRanAsHandle, 'check-by-ranas-handle'],
    ] as const) {
      expect(why, `the refusal names run ${run}`).toContain(`run ${run} (check ${check})`)
    }
    expect(why).not.toContain('crowd-')
    const row = t.client.sqlite.prepare('SELECT retired FROM agents WHERE id = ?').get(owes.id) as { retired: number }
    expect(row.retired, 'the refused retire writes nothing').toBe(0)
  })

  it('keeps the row, writes the reason, and the agent record follows', async () => {
    const kept = await register('retired-and-kept')
    const before = (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM agents').get() as { n: number }).n
    const { code, said } = await retire('retired-and-kept')
    expect(code, JSON.stringify(said)).toBe(200)
    const row = t.client.sqlite.prepare('SELECT id, retired, retired_because FROM agents WHERE id = ?').get(kept.id) as {
      id: string
      retired: number
      retired_because: string
    }
    expect(row).toEqual({ id: kept.id, retired: 1, retired_because: BECAUSE })
    expect((t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM agents').get() as { n: number }).n, 'no row is deleted').toBe(before)
    const record = t.api.getRecord(kept.recordId)
    expect(record?.data).toMatchObject({ state: 'retired', retiredBecause: BECAUSE })
  })
})
