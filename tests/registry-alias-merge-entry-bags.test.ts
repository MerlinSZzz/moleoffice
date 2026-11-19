// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MERGE ENTRY'S BAGS ARE READ BY THEIR WRITERS' OWN TYPES (item 30c, part 2b-5b). kinds.ts declares 32 fields of a
 * merge entry as open bags, and a run's receipt of its landing as one more. The merge queue writes a fixed shape into
 * each. The identity reader reads each bag by an adapter bound to the writer's type, finds every agent in it, and
 * blocks a key the writer's type does not have. A take-back and a repair hold no agent, and the queue's own strict
 * readers decide them.
 *
 * Every agent, alias and value here is made up, in a throwaway office.
 *
 * MUTATIONS, after a control run: leave the tested bag unread, and the first case goes red. Take the fix-round ask's
 * agent out of the register, and the first case goes red. Drop the entries a bus passed over from the adapter of the
 * entry an entry was tested with, and the first case goes red. Leave a run's receipt unread, and the second case goes
 * red. Let the take-back reader pass everything, and the third case goes red. Leave a reserved repair's agent in the
 * class or in the wait unread, or take a holder out of the list of fields that are not an agent, and the fourth case goes
 * red.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HouseRulesDecision, MergeClassDecision, RepairFact, WideRedDecision } from '../src/shared/merge-class.ts'
import type { Bounce, FilesChangeset, GitChangeset, IntegrationReceipt, MovedFirst, Resolution, Resolving, WaitsForAFixRound } from '../src/shared/merge-queue.ts'
import type { BusCause, WholeSuiteRed } from '../src/shared/whole-suite-red.ts'
import type { SuiteWorkers } from '../src/server/lib/merge-queue.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { fileSyntheticAlias, inventedRegistry, rawHistory, syntheticAlias } from './registry-alias-fixture.ts'

let t: TestDb
beforeEach(async () => { t = await freshDb(); inventedRegistry(t); await fileSyntheticAlias(t) })
afterEach(() => t?.close())

const reader = () => import('../src/server/lib/registry-aliases/historical-reader.ts')
const alias = syntheticAlias.aliasId
const canonical = syntheticAlias.canonicalId
const other = 'CanonicalB2'
const agentRef = (id: string) => ({ kind: 'agent' as const, id })
const at = '2026-01-01 00:00:00'
const time = { stamp: at, instant: '2026-01-01T00:00:00.000+00:00', offset: '+00:00', timeZone: 'Europe/London' }
const tree = 'synthetic-tree'
const found = (path: string, stored: string, site: string, parse = 'participant') =>
  ({ path, as: 'value', stored, canonical: stored === alias ? canonical : stored, site, parse })
const read = async (kind: string, data: unknown) => (await reader()).readRecordIdentities(t.client.sqlite, kind, data)
const blocksOf = (reading: { blocks: { path: string; reason: string }[] }) => reading.blocks.map(one => [one.path, one.reason])

