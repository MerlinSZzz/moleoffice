// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION N2, THE INTERFACE HALF: the notebook page, at four widths and in both themes.
 *
 * A person can review and change this notebook too. So the page lists what is written, newest
 * first, says who wrote each entry and when, carries a form to add one, and carries a change and a
 * remove on every row.
 *
 * WHAT IS MEASURED HERE AND WHAT IS NOT. This draws the component's own markup and its own
 * stylesheet in real Chromium and reads back what the browser computed. It answers questions about
 * DRAWING — is the row there, does it fit, does it read in both palettes. It cannot answer a
 * question about behaviour; `tests/the-person-writes-first-in-the-notebook.test.ts` drives the
 * doors for that.
 *
 * THE MUTATION THAT PROVES THE WIDTHS: take `min-width: 0` off `.nb-entry` and the entry stops
 * shrinking inside the list, so the page scrolls sideways at 390. Named in the report.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { drawInABrowser } from './what-the-browser-draws.ts'
import type { TheNotebookRead } from '../src/shared/notebook.ts'

/** The four widths chapter 6 rule 1 names. The middle two are the band 1440 and 390 leave unseen. */
const WIDTHS = [1440, 990, 660, 390] as const

type NotebookModule = {
  TheNotebook: (props: { said: TheNotebookRead; handle: string; onChanged: () => void }) => unknown
  NOTEBOOK_WORDS: Record<string, string>
  NOTEBOOK_CSS: string
}
let nb: NotebookModule

/** Three entries by two writers, one of them changed by the person. Criterion N2's own picture. */
const THREE: TheNotebookRead = {
  agent: THE_TEST_OFFICES_SECRETARY.handle,
  isThere: true,
  recordId: 'nb-1',
  title: `${THE_TEST_OFFICES_SECRETARY.handle}: the notebook`,
  entries: [
    {
      id: 'e3',
      writtenByKind: 'agent',
      writtenById: THE_TEST_OFFICES_SECRETARY.handle,
      at: '2026-09-11 16:20:00',
      entryKind: 'its-character',
      text: 'I would rather say I could not do a thing than describe what would probably have happened.',
    },
    {
      id: 'e2',
      writtenByKind: 'person',
      writtenById: THE_TEST_OFFICES_OWNER.id,
      at: '2026-09-11 15:55:00',
      entryKind: 'the-secretary-may',
      text: 'You may settle a fork I have already answered once. A new fork comes to me.',
      changedByThePerson: { at: '2026-09-11 16:40:00' },
    },
    {
      id: 'e1',
      writtenByKind: 'person',
      writtenById: THE_TEST_OFFICES_OWNER.id,
      at: '2026-09-11 15:40:00',
      entryKind: 'how-they-want-answers',
      // A LONG UNBROKEN RUN OF CHARACTERS, because a real entry carries one: a path, a record id, a
      // branch name. It is what makes the width cases a test rather than a guard — without a token
      // that cannot break, a page fits at 390 whatever its stylesheet says.
      text:
        'Conclusion first, then the reasons. Chinese in the terminal when the answer is long. The plan is at ' +
        `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx/design/flows/ACCEPTANCE.md#the-secretarys-notebook-N1-to-N4-and-after.`,
    },
  ],
  statistics: {
    entries: 3,
    byThePerson: 2,
    byTheSecretary: 1,
    lastWritten: { at: '2026-09-11 16:20:00', byKind: 'agent', byId: THE_TEST_OFFICES_SECRETARY.handle },
    changedByThePerson: 1,
  },
  write: `/api/agents/${THE_TEST_OFFICES_SECRETARY.handle}/notebook/entries`,
  kinds: [
    'the-persons-preferences',
    'how-they-want-answers',
    'the-secretary-may',
    'the-persons-to-do',
    'a-summary',
    'a-feeling-at-work',
    'its-character',
    'how-it-replies',
  ],
}

