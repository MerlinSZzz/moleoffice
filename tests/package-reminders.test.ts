// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE INSIDE PACKAGES THAT WAIT ON THEIR MAKER REMIND IT TOGETHER, AT AN INTERVAL EACH SECRETARY SETS.
 *
 * An inside package waits on its maker while it is handed back, or while its newest restatement has no answer. Once a
 * minute the office sends each maker one reminder per project that lists every package waiting on it, by line, one
 * interval after the last reminder it sent that maker there. A secretary sets its own interval at
 * PUT /api/residents/:agentId/package-reminder-every; every other maker is reminded at the default. The clock is
 * src/server/lib/package-reminders.ts.
 *
 * WHAT IS PROVED HERE, in a test office with made-up agents, packages, lines and one made-up department. Each case has
 * its own maker, and the minutes are called at times the test chooses:
 *   1. a handed-back package is in one reminder at the first minute, with the count, its line, its title and its link;
 *      the next minute sends nothing, and the minute at four hours sends one more;
 *   2. a restatement nobody answered is in a reminder, and once it is answered aligned the package is not counted; a
 *      done package and one only taken are never counted;
 *   3. two lines are counted apart, each package under each of its lines, and the line a department holds is named by
 *      the department;
 *   4. with nothing waiting, nothing is sent at any minute;
 *   5. a secretary sets its own interval with its key, which writes the row and one change; the next reminder comes at
 *      the new interval and not at four hours; another agent is refused 403, and 0, 1.5, 169 hours and a missing reason
 *      are refused 400, each leaving the row and the change log as they were;
 *   6. a row that cannot be read is read back as unreadable with the stored text, and the reminder comes at the default
 *      and says the stored interval could not be read;
 *   7. a maker without the secretary card is reminded at the default, whatever row it has, and its interval cannot be
 *      set.
 *
 * THE WORDS ARE READ FROM THE WORD LIST THE CLOCK SAYS THEM FROM, so a change of wording does not break the proof.
 */

import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'

import { sayInEnglish } from '../src/shared/i18n.ts'
import { PACKAGE_REMINDER_DEFAULT_HOURS, packageReminderSettingName } from '../src/shared/package-reminders.ts'
import { THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { aMadeUpModuleForPackage, injectedPackageFixture } from './module-package-fixture.ts'
import { apiApp, freshDb, theOfficesKeyHeader, thePersonsKeyHeader, type TestDb, governsTheWholeProject } from './helpers.ts'

const WORKSPACE = 'made-up-package-reminders'
const PARENT = 'made-up-parent'
const WORKER = 'made-up-worker'
const PROPOSER = 'made-up-proposer'
const WORDS = { forTheOutside: 'Do the made-up work.', acceptance: 'The made-up work is done.' }
const HOUR = 3_600_000
let db: TestDb
let app: FastifyInstance
let clock: typeof import('../src/server/lib/package-reminders.ts')
const ids: Record<string, string> = {}
const keys: Record<string, string> = {}
const person = () => ({ 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE })
const agent = (handle: string) => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-workspace': WORKSPACE })
const withKey = (handle: string) => ({ ...agent(handle), 'x-mole-office-key': keys[handle] as string })

async function register(handle: string, role: string, headers: Record<string, string> = person()) {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle, name: handle, role, chapters: ['5:full'], ...(role === 'worker' ? { workArea: ['src/server/lib'] } : {}) } })
  expect(reply.statusCode, reply.body).toBe(201)
  ids[handle] = String(reply.json().agent.id)
  keys[handle] = String(reply.json().whatToGiveIt?.key ?? '')
}
async function file(kind: string, title: string, data: Record<string, unknown> = {}, headers: Record<string, string> = person()): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind, title, data: kind === 'decision' ? { ...governsTheWholeProject(), replaces: [], ...data } : data } })
  expect(reply.statusCode, reply.body).toBe(201)
  return String(reply.json().record.id)
}
async function step(task: string, door: string, payload: Record<string, unknown>, headers: Record<string, string>) {
  const reply = await app.inject({ method: 'POST', url: `/api/delegation/${task}/${door}`, headers, payload })
  expect(reply.statusCode, `${door}: ${reply.body}`).toBe(201)
  return reply.json()
}
async function runOf(handle: string) {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers: { ...agent(THE_MESSAGE_WORKER_ID), ...theOfficesKeyHeader() }, payload: { kind: 'session', title: 'A made-up worker run', data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: ids[handle] } } })
  expect(reply.statusCode, reply.body).toBe(201)
  return { ...agent(handle), 'x-mole-office-session': String(reply.json().record.id), 'x-mole-office-key': String(reply.json().runKey?.key ?? '') }
}