const forTheOther = { tree, green: false, build: { passed: true }, redTests: ['tests/synthetic.test.ts'], says: 'Synthetic words' }
const modal = { commit: 'abc123', log: '/srv/synthetic/modal.log', report: '/srv/synthetic/modal.json' }
const wholeSuiteRed = {
  outcome: 'admitted-for-fix-round',
  build: { source: 'original', tip: 'abc123', tree, log: '/srv/synthetic/build.log', exit: 0 },
  affected: { source: 'original', tip: 'abc123', tree, log: '/srv/synthetic/affected.log', selection: 'complete', exit: 0, files: ['tests/synthetic.test.ts'], ran: 3, passed: 3, report: '/srv/synthetic/affected.json' },
  suite: { source: 'original', tip: 'abc123', tree, log: '/srv/synthetic/suite.log', complete: true, exit: 1, ran: 9, passed: 8, redTests: ['tests/synthetic.test.ts'], report: '/srv/synthetic/suite.json' },
} satisfies WholeSuiteRed
const busCause = {
  mainAt: 'def456', suite: { commit: 'abc123', tree },
  order: [{ entry: 'SyntheticEntry1', commit: 'abc123', tree, commits: ['abc123'] }],
  pairDecided: { still: ['tests/synthetic.test.ts'], brokeBy: { 'tests/synthetic.test.ts': 0 }, runsAlone: 1, without: { tip: 'abc123', green: null, brokenAt: { entry: 'SyntheticEntry1', why: 'Synthetic reason' } } },
} satisfies BusCause
const houseRules = {
  mainAt: 'def456', list: { state: 'read' }, files: [{ file: 'tests/synthetic.test.ts', class: 'S', kind: 'synthetic', mark: 'borderline' }], class: 1, reason: 'Synthetic reason', position: 'block',
} satisfies HouseRulesDecision
const classTwo = (starter: string, fixRoundAgent?: string) => ({
  class: 2, mainAt: 'def456', files: [{ file: 'tests/synthetic.test.ts' }], featureFiles: ['tests/synthetic.test.ts'], houseRuleFiles: [], reason: 'Synthetic reason',
  build: true, databasePaths: [],
  roundOpen: { open: true, starter, run: 'SyntheticRun2', ...(fixRoundAgent === undefined ? {} : { fixRound: { agent: fixRoundAgent, as: 'line' as const } }) },
  fewRedFiles: 1, position: 'remind', houseRulesPosition: 'off',
}) satisfies MergeClassDecision
const repair = { problem: 'SyntheticProblem', files: [{ file: 'tests/synthetic.test.ts', passed: true }] } satisfies RepairFact
const receipt = (by: string, tests: IntegrationReceipt['tests']) => ({
  entry: 'SyntheticEntry', mainBefore: 'def456', mainAfter: 'abc123', rebasedTip: 'abc123', sealId: 'SyntheticSeal',
  carriedVerdict: { run: 'SyntheticRun', by: agentRef(by), at, how: 'an inspector', paths: 1, says: 'Synthetic words' },
  reinspected: [{ run: 'SyntheticRun', only: ['src/synthetic.ts'], needsJudgment: [], releasedAt: at }],
  tests, at, time,
}) satisfies IntegrationReceipt
const side = { lines: ['synthetic line'], more: 0 }

