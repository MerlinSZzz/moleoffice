// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SHORT FORM GOES OUT OF DATE BY ARITHMETIC, NOT BY SOMEBODY REMEMBERING.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED HERE
 * ---------------------------------------------------------------------------------------
 *
 * A label written from a report on Monday is drawn beside that report on Friday. Nothing tells it
 * the report was rewritten on Wednesday. So every stored short form names the revision it was
 * written from, and Mole Office compares what the record held then with what it holds now.
 *
 * THE TRAP THAT MAKES THIS WORTH A TEST FILE. Short forms live INSIDE the record, in
 * `data.shortForms`, and a record's content hash is over the whole of `data`. So the obvious
 * comparison — the stored hash against the record's version now — marks every short form out of date
 * the instant it is saved, for ever, and the mark then means nothing. The comparison has to be of
 * the AUTHORED content, with the short forms themselves left out of it. "Writing a second length
 * does not make the first one out of date" below is that trap, held open.
 *
 * The lengths, the budgets and the two cutting rules are in tests/zoom.test.ts, which needs no
 * database.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO LENGTHS THIS FILE WRITES, AND THE TWO IT CANNOT
 * ---------------------------------------------------------------------------------------
 *
 * Criterion A14b of design/pointing-reopened/ACCEPTANCE.md, 3 September 2026: reading length 2 IS
 * the record's own `title` column and length 3 IS its own `summary`. Neither is stored beside the
 * record, so neither names a revision and neither can ever be out of date — a column moves when the
 * record moves, because it IS the record. So the arithmetic this file is named after is about the
 * two things `POST /api/records/<id>/short-forms` still writes: the LABEL and the BY-PART
 * STRUCTURE. Most of these cases used to write a gist, and each one that moved says so above
 * itself.
 *
 * THE REPORT BELOW IS FILED WITH A TITLE AND NO SUMMARY, which is why every reading here counts one
 * length written before anybody writes anything, and why length 3 is one of the lengths nobody has
 * written.
 *
 * ---------------------------------------------------------------------------------------
 * IT DRIVES THE PRODUCT'S OWN SERVER, AND IT DID NOT
 * ---------------------------------------------------------------------------------------
 *
 * This file used to build a Fastify instance of its own and register `zoomRoutes` on it. Every test
 * in it passed while the real server registered nothing and answered 404 for all three endpoints —
 * so twenty green tests said nothing whatever about the shipped product. `tests/server-wiring.test.ts`
 * was red about it at the same moment and nobody read it.
 *
 * `apiApp()` from ./helpers.ts is `buildApp()` from src/server/index.ts, which is the one description
 * of what Mole Office serves. Delete the registration again and this file goes red on its first request.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { SHORT_FORM_SPECS } from '../src/shared/zoom.ts'
import { RUNGS } from '../src/shared/detail.ts'

type ZoomLib = typeof import('../src/server/lib/zoom.ts')
type RevisionsLib = typeof import('../src/server/lib/revisions.ts')

interface Harness {
  t: TestDb
  app: FastifyInstance
  zoom: ZoomLib
  revisions: RevisionsLib
  /** A report with a body. The thing short forms are of. */
  report: string
  /** A record in another project, for the reads that must answer about one project only. */
  elsewhere: string
}

const BODY = [
  { id: 'b-1', type: 'heading', text: 'What broke' },
  // THIS BLOCK IS LONG ON PURPOSE. `rungsFor` stops a record's ladder at the first length the whole
  // record fits in, and the conclusion's own budget is 60 words — so a report shorter than that has
  // no level 4, 5 or 6 and the write door refuses a summary written by part on it. A fixture this
  // file writes parts to has to be a report with room for them.
  {
    id: 'b-2',
    type: 'text',
    text:
      'Three of four printed wrist mounts cracked at about fifteen newtons, at the thin section behind the bolt circle.' +
      ' The jig was reset between pulls and the load cell was zeroed each time, so the three numbers are comparable with one another. The fourth mount held to twenty-two newtons and had been printed at half the layer height, which was a mistake in the print queue rather than a decision anybody made, and nobody has repeated it since.',
  },
]

/**
 * THE TITLE THE REPORT IS FILED WITH, WHICH IS READING LENGTH 2.
 *
 * Criterion A14b of design/pointing-reopened/ACCEPTANCE.md, 3 September 2026: reading length 2 IS
 * the record's own `title` column and length 3 IS its own `summary`. So this report has length 2
 * written from the moment it is filed and has no length 3 — it is filed with no summary — and both
 * facts are read off this constant rather than typed into the assertions below.
 */
const TITLE = 'Wrist mount pull test'
const LABEL = 'Wrist mount load test'

/**
 * THE BY-PART STRUCTURE, WHICH IS THE OTHER THING THIS ROUTE WRITES.
 *
 * IT IS HERE BECAUSE THE GIST LEFT. Several cases below need a SECOND length this door can write,
 * to say that writing one leaves another alone and that clearing one of two is not the code path
 * that clears the last. The gist was that second length until criterion A14b; the parts are what
 * is left, and they are one thing to write covering reading lengths 4, 5 and 6.
 *
 * ONE PART COVERING BOTH BLOCKS, because every block of the report is covered by exactly one part
 * and this report has two. None of its three texts opens with the report's own words, which is the
 * other rule the write door enforces against the body.
 */
