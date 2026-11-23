// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BOX FOR TALKING TO AN AGENT SAYS WHAT IT IS ABOUT, AND SAYS ONE THING.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Four first-time users drove this box in a browser on 18 August 2026 with no documents in front of
 * them. Every defect they hit was a screen saying something untrue about what the person had just
 * pointed at, and not one of them failed a type check or a test.
 *
 *   1. THE PANEL CONTRADICTED ITSELF. Open the box on a line of a plan that is not tracked as work.
 *      The top of the recipient list said which line of which plan you pointed at; every row under
 *      it said "You did not point at anything". Both sentences come from ONE reply to ONE request.
 *      The rows are right about the ranking and wrong about the request: nothing Mole Office holds can
 *      connect an agent to a line nobody has tracked, and that is a different fact from nobody
 *      having pointed at anything.
 *
 *   2. THE QUOTED THING LEAKED THE WRITING SYNTAX AND WAS CUT MID-WORD. A line of a plan may end in
 *      a run of groups holding its planning values — `{time: Aug 24-28} {note: reload test one}` —
 *      and a person did not think of those as part of what the line is called. Cut at sixty
 *      characters, one of them read `{note: reload test`, which is a different word and half a
 *      group.
 *
 *   3. A COMMENT ON A FEW WORDS LOST THE WORDS. In the review list it read as the name of the
 *      record the words were inside and nothing else, so nothing said which part of the writing the
 *      comment was about. The quote is stored on the comment; it simply was not drawn.
 *
 *   4. NOTHING SAID YOU COULD COMMENT ON SELECTED WORDS. Two of them found it by right-clicking at
 *      random, which the owner's acceptance bar names as a failure by hand.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT LOOKS LIKE THIS
 * ---------------------------------------------------------------------------------------
 *
 * The runner's environment is `node`, so there is no DOM. Components are rendered to static markup
 * and read back as text, which is what tests/agent-talk.test.ts does. What that cannot see is a
 * control hidden by CSS or a selection made with a mouse; the browser review photographs for the
 * first and the stylesheet is read as text below for the second.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import type { FoundMember } from '../src/server/lib/reviews.ts'
import type { RecipientCandidate, RecipientsAnswer } from '../src/server/lib/recipients.ts'
import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { recipientDisclosureForFixture } from './recipient-answer-disclosure.ts'

type Recipients = typeof import('../src/web/components/agent/Recipients.tsx')
type Context = typeof import('../src/web/components/agent/context.ts')
type Pointing = typeof import('../src/web/components/agent/PointingLayer.tsx')
type Bar = typeof import('../src/web/components/agent/ReviewBar.tsx')

let recipients: Recipients
let context: Context
let pointing: Pointing
let bar: Bar

beforeAll(async () => {
  // src/web/api.ts and src/web/lib/mode.ts both read storage when they are first imported, so the
  // smallest stand-in goes in before anything else. Nothing here is under test.
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
  recipients = await import('../src/web/components/agent/Recipients.tsx')
  context = await import('../src/web/components/agent/context.ts')
  pointing = await import('../src/web/components/agent/PointingLayer.tsx')
  bar = await import('../src/web/components/agent/ReviewBar.tsx')
})

const render = (el: React.ReactElement): string => renderToStaticMarkup(el)

// ---------------------------------------------------------------------------- fixtures

/** The line one first-time user pointed at, exactly as they wrote it. */
const THE_LINE = '- Score the slip events {time: Aug 24-28} {note: reload test one}'

/**
 * A candidate as the recipients route sends one. Test input, not an observation.
 *
 * `ground` is the server's own mark for which list a row is on: a rung of the ladder on the ranked
 * list, and null on the list of runs that are merely recent.
 */
function candidate(over: Partial<RecipientCandidate> = {}): RecipientCandidate {
  return {
    sessionId: 's1',
    title: 'The gripper calibration run',
    doing: null,
    purpose: null,
    workspaceId: 'panelx',
    deleted: false,
    why: 'It filed this report on 15 August.',
    ground: 'filed-this-record',
    alsoWhy: [],
    support: 1,
    pickUp: {
      answer: 'yes',
      runtime: 'claude-code',
      conversationId: 'c1',
      transcript: `${THE_TEST_FIXTURE_ROOT}/.claude/c1.jsonl`,
      resumeCommand: 'claude --resume c1',
      because: 'Its transcript is on this machine.',
    },
    origin: 'authored',
    originNote: null,
    recordedState: null,
    lastSeenAt: '2026-08-17 10:00:00',
    lastSeenFrom: 'change-log',
    tiedWith: [],
    ...over,
  }
}

