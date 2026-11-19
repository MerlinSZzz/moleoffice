// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN'S DATA IS CHANGED ONLY BY THOSE WHO ANSWER FOR THE RUN. A worker's own agent key could change the run of the
 * agent that started it: the guards on a run's record asked who wrote only its end, its served conditions and its
 * sandbox, and every other field of its data took any key. The ruling on that problem names who may change a run's
 * data: the run's own agent and its key, the agent that filed it (a launcher writes its runs with its own key), a
 * secretary, the office and the person, proved. They are the callers who may end a run, and the agent that started
 * the run's agent is among those, so it is admitted here too. The guard is `assertMayChangeARun` in
 * src/server/lib/records.ts; it reads `mayEndARun`, whose own cases are tests/who-may-end-a-run.test.ts.
 *
 * NOR DOES AN AGENT'S KEY FILE A NEW RUN THAT CARRIES ANOTHER AGENT'S CONVERSATION. A run names its conversation in
 * `providerSession` or in its discovery stamp's `externalId`, and the office finds a conversation's runs by either. An
 * agent's own key could file a run serving itself that named the conversation of another agent's run. The create door
 * now refuses that where a run naming the conversation is another agent's own run and not the writer's. A run is an
 * agent's own when it serves the agent, ran as it, or the agent filed it for itself and it names no other agent. A run
 * discovery filed in an agent's name is not that agent's own: the agent asked for a sweep and did not name the
 * conversation. The guard is `assertARunCarriesNoOtherAgentsConversation` in src/server/lib/records.ts. It reads
 * `theAgentsWhoseOwnRunThisIs` in src/server/lib/the-run-a-key-holds.ts, which the third part of the key rule reads too.
 * The patch door asks the same of each conversation a write leaves a run naming that the run did not name before, as
 * the session hook writes its conversation onto the run a launcher filed for it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. A worker's own key is refused on the run of the agent that started it, in words that name whose run it is,
 *      who may change one and who asked, and the run's data is as it was.
 *   2. The same through PATCH /api/records/<id>, by the worker's name, with and without the run named in its session
 *      header.
 *   3. The same through a revision's restore, POST /api/records/<id>/revisions/<seq>/restore, which the run's own
 *      agent may still use.
 *   4. The run's own agent changes it, by its name through the record door and with its own key.
 *   5. The agent that filed the run changes it, as a launcher writes its run's served conditions and doing line with
 *      no run key. This is one of the two writers that work today, pinned so that it stays green.
 *   6. The agent that started the run's agent changes it.
 *   7. A secretary changes it and ends it through the record door. This is the other of the two writers pinned. The
 *      settling tool (tools/settle-owed-runs.mjs) writes through /api/checks/<run>/<door>, which this guard does not
 *      ask; tests/owed-runs-are-settled-in-a-batch.test.ts keeps that door's cases.
 *   8. The person changes it from inside the office and with their key; their name with no key is refused even where
 *      the key window covers it, and the run's data is as it was.
 *   9. The office changes it: a system writer, its own writer by its name, and a caller with the office's key.
 *  10. A write the record door does not carry is not asked: the office's own sweeps write runs in a caller's name
 *      (discovery in src/server/lib/sessions.ts), and that caller did not change the run.
 *  11. A field a guard of its own answered is left to that guard and its switch. With the switch on who ends a run
 *      turned off, a stranger's end is written; a change it sends beside the end is still refused, and nothing of
 *      that write is stored.
 *  12. An agent's own key does not file a run that carries, in `providerSession`, the conversation of another agent's
 *      run, with or without its own running run in the session header. The 403 names the conversation, the other run,
 *      whose run it is and who asked, and nothing is filed.
 *  13. The same where a discovery stamp names the conversation: on the other agent's run, which that agent filed for
 *      itself as the session hook does, naming its conversation in `providerSession` and in its stamp, and on the new
 *      run. A stored run that names the conversation in its stamp alone is found as well.
 *  14. An agent's own key files a new run with its own conversation, while its run still runs and after it has ended,
 *      as the session hook files a conversation that goes on.
 *  15. The office's key and the person's key file a run with another agent's conversation, as the message worker
 *      brings an agent back. Any agent's key files one with the conversation of a run of no agent.
 *  16. A supervisor's run key, acting for the worker it started, files a run for that worker with the worker's own
 *      conversation.
 *  17. A run the office files in a caller's name is not asked: discovery files a conversation it read off this
 *      computer, and the caller did not name it. The same run filed in the caller's own name is refused.
 *  18. A run discovery filed in a caller's name, from a transcript it read off this computer, is not the caller's own.
 *      After it, the agent whose conversation it is files a run with that conversation, and the caller's own key is
 *      refused one, in words that name the owner's run.
 *  19. An agent's own key does not write another agent's conversation onto its own run by PATCH, in `providerSession`
 *      or in a discovery stamp, with or without the run in the session header. The 403 names the run the write would
 *      change and what the create door's 403 names, and the run is as it was.
 *  20. An agent's own key writes by PATCH its own conversation onto its own run, as the session hook does at the run's
 *      first start, and a new one when it takes the run over; and the conversation of a run of no agent. The office's
 *      key and the person's key write another agent's conversation onto a run. A write that leaves the run naming no
 *      conversation it did not name before is not asked.
 *  21. A run whose first revision holds a discovery stamp and no `providerSession`, as discovery filed one in a
 *      caller's name before it wrote its mark, is not its filer's own: the agent whose conversation it is files a run
 *      with it, and the filer's own key is refused one. Nor is a run whose first revision's stamp carries discovery's
 *      mark beside a `providerSession`.
 *
 * The guards asked before this one keep their own words for a caller they refuse: the end's are kept by
 * tests/who-may-end-a-run.test.ts and the served conditions' by tests/a-run-says-what-its-runtime-served-it.test.ts.
 * Case 3 of tests/a-claim-to-be-the-person-writes-no-served-conditions.test.ts keeps the served conditions' switch.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the report of the run that added this file)
 * ---------------------------------------------------------------------------------------
 *
 *   - the guard not asked: cases 1, 2, 3, 8 and 11 go red;
 *   - the record door's mark not set by PATCH /api/records/<id>: cases 2 and 11 go red;
 *   - the mark not set by a revision's restore: case 3 goes red;
 *   - the mark not read, so every write is asked: case 10 goes red;
 *   - the fields the guards above answered not left to them: case 11 goes red on the end written alone;
 *   - every field of a write another guard was asked about left to it: case 11 goes red on the change beside the end;
 *   - the guard reading only the run's own agents instead of `mayEndARun`: cases 5, 6, 7, 8 and 9 go red;
 *   - the sentence naming whose run it is left out of the 403: cases 1 and 2 go red;
 *   - the 403's words for who may change a run renamed away from their export: cases 1, 2, 3 and 11 go red;
 *   - the new run's conversations not asked at the create door: cases 12, 13 and 17 go red;
 *   - the new run's `providerSession` not read as a conversation it names: cases 12 and 13 go red;
 *   - the new run's discovery stamp not read as a conversation it names: cases 13 and 17 go red;
 *   - the stored runs' discovery stamps not searched for the conversation: case 13 goes red;
 *   - the guard reading only the run's own agents, so the agent that filed a run for itself is not counted: case 13
 *     goes red;
 *   - the writer's own run counted as another agent's: cases 14 and 16 go red;
 *   - the writer's own run counted as its own only while it runs: case 14 goes red on the filing after the end;
 *   - a run of no agent counted as another agent's: case 15 goes red;
 *   - the office's key asked as an agent's key is: case 15 goes red;
 *   - the person's key asked as an agent's key is: case 15 goes red;
 *   - a run the office files in a caller's name asked as well: case 17 goes red;
 *   - the 403's words on whose conversation a new run carries renamed away from their export: cases 12, 13 and 17 go
 *     red;
 *   - a run discovery filed in a caller's name counted as the caller's own: case 18 goes red on both filings;
 *   - discovery's stamp not saying it filed the run in a caller's name: case 18 went red on both filings, until the
 *     reading of case 21 came (below).
 *
 * Case 18 came after the others. The mutations above the last two were run before it was written, and it was run
 * against those two.
 *
 * Cases 19 and 20 came after case 18, and were red before the patch door asked. They were run against these:
 *
 *   - the conversations a write leaves a run naming not asked at the patch door: case 19 goes red;
 *   - every conversation the write leaves asked, the ones the run named before included, and the run written left out
 *     of the runs searched: case 20 goes red on the write that names no new conversation. Without the second part the
 *     setup of this file's second block goes red first: a run key's mint writes onto the worker's run, which names the
 *     worker's conversation, and the search finds that run itself;
 *   - a discovery stamp not read as a conversation a run names: cases 13, 17, 18 and 19 go red, 19 on the stamp;
 *   - the writer's own run counted as another agent's: cases 14, 16 and 20 go red;
 *   - the office's key asked as an agent's key is: cases 15 and 20 go red;
 *   - the 403 of the patch door not naming the run the write would change: case 19 goes red.
 *
 * Case 21 came after case 20, and was red before the reading asked a stamped first revision for a `providerSession`:
 * the owner's filing was refused, the unmarked run read as its filer's own. Cases 13 and 18 then gave the run an agent
 * files for itself a `providerSession`, as the session hook does, and case 13 gained the stored run with a stamp alone.
 * They were run against these:
 *
 *   - no first revision read as discovery's: cases 18 and 21 go red;
 *   - discovery's mark not read: case 21 goes red on the marked run;
 *   - a stamp with no `providerSession` not read as discovery's: case 21 goes red on the unmarked run;
 *   - every stamped first revision read as discovery's, `providerSession` or not: cases 13, 18 and 21 go red;
 *   - the stored runs' discovery stamps not searched for the conversation: case 13 goes red on the stored stamp;
 *   - every first revision with no `providerSession` read as discovery's, stamped or not: no case here goes red, and
 *     tests/a-run-discovery-filed-in-a-callers-name-is-not-on-its-resume-line.test.ts does;
 *   - discovery's stamp not saying it filed the run in a caller's name: no case here goes red, because the stamp with no
 *     `providerSession` leaves that run out as well. The fixture check of the file named above goes red.
 */

