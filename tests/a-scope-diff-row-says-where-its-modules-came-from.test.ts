// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SCOPE-DIFF ROW SAYS WHERE ITS MODULES CAME FROM, AND AN ACCEPTED GUESS IS NOT CALLED DECLARED. Problem zLPu7xMQPdG6.
 *
 * The rows shared_file, extra_semantic and no_known_path of a work domain wrote provenance "declared" as a constant.
 * Since problem rcot13ESrmvI's fix (merge entry oY6Z59fRPaPt), their modules come from stated rows of the implementation
 * map, and a guess a person has accepted is a stated row whose provenance is "llm". The rows now ask the map for each
 * module's row, say each one in `eachModule`, and give one provenance for the whole row only when all agree.
 *
 * The steps are the problem's own "how to tell it is back": propose a row for a module, accept it as the person, open a
 * work domain that writes a file of that row and names a different module, resolve it, and read the extra_semantic
 * row. Every module, repository and file here is made up, in a folder of this test's own.
 *
 * Three-run proof, this whole file each time:
 *   node tools/run-named-tests.mjs tests/a-scope-diff-row-says-where-its-modules-came-from.test.ts
 * Mutations in src/server/lib/workdomain.ts, one at a time, restored with cp and checked with cmp:
 *   A. `whereTheModulesCameFrom`: `...(agree && first !== undefined ? { provenance: first } : {})` to
 *      `provenance: 'declared' as Provenance`: cases 1, 3 and 4 go red (the constant is back).
 *   B. the same line to `...(first !== undefined ? { provenance: first } : {})`: case 3 goes red (a mixed row is
 *      given one provenance).
 *   C. `theRowsBehind`: `if (onlyModule !== undefined && row.recordId !== onlyModule) continue` removed: case 3 goes
 *      red (an extra_semantic row about one module lists the other).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
import { AGENT, freshDb, type TestDb } from './helpers.ts'
import type { Actor } from '../src/server/lib/records.ts'
import type { Difference } from '../src/server/lib/workdomain.ts'

let t: TestDb
let workspaces: typeof import('../src/server/lib/workspaces.ts')
let workspace: string
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
  workspaces = await import('../src/server/lib/workspaces.ts')
}, A_HOOK_THAT_IMPORTS_THE_SERVER)
afterAll(() => {
  t.close()
})

beforeEach(() => {
  // Each case files into its own project, so a module, a repository and a work domain from another
  // case never appear in the differences this one resolves.
  caseNumber += 1
  workspace = `scope-diff-case-${String(caseNumber)}`
  workspaces.createWorkspace({ id: workspace, title: `Scope diff case ${String(caseNumber)}` })
})

function person(): Actor {
  return { type: 'human', id: t.api.HUMAN.id, stated: true }
}

type Kind = Parameters<TestDb['api']['createRecord']>[0]['kind']

function aRecord(kind: Kind, title: string, data: Record<string, unknown>, actor: Actor = person()): string {
  return t.api.createRecord({ kind, title, data, workspaceId: workspace, actor }).id
}

/** A made-up checkout with three files, registered as the project's one repository and scanned into its own slot. */
async function aRepository(): Promise<string> {
  const root = join(t.file, '..', 'scope-diff-repository')
  mkdirSync(join(root, 'src', 'shared'), { recursive: true })
  mkdirSync(join(root, 'src', 'web'), { recursive: true })
  writeFileSync(join(root, 'src/shared/time.ts'), 'export const now = 1\n', 'utf8')
  writeFileSync(join(root, 'src/shared/detail.ts'), 'export const detail = 2\n', 'utf8')
  writeFileSync(join(root, 'src/web/App.tsx'), 'export const App = 3\n', 'utf8')
  const { registerRepository } = await import('../src/server/lib/repositories.ts')
  const id = registerRepository({ workspaceId: workspace, name: 'scope-diff', root, actor: person() }).id
  // Its own scan, because an entry in a registered repository is resolved against that repository's stored
  // scan and never against the workspace scan, which records no repository (decision 0KSoGUNDF9ml).
  const { rebuildRepository } = await import('../src/server/lib/implementation.ts')
  rebuildRepository({ workspaceId: workspace, repositoryId: id, actor: person() })
  return id
}

