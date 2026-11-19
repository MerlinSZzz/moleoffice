// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * THE TOOLS THAT START RUNS ASK THE OFFICE FOR THE MODEL, AND A --model FLAG STILL WINS. Criterion U2.
 *
 * Two tools, each driven for real against a throwaway office on a free port:
 *
 *   tools/agent-worker.mjs    serves one queued run addressed to a durable agent, with a stand-in
 *                             `claude` on PATH that writes the arguments it was given to a file.
 *   tools/sandbox-start.mjs   files an agent run in a sandbox instance made for this test, and runs
 *                             `true` as its command. The run record says which model it was filed with.
 *
 * For each: with no --model the office's answer is used (the agent's own model, set on its profile
 * through the office's door), and with --model the flag is used. The launcher also refuses, and
 * starts nothing, when no flag is given and neither the agent's own model nor a casting marked for its
 * role card names one: it never takes the office's .env default (message MqebF8x7juih, 30
 * September 2026), and it names the next step once. Adding "Give --model" after that reason again turns
 * the refusal case red.
 *
 * The third tool, tools/the-inspector.mjs, is proved in tests/the-checks-model-and-clock-are-settings.test.ts.
 * No model is called: `claude` here is a script of this test's own.
 */
import type { AddressInfo } from 'node:net'
import { execFileSync, spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_FACTS_VARIABLE, theFactsAStartIsGiven } from '../tools/sandbox-common.mjs'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const WORKSPACE = 'default'
const PERSON = { 'content-type': 'application/json', 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string) => ({ 'content-type': 'application/json', 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })

let t: TestDb
let app: FastifyInstance
let api = ''
let scratch = ''
let bin = ''
let argvFile = ''
let workerId = ''
let starterSession = ''
let instance = ''
let theFactsGiven: Record<string, string> = {}

async function ask(method: string, path: string, headers: Record<string, string>, payload?: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: method as 'GET', url: path, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  if (reply.statusCode < 200 || reply.statusCode >= 300) throw new Error(`${method} ${path}: ${reply.statusCode} ${reply.body}`)
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

function run(program: string, args: string[], env: Record<string, string> = {}): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [program, ...args], {
      cwd: CHECKOUT,
      env: { ...withoutInheritedEffort(), PATH: `${bin}:${process.env['PATH'] ?? ''}`, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    let err = ''
    child.stdout.on('data', (data) => { out += String(data) })
    child.stderr.on('data', (data) => { err += String(data) })
    child.on('close', (code) => resolve({ code, out, err }))
  })
}

/** Queue one run for the agent worker, addressed to the durable agent `model-builder`. */
async function queueARun(): Promise<string> {
  const started = await ask('POST', '/api/agent/threads', PERSON, { title: 'A builder brief for the model test', mode: 'direct' })
  const thread = (started['thread'] as { id: string }).id
  await ask('POST', `/api/agent/threads/${thread}/messages`, PERSON, { intent: 'change', body: 'Say which model you are.', recipient: { kind: 'agent', agentId: workerId } })
  const sent = await ask('POST', `/api/agent/threads/${thread}/dispatch`, { ...PERSON, ...thePersonsKeyHeader() })
  return ((sent['runs'] as { id: string }[])[0]!).id
}

/** The model the stand-in claude was last given, read from the arguments it wrote. */
function theModelClaudeWasGiven(): string | null {
  if (!existsSync(argvFile)) return null
  const argv = JSON.parse(readFileSync(argvFile, 'utf8')) as string[]
  const at = argv.indexOf('--model')
  return at === -1 ? null : (argv[at + 1] ?? null)
}

