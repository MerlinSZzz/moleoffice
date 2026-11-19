// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PARTS OF ONE THING, SEEN BESIDE EACH OTHER: every number the arrangement uses, and the whole of
 * the arithmetic that decides what happens to what an Agent asked for.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A COMPOSITION IS, IN FOUR LAYERS
 * ---------------------------------------------------------------------------------------
 *
 * The owner set these on 28 August 2026 and they are quoted in full in
 * `design/problem-01/OWNER-ANSWER-COMPOSITION.md`. Each layer decides exactly one thing:
 *
 *   1. A Semantic Region owns its space — ALL of it. Nobody states this; it is what a region is.
 *   2. A composition decides HOW MANY sibling columns exist. The author states it by writing that
 *      many parts. One part is one column at the full width, and there is no second track, latent
 *      or otherwise.
 *   3. Between siblings, an Agent may say what each part is worth against the others. That is
 *      `share`, and it is intent this engine may adapt.
 *   4. A prose child may additionally say how wide the TEXT INSIDE its own full-width column reads.
 *      That is `measure`, and it is also intent this engine may adapt.
 *
 * LAYER 4 IS WRITTEN IN TWO PLACES AND MEANS ONE THING. It may be written on a PART of a
 * composition, where it is about every prose block that part holds, and on a BLOCK, where it is
 * about that block. What it means — the four names, the ratio and its bounds, the floor, and the one
 * maximum it becomes on a screen — is this file, and both places read it from here. The owner's own
 * sentence is the second one: "For a single prose part, however, the Agent authoring the Report may
 * optionally express a prose-width / whitespace preference." Most reports hold no composition at
 * all, so a block is the ordinary place a measure is written and a part is the other place.
 *
 * THE TRAP, NAMED SO IT IS NOT WALKED INTO. A `measure` must never be implemented by making the
 * part narrower. The part keeps the whole of its share; the preference narrows the text inside it,
 * as a maximum. Layer 3 and layer 4 are two different boxes and a preference about one of them
 * says nothing about the other.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MAY AND MAY NOT CONTAIN
 * ---------------------------------------------------------------------------------------
 *
 * IT HOLDS EVERY NUMBER IN THE MECHANISM, AND EACH ONE ONCE. That is the whole reason it exists.
 * A floor written here and again in the stylesheet is one fact worked out in two places, which is
 * the defect this repository keeps producing; the stylesheet interpolates these values instead.
 *
 * NO PIXELS AND NO GUTTER. Every number here is in `rem`, is a ratio, or is a count. The gap
 * between parts is `var(--sb-gut)`, which is 6, 10, 12, 16 or 18 pixels depending on the reader's
 * density setting and the presentation profile — so a threshold worked out from one of them would
 * be wrong in the other four. CSS adds the gaps, once, in the one declaration that pays for them.
 * `drawnAt` is the single function that is told a pixel width, and it is told the gutter and the
 * root font size rather than guessing either.
 *
 * NO DOM. This runs on the server, in the browser and in a test, and it is the same answer in all
 * three.
 */

import type { Least } from './regions.ts'
import type { LayoutReport } from './presentation.ts'

// --------------------------------------------------------------------------- how narrow is too narrow

/**
 * THE NARROWEST A PART HOLDING THIS KIND OF THING MAY BE DRAWN, IN REM. THE ONE DECLARATION.
 *
 * `leastNeededBy` in src/shared/regions.ts answers WHAT a part holds — writing, evidence with
 * words in it, or a picture — by walking the region tree. This map is the only place those three
 * answers turn into a size. Three product judgements, and they are recorded as judgements in
 * `design/problem-01/ACCEPTANCE.md` so there is one place to argue with them:
 *
 *   sentence  20rem   The narrowest column in which ordinary English never has to break, about
 *                     forty characters. A paragraph cannot scroll, so its floor has to be the
 *                     width at which the words still read.
 *   panel     15rem   A table or a code block. LOWER than prose on purpose: a table too wide for
 *                     its box scrolls inside its own announced box and stays legible, so its floor
 *                     is the width at which that scrolling box is still usable.
 *   figure    18rem   A picture or a chart. The width at which a picture still shows what it was
 *                     put in the report to show. It was 10rem until 29 August 2026, and 10rem was
 *                     never checked against a picture. One of the two screenshots the gate report
 *                     draws side by side was drawn at thirteen widths and looked at: at 160px
 *                     nothing on it can be read, at 240px only its page heading reads, at 272px its
 *                     row labels are on the edge of reading, and at 288px the row labels, the
 *                     buttons and the sidebar all read. 18rem is the first whole rem at or above
 *                     that. The ladder is in design/problem-01/ACCEPTANCE.md section C3.
 *
 * THEY FOLLOW THE READER'S TEXT SIZE FOR FREE. `:root[data-size='small']` and `[data-size='large']`
 * scale the root font size, so 20rem is 300, 320 or 360 pixels depending on what the reader chose,
 * and a reader on the largest text gets earlier stacking without a second set of numbers existing.
 *
 * `{ readonly [K in Least]: number }` has no index signature, so a fourth answer from
 * `leastNeededBy` stops the build until somebody says how narrow it may be drawn.
 */
export const LEAST_REM: { readonly [K in Least]: number } = { sentence: 20, panel: 15, figure: 18 }

/**
 * WHAT A PART IS WORTH WHEN NOBODY SAID. Never stored; worked out again on every draw.
 *
 * It is keyed on what the part HOLDS, so the automatic proportion is the same fact about the
 * content read a second way: more room to the part carrying the argument than to the part carrying
 * the evidence. From the content alone it produces
 *
 *   writing | picture           3 : 2      = 60/40
 *   picture | picture           2 : 2      = 50/50
 *   writing | table | picture   3 : 2 : 2  = 43/28/28
 *   writing | writing           3 : 3      = 50/50
 *
 * TWO DISTINCT VALUES AND NOT THREE, said plainly rather than dressed up: a nine-column table and
 * a photograph are worth the same to this rule. What tells them apart is the floor above, where a
 * picture's is now the larger of the two — a table too narrow scrolls inside its own box and stays
 * readable, and a picture too narrow has nowhere to put what it lost.
 */
