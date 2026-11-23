// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SPLIT VIEW MUST NOT DESTROY A TABLE EDIT, AND IT USED TO.
 *
 * ---------------------------------------------------------------------------------------
 * THE MEASUREMENT THIS FILE IS BUILT FROM
 * ---------------------------------------------------------------------------------------
 *
 * Open a plan in "Writing and table". Type into a cell of a row. Without pausing, click into the
 * writing box and type. Three seconds later the cell edit is gone from the screen, and it was never
 * written to the server. The status line said "Stored." and "Sent and accepted just now" the whole
 * time. Across five runs a 0ms gap lost it every time; 500ms and above kept it.
 *
 * WHY. The cell write lands, the table reads the plan back and hands the page the new words AND the
 * new token. A save is already owed by then, so the words are refused — correctly, the person's
 * typing is newer — and only the token is taken. Six hundred milliseconds later the box saves the
 * document it has been holding all along, built on a token naming a document it has never seen. The
 * server has no reason to refuse it.
 *
 * THE TWO-TAB GUARD CANNOT CATCH THIS. That guard compares tokens, and this page's token is the
 * freshest one there is. Only the WORDS are stale. That is the whole of the defect and the reason it
 * survived a mechanism built to prevent exactly this loss.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THESE TESTS HOLD DOWN
 * ---------------------------------------------------------------------------------------
 *
 *   1. The 0ms case, explicitly. The cell edit is still in the corpus afterwards and NOTHING was
 *      sent — counted as requests, not read off a flag.
 *   2. The page says so, in the words a person reads, and names the table rather than "somebody".
 *   3. Nothing the person typed was lost: it is still there to be stored deliberately afterwards.
 *   4. The good path is untouched. Words that arrive when nothing is owed are taken into the box,
 *      and the next save writes them.
 *   5. It does not cry wolf. Filing a line as work moves the plan without changing a character, and
 *      a save owed at that moment still goes through.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * The runner's environment is `node`, so `fetch` is pointed at a real Fastify app through
 * `app.inject`, as tests/plan-stale-save.test.ts does it. The writing state is a real one: a
 * component is rendered once to get `usePlanWriting`'s own state object, and the calls are then made
 * on it. Its refs are what the saves read, so the requests these tests make are the page's requests.
 * `putSaved` is called with exactly what `PlanTable` hands over — the lines and the token of one
 * read of the plan.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Fastify, { type FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import type { PlanBlocksReply } from '../src/web/api.ts'
import type { PlanWritingState } from '../src/web/pages/plans/PlanWriting.tsx'

type WebApi = typeof import('../src/web/api.ts')
type WritingModule = typeof import('../src/web/pages/plans/PlanWriting.tsx')

let db: TestDb
let app: FastifyInstance
let webApi: WebApi
let writing: WritingModule

let planId: string

const AS_HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

/** What the plan holds when the page opens it. */
const OPENED = ['# Week of 17 August', '', '- Build the controller'].join('\n')
/** The same plan after a cell in the table beside the box was edited. */
const AFTER_THE_CELL = ['# Week of 17 August', '', '- Build the controller by Friday'].join('\n')
/** What the writing box holds: the document it opened on, plus what was typed into it. */
const MINE = ['# Week of 17 August', '', '- Build the controller', '- Read the brief'].join('\n')

/** How many whole-document saves have been sent, so "nothing was sent" can be measured. */
let bodyWrites = 0

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
  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')

  app = Fastify()
  installErrorHandling(app)
  await app.register(planRoutes, { prefix: '/api' })
  await app.register(recordRoutes, { prefix: '/api' })
  await app.ready()

  ;(globalThis as unknown as { fetch: unknown }).fetch = async (
    input: unknown,
    init: { method?: string; headers?: HeadersInit; body?: string } = {},
  ) => {
    const method = init.method ?? 'GET'
    const url = String(input)
    if (method === 'PUT' && url.endsWith('/body')) bodyWrites += 1
    const res = await app.inject({
      method: method as 'GET',
      url,
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      ...(init.body === undefined ? {} : { payload: init.body }),
    })
    return {
      ok: res.statusCode >= 200 && res.statusCode < 300,
      status: res.statusCode,
      text: async () => res.body,
    }
  }

  webApi = await import('../src/web/api.ts')
  webApi.setActor({ ...AS_HUMAN })
  writing = await import('../src/web/pages/plans/PlanWriting.tsx')
})