import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AdapterEnv } from '../src/server/lib/adapters/types.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { gateNamed } from '../src/config/gates.mjs'

type Built = Awaited<ReturnType<typeof apiApp>>
type Actor = import('../src/server/lib/records.ts').Actor

let t: TestDb
let app: Built
/** The records library, loaded after the test's own database is made, because it opens one. */
let records: typeof import('../src/server/lib/records.ts')

const THEM = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const asAgent = (id: string, session?: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
  ...(session === undefined ? {} : { 'x-mole-office-session': session }),
})

/** An agent proved by its own key, as a request carrying that key would make it. */
const withItsOwnKey = (id: string): Actor => ({ type: 'agent', id, from: 'this machine', provedBy: 'an-agent-key' })

/** Served conditions as a launcher writes them at its run's end. */
const SERVED = { model: 'one-model', temperature: 0.7, briefBytes: 902, contextTokens: { largestTurn: 111, total: 521 } }

async function ask(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; said: string; body: Record<string, any> }> {
  const reply = await app.app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  let body: Record<string, any> = {}
  try {
    body = reply.json() as Record<string, any>
  } catch {
    body = {}
  }
  return { status: reply.statusCode, said: String(body['error'] ?? reply.body), body }
}

/**
 * Register an agent, as the person or as the agent that starts it, and hand back the key the registration answered,
 * or '' where it answered none. An agent another agent starts is registered here with no card named, so it reads as a
 * worker.
 */
