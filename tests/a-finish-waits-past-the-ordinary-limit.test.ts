// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN'S FINISH IS WAITED FOR PAST THE ORDINARY OFFICE-TOOL LIMIT.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS FILE IS WRITTEN AGAINST
 * ---------------------------------------------------------------------------------------
 *
 * tools/office-request.mjs gave every request THE_LONGEST_WAIT_MS (60 seconds). A write that seals a run makes the
 * office read and hash every tracked file in the run's worktree. On 9 November 2026 one robotics worktree of 2.2 GB
 * and 8,836 files took about 101 seconds to seal; the office tool gave up at 60 seconds and told the run its write
 * "may or may not be stored" while the office finished the seal (REQUIREMENTS.md, the final FIRST item and its
 * addendum). The run's next act was to read back a write that had in fact been stored.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH WRITES MAY SEAL A RUN
 * ---------------------------------------------------------------------------------------
 *
 * The record door seals when a write leaves a session saying its work is finished (whetherThisWriteFinishesTheRun
 * and runSubmitsWork in src/server/lib/records.ts, aRunSaysItIsFinished in src/config/finished.mjs). A run says it is
 * finished with `state: "finished"`, or with a close it wrote itself (`closedHow: "agent-said"`) while its row is not
 * otherwise ended. The write may arrive as `dataPatch` or as a whole `data` replacement, on a PATCH of a record or on
 * a POST that files one. It may be this run's own finish, another run's finish by its authorized starter, or a run
 * filed already finished.
 *
 * CONSERVATIVE FINISH-SHAPED CLASSIFICATIONS, NOT CLAIMS THAT A SEAL HAPPENS. Two shapes are classified as possibly
 * sealing even though this build does not establish that they do:
 *   - `{state: "finished", closedHow: "went-stale"}`. aRunSaysItIsFinished reads the state first, so the helper says
 *     finished; but runSubmitsWork returns false for any data whose close is `went-stale`, so the office does not
 *     seal it.
 *   - A PATCH with both `dataPatch` and `data`, where either one says finished. whetherThisWriteFinishesTheRun reads
 *     both and either one is enough, but the HTTP door's schema refuses the pair ("Send data or dataPatch, not both")
 *     before the write path runs, and patchRecord's own guard refuses it after its finish check.
 * The tool cannot see the stored row or the door, so it takes the longer wait rather than miss a possible expensive
 * request. The extra wait only matters when the response stalls: a refusal or a quick answer returns as usual. It
 * does not claim the write sealed, can seal, or succeeded.
 *
 * THE SWEEP'S CLOSE. The office's own sweep writes `closedHow: "went-stale"` with no finished state, and that close
 * submits no work (runSubmitsWork). A write that carries that close alone is ordinary.
 *
 * THE CHANGE. A request shaped like one of those gets THE_LONGEST_FINISH_WAIT_MS. Every other request keeps
 * THE_LONGEST_WAIT_MS. A caller may name its own waits, and may stop the wait with its own AbortSignal. The tool still
 * sends the write once, and a wait that runs out still says the write may or may not be stored.
 *
 * THE TOOL CANNOT SEE THE STORED ROW, so a finish-shaped write the office in the end does not seal (a run already
 * released, a records-only submission at a level that seals nothing, a run whose close is went-stale) still gets the
 * longer wait. That costs time only when the office does not answer; it never changes what is sent, and a network or
 * timeout failure says nothing certain about whether the write was stored.
 *
 * MUTATIONS, EACH AFTER A CONTROL RUN:
 *   1. A finish gets the ordinary wait. Cases 1, 2, 7, 8, 9, 10 and 11 go red.
 *   2. Every request gets the finish wait. Cases 1 and 3 go red.
 *   3. The caller's own signal is not joined to the tool's. Case 5 goes red.
 *   4. The finish wait is raised for the answer's length too. Case 6 goes red.
 *   5. A write that did not answer no longer says it may or may not be stored. Cases 3, 4 and 5 go red.
 *   6. The wait is chosen for this run's own finish only, as the first draft did. Cases 1, 7, 8, 10 and 11 go red.
 *   7. A close the office's sweep wrote is read as a finish. Case 1 goes red.
 *   8. A stale close is read before the state, as the first draft did. Cases 1, 9, 10 and 11 go red.
 *   9. Only dataPatch is read when both bodies are present. Cases 1 and 11 go red.
 *  10. The tool keeps its own copy of the finish word while src/config/finished.mjs says another. Cases 1, 2, 7, 8, 9,
 *      10 and 11 go red.
 *  11. The tool throws its own copy of the sentence for a write whose answer did not come, in other words. Cases 3, 4
 *      and 5 go red.
 * The finish word changed in src/config/finished.mjs alone, or the tool's exported sentence changed alone, keeps every
 * case green: the tool and this file read the same declaration.
 *
 * Every office here is a stand-in; no test reads, writes or starts the live office. The waits the tests name are short
 * (milliseconds), and a finish is held by the test rather than slept through.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FINISHED_STATES, THE_RUN_SAID_SO, THE_SWEEPS_CLOSE } from '../src/config/finished.mjs'
