// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * COUNT WHAT THE IMPLEMENTATION MAP WOULD MAP, BEFORE MAPPING IT. ON A COPY, NEVER ON THE CORPUS.
 *
 *   MOLE_OFFICE_DB=<copy.db> npx tsx tools/count-the-map.ts
 *   MOLE_OFFICE_DB=<copy.db> npx tsx tools/count-the-map.ts --json
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS SCRIPT IS IN THE REPOSITORY
 * ---------------------------------------------------------------------------------------
 *
 * Two figures this campaign relied on could not be reproduced by the people who came after, and
 * both were load-bearing: a wave was sized against them. Every number this wave states about the
 * owner's corpus comes out of this file, so the next reader re-runs one command instead of
 * reconstructing a query from prose.
 *
 * IT ASKS THE PRODUCT'S OWN FUNCTIONS AND NOT A SECOND COPY OF THEM. `repositoriesFromIndexes`
 * decides how many repositories a set of indexes mints; this script imports it rather than writing
 * the grouping again, so a count taken here and a migration run later cannot disagree. That is why
 * it is a `.ts` run under `tsx` rather than an `.mjs` with its own SQL: an `.mjs` could not import
 * the rule.
 *
 * ---------------------------------------------------------------------------------------
 * IT REFUSES THE LIVE CORPUS BY NAME
 * ---------------------------------------------------------------------------------------
 *
 * `data/panelx.db` is the owner's running database and this process opens it read-write the moment
 * `db/client.ts` loads. Make a copy with `node tools/isolated-mole-office.mjs start <name>`, which uses
 * SQLite's own backup so the write-ahead log is included, and point `MOLE_OFFICE_DB` at
 * `.logs/isolated/<name>/copy.db`.
 */

import { resolve } from 'node:path'

// Whether a database was named, and which, come from src/config/settings.mjs — the one reader of
// `.env` and of a MOLE_OFFICE_ variable in this repository.
const { canonicalDatabasePath, settingValue, settingWasSet } = await import('../src/config/settings.mjs')
const target = settingWasSet('MOLE_OFFICE_DB') ? String(settingValue('MOLE_OFFICE_DB')) : ''
if (target === '') {
  throw new Error('Set MOLE_OFFICE_DB to a COPY of the database. `node tools/isolated-mole-office.mjs start <name>` makes one.')
}
// Compared as a resolved path against the database the declaration calls canonical, rather than
// against a spelling of it. A guard that matched a file NAME stopped guarding the day somebody
// moved the corpus, and it never guarded a second checkout's corpus at all.
if (resolve(target) === canonicalDatabasePath()) {
  throw new Error(
    `${target} is the live corpus. This script opens the database read-write; copy it with ` +
      '`node tools/isolated-mole-office.mjs start <name>` and point MOLE_OFFICE_DB at .logs/isolated/<name>/copy.db.',
  )
}

const { sqlite } = await import('../src/server/db/client.ts')
const { repositoriesFromIndexes, indexPointers } = await import('../src/server/lib/repositories.ts')
const { localStamp } = await import('../src/shared/time.ts')

const asJson = process.argv.includes('--json')

/** Filled by the resolver section below when there is an index to run it over. */
let resolverCounts: {
  indexedFiles: number; coveredByStated: number; coveredByNobody: number
  filesWithExactlyOneCandidate: number; filesWithSeveralCandidates: number; filesWithNoCandidate: number
  rowsWritten: number; candidatesPerFile: { candidates: number; files: number }[]
  unresolvedSpecifiers: number; outsideTheRepository: number; resolvedShare: number | null
} | null = null
const say = (line: string): void => {
  if (!asJson) process.stdout.write(`${line}\n`)
}

/** One row of `records` this script cares about. */
interface ModuleRow {
  id: string
  workspace_id: string
  title: string
  data: string
}

// ---------------------------------------------------------------------------- the indexes

const pointers = indexPointers()
const minted = repositoriesFromIndexes(pointers)
const files = (sqlite.prepare('SELECT count(*) AS c FROM source_files').get() as { c: number }).c
const hashes = (sqlite.prepare('SELECT count(*) AS c FROM source_file_hashes').get() as { c: number }).c
const keyedOnWorkspace = new Set(pointers.map((p) => `${p.workspaceId} ${p.root}`)).size

say(`--- ${target}`)
say('')
say('THE INDEXES THAT ARE THERE')
say(`  source_index rows: ${pointers.length}`)
for (const p of pointers) say(`    ${p.workspaceId}  ${p.root}  built ${p.builtAt}`)
say(`  source_files: ${files}    source_file_hashes: ${hashes}`)
say('')
say('WHAT ONE ROW PER DISTINCT ROOT WOULD MINT')
say(`  repositories: ${minted.length}`)
for (const m of minted) say(`    ${m.name}  ${m.root}  pointed at by ${m.pointedAtBy.join(', ')}`)
say(`  keyed on the workspace instead it would be ${keyedOnWorkspace}`)

// ---------------------------------------------------------------------------- the claims

const modules = sqlite
  .prepare("SELECT id, workspace_id, title, data FROM records WHERE kind = 'module' AND deleted_at IS NULL")
  .all() as ModuleRow[]