export const SHARE_WHEN_UNASKED: { readonly [K in Least]: number } = { sentence: 3, panel: 2, figure: 2 }

/**
 * THE BOUNDS ON WHAT MAY BE STORED. Read by the write door and published by GET /api/kinds, so a
 * refusal, the schema an agent reads and the arithmetic below can never name different numbers.
 */
export const SHARE_MIN = 1
export const SHARE_MAX = 100
export const PARTS_MIN = 2
export const PARTS_MAX = 4

// ----------------------------------------- the spellings a report may write a proportion in

/**
 * THE THREE SPELLINGS A REPORT MAY ASK FOR PROPORTIONS IN, AND THE ONE FORM THEY ARE STORED AS.
 *
 * The owner set this on 29 August 2026, and the sentence is the whole of the rule:
 *
 *   *"I distinguish composition share from prose measure. Agents should be allowed to naturally
 *   request proportions such as 60/40, 50/50, or 3:2 between sibling regions. Those are layout
 *   intent, not raw CSS authority. Canonical storage may normalize percentages into relative
 *   shares and the renderer may adjust them for minimum readable sizes. measure is separate and
 *   controls only the writing width inside a prose region."*
 *
 * So there are three spellings and there is no fourth:
 *
 *   `share: 3` on every part          whole numbers, the form that was always stored
 *   `share: "60%"` on every part      percentages, which have to add up to 100 across the parts
 *   `proportions: "3:2"` on the row   one ratio for the whole row: "3:2", "60/40", "50/50"
 *
 * WHY THE LIST STOPS THERE, said plainly. Each of the three says something the other two cannot say
 * as well. A whole number is what an author writes when the parts are simply worth 3 and 2. A
 * percentage is what an author writes when they are thinking in hundredths and want the total
 * checked — and it is the one form that brings its own arithmetic, because 60 and 30 is a row with
 * a tenth of it unaccounted for. A ratio on the ROW is the only place "60/40" can be written at
 * all, because it is one statement about the whole row rather than about any one part. Every other
 * spelling an agent reaches for is either one of these under another name — `weights`, `ratio`,
 * `flex` — or a WIDTH, which is the thing the owner separated from a share. `NAMED_WRONG_KEYS` in
 * src/shared/kinds/key-suggestions.ts sends the first group here and `AMBIGUOUS_WIDTH_KEYS` refuses the second by
 * making the author choose between the two concepts.
 *
 * EVERY TERM IS A WHOLE NUMBER, WITH OR WITHOUT A `%`, AND NEVER A DECIMAL. `1.5:1` is refused and
 * the refusal says to write `3:2`. That is not fussiness: a proportion between siblings is always
 * expressible in whole numbers, and accepting decimals would put rounding into the one value the
 * owner asked to be stored losslessly.
 *
 * WHAT IS STORED IS ALWAYS THE SAME PAIR: a whole number on each part, with no common factor left
 * in, and the author's own spelling kept beside them on the row as `proportions`. So `60/40`,
 * `6/4`, `3:2` and `"60%"`/`"40%"` all store shares of 3 and 2, and all four are still told apart
 * afterwards because the row remembers what was written. THAT IS WHAT MAKES THE NORMALISING
 * LOSSLESS, and it is the whole reason `proportions` exists: the answer for a write can say *you
 * asked for 60/40* and *this is drawn 74/26* in one sentence a person can check.
 */
export const SHARE_SEPARATORS = [':', '/'] as const

/** The canonical answer: the author's own spelling, and the whole numbers it becomes. */
export interface SharesAsked {
  /** Exactly what the report wrote, in its own spelling. Stored on the row, and quoted back to it. */
  askedAs: string
  /** The relative shares: whole numbers whose only common factor is 1, in the parts' order. */
  shares: readonly number[]
}

/** Why a stated proportion cannot be stored, in a sentence the author can act on. */
export interface ShareProblem {
  problem: string
}

export const isShareProblem = (v: SharesAsked | ShareProblem): v is ShareProblem => 'problem' in v

/** The greatest common divisor of two whole numbers. */
function gcd(a: number, b: number): number {
  let x = Math.abs(a)
  let y = Math.abs(b)
  while (y !== 0) {
    const t = y
    y = x % y
    x = t
  }
  return x
}

/** One term of a proportion, as it was written. */
interface Term {
  /** The number, with any percent sign already taken off. Always a whole number. */
  n: number
  /** Whether it was written as a percentage, which is what brings the add-up-to-100 rule with it. */
  percent: boolean
  /** How it was written, kept for the refusal and for `askedAs`. */
  raw: string
}

/**
 * ONE TERM READ, or null when it is not a proportion at all.
 *
 * Digits, optionally followed by `%`. Nothing else: `600px`, `40rem`, `0.4fr`, `1.5` and `auto` are
 * a width, a unit or a decimal, and each of those is refused rather than guessed at.
 */
function readTerm(raw: string): Term | null {
  const trimmed = raw.trim()
  const percent = trimmed.endsWith('%')
  const digits = (percent ? trimmed.slice(0, -1) : trimmed).trim()
  if (!/^\d+$/.test(digits)) return null
  const n = Number(digits)
  if (!Number.isSafeInteger(n) || n <= 0) return null
  return { n, percent, raw: trimmed }
}

/**
 * WHOLE-NUMBER SHARES FROM WHAT WAS WRITTEN, or the reason there are none.
 *
 * `where` names the composition in the refusal, so an author with three compositions in one report
 * is told which one is wrong.
 *
 * TWO RULES, AND BOTH REFUSE RATHER THAN RESCALE. Percentages are shares of the whole row, so a
 * pair adding up to 90 is a statement about a row that does not exist, and quietly stretching it to
 * 100 would be Mole Office deciding what somebody meant. A proportion that cannot be written as
 * whole numbers of `SHARE_MAX` or less is refused for the same reason: the alternative is storing a
 * rounded-off ratio and calling it the one that was asked for.
 */
