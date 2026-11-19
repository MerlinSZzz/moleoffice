// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LINE THAT TELLS A CALLER WHAT TO SEND SHOWS THE BODY, WITH EACH FIELD IN ITS PLACE, AND THAT BODY IS TAKEN.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Refusals and reminders named a field and not where it goes. A report's chapters read, a run's submission, a
 * revision's seq and contentHash and a merge of data were each named, and callers sent them at the top of the body,
 * in the wrong object, or under the wrong key. The example under dataPatch, {"summary":…}, set a key of data called
 * summary and left the record's own summary as it was.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * Each case makes the office say its line, reads the write out of the line, fills each place in the body with a
 * real value, sends it to the door the line names, and sees it taken. Nothing in the body is typed here.
 *   - the seal: an empty records list, records and mixed; a run on another computer; and a kind that is none of the
 *     four, which shows the field and the value sent;
 *   - the reminders before the seal: a report with no chaptersRead, a report that misses a chapter, and the merge
 *     queue's line about a report with no chapters read;
 *   - the record door: the refusal of a dataPatch that is not an object, and the note about short forms nobody wrote.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF, after a green control
 * ---------------------------------------------------------------------------------------
 *
 * Each of these, one at a time, turns its case red:
 *   1. In `captureRecords` (src/server/lib/sealed-tip.ts), show `aSubmissionOfRecords('records')` whatever kind was
 *      sent. The mixed case is sealed as records.
 *   2. In `whyARunElsewhereIsNotSealedHere`, put the submission at the top of the body instead of in dataPatch.
 *   3. In `sealFinishedRun`, go back to "A submission must name git, records, mixed or files.".
 *   4. In `theWriteOfTheChaptersRead` (src/server/lib/before-the-seal-rules.ts), write the field outside dataPatch.
 *   5. In the dataPatch error (src/server/api/records.ts), go back to the example {"summary":"recalibrated"}.
 *   6. In `shortFormsStillToWrite`, leave `body` out of the note.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { whatAReportSaysItRead } from '../src/shared/chapters.ts'
import { PARTS_KEY } from '../src/shared/zoom.ts'
import type { TheFactsBeforeTheSeal } from '../src/server/lib/before-the-seal-rules.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let t: TestDb
let app: FastifyInstance
let rules: typeof import('../src/server/lib/before-the-seal-rules.ts')
const WORKER = 'a-worker-told-a-body'
const STARTER = 'its-starter'
const THE_MAC = 'the-mac'
/** A synthetic address in the range set aside for tests of a shared network, named the-mac in the owner's table. */
const THE_MACS_ADDRESS = [100, 101, 0, 19].join('.')
const actor = { type: 'agent' as const, id: WORKER }
const AS_THE_WORKER = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': WORKER }
const AS_THE_OWNER = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const directories: string[] = []

/** Text put in a place as it stands, for a place that holds more than one value, like the items of a list. */
const asWritten = (text: string) => ({ asWritten: text })

/** Every object written in a line, outermost only, in the order they appear. A string's braces are not counted. */
function theBodiesIn(line: string): string[] {
  const bodies: string[] = []
  let depth = 0
  let quoted = false
  let from = -1
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"' && depth > 0 && line[i - 1] !== '\\') quoted = !quoted
    else if (!quoted && c === '{' && depth++ === 0) from = i
    else if (!quoted && c === '}' && depth > 0 && --depth === 0) bodies.push(line.slice(from, i + 1))
  }
  return bodies
}

/** The write a line shows: the path after the method, and the first body after the path. */
function theWriteIn(line: string, method: string): { path: string; body: string } {
  const at = line.indexOf(`${method} /api/`)
  if (at < 0) throw new Error(`The line shows no ${method} write: ${line}`)
  const rest = line.slice(at + method.length + 1)
  const path = rest.slice(0, rest.indexOf(' '))
  const body = theBodiesIn(rest.slice(path.length))[0]
  if (body === undefined) throw new Error(`The line shows ${method} ${path} with no body: ${line}`)
  return { path, body }
}

/**
 * THE BODY WITH EACH PLACE FILLED, in the order the places appear: a quoted `"<…>"` or `"…"`, a bare `<…>`, or a bare
 * `…`, `[…]` or `{…}`. A body with more places or fewer than the values given is a failure, so a line that gains or
 * loses a place shows here.
 */
