// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PLAN'S NAME AND ITS TABLE CELLS ARE SAVED ON THE COPY THE PAGE READ, NOT OVER A NEWER ONE (problem GR4LcaNI-XZk).
 *
 * The writing box already sent its version. The name, a table cell and a line added from the table did not, so two
 * tabs on one plan still overwrote each other there with nothing said. These tests are about the browser's own code
 * sending the version and deciding what a refusal means.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. Tab B renames the plan. Tab A then saves another name: nothing is written, the save says the name is not
 *      stored, and B's name stays. Keeping A's name on purpose then writes it.
 *   2. Tab B writes lines and not the name. Tab A then renames: the rename goes through and B's lines stay. A change to
 *      another part of the plan is not a conflict about the name.
 *   3. Tab B changes a line. A table cell in tab A, built on the older copy, is refused with the table's sentence, and
 *      B's line stays.
 *   4. Two cell writes one after the other on one copy both go through. The second is built on the first one's result.
 *   5. After tab B writes lines, tab A reads the plan again without taking the words (as it does after pointing a line
 *      at work). A's next save of its older words is refused, not written over B's.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the commit that added this file names the logs)
 * ---------------------------------------------------------------------------------------
 *
 *   a. `savePlan` in src/web/api.ts sending no version: case 1 goes red.
 *   b. `putName` never comparing the stored name (`looked.title !== saw` made false): case 1 goes red.
 *   c. `storeOneLine` sending no version: case 3 goes red.
 *   d. `storeOneLine` not keeping the version a write handed back: case 4 goes red.
 *   e. `refreshSaved` keeping the version it read whatever the words: case 5 goes red.
 *
 * The runner's environment is `node`, so `fetch` is pointed at a real Fastify app through `app.inject`, as
 * tests/plan-stale-save.test.ts does it. The writing state is a real one, handed out by a component rendered once.
 */

import Fastify, { type FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import type { PlanBlocksReply } from '../src/web/api.ts'
import type { PlanWritingState } from '../src/web/pages/plans/PlanWriting.tsx'
import type { ItemActs } from '../src/web/components/plans/planitems.tsx'
import { en } from '../src/shared/words/en.ts'

type WebApi = typeof import('../src/web/api.ts')
type WritingModule = typeof import('../src/web/pages/plans/PlanWriting.tsx')
type ItemsModule = typeof import('../src/web/components/plans/planitems.tsx')

let db: TestDb
let app: FastifyInstance
let webApi: WebApi
let writing: WritingModule
let planItems: ItemsModule
let planId: string

const OPENED = ['# Week of the test', '', '- Build the harness', '- Read the brief'].join('\n')

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
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  db = await freshDb()
  const { planRoutes } = await import('../src/server/api/plans.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  app = Fastify()
  installErrorHandling(app)
  await app.register(planRoutes, { prefix: '/api' })
  await app.ready()
  ;(globalThis as unknown as { fetch: unknown }).fetch = async (
    input: unknown,
    init: { method?: string; headers?: HeadersInit; body?: string } = {},
  ) => {
    const res = await app.inject({
      method: (init.method ?? 'GET') as 'GET',
      url: String(input),
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      ...(init.body === undefined ? {} : { payload: init.body }),
    })
    return { ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: async () => res.body }
  }
  webApi = await import('../src/web/api.ts')
  webApi.setActor({ type: 'human', id: 'test-rowan' })
  writing = await import('../src/web/pages/plans/PlanWriting.tsx')
  planItems = await import('../src/web/components/plans/planitems.tsx')
})

afterAll(async () => {
  await app.close()
  db.close()
})

beforeEach(async () => {
  planId = (await webApi.api.newPlan('Week of the test', OPENED)).plan.id
})

let handed: PlanWritingState | null = null
function Probe({ reply }: { reply: PlanBlocksReply }) {
  handed = writing.usePlanWriting(reply.plan.id, reply.lines, reply.plan.title, reply.version)
  return null
}

/** One page opened on one read of the plan, with the writing state it really uses. */
function openPage(reply: PlanBlocksReply): PlanWritingState {
  handed = null
  renderToStaticMarkup(h(Probe, { reply }))
  if (handed === null) throw new Error('the writing state was never handed out')
  return handed
}

