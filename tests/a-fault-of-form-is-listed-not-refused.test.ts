// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FAULT OF FORM IS LISTED BEFORE THE SEAL, NEVER REFUSED. What a program can find in the
 * records a seal answers for is listed, and a position called "remind" never blocks. The block position still
 * refuses over a certain item its reminder named that the same check still finds, because that is the person's own
 * setting. Every refusal of the hard gate is counted as a stopped write, so the office can say how many seals it
 * refused and aim at zero (src/server/lib/before-the-seal-rules.ts, src/server/lib/before-the-seal.ts).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. For each of the eleven rules, R1 to R11, at "remind": the first sealing write by the run's own key is reminded, the
 *      reminder names the rule's item as certain, its `refuses` list is empty, and the office's line does not say
 *      "refuses the seal" for it. The same write sent again seals: the reply is 200 and the run's state is `finished`.
 *      The before-the-seal row's stopped count, read through GET /api/office/gates, is the same after the seal as before
 *      the first write.
 *        R1  a report linked about the run with no short forms;
 *        R2  a decision the run recorded with no short forms;
 *        R3  a linked report whose short forms are older than its newest revision;
 *        R4  a linked report that is incomplete (it says for nobody);
 *        R5  a linked report with no chaptersRead;
 *        R6  a decision under 'reversible engineering judgement' with no revisit_when;
 *        R7  a decision whose authority_reference is shaped as a record id that names no record;
 *        R8  a run with no doing line;
 *        R9  a run not linked about the refusal that still stands on the latest earlier ended run of its agent; with two
 *            such runs, only the latest is asked for;
 *        R10 a report the run filed that is linked about no run;
 *        R11 a report the run filed that is linked about no page and has no nothingFits entry.
 *   2. A records seal whose carried record has no short forms is reminded and seals at "remind" on the second write.
 *   3. A launcher-shaped finish sent by the starter's key with `remindBeforeTheSeal: false`, over a fault of form, seals
 *      at once.
 *   4. At "block", for R1: the reminder's `refuses` list names the item, the second write is refused with 409 and
 *      nothing is stored, `stopped` goes up by one, and once the fault is fixed the same write seals.
 *   5. At "remind", a git seal over a migration item is refused by the hard gate with 409, and `stopped` goes up by
 *      exactly one for that refusal. At "off", the same seal is refused too and counted too.
 *   6. Likely items, a copied value among them, never refuse: the reminder names them, marks none, and the same write
 *      seals.
 *   7. Pure: `theItemsNoSealPasses` returns every migration item when the seal seals a branch, and nothing else: no
 *      fault of form, likely item or other certain item.
 *
 * The person seals and the office itself seals over a fault of form, as before, and those cases are kept.
 *
 * Every repository is made here in the system's temporary folder; every key is made up. The bare migration prefix and
 * the copied sentence are built at runtime, so no line of this file reads as either.
 */

import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { gateNamed } from '../src/config/gates.mjs'
import { type ANamedItem } from '../src/shared/before-the-seal.ts'
import { THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { A_REVERSIBLE_JUDGEMENT, THE_FAULTS_OF_FORM, theItemsNoSealPasses, theKindOfAnItem } from '../src/server/lib/before-the-seal-rules.ts'
import { EVERY_CHAPTER } from './a-run-in-form.ts'
import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'

const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const HANDLE = 'a-round-whose-form-is-judged'
/** R9's agent, apart, so no other case's runs are its earlier runs. */
const EARLIER = 'a-round-with-refused-runs'
/** The agent that starts STARTED, and finishes its run the launcher's way. */
const STARTER = 'a-starter-of-rounds'
const STARTED = 'a-round-its-starter-ends'

/** A bare migration prefix, and thirty characters of the code's words, each put together so no line here holds it. */
const A_MIGRATION_PREFIX = ['02', '16_'].join('')
const A_SENTENCE_OF_THE_CODE = ['abcdefghij', 'klmnopqrst', 'uvwxyz1234'].join('')

let t: TestDb
let app: FastifyInstance
let listRevisions: typeof import('../src/server/lib/revisions.ts').listRevisions
let writeShortForms: typeof import('../src/server/lib/zoom.ts').writeShortForms
const directories: string[] = []
/** Each agent's own key, as its registration answered it. */
const keys = new Map<string, string>()

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_THE_OFFICE_WORKER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': THE_MESSAGE_WORKER_ID,
  'x-mole-office-key': A_MADE_UP_OFFICE_KEY,
}

