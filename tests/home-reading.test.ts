// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT HOME SAYS IN ONE LINE WHERE IT USED TO SAY IT IN FIVE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THESE TESTS ARE ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * Two blocks on the home page were measured as persistent prose and both were shortened rather
 * than deleted. This file pins the part of each that a screenshot cannot check.
 *
 *   "SINCE YOU LAST LOOKED" spent six lines of the server's paragraph saying, most of the time,
 *   that no reading point has ever been marked. The paragraph is now in Developer mode, whole, and a
 *   single line stands in its place. THE HONESTY IS THE WHOLE POINT OF THE TESTS BELOW: "no
 *   reading point recorded" must never be drawn as "nothing has changed", and the rows under that
 *   line are the newest writes in the log rather than the ones you have not seen. Both halves of
 *   that have to be IN the line, because a fold cannot carry a correction to what is on screen.
 *
 *   THE PIPELINES BLOCK printed the current step's state word beside a chip already saying it, and
 *   gave "2/6" as the only picture of where a pipeline stands. The strip is the picture. It is a
 *   drawing, so what is tested here is its WORDS — the sentence it is labelled with, which is what
 *   a screen reader is given and what a person gets on hover. That colour and height read correctly
 *   is only verified by the photographs in tools/review.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT LOOKS LIKE THIS
 * ---------------------------------------------------------------------------------------
 *
 * The runner's environment is `node`: no DOM. So, as tests/home-attention.test.ts does it, the
 * pure functions are called directly and the components are rendered to static markup.
 * src/web/api.ts reads window.localStorage at module scope and HomePage.tsx reaches it, so the
 * smallest stand-in for a window is installed before anything that touches it is loaded.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Change, ItemState, PanelRecord } from '../src/shared/types.ts'
import { t } from '../src/shared/i18n.ts'

type HP = typeof import('../src/web/pages/HomePage.tsx')
type MP = typeof import('../src/web/components/ModulesPanel.tsx')

let hp: HP
let mp: MP
let mode: typeof import('../src/web/lib/mode.ts')

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
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  hp = await import('../src/web/pages/HomePage.tsx')
  mp = await import('../src/web/components/ModulesPanel.tsx')
  mode = await import('../src/web/lib/mode.ts')
})

