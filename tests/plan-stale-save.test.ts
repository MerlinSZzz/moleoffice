// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TWO TABS ON ONE PLAN: THE SECOND SAVE IS REFUSED, NOT WRITTEN OVER THE FIRST.
 *
 * ---------------------------------------------------------------------------------------
 * THE FAILURE THIS PREVENTS
 * ---------------------------------------------------------------------------------------
 *
 * Two readers open one plan. One saves. The other saves its older copy, and the first person's
 * writing is gone with nothing said. This must be fixed before a human and an
 * agent can both edit one plan, and the fix is exactly this much: detect a stale write, refuse it,
 * and offer an understandable way to reload and compare. NO COLLABORATIVE EDITOR.
 *
 * Wave A gave the server the version token and the 409. THESE TESTS ARE ABOUT THE BROWSER USING IT,
 * because a precondition nobody sends protects nobody, and that failure is invisible: the page saves
 * happily, the tests pass, and the loss only ever happens to a person.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT EACH TEST HOLDS DOWN
 * ---------------------------------------------------------------------------------------
 *
 *   1. The browser sends the version it read. A save built on a replaced copy is answered 409.
 *   2. Nothing is written when it is. The other person's document is still there afterwards.
 *   3. Nothing the person typed is lost, and nothing of theirs is put in the box for them.
 *   4. THE AUTOSAVE STOPS. A refused save cannot succeed by being sent again — typing more does not
 *      change the copy it was built on — so retrying every 600ms would be a request that cannot
 *      succeed, on a loop. It waits for a person instead.
 *   5. The way out is read, compare, and then replace deliberately — and the replace REFUSES until
 *      the stored plan has actually been read, because replacing writing nobody has looked at is the
 *      silent overwrite with one button in front of it.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * The runner's environment is `node`, so `fetch` is pointed at a real Fastify app through
 * `app.inject` as tests/plans-pages.test.ts does it. The writing state is a real one: a component is
 * rendered once to get `usePlanWriting`'s own state object, and the presses are then called on it.
 * Its refs are what the saves read, so the requests these tests make are the requests the page makes.
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

const OPENED = ['# Week of 17 August', '', '- Build the controller'].join('\n')
const THEIRS = ['# Week of 17 August', '', '- Build the controller', '- Wire the sensor'].join('\n')
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
 * so calling `write` and `saveNow` on it sends exactly what the page sends. Its React state does not
 * move afterwards — nothing re-renders here — so these tests read the OUTCOMES the presses return
 * and the plan the server holds, never a rendered word.
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

// ============================================================ the version goes over the wire

describe('the browser sends the copy it read', () => {
  /**
   * THE WIRE ITSELF. A save carrying a version the plan has moved past is refused with 409 and
   * writes nothing. This is the assertion that fails if the browser's writer ever stops sending
   * `ifVersion` — the failure that is otherwise completely silent.
   */
  it('is answered 409 when the plan has moved, and writes nothing', async () => {
    const opened = await webApi.api.planBlocks(planId)
    await webApi.api.writePlanBody(planId, THEIRS, opened.version)
    expect(await storedNow()).toBe(THEIRS)

    let refused: unknown = null
    try {
      await webApi.api.writePlanBody(planId, MINE, opened.version)
    } catch (err) {
      refused = err
    }
    expect(refused).toBeInstanceOf(webApi.ApiError)
    expect((refused as InstanceType<typeof webApi.ApiError>).status).toBe(409)
    expect(await storedNow()).toBe(THEIRS)
  })

  /** And a save built on the copy the plan really holds goes through, so the check is not a wall. */
  it('lets a save through when nobody else has written', async () => {
    const opened = await webApi.api.planBlocks(planId)
    const written = await webApi.api.writePlanBody(planId, MINE, opened.version)
    expect(await storedNow()).toBe(MINE)
    // And it hands back the new token, so the next save has one without reading the plan again.
    expect(written.version).not.toBe(opened.version)
  })
})

// ============================================================ what the writing page does with it

