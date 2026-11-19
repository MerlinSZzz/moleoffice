// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The git mirror: the exported text, committed, with a history a person can read.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Until the export is committed somewhere it is one more file on the same disk as the database it
 * is protecting. A git repository gives it three things nothing else here has: a history, a diff
 * per change, and somewhere to push.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE PROPERTY THAT MATTERS MOST: NO COMMIT WHEN NOTHING CHANGED
 * ---------------------------------------------------------------------------------------
 *
 * A mirror that commits on every run makes its own history useless. Every commit would say
 * "something happened" and none of them would mean it, and the first question anybody asks a
 * mirror — "what changed while I was away" — would have no answer.
 *
 * So the export is byte-identical when the data is (src/server/lib/export.ts explains how), and
 * this file asks git whether anything is staged rather than deciding for itself. Two runs with no
 * writes between them produce ONE commit, and tests/export-mirror.test.ts proves it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY NOTHING HERE SPAWNS A PROCESS, WHICH IS NOT AN OVERSIGHT
 * ---------------------------------------------------------------------------------------
 *
 * A7's standing rule is that one interface talks to the operating system: `OsProbe` in
 * src/server/lib/resources.ts, which holds the only `node:child_process` import in `src/` and the
 * only signal Mole Office sends. `tests/resources.test.ts` enforces it by grepping every file under
 * `src/` — it is not a comment, it is a test — and it exists because that rule was quietly false
 * for two months and cost a second reader of /proc nobody knew about.
 *
 * `OsProbe` has no method for running an arbitrary command. So this file holds every decision the
 * mirror makes and NO way of carrying them out: it takes a `GitRunner`, and the only
 * implementation of one lives in `scripts/export.ts`, which is outside `src/` and therefore
 * outside the rule. That seam is also what lets a test drive a real repository without this file
 * knowing what a process is.
 *
 * The consequence is stated rather than hidden: `POST /api/export` writes the files and does not
 * commit them, because the server cannot spawn git. When `OsProbe` gains a `runCommand`, this
 * file needs no change — the endpoint passes it in. See design/durability/FORMAT.md §11.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { REPO_ROOT as THE_INSTALLS_ROOT } from '../../config/settings.mjs'
import {
  EXPORTED_REGIONS,
  FORMAT_VERSION,
  parseExportFile,
  exportRoot,
  writeExport,
  type ExportReport,
} from './export.ts'

// ============================================================================ the seam

/** What running one git command produced. Nothing here throws; every outcome is described. */
export interface GitOutcome {
  /** The process's exit status, or null when git could not be run at all. */
  status: number | null
  stdout: string
  stderr: string
  /** Why git could not be run — not installed, killed, timed out. Null when it ran. */
  failure: string | null
}

/**
 * Run git with these arguments in this directory.
 *
 * Synchronous, because the mirror is a sequence of steps where each one's answer decides the
 * next, and a promise chain would add nothing but ceremony. The only implementation is
 * `systemGit` in scripts/export.ts; a test supplies its own.
 */
export type GitRunner = (args: readonly string[], cwd: string) => GitOutcome

/** The mirror refused to do something. Every message says what and what to do about it. */
export class MirrorError extends Error {
  override readonly name = 'MirrorError'
}

// ============================================================================ the guards

/**
 * File names that must never reach a commit, with the reason each is here.
 *
 * `.env` holds this machine's own settings, and is where any secret would go. `*.db` is the
 * database this export exists to protect and is 516
 * KB of binary that would defeat the whole point of a readable mirror. `node_modules` is generated.
 *
 * THIS IS A GUARD AND NOT A .gitignore, on purpose. An ignore file makes the problem invisible: the
 * secret sits in the mirror directory, unversioned, and the next person to run `git add -f` or to
 * copy the directory takes it with them. A refusal names the file and stops.
 */
