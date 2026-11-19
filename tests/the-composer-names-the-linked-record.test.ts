// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RIGHT-CLICK ON A LINK ROW NAMES FOUR THINGS, AND TWO OF THEM WERE MISSING.
 *
 * ---------------------------------------------------------------------------------------
 * THE SENTENCE THIS FILE IS WRITTEN AGAINST
 * ---------------------------------------------------------------------------------------
 *
 * A linked record reference must stay identifiable as a linked semantic object and carry enough
 * context to suggest a recipient or agent. Read as four
 * conditions on the composer opened from a link row, it must name:
 *
 *   1. that record,
 *   2. what KIND of record it is,
 *   3. which RELATION the row was drawn under, and
 *   4. which RECORD the row was drawn on.
 *
 * Measured in Chromium on 30 August 2026 on report `m2Q0CybxoGNF`, before the change these tests
 * cover: a right-click on a row under *subject of* said `The round eight report asked the owner to
 * decide something …` and `under “subject of”`. Conditions 2 and 4 were missing, and both facts
 * were already in hand — the target names the record, and `Context.drawnIn` names the page.
 *
 * CRITERION CHANGE, 27 SEPTEMBER 2026: a decision took the "Met under …" line off
 * the right-click panel, because the person was just there. Conditions 3
 * and 4 are still carried: the message stores `drawnIn`, and the browser half of this file now reads
 * them back from a saved message instead of from the panel. Conditions 1 and 2 are still read off
 * the panel's quote bar.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED IN ARITHMETIC AND WHAT IS PROVED IN A BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * The first half of this file is arithmetic over plain values, so it needs no document: it covers
 * the sentence builder, which decides what the chip WOULD say.
 *
 * THAT WAS THE WHOLE FILE, AND IT WAS NOT ENOUGH. Measured on 31 August 2026: delete the
 * `WhereItWasDrawn` chip from the composer entirely — the element that draws this sentence on the
 * screen — and every test here stayed green, 10 of 10, with the rest of the suite silent as well.
 * The builder still built a sentence nobody could read. A test that passes with its feature deleted
 * is not a test, so the second half of this file opens the running product, right-clicks a real
 * link row and reads the chip off the page.
 *
 * BOTH LISTS OF LINK ROWS ARE PRESSED, because they are drawn by two different components and only
 * one of them was ever measured. The rail draws five rows and declares the relation on the list
 * around them; the panel behind the rail's fold draws all of them and, until 31 August 2026,
 * declared nothing, so a press there named the record and dropped both the relation and the page.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Page } from 'playwright'
import type { MessageContext } from '../src/web/components/agent/context.ts'
import { liveApp, type LiveApp } from './helpers.ts'
import * as regions from '../src/shared/regions.ts'
import * as drawnreport from '../src/web/lib/drawnreport.ts'

type Talk = typeof import('../src/web/components/agent/TalkBox.tsx')
type Context = typeof import('../src/web/components/agent/context.ts')
type Router = typeof import('../src/web/components/router.tsx')
type Pointing = typeof import('../src/web/components/agent/pointing.ts')

let talk: Talk
let context: Context
let router: Router
let pointing: Pointing

beforeAll(async () => {
  // src/web/api.ts and src/web/lib/mode.ts both read this browser's storage as they are imported,
  // so the smallest stand-in goes in before anything else. Copied from
  // tests/an-unsent-instruction.test.ts, which says the same thing. Nothing here is under test.
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
  talk = await import('../src/web/components/agent/TalkBox.tsx')
  context = await import('../src/web/components/agent/context.ts')
  router = await import('../src/web/components/router.tsx')
  pointing = await import('../src/web/components/agent/pointing.ts')
})

/** A right-click on a row under *subject of*, on the report that row is printed on. */
const ON_A_LINK_ROW: MessageContext = {
  target: { kind: 'record', recordId: 'b8RbD_9MR9de', workspaceId: 'panelx' },
  drawnIn: { recordId: 'm2Q0CybxoGNF', regionId: 'section.subject of' },
}

