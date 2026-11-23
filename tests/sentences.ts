// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE THE INTERFACE STILL SAYS A SENTENCE, FOUND BY READING THE SOURCE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * This module finds every place under `src/web` where the browser code carries an English
 * sentence. It was first the instrument behind the sentence gate, a test deleted on 12 November 2026. It reads text, not a
 * syntax tree, because the TypeScript package in this repository is version 7, which ships a
 * compiler binary and no JavaScript parser API — `require('typescript').createSourceFile` is
 * not a function here. So the scanner below is hand written, and everything it cannot see is
 * named at the foot of this comment rather than left to be discovered.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT COUNTS AS A SENTENCE
 * ---------------------------------------------------------------------------------------
 *
 * The same rule the round-nine prose inventory used on 19 August 2026, so the two numbers can be
 * compared: with comments stripped, a string literal or a run of JSX text of four words or more
 * that starts with a capital letter (or with a `${...}` placeholder, which is how several of them
 * start) and ends in `.`, `?` or `!`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS EXEMPT, AND WHY EACH ONE IS
 * ---------------------------------------------------------------------------------------
 *
 * The interaction contract, section 8.10, names where a sentence is still allowed. Four of those
 * places can be told from the string site alone, so the scanner marks each with its channel and
 * none of them counts as ordinary use:
 *
 *   `title=`, `aria-label=`, `alt=`, `placeholder=`   a sentence a sighted reader sees on hover
 *                                                     and a screen reader hears; contract 8.10.2
 *   `detail=`                                         the sentence-on-demand half of `DrawnState`.
 *                                                     `Mark` puts it in the `title` AND in an
 *                                                     off-screen span, so it is that same channel
 *                                                     reached through the shared type
 *   `meaning=`, `opens=`                              a fold's own label; contract 8.10.2
 *   inside a `.px-sr` span                            the off-screen sentence; contract 8.10.2
 *   inside `throw` or `console.`                      never drawn on any screen at all
 *   inside an `<Explain>` or `<StandingNote>` body    behind a fold; contract 8.10.2
 *
 * THE OTHER THREE ALLOWANCES ARE NOT EXEMPT HERE, ON PURPOSE. A refusal, an Inspect line and a
 * fault path are legitimate places for a sentence, and this scanner cannot tell any of them from
 * an ordinary paragraph without following control flow. So they count as ordinary use. The sentence
 * gate, a test deleted on 12 November 2026, kept such sites in an allowlist file, and that file was
 * deleted the same day. A wrong exemption here would be invisible, so the scanner does not guess.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS SCANNER CANNOT SEE
 * ---------------------------------------------------------------------------------------
 *
 * 1. A sentence assembled at run time from parts that are each under four words. It sees strings,
 *    not the strings a person ends up reading.
 * 2. A sentence that arrives from the server. That is what step 14 was for, and the wire is
 *    checked by its own tests.
 * 3. JSX text is found by taking the run between a `>` and the next `<` outside any string. A
 *    comparison or an arrow function can start such a run; the four-word and end-punctuation
 *    tests throw those away, and anything that survives is a real run of drawn text.
 * 4. Fold bodies are found by matching `<Explain` to `</Explain` textually, counting nesting. A
 *    `<Explain` written inside a string literal would fool it. `noExplainInsideAString` below is
 *    the check that says none is.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { englishWords } from '../src/shared/words/joined.ts'
import { piecesOf, type Piece } from './the-pieces-of-a-source.ts'

export { piecesOf, type Piece } from './the-pieces-of-a-source.ts'

const WEB = fileURLToPath(new URL('../src/web', import.meta.url))

/** Every browser file. The stylesheets live inside these too, in template literals. */
export function webFiles(dir = WEB): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...webFiles(full))
    else if (/\.tsx?$/.test(entry)) out.push(relative(WEB, full))
  }
  return out.sort()
}

/** The allowance a sentence site sits on. `null` means it sits on none: it is ordinary use. */
export type Channel = 'tooltip' | 'foldLabel' | 'foldBody' | 'offScreen' | 'neverDrawn' | null