const FORBIDDEN: { matches: (name: string) => boolean; why: string }[] = [
  {
    matches: (name) => name === '.env' || (name.startsWith('.env.') && name !== '.env.example'),
    why: 'it is where a secret would live, and a secret in a git history is a secret that has leaked',
  },
  {
    matches: (name) => /\.db(-wal|-shm|-journal)?$/.test(name),
    why: 'it is the database this export exists to protect — binary, and not readable text',
  },
  { matches: (name) => name === 'node_modules', why: 'it is generated, and nothing generated belongs in a mirror' },
]

/** Where this checkout of Mole Office is, so the mirror can refuse to commit the source repository. */
const REPO_ROOT = resolve(THE_INSTALLS_ROOT)

/**
 * Refuse a root that would turn the mirror into a commit of Mole Office itself.
 *
 * A `--to` that names this checkout would write the export into the source tree, `git add -A`
 * would then stage `.env`, `data/panelx.db` and `node_modules`, and the FORBIDDEN check above
 * would catch it — but only after the files were written into somebody's working tree. This
 * catches it first, and it also catches an ancestor of the repository, where the same thing
 * happens one directory up.
 */
function assertRootIsNotTheRepository(root: string): void {
  const full = resolve(root)
  if (full === REPO_ROOT || REPO_ROOT.startsWith(`${full}${sep}`)) {
    throw new MirrorError(
      `${full} is the Mole Office repository (or holds it), and the mirror will not commit there. The mirror is a ` +
        `repository of its own holding nothing but the export — committing it into the source tree would stage ` +
        `.env, the database and node_modules. Point --to somewhere else; the default is ${exportRoot()}.`,
    )
  }
}

/** Everything under the root except `.git`, as paths relative to it. */
function contentsOf(root: string): string[] {
  const out: string[] = []
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git') continue
      const full = join(dir, entry.name)
      out.push(relative(root, full).split(sep).join('/'))
      if (entry.isDirectory()) visit(full)
    }
  }
  if (existsSync(root)) visit(root)
  return out
}

/** Refuse to commit a tree holding a secret or a generated artefact. */
function assertNothingForbidden(root: string): void {
  const found: string[] = []
  for (const path of contentsOf(root)) {
    const name = path.slice(path.lastIndexOf('/') + 1)
    for (const rule of FORBIDDEN) {
      if (rule.matches(name)) found.push(`${path} — ${rule.why}`)
    }
  }
  if (found.length > 0) {
    throw new MirrorError(
      `the mirror at ${root} holds ${found.length} file(s) that must never be committed, so nothing was ` +
        `committed:\n  ${found.join('\n  ')}\nRemove them from the mirror directory and run it again. They were ` +
        `not deleted here, because deleting somebody's file is not this tool's decision to make.`,
    )
  }
}

// ============================================================================ running git

/** Run git and refuse the whole mirror if it did not succeed. Used where only success is usable. */
function git(runner: GitRunner, args: readonly string[], cwd: string): string {
  const outcome = runner(args, cwd)
  if (outcome.failure !== null) {
    throw new MirrorError(`git ${args.join(' ')} could not be run: ${outcome.failure}`)
  }
  if (outcome.status !== 0) {
    const said = (outcome.stderr.trim() || outcome.stdout.trim()).split('\n')[0] ?? ''
    throw new MirrorError(`git ${args.join(' ')} exited ${String(outcome.status)}${said === '' ? '' : `: ${said}`}`)
  }
  return outcome.stdout
}

/**
 * The identity a mirror commit is authored as, when the repository has none of its own.
 *
 * NOT AN INVENTED PERSON, AND NOT A GUESS AT WHO IS AT THE KEYBOARD. Who changed the data is
 * recorded per row in `changes`, with actor type, actor id and session, and that is the
 * attribution this product means. A commit here says only which program wrote the files. If the
 * mirror repository already has an identity configured, it is left alone.
 */
const MIRROR_AUTHOR = { name: 'Mole Office', email: 'mole-office@localhost' }

