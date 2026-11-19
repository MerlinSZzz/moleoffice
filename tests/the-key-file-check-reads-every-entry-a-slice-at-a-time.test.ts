// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE KEY-FILE CHECK READS EVERY ENTRY OF A SANDBOX'S out/ FOLDER, A SLICE AT A TIME, AND TELLS WHAT IT TOLD BEFORE.
 *
 * The check (src/server/lib/key-files.ts) stopped after 20,000 entries of one out/ folder. A key file past them was
 * never named. The walk up to them still held the server's one thread for seconds. Now the reminder watcher walks every
 * entry in slices, and gives the thread back between two slices. A slice goes on from the entry the last one stopped at.
 *
 * WHAT IS HELD HERE:
 *   1. A key file placed past the 20,000th entry of an out/ folder is found, and the walk counts every entry.
 *   2. The check the watcher runs finds it in more than one slice. The supervisor of the run whose key it holds is told
 *      once, in the words a notice has always used, and the agent above it once. No line in the log says the walk
 *      stopped. A second check tells nobody anything new.
 *   3. A slice whose time has already run out reads exactly one entry. So the walk goes on from where it stopped: it is
 *      done after as many slices as there are entries, and it finds the key file once.
 *   4. A notice names its files in the order the walk of whole listings gave them: a folder's own files by name, then
 *      its folders, the last name first.
 *
 * Before the code, 1, 2 and 3 are red and 4 is green: 4 holds what must not change.
 *
 * MUTATIONS, each after a control run, each put back from the commit:
 *   1. The stop after 20,000 entries of one out/ folder brought back: 1, 2 and 3 go red.
 *   2. Each slice starts the walk again from the top: 3 goes red, and 2 does not end.
 *   3. A slice that does not stop for time: 2 and 3 go red.
 *   4. The files found not put back in the order of whole listings: 4 goes red.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. The keys are minted through
 * the office's own doors. The sandboxes are a folder this test makes in its own temporary folder and removes after.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let root = ''
let inOrder = ''
// THE CHECK, imported once the throwaway database is made, as tests/helpers.ts asks.
let checks: typeof import('../src/server/lib/key-files.ts')

/** The empty files put before the key file in the out/ folder: as many as the walk used to read before it stopped. */
const FILLERS = 20_000
/** Every entry of that out/ folder: the fillers, the folder that holds the key file, and the key file. */
const ENTRIES = FILLERS + 2

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

function asAgent(handle: string, key: string, session?: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
    'x-mole-office-key': key,
    ...(session === undefined ? {} : { 'x-mole-office-session': session }),
  }
}

async function ask(method: 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.inject({ method, url, headers, payload: payload as never })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown> }
}

async function register(handle: string, by: Record<string, string>, role?: string): Promise<string> {
  const made = await ask('POST', '/api/agents/started', by, { handle, name: handle, runtime: 'claude-code', ...(role === undefined ? {} : { role }) })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return String((made.body['whatToGiveIt'] as { key?: string } | undefined)?.key)
}

function idOf(handle: string): string {
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(handle) as { id: string }).id
}

async function fileARun(handle: string, headers: Record<string, string>, extra: Record<string, unknown> = {}): Promise<{ id: string; key: string }> {
  const filed = await ask('POST', '/api/records', headers, {
    kind: 'session',
    title: `${handle} at work`,
    data: { state: 'running', runtime: 'claude-code', servingAgentId: idOf(handle), servingAgent: handle, ...extra },
  })
  expect(filed.status, JSON.stringify(filed.body)).toBe(201)
  const key = (filed.body['runKey'] as { key?: string } | undefined)?.key ?? ''
  expect(/^[0-9a-f]{64}$/.test(key), `the run of ${handle} was minted no key`).toBe(true)
  return { id: String((filed.body['record'] as { id?: string }).id), key }
}

/** A file with these words, made with its folders. */
function aFile(path: string, words: string): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, words)
}

/** The office's notices about key files: to whom, what they say in full, and the paths they keep, in their order. */
function theNotices(): { to: string; said: string; paths: string[] }[] {
  const rows = t.client.sqlite
    .prepare("SELECT data FROM records WHERE kind = 'message' AND json_extract(data, '$.extra.keyFiles') IS NOT NULL AND json_extract(data, '$.sentBy.id') = (SELECT id FROM agents WHERE handle = 'mole-office' AND retired = 0) ORDER BY created_at, rowid")
    .all() as { data: string }[]
  return rows.map((row) => {
    const data = JSON.parse(row.data) as { to: { id: string }[]; saidInFull?: string; extra: { keyFiles: { path: string }[] } }
    return { to: data.to[0]?.id ?? '', said: data.saidInFull ?? '', paths: data.extra.keyFiles.map((one) => one.path) }
  })
}

let keyFile = ''
let workersRun = ''
let workersKey = ''
const logged: string[] = []
/** The key files of the order case, in the order the walk of whole listings reached them. */
const inTheOldOrder: string[] = []