async function registered(handle: string, role: 'worker' | 'secretary' | null, by: Record<string, string> = THEM): Promise<string> {
  const body =
    role === null ? { handle, name: handle } : role === 'secretary' ? { handle, name: handle, role } : { handle, name: handle, role, workArea: ['src'], chapters: ['5'] }
  const done = await ask('POST', '/api/agents/started', by, body)
  expect(done.status, done.said).toBeLessThan(300)
  return String(done.body['whatToGiveIt']?.key ?? '')
}

/** A run that serves `agent`, filed by whoever `filer` names, still running, and saying what it is doing. */
async function aRunningRun(agent: string, filer: Record<string, string> = THEM): Promise<string> {
  const filed = await ask('POST', '/api/records', filer, {
    kind: 'session',
    title: `a run of ${agent}`,
    data: { state: 'running', servingAgent: agent, doing: 'what its own agent wrote' },
  })
  expect(filed.status, filed.said).toBe(201)
  return String(filed.body['record'].id)
}

async function dataOf(run: string): Promise<Record<string, unknown>> {
  return (await ask('GET', `/api/records/${run}`, THEM)).body['record']?.data ?? {}
}

/** A change to the run's doing line, as `actor`, carried by the record door when `throughTheDoor` says so. */
function changedDirectlyBy(run: string, actor: Actor, throughTheDoor = true): { status: number; said: string } | null {
  const write = (): void => void records.patchRecord(run, { dataPatch: { doing: `written by ${actor.type} ${actor.id}` } }, actor)
  try {
    if (throughTheDoor) records.throughTheRecordDoor(run, write)
    else write()
    return null
  } catch (refused) {
    return { status: (refused as { status: number }).status, said: String((refused as Error).message) }
  }
}

beforeAll(async () => {
  t = await freshDb()
  // THE DEFAULT SET, COPIED AS A NEW OFFICE DOES AT ITS FIRST START: a registration's chapters line is read against the
  // office's own chapter records. Imported after freshDb, which resets the modules.
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  app = await apiApp()
  await app.app.ready()
  records = await import('../src/server/lib/records.ts')
  await registered('sec-one', 'secretary')
  await registered('lead-one', 'worker')
  await registered('lead-two', 'worker')
  await registered('stranger-one', 'worker')
  await registered('the-launcher', 'worker')
  // TWO RUNGS BELOW the-launcher, so it may file the-worker's run without being the agent that started the-worker, and
  // what lets it change that run is that it filed it.
  await registered('the-middle', null, asAgent('the-launcher'))
  await registered('the-worker', null, asAgent('the-middle'))
  // STARTED BY THE AGENT WHOSE RUN IT WILL TRY TO CHANGE: lead-one is its starter, and it is nothing to lead-one's run.
  await registered('worker-one', null, asAgent('lead-one'))
  // STARTED BY lead-two, which makes lead-two the starter of the agent its runs serve.
  await registered('worker-two', null, asAgent('lead-two'))
})

afterAll(async () => {
  await app?.app.close()
  t?.close()
})