const PARTS = [
  {
    id: 'p-1',
    heading: 'Why the printed mount cannot be used',
    text30: 'The printed part failed on the bench below the load the trials need, so it is out.',
    text120:
      'The printed part failed on the bench below the load the trials need, so it is out, and the ' +
      'aluminium one of the same geometry has not been put on the jig yet.',
    covers: ['b-1', 'b-2'],
  },
]

/** What an agent's requests carry, so a write is attributed to one rather than to the owner. */
const AS_AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-session': 'sess-short-forms',
}

/** What a person's requests carry. Who is asking is what decides whether a level is an override. */
const AS_HUMAN = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-session': 'sess-short-forms',
}

/**
 * THE REPORT EACH CASE IS ABOUT, MADE FRESH IN THE FILE'S ONE OFFICE.
 *
 * The office, its database and the record in another project are made once in `beforeAll`; the
 * report is the record a case writes short forms on, so every case gets its own and no case reads
 * what another case wrote.
 */
function aFreshReport(office: Omit<Harness, 'report'>): string {
  return office.t.api.createRecord({
    workspaceId: 'default',
    kind: 'report',
    title: TITLE,
    data: { blocks: BODY, for: THE_TEST_OFFICES_OWNER.name, date: '2026-08-14' },
    actor: office.t.api.HUMAN,
  }).id
}

let h: Harness
let office: Omit<Harness, 'report'>

beforeAll(async () => {
  const t = await freshDb()
  const zoom = await import('../src/server/lib/zoom.ts')
  const revisions = await import('../src/server/lib/revisions.ts')

  // THE PRODUCT'S OWN SERVER. See the header: a Fastify instance built here would be green while the
  // real one served none of this.
  const { app } = await apiApp()
  await app.ready()

  const { createWorkspace, getWorkspace } = await import('../src/server/lib/workspaces.ts')
  if (getWorkspace('robotics') === null) createWorkspace({ id: 'robotics', title: 'Robotics' })
  const elsewhere = t.api.createRecord({
    workspaceId: 'robotics',
    kind: 'report',
    title: 'A report in another project',
    data: { blocks: BODY },
    actor: t.api.HUMAN,
  }).id

  office = { t, app, zoom, revisions, elsewhere }
})

beforeEach(() => {
  h = { ...office, report: aFreshReport(office) }
})

afterAll(async () => {
  await office.app.close()
  office.t.close()
})

/** The newest entry of a record's ledger: the pair a writer of short forms has to send. */
function newest(recordId: string): { seq: number; contentHash: string } {
  const entry = h.revisions.listRevisions(recordId).revisions[0]
  if (entry === undefined) throw new Error(`record ${recordId} has no revisions`)
  return { seq: entry.seq, contentHash: entry.contentHash }
}

function post(path: string, body: InjectOptions['payload']): Promise<LightMyRequestResponse> {
  return h.app.inject({ method: 'POST', url: path, payload: body, headers: { ...AS_AGENT } })
}

/** The same request, sent by a person. */
function postAsHuman(path: string, body: InjectOptions['payload']): Promise<LightMyRequestResponse> {
  return h.app.inject({ method: 'POST', url: path, payload: body, headers: { ...AS_HUMAN } })
}

function get(path: string): Promise<LightMyRequestResponse> {
  return h.app.inject({ method: 'GET', url: path })
}

const body = (reply: LightMyRequestResponse): Record<string, unknown> =>
  JSON.parse(reply.body) as Record<string, unknown>

/** One level out of a reading, by name. */
function levelOf(reading: unknown, level: string): Record<string, unknown> {
  const levels = (reading as { levels?: unknown[] }).levels ?? []
  const found = levels
    .map((l) => l as Record<string, unknown>)
    .find((l) => l['level'] === level)
  if (found === undefined) throw new Error(`the reading has no level "${level}"`)
  return found
}

/**
 * ONE ROW OUT OF A READING, BY THE POSITION IT IS.
 *
 * `levelOf` above finds a row by its STORED KEY, and only three rows carry one: reading lengths 4,
 * 5 and 6 are written by part rather than as one text, and Full is the record itself, so all four
 * answer `level: null`. Every row carries its rung, which is what this reads.
 */
function rowOf(reading: unknown, rung: string): Record<string, unknown> {
  const levels = (reading as { levels?: unknown[] }).levels ?? []
  const found = levels.map((l) => l as Record<string, unknown>).find((l) => l['rung'] === rung)
  if (found === undefined) throw new Error(`the reading has no position "${rung}"`)
  return found
}

/**
 * NOTHING AT ALL WAS STORED UNDER `data.shortForms` BY A WRITE THAT WAS REFUSED.
 *
 * IT WAS `written === 0` ON THE WHOLE READING, in seven cases, until 3 September 2026. Criterion
 * A14b of design/pointing-reopened/ACCEPTANCE.md made reading length 2 the record's own `title`
 * column, so every record has one length written before anybody writes anything and a count of
 * nothing written can no longer say that a refusal stored nothing. This asks what those cases were
 * really asking, and asks it of the record itself: the field is not there at all.
 */
async function nothingWasStored(): Promise<void> {
  const reading = body(await get(`/api/records/${h.report}/short-forms`))
  expect(levelOf(reading, 'label')['state'], 'the refused write stored a label').toBe('none')
  expect(rowOf(reading, 'outline')['parts'], 'the refused write stored a by-part structure').toEqual({
    written: false,
    count: null,
  })
  expect(h.t.api.getRecord(h.report)?.data['shortForms'], 'the refused write stored something').toBeUndefined()
}

