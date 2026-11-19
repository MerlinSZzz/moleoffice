// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SEAL'S NOTICE IS SAID SHORT TO A SECRETARY, AND ONCE WHEN THE RUN ALREADY TOLD ITS STARTER.
 *
 * The office must be concise but traceable. The notice a run's starter gets
 * when the run is sealed listed every file twice, as "Files (N)" and "Files outside src/ and tests/
 * (N)", so 127 files made about 12 KB, and the run's own message to its starter had usually said the
 * same thing a moment before.
 *
 *   - To a starter that holds the secretary card, the notice gives the tip, the fork base, the number
 *     of files, the folders most of them are in, and the door that lists every one.
 *   - To any starter the run's own message already reached, it is one line with the link.
 *   - To a starter that is not a secretary and was told nothing, it is as it was.
 *
 * Every agent, run and file here is made up for the test, in a fresh test database.
 *
 * MUTATIONS, EACH PROVED AFTER A CONTROL RUN (the round's report has the logs):
 *   - `toASecretary: holdsTheSecretaryCard(told.to)` made `false` in `sealFinishedRun`: cases 1 and 3 go red.
 *   - `theRunsOwnMessage` made `null` in `sealFinishedRun`: case 2 goes red.
 *   - the session condition taken out of `theRunsOwnMessageTo`: cases 1 and 3 go red.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, theOfficesOwnId, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let t: TestDb
let app: FastifyInstance
let root = ''
let base = ''
let tip = ''
let secretaryId = ''
const person = { type: 'human', id: THE_TEST_OFFICES_OWNER.id, provedBy: 'the-person-key' } as const
const asThePerson = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const asTheSecretary = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'short-seal-secretary' }

/** Twelve files: seven in src/server/, three in tests/, one in tools/ and one at the top. */
const FILES = [
  'src/server/a.ts',
  'src/server/b.ts',
  'src/server/c.ts',
  'src/server/lib/d.ts',
  'src/server/lib/e.ts',
  'src/server/api/f.ts',
  'src/server/api/g.ts',
  'tests/h.test.ts',
  'tests/i.test.ts',
  'tests/j.test.ts',
  'tools/k.mjs',
  'l.json',
]

function git(...args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env: { ...process.env, HOME: root } }).trim()
}

/** The office's notices about one run, to one participant. */
function theNoticesAbout(run: string, to: string): { body: string; saidInFull: string }[] {
  const rows = t.client.sqlite.prepare("SELECT data FROM records WHERE kind = 'message' AND deleted_at IS NULL ORDER BY rowid").all() as { data: string }[]
  return rows
    .map((row) => JSON.parse(row.data) as Record<string, unknown>)
    .filter((data) => {
      const toList = data['to'] as { kind: string; id: string }[] | undefined
      const by = data['sentBy'] as { id: string } | undefined
      return by?.id === theOfficesOwnId(t) && data['aboutRun'] === run && Array.isArray(toList) && toList.some((one) => one.id === to)
    })
    .map((data) => ({ body: String(data['body']), saidInFull: String(data['saidInFull']) }))
}

function aRun(title: string, servingAgent: string): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title,
    origin: 'fixture',
    actor: person,
    data: { state: 'running', servingAgent, workingDirectory: root, cutFrom: 'main' },
  }).id
}

