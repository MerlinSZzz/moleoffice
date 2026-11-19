// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A RUN'S CONDITIONS ARE ON ITS SESSION RECORD — criterion HB1. */
/**
 * WHAT IS PROVED, one case each:
 *
 *   - the session kind declares `served`, published at GET /api/kinds/session;
 *   - a `served` object that is not whole is refused;
 *   - the ordinary session door accepts it from the run's own agent, from the agent that filed
 *     the run (its launcher, when the launcher holds no run key), from the person, and from the
 *     secretary; and refuses a stranger with a sentence saying whose the field is, also when the
 *     stranger names this very run in its x-mole-office-session header, which proves nothing
 *     (problem sHmkBK2xd9YT);
 *   - on a run that names only the agent it ran as, that agent writes it with its own key; another agent's own key is
 *     refused with a 403 and nothing is stored; the person's name with no key is refused while the key window covers
 *     it, as on a run's end, with the sentence saying only the person's key counts, and nothing is stored; and the
 *     person with their key writes it;
 *   - the change log names who wrote it;
 *   - an old session without the key reads as "not recorded": the key is absent, and nothing
 *     about the record's completeness turns on that absence;
 *   - the stop hook writes it at a dsh run's end from the run's transcript — the model the
 *     provider's responses carried, the brief's bytes, and the largest single turn's input plus
 *     the total across the run from the provider's own usage rows, the stream copies never
 *     counted — and where the runtime gave nothing, the word is "not reported".
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THIS IS WRITTEN AGAINST, each after a control run
 * ---------------------------------------------------------------------------------------
 *
 *   - Take the `served` guard out of `patchRecord` (src/server/lib/records.ts) and the stranger
 *     case goes red: the write the guard refuses would be stored, and the run's conditions
 *     would be anybody's to invent.
 *   - Believe a session header naming the run again, and the case of the stranger who names this
 *     very run goes red.
 *   - Stop asking who filed the run, and the launcher's case goes red.
 *   - Read the run's own agents without its `ranAs` (`theRunsOwnAgents` in src/server/lib/the-run-a-key-holds.ts), and
 *     the case of the agent the run ran as goes red. With the source before that agent was counted, it is red too.
 *   - Count any agent as one of the run's own agents whenever the run names one, and the case of another agent's own
 *     key goes red, with the stranger cases above.
 *   - Let every caller that names the person write again (`if (actor.type === 'human') return` in place of the
 *     `theProvedPerson` line of `assertMayWriteServed`), and the case of the person's name with no key goes red.
 *   - Leave out the sentence saying only the person's key counts (`aClaimToBeThePerson` answering '' for every
 *     caller), and the same case goes red.
 *   - Take the person's key out of `theProvedPerson` (`actor.provedBy === 'the-person-key' || ` removed), and the case
 *     of the person with their key goes red.
 *   - Make the transcript reader count the stream copies of the usage rows (the exact doubling
 *     the first stock-take measured, report jDwkhne4tDWR) and the total
 *     case goes red.
 *   - Put `textOfTheTranscript` back to one `zstdDecompressSync` of the whole file and the hook
 *     case goes red: that call returns the first frame only, which is the session header line.
 *   - Stop skipping a skippable frame, and the skippable case goes red.
 *   - Find the frames by searching for the magic number's four bytes instead of walking them,
 *     and the magic-inside-a-frame case goes red.
 *   - Return the frames that decoded before a cut-short last frame, and the cut-short case goes
 *     red.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { constants, zstdCompressSync } from 'node:zlib'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { projectKey, textOfTheTranscript, theServedOfATranscript } from '../tools/dsh-hooks/served.mjs'

const STOP = fileURLToPath(new URL('../tools/dsh-hooks/stop.mjs', import.meta.url))

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string, session?: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  ...(session === undefined ? {} : { 'x-mole-office-session': session }),
})

let t: TestDb
let app: FastifyInstance

/** A running run, filed by the person or by whoever `filer` names, serving `servingAgent` when one is given. */
async function aRun(title: string, servingAgent?: string, filer: Record<string, string> = AS_THE_PERSON): Promise<string> {
  const made = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: filer,
    payload: { kind: 'session', title, data: { state: 'running', runtime: 'dsh', ...(servingAgent === undefined ? {} : { servingAgent }) } },
  })
  expect(made.statusCode, made.body).toBe(201)
  return ((made.json() as { record: { id: string } }).record).id
}

