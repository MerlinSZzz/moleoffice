// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EXPORT OF THE STORE AFTER THE RE-MINT IS CHECKED BEFORE THE MIRROR TAKES IT. Wave 13s round 171, item 2.
 * tools/verify-the-export.mjs runs these checks as a closed stable upgrade's verifier, under the contract of
 * tools/stable/closed-upgrade-verification.mjs, beside tools/verify-the-remint.mjs. They only read.
 *
 * The upgrade's step hands it a root, a folder that holds three folders and nothing else:
 *   mirror-before   the files of the mirror's last commit before the window, written out as a plain tree;
 *   export-1        `npx tsx scripts/export.ts --to <folder> --no-commit` on the store after the re-mint;
 *   export-2        the same command again, on the same store.
 * Every file and folder under the root is listed before any check runs, each file with its size. A link, or anything
 * that is neither a file nor a folder, is refused, so a compare can never be pointed at another tree. Each file is
 * opened without following a link, once when it is listed and again when a check reads it. A check reads one file of
 * each tree at a time and keeps none, so the verifier never holds a tree whole.
 *
 * The checks, as the step's owner wrote them:
 *   history-pages   every page under revisions/ and changes/ in mirror-before is in export-1 with the same bytes, but
 *                   where the re-mint's pass over the history replaced an id or a hash. A page is cut into runs of the
 *                   characters an id is made of and what lies between them. A run may differ only where it is a legacy
 *                   agent's old id and is the new id the staged map gives it, or is an old hash and is the new hash a
 *                   kept pair of the store after gives it. It fails when mirror-before holds no such page, because then
 *                   nothing was compared. A page cannot show where the pass kept an old id as it was typed, because an
 *                   old id may become its new id at any run. The re-mint verifier's rows check can, because it works
 *                   out each position by the pass's own plan (./remint-verification.ts);
 *   participants    participants.md in export-1 heads each agent by the id the staged map gives it, with the map's
 *                   handle, and holds no other agent;
 *   aliases         export-1 carries every alias of the store after, and no other. The store after is read through the
 *                   caller, which opens it read-only and immutable;
 *   second-export   export-2 holds the same files and folders as export-1, each file with the same bytes.
 * A difference names the path under the root, and the line in the file where there is one.
 */
import { closeSync, constants, fstatSync, lstatSync, openSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { byCodeUnit, parseExportFile } from './export-grammar.ts'
import { THE_KEPT_LISTS, type StagedRemint } from './remint-migration.ts'
import type { Outcome } from './remint-verification.ts'

/** The checks, in the order a request may name them. A request names all four. */
export const THE_EXPORT_CHECKS = ['history-pages', 'participants', 'aliases', 'second-export'] as const
export type AnExportCheck = (typeof THE_EXPORT_CHECKS)[number]

/** The three folders a root holds, and nothing else. */
export const THE_FOLDERS = ['mirror-before', 'export-1', 'export-2'] as const

/** What a check found, with each difference on a line of its own. */
export interface ExportOutcome extends Outcome {
  differences: string[]
}

/** Every file under one folder, by its path under the folder, with its size in bytes, and every folder under it. */
export interface ATree {
  folder: string
  files: Map<string, number>
  folders: Set<string>
}

export interface TheRoot {
  mirrorBefore: ATree
  first: ATree
  second: ATree
}

/** A root that cannot be compared. The verifier refuses it, before any check runs. */
export class TheRootIsRefused extends Error {
  override readonly name = 'TheRootIsRefused'
}

const pass = (why: string): ExportOutcome => ({ passed: true, why, differences: [] })
const fail = (why: string, differences: string[]): ExportOutcome => ({ passed: false, why, differences })
const plural = (n: number, one: string, many = `${one}s`) => `${String(n)} ${n === 1 ? one : many}`
const theSameBytes = (a: Buffer, b: Buffer) => a.equals(b)

/** One file, opened without following a link and refused unless it is an ordinary file, given to `read` with its size. */
function theOpened<T>(file: string, read: (descriptor: number, size: number) => T): T {
  const descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = fstatSync(descriptor)
    if (!stat.isFile()) throw new TheRootIsRefused(`${file} is not an ordinary file.`)
    return read(descriptor, stat.size)
  } finally {
    closeSync(descriptor)
  }
}

