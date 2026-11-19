// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN'S OWN SEAL CARRIES ITS OWN USAGE RECEIPT, read by its office tool from its own log.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS FILE IS WRITTEN AGAINST
 * ---------------------------------------------------------------------------------------
 *
 * Every run records its tokens, from the runtime's own usage and never from an agent's memory.
 * The seal revokes the run's key and nothing is written after it (messages 5gg-Q_azbInF and fWNeIBeL3Meu), so
 * the launcher skips its receipt for a run that sealed itself, and the receipt was there only when the agent remembered
 * tools/usage-so-far.mjs. The secretary agreed that office_request adds the receipt to the seal itself (message jRM57hUWbIBn),
 * under six conditions (message Xbgm8gDFfAY9, quoted by the secretary in 0J-bDsdC9EeP). Each condition has a
 * case named for it below, and each fails against the code before wave 13s round 34, which added no receipt at all.
 *
 * The office is a stand-in fetch; the logs are made up in a folder of this test's own under the system's temporary
 * folder, which stands in for a home. Nothing reads the real home.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN
 * ---------------------------------------------------------------------------------------
 *
 *   1. aSealOfThisRun takes any record's PATCH to finished. Condition 1 goes red.
 *   2. The Claude transcript is found by any .jsonl in the folder rather than the session's own. Condition 2 goes red.
 *   3. The model is kept whatever its shape. Condition 3 goes red.
 *   4. The read takes the whole file, whatever its size. Condition 4 goes red.
 *   5. The real-path check is taken out. Condition 5 goes red.
 *   6. The self-reported words are left out. Condition 6 goes red.
 *   7. The Codex run's part is the last total, with nothing taken off. The Codex case goes red.
 *
 * ROUND 40 (wave 13s; the secretary's agreement ZbUh96UhT6YQ): every run's own seal carries a receipt, and a dsh run's is read
 * from the transcript of the dsh session that called the tool. Its mutations, each after a control run:
 *
 *   8. office_request again adds no receipt for a runtime other than claude-code, codex and dsh. The case for a
 *      runtime with no reader goes red.
 *   9. dsh's tool hands askTheOffice its environment as it came, without the calling session. The dsh case goes red.
 *  10. A subagent's session is named as the run's own. The case for a session that is not the run's own goes red.
 *  11. The session's own transcript is found by findTheTranscript, which takes the newest session when the named one
 *      has none. The case for a session that is not the run's own goes red.
 *  12. A DSH_SESSION_ID the dsh process inherited is left in the tool's environment. The same case goes red.
 *  13. A transcript read only in part is summed. The case for a long transcript goes red.
 *
 * ROUND 42 (wave 13s; the answer k0eknvS08jLE, 2): one writer. Its mutations, each after a control run:
 *
 *  14. office_request sends the seal's receipt as it read it, not through theReceiptWrittenOver. The launcher-first
 *      case goes red.
 *  15. theReceiptWrittenOver without its guard. The case where the seal read no numbers goes red.
 *
 * PROBLEM IjCVX5KFlViv (17 Oct 2026; the secretary's scope 1vBcuEtghSIh, 5): a seal the office did not store. Its mutations,
 * each after a control run:
 *
 *  16. The receipt's sentence kept whatever the office answers. Both cases for a seal that was not stored go red.
 *  17. The answer's status read and its newSeq not. The case for the reminder before the seal goes red.
 *
 * OLD (wave 13s round 113): the run was filed an hour before the real time, in the machine's zone. Run at 02:39 winter
 * time on 25 October 2026, its filing time was 01:39, a time the clocks show twice that night. It was read as the
 * summer-time one, an hour earlier, so the Codex case counted the thread from before its first count and said 300 and
 * 50.
 * NEW: the cases run on a fixed clock in Europe/London, frozen at noon summer time on 24 October 2026, and the run is
 * filed an hour before that noon.
 * WHY: a test that reads the real time passes or fails by the hour it is run at.
 * MUTATION (round 113, after a control run, then restored): mutation 7 above → the Codex case goes red.
 *
 * OLD (wave 13k round 30): the run's own write to finished with a receipt of its own sent one GET before its PATCH. That
 * GET was a read made before each write that may seal the run, by code since deleted.
 * NEW: that write sends its PATCH alone, as it did before round 30. Each case still names every request it sends, in
 * order.
 * WHY: the tool reads nothing before a write that carries its own receipt.
 * MUTATION, after a control run, then restored:
 *
 *  18. The receipt is read for each of the run's own writes to finished, its own receipt or not. Condition 1 goes red.
 */
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { aSealOfThisRun, askTheOffice, renderOfficeAnswer } from '../tools/office-request.mjs'
import { theOfficeRequestTool } from '../tools/dsh-hooks/office-tool.mjs'
import { projectKey } from '../tools/dsh-hooks/served.mjs'
import { SELF_REPORTED, theSealsReceipt } from '../tools/the-seal-receipt.mjs'
import { localStamp } from '../src/shared/time.ts'
import { A_LATER_READING_FOUND_NO_NUMBERS, codexRolloutUsage, USAGE_NUMBERS } from '../src/config/usage.mjs'

// THE CLOCK READS IN EUROPE/LONDON, set before any module reads the zone. The zone before is put back after the file.
const theZoneBefore = vi.hoisted(() => {
  const before = process.env.TZ
  process.env.TZ = 'Europe/London'
  return before
})

const RUN = 'aRunOfItsOwn1'
const OTHER = 'anotherRun999'
const SESSION = '0a1b2c3d-1111-4222-8333-444455556666'
const ANOTHER_SESSION = '9f8e7d6c-1111-4222-8333-444455556666'
const THREAD = '01a106ba-1b44-7371-868f-903c4d3866e6'
const ANOTHER_THREAD = '01a106ba-1b44-7371-868f-000000000000'
const CWD = '/work/a-checkout'
const SECRET = 'THE-CONTENT-OF-A-PROMPT-NEVER-COPIED'

/** Noon summer time on 24 October 2026, an ordinary day: the clock every case stands at. */
const AN_ORDINARY_NOON = Date.UTC(2026, 9, 24, 11, 0, 0)

let home = ''
let projects = ''
const began = AN_ORDINARY_NOON - 60 * 60_000

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: AN_ORDINARY_NOON })
  home = mkdtempSync(join(tmpdir(), 'mole-seal-receipt-'))
  projects = join(home, '.claude', 'projects', CWD.replace(/[^a-zA-Z0-9]/g, '-'))
  mkdirSync(projects, { recursive: true })
})
afterAll(() => {
  rmSync(home, { recursive: true, force: true })
  vi.useRealTimers()
  if (theZoneBefore === undefined) delete process.env.TZ
  else process.env.TZ = theZoneBefore
})

