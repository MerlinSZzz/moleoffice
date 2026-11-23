// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A finishing run's Git read must not hold the server's request thread. A stand-in Git holds each walk of the tree
 * (`ls-files --others`), so another request must answer before that Git is let go. Which walk is the seal's is read
 * from the finish's log line, which names the questions each read held, so no order of the Git calls is assumed. The
 * repository and office are made for this test; no live office is used.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { aGitThatWaits, aRepository, asAgent, git, theOfficesCheckers, type AGitThatWaits } from './a-seal-read-fixture.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let held: AGitThatWaits
let scratch = ''
let directory = ''
const lines: Record<string, unknown>[] = []

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-finish-read-'))
  held = aGitThatWaits(scratch)
  t = await freshDb()
  const { buildApp } = await import('../src/server/index.ts')
  let waiting = ''
  const log = {
    write(msg: string) {
      waiting += msg
      for (let end = waiting.indexOf('\n'); end !== -1; end = waiting.indexOf('\n')) {
        const one = waiting.slice(0, end)
        waiting = waiting.slice(end + 1)
        if (one.trim() !== '') lines.push(JSON.parse(one) as Record<string, unknown>)
      }
    },
  }
  app = (await buildApp({ production: false, webDir: '/nonexistent', webAppUrl: 'http://localhost:5173', logLevel: 'info', logStream: log })).app
  await app.ready()
  await theOfficesCheckers(app)
  const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle), payload: { handle: 'finish-test-worker', name: 'Finish Test Worker', role: 'worker', workArea: ['work'] } })
  expect(registered.statusCode, registered.body).toBe(201)
  directory = aRepository(join(scratch, 'repository'))
  git(directory, 'switch', '-qc', 'feature')
  writeFileSync(join(directory, 'work', 'feature.txt'), 'A change for this test.\n')
  git(directory, 'add', '-A')
  git(directory, 'commit', '-qm', 'The change under test')
}, 60_000)

afterAll(async () => {
  held?.stopHolding()
  await app?.close()
  t?.close()
  held?.remove()
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

async function aRun(title: string): Promise<string> {
  const filed = await app.inject({ method: 'POST', url: '/api/records', headers: asAgent('finish-test-worker'), payload: { kind: 'session', title, data: { state: 'running', servingAgent: 'finish-test-worker', workingDirectory: directory, cutFrom: 'main' } } })
  expect(filed.statusCode, filed.body).toBe(201)
  return (filed.json() as { record: { id: string } }).record.id
}

/**
 * Finish `run` with every walk of the tree held, and answer another request while each is held. Says, for each walk in
 * the order held, whether the other request was answered while it was still held.
 */
async function finishWithEachWalkHeld(run: string): Promise<{ status: number; body: string; answered: boolean[]; line: string }> {
  const mark = lines.length
  held.holdEach('--others')
  let settled = false
  const finished = app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: asAgent('finish-test-worker'), payload: { dataPatch: { state: 'finished' }, remindBeforeTheSeal: false } }).then((reply) => {
    settled = true
    return reply
  })
  const answered: boolean[] = []
  const seen = new Set<string>()
  while (!settled) {
    for (const one of held.heldNow()) {
      if (seen.has(one.id)) continue
      seen.add(one.id)
      const other = await app.inject({ method: 'GET', url: `/api/records/${run}`, headers: asAgent('finish-test-worker') })
      answered.push(other.statusCode === 200 && held.stillHeld(one))
      held.letGoOf(one)
    }
    await new Promise((done) => setTimeout(done, 5))
  }
  const all = held.stopHolding()
  expect(all.filter((one) => one.alone), 'a walk ran on the server thread').toEqual([])
  const reply = await finished
  const line = lines.slice(mark).filter((one) => 'finishParts' in one).map((one) => String(one['msg']))
  expect(line).toHaveLength(1)
  return { status: reply.statusCode, body: reply.body, answered, line: line[0] ?? '' }
}

it('answers another request while the finish reads its git', async () => {
  const finished = await finishWithEachWalkHeld(await aRun('A run to finish'))
  expect(finished.status, finished.body).toBe(200)
  expect(finished.answered.length, 'the finish walked no tree, so this case proves nothing').toBeGreaterThan(0)
  expect(finished.answered.every(Boolean), JSON.stringify(finished.answered)).toBe(true)
}, 40_000)

it('answers another request while the actual seal capture reads the tree', async () => {
  const finished = await finishWithEachWalkHeld(await aRun('Another run to finish'))
  expect(finished.status, finished.body).toBe(200)
  // THE READS THE LINE NAMES, in order: one walk each, and the seal's is the one that held a question of the seal.
  const reads = [...finished.line.matchAll(/the git read apart after pass \d+, for (\d+) of the facts and (\d+) of the seal(?:, and \d+ of the commits past the cut)?(?:, and \d+ of the run's own commits)? [\d.]+ ms, waited on another thread while the server answered other requests/g)]
  expect(reads, finished.line).toHaveLength(finished.answered.length)
  const theSeals = reads.flatMap((one, at) => (Number(one[2]) > 0 ? [at] : []))
  expect(theSeals.length, `no read held the seal's question: ${finished.line}`).toBeGreaterThan(0)
  for (const at of theSeals) expect(finished.answered[at], `the seal's walk, read ${String(at + 1)}, was not held while another request was answered`).toBe(true)
}, 40_000)
