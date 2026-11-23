// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAPTERS OF THE CODE OF LAW, EXPORTED FROM THE RECORDS THAT ARE THE AUTHORITY.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Their design of 6 September 2026 makes the rules a code of law: a short general file every agent
 * holds, and chapters that are read when the work touches a subject. Decision `JC_raqC0fRCh` says
 * where a chapter lives — it is a record in Mole Office, that record is the only authority, and
 * files are generated from it so that an agent with no server can still read the rules.
 *
 * This tool is that generator. It reads the chapter records, and writes four things:
 *
 *   1. `src/config/rules/chapters.json` — the export. Everything downstream reads this and never the API,
 *      because a run that is writing the rules for a tool cannot depend on a server being up.
 *   2. `src/config/rules/CODE.md` — the code of law as one document, for a person or an agent reading the
 *      checkout.
 *   3. The block between the two markers in `CLAUDE.md` — one pointer line per shared chapter, each one
 *      the chapter's own Conclusion (criterion C4), then one line naming the chapters marked for a role,
 *      when there are any. A role chapter has no pointer line; its role reads it through the card.
 *   4. `src/config/rules/default-regulations.json` — the default set, when the records carry what it needs.
 *
 * The renderers all live in `src/worker/rules.ts`, next to the generator that writes the rules file
 * for Codex and OpenCode, because they are one job: turn the chapters into what a reader reads.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT FINDS THE CHAPTERS
 * ---------------------------------------------------------------------------------------
 *
 * A chapter record is a `module` carrying `extra.chapter`, its number in the code. There is no
 * hand-kept list of ids here: a list in this file would be a second authority, which is the defect
 * this repository keeps producing.
 *
 * ---------------------------------------------------------------------------------------
 * HOW TO RUN IT
 * ---------------------------------------------------------------------------------------
 *
 *   node tools/rules-chapters.mjs            write the four things above
 *   node tools/rules-chapters.mjs --check    say what it would change, write nothing, exit 1 if any
 *
 * `--check` reads the office the same way the export does. Tests run it against a stand-in office
 * of their own, for example
 * tests/the-rules-export-sends-the-runs-own-key-from-its-office-tool-file.test.ts.
 *
 * It sends the environment's key if there is one, and otherwise the run's own key from its office tool file. The
 * comment above HEADERS says where the order is written.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  CHAPTERS_SOURCE,
  CODE_SOURCE,
  RULES_SOURCE,
  chaptersOfTheAnswer,
  codeOfLawText,
  TheChaptersAnswerCannotBeUsed,
  withChapterPointers,
} from '../src/worker/rules.ts'
import { problemsWithAChapter, contentOfChapter } from '../src/shared/chapter-check.ts'
import {
  theDefaultSetFromRecords,
  whichTwinsHaveNoChineseFrom,
  whyTheDefaultSetCannotBeMade,
  WHAT_THE_DEFAULT_SET_SAYS,
} from '../src/shared/default-set.ts'
import { nowStamp } from '../src/shared/time.ts'
import { whereIsTheApi, whichWorkspace } from './where-is-the-api.mjs'
import { anAgentsToolHeaders } from './sandbox-common.mjs'
import { theKeyARunsToolSends } from '../src/config/run-permissions.mjs'
import { THE_DEFAULT_REGULATIONS_FILE } from '../src/server/lib/read-the-default-regulations.ts'

const CHECKOUT = join(dirname(fileURLToPath(import.meta.url)), '..')
const API = whereIsTheApi()
const WORKSPACE = whichWorkspace()
const CHECKING = process.argv.includes('--check')
// A test or an outside export may name its own destination without rewriting the checkout.
const outputAt = process.argv.indexOf('--output')
const OUTPUT = outputAt === -1 ? CHECKOUT : process.argv[outputAt + 1]
if (!OUTPUT) throw new Error('--output needs a destination folder.')