async function theDataOf(id: string): Promise<Record<string, unknown>> {
  const read = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: AS_THE_PERSON })
  expect(read.statusCode, read.body).toBe(200)
  return ((read.json() as { record: { data: Record<string, unknown> } }).record).data
}

/**
 * THE CHANGE ROWS THE `served` OBJECT WRITES, newest first.
 *
 * The log is leaf-wise: a write of the whole object is one row per leaf, `data.served.…`, and the
 * row `data.served` itself only when the object is new. All of them are the write, so filter by
 * the prefix rather than by the exact field.
 */
async function theServedChangesOf(id: string): Promise<{ actorType: string; actorId: string; field: string | null }[]> {
  const read = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: AS_THE_PERSON })
  return (((read.json() as { changes: { actorType: string; actorId: string; field: string | null }[] }).changes) ?? [])
    .filter((one) => String(one.field ?? '').startsWith('data.served'))
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // THE AGENTS THE RUNS BELOW SERVE, OR ARE FILED BY, ARE REGISTERED, as every agent that works is: a run's own agent
  // and the agent that filed it are read from the registry, never from a name a request gives.
  //
  // THE LAUNCHER IS TWO RUNGS ABOVE THE WORKER: it started the-middle, which started the-worker. So the launcher may
  // file the worker's run (an agent above it in its chain of starters, the filing door of round 30), and it is
  // not the worker's own starter, so what accepts its write of `served` below is that it filed the run.
  for (const [handle, by] of [
    ['the-run', AS_THE_PERSON],
    ['the-run-itself', AS_THE_PERSON],
    ['the-launcher', AS_THE_PERSON],
    ['the-middle', asAgent('the-launcher')],
    ['the-worker', asAgent('the-middle')],
  ] as const) {
    const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers: by, payload: { handle, name: handle } })
    expect(registered.statusCode, registered.body).toBe(201)
  }
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the session kind carries what the runtime served a run', () => {
  it('publishes `served` with its four fields through GET /api/kinds/session', async () => {
    const kinds = await app.inject({ method: 'GET', url: '/api/kinds/session', headers: AS_THE_PERSON })
    expect(kinds.statusCode, kinds.body).toBe(200)
    const fields = ((kinds.json() as { kind: { fields: { key: string }[] } }).kind).fields.map((one) => one.key)
    expect(fields).toContain('served')
    // THE REPLY'S `shapes` IS AN ARRAY, in declaration order, not a record keyed by name.
    const shapes = (kinds.json() as { shapes: { name: string; fields: { key: string }[] }[] }).shapes
    expect(shapes.find((one) => one.name === 'Served')?.fields.map((one) => one.key)).toEqual(['model', 'temperature', 'briefBytes', 'contextTokens'])
    expect(shapes.find((one) => one.name === 'ServedContextTokens')?.fields.map((one) => one.key)).toEqual(['largestTurn', 'total'])
  })

  it('refuses a served object that is not whole', async () => {
    const run = await aRun('a run sending half a served object', 'the-run')
    const reply = await app.inject({
      method: 'PATCH',
      url: `/api/records/${run}`,
      headers: asAgent('the-run', run),
      payload: { dataPatch: { served: { model: 'one-model', temperature: 0.7 } } },
    })
    expect(reply.statusCode, reply.body).toBe(400)
    expect(reply.body).toContain('briefBytes')
  })
})