function sharesOfTerms(terms: readonly Term[], where: string): SharesAsked | ShareProblem {
  const spelt = terms.map((t) => `"${t.raw}"`).join(' and ')
  const percents = terms.filter((t) => t.percent)
  if (percents.length > 0 && percents.length !== terms.length) {
    return {
      problem:
        `${where} mixes percentages with plain numbers: ${spelt}. Write every part as a percentage, or none of ` +
        `them — a percentage is a share of the whole row and a plain number is a ratio against the other parts, ` +
        `and half of each is neither`,
    }
  }
  if (percents.length === terms.length) {
    const total = terms.reduce((n, t) => n + t.n, 0)
    if (total !== 100) {
      return {
        problem:
          `${where} asks for percentages adding up to ${String(total)} and not 100: ${spelt}. A percentage is a ` +
          `share of the WHOLE row, so the percentages have to add up to 100, and Mole Office will not rescale them ` +
          `for you — that would be storing proportions nobody wrote. Either correct them, or drop the percent ` +
          `signs and write the plain ratio ${terms.map((t) => String(t.n)).join(':')}, which needs no total`,
      }
    }
  }

  // DOWN BY THEIR COMMON FACTOR, which is the whole of the normalising. 60 and 40 become 3 and 2;
  // 50 and 50 become 1 and 1; 3 and 2 are already there and are left alone.
  const factor = terms.map((t) => t.n).reduce((a, b) => gcd(a, b))
  const shares = terms.map((t) => t.n / factor)
  if (shares.some((n) => n < SHARE_MIN || n > SHARE_MAX)) {
    return {
      problem:
        `${where} cannot be stored as whole-number shares of ${String(SHARE_MAX)} or less: ${spelt} has no common ` +
        `factor and comes out as ${shares.join(':')}. A share is a ratio between the parts, so write something a ` +
        `person would say out loud: "3:2", "60/40" or "50/50"`,
    }
  }
  return { askedAs: terms.map((t) => t.raw).join('/'), shares }
}

/**
 * ONE RATIO WRITTEN ABOUT THE WHOLE ROW: `"3:2"`, `"60/40"`, `"50/50"`, `"3:2:2"`.
 *
 * ONE SEPARATOR PER STRING. `:` and `/` are the two ways a person writes a ratio down and both are
 * accepted, but `"3:2/1"` is refused rather than read, because a string using both is as likely to
 * be a mistake as a ratio, and reading it would be a guess.
 */
export function readProportions(text: string, parts: number, where: string): SharesAsked | ShareProblem {
  const used = SHARE_SEPARATORS.filter((s) => text.includes(s))
  if (used.length === 0) {
    return {
      problem:
        `${where} has proportions "${text}", which names no parts to divide the row between. Write one whole ` +
        `number for each part, separated by "${SHARE_SEPARATORS.join('" or "')}" — "3:2" or "60/40" for two ` +
        `parts, "3:2:2" for three`,
    }
  }
  if (used.length > 1) {
    return {
      problem:
        `${where} has proportions "${text}", which uses both "${used.join('" and "')}". Use one of them: "3:2" or ` +
        `"60/40", not both in one string`,
    }
  }
  const terms: Term[] = []
  for (const piece of text.split(used[0] ?? ':')) {
    const term = readTerm(piece)
    if (term === null) {
      return {
        problem:
          `${where} has proportions "${text}", and "${piece.trim()}" in it is not a proportion. Every term is a ` +
          `whole number, with or without a percent sign: "3:2", "60/40", "50/50", "60%/40%". It is never a width, ` +
          `so no "px", no "rem", no "fr" and no decimals — how wide the WRITING inside a part reads is "measure", ` +
          `which is a separate thing`,
      }
    }
    terms.push(term)
  }
  if (terms.length !== parts) {
    return {
      problem:
        `${where} has ${String(parts)} parts but proportions "${text}", which names ${String(terms.length)}. ` +
        `Write one number for each part, in the order the parts are written`,
    }
  }
  const answer = sharesOfTerms(terms, `${where}, whose proportions are "${text}",`)
  // The whole string is what was written, so that is what is remembered — not the terms joined up.
  return isShareProblem(answer) ? answer : { askedAs: text, shares: answer.shares }
}

/**
 * A PROPORTION WRITTEN ON EACH PART: `3` and `2`, or `"60%"` and `"40%"`.
 *
 * Every part must have said something — a half-stated preference is not a preference — and that
 * rule stays where it already is, in the refusal that names the silent part. This is given the
 * values of parts that all spoke.
 *
 * A PLAIN NUMBER THAT IS NOT A WHOLE NUMBER IN RANGE IS NOT ANSWERED HERE. `0`, `2.5` and `101`
 * each already have a refusal of their own on the write door that says what a share is, and a
 * second sentence about them here would be one rule with two wordings. `null` comes back and the
 * door that owns those numbers answers.
 */
export function readPartShares(written: readonly unknown[], where: string): SharesAsked | ShareProblem | null {
  const terms: Term[] = []
  for (const value of written) {
    if (typeof value === 'number') {
      if (!Number.isInteger(value) || value < SHARE_MIN || value > SHARE_MAX) return null
      terms.push({ n: value, percent: false, raw: String(value) })
      continue
    }
    const term = typeof value === 'string' ? readTerm(value) : null
    if (term === null) {
      return {
        problem:
          `${where} has a share of ${JSON.stringify(value)}, which is not a proportion. A share is a whole number ` +
          `saying what this part is worth beside the others — 3 and 2 — or a percentage of the row, "60%" and ` +
          `"40%". It is never a width: no pixels, no rem, no "fr" and no decimals. How wide the WRITING inside ` +
          `this part reads is "measure", which is a separate thing`,
      }
    }
    terms.push(term)
  }
  return sharesOfTerms(terms, where)
}

/** One composition's proportions exactly as the report wrote them, before anything is made of them. */
export interface RowAsWritten {
  /** What the row wrote as `proportions`, or `undefined` when it wrote none. */
  proportions?: unknown
  /** What each part wrote as `share`, in the parts' order. `undefined` where a part said nothing. */
  shares: readonly unknown[]
}

