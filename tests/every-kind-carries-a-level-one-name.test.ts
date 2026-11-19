// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY KIND OF RECORD MAY CARRY A LEVEL-1 NAME, AND NO WRITTEN LEVEL SAYS MORE THAN THE RECORD.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE
 * ---------------------------------------------------------------------------------------
 *
 * Proposal `dYDv5is4UTUJ` was settled. That decision says:
 *
 * It should have been allowed all along, and it is best if every module has reading levels
 * below the length of its own content. Every kind may have reading levels, but take care that none
 * of them says more than the record itself: if the record's own text is already about level-6
 * length, then it has no Full above it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS TRUE BEFORE
 * ---------------------------------------------------------------------------------------
 *
 * Only `module` and `report` declared `data.shortForms`, so a chat link to a problem drew the
 * problem's whole title — twenty words where a name of three would do — and the drawings had no
 * short name to put on a node for a task or a block. Measured on the owner's live page on 5 September and
 * written into the proposal.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE
 * ---------------------------------------------------------------------------------------
 *
 *   a label is accepted on a problem, on a task and on a proposal, through the real write route
 *   the by-part levels are accepted on a report, which holds blocks, and are not declared elsewhere
 *   a level whose words are the opening of the record's own title is refused as a cut
 *   and so is one cut from the title of a report, which holds blocks, or from the summary of a task
 *     that has one (problem 1uVuXgnE8HKS); a report's label that is no cut is stored
 *   a level longer in words than the record itself is refused, and the refusal names both lengths
 *   a record whose own content is as short as a level has no levels above that one
 *
 * MUTATION PROOF for problem 1uVuXgnE8HKS, one line each, after a green control. Each puts back half of
 * the rule as it stood before 5 October 2026, in `refuseAFormCutFromTheRecordsOwnColumns` in src/server/lib/zoom.ts:
 *
 * (a) Add `if (blocksFieldOf(itself.kind) !== null) return` as its first line. The report case goes red.
 * (b) End the `columns` list with `.slice(-1)`, so only the summary is asked where there is one. The case of the
 *     task with a summary goes red.
 *
 * IT DRIVES THE PRODUCT'S OWN SERVER, through `apiApp()`, for the reason the header of
 * tests/zoom-api.test.ts gives: a Fastify instance built here would be green while the real one
 * served none of this.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { KIND_SPECS, kindHoldsPartsLevels } from '../src/shared/kinds.ts'
import { RECORD_KINDS, type RecordKind } from '../src/shared/types.ts'
import { SHORT_FORMS_FIELD } from '../src/shared/zoom.ts'
import { RUNGS, rungsFor, theRecordsOwnWords, type DetailSource } from '../src/shared/detail.ts'

type RevisionsLib = typeof import('../src/server/lib/revisions.ts')

interface Harness {
  t: TestDb
  app: FastifyInstance
  revisions: RevisionsLib
}

/** What an agent's requests carry, so a write is attributed to one rather than to the owner. */
const AS_AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code/builder-bl',
  'x-mole-office-session': 'sess-level-one-names',
}

let h: Harness

/** The office is made once for the file; each case files the records it writes labels to. */
beforeAll(async () => {
  const t = await freshDb()
  const revisions = await import('../src/server/lib/revisions.ts')
  const { app } = await apiApp()
  await app.ready()
  h = { t, app, revisions }
}, 60_000)

afterAll(async () => {
  await h.app.close()
  h.t.close()
})

function post(path: string, payload: InjectOptions['payload']): Promise<LightMyRequestResponse> {
  return h.app.inject({ method: 'POST', url: path, payload, headers: { ...AS_AGENT } })
}

const body = (reply: LightMyRequestResponse): Record<string, unknown> =>
  JSON.parse(reply.body) as Record<string, unknown>

/** The newest entry of a record's ledger: the pair a writer of short forms has to send. */
function newest(recordId: string): { seq: number; contentHash: string } {
  const entry = h.revisions.listRevisions(recordId).revisions[0]
  if (entry === undefined) throw new Error(`record ${recordId} has no revisions`)
  return { seq: entry.seq, contentHash: entry.contentHash }
}

/** A record of one kind, filed by a person, with whatever fields that kind requires. */
function file(kind: RecordKind, title: string, summary: string | null, data: Record<string, unknown>): string {
  return h.t.api.createRecord({
    workspaceId: 'default',
    kind,
    title,
    ...(summary === null ? {} : { summary }),
    data,
    actor: h.t.api.HUMAN,
  }).id
}