import { saysStillGoing, STILL_GOING_STATES } from '../src/config/still-going.mjs'
import { CLOSED_HOW } from '../src/shared/lifecycle.ts'
import { SESSION_STATES } from '../src/shared/types.ts'
import { answerOfficeMessage } from '../tools/office-mcp.mjs'
import * as officeRequest from '../tools/office-request.mjs'

type WaitOptions = { waitMs?: number; finishWaitMs?: number; signal?: AbortSignal }
type OfficeRequestModule = typeof import('../tools/office-request.mjs') & {
  THE_LONGEST_FINISH_WAIT_MS: number
  theLongestWaitFor: (request: { method: string; path: unknown; body?: unknown }, env?: unknown, given?: WaitOptions) => number
  aWriteThatDidNotAnswer: (why: string) => string
}
const {
  askTheOffice,
  renderOfficeAnswer,
  THE_LONGEST_REPLY,
  THE_LONGEST_WAIT_MS,
  THE_LONGEST_FINISH_WAIT_MS,
  theLongestWaitFor,
  aWriteThatDidNotAnswer,
} = officeRequest as unknown as OfficeRequestModule

/*
 * THE WORDS ARE READ FROM WHERE THE CODE DECLARES THEM (the inspector's refusal 4sdgL7K5N_X9, invariant 9). A word
 * changed there is changed here too, so a tool that kept its own copy of one goes red.
 */
/** The word a run says its work is finished with (src/config/finished.mjs). */
const FINISHED = FINISHED_STATES[0]
/** A state in which the run is still going (src/config/still-going.mjs). */
const STILL_GOING = STILL_GOING_STATES[0]
/**
 * The close the office's sweep writes when nobody said the run ended. The word is read from the code, THE_SWEEPS_CLOSE
 * in src/config/finished.mjs, which the office's own sweep and runSubmitsWork compare with. A place in CLOSED_HOW would
 * name another close if the list were reordered, so the word is used, and the first case checks that CLOSED_HOW still
 * holds it. The run's own close word, THE_RUN_SAID_SO, is imported from the same place.
 */
/** Every session state (src/shared/types.ts) that is neither a finish word nor still going. A crash is one. */
const THE_STATES_THAT_DID_NOT_FINISH = SESSION_STATES.filter((state) => !(FINISHED_STATES as readonly string[]).includes(state) && !saysStillGoing(state))

const RUN = 'madeUpRun001'
const OTHER_RUN = 'madeUpOthr02'
const AGENT = 'a-made-up-agent'
const WORKSPACE = 'default'
const A_SYNTHETIC_KEY = 'a1'.repeat(32)
const theRealKey = process.env.MOLE_AGENT_KEY