// ============================================================================ nothing written yet

describe('a record nobody has written short forms for', () => {
  /**
   * THIS ASSERTED THAT EVERY ONE OF THE SEVEN POSITIONS SAID NOBODY HAD WRITTEN IT, and that the
   * whole reading counted nothing written. Criterion A14b of
   * design/pointing-reopened/ACCEPTANCE.md changed that on 3 September 2026: reading length 2 IS
   * the record's own `title` column, and this report was filed with a title, so length 2 is written
   * from the moment the record exists. It has no summary, so length 3 is one of the lengths nobody
   * has written, along with the label and the three written by part.
   *
   * WHAT IS ASSERTED IS NOW STRONGER RATHER THAN LOOSER: the title row is checked to be the title
   * column's own words, byte for byte, and every other position is still checked to say plainly
   * that nobody has written it.
   */
  it('answers about every length, and every one but the record’s own title says nobody has written it', async () => {
    const reading = body(await get(`/api/records/${h.report}/short-forms`))
    expect(reading['written'], 'the record’s own title is reading length 2 and it is written').toBe(1)
    expect(reading['outOfDate']).toBe(0)
    // ONE ROW PER POSITION ON THE READING LADDER, and the count comes from the declaration rather
    // than from a numeral: the numeral was 5, then a sixth length was declared on 30 August 2026
    // with the door already accepting it, and on 2 September 2026 the seventh position joined the
    // answer, because a caller asking where a record stands at each length has to be told about
    // Full too. The rows are read off `RUNGS` rather than named here.
    expect((reading['levels'] as unknown[]).length).toBe(RUNGS.length)
    for (const rung of RUNGS) {
      const entry = rowOf(reading, rung)
      if (rung === 'full') {
        // FULL IS THE RECORD ITSELF and there is no shorter form of the whole thing to be missing,
        // so it is never one of the lengths nobody has written.
        expect(entry['state'], rung).toBe('is_the_record')
        continue
      }
      if (rung === 'title') {
        // THE RECORD'S OWN TITLE, WHICH IS THIS POSITION. Nothing was written beside the record for
        // it and nothing had to be: the column IS the length, so the words are the column's words
        // and the reading says where they came from.
        expect(entry['state'], rung).toBe('current')
        expect(entry['from'], rung).toBe('title')
        expect(entry['text'], rung).toBe(TITLE)
        continue
      }
      expect(entry['state'], rung).toBe('none')
      expect(entry['text'], rung).toBeNull()
      expect(String(entry['says']), rung).toContain('has been written for this record')
    }
    // THE SIX WRITABLE POSITIONS, WHICH IS THE SEVEN WITHOUT THE RECORD ITSELF. Counting Full here
    // would tell a writer there are seven lengths to write and one of them cannot be written.
    expect(String(reading['note'])).toContain(`1 of the ${String(RUNGS.length - 1)} shorter forms`)
    expect(String(reading['note']), 'the note does not name the lengths still to write').toContain(
      `Nobody has written the ${SHORT_FORM_SPECS.label.noun}`,
    )
  })

  it('never shortens the record to fill the gap, and says that is why', async () => {
    const reading = body(await get(`/api/records/${h.report}/short-forms`))
    const label = levelOf(reading, 'label')
    // The report's own words are in the body. If anything were being cut to fill a label, they
    // would be here.
    expect(String(label['says'])).not.toContain('cracked')
    expect(String(label['says'])).toContain('not a label')
  })
})

// ============================================================================ writing one

