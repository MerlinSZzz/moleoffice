// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BACKUP HAND-OVER DOOR: WHO MAY ASK, WHICH BACKUP, AND THE OFFICE'S OWN JOB. Wave 13q round 74.
 *
 * The door is POST /api/office/backups/hand-over (src/server/api/backups.ts and
 * src/server/lib/backup-hand-over.ts). It takes the person or an agent holding the secretary card, as
 * the update press does. The request names one complete backup in this office's backups folder and
 * nothing else. The office files the host job itself, as the office, with askedBy naming the caller
 * and the backup's name as its only argument, and answers at once. The host tool that does the
 * hand-over is the next round's: until it is registered this job names a tool nothing runs.
 *
 * POST /api/host-jobs is not this door and does not move: it still takes only a running agent run.
 *
 * The cases are stand-ins. Every agent, backup and job here is made up, in a fresh test database
 * whose backups folder is beside it in a temporary folder. Nothing reaches the live office, and
 * nothing is handed to any lab server.
 *
 * MUTATIONS, after a control run:
 *   - the who-may check taken out: the worker and the other-agent cases go red;
 *   - the extra-key check taken out: the path, command, destination and server cases go red;
 *   - the backup read from the name alone, not the folder: the unknown and incomplete cases go red;
 *   - the job filed as the caller instead of the office: the office-owned case goes red;
 *   - askedBy left as the run shape: the askedBy case goes red;
 *   - an argument added beside the backup's name: the only-argument case goes red;
 *   - POST /api/host-jobs made to take a person: the unchanged-door case goes red;
 *   - the end path reading askedBy only as {run, agent}: the take cases go red;
 *   - the end path not resolving the person or the secretary: the told cases go red;
 *   - the end path skipping with no reason: the nobody-to-tell case goes red;
 *   - the read path throwing on an absent sha256: the read case goes red;
 *   - the read path saying nothing of the absent digest: the read case goes red.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { HOST_JOB_KIND } from '../src/shared/host-jobs.ts'
import { THE_OFFICE_WRITER_ID } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { filesFolderOf, leftOutListOf } from '../src/shared/what-is-kept.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const SECRETARY = 'made-up-handover-secretary'
const WORKER = 'made-up-handover-worker'

let db: TestDb
let app: Awaited<ReturnType<typeof apiApp>>
let names: typeof import('../src/server/lib/complete-backups.ts')
let backups = ''
let person: Record<string, string> = {}
let secretary: Record<string, string> = {}
let worker: Record<string, string> = {}
let office: Record<string, string> = {}
let secretaryId = ''

/** The door's answer, as a case reads it. */
interface AnAnswer {
  status: number
  said: string
  body: Record<string, any>
}

async function askDoor(headers: Record<string, string>, payload: Record<string, unknown>): Promise<AnAnswer> {
  const reply = await app.app.inject({
    method: 'POST',
    url: '/api/office/backups/hand-over',
    headers: { 'content-type': 'application/json', ...headers },
    payload,
  })
  let body: Record<string, any> = {}
  try {
    body = reply.json() as Record<string, any>
  } catch {
    body = {}
  }
  return { status: reply.statusCode, said: String(body['error'] ?? reply.body), body }
}

async function askHostJobs(headers: Record<string, string>, payload: Record<string, unknown>): Promise<AnAnswer> {
  const reply = await app.app.inject({
    method: 'POST',
    url: '/api/host-jobs',
    headers: { 'content-type': 'application/json', ...headers },
    payload,
  })
  let body: Record<string, any> = {}
  try {
    body = reply.json() as Record<string, any>
  } catch {
    body = {}
  }
  return { status: reply.statusCode, said: String(body['error'] ?? reply.body), body }
}

/** GET /api/host-jobs/<id>, as the person reads it. */
async function readTheHostJob(id: string): Promise<AnAnswer> {
  const reply = await app.app.inject({ method: 'GET', url: `/api/host-jobs/${id}`, headers: person })
  let body: Record<string, any> = {}
  try {
    body = reply.json() as Record<string, any>
  } catch {
    body = {}
  }
  return { status: reply.statusCode, said: String(body['error'] ?? reply.body), body }
}

/** POST /api/host-jobs/take, with the office key alone. */
async function takeAHostJob(): Promise<AnAnswer> {
  const reply = await app.app.inject({
    method: 'POST',
    url: '/api/host-jobs/take',
    headers: { 'content-type': 'application/json', ...office },
    payload: {},
  })
  let body: Record<string, any> = {}
  try {
    body = reply.json() as Record<string, any>
  } catch {
    body = {}
  }
  return { status: reply.statusCode, said: String(body['error'] ?? reply.body), body }
}

