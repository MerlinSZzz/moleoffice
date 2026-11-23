// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RULES AN AGENT READS, WRITTEN ONCE AND GENERATED FOR EVERY TOOL.
 *
 * ---------------------------------------------------------------------------------------
 * THE PROBLEM THIS SOLVES
 * ---------------------------------------------------------------------------------------
 *
 * Claude Code reads `CLAUDE.md` from the working directory. Codex and OpenCode read `AGENTS.md`
 * from the same place. Three tools, two file names, and one set of rules that has to be the same in
 * both — which is exactly the defect CLAUDE.md names as this codebase's own: the same fact worked
 * out in two places, so the two can disagree, with nothing making them agree.
 *
 * So there is one writer, and the sources it reads depend on which of two shapes the checkout is:
 *
 *   - A DEVELOPER CHECKOUT holds this repository's own `CLAUDE.md`, which starts with the heading
 *     src/config/the-developer-file.mjs names. That file is the source, with the user part it reads
 *     and the named sections of the Mole Office skill. Claude Code reads it where it is, and nothing
 *     writes a `CLAUDE.md` there.
 *   - AN INSTALLATION carries no `CLAUDE.md`. Every folder whose
 *     `CLAUDE.md` is not the developer file is read as one. Its rules are written from the user part,
 *     the chapters and the same skill sections. Answer b to question 8, resting on AusK_Wfu4cf5, sends
 *     them there, and message TxINgmO9H6gu says how: Claude Code is given a `CLAUDE.md` the office
 *     marks as its own on its first line, and a `CLAUDE.md` without that mark is never written over.
 *
 * `AGENTS.md` is generated from the sources, into the run's working directory, immediately before a
 * run of a tool that reads that name, in both shapes. It is in `.gitignore`, nothing else writes it,
 * and `tests/one-set-of-rules.test.ts` fails when any of those three stops being true.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE SKILL'S SECTIONS ARE CUT OUT BY THEIR HEADINGS
 * ---------------------------------------------------------------------------------------
 *
 * A copy of the skill's words in this file would be a second copy to keep in step. Cutting the
 * sections out by their headings means editing the skill edits what every agent reads, and a
 * heading that is renamed or deleted stops this generator with a sentence naming it rather than
 * quietly writing a shorter file.
 */

import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

// THE CHAPTER SHAPE IS DECLARED ONCE, IN @shared/office-rules.ts, beside the mapping that reads a
// chapter record. This module re-exports it under the names its callers already import, so the
// renderers, the exporter and the server's reader of the export all hold one declaration and two
// copies of one interface cannot drift. G5 put the record-to-chapter mapping there for the same
// reason: the page and the exporter read the same records through the same reading.
import type { ARecordAsRead, OfficeChapter } from '../shared/office-rules.ts'
import { chaptersFromRecords } from '../shared/office-rules.ts'
export type { OfficeChapter as CodeChapter, OfficeRule as CodeRule } from '@shared/office-rules.ts'
import type { RulesFile } from './runtimes/adapter.ts'
import type { ChapterContent, SelectedChapter, TheSelectedChapters } from '@shared/chapter-edit.ts'
import { chapterWithContent, contentOfChapter, problemsWithAChapter, SHIPPED_CHAPTER_NUMBERS } from '../shared/chapter-check.ts'
import { whatGuardedGitSays } from '../config/guarded-git.mjs'
import { THE_DEFAULT_REGULATIONS_FILE } from '../server/lib/read-the-default-regulations.ts'

// THE RULES TEXT IS BUILT IN src/shared/rules-text.ts: the sources, the chapter pointer block, the
// headers, the size check and the builders. src/shared/chapter-check.ts measures with them, and a
// shared file may not import this one. Every name is exported again here, so no importer changes.
import {
  type CodeOfLaw,
  holdsTheDeveloperRules,
  HOW_TO_LEAD,
  rulesSize,
  type RulesSize,
  rulesTextFrom,
  sectionOf,
  SKILL_SOURCE,
  THE_OFFICES_MARK,
  theMarkedRulesText,
  theOfficeHoldsNoChapter,
} from '../shared/rules-text.ts'
export {
  aRulesSourceMissingFrom,
  chapterBlockWithTheRoleLine,
  chapterPointerBlock,
  CHAPTERS_END,
  CHAPTERS_SOURCE,
  CHAPTERS_START,
  chaptersFrom,
  CODEX_PROJECT_DOC_MAX_BYTES,
  GENERATED_HEADER,
  GENERATED_HEADER_IN_AN_INSTALLATION,
  holdsTheDeveloperRules,
  HOW_TO_LEAD,
  RULES_BYTES_HEADROOM,
  RULES_SOURCE,
  rulesSize,
  rulesTextFrom,
  rulesTextsFrom,
  sectionOf,
  SKILL_SECTIONS,
  SKILL_SOURCE,
  THE_OFFICES_MARK,
  theMarkedRulesText,
  theOfficeHoldsNoChapter,
  USER_PART_REFERENCE,
  USER_PART_SOURCE,
  withChapterPointers,
  withTheUserPart,
} from '../shared/rules-text.ts'
export type { CodeOfLaw, RulesSize } from '../shared/rules-text.ts'

