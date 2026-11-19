// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RECORD PAGE ASKS ONLY FOR WHAT IT DRAWS, AND DRAWS WHAT IT DREW BEFORE.
 *
 * It was chosen that a page asks only for what it draws, by option 2 of a
 * decision. A record page used to read every live record in the project and every
 * link to draw one record: 38 MB on the owner's office for one report. It now asks
 * `GET /api/records/:id/around` for the records and links it draws, and reads the pickers' titles
 * from `GET /api/records/title-options` only while the record is being edited.
 *
 * Three things are held here.
 *
 *   1. The page's own request group never asks for the whole listing or the whole link table, and
 *      asks for the pickers' titles only while editing.
 *   2. What the page draws does not change. For every record of a small project that exercises each
 *      rule of `recordsAround`, the record's body is drawn once from the whole listing and the whole
 *      link table (the old way) and once from what the page now reads, and the two drawings must be
 *      the same, reading and editing. The two things the page works out outside the body — the fork
 *      a decision answers, and what the settling decision stored — are compared the same way.
 *   3. The answer leaves out what the page does not draw.
 *
 * The page's requests go to the product's own server through `app.inject`, so the loader under test
 * is the one the browser runs, reading the doors the server really serves.
 */

import type { FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, settleLinkBypassingTheGate, type TestDb } from './helpers.ts'
import { titleOptions } from '../src/shared/blocks.ts'
import type { PanelRecord } from '../src/shared/types.ts'

type Page = typeof import('../src/web/pages/RecordPage.tsx')

/** Each case works in its own project, so the whole listing it compares against holds only its records. */
let PROJECT = 'default'
const PERSON = { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true } as const
const HEADERS: Record<string, string> = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': PROJECT,
}

let t: TestDb
let app: FastifyInstance
let page: Page
/** Every path the page's requests asked for, in order. */
let asked: string[]
let caseNumber = 0
let workspaces: typeof import('../src/server/lib/workspaces.ts')
const realFetch = globalThis.fetch

beforeAll(async () => {
  t = await freshDb()
  // The app's own module instance, imported after `freshDb` resets the module registry.
  workspaces = await import('../src/server/lib/workspaces.ts')
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  globalThis.fetch = realFetch
  await app.close()
  t.close()
})

