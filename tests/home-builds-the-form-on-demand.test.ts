// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOME SUMMARISES THE OWNER'S QUEUE. IT IS NOT THE QUEUE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, AND WHERE
 * ---------------------------------------------------------------------------------------
 *
 * In a browser at 1440 on 27 August 2026, against the running app.
 * `design/round-eleven/recovery/browser-dogfood.md` section 2, claim D, and the numbers taken again
 * by `design/round-eleven/wave-c/measure.mjs`:
 *
 *   - Home's `main` was 5,872 px tall and the "Waiting on you" panel inside it was 2,318 px of that.
 *   - Home held 162 closed `details` elements, 98 radio buttons, 26 text boxes and 26
 *     "Record this decision" buttons BEFORE anybody pressed anything. All twenty-six decision forms
 *     were built and folded away.
 *   - Opening one card grew it to 1,112 px and left a 1,112 px column of empty white beside it,
 *     because the fold was expanding inside one cell of a two-column grid.
 *   - An open card printed the same sentence twice, word for word: once as small grey prose and
 *     again immediately below as a bold heading.
 *
 * The owner's brief, section 8: *"Home currently over-expands governance items... Home should not
 * render every Waiting on you item as a full Decision form... The Home section should summarize the
 * owner queue, not become the queue's detail page."*
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE HOLDS, AND WHAT IT CANNOT
 * ---------------------------------------------------------------------------------------
 *
 * It renders the real components to markup and counts what they built. That is the honest half of
 * the claim: a form that is not in the markup was not built. The other half — that pressing the
 * control still opens a working form, and that a person can settle a fork all the way through — is
 * a browser act and is proved in a browser; the evidence is under `design/round-eleven/wave-c/`.
 *
 * SO EVERY ABSENCE HERE IS ASSERTED BESIDE ITS PRESENCE. A test that only checked that Home holds
 * no text box would stay green if somebody deleted the decision form, which is the one thing on
 * this surface that must never quietly go away.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'

type Decisions = typeof import('../src/web/components/home/decisions.ts')
type Tiles = typeof import('../src/web/components/home/DecisionTiles.tsx')
type Queue = typeof import('../src/web/components/DecisionQueue.tsx')
type Gov = typeof import('../src/web/components/Governance.tsx')

let dec: Decisions
let tiles: Tiles
let queue: Queue
let gov: Gov

/** The moment every fixture below is dated against. Local, like every stamp in this product. */
const NOW = new Date(2026, 7, 27, 12, 0, 0).getTime()

beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  dec = await import('../src/web/components/home/decisions.ts')
  tiles = await import('../src/web/components/home/DecisionTiles.tsx')
  queue = await import('../src/web/components/DecisionQueue.tsx')
  gov = await import('../src/web/components/Governance.tsx')
})

