// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OWNER'S WRITTEN WORDS WRITE AND MARK A CHAPTER. Wave 13s, round 84. Three doors of the office regulations
 * were the person's alone, or a secretary's under the person's grant: setting a chapter, restoring one, and marking
 * one rule as only for this office. Since a later decision, a secretary carrying the owner's
 * written words for the one act may do each too, whatever this office's list of what the grant carries says. The
 * person still does each as before, and the grant still carries each where the list says may-press.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. Two secretaries, one
 * raised and one not, a secretary that sends no key, and a worker are made-up agents. Every chapter, every record
 * and the owner's words are made up. This office's answers are set with `setThisOfficesAnswer`, the function the
 * door for that list calls.
 *
 * FOR EACH DOOR, THROUGH ITS ROUTE:
 *   1. a secretary with no words and no grant, with this office's row at may-press, hears the door's old refusal,
 *      and nothing is written;
 *   2. a secretary with the owner's words naming this act, with the row at kept, passes, and the chapter record's
 *      newest revision names the secretary and keeps the words, never the person;
 *   3. words for another chapter, another version, another restore source, another rule or the other value of
 *      `only` are refused, and nothing is written;
 *   4. a worker carrying the right words is refused in the door's old words, and nothing is written;
 *   5. a secretary holding the grant, with the row at may-press and no words, passes as it did before, and the
 *      revision names the secretary and the grant;
 *   6. a secretary carrying the right words but not using its own key is refused in the door's old words, because
 *      only a secretary that uses its own key may carry the owner's words.
 *
 * MUTATIONS, each alone after a control run, each a run of this file, then restored, 23 October 2026:
 *   1. `aSecretaryWithItsOwnKey` taken out of the set-chapter door: case 6 of the set-chapter door goes red.
 *   2. `n` taken out of the set-chapter act string: case 2 of the set-chapter door goes red, because the owner's
 *      words for the right chapter no longer name the string the door builds.
 *   3. the words clause taken out of `markARuleOnlyForThisOffice`'s guard: case 2 of the marking door goes red.
 *   4. `from` taken out of the restore act string: case 2 of the restore door goes red, because the owner's words for
 *      the right source no longer name the string the door builds.
 */

import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import type { AChaptersHistory, ChapterContent, SelectedChapter, TheSelectedChapters } from '../src/shared/chapter-edit.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { AnAnswerAboutADoor } from '../src/shared/what-the-grant-carries.ts'
import { apiApp, FOR_THE_PERSON, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const RAISED = 'chapter-grant-secretary'
const UNRAISED = 'chapter-plain-secretary'
const KEYLESS = 'chapter-keyless-secretary'
const WORKER = 'chapter-worker'
const THE_WORDS = 'Made-up words: make this one change to the chapter for me.'
const THE_ACT_REFUSAL = "is the person's own act"

let t: TestDb
let app: FastifyInstance
let chapterRecord = ''
let grantId = ''
let setThisOfficesAnswer: (door: string, answer: AnAnswerAboutADoor | 'default', who: never) => unknown
const PERSON: Record<string, string> = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const keys = new Map<string, string>()
const answered = new Set<string>()

const as = (handle: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})

/** A secretary's request that names it and carries no key of its own. */
const withoutItsKey = (handle: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

interface AReply {
  status: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any
  error: string
  raw: string
}

async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<AReply> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {}
  try {
    body = reply.json()
  } catch {
    body = {}
  }
  return { status: reply.statusCode, body, error: typeof body?.error === 'string' ? body.error : '', raw: reply.body }
}

/** This office's answer about one door, as the person gives it, taken back after each case. */
function answer(door: string, said: AnAnswerAboutADoor): void {
  setThisOfficesAnswer(door, said, { type: 'human', id: THE_PERSON } as never)
  answered.add(door)
}

/** Every record, revision and change row, so a refused door can be held to writing nothing at all. */
function snapshot(): string {
  return JSON.stringify(['records', 'revisions', 'changes'].map(table => t.client.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()))
}

interface ARevisionRow {
  seq: number
  actor_type: string
  actor_id: string
  warrant: string | null
  elevation: string | null
}