function sealOf(run: string): string {
  t.api.patchRecord(run, { dataPatch: { state: 'finished', tip } }, person)
  return t.api.getRecord(run)!.data['sealedTip'] as string
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  const secretary = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asThePerson, payload: { handle: 'short-seal-secretary', name: 'Synthetic secretary', role: 'secretary' } })
  expect(secretary.statusCode, secretary.body).toBe(201)
  secretaryId = (JSON.parse(secretary.body) as { agent: { id: string } }).agent.id
  for (const handle of ['short-seal-worker', 'short-seal-teller']) {
    const worker = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asTheSecretary, payload: { handle, name: `Synthetic ${handle}`, role: 'worker', workArea: ['src', 'tools', 'tests', 'l.json'] } })
    expect(worker.statusCode, worker.body).toBe(201)
  }

  mkdirSync('.logs', { recursive: true })
  root = mkdtempSync(join(process.cwd(), '.logs', 'short-seal-'))
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'fixture@example.invalid')
  git('config', 'user.name', 'Synthetic short-seal fixture')
  writeFileSync(join(root, 'README'), 'baseline\n')
  git('add', '.')
  git('commit', '-q', '-m', 'Synthetic baseline')
  base = git('rev-parse', 'HEAD')
  git('switch', '-q', '-c', 'worker')
  for (const file of FILES) {
    mkdirSync(join(root, file, '..'), { recursive: true })
    writeFileSync(join(root, file), `// ${file}\n`)
  }
  git('add', '.')
  git('commit', '-q', '-m', 'Synthetic work')
  tip = git('rev-parse', 'HEAD')
})

afterAll(async () => {
  await app?.close()
  t?.close()
  if (root !== '') rmSync(root, { recursive: true, force: true })
})

describe('a seal notice is said short', () => {
  it('1: to a secretary it gives the tip, the count, the folders most files are in and the door, and lists no file', () => {
    const run = aRun('Synthetic run told short', 'short-seal-worker')
    const seal = sealOf(run)
    const told = theNoticesAbout(run, secretaryId)
    expect(told).toHaveLength(1)
    expect(told[0]!.body).toBe(`Run ${run} sealed`)
    expect(told[0]!.saidInFull).toBe(
      `Run ${run} of short-seal-worker was sealed as seal ${seal}, a git seal. Tip: ${tip}. Fork base: ${base}. ` +
        `Files: 12, in src/server/ (7), tests/ (3), the top folder (1), and 1 in 1 other folder. Every one: GET /api/records/${seal}.`,
    )
    expect(told[0]!.saidInFull).not.toContain('src/server/a.ts')
    expect(told[0]!.saidInFull).not.toContain('Files outside')
  })

  it("2: when the run's own message reached its starter first, the notice is one line with the link", () => {
    const run = aRun('Synthetic run that told its starter', 'short-seal-teller')
    const own = t.api.createRecord({
      workspaceId: 'default',
      kind: 'message',
      title: 'Done',
      actor: { type: 'agent', id: 'short-seal-teller', sessionId: run },
      data: { to: [{ kind: 'agent', id: secretaryId }], body: 'Done: tip and files are in my report.' },
    }).id
    const delivered = t.client.sqlite.prepare('SELECT 1 FROM message_delivery WHERE message_id = ? AND recipient_id = ?').get(own, secretaryId)
    expect(delivered, 'the control: the run’s own message has a delivery row to its starter').toBeDefined()
    const seal = sealOf(run)
    const told = theNoticesAbout(run, secretaryId)
    expect(told).toHaveLength(1)
    expect(told[0]!.saidInFull).toBe(
      `Run ${run} of short-seal-teller was sealed as seal ${seal}, a git seal at tip ${tip}. Its own message ${own} ` +
        `was sent to you before the seal. What the seal holds: GET /api/records/${seal}.`,
    )
  })

  it("3: a message the same agent wrote in another run does not count as this run's own", () => {
    const earlier = aRun('Synthetic earlier run', 'short-seal-teller')
    t.api.createRecord({
      workspaceId: 'default',
      kind: 'message',
      title: 'From the earlier run',
      actor: { type: 'agent', id: 'short-seal-teller', sessionId: earlier },
      data: { to: [{ kind: 'agent', id: secretaryId }], body: 'This was the earlier run.' },
    })
    const run = aRun('Synthetic run that told nobody', 'short-seal-teller')
    sealOf(run)
    const told = theNoticesAbout(run, secretaryId)
    expect(told).toHaveLength(1)
    expect(told[0]!.saidInFull).not.toContain('Its own message')
    expect(told[0]!.saidInFull).toContain('Files: 12, in ')
  })
})
