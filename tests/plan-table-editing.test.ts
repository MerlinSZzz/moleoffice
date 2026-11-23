// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PLANNING TABLE AS AN EDITING SURFACE: THE COLUMNS IT HAS, THE VALUES A PERSON CAN WRITE, AND
 * PICKING A ROW WITHOUT TICKING IT OFF.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT CAN SILENTLY STOP BEING TRUE HERE
 * ---------------------------------------------------------------------------------------
 *
 *   1. A COLUMN GOES MISSING AT THE WIDTH THE OWNER WORKS AT. Which columns are drawn is decided from the
 *      table's own measured box against a threshold, and beside the writing box that box is 659px.
 *      How big, Time given and Project were left off there, so the owner used the product for a
 *      week believing four columns were fake. An absent column and a broken column look identical
 *      to somebody trying to use one. Problem `ERdnKAOJcRID`.
 *   2. A PLANNING VALUE NEEDS A RECORD AGAIN. You estimate in order to decide whether something is
 *      worth filing, so filing must not be the thing that lets you estimate. If these boxes ever go
 *      back to being drawn only on filed rows, the product has the order backwards again.
 *   3. A VALUE WRITTEN IN THE PLAN GETS COUNTED. What somebody wrote in a line is not a fact about
 *      the project: it is in no total, it uses no capacity, and it gives nothing any time. A total
 *      that quietly swallowed one would be claiming an interpretation nobody made.
 *   4. A BOX APPEARS WHERE THERE IS NOWHERE TO PUT THE NUMBER. A direction and a problem declare no
 *      estimate, so a box on one accepts a number and drops it. Problem `j2qxRpdJyaQ1`.
 *   5. PICKING AND TICKING BECOME ONE PICTURE AGAIN. They were both a tick box with the same size
 *      and the same accent, a few pixels apart, doing different things.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT LOOKS LIKE THIS
 * ---------------------------------------------------------------------------------------
 *
 * The runner's environment is `node`, so there is no DOM: the components are rendered to static
 * markup and `fetch` is pointed at a real Fastify app through `app.inject`, exactly as
 * tests/plan-table.test.ts does it. Every write below really lands in a database and is read back
 * out of it.
 *
 * NOTHING HERE PRESSES A BUTTON, so every rule a press follows is a function the press calls and
 * this file calls the same function. `pickedAfter` is the whole of what one press of a pick control
 * does, and `columnsOfTable` is the whole of which columns are drawn.
 */

import Fastify, { type FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb, THIS_TEST_ONLY_DRAWS_THE_TABLE } from './helpers.ts'
import type { PlanBlocksReply } from '../src/web/api.ts'
import { t } from '../src/shared/i18n.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

type WebApi = typeof import('../src/web/api.ts')
type PlanTableModule = typeof import('../src/web/components/plans/PlanTable.tsx')
type PlanItemsModule = typeof import('../src/web/components/plans/planitems.tsx')

let db: TestDb
let app: FastifyInstance
let webApi: WebApi
let planTable: PlanTableModule
let planItems: PlanItemsModule

let planId: string

const AS_HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

/**
 * A plan with planning values written into its lines, the way a person writes them before anything
 * is filed: a size, a time, a project and a note, in the line's own words.
 */
