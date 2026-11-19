// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RULES TEXT AN AGENT READS, BUILT FROM THE SOURCES IN ONE CHECKOUT, and how big it may be.
 *
 * src/worker/rules.ts writes the rules file a run's tool reads, and its header says why there is one
 * writer and which sources it reads. The part of it that reads those sources and builds the text is
 * here, in src/shared, because src/shared/chapter-check.ts measures the rules file a proposed chapter
 * would make (`rulesTextsFrom`, `rulesSize`, `aRulesSourceMissingFrom`), and a shared file may not
 * import a worker file. src/worker/rules.ts exports every name below again, so its importers are
 * unchanged.
 *
 * THIS FILE AND src/shared/chapter-check.ts IMPORT EACH OTHER. `chaptersFrom` here checks each chapter
 * with the chapter check, and the chapter check measures with the functions here. Neither uses the
 * other while it loads, only when one of its functions is called, so either may load first.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { chaptersInTheStandingLoad, type OfficeChapter } from './office-rules.ts'
import type { SelectedChapter } from './chapter-edit.ts'
import { contentOfChapter, problemsWithAChapter, SHIPPED_CHAPTER_NUMBERS } from './chapter-check.ts'
import { clockStamp } from './time.ts'
import { enWave13r } from './words/en-wave-13r.ts'
import { sayInEnglish } from './i18n.ts'
import { isTheDeveloperFile } from '../config/the-developer-file.mjs'

/** Which file in the working directory a tool reads its rules from. src/worker/runtimes/adapter.ts exports it again. */
export type RulesFile = 'CLAUDE.md' | 'AGENTS.md'

/** Where the two sources are, under a checkout. */
export const RULES_SOURCE = 'CLAUDE.md'
export const SKILL_SOURCE = join('.claude', 'skills', 'mole-office', 'SKILL.md')

/**
 * WHERE THE CHAPTERS OF THE CODE OF LAW ARE, under a checkout.
 *
 * A chapter is a record in Mole Office and that record is the only authority (decision
 * `JC_raqC0fRCh`). `tools/rules-chapters.mjs` reads the office selection and writes this file, the way
 * src/worker/rules.ts writes `AGENTS.md` from `CLAUDE.md`. Offline checks read the last export. At a run
 * start the worker must ask the office for selected content and pass it to this writer; an
 * unavailable office stops that start, rather than replacing its chapters with this export.
 */
export const CHAPTERS_SOURCE = join('src', 'config', 'rules', 'chapters.json')

/**
 * THE USER PART OF THE RULES, under a checkout, at wave 13s round 15.
 *
 * `CLAUDE.md` was written for the agents that develop the office. The lines in it that any agent
 * working in an office needs — the invariants, how to start, the safety rules, where finished
 * writing goes — are this file, and `CLAUDE.md` reads it by the reference under its heading, which
 * is how Claude Code imports a file. The installer carries this file and not `CLAUDE.md`, so this
 * file has a heading of its own: `CLAUDE.md`'s heading is how src/config/the-developer-file.mjs
 * knows the developer file, and a part for users must not start with it. It lives in
 * src/config/rules/, and scripts/bundle.mjs copies it, with default-regulations.json and nothing else
 * from that folder, to the same path under the install's root, where an installation's rules are
 * written from it.
 */
export const USER_PART_SOURCE = join('src', 'config', 'rules', 'USER.md')

/** The line in `CLAUDE.md` that reads the user part, written as Claude Code imports a file. */
export const USER_PART_REFERENCE = '@src/config/rules/USER.md'

/**
 * `CLAUDE.md` AS AN AGENT READS IT: the reference to the user part replaced by the user part.
 *
 * Claude Code follows the reference itself. Codex and OpenCode do not, so `AGENTS.md` is written
 * from this. A `CLAUDE.md` without the reference, or a checkout without the file, stops the
 * generator: a rules file without the user part would hold less than it should and say nothing.
 */
