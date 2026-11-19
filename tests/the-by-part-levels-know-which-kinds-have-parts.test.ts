// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BY-PART LEVELS KNOW WHICH KINDS HAVE PARTS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT P6 ASKS, AND WHAT WAS ALREADY BUILT WHEN THIS FILE WAS WRITTEN
 * ---------------------------------------------------------------------------------------
 *
 * Criterion P6 of design/planning/ACCEPTANCE.md gives levels 4, 5 and 6 — written by part — to the
 * kinds that have parts. A part names the blocks it covers, so the kinds that can carry these three
 * levels are the kinds that hold blocks inside the record: `module` and `report`, and no other. That
 * machinery already shipped on 5 September 2026 (`shortFormsField` picks the `ShortFormsWithParts`
 * shape from the kind's own declared block field), so this file does not build it. It holds it, for a
 * module rather than only a report, and it holds the one thing that was missing beside it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MISSING: THE WRITE DOOR HAD NO KIND CHECK
 * ---------------------------------------------------------------------------------------
 *
 * `settleShortForms` in src/server/lib/zoom.ts reached its length check first, so a summary written
 * by part arriving at a kind with no place for one was refused for being TOO SHORT. Measured on
 * 16 September 2026: an eighty-word pipeline was told *"Write more in the pipeline"*, which can never
 * come true because no amount of writing gives a pipeline a block field. The reading reply for the
 * same record said *this kind of record has no parts to write*. Two surfaces, one record, two reasons.
 *
 * The door now asks `kindHoldsPartsLevels` — the kind's own declaration, the same question the reply
 * and the card ask — and prints `noPartsToWriteSentence`, the sentence cluster E built. So a writer
 * and a reader are told one thing, and it is the true thing.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT PROVE EACH SECTION
 * ---------------------------------------------------------------------------------------
 *
 *   `spec.fields.some(f => f.type === 'SummaryBlock[]')` set to false in src/shared/kinds.ts
 *     -> section 1 goes red: a module loses its parts and the write is refused.
 *   the `budgetAgainst` call in `partsProblems` (src/shared/zoom.ts) made to return null
 *     -> section 2 goes red: an over-budget heading is stored.
 *   the `if (kindHoldsPartsLevels(kind)) return` line in `refusePartsOnAKindWithNoPlace`
 *     (src/server/lib/zoom.ts) changed to `if (true) return`
 *     -> section 3's write half goes red: the refusal is the too-short sentence again.
 *   the `noPartsToWriteSentence(levelNames)` return in `cannotBeWrittenSentence`
 *     (src/server/lib/zoom.ts) replaced with the too-short sentence
 *     -> section 3's reply half goes red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { kindHoldsPartsLevels } from '../src/shared/kinds.ts'
import { PART_TEXT_SPECS, type StoredPart } from '../src/shared/zoom.ts'

const HEADERS = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
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

/** The newest revision, which every short-form write names. */
async function newestRevision(recordId: string): Promise<{ seq: number; contentHash: string }> {
  const read = await get(`/api/records/${recordId}/revisions`)
  expect(read.status).toBe(200)
  const entry = (read.body.revisions as { seq: number; contentHash: string }[])[0]
  if (entry === undefined) throw new Error(`record ${recordId} has no revisions`)
  return { seq: entry.seq, contentHash: entry.contentHash }
}

/** Write a set of parts through the front door. */
async function writeParts(recordId: string, parts: unknown): Promise<{ status: number; body: any }> {
  return post(`/api/records/${recordId}/short-forms`, {
    madeFrom: await newestRevision(recordId),
    forms: { parts },
  })
}

/** Where one level stands on a record, out of the reply's seven. */
async function levelOf(recordId: string, rung: string): Promise<any> {
  const read = await get(`/api/records/${recordId}/short-forms`)
  expect(read.status, JSON.stringify(read.body)).toBe(200)
  return (read.body.levels as any[]).find((one) => one.rung === rung)
}

/** What the record holds now, whole. */
function storedData(recordId: string): Record<string, unknown> {
  return (t.api.getRecord(recordId)?.data ?? {}) as Record<string, unknown>
}

/** The refusal sentence, from either door's reply. */
function refusal(body: any): string {
  return String(body?.error ?? JSON.stringify(body))
}

/** A long run of words, so a record has room for every level above its conclusion. */
const long = (n: number): string => Array.from({ length: n }, (_, i) => `word${String(i)}`).join(' ')

/** Two blocks, each long enough that the module's own prose is longer than one part of level 6. */
const MODULE_BLOCKS = [
  { id: 'b-1', type: 'text', text: long(70) },
  { id: 'b-2', type: 'text', text: long(70) },
]

/** Two parts that cover the two blocks. */
const MODULE_PARTS: StoredPart[] = [
  {
    id: 'p-1',
    heading: 'The first part in one sentence',
    text30: 'The first part says what the first block says, in one sentence.',
    text120: 'The first part says what the first block says, at greater length, so that level 6 has something to draw.',
    covers: ['b-1'],
  },
  {
    id: 'p-2',
    heading: 'The second part in one sentence',
    text30: 'The second part says what the second block says, in one sentence.',
    text120: 'The second part says what the second block says, at greater length, so that level 6 has something to draw.',
    covers: ['b-2'],
  },
]

/** A module with a body long enough for levels 4, 5 and 6 — a kind whose parts are its own blocks. */
function moduleWithRoom(): Promise<string> {
  return file({
    kind: 'module',
    title: 'The wrist mount rig and what the bench jig measured on it',
    summary: long(30),
    data: { state: 'active', summaryBlocks: MODULE_BLOCKS },
  })
}

/**
 * A KIND THAT KEEPS NO BLOCKS IN ITS OWN `data`, with enough words that LENGTH is not the reason
 * for anything. Each is one of the kinds P6 names, plus the problem and direction a plan line files
 * as. The pipeline's parts are separate `block` records, which is why it has none inside it.
 */
const KINDS_WITH_NO_PLACE: readonly { kind: string; data: Record<string, unknown> }[] = [
  { kind: 'task', data: { state: 'todo' } },
  { kind: 'pipeline', data: { blockIds: [] } },
  { kind: 'problem', data: {} },
  { kind: 'direction', data: {} },
]

describe('a kind whose parts are its own blocks carries levels 4, 5 and 6', () => {
  it('stores a module’s parts and reads all three levels back as current', async () => {
    // THE KINDS THAT HAVE PARTS ARE READ OFF THE DECLARATION, not listed here, so this test says
    // what it means: a module declares a block field, so it has a place for the by-part levels.
    expect(kindHoldsPartsLevels('module'), 'a module declares no block field').toBe(true)

    const module = await moduleWithRoom()
    const wrote = await writeParts(module, MODULE_PARTS)
    expect(wrote.status, JSON.stringify(wrote.body)).toBe(200)

    // ALL THREE ARE ONE STRUCTURE, so all three come back written and current.
    for (const rung of ['outline', 'sketch', 'digest'] as const) {
      const row = await levelOf(module, rung)
      expect(row?.state, `${rung} on a module that wrote its parts`).toBe('current')
      expect(row?.parts, `${rung} names the by-part structure`).toEqual({ written: true, count: 2 })
      expect(String(row?.says), `${rung} says how many parts`).toContain('written in 2 parts')
    }

    // AND THE WORDS ARE STORED WHERE THE SHAPE DECLARES THEM. A read that agreed while the write
    // stored nothing would be the same false green this repository keeps finding.
    const forms = storedData(module)['shortForms'] as Record<string, unknown>
    expect((forms['parts'] as { parts: unknown[] }).parts.length, 'the module’s parts were not stored').toBe(2)
  })

  /**
   * A MODULE'S READING NAMES A MODULE, added 30 September 2026 for problem rLYYdQeL0vJL. The three
   * by-part lengths were called *report's outline*, *report's sketch* and *report's digest* on
   * every kind, so a module's writer was pointed at a report they had not got. The whole reply is
   * checked, before the parts are written and after, because the noun reaches the row, its sentence
   * and the note about the whole record. The reply to filing the module is checked too, because it
   * lists the lengths still to write. Mutations: in `seat` in src/server/lib/zoom.ts, read `noun`
   * and `what` off `spec` (RUNG_SPECS) again instead of `said`, and the reading goes red on the
   * word report; in `shortFormsStillToWrite` in src/server/api/records.ts, put back "part of the
   * report", and the filing reply goes red on the same word.
   */
  it('names a module’s by-part lengths after a module, and never after a report', async () => {
    const filed = await post('/api/records', {
      kind: 'module',
      title: 'The wrist mount rig and what the bench jig measured on it',
      summary: long(30),
      data: { state: 'active', summaryBlocks: MODULE_BLOCKS },
    })
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)
    expect(JSON.stringify(filed.body.shortForms), 'the filing reply lists no lengths to write').toContain('part of the module')
    expect(JSON.stringify(filed.body.shortForms), 'the filing reply').not.toMatch(/report/i)
    const module = filed.body.record.id as string
    for (const when of ['before the parts are written', 'after the parts are written'] as const) {
      if (when === 'after the parts are written') {
        const wrote = await writeParts(module, MODULE_PARTS)
        expect(wrote.status, JSON.stringify(wrote.body)).toBe(200)
      }
      const read = await get(`/api/records/${module}/short-forms`)
      expect(read.status, JSON.stringify(read.body)).toBe(200)
      const nouns = (read.body.levels as any[])
        .filter((one) => ['outline', 'sketch', 'digest'].includes(one.rung))
        .map((one) => one.noun)
      expect(nouns, when).toEqual(["module's outline", "module's sketch", "module's digest"])
      expect(JSON.stringify(read.body), when).not.toMatch(/report/i)
    }
  })

  it('refuses an over-budget heading in the budget’s own sentence', async () => {
    const module = await moduleWithRoom()
    const over = Array.from({ length: PART_TEXT_SPECS.heading.maxWords + 1 }, (_, i) => `word${String(i)}`).join(' ')
    const refused = await writeParts(module, [{ ...MODULE_PARTS[0], heading: over }, MODULE_PARTS[1]])

    expect(refused.status, JSON.stringify(refused.body)).toBe(400)
    // THE NUMBERS COME FROM THE DECLARATION, so this line moves with the budget and a widened budget
    // would leave the test honest rather than silently green.
    expect(refusal(refused.body)).toContain(
      `The part's heading is ${String(PART_TEXT_SPECS.heading.maxWords + 1)} words and may be at most ` +
        `${String(PART_TEXT_SPECS.heading.maxWords)}`,
    )
    expect(storedData(module)['shortForms'], 'an over-budget part was stored').toBeUndefined()
  })
})