describe("who may change a run's data", () => {
  it('1: not a worker with its own key, on the run of the agent that started it', async () => {
    const run = await aRunningRun('lead-one')
    const refused = changedDirectlyBy(run, withItsOwnKey('worker-one'))
    expect(refused?.status, refused?.said).toBe(403)
    expect(refused?.said).toContain(records.WHO_MAY_CHANGE_A_RUN)
    expect(refused?.said, 'the 403 does not say whose run it is').toContain('"lead-one"')
    expect(refused?.said).toContain('"worker-one"')
    expect((await dataOf(run))['doing'], 'the refused change was written').toBe('what its own agent wrote')
  })

  it('2: not through PATCH /api/records/<id>, with or without the run named in the session header', async () => {
    const run = await aRunningRun('lead-one')
    for (const headers of [asAgent('worker-one'), asAgent('worker-one', run)]) {
      const refused = await ask('PATCH', `/api/records/${run}`, headers, { dataPatch: { doing: 'rewritten by a worker' } })
      expect(refused.status, refused.said).toBe(403)
      expect(refused.said).toContain(records.WHO_MAY_CHANGE_A_RUN)
      expect(refused.said, 'the 403 does not say whose run it is').toContain('"lead-one"')
    }
    expect((await dataOf(run))['doing'], 'the refused change was written').toBe('what its own agent wrote')
  })

  it("3: not through a revision's restore, which the run's own agent may use", async () => {
    const run = await aRunningRun('lead-one')
    const changed = await ask('PATCH', `/api/records/${run}`, asAgent('lead-one'), { dataPatch: { doing: 'what its own agent wrote next' } })
    expect(changed.status, changed.said).toBe(200)
    const refused = await ask('POST', `/api/records/${run}/revisions/1/restore`, asAgent('worker-one'), {})
    expect(refused.status, refused.said).toBe(403)
    expect(refused.said).toContain(records.WHO_MAY_CHANGE_A_RUN)
    expect((await dataOf(run))['doing'], 'the refused restore was written').toBe('what its own agent wrote next')
    const restored = await ask('POST', `/api/records/${run}/revisions/1/restore`, asAgent('lead-one'), {})
    expect(restored.status, restored.said).toBe(200)
    expect((await dataOf(run))['doing']).toBe('what its own agent wrote')
  })

  it('4: its own agent, by its name through the record door and with its own key', async () => {
    const run = await aRunningRun('lead-one')
    const changed = await ask('PATCH', `/api/records/${run}`, asAgent('lead-one', run), { dataPatch: { doing: 'its own agent again' } })
    expect(changed.status, changed.said).toBe(200)
    expect(changedDirectlyBy(run, withItsOwnKey('lead-one'))).toBeNull()
  })

  it('5: the agent that filed it, as a launcher writes its served conditions and doing line with no run key', async () => {
    const run = await aRunningRun('the-worker', asAgent('the-launcher'))
    const changed = await ask('PATCH', `/api/records/${run}`, asAgent('the-launcher', run), { dataPatch: { served: SERVED, doing: 'the command ended' } })
    expect(changed.status, changed.said).toBe(200)
    expect(await dataOf(run)).toMatchObject({ served: SERVED, doing: 'the command ended' })
    expect(changedDirectlyBy(run, withItsOwnKey('the-launcher'))).toBeNull()
  })

  it("6: the agent that started the run's agent", async () => {
    const run = await aRunningRun('worker-two')
    const changed = await ask('PATCH', `/api/records/${run}`, asAgent('lead-two'), { dataPatch: { doing: 'its starter wrote this' } })
    expect(changed.status, changed.said).toBe(200)
    expect((await dataOf(run))['doing']).toBe('its starter wrote this')
  })

  it('7: a secretary, changing it and ending it through the record door', async () => {
    const run = await aRunningRun('lead-one')
    const changed = await ask('PATCH', `/api/records/${run}`, asAgent('sec-one'), { dataPatch: { doing: 'the secretary looked at it' } })
    expect(changed.status, changed.said).toBe(200)
    const ended = await ask('PATCH', `/api/records/${run}`, asAgent('sec-one'), { dataPatch: { state: 'crashed', detail: 'settled by the secretary' } })
    expect(ended.status, ended.said).toBe(200)
    expect(await dataOf(run)).toMatchObject({ state: 'crashed', doing: 'the secretary looked at it' })
  })

  it('8: the person from inside the office or with their key, and not their name with no key where the window covers it', async () => {
    const run = await aRunningRun('lead-one')
    const changed = await ask('PATCH', `/api/records/${run}`, THEM, { dataPatch: { doing: 'the person wrote this' } })
    expect(changed.status, changed.said).toBe(200)
    expect(changedDirectlyBy(run, { type: 'human', id: THE_PERSON, from: 'this machine', provedBy: 'the-person-key' })).toBeNull()
    const before = (await dataOf(run))['doing']
    const refused = changedDirectlyBy(run, { type: 'human', id: THE_PERSON, from: 'this machine', theKeyWindowCovers: true })
    expect(refused?.status, refused?.said).toBe(403)
    expect(refused?.said).toContain(records.ONLY_THE_PERSONS_KEY_PROVES_A_CLAIM)
    expect((await dataOf(run))['doing'], 'the refused change was written').toBe(before)
  })

  it("9: the office: a system writer, its own writer by its name, and a caller with the office's key", async () => {
    const run = await aRunningRun('lead-one')
    expect(changedDirectlyBy(run, { type: 'system', id: 'mole-office' })).toBeNull()
    expect(changedDirectlyBy(run, { type: 'agent', id: 'mole-office/the-message-worker', from: 'this machine' })).toBeNull()
    expect(changedDirectlyBy(run, { type: 'agent', id: 'an-office-tool', from: 'this machine', provedBy: 'the-office-key' })).toBeNull()
  })

  it("10: not a write the record door does not carry, as the office's sweeps write runs in a caller's name", async () => {
    const run = await aRunningRun('lead-one')
    expect(changedDirectlyBy(run, withItsOwnKey('worker-one'), false)).toBeNull()
    expect((await dataOf(run))['doing']).toBe('written by agent worker-one')
  })

  it("11: a field another guard answered is left to it: with the end's switch off, a stranger's end alone is written", async () => {
    const setting = String(gateNamed('who-ends-a-run')?.setting)
    t.client.sqlite.prepare('INSERT INTO runtime_settings (name,value) VALUES (?,?)').run(setting, 'off')
    try {
      const withMore = await aRunningRun('lead-one')
      const refused = await ask('PATCH', `/api/records/${withMore}`, asAgent('stranger-one'), { dataPatch: { state: 'crashed', doing: 'ended by somebody else' } })
      expect(refused.status, refused.said).toBe(403)
      expect(refused.said).toContain(records.WHO_MAY_CHANGE_A_RUN)
      expect(await dataOf(withMore), 'the refused write was stored').toMatchObject({ state: 'running', doing: 'what its own agent wrote' })
      const alone = await aRunningRun('lead-one')
      const ended = await ask('PATCH', `/api/records/${alone}`, asAgent('stranger-one'), { dataPatch: { state: 'crashed' } })
      expect(ended.status, ended.said).toBe(200)
      expect((await dataOf(alone))['state']).toBe('crashed')
    } finally {
      t.client.sqlite.prepare('DELETE FROM runtime_settings WHERE name = ?').run(setting)
    }
  })
})

