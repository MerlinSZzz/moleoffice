// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
/**
 * WHAT PANELX STORED IS ON A SCREEN, AND NOTHING ON A SCREEN SAYS IT WAS NOT STORED.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------------
 *
 * Two whole phases were built on the server, called done, and reached no screen. Measured in
 * Chromium against a copy of the owner's corpus on 19 August 2026:
 *
 *   1. A REVIEW HAD BEEN READ AND THE READING WAS NOWHERE. Two comments, a review, collecting
 *      finished, a reading stored beside each comment's own words. The pane printed "Mole Office has
 *      read these comments. Nothing has been sent." over two rows showing only the bodies, and
 *      neither stored sentence was in the page — before or after opening every row.
 *
 *   2. TWO LIVE STRINGS SAID PANELX KEEPS NO SUCH READING. The pane's own map of where a person can
 *      be taken answered "Mole Office does not store organised readings of what somebody wrote yet" for
 *      a proposed action, against a review that held two.
 *
 *   3. A REPORT'S STORED LABEL AND GIST DREW NEITHER. Nothing in the whole browser tree read a
 *      short form: zero references. The only place either was visible was Developer detail, as raw
 *      JSON under the stored field name.
 *
 *   4. THE PANE CUT A COMMENT AT 110 CHARACTERS AND DID NOT SAY IT CUT IT. A row read "Decide for
 *      me: we should drop the printed mount and standardise on aluminium. Write that decision down
 *      as a" — no ellipsis, no mark — while the quoted words two lines below carried the mark. The
 *      row disagreed with itself about the same fact.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IS HELD HERE, AND WHAT IS NOT
 * ---------------------------------------------------------------------------------------------
 *
 * Everything here can be decided without a browser: what the pane DRAWS from a given review, what
 * a row says about a comment too long for it, and which fields a record page prints twice. Whether
 * two columns really sit side by side at 1440 and stack at 390 is a property of a browser and is
 * measured with one, not here.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ContextReading } from '../src/server/lib/agents.ts'
import { readinessOf } from '../src/shared/readiness.ts'
import type { FoundMember, ReviewDetail, ReviewMember, ReviewView } from '../src/server/lib/reviews.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import { createI18n } from '../src/shared/i18n.ts'

type Bar = typeof import('../src/web/components/agent/ReviewBar.tsx')
type Api = typeof import('../src/web/api.ts')
type Page = typeof import('../src/web/pages/RecordPage.tsx')
type Who = typeof import('../src/web/components/agent/Recipients.tsx')

const { t } = createI18n('en')
let bar: Bar
let api: Api
let page: Page
let who: Who

beforeAll(async () => {
  // The three modules read storage the first time they are imported, so the smallest stand-in goes
  // in before any of them. Nothing here is under test.
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
  bar = await import('../src/web/components/agent/ReviewBar.tsx')
  api = await import('../src/web/api.ts')
  page = await import('../src/web/pages/RecordPage.tsx')
  who = await import('../src/web/components/agent/Recipients.tsx')
})

const render = (el: React.ReactElement): string => renderToStaticMarkup(el)

// ---------------------------------------------------------------------------- the fixtures

const READING: ContextReading = {
  state: 'there',
  about: 'the report "Round seven: the human surface finished"',
  says: 'Still there, in the same place.',
}

/** What somebody wrote. Long enough that a row has to cut it, which is the ordinary case. */
const WORDS =
  'Decide for me: we should drop the printed mount and standardise on aluminium. Write that decision ' +
  'down as a real one, and tell whoever is doing the handover trials that the printed part is out.'

/** What Mole Office made of those words, as `keptSentence` builds one and the record stores it. */
const WHAT_MOLE_OFFICE_MADE_OF_IT =
  'They want the printed mount dropped and aluminium made the standard, and they want that written down as a ' +
  'decision somebody took. What they want: change and discuss. What could exist afterwards: decision and task. ' +
  'Nothing has been filed.'

