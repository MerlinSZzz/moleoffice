// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Problem 2IwCKU0LE0Ey: a git finish checks its supplied tip and stores the sealed commit.
 * Comparing the filing tip breaks the dataPatch case that omits tip. Returning the filing
 * tip breaks both storage cases. Skipping the comparison breaks both refusal cases.
 * Both request shapes use an office and repositories made here.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let t: TestDb
let app: FastifyInstance
let seals: typeof import('../src/server/lib/sealed-tip.ts')
const directories: string[] = []
const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'finish-tip-worker' }
const git = (dir: string, ...args: string[]): string => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()

async function filedAtA() {
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-finish-tip-'))
  directories.push(dir)
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.name', 'Synthetic finish test')
  git(dir, 'config', 'user.email', 'finish@example.invalid')
  git(dir, 'config', 'commit.gpgsign', 'false')
  mkdirSync(join(dir, 'work'))
  writeFileSync(join(dir, 'work/a.txt'), 'before\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-qm', 'Synthetic commit A')
  const a = git(dir, 'rev-parse', 'HEAD')
  git(dir, 'switch', '-qc', 'worker')
  const filed = await app.inject({ method: 'POST', url: '/api/records', headers, payload: {
    kind: 'session', title: 'Synthetic finish tip run',
    data: { state: 'running', servingAgent: 'finish-tip-worker', workingDirectory: dir, cutFrom: 'main', tip: a },
  } })
  expect(filed.statusCode, filed.body).toBe(201)
  const run = t.api.getRecord(filed.json<{ record: { id: string } }>().record.id)!
  expect(run.data['tip']).toBe(a)
  writeFileSync(join(dir, 'work/a.txt'), 'after\n')
  git(dir, 'commit', '-qam', 'Synthetic commit B')
  return { dir, a, b: git(dir, 'rev-parse', 'HEAD'), run }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  seals = await import('../src/server/lib/sealed-tip.ts')
  const starter = await app.inject({ method: 'POST', url: '/api/agents/started',
    headers: { ...headers, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
    payload: { handle: 'finish-tip-starter', name: 'Synthetic starter' } })
  expect(starter.statusCode, starter.body).toBe(201)
  const worker = await app.inject({ method: 'POST', url: '/api/agents/started',
    headers: { ...headers, 'x-mole-office-actor-id': 'finish-tip-starter' },
    payload: { handle: 'finish-tip-worker', name: 'Synthetic worker', workArea: ['work'] } })
  expect(worker.statusCode, worker.body).toBe(201)
})

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
})

function finishPayload(shape: 'dataPatch' | 'data', data: Record<string, unknown>, tip?: string) {
  const finish: Record<string, unknown> = { ...(shape === 'data' ? data : {}), state: 'finished' }
  delete finish['tip']
  if (tip !== undefined) finish['tip'] = tip
  return { [shape]: finish, ...(shape === 'data' && tip === undefined ? { replace: true } : {}) }
}

it.each(['dataPatch', 'data'] as const)('%s seals B with no tip or tip B, stores B, and keeps the fork base', async (shape) => {
  for (const sent of ['absent', 'B']) {
    const { dir, a, b, run } = await filedAtA()
    const reply = await app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers,
      payload: finishPayload(shape, run.data, sent === 'B' ? b : undefined) })
    expect(reply.statusCode, reply.body).toBe(200)
    expect(reply.json().record.data.tip).toBe(b)
    const stored = t.api.getRecord(run.id)!
    expect(stored.data['state']).toBe('finished')
    expect(stored.data['tip']).toBe(b)
    expect(stored.data['cutFrom']).toBe('main')
    const sealed = seals.readRunSeal(run.id)!
    expect(sealed.seal.git?.commit).toBe(b)
    expect(sealed.seal.git?.forkBase).toBe(a)
    expect(sealed.seal.git?.files).toEqual([{ path: 'work/a.txt', hash: seals.sealHash('after\n'), mode: '100644' }])
    const revision = t.client.sqlite.prepare('SELECT data FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1').get(run.id) as { data: string }
    expect(JSON.parse(revision.data).tip).toBe(b)
    if (shape === 'dataPatch' && sent === 'absent') {
      const change = t.client.sqlite.prepare("SELECT old_value, new_value FROM changes WHERE record_id = ? AND field = 'data.tip' ORDER BY rowid DESC LIMIT 1").get(run.id)
      expect(change).toEqual({ old_value: a, new_value: b })
    }

    git(dir, 'branch', '-f', 'main', b)
    const again = await app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers,
      payload: { dataPatch: { state: 'finished' } } })
    expect(again.statusCode, again.body).toBe(200)
    expect(seals.readRunSeal(run.id)?.seal.git?.forkBase).toBe(a)
  }
})

it.each(['dataPatch', 'data'] as const)('%s refuses tip A at HEAD B with the same sentence and no write', async (shape) => {
  const { a, b, run } = await filedAtA()
  const revisions = () => t.client.sqlite.prepare('SELECT count(*) AS n FROM revisions WHERE record_id = ?').get(run.id)
  const before = revisions()
  const reply = await app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers,
    payload: finishPayload(shape, run.data, a) })
  expect(reply.statusCode, reply.body).toBe(409)
  expect(reply.json().error).toBe(`The submitted tip ${a} differs from HEAD ${b}.`)
  expect(t.api.getRecord(run.id)?.data).toEqual(run.data)
  expect(revisions()).toEqual(before)
  expect(seals.readRunSeal(run.id)).toBeNull()
})