/** Every message this office holds whose body names the job, read straight from its own store. */
function theMessagesAbout(jobId: string): Record<string, any>[] {
  const rows = db.client.sqlite
    .prepare(`SELECT data FROM records WHERE kind = 'message' AND deleted_at IS NULL ORDER BY created_at, id`)
    .all() as { data: string }[]
  return rows
    .map((row) => JSON.parse(row.data) as Record<string, any>)
    .filter((data) => String(data['body'] ?? '').includes(jobId))
}

/** The row the list door gives a backup, or undefined. */
async function theRowFor(name: string): Promise<Record<string, any> | undefined> {
  const listed = await app.app.inject({ method: 'GET', url: '/api/office/backups', headers: person })
  expect(listed.statusCode, listed.body).toBe(200)
  const rows = (listed.json() as { backups?: Record<string, any>[] }).backups ?? []
  return rows.find((row) => row['name'] === name)
}

/** How many host jobs this office holds, read straight from its own store. */
function hostJobsHeld(): number {
  const row = db.client.sqlite.prepare(`SELECT count(*) AS n FROM records WHERE kind = ? AND deleted_at IS NULL`).get(HOST_JOB_KIND) as { n: number }
  return row.n
}

/** The names in the backups folder, sorted, so a case can see the door added nothing. */
function inTheFolder(): string[] {
  return existsSync(backups) ? readdirSync(backups).sort() : []
}

const inASecond = new Date(2026, 0, 1, 0, 0, 0)
let planted = 0

/** A made-up database and its companion, planted in this test's backups folder. Never a real backup. */
function plantABackup(companion: 'folder' | 'list' | null): string {
  planted += 1
  const name = names.backupNameFor('the-backup-command', new Date(inASecond.getTime() + planted * 1000))
  copyFileSync(db.file, join(backups, name))
  if (companion === 'folder') mkdirSync(join(backups, filesFolderOf(name)))
  if (companion === 'list') writeFileSync(join(backups, leftOutListOf(name)), 'Synthetic fixture: files left out\n')
  return name
}

beforeAll(async () => {
  db = await freshDb()
  app = await apiApp()
  await app.app.ready()
  names = await import('../src/server/lib/complete-backups.ts')
  const { settings } = await import('../src/config/settings.mjs')
  backups = settings().backupsDirectory
  mkdirSync(backups, { recursive: true })
  const kept = JSON.parse(readFileSync(settings().keysPath, 'utf8')) as { office?: unknown }
  if (typeof kept.office !== 'string') throw new Error('the office made no office key beside the database')
  office = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-key': kept.office }
  person = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, ...thePersonsKeyHeader() }
  const keyed = async (handle: string, role: 'secretary' | 'worker'): Promise<Record<string, string>> => {
    const made = await app.app.inject({ method: 'POST', url: '/api/agents/started', headers: { 'content-type': 'application/json', ...person }, payload: { handle, name: `Made-up ${role}`, role } })
    expect(made.statusCode, made.body).toBe(201)
    const answer = made.json() as { agent?: { id?: string }; whatToGiveIt?: { key?: string } }
    if (role === 'secretary') secretaryId = String(answer.agent?.id ?? '')
    return { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': String(answer.whatToGiveIt?.key ?? '') }
  }
  secretary = await keyed(SECRETARY, 'secretary')
  worker = await keyed(WORKER, 'worker')
}, 60_000)

afterAll(async () => {
  await app?.app.close()
  db?.close()
})

it('refuses a worker before filing a hand-over job', async () => {
  const reply = await app.app.inject({ method: 'POST', url: '/api/office/backups/hand-over', headers: worker, payload: { backup: 'mole-office-20260101-010203.db' } })
  expect(reply.statusCode, reply.body).toBe(403)
})

it('refuses an arbitrary path from the person', async () => {
  const reply = await app.app.inject({ method: 'POST', url: '/api/office/backups/hand-over', headers: person, payload: { backup: '../elsewhere.db' } })
  expect(reply.statusCode, reply.body).toBe(400)
})

it('refuses any other agent with one sentence naming who may ask', async () => {
  const before = hostJobsHeld()
  const answer = await askDoor(worker, { backup: 'mole-office-20260101-010203.db' })
  expect(answer.status, answer.said).toBe(403)
  const { ONLY_THE_PERSON_OR_A_SECRETARY } = await import('../src/server/lib/backup-hand-over.ts')
  expect(answer.said).toBe(ONLY_THE_PERSON_OR_A_SECRETARY)
  expect(answer.said).toMatch(/person/)
  expect(answer.said).toMatch(/secretary/)
  expect(answer.said.includes('\n')).toBe(false)
  expect(hostJobsHeld()).toBe(before)
})

