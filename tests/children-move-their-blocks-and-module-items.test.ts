// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { LinkType } from '../src/shared/types.ts'
import { apiApp, freshDb, governsTheWholeProject, theOfficesKeyHeader, type TestDb } from './helpers.ts'
import { aMadeUpModuleForPackage, injectedPackageFixture } from './module-package-fixture.ts'

const project = `p-${randomBytes(4).toString('hex')}`
const supervisor = `a-${randomBytes(4).toString('hex')}`
const worker = `a-${randomBytes(4).toString('hex')}`
const inspector = `a-${randomBytes(4).toString('hex')}`
let person: string
let office: string
let t: TestDb
let app: FastifyInstance
let shared: typeof import('../src/shared/delegation.ts')
const ids: Record<string, string> = {}
const agent = (id: string) => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id, 'x-mole-office-workspace': project })
const human = () => ({ 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': person, 'x-mole-office-workspace': project })
const actor = () => ({ type: 'human' as const, id: person })
const words = { forTheOutside: 'Do the work and bring evidence.', acceptance: 'The work is complete.' }
const post = (task: string, door: string, payload: object, headers = agent(supervisor)) => app.inject({ method: 'POST', url: `/api/delegation/${task}/${door}`, headers, payload })
async function step(task: string, door: string, payload: object, headers = agent(supervisor)) {
  const reply = await post(task, door, payload, headers)
  expect(reply.statusCode, `${door}: ${reply.body}`).toBe(201)
  return reply.json()
}
async function file(kind: string, data: Record<string, unknown> = {}): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers: human(), payload: {
    kind, title: `Fixture ${randomBytes(8).toString('hex')}`,
    data: kind === 'decision' ? { ...governsTheWholeProject(), replaces: [], ...data } : data,
  } })
  expect(reply.statusCode, reply.body).toBe(201)
  return String(reply.json().record.id)
}
function data(id: string): Record<string, any> {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
  return JSON.parse(row.data)
}
async function progress(parent: string) {
  const reply = await app.inject({ method: 'GET', url: `/api/delegation/${parent}/progress`, headers: human() })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json()
}
async function makeWorld(count = 1) {
  const decision = await file('decision')
  const module = await aMadeUpModuleForPackage(injectedPackageFixture(app, project))
  const itemIds = Array.from({ length: count }, (_, i) => `item-${i}`)
  const checklist = await import('../src/server/lib/records.ts')
  checklist.appendAPart(module, { id: 'plan', name: 'Plan' }, actor())
  checklist.appendChecklistItem(module, 'plan', { id: 'planned', text: 'Plan', state: 'todo' }, actor())
  checklist.appendAPart(module, { id: 'work', name: 'Work' }, actor())
  for (const id of itemIds) checklist.appendChecklistItem(module, 'work', { id, text: id, state: 'todo' }, actor())
  const parentPoint = await file('backlog_item', { line: 'work', number: 'parent', placedBy: { kind: 'person', id: person }, why: 'Fixture', doneWhen: 'Fixture', state: 'todo' })
  const parent = await file('task')
  await step(parent, 'package', { ...words, moduleIds: [module], parent: { kind: 'decision', id: decision }, pointIds: [parentPoint] }, human())
  await step(parent, 'take-inside', {})
  const children: { task: string; point: string; module: string; item: string }[] = []
  for (const item of itemIds) {
    const point = await file('backlog_item', { line: 'work', number: item, placedBy: { kind: 'person', id: person }, why: 'Fixture', doneWhen: 'Fixture', state: 'todo' })
    const task = await file('task')
    await step(task, 'package', { ...words, moduleIds: [module], parent: { kind: 'task', id: parent }, pointIds: [point] })
    children.push({ task, point, module, item })
  }
  const pipeline = await file('pipeline', { blockIds: [] })
  const block = t.blocks.addBlock(pipeline, { name: 'Work', state: 'doing' }, actor()).block.id
  return { parent, parentPoint, children, module, block }
}
const workPlan = (point: string, work: object[]) => ({ workers: [{ worker, outcome: 'Work', points: [point], files: ['src'], model: 'test' }], waves: 1, waits: [], work })
const entry = (child: { task: string; module: string; item: string }) => ({ package: child.task, module: child.module, item: child.item })
async function align(world: Awaited<ReturnType<typeof makeWorld>>, work: object[] = world.children.map(entry)) {
  await step(world.parent, 'align', { restated: 'Do the work.', plan: workPlan(world.parentPoint, work) })
  await step(world.parent, 'align-answer', { answer: 'aligned', words: 'Agreed.' }, human())
}
function link(child: string, block: string, type: LinkType = 'blocks') { t.api.createLink({ fromId: child, toId: block, type, actor: actor() }) }
const complete = (point: string, answer: 'completed' | 'reopened' = 'completed') => ({ points: [{ pointId: point, answer, evidence: 'The work is recorded.' }] })
const itemState = (module: string, item: string) => data(module).parts.flatMap((p: any) => p.items).find((one: any) => one.id === item).state

