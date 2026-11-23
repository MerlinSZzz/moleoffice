// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RECORDS SEAL WHOSE RUN'S PATCHES GIT CANNOT READ STORES THE HEAD GIT READ AS THE RUN'S END COMMIT.
 *
 * THE REAL FAULT. A run's finishing write answered 500 "internal error" when git could not print the patch log of the
 * run's own commits, and nothing was stored. That read now answers `unread`, with why. A git or mixed seal refuses
 * `unread` with 409. A records seal goes on, and it stores the run's end commit. Git read HEAD before the patches, so the
 * end commit stored is that HEAD. A sentence saying HEAD was not read would be false.
 *
 * WHAT IS PROVED.
 *   1. A records run names a cut git cannot find, so its seal does not count the commits past the cut. The run's own
 *      commits add a file and delete it, and the file's object is taken out, so git cannot print their patch log. The
 *      finishing write answers 200, the seal is a records seal, the run is finished, and the end commit it stores is the
 *      HEAD git read. Today's code answers 500 and stores nothing.
 *
 * Every repository and the office are made here in the system's temporary folder.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { FINISHED_STATES } from '../src/config/finished.mjs'
import { STILL_GOING_STATES } from '../src/config/still-going.mjs'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let seals: typeof import('../src/server/lib/sealed-tip.ts')
let scratch = ''
const STARTER = 'a-patch-read-starter'
const WORKER = 'a-patch-read-finisher'
const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': WORKER }
/** The word a run says its work is finished with (src/config/finished.mjs). */
const FINISHED = FINISHED_STATES[0]
/** A state in which a run is still going (src/config/still-going.mjs). */
const RUNNING = STILL_GOING_STATES[0]

const git = (dir: string, ...args: string[]): string => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'mo-records-seal-patches-unread-'))
  t = await freshDb()
  app = (await apiApp()).app
  seals = await import('../src/server/lib/sealed-tip.ts')
  const starter = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: { ...headers, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
    payload: { handle: STARTER, name: 'Synthetic starter' },
  })
  expect(starter.statusCode, starter.body).toBe(201)
  const worker = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: { ...headers, 'x-mole-office-actor-id': STARTER },
    payload: { handle: WORKER, name: 'Synthetic worker', workArea: ['work'] },
  })
  expect(worker.statusCode, worker.body).toBe(201)
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

it('1: a records seal whose patch log git cannot print stores the HEAD git read as the run\'s end commit', async () => {
  // A REPOSITORY with a base commit on main and the branch `work` checked out at it.
  const dir = join(scratch, 'repository')
  mkdirSync(join(dir, 'work'), { recursive: true })
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.name', 'Synthetic patch read fixture')
  git(dir, 'config', 'user.email', ['fixture', 'example.invalid'].join('@'))
  git(dir, 'config', 'commit.gpgsign', 'false')
  writeFileSync(join(dir, 'work', 'base.txt'), 'Synthetic base.\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-qm', 'Synthetic base')
  const base = git(dir, 'rev-parse', 'HEAD')
  git(dir, 'switch', '-qc', 'work')

  // THE RUN, filed at the base. It names a cut git cannot find, so a records seal does not count the commits past it.
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers,
    payload: { kind: 'session', title: 'A synthetic run whose patches cannot be read', data: { state: RUNNING, servingAgent: WORKER, workingDirectory: dir, cutFrom: 'a-branch-nobody-made' } },
  })
  expect(filed.statusCode, filed.body).toBe(201)
  const run = filed.json<{ record: { id: string } }>().record.id

  // THE RUN'S OWN COMMITS add a file and delete it. Then the file's object is taken out, so git cannot print the patches.
  writeFileSync(join(dir, 'work', 'gone.txt'), 'Synthetic file whose object is taken out.\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-qm', 'Synthetic commit that adds a file')
  const blob = git(dir, 'rev-parse', 'HEAD:work/gone.txt')
  git(dir, 'rm', '-q', 'work/gone.txt')
  git(dir, 'commit', '-qm', 'Synthetic commit that deletes it')
  const head = git(dir, 'rev-parse', 'HEAD')
  rmSync(join(dir, '.git', 'objects', blob.slice(0, 2), blob.slice(2)))
  const patches = spawnSync('git', ['-C', dir, 'log', '-p', `${base}..${head}`], { encoding: 'utf8' })
  expect(patches.status, 'git printed the patch log, so this fixture does not make the patch read fail').toBe(128)

  const wrote = await app.inject({ method: 'POST', url: '/api/records', headers: { ...headers, 'x-mole-office-session': run }, payload: { kind: 'note', title: 'A synthetic note the run wrote' } })
  expect(wrote.statusCode, wrote.body).toBe(201)
  const note = wrote.json<{ record: { id: string } }>().record.id

  const sealed = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers, payload: { dataPatch: { state: FINISHED, submission: { kind: 'records', records: [note] } } } })
  expect(sealed.statusCode, sealed.body).toBe(200)
  expect(seals.readRunSeal(run)?.seal.kind).toBe('records')
  const stored = t.api.getRecord(run)?.data
  expect(stored?.['state']).toBe(FINISHED)
  expect(stored?.['endHead']).toEqual({ commit: head, at: expect.any(String), directory: dir })
})