const theRunsEnvironment = (): Record<string, string> => ({
  MOLE_OFFICE_API: 'http://127.0.0.1:9',
  MOLE_OFFICE_SESSION: RUN,
  MOLE_OFFICE_AGENT: AGENT,
  MOLE_OFFICE_WORKSPACE: WORKSPACE,
})

const A_SUBMISSION = { kind: 'records', records: ['madeUpRprt01'] }
const A_FINISH = { method: 'PATCH', path: `/api/records/${RUN}`, body: { dataPatch: { state: FINISHED } } }
const A_READ = { method: 'GET', path: `/api/records/${RUN}` }

/** Every request shape the record door may seal a run on, with what makes it one. */
const THE_SEAL_SHAPES: { says: string; request: { method: string; path: string; body?: unknown } }[] = [
  { says: "this run's own finish", request: A_FINISH },
  { says: 'a finish that carries its own receipt', request: { ...A_FINISH, body: { dataPatch: { state: FINISHED, usageReceipt: { says: 'Made up.' } } } } },
  { says: "another run's finish by its authorized starter", request: { method: 'PATCH', path: `/api/records/${OTHER_RUN}`, body: { dataPatch: { state: FINISHED, submission: A_SUBMISSION } } } },
  { says: 'a whole data replacement that says finished', request: { method: 'PATCH', path: `/api/records/${RUN}`, body: { data: { state: FINISHED, submission: A_SUBMISSION } } } },
  { says: 'a close the run wrote itself, with no state', request: { method: 'PATCH', path: `/api/records/${RUN}`, body: { dataPatch: { closedHow: THE_RUN_SAID_SO } } } },
  { says: 'a close the run wrote while it says it is still going', request: { method: 'PATCH', path: `/api/records/${RUN}`, body: { dataPatch: { state: STILL_GOING, closedHow: THE_RUN_SAID_SO } } } },
  { says: 'a write shaped finished that also carries a stale close, which the state outranks', request: { method: 'PATCH', path: `/api/records/${RUN}`, body: { dataPatch: { state: FINISHED, closedHow: THE_SWEEPS_CLOSE } } } },
  { says: 'a whole data replacement shaped finished that also carries a stale close', request: { method: 'PATCH', path: `/api/records/${RUN}`, body: { data: { state: FINISHED, closedHow: THE_SWEEPS_CLOSE, submission: A_SUBMISSION } } } },
  { says: 'both bodies, where only the whole data says finished', request: { method: 'PATCH', path: `/api/records/${RUN}`, body: { dataPatch: { state: STILL_GOING }, data: { state: FINISHED, submission: A_SUBMISSION } } } },
  { says: 'both bodies, where only the dataPatch says finished', request: { method: 'PATCH', path: `/api/records/${RUN}`, body: { dataPatch: { state: FINISHED }, data: { state: STILL_GOING, submission: A_SUBMISSION } } } },
  { says: 'both bodies, where the dataPatch is a stale close and the whole data says finished', request: { method: 'PATCH', path: `/api/records/${RUN}`, body: { dataPatch: { closedHow: THE_SWEEPS_CLOSE }, data: { state: FINISHED, submission: A_SUBMISSION } } } },
  { says: 'a session filed already finished', request: { method: 'POST', path: '/api/records', body: { kind: 'session', title: 'A run filed finished', data: { state: FINISHED, submission: A_SUBMISSION } } } },
  { says: 'a session filed already closed by itself', request: { method: 'POST', path: '/api/records', body: { kind: 'session', title: 'A run filed closed', data: { closedHow: THE_RUN_SAID_SO } } } },
  { says: 'a session filed shaped finished that also carries a stale close', request: { method: 'POST', path: '/api/records', body: { kind: 'session', title: 'A run filed finished and stale', data: { state: FINISHED, closedHow: THE_SWEEPS_CLOSE, submission: A_SUBMISSION } } } },
]