describe('the ordinary session door and the three writers of served', () => {
  const A_CORRECT = { model: 'one-model', temperature: 0.7, briefBytes: 902, contextTokens: { largestTurn: 111, total: 521 } }
  let run = ''
  beforeAll(async () => {
    run = await aRun('the run whose conditions are written', 'the-run-itself')
  })

  it("accepts it from the run's own agent, which is the runner at the run's end", async () => {
    const reply = await app.inject({
      method: 'PATCH',
      url: `/api/records/${run}`,
      headers: asAgent('the-run-itself'),
      payload: { dataPatch: { served: A_CORRECT } },
    })
    expect(reply.statusCode, reply.body).toBe(200)
    expect((await theDataOf(run))['served']).toEqual(A_CORRECT)
  })

  it('refuses a stranger who names this very run in its session header, which proves nothing', async () => {
    const reply = await app.inject({
      method: 'PATCH',
      url: `/api/records/${run}`,
      headers: asAgent('a-stranger', run),
      payload: { dataPatch: { served: { model: 'invented-by-a-stranger', temperature: 0, briefBytes: 1, contextTokens: { largestTurn: 1, total: 2 } } } },
    })
    expect(reply.statusCode, reply.body).toBe(403)
    expect(reply.body).toContain('a session header naming the run does not make a caller the run')
    expect((await theDataOf(run))['served']).toEqual(A_CORRECT)
  })

  it('accepts it from the agent that filed the run, as its launcher writes it with no run key', async () => {
    const launched = await aRun('a run its launcher filed', 'the-worker', asAgent('the-launcher'))
    const reply = await app.inject({
      method: 'PATCH',
      url: `/api/records/${launched}`,
      headers: asAgent('the-launcher', launched),
      payload: { dataPatch: { served: A_CORRECT } },
    })
    expect(reply.statusCode, reply.body).toBe(200)
    expect((await theDataOf(launched))['served']).toEqual(A_CORRECT)
  })

  it('shows on the record\'s history that the run itself wrote it', async () => {
    const rows = await theServedChangesOf(run)
    const who = [...rows].reverse()
    expect(who[0]?.actorId).toBe('the-run-itself')
  })

  it('refuses a stranger, with a sentence saying whose the field is', async () => {
    const reply = await app.inject({
      method: 'PATCH',
      url: `/api/records/${run}`,
      headers: asAgent('a-stranger'),
      payload: { dataPatch: { served: { model: 'invented', temperature: 0, briefBytes: 1, contextTokens: { largestTurn: 1, total: 2 } } } },
    })
    expect(reply.statusCode, reply.body).toBe(403)
    expect(reply.body).toContain('served conditions')
    expect(reply.body).toContain('Nothing was written')
    expect((await theDataOf(run))['served']).toEqual(A_CORRECT)
  })

  it('refuses a stranger who names somebody else\u2019s run instead', async () => {
    const other = await aRun('a different run the stranger is not')
    const reply = await app.inject({
      method: 'PATCH',
      url: `/api/records/${run}`,
      headers: asAgent('a-stranger', other),
      payload: { dataPatch: { served: A_CORRECT } },
    })
    expect(reply.statusCode, reply.body).toBe(403)
  })

  it('accepts a hand-written value from the person, and the history says it was the person', async () => {
    const reply = await app.inject({
      method: 'PATCH',
      url: `/api/records/${run}`,
      headers: AS_THE_PERSON,
      payload: { dataPatch: { served: { model: 'not reported', temperature: 'not reported', briefBytes: 'not reported', contextTokens: { largestTurn: 'not reported', total: 'not reported' } } } },
    })
    expect(reply.statusCode, reply.body).toBe(200)
    // THE LIST COMES NEWEST FIRST, which is how every history in the office reads it.
    const who = (await theServedChangesOf(run))[0]
    expect(who?.actorType).toBe('human')
  })

  it('accepts a hand-written value from the secretary, whose card the register holds', async () => {
    const registered = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: AS_THE_PERSON,
      payload: { handle: 'hon-secretary', name: 'Hon Secretary', role: 'secretary' },
    })
    expect(registered.statusCode, registered.body).toBe(201)
    const reply = await app.inject({
      method: 'PATCH',
      url: `/api/records/${run}`,
      headers: asAgent('hon-secretary'),
      payload: { dataPatch: { served: { model: 'read-by-hand', temperature: 'not reported', briefBytes: 'not reported', contextTokens: { largestTurn: 'not reported', total: 'not reported' } } } },
    })
    expect(reply.statusCode, reply.body).toBe(200)
  })

  it('refuses a hand-written value from an ordinary agent, which is none of the three', async () => {
    const reply = await app.inject({
      method: 'PATCH',
      url: `/api/records/${run}`,
      headers: asAgent('hon-worker'),
      payload: { dataPatch: { served: { model: 'read-by-hand-again', temperature: 'not reported', briefBytes: 'not reported', contextTokens: { largestTurn: 'not reported', total: 'not reported' } } } },
    })
    expect(reply.statusCode, reply.body).toBe(403)
  })
})

