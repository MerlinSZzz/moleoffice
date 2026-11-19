// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TOOLS THAT FILE AND REGISTER A RUN TAKE THE MARKED CASTING WHEN NO MODEL IS NAMED.
 * It rests on a decision on the casting table (选角表), one on several castings for each role, and item 3 of a
 * third.
 *
 * Driven for real, as a caller runs them, against a throwaway office on a free port:
 *
 *   tools/register-a-run.mjs            with no --model, files the run with the model of the casting the
 *                                       tools take for the agent's role card (the one marked "The tools
 *                                       take this one"), on the run's --runtime, and says on one line which
 *                                       casting and which decision. Another casting of the same role is not
 *                                       taken until the mark moves to it. With --model, the flag always wins.
 *                                       When the table marks no casting, or the marked one names its model for
 *                                       another program, nothing is written and the refusal says so. The
 *                                       agent's own model on its profile comes before the casting (
 *                                       message MqebF8x7juih, 30 September 2026), and it says so on one line.
 *   tools/register-a-started-agent.mjs  records no model, and prints which casting the tools take for the
 *                                       role, or that the table marks none.
 *
 * No model is called.
 *
 * MUTATION PROOF (30 September 2026), each alone: tools/register-a-run.mjs not asking the run-models door for the
 * agent's own model turns the last case of tools/register-a-run.mjs red, the casting's model filed in its place; its
 * refusal when no casting is marked naming no Casting page turns the first case red.
 */
import type { AddressInfo } from 'node:net'
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const WORKSPACE = 'default'
const PERSON = { 'content-type': 'application/json', 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string) => ({ 'content-type': 'application/json', 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })

let t: TestDb
let app: FastifyInstance
let api = ''
let starterSession = ''
let decision = ''
/** The worker casting that carries the mark, and a second one that does not. */
let marked = 0
let other = 0

async function ask(method: string, path: string, headers: Record<string, string>, payload?: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: method as 'GET', url: path, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  if (reply.statusCode < 200 || reply.statusCode >= 300) throw new Error(`${method} ${path}: ${reply.statusCode} ${reply.body}`)
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

function run(program: string, args: string[]): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolve) => {
    const env = { ...process.env }
    delete env['MOLE_AGENT_KEY']
    const child = spawn(process.execPath, [program, ...args], { cwd: CHECKOUT, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (data) => { out += String(data) })
    child.stderr.on('data', (data) => { err += String(data) })
    child.on('close', (code) => resolve({ code, out, err }))
  })
}

