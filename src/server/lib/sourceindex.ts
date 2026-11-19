// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The DERIVED layer: a source index built by scanning the repository, and the coverage queries
 * that join it to the canonical module records.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO LAYERS, AND THE RULE THAT KEEPS THEM APART
 * ---------------------------------------------------------------------------------------
 *
 * CANONICAL is the `records` table: modules curated by a person or an agent, carrying
 * responsibility, history, decisions and engineering context. Few, stable, meaningful. A module
 * survives a refactor that moves every file it covers.
 *
 * DERIVED is what this file builds: one row per source file, with its language, size, line count,
 * modification time, content hash and the names it imports and exports. Many, volatile,
 * mechanical. It is REBUILT, not edited. Nothing a person types may live in it, because the next
 * scan would delete it.
 *
 * THE RULE: when the two disagree about a file, the scan is right about what EXISTS and the
 * module is right about what it MEANS.
 *
 * THE LINK: a module's code is stated as rows of the implementation map — repository-relative paths
 * and patterns, written through POST /api/implementation — and the index resolves them to real
 * files. `claimsOf` reads the rows. That makes the two questions answerable that a checklist
 * cannot answer:
 *
 *   unclaimedFiles()  code no module has taken responsibility for, biggest gap first
 *   staleClaims()     claims pointing at paths that are not there — almost always a rename
 *
 * Same shape as the unconsumed-results query in lib/records.ts, one level down: a thing that
 * exists with nothing pointing at it, and a pointer with nothing at the far end.
 *
 * ---------------------------------------------------------------------------------------
 * THIS FILE IS THE WHOLE OF THE DERIVED LAYER. src/server/api/source.ts IS ROUTES OVER IT
 * ---------------------------------------------------------------------------------------
 *
 * There were once TWO implementations of this scan — this file, and a second copy inside
 * api/source.ts — written in parallel by agents who could not edit each other's files. Both ran
 * CREATE TABLE IF NOT EXISTS for `source_files` and `source_index` at import, against the same
 * database, and they agreed only because one author copied the other's DDL statement for
 * statement. The next person to add a column to either one would have broken the other writer at
 * runtime, on INSERT, with nothing failing at compile time and no test naming the cause.
 *
 * So there is now one: this one. api/source.ts parses the query string, decides the HTTP status
 * and shapes the response; every fact in that response comes from here. If you are adding a
 * column, a language or a skip rule, this is the only file to change.
 *
 * WHAT THE MERGE KEPT FROM THIS FILE, each worth its lines:
 *   1. .gitignore is honoured, not just a fixed list of directory names. A generated file that
 *      git ignores is not code anybody is responsible for, and counting it makes the coverage
 *      figure wrong in the direction that looks like work to do.
 *   2. A CONTENT HASH per file, in its own table. It is what makes "changed" exact: an edit that
 *      swaps a constant leaves the size, the line count and the import list identical, and a
 *      report built by comparing those fields calls that file unchanged.
 *   3. Imports and exports are read from source with COMMENTS REMOVED. This codebase quotes
 *      import lines in prose — src/web/pages/HomePage.tsx documents itself with
 *      `import { HomePage } from './pages/HomePage.tsx'` — and without stripping, the index
 *      reports that the file imports itself, which is a dependency edge that does not exist.
 *
 * WHAT THE MERGE CARRIED IN from the copy in api/source.ts, because it was better there:
 *   1. `sourceStamp()` — the age of the index worked out on every read and never stored, the
 *      "45s"/"3h20m" form of it, and the two sentences (`howRead`, `derived`) that say how the
 *      import lists were read and that this layer is not the canonical one. A derived view that
 *      does not date itself invites somebody to trust it after a refactor.
 *   2. That stamp REFUSES rather than guesses: a stored `built_at` that is not a time is a 500
 *      naming the rebuild, not an index served without an age.
 *   3. The unreadable-row messages quote the value they could not read, so the fix does not
 *      start with a hunt for which row is corrupt.
 *   4. `reindexReport` is exported, so a comparison can be tested on two file lists directly
 *      rather than only through a scan of a real tree.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE DERIVED LAYER HAS ITS OWN TABLES INSTEAD OF LIVING IN `records`
 * ---------------------------------------------------------------------------------------
 *
 * Three reasons, in order of how much damage each does:
 *
 *  1. A SCAN WOULD OVERWRITE SOMETHING SOMEBODY WROTE. The index is replaced wholesale on every
 *     rebuild. If the rows were records, "replace wholesale" would mean deleting records — and
 *     the moment anyone added a sentence to one, the next scan would silently eat it. Records are
 *     the layer where hand-written things are safe; that has to stay true.
 *  2. IT WOULD FLOOD THE CHANGE LOG. Every write through lib/records.ts appends to `changes`, and
 *     `changes` IS the daily view — a day is a filter on that table. One rebuild would bury a
 *     fortnight of real work under hundreds of rows saying an mtime moved.
 *  3. THE CANONICAL STORE WOULD BECOME MOSTLY MACHINE NOISE. Ten modules and a hundred files
 *     means the Records page is 90% scan output, and nothing will ever link to
 *     `src/web/lib/attention.ts` by name.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE TABLES COME FROM
 * ---------------------------------------------------------------------------------------
 *
 * `source_files`, `source_index` and `source_file_hashes` are declared in src/server/db/schema.ts
 * and created by migration 0003. This file used to create them itself, with CREATE TABLE IF NOT
 * EXISTS statements running at import; that function was deleted when the declarations moved.
 *
 * There is exactly ONE `CREATE TABLE` per table and it is in a migration. That is not tidiness:
 * two writers creating one table is how the previous arrangement failed, and it fails silently —
 * the writer that reaches a new database first decides the shape, and the other one discovers the
 * disagreement on INSERT, in production, at runtime.
 *
 * ---------------------------------------------------------------------------------------
 * A CLAIM IS ONE MATCHER: A PATH, WHICH MAY CONTAIN WILDCARDS
 * ---------------------------------------------------------------------------------------
 *
 * A claim is the `pattern` of a stated row in `implementation_map`: "src/web/components/PanelGrid.tsx"
 * for one file, "src/server/api" for a directory and everything under it, "src/web/**" or
 * "tests/*-api.test.ts" for a pattern. POST /api/implementation refuses a malformed one with
 * `claimProblem`, and `resolveClaim` checks again, because a row the claims migration moved is kept
 * as it was written.
 *
 * That is ONE matcher, not two. A claim is a path; a path with no wildcard in it claims itself
 * and everything beneath it; `*` stays inside a segment and `**` crosses them. Prefix matching is
 * not a second system — it is what a pattern with no wildcards means. Two separate mechanisms
 * would be the mistake: the caller would have to know which one their string went through, and
 * `moduleFor()` would need an invented rule for which kind wins when both match.
 *
 * The plain-path form is kept because it is what people write. Forcing "src/server/api/**" for
 * "everything under src/server/api" is ceremony that gets routed around, and a claim nobody
 * writes covers nothing.
 *
 * `data.paths` is NOT read here, and that is deliberate: a PathRef points OUT of the repository
 * at a report, a CAD directory or a video on another machine — absolute, and nothing scans it.
 * Treating those as claims would report every module's report directory as a stale claim on the
 * day this shipped, when none of them is wrong.
 */

import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, type Dirent } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { claimProblem, claimProblemCode, filesMatching } from '@shared/paths.ts'
import { localStamp, parseStoredStamp } from '@shared/time.ts'
import { THE_PERSON } from '@shared/person.ts'
import {
  SOURCE_FILE_EXTENSIONS,
  type ClaimsInOneRepository,
  type CoverageInOneRepository,
  type ModuleClaims,
  type ModuleClaimsByRepository,
  type PanelRecord,
  type ReindexReport,
  type RepositoryNamed,
  type ResolvedClaim,
  type SourceChange,
  type SourceCoverage,
  type SourceFile,
  type SourceIndexStamp,
  type SourceLanguage,
  type StaleClaim,
} from '@shared/types.ts'
import { sqlite } from '../db/client.ts'
import { appendFileObservations } from './append-file-observations.ts'
import { statedFor } from '../db/stated-for.ts'
import { type Repository } from './repositories.ts'
import { listRepositories } from '../db/list-repositories.ts'
import { REPO_ROOT, settingValue } from '../../config/settings.mjs'
import {
  getRecord,
  listRecords,
  type Actor,
} from './records.ts'
import { liveMatches } from '@shared/live-matches.ts'
import { recordsByTitle } from './records-by-title.ts'
import { titleNamesMoreThanOne } from '@shared/title-names-more-than-one.ts'
import { PanelError } from './panel-error.ts'
import { indexStatus } from './index-status.ts'
import { listIndexedFiles } from './list-indexed-files.ts'
import { storedScanOf } from './stored-scan-of.ts'

