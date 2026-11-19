// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE THINGS A PERSON POINTS AT ARE THINGS THEY CAN TALK TO AN AGENT ABOUT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * The owner's section 18 names four selectable things: a plan line, one or several tasks, text in a
 * report, finding or module, and a scheduled block. Every one of them lives on a surface of its own,
 * and every one of those surfaces has to carry one thing: THE ATTRIBUTE THAT SAYS WHAT THE ELEMENT
 * IS. One listener at the document reads it — see components/agent/pointing.ts — so a surface is
 * addressable because of what it says about itself, not because somebody called a hook on it.
 *
 * ROUND SEVEN'S PRESS ON EACH OBJECT IS GONE and this file no longer counts it. It could not reach:
 * a table has hundreds of cells and a button in each is furniture, so the cells stayed unaddressable
 * while five components carried a button. How anybody finds out the capability exists is now one
 * control in the frame, checked in tests/agent-talk.test.ts.
 *
 * ---------------------------------------------------------------------------------------
 * THE SILENT FAILURE THIS FILE EXISTS FOR, AND IT IS NOT THE BUTTON
 * ---------------------------------------------------------------------------------------
 *
 * A comment on a few words stores the words, where they were, and WHICH FIELD they came out of.
 * `readContext` in src/server/lib/agents.ts then looks them up in that field of that record and
 * says one of three things: still there, the text has changed, or it is gone.
 *
 * So a screen that marks a paragraph with the wrong field name — or marks an element holding one
 * character more than the stored string — makes Mole Office report *the text has changed* about text
 * nobody has touched. Nothing fails. No type is wrong. The comment is stored, the page draws, and
 * the lie only appears later, on the conversation, in a sentence a person would believe.
 *
 * That is this repository's recurring defect: the same fact — what a stored field is called — worked
 * out in two places, free to disagree with nothing failing. So the test below does not check the
 * names against a list. It renders the real surfaces, takes the words a person could select off
 * them exactly as the browser would, writes the record into a real database, and asks the server's
 * own reader whether the quote is still where the screen said it was.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT LOOKS LIKE THIS
 * ---------------------------------------------------------------------------------------
 *
 * The runner's environment is `node`, so there is no DOM. Components are rendered to static markup
 * and the marked elements are read back out of it, which is what tests/agent-talk.test.ts and
 * tests/record-tiers.test.ts both do. What this cannot see is a control hidden by CSS, which is
 * what the browser review photographs for.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import type { MessageContext } from '../src/server/lib/agents.ts'

type RecordPage = typeof import('../src/web/pages/RecordPage.tsx')
type RecordsPage = typeof import('../src/web/pages/RecordsPage.tsx')
type PlanTable = typeof import('../src/web/components/plans/PlanTable.tsx')
type Planning = typeof import('../src/web/components/Planning.tsx')
type Agents = typeof import('../src/server/lib/agents.ts')

let db: TestDb
let recordPage: RecordPage
let recordsPage: RecordsPage
let planTable: PlanTable
let planning: Planning
let agents: Agents

/** The record every quote below is taken out of, written through the real write path. */
let written: PanelRecord

beforeAll(async () => {
  // src/web/api.ts reads window.localStorage at module scope, so the smallest stand-in goes in
  // before anything is imported. Nothing here is under test.
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

  db = await freshDb()
  agents = await import('../src/server/lib/agents.ts')
  recordPage = await import('../src/web/pages/RecordPage.tsx')
  recordsPage = await import('../src/web/pages/RecordsPage.tsx')
  planTable = await import('../src/web/components/plans/PlanTable.tsx')
  planning = await import('../src/web/components/Planning.tsx')

  written = db.api.createRecord({
    workspaceId: 'default',
    kind: 'problem',
    title: 'The gripper slips above fifteen newtons',
    summary: 'It holds under ten and lets go somewhere above fifteen, on every run so far.',
    data: {
      symptom: 'The jaws open a little under load and the part turns in the grip.',
      cause: 'Nobody has worked out whether it is the servo or the pad.',
      options: ['Change the pad and measure again', 'Put a strain gauge on the finger'],
      state: 'open',
    },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
  })
})