const asAgent = (id: string): Record<string, string> => ({ ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })

/** An agent proved by its own key, as the launcher's fallback sends the starter's. */
const byItsKey = (id: string): Record<string, string> => {
  const key = keys.get(id)
  if (key === undefined || !/^[0-9a-f]{64}$/u.test(key)) throw new Error(`the registration of ${id} answered no key, so this case would prove nothing`)
  return { ...asAgent(id), 'x-mole-office-key': key }
}

type ARun = { id: string; key: string; agent: string; dir: string; b: string }

const asTheRun = (run: ARun): Record<string, string> => ({
  ...asAgent(run.agent),
  'x-mole-office-session': run.id,
  'x-mole-office-key': run.key,
})

const THE_PERSONS_ACTOR = { type: 'human' as const, id: THE_PERSON }

const git = (dir: string, ...args: string[]): string => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()

/** A made-up repository at commit A on main, with the worker branch checked out. */
function aMadeUpRepository(): { dir: string; a: string } {
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-form-at-the-seal-'))
  directories.push(dir)
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.name', 'Synthetic form test')
  git(dir, 'config', 'user.email', 'form@example.invalid')
  git(dir, 'config', 'commit.gpgsign', 'false')
  mkdirSync(join(dir, 'work'))
  writeFileSync(join(dir, 'work/a.txt'), 'before\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-qm', 'Synthetic commit A')
  const a = git(dir, 'rev-parse', 'HEAD')
  git(dir, 'switch', '-qc', 'worker')
  return { dir, a }
}

/**
 * Commit B on the worker branch, written after the run is filed. `clean` changes one file and adds no test; `migration`
 * adds a test naming a migration by its bare prefix; `copies` adds code and a test that repeats the code's sentence.
 */
function commitB(dir: string, what: 'clean' | 'migration' | 'copies'): string {
  writeFileSync(join(dir, 'work/a.txt'), 'after\n')
  if (what === 'migration') {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, 'tests/made-up-migration.test.ts'), `const before = migrationsBefore('${A_MIGRATION_PREFIX}')\n`)
  }
  if (what === 'copies') {
    mkdirSync(join(dir, 'src'), { recursive: true })
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, 'src/made-up.ts'), `export const THE_WORDS = '${A_SENTENCE_OF_THE_CODE}'\n`)
    writeFileSync(join(dir, 'tests/made-up.test.ts'), `const said = sayIt()\nexpect(said).toBe('${A_SENTENCE_OF_THE_CODE}')\n`)
  }
  git(dir, 'add', '.')
  git(dir, 'commit', '-qm', 'Synthetic commit B')
  return git(dir, 'rev-parse', 'HEAD')
}

/** A running run filed through the door the launcher uses, then its own commit B. The office mints its key there. */
async function aRun(title: string, options: { agent?: string; doing?: string | null; commit?: 'clean' | 'migration' | 'copies' } = {}): Promise<ARun> {
  const agent = options.agent ?? HANDLE
  const { dir, a } = aMadeUpRepository()
  const doing = options.doing === undefined ? { doing: 'sealing' } : options.doing === null ? {} : { doing: options.doing }
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_OFFICE_WORKER,
    payload: {
      kind: 'session',
      title,
      data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: agent, ...doing, workingDirectory: dir, cutFrom: 'main', tip: a },
    },
  })
  expect(filed.statusCode, filed.body.slice(0, 300)).toBe(201)
  const body = filed.json() as { record: { id: string }; runKey?: { key?: string } }
  const key = String(body.runKey?.key)
  expect(key, 'the office minted the run no key, so this file would prove nothing').toMatch(/^[0-9a-f]{64}$/)
  return { id: body.record.id, key, agent, dir, b: commitB(dir, options.commit ?? 'clean') }
}

