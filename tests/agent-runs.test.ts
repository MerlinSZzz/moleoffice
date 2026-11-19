// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN IS A ROW A WORKER CLAIMS: the queue, the race, the decline, and what comes back.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED, AND WHY EACH ONE MATTERS
 * ---------------------------------------------------------------------------------------
 *
 * 1. THE QUEUE IS WHAT A WORKER ASKS FOR. `GET /api/agent/runs?state=queued` answers about every
 *    project and takes no project header, because a worker serves a machine.
 *
 * 2. TWO WORKERS RACING MUST NOT BOTH GET ONE RUN. The claim is compare-and-set, so the second one
 *    is refused by name rather than quietly running the same work twice.
 *
 * 3. A DECLINE IS A REAL STATE AND IT IS NOT A FAILURE. A run addressed to an agent whose
 *    transcript is not on this worker's machine cannot be served there, and starting a fresh agent
 *    that has never heard of the work would be the second engineering rule broken on the path most
 *    likely to break it. So the run stays waiting and another worker may take it.
 *
 * 4. A RUN NOBODY HAS CLAIMED SAYS SO. "Nobody has picked this up yet" is a real answer and a
 *    better one than a spinner.
 *
 * 5. A FOCUS THAT NAMES A RECORD NOBODY HAS IS REPORTED AS SUCH. Mole Office performs the navigation,
 *    so a link that goes nowhere would be Mole Office's mistake to make and not the agent's.
 *
 * The client this file is serving is `tools/agent-worker.mjs`, which sends exactly these four
 * requests and no others, with no project header on any of them.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { theOfficesKeyHeader, thePersonsKeyHeader, apiApp, freshDb, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const HUMAN = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': WORKSPACE }
/** What the worker sends: agent headers, and NO project header on any of its four requests. */
const WORKER = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office-agent-worker' }

let t: TestDb
let app: FastifyInstance

/**
 * ONE OFFICE FOR THE FILE. Each case dispatches the threads and runs it acts on. The queue is a
 * reading over the whole office on purpose, so a case that counts it takes the reading at its own
 * start and compares what was added since, rather than narrowing the reading to one project.
 */
beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/** Every message row's state, in the order the rows were written. Whole office, on purpose. */
function everyMessageState(): string[] {
  return (t.client.sqlite.prepare('SELECT state FROM agent_messages ORDER BY rowid').all() as { state: string }[]).map((row) => row.state)
}

interface TheQueue {
  runs: RunShape[]
  counts: Record<string, number>
  note: string
}

async function theQueue(): Promise<TheQueue> {
  const waiting = await app.inject({ method: 'GET', url: '/api/agent/runs?state=queued', headers: WORKER })
  expect(waiting.statusCode, waiting.body).toBe(200)
  return waiting.json() as TheQueue
}

interface RunShape {
  id: string
  state: string
  claimedBy: string | null
  says: string
  workspaceId: string
  threadTitle: string
  result: unknown
  error: string | null
  focus: { resolves: boolean; says: string } | null
}

/** A review with one comment for a new agent, dispatched. Hands back the run and the thread. */
async function oneQueuedRun(body = 'Say which trials, by number.'): Promise<{ run: string; thread: string; message: string }> {
  const started = await app.inject({
    method: 'POST',
    url: '/api/agent/threads',
    headers: HUMAN,
    payload: { title: 'Round six, read again', mode: 'review' },
  })
  expect(started.statusCode, started.body).toBe(201)
  const thread = (started.json() as { thread: { id: string } }).thread.id

  const said = await app.inject({
    method: 'POST',
    url: `/api/agent/threads/${thread}/messages`,
    headers: HUMAN,
    payload: { intent: 'change', body, recipient: { kind: 'new' } },
  })
  expect(said.statusCode, said.body).toBe(201)
  const message = (said.json() as { message: { id: string } }).message.id

  const sent = await app.inject({ method: 'POST', url: `/api/agent/threads/${thread}/dispatch`, headers: { ...HUMAN, ...thePersonsKeyHeader() } })
  expect(sent.statusCode, sent.body).toBe(201)
  return { run: (sent.json() as { runs: { id: string }[] }).runs[0]?.id ?? '', thread, message }
}

function runRow(id: string): Record<string, unknown> {
  return t.client.sqlite.prepare('SELECT * FROM agent_runs WHERE id = ?').get(id) as Record<string, unknown>
}

// ====================================================== the queue

describe('what a worker may pick up', () => {
  it('lists a queued run with no project header at all, and says which project it is about', async () => {
    const atTheStart = await theQueue()
    const { run } = await oneQueuedRun()
    const reply = await theQueue()
    const alreadyThere = new Set(atTheStart.runs.map((r) => r.id))
    const added = reply.runs.filter((r) => !alreadyThere.has(r.id))
    expect(added.map((r) => r.id)).toEqual([run])
    expect(added[0]?.workspaceId, 'a row that did not say which project it came from').toBe(WORKSPACE)
    expect(added[0]?.threadTitle).toBe('Round six, read again')
    expect(reply.counts['queued']! - atTheStart.counts['queued']!).toBe(1)
  })

  it('does not hand out the assembled context to a reader of the queue', async () => {
    await oneQueuedRun('The mount tolerance is not stated anywhere.')
    const waiting = await app.inject({ method: 'GET', url: '/api/agent/runs?state=queued', headers: WORKER })
    // Reading the queue is not the same act as taking the work, and the queue is polled every few
    // seconds. The comments come back from the claim, to the worker that took it.
    expect(waiting.body).not.toContain('The mount tolerance is not stated anywhere.')
  })

  it('says a queued run is waiting rather than showing anything that looks like progress', async () => {
    const { run } = await oneQueuedRun()
    const waiting = await app.inject({ method: 'GET', url: '/api/agent/runs', headers: WORKER })
    const row = (waiting.json() as { runs: RunShape[] }).runs.find((r) => r.id === run)
    const { WAITING_FOR_A_WORKER } = await import('../src/server/lib/agents.ts')
    expect(row?.says).toBe(WAITING_FOR_A_WORKER)
    expect(row?.claimedBy).toBeNull()
  })

  it('refuses a state nobody uses rather than answering an empty list', async () => {
    const asked = await app.inject({ method: 'GET', url: '/api/agent/runs?state=finnished', headers: WORKER })
    expect(asked.statusCode, asked.body).toBe(400)
    expect((asked.json() as { error: string }).error).toContain('state must be one of')
  })
})

// ====================================================== the claim, and the race

describe('a worker takes a run, and only one worker can', () => {
  it('hands the claimer exactly what was written at dispatch', async () => {
    const { run, thread } = await oneQueuedRun()
    const claimed = await app.inject({
      method: 'POST',
      url: `/api/agent/runs/${run}/claim`,
      headers: { ...WORKER, ...theOfficesKeyHeader() },
      payload: { worker: 'claude-code@bench' },
    })
    expect(claimed.statusCode, claimed.body).toBe(200)
    const got = (claimed.json() as { run: Record<string, unknown> }).run

    // The shape tools/agent-worker.mjs reads. It builds the whole prompt from these five keys.
    expect(got['workspaceId']).toBe(WORKSPACE)
    expect(got['actorId']).toBe(`run-${run.toLowerCase().replace(/_/g, '-')}-agent`)
    expect((got['thread'] as { mode: string }).mode).toBe('review')
    expect((got['messages'] as { body: string }[])[0]?.body).toBe('Say which trials, by number.')
    expect(typeof got['contextNote']).toBe('string')
    expect(got['state']).toBe('claimed')
    expect(got['claimedBy']).toBe('claude-code@bench')
    expect(got['threadId']).toBe(thread)

    // What was handed over is byte for byte what was stored at dispatch, and the row was not
    // rewritten by the claim: an answer has to be readable against the question that produced it.
    const stored = JSON.parse(String(runRow(run)['request'])) as { messages: { body: string }[] }
    expect(stored.messages[0]?.body).toBe('Say which trials, by number.')
  })

  it('refuses the second of two workers racing, naming who has it', async () => {
    const { run } = await oneQueuedRun()
    const first = await app.inject({
      method: 'POST',
      url: `/api/agent/runs/${run}/claim`,
      headers: { ...WORKER, ...theOfficesKeyHeader() },
      payload: { worker: 'claude-code@bench' },
    })
    expect(first.statusCode, first.body).toBe(200)

    const second = await app.inject({
      method: 'POST',
      url: `/api/agent/runs/${run}/claim`,
      headers: { ...WORKER, ...theOfficesKeyHeader() },
      payload: { worker: 'claude-code@laptop' },
    })
    expect(second.statusCode, second.body).toBe(409)
    const why = (second.json() as { error: string }).error
    expect(why, 'the refusal does not say who has it').toContain('claude-code@bench')
    expect(why).toContain('Nothing was taken')

    // And the row still belongs to the first worker. A refusal that had stamped the row anyway
    // would leave two workers each believing they had it.
    expect(runRow(run)['claimed_by']).toBe('claude-code@bench')
  })

  it('says so rather than 404ing when the run id is not a run', async () => {
    const missed = await app.inject({
      method: 'POST',
      url: '/api/agent/runs/nothing-with-this-id/claim',
      headers: { ...WORKER, ...theOfficesKeyHeader() },
      payload: { worker: 'claude-code@bench' },
    })
    expect(missed.statusCode).toBe(404)
    expect((missed.json() as { error: string }).error).toContain('No agent run with id')
  })
})

// ====================================================== the decline

describe('a worker that cannot serve a run declines it, and the run stays waiting', () => {
  it('records the decline and the reason, and never starts a fresh agent in its place', async () => {
    const statesAtTheStart = everyMessageState()
    const { run } = await oneQueuedRun()
    const why =
      'This worker cannot pick that agent up again. Its session transcript is not on this machine, so resuming it ' +
      'here would start a new agent that has never seen the work. Nothing was run.'

    // The worker declines WITHOUT claiming — it looked at the queue and knew it could not serve it.
    const declined = await app.inject({
      method: 'POST',
      url: `/api/agent/runs/${run}/result`,
      headers: WORKER,
      payload: { error: why, declined: true },
    })
    expect(declined.statusCode, declined.body).toBe(200)
    const reply = declined.json() as { run: RunShape; note: string }
    expect(reply.run.state).toBe('declined')
    expect(reply.run.error).toBe(why)
    expect(reply.run.result, 'a decline invented an answer').toBeNull()
    expect(reply.run.says).toContain('still waiting')
    expect(reply.note).toContain('Nobody has been sent a fresh agent in its place')

    // The comment is NOT answered. Nothing has answered it. The rows this case added are its own
    // message, and the whole-office reading is kept whole.
    expect(everyMessageState().slice(statesAtTheStart.length), 'the comment is not answered').toEqual(['sent'])
  })

  it('lets another worker claim a declined run, because it is still waiting', async () => {
    const { run } = await oneQueuedRun()
    await app.inject({
      method: 'POST',
      url: `/api/agent/runs/${run}/result`,
      headers: WORKER,
      payload: { error: 'not on this machine', declined: true },
    })

    const taken = await app.inject({
      method: 'POST',
      url: `/api/agent/runs/${run}/claim`,
      headers: { ...WORKER, ...theOfficesKeyHeader() },
      payload: { worker: 'claude-code@the-other-machine' },
    })
    expect(taken.statusCode, taken.body).toBe(200)
    expect(runRow(run)['claimed_by']).toBe('claude-code@the-other-machine')
  })

  it('refuses a decline that does not say why', async () => {
    const { run } = await oneQueuedRun()
    const bare = await app.inject({
      method: 'POST',
      url: `/api/agent/runs/${run}/result`,
      headers: WORKER,
      payload: { declined: true },
    })
    expect(bare.statusCode, bare.body).toBe(400)
    expect((bare.json() as { error: string }).error).toContain('has to say why')
    expect(runRow(run)['state'], 'a refused decline changed the run anyway').toBe('queued')
  })
})

// ====================================================== what comes back

describe('the answer, the failure, and what Mole Office makes of a focus', () => {
  it('stores the answer, marks the comments it carried dealt with, and marks the conversation answered', async () => {
    const { run, thread, message } = await oneQueuedRun()
    await app.inject({ method: 'POST', url: `/api/agent/runs/${run}/claim`, headers: { ...WORKER, ...theOfficesKeyHeader() }, payload: { worker: 'w1' } })

    const posted = await app.inject({
      method: 'POST',
      url: `/api/agent/runs/${run}/result`,
      headers: WORKER,
      payload: {
        result: { answer: 'Trials 4, 9, 11 and 17. I put the numbers on the report.', wrote: [], structured: true },
        tookMs: 3300,
      },
    })
    expect(posted.statusCode, posted.body).toBe(200)
    const reply = posted.json() as { run: RunShape; thread: { state: string }; note: string }
    expect(reply.run.state).toBe('finished')
    expect((reply.run.result as { answer: string }).answer).toContain('Trials 4, 9, 11 and 17')
    expect((reply.run.result as { tookMs: number }).tookMs, "the worker's measurement is kept beside the answer").toBe(3300)
    expect(reply.thread.state).toBe('answered')

    const read = await app.inject({ method: 'GET', url: `/api/agent/threads/${thread}`, headers: HUMAN })
    const detail = read.json() as { messages: { id: string; state: string }[]; runs: RunShape[]; says: string }
    // `handled`, not `answered`. The word `answered` left `MESSAGE_STATES` when the dispatch
    // lifecycle became six words — it meant exactly what `handled` means, and two spellings of one
    // event is what that change removed. See src/server/lib/dispatch.ts.
    expect(detail.messages.find((m) => m.id === message)?.state).toBe('handled')
    expect(detail.runs[0]?.state).toBe('finished')
    expect(detail.says).toContain('1 answered')
  })

  it('records a failure as a failure, with no answer invented in its place', async () => {
    const statesAtTheStart = everyMessageState()
    const { run, thread } = await oneQueuedRun()
    await app.inject({ method: 'POST', url: `/api/agent/runs/${run}/claim`, headers: { ...WORKER, ...theOfficesKeyHeader() }, payload: { worker: 'w1' } })
    const posted = await app.inject({
      method: 'POST',
      url: `/api/agent/runs/${run}/result`,
      headers: WORKER,
      payload: { error: 'claude exited 1. It printed nothing on the error channel.', tookMs: 900 },
    })
    expect(posted.statusCode, posted.body).toBe(200)
    const reply = posted.json() as { run: RunShape; thread: { state: string } }
    expect(reply.run.state).toBe('failed')
    expect(reply.run.result).toBeNull()
    // A conversation whose only run failed is NOT answered. Nothing came back.
    expect(reply.thread.state).toBe('dispatched')
    // AND THE COMMENT IT CARRIED NOW SAYS THE ATTEMPT FAILED, which it did not used to.
    //
    // It stayed `sent`, so an inbox went on showing it as waiting for an agent that had already
    // tried and could not finish, and nothing anywhere said why. `failed` is one of the six words
    // and `failed_because` carries the run's own sentence. Nothing is answered and nothing is
    // hidden: the words are still there and still readable.
    const rows = t.client.sqlite
      .prepare('SELECT state, failed_because FROM agent_messages ORDER BY rowid')
      .all() as { state: string; failed_because: string | null }[]
    const added = rows.slice(statesAtTheStart.length)
    expect(added.map((r) => r.state)).toEqual(['failed'])
    expect(added[0]?.failed_because).toContain('claude exited 1')
    void thread
  })

  it('reports a focus that names a record nobody has, rather than storing it as a working link', async () => {
    const { run } = await oneQueuedRun()
    await app.inject({ method: 'POST', url: `/api/agent/runs/${run}/claim`, headers: { ...WORKER, ...theOfficesKeyHeader() }, payload: { worker: 'w1' } })
    const posted = await app.inject({
      method: 'POST',
      url: `/api/agent/runs/${run}/result`,
      headers: WORKER,
      payload: { result: { answer: 'Filed as a proposal.', wrote: [], focus: { record: 'nDx9NOTHINGHERE' } } },
    })
    expect(posted.statusCode, posted.body).toBe(200)
    const reply = posted.json() as { run: RunShape; note: string }
    expect(reply.run.focus?.resolves).toBe(false)
    expect(reply.run.focus?.says).toContain('no record has that id')
    expect(reply.note).toContain('no record has that id')
    // The agent's own words are kept exactly. Mole Office says what it made of them beside them.
    expect((reply.run.result as { focus: { record: string } }).focus.record).toBe('nDx9NOTHINGHERE')
  })

  it('follows a focus that names a record somebody does have', async () => {
    const filed = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HUMAN,
      payload: { kind: 'proposal', title: 'Position control or force control' },
    })
    expect(filed.statusCode, filed.body).toBe(201)
    const proposal = (filed.json() as { record: { id: string } }).record.id

    const { run } = await oneQueuedRun()
    await app.inject({ method: 'POST', url: `/api/agent/runs/${run}/claim`, headers: { ...WORKER, ...theOfficesKeyHeader() }, payload: { worker: 'w1' } })
    const posted = await app.inject({
      method: 'POST',
      url: `/api/agent/runs/${run}/result`,
      headers: WORKER,
      payload: { result: { answer: 'This needs a governance choice, so I filed a proposal.', focus: { record: proposal } } },
    })
    const reply = posted.json() as { run: RunShape }
    expect(reply.run.focus?.resolves).toBe(true)
    expect(reply.run.focus?.says).toContain('Position control or force control')
  })

  it('refuses a second answer to a run that has already ended', async () => {
    const { run } = await oneQueuedRun()
    await app.inject({ method: 'POST', url: `/api/agent/runs/${run}/claim`, headers: { ...WORKER, ...theOfficesKeyHeader() }, payload: { worker: 'w1' } })
    await app.inject({
      method: 'POST',
      url: `/api/agent/runs/${run}/result`,
      headers: WORKER,
      payload: { result: { answer: 'the first answer' } },
    })
    const again = await app.inject({
      method: 'POST',
      url: `/api/agent/runs/${run}/result`,
      headers: WORKER,
      payload: { result: { answer: 'a different answer' } },
    })
    expect(again.statusCode, again.body).toBe(409)
    expect((again.json() as { error: string }).error).toContain('already')
    expect(JSON.parse(String(runRow(run)['result'])), 'the second answer overwrote the first').toMatchObject({
      answer: 'the first answer',
    })
  })

  it('refuses a result that says a run ended without saying how', async () => {
    const { run } = await oneQueuedRun()
    await app.inject({ method: 'POST', url: `/api/agent/runs/${run}/claim`, headers: { ...WORKER, ...theOfficesKeyHeader() }, payload: { worker: 'w1' } })
    const empty = await app.inject({ method: 'POST', url: `/api/agent/runs/${run}/result`, headers: WORKER, payload: {} })
    expect(empty.statusCode, empty.body).toBe(400)
    expect((empty.json() as { error: string }).error).toContain('Nothing was sent back')
    expect(runRow(run)['state']).toBe('claimed')
  })
})