describe('a save from a page that has been overtaken', () => {
  it('is refused, and the other person\'s writing is exactly as they left it', async () => {
    const opened = await webApi.api.planBlocks(planId)
    const page = openPage(opened)

    // Somebody else — another tab, or an agent — writes first.
    await webApi.api.writePlanBody(planId, THEIRS, opened.version)

    page.write(MINE)
    const done = await page.saveNow()

    expect(done.did).toBe('refused')
    // NOTHING WAS WRITTEN. The other person's document is exactly as they left it.
    expect(await storedNow()).toBe(THEIRS)
    // THAT THE TYPED CHARACTERS SURVIVED IS PROVED BY THE REPLACE TEST BELOW, which types before the
    // refusal and stores exactly those characters after it. It is not asserted here, because the
    // state object these tests hold was made by one render and its `body` has not been re-rendered
    // since — reading it would be reading the screen as it was before the person typed.
  })

  /**
   * THE AUTOSAVE STOPS, AND THAT IS THE DELIBERATE ANSWER.
   *
   * A refused save was built on a copy somebody has already replaced, and typing more does not
   * change that copy — so sending it again could only be refused again. Every 600ms. Forever.
   * `schedule` therefore sends nothing at all while a refusal stands, and this counts the requests
   * to prove it rather than reading a flag.
   */
  it('sends nothing more until a person decides', async () => {
    const opened = await webApi.api.planBlocks(planId)
    const page = openPage(opened)
    await webApi.api.writePlanBody(planId, THEIRS, opened.version)

    page.write(MINE)
    expect((await page.saveNow()).did).toBe('refused')
    const sentSoFar = bodyWrites

    // Typing again, and pressing Save again, and the timer that typing would arm: none of them sends.
    page.write(`${MINE}\n- and more`)
    expect((await page.saveNow()).did).toBe('refused')
    await new Promise((resolve) => setTimeout(resolve, 900))
    expect(bodyWrites).toBe(sentSoFar)
    expect(await storedNow()).toBe(THEIRS)
  })

  /**
   * REPLACING WRITING NOBODY HAS READ IS REFUSED. The press that writes over the other person's
   * plan does nothing until the stored plan has actually been fetched, because otherwise it is the
   * silent overwrite with one button in front of it.
   */
  it('will not replace the stored plan before it has been read', async () => {
    const opened = await webApi.api.planBlocks(planId)
    const page = openPage(opened)
    await webApi.api.writePlanBody(planId, THEIRS, opened.version)
    page.write(MINE)
    expect((await page.saveNow()).did).toBe('refused')

    const before = bodyWrites
    const done = await page.replaceStored()
    if (done.did !== 'refused') throw new Error(`the replacement was not refused: ${done.did}`)
    // IT IS THE PRESS THAT REFUSES, NOT THE SERVER. Nothing was sent at all, and the reason names
    // the missing step rather than repeating what the server said about a version. A test that only
    // read the plan afterwards would pass with this guard deleted, because the server would refuse
    // the stale save anyway — and the guard would be gone.
    expect(bodyWrites).toBe(before)
    expect(done.why).toContain('Read the stored plan first')
    expect(await storedNow()).toBe(THEIRS)
  })

  /**
   * AND THE WAY OUT WORKS: read what is stored, then replace it on purpose.
   *
   * The replacement is built on the copy that was just read, so it is a save against what is really
   * there rather than a save with the check switched off.
   *
   * IT IS ALSO THE PROOF THAT NOTHING THE PERSON TYPED WAS LOST. Those characters were typed before
   * the refusal, sat through it, and are what the plan holds at the end.
   */
  it('reads the stored plan and then replaces it when the person says so', async () => {
    const opened = await webApi.api.planBlocks(planId)
    const page = openPage(opened)
    await webApi.api.writePlanBody(planId, THEIRS, opened.version)
    page.write(MINE)
    expect((await page.saveNow()).did).toBe('refused')

    await page.readStored()
    const done = await page.replaceStored()
    expect(done.did).toBe('stored')
    expect(await storedNow()).toBe(MINE)
  })

  /**
   * A THIRD WRITE BETWEEN READING AND REPLACING IS REFUSED TOO. The replace is a save like any
   * other: it names the copy it was built on, so it cannot become a way past the check.
   */
  it('refuses the replacement when somebody writes again in between', async () => {
    const opened = await webApi.api.planBlocks(planId)
    const page = openPage(opened)
    await webApi.api.writePlanBody(planId, THEIRS, opened.version)
    page.write(MINE)
    expect((await page.saveNow()).did).toBe('refused')

    await page.readStored()
    const again = await webApi.api.planBlocks(planId)
    await webApi.api.writePlanBody(planId, `${THEIRS}\n- and a third thought`, again.version)

    const done = await page.replaceStored()
    expect(done.did).toBe('refused')
    expect(await storedNow()).toBe(`${THEIRS}\n- and a third thought`)
  })
})

