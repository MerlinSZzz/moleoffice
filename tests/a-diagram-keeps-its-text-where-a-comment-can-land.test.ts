// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DIAGRAM IS ADDED TO THE PAGE AND THE DIAGRAM'S TEXT IS NOT TAKEN OFF IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * The supervisor's report `nzxeAPEFDAFV` carries eight mermaid diagrams as fenced text. Before 8
 * September 2026 the page drew each of them as a block of code, and nothing drew a picture.
 * `src/shared/regions.ts` makes a fence a `code` region of the block's `text` field, and
 * `SummaryBlocks.tsx` hangs that region's `data-target` and the two provenance offsets on the
 * `<code>` element inside the box. That element is what a comment anchors to.
 *
 * So a picture drawn IN PLACE OF the fence would delete eight anchors in the very report the
 * feature is for. The critic's objection 3 (`~/.cache/mole-office/critic-r/CRITICISM.md`, note
 * `SO8Q6pImg3zg`) says the picture has to be an addition: the same `<code>` element, the same
 * offsets, the same region mark, kept on the page under the picture in a closed fold.
 *
 * This file holds both halves of that. It was written against the real report; since 2 October
 * 2026 it reads an invented report that keeps every kind of fence the real one held (see below):
 *
 *   1. THE INFO STRING IS READ. Three fences say `mermaid` and one says `json`, and the page can
 *      now tell them apart. Every fence that is not a diagram draws exactly the box it drew before.
 *   2. NOTHING IS TAKEN AWAY. Every region anchor the page carried before the picture existed is
 *      still on the page, on an element holding exactly the stored characters.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE REPORT COMES FROM
 * ---------------------------------------------------------------------------------------
 *
 * tests/fixtures/an-invented-report-with-diagrams-and-half-fences.ts, made up for this file. Until 2
 * October 2026 it was an export of one real report; the invented one keeps each kind of fence that
 * report held, and says beside each block which one it is. NOTHING HERE OPENS data/panelx.db: that
 * file is a person's work, and a test that opened it would open it writable. The record is written
 * into a throwaway database through the ordinary write path.
 *
 * ITS `shortForms` ARE NOT WRITTEN WITH IT, and that is the product's own rule rather than a
 * convenience: a summary written by part names the revision it was made from, and a record being
 * filed for the first time has no revisions yet. The blocks are what this file is about.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import type { PanelRecord, SummaryBlock } from '../src/shared/types.ts'
import * as report from './fixtures/an-invented-report-with-diagrams-and-half-fences.ts'

type SummaryBlocksModule = typeof import('../src/web/components/SummaryBlocks.tsx')
type Targets = typeof import('../src/server/lib/targets.ts')

let db: TestDb
let sb: SummaryBlocksModule
let targets: Targets
let written: PanelRecord

/** The invented report. Its blocks are what this file is about. */
const blocks = (): SummaryBlock[] => report.blocks

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
  sb = await import('../src/web/components/SummaryBlocks.tsx')
  targets = await import('../src/server/lib/targets.ts')

  written = db.api.createRecord({
    workspaceId: 'default',
    kind: 'report',
    title: report.title,
    summary: report.summary,
    data: { blocks: blocks() },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
  })
})

afterAll(() => {
  db.close()
})

// ---------------------------------------------------------------------------- reading the markup

/** The report drawn, told which record it is, with the hoisted stylesheets taken out. */
function drawn(): string {
  return renderToStaticMarkup(
    h(sb.SummaryBlocks, {
      blocks: blocks(),
      layout: 'page',
      inRecord: {
        recordId: written.id,
        kind: written.kind,
        wholeRecord: {
          kind: written.kind,
          data: written.data,
          title: written.title,
          summary: written.summary,
          relations: [],
        },
      },
    }),
  ).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
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
 * Every `<code>` element that says where its text came from, with the words in it.
 *
 * ONE TEXT NODE PER MARKED ELEMENT IS THE RULE THIS READS BY, and it is the same rule the feature
 * needs: an element carrying an offset has to hold exactly the stored characters that offset names.
 */
function markedCode(markup: string): { field: string; at: number; text: string; target: string }[] {
  return [...markup.matchAll(/<code ([^>]*)>([^<]*)</g)].flatMap((m) => {
    const attributes = m[1] ?? ''
    const field = /data-text-field="([^"]*)"/.exec(attributes)?.[1]
    const at = /data-text-offset="(\d+)"/.exec(attributes)?.[1]
    if (field === undefined || at === undefined) return []
    return [
      {
        field: asWritten(field),
        at: Number(at),
        text: asWritten(m[2] ?? ''),
        target: asWritten(/data-target="([^"]*)"/.exec(attributes)?.[1] ?? ''),
      },
    ]
  })
}

/** Every stored string of the record, as THE SERVER names them. */
function storedStrings(): Map<string, string> {
  const found = targets.resolveTarget({ kind: 'record', recordId: written.id, workspaceId: written.workspaceId })
  if (found.answer !== 'found') throw new Error('the record written above cannot be read back')
  return new Map(found.text.strings.map((s) => [s.field, s.text]))
}