/** An inside package made by `maker` on `lines`, with its one point. */
async function aPackage(maker: string, title: string, lines: string[]) {
  const decision = await file('decision', 'A made-up decision')
  const point = await file('backlog_item', 'A made-up point', { line: lines[0], number: 'made-up', placedBy: { kind: 'person', id: THE_PERSON }, why: 'Made up.', doneWhen: 'Done.', state: 'todo' })
  const moduleId = await aMadeUpModuleForPackage(injectedPackageFixture(app, WORKSPACE))
  const parent = await file('task', 'A made-up parent task', {}, agent(PARENT))
  await step(parent, 'package', { ...WORDS, moduleIds: [moduleId], parent: { kind: 'decision', id: decision }, pointIds: [point] }, person())
  const task = await file('task', title, {}, agent(maker))
  await step(task, 'package', { ...WORDS, moduleIds: [moduleId], parent: { kind: 'task', id: parent }, pointIds: [point], lines }, agent(maker))
  return { task, point }
}
async function handedBack(maker: string, title: string, lines: string[]) {
  const made = await aPackage(maker, title, lines)
  const run = await runOf(WORKER)
  await step(made.task, 'take-inside', {}, agent(WORKER))
  await step(made.task, 'hand-back', { points: [{ pointId: made.point, outcome: 'done', words: 'Done.' }] }, run)
  return made
}

/** Every package reminder handed to this agent, oldest first. */
function remindersTo(handle: string): { title: string; body: string }[] {
  const rows = db.client.sqlite.prepare(`SELECT r.title AS title, r.data AS data FROM message_delivery d JOIN records r ON r.id = d.message_id WHERE d.recipient_kind = 'agent' AND d.recipient_id = ? AND r.kind = 'message' AND r.deleted_at IS NULL ORDER BY r.rowid`).all(ids[handle]) as { title: string; data: string }[]
  return rows.map((row) => ({ title: row.title, data: JSON.parse(row.data) })).filter((row) => row.data.notice === 'packageReminder').map((row) => ({ title: row.title, body: String(row.data.body) }))
}
/** One minute of the clock at `when`, with the office's clock there too. */
function minuteAt(when: number, log: (line: string) => void = () => {}) {
  vi.setSystemTime(new Date(when))
  return clock.aMinuteOfThePackageReminders(when, log)
}
const theRow = (handle: string) => (db.client.sqlite.prepare('SELECT value FROM runtime_settings WHERE name = ?').get(packageReminderSettingName(ids[handle] as string)) as { value: string } | undefined)?.value ?? null
const theChanges = (handle: string) => (db.client.sqlite.prepare('SELECT count(*) AS n FROM changes WHERE record_id = ?').get(`setting:${packageReminderSettingName(ids[handle] as string)}`) as { n: number }).n
const theGroup = (group: string, n: number) => sayInEnglish('packageReminder.group', { group, count: sayInEnglish('packageReminder.count', { n }) })
const setTheInterval = (handle: string, headers: Record<string, string>, payload: Record<string, unknown>) =>
  app.inject({ method: 'PUT', url: `/api/residents/${ids[handle]}/package-reminder-every`, headers, payload })

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2030-01-14T09:00:00Z'))
  db = await freshDb()
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  app = (await apiApp()).app
  await app.ready()
  clock = await import('../src/server/lib/package-reminders.ts')
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: WORKSPACE, title: 'A made-up project' } })
  expect(made.statusCode, made.body).toBe(201)
  await register(PARENT, 'supervisor')
  await register(PROPOSER, 'secretary')
  for (const handle of ['made-up-maker-one', 'made-up-maker-two', 'made-up-maker-three', 'made-up-maker-four', 'made-up-maker-seven']) await register(handle, 'supervisor')
  for (const handle of ['made-up-secretary-five', 'made-up-secretary-six']) await register(handle, 'secretary')
  await register(WORKER, 'worker', agent(PARENT))
  await register('made-up-other-agent', 'worker', agent(PARENT))
}, 60_000)
afterAll(async () => {
  await app.close()
  db.close()
  vi.useRealTimers()
})

