// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BACKUP DOORS: ONE BACKUP TAKEN NOW, AND THE LIST OF THE BACKUPS FOLDER. Wave 13q round 71.
 *
 * The answers to round 70's plan: the door takes what `npm run db:backup` takes, into the same
 * folder, with the same code; the list shows every backup there, each marked by what made it, with
 * its time and size; the person or a secretary may use both, by the check the office already has.
 *
 * MUTATIONS, after a control run: let the doors skip the who-may check, read no maker from the
 * door's name, or leave the door's name out of the names the prune dates, and a case goes red.
 *
 * ROUND 72, ROUND 71'S REFUSAL. Each case below was red at round 71's tip. A second press in the same
 * second answered 500, because the library refuses a taken name. A press with MOLE_OFFICE_DB naming
 * another file answered 500, because the door backed up the file the settings named and not the one
 * the server opened. MUTATIONS: give a second press the same name; take the file the settings name;
 * take the backup on the server's own thread, and the case that asks the list during a take goes red.
 *
 * Every agent and backup here is made up, in a fresh test database whose backups folder is beside
 * it in a temporary folder. Nothing reaches the live office.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const SECRETARY = 'made-up-backup-secretary'
const WORKER = 'made-up-backup-worker'

let t: TestDb
let app: Awaited<ReturnType<typeof apiApp>>
let names: typeof import('../src/server/lib/complete-backups.ts')
let folders: typeof import('../src/shared/what-is-kept.ts')
let time: typeof import('../src/shared/time.ts')
let backups = ''
let opened = ''
let asPerson: Record<string, string> = {}
let asSecretary: Record<string, string> = {}
let asWorker: Record<string, string> = {}

interface ARow { name: string; madeBy: string | null; complete: boolean; incomplete: string | null; at: string | null; atFrom: string | null; bytes: number | null }

async function ask(method: 'GET' | 'POST', headers: Record<string, string>): Promise<{ status: number; said: string; body: Record<string, any> }> {
  const reply = await app.app.inject({ method, url: '/api/office/backups', headers })
  let body: Record<string, any> = {}
  try { body = reply.json() as Record<string, any> } catch { body = {} }
  return { status: reply.statusCode, said: String(body['error'] ?? reply.body), body }
}
const inTheFolder = (): string[] => (existsSync(backups) ? readdirSync(backups).sort() : [])

