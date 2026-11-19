// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TWO THINGS A PLAN SAYS BACK TO A PERSON: A CONFIRMATION WITH NO IDS IN IT, AND A LOSS THAT NAMES
 * WHAT IT COST.
 *
 * ---------------------------------------------------------------------------------------
 * ONE. AN ORDINARY CONFIRMATION PRINTED A RECORD ID
 * ---------------------------------------------------------------------------------------
 *
 * Measured on 17 August 2026. Giving one line three hours answered:
 *
 *     3 hours. One allocation written (hkLnSG9FYPQ5) in 2026-W35, and it records that it came from
 *     this line.
 *
 * `docs/UX-CONTRACT.md` puts record ids in the Developer view. This is the ordinary path, in
 * Normal mode, after an ordinary press, and the id is the first thing in it a reader's eye stops on
 * and the one thing they can do nothing with.
 *
 * THE SENTENCE IS THE SERVER'S. `src/server/api/plans.ts` writes the id into the words at line 858,
 * and that file belongs to another owner this pass. So the drawing takes ids out of what Normal mode
 * shows and Developer mode still shows the sentence exactly as it was sent. These tests hold both
 * halves: no id at a Normal reader, the whole sentence for a Developer one, and the rest of the words
 * unchanged in both — a fix that quietly dropped the sentence would pass a check that only looked for
 * the id.
 *
 * THE SENTENCES ARE REAL. Every one asserted here comes back from a real Fastify app through
 * `app.inject`, so the day the server writes an id somewhere new these tests see it.
 *
 * ---------------------------------------------------------------------------------------
 * TWO. RENAMING A FILED LINE TOOK REAL WORK OUT OF THE PLAN AND SAID NOTHING ABOUT IT
 * ---------------------------------------------------------------------------------------
 *
 * Measured on 16 August 2026. A reader renamed a line that was filed as work, saved, and reloaded.
 * The line lost the work it named, a three-hour estimate and the hours it held, and the plan's total
 * fell from nine hours to six. The notice said a line was no longer in the plan and offered to point
 * one at the work again. It did not say what the plan had stopped counting.
 *
 * The server has always computed it — `RemovedBinding.lost` in src/server/lib/plans.ts names every
 * value the plan reached through that binding — and the page threw it away. These tests hold that it
 * arrives, that it is drawn in plain words, that it survives a reload, and that the offer to put the
 * line back is still there beside it.
 *
 * A RENAME IS NO LONGER A LOSS AT ALL. The owner reversed that rule on 17 August 2026 — editing prose
 * is normal planning behaviour, and it must not cost you the work you filed — so these tests cause
 * the loss by REMOVING the line, which is what a real loss is now, and one of them checks that a
 * rename costs nothing. The claims about what a loss says are exactly the ones they were.
 *
 * The harness is tests/plan-writing-says-and-mends.test.ts's: a real Fastify app through
 * `app.inject`, and a real `usePlanWriting` state handed out of one render.
 */

import Fastify, { type FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import type { PlanBlocksReply } from '../src/web/api.ts'
import type { PlanWritingState } from '../src/web/pages/plans/PlanWriting.tsx'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

type WebApi = typeof import('../src/web/api.ts')
type WritingModule = typeof import('../src/web/pages/plans/PlanWriting.tsx')
type ItemsModule = typeof import('../src/web/components/plans/planitems.tsx')
type ModeModule = typeof import('../src/web/lib/mode.ts')

let db: TestDb
let app: FastifyInstance
let webApi: WebApi
let writing: WritingModule
let planItems: ItemsModule
let mode: ModeModule

const AS_HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

/** A day inside a week, so "this week" reads as one period rather than as nothing. */
const TODAY = new Date(2026, 7, 17, 9, 0, 0)

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
    location: { hash: '', search: '' },
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
  writing = await import('../src/web/pages/plans/PlanWriting.tsx')
  planItems = await import('../src/web/components/plans/planitems.tsx')
  mode = await import('../src/web/lib/mode.ts')
})

afterAll(async () => {
  await app.close()
  db.close()
})

