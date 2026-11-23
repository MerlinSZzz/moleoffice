// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The record page's new semantics, the links panel's gates, and the change log's field diff.
 *
 * WHY THEY LOOK LIKE THIS. The runner's environment is `node` — there is no DOM, and adding one
 * would be a new dependency this project has ruled out. So there are two kinds of test here:
 *
 *   - the pure readers (`diffValues`, `gateOf`, `gateSentence`, `waitingNote`) are called directly.
 *     They decide what the page is ALLOWED to say, and every one of them exists because the wrong
 *     answer is a confident sentence about something nobody recorded.
 *   - the components are rendered to static markup with react-dom/server, which is enough to check
 *     what must be IN the markup: the author's own consequence sentence, the question drawn for a
 *     word nobody has classified, the three different nothings, the gate on a `blocks` link, the
 *     dashed edge on an inferred one, and the control that discharges an obligation.
 *
 * What these do NOT cover: how it looks. Whether the fact lines wrap at 390 and whether the alarm
 * panel reads in dark are screenshot questions, and they were checked that way.
 *
 * THE ONE RULE EVERY TEST BELOW IS REALLY CHECKING: Mole Office never answers a question nobody asked it.
 * An unstated gate is not a hard gate, an unclassified word is not a failure, a missing consequence
 * is not "nothing follows", and a record with no state word says which of three things that is.
 */

import { THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Change, GatedLink, PanelRecord, ResolvedLink } from '../src/shared/types.ts'
/** The declaration `POST /api/records` validates against, so a field here is a field that exists. */
import { KIND_SPECS } from '../src/shared/kinds.ts'
import { createI18n } from '../src/shared/i18n.ts'
import { sectionRegionId } from '../src/shared/regions.ts'
import { unclassifiedNote } from '../src/shared/work.ts'

/**
 * WHAT THESE RENDERS PASS FOR `declares`: see-through, because none of them reads a target.
 *
 * The panels below now take the answer from their caller's own `sectionsOf`. These tests read what
 * is INSIDE each panel — the words, the fold, the absence — so the see-through answer is the one
 * that leaves the markup they read exactly as it was.
 */
const SEE_THROUGH = { surface: null } as const

/** The English words, read from the word list by their keys. */
const en = createI18n('en').t


type RecordPage = typeof import('../src/web/pages/RecordPage.tsx')
type LinkPanel = typeof import('../src/web/components/LinkPanel.tsx')
type ChangeLogModule = typeof import('../src/web/components/ChangeLog.tsx')

let rp: RecordPage
let lp: LinkPanel
let cl: ChangeLogModule

beforeAll(async () => {
  // These modules reach api.ts and router.tsx, which touch window while they are being evaluated.
  // This is the smallest stand-in that lets them load; nothing here is under test.
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
  lp = await import('../src/web/components/LinkPanel.tsx')
  cl = await import('../src/web/components/ChangeLog.tsx')
})

/** Markup with the hoisted <style> blocks removed, so a class name mentioned in the CSS cannot
 *  be mistaken for evidence that something rendered it. */