let reportsFiled = 0

/** The made-up module every report here is about, filed at the first report that asks for it. */
let thePage: string | undefined

/**
 * A report the run's agent files in the run's own session, as a round files its report. By default it is complete,
 * lists every chapter, says the audit table is left for the merge queue, is linked about the run and about a page, and
 * has its label. `page: false` leaves out the link to the page.
 */
function aReport(run: ARun, options: { leaveOut?: string[]; linked?: boolean; page?: boolean; label?: boolean } = {}): string {
  reportsFiled += 1
  const data: Record<string, unknown> = {
    for: 'The supervisor of the made-up round',
    date: '2026-11-09',
    chaptersRead: EVERY_CHAPTER,
    blocks: [{ id: 'b-1', type: 'text', text: 'A made-up report of a made-up round. The audit table is left for the merge queue.' }],
  }
  for (const field of options.leaveOut ?? []) delete data[field]
  const id = t.api.createRecord({
    workspaceId: 'default',
    kind: 'report',
    title: `Synthetic report number ${String(reportsFiled)} of a made-up round`,
    data,
    actor: { type: 'agent', id: run.agent, sessionId: run.id },
  }).id
  if (options.linked !== false) t.api.createLink({ fromId: id, toId: run.id, type: 'about', actor: THE_PERSONS_ACTOR })
  if (options.page !== false) {
    thePage ??= t.api.createRecord({ workspaceId: 'default', kind: 'module', title: 'Synthetic module the reports are about', origin: 'fixture', data: {}, actor: THE_PERSONS_ACTOR }).id
    t.api.createLink({ fromId: id, toId: thePage, type: 'about', actor: THE_PERSONS_ACTOR })
  }
  if (options.label !== false) aLabelFor(id)
  return id
}

/**
 * A decision the run's agent records in the run's own session, under a reversible engineering judgement. A field given
 * as undefined is left out.
 */
function aDecision(run: ARun, title: string, data: Record<string, unknown> = {}, options: { label?: boolean } = {}): string {
  const fields: Record<string, unknown> = {
    decided_by: run.agent,
    decided_on: '2026-11-09',
    authority: A_REVERSIBLE_JUDGEMENT,
    because: 'Synthetic: the choice is reversible and a failed trial reopens it.',
    replaces: [],
    revisit_when: 'Synthetic: a failed trial of the choice reopens it.',
    alternatives_rejected: ['Synthetic: the other way, turned down'],
    ...data,
  }
  for (const [field, value] of Object.entries(fields)) if (value === undefined) delete fields[field]
  const id = t.api.createRecord({ kind: 'decision', title, workspaceId: 'default', actor: { type: 'agent', id: run.agent, sessionId: run.id }, data: fields }).id
  if (options.label !== false) aLabelFor(id)
  return id
}

/** A note, as a record a records seal carries or a refusal's message. */
function aNote(title: string): string {
  return t.api.createRecord({ workspaceId: 'default', kind: 'note', title, data: { body: 'Made up.' }, actor: THE_PERSONS_ACTOR }).id
}

/** A label written from the record's newest revision, as the short-forms door writes one. */
function aLabelFor(id: string): void {
  const newest = listRevisions(id).revisions[0]
  if (newest === undefined) throw new Error(`record ${id} has no revision to write a short form from`)
  writeShortForms(id, 'default', { madeFrom: { seq: newest.seq, contentHash: newest.contentHash }, forms: { label: 'Made-up record' } }, THE_PERSONS_ACTOR)
}

/** A change to a record's data, written by the person, which leaves its short forms one revision behind. */
function aChangeTo(id: string, dataPatch: Record<string, unknown>): void {
  t.api.patchRecord(id, { dataPatch }, THE_PERSONS_ACTOR)
}

const theWrite = (run: ARun, more: Record<string, unknown> = {}) => ({ dataPatch: { state: 'finished', tip: run.b, ...more } })