/** A local wall-clock stamp N days before NOW. src/shared/time.ts, one writer, no `Z`. */
function daysAgo(days: number): string {
  const at = new Date(NOW - days * 24 * 60 * 60 * 1000)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}:${two(at.getMinutes())}:${two(at.getSeconds())}`
}

type Fork = Parameters<Decisions['readDecisions']>[0][number]

const QUESTION =
  'Should the collapsed change row be able to tell two people apart, given that the grouping key ' +
  'holds recordId, actorType, sessionId, op and at, and deliberately not actorId?'

function fork(over: Partial<Fork> = {}): Fork {
  return {
    recordId: 'p-1',
    title: 'Should a collapsed change row be able to tell two people apart?',
    summary: QUESTION,
    workspaceId: 'panelx',
    workspaceTitle: 'Mole Office',
    question: QUESTION,
    options: 3,
    recommendationWritten: true,
    namesAnOption: true,
    blocks: [],
    fields: {
      question: QUESTION,
      options: ['a — Take the first', 'b — Take the second', 'c — Leave it open'],
      recommendation: 'Take (a), because it is the only one that keeps the key stable.',
      // WHY THE FIXTURE CARRIES THESE TWO. A built form folds them away itself — "Why this came up"
      // and "What this is based on" — and they are most of the difference between 26 folds and the
      // 162 counted on Home. A fixture without them would let an eager form pass the fold count.
      because: 'Two agents wrote in the same second and the row collapsed them into one.',
      evidence: ['tests/changes.test.ts', 'The grouping key, as stored on 2026-08-13.'],
    },
    createdAt: daysAgo(2),
    because: 'Settling a fork is a governance act, so Mole Office refuses it to every agent.',
    unreadable: [],
    replacedButStillHere: null,
    // Nothing on this fixture stands on anybody's quoted words, which is the ordinary answer.
    onThePersonsWords: null,
    priority: {
      pinned: false,
      safety: false,
      blocking: 0,
      reaches: 0,
      governance: false,
      waitingDays: 2,
      namesAnOption: true,
      because: 'Ordered by: it has waited 2 days; its recommendation names an option.',
    },
    ...over,
  }
}

/** Twenty-six of them, which is how many were in the owner's queue on the day this was measured. */
const MANY: Fork[] = Array.from({ length: 26 }, (_, i) =>
  fork({ recordId: `p-${i}`, title: `Fork number ${i}`, createdAt: daysAgo(i) }),
)

const body = (el: React.ReactElement): string =>
  renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')

const howMany = (html: string, pattern: RegExp): number => (html.match(pattern) ?? []).length

const listOf = (rows: readonly ReturnType<Decisions['readDecisions']>[number][], inspect = false) =>
  body(
    h(tiles.DecisionTiles, {
      rows,
      tally: dec.tallyDecisions(rows),
      here: 'panelx',
      onOpen: () => {},
      onSettled: () => {},
      inspect,
    }),
  )

// ============================================================ the form is built when it is asked for

describe('the decision form is built on the press, not on the page', () => {
  it('builds not one text box, radio button or submit for twenty-six waiting forks', () => {
    /**
     * THE MEASUREMENT THIS REPLACES: 98 radio buttons, 26 text boxes and 26 "Record this decision"
     * buttons on Home at first paint, at 1440 on 27 August 2026.
     *
     * IT GOES RED THE MOMENT THE FORMS COME BACK. Mount the fold's body unconditionally instead of
     * behind its `built` state and every count below jumps from nought.
     */
    const rows = dec.readDecisions(MANY, NOW, [])
    const html = listOf(rows)
    expect(howMany(html, /<li class="dq-tile"/g), 'the control: all twenty-six cards are drawn').toBe(26)
    expect(howMany(html, /<textarea/g), 'a text box was built before anybody asked for one').toBe(0)
    // THE PICKER IS THE OPTION CARDS THEMSELVES from 6 September 2026, so this counts the buttons
    // they became rather than the radios they replaced. Criterion M57. The claim is the one it
    // always was: nothing a person decides with is built until they ask for it.
    expect(
      howMany(html, /class="px-gov-opt-inner"/g),
      'a picker was built before anybody asked for one',
    ).toBe(0)
    expect(howMany(html, /type="radio"/g), 'a picker was built before anybody asked for one').toBe(0)
    expect(howMany(html, /Record this decision/g), 'a submit was built before anybody asked for one').toBe(0)
  })

  it('draws one fold per card and nothing folded inside it', () => {
    /**
     * 162 CLOSED FOLDS FOR 26 CARDS, and the difference was the forms: each built form carried its
     * own folds — "Why this came up", "What this is based on", and the rest. One card, one fold, is
     * what a list of twenty-six should cost.
     */
    const html = listOf(dec.readDecisions(MANY, NOW, []))
    expect(howMany(html, /<details/g)).toBe(26)
  })

  it('holds the whole form behind that press, so none of this was deleted to make the count fall', () => {
    /**
     * THE OTHER HALF, AND IT IS THE HALF THAT MATTERS. Emptying a card would pass every count above.
     * `DecideBody` is what the fold builds when it is opened, and it is asserted whole here: the
     * options a person presses between, and the box they write their reason in. There is no second
     * settle path in this product — this is the record page's own panel, posting to the one route
     * that refuses every agent.
     *
     * THE CONTROL THAT WRITES THE DECISION IS THE OPTION, from 6 September 2026 and criterion M57.
     * It used to be a submit under the list called "Record this decision", and that button is now
     * drawn only for the answer a press cannot supply — the person's own words when they take none
     * of the options. So the assertion reads for the buttons the options became.
     */
    const rows = dec.readDecisions([fork()], NOW, [])
    const row = rows[0] as (typeof rows)[number]
    const fold = body(h(gov.DecideBody, { row, here: 'panelx', onSettled: () => {}, inspect: false }))
    expect(fold).toContain('button type="button" class="px-gov-opt-inner"')
    expect(fold).toContain('<textarea')
    expect(fold).toContain('Take the first')
    expect(fold).toContain('Take the second')
    expect(fold).toContain('Leave it open')
  })
})

// ============================================================ an open card does not wreck the grid

describe('an open card takes the whole row', () => {
  it('spans every column of the grid while its fold is open', () => {
    /**
     * MEASURED AT 1440: opening the left-hand card grew it to 1,112 px and left a 1,112 px column of
     * empty white beside it. The fold was expanding inside one cell of a two-column grid.
     *
     * ASSERTED ON THE STYLESHEET AND CONFIRMED IN A BROWSER. A rule that depends on which sibling is
     * open cannot be read off static markup; the shot and the measured widths are under
     * `design/round-eleven/wave-c/`.
     */
    expect(queue.DECISION_QUEUE_CSS).toMatch(/\.dq-tile:has\([^)]*\.dq-decide\[open\]\)\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/)
    // The control: there really is a multi-column grid for it to span.
    expect(queue.DECISION_QUEUE_CSS).toMatch(/\.dq-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit/)
  })
})

// ============================================================ the question is printed once

describe('the question is not printed twice', () => {
  it('leaves the author’s summary out of the fold when it repeats the question', () => {
    /**
     * FOUR OF THE TWENTY-SIX FORKS IN THE CORPUS store a `summary` and a `question` that are the
     * same string, and an open card drew both — the same sentence, word for word, once as small grey
     * prose and again immediately below as a bold heading.
     *
     * THE TEST IS EXACT AND IS NEVER A JUDGEMENT. Equal after trimming, or wholly inside the
     * question. Anything else is two pieces of writing and both are kept, which is the second case
     * below.
     */
    expect(dec.summaryAdds(QUESTION, QUESTION)).toBeNull()
    expect(dec.summaryAdds(`  ${QUESTION}  `, QUESTION)).toBeNull()
    expect(dec.summaryAdds(`Before it. ${QUESTION} After it.`, QUESTION)).toBeNull()
    // A different sentence is a different piece of writing and is kept.
    expect(dec.summaryAdds(QUESTION, 'The key omits actorId on purpose.')).toBe('The key omits actorId on purpose.')
    // And where the record states no question at all, the author's line is all there is.
    expect(dec.summaryAdds(null, 'The key omits actorId on purpose.')).toBe('The key omits actorId on purpose.')

    const same = dec.readDecisions([fork()], NOW, [])
    const sameRow = same[0] as (typeof same)[number]
    const fold = body(h(gov.DecideBody, { row: sameRow, here: 'panelx', onSettled: () => {}, inspect: false }))
    expect(howMany(fold, new RegExp(QUESTION.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))).toBe(1)
  })

  it('puts about a line of the question on the closed row, whole, and clamps it in the layout', () => {
    /**
     * THE OWNER'S SECTION 8: *"show only about 1–1.5 lines of the question/summary"*. Two CSS lines is that
     * at a card width of about 560 px.
     *
     * THE STRING IS NEVER CUT. A reading that shortened the text would leave a person unable to get
     * the rest of it back, and the last sentence of a fork's question is routinely the sentence
     * actually being asked.
     */
    const rows = dec.readDecisions([fork()], NOW, [])
    const row = rows[0] as (typeof rows)[number]
    expect(row.lede).toBe(QUESTION)
    expect(listOf(rows)).toContain('class="dq-lede px-fork-words"')
    expect(queue.DECISION_QUEUE_CSS).toMatch(/\.dq-lede[^{]*\{[^}]*line-clamp:\s*2/)
    // AND IT LEAVES WHEN THE CARD OPENS, so the full question below is never the same sentence twice.
    expect(queue.DECISION_QUEUE_CSS).toMatch(/\.dq-tile:has\([^)]*\.dq-decide\[open\]\)\s*\.dq-lede\s*\{\s*display:\s*none/)
  })

  it('says a question is missing rather than filling one in', () => {
    // ABSENCE BEATS A GUESS. A fork that states neither a question nor a summary has no line, and
    // the row draws none. It does not fall back to the title, which would make a row that says
    // one thing twice look like a row that says two.
    const rows = dec.readDecisions([fork({ question: null, summary: null })], NOW, [])
    expect((rows[0] as (typeof rows)[number]).lede).toBeNull()
    expect(listOf(rows)).not.toContain('dq-lede')
    // Blank is nothing written, not a line somebody wrote.
    expect(dec.ledeOf('   ', '  ')).toBeNull()
  })
})

// ============================================================ what a closed row carries

describe('a closed row carries what section 8 asks of it', () => {
  it('carries the title, the id, the priority marks, the age and both ways on', () => {
    const rows = dec.readDecisions(
      [
        fork({
          priority: { ...fork().priority, pinned: true, safety: true, blocking: 2, because: 'Ordered by: you pinned it.' },
          blocks: [
            { recordId: 't-1', title: 'Wire Home to the fork projection', kind: 'task' },
            { recordId: 't-2', title: 'The calibration bench', kind: 'task' },
          ],
          unreadable: ['1 of the 3 options on this fork is not text, so it is neither counted nor shown here.'],
        }),
      ],
      NOW,
      [
        {
          proposalId: 'p-old',
          proposalTitle: 'The same question, asked once before',
          workspaceId: 'panelx',
          why: 'duplicate',
          sentence: 'Nobody has to answer this: it is a duplicate of the fork beside it.',
          insteadId: 'p-1',
          insteadTitle: 'Should a collapsed change row be able to tell two people apart?',
          linkedBy: 'claude-round-eleven',
          linkedByType: null,
          linkedAt: daysAgo(1),
        },
      ],
    )
    const html = listOf(rows)
    // the title
    expect(html).toContain('Should a collapsed change row be able to tell two people apart?')
    // about a line of the question
    expect(html).toContain('class="dq-lede px-fork-words"')
    // the compact reference, drawn by the one component that decides where an id sits
    const developer = listOf(rows, true)
    expect(developer).toContain('rid-card')
    expect(developer).toContain('p-1')
    // the pin, as a star in the corner and never as a colour
    expect(html).toContain('data-pinned="1"')
    expect(html).toContain('★')
    // important state: somebody could be hurt, work is stuck, something could not be read
    expect(html).toContain('data-mark="safety"')
    expect(html).toContain('holding up')
    expect(html).toContain('data-mark="unread"')
    // how many other questions this one stands for
    expect(html).toContain('data-mark="stands-for"')
    expect(html).toContain('stands for ')
    // the age
    expect(html).toContain('2d')
    // a clear expand control, and a clear way to the record's own page
    expect(html).toContain('Decide it')
    expect(html).toContain('Open the full record')
  })

  it('counts the questions it stands for from the reply, and never from a second reading', () => {
    // THE SERVER SAYS WHICH FORK REPLACED WHICH, in a link and in a sentence. Nothing here decides
    // that two questions are the same; it counts the ones the server already joined.
    const left = [
      {
        proposalId: 'p-old',
        proposalTitle: 'One',
        workspaceId: 'panelx',
        why: 'duplicate' as const,
        sentence: 'Nobody has to answer this: it is a duplicate of the fork beside it.',
        insteadId: 'p-1',
        insteadTitle: 'Should a collapsed change row be able to tell two people apart?',
        linkedBy: 'claude-round-eleven',
        linkedByType: null,
        linkedAt: daysAgo(1),
      },
      {
        proposalId: 'p-older',
        proposalTitle: 'Two',
        workspaceId: 'panelx',
        why: 'superseded' as const,
        sentence: 'Nobody has to answer this: the fork beside it replaced it.',
        insteadId: 'p-somebody-else',
        insteadTitle: 'A different fork',
        linkedBy: 'claude-round-eleven',
        linkedByType: null,
        linkedAt: daysAgo(1),
      },
    ]
    const rows = dec.readDecisions([fork()], NOW, left)
    const row = rows[0] as (typeof rows)[number]
    expect(row.standsFor.map((one) => one.proposalId), 'a fork claimed a join that names another record').toEqual([
      'p-old',
    ])
    // No join, no mark. Most forks stand for nothing and say nothing.
    const alone = dec.readDecisions([fork({ recordId: 'p-alone' })], NOW, left)
    expect((alone[0] as (typeof alone)[number]).standsFor).toEqual([])
    expect(listOf(alone)).not.toContain('data-mark="stands-for"')
  })
})

// ============================================================ Home summarises, and says that it did

describe('Home draws part of the queue and says exactly which part', () => {

  it('takes them off the front of the queue, which the server put in order of consequence', () => {
    /**
     * THE CAP AND THE ORDER ARE ONE DECISION. Home draws four of twenty-six, so which four depends
     * entirely on the order they arrive in — and that order is the server's, from several visible
     * facts and no score. Nothing in the browser re-sorts them, which is what makes "the four most
     * consequential" a true sentence rather than a hopeful one.
     */
    const rows = dec.readDecisions(MANY, NOW, [])
    expect(rows.map((one) => one.recordId)).toEqual(MANY.map((one) => one.recordId))
  })
})