function body(el: ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

let seq = 0
function record(over: Partial<PanelRecord> = {}): PanelRecord {
  seq += 1
  return {
    id: `rec-${seq}`,
    kind: 'problem',
    workspaceId: 'w1',
    ownerId: THE_TEST_OFFICES_OWNER.id,
    title: `Record ${seq}`,
    summary: null,
    data: {},
    createdAt: '2026-08-01 09:00:00',
    updatedAt: '2026-08-02 09:00:00',
    deletedAt: null,
    ...over,
  }
}

// ============================================================================ one page, one answer

// ============================================================================ the module drawing

// ============================================================================ one word, one meaning

/**
 * THREE THINGS ON THIS PRODUCT WERE CALLED "Done" AND THEY MEANT TWO DIFFERENT THINGS.
 *
 * A tester listed them on 18 August 2026: this page's Done button, which stops editing; the state
 * "done" on a record, which means the work is finished; and the schedule's Done press, which also
 * means the work is finished. The tester pressed the first expecting the second — and on this page the two
 * are inches apart, because the state sits under "where it stands" a little further down.
 *
 * The two that mean the work is finished keep the word. The one that means "stop editing" says what
 * it does. This is what goes red if it gets the word back.
 */
describe('the word Done is kept for the work being finished', () => {
  const head = (editing: boolean) =>
    body(
      h(rp.RecordHead, {
        record: record({ kind: 'task', data: { state: 'todo' } }),
        // NOTHING IS JOINED TO IT, which is a statement about this fixture and not a gap in it.
        relations: [],
        projects: [],
        incomplete: [],
        deleted: false,
        editing,
        busy: false,
        onSaved: () => {},
        onDelete: async () => {},
      }),
    )

  it('says what the press out of editing does, rather than calling it Done', () => {
    const editing = head(true)

    expect(editing).toContain('Stop editing')
    expect(editing).not.toContain('>Done<')
  })

  /** And the press INTO editing is untouched, so the pair still reads as a pair. */
  it('still offers Edit when the page is being read', () => {
    const reading = head(false)

    expect(reading).toContain('Edit')
    expect(reading).not.toContain('Stop editing')
  })

  /**
   * THE SECOND ONE ON THIS PAGE, WHICH IS WORSE, because it sits beside a Save press on the panel
   * that writes the state. It puts the box away and writes nothing at all.
   */
  it('says the field editor press puts the box away, rather than calling it Done', () => {
    const field = KIND_SPECS['task'].fields.find((one) => one.key === 'state')
    if (field === undefined) throw new Error('a task declares no state field')
    const markup = body(
      h(rp.FieldWriter, {
        recordId: 'rec-1',
        kind: 'task',
        field,
        control: rp.controlFor('task', field),
        stored: 'todo',
        records: [],
        onSaved: () => {},
        onClose: () => {},
      }),
    )

    expect(markup).toContain('Close')
    expect(markup).not.toContain('>Done<')
  })

  /**
   * AND THE WORD STILL MEANS THE WORK IS FINISHED WHERE IT REALLY DOES. `done` is the state a task
   * ends at, and this is the shared table that turns it into a word on screen. Renaming the button
   * must not have gone anywhere near it.
   */
  it('keeps "done" as the word for a task whose work is finished', () => {
    expect(body(h(rp.StateSays, { record: record({ kind: 'task', data: { state: 'done' } }) }))).toContain('done')
  })
})

// ============================================================================ what the state says

describe('the record page says what its own state means', () => {
  const said = (over: Partial<PanelRecord>) => body(h(rp.StateSays, { record: record(over) }))

  it('prints the stored word as stored, and what the shared table says it means', () => {
    // `idle` keeps its name. Decision 4: show the reason beside it, never infer "waiting on you".
    const html = said({ kind: 'session', data: { state: 'idle' } })
    expect(html).toContain('idle')
    expect(html).toContain('stopped short')
    expect(html).toContain('the work began and did not finish')
  })

  it('draws a word nobody has classified as a question, with the shared sentence', () => {
    // `chasing` AND NOT `fixed`, WHICH IS WHAT THIS SAID UNTIL THIS PASS. `fixed` is now
    // classified, along with the other nine words the kinds declared and STATE_MEANING had never
    // heard of, so it no longer exercises this path at all. `chasing` is the word from the report
    // that made the group exist and it is in no kind's vocabulary — which is the point. A stored
    // record can hold it, because vocabularies change under records that are already filed; a new
    // write cannot, because the write gate refuses a word the kind does not declare. This page has
    // to draw what is STORED, whatever the schema says today.
    const html = said({ kind: 'problem', data: { state: 'chasing' } })
    expect(html).toContain('Not classified')
    // The sentence is `unclassifiedNote` from shared/work.ts, read from that function — the same
    // words the server prints, not a second wording invented here.
    expect(html).toContain(unclassifiedNote('chasing').replaceAll('"', '&quot;'))
    // Not an alarm: Mole Office has not decided this record is in trouble, it cannot tell.
    expect(html).not.toContain('data-rank="0"')
  })

  it('says a blank state on a kind that has a state field, and draws nothing on a kind that has none', () => {
    expect(said({ kind: 'session', data: {} })).toContain('No state written')
    // A KIND WITH NO STATE FIELD DRAWS NO STATE SECTION (decision 8SkQQo1x69IV, revision 3). The line that said so
    // only told a reader what the absence of the section tells them.
    expect(said({ kind: 'note', data: {} })).toBe('')
  })

  it('shows the stored consequence in the author’s own words', () => {
    const html = said({
      kind: 'problem',
      data: {
        state: 'open',
        consequence: { bearer: 'dependent', what: 'Four pieces of work wait on this print.' },
      },
    })
    expect(html).toContain('Dependent')
    expect(html).toContain('Four pieces of work wait on this print.')
  })

  it('says a missing consequence is a gap, not a judgement that nothing follows', () => {
    const html = said({ kind: 'problem', data: { state: 'open' } })
    expect(html).toContain('Nobody has recorded who is hurt')
    // `bearer: none` is somebody saying nothing follows. An empty field is nobody having looked,
    // and the sentence has to keep the two apart.
    expect(html).toContain('not the same as a recorded')
  })

  it('does not invent a consequence gap on a kind that cannot store one', () => {
    // `note` declares no `consequence` field, so "nobody has said who is hurt" would name a gap
    // nobody can close.
    expect(said({ kind: 'note', data: {} })).not.toContain('Nobody has recorded who is hurt')
  })

  it('is an alarm panel for a stored consequence of “a person could be hurt”, and only that', () => {
    const safety = said({
      kind: 'problem',
      data: {
        state: 'open',
        consequence: { bearer: 'person', what: 'The rig keeps moving after the stop button is pressed.' },
      },
    })
    expect(safety).toContain('data-rank="0"')
    expect(safety).toContain('Safety')
    expect(safety).toContain('Safety')

    const property = said({
      kind: 'problem',
      data: { state: 'open', consequence: { bearer: 'property', what: 'The print bed is tied up.' } },
    })
    expect(property).not.toContain('data-rank="0"')
    expect(property).not.toContain('Safety:')
  })

  it('shows a pause with its reason and what should end it', () => {
    const html = said({
      kind: 'module',
      data: {
        paused: {
          since: '2026-08-01',
          why: '力计要还回计量室',
          until: { condition: 'the replacement gauge is on the bench' },
        },
      },
    })
    expect(html).toContain('Paused')
    expect(html).toContain('力计要还回计量室')
    expect(html).toContain('the replacement gauge is on the bench')
  })

  it('says an open-ended pause is open-ended rather than leaving the line blank', () => {
    const html = said({
      kind: 'module',
      data: { paused: { since: '2026-06-02', why: 'Waiting for the SLAM group' } },
    })
    expect(html).toContain('Open-ended')
    expect(html).toContain('nothing recorded says what brings it back')
  })

  it('names a pause whose reason was never written', () => {
    const html = said({ kind: 'task', data: { state: 'paused' } })
    expect(html).toContain('Paused, no reason')
    expect(html).toContain('cannot be told from abandonment')
  })
})

// ============================================================================ discharging a promise

describe('an obligation can be discharged, and says what it is owed to whom', () => {
  const owed = (over: Record<string, unknown>, editable = true, records: { id: string; title: string }[] = []) =>
    body(
      h(rp.ObligationPanel, {
        record: record({ kind: 'obligation', data: over }),
        editable,
        records,
        onChanged: () => undefined,
      }),
    )

  /**
   * THE THREE FORMS `due` IS DECLARED IN, ALL READ BY THIS PANEL.
   *
   * It used to read `data.due` only as a string, so an obligation owed on a condition or on another
   * record printed "no date is stored, so this can never come due" while the deadline panel three
   * inches down the same page printed the trigger in words. One question, two answers, on one
   * screen — and reachable from the browser the moment the record page grew a control that can
   * write those forms.
   */
  it('reads a due owed on a condition and on a record, not only one written as a stamp', () => {
    const onCondition = owed({ due: { condition: 'the reprint is on the bench' }, state: 'open' })
    expect(onCondition).toContain('the reprint is on the bench')
    expect(onCondition).not.toContain('no date is stored')

    const onRecord = owed({ due: { recordId: 'r-99' }, state: 'open' }, true, [
      { id: 'r-99', title: 'The 50 mm reprint' },
    ])
    expect(onRecord).toContain('The 50 mm reprint')
    expect(onRecord).not.toContain('no date is stored')
    // An id nothing here can name is drawn as the id, never blank and never a guess.
    expect(owed({ due: { recordId: 'r-gone' }, state: 'open' })).toContain('r-gone')
  })

  it('offers the action, and says the note is what makes it checkable later', () => {
    const html = owed({ due: '2026-08-03', owedTo: 'the ESA grant review', state: 'open' })
    expect(html).toContain('what settled it')
    expect(html).toContain('Record that this is settled')
    expect(html).toContain('the ESA grant review')
  })

  it('offers cancelled beside fulfilled, because they are different news', () => {
    const html = owed({ due: '2026-08-03', state: 'open' })
    expect(html).toContain('fulfilled — it was delivered')
    expect(html).toContain('cancelled — it stopped being owed')
  })

  it('shows a discharged promise with when it was kept and what settled it, and no form', () => {
    const html = owed({
      due: '2026-08-03',
      owedTo: 'the metrology lab',
      state: 'fulfilled',
      done: true,
      fulfilledAt: '2026-08-09 16:40',
      fulfilledNote: 'Handed back at the bench and signed for.',
    })
    expect(html).toContain('discharged')
    expect(html).toContain('Handed back at the bench and signed for.')
    expect(html).not.toContain('Record that this is settled')
  })

  it('says so when a discharged promise records no date and no note', () => {
    const html = owed({ due: '2026-08-03', done: true, state: 'fulfilled' })
    expect(html).toContain('nothing records when')
    expect(html).toContain('Nothing records what settled it')
  })

  it('says an obligation with no date can never come due, rather than leaving it blank', () => {
    expect(owed({ state: 'open' })).toContain('no date is stored')
  })

  it('says an obligation with nobody at the other end is a task', () => {
    expect(owed({ due: '2026-08-03', state: 'open' })).toContain('an obligation with nobody waiting is a task')
  })

  it('offers nothing that writes on a deleted record', () => {
    // THE "RESTORE THIS RECORD FIRST" LINE IS GONE, here and in three other panels. The page
    // carries one alarm at the top saying the record is deleted, with the button that brings it
    // back; four more copies of that sentence lower down were four lines repeating what the
    // reader was told first. What is asserted is the property that matters and that a sentence
    // never enforced: a deleted obligation offers no control that writes.
    const html = owed({ due: '2026-08-03', state: 'open' }, false)
    expect(html).not.toContain('Record that this is settled')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('<input')
    // …and it still reads: what is owed, and to whom, is drawn either way.
    expect(html).toContain('owed to')
  })
})

// ============================================================================ gates on links

describe('a gate says how much a link blocks, and an unstated one is not a hard one', () => {
  const link = (over: Partial<lpLink> = {}): lpLink => ({
    linkId: 'l1',
    type: 'blocks',
    label: 'blocked by',
    isBacklink: true,
    inferred: false,
    other: { id: 'r2', kind: 'task', title: '重印 v3 #4', summary: null },
    broken: false,
    gate: null,
    gateLabel: null,
    gateProblem: null,
    gateStage: null,
    ...over,
  })

  it('reads a hard gate, a partial gate, an unstated one and an unreadable one apart', () => {
    expect(lp.gateOf(link({ gate: { kind: 'hard' } })).at).toBe('gate')
    expect(lp.gateOf(link({ gate: { kind: 'partial', upTo: 'bench tuning' } })).at).toBe('gate')
    expect(lp.gateOf(link({ gate: null })).at).toBe('unstated')
    expect(lp.gateOf(link({ gateProblem: 'the stored gate says partial and no stage was recorded' })).at).toBe(
      'unreadable',
    )
  })

  it('says nothing about a link type that states no dependency', () => {
    expect(lp.gateOf(link({ type: 'consumes', label: 'consumed by' })).at).toBe('not-a-dependency')
  })

  it('tells a reply that did not carry the gate apart from a link with none stored', () => {
    // Two different silences: the server said "nobody stated a gate", or the server said nothing.
    const served = link({ gate: null })
    const notServed: ResolvedLink = {
      linkId: 'l9',
      type: 'blocks',
      label: 'blocked by',
      isBacklink: true,
      inferred: false,
      other: { id: 'r2', kind: 'task', title: 'x', summary: null },
      broken: false,
    }
    expect(lp.gateOf(served).at).toBe('unstated')
    expect(lp.gateOf(notServed).at).toBe('not-served')
  })

  it('writes the sentence from the side of the record you are looking at', () => {
    const waiting = link({ gate: { kind: 'hard' }, isBacklink: true, label: 'blocked by' })
    expect(lp.gateSentence(waiting, lp.gateOf(waiting))).toContain('must finish before this')

    const blocking = link({ gate: { kind: 'hard' }, isBacklink: false, label: 'blocks' })
    expect(lp.gateSentence(blocking, lp.gateOf(blocking))).toContain('This must finish before')
  })

  it('says how far a partial gate lets the blocked record get', () => {
    const partial = link({ gate: { kind: 'partial', upTo: 'bench tuning without the arm' } })
    expect(lp.gateSentence(partial, lp.gateOf(partial))).toContain('bench tuning without the arm')
  })

  it('refuses to read an unstated gate as a hard one', () => {
    const unstated = link({ gate: null })
    const sentence = lp.gateSentence(unstated, lp.gateOf(unstated)) ?? ''
    expect(sentence).toContain('Nobody has said how much')
    expect(sentence).toContain('not the same as saying it blocks completely')
  })

  it('counts what a record is waiting for, by how much each one blocks', () => {
    const note = lp.waitingNote([
      link({ linkId: 'a', gate: { kind: 'hard' } }),
      link({ linkId: 'b', gate: { kind: 'partial', upTo: 'the two measured rows' } }),
      link({ linkId: 'c', gate: null }),
    ])
    expect(note).toContain('waiting for 3 things')
    expect(note).toContain('1 that must finish first')
    expect(note).toContain('part of the way')
    expect(note).toContain('nobody has said how much')
  })

  it('does no arithmetic when there is one thing to wait for', () => {
    // "waiting for 1 thing: 1 that must finish first" is what a count-everything rule writes when
    // nobody reads it out loud.
    expect(lp.waitingNote([link({ gate: { kind: 'hard' } })])).toBe(
      'This record is waiting for one thing, and it must finish first.',
    )
  })

  it('says nothing at all when the record waits on nothing', () => {
    expect(lp.waitingNote([link({ type: 'consumes', label: 'consumed by' })])).toBeNull()
  })
})

/**
 * The link shape the panel takes.
 *
 * This was a FOURTH declaration of the three gate fields — after the server's, the browser's and
 * the one missing from web/api.ts — and it had all three OPTIONAL. So a fixture could leave one out
 * and nothing here would say a word, while the real server sends all three on every link. It is now
 * the one shared declaration, and `notServed` above stays a bare `ResolvedLink` on purpose: that is
 * the case where a reply genuinely did not carry them.
 */
type lpLink = GatedLink

describe('LinkPanel draws the gate and keeps inferred visibly apart from confirmed', () => {
  const link = (over: Partial<lpLink>): lpLink => ({
    linkId: 'l1',
    type: 'consumes',
    label: 'consumes',
    isBacklink: false,
    inferred: false,
    other: { id: 'r2', kind: 'claim', title: 'Effort 12 grip force is enough', summary: 'retracted' },
    broken: false,
    gate: null,
    gateLabel: null,
    gateProblem: null,
    gateStage: null,
    ...over,
  })

  const render = (links: lpLink[], editable = true) =>
    body(
      h(lp.LinkPanel, {
        declares: SEE_THROUGH,
        // THE KIND THE PANEL NAMES ITS HEADING FROM. `Links` is declared once, on the section.
        kind: 'report' as const,
        recordId: 'r1',
        links,
        knownTitles: [{ id: 'r9', value: 'Tray clamp', note: null }],
        editable,
        onChanged: () => undefined,
      }),
    )

  it('marks an inferred link four ways, one of which is the reserved dashed edge', () => {
    const html = render([link({ inferred: true })])
    // The dash means "Mole Office worked this out" here and in the inferred mark, and nowhere else.
    expect(html).toContain('data-inferred="1"')
    expect(html).toContain('inferred')
    expect(html).toContain(en('record.links.notConfirmed', { n: 1, total: 1 }))
  })

  /**
   * THE COUNT IS A FACT ABOUT THIS RECORD, AND IT IS ALL THE PANEL SAYS ABOUT INFERRED LINKS.
   *
   * The panel used to fold a sentence about what a dashed edge means under the count. The dashed
   * edge and the inferred mark on each row say which links they are, so the count stands alone,
   * on screen, with nothing folded beside it.
   */
  describe('the inferred count stays on screen, with nothing folded beside it', () => {
    const shownAtRest = (html: string): string =>
      [...html.matchAll(/<summary[^>]*>([\s\S]*?)<\/summary>/g)]
        .map((match) => match[1] ?? '')
        .join(' ')
        .replace(/<[^>]+>/g, '')
    const inferredLine = (html: string): string | null =>
      /<p class="lp-inferred">([\s\S]*?)<\/p>/.exec(html)?.[1]?.replace(/<[^>]+>/g, '') ?? null

    it('counts how many of these links nobody has confirmed, with no fold', () => {
      const html = render([link({ inferred: true }), link({ linkId: 'l2', inferred: true }), link({ linkId: 'l3' })])
      expect(inferredLine(html)).toBe(en('record.links.notConfirmed', { n: 2, total: 3 }))
      expect(html).not.toContain('px-explain')
    })

    it('counts the small cases the same way, and gives nothing when nothing is inferred', () => {
      expect(lp.inferredNote(1, 1)).toBe(en('record.links.notConfirmed', { n: 1, total: 1 }))
      expect(lp.inferredNote(3, 3)).toBe(en('record.links.notConfirmed', { n: 3, total: 3 }))
      expect(lp.inferredNote(1, 4)).toBe(en('record.links.notConfirmed', { n: 1, total: 4 }))
      expect(lp.inferredNote(2, 4)).toBe(en('record.links.notConfirmed', { n: 2, total: 4 }))
      // Nothing inferred gives no count, so the caller draws no line.
      expect(lp.inferredNote(0, 4)).toBe(null)
    })

    it('draws no count at all when nobody inferred anything', () => {
      const html = render([link({})])
      expect(html).not.toContain('px-explain')
      expect(html).not.toContain('lp-inferred')
    })

    it('leaves what this record is WAITING FOR out in the open, because that is not an explanation', () => {
      // The waiting sentence is a computed fact about this record with its own exact counts. It is
      // the thing a reader came for, so it does not fold; the app-level convention does.
      const html = render([link({ type: 'blocks', label: 'blocked by', isBacklink: true, gate: { kind: 'hard' } })])
      expect(html).toContain('waiting for one thing')
      expect(shownAtRest(html)).not.toContain('waiting for one thing')
      expect(html).toContain('lp-waiting')
    })
  })

  it('does not mark a confirmed link as inferred', () => {
    expect(render([link({})])).not.toContain('data-inferred="1"')
  })

  it('draws the gate on a blocks link, in the shared wording', () => {
    const html = render([
      link({ type: 'blocks', label: 'blocked by', isBacklink: true, gate: { kind: 'hard' } }),
    ])
    expect(html).toContain('Hard gate')
    expect(html).toContain('must finish before this')
    expect(html).toContain('waiting for one thing')
  })

  it('says how far a partial gate goes rather than drawing a weaker hard gate', () => {
    const html = render([
      link({
        type: 'blocks',
        label: 'blocked by',
        isBacklink: true,
        gate: { kind: 'partial', upTo: '夹具标定 至 力控标定前' },
      }),
    ])
    expect(html).toContain('Partial gate')
    expect(html).toContain('夹具标定 至 力控标定前')
  })

  it('shows an unreadable stored gate rather than swallowing it', () => {
    const html = render([
      link({
        type: 'blocks',
        label: 'blocked by',
        isBacklink: true,
        gateProblem: 'this link stores a partial gate with no stage',
      }),
    ])
    expect(html).toContain('Gate unreadable')
    // Criterion change: 7FEOshq3mBGG keeps a raw gate diagnostic in developer mode.
    expect(html).toContain('The stored blocking rule could not be read.')
    expect(html).not.toContain('no stage')
  })

  it('keeps a dead link visible, in the alarm colour, with the way to undo the deletion', () => {
    const html = render([link({ broken: true })])
    expect(html).toContain('Effort 12 grip force is enough')
    expect(html).toContain('Broken')
    expect(html).toContain('1 broken')
    expect(html).toContain('Restore')
    expect(html).toContain('has been deleted')
    expect(html).toContain('data-rank="0"')
  })

  it('does not send the reader to a record that is no longer there', () => {
    expect(render([link({ broken: true })])).not.toContain('href="#/r/r2"')
    expect(render([link({})])).toContain('href="#/r/r2"')
  })

  /*
   * THE SPLIT MOVED BEHIND INSPECT, SO THIS TEST BECAME ITS OTHER HALF.
   *
   * Which side of a link is stored where is a fact about the database; every row already says which
   * way it reads, because the server sends `label` from THIS record's point of view. So normal mode
   * draws one list and Inspect draws the two labelled groups.
   *
   * This file cannot express Inspect — it installs one window in `beforeAll` and imports the page
   * once, and the mode is read at import time. The half that asserts the groups ARE there in Inspect
   * lives in tests/record-tiers.test.ts, which re-imports per test. Both halves have to exist, or
   * "it is absent" is satisfied by having deleted it.
   */
  it('draws both directions as one list in normal mode, with no storage note', () => {
    // THE SECOND ROW IS TO THE TRAY CLAMP, so the check below finds the title in that row. Until wave 13y round 143 both
    // rows were to the same claim, and the check found the title in the list beside the form, which was drawn with it.
    const html = render([
      link({}),
      link({ linkId: 'l2', isBacklink: true, label: 'consumed by', other: { id: 'r9', kind: 'note', title: 'Tray clamp', summary: null } }),
    ])
    // Both rows are there…
    expect(html).toContain('consumed by')
    expect(html).toContain('Tray clamp')
    // …and neither the split nor the note about where each side is written is.
    expect(html).not.toContain('Outgoing')
    expect(html).not.toContain('stored here')
    expect(html).not.toContain('Incoming')
    expect(html).not.toContain('stored on their side')
  })

  it('offers the gate control only for the type that states a dependency', () => {
    // The form starts on `relates_to`, which cannot carry a gate, so the control is not drawn.
    expect(render([])).not.toContain('how much it blocks')
    expect(render([])).toContain('Add link')
  })

  it('wires its suggestion list to the input, and draws no title in it before the box is used', () => {
    const html = render([])
    const list = /<input[^>]*\slist="([^"]+)"/.exec(html)?.[1]
    expect(list, 'the title input has no list attribute').toBeDefined()
    // THE TITLES ARE DRAWN WHEN THE BOX FIRST TAKES THE FOCUS (wave 13y round 143), since a browser shows a datalist only
    // to a box with the focus. So the list drawn here is empty, and
    // tests/the-edit-form-asks-its-context-once-and-lists-titles-when-used-in-the-browser.test.ts finds every title the
    // door offers in it after the focus.
    expect(html).toContain(`<datalist id="${list ?? ''}"></datalist>`)
    expect(html).not.toContain('Tray clamp')
  })
})