/** The code of law as one document, for a reader with no server. Generated from `CHAPTERS_SOURCE`. */
export const CODE_SOURCE = join('src', 'config', 'rules', 'CODE.md')

/** Read the selected content for a run. An incomplete answer never becomes checkout content. */
export function chaptersSelectedForRun(answer: unknown, checkout: string): OfficeChapter[] {
  const selected = answer as TheSelectedChapters | null
  if (!Array.isArray(selected?.chapters)) throw new Error('GET /api/office-regulations/chapters answered no selected chapters.')
  const numbers = selected.chapters.map(one => one.n)
  const everyShippedNumberOnce = SHIPPED_CHAPTER_NUMBERS.every(n => numbers.filter(one => one === n).length === 1)
  const everyNumberOnce = numbers.every((one, i) => numbers.indexOf(one) === i)
  const everyOtherNumberHasARoleMark = selected.chapters.every(one => SHIPPED_CHAPTER_NUMBERS.includes(one.n) || one.forRole !== undefined)
  if (!everyShippedNumberOnce || !everyNumberOnce || !everyOtherNumberHasARoleMark) throw new Error('GET /api/office-regulations/chapters answered an incomplete set of chapter numbers.')
  const chapters = selected.chapters.flatMap(one => {
    if (one.inUse === 'none' && one.chapter === null) return []
    if ((one.inUse !== 'stored' && one.inUse !== 'shipped') || one.chapter === null) throw new Error('GET /api/office-regulations/chapters answered no content for a chapter in use.')
    const forRole: unknown = one.forRole
    if (forRole !== undefined && (typeof forRole !== 'string' || forRole === '')) throw new Error(`The role mark GET /api/office-regulations/chapters answered for chapter ${String(one.n)} is not a role name.`)
    return [chapterWithContent(one.n, one.chapter, { forRole })]
  })
  const checkedNumbers = [...new Set([...SHIPPED_CHAPTER_NUMBERS, ...numbers])]
  for (const chapter of chapters) {
    const problems = problemsWithAChapter(chapter.n, contentOfChapter(chapter), chapters, checkout, undefined, true, checkedNumbers)
    if (problems.length > 0) throw new Error(`GET /api/office-regulations/chapters: ${problems.join(' ')}`)
  }
  return chapters
}

/** An answer of GET /api/office-regulations/chapters that cannot be exported or given to a round. `notes` are the lines about each chapter, when the answer was read that far. */
export class TheChaptersAnswerCannotBeUsed extends Error {
  readonly notes: string[] | null
  constructor(message: string, notes: string[] | null) {
    super(message)
    this.notes = notes
  }
}

/** The chapters an answer of GET /api/office-regulations/chapters gives, with the selection codeOfLawText names and a line about each chapter not stored. */
export interface TheChaptersOfAnAnswer {
  chapters: OfficeChapter[]
  selection: Pick<SelectedChapter, 'n' | 'inUse' | 'notUsed'>[]
  notes: string[]
}

/**
 * ONE READING OF THE CHAPTERS ANSWER, for tools/rules-chapters.mjs and for a round's start.
 *
 * It throws TheChaptersAnswerCannotBeUsed when the answer has no chapter list or record list, when a chapter cannot be
 * read, when a chapter's content differs from its record, and when a chapter fails the chapter check. The words say
 * what was wrong and nothing about what the caller then does: the export adds that nothing was written.
 */
