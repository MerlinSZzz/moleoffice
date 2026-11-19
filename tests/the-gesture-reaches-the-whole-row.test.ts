// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ROW SAYS WHAT THE THING ON IT IS CALLED, AND WORDS PICKED OUT OF A BOX KEEP THEIR PLACE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, AND WHY IT WAS A FAILURE RATHER THAN A ROUGH EDGE
 * ---------------------------------------------------------------------------------------
 *
 * A reader who had never seen Mole Office drove round eight's gesture in Chromium at 1440 on 18 August
 * 2026. Everything the owner managed to say was stored correctly. What the owner could not do was point.
 *
 *   · A module row 1146px wide answered a right-click in the 5% strip at each end and nowhere in
 *     the middle 90%, because the row's title is a link whose overlay covers the whole row and a
 *     link was exempt.
 *   · A plan row 1105px wide answered in the 8px gutter and in the gap between two controls, and
 *     not on the task's own name, because the name is a box you type in and a box was exempt.
 *   · Selecting words inside that box raised no offer at all.
 *   · The composer's chip read the row back to the reader: `Record — 1 / 3 checked Mole Office —
 *     attention, the change window and the`, which is a count, a title and a summary run together.
 *   · A row with a comment waiting on it was 90.9px tall beside neighbours of 70.0px.
 *
 * design/UX-CONTRACT.md names the first three by hand — *somebody discovers it only by
 * experimenting with blank space* — and the last one is a list telling the reader which row matters
 * for a reason that is not about the work.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS LEFT HERE, AND WHAT MOVED OUT
 * ---------------------------------------------------------------------------------------
 *
 * The runner's environment is `node`, so there is no DOM and no layout. Two questions can still be
 * answered here and they are the two this file now holds.
 *
 *   1. WHAT A ROW SAYS THE THING IS CALLED. A row draws a state word, a count, a summary and a
 *      press as well as the name, so it states which of its parts is the name. The chip above the
 *      composer reads that statement. This file renders each row shape and reads the words the row
 *      publishes.
 *   2. WHERE THE WORDS SOMEBODY PICKED OUT OF A BOX SIT IN THE STORED STRING. That is arithmetic
 *      and nothing else, and getting it wrong is the failure that stays quiet: the comment is
 *      stored, the page draws, and Mole Office later tells somebody that untouched words have changed.
 *
 * THREE CASES ABOUT THE STYLESHEET WERE DELETED, and nothing they held was lost.
 * `tests/seven-surfaces.test.ts` measures all three on a real page in a real browser: it reads the
 * mark's computed `position`, measures the same row with the mark and without it and requires the
 * two heights to be equal, and clicks the row's own link to prove an ordinary press still
 * navigates — which is what `pointer-events: none` on the mark is for. Matching the text of those
 * rules here said nothing about the screen, and it would have stayed green if the rules had stopped
 * applying.
 *
 * WHAT READING AN ATTRIBUTE HERE DOES AND DOES NOT PROVE. It proves the row states a name and
 * states the right one. It does not prove the chip draws it, because that needs the listener, the
 * composer and a real document — and that is measured in `tests/seven-surfaces.test.ts`, which
 * right-clicks a module row at three points across its width and reads the chip back.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { THIS_TEST_ONLY_DRAWS_THE_TABLE } from './helpers.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PlanLineWithWork } from '../src/server/lib/plans.ts'

type Ui = typeof import('../src/web/components/ui.tsx')
type Reading = typeof import('../src/web/components/agent/pointing.ts')
type PlanTable = typeof import('../src/web/components/plans/PlanTable.tsx')

let ui: Ui
let reading: Reading
let planTable: PlanTable

beforeAll(async () => {
  // Every one of these reaches src/web/api.ts, which reads storage as it is imported. The smallest
  // stand-in that lets the imports finish; nothing here is under test.
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
  ui = await import('../src/web/components/ui.tsx')
  reading = await import('../src/web/components/agent/pointing.ts')
  planTable = await import('../src/web/components/plans/PlanTable.tsx')
})

/** Markup with the hoisted style blocks removed, so a class named in the CSS is not evidence. */
function body(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])

/** The words inside the element that starts at `from`, with every tag taken out. */
function textOfElementAt(html: string, from: number): string {
  const open = html.indexOf('>', from)
  if (open === -1) return ''
  const tag = /<([a-z0-9]+)/i.exec(html.slice(from, open))?.[1]?.toLowerCase() ?? ''
  if (VOID.has(tag) || html[open - 1] === '/') return ''
  let depth = 1
  let at = open + 1
  const start = at
  while (at < html.length && depth > 0) {
    const next = html.indexOf('<', at)
    if (next === -1) break
    const closing = html.startsWith(`</${tag}`, next)
    const opening = html.startsWith(`<${tag}`, next) && /[\s>]/.test(html[next + tag.length + 1] ?? '')
    const shut = html.indexOf('>', next)
    if (shut === -1) break
    if (closing) depth -= 1
    else if (opening && html[shut - 1] !== '/') depth += 1
    if (depth === 0) return html.slice(start, next)
    at = shut + 1
  }
  return html.slice(start)
}

/**
 * WHAT THIS ROW SAYS THE THING IS CALLED — the words that reach the chip above the composer.
 *
 * A row states its name in one of two shapes, and both are read here because a component uses
 * whichever it can: the words themselves, where the component has the stored value in its hand, or
 * an empty mark on the element that DRAWS the name, where the title is a node rather than a string.
 * `src/web/components/agent/pointing.ts` explains why there are two.
 *
 * NULL MEANS THE ROW STATED NOTHING, which is a real answer: a row nobody can point at states no
 * name, because a name nothing will ever read is furniture in the markup.
 */
function nameThisRowStates(html: string): string | null {
  const found = /data-name="([^"]*)"/.exec(html)
  if (found === null) return null
  if ((found[1] ?? '') !== '') return decode(found[1] ?? '')
  const element = html.lastIndexOf('<', found.index)
  return decode(textOfElementAt(html, element).replace(/<[^>]+>/g, '')).trim()
}

/** Markup entities turned back into the characters a reader sees. */
const decode = (text: string): string =>
  text
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')

/** How many parts of this markup claim to be the name. More than one and the chip picks one. */
const namesStated = (html: string): number => [...html.matchAll(/data-name=/g)].length

const MODULE = { kind: 'record' as const, recordId: 'm1', workspaceId: 'panelx' }

// ============================================================================ what a row says it is called

describe('a row says which of its parts is the name of the thing', () => {
  it('names the thing, and not everything else drawn on the row', () => {
    // THE CHIP DEFECT THIS FILE'S HEADER QUOTES. A row draws a severity cell, a summary and an age
    // beside the title; a row that claimed to be the name itself would put all of them on the chip.
    const html = body(
      h(ui.Row, {
        target: MODULE,
        title: 'Tray clamp controller',
        href: '#/r/m1',
        sev: h('span', {}, 'no checklist yet'),
        meta: 'Reads the gauge and closes the loop.',
      }),
    )
    expect(nameThisRowStates(html)).toBe('Tray clamp controller')
    expect(namesStated(html), 'more than one part of the row claims to be the name').toBe(1)
  })

  it('names it whether the title is a plain string or something drawn', () => {
    // HALF THE LISTS IN THIS PRODUCT HAND DOWN A COMPOSED TITLE — a kind word in front of it, a
    // count after it. There is nothing to write into an attribute for those, and they are the rows
    // on Home, so the row points at the element whose words are the name instead.
    const html = body(
      h(ui.Row, {
        target: MODULE,
        title: h('span', {}, 'Tray clamp controller'),
        onClick: () => {},
      }),
    )
    expect(nameThisRowStates(html)).toBe('Tray clamp controller')
  })

  it('says nothing about a name on a row nobody can point at', () => {
    // No target, no chip, nothing to name. An attribute on every row in the product would be
    // furniture in the markup that nothing ever reads.
    const html = body(h(ui.Row, { title: 'Tray clamp controller', href: '#/r/m1' }))
    expect(nameThisRowStates(html)).toBe(null)
  })

  it('names a folding row the same way, so both row shapes answer alike', () => {
    const html = body(
      h(ui.ScanRow, {
        target: MODULE,
        title: 'Tray clamp controller',
        opens: 'why it is here',
        children: 'the reason it is here',
      }),
    )
    expect(nameThisRowStates(html)).toBe('Tray clamp controller')
  })
})

// ============================================================================ a line of a plan

/** One line of a plan as the server serves one. Test input, not an observation. */
function line(text: string, id = 'l1'): PlanLineWithWork {
  return {
    line: {
      id,
      planId: 'p1',
      position: 0,
      text,
      recordId: null,
      remark: null,
      planning: [],
      updatedAt: '2026-08-18 09:00:00',
      updatedBy: `human:${THE_TEST_OFFICES_OWNER.id}`,
    },
    work: null,
    derived: [],
    kept: [],
    // A LINE NOBODY HAS FILED has no record to draw an explanation from and nothing to take a
    // shorter form from. The gesture this file is about reads neither, but the served shape carries
    // both since plan budgets landed.
    explanation: null,
    shortForm: null,
  }
}

describe('a row of the plan table says what the line is called', () => {
  it('names it with the line’s own words, without the marker and without the planning groups', () => {
    // THE STORED LINE IS NOT THE ANSWER, twice over. Its marker is not part of what the line is
    // called — the box on the row does not draw one — and neither is the run of groups at its end,
    // which have columns of their own on this table. `wordsOf` is the one reader of that syntax.
    const html = body(
      h(planTable.PlanTable, {
        versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE,
        plan: 'p1',
        lines: [line('- re-zero the strain gauge {size: 2h} {note: ask Sam}')],
        onWrote: () => {},
      }),
    )
    expect(nameThisRowStates(html), 'the row said nothing about what the line is called').toBe(
      're-zero the strain gauge',
    )
  })

  it('points every row at the plan its caller names, and a caller that names none is refused', () => {
    // THE PLAN IS A REQUIRED PROP (problem rXyS9aQqnMpZ). A table drawn without it used to read the
    // plan off the lines, and a row whose line named no plan was drawn with no target, so nothing
    // could be said about it. Now every row names the caller's plan.
    const html = body(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: 'p1', lines: [line('- re-zero the strain gauge')] }))
    expect(html).toContain('data-target="planLine/p1/l1"')
    expect(nameThisRowStates(html)).toBe('re-zero the strain gauge')
    // A CALLER THAT LEAVES IT OUT is stopped twice. The type checker refuses the call, which is what
    // the line below says, and a call that gets past it anyway throws rather than guessing the plan
    // from the lines.
    // @ts-expect-error the plan is required
    const unnamed = h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, lines: [line('- re-zero the strain gauge')] })
    expect(() => body(unnamed)).toThrow(/p1/)
  })

  it('points each fact beside the line at that fact, and names it by its column and the line', () => {
    // A RIGHT-CLICK ON A FACT USED TO ANSWER THE WHOLE LINE (problem ON-vXSmgokHf). The pointer
    // walks up to the nearest element that says what it is, so a cell that says it is a fact is
    // reached before the row.
    const html = body(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: 'p1', lines: [line('- re-zero the strain gauge {size: 2h}')] }))
    for (const fact of ['size', 'time', 'project']) {
      expect(html, `no cell says it is the ${fact}`).toContain(`data-target="planLineFact/p1/l1/${fact}"`)
    }
    expect(html.match(/data-target="planLineFact\//g)?.length, 'one cell for each fact, and no more').toBe(3)
    // THE CHIP NAMES THE FACT AND THE LINE, in the words the column's heading and the row draw.
    expect(decode(html)).toContain('data-name="Project of “re-zero the strain gauge”"')
  })
})

// ============================================================================ words selected in a box

describe('words selected inside a box a person types in', () => {
  const typed = { box: null as unknown as HTMLTextAreaElement, from: 4, to: 12, quote: 'the pad' }

  it('refuses a span when the box does not say where its words are stored', () => {
    // THE USUAL ANSWER TODAY, and it is the honest one. `selectionStart` counts characters of what
    // is DRAWN. Storing those numbers as positions in what is STORED would be a guess dressed as
    // exact arithmetic, and the server would later report untouched words as changed.
    expect(reading.spanFromTyped(null, typed)).toBe(null)
  })

  it('counts from where the box says its first character sits', () => {
    // The box draws part of a longer stored string — a plan line's words start after its marker —
    // so the offsets of the selection are added to the offset the box declares.
    const span = reading.spanFromTyped({ field: 'text', offset: 2 }, { ...typed, from: 0, to: 7, quote: 'the pad' })
    expect(span).toEqual({ quote: 'the pad', from: 2, to: 9, field: 'text' })
  })

  it('trims the quote and the numbers together, so the words stored are the words counted', () => {
    // Double-clicking a word takes the space after it. A quote with a space on the end is not the
    // quote a person can see, and numbers that still counted it would name a character too many.
    const span = reading.spanFromTyped({ field: 'text', offset: 0 }, { ...typed, from: 3, to: 12, quote: ' the pad ' })
    expect(span).toEqual({ quote: 'the pad', from: 4, to: 11, field: 'text' })
  })

  it('refuses a selection that is only whitespace, rather than storing an empty quote', () => {
    expect(reading.spanFromTyped({ field: 'text', offset: 0 }, { ...typed, from: 3, to: 6, quote: '   ' })).toBe(null)
  })
})