const send = (run: ARun, payload: Record<string, unknown>, headers: Record<string, string> = asTheRun(run)) =>
  app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers, payload })

/** The rule a refusing item's kind breaks, read from the one list. */
const theRuleOf = (key: string): string => {
  const rule = THE_FAULTS_OF_FORM[theKindOfAnItem(key)]
  if (rule === undefined) throw new Error(`${key} is of no kind the list names`)
  return rule
}

type AnItemInAReply = { key: string; about: string; says: string; mechanical?: boolean }
type TheReminderInAReply = { sealed: boolean; items: AnItemInAReply[]; refuses: { key: string; rule: string }[]; again: string; line: string }
type TheStoppedCount = { lastThirtyDays: number; sinceCountingBegan: number }

/**
 * THE BEFORE-THE-SEAL ROW'S STOPPED COUNT, read through GET /api/office/gates as the person reads it. Both periods are
 * read, so a count that moved in either one is caught.
 */
async function theStopped(): Promise<TheStoppedCount> {
  const read = await app.inject({ method: 'GET', url: '/api/office/gates?gate=before-the-seal', headers: AS_THE_PERSON })
  expect(read.statusCode, read.body.slice(0, 300)).toBe(200)
  const counts = (read.json() as { row: { counts: { lastThirtyDays: { stopped: number }; sinceCountingBegan: { stopped: number } } | null } }).row.counts
  return counts === null
    ? { lastThirtyDays: 0, sinceCountingBegan: 0 }
    : { lastThirtyDays: counts.lastThirtyDays.stopped, sinceCountingBegan: counts.sinceCountingBegan.stopped }
}

/** The same count, one stopped write later. */
const oneStoppedMore = (before: TheStoppedCount): TheStoppedCount => ({
  lastThirtyDays: before.lastThirtyDays + 1,
  sinceCountingBegan: before.sinceCountingBegan + 1,
})

/**
 * ONE FAULT OF FORM AT "remind": the first sealing write by the run's own key is reminded with the item certain and
 * refusing nothing, the same write again seals, and the stopped count is where it began. The record the item names is
 * in its own sentence.
 */
async function theFaultIsListed(run: ARun, key: string, record: string): Promise<void> {
  const stopped = await theStopped()
  const first = await send(run, theWrite(run))
  expect(first.statusCode, first.body.slice(0, 600)).toBe(200)
  const reminder = (first.json() as { beforeTheSeal?: TheReminderInAReply }).beforeTheSeal
  if (reminder === undefined) throw new Error(`the first sealing write gave no reminder: ${first.body.slice(0, 600)}`)
  expect(reminder.sealed).toBe(false)
  expect(t.api.getRecord(run.id)!.data['state']).toBe('running')
  const item = reminder.items.find((one) => one.key === key)
  if (item === undefined) throw new Error(`the reminder named no item ${key}: ${JSON.stringify(reminder.items.map((one) => one.key))}`)
  expect(item.mechanical).toBe(true)
  expect(item.says).toContain(record)
  // THE SAME WRITE AGAIN SEALS: a fault of form is listed, and the hard gate never refuses it.
  await itSeals(run)
  // WHAT THE REMINDER SAID: nothing it named refuses a later write, and its line says so.
  expect(reminder.refuses, JSON.stringify(reminder.items.map((one) => one.key))).toEqual([])
  const line = t.api.getRecord(reminder.line)
  expect(line, 'the reminder kept no line').not.toBeNull()
  const said = String(line!.data['saidInFull'] ?? line!.data['body'])
  expect(said).not.toContain('refuses the seal')
  // THE COUNT DID NOT MOVE: the seal was not refused.
  expect(await theStopped()).toEqual(stopped)
}