describe('the bags of a merge entry', () => {
  it('reads every one by its writer\'s type, and finds each agent in it', async () => {
    const data = {
      run: 'SyntheticRun',
      state: 'testing',
      seal: { id: 'SyntheticSeal', hash: 'synthetic-hash' },
      changeset: { adapter: 'git', root: '/srv/synthetic', repository: 'SyntheticRepository', branch: 'synthetic-branch', commit: 'abc123', base: 'def456' } satisfies GitChangeset,
      submittedBy: agentRef(alias),
      submittedTime: time,
      suiteWorkers: { count: 2, by: agentRef(other) } satisfies SuiteWorkers,
      withdrawn: { because: 'Synthetic reason', by: agentRef(alias), at },
      movedFirst: { by: agentRef(alias), at, because: 'Synthetic reason', turn: 1, underARaise: 'SyntheticRaise' } satisfies MovedFirst,
      superseded: { by: 'SyntheticEntry2', because: 'Synthetic reason', at },
      tool: { session: 'SyntheticToolRun', log: '/srv/synthetic/tool.log', startedAt: at, endedAt: at, reason: 'Synthetic reason' },
      toolWanted: { since: at },
      judged: { 'src/synthetic.ts': 'synthetic-hash' },
      handedOn: { 'src/synthetic.ts': 'synthetic-hash' },
      verdict: { run: 'SyntheticRun', by: agentRef(alias), at, time, how: 'an inspector', message: 'SyntheticMessage' },
      checked: { at, tool: 'synthetic-checker', decided: [{ path: 'src/synthetic.ts', check: 'synthetic', ok: true, detail: 'Synthetic words' }], needsJudgment: [{ path: 'src/other.ts', why: 'Synthetic reason' }] },
      integration: {
        result: 'abc123', mainAt: 'def456', clone: '/srv/synthetic/clone', files: { 'src/synthetic.ts': 'synthetic-hash' }, at,
        reads: { tree, files: 3, folders: 1, record: 'SyntheticRecord' },
        lines: [{ path: 'src/synthetic.ts', held: true, ranges: '1-4', why: 'Synthetic reason' }],
        keptByLine: { files: [{ path: 'src/synthetic.ts', ranges: '1-4' }], says: 'Synthetic words' },
        ownerContent: { reminded: 1, byPattern: { synthetic: 1 }, says: 'Synthetic words', log: '/srv/synthetic/owner.log' },
        placeholderCommits: { position: 'remind', domain: 'synthetic.example', commits: [{ commit: 'abc123', author: 'synthetic@synthetic.example', committer: null }], log: '/srv/synthetic/placeholder.log' },
      },
      reinspection: { run: 'SyntheticRun', only: ['src/synthetic.ts'], needsJudgment: [{ path: 'src/synthetic.ts', why: 'Synthetic reason' }], askedAt: at, says: 'Synthetic words' },
      reinspected: [{ run: 'SyntheticRun', only: ['src/synthetic.ts'], needsJudgment: ['src/synthetic.ts'], releasedAt: at }],
      takeBackOf: { problem: 'SyntheticProblem', entry: 'SyntheticEntry0', commits: ['abc123'], paths: ['src/synthetic.ts'], hours: 2 },
      repairOf: { problem: 'SyntheticProblem', files: ['tests/synthetic.test.ts'] },
      tested: {
        relatedOnly: { files: 3, related: 2, every: 100, leftOutSlow: [{ file: 'tests/slow.test.ts', seconds: 90 }], says: 'Synthetic words' },
        wholeSuiteBecause: [{ case: 2, paths: ['drizzle/0001_synthetic.sql'], says: 'Synthetic words' }],
        green: false, redTests: ['tests/synthetic.test.ts'], log: '/srv/synthetic/suite.log', tip: 'abc123', ran: 9, passed: 8, says: 'Synthetic words',
        officeHealth: { samples: 10, answered: 9, unanswered: 1, medianMs: 120, maxMs: null, over10s: 0, everySeconds: 30, load1Median: 1.5, load1Max: 3, availableMemoryMiBMedian: 4096, availableMemoryMiBLowest: 2048, cpus: 8, memoryMiB: 16384 },
        at, time,
        testedWith: { entry: 'SyntheticEntry1', tree, forTheOther, collision: ['src/synthetic.ts'], bus: [{ entry: 'SyntheticEntry3', forTheOther }], passedForACheck: ['SyntheticEntry4'], passedAlone: ['SyntheticEntry5'] },
        borrowedFrom: { entry: 'SyntheticEntry1', tree },
        loadTimeouts: [{ file: 'tests/slow.test.ts', mainAt: 'def456', here: { entryLog: '/srv/synthetic/entry.log', mainLog: '/srv/synthetic/main.log' }, modal: { entry: modal, main: modal } }],
        plugin: { id: 'synthetic-plugin', manifest: true },
        wholeSuiteRed, busCause, houseRules, mergeClass: classTwo(alias, other), build: { passed: true }, repair,
      },
      attempts: 1,
      stalls: { runs: 2, says: 'Synthetic words', secretary: 'SyntheticMessage2', asked: { by: agentRef(other), at, because: 'Synthetic reason', mainAt: 'def456' } },
      waitingForRoom: { since: at, at, says: 'Synthetic words', message: 'SyntheticMessage3', toldAt: at, toldTime: time },
      waitsForAFixRound: {
        since: at, time, until: at, dueAt: '2026-01-01T00:05:00.000Z', timeZone: 'Europe/London', minutes: 5,
        asks: [{ for: 'line', agent: alias, at, brief: '/srv/synthetic/brief.md', status: 201, said: 'Synthetic words', holder: 'SyntheticRun3', started: { at, run: 'SyntheticRun3' }, ended: { at, says: 'Synthetic words' } }],
        opened: { at, for: 'starter', agent: other, run: 'SyntheticRun3' },
      } satisfies WaitsForAFixRound,
      redOnMain: [{ file: 'tests/synthetic.test.ts', mainAt: 'def456', log: '/srv/synthetic/red.log', problem: 'SyntheticProblem', at }],
      deletes: { paths: ['src/gone.ts'], asked: 'SyntheticMessage4', confirmed: { by: agentRef(alias), at, because: 'Synthetic reason' } },
      pressToLand: { paths: ['src/pressed.ts'], asked: null, pressed: { by: agentRef(other), at, because: 'Synthetic reason' }, leftOut: { mainAt: 'def456', paths: [] } },
      documents: { tree, files: ['README.md'] },
      bounced: {
        reason: 'conflict', at, files: ['src/synthetic.ts'], redTests: [], changedTheirAnswer: [], log: '/srv/synthetic/bounce.log', mainAt: 'def456',
        resolution: 'the hour ran out', cannot: { by: agentRef(alias), said: 'Synthetic words' }, says: 'Synthetic words',
      } satisfies Bounce,
      resolving: {
        files: ['src/synthetic.ts'], log: '/srv/synthetic/resolve.log', mainAt: 'def456', says: 'Synthetic words', since: at, timeZone: 'Europe/London', minutes: 60,
        nobodyStarted: { by: agentRef(other), at, status: 500, said: 'Synthetic words' },
        asked: { agent: alias, brief: '/srv/synthetic/brief.md', message: 'SyntheticMessage5', round: { at, status: 201, said: 'Synthetic words', run: 'SyntheticRun4' } },
        resolvedBefore: { files: ['src/synthetic.ts'], commit: 'abc123', mainAt: 'def456' }, red: { tests: ['tests/synthetic.test.ts'] }, replays: { ref: 'refs/synthetic', commit: 'abc123' },
      } satisfies Resolving,
      resolution: {
        commit: 'abc123', workingDirectory: '/srv/synthetic', mainAt: 'def456', files: [{ path: 'src/synthetic.ts', hash: 'synthetic-hash', mode: '100644' }], by: agentRef(alias), at,
        tests: { commit: 'abc123', exit: 0, counts: { passed: 3, failed: 0 }, log: '/srv/synthetic/tests.log', by: agentRef(other), at },
        refused: { at, says: 'Synthetic words', message: 'SyntheticMessage6', noMessage: 'Synthetic words' },
        checked: {
          at, ref: 'refs/synthetic', morePlaces: 0, fixed: ['src/synthetic.ts'],
          places: [{ path: 'src/synthetic.ts', at: 3, entryCommit: 'abc123', resolvedIn: null, ancestor: side, main: side, entry: side, resolution: side, mainCommits: [{ commit: 'def456', entry: null }], mainBy: 'lines', ambiguous: true }],
        },
      } satisfies Resolution,
      integrated: receipt(alias, { log: '/srv/synthetic/suite.log', ran: 9, passed: 9 }),
      told: { submitter: ['SyntheticMessage7'], secretary: null, says: 'Synthetic words' },
    }
    const copy = structuredClone(data), before = rawHistory(t)
    expect(await read('merge_entry', data)).toEqual({
      found: [
        found('data.submittedBy.id', alias, 'merge_entry.submittedBy'),
        found('data.suiteWorkers.by.id', other, 'SuiteWorkers.by'),
        found('data.withdrawn.by.id', alias, 'MergeWithdrawn.by'),
        found('data.movedFirst.by.id', alias, 'MovedFirst.by'),
        found('data.verdict.by.id', alias, 'MergeVerdict.by'),
        found('data.tested.mergeClass.roundOpen.starter', alias, 'RoundOpen.starter', 'registry-id'),
        found('data.tested.mergeClass.roundOpen.fixRound.agent', other, 'FixRoundFact.agent', 'registry-id'),
        found('data.stalls.asked.by.id', other, 'StallsAsked.by'),
        found('data.waitsForAFixRound.asks[0].agent', alias, 'FixRoundAsk.agent', 'registry-id'),
        found('data.waitsForAFixRound.opened.agent', other, 'FixRoundOpened.agent', 'registry-id'),
        found('data.deletes.confirmed.by.id', alias, 'PressedBy.by'),
        found('data.pressToLand.pressed.by.id', other, 'PressedBy.by'),
        found('data.bounced.cannot.by.id', alias, 'BounceCannot.by'),
        found('data.resolving.nobodyStarted.by.id', other, 'NobodyStarted.by'),
        found('data.resolving.asked.agent', alias, 'AskedToResolve.agent', 'registry-id'),
        found('data.resolution.by.id', alias, 'MergeResolution.by'),
        found('data.resolution.tests.by.id', other, 'DeclaredTestRun.by'),
        found('data.integrated.carriedVerdict.by.id', alias, 'CarriedVerdict.by'),
      ],
      blocks: [],
    })
    expect(data).toEqual(copy)
    expect(rawHistory(t)).toEqual(before)
  })

  it('reads the other forms the writers write, the nulls among them, and a run\'s receipt', async () => {
    const files = {
      adapter: 'files', root: '/srv/synthetic', stagedAt: at, onConflict: 'keep-both',
      operations: [{ op: 'rename', path: 'docs/b.md', from: 'docs/a.md', before: 'h1', after: 'h2', mode: '100644', source: '/srv/synthetic/staged/b.md', record: 'SyntheticRecord' }],
    } satisfies FilesChangeset
    const classThree = {
      class: 3, cause: 6, mainAt: 'def456', files: [{ file: 'drizzle/0001_synthetic.sql' }], featureFiles: [], houseRuleFiles: [], reason: 'Synthetic reason',
      build: true, databasePaths: ['drizzle/0001_synthetic.sql'], roundOpen: { open: false, reason: 'Synthetic reason' },
      fewRedFiles: 2, position: 'block', houseRulesPosition: 'off', fewFeatureRedsPosition: 'remind',
    } satisfies WideRedDecision
    expect(await read('merge_entry', {
      changeset: files,
      tested: {
        green: false, log: '/srv/synthetic/suite.log', at, mergeClass: classThree,
        houseRules: { ...houseRules, list: { state: 'unreadable', reason: 'Synthetic reason' }, class: null, files: [{ file: 'tests/synthetic.test.ts' }] } satisfies HouseRulesDecision,
        testedWith: { entry: 'SyntheticEntry1', tree, passedForACheck: [], passedAlone: [] },
        busCause: { ...busCause, pairDecided: { still: [], without: { tip: 'abc123', green: true, brokenAt: null } } },
      },
      stalls: { runs: 1, says: 'Synthetic words', secretary: null },
      waitingForRoom: { since: at, at, says: 'Synthetic words', message: null, toldAt: null },
      waitsForAFixRound: { since: at, time, until: at, dueAt: at, timeZone: 'Europe/London', minutes: 5, asks: [{ for: 'sheriff', at, said: 'Synthetic words' }] } satisfies WaitsForAFixRound,
      deletes: { paths: ['src/gone.ts'], asked: null },
      bounced: { reason: 'red', at, files: [], says: 'Synthetic words' } satisfies Bounce,
      resolving: { files: [], says: 'Synthetic words', since: at, timeZone: 'Europe/London', asked: { noBrief: 'Synthetic reason', noMessage: 'Synthetic reason' } } satisfies Resolving,
      resolution: { commit: 'abc123', workingDirectory: '/srv/synthetic', mainAt: 'def456', files: [{ path: 'src/gone.ts', hash: null, mode: null }], by: { kind: 'person', id: 'SyntheticPerson' }, at } satisfies Resolution,
      told: { submitter: [], secretary: 'SyntheticMessage8', says: 'Synthetic words' },
    })).toEqual({ found: [], blocks: [] })
    const tests = { log: '/srv/synthetic/suite.log', green: false, plugin: { id: 'synthetic-plugin', manifest: false }, wholeSuiteRed, busCause, houseRules, mergeClass: classTwo(alias), build: { passed: true }, repair }
    expect(await read('session', { integrated: { ...receipt(other, tests), rebasedTip: null } })).toEqual({
      found: [
        found('data.integrated.carriedVerdict.by.id', other, 'CarriedVerdict.by'),
        found('data.integrated.tests.mergeClass.roundOpen.starter', alias, 'RoundOpen.starter', 'registry-id'),
      ],
      blocks: [],
    })
  })

  it('blocks a key no writer writes, a participant of a kind no writer writes, and a take-back or repair the queue\'s reader refuses', async () => {
    const verdict = await read('merge_entry', { verdict: { run: 'SyntheticRun', by: agentRef(alias), at, how: 'an inspector', message: null, agentId: alias } })
    expect(verdict.found).toEqual([found('data.verdict.by.id', alias, 'MergeVerdict.by')])
    expect(blocksOf(verdict)).toEqual([['data.verdict.agentId', 'undeclared-field']])
    const nothing = async (kind: string, data: unknown) => {
      const reading = await read(kind, data)
      expect(reading.found, JSON.stringify(data)).toEqual([])
      return blocksOf(reading)
    }
    expect(await nothing('merge_entry', { submittedBy: { kind: 'robot', id: alias } })).toEqual([['data.submittedBy.kind', 'wrong-type']])
    expect(await nothing('merge_entry', { tested: { green: true, log: 'x', at, testedWith: { entry: 'x', tree, passedForAPair: [] } } })).toEqual([['data.tested.testedWith.passedForAPair', 'undeclared-field']])
    expect(await nothing('merge_entry', { tested: { green: true, log: 'x', at, mergeClass: { ...classTwo(alias), roundOpen: { open: true, run: 'x', fixRound: { as: 'secretary' } } } } }))
      .toEqual([['data.tested.mergeClass.roundOpen.fixRound.as', 'wrong-type']])
    expect(await nothing('merge_entry', { takeBackOf: { problem: 'SyntheticProblem', entry: 'SyntheticEntry0', commits: [], paths: [], hours: 2 } })).toEqual([['data.takeBackOf', 'wrong-type']])
    expect(await nothing('merge_entry', { repairOf: { problem: 'SyntheticProblem', files: ['tests/synthetic.test.ts'], by: agentRef(alias) } })).toEqual([['data.repairOf', 'wrong-type']])
    expect(await nothing('merge_entry', { changeset: { adapter: 'svn', root: '/srv/synthetic' } })).toEqual([['data.changeset.adapter', 'unknown-variant']])
  })

  it('reads a reserved repair\'s agent in the class and in the wait, and not the run the repair is kept on', async () => {
    const reserved = {
      ...classTwo(alias),
      roundOpen: { open: false, starter: alias, reason: 'Synthetic reason', reserved: { agent: other, as: 'sheriff', holder: 'SyntheticRun5' } },
    } satisfies MergeClassDecision
    const waits = {
      since: at, time, until: at, dueAt: at, timeZone: 'Europe/London', minutes: 5,
      asks: [{ for: 'sheriff', agent: other, at, status: 202, said: 'Synthetic words', holder: 'SyntheticRun5' }],
      reserved: { at, for: 'sheriff', agent: alias, holder: 'SyntheticRun5' },
    } satisfies WaitsForAFixRound
    expect(await read('merge_entry', { tested: { green: false, log: '/srv/synthetic/suite.log', at, mergeClass: reserved }, waitsForAFixRound: waits })).toEqual({
      found: [
        found('data.tested.mergeClass.roundOpen.starter', alias, 'RoundOpen.starter', 'registry-id'),
        found('data.tested.mergeClass.roundOpen.reserved.agent', other, 'RoundOpenReserved.agent', 'registry-id'),
        found('data.waitsForAFixRound.asks[0].agent', other, 'FixRoundAsk.agent', 'registry-id'),
        found('data.waitsForAFixRound.reserved.agent', alias, 'FixRoundReserved.agent', 'registry-id'),
      ],
      blocks: [],
    })
    const { NOT_IDENTITY } = await import('../src/server/lib/registry-aliases/identity-positions.ts')
    expect(NOT_IDENTITY.map(one => one.site)).toEqual(expect.arrayContaining(['FixRoundAsk.holder', 'RoundOpenReserved.holder', 'FixRoundReserved.holder']))
  })
})