export function chaptersOfTheAnswer(body: unknown, door: string, checkout: string): TheChaptersOfAnAnswer {
  const answer = body as { chapters?: unknown; records?: unknown } | null
  if (typeof answer !== 'object' || answer === null || !Array.isArray(answer.chapters) || !Array.isArray(answer.records)) throw new TheChaptersAnswerCannotBeUsed(`GET ${door} answered no selected chapter records.`, null)
  const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
  const isReadable = (one: unknown): boolean => {
    if (!isObject(one) || typeof one.n !== 'number' || (one.inUse !== 'stored' && one.inUse !== 'shipped' && one.inUse !== 'none')) return false
    if (one.inUse === 'shipped' && (!isObject(one.notUsed) || !Array.isArray(one.notUsed.records) || !Array.isArray(one.notUsed.problems))) return false
    return one.inUse === 'none' || (isObject(one.chapter) && Array.isArray(one.chapter.rules))
  }
  // chapterFromRecord uses a record's id, title and summary as they are, so each record's shape is read here first.
  const isARecordAsRead = (one: unknown): one is ARecordAsRead =>
    isObject(one) && typeof one.id === 'string' && typeof one.kind === 'string' && typeof one.title === 'string' && (one.summary === null || typeof one.summary === 'string')
  if (!answer.chapters.every(isReadable) || !answer.records.every(isARecordAsRead)) throw new TheChaptersAnswerCannotBeUsed(`GET ${door} answered chapters or records that cannot be read.`, null)
  const selected = answer.chapters as SelectedChapter[]
  const notes: string[] = []
  for (const chapter of selected) {
    if (chapter.inUse === 'shipped') notes.push(`Chapter ${String(chapter.n)} uses shipped neutral English, with no Chinese. Stored records not used: ${chapter.notUsed!.records.join(', ')}. ${chapter.notUsed!.problems.join(' ')}`)
    if (chapter.inUse === 'none') notes.push(`Chapter ${String(chapter.n)}: this office holds none. It is not exported.`)
  }
  const chapters = chaptersFromRecords(answer.records).sort((a, b) => a.n - b.n)
  const english = (chapter: ChapterContent) => ({ label: chapter.label, title: chapter.title, conclusion: chapter.conclusion, rules: chapter.rules.map(({ id, heading, text }) => ({ id, heading, text })) })
  for (const chapter of selected) {
    const record = chapters.find(one => one.n === chapter.n)
    if (chapter.inUse === 'none' ? record !== undefined : record === undefined || JSON.stringify(english(contentOfChapter(record))) !== JSON.stringify(english(chapter.chapter!))) throw new TheChaptersAnswerCannotBeUsed(`GET ${door} gave chapter ${String(chapter.n)} conflicting content.`, notes)
  }
  const numbers = selected.map(chapter => chapter.n)
  for (const chapter of chapters) {
    const problems = problemsWithAChapter(chapter.n, contentOfChapter(chapter), chapters, checkout, undefined, true, numbers)
    if (problems.length > 0) throw new TheChaptersAnswerCannotBeUsed(`GET ${door}: ${problems.join(' ')}`, notes)
  }
  return { chapters, selection: selected.map(({ n, inUse, notUsed }) => ({ n, inUse, notUsed })), notes }
}

/**
 * THE CODE OF LAW AS ONE DOCUMENT, for an agent with no server.
 *
 * Positions 1 to 4 of every chapter, which is what has been written: the name, what it governs, the
 * Conclusion and the rules one line each, with each rule's full statement under its line. Positions
 * 5 to 7 are not written yet and the file says so rather than showing a shortened copy of one.
 */