it('lets the person hand over one complete backup, filing the office\'s job at once', async () => {
  const name = plantABackup('folder')
  const row = await theRowFor(name)
  expect(row, `the list does not hold ${name}`).toMatchObject({ name, complete: true })
  const before = inTheFolder()
  const jobsBefore = hostJobsHeld()
  const pressed = Date.now()
  const answer = await askDoor(person, { backup: name })
  const took = Date.now() - pressed
  expect(answer.status, answer.said).toBe(201)
  expect(took).toBeLessThan(5_000)
  const job = answer.body['job'] as Record<string, any>
  expect(job).toMatchObject({ kind: HOST_JOB_KIND, workspaceId: WORKSPACE })
  expect(job['data']).toMatchObject({ state: 'asked', arguments: { backup: name }, askedBy: { kind: 'person', id: THE_PERSON } })
  expect(job['data']['arguments']).toEqual({ backup: name })
  expect(job['data']['sha256']).toBeUndefined()
  expect(inTheFolder()).toEqual(before)
  expect(hostJobsHeld()).toBe(jobsBefore + 1)
  const { THE_HAND_OVER_TOOL, THE_HAND_OVER_ARGUMENT } = await import('../src/shared/backup-hand-over.ts')
  expect(job['data']['tool']).toBe(THE_HAND_OVER_TOOL)
  expect(Object.keys(job['data']['arguments'] as Record<string, unknown>)).toEqual([THE_HAND_OVER_ARGUMENT])
  const read = await app.app.inject({ method: 'GET', url: `/api/records/${String(job['id'])}`, headers: person })
  expect(read.statusCode, read.body).toBe(200)
  const readBack = read.json() as { record: Record<string, any>; filedFrom?: Record<string, any> }
  expect(readBack.filedFrom).toMatchObject({ actorType: 'agent', actorId: THE_OFFICE_WRITER_ID })
  expect(readBack.record['data']).toMatchObject({ askedBy: { kind: 'person', id: THE_PERSON } })
})

it('lets an agent holding the secretary card hand over a backup, with itself as askedBy', async () => {
  const name = plantABackup('list')
  const row = await theRowFor(name)
  expect(row, `the list does not hold ${name}`).toMatchObject({ name, complete: true })
  const answer = await askDoor(secretary, { backup: name })
  expect(answer.status, answer.said).toBe(201)
  const job = answer.body['job'] as Record<string, any>
  expect(job['data']).toMatchObject({ state: 'asked', arguments: { backup: name }, askedBy: { kind: 'agent', id: secretaryId } })
  const { THE_HAND_OVER_TOOL } = await import('../src/shared/backup-hand-over.ts')
  expect(job['data']['tool']).toBe(THE_HAND_OVER_TOOL)
  const read = await app.app.inject({ method: 'GET', url: `/api/records/${String(job['id'])}`, headers: person })
  expect(read.statusCode, read.body).toBe(200)
  const readBack = read.json() as { record: Record<string, any>; filedFrom?: Record<string, any> }
  expect(readBack.filedFrom).toMatchObject({ actorType: 'agent', actorId: THE_OFFICE_WRITER_ID })
})

it('refuses a request that names a path, a command, a destination or a server', async () => {
  const name = plantABackup('folder')
  for (const key of ['path', 'command', 'destination', 'server']) {
    const before = hostJobsHeld()
    const answer = await askDoor(person, { backup: name, [key]: 'made-up' })
    expect(answer.status, `${key}: ${answer.said}`).toBe(400)
    expect(answer.said).toContain(key)
    expect(hostJobsHeld()).toBe(before)
  }
})

it('refuses an unknown, an incomplete and a substituted backup id', async () => {
  const complete = plantABackup('folder')
  const incomplete = plantABackup(null)
  const incompleteRow = await theRowFor(incomplete)
  expect(incompleteRow, `the list does not hold ${incomplete}`).toMatchObject({ name: incomplete, complete: false })
  const substituted = complete.replace(/\.db$/, '-2.db')
  for (const name of [substituted, incomplete]) {
    const before = hostJobsHeld()
    const answer = await askDoor(person, { backup: name })
    expect(answer.status, `${name}: ${answer.said}`).toBe(400)
    expect(answer.said).toContain(name)
    expect(hostJobsHeld()).toBe(before)
  }
})

