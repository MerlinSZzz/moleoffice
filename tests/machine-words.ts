// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE A STORED WORD CAN STILL REACH PROSE, FOUND BY READING THE SOURCE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS, AND HOW TO RUN IT
 * ---------------------------------------------------------------------------------------
 *
 * Mole Office stores machine words — `worked_around`, `derived_from`, `wanna_try`, `human` — and prints
 * reader's words for them. `src/shared/words.ts` is the one table of readings. This module finds
 * every place under `src/` where a stored word can get onto a screen WITHOUT passing through that
 * table. It is the instrument behind `tests/the-machine-word-gate.test.ts`, and it is also the
 * counting script:
 *
 *     npx tsx tests/machine-words.ts
 *
 * It prints the two counts and exits 0. IT IS COMMITTED SO THE NUMBER CAN BE RE-RUN. The sweep that
 * found "239 places, 222 of them on a screen" lived in `/tmp` and is gone, so its 239 cannot be
 * checked, compared or reproduced by anybody. A count nobody can re-run is not a count.
 *
 * It reads text, not a syntax tree, for the reason `tests/sentences.ts` gives: the TypeScript
 * package here ships a compiler binary and no JavaScript parser API. It borrows that file's
 * tokeniser rather than writing a second one.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO KINDS OF SITE, AND WHY THEY ARE COUNTED APART
 * ---------------------------------------------------------------------------------------
 *
 * 1. A RAW WORD IN DRAWN TEXT — `raw`. The machine word is written out, in a string or in a run of
 *    JSX text that a person reads. `<span>worked_around</span>`. This one is a defect on sight, so
 *    the gate holds it at zero and there is no allowlist for it.
 *
 * 2. AN UNREAD VALUE REACHING DRAWN TEXT — `unread`. A value is interpolated into drawn text and
 *    nothing on the line asks the table what to print: `{record.kind}`, `` `linked (${change.field})` ``.
 *    Whether a given one is a defect depends on the value, which a text scanner cannot know — a
 *    kind is always a stored word, a `.type` is often not. So these are WRITTEN DOWN BY NAME in
 *    `tests/machine-word-allowlist.json`, as the sentence gate, a test deleted on 12 November
 *    2026, wrote down its sentences, and a NEW one fails the build.
 *
 * THE SECOND NUMBER IS A COUNT OF PLACES A STORED WORD COULD REACH PROSE, NOT A COUNT OF FAULTS.
 * Saying otherwise is how the last sweep's 239 got read as 239 bugs.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH STORED WORDS THE RAW RULE LOOKS FOR, AND WHICH IT CANNOT
 * ---------------------------------------------------------------------------------------
 *
 * ONLY THE ONES THAT CANNOT BE MISTAKEN FOR ENGLISH: a stored word holding an underscore, plus
 * `todo`, which is not a word. `worked_around`, `derived_from`, `relates_to`, `part_of`,
 * `wanna_try`, `stopping_point`, `picked_up`, `not_started`, `in_flight`, `stopped_short`,
 * `observed_write`, `build_graph`, `launch_config`.
 *
 * `human`, `system`, `block`, `annotation`, `idle` and `queued` are stored words with different
 * readings too, and this rule DELIBERATELY does not look for them. Every one of them is also an
 * ordinary English word that appears in this product's prose meaning something else — "the system
 * refused", "a block of the report" — and a scanner that reads text cannot tell those apart. They
 * are not unguarded: they reach a screen through a value, which is rule 2's job, and the rendered
 * check in `tests/the-machine-word-gate.test.ts` reads what a component actually drew.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS EXEMPT FROM THE RAW RULE, AND ON WHOSE AUTHORITY
 * ---------------------------------------------------------------------------------------
 *
 *   `title=`, `aria-label=`, `alt=`, `placeholder=`   Contract 8.10.2's tooltip channel. NAMING THE
 *                                                     STORED WORD THERE IS THE POINT: the state
 *                                                     chip's own tooltip says *The stored state
 *                                                     word is "worked_around"*, which is the
 *                                                     product telling the truth about its data.
 *   inside `throw` or `console.`                      never drawn on any screen.
 *   a stylesheet                                      `[data-progress='in_flight']` is a selector.
 *                                                     Told by the literal holding a `{` and a `;`.
 *   a quoted key with no other words in it            `'worked_around'` on its own is a comparison
 *                                                     or an object key, not prose. A literal has to
 *                                                     hold whitespace to count as drawn text.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH VOCABULARIES THIS FILE KNOWS, AND WHY THE LIST IS NOT FIVE
 * ---------------------------------------------------------------------------------------
 *
 * `everyStoredWord` reads SIX vocabularies: kinds, states, actor types, link types, progress words
 * and the implementation map's nine provenance sources. The sixth was added on 26 August 2026
 * because a verifier proved the gate could not see it.
 *
 * THE HOLE, EXACTLY. A provenance value does not reach a screen as a literal. It is stored in a
 * column, looked up in `PROVENANCE` in `src/shared/implementation.ts`, and drawn as whatever the
 * `reading` field on that row says. So replacing one row's reading with its own stored token —
 * `reading: 'files seen changing'` becoming `reading: 'observed_write'` — puts `observed_write` on
 * a Normal-mode screen with no literal anywhere for the raw rule to find. The verifier made that
 * exact change and `tests/the-machine-word-gate.test.ts` stayed at 22 of 22 green.
 *
 * WHAT CLOSES IT. The gate's own check that no reading still holds an underscore reads whatever
 * `everyStoredWord` returns, so a vocabulary in that list is a vocabulary the gate can see through
 * its lookup table. Adding the nine sources to the list is the whole fix; the check was already
 * written and was already right. It now reddens on that mutation, naming the row.
 *
 * A VOCABULARY THAT IS NOT IN THAT LIST IS STILL INVISIBLE HERE, and that is worth saying out loud
 * rather than leaving to be discovered a third time. `relations` and `authorities`, declared beside
 * the nine sources, are deliberately absent: every one of their stored words is an ordinary English
 * word a person says about code — `implements`, `tests`, `stated`, `guessed` — so the raw rule
 * could not tell them from prose, and their readings ARE their stored words by design, which the
 * underscore check would not fault and no check here should.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS SCANNER CANNOT SEE
 * ---------------------------------------------------------------------------------------
 *
 * 1. A word that arrives from the server in a field this list does not name.
 * 2. A word reaching the screen through a helper — `shownState(x)` reads as a reading call here
 *    even if the helper hands the stored word back. That fall-through is what turned `worked_around`
 *    into a chip for five waves, and no source scan can see it. `tests/the-machine-word-gate.test.ts`
 *    covers it by asking the readings themselves whether any of them ever answers with its input.
 * 3. A stored word that reads as ordinary English — see the section above.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { PROVENANCES } from '../src/shared/implementation.ts'