function filled(body: string, values: unknown[]): Record<string, unknown> {
  let n = 0
  const text = body.replace(/"<[^"<>]*>"|"…"|\[…\]|\{…\}|<[^"<>]*>|…/gu, () => {
    const value = values[n++]
    return typeof value === 'object' && value !== null && 'asWritten' in value ? String(value.asWritten) : JSON.stringify(value)
  })
  expect(n, `the body has ${String(n)} places to fill and ${String(values.length)} values were given: ${body}`).toBe(values.length)
  return JSON.parse(text) as Record<string, unknown>
}

async function send(method: 'PATCH' | 'POST', url: string, headers: Record<string, string>, payload: unknown) {
  const res = await app.inject({ method, url, headers, payload: payload as Record<string, unknown> })
  return { status: res.statusCode, reply: res.json() as Record<string, unknown>, body: res.body }
}

/** A running run of the worker, filed as its launcher files one. */
function aRun(data: Record<string, unknown> = {}): string {
  return t.api.createRecord({
    kind: 'session',
    title: 'Synthetic run told a body',
    workspaceId: 'default',
    actor,
    origin: 'fixture',
    data: { state: 'running', servingAgent: WORKER, cutFrom: 'main', ...data },
  }).id
}

/** A note the run wrote, which a records submission can name. */
function aNoteOf(run: string): string {
  return t.api.createRecord({ kind: 'note', title: 'Synthetic note of the run', workspaceId: 'default', actor: { ...actor, sessionId: run }, origin: 'fixture', data: {} }).id
}

/** A repository whose work branch holds one commit in the worker's work area. */
function aTree(): string {
  const git = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
  mkdirSync('.logs', { recursive: true })
  const dir = mkdtempSync(join(process.cwd(), '.logs', 'body-fixture-'))
  directories.push(dir)
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic body fixture')
  mkdirSync(join(dir, 'work'), { recursive: true })
  writeFileSync(join(dir, 'work', 'a.txt'), 'before\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic baseline')
  git(dir, 'switch', '-q', '-c', 'work')
  writeFileSync(join(dir, 'work', 'a.txt'), 'submitted\n')
  git(dir, 'commit', '-q', '-am', 'Synthetic submission')
  return dir
}

/** The refusal of a finish, which must leave the run running. */
async function theFinishRefused(run: string, dataPatch: Record<string, unknown>): Promise<string> {
  const refused = await send('PATCH', `/api/records/${run}`, AS_THE_WORKER, { dataPatch })
  expect(refused.status, refused.body).toBe(409)
  expect(t.api.getRecord(run)?.data['state'], 'the refused finish was written').toBe('running')
  return String(refused.reply['error'])
}

/** The write a refusal of a finish shows, sent with each place filled, which must finish the run. */
async function theShownWriteFinishes(run: string, refusal: string, values: unknown[]) {
  const write = theWriteIn(refusal, 'PATCH')
  expect(write.path).toBe(`/api/records/${run}`)
  const finished = await send('PATCH', write.path, AS_THE_WORKER, filled(write.body, values))
  expect(finished.status, finished.body).toBe(200)
  expect(t.api.getRecord(run)?.data['state']).toBe('finished')
}

const facts = (over: Partial<TheFactsBeforeTheSeal>): TheFactsBeforeTheSeal => ({
  runTitle: 'Synthetic round',
  testRuns: [],
  git: { commits: [], existedAtTheForkBase: () => false },
  reports: [],
  sameTitleElsewhere: {},
  mustRead: [1, 9],
  checkAlso: [],
  ...over,
})

/** A report filed with its blocks, as the run's report is, and its record as the reminders read it. */
function aReport(data: Record<string, unknown>): TheFactsBeforeTheSeal['reports'][number] {
  const made = t.api.createRecord({
    kind: 'report',
    title: 'Synthetic report of a round',
    workspaceId: 'default',
    actor,
    origin: 'fixture',
    data: { blocks: [{ id: 'b-1', type: 'text', text: 'Synthetic: the round changed one line.' }], ...data },
  })
  return { id: made.id, title: made.title, data: made.data }
}

