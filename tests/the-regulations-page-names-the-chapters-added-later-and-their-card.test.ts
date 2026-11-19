// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REGULATIONS PAGE SAYS WHICH CHAPTERS WERE ADDED AFTER THE COPY, AND WHICH CARD A ROLE CHAPTER IS FOR.
 *
 * A fresh office copies the default set at its first run, and the page said that every chapter it lists was copied
 * from the default set. A role chapter filed afterwards was listed under that sentence, which was then not true of
 * it. Nothing on the page said that the chapter is read by one card only, or by which.
 *
 * WHAT THIS FILE HOLDS THE OFFICE TO:
 *   1. the regulations door names each chapter in use that no copied record holds as added later, and its sentence
 *      names that chapter;
 *   2. the page's note names those chapters as added later, and does not say that every chapter was copied;
 *   3. the page names the card a role chapter is for, in the page language, beside the revision line and in the
 *      chapter list, whether it draws the chapters from the chapter door's answer, as the page itself does, or from
 *      the regulations door's answer alone;
 *   4. at 1440, 990, 660 and 390 pixels, in both palettes, the chapter list's card line is drawn inside the page, and
 *      the page does not scroll sideways.
 *
 * MUTATIONS, run on 12 November 2026 after a control run that was red in all four cases. Each turns red the cases named,
 * and the rest stay green:
 *   - `copiedFromTheDefaultsOf` in src/shared/office-rules.ts answers no chapter as added later: the door case and the
 *     note case;
 *   - the door's sentence in src/server/lib/office-regulations.ts says every chapter was copied: the door case;
 *   - the page's note always draws the sentence that every chapter was copied: the note case;
 *   - the chapter heading draws no card: the card case;
 *   - the chapter list draws no card: the card case and the width case;
 *   - the chapter list's card line takes the class of the Conclusion line, which a wide page hides: the width case;
 *   - the page's reading of the chapter door's answer (`chapterForReading`) drops the card: the card case, drawn from
 *     the chapter door, and the width case. The pictures of round 253 found this one: the page itself draws from the
 *     chapter door, and the first version of this file drew only from the regulations door.
 *   - `forTheRole` in src/web/pages/RegulationsPage.tsx names the worker's card for every role chapter, not only
 *     the chapters marked for it: the card case.
 *
 * Every chapter filed here is MADE-UP. Chapter 17 is a number the shipped file lacks, and its record names a card of
 * the roles file. The migrations, the record door, the copy, the regulations door and the page's markup and
 * stylesheet are real. The database is a temporary one this file makes; nothing reaches the live office.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { drawInABrowser } from './what-the-browser-draws.ts'
import { dayInThePageLanguage, t as word } from '../src/shared/i18n.ts'
import { cardWord } from '../src/shared/card-words.ts'
import { parseLocalStamp } from '../src/shared/time.ts'
import type { WhatTheOfficeRegulationsSay } from '../src/shared/office-rules.ts'
import type { TheSelectedChapters } from '../src/shared/chapter-edit.ts'

type PageModule = typeof import('../src/web/pages/RegulationsPage.tsx')

const N = 17, ROLE = 'worker'
let db: TestDb, app: FastifyInstance, pg: PageModule, person: Record<string, string>

async function theDoor(): Promise<WhatTheOfficeRegulationsSay> {
  const reply = await app.inject({ url: '/api/office-regulations', headers: person })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as WhatTheOfficeRegulationsSay
}

/**
 * THE PAGE AS IT IS DRAWN. The page draws the chapters from the chapter door's answer when it is given, as the page
 * itself always gives it, and from the regulations door's answer when it is not. Both are drawn here.
 */
async function thePage(withTheChapterDoor: boolean): Promise<string> {
  const said = await theDoor()
  if (!withTheChapterDoor) return renderToStaticMarkup(h(pg.TheRegulations, { said }))
  const reply = await app.inject({ url: '/api/office-regulations/chapters', headers: person })
  expect(reply.statusCode, reply.body).toBe(200)
  return renderToStaticMarkup(h(pg.TheRegulations, { said, selected: reply.json() as TheSelectedChapters }))
}

beforeAll(async () => {
  db = await freshDb(); app = (await apiApp()).app; await app.ready()
  const { SHIPPED_CHAPTER_NUMBERS } = await import('../src/shared/chapter-check.ts')
  person = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default', ...thePersonsKeyHeader() }
  expect(SHIPPED_CHAPTER_NUMBERS, 'the made-up role chapter needs a number the shipped file lacks').not.toContain(N)

  // THE COPY A FRESH OFFICE MAKES AT ITS FIRST RUN, then MADE-UP role chapter 17, filed after it through the records.
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBe(SHIPPED_CHAPTER_NUMBERS.length)
  const made = await app.inject({ method: 'POST', url: '/api/records', headers: person, payload: {
    kind: 'module', title: 'MADE-UP role chapter', summary: 'MADE-UP conclusion of the role chapter: read it before the made-up work.',
    data: { state: 'active', parts: [], extra: { chapter: N, forRole: ROLE }, summaryBlocks: [{ id: 'r-1', type: 'text', heading: 'A MADE-UP rule of the role chapter', text: 'MADE-UP work of the role chapter is recorded.' }] },
  } })
  expect(made.statusCode, made.body).toBe(201)
  const id = made.json().record.id as string
  const revisions = (await app.inject({ url: `/api/records/${id}/revisions`, headers: person })).json().revisions as { seq: number; contentHash: string }[]
  const newest = revisions.reduce((a, b) => (b.seq > a.seq ? b : a))
  const labelled = await app.inject({ method: 'POST', url: `/api/records/${id}/short-forms`, headers: person, payload: { madeFrom: { seq: newest.seq, contentHash: newest.contentHash }, forms: { label: 'A MADE-UP role chapter' } } })
  expect(labelled.statusCode, labelled.body).toBe(200)

  // THE PAGE IS DRAWN OUTSIDE A BROWSER, so it is given the window it reads its stored choices from.
  const store = new Map<string, string>()
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage, sessionStorage: storage, location: { hash: '', search: '' }, addEventListener: () => {}, removeEventListener: () => {},
  }
  pg = (await import('../src/web/pages/RegulationsPage.tsx')) as unknown as PageModule
}, 60_000)