/** Every request shape that is not a run's finish, with what keeps it ordinary. */
const THE_ORDINARY_SHAPES: { says: string; request: { method: string; path: string; body?: unknown } }[] = [
  { says: 'a title change on another record', request: { method: 'PATCH', path: `/api/records/${OTHER_RUN}`, body: { title: 'Another title' } } },
  { says: 'a run still running', request: { method: 'PATCH', path: `/api/records/${RUN}`, body: { dataPatch: { state: STILL_GOING } } } },
  ...THE_STATES_THAT_DID_NOT_FINISH.map((state) => ({
    says: `a row that says ${state}, neither finished nor still going, that also carries a close`,
    request: { method: 'PATCH', path: `/api/records/${RUN}`, body: { dataPatch: { state, closedHow: THE_RUN_SAID_SO } } },
  })),
  { says: "the sweep's stale close, which submits no work", request: { method: 'PATCH', path: `/api/records/${RUN}`, body: { dataPatch: { closedAt: '2026-11-09 12:30:00', closedBecause: 'The process is gone.', closedHow: THE_SWEEPS_CLOSE } } } },
  { says: 'both bodies, and neither says the run finished', request: { method: 'PATCH', path: `/api/records/${RUN}`, body: { dataPatch: { state: STILL_GOING }, data: { state: STILL_GOING, submission: A_SUBMISSION } } } },
  { says: 'a session filed still running', request: { method: 'POST', path: '/api/records', body: { kind: 'session', title: 'A run filed running', data: { state: STILL_GOING } } } },
  { says: 'a session filed with the sweep stale close and no state', request: { method: 'POST', path: '/api/records', body: { kind: 'session', title: 'A run filed stale', data: { closedHow: THE_SWEEPS_CLOSE } } } },
  { says: 'a non-session filed with a finished state', request: { method: 'POST', path: '/api/records', body: { kind: 'problem', title: 'Not a run', data: { state: FINISHED } } } },
  { says: 'a short-form write that says finished in its body', request: { method: 'PATCH', path: `/api/records/${RUN}/short-forms`, body: { dataPatch: { state: FINISHED } } } },
  { says: 'a read', request: A_READ },
  { says: 'a delete with a finish-shaped body', request: { method: 'DELETE', path: `/api/records/${RUN}`, body: { dataPatch: { state: FINISHED } } } },
]

type Sent = { method: string; path: string; body: unknown }

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status })

/** A promise that settles after `ms`, or rejects with the signal's own reason when the wait is stopped. */
function after(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) return reject(signal.reason)
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason)
    }, { once: true })
  })
}

/** A response the test releases, or one the signal stops. */
function aHeldResponse(): { whenFor: (signal?: AbortSignal | null) => Promise<void>; release: () => void } {
  let release: () => void = () => undefined
  const released = new Promise<void>((done) => {
    release = done
  })
  const whenFor = (signal?: AbortSignal | null) =>
    new Promise<void>((resolve, reject) => {
      if (signal?.aborted === true) return reject(signal.reason)
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
      void released.then(resolve)
    })
  return { whenFor, release }
}

/**
 * A stand-in office. Its one read is the shape the office tool needs before this run's own finish (the run's own
 * record, read for the receipt) and its writes are answered by `theSlowWrite`, which decides when the write answers.
 */
function aStandIn(theSlowWrite: (signal?: AbortSignal | null) => Promise<Response>) {
  const sent: Sent[] = []
  const fetchImpl = (async (url: string, init: { method: string; body?: string; signal?: AbortSignal | null }) => {
    const where = new URL(url)
    sent.push({ method: init.method, path: where.pathname, body: init.body === undefined ? undefined : JSON.parse(init.body) })
    if (init.method === 'GET') {
      if (where.pathname === `/api/records/${RUN}`) {
        return json({ record: { kind: 'session', createdAt: '2026-11-09 12:00:00', data: { servingAgentId: AGENT, startedAt: '2026-11-09 12:00:00' } } })
      }
      return json({})
    }
    return theSlowWrite(init.signal)
  }) as unknown as typeof fetch
  const written = (method: string, path: string) => sent.filter((one) => one.method === method && one.path === path)
  return { sent, fetchImpl, written }
}