// ---------------------------------------------------------------------------- configuration

/** Where the repository is when nothing says otherwise: the checkout this file lives in. */
const DEFAULT_ROOT = REPO_ROOT

/** The environment variable that points a scan at a different checkout. */
export const ROOT_VAR = 'MOLE_OFFICE_REPO_ROOT'

/**
 * The largest file that will be read.
 *
 * Two megabytes. A source file is not megabytes; something that big is generated or vendored, and
 * reading it would cost more than it tells anybody. Anything over the limit is NAMED in `skipped`
 * rather than dropped quietly — it exists, and the index says so.
 */
const MAX_FILE_BYTES = 2 * 1024 * 1024

/** The only workspace there is. Named rather than inlined so the join is easy to find later. */
// THE workspaceId IS A PARAMETER on every read and write of the three source tables below.
//
// It was `const workspaceId = 'default'`, and the cost was measured end to end: with this checkout
// indexed (242 files, 100% claimed, 0 stale), a reindex under a SECOND project's root replaced
// `source_index` and `source_files` wholesale — 2 files, 0% claimed — and every one of the first
// project's 152 claims was then reported STALE. A second project could not have a source index
// without destroying the first project's, and the destruction read as "these modules describe a
// repository that has moved on".
//
// WHAT IS STILL ONE PER PROCESS, and is a product decision rather than a bug this fixes:
// MOLE_OFFICE_REPO_ROOT. The storage is per workspace now, so two projects can each hold an index, but
// one running server still points at one checkout — so the second project's index can only be
// built by a process started with a different root. That is reported rather than papered over.

/**
 * Resolve the root to scan.
 *
 * A `MOLE_OFFICE_REPO_ROOT` pointing at nothing is an error, not a fallback to the default. Falling
 * back would index the wrong repository and report every claim in the real one as stale, which
 * reads as a codebase in trouble rather than as a typo in an environment variable.
 */
export function repoRoot(explicit?: string): string {
  // The name and the fact that absence means this checkout are declared in src/config/settings.mjs.
  const raw = explicit ?? settingValue(ROOT_VAR)
  if (raw === null || raw === undefined || raw.trim() === '') return resolve(DEFAULT_ROOT)
  const root = resolve(raw.trim())
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new PanelError(
      `${ROOT_VAR} is "${raw}", which is not a directory. Point it at the top of a checkout, for example ` +
        `${ROOT_VAR}=${resolve(DEFAULT_ROOT)}, or unset it to scan that one.`,
    )
  }
  return root
}

// ---------------------------------------------------------------------------- time

/**
 * Read one of Mole Office's own stamps back into milliseconds, or null when it is not one.
 *
 * "Guess wrong and an index built this morning reads as an hour old, or an hour in the future" is
 * what this comment used to warn about, and it was right — the browser's copy of the same rule was
 * guessing wrong the whole time. The rule lives once now, in `@shared/time.ts`.
 */
const timeOf = parseStoredStamp