function anAnswer(id: string, at: number, out: number, model = 'claude-opus-5-5'): string {
  return JSON.stringify({ type: 'assistant', timestamp: new Date(at).toISOString(), message: { id, model, content: [{ type: 'text', text: SECRET }], usage: { input_tokens: 10, cache_read_input_tokens: 100, cache_creation_input_tokens: 1, output_tokens: out } } })
}

function aTranscript(session: string, lines: string[]): string {
  const path = join(projects, `${session}.jsonl`)
  writeFileSync(path, `${lines.join('\n')}\n`)
  return path
}

function theRecord(runtime = 'claude-code') {
  return { id: RUN, kind: 'session', createdAt: localStamp(new Date(began)), data: { runtime, state: 'running', workingDirectory: CWD } }
}

function anEnvironment(more: Record<string, string> = {}): Record<string, string> {
  return { HOME: home, MOLE_OFFICE_API: 'http://127.0.0.1:9', MOLE_OFFICE_SESSION: RUN, MOLE_OFFICE_AGENT: 'an-agent', MOLE_OFFICE_WORKSPACE: 'default', CLAUDE_CODE_SESSION_ID: SESSION, ...more }
}

type Sent = { method: string; url: string; body: unknown }

/**
 * A stand-in office: answers the run's record to a GET and, to anything else, what the records door answers a write it
 * stored, 200 with a number in newSeq (src/server/api/records.ts). It keeps what was sent.
 */
