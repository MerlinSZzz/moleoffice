// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MODULE CARD SAYS WHOSE STEPS IT CARRIES, AND EACH NUMBER IS THE LINES A SELECTION OF IT LIGHTS. Wave 13u round
 * 231, PV-R3. The drawing is the lanes drawing on a pipeline's page; the reading of it is in
 * tests/a-made-up-office-drawn-in-lanes.ts.
 *
 * THE FAULT THIS CRITERION NAMES: a module card said "carries 3 steps", counting only the drawn pipeline's own steps
 * (carriesOf in src/web/components/graph/lanes/from-records.ts), while a selection of that card lit its carries lines to
 * the steps of other pipelines drawn on the page as well. The card's number and the lines it lit did not agree, and the
 * words did not say whose steps were counted.
 *
 * THE OFFICE: a made-up project with two pipelines. The drawn one has three steps; the other has three. One module
 * carries two of the drawn pipeline's steps and all three of the other's, so the drawn page draws the other's steps in
 * that pipeline's own area. A second module carries one of the drawn pipeline's steps and nothing else. Every title is
 * made up and says so, and no record id is written anywhere: ids come from the office's replies.
 *
 * WHAT IS PROVED, case by case:
 *   1. at 1440, pressing the first module's card lights its carries lines; the lines lit to the drawn pipeline's steps
 *      are counted, and so are the lines lit to the other pipeline's steps. The card has two counts: one says
 *      lanes.carries with the first number, and its words say "this pipeline"; the other says lanes.carriesElsewhere
 *      with the second number, and its words say "other pipelines". The office stored 2 and 3, and the lines lit are
 *      the lines data-on-selection names for the card;
 *   2. at 1440, the second module's card has one carries count, lanes.carries with the one line its selection lights,
 *      and no count of other pipelines' steps;
 *   3. at 390, the outline draws both module cards with the same count words: 2 and 3 for the first, 1 for the
 *      second, the numbers cases 1 and 2 found lit.
 * Each expected count is written from en-wave-13u.ts by its key and its number, the way the page's `t` writes it.
 *
 * RED UNTIL THE CODE: at the Criterion commit the card counts only the drawn pipeline's steps, in the words "carries 2
 * steps", and en-wave-13u.ts has no lanes.carriesElsewhere, so cases 1 and 3 are red. Case 2 is red because its words
 * do not say "this pipeline".
 */
import { afterAll, beforeAll, expect, it } from 'vitest'

import { pipelinePath } from '../src/web/components/router.tsx'
import { liveApp, type LiveApp } from './helpers.ts'
import {
  DRAWING,
  aPlaceOnTheCard,
  cardOf,
  openThePage,
  prepareThePage,
  readTheDrawing,
  theDrawingHoldsStill,
  theDrawingIsDrawn,
  writerFor,
} from './a-made-up-office-drawn-in-lanes.ts'

const PROJECT = { id: 'test-lanes-whose-steps', title: 'Example office whose module carries steps of two pipelines (made up)' }

const TITLES = {
  drawn: 'Example pipeline drawn here (made up)',
  other: 'Example other pipeline (made up)',
  first: 'Example first step (made up)',
  second: 'Example second step (made up)',
  third: 'Example third step (made up)',
  'other-a': 'Example step A of the other pipeline (made up)',
  'other-b': 'Example step B of the other pipeline (made up)',
  'other-c': 'Example step C of the other pipeline (made up)',
  both: 'Example module that carries steps of both pipelines (made up)',
  one: 'Example module that carries one step (made up)',
} as const

/** What each module carries, by key. */
const CARRIES = {
  both: ['first', 'second', 'other-a', 'other-b', 'other-c'],
  one: ['third'],
} as const

const OWN_STEPS = ['first', 'second', 'third']
const OTHER_STEPS = ['other-a', 'other-b', 'other-c']

let app: LiveApp
const id: Record<string, string> = {}
/** Each carries link's id, and the key of the step it runs to. */
const carriesTo = new Map<string, string>()

