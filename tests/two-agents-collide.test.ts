// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HYPOTHESIS, THE RESOLUTION, THE CRITICISM, AND WHERE TWO AGENTS COLLIDE.
 *
 * ---------------------------------------------------------------------------------------
 * THE ORDERING IS THE EVIDENCE, AND IT IS ASSERTED AS AN ORDERING
 * ---------------------------------------------------------------------------------------
 *
 * The rule is that an agent states what it believes BEFORE Mole Office tells it what it
 * knows. That is not a convention here: the revision holding the hypothesis PRECEDES the one holding
 * the resolution, and neither overwrote the other, and this file asserts both by reading the ledger.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING IS LOCKED, AND BOTH DIRECTIONS ARE DRIVEN
 * ---------------------------------------------------------------------------------------
 *
 * Two agents accept overlapping domains. BOTH WRITES SUCCEED and both are told. A test suite that
 * only proved the refusals would pass with a lock in place, so the second accept succeeding is
 * asserted as loudly as any refusal here.
 *
 * ---------------------------------------------------------------------------------------
 * AND WHAT THE MACHINE CANNOT ANSWER IS SAID, NOT GUESSED
 * ---------------------------------------------------------------------------------------
 *
 * `dependents` answers `known: false` with `imports_unresolved`, because imports are stored exactly
 * as they are written and nothing resolves them to paths. The diff row that needs it is drawn as
 * *Mole Office cannot check this yet* WITH THE REASON, and never as *no dependencies missing*. That
 * difference — nothing is there against nobody has looked — is the whole reason this read is worth
 * having rather than a comfort.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildTheFirstOfficeInAHook, AGENT, expectPanelError, freshDb, type TestDb } from './helpers.ts'
import { DRAWN_RANKS, OVERLAP_CLASSES } from '../src/shared/workdomain.ts'
import type { Actor } from '../src/server/lib/records.ts'

// The first office of this process is built in a hook, so each case below keeps its 5 s for what it tests.
buildTheFirstOfficeInAHook()

let t: TestDb
/** Each case works in a project of its own, so every overlap count is only its own domains. */
let WORKSPACE = 'default'
let caseNumber = 0
type WorkspacesLib = typeof import('../src/server/lib/workspaces.ts')
let workspaces: WorkspacesLib

beforeAll(async () => {
  t = await freshDb()
  workspaces = await import('../src/server/lib/workspaces.ts')
}, 60_000)
afterAll(() => {
  t.close()
})
beforeEach(() => {
  caseNumber += 1
  WORKSPACE = `collide-case-${String(caseNumber)}`
  workspaces.createWorkspace({ id: WORKSPACE, title: `Collide case ${String(caseNumber)}` })
})

function person(): Actor {
  return { type: 'human', id: t.api.HUMAN.id, stated: true }
}

function anAgent(handle: string): string {
  return t.api.createRecord({
    kind: 'agent',
    title: `Agent ${handle}`,
    data: { handle, state: 'active' },
    workspaceId: WORKSPACE,
    actor: person(),
  }).id
}

function aSession(title: string): string {
  return t.api.createRecord({
    kind: 'session',
    title,
    data: { doing: title },
    workspaceId: WORKSPACE,
    actor: person(),
  }).id
}

function aDomain(title: string, data: Record<string, unknown>): string {
  return t.api.createRecord({
    kind: 'work_domain',
    title,
    data: { objective: title, agent: anAgent(title.toLowerCase().replace(/[^a-z0-9]+/g, '-')), session: aSession(title), ...data },
    workspaceId: WORKSPACE,
    actor: AGENT,
  }).id
}

/** The same three real files, written into `root`. */
function threeFiles(root: string): void {
  mkdirSync(join(root, 'src', 'shared'), { recursive: true })
  mkdirSync(join(root, 'src', 'web'), { recursive: true })
  writeFileSync(join(root, 'src/shared/time.ts'), 'export const now = 1\n', 'utf8')
  writeFileSync(join(root, 'src/shared/detail.ts'), 'export const detail = 2\n', 'utf8')
  writeFileSync(join(root, 'src/web/App.tsx'), 'export const App = 3\n', 'utf8')
}

