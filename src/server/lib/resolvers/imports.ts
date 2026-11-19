// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE IMPORT RESOLVER: THIS FILE IS CLAIMED BY NOBODY — WHO IS IT FOR?
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT READS AND WHAT IT DOES NOT
 * ---------------------------------------------------------------------------------------
 *
 * Input is `source_files.imports`, which the scan already holds: every specifier of every file,
 * WITH COMMENTS STRIPPED. That last part is not decoration — this codebase quotes import lines in
 * prose, and without stripping, `src/web/pages/HomePage.tsx` imports itself.
 *
 * It opens no file, walks no directory and spawns no process. Everything below is string work over
 * a list the scan produced.
 *
 * ---------------------------------------------------------------------------------------
 * THE EDGES ARE NOT STORED, AND THEY ARE USED FOR TWO DIFFERENT THINGS
 * ---------------------------------------------------------------------------------------
 *
 * `source_files.imports` plus the rule below reproduces every edge, so storing them would be one
 * fact in two places. They are held for the length of a rebuild and used twice, and separating
 * those two uses is the whole of this file:
 *
 *   USE ONE — THE DEPENDENCY READ, COMPUTED AND NOT STORED. *Which records does this record's code
 *   depend on?* Worked out at read time by walking edges from files this record serves to files
 *   another record serves. AN IMPORT EDGE DOES NOT MEAN THE IMPORTING RECORD OWNS THE IMPORTED
 *   FILE: `records.ts` importing `types.ts` does not make the write-path module the owner of the
 *   record contract. So no row is written for it and no `depends_on` relation exists.
 *
 *   USE TWO — THE CANDIDATE OWNER, WHICH IS WHAT FILLS `implementation_findings`. For each file no
 *   `stated` row covers, take every file that imports it, take the records those importers are
 *   served by, and write one row per distinct record.
 *
 * EVERY CANDIDATE IS WRITTEN, NEVER THE BEST ONE. A.3: *"One file may serve several Blocks or
 * Modules."* Picking the most frequent importer would be inventing a winner, and the file with NINE
 * candidates is the case that proves it: it is genuinely shared, and a resolver that named one
 * owner would hide that.
 *
 * MEASURED BY `tools/count-the-map.ts`, over a fresh scan of this checkout on 25 August 2026,
 * against the claims the corpus holds today —
 * `design/round-ten/measurements/wave-6-counted-fresh-scan.json` is the run: 1,227 files, 772
 * covered by a stated pattern, 455 covered by nobody. Of those 455, 61 have exactly one candidate
 * record, 39 have several and 355 have none at all, and the resolver writes 174 rows over 100
 * files. The distribution is 61 with one candidate, 22 with two, 10 with three, 3 with four, 2 with
 * five, 1 with eight and 1 with nine. It resolves 99.3% of this checkout's in-repository
 * specifiers; the 23 it cannot are all import strings inside test fixtures, naming files that
 * really do not exist, and it names every one of them rather than dropping them.
 *
 * THE DESIGN SAYS 393 / 52 / 34 / 307 AND 146 ROWS. Those were taken against a 1,155-file scan; the
 * tree has grown since, and the shape is the same. Nothing here restates a figure somebody else
 * measured: re-run the script.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT CANNOT READ IS COUNTED AND NAMED, NEVER DROPPED
 * ---------------------------------------------------------------------------------------
 *
 * Three outcomes, and the middle one is not a failure:
 *
 *   resolved   — a file in this repository.
 *   outside    — `node:fs`, or a bare package name. NOT AN ERROR. It is counted and reported as
 *                outside the repository, because a resolver that filed those as failures would
 *                report a broken checkout every time somebody imported `nanoid`.
 *   unresolved — everything else. Counted, and the first twenty named, because a resolver that
 *                quietly drops what it cannot read reports a sparser graph than the truth and
 *                nothing looks wrong.
 */

import type { SourceFile } from '@shared/types.ts'
import type { FindingRow, Resolver, ResolverInput, ResolverRows } from './index.ts'

/** What one specifier turned out to be. */
export type Resolution =
  | { kind: 'resolved'; path: string }
  | { kind: 'outside'; why: string }
  | { kind: 'unresolved' }

/** The extensions tried, in order, on a candidate that is not itself in the file list. */
const TRIED = ['.ts', '.tsx', '.js', '.mjs', '.jsx'] as const
const AS_A_DIRECTORY = ['/index.ts', '/index.tsx', '/index.js'] as const

/** `a/b/../c` and `./a/b` reduced to what the index would hold. Never climbs above the root. */
function normalise(path: string): string | null {
  const parts: string[] = []
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (parts.length === 0) return null
      parts.pop()
      continue
    }
    parts.push(segment)
  }
  return parts.join('/')
}