function aStandIn(record: unknown = theRecord()) {
  const sent: Sent[] = []
  const fetchImpl = (async (url: string, init: { method: string; body?: string }) => {
    sent.push({ method: init.method, url, body: init.body === undefined ? undefined : JSON.parse(init.body) })
    if (init.method === 'GET') return new Response(JSON.stringify({ record }), { status: 200 })
    return new Response(A_STORED_WRITE, { status: 200 })
  }) as unknown as typeof fetch
  return { sent, fetchImpl }
}

const A_STORED_WRITE = '{"newSeq":4}'
const A_SEAL = { method: 'PATCH', path: `/api/records/${RUN}`, body: { ifVersion: 3, dataPatch: { state: 'finished', doing: 'done', tip: 'a'.repeat(40) } } }

function theSealSent(sent: Sent[]): { dataPatch: Record<string, unknown> } {
  const patch = sent.find((one) => one.method === 'PATCH')
  expect(patch, 'the seal was never sent').toBeDefined()
  return patch!.body as { dataPatch: Record<string, unknown> }
}

describe("the tool maintainer's condition 1: only the run's own seal", () => {
  it("adds the receipt to the run's own PATCH to finished, and to nothing else", async () => {
    aTranscript(SESSION, [anAnswer('msg_1', began + 1_000, 7)])
    const own = aStandIn()
    const answer = await askTheOffice(A_SEAL, { fetchImpl: own.fetchImpl, env: anEnvironment() })
    const seal = theSealSent(own.sent)
    expect(seal.dataPatch).toMatchObject({ state: 'finished', doing: 'done', usageReceipt: { outputTokens: 7 } })
    expect((seal as Record<string, unknown>)['ifVersion']).toBe(3)
    expect(answer.added).toContain('went with the seal')

    for (const [request, sent] of [
      [{ ...A_SEAL, path: `/api/records/${OTHER}` }, ['PATCH']],
      [{ ...A_SEAL, body: { dataPatch: { state: 'running' } } }, ['PATCH']],
      [{ ...A_SEAL, body: { dataPatch: { state: 'finished', usageReceipt: { says: 'its own' } } } }, ['PATCH']],
      [{ ...A_SEAL, method: 'POST' }, ['POST']],
    ] as const) {
      const stand = aStandIn()
      const said = await askTheOffice(request, { fetchImpl: stand.fetchImpl, env: anEnvironment() })
      expect(stand.sent.map((one) => one.method), JSON.stringify(request)).toEqual(sent)
      expect(stand.sent.at(-1)?.body, JSON.stringify(request)).toEqual(request.body)
      expect(said.added).toBeNull()
    }
    // THE RUN IS THE ENVIRONMENT'S, never the body's or the path's choice.
    expect(aSealOfThisRun(A_SEAL, { MOLE_OFFICE_SESSION: OTHER })).toBe(false)
    expect(aSealOfThisRun(A_SEAL, {})).toBe(false)
  })
})