function member(over: Partial<FoundMember> = {}): FoundMember {
  return {
    found: true,
    source: 'annotation',
    id: 'n1',
    body: WORDS,
    context: { target: { kind: 'record', recordId: 'CnnEp_jlEnAt', workspaceId: 'panelx' } },
    reading: READING,
    state: 'queued',
    created: '2026-08-19 09:00:00',
    createdBy: `human:${THE_TEST_OFFICES_OWNER.id}`,
    key: 'record/CnnEp_jlEnAt/panelx',
    interpretation: null,
    chosen: null,
    restrictions: null,
    ...over,
  }
}

function review(over: Partial<ReviewView> = {}): ReviewView {
  return {
    id: 'kScwD9LbAb5f',
    workspaceId: 'panelx',
    entry: { target: { kind: 'record', recordId: 'CnnEp_jlEnAt', workspaceId: 'panelx' } },
    state: 'organised',
    started: '2026-08-19 09:40:00',
    startedBy: `human:${THE_TEST_OFFICES_OWNER.id}`,
    collectedAt: '2026-08-19 09:55:00',
    membershipFrozen: true,
    fromThreadId: null,
    sentAt: null,
    threadId: null,
    reach: 'local',
    startedByAgent: null,
    ...over,
  }
}

function detail(over: { review?: Partial<ReviewView>; members?: ReviewMember[]; organised?: ReviewDetail['organised'] } = {}): ReviewDetail {
  const members = over.members ?? [member({ interpretation: WHAT_MOLE_OFFICE_MADE_OF_IT })]
  const one = review(over.review ?? {})
  return {
    review: one,
    rule: { kind: 'record', id: 'CnnEp_jlEnAt', says: 'Everything about that report.', gaps: [] },
    members,
    // NO COMMENT SAVED WITHOUT SENDING is listed beside these, which is the case this file draws.
    saved: [],
    count: members.length,
    gaps: [],
    gapForms: [],
    // Worked out from the same four stored facts the server works it out from, rather than typed:
    // a fixture that made up an answer would be the second opinion this shape exists to prevent.
    readiness: readinessOf(one, members),
    // Nobody recorded who wrote the record these fixtures were started on, so the review goes to nobody.
    goesTo: { ground: 'nobody-recorded', recipient: null, name: null, elsewhere: [] },
    organised:
      over.organised === undefined
        ? {
            readings: [{ id: 'n1', source: 'annotation', interpretation: WHAT_MOLE_OFFICE_MADE_OF_IT }],
            without: [],
            groups: [],
            says: '1 of the 1 comments carries a reading of what Mole Office made of them.',
          }
        : over.organised,
    says: 'Collecting finished. 1 comment. Nothing has been sent.',
  }
}

/** One comment's row, opened, the way the pane opens it. */
const opened = (
  one: FoundMember,
  over: { wasRead?: boolean; without?: string | null; alsoSaid?: string[] } = {},
): string =>
  render(
    h(bar.MemberDetail, {
      member: one,
      reviewId: 'rev1',
      inspect: false,
      collecting: false,
      frozen: true,
      editing: false,
      onEditing: () => {},
      wasRead: over.wasRead ?? true,
      without: over.without ?? null,
      alsoSaid: over.alsoSaid ?? [],
    }),
  )

// ============================================================ 1. the reading is drawn

