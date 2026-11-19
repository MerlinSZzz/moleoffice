// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
/**
 * MathText -- a LaTeX formula, drawn by KaTeX.
 *
 * KATEX IS LOADED ONLY WHEN A PAGE HAS MATHS. It is a quarter of a megabyte of code with a
 * stylesheet and fonts, so it lives in `maths-drawing.ts`, the one file that imports it, and this
 * component reaches that file through a dynamic import the first time a formula is drawn. Once it
 * is there it is kept here, and every later formula is drawn at once.
 *
 * THE RULE THAT MATTERS MOST IS HERE:
 * ----------------------------------
 * When a formula cannot be drawn as it was typed, it is NOT guessed at and NOT drawn blank. It is
 * shown in a marked box holding the raw LaTeX and the reason: KaTeX's own words, or a sentence of
 * this file's where the cause is not KaTeX's. A matrix quietly drawn as a run of numbers is a wrong
 * equation in a research record -- which is worse than no equation, because nobody can see that it
 * is wrong. What KaTeX is asked to refuse, and why, is in `maths-drawing.ts`.
 *
 * WAITING IS NOT A REFUSAL. Until the drawing code has arrived, the source is shown quietly in the
 * formula's own place and the formula is marked busy. It does not look like the box and does not
 * claim to be drawn.
 */

import { useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { InReachMark, useReach } from './InReach.tsx'

type MathsDrawing = typeof import('./maths-drawing.ts')

// ---------------------------------------------------------------------------- the drawing code

type Loading = { state: 'waiting' } | { state: 'ready'; drawing: MathsDrawing } | { state: 'failed'; error: unknown }

let loading: Loading = { state: 'waiting' }
let started: Promise<void> | null = null
const listeners = new Set<() => void>()

/**
 * START LOADING THE DRAWING CODE, ONCE. The promise this hands back never rejects: a failure is
 * kept as the state and shown in every formula's box. A rejection nobody caught would be blamed by
 * the page's boot script on the page itself.
 */
function startLoading(): Promise<void> {
  started ??= import('./maths-drawing.ts').then(
    (drawing) => {
      loading = { state: 'ready', drawing }
    },
    (error: unknown) => {
      loading = { state: 'failed', error }
    },
  ).then(() => {
    for (const listener of listeners) listener()
  })
  return started
}

/** Load the drawing code, and resolve once a formula can be drawn at once; reject if it did not load. */
export async function loadMathsDrawing(): Promise<void> {
  await startLoading()
  if (loading.state === 'failed') throw loading.error
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
const now = (): Loading => loading

/** The start of the box's reason when the drawing code did not load. The error follows it. */
export const THE_DRAWING_DID_NOT_LOAD = 'The maths drawing code did not load'

export const AN_EMPTY_EXPRESSION = 'the expression is empty'

// ---------------------------------------------------------------------------- the delimiters

/**
 * The formula without the delimiters round it, and whether it is a display.
 *
 * Delimiters around the whole string ($...$, $$...$$, \(...\), \[...\]) also decide the mode,
 * because that is how the maths arrives when it is pasted out of a paper or a report.
 */
function readDelimiters(src: string, displayDefault: boolean): { body: string; display: boolean } | null {
  if (typeof src !== 'string' || src.trim() === '') return null
  let body = src.trim()
  let display = displayDefault

  if (body.startsWith('$$') && body.endsWith('$$') && body.length >= 4) {
    body = body.slice(2, -2)
    display = true
  } else if (body.startsWith('\\[') && body.endsWith('\\]')) {
    body = body.slice(2, -2)
    display = true
  } else if (body.startsWith('$') && body.endsWith('$') && body.length >= 2) {
    body = body.slice(1, -1)
    display = false
  } else if (body.startsWith('\\(') && body.endsWith('\\)')) {
    body = body.slice(2, -2)
    display = false
  }
  return body.trim() === '' ? null : { body, display }
}

// ---------------------------------------------------------------------------- component

export interface MathTextProps {
  tex: string
  /** Display mode: centred on its own line, full-size operators. $$...$$ sets it too. */
  display?: boolean
  /**
   * What a screen reader hears. There is no automatic spoken form of an equation that is
   * reliably right, so when it matters the caller writes it; otherwise the LaTeX source is
   * read out, which is at least exactly what the author wrote.
   */
  label?: string
  /**
   * Where `tex` is stored, as `renderInline` says it of a run of words. It is not drawn: a formula's
   * drawing is not its stored characters. The chat reads it to paint a marked part on the formula.
   */
  marks?: Record<string, string>
}

export function MathText({ tex, display, label }: MathTextProps) {
  const code = useSyncExternalStore(subscribe, now, now)
  if (code.state === 'waiting') void startLoading()
  const read = useMemo(() => readDelimiters(tex, display ?? false), [tex, display])
  const drawn = useMemo(
    () => (read !== null && code.state === 'ready' ? code.drawing.drawMaths(read.body, read.display) : null),
    [read, code],
  )

  if (read === null) return <Unsupported tex={tex} reason={AN_EMPTY_EXPRESSION} />
  if (code.state === 'failed') {
    const why = code.error instanceof Error ? code.error.message : String(code.error)
    return <Unsupported tex={tex} reason={`${THE_DRAWING_DID_NOT_LOAD}: ${why}`} />
  }
  if (drawn !== null && !drawn.ok) return <Unsupported tex={tex} reason={drawn.reason} />

  // KaTeX's drawing is hidden from a screen reader, which hears the wrapper's name instead: once.
  const body =
    drawn === null ? (
      <span aria-hidden="true" className="mt-waiting">
        {read.body}
      </span>
    ) : (
      <span aria-hidden="true" className="mt-body" dangerouslySetInnerHTML={{ __html: drawn.html }} />
    )
  const busy = drawn === null ? true : undefined
  const content = (
    <>
      <style href="mole-office-math" precedence="default">{MATH_CSS}</style>
      {body}
    </>
  )
  if (read.display) {
    return (
      <DisplayedMath label={label ?? tex} busy={busy}>
        {content}
      </DisplayedMath>
    )
  }
  return (
    <span className="mt" role="math" aria-label={label ?? tex} aria-busy={busy}>
      {content}
    </span>
  )
}

/**
 * The house rule, made visible. The word "unsupported" carries the meaning; the colour only
 * repeats it, so this still reads correctly in the mono theme and in print.
 */
function Unsupported({ tex, reason }: { tex: string; reason: string }) {
  return (
    <span className="mt-unsupported" role="note">
      <style href="mole-office-math" precedence="default">{MATH_CSS}</style>
      <span className="mt-unsupported-tag">{t('pageWords.MathText.001')}</span>
      <code className="mt-unsupported-src">{tex}</code>
      <span className="mt-unsupported-why">{reason}</span>
    </span>
  )
}

/**
 * AN EQUATION ON A LINE OF ITS OWN, WITH THE EDGE IT RUNS PAST MARKED.
 *
 * It scrolls rather than wrapping and that is the decision: an equation broken across two lines at
 * whatever character happened to reach the edge is a different equation. So this box is announced
 * rather than fixed. It keeps `role="math"` and its own name, because it is an equation before it
 * is a scrolling box; only the ref, the tab stop and the mark are added.
 *
 * The waiting source and the drawing are different children of different widths, so each is a
 * different shape to measure.
 *
 * IT IS MADE OF SPANS SET ON A LINE OF THEIR OWN, AS KATEX'S OWN DISPLAY IS. Two dollar signs inside
 * a line of text draw a display in the paragraph that holds the line, and HTML closes a paragraph at
 * the first div inside it. A maths block draws the same spans, so the two look the same.
 */
function DisplayedMath({ label, busy, children }: { label: string; busy: true | undefined; children: ReactNode }) {
  const reach = useReach(`${busy === true ? 'waiting' : 'drawn'} ${label}`)
  return (
    <InReachMark reach={reach} element="span" className="mt-reach">
      <span
        className="mt mt-display"
        role="math"
        aria-label={label}
        aria-busy={busy}
        ref={reach.box as React.RefObject<HTMLSpanElement>}
        tabIndex={reach.sides.length === 0 ? undefined : 0}
      >
        {children}
      </span>
    </InReachMark>
  )
}

// ---------------------------------------------------------------------------- styles

/*
 * KaTeX's own stylesheet sets its size, at 1.21 times the text round it, and everything inside a
 * formula. This sets only the box a formula sits in, the source shown while it waits, and the
 * marked box.
 */
const MATH_CSS = `
.mt { color: var(--text); }
/* The page reset clamps every svg to the width of its box. KaTeX draws some parts as an svg placed
   absolutely in a box of no width, the arrow of \\vec among them, and under the reset that svg paints
   nothing: \\vec{v} was drawn as a plain v. */
.mt .katex svg { max-width:none; }
/* A box that scrolls across hides what runs past it above and below, and KaTeX draws accents, limits
   and the tops of matrices a little past the line it reports. So the space round a display is room
   inside the box rather than a margin outside it. With none, 24 of the 71 display formulas in
   tests/common-latex-from-papers-and-notes.ts lost pixels; with .25em none did, but one still ran
   past the bottom, which the mark reads as more below. */
.mt-display { display:block; text-align:center; margin:0; padding:.5em 0; font-size: var(--fs-3);
  overflow-x:auto; overflow-y:hidden; }
/* The holder of the marks round a display is a span, so it is set on a line of its own here. */
.mt-reach { display:block; }
/* As wide as its formula, so a formula that grows when its fonts arrive is measured again. */
.mt-display > .mt-body { display:inline-block; min-width:100%; }
.mt-display > .mt-body > .katex-display { margin:0; }

/* the source, shown quietly while the drawing code is on its way */
.mt-waiting { font-family: var(--font-mono); font-size:.9em; color: var(--text-2);
  white-space: pre-wrap; }

/* the honest failure box */
.mt-unsupported { display:inline-flex; flex-wrap:wrap; align-items:baseline; gap:6px;
  padding: 4px var(--pad); border: var(--border-w) solid var(--st-inferred-line);
  border-left: var(--rail) solid var(--st-inferred-line); border-radius: var(--radius-sm);
  background: var(--st-inferred-bg); color: var(--st-inferred);
  font-family: var(--font-ui); font-size: var(--fs-1); line-height: var(--lh-body); }
.mt-unsupported-tag { font-weight:700; text-transform:uppercase; letter-spacing:.04em; }
.mt-unsupported-src { font-family: var(--font-mono); font-size: var(--fs-2); color: var(--text);
  background: var(--panel-2); border:1px solid var(--border); border-radius: var(--radius-sm);
  padding:1px 4px; overflow-wrap:anywhere; }
.mt-unsupported-why { color: var(--st-inferred); }
`