beforeAll(async () => {
  app = await liveApp({ name: 'lanes-whose-steps', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  const write = writerFor(app, PROJECT.id)
  await write.call('POST', '/api/workspaces', PROJECT)
  for (const key of ['drawn', 'other'] as const) {
    id[key] = (await write.call('POST', '/api/records', { kind: 'pipeline', title: TITLES[key], data: { blockIds: [] } })).record.id
  }
  for (const key of OWN_STEPS) id[key] = (await write.call('POST', `/api/records/${id['drawn']!}/blocks`, { name: TITLES[key as keyof typeof TITLES], state: 'todo' })).record.id
  for (const key of OTHER_STEPS) id[key] = (await write.call('POST', `/api/records/${id['other']!}/blocks`, { name: TITLES[key as keyof typeof TITLES], state: 'doing' })).record.id
  for (const key of ['both', 'one'] as const) {
    id[key] = (await write.call('POST', '/api/records', { kind: 'module', title: TITLES[key], data: { context: 'Made up for a test of what a module card counts.' } })).record.id
  }
  await write.call('POST', '/api/links', { fromId: id['second']!, toId: id['first']!, type: 'blocks' })
  for (const [module, steps] of Object.entries(CARRIES)) {
    for (const step of steps) carriesTo.set((await write.call('POST', '/api/links', { fromId: id[module]!, toId: id[step]!, type: 'implements' })).id as string, step)
  }
  await prepareThePage(app, PROJECT.id)
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

/** A count's words, written from en-wave-13u.ts the way `t` writes them: the plural form by `n`, and `{n}` filled. */
async function wordsFor(key: string, n: number): Promise<string> {
  const { enWave13u } = await import('../src/shared/words/en-wave-13u.ts')
  const word = Reflect.get(enWave13u, key) as string | Record<string, string> | undefined
  expect(word, `en-wave-13u.ts has the word ${key}`).toBeDefined()
  const form = typeof word === 'string' ? word : word![new Intl.PluralRules('en').select(n)]
  expect(typeof form, `the word ${key} has a form for ${String(n)}`).toBe('string')
  return form!.replace('{n}', String(n))
}

/** The carries counts on one card: each count's data-count and its words. */
async function theCarriesCounts(key: string): Promise<{ kind: string | null; words: string }[]> {
  const counts = await app.page.locator(`${cardOf(id[key]!)} .e-count`).evaluateAll((nodes) =>
    nodes.map((node) => ({ kind: node.getAttribute('data-count'), words: (node.textContent ?? '').replace(/\s+/g, ' ').trim() })),
  )
  return counts.filter((count) => count.kind?.startsWith('carries') === true)
}

/**
 * Presses a module's card and reads the carries lines its selection lights, as the steps they reach: the drawn
 * pipeline's and the other pipeline's. Every lit line is one data-on-selection names for the card.
 */
async function theLinesItLights(key: string): Promise<{ own: string[]; other: string[] }> {
  const place = await aPlaceOnTheCard(app.page, id[key]!)
  await app.page.mouse.click(place.x, place.y)
  await app.page.locator(`${DRAWING}[data-selected="${id[key]!}"]`).waitFor({ timeout: 10_000 }).catch(() => undefined)
  await theDrawingHoldsStill(app.page)
  const drawing = await readTheDrawing(app.page)
  expect(drawing.selected, `the drawing's data-selected names the module ${key}`).toBe(id[key])
  const lit = [...new Set(drawing.paths.filter((path) => path.type === 'implements' && carriesTo.has(path.link)).map((path) => path.link))]
  expect(lit.sort(), `the carries lines lit for ${key} are the ones data-on-selection names for it`).toEqual([...(drawing.onSelection[id[key]!] ?? [])].sort())
  const reached = lit.map((link) => carriesTo.get(link)!)
  await app.page.keyboard.press('Escape')
  return { own: reached.filter((step) => OWN_STEPS.includes(step)), other: reached.filter((step) => OTHER_STEPS.includes(step)) }
}

it('PV-R3 case 1: a module carrying steps of both pipelines says each number, and each is the lines its selection lights', async () => {
  await openThePage(app, pipelinePath(id['drawn']!))
  await theDrawingIsDrawn(app.page)
  const cards = (await readTheDrawing(app.page)).cards.map((card) => card.id)
  for (const step of OTHER_STEPS) expect(cards, `the other pipeline's step ${step} is drawn on the page`).toContain(id[step])
  const lit = await theLinesItLights('both')
  expect(lit.own.length, "lines lit to the drawn pipeline's steps").toBe(2)
  expect(lit.other.length, "lines lit to the other pipeline's steps").toBe(3)
  const counts = await theCarriesCounts('both')
  expect(counts, 'the card has a count of its own steps and a count of other pipelines\' steps').toEqual([
    { kind: 'carries', words: await wordsFor('lanes.carries', lit.own.length) },
    { kind: 'carries-elsewhere', words: await wordsFor('lanes.carriesElsewhere', lit.other.length) },
  ])
  expect(counts[0]!.words, 'the first count says whose steps it counts').toContain('this pipeline')
  expect(counts[1]!.words, 'the second count says whose steps it counts').toContain('other pipelines')
}, 120_000)

it("PV-R3 case 2: a module carrying only the drawn pipeline's steps says one number, the lines its selection lights", async () => {
  await openThePage(app, pipelinePath(id['drawn']!))
  await theDrawingIsDrawn(app.page)
  const lit = await theLinesItLights('one')
  expect(lit, 'the lines lit for the second module').toEqual({ own: ['third'], other: [] })
  const counts = await theCarriesCounts('one')
  expect(counts, 'the card has one carries count, of its own steps').toEqual([{ kind: 'carries', words: await wordsFor('lanes.carries', 1) }])
  expect(counts[0]!.words, 'the count says whose steps it counts').toContain('this pipeline')
}, 120_000)

it('PV-R3 case 3: at 390 the outline says the same counts, the numbers cases 1 and 2 found lit', async () => {
  const expected = {
    both: [
      { kind: 'carries', words: await wordsFor('lanes.carries', 2) },
      { kind: 'carries-elsewhere', words: await wordsFor('lanes.carriesElsewhere', 3) },
    ],
    one: [{ kind: 'carries', words: await wordsFor('lanes.carries', 1) }],
  }
  await app.page.setViewportSize({ width: 390, height: 900 })
  try {
    await openThePage(app, pipelinePath(id['drawn']!))
    await theDrawingIsDrawn(app.page, { outline: true })
    for (const key of ['both', 'one'] as const) {
      const counts = await theCarriesCounts(key)
      expect(counts, `the outline's card for ${key}`).toEqual(expected[key])
      expect(counts[0]!.words, `the outline's first count for ${key} says whose steps it counts`).toContain('this pipeline')
    }
  } finally {
    await app.page.setViewportSize({ width: 1440, height: 1000 })
  }
}, 120_000)
