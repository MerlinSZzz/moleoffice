// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * A RUN'S CONVERSATION ID IS ON ITS RECORD FROM ITS START, AND A RUN KILLED MID-TURN KEEPS IT.
 *
 * Plan hp7Z-IW9JWSX, piece H5, for criterion W6 of design/window/ACCEPTANCE.md: a shutdown pauses
 * the runs at work, and W7 resumes them later by their conversation id. Until 3 October 2026 Claude
 * Code, Codex and OpenCode had their id read only when the run ended, so a run killed in the middle
 * of a turn left no id on its record and nothing could resume it.
 *
 * WHAT EACH CASE DOES. The worker starts a run for a message, and the test reads the run's record
 * while the run is still going: the id must be there. Then the run's process group is killed with
 * SIGKILL, which is what a crash or a machine going down looks like to the run, the worker reads
 * the ending, and the id must still be on the record.
 *
 *   - the fake runtime, asked to name its conversation and hang (tests/fake-runtime.mjs);
 *   - Claude Code, Codex and OpenCode, each through its own adapter, with a STAND-IN SCRIPT on PATH
 *     under the tool's name. Each stand-in writes down the arguments it was given and prints what
 *     the real tool prints at its start (nothing for Claude Code, Codex's `thread.started` event,
 *     OpenCode's `step_start` event), then waits. No real tool and no model is run here. Whether
 *     the real tools resume a conversation killed mid-turn was measured by hand, in the sandbox,
 *     and the round's report says what was found for each.
 *
 * Every office here is this test's own database and server. Every stand-in and fake is stopped by
 * the process group the worker wrote down.
 *
 * MUTATIONS:
 *   - src/worker/index.ts does not call `recordTheConversationOnceItIsSaid`: the fake, Codex and
 *     OpenCode cases go red, because nothing is on the record while the run is going;
 *   - src/worker/runtimes/claude-code.ts does not put its id on the handle at start: the Claude Code
 *     case goes red;
 *   - src/worker/runtimes/claude-code.ts does not pass `--session-id`: the Claude Code case goes red,
 *     because the tool was told nothing;
 *   - src/worker/runtimes/codex.ts has no `conversationSoFar`: the Codex case goes red.
 */

import type { AddressInfo } from 'node:net'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { theClaudeConversationFor } from '../src/worker/runtimes/claude-code.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'
import { LAUNCHER_MODEL_COMPATIBILITY, THE_MODELS_START_VALUES } from '../src/config/model-efforts.mjs'
import { theProviderTheLauncherAdds } from '../src/shared/worker-runs.ts'

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))
/** A model the compatibility list holds: a conversation run gets no Casting selection from this office. */
const A_KNOWN_MODEL = Object.keys(THE_MODELS_START_VALUES)[0]!
/** A Codex model the compatibility list holds: a Codex run that answers a message is started only on a model the office names. */
const A_LISTED_CODEX_MODEL = Object.keys(LAUNCHER_MODEL_COMPATIBILITY.aliases).find((name) => Object.hasOwn(LAUNCHER_MODEL_COMPATIBILITY.aliases, `${String(theProviderTheLauncherAdds('codex'))}/${name}`))

/** What Codex prints first with `--json`: the conversation it started. A stand-in's own copy of it. */
const A_CODEX_THREAD = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'
/** What OpenCode's events carry: its session. A stand-in's own copy of it. */
const AN_OPENCODE_SESSION = 'ses_standin0123456789abcdef'

let t: TestDb
let app: FastifyInstance
let api: string
let scratch: string
const watching: Parameters<typeof onePass>[1] = []

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers: AS_THE_OWNER, payload: body as object })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

async function get(path: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers: AS_THE_OWNER })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

/** The data on one run's record. */
async function theRecordOf(session: string): Promise<Record<string, unknown>> {
  const read = await get(`/api/records/${session}`)
  return ((read['record'] ?? read) as { data: Record<string, unknown> }).data
}