describe('the composer names the record a link row points at', () => {
  it('says which kind of record it is, in the word a reader knows and not the stored one', () => {
    expect(context.wordOnTheChip(ON_A_LINK_ROW, 'problem', 'normal')).toBe('Problem')
    // A developer is shown the stored word, the same choice the tag on the row itself makes.
    expect(context.wordOnTheChip(ON_A_LINK_ROW, 'wanna_try', 'normal')).toBe('Worth a try')
    expect(context.wordOnTheChip(ON_A_LINK_ROW, 'wanna_try', 'inspect')).toContain('wanna_try')
  })

  it('draws no word at all while Mole Office has not said what the record is', () => {
    // Not "Record", which was the word before and told a reader nothing the title beside it did
    // not. Not a guess either: nothing, until the read comes back.
    expect(context.wordOnTheChip(ON_A_LINK_ROW, null, 'normal')).toBeNull()
  })

  it('leaves every other kind of target with the noun it already had', () => {
    const block: MessageContext = {
      target: { kind: 'reportBlock', recordId: 'm2Q0CybxoGNF', blockId: 'b-or-7' },
    }
    expect(context.wordOnTheChip(block, null, 'normal')).toBe(context.objectWord(block))
  })
})

/**
 * THE CHIP ABOVE A PART OF A RECORD SAYS WHAT KIND OF PLACE IT IS.
 *
 * Measured in Chromium on 1 September 2026: every one of the thirteen kinds of part drew *Part of a
 * record* — including the stored label the owner's acceptance Act 3 right-clicks, directly above a sentence
 * that already knew the part was a label. That word is the target declaration's noun. It is true of
 * every part, which is exactly why it tells a reader nothing.
 */
