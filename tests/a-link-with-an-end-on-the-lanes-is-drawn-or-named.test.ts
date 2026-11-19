// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LINK WITH AN END ON THE LANES DRAWING IS DRAWN, OR A SENTENCE OF ITS OWN NAMES IT. Wave 13u round 231, PV-R5. The
 * function is `lanesInputFor` in src/web/components/graph/lanes/from-records.ts; its sentences are the ones the pipeline
 * page says in its developer view, each with its word key.
 *
 * THE FAULT THIS CRITERION NAMES: a link was left out of the drawing with nothing said when neither of its ends was one
 * of the drawn pipeline's own records. When a record of the drawn pipeline links to a step of another pipeline, that
 * step is drawn in an area of its own pipeline, and that pipeline heads the area. The step's other links were dropped
 * in silence: its links to the other steps of its pipeline, to a module that carries it and is not drawn, and to
 * anything else not on the page. So were the links of the pipeline heading the area. The links loop in from-records.ts
 * returned early for each of them.
 *
 * THE OFFICE, made up, read with no server and no browser. The drawn pipeline has two steps, and one module carries
 * the first. The second step feeds a step of a second pipeline, so that step is drawn in the second pipeline's area.
 * That step links to two other steps of its pipeline, one link each way. It also links to a module that carries only
 * it, to a note, to a step of a third pipeline, to a record that was deleted and to a record the page did not load. The
 * second pipeline produces a note. The drawn pipeline relates to that note, and its first step relates to a task. Two
 * steps of the second pipeline that are not drawn link to each other. 13 of the 14 stored links have an end drawn on the
 * page, and one has none. Every title is made up and says so.
 *
 * THE REEL PAGE, for case 4: tests/fixtures/a-made-up-reel-page-with-other-pipelines-steps.json, read through
 * tests/a-made-up-reel-page-and-a-master-of-54-boxes.ts and not changed. It is a pipeline at its Steps level with 12
 * steps and 8 modules in 6 areas, and 20 steps of 5 other pipelines, each in an area its pipeline heads, so 45 records
 * are drawn. It holds 66 links. The file was read from the page's drawing input, and that holds only the links the page
 * draws. So all 66 have both ends on the page and are drawn at any tree, and the 66 alone cannot catch the fault. This
 * file adds 14 made-up links to it, with the made-up records they need, none of which the page draws:
 *   - 11 blocks links between a drawn step of another pipeline and a step of the same pipeline that is not drawn, 6
 *     from the drawn step and 5 to it, over the 5 pipelines. Round 230 found 11 such links left out on the reel's page;
 *   - 2 inferred implements links from a module that is not drawn to a drawn step of another pipeline. Round 230 found
 *     2 such links;
 *   - 1 produces link from a pipeline heading an area to a note. It is not one of round 230's 13: it is here for the
 *     third kind of sentence.
 * 66 + 14 = 80 links have an end on the page.
 *
 * WHAT IS PROVED, case by case:
 *   1. every stored link with an end drawn on the page is either among the drawn links or named by a sentence of its
 *      own. An end drawn on the page is a card, a record heading an area, or the drawn pipeline itself. The sentence
 *      holds the link's word and the title of each end the page loaded. The drawn links and the named ones add up to
 *      the 13 stored links with such an end. The check reads only the input and the sentences, so it holds for any
 *      office given to it;
 *   2. the sentences for the 8 links of the area's step and of the pipeline heading the area, word for word, from
 *      en-wave-13u.ts: the two links to steps of the same pipeline, the links to the module, the note and the third
 *      pipeline's step, the link of the pipeline heading the area, and the broken link and the link to a record the page
 *      did not load, which keep the sentences they have for the drawn pipeline's own records;
 *   3. the link with neither end on the page is neither drawn nor named. The second pipeline's own page draws it;
 *   4. on the reel page, the check of case 1: the page draws the file's 45 records and none of the records this file
 *      adds, and of the 80 links with an end on the page, the file's 66 are drawn and the 14 added are named.
 *
 * IN THE DEVELOPER VIEW, SINCE 16 NOVEMBER 2026, BY THE DECISION, WHICH THE SECRETARY FILED FROM THE
 * OWNER'S WORDS. A pipeline's page says in its
 * body only what a reader needs to trust the page, and a sentence about a link the drawing could not draw is not that.
 * So these sentences are shown in the developer view only: `lanesInputFor` gives them in `toDevelopers`, each line a
 * word key and its sentence, and `said`, which every reader sees, holds none of them. A link is named now when a line
 * of `toDevelopers` names it. Case 2 asks for each sentence there under its key, and asks that `said` does not hold
 * it; case 3 asks that neither list names the link with no end here. What is drawn or named, and the counts, are
 * unchanged.
 *
 * RED UNTIL THE CODE: at the Criterion commit the 8 links of case 2 are dropped with nothing said, so 5 of the 13 are
 * drawn or named, and cases 1 and 2 are red; en-wave-13u.ts has none of the three new words either. Case 3 is green at
 * the Criterion commit: it holds the line the change must not cross, a sentence for a link that has no end here.
 *
 * Case 4 was added after the code, so it is green at its own Criterion commit. Its control is a tree whose links loop
 * in from-records.ts chooses a near end only among the drawing's own records and the pipeline itself, as before round
 * 231. There none of the 14 added links is named, 66 of the 80 are drawn or named, and case 4 is red.
 */