describe('writing a short form', () => {
  it('stores it against the revision it was written from, and reads back as current', async () => {
    const madeFrom = newest(h.report)
    expect(madeFrom.seq, 'a created record has a first revision').toBe(1)

    const reply = await post(`/api/records/${h.report}/short-forms`, {
      madeFrom,
      forms: { label: LABEL },
    })
    expect(reply.statusCode).toBe(200)

    const reading = body(reply)
    // TWO: THE LABEL THIS WRITE STORED, AND THE RECORD'S OWN TITLE, which is reading length 2 since
    // criterion A14b. The write used to name a label and a gist and this count meant those two.
    expect(reading['written']).toBe(2)
    expect(reading['outOfDate']).toBe(0)
    const label = levelOf(reading, 'label')
    expect(label['state']).toBe('current')
    expect(label['text']).toBe(LABEL)
    expect(label['wordCount']).toBe(4)
    expect(label['writtenBy']).toBe('agent')
    expect(label['override']).toBe(false)
    expect(label['changedSince']).toEqual([])
    expect(String(label['says'])).toContain('nothing in the record has changed since')
  })

  it('writes it as an ordinary record edit, so the ledger records it', async () => {
    await post(`/api/records/${h.report}/short-forms`, { madeFrom: newest(h.report), forms: { label: LABEL } })
    const listing = h.revisions.listRevisions(h.report)
    expect(listing.count, 'the write went through the one write door and left a revision').toBe(2)
    expect(listing.revisions[0]?.changed?.map((c) => c.path)).toEqual(['data.shortForms'])
  })

  /**
   * THE SECOND LENGTH THIS WRITES USED TO BE THE GIST and is the by-part structure now. Criterion
   * A14b made reading length 3 the record's own summary column on 3 September 2026, so the door
   * refuses a gist by name and the two things it still writes are the label and the parts. The
   * claim is the one it always was: a write that names one length leaves the other where it is.
   */
  it('leaves the lengths it was not asked about exactly as they were', async () => {
    await post(`/api/records/${h.report}/short-forms`, { madeFrom: newest(h.report), forms: { label: LABEL } })
    const second = await post(`/api/records/${h.report}/short-forms`, {
      madeFrom: newest(h.report),
      forms: { parts: PARTS },
    })
    expect(second.statusCode, second.body).toBe(200)
    const reading = body(await get(`/api/records/${h.report}/short-forms`))
    expect(levelOf(reading, 'label')['text'], 'the label survived a write that did not name it').toBe(LABEL)
    expect(rowOf(reading, 'outline')['parts']).toEqual({ written: true, count: 1 })
  })

  it('clears ONE of several and leaves the others, which is not the same code path as clearing the last', async () => {
    // THIS TEST EXISTS BECAUSE THE FEATURE WAS BROKEN AND EVERY TEST PASSED. The write handed
    // `dataPatch` the whole merged set, and `mergeData` RECURSES into a nested object rather than
    // replacing it — so a level dropped from the set was left exactly where it was. Clearing one of
    // two lengths over HTTP did nothing and answered 200. The only test that covered clearing
    // cleared the ONLY length, which takes the other branch entirely.
    //
    // THE PAIR IS THE LABEL AND THE PARTS, and it was the label and the gist until criterion A14b
    // made reading length 3 the record's own summary column. The code path this is about — a merge
    // that recurses into the object already stored — is the same one whichever two keys are there.
    await post(`/api/records/${h.report}/short-forms`, {
      madeFrom: newest(h.report),
      forms: { label: LABEL, parts: PARTS },
    })
    const reading = body(
      await post(`/api/records/${h.report}/short-forms`, { madeFrom: newest(h.report), forms: { parts: null } }),
    )
    expect(rowOf(reading, 'outline')['state'], 'the one that was cleared').toBe('none')
    expect(rowOf(reading, 'outline')['parts'], 'the one that was cleared').toEqual({ written: false, count: null })
    expect(levelOf(reading, 'label')['text'], 'the one that was not named').toBe(LABEL)
    // THE LABEL AND THE RECORD'S OWN TITLE. It was 1 while length 2 was a form nobody had written.
    expect(reading['written']).toBe(2)
  })

  it('clears one when it is named with null, and removes the field when the last one goes', async () => {
    await post(`/api/records/${h.report}/short-forms`, { madeFrom: newest(h.report), forms: { label: LABEL } })
    await post(`/api/records/${h.report}/short-forms`, { madeFrom: newest(h.report), forms: { label: null } })
    const reading = body(await get(`/api/records/${h.report}/short-forms`))
    expect(levelOf(reading, 'label')['state']).toBe('none')
    const record = h.t.api.getRecord(h.report)
    expect(record?.data['shortForms'], 'an empty object would read as "somebody wrote short forms"').toBeUndefined()
  })

  it('marks a person\'s own words as an override, because that is a human decision on a derived field', async () => {
    const reading = body(
      await postAsHuman(`/api/records/${h.report}/short-forms`, {
        madeFrom: newest(h.report),
        forms: { label: LABEL },
      }),
    )
    const label = levelOf(reading, 'label')
    expect(label['writtenBy']).toBe('human')
    expect(label['override']).toBe(true)
    expect(String(label['says'])).toContain('A person wrote this by hand')
  })
})

// ============================================================================ who wrote it

describe('who wrote a short form is derived from who is asking', () => {
  it('refuses a body that declares its own author, and stores nothing', async () => {
    // THE DEFECT THIS REPLACES. `writtenBy` was a field of the request body with no relation to who
    // was asking, so an agent could file its own words as a person's override by typing the word.
    // The mark was then evidence of nothing in either direction.
    const reply = await post(`/api/records/${h.report}/short-forms`, {
      madeFrom: newest(h.report),
      writtenBy: 'human',
      forms: { label: LABEL },
    })
    expect(reply.statusCode).toBe(400)
    expect(reply.body).toContain('read from the actor headers')
    await nothingWasStored()
  })

  it('files an agent\'s words as derived, whatever the agent would have liked to say', async () => {
    const reading = body(
      await post(`/api/records/${h.report}/short-forms`, { madeFrom: newest(h.report), forms: { label: LABEL } }),
    )
    const label = levelOf(reading, 'label')
    expect(label['writtenBy']).toBe('agent')
    expect(label['override']).toBe(false)
    expect(String(label['says'])).not.toContain('A person wrote this by hand')
  })

  it('does not take silence as a person, because an absent header is not proof of one', async () => {
    // Owner decision §36: missing actor headers are not proof of human authority. A request with no
    // actor headers is defaulted to the owner, so believing that default here would hand the override
    // to any script with a bug in its header code.
    const reply = await h.app.inject({
      method: 'POST',
      url: `/api/records/${h.report}/short-forms`,
      payload: { madeFrom: newest(h.report), forms: { label: LABEL } },
    })
    expect(reply.statusCode).toBe(200)
    const label = levelOf(body(reply), 'label')
    expect(label['writtenBy']).toBe('agent')
    expect(label['override']).toBe(false)
  })
})

