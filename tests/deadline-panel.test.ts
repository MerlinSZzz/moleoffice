// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DEADLINE PANEL: what a person is shown, and every nothing it must not round off.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THESE TESTS ARE FOR, AND WHAT THEY ARE NOT
 * ---------------------------------------------------------------------------------------
 *
 * `tests/deadlines.test.ts` proves the arithmetic and `tests/deadline-route.test.ts` proves the
 * seam between the stored corpus and that arithmetic. Neither can see the last step, which is the
 * one this file is about: **a null that survived both of them, drawn on a screen as a nought.**
 *
 * That is not a hypothetical. The whole doctrine of `shared/deadlines.ts` — absent is not zero,
 * unknown capacity is not a working week, "it does not fit" and "nobody has said" are different
 * sentences — is carried by nullable fields, and the cheapest way to render a nullable number is
 * `hours ?? 0` or an empty cell. Both type-check, both pass every arithmetic test in the suite, and
 * both turn the honest report into the confident lie it was built to prevent.
 *
 * So the fixtures here are REAL REPORTS: every one is built by calling `deadlineOutlook` itself over
 * plain data, on the same calendar tests/deadlines.test.ts stands on. Nothing below hand-writes an
 * outlook, because a hand-written one can hold a combination the arithmetic never produces, and a
 * test of that is a test of nothing.
 *
 * The components are rendered with react-dom/server, as everything in tests/record-page.test.ts is:
 * the runner's environment is `node`, there is no DOM, and adding one is a dependency this project
 * has ruled out. What that CANNOT check is how it looks — whether the fact lines wrap at 390 and
 * whether the offer reads in dark are screenshot questions, and they were checked that way.
 *
 * ---------------------------------------------------------------------------------------
 * THE CALENDAR THESE TESTS STAND ON
 * ---------------------------------------------------------------------------------------
 *
 *   now         2026-09-01 09:00, a Tuesday, inside ISO week 2026-W36 (31 Aug – 6 Sep)
 *   due         2026-09-18, a Friday, so the window is 1–18 September
 *   2026-W37    7 – 13 September, the ONE whole week in that window; W36 and W38 are clipped
 */

import { createElement as h, type ReactElement } from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  DEADLINE_GAPS,
  deadlineOutlook,
  type DeadlineInput,
  type DeadlineOutlook,
} from '../src/shared/deadlines.ts'
import type { Allocation } from '../src/shared/planning.ts'
import { readDue } from '../src/shared/work.ts'
import type { GatedLink } from '../src/shared/types.ts'
// The REAL due-stamp reader, the one the attention rule and the route both use, so a bare date is
// the END of that day here for exactly the reason it is everywhere else.
import { parseDueStamp } from '../src/web/lib/attention.ts'
// CRITERION CHANGE, plan 7FEOshq3mBGG piece G2b: the page reads each gap's sentence from the word
// lists, so the words it must print are the page's own English words for that gap. They were the
// shared `DEADLINE_GAP_SENTENCES`, which the server and agents still read; the page's words no longer
// name a stored field. The test still proves each reported gap is printed in its own words, and no
// other gap is.
import { en } from '../src/shared/words/en.ts'
const gapWords = (gap: (typeof DEADLINE_GAPS)[number]): string => en[`g2b.deadline.gap.${gap}` as keyof typeof en] as string

type RecordPage = typeof import('../src/web/pages/RecordPage.tsx')
let rp: RecordPage

beforeAll(async () => {
  // RecordPage reaches api.ts and router.tsx, which touch `window` while they are being evaluated.
  // The smallest stand-in that lets them load; nothing here is under test.
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  rp = await import('../src/web/pages/RecordPage.tsx')
})

