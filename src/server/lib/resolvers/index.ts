// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TWO RESOLVERS AND NO MORE. THE SEAM IS ONE ARRAY LITERAL AND THAT IS THE WHOLE EXTENSION POINT.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO
 * ---------------------------------------------------------------------------------------
 *
 *   THE PATTERN MATCHER, WHICH IS NOT NEW. `filesMatching` in `@shared/paths.ts` turns one
 *   repository-relative pattern into the list of files it covers. It resolves what somebody
 *   STATED, so it produces no findings and is not in `RESOLVERS` below — a resolver in that array
 *   is a producer of `implementation_findings` rows, and the matcher writes none. It is named here
 *   anyway, because "two resolvers" is the budget this design was given and leaving it unnamed
 *   would make the array look like the whole answer.
 *
 *   THE IMPORT RESOLVER, WHICH IS THE ONE THAT IS BUILT. `./imports.ts`. It reads
 *   `source_files.imports` — every specifier, with comments already stripped — and answers the
 *   question the coverage query has always asked and never been able to answer: THIS FILE IS
 *   CLAIMED BY NOBODY; WHO IS IT FOR?
 *
 * ---------------------------------------------------------------------------------------
 * NO REGISTRY, NO PLUGIN LOADER, NO CONFIGURATION
 * ---------------------------------------------------------------------------------------
 *
 * A.5: *"Do not attempt to build a universal static-analysis platform in Round Ten."* Adding a
 * resolver is adding one entry to `RESOLVERS`. That is the whole mechanism and it is enough.
 *
 * SIX OF THE NINE PROVENANCE VALUES HAVE NO PRODUCER and none is built here. `notLookedFor()` in
 * `@shared/implementation.ts` is computed from the producer column of that table, so a resolver
 * arriving shortens the *nobody has looked* list in the same commit that adds it, and there is no
 * second list to forget.
 *
 * ---------------------------------------------------------------------------------------
 * A RESOLVER MAY NOT WRITE OWNERSHIP AND CANNOT
 * ---------------------------------------------------------------------------------------
 *
 * Everything below returns ROWS. Nothing here opens a database, nothing writes, and
 * `tests/implementation-map-boundary.test.ts` walks this directory for the three spellings of a
 * `links` write. A `computed` row never makes a file claimed — that is the third of the five
 * mechanisms — so this resolver is safe to run at all: the Code page draws its output as *nobody
 * has claimed this; three modules import it*, which is a question put to a person rather than an
 * answer given to one.
 */

import type { Provenance, Relation } from '@shared/implementation.ts'
import type { SourceFile } from '@shared/types.ts'

/** One row a resolver would write. `id` and `built_at` are the caller's, not the resolver's. */
export interface FindingRow {
  recordId: string
  path: string
  relation: Relation
  provenance: Provenance
  /** The file the resolver read. */
  evidencePath: string
  /** What it read there: the specifier, a manifest key, a launch-file stanza. */
  evidenceDetail: string
}

/** Everything a resolver is handed. It reads this and nothing else — no database, no filesystem. */
export interface ResolverInput {
  /** Every file the index holds for this repository. */
  files: readonly SourceFile[]
  /**
   * The files a `stated` row already covers.
   *
   * WHY A RESOLVER IS TOLD THIS. The candidate question is only asked about files nobody has
   * claimed, so a resolver that did not know would propose owners for code that already has one
   * and fill the `suggested` list with noise nobody can act on.
   */
  coveredByStated: ReadonlySet<string>
  /** Which records each file is served by, from the `stated` rows. One file may serve several. */
  servedBy: ReadonlyMap<string, readonly string[]>
  /** `compilerOptions.paths` from the repository's TypeScript configuration. Empty is normal. */
  aliases: ReadonlyMap<string, readonly string[]>
}

/** What one resolver produced, and what it could not read, which is never dropped. */
export interface ResolverRows {
  rows: FindingRow[]
  /**
   * Specifiers that resolved to nothing, counted and named.
   *
   * A RESOLVER THAT QUIETLY DROPS WHAT IT CANNOT READ REPORTS A SPARSER GRAPH THAN THE TRUTH and
   * nothing looks wrong. The count is whole; the list is the first twenty, because a reply is not
   * a log.
   */
  unresolved: { count: number; first: string[] }
  /** Specifiers that are outside the repository — `node:fs`, a bare package. Not an error. */
  outside: number
  /** What this resolver did, in one sentence, for the surface that reports the rebuild. */
  note: string
}

/**
 * ONE FUNCTION TYPE AND NOTHING MORE.
 *
 * `run` returning null is not an error and is reported: it means THIS REPOSITORY HAS NOTHING FOR
 * THIS RESOLVER TO READ. A repository with no TypeScript in it has nothing for the import resolver,
 * and *there is nothing here to read* and *there is nothing here* are different sentences.
 */
export interface Resolver {
  /** The provenance value every row it writes carries. ONE RESOLVER, ONE VALUE. */
  readonly provenance: Provenance
  /** What it needs to run, in words, for the surface that says nobody has looked. */
  readonly needs: string
  run(input: ResolverInput): ResolverRows | null
}

export { importResolver, resolveSpecifier, importEdges, aliasesFrom } from './imports.ts'

import { importResolver } from './imports.ts'

/**
 * Every resolver that produces findings, in the order they run.
 *
 * ONE ENTRY. The pattern matcher is the other resolver of the two and writes no findings; see the
 * header. A second entry here would be a second producer and would have to be a second provenance
 * value with its own row in `PROVENANCE`.
 */
export const RESOLVERS: readonly Resolver[] = [importResolver]
