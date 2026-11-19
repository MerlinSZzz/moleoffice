// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BACKLOG ITEM IS A RECORD, AND A LINE READS ONLY ITS OWN. Wave 13s round 142, the second part of item 38 of the
 * line's requirements. The kind is declared in src/shared/kinds.ts and its
 * states in src/shared/backlog.ts; src/server/lib/backlog.ts reads one line's items and src/server/api/backlog.ts is
 * the door, GET /api/backlog?line=<line>.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. The agent is a made-up
 * agent with a made-up handle, holding the key the office answered. Every item, line and number here is made up.
 *
 * THE CASES, in order, on one world:
 *   1. the kind declares what an item says: its line and number, who placed it, when and why, what counts as done,
 *      the files it involves, its order, a pause and its state, and the merge it landed in; it is read under the work
 *      family and a plan gives it no hours;
 *   2. an agent files an item placed by the person through POST /api/records, and the data is stored as it was sent,
 *      with nothing missing;
 *   3. an item placed by a handle, or by an id no registry row answers to, is refused with 400 and nothing is written;
 *      who placed it is drawn as a name and the merge it landed in as a record's title;
 *   4. GET /api/backlog?line= answers the items of that line in this project and no other: by order, smallest first,
 *      then the items with no order, each group in the order filed; another line's item, a deleted item and another
 *      project's item are not in it;
 *   5. a line no item names is answered with no items and a sentence saying so;
 *   6. a request with no line, a blank line or a word the door does not read is refused with 400.
 *
 * MUTATIONS, each run alone after a green control and restored after (29 October 2026):
 *   - the door's read no longer narrows by line: cases 4 and 5 are red;
 *   - the items are no longer sorted by order: case 4 is red;
 *   - `backlog_item` is taken out of PARTICIPANT_FIELDS: case 3 is red;
 *   - `dropped` is taken out of the states: cases 1 and 4 are red, as case 4 files a dropped item;
 *   - the door no longer refuses a blank line: case 6 is red.
 */

import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { KIND_SPECS } from '../src/shared/kinds.ts'
import { THE_WORKER } from '../src/shared/roles.ts'
import { namesAParticipant, namesRecords } from '../src/shared/sections.ts'
import { PLAN_HOURS_BY_KIND, familyOf } from '../src/shared/work.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const PLACER = 'backlog-placing-worker'
const LINE = 'made-up-line'
const OTHER_PROJECT = 'made-up-other-project'

let t: TestDb
let app: FastifyInstance
const PERSON: Record<string, string> = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
let agentKey = ''
let agentId = ''

const asTheAgent = (workspace = 'default'): Record<string, string> => ({
  'x-mole-office-workspace': workspace,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': PLACER,
  'x-mole-office-key': agentKey,
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: any; error: string; raw: string }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {}
  try {
    body = reply.json()
  } catch {
    body = {}
  }
  return { status: reply.statusCode, body, error: typeof body?.error === 'string' ? body.error : '', raw: reply.body }
}

/** How many backlog items the table holds, deleted or not. */
function itemsStored(): number {
  return (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'backlog_item'").get() as { n: number }).n
}

/** A made-up item of the line named, placed by the person. */
function anItem(line: string, number: string, more: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    line,
    number,
    placedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
    why: 'Made-up: the made-up owner asked for it.',
    doneWhen: 'Made-up: the made-up page shows the made-up list.',
    state: 'todo',
    ...more,
  }
}