/** A throwaway checkout with a few real files, and an index built over it. */
async function anIndexedCheckout(where: string): Promise<void> {
  const root = join(t.file, '..', where)
  threeFiles(root)
  const { rebuildIndex } = await import('../src/server/lib/sourceindex.ts')
  rebuildIndex({ workspaceId: WORKSPACE, root })
}

/**
 * A registered repository's own scan. An entry in a registered repository is resolved against that
 * repository's stored scan, never against the workspace scan, which records no repository (decision
 * 0KSoGUNDF9ml).
 */
async function scanned(repositoryId: string): Promise<void> {
  const { rebuildRepository } = await import('../src/server/lib/implementation.ts')
  rebuildRepository({ workspaceId: WORKSPACE, repositoryId, actor: person() })
}

describe('the hypothesis comes first, and the ordering is what makes it evidence', () => {
  it('holds the hypothesis in an earlier revision than the resolution, and neither overwrote the other', async () => {
    await anIndexedCheckout('ordering')
    const id = aDomain('Wrist camera', { writes: ['src/shared/time.ts'] })
    const { resolveWorkDomain } = await import('../src/server/lib/workdomain.ts')
    resolveWorkDomain({ id, workspaceId: WORKSPACE, actor: AGENT })

    const revisions = t.client.sqlite
      .prepare('SELECT seq, data FROM revisions WHERE record_id = ? ORDER BY seq')
      .all(id) as { seq: number; data: string }[]
    expect(revisions.length).toBeGreaterThanOrEqual(2)

    const first = JSON.parse(revisions[0]?.data ?? '{}') as Record<string, unknown>
    const last = JSON.parse(revisions[revisions.length - 1]?.data ?? '{}') as Record<string, unknown>
    // THE ORDERING. The earlier revision holds what the agent believed and NO resolution.
    expect(first['writes']).toEqual(['src/shared/time.ts'])
    expect(first['resolved']).toBeUndefined()
    // The later one holds the resolution AND still holds what the agent believed, unchanged.
    expect(last['resolved']).toBeDefined()
    expect(last['writes']).toEqual(['src/shared/time.ts'])
  })

  it('refuses an accept before anything has been resolved, and says which call comes first', async () => {
    const id = aDomain('Nothing resolved', { writes: ['src/shared/time.ts'] })
    const { acceptWorkDomain } = await import('../src/server/lib/workdomain.ts')
    const error = expectPanelError(
      t,
      () =>
        acceptWorkDomain({
          id,
          workspaceId: WORKSPACE,
          actor: AGENT,
          responses: [],
          accepted: { writes: ['src/shared/time.ts'] },
        }),
      409,
    )
    expect(error.message).toContain('/resolve')
  })
})