/** The directory one file is in, repository-relative. `''` for a file at the root. */
function directoryOf(path: string): string {
  const cut = path.lastIndexOf('/')
  return cut === -1 ? '' : path.slice(0, cut)
}

/**
 * `compilerOptions.paths` as a table of prefix -> replacements.
 *
 * READ FROM THE REPOSITORY'S OWN TypeScript CONFIGURATION, at scan time, so a repository that has
 * none has an empty table and says so rather than having this one's baked in. THIS repository has
 * exactly one entry.
 *
 * IT IS TOLERANT OF COMMENTS, because tsconfig.json is JSON with comments in every real project and
 * a resolver that threw on one would report the whole alias table as absent. A file it cannot read
 * at all gives an empty table, which is the same answer as no file: nothing is aliased. That is a
 * narrowing and not a silent substitution — every specifier that would have been aliased then
 * lands in `unresolved` and is counted and named.
 */
export function aliasesFrom(tsconfig: string): Map<string, string[]> {
  const table = new Map<string, string[]>()
  const withoutComments = tsconfig.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  let parsed: unknown
  try {
    parsed = JSON.parse(withoutComments)
  } catch {
    return table
  }
  const options = (parsed as Record<string, unknown>)['compilerOptions']
  if (typeof options !== 'object' || options === null) return table
  const paths = (options as Record<string, unknown>)['paths']
  if (typeof paths !== 'object' || paths === null) return table
  const baseUrl = (options as Record<string, unknown>)['baseUrl']
  const base = typeof baseUrl === 'string' ? normalise(baseUrl) ?? '' : ''
  for (const [pattern, replacements] of Object.entries(paths as Record<string, unknown>)) {
    if (!Array.isArray(replacements)) continue
    const targets = replacements
      .filter((r): r is string => typeof r === 'string')
      .map((r) => {
        const joined = base === '' ? r : `${base}/${r}`
        return normalise(joined) ?? r
      })
    if (targets.length > 0) table.set(pattern, targets)
  }
  return table
}

/** Is this specifier something outside the repository, and what would we call it? */
function outsideWhy(specifier: string): string | null {
  if (specifier.startsWith('node:')) return 'a Node built-in'
  if (specifier.startsWith('.') || specifier.startsWith('/')) return null
  return 'a package'
}

/**
 * One specifier, from one file, against the file list this repository holds.
 *
 * THE ORDER THE RULES ARE APPLIED IN IS THE ORDER THEY ARE WRITTEN, and it matters: an alias is
 * checked before the bare-package rule, because `@shared/paths.ts` is a bare specifier to anything
 * that has not read the configuration and is a file in this repository to anything that has.
 */
export function resolveSpecifier(
  fromPath: string,
  specifier: string,
  paths: ReadonlySet<string>,
  aliases: ReadonlyMap<string, readonly string[]>,
): Resolution {
  const candidates: string[] = []

  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const joined = normalise(`${directoryOf(fromPath)}/${specifier}`)
    // A specifier that climbs above the repository root resolves to nothing here, which is true:
    // whatever it names is not a file this index holds.
    if (joined === null) return { kind: 'unresolved' }
    candidates.push(joined)
  } else {
    for (const [pattern, targets] of aliases) {
      const star = pattern.indexOf('*')
      if (star === -1) {
        if (specifier !== pattern) continue
        for (const target of targets) candidates.push(target)
        continue
      }
      const head = pattern.slice(0, star)
      const tail = pattern.slice(star + 1)
      if (!specifier.startsWith(head) || !specifier.endsWith(tail)) continue
      const middle = specifier.slice(head.length, specifier.length - tail.length)
      for (const target of targets) {
        const filled = normalise(target.replace('*', middle))
        if (filled !== null) candidates.push(filled)
      }
    }
    // A PYTHON DOTTED NAME IS TRIED BEFORE THE BARE-PACKAGE RULE, AND ONLY FOR A PYTHON FILE.
    // `pkg.thing` is a package to anything reading JavaScript and a path to anything reading
    // Python, and the importing file is what says which. Asking the question the other way round —
    // trying every dotted specifier as a path — would resolve `date-fns.min` in a TypeScript file
    // against a directory that happened to match.
    //
    // UNPROVEN ON REAL MATERIAL: this checkout holds no Python. The rule is exercised on a fixture
    // in tests/import-resolver.test.ts and that sentence is the honest description of what that
    // proves. Its first version resolved nothing at all, because it sat after the rule below and
    // never ran; a red test found it.
    if (fromPath.endsWith('.py') && specifier.includes('.') && !specifier.includes('/')) {
      const asPath = specifier.replace(/\./g, '/')
      candidates.push(`${asPath}/__init__`, asPath)
    }
    if (candidates.length === 0) {
      const why = outsideWhy(specifier)
      if (why !== null) return { kind: 'outside', why }
      return { kind: 'unresolved' }
    }
  }

  for (const candidate of candidates) {
    if (paths.has(candidate)) return { kind: 'resolved', path: candidate }
    for (const extension of TRIED) {
      if (paths.has(`${candidate}${extension}`)) return { kind: 'resolved', path: `${candidate}${extension}` }
    }
    for (const index of AS_A_DIRECTORY) {
      if (paths.has(`${candidate}${index}`)) return { kind: 'resolved', path: `${candidate}${index}` }
    }
    // A `.js` SPECIFIER NAMING A `.ts` FILE, which is what a project emitting ES modules writes.
    if (candidate.endsWith('.js')) {
      const stem = candidate.slice(0, -3)
      for (const extension of ['.ts', '.tsx'] as const) {
        if (paths.has(`${stem}${extension}`)) return { kind: 'resolved', path: `${stem}${extension}` }
      }
    }
    if (paths.has(`${candidate}.py`)) return { kind: 'resolved', path: `${candidate}.py` }
  }
  return { kind: 'unresolved' }
}

