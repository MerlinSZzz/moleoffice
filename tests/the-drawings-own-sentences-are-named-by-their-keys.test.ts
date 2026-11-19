// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DRAWING'S OWN SENTENCES ARE NAMED BY THEIR KEYS. Wave 13u round 231, a part of criterion 2.
 *
 * By the decision of 16 November 2026, which the secretary filed from the owner's words, the drawing's
 * sentences about the lines it could not draw are said in the developer view only, each named by the word key that
 * writes it (tests/a-pipeline-page-in-the-developer-view.ts). Two of them are written by the drawing itself, in
 * src/web/components/graph/lanes/engine.ts, and handed up to the page as plain sentences: a line with an end that is
 * not on the drawing (lanes.missingEnd), and a line no route could be found for (lanes.noRoute). Neither is easy to
 * make true in a browser, so this file asks the page's own function that names them.
 *
 * `theDrawingsSentencesByKey` in src/web/pages/PipelinePage.tsx takes the sentences as the drawing hands them up and
 * gives each back with its key, in order and with its words unchanged. A sentence it cannot name still comes back,
 * with its words: what it is named then is the page's to say, and this file does not ask.
 *
 * The function is read off the module rather than named, so this file compiles before the page exports it.
 */
import { beforeAll, expect, it } from 'vitest'

import { sayInEnglish } from '../src/shared/i18n.ts'

type Named = (sentences: readonly string[]) => readonly { key: string; words: string }[]
let named: Named | undefined

beforeAll(async () => {
  // src/web/api.ts reads window.localStorage at module scope, and the page reaches it.
  // Nothing in this stand-in is under test.
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
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  const page = await import('../src/web/pages/PipelinePage.tsx')
  named = Reflect.get(page, 'theDrawingsSentencesByKey') as Named | undefined
})

it('names a line with an end not on the drawing, and a line with no route, by their keys, in order and word for word', () => {
  expect(named, 'PipelinePage.tsx exports theDrawingsSentencesByKey').toBeTypeOf('function')
  const missing = sayInEnglish('lanes.missingEnd', { from: 'Example first card (made up)', to: 'Example second card (made up)', missing: 'Example second card (made up)' })
  const noRoute = sayInEnglish('lanes.noRoute', { from: 'Example third card (made up)', to: 'Example first card (made up)' })
  expect(named!([missing, noRoute, missing])).toEqual([
    { key: 'lanes.missingEnd', words: missing },
    { key: 'lanes.noRoute', words: noRoute },
    { key: 'lanes.missingEnd', words: missing },
  ])
})

it('gives back a sentence it cannot name, with its words, and does not name it as either of the two', () => {
  expect(named, 'PipelinePage.tsx exports theDrawingsSentencesByKey').toBeTypeOf('function')
  const other = 'Example sentence the drawing hands up that no word of the two writes (made up).'
  const [one, ...more] = named!([other])
  expect(more, 'one sentence given, one given back').toEqual([])
  expect(one?.words, 'its words, unchanged').toBe(other)
  expect(['lanes.missingEnd', 'lanes.noRoute'], 'not named as either of the two').not.toContain(one?.key)
})