/** What the write route says about one record's label. */
function writeLabel(recordId: string, text: string): Promise<LightMyRequestResponse> {
  return post(`/api/records/${recordId}/short-forms`, { madeFrom: newest(recordId), forms: { label: text } })
}

/** A record's stored label, read back out of the record itself rather than out of the reply. */
function storedLabel(recordId: string): unknown {
  const record = h.t.api.getRecord(recordId)
  const forms = (record?.data as Record<string, unknown> | undefined)?.[SHORT_FORMS_FIELD]
  return (forms as Record<string, unknown> | undefined)?.['label']
}

// A REPORT LONG ENOUGH THAT NOTHING BELOW IT IS DROPPED FOR LENGTH: its own words run past every
// budget on the ladder, so all seven rungs stand and the by-part levels have blocks to cover.
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

const PARTS = [
  {
    id: 'p-1',
    heading: 'Why the printed mount cannot be used',
    text30: 'Three of four samples broke below the load the trials need, so the printed part is out.',
    text120:
      'Three of four samples broke below the load the trials need, so the printed part is out. The one that ' +
      'held had been printed at another layer height by mistake and nobody has repeated it.',
    covers: ['b-1', 'b-2'],
  },
]

// ============================================================ the label is accepted on every kind

describe('a level-1 name may be written on any kind of record', () => {
  it('accepts a label on a problem, on a task and on a proposal', async () => {
    // THE THREE KINDS THE PROPOSAL NAMED. Before that decision the write was refused with `shortForms`
    // is not a field of this kind, and a chat link to one of these drew its whole title.
    const problem = file('problem', 'The E-stop in the teleoperation loop does nothing when it is pressed', null, {
      symptom: 'Pressing the software stop sets a flag nothing reads, so the arm keeps its commanded velocity.',
      state: 'open',
    })
    const task = file('task', 'Put the aluminium clamp mount on the bench jig and pull it to failure', null, {
      state: 'todo',
    })
    const proposal = file('proposal', 'Should the bench jig be rebuilt around a load cell instead of the spring gauge?', null, {
      question: 'Should the bench jig be rebuilt around a load cell instead of the spring gauge it uses now?',
      options: ['Rebuild it around a load cell', 'Keep the spring gauge and record its error'],
      who_settles_it: 'the owner',
    })

    for (const [kind, id, label] of [
      ['problem', problem, 'E-stop does nothing'],
      ['task', task, 'Aluminium mount pull test'],
      ['proposal', proposal, 'Load cell for the jig'],
    ] as const) {
      const reply = await writeLabel(id, label)
      expect(reply.statusCode, `${kind}: ${reply.body}`).toBe(200)
      // READ BACK OUT OF THE RECORD, not out of the reply, because a reply is a claim about a write
      // and the record is the write.
      expect(storedLabel(id), `${kind}'s stored label`).toMatchObject({ text: label, writtenBy: 'agent' })
    }
  })

  it('gives every kind a place for one, so no kind is left drawing its whole title', () => {
    const without = RECORD_KINDS.filter((kind) => !KIND_SPECS[kind].fields.some((f) => f.key === SHORT_FORMS_FIELD))
    expect(without, 'kinds with no place for a level-1 name').toEqual([])
  })
})

// ============================================================ the by-part levels need blocks

describe('the levels written by part belong to the kinds that hold blocks', () => {
  it('accepts a set of parts on a report, whose blocks the parts cover', async () => {
    const report = file('report', 'What the bench jig said about the printed clamp mount', null, {
      blocks: LONG_BODY,
      for: THE_TEST_OFFICES_OWNER.name,
      date: '2026-09-05',
    })
    const reply = await post(`/api/records/${report}/short-forms`, {
      madeFrom: newest(report),
      forms: { parts: PARTS },
    })
    expect(reply.statusCode, reply.body).toBe(200)
    const record = h.t.api.getRecord(report)
    const forms = (record?.data as Record<string, unknown>)[SHORT_FORMS_FIELD] as Record<string, unknown>
    expect((forms['parts'] as { parts: unknown[] }).parts).toHaveLength(1)
  })

  it('declares them on the kinds that hold blocks and on no other kind', () => {
    const withBlocks = RECORD_KINDS.filter((kind) => KIND_SPECS[kind].fields.some((f) => f.type === 'SummaryBlock[]'))
    const withParts = RECORD_KINDS.filter((kind) => kindHoldsPartsLevels(kind))
    expect(withParts).toEqual(withBlocks)
    expect(withBlocks, 'the kinds that hold blocks').toEqual(['module', 'report'])
  })

  it('refuses a set of parts on a kind with no blocks, rather than storing one that covers nothing', async () => {
    const task = file('task', 'Order the aluminium clamp mount and book the bench jig for an afternoon', null, {
      state: 'todo',
    })
    const reply = await post(`/api/records/${task}/short-forms`, {
      madeFrom: newest(task),
      forms: { parts: PARTS },
    })
    expect(reply.statusCode, reply.body).toBe(400)
    const said = JSON.stringify(body(reply))
    expect(said, 'the refusal names the key').toContain('parts')
  })
})