// WHICH KEY THIS EXPORT SENDS, and in what order it is looked for, is theKeyARunsToolSends in
// src/config/run-permissions.mjs, for MOLE_OFFICE_AGENT and MOLE_OFFICE_SESSION. The headers that go with each answer:
//   - the environment's key: under MOLE_OFFICE_AGENT's name, with no session header;
//   - the key from the run's office tool file: under MOLE_OFFICE_AGENT's name, with MOLE_OFFICE_SESSION as the session
//     header;
//   - no key: under the name 'tools/rules-chapters.mjs', as before keys. A refusal then prints why no key went.
const SESSION = process.env['MOLE_OFFICE_SESSION'] ?? ''
const SENT = theKeyARunsToolSends(process.env, { agent: process.env['MOLE_OFFICE_AGENT'] ?? '', session: SESSION }, { agent: 'MOLE_OFFICE_AGENT', session: 'MOLE_OFFICE_SESSION' })

const HEADERS = {
  'x-mole-office-workspace': WORKSPACE,
  ...anAgentsToolHeaders({ withoutAKey: 'tools/rules-chapters.mjs', key: SENT.key }),
  ...(SENT.from === 'file' ? { 'x-mole-office-session': SESSION } : {}),
  'x-mole-office-purpose': 'module-work',
  'x-mole-office-trace': 'the-code-of-law-export',
}

/** Read the office's selection. Rejected records can never become an export. */
async function chapterRecords() {
  const door = '/api/office-regulations/chapters'
  const answer = await fetch(`${API}${door}`, { headers: HEADERS, signal: AbortSignal.timeout(15_000) })
  if (!answer.ok) throw new Error(`GET ${door} answered ${String(answer.status)}. Nothing was written. ${SENT.why === null ? '' : `No key was sent, because the environment holds none and ${SENT.why}. `}${String(await answer.text()).slice(0, 600)}`)
  const body = await answer.json()
  // THE READING IS chaptersOfTheAnswer in src/worker/rules.ts, which a round's start reads the same answer with. Its notes
  // are printed when the answer was read that far, as before, and a refusal here also says that nothing was written.
  const says = notes => {
    if (typeof body.says === 'string' && body.says !== '') process.stdout.write(body.says + '\n')
    for (const note of notes) process.stdout.write(note + '\n')
  }
  let read
  try {
    read = chaptersOfTheAnswer(body, door, CHECKOUT)
  } catch (error) {
    if (!(error instanceof TheChaptersAnswerCannotBeUsed)) throw error
    if (error.notes !== null) says(error.notes)
    throw new Error(`${error.message} Nothing was written.`)
  }
  says(read.notes)
  theRecords = body.records
  theSelection = body.chapters
  return read.chapters
}

let theRecords = []
let theSelection = []
const chapters = await chapterRecords()
const code = {
  generatedBy: 'tools/rules-chapters.mjs',
  from: `the selected chapters of Mole Office, read in the ${WORKSPACE} project`,
  at: nowStamp(),
  chapters,
  selection: theSelection.map(({ n, inUse, notUsed }) => ({ n, inUse, notUsed })),
}

/** What each of the three files should hold, given those records. */
const wanted = new Map()
wanted.set(CHAPTERS_SOURCE, `${JSON.stringify(code, null, 1)}\n`)
wanted.set(CODE_SOURCE, codeOfLawText(code))
wanted.set(RULES_SOURCE, withChapterPointers(readFileSync(join(CHECKOUT, RULES_SOURCE), 'utf8').trimEnd(), chapters) + '\n')

/**
 * THE DEFAULT REGULATIONS, MADE FROM THE SAME RECORDS: each rule's neutral twin,
 * chapter by chapter, leaving out the rules the person marked as only for this office. `theDefaultSetFromRecords` in
 * src/shared/default-set.ts is the one rule for it. Three outcomes:
 *   - made: the file is written, or compared under --check, like the two exports;
 *   - refused, because some rule of an office that has begun to give twins has neither a twin nor the mark: the file
 *     is not written, the refusal names each such rule, and the tool ends with exit code 1 after the other files;
 *   - not begun, because no chapter record carries a twin or the mark yet: the file is not written, one line says so,
 *     and the tool ends as it would have without it.
 * Made or refused, one more line names each stored twin whose Chinese has no `from`; such a twin stops nothing.
 */
