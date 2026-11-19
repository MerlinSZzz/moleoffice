// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S NAME WITH NO KEY DOES NOT ANSWER FOR A RUN, over a real listener, even while the key window is open.
 *
 * Three guards on a run's own facts ask who answers for the run: its served conditions (`assertMayWriteServed`), its
 * end (`assertMayEndARun`) and any other change to its data (`assertMayChangeARun`), all in src/server/lib/records.ts.
 * Each admits an agent that answers for the run, which is the run's own agent, the agent that started the agent it
 * serves, or the agent that filed it (`anAgentThatAnswersForTheRun`). While the key window is open, a listener carries
 * a request that only names an agent, so the name alone used to be taken: a program on this computer, or in a sandbox,
 * could write a run's served conditions, end it, or change what it says it is doing, by sending the name of the run's
 * own agent. The name is now taken only when a key proves the request, or when no listener carried the call.
 *
 * A key proves it in three ways, and each still writes: the run's own key under its agent's name, as the launcher and
 * the stop hook send it; the office's key under the name of its own worker, as the message worker sends it on a run it
 * filed; and the agent's own key. A call no listener carried is the office's own code, and it still writes too.
 *
 * Every key here is made up, and the office is a fresh test office with its key window open. Each case has one expect,
 * on an object of everything it reads, so the diff of a red run shows every part a mutation changed.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. The run's own agent by its name with no key, from this computer and from a sandbox, does not write the run's
 *      served conditions. The refusal says that only a key makes the claim count, and nothing is stored.
 *   2. The same name does not end the run, in the end's own words, and the run is still running.
 *   3. The same name does not change the run's doing line, in the words of who may change a run, and the line is as
 *      it was.
 *   4. The agent that started the run's agent, and the agent that filed the run, each by its name with no key, do not
 *      write the run's served conditions either.
 *   5. These still write the served conditions: the run's own key under its agent's name; the office's key under its
 *      worker's name, on a run the worker filed; and the run's own agent by its name from inside the office, where no
 *      listener carried the call.
 *   6. A stranger with no key is refused as before, and its refusal does not say that a key would make its claim
 *      count, because it answers for the run under no name.
 *   7. The key of one run of an agent writes another running run of the same agent when its session header names
 *      the key's own run or no run, because the guard on a run's end asks only whether the caller answers for the
 *      run. The write is taken with a reminder: the answer carries the sentence from
 *      src/server/lib/the-run-a-key-holds.ts naming the key's run and the run it wrote, and the written run carries
 *      one line saying which run's key wrote it and when, once for the pair. A revision's restore is the same write
 *      by another door, and it carries the same reminder and the same one line. It is refused when the header names
 *      the run it finishes, by the rule on a session header (src/server/lib/the-run-a-key-holds.ts), and the run the
 *      key is for still runs.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the report of the run that added this file)
 * ---------------------------------------------------------------------------------------
 *
 *   - the key not asked by `anAgentThatAnswersForTheRun`: cases 1, 2, 3 and 4 go red, each on its answer, its words
 *     and what was stored;
 *   - every agent's name taken for every run: cases 1, 2, 3, 4 and 6 go red, case 6 on its answer;
 *   - the key asked only of the run's own agents, not of its starter or its filer: case 4 goes red;
 *   - a call no listener carried no longer taken: case 5 goes red on the write from inside the office;
 *   - the office's key no longer taken: case 5 goes red on the worker's write;
 *   - an agent's key no longer taken: case 5 goes red on the run's own key, and case 7 on the two finishes that do not
 *     name the run they finish;
 *   - the sentence about the key left out of the served conditions' refusal: cases 1 and 4 go red; of the end's:
 *     case 2; of the change's: case 3;
 *   - the end's refusal no longer in the words of who may end a run: case 2 goes red; the change's no longer in the
 *     words of who may change one: case 3;
 *   - the sentence said to every agent with no key, whatever its name: case 6 goes red;
 *   - a run's end taken from a key only when the session header names the run it ends: case 7 goes red on the two
 *     finishes that do not name it;
 *   - the restore door not asking for the run-key binding: case 7 goes red on the restore's reminder and its one line.
 */

import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')

/** Made-up keys, written before the server is built, so the office's own worker proves itself with the office's key. */
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')

