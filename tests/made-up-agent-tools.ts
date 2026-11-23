// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MADE-UP AGENT TOOLS FOR THE TESTS OF SETTING UP A CODING TOOL: a made-up codex, opencode and claude, each a script on
 * a made-up PATH inside the test's own temp folder. Wave 13u, round 242.
 *
 * Seven test files use this, one per claim of src/server/lib/setting-up-an-agent-tool.ts:
 *   tests/a-tool-on-the-terminals-path-is-installed-on-every-reader.test.ts
 *   tests/the-persons-own-message-opens-a-first-install-once.test.ts
 *   tests/a-key-reaches-the-tools-own-login-on-stdin-only.test.ts
 *   tests/the-opencode-key-login-falls-back-to-its-own-terminal-login.test.ts
 *   tests/an-account-sign-in-answers-its-address-and-code.test.ts
 *   tests/a-sign-in-answers-only-the-address-its-tool-declares.test.ts
 *   tests/a-sign-in-code-reaches-only-the-sign-in-its-press-started.test.ts
 *
 * NO REAL TOOL RUNS. The folder this writes is meant to be the only folder on the PATH, so no codex, opencode or claude
 * installed on this machine is found. Each made-up program is a /bin/sh line that starts this test process's own Node,
 * by its absolute path, on one CommonJS file beside it, so the PATH needs nothing else. What each says is made up here
 * after what the real tool printed on this machine (codex-cli 0.159.2, OpenCode 1.18.31, Claude Code 2.1.281), and no
 * account or key is used.
 *
 * WHAT EACH MADE-UP TOOL DOES, by the words it is given:
 *   --version                           prints its version.
 *   its status command                  says signed in when its marker file is there, and not signed in otherwise.
 *   its key login (codex, opencode)     reads all of its standard input, writes down what it read, and is signed in when
 *                                       the input ended as the real tool needs: a newline for codex, a carriage return
 *                                       for opencode. With `failsItsLogin` it ends with 1 and signs nothing in.
 *   its account sign-in (codex, claude) prints an address and a device code, then waits until the test writes the
 *                                       file that stands for the person finishing in the browser, signs in and ends.
 *                                       It also reads its standard input, and when the input is closed it writes
 *                                       down what it read, as a key login does, and goes on waiting.
 *                                       The address it prints is A_SIGN_IN_ADDRESS until a test names another, or
 *                                       none (`printsTheAddress`).
 *
 * EVERY RUN IS WRITTEN DOWN in runs.jsonl beside it, with its words and its whole environment, and everything a key
 * login read is written down in stdin.jsonl. A test reads both to say what the office gave the tool, and how.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** The made-up programs, by the program name each agent tool's declaration gives (src/server/lib/harnesses.ts). */
export type AMadeUpProgram = 'codex' | 'opencode' | 'claude'

/** The versions the made-up tools print unless a test names another: the versions each tool's login was read on. */
export const THE_VERSIONS: Readonly<Record<AMadeUpProgram, string>> = {
  codex: 'codex-cli 0.159.2',
  opencode: '1.18.31',
  claude: '2.1.281 (Claude Code)',
}

/** The address and device code a made-up account sign-in prints. Made up: the address is on a name that never resolves. */
export const A_SIGN_IN_ADDRESS = 'https://sign-in.example.invalid/device'
export const A_DEVICE_CODE = 'MADE-UPCODE'

/** One run of a made-up tool, as it wrote itself down. */
export interface AMadeUpRun {
  program: AMadeUpProgram
  args: string[]
  env: Record<string, string>
}

/** What one key login of a made-up tool read on its standard input. */
export interface WhatALoginRead {
  program: AMadeUpProgram
  args: string[]
  stdin: string
}

/** A folder of made-up tools, and what they have written down. */
export interface MadeUpTools {
  /** The folder: the PATH to give the office, alone. */
  dir: string
  /** Every run so far, in order. */
  runs: () => AMadeUpRun[]
  /** Every key login's standard input so far, in order. */
  logins: () => WhatALoginRead[]
  /** Write the file that stands for the person finishing a tool's sign-in in the browser. */
  finishTheSignIn: (program: AMadeUpProgram) => void
  /** The address an account sign-in started from now on prints, or null for none. */
  printsTheAddress: (address: string | null) => void
  /** Sign a tool in, or out, as if it had been done before the test. */
  signedIn: (program: AMadeUpProgram, yes: boolean) => void
}