/**
 * ONE COMPOSITION'S PROPORTIONS, CANONICAL — or the reason there are none, or nothing to do.
 *
 * THREE ANSWERS, AND THE THIRD IS WHY THIS IS NOT JUST A PARSER:
 *
 *   a `SharesAsked`   the whole numbers to store on the parts, and the spelling to store on the row
 *   a `ShareProblem`  a sentence the author can act on, and nothing is stored
 *   `null`            THERE IS NOTHING HERE FOR THIS FUNCTION TO DO. Either no part asked for
 *                     anything, or what a part wrote is a plain number that some other refusal
 *                     already owns — `0`, `2.5`, `101`. Answering those here would be one rule
 *                     with two wordings, which is the defect this repository keeps producing.
 *
 * THE ROW AND THE PARTS MAY BOTH SPEAK, AND THEY HAVE TO AGREE. That is not a nicety: after a
 * write, the row holds `proportions: "60/40"` and the parts hold 3 and 2, and PATCHING that record
 * back sends both. So "the row said it and the parts said it" is the ordinary case, and the rule is
 * that the two say the same proportion. When they do not, the write is refused naming both — Mole
 * Office has no way to know which of two contradicting statements the author meant.
 */
export function canonicalRow(row: RowAsWritten, where: string): SharesAsked | ShareProblem | null {
  const stated = row.shares.filter((s) => s !== undefined)
  if (row.proportions === undefined) {
    // NOTHING ASKED FOR, or asked for on some parts and not others. The second is refused by the
    // rule that names the silent part, which is a fact about the whole row and not about a number.
    if (stated.length === 0 || stated.length !== row.shares.length) return null
    return readPartShares(row.shares, where)
  }
  if (typeof row.proportions !== 'string') {
    return {
      problem:
        `${where} has proportions ${JSON.stringify(row.proportions)}, which is not a ratio. Proportions are one ` +
        `string saying what the whole row is divided into: "3:2", "60/40", "50/50", "3:2:2"`,
    }
  }
  const asked = readProportions(row.proportions, row.shares.length, where)
  if (isShareProblem(asked)) return asked
  if (stated.length === 0) return asked

  // BOTH SPOKE. They agree when every part carries exactly the whole number the row's ratio reduces
  // to, which is what a record written by this door and sent back again looks like.
  const agrees =
    stated.length === row.shares.length && row.shares.every((s, i) => typeof s === 'number' && s === asked.shares[i])
  if (agrees) return asked
  return {
    problem:
      `${where} says what it is divided into twice, and the two do not agree: the row asks for ` +
      `"${row.proportions}", which is ${asked.shares.join(':')}, and its parts ask for ` +
      `${row.shares.map((s) => (s === undefined ? 'nothing' : JSON.stringify(s))).join(', ')}. Write the ` +
      `proportion once — either "proportions" on the row or "share" on every part`,
  }
}

/**
 * WHAT IS ACTUALLY DRAWN, AS PROPORTIONS, so it can be read against what was asked.
 *
 * "You asked for 60/40 and this is drawn 74/26" is one sentence a person can check; two lists of
 * pixels are not. WHOLE NUMBERS THAT ADD UP TO 100, the rounding leftover going to the parts with
 * the largest fraction — otherwise three equal parts draw as 33/33/33 and read as a row with a
 * percent of it missing.
 */
export function drawnAs(across: readonly PartDrawn[]): string {
  const total = across.reduce((n, p) => n + p.px, 0)
  if (total <= 0) return across.map(() => '0').join('/')
  const exact = across.map((p) => (p.px / total) * 100)
  const down = exact.map((n) => Math.floor(n))
  let left = 100 - down.reduce((a, b) => a + b, 0)
  const order = exact.map((n, i) => ({ i, frac: n - Math.floor(n) })).sort((a, b) => b.frac - a.frac)
  for (const one of order) {
    if (left <= 0) break
    down[one.i] = (down[one.i] ?? 0) + 1
    left -= 1
  }
  return down.join('/')
}

// --------------------------------------------------------------------------- the reading measure

/**
 * HOW WIDE THE TEXT INSIDE ONE PROSE PART READS. Layer 4, and a MAXIMUM rather than a width.
 *
 * `full` is the default when nothing is stated, and it means that the text
 * uses the whole of the column it is in. The other three cap it.
 *
 * THE FOUR NAMES ARE WIDTHS, LISTED WIDEST FIRST: full, wide, narrow, narrowest. None of them says
 * that another is hard to read. That is a decision: the preset that is now `narrow` was called `readable` before it,
 * and the one that is now `narrowest` was called `narrow`. A migration moved the stored words.
 *
 * WHY `narrow` IS A CSS TOKEN AND NOT A NUMBER. The reading measure is declared exactly once in
 * this product, as `--read` in src/web/tokens.css, and the comment on that declaration says in as
 * many words that a second copy of its value anywhere — including in this file, by name — is the
 * duplicated-fact defect. So this preset takes its value FROM that token rather than restating it,
 * and the number is deliberately not written here even to explain itself. The other two presets
 * have no token and their numbers are declared here, once each.
 *
 * IT IS A MAXIMUM, SO IT COMPOSES WITH A SMALL COLUMN FOR FREE: `narrow` inside a 400px part
 * draws at 400px, not at 544px. That is rule 1 below, and CSS enforces it without being asked.
 * `measureDrawn` below reports it: a preset in a column narrower than it asks for is drawn at the
 * column, which is not what was asked for, so it is named as unhonoured with the two widths in the
 * reason.
 */
export const MEASURE_PRESETS = ['full', 'wide', 'narrow', 'narrowest'] as const
export type MeasurePreset = (typeof MEASURE_PRESETS)[number]

/**
 * THE TWO PRESET WIDTHS THIS FILE DECLARES, IN REM, AND EACH ONE ONCE.
 *
 * `full` has no width — it states no maximum. `narrow` has one and it is NOT here: it is `--read`
 * in src/web/tokens.css, for the reason the comment above gives. So a caller that needs the four
 * presets as pixels has to be told what `narrow` came out as, and `measureDrawn` below is handed
 * it rather than guessing.
 */
export const MEASURE_WIDE_REM = 60
export const MEASURE_NARROWEST_REM = 26

