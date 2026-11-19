// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ONE FILE THAT IMPORTS KATEX, AND THE RULES IT DRAWS BY.
 *
 * KaTeX is its code, its stylesheet and its fonts, and a page with no maths needs none of them. So
 * MathText reaches this file only through a dynamic import, the first time it draws a formula, and
 * nothing else imports KaTeX. tests/maths-is-loaded-only-when-a-page-has-maths.test.ts holds the
 * built app to that.
 *
 * THE RULE THAT MATTERS MOST: A FORMULA IS DRAWN AS IT WAS TYPED, OR NOT AT ALL. A formula drawn
 * wrong is worse than one not drawn, because nobody can see that it is wrong. So KaTeX is asked to
 * throw rather than draw its own red error, and everything below that would leave out or change part
 * of what was typed is refused, with the reason. MathText shows a refusal in its marked box.
 */

import katex, { type KatexOptions, type TrustContext } from 'katex'
import 'katex/dist/katex.min.css'

/** A formula drawn, as KaTeX's HTML, or the reason it was not. */
export type Drawn = { ok: true; html: string } | { ok: false; reason: string }

/**
 * THE CODES KATEX REPORTS WHERE LATEX ITSELF WOULD COMPLAIN, AND WHAT IS DRAWN ANYWAY.
 *
 * Each of these is drawn showing what was typed, so it is allowed:
 *   - `unicodeTextInMathMode`: Chinese, or an accented letter, typed straight into maths.
 *   - `unknownSymbol`: a character LaTeX has no command for, such as an em dash.
 *   - `mathVsTextAccents`: a text accent such as `\'e` used in maths.
 *   - `mathVsTextUnits`: a space in the other kind of unit, such as `pt` in `\mkern`.
 *   - `mathVsSout`: `\sout` in maths.
 *   - `textEnv`: an `{array}` row with more cells than its column list names. KaTeX draws them all.
 *   - `newLineInDisplayMode`: `\\` in a display. Refusing it would not refuse the formula: KaTeX
 *     drops the line break silently and draws the rest on one line.
 *   - `htmlExtension`: `\htmlClass` and the rest are refused by `trust` below, which names the
 *     command. Refused here as well, they would be refused with a sentence that names none.
 *
 * `commentAtEnd`, a `%` with no line after it, is refused: the comment runs to the end of the
 * formula and the rest of it is never drawn. So is any code KaTeX adds later, until somebody has
 * looked at what it draws.
 */
const SHOWS_WHAT_WAS_TYPED = new Set([
  'unicodeTextInMathMode',
  'unknownSymbol',
  'mathVsTextAccents',
  'mathVsTextUnits',
  'mathVsSout',
  'textEnv',
  'newLineInDisplayMode',
  'htmlExtension',
])

const strict = (code: string): 'ignore' | 'error' => (SHOWS_WHAT_WAS_TYPED.has(code) ? 'ignore' : 'error')

/**
 * NO LINK, PICTURE OR HTML INSIDE A FORMULA. A report is written by agents and drawn on the owner's
 * own page, so `\href`, `\url`, `\includegraphics` and the four `\html` commands are refused. This
 * throws rather than answering false: KaTeX draws an untrusted command as its name in red, which
 * would be a drawing that is not what was typed.
 */
const trust = (context: TrustContext): boolean => {
  throw new Error(`${context.command} is refused: a formula here may not hold a link, a picture or HTML`)
}

/**
 * A `%` STARTS A COMMENT THAT RUNS TO THE END OF ITS LINE. KaTeX drops the comment without a word,
 * so a percent sign typed without its backslash, before a line break, would hide the rest of its
 * line. It is found here because KaTeX reports only the one at the very end. A `%` after an even
 * number of backslashes is a comment, since `\\` is a line break; after an odd number it is `\%`.
 */
const A_COMMENT_BEFORE_A_LINE_BREAK = /(?<!\\)(?:\\\\)*%[^\n]*\n/

export const A_COMMENT_WOULD_HIDE_THE_REST_OF_ITS_LINE =
  'a % starts a comment, which would hide the rest of its line: write \\% for a percent sign'

const OPTIONS: KatexOptions = {
  // HTML only. KaTeX's MathML is a second reading of the same formula for a screen reader, and
  // MathText's wrapper already says the formula once, by its source or the label it was given.
  output: 'html',
  throwOnError: true,
  strict,
  trust,
}

/** Draw one formula, without its delimiters, as a display or inline. */
export function drawMaths(tex: string, display: boolean): Drawn {
  if (A_COMMENT_BEFORE_A_LINE_BREAK.test(tex)) return { ok: false, reason: A_COMMENT_WOULD_HIDE_THE_REST_OF_ITS_LINE }
  try {
    return { ok: true, html: katex.renderToString(tex, { ...OPTIONS, displayMode: display }) }
  } catch (err) {
    // KaTeX's own words. `message` carries the source again with the place marked; `rawMessage` is
    // the reason alone, and the box shows the source beside it already.
    if (err instanceof katex.ParseError) return { ok: false, reason: err.rawMessage }
    if (err instanceof Error) return { ok: false, reason: err.message }
    throw err
  }
}