// ============================================================================ the field-level diff

describe('a change to an object value is diffed key by key', () => {
  const json = (v: unknown) => JSON.stringify(v)

  it('reports only the keys that differ', () => {
    const diffs = cl.diffValues(
      json({ context: 'unchanged prose', summary: 'before' }),
      json({ context: 'unchanged prose', summary: 'after' }),
    )
    expect(diffs?.map((d) => d.path)).toEqual(['summary'])
    expect(diffs?.[0]?.before).toBe('before')
    expect(diffs?.[0]?.after).toBe('after')
  })

  it('tells an added key apart from a changed one, and a removed key apart from an empty value', () => {
    const diffs = cl.diffValues(json({ a: 1, gone: 'x' }), json({ a: 1, added: 'y' }))
    const byPath = new Map(diffs?.map((d) => [d.path, d.kind]))
    expect(byPath.get('added')).toBe('added')
    expect(byPath.get('gone')).toBe('removed')
  })

  it('walks into nested objects so the path names what actually moved', () => {
    const diffs = cl.diffValues(json({ until: { date: '2026-09-01' } }), json({ until: { date: '2026-10-01' } }))
    expect(diffs?.map((d) => d.path)).toEqual(['until.date'])
  })

  it('walks an array of things with ids by id, so a reordered list is not a wall of changes', () => {
    const before = json({
      parts: [
        { id: 'p1', items: [{ id: 'i1', state: 'doing' }, { id: 'i2', state: 'todo' }] },
      ],
    })
    const after = json({
      parts: [
        { id: 'p1', items: [{ id: 'i2', state: 'todo' }, { id: 'i1', state: 'done' }] },
      ],
    })
    const diffs = cl.diffValues(before, after)
    // The same path spelling the server writes into a change row's field column.
    expect(diffs?.map((d) => d.path)).toEqual(['parts[#p1].items[#i1].state'])
    expect(diffs?.[0]?.before).toBe('doing')
    expect(diffs?.[0]?.after).toBe('done')
  })

  it('leaves two plain strings alone, because a before and after of two strings is already clear', () => {
    expect(cl.diffValues('before', 'after')).toBeNull()
  })

  it('leaves a one-sided change alone rather than inventing an empty object to diff against', () => {
    expect(cl.diffValues(null, json({ a: 1 }))).toBeNull()
    expect(cl.diffValues(json({ a: 1 }), null)).toBeNull()
  })

  it('answers with an empty list, not null, when two objects were read and nothing differs', () => {
    expect(cl.diffValues(json({ a: 1 }), json({ a: 1 }))).toEqual([])
  })
})