/** The write a reminder shows, sent to the report with the chapters filled, and what the stored report then lists. */
async function theChaptersAfterTheShownWrite(line: string, report: string, chapters: number[]): Promise<number[] | null> {
  const write = theWriteIn(line, 'PATCH')
  expect(write.path).toBe(`/api/records/${report}`)
  const wrote = await send('PATCH', write.path, AS_THE_WORKER, filled(write.body, [asWritten(chapters.join(', '))]))
  expect(wrote.status, wrote.body).toBe(200)
  return whatAReportSaysItRead({ data: t.api.getRecord(report)!.data })
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  rules = await import('../src/server/lib/before-the-seal-rules.ts')
  const starter = await send('POST', '/api/agents/started', AS_THE_OWNER, { handle: STARTER, name: 'Synthetic starter' })
  expect(starter.status, starter.body).toBe(201)
  const worker = await send('POST', '/api/agents/started', { ...AS_THE_WORKER, 'x-mole-office-actor-id': STARTER }, { handle: WORKER, name: 'Synthetic worker', workArea: ['work'] })
  expect(worker.status, worker.body).toBe(201)
  const named = t.client.sqlite.prepare('UPDATE installation SET machine_names = ? WHERE only_row = 1').run(JSON.stringify({ [THE_MACS_ADDRESS]: THE_MAC }))
  expect(named.changes, 'the test office has no installation row to name a machine on').toBe(1)
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const dir of directories) rmSync(dir, { recursive: true, force: true })
})

describe('the seal', () => {
  it('shows a records submission with no records the write that finishes it', async () => {
    const run = aRun()
    const refusal = await theFinishRefused(run, { state: 'finished', submission: { kind: 'records', records: [] } })
    await theShownWriteFinishes(run, refusal, [aNoteOf(run)])
  })

  it('shows a mixed submission with no records a mixed write, which seals the code as well', async () => {
    const run = aRun({ workingDirectory: aTree() })
    const refusal = await theFinishRefused(run, { state: 'finished', submission: { kind: 'mixed', records: [] } })
    await theShownWriteFinishes(run, refusal, [aNoteOf(run)])
    const { readRunSeal } = await import('../src/server/lib/sealed-tip.ts')
    const seal = readRunSeal(run)?.seal
    expect(seal?.kind, 'a mixed run that took the write it was shown was sealed as something else').toBe('mixed')
    expect(seal?.git?.commit).toMatch(/^[0-9a-f]{40}$/u)
  })

  it('shows a run on another computer the records write that finishes it', async () => {
    const run = aRun({ machine: THE_MAC })
    const refusal = await theFinishRefused(run, { state: 'finished' })
    expect(refusal).toContain(THE_MAC)
    await theShownWriteFinishes(run, refusal, [aNoteOf(run)])
  })

  it('names the field and the value sent when the kind is none of the four, and seals nothing', async () => {
    const run = aRun()
    const refusal = await theFinishRefused(run, { state: 'finished', submission: { kind: 'record', records: [aNoteOf(run)] } })
    expect(refusal).toContain('data.submission.kind')
    expect(refusal).toContain(JSON.stringify('record'))
    const { readRunSeal } = await import('../src/server/lib/sealed-tip.ts')
    expect(readRunSeal(run), 'a refused finish left a seal').toBeNull()
  })
})

describe('the reminders before the seal', () => {
  it('shows a report with no chaptersRead the write that gives it the list', async () => {
    const report = aReport({})
    const said = rules.whatAnInspectorWouldMostLikelyRefuse(facts({ reports: [report] })).items.find((one) => one.key === `report:${report.id}:chaptersRead`)
    expect(said, 'no reminder about the missing chaptersRead').toBeDefined()
    expect(await theChaptersAfterTheShownWrite(said!.says, report.id, [1, 9])).toEqual([1, 9])
  })

  it('shows a report that misses a chapter the write that replaces its list', async () => {
    const report = aReport({ chaptersRead: [1] })
    const said = rules.whatAnInspectorWouldMostLikelyRefuse(facts({ reports: [report] })).items.find((one) => one.key.startsWith(`report:${report.id}:`))
    expect(said?.says, 'no reminder about the missed chapter').toContain('does not list chapter 9')
    expect(await theChaptersAfterTheShownWrite(said!.says, report.id, [1, 9])).toEqual([1, 9])
    const after = { ...report, data: t.api.getRecord(report.id)!.data }
    expect(rules.whatAnInspectorWouldMostLikelyRefuse(facts({ reports: [after] })).items.filter((one) => one.key.startsWith(`report:${report.id}:`))).toEqual([])
  })

  it("shows the merge queue's line about a report with no chapters read the write for that report", async () => {
    const report = aReport({})
    const line = rules.whatTheReportLacks({ ...facts({ reports: [report] }), doing: 'Synthetic doing line' }).lacks.find((one) => one.startsWith('No linked report lists the chapters read.'))
    expect(line, 'no line about the chapters read').toBeDefined()
    expect(await theChaptersAfterTheShownWrite(line!, report.id, [1, 9])).toEqual([1, 9])
  })
})

