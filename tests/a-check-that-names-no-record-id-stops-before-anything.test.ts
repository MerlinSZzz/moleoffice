// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A --check that is not a record id stops before any office request, worktree or model.
 * The office and all executables are labelled stand-ins except the verdict door, which uses
 * a fresh synthetic database through helpers.ts. No real model or real key is used.
 * S1 removes the shape guard; S2 moves it after eligibility; S3 skips --dry; S4 rewords
 * only the tool's clause. The last case compares the tool with the real door's response.
 */
import type { FastifyInstance } from 'fastify'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, theOfficesKeyHeader, type TestDb } from './helpers.ts'
import { aMadeUpCheckSession, inspectorFixture } from './inspector-tool-fixture.ts'

const SHAPE_CLAUSE = 'which is 12 characters, each a letter, a digit, - or _'
const TOOL_REFUSAL = "--check does not hold a record id. It must hold the id of the check's own session, " +
  `${SHAPE_CLAUSE}. This tool never looks a session up by its title or by a name. Nothing was assembled and nothing was written.`
let fixture: Awaited<ReturnType<typeof inspectorFixture>>
let env: Record<string, string>
let worktreeAdded: string
let started: string
let db: TestDb
let app: FastifyInstance
let doorRefusal: string

beforeAll(async () => {
  // The same real-door helpers and synthetic inspector registration as the stopped-check test.
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const headers = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': 'default' }
  const asAgent = (id: string, key?: string) => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id,
    'x-mole-office-workspace': 'default', ...(key === undefined ? {} : { 'x-mole-office-key': key }) })
  const register = async (handle: string, role: string, from: Record<string, string>) => {
    const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: from,
      payload: { handle, name: `Synthetic ${handle}`, role, ...(role === 'worker' ? { workArea: ['src'] } : {}) } })
    expect(made.statusCode, made.body).toBe(201)
    return made.json().whatToGiveIt.key as string
  }
  const starterKey = await register('shape-starter', 'secretary', headers)
  const key = await register('shape-inspector', 'inspector', headers)
  await register('shape-worker', 'worker', asAgent('shape-starter', starterKey))
  const made = await app.inject({ method: 'POST', url: '/api/records', headers: asAgent('shape-worker'),
    payload: { kind: 'session', title: 'Synthetic shape target', data: { state: 'running', servingAgent: 'shape-worker',
      workingDirectory: process.cwd(), doing: 'Synthetic shape target' } } })
  expect(made.statusCode, made.body).toBe(201)
  const run = made.json().record.id as string
  db.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(run)
  db.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'finished') WHERE id = ?").run(run)
  const assembled = await app.inject({ method: 'POST', url: `/api/checks/${run}/assembled`,
    headers: asAgent('shape-inspector', key), payload: { changes: [] } })
  expect(assembled.statusCode, assembled.body).toBe(201)
  // The office's key, as the check tool sends it, holds any header, so the door's own 400 answers. The inspector's own
  // key does not hold this header, and the session-header binding's 403 would answer first.
  const reply = await app.inject({ method: 'POST', url: `/api/checks/${run}`,
    headers: { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'shape-inspector',
      'x-mole-office-workspace': 'default', ...theOfficesKeyHeader(), 'x-mole-office-session': 'synthetic.12' },
    payload: { verdict: 'released', check: 'Synthetic shape check.', chaptersRead: [] } })
  expect(reply.statusCode, reply.body).toBe(400)
  doorRefusal = String(reply.json().error)
  expect(db.api.getRecord(run)!.data['released']).toBeUndefined()
})
afterAll(async () => { await app?.close(); db?.close() })
beforeEach(async () => {
  fixture = await inspectorFixture()
  const bin = join(fixture.home, 'bin')
  mkdirSync(bin)
  started = join(fixture.home, 'an-executable-started')
  for (const name of ['claude', 'docker']) {
    writeFileSync(join(bin, name), `#!${process.execPath}\n// Synthetic stand-in: starts no model or container.\n` +
      `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(started)}, 'A stand-in was called.'); process.exit(97)\n`, { mode: 0o755 })
  }
  worktreeAdded = join(fixture.home, 'a-worktree-was-cut')
  const preload = join(fixture.home, 'observe-worktree-add.mjs')
  writeFileSync(preload, `// Observe real git calls, including a worktree later removed by cleanup.
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { writeFileSync } from 'node:fs'
const run = childProcess.execFileSync
childProcess.execFileSync = (command, args, options) => {
  if (command === 'git' && args.some((word, i) => word === 'worktree' && args[i + 1] === 'add')) {
    writeFileSync(${JSON.stringify(worktreeAdded)}, 'git worktree add was called.')
  }
  return run(command, args, options)
}
syncBuiltinESMExports()
`)
  env = { PATH: `${bin}:${process.env['PATH'] ?? ''}`,
    NODE_OPTIONS: `${process.env['NODE_OPTIONS'] ?? ''} --import=${pathToFileURL(preload).href}` }
})
afterEach(async () => { await fixture?.close() })

async function refusedBeforeAnything(check: string, dry = false) {
  const result = await fixture.inspect(['--check', check], env, dry ? {} : true)
  // Soft assertions retain evidence of every boundary when the unchanged source crosses them.
  expect.soft(fixture.state.requests, 'the office received a request').toEqual([])
  expect.soft(fixture.state.recordReads).toEqual([])
  expect.soft(fixture.state.writes).toEqual([])
  expect.soft(existsSync(worktreeAdded), 'git worktree add was called').toBe(false)
  expect.soft(existsSync(fixture.pathFor(check))).toBe(false)
  expect.soft(existsSync(started), 'a model or container executable was called').toBe(false)
  expect.soft(result.code, result.err).toBe(2)
  expect.soft(result.err).toContain(TOOL_REFUSAL)
  return result
}

describe('a check names a record id before anything is assembled', () => {
  it('(1) refuses 13 id characters on the host', async () => {
    await refusedBeforeAnything(`${aMadeUpCheckSession()}x`)
  })
  it.each(['11 characters', 'a dot'] as const)('(2) refuses %s on the host', async (which) => {
    const id = aMadeUpCheckSession()
    await refusedBeforeAnything(which === 'a dot' ? `${id.slice(0, -1)}.` : id.slice(0, -1))
  })
  it('(3) refuses a malformed --check even with --dry', async () => {
    await refusedBeforeAnything(`${aMadeUpCheckSession()}x`, true)
  })
  it('(4) lets a made-up record id go on to ask the office', async () => {
    const result = await fixture.inspect(['--check', aMadeUpCheckSession()], env)
    expect(result.code, result.err).toBe(0)
    expect(result.err).not.toContain('--check does not hold a record id')
    expect(fixture.state.requests.length).toBeGreaterThan(0)
    expect(existsSync(worktreeAdded)).toBe(true)
  })
  it('(5, door) refuses a non-id session header in the real verdict door with its shape clause', () => {
    expect(doorRefusal).toContain(SHAPE_CLAUSE)
  })
  it('(5, tool and door) keeps the same shape clause in both refusals', async () => {
    expect(doorRefusal).toContain(SHAPE_CLAUSE)
    const result = await fixture.inspect(['--check', `${aMadeUpCheckSession()}x`], env, true)
    expect(result.err).toContain(SHAPE_CLAUSE)
    expect(result.err).toContain(TOOL_REFUSAL)
  })
})