describe('the change row draws the diff instead of two walls of JSON', () => {
  const change = (over: Partial<Change>): Change => ({
    id: 'c1',
    recordId: 'r1',
    origin: 'authored',
    op: 'update',
    actorType: 'agent',
    actorId: 'claude-code',
    sessionId: null,
    field: 'data',
    oldValue: null,
    newValue: null,
    at: '2026-08-07 10:00:00',
    ...over,
  })

  const log = (c: Change) => body(h(cl.ChangeLog, { changes: [c], sessions: [] }))

  it('names the key that moved and does not print the part that did not', () => {
    const context = 'A ZED 2i on the chest mast, angled down the bench. It is the wide view.'
    const html = log(
      change({
        oldValue: JSON.stringify({ context, summary: 'the old line' }),
        newValue: JSON.stringify({ context, summary: 'the new line' }),
      }),
    )
    expect(html).toContain('summary')
    expect(html).toContain('the old line')
    expect(html).toContain('the new line')
    // The unchanged context used to be printed twice, once with a line through it, asserting a
    // removal that never happened.
    expect(html).not.toContain('angled down the bench')
  })

  it('says so when the whole object was written again and nothing in it differs', () => {
    const same = JSON.stringify({ context: 'unchanged' })
    expect(log(change({ oldValue: same, newValue: same }))).toContain('no key in it differs')
  })

  it('names what is behind the fold rather than counting it', () => {
    const before: Record<string, string> = {}
    const after: Record<string, string> = {}
    for (const key of ['a', 'b', 'c', 'd', 'e', 'f']) {
      before[key] = 'old'
      after[key] = 'new'
    }
    const html = log(change({ oldValue: JSON.stringify(before), newValue: JSON.stringify(after) }))
    expect(html).toContain('2 more changed: e, f')
    expect(html).not.toContain('2 more…')
  })

  it('still prints a plain before and after for a string field', () => {
    const html = log(change({ field: 'summary', oldValue: 'before', newValue: 'after' }))
    expect(html).toContain('before')
    expect(html).toContain('after')
  })
})