/** The bytes of the file at `path` in `tree`, read from disk now, and kept by nothing here. */
const bytesOf = (tree: ATree, path: string): Buffer => theOpened(join(tree.folder, path), (descriptor) => readFileSync(descriptor))

/** Every file and folder under `folder`, which is `under` in what a refusal says. */
function theTreeOf(folder: string, under: string): ATree {
  const tree: ATree = { folder, files: new Map(), folders: new Set() }
  const visit = (at: string): void => {
    for (const entry of readdirSync(at === '' ? folder : join(folder, at), { withFileTypes: true }).sort((a, b) => byCodeUnit(a.name, b.name))) {
      const path = at === '' ? entry.name : `${at}/${entry.name}`
      if (!entry.isFile() && !entry.isDirectory()) throw new TheRootIsRefused(`${under}/${path} is ${entry.isSymbolicLink() ? 'a link' : 'neither a file nor a folder'}, and the root may hold only files and folders.`)
      if (entry.isDirectory()) {
        tree.folders.add(path)
        visit(path)
        continue
      }
      tree.files.set(path, theOpened(join(folder, path), (_, size) => size))
    }
  }
  visit('')
  return tree
}

/** THE ROOT, LISTED WHOLE: a real folder holding the three folders and nothing else, each listed with every file in it. */
export function theRootsFolders(root: string): TheRoot {
  const stat = lstatSync(root)
  if (stat.isSymbolicLink()) throw new TheRootIsRefused(`The root ${root} is a link, and it must be a real folder.`)
  if (!stat.isDirectory()) throw new TheRootIsRefused(`The root ${root} is not a folder.`)
  const entries = readdirSync(root, { withFileTypes: true })
  const others = entries.filter((entry) => !(THE_FOLDERS as readonly string[]).includes(entry.name)).map((entry) => entry.name).sort(byCodeUnit)
  if (others.length) throw new TheRootIsRefused(`The root holds ${others.map((name) => JSON.stringify(name)).join(', ')}, and it may hold only ${THE_FOLDERS.join(', ')}.`)
  const [mirrorBefore, first, second] = THE_FOLDERS.map((name) => {
    const entry = entries.find((one) => one.name === name)
    if (entry === undefined) throw new TheRootIsRefused(`The root holds no ${name} folder.`)
    if (!entry.isDirectory()) throw new TheRootIsRefused(`${name} in the root is ${entry.isSymbolicLink() ? 'a link' : 'not a folder'}, and it must be a real folder.`)
    return theTreeOf(join(root, name), name)
  }) as [ATree, ATree, ATree]
  return { mirrorBefore, first, second }
}

const isAHistoryPage = (path: string) => path.startsWith('revisions/') || path.startsWith('changes/')

/** A run of the characters an office id is made of, the alphabet src/shared/record-id-shape.ts reads ids by. A hash is such a run too. */
const A_RUN = /([A-Za-z0-9_-]+)/u

/**
 * WHAT EACH OLD RUN MAY BECOME in a history page: a legacy agent's old id the new id the staged map gives it, and an
 * old hash each new hash a kept pair of this re-mint's generation in the store after gives it.
 */
export function whatEachRunMayBecome(remint: StagedRemint, after: Database.Database): Map<string, Set<string>> {
  const mayBecome = new Map<string, Set<string>>()
  const add = (old: string, now: string) => mayBecome.set(old, (mayBecome.get(old) ?? new Set<string>()).add(now))
  for (const entry of remint.map.entries) if (entry.from === 'legacy') add(entry.oldId, entry.newId)
  for (const pair of after.prepare(`SELECT old, new FROM "${THE_KEPT_LISTS}" WHERE generation = ? AND list <> 'agent_id'`).all(remint.map.digest) as { old: string; new: string }[]) add(pair.old, pair.new)
  return mayBecome
}

/**
 * The first place where `was` and `now` differ in a way `mayBecome` does not allow, with its line in `was`, or null
 * when they differ nowhere else. Both are cut into the same runs; a run of `was` that `mayBecome` lets become the run
 * of `now` at the same place is not a difference.
 */