describe('what Mole Office made of a comment is on the screen beside the comment', () => {
  /**
   * THE ONE THAT MATTERS. The sentence was stored on the comment, the pane said Mole Office had read
   * the comments, and the sentence was not in the page at all.
   */
  it('draws the stored reading when the row is opened', () => {
    const html = opened(member({ interpretation: WHAT_MOLE_OFFICE_MADE_OF_IT }))
    expect(html, 'the reading Mole Office stored beside these words is on no screen').toContain(
      'They want the printed mount dropped and aluminium made the standard',
    )
  })

  it('draws it BESIDE the words and never instead of them', () => {
    const html = opened(member({ interpretation: WHAT_MOLE_OFFICE_MADE_OF_IT }))
    // Both, in one drawing. What somebody wrote is the record; the reading is a claim about it.
    expect(html).toContain('standardise on aluminium')
    expect(html).toContain('What could exist afterwards: decision and task.')
    // And each side says which is which, so neither can be read as the other.
    expect(html).toContain('What the comment says')
    expect(html).toContain('What Mole Office made of it')
  })

  it('offers the two things a person may do to a reading, and only to the reading', () => {
    const html = opened(member({ interpretation: WHAT_MOLE_OFFICE_MADE_OF_IT }))
    expect(html).toContain('Change this reading')
    expect(html).toContain('Take it away')
  })

  it('says nothing at all about a reading on a review nobody has read', () => {
    // A second column saying "nothing has been read into this" on every comment of every unread
    // review is a mark on everything, which marks nothing, and nobody has to act on it.
    const html = opened(member(), { wasRead: false })
    expect(html).not.toContain('What Mole Office made of it')
    expect(html).toContain('standardise on aluminium')
  })

  it('says a read review kept nothing beside one comment, as a state word', () => {
    const says =
      'The words of this comment live in a conversation, which has no place to keep a reading beside them.'
    const html = opened(member({ interpretation: null }), { wasRead: true, without: says })
    expect(html).toContain(t('review.pane.reading.nothing'))
    // And it does not claim a reading exists.
    expect(html).not.toContain('Change this reading')
  })

  it('reports a reply that disagrees with itself rather than drawing an ordinary absence', () => {
    // This column is drawn only on a review that HAS been read, and such a review names every
    // comment it kept nothing for. A comment in neither list is a fault in Mole Office, and a caught
    // inconsistency that carries on quietly is a decision to hide something.
    const html = render(h(bar.ReadingBesideIt, { noteId: 'n1', reading: null, without: null }))
    expect(html).toContain('fault in Mole Office')
  })
})

// ============================================================ 2. no live string denies it

describe('nothing on a screen says Mole Office keeps no reading of what somebody wrote', () => {
  /**
   * THE TEST THAT WAS HERE IS DELETED WITH `WHAT_IS_NEXT`, WHICH IS DELETED. It read the four
   * paragraphs the pane printed under its list and asserted that none of them told the reader
   * Mole Office keeps no organised reading. Step 31 replaces those paragraphs with a four-step ladder,
   * and a ladder of four words cannot carry the sentence this was watching for.
   *
   * THE TEST BELOW STILL WATCHES THE OTHER LIVE STRING THAT USED TO DENY IT. The sentence gate held
   * every other sentence in the tree by name until it was deleted, on 12 November 2026.
   */
  it('does not say so when it refuses to open a single proposed action', () => {
    const where = bar.pageHolding({ target: { kind: 'proposedAction', interpretationId: 'i1', actionId: 'a1' } })
    expect('cannot' in where, 'nothing produces a proposed action, so nothing can open one').toBe(true)
    if ('cannot' in where) {
      expect(where.cannot).not.toMatch(/does not store organised readings/i)
      // The true reason, which is narrower: a reading is one sentence and an action inside it has
      // no id of anything.
      expect(where.cannot).toMatch(/no identity of its own/i)
    }
  })

  // -------------------------------------------------------------------------------------------
  // AND THE SAME SENTENCE IS NOT ALLOWED TO SURVIVE ANYWHERE ELSE.
  //
  // When finding 2 above was fixed, it was fixed in TWO of the three files that say it. The third —
  // `src/server/lib/targets.ts`, which is what a READ of a context answers rather than what a screen
  // draws — kept telling anybody who asked that Mole Office stores no organised readings, five days after
  // it started storing them. Correcting the copies you happened to open is how a claim comes back.
  //
  // The reason now has one home, `WHY_AN_ACTION_INSIDE_A_READING_HAS_NO_IDENTITY` and
  // `WHY_A_DRAFT_IS_NOT_ON_THE_SERVER` in shared/targets.ts, and this scans the source for anybody
  // writing their own.
  // -------------------------------------------------------------------------------------------
  it('is not written again in any other file, in either of the two shapes it came back in', () => {
    // Relative to the repository root, which is where vitest runs, the same as `browserFiles` below.
    const root = 'src'
    const offenders: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(path)
          continue
        }
        if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx')) continue
        const source = readFileSync(path, 'utf8')
        // The "yet" is the whole of the first one. An unsent instruction is kept out of the server on
        // purpose, so a sentence promising to store one later describes a plan nobody has.
        if (/does not store unsent agent instructions yet/i.test(source)) offenders.push(`${path} — "yet"`)
        // And this one simply stopped being true.
        if (/does not store organised readings/i.test(source) && !path.endsWith('what-was-stored-is-drawn.test.ts')) {
          offenders.push(`${path} — organised readings`)
        }
      }
    }
    walk(root)
    expect(offenders, 'a file states one of these reasons in its own words instead of importing it').toEqual([])
  })

  it('has a call that changes a reading and a call that takes one away', () => {
    expect('setInterpretation' in api.api, 'no screen can change what Mole Office made of a comment').toBe(true)
  })
})

