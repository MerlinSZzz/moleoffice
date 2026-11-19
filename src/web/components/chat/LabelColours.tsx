// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE COLOURS A FLAG IS DRAWN IN, in one stylesheet that the chat and the flags panel both draw. The set of colours is
 * `LABEL_COLOURS` in src/shared/message-label.ts; each is a colour of the theme, so the light and the dark theme each
 * draw it in their own value, readable on the panel's ground.
 *
 * ONE DRAWING RULE, from the decision that settled the six colours: a flag's border is its colour, on a soft ground of
 * the same colour. An element with the class `px-label-ink` and a `data-colour` gets `--label-ink` and `--label-soft`.
 * Its words take `--label-words` from `data-words-colour`, which falls back to `--label-ink` when nobody set one.
 */
import { LABEL_COLOURS, type LabelColour } from '@shared/message-label.ts'

/** The theme colour each flag colour is drawn in, and the soft ground of the same colour. Every ink is readable on its own soft ground in both themes. */
const INK: Readonly<Record<LabelColour, string>> = {
  grey: 'var(--st-todo)',
  red: 'var(--st-failed)',
  amber: 'var(--st-inferred)',
  green: 'var(--st-done)',
  blue: 'var(--accent)',
  purple: 'var(--ask)',
}
const SOFT: Readonly<Record<LabelColour, string>> = {
  grey: 'var(--st-todo-bg)',
  red: 'var(--st-failed-bg)',
  amber: 'var(--st-inferred-bg)',
  green: 'var(--st-done-bg)',
  blue: 'var(--accent-soft)',
  purple: 'var(--ask-bg)',
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