beforeAll(async () => {
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  names = await import('../src/server/lib/complete-backups.ts')
  folders = await import('../src/shared/what-is-kept.ts')
  time = await import('../src/shared/time.ts')
  const { settings } = await import('../src/config/settings.mjs')
  backups = settings().backupsDirectory
  opened = settings().databasePath
  asPerson = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, ...thePersonsKeyHeader() }
  const keyed = async (handle: string, role: string): Promise<Record<string, string>> => {
    const made = await app.app.inject({ method: 'POST', url: '/api/agents/started', headers: { 'content-type': 'application/json', ...asPerson }, payload: { handle, name: `Made-up ${role}`, role } })
    expect(made.statusCode, made.body).toBe(201)
    const key = String((made.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key ?? '')
    return { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': key }
  }
  asSecretary = await keyed(SECRETARY, 'secretary')
  asWorker = await keyed(WORKER, 'worker')
}, 60_000)

afterAll(async () => {
  await app?.app.close()
  t?.close()
})

it('refuses an agent that is not a secretary both doors, and writes nothing into the backups folder', async () => {
  const before = inTheFolder()
  const list = await ask('GET', asWorker)
  expect(list.status, list.said).toBe(403)
  const take = await ask('POST', asWorker)
  expect(take.status, take.said).toBe(403)
  expect(inTheFolder()).toEqual(before)
})

it('takes one backup for the person: verified, with its files folder, under a name that says the door took it', async () => {
  const take = await ask('POST', asPerson)
  expect(take.status, take.said).toBe(201)
  const row = take.body['backup'] as ARow
  expect(names.whatMadeTheBackup(row.name)).toBe('the-door')
  expect(row).toMatchObject({ madeBy: 'the-door', complete: true, incomplete: null, atFrom: 'name' })
  expect(take.body['taken']).toMatchObject({ taken: true })
  expect(existsSync(join(backups, row.name))).toBe(true)
  expect(statSync(join(backups, folders.filesFolderOf(row.name))).isDirectory()).toBe(true)
  // The prune and the floor read it as a complete backup dated by its name.
  const read = names.readCompleteBackups(backups).backups.find((one) => one.entry.name === row.name)
  expect(read).toMatchObject({ complete: true, ageFrom: 'name' })
})

it('refuses a second press while a backup is being taken, and takes only the first', async () => {
  const before = inTheFolder().filter((name) => name.endsWith('.db')).length
  const [first, second] = await Promise.all([ask('POST', asSecretary), ask('POST', asSecretary)])
  expect(first.status, first.said).toBe(201)
  expect(second.status, second.said).toBe(409)
  expect(inTheFolder().filter((name) => name.endsWith('.db')).length).toBe(before + 1)
})

it('lists every backup in the folder for a secretary, each marked by what made it, with its time and size', async () => {
  const take = await ask('POST', asPerson)
  expect(take.status, take.said).toBe(201)
  const door = take.body['backup'] as ARow
  const copy = join(backups, door.name)
  const moment = new Date(2026, 0, 2, 3, 4, 5)
  const plant = (name: string, companion: 'folder' | 'list' | null): string => {
    copyFileSync(copy, join(backups, name))
    if (companion === 'folder') {
      mkdirSync(join(backups, folders.filesFolderOf(name)))
      writeFileSync(join(backups, folders.filesFolderOf(name), 'a-made-up-file.txt'), 'made up')
    }
    if (companion === 'list') writeFileSync(join(backups, folders.leftOutListOf(name)), 'made-up left-out list\n')
    return name
  }
  const command = plant(names.backupNameFor('the-backup-command', moment), 'folder')
  const update = plant(names.backupNameFor('the-update', moment), 'list')
  const custom = plant('made-up-before-a-change.db', 'folder')
  const incomplete = plant(names.backupNameFor('the-backup-command', new Date(2026, 0, 3, 4, 5, 6)), null)
  const written = new Date(2026, 1, 3, 4, 5, 6)
  utimesSync(join(backups, update), written, written)

  const list = await ask('GET', asSecretary)
  expect(list.status, list.said).toBe(200)
  expect(list.body['folderExists']).toBe(true)
  const rows = list.body['backups'] as ARow[]
  const databases = inTheFolder().filter((name) => name.endsWith('.db'))
  expect(rows.map((row) => row.name).sort()).toEqual(databases)
  const of = (name: string): ARow | undefined => rows.find((row) => row.name === name)
  const size = (name: string): number => statSync(join(backups, name)).size

  expect(of(door.name)).toMatchObject({ madeBy: 'the-door', complete: true })
  expect(of(command)).toMatchObject({ madeBy: 'the-backup-command', complete: true, at: time.localStamp(moment), atFrom: 'name',
    bytes: size(command) + size(join(folders.filesFolderOf(command), 'a-made-up-file.txt')) })
  expect(of(update)).toMatchObject({ madeBy: 'the-update', complete: true, at: time.localStamp(written), atFrom: 'file',
    bytes: size(update) + size(folders.leftOutListOf(update)) })
  expect(of(custom)).toMatchObject({ madeBy: null, complete: true, atFrom: 'file' })
  expect(of(incomplete)).toMatchObject({ madeBy: 'the-backup-command', complete: false, atFrom: 'file', bytes: size(incomplete) })
  expect(of(incomplete)?.incomplete).toEqual(expect.any(String))
  // Newest first, by the time each row gives.
  const times = rows.map((row) => row.at ?? '')
  expect(times).toEqual([...times].sort().reverse())
})

it('gives a second press in the same second a name of its own, and takes both', async () => {
  // THIS THREAD'S CLOCK STANDS STILL, so both presses are in one second. Nothing waits for a free second.
  const moment = new Date(Math.floor(Date.now() / 1000) * 1000)
  vi.useFakeTimers({ toFake: ['Date'], now: moment })
  try {
    const first = await ask('POST', asPerson)
    const second = await ask('POST', asPerson)
    expect(first.status, first.said).toBe(201)
    expect(second.status, second.said).toBe(201)
    const one = first.body['backup'] as ARow
    const two = second.body['backup'] as ARow
    expect(two.name).not.toBe(one.name)
    for (const row of [one, two]) {
      expect(row).toMatchObject({ madeBy: 'the-door', complete: true, atFrom: 'name', at: time.localStamp(moment) })
      expect(names.timeInBackupName(row.name)).toBe(moment.getTime())
      expect(statSync(join(backups, folders.filesFolderOf(row.name))).isDirectory()).toBe(true)
    }
  } finally {
    vi.useRealTimers()
  }
})

it('answers other requests while a backup is taken, because the take runs on a thread of its own', async () => {
  // A STAND-IN FOR A SLOW BACKUP, on this thread only. Every module this test loads, the server's among
  // them, gets the home guard's node:fs (tests/a-test-writes-into-no-home-but-its-own.ts), so its
  // mkdtempSync is changed there for this case, and every call goes on to the guarded one. Making the
  // folder of work in progress in this backups folder waits four seconds. The backup's thread loads its own
  // fs and is not slowed. A take run on this thread would stop every answer for those four seconds.
  const fs = (await import('node:fs')) as unknown as { mkdtempSync: typeof import('node:fs').mkdtempSync }
  const guarded = fs.mkdtempSync
  fs.mkdtempSync = ((prefix: string, options?: unknown) => {
    if (String(prefix).startsWith(join(backups, '.'))) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 4_000)
    return guarded(prefix, options as never)
  }) as typeof fs.mkdtempSync
  try {
    const pressed = Date.now()
    let takenAt = 0
    const take = ask('POST', asPerson).then((taken) => {
      takenAt = Date.now()
      return taken
    })
    const listed: number[] = []
    // A PAUSE BETWEEN ASKS, so the thread's answer is read too: an ask in memory is answered without
    // the event loop reaching the thread's message. And an end, so a take that never answers fails.
    while (takenAt === 0 && Date.now() - pressed < 60_000) {
      const list = await ask('GET', asSecretary)
      expect(list.status, list.said).toBe(200)
      listed.push(Date.now())
      await new Promise((done) => setTimeout(done, 20))
    }
    const taken = await take
    expect(taken.status, taken.said).toBe(201)
    // The list answered while the backup was taken, and never waited long for an answer.
    expect(listed.filter((at) => at < takenAt).length).toBeGreaterThan(1)
    const answers = [pressed, ...listed.filter((at) => at <= takenAt)]
    const longest = Math.max(...answers.slice(1).map((at, i) => at - (answers[i] ?? at)))
    expect(longest).toBeLessThan(1_500)
  } finally {
    fs.mkdtempSync = guarded
  }
})