describe('a change row that goes into a merge entry\'s bag', () => {
  it('is typed through the bag\'s adapter, and blocks where the writer\'s reader or a variant decides', async () => {
    const { readChangeIdentities } = await reader()
    const change = (kind: string, field: string, newValue: string) => readChangeIdentities(t.client.sqlite, { kind }, { field, oldValue: null, newValue })
    expect(change('merge_entry', 'data.resolving.asked.agent', alias)).toEqual({ found: [found('new_value:data.resolving.asked.agent', alias, 'AskedToResolve.agent', 'registry-id')], blocks: [] })
    expect(change('merge_entry', 'data.submittedBy', JSON.stringify(agentRef(alias)))).toEqual({ found: [found('new_value:data.submittedBy.id', alias, 'merge_entry.submittedBy')], blocks: [] })
    expect(change('merge_entry', 'data.waitsForAFixRound.asks', JSON.stringify([{ for: 'line', agent: other, at, said: 'x' }]))).toEqual({
      found: [found('new_value:data.waitsForAFixRound.asks[0].agent', other, 'FixRoundAsk.agent', 'registry-id')], blocks: [],
    })
    expect(change('session', 'data.integrated.carriedVerdict.by', JSON.stringify(agentRef(alias)))).toEqual({ found: [found('new_value:data.integrated.carriedVerdict.by.id', alias, 'CarriedVerdict.by')], blocks: [] })
    expect(change('merge_entry', 'data.tested.testedWith.passedAlone', JSON.stringify(['SyntheticEntry5']))).toEqual({ found: [], blocks: [] })
    expect(blocksOf(change('merge_entry', 'data.takeBackOf.entry', 'SyntheticEntry0'))).toEqual([['field', 'untyped-change']])
    expect(blocksOf(change('merge_entry', 'data.changeset.root', '/srv/synthetic'))).toEqual([['field', 'untyped-change']])
  })
})