it('1: reminds the maker of a handed-back package at once, then not until four hours have passed', async () => {
  const at = Date.parse('2030-01-15T08:00:00Z')
  vi.setSystemTime(new Date(at))
  const { task } = await handedBack('made-up-maker-one', 'A made-up handed-back package', ['made-up-line-one'])

  minuteAt(at)
  const first = remindersTo('made-up-maker-one')
  expect(first).toHaveLength(1)
  expect(first[0]!.title).toBe(sayInEnglish('packageReminder.title', { n: 1 }))
  expect(first[0]!.body).toContain(sayInEnglish('packageReminder.total', { n: 1 }))
  expect(first[0]!.body).toContain(theGroup(sayInEnglish('packageReminder.groupOfALine', { line: 'made-up-line-one' }), 1))
  expect(first[0]!.body).toContain(sayInEnglish('packageReminder.package', { title: 'A made-up handed-back package', task, waits: sayInEnglish('packageReminder.waitsForTheHandBack') }))
  expect(first[0]!.body).toContain(`#/r/${task}`)

  minuteAt(at + 60_000)
  minuteAt(at + PACKAGE_REMINDER_DEFAULT_HOURS * HOUR - 60_000)
  expect(remindersTo('made-up-maker-one')).toHaveLength(1)
  minuteAt(at + PACKAGE_REMINDER_DEFAULT_HOURS * HOUR)
  expect(remindersTo('made-up-maker-one')).toHaveLength(2)
}, 60_000)

it('2: counts a restatement nobody answered until it is answered, and never a done package or one only taken', async () => {
  const at = Date.parse('2030-01-16T08:00:00Z')
  vi.setSystemTime(new Date(at))
  const maker = 'made-up-maker-two'
  const done = await handedBack(maker, 'A made-up done package', ['made-up-line-two'])
  await step(done.task, 'check', { answer: 'holds', words: 'Yes.' }, agent(maker))
  await step(done.task, 'accept', { points: [{ pointId: done.point, answer: 'accepted' }] }, agent(maker))
  const taken = await aPackage(maker, 'A made-up package only taken', ['made-up-line-two'])
  await step(taken.task, 'take-inside', {}, agent(WORKER))
  const restated = await aPackage(maker, 'A made-up restated package', ['made-up-line-two'])
  await step(restated.task, 'take-inside', {}, agent(WORKER))
  await step(restated.task, 'align', { restated: 'I will do the made-up point.', plan: 'Do it.' }, agent(WORKER))

  minuteAt(at)
  const reminders = remindersTo(maker)
  expect(reminders).toHaveLength(1)
  expect(reminders[0]!.body).toContain(sayInEnglish('packageReminder.total', { n: 1 }))
  expect(reminders[0]!.body).toContain(sayInEnglish('packageReminder.package', { title: 'A made-up restated package', task: restated.task, waits: sayInEnglish('packageReminder.waitsForTheRestatement') }))
  expect(reminders[0]!.body).not.toContain(done.task)
  expect(reminders[0]!.body).not.toContain(taken.task)

  await step(restated.task, 'align-answer', { answer: 'aligned', words: 'Yes.' }, agent(maker))
  minuteAt(at + PACKAGE_REMINDER_DEFAULT_HOURS * HOUR)
  minuteAt(at + 3 * PACKAGE_REMINDER_DEFAULT_HOURS * HOUR)
  expect(remindersTo(maker)).toHaveLength(1)
}, 60_000)