export function codeOfLawText(code: CodeOfLaw): string {
  const lines: string[] = [
    GENERATED_HEADER_FOR_THE_CODE,
    '',
    '# THE OFFICE REGULATIONS',
    '',
    'The rules an agent reads when the work touches a subject. The general file — `CLAUDE.md`, and the',
    '`AGENTS.md` generated from it — carries the invariants and one pointer line per chapter; this file',
    'carries the chapters themselves.',
    '',
    ...(code.selection === undefined ? [
    `Exported from ${code.from} on ${code.at}. **Each chapter is a record and the record is the only`,
    'authority** (decision `JC_raqC0fRCh`): change a chapter there, then run `node tools/rules-chapters.mjs`',
    'to write this file again. Adding, deleting or changing a line of a chapter\'s outline is a decision and',
    'the person\'s (decision `EhNAprifszYY`); the text under a line may be rewritten by any agent.',
    ] : [
      `Exported from ${code.from} on ${code.at}. Usable chapter records are the authority.`,
      'A stored chapter this release cannot use is named beside its shipped recovery content.',
      'An absent chapter stays absent. Change the chapters in Mole Office, then export them again.',
    ]),
    '',
    '**What is written and what is not.** Every chapter below is written at reading positions 1 to 4 —',
    'its name, what it governs, its Conclusion, and its rules one line each with the rule under the line.',
    'Positions 5, 6 and 7 — the sketch, the digest and the full text with every precedent told — are not',
    'written for any chapter yet, and nobody should read the absence as "there is nothing more".',
    '',
  ]
  for (const chapter of code.chapters) {
    const choice = code.selection?.find(one => one.n === chapter.n)
    lines.push(
      `## Chapter ${String(chapter.n)} — ${chapter.label}`,
      '',
      `**${chapter.title}**`,
      '',
      chapter.conclusion,
      '',
      `*Why it exists.* ${chapter.context}`,
      '',
      `*Where its rules live in the checkout.* ${chapter.source}`,
      '',
      choice?.inUse === 'shipped' ? `*The source.* The shipped chapter in ${THE_DEFAULT_REGULATIONS_FILE}.` : `*The record.* \`${chapter.id}\`, in Mole Office.`,
      '',
      '### The rules',
      '',
    )
    if (choice?.notUsed !== undefined && choice.notUsed !== null) lines.push(`Stored records not used: ${choice.notUsed.records.join(', ')}. ${choice.notUsed.problems.join(' ')}`, '')
    for (const [index, rule] of chapter.outline.entries()) {
      lines.push(`${String(index + 1)}. **${rule.name}**`, '', `   ${rule.text}`, '')
    }
  }
  for (const choice of code.selection ?? []) if (choice.inUse === 'none') lines.push(theOfficeHoldsNoChapter(choice.n), '')
  return `${lines.join('\n').trimEnd()}\n`
}

/** Like `GENERATED_HEADER`, for the code of law, which is written from the records rather than from a file. */
export const GENERATED_HEADER_FOR_THE_CODE =
  '<!-- Written by tools/rules-chapters.mjs from the chapter records in Mole Office. Do not edit it: ' +
  'edit the records, and the next export rewrites this. -->'

/**
 * WHAT TO TELL A RUN ABOUT TAKING SOMEBODY TO A PAGE, cut out of the skill by its heading.
 *
 * Criterion M23. It throws when the heading has moved, exactly as `rulesTextFrom` in src/shared/rules-text.ts does and for
 * the same reason: a run that does not know how to lead answers "take me there" with a link the
 * person has to press, which is the defect M23 exists to remove, and it would do it silently.
 */
export function howToLead(checkout: string): string {
  const skillPath = join(checkout, SKILL_SOURCE)
  if (!existsSync(skillPath)) {
    throw new Error(
      `${skillPath} is not there, so a run cannot be told how to take somebody to a page. No run was started.`,
    )
  }
  const section = sectionOf(readFileSync(skillPath, 'utf8'), HOW_TO_LEAD)
  if (section === null) {
    throw new Error(
      `The Mole Office skill no longer has a section headed "${HOW_TO_LEAD}", which is what a run is told about ` +
        `taking somebody to a page. Fix ${SKILL_SOURCE} or the heading in src/shared/rules-text.ts. No run was started.`,
    )
  }
  return section
}

/** What the generator did, for the worker's log and for a test. */
export interface RulesWritten {
  /** The file name this tool reads. */
  file: RulesFile
  /** Where it is now. */
  path: string
  /**
   * True when this call wrote it. False when the tool reads a file the checkout already carries,
   * false when the start was refused (see `refused`), and false when the run goes on without the
   * general rules (see `startsWithoutTheRules`).
   */
  written: boolean
  /**
   * TRUE WHEN THE START WAS REFUSED rather than the file written.
   *
   * It is set when this checkout tracks the rules file the tool reads and the generated text
   * differs from the file, so a write would leave a changed tracked file the run's seal refuses
   * (message `sJlcSoK29PeV`, item 3). `because` then carries the sentence a person is told, and
   * nothing is written.
   */
  refused?: boolean
  /**
   * TRUE WHEN THE RUN STARTS WITHOUT THE GENERAL RULES, and nothing was written.
   *
   * Three answers set it. Two are for `CLAUDE.md` in an installation (message TxINgmO9H6gu): another
   * `CLAUDE.md` is in the folder and does not carry THE_OFFICES_MARK, so it is left untouched; or the
   * folder cannot be written. The third is the `AGENTS.md` write, which serves an installation and a
   * developer checkout alike: the file system refused it with EACCES, EPERM or EROFS. It is not a
   * refusal, and the start goes on. `because` then carries the sentence the worker prints and the
   * run's prompt repeats, so the run is never silently without them.
   */
  startsWithoutTheRules?: boolean
  because: string
  /**
   * HOW BIG THE FILE IS, when one was written, and whether that is safe.
   *
   * It is reported because a tool can have a size above which it drops the file without saying so:
   * Codex 0.147.0 reads a project document only up to `project_doc_max_bytes`, 32,768 by default.
   * `size` carries the same number with the limit, the headroom and a sentence, so a caller and a
   * test read one answer rather than each doing the arithmetic. The generator does not refuse to
   * write an oversized file — a run with the rules is better than a run with none, and the tool
   * that drops them is not this one — but
   * `tests/the-skill-says-how-to-reach-the-office-from-elsewhere.test.ts` fails
   * when the file this repository would generate is inside the headroom, which is where problem
   * `2zwQE7ONqg9h` is answered.
   */
  bytes?: number
  size?: RulesSize
}