/** The markup with the hoisted style blocks removed, so a class name in the CSS is not evidence. */
function body(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

/**
 * What a reader sees WITHOUT pressing anything.
 *
 * Every fold in this app is a native `<details>`, so its body is in the markup whether it is open
 * or shut and `toContain` cannot tell the two apart. The scan line is the `<summary>`; the whole
 * point of the change block's pass is what is on the closed row, so an assertion that could not
 * see the difference between closed and open would be testing nothing.
 */
function scanLines(html: string): string[] {
  return [...html.matchAll(/<summary[^>]*>([\s\S]*?)<\/summary>/g)].map((match) => match[1] ?? '')
}

const scanned = (html: string): string => scanLines(html).join('\n')

/** The markup with every `<summary>` removed: what is ONLY reachable by opening something. */
function behindAFold(html: string): string {
  return html.replace(/<summary[^>]*>[\s\S]*?<\/summary>/g, '')
}

function step(id: string, name: string, state: ItemState) {
  return { id, name, state }
}

// ============================================================================ since you last looked

describe('the one line that stands where the server’s paragraph stood', () => {
  it('never lets “no reading mark” read as “nothing has changed”', () => {
    const line = hp.sinceLead('never-looked', null, 8)
    // The two things that must not be confused, apart, in the same line.
    expect(line).toBe(t('home.since.newest', { n: 8 }))
    expect(line).not.toMatch(/nothing (has )?(changed|happened)/i)
  })

  it('counts the rows under it as the newest writes, and not as changes since a mark', () => {
    const line = hp.sinceLead('never-looked', null, 8)
    // Without the words for "no reading mark" the eight rows read as eight new things, which is the failure.
    expect(line).toContain('8')
    expect(line).not.toBe(t('home.since.changes', { n: 8 }))
  })

  it('does not claim eight newest writes when the log is empty', () => {
    const line = hp.sinceLead('never-looked', null, 0)
    // NOTHING HAS EVER BEEN WRITTEN is the whole answer here, as the word for none.
    expect(line).toBe(t('absence.none'))
    expect(line).not.toContain('0')
  })

  it('keeps “nothing since your mark” apart from “no mark at all”', () => {
    const nothingSince = hp.sinceLead('nothing-since', 0, 0)
    // It is the one of the three that IS allowed to say nothing has been written, because a mark
    // exists and the count against it really is zero.
    expect(nothingSince).toBe(t('home.since.none'))
    expect(nothingSince).not.toBe(hp.sinceLead('never-looked', null, 0))
  })

  it('gives the exact count when there is a mark to count from, in its own plural', () => {
    expect(hp.sinceLead('changes-since', 12, 8)).toBe(t('home.since.changes', { n: 12 }))
    expect(hp.sinceLead('changes-since', 1, 1)).toBe(t('home.since.changes', { n: 1 }))
  })
})

// ============================================================================ the pipeline strip

describe('a pipeline’s steps as a strip, and the sentence it is labelled with', () => {
  it('counts every state and puts what is finished first', () => {
    const summary = hp.stepSummary([
      step('a', 'detect', 'done'),
      step('b', 'approach', 'done'),
      step('c', 'grasp', 'failed'),
      step('d', 'hand over', 'todo'),
    ])
    expect(summary).toBe('4 steps: 2 done, 1 failed, 1 to do')
  })

  it('names only the states that are actually there, so no zero is printed as news', () => {
    const summary = hp.stepSummary([step('a', 'detect', 'todo'), step('b', 'approach', 'todo')])
    expect(summary).toBe('2 steps: 2 to do')
    expect(summary).not.toContain('0 ')
  })

  it('gets the plural right on a one-step pipeline', () => {
    expect(hp.stepSummary([step('a', 'detect', 'doing')])).toBe('1 step: 1 doing')
  })

  /**
   * COLOUR NEVER CARRIES A STATE ON ITS OWN IN THIS PRODUCT, and a strip of segments is colour. So
   * the strip is labelled with its own sentence and every segment names its step and its state; the
   * shapes differ as well, which only a photograph can check.
   */
  it('labels the whole strip and every segment in words', () => {
    const steps = [step('a', '夹具标定', 'done'), step('b', 'grasp', 'blocked')]
    const html = body(h(hp.StepStrip, { steps }))
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="2 steps: 1 done, 1 blocked"')
    // The segment says which step it is and which state, so the picture is never the only place
    // a step's state is written.
    expect(html).toContain('step 2 of 2: grasp — blocked')
    // And the state is on the element as data, which is what the stylesheet draws from.
    expect(html).toContain('data-state="done"')
    expect(html).toContain('data-state="blocked"')
  })

  it('draws one segment per step and no more, whatever the length', () => {
    const steps = Array.from({ length: 12 }, (_, i) => step(`s${i}`, `step ${i}`, 'todo' as ItemState))
    const html = body(h(hp.StepStrip, { steps }))
    expect((html.match(/class="hp-step"/g) ?? []).length).toBe(12)
  })

  /**
   * THE STRIP IS THE SAME WIDTH WHATEVER THE STEP COUNT, which is what lets eight pipelines be
   * compared straight down a column. That is a CSS fact, so it is checked in the CSS: a strip sized
   * by its contents would silently stop being comparable and no photograph would obviously show it.
   */
  it('is a fixed width whose segments share it, rather than a width set by the step count', () => {
    expect(hp.HOME_CSS).toMatch(/\.hp-steps\s*\{[^}]*width:\s*\d+px/)
    expect(hp.HOME_CSS).toMatch(/\.hp-step\s*\{[^}]*flex:\s*1 1 0/)
    // Every one of the five step states is drawn, or a pipeline in the missing one draws nothing.
    for (const state of ['todo', 'doing', 'done', 'failed', 'blocked']) {
      expect(hp.HOME_CSS, `no rule draws a ${state} step`).toContain(`.hp-step[data-state="${state}"]`)
    }
  })
})

// ============================================================================ many writes, one row

/**
 * EIGHT CHANGE ROWS ARE NOT ALWAYS EIGHT THINGS THAT HAPPENED.
 *
 * The server writes one row per changed FIELD, so an agent that patches four fields of one record
 * in one request writes four rows with one actor, one session, one record, one operation and one
 * stamp. Drawn as four lines they are one request said four times, and they push three other
 * writes off the block.
 *
 * What is tested here is the only thing that makes collapsing them safe: the count is exact, no
 * row is dropped, and nothing is gathered unless all five fields match. The grouping is
 * adjacent-only, so a writer of another kind, another session or another record in the same second
 * stays a second row. The five fields cannot prove one action, so the row never claims one
 * (decision fR9Q3JgwclPn).
 */
const CHANGE_AT = '2026-08-09 11:30:00'
const READ_AT = new Date(2026, 7, 9, 12, 0, 0).getTime()

function change(over: Partial<Change> = {}): Change {
  return {
    id: 'c1',
    recordId: 'rec-mod',
    origin: 'authored',
    op: 'update',
    actorType: 'agent',
    actorId: 'claude-opus-5',
    sessionId: 'NS6wp_rmduzo',
    field: 'summary',
    oldValue: null,
    newValue: null,
    at: CHANGE_AT,
    ...over,
  }
}

/** Four rows of one write: one record, one actor, one session, one op, one second, four fields. */
const ONE_WRITE: Change[] = [
  change({ id: 'c1', field: 'parts[#p1].items[#i2].state', oldValue: 'todo', newValue: 'done' }),
  change({ id: 'c2', field: 'parts[#p1].items[#i3].state', oldValue: 'todo', newValue: 'doing' }),
  change({ id: 'c3', field: 'summary', oldValue: 'old summary', newValue: 'new summary' }),
  change({ id: 'c4', field: 'context', oldValue: 'a', newValue: 'b' }),
]

describe('rows the log wrote together are drawn together, and nothing is lost', () => {
  it('collapses one write into one row and counts it exactly', () => {
    const groups = hp.groupChanges(ONE_WRITE)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.rows).toHaveLength(4)
    expect(groups[0]?.head.id).toBe('c1')
    // Every original is inside it, in the order the log returned them.
    expect(groups[0]?.rows.map((row) => row.id)).toEqual(['c1', 'c2', 'c3', 'c4'])
  })

  it('keeps two rows apart when any one of the five stored fields differs', () => {
    const apart: Partial<Change>[] = [
      { recordId: 'rec-other' },
      { actorType: 'human' },
      { sessionId: null },
      { op: 'create' },
      { at: '2026-08-09 11:30:01' },
    ]
    for (const difference of apart) {
      const groups = hp.groupChanges([change({ id: 'a' }), change({ id: 'b', ...difference })])
      expect(groups, `${JSON.stringify(difference)} was collapsed into one action`).toHaveLength(2)
    }
  })

  /**
   * THE ONE CASE THIS GROUPING CANNOT TELL APART, PINNED RATHER THAN GLOSSED.
   *
   * The key is the actor's KIND and its session, not the actor's NAME, because HomePage.tsx may
   * not read `actorId` — tests/changes.test.ts treats a `.tsx` file reading both the operation and
   * `actorId` as a second change-row renderer, which is a guard worth more than this precision.
   *
   * For an agent it costs nothing: `sessionId` is a session record's id and two agents cannot
   * share one. For two PEOPLE writing to one record, in one operation, in the same second, with no
   * session on either row, the two rows are drawn as one. This test asserts that this is what
   * happens, so nobody reads the collapse as something it is not — and asserts the two things that
   * make it honest: the closed row names no writer, and both writers are inside the fold.
   */
  it('cannot tell two people apart in the same second, draws no name on the row, and holds both', () => {
    const twoPeople = [
      change({ id: 'a', actorType: 'human', actorId: THE_TEST_OFFICES_OWNER.id, sessionId: null, field: 'title' }),
      change({ id: 'b', actorType: 'human', actorId: 'ada', sessionId: null, field: 'summary' }),
    ]
    const groups = hp.groupChanges(twoPeople)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.rows).toHaveLength(2)

    const html = changeRow(twoPeople)
    // Nothing on the closed row claims a writer: "person" is true of both rows in the group.
    // THE WORD IS "PERSON", NOT "human". The stored actor type goes through `actorTypeWord` in
    // src/web/lib/words.ts on its way to the tag, so the database's spelling stays in the database.
    expect(scanned(html)).not.toContain(THE_TEST_OFFICES_OWNER.id)
    expect(scanned(html)).not.toContain('ada')
    expect(scanned(html)).toContain('person')
    // And both are named where the writes are.
    expect(behindAFold(html)).toContain(THE_TEST_OFFICES_OWNER.id)
    expect(behindAFold(html)).toContain('ada')
  })

  it('gathers adjacent rows only, so the log’s order is never rearranged', () => {
    const rows = [
      change({ id: 'a', recordId: 'rec-one' }),
      change({ id: 'b', recordId: 'rec-two' }),
      change({ id: 'c', recordId: 'rec-one' }),
    ]
    const groups = hp.groupChanges(rows)
    expect(groups).toHaveLength(3)
    expect(groups.map((group) => group.head.id)).toEqual(['a', 'b', 'c'])
  })

  it('loses no row whatever the mixture, and the counts add up', () => {
    const rows = [...ONE_WRITE, change({ id: 'd', actorType: 'human', sessionId: null }), change({ id: 'e' })]
    const groups = hp.groupChanges(rows)
    const inside = groups.flatMap((group) => group.rows.map((row) => row.id))
    expect(inside).toEqual(rows.map((row) => row.id))
    expect(groups.reduce((total, group) => total + group.rows.length, 0)).toBe(rows.length)
  })

  it('draws nothing at all from an empty log rather than one empty action', () => {
    expect(hp.groupChanges([])).toEqual([])
  })
})