function drawn(said: TheNotebookRead): string {
  return renderToStaticMarkup(
    h(nb.TheNotebook as never, { said, handle: said.agent, onChanged: () => {} } as never),
  )
}

/**
 * THE SAME MARKUP WITH THE PAGE'S OWN STYLESHEET, which is what the browser has to be given.
 *
 * `renderToStaticMarkup` returns the component's markup and NOT the styles React hoists into the
 * document head, and the page's `<style>` is on the shell rather than on this component. Measured
 * 11 September 2026: without this, the browser drew an unstyled page, the width cases passed with
 * the whole narrow band deleted, and they were proving nothing.
 */
function forTheBrowser(said: TheNotebookRead): string {
  return `<style>${nb.NOTEBOOK_CSS}</style>${drawn(said)}`
}

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
  nb = (await import('../src/web/pages/NotebookPage.tsx')) as unknown as NotebookModule
})

afterAll(() => {
  delete (globalThis as unknown as { window?: unknown }).window
})

// ============================================================ 1. what it says

describe('the notebook page says who wrote each entry and when', () => {
  it('draws three entries by two writers, newest first', () => {
    const html = drawn(THREE)
    // NEWEST FIRST: the agent's 16:20 entry is drawn before the person's 15:40 one.
    expect(html.indexOf('2026-09-11 16:20:00')).toBeLessThan(html.indexOf('2026-09-11 15:40:00'))
    // Plan 7FEOshq3mBGG: unresolved stored authors show their kind until a name is read.
    expect(html).toContain('Person')
    expect(html).toContain('Agent')
    // AND WHAT KIND EACH IS, by its label rather than its stored word.
    expect(html).toContain('Its character')
    expect(html).toContain('How to answer the person')
    // AND NEVER THE STORED WORD WHERE A READER MEETS IT. The picker's option values are stored
    // words because that is what a form sends; what is drawn on an entry is the label.
    const onEntries = [...html.matchAll(/class="nb-kind">([^<]*)</g)].map((one) => one[1])
    expect(onEntries).toEqual(['Its character', 'What the secretary may do alone', 'How to answer the person'])
  })

  it('says on the entry the person changed that the person changed it, with when', () => {
    const html = drawn(THREE)
    expect(html).toContain('changed by the person 2026-09-11 16:40:00')
  })

  it('carries a form to add one, and a change and a remove on every entry', () => {
    const html = drawn(THREE)
    expect(html).toContain(String(nb.NOTEBOOK_WORDS.addPress))
    // Three entries, three of each press.
    expect(html.split(String(nb.NOTEBOOK_WORDS.changePress)).length - 1).toBeGreaterThanOrEqual(3)
    expect(html.split(String(nb.NOTEBOOK_WORDS.removePress)).length - 1).toBeGreaterThanOrEqual(3)
  })

  it('says nobody has written one rather than drawing an empty notebook', () => {
    const html = drawn({
      ...THREE,
      isThere: false,
      entries: [],
      statistics: null,
      note: `No notebook has been written for ${THE_TEST_OFFICES_SECRETARY.handle} yet.`,
    })
    expect(html).toContain(String(nb.NOTEBOOK_WORDS.noNotebook))
    expect(html).not.toContain('2026-09-11')
  })
})

// ============================================================ 2. four widths, both themes