/** "45s", "12m", "3h20m", "2d4h" — how long ago something was. */
function ageText(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d${hours}h`
  if (hours > 0) return `${hours}h${minutes}m`
  if (minutes > 0) return `${minutes}m`
  return `${seconds}s`
}

// ---------------------------------------------------------------------------- what is skipped

/**
 * Why a directory is not walked, or null when it is.
 *
 * Each reason is a sentence because it is reported, not just applied — an unsearched place and an
 * empty one read identically otherwise, which is how a coverage figure comes to mean nothing.
 */
function dirSkipReason(name: string): string | null {
  if (name === 'node_modules') return 'installed dependencies, which are not this project'
  if (name === 'dist') return 'build output, which is derived from files that are indexed'
  if (name === 'data') return 'the SQLite database'
  if (name.startsWith('.')) return 'a dot directory: tool, editor and version-control state'
  if (name.startsWith('_')) return SCRATCH_REASON
  return null
}

/** Said once, so the directory rule and the file rule cannot come to give different reasons. */
const SCRATCH_REASON = 'a leading underscore, which this repository uses for scratch and generated material'

/**
 * Why a FILE is not indexed on its name alone, or null when it is.
 *
 * The underscore rule, applied to files as well as to directories. It was a DIRECTORY rule only:
 * `_viz_demo/` was skipped and a `_probe.ts` written into `scripts/` was indexed, counted against
 * coverage and reported as code no module has claimed. The convention the reason names is the
 * repository's, not the directory's, and the two halves of it now say the same sentence because
 * they read it from the same constant.
 *
 * tests/source-api.test.ts asserts that no part of any indexed path begins with an underscore.
 * That assertion passed before this existed, because no such file happened to be checked in —
 * agreement by luck, which is the state this whole pass is about.
 */
function fileSkipReason(name: string): string | null {
  return name.startsWith('_') ? SCRATCH_REASON : null
}

// ---------------------------------------------------------------------------- gitignore

/**
 * One compiled .gitignore line. `base` is the repository-relative directory the file was found
 * in, because a pattern in `src/web/.gitignore` means something different from the same pattern
 * at the root.
 */
interface IgnoreRule {
  base: string
  negated: boolean
  dirOnly: boolean
  re: RegExp
}

/**
 * Turn one gitignore pattern into a regular expression.
 *
 * THE SUPPORTED SUBSET is comments, blank lines, `!` negation, directory-only patterns with a
 * trailing `/`, anchoring (a pattern with a slash anywhere but the end is relative to the file it
 * is written in; one without is matched against the basename at any depth) and the wildcards `*`,
 * `?` and `**`. Character classes are refused rather than half-applied — see compileIgnoreFile.
 * Nothing in this repository uses one.
 */
function patternToRegExp(pattern: string): RegExp {
  const hasInnerSlash = pattern.slice(0, -1).includes('/')
  const body = pattern.replace(/^\//, '')

  let re = ''
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!
    if (c === '*') {
      if (body[i + 1] === '*') {
        // `**` crosses separators; `**/` matches any number of leading directories, including none.
        i++
        if (body[i + 1] === '/') {
          i++
          re += '(?:.*/)?'
        } else {
          re += '.*'
        }
      } else {
        re += '[^/]*'
      }
    } else if (c === '?') {
      re += '[^/]'
    } else if ('\\^$.|+()[]{}'.includes(c)) {
      re += `\\${c}`
    } else {
      re += c
    }
  }

  return new RegExp(`^${hasInnerSlash ? '' : '(?:.*/)?'}${re}$`)
}

/** Compile the lines of one .gitignore found in the repository-relative directory `base`. */
function compileIgnoreFile(text: string, base: string, whereForErrors: string): IgnoreRule[] {
  const rules: IgnoreRule[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.replace(/\s+$/, '')
    if (trimmed === '' || trimmed.startsWith('#')) continue
    if (trimmed.includes('[')) {
      throw new PanelError(
        `${whereForErrors} contains "${trimmed}". This scan understands *, ? and ** but not character classes, ` +
          'and treating one as literal text would leave files in the index that you believe are ignored. Rewrite ' +
          'the pattern, or add the directory to dirSkipReason in src/server/lib/sourceindex.ts.',
      )
    }
    const negated = trimmed.startsWith('!')
    const withoutBang = negated ? trimmed.slice(1) : trimmed
    const dirOnly = withoutBang.endsWith('/')
    const pattern = dirOnly ? withoutBang.slice(0, -1) : withoutBang
    if (pattern === '') continue
    rules.push({ base, negated, dirOnly, re: patternToRegExp(pattern) })
  }
  return rules
}

/**
 * Is this path ignored?
 *
 * Git's own rule: the LAST matching pattern decides, which is what makes `!.env.example` after
 * `.env.*` work. So every rule is tried rather than stopping at the first hit.
 */
function isIgnored(rel: string, isDir: boolean, rules: readonly IgnoreRule[]): boolean {
  let ignored = false
  for (const rule of rules) {
    if (rule.dirOnly && !isDir) continue
    const relToBase = rule.base === '' ? rel : rel.slice(rule.base.length + 1)
    if (rule.re.test(relToBase)) ignored = !rule.negated
  }
  return ignored
}

// ------------------------------------------------------------------- imports and exports

/**
 * Remove comments, keeping strings intact.
 *
 * The reason is in this repository rather than in theory: Mole Office's files carry long comment blocks
 * that QUOTE import lines as advice, so without this the index reports dependencies that do not
 * exist — including src/web/pages/HomePage.tsx importing itself.
 *
 * Strings are kept because an import specifier IS a string. A `${...}` inside a template literal
 * is treated as string content, so a comment written inside a template substitution survives.
 * That is accepted: the alternative is a JavaScript parser, and this is a lexical index.
 */
function stripComments(source: string): string {
  let out = ''
  let i = 0
  const n = source.length
  while (i < n) {
    const c = source[i]!
    const next = source[i + 1]
    if (c === '/' && next === '/') {
      while (i < n && source[i] !== '\n') i++
      continue
    }
    if (c === '/' && next === '*') {
      i += 2
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        // Newlines are kept so line-anchored patterns (python's) still line up.
        if (source[i] === '\n') out += '\n'
        i++
      }
      i += 2
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c
      out += c
      i++
      while (i < n) {
        const s = source[i]!
        out += s
        i++
        if (s === '\\') {
          if (i < n) {
            out += source[i]
            i++
          }
          continue
        }
        if (s === quote) break
      }
      continue
    }
    out += c
    i++
  }
  return out
}

/** The five ways a module specifier is written in the TypeScript and JavaScript family. */
const JS_IMPORT_PATTERNS: readonly RegExp[] = [
  /\bimport\s[^;'"]*?from\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bexport\s[^;'"]*?from\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
]

const JS_FAMILY: readonly SourceLanguage[] = ['typescript', 'tsx', 'javascript', 'jsx']

/**
 * How each language says what it depends on.
 *
 * SQL is empty because a migration depends on nothing it could name — not because nothing was
 * looked for. The difference matters when somebody reads an empty list and wonders.
 */
const IMPORT_PATTERNS: Readonly<Record<SourceLanguage, readonly RegExp[]>> = {
  typescript: JS_IMPORT_PATTERNS,
  tsx: JS_IMPORT_PATTERNS,
  javascript: JS_IMPORT_PATTERNS,
  jsx: JS_IMPORT_PATTERNS,
  css: [/@import\s+(?:url\(\s*)?['"]([^'"]+)['"]/g],
  html: [/(?:src|href)\s*=\s*["']([^"'#][^"']*)["']/g],
  sql: [],
  python: [/^\s*import\s+([\w.]+)/gm, /^\s*from\s+([\w.]+)\s+import/gm],
}

const JS_DECLARED = /\bexport\s+(?:declare\s+)?(?:async\s+)?(?:function\*?|class|interface|type|enum|const|let|var)\s+([A-Za-z_$][\w$]*)/g
const JS_BRACED = /\bexport\s+(?:type\s+)?\{([^}]*)\}/g
const JS_STAR = /\bexport\s+\*\s+(?:as\s+([A-Za-z_$][\w$]*)\s+)?from\b/g
const JS_DEFAULT = /\bexport\s+default\b/
const PY_DECLARED = /^(?:async\s+)?(?:def|class)\s+([A-Za-z_]\w*)/gm

/** Every first capture group of every pattern, in the order they appear, without repeats. */
function captures(content: string, patterns: readonly RegExp[]): string[] {
  const found: string[] = []
  for (const pattern of patterns) {
    // These are module-level constants carrying /g, so lastIndex has to be reset: a shared
    // regular expression keeps its position between calls and would skip half of the next file.
    pattern.lastIndex = 0
    for (const match of content.matchAll(pattern)) {
      const value = match[1]
      if (value !== undefined && value !== '' && !found.includes(value)) found.push(value)
    }
  }
  return found
}

function importsOf(language: SourceLanguage, content: string): string[] {
  return captures(content, IMPORT_PATTERNS[language])
}

function exportsOf(language: SourceLanguage, content: string): string[] {
  if (language === 'python') return captures(content, [PY_DECLARED])
  if (!JS_FAMILY.includes(language)) return []

  const names = captures(content, [JS_DECLARED])

  JS_BRACED.lastIndex = 0
  for (const match of content.matchAll(JS_BRACED)) {
    const inside = match[1]
    if (inside === undefined) continue
    for (const entry of inside.split(',')) {
      const parts = entry.trim().replace(/^type\s+/, '').split(/\s+as\s+/)
      const name = (parts[parts.length - 1] ?? '').trim()
      if (name !== '' && !names.includes(name)) names.push(name)
    }
  }

  JS_STAR.lastIndex = 0
  for (const match of content.matchAll(JS_STAR)) {
    const alias = match[1] ?? '*'
    if (!names.includes(alias)) names.push(alias)
  }

  if (JS_DEFAULT.test(content) && !names.includes('default')) names.push('default')
  return names
}

/**
 * How many lines a file has, counted the way an editor shows them: a trailing newline ends the
 * last line rather than starting an empty one.
 */
function lineCount(content: string): number {
  if (content === '') return 0
  const lines = content.split('\n').length
  return content.endsWith('\n') ? lines - 1 : lines
}

// ---------------------------------------------------------------------------- the scan

/** Everything one walk found, and everything it did not look at. */
export interface ScanResult {
  files: SourceFile[]
  /** sha256 of each file's bytes, keyed by path. Stored beside the index; see the header. */
  hashes: Map<string, string>
  /** One sentence per thing the scan did not look at. An unsearched place is not an empty one. */
  skipped: string[]
  scanMs: number
}

/**
 * Walk a repository and describe every source file in it.
 *
 * Pure: it takes a root and returns data, touching neither the database nor HTTP. It never throws
 * on one bad file — a file that cannot be read is reported in `skipped` and the walk continues,
 * because an index that gives up over one odd permission is an index nobody can use, and the
 * reason it stopped would be invisible. The one thing it does refuse is an unreadable .gitignore
 * rule, because that changes which files are in the index at all.
 */
export function scanTree(root: string): ScanResult {
  const startedAt = Date.now()
  const files: SourceFile[] = []
  const hashes = new Map<string, string>()
  /**
   * Skips, gathered by reason, so the report reads as sentences and not as a list. Directories
   * and files land in the same map: what a reader wants is "what was not looked at and why", and
   * splitting that by whether the thing was a folder would answer a question nobody asked.
   */
  const skippedPaths = new Map<string, string[]>()
  /** Extensions the index does not cover, with how many files carry each. */
  const otherFiles = new Map<string, number>()
  const ignored: string[] = []
  const problems: string[] = []

  const walk = (dir: string, prefix: string, rules: readonly IgnoreRule[]): void => {
    let entries: Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch (err) {
      problems.push(`${prefix === '' ? '.' : prefix} could not be listed: ${err instanceof Error ? err.message : String(err)}`)
      return
    }

    let localRules = rules
    const ignoreFile = join(dir, '.gitignore')
    if (existsSync(ignoreFile)) {
      const where = `${prefix === '' ? '' : `${prefix}/`}.gitignore`
      localRules = [...rules, ...compileIgnoreFile(readFileSync(ignoreFile, 'utf8'), prefix, where)]
    }

    for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`

      // A symlink is not followed. It can point outside the repository or back into it, and an
      // index reporting the same file twice under two paths would double-count coverage.
      if (entry.isSymbolicLink()) {
        problems.push(`${relative} is a symbolic link and was not followed`)
        continue
      }

      if (entry.isDirectory()) {
        const reason = dirSkipReason(entry.name)
        if (reason !== null) {
          const already = skippedPaths.get(reason) ?? []
          already.push(relative)
          skippedPaths.set(reason, already)
          continue
        }
        if (isIgnored(relative, true, localRules)) {
          ignored.push(`${relative}/`)
          continue
        }
        walk(join(dir, entry.name), relative, localRules)
        continue
      }

      if (!entry.isFile()) continue

      // Checked before the extension, so a scratch file is reported as SKIPPED rather than
      // counted among the extensions the index does not cover. Both are honest; only one says
      // which rule was applied.
      const fileSkip = fileSkipReason(entry.name)
      if (fileSkip !== null) {
        const already = skippedPaths.get(fileSkip) ?? []
        already.push(relative)
        skippedPaths.set(fileSkip, already)
        continue
      }

      const ext = extname(entry.name).toLowerCase()
      const language = SOURCE_FILE_EXTENSIONS[ext]
      if (language === undefined) {
        const label = ext === '' ? '(no extension)' : ext
        otherFiles.set(label, (otherFiles.get(label) ?? 0) + 1)
        continue
      }
      if (isIgnored(relative, false, localRules)) {
        ignored.push(relative)
        continue
      }

      const full = join(dir, entry.name)
      try {
        const stat = statSync(full)
        if (stat.size > MAX_FILE_BYTES) {
          problems.push(
            `${relative} is ${stat.size.toLocaleString('en-GB')} bytes, over the ${MAX_FILE_BYTES.toLocaleString('en-GB')} ` +
              'byte limit, so it is listed nowhere in this index — it exists, and nothing here describes it',
          )
          continue
        }
        const bytes = readFileSync(full)
        const content = bytes.toString('utf8')
        // Comments are removed before anything is read out of the source. See stripComments.
        const readable = JS_FAMILY.includes(language) ? stripComments(content) : content
        files.push({
          path: relative,
          language,
          sizeBytes: stat.size,
          lines: lineCount(content),
          imports: importsOf(language, readable),
          exports: exportsOf(language, readable),
          modifiedAt: localStamp(stat.mtime),
        })
        hashes.set(relative, createHash('sha256').update(bytes).digest('hex'))
      } catch (err) {
        problems.push(`${relative} could not be read: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  walk(root, '', [])
  files.sort((a, b) => a.path.localeCompare(b.path))

  const skipped: string[] = []
  for (const [reason, paths] of skippedPaths) skipped.push(`${paths.sort().join(', ')} — ${reason}`)
  if (otherFiles.size > 0) {
    const listed = [...otherFiles.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([ext, count]) => `${count} ${ext}`)
      .join(', ')
    skipped.push(
      `${listed} — the index covers source text only, which is ${Object.keys(SOURCE_FILE_EXTENSIONS).sort().join(' ')}. ` +
        'These files are in the repository and are counted here so the coverage figure is over a set you can see.',
    )
  }
  if (ignored.length > 0) {
    skipped.push(
      `${ignored.sort().join(', ')} — ignored by a .gitignore. Git does not track them, so no module is ` +
        'responsible for them, and counting them would make the unclaimed list longer than the work it stands for.',
    )
  }
  skipped.push(...problems)

  return { files, hashes, skipped, scanMs: Date.now() - startedAt }
}

// ---------------------------------------------------------------------------- storage

// The three derived tables are declared in src/server/db/schema.ts and created by migration 0003.
// Every column carries its note there. What is worth repeating beside the queries that use them:
//
// WHY THEY ARE NOT THE `records` TABLE is the section of this file's header called "why the
// derived layer has its own tables": a rebuild replaces every row, so rows that were records
// would mean deleting records and eating anything a person had written on one; every write
// through lib/records.ts appends to `changes`, which IS the daily view, so one rebuild would bury
// a fortnight of real work under hundreds of rows saying an mtime moved; and ten curated modules
// next to a hundred scanned files makes the Records page mostly machine noise.
//
// `source_files` is one row per file, `source_index` is one row per workspace saying which scan
// produced them. They are apart so a rebuild can be atomic: the file rows and the stamp that
// describes them are written in one transaction, and nothing can read a fresh file list under a
// stale build time.
//
// `source_file_hashes` is a side table rather than a column on `source_files` for one reason
// worth keeping: `SourceFile` in shared/types.ts is the shape the browser draws and the API
// serves, and a hash is of no use to either. Keeping it beside the row rather than in it means
// the served shape stays exactly what somebody reading the types expects.
//
// No extra indexes. Every query reads the whole table — a repository is hundreds of rows, not
// millions — and an index nothing uses still has to be maintained on every rebuild.

export interface IndexRow {
  built_at: string
  built_by: string
  root: string
  scan_ms: number
  skipped: string
}

export interface FileRow {
  path: string
  language: string
  size_bytes: number
  lines: number
  imports: string
  exports: string
  modified_at: string
}

export { parseNames } from './index-status.ts'

export { listIndexedFiles } from './list-indexed-files.ts'

/** One file by its repository-relative path, or null. */
export function indexedFile(path: string, workspaceId: string): SourceFile | null {
  return listIndexedFiles(workspaceId).find((f) => f.path === path) ?? null
}

/**
 * The stored content hashes, keyed by path — but only the ones that describe the index as it
 * stands now.
 *
 * Every hash carries the build stamp it was written under, and a hash from any other build is not
 * returned at all. One rebuild writes the file rows and their hashes in a single transaction, so
 * in normal use every hash matches; the guard is for the databases where they do not. There are
 * real ones on disk: every index written before the two scanners were merged has file rows and no
 * hashes at all, because the copy in api/source.ts did not know this table existed.
 *
 * Comparing against a hash from a different scan would report "contents changed" for a file
 * nobody has touched. Returning nothing instead makes the rebuild report say nothing about
 * content rather than something false — the whole difference between a stale answer and a wrong
 * one.
 */
export function storedHashes(workspaceId: string): Map<string, string> {
  const status = indexStatus(workspaceId)
  if (status === null) return new Map()
  const rows = sqlite
    .prepare('SELECT path, hash FROM source_file_hashes WHERE workspace_id = ? AND repository_id IS NULL AND built_at = ?')
    .all(workspaceId, status.builtAt) as { path: string; hash: string }[]
  return new Map(rows.map((r) => [r.path, r.hash]))
}

/**
 * When the WORKSPACE SCAN was last built, and what it looked at. Null when it never has been.
 *
 * BOTH THE STAMP AND THE COUNT ARE THE WORKSPACE SCAN'S, because the two are one fact and reading
 * them from different owners gives a count under a date that does not describe it. The stamp query
 * used to take any `source_index` row for the workspace and the count took every `source_files` row,
 * so after an implementation rebuild the age could come from a repository while the count came from
 * both sets. This answers about the scan whose `repository_id` is NULL, which is this file's own.
 */
export interface IndexStatus {
  builtAt: string
  builtBy: string
  root: string
  scanMs: number
  skipped: string[]
  fileCount: number
}

export { indexStatus } from './index-status.ts'

// ---------------------------------------------------------------------------- the stamp

/**
 * How imports and exports are read, said out loud because the method has limits.
 *
 * Carried over from api/source.ts, where it was written, and kept next to the code it describes:
 * a sentence about how the scan reads a file drifts from the scan the moment the two live in
 * different files.
 */
const HOW_READ =
  'Imports and exports are read by pattern, not by a parser: TypeScript, JavaScript and Python declare both, ' +
  'CSS (@import) and HTML (src, href) declare imports only, and a SQL migration declares neither. A name inside ' +
  'a comment or a string can therefore appear, and an unusual form can be missed. This is for navigation, not ' +
  'for analysis — nothing in Mole Office decides anything from these lists.'

/** The sentence that stops this being mistaken for the canonical layer. */
const DERIVED_NOTE =
  'This index is DERIVED: it is rebuilt by scanning the repository and never edited, so it is right about what ' +
  'exists only as of builtAt. What a file MEANS lives on the module that claims it. Rebuild with POST /api/source/reindex.'

/**
 * The stamp that goes on every source answer, with the age worked out NOW.
 *
 * The age is never stored. A stored age is wrong the moment it is written, and wrong silently,
 * which is the whole failure mode this stamp exists to close.
 *
 * An unreadable `built_at` refuses rather than reporting an age of zero: a derived view that
 * cannot say how old it is must not be served, because "0s old" is exactly what a caller wants to
 * hear and exactly what would let them trust a file list from before a refactor.
 */
export function sourceStamp(status: IndexStatus): SourceIndexStamp {
  const builtMs = timeOf(status.builtAt)
  if (builtMs === null) {
    throw new PanelError(
      `The stored build time of the source index reads "${status.builtAt}", which is not a time, so Mole Office cannot ` +
        'say how old the index is — and it will not serve a file list it cannot date. Rebuild it with POST /api/source/reindex.',
      500,
    )
  }
  const ageSeconds = Math.max(0, Math.floor((Date.now() - builtMs) / 1000))

  return {
    builtAt: status.builtAt,
    ageSeconds,
    age: ageText(ageSeconds),
    fileCount: status.fileCount,
    root: status.root,
    scanMs: status.scanMs,
    builtBy: status.builtBy,
    skipped: status.skipped,
    howRead: HOW_READ,
    derived: DERIVED_NOTE,
  }
}

/**
 * The status, or a refusal naming the command that fixes it.
 *
 * Every coverage query goes through here. An index that has never been built must not answer
 * "nothing is unclaimed" — that is the same sentence a fully covered repository produces, and it
 * is the exact shape of silent fallback this project refuses.
 */
function requireStatus(workspaceId: string): IndexStatus {
  const status = indexStatus(workspaceId)
  if (!status) {
    throw new PanelError(
      'The source index has never been built, so nothing can be said about coverage. Build it with ' +
        '`npx tsx scripts/reindex.ts`, or POST /api/source/reindex.',
      409,
    )
  }
  return status
}

/**
 * Replace the whole index in one transaction: the file rows, the hashes and the stamp that
 * describes them go together.
 *
 * REBUILD, NEVER MERGE. A scan that failed half way would otherwise leave an index that is a
 * mixture of two moments, and that is worse than a stale one: a stale index is wrong as of a date
 * it states, whereas a half-updated one reports perfectly plausible coverage and nothing about it
 * looks wrong. Merging would also mean deciding what a row the scan did not produce means —
 * deleted, or not looked at? — and every wrong answer to that question is silent.
 */
const replaceIndex = sqlite.transaction((scan: ScanResult, meta: IndexRow, workspaceId: string, report: ReindexReport) => {
  // ONLY THE ROWS THIS SCAN OWNS. This scan names no repository, so its rows are the ones whose
  // `repository_id` is NULL, and those are the rows it replaces. The delete used to be a bare
  // `workspace_id = ?`, which removed the implementation index's named rows as well and left that
  // index reading `indexed false` with no way back except a rebuild. Two writers share this table;
  // each removes what it is about to rewrite and touches nothing of the other's.
  sqlite.prepare('DELETE FROM source_files WHERE workspace_id = ? AND repository_id IS NULL').run(workspaceId)
  sqlite.prepare('DELETE FROM source_file_hashes WHERE workspace_id = ? AND repository_id IS NULL').run(workspaceId)

  const insertFile = sqlite.prepare(
    'INSERT INTO source_files (workspace_id, path, language, size_bytes, lines, imports, exports, modified_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
  const insertHash = sqlite.prepare(
    'INSERT INTO source_file_hashes (workspace_id, path, hash, built_at) VALUES (?, ?, ?, ?)',
  )
  for (const file of scan.files) {
    insertFile.run(
      workspaceId,
      file.path,
      file.language,
      file.sizeBytes,
      file.lines,
      JSON.stringify(file.imports),
      JSON.stringify(file.exports),
      file.modifiedAt,
    )
    const hash = scan.hashes.get(file.path)
    if (hash !== undefined) insertHash.run(workspaceId, file.path, hash, meta.built_at)
  }

  // THE STAMP IS REPLACED THE SAME WAY THE ROWS ABOVE ARE, and it used to be an upsert keyed on
  // `ON CONFLICT (workspace_id)`. That clause stopped matching anything the day `repository_id`
  // joined the key of this table, and SQLite says so out loud — "ON CONFLICT clause does not match
  // any PRIMARY KEY or UNIQUE constraint" — so this is a rewrite of the statement rather than a
  // change of behaviour. Deleting and inserting inside this transaction leaves exactly the state the
  // upsert left, and it says the rule this whole function is built on: rebuild, never merge.
  //
  // `repository_id` IS NOT WRITTEN, so it reads NULL: nobody has said which repository this is. The
  // writer that can name one arrives with the map that mints repository ids, and guessing here would
  // put an id on a scan that nothing registered.
  // The stamp goes with the rows it describes, and it is scoped the same way, or a reindex would
  // delete a repository's built_at while leaving that repository's files in place — the same fault
  // one table over.
  sqlite.prepare('DELETE FROM source_index WHERE workspace_id = ? AND repository_id IS NULL').run(workspaceId)
  sqlite
    .prepare(
      `INSERT INTO source_index (workspace_id, built_at, built_by, root, scan_ms, skipped)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(workspaceId, meta.built_at, meta.built_by, meta.root, meta.scan_ms, meta.skipped)

  // AND WHAT THIS SCAN SAW, APPENDED TO THE LEDGER NOTHING REBUILDS, IN THIS TRANSACTION.
  //
  // The three tables above are derived and are replaced whole, so the comparison this rebuild just
  // computed exists for one reply and is then unrecoverable. A work domain accepted on Tuesday
  // cannot ask on Friday what changed unless somebody kept it. `appendFileObservations` is what
  // keeps it, and it is called from INSIDE the transaction that replaces the index because a hole
  // in a ledger that answers "what changed since" reads as "nothing changed".
  //
  // `repositoryId` IS NULL HERE AND THAT IS ITS STATED MEANING. This function scans one root for a
  // whole workspace and mints no repository id; the map's own rebuild passes one. A null is not a
  // stand-in for a repository and nothing reads it as one.
  return appendFileObservations({
    workspaceId,
    repositoryId: null,
    seenAt: meta.built_at,
    report,
    hashes: scan.hashes,
  })
})

// ---------------------------------------------------------------------------- what changed

/** How two readings of the same file differ, in words. Empty when they do not. */
function differences(before: SourceFile, after: SourceFile, contentChanged: boolean | null): string[] {
  const what: string[] = []
  if (before.sizeBytes !== after.sizeBytes) {
    what.push(`${before.sizeBytes.toLocaleString('en-GB')} -> ${after.sizeBytes.toLocaleString('en-GB')} bytes`)
  }
  if (before.lines !== after.lines) what.push(`${before.lines} -> ${after.lines} lines`)
  if (before.language !== after.language) what.push(`${before.language} -> ${after.language}`)

  const listChange = (which: string, was: readonly string[], is: readonly string[]): void => {
    const added = is.filter((name) => !was.includes(name))
    const gone = was.filter((name) => !is.includes(name))
    if (added.length > 0) what.push(`${which} added: ${added.join(', ')}`)
    if (gone.length > 0) what.push(`${which} gone: ${gone.join(', ')}`)
  }
  listChange('imports', before.imports, after.imports)
  listChange('exports', before.exports, after.exports)

  // The hash is what makes this exact. An edit that swaps one constant leaves the size, the line
  // count and both lists identical, and everything above would call the file unchanged.
  if (contentChanged === true && what.length === 0) what.push('contents changed, same size and shape')
  if (before.modifiedAt !== after.modifiedAt && what.length === 0) {
    what.push(`touched ${before.modifiedAt} -> ${after.modifiedAt}, contents identical`)
  }
  return what
}

/** The sha256 of each file before and after, when the caller has them. */
export interface ReportHashes {
  before: ReadonlyMap<string, string>
  after: ReadonlyMap<string, string>
}

/**
 * What a rebuild changed, file by file against what was there before.
 *
 * This is the answer to "is anything I was told still true?", and it is why a rebuild reports
 * rather than merely succeeding: a scan that silently replaced 200 rows tells a caller who is
 * holding an older reading nothing at all.
 *
 * `hashes` is optional because not every caller has them. `rebuildIndex` always passes both maps;
 * a caller comparing two file lists it is holding — the tests, and anything reading an index
 * written before hashes were stored — cannot. Missing hashes mean the comparison falls back to
 * the fields and says nothing about content, rather than saying something it cannot support.
 *
 * Exported so a comparison can be exercised on two file lists directly, which is the only way to
 * test a rename: nothing may point a scan at an arbitrary directory over HTTP.
 */
export function reindexReport(
  before: SourceFile[] | null,
  after: SourceFile[],
  previousBuiltAt: string | null,
  hashes?: ReportHashes,
): ReindexReport {
  if (before === null) {
    return { firstScan: true, previousBuiltAt: null, added: after.map((f) => f.path), removed: [], changed: [], unchanged: 0 }
  }

  const was = new Map(before.map((file) => [file.path, file]))
  const added: string[] = []
  const changed: SourceChange[] = []
  let unchanged = 0

  for (const file of after) {
    const old = was.get(file.path)
    if (old === undefined) {
      added.push(file.path)
      continue
    }
    const oldHash = hashes?.before.get(file.path)
    const newHash = hashes?.after.get(file.path)
    // null means "not knowable", and is not the same as "the same".
    const contentChanged = oldHash === undefined || newHash === undefined ? null : oldHash !== newHash
    const what = differences(old, file, contentChanged)
    if (what.length === 0) unchanged += 1
    else changed.push({ path: file.path, what: what.join('; ') })
  }

  const present = new Set(after.map((f) => f.path))
  const removed = before.map((f) => f.path).filter((path) => !present.has(path))
  return { firstScan: false, previousBuiltAt, added, removed, changed, unchanged }
}

/** What one rebuild did: the stamp fields, and the comparison against the previous index. */
export interface RebuildOutcome extends IndexStatus {
  report: ReindexReport
  /**
   * The scan this rebuild appended to `file_observations`, and how many rows it wrote.
   *
   * IT IS THE SCAN'S IDENTITY AND NOT ITS STAMP, and the difference is measurable: `built_at` is a
   * local wall-clock stamp to the second, so two rebuilds inside one second carry the same one. A
   * reply that has to NAME a scan — *the index was rebuilt from nothing here, so Mole Office cannot say
   * what changed in this window* — names this.
   */
  observed: { scanId: string; rows: number }
}

/**
 * Rebuild the index from disk.
 *
 * `actor` is carried into `built_by` because every write in Mole Office is attributed. It is not
 * written to `changes`, for the reason `reader_anchors` in db/schema.ts gives: `changes` is the daily view, and a rebuild is
 * not something that happened to a record.
 */
export function rebuildIndex(opts: { workspaceId: string; root?: string; actor?: Actor }): RebuildOutcome {
  const { workspaceId } = opts
  const root = repoRoot(opts.root)
  const previous = indexStatus(workspaceId)
  const previousFiles = previous === null ? null : listIndexedFiles(workspaceId)
  const previousHashes = previous === null ? new Map<string, string>() : storedHashes(workspaceId)

  const scan = scanTree(root)
  // WHO ASKED, when nobody said. The name is read from `@shared/person.ts` rather than written
  // here, for the reason that file gives.
  const actor = opts.actor ?? { type: 'human', id: THE_PERSON }
  const meta: IndexRow = {
    built_at: localStamp(new Date()),
    built_by: `${actor.type}:${actor.id}`,
    root,
    scan_ms: scan.scanMs,
    skipped: JSON.stringify(scan.skipped),
  }
  // THE COMPARISON IS COMPUTED BEFORE THE WRITE, not after it, because the ledger append inside the
  // transaction is written FROM it. It used to be computed in the return statement; the inputs are
  // the same either way — `previousFiles` and `previousHashes` were both read before the scan — so
  // this moves the call and changes nothing about what it answers.
  const report = reindexReport(previousFiles, scan.files, previous?.builtAt ?? null, {
    before: previousHashes,
    after: scan.hashes,
  })
  const observed = replaceIndex(scan, meta, workspaceId, report)

  return {
    observed,
    builtAt: meta.built_at,
    builtBy: meta.built_by,
    root,
    scanMs: scan.scanMs,
    skipped: scan.skipped,
    fileCount: scan.files.length,
    report,
  }
}

// ---------------------------------------------------------------------------- claims

/** One claim's pattern, matched against the index by `filesMatching`, the one reader of a pattern. */
function resolveClaim(pattern: string, paths: readonly string[]): ResolvedClaim {
  const problemCode = claimProblemCode(pattern)
  const problem = claimProblem(pattern)
  return {
    pattern,
    // A malformed claim is matched against nothing: reporting "matched nothing" for an absolute
    // path would describe it as stale and send somebody looking for a file that moved.
    matched: problem === null ? filesMatching(pattern, paths) : [],
    problem,
    problemCode,
  }
}

/**
 * Why a project's stated rows cannot be counted against its workspace scan, or null when they can.
 *
 * A row's pattern is relative to the repository it names, and the workspace scan names no repository.
 * So the scan is read as the project's one repository when it holds exactly one, which is the rule the
 * claims migration (db/module-claims.ts) used to turn `data.claims` into rows. With several, this says
 * so and names them rather than picking one. Only `claimsOf` reads it: the source door, coverage, the
 * unclaimed list and the work domains count a project with registered repositories repository by
 * repository instead (`claimsByRepository`).
 */
function whyTheRowsCannotBeCounted(workspaceId: string, patterns: number): string | null {
  const repositories = listRepositories(workspaceId)
  if (repositories.length <= 1) return null
  return (
    `This project has ${repositories.length} repositories (${repositories.map((r) => r.name).join(', ')}), and the ` +
    'source index names none of them, so Mole Office cannot tell which one its files are from. ' +
    (patterns === 1
      ? 'The 1 pattern stated for this module is not counted.'
      : `None of the ${patterns} patterns stated for this module is counted.`)
  )
}

/**
 * What one module claims, resolved: its STATED rows in the implementation map.
 *
 * THE MAP IS WHERE A MODULE'S CODE IS WRITTEN. The write door refuses `claims` in a module's `data`
 * and sends the author to POST /api/implementation, and this reads the rows that door stores, through
 * `statedFor` in lib/implementation.ts. Every relation counts — implements, tests and configures —
 * because each one says the module is responsible for the file, which is what the rebuild's own
 * `coveredByStated` counts too. A GUESSED ROW COUNTS FOR NOTHING until a person accepts it, as the
 * header of lib/implementation.ts requires of every count that means ownership.
 *
 * Two rows with one pattern — say `implements` and `tests` — are one claim here, because they match
 * the same files and the answer has no word for the relation.
 */
export function claimsOf(record: PanelRecord, paths: readonly string[]): ModuleClaims {
  const base = { moduleId: record.id, moduleTitle: record.title }
  const stated = statedFor(record.id, record.workspaceId).filter((row) => row.authority === 'stated')
  const patterns = [...new Set(stated.map((row) => row.pattern))]
  if (patterns.length === 0) return { ...base, claims: [], files: [], problem: null }

  const problem = whyTheRowsCannotBeCounted(record.workspaceId, patterns.length)
  if (problem !== null) return { ...base, claims: [], files: [], problem }

  const claims = patterns.map((pattern) => resolveClaim(pattern, paths))
  const files = [...new Set(claims.flatMap((claim) => claim.matched))].sort()
  return { ...base, claims, files, problem: null }
}

/** How a repository's scan is put into its own slot, said in every answer that finds the slot empty. */
const HOW_TO_SCAN_A_REPOSITORY =
  'POST /api/source/reindex scans every registered repository that has a checkout on this machine into its own ' +
  'slot, and POST /api/implementation/rebuild does the same for one or all of them.'

export { storedScanOf } from './stored-scan-of.ts'

/** Why a registered repository with no stored scan was not counted, and how to scan it. */
function noScanOf(repo: Repository, whatIsNotCounted: string): string {
  return (
    `No scan of the repository "${repo.name}" is stored` +
    (repo.root === null ? ', and it has no checkout on this machine to scan. ' : '. ') +
    `${whatIsNotCounted} ${HOW_TO_SCAN_A_REPOSITORY}`
  )
}

/**
 * The stored scans of a project's registered repositories, or the 409 that says none is stored.
 *
 * The source door and coverage both refuse here, in these words, when a project registers repositories
 * and none of them has a stored scan. The workspace scan is named and not counted, because it does not
 * record which repository it is of.
 */
export function requireARepositoryScan(workspaceId: string, registered: readonly Repository[]): IndexStatus[] {
  const stored = registered
    .map((repo) => indexStatus(workspaceId, repo.id))
    .filter((status): status is IndexStatus => status !== null)
  if (stored.length > 0) return stored
  const named = registered.map((repo) => `"${repo.name}"`).join(', ')
  const workspaceScan = indexStatus(workspaceId)
  throw new PanelError(
    `This project has ${registered.length} registered ${registered.length === 1 ? 'repository' : 'repositories'} ` +
      `(${named}), and no scan of any of them is stored, so a module's claims cannot be counted. ` +
      (workspaceScan === null
        ? ''
        : `The one scan stored here, of ${workspaceScan.root} on ${workspaceScan.builtAt}, does not record which ` +
          'repository it is of, so it is not counted. ') +
      'Scan again with POST /api/source/reindex, which scans every registered repository that has a checkout on ' +
      'this machine into its own slot.',
    409,
  )
}

/** The oldest of several scans, because an answer counted against them is as old as its oldest part. */
export function oldestScan(stamps: readonly SourceIndexStamp[]): SourceIndexStamp {
  const first = stamps[0]
  if (first === undefined) throw new Error('oldestScan was given no scan')
  return stamps.reduce((oldest, one) => (one.ageSeconds > oldest.ageSeconds ? one : oldest), first)
}

/**
 * A module's problem when its rows are counted repository by repository: set only when none of them
 * could be counted, and then each repository's `notCounted` sentence. The source door and coverage
 * both say it this way.
 */
export function problemOfTheRepositories(byRepository: ModuleClaimsByRepository): string | null {
  const counted = byRepository.repositories.filter((entry) => entry.scan !== null)
  const notCounted = byRepository.repositories.filter((entry) => entry.notCounted !== null)
  return counted.length === 0 && notCounted.length > 0 ? notCounted.map((entry) => entry.notCounted).join(' ') : null
}

/**
 * What one module claims, counted REPOSITORY BY REPOSITORY. Decision 0KSoGUNDF9ml, as the secretary settled it
 * on 6 October 2026 (messages VNOIBKwRSVlk and ZDUbogzJDKYC); problem ZXD3MbidIya1.
 *
 * EACH STATED ROW IS COUNTED AGAINST THE STORED SCAN OF THE REPOSITORY THE ROW NAMES, and against no
 * other. A row's pattern is relative to its repository, so matching it in another repository's scan
 * would count a file under a repository nobody said it is in. A pattern stated in two repositories is
 * two rows and is counted in each, and `inMoreThanOne` says which paths that gave.
 *
 * THE STORED SCAN OF A REPOSITORY is the rows under its id, written by `rebuildRepository` in
 * lib/implementation.ts (which POST /api/source/reindex now calls for every registered repository
 * with a checkout). The workspace scan, whose rows name no repository, is never read here: which
 * repository its paths are from is not stored, and this reads only what is.
 *
 * A row whose repository has no stored scan is not counted, and its entry says so and how to scan
 * it. It is never counted as zero files, because "matched nothing" would call a claim stale that
 * nobody has looked for.
 */
export function claimsByRepository(record: PanelRecord): ModuleClaimsByRepository {
  const workspaceId = record.workspaceId
  const stated = statedFor(record.id, workspaceId).filter((row) => row.authority === 'stated')
  const registered = new Map(listRepositories(workspaceId).map((repo) => [repo.id, repo]))

  // The patterns stated in each repository; two rows with one pattern are one claim, as in `claimsOf`.
  const patternsIn = new Map<string, string[]>()
  for (const row of stated) {
    const held = patternsIn.get(row.repositoryId)
    if (held === undefined) patternsIn.set(row.repositoryId, [row.pattern])
    else if (!held.includes(row.pattern)) held.push(row.pattern)
  }

  const repositories: ClaimsInOneRepository[] = []
  for (const [repositoryId, patterns] of patternsIn) {
    const repo = registered.get(repositoryId)
    const repository: RepositoryNamed = { id: repositoryId, name: repo?.name ?? repositoryId }
    const empty = { repository, scan: null, claims: [], files: [] }
    const counted = patterns.length === 1 ? 'The 1 pattern stated in it is not counted.' : `None of the ${patterns.length} patterns stated in it is counted.`
    if (repo === undefined) {
      repositories.push({
        ...empty,
        notCounted: `No repository with id ${repositoryId} is registered in this project, so there is no scan of it to count against. ${counted}`,
      })
      continue
    }
    const scan = storedScanOf(workspaceId, repositoryId)
    if (scan === null) {
      repositories.push({ ...empty, notCounted: noScanOf(repo, counted) })
      continue
    }
    const paths = scan.files.map((file) => file.path)
    const claims = patterns.map((pattern) => ({ ...resolveClaim(pattern, paths), repository }))
    const files = [...new Set(claims.flatMap((claim) => claim.matched))].sort()
    repositories.push({ repository, scan: sourceStamp(scan.status), claims, files, notCounted: null })
  }
  repositories.sort((a, b) => a.repository.name.localeCompare(b.repository.name) || a.repository.id.localeCompare(b.repository.id))

  const countedIn = new Map<string, RepositoryNamed[]>()
  for (const entry of repositories) {
    for (const path of entry.files) {
      const held = countedIn.get(path)
      if (held === undefined) countedIn.set(path, [entry.repository])
      else held.push(entry.repository)
    }
  }
  const inMoreThanOne = [...countedIn]
    .filter(([, named]) => named.length > 1)
    .map(([path, named]) => ({ path, repositories: named }))
    .sort((a, b) => a.path.localeCompare(b.path))

  return { moduleId: record.id, moduleTitle: record.title, repositories, inMoreThanOne }
}

/** Every live module with its claims resolved, in the order listRecords gives them. */
export function allModuleClaims(workspaceId: string, paths?: readonly string[]): ModuleClaims[] {
  const known = paths ?? listIndexedFiles(workspaceId).map((f) => f.path)
  return listRecords({ workspaceId, kind: 'module' }).map((record) => claimsOf(record, known))
}

// ---------------------------------------------------------------------------- coverage

/**
 * The two queries this layer exists for, plus the number that summarises them.
 *
 * Modules that claim nothing are listed as well as the ones that do, because "eight modules and
 * two of them have never claimed a file" IS the finding — it is what the two front-end stubs look
 * like from here — and a report that only showed modules with claims would hide it.
 *
 * A PROJECT WITH REGISTERED REPOSITORIES IS COUNTED REPOSITORY BY REPOSITORY, by the source door's own
 * reading (`coverageByRepository` below). Only a project that registers no repository is counted
 * against the workspace scan, as it always was.
 */
export function coverage(workspaceId: string): SourceCoverage {
  const registered = listRepositories(workspaceId)
  if (registered.length > 0) return coverageByRepository(workspaceId, registered)
  requireStatus(workspaceId)
  const files = listIndexedFiles(workspaceId)
  const paths = files.map((f) => f.path)
  const modules = allModuleClaims(workspaceId, paths)

  const claimed = new Set(modules.flatMap((module) => module.files))
  const unclaimed = paths.filter((path) => !claimed.has(path))

  const stale: StaleClaim[] = []
  for (const module of modules) {
    for (const claim of module.claims) {
      if (claim.matched.length > 0) continue
      stale.push({
        moduleId: module.moduleId,
        moduleTitle: module.moduleTitle,
        pattern: claim.pattern,
        problem: claim.problem,
        problemCode: claim.problemCode,
      })
    }
  }

  return {
    totalFiles: paths.length,
    claimedFiles: claimed.size,
    unclaimedFiles: unclaimed.length,
    percentClaimed: percentOf(claimed.size, paths.length),
    unclaimed,
    staleClaims: stale,
    modules,
    repositories: null,
  }
}

/** Claimed as a percentage, to one decimal; null when there is nothing to claim. */
function percentOf(claimed: number, total: number): number | null {
  // Null rather than 0 for an empty scan: "0% claimed" and "there is nothing to claim" are different
  // facts, and only one of them is somebody's problem.
  return total === 0 ? null : Math.round((claimed / total) * 1000) / 10
}

/**
 * COVERAGE IN A PROJECT WITH REGISTERED REPOSITORIES. Problem ZXD3MbidIya1's second half: the source
 * door counted each row in its own repository from round 22, and coverage still counted against the
 * workspace scan, so the two disagreed about the same module.
 *
 * Each module is read by `claimsByRepository`, the door's own function, and each registered
 * repository's files are counted against its stored scan (`storedScanOf`). A file is claimed in a
 * repository when a row of some module in THAT repository matches it; a row in another repository
 * never claims it. A repository with no stored scan is named as not counted, with how to scan it, and
 * adds nothing to the sums, because "no files" would be a guess about a scan nobody made. When no
 * registered repository has a stored scan, this refuses as the door does (`requireARepositoryScan`).
 */
function coverageByRepository(workspaceId: string, registered: readonly Repository[]): SourceCoverage {
  requireARepositoryScan(workspaceId, registered)

  const modules: ModuleClaims[] = listRecords({ workspaceId, kind: 'module' }).map((record) => {
    const byRepository = claimsByRepository(record)
    const counted = byRepository.repositories.filter((entry) => entry.scan !== null)
    return {
      moduleId: record.id,
      moduleTitle: record.title,
      claims: counted.flatMap((entry) => entry.claims),
      files: counted.flatMap((entry) => entry.files),
      problem: problemOfTheRepositories(byRepository),
      repositories: byRepository.repositories,
    }
  })

  const claimedIn = new Map<string, Set<string>>()
  for (const module of modules) {
    for (const entry of module.repositories ?? []) {
      const held = claimedIn.get(entry.repository.id) ?? new Set<string>()
      for (const path of entry.files) held.add(path)
      claimedIn.set(entry.repository.id, held)
    }
  }

  const repositories: CoverageInOneRepository[] = [...registered]
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map((repo) => {
      const repository: RepositoryNamed = { id: repo.id, name: repo.name }
      const scan = storedScanOf(workspaceId, repo.id)
      if (scan === null) return { repository, scan: null, notCounted: noScanOf(repo, 'Its files are not counted.') }
      const claimed = claimedIn.get(repo.id) ?? new Set<string>()
      const paths = scan.files.map((file) => file.path)
      const unclaimed = paths.filter((path) => !claimed.has(path))
      return {
        repository,
        scan: sourceStamp(scan.status),
        totalFiles: paths.length,
        claimedFiles: paths.length - unclaimed.length,
        unclaimedFiles: unclaimed.length,
        percentClaimed: percentOf(paths.length - unclaimed.length, paths.length),
        unclaimed,
        notCounted: null,
      }
    })

  const stale: StaleClaim[] = []
  for (const module of modules) {
    for (const claim of module.claims) {
      if (claim.matched.length > 0) continue
      stale.push({
        moduleId: module.moduleId,
        moduleTitle: module.moduleTitle,
        pattern: claim.pattern,
        problem: claim.problem,
        problemCode: claim.problemCode,
        ...(claim.repository === undefined ? {} : { repository: claim.repository }),
      })
    }
  }

  const counted = repositories.flatMap((entry) => (entry.scan === null ? [] : [entry]))
  const totalFiles = counted.reduce((sum, entry) => sum + entry.totalFiles, 0)
  const claimedFiles = counted.reduce((sum, entry) => sum + entry.claimedFiles, 0)
  return {
    totalFiles,
    claimedFiles,
    unclaimedFiles: totalFiles - claimedFiles,
    percentClaimed: percentOf(claimedFiles, totalFiles),
    unclaimed: counted.flatMap((entry) => entry.unclaimed),
    staleClaims: stale,
    modules,
    repositories,
  }
}

/**
 * Files no module claims, BIGGEST FIRST.
 *
 * Ranked by size rather than by path, which is what `SourceCoverage.unclaimed` gives: a 900-line
 * file nobody owns is a bigger hole in the canonical layer than a 12-line one, and a list in path
 * order buries it in the middle. Ranked by size and not by churn because churn needs each file's
 * history, which this index does not carry — getting it would mean shelling out to `git log` on
 * every scan, making the scan seconds instead of milliseconds and making the index depend on the
 * repository being a git checkout at all. `modifiedAt` is on every row for anyone who wants
 * recency instead.
 */
export function unclaimedFiles(opts: {
  workspaceId: string
  limit?: number
}): (SourceFile & { repository?: RepositoryNamed })[] {
  // In a project with registered repositories, read off coverage's own count, repository by
  // repository, and name each file's repository: the same path can be unclaimed in one and not another.
  const registered = listRepositories(opts.workspaceId)
  if (registered.length > 0) {
    const unclaimed: (SourceFile & { repository: RepositoryNamed })[] = []
    for (const entry of coverageByRepository(opts.workspaceId, registered).repositories ?? []) {
      if (entry.scan === null) continue
      const nobodys = new Set(entry.unclaimed)
      for (const file of listIndexedFiles(opts.workspaceId, entry.repository.id)) {
        if (nobodys.has(file.path)) unclaimed.push({ ...file, repository: entry.repository })
      }
    }
    unclaimed.sort(
      (a, b) => b.sizeBytes - a.sizeBytes || a.path.localeCompare(b.path) || a.repository.name.localeCompare(b.repository.name),
    )
    return opts.limit === undefined ? unclaimed : unclaimed.slice(0, opts.limit)
  }
  requireStatus(opts.workspaceId)
  const files = listIndexedFiles(opts.workspaceId)
  const claimed = new Set(allModuleClaims(opts.workspaceId, files.map((f) => f.path)).flatMap((m) => m.files))
  const unclaimed = files.filter((f) => !claimed.has(f.path))
  // Path is the tie-break, so two runs over one tree list the same file first.
  unclaimed.sort((a, b) => b.sizeBytes - a.sizeBytes || a.path.localeCompare(b.path))
  return opts.limit === undefined ? unclaimed : unclaimed.slice(0, opts.limit)
}

/** Claims that match nothing in the index. Almost always a rename; sometimes a malformed claim. */
export function staleClaims(workspaceId: string): StaleClaim[] {
  return coverage(workspaceId).staleClaims
}

/**
 * The files one module claims. `module` is its id or its title.
 *
 * Both, because both are how a module is addressed here: the API uses ids, and a person typing a
 * query uses the title. An unknown one is a 404, never an empty list — "that module claims no code"
 * and "you spelled the name wrong" are different answers and must not look alike.
 *
 * A TITLE MAY NAME MORE THAN ONE MODULE, since the day titles stopped being identity, and this
 * refuses rather than picking. It used to ask `getRecordByTitle`, which includes DELETED rows, so a
 * deleted module answered with the files it claimed — a claim nothing is maintaining, reported as
 * live coverage. Live rows only now, and every candidate is named when there is more than one.
 *
 * NO DOOR CALLS IT, so it takes no reader: GET /api/source/files?module= resolves
 * its module by id itself, and only the tests call this. A door that comes to call it would have to leave
 * out the messages its caller may not read, as `liveRecordByTitle` does with a reader.
 */
export function filesFor(module: string, workspaceId: string): SourceFile[] {
  requireStatus(workspaceId)
  const byId = getRecord(module)
  // A module named BY ID from another project is not this project's module, and resolving it would
  // report another project's claims against this project's file index.
  const here = byId !== null && byId.workspaceId === workspaceId ? byId : null
  const named = here === null ? liveMatches(recordsByTitle(module, workspaceId)) : []
  if (named.length > 1) {
    throw new PanelError(
      titleNamesMoreThanOne(
        module,
        workspaceId,
        named,
        `Ask by id: GET /api/source/files?module=<one of the ids above> names exactly one module.`,
      ),
      409,
    )
  }
  const record = here ?? named[0] ?? null
  if (!record) {
    throw new PanelError(
      `No record with id or title "${module}" in the workspace "${workspaceId}". A deleted record does not ` +
        `answer to its title here: nothing maintains the claims of a module nobody can see.` +
        (byId === null ? '' : ` That id names a record in "${byId.workspaceId}", which is a different project.`),
      404,
    )
  }
  if (record.kind !== 'module') {
    throw new PanelError(`"${record.title}" is a ${record.kind}, not a module. Only modules claim source paths.`)
  }
  const files = listIndexedFiles(workspaceId)
  const resolved = claimsOf(record, files.map((f) => f.path))
  const mine = new Set(resolved.files)
  return files.filter((f) => mine.has(f.path))
}

/** One module's claim on one file, as `moduleFor` reports it. */
export interface ClaimMatch {
  moduleId: string
  moduleTitle: string
  /** The claim that matched, exactly as the module wrote it. */
  pattern: string
}

/**
 * The modules that claim a path, most specific claim first.
 *
 * A LIST, not one module, deliberately. Two modules claiming one file is a real state while
 * responsibility is being split, and picking one by an invented rule would hide it. Callers that
 * want a single answer take the first element knowing from the type that there may be more, and
 * `length > 1` is itself worth showing on a page.
 *
 * "Most specific" is the longest pattern, with the module title as the tie-break so the order is
 * stable rather than dependent on which record was updated last.
 */
export function moduleFor(path: string, workspaceId: string): ClaimMatch[] {
  requireStatus(workspaceId)
  const out: ClaimMatch[] = []
  for (const module of allModuleClaims(workspaceId)) {
    for (const claim of module.claims) {
      if (!claim.matched.includes(path)) continue
      out.push({ moduleId: module.moduleId, moduleTitle: module.moduleTitle, pattern: claim.pattern })
    }
  }
  return out.sort((a, b) => b.pattern.length - a.pattern.length || a.moduleTitle.localeCompare(b.moduleTitle))
}

/**
 * Exported for the tests only.
 *
 * These are the pieces a scan is built from — the ignore matcher, the comment stripper, the line
 * counter. Testing them through a full scan would mean a fixture tree per rule, and a failure
 * would say "the file count is wrong" rather than "the ignore file was read the wrong way round".
 * Nothing outside tests/sourceindex.test.ts may import this.
 *
 * THE PATTERN MATCHER IS NOT HERE ANY MORE. `filesMatching` and `claimProblem` moved to
 * `@shared/paths.ts` and are ordinary exports there, so a test imports them by name rather than
 * through a hatch marked "tests only". They were the only two entries here that a second caller
 * was ever going to want.
 */
export const _internals = {
  patternToRegExp,
  isIgnored,
  compileIgnoreFile,
  stripComments,
  dirSkipReason,
  fileSkipReason,
  lineCount,
}