// ============================================================ the plan moving is not always a clash

/**
 * A PLAN CAN MOVE WITHOUT ANYBODY WRITING A WORD, and that must not be drawn as somebody else
 * writing.
 *
 * The token names the title, the state and every line's words AND the record each line is filed as.
 * So pressing "Make it real work" in the table beside the writing box moves the token while leaving
 * every character of the document exactly where it was. The box's next save was built on the copy
 * from before that press.
 *
 * REFUSING THAT WOULD BE CRYING WOLF, and worse: the person would be shown a conflict with
 * themselves, on the same screen, for pressing the button that is there to be pressed. So a refused
 * save is looked at rather than believed — if the stored WORDS are still the ones this page last
 * saw, nobody's writing is at risk and the save goes again on the fresh token.
 */
describe('the plan moved but nobody wrote', () => {
  it('saves anyway when a line beside the box was filed as work', async () => {
    const opened = await webApi.api.planBlocks(planId)
    const page = openPage(opened)
    const line = opened.lines.find((entry) => entry.line.text === '- Build the controller')!

    // The table files that line. The document is not changed by one character; the line now names a
    // record, and the token has moved.
    const filed = await webApi.api.fileLineAsWork(planId, line.line.id, {
      kind: 'task',
      workspaceId: 'default',
    })
    const moved = await webApi.api.planBlocks(planId)
    expect(moved.version).not.toBe(opened.version)

    page.write(MINE)
    const done = await page.saveNow()
    expect(done.did).toBe('stored')
    expect(await storedNow()).toBe(MINE)

    // AND THE WORK IS STILL THERE. The line whose words did not change kept the record it was
    // filed as, so the retry took nothing away.
    const after = await webApi.api.planBlocks(planId)
    const still = after.lines.find((entry) => entry.line.text === '- Build the controller')!
    expect(still.line.recordId).toBe(filed.recordId)
  })
})

// ============================================================ lines that arrive without a token

/**
 * THE TABLE BESIDE THE WRITING WRITES TO THIS PLAN TOO, and it hands its re-read to the page.
 *
 * When it hands over lines WITHOUT the token that read came with, the page no longer knows which
 * copy it is writing on top of. It must not make one up and it must not save without one. It reads
 * the plan and compares what is stored against the words it last saw as stored: the same means
 * nothing has moved and the fresh token is the right one to write on, different means somebody else
 * wrote and that is a conflict.
 */
describe('a page that has been handed lines without a token', () => {
  it('saves once it has checked that nothing moved', async () => {
    const opened = await webApi.api.planBlocks(planId)
    const page = openPage(opened)

    const again = await webApi.api.planBlocks(planId)
    page.putSaved(again.lines)

    page.write(MINE)
    const done = await page.saveNow()
    expect(done.did).toBe('stored')
    expect(await storedNow()).toBe(MINE)
  })

  it('refuses when the plan moved after those lines were read', async () => {
    const opened = await webApi.api.planBlocks(planId)
    const page = openPage(opened)

    // The table read the plan and handed the lines over, with no token.
    const handedOver = await webApi.api.planBlocks(planId)
    page.putSaved(handedOver.lines)

    // And then somebody else wrote.
    await webApi.api.writePlanBody(planId, THEIRS, handedOver.version)

    page.write(MINE)
    const done = await page.saveNow()
    expect(done.did).toBe('refused')
    expect(await storedNow()).toBe(THEIRS)
  })
})

