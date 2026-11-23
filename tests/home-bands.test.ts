// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE THREE BANDS HOME WAS REBUILT AS, and the four things that were wrong with what came before.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT AN INDEPENDENT AUDIT MEASURED, AND WHICH OF ITS FINDINGS THESE TESTS HOLD
 * ---------------------------------------------------------------------------------------
 *
 * At 1440x900, in the `panelx` project, over 151 records, Home was 3,157px tall with 671 words in
 * its first screenful and the verdict "guessable, not clear". Four of the findings are pure enough
 * to be pinned here rather than in a screenshot, and each one is a mistake somebody could make
 * again without a type error:
 *
 *   1. THE DECISION BODY PRINTED `action.question` — 606 characters of "recordId, actorType,
 *      sessionId", "tests/changes.test.ts" and ".tsx reading both .op and .actorId", as the first
 *      prose on the page. `GET /api/needs-you` sends `summary` beside it, which is the one line the
 *      record's author wrote, and that is what a tile shows. Nothing is invented and nothing is
 *      rewritten: the question is one press away, whole.
 *
 *   2. NOTHING SAID WHICH DECISION WAS EASIEST. "a recommendation" and "no recommendation" were
 *      13px grey, the same size and colour as the project tag beside them. One chip carries both
 *      halves now, filled or outlined, and the two groups are sorted apart.
 *
 *   3. THE QUEUE HAD NO AGE. `createdAt` was in the payload and never drawn, so the order of four
 *      rows was unexplained. Every tile says how long it has waited, and the order is oldest-first
 *      inside each group — which makes the order checkable from the tiles alone.
 *
 *   4. THE SESSIONS BLOCK WAS A 928px COPY OF THE SESSIONS PAGE. It is one line of counts now, and
 *      the counting is what these tests hold: no zero Mole Office did not count, and no state dropped.
 *
 * ---------------------------------------------------------------------------------------
 * THERE USED TO BE THREE WAYS OF DRAWING BAND 1, AND NOW THERE IS ONE
 * ---------------------------------------------------------------------------------------
 *
 * `home-decisions` was a variant slot offering the queue three ways: all at once, one at a time, or
 * settled where it is listed. None of the three was picked: expanding a decision starts dealing
 * with it: it shows the choices and lets the person decide.
 * So there is one view, the slot is gone, and one test below holds it gone: a slot
 * that survives its own settlement is the permanent duplicated architecture the mechanism was told
 * not to become.
 *
 * The runner's environment is `node` and this project has ruled out jsdom, so components are
 * rendered to static markup and the pure functions are called directly. src/web/api.ts reads
 * window.localStorage at module scope, so a window stand-in is installed before anything that
 * reaches it is loaded — exactly as tests/home-attention.test.ts does it.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { SESSION_STATES, type SessionState } from '../src/shared/types.ts'
import { UNASSIGNED_WORKSPACE } from '../src/shared/workspaces.ts'
import { t } from '../src/shared/i18n.ts'

type Decisions = typeof import('../src/web/components/home/decisions.ts')
type Tiles = typeof import('../src/web/components/home/DecisionTiles.tsx')
type Cards = typeof import('../src/web/components/home/DecidedCards.tsx')
type Queue = typeof import('../src/web/components/DecisionQueue.tsx')
type SessLine = typeof import('../src/web/components/home/sessions-line.ts')
type Home = typeof import('../src/web/pages/HomePage.tsx')
// The card and what its press opens both live here, and the fold's contents are rendered on
// their own now that they are built on the press rather than with the card.
type Gov = typeof import('../src/web/components/Governance.tsx')

let dec: Decisions
let tiles: Tiles
let cards: Cards
let queue: Queue
let sess: SessLine
let home: Home
let gov: Gov

/** The moment every fixture below is dated against. Local, like every stamp in this product. */
const NOW = new Date(2026, 7, 13, 12, 0, 0).getTime()

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
  cards = await import('../src/web/components/home/DecidedCards.tsx')
  queue = await import('../src/web/components/DecisionQueue.tsx')
  sess = await import('../src/web/components/home/sessions-line.ts')
  home = await import('../src/web/pages/HomePage.tsx')
  gov = await import('../src/web/components/Governance.tsx')
})

// ---------------------------------------------------------------------------- the fixture