import { beforeAll, expect, it } from 'vitest'

import { t } from '../src/shared/i18n.ts'
import { kindWord, linkWord } from '../src/shared/words.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import type { StoredIntent } from '../src/web/components/graph/Edit.tsx'
import type { GraphLink } from '../src/web/components/graph/model.ts'
import type { GateReading } from '../src/web/components/LinkPanel.tsx'
import type { LanesInput } from '../src/web/components/graph/lanes/tree.ts'
import { REEL_PAGE } from './a-made-up-reel-page-and-a-master-of-54-boxes.ts'

const STORE = new Map<string, string>()
const storage = {
  getItem: (k: string) => STORE.get(k) ?? null,
  setItem: (k: string, v: string) => void STORE.set(k, v),
  removeItem: (k: string) => void STORE.delete(k),
}

// The page's modules read a window when they load. A plain one is enough here: nothing is drawn.
beforeAll(() => {
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
})

const AT = '2026-08-01 09:00:00'

const TITLES = {
  yard: 'Example pipeline drawn here (made up)',
  mill: 'Example second pipeline (made up)',
  kiln: 'Example third pipeline (made up)',
  dig: 'Example first step of the drawn pipeline (made up)',
  plant: 'Example second step of the drawn pipeline (made up)',
  grind: 'Example step of the second pipeline drawn in its area (made up)',
  sift: 'Example step of the second pipeline after it (made up)',
  bag: 'Example step of the second pipeline before it (made up)',
  oven: 'Example step of the third pipeline (made up)',
  cart: 'Example module that carries the first step (made up)',
  wheel: 'Example module that carries the second pipeline step (made up)',
  memo: 'Example note the second pipeline step names (made up)',
  ledger: 'Example note the second pipeline produces (made up)',
  chore: 'Example task the first step relates to (made up)',
} as const

function aRecord(id: string, kind: string, title: string, data: Record<string, unknown> = {}): PanelRecord {
  return { id, kind, title, summary: null, data, createdAt: AT, updatedAt: AT, deletedAt: null } as unknown as PanelRecord
}

function record(id: keyof typeof TITLES, kind: string, data: Record<string, unknown> = {}): PanelRecord {
  return aRecord(id, kind, TITLES[id], data)
}

const NO_GATE: GateReading = { at: 'not-a-dependency' }

function link(id: string, type: string, fromId: string, toId: string, more: { inferred?: boolean; broken?: boolean } = {}): GraphLink {
  return { linkId: id, fromId, toId, type, inferred: more.inferred ?? false, broken: more.broken ?? false, gate: NO_GATE } as GraphLink
}