const BODY = [
  '# Robotics',
  '## Tray clamp',
  '- replace the gripper {size: 3h} {time: sometime next week} {project: robotics} {note: ask Sam}',
  '- [ ] measure the offset {size: 4h}',
  '- write the report {size: 2h}',
  '- say it twice {size: 1h} {size: 2h}',
  '## Object',
  '- abc',
  '',
  '| Task | Owner |',
  '| --- | --- |',
  '| Calibrate the wrist | Sam |',
].join('\n')

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
  planTable = await import('../src/web/components/plans/PlanTable.tsx')
  planItems = await import('../src/web/components/plans/planitems.tsx')

  const written = await webApi.api.newPlan('Robotics plan', BODY)
  planId = written.plan.id

  // TWO ROWS ARE FILED AND THE TWO KINDS ARE DIFFERENT ON PURPOSE. A task holds an estimate and a
  // direction does not, and the whole of `j2qxRpdJyaQ1` is what the second one draws.
  const lineOf = (words: string) => written.lines.find((line) => line.text.startsWith(words))!
  await webApi.api.fileLineAsWork(planId, lineOf('- [ ] measure the offset').id, {
    kind: 'task',
    workspaceId: 'default',
  })
  await webApi.api.fileLineAsWork(planId, lineOf('- write the report').id, {
    kind: 'direction',
    workspaceId: 'default',
  })
})

afterAll(async () => {
  await app.close()
  db.close()
})

async function read(): Promise<PlanBlocksReply> {
  return webApi.api.planBlocks(planId)
}

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

/** The table as the plan page draws it: it can rewrite a line, because it hands the read back. */
async function table(): Promise<React.ReactElement> {
  const reply = await read()
  return h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines, onWrote: () => {} })
}

/** The stored line whose words start like this, read back from the server. */
async function lineStartingWith(start: string): Promise<{ id: string; text: string; planning: { key: string; value: string }[] }> {
  const reply = await read()
  const found = reply.lines.find((entry) => entry.line.text.startsWith(start))
  if (found === undefined) throw new Error(`No line of the plan starts with ${JSON.stringify(start)}.`)
  return { id: found.line.id, text: found.line.text, planning: found.line.planning }
}

// ============================================================ the six columns survive

/**
 * WHICH COLUMNS A NARROW TABLE DRAWS, which is where the owner's report of four fake columns came
 * from. Three of them were not drawn at all in the view the owner was using.
 *
 * The measurement itself is made in a real browser — `tests/plan-writing.test.ts` reads the table's
 * own box — and this is the rule that measurement feeds. `columnsOfTable` is what the component
 * calls, so nothing here is a second answer to the same question.
 */
describe('the columns asked for survive a narrow table', () => {
  it('draws Estimate, Schedule and Project at the width the writing-and-table view measures', () => {
    // The table's own column measures this beside the writing box at a 1400px window. That is the
    // measurement that made three columns absent, and it is below the width every column needs.
    const BESIDE_THE_WRITING = 659
    expect(BESIDE_THE_WRITING).toBeLessThan(planTable.WIDE_ENOUGH_FOR_THE_TABLE)

    const { drawn } = planTable.columnsOfTable({
      flat: false,
      yourColumns: [],
      tight: BESIDE_THE_WRITING < planTable.WIDE_ENOUGH_FOR_THE_TABLE,
    })
    // THE SIX COLUMNS, in this order: Task, Type, Estimate, Schedule,
    // Project, Note. "Where it stands" is gone — its state word is a small mark beside the task and
    // its kind is the Type column, which is a control before the line is tracked as well as after.
    expect(drawn.map((one) => one.heading)).toEqual([
      'Task',
      'Type',
      'Estimate',
      'Schedule',
      'Project',
      'Note',
    ])
  })

  it('leaves off the writer own table columns there, and hands them back to be named', () => {
    const { drawn, leftOff } = planTable.columnsOfTable({
      flat: false,
      yourColumns: ['Owner', 'Hours'],
      tight: true,
    })
    // What is left off is the owner's own pipe-table columns and nothing Mole Office supplies.
    expect(leftOff.map((one) => one.heading)).toEqual(['Owner', 'Hours'])
    expect(drawn.map((one) => one.heading)).not.toContain('Owner')
  })

  it('leaves nothing off when there is room, and still draws the owner\'s columns', () => {
    const { drawn, leftOff } = planTable.columnsOfTable({
      flat: false,
      yourColumns: ['Owner'],
      tight: false,
    })
    expect(leftOff).toEqual([])
    expect(drawn.map((one) => one.heading)).toContain('Owner')
  })
})