afterAll(() => {
  db.close()
})

// ---------------------------------------------------------------------------- reading the markup

/** The markup with the hoisted stylesheets removed, so a class name in the CSS is not evidence. */
function body(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

/** What React escaped on its way out, turned back into the characters a person selects. */
function asWritten(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/**
 * Every element the markup marks as words worth quoting, with the words in it.
 *
 * ONE TEXT NODE PER MARKED ELEMENT IS THE RULE THIS READS BY, and it is the same rule the feature
 * needs: the element has to hold the stored string and nothing else, or the offsets are wrong. An
 * element with a tag inside it would fail to match here, which is the right answer — it would also
 * be a marked element Mole Office could not honestly quote from.
 */
function markedFields(markup: string): { field: string; offset: number; text: string }[] {
  return [...markup.matchAll(/data-text-field="([^"]+)" data-text-offset="(\d+)"[^>]*>([^<]*)</g)].map((m) => ({
    field: asWritten(m[1] ?? ''),
    offset: Number(m[2]),
    text: asWritten(m[3] ?? ''),
  }))
}

/** Every element this markup says is a thing a person can point at, with what it says it is. */
function addressable(markup: string): string[] {
  return [...markup.matchAll(/data-target="([^"]+)"/g)].map((m) => asWritten(m[1] ?? ''))
}

/**
 * The comment a person would make by selecting some of the words in one marked element.
 *
 * IT IS BUILT THE WAY THE BROWSER BUILDS IT. `spanOfSelection` in components/agent/pointing.ts adds
 * the marked element's own offset to the characters before the selection inside it, and stores the
 * field's name off the element. Nothing here is a second reading of that rule: it is the same two
 * numbers off the same two things.
 */
function quoteFrom(mark: { field: string; offset: number; text: string }, from: number, to: number): MessageContext {
  const quote = mark.text.slice(from, to)
  return {
    target: { kind: 'record', recordId: written.id, workspaceId: written.workspaceId },
    span: { quote, from: mark.offset + from, to: mark.offset + from + quote.length, field: mark.field },
  }
}

/** Everything `RecordDetail` needs, as plain data. Nothing here fetches. */
function detailProps(record: PanelRecord) {
  return {
    record,
    editable: false,
    deleted: false,
    records: [record],
    detailLinks: [],
    relations: [],
    evolutionLinks: [],
    log: { changes: [], sessions: [] },
    titles: [record.title],
    titleById: new Map([[record.id, record.title]]),
    unfilledByRecord: new Map<string, number>(),
    body: recordPage.bodySections(record),
    onChanged: () => {},
  }
}

/** Everything `RecordHead` needs. The project list turns a project id into a name. */
function headProps(record: PanelRecord) {
  return {
    record,
    projects: [{ id: record.workspaceId, title: 'Mole Office', records: 1 }],
    // NOTHING IS JOINED TO IT, which is a statement about this fixture and not a gap in it.
    relations: [],
    incomplete: [],
    deleted: false,
    editing: false,
    busy: false,
    onSaved: () => {},
    onDelete: async () => {},
  }
}

// ============================================================ the quote survives the round trip

describe('a quote taken off the screen is found again exactly where the screen said it was', () => {
  it('names, for every marked field on a record page, a stored string the server can look in', () => {
    const markup = body(h(recordPage.RecordHead, headProps(written) as never)) + body(h(recordPage.RecordDetail, detailProps(written) as never))
    const marks = markedFields(markup)
    // The page draws the title, the summary, the symptom and the two options at least. A page that
    // marked nothing would pass every assertion below by drawing no work at all.
    expect(marks.map((one) => one.field)).toEqual(
      expect.arrayContaining(['title', 'summary', 'data.symptom', 'data.options[0]']),
    )

    for (const mark of marks) {
      expect(mark.text, `${mark.field} is marked as quotable and holds no words`).not.toBe('')
      // A few words out of the middle of it, which is what a person selects.
      const from = Math.min(4, Math.max(0, mark.text.length - 3))
      const reading = agents.readContext(quoteFrom(mark, from, from + Math.min(18, mark.text.length - from)))
      expect(
        reading.state,
        `the screen marked "${mark.field}" and the server answered: ${reading.says}`,
      ).toBe('there')
    }
  })

  it('marks the summary words themselves and not the label drawn beside them', () => {
    // THE FAILURE THIS PREVENTS, AND IT IS A HAIR'S WIDTH AWAY. The summary is drawn under a small
    // label reading "summary", inside the same paragraph. A mark on the paragraph would put seven
    // characters this record does not hold in front of every quote, so every offset would be seven
    // too high — and the server would report a summary nobody had touched as changed.
    const markup = body(h(recordPage.RecordHead, headProps(written) as never))
    const summary = markedFields(markup).find((one) => one.field === 'summary')
    expect(summary?.text).toBe(written.summary)
  })
})