const DEFAULT_SOURCE = THE_DEFAULT_REGULATIONS_FILE
// Stored twins remain the one default-set reader's work. A shipped recovery already has its neutral twins in the shipped file.
const storedRecords = theRecords.filter(record => theSelection.some(one => one.inUse === 'stored' && one.record === record.id))
const storedDefaults = theDefaultSetFromRecords(storedRecords)
const fallbackChoices = theSelection.filter(one => one.inUse === 'shipped')
const fallbackDefaults = []
if (fallbackChoices.length > 0) {
  const source = JSON.parse(readFileSync(join(CHECKOUT, DEFAULT_SOURCE), 'utf8'))
  for (const choice of fallbackChoices) {
    const sourceChapter = source.chapters.find(one => one.n === choice.n)
    let differs = sourceChapter === undefined ? 'the chapter number' : null
    if (sourceChapter !== undefined) {
      for (const key of ['label', 'title', 'conclusion']) if (differs === null && sourceChapter[key] !== choice.chapter[key]) differs = key
      const outline = sourceChapter.outline
      const rules = choice.chapter.rules
      for (let i = 0; differs === null && i < Math.max(outline.length, rules.length); i++) {
        if (outline[i] === undefined || rules[i] === undefined) differs = `rule ${String(i + 1)} being present`
        else for (const [fileKey, apiKey] of [['id', 'id'], ['name', 'heading'], ['text', 'text']]) if (differs === null && outline[i][fileKey] !== rules[i][apiKey]) differs = `rule ${String(i + 1)}'s ${apiKey}`
      }
    }
    if (differs !== null) throw new Error(`Chapter ${String(choice.n)} from the office differs from this checkout's shipped default in ${differs}. Nothing was written.`)
    fallbackDefaults.push(sourceChapter)
  }
}
let theDefaultSet = storedDefaults
if (fallbackDefaults.length > 0 && (storedDefaults.made || storedRecords.length === 0)) {
  const set = { about: WHAT_THE_DEFAULT_SET_SAYS, chapters: [...(storedDefaults.made ? storedDefaults.set.chapters : []), ...fallbackDefaults].sort((a, b) => a.n - b.n), ...(storedDefaults.made && storedDefaults.set.leftOut !== undefined ? { leftOut: storedDefaults.set.leftOut } : {}) }
  theDefaultSet = { made: true, anyTwinOrMark: true, set, text: `${JSON.stringify(set, null, 1)}\n` }
}
if (theDefaultSet.made) {
  const chapters = theDefaultSet.set.chapters.map(one => ({ n: one.n, id: `default-chapter-${String(one.n)}`, ...(one.forRole === undefined ? {} : { forRole: one.forRole }), label: one.label, title: one.title, conclusion: one.conclusion, context: one.context, source: '', outline: one.outline }))
  for (const chapter of chapters) {
    const problems = problemsWithAChapter(chapter.n, contentOfChapter(chapter), chapters, CHECKOUT, undefined, true, theSelection.map(one => one.n))
    if (problems.length > 0) throw new Error(`The default export cannot use chapter ${String(chapter.n)}: ${problems.join(' ')} Nothing was written.`)
  }
  wanted.set(DEFAULT_SOURCE, theDefaultSet.text)
}

/**
 * WHETHER TWO VERSIONS OF ONE FILE DIFFER IN ANYTHING BUT THE EXPORT TIME.
 *
 * The export carries the moment it ran, so a file rewritten a minute later differs in one line
 * whatever the records say. `--check` is asking whether the CHAPTERS changed, so it compares
 * everything except that stamp; the write path writes the stamp like any other byte.
 */
function differsInSubstance(before, after) {
  const withoutTheStamp = (text) => text.replace(/"at": "[^"]*"/, '"at": "…"').replace(/on \d{4}-\d\d-\d\d \d\d:\d\d:\d\d\./, 'on ….')
  return withoutTheStamp(before) !== withoutTheStamp(after)
}

/** What is on disk now, for one of the three files this tool might write. Missing reads as empty. */
function onDisk(relative) {
  try {
    return readFileSync(join(OUTPUT, relative), 'utf8')
  } catch {
    return ''
  }
}