describe('what the row says it was, which is not the mechanics', () => {
  it('names the part of the record that moved, not the path into it', () => {
    expect(hp.changeGist(change({ field: 'parts[#p1].items[#i2].state' }))).toBe('changed parts')
    expect(hp.changeGist(change({ field: 'data.state' }))).toBe('changed data')
    expect(hp.changeGist(change({ field: 'title' }))).toBe('changed title')
  })

  it('says a link was made without the link type, which is the fragment that goes behind the press', () => {
    expect(hp.changeGist(change({ op: 'link', field: 'blocks' }))).toBe('linked')
    expect(hp.changeGist(change({ op: 'unlink', field: 'blocks' }))).toBe('unlinked')
    // `changeVerb` is the mechanics and still carries it, in the fold.
    expect(hp.changeVerb(change({ op: 'link', field: 'blocks' }))).toBe('linked (blocks)')
  })

  it('says what a write with no field was, rather than saying nothing', () => {
    expect(hp.changeGist(change({ field: null }))).toBe('changed the record itself')
    expect(hp.changeGist(change({ op: 'create', field: null }))).toBe('created')
    expect(hp.changeGist(change({ op: 'delete', field: null }))).toBe('deleted')
  })

  it('names each part of the record an action touched once, however many rows touched it', () => {
    const groups = hp.groupChanges(ONE_WRITE)
    const group = groups[0]
    expect(group).toBeDefined()
    if (group === undefined) return
    // Two of the four rows are inside `parts`, and it is said once.
    expect(hp.groupGist(group)).toBe('changed parts, summary, context')
  })
})

