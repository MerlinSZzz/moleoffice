// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Reading every link at once: GET /api/links, and the `allGatedLinks` under it.
 *
 * WHY THIS ROUTE EXISTS AT ALL, because that is what these tests are checking is still true. Until
 * it did, the only way to read a link was `GET /api/records/:id`, so a page that wanted the link
 * graph asked for one record at a time. The pipeline page created one `fetch` per structural record
 * in a single tick and Chromium refused everything past about 1,356 of them — in the browser,
 * before any server heard the request. tests/graph-scale.test.ts holds the count; this file holds
 * what the one reply has to CONTAIN for that count to be honest.
 *
 * The three things it has to contain, and each is a way the old per-record path could not go wrong
 * and this one can:
 *
 *   1. every stored link, exactly once — the per-record path saw a link twice, once from each end,
 *      and deduplicated; this one has no second copy to lose a link behind
 *   2. the gate, read through the same reader the record page uses
 *   3. a link with a deleted or missing end, MARKED and not dropped — the difference between a
 *      record that was deleted and a record that was never connected is the whole of rule 5
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { PanelRecord } from '@shared/types.ts'
import { gateLabel } from '@shared/work.ts'

let t: TestDb
let app: FastifyInstance

/**
 * THE DOOR ANSWERS FOR THE WHOLE OFFICE, so a case in the block below reads it whole and then takes
 * the links that were not there when the case began. That keeps the every-project reading
 * every-project, and what a case asserts is still only its own rows. The empty case has a block of
 * its own with its own office, because no shared office can be empty.
 */
let linkIdsAtTheStart = new Set<string>()

const make = (kind: PanelRecord['kind'], title: string) => t.api.createRecord({ workspaceId: 'default', kind, title, actor: t.api.HUMAN })

/** The whole reply, as a caller gets it, with nothing left out. */
async function readEveryLink(): Promise<Array<Record<string, unknown>>> {
  const res = await app.inject({ method: 'GET', url: '/api/links' })
  expect(res.statusCode).toBe(200)
  return (res.json() as { links: Array<Record<string, unknown>> }).links
}

/** The reply, narrowed to the links this case added. */
async function readLinks(): Promise<Array<Record<string, unknown>>> {
  return (await readEveryLink()).filter((link) => !linkIdsAtTheStart.has(String(link.id)))
}