describe('the composer says what kind of place a part of a record is', () => {
  const part = (regionId: string): MessageContext => ({
    target: { kind: 'region', recordId: 'm2Q0CybxoGNF', regionId },
  })

  /**
   * The report this page is drawing, as `SummaryBlocks` announces it after it has drawn.
   *
   * IT IS `recordRegionsOf` BECAUSE THAT IS WHAT THE DRAWING ANNOUNCES. This built `regionsOf`
   * until 1 September 2026 — the report body, whose root is `data.blocks` — and so did the
   * component, and between them they described a page with no record above the writing. The tree
   * the write door validates against is the record's, and the two are one fact now; a fixture
   * still building the body would be this file agreeing with a product that had changed underneath
   * it. See `BlocksInRecord.wholeRecord` in src/web/components/SummaryBlocks.tsx.
   */
  const drawing = (): void => {
    const root = regions.recordRegionsOf({
      kind: 'report',
      relations: [],
      title: 'Round eight: what the rig showed',
      summary: 'What the rig showed, in one line.',
      data: {
        blocks: [
          { id: 'b-1', type: 'text', heading: 'What the rig showed', text: 'Three of four mounts broke.' },
          { id: 'b-2', type: 'table', columns: [{ label: 'Run' }], rows: [{ cells: ['3'] }] },
        ],
      },
    })
    // THE RECORD THE TREE IS OF, IN THE PIECES A NAMER NEEDS — the same two the drawing announces.
    drawnreport.noteReportDrawn({
      recordId: 'm2Q0CybxoGNF',
      root,
      blocksField: 'blocks',
      kind: 'report',
      title: 'Round eight: what the rig showed',
      // THE DRAWING SAYS WHICH LENGTH IT IS AT AND WHICH PARTS IT DREW. This one is the whole
      // report with no by-part summary written, so it announces Full and no parts; naming a part
      // is what tests/a-projection-names-which-part.test.ts is for.
      rung: 'full',
      parts: null,
      form: null,
    })
  }

  /**
   * THE NOUN OF READING LENGTH 3 IS `conclusion` AND IT WAS `gist`, so this reads *Conclusion*.
   *
   * The level control has said *Conclusion* over that position since 2 September 2026, and the word
   * `Gist` was on no screen a person reads. When criterion A14b made the position the record's own
   * summary the composer had to name it for a right-click, so `SHORT_FORM_SPECS.gist.noun` became
   * `conclusion` and the composer, the refusals and the control now say one word. The stored key is
   * still `gist`, which is why `shortFormRegionId('gist')` is still what a region of that length is
   * spelled with — and whether the id should follow the word is proposal `ZgbfMTj8zC0h`.
   */
  it('names a stored short form by its length, with no page drawn at all', () => {
    drawnreport.forgetReportDrawn(drawnreport.theReportDrawnHere() ?? ({} as never))
    expect(context.wordOnTheChip(part(regions.shortFormRegionId('gist')), 'report', 'normal')).toBe('Conclusion')
    expect(context.wordOnTheChip(part(regions.shortFormRegionId('label')), 'report', 'normal')).toBe('Label')
  })

  it('names a declared section by its title, which needs the kind of the record it is in', () => {
    expect(context.wordOnTheChip(part('section.openAround'), 'report', 'normal')).toBe(
      'Section “What is still open around this”',
    )
  })

  it('names a paragraph, a table and a headed block off the tree this page drew', () => {
    drawing()
    expect(context.wordOnTheChip(part('data.blocks[#b-1]'), 'report', 'normal')).toBe('Section')
    expect(context.wordOnTheChip(part('data.blocks[#b-1].heading'), 'report', 'normal')).toBe('Heading')
    expect(context.wordOnTheChip(part('data.blocks[#b-2]'), 'report', 'normal')).toBe('Table')
    const paragraph = pageParts().find((id) => id.startsWith('data.blocks[#b-1].text@'))
    expect(paragraph, 'the block drew no paragraph to point at').toBeDefined()
    expect(context.wordOnTheChip(part(paragraph as string), 'report', 'normal')).toBe('Paragraph')
  })

  it('says the general noun where this page is not drawing that record, rather than guessing', () => {
    drawing()
    const elsewhere: MessageContext = {
      target: { kind: 'region', recordId: 'another-record', regionId: 'data.blocks[#b-1]' },
    }
    // TRUE OF EVERY PART, which is the honest answer when nothing on this page can say which part
    // this is. It is what a comment read on the agents page draws.
    expect(context.wordOnTheChip(elsewhere, 'report', 'normal')).toBe('Part of a record')
  })

  /** Every part the drawing announced, so the paragraph's id is read and never spelled here. */
  function pageParts(): string[] {
    const drawn = drawnreport.theReportDrawnHere()
    if (drawn === null) return []
    const out: string[] = []
    const walk = (one: { id: string; children: readonly { id: string; children: readonly unknown[] }[] }): void => {
      out.push(one.id)
      for (const child of one.children) walk(child as never)
    }
    walk(drawn.root)
    return out
  }

  // Criterion change: a decision took the "Met under …" line off the panel, so the panel asks only about the record
  // pointed at. Where the row was met is still stored with the message, which the browser half
  // of this file now reads back after a save.
  it('asks Mole Office about the record pointed at, and not about the page it was met on', () => {
    expect(talk.recordsThisBoxNames(ON_A_LINK_ROW)).toEqual(['b8RbD_9MR9de'])
  })

  it('asks about one record once when the row and the page are the same record', () => {
    expect(
      talk.recordsThisBoxNames({
        target: { kind: 'record', recordId: 'm2Q0CybxoGNF', workspaceId: 'panelx' },
        drawnIn: { recordId: 'm2Q0CybxoGNF', regionId: 'section.subject of' },
      }),
    ).toEqual(['m2Q0CybxoGNF'])
  })
})

describe('an anchor whose words are the name of the thing around it says so', () => {
  /**
   * `RouteLink` used to take four properties and drop everything else. Two callers spread
   * `DRAWS_THE_NAME` onto one — the open-loop row and the link row on a record page — and a JSX
   * spread is not checked for extra properties, so the mark went nowhere and nothing failed.
   *
   * WHAT IT COST, measured on report `m2Q0CybxoGNF`: the walk that reads a name off the page fell
   * through to the whole row's text, so the composer named the record `problem Section 7 of report
   * m2Q0CybxoGNF tells the owner …` — the kind tag drawn beside the sentence, swept in. With the
   * kind now drawn in front of the title, a reader saw the kind twice.
   */
  it('carries the mark through to the anchor', () => {
    const drawn = renderToStaticMarkup(
      h(router.RouteLink, {
        to: '/r/x',
        children: 'The words that are the name',
        ...pointing.DRAWS_THE_NAME,
      }),
    )
    expect(drawn).toContain(`${pointing.NAME_ATTRIBUTE}=""`)
  })

  it('draws no such mark on an ordinary link', () => {
    const drawn = renderToStaticMarkup(
      h(router.RouteLink, { to: '/r/x', children: 'An ordinary link' }),
    )
    expect(drawn).not.toContain(pointing.NAME_ATTRIBUTE)
  })
})