describe('the resolution says what it could not do, and never reports a clean result instead', () => {
  it('answers `no_file_index` for every path when the project has no index', async () => {
    const id = aDomain('Robotics', { writes: ['perception/calibration/wrist.py'] })
    const { resolveWorkDomain } = await import('../src/server/lib/workdomain.ts')
    const out = resolveWorkDomain({ id, workspaceId: WORKSPACE, actor: AGENT })
    expect(out.resolution.writes?.[0]?.shape).toBe('unresolved')
    expect(out.resolution.writes?.[0]?.note).toBe('no_file_index')
    // `checked: false` AND NOT AN EMPTY LIST. The resolver did not finish, and an empty list would
    // read as "it checked and all is fine" — which is the failure this shape exists to stop.
    expect(out.resolution.couldNotDo.checked).toBe(false)
    expect(out.resolution.couldNotDo.because).toBe('no_file_index')
    expect(out.resolution.couldNotDo.items).toBeUndefined()
  })

  it('draws the row that needs the import graph as a could-not-say WITH the reason', async () => {
    await anIndexedCheckout('imports')
    const id = aDomain('Needs imports', { writes: ['src/shared/time.ts'] })
    const { resolveWorkDomain } = await import('../src/server/lib/workdomain.ts')
    const out = resolveWorkDomain({ id, workspaceId: WORKSPACE, actor: AGENT })
    const row = out.differences.find((d) => d.row === 'dependency_missing')
    expect(row).toBeDefined()
    // NOT AN EMPTY LIST AND NOT SILENCE. The row exists, it says it could not check, and it names
    // which limit stopped it.
    expect(row?.notKnown).toBe('imports_unresolved')
    expect(row?.says).toContain('cannot check this yet')
    expect(row?.says).toContain('@shared/time.ts')
  })

  it('resolves a real path to the index, and an unknown one to `not_indexed`', async () => {
    await anIndexedCheckout('two-paths')
    const id = aDomain('Two paths', { writes: ['src/shared/time.ts', 'src/shared/nothing-here.ts'] })
    const { resolveWorkDomain } = await import('../src/server/lib/workdomain.ts')
    const out = resolveWorkDomain({ id, workspaceId: WORKSPACE, actor: AGENT })
    expect(out.resolution.writes?.[0]?.shape).toBe('file')
    expect(out.resolution.writes?.[1]?.shape).toBe('unindexed')
    expect(out.resolution.writes?.[1]?.note).toBe('not_indexed')
    // AND THE AGENT'S OWN STRING IS UNTOUCHED IN BOTH.
    expect(out.resolution.writes?.map((e) => e.asWritten)).toEqual([
      'src/shared/time.ts',
      'src/shared/nothing-here.ts',
    ])
  })

  it('names the module whose stated implementation row covers a written file', async () => {
    await anIndexedCheckout('implementation-map')
    const root = join(t.file, '..', 'implementation-map')
    const moduleId = t.api.createRecord({
      kind: 'module',
      title: 'Shared time',
      data: { context: 'Shared time utilities', state: 'active' },
      workspaceId: WORKSPACE,
      actor: person(),
    }).id
    const { registerRepository } = await import('../src/server/lib/repositories.ts')
    const repositoryId = registerRepository({
      workspaceId: WORKSPACE,
      name: 'implementation-map',
      root,
      actor: person(),
    }).id
    await scanned(repositoryId)
    const { declareRelationship } = await import('../src/server/lib/implementation.ts')
    declareRelationship({
      workspaceId: WORKSPACE,
      recordId: moduleId,
      repositoryId,
      pattern: 'src/shared/time.ts',
      actor: person(),
    })

    const id = aDomain('Mapped implementation', { repository: repositoryId, writes: ['src/shared/time.ts'] })
    const { resolveWorkDomain } = await import('../src/server/lib/workdomain.ts')
    const out = resolveWorkDomain({ id, workspaceId: WORKSPACE, actor: AGENT })

    expect(out.resolution.writes?.[0]?.modules).toEqual([moduleId])
  })
})

/**
 * WHICH MODULE SERVES A PATH IS READ FROM THE IMPLEMENTATION MAP, THROUGH ITS OWN READER.
 *
 * A row's pattern is relative to the repository it names. So a path is matched only against rows of
 * its own repository, and a domain that names none is read in the project's one repository. With
 * several and nothing to choose between them, no module is named: a pick would be a guess.
 */