export function withTheUserPart(rules: string, checkout: string): string {
  const lines = rules.split('\n')
  const at = lines.findIndex((line) => line.trim() === USER_PART_REFERENCE)
  if (at === -1) {
    throw new Error(
      `${RULES_SOURCE} has no line ${USER_PART_REFERENCE}, which is where it reads the user part of the rules. ` +
        'No rules file was written.',
    )
  }
  lines.splice(at, 1, theUserPart(checkout))
  return lines.join('\n')
}

/** The user part as it is written, or a throw naming the file. */
function theUserPart(checkout: string): string {
  const path = join(checkout, USER_PART_SOURCE)
  if (!existsSync(path)) {
    throw new Error(`${path} is not there, and it is the user part of the rules. No rules file was written.`)
  }
  return readFileSync(path, 'utf8').trimEnd()
}

/**
 * WHETHER A CHECKOUT HOLDS THE DEVELOPER RULES: its `CLAUDE.md` is the developer file, by the one test
 * src/config/the-developer-file.mjs holds, which the installer uses to keep that file out. Every other
 * folder is read as an installation, including one holding a `CLAUDE.md` the office wrote there.
 */
export function holdsTheDeveloperRules(checkout: string): boolean {
  const path = join(checkout, RULES_SOURCE)
  return existsSync(path) && isTheDeveloperFile(path)
}

/**
 * THE TWO MARKERS IN `CLAUDE.md` THAT SAY WHERE THE POINTER LINES GO.
 *
 * Criterion C4: each pointer line is the chapter's own Conclusion, read from the chapter and not
 * typed into the general file. So `CLAUDE.md` holds the block between these markers, and everything
 * that generates a rules file replaces what is between them with the lines built from the chapters.
 * Change a chapter's Conclusion and the generated file changes without anybody editing `CLAUDE.md`.
 */
export const CHAPTERS_START = '<!-- chapters:start -->'
export const CHAPTERS_END = '<!-- chapters:end -->'

/** What the exporter writes, and what everything downstream reads. */
export interface CodeOfLaw {
  generatedBy: string
  from: string
  at: string
  chapters: OfficeChapter[]
  /** Provenance for a selected export, including records not used and chapter numbers the office does not hold. */
  selection?: Pick<SelectedChapter, 'n' | 'inUse' | 'notUsed'>[]
}

/**
 * THE CHAPTERS, READ OUT OF THE CHECKOUT.
 *
 * It throws when the file is missing, unreadable or the wrong shape, for the reason every other
 * throw in this module exists: a run given half the rules is worse than a run that did not start,
 * and a rules file with an empty chapter list would look exactly like a project that has no
 * chapters.
 * The loader checks chapter structure. The file those chapters make up is measured where it is
 * assembled, with rulesSize; the diagnostic must be able to report an oversized assembled file.
 */
export function chaptersFrom(checkout: string): OfficeChapter[] {
  const path = join(checkout, CHAPTERS_SOURCE)
  if (!existsSync(path)) {
    throw new Error(
      `${path} is not there, and it is where the chapters of the office regulations come from. Run ` +
        '`node tools/rules-chapters.mjs` against the API that holds them. No rules file was written and no ' +
        'run was started.',
    )
  }
  let held: unknown
  try {
    held = JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    throw new Error(`${path} is not readable as JSON: ${(err as Error).message}. No rules file was written.`)
  }
  const chapters = (held as CodeOfLaw | null)?.chapters
  if (!Array.isArray(chapters) || chapters.length === 0) {
    throw new Error(`${path} holds no chapters, so the general file would point at nothing. No rules file was written.`)
  }
  for (const chapter of chapters) {
    const missing = (['label', 'title', 'conclusion', 'id'] as const).filter((key) => {
      const value = chapter[key]
      return typeof value !== 'string' || value.trim() === ''
    })
    if (missing.length > 0 || !Array.isArray(chapter.outline)) {
      throw new Error(
        `${path} holds a chapter that is missing ${[...missing, ...(Array.isArray(chapter.outline) ? [] : ['outline'])].join(', ')}. ` +
          'Export it again from the records. No rules file was written.',
      )
    }
  }
  const selection = (held as CodeOfLaw | null)?.selection
  // The selected numbers are the shipped ones and the role chapters', as the export tool and the chapter
  // door check them. An export with no selection is the older shape and holds the shipped numbers only.
  let selectedNumbers: readonly number[] = SHIPPED_CHAPTER_NUMBERS
  if (selection !== undefined) {
    const eachIsAChapterNumber = (one: unknown) => typeof one === 'object' && one !== null && Number.isInteger((one as { n?: unknown }).n)
    if (!Array.isArray(selection) || !selection.every(eachIsAChapterNumber)) {
      throw new Error(`${path} holds a selection that is not a list of chapter numbers. Export it again from the records. No rules file was written.`)
    }
    selectedNumbers = selection.map((one) => one.n)
  }
  for (const chapter of chapters) {
    const problems = problemsWithAChapter(chapter.n, contentOfChapter(chapter), chapters, checkout, undefined, false, selectedNumbers)
    if (problems.length > 0) throw new Error(`${path}: ${problems.join(' ')} No rules file was written.`)
  }
  return [...chapters].sort((a, b) => a.n - b.n)
}

