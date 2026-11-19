// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TEXT A PERSON CARRIES TO AN OUTSIDE CHAT, AND THE SCREEN OVER IT. Criterion F16 points 1 and 6.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS
 * ---------------------------------------------------------------------------------------
 *
 * `theTextForOutside` makes the text a person copies into an outside chat: the package's bundle
 * text, a line naming the kind of outside work it suits, then the files of the modules it names,
 * the acceptance criteria in full with where they were copied from, the office regulations by
 * chapter and rule name only, and the packager's words for the outside. It runs
 * `screenWhatWouldLeave` over the whole of it and answers both, writing nothing.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT SITS IN ITS OWN FILE AND NOT IN lib/delegation.ts
 * ---------------------------------------------------------------------------------------
 *
 * lib/records.ts imports lib/delegation.ts for `assertMayConfirmPackage`, and `freshDb()` in
 * tests/helpers.ts imports lib/records.ts before a test can register a mock of the shared token
 * rule. So anything lib/delegation.ts imports at module scope is loaded before that mock, and a
 * test that changes the shared rule and expects every reader to move would fail.
 * tests/a-bundle-says-what-it-costs-to-read.test.ts is exactly that test, and it goes red when
 * lib/delegation.ts imports lib/bundle.ts. This file is not imported by lib/records.ts, so
 * lib/bundle.ts is loaded after the mock, where it belongs.
 *
 * NOTHING HERE EDITS THE TEXT. The screen reports; the door refuses or hands the text over whole.
 * See the header of src/server/lib/screening.ts.
 */
import { getRecord, recordInWorkspace } from './records.ts'
import { PanelError } from './panel-error.ts'
import type { AMessageReader } from './messages.ts'
import { filesOfModules, packageOf, type ModuleFilesReading, type StoredPackage } from './delegation.ts'
import { theOfficeRegulations } from './office-regulations.ts'
import { resolveBundle, specOf, type ResolvedBundle } from './bundle.ts'
import { screenWhatWouldLeave, type ScreeningAnswer, type ScreeningFinding } from './screening.ts'
import { kindWord, packageSuitWord, screenCheckWord } from '@shared/words.ts'
import type { PanelRecord } from '@shared/types.ts'
import type { OfficeChapter } from '@shared/office-rules.ts'

// ============================================================================ the text for the outside

/** The line of `=` the bundle text itself draws its sections with, so the appended sections match. */
const OUTSIDE_RULE = '='.repeat(78)

/**
 * THE ACCEPTANCE CRITERIA, IN FULL, WITH WHERE THEY WERE COPIED FROM. Criterion F16 point 1.
 *
 * The package stores the criteria as prose and their source as three facts — the file, the
 * criterion's name and the commit. Both are printed: a reader outside the office cannot reach the
 * file the criteria were copied from, so a copy with no source would be a claim with nothing behind
 * it. The source line is printed beside them, exactly as the panel on the task draws it.
 */
export function theAcceptanceSection(pkg: StoredPackage): string {
  return [
    OUTSIDE_RULE,
    'THE ACCEPTANCE CRITERIA, IN FULL',
    OUTSIDE_RULE,
    `Copied from ${pkg.acceptanceSource.file}, criterion ${pkg.acceptanceSource.criterion}, at commit ${pkg.acceptanceSource.commit}.`,
    '',
    pkg.acceptance,
  ].join('\n')
}

/**
 * ONE LINE SAYING WHICH KIND OF OUTSIDE WORK THE PACKAGE SUITS. Criterion F16 point 7.
 *
 * Criterion F16 point 7 says the suits label is shown in the column, and it already is. An outside
 * reader cannot see the column, so the same reading is printed once near the top of the appended
 * sections. The stored word is read through `packageSuitWord`, the one table of readings, so a value
 * no table knows is named out loud rather than handed on. It is a line and not a section: it says one
 * thing and rules nothing off.
 */
export function theSuitsLine(pkg: StoredPackage): string {
  return `This package suits: ${packageSuitWord(pkg.suits).text}.`
}

/**
 * THE FILES OF THE MODULES THE PACKAGE NAMES, WITH THE ONE SENTENCE ABOUT WHOSE FILES THEY ARE.
 * Criterion F16 point 1 as corrected by decision 5fIvP6qTPzgM.
 *
 * THE SENTENCE IS DRAWN, NOT REWRITTEN. `files.filesSays` is `thePackageFilesSentence` from
 * src/shared/delegation.ts, the one place it is written; this function prints it and never says
 * whose files they are in its own words. The three answers — no module named, modules named and none
 * of them has any stated code, modules named and some do not — are those three sentences, and each
 * one differs from the other two.
 *
 * THE MODULE IS NAMED BESIDE ITS FILES. A reader has to be able to tell which files came from which
 * module, so each module's title and record id head its own rows, and every row is one `statedFor`
 * row: the pattern somebody stated, the relation they stated it under, and the repository it was
 * stated in, with the authority that read the row. A module with no stated code carries no rows
 * here; the sentence above names it, where case 2 or case 3 of the reading requires it, so nothing
 * the packager named is dropped silently.
 *
 * IT PRINTS THE NAMES AND NOT THE CODE. A stated row names a file, it does not hold its contents.
 * Nothing here reads a file, so this section cannot carry source text into the chat window.
 */