/** The newest revision of one record, as the ledgers hold it. */
function newestRevision(id: string): ARevisionRow {
  return t.client.sqlite.prepare('SELECT seq, actor_type, actor_id, warrant, elevation FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1').get(id) as ARevisionRow
}

const content = (): ChapterContent => ({
  label: 'Made up chapter',
  title: 'Rules for the made up office',
  conclusion: 'Read these made up rules before this test works.',
  zh: { label: '测试规章', title: '测试办公室的规章', conclusion: '测试工作之前读这些规章。' },
  rules: Array.from({ length: 8 }, (_, i) => ({
    id: `r-${String(i + 1)}`,
    heading: `Made up rule ${String(i + 1)}`,
    text: `Made up words for rule ${String(i + 1)}.`,
    zh: { heading: `测试条文 ${String(i + 1)}`, text: `测试条文 ${String(i + 1)} 的文字。` },
  })),
})

async function theChapter(): Promise<SelectedChapter> {
  const read = await call('GET', '/api/office-regulations/chapters', PERSON)
  expect(read.status, read.raw).toBe(200)
  return (read.body as TheSelectedChapters).chapters.find(chapter => chapter.n === 7)!
}

async function theHistory(): Promise<AChaptersHistory> {
  const read = await call('GET', '/api/office-regulations/chapters/7/history', PERSON)
  expect(read.status, read.raw).toBe(200)
  return read.body as AChaptersHistory
}

/** A revision that holds a whole chapter and is not the chapter in use, so a restore really changes it. */
async function anOlderChapterRevision(): Promise<number> {
  const held = await theChapter()
  const whole = (await theHistory()).versions.filter(version => version.after.rules.length > 0)
  const different = whole.find(version => JSON.stringify(version.after) !== JSON.stringify(held.chapter))
  return (different ?? whole[0]!).seq
}

/** The owner's written words for one act, as a secretary carries them. */
function theOwnersWords(act: string): Record<string, unknown> {
  return { saidBy: THE_PERSON, words: THE_WORDS, where: 'terminal', when: '2026-10-22 10:00', for: [act] }
}

const setAct = (n: number, version: string | null): string => `office.rules.set-chapter:${JSON.stringify({ n, version })}`
const restoreAct = (n: number, version: string | null, from: 'shipped' | number): string => `office.rules.restore-chapter:${JSON.stringify({ n, version, from })}`
const markAct = (chapter: string, rule: string, only: boolean): string => `office.rules.mark-only-this-office:${JSON.stringify({ chapter, rule, only })}`

async function applyAsThePerson(chapter: ChapterContent): Promise<void> {
  const held = await theChapter()
  const done = await call('POST', '/api/office-regulations/chapters', PERSON, { n: 7, version: held.version, because: 'A made-up chapter edit by the person.', chapter })
  expect(done.status, done.raw).toBe(200)
}

/** A refused door wrote nothing, in any table this office keeps. */
async function refusedAndNothingWritten(request: () => Promise<AReply>, status: number, words: string): Promise<AReply> {
  const before = snapshot()
  const refused = await request()
  expect(refused.status, refused.raw).toBe(status)
  expect(refused.error).toContain(words)
  expect(snapshot(), 'a refused door wrote something').toBe(before)
  return refused
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  t = await freshDb()
  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  setThisOfficesAnswer = (await import('../src/server/lib/what-the-grant-carries.ts')).setThisOfficesAnswer as never
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  for (const [handle, role] of [[RAISED, 'secretary'], [UNRAISED, 'secretary'], [KEYLESS, 'secretary'], [WORKER, 'worker']] as const) {
    const started = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, role })
    expect(started.status, started.raw).toBe(201)
    keys.set(handle, String(started.body.whatToGiveIt?.key ?? ''))
  }
  const raised = await call('POST', `/api/roles/elevation/${RAISED}`, PERSON, { reason: 'A made-up raise for this test.' })
  expect(raised.status, raised.raw).toBe(201)
  grantId = String(raised.body.elevation?.id ?? '')
  expect(grantId).not.toBe('')

  // TWO REVISIONS THE RESTORE DOOR CAN READ: the shipped-shaped chapter, and the person's later change to it.
  await applyAsThePerson(content())
  chapterRecord = String((await theChapter()).record)
  const later = content()
  later.rules[7]!.text = 'The person changed this made-up rule later.'
  await applyAsThePerson(later)
}, 60_000)