describe('a work domain reads which module serves a path from the implementation map', () => {
  /** A registered repository over a folder of its own holding the three files, scanned, so two can exist side by side. */
  async function aRepository(name: string): Promise<string> {
    const root = join(t.file, '..', `repository-${name}`)
    threeFiles(root)
    const { registerRepository } = await import('../src/server/lib/repositories.ts')
    const id = registerRepository({ workspaceId: WORKSPACE, name, root, actor: person() }).id
    await scanned(id)
    return id
  }

  /** A module, and one row stating that it implements `pattern` in `repositoryId`. */
  async function aModuleOver(title: string, repositoryId: string, pattern: string, proposing = false) {
    const moduleId = t.api.createRecord({
      kind: 'module',
      title,
      data: { context: title, state: 'active' },
      workspaceId: WORKSPACE,
      actor: person(),
    }).id
    const { declareRelationship } = await import('../src/server/lib/implementation.ts')
    const { row } = declareRelationship({
      workspaceId: WORKSPACE,
      recordId: moduleId,
      repositoryId,
      pattern,
      proposing,
      actor: proposing ? AGENT : person(),
    })
    return { moduleId, rowId: row.id }
  }

  it('reads a domain that names no repository in the project’s one repository', async () => {
    await anIndexedCheckout('one-repository')
    const repositoryId = await aRepository('only')
    const { moduleId } = await aModuleOver('Shared time', repositoryId, 'src/shared/time.ts')

    const id = aDomain('No repository named', { writes: ['src/shared/time.ts'] })
    const { resolveWorkDomain } = await import('../src/server/lib/workdomain.ts')
    const out = resolveWorkDomain({ id, workspaceId: WORKSPACE, actor: AGENT })

    expect(out.resolution.writes?.[0]?.modules).toEqual([moduleId])
  })

  it('names no module when the project holds two repositories and the domain names neither', async () => {
    await anIndexedCheckout('two-repositories')
    const first = await aRepository('first')
    const second = await aRepository('second')
    const one = await aModuleOver('First time', first, 'src/shared/time.ts')
    await aModuleOver('Second time', second, 'src/shared/time.ts')

    const { resolveWorkDomain } = await import('../src/server/lib/workdomain.ts')
    const unnamed = aDomain('Neither repository', { writes: ['src/shared/time.ts'] })
    // Both repositories have a scan of their own, so the entry is not resolved in either, and the
    // resolver says it did not pick one.
    const entry = resolveWorkDomain({ id: unnamed, workspaceId: WORKSPACE, actor: AGENT }).resolution.writes?.[0]
    expect(entry?.modules).toBeUndefined()
    expect(entry?.note).toBe('ambiguous_repository')

    // A domain that names one of them is read in that one only.
    const named = aDomain('The first repository', { repository: first, writes: ['src/shared/time.ts'] })
    expect(resolveWorkDomain({ id: named, workspaceId: WORKSPACE, actor: AGENT }).resolution.writes?.[0]?.modules).toEqual([
      one.moduleId,
    ])
  })

  it('counts a guess only once a person accepts it, and reports the row’s own provenance', async () => {
    await anIndexedCheckout('a-guess')
    const repositoryId = await aRepository('guessed')
    const { moduleId, rowId } = await aModuleOver('Guessed time', repositoryId, 'src/shared/time.ts', true)
    const { ClaimsImplementation } = await import('../src/server/lib/workdomain.ts')

    expect(new ClaimsImplementation(WORKSPACE).serves(repositoryId, 'src/shared/time.ts')).toEqual([])

    const { acceptGuess } = await import('../src/server/lib/implementation.ts')
    acceptGuess(rowId, WORKSPACE, person())
    expect(new ClaimsImplementation(WORKSPACE).serves(repositoryId, 'src/shared/time.ts')).toEqual([
      { recordId: moduleId, provenance: 'llm', authority: 'stated' },
    ])
  })
})