describe('a link row names the record it points at, or says why it cannot', () => {
  const linked = (over: Partial<Change> = {}): Change => ({
    id: 'c1',
    recordId: 'r1',
    origin: 'authored',
    op: 'link',
    actorType: 'human',
    actorId: THE_TEST_OFFICES_OWNER.id,
    sessionId: null,
    field: 'blocks',
    // Where the server puts the TARGET RECORD'S ID depends on the operation: the NEW value when a
    // link is made, the OLD value when one is removed. Both spellings are in the tests below,
    // because reading only one of them named half the rows and printed an id for the rest — which
    // is what the screenshots showed the first time this was written.
    oldValue: null,
    newValue: 'nsKsnUs41WCD',
    at: '2026-08-07 10:00:00',
    ...over,
  })

  it('shows the title, linked, when the caller supplied the workspace titles', () => {
    const html = body(
      h(cl.ChangeLog, {
        changes: [linked()],
        sessions: [],
        titles: new Map([['nsKsnUs41WCD', 'Implement the software E-stop handler']]),
      }),
    )
    expect(html).toContain('Implement the software E-stop handler')
    expect(html).toContain('href="#/r/nsKsnUs41WCD"')
  })

  it('names the target of an unlink too, which stores it on the other side', () => {
    const html = body(
      h(cl.ChangeLog, {
        changes: [linked({ op: 'unlink', oldValue: 'nsKsnUs41WCD', newValue: null })],
        sessions: [],
        titles: new Map([['nsKsnUs41WCD', 'Implement the software E-stop handler']]),
      }),
    )
    expect(html).toContain('Implement the software E-stop handler')
  })

  it('says it could not find a name rather than printing an unresolved id', () => {
    const html = body(h(cl.ChangeLog, { changes: [linked()], sessions: [], titles: new Map() }))
    expect(html).toContain('Mole Office could not find a name for this linked record.')
    expect(html).not.toContain('nsKsnUs41WCD')
  })

  it('keeps the id, marked as an id, when the caller has no titles to offer', () => {
    // Not the same silence: "Mole Office did not ask" and "nothing answered" are different sentences.
    const name = cl.linkTargetOf(linked(), undefined)
    expect(name?.at).toBe('unjoined')
  })

  it('says nothing about a link target on a row that is not a link', () => {
    expect(cl.linkTargetOf(linked({ op: 'update', field: 'summary' }), new Map())).toBeNull()
  })
})