let claims = 0
const withClaims: { id: string; workspaceId: string; title: string; count: number }[] = []
for (const module of modules) {
  let parsed: unknown
  try {
    parsed = JSON.parse(module.data)
  } catch {
    continue
  }
  const held = (parsed as Record<string, unknown>)['claims']
  if (!Array.isArray(held) || held.length === 0) continue
  claims += held.length
  withClaims.push({ id: module.id, workspaceId: module.workspace_id, title: module.title, count: held.length })
}

const claimWorkspaces = [...new Set(withClaims.map((m) => m.workspaceId))].sort()
const repositoryWorkspaces = new Set(minted.map((m) => m.workspaceId))
const strandedWorkspaces = claimWorkspaces.filter((w) => !repositoryWorkspaces.has(w))
const strandedClaims = withClaims.filter((m) => strandedWorkspaces.includes(m.workspaceId))

say('')
say('WHAT THE CLAIMS MIGRATION WOULD MOVE')
say(`  live modules: ${modules.length}`)
say(`  modules with a non-empty data.claims: ${withClaims.length}`)
say(`  claim strings, which is the row count: ${claims}`)
say(`  revisions the restamp would write: ${withClaims.length}`)
say(`  projects those modules are in: ${claimWorkspaces.join(', ') || 'none'}`)
say(`  projects a repository would be minted in: ${[...repositoryWorkspaces].sort().join(', ') || 'none'}`)

if (strandedWorkspaces.length > 0) {
  say('')
  say('AND THE FORK THIS COUNT FOUND, WHICH THE DESIGN DOES NOT SETTLE')
  say(
    `  ${strandedClaims.length} of those modules — ${strandedClaims.reduce((n, m) => n + m.count, 0)} claims — are in ` +
      `${strandedWorkspaces.join(', ')}, and no source_index row points at anything from there, so the migration ` +
      `mints no repository in ${strandedWorkspaces.length === 1 ? 'that project' : 'those projects'}.`,
  )
  say(
    '  Which repository those claims mean is a question about this machine, not a fact in the database, so the ' +
      'migration refuses rather than picking one.',
  )
}

// ---------------------------------------------------------------------------- the import resolver

/**
 * WHAT THE IMPORT RESOLVER WOULD OFFER, over the index that is actually in this database.
 *
 * It is asked over the REAL FUNCTION, with the real alias table read from this checkout's
 * tsconfig.json, so the distribution below is what a rebuild would write rather than an estimate of
 * it. The stated coverage is taken from `data.claims` — the field the migration retires — because
 * on a corpus where the migration has not run, that is where the statements are.
 */
/**
 * `--scan <root>` MEASURES AGAINST A FRESH WALK RATHER THAN THE STORED INDEX, and both numbers
 * matter for different reasons.
 *
 * The stored index is what Mole Office would answer from RIGHT NOW; the fresh scan is what a rebuild
 * would write. On the owner's corpus they are far apart — the stored index is 242 files from
 * 10 August and the checkout has grown a lot since — and reporting only one of them would state a
 * figure about a tree nobody is looking at.
 */
const scanAt = (() => {
  const at = process.argv.indexOf('--scan')
  return at === -1 ? null : (process.argv[at + 1] ?? null)
})()

const indexed = scanAt !== null
  ? (await import('../src/server/lib/sourceindex.ts')).scanTree(scanAt).files.map((f) => ({
      path: f.path,
      language: f.language,
      size_bytes: f.sizeBytes,
      lines: f.lines,
      imports: JSON.stringify(f.imports),
      exports: JSON.stringify(f.exports),
      modified_at: f.modifiedAt,
    }))
  : sqlite
  .prepare(
    'SELECT path, language, size_bytes, lines, imports, exports, modified_at FROM source_files ORDER BY path',
  )
  .all() as {
  path: string
  language: string
  size_bytes: number
  lines: number
  imports: string
  exports: string
  modified_at: string
}[]