// ============================================================ writing a value before filing

/**
 * EVERY PLANNING VALUE CAN BE WRITTEN ON ANY LINE, FILED OR NOT.
 *
 * How big, Time given and Project do not depend on a plan
 * line already being canonical work. Filing it as real work binds and promotes the information; it does not
 * unlock the ability to express it.
 */
describe('every planning value can be written before the line is filed', () => {
  it('gives a row nobody has tracked a box for the estimate, the schedule and the project', async () => {
    const markup = body(await table())
    expect(markup).toContain('aria-label="&quot;Estimate&quot; for this item, in your own words"')
    expect(markup).toContain('aria-label="&quot;Schedule&quot; for this item, in your own words"')
    expect(markup).toContain('aria-label="&quot;Project&quot; for this item, in your own words"')
    // With the words somebody wrote in them, exactly as typed.
    expect(markup).toContain('>3h</textarea>')
    expect(markup).toContain('>sometime next week</textarea>')
    expect(markup).toContain('>robotics</textarea>')
  })

  /**
   * AND IT IS DRAWN AS WHAT IT IS. A value in the plan is not a fact about the project, so it may
   * not be drawn the same way as one that is stored on a record: the mark is on the box itself, and
   * the sentence says it is in no total.
   */
  it('draws a value written in the plan differently from one stored on a record', async () => {
    const markup = body(await table())
    expect(markup).toContain('data-said="plan"')
    expect(markup).toContain('it is in no total and gives nothing any time')
  })

  it('writes what was typed into the line own words and reads it back out of the plan', async () => {
    const before = await lineStartingWith('- abc')
    await webApi.api.saveLine(planId, before.id, {
      text: planItems.lineWithPlanningValue(before.text, 'size', 'about 5h'),
    }, null)

    const after = await lineStartingWith('- abc')
    expect(after.text).toBe('- abc {size: about 5h}')
    expect(after.planning).toEqual([{ key: 'size', value: 'about 5h' }])
  })

  it('replaces the value rather than writing a second one, and takes it off when the box is emptied', async () => {
    const one = await lineStartingWith('- abc')
    await webApi.api.saveLine(planId, one.id, {
      text: planItems.lineWithPlanningValue(one.text, 'size', '6h'),
    }, null)
    const two = await lineStartingWith('- abc')
    expect(two.text).toBe('- abc {size: 6h}')

    await webApi.api.saveLine(planId, two.id, {
      text: planItems.lineWithPlanningValue(two.text, 'size', ''),
    }, null)
    const three = await lineStartingWith('- abc')
    expect(three.text).toBe('- abc')
    expect(three.planning).toEqual([])
  })

  /**
   * THE WORDS IN FRONT ARE NOT TOUCHED, and neither is a value with another key. A box that rewrote
   * the line would be an editing surface that edits more than the cell somebody pressed.
   */
  it('leaves the words and the other values of the line exactly as they were', () => {
    const line = '- use the {gripper} mount {size: 3h} {note: ask Sam}'
    expect(planItems.lineWithPlanningValue(line, 'project', 'robotics')).toBe(
      '- use the {gripper} mount {size: 3h} {note: ask Sam} {project: robotics}',
    )
  })

  it('refuses a value holding a curly bracket, in words, rather than storing a line it cannot read', () => {
    expect(planItems.whyValueCannotBeWritten('size', '{3h}')).toContain('curly bracket')
    expect(planItems.whyValueCannotBeWritten('note', 'ask Sam')).toBeNull()
  })

  /**
   * TWO ANSWERS ARE NOT ONE ANSWER. A line saying how big it is twice is two things somebody wrote,
   * and Mole Office will not pick one of them — the same rule filing follows on the server.
   */
  it('will not edit a value the line says twice, and says why', async () => {
    const reply = await read()
    const items = planItems.planItemsOf(reply.lines).items
    const twice = items.find((item) => item.text.startsWith('say it twice'))!
    expect(planItems.writtenValue(twice, 'size')).toEqual({
      said: null,
      refused: expect.stringContaining('will not pick one of them'),
    })
    expect(words(await table())).toContain('written twice')
  })

  /**
   * AND A NEW ITEM CAN STILL BE ADDED FROM HERE, which is the other thing the Table must
   * do. The press names the row it will write under, in the row's words and not in its syntax.
   */
  it('still offers the press that adds an item, on every row, naming the row in plain words', async () => {
    const markup = body(await table())
    const reply = await read()
    const rows = planItems.planItemsOf(reply.lines).items.length
    expect(markup.split('class="pt-add"')).toHaveLength(rows + 1)
    expect(markup).toContain('aria-label="Add an item after &quot;replace the gripper&quot;"')
    expect(markup).toContain('aria-label="Add an item under &quot;Tray clamp&quot;"')
  })

  /**
   * A SURFACE THAT CANNOT HAND A REWRITTEN LINE BACK MAY NOT WRITE ONE, and that now includes the
   * note. The note used to be a column of the database, so writing one changed no character of the
   * document; it lives in the line's own words now, so a note written where the page's copy of the
   * plan cannot be told about it is a note the next keystroke in the writing box would overwrite.
   */
  it('offers none of these boxes where a rewritten line would not reach the writing box', async () => {
    const reply = await read()
    const markup = body(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines }))
    expect(markup).not.toContain('for this item, in your own words')
    expect(markup).not.toContain('aria-label="Your own note about this item"')
    // AND NOTHING IS HIDDEN. The words are still on the screen, as words.
    const said = words(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines }))
    expect(said).toContain('sometime next week')
    expect(said).toContain('ask Sam')
  })
})