let changed = 0

/** Write one file (or say so, under `--check`), and say what happened. Shared so both read the same. */
function settle(relative) {
  const text = wanted.get(relative)
  changed += 1
  if (CHECKING) {
    process.stdout.write(
      `${relative}: DIFFERENT from what the records say (${String(Buffer.byteLength(onDisk(relative), 'utf8'))} bytes on ` +
        `disk, ${String(Buffer.byteLength(text, 'utf8'))} bytes from the records).\n`,
    )
    return
  }
  writeFileSync(join(OUTPUT, relative), text, 'utf8')
  process.stdout.write(`${relative}: written, ${String(Buffer.byteLength(text, 'utf8'))} bytes.\n`)
}

/**
 * CHAPTERS_SOURCE AND CODE_SOURCE SHARE ONE EXPORT MOMENT, `code.at`, AND SO ARE JUDGED TOGETHER.
 *
 * Judged separately, the two can fall out of step: on 11 September 2026, a wording-only change to
 * the wrapper prose `codeOfLawText` writes around the chapters (no chapter record changed) rewrote
 * design/rules/CODE.md, which carries `code.at` in its own sentence, while design/rules/chapters.json
 * was left alone because ITS bytes had not moved — so the two files ended up naming two different
 * moments for the one export, and the test of the general file and the chapters (rightly) called
 * that a disagreement. So: if either file's substance has moved, both are written, with the one
 * `code.at` this run already agreed on for both — never one moved and the other left stamped with an
 * export that, by then, is not the one either file is describing.
 */
if (differsInSubstance(onDisk(CHAPTERS_SOURCE), wanted.get(CHAPTERS_SOURCE)) || differsInSubstance(onDisk(CODE_SOURCE), wanted.get(CODE_SOURCE))) {
  settle(CHAPTERS_SOURCE)
  settle(CODE_SOURCE)
} else {
  process.stdout.write(`${CHAPTERS_SOURCE}: already what the records say.\n`)
  process.stdout.write(`${CODE_SOURCE}: already what the records say.\n`)
}

// RULES_SOURCE (CLAUDE.md's chapter block) carries no timestamp of its own, so it is judged on its
// own bytes, as it always was.
if (differsInSubstance(onDisk(RULES_SOURCE), wanted.get(RULES_SOURCE))) settle(RULES_SOURCE)
else process.stdout.write(`${RULES_SOURCE}: already what the records say.\n`)
let theDefaultSetWasRefused = false
if (theDefaultSet.made) {
  if (onDisk(DEFAULT_SOURCE) !== wanted.get(DEFAULT_SOURCE)) settle(DEFAULT_SOURCE)
  else process.stdout.write(`${DEFAULT_SOURCE}: already what the records say.\n`)
} else if (theDefaultSet.anyTwinOrMark) {
  theDefaultSetWasRefused = true
  process.stdout.write(`${DEFAULT_SOURCE}: ${whyTheDefaultSetCannotBeMade(theDefaultSet.why)}\n`)
} else {
  process.stdout.write(
    `${DEFAULT_SOURCE}: not written. No chapter record carries a rule's neutral words or the only-this-office mark yet, ` +
      'so the default regulations cannot be made from the records; the file stays as it is.\n',
  )
}
// The list is the stored records' own: the set put together above from the shipped file's chapters carries none.
const twinsWithNoChineseFrom = whichTwinsHaveNoChineseFrom(storedDefaults.twinsWithNoChineseFrom)
if (twinsWithNoChineseFrom !== null) process.stdout.write(`${DEFAULT_SOURCE}: ${twinsWithNoChineseFrom}\n`)

process.stdout.write(
  `${String(chapters.length)} chapters, ${String(chapters.reduce((count, chapter) => count + chapter.outline.length, 0))} ` +
    `rules, read from ${API} in the ${WORKSPACE} project.\n`,
)

if (theDefaultSetWasRefused) process.exit(1)
if (CHECKING && changed > 0) {
  process.stdout.write(
    `${String(changed)} file(s) do not say what the records say. Run node tools/rules-chapters.mjs to write them.\n`,
  )
  process.exit(1)
}