/** A local wall-clock stamp N days before NOW. src/shared/time.ts, one writer, no `Z`. */
function daysAgo(days: number): string {
  const d = new Date(NOW - days * 24 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`
}

/**
 * The real 606-character question from the first fork in the queue on 2026-08-13, cut to its shape.
 * The point of it is that it is long, internal, and useless as the first prose on a home page.
 */
const RAW_QUESTION =
  'Home groups adjacent change rows that came from one write and draws a closed row saying "N writes, one action". ' +
  'The key is recordId, actorType, sessionId, op and at — deliberately NOT actorId, because tests/changes.test.ts ' +
  'treats any .tsx reading both .op and .actorId as a second change-row renderer and fails. For an agent the ' +
  'omission costs nothing, since sessionId is a session record’s id and two agents cannot share one. Should the ' +
  'key gain actorId?'

type Fork = Parameters<Decisions['readDecisions']>[0][number]

function fork(over: Partial<Fork> = {}): Fork {
  return {
    recordId: 'p-1',
    title: 'Should a collapsed change row be able to tell two people apart?',
    summary: 'The grouping key omits actorId on purpose, so two humans writing in the same second collapse.',
    workspaceId: 'panelx',
    workspaceTitle: 'Mole Office',
    question: RAW_QUESTION,
    options: 3,
    // TWO FACTS SINCE 27 AUGUST 2026. Written at all, and points at an option Mole Office can act on.
    recommendationWritten: true,
    namesAnOption: true,
    blocks: [],
    // What the fork itself stores. The desk hands these to the panel that settles one, so a fixture
    // without them would draw a fork with no question in the one variant that reads them.
    fields: {
      question: RAW_QUESTION,
      options: ['a — Take the first', 'b — Take the second', 'c — Leave it open'],
      recommendation: 'Take (a), because it is the only one that keeps the key stable.',
    },
    createdAt: daysAgo(2),
    because: 'Settling a fork is a governance act, so Mole Office refuses it to every agent.',
    unreadable: [],
    replacedButStillHere: null,
    // Nothing on this fixture stands on anybody's quoted words, which is the ordinary answer.
    onThePersonsWords: null,
    // WHY THIS FORK IS WHERE IT IS, added 27 August 2026. The band re-sorts the served list on its
    // own two keys and says so, so the fixture carries the facts flat rather than driving the
    // server's order — tests/priority-is-several-facts.test.ts is where the order itself is pinned.
    priority: {
      pinned: false,
      safety: false,
      blocking: 0,
      reaches: 0,
      governance: false,
      waitingDays: 2,
      namesAnOption: true,
      because: 'Ordered by: it has waited 2 days.',
    },
    ...over,
  }
}

/** Four forks: two recommended and two not, filed out of order, so the sort has work to do. */
const FORKS: Fork[] = [
  fork({ recordId: 'p-new-rec', title: 'Recommended, filed today', createdAt: daysAgo(0), recommendationWritten: true, namesAnOption: true }),
  fork({ recordId: 'p-old-none', title: 'Not recommended, filed a week ago', createdAt: daysAgo(7), recommendationWritten: false, namesAnOption: false }),
  fork({ recordId: 'p-old-rec', title: 'Recommended, filed five days ago', createdAt: daysAgo(5), recommendationWritten: true, namesAnOption: true }),
  fork({ recordId: 'p-new-none', title: 'Not recommended, filed yesterday', createdAt: daysAgo(1), recommendationWritten: false, namesAnOption: false }),
]

const body = (el: React.ReactElement): string =>
  renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')

/**
 * The same markup with the addressing attribute taken off every element.
 *
 * WHY IT IS TAKEN OFF FOR THE THREE ASSERTIONS BELOW ABOUT IDS. `data-target` is what says a card
 * IS a record, so that somebody can point at it and talk to an agent about it — see
 * src/shared/targets.ts. It carries the record id and the project id because that is what
 * identifies the record, and it is machinery: it is not drawn, it is not text, and no screen
 * reader announces it. docs/UX-CONTRACT.md puts ids and raw stored names in Developer detail
 * because a READER should not meet them, and this keeps those assertions about what a reader meets.
 *
 * THE ASSERTIONS THEMSELVES ARE NOT WEAKENED. Every one of them still fails if the id or the raw
 * project id is drawn anywhere a person can see it, in Normal mode, including inside a fold.
 */
const withoutTheAddress = (html: string): string => html.replace(/ data-target="[^"]*"/g, '')

/** What a reader sees without pressing anything. Every fold on Home is a native `<details>`. */
const scanned = (html: string): string =>
  html.replace(/<details[^>]*>[\s\S]*?<\/details>/g, (block) =>
    block.startsWith('<details open') ? block : (/<summary[^>]*>([\s\S]*?)<\/summary>/.exec(block)?.[1] ?? ''),
  )

// ============================================================================ band 1: the read

describe('what a decision tile is drawn from', () => {
  it('names how many ways there are to go AND whether one is suggested, in one phrase', () => {
    // THREE STATES SINCE 27 AUGUST 2026, because the middle one is the common one. A fork whose
    // written recommendation Mole Office cannot parse used to be drawn "no recommendation", and 25 of
    // the owner's 27 forks were in that state.
    const both = { written: true, namesAnOption: true }
    const inWords = { written: true, namesAnOption: false }
    const none = { written: false, namesAnOption: false }
    expect(dec.optionChip(3, both)).toBe('3 options · recommends one of them')
    expect(dec.optionChip(3, inWords)).toBe('3 options · recommended in words')
    expect(dec.optionChip(3, none)).toBe('3 options · no recommendation written')
    expect(dec.optionChip(1, none)).toBe('1 option · no recommendation written')
    // A zero is not a count of choices. "0 options" reads as a fork you could settle and cannot.
    expect(dec.optionChip(0, none)).toBe('no options recorded · no recommendation written')
  })

  it('says how long a fork has waited, from the stamp the server sent', () => {
    expect(dec.waitedPhrase(daysAgo(2), NOW)).toBe('waiting 2 days')
    expect(dec.waitedPhrase(daysAgo(1), NOW)).toBe('waiting 1 day')
    expect(dec.waitedPhrase(daysAgo(0), NOW)).toBe('waiting under a day')
  })

  it('gives the same age in a short form, from the same branch as the long one', () => {
    /**
     * THE OWNER, ON THE PHONE PICTURE: "for the waiting under a day, change to < 1d and resettle
     * the place". Eleven characters of "waiting under a day" stood beside the sentence the tile is
     * about, and won.
     *
     * BOTH FORMS COME OUT OF ONE CALL, and that is what this pins. A short form worked out
     * somewhere else could say "< 1d" while the tooltip beside it said "waiting 2 days", and
     * nothing in this repository would fail. So the pairing is asserted, not just the strings.
     */
    expect(dec.waitedOf(daysAgo(0), NOW)).toEqual({ short: '< 1d', age: 'under a day', long: 'waiting under a day' })
    expect(dec.waitedOf(daysAgo(1), NOW)).toEqual({ short: '1d', age: '1 day', long: 'waiting 1 day' })
    expect(dec.waitedOf(daysAgo(9), NOW)).toEqual({ short: '9d', age: '9 days', long: 'waiting 9 days' })
    for (const days of [0, 1, 2, 5, 40]) {
      const read = dec.waitedOf(daysAgo(days), NOW)
      expect(read.long, 'the two forms were worked out separately').toBe(`waiting ${read.age}`)
    }
  })

  it('refuses to invent an age from a stamp it cannot read, or from one in the future', () => {
    // "waiting under a day" off an unreadable stamp is the silent default this product forbids: it
    // is indistinguishable from a fork somebody filed this morning. The SHORT form must not invent
    // one either — "< 1d" on an unreadable stamp is the same lie in two characters — and there is
    // no bare age at all, so nothing downstream can write "settled <nonsense> ago".
    expect(dec.waitedPhrase('not a date', NOW)).toBe('Mole Office cannot read the date on this')
    expect(dec.waitedPhrase(daysAgo(-3), NOW)).toBe('The date on this is in the future')
    expect(dec.waitedOf('not a date', NOW).short).toBe('no date')
    expect(dec.waitedOf('not a date', NOW).age).toBeNull()
    expect(dec.waitedOf(daysAgo(-3), NOW).short).toBe('ahead')
    expect(dec.waitedOf(daysAgo(-3), NOW).age).toBeNull()
  })
})

describe('the order of the decisions, which is the server’s and is not made again here', () => {
  /**
   * WHAT THIS SAID UNTIL 27 AUGUST 2026, AND WHY IT CHANGED.
   *
   * Two tests here asserted an order this file's own code produced: *"puts the recommended ones
   * first, and the oldest first inside each group"*, and *"breaks a tie by id, so two forks filed
   * in the same second cannot swap between two draws"*. Both were about a `.sort()` inside
   * `readDecisions`.
   *
   * That sort is deleted, and with it both criteria. The owner's round-eleven brief, section 7:
   * *"Default ordering should put the most consequential items first."* Ordering by whether a
   * recommendation parses is convenience, not consequence, and it was the second answer to a
   * question `readForks()` in src/server/lib/forks.ts already answers with seven visible facts —
   * the same fact worked out in two places, which is this repository's named recurring defect. The
   * two had already drifted: the browser's comment described the server's order as "how much work
   * each is holding up and then by age", which stopped being true when the priority model landed,
   * and nothing failed.
   *
   * WHAT REPLACES THEM. This one, which asserts the browser changes nothing about the order, and
   * tests/priority-is-several-facts.test.ts, which pins all seven keys against the projection that
   * decides them — including the tie broken by id.
   *
   * IT MATTERS MORE THAN IT USED TO. Home draws only the first `HOME_SHOWN` of these, so the order
   * now decides which forks the owner is shown at all.
   */
  it('hands back exactly the order it was given, so the queue is ordered in one place', () => {
    const rows = dec.readDecisions(FORKS, NOW, [])
    expect(rows.map((row) => row.recordId)).toEqual(FORKS.map((one) => one.recordId))
    // And the fixture is not already in the order a re-sort would produce, so this could fail.
    expect(FORKS.map((one) => one.recordId)).not.toEqual(['p-old-rec', 'p-new-rec', 'p-old-none', 'p-new-none'])
  })

  it('counts the band once, so no variant has to count it', () => {
    const tally = dec.tallyDecisions(dec.readDecisions(FORKS, NOW, []))
    expect(tally).toEqual({ total: 4, recommended: 2, namingAnOption: 2, blocking: 0, projects: ['panelx'] })
  })
})

// ============================================================================ band 1: drawing

describe('the decisions as tiles', () => {
  const props = () => ({
    rows: dec.readDecisions(FORKS, NOW, []),
    tally: dec.tallyDecisions(dec.readDecisions(FORKS, NOW, [])),
    here: 'panelx',
    onOpen: () => {},
    onSettled: () => {},
    inspect: false,
  })

  it('encloses each decision, so four of them are counted before a word is read', () => {
    const html = body(h(tiles.DecisionTiles, props()))
    expect((html.match(/class="dq-tile"/g) ?? []).length).toBe(4)
    // A real border and a real grid, not a hairline inside one card.
    expect(queue.DECISION_QUEUE_CSS).toMatch(/\.dq-grid\s*\{[^}]*display:\s*grid/)
    expect(queue.DECISION_QUEUE_CSS).toMatch(/\.dq-tile[^{]*\{[^}]*border:\s*var\(--border-w\)/)
  })

  it('spends the --ask rail on the tiles, which is the surface that hue was added for', () => {
    // docs/UX-CONTRACT.md: --ask means "waiting on a person", it is the only hue added this pass,
    // and it is spent on the decision queue and nowhere else. A rail is identity, not urgency.
    expect(queue.DECISION_QUEUE_CSS).toMatch(/border-left:\s*var\(--rail\)\s*solid\s*var\(--ask\)/)
  })

  it('puts the option chip and the age on every tile, which is what makes the order self-evident', () => {
    const scan = scanned(body(h(tiles.DecisionTiles, props())))
    expect(scan).toContain('3 options · recommends one of them')
    expect(scan).toContain('3 options · no recommendation written')
    // The short form is what is drawn; the whole phrase is on the element for a screen reader and
    // for a pointer, so nothing is lost by shortening it.
    expect(scan).toContain('>5d<')
    expect(scan).toContain('>7d<')
    expect(scan).toContain('waiting 5 days')
    // Filled for recommended, outlined for not — and the words say it too, so no state is colour
    // alone. Both are drawn from `hasRecommendation`, so they cannot disagree with the sort.
    expect(scan).toContain('data-rec="1"')
    expect(scan).toContain('data-rec="0"')
  })

  it('is its title AND about a line of the question at rest, with the rest one press away', () => {
    /**
     * WHAT THIS ASSERTED UNTIL 27 AUGUST 2026, AND WHY IT CHANGED.
     *
     * It read *"is its TITLE at rest, with the summary and the question both behind one press"*,
     * and it failed if either the author's summary or the fork's question appeared on a closed
     * tile. That came from the owner's earlier finding: *"Only the title is needed, the
     * descriptions below could be expanded when mouse on or click but not by default."*
     *
     * The owner's round-eleven brief, section 8, asks a collapsed governance item for both: the title AND
     * *"about 1-1.5 lines of the question/summary"*. A title alone locates a fork only for somebody
     * who already knows it. So the question is on the closed row now.
     *
     * WHAT IS STILL HELD, AND IT IS THE PART THAT MATTERED. The row carries ONE line, clamped by
     * CSS, and never two pieces of prose: the author's separate summary stays behind the press. And
     * the shortening happens in the layout, never in the data — the whole question is on the
     * element for a pointer and a screen reader, so nothing is lost by the clamp.
     */
    const html = body(h(tiles.DecisionTiles, props()))
    const rest = scanned(html)
    expect(rest, 'the title is on the row').toContain('Recommended, filed five days ago')
    expect(rest, 'about a line of the question is not on the row').toContain('tests/changes.test.ts')
    // NOT CUT IN THE DATA. The clamp is two CSS lines; the string is whole, including its last
    // sentence, which on this fixture is the sentence actually being asked.
    expect(rest, 'the question was shortened in the data rather than by the layout').toContain(
      'Should the key gain actorId?',
    )
    expect(queue.DECISION_QUEUE_CSS).toMatch(/\.dq-lede[^{]*\{[^}]*line-clamp:\s*2/)
    // ONE PIECE OF PROSE, NOT TWO. The author's own summary is a different piece of writing and it
    // is still behind the press.
    expect(rest, 'the author’s summary is on the closed row as well').not.toContain(
      'The grouping key omits actorId',
    )
  })

  it('draws no part of the decision form until somebody asks for one', () => {
    /**
     * WHAT THIS FILE DID NOT ASSERT BEFORE, AND WHAT MEASURED IT.
     *
     * At 1440 on 27 August 2026 Home held 162 closed `details` elements, 98 radio buttons, 26 text
     * boxes and 26 "Record this decision" buttons before anybody pressed anything: every one of the
     * twenty-six decision forms was built and folded away. The owner's section 8: *"Home should not render
     * every Waiting on you item as a full Decision form."*
     *
     * The full proof of the lazy mount is tests/home-builds-the-form-on-demand.test.ts. This is the
     * same claim standing beside the criterion it replaces, so a reader of this file cannot come
     * away thinking the form is still built with the card.
     */
    const html = body(h(tiles.DecisionTiles, props()))
    expect(html).not.toContain('<textarea')
    // THE PICKER IS THE OPTION CARDS from 6 September 2026 (criterion M57), so the count that
    // proves nothing was built reads for those buttons. The radio it replaced is asserted absent
    // beside it, which is what stops the old mechanism creeping back unnoticed.
    expect(html).not.toContain('class="px-gov-opt-inner"')
    expect(html).not.toContain('type="radio"')
    expect(html).not.toContain('Record this decision')
  })

  it('opens the CHOICES under the press Decide it', () => {
    /**
     * THE OWNER'S THIRD REVIEW, AND THE WHOLE OF WHAT THIS BAND WAS REBUILT FOR:
     *
     * > "Expand currently only reveals a little more explanation, which is not very useful. My
     * > expectation when expanding a decision is closer to 'start dealing with it': show the
     * > choices and let me decide."
     *
     * The control used to be called Expand and it opened two more paragraphs of background under a
     * card whose own chip said "3 options". It is called Decide it and it opens the real decide
     * form. This fails if the old word or the old promise comes back.
     */
    const html = body(h(tiles.DecisionTiles, props()))
    expect(html).toContain('>Decide it<')
    expect(html, 'the control that only opened more prose is back').not.toContain('>Expand<')
  })

  it('mounts the one panel that settles a fork, rather than a button that goes somewhere else', () => {
    /**
     * THERE IS NO SECOND SETTLE PATH, AND THAT IS WHAT THIS HOLDS. The card mounts
     * `ProposalGovernance` — the same component the fork's own record page mounts, posting to the
     * same route, refused to every agent by the same guard. A card that grew its own form would be
     * a second way to write the one record Mole Office refuses to agents, which is the last place in
     * this product where two implementations would be acceptable.
     *
     * The lettered options, each a button that writes the decision, are that panel's own control,
     * so their presence is the mount and they are what the press must open.
     */
    /**
     * ASKED OF THE FOLD'S OWN CONTENTS FROM 27 AUGUST 2026, because the fold is built on the press
     * rather than with the card. The claim is unchanged: pressing "Decide it" opens the one panel
     * that settles a fork. What changed is where the test has to look for it.
     *
     * AND WHAT IT LOOKS FOR CHANGED ON 6 SEPTEMBER 2026. It read for `Record this decision`, the
     * submit under the option list. The option cards are the buttons that write the decision now —
     * criterion M57 — and that submit is drawn only for
     * the answer a press cannot supply. The mount is now proved by the control that replaced it.
     */
    const rows = dec.readDecisions(FORKS, NOW, [])
    const row = rows[0] as (typeof rows)[number]
    const fold = body(h(gov.DecideBody, { row, here: 'panelx', onSettled: () => {}, inspect: false }))
    expect(fold).toContain('button type="button" class="px-gov-opt-inner"')
    // The recorded options themselves, which is what "show the choices" means.
    expect(fold).toContain('Take the first')
    expect(fold).toContain('Take the second')
    // And nothing promises to finish the act somewhere else: the ellipsis went with the handoff.
    expect(fold, 'the card is promising to settle a fork somewhere else').not.toContain('Settle it')
    // THE WAY OUT IS ON THE CLOSED ROW NOW, not at the bottom of an open form. A person who wants
    // the record rather than the decision should not have to open the decision to find it.
    const html = body(h(tiles.DecisionTiles, props()))
    expect(scanned(html)).toContain('Open the full record')
  })

  it('names the project the decision will land in, and says when it is one you are not reading', () => {
    /**
     * THE POINT OF THE PROJECTION, ON SCREEN. This band spans projects, so a card somebody is about
     * to write a decision in has to say which project that decision goes to.
     *
     * ASKED OF THE FOLD FROM 27 AUGUST 2026, because that is where the naming is and the fold is
     * built on the press now. The closed row still says when the fork is somewhere else — that is
     * the `dq-where` chip, and it is asserted below — and the fold names the project for every
     * fork, including the ones you are reading.
     */
    const rows = dec.readDecisions(FORKS, NOW, [])
    const row = rows[0] as (typeof rows)[number]
    const here = body(h(gov.DecideBody, { row, here: 'panelx', onSettled: () => {}, inspect: false }))
    expect(here).toContain('Mole Office')
    expect(here).not.toContain('a project you are not reading')

    const away = body(h(gov.DecideBody, { row, here: 'robotics', onSettled: () => {}, inspect: false }))
    expect(away).toContain('a project you are not reading')
    // And the closed row says it too, without opening anything.
    expect(scanned(body(h(tiles.DecisionTiles, { ...props(), here: 'robotics' })))).toContain('dq-where')
  })

  it('says what the server could not read on a fork rather than dropping it', () => {
    const rows = dec.readDecisions(
      [fork({ unreadable: ['1 of the 2 options on this fork is not text, so it is neither counted nor shown here.'] })],
      NOW,
      [],
    )
    const html = body(h(tiles.DecisionTiles, { ...props(), rows }))
    expect(html).toContain('data-mark="unread"')
    const developer = body(h(tiles.DecisionTiles, { ...props(), rows, inspect: true }))
    expect(developer).toContain('is not text')
  })

  it('names the work a fork is holding up, not only how much of it there is', () => {
    const rows = dec.readDecisions(
      [fork({ blocks: [{ recordId: 't-1', title: 'Wire Home to the fork projection', kind: 'task' }] })],
      NOW,
      [],
    )
    const row = rows[0] as (typeof rows)[number]
    // The count is on the closed row, so a person scanning knows this one is holding something up.
    expect(scanned(body(h(tiles.DecisionTiles, { ...props(), rows })))).toContain('holding up')
    // The names are in the fold, which is built on the press from 27 August 2026.
    const fold = body(h(gov.DecideBody, { row, here: 'panelx', onSettled: () => {}, inspect: false }))
    expect(fold).toContain('Wire Home to the fork projection')
    expect(fold).toContain('Waiting on this answer')
  })

  it('puts the title above the cues, so the first words on Home are the question itself', () => {
    // The cues used to be the line ABOVE the title, so the first thing read on the whole page was
    // "3 options · no recommendation" and the sentence the fork is about came second.
    // THE FIRST CARD, because the fixture is drawn in the order the server sent it and the indexes
    // below are of the whole list. Reading a later card's title against the first card's cues would
    // compare two different cards.
    const html = body(h(tiles.DecisionTiles, props()))
    const title = html.indexOf('Recommended, filed today')
    const cues = html.indexOf('class="dq-cues"')
    expect(title).toBeGreaterThan(-1)
    expect(cues).toBeGreaterThan(title)
  })

  it('prints no count of its own: the band above counts once, for both surfaces', () => {
    // The view presents props and nothing else. That rule outlives the variant slot it came from,
    // because Home and the decisions page both draw these cards and both print their own head line.
    const html = body(h(tiles.DecisionTiles, props()))
    expect(html).not.toContain('waiting ·')
    expect(html).not.toContain('4</b> waiting')
  })

  it('draws record ids beside their titles in developer mode', () => {
    // 7FEOshq3mBGG keeps identifiers in developer mode; the title remains beside each one.
    const normal = withoutTheAddress(body(h(tiles.DecisionTiles, props())))
    const developer = withoutTheAddress(body(h(tiles.DecisionTiles, { ...props(), inspect: true })))
    expect(developer, 'the developer card lost its identifier').toContain('p-old-rec')
    expect(developer).toContain('rid-card')
    expect(developer).toContain('rid-text')
    expect(developer).toContain('Recommended, filed five days ago')
    expect(normal).toContain('Recommended, filed five days ago')
    expect(normal, 'the raw project key reached a Normal reader').not.toContain('>panelx<')
  })
})

describe('the variant slot that asked how to draw this band, now that the question has been answered', () => {
  it('leaves the queue with no view to choose between, so nothing can be switched to nothing', () => {
    // The parent used to look a chosen option up in a table of components and refuse an option it
    // had none for. There is one view, so there is no table, no chosen option and no refusal —
    // and no way for the band to draw a component the switcher cannot reach.
    expect('decisionView' in queue).toBe(false)
    expect('DECISION_VIEWS' in queue).toBe(false)
  })
})

// ============================================================================ band 1: what you decided

/**
 * THE OWNER SETTLED THEIR FIRST DECISION AND COULD NOT FIND IT AGAIN.
 *
 * > "it just disappeared and it is difficult to review it or change my mind"
 *
 * A decision leaving the queue the moment somebody makes it is right: nothing is waiting on anybody
 * any more. Leaving no trace on the one page they were looking at is not.
 *
 * Nothing new is stored to fix that. These are the `decision` records themselves, read by the same
 * projection that decides which forks are still open — so most of them answer no proposal at all,
 * which is what no reading of forks could ever see.
 */
describe('where a decision you made went', () => {
  type Made = Parameters<Decisions['readDecided']>[0][number]

  function made(over: Partial<Made> = {}): Made {
    return {
      recordId: 'd-1',
      title: 'A plan is person-level and points across projects',
      workspaceId: 'panelx',
      workspaceTitle: 'Mole Office',
      optionTaken: 'A plan is person-level and points across projects',
      optionIndex: 0,
      proposalId: 'p-1',
      question: 'Which project does a plan belong to?',
      decidedOn: null,
      createdAt: daysAgo(1),
      ...over,
    }
  }

  it('keeps what was decided this week and counts everything there has ever been', () => {
    const read = dec.readDecided([made(), made({ recordId: 'd-old', createdAt: daysAgo(30) })], NOW)
    expect(read.shown.map((one) => one.recordId)).toEqual(['d-1'])
    expect(read.recent).toBe(1)
    // The one outside the window is still COUNTED. A band showing one of two with nothing saying so
    // is a band a reader has no reason to distrust and every reason to.
    expect(read.total).toBe(2)
  })

  it('caps what it draws and still reports the true total', () => {
    const many = Array.from({ length: 6 }, (_, i) => made({ recordId: `d-${i}` }))
    const read = dec.readDecided(many, NOW)
    expect(read.shown.length).toBe(dec.DECIDED_SHOWN)
    expect(read.recent).toBe(6)
    expect(read.total).toBe(6)
  })

  it('says when it was filed, and invents nothing from a stamp it cannot read', () => {
    const read = dec.readDecided([made({ createdAt: daysAgo(2) })], NOW)
    expect(read.shown[0]?.agoShort).toBe('2d')
    expect(read.shown[0]?.ago).toBe('Filed 2 days ago')
    // An unreadable stamp is kept rather than dropped — dropping it would make the count above it
    // arithmetic about a row nobody can see — and it says it cannot be dated instead of saying "0d".
    const bad = dec.readDecided([made({ createdAt: 'not a date' })], NOW)
    expect(bad.shown.length).toBe(1)
    expect(bad.shown[0]?.agoShort).toBe('no date')
    expect(bad.shown[0]?.ago).toBe('Mole Office cannot read the date on this')
  })

  it('marks a decision that took NONE of the recorded options, which is a real stored answer', () => {
    // design/DECISIONS-PENDING §38: a decision selects a recorded option or an explicit custom one,
    // and the difference is `option_index`. Null with words beside it means "none of these, here is
    // what I am doing instead" — not "nobody recorded which".
    const own = dec.readDecided([made({ optionIndex: null, optionTaken: 'Neither. I am rewriting the loader.' })], NOW)
    expect(own.shown[0]?.ownAnswer).toBe(true)
    expect(own.shown[0]?.taken).toBe('Neither. I am rewriting the loader.')

    const picked = dec.readDecided([made()], NOW)
    expect(picked.shown[0]?.ownAnswer).toBe(false)

    // Both fields empty is neither: the decision says nothing about which option it took, and that
    // must not read as a custom answer.
    const silent = dec.readDecided([made({ optionIndex: null, optionTaken: null })], NOW)
    expect(silent.shown[0]?.ownAnswer).toBe(false)
    expect(silent.shown[0]?.taken).toBeNull()
  })

  /**
   * THE PAGE HAS NO WINDOW AND NO CAP, AND IT WORKS THE PHRASES OUT THE SAME WAY.
   *
   * Home is about what needs you now, so it shows a week and says what it held back. The decisions
   * page IS the history, so cutting any of it would be the page failing at its only job. What both
   * share is how a stored decision becomes the words on a card — worked out in one function, so one
   * surface cannot say "None of the options" about a decision the other draws as an ordinary one.
   */
  it('gives the decisions page every decision, however old, with the same phrases on it', () => {
    const all = dec.readEveryDecided(
      [made(), made({ recordId: 'd-old', createdAt: daysAgo(400) }), made({ recordId: 'd-mid', createdAt: daysAgo(30) })],
      NOW,
    )
    // ALL THREE ARE THERE. What order they come in is the test below.
    expect([...all.map((one) => one.recordId)].sort()).toEqual(['d-1', 'd-mid', 'd-old'])
    expect(all.find((one) => one.recordId === 'd-old')?.agoShort).toBe('400d')
    // The same reading as the band's, on the one they share.
    const shown = dec.readDecided([made()], NOW).shown[0]
    expect(all[0]?.ago).toBe(shown?.ago)
    expect(all[0]?.taken).toBe(shown?.taken)
  })

  /**
   * NEWEST FIRST. Criterion M44: the decisions were in the wrong order, with the newest at the
   * bottom.
   *
   * THE THREE GO IN OLDEST FIRST, so an order that is simply the order they arrived in fails. The
   * server does sort these newest first as well; before this the page was right only because that
   * happened to be true, and a change there would have turned the page round with nothing failing.
   */
  it('draws the newest decision first, whatever order the server sent them in', () => {
    const order = dec
      .readEveryDecided(
        [
          made({ recordId: 'd-oldest', createdAt: daysAgo(400) }),
          made({ recordId: 'd-middle', createdAt: daysAgo(30) }),
          made({ recordId: 'd-newest', createdAt: daysAgo(1) }),
        ],
        NOW,
      )
      .map((one) => one.recordId)
    expect(order).toEqual(['d-newest', 'd-middle', 'd-oldest'])
    // AND HOME'S BAND IS THE SAME LIST, because it is read through the same function.
    expect(dec.readDecided([made({ recordId: 'd-a', createdAt: daysAgo(3) }), made({ recordId: 'd-b' })], NOW).shown.map((one) => one.recordId)).toEqual([
      'd-b',
      'd-a',
    ])
  })

  it('puts a decision whose stamp cannot be read last, and keeps it', () => {
    // A STAMP NOBODY CAN READ IS NOT GIVEN A DATE. Sorting it as the newest would put a row nobody
    // can date at the top of a list whose whole order is dates; dropping it would make the count
    // above the list arithmetic about a row nobody can see.
    const order = dec
      .readEveryDecided(
        [
          made({ recordId: 'd-nodate', createdAt: 'not a date' }),
          made({ recordId: 'd-old', createdAt: daysAgo(9) }),
          made({ recordId: 'd-new', createdAt: daysAgo(1) }),
        ],
        NOW,
      )
      .map((one) => one.recordId)
    expect(order).toEqual(['d-new', 'd-old', 'd-nodate'])
  })

  it('leads a card with the QUESTION, and puts what was taken under it', () => {
    // A decision's title is written by Mole Office from what was taken, so leading with the title would
    // print the answer twice and never say what it answered.
    const html = body(
      h(cards.DecidedCards, { rows: dec.readDecided([made()], NOW).shown, here: 'panelx', onOpen: () => {} }),
    )
    const question = html.indexOf('Which project does a plan belong to?')
    const taken = html.indexOf('A plan is person-level and points across projects')
    expect(question).toBeGreaterThan(-1)
    expect(taken).toBeGreaterThan(question)
    // And the question it answers is reachable, which is what changing your mind needs.
    expect(html).toContain('the question')
  })

  it('says so when a decision answers no question, rather than drawing an empty line', () => {
    // Five of the eight decisions in the live corpus were filed on their own, with no proposal.
    // Absence is a real answer here and it is told apart from a gap.
    const alone = made({ proposalId: null, question: null, optionIndex: null, title: 'Never change the GPU driver' })
    const html = body(
      h(cards.DecidedCards, { rows: dec.readDecided([alone], NOW).shown, here: 'panelx', onOpen: () => {} }),
    )
    expect(html).toContain('Never change the GPU driver')
    expect(html).toContain('no question was filed with this')
    expect(html, 'a decision with no fork is offering a press to a record that does not exist').not.toContain(
      '>the question<',
    )
  })

  it('encloses each decision, so the history is counted before it is read', () => {
    // The owner read the old settled list as more explanation rather than as a list of things: a
    // column of grey sentences with no border round one and no rule between two IS a paragraph.
    const rows = dec.readDecided([made(), made({ recordId: 'd-2' })], NOW).shown
    const html = body(h(cards.DecidedCards, { rows, here: 'panelx', onOpen: () => {} }))
    expect((html.match(/class="dq-past-card"/g) ?? []).length).toBe(2)
    expect(queue.DECISION_QUEUE_CSS).toMatch(/\.dq-past-grid\s*\{[^}]*display:\s*grid/)
    expect(queue.DECISION_QUEUE_CSS).toMatch(/\.dq-past-card\s*\{[^}]*border:\s*var\(--border-w\)/)
  })

  it('counts what it is holding back and points at the page that holds all of it', () => {
    const html = body(
      h(queue.DecidedLine, {
        read: dec.readDecided(Array.from({ length: 5 }, (_, i) => made({ recordId: `d-${i}` })), NOW),
        here: 'panelx',
        onOpen: () => {},
        anyWaiting: true,
      }),
    )
    expect(html).toContain('What you decided')
    // Never the bare word "more": how many are drawn, how many there are, and where the rest is.
    expect(html).toContain('>3</b>')
    expect(html).toContain('>5</span>')
    expect(html).toContain('All your decisions')
    // The link is to the page that spans every project. It used to say "every" and land on one
    // project's page holding 2 of the 8 decisions on file.
    // The link is to the queue that page grew into, which still spans every project.
    expect(html).toContain('href="#/governance"')
  })

  it('draws nothing at all when nothing has ever been decided', () => {
    const html = body(
      h(queue.DecidedLine, { read: dec.readDecided([], NOW), here: 'panelx', onOpen: () => {}, anyWaiting: false }),
    )
    expect(html).toBe('')
  })
})

// ============================================================================ what a project is called

/**
 * ONE PROJECT, ONE NAME, ON BOTH KINDS OF DECISION CARD.
 *
 * The catch-all project has the id `unassigned` and the server stores its title as "Unassigned".
 * The title is what the product calls it, and the id is never shown: `projectName` in
 * src/web/lib/projects.ts is the one function that draws a project's name, and it draws the stored
 * title for every project.
 *
 * These cards used to print neither. The closed card printed the raw ID and the fold under it
 * printed the stored TITLE, while `projectName` was renaming this one project to "Not in a project"
 * — so one screen could say "in unassigned", "Unassigned" and "Not in a project" about the same
 * project. A first-time tester listed that as a confusion. The renaming was deleted on 16 August
 * 2026 by decision `AtiSHfG00BVV`, which is why the words below are the stored title.
 *
 * NOTHING FAILS WHEN THIS DRIFTS, which is why it is pinned. Printing `row.workspaceId` type-checks,
 * renders, and looks right on every project except the one it is wrong about.
 */
describe('the catch-all project is called the same thing on every decision card', () => {
  const homeless = { workspaceId: UNASSIGNED_WORKSPACE, workspaceTitle: 'Unassigned' }

  type Made = Parameters<Decisions['readDecided']>[0][number]
  const made = (over: Partial<Made> = {}): Made => ({
    recordId: 'd-1',
    title: 'A plan is person-level and points across projects',
    workspaceId: 'panelx',
    workspaceTitle: 'Mole Office',
    optionTaken: 'A plan is person-level and points across projects',
    optionIndex: 0,
    proposalId: 'p-1',
    question: 'Which project does a plan belong to?',
    decidedOn: null,
    createdAt: daysAgo(1),
    ...over,
  })

  it('names it on a waiting card, on the face and inside the fold, in the reader’s words', () => {
    const rows = dec.readDecisions([fork(homeless)], NOW, [])
    const row = rows[0] as (typeof rows)[number]
    const html = body(
      h(tiles.DecisionTiles, {
        rows,
        tally: dec.tallyDecisions(rows),
        // Read from somewhere else, so the card says where the decision lives.
        here: 'panelx',
        onOpen: () => {},
        onSettled: () => {},
        inspect: false,
      }),
    )
    // The control: this really is a card about a project the reader is not in.
    expect(html, 'the card did not say the decision lives elsewhere').toContain('dq-where')
    expect(withoutTheAddress(html), 'the raw project id reached the screen').not.toContain('unassigned')
    /**
     * ONCE ON THE FACE AND ONCE IN THE FOLD, AND THE FOLD IS ASKED SEPARATELY NOW.
     *
     * This used to count two occurrences in one string, because the fold's contents were built with
     * the card whether anybody opened it or not. From 27 August 2026 they are built on the press —
     * the owner's section 8, and the measurement behind it: Home held 26 whole decision forms at first
     * paint. So the face is counted here and the fold is rendered on its own below. The claim is
     * unchanged and is still that the two agree.
     */
    expect((html.match(/Unassigned/g) ?? []).length, 'the face names the project once').toBe(1)
    const fold = body(
      h(gov.DecideBody, { row, here: 'panelx', onSettled: () => {}, inspect: false }),
    )
    expect((fold.match(/Unassigned/g) ?? []).length, 'the fold names the project once').toBe(1)
    expect(withoutTheAddress(fold), 'the raw project id reached the fold').not.toContain('unassigned')
  })

  it('names it the same way on a decision already made', () => {
    const rows = dec.readDecided([made(homeless)], NOW).shown
    const html = body(h(cards.DecidedCards, { rows, here: 'panelx', onOpen: () => {} }))
    expect(html, 'the control: the card did not say where the decision lives').toContain('dq-where')
    expect(withoutTheAddress(html), 'the raw project id reached the screen').not.toContain('unassigned')
    expect(html).toContain('Unassigned')
  })
})

// ============================================================================ band 3: sessions

describe('the 928px sessions block, as one line', () => {
  const lines = (states: SessionState[]) => states.map((state) => ({ state }))

  it('names what wants a person and counts the rest, rather than a six-way tally', () => {
    const read = sess.readSessionsLine(
      lines(['running', 'running', 'crashed', 'orphaned', 'orphaned', 'idle', 'finished', 'finished']),
      1,
      0,
    )
    expect(read.counts).toEqual([
      { state: 'crashed', count: 1 },
      { state: 'orphaned', count: 2 },
      { state: 'running', count: 2 },
    ])
    // Nothing vanishes: the two states the line does not name are counted and reported together.
    expect(read.quiet).toEqual([
      { state: 'idle', count: 1 },
      { state: 'finished', count: 2 },
    ])
    expect(read.total).toBe(8)
    expect(read.counts.concat(read.quiet).reduce((sum, one) => sum + one.count, 0)).toBe(read.total)
  })

  it('never draws a zero it did not count: a reply with no sweep is not a clean machine', () => {
    // `UnclaimedRead` is null when the reply carried no sweep at all — see SessionPanel.tsx. Null
    // is "this reply does not answer that question", and drawing it as 0 would be a clean bill
    // nobody established.
    const unswept = sess.readSessionsLine(lines(['running']), 0, null)
    expect(unswept.unclaimed).toBeNull()
    // "nothing swept for unclaimed processes" said the same thing in the mechanism's own words.
    // What a person needs to know is that nobody looked, which is what it says now.
    expect(body(h(home.SessionsLine, { read: unswept }))).toContain('nobody looked for processes with no agent run')

    const swept = sess.readSessionsLine(lines(['running']), 0, 0)
    expect(body(h(home.SessionsLine, { read: swept }))).not.toContain('nobody looked')
  })

  it('says which of "nothing is wrong" and "nothing was read" an empty line is', () => {
    const quiet = sess.readSessionsLine(lines(['finished', 'finished', 'idle']), 0, 0)
    const html = body(h(home.SessionsLine, { read: quiet }))
    expect(html).toContain('3</b> agent runs read')
    expect(html).toContain('none of them running, crashed, orphaned or unclassified')
  })

  it('names what it is counting, on every line, so a bare number is never left to be guessed at', () => {
    // "34 orphaned" opened this line with no subject anywhere on it. The total names the subject
    // once, in the word the navigation uses for the page every count here opens, and it is what
    // makes the counts beside it add up to something a reader can check.
    const read = sess.readSessionsLine(lines(['orphaned', 'orphaned', 'idle']), 0, 0)
    const html = body(h(home.SessionsLine, { read }))
    expect(html).toContain('3</b> agent runs read')
    expect(html).toContain('2</b> left running')
    expect(html).toContain('1</b> more, waiting for you')
    // One run read is one run, not one runs.
    expect(body(h(home.SessionsLine, { read: sess.readSessionsLine(lines(['idle']), 0, 0) }))).toContain(
      '1</b> agent run read',
    )
  })

  it('does not use one word for two things one line apart', () => {
    // THE DEFECT, OBSERVED IN A BROWSER ON 14 AUGUST 2026. The line said "7 running with no session"
    // and the box directly beneath it said "Nothing is running." Both were true: the box counts
    // AGENT RUNS in the state `running`, the line counts PROCESSES on this machine that no agent run
    // claims. A tester read the pair as the product contradicting itself in one screenful.
    const read = sess.readSessionsLine(lines(['orphaned', 'idle']), 0, 7)
    const html = body(h(home.SessionsLine, { read }))
    expect(html).toContain('7</b> process')
    expect(html).toContain('running that no agent run claims')
    // The sentence in the box beneath, which the block draws from this constant. The rule it has to
    // keep is that it names its own subject: "Nothing is running." does not, and that is what made
    // the pair read as a contradiction.
    expect(t('home.noActive')).toContain('agent run')
    expect(t('home.noActive')).not.toBe('Nothing is running.')
  })

  it('makes every count a way into the page that can do something about it', () => {
    const read = sess.readSessionsLine(lines(['crashed', 'running']), 2, 1)
    const html = body(h(home.SessionsLine, { read }))
    // Four numbers, four routes. Home's job here is to send you somewhere, not to hold a copy of
    // the sessions page. The total is the fifth number and is deliberately not a link: it is the
    // subject the other four are counts of, not a fifth thing to go and look at.
    expect((html.match(/href="#\/sessions"/g) ?? []).length).toBe(4)
    expect(html).toContain('processes still held')
    expect(html).toContain('1</b> process running that no agent run claims')
  })

  it('names every state the schema has, in one list or the other', () => {
    // The guard in sessions-line.ts throws at import if this is ever false. This is the same fact
    // asserted where a reader will find it: a seventh session state added to the schema must not
    // be counted and then silently dropped out of Home's line.
    const named = [...sess.SESSION_LINE_ORDER, ...sess.SESSION_QUIET_ORDER]
    expect([...named].sort()).toEqual([...SESSION_STATES].sort())
  })
})

// ============================================================================ band 3: the strip

describe('the "Also" strip that replaced the masonry', () => {
  it('is three equal tracks that may shrink to nothing, and stacks on a phone', () => {
    // The masonry left about 510px of dead page because two blocks shared a grid row and the row
    // was as tall as the taller one. `align-items: start` is what makes that impossible here, and
    // the 0 minimum is what stops a long title in one column pushing the two beside it sideways.
    expect(home.HOME_CSS).toMatch(/\.hp-also\s*\{[^}]*align-items:\s*start/)
    expect(home.HOME_CSS).toMatch(/\.hp-also\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/)
    expect(home.HOME_CSS).toMatch(/\.hp-also\s*\{\s*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
  })

  it('caps every column at five rows, which is the band’s whole discipline', () => {
    expect(home.ALSO_ROWS).toBe(5)
  })
})