/** What each preset caps the text at, as a CSS length. `full` states no maximum at all. */
export const MEASURE_MAX: { readonly [K in MeasurePreset]: string | null } = {
  full: null,
  wide: `${String(MEASURE_WIDE_REM)}rem`,
  narrow: 'var(--read)',
  narrowest: `${String(MEASURE_NARROWEST_REM)}rem`,
}

/**
 * A MEASURE MAY ALSO BE A PLAIN RATIO, for the case no preset expresses. `0.6` means six tenths of
 * the column the part already owns. A ratio and never a width: no pixels, no percent, no rem, the
 * same rule `share` follows.
 *
 * The floor is 0.3 because below that the preference stops being about reading and starts being a
 * way of writing a narrow column without saying so; the ceiling is 1 because 1 is `full` and
 * anything above it would be asking for more than the part owns, which is layer 3's question.
 */
export const MEASURE_RATIO_MIN = 0.3
export const MEASURE_RATIO_MAX = 1

/**
 * WHAT AN AGENT MAY WRITE AS A MEASURE: one of the four preset names, or a ratio.
 *
 * Declared here rather than written out again beside `measure` in src/shared/types.ts, so the
 * stored shape and the arithmetic below cannot come to hold different opinions about what a
 * measure is.
 */
export type MeasureAsked = MeasurePreset | number

/**
 * THE NARROWEST PROSE THIS ENGINE WILL LET A MEASURE MAKE, IN REM.
 *
 * The three rules the engine adapts a stated measure by:
 *
 *   1. Never wider than the column it is in. A maximum does this by itself.
 *   2. Never narrower than this. A preference may not make prose unreadable inside a part that is
 *      already small; below this the column wins and the preference is reported as unhonoured.
 *   3. On a stacked composition the preference still applies. Stacking changes the column's width
 *      and rule 1 already handles that. Stacking does not quietly promote everything to `full`.
 *
 * RULES 1 AND 2 ARE BOTH APPLIED BY `measureDrawn` BELOW AND REPORTED BY `drawnAt`. Rule 3 is not
 * code anywhere and must not become code: it is rule 1 again on a wider column. What `drawnAt`
 * adds for rule 3 is EVIDENCE — a stacked composition still names every measure it applied — so
 * that a later change quietly promoting a stacked part to `full` shows up in the report rather
 * than only on a screen.
 *
 * THE BROWSER APPLIES BOTH RULES THROUGH `measureMaxWidth` BELOW, which turns a stated measure
 * into one CSS maximum. They are stated twice on purpose, exactly as the share arithmetic is: the
 * browser enforces them continuously at every pixel, and `measureDrawn` states the same widths in
 * words so what happened can be reported with no screen anywhere. The two are held together by a
 * browser test that reads the drawn writing at eleven widths.
 */
export const MEASURE_LEAST_REM = 16

/** How wide the writing comes out under one stated measure, and whether that is what was asked. */
export interface MeasureOutcome {
  /** The width the measure asks the writing to be drawn at, in pixels. */
  askedPx: number
  /** The width the writing is drawn at, in pixels. */
  drawnPx: number
  /** Null when the writing is drawn at exactly the width asked for; otherwise why it is not. */
  because: string | null
}

/**
 * WHAT ONE STATED MEASURE COMES OUT AS IN A COLUMN THIS WIDE, AND WHETHER IT IS WHAT WAS ASKED FOR.
 *
 * THE ONE MEANING OF THE TWO WORDS, AND IT IS THE SAME ONE THE SHARES USE: honoured means the
 * drawn result is what was asked for. Anything else is unhonoured, with the reason. `because` is
 * null in exactly the honoured case.
 *
 * THIS REPLACED `measureRefusedBecause`, WHICH GAVE OPPOSITE WORDS FOR THE SAME DRAWN RESULT. That
 * function refused a ratio the column was too narrow for and reported every preset as given, so
 * `wide` in a 573 pixel column — where the writing fills its column and the stated 60rem maximum
 * does nothing at all — came back honoured, while `0.4` in the same column, where the writing also
 * fills its column, came back unhonoured. A caller could not learn from that whether a stated
 * preference had done anything. `design/problem-01/ACCEPTANCE.md` C27 already said which of the
 * two is right: "it is never wider than the column it is in" is one of the three adaptations, and
 * "every adaptation goes into the same LayoutReport.unhonoured the shares use".
 *
 * `readPx` IS HOW WIDE `narrow` CAME OUT ON THE READER'S SCREEN, and it is a parameter rather
 * than a number here because that preset's width is declared once, as `--read` in
 * src/web/tokens.css, and a second copy of it here is the defect this repository keeps producing.
 * A caller with a browser reads it the same way it reads the gap and the root font size.
 */
export function measureDrawn(
  measure: MeasureAsked,
  columnPx: number,
  remPx: number,
  readPx: number,
): MeasureOutcome {
  // A RATIO IS WORKED OUT FROM THE COLUMN, so the same 0.4 is a reading column in a wide part and a
  // strip in a narrow one. That is rule 2, and it is the only rule that ignores a maximum outright.
  if (typeof measure === 'number') {
    const askedPx = measure * columnPx
    if (askedPx >= MEASURE_LEAST_REM * remPx) return { askedPx, drawnPx: askedPx, because: null }
    return {
      askedPx,
      drawnPx: columnPx,
      because:
        'here that would hold the writing to a strip too narrow to read a sentence in, so the writing uses the ' +
        'whole of its own column instead',
    }
  }
  // `full` ASKS FOR THE WHOLE COLUMN AND ALWAYS GETS IT. It states no maximum, so there is nothing
  // a narrow column can take away from it.
  const wanted = presetPx(measure, remPx, readPx)
  if (wanted === null) return { askedPx: columnPx, drawnPx: columnPx, because: null }
  if (wanted <= columnPx) return { askedPx: wanted, drawnPx: wanted, because: null }
  // RULE 1. The column is narrower than the maximum, so the maximum never binds and the writing
  // fills its column. Nothing was drawn at the width that was asked for, and this is what says so.
  return {
    askedPx: wanted,
    drawnPx: columnPx,
    because:
      `the column here is only ${String(Math.round(columnPx))} pixels wide, which is narrower than the ` +
      `${String(Math.round(wanted))} pixels this asks for, so the writing uses the whole of its own column`,
  }
}