/** Make sure `root` is a git repository, creating one if it is not. */
function ensureRepository(runner: GitRunner, root: string): 'created' | 'already there' {
  if (existsSync(join(root, '.git'))) return 'already there'
  git(runner, ['init'], root)
  // A fixed initial branch name, so two machines that disagree about init.defaultBranch produce
  // the same mirror. Older git without --initial-branch is handled by setting the ref by hand.
  const named = runner(['symbolic-ref', 'HEAD', 'refs/heads/main'], root)
  if (named.status !== 0 && named.failure === null) {
    throw new MirrorError(`git could not set the mirror's initial branch: ${named.stderr.trim()}`)
  }
  return 'created'
}

/**
 * Give the repository an identity only if it has none, so a person's own settings win.
 *
 * BOTH HALVES OR NEITHER. A machine can have a global `user.email` and no global `user.name`, and
 * filling in only the missing half produced `Mole Office <someone@example.com>` — a commit that reads
 * as the program using a person's address. An identity is a pair, so it is set as a pair.
 */
function ensureIdentity(runner: GitRunner, root: string): void {
  const email = runner(['config', 'user.email'], root)
  const name = runner(['config', 'user.name'], root)
  if (email.failure !== null) throw new MirrorError(`git could not be run: ${email.failure}`)
  const configured = email.status === 0 && email.stdout.trim() !== '' && name.status === 0 && name.stdout.trim() !== ''
  if (configured) return
  git(runner, ['config', 'user.email', MIRROR_AUTHOR.email], root)
  git(runner, ['config', 'user.name', MIRROR_AUTHOR.name], root)
}

// ============================================================================ the commit message

/** The row counts a previous export recorded, read back out of its own manifest. */
function previousCounts(root: string): Record<string, number> | null {
  const manifest = join(root, 'MANIFEST.md')
  if (!existsSync(manifest)) return null
  try {
    const parsed = parseExportFile(readFileSync(manifest, 'utf8'), 'MANIFEST.md')
    const region = parsed.regions.find((r) => r.name === 'manifest')
    if (region === undefined) return null
    const counts: Record<string, number> = {}
    for (const [key, value] of Object.entries(region.fields)) {
      if (typeof value === 'number') counts[key] = value
    }
    return counts
  } catch {
    // An unreadable previous manifest is not a reason to refuse a backup. It costs the deltas in
    // the commit subject and nothing else, and the subject says "counts" instead of "+2 records".
    return null
  }
}

/** `+2 records, -1 links`, or an empty list when no count moved. */
function deltas(now: Readonly<Record<string, number>>, before: Readonly<Record<string, number>> | null): string[] {
  if (before === null) return []
  const out: string[] = []
  for (const region of EXPORTED_REGIONS) {
    const then = before[region]
    const nowCount = now[region] ?? 0
    if (then === undefined || then === nowCount) continue
    const change = nowCount - then
    out.push(`${change > 0 ? '+' : ''}${change} ${region}`)
  }
  return out
}