/**
 * THE AGENT A RUN RAN AS IS THE RUN'S OWN AGENT HERE TOO. The guard on `served` asks the same reading as the guard on a
 * run's end: the run's own agents are the agent it serves and every agent it ran as. The runs below name only the agent
 * they ran as. Each writer is the actor a request would make, with its own key or with none, and the write goes
 * through `patchRecord` itself, as the cases of who may end a run do, so the actor says what the caller was proved by.
 * Each case asks for the refusal and what is stored in one comparison, so a mutation that breaks either turns it red.
 */
describe('the agent a run ran as, which is one of the run\'s own agents', () => {
  const SERVED = { model: 'one-model', temperature: 0.2, briefBytes: 640, contextTokens: { largestTurn: 90, total: 300 } }
  /** The records library, loaded after the test's own database is made, because it opens one. */
  let records: typeof import('../src/server/lib/records.ts')
  /** The registry id of the agent the runs here ran as. */
  let ranAsOne = ''

  beforeAll(async () => {
    records = await import('../src/server/lib/records.ts')
    for (const handle of ['ran-as-one', 'stranger-one']) {
      const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: handle } })
      expect(registered.statusCode, registered.body).toBe(201)
      if (handle === 'ran-as-one') ranAsOne = String((registered.json() as { agent: { id: string } }).agent.id)
    }
  })

  /** A running run that ran as the agent registered above and names no agent it serves, filed by the person. */
  async function aRunThatRanAs(): Promise<string> {
    const made = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_PERSON,
      payload: { kind: 'session', title: 'a run that ran as an agent', data: { state: 'running', runtime: 'dsh', ranAs: [{ workspaceId: 'default', agentId: ranAsOne }] } },
    })
    expect(made.statusCode, made.body).toBe(201)
    return ((made.json() as { record: { id: string } }).record).id
  }

  /** The refusal `patchRecord` throws when this actor writes the run's `served`, or null when it wrote. */
  function servedWrittenBy(run: string, actor: import('../src/server/lib/records.ts').Actor): { status: number; said: string } | null {
    try {
      records.patchRecord(run, { dataPatch: { served: SERVED } }, actor)
      return null
    } catch (refused) {
      return { status: (refused as { status: number }).status, said: String((refused as Error).message) }
    }
  }

  it('accepts it from the agent the run ran as, with its own key', async () => {
    const run = await aRunThatRanAs()
    const refused = servedWrittenBy(run, { type: 'agent', id: 'ran-as-one', from: 'this machine', provedBy: 'an-agent-key' })
    expect({ refused, served: (await theDataOf(run))['served'] }).toEqual({ refused: null, served: SERVED })
  })

  it("refuses another agent's own key on that run with a 403, and stores nothing", async () => {
    const run = await aRunThatRanAs()
    const refused = servedWrittenBy(run, { type: 'agent', id: 'stranger-one', from: 'this machine', provedBy: 'an-agent-key' })
    expect({ status: refused?.status, stored: Object.hasOwn(await theDataOf(run), 'served') }).toEqual({ status: 403, stored: false })
  })

  it("refuses the person's name with no key while the key window covers it, as a run's end does, and stores nothing", async () => {
    // A CLAIM THE KEY WINDOW COVERS, which `thePersonIsProved` counts: not here, as not on a run's end.
    const run = await aRunThatRanAs()
    const refused = servedWrittenBy(run, { type: 'human', id: THE_PERSON, from: 'this machine', theKeyWindowCovers: true })
    expect({
      status: refused?.status,
      saysTheKeyCounts: refused?.said.includes(records.ONLY_THE_PERSONS_KEY_PROVES_A_CLAIM),
      stored: Object.hasOwn(await theDataOf(run), 'served'),
    }).toEqual({ status: 403, saysTheKeyCounts: true, stored: false })
  })

  it('accepts it from the person with their key, from the same program', async () => {
    const run = await aRunThatRanAs()
    const refused = servedWrittenBy(run, { type: 'human', id: THE_PERSON, from: 'this machine', provedBy: 'the-person-key' })
    expect({ refused, served: (await theDataOf(run))['served'] }).toEqual({ refused: null, served: SERVED })
  })
})