export function theFirstDifference(was: string, now: string, mayBecome: ReadonlyMap<string, ReadonlySet<string>>): string | null {
  const pieces = [was.split(A_RUN), now.split(A_RUN)] as const
  let line = 1
  for (let at = 0; at < Math.max(pieces[0].length, pieces[1].length); at++) {
    const before = pieces[0][at]
    const after = pieces[1][at]
    if (before === after) {
      line += before!.split('\n').length - 1
      continue
    }
    // An odd place holds a run, because split with a group puts each match between the pieces around it.
    if (at % 2 === 1 && before !== undefined && after !== undefined && mayBecome.get(before)?.has(after) === true) continue
    return `at line ${String(line)} holds ${after === undefined ? 'nothing more' : JSON.stringify(after)} where mirror-before holds ${before === undefined ? 'nothing more' : JSON.stringify(before)}.`
  }
  return null
}

/** The checks, each a function the verifier calls in the order the request names them. */
export function theExportChecks(root: TheRoot, remint: StagedRemint, after: () => Database.Database): Record<AnExportCheck, () => ExportOutcome> {
  const { mirrorBefore, first, second } = root
  return {
    'history-pages': () => {
      const pages = [...mirrorBefore.files.keys()].filter(isAHistoryPage)
      if (!pages.length) return fail('mirror-before holds no page under revisions/ or changes/, so nothing was compared.', [])
      const mayBecome = whatEachRunMayBecome(remint, after())
      const differences: string[] = []
      let replaced = 0
      for (const path of pages) {
        if (!first.files.has(path)) {
          differences.push(`mirror-before/${path}: export-1 holds no page there.`)
          continue
        }
        const before = bytesOf(mirrorBefore, path)
        const staged = bytesOf(first, path)
        if (theSameBytes(before, staged)) continue
        const differs = theFirstDifference(before.toString('utf8'), staged.toString('utf8'), mayBecome)
        if (differs === null) replaced++
        else differences.push(`mirror-before/${path}: export-1/${path} ${differs}`)
      }
      if (differences.length) return fail(`${plural(differences.length, 'page')} of the ${String(pages.length)} under revisions/ and changes/ in mirror-before ${differences.length === 1 ? 'is' : 'are'} not in export-1 with the same bytes, but for the ids and hashes the re-mint replaced.`, differences)
      return pass(`Each of the ${plural(pages.length, 'page')} under revisions/ and changes/ in mirror-before is in export-1 with the same bytes, but for the ids and hashes the re-mint replaced, in ${plural(replaced, 'page')}.`)
    },

    participants: () => {
      const file = 'export-1/participants.md'
      if (!first.files.has('participants.md')) return fail('export-1 holds no participants.md.', [`${file}: there is no such file.`])
      const text = bytesOf(first, 'participants.md').toString('utf8')
      let blocks
      try {
        blocks = parseExportFile(text, file).regions.filter((region) => region.name === 'agents' && region.kind === 'fields')
      } catch (error) {
        return fail('participants.md in export-1 does not follow the export grammar.', [error instanceof Error ? error.message : String(error)])
      }
      const lines = text.split('\n')
      const expected = new Map(remint.map.entries.map((entry) => [entry.newId, entry]))
      const oldIds = new Map(remint.map.entries.filter((entry) => entry.oldId !== entry.newId).map((entry) => [entry.oldId, entry]))
      const differences: string[] = []
      const headed = new Set<string>()
      for (const block of blocks) {
        const at = `${file}:${String(block.line)}`
        const id = block.fields['id']
        if (typeof id !== 'string') {
          differences.push(`${at}: an agent's block holds no id.`)
          continue
        }
        headed.add(id)
        // The last heading above the block is the one it is under.
        let heading: string | undefined
        for (const line of lines.slice(0, block.line - 1)) if (line.startsWith('### ')) heading = line
        if (heading === undefined || !heading.startsWith(`### ${id} — `)) differences.push(`${at}: the agent "${id}" is headed ${heading === undefined ? 'by nothing' : JSON.stringify(heading)}, and not by its id.`)
        const entry = expected.get(id)
        if (entry === undefined) {
          const moved = oldIds.get(id)
          differences.push(moved === undefined ? `${at}: the agent "${id}" is not in the map.` : `${at}: the agent "${id}" is held by its old id, and the map gives it "${moved.newId}".`)
          continue
        }
        if (block.fields['handle'] !== entry.handle) differences.push(`${at}: the agent "${id}" has the handle ${JSON.stringify(block.fields['handle'])}, and the map gives it ${JSON.stringify(entry.handle)}.`)
      }
      for (const [id, entry] of expected) if (!headed.has(id)) differences.push(`${file}: no agent is held by "${id}", the id the map gives the agent that was "${entry.oldId}".`)
      if (differences.length) return fail(`participants.md in export-1 does not head each of the map's ${plural(expected.size, 'agent')} by the id the map gives it.`, differences)
      return pass(`participants.md in export-1 heads each of the map's ${plural(expected.size, 'agent')} by the id the map gives it, with the map's handle, and no other.`)
    },

    aliases: () => {
      const key = (namespace: unknown, aliasId: unknown, canonicalId: unknown) => JSON.stringify([namespace, aliasId, canonicalId])
      const held = new Map<string, { namespace: string; aliasId: string; canonicalId: string }>()
      for (const row of after().prepare('SELECT namespace, alias_id, canonical_id FROM registry_aliases').all() as { namespace: string; alias_id: string; canonical_id: string }[]) {
        held.set(key(row.namespace, row.alias_id, row.canonical_id), { namespace: row.namespace, aliasId: row.alias_id, canonicalId: row.canonical_id })
      }
      const differences: string[] = []
      const carried = new Map<string, { at: string; aliasId: unknown }>()
      for (const path of first.files.keys()) {
        if (!path.endsWith('.md')) continue
        // Read outside the try, so a file that cannot be read stops the check, and is not shown as a page out of grammar.
        const text = bytesOf(first, path).toString('utf8')
        let regions
        try {
          regions = parseExportFile(text, `export-1/${path}`).regions
        } catch (error) {
          differences.push(error instanceof Error ? error.message : String(error))
          continue
        }
        for (const region of regions) {
          if (region.name !== 'registry_aliases') continue
          const { namespace, aliasId, canonicalId } = region.fields
          const at = `export-1/${path}:${String(region.line)}`
          const one = key(namespace, aliasId, canonicalId)
          if (carried.has(one)) differences.push(`${at}: the alias ${JSON.stringify(aliasId)} to ${JSON.stringify(canonicalId)} is carried a second time, after ${carried.get(one)!.at}.`)
          else carried.set(one, { at, aliasId })
        }
      }
      for (const [at, alias] of held) if (!carried.has(at)) differences.push(`export-1: no file carries the alias "${alias.aliasId}" of ${alias.namespace} to "${alias.canonicalId}", which the store after holds.`)
      for (const [at, alias] of carried) if (!held.has(at)) differences.push(`${alias.at}: the alias ${JSON.stringify(alias.aliasId)} is not one the store after holds.`)
      if (differences.length) return fail(`export-1 does not carry exactly the ${plural(held.size, 'alias', 'aliases')} of the store after.`, differences)
      return pass(`export-1 carries each of the ${plural(held.size, 'alias', 'aliases')} of the store after, and no other.`)
    },

    'second-export': () => {
      const differences: string[] = []
      for (const path of first.files.keys()) if (!second.files.has(path)) differences.push(`export-1/${path}: export-2 has no file there.`)
      for (const path of second.files.keys()) if (!first.files.has(path)) differences.push(`export-2/${path}: export-1 has no file there.`)
      for (const [path, size] of second.files) {
        const was = first.files.get(path)
        // Two sizes that differ are other bytes, so neither file is read; two that agree are compared byte for byte.
        if (was !== undefined && (was !== size || !theSameBytes(bytesOf(first, path), bytesOf(second, path)))) differences.push(`export-2/${path}: holds other bytes than export-1/${path}.`)
      }
      for (const path of first.folders) if (!second.folders.has(path)) differences.push(`export-1/${path}/: export-2 has no folder there.`)
      for (const path of second.folders) if (!first.folders.has(path)) differences.push(`export-2/${path}/: export-1 has no folder there.`)
      if (differences.length) return fail(`export-2 differs from export-1 in ${plural(differences.length, 'place')}.`, differences)
      return pass(`export-2 holds the same ${plural(first.files.size, 'file')} and ${plural(first.folders.size, 'folder')} as export-1, each file with the same bytes.`)
    },
  }
}