const RECORDS: PanelRecord[] = [
  record('yard', 'pipeline', { blockIds: ['dig', 'plant'] }),
  record('mill', 'pipeline', { blockIds: ['bag', 'grind', 'sift'] }),
  record('kiln', 'pipeline', { blockIds: ['oven'] }),
  record('dig', 'block', { state: 'todo' }),
  record('plant', 'block', { state: 'todo' }),
  record('grind', 'block', { state: 'doing' }),
  record('sift', 'block', { state: 'todo' }),
  record('bag', 'block', { state: 'done' }),
  record('oven', 'block', { state: 'todo' }),
  record('cart', 'module', { state: 'doing' }),
  record('wheel', 'module', { state: 'doing' }),
  record('memo', 'note'),
  record('ledger', 'note'),
  record('chore', 'task', { state: 'todo' }),
]

// `gone` was deleted, so its link is broken; `ghost` is a record the page did not load.
const LINKS: GraphLink[] = [
  link('dig-plant', 'blocks', 'dig', 'plant'),
  link('cart-dig', 'implements', 'cart', 'dig'),
  link('plant-grind', 'feeds', 'plant', 'grind'),
  link('grind-sift', 'feeds', 'grind', 'sift'),
  link('bag-grind', 'blocks', 'bag', 'grind'),
  link('wheel-grind', 'implements', 'wheel', 'grind', { inferred: true }),
  link('grind-memo', 'relates_to', 'grind', 'memo'),
  link('grind-oven', 'feeds', 'grind', 'oven'),
  link('mill-ledger', 'produces', 'mill', 'ledger'),
  link('grind-gone', 'relates_to', 'grind', 'gone', { broken: true }),
  link('grind-ghost', 'relates_to', 'grind', 'ghost'),
  link('yard-memo', 'relates_to', 'yard', 'memo'),
  link('dig-chore', 'relates_to', 'dig', 'chore'),
  link('sift-bag', 'feeds', 'sift', 'bag'),
]

const LOADED = { records: RECORDS, links: LINKS, linkCarries: new Map<string, string | null | undefined>() }

function stored(scope: string): StoredIntent {
  return { scope, intent: {}, targets: [], report: {}, note: '' } as unknown as StoredIntent
}

/** What `lanesInputFor` gives: the input, the sentences for every reader, and the sentences for developers. */
interface Reading {
  input: LanesInput
  said: string[]
  // Optional, so this file compiles before `lanesInputFor` gives the list.
  toDevelopers?: readonly { key: string; words: string }[]
}

/**
 * The sentences for developers, as words. A reading with no such list gives none, so a case that asks for one is red in
 * its own words and not because the list is missing.
 */
const told = (reading: Reading): string[] => (reading.toDevelopers ?? []).map((line) => line.words)

/** The drawn pipeline's lanes, read as its page reads them. */
async function theYard(): Promise<Reading> {
  const { lanesInputFor } = await import('../src/web/components/graph/lanes/from-records.ts')
  return lanesInputFor(LOADED, null, RECORDS[0]!, 'steps', stored('pipeline:yard'))
}

/**
 * Each stored link with an end drawn on the page, and whether it is drawn, named by a sentence, or neither. A sentence
 * names a link when it holds the link's word and the title of each end the page loaded, each in quotation marks, and
 * each sentence names one link at most. The links whose sentence must hold two titles take theirs first, so a link
 * with one end loaded cannot take another link's sentence. The titles are the ones the drawing gives its records, and
 * the stored ones for the rest.
 */
function eachLinkWithAnEnd(
  loaded: { records: readonly PanelRecord[]; links: readonly GraphLink[] },
  pipelineId: string,
  reading: Reading,
): { link: string; is: 'drawn' | 'named' | 'neither' }[] {
  const { input } = reading
  const onThePage = new Set([...input.records.map((one) => one.id), pipelineId])
  const titles = new Map(loaded.records.map((one) => [one.id, one.title]))
  for (const one of input.records) titles.set(one.id, one.title)
  const drawnLinks = new Set(input.links.map((one) => one.id))
  const withAnEnd = loaded.links.filter((one) => onThePage.has(one.fromId) || onThePage.has(one.toId))
  const wordsOf = (one: GraphLink): string[] => [linkWord(one.type, 'forward').text, ...[one.fromId, one.toId].flatMap((end) => (titles.has(end) ? [titles.get(end)!] : []))]
  const is = new Map<string, 'drawn' | 'named' | 'neither'>()
  const free = told(reading)
  for (const one of [...withAnEnd].sort((a, b) => wordsOf(b).length - wordsOf(a).length)) {
    if (drawnLinks.has(one.linkId)) {
      is.set(one.linkId, 'drawn')
      continue
    }
    const at = free.findIndex((sentence) => wordsOf(one).every((word) => sentence.includes(`“${word}”`)))
    is.set(one.linkId, at === -1 ? 'neither' : 'named')
    if (at !== -1) free.splice(at, 1)
  }
  return withAnEnd.map((one) => ({ link: one.linkId, is: is.get(one.linkId)! }))
}