/**
 * The reply the running server really sends for a line of a plan nobody has tracked as work.
 *
 * The two sentences and the row sentence below were read off a copy of the real corpus on 18 August
 * 2026, through GET /api/agent/recipients with a plan and a line named. They are the input to this
 * test, not its subject: what is under test is what the browser draws when it is given them.
 */
function untrackedPlanLine(): RecipientsAnswer {
  return {
    context: {
      asked: { kind: 'planLine', planId: 'p1', lineId: 'l1' },
      record: null,
      nothingFiled: {
        code: 'line-not-tracked',
        detail:
          'This line is not tracked as work yet, so there is no record for a run to have touched. ' +
          'Nothing Mole Office holds can connect an agent to it.',
      },
      workspaceId: 'panelx',
      askedForProject: null,
      elsewhere: null,
    },
    connected: [],
    recent: [
      candidate({
        sessionId: 's9',
        title: 'Round seven build run',
        ground: null,
        why: 'You did not point at anything, so nothing ranks this run. It is listed because it was active on 2026-08-18.',
      }),
    ],
    recentLeftOut: 0,
    ...recipientDisclosureForFixture(0, 1, 0),
    read: {
      rule: 'Five things count, strongest first.',
      pickUpRule: 'Whether a run can be picked up is checked on this machine.',
      whenItCannotBePickedUp: 'There are two honest choices and Mole Office offers both.',
      conversationRule: 'A sweep of this machine writes down which conversation a run was.',
      pickUp: { total: 0, stuck: 0, allSameReason: null },
      origins: { fixture: 0, unmarked: 0, authored: 0, deleted: 0 },
      sessions: 9,
      projects: 2,
      links: 4,
      changesOnThis: 0,
      changesOnThisCapped: false,
      changesRead: 40,
      changesCapped: false,
      transcriptsChecked: 9,
      tookMs: 12,
    },
  }
}

// ---------------------------------------------------------------------------- one panel, one answer

describe('the recipient list on a plan line nobody has tracked', () => {
  const drawn = (answer: RecipientsAnswer) =>
    render(
      h(recipients.RecipientPicker, {
        context: { target: { kind: 'planLine', planId: 'p1', lineId: 'l1' } },
        recipients: { status: 'ready', value: answer },
        onChoose: () => {},
        onClose: () => {},
        reviewOn: false,
      }),
    )

  it('says the line is not tracked as work, as a short state', () => {
    // THE ANSWER THE PERSON NEEDS. Without it the panel says only that nothing is ranked, which
    // reads as Mole Office failing rather than as Mole Office answering. The server's sentence is
    // not drawn, as decided; the state is.
    const html = drawn(untrackedPlanLine())
    expect(html).toContain('Not tracked as work yet')
  })

  it('never tells a person they pointed at nothing when they pointed at something', () => {
    // THE CONTRADICTION, PINNED. One reply, one panel: the top said which line of which plan, and
    // every row said the opposite about the same request.
    const html = drawn(untrackedPlanLine())
    // THE PANEL SAYS WHAT IT FOUND, IN THE SCREEN'S OWN WORDS. The server used to send
    // `You pointed at a line of the plan “…”` and this drew it; the reply now sends a code and the
    // sentence behind it, and the page carries the short answer alone.
    expect(html).toContain('Not tracked as work yet')
    expect(html, 'a row denied the request the panel above it describes').not.toContain(
      'You did not point at anything',
    )
  })

  it('keeps the reason a run is on the ranked list, which is about the run and not the request', () => {
    // A ranked run's reason says what THAT RUN did to the thing you pointed at, nothing else says
    // it, and it stays, as the row's short reason line.
    const html = drawn({ ...untrackedPlanLine(), connected: [candidate()] })
    expect(html).toContain('Created this')
  })

  it('still says when a run that is merely recent was last active', () => {
    // The row sentence carried two facts and only one of them was wrong. The day is a fact about
    // the run, so it stays, in the words this app says every other age in.
    //
    // THIS USED TO PIN THE PHRASE "Last active", and it was changed on 19 August 2026 when the row
    // became three short lines: the age now reads as part of one line, "Not connected to this ·
    // 13 days ago". What the test is protecting is the FACT, so it is written against the fact.
    // `dayPhrase` in ui.tsx is the one writer of an age in this app and "under a day" is its answer
    // for today, so those are the two shapes an age can arrive in.
    const html = drawn(untrackedPlanLine())
    expect(html, 'an unranked run no longer says when it was last active').toMatch(
      /(\d+ days? ago|under a day ago|· today)/,
    )
  })
})