let handed: PlanWritingState | null = null
function Probe({ reply }: { reply: PlanBlocksReply }) {
  handed = writing.usePlanWriting(reply.plan.id, reply.lines, reply.plan.title, reply.version)
  return null
}

/** One page opened on one read of a plan, with the writing state it really uses. */
function openPage(reply: PlanBlocksReply): PlanWritingState {
  handed = null
  renderToStaticMarkup(h(Probe, { reply }))
  if (handed === null) throw new Error('the writing state was never handed out')
  return handed
}

/** Opening the plan again, as a reload does: a fresh read, a fresh page, nothing carried over. */
async function openAgain(id: string): Promise<PlanWritingState> {
  return openPage(await webApi.api.planBlocks(id))
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

/** The same element read in one of the two modes, and the mode put back afterwards. */
function screen(el: React.ReactElement, which: 'normal' | 'inspect'): string {
  mode.setMode(which)
  try {
    return words(el)
  } finally {
    mode.setMode('normal')
  }
}

/**
 * A plan with one line filed as work, given an estimate and hours.
 *
 * Everything is written through the product's own doors: the size comes off the line's own words
 * when it is filed, and the hours are written by the press the table's scheduling control uses.
 */
async function planWithFiledWork(): Promise<{
  planId: string
  recordId: string
  text: string
  outcome: { ok: boolean; said: string }
}> {
  const text = `- reprint the mount ${Math.random()}`
  const made = await webApi.api.newPlan(`Losing hours ${Math.random()}`, `${text} {size: 3h}\n- gaze`)
  const planId = made.plan.id
  const opened = await webApi.api.planBlocks(planId)
  const first = opened.lines[0]!
  const filed = await webApi.api.fileLineAsWork(planId, first.line.id, { kind: 'task', workspaceId: 'default' })

  const now = await webApi.api.planBlocks(planId)
  const item = planItems.planItemsOf(now.lines).items.find((one) => one.entry.line.id === first.line.id)
  if (item === undefined) throw new Error('the filed line is not an item of the plan')
  const outcome = await planItems.giveItemTimeFromWords(planId, item, 'this week', '3', TODAY)

  return { planId, recordId: filed.recordId, text, outcome }
}

// ============================================================ an ordinary confirmation

describe('what a press says back about the hours it wrote', () => {
  it('is the server’s own sentence, and the server puts a record id in it', async () => {
    // THE CONTROL FOR EVERYTHING BELOW. Without it a drawing that printed nothing at all would pass
    // every "no id on screen" check in this file, and so would a server that stopped saying anything.
    const { outcome } = await planWithFiledWork()
    expect(outcome.ok).toBe(true)
    expect(outcome.said).toContain('One allocation written')
    expect(outcome.said).toMatch(/\([A-Za-z0-9_-]{12}\)/)
  })

  it('draws no id at a reader in Normal mode, and keeps every other word', async () => {
    const { text, outcome } = await planWithFiledWork()
    const id = /\(([A-Za-z0-9_-]{12})\)/.exec(outcome.said)?.[1]
    if (id === undefined) throw new Error('the server sentence carried no id, so there is nothing to strip')

    const drawn = screen(h(planItems.PressReport, { results: [{ text, outcome }] }), 'normal')

    expect(drawn).not.toContain(id)
    // AND THE SENTENCE IS STILL THE SENTENCE. Taking the id out must not take the answer with it.
    expect(drawn).toContain('One allocation written in')
    expect(drawn).toContain('it records that it came from this line')
    expect(drawn).toContain('The work itself was not changed')
    expect(drawn).toContain('1 of 1 written.')
  })

  it('still shows the whole sentence, id and all, in Developer mode', async () => {
    const { text, outcome } = await planWithFiledWork()
    const id = /\(([A-Za-z0-9_-]{12})\)/.exec(outcome.said)?.[1]
    if (id === undefined) throw new Error('the server sentence carried no id, so there is nothing to strip')

    const drawn = screen(h(planItems.PressReport, { results: [{ text, outcome }] }), 'inspect')
    expect(drawn).toContain(id)
    expect(drawn).toContain(outcome.said.replace(/\s+/g, ' ').trim())
  })
})

/**
 * THE READER ITSELF, ON THE THREE SHAPES THESE SENTENCES PUT AN ID IN.
 *
 * The sentences above and below cover the two an ordinary press meets. These are the third — a
 * refusal naming the record a line already points at — and the two things the reader must never do:
 * eat an English word of twelve letters, or edit what is inside somebody's quotation marks.
 */
describe('taking ids out of a sentence somebody has to read', () => {
  it('drops an aside in brackets whole', () => {
    expect(planItems.withoutRecordIds('One allocation written (hkLnSG9FYPQ5) in 2026-W35, and it records that.')).toBe(
      'One allocation written in 2026-W35, and it records that.',
    )
  })

  it('keeps the name when the id is standing in front of one', () => {
    expect(planItems.withoutRecordIds('This line already points at Vb7Qk2Ln9Xz1 ("Reprint the mount"). Nothing was written.')).toBe(
      'This line already points at "Reprint the mount". Nothing was written.',
    )
  })

  it('leaves an ordinary word of twelve letters alone', () => {
    const said = 'Presentation is consistently well-behaved and nothing was written.'
    expect(planItems.withoutRecordIds(said)).toBe(said)
  })

  it('never edits what a person wrote inside quotation marks', () => {
    const said = 'Filed as work, called "Consistently Presentation, twelve and more".'
    expect(planItems.withoutRecordIds(said)).toBe(said)
  })

  it('reads an id with no digits in it, which nothing else here would', () => {
    expect(planItems.withoutRecordIds('It pointed at ERdnKAOJcRID before.')).toBe('It pointed at … before.')
  })
})

// ============================================================ what losing a filed line cost

/**
 * WHAT CHANGED HERE ON 17 AUGUST 2026, AND WHY THE CLAIMS DID NOT.
 *
 * These tests used to lose the work by RENAMING the filed line, because that is what saving a
 * document did then. The owner reversed that rule — "a filed/bound line must not lose access to its
 * canonical work merely because its visible words changed. Editing prose is normal planning
 * behaviour" — so a renamed line now keeps its row and its work, and there is no loss to draw.
 *
 * THE LOSS IS NOW CAUSED THE WAY A LOSS REALLY HAPPENS: the line is taken out of the document. Every
 * claim below is the one it always was — the server sends what the binding was worth, the page keeps
 * it, draws it in plain words, and still has it after a reload.
 */
describe('a filed line that was taken out of the plan', () => {
  /** Save the document without the filed line, which is what takes the work out of the plan. */
  async function removeIt(planId: string): Promise<PlanWritingState> {
    const page = openPage(await webApi.api.planBlocks(planId))
    page.write('- gaze')
    const done = await page.saveNow()
    if (done.did !== 'stored') throw new Error(`the save did not store: ${done.did}`)
    return page
  }

  /**
   * THE CONTROL, AND IT IS AT THE SOURCE. The save's own reply is where the cost comes from, so a
   * server that stopped sending it fails here rather than three tests further on, where it would
   * read as the page having dropped it.
   */
  it('is answered by the server with every value the plan reached through it', async () => {
    const { planId } = await planWithFiledWork()
    const read = await webApi.api.planBlocks(planId)
    const written = await webApi.api.writePlanBody(planId, '- gaze', read.version)

    const gone = written.removedBindings[0] as unknown as { lost?: { key: string; says: string }[] } | undefined
    if (gone?.lost === undefined) throw new Error('the save’s reply says nothing about what the loss cost')
    expect(gone.lost.map((one) => one.key).sort()).toEqual(['project', 'size', 'time'])
    expect(gone.lost.find((one) => one.key === 'size')?.says).toContain('3 hours')
    expect(gone.lost.find((one) => one.key === 'time')?.says).toContain('3 hours in 2026-W')
  })

  /**
   * AND A RENAME COSTS NOTHING, which is the other half of the same rule and is checked here so that
   * the change cannot be undone without a test going red. The words are the person's; the work stays.
   */
  it('keeps the work when the line is renamed rather than removed', async () => {
    const { planId, recordId, text } = await planWithFiledWork()
    const read = await webApi.api.planBlocks(planId)
    const written = await webApi.api.writePlanBody(planId, `${text} tomorrow\n- gaze`, read.version)
    expect(written.removedBindings).toEqual([])

    const after = await webApi.api.planBlocks(planId)
    expect(after.lines[0]!.line.text).toBe(`${text} tomorrow`)
    expect(after.lines[0]!.line.recordId).toBe(recordId)
  })

  it('carries what the plan can no longer reach into the page that saved it', async () => {
    const { planId } = await planWithFiledWork()
    await removeIt(planId)

    const lost = (await openAgain(planId)).removed[0]?.lost
    if (lost === undefined || lost === null) throw new Error('the loss says nothing about what it cost')
    expect(lost.map((one) => one.key).sort()).toEqual(['project', 'size', 'time'])
    expect(lost.find((one) => one.key === 'size')?.says).toContain('3 hours')
    expect(lost.find((one) => one.key === 'time')?.says).toContain('3 hours in 2026-W')
  })

  it('says what it cost on the page, in plain words, and still offers the line back', async () => {
    const { planId } = await planWithFiledWork()
    await removeIt(planId)
    const page = h(writing.PlanWriting, { state: await openAgain(planId) })
    const said = words(page)

    expect(said).toContain('This plan can no longer see:')
    // RENAMED 17 AUGUST 2026: the owner replaced "How big" with Estimate and "Time given" with
    // Schedule, because the old words did not say which question each answered.
    expect(said).toContain('Estimate')
    expect(said).toContain('3 hours')
    expect(said).toContain('Schedule')
    // THE WEEK IS NAMED, NOT KEYED, AND THE KEY IS STILL REACHABLE. CHANGED 17 AUGUST 2026: this
    // used to require the stored key `2026-W…` on the screen a person reads. Both halves are
    // asserted here, so nothing is weaker than it was — Normal mode says the week the way a person
    // says it, and Developer mode still shows the sentence the server sent.
    expect(said).toMatch(/3 hours in Week of \d+ \w+/)
    expect(said).not.toMatch(/2026-W\d\d/)
    expect(screen(page, 'inspect')).toMatch(/3 hours in 2026-W\d\d/)
    expect(said).toContain('Project')
    expect(said).toContain('Nothing was deleted. All of it is still on the work, unchanged.')
    // THE OFFER IS STILL THE POINT OF THE NOTICE. A warning that replaced the repair would be a
    // worse notice than the one that said nothing.
    expect(said).toContain('Point that line at it')
    expect(said).toContain('makes a second, separate piece of work')
  })

  it('still says it after a reload, because a warning in one tab is not a warning', async () => {
    const { planId } = await planWithFiledWork()
    await removeIt(planId)

    // A FRESH PAGE ON A FRESH READ. Nothing on the server remembers that a line used to point at a
    // record, so what is drawn here came out of this browser and nowhere else.
    const reopened = await openAgain(planId)
    const lost = reopened.removed[0]?.lost
    if (lost === undefined || lost === null) throw new Error('the remembered loss says nothing about what it cost')
    expect(lost.find((one) => one.key === 'time')?.says).toContain('3 hours in 2026-W')
    expect(words(h(writing.PlanWriting, { state: reopened }))).toContain('This plan can no longer see:')
  })

  it('says nobody wrote the cost down rather than drawing a loss of nothing', async () => {
    // A LOSS REMEMBERED BY A BUILD THAT DID NOT RECORD THE COST. It is kept, because this browser is
    // the only place a lost binding is written down, and it says which of the two it is.
    const { planId } = await planWithFiledWork()
    await removeIt(planId)
    const reopened = await openAgain(planId)
    const one = reopened.removed[0]!

    const page = h(writing.PlanWriting, {
      state: { ...reopened, removed: [{ text: one.text, recordId: one.recordId, title: one.title, lost: null }] },
    })
    const drawn = words(page)
    expect(drawn).toContain('What it reached not recorded')
    expect(drawn).not.toContain('This plan can no longer see:')
    // AND THE WHOLE SENTENCE IS STILL THERE for a reader who asks for it, which is what stops a
    // three-word mark from being the only account of it.
    expect(renderToStaticMarkup(page)).toContain(
      'This loss was remembered before Mole Office started recording what a loss costs',
    )
  })
})