it('names a host tool that is not on the register, so filing the job runs nothing, and its read and take answer cleanly', async () => {
  const name = plantABackup('folder')
  const answer = await askDoor(person, { backup: name })
  expect(answer.status, answer.said).toBe(201)
  const job = answer.body['job'] as Record<string, any>
  const id = String(job['id'])
  expect(job['data']['state']).toBe('asked')
  expect(job['data']['startedAt']).toBeUndefined()
  const listed = await app.app.inject({ method: 'GET', url: '/api/host-tools', headers: person })
  expect(listed.statusCode, listed.body).toBe(200)
  const tools = (listed.json() as { tools?: { name?: string }[] }).tools ?? []
  expect(tools.some((tool) => tool.name === job['data']['tool'])).toBe(false)

  // THE READ DOOR ANSWERS 200, and says the job holds no program digest.
  const read = await readTheHostJob(id)
  expect(read.status, read.said).toBe(200)
  expect(read.body['job']['data']['sha256']).toBeUndefined()
  expect(read.body['digests']['program']['sha256Base64']).toBeNull()
  expect(typeof read.body['digests']['program']['says'], 'the read says why there is no digest').toBe('string')
  expect(String(read.body['digests']['program']['says'])).toMatch(/digest/)

  // THE TAKE DOOR ANSWERS 200, ends it, and tells the person that asked.
  const take = await takeAHostJob()
  expect(take.status, take.said).toBe(200)
  const ended = (take.body['ended'] ?? []) as { id: string; told: { to: unknown; says: string } }[]
  const mine = ended.find((one) => one.id === id)
  expect(mine, 'the take says it ended this job').toBeDefined()
  expect(mine?.told['to']).toEqual({ kind: 'person', id: THE_PERSON })
  const after = await readTheHostJob(id)
  expect(after.status, after.said).toBe(200)
  expect(after.body['job']['data']['state']).toBe('could not start')
  expect(after.body['job']['data']['startedAt']).toBeUndefined()
  const { THE_HAND_OVER_TOOL } = await import('../src/shared/backup-hand-over.ts')
  const told = theMessagesAbout(id)
  expect(told, 'the person is told once that the job ended').toHaveLength(1)
  expect(told[0]!['to']).toEqual([{ kind: 'person', id: THE_PERSON }])
  expect(String(told[0]!['body'])).toBe(`The host job ${id} (${THE_HAND_OVER_TOOL}) ended: could not start`)
})

it('tells the secretary that asked a hand-over job, in its own shape', async () => {
  const name = plantABackup('folder')
  const answer = await askDoor(secretary, { backup: name })
  expect(answer.status, answer.said).toBe(201)
  const id = String((answer.body['job'] as Record<string, any>)['id'])
  const take = await takeAHostJob()
  expect(take.status, take.said).toBe(200)
  const ended = (take.body['ended'] ?? []) as { id: string; told: { to: unknown; says: string } }[]
  expect(ended.find((one) => one.id === id)?.told['to']).toEqual({ kind: 'agent', id: secretaryId })
  const told = theMessagesAbout(id)
  expect(told, 'the secretary is told once that the job ended').toHaveLength(1)
  expect(told[0]!['to']).toEqual([{ kind: 'agent', id: secretaryId }])
})

it('skips the ending message with a stated reason when the asker is nobody this office holds', async () => {
  const { THE_HAND_OVER_TOOL } = await import('../src/shared/backup-hand-over.ts')
  const door = await import('../src/server/lib/host-job-door.ts')
  const missing = 'made-up-handover-asker-nobody-holds'
  const job = door.asTheHostJobWriter(() =>
    db.api.createRecord({
      workspaceId: WORKSPACE,
      kind: HOST_JOB_KIND,
      title: 'A made-up hand-over job whose asker is not registered',
      data: { tool: THE_HAND_OVER_TOOL, arguments: { backup: 'made-up.db' }, askedBy: { kind: 'agent', id: missing }, state: 'asked', askedAt: '2026-01-01 00:00:00' },
      actor: { type: 'human', id: THE_PERSON },
    }),
  )
  const take = await takeAHostJob()
  expect(take.status, take.said).toBe(200)
  const ended = (take.body['ended'] ?? []) as { id: string; told: { to: unknown; says: string } }[]
  const mine = ended.find((one) => one.id === job.id)
  expect(mine, 'the take says it ended this job').toBeDefined()
  expect(mine?.told['to']).toBeNull()
  expect(String(mine?.told['says'])).toContain(missing)
  expect(theMessagesAbout(job.id), 'no message is written when there is nobody to tell').toHaveLength(0)
})

it('leaves POST /api/host-jobs taking only a running agent run', async () => {
  const name = plantABackup('folder')
  const asked = { tool: 'made-up-hand-over', arguments: { backup: name } }
  for (const headers of [person, secretary]) {
    const before = hostJobsHeld()
    const answer = await askHostJobs(headers, asked)
    expect(answer.status, answer.said).toBe(403)
    expect(hostJobsHeld()).toBe(before)
  }
})
