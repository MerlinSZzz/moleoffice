// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COMMENT WRITTEN BELOW FULL REACHES THE AGENT IT WAS WRITTEN TO.
 *
 * A comment written below Full to a chosen agent was refused on send with "Nothing was written. There is no
 * part of a record to point at …"; at Full it could be sent, but no answer came and it was not in the
 * conversation with that agent. Criterion M16 of design/messages/ACCEPTANCE.md section 9; problem
 * `Kyr3b1hr3jjR`.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO FAULTS, WHICH ARE INDEPENDENT AND BOTH HELD HERE
 * ---------------------------------------------------------------------------------------
 *
 * 1. THE DOOR REFUSED A PART. The region tree derived for a record held the three written short
 *    forms and nothing else, so every part target the page hands out at levels 4, 5 and 6 resolved
 *    to `gone` and the write door answered "There is no part of a record to point at". The page had
 *    been putting a well-formed target on every drawn part the whole time; the two disagreed and
 *    nothing failed until somebody pressed send.
 *
 * 2. THE CHOSEN AGENT WAS NOT ON THE COMMENT. The composer wrote the comment with a body and a
 *    target and no recipient of any kind, and sent the choice only into the agent thread beside it.
 *    A message with no delivery rows was then caught by the start-up backfill and given one row
 *    addressed to the owner — so a comment written to an agent read as addressed to the owner, was in
 *    no conversation, and no run was ever started for it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE TARGET IS TAKEN OFF A REAL PAGE
 * ---------------------------------------------------------------------------------------
 *
 * The whole fault was the page and the server disagreeing about one id. A test that spelled the
 * part id itself would prove the server accepts an id this test knows how to write, which is not the
 * question. So the browser cases read the target off the element a reader really right-clicks, at
 * level 3 and at level 6, and put THAT through the real write door.
 *
 * ---------------------------------------------------------------------------------------
 * THE CONTROL
 * ---------------------------------------------------------------------------------------
 *
 * Each browser case first asserts that the page drew something with a target on it. A page that drew
 * nothing would otherwise pass every "the door accepted it" claim by never asking the door.
 */

import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp, thePersonsKeyHeader } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { findRegion, partRegionId, recordRegionsOf } from '../src/shared/regions.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import { targetFromAttributeValue } from '../src/shared/targets.ts'
import { levelLabel, positionOf, READER_RUNGS } from '../src/shared/detail.ts'
import type { Rung } from '../src/shared/detail.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The parts of the report, written by hand so this file knows what the page should draw. */
const PARTS = [
  {
    id: 'p-1',
    heading: 'What the wrist camera measured',
    text30: 'The wrist camera held its fit at 0.4 px across forty trials.',
    text120: 'The wrist camera held its fit at 0.4 px across forty trials, with no drift after the mount was shimmed.',
    covers: ['b-1', 'b-2'],
  },
  {
    id: 'p-2',
    heading: 'What is still open',
    text30: 'The mount has not been tried on the second arm.',
    text120: 'The mount has not been tried on the second arm, and nothing says whether the shim fits that one.',
    covers: ['b-3'],
  },
]

let reportId = ''
let sessionId = ''
/** The registry id the agent was given. It is not its handle, and a message stores this id. */
let agentId = ''

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<Response> {
  return fetch(`${app.api}${url}`, { method: 'POST', headers, body: JSON.stringify(body) })
}

/** Write one comment through the real door, with the target the page handed out. */
async function comment(target: unknown, chosen: unknown): Promise<Response> {
  return post('/api/records', AS_THE_OWNER, {
    kind: 'message',
    title: 'A remark on this part',
    data: {
      body: 'This part needs the second arm before it can stand.',
      target,
      ...(chosen === undefined ? {} : { chosenRecipient: chosen }),
    },
  })
}

/** What the panel would draw in the conversation between the person and the agent. */
interface Said {
  id: string
  body: string
  to: { kind: string; id: string }[]
  notSentYet: boolean
  deliveries: { mark: string; run: string | null }[]
}

