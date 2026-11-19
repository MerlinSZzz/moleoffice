// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY CONTROL IN THE APPEARANCE BAR HAS A NAME A SCREEN READER CAN REACH.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS WAS WRITTEN FOR, WHICH IS A REAL ONE AND WAS SHIPPING
 * ---------------------------------------------------------------------------------------
 *
 * `aria-labelledby` takes a SPACE-SEPARATED LIST OF IDS. The bar built its id from the control's
 * own label, which worked for as long as every label was one word — Theme, Density, Corners, Type.
 * The first two-word control, `Text size`, produced `aria-labelledby="preset-Text size"`, which a
 * browser reads as two ids: `preset-Text` and `size`. Neither exists. The group then has NO
 * accessible name: a screen reader announces three unnamed buttons, and the words `Text size` on
 * the screen beside them are not attached to anything.
 *
 * NOTHING IN THE PRODUCT WOULD HAVE SAID SO. The words render, the control works with a mouse, the
 * markup is well formed, and the type checker has no opinion about the contents of a string. It was
 * found by opening the product and trying to press the control by its name.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS ASSERTED
 * ---------------------------------------------------------------------------------------
 *
 * Every id an element points at is an id that exists in the same drawing, and no id in this bar
 * contains a space. Both, because the second is the specific mistake and the first is the class of
 * mistake it belongs to — an id that is merely misspelt fails the first and not the second.
 *
 * AND THAT EVERY CONTROL CARRIES A POINTER AT ALL, which is the half this file was missing. The two
 * checks above walk from the POINTERS to the ids, so a drawing with no pointers passes both of them
 * with nothing to walk. Measured on 25 August 2026: with `aria-labelledby={labelId}` deleted from
 * the segmented control in `PresetBar.tsx`, this file was 4 of 4 green while all four of Density,
 * Corners, Type and Text size lost their accessible name completely — which is the defect of commit
 * `b1040aa` in its fullest form, and the one thing this file exists to catch. The fourth test below
 * walks the other way, from each control to the pointer that has to be on it.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'

type Bar = typeof import('../src/web/components/PresetBar.tsx')

let bar: Bar
let html = ''

beforeAll(async () => {
  // The runner's environment is `node`, and this component's import graph reaches
  // `src/web/api.ts`, which reads localStorage at module scope. The smallest stand-in for a window
  // goes in first, the way tests/home-reading.test.ts does it. PresetBar's own restore is guarded
  // on `document`, which is still absent, so it takes the default presets.
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
  bar = await import('../src/web/components/PresetBar.tsx')
  html = renderToStaticMarkup(h(bar.PresetBar, {}))
})

/** Every id the drawing defines. */
function idsDefined(markup: string): Set<string> {
  return new Set([...markup.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1] ?? ''))
}

/** Every id the drawing points at, with the attribute that pointed and the whole value. */
function idsPointedAt(markup: string): { attribute: string; value: string; id: string }[] {
  const out: { attribute: string; value: string; id: string }[] = []
  for (const match of markup.matchAll(/\s(aria-labelledby|aria-describedby|for|aria-controls)="([^"]*)"/g)) {
    const attribute = match[1] ?? ''
    const value = match[2] ?? ''
    // A space-separated list is what these attributes hold, which is the whole point.
    for (const id of value.split(/\s+/).filter((one) => one !== '')) out.push({ attribute, value, id })
  }
  return out
}

describe('the appearance bar', () => {
  it('really drew something, so a walk over an empty drawing cannot pass quietly', () => {
    expect(html.length, 'the preset bar drew nothing at all').toBeGreaterThan(200)
    // One group per axis. The number moves when an axis is added, which is a line of a diff.
    expect([...html.matchAll(/class="presetbar-group"/g)].length).toBe(5)
  })

  it('points every label at an id that exists', () => {
    const defined = idsDefined(html)
    const dangling = idsPointedAt(html).filter((one) => !defined.has(one.id))
    expect(
      dangling.map((one) => `${one.attribute}="${one.value}" names "${one.id}", which nothing defines`),
      'a control pointing at an id nobody defined has no accessible name, and looks fine on screen',
    ).toEqual([])
  })

  it('gives no id a space in it, because a space makes one id into two', () => {
    const withASpace = [...idsDefined(html)].filter((id) => /\s/.test(id))
    expect(
      withASpace,
      'aria-labelledby splits on whitespace, so an id with a space in it can never be pointed at',
    ).toEqual([])
  })

  it('puts a naming pointer on every one of the five controls, not merely well-formed ids', () => {
    // Five controls, two mechanisms. Four segmented groups are named by `aria-labelledby` on the
    // element carrying role="group"; the theme menu is named by a label's `for`. Both are asserted
    // from the CONTROL end, because the pointer being absent is what neither test above can see.
    const defined = idsDefined(html)
    const resolves = (value: string | null): boolean =>
      value !== null && value.split(/\s+/).filter((one) => one !== '').every((id) => defined.has(id))

    const groups = [...html.matchAll(/<[a-z]+[^>]*\srole="group"[^>]*>/g)].map((m) => m[0] ?? '')
    expect(groups.length, 'the bar drew no segmented control at all, so nothing here is measured').toBe(4)
    const unnamed = groups.filter((tag) => !resolves(/\saria-labelledby="([^"]*)"/.exec(tag)?.[1] ?? null))
    expect(
      unnamed,
      'a role="group" with no aria-labelledby pointing at an id that exists has NO accessible name. A ' +
        'screen reader announces three unnamed buttons and Playwright cannot find it by name, while the ' +
        'words beside it still render and the markup is still well formed.',
    ).toEqual([])

    const menus = [...html.matchAll(/<select[^>]*\sid="([^"]*)"[^>]*>/g)].map((m) => m[1] ?? '')
    expect(menus.length, 'the bar drew no menu at all, so the line below is measured against nothing').toBe(1)
    const labelled = new Set(idsPointedAt(html).filter((one) => one.attribute === 'for').map((one) => one.id))
    expect(
      menus.filter((id) => !labelled.has(id)),
      'a select that no label points `for` at is announced as an unnamed menu, the same failure with the ' +
        'other of the two mechanisms',
    ).toEqual([])
  })

  it('names every axis with the words on the screen, so the two cannot come apart', () => {
    // The visible label and the accessible name are the same string here BECAUSE the label element
    // is what the group points at. This asserts the mechanism rather than the five words.
    const groups = [...html.matchAll(/id="([^"]*)"[^>]*>([^<]*)<\/span>/g)].map((m) => ({
      id: m[1] ?? '',
      words: (m[2] ?? '').trim(),
    }))
    expect(groups.length, 'no labelled group was found in the bar at all').toBeGreaterThan(0)
    for (const group of groups) {
      expect(group.words, `${group.id} labels nothing a person can read`).not.toBe('')
    }
    expect(groups.map((g) => g.words)).toContain('Text size')
  })
})