import { RECORD_KINDS, ACTOR_TYPES, LINK_TYPES } from '../src/shared/types.ts'
import { PROGRESS, STATE_MEANING } from '../src/shared/work.ts'
import {
  actorTypeWord,
  kindWord,
  linkWord,
  progressWord,
  provenanceWord,
  stateWord,
} from '../src/shared/words.ts'
import { lineAt, piecesOf, tidy, withoutComments } from './sentences.ts'

const SRC = fileURLToPath(new URL('../src', import.meta.url))

/** Which of Mole Office's six vocabularies a stored word belongs to. */
export type Vocabulary = 'kind' | 'state' | 'actor' | 'link' | 'progress' | 'provenance'

/** One stored word, the vocabulary it is in, and what the one table says to print for it. */
export interface StoredWord {
  stored: string
  vocabulary: Vocabulary
  reading: string
}

/**
 * Every stored word in the product, read out of the shared declarations rather than listed here.
 *
 * A new kind, state, actor type, link type, progress word or provenance source joins this list by
 * being declared, so the gate cannot fall behind the vocabulary it guards.
 *
 * THE NINE PROVENANCE SOURCES ARE HERE BECAUSE THEY REACH A SCREEN THROUGH A LOOKUP TABLE and not
 * as a literal. See the section on the six vocabularies at the head of this file for the mutation
 * that proved the gate blind to them.
 */
