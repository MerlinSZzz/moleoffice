// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WARNING THAT ANOTHER RECORD ALREADY ANSWERS TO THIS NAME MUST NAME IT.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS FILE EXISTS FOR, MEASURED IN A BROWSER ON 18 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * A tester tracked a plan line whose title another record in the project already held, and read
 * this: *"Work in this project was already called "Wrist camera": task ...."* — four dots, no id,
 * and no way to reach the record. The sentence told the tester a clash existed and then refused to say
 * which record it was about.
 *
 * WHERE THE FOUR DOTS CAME FROM. The server writes `task <id>` into the sentence.
 * `withoutRecordIds` takes Mole Office's own ids out of a sentence for a reader in Normal mode, because
 * an id is not something a person can act on. Three dots plus the full stop after them was what was
 * left.
 *
 * WHAT IT SAYS NOW. The reply carries the same news twice — the sentence, and the records as rows —
 * and the browser now uses the rows: each record named in the sentence becomes a press that opens
 * it. The id is still not printed, because putting it back would not help anybody; the link is the
 * id doing its job. See `SaidWithRecords` in src/web/components/plans/planitems.tsx.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT CAN SILENTLY STOP BEING TRUE HERE
 * ---------------------------------------------------------------------------------------
 *
 *   1. THE FOUR DOTS COME BACK, either because the rows stop being passed along or because the
 *      elision runs over an id the browser could have linked.
 *   2. THE ELISION IS LOST ALTOGETHER. Ids the browser holds no row for must still come out, or the
 *      contract's rule about Normal mode is broken in the other direction.
 *   3. DEVELOPER MODE STOPS SHOWING THE SENTENCE AS SENT. Nothing may be destroyed by a mode.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * The runner's environment is `node`, so there is no DOM and no press can be clicked. What the press
 * calls is `whatFilingSaid`, which is written out as its own function for exactly this reason, and
 * every reply below comes from a real filing against a real Fastify app through `app.inject`.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Fastify, { type FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import type { LineFiled } from '../src/web/api.ts'

type WebApi = typeof import('../src/web/api.ts')
type PlanItemsModule = typeof import('../src/web/components/plans/planitems.tsx')
type ModeModule = typeof import('../src/web/lib/mode.ts')

let db: TestDb
let app: FastifyInstance
let webApi: WebApi
let planItems: PlanItemsModule
let mode: ModeModule

let planId: string
/** The record the FIRST of the two identical lines was filed as. */
let firstRecordId: string
/** What the SECOND filing answered, ids and all, exactly as the server wrote it. */
let secondFiling: LineFiled & { note: string }

const AS_HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

/** The same words twice, which is what a person writing a plan does and what may not be refused. */
const CLASHING = 'Wrist camera'

const BODY = ['# Robotics', `- ${CLASHING}`, `- ${CLASHING}`].join('\n')

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
  const { workRoutes } = await import('../src/server/api/work.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')

  app = Fastify()
  installErrorHandling(app)
  await app.register(planRoutes, { prefix: '/api' })
  await app.register(recordRoutes, { prefix: '/api' })
  await app.register(workRoutes, { prefix: '/api' })
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
  planItems = await import('../src/web/components/plans/planitems.tsx')
  mode = await import('../src/web/lib/mode.ts')

  const written = await webApi.api.newPlan('Robotics plan', BODY)
  planId = written.plan.id
  const both = written.lines.filter((one) => one.text === `- ${CLASHING}`)
  if (both.length !== 2) throw new Error(`the plan should hold two identical lines, it holds ${both.length}`)

  const first = await webApi.api.fileLineAsWork(planId, (both[0] as { id: string }).id, {
    ...planItems.whatFilingSends('task', 'default'),
  })
  firstRecordId = first.recordId
  secondFiling = await webApi.api.fileLineAsWork(planId, (both[1] as { id: string }).id, {
    ...planItems.whatFilingSends('task', 'default'),
  })
})

afterAll(async () => {
  await app.close()
  db.close()
})

