// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PACKAGE SHOWS ITS OWN STATE AT EACH ACT, on the tasks page and on its plan card.
 *
 * Everything here is made up: the agents, the run, the package, its points, its plan and every word in them. No model,
 * provider or real office is used. `freshDb` makes a throwaway database. There is no merge queue and no landing.
 *
 * A maker makes a package of two points and links a block of a plan to its task. A worker takes it, restates it, gets a
 * yes, restates it again after the yes, gets a second yes, and hands both points back. The maker accepts one point and
 * returns the other with words, the worker hands back again, and the maker accepts the last point.
 *
 * WHAT IS PROVED, after every act: the row the two package doors serve, joined the way the pages join them, has the
 * package state the act gives, and names the linked block among its plan blocks. The package is made inside, so only
 * `GET /api/delegation/inside` lists it. The tasks page draws that state's word on the task's row. The plan drawing
 * built from the same reply gives the block that package state, and the block's card and its row in the narrow outline
 * draw the package state's word and not the block's own state word.
 * A restatement after a yes puts the package back to taken until it is answered.
 *
 * THE TASK'S OWN PAGE draws the package panel for this inside package too, and the panel draws the same state word as
 * the tasks page. Round 166's pictures found the tasks page saying "returned to the taker" while the task's own page
 * drew no panel and no state at all, because the panel was drawn only for a package stated for the outside.
 * Mutation: make `taskHasAPackage` answer only for an outside package again (`packageOnTask(data) !== null`), or drop
 * the panel's state line, and this goes red at the first act. The record page draws the panel by `taskHasAPackage`.
 */

import { aMadeUpModuleForPackage, injectedPackageFixture } from './module-package-fixture.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { PACKAGE_STATES, type DelegationRow, type PackageState } from '../src/shared/delegation.ts'
import { THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { packageStateWord } from '../src/shared/words.ts'
import type { DelegationReply } from '../src/web/api.ts'
import { apiApp, freshDb, theOfficesKeyHeader, type TestDb, governsTheWholeProject } from './helpers.ts'

type TasksToTakePageModule = typeof import('../src/web/pages/TasksToTakePage.tsx')
type TaskPackagePanelModule = typeof import('../src/web/components/TaskPackagePanel.tsx')
type CardModule = typeof import('../src/web/components/graph/card.ts')
type Model = typeof import('../src/web/components/graph/model.ts')
type Face = typeof import('../src/web/components/graph/CardFace.tsx')
type OutlineModule = typeof import('../src/web/components/graph/Outline.tsx')

const WORKSPACE = 'package-state-walk'
const MAKER = 'walk-maker'
const WORKER = 'walk-worker'
const WORDS = { forTheOutside: 'Do the made-up work and hand it back.', acceptance: 'The made-up work is done.' }
const PERSON = { type: 'human', id: THE_PERSON } as const

let t: TestDb
let app: FastifyInstance
let page: TasksToTakePageModule
let panel: TaskPackagePanelModule
let card: CardModule
let model: Model
let face: Face
let outline: OutlineModule
const idOf: Record<string, string> = {}

const asThePerson = (): Record<string, string> => ({ 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE })
const asAgent = (handle: string): Record<string, string> => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-workspace': WORKSPACE })

async function file(kind: string, title: string, data: Record<string, unknown> = {}, headers = asThePerson()): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind, title, data: kind === 'decision' ? { ...governsTheWholeProject(), replaces: [], ...data } : data } })
  expect(reply.statusCode, reply.body).toBe(201)
  return String(reply.json().record.id)
}

async function register(handle: string): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asThePerson(), payload: { handle, name: handle } })
  expect(reply.statusCode, reply.body).toBe(201)
  idOf[handle] = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
}

/** A running run of the worker, filed by the office so it has a key, and the headers of that run. */
async function aRunOfTheWorker(): Promise<Record<string, string>> {
  const reply = await app.inject({
    method: 'POST', url: '/api/records',
    headers: { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': THE_MESSAGE_WORKER_ID, 'x-mole-office-workspace': WORKSPACE, ...theOfficesKeyHeader() },
    payload: { kind: 'session', title: 'A made-up run of the worker', data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: idOf[WORKER] } },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return { ...asAgent(WORKER), 'x-mole-office-session': String(reply.json().record.id), 'x-mole-office-key': String(reply.json().runKey?.key ?? '') }
}

async function step(task: string, door: string, payload: Record<string, unknown>, headers: Record<string, string>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: `/api/delegation/${task}/${door}`, headers, payload })
  expect(reply.statusCode, `${door}: ${reply.body}`).toBe(201)
}

