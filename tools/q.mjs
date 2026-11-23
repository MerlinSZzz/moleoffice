// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * RUN A NOISY COMMAND AND REPORT THE CONCLUSION, keeping the full output on disk.
 *
 * Why this exists. An agent's context is a fixed budget and a test run spends 4,000 lines of it to
 * say one thing: they passed. Measured on this repository, raw command output was 27% of the main
 * agent's context — most of it lines nobody read, and it is the older messages that get discarded
 * when the window fills. The verification is not the problem. Carrying the transcript of the
 * verification in working memory is.
 *
 *     node tools/q.mjs npm test
 *     node tools/q.mjs --tail 20 npx tsc --noEmit
 *     node tools/q.mjs --grep 'Tests ' npm test
 *
 * WHAT IT GUARANTEES, in order of importance:
 *
 * 1. **A failure is never quieter than a success.** A non-zero exit prints FAILED on the first
 *    line, with the lines that look like errors and the tail of the output. There is no flag that
 *    suppresses it and no digest rule that can swallow it.
 * 2. **The full output survives** in `.logs/`, named and printed on every run, so any claim made
 *    from a digest can be checked against the bytes it came from.
 * 3. **The digest says how much it is not showing.** `1 of 4213 lines` is the honest form; a digest
 *    that looked complete would be the fake-success rule broken by the tool meant to serve it.
 *
 * WHAT IT IS NOT. Not a logging framework and not a test runner wrapper — it runs one program, tees,
 * and prints a summary. It knows about four commands (below) only in the sense of preferring one
 * line of their output over the last ten. Anything it does not recognise gets a plain tail.
 *
 * IT RUNS NO SHELL. The first word is the program and every later word reaches it exactly as given.
 * Until 25 September 2026 it joined its words with spaces and handed the line to a shell, so
 * `-t "two words"` reached vitest as two words, which vitest read as file filters, and the whole
 * suite started (problem `Lu7-0gPjXnvJ`). No caller needed the shell: tools/accept.mjs passes a
 * program and its arguments, and every documented use is a program and its arguments. For a pipe
 * or `&&`, name the shell yourself: `node tools/q.mjs sh -c 'a && b'`.
 */

import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createWriteStream, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileNameStamp } from '../src/shared/time.ts'

const args = process.argv.slice(2)
let tail = 10
let grep = null
let label = null

while (args.length > 0 && args[0].startsWith('--')) {
  const flag = args.shift()
  if (flag === '--') break
  else if (flag === '--tail') tail = Number(args.shift())
  else if (flag === '--grep') grep = new RegExp(args.shift())
  else if (flag === '--label') label = args.shift()
  else {
    console.error(`q.mjs: unknown flag ${flag}. Flags are --tail N, --grep RE, --label NAME, then the command.`)
    process.exit(2)
  }
}
if (args.length === 0) {
  console.error('q.mjs: give it a command. e.g. node tools/q.mjs npm test')
  process.exit(2)
}

// The command as a reader would type it, for the first line and the digest. A word with a space or
// a quote in it is shown in JSON quotes, so the line shows where each word begins and ends.
const command = args.map((word) => (/^[\w@%+=:,./-]+$/.test(word) ? word : JSON.stringify(word))).join(' ')
mkdirSync('.logs', { recursive: true })
// The label is in the filename so a directory listing reads as a history of what was run, and the
// clock with a random part makes it unique without a counter that two parallel runs would both claim.
const slug = (label ?? args[0].replace(/[^a-z0-9]+/gi, '-')).slice(0, 40)
// THE LOG IS NAMED FROM THE LOCAL WALL CLOCK, with its milliseconds (chapter 4 rule 8; acceptance finding 63), and
// eight random hex characters after them: two runs can start in the same millisecond, and the second wrote over the
// first's log (item 2b of wave 13n). The name still starts <label>-<moment>, so a listing sorts by time.
const logPath = join('.logs', `${slug}-${fileNameStamp(new Date())}-${randomBytes(4).toString('hex')}.log`)
const log = createWriteStream(logPath)
// A log that cannot be written must not stop q before its digest. With no listener, the stream's 'error' would end q at
// once with a stack trace. The first error is kept here, and the close handler says it after the digest.
let logFailed = null
log.on('error', (error) => {
  logFailed ??= error
})

/**
 * What is worth printing from a command that SUCCEEDED. One line from a test run beats ten, and a
 * command nobody has taught this tool about gets its tail, which is where summaries usually are.
 */