export function everyStoredWord(): StoredWord[] {
  const out: StoredWord[] = []
  for (const kind of RECORD_KINDS) out.push({ stored: kind, vocabulary: 'kind', reading: kindWord(kind).text })
  for (const provenance of PROVENANCES) {
    out.push({ stored: provenance, vocabulary: 'provenance', reading: provenanceWord(provenance).text })
  }
  for (const state of Object.keys(STATE_MEANING)) {
    out.push({ stored: state, vocabulary: 'state', reading: stateWord(state).text })
  }
  for (const actor of ACTOR_TYPES) out.push({ stored: actor, vocabulary: 'actor', reading: actorTypeWord(actor).text })
  for (const link of Object.keys(LINK_TYPES)) {
    out.push({ stored: link, vocabulary: 'link', reading: linkWord(link, 'forward').text })
  }
  for (const progress of PROGRESS) {
    out.push({ stored: progress, vocabulary: 'progress', reading: progressWord(progress).text })
  }
  return out
}

/**
 * The stored words the raw rule hunts for: the ones no reader could mistake for English.
 *
 * An underscore, or `todo`. See the header for why `human`, `block` and their like are left to
 * rule 2 and to the rendered check.
 */
export function unmistakableMachineWords(): string[] {
  const out = new Set<string>()
  for (const word of everyStoredWord()) {
    if (word.stored.includes('_') || word.stored === 'todo') out.add(word.stored)
  }
  return [...out].sort()
}

/** Every tracked source file under `src/`, as a path relative to `src/`. */
export function sourceFiles(dir = SRC): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.tsx?$/.test(entry)) out.push(relative(SRC, full))
  }
  return out.sort()
}

/** One place a stored word can reach prose. */
export interface WordSite {
  /** Path under `src/`. */
  file: string
  /** Counted from 1, the way an editor counts. */
  line: number
  /** `raw` — the machine word is written out. `unread` — a value reaches drawn text unasked. */
  rule: 'raw' | 'unread'
  /** For a `raw` site, the stored word found. For an `unread` site, the expression. */
  found: string
  /** The surrounding text, whitespace collapsed, trimmed to something a person can read. */
  text: string
}

/**
 * The functions that ask the one table what to print. A line calling one is reading its value.
 *
 * `readerWord` WAS MISSING FROM THIS LIST UNTIL 26 AUGUST 2026, and it is the one `src/shared/words.ts`
 * documents as the general answer: *"readerWord at the foot of this file answers for a value from ANY
 * of those five, which is what a caller holding a `state` column needs"*. A line calling it was
 * therefore reported as a value reaching drawn text with nothing reading it — the gate flagging the
 * table itself. Found when the first server-composed text in this product called it.
 *
 * `nameOfRegion` AND `wordForRegion` JOINED IT ON 1 SEPTEMBER 2026. They are the one table of what
 * a part of a record is called — *the table*, *the gist*, *the section "Sources and history"* — and
 * `wordForRegion`'s own header says so. A line calling one has read the region rather than printed
 * a stored role, which is the opposite of what the gate reports it as.
 *
 * `whatAPartStandsFor` JOINED IT ON 3 SEPTEMBER 2026, for the reason `nameOfRegion` did. It takes a
 * record's stored kind and answers with the sentence naming the blocks one part of a by-part summary
 * stands for — built out of `namesOfParts`, which is the one thing in this product that says WHICH
 * part a part is. A line calling it has read the record rather than printed a stored kind, and
 * without it the gate reported `whatAPartStandsFor(drawn.root, drawn.kind, …)` as a kind reaching
 * the screen, which is the opposite of what that line does.
 *
 * `titleHere` JOINED IT ON 1 SEPTEMBER 2026 for the same reason. It takes a stored kind and a
 * section key and answers with `SectionSpec.title` — the name somebody wrote for that section — so a
 * panel heading drawn through it has read its values rather than printed them. Without it the gate
 * reported `titleHere(record.kind, SUMMARY_LINE_KEY)` as a stored kind reaching the screen, which is
 * the opposite of what that line does.
 *
 * `theCauseInWords` JOINED IT ON 12 SEPTEMBER 2026. It takes the stored cause a stopped run's
 * transcript recorded — `session-limit`, `quota`, `login` — and answers with the words a person
 * reads, "a session limit", "a quota", "a login", with "a reason nobody named" for anything else.
 * A sentence in `src/server/lib/answering.ts` that names a limit through it has read the cause
 * rather than printed the token, which is what criterion M126 requires.
 *
 * `t` JOINED IT ON 27 SEPTEMBER 2026, with the word lists of the interface build (report 7FEOshq3mBGG).
 * It takes a key of src/shared/words/en.ts and answers with the words in the reader's language, so an
 * expression that chooses a key by a stored value, `t(row.kind === 'person' ? 'x.person' : 'x.agent')`,
 * has read that value rather than printed it. A value passed INTO t's slots is still printed by t, so
 * the caller of a slot reads it first, as it would for any sentence.
 *
 * `changeOpWord` JOINED IT ON 30 SEPTEMBER 2026 (wave 13k, round 18). It takes the stored operation of
 * one change-log row — `create`, `update` — and answers with the words a person reads, or names a word
 * it does not know, so a run's own page that draws a change through it has read the operation.
 */