/**
 * THE POINTER LINES THE GENERAL FILE CARRIES: one per shared chapter, each one its Conclusion.
 *
 * An agent starts with short content and a short pointer to where in the regulations it looks up the rule
 * for a particular job. So the line says
 * what the chapter governs and when to read it, and nothing else — the rules themselves are in the
 * chapter, which is read when the work touches the subject.
 *
 * THE BLOCK IS NEVER SILENT (wave 13r round 16, message OoYgv9KoG_v8). After the pointers comes
 * CODE.md's own line for each shipped number the chapters do not hold. When every chapter held is marked
 * for a role, so that no pointer is written, one sentence from the words file says so first.
 */
export function chapterPointerBlock(chapters: OfficeChapter[]): string {
  const shared = chaptersInTheStandingLoad(chapters)
  const held = new Set(chapters.map((chapter) => chapter.n))
  return [
    ...shared.map((chapter) => `- **${chapter.label}** — ${chapter.conclusion}`),
    ...(shared.length === 0 && chapters.length > 0 ? [`- ${enWave13r['rulesFile.everyChapterIsForARole']}`] : []),
    ...SHIPPED_CHAPTER_NUMBERS.filter((n) => !held.has(n)).map((n) => `- ${theOfficeHoldsNoChapter(n)}`),
  ].join('\n')
}

/**
 * WHAT GOES BETWEEN THE CHAPTER MARKERS: the pointer lines, then one line naming the chapters marked for a
 * role, when the chapters hold any. Such a chapter has no pointer line, so without this line nothing in the
 * general file would say it exists. The numbers are read from the chapters.
 *
 * THE LINE IS NOT ONE OF THE POINTER LINES. C9 keeps those under 1,400 bytes, and it measures
 * `chapterPointerBlock` alone, so the role chapters' line does not count against that limit.
 */
export function chapterBlockWithTheRoleLine(chapters: OfficeChapter[]): string {
  const shared = new Set(chaptersInTheStandingLoad(chapters))
  const numbers = chapters.filter((chapter) => !shared.has(chapter)).map((chapter) => chapter.n).sort((a, b) => a - b)
  const block = chapterPointerBlock(chapters)
  if (numbers.length === 0) return block
  const line = sayInEnglish('rulesFile.roleChapters', { n: numbers.length, numbers: numbers.map(String).join(sayInEnglish('sentence.listGap')) })
  return `${block}\n\n${line}`
}

/** What CODE.md and the chapter block both say of a shipped chapter number the office does not hold. */
export function theOfficeHoldsNoChapter(n: number): string {
  return `This office holds no chapter ${String(n)}. It was not exported.`
}

/**
 * `CLAUDE.md` WITH THE POINTER LINES PUT BACK IN, from the chapters.
 *
 * The markers have to be there. A `CLAUDE.md` with no chapter block is a general file that points at
 * no chapters at all, which is the state this design replaced, so it stops the generator rather than
 * writing a file that quietly holds less than it should.
 */
