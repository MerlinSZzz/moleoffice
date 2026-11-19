// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TESTS THAT READ THE WHOLE MACHINE, FOUND IN THE LINES A RUN ADDS UNDER tests/. Pure. Wave 13u round 104, on the owner's
 * rule: no test may read the machine's whole temporary folder or every process on it. A test looks only at what it made.
 * The temporary folder and the process list hold other programs' folders and processes, other users' among them, so a
 * test that reads them all can pass or fail with whatever else runs on the machine.
 *
 * A REMINDER, NEVER A REFUSAL. The reminder before the seal names each line as a likely item (./before-the-seal-rules.ts),
 * which refuses nothing at any position of the gate. The run fixes the line, or keeps it by writing KEPT_ON_PURPOSE and a
 * reason on it, and the seal records which (`theDecisionsOnTheScans`, kept by ./before-the-seal.ts).
 *
 * ONE LINE AT A TIME. A scan is seen only when one line says both the reading and what it reads. A folder named on one
 * line and listed on another, and a scan through a tool the test starts, are not seen, and the reminder says so
 * (WHAT_THE_FINDER_CANNOT_SEE).
 */
import type { ANamedItem, AScanDecided } from '@shared/before-the-seal.ts'

/** The words that keep a line, followed by the reason: on the line, or on the comment line the run adds just above it. */
export const KEPT_ON_PURPOSE = 'machine-wide on purpose:'

/** What the reminder's notes say the finder does not look at. */
export const WHAT_THE_FINDER_CANNOT_SEE =
  'Tests that read the whole machine: looked for one line at a time in the lines this run adds under tests/. ' +
  'A folder or a process list named on one line and read on another, a scan through a tool the test starts, and a line this run did not add are not seen.'

/** One line the run adds that reads the whole machine, as the reminder names it. */
export interface AScanOfTheWholeMachine {
  /** The same for the same line wherever it moves, and whether or not it is kept, so the seal can look for it again. */
  key: string
  path: string
  line: number
  /** The reason written after KEPT_ON_PURPOSE, or null when the line is not kept. */
  keptBecause: string | null
  says: string
}

/** The command's name in a string, or at the start of a shell command line: after a quote, a bracket, or ; | &. */
const AS_A_COMMAND = String.raw`(?:['"\x60(]|[;|&]\s*)`
const THE_END_OF_A_WORD = String.raw`(?=[\s'"\x60;|&)]|$)`
const A_LISTING = String.raw`\b(?:readdirSync|readdir|opendirSync|opendir)\(\s*`