/** Every fence in the stored report, by the word it says it holds. Counted, never typed. */
function fencesInTheSource(): { word: string; closed: boolean }[] {
  const out: { word: string; closed: boolean }[] = []
  for (const block of blocks()) {
    if (block.type !== 'text') continue
    let open: string | null = null
    for (const line of block.text.replace(/\r\n?/g, '\n').split('\n')) {
      if (!line.startsWith('```')) continue
      if (open === null) open = sb.fenceWordOf(line)
      else {
        out.push({ word: open, closed: true })
        open = null
      }
    }
    if (open !== null) out.push({ word: open, closed: false })
  }
  return out
}

// ---------------------------------------------------------------------------- the info string

describe('the word after the backticks', () => {
  /**
   * WHAT THE REPORT HOLDS, counted rather than assumed: five fences open, three of them say
   * `mermaid` and close, one says `json` and never closes, and one says nothing and never closes.
   * The last two are a fence opened in block t4 and a stray closing fence in block t5, and a fence
   * that never closes swallows the rest of its block. The real report this file was first written
   * against held the same kinds (eight diagrams, the same two half fences). This file says so out
   * loud because both halves below are counted against these numbers.
   */
  it('is still the three diagrams and two half fences this file is written against', () => {
    const found = fencesInTheSource()
    expect(found.filter((f) => f.word === 'mermaid').length, 'its three diagrams').toBe(3)
    expect(found.filter((f) => f.word === 'mermaid' && f.closed).length, 'all three of them close').toBe(3)
    expect(found.filter((f) => f.word === 'json').length, 'the one fence that is not a diagram').toBe(1)
    expect(found.filter((f) => !f.closed).length, 'the two fences left open').toBe(2)
    expect(found.length, 'five fences open in the report').toBe(5)
  })

  it('is read off the fence line rather than thrown away', () => {
    expect(sb.fenceWordOf('```mermaid')).toBe('mermaid')
    // The info string may carry more than the word, and only the first word decides.
    expect(sb.fenceWordOf('```mermaid title="the worker\'s round"')).toBe('mermaid')
    expect(sb.fenceWordOf('```Mermaid')).toBe('mermaid')
    expect(sb.fenceWordOf('````mermaid')).toBe('mermaid')
    expect(sb.fenceWordOf('```json')).toBe('json')
    // A fence that says nothing says nothing. It is not guessed at.
    expect(sb.fenceWordOf('```')).toBe('')
    expect(sb.fenceWordOf('```   ')).toBe('')
  })

  it('reaches the page, so the drawn box says which fence it is', () => {
    const out = drawn()
    const said = [...out.matchAll(/<pre class="sb-code" data-fence="([^"]*)"/g)].map((m) => m[1])
    expect(said.filter((word) => word === 'mermaid').length, 'its three diagrams').toBe(3)
    expect(said.filter((word) => word === 'json').length, 'the fence that is not a diagram').toBe(1)
    // A fence that said nothing carries no attribute at all, so "said nothing" is told from
    // "said something the page does not know".
    expect(out).not.toContain('data-fence=""')
  })
})

// ---------------------------------------------------------------------------- nothing taken away

