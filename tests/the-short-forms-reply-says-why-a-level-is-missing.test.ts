// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SHORT-FORMS REPLY SAYS WHICH OF THE THREE REASONS A LEVEL HAS NO WORDS.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO PROBLEMS THIS HOLDS
 * ---------------------------------------------------------------------------------------
 *
 * `JAclI-oGvUvh`: the reply reported levels 4, 5 and 6 as "nobody has written one" on kinds that
 * cannot hold them. A task holds no blocks, so a part of one would have nothing to cover.
 *
 * `Cb1WeNip14Lt`: a record too short for levels 4, 5 and 6 was told nobody wrote them, while the
 * card on the drawing said the record was too short and the write door refused the very write the
 * reading invited. The card and the reading were two pieces of logic answering one question.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS FIXED, AND HOW IT IS HELD
 * ---------------------------------------------------------------------------------------
 *
 * `readShortForms` now asks `whyEachLevelIsMissing` in @shared/detail.ts — the same shared call the
 * card makes — and reports the answer it gets:
 *
 *   `noPlace`     this kind of record has no parts to write. `state: "cannot_write"`.
 *   `tooShort`    the record is already that short. `state: "cannot_write"`.
 *   `notWritten`  there is a place and there is room and nobody wrote it. `state: "none"`.
 *
 * `none` keeps its meaning and gets narrower, and `why` carries the shared reason. `cannot_check`
 * is untouched: it is still its own answer about a written form nobody can verify.
 *
 * ---------------------------------------------------------------------------------------
 * IT DRIVES THE REAL DOOR, IN A TEST WORLD
 * ---------------------------------------------------------------------------------------
 *
 * `apiApp()` is `buildApp()` from src/server/index.ts — the product's own server, not a Fastify
 * instance built here. `freshDb()` is a throwaway database made by the product's own migration
 * path. So a green here is a green about what Mole Office serves. `tests/zoom-api.test.ts` carries
 * the note about the twenty tests that were green against a server that registered nothing.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { whyEachLevelIsMissing, type LevelAbsence, type Rung } from '../src/shared/detail.ts'
import { formsWrittenIn } from '../src/shared/reportrungs.ts'
import { detailSourceOf } from '../src/shared/detailsource.ts'
import { SHORT_FORM_LEVELS, BY_PART_LEVELS, countWords } from '../src/shared/zoom.ts'

const HEADERS = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
}

/**
 * THE SIX POSITIONS SOMEBODY CAN WRITE: the three whole-record lengths and the three written by
 * part. The seventh, Full, is the record itself and never an absence.
 */
const WRITABLE: readonly Rung[] = [...SHORT_FORM_LEVELS, ...BY_PART_LEVELS]

/**
 * THE SHARED CLAUSE THE WRITE DOOR REFUSES WITH, word for word. The reply and the refusal have to
 * say this one thing about one fact; a test asserts both carry it.
 */
const TOO_SHORT_CLAUSE = 'A level longer than the record would have to say more than the record does.'

type ReadingRow = {
  rung: Rung
  state: string
  why: LevelAbsence | null
  text: string | null
  says: string
}

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

async function post(url: string, payload: unknown): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'POST', url, payload: payload as object, headers: HEADERS })
  return { status: res.statusCode, body: res.json() }
}

async function get(url: string): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'GET', url, headers: HEADERS })
  return { status: res.statusCode, body: res.json() }
}

/** File one record and hand back its id. */
async function file(record: Record<string, unknown>): Promise<string> {
  const made = await post('/api/records', record)
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return made.body.record.id as string
}

/** One reading, with its rows keyed by rung. */
async function readingOf(recordId: string): Promise<{ note: string; byRung: Map<Rung, ReadingRow> }> {
  const read = await get(`/api/records/${recordId}/short-forms`)
  expect(read.status, JSON.stringify(read.body)).toBe(200)
  const levels = read.body.levels as ReadingRow[]
  return { note: String(read.body.note), byRung: new Map(levels.map((one) => [one.rung, one])) }
}

/** The pair the write door checks, from the record's own ledger. */
async function newestRevision(recordId: string): Promise<{ seq: number; contentHash: string }> {
  const read = await get(`/api/records/${recordId}/revisions`)
  expect(read.status).toBe(200)
  const entry = (read.body.revisions as { seq: number; contentHash: string }[])[0]
  if (entry === undefined) throw new Error(`record ${recordId} has no revisions`)
  return { seq: entry.seq, contentHash: entry.contentHash }
}

/**
 * A TASK: A KIND THAT DECLARES NO BLOCK FIELD.
 *
 * `holds` in @shared/detail.ts needs a body for levels 4 to 6, and a task has none to declare. So
 * the reason is `noPlace`: nobody should write one, which is problem `JAclI-oGvUvh`.
 */