beforeAll(async () => {
  t = await freshDb()
  checks = await import('../src/server/lib/key-files.ts')
  app = (await apiApp()).app
  await app.ready()
  // THE CHAIN: the person started the launcher, the launcher the supervisor, the supervisor its worker.
  const launcherKey = await register('the-launcher', AS_THE_PERSON, 'supervisor')
  await register('a-supervisor', asAgent('the-launcher', launcherKey), 'supervisor')
  const supervisors = await fileARun('a-supervisor', asAgent('the-launcher', launcherKey))
  await register('a-worker', asAgent('a-supervisor', supervisors.key))
  const workers = await fileARun('a-worker', asAgent('a-supervisor', supervisors.key, supervisors.id), { parentAttachment: supervisors.id })
  workersRun = workers.id
  workersKey = workers.key

  // ONE SANDBOX WHOSE out/ FOLDER HOLDS 20,000 EMPTY FILES, AND A FOLDER BESIDE THEM THAT HOLDS THE KEY FILE. A folder is
  // read after the listing it is in, so the key file is the last entry of the walk, whatever order the disk keeps.
  root = mkdtempSync(join(tmpdir(), 'mole-key-file-walk-'))
  const out = join(root, 'sb-full', 'out')
  mkdirSync(out, { recursive: true })
  for (let n = 0; n < FILLERS; n += 1) writeFileSync(join(out, `f${String(n).padStart(5, '0')}`), '')
  keyFile = join(out, 'later', 'run-key')
  aFile(keyFile, `${workersKey}\n`)

  // THE ORDER CASE: the same key in five files, made in an order that is not the order of their names.
  inOrder = mkdtempSync(join(tmpdir(), 'mole-key-file-order-'))
  const there = join(inOrder, 'sb-order', 'out')
  const made = { k3: join(there, 'k3'), k5: join(there, 'z', 'k5'), k1: join(there, 'b', 'k1'), k2: join(there, 'a', 'k2'), k4: join(there, 'a', 'c', 'k4') }
  for (const path of [made.k4, made.k1, made.k5, made.k2, made.k3]) aFile(path, workersKey)
  // out/ lists a, b, k3, z: its own file k3 first, then z, b and a, the last name first; in a, its own k2, then c.
  inTheOldOrder.push(made.k3, made.k5, made.k1, made.k2, made.k4)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(root, { recursive: true, force: true })
  rmSync(inOrder, { recursive: true, force: true })
})

describe('the key-file check reads every entry of an out/ folder, a slice at a time', () => {
  it('1. finds a key file past the 20,000th entry, and counts every entry', () => {
    const found = checks.theKeyFilesInTheSandboxes(root)
    expect(found.files.map((one) => one.path), 'the key file past the 20,000th entry was not found').toEqual([keyFile])
    expect(found.entries).toBe(ENTRIES)
    expect(found.files[0]?.run?.id).toBe(workersRun)
    expect(found.files[0]?.ended).toBe(false)
  })

  it('2. names it in more than one slice, tells the supervisor once, and says no stop', async () => {
    let slices = 0
    const counted = (work: () => boolean): boolean => {
      slices += 1
      return work()
    }
    await checks.nameTheKeyFilesInTheSandboxesASliceAtATime('default', (line) => logged.push(line), counted, root, 5)
    // THE WALK TOOK MORE THAN ONE SLICE, and one more ran the acts.
    expect(slices, 'the walk ran in one slice').toBeGreaterThan(2)
    const notices = theNotices().filter((one) => one.paths.includes(keyFile))
    expect(notices.map((one) => one.to).sort(), 'the supervisor and the agent above it are each told once').toEqual([idOf('a-supervisor'), idOf('the-launcher')].sort())
    for (const notice of notices) {
      expect(notice.paths).toEqual([keyFile])
      expect(notice.said).toContain(
        `${keyFile} holds the run key of "a-worker" for run ${workersRun}, which is still running: anyone in that sandbox who reads the file can act as "a-worker" until the run ends.`,
      )
      expect(notice.said.includes(workersKey), 'the notice printed the key').toBe(false)
    }
    expect(logged.join('\n')).toContain('The key-file check removed 0 files whose key is revoked, and named key files to ')
    expect(logged.filter((line) => line.includes('stopped after')), 'a line in the log says the walk stopped').toEqual([])
    // A SECOND CHECK TELLS NOBODY ANYTHING NEW.
    const before = theNotices().length
    await checks.nameTheKeyFilesInTheSandboxesASliceAtATime('default', (line) => logged.push(line), counted, root, 5)
    expect(theNotices().length, 'a second check told again').toBe(before)
  })

  it('3. reads one entry in a slice whose time has run out, and goes on from there to the end', () => {
    const walk = checks.aWalkOfTheOutFolders(root)
    let stopped = 0
    // AT MOST A FEW SLICES MORE THAN THERE ARE ENTRIES: a walk that started again from the top would never end.
    while (stopped <= ENTRIES + 10 && !walk.walkOn(performance.now())) stopped += 1
    expect(stopped, 'the slices that stopped for time, one for each entry').toBe(ENTRIES)
    expect(walk.found.entries).toBe(ENTRIES)
    expect(walk.found.files.map((one) => one.path), 'the key file is found once').toEqual([keyFile])
  })

  it('4. names the files of a notice in the order the walk of whole listings gave them', () => {
    checks.nameTheKeyFilesInTheSandboxes('default', (line) => logged.push(line), inOrder)
    const notices = theNotices().filter((one) => one.paths.some((path) => inTheOldOrder.includes(path)))
    expect(notices.map((one) => one.to).sort()).toEqual([idOf('a-supervisor'), idOf('the-launcher')].sort())
    for (const notice of notices) {
      expect(notice.paths).toEqual(inTheOldOrder)
      const at = inTheOldOrder.map((path) => notice.said.indexOf(`${path} holds the run key of "a-worker"`))
      expect(at.every((one) => one >= 0), 'a file is not named in the notice').toBe(true)
      expect([...at].sort((a, b) => a - b), 'the notice names its files out of order').toEqual(at)
    }
  })
})
