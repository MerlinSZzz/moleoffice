// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * M81, P83 point 5: two children of one message worker receive different keys belonging to the
 * agents they serve, never the worker's key. Each key travels in MOLE_AGENT_KEY. The recording
 * runtime writes with it and saves the key, prompt and command in a private temporary file.
 * The tests also use a run's key to write a note and try a decision reserved to the person.
 *
 * Mutation recipes, each after a green control of:
 *   node tools/run-named-tests.mjs tests/a-run-holds-its-agents-key.test.ts
 * Copy the changed file first. Run the same command with the one-line mutation, then restore
 * with cp, check with cmp, and run it again: green, red, green.
 *
 * 1. In src/worker/index.ts, change adapter.start's `key: one.inspection ? null : runKey` to
 *    `key: one.inspection ? null : settings.env['MOLE_AGENT_KEY'] ?? null`. Both children receive
 *    the made-up worker key. The different-keys case and the writes with those keys go red.
 * 2. In src/server/api/records.ts, replace the office's half of mayAsk,
 *    `(actor.provedBy === 'the-office-key' && record.data['startedByMoleOffice'] === true)`,
 *    with `false`, leaving the registered-starter half in place. The office gets no run keys;
 *    the children's key and write assertions go red.
 *
 * The privacy case has a separate mutation: restore the literal key line in src/worker/prompt.ts
 * so the prompt contains the secret instead of naming MOLE_AGENT_KEY.
 */

import type { AddressInfo } from 'node:net'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

/**
 * The worker's made-up key. No child may receive it in its environment, prompt or command.
 */
const A_WORKER_WIDE_KEY = randomBytes(32).toString('hex')

/** The office's own key file, made up so the worker's requests are read as the office's. */
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')

/** The stand-in records its input and makes one real write with the environment key. */
const RECORDING_RUNTIME = `
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
const prompt = process.argv[2] ?? ''
const actor = /x-mole-office-actor-id: (\\S+)/.exec(prompt)?.[1] ?? ''
const key = process.env.MOLE_AGENT_KEY ?? ''
const reply = await fetch(process.env.MOLE_OFFICE_API + '/api/records', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': actor, 'x-mole-office-key': key },
  body: JSON.stringify({ kind: 'note', title: 'Synthetic child write for ' + actor, data: { body: 'The child used its environment key.' } })
})
const body = await reply.json()
writeFileSync(join(process.env.PROMPT_DIR, String(process.pid) + '.json'), JSON.stringify({
  prompt, key, actor, argv: process.argv, status: reply.status, recordId: body.record?.id
}), { mode: 0o600 })
process.stdout.write(JSON.stringify({ reply: 'I read the prompt and answered.', conversation: 'recording-run-' + String(process.pid) }) + '\\n')
`

let t: TestDb
let app: FastifyInstance
let api: string
let scratch: string
let promptDir: string
let settings: WorkerSettings
const watching: Parameters<typeof onePass>[1] = []
/** The one key each registration answered, by handle, so the run keys can be told apart from them. */
const registrationKeys: Record<string, string> = {}

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The key and nothing else, so the actor id can only have come from the key. */
const THE_KEY_ALONE = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default' }

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers: AS_THE_PERSON, payload: body as never })
  return reply.json() as Record<string, unknown>
}

/** The registry id of an agent by handle, which is what a message is addressed to. */
async function agentIdFor(handle: string): Promise<string> {
  const reply = await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_PERSON })
  const listed = reply.json() as { agents?: { id: string; handle: string }[] }
  return one((listed.agents ?? []).filter((a) => a.handle === handle), `the registry row for ${handle}`).id
}

/** Register an agent and hand back the one key its registration answered. */
async function register(handle: string, name: string): Promise<string> {
  const registered = await post('/api/agents/started', { handle, name, role: 'worker', runtime: 'claude-code' })
  const key = String((registered['whatToGiveIt'] as { key?: string } | undefined)?.key)
  expect(key, `the registration of ${handle} answered no key`).toMatch(/^[0-9a-f]{64}$/)
  return key
}