// ============================================================================ the citizen press

/**
 * THE WAY FROM AN AGENT'S RECORD TO ITS CITIZEN PAGE CARRIES THE REGISTRY ID.
 *
 * Criterion I4 and criterion M97. A citizen's page is `/who/agent/<registry id>`, and an agent
 * record stores a HANDLE, which is a different string once ids are minted. This is the one link in
 * the product whose argument was a handle where the contract says id, and these cases hold it.
 *
 * THE SECOND CASE IS THE ONE A HANDLE LOOKUP GETS WRONG. A handle is free again after retirement, so
 * two rows can bear one handle: the retired agent this record belongs to and a later live agent. The
 * row is found by the record it names rather than by the handle, or the press would send the reader
 * to the live agent's page.
 */
describe('the citizen press carries the registry id', () => {
  /** One registry row, with only the fields this link reads filled in. */
  const onTheWire = (over: {
    id: string
    name: string
    handle: string
    record?: string | null
    retired?: boolean
    retiredAt?: string | null
  }) => ({
    kind: 'agent',
    id: over.id,
    name: over.name,
    handle: over.handle,
    avatarUrl: '/api/portraits/role/worker/worker-1',
    state: null,
    stateAt: null,
    createdAt: '2026-09-23 09:00:00',
    homeWorld: null,
    record: over.record ?? null,
    retired: over.retired ?? false,
    retiredAt: over.retiredAt ?? null,
  })

  const agentRecord = (handle: string, id: string): PanelRecord =>
    record({ id, kind: 'agent', title: THE_TEST_OFFICES_SECRETARY.name, data: { handle } })

  const drawnHead = (rec: PanelRecord, agents: ReturnType<typeof onTheWire>[]): string =>
    body(
      h(rp.RecordHead, {
        record: rec,
        relations: [],
        projects: [],
        incomplete: [],
        deleted: false,
        editing: false,
        busy: false,
        participants: { people: [], agents },
        onSaved: () => {},
        onDelete: async () => {},
      } as never),
    )

  it('addresses the page by the registry id and not by the stored handle', () => {
    const rec = agentRecord('a-handle', 'the-record')
    const html = drawnHead(rec, [onTheWire({ id: 'minted-id', name: THE_TEST_OFFICES_SECRETARY.name, handle: 'a-handle', record: 'the-record' })])
    // THE CONTROL: the press is drawn at all, so a missing link cannot pass for a correct address.
    expect(html, 'the citizen press is not drawn').toContain('Open its page')
    expect(html, 'the press does not carry the registry id').toContain('href="#/who/agent/minted-id"')
    expect(html, 'the press carries the handle where the id belongs').not.toContain('href="#/who/agent/a-handle"')
  })

  it('picks the row whose record this is, not a later live agent on a reused handle', () => {
    const rec = agentRecord('a-handle', 'the-retired-record')
    const html = drawnHead(rec, [
      onTheWire({ id: 'minted-retired', name: THE_TEST_OFFICES_SECRETARY.name, handle: 'a-handle', record: 'the-retired-record', retired: true, retiredAt: '2026-09-23 09:30:00' }),
      onTheWire({ id: 'minted-live', name: THE_TEST_OFFICES_SECRETARY.name, handle: 'a-handle', record: 'a-later-record' }),
    ])
    expect(html, 'the press followed the handle to the live agent').toContain('href="#/who/agent/minted-retired"')
    expect(html).not.toContain('href="#/who/agent/minted-live"')
  })

  it('falls back to the handle where the caller read no registry rows', () => {
    // A REAL ANSWER, not a crash: the handle is the id on every row registered before the mint.
    const rec = agentRecord('a-handle', 'the-record')
    const html = body(
      h(rp.RecordHead, {
        record: rec,
        relations: [],
        projects: [],
        incomplete: [],
        deleted: false,
        editing: false,
        busy: false,
        onSaved: () => {},
        onDelete: async () => {},
      } as never),
    )
    expect(html).toContain('href="#/who/agent/a-handle"')
  })
})