function aTask(): Promise<string> {
  return file({
    kind: 'task',
    title: 'Order the aluminium clamp mount and book the bench jig for an afternoon',
    data: { state: 'todo' },
  })
}

/** A SUMMARY OF EXACTLY FIFTEEN WORDS. The test counts it so the fixture cannot drift. */
const FIFTEEN_WORD_SUMMARY =
  'The wrist camera holds its calibration for one working day, then it drifts slightly again.'

/**
 * A MODULE WITH FIFTEEN WORDS AND NO BLOCKS.
 *
 * A module declares a block field, so it HAS a place for levels 4 to 6; but its own words are the
 * fifteen-word summary, so there is no room for any of them. The reason is `tooShort`, which is
 * problem `Cb1WeNip14Lt`.
 */
function aFifteenWordModule(): Promise<string> {
  return file({
    kind: 'module',
    title: 'The wrist camera holds its calibration for a working day',
    summary: FIFTEEN_WORD_SUMMARY,
    data: { state: 'active' },
  })
}

/**
 * A REPORT LONGER THAN EVERY BUDGET ON THE LADDER, so every position HAS room and the only reason
 * one is absent is that nobody has written it. This is the `none` case, unchanged.
 */
const LONG_BODY = [
  {
    id: 'b-1',
    type: 'text',
    text:
      'Four printed clamp mounts were pulled to failure on the bench jig over two afternoons. Three broke at ' +
      'the thin section behind the bolt circle, at 14.2, 15.1 and 15.4 newtons. The transplant trials need ' +
      'twenty newtons and the margin the rig asks for is another five, so the printed part cannot be used for ' +
      'them at all and the queue for it has been stopped.',
  },
  {
    id: 'b-2',
    type: 'text',
    text:
      'The fourth sample held to 22 newtons. It had been printed at half the layer height, which was a mistake ' +
      'in the print queue rather than a decision anybody made, and nobody has repeated it. One sample is not a ' +
      'finding and it is written down here so that the number is not read as one. An aluminium mount of the ' +
      'same geometry has been ordered and has not reached the bench.',
  },
]

function aReportWithRoom(): Promise<string> {
  return file({
    kind: 'report',
    title: 'What the bench jig said about the printed clamp mount',
    summary:
      'The printed clamp mount broke below the load the transplant trials need, so the aluminium version is ' +
      'the only one worth another run and the print queue has been stopped.',
    data: { blocks: LONG_BODY, for: THE_TEST_OFFICES_OWNER.name, date: '2026-09-15' },
  })
}

const PARTS = [
  {
    id: 'p-1',
    heading: 'Why the printed mount cannot be used',
    text30: 'The printed part failed below the load the trials need, so it is out.',
    text120:
      'The printed part failed below the load the trials need, so it is out, and the aluminium one of the ' +
      'same geometry has not been put on the jig yet.',
    covers: ['b-1', 'b-2'],
  },
]

// ============================================================ a. a kind with no place for the level

describe('a kind that has no place for a level says so', () => {
  it('says a task has no parts to write, so levels 4, 5 and 6 are not "none"', async () => {
    const task = await aTask()
    const { byRung } = await readingOf(task)

    for (const rung of ['outline', 'sketch', 'digest'] as const) {
      const row = byRung.get(rung)
      expect(row?.state, `${rung} on a task`).toBe('cannot_write')
      expect(row?.why, `${rung} on a task`).toBe('noPlace')
      expect(row?.state, `${rung} is never reported as one nobody skipped`).not.toBe('none')
      expect(String(row?.says), `${rung} names what nobody can write`).toContain('has no parts to write')
      expect(String(row?.says), `${rung} never says nobody has written it`).not.toMatch(/Nobody has written|has been written for this record/)
    }

    // THE POSITIONS A PERSON CAN STILL WRITE KEEP THEIR OWN ANSWER.
    for (const rung of ['label', 'gist'] as const) {
      expect(byRung.get(rung)?.state, `${rung} is a position a person can still write`).toBe('none')
      expect(byRung.get(rung)?.why, `${rung} is notWritten, not a reason nobody can act on`).toBe('notWritten')
    }
  })
})

// ============================================================ b. a record too short for the level