afterAll(async () => {
  await app.close()
  db.close()
  delete (globalThis as unknown as { window?: unknown }).window
})

/** The words the page writes for the card a role chapter is for, from the word list and the card's own page word. */
function forTheCard(): string {
  return word('regulationsPage.forRole', { role: cardWord(ROLE) })
}

describe('a role chapter filed after the office copied the default set', () => {
  it('is named by the door as added later, and is in use for its card', async () => {
    const said = await theDoor()
    expect(said.chapters.map(one => [one.n, one.forRole ?? null])).toContainEqual([N, ROLE])
    expect(said.copiedFromTheDefaults?.notCopied).toEqual([N])
    // THE DOOR'S SENTENCE names the chapter as added later, and does not name it as if every chapter was copied. It is
    // built by the door's own exported function, so a sentence that names the number in the wrong words fails here.
    const { copiedFromTheDefaultsSentence } = await import('../src/server/lib/office-regulations.ts')
    const sentence = (notCopied: number[]) => copiedFromTheDefaultsSentence({ copies: said.copiedFromTheDefaults!.copies, notCopied })
    expect(said.says).toContain(sentence([N]))
    expect(said.says).not.toContain(sentence([]))
  })

  it('is named on the page as added later, and the page does not say that every chapter was copied', async () => {
    const at = (await theDoor()).copiedFromTheDefaults!.copies[0]!.at
    const date = dayInThePageLanguage(new Date(parseLocalStamp(at)!), true)
    for (const withTheChapterDoor of [false, true]) {
      const html = await thePage(withTheChapterDoor)
      expect(html, `with the chapter door: ${String(withTheChapterDoor)}`).toContain(word('regulationsPage.copiedFromTheDefaultsAndAddedLater', { n: 1, numbers: String(N), date }))
      expect(html, `with the chapter door: ${String(withTheChapterDoor)}`).not.toContain(word('regulationsPage.copiedFromTheDefaults', { date }))
    }
  })

  it('names the card it is for beside the revision line and in the chapter list, and only the chapters marked for that card name it', async () => {
    const said = await theDoor()
    const marked = said.chapters.filter(one => one.forRole === ROLE).map(one => one.n)
    expect(marked, 'the door names the made-up chapter for the worker card').toContain(N)
    for (const withTheChapterDoor of [false, true]) {
      const html = await thePage(withTheChapterDoor)
      const drawn = `with the chapter door: ${String(withTheChapterDoor)}`
      expect(html.split(forTheCard()).length - 1, `${drawn}: the card is named twice for each chapter marked for it, in the heading and in the list`).toBe(2 * marked.length)
      for (const one of said.chapters) {
        const listed = new RegExp(`<button[^>]*data-chapter="${String(one.n)}"[^]*?</button>`).exec(html)?.[0] ?? ''
        if (one.forRole === ROLE) expect(listed, `${drawn}: the chapter list names the card for chapter ${String(one.n)}`).toContain(forTheCard())
        else expect(listed, `${drawn}: the chapter list does not name the card for chapter ${String(one.n)}`).not.toContain(forTheCard())
      }
      const from = html.indexOf(`id="ofc-ch-${String(N)}"`)
      const heading = from < 0 ? '' : html.slice(from, html.indexOf('</div>', from))
      expect(heading, `${drawn}: the chapter heading names the card`).toContain(forTheCard())
    }
  })
})

describe('the card line of the chapter list fits at four widths in both themes', () => {
  it('is drawn inside the page, and the page never scrolls sideways', async () => {
    // AS THE PAGE ITSELF DRAWS IT, from the chapter door's answer.
    const html = `<style>${pg.REGULATIONS_CSS}</style>${await thePage(true)}`
    for (const width of [1440, 990, 660, 390]) {
      const browser = await drawInABrowser(html, { width, height: 900 })
      try {
        for (const theme of [null, 'dark'] as const) {
          await browser.palette(theme)
          const where = `${String(width)}px, ${theme ?? 'light'}`
          const drawn = await browser.page.evaluate(([n, words]) => {
            const button = document.querySelector(`button[data-chapter="${n}"]`)
            const line = button === null ? undefined : [...button.querySelectorAll('span')].find(one => one.textContent === words)
            const box = line?.getBoundingClientRect()
            return {
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
              line: box === undefined ? null : { left: box.left, right: box.right, height: box.height, shown: getComputedStyle(line!).display !== 'none' && getComputedStyle(line!).visibility !== 'hidden' },
              page: document.documentElement.clientWidth,
            }
          }, [String(N), forTheCard()] as const)
          expect(drawn.overflow, `${where}: the page scrolls sideways`).toBeLessThanOrEqual(0)
          expect(drawn.line, `${where}: the chapter list draws no card line`).not.toBeNull()
          expect(drawn.line!.shown && drawn.line!.height > 0, `${where}: the card line is hidden`).toBe(true)
          expect(drawn.line!.left >= 0 && drawn.line!.right <= drawn.page, `${where}: the card line runs outside the page`).toBe(true)
        }
      } finally {
        await browser.close()
      }
    }
  }, 120_000)
})