/** A module and one row saying it implements `pattern`: stated by the person, or a machine's guess the person then accepts. */
async function aModuleOver(title: string, repositoryId: string, pattern: string, how: 'stated' | 'an accepted guess'): Promise<string> {
  const moduleId = aRecord('module', title, { context: title, state: 'active' })
  const { declareRelationship, acceptGuess } = await import('../src/server/lib/implementation.ts')
  const proposing = how === 'an accepted guess'
  const { row } = declareRelationship({ workspaceId: workspace, recordId: moduleId, repositoryId, pattern, proposing, actor: proposing ? AGENT : person() })
  if (proposing) acceptGuess(row.id, workspace, person())
  return moduleId
}

/** A work domain with its own agent and session, resolved; its differences. */
async function differencesOf(title: string, data: Record<string, unknown>): Promise<Difference[]> {
  const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const agent = aRecord('agent', `Agent ${handle}`, { handle, state: 'active' })
  const session = aRecord('session', title, { doing: title })
  const id = aRecord('work_domain', title, { objective: title, agent, session, ...data }, AGENT)
  const { resolveWorkDomain } = await import('../src/server/lib/workdomain.ts')
  return resolveWorkDomain({ id, workspaceId: workspace, actor: AGENT }).differences
}

function theRow(differences: Difference[], row: Difference['row'], recordId?: string): Difference {
  const found = differences.find((one) => one.row === row && (recordId === undefined || one.subject.recordId === recordId))
  if (found === undefined) throw new Error(`no ${row} row${recordId === undefined ? '' : ` for ${recordId}`} in ${JSON.stringify(differences)}`)
  return found
}

describe('a scope-diff row says where its modules came from', () => {
  it('1: an extra_semantic row about an accepted guess says llm, not declared', async () => {
    const repositoryId = await aRepository()
    const guessed = await aModuleOver('Test guessed time', repositoryId, 'src/shared/time.ts', 'an accepted guess')
    const differences = await differencesOf('Writes the guessed file', { writes: ['src/shared/time.ts'] })
    const row = theRow(differences, 'extra_semantic', guessed)
    expect(row.provenance).toBe('llm')
    expect(row.authority).toBe('stated')
    expect(row.eachModule).toEqual([{ recordId: guessed, provenance: 'llm' }])
  })

  it('2: an extra_semantic row about a row the person stated says declared', async () => {
    const repositoryId = await aRepository()
    const stated = await aModuleOver('Test stated detail', repositoryId, 'src/shared/detail.ts', 'stated')
    const differences = await differencesOf('Writes the stated file', { writes: ['src/shared/detail.ts'] })
    const row = theRow(differences, 'extra_semantic', stated)
    expect(row.provenance).toBe('declared')
    expect(row.eachModule).toEqual([{ recordId: stated, provenance: 'declared' }])
  })

  it('3: a file shared by a stated module and an accepted guess gives no one provenance, and says each', async () => {
    const repositoryId = await aRepository()
    const stated = await aModuleOver('Test stated time', repositoryId, 'src/shared/time.ts', 'stated')
    const guessed = await aModuleOver('Test guessed time', repositoryId, 'src/shared/time.ts', 'an accepted guess')
    const differences = await differencesOf('Writes the shared file', { writes: ['src/shared/time.ts'] })

    const shared = theRow(differences, 'shared_file')
    expect(shared.provenance).toBeUndefined()
    expect(shared.eachModule).toEqual(
      expect.arrayContaining([
        { recordId: stated, provenance: 'declared' },
        { recordId: guessed, provenance: 'llm' },
      ]),
    )
    expect(shared.eachModule).toHaveLength(2)
    // AND EACH extra_semantic ROW IS ABOUT ITS OWN MODULE ONLY.
    expect(theRow(differences, 'extra_semantic', guessed).eachModule).toEqual([{ recordId: guessed, provenance: 'llm' }])
    expect(theRow(differences, 'extra_semantic', stated).eachModule).toEqual([{ recordId: stated, provenance: 'declared' }])
  })

  it('4: a no_known_path row about an accepted guess says llm', async () => {
    const repositoryId = await aRepository()
    await aModuleOver('Test stated detail', repositoryId, 'src/shared/detail.ts', 'stated')
    const guessed = await aModuleOver('Test guessed web', repositoryId, 'src/web/App.tsx', 'an accepted guess')
    const differences = await differencesOf('Relies on the guessed page', { writes: ['src/shared/detail.ts'], dependsOn: ['src/web/App.tsx'] })
    const row = theRow(differences, 'no_known_path')
    expect(row.provenance).toBe('llm')
    expect(row.eachModule).toEqual([{ recordId: guessed, provenance: 'llm' }])
  })
})