export function theFilesSection(files: ModuleFilesReading): string {
  const lines = [OUTSIDE_RULE, 'THE FILES OF THE MODULES THIS WORK IS IN', OUTSIDE_RULE, files.filesSays]
  // GROUPED BY MODULE, in the order the packager named them, so a module with several stated rows is
  // named once rather than several times and its files stay visibly together.
  for (const moduleId of [...new Set(files.modules.map((one) => one.recordId))]) {
    const rows = files.modules.filter((one) => one.recordId === moduleId)
    lines.push('')
    lines.push(`${rows[0]?.title ?? moduleId} (${moduleId})`)
    for (const row of rows) {
      lines.push(`  ${row.pattern} — ${row.relation}, in repository ${row.repositoryId} (${row.authority})`)
    }
  }
  return lines.join('\n')
}

/**
 * THE OFFICE REGULATIONS, BY NAME ONLY, WITH NO RULE BODY. Criterion F16 point 1, and the ruling on it.
 *
 * The full reply of `GET /api/office-regulations` is 33,852 bytes; the names alone are 4,592 over
 * 65 lines. Only the names travel: a chapter's number and title, then the heading of each of its
 * rules. The rule text, the chapter's context, its conclusion and where its file lives are all
 * deliberately left out, because an outside reader needs to know which rules exist, not to read
 * this office's regulations from a chat window.
 */
export function theRegulationsSection(chapters: readonly OfficeChapter[]): string {
  const lines = [
    OUTSIDE_RULE,
    'THE OFFICE REGULATIONS, BY NAME ONLY',
    OUTSIDE_RULE,
    'The chapter names and the rule names, with no rule text. The regulations themselves are kept by the office and cannot be reached from outside it.',
  ]
  if (chapters.length === 0) {
    lines.push('')
    lines.push('This project holds no chapter records, so there are no regulation names to print.')
    return lines.join('\n')
  }
  for (const chapter of chapters) {
    lines.push('')
    lines.push(`Chapter ${String(chapter.n)}: ${chapter.title}`)
    if ('selectionNotice' in chapter && chapter.selectionNotice) lines.push(String(chapter.selectionNotice))
    for (const rule of chapter.outline) {
      lines.push(`  ${rule.name}`)
    }
  }
  return lines.join('\n')
}

/**
 * THE SECTION WRITTEN FOR THE OUTSIDE, exactly as the packager wrote it: what may be changed, what
 * is to be returned and in which form. Criterion F16 point 1.
 *
 * IT IS PRINTED WHOLE AND NEVER EDITED. The screen above it may refuse the text or flag it for a
 * person to look at; neither the packager's words nor anything else is ever stripped or rewritten.
 */
export function theForTheOutsideSection(pkg: StoredPackage): string {
  return [OUTSIDE_RULE, 'WRITTEN FOR THE OUTSIDE', OUTSIDE_RULE, pkg.forTheOutside].join('\n')
}

/** Everything the outside text is, before it is screened and before anything is recorded. */
export interface TheTextForOutside {
  task: PanelRecord
  package: StoredPackage
  bundle: PanelRecord
  resolved: ResolvedBundle
  /** The bundle's own text, then the suits line and the four sections the bundle does not carry. */
  text: string
  /** What the screen said about the whole text, nothing of it recorded yet. */
  screening: ScreeningAnswer
}

/**
 * MAKE THE TEXT A PERSON COPIES INTO AN OUTSIDE CHAT, and screen it, writing nothing.
 *
 * ---------------------------------------------------------------------------------------
 * THE TEXT IS THE BUNDLE'S TEXT PLUS A LINE AND FOUR SECTIONS
 * ---------------------------------------------------------------------------------------
 *
 * The ruling of 14 September 2026: an agent's text and a person's text are the same bundle
 * text, so a change to the bundle changes both. An outside reader cannot reach the office to look
 * anything up, so a line naming the kind of outside work the package suits, and four sections the
 * bundle does not carry, are appended, each section under its own heading: the files of the modules
 * the package names, the acceptance criteria in full with where they were copied from, the office
 * regulations by name only, and the packager's words for the outside.
 *
 * ---------------------------------------------------------------------------------------
 * THE SCREEN RUNS OVER THE WHOLE TEXT, AND THIS FUNCTION ONLY REPORTS
 * ---------------------------------------------------------------------------------------
 *
 * `screenWhatWouldLeave` reads every line of what would leave — the bundle's part, the suits line and
 * the four sections — and answers. This function never edits, strips or rewrites a character; it
 * returns the text whole with the answer beside it, and the callers decide what to do. That is
 * criterion F16 point 6 and the screen's own rule.
 *
 * IT WRITES NOTHING. The recording is `recordAnExport`, the bundle's own export, and the caller runs
 * it only after the screen has not refused.
 */
