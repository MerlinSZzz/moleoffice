// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WRITING IS THE SAME PLAN AS THE TABLE, AND IT STOPS NARRATING STORAGE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE OWNER MEASURED, AND WHAT THESE TESTS HOLD
 * ---------------------------------------------------------------------------------------
 *
 * The owner used round five themselves on 16 August 2026 and rejected the writing surface twice over.
 *
 * ONE. The panel under the box spent 176 words saying very little: one sentence — "You wrote this
 * and nothing has been scheduled from it. It is kept exactly as you wrote it, it adds nothing to any
 * week and it uses no capacity." — was drawn once per value, and three sentences about where the one
 * stored copy lives were drawn once per value beside them. Normal mode must not keep
 * defending database semantics to an engineer. And the same kept phrase was listed TWICE, character
 * for character, with nothing to tell the two apart, so the owner could not tell whether they had written it
 * once or twice.
 *
 * TWO. A line can carry a size, a when, a project and a note in its own words — `{size: 15h}` — and
 * nothing on this surface taught that. Writing is the tab a plan opens on. Measured in Chromium: not
 * one curly bracket anywhere on the page once the box had words in it.
 *
 * SO THESE TESTS HOLD FOUR THINGS:
 *
 *   the value stays visible beside its line, and is said ONCE;
 *   words nothing was scheduled from say so, in two words, and are never drawn as a fact;
 *   the account of where a value is stored is still reachable — in Inspect, whole;
 *   the four things a line can carry are offered where the writing happens, without hovering.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * The pages are rendered to static markup against a REAL Fastify app through `app.inject`, exactly
 * as tests/plan-writing-derived.test.ts does it, so every value drawn here was promoted by the
 * server rather than written into a fixture. The word counts below are counts of what the panel
 * really draws.
 *
 * The press itself is proved twice: `valueOnLine` decides what a press does and is tested here
 * without a browser; that the press really puts the characters in the box is measured in Chromium,
 * because a claim about what a person sees that was not seen is not evidence.
 */