// ============================================================================ the rail's two folds

/**
 * A PRESS ON THE SPEND FOLD OR THE LINKS FOLD ANSWERS THAT FOLD, NOT THE RECORD. Problem
 * kkxhj88hCHEj.
 *
 * The press walks up the page from the element under the pointer to the nearest one that declares a
 * target. The spend fold declared nothing, and the links fold's summary line sat outside the panel
 * that declared the links section, so a press on either walked past the rail and answered the whole
 * record: a comment about the spend or the links was filed as a comment about the record. Each fold
 * now carries its own section, the way the change-log fold between them already did.
 *
 * WHAT IT READS: the opening tag of each fold, and that the links section is on one element only,
 * because `MarkLayer` finds a comment's element by its id and one id may be on one element.
 *
 * THE MUTATION: take `{...declaredAttributes(declares)}` off the details element in `WhatWasSpent`
 * in src/web/pages/RecordPage.tsx. The first case goes red, saying the spend fold declares nothing.
 */
describe('the folds in the record rail each say what they are', () => {
  const railOf = (over: Partial<PanelRecord> = {}): string => {
    const r = record({ id: 'rec-rail', ...over })
    const links: lpLink[] = [
      {
        linkId: 'l1',
        type: 'relates_to',
        label: 'relates to',
        isBacklink: false,
        inferred: false,
        other: { id: 'r2', kind: 'task', title: 'Reprint the bracket', summary: null },
        broken: false,
        gate: null,
        gateLabel: null,
        gateProblem: null,
        gateStage: null,
      },
    ]
    return body(
      h(rp.RecordRail, {
        record: r,
        links,
        log: {
          changes: [],
          sessions: [],
          spent: {
            runs: [],
            totals: { overall: { values: {} } },
            runsWithoutReceipt: 0,
            changesOnRecord: 0,
            changesNamingNoRun: 0,
            says: 'Nothing was counted.',
          },
        } as unknown as Parameters<typeof rp.RecordRail>[0]['log'],
        titles: [],
        titleById: new Map(),
        unfilledByRecord: new Map(),
        editable: false,
        onChanged: () => undefined,
      }),
    )
  }
  /** The opening tag of the first element whose tag matches, or '' when there is none. */
  // A FOLD, OR THE ONE LINE THE SPEND FOLD BECOMES IN NORMAL MODE WHEN NO RUN IS NAMED (criterion change, wave
  // 13k round 34): either element must carry its section, so a press on it answers the section.
  const tagOf = (html: string, test: RegExp): string => [...html.matchAll(/<(?:details|p)[^>]*>/g)].map((m) => m[0]).find((t) => test.test(t)) ?? ''

  it('gives the spend fold a section of its own on this record', () => {
    const html = railOf()
    const spend = tagOf(html, /data-testid="spent-on-this"/)
    expect(spend, 'the spend fold was not drawn').not.toBe('')
    expect(spend, 'the spend fold declares nothing, so a press on it answers the record').toContain('data-target=')
    expect(spend).toContain('rec-rail')
    expect(spend).toContain(sectionRegionId('spent'))
  })

  it('puts the links section on the fold, once, so its summary line answers the links', () => {
    const html = railOf()
    const links = tagOf(html, new RegExp(sectionRegionId('links').replace(/[.]/g, '\\.')))
    expect(links, 'the links fold does not carry the links section').not.toBe('')
    expect(links).toContain('rec-rail')
    // ONE ELEMENT, NOT TWO: the panel inside the fold no longer carries it as well.
    const said = html.split(sectionRegionId('links')).length - 1
    expect(said, 'the links section is on more than one element').toBe(1)
  })
})
