// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BUNDLE SAYS HOW MANY THINGS IT LEFT OUT AND OF WHAT KIND — FOR EVERY BUCKET, NOT ONE OF THEM.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS UNGUARDED, AND HOW IT WAS FOUND
 * ---------------------------------------------------------------------------------------
 *
 * `design/round-ten/verification/wave-12.json`, major:
 *
 * > FOUR OF THE FIVE `leftOut` SENTENCES A REAL PROJECT PRODUCES ARE HELD BY NO TEST. Blanking
 * > `says` for the buckets that come from `openLoopsFor`'s own groups left the wave's own file
 * > green (13/13) and 52 more tests across five other files green. Only the `not_an_open_loop`
 * > bucket this wave adds itself is guarded. On the owner's corpus the export I made carried five
 * > buckets — `finished` (89), `settled` (5), `beyond_reach` (87), `not_linked_to_here` (43),
 * > `not_an_open_loop` (191).
 *
 * The wave-12 test that looks like the guard loops over whatever `leftOut` happens to contain and
 * asserts each `says` is longer than twenty characters. Against a project that produces one bucket
 * that is one assertion, and against a `says` built by concatenating a blank sentence with a list
 * of ids it is an assertion that passes on the defect: `" (m2Q0Cyb, 7k348GH, …)"` is over twenty
 * characters and says nothing about why anything was dropped.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE DOES INSTEAD
 * ---------------------------------------------------------------------------------------
 *
 * It sweeps the DECLARATION. `LEFT_OUT_BUCKETS` in `src/server/lib/openloops.ts` names six, the
 * assembly adds one of its own for a record that was never a candidate, and the governance part
 * adds one for a fork that left the queue without being answered — eight. This file builds a
 * project that produces all eight, and fails when one of them is not seen. So a bucket that stops
 * being produced fails here rather than quietly leaving a sentence nothing reads, and a ninth
 * bucket added to that list is red on the day it is written, in this file, until somebody makes a
 * project that produces it.
 *
 * THE EIGHTH ARRIVED ON 27 AUGUST 2026 and it is why the sweep asks for named parts rather than the
 * `continue` preset: that preset carries no governance part, so a bucket only the governance part
 * can produce could never appear in it.
 *
 * For every bucket seen it asserts three things: the count is real, the SENTENCE the reader
 * declared for that bucket is in `says` word for word, and the same sentence is in the TEXT that
 * leaves the building. The second of those is what a blanked sentence fails and the twenty-
 * character rule does not.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT READS `LEFT_OUT_SENTENCES` RATHER THAN WRITING THE SENTENCES OUT
 * ---------------------------------------------------------------------------------------
 *
 * A test holding its own copy of eight sentences is eight strings that have to be edited twice, and
 * the second edit is the one nobody makes. Reading the declaration means this file cannot disagree
 * with the product about what a bucket says; what it holds instead is the demand that the sentence
 * EXISTS, is not blank, and travels all the way to the text. `tests/machine-words.ts` and
 * `GOVERNANCE_GUARDS` are the same shape of gate for the same reason.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb, governsTheWholeProject } from './helpers.ts'
// TYPE-ONLY AT THE TOP, VALUES INSIDE THE TESTS. `openloops.ts` reaches src/server/db/client.ts,
// which refuses to open a database nobody named — so a value import here would land on that refusal
// before `freshDb()` had a chance to name a throwaway one. `tests/helpers.ts` is written for this
// and `tests/no-test-opens-the-live-corpus.test.ts` walks every file looking for the mistake.
import type { LeftOutBucket } from '../src/server/lib/openloops.ts'

type OpenLoopsApi = typeof import('../src/server/lib/openloops.ts')
let LEFT_OUT_BUCKETS: OpenLoopsApi['LEFT_OUT_BUCKETS']
let LEFT_OUT_SENTENCES: OpenLoopsApi['LEFT_OUT_SENTENCES']
/** Every bucket this product can put in a bundle's `leftOut`. Built once the values are loaded. */
let EVERY_BUCKET: string[]

const BASE_HEADERS = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }

/**
 * EACH CASE GETS ITS OWN PROJECT, so a preview the case asks for holds only the records that case
 * filed. The `recover_project` preset reads the whole project, and a project per case is what keeps
 * one case's records out of another's answer.
 */
