// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REPOSITORY IS A TREE OF CODE WITH A NAME, KEYED ON THE ROOT IT RESOLVES TO.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * A path means nothing on its own. `src/server/lib/records.ts` is a different file in every
 * checkout on this machine, and A.2 of the owner's addendum gives the rule in two sentences:
 * *"Repository identity establishes the Git ownership boundary."* and *"Paths are resolved
 * relative to the relevant repository identity."* This file is that identity.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A REPOSITORY IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * NOT A RECORD. A.1 lists *"repositories;"* first among the implementation resources that belong in
 * a lower-level machine-maintained index. A repository in `records` would appear in `Everything`,
 * in the attention ranking, in containment and in every kind list, for no gain.
 *
 * NOT A CHECKOUT. The identity travels; the directory does not. `root` is a column on the row and
 * an archive carries it, so a restore on another machine holds a path that machine may not have —
 * the first rebuild there refuses by name and a person re-points each root once. The relationships
 * survive untouched because they are repository-relative, which is the whole of A.2.
 *
 * NOT A VERSION-CONTROL CLIENT. A.2: *"Do not invent a competing PanelX file-version ownership
 * system."* Mole Office holds the name and, on this machine, a directory to walk. It runs no git; the
 * only `node:child_process` import under `src/` is in `lib/resources.ts`.
 *
 * ---------------------------------------------------------------------------------------
 * KEYED ON THE RESOLVED ROOT, WHICH IS THE CORRECTION THIS FILE EXISTS TO CARRY
 * ---------------------------------------------------------------------------------------
 *
 * `repositoriesFromIndexes` groups by ROOT and never by workspace. The draft it replaces said "for
 * each workspace that has a `source_index` row, insert one `repositories` row", and run as written
 * that mints one repository per workspace for what may be one checkout on disk. Every finding then
 * resolves against whichever row the caller's workspace happened to pick and the two halves of one
 * map never meet. A repository IS a checkout, so it is keyed on the root it resolves to, and two
 * workspaces pointing at one root is one repository with two pointers — which is a true thing the
 * note can say.
 *
 * MEASURED, ON A COPY OF THE OWNER'S CORPUS, 25 AUGUST 2026, BY `tools/count-the-map.mjs`:
 * `source_index` holds ONE row — workspace `default`, root the checkout's own folder, built
 * 2026-08-10 22:15:53 — and 242 files. `design/ROUND-TEN-BUILD-PLAN.md`'s wave 6 step 1 says two
 * rows, `default` and `panelx`. That two-row corpus is the 24 August isolated copy, whose second
 * row was written by a rebuild run inside the copy under a different workspace id — which is the
 * collision's own mechanism caught happening, and it took one command. Count against the database
 * in front of you, never against either figure.
 */

import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { anOfficeId } from './ids.ts'
import { sqlite } from '../db/client.ts'
import { assertMayRepointARepository, type Actor } from './records.ts'
import { logChange } from './log-change.ts'
import { PanelError } from './panel-error.ts'
import { localStamp } from '@shared/time.ts'
import { toRepository } from '../db/list-repositories.ts'
import { repositoryById } from '../db/repository-by-id.ts'
import { repositoryNamed } from '../db/repository-named.ts'
import type { Repository, RepoRow } from '../db/types/repositories.ts'

// ============================================================================ what a row is

export type { Repository, RepoRow } from '../db/types/repositories.ts'

export { toRepository } from '../db/list-repositories.ts'

// ============================================================================ the root check

/**
 * One place decides whether a string is a directory this machine can walk.
 *
 * A ROOT THAT IS SET AND IS NOT A DIRECTORY IS NEVER TREATED AS "NO CHECKOUT HERE". Falling back
 * would index the wrong tree and report every relationship in the right one as stale — which is
 * the failure the source index already has on record, arriving through a different door. So this
 * throws, naming the value, and the caller decides what a NULL means.
 *
 * `whoseRootThisIs` IS A SENTENCE THE CALLER SUPPLIES, because the two callers are answering two
 * different people. `repoRoot` in sourceindex.ts is reading an environment variable and its
 * refusal has to name it; registering a repository is a person filling in a form and its refusal
 * has to name the repository. The CHECK is one function; the sentence is the caller's.
 */