describe("the tool maintainer's condition 2: the run's own log, named by its own session", () => {
  it("reads only the transcript named by this run's session id, and says so in words when there is none", () => {
    aTranscript(SESSION, [anAnswer('msg_own', began + 1_000, 5)])
    aTranscript(ANOTHER_SESSION, [anAnswer('msg_other', began + 1_000, 500)])
    const own = theSealsReceipt({ record: theRecord(), env: anEnvironment(), cwd: CWD })
    expect(own?.receipt.outputTokens).toBe(5)

    const none = theSealsReceipt({ record: theRecord(), env: anEnvironment({ CLAUDE_CODE_SESSION_ID: '00000000-0000-4000-8000-000000000000' }), cwd: CWD })
    expect(none?.receipt).not.toHaveProperty('outputTokens')
    expect(none?.receipt.says).toContain("no transcript named by this run's session id")
    const unnamed = theSealsReceipt({ record: theRecord(), env: anEnvironment({ CLAUDE_CODE_SESSION_ID: '../../etc' }), cwd: CWD })
    expect(unnamed?.receipt).not.toHaveProperty('outputTokens')
    expect(unnamed?.receipt.says).toContain('named no session id')
  })

  it("reads a Codex run's own thread from its own output file, and only that thread's rollout", () => {
    const logs = join(home, 'instance', 'logs', RUN)
    mkdirSync(logs, { recursive: true })
    const out = join(logs, 'out')
    writeFileSync(out, `${JSON.stringify({ type: 'thread.started', thread_id: THREAD })}\n`)
    const day = join(home, '.codex', 'sessions', '2026', '10', '11')
    mkdirSync(day, { recursive: true })
    const at = (ms: number) => new Date(ms).toISOString()
    const count = (ms: number, input: number, output: number) => JSON.stringify({ timestamp: at(ms), type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: input, cached_input_tokens: 0, output_tokens: output, reasoning_output_tokens: 0 } } } })
    writeFileSync(join(day, `rollout-2026-10-11T01-00-00-${THREAD}.jsonl`), [
      JSON.stringify({ timestamp: at(began - 10_000), type: 'session_meta', payload: { id: THREAD } }),
      count(began - 5_000, 100, 10),
      JSON.stringify({ timestamp: at(began + 1_000), type: 'turn_context', payload: { model: 'gpt-5.5-codex' } }),
      count(began + 2_000, 300, 50),
    ].join('\n') + '\n')
    writeFileSync(join(day, `rollout-2026-10-11T01-00-00-${ANOTHER_THREAD}.jsonl`), `${count(began + 2_000, 9000, 900)}\n`)
    const read = theSealsReceipt({ record: theRecord('codex'), env: anEnvironment({ MOLE_OFFICE_RUN_OUTPUT: out }), cwd: CWD })
    expect(read?.receipt).toMatchObject({ inputTokens: 200, outputTokens: 40, inputIncludesCached: true, model: 'gpt-5.5-codex', paidBy: 'not reported' })

    // THE END OF A ROLLOUT THAT DOES NOT REACH BACK TO BEFORE THE RUN tells no part of the thread's total.
    // Mutation: the check on before, beganSince and whole taken out (red).
    const cut = codexRolloutUsage(`${count(began + 2_000, 300, 50)}\n`, began, false)
    expect(cut).not.toHaveProperty('outputTokens')
    expect(cut.says).toContain('does not reach back to before the run began')
    expect(codexRolloutUsage(`${count(began + 2_000, 300, 50)}\n`, began, true)).toMatchObject({ inputTokens: 300, outputTokens: 50 })

    const elsewhere = join(home, 'instance', 'logs', OTHER)
    mkdirSync(elsewhere, { recursive: true })
    writeFileSync(join(elsewhere, 'out'), `${JSON.stringify({ type: 'thread.started', thread_id: ANOTHER_THREAD })}\n`)
    const notItsOwn = theSealsReceipt({ record: theRecord('codex'), env: anEnvironment({ MOLE_OFFICE_RUN_OUTPUT: join(elsewhere, 'out') }), cwd: CWD })
    expect(notItsOwn?.receipt).not.toHaveProperty('outputTokens')
    expect(notItsOwn?.receipt.says).toContain("is not this run's own")
  })
})