afterEach(() => {
  for (const door of answered) setThisOfficesAnswer(door, 'default', { type: 'human', id: THE_PERSON } as never)
  answered.clear()
})

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('the owner’s words write a chapter', () => {
  it('1: a secretary with no words and no grant hears the old refusal, and nothing is written', async () => {
    answer('office.rules.set-chapter', 'may-press')
    answer('record:regulation', 'may-press')
    const held = await theChapter()
    const next = content()
    next.rules[7]!.text = 'Never written by a secretary with no words.'
    await refusedAndNothingWritten(
      () => call('POST', '/api/office-regulations/chapters', as(UNRAISED), { n: 7, version: held.version, because: 'A made-up edit with no words.', chapter: next }),
      403,
      THE_ACT_REFUSAL,
    )
  })

  it('2: words naming this act pass with the row at kept, and the revision names the secretary and keeps the words', async () => {
    answer('office.rules.set-chapter', 'kept')
    const held = await theChapter()
    const next = content()
    next.rules[7]!.text = 'The made-up office reads this rule on the owner’s words.'
    const act = setAct(7, held.version)
    const done = await call('POST', '/api/office-regulations/chapters', as(UNRAISED), {
      n: 7, version: held.version, because: 'A made-up edit on the owner’s words.', chapter: next, warrant: theOwnersWords(act),
    })
    expect(done.status, done.raw).toBe(200)
    expect((await theChapter()).chapter!.rules[7]!.text).toBe(next.rules[7]!.text)
    const revision = newestRevision(chapterRecord)
    expect(revision).toMatchObject({ actor_type: 'agent', actor_id: UNRAISED, elevation: null })
    expect(JSON.parse(revision.warrant!)).toMatchObject({ saidBy: THE_PERSON, words: THE_WORDS, for: [act] })
  })

  it('3: words for another chapter or another version are refused, and nothing is written', async () => {
    answer('office.rules.set-chapter', 'kept')
    const held = await theChapter()
    const next = content()
    next.rules[7]!.text = 'Never written on words for another act.'
    for (const act of [setAct(6, held.version), setAct(7, 'a-made-up-version-never-read')]) {
      const refused = await refusedAndNothingWritten(
        () => call('POST', '/api/office-regulations/chapters', as(UNRAISED), { n: 7, version: held.version, because: 'A made-up wrong-act edit.', chapter: next, warrant: theOwnersWords(act) }),
        403,
        'Nothing was written.',
      )
      expect(refused.body.code, refused.raw).toBe('chapterEditRefused')
    }
  })

  it('4: a worker carrying the right words hears the old refusal, and nothing is written', async () => {
    answer('office.rules.set-chapter', 'kept')
    const held = await theChapter()
    const next = content()
    next.rules[7]!.text = 'Never written by a worker.'
    await refusedAndNothingWritten(
      () => call('POST', '/api/office-regulations/chapters', as(WORKER), { n: 7, version: held.version, because: 'A made-up worker edit.', chapter: next, warrant: theOwnersWords(setAct(7, held.version)) }),
      403,
      THE_ACT_REFUSAL,
    )
  })

  it('5: the grant presses the door with no words where the list says may-press, as before', async () => {
    answer('office.rules.set-chapter', 'may-press')
    answer('record:regulation', 'may-press')
    const held = await theChapter()
    const next = content()
    next.rules[7]!.text = 'The made-up office reads this rule under the grant.'
    const done = await call('POST', '/api/office-regulations/chapters', as(RAISED), { n: 7, version: held.version, because: 'A made-up edit under the grant.', chapter: next, ...FOR_THE_PERSON })
    expect(done.status, done.raw).toBe(200)
    const revision = newestRevision(chapterRecord)
    expect(revision).toMatchObject({ actor_type: 'agent', actor_id: RAISED, warrant: null })
    expect(JSON.parse(revision.elevation!)).toMatchObject({ id: grantId })
  })

  it('6: a secretary carrying the right words but not its own key hears the old refusal, and nothing is written', async () => {
    answer('office.rules.set-chapter', 'kept')
    const held = await theChapter()
    const next = content()
    next.rules[7]!.text = 'Never written without the secretary’s own key.'
    await refusedAndNothingWritten(
      () => call('POST', '/api/office-regulations/chapters', withoutItsKey(KEYLESS), { n: 7, version: held.version, because: 'A made-up keyless edit.', chapter: next, warrant: theOwnersWords(setAct(7, held.version)) }),
      403,
      THE_ACT_REFUSAL,
    )
  })
})

