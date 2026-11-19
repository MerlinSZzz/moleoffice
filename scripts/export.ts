// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Write Mole Office out as readable text, and commit it.
 *
 *   npx tsx scripts/export.ts                 write to mirror/ beside the database, and commit
 *   npx tsx scripts/export.ts --to <dir>      write somewhere else
 *   npx tsx scripts/export.ts --no-commit     write the files and leave git alone
 *   npx tsx scripts/export.ts --json          print the report as JSON instead of prose
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE ONLY SPAWN IN THE PRODUCT'S GIT PATH IS IN THIS FILE
 * ---------------------------------------------------------------------------------------
 *
 * A7's rule is that one interface talks to the operating system — `OsProbe` in
 * src/server/lib/resources.ts — and tests/resources.test.ts enforces it by grepping every file
 * under `src/` for `node:child_process`. `OsProbe` has no way to run an arbitrary command, so
 * src/server/lib/gitmirror.ts holds every decision the mirror makes and none of the doing, and
 * takes a `GitRunner`. `systemGit` below is the only implementation, and it lives here because
 * `scripts/` is outside the rule.
 *
 * That is why `POST /api/export` writes files and does not commit them. It is a real limitation
 * and it is written down rather than worked around; design/durability/FORMAT.md §11 says what
 * closing it costs.
 *
 * ---------------------------------------------------------------------------------------
 * WHY .env IS LOADED HERE AND WHY THE DATABASE PATH IS PRINTED
 * ---------------------------------------------------------------------------------------
 *
 * The store is opened from the settings' database path, which reads MOLE_OFFICE_DB, and defaults to
 * ./data/mole-office.db when it is unset. A .env naming a different database, unread, would mean this
 * script backing up a file nobody uses while reporting complete success. So .env is read first,
 * every import that could reach the database is dynamic and happens after, and the resolved path
 * is printed on every run. This project has lost an afternoon to acting on a confident answer
 * about the wrong database; the fix is to say which one out loud.
 */

import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadPanelEnv } from '../src/server/lib/env.ts'
import type { GitOutcome, GitRunner } from '../src/server/lib/gitmirror.ts'

// ---------------------------------------------------------------------------- the git runner

/**
 * Run git as a child process.
 *
 * Never through a shell: the arguments are passed as an array, so a commit message holding a
 * quote, a backtick or a Chinese title cannot become part of a command line. Titles here include
 * a Chinese title and `Transplant v2 › Sense the pot`, so this is not hypothetical.
 *
 * A failure is described rather than thrown, because "git is not installed" and "git said no" are
 * different answers and the mirror decides what to do with each.
 */
export const systemGit: GitRunner = (args: readonly string[], cwd: string): GitOutcome => {
  const r = spawnSync('git', [...args], {
    cwd,
    encoding: 'utf8',
    timeout: 60_000,
    maxBuffer: 32 * 1024 * 1024,
    // No shell, and no inherited stdio: everything git says is captured so the caller can put it
    // in a message rather than having it appear in the middle of this script's own output.
    shell: false,
  })
  if (r.error) {
    const code = (r.error as NodeJS.ErrnoException).code
    return {
      status: null,
      stdout: '',
      stderr: '',
      failure:
        code === 'ENOENT'
          ? 'git is not installed on this machine, so the export was written but nothing was committed'
          : r.error.message,
    }
  }
  if (r.signal) {
    return { status: null, stdout: r.stdout ?? '', stderr: r.stderr ?? '', failure: `git was killed by ${r.signal}` }
  }
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', failure: null }
}

// ---------------------------------------------------------------------------- the command line

interface Options {
  to: string | null
  commit: boolean
  json: boolean
}

/** Read argv, or refuse with a sentence. An unknown flag is a mistake and is never ignored. */
export function readOptions(argv: readonly string[]): Options | { help: string } {
  const options: Options = { to: null, commit: true, json: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') return { help: USAGE }
    else if (arg === '--no-commit') options.commit = false
    else if (arg === '--json') options.json = true
    else if (arg === '--to') {
      const value = argv[i + 1]
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`--to needs a directory after it.\n\n${USAGE}`)
      }
      options.to = value
      i += 1
    } else if (arg !== undefined && arg.startsWith('--to=')) {
      options.to = arg.slice('--to='.length)
    } else {
      throw new Error(`I do not know the option ${String(arg)}.\n\n${USAGE}`)
    }
  }
  return options
}