/** Markup with the hoisted <style> blocks removed, so a class named in the CSS is not evidence. */
function body(el: ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

const NOW = new Date(2026, 8, 1, 9, 0, 0).getTime()

/** An allocation without a database, exactly as tests/deadlines.test.ts builds one. */
function alloc(part: Partial<Allocation> & Pick<Allocation, 'horizon' | 'period' | 'recordId'>): Allocation {
  return {
    id: `a-${part.horizon}-${part.period}-${part.recordId}`,
    plannedHours: null,
    actualHours: null,
    state: 'planned',
    note: null,
    createdAt: '2026-09-01 08:00',
    updatedAt: '2026-09-01 08:00',
    ...part,
  }
}

/** A real report over plain data. Every fixture in this file is one of these. */
function outlook(over: Partial<DeadlineInput> = {}): DeadlineOutlook {
  return deadlineOutlook({
    now: NOW,
    due: readDue({ due: '2026-09-18' }),
    dueMs: parseDueStamp,
    horizon: 'week',
    work: [],
    allocations: [],
    capacity: [],
    ...over,
  })
}

/** The view, with no titles loaded unless a test supplies them. */
function view(o: DeadlineOutlook, asked: string[] = [], names: Record<string, string> = {}): string {
  return body(
    h(rp.DeadlineOutlookView, {
      outlook: o,
      asked,
      nameFor: (id: string) => names[id] ?? null,
    }),
  )
}

// ============================================================================ the words for a gap

describe('every input the report could not count reaches the screen in its own words', () => {
  it('prints the shared sentence for each gap, and never the gap’s name', () => {
    const o = outlook({
      work: [{ id: 'w1', effortHours: 6 }, { id: 'w2', effortHours: null }],
      allocations: [alloc({ horizon: 'day', period: '2026-09-08', recordId: 'w1', plannedHours: 1 })],
    })
    // The report really is carrying several at once, or this test would be checking one branch.
    expect(o.gaps.length).toBeGreaterThan(3)
    const html = view(o, ['w1', 'w2'], { w1: 'Write the two pages', w2: 'Redo the figures' })

    for (const gap of o.gaps) {
      // The sentence VERBATIM, less its first character, which the page capitalises and nothing
      // else. Matching the tail is what makes a paraphrase fail: reword one clause and this goes red.
      const said = gapWords(gap)
      expect(html, `the sentence for a gap this report reported is not on the page`).toContain(said.slice(1))
    }
  })

  it('does not print a gap the report did not report', () => {
    const o = outlook({ work: [{ id: 'w1', effortHours: 6 }] })
    const html = view(o, ['w1'])
    const absent = DEADLINE_GAPS.filter((gap) => !o.gaps.includes(gap))
    expect(absent.length).toBeGreaterThan(0)
    for (const gap of absent) {
      expect(html, `${gap} was drawn on a report that does not carry it`).not.toContain(
        gapWords(gap).slice(1),
      )
    }
  })

  it('never puts a gap’s machine name on the screen, because it is a name for programs', () => {
    const o = outlook({ work: [{ id: 'w1', effortHours: null }] })
    const html = view(o, ['w1'])
    for (const gap of DEADLINE_GAPS) {
      expect(html, `the raw key "${gap}" is on the page`).not.toContain(gap)
    }
  })

  it('says so, in words, when there was nothing it could not count', () => {
    // A blank where "everything was known" belongs is the silence this product exists to remove,
    // and it is indistinguishable from a list that failed to render.
    //
    // Counted at the MONTH horizon, which is the only grain on this calendar where the window
    // clips nothing: 2026-09 runs 1–30 September and the window is 1–30 September exactly. At the
    // week horizon W36 and W38 are clipped by construction, so `periods-overlap-the-window` is
    // reported and this fixture would be testing a report that still has a gap in it.
    const o = outlook({
      due: readDue({ due: '2026-09-30' }),
      horizon: 'month',
      work: [{ id: 'w1', effortHours: 6 }],
      allocations: [alloc({ horizon: 'month', period: '2026-09', recordId: 'w1', plannedHours: 6 })],
      capacity: [{ horizon: 'month', period: '2026-09', hours: 30 }],
    })
    expect(o.gaps).toEqual([])
    expect(view(o, ['w1'])).toContain('Every number above covers the whole of what it names')
  })
})

// ============================================================================ nothing named

describe('with no work named the panel is still useful and says why it can size nothing', () => {
  it('says plainly that nobody named any work, in the rule’s own sentence', () => {
    const o = outlook()
    expect(o.gaps).toContain('no-work-named')
    expect(view(o)).toContain(gapWords('no-work-named').slice(1))
  })

  it('still answers the question a person came with: when it is due and how long is left', () => {
    const html = view(outlook())
    expect(html).toContain('18 Sept 2026')
    expect(html).toContain('due in 17 days')
  })

  it('draws no size, no plan, no capacity and no buffer, rather than four noughts', () => {
    // There is no work, so there is nothing for any of them to be ABOUT. A row of zeroes here
    // would read as "no work, plenty of room", which is the one conclusion this must not offer.
    const html = view(outlook())
    expect(html).not.toContain('how big the work is')
    expect(html).not.toContain('the capacity in between')
    expect(html).not.toContain('the buffer')
  })
})

// ============================================================================ a null is never a nought

describe('an unknown is drawn as the sentence saying which unknown it is', () => {
  it('says nobody stated a capacity, and does not draw it as nought hours', () => {
    const o = outlook({
      work: [{ id: 'w1', effortHours: 6 }],
      allocations: [alloc({ horizon: 'week', period: '2026-W37', recordId: 'w1', plannedHours: 2 })],
    })
    expect(o.between?.capacity.hours).toBeNull()
    const html = view(o, ['w1'])
    expect(html).toContain('nobody has said how many hours these periods hold')
    expect(html).toContain('That is not nought, and it is not a full working week')
    // The number a `?? 0` would have produced, in the shape this panel prints hours in.
    expect(html).not.toContain('>0 <span class="dp-unit">h</span>')
  })

  it('refuses to say whether it fits when the capacity is unknown, and does not say it does not', () => {
    const o = outlook({ work: [{ id: 'w1', effortHours: 6 }] })
    expect(o.buffer.fits).toBeNull()
    const html = view(o, ['w1'])
    expect(html).toContain('Mole Office cannot say whether this fits')
    expect(html).toContain('nobody has said how many hours the counted periods hold')
    // The VERDICT, which is a different sentence from the contrast the line above draws with it.
    // A null read as false would print this, and it is the one thing that must never happen here.
    expect(html).not.toContain('it does not fit: the estimated work is')
  })

  it('says nobody estimated the work rather than sizing it at nought hours', () => {
    const o = outlook({
      work: [{ id: 'w1', effortHours: null }, { id: 'w2', effortHours: null }],
      capacity: [{ horizon: 'week', period: '2026-W37', hours: 30 }],
    })
    expect(o.estimate.hours).toBe(0)
    expect(o.buffer.hours).toBeNull()
    const html = view(o, ['w1', 'w2'])
    expect(html).toContain('nobody has estimated any of the 2 pieces named')
    expect(html).toContain('that is not nought hours')
    // 30 hours of capacity against an unknown estimate is NOT a 30-hour buffer.
    expect(html).not.toContain('it fits, with')
  })

  it('tells a row nobody estimated apart from a row with no window to be placed in', () => {
    const ahead = outlook({ work: [{ id: 'w1', effortHours: null }] })
    expect(ahead.work[0]?.unplacedHours).toBeNull()
    expect(view(ahead, ['w1'])).toContain('nobody estimated it, so there is nothing for a plan to be taken away from')

    const gone = outlook({ due: readDue({ due: '2026-08-01' }), work: [{ id: 'w1', effortHours: 6 }] })
    expect(gone.between).toBeNull()
    expect(gone.work[0]?.plannedHours).toBeNull()
    const html = view(gone, ['w1'])
    expect(html).toContain('there is no window, so there is nowhere for it to be placed')
  })

  it('says the plan, the capacity and the buffer have no subject when there is no window', () => {
    const o = outlook({ due: readDue({ condition: 'the reprint lands' }), work: [{ id: 'w1', effortHours: 6 }] })
    expect(o.between).toBeNull()
    const html = view(o, ['w1'])
    expect(html).toContain('questions with no subject rather than numbers that came out at nought')
    // And the size of the work survives, because how big a job is was never a question about time.
    expect(html).toContain('how big the work is')
  })
})

// ============================================================================ the buffer

describe('the buffer says which of the three answers it is', () => {
  const capacity = [{ horizon: 'week' as const, period: '2026-W37', hours: 30 }]

  it('says it fits, with the hours to spare', () => {
    const o = outlook({ work: [{ id: 'w1', effortHours: 6 }], capacity })
    expect(o.buffer.fits).toBe(true)
    expect(view(o, ['w1'])).toContain('it fits, with')
  })

  it('says it does not fit, and by how much', () => {
    const o = outlook({ work: [{ id: 'w1', effortHours: 44 }], capacity })
    expect(o.buffer.hours).toBe(-14)
    const html = view(o, ['w1'])
    expect(html).toContain('14 h short')
    expect(html).toContain('it does not fit')
  })

  it('names which input is missing when it cannot say, so the reader knows what to fix', () => {
    const neither = outlook({ work: [{ id: 'w1', effortHours: null }] })
    expect(view(neither, ['w1'])).toContain('neither the size of the work nor the hours the window holds')

    const noEstimate = outlook({ work: [{ id: 'w1', effortHours: null }], capacity })
    expect(view(noEstimate, ['w1'])).toContain('nobody has estimated any of the named work')
  })
})

// ============================================================================ what was asked and not sized

describe('a ticked record the report did not size is named, not quietly left out', () => {
  it('says which ids came back unsized, and that nothing on the screen counts them', () => {
    // `?work=` names records by id, and the route drops an id no record answers to — no gap, no
    // count, nothing on the reply saying it happened. A total covering three of the four things a
    // person ticked, drawn as though it covered four, is the failure this line exists to prevent.
    const o = outlook({ work: [{ id: 'w1', effortHours: 6 }] })
    expect(rp.unsizedIds(['w1', 'ghost'], o)).toEqual(['ghost'])
    const html = view(o, ['w1', 'ghost'])
    expect(html).toContain('not in the report above')
    expect(html).toContain('ghost')
  })

  it('says nothing at all when every ticked record came back sized', () => {
    const o = outlook({ work: [{ id: 'w1', effortHours: 6 }] })
    expect(rp.unsizedIds(['w1'], o)).toEqual([])
    expect(view(o, ['w1'])).not.toContain('not in the report above')
  })
})

// ============================================================================ which periods to offer from

describe('the periods a candidate may be offered from come from the report itself', () => {
  it('takes the whole periods AND the ones the window clips, in calendar order', () => {
    const o = outlook()
    // The arithmetic counts W37 and refuses to count W36 and W38. The OFFER covers all three:
    // offering a record as a candidate is not counting its hours, and the week today falls in is
    // clipped by definition while being exactly where near work is already planned.
    expect(o.between?.planned.periods).toEqual(['2026-W37'])
    expect(o.between?.capacity.partial).toEqual(['2026-W36', '2026-W38'])
    expect(rp.candidatePeriods(o)).toEqual(['2026-W36', '2026-W37', '2026-W38'])
  })

  it('offers no period at all when there is no window, rather than reading the whole plan', () => {
    expect(rp.candidatePeriods(outlook({ due: readDue({ due: '2026-08-01' }) }))).toEqual([])
    expect(rp.candidatePeriods(outlook({ due: readDue({ condition: 'the reprint lands' }) }))).toEqual([])
  })
})

// ============================================================================ the offer

/**
 * A link as the record page holds one: the shared shape plus the three gate fields.
 *
 * The sentence above was already written here, and the three fields were not. `ResolvedLink` does
 * not carry them, so the comment described a shape this fixture had never built — and on a `blocks`
 * link, which is the only type a gate can ride on. It is `GatedLink` now, so the fixture cannot
 * drift from the sentence again.
 */
function link(over: Partial<GatedLink> = {}): GatedLink {
  return {
    linkId: 'l1',
    type: 'blocks',
    label: 'blocked by',
    isBacklink: true,
    inferred: false,
    other: { id: 'w1', kind: 'task', title: 'Write the two pages', summary: null },
    broken: false,
    gate: null,
    gateLabel: null,
    gateProblem: null,
    gateStage: null,
    ...over,
  }
}

describe('candidates carry where they came from, and the two offers merge into one row', () => {
  const self = { id: 'ob1', workspaceId: 'robotics' }

  it('labels a linked candidate with the link’s own wording', () => {
    const { candidates } = rp.mergeCandidates({ self, links: [link()], allocated: [] })
    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.from).toEqual(['linked — blocked by'])
  })

  it('labels an allocated candidate with the period it is planned in, and names its project', () => {
    const { candidates } = rp.mergeCandidates({
      self,
      links: [],
      allocated: [
        { period: '2026-W37', id: 'w9', name: 'Wave 5 — Planning MVP', kind: 'block', workspaceId: 'panelx', effortHours: 10 },
      ],
    })
    expect(candidates[0]?.from).toEqual(['on the plan in 2026-W37'])
    // A plan spans projects, so a row that did not say which owns it would be unreadable.
    expect(candidates[0]?.project).toBe('panelx')
  })

  it('draws one row for a record that is both linked and on the plan, keeping both sources', () => {
    // Two rows would invite it to be ticked twice, and the arithmetic then de-duplicates silently —
    // leaving a person looking at a total that does not match what they believe they asked for.
    const { candidates } = rp.mergeCandidates({
      self,
      links: [link()],
      allocated: [
        { period: '2026-W37', id: 'w1', name: 'Write the two pages', kind: 'task', workspaceId: 'robotics', effortHours: 6 },
      ],
    })
    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.from).toEqual(['linked — blocked by', 'on the plan in 2026-W37'])
  })

  it('keeps “this row does not carry an estimate” apart from “nobody estimated it”', () => {
    // A link row carries the other record's id, kind, title and summary and NOT its effort_hours.
    // Drawing it as "nobody estimated it" would be this page inventing a finding out of a field it
    // never asked for — the same mistake as reading an unstated gate as a hard one.
    const linked = rp.mergeCandidates({ self, links: [link()], allocated: [] })
    expect(linked.candidates[0]?.estimate).toEqual({ at: 'not-carried' })

    const planned = rp.mergeCandidates({
      self,
      links: [],
      allocated: [{ period: '2026-W37', id: 'w2', name: 'Redo the figures', kind: 'task', workspaceId: 'robotics', effortHours: null }],
    })
    expect(planned.candidates[0]?.estimate).toEqual({ at: 'nobody-said' })
  })

  it('lets the plan size a record the link could not, and never the other way round', () => {
    const { candidates } = rp.mergeCandidates({
      self,
      links: [link()],
      allocated: [
        { period: '2026-W37', id: 'w1', name: 'Write the two pages', kind: 'task', workspaceId: 'robotics', effortHours: 6 },
      ],
    })
    expect(candidates[0]?.estimate).toEqual({ at: 'stated', hours: 6 })
  })

  it('counts a broken link instead of offering a record that is not there', () => {
    const { candidates, brokenLinks } = rp.mergeCandidates({ self, links: [link({ broken: true })], allocated: [] })
    expect(candidates).toHaveLength(0)
    expect(brokenLinks).toBe(1)
  })

  it('never offers the deadline itself as its own work', () => {
    const { candidates } = rp.mergeCandidates({
      self,
      links: [link({ other: { id: 'ob1', kind: 'obligation', title: 'itself', summary: null } })],
      allocated: [{ period: '2026-W37', id: 'ob1', name: 'itself', kind: 'obligation', workspaceId: 'robotics', effortHours: 3 }],
    })
    expect(candidates).toHaveLength(0)
  })
})