describe('the owner’s words restore a chapter', () => {
  it('1: a secretary with no words and no grant hears the old refusal, and nothing is written', async () => {
    answer('office.rules.restore-chapter', 'may-press')
    answer('record:regulation', 'may-press')
    const held = await theChapter()
    const from = await anOlderChapterRevision()
    await refusedAndNothingWritten(
      () => call('POST', '/api/office-regulations/chapters/restore', as(UNRAISED), { n: 7, version: held.version, because: 'A made-up restore with no words.', from }),
      403,
      THE_ACT_REFUSAL,
    )
  })

  it('2: words naming this act pass with the row at kept, and the revision names the secretary and keeps the words', async () => {
    answer('office.rules.restore-chapter', 'kept')
    const held = await theChapter()
    const from = await anOlderChapterRevision()
    const act = restoreAct(7, held.version, from)
    const done = await call('POST', '/api/office-regulations/chapters/restore', as(UNRAISED), {
      n: 7, version: held.version, because: 'A made-up restore on the owner’s words.', from, warrant: theOwnersWords(act),
    })
    expect(done.status, done.raw).toBe(200)
    const revision = newestRevision(chapterRecord)
    expect(revision).toMatchObject({ actor_type: 'agent', actor_id: UNRAISED, elevation: null })
    expect(JSON.parse(revision.warrant!)).toMatchObject({ saidBy: THE_PERSON, words: THE_WORDS, for: [act] })
  })

  it('3: words for another restore source or another version are refused, and nothing is written', async () => {
    answer('office.rules.restore-chapter', 'kept')
    const held = await theChapter()
    const from = await anOlderChapterRevision()
    const other = typeof from === 'number' ? from + 1 : 'shipped'
    for (const act of [restoreAct(7, held.version, 'shipped'), restoreAct(7, held.version, other), restoreAct(7, 'a-made-up-version-never-read', from)]) {
      await refusedAndNothingWritten(
        () => call('POST', '/api/office-regulations/chapters/restore', as(UNRAISED), { n: 7, version: held.version, because: 'A made-up wrong-act restore.', from, warrant: theOwnersWords(act) }),
        403,
        'Nothing was written.',
      )
    }
  })

  it('4: a worker carrying the right words hears the old refusal, and nothing is written', async () => {
    answer('office.rules.restore-chapter', 'kept')
    const held = await theChapter()
    const from = await anOlderChapterRevision()
    await refusedAndNothingWritten(
      () => call('POST', '/api/office-regulations/chapters/restore', as(WORKER), { n: 7, version: held.version, because: 'A made-up worker restore.', from, warrant: theOwnersWords(restoreAct(7, held.version, from)) }),
      403,
      THE_ACT_REFUSAL,
    )
  })

  it('5: the grant presses the door with no words where the list says may-press, as before', async () => {
    answer('office.rules.restore-chapter', 'may-press')
    answer('record:regulation', 'may-press')
    const held = await theChapter()
    const from = await anOlderChapterRevision()
    const done = await call('POST', '/api/office-regulations/chapters/restore', as(RAISED), { n: 7, version: held.version, because: 'A made-up restore under the grant.', from, ...FOR_THE_PERSON })
    expect(done.status, done.raw).toBe(200)
    const revision = newestRevision(chapterRecord)
    expect(revision).toMatchObject({ actor_type: 'agent', actor_id: RAISED, warrant: null })
    expect(JSON.parse(revision.elevation!)).toMatchObject({ id: grantId })
  })

  it('6: a secretary carrying the right words but not its own key hears the old refusal, and nothing is written', async () => {
    answer('office.rules.restore-chapter', 'kept')
    const held = await theChapter()
    const from = await anOlderChapterRevision()
    await refusedAndNothingWritten(
      () => call('POST', '/api/office-regulations/chapters/restore', withoutItsKey(KEYLESS), { n: 7, version: held.version, because: 'A made-up keyless restore.', from, warrant: theOwnersWords(restoreAct(7, held.version, from)) }),
      403,
      THE_ACT_REFUSAL,
    )
  })
})