// ============================================================ filing promotes, and the cell follows

/**
 * AFTER BINDING THE RECORD IS CANONICAL, AND THE CELL EDITS THE RECORD.
 *
 * Filing moves each value to the place Mole Office keeps that kind of fact and takes it off the line. A
 * value that could not move stays in the line and is still drawn, because the Table must not become
 * the one place a value written in the plan cannot be seen.
 */
describe('a filed row edits the record, and a value that could not move stays visible', () => {
  it('draws the estimate box of a filed task, and the size is on the record rather than in the line', async () => {
    const line = await lineStartingWith('- [ ] measure the offset')
    // Filing promoted it: the group is off the line and the record holds the number.
    expect(line.text).toBe('- [ ] measure the offset')
    expect(line.planning).toEqual([])

    const markup = body(await table())
    expect(markup).toMatch(/aria-label="How many hours [^"]*measure the offset[^"]*takes"/)
  })

  /**
   * AND NO ESTIMATE BOX ON A FILED ROW WHOSE KIND HOLDS NO ESTIMATE. Problem `j2qxRpdJyaQ1`: the box
   * accepted a number and had nowhere to put it, which `docs/UX-CONTRACT.md` forbids by name.
   *
   * BEFORE FILING THE BOX IS ALWAYS THERE, because until the line is filed the value is the line's
   * own words and every line can hold them. The constraint belongs to the record, so it appears
   * when there is a record.
   */
  it('draws no estimate box on a filed direction, says there is no estimate, and keeps what the line says', async () => {
    const markup = body(await table())
    expect(markup).not.toMatch(/aria-label="How many hours [^"]*write the report[^"]*takes"/)
    expect(planItems.kindHasEstimate('direction')).toBe(false)
    expect(planItems.kindHasEstimate('task')).toBe(true)

    const said = words(await table())
    expect(said).toContain('no estimate')
    // The line still says 2h, and the row still shows it: filing did not move it, so nothing may
    // hide it either.
    const line = await lineStartingWith('- write the report')
    expect(line.planning).toEqual([{ key: 'size', value: '2h' }])
    expect(body(await table())).toContain('>2h</textarea>')
  })

  /**
   * AND THE ROW DOES NOT CLAIM THE RECORD IS CALLED SOMETHING ELSE. A row says "filed as" only when
   * the record's title is neither reading of its line. Filing takes the title from the words alone,
   * so a line that still carries a planning value would otherwise carry that line on every row —
   * the title and the line agree, and the group at the end is what made them look different.
   */
  it('does not say a filed row is called something else when the line only carries a planning value', async () => {
    const line = await lineStartingWith('- write the report')
    expect(line.planning).toEqual([{ key: 'size', value: '2h' }])
    // The totals line says "not filed as work", which is a different sentence; the row's own claim
    // is "filed as: <title>" and that is the one that must not be here.
    expect(words(await table())).not.toContain('filed as:')
  })

  /**
   * AND WHAT IS ONLY IN THE PLAN IS COUNTED OUT OF THE TOTAL, IN WORDS. A size somebody wrote in a
   * line is not on any record, so it is in no total anywhere — and a total that said nothing about
   * it would read as though nobody had sized those rows at all.
   */
  it('counts the rows sized in the plan only, and leaves them out of the hours', async () => {
    const said = words(await table())
    // CRITERION CHANGE, as decided: the count no longer goes on to say it is in no total. The two
    // rows are the gripper's 3h and the report's 2h; the line that sizes itself twice has no size.
    expect(said).toContain(t('planTable.sizedInPlanOnly', { n: 2 }).trim())
    // The hours are over the rows whose estimate is on a RECORD, and there is one: tracking the task
    // moved its 4h. The 2h and the 3h still written in lines are in no total anywhere. The 4h is
    // reported at the top level, because the tracked row sits inside two untracked headings and a
    // parent's own hours are an envelope over what is written under it.
    expect(said).toContain('4h in all, from 1 of 1 top-level rows')
  })
})