describe('the picker draws a tickable row per candidate, saying where each came from', () => {
  const candidates = [
    {
      id: 'w1',
      name: 'Write the two pages',
      kind: 'task',
      from: ['linked — blocked by', 'on the plan in 2026-W37'],
      project: 'robotics',
      estimate: { at: 'stated' as const, hours: 6 },
    },
    {
      id: 'w2',
      name: 'Redo the figures',
      kind: 'task',
      from: ['on the plan in 2026-W37'],
      project: 'panelx',
      estimate: { at: 'nobody-said' as const },
    },
  ]

  const pick = (over: Partial<Parameters<RecordPage['DeadlineWorkPicker']>[0]> = {}) =>
    body(
      h(rp.DeadlineWorkPicker, {
        candidates,
        chosen: ['w1'],
        onToggle: () => undefined,
        brokenLinks: 0,
        goneAllocations: 0,
        periodsRead: ['2026-W36', '2026-W37'],
        periodsSkipped: [],
        reading: false,
        windowless: false,
        problem: null,
        ...over,
      }),
    )

  it('shows a press per candidate and marks the ones already ticked', () => {
    // A PRESS AND NOT A TICK BOX. This panel writes nothing and never did, but a box on a page
    // being read is the product's one signal for "you pressed Edit", and spending it on a control
    // that changes only what is being counted would cost the signal everywhere else. What a
    // checked box said, aria-pressed says.
    const html = pick()
    expect(html.match(/type="checkbox"/g)).toBeNull()
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(1)
  })

  it('says where each row came from, and which project owns it', () => {
    const html = pick()
    expect(html).toContain('linked — blocked by')
    expect(html).toContain('on the plan in 2026-W37')
    expect(html).toContain('project robotics')
    expect(html).toContain('project panelx')
  })

  it('draws the picker heading with no question mark under it', () => {
    // The heading names the list and nothing more: the hidden paragraph about why the person
    // chooses the work was explanation, and it is gone, not folded.
    const html = pick()
    expect(html).not.toContain('px-hint-mark')
  })

  it('names how far it looked when there were more periods than it reads', () => {
    const html = pick({ periodsSkipped: ['2026-W38', '2026-W39'] })
    expect(html).toContain('2026-W38, 2026-W39')
    expect(html).toContain('is not offered above')
  })

  it('keeps a plan it could not read apart from a plan with nothing in it', () => {
    const html = pick({ candidates: [], problem: { message: 'the planning store is unavailable', fault: null } })
    expect(html).toContain('the planning store is unavailable')
    expect(html).toContain('short by an unknown number')
    expect(html).not.toContain('nothing is on the plan between now and then')
  })

  it('draws a failed plan read by the error note’s one rule, and still says the list is short', () => {
    // The page hands the fault to ErrorNote (decision z_A0xVMbWOzh), so a server fault reads as the
    // page's own sentence in Normal mode, not the server's text. The sentence that the list below is
    // short by an unknown number is the page's own and stays whatever the failure was.
    const said = 'SQLITE_BUSY: database is locked'
    const fault = { kind: 'broken' as const, message: said, said, path: '/api/planning', status: 500, reason: null, detail: null, stored: null, elsewhere: null }
    const html = pick({ candidates: [], problem: { message: said, fault } })
    expect(html).toContain(en['error.brokenSays'])
    expect(html).not.toContain('database is locked')
    expect(html).toContain('short by an unknown number')
  })

  it('says no period was read at all when there is no window, rather than “nothing is planned”', () => {
    const html = pick({ candidates: [], windowless: true, periodsRead: [] })
    expect(html).toContain('no period of the plan was read')
    expect(html).toContain('not a finding that nothing is planned')
  })

  it('states the finding when there is genuinely nothing to offer', () => {
    // THE SENTENCE OF INSTRUCTIONS IS GONE -- "link the work to this record, or give it time on
    // the plan, and it will appear here" was a paragraph telling somebody how to use a screen
    // they are already on. What must survive is the part that is a FINDING about the data, and
    // its difference from the three cases above where nobody looked.
    const html = pick({ candidates: [] })
    expect(html).toContain('Nothing is linked to this record, and nothing is on the plan between now and then')
  })
})