// ============================================================================ the ledger check

describe('the revision a short form says it was written from is checked', () => {
  it('refuses a revision this record does not have, and stores nothing', async () => {
    const reply = await post(`/api/records/${h.report}/short-forms`, {
      madeFrom: { seq: 9, contentHash: 'aaaaaaaaaaaaaaaa' },
      forms: { label: LABEL },
    })
    expect(reply.statusCode).toBe(404)
    expect(reply.body).toContain('has no revision 9')
    await nothingWasStored()
  })

  it('refuses a seq and a hash that name different revisions, rather than believing half of it', async () => {
    const reply = await post(`/api/records/${h.report}/short-forms`, {
      madeFrom: { seq: 1, contentHash: 'notthehashatall' },
      forms: { label: LABEL },
    })
    expect(reply.statusCode).toBe(400)
    expect(reply.body).toContain('name different revisions')
    await nothingWasStored()
  })

  it('refuses the same pair sent as an ordinary record edit, because that door skipped this check', async () => {
    // THE SECOND DOOR. `data.shortForms` is an ordinary field, so a plain PATCH writes it, and until
    // 19 August 2026 that path checked nothing: the pair below stored with a 200. The check now runs
    // inside `patchRecord` for every level a write changes, so both doors refuse the same thing.
    expect(() =>
      h.t.api.patchRecord(
        h.report,
        {
          dataPatch: {
            shortForms: { label: { text: LABEL, madeFrom: { seq: 44, contentHash: 'aaaaaaaaaaaaaaaa' }, writtenBy: 'agent' } },
          },
        },
        h.t.api.HUMAN,
      ),
    ).toThrow('has no revision 44')
    await nothingWasStored()
  })

  it('refuses it through the HTTP door as well, and stores nothing', async () => {
    const reply = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${h.report}`,
      headers: { ...AS_AGENT },
      payload: {
        dataPatch: {
          shortForms: { label: { text: LABEL, madeFrom: { seq: 44, contentHash: 'aaaaaaaaaaaaaaaa' }, writtenBy: 'agent' } },
        },
      },
    })
    expect(reply.statusCode).toBe(404)
    expect(reply.body).toContain('has no revision 44')
    await nothingWasStored()
  })

  it('refuses one on a record being filed, because a new record has no revisions to name', async () => {
    const reply = await h.app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...AS_AGENT },
      payload: {
        kind: 'report',
        title: 'A report filed with its short forms already on it',
        data: {
          blocks: BODY,
          for: THE_TEST_OFFICES_OWNER.name,
          date: '2026-08-14',
          shortForms: { label: { text: LABEL, madeFrom: { seq: 1, contentHash: 'aaaaaaaaaaaaaaaa' }, writtenBy: 'human' } },
        },
      },
    })
    expect(reply.statusCode).toBe(400)
    expect(reply.body).toContain('has no revisions yet')
  })

  it('still says it cannot check one that was stored before either door checked', async () => {
    // ROWS LIKE THIS EXIST. The pair below was storable through a plain PATCH until the check above
    // was added, so the READ has to keep answering honestly about one: "cannot check" is its own
    // answer and is never read as "current". It is written straight into the table here because that
    // is what "written before the door existed" means — no write path will produce it now.
    const stored = h.t.api.getRecord(h.report)
    if (stored === null) throw new Error('the report went missing')
    h.t.client.sqlite
      .prepare('UPDATE records SET data = ? WHERE id = ?')
      .run(
        JSON.stringify({
          ...stored.data,
          shortForms: { label: { text: LABEL, madeFrom: { seq: 44, contentHash: 'aaaaaaaaaaaaaaaa' }, writtenBy: 'agent' } },
        }),
        h.report,
      )

    const label = levelOf(body(await get(`/api/records/${h.report}/short-forms`)), 'label')
    expect(label['state']).toBe('cannot_check')
    expect(label['changedSince'], 'no comparison ran, which is not the same as nothing having changed').toBeNull()
    expect(String(label['says'])).toContain('cannot say whether the record has moved past it')
  })

  it('does not freeze a record that already holds one it cannot check', async () => {
    // THE TRAP THIS CHECK HAD TO AVOID. A merge patch carries the record's existing short forms
    // along with it, so a gate that checked everything about to be stored would refuse every later
    // edit to a record holding a pair like the one above — its title could never be changed again.
    // Only the levels a write CHANGES are checked, so an unrelated edit still lands.
    const stored = h.t.api.getRecord(h.report)
    if (stored === null) throw new Error('the report went missing')
    h.t.client.sqlite
      .prepare('UPDATE records SET data = ? WHERE id = ?')
      .run(
        JSON.stringify({
          ...stored.data,
          shortForms: { label: { text: LABEL, madeFrom: { seq: 44, contentHash: 'aaaaaaaaaaaaaaaa' }, writtenBy: 'agent' } },
        }),
        h.report,
      )

    const reply = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${h.report}`,
      headers: { ...AS_HUMAN },
      payload: { title: 'Wrist mount pull test, written up' },
    })
    expect(reply.statusCode, reply.body).toBe(200)
  })
})

// ============================================================================ the forged override