/** The same write again, while the fault is still there: 409, naming the item and the record; nothing stored. */
async function aLaterWriteIsRefused(run: ARun, item: AnItemInAReply, record: string, payload = theWrite(run), headers = asTheRun(run)): Promise<string> {
  const before = t.api.getRecord(run.id)!
  const revisions = listRevisions(run.id).count
  const refused = await send(run, payload, headers)
  expect(refused.statusCode, refused.body.slice(0, 800)).toBe(409)
  const error = (refused.json() as { error: string }).error
  expect(error).toContain(item.says)
  expect(error).toContain('This refuses the seal.')
  expect(error).toContain(record)
  expect(error).toContain('Nothing was written')
  const after = t.api.getRecord(run.id)!
  expect(after.data).toEqual(before.data)
  expect(after.data['state']).toBe('running')
  expect(after.data['theCheck']).toBeUndefined()
  expect(listRevisions(run.id).count).toBe(revisions)
  return error
}

/** The write seals: the run is finished, with a sealed tip. */
async function itSeals(run: ARun, payload: Record<string, unknown> = theWrite(run), headers = asTheRun(run)): Promise<void> {
  const sealed = await send(run, payload, headers)
  expect(sealed.statusCode, sealed.body.slice(0, 800)).toBe(200)
  const record = t.api.getRecord(run.id)!
  expect(record.data['state']).toBe('finished')
  expect(record.data['sealedTip']).toEqual(expect.any(String))
}

/** A refusal that still stands on an ended run, as the check's door writes one: the run crashed after it. */
function endedAndRefused(run: ARun, check: string): void {
  const record = t.api.getRecord(run.id)!
  writeDataBypassingTheGate(t, run.id, { ...record.data, state: 'crashed', refused: { by: { kind: 'agent', id: 'a-made-up-inspector' }, at: '2026-11-09 10:00:00', check } })
}

function atPosition(position: string): void {
  t.client.sqlite.prepare('INSERT OR REPLACE INTO runtime_settings (name, value) VALUES (?, ?)').run(String(gateNamed('before-the-seal')?.setting), position)
}

function backToTheDefaultPosition(): void {
  t.client.sqlite.prepare('DELETE FROM runtime_settings WHERE name = ?').run(String(gateNamed('before-the-seal')?.setting))
}

beforeAll(async () => {
  t = await freshDb()
  // THE DEFAULT SET, COPIED AS A NEW OFFICE DOES AT ITS FIRST START: a chapters line is read against the office's
  // chapter records. Imported after freshDb, which resets the modules.
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  listRevisions = (await import('../src/server/lib/revisions.ts')).listRevisions
  writeShortForms = (await import('../src/server/lib/zoom.ts')).writeShortForms
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  // A SUPERVISOR REGISTERS ONE DIRECTORY, and cuts its workers' folders under it.
  const register = async (handle: string, role: string, headers: Record<string, string>, workArea?: string[]): Promise<void> => {
    const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle, name: handle, role, runtime: 'claude-code', ...(workArea === undefined ? {} : { workArea }) } })
    expect(registered.statusCode, registered.body.slice(0, 300)).toBe(201)
    const key = (registered.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key
    if (key !== undefined) keys.set(handle, key)
  }
  await register(HANDLE, 'worker', AS_THE_PERSON, ['work', 'src', 'tests'])
  await register(EARLIER, 'worker', AS_THE_PERSON, ['work', 'src', 'tests'])
  await register(STARTER, 'supervisor', AS_THE_PERSON, ['work'])
  await register(STARTED, 'worker', asAgent(STARTER), ['work'])
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
})