export function withChapterPointers(rules: string, chapters: OfficeChapter[]): string {
  const start = rules.indexOf(CHAPTERS_START)
  const end = rules.indexOf(CHAPTERS_END)
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `${RULES_SOURCE} has no chapter block: it is the lines between ${CHAPTERS_START} and ${CHAPTERS_END}, ` +
        'and they are where the pointer to every chapter of the office regulations goes. No rules file was written.',
    )
  }
  const before = rules.slice(0, start + CHAPTERS_START.length)
  const after = rules.slice(end)
  return `${before}\n\n${chapterBlockWithTheRoleLine(chapters)}\n\n${after}`
}

/**
 * THE ONE PLACE THAT SAYS HOW TO TAKE SOMEBODY TO A PAGE, by its exact heading.
 *
 * Criterion M23: *the worker's prompt and the skill say how, in one place*. This is that place, and
 * the skill is the source. The prompt every run is given reads this section out of the skill —
 * `howToLead` in src/worker/rules.ts — and the generated `AGENTS.md` carries it too, because it is in the list of
 * sections beneath. Neither holds a copy of the words.
 *
 * THE PROMPT NEEDS IT EVEN THOUGH THE RULES FILE HAS IT. In a developer checkout a Claude Code run
 * reads `CLAUDE.md` from the working directory, which is this repository's own file and does not
 * carry the skill's sections; whether it also loads the skill depends on a link outside the checkout
 * that git cannot carry, and CLAUDE.md's own account of that link says an agent cannot tell when it
 * is missing. In an installation the `CLAUDE.md` the office writes does carry them, but a run there
 * starts without it where another `CLAUDE.md` is in the folder or the folder cannot be written
 * (`writeRulesInto`). The prompt is the one thing every runtime gets whatever else it reads.
 */
export const HOW_TO_LEAD = '## When somebody asks you to take them to a page'

/**
 * The skill sections every agent gets, by their exact headings.
 *
 * These four and no more: what an agent may never do, how to write for a person, what to do with a
 * choice that is not an agent's to make, and how to take somebody to a page when they ask. The rest
 * of the skill is about shapes, and shapes come from `GET /api/kinds` rather than from any document.
 */
export const SKILL_SECTIONS = [
  '## Non-negotiable operating rules',
  '## Write in plain language. This is a rule, not a preference.',
  '## Decide what you can, and report after',
  HOW_TO_LEAD,
  '## How a message is handed to you',
] as const

/** The first line of a generated file, so nobody edits one thinking it is a source. */
export const GENERATED_HEADER =
  '<!-- Written by src/worker/rules.ts from CLAUDE.md and the Mole Office skill. Do not edit it: ' +
  'edit those, and the next run rewrites this. -->'

/**
 * THE FIRST LINE OF A RULES FILE THE OFFICE WRITES IN AN INSTALLATION, which has no `CLAUDE.md` to
 * name as a source. `AGENTS.md` starts with this line. The `CLAUDE.md` written there starts with
 * THE_OFFICES_MARK, the time it was written and the rest of this line (`theMarkedRulesText`).
 */
const WRITTEN_BY_THE_OFFICE = '<!-- Written by Mole Office'
const FROM_THE_INSTALLED_SOURCES =
  ' from the rules for every agent, the chapters of the office regulations and the Mole Office skill. ' +
  'Do not edit it: the next run rewrites it. -->'
export const GENERATED_HEADER_IN_AN_INSTALLATION = `${WRITTEN_BY_THE_OFFICE}${FROM_THE_INSTALLED_SOURCES}`

/**
 * THE MARK ON A `CLAUDE.md` THE OFFICE WROTE: how its first line starts, before the time.
 *
 * Message TxINgmO9H6gu, its first condition: the office never overwrites a `CLAUDE.md` it did not
 * write, so it marks the one it writes and rewrites only a file whose first line carries this. A
 * person's own `CLAUDE.md` in the folder is left as it is, and the run starts without the general
 * rules and is told so.
 */