describe('the notebook page fits at four widths in both themes', () => {
  it('never scrolls sideways, and its words are drawn in both palettes', async () => {
    const html = forTheBrowser(THREE)
    for (const width of WIDTHS) {
      const browser = await drawInABrowser(html, { width, height: 900 })
      try {
        for (const theme of [null, 'dark'] as const) {
          await browser.palette(theme)
          const overflow = await browser.page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          )
          expect(overflow, `${String(width)}px, ${theme ?? 'light'}: the page scrolls sideways`).toBeLessThanOrEqual(0)
          // AND THE WORDS ARE ON A GROUND THEY CAN BE READ ON. A palette that left a colour
          // undeclared computes to the empty string, and this is where that shows.
          const ink = await browser.styleOf('.nb-kind', 'color')
          expect(ink, `${String(width)}px, ${theme ?? 'light'}: the entry's kind has no colour`).not.toBe('')
          const ground = await browser.styleOf('.nb-entry', 'background-color')
          expect(ground, `${String(width)}px, ${theme ?? 'light'}: the entry has no ground`).not.toBe('')
          expect(ink, 'the words are not the same colour as the ground').not.toBe(ground)
        }
      } finally {
        await browser.close()
      }
    }
  })

  /**
   * EVERY TOKEN THE SHEET NAMES IS ONE tokens.css DECLARES.
   *
   * A `var(--name)` nobody declared computes to nothing, and for `color` and `background-color`
   * that means the element inherits or falls back — so the page draws, nothing throws, and the
   * border and the ground it was supposed to have are simply absent. Measured 11 September 2026:
   * this page shipped with five invented names (--ink-0, --ink-1, --ink-2, --line, --surface-1),
   * every case above was green, and the defect was only visible in a screenshot.
   */
  it('names only custom properties tokens.css declares', async () => {
    const browser = await drawInABrowser(forTheBrowser(THREE), { width: 1440, height: 900 })
    try {
      const named = [...new Set([...nb.NOTEBOOK_CSS.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((one) => one[1]))]
      expect(named.length, 'the sheet names no tokens at all').toBeGreaterThan(4)
      const undeclared = await browser.page.evaluate((names) => {
        const style = getComputedStyle(document.documentElement)
        return (names as string[]).filter((name) => style.getPropertyValue(name).trim() === '')
      }, named as string[])
      expect(undeclared, 'the notebook sheet names custom properties tokens.css does not declare').toEqual([])
    } finally {
      await browser.close()
    }
  })

  it('draws every kind of entry whole at 390, each a choice that wraps and a press 44 px tall', async () => {
    // A CLOSED SELECT CUT "What the secretary may do alone" at 390 (wave 13j's report CRfHytzOtE89, b-6):
    // 273 px wanted, 250 px room. The kinds are now choices that wrap. MUTATION, proved on 3 October 2026:
    // the choices' class taken off, so the page draws no choice the way the old select drew none: red.
    const html = forTheBrowser(THREE)
    expect(html, 'the add form draws the kinds as choices').toContain('nb-kind-choice')
    const browser = await drawInABrowser(html, { width: 390, height: 900 })
    try {
      const seen = await browser.page.evaluate(() => {
        for (const fold of document.querySelectorAll('details')) fold.setAttribute('open', '')
        return [...document.querySelectorAll('.nb-kind-choice')].map((one) => {
          const box = one.getBoundingClientRect()
          const words = one.querySelector('span')!
          return { right: box.right, height: box.height, cut: words.scrollWidth > words.clientWidth + 1, text: words.textContent }
        })
      })
      expect(seen.length, 'every kind is a choice').toBeGreaterThan(1)
      expect(seen.some((one) => one.text === 'What the secretary may do alone'), JSON.stringify(seen)).toBe(true)
      for (const one of seen) {
        expect(one.right, `${String(one.text)} is drawn past the edge`).toBeLessThanOrEqual(390)
        expect(one.cut, `${String(one.text)} is cut`).toBe(false)
        expect(one.height, `${String(one.text)} is a press under 44 px`).toBeGreaterThanOrEqual(44)
      }
    } finally {
      await browser.close()
    }
  })

  it('keeps every entry inside the page at the narrowest width', async () => {
    const browser = await drawInABrowser(forTheBrowser(THREE), { width: 390, height: 900 })
    try {
      const widest = await browser.page.evaluate(() =>
        Math.max(...[...document.querySelectorAll('.nb-entry')].map((one) => one.getBoundingClientRect().right)),
      )
      expect(widest, 'an entry is drawn off the right edge at 390').toBeLessThanOrEqual(390)
    } finally {
      await browser.close()
    }
  })
})