// ---------------------------------------------------------------------------- what it is about

describe('the words a person wrote, not the characters a line is stored as', () => {
  it('cuts at a space and never in the middle of a word', () => {
    const cut = context.shortenToWords('Score the slip events and reload the test rig twice over', 20)
    expect(cut.shortened).toBe(true)
    expect(cut.words).toBe('Score the slip')
    // The proof it is a word boundary: putting the drawn words back at the front of the whole
    // thing lands on a space, so no word has been split.
    expect(cut.whole.slice(cut.words.length, cut.words.length + 1)).toBe(' ')
  })

  it('says nothing was left off when nothing was', () => {
    const whole = context.shortenToWords('Score the slip events', 60)
    expect(whole.shortened).toBe(false)
    expect(whole.words).toBe('Score the slip events')
  })

  it('leaves a line of a plan its words and not its planning groups', () => {
    // THE ONE READER OF THAT SYNTAX IS src/shared/planline.ts, and this goes through it. A second
    // reader here would be the same rule written twice, free to disagree with the first.
    const chip = context.chipWords({ target: { kind: 'planLine', planId: 'p1', lineId: 'l1' } }, THE_LINE)
    expect(chip.words).toBe('- Score the slip events')
    expect(chip.words).not.toContain('{')
    expect(chip.words).not.toContain('note:')
  })

  it('shows a record title as it is, because a title has no groups to read', () => {
    const chip = context.chipWords(
      { target: { kind: 'record', recordId: 'r1', workspaceId: 'panelx' } },
      'Score the slip events {not a group}',
    )
    expect(chip.words).toBe('Score the slip events {not a group}')
  })
})

// ---------------------------------------------------------------------------- the words selected

describe('a comment made on a few words shows the words', () => {
  /**
   * One member of a review, as the server sends one. Test input, not an observation.
   *
   * `reading` is what `GET /api/reviews/:id` works out per member on every request, and it is the
   * fact the review list used to draw nothing from.
   */
  const onASpan = (quote: string, over: Partial<FoundMember> = {}): FoundMember => ({
    found: true,
    source: 'annotation',
    id: 'n1',
    body: 'This paragraph is the part that is wrong.',
    context: {
      target: { kind: 'record', recordId: 'r1', workspaceId: 'panelx' },
      span: { quote, from: 4, to: 4 + quote.length, field: 'summary' },
    },
    reading: {
      state: 'there',
      about: 'the record "Register-before-you-start is broken, and here is why", r1',
      says: 'Still there.',
      quote: { words: quote, stillThere: true, at: 4, field: 'summary', lookedEverywhere: false },
    },
    state: 'queued',
    created: '2026-08-18 09:00:00',
    createdBy: `human:${THE_TEST_OFFICES_OWNER.id}`,
    key: 'record/r1/panelx',
    interpretation: null,
    chosen: null,
    restrictions: null,
    ...over,
  })

  const row = (member: FoundMember) =>
    render(
      h(bar.ReviewRow, {
        member,
        inspect: false,
        to: null,
        lit: null,
        onGo: () => {},
        onOpen: () => {},
        openNow: false,
      }),
    )

  it('draws the quote, so the row says which part of the writing it is about', () => {
    expect(row(onASpan('the sweep never runs'))).toContain('the sweep never runs')
  })

  it('shortens a long quote at a space and says it was shortened', () => {
    const long =
      'the sweep never runs in the browser so every candidate answers that it cannot be picked up'
    const html = row(onASpan(long))
    expect(html).toContain('shortened')
    expect(html, 'a word was split').not.toContain('candidat<')
  })

  it('draws no quote on a comment about a whole thing, because there is nothing quoted', () => {
    const whole = onASpan('x', { context: { target: { kind: 'record', recordId: 'r1', workspaceId: 'panelx' } } })
    expect(row(whole)).not.toContain('px-rev-quote')
  })
})