let WORKSPACE = 'default'

function theHeaders(): Record<string, string> {
  return { ...BASE_HEADERS, 'x-mole-office-workspace': WORKSPACE }
}

/** The bucket a bundle adds on top of the reader's own six. It is not in LEFT_OUT_BUCKETS. */
const THE_BUNDLE_S_OWN = 'not_an_open_loop'
/** Its sentence, which lives in `leftOutOf` in lib/continuation.ts rather than the reader's table. */
const THE_BUNDLE_S_OWN_WORDS = 'are of kinds that are not open loops at all'
/**
 * AND THE EIGHTH, WHICH THE GOVERNANCE PART ADDS. A fork that something supersedes, or that is a
 * duplicate of another, is taken out of the queue by `readForks` — so it is neither waiting nor
 * settled, and without this bucket it would leave the copy with no account of where it went.
 */
const THE_GOVERNANCE_PART_S_OWN = 'left_the_queue'
const THE_GOVERNANCE_PART_S_WORDS = 'left this queue without being answered'

let t: TestDb
let app: FastifyInstance
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
  const openloops = await import('../src/server/lib/openloops.ts')
  LEFT_OUT_BUCKETS = openloops.LEFT_OUT_BUCKETS
  LEFT_OUT_SENTENCES = openloops.LEFT_OUT_SENTENCES
  EVERY_BUCKET = [...LEFT_OUT_BUCKETS, THE_BUNDLE_S_OWN, THE_GOVERNANCE_PART_S_OWN]
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(async () => {
  caseNumber += 1
  WORKSPACE = `buckets-case-${String(caseNumber)}`
  const made = await app.inject({
    method: 'POST',
    url: '/api/workspaces',
    payload: { id: WORKSPACE, title: `Buckets case ${String(caseNumber)}` },
  })
  expect(made.statusCode, made.body).toBe(201)
})

async function post(url: string, payload: unknown): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'POST', url, payload: payload as object, headers: theHeaders() })
  return { status: res.statusCode, body: res.json() }
}
async function get(url: string): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'GET', url, headers: theHeaders() })
  return { status: res.statusCode, body: res.statusCode < 500 ? res.json() : null }
}

async function file(kind: string, title: string, data: unknown): Promise<string> {
  const made = await post('/api/records', { kind, title, data })
  expect(made.status, `${kind} "${title}": ${JSON.stringify(made.body)}`).toBe(201)
  return made.body.record.id as string
}
async function link(fromId: string, toId: string, type: string): Promise<void> {
  const made = await post('/api/links', { fromId, toId, type })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
}

/**
 * A PROJECT THAT PRODUCES EVERY BUCKET, one record per reason.
 *
 * Each line below exists to be left out for exactly one cause, and the causes are the six the
 * reader declares plus the one the bundle adds. Nothing here is decoration.
 */