/**
 * A STAND-IN FOR ONE AGENT TOOL, under the tool's own name: it writes its arguments to `<name>.args`,
 * prints `first` (when there is one), and waits until it is killed.
 *
 * IT REFUSES `--version` AND `export` AT ONCE, with exit 1 and nothing printed. The worker asks every
 * tool for its version before the run starts, and asks OpenCode for the run's export when it ends.
 * Both used to wait out their time limits on the sleep below, 10 and 20 seconds, and were read as
 * unreadable. A refusal is read as unreadable too: the run's record says no version and no served
 * model could be read, either way, and only its words for why differ. No case reads either answer,
 * and `<name>.args` is now written only by the run itself.
 */
function aStandIn(folder: string, name: string, first: string | null): void {
  const script = join(folder, name)
  const print = first === null ? '' : `printf '%s\\n' '${first}'\n`
  writeFileSync(
    script,
    `#!/bin/sh\n# A stand-in for ${name}, made by this test. It runs no model.\n` +
      `case "$1" in --version|export) exit 1 ;; esac\n` +
      `printf '%s\\n' "$@" > '${join(folder, `${name}.args`)}'\n${print}exec sleep 600\n`,
  )
  chmodSync(script, 0o755)
}

/** Settings for a worker that starts real adapters, with the stand-ins first on PATH. */
function aWorker(env: NodeJS.ProcessEnv): WorkerSettings {
  return {
    api,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: aCheckoutForATestRun(),
    runs: 4,
    hops: 3,
    outputRoot: mkdtempSync(join(scratch, 'outputs-')),
    env,
  }
}

/** An agent of this runtime, with its own model when one is given, and a message to it that a run is started for. */
async function aRunFor(handle: string, runtime: string, body: string, settings: WorkerSettings, model?: string): Promise<string> {
  await post('/api/records', { kind: 'agent', title: handle, data: { handle, runtime, state: 'active' } })
  if (model !== undefined) {
    const named = await app.inject({ method: 'POST', url: `/api/office/run-models/agent/${handle}`, headers: AS_THE_OWNER, payload: { model } })
    expect(named.statusCode, named.body).toBe(200)
  }
  const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
  const agentId = one((listed.agents ?? []).filter((a) => a.handle === handle), `the registry row for ${handle}`).id
  const filed = await post('/api/records', { kind: 'message', title: `a message to ${handle}`, data: { body, to: [{ kind: 'agent', id: agentId }] } })
  const messageId = (filed['record'] as { id: string }).id
  // Criterion M78: a fresh agent's message waits for the person's press, so the press is setup here.
  await post(`/api/messages/${messageId}/start-an-agent`, {})
  const report = await onePass(settings, watching)
  return one(report.started, `the run started for ${handle}`).session
}

/** Passes until the run's record names a conversation, for up to ten seconds; the last reading either way. */
async function theConversationOnTheRecord(settings: WorkerSettings, session: string): Promise<unknown> {
  for (let tries = 0; tries < 40; tries += 1) {
    const said = (await theRecordOf(session))['providerSession']
    if (typeof said === 'string') return said
    await onePass(settings, watching)
    await sleep(250)
  }
  return (await theRecordOf(session))['providerSession']
}

/** The run this worker is watching for a session record. */
function theRunOf(session: string): (typeof watching)[number] {
  return one(watching.filter((run) => run.session === session), `the watched run for ${session}`)
}

/** Kill the run's whole process group, as a crash would, and let the worker read how it ended. */
async function killMidTurn(settings: WorkerSettings, session: string): Promise<void> {
  const run = theRunOf(session)
  expect(run.adapter.alive(run.handle), 'the run is still going when it is killed').toBe(true)
  process.kill(-run.handle.pgid, 'SIGKILL')
  for (let tries = 0; tries < 40 && watching.some((one) => one.session === session); tries += 1) {
    await sleep(250)
    await onePass(settings, watching)
  }
  const after = await theRecordOf(session)
  expect(after['state'], `the record says how the run ended: ${String(after['doing'])}`).toBe('crashed')
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-conversation-at-start-'))
}, 60_000)

afterAll(async () => {
  // Whatever is still going, stopped by the group its handle wrote down.
  for (const run of watching) {
    try {
      process.kill(-run.handle.pgid, 'SIGKILL')
    } catch {
      continue
    }
  }
  await app.close()
  t.close()
  rmSync(scratch, { recursive: true, force: true })
})