describe("the tool maintainer's condition 3: numbers out, never content", () => {
  it('carries counts, a model name of a model name’s shape and the path from the home on, and nothing the log says', () => {
    aTranscript(SESSION, ['{"not json at all', anAnswer('msg_1', began + 1_000, 3, `${SECRET} <a long text where a model name should be>`)])
    const read = theSealsReceipt({ record: theRecord(), env: anEnvironment(), cwd: CWD })
    const said = JSON.stringify(read)
    expect(said).not.toContain(SECRET)
    expect(said).not.toContain('not json at all')
    expect(said).not.toContain(home)
    expect(read?.receipt.source).toContain(`~/.claude/projects/`)
    expect(read?.receipt).not.toHaveProperty('model')
    expect(read?.receipt.outputTokens).toBe(3)
  })
})

describe("the tool maintainer's condition 4: the seal is never held up", () => {
  it('reads at most the end of a log, says so when that end does not reach the run’s start, and gives up on a slow read', () => {
    const filler = Array.from({ length: 200 }, (_, n) => anAnswer(`msg_${String(n)}`, began + 1_000 + n, 1))
    aTranscript(SESSION, [JSON.stringify({ type: 'user', timestamp: new Date(began - 1_000).toISOString() }), ...filler])
    const short = theSealsReceipt({ record: theRecord(), env: anEnvironment(), cwd: CWD, limits: { most: 4_096 } })
    expect(short?.receipt).not.toHaveProperty('outputTokens')
    expect(short?.receipt.says).toContain('do not reach back to before the run began')

    let clock = 0
    const slow = theSealsReceipt({ record: theRecord(), env: anEnvironment(), cwd: CWD, limits: { forMs: 2_000, now: () => (clock += 5_000) } })
    expect(slow?.receipt).not.toHaveProperty('outputTokens')
    expect(slow?.receipt.says).toContain('took longer than 2000 ms')
  })

  it('sends the seal as it came when the log cannot be read or the record cannot be read', async () => {
    const path = aTranscript(SESSION, [anAnswer('msg_1', began + 1_000, 7)])
    chmodSync(path, 0o000)
    try {
      const stand = aStandIn()
      const answer = await askTheOffice(A_SEAL, { fetchImpl: stand.fetchImpl, env: anEnvironment() })
      expect(theSealSent(stand.sent).dataPatch).toMatchObject({ state: 'finished', usageReceipt: { runtime: 'claude-code' } })
      expect(theSealSent(stand.sent).dataPatch['usageReceipt']).not.toHaveProperty('outputTokens')
      expect(answer.added).toMatch(/could not be opened \((EACCES|EPERM)\)/)
    } finally {
      chmodSync(path, 0o600)
    }
    const failing = (async (_url: string, init: { method: string; body?: string }) => {
      if (init.method === 'GET') throw new Error('no answer')
      return new Response(A_STORED_WRITE, { status: 200 })
    }) as unknown as typeof fetch
    const said = await askTheOffice(A_SEAL, { fetchImpl: failing, env: anEnvironment() })
    expect(said.status).toBe(200)
    expect(said.added).toContain("the run's own record could not be read")
  })
})

describe("the tool maintainer's condition 5: read-only, and inside its own folders", () => {
  it('refuses a transcript whose real path is outside Claude Code’s own folder, and changes no file it reads', () => {
    const outside = join(home, 'outside.jsonl')
    writeFileSync(outside, `${anAnswer('msg_1', began + 1_000, 99)}\n`)
    rmSync(join(projects, `${SESSION}.jsonl`), { force: true })
    symlinkSync(outside, join(projects, `${SESSION}.jsonl`))
    const read = theSealsReceipt({ record: theRecord(), env: anEnvironment(), cwd: CWD })
    expect(read?.receipt).not.toHaveProperty('outputTokens')
    expect(read?.receipt.says).toContain("outside the runtime's own folder")
    rmSync(join(projects, `${SESSION}.jsonl`))

    const path = aTranscript(SESSION, [anAnswer('msg_1', began + 1_000, 7)])
    const before = readFileSync(path)
    theSealsReceipt({ record: theRecord(), env: anEnvironment(), cwd: CWD })
    expect(readFileSync(path).equals(before)).toBe(true)
  })
})