/**
 * WHAT A RUN IS TOLD WHEN THIS CHECKOUT TRACKS THE RULES FILE IT WOULD WRITE.
 *
 * Message `sJlcSoK29PeV`, item 3, gives these words, and they are used word for word: the start is
 * refused rather than allowed to leave a changed tracked file in the run's working tree.
 */
const THE_REFUSAL_OVER_A_TRACKED_RULES_FILE =
  'This checkout tracks AGENTS.md, and starting the run would write over it, so its seal would later ' +
  'refuse the changed file. Stop tracking the generated AGENTS.md (git rm --cached AGENTS.md, then ' +
  'add it to .gitignore) and start again.'

/** How long git is given to answer whether a rules file is tracked. */
const GIT_SAYS_WHICH_FILES_IT_TRACKS_TIMEOUT_MS = 5_000

/**
 * WHETHER THE START MUST BE REFUSED OVER THE RULES FILE THE TOOL WOULD READ.
 *
 * It is true only when git tracks that file in that folder AND the file there is not byte for byte
 * the text that would be written. Message `sJlcSoK29PeV`, item 3: in a checkout that tracks
 * `AGENTS.md`, the write leaves the run's working tree holding a changed tracked file, and the
 * run's seal refuses to seal while that is so (src/server/lib/sealed-tip.ts). A tracked file that
 * is missing from the folder counts as different: the write would create it, which the seal reads
 * as a change too.
 *
 * GIT IS ASKED ONLY WHEN SOMETHING NAMED .git IS IN THE FOLDER OR IN A FOLDER ABOVE IT (message
 * `12vABSXL7-aM`, answer 1). With none, git is not started and the start goes ahead. That is right
 * where no checkout holds the folder. `aGitIsInOrAbove` names the shapes where git's own search
 * differs, one of them a checkout with no .git, where the file is then written. Where there is a
 * .git, a folder git still calls "not a git repository", with exit 128, tracks nothing too, and the
 * start goes ahead. Any other failure of git is thrown with what git said, because nothing then
 * knows whether the file is tracked, and reading such a failure as "untracked" would let the write
 * happen exactly where the answer is unknown.
 */
export function theStartIsRefusedOverATrackedRulesFile(folder: string, wants: RulesFile, text: string): boolean {
  if (!aGitIsInOrAbove(folder) || !gitTracks(folder, wants)) return false
  const path = join(folder, wants)
  if (!existsSync(path)) return true
  return !readFileSync(path).equals(Buffer.from(text, 'utf8'))
}

/**
 * WHETHER SOMETHING NAMED .git IS IN THE FOLDER OR IN ANY FOLDER ABOVE IT, up to the root.
 *
 * A folder, a file (a worktree has one) or anything else of that name counts, and it is never read
 * here: git reads it when it is asked. The look goes up because git's does. A run's folder that is a
 * subfolder of a checkout is in that checkout, and git answers for it from the .git above.
 *
 * THREE SHAPES DIFFER FROM GIT'S OWN SEARCH. Measured with git 2.43 on 17 October 2026, through
 * `whatGuardedGitSays`, except where it says otherwise:
 *   - A git folder that is not named .git, whose own config gives it a work tree (core.bare false
 *     and core.worktree), is found by git from inside it, and git answers that AGENTS.md is
 *     tracked. This look does not find it, so git is not asked there and the file is written.
 *   - A bare repository's own folder has no .git either. Git answers there that nothing is tracked,
 *     so not asking it changes nothing.
 *   - A .git on the far side of a filesystem boundary is found by this look, and git stops at the
 *     boundary. So git is asked there, and what it answers was not measured: no boundary could be
 *     made where this was measured.
 */