async function theConversation(): Promise<Said[]> {
  const got = await fetch(`${app.api}/api/messages/conversation?kind=agent&id=pointing-agent`, {
    headers: AS_THE_OWNER,
  })
  expect(got.status, await got.clone().text()).toBe(200)
  return ((await got.json()) as { messages: Said[] }).messages
}

/**
 * The target on the first thing the page drew that a reader can right-click, at this reading level.
 *
 * `[data-target]:not(:has([data-target]))` is the innermost addressable thing, which is what the
 * pointing layer resolves a press to.
 */
async function whatThePageOffersToPointAt(rung: Rung, within: string): Promise<unknown> {
  await app.page.goto(`${app.site}/#/r/${reportId}`)
  await waitForThePage(app.page, 30_000)
  // THE READING LENGTH IS SET THE WAY A READER SETS IT, by pressing the control on the page. A
  // storage key written from here would be this test deciding what the control does.
  // THE CONTROL ON THE REPORT ITSELF, which is the last one on the page: the settings grid draws a
  // preview with a control of its own, disabled at the position it is previewing.
  const label = app.page.locator('.sb-level-label').last()
  const shorter = app.page.locator('.sb-level-step[aria-label="One level shorter"]').last()
  const longer = app.page.locator('.sb-level-step[aria-label="One level longer"]').last()
  const wanted = levelLabel(rung)
  // WHICH WAY TO PRESS IS WORKED OUT FROM THE LADDER, not assumed. A choice made for this visit
  // outlives the page, so the level this page opens at is wherever the case before it left it.
  const wantedAt = positionOf(rung)
  const nameOf = new Map(READER_RUNGS.map((one) => [levelLabel(one), positionOf(one)]))
  await label.waitFor({ timeout: 20_000 })
  for (let press = 0; press < 10; press += 1) {
    const said = (await label.textContent()) ?? ''
    if (said === wanted) break
    const at = nameOf.get(said)
    expect(at, `the reading length control says "${said}", which is not a position on the ladder`).not.toBeUndefined()
    await ((at ?? 0) > wantedAt ? shorter : longer).click({ timeout: 20_000 })
    await app.page.waitForTimeout(150)
  }
  expect(await label.textContent(), 'the reading length control did not reach that level').toBe(wanted)
  await app.page.waitForSelector(within, { timeout: 20_000 })
  // A PART CARRIES ITS OWN TARGET AND HOLDS NONE INSIDE IT, so asking for the innermost addressable
  // thing under `.sb-part` would find nothing; the part IS the element with the target on it.
  // SOME SELECTORS NAME THE THING ITSELF AND SOME NAME WHAT IT IS INSIDE. A part carries its own
  // target and holds none inside it, so asking for the innermost addressable thing under `.sb-part`
  // would find nothing. The report's own opening words are the same: the element IS the target.
  const itself = ['.sb-part', '.sb-open-line'].includes(within)
  const said = await app.page.$eval(
    itself ? `${within}[data-target]` : `${within} [data-target]:not(:has([data-target]))`,
    (one) => one.getAttribute('data-target'),
  )
  expect(said, `nothing under ${within} at ${wanted} could be pointed at`).not.toBeNull()
  // THE ATTRIBUTE IS THE COMPACT FORM THE PAGE WRITES, and this is the reader the pointing layer
  // itself uses. Parsing it any other way here would be a second reader of one grammar.
  const read = targetFromAttributeValue(said ?? '')
  expect(read, `the target on the page at ${wanted} could not be read back`).not.toBeNull()
  return { ...read, place: { at: 'surface' } }
}