// ---------------------------------------------------------------------------------------
// THE CHIP ON THE SCREEN, ON BOTH LISTS OF LINK ROWS
// ---------------------------------------------------------------------------------------

/**
 * WHAT A READER SEES AFTER A RIGHT-CLICK ON A LINK ROW.
 *
 * Everything above this line is about a string a function returns. This is about whether that
 * string is drawn, and it is here because deleting the element that draws it broke nothing:
 * `WhereItWasDrawn` was removed from the composer, the whole suite was run, and it was green.
 *
 * ONE PAGE, TWO PRESSES. The report below has one link on it, so the same record is drawn twice:
 * once in the rail's own short list, once in the panel the rail's fold opens. The two are different
 * components and a press on each has to name the record, say its kind, and say where it was met.
 *
 * THE TWO NAME DIFFERENT PLACES, AND THAT IS RIGHT. Until 2 September 2026 the fold's groups
 * declared `section.<relation>`, the same region id the rail's list declares, so both chips read
 * *Met under “about”*. One region id on two elements names no place, and the mark for a comment
 * made in one was drawn in the other — the fault the cluster was rejected over. The fold's
 * groups declare nothing now, so a press inside the fold walks up to the panel and says *Met under
 * “Links”*, which is where it was met. See `LinkRows` in src/web/components/LinkPanel.tsx.
 *
 * THE SENTENCE IS COMPARED WHOLE rather than by fragment. A chip that said *Met under “about”* and
 * dropped the record would pass a check for "contains about", and dropping the record is one of the
 * two faults this file exists for.
 */
