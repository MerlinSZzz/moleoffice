// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE GOVERNS CHECK LISTS A PAIR ONLY WHEN BOTH DECISIONS NAME ONE FILE. The coordinator's call for wave 13y round
 * 12, with the reading in message g88FHyAlaxiE: paths are compared as before (equal, or one covers the other); a pair
 * that shares only a module, flow or pipeline is counted and not listed.
 *
 * On 9 October 2026 a secretary filled governs for 70 release decisions, and the check listed 781 pairs, almost all
 * of them decisions on one module that add to each other. `replaces` cannot quiet them, because it retires the whole older one.
 *
 * What is proved, against a test office of its own:
 *   1. Two live decisions on one path are listed.
 *   2. Two live decisions on one module, each with its own path, are counted and not listed.
 *   3. An older decision that a newer one replaces is neither listed nor counted.
 *
 * Mutations, one at a time, restored with cp and checked with cmp:
 *   A. src/server/lib/governs.ts, `theSameFile` returns false: cases 1 and 2 go red.
 *   B. src/server/lib/governs.ts, `'path' in a && 'path' in b && ` removed from `theSameFile`: case 2 goes red.
 *   C. src/server/lib/governs.ts, `const placed = live.map(` to `const placed = decisions.map(`: case 3 goes red.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
// Read after the test office is open: the module opens the database it is first loaded against.
let governs: typeof import('../src/server/lib/governs.ts')
/** This case's own project, so its decisions are the only ones the check reads. */
let workspace = 'default'
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
  governs = await import('../src/server/lib/governs.ts')
  app = (await apiApp()).app
  await app.ready()
  // The first one loads the whole server, which on a busy machine takes longer than the default ten seconds.
}, 120_000)

beforeEach(async () => {
  caseNumber += 1
  workspace = `governs-case-${String(caseNumber)}`
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: workspace, title: 'Governs' } })
  expect(made.statusCode, made.body).toBe(201)
})

afterAll(async () => {
  await app.close()
  t.close()
})

function aModule(title: string): string {
  return t.api.createRecord({ kind: 'module', title, data: { context: 'made up' }, workspaceId: workspace, actor: t.api.HUMAN }).id
}

function aDecision(title: string, extra: Record<string, unknown> = {}): string {
  return t.api.createRecord({
    kind: 'decision',
    title,
    data: { option_taken: title, because: 'A made-up reason.', ...extra },
    workspaceId: workspace,
    actor: t.api.HUMAN,
  }).id
}

/** Records made in one test land in one second; each is given its own minute, in the order named. */
function inThisOrder(...ids: string[]): void {
  ids.forEach((id, i) => {
    t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(`2026-10-01 10:${String(10 + i)}:00`, id)
  })
}


describe('the governs check lists only pairs that name one file', () => {
  it('1: two live decisions on one path are listed', () => {
    const older = aDecision('Test: the kiln file, first', { governs: [{ path: 'src/shared/paths.ts' }] })
    const newer = aDecision('Test: the kiln file, second', { governs: [{ path: 'src/shared/paths.ts' }] })
    inThisOrder(older, newer)

    const check = governs.theGovernsCheck(workspace)
    expect(check.overlapping.map((pair) => [pair.newer.id, pair.older.id, pair.both])).toEqual([
      [newer, older, 'path src/shared/paths.ts and path src/shared/paths.ts'],
    ])
    expect(check.sharingNoFile).toBe(0)
  })

  it('2: two live decisions on one module, each with its own path, are counted and not listed', () => {
    const website = aModule('Test: the website module')
    const older = aDecision('Test: the website, its header', { governs: [{ record: website }, { path: 'src/web/header.ts' }] })
    const newer = aDecision('Test: the website, its footer', { governs: [{ record: website }, { path: 'src/web/footer.ts' }] })
    const onlyTheModule = aDecision('Test: the website, as a whole', { governs: [{ record: website }] })
    inThisOrder(older, newer, onlyTheModule)

    const check = governs.theGovernsCheck(workspace)
    expect(check.overlapping, 'a pair that shares only a module is listed').toEqual([])
    // Three decisions on one module make three pairs, and each is counted once.
    expect(check.sharingNoFile).toBe(3)

    // The same two with one path in common are listed, and no longer counted.
    const sameFile = aDecision('Test: the website, its header again', { governs: [{ record: website }, { path: 'src/web/header.ts' }] })
    inThisOrder(older, newer, onlyTheModule, sameFile)
    const again = governs.theGovernsCheck(workspace)
    expect(again.overlapping.map((pair) => [pair.newer.id, pair.older.id])).toEqual([[sameFile, older]])
    expect(again.sharingNoFile).toBe(5)
  })

  it('3: an older decision that a newer one replaces is neither listed nor counted', () => {
    const website = aModule('Test: the website module')
    const older = aDecision('Test: the website, old rule', { governs: [{ record: website }, { path: 'src/web/header.ts' }] })
    const newer = aDecision('Test: the website, new rule', { governs: [{ record: website }, { path: 'src/web/header.ts' }], replaces: [older] })
    inThisOrder(older, newer)

    const check = governs.theGovernsCheck(workspace)
    expect(check.overlapping, 'a replaced decision is listed').toEqual([])
    expect(check.sharingNoFile, 'a replaced decision is counted').toBe(0)
  })

})