import Fastify, { type FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { bodyOfLines } from '../src/shared/plandoc.ts'
import { PLANNING_KEYS } from '../src/shared/planline.ts'
import type { PlanBlocksReply } from '../src/web/api.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

type WebApi = typeof import('../src/web/api.ts')
type OnePlanModule = typeof import('../src/web/pages/plans/OnePlanPage.tsx')
type WritingModule = typeof import('../src/web/pages/plans/PlanWriting.tsx')
type ModeModule = typeof import('../src/web/lib/mode.ts')

let db: TestDb
let app: FastifyInstance
let webApi: WebApi
let onePlan: OnePlanModule
let writing: WritingModule
let mode: ModeModule

let planId: string

const AS_HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

/** The line whose size, hours and project were all promoted to its record. */
const PROMOTED = '- Build the controller {size: 15h} {time: 15h this week} {project: default}'
/** The line whose time nothing could be scheduled from, so the words were kept instead. */
const KEPT = '- Write the report {time: sometime next week}'
/** A line nobody filed, so the panel says nothing about it at all. */
const PLAIN = '- Ask Sam about the mount'

const BODY = ['# Week of 17 August', '', PROMOTED, KEPT, PLAIN].join('\n')

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
    const res = await app.inject({
      method: (init.method ?? 'GET') as 'GET',
      url: String(input),
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
  onePlan = await import('../src/web/pages/plans/OnePlanPage.tsx')
  writing = await import('../src/web/pages/plans/PlanWriting.tsx')
  mode = await import('../src/web/lib/mode.ts')

  const written = await webApi.api.newPlan('August plans', BODY)
  planId = written.plan.id
  const idOf = (text: string) => written.lines.find((line) => line.text === text)!.id

  await webApi.api.fileLineAsWork(planId, idOf(PROMOTED), { kind: 'task', workspaceId: 'default' })
  const keptLine = idOf(KEPT)
  const filed = await webApi.api.fileLineAsWork(planId, keptLine, { kind: 'task', workspaceId: 'default' })

  // THE SAME WORDS TWICE, WRITTEN AS TWO ROWS, because that is the only way this state can be reached
  // now and it is the state the owner's own corpus is in.
  //
  // `createIntent` keeps one row per line today, and `keptWordsOfLine` says why the read still hands
  // back a list: databases written before that rule holds more, and this installation is one of them.
  // So both rows go in through the table the product writes through, with the same columns and the
  // same words, and the panel then draws what the owner's screen drew — the identical phrase, twice.
  //
  // BOTH ARE WRITTEN BY HAND SINCE 17 AUGUST 2026. One of them used to come from filing, which took
  // `{time: sometime next week}` off the line and wrote it here. That removal was unearned — no
  // allocation, no hours, no total, so nothing had been promoted — and filing now leaves those words
  // in the line. It writes no row at all, so a test that needs two rows writes two.
  const { db: intentStore } = await import('../src/server/db/client.ts')
  const { planningIntents } = await import('../src/server/db/schema.ts')
  const { nowStamp } = await import('../src/shared/time.ts')
  for (const id of ['testFirstSaid', 'testSecondSaid']) {
    intentStore
      .insert(planningIntents)
      .values({
        id,
        said: 'sometime next week',
        recordId: filed.recordId,
        planLineId: keptLine,
        horizon: null,
        period: null,
        hours: null,
        state: 'kept',
        createdAt: nowStamp(),
        createdBy: `human:${THE_TEST_OFFICES_OWNER.id}`,
      })
      .run()
  }
})

afterAll(async () => {
  // Undefined only when the setup above threw. Guarded so that this cleanup cannot replace the real
  // failure with one about itself.
  if (mode !== undefined) mode.setMode('normal')
  if (app !== undefined) await app.close()
  if (db !== undefined) db.close()
})

/** The markup with the hoisted style blocks removed, so a class name in the CSS is not evidence. */
function body(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

/** The words a reader sees, with the tags taken out, so an assertion is about the screen. */
function wordsOf(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&hellip;/g, '…')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * JUST THE PANEL UNDER THE BOX, cut out of the page by counting its own tags.
 *
 * The word count below is a claim about that panel and nothing else, so taking the whole page's
 * words would answer a different question — and would go up whenever anything else on the plan page
 * grew.
 */
function panelOf(markup: string): string {
  const opens = markup.indexOf('<div class="pw-became">')
  if (opens === -1) throw new Error('The Writing view drew no "what these lines became" panel at all.')
  let depth = 0
  for (const tag of markup.slice(opens).matchAll(/<(\/?)div\b[^>]*>/g)) {
    depth += tag[1] === '/' ? -1 : 1
    if (depth === 0) return markup.slice(opens, opens + (tag.index ?? 0) + tag[0].length)
  }
  throw new Error('The panel opened and never closed, so this test could not read it.')
}

async function read(): Promise<PlanBlocksReply> {
  return webApi.api.planBlocks(planId)
}

/** The Writing view of this plan, as the page draws it. */
async function writingView(): Promise<React.ReactElement> {
  const [reply, since, reviews] = await Promise.all([
    read(),
    webApi.api.planSinceRead(planId),
    webApi.api.planReviews(planId),
  ])
  return h(onePlan.PlanView, { reply, since, reviews, view: 'writing', onView: () => {} })
}

// ============================================================ the panel says each thing once

describe('what these lines became, in normal mode', () => {
  /**
   * THE VALUES ARE STILL THERE. This half is kept: a canonical value stays
   * visibly associated with the line it came from, in the view where the owner is writing. Every assertion
   * below about what the panel does NOT say depends on this one being true first.
   */
  it('draws the size, the hours and the project beside the line', async () => {
    const panel = wordsOf(panelOf(body(await writingView())))
    expect(panel).toContain('- Build the controller')
    // RENAMED 17 AUGUST 2026 by the owner: Estimate and Schedule, one question each.
    expect(panel).toContain('Estimate')
    expect(panel).toContain('15 hours')
    expect(panel).toContain('Schedule')
    expect(panel).toContain('Project')
    expect(panel).toContain('Default')
  })

  /**
   * AND IT NO LONGER EXPLAINS THE STORE. Every sentence named here was on the owner's screen, once per
   * value, and all of them must go: normal mode is for using the product.
   */
  it('says nothing about where the value is stored', async () => {
    const panel = wordsOf(panelOf(body(await writingView())))
    expect(panel).not.toContain('Stored in')
    expect(panel).not.toContain('kept exactly as you wrote it')
    expect(panel).not.toContain('adds nothing to any week')
    expect(panel).not.toContain('uses no capacity')
    expect(panel).not.toContain('Filing a line moved these off it')
    expect(panel).not.toContain('this is a reading of them')
  })

  /**
   * THE WHOLE PANEL, COUNTED. The owner measured 177 words in a 431px column and named the repetition as
   * the problem, so the count is the measurement this test keeps.
   *
   * The same plan drew 176 words before this change and 35 after it, counted in Chromium at 1440
   * and again here. The budget is set at 60: comfortably above what the panel needs for three values
   * on one line and two on another, and far below what any repeated sentence can fit in.
   */
  it('says it in under sixty words', async () => {
    const panel = wordsOf(panelOf(body(await writingView())))
    const words = panel.split(' ').filter((word) => word !== '').length
    expect(words, panel).toBeLessThan(60)
  })

  /**
   * THE SAME WORDS ARE NOT LISTED TWICE. Two rows say "sometime next week" about this line. The owner read
   * them as two identical lines and could not tell whether they had written it once or twice, so the
   * panel says the words once and says how many there are.
   */
  it('says a repeated value once, with how many there are', async () => {
    // THE VALUES IT LISTS, NOT THE LINES IT LISTS THEM UNDER. Each row of the panel is headed by the
    // line's own words, and since 17 August 2026 those words still hold `{time: sometime next week}`
    // — filing leaves rough time where it was typed. That heading is the writing, not a listed
    // value, so counting it here would answer a different question from the one this test asks.
    const listed = wordsOf(panelOf(body(await writingView())).replace(/<p class="pw-became-line">[\s\S]*?<\/p>/g, ' '))
    const said = listed.split('sometime next week').length - 1
    expect(said, listed).toBe(1)
    expect(listed).toContain('twice')
  })

  /**
   * WORDS NOBODY SCHEDULED SAY SO, AND IN TWO WORDS. A panel that drew "sometime next week" exactly
   * as it draws "15 hours in 2026-W33" would be claiming an interpretation nobody made, which is the
   * eighth rule broken in pixels. It used to take 29 words to say it, per value.
   */
  it('marks kept words as not scheduled, without a paragraph', async () => {
    const panel = wordsOf(panelOf(body(await writingView())))
    expect(panel).toContain('sometime next week')
    expect(panel).toContain('not scheduled yet')
  })

  /**
   * AND NOTHING IS TYPED IN HERE. These are stored on the record and are changed there; a stored
   * value that looks editable is a lie a reader spends time on. This is round five's rule and it
   * still holds after the panel was cut down.
   */
  it('offers nothing to type a stored value into', async () => {
    const panel = panelOf(body(await writingView()))
    expect(panel).not.toContain('<input')
    expect(panel).not.toContain('<textarea')
    expect(panel).not.toContain('contenteditable')
  })
})

// ============================================================ nothing was destroyed

describe('what these lines became, in Inspect', () => {
  /**
   * THE ACCOUNT OF THE STORE IS STILL THERE, WHOLE. `docs/UX-CONTRACT.md`: nothing is destroyed
   * and nothing becomes unreachable, and derived-against-stored diagnostics are what Inspect is for.
   * Deleting these sentences instead of moving them would be a different change from the one the
   * owner asked for.
   */
  it('still says where each value is stored, and what filing moved', async () => {
    mode.setMode('inspect')
    try {
      const panel = wordsOf(panelOf(body(await writingView())))
      expect(panel).toContain('Stored in the estimate on the work this line is filed as')
      expect(panel).toContain('Stored in the hours given to this work')
      expect(panel).toContain('Filing a line moved these off it')
      expect(panel).toContain('kept exactly as you wrote it')
    } finally {
      mode.setMode('normal')
    }
  })
})

// ============================================================ the shape is offered where writing happens

describe('what a line can carry', () => {
  /**
   * Each value has a named press. 7FEOshq3mBGG keeps raw field syntax off normal controls.
   *
   * `PLANNING_KEYS` is the list the reader of the syntax declares, so a fifth key would fail here
   * rather than quietly getting no press.
   */
  it('offers one named press per thing', async () => {
    const { PLANNING_WORDS } = await import('../src/web/components/plans/planitems.tsx')
    const markup = body(await writingView())
    const said = wordsOf(markup)
    for (const key of PLANNING_KEYS) {
      expect(said, `no press for ${key}`).toContain(PLANNING_WORDS[key])
      expect(said).not.toContain(`{${key}: …}`)
    }
    expect(markup).toContain('class="pw-add"')
  })

  /**
   * The empty box shows writing, an item and a tick box. The value presses add their own syntax.
   */
  it('shows a plan shape without raw field syntax in the empty box', async () => {
    const markup = body(await writingView())
    const placeholder = /placeholder="([^"]*)"/.exec(markup)?.[1] ?? ''
    expect(placeholder).toContain('# What this plan is for')
    expect(placeholder).toContain('- Something to do')
    expect(placeholder).toContain('- [ ] Something to tick off')
    for (const key of PLANNING_KEYS) expect(placeholder).not.toContain(`{${key}:`)
  })
})