// ============================================================ picking a row is not ticking it off

/**
 * SELECTION AND COMPLETION WERE THE SAME PICTURE. Both were a plain tick box with the same size and
 * the same accent, a few pixels apart on one row, and they do different things: one chooses the row
 * for a press that acts on several, the other writes a tick into the document.
 */
describe('picking a row is not ticking it off', () => {
  it('draws the pick control as its own control and never as a tick box', async () => {
    const markup = body(await table())
    // Not one tick box is a pick control.
    expect(markup).not.toContain('type="checkbox" class="pt-pick"')
    // Every row carries one, and so does the head of the column.
    const reply = await read()
    const rows = planItems.planItemsOf(reply.lines).items.length
    expect(markup.split('class="pt-pick"')).toHaveLength(rows + 2)
    // AND THE TICK BOX IS STILL A TICK BOX. A tick is a tick.
    expect(markup).toContain('type="checkbox" class="pi-tick"')
  })

  /**
   * THE CONTROL AT THE HEAD OF THE COLUMN IS THE SAME CONTROL, which is what lines it up with the
   * rows. It used to be a bare tick box with no class at all, so it took the browser's own size and
   * margins while every row drew a 14px control with none. That is the alignment fault the owner noticed.
   */
  it('heads the pick column with the very same control', async () => {
    const markup = body(await table())
    const head = /<th [^>]*class="pt-pickcol"[^>]*>([\s\S]*?)<\/th>/.exec(markup)
    expect(head, 'the pick column has no heading cell').not.toBeNull()
    expect(head![1]).toContain('class="pt-pick"')
    expect(head![1]).toContain('role="checkbox"')
  })

  it('draws three states, and the third one is a row whose parts are partly picked', () => {
    const at = (share: 'none' | 'some' | 'all') =>
      body(h(planTable.Pick, { share, label: 'Pick "Tray clamp"', press: () => {} }))
    expect(at('none')).toContain('aria-checked="false"')
    expect(at('all')).toContain('aria-checked="true"')
    expect(at('some')).toContain('aria-checked="mixed"')
  })

  it('says on the control how many rows one press is about', async () => {
    const reply = await read()
    const items = planItems.planItemsOf(reply.lines).items
    const gripper = items.find((item) => item.text === 'Tray clamp')!
    const subtree = planItems.subtreesOf(items).get(gripper.key)!
    expect(planTable.pickLabel(gripper, 'none', subtree.length - 1)).toBe(
      'Pick "Tray clamp" and the 4 written under it',
    )
    expect(planTable.pickLabel(gripper, 'all', subtree.length - 1)).toBe(
      'Stop picking "Tray clamp" and the 4 written under it',
    )
    const abc = items.find((item) => item.text === 'abc')!
    expect(planTable.pickLabel(abc, 'none', 0)).toBe('Pick "abc"')
  })
})