describe('GET /api/links', () => {
  beforeAll(async () => {
    // One database for this block, and the app built on top of it: the error handler lives inside
    // the builder, so a route refusal read through a bare Fastify would be Fastify's answer and not
    // Mole Office's.
    t = await freshDb()
    app = (await apiApp()).app
    await app.ready()
  }, 60_000)

  afterAll(async () => {
    await app.close()
    t.close()
  })

  beforeEach(() => {
    linkIdsAtTheStart = new Set(
      (t.client.sqlite.prepare('SELECT id FROM links').all() as { id: string }[]).map((row) => row.id),
    )
  })

  it('answers with every stored link exactly once, both ends named by id', async () => {
    const storedWhenItBegan = linkIdsAtTheStart.size
    const twin = make('module', 'Digital twin')
    const egm = make('module', 'EGM bridge')
    const gripper = make('module', 'Tray clamp')
    t.api.createLink({ fromId: twin.id, toId: egm.id, type: 'consumes', actor: t.api.HUMAN })
    t.api.createLink({ fromId: gripper.id, toId: egm.id, type: 'blocks', actor: t.api.HUMAN })

    // THE WHOLE REPLY, not only this case's rows: it carries every link the office holds, which is
    // the number that were there when the case began plus the two it just made.
    const all = await readEveryLink()
    expect(all).toHaveLength(storedWhenItBegan + 2)
    // Once each, keyed on the stored row's own id. Reading link-by-record produced each link twice
    // and needed a deduplication step to get back to one.
    expect(new Set(all.map((l) => l.id)).size).toBe(all.length)

    const links = await readLinks()
    expect(links).toHaveLength(2)
    expect(new Set(links.map((l) => l.id)).size).toBe(2)
    expect(links.map((l) => [l.fromId, l.toId, l.type])).toEqual(
      expect.arrayContaining([
        [twin.id, egm.id, 'consumes'],
        [gripper.id, egm.id, 'blocks'],
      ]),
    )
  })

  it('carries the gate, in the words the record page prints', async () => {
    const a = make('module', 'Twin validation')
    const b = make('module', 'Arm')
    t.api.createLink({
      fromId: b.id,
      toId: a.id,
      type: 'blocks',
      actor: t.api.HUMAN,
      gate: { kind: 'partial', upTo: 'built and checked' },
    })

    const [link] = await readLinks()

    expect(link?.gate).toEqual({ kind: 'partial', upTo: 'built and checked' })
    // The label is not spelled out here: it is asked of the same function every screen asks, so
    // rewording a gate cannot leave this file passing while the pages read differently.
    expect(link?.gateLabel).toBe(gateLabel({ kind: 'partial', upTo: 'built and checked' }))
    expect(link?.gateProblem).toBeNull()
  })

  it('says a `blocks` link with no gate has none, rather than filling in "hard"', async () => {
    const a = make('module', 'A')
    const b = make('module', 'B')
    t.api.createLink({ fromId: a.id, toId: b.id, type: 'blocks', actor: t.api.HUMAN })

    const [link] = await readLinks()

    expect(link?.gate).toBeNull()
    expect(link?.gateLabel).toBeNull()
    // Nobody said how much it blocks. That is what every link written before gates existed holds.
    expect(link?.gateProblem).toBeNull()
  })

  it('reports a gate nothing could have written through the API instead of hiding the row', async () => {
    const a = make('module', 'A')
    const b = make('module', 'B')
    const link = t.api.createLink({ fromId: a.id, toId: b.id, type: 'blocks', actor: t.api.HUMAN })
    // Hand-edited, which is the only way this value can arrive. The route has to say so rather
    // than reading an unknown word as one of the two it knows.
    t.client.sqlite.prepare('UPDATE links SET gate = ? WHERE id = ?').run('soft', link.id)

    const [read] = await readLinks()

    expect(read?.gate).toBeNull()
    expect(String(read?.gateProblem)).toContain('soft')
    expect(String(read?.gateProblem)).toContain('edited by hand')
  })

  it('returns a link whose far end was deleted, marked broken', async () => {
    const kept = make('module', 'Kept')
    const gone = make('module', 'Gone')
    t.api.createLink({ fromId: kept.id, toId: gone.id, type: 'relates_to', actor: t.api.HUMAN })

    expect((await readLinks())[0]?.broken).toBe(false)

    t.api.deleteRecord(gone.id, t.api.HUMAN)

    const after = await readLinks()
    // NOT dropped. A link that vanished would make a deleted record look like a record that was
    // never connected to anything, and those are different facts about the workspace.
    expect(after).toHaveLength(1)
    expect(after[0]?.broken).toBe(true)

    t.api.restoreRecord(gone.id, t.api.HUMAN)
    expect((await readLinks())[0]?.broken).toBe(false)
  })

  it('agrees with the per-record reading about every link on every record', async () => {
    // The two readers are separate code. This is the test that fails if they drift: for each
    // record, the links the record page would show and the links the bulk read carries are the
    // same set of stored rows, with the same types and the same gates.
    const twin = make('module', 'Digital twin')
    const egm = make('module', 'EGM bridge')
    const gripper = make('module', 'Tray clamp')
    t.api.createLink({ fromId: twin.id, toId: egm.id, type: 'consumes', actor: t.api.HUMAN })
    t.api.createLink({ fromId: gripper.id, toId: twin.id, type: 'blocks', actor: t.api.HUMAN, gate: { kind: 'hard' } })
    t.api.createLink({ fromId: gripper.id, toId: egm.id, type: 'relates_to', actor: t.api.HUMAN })

    const bulk = new Map((await readLinks()).map((l) => [String(l.id), l]))

    for (const record of [twin, egm, gripper]) {
      for (const resolved of t.api.resolveLinks(record.id)) {
        const row = bulk.get(resolved.linkId)
        expect(row, `${resolved.linkId} is on ${record.title} and not in GET /api/links`).toBeDefined()
        expect(row?.type).toBe(resolved.type)
        expect(row?.gate ?? null).toEqual(resolved.gate)
        expect(row?.gateLabel ?? null).toBe(resolved.gateLabel)
        // The ends: whichever way round the record page showed it, the stored direction is one way.
        const near = resolved.isBacklink ? resolved.other.id : record.id
        const far = resolved.isBacklink ? record.id : resolved.other.id
        expect([row?.fromId, row?.toId]).toEqual([near, far])
      }
    }
    // And nothing in the bulk read that no record knows about.
    const perRecord = new Set(
      [twin, egm, gripper].flatMap((r) => t.api.resolveLinks(r.id).map((l) => l.linkId)),
    )
    expect([...bulk.keys()].sort()).toEqual([...perRecord].sort())
  })

  it('is listed on GET /api with a description, like every other endpoint', async () => {
    const res = await app.inject({ method: 'GET', url: '/api' })
    const listed = (res.json() as { endpoints: Array<{ method: string; path: string; description: string | null }> })
      .endpoints.find((e) => e.method === 'GET' && e.path === '/api/links')
    expect(listed).toBeDefined()
    expect(listed?.description).not.toBeNull()
    // The one thing a caller cannot guess: a link with a missing end is returned, not omitted.
    expect(String(listed?.description)).toContain('broken')
  })
})

/**
 * AN OFFICE WITH NOTHING LINKED YET, which the block above can never be. It has its own database and
 * its own server, so the door is read whole and the answer must be empty rather than an error.
 */
describe('an office where nothing is linked yet', () => {
  beforeAll(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    await app.ready()
  }, 60_000)

  afterAll(async () => {
    await app.close()
    t.close()
  })

  it('is empty, and is not an error, in a workspace where nothing is linked yet', async () => {
    make('module', 'Tray clamp')
    expect(await readEveryLink()).toEqual([])
  })
})