it('3: counts each line apart, each package under each of its lines, and names a line by the department that holds it', async () => {
  const at = Date.parse('2030-01-17T08:00:00Z')
  vi.setSystemTime(new Date(at))
  const maker = 'made-up-maker-three'
  const held = 'made-up-line-a-department-holds'
  const plain = 'made-up-line-no-department-holds'
  const filed = await app.inject({ method: 'POST', url: '/api/departments', headers: { ...person(), ...thePersonsKeyHeader(join(dirname(db.file), 'keys.json')) }, payload: { codes: [held], nameEn: 'Made-up queue', state: 'running' } })
  expect(filed.statusCode, filed.body).toBe(201)
  const inTheDepartment = await handedBack(maker, 'A made-up package of the department', [held])
  const onThePlainLine = await handedBack(maker, 'A made-up package of the plain line', [plain])
  const onBoth = await handedBack(maker, 'A made-up package of both lines', [held, plain])

  minuteAt(at)
  const reminders = remindersTo(maker)
  expect(reminders).toHaveLength(1)
  const body = reminders[0]!.body
  expect(body).toContain(sayInEnglish('packageReminder.total', { n: 3 }))
  const groups = body.split('\n\n')
  const department = groups.find((one) => one.startsWith(theGroup(sayInEnglish('packageReminder.groupOfADepartment', { name: 'Made-up queue' }), 2)))
  const line = groups.find((one) => one.startsWith(theGroup(sayInEnglish('packageReminder.groupOfALine', { line: plain }), 2)))
  expect(department, body).toBeDefined()
  expect(line, body).toBeDefined()
  expect(department).toContain(inTheDepartment.task)
  expect(department).toContain(onBoth.task)
  expect(department).not.toContain(onThePlainLine.task)
  expect(line).toContain(onThePlainLine.task)
  expect(line).toContain(onBoth.task)
  expect(line).not.toContain(inTheDepartment.task)
  expect(body).not.toContain(held)
}, 60_000)

it('4: sends nothing at any minute while nothing waits on the maker', async () => {
  const at = Date.parse('2030-01-18T08:00:00Z')
  vi.setSystemTime(new Date(at))
  const maker = 'made-up-maker-four'
  await aPackage(maker, 'A made-up package nobody took', ['made-up-line-four'])
  const taken = await aPackage(maker, 'A made-up package only taken', ['made-up-line-four'])
  await step(taken.task, 'take-inside', {}, agent(WORKER))

  for (const when of [at, at + 60_000, at + PACKAGE_REMINDER_DEFAULT_HOURS * HOUR, at + 24 * HOUR]) {
    const minute = minuteAt(when)
    expect(minute.sent.filter((one) => one.to.id === ids[maker])).toEqual([])
  }
  expect(remindersTo(maker)).toEqual([])
}, 60_000)

it('5: lets a secretary set its own interval, which the next reminder keeps, and refuses anyone else and any bad value', async () => {
  const at = Date.parse('2030-01-19T08:00:00Z')
  vi.setSystemTime(new Date(at))
  const secretary = 'made-up-secretary-five'
  await handedBack(secretary, 'A made-up package of a secretary', ['made-up-line-five'])
  minuteAt(at)
  expect(remindersTo(secretary)).toHaveLength(1)

  vi.setSystemTime(new Date(at + HOUR))
  const set = await setTheInterval(secretary, withKey(secretary), { hours: 6, because: 'Made up: it reads its packages less often.' })
  expect(set.statusCode, set.body).toBe(200)
  expect(set.json()).toMatchObject({ hours: 6, from: 'set', because: 'Made up: it reads its packages less often.', setBy: { type: 'agent' }, stored: '{"hours":6}' })
  expect(set.json().setAt).toEqual(expect.any(String))
  expect(theRow(secretary)).toBe('{"hours":6}')
  expect(theChanges(secretary)).toBe(1)

  minuteAt(at + PACKAGE_REMINDER_DEFAULT_HOURS * HOUR)
  minuteAt(at + 6 * HOUR - 60_000)
  expect(remindersTo(secretary)).toHaveLength(1)
  minuteAt(at + 6 * HOUR)
  expect(remindersTo(secretary)).toHaveLength(2)

  const other = await setTheInterval(secretary, withKey('made-up-other-agent'), { hours: 2, because: 'Made up: another agent asks.' })
  expect(other.statusCode, other.body).toBe(403)
  expect(theRow(secretary)).toBe('{"hours":6}')
  expect(theChanges(secretary)).toBe(1)
  for (const payload of [{ hours: 0, because: 'Made up.' }, { hours: 1.5, because: 'Made up.' }, { hours: 169, because: 'Made up.' }, { hours: 2 }]) {
    const refused = await setTheInterval(secretary, withKey(secretary), payload)
    expect(refused.statusCode, `${JSON.stringify(payload)}: ${refused.body}`).toBe(400)
    expect(theRow(secretary)).toBe('{"hours":6}')
    expect(theChanges(secretary)).toBe(1)
  }
}, 60_000)