export const THE_OFFICES_MARK = `${WRITTEN_BY_THE_OFFICE} at `


/**
 * THE SIZE ABOVE WHICH CODEX READS NONE OF THE RULES, and how much room this project keeps under it.
 *
 * Codex 0.147.0 reads a project document only up to `project_doc_max_bytes`, 32,768 by default, and
 * drops the whole file above that without saying anything — so a run gets no rules at all and looks
 * exactly like a run that got them. The limit lived in a comment in src/worker/rules.ts and in a number typed into one
 * test, which is two places for one fact; problem `2zwQE7ONqg9h` is that nothing enforced it.
 *
 * The headroom is 512 bytes, and it is what makes the check useful rather than a tripwire that fires
 * after the damage: a file that is 100 bytes under the limit is one paragraph away from silence.
 */
export const CODEX_PROJECT_DOC_MAX_BYTES = 32_768
export const RULES_BYTES_HEADROOM = 512

/** What a generated rules file weighs, and whether that is safe. */
export interface RulesSize {
  bytes: number
  limit: number
  headroom: number
  /** How many bytes may still be added before the check fails. Negative when it already has. */
  room: number
  /** True when the file is at or above `limit - headroom`. */
  tooBig: boolean
  /** One sentence saying where it stands, in plain words, for a log or a failure message. */
  sentence: string
}

/** How big a generated rules file is, against the limit and the headroom. */
export function rulesSize(text: string): RulesSize {
  const bytes = Buffer.byteLength(text, 'utf8')
  const safe = CODEX_PROJECT_DOC_MAX_BYTES - RULES_BYTES_HEADROOM
  const room = safe - bytes
  return {
    bytes,
    limit: CODEX_PROJECT_DOC_MAX_BYTES,
    headroom: RULES_BYTES_HEADROOM,
    room,
    tooBig: bytes >= safe,
    sentence:
      room > 0
        ? `The generated rules file is ${String(bytes)} bytes, ${String(room)} under the point where this check ` +
          `fails and ${String(CODEX_PROJECT_DOC_MAX_BYTES - bytes)} under the ${String(CODEX_PROJECT_DOC_MAX_BYTES)} ` +
          'bytes at which Codex silently drops a project document.'
        : `The generated rules file is ${String(bytes)} bytes, which is ${String(-room)} bytes over the ` +
          `${String(safe)} this project keeps to — ${String(RULES_BYTES_HEADROOM)} bytes of headroom under the ` +
          `${String(CODEX_PROJECT_DOC_MAX_BYTES)} at which Codex reads none of it and says nothing. Shorten ` +
          'CLAUDE.md, move a rule into its chapter, or shorten one of the skill sections named in this file.',
  }
}

/** One section of a markdown document, from its heading to the next heading of the same depth. */
export function sectionOf(document: string, heading: string): string | null {
  const start = document.indexOf(`\n${heading}\n`)
  if (start === -1) return null
  const after = start + 1
  const depth = heading.split(' ')[0]?.length ?? 2
  const rest = document.slice(after + heading.length)
  const next = rest.search(new RegExp(`\\n#{1,${String(depth)}} `))
  return (heading + (next === -1 ? rest : rest.slice(0, next))).trimEnd()
}

/**
 * The rules text, built from the sources in one checkout, in the shape that checkout holds.
 *
 * A developer checkout gives `CLAUDE.md` with the user part and the chapter pointer lines put in. An
 * installation gives the user part as it is written, then a part for the chapters: a heading, the
 * door the chapters are read through, and the pointer lines. Both go on with the skill's sections.
 *
 * It throws when a source is missing or a heading has moved. A run given half the rules is worse
 * than a run that did not start: nothing would say which half it was working without.
 */