describe('a kind whose parts are not blocks inside it says so at both doors', () => {
  for (const { kind, data } of KINDS_WITH_NO_PLACE) {
    it(`says a ${kind} has no parts to write rather than calling it too short`, async () => {
      // ENOUGH WORDS THAT LENGTH IS NOT THE REASON. The old door reached the length check first and
      // told an eighty-word record to write more, which a kind with no block field can never fix.
      const id = await file({
        kind,
        title: `A ${kind} with room for any length a part could need`,
        summary: long(80),
        data,
      })

      const refused = await writeParts(id, MODULE_PARTS)
      expect(refused.status, JSON.stringify(refused.body)).toBe(400)
      const said = refusal(refused.body)
      expect(said, `${kind}'s write door does not give the real reason`).toContain(
        'This kind of record has no parts to write',
      )
      // AND IT DOES NOT GIVE THE REASON THAT CANNOT BE ACTED ON.
      expect(said, `${kind}'s write door told the writer to write more`).not.toContain('Write more in the')
      expect(said, `${kind}'s write door called a kind problem a length problem`).not.toContain('too short')
      expect(storedData(id)['shortForms'], `parts were stored on a ${kind}`).toBeUndefined()

      // THE REPLY GIVES THE SAME REASON, in the same sentence cluster E built.
      const outline = await levelOf(id, 'outline')
      expect(outline?.state, `${kind}'s level 4`).toBe('cannot_write')
      expect(outline?.why, `${kind}'s level 4 reason`).toBe('noPlace')
      expect(String(outline?.says), `${kind}'s reply does not give the real reason`).toContain(
        'This kind of record has no parts to write',
      )
    })
  }
})
