// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REPORT THAT COUNTS WHAT IS WAITING IS ANSWERED BESIDE ITSELF, AND THE PERSON IS NOT REFUSED.
 *
 * ---------------------------------------------------------------------------------------
 * THE HALF WAVE 2 BUILT AND THE HALF THAT BELONGED TO NOBODY
 * ---------------------------------------------------------------------------------------
 *
 * Report `NHtlTgnKAG8h`, block `b-6`, reads *"Nineteen things are waiting on you"*. It was true the
 * day it was typed, it is a claim about the corpus, and nothing recomputes it. Wave 2 built the
 * write guard: an AGENT that tries to store such a sentence is refused and told where the live
 * number lives. A PERSON is not refused, because a human-facing box is not where rules are enforced
 * by refusal and the owner's wording is preserved exactly as typed.
 *
 * That left the stale number on the page with nothing beside it, and wave 2 could not prove
 * otherwise: it had no drawn half to point at. This file is that half — wave 5 step 16 — and it
 * holds BOTH sides in one place, because either alone is a guard that has become a censor or a
 * censor that has become a shrug.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT ASSERTS
 * ---------------------------------------------------------------------------------------
 *
 * A human writes the sentence: the write succeeds and the bytes stored are what was typed.
 * An agent writes the same sentence: the write is refused.
 * The page draws the mark beside that block, with the live number in it.
 * The live number is the one reading's — the same `GET /api/waiting` the rail's badge draws — and
 * the test checks it against what that route actually answers rather than against a number written
 * here, so the assertion cannot pass by two mistakes agreeing.
 * A block that counts nothing draws no mark, and a stated count that AGREES draws no mark either.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { countDisagreementIn } from '../src/shared/waitingclaims.ts'

let app: LiveApp
let page: Page
let reportId: string
/** What `GET /api/waiting` answers for the records this test links to the report. */
let liveCount: number
/** How many records the report is linked to at all — deliberately more than `liveCount`. */
let linkedCount: number

const HUMAN = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
}
const AGENT = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-session-id': 'sess-count-guard',
  'x-mole-office-workspace': 'default',
}

/** The sentence at the centre of this: the owner's words, spelled out, exactly as they are stored. */
const THE_OWNERS_SENTENCE = 'Nineteen things are waiting on you, and four of them are named below.'

async function post(path: string, body: unknown, headers: Record<string, string>): Promise<Response> {
  return fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
}

async function created(path: string, body: unknown, headers: Record<string, string>): Promise<string> {
  const res = await post(path, body, headers)
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return ((await res.json()) as { record: { id: string } }).record.id
}

/** The marks drawn on the page now, with the two numbers each one is holding against each other. */
async function marksDrawn(): Promise<{ text: string; stated: string; live: string }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('.sb-countmark')].map((el) => ({
      text: (el.textContent ?? '').trim(),
      stated: el.getAttribute('data-stated') ?? '',
      live: el.getAttribute('data-live') ?? '',
    })),
  )
}

