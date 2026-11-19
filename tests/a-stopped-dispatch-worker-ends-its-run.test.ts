// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/** The real dispatch worker talks only to this test's office, using synthetic model programs. */
import { spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url))
let t: TestDb
let app: FastifyInstance
let api: string
let person: Record<string, string>
let noModel = false
beforeAll(async () => {
  t = await freshDb()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: 'panelx', title: 'Synthetic dispatch office' })
  app = (await apiApp()).app
  app.addHook('onRequest', async (request, reply) => {
    if (noModel && request.url.startsWith('/api/office/run-models/for/')) {
      return reply.send({ model: null, says: 'Synthetic office names no model.' })
    }
  })
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const keys = JSON.parse(readFileSync(join(dirname(t.file), 'keys.json'), 'utf8'))
  person = { 'x-mole-office-workspace': 'panelx', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-key': keys.person }
})
afterAll(async () => { await app?.close(); t?.close() })
async function post(url: string, payload: unknown = {}) {
  return app.inject({ method: 'POST', url, headers: person, payload: payload as never })
}

it.each(['answer', 'crash', 'bad output', 'cannot start', 'no model', 'SIGINT', 'SIGTERM', 'SIGKILL', 'timeout'] as const)('retires the dispatched agent after %s', async (ending) => {
  const thread = (await post('/api/agent/threads', { title: `Synthetic ${ending}`, mode: 'direct' })).json().thread.id
  expect((await post(`/api/agent/threads/${thread}/messages`, { intent: 'discuss', body: 'Synthetic run.', recipient: { kind: 'new' } })).statusCode).toBe(201)
  const sent = await post(`/api/agent/threads/${thread}/dispatch`)
  expect(sent.statusCode, sent.body).toBe(201)
  const run = sent.json().runs[0].id as string
  const home = join(dirname(t.file), `worker-${ending.replace(/ /g, '-')}`)
  const bin = join(home, 'bin')
  const ready = join(home, 'ready')
  mkdirSync(bin, { recursive: true })
  const script = ending === 'cannot start' ? '#!/synthetic-interpreter-that-does-not-exist\n' :
    `#!${process.execPath}\n` + (ending === 'answer' ? "process.stdout.write(JSON.stringify({ result: 'Synthetic answer.' }));" :
      ending === 'crash' ? 'process.exit(9);' : ending === 'bad output' ? "process.stdout.write('Synthetic non-JSON output');" :
      `require('node:fs').writeFileSync(${JSON.stringify(ready)}, 'ready'); setInterval(() => {}, 1000);`)
  writeFileSync(join(bin, 'claude'), script)
  chmodSync(join(bin, 'claude'), 0o755)
  noModel = ending === 'no model'
  const child = spawn(process.execPath, ['tools/agent-worker.mjs', '--once', '--api', api, ...(ending === 'no model' ? [] : ['--model', 'claude-opus-5-5']), '--limit', ending === 'timeout' ? '100' : '15000'], {
    cwd: CHECKOUT, env: { ...withoutInheritedEffort(), HOME: home, PATH: `${bin}:${process.env['PATH']}` }, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  })
  let output = ''
  child.stdout.on('data', (data) => { output += String(data) })
  child.stderr.on('data', (data) => { output += String(data) })
  const ended = new Promise<number | null>((resolve, reject) => { child.on('close', resolve); child.on('error', reject) })
  try {
    if (ending === 'SIGINT' || ending === 'SIGTERM' || ending === 'SIGKILL') {
      const deadline = Date.now() + 10000
      while (!existsSync(ready) && child.exitCode === null && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20))
      expect(existsSync(ready), output).toBe(true)
      if (ending === 'SIGKILL') {
        const { sendTheRemindersThatAreDue } = await import('../src/server/lib/reminders.ts')
        const tick = () => sendTheRemindersThatAreDue('panelx', new Date(), new Date(), home)
        const claimed = t.client.sqlite.prepare('SELECT claimed_by, claimed_from_machine FROM agent_runs WHERE id = ?').get(run) as { claimed_by: string; claimed_from_machine: string }
        const session = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(claimed.claimed_by) as { data: string }
        expect(JSON.parse(session.data).extra.discovered.pid).toBe(child.pid)
        // An old claim is still alive; no age or missed heartbeat can end it.
        t.client.sqlite.prepare("UPDATE agent_runs SET claimed_at = '2000-01-01 00:00:00' WHERE id = ?").run(run)
        expect(tick().crashedDispatches).not.toContain(run)
        expect(t.client.sqlite.prepare('SELECT state FROM agent_runs WHERE id = ?').get(run)).toEqual({ state: 'claimed' })
        child.kill('SIGKILL')
        expect(await ended, output).toBeNull()
        expect(child.signalCode).toBe('SIGKILL')
        t.client.sqlite.prepare('UPDATE agent_runs SET claimed_from_machine = ? WHERE id = ?').run('synthetic-remote-machine', run)
        expect(tick().crashedDispatches).not.toContain(run)
        expect(t.client.sqlite.prepare('SELECT state FROM agent_runs WHERE id = ?').get(run)).toEqual({ state: 'claimed' })
        t.client.sqlite.prepare('UPDATE agent_runs SET claimed_from_machine = ? WHERE id = ?').run(claimed.claimed_from_machine, run)
        expect(tick().crashedDispatches).toContain(run)
        expect(tick().crashedDispatches).not.toContain(run)
      } else {
        child.kill(ending)
      }
    }
    expect(await ended, output).toBe(ending === 'SIGKILL' ? null : 0)
    const row = t.client.sqlite.prepare('SELECT state, error, agent_id, request FROM agent_runs WHERE id = ?').get(run) as { state: string; error: string; agent_id: string; request: string }
    expect(row.state).toBe(ending === 'answer' ? 'finished' : ending === 'SIGKILL' ? 'crashed' : 'failed')
    if (ending === 'SIGKILL') expect(row.error).toContain(run)
    if (ending === 'no model') expect(row.error).toContain('no model')
    if (ending === 'SIGINT' || ending === 'SIGTERM') expect(row.error).toBe('The dispatch worker was stopped before this run answered.')
    const agent = t.client.sqlite.prepare('SELECT a.retired, a.retired_because FROM agents a JOIN agent_records m ON m.agent_id = a.id WHERE m.record_id = ?').get(row.agent_id) as { retired: number; retired_because: string }
    expect(agent.retired).toBe(1)
    expect(agent.retired_because).toContain(run)
    expect(existsSync(join(dirname(t.file), 'agent-run-keys', run))).toBe(false)
    const key = t.client.sqlite.prepare('SELECT revoked_at FROM held_keys WHERE id = ?').get(JSON.parse(row.request).agentKeyId) as { revoked_at: string | null }
    expect(key.revoked_at).not.toBeNull()
  } finally {
    noModel = false
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    // SIGKILL cannot let the worker stop its synthetic runtime. The group is this test's own.
    if (child.pid !== undefined) {
      try { process.kill(-child.pid, 'SIGTERM') } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
      }
    }
    await ended
  }
}, 30000)
