// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TOOL RECORD CARRIES THE TEN ITEMS OF A MANUAL PAGE, AND NAMES ONLY WHAT IS THERE.
 *
 * The toolset catalogue is two kinds of record, `tool_category` and `tool` (src/shared/kinds.ts),
 * on two decisions. The ten items are block b-4
 * of the draft, report i69HYz8BQhSx. This file drives POST /api/records and PATCH /api/records/:id as an agent.
 *
 * What it proves:
 *   - a tool missing an item is named in `incomplete`, and a "part of the office" page with no
 *     category is not;
 *   - a `forWhom` outside users, developers and both is refused;
 *   - a `category` that is not a live tool category is refused, on the create and on the patch;
 *   - a duplicate slug is refused, naming the other record;
 *   - restoring a deleted tool is refused while a live tool holds its slug, naming that tool, and
 *     writes nothing; it is restored once the slug is free;
 *   - a `confirmedBy` that names a record that is not a decision is refused;
 *   - a `confirmedBy` that names a decision the owner did not make is refused, on the create and on
 *     the patch, and nothing is written; one the owner made is taken.
 *
 * The mutations it was proved against are in the commit that added it.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { MANUAL_ITEMS } from '../src/shared/toolset.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'

const AS_AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'toolset-tester',
  'x-mole-office-workspace': 'default',
}

let t: TestDb
let app: FastifyInstance
/** Each case works in its own project, so a list over that project sees only that case's tools. */
let HERE = 'default'
let caseNumber = 0
let workspaces: typeof import('../src/server/lib/workspaces.ts')