beforeAll(async () => {
  t = await freshDb()
  person = (await import('../src/shared/person.ts')).THE_PERSON
  office = (await import('../src/shared/participants.ts')).THE_MESSAGE_WORKER_ID
  shared = await import('../src/shared/delegation.ts')
  app = (await apiApp()).app
  await app.ready()
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: project, title: 'Fixture' } })
  expect(made.statusCode, made.body).toBe(201)
  for (const handle of [supervisor, worker, inspector]) {
    const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: human(), payload: { handle, name: handle } })
    expect(reply.statusCode, reply.body).toBe(201)
    ids[handle] = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
  }
}, 60_000)
afterAll(async () => { await app?.close(); t?.close() })

it('records self-completion separately and moves the enrolled block and item with their source revisions', async () => {
  const world = await makeWorld(); const child = world.children[0]!
  link(child.task, world.block); await align(world)
  await step(child.task, 'self-complete', complete(child.point))
  expect(data(child.task).state).toBe('done')
  expect(data(child.task).package.selfCompletions).toHaveLength(1)
  expect(data(child.task).package.acceptances).toBeUndefined()
  expect(data(world.block).state).toBe('done')
  expect(itemState(world.module, child.item)).toBe('done')
  const read = await progress(world.parent)
  expect(JSON.stringify(read)).toContain(child.task)
  expect(JSON.stringify(read)).toContain('contentHash')
  const notes = t.client.sqlite.prepare('SELECT note FROM revisions WHERE record_id IN (?, ?) ORDER BY seq DESC').all(world.block, world.module) as { note: string | null }[]
  expect(notes.filter(row => row.note?.includes(child.task)).length).toBeGreaterThanOrEqual(2)
})

it('refuses self-completion by anyone other than the maker who is the latest parent taker, or without enrollment and evidence', async () => {
  const world = await makeWorld(); const child = world.children[0]!
  expect((await post(child.task, 'self-complete', complete(child.point))).statusCode).toBeGreaterThanOrEqual(400)
  await align(world)
  expect((await post(child.task, 'self-complete', complete(child.point), agent(worker))).statusCode).toBe(403)
  expect((await post(child.task, 'self-complete', { points: [{ pointId: child.point, answer: 'completed', evidence: ' ' }] })).statusCode).toBe(400)
  await step(world.parent, 'take-inside', {}, agent(worker))
  expect((await post(child.task, 'self-complete', complete(child.point))).statusCode).toBe(403)
  expect(data(child.task).package.selfCompletions).toBeUndefined()
})

it('requires both children of a shared block and reopens the block and one item', async () => {
  const world = await makeWorld(2); const [first, second] = world.children
  link(first!.task, world.block); link(second!.task, world.block); await align(world)
  await step(first!.task, 'self-complete', complete(first!.point))
  expect(data(world.block).state).toBe('doing')
  await step(second!.task, 'self-complete', complete(second!.point))
  expect(data(world.block).state).toBe('done')
  await step(first!.task, 'self-complete', complete(first!.point, 'reopened'))
  expect(data(world.block).state).toBe('doing')
  expect(itemState(world.module, first!.item)).toBe('doing')
  expect(itemState(world.module, second!.item)).toBe('done')
})