// ============================================================ what a press does to the document

describe('where a value goes when a press puts it there', () => {
  /**
   * AT THE END OF THE LINE THE CURSOR IS IN, because `src/shared/planline.ts` reads only the run of
   * groups at the end of a line. A group dropped where the cursor happens to sit would be prose.
   */
  it('puts it at the end of the line, not at the cursor', () => {
    const line = '- Build the controller'
    const put = writing.valueOnLine(line, 5, 'size')
    expect(put.put).toBe(' {size: }')
    expect(put.from).toBe(line.length)
    expect(put.to).toBe(line.length)
  })

  /** The cursor is left between the colon and the bracket, which is where the words go. */
  it('leaves the cursor where the words go', () => {
    const line = '- Build the controller'
    const put = writing.valueOnLine(line, 0, 'time')
    const after = line.slice(0, put.from) + (put.put ?? '') + line.slice(put.to)
    expect(after).toBe('- Build the controller {time: }')
    expect(put.caretFrom).toBe(after.length - 1)
    expect(put.caretTo).toBe(after.length - 1)
    expect(after.slice(put.caretFrom)).toBe('}')
  })

  /** One space before it, and only where one is needed. */
  it('does not double a space, and adds none to an empty line', () => {
    expect(writing.valueOnLine('- Build it ', 3, 'size').put).toBe('{size: }')
    expect(writing.valueOnLine('', 0, 'note').put).toBe('{note: }')
  })

  /** It goes after the groups the line already has, so the run at the end stays one run. */
  it('puts a second kind of value after the first', () => {
    const line = '- Build the controller {size: 15h}'
    const put = writing.valueOnLine(line, 4, 'note')
    expect(put.put).toBe(' {note: }')
    expect(put.from).toBe(line.length)
  })

  /**
   * A LINE THAT ALREADY SAYS THIS IS NOT GIVEN A SECOND ONE. Two sizes on one line are two answers
   * and Mole Office moves neither of them, so the press selects the words already there and typing
   * replaces them. Nothing is added and nothing is thrown away.
   */
  it('selects the words already there rather than writing the same key twice', () => {
    const line = '- Build the controller {size: 15h} {note: ask Sam}'
    const put = writing.valueOnLine(line, 2, 'size')
    expect(put.put).toBeNull()
    expect(line.slice(put.from, put.to)).toBe('15h')
    expect(put.caretFrom).toBe(put.from)
    expect(put.caretTo).toBe(put.to)
  })

  /** Spaces somebody left inside the brackets are theirs, and the selection is the words only. */
  it('selects only the words when the brackets are spaced out', () => {
    const line = '- Build it {  size :   15h  }'
    const put = writing.valueOnLine(line, 1, 'size')
    expect(put.put).toBeNull()
    expect(line.slice(put.from, put.to)).toBe('15h')
  })

  /** An empty value is a place to type, not a missing one. */
  it('puts the cursor inside a value that is empty', () => {
    const line = '- Build it {size: }'
    const put = writing.valueOnLine(line, 0, 'size')
    expect(put.put).toBeNull()
    expect(put.from).toBe(put.to)
    expect(line.slice(0, put.from)).toBe('- Build it {size: ')
  })

  /** The line the cursor is in, in a document of many. */
  it('finds the line the cursor is in, in the middle of a document', () => {
    const document = bodyOfLines(['# Week', '', '- One', '- Two', '- Three'])
    const caret = document.indexOf('- Two') + 3
    const put = writing.valueOnLine(document, caret, 'size')
    const after = document.slice(0, put.from) + (put.put ?? '') + document.slice(put.to)
    expect(after.split('\n')[3]).toBe('- Two {size: }')
    expect(after.split('\n')[2]).toBe('- One')
    expect(after.split('\n')[4]).toBe('- Three')
  })
})