it('6: reads an unreadable row as unreadable, and reminds at the default saying the stored interval could not be read', async () => {
  const at = Date.parse('2030-01-20T08:00:00Z')
  vi.setSystemTime(new Date(at))
  const secretary = 'made-up-secretary-six'
  const proposed = await app.inject({ method: 'POST', url: '/api/residents/proposals', headers: withKey(PROPOSER), payload: { agentId: secretary, because: 'It has done steady made-up work here for weeks.', sleepTime: { startsAt: '23:59', minutes: 60 } } })
  expect(proposed.statusCode, proposed.body).toBe(201)
  const confirmed = await app.inject({ method: 'POST', url: `/api/residents/proposals/${String(proposed.json().proposal.id)}/confirm`, headers: person() })
  expect(confirmed.statusCode, confirmed.body).toBe(200)
  const stored = 'not a made-up interval {'
  db.client.sqlite.prepare('INSERT INTO runtime_settings (name, value) VALUES (?, ?)').run(packageReminderSettingName(ids[secretary] as string), stored)

  const read = await app.inject({ method: 'GET', url: `/api/residents/${ids[secretary]}`, headers: person() })
  expect(read.statusCode, read.body).toBe(200)
  expect(read.json().packageReminderEvery).toEqual({ hours: PACKAGE_REMINDER_DEFAULT_HOURS, from: 'unreadable', setBy: null, setAt: null, because: null, stored })

  await handedBack(secretary, 'A made-up package of a secretary with an unreadable interval', ['made-up-line-six'])
  const log = vi.fn()
  minuteAt(at, log)
  const reminders = remindersTo(secretary)
  expect(reminders).toHaveLength(1)
  expect(reminders[0]!.body).toContain(sayInEnglish('packageReminder.unreadable', { hours: PACKAGE_REMINDER_DEFAULT_HOURS }))
  expect(log).toHaveBeenCalledWith(expect.stringContaining(stored))
  minuteAt(at + PACKAGE_REMINDER_DEFAULT_HOURS * HOUR - 60_000)
  expect(remindersTo(secretary)).toHaveLength(1)
  minuteAt(at + PACKAGE_REMINDER_DEFAULT_HOURS * HOUR)
  expect(remindersTo(secretary)).toHaveLength(2)
}, 60_000)

it('7: reminds a maker without the secretary card at the default, whatever row it has, and refuses to set its interval', async () => {
  const at = Date.parse('2030-01-21T08:00:00Z')
  vi.setSystemTime(new Date(at))
  const maker = 'made-up-maker-seven'
  db.client.sqlite.prepare('INSERT INTO runtime_settings (name, value) VALUES (?, ?)').run(packageReminderSettingName(ids[maker] as string), '{"hours":1}')
  await handedBack(maker, 'A made-up package of a maker with no card', ['made-up-line-seven'])

  minuteAt(at)
  minuteAt(at + HOUR)
  minuteAt(at + PACKAGE_REMINDER_DEFAULT_HOURS * HOUR - 60_000)
  expect(remindersTo(maker)).toHaveLength(1)
  minuteAt(at + PACKAGE_REMINDER_DEFAULT_HOURS * HOUR)
  expect(remindersTo(maker)).toHaveLength(2)
  expect(remindersTo(maker)[0]!.body).not.toContain(sayInEnglish('packageReminder.unreadable', { hours: PACKAGE_REMINDER_DEFAULT_HOURS }))

  const refused = await setTheInterval(maker, person(), { hours: 2, because: 'Made up: the person asks.' })
  expect(refused.statusCode, refused.body).toBe(403)
  expect(theRow(maker)).toBe('{"hours":1}')
  expect(theChanges(maker)).toBe(0)
}, 60_000)