describe('each fault of form is listed before the seal, not refused', () => {
  it('1, R1: a report linked about the run with no short forms', async () => {
    const run = await aRun('Synthetic run whose report has no label')
    const report = aReport(run, { label: false })
    await theFaultIsListed(run, `report:${report}:short-forms`, report)
  })

  it('1, R2: a decision the run recorded with no short forms', async () => {
    const run = await aRun('Synthetic run whose decision has no label')
    aReport(run)
    const decision = aDecision(run, 'Synthetic choice with no label', {}, { label: false })
    await theFaultIsListed(run, `decision:${decision}:short-forms`, decision)
  })

  it('1, R3: a linked report whose short forms are older than its newest revision', async () => {
    const run = await aRun('Synthetic run whose report changed after its label')
    const report = aReport(run)
    aChangeTo(report, { date: '2026-11-08' })
    await theFaultIsListed(run, `report:${report}:short-forms-out-of-date`, report)
  })

  it('1, R4: a linked report that is incomplete', async () => {
    const run = await aRun('Synthetic run whose report says for nobody')
    const report = aReport(run, { leaveOut: ['for'] })
    await theFaultIsListed(run, `report:${report}:incomplete`, report)
  })

  it('1, R5: a linked report with no chaptersRead', async () => {
    const run = await aRun('Synthetic run whose report lists no chapters')
    const report = aReport(run, { leaveOut: ['chaptersRead'] })
    await theFaultIsListed(run, `report:${report}:chaptersRead`, report)
  })

  it("1, R6: a decision under 'reversible engineering judgement' with no revisit_when", async () => {
    const run = await aRun('Synthetic run whose decision says nothing reopens it')
    aReport(run)
    const decision = aDecision(run, 'Synthetic choice nothing reopens', { revisit_when: undefined })
    await theFaultIsListed(run, `decision:${decision}:revisit-when`, decision)
  })

  it('1, R7: a decision whose authority_reference is shaped as a record id and names no record', async () => {
    const run = await aRun('Synthetic run whose decision cites nothing there')
    aReport(run)
    const nothingHasThisId = ['NoSuch', 'Rec123'].join('')
    const decision = aDecision(run, 'Synthetic choice citing nothing there', { authority_reference: nothingHasThisId })
    await theFaultIsListed(run, `decision:${decision}:authority-reference`, decision)
  })

  it('1, R8: a run with no doing line', async () => {
    const run = await aRun('Synthetic run with no doing line', { doing: null })
    aReport(run)
    await theFaultIsListed(run, 'run:doing', run.id)
  })

  it('1, R9: a run linked about neither the refusal that stands on its agent\'s latest earlier ended run nor that run; an older one is not asked for', async () => {
    const older = await aRun('Synthetic older run of the agent, refused', { agent: EARLIER })
    const olderCheck = aNote('Synthetic message of the older refusal')
    endedAndRefused(older, olderCheck)
    const latest = await aRun('Synthetic latest run of the agent, refused', { agent: EARLIER })
    const latestCheck = aNote('Synthetic message of the latest refusal')
    endedAndRefused(latest, latestCheck)
    const run = await aRun('Synthetic run that reworks a refused round', { agent: EARLIER })
    aReport(run)
    // LINKED ABOUT THE OLDER REFUSAL ONLY: the older run is not read, so that link answers nothing.
    t.api.createLink({ fromId: run.id, toId: olderCheck, type: 'about', actor: THE_PERSONS_ACTOR })
    await theFaultIsListed(run, `run:${latest.id}:refusal`, latest.id)
  })

  it('1, R10: a report the run filed that is linked about no run', async () => {
    const run = await aRun('Synthetic run that filed a report about nothing')
    aReport(run)
    const loose = aReport(run, { linked: false })
    await theFaultIsListed(run, `report:${loose}:about-a-run`, loose)
  })

  it('1, R11: a report the run filed that is linked about no page and has no nothingFits entry', async () => {
    const run = await aRun('Synthetic run that filed a report about no page')
    const loose = aReport(run, { page: false })
    await theFaultIsListed(run, `report:${loose}:about-a-page`, loose)
  })
})