// ============================================================ 3. a cut says it is a cut

describe('a row that shows the first words of a comment says that is what it is showing', () => {
  const row = (one: FoundMember): string =>
    render(
      h(bar.ReviewRow, {
        member: one,
        inspect: false,
        to: null,
        lit: null,
        onGo: () => {},
        onOpen: () => {},
        openNow: false,
      }),
    )

  it('marks the cut on the comment, the way it already marks the cut on a quote', () => {
    const html = row(member())
    expect(html, 'the row cut somebody’s words and said nothing about having cut them').toContain(
      'shortened',
    )
  })

  it('says nothing when the whole comment fits', () => {
    const html = row(member({ body: 'These two numbers disagree.' }))
    expect(html).toContain('These two numbers disagree.')
    expect(html).not.toContain('shortened')
  })
})

// ============================================================ 4. a reading is not drawn twice

describe('a comment page prints what Mole Office made of the words once, beside them', () => {
  const comment = (data: Record<string, unknown>): PanelRecord =>
    ({
      id: 'n1',
      kind: 'annotation',
      title: 'Decide for me',
      summary: null,
      data,
      workspaceId: 'panelx',
      createdAt: '2026-08-19 09:00:00',
      updatedAt: '2026-08-19 09:00:00',
      deletedAt: null,
    }) as unknown as PanelRecord

  it('leaves the reading out of the fold stack, because the panel above draws it', () => {
    // It used to be reachable only through a collapsed fold headed with the stored field name,
    // below the words rather than beside them, with no way to change it or take it away.
    const sections = page.bodySections(
      comment({
        body: WORDS,
        state: 'queued',
        context: { target: { kind: 'record', recordId: 'CnnEp_jlEnAt', workspaceId: 'panelx' } },
        interpretation: WHAT_MOLE_OFFICE_MADE_OF_IT,
      }),
    )
    expect(
      sections.map((s) => s.key),
      'the reading is drawn twice: once beside the words and once in a fold below them',
    ).not.toContain('interpretation')
  })
})

// ============================================================ 5. a short form reaches a screen

/**
 * WHAT A ROW DRAWS OF THE THING A COMMENT IS ABOUT, WHICH IS WHERE A STORED SHORT FORM REACHES A
 * READER OF THIS PANE.
 *
 * ---------------------------------------------------------------------------------------------
 * THE MEASUREMENT THIS GUARDS
 * ---------------------------------------------------------------------------------------------
 *
 * On 19 August 2026 the whole browser tree held ZERO references to a record's short forms:
 * `grep -rn 'shortForms|short-forms|ShortForm' src/web` returned nothing. A report holding a stored
 * label and a stored gist drew neither, and the only place either was visible was Developer detail,
 * as raw JSON under the stored field name.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT THESE TWO CASES REPLACED, ON 3 SEPTEMBER 2026, AND WHY
 * ---------------------------------------------------------------------------------------------
 *
 * THE CASES HERE WERE A SOURCE SEARCH AND A LIST OF METHOD NAMES. One walked `src/web` looking for
 * the characters `api.shortForms(` and required at least one file to hold them; the other asked
 * whether three names existed on the `api` object. Neither drew anything, so both would pass with
 * every screen drawing nothing — which is finding 3 above, exactly.
 *
 * AND THE PANEL THEY WERE WRITTEN FOR IS GONE. *Shorter forms of this report* was removed from the
 * record page by a ruling (criteria A10 and A13 of
 * design/pointing-reopened/ACCEPTANCE.md retired, section C-3Sept of design/problem-02/
 * ACCEPTANCE.md). `api.shortForms` has one caller left, the composer, and
 * `tests/the-composer-says-who-wrote-a-form.test.ts` opens that in a real browser.
 *
 * SO THIS ASKS WHAT THIS PANE DRAWS, which is where the pane's own short-form reader ends up. The
 * pane asks the server for one length of every record its comments are about, `gistBeside` decides
 * what there is to say about each, and the ROW draws that answer.
 *
 * `tests/organising-is-reachable.test.ts` covers `gistBeside`, the function. Nothing covered the
 * row. A correct answer that no element draws is finding 1 of this file happening again, one
 * component along, so the row is what is asserted here.
 */
