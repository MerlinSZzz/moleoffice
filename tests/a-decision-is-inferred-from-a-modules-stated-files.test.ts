// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DECISION IS INFERRED TO BE ABOUT A MODULE FROM ITS FILES AND THE MODULE'S STATED CLAIMS.
 *
 * Worked out when it is read and stored nowhere: no link, no field. What is checked, each case in a project of its own,
 * through decisionsGoverning (src/server/lib/governs.ts), decisionsAbout (src/server/lib/decisionsabout.ts) and the
 * governs check:
 *   1. a decision whose files part names a file a module's stated claim holds is listed for the module as inferred,
 *      with the module and the claim, and nothing is written for it;
 *   2. two modules whose claims hold one file both list the decision, each inferred;
 *   3. an entry wider than every claim (src/** or src) is not inferred, and a guessed claim counts for nothing;
 *   4. a folder entry and a pattern entry inside a claim are inferred;
 *   5. an old path entry in governs is read as a file and inferred;
 *   6. a decision that names the module, or is linked to it, keeps that reading and is not called inferred;
 *   7. the governs check lists the files of a decision that no module states;
 *   8. with no source index, or with two repositories, the reading says it could not infer and lists nothing as
 *      inferred; a module that states no claim needs no index and says nothing.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { AGENT, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'

let t: TestDb
let idx: typeof import('../src/server/lib/sourceindex.ts')
let map: typeof import('../src/server/lib/implementation.ts')
let repos: typeof import('../src/server/lib/repositories.ts')
let workspaces: typeof import('../src/server/lib/workspaces.ts')
let governs: typeof import('../src/server/lib/governs.ts')
let about: typeof import('../src/server/lib/decisionsabout.ts')

const OWNER = { type: 'human' as const, id: THE_TEST_OFFICES_OWNER.id, stated: true }
const madeDirs: string[] = []
let WS = ''
let caseNumber = 0

/** The made-up checkout every case that builds an index scans. */
const FILES: Record<string, string> = {
  'src/feeder/a.ts': 'export const a = 1\n',
  'src/feeder/b.ts': 'export const b = 1\n',
  'src/feeder/inner/c.ts': 'export const c = 1\n',
  'src/other/d.ts': 'export const d = 1\n',
}

beforeAll(async () => {
  t = await freshDb()
  // Imported after freshDb, so each opens the test office's database and not another.
  idx = await import('../src/server/lib/sourceindex.ts')
  map = await import('../src/server/lib/implementation.ts')
  repos = await import('../src/server/lib/repositories.ts')
  workspaces = await import('../src/server/lib/workspaces.ts')
  governs = await import('../src/server/lib/governs.ts')
  about = await import('../src/server/lib/decisionsabout.ts')
}, 60_000)

beforeEach(() => {
  caseNumber += 1
  WS = `inferred-case-${String(caseNumber)}`
  workspaces.createWorkspace({ id: WS, title: `Inferred case ${String(caseNumber)}` })
})

afterEach(() => {
  for (const dir of madeDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

afterAll(() => {
  t.close()
})

/** The project's source index, built from FILES in a throwaway folder. */
function theIndexBuilt(): void {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-inferred-')))
  madeDirs.push(dir)
  for (const [rel, content] of Object.entries(FILES)) {
    const abs = join(dir, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }
  idx.rebuildIndex({ workspaceId: WS, root: dir })
}

/** The project's one repository, registered on first use. No root: nothing here scans it. */
function theRepository(): string {
  const held = repos.listRepositories(WS)[0]
  return held?.id ?? repos.registerRepository({ workspaceId: WS, name: 'fixture', root: null, actor: AGENT }).id
}

/** A module and one map row for each pattern: stated, or a guess when `proposing`. */
function aModuleClaiming(title: string, patterns: string[], proposing = false): string {
  const id = t.api.createRecord({
    workspaceId: WS,
    kind: 'module',
    title,
    data: { context: 'A made-up module for a test office.', parts: [] },
    actor: OWNER,
  }).id
  const repositoryId = theRepository()
  for (const pattern of patterns) {
    map.declareRelationship({ workspaceId: WS, recordId: id, repositoryId, pattern, actor: AGENT, ...(proposing ? { proposing: true } : {}) })
  }
  return id
}

function aDecision(title: string, data: Record<string, unknown>): string {
  return t.api.createRecord({
    workspaceId: WS,
    kind: 'decision',
    title,
    data: { option_taken: title, because: 'A made-up reason for a test office.', replaces: [], ...data },
    actor: OWNER,
  }).id
}

interface AWay {
  place: { record?: string; path?: string }
  reaches: string
  module?: { id: string; title: string }
  claim?: string
}

/** How each entry of one decision reaches the module, by the record question. */
function theWays(moduleId: string, decisionId: string): AWay[] | undefined {
  const answer = governs.decisionsGoverning(WS, { record: moduleId })
  return answer.decisions.find((one) => one.id === decisionId)?.how as AWay[] | undefined
}

interface ARow {
  id: string
  how: string
  inferredFrom?: { file: string; claim: string }[]
}

function theRowAbout(moduleId: string, decisionId: string): ARow | undefined {
  return (about.decisionsAbout({ workspaceId: WS, recordId: moduleId }).decisions as ARow[]).find((one) => one.id === decisionId)
}

const READ_AS_INFERRED = 'inferred from its files'

describe('a decision inferred from its files', () => {
  it('1: is listed for the module whose stated claim holds its file, with the claim, and nothing is written', () => {
    theIndexBuilt()
    const feeder = aModuleClaiming('Inferred: the feeder', ['src/feeder'])
    const decision = aDecision('Inferred: the feeder reads one file at a time', { governsFiles: ['src/feeder/a.ts'] })
    const before = JSON.stringify(t.api.getRecord(decision)?.data)

    expect(theWays(feeder, decision)).toEqual([
      { place: { path: 'src/feeder/a.ts' }, reaches: 'inferred', module: { id: feeder, title: 'Inferred: the feeder' }, claim: 'src/feeder' },
    ])
    const row = theRowAbout(feeder, decision)
    expect(row?.how).toBe(READ_AS_INFERRED)
    expect(row?.inferredFrom).toEqual([{ file: 'src/feeder/a.ts', claim: 'src/feeder' }])
    expect(about.decisionsAbout({ workspaceId: WS, recordId: feeder }).couldNotRead).toEqual([])

    const links = t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM links WHERE from_id = ? OR to_id = ?').get(decision, decision) as { n: number }
    expect(links.n, 'no link is written for an inferred reading').toBe(0)
    expect(JSON.stringify(t.api.getRecord(decision)?.data), 'and nothing is written into the decision').toBe(before)
  })

  it('2: is listed by both modules when two claim the file, each inferred with its own claim', () => {
    theIndexBuilt()
    const feeder = aModuleClaiming('Inferred: the feeder', ['src/feeder'])
    const tray = aModuleClaiming('Inferred: the tray', ['src/feeder/a.ts'])
    const decision = aDecision('Inferred: one file, two owners', { governsFiles: ['src/feeder/a.ts'] })

    expect(theWays(feeder, decision)?.map((one) => [one.reaches, one.claim])).toEqual([['inferred', 'src/feeder']])
    expect(theWays(tray, decision)?.map((one) => [one.reaches, one.claim])).toEqual([['inferred', 'src/feeder/a.ts']])
    expect(theRowAbout(tray, decision)?.how).toBe(READ_AS_INFERRED)
  })

  it('3: is not inferred from an entry wider than every claim, nor from a guessed claim', () => {
    theIndexBuilt()
    const feeder = aModuleClaiming('Inferred: the feeder', ['src/feeder'])
    const guessed = aModuleClaiming('Inferred: a module somebody guessed at', ['src/other'], true)
    const wide = aDecision('Inferred: a rule for all the code', { governsFiles: ['src/**', 'src'] })
    const onTheGuess = aDecision('Inferred: a rule for the other code', { governsFiles: ['src/other/d.ts'] })

    expect(theWays(feeder, wide), 'src/** and src are wider than the claim src/feeder').toBeUndefined()
    expect(theRowAbout(feeder, wide)).toBeUndefined()
    expect(theWays(guessed, onTheGuess), 'a guessed claim counts for nothing').toBeUndefined()
  })

  it('4: is inferred from a folder entry and a pattern entry that lie inside a claim', () => {
    theIndexBuilt()
    const feeder = aModuleClaiming('Inferred: the feeder', ['src/feeder'])
    const folder = aDecision('Inferred: the inner folder', { governsFiles: ['src/feeder/inner'] })
    const pattern = aDecision('Inferred: every feeder file', { governsFiles: ['src/feeder/*.ts'] })

    expect(theWays(feeder, folder)?.map((one) => [one.reaches, one.place.path, one.claim])).toEqual([['inferred', 'src/feeder/inner', 'src/feeder']])
    expect(theWays(feeder, pattern)?.map((one) => [one.reaches, one.place.path, one.claim])).toEqual([['inferred', 'src/feeder/*.ts', 'src/feeder']])
  })

  it('5: is inferred from an old path entry in governs, read as a file', () => {
    theIndexBuilt()
    const feeder = aModuleClaiming('Inferred: the feeder', ['src/feeder'])
    const old = aDecision('Inferred: an old decision with a path in governs', { governsFiles: ['src/other/d.ts'] })
    // AN OLD ROW, written below the door as a store from before the files part holds one.
    const held = t.api.getRecord(old)!.data
    writeDataBypassingTheGate(t, old, { ...held, governsFiles: undefined, governs: [{ path: 'src/feeder/b.ts' }] })

    expect(theWays(feeder, old)?.map((one) => [one.reaches, one.place.path, one.claim])).toEqual([['inferred', 'src/feeder/b.ts', 'src/feeder']])
  })

  it('6: keeps the stronger reading for a decision that names the module or is linked to it', () => {
    theIndexBuilt()
    const feeder = aModuleClaiming('Inferred: the feeder', ['src/feeder'])
    const named = aDecision('Inferred: named and claimed', { governs: [{ record: feeder }], governsFiles: ['src/feeder/a.ts'] })
    const linked = aDecision('Inferred: linked and claimed', { governsFiles: ['src/feeder/b.ts'] })
    t.api.createLink({ fromId: linked, toId: feeder, type: 'about', actor: OWNER })

    expect(theWays(feeder, named)?.map((one) => one.reaches)).toEqual(['names-it', 'inferred'])
    expect(theRowAbout(feeder, named)?.how).toBe('governs it')
    expect(theRowAbout(feeder, linked)?.how).toBe('linked to it')
  })

  it('7: the governs check lists the files of a decision that no module states', () => {
    theIndexBuilt()
    aModuleClaiming('Inferred: the feeder', ['src/feeder'])
    const held = aDecision('Inferred: every file has a module', { governsFiles: ['src/feeder/a.ts'] })
    const loose = aDecision('Inferred: one file has none', { governsFiles: ['src/other/d.ts', 'src/feeder/b.ts'] })

    const check = governs.theGovernsCheck(WS) as unknown as { filesNoModuleStates: { decision: string; files: string[] }[] }
    expect(check.filesNoModuleStates.find((one) => one.decision === loose)?.files).toEqual(['src/other/d.ts'])
    expect(check.filesNoModuleStates.map((one) => one.decision)).not.toContain(held)
  })

  it('8: says it could not infer when no index is built, or the project has two repositories', () => {
    const feeder = aModuleClaiming('Inferred: the feeder', ['src/feeder'])
    const decision = aDecision('Inferred: the feeder reads one file at a time', { governsFiles: ['src/feeder/a.ts'] })
    const unbuilt = governs.decisionsGoverning(WS, { record: feeder })
    expect(unbuilt.decisions.map((one) => one.id)).not.toContain(decision)
    expect(unbuilt.couldNotRead, 'no index, so nothing could be inferred, and it says so').toHaveLength(1)
    expect(about.decisionsAbout({ workspaceId: WS, recordId: feeder }).couldNotRead).toHaveLength(1)
    expect((governs.theGovernsCheck(WS) as unknown as { filesNoModuleStates: unknown[] }).filesNoModuleStates).toEqual([])

    const quiet = aModuleClaiming('Inferred: a module that states no claim', [])
    expect(governs.decisionsGoverning(WS, { record: quiet }).couldNotRead, 'a module with no claim needs no index').toEqual([])

    theIndexBuilt()
    repos.registerRepository({ workspaceId: WS, name: 'a second checkout', root: null, actor: AGENT })
    const problem = idx.claimsOf(t.api.getRecord(feeder)!, []).problem
    expect(problem).not.toBeNull()
    const two = governs.decisionsGoverning(WS, { record: feeder })
    expect(two.decisions.map((one) => one.id)).not.toContain(decision)
    expect(two.couldNotRead.some((line) => line.includes(String(problem)))).toBe(true)
  })
})