beforeAll(async () => {
  t = await freshDb()
  // The app's own module instance, imported after `freshDb` resets the module registry.
  workspaces = await import('../src/server/lib/workspaces.ts')
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(() => {
  caseNumber += 1
  HERE = `tools-ten-case-${String(caseNumber)}`
  workspaces.createWorkspace({ id: HERE, title: `Tools case ${String(caseNumber)}` })
  AS_AGENT['x-mole-office-workspace'] = HERE
})

interface Reply {
  status: number
  body: Record<string, unknown>
}

async function send(method: 'POST' | 'PATCH' | 'DELETE', url: string, payload?: Record<string, unknown>): Promise<Reply> {
  const res = await app.inject({ method, url, headers: AS_AGENT, payload })
  return { status: res.statusCode, body: res.json() as Record<string, unknown> }
}

const error = (reply: Reply): string => String(reply.body['error'])
const idOf = (reply: Reply): string => (reply.body['record'] as { id: string }).id
const incompleteOf = (reply: Reply): string[] => (reply.body['incomplete'] as { path: string }[]).map((one) => one.path)

async function aCategory(title = 'Developing the office'): Promise<string> {
  const made = await send('POST', '/api/records', { kind: 'tool_category', title, data: { says: 'Tools for building the office.' } })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return idOf(made)
}

/** Every item of a manual page filled in, for a built tool kept in this repository. */
function aWholeTool(category: string, slug = 'data-copy'): Record<string, unknown> {
  return {
    entry: 'tool',
    slug,
    does: 'Makes a copy of the office database with every key taken out.',
    forWhom: 'developers',
    category,
    whenToUse: 'When a sandbox needs real records.',
    whenNotToUse: 'Not for a backup.',
    whoMayUse: 'The secretary.',
    howToCall: 'node tools/office-copy.mjs make --to <sandbox>',
    example: 'node tools/office-copy.mjs make --to w13n',
    costs: 'One read of the database.',
    protects: 'No key hash is left in the file.',
    eachUseRecords: 'A line in the log and one line on the run.',
    keptBy: "The office's builders.",
    version: 'Version 1.',
    kept: 'in this repository',
    location: 'tools/office-copy.mjs',
    state: 'built',
  }
}

describe('a tool record carries the ten items', () => {
  it('is complete with every item filled in, and names each missing item in incomplete', async () => {
    const category = await aCategory()
    const whole = await send('POST', '/api/records', { kind: 'tool', title: 'Data copy', data: aWholeTool(category) })
    expect(whole.status, JSON.stringify(whole.body)).toBe(201)
    expect(incompleteOf(whole)).toEqual([])

    // Every key of every item but the title and copyOf, which is only for an adaptable copy.
    const itemKeys = MANUAL_ITEMS.flatMap((item) => [...item.keys]).filter((key) => key !== 'title' && key !== 'copyOf')
    expect(itemKeys.length).toBe(13)
    for (const key of itemKeys) {
      const data = aWholeTool(category, `without-${key.toLowerCase()}`)
      delete data[key]
      const made = await send('POST', '/api/records', { kind: 'tool', title: `Without ${key}`, data })
      expect(made.status, JSON.stringify(made.body)).toBe(201)
      expect(incompleteOf(made), key).toEqual([`data.${key}`])
    }
  })

  it('needs a location once built, and a category unless it is a page on a part of the office', async () => {
    const category = await aCategory()
    const planned = aWholeTool(category, 'planned')
    delete planned['location']
    planned['state'] = 'not built yet'
    const notBuilt = await send('POST', '/api/records', { kind: 'tool', title: 'Planned', data: planned })
    expect(incompleteOf(notBuilt)).toEqual([])

    const page = aWholeTool(category, 'records')
    delete page['category']
    page['entry'] = 'part of the office'
    const part = await send('POST', '/api/records', { kind: 'tool', title: 'Records', data: page })
    expect(part.status, JSON.stringify(part.body)).toBe(201)
    expect(incompleteOf(part)).toEqual([])

    const refused = await send('POST', '/api/records', { kind: 'tool', title: 'Records again', data: { ...page, slug: 'records-two', category } })
    expect(refused.status).toBe(400)
    expect(error(refused)).toContain('names no category')
  })

  it('refuses a forWhom outside the three words', async () => {
    const category = await aCategory()
    const made = await send('POST', '/api/records', { kind: 'tool', title: 'For everyone', data: { ...aWholeTool(category), forWhom: 'everyone' } })
    expect(made.status).toBe(400)
    expect(error(made)).toContain('data.forWhom')
    for (const word of ['users', 'developers', 'both']) expect(error(made)).toContain(word)
  })

  it('refuses a category that is not a live tool category, on the create and on the patch', async () => {
    const problem = await send('POST', '/api/records', { kind: 'problem', title: 'Not a category', data: { symptom: 'It is a problem.' } })
    const problemId = idOf(problem)
    const onCreate = await send('POST', '/api/records', { kind: 'tool', title: 'In a problem', data: aWholeTool(problemId) })
    expect(onCreate.status).toBe(400)
    expect(error(onCreate)).toContain(`data.category is "${problemId}", which is a problem called "Not a category"`)

    const nothing = await send('POST', '/api/records', { kind: 'tool', title: 'In nothing', data: aWholeTool('no-such-id') })
    expect(nothing.status).toBe(400)
    expect(error(nothing)).toContain('no record in this project has that id')

    const category = await aCategory()
    const tool = idOf(await send('POST', '/api/records', { kind: 'tool', title: 'Data copy', data: aWholeTool(category) }))
    const onPatch = await send('PATCH', `/api/records/${tool}`, { dataPatch: { category: problemId } })
    expect(onPatch.status).toBe(400)
    expect(error(onPatch)).toContain('not a tool category')
  })

  it('refuses a duplicate slug, naming the other record, and lets a tool keep its own', async () => {
    const category = await aCategory()
    const first = idOf(await send('POST', '/api/records', { kind: 'tool', title: 'Data copy', data: aWholeTool(category) }))
    const second = await send('POST', '/api/records', { kind: 'tool', title: 'Another copy', data: aWholeTool(category) })
    expect(second.status).toBe(409)
    expect(error(second)).toContain(`the tool ${first} ("Data copy") already has it`)

    const other = idOf(await send('POST', '/api/records', { kind: 'tool', title: 'Sandbox', data: aWholeTool(category, 'sandbox') }))
    const renamed = await send('PATCH', `/api/records/${other}`, { dataPatch: { slug: 'data-copy' } })
    expect(renamed.status).toBe(409)
    expect(error(renamed)).toContain(first)

    const itself = await send('PATCH', `/api/records/${first}`, { dataPatch: { does: 'Copies the database without its keys.' } })
    expect(itself.status, JSON.stringify(itself.body)).toBe(200)
  })

  it('refuses to restore a deleted tool while a live tool holds its slug, and restores it once the slug is free', async () => {
    const category = await aCategory()
    const first = idOf(await send('POST', '/api/records', { kind: 'tool', title: 'Data copy', data: aWholeTool(category) }))
    const deleted = await send('DELETE', `/api/records/${first}`)
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(200)
    const other = idOf(await send('POST', '/api/records', { kind: 'tool', title: 'Office copy', data: aWholeTool(category) }))

    const changes = (): number => (t.client.sqlite.prepare('SELECT count(*) AS n FROM changes').get() as { n: number }).n
    const before = changes()
    const refused = await send('POST', `/api/records/${first}/restore`, {})
    expect(refused.status, JSON.stringify(refused.body)).toBe(409)
    expect(error(refused)).toContain(
      `The tool ${first} ("Data copy") cannot be restored, because its slug "data-copy" is held by the live tool ${other} ("Office copy").`,
    )
    expect(t.api.getRecord(first)?.deletedAt).not.toBeNull()
    expect(changes()).toBe(before)

    // THE SLUG IS FREED, and the same restore now brings the tool back.
    const renamed = await send('PATCH', `/api/records/${other}`, { dataPatch: { slug: 'office-copy' } })
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(200)
    const restored = await send('POST', `/api/records/${first}/restore`, {})
    expect(restored.status, JSON.stringify(restored.body)).toBe(200)
    expect(t.api.getRecord(first)?.deletedAt).toBeNull()
  })

  it('refuses a confirmedBy that names a record that is not a decision, and takes one that is', async () => {
    const note = await send('POST', '/api/records', { kind: 'note', title: 'Not a decision', data: {} })
    const noteId = idOf(note)
    const refused = await send('POST', '/api/records', {
      kind: 'tool_category',
      title: 'Services',
      data: { says: 'Things outside the office.', confirmedBy: noteId },
    })
    expect(refused.status).toBe(400)
    expect(error(refused)).toContain(`data.confirmedBy is "${noteId}", which is a note called "Not a decision" and not a decision`)

    const decision = t.api.createRecord({
      workspaceId: HERE,
      kind: 'decision',
      title: 'The first categories are confirmed',
      data: { because: 'the owner confirmed them', decided_by: 'the owner' },
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true },
    })
    const confirmed = await send('POST', '/api/records', {
      kind: 'tool_category',
      title: 'Services',
      data: { says: 'Things outside the office.', confirmedBy: decision.id },
    })
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(201)
  })

  it('refuses a confirmedBy that names a decision the owner did not make, on the create and on the patch', async () => {
    const byTheOwner = t.api.createRecord({
      workspaceId: HERE,
      kind: 'decision',
      title: 'Services is a category',
      data: { because: 'the owner confirmed it', decided_by: 'the owner' },
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true },
    })
    const byAnAgent = t.api.createRecord({
      workspaceId: HERE,
      kind: 'decision',
      title: `Services is a category, says ${THE_TEST_OFFICES_SECRETARY.handle}`,
      data: { because: `${THE_TEST_OFFICES_SECRETARY.handle} thought so`, decided_by: THE_TEST_OFFICES_SECRETARY.handle, authority: 'reversible engineering judgement' },
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true },
    })
    const byNobody = t.api.createRecord({
      workspaceId: HERE,
      kind: 'decision',
      title: 'Services is a category, says nobody',
      data: { because: 'nobody said who' },
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true },
    })
    const categoriesBefore = t.api.listRecords({ workspaceId: HERE, kind: 'tool_category' }).length

    // ON THE CREATE: refused, and no category is filed.
    const refused = await send('POST', '/api/records', {
      kind: 'tool_category',
      title: 'Services',
      data: { says: 'Things outside the office.', confirmedBy: byAnAgent.id },
    })
    expect(refused.status).toBe(400)
    expect(error(refused)).toContain(
      `data.confirmedBy is "${byAnAgent.id}", the decision "Services is a category, says ${THE_TEST_OFFICES_SECRETARY.handle}", and its decided_by says "${THE_TEST_OFFICES_SECRETARY.handle}".`,
    )
    expect(error(refused)).toContain('A category is confirmed only by a decision the owner made')
    const unsaid = await send('POST', '/api/records', {
      kind: 'tool_category',
      title: 'Services',
      data: { says: 'Things outside the office.', confirmedBy: byNobody.id },
    })
    expect(unsaid.status).toBe(400)
    expect(error(unsaid)).toContain('its decided_by names nobody')
    expect(t.api.listRecords({ workspaceId: HERE, kind: 'tool_category' }).length).toBe(categoriesBefore)

    // ON THE PATCH: refused, and the category is exactly as it was.
    const proposed = await aCategory('Services')
    const before = t.api.getRecord(proposed)
    const patched = await send('PATCH', `/api/records/${proposed}`, { dataPatch: { confirmedBy: byAnAgent.id } })
    expect(patched.status).toBe(400)
    expect(error(patched)).toContain('A category is confirmed only by a decision the owner made')
    const after = t.api.getRecord(proposed)
    expect(after?.data).toEqual(before?.data)
    expect(after?.updatedAt).toBe(before?.updatedAt)

    // AND THE OWNER'S OWN DECISION IS TAKEN, on the same patch door.
    const taken = await send('PATCH', `/api/records/${proposed}`, { dataPatch: { confirmedBy: byTheOwner.id } })
    expect(taken.status, JSON.stringify(taken.body)).toBe(200)
    expect((t.api.getRecord(proposed)?.data as Record<string, unknown>)['confirmedBy']).toBe(byTheOwner.id)
  })
})