export function rulesTextFrom(checkout: string, chapters?: OfficeChapter[]): string {
  const parts = holdsTheDeveloperRules(checkout)
    ? [
        GENERATED_HEADER,
        '',
        withTheUserPart(
          withChapterPointers(readFileSync(join(checkout, RULES_SOURCE), 'utf8').trimEnd(), chapters ?? chaptersFrom(checkout)),
          checkout,
        ),
      ]
    : [
        GENERATED_HEADER_IN_AN_INSTALLATION,
        '',
        theUserPart(checkout),
        '',
        '## The chapters of the office regulations',
        '',
        // AN INSTALLATION CARRIES NO EXPORT OF THE CHAPTERS, no CODE.md and no chapters.json
        // (scripts/bundle.mjs), so this line names the door that answers them.
        'Read the chapter your work touches through `GET /api/office-regulations/chapters`, before you do the thing it governs.',
        '',
        chapterBlockWithTheRoleLine(chapters ?? chaptersFrom(checkout)),
      ]
  const skillPath = join(checkout, SKILL_SOURCE)
  if (!existsSync(skillPath)) {
    throw new Error(
      `${skillPath} is not there, so the rules for writing into Mole Office cannot be included. No rules ` +
        'file was written and no run was started.',
    )
  }
  const skill = readFileSync(skillPath, 'utf8')
  parts.push('', '# Writing into Mole Office', '')
  for (const heading of SKILL_SECTIONS) {
    const section = sectionOf(skill, heading)
    if (section === null) {
      throw new Error(
        `The Mole Office skill no longer has a section headed "${heading}", which is one of the sections every ` +
          `agent is given. Fix ${SKILL_SOURCE} or the list in src/shared/rules-text.ts. No rules file was written.`,
      )
    }
    parts.push(section, '')
  }
  return `${parts.join('\n').trimEnd()}\n`
}

/**
 * THE `CLAUDE.md` THE OFFICE WRITES IN AN INSTALLATION: the installed text, whose first line says the
 * office wrote it and when. Everything after that line is what `AGENTS.md` holds, so the two tools
 * read the same rules.
 *
 * THE TIME IS LOCAL WALL-CLOCK WITH ITS OFFSET, written by `clockStamp`, the one writer of a moment
 * (chapter 4 rule 8: one reader and one writer, both in src/shared/time.ts). A person reads this
 * line, and a stamp in UTC with a Z does not say when it was written on the machine it was written on.
 */
export function theMarkedRulesText(text: string, at: Date): string {
  return `${THE_OFFICES_MARK}${clockStamp(() => at).instant}${FROM_THE_INSTALLED_SOURCES}${text.slice(text.indexOf('\n'))}`
}

/**
 * EVERY RULES TEXT THE OFFICE WOULD WRITE FROM ONE CHECKOUT, by the file it is written as.
 *
 * A developer checkout gives `AGENTS.md` only: Claude Code reads the checkout's own `CLAUDE.md`. An
 * installation gives `AGENTS.md` and the marked `CLAUDE.md`, which is the larger by the time on its
 * first line. The chapter preview measures each of them (src/shared/chapter-check.ts), because
 * message TxINgmO9H6gu keeps the `CLAUDE.md` text under the same limit as `AGENTS.md`.
 */
export function rulesTextsFrom(checkout: string, chapters?: OfficeChapter[], at: Date = new Date()): { file: RulesFile; text: string }[] {
  const text = rulesTextFrom(checkout, chapters)
  if (holdsTheDeveloperRules(checkout)) return [{ file: 'AGENTS.md', text }]
  return [{ file: 'AGENTS.md', text }, { file: 'CLAUDE.md', text: theMarkedRulesText(text, at) }]
}

/**
 * THE FIRST SOURCE OF THE RULES THIS CHECKOUT LACKS, by its path under the checkout, or null.
 *
 * Both shapes need the user part and the skill. `CLAUDE.md` is never the source named here: a folder
 * without the developer `CLAUDE.md` is an installation, which is written without it. The chapters are
 * not looked for, because the chapter preview hands them in.
 */
export function aRulesSourceMissingFrom(checkout: string): string | null {
  for (const source of [USER_PART_SOURCE, SKILL_SOURCE]) if (!existsSync(join(checkout, source))) return source
  return null
}