// ============================================================ no level says more than the record

describe('no written level says more than the record itself', () => {
  it('refuses a label that is the opening of the record\'s own title', async () => {
    // THE PROPOSAL NAMED THIS AS THE THING TO WATCH once labels existed on every kind: *a label that
    // copies the title's first words is what the owner's POINTING ruling forbade*. A task holds no blocks, so
    // its own words are its own columns and that is what a shorter form of it is compared against.
    const task = file('task', 'Rebuild the bench jig around a load cell before the transplant trials', null, {
      state: 'todo',
    })
    const reply = await writeLabel(task, 'Rebuild the bench jig')
    expect(reply.statusCode, reply.body).toBe(400)
    const said = JSON.stringify(body(reply))
    expect(said, 'the refusal says it was cut').toContain('cutting')
    expect(said, 'the refusal names the field it was cut from').toContain('title')
    expect(storedLabel(task), 'nothing was stored').toBeUndefined()
  })

  it('refuses a label cut from the title of a report, which holds blocks (problem 1uVuXgnE8HKS)', async () => {
    // A REPORT'S OWN WORDS ARE ITS BLOCKS, and until 5 October 2026 its label was compared with them alone.
    // Its title is level 2 all the same, so a label cut from it is a cut.
    const report = file('report', 'What the bench jig said about the printed clamp mount', null, {
      blocks: LONG_BODY,
      for: THE_TEST_OFFICES_OWNER.name,
      date: '2026-09-05',
    })
    const reply = await writeLabel(report, 'What the bench jig')
    expect(reply.statusCode, reply.body).toBe(400)
    const said = JSON.stringify(body(reply))
    expect(said, 'the refusal says it was cut').toContain('cutting')
    expect(said, 'the refusal names the field it was cut from').toContain('own `title`')
    expect(storedLabel(report), 'nothing was stored').toBeUndefined()
    // THE CONTROL: a label on the same report that is no cut of anything is stored.
    const written = await writeLabel(report, 'Printed clamp mount fails')
    expect(written.statusCode, written.body).toBe(200)
    expect(storedLabel(report)).toMatchObject({ text: 'Printed clamp mount fails' })
  })

  it('refuses a label cut from the title of a task that has a summary (problem 1uVuXgnE8HKS)', async () => {
    // A TASK WITH A SUMMARY HAS THE SUMMARY AS ITS OWN WORDS, so the title used to go unasked.
    const task = file(
      'task',
      'Rebuild the bench jig around a load cell before the transplant trials',
      'The jig reads force from a spring scale by eye, which is too coarse for the clamp tests. A load cell under the ' +
        'fixture plate gives a number the logs can hold, and the trials need that before they start.',
      { state: 'todo' },
    )
    const reply = await writeLabel(task, 'Rebuild the bench jig')
    expect(reply.statusCode, reply.body).toBe(400)
    expect(JSON.stringify(body(reply)), 'the refusal names the field it was cut from').toContain('own `title`')
    expect(storedLabel(task), 'nothing was stored').toBeUndefined()
  })

  it('refuses a label longer than the record itself, naming both lengths', async () => {
    // THE RULE: no reading level says more than the record. A record whose own
    // words are two long is a record a five-word name says more than. Both numbers are in the
    // refusal, because a writer told only one of them cannot tell what to change.
    const wanna = file('wanna_try', 'Try the softer jaw pads', null, { why: 'The hard printed jaws drop pots.' })
    // A wanna_try holds no blocks, so its own words are its `summary` column.
    h.t.api.updateRecord(wanna, { summary: 'Softer pads.' }, h.t.api.HUMAN)
    const reply = await writeLabel(wanna, 'Try pads that are softer')
    expect(reply.statusCode, reply.body).toBe(400)
    const said = JSON.stringify(body(reply))
    expect(said, "the level's own length").toContain('5 words')
    expect(said, "the record's length").toContain('is 2,')
    expect(storedLabel(wanna), 'nothing was stored').toBeUndefined()
  })

  it('lets a label of the same length through when the record is longer than it', async () => {
    // THE CONTROL FOR THE LENGTH RULE. The same route, the same kind, a label of the same five
    // words, on a record whose own words run past it.
    const wanna = file('wanna_try', 'Try the softer jaw pads', null, { why: 'The hard printed jaws drop pots.' })
    h.t.api.updateRecord(
      wanna,
      {
        summary:
          'The gripper drops a pot about one time in six on the handover run, and the jaws are the hard printed ' +
          'ones. Softer pads are a few pounds and an afternoon, so they are worth trying before anything else.',
      },
      h.t.api.HUMAN,
    )
    const reply = await writeLabel(wanna, 'Try pads that are softer')
    expect(reply.statusCode, reply.body).toBe(200)
    expect(storedLabel(wanna)).toMatchObject({ text: 'Try pads that are softer' })
  })

  it('lets a Chinese record have a level-1 name, which it could not until 6 September 2026', async () => {
    // RECORDS WRITTEN IN CHINESE COULD NOT HAVE THE NAME A LIST DRAWS.
    // Words were counted by splitting on spaces, so a Chinese title of any length counted as ONE
    // word, and every honest two-to-five-word label said more than the record it shortens. Measured
    // on the live API that day, on message Lko66-X-wTF8: the label "Permissions draft is ready" was
    // refused against the title 权限cluster草稿写好了，四个问题等你 — fourteen characters and one
    // whitespace token. Problem `wq24OKf_dbSw`.
    const task = file('task', '权限cluster草稿写好了，四个问题等你', null, { state: 'todo' })
    const reply = await writeLabel(task, 'Permissions draft is ready')
    expect(reply.statusCode, JSON.stringify(body(reply))).toBe(200)
    expect(storedLabel(task)).toMatchObject({ text: 'Permissions draft is ready' })
  })

  it('takes a Chinese label too, and still refuses one longer than the record', async () => {
    // BOTH DIRECTIONS OF THE SAME COUNT. A Chinese label is judged by the same rule, so a short one
    // goes on and a long one is still refused — otherwise this fix would have taken the rule away
    // for one script rather than made it work in it.
    const task = file('task', '把夹具重新做一遍，装上力传感器，赶在移栽试验之前', null, { state: 'todo' })
    const short = await writeLabel(task, '重做夹具')
    expect(short.statusCode, short.body).toBe(200)
    expect(storedLabel(task)).toMatchObject({ text: '重做夹具' })

    const tiny = file('wanna_try', '软垫', null, { why: '硬夹掉盆。' })
    const tooLong = await writeLabel(tiny, '试试更软的夹爪垫子')
    expect(tooLong.statusCode, tooLong.body).toBe(400)
    expect(JSON.stringify(body(tooLong))).toContain('would say more than')
  })

  it('lets a label through that is not the opening of anything the record holds', async () => {
    // THE CONTROL. The same route, the same kind, a label of the same length, on the same record —
    // so the refusal above is about the comparison rather than about the route refusing every label.
    const task = file('task', 'Rebuild the bench jig around a load cell before the transplant trials', null, {
      state: 'todo',
    })
    const reply = await writeLabel(task, 'Load cell for the jig')
    expect(reply.statusCode, reply.body).toBe(200)
    expect(storedLabel(task)).toMatchObject({ text: 'Load cell for the jig' })
  })
})