// ============================================================================ one change row

const SESSIONS = [
  {
    stored: 'NS6wp_rmduzo',
    recordId: 'NS6wp_rmduzo',
    title: 'the checkpoint 3 run',
    matchedBy: 'recordId' as const,
    rows: 4,
    unresolved: false, elsewhereIn: null,
  },
]

const TITLES = new Map([
  ['rec-mod', 'SoilPen Mini 湿度读取'],
  ['rec-esa', 'Trial report: clamp holding-force section'],
])

function changeRow(rows: Change[]): string {
  const groups = hp.groupChanges(rows)
  const group = groups[0]
  if (group === undefined) throw new Error('the fixture produced no group')
  mode.setMode('inspect')
  try { return body(
    h(hp.ChangeRow, {
      group,
      sessions: SESSIONS,
      titles: TITLES,
      titleOf: (id: string) => TITLES.get(id) ?? null,
      now: READ_AT,
    }),
  )
  } finally { mode.setMode('normal') }
}

describe('a change row: the actor, what moved and when — and the mechanics one press away', () => {
  it('shows who, what and when without opening anything', () => {
    const scan = scanned(changeRow([change({ field: 'parts[#p1].items[#i2].state' })]))
    expect(scan).toContain('agent')
    expect(scan).toContain('SoilPen Mini 湿度读取')
    expect(scan).toContain('changed parts')
    expect(scan).toContain('ago')
  })

  it('keeps the exact path, the link type and the session off the closed row', () => {
    const scan = scanned(changeRow([change({ field: 'parts[#p1].items[#i2].state' })]))
    expect(scan).not.toContain('items[#i2]')
    expect(scan).not.toContain('the checkpoint 3 run')
    const link = scanned(changeRow([change({ op: 'link', field: 'blocks', newValue: 'rec-esa' })]))
    expect(link).not.toContain('(blocks)')
  })

  it('puts all four of them behind the press, and deletes none of them', () => {
    const html = changeRow([change({ field: 'parts[#p1].items[#i2].state', oldValue: 'todo', newValue: 'done' })])
    const fold = behindAFold(html)
    expect(fold).toContain('parts[#p1].items[#i2].state')
    expect(fold).toContain('the checkpoint 3 run')
    // And the fold says what it holds rather than the word "more". The session was dropped from
    // the phrase when this block became one column of the "Also" strip: the words share a 373px
    // track with the age, and a phrase that cannot shrink squeezed the TITLE to 30px. The session
    // itself is still inside the fold, drawn by `ChangeBody`, which is what the line above checks.
    expect(scanned(html)).toContain('the field and the values')
  })

  it('names the record a link row points at, instead of printing its id', () => {
    const fold = behindAFold(changeRow([change({ op: 'link', field: 'blocks', newValue: 'rec-esa' })]))
    expect(fold).toContain('Trial report: clamp holding-force section')
    expect(fold).toContain('linked (blocks)')
  })

  /**
   * THE COLLAPSED ROW HAS TO SAY HOW MANY IT STANDS FOR, ON THE CLOSED ROW, AND HOLD EVERY ONE.
   *
   * A row that quietly stood for four writes would be the same defect as a truncated list with no
   * count: the reader has no way to know anything was folded, so the count is on the scan line and
   * every original is inside the fold.
   */
  it('says on the closed row how many writes it stands for, exactly', () => {
    const scan = scanned(changeRow(ONE_WRITE))
    expect(scan).toContain('4 writes, same second')
    expect(scan).toContain('every write behind this row')
  })

  /**
   * THE ROW NEVER SAYS "ONE ACTION" (decision fR9Q3JgwclPn, option C of proposal acsi4ZoHx6ZB).
   *
   * Two people writing to one record in the same second, with no session on either row, match all
   * five fields and are drawn as one row. Neither the closed row nor the note inside the fold may
   * call that one action, and the note says the grouping does not prove one.
   */
  it('does not call rows it cannot prove were one action "one action", closed or open', () => {
    const twoPeople = [
      change({ id: 'p1', actorType: 'human', actorId: 'person-a', sessionId: null, field: 'summary' }),
      change({ id: 'p2', actorType: 'human', actorId: 'person-b', sessionId: null, field: 'context' }),
    ]
    expect(hp.groupChanges(twoPeople)).toHaveLength(1)
    const html = changeRow(twoPeople)
    expect(scanned(html)).toContain('2 writes, same second')
    expect(scanned(html)).not.toMatch(/one action/i)
    // The only "one action" anywhere in the row is the sentence saying it is not proved.
    expect(behindAFold(html).match(/one action/gi)).toHaveLength(1)
    expect(behindAFold(html)).toContain('That does not prove they were one action.')
  })

  it('holds every original write, each drawn as the record page draws it', () => {
    const fold = behindAFold(changeRow(ONE_WRITE))
    for (const row of ONE_WRITE) {
      expect(fold, `${row.field} is counted but not drawn`).toContain(hp.changeVerb(row))
    }
    expect(fold).toContain('These <b class="num">4</b> writes')
  })

  /**
   * ONE PANEL, ONE NAME FOR ONE THING.
   *
   * The lead line above these rows is protected copy — "8 newest writes in the log — not what is
   * new…" — so a log entry is a WRITE on this panel, and the request that made several of them is
   * an ACTION. A row calling a log entry a "row" would be one block with two vocabularies, which
   * is this repository's recurring defect in words rather than in code. This fails if either side
   * drifts.
   */
  it('calls a log entry the same thing the lead line above it calls one', () => {
    expect(hp.sinceLead('never-looked', null, 8)).toContain('newest writes')
    const scan = scanned(changeRow(ONE_WRITE))
    expect(scan).toContain('4 writes')
    expect(scan).not.toMatch(/\d+ rows/)
  })

  it('puts no count on a row that stands for one write, because that is arithmetic about nothing', () => {
    const scan = scanned(changeRow([change({})]))
    expect(scan).not.toContain('1 writes')
    expect(scan).not.toContain('writes, same second')
  })
})