describe('accept refuses an unanswered difference, and never refuses on another agent’s row', () => {
  it('refuses while a difference of this domain’s own resolution has no answer', async () => {
    await anIndexedCheckout('gate')
    const id = aDomain('Unanswered', { writes: ['src/shared/nothing-here.ts'] })
    const { acceptWorkDomain, resolveWorkDomain } = await import('../src/server/lib/workdomain.ts')
    resolveWorkDomain({ id, workspaceId: WORKSPACE, actor: AGENT })
    const error = expectPanelError(
      t,
      () =>
        acceptWorkDomain({
          id,
          workspaceId: WORKSPACE,
          actor: AGENT,
          responses: [],
          accepted: { writes: ['src/shared/nothing-here.ts'] },
        }),
      400,
    )
    expect(error.message).toContain('no answer')
    expect(error.message).toContain('mapping_unsure')
    // AND NOTHING WAS WRITTEN.
    expect((t.api.getRecord(id)?.data as Record<string, unknown>)['accepted']).toBeUndefined()
  })

  it('accepts once every row is answered, one line for a whole row', async () => {
    await anIndexedCheckout('accept')
    const id = aDomain('Answered', { writes: ['src/shared/time.ts', 'src/shared/nothing-here.ts'] })
    const { acceptWorkDomain, resolveWorkDomain } = await import('../src/server/lib/workdomain.ts')
    const resolved = resolveWorkDomain({ id, workspaceId: WORKSPACE, actor: AGENT })
    const rows = [...new Set(resolved.differences.map((d) => d.row))]
    const out = acceptWorkDomain({
      id,
      workspaceId: WORKSPACE,
      actor: AGENT,
      responses: rows.map((row) => ({ row, outcome: 'accept' as const })),
      accepted: { writes: ['src/shared/time.ts'] },
    })
    expect(out.accepted.writes).toEqual(['src/shared/time.ts'])
    // THE ACCEPTED ENTRIES ARE RESOLVED ONCE AND FROZEN. Every later overlap compares these.
    expect(out.accepted.entries?.[0]?.path).toBe('src/shared/time.ts')
    // AND IT NAMES THE RESOLUTION IT ANSWERED.
    expect(out.accepted.fromResolution).toBe(resolved.resolution.at)
  })
})