/** The one script every made-up program runs. Its first word is the program it stands for. */
const THE_SCRIPT = String.raw`'use strict'
const { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const here = __dirname
const settings = JSON.parse(readFileSync(join(here, 'made-up-tools.json'), 'utf8'))
const [program, ...args] = process.argv.slice(2)
const words = args.join(' ')
const marker = join(here, program + '.signed-in')
appendFileSync(join(here, 'runs.jsonl'), JSON.stringify({ program, args, env: process.env }) + '\n')

function readAllOfStdin(done) {
  let read = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => { read += chunk })
  process.stdin.on('end', () => done(read))
}

function aKeyLogin(endsWith) {
  readAllOfStdin((stdin) => {
    appendFileSync(join(here, 'stdin.jsonl'), JSON.stringify({ program, args, stdin }) + '\n')
    if (settings.failsItsLogin.includes(program)) { process.stderr.write('made-up login refused\n'); process.exit(1) }
    if (stdin.length > endsWith.length && stdin.endsWith(endsWith)) writeFileSync(marker, 'yes')
    process.exit(0)
  })
}

function anAccountSignIn() {
  if (settings.address !== null) process.stderr.write('Open this address in a browser: ' + settings.address + '\n')
  process.stderr.write('Then enter the code ' + settings.code + '\n')
  readAllOfStdin((stdin) => appendFileSync(join(here, 'stdin.jsonl'), JSON.stringify({ program, args, stdin }) + '\n'))
  const finish = join(here, program + '.finish-sign-in')
  setInterval(() => {
    if (!existsSync(finish)) return
    rmSync(finish)
    writeFileSync(marker, 'yes')
    process.exit(0)
  }, 50)
}

if (words === '--version') {
  process.stdout.write(settings.versions[program] + '\n')
} else if (program === 'codex' && words === 'login status') {
  process.stderr.write(existsSync(marker) ? 'Logged in using an API key\n' : 'Not logged in\n')
  process.exit(existsSync(marker) ? 0 : 1)
} else if (program === 'codex' && words === 'login --with-api-key') {
  aKeyLogin('\n')
} else if (program === 'codex' && words === 'login --device-auth') {
  anAccountSignIn()
} else if (program === 'opencode' && words === 'auth list') {
  process.stdout.write('\u001b[90m┌  Credentials\u001b[39m\n│\n└  ' + (existsSync(marker) ? 1 : 0) + ' credentials\n')
} else if (program === 'opencode' && args[0] === 'auth' && args[1] === 'login') {
  aKeyLogin('\r')
} else if (program === 'claude' && words === 'auth status --json') {
  process.stdout.write(JSON.stringify({ loggedIn: existsSync(marker), authMethod: existsSync(marker) ? 'claude.ai' : 'none' }) + '\n')
  process.exit(existsSync(marker) ? 0 : 1)
} else if (program === 'claude' && words === 'auth login --claudeai') {
  anAccountSignIn()
} else {
  process.stderr.write('The made-up ' + program + ' does not know: ' + words + '\n')
  process.exit(2)
}
`

/** Lines of JSON written by the made-up tools, or none when the file is not there yet. */
function linesOf<T>(file: string): T[] {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as T)
}

/**
 * WRITE THE MADE-UP TOOLS NAMED in `programs` into a new folder `dir`. A program not named is not there, so it reads
 * as not installed. `versions` replaces a version a made-up tool prints, and `failsItsLogin` names tools whose key
 * login ends with 1.
 */
export function writeTheMadeUpTools(
  dir: string,
  options: { programs: readonly AMadeUpProgram[]; versions?: Partial<Record<AMadeUpProgram, string>>; failsItsLogin?: readonly AMadeUpProgram[] },
): MadeUpTools {
  if (dir.includes("'") || process.execPath.includes("'")) throw new Error(`A made-up tool cannot be started from a path with a quote in it: ${dir}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'made-up-tools.json'),
    JSON.stringify({
      versions: { ...THE_VERSIONS, ...(options.versions ?? {}) },
      failsItsLogin: options.failsItsLogin ?? [],
      address: A_SIGN_IN_ADDRESS,
      code: A_DEVICE_CODE,
    }),
  )
  writeFileSync(join(dir, 'made-up-tool.cjs'), THE_SCRIPT)
  for (const program of options.programs) {
    const file = join(dir, program)
    writeFileSync(file, `#!/bin/sh\nexec '${process.execPath}' '${join(dir, 'made-up-tool.cjs')}' '${program}' "$@"\n`)
    chmodSync(file, 0o755)
  }
  return {
    dir,
    runs: () => linesOf<AMadeUpRun>(join(dir, 'runs.jsonl')),
    logins: () => linesOf<WhatALoginRead>(join(dir, 'stdin.jsonl')),
    finishTheSignIn: (program) => writeFileSync(join(dir, `${program}.finish-sign-in`), 'finished'),
    printsTheAddress: (address) => {
      const settings = JSON.parse(readFileSync(join(dir, 'made-up-tools.json'), 'utf8')) as Record<string, unknown>
      writeFileSync(join(dir, 'made-up-tools.json'), JSON.stringify({ ...settings, address }))
    },
    signedIn: (program, yes) => {
      const marker = join(dir, `${program}.signed-in`)
      if (yes) writeFileSync(marker, 'yes')
      else rmSync(marker, { force: true })
    },
  }
}

/** Runs `fn` with this process's PATH set to `path` alone, and puts the PATH back. */
export async function withThePath<T>(path: string, fn: () => Promise<T> | T): Promise<T> {
  const before = process.env['PATH']
  process.env['PATH'] = path
  try {
    return await fn()
  } finally {
    if (before === undefined) delete process.env['PATH']
    else process.env['PATH'] = before
  }
}
