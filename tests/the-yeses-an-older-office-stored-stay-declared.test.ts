// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE YESES AN OLDER OFFICE STORED STAY DECLARED, AND NOTHING READS THEM.
 *
 * Until 12 November 2026 the office wrote two things about a run's yeses. At the seal, and at the release of a held
 * check, it wrote the part `yeses` of the run's atTheSeal. In the check it asked for, it wrote `yeses` into the ask,
 * theCheck. That code is deleted. Runs sealed before then still hold both, and the office checks a record's whole data
 * against its kind on every write. So both stay declared, as open objects that nothing reads or writes, and a later
 * write to such a run is not refused for what an earlier revision stored.
 *
 * Every agent, run and repository here is made up. The stored parts are set straight into the test database, as an
 * earlier revision would have left them.
 *
 *   1. A running run whose atTheSeal holds a yeses part takes its own agent's write, and the part stays as it was.
 *   2. The office's own note about the next round is kept in the atTheSeal of a sealed run whose atTheSeal and ask hold
 *      yeses, and both stay as they were.
 *   3. A sealed run whose ask holds yeses still reads, and the job the worker is given from that ask holds none.
 *
 * Mutations, each after a control run, then restored:
 *   1. The part `yeses` taken out of AtTheSeal in src/shared/kinds.ts. Cases 1 and 2 go red.
 *   2. The field `yeses` taken out of the check's ask in src/shared/kinds.ts. Case 2 goes red.
 *   3. inspectionForMessage in src/server/lib/inspection.ts passes the ask's yeses on to the job again. Case 3 goes red.
 */
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { GATES } from '../src/config/gates.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { aReportInForm } from './a-run-in-form.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'
import { AT_THE_SEAL } from '../src/shared/merge-queue-at-the-seal.ts'

const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const STARTER = 'older-yeses-starter'
const HANDLE = 'older-yeses-run'
const INSPECTOR = 'older-yeses-inspector'
const THE_GATE = 'next-round-at-the-release'

const AS_THE_PERSON = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const AS_THE_PROVED_PERSON = { ...AS_THE_PERSON, 'x-mole-office-key': A_MADE_UP_PERSON_KEY }
const AS_THE_OFFICE_WORKER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': THE_MESSAGE_WORKER_ID,
  'x-mole-office-key': A_MADE_UP_OFFICE_KEY,
}
const asAgent = (id: string) => ({ ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })

/** A part `yeses` of atTheSeal as an earlier revision wrote it, for a run that handed over none. Made up. */
const AN_OLDER_PART = { outcome: 'none', moment: 'seal', says: 'A made-up note: the run handed over no yeses before its seal.', at: '2026-11-08 10:00:00' }
/** The `yeses` of a check's ask as an earlier revision wrote it. Made up. */
const anOlderAsk = (run: string) => ({ of: run, outcome: 'none', says: 'A made-up note: the run handed over no yeses before its seal.' })

let t: TestDb
let app: FastifyInstance
/** The server's own names, read after the test database is named: the modules open the database it names. */
let inspection: typeof import('../src/server/lib/inspection.ts')
let nextRound: typeof import('../src/server/lib/next-round-at-the-seal.ts')
const directories: string[] = []

const git = (dir: string, ...args: string[]): string => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()

interface ARun { id: string; key: string; tip: string }
const asTheRun = (run: ARun): Record<string, string> => ({ ...asAgent(HANDLE), 'x-mole-office-session': run.id, 'x-mole-office-key': run.key })

/** A run filed by the office's worker at commit A of a made-up repository, with commit B on its branch. */
async function aRun(): Promise<ARun> {
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-older-yeses-'))
  directories.push(dir)
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.name', 'Synthetic older-yeses test')
  git(dir, 'config', 'user.email', 'older-yeses@example.invalid')
  git(dir, 'config', 'commit.gpgsign', 'false')
  mkdirSync(join(dir, 'work'))
  writeFileSync(join(dir, 'work/a.txt'), 'before\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-qm', 'Synthetic commit A')
  const a = git(dir, 'rev-parse', 'HEAD')
  git(dir, 'switch', '-qc', 'worker')
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_OFFICE_WORKER,
    payload: {
      kind: 'session',
      title: 'Synthetic round sealed by an earlier revision',
      data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: HANDLE, doing: 'a made-up round', workingDirectory: dir, cutFrom: 'main', tip: a },
    },
  })
  expect(filed.statusCode, filed.body.slice(0, 300)).toBe(201)
  const body = filed.json() as { record: { id: string }; runKey?: { key?: string } }
  writeFileSync(join(dir, 'work/a.txt'), 'after\n')
  git(dir, 'commit', '-qam', 'Synthetic commit B')
  return { id: body.record.id, key: String(body.runKey?.key), tip: git(dir, 'rev-parse', 'HEAD') }
}