function aGitIsInOrAbove(folder: string): boolean {
  for (let here = resolve(folder); ; here = dirname(here)) {
    if (lstatSync(join(here, '.git'), { throwIfNoEntry: false }) !== undefined) return true
    if (dirname(here) === here) return false
  }
}

/**
 * WHETHER GIT LISTS ONE PATH AS TRACKED IN ONE FOLDER, or throws with what git said.
 *
 * Git is run by `whatGuardedGitSays` in src/config/guarded-git.mjs, with the guard that keeps git
 * from starting a program the repository chose: a run's folder is one a sandboxed run can write.
 * It is not run from here, because no file under `src/worker/` but runtimes/os.ts may start a
 * process; and not from os.ts, because the server loads this file too
 * and may not load os.ts (tests/a-program-is-judged-on-the-files-it-is-built-from.test.ts). This
 * function owns what git's answer means for the start.
 */
function gitTracks(folder: string, wants: RulesFile): boolean {
  const said = whatGuardedGitSays(folder, ['ls-files', '-z', '--', wants], GIT_SAYS_WHICH_FILES_IT_TRACKS_TIMEOUT_MS)
  if (said.status === 128 && said.stderr.includes('not a git repository')) return false
  if (said.status !== 0) {
    const trouble = said.stderr.trim()
    throw new Error(
      `git could not say whether ${wants} is tracked in ${folder}: ${
        trouble === ''
          ? `git exited ${said.status === null ? 'without a status' : String(said.status)} and printed nothing`
          : trouble
      }`,
    )
  }
  return said.stdout !== ''
}

/**
 * Put the rules where this tool will look for them.
 *
 * IN A DEVELOPER CHECKOUT `CLAUDE.md` is not written. It is the source, it is in the checkout
 * already, and writing it would make this generator the thing that edits the file it reads.
 *
 * IN AN INSTALLATION `CLAUDE.md` is written, marked, under message TxINgmO9H6gu's three conditions.
 * Whether the checkout holds the developer `CLAUDE.md` is looked at first, and that answer stands
 * under that message too. Then the run's folder is looked at:
 *   - no `CLAUDE.md` there: the marked text is written;
 *   - a `CLAUDE.md` whose first line carries THE_OFFICES_MARK: it is written over;
 *   - anything else there, a person's own file, a link or a folder: it is left untouched, and the
 *     answer says the run starts without the general rules and why (`startsWithoutTheRules`);
 *   - a write refused with EACCES, EPERM or EROFS, which is how a folder that cannot be written
 *     answers: the same, and the run still starts. Any other failure is thrown, because nothing then
 *     says what happened to the file.
 * There is no tracked-file refusal for `CLAUDE.md`: an installation is not a checkout git tracks, and
 * a tracked `CLAUDE.md` of a developer checkout is never written.
 *
 * AN `AGENTS.md` WRITE THE FILE SYSTEM REFUSES IS THE SAME ANSWER, in an installation and in a
 * developer checkout alike: EACCES, EPERM or EROFS answers `written: false`,
 * `startsWithoutTheRules: true` and the sentence
 * `theSentenceWhenTheFileSystemRefusedTheWrite` builds, and the run still starts. Any other failure
 * is thrown, because nothing then says what happened to the file.
 *
 * A TRACKED RULES FILE IS NOT WRITTEN OVER either, when the generated text differs from it
 * (message `sJlcSoK29PeV`, item 3). A write there would leave the run's working tree holding a
 * changed tracked file, and the run's seal refuses to seal while a tracked file differs from the
 * commit. So the start is refused instead: the answer is `written: false`, `refused: true` and the
 * sentence in THE_REFUSAL_OVER_A_TRACKED_RULES_FILE, and nothing is written.
 */