it('leaves a block untouched when another named child cannot be read and reports unknown', async () => {
  const world = await makeWorld(2); const [first, second] = world.children
  link(first!.task, world.block); link(second!.task, world.block); await align(world)
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.package', 'unreadable') WHERE id = ?").run(second!.task)
  await step(first!.task, 'self-complete', complete(first!.point))
  expect(data(world.block).state).toBe('doing')
  const read = JSON.stringify(await progress(world.parent))
  expect(read).toContain('unknown'); expect(read).toContain(second!.task)
})

it('does not move a shared block when another parent plan cannot be read', async () => {
  const first = await makeWorld(); const second = await makeWorld()
  const one = first.children[0]!; const two = second.children[0]!
  link(one.task, first.block); link(two.task, first.block)
  await align(first); await align(second)
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.package.alignments[0].plan', json('{\"broken\":true}')) WHERE id = ?").run(second.parent)
  await step(one.task, 'self-complete', complete(one.point))
  expect(data(first.block).state).toBe('doing')
  const read = JSON.stringify(await progress(first.parent))
  expect(read).toContain('unknown'); expect(read).toContain(two.task); expect(read).toContain('plan')
})

it('records the answer and moves the block when the module item was removed', async () => {
  const world = await makeWorld(); const child = world.children[0]!
  link(child.task, world.block); await align(world)
  const module = data(world.module)
  module.parts = module.parts.map((part: any) => ({ ...part, items: part.items.filter((item: any) => item.id !== child.item) }))
  t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(module), world.module)
  await step(child.task, 'self-complete', complete(child.point))
  expect(data(child.task).state).toBe('done')
  expect(data(world.block).state).toBe('done')
  const read = JSON.stringify(await progress(world.parent))
  expect(read).toContain('unknown'); expect(read).toContain(child.item)
})

it('reads work strictly and refuses bad bindings without writing the alignment', async () => {
  const world = await makeWorld(); const child = world.children[0]!
  const valid = entry(child); const base = workPlan(world.parentPoint, [valid])
  expect(shared.readAStoredPlan(base)).not.toBeNull()
  for (const bad of [{ ...valid, extra: true }, { package: child.task, module: world.module }, { audit: 'audit', scope: 's', evidence: 'e' }]) {
    expect(shared.readAStoredPlan({ ...base, work: [bad] })).toBeNull()
  }
  const otherTask = await file('task'); const notModule = await file('task')
  const audit = { audit: 'audit', scope: 'scope', evidence: 'evidence', inspector }
  const badLists = [[{ ...valid, package: otherTask }], [{ ...valid, module: notModule }], [{ ...valid, item: 'missing' }], [{ ...valid, item: 'made-up-requirement' }], [{ ...valid, item: 'planned' }], [audit, audit], [valid, valid], [{ ...audit, inspector: 'unregistered' }], [{ ...valid, extra: true }]]
  for (const work of badLists) {
    const before = JSON.stringify(data(world.parent))
    const reply = await post(world.parent, 'align', { restated: 'Do the work.', plan: { ...base, work } })
    expect(reply.statusCode, reply.body).toBe(400)
    expect(reply.body.length).toBeGreaterThan(20)
    expect(JSON.stringify(data(world.parent))).toBe(before)
  }
})

it('holds later blocks for failed and unknown audits until the latest verdict passes without moving the parent package', async () => {
  const world = await makeWorld(); const child = world.children[0]!
  const audit = { audit: 'audit', scope: 'scope', evidence: 'evidence', inspector }
  link(child.task, world.block); await align(world, [audit, entry(child)])
  await step(child.task, 'self-complete', complete(child.point))
  expect(data(world.block).state).toBe('doing')
  const pkgBefore = data(world.parent).state
  const verdict = (verdict: string) => ({ audit: audit.audit, verdict, evidence: 'Reviewed.', words: 'Result.' })
  expect((await post(world.parent, 'audit', verdict('pass'))).statusCode).toBe(403)
  for (const answer of ['fail', 'unknown']) {
    await step(world.parent, 'audit', verdict(answer), agent(inspector))
    expect(data(world.block).state).toBe('doing')
    expect(data(world.parent).state).toBe(pkgBefore)
  }
  await step(world.parent, 'audit', verdict('pass'), agent(inspector))
  expect(data(world.block).state).toBe('done')
  expect(data(world.parent).state).toBe(pkgBefore)
})