// ============================================================================ what a ticked record is called

describe('a record keeps its name after it stops being offered', () => {
  const candidates = [
    { id: 'w1', name: 'Wave 5 — Planning MVP', kind: 'block', from: ['on the plan in 2026-W33'], project: 'panelx', estimate: { at: 'nobody-said' as const } },
  ]

  it('remembers what a candidate is called at the moment it is ticked', () => {
    // The offer is rebuilt from the periods between now and the deadline, so changing the horizon
    // rebuilds it. Ticking a block the plan gives time to THIS WEEK and then counting at the day
    // horizon leaves the offer made of ten days that hold no allocation — the block is gone from it,
    // and without this the row that sizes the block prints its nanoid.
    const after = rp.nameMemory(new Map(), candidates, 'w1')
    expect(after.get('w1')).toBe('Wave 5 — Planning MVP')
  })

  it('does not invent a name for an id no offer has ever named', () => {
    const before: ReadonlyMap<string, string> = new Map()
    expect(rp.nameMemory(before, candidates, 'ghost')).toBe(before)
  })

  it('draws a remembered name instead of the id, and an unnamed id as an id', () => {
    const o = outlook({ work: [{ id: 'w1', effortHours: null }] })
    expect(view(o, ['w1'], { w1: 'Wave 5 — Planning MVP' })).toContain('Wave 5 — Planning MVP')
    // Nothing has ever said what this one is called, and saying so is better than a blank.
    expect(view(o, ['w1'])).toContain('<code class="rp-id">w1</code>')
  })
})