/**
 * ONE PRESET AS A NUMBER OF PIXELS, or null for `full`, which names no width at all.
 *
 * TOTAL OVER THE FOUR NAMES WITH NO DEFAULT ARM, so a fifth preset stops the build here until
 * somebody says how wide it is.
 */
function presetPx(preset: MeasurePreset, remPx: number, readPx: number): number | null {
  switch (preset) {
    case 'full':
      return null
    case 'wide':
      return MEASURE_WIDE_REM * remPx
    case 'narrow':
      return readPx
    case 'narrowest':
      return MEASURE_NARROWEST_REM * remPx
  }
}

/**
 * THE ONE CSS MAXIMUM A STATED MEASURE BECOMES, or `null` when it asks for no maximum at all.
 *
 * This is the only place a measure turns into something a stylesheet can use, and it is here
 * rather than in the renderer so that the presets, the ratio and the floor are all read from the
 * declarations above them.
 *
 * `100%` IS THE PART'S OWN COLUMN, resolved by the browser. A ratio is stored as a ratio and
 * reaches the screen as a proportion of whatever the part turned out to be, which is what makes it
 * a preference rather than a width. No pixel is worked out here and none could be: this function
 * is not told any width.
 *
 * HOW RULE 2 IS WRITTEN AS ARITHMETIC, because CSS has no "if". What is wanted is: use the ratio
 * where the ratio of the column is still wide enough to read a sentence in, and otherwise let the
 * column win outright — which is the sentence `measureDrawn` above says in words.
 *
 *   max( R * 100% , min( 100% , (MEASURE_LEAST_REM - R * 100%) * 999 ) )
 *
 * Under the floor the subtraction is positive, 999 times it clears the column, `min` holds it at
 * the column, and `max` picks the column — a maximum equal to the box is no maximum. Over the
 * floor the subtraction is zero or negative, so the second term is too, and `max` picks the ratio.
 *
 * THE 999 IS THE SAME TRICK THE STACKING USES AND IT HAS THE SAME SMALL COST, said plainly: the
 * switch is a steep line rather than a step, so in a band just under the floor the maximum is
 * still applied. MEASURED IN CHROMIUM at 16px rem: for `measure: 0.4` the column releases at
 * 638.4px where the exact threshold is 640px, a band of 1.6px. Nothing reads a width to that
 * precision and the two answers agree at every width this was checked at.
 */
export function measureMaxWidth(measure: MeasureAsked): string | null {
  if (typeof measure === 'string') return MEASURE_MAX[measure]
  const asked = `${String(measure)} * 100%`
  return `max(calc(${asked}), min(100%, calc((${String(MEASURE_LEAST_REM)}rem - ${asked}) * 999)))`
}

// --------------------------------------------------------------------------- what each part is worth

/** One part, as it was written: what it holds, and what it asked to be worth if it asked. */
export interface PartAsked {
  /**
   * What to call this part when reporting back. The layout route passes the part's region id, a
   * test passes its stored id. It is reported and never drawn, so this file never has to know
   * which of the two it was given.
   */
  id: string
  least: Least
  share?: number
  /**
   * How wide the writing inside this part was asked to read. Carried through untouched: it says
   * nothing about how wide the part is, and layer 3's arithmetic never reads it.
   */
  measure?: MeasureAsked
}

/** The same part with the question answered: it is worth this, whether or not anybody said so. */
export interface PartRoom {
  id: string
  least: Least
  share: number
  measure?: MeasureAsked
}

export interface RoomPlan {
  /** What to call the composition itself when reporting back. Same rule as `PartAsked.id`. */
  of: string
  parts: readonly PartRoom[]
  /**
   * Who decided the proportions.
   *
   *   `the report`             an Agent wrote a share on every part. Only this one is a promise,
   *                            so only this one can be honoured or refused.
   *   `Mole Office`            nobody wrote one, so Mole Office read what each part holds.
   *   `the columns are equal`  it is a comparison, whose columns are worth the same by definition.
   *                            A `columns` block has nowhere to store a share, so there was never
   *                            anything here to ask for.
   */
  chosenBy: 'the report' | 'Mole Office' | 'the columns are equal'
  /**
   * WHAT THE REPORT WROTE, IN ITS OWN SPELLING: "60/40", "3:2", "50%/50%". Null when it wrote
   * nothing, and null for the columns of a comparison, which nobody asks anything of.
   *
   * The shares above are the same proportion reduced to whole numbers, so 60/40 and 3:2 both come
   * out as 3 and 2. This is what keeps that lossless: the answer can say what was asked in the
   * words it was asked in, and what is drawn beside it.
   */
  askedAs: string | null
  /** Wider than this, every part gets exactly the share asked for. IN REM, GAPS NOT INCLUDED. */
  exactAboveRem: number
  /** Narrower than this, the parts are drawn one under another. IN REM, GAPS NOT INCLUDED. */
  stackBelowRem: number
  /** How many gaps sit between the parts. The gap is a token; only CSS knows its pixels. */
  gaps: number
}

/**
 * WHAT EACH PART OF ONE COMPOSITION IS WORTH, AND THE TWO WIDTHS THAT DECIDE WHAT HAPPENS TO IT.
 *
 * Pure and total. Every number it returns is in rem or is a count.
 *
 * EITHER EVERY PART SAYS WHAT IT IS WORTH OR NONE DOES. The write door refuses a half-stated
 * preference, so `chosenBy` is a fact about the whole composition rather than a per-part guess.
 */