it('binds an audit inspector to an agent id even if its handle is reused', async () => {
  const world = await makeWorld(); const child = world.children[0]!
  const handle = `a-${randomBytes(4).toString('hex')}`
  const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers: human(), payload: { handle, name: handle } })
  expect(registered.statusCode, registered.body).toBe(201)
  const planned = registered.json().agent.id as string
  const audit = { audit: 'identity', scope: 'scope', evidence: 'evidence', inspector: handle }
  await align(world, [audit, entry(child)])
  expect(data(world.parent).package.alignments.at(-1).plan.work[0].inspector).toBe(planned)
  const notices = t.client.sqlite.prepare("SELECT data FROM records WHERE kind = 'message' AND deleted_at IS NULL").all() as { data: string }[]
  const notice = notices.map(row => JSON.parse(row.data)).find(message => String(message.body).includes(world.parent) && String(message.body).includes(handle) && String(message.body).includes(planned))
  expect(notice).toBeDefined()
  const verdict = { audit: audit.audit, verdict: 'pass', evidence: 'Reviewed.', words: 'Passed.' }
  await step(world.parent, 'audit', verdict, agent(planned))
  expect(data(world.parent).package.auditVerdicts).toHaveLength(1)
  const retired = await app.inject({ method: 'POST', url: `/api/participants/agent/${encodeURIComponent(planned)}/retire`, headers: human(), payload: { because: 'The work is finished.' } })
  expect(retired.statusCode, retired.body).toBe(200)
  const replacement = await app.inject({ method: 'POST', url: '/api/agents/started', headers: human(), payload: { handle, name: handle } })
  expect(replacement.statusCode, replacement.body).toBe(201)
  const other = replacement.json().agent.id as string
  expect(other).not.toBe(planned)
  expect((await post(world.parent, 'audit', verdict, agent(other))).statusCode).toBe(403)
  expect(data(world.parent).package.auditVerdicts).toHaveLength(1)
})