describe('whose seal is listed, and the block that still refuses', () => {
  it('2: a records seal whose carried record has no short forms is reminded and seals on the second write', async () => {
    const run = await aRun('Synthetic run sealed as records')
    // A RECORDS-ONLY RUN HOLDS NO COMMIT PAST ITS CUT: a records seal over commit B is refused and told to declare mixed,
    // so this run's working directory goes back to main before it finishes.
    git(run.dir, 'switch', '-q', 'main')
    aReport(run)
    const note = aNote('Synthetic note the records seal carries')
    const payload = theWrite(run, { submission: { kind: 'records', records: [note] } })
    const key = `record:${note}:short-forms`
    const stopped = await theStopped()
    const first = await send(run, payload)
    expect(first.statusCode, first.body.slice(0, 600)).toBe(200)
    const reminder = (first.json() as { beforeTheSeal?: TheReminderInAReply }).beforeTheSeal
    if (reminder === undefined) throw new Error(`the first sealing write gave no reminder: ${first.body.slice(0, 600)}`)
    expect(reminder.items.find((one) => one.key === key)).toMatchObject({ mechanical: true })
    // THE SAME WRITE AGAIN SEALS: the carried record's missing short forms are listed, not refused.
    await itSeals(run, payload)
    expect(reminder.refuses).toEqual([])
    expect(await theStopped()).toEqual(stopped)
  })

  it("3: a launcher-shaped finish sent by the starter's key with remindBeforeTheSeal false seals at once over a fault of form", async () => {
    const run = await aRun('Synthetic run its starter finishes', { agent: STARTED })
    const payload = { ...theWrite(run, { submission: { kind: 'git' } }), remindBeforeTheSeal: false }
    await itSeals(run, payload, byItsKey(STARTER))
  })

  it('4: at block the reminder names R1 as refusing, the next write is refused and counted, and the same write seals once fixed', async () => {
    atPosition('block')
    try {
      const run = await aRun('Synthetic run at block whose report has no label')
      const report = aReport(run, { label: false })
      const key = `report:${report}:short-forms`
      const first = await send(run, theWrite(run))
      expect(first.statusCode, first.body.slice(0, 600)).toBe(200)
      const reminder = (first.json() as { beforeTheSeal?: TheReminderInAReply }).beforeTheSeal
      if (reminder === undefined) throw new Error(`the first sealing write gave no reminder: ${first.body.slice(0, 600)}`)
      expect(reminder.sealed).toBe(false)
      expect(reminder.refuses).toContainEqual({ key, rule: theRuleOf(key) })
      const item = reminder.items.find((one) => one.key === key)
      if (item === undefined) throw new Error(`the reminder named no item ${key}: ${JSON.stringify(reminder.items.map((one) => one.key))}`)
      expect(item.mechanical).toBe(true)
      const stopped = await theStopped()
      await aLaterWriteIsRefused(run, item, report)
      expect(await theStopped()).toEqual(oneStoppedMore(stopped))
      aLabelFor(report)
      await itSeals(run)
    } finally {
      backToTheDefaultPosition()
    }
  })

  it('5: at remind a migration item refuses the hard gate with 409 and counts one stopped write', async () => {
    const run = await aRun('Synthetic run over a bare prefix at remind', { commit: 'migration' })
    // THE REMINDER FIRST, which at remind refuses nothing.
    const first = await send(run, theWrite(run))
    expect(first.statusCode, first.body.slice(0, 600)).toBe(200)
    const stopped = await theStopped()
    const refused = await send(run, theWrite(run))
    expect(refused.statusCode, refused.body.slice(0, 800)).toBe(409)
    expect((refused.json() as { error: string }).error).toContain('migration item')
    expect(await theStopped()).toEqual(oneStoppedMore(stopped))
    expect(t.api.getRecord(run.id)!.data['state']).toBe('running')
  })

  it('5: at off the same migration item is refused and counted', async () => {
    atPosition('off')
    try {
      const run = await aRun('Synthetic run over a bare prefix at off', { commit: 'migration' })
      const stopped = await theStopped()
      const refused = await send(run, theWrite(run))
      expect(refused.statusCode, refused.body.slice(0, 800)).toBe(409)
      expect((refused.json() as { error: string }).error).toContain('migration item')
      expect(await theStopped()).toEqual(oneStoppedMore(stopped))
      expect(t.api.getRecord(run.id)!.data['state']).toBe('running')
    } finally {
      backToTheDefaultPosition()
    }
  })

  it('the person seals over a fault of form', async () => {
    const run = await aRun('Synthetic run the person seals with no report')
    await itSeals(run, theWrite(run), AS_THE_PERSON)
  })

  it('the office itself seals over a fault of form', async () => {
    const run = await aRun('Synthetic run the office seals with no report')
    await itSeals(run, { ...theWrite(run), remindBeforeTheSeal: false }, AS_THE_OFFICE_WORKER)
  })
})

