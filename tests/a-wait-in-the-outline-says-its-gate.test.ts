// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WAIT IN THE OUTLINE SAYS HOW MUCH IT BLOCKS. Wave 13u round 230, PV-2, brief item 3: the new drawing keeps
 * everything today's page does, and the narrow outline at 390 is among it. The page's helpers are in
 * tests/a-made-up-office-drawn-in-lanes.ts.
 *
 * THE FAULT THIS CRITERION NAMES: before PV-2, the outline at 390 said how much a wait blocks. The new drawing's
 * outline lists each card's lines in words (linesInWords in src/web/components/graph/lanes/engine.ts), and a waits-on
 * line there says only "Waits on <title>" or "<title> waits on this". The lanes' input carries each link's gate and
 * its reach (gate and upTo, read in src/web/components/graph/lanes/from-records.ts), and the words leave both out.
 *
 * THE WORDS EXPECTED are the words a step card gives a gate, read here from the shared functions and not typed into
 * this file: gateWordsForReader in src/web/components/ui.tsx. A partial gate's words hold its reach. A reach stored
 * in words is said as stored. A reach stored as the id of a step of the same pipeline is said as that step's number
 * and title, as stageInAPipeline in src/web/lib/gate-stage.ts says it with the page's own stepNumber, and the id
 * itself is never said.
 *
 * THE OFFICE IS THIS FILE'S OWN, so that the helper's office, which the other lanes files and their crossing counts
 * read, stays as it is: a made-up project with one pipeline of five steps, in their stored order, and four waits-on
 * links, each from the step waited on to the step that waits:
 *   'hard'   the first step to the second, through a hard gate;
 *   'words'  the second to the third, through a partial gate whose reach is stored in words;
 *   'a step' the third to the fourth, through a partial gate whose reach is stored as the second step's id;
 *   'none'   the fourth to the fifth, with no gate.
 * Every title is made up and says so, and no record id is written anywhere: ids come from the office's replies.
 *
 * WHAT IS PROVED, each case on the pipeline's page opened afresh at 390 by 844 in light, where the drawing is the
 * outline. A waits-on link has a line on each of its two cards: "Waits on <title>" on the step that waits, and
 * "<title> waits on this" on the step it waits on.
 *   1. 'hard': both its lines say the hard gate's words;
 *   2. 'words': both its lines say the partial gate's words, and its reach as stored;
 *   3. 'a step': both its lines say the partial gate's words with the second step's number and title as its reach,
 *      and the second step's id is nowhere in the outline's text;
 *   4. 'none': neither of its lines says the hard gate's words or any of the partial gate's.
 *
 * RED UNTIL THE CODE: at a build whose linesInWords is b3d219e8c's, cases 1, 2 and 3 are red, because no line says a
 * gate; case 4 is green there. Its three mutations, once the Code is in, each after a green run, the file copied
 * first and restored with cp and checked with cmp, all in src/web/components/graph/lanes/engine.ts:
 *
 *   leave the gate's words off a waits-on line → cases 1, 2 and 3 go red;
 *   give every waits-on line the hard gate's words, whatever its gate → cases 2, 3 and 4 go red;
 *   say a partial gate's reach as stored, with no stage from stageInAPipeline → case 3 goes red: the outline says
 *     the second step's id and not its number and title.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'

import type { Gate } from '../src/shared/work.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { stageInAPipeline } from '../src/web/lib/gate-stage.ts'
import { stepNumber } from '../src/web/components/PipelineFlow.tsx'
import { gateWordsForReader } from '../src/web/components/ui.tsx'
import { pipelinePath } from '../src/web/components/router.tsx'
import { liveApp, type LiveApp } from './helpers.ts'
import { DRAWING, openThePage, prepareThePage, theDrawingIsDrawn, writerFor } from './a-made-up-office-drawn-in-lanes.ts'

const PROJECT = { id: 'test-lanes-gate-words', title: 'Example office whose waits have gates (made up)' }

const PIPELINE = 'Example pipeline whose waits have gates (made up)'

/** The pipeline's steps, in their stored order. */
const STEPS = [
  { key: 'first', name: 'Example first step (made up)', state: 'done' },
  { key: 'second', name: 'Example second step (made up)', state: 'doing' },
  { key: 'third', name: 'Example third step (made up)', state: 'todo' },
  { key: 'fourth', name: 'Example fourth step (made up)', state: 'todo' },
  { key: 'fifth', name: 'Example fifth step (made up)', state: 'todo' },
] as const

type Step = (typeof STEPS)[number]['key']

/** The reach of the partial gate stored in words. */
const REACH_IN_WORDS = 'the first example batch (made up)'

/** Each waits-on link, from the step waited on to the step that waits. */
const WAITS = {
  hard: { from: 'first', to: 'second' },
  words: { from: 'second', to: 'third' },
  'a step': { from: 'third', to: 'fourth' },
  none: { from: 'fourth', to: 'fifth' },
} as const satisfies Record<string, { from: Step; to: Step }>

let app: LiveApp
const id: Record<string, string> = {}
const gateOf: Record<string, Gate> = {}

