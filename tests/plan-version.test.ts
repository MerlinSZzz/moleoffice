// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PLAN REFUSES A WRITE BUILT ON A COPY SOMEBODY HAS ALREADY REPLACED.
 *
 * What these tests are about, in one sentence each:
 *
 *   - Every read of a plan hands back a version token.
 *   - The token moves when anything about the document changes, and does not move when nothing does.
 *   - The token is over the LINES as well as the plan row, so rewriting the document moves it.
 *   - A write that sends the token it read goes through; a write that sends an older one is refused
 *     with 409 and NOTHING is written.
 *   - The refusal says what the plan holds now and who wrote in it last, so a person can compare.
 *   - Sending the token is allowed at all: the write schemas used to refuse the one field that
 *     makes a save safe.
 *
 * The two-tab case: two readers load the same version, one writes, and the
 * other later writes its stale copy over the newer work.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { BuiltServer } from '../src/server/index.ts'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: BuiltServer['app']

beforeAll(async () => {
  t = await freshDb()
  const { apiApp } = await import('./helpers.ts')
  app = (await apiApp()).app
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

type Json = Record<string, unknown>

function bodyOf(res: { body: string }): Json {
  return JSON.parse(res.body) as Json
}

async function newPlan(body: string): Promise<{ id: string; lines: { id: string; text: string }[] }> {
  const res = await app.inject({ method: 'POST', url: '/api/plans', payload: { title: 'Robotics week', body } })
  expect(res.statusCode, res.body).toBe(201)
  const made = bodyOf(res)
  return { id: (made['plan'] as { id: string }).id, lines: made['lines'] as { id: string; text: string }[] }
}

async function read(id: string): Promise<{ version: string; lines: { id: string; text: string }[] }> {
  const res = await app.inject({ method: 'GET', url: `/api/plans/${id}` })
  expect(res.statusCode, res.body).toBe(200)
  const body = bodyOf(res)
  return {
    version: body['version'] as string,
    lines: (body['lines'] as { line: { id: string; text: string } }[]).map((row) => row.line),
  }
}

async function saveBody(
  id: string,
  body: string,
  ifVersion?: string,
): Promise<{ status: number; body: Json }> {
  const res = await app.inject({
    method: 'PUT',
    url: `/api/plans/${id}/body`,
    payload: ifVersion === undefined ? { body } : { body, ifVersion },
  })
  return { status: res.statusCode, body: bodyOf(res) }
}

const DOCUMENT = ['# ICRA', '- baseline', '- gaze'].join('\n')

describe('every read of a plan says which version it is', () => {
  it('hands the token back from the plan, its blocks and the list', async () => {
    const plan = await newPlan(DOCUMENT)
    const one = await read(plan.id)
    expect(one.version).toMatch(/^[0-9a-f]{16}$/)

    const blocks = bodyOf(await app.inject({ method: 'GET', url: `/api/plans/${plan.id}/blocks` }))
    expect(blocks['version']).toBe(one.version)

    const list = bodyOf(await app.inject({ method: 'GET', url: '/api/plans' }))
    const summary = (list['plans'] as { plan: { id: string }; version: string }[]).find(
      (row) => row.plan.id === plan.id,
    )!
    expect(summary.version).toBe(one.version)
  })

  it('is the same token for the same content and a different one for different content', async () => {
    const plan = await newPlan(DOCUMENT)
    const first = await read(plan.id)
    // Reading twice changes nothing, so the token does not move.
    expect((await read(plan.id)).version).toBe(first.version)

    // A write that changes nothing about the document does not move it either.
    const same = await saveBody(plan.id, DOCUMENT)
    expect(same.status, JSON.stringify(same.body)).toBe(200)
    expect((await read(plan.id)).version).toBe(first.version)

    // A word changed in one line moves it. THIS IS THE ONE THE PLAN ROW CANNOT SEE: `plans` holds
    // no body, so a token built from that row alone would be the same before and after.
    const edited = await saveBody(plan.id, ['# ICRA', '- baseline gains', '- gaze'].join('\n'))
    expect(edited.status, JSON.stringify(edited.body)).toBe(200)
    const after = await read(plan.id)
    expect(after.version).not.toBe(first.version)
    expect(edited.body['version']).toBe(after.version)
  })

  it('moves when the title or the state changes, and when a line is filed as work', async () => {
    const plan = await newPlan(DOCUMENT)
    const start = (await read(plan.id)).version

    await app.inject({ method: 'PATCH', url: `/api/plans/${plan.id}`, payload: { title: 'ICRA week' } })
    const renamed = (await read(plan.id)).version
    expect(renamed).not.toBe(start)

    await app.inject({ method: 'PATCH', url: `/api/plans/${plan.id}`, payload: { state: 'done' } })
    const closed = (await read(plan.id)).version
    expect(closed).not.toBe(renamed)

    const line = (await read(plan.id)).lines.find((one) => one.text === '- baseline')!
    const filed = await app.inject({
      method: 'POST',
      url: `/api/plans/${plan.id}/lines/${line.id}/file-as-work`,
      payload: { kind: 'task', workspaceId: 'default' },
    })
    expect(filed.statusCode, filed.body).toBe(201)
    expect((await read(plan.id)).version).not.toBe(closed)
  })
})

describe('a write built on an older copy is refused', () => {
  it('takes the token the read handed back', async () => {
    const plan = await newPlan(DOCUMENT)
    const mine = await read(plan.id)
    const saved = await saveBody(plan.id, `${DOCUMENT}\n- mount`, mine.version)
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    expect(saved.body['version']).not.toBe(mine.version)
  })

  it('answers 409 and writes nothing when somebody else has saved first', async () => {
    const plan = await newPlan(DOCUMENT)
    // Two readers, one version.
    const first = await read(plan.id)
    const second = await read(plan.id)
    expect(second.version).toBe(first.version)

    // The first one saves.
    const won = await saveBody(plan.id, `${DOCUMENT}\n- the mount`, first.version)
    expect(won.status, JSON.stringify(won.body)).toBe(200)

    // The second one saves its older copy, which does not have that line in it at all.
    const lost = await saveBody(plan.id, `${DOCUMENT}\n- gaze again`, second.version)
    expect(lost.status, JSON.stringify(lost.body)).toBe(409)

    // NOTHING WAS WRITTEN. The first writer's line is still there and the second writer's is not.
    const now = await read(plan.id)
    expect(now.lines.map((one) => one.text)).toEqual(['# ICRA', '- baseline', '- gaze', '- the mount'])
    expect(now.version).toBe(won.body['version'])
  })

  it('says what moved, in words a person can act on', async () => {
    const plan = await newPlan(DOCUMENT)
    const stale = (await read(plan.id)).version
    await app.inject({
      method: 'PUT',
      url: `/api/plans/${plan.id}/body`,
      payload: { body: `${DOCUMENT}\n- the mount` },
      headers: { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'nightly-bot' },
    })
    const lost = await saveBody(plan.id, 'nothing at all', stale)
    expect(lost.status).toBe(409)
    const said = lost.body['error'] as string
    expect(said).toContain('has changed since you read it')
    expect(said).toContain(stale)
    expect(said).toContain('4 lines')
    expect(said).toContain('agent:nightly-bot')
    expect(said).toContain('- the mount')
    expect(said).toContain(`GET /api/plans/${plan.id}`)
  })

  it('refuses a stale write on every route that changes the document', async () => {
    const plan = await newPlan(DOCUMENT)
    const stale = (await read(plan.id)).version
    // Somebody else writes, so every version below is out of date.
    await saveBody(plan.id, `${DOCUMENT}\n- the mount`)
    const line = (await read(plan.id)).lines[1]!

    const tries: { what: string; method: 'PUT' | 'POST' | 'PATCH'; url: string; payload: Json }[] = [
      { what: 'the whole document', method: 'PUT', url: `/api/plans/${plan.id}/body`, payload: { body: 'x' } },
      {
        what: 'the lines',
        method: 'PUT',
        url: `/api/plans/${plan.id}/lines`,
        payload: { lines: [{ text: 'x' }] },
      },
      { what: 'the plan', method: 'PATCH', url: `/api/plans/${plan.id}`, payload: { title: 'Another name' } },
      { what: 'one new line', method: 'POST', url: `/api/plans/${plan.id}/lines`, payload: { text: 'x' } },
      {
        what: 'one line',
        method: 'PATCH',
        url: `/api/plans/${plan.id}/lines/${line.id}`,
        payload: { text: 'x' },
      },
    ]
    for (const one of tries) {
      const res = await app.inject({ method: one.method, url: one.url, payload: { ...one.payload, ifVersion: stale } })
      expect(res.statusCode, `${one.what}: ${res.body}`).toBe(409)
    }
    // And none of them wrote anything: the document is exactly what the other writer left.
    const now = await read(plan.id)
    expect(now.lines.map((row) => row.text)).toEqual(['# ICRA', '- baseline', '- gaze', '- the mount'])
    expect(bodyOf(await app.inject({ method: 'GET', url: `/api/plans/${plan.id}` }))['plan']).toMatchObject({
      title: 'Robotics week',
    })
  })

  it('lets the write through without the token, as it always did', async () => {
    const plan = await newPlan(DOCUMENT)
    const saved = await saveBody(plan.id, `${DOCUMENT}\n- the mount`)
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
  })

  it('refuses an empty token rather than ignoring it', async () => {
    const plan = await newPlan(DOCUMENT)
    const res = await app.inject({
      method: 'PUT',
      url: `/api/plans/${plan.id}/body`,
      payload: { body: 'x', ifVersion: '' },
    })
    expect(res.statusCode, res.body).toBe(400)
  })

  it('still refuses a key nobody declared, so a mistyped precondition is not dropped', async () => {
    // The write schemas were relaxed for `ifVersion` and for nothing else. A caller that types
    // `ifVerison` must hear about it rather than be told its stale write succeeded.
    const plan = await newPlan(DOCUMENT)
    const res = await app.inject({
      method: 'PUT',
      url: `/api/plans/${plan.id}/body`,
      payload: { body: 'x', ifVerison: 'whatever' },
    })
    expect(res.statusCode, res.body).toBe(400)
    expect(bodyOf(res)['error']).toContain('ifVerison')
  })
})