it('takes the database this server opened, when MOLE_OFFICE_DB has come to name another file', async () => {
  const another = join(dirname(opened), 'made-up-another-database.db')
  const was = process.env['MOLE_OFFICE_DB']
  process.env['MOLE_OFFICE_DB'] = another
  try {
    const take = await ask('POST', asPerson)
    expect(take.status, take.said).toBe(201)
    expect(take.body['taken']).toMatchObject({ taken: true, how: { source: opened } })
    expect(existsSync(join(backups, (take.body['backup'] as ARow).name))).toBe(true)
  } finally {
    process.env['MOLE_OFFICE_DB'] = was
  }
  expect(existsSync(another)).toBe(false)
})

it('dates a backup the door took by its name for the prune and the floor, and leaves the update\'s as it was', () => {
  const moment = new Date(2026, 4, 6, 7, 8, 9)
  expect(names.isBackupName(names.backupNameFor('the-door', moment))).toBe(true)
  expect(names.timeInBackupName(names.backupNameFor('the-door', moment))).toBe(moment.getTime())
  expect(names.timeInBackupName(names.backupNameFor('the-backup-command', moment))).toBe(moment.getTime())
  expect(names.isBackupName(names.backupNameFor('the-update', moment))).toBe(false)
  // The update's backup keeps the name it had before the three makers were written in one place.
  expect(names.backupNameFor('the-update', moment)).toBe('mole-office-20260506-070809-before-the-update.db')
  // A second press in one second: dated by the same second, made by the door, and only the door's names take a number.
  const second = names.backupNameFor('the-door', moment, 2)
  expect(second).toBe('mole-office-20260506-070809-taken-at-the-door-2.db')
  expect(names.timeInBackupName(second)).toBe(moment.getTime())
  expect(names.whatMadeTheBackup(second)).toBe('the-door')
  expect(names.backupNameFor('the-backup-command', moment, 2)).toBe(names.backupNameFor('the-backup-command', moment))
  for (const never of ['mole-office-20260506-070809-taken-at-the-door-1.db', 'mole-office-20260506-070809-2.db', 'mole-office-20260506-070809-before-the-update-2.db']) {
    expect(names.timeInBackupName(never)).toBeNull()
    expect(names.whatMadeTheBackup(never)).toBeNull()
  }
})