describe('the items that never refuse', () => {
  it('6: likely items, a copied value among them, are named and refuse nothing', async () => {
    const run = await aRun('Synthetic run whose test copies the code', { commit: 'copies' })
    aReport(run)
    const first = await send(run, theWrite(run))
    expect(first.statusCode, first.body.slice(0, 600)).toBe(200)
    const reminder = (first.json() as { beforeTheSeal: TheReminderInAReply }).beforeTheSeal
    const keys = reminder.items.filter((one) => one.mechanical !== true).map((one) => one.key)
    expect(keys).toContain('copied:tests/made-up.test.ts')
    expect(keys).not.toContain('test:tests/made-up.test.ts')
    expect(reminder.refuses).toEqual([])
    const said = String(t.api.getRecord(reminder.line)!.data['saidInFull'] ?? t.api.getRecord(reminder.line)!.data['body'])
    expect(said).not.toContain('refuses the seal]')
    await itSeals(run)
  })
})

describe('the one list, pure', () => {
  const certain = (key: string, about: ANamedItem['about']): ANamedItem => ({ key, about, says: `A made-up item ${key}.`, mechanical: true })
  /** One certain item of each kind the list names, keyed as the finder keys it. */
  const EVERY_FAULT_OF_FORM: ANamedItem[] = [
    certain('report:none', 'report'),
    certain('report:R1:chaptersRead', 'report'),
    certain('report:R1:chapters', 'report'),
    certain('report:R1:title', 'report'),
    certain('report:R1:copied-title', 'report'),
    certain('report:R1:short-forms', 'report'),
    certain('record:N1:short-forms', 'record'),
    certain('decision:D1:short-forms', 'decision'),
    certain('report:R1:short-forms-out-of-date', 'report'),
    certain('record:N1:short-forms-out-of-date', 'record'),
    certain('decision:D1:short-forms-out-of-date', 'decision'),
    certain('report:R1:incomplete', 'report'),
    certain('record:N1:incomplete', 'record'),
    certain('decision:D1:revisit-when', 'decision'),
    certain('decision:D1:authority-reference', 'decision'),
    certain('run:doing', 'run'),
    certain('run:O1:refusal', 'run'),
    certain('report:R2:about-a-run', 'report'),
    certain('report:R2:about-a-page', 'report'),
  ]
  const A_MIGRATION_ITEM = certain('migration:tests/made-up.test.ts:1:bare-prefix', 'migration')
  const A_SECOND_MIGRATION_ITEM = certain('migration:tests/made-up-two.test.ts:1:bare-prefix', 'migration')
  const NEVER: ANamedItem[] = [
    ...EVERY_FAULT_OF_FORM.map((one) => ({ ...one, mechanical: false })),
    { key: 'copied:tests/made-up.test.ts', about: 'test proof', says: 'A made-up copied value.', mechanical: false },
    { key: 'test:tests/made-up.test.ts', about: 'test proof', says: 'A made-up test proof.', mechanical: false },
    certain('pictures:R1', 'pictures'),
    certain('commit:Synthetic commit B:message', 'commit'),
    certain('design:R1:questions', 'design'),
  ]


  it('7: returns every migration item when the seal seals a branch, and nothing else', () => {
    const all = [...EVERY_FAULT_OF_FORM, A_MIGRATION_ITEM, A_SECOND_MIGRATION_ITEM, ...NEVER]
    expect(theItemsNoSealPasses(all, { branch: true })).toEqual([A_MIGRATION_ITEM, A_SECOND_MIGRATION_ITEM])
    expect(theItemsNoSealPasses(all, { branch: false })).toEqual([])
    expect(theItemsNoSealPasses([...EVERY_FAULT_OF_FORM, ...NEVER], { branch: true })).toEqual([])
    expect(theItemsNoSealPasses(null, { branch: true })).toEqual([])
  })
})