describe('an old session without served reads as not recorded, not as broken', () => {
  it('keeps reading an old record whole, the key absent and nothing incomplete about it', async () => {
    const made = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_PERSON,
      payload: { kind: 'session', title: 'a run from before the key existed', data: { state: 'finished' } },
    })
    expect(made.statusCode, made.body).toBe(201)
    const id = ((made.json() as { record: { id: string } }).record).id
    expect(Object.hasOwn(await theDataOf(id), 'served')).toBe(false)
    const read = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: AS_THE_PERSON })
    const names = ((read.json() as { incomplete: { path: string }[] }).incomplete ?? []).map((one) => one.path)
    expect(names.some((one) => one.includes('served'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------- the stop hook's writer

/**
 * ONE ZSTD FRAME, as dsh writes each one: compressed with a checksum at the frame's end. dsh's
 * session writer (`@deepseek-ai/dsh-session-persistence-jsonl`) sets the same checksum flag.
 */
function aFrame(text: string): Buffer {
  return zstdCompressSync(Buffer.from(text), { params: { [constants.ZSTD_c_checksumFlag]: 1 } })
}

/** The lines as dsh files them: one frame per line, one after another in the file. */
function oneFramePerLine(lines: string[]): Buffer {
  return Buffer.concat(lines.map((line) => aFrame(line + '\n')))
}

/** The lines of a transcript of three assistant messages. */
function aTranscriptLines(cwd: string, thirdTurn: number, streamCopy: number): string[] {
  return [
    JSON.stringify({ type: 'session', version: 3, id: 'session-hook-transcript', cwd }),
    JSON.stringify({ type: 'request/context', data: { provider: 'a provider', model: 'the-served-model' } }),
    JSON.stringify({ type: 'assistant/message', data: { message: { source: { kind: 'model', provider: 'a provider', model: 'the-served-model' } }, usage: { inputTokens: 111 }, stream: [{ chunk: { type: 'usage', usage: { inputTokens: streamCopy } } }] } }),
    JSON.stringify({ type: 'assistant/message', data: { message: { source: { kind: 'model', provider: 'a provider', model: 'the-served-model' } }, usage: { inputTokens: 333 } } }),
    JSON.stringify({ type: 'assistant/message', data: { usage: { inputTokens: thirdTurn }, message: { source: { kind: 'model', provider: 'a provider', model: 'the-served-model' } } } }),
  ]
}

describe('the stop hook writes what the runtime served a dsh run', () => {
  let run = ''
  let scratch = ''
  let api = ''
  beforeAll(async () => {
    // THE RUNNER IS A REGISTERED AGENT BEFORE IT WRITES. The records door refuses a write under
    // an agent id no registry row holds, and every write this hook makes is under this handle.
    const registered = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: AS_THE_PERSON,
      payload: { handle: 'the-served-runner', name: 'The served runner' },
    })
    expect(registered.statusCode, registered.body).toBe(201)
    // AND THE RUN SERVES IT, as a dsh run serves the agent whose hook writes its served conditions at its end.
    run = await aRun('the dsh run the stop hook records', 'the-served-runner')
    scratch = mkdtempSync(join(tmpdir(), 'mole-served-'))
    // THE HOOK IS A REAL PROCESS AND ASKS OVER HTTP, so it has to reach this test's own server.
    // Leaving MOLE_OFFICE_API unset would send it to the live office, on the configured port.
    await app.listen({ host: '127.0.0.1', port: 0 })
    api = `http://127.0.0.1:${String((app.server!.address() as { port: number }).port)}`
  }, 60_000)
  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true })
  })

  function withHook(input: { env: Record<string, string>; payload: unknown }): Promise<{ status: number | null; stderr: string }> {
    return new Promise((done) => {
      const child = spawn(process.execPath, [STOP], {
        env: { ...process.env, MOLE_OFFICE_DB: t.file, MOLE_OFFICE_API: api, ...input.env } as NodeJS.ProcessEnv,
        cwd: process.cwd(),
      })
      let stderr = ''
      child.stderr.on('data', (chunk) => (stderr += String(chunk)))
      child.on('close', (status) => done({ status, stderr }))
      child.stdin.write(JSON.stringify(input.payload))
      child.stdin.end()
    })
  }

  it('reads the transcript\u2019s three assistant messages and stores the right largest and total, the stream copies not counted', async () => {
    const cwd = join(scratch, 'the-project')
    const sessions = join(scratch, 'the-home', 'sessions', projectKey(cwd), 'session-hook-transcript')
    mkdirSync(sessions, { recursive: true })
    // ONE FRAME PER LINE, as dsh writes a transcript. A reader that decodes only the first frame
    // reads the session header line and nothing else.
    writeFileSync(join(sessions, 'session.v3.jsonl.zstd'), oneFramePerLine(aTranscriptLines(cwd, 77, 999999)))
    const brief = join(scratch, 'the-brief.md')
    writeFileSync(brief, 'x'.repeat(365))

    const ran = await withHook({
      env: {
        DSH_HOME: join(scratch, 'the-home'),
        MOLE_OFFICE_AGENT: 'the-served-runner',
        MOLE_OFFICE_SESSION: run,
        MOLE_OFFICE_WORKSPACE: 'default',
        MOLE_OFFICE_BRIEF_PATH: brief,
      },
      payload: { cwd, session_id: 'hook-transcript' },
    })
    expect(ran.status, ran.stderr).toBe(0)

    const served = (await theDataOf(run))['served'] as Record<string, unknown> | undefined
    expect(served, ran.stderr).toBeDefined()
    expect(served?.['model']).toBe('the-served-model')
    expect(served?.['temperature']).toBe('not reported')
    expect(served?.['briefBytes']).toBe(365)
    const tokens = served?.['contextTokens'] as Record<string, unknown>
    // THE THREE REPORTS ARE 111, 333 AND 77. The 999999 beside the first is the provider's own
    // stream copy of the first message's usage; counting it would double the run's account of
    // itself, which is the counting rule the steward's stock-take writes down.
    expect(tokens['largestTurn']).toBe(333)
    expect(tokens['total']).toBe(111 + 333 + 77)
    // THE HISTORY, TOO, READS NEWEST FIRST.
    const who = (await theServedChangesOf(run))[0]
    expect(who?.actorId).toBe('the-served-runner')
  })

  it('writes the words for nothing when the transcript does not exist or holds no numbers', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'mole-served-empty-'))
    try {
      const ran = await withHook({
        env: { DSH_HOME: join(empty, 'nowhere'), MOLE_OFFICE_AGENT: 'the-served-runner', MOLE_OFFICE_SESSION: run, MOLE_OFFICE_WORKSPACE: 'default' },
        payload: { cwd: process.cwd(), session_id: 'no-such-session' },
      })
      expect(ran.status, ran.stderr).toBe(0)
      const served = (await theDataOf(run))['served'] as Record<string, unknown>
      expect(served['model']).toBe('not reported')
      expect(served['temperature']).toBe('not reported')
      expect(served['briefBytes']).toBe('not reported')
      expect(served['contextTokens']).toEqual({ largestTurn: 'not reported', total: 'not reported' })
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------- the frames of a transcript

describe('the reader reads every zstd frame of a transcript, and nothing less', () => {
  const PATH = 'session.v3.jsonl.zstd'
  const LINES = aTranscriptLines('/a/project', 77, 999999)

  /** The model and the two counts the reader makes of these bytes. */
  function theServedOf(bytes: Buffer): { model: unknown; largestTurn: unknown; total: unknown } {
    const text = textOfTheTranscript(PATH, bytes) as string | null
    const served = theServedOfATranscript(text ?? '', null) as { model: unknown; contextTokens: { largestTurn: unknown; total: unknown } }
    return { model: served.model, largestTurn: served.contextTokens.largestTurn, total: served.contextTokens.total }
  }

  it('skips a skippable frame between two frames and still reads the model', () => {
    // A SKIPPABLE FRAME IS ITS MAGIC (0x184D2A50 to 0x184D2A5F), A 4-BYTE LENGTH AND THAT MANY BYTES.
    const skippable = Buffer.alloc(8 + 5)
    skippable.writeUInt32LE(0x184d2a53, 0)
    skippable.writeUInt32LE(5, 4)
    skippable.write('dsh!!', 8)
    const bytes = Buffer.concat([aFrame(LINES.slice(0, 3).join('\n') + '\n'), skippable, aFrame(LINES.slice(3).join('\n') + '\n')])
    expect(theServedOf(bytes)).toEqual({ model: 'the-served-model', largestTurn: 333, total: 111 + 333 + 77 })
  })

  it('reads a transcript whole when the magic number\u2019s four bytes sit inside one of its frames', () => {
    // A LINE WITH A LONG FIELD THAT DOES NOT COMPRESS, the way an assistant message's signature
    // does not. Its 32768 base64 characters come from xorshift32 started at SEED. SEED was found by
    // trying seeds in turn until the frame, compressed with dsh's checksum flag by Node's own zstd,
    // held the bytes 28 B5 2F FD (the zstd magic number) inside its compressed data. A reader that
    // splits the file at those bytes cuts this frame in two and loses the line.
    const SEED = 22982
    const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    let x = SEED
    const chars = Buffer.alloc(32768)
    for (let i = 0; i < chars.length; i++) {
      x ^= x << 13
      x >>>= 0
      x ^= x >>> 17
      x ^= x << 5
      x >>>= 0
      chars[i] = BASE64.charCodeAt(x & 63)
    }
    const magicLine = '{"type":"assistant/message","data":{"message":{"source":{"kind":"model","provider":"a provider","model":"the-magic-model"}},"usage":{"inputTokens":555},"signature":"' + chars.toString('latin1') + '"}}'
    const magicFrame = aFrame(magicLine + '\n')
    // THE CASE'S OWN PREMISE, checked rather than assumed: the four bytes are inside the frame and
    // not at its start. A different zstd inside Node could compress this line differently; then
    // this line fails, and a new seed has to be found.
    const inside = magicFrame.indexOf(Buffer.from([0x28, 0xb5, 0x2f, 0xfd]), 1)
    expect(inside).toBeGreaterThan(0)
    expect(inside).toBeLessThan(magicFrame.length - 4)
    const bytes = Buffer.concat([aFrame(LINES[0] + '\n'), magicFrame, oneFramePerLine(LINES.slice(1))])
    expect(theServedOf(bytes)).toEqual({ model: 'the-magic-model, the-served-model', largestTurn: 555, total: 555 + 111 + 333 + 77 })
  })

  it('says "not reported" when the last frame is cut short, and not what the frames before it held', () => {
    const whole = oneFramePerLine(LINES)
    const cut = whole.subarray(0, whole.length - 3)
    expect(textOfTheTranscript(PATH, cut)).toBeNull()
    expect(theServedOf(cut)).toEqual({ model: 'not reported', largestTurn: 'not reported', total: 'not reported' })
  })

  it('still reads a transcript that is one frame, because one frame is a transcript too', () => {
    const bytes = zstdCompressSync(Buffer.from(LINES.join('\n') + '\n'))
    expect(theServedOf(bytes)).toEqual({ model: 'the-served-model', largestTurn: 333, total: 111 + 333 + 77 })
  })
})