describe('the mark saying a person wrote this by hand cannot be typed by an agent', () => {
  it('files an agent\'s ordinary record edit as derived, whatever the body declared', async () => {
    // THE HOLE THIS CLOSES, MEASURED 19 AUGUST 2026. `POST /api/records/<id>/short-forms` refuses a
    // body that declares its own author, but `PATCH /api/records/<id>` writes the very same field
    // and took the word — so an agent stored `writtenBy: "human"` and the record page drew the
    // sentence saying a person wrote those words by hand. Who wrote a thing is Mole Office's own record
    // of the write and never a claim the writer makes about itself.
    const reply = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${h.report}`,
      headers: { ...AS_AGENT },
      payload: {
        dataPatch: { shortForms: { label: { text: LABEL, madeFrom: newest(h.report), writtenBy: 'human' } } },
      },
    })
    expect(reply.statusCode, reply.body).toBe(200)

    const label = levelOf(body(await get(`/api/records/${h.report}/short-forms`)), 'label')
    expect(label['writtenBy'], 'an agent declared itself a person and Mole Office believed it').toBe('agent')
    expect(label['override']).toBe(false)
    expect(String(label['says'])).not.toContain('A person wrote this by hand')
  })

  it('gives a person the override on the same path, so nothing was lost by taking the word away', async () => {
    const reply = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${h.report}`,
      headers: { ...AS_HUMAN },
      payload: {
        dataPatch: { shortForms: { label: { text: LABEL, madeFrom: newest(h.report), writtenBy: 'agent' } } },
      },
    })
    expect(reply.statusCode, reply.body).toBe(200)

    const label = levelOf(body(await get(`/api/records/${h.report}/short-forms`)), 'label')
    expect(label['writtenBy']).toBe('human')
    expect(label['override']).toBe(true)
    expect(String(label['says'])).toContain('A person wrote this by hand')
  })
})

// ============================================================================ going out of date

/**
 * THE LENGTH THAT GOES OUT OF DATE IN THIS BLOCK WAS THE GIST AND IS THE LABEL.
 *
 * Criterion A14b of design/pointing-reopened/ACCEPTANCE.md made reading length 3 the record's own
 * `summary` column on 3 September 2026, and a column can never be out of date with the record: it
 * IS the record, so it moves when the record moves and there is no revision it was written from.
 * The label is the whole-record form still stored beside the record, so it is the one this
 * arithmetic is about. Nothing else in these cases changed.
 */
describe('a short form goes out of date when the record moves', () => {
  it('names the fields that changed, and does not draw the words as current', async () => {
    await post(`/api/records/${h.report}/short-forms`, { madeFrom: newest(h.report), forms: { label: LABEL } })
    h.t.api.patchRecord(h.report, { title: 'Wrist mount pull test, second run' }, h.t.api.HUMAN)

    const reading = body(await get(`/api/records/${h.report}/short-forms`))
    expect(reading['outOfDate']).toBe(1)
    const label = levelOf(reading, 'label')
    expect(label['state']).toBe('out_of_date')
    expect(label['changedSince']).toEqual(['title'])
    expect(label['text'], 'the words are still handed back — they are what somebody wrote').toBe(LABEL)
    expect(String(label['says'])).toContain('will not draw them as current')
    expect(String(reading['note'])).toContain('1 of them is out of date')
  })

  it('notices a change to the body itself, which is the case it exists for', async () => {
    await post(`/api/records/${h.report}/short-forms`, { madeFrom: newest(h.report), forms: { label: LABEL } })
    h.t.api.patchRecord(
      h.report,
      { dataPatch: { blocks: [{ id: 'b-1', type: 'text', text: 'The aluminium mount held to forty newtons.' }] } },
      h.t.api.HUMAN,
    )
    const label = levelOf(body(await get(`/api/records/${h.report}/short-forms`)), 'label')
    expect(label['state']).toBe('out_of_date')
    expect(String(label['changedSince'])).toContain('data.blocks')
  })

  it('does NOT make one out of date by writing another, which the obvious comparison would', async () => {
    // THE TRAP THIS FILE EXISTS FOR. Short forms live inside `data`, so writing one moves the
    // record's content hash. Comparing that hash with the one a short form was written from would
    // mark the label out of date the instant the gist was saved — for ever, on every record, with
    // the mark then meaning nothing at all.
    const first = newest(h.report)
    await post(`/api/records/${h.report}/short-forms`, { madeFrom: first, forms: { label: LABEL } })
    const afterLabel = newest(h.report)
    expect(afterLabel.seq, 'writing a short form really does move the record').toBe(2)
    expect(afterLabel.contentHash, 'and really does change its content hash').not.toBe(first.contentHash)

    // THE SECOND WRITE IS THE BY-PART STRUCTURE, and it was the gist until criterion A14b. It is
    // stored under the same `data.shortForms` object as the label, which is what makes it the
    // second write this trap needs.
    const parts = await post(`/api/records/${h.report}/short-forms`, { madeFrom: afterLabel, forms: { parts: PARTS } })
    expect(parts.statusCode, parts.body).toBe(200)
    const reading = body(await get(`/api/records/${h.report}/short-forms`))
    expect(reading['outOfDate'], 'neither short form is out of date: the report has not moved').toBe(0)
    expect(levelOf(reading, 'label')['state']).toBe('current')
    expect(rowOf(reading, 'outline')['state']).toBe('current')
  })

  it('notices the blocks being REORDERED, which changes what the report says and moves no field', async () => {
    // THE LIE THIS FILE IS NAMED AFTER. Staleness used to be inferred from a list of differing
    // fields, and `fieldsThatDiffer` pairs array entries by their `id` and never by position — on
    // purpose, so that moving one checklist line is not reported as a change to two lines. A
    // report's blocks are exactly that shape of array, and their order is the order somebody reads
    // them in. So swapping the conclusion and the caveat changed what the report SAYS, changed its
    // content hash, and produced no differing fields: every level was drawn as current.
    //
    // The state is now decided by comparing the content token of the authored record then with the
    // one now, so a move that names no field is still a move.
    await post(`/api/records/${h.report}/short-forms`, { madeFrom: newest(h.report), forms: { label: LABEL } })
    const before = h.t.api.getRecord(h.report)
    expect(levelOf(body(await get(`/api/records/${h.report}/short-forms`)), 'label')['state']).toBe('current')

    h.t.api.patchRecord(h.report, { dataPatch: { blocks: [BODY[1], BODY[0]] } }, h.t.api.HUMAN)
    const after = h.t.api.getRecord(h.report)
    expect(after?.data['blocks'], 'the reorder really happened').not.toEqual(before?.data['blocks'])

    const reading = body(await get(`/api/records/${h.report}/short-forms`))
    const label = levelOf(reading, 'label')
    expect(label['state'], 'a level may not describe content it was not made from').toBe('out_of_date')
    expect(label['changedSince'], 'no field changed its value, and that is the honest answer').toEqual([])
    const { ONLY_THE_ORDER_MOVED } = await import('../src/server/lib/zoom.ts')
    expect(String(label['says'])).toContain(ONLY_THE_ORDER_MOVED)
    expect(String(label['says'])).toContain('will not draw them as current')
    expect(reading['outOfDate']).toBe(1)
  })

  it('comes back to current when the record is put back to what it was', async () => {
    const first = newest(h.report)
    await post(`/api/records/${h.report}/short-forms`, { madeFrom: first, forms: { label: LABEL } })
    h.t.api.patchRecord(h.report, { title: 'A different title' }, h.t.api.HUMAN)
    expect(levelOf(body(await get(`/api/records/${h.report}/short-forms`)), 'label')['state']).toBe('out_of_date')

    h.t.api.patchRecord(h.report, { title: TITLE }, h.t.api.HUMAN)
    const label = levelOf(body(await get(`/api/records/${h.report}/short-forms`)), 'label')
    expect(label['state'], 'the comparison is of content, so undoing the change undoes the staleness').toBe('current')
  })
})

