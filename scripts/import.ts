// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Read Mole Office back in from the durable text.
 *
 *   npx tsx scripts/import.ts                    say what an import would do. Writes nothing.
 *   npx tsx scripts/import.ts --apply            do it, in one transaction, or refuse
 *   npx tsx scripts/import.ts --from <dir>       read somewhere other than mirror/ beside the database
 *   npx tsx scripts/import.ts --json             print the plan or the report as JSON
 *
 * ---------------------------------------------------------------------------------------
 * WHY DOING NOTHING IS THE DEFAULT, WHEN THE EXPORT'S DEFAULT IS TO WRITE
 * ---------------------------------------------------------------------------------------
 *
 * They are not symmetrical operations. An export writes files beside a database and the worst it
 * can do is produce a file nobody wanted. An import writes the database, and it can rename two
 * hundred records because somebody edited one line by hand. So the command that is easiest to type
 * is the one that shows you what would happen, and applying it takes a word you had to mean.
 *
 * Nothing about that is a warning without teeth: the plan lists every row and every column that
 * would move, so `--apply` is pressed by somebody who has read the diff rather than by somebody who
 * has read a promise.
 *
 * ---------------------------------------------------------------------------------------
 * WHY .env IS LOADED HERE AND WHY THE DATABASE PATH IS PRINTED FIRST
 * ---------------------------------------------------------------------------------------
 *
 * src/server/db/client.ts reads MOLE_OFFICE_DB the moment it is imported and defaults to
 * ./data/panelx.db when it is unset. A .env naming a different database, unread, would mean this
 * script writing into a database nobody meant to touch while reporting complete success. So .env is
 * read first, every import that could reach a database is dynamic and happens after, and the
 * resolved path is printed on every run — before the plan, and before anything is applied. This
 * project has lost an afternoon to acting on a confident answer about the wrong database.
 */

import { fileURLToPath } from 'node:url'
import { realpathSync } from 'node:fs'
import { loadPanelEnv } from '../src/server/lib/env.ts'

// ---------------------------------------------------------------------------- the command line

interface Options {
  from: string | null
  apply: boolean
  json: boolean
}

/** Read argv, or refuse with a sentence. An unknown flag is a mistake and is never ignored. */
export function readOptions(argv: readonly string[]): Options | { help: string } {
  const options: Options = { from: null, apply: false, json: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') return { help: USAGE }
    else if (arg === '--apply') options.apply = true
    else if (arg === '--json') options.json = true
    else if (arg === '--from') {
      const value = argv[i + 1]
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`--from needs a directory after it.\n\n${USAGE}`)
      }
      options.from = value
      i += 1
    } else if (arg !== undefined && arg.startsWith('--from=')) {
      options.from = arg.slice('--from='.length)
    } else {
      throw new Error(`I do not know the option ${String(arg)}.\n\n${USAGE}`)
    }
  }
  return options
}

const USAGE = [
  'Read Mole Office back in from the durable text.',
  '',
  '  npx tsx scripts/import.ts [--from <dir>] [--apply] [--json]',
  '',
  '  --from <dir>  where the archive is. Default: mirror/ beside the database',
  '  --apply       actually write it. Without this, nothing is written and the plan is printed',
  '  --json        print the plan or the report as JSON',
  '',
  'It applies all of the archive or none of it, in one transaction. A refusal names every file,',
  'every line and every reason, and writes nothing.',
  '',
  'The format is specified in design/durability/FORMAT.md.',
].join('\n')

// ---------------------------------------------------------------------------- printing

/** The shape both `planImport` and `applyImport` hand back, named here so this file needs no import. */
interface PlanLike {
  root: string
  ok: boolean
  refusals: { path: string; line: number; problem: string }[]
  notes: string[]
  read: Record<string, number>
  inserts: Record<string, number>
  updates: Record<string, number>
  unchanged: Record<string, number>
  notInArchive: Record<string, number>
  rows: { region: string; key: string; action: string; columns: string[]; path: string }[]
}