export function writeRulesInto(cwd: string, checkout: string, wants: RulesFile, chapters?: OfficeChapter[]): RulesWritten {
  const path = join(cwd, wants)
  const developer = holdsTheDeveloperRules(checkout)
  if (wants === 'CLAUDE.md' && developer) {
    return {
      file: wants,
      path,
      written: false,
      because: 'This tool reads CLAUDE.md, which is the source these rules come from and is in the checkout already.',
    }
  }
  if (wants === 'CLAUDE.md') return writeTheOfficesClaudeFile(cwd, checkout, chapters)
  const text = rulesTextFrom(checkout, chapters)
  if (theStartIsRefusedOverATrackedRulesFile(cwd, wants, text)) {
    return {
      file: wants,
      path,
      written: false,
      refused: true,
      because: THE_REFUSAL_OVER_A_TRACKED_RULES_FILE,
    }
  }
  try {
    writeFileSync(path, text, 'utf8')
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'EACCES' && code !== 'EPERM' && code !== 'EROFS') throw err
    return {
      file: wants,
      path,
      written: false,
      startsWithoutTheRules: true,
      because: theSentenceWhenTheFileSystemRefusedTheWrite(path, code, cwd),
    }
  }
  const size = rulesSize(text)
  return {
    file: wants,
    path,
    written: true,
    because:
      (developer
        ? 'Written from CLAUDE.md and the user part it reads, the chapters of the office regulations and the Mole '
        : 'Written from the rules for every agent, the chapters of the office regulations and the Mole ') +
      `Office skill, so this tool reads the same rules as the others. ${size.sentence}`,
    bytes: size.bytes,
    size,
  }
}

/**
 * WHAT A RUN IS TOLD WHEN THE FILE SYSTEM REFUSED THE GENERAL RULES WRITE, built in one place.
 *
 * Two writes answer with these words: the `AGENTS.md` write in `writeRulesInto`, for Codex, OpenCode,
 * Kimi and the made-up runtime, and `writeTheOfficesClaudeFile`, for Claude Code. Both stop at the
 * three codes that mean the folder cannot be written — EACCES, EPERM and EROFS — and both answer
 * `written: false` and `startsWithoutTheRules: true` with this sentence. One copy, so the two tools
 * are told the same thing in the same words.
 */
function theSentenceWhenTheFileSystemRefusedTheWrite(path: string, code: string, cwd: string): string {
  return (
    `The general rules were not written for this run, and it starts without them. Writing ${path} failed with ` +
    `${code}, because ${cwd} or the file in it cannot be written.`
  )
}

/** The `CLAUDE.md` of an installation, under the conditions `writeRulesInto` says. */
function writeTheOfficesClaudeFile(cwd: string, checkout: string, chapters: OfficeChapter[] | undefined): RulesWritten {
  const path = join(cwd, 'CLAUDE.md')
  const there = lstatSync(path, { throwIfNoEntry: false })
  if (there !== undefined && !(there.isFile() && readFileSync(path, 'utf8').startsWith(THE_OFFICES_MARK))) {
    return {
      file: 'CLAUDE.md',
      path,
      written: false,
      startsWithoutTheRules: true,
      because:
        `The general rules were not written for this run, and it starts without them. ${path} is already there, ` +
        'and its first line does not carry the mark Mole Office puts on a CLAUDE.md it writes, so Mole Office left it untouched.',
    }
  }
  const text = theMarkedRulesText(rulesTextFrom(checkout, chapters), new Date())
  try {
    writeFileSync(path, text, 'utf8')
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'EACCES' && code !== 'EPERM' && code !== 'EROFS') throw err
    return {
      file: 'CLAUDE.md',
      path,
      written: false,
      startsWithoutTheRules: true,
      because: theSentenceWhenTheFileSystemRefusedTheWrite(path, code, cwd),
    }
  }
  const size = rulesSize(text)
  return {
    file: 'CLAUDE.md',
    path,
    written: true,
    because:
      'Written from the rules for every agent, the chapters of the office regulations and the Mole Office skill, ' +
      `with the mark Mole Office puts on a CLAUDE.md it writes, so this tool reads the same rules as the others. ${size.sentence}`,
    bytes: size.bytes,
    size,
  }
}

// =========================================================================== the global rules file