const READING_CALLS =
  /\b(t|readerWord|kindWord|changeOpWord|stateWord|actorTypeWord|linkWord|progressWord|familyWord|displayWord|fieldWords|shownState|withArticle|englishHeading|surfaceLabel|projectName|titleHere|nameOfRegion|wordForRegion|whatAPartStandsFor|participantWord|worldKindWord|worldStandingWord|theCauseInWords|packageSuitWord|packageStateWord|packageReturnFormWord)\s*\(/

/** A stylesheet in a template literal: it has a rule body, so it has a brace and a semicolon. */
function readsAsAStylesheet(body: string): boolean {
  return body.includes('{') && body.includes(';')
}

/** Whether the character on each side of a match is a boundary prose would put there. */
function standsAsAWord(text: string, at: number, end: number): boolean {
  const before = at === 0 ? ' ' : (text[at - 1] ?? ' ')
  const after = end >= text.length ? ' ' : (text[end] ?? ' ')
  return /[\s.,;:!?()]/.test(before) && /[\s.,;:!?()]/.test(after)
}

/**
 * The channels a stored word is allowed to be named in.
 *
 * Read from the 120 characters before the literal, the way the deleted sentence gate read its own.
 */
function inAnAllowedChannel(code: string, at: number): boolean {
  const before = code.slice(Math.max(0, at - 120), at)
  if (/\b(title|aria-label|alt|placeholder)\s*=\s*\{?\s*$/.test(before)) return true
  if (/\bconsole\.[a-z]+\(\s*$/.test(before)) return true
  if (/\bthrow\s+new\s+[A-Za-z]+\(\s*$/.test(before)) return true
  return false
}

/** The accessors that carry a stored word, and the bare names those values are given. */
const CARRIES_A_STORED_WORD =
  /(?:\.(kind|state|actorType|progress|linkType|family|field|op)\b|^\s*(kind|state|actorType|progress|linkType)\s*$)/

/** Anything that is plainly a query rather than a screen. */
const BUILDS_A_QUERY = /\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|json_extract)\b/

export function machineWordSitesIn(file: string, text: string): WordSite[] {
  const pieces = piecesOf(text)
  const code = withoutComments(text, pieces)
  const words = unmistakableMachineWords()
  const out: WordSite[] = []

  // ---- rule 1, in a quoted or templated string that reads as prose
  for (const piece of pieces) {
    if (piece.what !== 'string') continue
    if (!/\s/.test(piece.body)) continue
    if (readsAsAStylesheet(piece.body)) continue
    if (BUILDS_A_QUERY.test(piece.body)) continue
    if (inAnAllowedChannel(code, piece.at)) continue
    for (const word of words) {
      let from = 0
      for (;;) {
        const at = piece.body.indexOf(word, from)
        if (at === -1) break
        from = at + word.length
        if (!standsAsAWord(piece.body, at, at + word.length)) continue
        out.push({ file, line: lineAt(text, piece.at), rule: 'raw', found: word, text: tidy(piece.body).slice(0, 120) })
        break
      }
    }
  }

  // ---- rule 1, in a run of JSX text, which is drawn by definition
  //
  // ONLY IN A `.tsx` FILE, and only where the run holds nothing code holds. In a plain `.ts` file
  // every `=>` and every `Record<string, string>` ends in a `>`, so the run after it is the rest of
  // the declaration — which is how a first draft of this scanner reported the whole of KIND_WORDS
  // as drawn text. `readsAsASentence` protected the deleted sentence gate from the same thing; this
  // rule cannot use it, because one word is enough here.
  const covered = (at: number) => pieces.some((piece) => at >= piece.at && at < piece.end)
  for (let i = 0; file.endsWith('.tsx') && i < code.length; i += 1) {
    if (code[i] !== '>' || covered(i)) continue
    const stop = code.indexOf('<', i + 1)
    if (stop === -1) break
    const run = code.slice(i + 1, stop)
    if (run.includes('>') || run.trim() === '') continue
    if (/[{}()[\];=|&`'"$\\]/.test(run)) continue
    if (covered(i + 1)) continue
    for (const word of words) {
      const at = run.indexOf(word)
      if (at === -1 || !standsAsAWord(run, at, at + word.length)) continue
      out.push({ file, line: lineAt(text, i + 1), rule: 'raw', found: word, text: tidy(run).slice(0, 120) })
      break
    }
  }

  // ---- rule 2, a value reaching drawn text with nothing asking the table
  for (const found of everyPlaceAValueIsDrawn(code)) {
    const expression = found.expression.trim()
    if (!CARRIES_A_STORED_WORD.test(expression)) continue
    if (READING_CALLS.test(expression)) continue
    if (BUILDS_A_QUERY.test(expression)) continue
    out.push({
      file,
      line: lineAt(text, found.at),
      rule: 'unread',
      found: tidy(expression),
      text: tidy(found.around).slice(0, 120),
    })
  }

  return out.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule) || a.found.localeCompare(b.found))
}

/**
 * Every `${...}` in a template literal and every `{...}` standing as a JSX child.
 *
 * A JSX child is told from an ordinary block by its neighbours: the thing before it is a `>` or
 * another expression, and the thing after it is a `<` or another expression. That is what a run of
 * drawn text looks like and what a function body does not.
 */
function everyPlaceAValueIsDrawn(code: string): { at: number; expression: string; around: string }[] {
  const out: { at: number; expression: string; around: string }[] = []
  const pieces = piecesOf(code)

  for (const piece of pieces) {
    if (piece.what !== 'string') continue
    for (const found of piece.body.matchAll(/\$\{([^{}]*)\}/g)) {
      out.push({ at: piece.at, expression: found[1] ?? '', around: piece.body })
    }
  }

  const covered = (at: number) => pieces.some((piece) => at >= piece.at && at < piece.end)
  for (let i = 0; i < code.length; i += 1) {
    if (code[i] !== '{' || covered(i)) continue
    const stop = code.indexOf('}', i + 1)
    if (stop === -1) break
    const inner = code.slice(i + 1, stop)
    if (inner.includes('{')) continue
    const before = code.slice(0, i).trimEnd()
    const after = code.slice(stop + 1).trimStart()
    const opensAChild = before.endsWith('>') || before.endsWith('}')
    const closesAChild = after.startsWith('<') || after.startsWith('{')
    if (!opensAChild || !closesAChild) continue
    out.push({ at: i, expression: inner, around: code.slice(Math.max(0, i - 60), stop + 40) })
  }

  return out
}

/** Every site in the product's source, in file order. */
export function everyMachineWordSite(): WordSite[] {
  const out: WordSite[] = []
  for (const file of sourceFiles()) {
    out.push(...machineWordSitesIn(file, readFileSync(join(SRC, file), 'utf8')))
  }
  return out
}

// ============================================================ the counting script

const runDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(new URL(import.meta.url))

if (runDirectly) {
  const sites = everyMachineWordSite()
  const raw = sites.filter((site) => site.rule === 'raw')
  const unread = sites.filter((site) => site.rule === 'unread')
  const onAScreen = unread.filter((site) => site.file.startsWith('web/'))
  console.log(`stored words this scanner hunts for as raw text: ${unmistakableMachineWords().length}`)
  console.log(`raw stored words in drawn text:                  ${raw.length}`)
  for (const site of raw) console.log(`   src/${site.file}:${site.line}  ${site.found}  —  ${site.text}`)
  console.log(`places a stored word reaches prose unread:       ${unread.length}`)
  console.log(`   of those, in the browser:                     ${onAScreen.length}`)
  console.log(`   of those, on the server:                      ${unread.length - onAScreen.length}`)
  console.log(
    `distinct allowlist keys:                         ${new Set(unread.map((site) => `${site.file}:${site.found}`)).size}`,
  )
}