afterAll(async () => {
  await app.close()
  db.close()
})

beforeEach(async () => {
  const written = await webApi.api.newPlan(`Plan ${Math.random()}`, OPENED)
  planId = written.plan.id
  bodyWrites = 0
})

/**
 * ONE PAGE OPENED ON ONE READ OF THE PLAN, with the writing state it really uses.
 *
 * The component is rendered once and hands its state out. That state's refs are what a save reads,
 * so calling `write`, `putSaved` and `saveNow` on it does what the page does. Its React state does
 * not move afterwards — nothing re-renders here — so these tests read the OUTCOMES the calls return
 * and the plan the server holds.
 */
let handed: PlanWritingState | null = null
function Probe({ reply }: { reply: PlanBlocksReply }) {
  handed = writing.usePlanWriting(reply.plan.id, reply.lines, reply.plan.title, reply.version)
  return null
}

function openPage(reply: PlanBlocksReply): PlanWritingState {
  handed = null
  renderToStaticMarkup(h(Probe, { reply }))
  if (handed === null) throw new Error('the writing state was never handed out')
  return handed
}

/** The words a reader sees, with the tags taken out, so an assertion is about the screen. */
function words(el: React.ReactElement): string {
  return renderToStaticMarkup(el)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The whole document as the server holds it now. */
async function storedNow(): Promise<string> {
  const reply = await webApi.api.planBlocks(planId)
  return reply.lines.map((entry) => entry.line.text).join('\n')
}

/**
 * THE TABLE EDITS ONE CELL AND READS THE PLAN BACK, which is exactly what `PlanTable` does: a
 * PATCH of one line, then one read of the whole plan handed to the page with its token.
 */
async function tableEditsACell(text: string): Promise<PlanBlocksReply> {
  const opened = await webApi.api.planBlocks(planId)
  const line = opened.lines.find((entry) => entry.line.text === '- Build the controller')
  if (line === undefined) throw new Error('the seeded plan has no line to edit')
  await webApi.api.saveLine(planId, line.line.id, { text }, null)
  return webApi.api.planBlocks(planId)
}

/** Long enough for the 600ms autosave to have run, if anything armed it. */
function afterTheAutosave(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 900))
}

// ============================================================ the 0ms case