export function roomFor(of: string, asked: readonly PartAsked[], askedAs: string | null = null): RoomPlan {
  const chosenBy = asked.every((p) => p.share !== undefined) ? 'the report' : 'Mole Office'
  const parts: PartRoom[] = asked.map((p) => ({
    id: p.id,
    least: p.least,
    share: p.share ?? SHARE_WHEN_UNASKED[p.least],
    measure: p.measure,
  }))
  const total = parts.reduce((n, p) => n + p.share, 0)
  // The parts stack below the width at which their floors stop fitting beside each other.
  const stackBelowRem = parts.reduce((n, p) => n + LEAST_REM[p.least], 0)
  // Above this width no part's share puts it under its own floor, so every share is exact. It is
  // never below `stackBelowRem`: the part with the largest floor-per-share decides both.
  const exactAboveRem = Math.max(...parts.map((p) => (LEAST_REM[p.least] * total) / p.share))
  return { of, parts, chosenBy, askedAs: chosenBy === 'the report' ? askedAs : null, exactAboveRem, stackBelowRem, gaps: parts.length - 1 }
}

/**
 * THE COLUMNS OF A COMPARISON: THE SAME PLAN, WITH EVERY COLUMN WORTH THE SAME.
 *
 * A `columns` block is a row whose columns are all worth the same, and a `beside` block is a row
 * whose parts may be worth different amounts because an Agent said so. That is the whole difference
 * between them, so they are drawn by one mechanism and planned by one function.
 *
 * WHY IT IS NOT `roomFor` WITH THE SHARES LEFT OUT. `roomFor` answers "nobody said, so read what
 * each part holds", which gives writing three and a picture two. The stylesheet gives every column
 * `--share: 1`. Until this existed, the renderer called `roomFor` for a columns block and threw its
 * shares away while CSS drew ones — so a route that reported those shares would have described a
 * row nobody draws. One function now, and the renderer and the layout route both call it.
 *
 * EQUAL IS 1 AND NOT SOME OTHER EQUAL NUMBER, because 1 is what `--share` is declared as on
 * .sb-column in the stylesheet, and equal shares divide a row the same way whatever the number is.
 */
export function equalColumns(of: string, columns: readonly { id: string; least: Least }[]): RoomPlan {
  const plan = roomFor(
    of,
    columns.map((column) => ({ id: column.id, least: column.least, share: 1 })),
  )
  return { ...plan, chosenBy: 'the columns are equal', askedAs: null }
}

/**
 * ONE PLAIN SENTENCE SAYING WHAT WILL HAPPEN TO WHAT WAS ASKED FOR.
 *
 * IT NAMES NO WIDTH, AND THAT IS DELIBERATE RATHER THAN A GAP. A plan knows its thresholds in rem
 * and knows nothing about the reader's text size, so turning either threshold into a number of
 * pixels here would mean guessing the root font size — the silent substitution this product bans.
 * The two thresholds are on the plan for a caller that DOES know it; this sentence says the shape
 * of what happens, which is the part that is true at every width.
 */
export function sayWhatHappens(plan: RoomPlan): string {
  const count = plan.parts.length
  const ratio = plan.parts.map((p) => String(p.share)).join(' to ')
  const them = count === 2 ? 'both' : 'all of them'
  if (plan.chosenBy === 'the columns are equal') {
    return (
      `These ${String(count)} columns are a comparison, so they are worth the same and nothing here was asked ` +
      `for. They are drawn beside each other where there is room for ${them} to stay readable, and one under ` +
      `another where there is not.`
    )
  }
  if (plan.chosenBy === 'Mole Office') {
    return (
      `Nothing said what these ${String(count)} parts are worth beside each other, so Mole Office read what each ` +
      `one holds and chose ${ratio}. They are drawn beside each other where there is room for ${them} to stay ` +
      `readable, and one under another where there is not.`
    )
  }
  // WHAT WAS ASKED, IN THE WORDS IT WAS ASKED IN. `askedAs` holds the report's own spelling and the
  // shares hold the same proportion reduced, so an author who wrote 60/40 is answered about 60/40
  // and not about the 3 to 2 it is stored as.
  //
  // WHERE THE TWO SAY THE SAME THING, ONLY ONE IS SAID. "asked for 3:2, which is 3 to 2" is the
  // sentence repeating itself, and the separator is not a difference: `3:2` and `3/2` are one
  // proportion written two ways, so the comparison ignores which one was used.
  const sameAsStored = SHARE_SEPARATORS.some(
    (sep) => plan.askedAs === plan.parts.map((p) => String(p.share)).join(sep),
  )
  const spelt = plan.askedAs === null || sameAsStored ? ratio : `${plan.askedAs}, which is ${ratio}`
  return (
    `The report asked for ${spelt}. That is what is drawn wherever there is room for it. Where there is not, ` +
    `any part that would fall under the smallest size it is still worth reading at is held at that size and its ` +
    `neighbours take the rest; narrower still, the parts are drawn one under another in the order they were ` +
    `written. Every part that does not get what it asked for is named in the report of this write.`
  )
}

// --------------------------------------------------------------------------- what is drawn, at a width

export interface PartDrawn {
  id: string
  px: number
}

export interface Drawing {
  /** What each part is drawn at, beside each other. `null` means they are drawn one under another. */
  across: readonly PartDrawn[] | null
  report: LayoutReport
}

/**
 * WHAT WOULD BE DRAWN IN A BOX OF THIS WIDTH, AND WHAT WAS NOT HONOURED.
 *
 * THIS IS THE ONE DELIBERATE SECOND COPY IN THE WHOLE MECHANISM, AND IT IS FLAGGED RATHER THAN
 * BURIED. The layout itself is enforced by the browser: `flex-grow`, `min-width` and one
 * `flex-basis`. This function states that same algorithm again — hold every part that would fall
 * under its floor, divide what is left among the rest in proportion to their shares, repeat — so
 * that the refusal can be answered IN WORDS, on the server, with no browser anywhere. Two
 * statements of one fact is the defect this repository names about itself, so the two are
 * reconciled by a test that runs both at twelve widths on the same fixture and asserts the same
 * pixels, rather than by a comment asking for care.
 *
 * `gutterPx`, `remPx` AND `readPx` ARE ALL REQUIRED. There is no default width, no default gutter,
 * no default root font size and no default reading measure, because guessing any of them is the
 * silent substitution this product bans. A caller that does not know them cannot ask this
 * question. `readPx` is how wide the `narrow` preset came out, and it is asked for rather than
 * worked out here because that width is declared once, in src/web/tokens.css.
 *
 * A STATED MEASURE IS REPORTED THROUGH THE SAME TWO LISTS, because it is the same kind of thing: an
 * Agent said what it wanted and the engine either did it or did not. It is reported on its own
 * terms and never mixed into the share arithmetic — a measure changes nothing about how wide any
 * part is drawn, and `across` is the same numbers whether or not a measure was written.
 */