async function aProjectThatDropsSomethingForEveryReason(): Promise<string> {
  // where_you_are_standing — the anchor is itself an open loop.
  const anchor = await file('problem', 'The far edge of the tray is not segmented', { symptom: 'It drops it.', state: 'open' })
  // carried, and the chain the reach is measured along.
  const near = await file('task', 'Re-run the segmentation on the near tray', { state: 'doing' })
  await link(near, anchor, 'about')
  // beyond_reach — two and three links out, with reach asked as 1.
  const mid = await file('task', 'Label a hundred more frames', { state: 'doing' })
  await link(mid, near, 'about')
  const far = await file('task', 'Buy a second tray', { state: 'doing' })
  await link(far, mid, 'about')
  // finished — its own state word says the work ended.
  const done = await file('task', 'Fit the new lens', { state: 'done' })
  await link(done, anchor, 'about')
  // not_linked_to_here — no chain of links joins it to the anchor at all.
  await file('task', 'Write the handover note', { state: 'doing' })
  // settled — a fork with a decision linked to it. `readForks` decides this, not the bundle.
  const fork = await file('proposal', 'Should the tray be re-textured or replaced?', {
    question: 'Should the tray be re-textured or replaced?',
    options: ['Re-texture the pads.', 'Replace the tray.'],
  })
  await link(fork, anchor, 'about')
  const decided = await file('decision', 'Re-texture the pads', {
    ...governsTheWholeProject(), replaces: [],
    decided_on: '2026-08-26',
    because: 'Changing the tray and the controller in one week makes a regression impossible to attribute.',
    option_taken: 're-texture the pads',
    option_index: 0,
  })
  await link(decided, fork, 'derived_from')
  // not_an_open_loop — a kind that was never a candidate.
  await file('module', 'Wrist camera intake', { context: 'Where frames enter the pipeline.' })
  // shelved — a direction somebody stopped and kept, so it is neither finished nor open work.
  // Criterion S1; it is linked to the anchor so it is inside the reach and the bucket is the shelf's.
  const shelved = await file('direction', 'A line of work that was stopped and kept', {
    depth: 'read',
    shelved: {
      since: '2026-09-11',
      because: 'The design was over-built before any real need, so it was stopped on purpose.',
      restart_when: 'nothing named',
    },
  })
  await link(shelved, anchor, 'about')
  // left_the_queue — a fork nobody has to answer, because a newer one replaced it.
  const replaced = await file('proposal', 'Is the tray the thing to change at all?', {
    question: 'Is the tray the thing to change at all?',
    options: ['Change the tray.', 'Change the pads.'],
  })
  const replacing = await file('proposal', 'The tray question, with the two concerns apart', {
    question: 'Which of the two tray concerns is being asked about?',
    options: ['The grip.', 'The depth.'],
  })
  await link(replacing, replaced, 'supersedes')
  return anchor
}

/** Every bucket in one preview, by name. */
type LeftOut = { bucket: string; count: number; says: string }
async function previewOf(url: string): Promise<{ leftOut: LeftOut[]; text: string }> {
  const preview = await get(url)
  expect(preview.status, JSON.stringify(preview.body)).toBe(200)
  return { leftOut: preview.body.leftOut as LeftOut[], text: String(preview.body.text) }
}