// ============================================================================ the modules panel

/**
 * FOUR OR FIVE MODULES OUT OF TWENTY-SEVEN IS A CLAIM ABOUT THE OTHER TWENTY-TWO.
 *
 * So what is tested here is the rule and the arithmetic rather than the appearance: which signals
 * put a module on the list, that the order is fixed rather than incidental, that the count of what
 * is not drawn is exact and named, and that the derived half of every row is drawn as derived in
 * the same words the record page uses.
 */
function moduleRecord(
  id: string,
  title: string,
  data: Record<string, unknown>,
  updatedAt = '2026-08-01 09:00:00',
): PanelRecord {
  return {
    id,
    kind: 'module',
    workspaceId: 'default',
    ownerId: THE_TEST_OFFICES_OWNER.id,
    title,
    summary: null,
    data,
    createdAt: updatedAt,
    updatedAt,
    deletedAt: null,
  }
}

const items = (...states: ItemState[]) => [
  { id: 'p1', name: 'On the bench', items: states.map((state, i) => ({ id: `i${i}`, text: `item ${i}`, state })) },
]

const MODULES: PanelRecord[] = [
  moduleRecord('m-active', 'active module', { state: 'active', parts: items('todo') }, '2026-08-01 09:00:00'),
  moduleRecord('m-stopped', 'stopped module', { state: 'stable', parts: items('failed', 'done') }, '2026-08-02 09:00:00'),
  moduleRecord('m-written', 'written module', { state: 'stable', parts: items('done') }, '2026-08-03 09:00:00'),
  moduleRecord('m-quiet', 'quiet module', { state: 'retired', parts: items('done') }, '2026-08-04 09:00:00'),
]