/**
 * The tool's own words for a write whose answer did not come (aWriteThatDidNotAnswer), from the end of the reason the
 * wait stopped. A wait that runs out words that reason itself, so only the words after it are the tool's.
 */
function theToolsWordsAfterTheReason(): string {
  const reason = 'a reason made up here'
  const words = aWriteThatDidNotAnswer(reason)
  return words.slice(words.indexOf(reason) + reason.length)
}

beforeAll(() => {
  // A synthetic key, so no test sends the run's real key to its stand-in. officeHeaders reads this process's
  // environment, as it does in the tool.
  process.env.MOLE_AGENT_KEY = A_SYNTHETIC_KEY
})

afterAll(() => {
  if (theRealKey === undefined) delete process.env.MOLE_AGENT_KEY
  else process.env.MOLE_AGENT_KEY = theRealKey
})

describe('the wait a request is given', () => {
  // MUTATIONS 1, 2, 6 AND 7: red.
  it('1: gives every write that may seal a run the finish wait, and every other request the ordinary wait', () => {
    expect(typeof theLongestWaitFor, 'the tool has no wait chosen per request').toBe('function')
    expect(THE_LONGEST_FINISH_WAIT_MS).toBeGreaterThan(THE_LONGEST_WAIT_MS)
    expect(THE_STATES_THAT_DID_NOT_FINISH, 'no session state is neither finished nor still going').not.toHaveLength(0)
    expect(CLOSED_HOW, "the sweep's close is not a close the office knows").toContain(THE_SWEEPS_CLOSE)
    expect(CLOSED_HOW, "the run's own close is not a close the office knows").toContain(THE_RUN_SAID_SO)
    const env = theRunsEnvironment()
    for (const { says, request } of THE_SEAL_SHAPES) {
      expect(theLongestWaitFor(request, env), says).toBe(THE_LONGEST_FINISH_WAIT_MS)
    }
    for (const { says, request } of THE_ORDINARY_SHAPES) {
      expect(theLongestWaitFor(request, env), says).toBe(THE_LONGEST_WAIT_MS)
    }
  })
})