export function checkedRoot(raw: string, whoseRootThisIs: string): string {
  const root = resolve(raw.trim())
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new PanelError(
      `"${raw}" is not a directory on this machine, and ${whoseRootThisIs}. Point it at the top of a checkout. ` +
        `It is not treated as "there is no checkout of this here": that is what leaving the root empty means, and ` +
        `guessing between the two would index the wrong tree and then report every relationship in the right one ` +
        `as stale.`,
    )
  }
  return root
}

// ============================================================================ reads

export { listRepositories } from '../db/list-repositories.ts'

export { repositoryById } from '../db/repository-by-id.ts'

export { repositoryNamed } from '../db/repository-named.ts'

/** Has this repository ever been scanned? Read from the index stamp, which is the only record of it. */
export function everScanned(repositoryId: string, workspaceId: string): boolean {
  const row = sqlite
    .prepare('SELECT 1 AS yes FROM source_index WHERE workspace_id = ? AND repository_id = ?')
    .get(workspaceId, repositoryId) as { yes: number } | undefined
  return row !== undefined
}

// ============================================================================ writes

export interface RegisterRepository {
  workspaceId: string
  name: string
  /** Absolute, or null/undefined because there is no checkout of it on this machine. */
  root?: string | null
  note?: string | null
  actor: Actor
}

/**
 * Register a repository. It does NOT scan.
 *
 * A SCAN STARTED BY A WRITE WOULD MAKE `built_at` MEAN *when somebody last saved a form*. The
 * existing coverage refusal makes the same argument against scanning on a read and its wording is
 * kept: it is not built on read on purpose.
 *
 * THE NAME IS UNIQUE INSIDE A WORKSPACE, AND THAT IS DIFFERENT FROM HOW `records.title` BEHAVES. A
 * title may repeat because a title is a label on somebody's thought. A repository name is how a
 * person tells two checkouts apart in a path prefix, and two called `firmware` in one project would
 * make every relationship ambiguous on screen. The refusal names the other row.
 */