/**
 * WHERE EACH OTHER RUNTIME READS ITS RULES, AND THE ONE PLACE THAT WRITES THAT FILE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS LIVES HERE AND NOT BESIDE THE PRESS THAT USES IT
 * ---------------------------------------------------------------------------------------
 *
 * `tests/one-set-of-rules.test.ts` holds one rule: the rules file a runtime reads is written in ONE
 * place, because two writers is how one set of rules becomes two that nothing keeps in step. Until
 * this section existed, `src/config/install-the-entry.mjs` knew the file's name, worked out its path
 * and wrote it — a second writer, and the gate said so on the whole-suite run of 15 September 2026.
 *
 * The user-level file and the generated per-run file are not the same artefact: the per-run one is
 * the whole of the rules, and the user-level one is a few sentences saying Mole Office may be
 * running here. But they are the same FILE NAME on the same machine, read by the same tools, and the
 * thing the gate protects is that one place decides what goes into a file by that name. So the name,
 * the paths and the write are here; the press keeps the deciding — whether to write at all, what to
 * back up, what to refuse — and asks this for the two things it must not know twice.
 *
 * ---------------------------------------------------------------------------------------
 * THE PATHS, AND WHERE THEY WERE READ FROM
 * ---------------------------------------------------------------------------------------
 *
 * Read from each tool's own published documentation on 14 September 2026, not measured on this
 * machine, because neither tool has a command that prints this answer back.
 *
 *   Codex     `$CODEX_HOME/` + the name below, and `$CODEX_HOME` defaults to `~/.codex` (`codex exec
 *             --help` and `codex doctor` on this machine both name `CODEX_HOME`, so the environment
 *             variable itself is confirmed even though the exact global-file behaviour is not).
 *             Skipped entirely when the override file beside it exists —
 *             developers.openai.com/codex/guides/agents-md, 14 September 2026: "Codex reads
 *             AGENTS.override.md if it exists. Otherwise, Codex reads AGENTS.md." Global and project
 *             files are concatenated rather than one replacing the other, so writing here does not
 *             compete with any project's own file.
 *   OpenCode  `~/.config/opencode/` + the name below, fixed — opencode.ai/docs/rules/, 14 September
 *             2026: "You can also have global rules in a ~/.config/opencode/AGENTS.md file. This
 *             gets applied across all opencode sessions." No environment variable is documented to
 *             move it, so none is read: this project reads a schema rather than guessing one, and
 *             there is no schema for a tool that has not published one.
 */
export const THE_GLOBAL_RULES_FILE: RulesFile = 'AGENTS.md'

/** The file Codex reads INSTEAD of the one above, when it is there. */
export const THE_CODEX_OVERRIDE_FILE = 'AGENTS.override.md'

/** One other runtime's global rules file and the directory it lives in. */
export interface GlobalRulesTarget {
  runtime: 'codex' | 'opencode'
  /** The name a person reads. */
  installedName: string
  /** The tool's own home directory. It must already exist; nothing here makes one. */
  homeDirectory: string
  /** The global rules file this runtime reads. */
  agentsPath: string
  /** A file that would make writing `agentsPath` pointless, or null where the tool has no such idea. */
  overridePath: string | null
}

/**
 * Both other runtimes' targets, worked out from one home directory.
 *
 * `CODEX_HOME` is read from the environment because Codex itself reads it; everything else is a
 * fixed path under the home directory given.
 */
export function theGlobalRulesTargets(home: string): { codex: GlobalRulesTarget; opencode: GlobalRulesTarget } {
  const said = process.env['CODEX_HOME']
  const codexHome = typeof said === 'string' && said !== '' ? said : join(home, '.codex')
  const opencodeHome = join(home, '.config', 'opencode')
  return {
    codex: {
      runtime: 'codex',
      installedName: 'Codex',
      homeDirectory: codexHome,
      agentsPath: join(codexHome, THE_GLOBAL_RULES_FILE),
      overridePath: join(codexHome, THE_CODEX_OVERRIDE_FILE),
    },
    opencode: {
      runtime: 'opencode',
      installedName: 'OpenCode',
      homeDirectory: opencodeHome,
      agentsPath: join(opencodeHome, THE_GLOBAL_RULES_FILE),
      overridePath: null,
    },
  }
}

/**
 * WRITE ONE RUNTIME'S GLOBAL RULES FILE, through a temporary file in the same directory and a
 * rename, so a reader never meets a half-written one.
 *
 * It makes the directory if it is missing and throws what the file system threw; deciding whether to
 * write at all, and what to say when this fails, belongs to the caller that asked. It waits by
 * promises, so the server's thread is free while the file is written. The temporary file is named
 * after this process, so two writes of one target in one process must not run at the same moment.
 */
export async function writeGlobalRulesFile(target: GlobalRulesTarget, text: string): Promise<void> {
  const temporary = `${target.agentsPath}.mole-office-${String(process.pid)}`
  await mkdir(target.homeDirectory, { recursive: true })
  try {
    await writeFile(temporary, text, 'utf8')
    await rename(temporary, target.agentsPath)
  } catch (err) {
    try {
      await rm(temporary, { force: true })
    } catch {
      // The temporary file was already gone, which is the outcome that was wanted.
    }
    throw err
  }
}