const USAGE = [
  'Write Mole Office out as readable text, and commit it.',
  '',
  '  npx tsx scripts/export.ts [--to <dir>] [--no-commit] [--json]',
  '',
  '  --to <dir>    where the export and its git repository live. Default: mirror/ beside the database',
  '  --no-commit   write the files and leave git alone',
  '  --json        print the report as JSON',
  '',
  'The format is specified in design/durability/FORMAT.md.',
].join('\n')

// ---------------------------------------------------------------------------- running it

/**
 * Whether this file was started directly, rather than imported by a test for `systemGit`.
 *
 * Compared as real paths, because argv[1] is however the caller spelled it — relative, or through
 * a symlink — and import.meta.url is absolute. Under vitest argv[1] is the runner, so importing
 * this module gives a test the runner and runs nothing.
 */
function startedDirectly(): boolean {
  const entry = process.argv[1]
  if (entry === undefined) return false
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

async function main(): Promise<void> {
  const parsed = readOptions(process.argv.slice(2))
  if ('help' in parsed) {
    console.log(parsed.help)
    return
  }

  // Before anything that could open a database. Values already in the real environment win, so
  // `MOLE_OFFICE_DB=/tmp/x.db npx tsx scripts/export.ts` still points where it was told. The three lines
  // this used to spell out itself now live in lib/env.ts, which db/client.ts calls for every
  // command that opens a database; the call is kept here because the ordering is this file's point.
  loadPanelEnv()

  // THE STORE IS OPENED READ-ONLY, AND BEFORE lib/export.ts IS IMPORTED, so the export reads this handle and the
  // office's read-write client is never loaded. The client switches the file to write-ahead logging as it opens it,
  // which changed a store this command only reads.
  const { openTheStoreToExport } = await import('../src/server/lib/the-store-to-export.ts')
  const store = openTheStoreToExport()
  const { exportRoot, writeExport } = await import('../src/server/lib/export.ts')
  const { mirror } = await import('../src/server/lib/gitmirror.ts')

  const root = parsed.to ?? exportRoot()
  // Printed on every run, and first, so an export of the wrong database can never be a surprise
  // that is discovered later.
  const from = store.name

  if (!parsed.commit) {
    const report = writeExport(root)
    if (parsed.json) console.log(JSON.stringify({ from, ...report }, null, 2))
    else printExport(from, report.root, report, 'no commit was asked for')
    store.close()
    return
  }

  const report = mirror({ root, git: systemGit })
  if (parsed.json) {
    console.log(JSON.stringify({ from, ...report }, null, 2))
  } else {
    printExport(from, report.root, report.export, null)
    console.log(`repository:   ${report.repository}`)
    if (report.committed === null) console.log(`commit:       none — ${String(report.quiet)}`)
    else console.log(`commit:       ${report.committed.hash.slice(0, 10)}  ${report.committed.subject}`)
  }
  store.close()
}

/** The prose report. Numbers a person can check, then anything that could not be answered cleanly. */
function printExport(
  from: string,
  root: string,
  report: { files: number; bytes: number; written: string[]; removed: string[]; unchanged: number; counts: Record<string, number>; notes: string[] },
  why: string | null,
): void {
  console.log(`database:     ${from}`)
  console.log(`export:       ${root}`)
  console.log(
    `files:        ${report.files} (${report.written.length} written, ${report.removed.length} removed, ${report.unchanged} unchanged), ${report.bytes.toLocaleString('en-GB')} bytes`,
  )
  console.log(`rows:         ${Object.entries(report.counts).map(([k, v]) => `${k} ${v}`).join(', ')}`)
  for (const note of report.notes) console.log(`note:         ${note}`)
  if (why !== null) console.log(`commit:       none — ${why}`)
}

if (startedDirectly()) {
  try {
    await main()
  } catch (err) {
    // A message and a non-zero exit, never a stack trace as the whole answer. Everything this can
    // throw is a sentence written to be read: a bad option, a refused root, a secret in the mirror.
    console.error(err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  }
}