describe('the owner’s words mark a rule only for this office', () => {
  it('1: a secretary with no words and no grant hears the old refusal, and nothing is written', async () => {
    answer('office.rules.mark-only-this-office', 'may-press')
    await refusedAndNothingWritten(
      () => call('POST', '/api/office-regulations/only-this-office', as(UNRAISED), { chapter: chapterRecord, rule: 'r-1', only: true }),
      403,
      THE_ACT_REFUSAL,
    )
  })

  it('2: words naming this mark pass with the row at kept, and the revision names the secretary and keeps the words', async () => {
    answer('office.rules.mark-only-this-office', 'kept')
    const act = markAct(chapterRecord, 'r-1', true)
    const done = await call('POST', '/api/office-regulations/only-this-office', as(UNRAISED), {
      chapter: chapterRecord, rule: 'r-1', only: true, warrant: theOwnersWords(act),
    })
    expect(done.status, done.raw).toBe(200)
    expect(done.body).toMatchObject({ chapter: chapterRecord, rule: 'r-1', onlyThisOffice: true, changed: true })
    expect(t.api.getRecord(chapterRecord)!.data['onlyThisOffice']).toEqual(expect.arrayContaining([expect.objectContaining({ rule: 'r-1', by: UNRAISED })]))
    const revision = newestRevision(chapterRecord)
    expect(revision).toMatchObject({ actor_type: 'agent', actor_id: UNRAISED, elevation: null })
    expect(JSON.parse(revision.warrant!)).toMatchObject({ saidBy: THE_PERSON, words: THE_WORDS, for: [act] })
  })

  it('3: words for another rule or the other value of only are refused, and nothing is written', async () => {
    answer('office.rules.mark-only-this-office', 'kept')
    for (const [rule, only, act] of [['r-2', true, markAct(chapterRecord, 'r-3', true)], ['r-4', true, markAct(chapterRecord, 'r-4', false)]] as const) {
      await refusedAndNothingWritten(
        () => call('POST', '/api/office-regulations/only-this-office', as(UNRAISED), { chapter: chapterRecord, rule, only, warrant: theOwnersWords(act) }),
        403,
        'Nothing was written.',
      )
    }
  })

  it('4: a worker carrying the right words hears the old refusal, and nothing is written', async () => {
    answer('office.rules.mark-only-this-office', 'kept')
    await refusedAndNothingWritten(
      () => call('POST', '/api/office-regulations/only-this-office', as(WORKER), { chapter: chapterRecord, rule: 'r-5', only: true, warrant: theOwnersWords(markAct(chapterRecord, 'r-5', true)) }),
      403,
      THE_ACT_REFUSAL,
    )
  })

  it('5: the grant presses the door with no words where the list says may-press, as before', async () => {
    answer('office.rules.mark-only-this-office', 'may-press')
    const done = await call('POST', '/api/office-regulations/only-this-office', as(RAISED), { chapter: chapterRecord, rule: 'r-2', only: true, ...FOR_THE_PERSON })
    expect(done.status, done.raw).toBe(200)
    expect(t.api.getRecord(chapterRecord)!.data['onlyThisOffice']).toEqual(expect.arrayContaining([expect.objectContaining({ rule: 'r-2', by: RAISED })]))
    const revision = newestRevision(chapterRecord)
    expect(revision).toMatchObject({ actor_type: 'agent', actor_id: RAISED, warrant: null })
    expect(JSON.parse(revision.elevation!)).toMatchObject({ id: grantId })
  })

  it('6: a secretary carrying the right words but not its own key hears the old refusal, and nothing is written', async () => {
    answer('office.rules.mark-only-this-office', 'kept')
    await refusedAndNothingWritten(
      () => call('POST', '/api/office-regulations/only-this-office', withoutItsKey(KEYLESS), { chapter: chapterRecord, rule: 'r-6', only: true, warrant: theOwnersWords(markAct(chapterRecord, 'r-6', true)) }),
      403,
      THE_ACT_REFUSAL,
    )
  })
})
