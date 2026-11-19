// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/** A real test office and the real worker, with a stand-in for the model process. */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url))
const WORKER = fileURLToPath(new URL('../tools/agent-worker.mjs', import.meta.url))
const AGENT_KEY = fileURLToPath(new URL('../for-agents/agent-key.mjs', import.meta.url))
const asPerson = { 'x-mole-office-workspace': 'panelx', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
let t: TestDb
let app: FastifyInstance
let api: string
let person: Record<string, string>
let runId: string
let handle: string
let registryId: string
let expectedHash: string
let privateKey: string
let keyId: string
let captured: { argv: string[]; prompt: string; hash: string; actor: string; status: number; recordId: string; keyInPrompt: boolean; keyOnCommand: boolean; keyFile: string | null; aValueHoldsAKey: boolean }
let output: string
let keyFile: string
let startersKeyFile: string

async function ask(method: 'GET' | 'POST', url: string, payload?: unknown, headers = person) {
  return app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
}
async function waitingThread(): Promise<string> {
  const thread = await ask('POST', '/api/agent/threads', { title: 'Synthetic new-agent brief', mode: 'review' })
  expect(thread.statusCode).toBe(201)
  const id = thread.json().thread.id as string
  const said = await ask('POST', `/api/agent/threads/${id}/messages`, {
    intent: 'change', body: 'File a synthetic note in this test office.', recipient: { kind: 'new' },
  })
  expect(said.statusCode).toBe(201)
  return id
}

beforeAll(async () => {
  t = await freshDb()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: 'panelx', title: 'Synthetic office', note: 'Only this test uses it.' })
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const keys = JSON.parse(readFileSync(join(dirname(t.file), 'keys.json'), 'utf8')) as { person: string; office: string }
  person = { ...asPerson, 'x-mole-office-key': keys.person }
  const thread = await waitingThread()
  const dispatched = await ask('POST', `/api/agent/threads/${thread}/dispatch`)
  expect(dispatched.statusCode, dispatched.body).toBe(201)
  runId = dispatched.json().runs[0].id as string
  const row = t.client.sqlite.prepare('SELECT agent_id, request FROM agent_runs WHERE id = ?').get(runId) as { agent_id: string; request: string }
  const request = JSON.parse(row.request) as { actorId: string; agentKeyId: string }
  handle = request.actorId
  keyId = request.agentKeyId
  const { agentForRecord } = await import('../src/server/lib/participants.ts')
  registryId = agentForRecord(row.agent_id)!.id
  keyFile = join(dirname(t.file), 'agent-run-keys', runId)
  privateKey = readFileSync(keyFile, 'utf8')
  expectedHash = createHash('sha256').update(privateKey).digest('hex')
  expect(statSync(keyFile).mode & 0o777).toBe(0o600)
  expect(row.request.includes(privateKey)).toBe(false)
  expect(dispatched.body.includes(privateKey)).toBe(false)
  expect((await ask('GET', `/api/agent/threads/${thread}`)).body.includes(privateKey)).toBe(false)

  const refused = await ask('POST', `/api/agent/runs/${runId}/claim`, { worker: 'unproved fixture' }, asPerson)
  expect(refused.statusCode).toBe(403)
  expect((t.client.sqlite.prepare('SELECT state FROM agent_runs WHERE id = ?').get(runId) as { state: string }).state).toBe('queued')

  const home = join(dirname(t.file), 'child-home')
  const bin = join(home, 'bin')
  const capture = join(home, 'capture.json')
  mkdirSync(bin, { recursive: true })
  writeFileSync(join(bin, 'claude'), `#!/usr/bin/env node
const fs = require('node:fs'); const crypto = require('node:crypto');
(async () => {
  const argv = process.argv.slice(2);
  // THE PROMPT ARRIVES ON STDIN, as tools/agent-worker.mjs writes it since problem 3skPvjYAjw_4 (a large prompt in argv
  // killed the worker with E2BIG). The command line carries only the flags.
  const prompt = fs.readFileSync(0, 'utf8');
  const actor = /x-mole-office-actor-id: ([^\\n]+)/.exec(prompt)[1];
  // THE KEY IS READ AS THE CHILD'S OWN TOOLS READ IT, from the file MOLE_AGENT_KEY_FILE names.
  const { theAgentKey } = await import(${JSON.stringify(AGENT_KEY)});
  const key = theAgentKey(process.env) ?? '';
  const response = await fetch(${JSON.stringify(api)} + '/api/records', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'panelx',
      'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': actor, 'x-mole-office-key': key },
    body: JSON.stringify({ kind: 'note', title: 'Synthetic note from the new agent', data: { body: 'Written by the stand-in.' } })
  });
  const body = await response.json();
  fs.writeFileSync(${JSON.stringify(capture)}, JSON.stringify({ argv, prompt, actor, status: response.status,
    recordId: body.record?.id, hash: crypto.createHash('sha256').update(key).digest('hex'), keyFile: process.env.MOLE_AGENT_KEY_FILE ?? null,
    aValueHoldsAKey: process.env.MOLE_AGENT_KEY !== undefined,
    keyInPrompt: key !== '' && prompt.includes(key), keyOnCommand: key !== '' && argv.some(word => word.includes(key)) }), { mode: 0o600 });
  process.stdout.write(JSON.stringify({ result: JSON.stringify({ answer: 'The stand-in tried its write.' }) }));
})().catch(error => { process.stderr.write(error.message); process.exitCode = 1; });
`)
  chmodSync(join(bin, 'claude'), 0o755)
  // A STARTER'S KEY FILE beside its key: the child's tools would read it, so neither may reach the child. The worker
  // makes the run's key file under TMPDIR, so it is made here in a folder of this test's own.
  startersKeyFile = join(home, 'the-starters.key')
  mkdirSync(join(home, 'tmp'), { recursive: true })
  writeFileSync(startersKeyFile, 'e'.repeat(64) + '\n', { mode: 0o600 })
  const child = spawn(process.execPath, [WORKER, '--once', '--api', api, '--model', 'claude-opus-5-5'], {
    cwd: CHECKOUT,
    env: { ...withoutInheritedEffort(), HOME: home, PATH: bin + ':' + process.env['PATH'], MOLE_AGENT_KEY: 'synthetic-starter-key-that-must-not-reach-the-child', MOLE_AGENT_KEY_FILE: startersKeyFile, TMPDIR: join(home, 'tmp') },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  output = ''
  child.stdout.on('data', (data) => { output += String(data) })
  child.stderr.on('data', (data) => { output += String(data) })
  const code = await new Promise<number | null>((resolve, reject) => { child.on('close', resolve); child.on('error', reject) })
  expect(code).toBe(0)
  captured = JSON.parse(readFileSync(capture, 'utf8')) as typeof captured
}, 90_000)

afterAll(async () => { await app?.close(); t?.close() })

describe('a deliberately new agent', () => {
  it('writes with 201 under its registered handle and the person as starter', () => {
    expect(captured.status).toBe(201)
    expect(handle).toBe(`run-${runId.toLowerCase().replace(/_/g, '-')}-agent`)
    expect(captured.actor).toBe(handle)
    const registry = t.client.sqlite.prepare('SELECT handle, started_by_kind, started_by_id FROM agents WHERE id = ?').get(registryId)
    expect(registry).toEqual({ handle, started_by_kind: 'person', started_by_id: THE_PERSON })
    const change = t.client.sqlite.prepare("SELECT actor_id, proved_by FROM changes WHERE record_id = ? AND op = 'create'").get(captured.recordId)
    expect(change).toEqual({ actor_id: handle, proved_by: 'an-agent-key' })
    const key = t.client.sqlite.prepare('SELECT whose_id, mint_proved_by, revoked_at FROM held_keys WHERE id = ?').get(keyId) as Record<string, unknown>
    expect(key).toMatchObject({ whose_id: registryId, mint_proved_by: 'the-persons-press' })
    expect(key['revoked_at']).not.toBeNull()
    expect(existsSync(keyFile)).toBe(false)
    expect((t.client.sqlite.prepare('SELECT state FROM agent_runs WHERE id = ?').get(runId) as { state: string }).state).toBe('finished')
    const answer = t.client.sqlite.prepare("SELECT created_by FROM agent_messages WHERE run_id = ? AND role = 'agent'").get(runId)
    expect(answer).toEqual({ created_by: `agent:${handle}` })
  })

  it('hands the key on as a file of the run’s own, never as its value, and not in the prompt, command or worker log', () => {
    expect(captured.hash === expectedHash, 'the child’s tools did not read the run’s key').toBe(true)
    expect(captured.keyFile, 'the starter’s key file reached the child').not.toBe(startersKeyFile)
    expect(captured.aValueHoldsAKey, 'a key value reached the child').toBe(false)
    expect(captured.prompt).toContain('MOLE_AGENT_KEY_FILE')
    expect(captured.keyInPrompt).toBe(false)
    expect(captured.keyOnCommand).toBe(false)
    expect(existsSync(dirname(captured.keyFile!)), 'the run’s key file was left behind').toBe(false)
    expect(output.includes(privateKey)).toBe(false)
  })

  it('still refuses a keyless write under the old unregistered name with 403', async () => {
    const response = await fetch(api + '/api/records', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'panelx', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office-agent-run' },
      body: JSON.stringify({ kind: 'note', title: 'Synthetic refused note', data: { body: 'No registered writer.' } }),
    })
    expect(response.status).toBe(403)
    expect((await response.json() as { error: string }).error).toContain('Nothing is registered as the agent "mole-office-agent-run", so this write is refused.')
  })

  it('leaves no registration or key after a refused dispatch or a rolled-back run insert', async () => {
    const thread = await waitingThread()
    const snapshot = () => JSON.stringify({
      agents: t.client.sqlite.prepare('SELECT * FROM agents').all(),
      keys: t.client.sqlite.prepare('SELECT * FROM held_keys').all(),
      records: t.client.sqlite.prepare('SELECT id FROM records').all(),
      runs: t.client.sqlite.prepare('SELECT * FROM agent_runs').all(),
      files: readdirSync(dirname(keyFile)),
    })
    const before = snapshot()
    for (const headers of [asPerson, { ...asPerson, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office-agent-worker' }]) {
      const response = await ask('POST', `/api/agent/threads/${thread}/dispatch`, undefined, headers)
      expect(response.statusCode).toBe(403)
      expect(snapshot() === before).toBe(true)
    }
    expect((await ask('POST', `/api/agent/threads/${thread}/dispatch`, { unexpected: true })).statusCode).toBe(400)
    expect(snapshot() === before).toBe(true)
    t.client.sqlite.exec("CREATE TRIGGER refuse_synthetic_run BEFORE INSERT ON agent_runs BEGIN SELECT RAISE(ABORT, 'Synthetic insert failure'); END")
    const failed = await ask('POST', `/api/agent/threads/${thread}/dispatch`)
    expect(failed.statusCode, failed.body).toBe(409)
    expect(failed.body).toContain('Synthetic insert failure')
    expect(snapshot() === before).toBe(true)
    t.client.sqlite.exec('DROP TRIGGER refuse_synthetic_run')
    const sent = await ask('POST', `/api/agent/threads/${thread}/dispatch`)
    expect(sent.statusCode).toBe(201)
    const next = t.client.sqlite.prepare('SELECT request FROM agent_runs WHERE id = ?').get(sent.json().runs[0].id) as { request: string }
    expect(JSON.parse(next.request).actorId).not.toBe(handle)
  })
})