async function open(id: string, width: number): Promise<void> {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1100 })
  await page.goto(`${app.site}/#/r/${id}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  // The mark is drawn only once the live count is read, so the wait is for the mark itself.
  await page.locator('.sb-countmark').first().waitFor({ state: 'attached', timeout: 30_000 })
}

beforeAll(async () => {
  // THIS FILE IS ABOUT WHAT IS INSIDE A REPORT'S BODY, SO IT SAYS WHICH LEVEL IT READS AT.
  // Act 3a made a record page open at the conclusion, where the body holds the summary and nothing else, so a test that
  // measures a diagram, a picture, a mark, a tab stop or a panel inside the writing found an empty body and waited for
  // a selector that would never appear. `opensAt` writes the reader's own stored choice before
  // the page loads, so this file is about its own subject again and not about the level a page opens at. That level has
  // its own test in tests/a-reader-goes-no-lower-than-conclusion.test.ts, which stores nothing.
  app = await liveApp({ opensAt: 'full', name: 'count-guard-drawn', viewport: { width: 1440, height: 1100 } })
  page = app.page

  // TWO THINGS THAT ARE GENUINELY WAITING ON THE PERSON. `whose_move: person` on a live record whose
  // own state word does not say it has ended is the second of the three tiers `GET /api/waiting`
  // reads. The number the mark draws is counted from that route, never from these two lines.
  const waitingOne = await created(
    '/api/records',
    {
      kind: 'problem',
      title: 'The wrist mount cracks below the load the trials need',
      summary: 'Fifteen newtons against the twenty the handover trials ask for.',
      data: { whose_move: 'person', state: 'open' },
    },
    HUMAN,
  )
  const waitingTwo = await created(
    '/api/records',
    {
      kind: 'problem',
      title: 'Nobody has said which gripper the second arm carries',
      summary: 'The two arms were fitted from different boxes and the note was never written.',
      data: { whose_move: 'person', state: 'open' },
    },
    HUMAN,
  )

  // A REPORT SAYING NINETEEN, WRITTEN BY A PERSON. This write must succeed: that is wave 2's rule
  // and it is asserted below rather than assumed here.
  reportId = await created(
    '/api/records',
    {
      kind: 'report',
      title: 'Round nine, and what is still open',
      data: {
        for: THE_TEST_OFFICES_OWNER.name,
        date: '2026-08-25',
        blocks: [
          { id: 'b-1', type: 'text', heading: 'Where it stands', text: 'The campaign closed six of the seven.' },
          { id: 'b-2', type: 'text', heading: 'What is left', text: THE_OWNERS_SENTENCE },
        ],
      },
    },
    HUMAN,
  )

  // A THIRD LINK TO SOMETHING THAT IS NOT WAITING, AND IT IS WHAT MAKES THIS TEST ABLE TO TELL TWO
  // READINGS APART. With two links and two waiting, "how many of its links are waiting" and "how
  // many links has it" are the same number, and a mark computed from either would pass. This record
  // carries no `whose_move`, so it is joined to the report and is not waiting on anybody.
  const notWaiting = await created(
    '/api/records',
    {
      kind: 'note',
      title: 'The aluminium wrist mount arrived on Thursday',
      summary: 'Recorded so the trial dates make sense later.',
      data: {},
    },
    HUMAN,
  )

  for (const other of [waitingOne, waitingTwo, notWaiting]) {
    const res = await post('/api/links', { fromId: reportId, toId: other, type: 'discusses' }, HUMAN)
    if (!res.ok) throw new Error(`POST /api/links answered ${String(res.status)}: ${await res.text()}`)
  }
  linkedCount = 3

  // WHAT THE ONE READING ACTUALLY ANSWERS, asked here rather than written into the assertions. If
  // the route counted something else as waiting, this test would be measuring the same reading the
  // page is and would still be a real check of the two agreeing.
  const waiting = await fetch(`${app.api}/api/waiting`, { headers: HUMAN })
  if (!waiting.ok) throw new Error(`GET /api/waiting answered ${String(waiting.status)}`)
  const reply = (await waiting.json()) as { items: { id: string }[] }
  const ids = new Set(reply.items.map((item) => item.id))
  liveCount = [waitingOne, waitingTwo].filter((id) => ids.has(id)).length
}, 180_000)

afterAll(async () => {
  await app.stop()
})

describe('the two halves of the count guard', () => {
  it('lets a person write a count of what is waiting, and stores the words as typed', async () => {
    const res = await fetch(`${app.api}/api/records/${reportId}`, { headers: HUMAN })
    const stored = (await res.json()) as {
      record: { data: { blocks: { id: string; text?: string }[] } }
    }
    const block = stored.record.data.blocks.find((one) => one.id === 'b-2')
    expect(block?.text, 'their sentence is stored byte for byte and nothing edits it').toBe(THE_OWNERS_SENTENCE)
  })

  it('refuses an agent writing the same sentence', async () => {
    const res = await post(
      '/api/records',
      {
        kind: 'report',
        title: 'What an agent thinks is waiting',
        data: {
          for: THE_TEST_OFFICES_OWNER.name,
          date: '2026-08-25',
          blocks: [{ id: 'b-1', type: 'text', text: THE_OWNERS_SENTENCE }],
        },
      },
      AGENT,
    )
    expect(res.ok, 'an agent may not assert a count of what waits on the person').toBe(false)
  })



  it('writes no markdown in its own sentence, whatever the writer marked up', () => {
    // WHAT WAS ON SCREEN BEFORE THIS. Report NHtlTgnKAG8h's block opens with markdown emphasis, so
    // the characters stored for the number are `**Nineteen`, and the mark quoted them straight
    // back: `this says “**Nineteen”; 0 of the things this record links to are waiting on you`. That
    // is Mole Office writing raw markdown in its own voice, at first paint, on the report the owner
    // complains about. A reader never sees those stars in the paragraph itself — they are an
    // instruction to draw the word bold.
    //
    // WHY IT IS CHECKED HERE AND NOT IN THE MACHINE-WORD GATE. That gate answers a different
    // question: did a stored vocabulary word reach a screen without passing through the readings
    // table. This is the product quoting somebody's own characters into a sentence of its own, and
    // there is exactly one sentence in Mole Office that does that. It is this one, so it is guarded here.
    const marked = [
      { id: 'b-1', type: 'text', text: `**${THE_OWNERS_SENTENCE}**` },
    ] as never
    const found = countDisagreementIn(marked, 2)
    expect(found?.stated, 'the emphasis marker was quoted back as part of the number').toBe('Nineteen')
    expect(found?.sentence).not.toMatch(/[*_~`]/)
    expect(found?.sentence).toContain('“Nineteen”')

    // The same again with the markers markdown puts on one word rather than on the paragraph, and
    // with the ones this does NOT take off: a full stop and a comma are the writer's punctuation.
    expect(countDisagreementIn([{ id: 'b-1', type: 'text', text: '_Nineteen_ things are waiting on you.' }] as never, 2)?.stated).toBe(
      'Nineteen',
    )
    expect(countDisagreementIn([{ id: 'b-1', type: 'text', text: 'Nineteen, roughly, are waiting on you.' }] as never, 2)?.stated).toBe(
      'Nineteen,',
    )

    // THE WRITER'S PUNCTUATION SITS OUTSIDE THE MARKER HERE, so the marker is not the last
    // character. This is the corpus report's own shape, measured on a copy of it: block b-6 of
    // NHtlTgnKAG8h ends `...are waiting on you**,`. The refusal an agent gets quotes the passage,
    // so a marker left in the middle of that sentence is markdown in Mole Office's voice too.
    const backwards = countDisagreementIn(
      [{ id: 'b-1', type: 'text', text: '**Nineteen things are waiting on you**, each of them named below.' }] as never,
      2,
    )
    expect(backwards?.stated).toBe('Nineteen')
    expect(backwards?.claim.passage, 'the passage quoted at an agent still holds markdown').not.toMatch(/[*_~`]/)

    // AND A MARKER INSIDE A WORD IS NOT TOUCHED. This product quotes its own stored words back at
    // people, and `worked_around` with its underscore taken out is this reading corrupting the
    // thing it is quoting.
    expect(
      countDisagreementIn(
        [{ id: 'b-1', type: 'text', text: 'Four worked_around items are waiting on you.' }] as never,
        2,
      )?.claim.passage,
    ).toContain('worked_around')
  })

  it('draws no mark where the stated count and the live one agree, and none where nothing is counted', () => {
    const counting = [{ id: 'b-1', type: 'text', text: THE_OWNERS_SENTENCE }] as never
    const notCounting = [{ id: 'b-1', type: 'text', text: 'Four of them are named below.' }] as never
    expect(countDisagreementIn(counting, 19)).toBeNull()
    expect(countDisagreementIn(notCounting, 3)).toBeNull()
    expect(countDisagreementIn(counting, 2)?.live).toBe(2)
  })

  for (const width of [1440, 390]) {
    it(`draws the mark beside the block that makes the claim, at ${String(width)}`, async () => {
      await open(reportId, width)
      const marks = await marksDrawn()

      expect(marks, 'exactly one block on this report counts what is waiting').toHaveLength(1)
      expect(marks[0]?.stated).toBe('Nineteen')
      // THE NUMBER IS THE ONE READING'S, asked of the route in this test's own setup.
      expect(marks[0]?.live).toBe(String(liveCount))
      expect(marks[0]?.text).toBe(
        `this says “Nineteen”; ${String(liveCount)} of the things this record links to ` +
          `${liveCount === 1 ? 'is' : 'are'} waiting on you`,
      )
    })

    it(`puts the mark under that block and not under the one above it, at ${String(width)}`, async () => {
      await open(reportId, width)
      const order = await page.evaluate(() => {
        const kids = [...(document.querySelector('.sb')?.children ?? [])]
        const mark = kids.findIndex((el) => el.classList.contains('sb-countmark'))
        const claim = kids.findIndex((el) => (el.textContent ?? '').includes('Nineteen things are waiting'))
        return { mark, claim, count: kids.length }
      })
      expect(order.claim).toBeGreaterThanOrEqual(0)
      expect(order.mark, 'the mark sits immediately after the block it is about').toBe(order.claim + 1)
    })

    it(`draws the mark and never lets it be pressed, at ${String(width)}`, async () => {
      await open(reportId, width)
      const seen = await page.evaluate(() => {
        const el = document.querySelector('.sb-countmark')
        if (el === null) return null
        const rect = el.getBoundingClientRect()
        const style = getComputedStyle(el)
        return {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          userSelect: style.userSelect,
          buttons: el.querySelectorAll('button, a, [role="button"]').length,
        }
      })
      expect(seen).not.toBeNull()
      expect(seen?.width).toBeGreaterThan(0)
      expect(seen?.height).toBeGreaterThan(0)
      // A stale count is writing that has been overtaken, not a fault to act on. The mark carries
      // no action: what to do about it is the reader's.
      expect(seen?.buttons).toBe(0)
    })
  }
})