const TOUCHED = new Set(['m-written'])

describe('which modules are drawn, and why those', () => {
  it('picks a module for each of the three signals and leaves out the one with none', () => {
    const pick = mp.pickModules(MODULES, TOUCHED)
    expect(pick.shown.map((one) => one.record.id)).toContain('m-active')
    expect(pick.shown.map((one) => one.record.id)).toContain('m-stopped')
    expect(pick.shown.map((one) => one.record.id)).toContain('m-written')
    expect(pick.shown.map((one) => one.record.id)).not.toContain('m-quiet')
    expect(pick.total).toBe(4)
    expect(pick.qualified).toBe(3)
  })

  it('says which signal put each one there, so the rule can be checked row by row', () => {
    const pick = mp.pickModules(MODULES, TOUCHED)
    const by = (id: string) => pick.shown.find((one) => one.record.id === id)?.because
    expect(by('m-active')).toEqual(['active'])
    expect(by('m-stopped')).toEqual(['stopped-short'])
    expect(by('m-written')).toEqual(['written-to'])
  })

  it('draws the newest write first, and breaks a tie by id rather than by luck', () => {
    const pick = mp.pickModules(MODULES, TOUCHED)
    expect(pick.shown.map((one) => one.record.id)).toEqual(['m-written', 'm-stopped', 'm-active'])

    const sameSecond = [
      moduleRecord('m-b', 'b', { state: 'active' }, '2026-08-05 09:00:00'),
      moduleRecord('m-a', 'a', { state: 'active' }, '2026-08-05 09:00:00'),
    ]
    expect(mp.pickModules(sameSecond, new Set()).shown.map((one) => one.record.id)).toEqual(['m-a', 'm-b'])
    // And the other way round in, the same way out: the order is the rule's, not the array's.
    expect(mp.pickModules([...sameSecond].reverse(), new Set()).shown.map((one) => one.record.id)).toEqual([
      'm-a',
      'm-b',
    ])
  })

  it('never draws more than the cap, and counts what the cap cut', () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      moduleRecord(`m-${i}`, `module ${i}`, { state: 'active' }, `2026-08-0${i + 1} 09:00:00`),
    )
    const pick = mp.pickModules(many, new Set())
    expect(pick.shown).toHaveLength(mp.MODULES_SHOWN)
    expect(pick.qualified).toBe(9)
    expect(pick.total).toBe(9)
  })

  it('ignores every record that is not a module, rather than reading a state word off a task', () => {
    const mixed: PanelRecord[] = [
      ...MODULES,
      { ...moduleRecord('t1', 'a task', { state: 'active' }), kind: 'task' },
    ]
    const pick = mp.pickModules(mixed, TOUCHED)
    expect(pick.total).toBe(4)
    expect(pick.shown.map((one) => one.record.id)).not.toContain('t1')
  })
})