describe("the tool maintainer's condition 6: it says what it is", () => {
  it('marks the receipt self-reported, in its source and its words, and tells the model what went with the seal', async () => {
    aTranscript(SESSION, [anAnswer('msg_1', began + 1_000, 7)])
    const read = theSealsReceipt({ record: theRecord(), env: anEnvironment(), cwd: CWD })
    expect(read?.receipt.source).toMatch(/^self-reported at the seal by the run's own office tool/)
    expect(read?.receipt.says).toContain(SELF_REPORTED)
    const stand = aStandIn()
    const answer = await askTheOffice(A_SEAL, { fetchImpl: stand.fetchImpl, env: anEnvironment() })
    expect(renderOfficeAnswer(null, answer)[0]?.text).toContain(`(${String(answer.added)})`)
  })

  // ROUND 40 (the secretary's agreement ZbUh96UhT6YQ): every run's own seal carries a receipt. A runtime whose log this tool
  // has no reader for gets one that says so in words and holds no numbers, rather than none at all.
  it("seals a run on a runtime whose log it has no reader for with a receipt that says so in words, and holds no numbers", async () => {
    const stand = aStandIn({ ...theRecord('opencode') })
    const answer = await askTheOffice(A_SEAL, { fetchImpl: stand.fetchImpl, env: anEnvironment() })
    const seal = theSealSent(stand.sent)
    expect(seal.dataPatch).toMatchObject({ state: 'finished', doing: 'done', tip: 'a'.repeat(40) })
    const receipt = seal.dataPatch['usageReceipt'] as Record<string, unknown>
    expect(receipt).toMatchObject({ runtime: 'opencode', paidBy: 'not reported', ranIn: 'on the host' })
    expect(Object.keys(receipt).filter((name) => (USAGE_NUMBERS as readonly string[]).includes(name))).toEqual([])
    expect(receipt['says']).toBe(`No numbers were read at the seal: this office tool has no reader of an opencode run's own log. ${SELF_REPORTED}`)
    expect(answer.added).toBe("A usage receipt with no numbers: this office tool has no reader of an opencode run's own log.")
  })
})

describe("Round 40: a dsh run's seal reads the transcript of the dsh session that called the tool", () => {
  const OWN = 'a-dsh-session-of-its-own'
  const NEWER = 'a-newer-dsh-session'

  /** A dsh transcript in dsh's own folder for CWD, with one assistant/message per count of tokens out. */
  function aDshTranscript(id: string, outs: number[]): string {
    const folder = join(home, '.dsh', 'sessions', projectKey(CWD), id)
    mkdirSync(folder, { recursive: true })
    const path = join(folder, 'session.jsonl')
    const lines = outs.map((out) => JSON.stringify({ type: 'assistant/message', data: { usage: { inputTokens: 10, cacheReadTokens: 100, cacheWriteTokens: 1, outputTokens: out }, message: { source: { model: 'deepseek-v4-pro' }, content: SECRET } } }))
    writeFileSync(path, `${lines.join('\n')}\n`)
    return path
  }

  /** dsh's own tool, made with a stand-in defineTool that hands back what it is given, so its own execute runs. */
  function aDshTool(stand: { fetchImpl: typeof fetch }, env: Record<string, string>) {
    return theOfficeRequestTool({ defineTool: (options: unknown) => options, fetchImpl: stand.fetchImpl, env }) as { execute: (args: unknown, exec?: unknown) => Promise<{ added: string | null }> }
  }

  const aCallOf = (header: Record<string, unknown>) => ({ agent: { session: { header } } })

  it("reads the session dsh names in the tool's call, and no newer session's", async () => {
    aDshTranscript(OWN, [4, 6])
    aDshTranscript(NEWER, [900])
    const stand = aStandIn(theRecord('dsh'))
    const answer = await aDshTool(stand, anEnvironment()).execute(A_SEAL, aCallOf({ id: OWN, type: 'session', version: 3 }))
    const receipt = theSealSent(stand.sent).dataPatch['usageReceipt'] as Record<string, unknown>
    expect(receipt).toMatchObject({ runtime: 'dsh', outputTokens: 10, inputTokens: 20, cachedInputTokens: 200, inputIncludesCached: false, model: 'deepseek-v4-pro', paidBy: 'not reported', ranIn: 'on the host' })
    expect(receipt['source']).toBe(`self-reported at the seal by the run's own office tool, from ~/.dsh/sessions/${projectKey(CWD)}/${OWN}/session.jsonl: the dsh transcript, data.usage on each assistant/message event`)
    expect(receipt['says']).toBe(`Not given in this output: duration. dsh reports no cost. ${SELF_REPORTED}`)
    expect(JSON.stringify(receipt)).not.toContain(SECRET)
    expect(answer.added).toBe(`This run's usage receipt, read from its own log ~/.dsh/sessions/${projectKey(CWD)}/${OWN}/session.jsonl (10 tokens out), went with the seal.`)
  })

  it("reads no transcript for a subagent's call, a session inherited by the process, or a session with no transcript", async () => {
    aDshTranscript(NEWER, [900])
    const unnamed = "dsh named no session of the run's own to this tool, so no transcript is this run's own."
    const cases: [Record<string, string>, unknown, string][] = [
      [anEnvironment(), aCallOf({ id: OWN, origin: 'subagent' }), unnamed],
      [anEnvironment({ DSH_SESSION_ID: OWN }), undefined, unnamed],
      [anEnvironment(), aCallOf({ id: 'a-session-with-no-transcript' }), "no transcript of the run's dsh session is in dsh's folder for its working directory."],
    ]
    for (const [env, exec, why] of cases) {
      const stand = aStandIn(theRecord('dsh'))
      await aDshTool(stand, env).execute(A_SEAL, exec)
      const receipt = theSealSent(stand.sent).dataPatch['usageReceipt'] as Record<string, unknown>
      expect(Object.keys(receipt).filter((name) => (USAGE_NUMBERS as readonly string[]).includes(name)), JSON.stringify(exec)).toEqual([])
      expect(receipt['says'], JSON.stringify(exec)).toBe(`No numbers were read at the seal: ${why} ${SELF_REPORTED}`)
    }
  })

  it('sums no part of a transcript longer than the most it reads, and says why', () => {
    aDshTranscript(OWN, Array.from({ length: 50 }, () => 1))
    const read = theSealsReceipt({ record: theRecord('dsh'), env: anEnvironment({ DSH_SESSION_ID: OWN }), cwd: CWD, limits: { most: 1_024 } })
    expect(read.receipt).not.toHaveProperty('outputTokens')
    expect(read.added).toBe("A usage receipt with no numbers: the transcript of the run's dsh session is longer than 1024 bytes, and a part of it would give a total that is too small.")
    expect(theSealsReceipt({ record: theRecord('dsh'), env: anEnvironment({ DSH_SESSION_ID: OWN }), cwd: CWD }).receipt.outputTokens).toBe(50)
  })
})

// ROUND 42 (wave 13s; the answer k0eknvS08jLE, 2): ONE WRITER. Run 2WL9TfhVa3u6's receipt held the seal's "No
// numbers were read at the seal" beside the launcher's numbers, because the two writes were merged key by key. The later
// write now replaces the earlier one whole, every key it lacks sent as null, which the office's merge deletes; unless it
// has no numbers and the stored receipt has some, which then stays, with only its words added. The launcher-first order
// is here; the seal-first order is in tests/sandbox-launcher.test.ts.
describe('Round 42: a seal written after the launcher’s receipt replaces it whole, and never makes it worse', () => {
  const THE_LAUNCHERS = {
    runtime: 'claude-code', inputTokens: 2, cachedInputTokens: 9978, outputTokens: 4, costUsd: 0.110209, durationMs: 1544,
    source: '--output-format json envelope', says: 'Read by the launcher.', paidBy: 'the Claude Code login in CLAUDE_CODE_OAUTH_TOKEN', ranIn: 'in the sandbox w13s',
  }

  it('sends every key of the stored receipt that its own reading lacks as null, so none of it is left beside its numbers', async () => {
    aTranscript(SESSION, [anAnswer('msg_1', began + 1_000, 7)])
    const stand = aStandIn({ ...theRecord(), data: { ...theRecord().data, usageReceipt: THE_LAUNCHERS } })
    await askTheOffice(A_SEAL, { fetchImpl: stand.fetchImpl, env: anEnvironment() })
    const receipt = theSealSent(stand.sent).dataPatch['usageReceipt'] as Record<string, unknown>
    expect(receipt).toMatchObject({ outputTokens: 7, costUsd: null, durationMs: null, paidBy: 'not reported' })
    expect(receipt['source']).toMatch(/^self-reported at the seal/)
    expect(receipt['says']).toContain(SELF_REPORTED)
    expect(receipt['says']).not.toContain('Read by the launcher.')
  })

  it('keeps a stored receipt that holds numbers whole when the seal read none, and only adds why, once', async () => {
    const stand = aStandIn({ ...theRecord(), data: { ...theRecord().data, usageReceipt: THE_LAUNCHERS } })
    const env = anEnvironment({ CLAUDE_CODE_SESSION_ID: '7e6d5c4b-1111-4222-8333-444455556666' })
    const answer = await askTheOffice(A_SEAL, { fetchImpl: stand.fetchImpl, env })
    const read = theSealsReceipt({ record: theRecord(), env })
    expect(read.receipt).not.toHaveProperty('outputTokens')
    expect(theSealSent(stand.sent).dataPatch['usageReceipt']).toEqual({ says: `Read by the launcher. ${A_LATER_READING_FOUND_NO_NUMBERS}${String(read.receipt.says)}` })
    expect(answer.added).toBe(`${read.added} The run's record already held numbers, so they were kept, and only these words were added to its receipt.`)
  })
})

// PROBLEM IjCVX5KFlViv. The first finish write of run 6OyZeab-BaTJ was answered with the office's reminder before the
// seal, 200 with newSeq null and sealed false, and nothing was stored. The tool still said the run's usage receipt went
// with the seal. That sentence is written before the seal is sent, so it may stand only beside an answer that shows the
// write stored.
describe('a seal the office did not store', () => {
  it.each([
    ['its reminder before the seal', 200, { record: { id: RUN }, newSeq: null, beforeTheSeal: { sealed: false, says: 'The write was not stored.' } }, 'its answer has newSeq null'],
    ['a refusal', 409, { error: 'A synthetic refusal.' }, 'it answered 409'],
  ])('says no receipt went with a seal when the office answers %s', async (_what, status, reply, why) => {
    aTranscript(SESSION, [anAnswer('msg_1', began + 1_000, 7)])
    const answered = (async (_url: string, init: { method: string }) => init.method === 'GET'
      ? new Response(JSON.stringify({ record: theRecord() }), { status: 200 })
      : new Response(JSON.stringify(reply), { status })) as unknown as typeof fetch
    const answer = await askTheOffice(A_SEAL, { fetchImpl: answered, env: anEnvironment() })
    expect(answer.added).toBe(`The office's answer does not show this write stored (${why}), so no usage receipt went with a seal. The receipt is read again when the write is sent again.`)
    expect(renderOfficeAnswer(A_SEAL, answer)[0]?.text).not.toContain('went with the seal')
  })
})