/** The other tab: it reads the plan, and writes on the copy it read. */
async function theOtherTab() {
  const read = await webApi.api.planBlocks(planId)
  return {
    rename: (title: string) => webApi.api.savePlan(planId, { title }, read.version),
    write: (body: string) => webApi.api.writePlanBody(planId, body, read.version),
  }
}

/** What a table cell is handed on a page that read the plan at `version`. */
function actsOn(version: string): ItemActs {
  return {
    planId,
    reload: async () => {},
    behind: false,
    workList: null,
    today: null,
    versionToWriteOn: async () => ({ ok: true, version }),
  }
}

/** The table's item for the line written as `text`. */
function itemWritten(reply: PlanBlocksReply, text: string) {
  const found = planItems.planItemsOf(reply.lines).items.find((one) => one.entry.line.text === text)
  if (found === undefined) throw new Error(`no item is written as ${text}`)
  return found
}

async function stored(): Promise<{ title: string; lines: string[] }> {
  const reply = await webApi.api.planBlocks(planId)
  return { title: reply.plan.title, lines: reply.lines.map((entry) => entry.line.text) }
}

describe('the name', () => {
  it('1: a rename built on an older copy is refused when somebody renamed the plan, and kept on purpose after', async () => {
    const page = openPage(await webApi.api.planBlocks(planId))
    await (await theOtherTab()).rename('Week of the test, renamed elsewhere')

    page.writeName('My own name for it')
    const done = await page.saveNow()
    expect(done.did, 'the save of the name').toBe('failed')
    expect(done.did === 'failed' ? done.what : null).toBe('the name')
    expect((await stored()).title, 'the other tab\'s name').toBe('Week of the test, renamed elsewhere')

    const kept = await page.keepMyName('Week of the test, renamed elsewhere')
    expect(kept.did, 'keeping the name on purpose').toBe('stored')
    expect((await stored()).title).toBe('My own name for it')
  })

  it('2: a rename goes through when only the lines moved, and the lines stay', async () => {
    const page = openPage(await webApi.api.planBlocks(planId))
    const theirs = `${OPENED}\n- Wire the sensor`
    await (await theOtherTab()).write(theirs)

    page.writeName('My own name for it')
    const done = await page.saveNow()
    expect(done.did, 'the save of the name').toBe('stored')
    expect(await stored()).toEqual({ title: 'My own name for it', lines: theirs.split('\n') })
  })
})

describe('the table', () => {
  it('3: a cell built on an older copy is refused with the table\'s sentence, and the other tab\'s line stays', async () => {
    const opened = await webApi.api.planBlocks(planId)
    const item = itemWritten(opened, '- Build the harness')
    const theirs = OPENED.replace('- Build the harness', '- Build the harness twice')
    await (await theOtherTab()).write(theirs)

    const done = await planItems.storeOneLine(actsOn(opened.version), item.entry.line.id, item.entry.line.text, (base) => ({
      text: `${base} {size: 2h}`,
    }))
    expect(done).toEqual({ ok: false, why: en['planStores.lineRefused'] })
    expect((await stored()).lines).toEqual(theirs.split('\n'))
  })

  it('4: two cell writes one after the other on one copy both go through', async () => {
    const opened = await webApi.api.planBlocks(planId)
    const first = itemWritten(opened, '- Build the harness')
    const second = itemWritten(opened, '- Read the brief')
    const acts = actsOn(opened.version)
    const one = planItems.storeOneLine(acts, first!.entry.line.id, first!.entry.line.text, (base) => ({ text: `${base} {size: 2h}` }))
    const two = planItems.storeOneLine(acts, second!.entry.line.id, second!.entry.line.text, (base) => ({ text: `${base} {size: 1h}` }))
    expect(await one).toEqual({ ok: true })
    expect(await two).toEqual({ ok: true })
    expect((await stored()).lines).toEqual(['# Week of the test', '', '- Build the harness {size: 2h}', '- Read the brief {size: 1h}'])
  })
})

describe('reading the plan again without taking the words', () => {
  it('5: the next save of the older words is refused, not written over the other tab\'s', async () => {
    const page = openPage(await webApi.api.planBlocks(planId))
    const theirs = `${OPENED}\n- Wire the sensor`
    await (await theOtherTab()).write(theirs)

    await page.refreshSaved()
    page.write(`${OPENED}\n- Mine, typed after`)
    const done = await page.saveNow()
    expect(done.did, 'the save of the older words').toBe('refused')
    expect((await stored()).lines).toEqual(theirs.split('\n'))
  })
})
