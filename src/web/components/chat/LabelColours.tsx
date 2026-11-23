// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE COLOURS A FLAG IS DRAWN IN, in one stylesheet that the chat and the flags panel both draw. The set of colours is
 * `LABEL_COLOURS` in src/shared/message-label.ts. The first six are each a colour of the theme, so the light and the
 * dark theme each draw it in their own value, readable on the panel's ground.
 *
 * PINK, LIGHT BLUE, ORANGE AND FOREST GREEN ARE NOT COLOURS OF THE THEME. Each is one hue, written once below, mixed into the
 * theme's own colours: its ink into the theme's ink, so the ink is dark on a light theme and light on a dark one and
 * stays readable; its soft ground into the panel's ground, so the ground is a light tint on a light theme.
 *
 * ONE DRAWING RULE, from the decision that settled the six colours, holds for all ten: a flag's border is its colour,
 * on a soft ground of the same colour. An element with the class `px-label-ink` and a `data-colour` gets `--label-ink`
 * and `--label-soft`. Its words take `--label-words` from `data-words-colour`, which falls back to `--label-ink` when
 * nobody set one.
 */
import { LABEL_COLOURS, type LabelColour } from '@shared/message-label.ts'

/** The one hue of each colour that is not a colour of the theme. */
const HUE = {
  pink: '#e0457b',
  'light-blue': '#3b8fd9',
  orange: '#f08a24',
  // The hue decided for forest green. It is its own hue, not the theme's green, so the two are separate colours.
  'forest-green': '#228b22',
} as const
/** A hue's ink: the hue mixed into the theme's ink, readable on the theme's ground and on the hue's own soft ground. */
const inkOf = (hue: string): string => `color-mix(in srgb, ${hue} 45%, var(--text))`
/** A hue's soft ground: a tint of the hue on the panel's ground. */
const softOf = (hue: string): string => `color-mix(in srgb, ${hue} 22%, var(--panel))`

/** The colour each flag colour is drawn in, and the soft ground of the same colour. Every ink is readable on its own soft ground in both themes. */
const INK: Readonly<Record<LabelColour, string>> = {
  grey: 'var(--st-todo)',
  red: 'var(--st-failed)',
  amber: 'var(--st-inferred)',
  green: 'var(--st-done)',
  blue: 'var(--accent)',
  purple: 'var(--ask)',
  pink: inkOf(HUE.pink),
  'light-blue': inkOf(HUE['light-blue']),
  orange: inkOf(HUE.orange),
  'forest-green': inkOf(HUE['forest-green']),
}
const SOFT: Readonly<Record<LabelColour, string>> = {
  grey: 'var(--st-todo-bg)',
  red: 'var(--st-failed-bg)',
  amber: 'var(--st-inferred-bg)',
  green: 'var(--st-done-bg)',
  blue: 'var(--accent-soft)',
  purple: 'var(--ask-bg)',
  pink: softOf(HUE.pink),
  'light-blue': softOf(HUE['light-blue']),
  orange: softOf(HUE.orange),
  'forest-green': softOf(HUE['forest-green']),
}

const LABEL_COLOUR_CSS = [
  ...LABEL_COLOURS.map((colour) => `.px-label-ink[data-colour="${colour}"] { --label-ink: ${INK[colour]}; --label-soft: ${SOFT[colour]}; --label-words: ${INK[colour]}; }`),
  ...LABEL_COLOURS.map((colour) => `.px-label-ink[data-words-colour="${colour}"] { --label-words: ${INK[colour]}; }`),
].join('\n')

/** The stylesheet, once for the page however many places draw a label. */
export function LabelColourStyle() {
  return (
    <style href="mole-office-label-colours" precedence="default">
      {LABEL_COLOUR_CSS}
    </style>
  )
}