describe('a record already that short says so, in the write door’s own words', () => {
  it('says a fifteen-word module is too short for the levels above the conclusion', async () => {
    expect(countWords(FIFTEEN_WORD_SUMMARY), 'the fixture is not fifteen words').toBe(15)
    const moduleId = await aFifteenWordModule()
    const { note, byRung } = await readingOf(moduleId)

    for (const rung of ['outline', 'sketch', 'digest'] as const) {
      const row = byRung.get(rung)
      expect(row?.state, `${rung} on a short module`).toBe('cannot_write')
      expect(row?.why, `${rung} on a short module`).toBe('tooShort')
      expect(row?.state, `${rung} is never reported as one nobody skipped`).not.toBe('none')
      expect(String(row?.says), `${rung} names the reason`).toContain('too short')
      expect(String(row?.says), `${rung} carries the write door's clause`).toContain(TOO_SHORT_CLAUSE)
      expect(String(row?.says), `${rung} never says nobody has written it`).not.toMatch(/Nobody has written|has been written for this record/)
    }

    // THE NOTE ABOUT THE WHOLE RECORD SAYS IT TOO, AND STILL NAMES THE LABEL AS ONE TO WRITE.
    expect(note, 'the note carries the write door\'s clause').toContain(TOO_SHORT_CLAUSE)
    expect(note, 'the label IS one somebody can write').toContain('Nobody has written the label')

    // THE WRITE DOOR REFUSES THE VERY THING THE OLD READING INVITED, AND IN THESE WORDS.
    const refused = await post(`/api/records/${moduleId}/short-forms`, {
      madeFrom: await newestRevision(moduleId),
      forms: { parts: PARTS },
    })
    expect(refused.status, JSON.stringify(refused.body)).toBe(400)
    const said = JSON.stringify(refused.body)
    expect(said, 'the door and the reading say one thing').toContain(TOO_SHORT_CLAUSE)
    expect(String(byRung.get('outline')?.says), 'the reading and the door share the clause').toContain(
      TOO_SHORT_CLAUSE,
    )
  })
})

// ============================================================ c. room, and nobody wrote it

describe('a record with room and nothing written still says "none"', () => {
  it('keeps "none" for a position somebody can still write, and the sentence still invites', async () => {
    const reportId = await aReportWithRoom()
    const { byRung } = await readingOf(reportId)

    const label = byRung.get('label')
    expect(label?.state, 'a label has a place and room and nobody wrote one').toBe('none')
    expect(label?.why).toBe('notWritten')
    expect(String(label?.says)).toContain('No label has been written')

    // LEVEL 4 HAS A PLACE AND ROOM TOO, because this record is longer than every budget. It is the
    // case the old reply got right, and narrowing `none` must not take it away.
    const outline = byRung.get('outline')
    expect(outline?.state, 'level 4 has room here and nobody wrote it').toBe('none')
    expect(outline?.why).toBe('notWritten')
    expect(String(outline?.says)).toContain('has been written for this record')
  })
})

// ============================================================ d. the reading and the card agree

describe('the reading and the card give one reason for one level', () => {
  /**
   * THE ASSERTION THAT STOPS THE TWO DRIFTING AGAIN. It builds the record as the resolver sees it
   * with `detailSourceOf` — the same builder the route and the card both use — asks
   * `whyEachLevelIsMissing` with the same written set the card asks it with, and compares that
   * answer to the reply's own `why`, level by level. There is no second opinion to disagree with.
   */
  it('matches whyEachLevelIsMissing for every writable level of a task, a short module and a report', async () => {
    const records = [await aTask(), await aFifteenWordModule(), await aReportWithRoom()]

    for (const recordId of records) {
      const stored = t.api.getRecord(recordId)
      if (stored === null) throw new Error(`record ${recordId} went missing`)
      const source = detailSourceOf(stored)
      const written = new Set<Rung>(formsWrittenIn(source).map((one) => one.rung))
      const card = whyEachLevelIsMissing(source, written)
      const { byRung } = await readingOf(recordId)

      for (const rung of WRITABLE) {
        expect(byRung.get(rung)?.why ?? null, `${recordId} ${rung}: the reading and the card disagree`).toBe(
          card[rung] ?? null,
        )
      }
    }
  })
})

// ============================================================ e. cannot_check is untouched

describe('cannot_check still means what it meant', () => {
  it('is still its own answer about a written form nobody can verify, and is never "none"', async () => {
    const reportId = await aReportWithRoom()
    const stored = t.api.getRecord(reportId)
    if (stored === null) throw new Error('the report went missing')
    // A ROW WRITTEN BEFORE EITHER DOOR CHECKED, put in the way the read has to answer for: a form
    // whose `madeFrom` names a revision this ledger does not hold. No route writes it now.
    t.client.sqlite
      .prepare('UPDATE records SET data = ? WHERE id = ?')
      .run(
        JSON.stringify({
          ...stored.data,
          shortForms: {
            label: { text: 'Wrist mount load test', madeFrom: { seq: 44, contentHash: 'aaaaaaaaaaaaaaaa' }, writtenBy: 'agent' },
          },
        }),
        reportId,
      )

    const { byRung } = await readingOf(reportId)
    const label = byRung.get('label')
    expect(label?.state, 'a form nobody can check is not "nobody wrote one"').toBe('cannot_check')
    expect(label?.state).not.toBe('none')
    expect(label?.state).not.toBe('cannot_write')
    expect(label?.why, 'a written form has no absence reason').toBeNull()
    expect(String(label?.says)).toContain('cannot say whether the record has moved past it')
  })
})