describe("a new run that carries another agent's conversation", () => {
  /** The key each registration below answered, by handle. Never printed: an assertion says only whether it is a key. */
  const keyOf = new Map<string, string>()
  let officeKey = ''
  let personKey = ''
  /** The key a run's discovery stamp is kept under, read from the code that writes it. */
  let stampKey = ''
  /** The supervisor's run and that run's key, and the run of the worker it started, which names `workersTalk`. */
  let supervisorsRun = ''
  let supervisorsRunKey = ''
  let workersRun = ''
  const workersTalk = randomUUID()

  const isAKey = (value: string): boolean => /^[0-9a-f]{64}$/.test(value)
  const withKey = (headers: Record<string, string>, key: string): Record<string, string> => ({ ...headers, 'x-mole-office-key': key })
  /** An agent's own headers with its own key, and a session header where one is given. */
  const asItself = (handle: string, session?: string): Record<string, string> => withKey(asAgent(handle, session), keyOf.get(handle) ?? '')

  /** The discovery stamp the session hook writes, naming `conversation`. Its log path is made up and names no file. */
  const stampNaming = (conversation: string): Record<string, unknown> => ({
    extra: { [stampKey]: { tool: 'claude-code', externalId: conversation, logPath: `/made-up-for-a-test/${conversation}.jsonl` } },
  })

  /** A running run filed with `headers` and carrying `data`: the answer, the run's id and any run key it was minted. */
  async function filed(headers: Record<string, string>, data: Record<string, unknown>): Promise<{ status: number; said: string; id: string; runKey: string }> {
    const made = await ask('POST', '/api/records', headers, { kind: 'session', title: 'a run that names a conversation', data: { state: 'running', ...data } })
    return { status: made.status, said: made.said, id: String(made.body['record']?.id ?? ''), runKey: String(made.body['runKey']?.key ?? '') }
  }

  /** How many live runs, in every project, name `conversation` in either place a run names one. */
  function runsNaming(conversation: string): number {
    const row = t.client.sqlite
      .prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'session' AND deleted_at IS NULL AND (json_extract(data, '$.providerSession') = ? OR json_extract(data, ?) = ?)")
      .get(conversation, `$.extra.${stampKey}.externalId`, conversation) as { n: number }
    return row.n
  }

  /** A change to `run` by PATCH /api/records/<id>, sending `dataPatch` with `headers`. */
  const patched = (run: string, headers: Record<string, string>, dataPatch: Record<string, unknown>) => ask('PATCH', `/api/records/${run}`, headers, { dataPatch })

  /** The same, which must be written. */
  async function written(run: string, headers: Record<string, string>, dataPatch: Record<string, unknown>): Promise<void> {
    const done = await patched(run, headers, dataPatch)
    expect(done.status, done.said).toBe(200)
  }

  /** A refusal of the new run: 403, its words name the conversation, the other run, whose it is and who asked. */
  function expectRefused(refused: { status: number; said: string }, conversation: string, otherRun: string, whose: string, asker: string): void {
    expect(refused.status, refused.said).toBe(403)
    expect(refused.said).toContain(records.WHO_MAY_CARRY_ANOTHER_AGENTS_CONVERSATION)
    expect(refused.said, 'the 403 does not name the conversation').toContain(`"${conversation}"`)
    expect(refused.said, 'the 403 does not name the run that names it').toContain(otherRun)
    expect(refused.said, 'the 403 does not say whose run it is').toContain(`"${whose}"`)
    expect(refused.said, 'the 403 does not say who asked').toContain(`"${asker}"`)
  }

  beforeAll(async () => {
    const keys = JSON.parse(readFileSync(join(dirname(t.file), 'keys.json'), 'utf8')) as { person: string; office: string }
    officeKey = keys.office
    personKey = keys.person
    stampKey = (await import('../src/shared/discovery-stamp.ts')).DISCOVERY_KEY
    for (const handle of ['talker-a', 'talker-b', 'keyed-launcher']) keyOf.set(handle, await registered(handle, 'worker'))
    // A SUPERVISOR AND THE WORKER IT STARTED: the launcher files the supervisor's run, which mints that run its key. The
    // supervisor registers its worker with its own key and files the worker's run with the run key.
    keyOf.set('keyed-supervisor', await registered('keyed-supervisor', 'worker', asItself('keyed-launcher')))
    const supervisors = await filed(asItself('keyed-launcher'), { servingAgent: 'keyed-supervisor' })
    expect(supervisors.status, supervisors.said).toBe(201)
    expect(isAKey(supervisors.runKey), "the supervisor's run was minted no key").toBe(true)
    supervisorsRun = supervisors.id
    supervisorsRunKey = supervisors.runKey
    expect([...keyOf.values()].every(isAKey), 'a registration answered no key').toBe(true)
    await registered('keyed-worker', null, asItself('keyed-supervisor'))
    const workers = await filed(withKey(asAgent('keyed-supervisor', supervisorsRun), supervisorsRunKey), {
      servingAgent: 'keyed-worker',
      parentAttachment: supervisorsRun,
      providerSession: workersTalk,
    })
    expect(workers.status, workers.said).toBe(201)
    workersRun = workers.id
  })

  it("12: not another agent's conversation from an agent's own key, with or without its own run in the session header", async () => {
    const talk = randomUUID()
    const theirs = await filed(THEM, { servingAgent: 'talker-a', providerSession: talk })
    expect(theirs.status, theirs.said).toBe(201)
    const own = await filed(asItself('talker-b'), { servingAgent: 'talker-b' })
    expect(own.status, own.said).toBe(201)
    for (const headers of [asItself('talker-b'), asItself('talker-b', own.id)]) {
      expectRefused(await filed(headers, { servingAgent: 'talker-b', providerSession: talk }), talk, theirs.id, 'talker-a', 'talker-b')
    }
    expect(runsNaming(talk), 'a refused run was filed').toBe(1)
  })

  it("13: not where a discovery stamp names the conversation, on the other agent's own filing or on the new run", async () => {
    const talk = randomUUID()
    // AS THE SESSION HOOK FILES A RUN: with the agent's own key, naming no agent, and naming its conversation in
    // providerSession and in its stamp.
    const theirs = await filed(asItself('talker-a'), { runtime: 'claude-code', providerSession: talk, ...stampNaming(talk) })
    expect(theirs.status, theirs.said).toBe(201)
    expectRefused(await filed(asItself('talker-b'), { servingAgent: 'talker-b', providerSession: talk }), talk, theirs.id, 'talker-a', 'talker-b')
    expectRefused(await filed(asItself('talker-b'), { runtime: 'claude-code', ...stampNaming(talk) }), talk, theirs.id, 'talker-a', 'talker-b')
    expect(runsNaming(talk), 'a refused run was filed').toBe(1)
    // A STORED RUN THAT NAMES ITS CONVERSATION IN ITS STAMP ALONE, so only a search of the stored stamps finds it.
    const other = randomUUID()
    const stampOnly = await filed(THEM, { servingAgent: 'talker-a', ...stampNaming(other) })
    expect(stampOnly.status, stampOnly.said).toBe(201)
    expectRefused(await filed(asItself('talker-b'), { servingAgent: 'talker-b', providerSession: other }), other, stampOnly.id, 'talker-a', 'talker-b')
    expect(runsNaming(other), 'a refused run was filed').toBe(1)
  })

  it('14: its own conversation from its own key, while its run runs and after it has ended, as the session hook files', async () => {
    const talk = randomUUID()
    const first = await filed(asItself('talker-a'), { runtime: 'claude-code', providerSession: talk, ...stampNaming(talk) })
    expect(first.status, first.said).toBe(201)
    const again = await filed(asItself('talker-a'), { runtime: 'claude-code', providerSession: talk, ...stampNaming(talk) })
    expect(again.status, again.said).toBe(201)
    for (const run of [first.id, again.id]) {
      const ended = await ask('PATCH', `/api/records/${run}`, asItself('talker-a'), { dataPatch: { state: 'crashed' } })
      expect(ended.status, ended.said).toBe(200)
    }
    const resumed = await filed(asItself('talker-a'), { runtime: 'claude-code', providerSession: talk, ...stampNaming(talk) })
    expect(resumed.status, resumed.said).toBe(201)
    expect(runsNaming(talk)).toBe(3)
  })

  it("15: from the office's key and the person's key, and a run of no agent's conversation from any agent's key", async () => {
    const talk = randomUUID()
    const theirs = await filed(THEM, { servingAgent: 'talker-a', providerSession: talk })
    expect(theirs.status, theirs.said).toBe(201)
    const byTheOffice = await filed(withKey(asAgent('mole-office/the-message-worker'), officeKey), { servingAgent: 'talker-a', providerSession: talk })
    expect(byTheOffice.status, byTheOffice.said).toBe(201)
    const byThePerson = await filed(withKey(THEM, personKey), { servingAgent: 'talker-a', providerSession: talk })
    expect(byThePerson.status, byThePerson.said).toBe(201)
    const nobodys = randomUUID()
    const ofNoAgent = await filed(THEM, { runtime: 'claude-code', providerSession: nobodys })
    expect(ofNoAgent.status, ofNoAgent.said).toBe(201)
    const carried = await filed(asItself('talker-b'), { servingAgent: 'talker-b', providerSession: nobodys })
    expect(carried.status, carried.said).toBe(201)
  })

  it("16: a supervisor's run key acting for the worker it started, with the worker's own conversation", async () => {
    const actingFor = withKey(asAgent('keyed-worker', workersRun), supervisorsRunKey)
    const again = await filed(actingFor, { servingAgent: 'keyed-worker', parentAttachment: supervisorsRun, providerSession: workersTalk })
    expect(again.status, again.said).toBe(201)
    expect(runsNaming(workersTalk)).toBe(2)
  })

  it("17: not a run the office files in a caller's name, as discovery files a conversation it read off this computer", async () => {
    const talk = randomUUID()
    const theirs = await filed(THEM, { servingAgent: 'talker-a', providerSession: talk })
    expect(theirs.status, theirs.said).toBe(201)
    const write = (bindCallerSession: boolean): string | null => {
      try {
        records.createRecordWithReport({
          workspaceId: 'default',
          kind: 'session',
          title: 'a conversation read off this computer',
          data: { runtime: 'claude-code', ...stampNaming(talk) },
          actor: withItsOwnKey('talker-b'),
          bindCallerSession,
        })
        return null
      } catch (refused) {
        return `${(refused as { status?: number }).status} ${String((refused as Error).message)}`
      }
    }
    expect(write(false), "the office's own filing in the caller's name was refused").toBeNull()
    expect(write(true), "the caller's own filing was not refused").toContain(records.WHO_MAY_CARRY_ANOTHER_AGENTS_CONVERSATION)
    expect(runsNaming(talk)).toBe(2)
  })

  it("18: a run discovery filed in a caller's name is not the caller's own: the owner files its conversation, and the caller does not", async () => {
    const sessions = await import('../src/server/lib/sessions.ts')
    const talk = randomUUID()
    // A MADE-UP HOME FOLDER WITH ONE MADE-UP TRANSCRIPT IN IT, so the sweep reads this conversation and no other.
    const home = mkdtempSync(join(tmpdir(), 'mole-office-a-run-filed-in-a-callers-name-'))
    try {
      const folder = join(home, '.claude', 'projects', '-made-up-project')
      mkdirSync(folder, { recursive: true })
      const line = { parentUuid: null, isSidechain: false, type: 'user', message: { role: 'user', content: 'made-up' }, timestamp: new Date(Date.now() - 60 * 60_000).toISOString(), userType: 'external', entrypoint: 'cli', cwd: '/made-up-project', version: '2.1.223' }
      writeFileSync(join(folder, `${talk}.jsonl`), `${JSON.stringify(line)}\n`)
      const env: AdapterEnv = { homeDir: home, now: new Date(), scanProcesses: () => ({ ok: true, processes: [] }), runningWithinSeconds: 5 * 60, orphanAfterSeconds: 6 * 60 * 60 }
      const found = sessions.getSession(`claude-code:${talk}`, 'default', env)
      expect(found, 'the sweep did not find the made-up transcript').not.toBeNull()
      // AS A SWEEP talker-b ASKED FOR FILES WHAT IT FOUND: in talker-b's name, proved by talker-b's own key.
      expect(sessions.ensureSessionRecord(found!, withItsOwnKey('talker-b'), 'default', env).created).toBe(true)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
    const owners = await filed(asItself('talker-a'), { runtime: 'claude-code', providerSession: talk, ...stampNaming(talk) })
    const callers = await filed(asItself('talker-b'), { runtime: 'claude-code', ...stampNaming(talk) })
    expect({ owners: owners.status, callers: callers.status }, `${owners.said}\n${callers.said}`).toEqual({ owners: 201, callers: 403 })
    expectRefused(callers, talk, owners.id, 'talker-a', 'talker-b')
    expect(runsNaming(talk), 'the runs filed are not the sweep\'s and the owner\'s').toBe(2)
  })

  it("19: not another agent's conversation written by PATCH onto its own run, in providerSession or in a discovery stamp", async () => {
    const talk = randomUUID()
    const theirs = await filed(THEM, { servingAgent: 'talker-a', providerSession: talk })
    expect(theirs.status, theirs.said).toBe(201)
    // AS A LAUNCHER FILES A RUN: serving the agent, and naming no conversation until the agent's session hook writes one.
    const own = await filed(THEM, { servingAgent: 'talker-b' })
    expect(own.status, own.said).toBe(201)
    for (const headers of [asItself('talker-b'), asItself('talker-b', own.id)]) {
      for (const dataPatch of [{ providerSession: talk }, stampNaming(talk)]) {
        const refused = await patched(own.id, headers, dataPatch)
        expectRefused(refused, talk, theirs.id, 'talker-a', 'talker-b')
        expect(refused.said, 'the 403 does not name the run the write would change').toContain(own.id)
      }
    }
    const stored = await dataOf(own.id)
    const stamp = (stored['extra'] as Record<string, unknown> | undefined)?.[stampKey]
    expect({ providerSession: stored['providerSession'], stamp }, 'a refused write was stored').toEqual({ providerSession: undefined, stamp: undefined })
    expect(runsNaming(talk), 'a refused write was stored').toBe(1)
  })

  it("20: its own conversation and a run of no agent's by PATCH from its own key; another agent's from the office's and the person's", async () => {
    const talk = randomUUID()
    const first = await filed(asItself('talker-a'), { runtime: 'claude-code', providerSession: talk, ...stampNaming(talk) })
    expect(first.status, first.said).toBe(201)
    // AS THE SESSION HOOK WRITES ITS CONVERSATION onto the run a launcher filed for it, in either place, and a new one
    // when it takes the run over.
    const resumed = await filed(THEM, { servingAgent: 'talker-a' })
    const stamped = await filed(THEM, { servingAgent: 'talker-a' })
    await written(resumed.id, asItself('talker-a', resumed.id), { providerSession: talk })
    await written(stamped.id, asItself('talker-a', stamped.id), stampNaming(talk))
    await written(stamped.id, asItself('talker-a', stamped.id), stampNaming(randomUUID()))
    const nobodys = randomUUID()
    const ofNoAgent = await filed(THEM, { runtime: 'claude-code', providerSession: nobodys })
    expect(ofNoAgent.status, ofNoAgent.said).toBe(201)
    const carrying = await filed(THEM, { servingAgent: 'talker-b' })
    await written(carrying.id, asItself('talker-b', carrying.id), { providerSession: nobodys })
    // talker-a's conversation, written onto talker-b's runs by the office and by the person, as the message worker
    // brings an agent back.
    const byTheOffice = await filed(THEM, { servingAgent: 'talker-b' })
    const byThePerson = await filed(THEM, { servingAgent: 'talker-b' })
    await written(byTheOffice.id, withKey(asAgent('mole-office/the-message-worker'), officeKey), { providerSession: talk })
    await written(byThePerson.id, withKey(THEM, personKey), { providerSession: talk })
    // A WRITE THAT NAMES NO NEW CONVERSATION, the stored one sent back beside it, is talker-b's own to make.
    await written(byThePerson.id, asItself('talker-b', byThePerson.id), { doing: 'what its own agent wrote', providerSession: talk })
    // The stamped run names the conversation it was taken over for, and no longer talker-a's first one.
    expect(runsNaming(talk)).toBe(4)
  })

  it("21: a first revision stamped with no providerSession, or carrying discovery's mark, is not its filer's own", async () => {
    // AS DISCOVERY FILED A RUN IN A CALLER'S NAME BEFORE IT WROTE ITS MARK: by the caller's own key, naming no agent,
    // and naming the conversation in its stamp and nowhere else.
    const talk = randomUUID()
    const unmarked = await filed(asItself('talker-b'), { runtime: 'claude-code', ...stampNaming(talk) })
    expect(unmarked.status, unmarked.said).toBe(201)
    const owners = await filed(asItself('talker-a'), { runtime: 'claude-code', providerSession: talk, ...stampNaming(talk) })
    expect(owners.status, owners.said).toBe(201)
    expectRefused(await filed(asItself('talker-b'), { servingAgent: 'talker-b', providerSession: talk }), talk, owners.id, 'talker-a', 'talker-b')
    // A FIRST REVISION WHOSE STAMP CARRIES DISCOVERY'S MARK beside a providerSession. The fixture's own check reads the
    // mark by the code that reads it, so a renamed mark fails here and not as a pass.
    const sessions = await import('../src/shared/discovery-stamp.ts')
    const marked = randomUUID()
    const stamp = (stampNaming(marked)['extra'] as Record<string, Record<string, unknown>>)[stampKey]
    const markedData = { runtime: 'claude-code', providerSession: marked, extra: { [stampKey]: { ...stamp, filedInACallersName: true } } }
    expect(sessions.discoveryFiledItInACallersName(markedData), 'the fixture does not carry the mark the code reads').toBe(true)
    const markedRun = await filed(asItself('talker-b'), markedData)
    expect(markedRun.status, markedRun.said).toBe(201)
    const markedOwners = await filed(asItself('talker-a'), { runtime: 'claude-code', providerSession: marked, ...stampNaming(marked) })
    expect(markedOwners.status, markedOwners.said).toBe(201)
    expect({ unmarked: runsNaming(talk), marked: runsNaming(marked) }, 'a refused run was filed').toEqual({ unmarked: 2, marked: 2 })
  })
})
