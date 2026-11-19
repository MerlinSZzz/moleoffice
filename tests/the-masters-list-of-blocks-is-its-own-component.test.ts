// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MASTER'S LIST OF BLOCKS IS ITS OWN COMPONENT, SO A PAGE CAN DRAW IT WITHOUT THE BIG MAP.
 *
 * ---------------------------------------------------------------------------------------
 * WHY
 * ---------------------------------------------------------------------------------------
 *
 * The master pipeline's page is to draw its boxes in lanes rather than in the big map, and the list of blocks
 * ("The N blocks") stays under the drawing with its words unchanged. The list was drawn only inside `BigMap`, so it
 * could not be drawn without the map. `BigMapBlocks` in src/web/components/graph/BigMap.tsx is that list on its own,
 * and the map draws it the same way as before.
 *
 * On 16 November 2026 the decision, which the secretary filed from the owner's words, took the list off
 * the master's page: a block is pressed in the
 * drawing itself, where its title heads its row and leads to its block pipeline
 * (tests/the-big-map-opens-each-block-pipeline-from-its-box.test.ts, cases 2 and 6). So no page draws the list now.
 * This file reads only BigMap.tsx, which still has the component and the map that draws it, so its cases hold as
 * they were; only what is said here about the master's page changed.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED, by rendering both to static markup from a made-up map of three blocks
 * ---------------------------------------------------------------------------------------
 *
 *   1. the big map still draws the list, and draws it as the component alone draws it;
 *   2. the list says, for each block in its place order, its place, its block pipelines or its own title, and how many
 *      boxes it has on the map and off it, or that it has no block pipeline yet; each block pipeline is a link to it;
 *   3. alone, the list brings the map's own styles, so it is laid out the same where no map is drawn.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   the map stops drawing the list → case 1 goes red.
 *   the list drops how many boxes are off the map → case 2 goes red.
 *   the list leaves its styles to the map → case 3 goes red.
 */
import { createElement as h, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'

import type { MapBox, TheBigMap } from '../src/shared/big-map-reading.ts'
import { t } from '../src/shared/i18n.ts'

type BigMapModule = typeof import('../src/web/components/graph/BigMap.tsx')
let bigMap: BigMapModule
let pipelinePath: (id: string) => string

beforeAll(async () => {
  // src/web/api.ts reads window.localStorage at module scope, and the map reaches it through the router. Nothing in
  // this stand-in is under test.
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
    matchMedia: () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  bigMap = await import('../src/web/components/graph/BigMap.tsx')
  pipelinePath = (await import('../src/web/components/router.tsx')).pipelinePath
})

/** The list on its own, read by name so that a file without it fails here and says so. */
function theList(): ComponentType<{ map: TheBigMap }> {
  const found = Reflect.get(bigMap, 'BigMapBlocks') as unknown
  if (typeof found !== 'function') {
    throw new Error('BigMap.tsx exports no BigMapBlocks, so the list of blocks cannot be drawn without the big map.')
  }
  return found as ComponentType<{ map: TheBigMap }>
}

const pipeline = (id: string, title: string) => ({ id, title })
const box = (id: string, block: number, tier: MapBox['tier'], of: { id: string; title: string }): MapBox => ({
  id,
  title: `${of.title}: made-up step ${id}`,
  name: `made-up step ${id}`,
  tier,
  pipeline: of,
  block,
})

const UPPER = pipeline('pipeline-upper', 'Made-up pipeline upper')
const LOWER_ONE = pipeline('pipeline-lower-one', 'Made-up pipeline lower one')
const LOWER_TWO = pipeline('pipeline-lower-two', 'Made-up pipeline lower two')

/** Three blocks: one with a pipeline and a box off the map, one with no pipeline, and one with two pipelines. */
const MAP: TheBigMap = {
  blocks: [
    { id: 'block-first', title: 'Made-up block first', place: 0, pipelines: [UPPER] },
    { id: 'block-second', title: 'Made-up block second', place: 1, pipelines: [] },
    { id: 'block-third', title: 'Made-up block third', place: 2, pipelines: [LOWER_ONE, LOWER_TWO] },
  ],
  boxes: [box('door', 0, 'gate', UPPER), box('rules', 0, 'services', UPPER), box('loose', 0, null, UPPER), box('store', 2, 'stores', LOWER_ONE)],
  lines: [],
}

/** The list's own section in some markup, or null when there is none. */
function sectionIn(markup: string): string | null {
  const start = markup.indexOf('<section class="bm-blocks">')
  if (start < 0) return null
  return markup.slice(start, markup.indexOf('</section>', start) + '</section>'.length)
}

/** The words a person reads in some markup. */
const textOf = (markup: string) => markup.replace(/<[^>]*>/g, '')

describe("the master's list of blocks, on its own", () => {
  it('1. the big map still draws the list, as the list alone draws it', () => {
    const inTheMap = sectionIn(renderToStaticMarkup(h(bigMap.BigMap, { map: MAP })))
    const alone = sectionIn(renderToStaticMarkup(h(theList(), { map: MAP })))
    expect(alone, 'the list alone draws its section').not.toBeNull()
    expect(inTheMap, 'the big map draws the same section').toBe(alone)
  })

  it('2. each block says its place, its block pipelines and its boxes, in place order', () => {
    const section = sectionIn(renderToStaticMarkup(h(theList(), { map: MAP })))!
    expect(textOf(section.slice(0, section.indexOf('<ul')))).toBe(t('bigMap.blocks', { n: 3 }))
    const rows = [...section.matchAll(/<li data-map-block="([^"]+)">(.*?)<\/li>/g)].map(([, id, inner]) => ({ id, inner: inner! }))
    expect(rows.map((row) => row.id)).toEqual(['block-first', 'block-second', 'block-third'])
    const place = (n: number) => t('bigMap.place', { n })
    expect(rows.map((row) => textOf(row.inner))).toEqual([
      `${place(0)} ${UPPER.title}: 2 ${t('bigMap.block.boxes')}${t('bigMap.block.andNotPlaced', { n: 1 })}`,
      `${place(1)} Made-up block second: ${t('bigMap.block.noPipeline')}`,
      `${place(2)} ${LOWER_ONE.title}, ${LOWER_TWO.title}: 1 ${t('bigMap.block.box')}`,
    ])
    const links = [...section.matchAll(/<a href="([^"]+)"/g)].map(([, href]) => href)
    expect(links, 'each block pipeline opens its own page').toEqual([UPPER, LOWER_ONE, LOWER_TWO].map((one) => `#${pipelinePath(one.id)}`))
  })

  it("3. alone, the list brings the big map's styles", () => {
    const alone = renderToStaticMarkup(h(theList(), { map: MAP }))
    expect(alone, 'the styles the list is laid out by').toContain('.bm-block-list')
  })
})