async function workerRun() {
  const reply = await app.inject({ method: 'POST', url: '/api/records',
    headers: { ...agent(office), ...theOfficesKeyHeader() },
    payload: { kind: 'session', title: 'Fixture run', data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: ids[worker] } },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const id = String(reply.json().record.id)
  return { id, headers: { ...agent(worker), 'x-mole-office-session': id, 'x-mole-office-key': String(reply.json().runKey.key) } }
}
async function handBack(child: { task: string; point: string }) {
  const run = await workerRun()
  await step(child.task, 'take-inside', {}, agent(worker))
  await step(child.task, 'align', { restated: 'Do it.', plan: 'Do it.' }, agent(worker))
  await step(child.task, 'align-answer', { answer: 'aligned', words: 'Agreed.' })
  await step(child.task, 'hand-back', { points: [{ pointId: child.point, outcome: 'done', words: 'Done.' }] }, run.headers)
  return run
}

it('answers the child but writes no progress when its aligned parent plan cannot be read', async () => {
  const world = await makeWorld(); const child = world.children[0]!
  const pipeline = await file('pipeline', { blockIds: [] })
  const related = t.blocks.addBlock(pipeline, { name: 'Related', state: 'doing' }, actor()).block.id
  link(child.task, world.block); link(child.task, related, 'relates_to'); await align(world)
  const run = await handBack(child)
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.package.alignments[0].plan', json('{\"broken\":true}')) WHERE id = ?").run(world.parent)
  const answer = await step(child.task, 'accept', { points: [{ pointId: child.point, answer: 'accepted' }] })
  expect(answer.progress).toEqual({ state: 'unknown', reason: 'The parent package or its aligned plan cannot be read.' })
  const notices = t.client.sqlite.prepare(`SELECT r.data FROM message_delivery d JOIN records r ON r.id = d.message_id
    WHERE d.recipient_kind = 'agent' AND d.recipient_id = ? AND json_extract(r.data, '$.aboutRun') = ?`).all(ids[worker], run.id) as { data: string }[]
  const notice = notices.map(row => JSON.parse(row.data)).find(message => message.notice === 'packageAccepted')
  expect(notice.body).toContain('No block or module item was moved because the parent’s aligned plan cannot be read.')
  expect(data(child.task).state).toBe('done')
  expect(data(world.block).state).toBe('doing')
  expect(data(related).state).toBe('doing')
  expect(itemState(world.module, child.item)).toBe('todo')
  const reading = await progress(world.parent)
  expect(reading.state).toBe('unknown')
  expect(reading.blocks).toEqual([])
  expect(JSON.stringify(reading)).toContain('plan')
})

it('moves an enrolled block for the maker answer and the inspector answer', async () => {
  const world = await makeWorld(2); const [first, second] = world.children
  const secondPipeline = await file('pipeline', { blockIds: [] })
  const secondBlock = t.blocks.addBlock(secondPipeline, { name: 'Other work', state: 'doing' }, actor()).block.id
  link(first!.task, world.block); link(second!.task, secondBlock); await align(world)
  await handBack(first!)
  await step(first!.task, 'accept', { points: [{ pointId: first!.point, answer: 'accepted' }] })
  expect(data(world.block).state).toBe('done')
  expect(itemState(world.module, first!.item)).toBe('done')
  await step(first!.task, 'accept', { points: [{ pointId: first!.point, answer: 'returned', words: 'Try again.' }] })
  expect(data(world.block).state).toBe('doing')
  const run = await handBack(second!)
  const pkg = data(second!.task).package
  const check = { by: { actorType: 'agent', actorId: inspector }, at: '2026-01-01 00:00:00', order: 100,
    answer: 'holds', words: 'Reviewed.', run: run.id,
    points: [{ pointId: second!.point, judged: 'done', holds: true, rulesKept: true, why: 'Reviewed.', outcome: 'done' }] }
  t.api.patchRecord(second!.task, { dataPatch: { package: { ...pkg, checks: [check] } } }, actor())
  const delegation = await import('../src/server/lib/delegation.ts')
  delegation.answerTheInspectedPackage({ taskId: second!.task, workspaceId: project, actor: { type: 'agent', id: inspector }, run: run.id })
  expect(data(secondBlock).state).toBe('done')
  expect(itemState(world.module, second!.item)).toBe('done')
})

it('keeps the related-block behavior for a child that was not enrolled and leaves its blocks links alone', async () => {
  const world = await makeWorld(); const child = world.children[0]!
  const pipeline = await file('pipeline', { blockIds: [] })
  const related = t.blocks.addBlock(pipeline, { name: 'Related', state: 'doing' }, actor()).block.id
  link(child.task, world.block); link(child.task, related, 'relates_to')
  await handBack(child)
  await step(child.task, 'accept', { points: [{ pointId: child.point, answer: 'accepted' }] })
  expect(data(related).state).toBe('done')
  expect(data(world.block).state).toBe('doing')
  expect(itemState(world.module, child.item)).toBe('todo')
})

it('keeps related-block behavior when a package has a plain task as its parent', async () => {
  const world = await makeWorld(); const enrolled = world.children[0]!
  const parent = await file('task')
  const point = await file('backlog_item', { line: 'work', number: 'plain', placedBy: { kind: 'person', id: person }, why: 'Fixture', doneWhen: 'Fixture', state: 'todo' })
  const child = await file('task')
  await step(child, 'package', { ...words, moduleIds: [world.module], parent: { kind: 'task', id: parent }, pointIds: [point] })
  const pipeline = await file('pipeline', { blockIds: [] })
  const related = t.blocks.addBlock(pipeline, { name: 'Related', state: 'doing' }, actor()).block.id
  link(child, related, 'relates_to'); link(child, world.block); link(enrolled.task, world.block)
  await align(world); await handBack({ task: child, point })
  await step(child, 'accept', { points: [{ pointId: point, answer: 'accepted' }] })
  expect(data(related).state).toBe('done')
  await step(enrolled.task, 'self-complete', complete(enrolled.point))
  expect(data(world.block).state).toBe('done')
  expect(JSON.stringify(await progress(world.parent))).not.toContain('unknown')
})