export function registerRepository(opts: RegisterRepository): Repository {
  const name = opts.name.trim()
  if (name === '') {
    throw new PanelError(
      'A repository needs a name — it is how a person tells two checkouts apart in a path prefix. "mole-office", ' +
        '"calibration", "firmware".',
    )
  }
  const clash = repositoryNamed(name, opts.workspaceId)
  if (clash !== null) {
    throw new PanelError(
      `This project already has a repository called "${name}" — ${clash.id}, registered ${clash.createdAt}` +
        `${clash.root === null ? ', with no checkout on this machine' : `, rooted at ${clash.root}`}. Two with one ` +
        `name would make every relationship ambiguous on screen. Give this one a different name, or re-point that ` +
        `one with PATCH /api/implementation/repositories/${clash.id}.`,
      409,
    )
  }

  const raw = opts.root ?? null
  const root =
    raw === null || raw.trim() === ''
      ? null
      : checkedRoot(raw, `it is being registered as the root of the repository "${name}"`)

  const at = localStamp(new Date())
  const row: RepoRow = {
    id: anOfficeId(),
    workspace_id: opts.workspaceId,
    name,
    note: opts.note ?? null,
    root,
    created_at: at,
    updated_at: at,
    created_by: `${opts.actor.type}:${opts.actor.id}`,
  }
  sqlite.transaction(() => {
    sqlite
      .prepare(
        'INSERT INTO repositories (id, workspace_id, name, note, root, created_at, updated_at, created_by) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(row.id, row.workspace_id, row.name, row.note, row.root, row.created_at, row.updated_at, row.created_by)
    // NO RECORD ANSWERS TO THIS ID, so the workspace is passed explicitly — the one case
    // `logChange`'s last parameter exists for. A repository is not a record and never becomes one.
    logChange(row.id, 'create', opts.actor, 'repository', null, name, opts.workspaceId)
  })()
  return toRepository(row)
}

/** What a re-point threw away, so the answer can say it rather than leaving it to be discovered. */
export interface Repointed {
  repository: Repository
  wasRoot: string | null
  /** Rows deleted because nothing derived from a tree may outlive the pointer to that tree. */
  droppedIndexFiles: number
  droppedFindings: number
  /** True when the repository had been scanned, which is what makes the next rebuild a first build. */
  hadAnIndex: boolean
  note: string
}

/**
 * Rename a repository, change its note, or re-point its root.
 *
 * RE-POINTING IS THE HIGHEST-CONSEQUENCE WRITE IN THIS DESIGN, because it changes what every stated
 * pattern in that repository resolves against. Five things happen and they happen in one
 * transaction:
 *
 *   1. The new root is checked exactly as registration checks it. No fallback.
 *   2. It is refused to a non-human WHEN THIS REPOSITORY HAS EVER BEEN SCANNED. A root that has
 *      never been scanned has nothing derived hanging off it and nothing to throw away, so that
 *      case is not gated — the narrowest rule that covers the act.
 *   3. Every `implementation_findings` row for this repository is deleted, and so are its
 *      `source_files`, `source_file_hashes` and `source_index` rows. NOTHING DERIVED FROM A TREE
 *      MAY OUTLIVE THE POINTER TO THAT TREE. Without this a Module page draws suggested files from
 *      the old checkout beside an index age of three minutes.
 *   4. `implementation_map` IS NOT TOUCHED. The relationships are repository-relative statements
 *      and they survive a re-point. Some may now match nothing; that is a stale row.
 *   5. One `changes` row, naming the old root and the new one.
 *
 * AND THE NEXT REBUILD IS A FIRST BUILD. After step 3 there is no previous build, so the rebuild
 * that follows reports neither `wentStale` nor `cameBack` — it reports that this is the first build
 * since the root moved. Comparing a build of one tree against a build of a different tree would
 * report every difference between two checkouts as a change inside one.
 */
export function updateRepository(opts: {
  id: string
  workspaceId: string
  name?: string
  note?: string | null
  /** `undefined` means leave it alone. `null` means there is no checkout of this here any more. */
  root?: string | null
  actor: Actor
  /** The act as the door declares it, read from its route, for the refusal a person who is not proved reads. */
  theAct?: string
}): Repointed {
  const before = repositoryById(opts.id, opts.workspaceId)
  if (before === null) {
    throw new PanelError(`No repository ${opts.id} in this project. GET /api/implementation/repositories lists them.`, 404)
  }

  let name = before.name
  if (opts.name !== undefined && opts.name.trim() !== before.name) {
    name = opts.name.trim()
    if (name === '') throw new PanelError('A repository needs a name.')
    const clash = repositoryNamed(name, opts.workspaceId)
    if (clash !== null && clash.id !== before.id) {
      throw new PanelError(
        `This project already has a repository called "${name}" — ${clash.id}. Two with one name would make every ` +
          `relationship ambiguous on screen.`,
        409,
      )
    }
  }

  const note = opts.note === undefined ? before.note : opts.note

  // A ROOT CHANGE IS THE ONLY PART THAT IS NOT ORDINARY, so it is decided before anything is
  // written and gated on its own.
  const asked = opts.root
  const repointing = asked !== undefined && (asked ?? null) !== before.root
  const newRoot =
    asked === undefined || !repointing
      ? before.root
      : asked === null || asked.trim() === ''
        ? null
        : checkedRoot(asked, `it is being set as the root of the repository "${name}"`)

  const scanned = everScanned(opts.id, opts.workspaceId)
  if (repointing) assertMayRepointARepository({ id: before.id, name: before.name, root: before.root }, scanned, opts.actor, opts.theAct)

  let droppedIndexFiles = 0
  let droppedFindings = 0
  const at = localStamp(new Date())
  sqlite.transaction(() => {
    sqlite
      .prepare('UPDATE repositories SET name = ?, note = ?, root = ?, updated_at = ? WHERE id = ?')
      .run(name, note, newRoot, at, opts.id)
    if (repointing) {
      droppedIndexFiles = sqlite
        .prepare('DELETE FROM source_files WHERE workspace_id = ? AND repository_id = ?')
        .run(opts.workspaceId, opts.id).changes
      sqlite
        .prepare('DELETE FROM source_file_hashes WHERE workspace_id = ? AND repository_id = ?')
        .run(opts.workspaceId, opts.id)
      sqlite.prepare('DELETE FROM source_index WHERE workspace_id = ? AND repository_id = ?').run(opts.workspaceId, opts.id)
      droppedFindings = sqlite
        .prepare('DELETE FROM implementation_findings WHERE workspace_id = ? AND repository_id = ?')
        .run(opts.workspaceId, opts.id).changes
      logChange(opts.id, 'update', opts.actor, 'repository.root', before.root, newRoot, opts.workspaceId)
    } else {
      logChange(opts.id, 'update', opts.actor, 'repository', before.name, name, opts.workspaceId)
    }
  })()

  const after = repositoryById(opts.id, opts.workspaceId)
  if (after === null) throw new PanelError(`Repository ${opts.id} disappeared during its own update.`, 500)
  return {
    repository: after,
    wasRoot: before.root,
    droppedIndexFiles,
    droppedFindings,
    hadAnIndex: scanned,
    note: !repointing
      ? `"${after.name}" updated. Nothing derived was touched, because nothing derived depends on a name or a note.`
      : `"${after.name}" now points at ${newRoot ?? 'no checkout on this machine'}, and it pointed at ` +
        `${before.root ?? 'no checkout on this machine'}. ${droppedIndexFiles} indexed files and ${droppedFindings} ` +
        `resolver findings were deleted with the pointer, because nothing derived from a tree may outlive the ` +
        `pointer to that tree. Every relationship somebody stated is untouched — they are repository-relative. The ` +
        `next rebuild is a first build and will report neither what went stale nor what came back, because there is ` +
        `nothing of this tree to compare against.`,
  }
}

/**
 * Delete a repository.
 *
 * REFUSED WHILE ANY AUTHORED ROW REFERENCES IT — `implementation_map` or `implementation_revisions`
 * — naming the count and the route that lists them. DERIVED ROWS NEVER BLOCK IT: findings and index
 * rows are deleted with the repository in the same transaction. Counting them would make the
 * refusal permanent on any repository that had ever been scanned, since nothing offers to clear
 * them on their own.
 */
export function deleteRepository(id: string, workspaceId: string, actor: Actor): { note: string } {
  const repo = repositoryById(id, workspaceId)
  if (repo === null) throw new PanelError(`No repository ${id} in this project.`, 404)

  const mapRows = (
    sqlite
      .prepare('SELECT count(*) AS c FROM implementation_map WHERE repository_id = ? AND deleted_at IS NULL')
      .get(id) as { c: number }
  ).c
  const revisions = (
    sqlite.prepare('SELECT count(*) AS c FROM implementation_revisions WHERE repository_id = ?').get(id) as {
      c: number
    }
  ).c
  if (mapRows > 0 || revisions > 0) {
    throw new PanelError(
      `"${repo.name}" still holds ${mapRows} relationship${mapRows === 1 ? '' : 's'} somebody stated and ` +
        `${revisions} code revision${revisions === 1 ? '' : 's'} somebody named. Deleting it would leave every one ` +
        `of them pointing at a repository that is not there. GET /api/implementation/repositories/${id}/rows lists ` +
        `them; remove them, or re-point this repository instead of deleting it. Findings and index rows do NOT ` +
        `block this — they are derived and go with it.`,
      409,
    )
  }

  sqlite.transaction(() => {
    sqlite.prepare('DELETE FROM source_files WHERE workspace_id = ? AND repository_id = ?').run(workspaceId, id)
    sqlite.prepare('DELETE FROM source_file_hashes WHERE workspace_id = ? AND repository_id = ?').run(workspaceId, id)
    sqlite.prepare('DELETE FROM source_index WHERE workspace_id = ? AND repository_id = ?').run(workspaceId, id)
    sqlite.prepare('DELETE FROM implementation_findings WHERE workspace_id = ? AND repository_id = ?').run(workspaceId, id)
    sqlite.prepare('DELETE FROM repositories WHERE id = ?').run(id)
    logChange(id, 'delete', actor, 'repository', repo.name, null, workspaceId)
  })()
  return { note: `"${repo.name}" is gone, and so is everything derived from its tree. Nothing anybody stated was lost, because there was none.` }
}

// ============================================================================ one row per root

/** One `source_index` row, as the grouping below reads it. */
export interface IndexPointer {
  workspaceId: string
  root: string
  builtAt: string
}

/** One repository the grouping would mint, with every workspace that pointed at its root. */
export interface RepositoryToMint {
  /** The resolved root. This is the key. */
  root: string
  /** The last segment of the root, which is what a person calls it. */
  name: string
  /**
   * Which workspace the row belongs to: the one whose index was built first.
   *
   * A ROW HAS TO BELONG TO ONE, because `repositories.workspace_id` is NOT NULL and
   * `repositories_name_idx` is keyed on it. Choosing the earliest build is a rule rather than a
   * preference: it is stable under re-running, it does not depend on the order SQLite returns rows
   * in, and it names the workspace that actually indexed this tree first.
   */
  workspaceId: string
  /** Every workspace that pointed a `source_index` row at this root, in the order they built. */
  pointedAtBy: string[]
  /** The sentence that says where this row came from and who pointed at it. */
  note: string
}

/**
 * ONE REPOSITORY PER DISTINCT ROOT, NOT ONE PER WORKSPACE.
 *
 * This is the whole of step 1 and it is a pure function so that it can be counted before it is run.
 * Feed it the `source_index` rows and it returns the repositories that would be minted. Nothing is
 * written here and nothing is read from the database.
 *
 * THE MUTATION THIS SHAPE EXISTS TO SURVIVE: key on the workspace instead of the root and the count
 * becomes 2 for a corpus that holds one checkout twice. `tests/repositories.test.ts` runs exactly
 * that fixture — two `source_index` rows, one root — and asserts one row with two pointers.
 */
export function repositoriesFromIndexes(pointers: readonly IndexPointer[]): RepositoryToMint[] {
  const byRoot = new Map<string, IndexPointer[]>()
  for (const pointer of pointers) {
    const key = resolve(pointer.root)
    const held = byRoot.get(key)
    if (held === undefined) byRoot.set(key, [pointer])
    else held.push(pointer)
  }

  const minted: RepositoryToMint[] = []
  for (const [root, group] of byRoot) {
    // Earliest build first, and the workspace id breaks a tie, so the answer does not depend on the
    // order the rows arrived in.
    const ordered = [...group].sort((a, b) =>
      a.builtAt === b.builtAt ? a.workspaceId.localeCompare(b.workspaceId) : a.builtAt.localeCompare(b.builtAt),
    )
    const pointedAtBy = [...new Set(ordered.map((p) => p.workspaceId))]
    const name = root.split('/').filter((s) => s !== '').pop() ?? root
    const first = ordered[0]
    if (first === undefined) continue
    minted.push({
      root,
      name,
      workspaceId: first.workspaceId,
      pointedAtBy,
      note:
        `Created from the source indexes that were already here, which is why it has a root and nobody typed one. ` +
        `${pointedAtBy.length === 1 ? 'One project pointed' : `${pointedAtBy.length} projects pointed`} at this ` +
        `checkout: ${pointedAtBy.join(', ')}. It is ONE repository because it is one directory on disk — two ` +
        `projects indexing one tree is one repository with two pointers, not two repositories.`,
    })
  }
  return minted.sort((a, b) => a.root.localeCompare(b.root))
}

/** Every `source_index` row in the database, for the grouping above. */
export function indexPointers(): IndexPointer[] {
  const rows = sqlite.prepare('SELECT workspace_id, root, built_at FROM source_index').all() as {
    workspace_id: string
    root: string
    built_at: string
  }[]
  return rows.map((r) => ({ workspaceId: r.workspace_id, root: r.root, builtAt: r.built_at }))
}