describe('a run that names its conversation while it is going', () => {
  it('has it on its record before it ends, and keeps it when killed mid-turn (the fake runtime)', async () => {
    const settings = aWorker({ ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: FAKE })
    const session = await aRunFor('fake-namer', 'claude-code', 'please name the conversation and hang', settings)
    const said = await theConversationOnTheRecord(settings, session)
    expect(said).toMatch(/^fake-[a-z0-9]+$/)
    await killMidTurn(settings, session)
    const after = await theRecordOf(session)
    expect(after['providerSession']).toBe(said)
    expect(after['state']).toBe('crashed')
  }, 60_000)
})

describe('each tool the office starts', () => {
  it('Claude Code: the id is chosen, passed with --session-id, and on the record from the start', async () => {
    const folder = mkdtempSync(join(scratch, 'claude-'))
    aStandIn(folder, 'claude', null)
    const settings = aWorker({ ...withoutInheritedEffort(), PATH: `${folder}:${process.env['PATH'] ?? ''}`, MOLE_OFFICE_FAKE_RUNTIME: '', MOLE_OFFICE_AGENT_MODEL: A_KNOWN_MODEL })
    const session = await aRunFor('claude-runner', 'claude-code', 'work on something long', settings)
    const chosen = theClaudeConversationFor(session)
    // On the record at once: the first pass started the run and wrote it, with no output read at all.
    expect((await theRecordOf(session))['providerSession']).toBe(chosen)
    for (let tries = 0; tries < 40 && !existsSync(join(folder, 'claude.args')); tries += 1) await sleep(100)
    const args = readFileSync(join(folder, 'claude.args'), 'utf8').split('\n')
    expect(args[args.indexOf('--session-id') + 1]).toBe(chosen)
    expect(args).not.toContain('--resume')
    await killMidTurn(settings, session)
    expect((await theRecordOf(session))['providerSession']).toBe(chosen)
  }, 60_000)

  it('Codex: the id is read from its first event while it is going, and kept when killed', async () => {
    const folder = mkdtempSync(join(scratch, 'codex-'))
    aStandIn(folder, 'codex', JSON.stringify({ type: 'thread.started', thread_id: A_CODEX_THREAD }))
    const settings = aWorker({ ...withoutInheritedEffort(), PATH: `${folder}:${process.env['PATH'] ?? ''}`, MOLE_OFFICE_FAKE_RUNTIME: '' })
    expect(A_LISTED_CODEX_MODEL, 'a Codex model the compatibility list names').toBeDefined()
    const session = await aRunFor('codex-runner', 'codex', 'work on something long', settings, A_LISTED_CODEX_MODEL)
    expect(await theConversationOnTheRecord(settings, session)).toBe(A_CODEX_THREAD)
    await killMidTurn(settings, session)
    expect((await theRecordOf(session))['providerSession']).toBe(A_CODEX_THREAD)
  }, 60_000)

  it('OpenCode: the id is read from its first event while it is going, and kept when killed', async () => {
    const folder = mkdtempSync(join(scratch, 'opencode-'))
    aStandIn(folder, 'opencode', JSON.stringify({ type: 'step_start', sessionID: AN_OPENCODE_SESSION }))
    const settings = aWorker({ ...withoutInheritedEffort(), PATH: `${folder}:${process.env['PATH'] ?? ''}`, MOLE_OFFICE_FAKE_RUNTIME: '' })
    const session = await aRunFor('opencode-runner', 'opencode', 'work on something long', settings)
    expect(await theConversationOnTheRecord(settings, session)).toBe(AN_OPENCODE_SESSION)
    await killMidTurn(settings, session)
    expect((await theRecordOf(session))['providerSession']).toBe(AN_OPENCODE_SESSION)
  }, 60_000)
})

describe('the Claude Code id', () => {
  it('is the same for the same run, a version-5 UUID, and different for another run', () => {
    const one = theClaudeConversationFor('aRunRecordId')
    expect(theClaudeConversationFor('aRunRecordId')).toBe(one)
    expect(one).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(theClaudeConversationFor('anotherRunId')).not.toBe(one)
  })
})