const OWN_AGENT = 'a-run-of-its-own'
const THE_LAUNCHER = 'a-launcher'
const THE_MIDDLE = 'a-middle-agent'
const THE_WORKER = 'a-worker-two-below'
const A_STRANGER = 'a-stranger'
const SERVED = { model: 'a-made-up-model', temperature: 0.1, briefBytes: 10, contextTokens: { largestTurn: 1, total: 2 } }

let t: TestDb
let app: FastifyInstance
let api = ''
let res: ResourcesLib
/** The records library, loaded after the test's own database is made, because it opens one. */
let records: typeof import('../src/server/lib/records.ts')
const ids: Record<string, string> = {}

const WORKSPACE = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default' }
const AS_THE_PERSON = { ...WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

/** An agent's name and nothing that proves it, with the run named in the session header when one is given. */
const byName = (handle: string, session?: string): Record<string, string> => ({
  ...WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  ...(session === undefined ? {} : { 'x-mole-office-session': session }),
})

/** The office's own worker: its name, and the office's key. */
const AS_THE_OFFICE_WORKER = { ...byName('mole-office/the-message-worker'), 'x-mole-office-key': A_MADE_UP_OFFICE_KEY }

/** A stand-in for the machine that answers who sent a connection: a program inside another container. */
function aSandboxSendsIt(): ResourcesLib['LINUX_PROBE'] {
  const probe = Object.create(res.LINUX_PROBE) as ResourcesLib['LINUX_PROBE']
  Object.assign(probe, { senderOfAConnection: () => ({ uid: process.getuid?.() ?? 0, pid: 4242, inAnotherContainer: true }) })
  return probe
}

/** What a door answered, with its refusal words when it refused. */
async function answerOf(reply: Response): Promise<{ status: number; said: string; body: unknown }> {
  const text = await reply.text()
  let body: unknown = null
  try {
    body = JSON.parse(text) as unknown
  } catch {
    body = null
  }
  const said = body !== null && typeof body === 'object' && 'error' in body ? String((body as { error?: unknown }).error) : text
  return { status: reply.status, said, body }
}

/** A PATCH of a run over the listener, on a connection of its own, from a sandbox when `fromASandbox` says so. */
async function sentOverTheListener(
  run: string,
  headers: Record<string, string>,
  dataPatch: Record<string, unknown>,
  fromASandbox = false,
): Promise<{ status: number; said: string; body: unknown }> {
  if (fromASandbox) res.useOsProbe(aSandboxSendsIt())
  try {
    return await answerOf(await fetch(`${api}/api/records/${run}`, { method: 'PATCH', headers: { ...headers, connection: 'close' }, body: JSON.stringify({ dataPatch }) }))
  } finally {
    res.useOsProbe(res.LINUX_PROBE)
  }
}

/** A restore of one revision over the listener, on a connection of its own: the same write as a PATCH, by another door. */
async function restoredOverTheListener(
  run: string,
  seq: number,
  headers: Record<string, string>,
): Promise<{ status: number; said: string; body: unknown }> {
  return await answerOf(await fetch(`${api}/api/records/${run}/revisions/${seq}/restore`, { method: 'POST', headers: { ...headers, connection: 'close' }, body: JSON.stringify({}) }))
}

/** A running run of the agent `servingId`, filed from inside the office with these headers, and its key if one was minted. */
async function aRunningRun(servingId: string, filer: Record<string, string>): Promise<{ id: string; key: string }> {
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: filer,
    payload: { kind: 'session', title: 'a made-up run', data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: servingId, doing: 'what its own agent wrote' } },
  })
  expect(filed.statusCode, filed.body.slice(0, 300)).toBe(201)
  const body = filed.json() as { record: { id: string }; runKey?: { key?: string } }
  return { id: body.record.id, key: String(body.runKey?.key) }
}

function dataOf(run: string): Record<string, unknown> {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run) as { data: string }
  return JSON.parse(row.data) as Record<string, unknown>
}

/** Register an agent from inside the office, by the person or by the agent that starts it. */
async function registered(handle: string, by: Record<string, string>): Promise<void> {
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: by, payload: { handle, name: handle } })
  expect(made.statusCode, made.body.slice(0, 300)).toBeLessThan(300)
  const listed = (await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_PERSON })).json() as { agents?: { id: string; handle: string }[] }
  ids[handle] = one((listed.agents ?? []).filter((a) => a.handle === handle), `the registry row for ${handle}`).id
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  res = await import('../src/server/lib/resources.ts')
  records = await import('../src/server/lib/records.ts')
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const withTheirKey = { ...AS_THE_PERSON, 'x-mole-office-key': A_MADE_UP_PERSON_KEY }
  await registered(OWN_AGENT, withTheirKey)
  await registered(A_STRANGER, withTheirKey)
  await registered(THE_LAUNCHER, withTheirKey)
  // TWO RUNGS BELOW the launcher, so what lets it answer for the worker's run is that it filed it, and the middle agent
  // answers for it as the agent that started the worker.
  await registered(THE_MIDDLE, byName(THE_LAUNCHER))
  await registered(THE_WORKER, byName(THE_MIDDLE))
}, 60_000)