/** How many files changed in each part of the export, for the body of the message. */
function byArea(paths: readonly string[]): string[] {
  const counts = new Map<string, number>()
  for (const path of paths) {
    const at = path.indexOf('/')
    const area = at === -1 ? path : `${path.slice(0, at)}/`
    counts.set(area, (counts.get(area) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([area, n]) => `  ${area}  ${n}`)
}

/**
 * The commit message: a subject saying what moved, and a body saying where the archive now stands.
 *
 * The subject carries no date. Git already stamps every commit, and a date in the subject would be
 * one more thing that differs between two commits of identical data.
 */
export function commitMessage(report: ExportReport, before: Readonly<Record<string, number>> | null): { subject: string; body: string } {
  const moved = deltas(report.counts, before)
  const changedFiles = report.written.length + report.removed.length
  const subject =
    before === null
      ? `First export: ${EXPORTED_REGIONS.map((r) => `${report.counts[r] ?? 0} ${r}`).join(', ')}`
      : moved.length > 0
        ? `Export: ${moved.join(', ')}`
        : `Export: ${changedFiles} file${changedFiles === 1 ? '' : 's'} changed, no row added or removed`

  const width = Math.max(...EXPORTED_REGIONS.map((r) => r.length))
  const table = EXPORTED_REGIONS.map((region) => {
    const nowCount = report.counts[region] ?? 0
    const then = before?.[region]
    const delta = then === undefined || then === nowCount ? '' : `  (${nowCount - then > 0 ? '+' : ''}${nowCount - then})`
    return `${region.padEnd(width)}  ${String(nowCount).padStart(6)}${delta}`
  })

  const body = [
    `${report.written.length} file(s) written, ${report.removed.length} removed, ${report.unchanged} unchanged.`,
    ...byArea([...report.written, ...report.removed]),
    '',
    ...table,
    '',
    ...(report.notes.length > 0 ? [...report.notes.map((n) => `NOTE: ${n}`), ''] : []),
    `Format ${FORMAT_VERSION}. This text is the archive; the database itself is committed nowhere.`,
    'The contract it obeys is design/durability/FORMAT.md in the Mole Office repository.',
  ].join('\n')

  return { subject, body }
}

// ============================================================================ the mirror

export interface MirrorOptions {
  /** Where the export and its repository live. Defaults to `mirror/` beside the database. */
  root?: string
  /** How git is run. There is no default: see the header for why nothing here spawns. */
  git: GitRunner
}

export interface MirrorReport {
  root: string
  /** What the export wrote, so a caller does not have to run it twice to find out. */
  export: ExportReport
  repository: 'created' | 'already there'
  /** The commit that was made, or null when there was nothing to commit. */
  committed: { hash: string; subject: string } | null
  /**
   * Why nothing was committed, in words. Null when something was.
   *
   * Said rather than left to a null, because "the mirror is up to date" and "the mirror did not
   * run" look identical from the outside and only one of them is fine.
   */
  quiet: string | null
}

/**
 * Write the export and commit it, unless nothing changed.
 *
 * The order matters and each step is here for a reason:
 *
 *   1. Read the previous manifest, BEFORE writing over it, so the commit subject can say what moved.
 *   2. Refuse a root that is the source repository, before writing anything into it.
 *   3. Write the export, pruning files it no longer produces.
 *   4. Refuse a tree holding a secret or a generated artefact, before anything is staged.
 *   5. Stage everything, then ASK GIT whether anything is staged. Git decides, not this file.
 *   6. Commit only if it is.
 */
export function mirror(options: MirrorOptions): MirrorReport {
  const root = options.root ?? exportRoot()
  assertRootIsNotTheRepository(root)

  const before = previousCounts(root)
  const report = writeExport(root)

  assertNothingForbidden(root)
  const repository = ensureRepository(options.git, root)
  ensureIdentity(options.git, root)

  git(options.git, ['add', '-A'], root)
  const staged = git(options.git, ['status', '--porcelain'], root).trim()
  if (staged === '') {
    return {
      root,
      export: report,
      repository,
      committed: null,
      quiet:
        'nothing changed since the last export, so no commit was made. The mirror is up to date — this is the ' +
        'answer, not a failure.',
    }
  }

  const { subject, body } = commitMessage(report, before)
  git(options.git, ['commit', '-m', subject, '-m', body], root)
  const hash = git(options.git, ['rev-parse', 'HEAD'], root).trim()

  return { root, export: report, repository, committed: { hash, subject }, quiet: null }
}

/**
 * What the mirror can say about itself without running git.
 *
 * `POST /api/export` uses this: the server may read files and may not spawn processes, so it can
 * say whether a repository is there and it cannot say what is in it. Answering the second half
 * with a guess would be worse than not answering it.
 */
export function mirrorStatus(root: string = exportRoot()): { root: string; exists: boolean; isRepository: boolean } {
  return {
    root,
    exists: existsSync(root),
    isRepository: existsSync(join(root, '.git')),
  }
}