/**
 * ---------------------------------------------------------------------------------------
 * WHAT THIS BLOCK PRINTS NOW: THREE TITLES AND A PROGRESS WORD
 * ---------------------------------------------------------------------------------------
 *
 * Measured at 1440 on 2026-08-13, it printed its own selection rule as body text — "Active,
 * something stopped short, or just written to — newest first" — above five rows, each carrying the
 * phrase `derived, not stored` beside its condition. A sentence about how the list was chosen and
 * five copies of a note about epistemology, in first-glance space, on a page whose question is
 * "what needs me now".
 *
 * `docs/UX-CONTRACT.md` names derived-vs-stored diagnostics as Inspect. So Normal is the titles
 * and the progress word, Inspect is everything that was there, and the ARITHMETIC — "3 of 15
 * modules shown" — is neither, because it is a claim about the twelve that are not drawn.
 */
describe('what one module row says', () => {
  const panel = () => body(h(mp.ModulesPanel, { records: MODULES, changes: [change({ recordId: 'm-written' })] }))
  const inspectPanel = () =>
    body(h(mp.ModulesPanel, { records: MODULES, changes: [change({ recordId: 'm-written' })], inspect: true }))

  it('draws the condition as the progress word, with nothing else on the row', () => {
    const html = panel()
    // The record page's own phrase for the condition, from the record page's own function.
    expect(html).toContain('something stopped short')
    // And NOT the stored lifecycle chip or the derivation tag, which are what made five rows into
    // five paragraphs about how Mole Office knows things.
    expect(html).not.toContain(t('home.moduleDerived'))
    expect(html).not.toContain('px-chip-stored')
  })

  it('draws the stored word and the derived tag in Inspect, so the asymmetry is not lost', () => {
    const html = inspectPanel()
    expect(html).toContain('active')
    expect(html).toContain('something stopped short')
    expect(html).toContain(t('home.moduleDerived'))
    expect(html).toContain('px-chip-stored')
  })

  it('draws no selection rule, in Normal or in Inspect', () => {
    // The page draws the count of what is shown, and no sentence about how the list was chosen.
    expect(panel()).not.toContain('mp-rule')
    expect(inspectPanel()).not.toContain('mp-rule')
  })

  it('states how many of how many are drawn, names the rest, and links to all of them', () => {
    const html = panel()
    expect(html).toContain('3 of 4 modules shown')
    expect(html).toContain('not active, nothing stopped short, and untouched by the newest writes')
    // THE PROJECT'S OWN MODULES PAGE, NOT THE LIST OF ALL RECORDS. This was wave 13k round 22, at item 3 of a
    // decision. The panel is drawn on a project's page, and every one of its modules is on that
    // project's Modules page.
    expect(html).toContain('href="#/modules"')
    expect(html).toContain('See all 4 modules on the Modules page')
  })

  it('says what the modules past the cap are, without pointing at a list above', () => {
    // Five active modules: three are drawn and two qualify but are past row three. The words were
    // "2 on the list above and past row 3", written for Home; there is no list above on a project page.
    const five = Array.from({ length: 5 }, (_, i) => moduleRecord(`m-cap-${i}`, `module ${i}`, { state: 'active' }, `2026-08-0${i + 1} 09:00:00`))
    const html = body(h(mp.ModulesPanel, { records: five, changes: [] }))
    expect(html).toContain('2 more are active, stopped short or newly written to, and are not shown')
    expect(html).not.toContain('on the list above')
  })

  it('states the arithmetic in Normal too, because it is a claim and not a diagnostic', () => {
    // The one thing on this block that may never go behind the switch: "3 of 4" is a statement
    // about the one that is NOT drawn, and a reader has to be able to check it at either setting.
    expect(panel()).toContain('3 of 4 modules shown')
  })

  it('says the modules are quiet rather than drawing an empty panel with no explanation', () => {
    const html = body(h(mp.ModulesPanel, { records: [MODULES[3] as PanelRecord], changes: [] }))
    expect(html).toContain('None of the 1 module is active, stopped short or newly written to')
    // Nought of one, and the one that is not drawn is still named and still reachable.
    expect(html).toContain('0 of 1 modules shown')
    expect(html).toContain('not active, nothing stopped short, and untouched by the newest writes')
  })

  it('says there are no modules at all, which is a different answer again', () => {
    const html = body(h(mp.ModulesPanel, { records: [], changes: [] }))
    expect(html).toContain('No modules yet')
    expect(html).not.toContain('0 of 0 modules shown')
  })
})