function sessions(): number {
  return (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'session'").get() as { n: number }).n
}

/** The model on the newest run record filed for the builder. */
function theModelOnTheNewestRun(): unknown {
  const row = t.client.sqlite
    .prepare("SELECT data FROM records WHERE kind = 'session' AND json_extract(data, '$.servingAgent') = 'cast-builder' ORDER BY rowid DESC LIMIT 1")
    .get() as { data: string } | undefined
  return row === undefined ? undefined : (JSON.parse(row.data) as Record<string, unknown>)['model']
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  await ask('POST', '/api/agents/started', PERSON, { handle: 'cast-starter', name: 'Cast starter', role: 'secretary', runtime: 'claude-code' })
  await ask('POST', '/api/agents/started', asAgent('cast-starter'), { handle: 'cast-builder', name: 'Cast builder', role: 'worker', runtime: 'claude-code', workArea: ['src'] })
  const session = await ask('POST', '/api/records', asAgent('cast-starter'), { kind: 'session', title: 'The starter of the Casting tool test', data: { state: 'running' } })
  starterSession = (session['record'] as { id: string }).id
  const filed = await ask('POST', '/api/records', PERSON, { kind: 'decision', title: 'The test decides the worker model', data: { replaces: [] } })
  decision = (filed['record'] as { id: string }).id
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('tools/register-a-run.mjs', () => {
  const TOOL = `${CHECKOUT}/tools/register-a-run.mjs`
  const common = (runtime: string) => [
    '--handle', 'cast-builder', '--worktree', CHECKOUT, '--cut-from', 'main', '--runtime', runtime,
    '--as', 'cast-starter', '--session', starterSession, '--workspace', WORKSPACE, '--api', api,
  ]

  it('with no --model and no model in the Casting table, refuses and writes nothing', async () => {
    const before = sessions()
    const ran = await run(TOOL, common('claude-code'))
    expect(ran.code, ran.err).toBe(2)
    expect(ran.err).toContain('No --model was given, and the Casting table marks no casting for worker in default, so the tools have no casting to take. Give --model <model>, or ask the person to mark a casting for worker on the Casting page. Nothing was written.')
    expect(sessions()).toBe(before)
  }, 90_000)

  it('with no --model, files the run with the model of the marked casting, and says which casting and which decision', async () => {
    const first = await ask('POST', '/api/casting/worker', PERSON, {
      program: { value: 'claude-code', decision },
      model: { value: 'the-cast-worker-model', decision },
      effort: { value: 'max' },
    })
    marked = (first['casting'] as { id: number }).id
    // A SECOND CASTING OF THE SAME ROLE, which does not carry the mark, so the tools do not take it.
    const second = await ask('POST', '/api/casting/worker', PERSON, { program: { value: 'claude-code' }, model: { value: 'the-unmarked-model' } })
    other = (second['casting'] as { id: number }).id
    const ran = await run(TOOL, common('claude-code'))
    expect(ran.code, ran.err).toBe(0)
    expect(ran.err).toContain(
      `The model the-cast-worker-model came from casting ${String(marked)} of the Casting table, the one the tools take for worker in default (an every-project casting), from decision ${decision}.`,
    )
    expect(ran.err).toContain(`Casting ${String(marked)} also names the effort max. This tool starts no program, so it passes no effort and records none on the run.`)
    expect(theModelOnTheNewestRun()).toBe('the-cast-worker-model')
    const row = t.client.sqlite
      .prepare("SELECT data FROM records WHERE kind = 'session' AND json_extract(data, '$.servingAgent') = 'cast-builder' ORDER BY rowid DESC LIMIT 1")
      .get() as { data: string }
    expect((JSON.parse(row.data) as Record<string, unknown>)['effort']).toBeUndefined()
  }, 90_000)

  it('takes the other casting once the mark moves to it, and the first again when it moves back', async () => {
    await ask('POST', `/api/casting/rows/${String(other)}/mark`, PERSON)
    const ran = await run(TOOL, common('claude-code'))
    expect(ran.code, ran.err).toBe(0)
    expect(ran.err).toContain(`The model the-unmarked-model came from casting ${String(other)} of the Casting table`)
    expect(theModelOnTheNewestRun()).toBe('the-unmarked-model')
    await ask('POST', `/api/casting/rows/${String(marked)}/mark`, PERSON)
  }, 90_000)

  it('with --model, files the run with the flag and asks nothing of the Casting table', async () => {
    const ran = await run(TOOL, [...common('claude-code'), '--model', 'the-flags-model'])
    expect(ran.code, ran.err).toBe(0)
    expect(ran.err).not.toContain('Casting table')
    expect(theModelOnTheNewestRun()).toBe('the-flags-model')
  }, 90_000)

  it('with no --model, does not use a model the Casting table names for another program', async () => {
    const before = sessions()
    const ran = await run(TOOL, common('dsh'))
    expect(ran.code, ran.err).toBe(2)
    expect(ran.err).toContain(`casting ${String(marked)}, the one the tools take for worker in default, names the-cast-worker-model on claude-code, while this run is on dsh, so that model is not used.`)
    expect(sessions()).toBe(before)
  }, 90_000)

  it("with no --model, files the run with the agent's own model on its profile, before the marked casting", async () => {
    // THE ORDER EVERY TOOL FOLLOWS (message MqebF8x7juih): a named --model, then the agent's own model on its
    // profile (criterion U2), then the marked casting, then a refusal.
    await ask('POST', '/api/office/run-models/agent/cast-builder', PERSON, { model: 'the-builders-own-model' })
    try {
      const ran = await run(TOOL, common('claude-code'))
      expect(ran.code, ran.err).toBe(0)
      expect(ran.err).toContain("The model the-builders-own-model is the agent's own model on its profile, which comes before the Casting table.")
      expect(ran.err).not.toContain('came from casting')
      expect(theModelOnTheNewestRun()).toBe('the-builders-own-model')
    } finally {
      await ask('POST', '/api/office/run-models/agent/cast-builder', PERSON, { model: null })
    }
  }, 90_000)
})

describe('tools/register-a-started-agent.mjs', () => {
  it('records no model, and prints what the Casting table casts the role with', async () => {
    const ran = await run(`${CHECKOUT}/tools/register-a-started-agent.mjs`, [
      '--key-file', join(mkdtempSync(join(tmpdir(), 'register-cast-')), 'agent.key'),
      '--handle', 'cast-second', '--name', 'Cast second', '--role', 'worker', '--area', 'src',
      '--as', 'cast-starter', '--session', starterSession, '--workspace', WORKSPACE, '--api', api,
    ])
    expect(ran.code, ran.err).toBe(0)
    expect(ran.out).toContain(`The tools take casting ${String(marked)} for worker in default: the model the-cast-worker-model on claude-code, effort max, from decision ${decision}.`)
    expect(ran.out).toContain('This tool records neither the model nor the effort')
  }, 90_000)

  it('says so when the Casting table marks no casting for the role', async () => {
    const ran = await run(`${CHECKOUT}/tools/register-a-started-agent.mjs`, [
      '--key-file', join(mkdtempSync(join(tmpdir(), 'register-cast-')), 'agent.key'),
      '--handle', 'cast-third', '--name', 'Cast third', '--role', 'supervisor', '--area', 'src',
      '--as', 'cast-starter', '--session', starterSession, '--workspace', WORKSPACE, '--api', api,
    ])
    expect(ran.code, ran.err).toBe(0)
    expect(ran.out).toContain('The Casting table marks no casting for supervisor in default.')
  }, 90_000)
})
