// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * STYLE AND DETAIL ARE TWO AXES, AND THIS IS WHAT KEEPS THEM APART.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO CLAIMS
 * ---------------------------------------------------------------------------------------
 *
 *   Changing HOW MUCH is said may not change HOW IT IS SET.
 *   Changing HOW IT IS SET may not change HOW MUCH is said.
 *
 * They fused once already and it is worth saying how, because the shape will come back.
 * `Compact` was offered as a reading style. It is a density word, and a reader who wanted "more on
 * the screen" reached for it and got a narrower prose column, smaller headings AND tighter tables —
 * three changes, one of which is the other axis wearing this one's clothes. There was nothing to
 * fail. Both lists were strings in two files and neither knew the other existed.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS ACTUALLY CHECKED, AND WHY EACH ONE IS NOT A TAUTOLOGY
 * ---------------------------------------------------------------------------------------
 *
 * 1. No profile id or name is a word on the detail axis. That one is in
 *    `tests/blocks-profiles.test.ts`, beside the profiles.
 *
 *    THIS FILE ALSO HELD THREE CHECKS ON THE FOUR PRESETS — that no preset was named after a word
 *    on either axis, that every preset was a pair of values on the two, and that a pair nobody
 *    named got no name. The presets were removed by instruction,
 *    so those three went with them. The three checks below are not about presets and stay.
 *
 * 3. THE ONE THAT NEEDS A RENDER: the same blocks drawn at all three text sizes give the same
 *    WORDS. If a size ever dropped, shortened or added a block, this goes red. A size may move
 *    every pixel it likes; it may not change what is on the page.
 *
 * 4. And the other direction: the detail resolver's answer for a record does not move when the
 *    stored text size moves.
 *
 * 5. THE THIRD DIMENSION IS SEPARABLE TOO. Leaving the pictures out takes out the pictures and
 *    nothing else: the prose at one length is the same prose whether or not the charts are drawn.
 */
import { readFileSync } from 'node:fs'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { detailKeyForSurface, detailOf, isRung, RUNGS, type Rung } from '../src/shared/detail.ts'
import { isPictures, PICTURES_DEFAULT } from '../src/shared/pictures.ts'
import type { SummaryBlock } from '../src/shared/types.ts'

type SummaryBlocksModule = typeof import('../src/web/components/SummaryBlocks.tsx')

/**
 * The three positions the appearance bar offers, READ OUT OF ITS SOURCE rather than imported.
 * `PresetBar.tsx` reads `window` at import time and there is no window until `beforeAll` runs.
 */
const SIZE_CHOICES = (() => {
  const bar = readFileSync(new URL('../src/web/components/PresetBar.tsx', import.meta.url), 'utf8')
  const list = /const SIZE_CHOICES = \[([^\]]*)\]/.exec(bar)?.[1] ?? ''
  return [...list.matchAll(/'([^']+)'/g)].map((m) => m[1] as string)
})()

let sb: SummaryBlocksModule
let store: Map<string, string>

beforeAll(async () => {
  store = new Map<string, string>()
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
  sb = await import('../src/web/components/SummaryBlocks.tsx')
})

/** A run of blocks with enough different kinds in it that a dropped one would show. */
const BLOCKS: SummaryBlock[] = [
  { id: 'b1', type: 'heading', text: 'What was measured' },
  { id: 'b2', type: 'text', text: 'The shell cracked on the third print, at the same corner each time.' },
  { id: 'b3', type: 'list', items: ['First run', 'Second run', 'Third run'] },
  { id: 'b4', type: 'quote', text: 'It is not the printer.' },
  {
    id: 'b5',
    type: 'table',
    columns: [{ label: 'run' }, { label: 'result' }],
    rows: [{ cells: ['1', 'held'] }, { cells: ['2', 'cracked'] }],
  },
  { id: 'b6', type: 'code', code: 'print(1)' },
]

/**
 * The words a reader would see at one text size, with the markup and the stylesheet taken out.
 *
 * The size is set in storage rather than passed, because that is how the component reads it: the
 * reader's own setting, not a prop an author can write.
 */