describe('a row draws the gist of the thing the comment is about', () => {
  /** One comment's row, opened, with the pane's answer about the record behind it handed in. */
  const rowWith = (gist: Parameters<typeof bar.MemberDetail>[0]['gist']): string =>
    render(
      h(bar.MemberDetail, {
        member: member(),
        reviewId: 'rev1',
        inspect: false,
        collecting: false,
        frozen: true,
        editing: false,
        onEditing: () => {},
        wasRead: true,
        without: null,
        alsoSaid: [],
        gist,
      }),
    )

  /** Twenty to thirty words somebody wrote on purpose, which is what a gist is. */
  const WROTE =
    'The printed wrist mounts broke below the load the handover trials need, so aluminium is the ' +
    'only version still worth testing.'

  it('draws the words somebody wrote, under a line saying whose they are', () => {
    const html = rowWith({ kind: 'gist', text: WROTE, current: true, says: 'Written by a person.' })
    expect(html, 'the stored gist of the record this comment is about is on no screen').toContain(WROTE)
    // AND SOMETHING SAYS WHOSE WRITING IT IS. Without the heading a line of somebody else's prose
    // sits above the comment and a reader takes it for part of the comment.
    expect(html).toContain('What this comment is about')
  })

  it('says nobody wrote one, rather than drawing the opening of the record instead', () => {
    const html = rowWith({ kind: 'none', says: 'Nobody has written a gist of that record.' })
    expect(html, 'the row says nothing about a length nobody wrote').toContain('no gist of that record')
    expect(html, 'the row invented a gist out of the record it could not read one of').not.toContain(WROTE)
  })

  it('tells nobody having looked apart from nobody having written', () => {
    const html = rowWith({ kind: 'nobody-looked', says: 'Mole Office has not asked.' })
    expect(html).toContain('gist not looked for')
    expect(html, 'not having asked was drawn as nobody having written').not.toContain('no gist of that record')
  })

  it('draws no mark at all where nothing could ever be written', () => {
    // A comment about a plan line or about the page names no record, so it has no short forms of
    // any length. An absence mark there would be a mark on a thing nobody can act on.
    const html = rowWith({ kind: 'nothing-to-ask' })
    expect(html).not.toContain('no gist of that record')
    expect(html).not.toContain('gist not looked for')
    expect(html).not.toContain('What this comment is about')
  })
})

// ============================================================ 6. two rows a person can tell apart