/** What the two package doors answer, joined by the pages' own function, as the pages would be handed it. */
async function theDelegationReply(): Promise<DelegationReply> {
  const [outside, inside] = await Promise.all(['/api/delegation', '/api/delegation/inside'].map(async (url) => {
    const reply = await app.inject({ method: 'GET', url, headers: asThePerson() })
    expect(reply.statusCode, reply.body).toBe(200)
    return reply.json() as DelegationReply
  }))
  return panel.bothPackageReadings(outside!, inside!)
}

/** The text of every state chip in a piece of markup, in the order they are drawn. */
const chipWords = (markup: string): string[] => [...markup.matchAll(/class="px-chip-word">([^<]*)</g)].map((found) => found[1]!)

/** The word in the state column of the tasks page's row for one task, drawn alone. */
function theTasksPageWord(reply: DelegationReply, row: DelegationRow): string | undefined {
  const markup = renderToStaticMarkup(h(page.TheTasksToTake, { reply: { ...reply, tasks: [row] } }))
  return /class="px-row-sev"><span class="px-tag"[^>]*>([^<]*)<\/span>/.exec(markup)?.[1]
}

/** Whether the task's own page draws the package panel for the stored task, and the state word that panel draws. */
async function theTaskPagePanel(task: string, reply: DelegationReply): Promise<{ drawn: boolean; word: string | undefined }> {
  const read = await app.inject({ method: 'GET', url: `/api/records/${task}`, headers: asThePerson() })
  expect(read.statusCode, read.body).toBe(200)
  const markup = renderToStaticMarkup(h(panel.TaskPackageComputed, { reply, recordId: task }))
  return {
    drawn: panel.taskHasAPackage(read.json().record.data),
    word: /class="tpp-state">[\s\S]*?<span class="px-tag"[^>]*>([^<]*)<\/span>/.exec(markup)?.[1],
  }
}

/** The block's node on the plan drawing built from the records, the links and the delegation rows. */
function theBlockOnThePlan(plan: string, block: string, reply: DelegationReply) {
  const graph = model.buildStructureGraph({
    records: t.api.listRecords({ workspaceId: WORKSPACE }) as never,
    links: model.graphLinks(t.api.allGatedLinks(WORKSPACE)),
    attention: {
      visible: [], remainder: [], total: 0, remainderByGroup: [], remainderNote: null, unclassified: [], noState: [], paused: [],
      machine: [], passedOver: [], counts: { candidates: 0, selected: 0, visible: 0, remainder: 0, passedOver: 0, deleted: 0 },
    } as never,
    scope: { at: 'pipeline', recordId: plan },
    now: Date.now(),
    packages: reply.tasks,
  })
  const node = graph.nodes.find((one) => one.stepId === block)
  if (node === undefined) throw new Error(`the plan drawing has no card for the block ${block}`)
  const planned = card.planCanvas(graph, 'title').cards.get(node.id)
  if (planned === undefined) throw new Error(`the block's card ${node.id} was not planned`)
  const onTheCard = renderToStaticMarkup(
    h(face.CardFace, { node, onOpen: () => {}, flow: 'RIGHT', lit: false, restriction: null, here: [], says: 'title', plan: planned, choice: card.NOTHING_PRESSED, onChoose: () => {}, opens: 'Open this record' }),
  ).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
  const inTheOutline = renderToStaticMarkup(h(outline.OutlineRow, { node, graph }))
  return { node, cardWords: chipWords(onTheCard), outlineWords: chipWords(inTheOutline) }
}

beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', origin: 'http://127.0.0.1:41600', hostname: '127.0.0.1', reload: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  page = await import('../src/web/pages/TasksToTakePage.tsx')
  panel = await import('../src/web/components/TaskPackagePanel.tsx')
  card = await import('../src/web/components/graph/card.ts')
  model = await import('../src/web/components/graph/model.ts')
  face = await import('../src/web/components/graph/CardFace.tsx')
  outline = await import('../src/web/components/graph/Outline.tsx')
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: WORKSPACE, title: 'A made-up project' } })
  expect(made.statusCode, made.body).toBe(201)
  for (const handle of [MAKER, WORKER]) await register(handle)
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('a package walked through every act', () => {
  it('shows the state each act gives on the tasks page and the plan card', async () => {
    const decision = await file('decision', 'A made-up decision above the package')
    const points: string[] = []
    for (const says of ['A made-up first point', 'A made-up second point']) {
      points.push(await file('backlog_item', says, { line: 'a-made-up-line', number: says, placedBy: { kind: 'person', id: THE_PERSON }, why: 'Made up for this test.', doneWhen: 'Made up.', state: 'todo' }))
    }
    const parent = await file('task', 'A made-up parent task', {}, asAgent(MAKER))
    await step(parent, 'package', { ...WORDS, moduleIds: [await aMadeUpModuleForPackage(injectedPackageFixture(app, WORKSPACE))], parent: { kind: 'decision', id: decision }, pointIds: points }, asAgent(MAKER))
    const task = await file('task', 'A made-up package of two points', {}, asAgent(MAKER))
    const plan = await file('pipeline', 'A made-up plan', { blockIds: [] })
    const block = t.blocks.addBlock(plan, { name: 'A made-up block linked to the package', state: 'doing' }, PERSON).block.id
    t.api.createLink({ fromId: block, toId: task, type: 'relates_to', actor: PERSON })
    const run = await aRunOfTheWorker()

    const seen: string[] = []
    async function shows(after: string, state: PackageState): Promise<void> {
      const reply = await theDelegationReply()
      const row = reply.tasks.find((one) => one.recordId === task)
      expect(row, after).toBeDefined()
      expect(row!.state, after).toBe(state)
      expect(row!.planBlocks, after).toEqual([block])
      const word = packageStateWord(state).text
      expect(theTasksPageWord(reply, row!), after).toBe(word)
      const onItsPage = await theTaskPagePanel(task, reply)
      expect(onItsPage.drawn, `${after}: the task's own page draws no package panel`).toBe(true)
      expect(onItsPage.word, after).toBe(word)
      const onThePlan = theBlockOnThePlan(plan, block, reply)
      expect(onThePlan.node.packageState, after).toBe(state)
      expect(onThePlan.cardWords, after).toEqual([word])
      expect(onThePlan.outlineWords, after).toEqual([word])
      seen.push(state)
    }

    await step(task, 'package', { ...WORDS, moduleIds: [await aMadeUpModuleForPackage(injectedPackageFixture(app, WORKSPACE))], parent: { kind: 'task', id: parent }, pointIds: points }, asAgent(MAKER))
    await shows('make', 'to_do')
    await step(task, 'take-inside', {}, asAgent(WORKER))
    await shows('take', 'taken')
    await step(task, 'align', { restated: 'I will do the two made-up points.', plan: 'Do them.' }, asAgent(WORKER))
    await shows('restate', 'taken')
    await step(task, 'align-answer', { answer: 'aligned', words: 'Yes.' }, asAgent(MAKER))
    await shows('align answer', 'aligned')
    await step(task, 'align', { restated: 'I will do them another way.', plan: 'Do them the other way.' }, asAgent(WORKER))
    await shows('restate after the yes', 'taken')
    await step(task, 'align-answer', { answer: 'aligned', words: 'Yes, that way too.' }, asAgent(MAKER))
    await shows('second align answer', 'aligned')
    await step(task, 'hand-back', { points: points.map((pointId) => ({ pointId, outcome: 'done', words: 'Built.' })) }, run)
    await shows('hand back', 'handed_back')
    await step(task, 'accept', { points: [{ pointId: points[0]!, answer: 'accepted' }, { pointId: points[1]!, answer: 'returned', words: 'The second point draws nothing.' }] }, asAgent(MAKER))
    await shows('return', 'returned')
    await step(task, 'hand-back', { points: points.map((pointId, at) => ({ pointId, outcome: 'done', words: at === 1 ? 'It draws now.' : 'Built.' })) }, run)
    await shows('hand back again', 'handed_back')
    await step(task, 'accept', { points: [{ pointId: points[1]!, answer: 'accepted' }] }, asAgent(MAKER))
    await shows('accept', 'done')

    // EVERY ONE OF THE SIX STATES WAS SHOWN on the way.
    expect(new Set(seen)).toEqual(new Set(PACKAGE_STATES))
  }, 60_000)
})
