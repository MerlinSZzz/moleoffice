// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PACKAGE A RUN TOOK INSIDE AND DID NOT HAND BACK IS NAMED BEFORE THE SEAL. The inside doors let a run's agent take a
 * package, restate it, get the parent's answer and hand every point back with words. Nothing reminded a run that took
 * one and was about to seal. The reminder before the seal now names each such package as one certain item, with the
 * door that hands it back, and never stops a seal. The item is checked here from facts alone, against the gate's list,
 * and through a test office where an agent really takes and hands a package back.
 */
import { aMadeUpModuleForPackage, injectedPackageFixture } from './module-package-fixture.ts'
import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as rules from '../src/server/lib/before-the-seal-rules.ts'
import type { TheFactsBeforeTheSeal } from '../src/server/lib/before-the-seal-rules.ts'
import { THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'
import { apiApp, freshDb, theOfficesKeyHeader, type TestDb, governsTheWholeProject } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

const madeUp = (what: string): string => `${what}-${randomBytes(4).toString('hex')}`

const factsWith = (over: Partial<TheFactsBeforeTheSeal>): TheFactsBeforeTheSeal => ({
  runTitle: madeUp('A round that took a package'),
  testRuns: [],
  git: { commits: [], existedAtTheForkBase: () => false },
  reports: [
    {
      id: madeUp('report'),
      title: madeUp('What the round did'),
      data: { chaptersRead: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], blocks: [{ type: 'prose', text: 'The test-audit table is left for the merge queue.' }] },
    },
  ],
  sameTitleElsewhere: {},
  mustRead: [1, 9],
  checkAlso: [],
  ...over,
})

/** The keys of the items about packages, read with the key builder the finder uses. */
const thePackageItemsIn = (items: { key: string }[]): { key: string }[] => {
  const kind = rules.theKeyOfAPackageToHandBack('a task').split(':')[0]!
  return items.filter((one) => one.key.split(':')[0] === kind)
}

describe('a package held at the seal, from facts alone', () => {
  it('1: one package taken inside and not handed back is named as one certain item about a record, with its door', () => {
    const held = { id: madeUp('task'), title: madeUp('A package taken inside'), points: 3, aligned: false }
    const { items } = rules.whatAnInspectorWouldMostLikelyRefuse(factsWith({ packagesHeld: [held] }))
    const named = items.filter((one) => one.key === rules.theKeyOfAPackageToHandBack(held.id))
    expect(named, JSON.stringify(items)).toHaveLength(1)
    expect(named[0]).toMatchObject({ about: 'record', mechanical: true })
    expect(named[0]!.says).toBe(rules.whatTheHeldPackageSays(held))
    expect(named[0]!.says).toContain(held.id)
    expect(named[0]!.says).toContain(held.title)
    expect(named[0]!.says).toContain(String(held.points))
    expect(named[0]!.says).toContain(rules.theHandBackDoorOfAPackage(held.id))
    expect(named[0]!.says).toContain(rules.theRestatementDoorOfAPackage(held.id))
  })

  it('2: a run holding no package is named no package item', () => {
    const without = rules.whatAnInspectorWouldMostLikelyRefuse(factsWith({}))
    const holdingNone = rules.whatAnInspectorWouldMostLikelyRefuse(factsWith({ packagesHeld: [] }))
    expect(holdingNone.items).toEqual(without.items)
    expect(thePackageItemsIn(holdingNone.items)).toEqual([])
  })

  it('3: packages that could not be read name no package item and are said in notChecked', () => {
    const reason = madeUp('the office could not read the packages')
    const without = rules.whatAnInspectorWouldMostLikelyRefuse(factsWith({}))
    const unread = rules.whatAnInspectorWouldMostLikelyRefuse(factsWith({ packagesHeld: { couldNotRead: reason } }))
    expect(thePackageItemsIn(unread.items)).toEqual([])
    expect(unread.items).toEqual(without.items)
    expect(unread.notChecked.some((one) => one.includes(reason))).toBe(true)
  })

  it('4: the one item never stops a seal, on a branch or on records and files', () => {
    const held = { id: madeUp('task'), title: madeUp('A package taken inside'), points: 2, aligned: true }
    const item = rules.whatAnInspectorWouldMostLikelyRefuse(factsWith({ packagesHeld: [held] })).items.find(
      (one) => one.key === rules.theKeyOfAPackageToHandBack(held.id),
    )
    expect(item, 'the finder named no item for the package this run holds').toBeDefined()
    expect(rules.theItemsNoSealPasses([item!], { branch: true })).toEqual([])
    expect(rules.theItemsNoSealPasses([item!], { branch: false })).toEqual([])
  })
})

let t: TestDb
let app: FastifyInstance
let workspace = ''
let factsOf: typeof import('../src/server/lib/before-the-seal.ts')['theFactsBeforeTheSealOf']