describe('no two agents in one picker draw the same name', () => {
  /**
   * MEASURED ON A COPY OF THE OWNER'S CORPUS on 19 August 2026, on the picker for one report: ten
   * candidates, of which two drew "2026-08-13 15:52 — a session that …" — the same name, the same
   * line beneath it, and the same pick-up mark. Nothing on either row said which was which.
   *
   * A LABEL IS WHAT PHASE 11 WOULD ANSWER THIS WITH AND THERE IS NONE. Short forms are declared on
   * the kinds that hold a body — a module and a report — and a run is a `session`, which declares
   * none. So the honest name is the one the run was given, and the fix is to stop cutting the two
   * that collide rather than to invent a shorter form nobody wrote.
   */
  const candidate = (sessionId: string, title: string) =>
    ({ sessionId, title }) as unknown as Parameters<typeof who.namesInList>[0][number]

  it('draws the whole name of two runs whose cut names are the same', () => {
    const long = '2026-08-13 15:52 — a session that has not said what it is for yet'
    const names = who.namesInList([candidate('s1', `${long} (hooktest)`), candidate('s2', long)])
    expect(names.get('s1')).toBe(`${long} (hooktest)`)
    expect(names.get('s2')).toBe(long)
    expect(names.get('s1')).not.toBe(names.get('s2'))
  })

  it('leaves a name that is already one of a kind cut to one line', () => {
    const names = who.namesInList([
      candidate('s1', 'Round seven build run — Plan and Schedule corrections, then the rest'),
      candidate('s2', 'Round eight: semantic addressability and the Revision Ledger'),
    ])
    expect(names.get('s1')?.endsWith(' …'), 'a unique name stopped being cut to one line').toBe(true)
    expect(names.get('s2')?.endsWith(' …')).toBe(true)
  })

  it('leaves a short name alone', () => {
    const names = who.namesInList([candidate('s1', 'Round 7 agent')])
    expect(names.get('s1')).toBe('Round 7 agent')
  })
})

// ============================================================ 6. who it is for is read, not remembered

/**
 * WHO A COMMENT IS FOR IS DRAWN FROM WHAT IS STORED ON THE COMMENT.
 *
 * WHAT WENT WRONG. The row held the choice in `useState` and nowhere else. It died when the row was
 * collapsed, when the pane was rebuilt and on every reload, and the screen then said nobody had
 * been chosen for a comment somebody had chosen an agent for ten minutes earlier. Point 18 of
 * design/ROUND-EIGHT-DOGFOOD.md.
 *
 * THESE TESTS DRAW THE ROW WITH NOTHING BUT THE SERVER'S ANSWER. There is no press in a rendered
 * string, so a row that only knew a choice from a press could not pass them.
 */
describe('who a comment is for comes from the comment', () => {
  const goingToANewAgent = {
    recipient: { kind: 'new' as const, sessionId: null, said: null, why: null },
    canSend: true,
    says: 'This goes to a new agent. Nothing about it assumes the agent has seen this work before.',
  }

  it('draws the stored choice, in the server sentence, with no press having happened', () => {
    const html = opened(member({ chosen: goingToANewAgent }))
    expect(html, 'a choice that is stored on the comment is not on the screen').toContain(
      'This goes to a new agent.',
    )
    expect(html).toContain('Change the recipient')
    // AND THE PRESS THAT HANDS IT OVER IS THERE, because somebody has been chosen.
    expect(html).toContain('Send this comment')
  })

  it('says nobody has been chosen when nothing is stored, and offers no press that would send it', () => {
    const html = opened(member({ chosen: null }))
    expect(html).toContain('No recipient')
    expect(html).toContain('Choose a recipient')
    expect(html).not.toContain('Send this comment')
  })
})

// ============================================================ 7. a group is not in the editable box

/**
 * WHAT WAS SAID OF SEVERAL COMMENTS AT ONCE IS DRAWN UNDER THE READING AND OUTSIDE THE BOX.
 *
 * WHAT WENT WRONG. The group's sentence was part of the reading stored beside every member, so
 * "Change this reading" put it in a free-text box, and saving replaced it. Point 17.
 */
describe('what was said of several comments at once', () => {
  const SAID_WITH = 'Said with 1 other comment: Two comments make the same complaint.'

  it('is drawn under the reading', () => {
    const html = opened(member({ interpretation: WHAT_MOLE_OFFICE_MADE_OF_IT }), { alsoSaid: [SAID_WITH] })
    expect(html).toContain(SAID_WITH)
  })

  it('is drawn even when the reading beside that comment has been taken away', () => {
    // A person may refuse a reading. What was true of several comments was not theirs to refuse on
    // everybody else's behalf, and it is stored somewhere a refusal here cannot reach.
    const html = opened(member({ interpretation: null }), { alsoSaid: [SAID_WITH] })
    expect(html).toContain(SAID_WITH)
  })
})
