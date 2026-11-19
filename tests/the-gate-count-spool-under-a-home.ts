// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE GATE-COUNT SPOOL UNDER A HOME, READ BACK LINE BY LINE (wave 13r round AC).
 *
 * The writer the host tools call, spoolAGateMet in src/config/gate-count-spool.mjs, appends to the spool in the
 * sandboxes folder, and that folder is worked out from the home by theGateCountSpoolFolder there. There is no setting
 * that names it. tests/a-test-writes-into-no-home-but-its-own.ts gives every test file a fresh home before the file is
 * collected, and a tool a test starts with a copy of the test's environment inherits that home, so a test's tools count
 * into a spool under the test's own home.
 *
 * Nothing here writes a spool. These read one, and emptyATestsOwnSpool empties a test's own spool before a case and
 * refuses a real one.
 */
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { userInfo } from 'node:os'
import { join } from 'node:path'
import { GATE_COUNT_SPOOL, readAGateCountLine, theGateCountSpoolFolder } from '../src/config/gate-count-spool.mjs'
import { localStamp } from '../src/shared/typed-time.mjs'
import { theHomeBeforeTheTests } from './the-home-before-the-tests.ts'

/** One counted line, as the office's reader takes it. */
export interface ASpoolLine { gate: string; position: string; at: string; sandbox: string | null }

/** The spool a tool on this machine writes when its home is `home`, worked out where the writer works it out. */
export function theSpoolUnder(home: string): string {
  return theGateCountSpoolFolder(home)
}

/**
 * Every line of the spool's day files, by file and then in the order written. A line the office's reader would refuse
 * fails here with its reason, so a test never counts a line the office would send to the rejects file.
 */
export function theLinesIn(spool: string): ASpoolLine[] {
  if (!existsSync(spool)) return []
  const lines: ASpoolLine[] = []
  for (const name of readdirSync(spool).sort()) {
    const day = GATE_COUNT_SPOOL.dayFile.exec(name)?.[1]
    if (day === undefined) continue
    for (const text of readFileSync(join(spool, name), 'utf8').split('\n')) {
      if (text === '') continue
      const read = readAGateCountLine(text, day)
      if ('refused' in read) throw new Error(`${join(spool, name)} holds a line the office would refuse (${read.refused}): ${text}`)
      lines.push(read.line)
    }
  }
  return lines
}

/** The mode of a file or folder, as four octal digits. */
export function theModeOf(path: string): string {
  return (statSync(path).mode & 0o777).toString(8).padStart(4, '0')
}

/** The local time a line's `at` is written in, for a test to say a line was written between two moments. */
export function aStampOf(when: Date): string {
  return localStamp(when)
}

/**
 * THE REAL SPOOLS: the one under the home this test run started with, and the one under the home the password file
 * names, which a tool started with no HOME at all would take. A test reads them and never writes them.
 */
export function theRealSpools(): string[] {
  return [...new Set([theHomeBeforeTheTests(), userInfo().homedir].map(theSpoolUnder))]
}

/**
 * Empty the spool under a test's own home, before a case. It throws and deletes nothing when the test has no home, or
 * when the spool is a real spool, which it is only when the test file runs without a home of its own. So a case that
 * lost its own home stops before it deletes the spool this machine's office reads.
 */
export function emptyATestsOwnSpool(spool: string): void {
  if ((process.env.HOME ?? '') === '' || theRealSpools().includes(spool)) {
    throw new Error(`${spool} was not emptied: it is a real spool, or this test has no home. A test file runs with a home of its own (tests/a-test-writes-into-no-home-but-its-own.ts).`)
  }
  rmSync(spool, {recursive: true, force: true})
}

/** How long each day file of a spool is, by name, so a later look can read only what was added. */
export function theLengthsIn(spool: string): Map<string, number> {
  const lengths = new Map<string, number>()
  if (!existsSync(spool)) return lengths
  for (const name of readdirSync(spool)) if (GATE_COUNT_SPOOL.dayFile.test(name)) lengths.set(name, statSync(join(spool, name)).size)
  return lengths
}

/**
 * The text added to a spool's day files since `before` was taken, as lines. It is read as text and not checked, since
 * a real spool can hold lines of another release.
 */
export function theTextAddedTo(spool: string, before: Map<string, number>): string[] {
  const added: string[] = []
  if (!existsSync(spool)) return added
  for (const name of readdirSync(spool).sort()) {
    if (!GATE_COUNT_SPOOL.dayFile.test(name)) continue
    const bytes = readFileSync(join(spool, name))
    added.push(...bytes.subarray(before.get(name) ?? 0).toString('utf8').split('\n').filter((line) => line !== ''))
  }
  return added
}