const DIGESTS = [
  { when: /vitest|npm (run )?test/, lines: /^\s*(Test Files|Tests|Duration|Errors)\s/ },
  { when: /playwright/, lines: /^\s*\d+ (passed|failed|skipped|flaky)/ },
  { when: /tsc/, lines: /error TS|\bFound \d+ error/ },
  { when: /vite build|npm run build/, lines: /built in|✓ \d+ modules|dist\// },
]

/** Lines that mean something went wrong, whatever produced them. Deliberately generous. */
const TROUBLE = /\berror\b|\bfailed\b|\bFAIL\b|✗|✘|✖|Error:|AssertionError|Exception|Traceback|\bENOENT\b|\bEADDRINUSE\b/i

// THE SUITE LEASE STOOD HERE AND IS GONE, with a decision of 11 September 2026.
// It only ever engaged when a parent set MOLE_OFFICE_LEASE_CONTEXT, and the one writer of that
// variable was tools/the-inspector.mjs, which no longer sets it. For every ordinary caller — which
// is everybody on the team, every day — this was already a no-op, so its removal changes nothing
// anyone will notice. What protects a worktree now is tools/live-processes.mjs.

const started = Date.now()
const child = spawn(args[0], args.slice(1), { stdio: ['inherit', 'pipe', 'pipe'] })
const all = []
// A program that could not be started (not found, not executable) is reported as a failure with exit
// code 127, which is what a shell gives a command it cannot find, and it says that no shell was run.
let couldNotStart = null
child.on('error', (error) => {
  couldNotStart = error
  const line = `q.mjs could not start ${JSON.stringify(args[0])}: ${error.message}. q.mjs runs no shell, so give the program and each argument as separate words, or run a shell yourself: node tools/q.mjs sh -c '...'`
  log.write(`${line}\n`)
  all.push(line)
})

for (const stream of [child.stdout, child.stderr]) {
  let rest = ''
  stream.on('data', (chunk) => {
    log.write(chunk)
    rest += chunk.toString()
    const lines = rest.split('\n')
    rest = lines.pop() ?? ''
    for (const line of lines) all.push(line)
  })
  stream.on('end', () => {
    if (rest.length > 0) all.push(rest)
  })
}

child.on('close', (exitCode) => {
  const code = couldNotStart ? 127 : exitCode
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  // ANSI is what made `tsc --noEmit | grep "error TS"` print nothing on a broken tree, which fooled
  // two agents in one session. Strip it here so the patterns above match what a reader would see.
  const clean = all.map((l) => l.replace(/\[[0-9;]*m/g, '').trimEnd())
  const shown = []

  if (code !== 0 && clean.length <= 25) {
    // Short enough that choosing for the reader would be the only thing that could hide anything.
    shown.push(...clean)
  } else if (code !== 0) {
    const trouble = clean.filter((l) => TROUBLE.test(l) && l.trim().length > 0)
    shown.push(...trouble.slice(0, 40))
    if (trouble.length > 40) shown.push(`… and ${trouble.length - 40} more lines that look like errors`)
    shown.push('… last 20 lines …', ...clean.slice(-20))
  } else if (grep) {
    const hit = clean.filter((l) => grep.test(l))
    shown.push(...hit.slice(0, 30))
    if (hit.length === 0) shown.push(`(nothing in ${clean.length} lines matched ${grep})`)
  } else {
    const digest = DIGESTS.find((d) => d.when.test(command))
    const hit = digest ? clean.filter((l) => digest.lines.test(l) && l.trim().length > 0) : []
    shown.push(...(hit.length > 0 ? hit.slice(0, 20) : clean.filter((l) => l.trim().length > 0).slice(-tail)))
  }

  // A LINE CAP AS WELL AS A LINE COUNT. A failing assertion over rendered markup prints the whole
  // DOM on ONE line — measured at 47,000 characters from a single test — so twenty "lines" of tail
  // can be larger than the output they were meant to summarise. The count is not the cost; the
  // bytes are. What is cut is stated on the line, and the log has it whole.
  const WIDTH = 300
  // The command line is cut at the same width. tools/run-named-tests.mjs passes vitest the absolute
  // path of every file, which for the whole-tree list is about 13,000 characters. The log does not
  // hold the command, so a caller that needs the words kept keeps them itself.
  const shownCommand = command.length > WIDTH ? `${command.slice(0, WIDTH)} …(+${command.length - WIDTH} chars)` : command
  console.log(`${code === 0 ? 'OK' : `FAILED exit ${code}`}  ${shownCommand}  ${seconds}s`)
  for (const line of shown) {
    console.log(`  ${line.length > WIDTH ? `${line.slice(0, WIDTH)} …(+${line.length - WIDTH} chars)` : line}`)
  }
  // How much is NOT on the screen, said out loud. A digest that read as complete would be this
  // repository's first rule broken by the tool built to serve it.
  const kept = shown.filter((l) => clean.includes(l)).length
  console.log(`  [${kept === clean.length ? 'all' : `${kept} of`} ${clean.length} lines · full output: ${logPath}]`)
  // q EXITS ONLY WHEN THE LOG HOLDS EVERYTHING. log.end() returns before the stream has written what it still holds,
  // and process.exit() does not wait for it, so a run of 213 lines once left a log of 20. The callback comes when the
  // last write is done, or with an error if the stream failed. A stream that failed before this point answers only
  // that it was destroyed, so the error kept by the listener above is the one said. Then q says the log is not whole
  // and still exits with the command's own code, because every caller reads that code as the command's result.
  log.end((error) => {
    const failed = logFailed ?? error
    if (failed) console.error(`q.mjs could not write the full output to ${logPath}: ${failed.message}. That log is not whole.`)
    process.exit(code ?? 1)
  })
})