/**
 * PICKING A PARENT PICKS EVERYTHING UNDER IT AND LETTING IT GO LETS THEM ALL GO, in the owner's
 * words. Nothing here is a second rule: `pickedAfter` is what one press of a pick control does,
 * whether the press is on a row or at the head of the column.
 */
describe('picking a piece of work picks the whole of it', () => {
  it('reads a row and everything written under it off the items themselves', async () => {
    const reply = await read()
    const items = planItems.planItemsOf(reply.lines).items
    const key = (text: string) => items.find((item) => planItems.wordsOf(item) === text)!.key
    const subtrees = planItems.subtreesOf(items)

    // The whole plan sits under its one top-level heading.
    expect(subtrees.get(key('Robotics'))).toHaveLength(items.length)
    expect(
      subtrees.get(key('Tray clamp'))!.map((one) => planItems.wordsOf(items.find((item) => item.key === one)!)),
    ).toEqual([
      'Tray clamp',
      'replace the gripper',
      'measure the offset',
      'write the report',
      'say it twice',
    ])
    // A row with nothing under it is its own subtree, and never empty.
    expect(subtrees.get(key('abc'))).toEqual([key('abc')])
  })

  it('picks the subtree in one press, and lets the whole of it go in the next', async () => {
    const reply = await read()
    const items = planItems.planItemsOf(reply.lines).items
    const key = (text: string) => items.find((item) => planItems.wordsOf(item) === text)!.key
    const subtree = planItems.subtreesOf(items).get(key('Tray clamp'))!

    const picked = planItems.pickedAfter(subtree, new Set())
    expect([...picked].sort()).toEqual([...subtree].sort())
    expect(planItems.shareOf(subtree, picked)).toBe('all')

    const gone = planItems.pickedAfter(subtree, picked)
    expect(gone.size).toBe(0)
  })

  it('finishes a subtree that was only partly picked, rather than emptying it', async () => {
    const reply = await read()
    const items = planItems.planItemsOf(reply.lines).items
    const key = (text: string) => items.find((item) => planItems.wordsOf(item) === text)!.key
    const subtree = planItems.subtreesOf(items).get(key('Tray clamp'))!

    const partly = new Set([key('replace the gripper')])
    expect(planItems.shareOf(subtree, partly)).toBe('some')
    const after = planItems.pickedAfter(subtree, partly)
    expect(planItems.shareOf(subtree, after)).toBe('all')
  })

  it('leaves rows outside the subtree exactly as they were', async () => {
    const reply = await read()
    const items = planItems.planItemsOf(reply.lines).items
    const key = (text: string) => items.find((item) => planItems.wordsOf(item) === text)!.key
    const subtree = planItems.subtreesOf(items).get(key('Tray clamp'))!

    const elsewhere = new Set([key('abc')])
    const after = planItems.pickedAfter(subtree, elsewhere)
    expect(after.has(key('abc'))).toBe(true)
    const off = planItems.pickedAfter(subtree, after)
    expect(off.has(key('abc'))).toBe(true)
    expect(off.has(key('Tray clamp'))).toBe(false)
  })
})