// ================================================================== landing in an empty project

describe('the one true sentence on Home that reads as its opposite', () => {
  it('offers the projects that have work, biggest first, when this one has none', async () => {
    // A browser with no memory of a previous visit lands in `default`, which since the corpus
    // migration holds nothing. Every panel under the decision queue reads ONE project, so Home said
    // "nothing is owed and nothing has stopped short" — true about that project, and read as "you
    // are clear" by somebody whose other three hold 426 records between them.
    const { projectsWithWork } = await import('../src/web/pages/HomePage.tsx')
    const all = [
      { id: 'default', title: 'Default', records: 0 },
      { id: 'panelx', title: 'Mole Office', records: 150 },
      { id: 'robotics', title: 'Robotics', records: 184 },
      { id: 'empty-too', title: 'Nothing here either', records: 0 },
    ]
    expect(projectsWithWork('default', 0, all).map((w) => w.id)).toEqual(['robotics', 'panelx'])
  })

  it('draws nothing when this project has records, whatever the others hold', async () => {
    const { projectsWithWork } = await import('../src/web/pages/HomePage.tsx')
    const all = [
      { id: 'panelx', title: 'Mole Office', records: 150 },
      { id: 'robotics', title: 'Robotics', records: 184 },
    ]
    expect(projectsWithWork('panelx', 150, all)).toEqual([])
  })

  it('draws nothing in an empty database, because there is nowhere to send anybody', async () => {
    // Then the sentence would be a complaint rather than a way out, and a first run of Mole Office is
    // exactly when a complaint is least useful.
    const { projectsWithWork } = await import('../src/web/pages/HomePage.tsx')
    expect(projectsWithWork('default', 0, [{ id: 'default', title: 'Default', records: 0 }])).toEqual([])
  })
})