// ---------------------------------------------------------------------------- valid markup

/**
 * NO BLOCK ELEMENT SITS INSIDE A PARAGRAPH IN ANY OF THESE SURFACES.
 *
 * A browser closes a paragraph when a block element opens inside it, so the markup a person gets is
 * not the markup the component wrote — and React says so in the console, which is where a tester
 * found the plan page saying it five times over. It is checked here rather than trusted, because
 * nothing else fails when it happens.
 */
describe('the agent surfaces produce markup a browser will not rearrange', () => {
  /**
   * `<p` IS NOT ENOUGH TO FIND A PARAGRAPH, AND THAT WAS A REAL FALSE ALARM. `<path>` inside an SVG
   * starts with `<p` too, so the moment one of these surfaces drew a mark with a glyph in it, this
   * opened a "paragraph" at the glyph, read to the next `</p>` anywhere below, and reported every
   * block element in between. The tag has to end at a space or a `>` — which is what a paragraph
   * looks like and what `<path` does not. The check itself is unchanged and is still exact.
   */
  const opensAt = (html: string, from: number): number => {
    for (let at = from; ; ) {
      const open = html.indexOf('<p', at)
      if (open === -1) return -1
      const after = html[open + 2]
      if (after === '>' || after === ' ') return open
      at = open + 2
    }
  }

  const blocksInsideParagraphs = (html: string): string[] => {
    const found: string[] = []
    let at = 0
    for (;;) {
      const open = opensAt(html, at)
      if (open === -1) break
      const shut = html.indexOf('</p>', open)
      if (shut === -1) break
      const inside = html.slice(html.indexOf('>', open) + 1, shut)
      for (const tag of ['<p ', '<p>', '<div', '<dl', '<details', '<ul', '<ol', '<table']) {
        if (inside.includes(tag)) found.push(`${tag} inside a paragraph: ${inside.slice(0, 80)}`)
      }
      at = shut + 4
    }
    return found
  }

  it('finds one when there is one, so a pass means something', () => {
    expect(blocksInsideParagraphs('<p>words <div>a block</div></p>')).toHaveLength(1)
    expect(blocksInsideParagraphs('<p>words <span>not a block</span></p>')).toHaveLength(0)
    // The false alarm this matcher used to raise: an SVG path is not a paragraph.
    expect(blocksInsideParagraphs('<span><svg><path d="M0 0"/></svg></span><div>a block</div>')).toEqual([])
  })

  it('draws the recipient list without one', () => {
    const html = render(
      h(recipients.RecipientPicker, {
        context: { target: { kind: 'planLine', planId: 'p1', lineId: 'l1' } },
        recipients: { status: 'ready', value: untrackedPlanLine() },
        onChoose: () => {},
        onClose: () => {},
        reviewOn: true,
      }),
    )
    expect(blocksInsideParagraphs(html)).toEqual([])
  })

  it('draws a comment in the review pane without one', () => {
    const html = render(
      h(bar.ReviewRow, {
        member: {
          found: true,
          source: 'annotation',
          id: 'n1',
          body: 'why',
          context: { target: { kind: 'record', recordId: 'r1', workspaceId: 'panelx' } },
          reading: { state: 'there', about: 'the record r1', says: 'Still there.' },
          state: 'queued',
          created: '2026-08-18 09:00:00',
          createdBy: `human:${THE_TEST_OFFICES_OWNER.id}`,
          key: 'record/r1/panelx',
          interpretation: null,
          chosen: null,
          restrictions: null,
        },
        inspect: false,
        to: null,
        lit: null,
        onGo: () => {},
        onOpen: () => {},
        openNow: false,
      }),
    )
    expect(blocksInsideParagraphs(html)).toEqual([])
  })
})
