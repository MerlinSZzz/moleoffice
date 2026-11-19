// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The real firing-answer door commits a result and its failure wake together. The wake goes to whoever holds the
 * secretary card, read from the registry; while nobody holds it, nobody is told and the answer says so.
 * MUTATIONS (each restored after): the alert goes to a handle written in the code whoever holds the card: red, four
 * cases (the wake on failure, the case without a secretary, and the two that file through the real doors); the
 * sentence about nobody holding the card is left out: red, the case without a secretary.
 */
import { beforeAll, afterAll, it, expect } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER, THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { TIMING_JOB, timingCounters } from '../src/config/timing-job.mjs'
import { timingJobTick } from '../tools/run-the-timing-job.mjs'
let db: TestDb
let app: FastifyInstance
const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const keeper = { ...headers, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'timing-keeper' }
beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle: 'timing-keeper', name: 'Synthetic timing-keeper' } })
  expect(made.statusCode, made.body).toBe(201)
  // A MADE-UP SECRETARY, holding the card the alert goes to.
  const secretary = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle: 'the-secretary', name: 'Synthetic the-secretary', runtime: 'claude-code', role: 'supervisor', workArea: ['src/the-secretary'] } })
  expect(secretary.statusCode, secretary.body).toBe(201)
  await theSecretaryCardTo('secretary')
  const office = await import('../src/server/lib/office.ts')
  const world = await import('../src/server/lib/world.ts')
  office.registerWorldHere({ name: 'Synthetic office', purpose: null, handback: null, kind: 'home', startedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }, checkout: `${THE_TEST_FIXTURE_ROOT}/timing`, head: 'abc1234', databaseIdentity: world.theWorldThisDatabaseIs() ?? '', address: 'http://127.0.0.1:41800', addressForOtherMachines: null, standing: 'canonical', parentWorld: null, installation: 'synthetic-timing' })
}, 60_000)
afterAll(async () => { await app?.close(); db?.close() })
/** Gives the made-up secretary the secretary card, or takes it back by giving it the worker card. */
async function theSecretaryCardTo(role: 'secretary' | 'worker') {
  const given = await app.inject({ method: 'POST', url: '/api/roles/card/the-secretary', headers, payload: { role } })
  expect(given.statusCode, given.body).toBeLessThan(300)
}
async function pending() {
  const made = await app.inject({ method: 'POST', url: '/api/counters', headers: keeper, payload: { title: 'Synthetic timing job', counts: 'Synthetic timing requests.', triggers: [{ kind: 'count', n: 1 }], action: { kind: 'job', job: TIMING_JOB } } })
  expect(made.statusCode, made.body).toBe(201)
  const id = JSON.parse(made.body).counter.id
  const added = await app.inject({ method: 'POST', url: `/api/counters/${id}/add`, headers: keeper, payload: { because: 'Synthetic request for the timing job.' } })
  expect(added.statusCode, added.body).toBe(201)
  const seq = JSON.parse(added.body).fired.seq
  return { id, seq }
}
async function answer(status: string, evidence: Record<string, unknown> = {}) {
  const { id, seq } = await pending()
  const report = await app.inject({ method: 'POST', url: '/api/records', headers: keeper, payload: { kind: 'report', title: 'Synthetic timing result', data: { for: 'the-secretary', date: '2026-10-08', blocks: [{ id: 'result', type: 'text', text: 'Synthetic result for the firing-answer test.' }], extra: { timingJob: { counter: id, seq, status, ...evidence } } } } })
  expect(report.statusCode, report.body).toBe(201)
  const result = JSON.parse(report.body).record.id
  const url = `/api/counters/${id}/firings/${seq}/answer`
  const payload = { result, says: `Synthetic timing ${status}.` }
  const completed = await app.inject({ method: 'POST', url, headers: keeper, payload })
  expect(completed.statusCode, completed.body).toBe(200)
  return { url, payload, ids: JSON.parse(completed.body).row.answer.ids as string[], says: JSON.parse(completed.body).row.answer.says as string }
}
function alerts() {
  return db.client.sqlite.prepare("SELECT id, data FROM records WHERE kind = 'message' AND title = 'Review timing needs attention'").all() as { id: string; data: string }[]
}
it('answers a pass without waking anybody', async () => {
  const before = alerts().length
  const passed = await answer('passed')
  expect(passed.ids).toHaveLength(1)
  expect(alerts()).toHaveLength(before)
})
it('wakes the coordinator once on failure, including after a lost answer and a retry', async () => {
  const before = alerts().length
  const failed = await answer('failed')
  expect(alerts()).toHaveLength(before + 1)
  expect(failed.ids).toHaveLength(2)
  const message = JSON.parse(alerts().at(-1)!.data)
  expect(message.urgent).toBe(true)
  expect(message.body).toContain('Review timing failed')
  const recipient = db.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get('the-secretary') as { id: string }
  expect(message.to).toEqual([{ kind: 'agent', id: recipient.id }])
  const deliveries = db.client.sqlite.prepare('SELECT recipient_kind, recipient_id, mark FROM message_delivery WHERE message_id = ? AND recipient_kind = ? AND recipient_id = ?').all(alerts().at(-1)!.id, 'agent', recipient.id)
  expect(deliveries).toEqual([{ recipient_kind: 'agent', recipient_id: recipient.id, mark: 'queued' }])
  const retried = await app.inject({ method: 'POST', url: failed.url, headers: keeper, payload: failed.payload })
  expect(retried.statusCode, retried.body).toBe(409)
  expect(alerts()).toHaveLength(before + 1)
})
it('tells nobody, and says so on the answer, while nobody holds the secretary card', async () => {
  await theSecretaryCardTo('worker')
  try {
    const before = alerts().length
    const failed = await answer('failed')
    expect(alerts()).toHaveLength(before)
    expect(failed.ids).toHaveLength(1)
    expect(failed.says).toBe('Synthetic timing failed. Nobody holds the secretary card, so nobody was told that review timing needs attention.')
  } finally {
    await theSecretaryCardTo('secretary')
  }
})
it('wakes the coordinator once when three days brought no quiet window', async () => {
  const before = alerts().length
  await answer('not-run')
  expect(alerts()).toHaveLength(before + 1)
  expect(JSON.parse(alerts().at(-1)!.data).body).toContain('no quiet window in three days')
})
it('says why attention is needed without putting record ids in the alert', async () => {
  const cases = [
    { status: 'failed', evidence: { because: 'The browser did not start within 30 seconds.' }, expected: 'Review timing failed. The browser did not start within 30 seconds.' },
    { status: 'failed', evidence: { measurements: { coldFixtureMs: 61_250, limitMs: 300, runs: [[{ ms: 342 }]] } }, expected: 'Review timing failed. The cold fixture took 61250 ms against a limit below 60000 ms (1250 ms over the boundary). The slowest review press took 342 ms against 300 ms (42 ms over).' },
    { status: 'failed', evidence: {}, expected: 'Review timing failed. No failure reason was recorded.' },
    { status: 'not-run', evidence: {}, expected: 'Review timing found no quiet window in three days.' },
  ]
  for (const sample of cases) {
    const completed = await answer(sample.status, sample.evidence)
    const message = JSON.parse(alerts().at(-1)!.data)
    expect(message.body).not.toContain(completed.payload.result)
    expect(message.body).not.toContain(completed.ids[1])
    expect(message.body).toBe(sample.expected)
  }
})
async function runJob(id: string, code: number, measurements: any, now = new Date(), reader: string | null = 'the-secretary') {
  const read = await app.inject({ method: 'GET', url: `/api/counters/${id}`, headers: keeper })
  const counter = JSON.parse(read.body).counter
  const definitions = timingCounters('/synthetic-main').map((one, i) => ({ ...one, id: `synthetic-${i}`, follows: [] }))
  const state = new Map<string, any>()
  let result: any
  let runs = 0
  const doors = {
    ask: async (method: string, path: string, body?: any) => {
      if (path === '/api/counters') return { counters: [...definitions, counter] }
      if (path.startsWith('/api/counters/synthetic-')) return { rows: [], more: false }
      if (path.startsWith('/api/merge-queue?')) return { lanes: [] }
      if (method === 'POST' && path === '/api/records') result = body.data.extra.timingJob
      const response = await app.inject({ method: method as 'GET' | 'POST', url: path, headers: keeper, ...(body === undefined ? {} : { payload: body }) })
      expect(response.statusCode, response.body).toBeLessThan(300)
      return JSON.parse(response.body)
    },
    reading: () => ({ load1: 1, cores: 20, memAvailableKiB: 90_000_000 }),
    run: async () => { runs++; return { code, commit: 'a'.repeat(40), measurements } },
    load: (key: string) => state.get(key) ?? {}, save: (key: string, value: any) => { state.set(key, value) },
    now: () => now, lane: '/synthetic-main', reader,
  }
  await timingJobTick(doors)
  return { result, doors, runs: () => runs }
}
it('retains a failed run status and exit in its report and alert without an exceeded limit', async () => {
  const measurements = { status: 'run incomplete', quiet: true, coldFixtureMs: 12_000, limitMs: 300, runs: [Array.from({ length: 15 }, (_, i) => ({ press: `Synthetic press ${i + 1}`, ms: 125, doors: [] }))] }
  const expected = 'The run reported "run incomplete" and exited with code 1.'
  const { id } = await pending()
  const { result } = await runJob(id, 1, measurements)
  expect(result.because).toBe(expected)
  expect(JSON.parse(alerts().at(-1)!.data).body).toBe(`Review timing failed. ${expected}`)
  // Older results may retain the raw status or exit without the runner's because.
  for (const sample of [
    { evidence: { code: 1, measurements }, reason: expected },
    { evidence: { measurements: { status: 'failed' } }, reason: 'The run reported "failed".' },
    { evidence: { code: 1 }, reason: 'The run exited with code 1.' },
    { evidence: { code: 0 }, reason: 'The run exited with code 0.' },
  ]) {
    const completed = await answer('failed', sample.evidence)
    const body = JSON.parse(alerts().at(-1)!.data).body
    expect(body).toBe(`Review timing failed. ${sample.reason}`)
    expect(body).not.toContain(completed.payload.result)
  }
})
it.each(['passed', 'failed', 'not-run'])('files and completes %s through real report and summary doors without a second result', async status => {
  const { id, seq } = await pending()
  const before = alerts().length
  const reportsBefore = (db.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'report'").get() as { n: number }).n
  const measurements = { status: status === 'passed' ? 'passed' : 'run incomplete', quiet: true, limitMs: 300, coldFixtureMs: 12_000, runs: status === 'passed' ? [Array.from({ length: 15 }, (_, i) => ({ press: `Synthetic press ${i + 1}`, ms: 125, doors: [] }))] : [] }
  const now = new Date(Date.now() + (status === 'not-run' ? 3 * 24 * 60 * 60_000 + 1000 : 0))
  const job = await runJob(id, status === 'passed' ? 0 : 1, measurements, now)
  const read = await app.inject({ method: 'GET', url: `/api/counters/${id}`, headers: keeper })
  const completed = JSON.parse(read.body).rows.find((row: any) => row.seq === seq).answer
  expect(completed.finished).toBe(true)
  expect(completed.ids).toHaveLength(status === 'passed' ? 1 : 2)
  const resultId = completed.ids[0]
  const summaries = await app.inject({ method: 'POST', url: '/api/short-forms/rows', headers: keeper, payload: { recordIds: [resultId], level: 'label' } })
  expect(summaries.statusCode, summaries.body).toBe(200)
  expect(JSON.parse(summaries.body).rows[0].state).toBe('current')
  const reading = await app.inject({ method: 'GET', url: `/api/records/${resultId}/short-forms`, headers: keeper })
  expect(reading.statusCode, reading.body).toBe(200)
  const outline = JSON.parse(reading.body).levels.find((level: any) => level.rung === 'outline')
  expect(outline.state).toBe(status === 'passed' ? 'current' : 'cannot_write')
  expect(alerts()).toHaveLength(before + (status === 'passed' ? 0 : 1))
  if (status !== 'passed') {
    const recipient = db.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get('the-secretary') as { id: string }
    const delivered = db.client.sqlite.prepare('SELECT mark FROM message_delivery WHERE message_id = ? AND recipient_id = ?').all(completed.ids[1], recipient.id)
    expect(delivered).toEqual([{ mark: 'queued' }])
  }
  // A later timer tick must not repeat the already completed job.
  now.setTime(now.getTime() + 31 * 60_000)
  expect(await timingJobTick(job.doors)).toContain('No timing firing')
  expect(job.runs()).toBe(status === 'not-run' ? 0 : 1)
  expect((db.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'report'").get() as { n: number }).n).toBe(reportsBefore + 1)
  expect(alerts()).toHaveLength(before + (status === 'passed' ? 0 : 1))
})
// NO READER NAMED (decision lLDy-GJmBr1t, which replaces xkZEzm9pjbr3): the real record door takes a report with no
// `for`, it answers the firing, the tick does the rest, and then it fails once, naming the report and the setting before
// the tick's own sentence.
it('answers the firing through the real doors with a report addressed to nobody, then fails, while no reader is named', async () => {
  const { id, seq } = await pending()
  const measurements = { status: 'passed', quiet: true, limitMs: 300, coldFixtureMs: 12_000, runs: [Array.from({ length: 15 }, (_, i) => ({ press: `Synthetic press ${i + 1}`, ms: 125, doors: [] }))] }
  const failed = await runJob(id, 0, measurements, new Date(), null).then(() => null, (error: unknown) => error)
  const read = await app.inject({ method: 'GET', url: `/api/counters/${id}`, headers: keeper })
  const completed = JSON.parse(read.body).rows.find((row: any) => row.seq === seq).answer
  expect(completed.finished).toBe(true)
  const report = await app.inject({ method: 'GET', url: `/api/records/${completed.ids[0]}`, headers: keeper })
  expect(report.statusCode, report.body).toBe(200)
  expect(JSON.parse(report.body).record.data.for).toBeUndefined()
  expect(failed).toEqual(new Error(`The timing report ${completed.ids[0]} was filed and answered its firing, but it is addressed to nobody, because MOLE_OFFICE_TIMING_REPORT_READER names no reader. Timing passed; nobody was notified.`))
})
it('refuses an unqualified final answer without finishing the firing or writing a wake', async () => {
  const before = alerts().length
  const { id, seq } = await pending()
  const bad = await app.inject({ method: 'POST', url: `/api/counters/${id}/firings/${seq}/answer`, headers: keeper, payload: { says: 'No real final result.' } })
  expect(bad.statusCode, bad.body).toBe(400)
  const read = await app.inject({ method: 'GET', url: `/api/counters/${id}`, headers: keeper })
  expect(JSON.parse(read.body).rows.find((row: any) => row.seq === seq).answer.finished).toBe(false)
  expect(alerts()).toHaveLength(before)
})
