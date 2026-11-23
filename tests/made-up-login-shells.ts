// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MADE-UP LOGIN SHELLS FOR THE TESTS OF READING THE USER'S PATH (src/config/the-users-own-path.mjs). Wave 13u, round 242.
 *
 * NO REAL LOGIN SHELL RUNS, AND NO FILE OF ANY HOME IS READ. A made-up shell is a /bin/sh script in the test's own temp
 * folder. It writes down the words it was started with, does what the test asks a startup file to do, sets its PATH to
 * the made-up entries the test names, and runs the command it was given with `/bin/sh -c`, which reads no startup file.
 * So the office's own command, `echo` and `printenv PATH` between two markers, really runs, and nothing else does.
 *
 * `printenv` is the one program that command needs. The made-up PATH ends with a folder of the made-up shell's own that
 * holds only a link to this machine's printenv, so no other program of this machine is on a made-up PATH.
 *
 * Seven test files use this, one for each claim about the login shell:
 *   tests/the-users-path-is-read-between-the-markers-and-joined-after-the-offices-own.test.ts
 *   tests/a-login-shell-reads-its-input-from-dev-null.test.ts
 *   tests/a-login-shell-that-never-answers-is-stopped-with-all-it-started.test.ts
 *   tests/a-login-shell-with-no-markers-or-no-start-is-not-read.test.ts
 *   tests/a-sandboxed-office-keeps-its-containers-path.test.ts
 *   tests/the-start-at-login-unit-names-the-offices-own-path.test.ts
 *   tests/a-tool-only-the-users-shell-holds-is-installed-on-every-reader.test.ts
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** What a made-up startup file does before the command runs. */
export interface WhatTheStartupFilesDo {
  /** Print a line, and then text with no line end, before the markers; and a line after them. */
  printAroundTheMarkers?: boolean
  /** Read all of its standard input, and write down what it read and whether it was /dev/null. */
  readsItsInput?: boolean
  /** Start a program that never ends, and wait for it, so the shell never answers. */
  neverAnswers?: boolean
  /** End the shell before the command runs, so no marker is printed. */
  endsBeforeTheCommand?: boolean
}

/** A made-up login shell, and what it has written down. */
export interface AMadeUpLoginShell {
  /** The shell's program: what the office is told the password entry names. */
  program: string
  /** The PATH the shell prints, entry by entry: the test's entries, then the folder that holds printenv. */
  path: string[]
  /** The words of each start before the command, in order: "-l -c" for a login shell asked to run one command. */
  starts: () => string[]
  /** What a startup file read from standard input, or null where none read it. */
  input: () => string | null
  /** Whether that input was /dev/null, or null where no startup file looked. */
  inputWasDevNull: () => boolean | null
  /** The process numbers of the shell and of the program it started, where it was told never to answer. */
  pids: () => number[]
  /** The lines a startup file prints around the markers, where it was told to. */
  printed: { before: string; unended: string; after: string }
}

const PRINTED = {
  before: 'a line a made-up startup file printed',
  unended: 'text a made-up startup file left with no line end',
  after: 'a line a made-up logout file printed',
}

/** This machine's printenv, which the office's command runs. */
function thePrintenvProgram(): string {
  const found = ['/usr/bin/printenv', '/bin/printenv'].find((one) => existsSync(one))
  if (found === undefined) throw new Error('This machine has no printenv in /usr/bin or /bin, so a made-up login shell cannot run the office\'s command.')
  return found
}

/** Text inside single quotes for /bin/sh. The test's own folders hold no quote; one that did is refused. */
function quotedForSh(text: string): string {
  if (text.includes("'")) throw new Error(`A made-up login shell cannot be written with a quote in a path: ${text}`)
  return `'${text}'`
}

/**
 * WRITE A MADE-UP LOGIN SHELL into a new folder `dir`. Its PATH is `entries`, then a folder of its own holding printenv.
 */
export function writeAMadeUpLoginShell(dir: string, entries: readonly string[], does: WhatTheStartupFilesDo = {}): AMadeUpLoginShell {
  mkdirSync(dir, { recursive: true })
  const itsPrintenv = join(dir, 'printenv-only')
  mkdirSync(itsPrintenv, { recursive: true })
  symlinkSync(thePrintenvProgram(), join(itsPrintenv, 'printenv'))
  const path = [...entries, itsPrintenv]
  const file = (name: string) => quotedForSh(join(dir, name))
  const lines = ['#!/bin/sh', `printf '%s %s\\n' "$1" "$2" >> ${file('starts')}`]
  if (does.readsItsInput) {
    lines.push(`if [ /dev/stdin -ef /dev/null ]; then echo yes > ${file('input-was-dev-null')}; else echo no > ${file('input-was-dev-null')}; fi`)
    lines.push(`/bin/cat > ${file('input')}`)
  }
  if (does.neverAnswers) {
    lines.push(`echo $$ >> ${file('pids')}`)
    lines.push(`${quotedForSh(process.execPath)} -e 'setInterval(() => {}, 1000)' &`)
    lines.push(`echo $! >> ${file('pids')}`)
    lines.push('wait')
  }
  if (does.endsBeforeTheCommand) lines.push(`echo ${quotedForSh(PRINTED.before)}`, 'exit 0')
  if (does.printAroundTheMarkers) lines.push(`echo ${quotedForSh(PRINTED.before)}`, `printf '%s' ${quotedForSh(PRINTED.unended)}`)
  lines.push(`PATH=${quotedForSh(path.join(':'))}`, 'export PATH', '/bin/sh -c "$3"')
  if (does.printAroundTheMarkers) lines.push(`echo ${quotedForSh(PRINTED.after)}`)
  const program = join(dir, 'made-up-login-shell')
  writeFileSync(program, `${lines.join('\n')}\n`)
  chmodSync(program, 0o755)
  const read = (name: string): string | null => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), 'utf8') : null)
  return {
    program,
    path,
    starts: () => (read('starts') ?? '').split('\n').filter((line) => line !== ''),
    input: () => read('input'),
    inputWasDevNull: () => {
      const said = read('input-was-dev-null')
      return said === null ? null : said.trim() === 'yes'
    },
    pids: () => (read('pids') ?? '').split('\n').filter((line) => line !== '').map(Number),
    printed: PRINTED,
  }
}

/** Whether a process of this number is running. A process this test may not signal is running too. */
export function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}