beforeAll(async () => {
  app = await liveApp({ name: 'comment-below-full', viewport: { width: 1440, height: 1000 } })

  const filed = await post('/api/records', AS_THE_OWNER, {
    kind: 'agent',
    title: 'The POINTING agent',
    data: { handle: 'pointing-agent', runtime: 'claude-code', state: 'active' },
  })
  expect(filed.status, await filed.text()).toBe(201)
  const listed = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  const agents = ((await listed.json()) as { agents?: { id: string; handle: string }[] }).agents ?? []
  agentId = agents.find((one) => one.handle === 'pointing-agent')?.id ?? ''
  expect(agentId, 'the pointing agent has no registry row').not.toBe('')

  // A RUN OF THAT AGENT. The composer picks a run, not a durable agent, so a run that says which
  // agent it worked as is what the choice has to be resolvable through.
  const ran = await post('/api/records', { ...AS_THE_OWNER, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) }, {
    kind: 'session',
    title: 'The POINTING run',
    data: {
      state: 'idle',
      runtime: 'claude-code',
      doing: 'the pointing work',
      ranAs: [{ workspaceId: 'default', agentId: 'pointing-agent' }],
    },
  })
  expect(ran.status, await ran.clone().text()).toBe(201)
  sessionId = ((await ran.json()) as { record: { id: string } }).record.id

  const report = await post('/api/records', AS_THE_OWNER, {
    kind: 'report',
    title: 'The wrist camera fit',
    summary: 'What the wrist camera measured and what is still open.',
    data: {
      blocks: [
        { id: 'b-1', type: 'text', text: 'The wrist camera was mounted and forty trials were run.' },
        { id: 'b-2', type: 'text', text: 'The fit held at 0.4 px with no drift after the mount was shimmed.' },
        // LONG ENOUGH THAT THE REPORT HAS EVERY POSITION ON THE LADDER. A record whose own words are
        // already as short as one of the reading levels has no levels above that one, since
        // 5 September 2026, so three short lines would leave this file with no by-part level to
        // point at. It is the third block made longer rather than a fourth block added, because every
        // block has to be covered by exactly one part and a fourth would have wanted a third part.
        {
          id: 'b-3',
          type: 'text',
          text:
            'The second arm has not been tried, and nothing says whether the shim fits it. Its mount is the ' +
            'same part number and was printed in the same batch, but nobody has measured the depth of its ' +
            'bolt circle, and the first arm needed a 0.2 mm brass washer to hold 0.4 px across forty trials. ' +
            'Two afternoons on the bench would answer it. Until somebody spends them, the number in this ' +
            'report is about one arm, and reading it as a fact about the pair is the mistake this paragraph ' +
            'exists to prevent.',
        },
      ],
    },
  })
  expect(report.status, await report.clone().text()).toBe(201)
  reportId = ((await report.json()) as { record: { id: string } }).record.id

  const versions = await fetch(`${app.api}/api/records/${reportId}/revisions`, { headers: AS_THE_OWNER })
  expect(versions.status, await versions.clone().text()).toBe(200)
  const held = ((await versions.json()) as { revisions: { seq: number; contentHash: string }[] }).revisions
  const newest = held[0]
  if (newest === undefined) throw new Error('the report was filed with no revision')
  const forms = await post(`/api/records/${reportId}/short-forms`, AS_THE_OWNER, {
    madeFrom: { seq: newest.seq, contentHash: newest.contentHash },
    forms: {
      label: 'Camera fit at the wrist',
      parts: PARTS,
    },
  })
  expect(forms.status, await forms.text()).toBe(200)
}, 240_000)

afterAll(async () => {
  await app.stop()
})