/** One edge of the import graph: a file, and a file in this repository it imports. */
export interface ImportEdge {
  from: string
  to: string
  /** The specifier exactly as it was written, which is the evidence a developer reads. */
  specifier: string
}

/** Every edge, plus what could not be read. Held for the length of a rebuild and stored nowhere. */
export function importEdges(
  files: readonly SourceFile[],
  aliases: ReadonlyMap<string, readonly string[]>,
): { edges: ImportEdge[]; unresolved: string[]; outside: number } {
  const paths = new Set(files.map((f) => f.path))
  const edges: ImportEdge[] = []
  const unresolved: string[] = []
  let outside = 0
  for (const file of files) {
    for (const specifier of file.imports) {
      const answer = resolveSpecifier(file.path, specifier, paths, aliases)
      if (answer.kind === 'resolved') {
        // A file importing itself is not an edge. It happens with a barrel that re-exports its own
        // directory, and an edge would make the file its own dependency.
        if (answer.path !== file.path) edges.push({ from: file.path, to: answer.path, specifier })
        continue
      }
      if (answer.kind === 'outside') {
        outside += 1
        continue
      }
      unresolved.push(`${file.path} -> ${specifier}`)
    }
  }
  return { edges, unresolved, outside }
}

/**
 * The candidate owner of a file nobody has claimed.
 *
 * AND A `computed` ROW NEVER MAKES A FILE CLAIMED — the third of the five mechanisms, and the
 * reason this resolver is safe to run at all.
 */
export const importResolver: Resolver = {
  provenance: 'imports',
  needs: 'a file index with import specifiers in it, which every scan of a TypeScript, JavaScript or Python tree has',
  run(input: ResolverInput): ResolverRows | null {
    const withImports = input.files.filter((file) => file.imports.length > 0)
    if (withImports.length === 0) return null

    const { edges, unresolved, outside } = importEdges(input.files, input.aliases)

    // WHO IMPORTS EACH FILE, and with which specifier. The specifier is kept because it is half the
    // evidence and a developer reads it: `HomePage.tsx imports ./RecordPage.tsx` is composed from
    // the two stored facts at read time, never stored as a sentence.
    const importersOf = new Map<string, ImportEdge[]>()
    for (const edge of edges) {
      const held = importersOf.get(edge.to)
      if (held === undefined) importersOf.set(edge.to, [edge])
      else held.push(edge)
    }

    const rows: FindingRow[] = []
    let uncovered = 0
    let withACandidate = 0
    for (const file of input.files) {
      if (input.coveredByStated.has(file.path)) continue
      uncovered += 1
      const importers = importersOf.get(file.path) ?? []
      // ONE ROW PER DISTINCT RECORD, and the evidence kept is the FIRST importer that named it —
      // one row cannot carry four importing files, and the alternative is four rows saying one
      // thing.
      const seen = new Map<string, ImportEdge>()
      for (const edge of importers) {
        for (const recordId of input.servedBy.get(edge.from) ?? []) {
          if (!seen.has(recordId)) seen.set(recordId, edge)
        }
      }
      if (seen.size > 0) withACandidate += 1
      for (const [recordId, edge] of seen) {
        rows.push({
          recordId,
          path: file.path,
          relation: 'implements',
          provenance: 'imports',
          evidencePath: edge.from,
          evidenceDetail: edge.specifier,
        })
      }
    }

    return {
      rows,
      unresolved: { count: unresolved.length, first: unresolved.slice(0, 20) },
      outside,
      note:
        `${rows.length} candidate owner${rows.length === 1 ? '' : 's'} over ${withACandidate} of the ${uncovered} ` +
        `files nobody has claimed. The other ${uncovered - withACandidate} are imported by nothing anybody owns, ` +
        `and this resolver says nothing about them — they go on being reported as covered by nobody, which is true.`,
    }
  },
}