const human = (): Record<string, string> => ({
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': workspace,
})
const anAgent = (id: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
  'x-mole-office-workspace': workspace,
})

async function file(kind: string, title: string, data: Record<string, unknown> = {}, headers = human()): Promise<string> {
  const r = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind, title, data: kind === 'decision' ? {
    ...governsTheWholeProject(), replaces: [], ...data } : data } })
  expect(r.statusCode, r.body).toBe(201)
  return r.json().record.id as string
}

async function register(handle: string): Promise<string> {
  const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: human(), payload: { handle, name: handle } })
  expect(r.statusCode, r.body).toBe(201)
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
}

async function point(title: string): Promise<string> {
  return file('backlog_item', title, { line: '13s', number: title, placedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }, why: 'Needed', doneWhen: 'Done', state: 'todo' })
}

const packageWords = { forTheOutside: 'Do the work and return its result.', acceptance: 'The work is done.' }

async function post(id: string, door: string, payload: Record<string, unknown>, headers = human()) {
  return app.inject({ method: 'POST', url: `/api/delegation/${id}/${door}`, headers, payload })
}

async function make(task: string, parent: object, ids: string[]) {
  return post(task, 'package', { ...packageWords, parent, pointIds: ids, moduleIds: [await aMadeUpModuleForPackage(injectedPackageFixture(app, workspace))] })
}

/** The package items the reminder names for a run read from the test office. */
function thePackageItemsFor(run: string): { key: string; says: string }[] {
  const record = t.api.getRecord(run)
  if (record === null) throw new Error('the test office lost the run it just filed')
  return thePackageItemsIn(rules.whatAnInspectorWouldMostLikelyRefuse(factsOf(record)).items) as { key: string; says: string }[]
}

beforeAll(async () => {
  t = await freshDb()
  factsOf = (await import('../src/server/lib/before-the-seal.ts')).theFactsBeforeTheSealOf
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

beforeEach(async () => {
  workspace = madeUp('inside-package')
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: workspace, title: 'A made-up project' } })
  expect(made.statusCode, made.body).toBe(201)
})

describe('a package held at the seal, through a test office', () => {
  it('5: names the package this run took, not another agent\'s, and stops naming it after the hand-back', async () => {
    const takerId = await register(madeUp('agent'))
    const parentId = await register(madeUp('agent'))
    const anotherId = await register(madeUp('agent'))
    const decision = await file('decision', madeUp('A made-up decision'))
    const thePoint = await point(madeUp('one'))
    const parent = await file('task', madeUp('A made-up parent'), {}, anAgent(parentId))
    expect((await make(parent, { kind: 'decision', id: decision }, [thePoint])).statusCode).toBe(201)

    const taskTitle = madeUp('A made-up package')
    const task = await file('task', taskTitle)
    expect((await make(task, { kind: 'task', id: parent }, [thePoint])).statusCode).toBe(201)
    const another = await file('task', madeUp('A package another agent took'))
    expect((await make(another, { kind: 'task', id: parent }, [thePoint])).statusCode).toBe(201)

    // The office files the run, so it has a key: the hand-back door takes a hand-back only from the run that did the work.
    const filed = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': THE_MESSAGE_WORKER_ID, 'x-mole-office-workspace': workspace, ...theOfficesKeyHeader() },
      payload: { kind: 'session', title: madeUp('A made-up run'), data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: takerId } },
    })
    expect(filed.statusCode, filed.body).toBe(201)
    const run = String(filed.json().record.id)
    const theRunsKey = { 'x-mole-office-session': run, 'x-mole-office-key': String(filed.json().runKey?.key ?? '') }

    expect((await post(task, 'take-inside', {}, anAgent(takerId))).statusCode).toBe(201)
    expect((await post(task, 'align', { restated: 'I will do it', plan: 'Build it' }, anAgent(takerId))).statusCode).toBe(201)
    expect((await post(task, 'align-answer', { answer: 'aligned', words: 'yes' })).statusCode).toBe(201)
    expect((await post(another, 'take-inside', {}, anAgent(anotherId))).statusCode).toBe(201)

    expect(thePackageItemsFor(run).map((one) => one.key)).toEqual([rules.theKeyOfAPackageToHandBack(task)])
    expect(thePackageItemsFor(run)[0]!.says).toBe(rules.whatTheHeldPackageSays({ id: task, title: taskTitle, points: 1, aligned: true }))
    expect(thePackageItemsFor(run)[0]!.says).not.toContain(rules.theRestatementDoorOfAPackage(task))

    const handed = await post(task, 'hand-back', { points: [{ pointId: thePoint, outcome: 'part', words: 'Still needs review' }] }, { ...anAgent(takerId), ...theRunsKey })
    expect(handed.statusCode, handed.body).toBe(201)
    expect(thePackageItemsFor(run)).toEqual([])
  })
})