/**
 * EVERY STATED MEASURE IN ONE COMPOSITION, SORTED INTO THE TWO LISTS. Parts that stated none are
 * not mentioned at all: silence is not a promise and there is nothing to say about it.
 *
 * `px` is the width of the part's OWN COLUMN, which is what a measure is worked out from. It is
 * the part's drawn width when the parts are beside each other and the whole width when they are
 * one under another — the caller knows which, and this function is told rather than deciding.
 */
function measuresIn(
  parts: readonly { id: string; measure?: MeasureAsked; px: number }[],
  remPx: number,
  readPx: number,
): { honoured: string[]; unhonoured: LayoutReport['unhonoured'] } {
  const honoured: string[] = []
  const unhonoured: LayoutReport['unhonoured'] = []
  for (const part of parts) {
    if (part.measure === undefined) continue
    const { because } = measureDrawn(part.measure, part.px, remPx, readPx)
    // THE HINT SAYS WHICH KIND OF PREFERENCE IT WAS. A part can appear in this list twice — once
    // for its share and once for its measure — and two entries reading `0.4` and `1` against the
    // same part would leave the reader working out which was which.
    if (because === null) honoured.push(`${part.id} measure ${String(part.measure)}`)
    else unhonoured.push({ target: part.id, hint: `measure ${String(part.measure)}`, because })
  }
  return { honoured, unhonoured }
}

export function drawnAt(
  plan: RoomPlan,
  widthPx: number,
  gutterPx: number,
  remPx: number,
  readPx: number,
): Drawing {
  const avail = widthPx - gutterPx * plan.gaps
  const stated = plan.chosenBy === 'the report'
  const asked = plan.parts.map((p) => String(p.share)).join(' to ')
  const slots = plan.parts.map((p) => ({
    id: p.id,
    share: p.share,
    measure: p.measure,
    floor: LEAST_REM[p.least] * remPx,
    px: 0,
    held: false,
  }))

  // NOT ROOM FOR ALL OF THEM AT THEIR SMALLEST, so they go one under another. When nothing was
  // stated this is not a broken promise — stacking is published behaviour of a composition — so
  // there is nothing to report. When a share was stated it is the one thing that did not happen.
  if (slots.reduce((n, s) => n + s.floor, 0) > avail) {
    // EVERY PART'S COLUMN IS NOW THE WHOLE WIDTH, so a stated measure is asked about `widthPx`.
    // That is rule 3 in the comment on `MEASURE_LEAST_REM`, and reporting it here is what makes a
    // later change that quietly dropped a measure on a stacked composition visible.
    const measures = measuresIn(plan.parts.map((p) => ({ ...p, px: widthPx })), remPx, readPx)
    return {
      across: null,
      report: {
        honoured: measures.honoured,
        unhonoured: [
          ...(stated
            ? [
                {
                  target: plan.of,
                  hint: asked,
                  because:
                    'there is not room here for all of these parts beside each other at the smallest size each is ' +
                    'still worth reading at, so they are drawn one under another in the order they were written',
                },
              ]
            : []),
          ...measures.unhonoured,
        ],
      },
    }
  }

  // HOLD EVERY PART THAT WOULD FALL UNDER ITS FLOOR AND RE-DIVIDE WHAT IS LEFT AMONG THE REST, in
  // proportion to their shares. At most one pass per part: each pass holds at least one more.
  //
  // AT LEAST ONE PART SURVIVES EVERY PASS, so this cannot hold all of them and then divide by a
  // total of nothing. If every part were under its floor the floors would add up to more than the
  // width, and the check above has already returned in that case. The guard is still written,
  // because a loop whose safety is an argument in a comment is a loop that breaks when the argument
  // stops being true.
  //
  // THE TOLERANCE IS SO A PART LANDING EXACTLY ON ITS FLOOR IS NOT HELD, which would otherwise be
  // reported as a share that was not honoured when it got precisely what it asked for.
  const CLOSE_ENOUGH = 1e-9
  for (;;) {
    const free = slots.filter((s) => !s.held)
    if (free.length === 0) {
      for (const s of slots) s.px = s.floor
      break
    }
    const pool = avail - slots.filter((s) => s.held).reduce((n, s) => n + s.floor, 0)
    const freeShare = free.reduce((n, s) => n + s.share, 0)
    for (const s of slots) s.px = s.held ? s.floor : (s.share / freeShare) * pool
    const falling = free.filter((s) => s.px < s.floor - CLOSE_ENOUGH)
    if (falling.length === 0) break
    for (const s of falling) s.held = true
  }

  // WHAT IS REPORTED ABOUT THE SHARES, AND ONLY WHEN THERE WAS A STATEMENT TO REPORT ON. A
  // composition whose shares Mole Office chose made no promise, so nothing about them was honoured
  // or unhonoured. A MEASURE IS NOT UNDER THAT GATE: an Agent may state one on a part of a
  // composition whose shares it left to Mole Office, and that statement is its own promise.
  const honoured: string[] = []
  const unhonoured: LayoutReport['unhonoured'] = []
  if (stated) {
    const held = slots.filter((s) => s.held)
    if (held.length === 0) honoured.push(plan.of)
    for (const s of held) {
      unhonoured.push({
        target: s.id,
        hint: String(s.share),
        because:
          'at this width that would draw it under the smallest size it is still worth reading at, so it is held ' +
          'at that size and the other parts take the rest',
      })
    }
  }
  const measures = measuresIn(slots, remPx, readPx)
  return {
    across: slots.map((s) => ({ id: s.id, px: s.px })),
    report: {
      honoured: [...honoured, ...measures.honoured],
      unhonoured: [...unhonoured, ...measures.unhonoured],
    },
  }
}