describe('the door accepts a part of a report', () => {
  it('derives a region for every part, carrying the blocks that part stands for', async () => {
    const held = await fetch(`${app.api}/api/records/${reportId}`, { headers: AS_THE_OWNER })
    expect(held.status, await held.clone().text()).toBe(200)
    const record = ((await held.json()) as { record: PanelRecord }).record
    const tree = recordRegionsOf({
      kind: record.kind,
      title: record.title,
      summary: record.summary,
      data: record.data,
      relations: [],
    })
    const part = findRegion(tree, partRegionId('p-1'))
    expect(part, 'the derived regions hold no part of the by-part summary').not.toBeNull()
    expect(part?.text, 'the part region does not hold the heading the reader sees').toBe(PARTS[0]?.heading)
    expect(part?.covers, 'the part does not carry the blocks it stands for').toEqual(['b-1', 'b-2'])
    expect(findRegion(tree, partRegionId('p-2'))?.covers).toEqual(['b-3'])
  }, 120_000)

  it('takes a comment whose target is a part, where it used to answer that there is none', async () => {
    const wrote = await comment(
      { target: { kind: 'region', recordId: reportId, regionId: partRegionId('p-1') }, place: { at: 'surface' } },
      undefined,
    )
    const said = await wrote.clone().text()
    expect(said, 'the door still says there is no part of a record to point at').not.toContain(
      'no part of a record to point at',
    )
    expect(wrote.status, said).toBe(201)
  }, 120_000)

  it('still refuses a part that is not on the record, rather than taking any id at all', async () => {
    const wrote = await comment(
      { target: { kind: 'region', recordId: reportId, regionId: partRegionId('p-never-written') }, place: { at: 'surface' } },
      undefined,
    )
    expect(wrote.status).toBe(404)
    expect(await wrote.text()).toContain('no part of a record to point at')
  }, 120_000)
})

describe('the recipient chosen in the composer is who the comment is addressed to', () => {
  it('addresses it to the agent the chosen run worked as, and puts it in that conversation', async () => {
    const before = (await theConversation()).length
    const wrote = await comment(
      { target: { kind: 'region', recordId: reportId, regionId: partRegionId('p-2') }, place: { at: 'surface' } },
      { kind: 'session', sessionId },
    )
    // THE UNHELD 409 (decision 60sbc5I-bwKx): the chosen agent has a run recorded and nothing holding it, so the
    // person's comment is stored and routed and answers the error. The conversation still holds it.
    expect(wrote.status, await wrote.clone().text()).toBe(409)
    const id = ((await wrote.json()) as { record: { id: string } }).record.id

    const read = await fetch(`${app.api}/api/messages/${id}`, { headers: AS_THE_OWNER })
    expect(read.status).toBe(200)
    const message = ((await read.json()) as { message: { to: { kind: string; id: string }[] } }).message
    expect(message.to, 'the comment was not addressed to the agent the owner chose').toEqual([
      { kind: 'agent', id: agentId },
    ])

    const after = await theConversation()
    expect(after.length, 'the comment is not in the conversation with that agent').toBe(before + 1)
    expect(after.some((one) => one.id === id)).toBe(true)
  }, 120_000)

  it('keeps what the owner chose beside what it was taken to mean', async () => {
    const wrote = await comment(
      { target: { kind: 'region', recordId: reportId, regionId: partRegionId('p-2') }, place: { at: 'surface' } },
      { kind: 'session', sessionId, said: 'the POINTING one', why: 'it wrote this report' },
    )
    expect(wrote.status, await wrote.clone().text()).toBe(409)
    const id = ((await wrote.json()) as { record: { id: string } }).record.id
    const held = await fetch(`${app.api}/api/records/${id}`, { headers: AS_THE_OWNER })
    const data = ((await held.json()) as { record: { data: Record<string, unknown> } }).record.data
    expect(data['chosenRecipient'], 'the owner’s own choice was thrown away once it was resolved').toMatchObject({
      kind: 'session',
      sessionId,
      said: 'the POINTING one',
    })
  }, 120_000)

  it('addresses it to nobody when the choice names no agent that exists, and never to the owner', async () => {
    const wrote = await comment(
      { target: { kind: 'region', recordId: reportId, regionId: partRegionId('p-1') }, place: { at: 'surface' } },
      { kind: 'new' },
    )
    expect(wrote.status, await wrote.clone().text()).toBe(201)
    const id = ((await wrote.json()) as { record: { id: string } }).record.id
    const read = await fetch(`${app.api}/api/messages/${id}`, { headers: AS_THE_OWNER })
    const message = ((await read.json()) as { message: { to: { kind: string; id: string }[] } }).message
    expect(message.to, 'a comment nobody could be found for was addressed to the owner').toEqual([])
  }, 120_000)
})