// ============================================================ the words a person reads

describe('what the page says when it is refused', () => {
  /**
   * PLAIN LANGUAGE, AND THE TWO FACTS A PERSON NEEDS FIRST: nothing was saved, and nothing was lost.
   * The sentence is the one the page really produces for a refusal.
   */
  it('says somebody wrote first, and that nothing was lost', async () => {
    const opened = await webApi.api.planBlocks(planId)
    const page = openPage(opened)
    await webApi.api.writePlanBody(planId, THEIRS, opened.version)
    page.write(MINE)
    const done = await page.saveNow()
    if (done.did !== 'refused') throw new Error(`the save was not refused: ${done.did}`)

    const said = writing.sayOfSave(done).words
    expect(said).toContain('Nothing was saved')
    expect(said).toContain('Somebody wrote in this plan')
    expect(said).toContain('Every character you typed is still here')
    // NO INTERNAL VOCABULARY. A person writing a plan is not told about tokens or HTTP.
    expect(said).not.toContain('ifVersion')
    expect(said).not.toContain('409')
    expect(said).not.toContain('GET /api')
  })

  /**
   * THE BANNER, AND THE WAY OUT ON IT.
   *
   * The state here is the page's own, from a real refusal: the sentence in it is the one the server
   * really wrote, and the refusal really happened a few lines above. Only the drawing is arranged by
   * hand, because this runner has no browser to re-render in.
   */
  it('offers a way to read what is stored, and no way to merge', async () => {
    const opened = await webApi.api.planBlocks(planId)
    const page = openPage(opened)
    await webApi.api.writePlanBody(planId, THEIRS, opened.version)
    page.write(MINE)
    const done = await page.saveNow()
    if (done.did !== 'refused') throw new Error(`the save was not refused: ${done.did}`)

    const shown: PlanWritingState = {
      ...page,
      saveState: 'conflict',
      conflict: { why: done.why, at: done.at, stored: null, readFailed: null },
    }
    const said = words(h(writing.PlanSaveBar, { state: shown }))
    expect(said).toContain('Somebody wrote in this plan first, so nothing was saved.')
    // CRITERION CHANGE, as decided: the banner no longer explains that the typing is still on the page.
    expect(said).toContain('Read what is stored now')
    // TWO WAYS TO GET THE WRITING OUT OF THE BROWSER ARE ON THE BANNER, because waiting is not a
    // plan when somebody else is writing in the same document.
    expect(said).toContain('Copy the whole plan')
    // AND THE PRESS THAT WRITES OVER THEIR WORK IS NOT OFFERED YET. It appears only under the stored
    // plan, once the stored plan is on screen, which is what stops it being a one-press overwrite.
    expect(said).not.toContain('Replace it with what is on this page')
  })

  /**
   * ONCE THE STORED PLAN HAS BEEN READ, both documents are on screen and the deliberate replacement
   * is offered — with what it costs said before it is pressed.
   */
  it('shows the stored plan and what replacing it would destroy', async () => {
    const opened = await webApi.api.planBlocks(planId)
    const page = openPage(opened)
    await webApi.api.writePlanBody(planId, THEIRS, opened.version)
    page.write(MINE)
    const done = await page.saveNow()
    if (done.did !== 'refused') throw new Error(`the save was not refused: ${done.did}`)

    const stored = await webApi.api.planBlocks(planId)
    const shown: PlanWritingState = {
      ...page,
      saveState: 'conflict',
      conflict: {
        why: done.why,
        at: done.at,
        stored: {
          body: stored.lines.map((entry) => entry.line.text).join('\n'),
          version: stored.version,
          at: done.at,
        },
        readFailed: null,
      },
    }
    const said = words(h(writing.PlanSaveBar, { state: shown }))
    expect(said).toContain('What is stored now')
    expect(said).toContain('- Wire the sensor')
    expect(said).toContain('Replace it with what is on this page')
    expect(said).toContain('What they wrote goes')
  })
})