describe('every anchor the fences carried is still on the page', () => {
  it('draws one marked code element per closed fence, and its region target with it', () => {
    const marked = markedCode(drawn())
    const fences = fencesInTheSource().filter((f) => f.closed)
    const withTarget = marked.filter((m) => m.target !== '')
    // Only a CLOSED fence becomes a region: `prose()` in src/shared/regions.ts pushes the leaf on
    // the closing fence, so the one unclosed ```json fence has no region and never had one.
    expect(withTarget.length, 'one region anchor per closed fence in the report').toBe(fences.length)
    for (const one of withTarget) expect(one.target).toMatch(/^region\//)
  })

  it('holds exactly the stored characters at the offset each anchor claims', () => {
    const stored = storedStrings()
    const marked = markedCode(drawn())
    // More marked code elements than closed fences: the two fences left open and the inline code
    // are marked as well, without a region target, and each must hold its stored characters too.
    expect(marked.length, 'the page carries marked code elements at all').toBeGreaterThan(
      fencesInTheSource().filter((f) => f.closed).length,
    )
    for (const one of marked) {
      const held = stored.get(one.field)
      expect(held, `the server has no string called ${one.field}`).toBeDefined()
      expect(
        (held ?? '').slice(one.at, one.at + one.text.length),
        `${one.field}@${String(one.at)} does not hold the characters the page says it does`,
      ).toBe(one.text)
    }
  })
})

// ---------------------------------------------------------------------------- and on the real page

/**
 * THE HALF A RENDER CANNOT ANSWER.
 *
 * `renderToStaticMarkup` runs no effects, so the library is never loaded and no picture is ever
 * drawn — what it draws is exactly the block of code this product drew before, which is the state
 * this component falls back to and is worth having under test. Whether the picture ARRIVES, and
 * whether the text is still on the page once it has, is a question about a running browser.
 */
describe('the report in a browser, once the pictures are drawn', () => {
  let app: LiveApp
  let page: Page
  let inTheBrowser = ''

  interface Seen {
    pictures: number
    folds: number
    foldsOpen: number
    /** Every `<code>` element inside a fold that carries a region target, with its target. */
    anchoredInAFold: string[]
    /** Every `<code>` element anywhere on the page that carries a region target. */
    anchoredAnywhere: string[]
    /** The characters each anchored element holds, so they can be compared with the store. */
    heldInAFold: string[]
    /** How far the document scrolls sideways past the window. Nothing may push the page over. */
    overflow: number
  }

  beforeAll(async () => {
    // THIS FILE IS ABOUT WHAT IS INSIDE A REPORT'S BODY, SO IT SAYS WHICH LEVEL IT READS AT.
    // The owner's act 3a of 15 September 2026 made a record page open at the
    // conclusion, where the body holds the summary and nothing else, so a test that measures a
    // diagram, a picture, a mark, a tab stop or a panel inside the writing found an empty body and
    // waited for a selector that would never appear. `opensAt` writes the reader's own stored
    // choice before the page loads, so this file is about its own subject again and not about the
    // level a page opens at. That level has its own test in
    // tests/a-reader-goes-no-lower-than-conclusion.test.ts, which stores nothing.
    app = await liveApp({ opensAt: 'full', name: 'diagram-keeps-its-text', viewport: { width: 1440, height: 1000 } })
    page = app.page
    const res = await fetch(`http://127.0.0.1:${String(app.apiPort)}/api/records`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'report',
        title: report.title,
        summary: report.summary,
        data: { blocks: blocks() },
      }),
    })
    if (!res.ok) throw new Error(`filing the report answered ${String(res.status)}: ${await res.text()}`)
    inTheBrowser = ((await res.json()) as { record: { id: string } }).record.id
    await page.goto(`http://127.0.0.1:${String(app.webPort)}/#/r/${inTheBrowser}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    // The library is a chunk of its own and the three diagrams are drawn one after another.
    await page.waitForSelector('.sb-diagram svg', { timeout: 60_000 })
    await page.waitForFunction(() => document.querySelectorAll('.sb-diagram svg').length === 3, undefined, {
      timeout: 60_000,
    })
  }, 240_000)

  afterAll(async () => {
    await app?.stop()
  }, 60_000)

  async function readThePage(): Promise<Seen> {
    return (await page.evaluate(() => {
      const targetsOf = (from: ParentNode): string[] =>
        [...from.querySelectorAll('code[data-target]')].map((one) => one.getAttribute('data-target') ?? '')
      const folds = [...document.querySelectorAll('details.sb-diagram-text')]
      return {
        pictures: document.querySelectorAll('.sb-diagram svg').length,
        folds: folds.length,
        foldsOpen: folds.filter((one) => (one as HTMLDetailsElement).open).length,
        anchoredInAFold: folds.flatMap((one) => targetsOf(one)),
        anchoredAnywhere: targetsOf(document),
        heldInAFold: folds.flatMap((one) =>
          [...one.querySelectorAll('code[data-target]')].map((el) => el.textContent ?? ''),
        ),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })) as Seen
  }

  it('draws one picture for each of its three diagrams', async () => {
    const seen = await readThePage()
    expect(seen.pictures, 'three diagrams, three pictures').toBe(3)
  })

  it('keeps the same three region anchors, in a fold under each picture', async () => {
    const seen = await readThePage()
    expect(seen.folds, 'one fold per picture').toBe(3)
    expect(seen.foldsOpen, 'and every one of them starts closed').toBe(0)
    expect(seen.anchoredInAFold.length, 'three anchored code elements, all inside a fold').toBe(3)
    // Nothing anchored was left outside a fold, and nothing anchored was lost: the page's whole
    // set of anchored code elements is the three in the folds.
    expect([...seen.anchoredAnywhere].sort()).toEqual([...seen.anchoredInAFold].sort())
    for (const target of seen.anchoredInAFold) expect(target).toMatch(/^region\//)
  })

  it('holds the diagram characters exactly as they are stored, inside the fold', async () => {
    const seen = await readThePage()
    const res = await fetch(`http://127.0.0.1:${String(app.apiPort)}/api/records/${inTheBrowser}`)
    const stored = ((await res.json()) as { record: { data: { blocks: SummaryBlock[] } } }).record.data.blocks
    const all = stored.map((b) => (b.type === 'text' ? b.text : '')).join('\n \n')
    expect(seen.heldInAFold.length).toBe(3)
    for (const held of seen.heldInAFold) {
      expect(held.length, 'a fold holding nothing is a fold that took the text away').toBeGreaterThan(20)
      expect(all, 'the characters in the fold are not the characters stored').toContain(held)
    }
  })

  it('draws the pictures inside their own boxes and never pushes the page sideways', async () => {
    const seen = await readThePage()
    expect(seen.overflow, 'the page itself scrolls sideways').toBeLessThanOrEqual(0)
  })
})