// ============================================================ the ladder stops at the record

describe("a record's rungs stop at the length of its own words", () => {
  /** A source for the resolver, with the record's own length counted the way the door counts it. */
  function sourceOf(args: {
    body?: { field: string; prose: string } | null
    summary?: string | null
    title: string
    /** The by-part structure, where this record has one written. */
    parts?: readonly { id: string; heading: string; text30: string; text120: string; covers: string[] }[]
  }): DetailSource {
    const own = theRecordsOwnWords({ body: args.body ?? null, summary: args.summary ?? null, title: args.title })
    return {
      title: args.title,
      summary: args.summary ?? null,
      declaresShortForms: true,
      body: args.body === null || args.body === undefined ? null : { field: args.body.field, written: true },
      ...(args.parts === undefined
        ? {}
        : { shortForms: { parts: { madeFrom: { seq: 1, contentHash: 'aaaa' }, writtenBy: 'agent', parts: args.parts } } }),
      ownWords: own.words,
    }
  }

  /** A written set of parts, for the cases about whether Full still has a job. */
  const WRITTEN_PARTS = [
    {
      id: 'p-1',
      heading: 'Why the printed mount cannot be used',
      text30: 'Three of four samples broke below the load the trials need, so the printed part is out.',
      text120: 'Three of four samples broke below the load the trials need, so the printed part is out.',
      covers: ['b-1'],
    },
  ]

  it('keeps all seven on a record whose own words run past every budget', () => {
    // THE CONTROL. Nothing is taken away from a record long enough to have every level below it.
    const prose = 'word '.repeat(400).trim()
    expect(rungsFor(sourceOf({ title: 'A long report', body: { field: 'data.blocks', prose } }))).toEqual([...RUNGS])
  })

  it('takes Full away from a record whose own words are already about level-6 length', () => {
    // THE RULE: a record already about level-6 length has no Full. Level 6 is at most 120 words for one
    // part, so a record of a hundred words has nothing above it: the whole thing IS the sixth length.
    const prose = 'word '.repeat(100).trim()
    const rungs = rungsFor(
      sourceOf({ title: 'A short report', body: { field: 'data.blocks', prose }, parts: WRITTEN_PARTS }),
    )
    expect(rungs).toEqual(['label', 'title', 'gist', 'outline', 'sketch', 'digest'])
    expect(rungs, 'the page would draw an empty rung above the record').not.toContain('full')
  })

  it('keeps Full on the same record when nobody has written the parts, because nothing else draws it', () => {
    // Full is the record itself, and levels 4 to 6 are the only shorter forms that can stand in for
    // a whole document. Where nobody has written them, taking Full away would leave a reader with
    // rungs that have nothing in them and the report's own blocks drawn nowhere.
    const prose = 'word '.repeat(100).trim()
    const rungs = rungsFor(sourceOf({ title: 'A short report', body: { field: 'data.blocks', prose } }))
    expect(rungs).toContain('full')
  })

  it('stops at the conclusion for a record whose own words fit in one', () => {
    // Thirty words is under the sixty a conclusion may run to, so nothing above the conclusion has
    // anything left to say. Levels 4 to 6 go; Full stays, because it is the record itself and the
    // levels that could have stood in for it are not written.
    const prose = 'word '.repeat(30).trim()
    const rungs = rungsFor(sourceOf({ title: 'A short report', body: { field: 'data.blocks', prose } }))
    expect(rungs).toEqual(['label', 'title', 'gist', 'full'])
  })

  it("never takes away the rungs that are the record's own columns", () => {
    // Levels 2 and 3 ARE the `title` and `summary` columns rather than shorter forms written beside
    // them, and level 1 is the name the record is listed under. A two-word record still has all
    // three: taking one away would say a record does not hold words it does hold.
    const rungs = rungsFor(sourceOf({ title: 'Three word title', body: { field: 'data.blocks', prose: 'It cracked.' } }))
    expect(rungs.slice(0, 3)).toEqual(['label', 'title', 'gist'])
  })

  it('leaves the by-part rungs off a kind that holds no blocks, whatever its length', () => {
    // A part names the blocks it covers, so a kind with no blocks has no levels 4 to 6 and no Full,
    // however long its own words are. That is a fact about the kind rather than about the length.
    const rungs = rungsFor(sourceOf({ title: 'A problem', summary: 'word '.repeat(400).trim() }))
    expect(rungs).toEqual(['label', 'title', 'gist'])
  })

  it('takes nothing away for length when nobody counted the record', () => {
    // ABSENCE BEATS A GUESS. A source built without `ownWords` is one that did not measure, and the
    // honest answer is the whole ladder rather than a ladder cut to a size nobody knows.
    const rungs = rungsFor({ title: 'A report', summary: null, declaresShortForms: true, body: { field: 'data.blocks', written: true } })
    expect(rungs).toEqual([...RUNGS])
  })
})

// ============================================ the refusals name the kind in a word a person reads