describe('the chip a reader sees after a right-click on a link row', () => {
  const REPORT_TITLE = 'Round eight: pointing at anything'
  const PROBLEM_TITLE = 'The wrist mount cracks below the load the trials need'
  /** Where the row was met, as the stored message says it: the relation's list, on the report. */
  const MET = 'section.about'
  /** And in the fold, where the place is the links panel rather than one relation's own list. */
  const MET_IN_THE_FOLD = 'section.links'

  let app: LiveApp
  let page: Page
  let reportId: string

  beforeAll(async () => {
    app = await liveApp({ name: 'composer-link-row', viewport: { width: 1440, height: 1000 } })
    page = app.page

    const post = async (path: string, body: unknown): Promise<Record<string, unknown>> => {
      const res = await fetch(`${app.api}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-mole-office-actor-type': 'human',
          'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
      return (await res.json()) as Record<string, unknown>
    }

    const report = (await post('/api/records', {
      kind: 'report',
      title: REPORT_TITLE,
      data: { for: THE_TEST_OFFICES_OWNER.name, date: '2026-08-31', blocks: [{ id: 'b-1', type: 'text', text: 'One paragraph.' }] },
    })) as { record: { id: string } }
    reportId = report.record.id
    const problem = (await post('/api/records', {
      kind: 'problem',
      title: PROBLEM_TITLE,
    })) as { record: { id: string } }
    // The report is ABOUT the problem, so the row is drawn on the report's page under *about*.
    await post('/api/links', { fromId: reportId, toId: problem.record.id, type: 'about' })

    await page.goto(`${app.site}/#/r/${reportId}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.rd-relation-rows .rd-link')
  }, 180000)

  afterAll(async () => {
    await app?.stop()
  })

  /** What the composer says it is about, as a reader reads it. */
  const chips = async (): Promise<{ kind: string | null; what: string | null; drawn: string | null }> =>
    page.evaluate(() => {
      const box = document.querySelector('.px-talk-quote-holder')
      const words = (el: Element | null): string | null => (el === null ? null : (el.textContent ?? '').trim())
      return {
        kind: words(box?.querySelector('.px-talk-chip-kind') ?? null),
        what: words(box?.querySelector('.px-talk-chip-what') ?? null),
        drawn: words(box?.querySelector('.px-talk-drawn') ?? null),
      }
    })

  /**
   * WHERE THE ROW WAS MET, AS THE MESSAGE STORES IT. The panel no longer draws it, so the words are
   * kept and the stored message is read back. They are kept with Start
   * review, which shape B put in place of Save without sending: it writes the same message,
   * sends nothing, and then starts the report's review. The review is not what this file reads.
   */
  const storedAfterASave = async (words: string): Promise<{ recordId: string; regionId?: string } | null> => {
    await page.locator('.px-talk textarea').fill(words)
    await page.locator('.px-talk button', { hasText: 'Start review' }).click()
    await page.waitForSelector('.px-talk[aria-label="Written down"]')
    // THE FRAME SETTLES ON ONE OF THREE ANSWERS about the review, and which one is not under test:
    // in the review, kept and not in it, or kept with the review not started. It is waited for so
    // the review's write has finished before the next case. Measured on 4 October 2026, both cases
    // here said the second: the comment is about the linked problem, and the report's review does
    // not reach that record.
    await page.waitForSelector(
      '.px-talk[aria-label="Written down"] :is([data-part="in-the-review"], .px-talk-note, [role="alert"])',
    )
    const headers = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
    const list = (await (await fetch(`${app.api}/api/messages/comments`, { headers })).json()) as {
      comments: { id: string; title: string }[]
    }
    const mine = list.comments.find((one) => one.title === words)
    if (mine === undefined) throw new Error('the saved words are not among the comments')
    const one = (await (await fetch(`${app.api}/api/records/${mine.id}`, { headers })).json()) as {
      record: { data: { target: { drawnIn?: { recordId: string; regionId?: string } } } }
    }
    await page.locator('.px-talk button', { hasText: 'Back to reading' }).click()
    await page.waitForSelector('.px-talk', { state: 'detached' })
    return one.record.data.target.drawnIn ?? null
  }

  /** Right-click one row and read the composer that opens, then shut it again. */
  const press = async (selector: string): Promise<{ kind: string | null; what: string | null; drawn: string | null }> => {
    await page.locator(selector).first().click({ button: 'right' })
    await page.waitForSelector('.px-talk-quote-holder')
    // WAIT FOR THE READ, NOT FOR A NUMBER OF MILLISECONDS. Two of the three words on these chips —
    // what kind of record it is, and what the page it was met on is called — are what Mole Office
    // answered about those two records, and the box draws nothing in their place while it waits.
    // The kind arrives with that answer, so waiting for it is waiting for the answer.
    await page.waitForSelector('.px-talk-quote-holder .px-talk-chip-kind', { timeout: 15000 })
    return chips()
  }

  it('names the record, its kind, the relation and the page — on the rail’s own list', async () => {
    const said = await press('.rd-relation-rows .rd-link')
    expect(said.what, 'the composer did not name the linked record').toBe(PROBLEM_TITLE)
    expect(said.kind, 'the composer did not say what kind of record it is').toBe('Problem')
    expect(said.drawn, 'the panel still draws "Met under …"').toBeNull()
    const met = await storedAfterASave('Where was this met, on the rail')
    expect(met?.recordId, 'the message does not store the page the row was met on').toBe(reportId)
    expect(met?.regionId).toBe(MET)
  }, 180000)

  it('says the same about a row in the fold, and names the fold as the place', async () => {
    await page
      .locator('details.rd-fold', { has: page.locator('.lp-list') })
      .locator('summary')
      .first()
      .click()
    await page.waitForSelector('.lp-list .lp-link')
    const said = await press('.lp-list .lp-link a')
    expect(said.what, 'the composer did not name the linked record').toBe(PROBLEM_TITLE)
    expect(said.kind, 'the composer did not say what kind of record it is').toBe('Problem')
    // THE PANEL, NOT THE RELATION. See the note above this describe block: the relation is declared
    // once on the page now, on the rail's list, so this row's nearest declared place is the panel.
    expect(said.drawn, 'the panel still draws "Met under …"').toBeNull()
    const met = await storedAfterASave('Where was this met, in the fold')
    expect(met, 'the message stores nothing about where the row was met').not.toBeNull()
    expect(met?.recordId, 'the message does not store the page the row was met on').toBe(reportId)
    expect(met?.regionId, 'the fold was not stored as the links panel').toBe(MET_IN_THE_FOLD)
  }, 180000)
})