// ============================================================ every surface says what it is

describe('the list of everything', () => {
  const drawn = () =>
    body(
      h(
        'table',
        null,
        h(
          'tbody',
          null,
          h(recordsPage.CatalogueRow as never, {
            record: { ...written, incompleteCount: 0 },
            columns: recordsPage.columnsFor('normal'),
            mode: 'normal',
          } as never),
        ),
      ),
    )

  it('makes the row itself the record, so a press anywhere on it talks about that record', () => {
    const markup = drawn()
    expect(markup).toMatch(/<tr [^>]*data-target="/)
    expect(addressable(markup)).toEqual([`record/${written.id}/${written.workspaceId}`])
  })

  it('marks the title so a few words out of it can be quoted, and the server finds them again', () => {
    const marks = markedFields(drawn())
    expect(marks).toEqual([{ field: 'title', offset: 0, text: written.title }])
    const reading = agents.readContext(quoteFrom(marks[0]!, 4, 20))
    expect(reading.state, reading.says).toBe('there')
  })
})

describe('a plan line', () => {
  const lines = [
    {
      line: {
        id: 'line-1',
        planId: 'plan-1',
        position: 1,
        text: '- replace the gripper pad',
        recordId: null,
        remark: null,
        planning: [],
        updatedAt: '2026-08-18 09:00:00',
        updatedBy: `human:${THE_TEST_OFFICES_OWNER.id}`,
      },
      work: null,
      derived: [],
      kept: [],
      // A LINE NOBODY HAS FILED has no record to explain it and nothing to take a shorter form from.
      // This fixture is passed to the table as `never`, so the compiler cannot ask for these, and
      // the served shape carries them since plan budgets landed.
      explanation: null,
      shortForm: null,
    },
  ]

  const drawn = () =>
    body(h(planTable.PlanTable as never, { plan: 'plan-1', lines, onWrote: () => {} } as never))

  it('makes the row itself the line, so a press anywhere on it opens the box for that line', () => {
    const markup = drawn()
    // On the row, not on a cell inside it: the whole line is the thing being talked about.
    expect(markup).toMatch(/<tr [^>]*data-target="/)
    expect(addressable(markup)).toContain('planLine/plan-1/line-1')
  })

  it('says where the words drawn on the row sit in the line as it is stored', () => {
    // THE ARITHMETIC THIS TEST EXISTS FOR. The stored string is the whole line, marker and all;
    // what is drawn is the words alone. An offset of 0 would put a comment on "- replace the gr"
    // whenever somebody quoted "replace the gri", and nothing would fail.
    //
    // READ-ONLY, because a table that may rewrite the line draws the words in a box somebody types
    // in. A selection inside a box is not a selection in the document, so there is nothing to quote
    // there — and right-clicking a box a person is typing in keeps the browser's own menu, which is
    // where paste and spelling live. The row itself stays addressable in both.
    const marks = markedFields(body(h(planTable.PlanTable as never, { plan: 'plan-1', lines } as never)))
    const words = marks.find((one) => one.field === 'text')
    expect(words, 'the plan row marks no words as quotable').not.toBe(undefined)
    expect(words?.offset).toBe('- '.length)
    expect(lines[0]!.line.text.slice(words!.offset, words!.offset + (words?.text.length ?? 0))).toBe(words?.text)
  })
})

describe('a block on the week', () => {
  const block = {
    window: {
      id: 'win-1',
      recordId: 'rec-1',
      startsOn: '2026-08-18',
      endsOn: '2026-08-20',
      note: 'Grip starts slipping above 15N; recalibrate before the next test.',
      state: 'planned' as const,
      createdAt: '2026-08-18 09:00:00',
      updatedAt: '2026-08-18 09:00:00',
    },
    work: null,
    place: { from: 2, to: 4, startsBefore: false, endsAfter: false },
    lane: 0,
  }

  const drawn = (over: Record<string, unknown> = {}) =>
    body(
      h(planning.OpenBlock as never, {
        block,
        editing: false,
        busy: false,
        failed: null,
        onMove: () => {},
        onStretch: () => {},
        onNote: () => {},
        onState: () => {},
        onRemove: () => {},
        onWrote: () => {},
        ...over,
      } as never),
    )

  it('says which block on the week it is, so a press on it talks about that block', () => {
    expect(addressable(drawn())).toEqual(['scheduleBlock/win-1'])
  })

  it('marks the note as the words worth quoting, under the name the window stores it as', () => {
    const marks = markedFields(drawn())
    expect(marks).toEqual([{ field: 'note', offset: 0, text: block.window.note }])
  })

  it('draws no note field to quote while the note is a box somebody is typing in', () => {
    // A selection inside a text area is not a selection in the document, so there would be nothing
    // to quote from anyway — and a mark on a box would name a field whose words are not on screen.
    expect(markedFields(drawn({ editing: true }))).toEqual([])
  })
})

// ============================================================ nothing is half-wired

/**
 * ONE ATTRIBUTE OR NONE, AND NEVER A NAME TYPED OUT BY HAND.
 *
 * `data-target` says what an element is; `data-text-field` and `data-text-offset` say which stored
 * string its text came from and where in that string it starts. The pair is the arithmetic: a field
 * with no offset is half an answer, and a screen that gives half an answer makes Mole Office report that
 * untouched words have changed. Nothing fails when it happens.
 *
 * So every one of them is written by `targetAttributes` or `textAttributes` in src/shared/targets.ts
 * — the pair comes out of one call and cannot be split — and this test refuses a name typed out
 * anywhere else. It is the same device the change log uses for field paths: one writer, and a test
 * that fails when a second one appears.
 */
describe('the attributes that make an element addressable', () => {
  const WEB = fileURLToPath(new URL('../src/web', import.meta.url))

  it('are never typed out by hand, so a field can never arrive without its offset', () => {
    const files = readdirSync(WEB, { recursive: true, encoding: 'utf8' }).filter(
      (f) => f.endsWith('.tsx') || f.endsWith('.ts'),
    )
    expect(files.length, 'no browser files were read, so this test is measuring nothing').toBeGreaterThan(30)

    const typedOut: string[] = []
    for (const name of files) {
      // The mark layer builds a stylesheet out of the attribute names, and it reads them from the
      // one declaration too — so it is checked for the same thing, on the same rule.
      // COMMENTS ARE CUT FIRST. Every one of these names is discussed in prose in the files that
      // use them, and a doc comment quoting one is not an element carrying one. tests/absence-
      // weight.ts cuts comments before its own reading for exactly this reason.
      const source = readFileSync(join(WEB, name), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
      for (const attribute of ['data-target', 'data-text-field', 'data-text-offset']) {
        // The name as a JSX attribute or an object key, which is how one gets onto an element.
        const written = new RegExp(`['"]?${attribute}['"]?\\s*[=:]`, 'g')
        for (const _hit of source.matchAll(written)) typedOut.push(`${name}: ${attribute}`)
      }
    }

    expect(
      typedOut,
      'An addressing attribute is written out by hand. Use targetAttributes or textAttributes from ' +
        'src/shared/targets.ts: they are one call, so a field cannot arrive without its offset and a ' +
        'target cannot arrive with two of its three values.',
    ).toEqual([])
  })
})