/** File a message to an agent and press the start door a fresh agent needs. */
async function queueAMessageFor(handle: string, body: string): Promise<void> {
  const agentId = await agentIdFor(handle)
  const filed = await post('/api/records', {
    kind: 'message',
    title: `A message for ${handle}`,
    data: { body, to: [{ kind: 'agent', id: agentId }] },
  })
  const messageId = String((filed['record'] as { id: string }).id)
  await post(`/api/messages/${messageId}/start-an-agent`, {})
}

/** What the child received, with the environment key kept separate from the prompt. */
function actorAndKeyIn(capture: string): { actor: string; key: string; prompt: string; argv: string[]; status: number; recordId: string } {
  return JSON.parse(capture) as ReturnType<typeof actorAndKeyIn>
}

/** The private captures the two children wrote, by the agent each names. */
async function capturesByAgent(): Promise<Map<string, string>> {
  const deadline = Date.now() + 20_000
  const byAgent = new Map<string, string>()
  for (;;) {
    byAgent.clear()
    for (const name of readdirSync(promptDir)) {
      const prompt = readFileSync(join(promptDir, name), 'utf8')
      const { actor } = actorAndKeyIn(prompt)
      if (actor !== '') byAgent.set(actor, prompt)
    }
    if (byAgent.size >= 2 || Date.now() >= deadline) return byAgent
    await new Promise((go) => setTimeout(go, 100))
  }
}

async function writeWithTheKey(key: string, payload: Record<string, unknown>): Promise<{ status: number; error: string; recordId: string }> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: { ...THE_KEY_ALONE, 'x-mole-office-key': key },
    payload,
  })
  const body = reply.json() as { record?: { id?: string }; error?: string }
  return { status: reply.statusCode, error: body.error ?? '', recordId: body.record?.id ?? '' }
}

/** Who the office attributed a change to, read off the change row the write itself made. */
function actorOnTheChange(recordId: string): { type: string; id: string } | undefined {
  return t.client.sqlite
    .prepare('SELECT actor_type AS type, actor_id AS id FROM changes WHERE record_id = ? ORDER BY at DESC LIMIT 1')
    .get(recordId) as { type: string; id: string } | undefined
}

/** The registry id of the agent bearing `handle`. Since criterion I1 a new agent's id is not its handle. */
function idOf(handle: string): string {
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
}

beforeAll(async () => {
  t = await freshDb()
  // THE OFFICE'S KEY FILE IS WRITTEN BEFORE THE SERVER IS BUILT, so the server and the worker read
  // the same made-up office value and the worker's requests are read as the office's.
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-run-key-'))
  promptDir = join(scratch, 'prompts')
  mkdirSync(promptDir, { recursive: true })

  // TWO AGENTS, TWO REGISTRATION KEYS, AND ONE WORKER-WIDE KEY THAT MUST NEVER REACH A RUN.
  registrationKeys['alpha'] = await register('run-alpha', 'Run Alpha')
  registrationKeys['beta'] = await register('run-beta', 'Run Beta')

  const recording = join(scratch, 'recording-runtime.mjs')
  writeFileSync(recording, RECORDING_RUNTIME, 'utf8')

  settings = {
    api,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: aCheckoutForATestRun(),
    runs: 2,
    hops: 3,
    outputRoot: join(scratch, 'runs'),
    env: {
      ...withoutInheritedEffort(),
      HOME: scratch,
      MOLE_OFFICE_DB: t.file,
      MOLE_OFFICE_FAKE_RUNTIME: recording,
      // THE VALUE THE WORKER WAS STARTED WITH, which no run may be handed once the office mints one.
      MOLE_AGENT_KEY: A_WORKER_WIDE_KEY,
      PROMPT_DIR: promptDir,
    },
  }

  await queueAMessageFor('run-alpha', 'Say what you were told.')
  await queueAMessageFor('run-beta', 'Say what you were told.')
  // ONE PASS STARTS BOTH MESSAGES: one worker, two agents, two runs.
  await onePass(settings, watching)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(scratch, { recursive: true, force: true })
})