// ============================================================================ a whole list at once

describe('one length for a whole list of records', () => {
  it('answers about every row in one request, including the rows that have none', async () => {
    await post(`/api/records/${h.report}/short-forms`, { madeFrom: newest(h.report), forms: { label: LABEL } })
    const other = h.t.api.createRecord({
      workspaceId: 'default',
      kind: 'report',
      title: 'A report with no short forms',
      data: { blocks: BODY },
      actor: h.t.api.HUMAN,
    }).id

    const reply = body(await post('/api/short-forms/rows', { recordIds: [h.report, other], level: 'label' }))
    const rows = reply['rows'] as Record<string, unknown>[]
    expect(rows.length).toBe(2)
    expect(rows.find((r) => r['recordId'] === h.report)?.['text']).toBe(LABEL)
    const missing = rows.find((r) => r['recordId'] === other)
    expect(missing?.['text']).toBeNull()
    expect(missing?.['state']).toBe('none')
    expect(String(reply['note'])).toContain('1 of 2 records has a label written')
  })

  /**
   * THE LONGER FORM THAT EXISTS USED TO BE A WRITTEN GIST, and it is the record's own summary now.
   * Criterion A14b of design/pointing-reopened/ACCEPTANCE.md made that column reading length 3 on
   * 3 September 2026, so a report with a summary and no label is exactly the shape this is about:
   * a row asking for a label has room for a label, and the paragraph must not be handed to it.
   */
  it('never hands a row a longer form because a shorter one is missing', async () => {
    const summary = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${h.report}`,
      headers: { ...AS_HUMAN },
      payload: { summary: SHORT_FORM_SPECS.gist.example },
    })
    expect(summary.statusCode, summary.body).toBe(200)
    const rows = body(await post('/api/short-forms/rows', { recordIds: [h.report], level: 'label' }))[
      'rows'
    ] as Record<string, unknown>[]
    expect(rows[0]?.['text'], 'the conclusion exists and is not drawn in a label\'s place').toBeNull()
    expect(String(rows[0]?.['says'])).toContain(SHORT_FORM_SPECS.gist.noun)
  })

  it('leaves out an id that belongs to another project, so one row cannot make a list undrawable', async () => {
    const reply = body(await post('/api/short-forms/rows', { recordIds: [h.report, h.elsewhere], level: 'label' }))
    expect((reply['rows'] as unknown[]).length).toBe(1)
    expect(reply['asked']).toBe(2)
    expect(String(reply['note'])).toContain('not in this project')
  })

  it('refuses a list longer than a screen rather than answering about a thousand rows', async () => {
    const reply = await post('/api/short-forms/rows', {
      recordIds: Array.from({ length: h.zoom.MAX_ROWS + 1 }, (_, n) => `id-${String(n)}`),
      level: 'label',
    })
    expect(reply.statusCode).toBe(400)
    expect(reply.body).toContain('at most')
  })
})

// ============================================================================ what the write refuses

describe('the write refuses what was not written', () => {
  it('refuses a label over its budget, through the ordinary write gate, and stores nothing', async () => {
    const reply = await post(`/api/records/${h.report}/short-forms`, {
      madeFrom: newest(h.report),
      forms: { label: 'The printed wrist mount cracked under load during the handover trial' },
    })
    expect(reply.statusCode).toBe(400)
    expect(reply.body).toContain('at most 5')
    await nothingWasStored()
  })

  /**
   * THE THREE CASES BELOW ASKED THE CUT RULE OF A GIST, and they ask it of the label now. Criterion
   * A14b of design/pointing-reopened/ACCEPTANCE.md made reading length 3 the record's own `summary`
   * column on 3 September 2026, so the door refuses a gist by name before any rule about cutting is
   * reached, and the label is the whole-record form still written here. The rule is unchanged and
   * so is what is asserted: a form that is the opening of what the record says was cut, not
   * written, and the write is refused with nothing stored.
   *
   * THE CUT IS SHORTER THAN IT WAS, and it has to be. A label is two to five words, and a cut over
   * that budget would be refused for its LENGTH — which is a different refusal and would say
   * nothing about cutting. So each cut below is inside the budget, and only the body rule can turn
   * it away.
   */
  it('refuses a label cut from the report itself', async () => {
    const reply = await post(`/api/records/${h.report}/short-forms`, {
      madeFrom: newest(h.report),
      // The first five words of the report's prose, which is inside the label's budget. It is still
      // a cut, and that is what the body rule catches.
      forms: { label: 'What broke Three of four' },
    })
    expect(reply.statusCode).toBe(400)
    expect(reply.body).toContain('is the opening of what this record says')
  })

  it('refuses the same cut with a full stop added, which is how the check used to be walked past', async () => {
    // MEASURED, NOT IMAGINED. The cut rule was a prefix test on the whole flattened string, so
    // appending one character made a mid-sentence truncation pass: an attacker posted the first
    // twenty-four words of a deliberately misleading opening, was refused, added a full stop, and
    // the truncation was stored as the gist and read back as "written from revision 1, and nothing
    // in the record has changed since". The comparison is now over words with the punctuation at
    // each end taken off.
    const { proseOfBlocks } = await import('../src/server/lib/summary.ts')
    const prose = proseOfBlocks(BODY as never)
    const cut = prose.split(/\s+/).slice(0, SHORT_FORM_SPECS.label.maxWords).join(' ')
    expect(cut.split(/\s+/).length, 'inside the label budget, so only the cut rule can refuse it').toBe(
      SHORT_FORM_SPECS.label.maxWords,
    )
    expect(prose.startsWith(cut), 'it really is the opening of the report').toBe(true)

    for (const attempt of [cut, `${cut}.`, `${cut}!`, `${cut} `]) {
      const reply = await post(`/api/records/${h.report}/short-forms`, {
        madeFrom: newest(h.report),
        forms: { label: attempt },
      })
      expect(reply.statusCode, JSON.stringify(attempt)).toBe(400)
      expect(reply.body).toContain('is the opening of what this record says')
    }
    await nothingWasStored()
  })

  it('describes the comparison it really made, and says what that comparison cannot see', async () => {
    // TWO PLACES THAT COULD DISAGREE, AND THIS IS WHAT MAKES THEM AGREE. The refusal ended by saying
    // the comparison flattened spacing and case, which had been true of an earlier prefix test on
    // characters. The check compares WORD SEQUENCES with the punctuation at each end of a word taken
    // off, and the test above proves it by walking the full stop past the old wording. A refusal that
    // names a method the code does not use sends its reader to rewrite the wrong thing.
    const { proseOfBlocks } = await import('../src/server/lib/summary.ts')
    const prose = proseOfBlocks(BODY as never)
    const reply = await post(`/api/records/${h.report}/short-forms`, {
      madeFrom: newest(h.report),
      forms: { label: `${prose.split(/\s+/).slice(0, SHORT_FORM_SPECS.label.maxWords).join(' ')}.` },
    })
    expect(reply.statusCode).toBe(400)
    expect(reply.body, 'the refusal does not say the comparison is over words').toContain('sequences of words')
    expect(reply.body, 'the refusal does not say the punctuation comes off each word').toContain(
      'punctuation at each end of every word taken off',
    )
    // AND THE HONEST LIMIT, which src/shared/zoom.ts states in its header and a person reading a
    // refusal has no reason to know: a cut whose words were edited leaves no trace at all, so
    // getting past this check is not evidence that anything was written.
    expect(reply.body, 'the refusal reads as proof that a form was written rather than cut').toContain(
      'not evidence that a short form was written rather than cut',
    )
  })

  it('refuses a write that names no length at all, rather than answering 200 for nothing', async () => {
    const reply = await post(`/api/records/${h.report}/short-forms`, { madeFrom: newest(h.report), forms: {} })
    expect(reply.statusCode).toBe(400)
    expect(reply.body).toContain('named no length')
  })

  it('answers about one project only', async () => {
    const reply = await get(`/api/records/${h.elsewhere}/short-forms`)
    expect(reply.statusCode).toBe(404)
  })
})