function words(size: string): string {
  store.set('mole-office.preset.size', size)
  const html = renderToStaticMarkup(
    h(sb.SummaryBlocks, {
      blocks: BLOCKS,
      inRecord: { recordId: 'rec-1', kind: 'report' },
      layout: 'page',
    } as never),
  )
  store.delete('mole-office.preset.size')
  return html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

describe('changing how a report is set does not change what it says', () => {
  it('really drew something, so a comparison of two empty strings cannot pass quietly', () => {
    expect(words('default').length).toBeGreaterThan(80)
    expect(words('default')).toContain('The shell cracked on the third print')
  })

  it('gives the same words at all three text sizes', () => {
    const first = words('default')
    for (const size of SIZE_CHOICES) {
      expect(words(size), `the ${size} size changes what the report says`).toBe(first)
    }
  })

  it('gives the same words in both profiles a container chooses', () => {
    const first = words('default')
    for (const profile of sb.BLOCKS_PROFILES) {
      const html = renderToStaticMarkup(
        h(sb.SummaryBlocks, {
          blocks: BLOCKS,
          inRecord: { recordId: 'rec-1', kind: 'report' },
          layout: profile.id,
        } as never),
      )
        .replace(/<style[\s\S]*?<\/style>/g, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&#x27;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim()
      expect(html, `${profile.name} changes what the report says`).toBe(first)
    }
  })
})

describe('leaving the pictures out leaves out the pictures and nothing else', () => {
  const WITH_A_CHART: SummaryBlock[] = [
    { id: 'p1', type: 'text', text: 'The prose that stays whatever happens to the chart.' },
    {
      id: 'p2',
      type: 'chart',
      spec: {
        kind: 'line',
        x: { label: 'effort' },
        y: { label: 'grip force', unit: 'N' },
        series: [{ id: 's1', name: 'v3 shell', points: [{ x: 12, y: 11.2 }, { x: 18, y: 19.4 }] }],
      },
    },
  ]
  const STORED = { title: 'A report', declaresShortForms: true }

  function drawn(pictures: string): { text: string; said: string[]; pressed: string[] } {
    store.set('mole-office.pictures.local', pictures)
    // THE BODY IS READ AT FULL HERE, AND THIS FILE NOW SAYS SO RATHER THAN INHERITING IT.
    // The owner's act 3a of 15 September 2026 made a record page open at the
    // conclusion, where this fixture has no summary and so draws the absence line and no blocks at
    // all — neither the chart this file is about nor the prose beside it. The choice is written the
    // way a reader's own is, through the same key function the page reads, so this file is about
    // the two axes again and not about the level a page opens at.
    store.set(detailKeyForSurface('reportContent'), 'full')
    const html = renderToStaticMarkup(
      h(sb.SummaryBlocks, {
        blocks: WITH_A_CHART,
        inRecord: { recordId: 'rec-1', kind: 'report', stored: STORED },
        layout: 'page',
      } as never),
    ).replace(/<style[\s\S]*?<\/style>/g, '')
    store.delete('mole-office.pictures.local')
    // WHAT THE PICTURES BUTTON SAYS, at both places it is drawn. The words are in its accessible
    // name — the button itself is an icon that turns blue — so this is what a screen reader reads.
    const buttons = [...html.matchAll(/<button[^>]*class="sb-pictures"[^>]*>/g)].map((one) => one[0])
    return {
      text: html,
      said: buttons.map((one) => /aria-label="([^"]*)"/.exec(one)?.[1] ?? ''),
      pressed: buttons.map((one) => /aria-pressed="([^"]*)"/.exec(one)?.[1] ?? ''),
    }
  }

  it('draws the chart when nothing was said, because a report is drawn as it was written', () => {
    expect(PICTURES_DEFAULT).toBe('drawn')
    expect(drawn('drawn').text, 'the chart was not drawn at the default').toContain('sb-chart')
  })

  /**
   * IT USED TO ASSERT A COUNT: the foot read `N of N blocks are not drawn whole`, and a chart left
   * out was a block not drawn, so the number said it. That count went on 2 September 2026 with the
   * numbered control the owner replaced. What the page says now is the state of the pictures
   * button — not blue, and *Pictures left out* in its accessible name — at both places the control
   * is drawn. That is weaker: it says the pictures are off, not how many blocks that cost.
   * Problem `GmMV5kyE9joN` in Mole Office holds the loss.
   */
  it('takes the chart out and keeps the prose, and says the pictures are left out', () => {
    const without = drawn('left out')
    expect(without.text, 'the chart is still drawn').not.toContain('sb-chart')
    expect(without.text, 'the prose went with the picture').toContain('The prose that stays')
    expect(without.said, 'nothing on the page says the pictures are left out').toEqual([
      'Pictures left out',
      'Pictures left out',
    ])
    expect(without.pressed, 'the button reads as pressed with the pictures off').toEqual(['false', 'false'])
    // AND THE OTHER WAY ROUND, so a button that said the same thing whatever the choice was would
    // not pass this by saying the right words once.
    expect(drawn('drawn').said).toEqual(['Pictures drawn', 'Pictures drawn'])
    expect(drawn('drawn').pressed).toEqual(['true', 'true'])
  })
})

describe('changing how much is said does not change how it is set', () => {
  const RECORD = {
    title: 'The shell cracked on the third print',
    summary: 'Three runs, one crack, always the same corner.',
    declaresShortForms: true,
    shortForms: { label: { text: 'Shell crack', author: 'human' } },
    body: { field: 'data.blocks', written: true },
  }

  it('answers the same for a record however the text size is stored', () => {
    const asked: Rung[] = [...RUNGS]
    const withNothing = asked.map((rung) => JSON.stringify(detailOf(RECORD, rung)))
    for (const size of SIZE_CHOICES) {
      store.set('mole-office.preset.size', size)
      const now = asked.map((rung) => JSON.stringify(detailOf(RECORD, rung)))
      expect(now, `the resolver moved when the text size was ${size}`).toEqual(withNothing)
    }
    store.delete('mole-office.preset.size')
  })

})