/** One place in one file that carries a sentence. */
export interface SentenceSite {
  /** Path under `src/web`, so it reads the way the prose inventory reads. */
  file: string
  /** Counted from 1, the way an editor counts. */
  line: number
  /** Where the text was found: a quoted string, or a run of text between two tags. */
  kind: 'literal' | 'jsx'
  /** The allowance this site sits on, or `null` when it sits on none. */
  channel: Channel
  /** The sentence, with runs of whitespace collapsed to one space. */
  text: string
}

/** The text of the file with every comment blanked out, so positions are unchanged. */
export function withoutComments(text: string, pieces: readonly Piece[]): string {
  const chars = text.split('')
  for (const piece of pieces) {
    if (piece.what !== 'comment') continue
    for (let i = piece.at; i < piece.end; i += 1) if (chars[i] !== '\n') chars[i] = ' '
  }
  return chars.join('')
}

/** Runs of whitespace become one space, and the ends are trimmed. */
export function tidy(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Is this a sentence?
 *
 * Four words or more, a capital or a placeholder at the front, and `.`, `?` or `!` at the back.
 */
export function readsAsASentence(text: string): boolean {
  const tidied = tidy(text)
  if (!/[.?!]$/.test(tidied)) return false
  if (!(/^[A-Z]/.test(tidied) || tidied.startsWith('${'))) return false
  return tidied.split(' ').filter((word) => word.length > 0).length >= 4
}

/** `file:line` for a character position, counting lines from 1. */
export function lineAt(text: string, at: number): number {
  let line = 1
  for (let i = 0; i < at; i += 1) if (text[i] === '\n') line += 1
  return line
}

/** The ranges of the file inside an `<Explain>` or `<StandingNote>` body. */
function foldBodies(code: string): { at: number; end: number }[] {
  const out: { at: number; end: number }[] = []
  for (const name of ['Explain', 'StandingNote']) {
    const opens = new RegExp(`<${name}[\\s>]`, 'g')
    const closes = `</${name}>`
    for (const found of code.matchAll(opens)) {
      const bodyAt = code.indexOf('>', found.index)
      if (bodyAt === -1) continue
      // Self-closing, so there is no body.
      if (code[bodyAt - 1] === '/') continue
      let depth = 1
      let i = bodyAt + 1
      while (i < code.length && depth > 0) {
        const nextOpen = code.indexOf(`<${name}`, i)
        const nextClose = code.indexOf(closes, i)
        if (nextClose === -1) break
        if (nextOpen !== -1 && nextOpen < nextClose) {
          depth += 1
          i = nextOpen + name.length + 1
          continue
        }
        depth -= 1
        i = nextClose + closes.length
      }
      out.push({ at: bodyAt + 1, end: i })
    }
  }
  return out
}

/** The words immediately before a position, which is what names the channel a string sits on. */
function channelOf(code: string, at: number, folds: readonly { at: number; end: number }[]): Channel {
  const before = code.slice(Math.max(0, at - 200), at)
  if (/\b(title|aria-label|alt|placeholder|detail)\s*=\s*\{?\s*$/.test(before)) return 'tooltip'
  // `detail=` only as a JSX attribute. `detail:` as an object key is something else entirely —
  // `api.ts` uses it for a fault's own sentence — and exempting that would hide a real site.
  if (/\b(title|placeholder)\s*:\s*$/.test(before)) return 'tooltip'
  if (/\b(meaning|opens)\s*=\s*\{?\s*$/.test(before)) return 'foldLabel'
  if (/\bthrow\b[^;]*$/.test(before)) return 'neverDrawn'
  if (/\bconsole\.\w+\([^)]*$/.test(before)) return 'neverDrawn'
  if (/px-sr[^<]*>[^<]*$/.test(before)) return 'offScreen'
  for (const fold of folds) if (at >= fold.at && at < fold.end) return 'foldBody'
  return null
}

/** Every sentence site in one file. */
export function sentencesIn(file: string, text: string): SentenceSite[] {
  const pieces = piecesOf(text)
  const code = withoutComments(text, pieces)
  const folds = foldBodies(code)
  const out: SentenceSite[] = []

  for (const piece of pieces) {
    if (piece.what !== 'string') continue
    if (!readsAsASentence(piece.body)) continue
    out.push({
      file,
      line: lineAt(text, piece.at),
      kind: 'literal',
      channel: channelOf(code, piece.at, folds),
      text: tidy(piece.body),
    })
  }

  // JSX text: what lies between a `>` and the next `<`, outside every string and comment.
  const covered = (at: number) => pieces.some((piece) => at >= piece.at && at < piece.end)
  for (let i = 0; i < code.length; i += 1) {
    if (code[i] !== '>' || covered(i)) continue
    const stop = code.indexOf('<', i + 1)
    if (stop === -1) break
    const run = code.slice(i + 1, stop)
    if (run.includes('>')) continue
    if (!readsAsASentence(run)) continue
    if (covered(i + 1)) continue
    out.push({
      file,
      line: lineAt(text, i + 1),
      kind: 'jsx',
      channel: channelOf(code, i + 1, folds),
      text: tidy(run),
    })
  }

  return out.sort((a, b) => a.line - b.line || a.text.localeCompare(b.text))
}

/**
 * SENTENCES A FILE DRAWS FROM THE WORD LISTS, NAMED BY THEIR KEYS, because the source scanner cannot
 * see a sentence that is read through `t`. Each key must still be read by its file, and each word must
 * be a sentence as this scanner reads one; a plural word is held by its `other` form.
 *
 * ReviewBar.tsx's two were the only ones until wave 13k's round 29, and this was an `if` naming that
 * file. The questions a report asks the person (src/web/components/ReportQuestions.tsx) draw their
 * sentences from the word lists too, and the brief for that round asked for them to be named here.
 *
 * THE KEYS ARE READ FROM THE JOINED ENGLISH LIST (`englishWords`), so a wave's word kept in its own part
 * file is found as well as one in en.ts. A key is a plain string here, because
 * the part file that holds a new word is written in the code commit after this list names it; a key no
 * list holds is refused below as a word that is not a sentence.
 */
const SENTENCES_FROM_THE_WORD_LISTS: Readonly<Record<string, readonly string[]>> = {
  'components/ChapterEditor.tsx': [
    'chapterEdit.chineseDropped',
    'chapterEdit.none',
    'chapterEdit.readingShipped',
    'chapterEdit.fixProblems',
    'chapterEdit.valid',
    'chapterEdit.size',
    'chapterEdit.sizeNotMeasured',
    'chapterEdit.keepRecord',
    'chapterEdit.reason',
    'chapterEdit.applyNeeds',
    'chapterEdit.changed',
    'chapterEdit.rereadDone',
    'chapterEdit.missingOnRead',
    'chapterEdit.unchanged',
    'chapterEdit.noHistory',
    'chapterEdit.busy',
  ],
  'components/agent/ReviewBar.tsx': ['review.pane.projectIsElsewhere', 'review.pane.projectNotRecorded', 'review.b.changedNothingSent'],
  'components/ReportQuestions.tsx': [
    'rq.button.warning',
    'rq.button.sentAlready',
    'rq.submit.allSent',
    'rq.submit.nothingAnswered',
    'rq.onlyThePerson',
    'rq.notOnThisPage',
    // Round 30's count line. Its two other words, rq.count.notAnswered and rq.count.notSent, open
    // with the count, so this scanner does not read them as sentences and they are not named here.
    'rq.count.noneAnswered',
    'rq.count.allSent',
  ],
  // Round 45's. Their other words end in a placeholder or a colon, or open with the count, so this
  // scanner does not read them as sentences and they are not named here.
  'components/Chat.tsx': ['chatEnglish.remindMeLater.comesBack', 'review.b.changedNothingSent'],
  'components/OnePress.tsx': ['onePress.onlyThePerson', 'onePress.refused'],
  'components/Sidebar.tsx': ['pluginPage.sidebarFailed'],
  // Wave 13x round 22 (problem 6yMD5gal_oXz): the comment box while a review collects what the comment is about. Its
  // other new words, the two presses, their titles and the two labels of an error note, are not sentences to this
  // scanner, or are titles.
  'components/agent/TalkBox.tsx': ['talk.stillReadingTheReviews', 'talk.state.addedToTheReview', 'talk.state.noReviewHoldsIt'],
  // Wave 13p round M8UvviWBU-IS, item 2 (problem gYWdWJQcxyuZ): an entry a bus passed over because it is tested alone.
  // The page's earlier words were written before COMMON.md asked for each new sentence to be named, and are not named here.
  'pages/MergeQueuePage.tsx': ['mergeQueuePage.row.passedAlone', 'mergeQueuePage.row.behindTestedAlone', 'mergeQueuePage.bus.passedAlone'],
  // Wave 13r: the notice on a setting whose saved value this release refuses. The reason beside it is the server's
  // own sentence, drawn through `content`, so this scanner cannot read it and it is not named here. Round 16: the lines
  // on a read-only setting that a tool reads, or that Vite reads. Round 18: the lines on the 14 read-only settings
  // round 16 did not place.
  'components/OfficeControls.tsx': ['runtimeSettings.storedRefused', 'runtimeSettings.storedRefusedShipped', 'runtimeSettings.aTool', 'runtimeSettings.webDevelopmentServer',
    'runtimeSettings.officeStart', 'runtimeSettings.firstOwner', 'runtimeSettings.setByTheStarter', 'runtimeSettings.setForARun', 'runtimeSettings.mergeTool'],
  // Wave 13r: the warning on an added card whose reports-to words name nobody the office knows.
  'pages/RolesPage.tsx': ['addedRoles.reportsToNamesNobody'],
  // Wave 13y round 85: a pipeline wall's sentence when it stands at a block that is no step of the pipeline. Its other
  // word, "a step that is not in this pipeline", is part of a sentence and not a sentence to this scanner.
  'components/graph/model.ts': ['graph.wall.standsAtAStepNotInThisPipeline'],
}

/** Every sentence site in the browser code, in file order. */
export function everySentenceSite(): SentenceSite[] {
  const out: SentenceSite[] = []
  for (const file of webFiles()) {
    const source = readFileSync(join(WEB, file), 'utf8')
    out.push(...sentencesIn(file, source))
    const keys = SENTENCES_FROM_THE_WORD_LISTS[file]
    if (keys !== undefined) {
      // These sentences come from shared word keys, so the source scanner cannot see their text.
      for (const key of keys) {
        const call = new RegExp(`\\bt\\(['"]${key.replace(/\./g, '\\.')}['"]`).exec(source)
        if (call === null) throw new Error(`${file} no longer draws the translated sentence ${key}.`)
        const word: unknown = (englishWords() as Record<string, unknown>)[key]
        const text = typeof word === 'string' ? word : (word as { other?: unknown } | undefined)?.other
        if (typeof text !== 'string' || !readsAsASentence(text)) {
          throw new Error(`The English word ${key} is not a sentence this gate can read.`)
        }
        out.push({
          file,
          line: lineAt(source, call.index),
          kind: 'literal',
          channel: null,
          text: tidy(text),
        })
      }
    }
  }
  return out
}

/** Ordinary use: the sentence sites that sit on no named allowance. */
export function ordinaryUse(sites: readonly SentenceSite[]): SentenceSite[] {
  return sites.filter((site) => site.channel === null)
}

/**
 * Does any string literal hold a `<Explain` or `<StandingNote`?
 *
 * If one did, the fold-body scan above would match a tag that is not a tag and exempt a region
 * that is not a body. This is the check that says none does, and it is asserted by the gate.
 */
export function explainInsideAString(): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = []
  for (const file of webFiles()) {
    const text = readFileSync(join(WEB, file), 'utf8')
    for (const piece of piecesOf(text)) {
      if (piece.what !== 'string') continue
      if (/<\/?(Explain|StandingNote)\b/.test(piece.body)) out.push({ file, text: tidy(piece.body).slice(0, 80) })
    }
  }
  return out
}