describe('a cell edit and a keystroke with no pause between them', () => {
  /**
   * THE MEASUREMENT ITSELF. The gap is zero: the person is already typing in the box when the
   * table's read comes back.
   *
   * NOTHING IS SENT, and that is counted rather than believed. Asserting only on the stored plan
   * would pass with a save that was sent and refused by the server, which is a different product:
   * this page knows the words in its box are not the words the plan holds, and knowing that, it must
   * not send them.
   */
  it('keeps the cell edit, and sends nothing at all', async () => {
    const opened = await webApi.api.planBlocks(planId)
    const page = openPage(opened)

    const afterTable = await tableEditsACell('- Build the controller by Friday')
    expect(await storedNow()).toBe(AFTER_THE_CELL)

    // NO PAUSE. The keystroke lands before the table's read comes back, which is the whole case.
    page.write(MINE)
    page.putSaved(afterTable.lines, afterTable.version)

    await afterTheAutosave()

    expect(await storedNow()).toBe(AFTER_THE_CELL)
    expect(bodyWrites).toBe(0)
  })

  /**
   * AND THE PAGE SAYS SO, naming the table rather than "somebody".
   *
   * The person made both edits. Telling them somebody else wrote in their plan would be a conflict
   * with themselves, on one screen, for using the view the split exists for.
   */
  it('says the table changed a line while you were typing', async () => {
    const opened = await webApi.api.planBlocks(planId)
    const page = openPage(opened)
    const afterTable = await tableEditsACell('- Build the controller by Friday')

    page.write(MINE)
    page.putSaved(afterTable.lines, afterTable.version)

    const done = await page.saveNow()
    if (done.did !== 'refused') throw new Error(`the save was not refused: ${done.did}`)
    expect(done.cause).toBe('table')

    const said = writing.sayOfSave(done).words
    expect(said).toContain('Nothing was saved')
    expect(said).toContain('The table beside your writing changed a line while you were typing')
    expect(said).toContain('Every character you typed is still here')

    // AND THE PANEL LEADS WITH THE SAME FACT. The state is the page's own sentence from the refusal
    // that really happened above; only the drawing is arranged by hand, because this runner has no
    // browser to re-render in.
    const shown: PlanWritingState = {
      ...page,
      saveState: 'conflict',
      conflict: { why: done.why, cause: done.cause, at: done.at, stored: null, readFailed: null },
    }
    const panel = words(h(writing.PlanSaveBar, { state: shown }))
    expect(panel).toContain('The table beside your writing changed a line while you were typing, so nothing was saved.')
    // CRITERION CHANGE, as decided: the banner no longer explains that the typing is still on the page.
    expect(panel).toContain('Read what is stored now')
    expect(panel).not.toContain('Somebody wrote in this plan first')
  })

  /**
   * AND NOTHING THE PERSON TYPED WAS LOST EITHER.
   *
   * Both edits are real and Mole Office cannot say which one they meant, so it keeps both and lets them
   * choose. This is the choosing: read what is stored, then replace it on purpose. The characters
   * that come out at the end are the ones typed before the clash, which is the proof they survived
   * it.
   */
  it('still holds every character that was typed, ready to be stored on purpose', async () => {
    const opened = await webApi.api.planBlocks(planId)
    const page = openPage(opened)
    const afterTable = await tableEditsACell('- Build the controller by Friday')

    page.write(MINE)
    page.putSaved(afterTable.lines, afterTable.version)
    expect((await page.saveNow()).did).toBe('refused')

    await page.readStored()
    const done = await page.replaceStored()
    expect(done.did).toBe('stored')
    expect(await storedNow()).toBe(MINE)
  })
})

// ============================================================ the paths that must not change

describe('words that arrive when nothing is owed', () => {
  /**
   * THE 500ms CASE, WHICH ALWAYS WORKED AND STILL HAS TO. Nothing is owed when the table's read
   * arrives, so the box takes the words, and what is typed next is typed on top of them.
   */
  it('goes into the box, and the next save keeps the cell edit', async () => {
    const opened = await webApi.api.planBlocks(planId)
    const page = openPage(opened)
    const afterTable = await tableEditsACell('- Build the controller by Friday')

    page.putSaved(afterTable.lines, afterTable.version)
    const andMine = `${AFTER_THE_CELL}\n- Read the brief`
    page.write(andMine)

    const done = await page.saveNow()
    expect(done.did).toBe('stored')
    expect(await storedNow()).toBe(andMine)
  })
})

describe('the plan moving without one character changing', () => {
  /**
   * IT MUST NOT CRY WOLF. Filing a line as work moves the plan — the token names the record each
   * line points at — and changes no character of the document. A save owed at that moment is built
   * on words that are still exactly the stored ones, so nobody's writing is at risk and it goes.
   *
   * This is the case that a fix written as "any change from the table stops the save" would break,
   * and it would break it invisibly: the person would see a conflict panel for pressing the button
   * that is there to be pressed.
   */
  it('still saves what is in the box', async () => {
    const opened = await webApi.api.planBlocks(planId)
    const page = openPage(opened)
    const line = opened.lines.find((entry) => entry.line.text === '- Build the controller')
    if (line === undefined) throw new Error('the seeded plan has no line to file')

    await webApi.api.fileLineAsWork(planId, line.line.id, { kind: 'task', workspaceId: 'default' })
    const moved = await webApi.api.planBlocks(planId)
    expect(moved.version).not.toBe(opened.version)

    page.write(MINE)
    page.putSaved(moved.lines, moved.version)

    const done = await page.saveNow()
    expect(done.did).toBe('stored')
    expect(await storedNow()).toBe(MINE)
  })
})