// ============================================================================ where it is mounted

/**
 * A DATE MAKES A DEADLINE AND THE KIND DOES NOT.
 *
 * Asserted against the page's source rather than by rendering it, and the limit is stated rather
 * than hidden: RecordPage loads through `useAsync`, so rendering it here would mean stubbing four
 * requests and testing the stubs. The same technique, and the same reason, as the two tests in
 * tests/record-page.test.ts that check the module drawing is mounted.
 */
describe('the deadline panel is drawn for any record that says when it is owed', () => {
  const source = readFileSync(new URL('../src/web/pages/RecordPage.tsx', import.meta.url), 'utf8')

  it('mounts on the page, under the obligation panel', () => {
    const mount = source.indexOf('<DeadlinePanel')
    expect(mount, 'the panel is written and never mounted').toBeGreaterThan(-1)
    expect(mount).toBeGreaterThan(source.indexOf('<ObligationPanel'))
  })

  it('is gated on what the record says about when, and NOT on its kind', () => {
    // A task with a date on it is owed by that date just as much as an obligation is, and the
    // panel used to be reachable only through the obligation branch. `readDue` is the one reader
    // that says whether anything readable was written.
    const obligationBranch = source.slice(source.indexOf("record.kind === 'obligation' ?"))
    const branchEnd = obligationBranch.indexOf(') : null}')
    expect(branchEnd).toBeGreaterThan(-1)
    expect(
      obligationBranch.slice(0, branchEnd),
      'the panel is inside the obligation branch, so a dated task never gets it',
    ).not.toContain('<DeadlinePanel')
    expect(source).toContain("readDue(record.data).when === 'unstated' ? null : (")
  })
})

// ============================================================================ the request

describe('the browser asks for the deadline in the spelling the route publishes', () => {
  it('sends the ticked ids comma-separated, and the horizon it is counting at', async () => {
    const seen: string[] = []
    const original = globalThis.fetch
    globalThis.fetch = (async (input: string) => {
      seen.push(String(input))
      return new Response(JSON.stringify({ record: {}, outlook: {}, note: '' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as unknown as typeof fetch
    try {
      const { api } = await import('../src/web/api.ts')
      await api.deadline('ob1', ['w1', 'w2'], 'day')
      await api.deadline('ob1', [], 'week')
    } finally {
      globalThis.fetch = original
    }
    // `?work=<id>,<id>` is what the route splits on. A different join — repeated parameters, a
    // JSON array — would be read as ONE id and silently size nothing.
    expect(seen[0]).toContain('/api/planning/deadline/ob1?')
    expect(decodeURIComponent(seen[0] ?? '')).toContain('work=w1,w2')
    expect(decodeURIComponent(seen[0] ?? '')).toContain('horizon=day')
    // With nothing ticked the parameter is not sent at all, so the route answers `no-work-named`
    // rather than being handed an empty string to split.
    expect(seen[1]).not.toContain('work=')
  })
})