describe('every bucket a bundle can leave something in says what that something was', () => {
  it('produces every bucket, so the sweep below is over the whole declaration', async () => {
    // THE CONTROL, AND IT IS THE POINT OF THE FILE. Every assertion after this is of the form
    // "each bucket present says its own sentence", which is trivially true of a project that
    // produces one bucket. This is what makes the sweep a sweep.
    const anchor = await aProjectThatDropsSomethingForEveryReason()
    // A budget at the floor the route allows, so the shortest whole answer is still over it and
    // `quiet_the_longest` — the only bucket that needs a size to happen — is produced.
    const tight = await previewOf(`/api/bundles/preview?scope=${anchor}&preset=custom&slots=objective,openLoops,waitingOnYou,validityLimits&reach=1&budgetBytes=512`)
    const seen = new Set(tight.leftOut.map((one) => one.bucket))
    expect(
      EVERY_BUCKET.filter((bucket) => !seen.has(bucket)),
      'this project must produce every bucket, or the sweep below is not over all of them',
    ).toEqual([])
  })

  it('carries the reader’s own sentence for every bucket, word for word', async () => {
    const anchor = await aProjectThatDropsSomethingForEveryReason()
    const { leftOut } = await previewOf(`/api/bundles/preview?scope=${anchor}&preset=custom&slots=objective,openLoops,waitingOnYou,validityLimits&reach=1&budgetBytes=512`)
    for (const bucket of EVERY_BUCKET) {
      const group = leftOut.find((one) => one.bucket === bucket)
      expect(group, `no ${bucket} group in this preview`).toBeDefined()
      const says = String(group?.says)
      expect(group?.count, `${bucket} counted nothing`).toBeGreaterThan(0)
      // THE ASSERTION THE TWENTY-CHARACTER RULE DID NOT MAKE. A blanked sentence concatenated with
      // a list of ids is long and says nothing; this reads the declaration and demands it be there.
      const declared =
        bucket === THE_BUNDLE_S_OWN
          ? THE_BUNDLE_S_OWN_WORDS
          : bucket === THE_GOVERNANCE_PART_S_OWN
            ? THE_GOVERNANCE_PART_S_WORDS
            : LEFT_OUT_SENTENCES[bucket as LeftOutBucket]
      expect(declared.length, `${bucket} declares a blank sentence`).toBeGreaterThan(20)
      expect(says, `${bucket} does not say why it was left out`).toContain(declared)
    }
  })

  it('prints every one of those sentences in the text that leaves the building', async () => {
    // A `leftOut` ARRAY IN THE JSON IS NOT THE PRODUCT. The outside agent is handed TEXT and can
    // ask no follow-up: a bucket named only in a reply nobody reads is a bucket that was not named.
    const anchor = await aProjectThatDropsSomethingForEveryReason()
    const { leftOut, text } = await previewOf(`/api/bundles/preview?scope=${anchor}&preset=custom&slots=objective,openLoops,waitingOnYou,validityLimits&reach=1&budgetBytes=512`)
    expect(text).toContain('WHAT IS NOT IN THIS TEXT')
    for (const group of leftOut) {
      expect(text, `"${group.bucket}" is in the JSON and not in the text`).toContain(group.says)
    }
  })

  it('names what it dropped for the bucket whose records a person would go and look at', async () => {
    // NEVER A BARE COUNT is the rule, and for `quiet_the_longest` a count is worse than bare: the
    // records were dropped for SIZE rather than for anything about them, so a reader who wants one
    // has to be able to find it.
    //
    // THE IDS USED TO BE APPENDED TO THE SENTENCE IN BRACKETS, WITH NOTHING BESIDE THEM. That was
    // almost the whole of problem `F2NxzxAnRkb2`: 898 bare ids and half the text of a small copy.
    // They are their own field now and the text names each record — its title, its kind and its id
    // — for as many as the room allows, which is a reference somebody can use rather than a name
    // for a thing they have nothing about. Criterion B13 of design/bundle/ACCEPTANCE.md.
    const anchor = await aProjectThatDropsSomethingForEveryReason()
    const { leftOut, text } = await previewOf(`/api/bundles/preview?scope=${anchor}&preset=custom&slots=objective,openLoops,waitingOnYou,validityLimits&reach=1&budgetBytes=512`)
    const dropped = leftOut.find((one) => one.bucket === 'quiet_the_longest')
    expect(dropped).toBeDefined()
    const ids = (dropped as { ids?: string[] }).ids ?? []
    expect(ids.length, 'the bucket dropped records for size and named none of them').toBeGreaterThan(0)
    // AND THE SENTENCE ITSELF NO LONGER CARRIES THEM.
    for (const id of ids) expect(String(dropped?.says)).not.toContain(id)
    // AND THE TEXT PRINTS NO BARE ID. At 512 bytes — the floor this route allows — there is no room
    // even for the names, and the text says exactly that rather than falling back to a list of ids.
    // Where there IS room the names are printed; that is asserted in
    // tests/a-copy-under-budget-is-not-a-list-of-ids.test.ts, which has a corpus big enough to show
    // both sides.
    for (const id of ids) {
      const line = text.split('\n').find((one) => one.includes(id))
      if (line === undefined) continue
      expect(line.replace(id, '').trim().length, `${id} is printed with nothing beside it`).toBeGreaterThan(10)
    }
    expect(text).toContain('an id with nothing beside it is a name for a thing you have nothing about')
  })

  it('says nothing about a bucket it did not use, so a sentence is never printed on nothing', async () => {
    // THE OTHER DIRECTION. A project with one open loop and nothing else subtracts almost nothing,
    // and a reader that printed all eight sentences with a zero beside them would pass every
    // assertion above while telling a stranger six untrue things.
    await file('problem', 'The only thing here', { symptom: 'x', state: 'open' })
    const { leftOut, text } = await previewOf('/api/bundles/preview?preset=recover_project')
    expect(leftOut.every((one) => one.count > 0), 'a bucket with nothing in it must not be reported').toBe(true)
    const absent = EVERY_BUCKET.filter((b) => !leftOut.some((one) => one.bucket === b))
    expect(absent.length, 'this project must leave some bucket unused, or this test asserts nothing').toBeGreaterThan(0)
    for (const bucket of absent) {
      if (bucket === THE_BUNDLE_S_OWN) continue
      const sentence = LEFT_OUT_SENTENCES[bucket as LeftOutBucket]
      expect(text, `"${bucket}" was not used and its sentence is in the text anyway`).not.toContain(sentence)
    }
  })
})