afterAll(async () => {
  res?.useOsProbe(res.LINUX_PROBE)
  await app?.close()
  t?.close()
})

describe("an agent's name with no key, over a listener, while the key window is open", () => {
  it("1: the run's own agent does not write its served conditions, from this computer or from a sandbox", async () => {
    const seen: Record<string, unknown> = {}
    const said: string[] = []
    for (const fromASandbox of [false, true]) {
      const run = await aRunningRun(ids[OWN_AGENT]!, AS_THE_OFFICE_WORKER)
      const refused = await sentOverTheListener(run.id, byName(OWN_AGENT, run.id), { served: SERVED }, fromASandbox)
      said.push(refused.said)
      seen[fromASandbox ? 'a sandbox' : 'this computer'] = {
        status: refused.status,
        saysOnlyAKeyCounts: refused.said.includes(records.ONLY_A_KEY_PROVES_AN_AGENTS_CLAIM),
        stored: Object.hasOwn(dataOf(run.id), 'served'),
      }
    }
    const refusedAndNothingStored = { status: 403, saysOnlyAKeyCounts: true, stored: false }
    expect(seen, said.join(' | ')).toEqual({ 'this computer': refusedAndNothingStored, 'a sandbox': refusedAndNothingStored })
  })

  it("2: the run's own agent does not end the run", async () => {
    const run = await aRunningRun(ids[OWN_AGENT]!, AS_THE_OFFICE_WORKER)
    const refused = await sentOverTheListener(run.id, byName(OWN_AGENT, run.id), { state: 'crashed' })
    expect({
      status: refused.status,
      saysWhoMayEndARun: refused.said.includes(records.WHO_MAY_END_A_RUN),
      saysOnlyAKeyCounts: refused.said.includes(records.ONLY_A_KEY_PROVES_AN_AGENTS_CLAIM),
      state: dataOf(run.id)['state'],
    }, refused.said).toEqual({ status: 403, saysWhoMayEndARun: true, saysOnlyAKeyCounts: true, state: 'running' })
  })

  it("3: the run's own agent does not change its doing line", async () => {
    const run = await aRunningRun(ids[OWN_AGENT]!, AS_THE_OFFICE_WORKER)
    const refused = await sentOverTheListener(run.id, byName(OWN_AGENT, run.id), { doing: 'rewritten by a name alone' })
    expect({
      status: refused.status,
      saysWhoMayChangeARun: refused.said.includes(records.WHO_MAY_CHANGE_A_RUN),
      saysOnlyAKeyCounts: refused.said.includes(records.ONLY_A_KEY_PROVES_AN_AGENTS_CLAIM),
      doing: dataOf(run.id)['doing'],
    }, refused.said).toEqual({ status: 403, saysWhoMayChangeARun: true, saysOnlyAKeyCounts: true, doing: 'what its own agent wrote' })
  })

  it('4: the agent that started the run\'s agent, and the agent that filed the run, do not write its served conditions', async () => {
    const run = await aRunningRun(ids[THE_WORKER]!, byName(THE_LAUNCHER))
    const seen: Record<string, unknown> = {}
    const said: string[] = []
    for (const handle of [THE_MIDDLE, THE_LAUNCHER]) {
      const refused = await sentOverTheListener(run.id, byName(handle, run.id), { served: SERVED })
      said.push(`${handle}: ${refused.said}`)
      seen[handle] = { status: refused.status, saysOnlyAKeyCounts: refused.said.includes(records.ONLY_A_KEY_PROVES_AN_AGENTS_CLAIM) }
    }
    seen['stored'] = Object.hasOwn(dataOf(run.id), 'served')
    const refused = { status: 403, saysOnlyAKeyCounts: true }
    expect(seen, said.join(' | ')).toEqual({ [THE_MIDDLE]: refused, [THE_LAUNCHER]: refused, stored: false })
  })

  it("5: the run's key, the office's worker with the office's key, and a call no listener carried still write them", async () => {
    // A RUN WITH NO KEY MINTED sends the key "undefined", which no key matches, so that write is refused and this
    // case goes red rather than proving nothing.
    const withItsKey = await aRunningRun(ids[OWN_AGENT]!, AS_THE_OFFICE_WORKER)
    const byTheRunsKey = await sentOverTheListener(withItsKey.id, { ...byName(OWN_AGENT, withItsKey.id), 'x-mole-office-key': withItsKey.key }, { served: SERVED })
    const theWorkers = await aRunningRun(ids[OWN_AGENT]!, AS_THE_OFFICE_WORKER)
    const byTheWorker = await sentOverTheListener(theWorkers.id, AS_THE_OFFICE_WORKER, { served: SERVED })
    const inside = await aRunningRun(ids[OWN_AGENT]!, AS_THE_OFFICE_WORKER)
    const fromInside = await app.inject({ method: 'PATCH', url: `/api/records/${inside.id}`, headers: byName(OWN_AGENT, inside.id), payload: { dataPatch: { served: SERVED } } })
    expect({
      "the run's own key": { status: byTheRunsKey.status, stored: dataOf(withItsKey.id)['served'] },
      "the office's worker": { status: byTheWorker.status, stored: dataOf(theWorkers.id)['served'] },
      'from inside the office': { status: fromInside.statusCode, stored: dataOf(inside.id)['served'] },
    }, [byTheRunsKey.said, byTheWorker.said, fromInside.body].map((text) => text.slice(0, 300)).join(' | ')).toEqual({
      "the run's own key": { status: 200, stored: SERVED },
      "the office's worker": { status: 200, stored: SERVED },
      'from inside the office': { status: 200, stored: SERVED },
    })
  })

  it('6: a stranger with no key is refused, and is not told that a key would make its claim count', async () => {
    const run = await aRunningRun(ids[OWN_AGENT]!, AS_THE_OFFICE_WORKER)
    const refused = await sentOverTheListener(run.id, byName(A_STRANGER, run.id), { served: SERVED })
    expect({
      status: refused.status,
      saysOnlyAKeyCounts: refused.said.includes(records.ONLY_A_KEY_PROVES_AN_AGENTS_CLAIM),
    }, refused.said).toEqual({ status: 403, saysOnlyAKeyCounts: false })
  })

  it("7: one run's key writing another run of the same agent is taken with a reminder and one line", async () => {
    // A WORKER IN ANOTHER PROJECT (7 Nov 2026) sent a finish to an older run of its own agent with its new run's key, and
    // the office sealed the older run. The guard on a run's end asks whether the caller answers for the run, and a run
    // key proves its run's agent, which is the older run's own agent too. Only the rule on a session header ties a run
    // key to its own run, and it reads only the run the header names.
    //
    // THE WRITE IS STILL TAKEN. It is no longer taken silently: the answer names the two runs, and the run that was
    // written carries one line saying which run's key wrote it and when. One line for the pair however many times the
    // same pair writes.
    const { theRunKeyNoticeStarts, theRunKeyReminderSentence } = await import('../src/server/lib/the-run-a-key-holds.ts')
    const runB = await aRunningRun(ids[OWN_AGENT]!, AS_THE_OFFICE_WORKER)
    const withBsKey = (session?: string): Record<string, string> => ({ ...byName(OWN_AGENT, session), 'x-mole-office-key': runB.key })
    // WHAT EACH FINISH SUBMITS, filed by run B with its key, as the worker filed its report.
    const filed = await app.inject({ method: 'POST', url: '/api/records', headers: withBsKey(runB.id), payload: { kind: 'note', title: "run B's work", data: { body: 'filed by run B' } } })
    expect(filed.statusCode, filed.body.slice(0, 300)).toBe(201)
    const finish = { state: 'finished', submission: { kind: 'records', records: [(filed.json() as { record: { id: string } }).record.id] } }
    const reminderOf = (answer: { body: unknown }): string | undefined =>
      answer.body !== null && typeof answer.body === 'object' ? (answer.body as { runKeyReminder?: string }).runKeyReminder : undefined
    const reminderFor = (writtenRun: string): string => theRunKeyReminderSentence({ keyRun: runB.id, writtenRun })

    // THE SAME PAIR WRITES TWICE: a served condition and then the finish. Each answer reminds; the run carries one line.
    const twice = await aRunningRun(ids[OWN_AGENT]!, AS_THE_OFFICE_WORKER)
    const served = await sentOverTheListener(twice.id, withBsKey(runB.id), { served: SERVED })
    const finished = await sentOverTheListener(twice.id, withBsKey(runB.id), finish)
    const writtenRevisions = (await app.inject({ method: 'GET', url: `/api/records/${twice.id}/revisions`, headers: AS_THE_PERSON })).json() as {
      revisions: { note: string | null; at: string }[]
    }
    const notices = writtenRevisions.revisions.filter((one) => one.note !== null && one.note.startsWith(theRunKeyNoticeStarts(runB.id)))
    expect(
      {
        served: { status: served.status, reminder: reminderOf(served) },
        finish: { status: finished.status, state: dataOf(twice.id)['state'], reminder: reminderOf(finished) },
        lines: notices.length,
        lineStarts: (notices[0]?.note ?? '').startsWith(theRunKeyNoticeStarts(runB.id)),
        lineNamesTheWrittenRun: (notices[0]?.note ?? '').includes(`A session header naming run ${twice.id} would make this plain.`),
      },
      [served.said, finished.said].join(' | '),
    ).toEqual({
      served: { status: 200, reminder: reminderFor(twice.id) },
      finish: { status: 200, state: 'finished', reminder: reminderFor(twice.id) },
      lines: 1,
      lineStarts: true,
      lineNamesTheWrittenRun: true,
    })

    // A RESTORE IS THE SAME WRITE BY ANOTHER DOOR: a run key putting back an older revision of another run of its
    // agent is taken with the same reminder and the same one line.
    const putBackTarget = await aRunningRun(ids[OWN_AGENT]!, AS_THE_OFFICE_WORKER)
    const itsOwnChange = await app.inject({
      method: 'PATCH',
      url: `/api/records/${putBackTarget.id}`,
      headers: byName(OWN_AGENT, putBackTarget.id),
      payload: { dataPatch: { doing: 'written after the revision a restore names' } },
    })
    expect(itsOwnChange.statusCode, itsOwnChange.body.slice(0, 300)).toBe(200)
    const putBack = await restoredOverTheListener(putBackTarget.id, 1, withBsKey(runB.id))
    const putBackRevisions = (await app.inject({ method: 'GET', url: `/api/records/${putBackTarget.id}/revisions`, headers: AS_THE_PERSON })).json() as {
      revisions: { note: string | null; at: string }[]
    }
    const putBackNotices = putBackRevisions.revisions.filter((one) => one.note !== null && one.note.startsWith(theRunKeyNoticeStarts(runB.id)))
    expect(
      {
        status: putBack.status,
        doing: dataOf(putBackTarget.id)['doing'],
        reminder: reminderOf(putBack),
        lines: putBackNotices.length,
        lineNamesTheWrittenRun: (putBackNotices[0]?.note ?? '').includes(`A session header naming run ${putBackTarget.id} would make this plain.`),
      },
      putBack.said,
    ).toEqual({
      status: 200,
      doing: 'what its own agent wrote',
      reminder: reminderFor(putBackTarget.id),
      lines: 1,
      lineNamesTheWrittenRun: true,
    })

    const seen: Record<string, unknown> = {}
    const expected: Record<string, unknown> = {}
    const said: string[] = []
    for (const [sent, header] of [['naming no run', 'none'], ['naming the run it finishes', 'A']] as const) {
      const runA = await aRunningRun(ids[OWN_AGENT]!, AS_THE_OFFICE_WORKER)
      const answer = await sentOverTheListener(runA.id, withBsKey(header === 'A' ? runA.id : undefined), finish)
      said.push(`${sent}: ${answer.said.slice(0, 300)}`)
      seen[sent] = {
        status: answer.status,
        state: dataOf(runA.id)['state'],
        refusedAsRunBsKey: answer.status === 403 && answer.said.includes(runB.id),
        reminder: reminderOf(answer),
      }
      expected[sent] = {
        status: header === 'A' ? 403 : 200,
        state: header === 'A' ? 'running' : 'finished',
        refusedAsRunBsKey: header === 'A',
        reminder: header === 'A' ? undefined : reminderFor(runA.id),
      }
    }
    seen['run B'] = dataOf(runB.id)['state']
    expected['run B'] = 'running'
    expect(seen, said.join(' | ')).toEqual(expected)
  })
})