const say = t as unknown as (key: string, values: Record<string, string>) => string

/** A sentence, written from en-wave-13u.ts by its key, the way the page's `t` writes it. */
async function sentence(key: string, values: Record<string, string>): Promise<string> {
  const { enWave13u } = await import('../src/shared/words/en-wave-13u.ts')
  expect(typeof Reflect.get(enWave13u, key), `en-wave-13u.ts has the word ${key}`).toBe('string')
  return say(key, values)
}

const word = (type: string): string => linkWord(type, 'forward').text
const kind = (id: keyof typeof TITLES): string => kindWord(RECORDS.find((one) => one.id === id)!.kind).text

it('PV-R5 case 1: every stored link with an end drawn on the page is drawn or named, and the two add up to the 13 stored', async () => {
  const yard = await theYard()
  // The drawing is the one the office describes: the second pipeline's step is drawn, in an area its pipeline heads.
  expect(yard.input.records.map((one) => one.id).sort()).toEqual(['cart', 'dig', 'grind', 'mill', 'plant'])
  expect(yard.input.tree.areas.at(-1)!.heading).toEqual({ text: TITLES.mill, record: 'mill' })
  const each = eachLinkWithAnEnd(LOADED, 'yard', yard)
  expect(each.filter((one) => one.is === 'neither'), 'links with an end on the page that are neither drawn nor named').toEqual([])
  const drawn = each.filter((one) => one.is === 'drawn').length
  const named = each.filter((one) => one.is === 'named').length
  expect({ drawn, named, total: drawn + named }).toEqual({ drawn: 3, named: 10, total: 13 })
  expect(each.map((one) => one.link).sort()).toEqual(LINKS.filter((one) => one.linkId !== 'sift-bag').map((one) => one.linkId).sort())
})

it("PV-R5 case 2: each link of the area's step and of its pipeline is named in its own sentence, with both ends and why", async () => {
  const yard = await theYard()
  const expected = [
    await sentence('lanesInput.linkOfAnotherPipeline', { link: word('feeds'), from: TITLES.grind, to: TITLES.sift, pipeline: TITLES.mill }),
    await sentence('lanesInput.linkOfAnotherPipeline', { link: word('blocks'), from: TITLES.bag, to: TITLES.grind, pipeline: TITLES.mill }),
    await sentence('lanesInput.linkOfAnotherPipelinesStep', { link: word('implements'), from: TITLES.wheel, to: TITLES.grind, near: TITLES.grind, pipeline: TITLES.mill, kind: kind('wheel'), far: TITLES.wheel }),
    await sentence('lanesInput.linkOfAnotherPipelinesStep', { link: word('relates_to'), from: TITLES.grind, to: TITLES.memo, near: TITLES.grind, pipeline: TITLES.mill, kind: kind('memo'), far: TITLES.memo }),
    await sentence('lanesInput.linkOfAnotherPipelinesStep', { link: word('feeds'), from: TITLES.grind, to: TITLES.oven, near: TITLES.grind, pipeline: TITLES.mill, kind: kind('oven'), far: TITLES.oven }),
    await sentence('lanesInput.linkOfAnAreasPipeline', { link: word('produces'), from: TITLES.mill, to: TITLES.ledger, pipeline: TITLES.mill, kind: kind('ledger'), far: TITLES.ledger }),
    say('lanesInput.linkBroken', { link: word('relates_to'), drawn: TITLES.grind }),
    say('lanesInput.linkFarNotLoaded', { link: word('relates_to'), drawn: TITLES.grind }),
  ]
  const keys = [
    ...Array<string>(2).fill('lanesInput.linkOfAnotherPipeline'),
    ...Array<string>(3).fill('lanesInput.linkOfAnotherPipelinesStep'),
    'lanesInput.linkOfAnAreasPipeline',
    'lanesInput.linkBroken',
    'lanesInput.linkFarNotLoaded',
  ]
  const lines = yard.toDevelopers ?? []
  for (const one of expected) expect(told(yard), 'the sentences of the developer view').toContain(one)
  // Each is said once, so no two of these links share one sentence, and under the key that wrote it.
  for (const [at, one] of expected.entries()) expect(lines.filter((each) => each.words === one).map((each) => each.key), one).toEqual([keys[at]])
  // Every reader is told none of them.
  for (const one of expected) expect(yard.said, 'the sentences every reader sees').not.toContain(one)
})