describe('nothing is locked: two agents accept overlapping domains and both are told', () => {
  it('lets the SECOND accept succeed, and reports the overlap to both sides', async () => {
    await anIndexedCheckout('collide')
    const { acceptWorkDomain, overlapsFor, resolveWorkDomain } = await import('../src/server/lib/workdomain.ts')

    const perception = aDomain('Perception', { writes: ['src/shared/time.ts'] })
    const handover = aDomain('Handover', { dependsOn: ['src/shared/time.ts'], writes: ['src/web/App.tsx'] })

    for (const id of [perception, handover]) {
      const resolved = resolveWorkDomain({ id, workspaceId: WORKSPACE, actor: AGENT })
      const rows = [...new Set(resolved.differences.map((d) => d.row))]
      acceptWorkDomain({
        id,
        workspaceId: WORKSPACE,
        actor: AGENT,
        responses: rows.map((row) => ({ row, outcome: 'accept' as const })),
        accepted:
          id === perception
            ? { writes: ['src/shared/time.ts'] }
            : { writes: ['src/web/App.tsx'], dependsOn: ['src/shared/time.ts'] },
      })
    }

    // BOTH WRITES SUCCEEDED. That is the assertion a suite proving only refusals would not make.
    expect((t.api.getRecord(perception)?.data as Record<string, unknown>)['accepted']).toBeDefined()
    expect((t.api.getRecord(handover)?.data as Record<string, unknown>)['accepted']).toBeDefined()

    const read = overlapsFor(WORKSPACE)
    const finding = read.overlaps.find((o) => o.overlapClass === 'write_dependency')
    expect(finding, 'the two domains overlap on src/shared/time.ts').toBeDefined()
    expect(finding?.rank).toBe(OVERLAP_CLASSES.write_dependency.rank)
    expect(finding?.subject).toBe('src/shared/time.ts')
    // EACH SIDE GETS ITS OWN SENTENCE, and each names the other. One sentence for both would be a
    // report that does not say who has to do anything about it.
    //
    // ASKED BY DOMAIN, NOT BY SLOT, AND THAT IS THE WHOLE POINT OF THESE FOUR LINES. `forA` is the
    // sentence for whichever domain came back first, and which one that is is not a product fact:
    // `openDomainsIn` orders by `updated_at DESC` and Mole Office's clock has second resolution, so
    // when both domains are written inside one tick they are level and the pair arrives in one
    // order, and when a busy machine straddles a second boundary it arrives in the other. This
    // file read `forA` as the writer's sentence and went red one full run in five — "expected 'The
    // other session is changing "src/shared/time.ts", which you said you rely on.' to contain
    // 'relies on'" — while passing 14 of 14 alone: problem GDMCA1IaO1r_. Freezing the clock over
    // the two writes would only have made the order rest on how SQLite breaks a tie, which is not
    // promised either. What the product promises is that EACH DOMAIN is told its own side, so that
    // is what is read here, and it is asserted with the whole clause rather than two words.
    const perceptionIsA = finding?.a.id === perception
    expect(perceptionIsA || finding?.b.id === perception, 'the finding names the perception domain').toBe(true)
    const forPerception = perceptionIsA ? finding?.forA : finding?.forB
    const forHandover = perceptionIsA ? finding?.forB : finding?.forA
    expect(forPerception).not.toBe(forHandover)
    // Perception WRITES the file. Handover RELIES ON it. Two sentences, each naming what the other
    // session is doing about the file, and neither is the other's.
    expect(forPerception).toBe('You are changing "src/shared/time.ts", which the other session says it relies on.')
    expect(forHandover).toBe('The other session is changing "src/shared/time.ts", which you said you rely on.')
  })

  it('classes two agents writing one file as the worst rank there is', async () => {
    await anIndexedCheckout('both-write')
    const { overlapsFor } = await import('../src/server/lib/workdomain.ts')
    aDomain('One', { writes: ['src/shared/time.ts'] })
    aDomain('Two', { writes: ['src/shared/time.ts'] })
    const read = overlapsFor(WORKSPACE)
    const finding = read.overlaps[0]
    expect(finding?.overlapClass).toBe('write_write')
    expect(finding?.rank).toBe(4)
    // AND AN UNACCEPTED DOMAIN STILL TAKES PART, marked as the weaker claim it is. A file two agents
    // are both going to write is the same collision whether or not either has accepted yet.
    expect(finding?.a.basis).toBe('stated')
    expect(finding?.b.basis).toBe('stated')
  })

  it('says it could not tell rather than saying no, when neither path can be placed', async () => {
    // NO INDEX AT ALL — the owner's robotics project today. `unknown` is carried out and drawn; a
    // pair reported as "no overlap" when the truth is "nobody could look" is the failure this read
    // exists to prevent.
    const { overlapsFor } = await import('../src/server/lib/workdomain.ts')
    aDomain('Robotics one', { writes: ['perception/calibration/wrist.py'] })
    aDomain('Robotics two', { writes: ['perception/calibration/wrist.py'] })
    const read = overlapsFor(WORKSPACE)
    expect(read.counts.unknownPairs).toBe(1)
    expect(read.overlaps[0]?.unknown).toBe(true)
    expect(read.overlaps[0]?.forA).toContain('could not tell')
  })

  it('classes two domains about the same module as the presence signal, and only when no path fired', async () => {
    const { overlapsFor } = await import('../src/server/lib/workdomain.ts')
    const module = t.api.createRecord({
      kind: 'module',
      title: 'Wrist camera',
      data: { context: 'the wrist camera', state: 'active' },
      workspaceId: WORKSPACE,
      actor: person(),
    }).id
    const one = aDomain('Semantic one', {})
    const two = aDomain('Semantic two', {})
    for (const from of [one, two]) t.api.createLink({ fromId: from, toId: module, type: 'about', actor: person() })
    const read = overlapsFor(WORKSPACE)
    const finding = read.overlaps.find((o) => o.overlapClass === 'semantic_only')
    expect(finding?.rank).toBe(1)
    expect(finding?.subject).toBe(module)
  })

  it('refuses an acknowledgement of an overlap nothing reports, and takes one that is', async () => {
    await anIndexedCheckout('ack')
    const { acknowledgeOverlap, overlapsFor } = await import('../src/server/lib/workdomain.ts')
    const one = aDomain('Ack one', { writes: ['src/shared/time.ts'] })
    aDomain('Ack two', { writes: ['src/shared/time.ts'] })
    const key = overlapsFor(WORKSPACE).overlaps[0]?.key ?? ''
    expect(key).not.toBe('')

    const bad = expectPanelError(
      t,
      () => acknowledgeOverlap({ id: one, workspaceId: WORKSPACE, actor: AGENT, key: 'made|up|key', stance: 'continuing' }),
      400,
    )
    expect(bad.message).toContain('statement about nothing')

    const out = acknowledgeOverlap({
      id: one,
      workspaceId: WORKSPACE,
      actor: AGENT,
      key,
      stance: 'waiting',
      note: 'I will not touch the signature until the other session answers.',
    })
    expect(out.acknowledged.stance).toBe('waiting')
    // AND IT LOCKED NOTHING. The other domain is untouched and still open.
    expect(out.note).toContain('Nothing was locked')
  })

  it('never reports a domain against itself, and drops one that has been closed', async () => {
    await anIndexedCheckout('closed')
    const { overlapsFor } = await import('../src/server/lib/workdomain.ts')
    const one = aDomain('Alive', { writes: ['src/shared/time.ts'] })
    const two = aDomain('About to close', { writes: ['src/shared/time.ts'] })
    expect(overlapsFor(WORKSPACE).overlaps).toHaveLength(1)
    t.api.patchRecord(two, { dataPatch: { closedAt: '2026-08-26' } }, AGENT)
    expect(overlapsFor(WORKSPACE).overlaps).toHaveLength(0)
    // AND A SOFT-DELETED DOMAIN GOES TOO, which is a separate condition from being closed: a
    // deleted domain keeps `closedAt` absent, so a rule written over `closedAt` alone would go on
    // reporting its collisions to live agents for ever.
    const three = aDomain('Deleted', { writes: ['src/shared/time.ts'] })
    expect(overlapsFor(WORKSPACE).overlaps).toHaveLength(1)
    t.api.deleteRecord(three, person())
    expect(overlapsFor(WORKSPACE).overlaps).toHaveLength(0)
    expect(one).toBeTruthy()
  })
})