/** Seal: the reminder, then the same write again, as a round ends. The run's report is in form. */
async function seal(run: ARun): Promise<void> {
  await aReportInForm(t, run.id, HANDLE)
  const payload = { dataPatch: { state: 'finished', tip: run.tip } }
  const first = await app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers: asTheRun(run), payload })
  expect(first.statusCode, first.body.slice(0, 600)).toBe(200)
  const second = await app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers: asTheRun(run), payload })
  expect(second.statusCode, second.body.slice(0, 600)).toBe(200)
  expect(t.api.getRecord(run.id)!.data['sealedTip']).toEqual(expect.any(String))
}

const stored = (run: string) => t.api.getRecord(run)!.data as Record<string, any>
/** Store one field of a run's data as an earlier revision left it, straight into the test database. */
const leave = (run: string, field: string, value: unknown) =>
  t.client.sqlite.prepare(`UPDATE records SET data = json_set(data, '$.${field}', json(?)) WHERE id = ?`).run(JSON.stringify(value), run)

async function setTheGate(value: '1' | null) {
  const setting = GATES.find((one) => one.id === THE_GATE)!.setting
  const reply = await app.inject({
    method: 'POST', url: '/api/office/settings', headers: AS_THE_PROVED_PERSON,
    payload: { changes: [{ name: setting, value }], because: 'Synthetic: a case of the yeses an older office stored.' },
  })
  expect(reply.statusCode, reply.body.slice(0, 600)).toBe(200)
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`, { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  inspection = await import('../src/server/lib/inspection.ts')
  nextRound = await import('../src/server/lib/next-round-at-the-seal.ts')
  const register = async (headers: Record<string, string>, payload: Record<string, unknown>) => {
    const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { runtime: 'claude-code', name: String(payload['handle']), ...payload } })
    expect(reply.statusCode, reply.body.slice(0, 300)).toBe(201)
  }
  await register(AS_THE_PERSON, { handle: STARTER, role: 'secretary' })
  await register(AS_THE_PERSON, { handle: INSPECTOR, role: 'inspector' })
  await register(asAgent(STARTER), { handle: HANDLE, role: 'worker', workArea: ['work'] })
}, 60_000)

// A CASE THAT FAILED HALF WAY DOES NOT LEAVE THE GATE ON FOR THE NEXT ONE.
afterEach(async () => {
  await setTheGate(null)
})

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
})

describe('the yeses an older office stored stay declared', () => {
  // MUTATION 1: red.
  it("1. a running run whose atTheSeal holds a yeses part takes its own agent's write, and the part stays as it was", async () => {
    const run = await aRun()
    leave(run.id, AT_THE_SEAL, { yeses: AN_OLDER_PART })
    const wrote = await app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers: asTheRun(run), payload: { dataPatch: { doing: 'a later step of a made-up round' } } })
    expect(wrote.statusCode, wrote.body.slice(0, 600)).toBe(200)
    expect(stored(run.id)['doing']).toBe('a later step of a made-up round')
    expect(stored(run.id)[AT_THE_SEAL]).toEqual({ yeses: AN_OLDER_PART })
  })

  // MUTATIONS 1 AND 2: red.
  it("2. the office's note about the next round is kept beside the yeses an older office stored, and both stay as they were", async () => {
    const run = await aRun()
    await seal(run)
    const check = stored(run.id)['theCheck'] as Record<string, unknown>
    expect(check['askedOf'], JSON.stringify(check)).toBe(INSPECTOR)
    leave(run.id, AT_THE_SEAL, { ...(stored(run.id)[AT_THE_SEAL] ?? {}), yeses: AN_OLDER_PART })
    leave(run.id, 'theCheck', { ...check, yeses: anOlderAsk(run.id) })

    await setTheGate('1')
    // The run's agent holds the worker card, so the office asks for no next round, and keeps a note that says so.
    const note = nextRound.theOfficeAsksTheNextRoundAtTheRelease(run.id)
    expect(note, JSON.stringify(note)).toMatchObject({ outcome: 'not-asked', moment: 'release' })
    const part = stored(run.id)[AT_THE_SEAL]
    expect(part['nextRound']).toEqual(note)
    expect(part['yeses']).toEqual(AN_OLDER_PART)
    expect(stored(run.id)['theCheck']['yeses']).toEqual(anOlderAsk(run.id))
  })

  // MUTATION 3: red.
  it('3. a sealed run whose ask holds yeses still reads, and the job the worker is given from that ask holds none', async () => {
    const run = await aRun()
    await seal(run)
    const check = stored(run.id)['theCheck'] as Record<string, unknown>
    expect(check['askedOf'], JSON.stringify(check)).toBe(INSPECTOR)
    leave(run.id, 'theCheck', { ...check, yeses: anOlderAsk(run.id) })

    const read = await app.inject({ method: 'GET', url: `/api/records/${run.id}`, headers: AS_THE_PERSON })
    expect(read.statusCode, read.body.slice(0, 600)).toBe(200)
    expect((read.json() as { record: { data: Record<string, any> } }).record.data['theCheck']['yeses']).toEqual(anOlderAsk(run.id))

    const job = inspection.inspectionForMessage(String(check['message']), INSPECTOR, 'default')
    expect(job, JSON.stringify(check)).not.toBeNull()
    expect(job!.run).toBe(run.id)
    expect(Object.keys(job!).sort()).toEqual(['checkout', 'run'])
  })
})