describe('the page and the door agree about what was pointed at', () => {
  it('sends a comment on the report’s own words at level 3, the reading the owner could already use', async () => {
    // IT USED TO POINT AT THE READING-LENGTH CONTROL. The case took the first `[data-target]` under
    // `.sb-reads` that held no other, and `.sb-level` sits inside `.sb-reads` before the report's
    // own words — so it pointed at `uiSurface/report.readas` and asserted nothing about what it had
    // got. It would have stayed green if the report body had stopped being pointable at level 3,
    // which is half of what M16 is about. Problem `NHsiJOB_1PZl`.
    const target = await whatThePageOffersToPointAt('gist', '.sb-open-line')
    // THE CONTROL AND THE POINT OF THE CASE AT ONCE, the way the level 6 case does it: this asserts
    // the page really is offering the report's own words, not a part of Mole Office's own screen.
    expect(JSON.stringify(target), 'the page at level 3 offered nothing that is part of the report').toContain(
      'section.summaryLine',
    )
    expect(JSON.stringify(target), 'what the page offered does not belong to this report').toContain(reportId)

    const wrote = await comment(target, { kind: 'session', sessionId })
    const said = await wrote.clone().text()
    expect(said).not.toContain('no part of a record to point at')
    expect(wrote.status, said).toBe(409)

    const id = ((await wrote.json()) as { record: { id: string } }).record.id
    const after = await theConversation()
    expect(after.some((one) => one.id === id), 'the comment written at level 3 is in no conversation').toBe(true)
  }, 180_000)

  // 'sketch' became 'digest' on 16 September 2026: the control offers a
  // reader exactly Conclusion, Level 6 and Full, so Level 5 is no longer a level the page's own
  // control reaches; the deepest by-part level the page offers a reader is Level 6. The part drawn
  // there carries the same target a part drawn at Level 5 carries — `partRegionId` holds no level.
  it('sends a comment on the part the page draws at level 6, which used to be refused', async () => {
    const target = await whatThePageOffersToPointAt('digest', '.sb-part')
    // THE CONTROL AND THE POINT OF THE CASE AT ONCE: at a by-part level the innermost addressable
    // thing on the page is a part, so this asserts the page really is offering one.
    expect(JSON.stringify(target), 'the page at level 6 offered nothing that is a part of a report').toContain(
      'shortForms',
    )
    const wrote = await comment(target, { kind: 'session', sessionId })
    const said = await wrote.clone().text()
    expect(said, 'the door refused a part the reader can see on the page').not.toContain(
      'no part of a record to point at',
    )
    expect(wrote.status, said).toBe(409)

    const id = ((await wrote.json()) as { record: { id: string } }).record.id
    const after = await theConversation()
    expect(after.some((one) => one.id === id), 'the comment written at level 6 is in no conversation').toBe(true)
  }, 180_000)
})

// ==================== a comment written DURING A REVIEW says who it is for, at level 3 and level 6

/**
 * WHILE A REVIEW COLLECTS, A COMMENT MAY STILL SAY WHO IT IS FOR — AND IT IS IN THAT CONVERSATION.
 *
 * Criterion M28: during a review, several comments left for one agent all have to be shown, and shown
 * as unsent. A review is how the owner leaves several comments for one agent, so the composer has to
 * let the owner name the agent while writing. Until 5 September 2026 it did not: with a review collecting
 * the box collapsed to one press, "Add to review", with no way to address anybody. The state
 * criterion M28 describes could not be reached from the interface at all. Problem `6W833RRq8iX4`.
 *
 * THIS IS DRIVEN THROUGH THE PAGE, at the two reading lengths the rest of this file uses, because
 * the fault was in what the composer drew and not in what the door accepted.
 */