beforeEach(async () => {
  caseNumber += 1
  PROJECT = `page-case-${String(caseNumber)}`
  workspaces.createWorkspace({ id: PROJECT, title: `Record page case ${String(caseNumber)}` })
  HEADERS['x-mole-office-workspace'] = PROJECT
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  asked = []
  // THE BROWSER'S fetch, ANSWERED BY THE PRODUCT'S OWN SERVER. The path is what the page asked; the
  // headers are the person's, in this test's project.
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    asked.push(url)
    const res = await app.inject({
      method: (init?.method ?? 'GET') as 'GET',
      url,
      headers: HEADERS,
      ...(init?.body === undefined ? {} : { payload: init.body as string }),
    })
    return new Response(res.body, { status: res.statusCode, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  page = (await import('../src/web/pages/RecordPage.tsx')) as Page
})

/** A record of this project, filed by the person. */
function file(kind: string, title: string, data: Record<string, unknown> = {}): string {
  return t.api.createRecord({
    workspaceId: PROJECT,
    kind: kind as PanelRecord['kind'],
    title,
    summary: `${title}, for the test.`,
    data,
    actor: PERSON,
  }).id
}

function join(fromId: string, toId: string, type: 'relates_to' | 'part_of' | 'supersedes'): string {
  return t.api.createLink({ fromId, toId, type, actor: PERSON }).id
}

/**
 * A small project where every rule of `recordsAround` has something to find, and something it
 * must leave out.
 */
function aProject() {
  // Rule 5: a module, the directions its drawing walks, one it only counts, a claim off a direction,
  // and a note that supersedes one.
  const module = file('module', 'The gripper')
  const d1 = file('direction', 'Softer fingers', { depth: 'read', depth_reason: 'Written down only.' })
  const d2 = file('direction', 'Two-stage grip', { depth: 'read', depth_reason: 'Written down only.' })
  const d3 = file('direction', 'A direction nothing links to', { depth: 'read', depth_reason: 'Written down only.' })
  const claim = file('claim', 'Softer fingers hold the tray')
  const replaces = file('note', 'This replaces the two-stage grip')
  join(module, d1, 'relates_to')
  join(d1, d2, 'relates_to')
  join(claim, d1, 'relates_to')
  join(replaces, d2, 'supersedes')

  // Rules 1 and 4: a task that is part of another, and a block a pipeline lists.
  const parent = file('task', 'Build the gripper')
  const task = file('task', 'Cut the fingers')
  join(task, parent, 'part_of')
  const pipeline = file('pipeline', 'Tray line')
  const { block } = t.blocks.addBlock(pipeline, { name: 'Calibrate', state: 'todo' }, PERSON)

  // A linked record that has since been deleted: its link is drawn broken, and it is not a record.
  const gone = file('note', 'A note somebody deleted')
  join(task, gone, 'relates_to')
  t.api.deleteRecord(gone, PERSON)

  // Rule 2: an obligation owed on another record.
  const bench = file('note', 'The reprint is on the bench')
  const owed = file('obligation', 'Hand the tray back', { due: { recordId: bench }, owedTo: 'the lab' })

  // Rule 1 again: a fork and the decision that settled it.
  const fork = file('proposal', 'Which grip?', { question: 'Which grip?', options: ['a — softer', 'b — two-stage'] })
  const decided = file('decision', 'Softer fingers it is', { because: 'It held the tray.' })
  const settled = settleLinkBypassingTheGate(t, { fromId: decided, toId: fork, actorType: 'human', actorId: THE_TEST_OFFICES_OWNER.id })
  // THE HELPER WRITES ITS ROW IN THE DEFAULT PROJECT, because it predates this case's project. The
  // link row and its change row are moved here so the page's per-project reading sees them.
  t.client.sqlite.prepare('UPDATE links SET workspace_id = ? WHERE id = ?').run(PROJECT, settled)
  t.client.sqlite
    .prepare("UPDATE changes SET workspace_id = ? WHERE record_id = ? AND op = 'link' AND field = 'derived_from' AND new_value = ?")
    .run(PROJECT, decided, fork)

  // Rule 3: a record the change log names after the link to it was removed.
  const once = file('note', 'A note this one was once joined to')
  const logged = file('note', 'A note with a link it took back')
  const linkId = join(logged, once, 'relates_to')
  t.api.deleteLink(linkId, PERSON, PROJECT)

  // Rule 6: a role card, and the record that is a chapter of the regulations: a module with a number at
  // extra.chapter, the one definition (A_CHAPTER in src/shared/office-rules.ts). A note carrying the same
  // number is not a chapter, and the card's neighbourhood leaves it out.
  const chapter = file('module', 'Chapter 5: tests and gates', { extra: { chapter: 5 } })
  const notAChapter = file('note', 'A note that only carries a chapter number', { extra: { chapter: 5 } })
  const card = file('role_card', 'The worker role card', {
    roleName: 'worker',
    card: { name: 'worker', rung: null, duties: 'Does the work.', mustRead: { chapters: [{ chapter: 5, level: 'whole' }] } },
    copiedFrom: 'design/permissions/roles.json',
    copiedAt: '2026-09-06 16:00:00',
  })

  // Nothing links to this, names it, or counts it. No page above reads it.
  const unrelated = file('note', 'A note no page here reads')

  return {
    module, d1, d2, d3, claim, replaces, parent, task, pipeline, block: block.id, gone, bench, owed,
    fork, decided, once, logged, chapter, notAChapter, card, unrelated,
  }
}

async function read<T>(url: string): Promise<T> {
  const res = await app.inject({ method: 'GET', url, headers: HEADERS })
  expect(res.statusCode, `${url}: ${res.body}`).toBe(200)
  return res.json() as T
}

describe('the page asks the server only for what it draws', () => {
  it('never asks for the whole record listing or the whole link table', async () => {
    const ids = aProject()
    await page.loadRecordPage(ids.module, false)
    const paths = asked.map((url) => url.split('?')[0])
    expect(paths).toContain(`/api/records/${ids.module}/around`)
    expect(paths).not.toContain('/api/records')
    expect(paths).not.toContain('/api/links')
    expect(paths).not.toContain('/api/records/title-options')
  })

  it('asks for the pickers\' titles while editing, and draws them as the whole listing would', async () => {
    const ids = aProject()
    const data = await page.loadRecordPage(ids.owed, true)
    expect(asked.map((url) => url.split('?')[0])).toContain('/api/records/title-options')
    expect(asked.map((url) => url.split('?')[0])).not.toContain('/api/records')
    const listing = (await read<{ records: PanelRecord[] }>('/api/records?shape=full')).records
    expect(data.titles).toEqual(titleOptions(listing))
    // The box that names a record by its title offers what it offered from the whole listing.
    expect(page.pickFrom(data.titles)).toEqual(listing.map((r) => ({ id: r.id, title: r.title })))
  })
})

describe('what the page draws does not change', () => {
  it('draws every record of the project the same from its own reply as from the whole listing', async () => {
    const ids = aProject()
    const listing = (await read<{ records: PanelRecord[] }>('/api/records?shape=full')).records
    const allLinks = (await read<{ links: unknown[] }>('/api/links')).links
    const whole = page.drawnFrom(listing)
    const options = titleOptions(listing)
    const checked: string[] = []

    for (const id of Object.values(ids)) {
      const data = await page.loadRecordPage(id, true)
      const detail = data.detail
      const props = (records: PanelRecord[], links: unknown[], drawn: ReturnType<Page['drawnFrom']>, editable: boolean) => ({
        record: detail.record,
        editable: editable && detail.record.deletedAt === null,
        deleted: detail.record.deletedAt !== null,
        records,
        detailLinks: detail.links,
        relations: detail.links.map((l) => l.label),
        evolutionLinks: links,
        log: data.log,
        titles: editable ? options : null,
        titleById: drawn.titleById,
        unfilledByRecord: drawn.unfilledByRecord,
        body: page.bodySections(detail.record),
        onChanged: () => {},
      })
      for (const editable of [false, true]) {
        const before = renderToStaticMarkup(
          h(page.RecordDetail, props(listing, allLinks, whole, editable) as Parameters<Page['RecordDetail']>[0]),
        )
        const now = renderToStaticMarkup(
          h(page.RecordDetail, props(data.records, [...data.links], data, editable) as Parameters<Page['RecordDetail']>[0]),
        )
        expect(now, `${detail.record.kind} ${detail.record.title}, ${editable ? 'editing' : 'reading'}`).toBe(before)
      }
      const links = detail.links as Parameters<Page['theForkThisAnswers']>[0]
      expect(page.theForkThisAnswers(links, data.records)).toEqual(page.theForkThisAnswers(links, listing))
      for (const by of detail.resolution?.by ?? []) {
        expect(data.records.find((r) => r.id === by.id)?.data).toEqual(listing.find((r) => r.id === by.id)?.data)
      }
      checked.push(detail.record.kind)
    }
    expect(checked.length).toBe(Object.keys(ids).length)
  })

  it('finds what each rule is there for', async () => {
    const ids = aProject()
    const around = async (id: string) => (await page.loadRecordPage(id, false)).records.map((r) => r.id)
    // Rule 5: every direction, the claim off one, and the note that supersedes one.
    expect(await around(ids.module)).toEqual(expect.arrayContaining([ids.d1, ids.d2, ids.d3, ids.claim, ids.replaces]))
    // Rule 1: what a part-of link says holds it. Rule 4: the pipeline that lists a block.
    expect(await around(ids.task)).toContain(ids.parent)
    expect(await around(ids.block)).toContain(ids.pipeline)
    // Rule 2: the record an obligation is owed on.
    expect(await around(ids.owed)).toContain(ids.bench)
    // Rule 1: the fork a decision answers, and the decision that settled a fork.
    expect(await around(ids.decided)).toContain(ids.fork)
    expect(await around(ids.fork)).toContain(ids.decided)
    // Rule 3: a record only the change log still names.
    expect(await around(ids.logged)).toContain(ids.once)
    // Rule 6: the chapter a role card asks to be read, and not a note that only carries its number.
    expect(await around(ids.card)).toContain(ids.chapter)
    expect(await around(ids.card)).not.toContain(ids.notAChapter)
  })
})

describe('the answer leaves out what the page does not draw', () => {
  it('holds no record the page does not read, and no deleted record', async () => {
    const ids = aProject()
    const onTask = (await page.loadRecordPage(ids.task, false)).records.map((r) => r.id)
    expect(onTask).not.toContain(ids.unrelated)
    expect(onTask).not.toContain(ids.gone)
    expect(onTask).not.toContain(ids.module)
    const onModule = (await page.loadRecordPage(ids.module, false)).records.map((r) => r.id)
    expect(onModule).not.toContain(ids.unrelated)
    expect(onModule).not.toContain(ids.task)
  })

  it('answers the record of another project as not found here', async () => {
    const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
    createWorkspace({ id: 'robotics', title: 'Robotics' })
    const elsewhere = t.api.createRecord({
      workspaceId: 'robotics',
      kind: 'note',
      title: 'A note in another project',
      data: {},
      actor: PERSON,
    }).id
    const res = await app.inject({ method: 'GET', url: `/api/records/${elsewhere}/around`, headers: HEADERS })
    expect(res.statusCode).toBe(404)
  })
})