describe("the office tool's finish wait, against a stand-in office", () => {
  // MUTATION 1: red.
  it("2: waits for this run's finish held past the ordinary limit through the MCP tool, and sends it once", async () => {
    const held = aHeldResponse()
    const stand = aStandIn(async (signal) => {
      await held.whenFor(signal)
      return json({ newSeq: 7 })
    })
    const answering = answerOfficeMessage({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'office_request', arguments: A_FINISH },
    }, { fetchImpl: stand.fetchImpl, env: theRunsEnvironment(), waitMs: 40, finishWaitMs: 1_000 })
    // Longer than the ordinary wait: a finish on that limit would already have given up.
    await after(90)
    expect(stand.written('PATCH', `/api/records/${RUN}`)).toHaveLength(1)
    held.release()
    const answer = await answering as { result: { isError: boolean; content: { text: string }[] } }
    expect(answer.result.isError).toBe(false)
    expect(answer.result.content[0]?.text).toContain('200\n{"newSeq":7}')
    expect(stand.written('PATCH', `/api/records/${RUN}`)).toHaveLength(1)
  })

  // MUTATION 2: red.
  it("3: keeps the ordinary wait for a write that is not a run's finish, and says it may be stored", async () => {
    const stand = aStandIn(async (signal) => {
      await after(150, signal)
      return json({ newSeq: 7 })
    })
    const ordinary = { method: 'PATCH', path: `/api/records/${RUN}`, body: { dataPatch: { state: STILL_GOING } } }
    await expect(askTheOffice(ordinary, { fetchImpl: stand.fetchImpl, env: theRunsEnvironment(), waitMs: 40, finishWaitMs: 1_000 }))
      .rejects.toThrow(theToolsWordsAfterTheReason())
    expect(stand.written('PATCH', `/api/records/${RUN}`)).toHaveLength(1)
  })

  // MUTATION 1: red. The finish has its own bound, and it is still honest when that bound runs out.
  it('4: gives up at the finish bound, says the write may be stored, and sends it once', async () => {
    const stand = aStandIn(async (signal) => {
      await after(150, signal)
      return json({ newSeq: 7 })
    })
    await expect(askTheOffice(A_FINISH, { fetchImpl: stand.fetchImpl, env: theRunsEnvironment(), waitMs: 40, finishWaitMs: 80 }))
      .rejects.toThrow(theToolsWordsAfterTheReason())
    expect(stand.written('PATCH', `/api/records/${RUN}`)).toHaveLength(1)
  })

  // MUTATION 3: red.
  it("5: stops a finish's wait when the caller cancels, and says the write may be stored", async () => {
    const stand = aStandIn(async (signal) => {
      await after(150, signal)
      return json({ newSeq: 7 })
    })
    const caller = new AbortController()
    const answering = askTheOffice(A_FINISH, {
      fetchImpl: stand.fetchImpl, env: theRunsEnvironment(), waitMs: 40, finishWaitMs: 60_000, signal: caller.signal,
    })
    const why = 'the caller stopped waiting'
    setTimeout(() => caller.abort(new Error(why)), 30)
    await expect(answering).rejects.toThrow(aWriteThatDidNotAnswer(why))
    expect(stand.written('PATCH', `/api/records/${RUN}`)).toHaveLength(1)
  })

  // MUTATION 4: red.
  it('6: cuts a long finish answer as an ordinary answer is cut, and says so', async () => {
    const long = 'x'.repeat(THE_LONGEST_REPLY + 100)
    const stand = aStandIn(async () => json({ newSeq: 7, said: long }))
    const answer = await askTheOffice({ ...A_FINISH, fields: 'whole' }, { fetchImpl: stand.fetchImpl, env: theRunsEnvironment(), waitMs: 40, finishWaitMs: 1_000 })
    expect(answer.cut).toBe(true)
    expect(answer.body).toHaveLength(THE_LONGEST_REPLY)
    expect(renderOfficeAnswer({ ...A_FINISH, fields: 'whole' }, answer)[0]?.text).toContain(`The rest of the reply, past ${String(THE_LONGEST_REPLY)} characters, is not shown.`)
  })

  // MUTATIONS 1 AND 6: red.
  it("7: waits for another run's finish held past the ordinary limit, and sends it once", async () => {
    const held = aHeldResponse()
    const stand = aStandIn(async (signal) => {
      await held.whenFor(signal)
      return json({ newSeq: 8 })
    })
    const other = { method: 'PATCH', path: `/api/records/${OTHER_RUN}`, body: { dataPatch: { state: FINISHED, submission: A_SUBMISSION } } }
    const answering = askTheOffice(other, { fetchImpl: stand.fetchImpl, env: theRunsEnvironment(), waitMs: 40, finishWaitMs: 1_000 })
    await after(90)
    expect(stand.written('PATCH', `/api/records/${OTHER_RUN}`)).toHaveLength(1)
    held.release()
    const answer = await answering
    expect(answer.status).toBe(200)
    expect(answer.body).toBe('{"newSeq":8}')
    expect(stand.written('PATCH', `/api/records/${OTHER_RUN}`)).toHaveLength(1)
  })

  // MUTATIONS 1 AND 6: red.
  it('8: waits for a session filed already finished past the ordinary limit, and sends it once', async () => {
    const held = aHeldResponse()
    const stand = aStandIn(async (signal) => {
      await held.whenFor(signal)
      return json({ newSeq: 9 })
    })
    const filing = { method: 'POST', path: '/api/records', body: { kind: 'session', title: 'A run filed finished', data: { state: FINISHED, submission: A_SUBMISSION } } }
    const answering = askTheOffice(filing, { fetchImpl: stand.fetchImpl, env: theRunsEnvironment(), waitMs: 40, finishWaitMs: 1_000 })
    await after(90)
    expect(stand.written('POST', '/api/records')).toHaveLength(1)
    held.release()
    const answer = await answering
    expect(answer.status).toBe(200)
    expect(answer.body).toBe('{"newSeq":9}')
    expect(stand.written('POST', '/api/records')).toHaveLength(1)
  })

  // MUTATIONS 1, 6 AND 8: red. A conservative classification: the state is read first, so the shape may seal.
  it('9: conservatively waits for a write shaped finished with a stale close through the MCP tool, and sends it once', async () => {
    const held = aHeldResponse()
    const stand = aStandIn(async (signal) => {
      await held.whenFor(signal)
      return json({ newSeq: 10 })
    })
    const finishing = { method: 'PATCH', path: `/api/records/${RUN}`, body: { dataPatch: { state: FINISHED, closedHow: THE_SWEEPS_CLOSE } } }
    const answering = answerOfficeMessage({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'office_request', arguments: finishing },
    }, { fetchImpl: stand.fetchImpl, env: theRunsEnvironment(), waitMs: 40, finishWaitMs: 1_000 })
    await after(90)
    expect(stand.written('PATCH', `/api/records/${RUN}`)).toHaveLength(1)
    held.release()
    const answer = await answering as { result: { isError: boolean; content: { text: string }[] } }
    expect(answer.result.isError).toBe(false)
    expect(answer.result.content[0]?.text).toContain('200\n{"newSeq":10}')
    expect(stand.written('PATCH', `/api/records/${RUN}`)).toHaveLength(1)
  })

  // MUTATIONS 1, 6 AND 8: red. The same shape filed by POST, where only data can carry it.
  it('10: conservatively waits for a session filed shaped finished with a stale close, and sends it once', async () => {
    const held = aHeldResponse()
    const stand = aStandIn(async (signal) => {
      await held.whenFor(signal)
      return json({ newSeq: 11 })
    })
    const filing = {
      method: 'POST', path: '/api/records',
      body: { kind: 'session', title: 'A run filed finished and stale', data: { state: FINISHED, closedHow: THE_SWEEPS_CLOSE, submission: A_SUBMISSION } },
    }
    const answering = askTheOffice(filing, { fetchImpl: stand.fetchImpl, env: theRunsEnvironment(), waitMs: 40, finishWaitMs: 1_000 })
    await after(90)
    expect(stand.written('POST', '/api/records')).toHaveLength(1)
    held.release()
    const answer = await answering
    expect(answer.status).toBe(200)
    expect(answer.body).toBe('{"newSeq":11}')
    expect(stand.written('POST', '/api/records')).toHaveLength(1)
  })

  // MUTATIONS 1, 6, 8 AND 9: red. Both bodies are read, though the HTTP door refuses the pair before the write path
  // and patchRecord's own guard refuses it after its finish check.
  it('11: conservatively reads the whole data beside a dataPatch that does not finish, and waits', async () => {
    const held = aHeldResponse()
    const stand = aStandIn(async (signal) => {
      await held.whenFor(signal)
      return json({ newSeq: 12 })
    })
    const both = {
      method: 'PATCH', path: `/api/records/${RUN}`,
      body: { dataPatch: { state: STILL_GOING }, data: { state: FINISHED, closedHow: THE_SWEEPS_CLOSE, submission: A_SUBMISSION } },
    }
    const answering = askTheOffice(both, { fetchImpl: stand.fetchImpl, env: theRunsEnvironment(), waitMs: 40, finishWaitMs: 1_000 })
    await after(90)
    expect(stand.written('PATCH', `/api/records/${RUN}`)).toHaveLength(1)
    held.release()
    const answer = await answering
    expect(answer.status).toBe(200)
    expect(answer.body).toBe('{"newSeq":12}')
    expect(stand.written('PATCH', `/api/records/${RUN}`)).toHaveLength(1)
  })
})