export async function theTextForOutside(
  taskId: string,
  workspaceId: string,
  // WHO IS READING, handed to `resolveBundle`: no message it may not read is in the text.
  reader: AMessageReader,
): Promise<TheTextForOutside> {
  const task = recordInWorkspace(taskId, workspaceId)
  if (task.kind !== 'task') {
    throw new PanelError(
      `"${task.title}" is a ${kindWord(task.kind).text}, and only a packaged task has text to hand to an outside ` +
        'chat. Nothing was written.',
      400,
    )
  }
  const pkg = packageOf(task.data)
  if (pkg === null) {
    throw new PanelError(
      `"${task.title}" has not been packaged, so there is no text for an outside reader yet. Package it first: ` +
        `POST /api/delegation/${task.id}/package. Nothing was written.`,
      400,
    )
  }
  const bundle = getRecord(pkg.bundleId)
  if (bundle === null || bundle.kind !== 'context_bundle') {
    throw new PanelError(
      `The package on "${task.title}" points at bundle ${pkg.bundleId}, and no context bundle with that id is in ` +
        'this project, so there is no text to hand over. Nothing was written.',
      409,
    )
  }
  const resolved = await resolveBundle(specOf(bundle.data), workspaceId, reader)
  // THE SAME READING `GET /api/office-regulations` SERVES, through the one function that reads it,
  // so the names a page draws and the names an outside reader gets cannot drift apart.
  const chapters = theOfficeRegulations(workspaceId).chapters
  // THE FILES OF THE MODULES THE PACKAGE NAMES, read through the one reader the column reads, so the
  // sentence and the rows printed here cannot drift from the row a person sees. `packageOf` reads the
  // ids; `filesOfModules` reads their rows through `statedFor`. The default `continue` preset does
  // not declare an implementation-map part, so without this the files are carried nowhere however
  // many modules a packager names — decision 5fIvP6qTPzgM's point, and F16 point 1.
  const moduleFiles = filesOfModules(pkg.moduleIds, workspaceId)
  const text = [
    resolved.text,
    '',
    theSuitsLine(pkg),
    theFilesSection(moduleFiles),
    theAcceptanceSection(pkg),
    theRegulationsSection(chapters),
    theForTheOutsideSection(pkg),
  ].join('\n')
  return { task, package: pkg, bundle, resolved, text, screening: screenWhatWouldLeave(text) }
}

/** Just the findings that stop the text leaving, which is what a caller decides on. */
export function theRefusedFindings(screening: ScreeningAnswer): ScreeningFinding[] {
  return screening.findings.filter((finding) => finding.severity === 'refused')
}

/** Where one finding sits, in the words the refusal uses. Empty for a finding about the whole text. */
function whereAFindingSits(finding: ScreeningFinding): string {
  if (finding.where === null) return ''
  return (
    ` at line ${String(finding.where.line)}, characters ${String(finding.where.startColumn)} to ` +
    `${String(finding.where.endColumn)}`
  )
}

/**
 * WHY THE SCREEN REFUSED, NAMING EVERY FINDING: the check, where it sits, and the sentence.
 *
 * Criterion F16 point 6. Nothing was exported and nothing was recorded, and this is the sentence a
 * person reads instead. A `key_in_text` finding's own sentence never carries the key's value — the
 * screen guarantees that — and this function does not add it back.
 */
export function whyTheScreenRefused(screening: ScreeningAnswer): string {
  const refused = screening.findings.filter((finding) => finding.severity === 'refused')
  const look = screening.findings.filter((finding) => finding.severity === 'look_before_you_paste')
  const lines = [
    `Nothing was exported and nothing was recorded. The screen found ${String(refused.length)} finding(s) that stop ` +
      'this text leaving the office:',
  ]
  for (const finding of refused) {
    lines.push(`- ${screenCheckWord(finding.check).text}${whereAFindingSits(finding)}. ${finding.says}`)
  }
  if (look.length > 0) {
    lines.push('')
    lines.push('It also found these, which stop nothing, to read before you paste:')
    for (const finding of look) {
      lines.push(`- ${screenCheckWord(finding.check).text}${whereAFindingSits(finding)}. ${finding.says}`)
    }
  }
  return lines.join('\n')
}