beforeAll(async () => {
  app = await liveApp({ name: 'lanes-gate-words', workspace: 'default', viewport: { width: 390, height: 844 } })
  const write = writerFor(app, PROJECT.id)
  await write.call('POST', '/api/workspaces', PROJECT)
  id['pipeline'] = (await write.call('POST', '/api/records', { kind: 'pipeline', title: PIPELINE, data: { blockIds: [] } })).record.id
  for (const step of STEPS) {
    id[step.key] = (await write.call('POST', `/api/records/${id['pipeline']!}/blocks`, { name: step.name, state: step.state })).record.id
  }
  gateOf['hard'] = { kind: 'hard' }
  gateOf['words'] = { kind: 'partial', upTo: REACH_IN_WORDS }
  gateOf['a step'] = { kind: 'partial', upTo: id['second']! }
  for (const [key, { from, to }] of Object.entries(WAITS)) {
    const gate = gateOf[key]
    await write.call('POST', '/api/links', { fromId: id[from]!, toId: id[to]!, type: 'blocks', ...(gate === undefined ? {} : { gate }) })
  }
  await prepareThePage(app, PROJECT.id)
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

const titleOf = (step: Step): string => STEPS.find((one) => one.key === step)!.name

/** The words a step card gives a gate on this pipeline, its reach said as gateWordsForReader and stageInAPipeline say it. */
function theGateWords(gate: Gate): string {
  const steps = STEPS.map((step) => ({ id: id[step.key]!, name: step.name }))
  return gateWordsForReader(gate, stageInAPipeline(gate.upTo, steps, stepNumber).words)
}

/** The partial gate's words around its reach, each piece that is not the reach. */
function thePartialGatesPieces(): string[] {
  const pieces = gateWordsForReader({ kind: 'partial', upTo: '\u0000' })
    .split('\u0000')
    .map((piece) => piece.trim())
    .filter((piece) => piece !== '')
  expect(pieces.length, "the partial gate's words around its reach, read from gateWordsForReader").toBeGreaterThan(0)
  return pieces
}

/** The pipeline opened afresh at 390, where its drawing is the outline. */
async function theOutline(): Promise<void> {
  await openThePage(app, pipelinePath(id['pipeline']!), 'light')
  await theDrawingIsDrawn(app.page, { outline: true })
  expect(await app.page.locator(`${DRAWING} .e-outline`).count(), 'at 390 the drawing is the outline (.e-outline)').toBe(1)
}

/** The one line in words on a step's card in the outline that holds the words given. */
async function theOneLineHolding(step: Step, words: string, what: string): Promise<string> {
  const lines = await app.page.locator(`${DRAWING} .e-outline .e-card[data-id="${id[step]!}"] .e-said li`).allTextContents()
  const holding = lines.filter((line) => line.includes(words))
  expect(holding, `${what}: one line on the card holds "${words}"; the card's lines are ${JSON.stringify(lines)}`).toHaveLength(1)
  return holding[0]!
}

/** A waits-on link's two lines in the outline, each with what it is: on the step that waits, and on the step waited on. */
async function theTwoLinesOf(key: keyof typeof WAITS): Promise<[string, string][]> {
  const { from, to } = WAITS[key]
  const waits = `the line on the ${to} step, which waits on the ${from} through '${key}'`
  const waitedOn = `the line on the ${from} step, which the ${to} waits on through '${key}'`
  return [
    [await theOneLineHolding(to, sayInEnglish('lanes.waitsOn', { title: titleOf(from) }), waits), waits],
    [await theOneLineHolding(from, sayInEnglish('lanes.waitedOnBy', { title: titleOf(to) }), waitedOn), waitedOn],
  ]
}

it("1. a wait through a hard gate says the hard gate's words on both its cards in the outline at 390", async () => {
  const words = theGateWords(gateOf['hard']!)
  expect(words, "the hard gate's words, read from gateWordsForReader").not.toMatch(/^sheet\./)
  await theOutline()
  for (const [line, what] of await theTwoLinesOf('hard')) expect(line, `${what} says the hard gate's words`).toContain(words)
}, 120_000)

it("2. a wait through a partial gate says the gate's words and its reach stored in words on both its cards in the outline at 390", async () => {
  const words = theGateWords(gateOf['words']!)
  expect(words, "the partial gate's words, read from gateWordsForReader, hold its reach").toContain(REACH_IN_WORDS)
  await theOutline()
  for (const [line, what] of await theTwoLinesOf('words')) {
    expect(line, `${what} says the partial gate's words`).toContain(words)
    expect(line, `${what} says the gate's reach`).toContain(REACH_IN_WORDS)
  }
}, 120_000)

it("3. a wait through a partial gate whose reach is a step of the pipeline says that step's number and title, and never its id, in the outline at 390", async () => {
  const steps = STEPS.map((step) => ({ id: id[step.key]!, name: step.name }))
  const stage = stageInAPipeline(id['second'], steps, stepNumber)
  expect(stage.at, 'stageInAPipeline names the second step, a step of this pipeline').toBe('named')
  const words = theGateWords(gateOf['a step']!)
  expect(words, "the partial gate's words, read from gateWordsForReader, hold the second step's title").toContain(titleOf('second'))
  await theOutline()
  for (const [line, what] of await theTwoLinesOf('a step')) {
    expect(line, `${what} says the partial gate's words`).toContain(words)
    expect(line, `${what} says the reach as the second step's number and title`).toContain(stage.words)
  }
  expect(await app.page.locator(`${DRAWING} .e-outline`).textContent(), "the second step's id is nowhere in the outline's text").not.toContain(id['second'])
}, 120_000)

it('4. a wait with no gate says no gate words on either of its cards in the outline at 390', async () => {
  const pieces = thePartialGatesPieces()
  const hard = theGateWords({ kind: 'hard' })
  await theOutline()
  for (const [line, what] of await theTwoLinesOf('none')) {
    expect(line, `${what} says no hard gate`).not.toContain(hard)
    for (const piece of pieces) expect(line, `${what} says no partial gate`).not.toContain(piece)
  }
}, 120_000)