describe('the run the office starts carries its own agent’s key', () => {
  it('mints two runs from one worker two different keys, each its own agent’s', async () => {
    const prompts = await capturesByAgent()
    expect(prompts.size, 'the one pass did not start both runs').toBe(2)

    const alpha = actorAndKeyIn(prompts.get('run-alpha') ?? '')
    const beta = actorAndKeyIn(prompts.get('run-beta') ?? '')
    expect(alpha.key, 'the run for run-alpha was handed no key').toMatch(/^[0-9a-f]{64}$/)
    expect(beta.key, 'the run for run-beta was handed no key').toMatch(/^[0-9a-f]{64}$/)

    // THE SEAM: two runs of one worker carry two different keys.
    expect(beta.key, 'both runs were handed the same key').not.toBe(alpha.key)

    // NEITHER IS THE WORKER-WIDE VALUE, which is what a worker serving two agents used to hand both.
    expect(prompts.get('run-alpha'), 'the worker-wide key reached a run').not.toContain(A_WORKER_WIDE_KEY)
    expect(prompts.get('run-beta'), 'the worker-wide key reached a run').not.toContain(A_WORKER_WIDE_KEY)

    // AND NEITHER IS EITHER AGENT'S REGISTRATION KEY: a run key is one more live key of its holder.
    expect([alpha.key, beta.key]).not.toContain(registrationKeys['alpha'])
    expect([alpha.key, beta.key]).not.toContain(registrationKeys['beta'])
  })

  it('keeps each key out of the prompt and command while the child writes under its own name', async () => {
    const captures = await capturesByAgent()
    expect(captures.size).toBe(2)
    for (const [agent, saved] of captures) {
      const child = actorAndKeyIn(saved)
      expect(child.prompt.includes(child.key)).toBe(false)
      expect(child.prompt).toContain('MOLE_AGENT_KEY')
      expect(child.argv.some((arg) => arg.includes(child.key))).toBe(false)
      expect(child.status).toBe(201)
      expect(actorOnTheChange(child.recordId)).toEqual({ type: 'agent', id: agent })
    }
  })

  it('does not mint a key for an agent that is not the served agent’s registered starter', async () => {
    const betaId = await agentIdFor('run-beta')
    // ALPHA'S OWN REGISTRATION KEY, claiming a run it did not start and naming BETA as the agent it
    // serves. Alpha is not Beta's registered starter, so this must answer no run key.
    const reply = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...THE_KEY_ALONE, 'x-mole-office-key': registrationKeys['alpha'] },
      payload: {
        kind: 'session',
        title: 'a session a worker claims the office started',
        data: {
          state: 'running',
          runtime: 'claude-code',
          startedByMoleOffice: true,
          servingAgent: betaId,
          doing: 'nothing this agent was asked to do',
        },
      },
    })
    const body = reply.json() as { runKey?: unknown }
    // REFUSED OUTRIGHT since the filing door (round 30): alpha is neither beta nor above it, so the session is
    // not filed at all, and no key is answered.
    expect(reply.statusCode, reply.body).toBe(403)
    expect(reply.body).toContain('may not file or change a session for it')
    expect(body.runKey, 'an agent minted a run key for another agent').toBeUndefined()
  })

  it('is driven as its own agent, and refused the person’s act', async () => {
    const prompts = await capturesByAgent()
    const alphaKey = actorAndKeyIn(prompts.get('run-alpha') ?? '').key

    // THE CONTROL: while the run key lives, a note written with the key alone is the agent's.
    const wrote = await writeWithTheKey(alphaKey, {
      kind: 'note',
      title: 'Written with the run key alone',
      data: { body: 'The run key names the agent it was minted for.' },
    })
    expect(wrote.status, wrote.error).toBe(201)
    expect(actorOnTheChange(wrote.recordId)).toEqual({ type: 'agent', id: idOf('run-alpha') })

    // AND THE PERSON'S OWN ACT WITH THE SAME KEY IS REFUSED, because a run's key is the agent's and
    // an agent is never the person.
    const refused = await writeWithTheKey(alphaKey, {
      kind: 'decision',
      title: 'A run key cannot decide',
      data: { because: 'it is the person’s' },
    })
    expect(refused.status, `the run key wrote a decision: ${refused.recordId}`).toBe(403)
    expect(refused.error.length, 'the refusal carried no sentence').toBeGreaterThan(0)
  })
})
