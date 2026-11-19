// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FACT DRAWN BESIDE A LINE OF A PLAN CAN BE POINTED AT ON ITS OWN (problem ON-vXSmgokHf).
 *
 * The plan table draws a line's size, the time given to it and its project in cells beside the
 * line. A right-click on one of them used to answer the whole line, so a question could not say
 * which fact it was about. Each of those cells now says it is a `planLineFact`, and the server
 * reads that kind for real: it finds the plan, the line and the fact, and says what the fact says.
 *
 * WHAT THIS FILE HOLDS, and what it leaves to others:
 *   1. The server stores a comment on a fact, and reads the fact back through the plan, the line
 *      and the fact's own words.
 *   2. A fact a line does not have, and a line that is gone, are refused with a code, so the
 *      composer can say why in the page's language. `tests/coded-refusals-keep-the-server-english.test.ts`
 *      checks that the English reply stays English beside the code.
 *   3. The cells that draw a fact carry the target, and the cells that draw the line's own words do
 *      not. That is read from the markup in `tests/the-gesture-reaches-the-whole-row.test.ts`,
 *      which already has the stand-in window the table needs.
 *
 * Every plan, line and person here is made up.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { Target } from '../src/shared/targets.ts'

const HUMAN = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': 'test-rowan', 'x-mole-office-workspace': 'default' }

let t: TestDb
let app: FastifyInstance
let resolveTarget: typeof import('../src/server/lib/targets.ts')['resolveTarget']

beforeAll(async () => {
  t = await freshDb()
  ;({ resolveTarget } = await import('../src/server/lib/targets.ts'))
  app = (await apiApp()).app
  await app.ready()
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/** A plan with one line that gives itself a size in its own words. */
async function aPlan(): Promise<{ planId: string; lineId: string }> {
  const made = await app.inject({
    method: 'POST',
    url: '/api/plans',
    headers: HUMAN,
    payload: { title: 'Test bench week', body: '- Re-level the test bench {size: 3h}' },
  })
  expect(made.statusCode, made.body).toBe(201)
  const reply = made.json() as { plan: { id: string }; lines: { id: string }[] }
  const lineId = reply.lines[0]?.id
  expect(lineId, 'the plan came back with no line').toBeDefined()
  return { planId: reply.plan.id, lineId: lineId ?? '' }
}

/** A comment through the ordinary door, about whatever target it is given. */
async function commentOn(target: Target) {
  return app.inject({
    method: 'POST',
    url: '/api/records',
    headers: HUMAN,
    payload: { kind: 'annotation', title: 'on the size', data: { body: 'Is three hours enough?', context: { target } } },
  })
}

describe('a fact beside a line of a plan', () => {
  it('is stored as its own target, and read back through the plan, the line and the fact', async () => {
    const { planId, lineId } = await aPlan()
    const stored = await commentOn({ kind: 'planLineFact', planId, lineId, fact: 'size' })
    expect(stored.statusCode, stored.body).toBe(201)
    const context = (stored.json() as { record: { data: { context: { target: Target } } } }).record.data.context
    expect(context.target).toEqual({ kind: 'planLineFact', planId, lineId, fact: 'size' })

    const read = resolveTarget({ kind: 'planLineFact', planId, lineId, fact: 'size' })
    expect(read.answer).toBe('found')
    if (read.answer !== 'found') return
    // WHAT THE FACT SAYS NOW, from the line's own words, so an agent reads what the person saw.
    expect(read.text.about).toContain('the size of the line')
    expect(read.text.about).toContain('"3h"')
    expect(read.text.strings).toEqual([])
    // A fact that nothing is said about is still there, and the sentence says so.
    const project = resolveTarget({ kind: 'planLineFact', planId, lineId, fact: 'project' })
    expect(project.answer).toBe('found')
    if (project.answer === 'found') expect(project.text.about).toContain('which says nothing')

    const filed = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/lines/${lineId}/file-as-work`,
      headers: HUMAN,
      payload: { kind: 'task', workspaceId: 'default' },
    })
    expect(filed.statusCode, filed.body).toBe(201)
    const sizeAfterFiling = resolveTarget({ kind: 'planLineFact', planId, lineId, fact: 'size' })
    expect(sizeAfterFiling.answer).toBe('found')
    if (sizeAfterFiling.answer === 'found') expect(sizeAfterFiling.text.about).toContain('3 hours')
    const projectAfterFiling = resolveTarget({ kind: 'planLineFact', planId, lineId, fact: 'project' })
    expect(projectAfterFiling.answer).toBe('found')
    if (projectAfterFiling.answer === 'found') expect(projectAfterFiling.text.about).not.toContain('which says nothing')
  })

  it('refuses a fact a line does not have, with a code, and stores nothing', async () => {
    const { planId, lineId } = await aPlan()
    const refused = await commentOn({ kind: 'planLineFact', planId, lineId, fact: 'note' })
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refused.json()).toMatchObject({ code: 'planLineFactUnknown', values: {} })
    expect(refused.json().error).toContain('no fact called "note"')
  })

  it('refuses a line that is gone, with a code, and does not read it as the whole plan', async () => {
    const { planId, lineId } = await aPlan()
    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/plans/${planId}/lines/${lineId}`,
      headers: HUMAN,
      payload: { reason: 'This made-up line was removed in the test.' },
    })
    expect(removed.statusCode, removed.body).toBe(200)
    const refused = await commentOn({ kind: 'planLineFact', planId, lineId, fact: 'size' })
    expect(refused.statusCode, refused.body).toBe(404)
    expect(refused.json()).toMatchObject({ code: 'planLineFactGone', values: {} })
  })

  it('refuses a fact after its plan is gone with the same code', async () => {
    const { planId, lineId } = await aPlan()
    const removed = await app.inject({ method: 'DELETE', url: `/api/plans/${planId}`, headers: HUMAN })
    expect(removed.statusCode, removed.body).toBe(200)
    const refused = await commentOn({ kind: 'planLineFact', planId, lineId, fact: 'size' })
    expect(refused.statusCode, refused.body).toBe(404)
    expect(refused.json()).toMatchObject({ code: 'planLineFactGone', values: {} })
  })
})