/** The markup with the hoisted style blocks removed, so a class name in the CSS is not evidence. */
function body(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

/** The words a reader sees, with the tags taken out, so an assertion is about the screen. */
function words(el: React.ReactElement): string {
  return body(el)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The report a person reads after pressing Track, built the way the press builds it. */
async function reportOf(reply: LineFiled & { note: string }): Promise<React.ReactElement> {
  const outcome = await planItems.press(async () => planItems.whatFilingSaid(reply))
  return h(planItems.PressReport, { results: [{ text: CLASHING, outcome }] })
}

function inMode(draw: () => string, which: 'normal' | 'inspect'): string {
  mode.setMode(which)
  try {
    return draw()
  } finally {
    mode.setMode('normal')
  }
}

// ============================================================================ the server's half

describe('the reply says which record already answers to the name', () => {
  /**
   * THE ROWS ARE ON THE WIRE, which is what makes the browser's half possible at all. If this goes
   * red the browser cannot name the record and the sentence is the only thing left, which is the
   * state the tester met.
   */
  it('hands back the other record as a row, not only inside a sentence', () => {
    expect(secondFiling.alsoCalledThis).toEqual([{ id: firstRecordId, kind: 'task', title: CLASHING }])
    expect(secondFiling.note).toContain(`already called "${CLASHING}"`)
    expect(secondFiling.note, 'and the sentence itself names it by id, which is what needed replacing').toContain(
      `task ${firstRecordId}`,
    )
  })
})

// ============================================================================ what a person reads

describe('the warning names the record in a way a person can follow', () => {
  it('draws a press that opens the other record, in place of the id', async () => {
    const drawn = body(await reportOf(secondFiling))

    // The way to the record, as an ordinary link, so middle-click and copy-link-address work.
    expect(drawn).toContain(`href="#/r/${firstRecordId}"`)
    expect(words(await reportOf(secondFiling))).toContain('open the task')
  })

  /**
   * AND THE FOUR DOTS ARE GONE. This is the tester's sentence, asserted as the tester read it: the kind word
   * with an elision where the record should be.
   */
  it('never says "task ..." where a record was named', async () => {
    const said = words(await reportOf(secondFiling))

    expect(said).not.toContain('task ….')
    expect(said).not.toContain('task …')
    expect(said).toContain(`already called "${CLASHING}": open the task`)
    // The rest of the server's sentence is untouched: the press is a replacement for the id, not
    // for the paragraph the id was in.
    expect(said).toContain('This is a separate record.')
    expect(said).toContain('point this line at it instead and delete this record.')
  })

  /**
   * THE ID IS STILL NOT PRINTED IN NORMAL MODE. Putting it back would not have helped: the two
   * records share a title, so the id is the only thing that tells them apart AND the one thing a
   * person cannot use. The link is what a person gets instead.
   */
  it('keeps the id out of Normal mode and shows the sentence as sent in Developer mode', async () => {
    const report = await reportOf(secondFiling)

    expect(inMode(() => words(report), 'normal')).not.toContain(firstRecordId)
    // Nothing is destroyed by a mode: Developer mode still draws the server's own sentence.
    expect(inMode(() => words(report), 'inspect')).toContain(`task ${firstRecordId}`)
  })

  /**
   * AND AN ID THE BROWSER HOLDS NO ROW FOR IS STILL TAKEN OUT.
   *
   * This is the control for the change: the elision was not deleted, it was narrowed to the ids
   * this browser can do nothing with. A record named in a refusal the browser never fetched is one
   * of those, and it still reads as an elision rather than twelve characters of nothing.
   */
  it('still elides an id it was handed no record for', async () => {
    const unknown = 'PiQzVdq42ufa'
    const outcome = await planItems.press(async () => ({
      note: `This line already points at ${unknown}. Nothing was written.`,
    }))
    const said = words(h(planItems.PressReport, { results: [{ text: CLASHING, outcome }] }))

    expect(said).toContain('This line already points at ….')
    expect(said).not.toContain(unknown)
  })
})