describe('an overlap is computed at read and is stored nowhere', () => {
  /** Every table in this database and how many rows it holds right now. */
  function tableCounts(): Map<string, number> {
    const counts = new Map<string, number>()
    const names = t.client.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((raw) => (raw as { name: string }).name)
    for (const name of names) {
      const row = t.client.sqlite.prepare(`SELECT count(*) as n FROM "${name}"`).get() as { n: number }
      counts.set(name, row.n)
    }
    return counts
  }

  function movedBetween(before: Map<string, number>, after: Map<string, number>): string[] {
    const moved: string[] = []
    for (const [name, n] of after) if (before.get(name) !== n) moved.push(name)
    for (const name of before.keys()) if (!after.has(name)) moved.push(name)
    return moved.sort()
  }

  it('changes exactly one table when read over its route, and that table is the request log', async () => {
    // THE SET IS NAMED RATHER THAN EXCLUDED. An exclusion list goes quiet the day a new table
    // appears; a named set turns red.
    //
    // THE SET WAS EMPTY UNTIL 26 AUGUST 2026 AND IS `{api_calls}` NOW. This line said `[]`, with a
    // paragraph explaining that the plan's `{api_calls}` described a state the tree had never held
    // because nothing wrote the request log. The recorder landed in the same commit as this edit,
    // so the line is what the plan always said it should be, and the reason for changing it is that
    // one call now costs one row in one table.
    //
    // THE SET IS NAMED RATHER THAN EXCLUDED, which is why this is one edit and not a permanent
    // blind spot: a second new table, or a second row per call, still turns it red.
    await anIndexedCheckout('at-read')
    aDomain('Read one', { writes: ['src/shared/time.ts'] })
    aDomain('Read two', { writes: ['src/shared/time.ts'] })

    const { apiApp } = await import('./helpers.ts')
    const { app } = await apiApp()
    try {
      // One call first, so anything a route does once happens before the snapshot rather than
      // inside it.
      await app.inject({ method: 'GET', url: '/api/work-domains/overlaps', headers: { 'x-mole-office-workspace': WORKSPACE } })
      const before = tableCounts()
      const callsBefore = before.get('api_calls') ?? 0
      for (let i = 0; i < 3; i += 1) {
        const reply = await app.inject({ method: 'GET', url: '/api/work-domains/overlaps', headers: { 'x-mole-office-workspace': WORKSPACE } })
        expect(reply.statusCode).toBe(200)
        const body = reply.json() as { overlaps: { overlapClass: string }[] }
        expect(body.overlaps[0]?.overlapClass).toBe('write_write')
      }
      const after = tableCounts()
      expect(movedBetween(before, after)).toEqual(['api_calls'])
      // AND IT IS EXACTLY ONE ROW PER CALL, asserted separately so that this test says WHICH of the
      // two lines moved rather than only that something did.
      expect((after.get('api_calls') ?? 0) - callsBefore).toBe(3)
    } finally {
      await app.close()
    }
  })
})