describe('a comment written while a review is collecting', () => {
  /** The review that is collecting over the whole project while these cases run. */
  let reviewId = ''

  beforeAll(async () => {
    const started = await post('/api/reviews', AS_THE_OWNER, {
      entry: { target: { kind: 'record', recordId: reportId, workspaceId: 'default' }, place: { at: 'surface' } },
    })
    expect(started.status, await started.clone().text()).toBe(201)
    reviewId = ((await started.json()) as { review: { id: string } }).review.id
  }, 120_000)

  afterAll(async () => {
    // LEFT FINISHED RATHER THAN COLLECTING, so nothing after this file inherits an open review.
    await post(`/api/reviews/${reviewId}/finish-collecting`, AS_THE_OWNER, {})
  })

  /**
   * RIGHT-CLICK WHAT THE PAGE DREW, NAME THE AGENT, AND ADD IT TO THE REVIEW.
   *
   * Every step is a press a person makes. The recipient is chosen through the box's own control,
   * which is the thing that did not exist, and the words are kept with Add to review, the box's second
   * press while a review collects over this report.
   */
  async function writeOneThroughThePage(rung: Rung, within: string, words: string): Promise<void> {
    await whatThePageOffersToPointAt(rung, within)
    const itself = ['.sb-part', '.sb-open-line'].includes(within)
    const where = itself ? `${within}[data-target]` : `${within} [data-target]:not(:has([data-target]))`
    await app.page.locator(where).first().click({ button: 'right', timeout: 20_000 })
    const box = app.page.getByRole('dialog', { name: 'Talk about this' })
    await box.waitFor({ timeout: 30_000 })
    // The composer asks Mole Office two questions when it opens. Long enough for both to answer.
    await app.page.waitForTimeout(1_500)

    await box.locator('textarea').first().fill(words)

    // WHO IT IS FOR NOT ASKED ANY MORE. Criterion W4, on the owner’s words of 16 September 2026: the panel
    // is contact based — its send names a contact and goes; keeping asks nobody. The comments are
    // named for what they are about and held with no reader.
    // ADD TO REVIEW IS THE KEEPING PRESS WHILE A REVIEW COLLECTS HERE. Until wave 13x round 22 this
    // pressed Start review, which came back to the review already collecting and said "This comment
    // is in your review of this page". Since round 22 (problem 6yMD5gal_oXz, the secretary's y_Vqv-Kab1Ga)
    // the box draws Add to review in its place, which starts nothing: the comment is in the review
    // that collects over this report, and the frame says so. Nothing is sent. The last case reads
    // that review back from the server.
    await box.getByRole('button', { name: 'Add to review', exact: true }).click({ timeout: 20_000 })
    // THE FRAME IS RETITLED "Written down" after the write, so it is found by its sentence and not
    // by the dialog's first name.
    const said = app.page.locator('.px-talk-said [data-part="in-the-review"]')
    await said.waitFor({ timeout: 30_000 })
    expect(await said.textContent(), 'the frame does not say the comment is in the review').toBe(
      'This comment is in your review. Nothing has been sent.',
    )
  }

  const AT_LEVEL_THREE = 'While reviewing, this line needs the second arm before it can stand.'
  const AT_LEVEL_SIX = 'While reviewing, this part is the one the second arm has not been tried on.'

  /**
   * ADDRESSED, IN THE CONVERSATION, AND STILL UNSENT — all three, and the third is the one M28 is
   * about: every comment shown, and shown as unsent.
   *
   * IT IS MEASURED TWICE, TWO SECONDS APART. Until 5 September 2026 naming the agent sent the
   * comment: verifier 5 read it unsent at 40 ms and at 1040 ms and delivered with a run on it at
   * 1813 ms. A single read straight after the press would have passed on that build, which is why
   * this waits — an unsent state that does not last is not the state M28 asks for. Problem
   * `g4M_z6965R5o`.
   */
  /**
   * HELD, AND STILL UNSENT — the press wrote the comment and nothing else happened to it.
   *
   * IT IS MEASURED TWICE, THREE SECONDS APART. The measured fault this guards against was a write
   * whose reader changed behind the press. Nothing on this panel hands a note to a run, so a second
   * reading that found a delivery row or a run would be the product doing something behind a press
   * that said otherwise.
   */
  async function assertItIsHeldUnsent(words: string, at: string): Promise<void> {
    const started = Date.now()
    /** Every reading taken, so a failure says what was seen and when rather than only that it failed. */
    const readings: { ms: number; notSentYet: boolean; to: unknown[]; deliveries: unknown[] }[] = []
    let seen: { notSentYet: boolean; to: unknown[]; deliveries: unknown[] } | undefined

    for (let tries = 0; tries < 50 && seen === undefined; tries += 1) {
      seen = (await savedComments()).find((row) => row.body === words)
      if (seen === undefined) await new Promise((done) => setTimeout(done, 400))
    }
    expect(seen, `the comment written at ${at} never reached the pool`).toBeDefined()

    for (let tries = 0; tries < 8; tries += 1) {
      const one = (await savedComments()).find((row) => row.body === words)
      expect(one, `the comment written at ${at} left the pool again`).toBeDefined()
      readings.push({
        ms: Date.now() - started,
        notSentYet: one?.notSentYet ?? false,
        to: one?.to ?? [],
        deliveries: one?.deliveries ?? [],
      })
      await new Promise((done) => setTimeout(done, 400))
    }

    const what = JSON.stringify(readings)
    expect(seen?.to, `at ${at} the saved comment named a reader it was never sent to: ${what}`).toEqual([])
    for (const reading of readings) {
      expect(
        reading.deliveries,
        `at ${at} the saved comment has a delivery row: ${what}`,
      ).toEqual([])
      expect(reading.notSentYet, `at ${at} the comment stopped being drawn unsent: ${what}`).toBe(true)
    }
  }

  /** Every saved comment in the pool, in the parts this file reads. */
  async function savedComments(): Promise<
    { body: string; notSentYet: boolean; to: unknown[]; deliveries: unknown[] }[]
  > {
    const got = (await readCommentsPool()) as {
      messages: {
        body: string
        notSentYet?: boolean
        to?: unknown[]
        deliveries?: unknown[]
      }[]
    }
    return got.messages
      .filter((one) => one.notSentYet === true)
      .map((one) => ({
        body: one.body,
        notSentYet: true,
        to: one.to ?? [],
        deliveries: one.deliveries ?? [],
      }))
  }

  /** The pool of messages, read plainly. */
  async function readCommentsPool(): Promise<unknown> {
    const got = await fetch(`${app.api}/api/messages?full=1`, { headers: AS_THE_OWNER })
    expect(got.status, await got.clone().text()).toBe(200)
    return await got.json()
  }

  it('files the level 3 comment, and it stays unsent with nobody named', async () => {
    await writeOneThroughThePage('gist', '.sb-open-line', AT_LEVEL_THREE)
    await assertItIsHeldUnsent(AT_LEVEL_THREE, 'level 3')
  }, 180_000)

  // The levels the control offers come from a decision.
  it("files the level 6 comment too, on the part the page draws there (the control offers a reader Conclusion, Level 6 and Full, so the deepest by-part level the page reaches is Level 6), and it stays unsent", async () => {
    await writeOneThroughThePage('digest', '.sb-part', AT_LEVEL_SIX)
    await assertItIsHeldUnsent(AT_LEVEL_SIX, 'level 6')
  }, 180_000)

  it('collected both in the review as well, because what a review collects is derived from the target', async () => {
    const got = await fetch(`${app.api}/api/reviews/${reviewId}`, { headers: AS_THE_OWNER })
    expect(got.status, await got.clone().text()).toBe(200)
    const detail = (await got.json()) as { members: { body: string }[] }
    const bodies = detail.members.map((one) => one.body)
    expect(bodies, 'the level 3 comment is not in the review').toContain(AT_LEVEL_THREE)
    expect(bodies, 'the level 6 comment is not in the review').toContain(AT_LEVEL_SIX)
  }, 120_000)
})