beforeAll(async () => {
  t = await freshDb()
  const workspaces = await import('../src/server/lib/workspaces.ts')
  // The agent worker files its own session in the home project, which a fresh database does not hold.
  workspaces.createWorkspace({ id: 'panelx', title: 'Mole Office', note: 'the home project the agent worker writes to' })
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`

  scratch = mkdtempSync(join(tmpdir(), 'mole-office-tools-ask-for-the-model-'))
  bin = join(scratch, 'bin')
  mkdirSync(bin)
  argvFile = join(scratch, 'claude-argv.json')
  const envelope = { type: 'result', subtype: 'success', is_error: false, session_id: '22222222-2222-2222-2222-222222222222', result: JSON.stringify({ answer: 'A stand-in answer.' }) }
  writeFileSync(
    join(bin, 'claude'),
    '#!/usr/bin/env node\n' +
      `require('fs').writeFileSync(${JSON.stringify(argvFile)}, JSON.stringify(process.argv.slice(2)))\n` +
      `process.stdout.write(${JSON.stringify(JSON.stringify(envelope))} + '\\n')\n`,
  )
  chmodSync(join(bin, 'claude'), 0o755)

  await ask('POST', '/api/agents/started', PERSON, { handle: 'model-starter', name: 'Model starter', role: 'secretary', runtime: 'claude-code' })
  await ask('POST', '/api/agents/started', asAgent('model-starter'), { handle: 'model-builder', name: 'Model builder', role: 'worker', runtime: 'claude-code', workArea: ['src'] })
  // A THREAD MESSAGE NAMES A DURABLE AGENT BY THE ID OF ITS OWN RECORD, and that is what the agent
  // worker hands the office's door.
  workerId = (t.client.sqlite.prepare("SELECT m.record_id AS id FROM agent_records m JOIN agents a ON a.id = m.agent_id WHERE a.handle = 'model-builder'").get() as { id: string }).id
  await ask('POST', '/api/office/run-models/agent/model-builder', PERSON, { model: 'claude-opus-5-5' })
  const session = await ask('POST', '/api/records', asAgent('model-starter'), { kind: 'session', title: 'The starter of the launcher test', data: { state: 'running' } })
  starterSession = (session['record'] as { id: string }).id

  // A SANDBOX INSTANCE OF THIS TEST'S OWN: a folder with the facts a launcher reads, and a repo folder
  // for the run to work in. Nothing here is a container.
  instance = join(scratch, 'instance')
  mkdirSync(join(instance, 'repo'), { recursive: true })
  // A RUN IS FILED ABOUT A CHECKOUT WITH A TIP, so the repo folder is a git repository with one commit.
  const git = (...args: string[]) => execFileSync('git', ['-C', join(instance, 'repo'), ...args], { encoding: 'utf8' })
  git('init', '-q', '-b', 'main')
  git('-c', 'user.name=model-test', '-c', 'user.email=model-test@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'A fixture commit')
  const facts = { instance: 'model-test', template: 'mole-office-dev', containerRow: 'no-container-in-this-test', ref: 'main', from: CHECKOUT }
  writeFileSync(join(instance, 'instance.json'), JSON.stringify(facts))
  // THE HELPER IS GIVEN THE FACTS in its environment, as the launcher on the host gives them, and never reads the folder.
  theFactsGiven = { [THE_FACTS_VARIABLE]: theFactsAStartIsGiven(facts) }
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

describe('tools/agent-worker.mjs', () => {
  const WORKER = join(CHECKOUT, 'tools', 'agent-worker.mjs')

  it('with no --model, gives the run the model the office names for its agent', async () => {
    const runId = await queueARun()
    const ran = await run(WORKER, ['--once', '--api', api, '--name', 'claude-code@model-test'])
    expect(ran.code, `${ran.out}\n${ran.err}`).toBe(0)
    expect(ran.out).toContain('claude-opus-5-5')
    expect(theModelClaudeWasGiven()).toBe('claude-opus-5-5')
    const state = t.client.sqlite.prepare('SELECT state FROM agent_runs WHERE id = ?').get(runId) as { state: string }
    expect(state.state).toBe('finished')
  }, 90_000)

  it('with --model, gives the run the flag and not the office’s answer', async () => {
    await queueARun()
    const ran = await run(WORKER, ['--once', '--api', api, '--name', 'claude-code@model-test', '--model', 'claude-sonnet-5'])
    expect(ran.code, `${ran.out}\n${ran.err}`).toBe(0)
    expect(theModelClaudeWasGiven()).toBe('claude-sonnet-5')
  }, 90_000)
})

describe('tools/sandbox-start.mjs', () => {
  const LAUNCHER = join(CHECKOUT, 'tools', 'sandbox-start.mjs')
  const common = () => ['--instance', instance, '--as', 'model-starter', '--session', starterSession, '--workspace', WORKSPACE, '--api', api, '--agent', 'model-builder', '--cut-from', 'main']

  /** The model on the newest run record filed for the builder. */
  function theModelOnTheNewestRun(): unknown {
    const row = t.client.sqlite
      .prepare("SELECT data FROM records WHERE kind = 'session' AND json_extract(data, '$.servingAgent') = 'model-builder' ORDER BY rowid DESC LIMIT 1")
      .get() as { data: string } | undefined
    return row === undefined ? undefined : (JSON.parse(row.data) as Record<string, unknown>)['model']
  }

  it('with no --model, files the run with the model the office names, and says where it came from', async () => {
    const ran = await run(LAUNCHER, [...common(), '--verbose', '--runtime', 'claude-code', '--', 'true'], theFactsGiven)
    expect(ran.err).toContain("the model is claude-opus-5-5, the agent's own model on its profile. The office says: claude-opus-5-5 is this agent's own model, set on its profile.")
    expect(theModelOnTheNewestRun(), ran.err).toBe('claude-opus-5-5')
  }, 90_000)

  it('with --model, files the run with the flag', async () => {
    const ran = await run(LAUNCHER, [...common(), '--runtime', 'claude-code', '--model', 'claude-sonnet-5', '--', 'true'], theFactsGiven)
    expect(ran.err).not.toContain('the model is')
    expect(theModelOnTheNewestRun(), ran.err).toBe('claude-sonnet-5')
  }, 90_000)

  it('with no --model, refuses and starts nothing when the office names no model', async () => {
    const before = t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'session'").get() as { n: number }
    // A dsh builder: the agent's own model is for claude-code, no role default is set, and .env names
    // a model for claude-code only, so the office names none.
    const ran = await run(LAUNCHER, [...common(), '--verbose', '--runtime', 'dsh', '--', 'true'], theFactsGiven)
    expect(ran.code, ran.err).toBe(2)
    expect(ran.err).toContain(`no --model was given, and neither model-builder's own profile nor a casting marked for its role card in ${WORKSPACE} names a model for dsh`)
    expect(ran.err).toContain('Nothing was started.')
    // THE NEXT STEP IS NAMED ONCE, in the reason, and not again after it (the inspector's note, message NX1pzEZ4J48Q).
    expect(ran.err).not.toContain('Give --model')
    const after = t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'session'").get() as { n: number }
    expect(after.n).toBe(before.n)
  }, 90_000)
})