it('PV-R5 case 3: the link with neither end on the page is neither drawn nor named', async () => {
  const yard = await theYard()
  expect(yard.input.links.some((one) => one.id === 'sift-bag')).toBe(false)
  expect([...yard.said, ...told(yard)].filter((one) => one.includes(`“${TITLES.sift}”`) && one.includes(`“${TITLES.bag}”`))).toEqual([])
})

// ---------------------------------------------------------------- the reel page, for case 4

const REEL = REEL_PAGE

/**
 * The steps this file adds to the reel page's other pipelines, made up: each is listed before that pipeline's drawn
 * steps or after them, and none is drawn.
 */
const ADDED_STEPS = [
  { key: 'other-1-before', of: 'other-1', at: 'before', title: 'Example step before the drawn steps of pipeline 1 (made up)' },
  { key: 'other-1-after', of: 'other-1', at: 'after', title: 'Example step after the drawn steps of pipeline 1 (made up)' },
  { key: 'other-2-before', of: 'other-2', at: 'before', title: 'Example step before the drawn steps of pipeline 2 (made up)' },
  { key: 'other-2-after', of: 'other-2', at: 'after', title: 'Example step after the drawn steps of pipeline 2 (made up)' },
  { key: 'other-3-after', of: 'other-3', at: 'after', title: 'Example step after the drawn step of pipeline 3 (made up)' },
  { key: 'other-4-before', of: 'other-4', at: 'before', title: 'Example step before the drawn steps of pipeline 4 (made up)' },
  { key: 'other-4-after', of: 'other-4', at: 'after', title: 'Example step after the drawn steps of pipeline 4 (made up)' },
  { key: 'other-5-before', of: 'other-5', at: 'before', title: 'Example step before the drawn steps of pipeline 5 (made up)' },
  { key: 'other-5-after', of: 'other-5', at: 'after', title: 'Example step after the drawn steps of pipeline 5 (made up)' },
] as const

/** The other records this file adds, made up, none of them drawn: two modules that carry only steps of other pipelines, and a note. */
const ADDED_RECORDS = [
  { key: 'module-not-drawn-1', kind: 'module', title: 'Example module not drawn here that carries a step of pipeline 2 (made up)' },
  { key: 'module-not-drawn-2', kind: 'module', title: 'Example module not drawn here that carries a step of pipeline 4 (made up)' },
  { key: 'note-not-drawn', kind: 'note', title: 'Example note that pipeline 3 produces (made up)' },
] as const

/** The 14 links this file adds, each as its type, its from end and its to end. */
const ADDED_LINKS = [
  // 11 blocks links between a drawn step of another pipeline and a step of the same pipeline that is not drawn: 5 to a
  // drawn step from the step before it, and 6 from a drawn step to the step after it.
  ['blocks', 'other-1-before', 'other-1-step-1'],
  ['blocks', 'other-2-before', 'other-2-step-1'],
  ['blocks', 'other-4-before', 'other-4-step-1'],
  ['blocks', 'other-5-before', 'other-5-step-1'],
  ['blocks', 'other-5-before', 'other-5-step-2'],
  ['blocks', 'other-1-step-3', 'other-1-after'],
  ['blocks', 'other-2-step-3', 'other-2-after'],
  ['blocks', 'other-2-step-6', 'other-2-after'],
  ['blocks', 'other-3-step-1', 'other-3-after'],
  ['blocks', 'other-4-step-5', 'other-4-after'],
  ['blocks', 'other-5-step-5', 'other-5-after'],
  // 2 inferred implements links from a module that is not drawn to a drawn step of another pipeline.
  ['implements', 'module-not-drawn-1', 'other-2-step-2'],
  ['implements', 'module-not-drawn-2', 'other-4-step-3'],
  // 1 link of a pipeline heading an area. It is not one of round 230's 13.
  ['produces', 'other-3', 'note-not-drawn'],
] as const