/**
 * THE CLASS TABLE IS READ AND NEVER RE-DECIDED — a test deleted on 13 November 2026.
 *
 * Both tests moved there, whole. Three shipped source files cite that filename and it did not
 * exist, so a reader who went looking for the rule found nothing and would have concluded it was
 * unheld. The rule has not changed; only the file it lives in, so that its own citations are true.
 */


describe('accepted paths and unavailable overlap checks', () => {
  it('keeps a changed file inside a path accepted by hand', async () => {
    await anIndexedCheckout('hand-accepted')
    const { indexFor, driftFor, resolveWorkDomain } = await import('../src/server/lib/workdomain.ts')
    const { rebuildIndex } = await import('../src/server/lib/sourceindex.ts')
    const id = aDomain('Accepted by hand', { writes: ['src/shared'] })
    const index = indexFor(WORKSPACE)!
    const { resolution } = resolveWorkDomain({ id, workspaceId: WORKSPACE, actor: AGENT })
    t.api.patchRecord(id, { dataPatch: {
      accepted: { at: resolution.at, writes: ['src/shared'], index: resolution.index },
    } }, person())
    writeFileSync(join(index.root, 'src/shared/time.ts'), 'export const now = 42\n', 'utf8')
    rebuildIndex({ workspaceId: WORKSPACE, root: index.root })
    const drift = driftFor(id, WORKSPACE)
    expect(drift.rows).toHaveLength(1)
    expect(drift.rows[0]).toMatchObject({ path: 'src/shared/time.ts', bucket: 'expected' })
    expect(drift.counts.outside).toBe(0)
    expect(drift.renewedCriticism.owed).toBe(false)
  })

  it('names interface impact and the dependents reason with and without a file index', async () => {
    const { apiApp } = await import('./helpers.ts')
    const { ClaimsImplementation } = await import('../src/server/lib/workdomain.ts')
    const reason = new ClaimsImplementation(WORKSPACE).dependents().because
    const { app } = await apiApp()
    try {
      for (const indexed of [false, true]) {
        if (indexed) await anIndexedCheckout('uncomputed-impact')
        const reply = await app.inject({ method: 'GET', url: '/api/work-domains/overlaps', headers: { 'x-mole-office-workspace': WORKSPACE } })
        expect(reply.statusCode).toBe(200)
        expect(reply.json().couldNotCompute).toContainEqual({ overlapClass: 'interface_impact', because: reason })
        if (!indexed) expect(reply.json().couldNotCompute).toContainEqual(expect.objectContaining({ because: 'no_file_index' }))
      }
    } finally {
      await app.close()
    }
  })
})