/** Numbers a person can check, then every row that moves, then everything said in words. */
function printPlan(from: string, plan: PlanLike, applied: boolean): void {
  console.log(`database:     ${from}`)
  console.log(`archive:      ${plan.root}`)
  const total = (counts: Record<string, number>): number => Object.values(counts).reduce((n, v) => n + v, 0)
  console.log(
    `rows read:    ${total(plan.read)} — ${Object.entries(plan.read).map(([k, v]) => `${k} ${v}`).join(', ')}`,
  )
  console.log(
    `would change: ${total(plan.inserts)} inserted, ${total(plan.updates)} updated, ` +
      `${plan.rows.filter((row) => row.action === 'delete').length} deleted, ${total(plan.unchanged)} already identical`,
  )

  for (const row of plan.rows) {
    const what = row.action === 'update' ? `update ${row.columns.join(', ')}` : row.action
    console.log(`  ${row.region} ${row.key} — ${what}   (${row.path})`)
  }
  for (const note of plan.notes) console.log(`note:         ${note}`)
  for (const refusal of plan.refusals) {
    console.log(`REFUSED:      ${refusal.path === '' ? '(the archive)' : `${refusal.path}:${refusal.line}`} — ${refusal.problem}`)
  }

  if (!plan.ok) {
    console.log('')
    console.log(`Nothing was written. ${plan.refusals.length} problem(s) above; fix them and run this again.`)
    return
  }
  console.log('')
  if (applied) {
    console.log('Applied, in one transaction. Importing the same text again will change nothing.')
  } else {
    console.log('NOTHING WAS WRITTEN. This is the plan; add --apply to apply it.')
  }
}

// ---------------------------------------------------------------------------- running it

/**
 * Whether this file was started directly, rather than imported by a test for `readOptions`.
 *
 * Compared as real paths, because argv[1] is however the caller spelled it — relative, or through a
 * symlink — and import.meta.url is absolute. Under vitest argv[1] is the runner, so importing this
 * module gives a test the runner and runs nothing.
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
  // `MOLE_OFFICE_DB=/tmp/x.db npx tsx scripts/import.ts` still points where it was told. The three lines
  // this used to spell out itself now live in lib/env.ts, which db/client.ts calls for every
  // command that opens a database; the call is kept here because the ordering is this file's point.
  loadPanelEnv()

  const { sqlite } = await import('../src/server/db/client.ts')
  const { exportRoot } = await import('../src/server/lib/export.ts')
  const { ImportRefused, applyImport, planImport } = await import('../src/server/lib/import.ts')

  const root = parsed.from ?? exportRoot()
  const from = sqlite.name

  try {
    if (!parsed.apply) {
      const plan = planImport(root)
      if (parsed.json) console.log(JSON.stringify({ from, applied: false, ...plan }, null, 2))
      else printPlan(from, plan, false)
      // A plan that would be refused exits non-zero, so a script that runs this as a check finds
      // out. A clean plan exits zero even though it wrote nothing, because it answered the question.
      if (!plan.ok) process.exitCode = 1
      return
    }
    const report = applyImport(root)
    if (parsed.json) console.log(JSON.stringify({ from, ...report }, null, 2))
    else printPlan(from, report, true)
  } catch (err) {
    if (!(err instanceof ImportRefused)) throw err
    if (parsed.json) console.log(JSON.stringify({ from, applied: false, ...err.plan }, null, 2))
    else printPlan(from, err.plan, false)
    process.exitCode = 1
  } finally {
    sqlite.close()
  }
}

if (startedDirectly()) {
  try {
    await main()
  } catch (err) {
    // A message and a non-zero exit, never a stack trace as the whole answer. Everything this can
    // throw is a sentence written to be read: a bad option, a missing archive, a refused row.
    console.error(err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  }
}