const SCANS: readonly { what: string; reads: string; instead: string; pattern: RegExp; unless?: RegExp }[] = [
  {
    what: 'tmp',
    reads: 'lists the whole temporary folder',
    instead: 'list a folder the test made (mkdtempSync), and start the program it tests with TMPDIR set to that folder',
    pattern: new RegExp(String.raw`${A_LISTING}(?:(?:os\.)?tmpdir\(\)|(['"\x60])\/tmp\/?\1)\s*[,)]|${AS_A_COMMAND}(?:ls|find)\s+\/tmp\/?${THE_END_OF_A_WORD}`, 'u'),
  },
  {
    what: 'proc',
    reads: 'lists every process in /proc',
    instead: 'read only the processes the test started, by the pids or the process group it recorded',
    pattern: new RegExp(String.raw`${A_LISTING}(['"\x60])\/proc\/?\1\s*[,)]|${AS_A_COMMAND}(?:ls|find)\s+\/proc\/?${THE_END_OF_A_WORD}`, 'u'),
  },
  {
    // -e and -A are every process; BSD's ax and aux are too. -p, --ppid and -o name no more than they are given.
    what: 'ps',
    reads: 'reads every process with ps',
    instead: 'ask ps -p about the pids the test recorded, or read their own /proc/<pid> entries',
    pattern: new RegExp(String.raw`(['"\x60])ps\1\s*,\s*\[\s*(['"\x60])(?:-[A-Za-z]*[eA][A-Za-z]*|-?a[A-Za-z]*x[A-Za-z]*)\2|${AS_A_COMMAND}ps\s+(?:-[A-Za-z]*[eA][A-Za-z]*|-?a[A-Za-z]*x[A-Za-z]*)${THE_END_OF_A_WORD}`, 'u'),
  },
  {
    what: 'pgrep',
    reads: 'asks pgrep, pkill or killall about every process, naming no group, parent, session or user',
    instead: "name the test's own process group or parent (-g, -P), or use the pids the test recorded",
    pattern: new RegExp(String.raw`(['"\x60])(?:pgrep|pkill|killall)\1|${AS_A_COMMAND}(?:pgrep|pkill|killall)\s`, 'u'),
    unless: /(?:^|[\s'"`,[])(?:-[uUgGPs](?=[\s'"`,=\d]|$)|--(?:euid|uid|pgroup|group|parent|session)\b)/u,
  },
]

/** Only code is read: a .md or .json file under tests/ holds words about scans, not scans. */
const isCode = (path: string): boolean => /\.(?:[cm]?[jt]sx?|sh)$/u.test(path)
const isAComment = (text: string): boolean => /^\s*(?:\/\/|\/\*|\*)/u.test(text)
/** The marker and its reason, which ends where the line or its comment does. KEPT_ON_PURPOSE holds no character a pattern reads. */
const THE_MARKER = new RegExp(String.raw`${KEPT_ON_PURPOSE}[ \t]*(.*?)[ \t]*(?:\*\/)?[ \t]*$`, 'u')
/** The marker's comment at the end of a line, left out of the line's key, so marking a line keeps its key. */
const THE_MARKER_AT_THE_END = new RegExp(String.raw`\s*(?:\/\/|\/\*)\s*${KEPT_ON_PURPOSE}.*$`, 'u')

/** The reason a line is kept for, read on the line or on the comment line just above it, or null. An empty reason keeps nothing. */
function theReasonOf(text: string, above: string | undefined): string | null {
  for (const one of [text, ...(above !== undefined && isAComment(above) ? [above] : [])]) {
    const reason = THE_MARKER.exec(one)?.[1] ?? ''
    if (reason !== '') return reason
  }
  return null
}

/**
 * EVERY LINE OF THESE THAT READS THE WHOLE MACHINE, in the order given. `files` are the lines a run adds under tests/,
 * with their numbers at the tip. A comment line is not read, and neither is a file that is not code.
 */
export function theMachineWideScansIn(files: readonly { path: string; added: readonly { line: number; text: string }[] }[]): AScanOfTheWholeMachine[] {
  const scans: AScanOfTheWholeMachine[] = []
  for (const file of files) {
    if (!file.path.startsWith('tests/') || !isCode(file.path)) continue
    const byLine = new Map(file.added.map((one) => [one.line, one.text]))
    const seen = new Map<string, number>()
    for (const { line, text } of file.added) {
      if (isAComment(text)) continue
      const scan = SCANS.find((one) => one.pattern.test(text) && !(one.unless?.test(text) ?? false))
      if (scan === undefined) continue
      const keyed = `machine-wide:${file.path}:${scan.what}:${text.replace(THE_MARKER_AT_THE_END, '').trim()}`
      const times = (seen.get(keyed) ?? 0) + 1
      seen.set(keyed, times)
      const keptBecause = theReasonOf(text, byLine.get(line - 1))
      scans.push({
        key: times === 1 ? keyed : `${keyed}#${times}`,
        path: file.path,
        line,
        keptBecause,
        says:
          keptBecause === null
            ? `${file.path}:${line} ${scan.reads}. A test looks only at what it made: other programs' folders and processes are there too, other users' ` +
              `among them, so the test's answer can depend on them. What to do: ${scan.instead}. If the test must read the whole machine, write ` +
              `"${KEPT_ON_PURPOSE} <why>" on the line or on the line above it; the seal then records the line as kept, with that reason.`
            : `${file.path}:${line} ${scan.reads}, and is marked "${KEPT_ON_PURPOSE} ${keptBecause}". The seal records it as kept, with that reason.`,
      })
    }
  }
  return scans
}

/**
 * WHAT THE SEAL RECORDS OF EACH MACHINE-WIDE LINE THE REMINDER NAMED, from the same finder on the lines at the seal: no
 * longer found, kept with the reason written, or not decided. None of the three refuses the seal.
 */
export function theDecisionsOnTheScans(named: readonly ANamedItem[], foundNow: readonly AScanOfTheWholeMachine[]): AScanDecided[] {
  const now = new Map(foundNow.map((one) => [one.key, one]))
  return named
    .filter((one) => one.about === 'machine-wide test')
    .map((one): AScanDecided => {
      const scan = now.get(one.key)
      if (scan === undefined) return { key: one.key, decision: 'no longer found' }
      return scan.keptBecause === null ? { key: one.key, decision: 'not decided' } : { key: one.key, decision: 'kept', reason: scan.keptBecause }
    })
}