describe('the record door', () => {
  it('shows a dataPatch that is not an object the merge write, and where the title and the summary go', async () => {
    const note = aNoteOf(aRun())
    const refused = await send('PATCH', `/api/records/${note}`, AS_THE_WORKER, { dataPatch: 'body: the first words' })
    expect(refused.status, refused.body).toBe(400)
    const refusal = JSON.stringify(refused.reply)
    const error = String(refused.reply['error'] ?? refusal)
    const write = theWriteIn(error, 'PATCH')
    const merged = await send('PATCH', write.path.replace(/<[^<>]*>/u, note), AS_THE_WORKER, filled(write.body, ['body', 'Synthetic: the first words of the note.']))
    expect(merged.status, merged.body).toBe(200)
    expect(t.api.getRecord(note)?.data['body']).toBe('Synthetic: the first words of the note.')

    const beside = theBodiesIn(error).at(-1)!
    const summary = 'Synthetic: a note whose title and summary were written beside a merge of its data, in the one write the refusal showed.'
    const both = await send('PATCH', `/api/records/${note}`, AS_THE_WORKER, filled(beside, ['Synthetic note, renamed', summary, { body: 'Synthetic: the second words of the note.' }]))
    expect(both.status, both.body).toBe(200)
    const stored = t.api.getRecord(note)!
    expect([stored.title, stored.summary, stored.data['body'], stored.data['summary']]).toEqual(['Synthetic note, renamed', summary, 'Synthetic: the second words of the note.', undefined])
  })

  it('shows a report with no short forms the body that writes them, which is taken', async () => {
    const text = Array.from({ length: 15 }, (_, i) => `Synthetic sentence ${String(i + 1)} says the round changed one line of the record door.`).join(' ')
    const filed = await send('POST', '/api/records', AS_THE_WORKER, {
      kind: 'report',
      title: 'Synthetic report without its short forms',
      data: { blocks: [{ id: 'b-1', type: 'text', text }] },
    })
    expect(filed.status, filed.body).toBe(201)
    const report = (filed.reply['record'] as { id: string }).id
    const owed = filed.reply['shortForms'] as { missing: { level: string; words: { min: number } }[]; note: string }
    const write = theWriteIn(owed.note, 'POST')
    expect(write.path).toBe(`/api/records/${report}/short-forms`)
    const revisions = await app.inject({ method: 'GET', url: `/api/records/${report}/revisions`, headers: AS_THE_WORKER })
    const newest = (revisions.json() as { revisions: { seq: number; contentHash: string }[] }).revisions[0]!
    const part = { id: 'p-1', heading: 'One line of the door changed', text30: 'Synthetic: one line changed.', text120: 'Synthetic: one line of the record door changed.', covers: ['b-1'] }
    const label = (n: number) => 'Synthetic change to one line of the record door'.split(' ').slice(0, Math.max(1, n)).join(' ')
    const forms = owed.missing.map((one) => (one.level === PARTS_KEY ? [part] : label(one.words.min)))
    const wrote = await send('POST', write.path, AS_THE_WORKER, filled(write.body, [newest.seq, newest.contentHash, ...forms]))
    expect(wrote.status, wrote.body).toBe(200)
    const stored = t.api.getRecord(report)!.data['shortForms'] as Record<string, unknown>
    expect(owed.missing.map((one) => one.level).filter((level) => stored[level] === undefined), 'a length the note asked for was not stored').toEqual([])
  })
})