if (indexed.length > 0) {
  const { importResolver } = await import('../src/server/lib/resolvers/index.ts')
  const { aliasesFrom } = await import('../src/server/lib/resolvers/imports.ts')
  const { filesMatching } = await import('../src/shared/paths.ts')
  const { readFileSync } = await import('node:fs')

  const files = indexed.map((r) => ({
    path: r.path,
    language: r.language as never,
    sizeBytes: r.size_bytes,
    lines: r.lines,
    imports: JSON.parse(r.imports) as string[],
    exports: JSON.parse(r.exports) as string[],
    modifiedAt: r.modified_at,
  }))
  const paths = files.map((f) => f.path)

  const coveredByStated = new Set<string>()
  const servedBy = new Map<string, string[]>()
  for (const module of modules) {
    let parsed: unknown
    try {
      parsed = JSON.parse(module.data)
    } catch {
      continue
    }
    const held = (parsed as Record<string, unknown>)['claims']
    if (!Array.isArray(held)) continue
    for (const claim of held) {
      if (typeof claim !== 'string') continue
      for (const path of filesMatching(claim, paths)) {
        coveredByStated.add(path)
        const at = servedBy.get(path)
        if (at === undefined) servedBy.set(path, [module.id])
        else if (!at.includes(module.id)) at.push(module.id)
      }
    }
  }

  const root = scanAt ?? pointers[0]?.root ?? process.cwd()
  let tsconfig = ''
  try {
    tsconfig = readFileSync(`${root}/tsconfig.json`, 'utf8')
  } catch {
    tsconfig = ''
  }
  const answer = importResolver.run({ files, coveredByStated, servedBy, aliases: aliasesFrom(tsconfig) })

  const uncovered = paths.filter((p) => !coveredByStated.has(p))
  const perFile = new Map<string, number>()
  for (const row of answer?.rows ?? []) perFile.set(row.path, (perFile.get(row.path) ?? 0) + 1)
  const one = [...perFile.values()].filter((n) => n === 1).length
  const several = [...perFile.values()].filter((n) => n > 1).length
  const distribution = new Map<number, number>()
  for (const n of perFile.values()) distribution.set(n, (distribution.get(n) ?? 0) + 1)

  resolverCounts = {
    indexedFiles: files.length,
    coveredByStated: coveredByStated.size,
    coveredByNobody: uncovered.length,
    filesWithExactlyOneCandidate: one,
    filesWithSeveralCandidates: several,
    filesWithNoCandidate: uncovered.length - perFile.size,
    rowsWritten: answer?.rows.length ?? 0,
    candidatesPerFile: [...distribution.entries()].sort((a, b) => a[0] - b[0]).map(([n, files]) => ({ candidates: n, files })),
    unresolvedSpecifiers: answer?.unresolved.count ?? 0,
    outsideTheRepository: answer?.outside ?? 0,
    resolvedShare:
      answer === null
        ? null
        : Number(
            (
              (100 * (files.reduce((n, f) => n + f.imports.length, 0) - answer.unresolved.count - answer.outside)) /
              Math.max(1, files.reduce((n, f) => n + f.imports.length, 0) - answer.outside)
            ).toFixed(1),
          ),
  }

  say('')
  say(`WHAT THE IMPORT RESOLVER WOULD OFFER${scanAt === null ? ', over the index that is stored' : `, over a fresh scan of ${scanAt}`}`)
  say(`  indexed files: ${resolverCounts.indexedFiles}`)
  say(`  covered by a stated pattern: ${resolverCounts.coveredByStated}`)
  say(`  covered by nobody: ${resolverCounts.coveredByNobody}`)
  say(`    exactly one candidate record: ${resolverCounts.filesWithExactlyOneCandidate}`)
  say(`    several candidate records: ${resolverCounts.filesWithSeveralCandidates}`)
  say(`    no candidate at all: ${resolverCounts.filesWithNoCandidate}`)
  say(`  rows it would write: ${resolverCounts.rowsWritten}`)
  say(
    `  candidates per file: ${resolverCounts.candidatesPerFile.map((d) => `${d.files} with ${d.candidates}`).join(', ') || 'none'}`,
  )
  say(`  specifiers outside the repository: ${resolverCounts.outsideTheRepository}`)
  say(`  specifiers it could not resolve: ${resolverCounts.unresolvedSpecifiers}`)
  for (const line of answer?.unresolved.first ?? []) say(`    ${line}`)
  say(`  share of in-repository specifiers resolved: ${resolverCounts.resolvedShare ?? 'not run'}%`)
}

// ---------------------------------------------------------------------------- what is already there

const already = {
  repositories: (sqlite.prepare('SELECT count(*) AS c FROM repositories').get() as { c: number }).c,
  implementation_map: (sqlite.prepare('SELECT count(*) AS c FROM implementation_map').get() as { c: number }).c,
  implementation_findings: (sqlite.prepare('SELECT count(*) AS c FROM implementation_findings').get() as { c: number })
    .c,
  implementation_revisions: (sqlite.prepare('SELECT count(*) AS c FROM implementation_revisions').get() as {
    c: number
  }).c,
}
say('')
say("WHAT WINDOW A'S TABLES HOLD TODAY")
for (const [table, count] of Object.entries(already)) say(`  ${table}: ${count}`)

if (asJson) {
  process.stdout.write(
    `${JSON.stringify(
      {
        countedAt: localStamp(new Date()), // local wall-clock time, chapter 4 rule 8 (acceptance finding 63)
        database: target,
        sourceIndexRows: pointers.length,
        pointers,
        repositoriesOneRowPerRoot: minted.length,
        repositoriesKeyedOnWorkspace: keyedOnWorkspace,
        sourceFiles: files,
        sourceFileHashes: hashes,
        liveModules: modules.length,
        modulesWithClaims: withClaims.length,
        claimStrings: claims,
        claimWorkspaces,
        repositoryWorkspaces: [...repositoryWorkspaces].sort(),
        modulesWhoseProjectMintsNoRepository: strandedClaims.length,
        claimsWhoseProjectMintsNoRepository: strandedClaims.reduce((n, m) => n + m.count, 0),
        importResolver: resolverCounts,
        alreadyThere: already,
      },
      null,
      2,
    )}\n`,
  )
}