/** A link's id here: its ends' keys and its type, as the file's loader names a stored link. */
const linkNamed = (type: string, from: string, to: string): string => `${from} ${type} ${to}`

// The file's records, with the added steps listed in their pipelines, and the added records. Keys stand for ids, as
// they do in the file. Gates are not read here: a link is drawn or named whatever its gate.
const REEL_RECORDS: PanelRecord[] = [
  aRecord(REEL.pipeline.key, 'pipeline', REEL.pipeline.title, { blockIds: REEL.steps.map((step) => step.key) }),
  ...REEL.steps.map((step) => aRecord(step.key, 'block', step.title, { state: step.state ?? 'todo' })),
  ...REEL.modules.map((one) => aRecord(one.key, 'module', one.title)),
  ...REEL.others.flatMap((other) => {
    const added = (at: 'before' | 'after'): string[] => ADDED_STEPS.filter((step) => step.of === other.key && step.at === at).map((step) => step.key)
    const blockIds = [...added('before'), ...other.steps.map((step) => step.key), ...added('after')]
    return [aRecord(other.key, 'pipeline', other.title, { blockIds }), ...other.steps.map((step) => aRecord(step.key, 'block', step.title, { state: step.state ?? 'todo' }))]
  }),
  ...ADDED_STEPS.map((step) => aRecord(step.key, 'block', step.title, { state: 'todo' })),
  ...ADDED_RECORDS.map((one) => aRecord(one.key, one.kind, one.title)),
]

const REEL_LINKS: GraphLink[] = [
  ...REEL.links.map((one) => link(linkNamed(one.type, one.from, one.to), one.type, one.from, one.to, { inferred: one.inferred })),
  ...ADDED_LINKS.map(([type, from, to]) => link(linkNamed(type, from, to), type, from, to, { inferred: type === 'implements' })),
]

const REEL_LOADED = { records: REEL_RECORDS, links: REEL_LINKS, linkCarries: new Map<string, string | null | undefined>() }

/** The reel page's areas and places, as the file stores them. */
function reelStored(): StoredIntent {
  return { scope: `pipeline:${REEL.pipeline.key}`, intent: { lanes: REEL.placement.lanes, nodes: REEL.placement.nodes }, targets: [], report: {}, note: '' } as unknown as StoredIntent
}

it("PV-R5 case 4: on the made-up reel page and the 14 links added to it, the file's 66 links are drawn and the 14 named, of 80", async () => {
  const { lanesInputFor } = await import('../src/web/components/graph/lanes/from-records.ts')
  const reel = lanesInputFor(REEL_LOADED, null, REEL_RECORDS[0]!, 'steps', reelStored())
  // The drawing is the file's: its 45 records are drawn, and none of the records this file adds.
  const theFilesPage = [...REEL.steps, ...REEL.modules, ...REEL.others, ...REEL.others.flatMap((other) => other.steps)].map((one) => one.key)
  expect(theFilesPage).toHaveLength(45)
  expect(reel.input.records.map((one) => one.id).sort(), 'the records the reel page draws').toEqual(theFilesPage.sort())
  const each = eachLinkWithAnEnd(REEL_LOADED, REEL.pipeline.key, reel)
  expect(each.filter((one) => one.is === 'neither'), 'links with an end on the page that are neither drawn nor named').toEqual([])
  const drawn = each.filter((one) => one.is === 'drawn').map((one) => one.link)
  const named = each.filter((one) => one.is === 'named').map((one) => one.link)
  expect({ drawn: drawn.length, named: named.length, total: each.length }).toEqual({ drawn: 66, named: 14, total: 80 })
  expect(drawn.sort(), "the drawn links are the file's").toEqual(REEL.links.map((one) => linkNamed(one.type, one.from, one.to)).sort())
  expect(named.sort(), 'the named links are the ones this file adds').toEqual(ADDED_LINKS.map(([type, from, to]) => linkNamed(type, from, to)).sort())
})