async function fileAnItem(data: Record<string, unknown>, workspace = 'default'): Promise<string> {
  const filed = await call('POST', '/api/records', asTheAgent(workspace), {
    kind: 'backlog_item',
    title: `Made-up item ${String(data['number'])} of ${String(data['line'])}`,
    summary: 'A made-up backlog item placed by the made-up owner.',
    data,
  })
  expect(filed.status, filed.raw).toBe(201)
  return String(filed.body.record.id)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  const started = await call('POST', '/api/agents/started', PERSON, { handle: PLACER, name: PLACER, role: THE_WORKER })
  expect(started.status, started.raw).toBe(201)
  agentKey = String(started.body.whatToGiveIt?.key ?? '')
  agentId = String(started.body.agent?.id ?? '')
  // Case 3 tells a handle from a registry id, so the two have to differ here.
  expect(agentId).not.toBe(PLACER)
  // Case 4 files one item in another project, which a scratch office does not hold until somebody makes it.
  const made = await call('POST', '/api/workspaces', PERSON, { id: OTHER_PROJECT, title: 'Made-up other project' })
  expect(made.status, made.raw).toBe(201)
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('a backlog item', () => {
  it('1. declares what an item says, and is work that takes no hours', () => {
    const spec = KIND_SPECS.backlog_item
    expect(spec, 'there is no kind called backlog_item').toBeDefined()
    const field = (key: string) => {
      const found = spec.fields.find((one) => one.key === key)
      expect(found, `a backlog item declares no ${key}`).toBeDefined()
      return found!
    }
    expect(field('line').type).toBe('string')
    expect(field('number').type).toBe('string')
    expect(field('placedBy').type).toBe('ParticipantRef')
    expect(field('placedAt').type).toBe('date')
    expect(field('why').type).toBe('string')
    expect(field('doneWhen').type).toBe('string')
    expect(field('files').type).toBe('string[]')
    expect(field('order').type).toBe('number')
    expect(field('paused').type).toBe('Pause')
    expect(field('state').type).toBe("'todo' | 'doing' | 'done' | 'dropped'")
    expect(field('landedIn').type).toBe('string')
    for (const key of ['line', 'number', 'placedBy', 'why', 'doneWhen', 'state']) expect(field(key).required, `${key} is not required`).toBe(true)
    for (const key of ['placedAt', 'files', 'order', 'paused', 'landedIn']) expect(field(key).required, `${key} is required`).toBe(false)
    expect(familyOf('backlog_item')).toBe('work')
    expect(PLAN_HOURS_BY_KIND.backlog_item.mayHaveHours).toBe(false)
  })

  it('2. is filed by an agent, placed by the person, and stored as it was sent', async () => {
    const data = anItem(LINE, '38', {
      placedAt: '2026-10-29 08:50',
      files: ['src/made-up/one.ts', 'tests/made-up-two.test.ts'],
      order: 1,
      paused: { since: '2026-10-29', why: 'Made-up: it waits on another line.', until: { condition: 'the made-up line has landed' } },
    })
    const id = await fileAnItem(data)
    const read = await call('GET', `/api/records/${id}`, asTheAgent())
    expect(read.status, read.raw).toBe(200)
    expect(read.body.record.kind).toBe('backlog_item')
    expect(read.body.record.data).toEqual(data)
    expect(read.body.incomplete).toEqual([])
  })

  it('3. refuses an item placed by a handle or by nobody, writes nothing, and draws who placed it as a name', async () => {
    const before = itemsStored()
    for (const placedBy of [
      { kind: 'agent', id: PLACER },
      { kind: 'person', id: 'made-up-nobody' },
    ]) {
      const refused = await call('POST', '/api/records', asTheAgent(), {
        kind: 'backlog_item',
        title: 'A made-up item placed by nobody',
        data: anItem(LINE, '39', { placedBy }),
      })
      expect(refused.status, refused.raw).toBe(400)
      expect(refused.error).toContain(`data.placedBy names the ${placedBy.kind} "${placedBy.id}"`)
      expect(refused.error).toContain('Nothing was written.')
    }
    expect(itemsStored()).toBe(before)
    expect(namesAParticipant('backlog_item', 'placedBy')).toBe(true)
    expect(namesRecords('backlog_item', 'landedIn')).toBe(true)
  })

  it("4. is read with its line's other items in this project, by order and then in the order filed", async () => {
    const line = 'made-up-ordered-line'
    const second = await fileAnItem(anItem(line, '2', { order: 2, state: 'done' }))
    const first = await fileAnItem(anItem(line, '1', { order: 1 }))
    const unorderedEarlier = await fileAnItem(anItem(line, '3'))
    const unorderedLater = await fileAnItem(anItem(line, '4', { state: 'dropped' }))
    // WHEN EACH WAS FILED, written apart, because the office keeps the time to the second and these four were filed in one.
    const filedAt = t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?')
    filedAt.run('2026-10-29T08:00:00.000Z', unorderedLater)
    filedAt.run('2026-10-28T08:00:00.000Z', unorderedEarlier)
    const otherLine = await fileAnItem(anItem('made-up-other-line', '1', { order: 0 }))
    const deleted = await fileAnItem(anItem(line, '5', { order: 0 }))
    t.client.sqlite.prepare('UPDATE records SET deleted_at = ? WHERE id = ?').run('2026-10-29T09:00:00.000Z', deleted)
    const elsewhere = await fileAnItem(anItem(line, '6', { order: 0 }), OTHER_PROJECT)

    const read = await call('GET', `/api/backlog?line=${line}`, asTheAgent())
    expect(read.status, read.raw).toBe(200)
    expect(read.body.line).toBe(line)
    const ids = (read.body.items as { id: string }[]).map((one) => one.id)
    expect(ids).toEqual([first, second, unorderedEarlier, unorderedLater])
    for (const absent of [otherLine, deleted, elsewhere]) expect(ids).not.toContain(absent)
    expect(read.body.items[0].data.number).toBe('1')
    expect(read.body.noneFiled).toBeNull()
  })

  it('5. answers a line no item names with no items and a sentence saying so', async () => {
    const read = await call('GET', '/api/backlog?line=made-up-empty-line', asTheAgent())
    expect(read.status, read.raw).toBe(200)
    expect(read.body.items).toEqual([])
    expect(read.body.noneFiled).toContain('"made-up-empty-line"')
  })

  it('6. refuses a request with no line, a blank line, or a word it does not read', async () => {
    for (const url of ['/api/backlog', '/api/backlog?line=', '/api/backlog?line=%20%20', `/api/backlog?line=${LINE}&state=todo`]) {
      const refused = await call('GET', url, asTheAgent())
      expect(refused.status, `${url}: ${refused.raw}`).toBe(400)
    }
  })
})
