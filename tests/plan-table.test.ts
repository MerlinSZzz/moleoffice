// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DENSE PLANNING TABLE: A ROW IS AN ITEM, AND EDITING A CELL EDITS THE DOCUMENT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT CAN SILENTLY STOP BEING TRUE HERE
 * ---------------------------------------------------------------------------------------
 *
 *   1. A ROW GOES BACK TO BEING A STORED LINE. Blank lines and prose then get rows, a heading shows
 *      its hashes and a pipe table's row of dashes becomes a row nobody can file. That is the state
 *      the audit measured and called "one editor and one mostly empty report".
 *   2. AN EDIT STOPS REACHING THE DOCUMENT. The table is only a second view of one store while a
 *      cell writes the line back. A cell that kept its value in the browser would look identical
 *      and the words would be gone on the next fetch.
 *   3. A MARKER IS LOST. Rewriting the words of `## Tray clamp` as `Tray clamp` turns a heading into
 *      prose, which changes the depth of everything under it. Nothing would fail.
 *   4. AN ABSENCE BECOMES A ZERO. Not one of the 203 pieces of work in the live corpus has an
 *      estimate and only three have any hours, so "nobody has sized this" and "0h" are the two
 *      cells this table draws most often, and drawing them the same is wrong two hundred times.
 *   5. THE WRITER'S OWN COLUMNS DISAPPEAR. The person's pipe table is a list of work, and if its headings
 *      are not columns the table is inert text.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT LOOKS LIKE THIS
 * ---------------------------------------------------------------------------------------
 *
 * The runner's environment is `node`, so there is no DOM: the component is rendered to static
 * markup and `fetch` is pointed at a real Fastify app through `app.inject`, exactly as
 * tests/plans-pages.test.ts does it. Every reply drawn below is the reply the server really wrote,
 * and every write below really lands in a database.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { checkSubtraction } from '../src/shared/disclosure.ts'
import Fastify, { type FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb, THIS_TEST_ONLY_DRAWS_THE_TABLE } from './helpers.ts'
import type { PlanBlocksReply, WorkListReply } from '../src/web/api.ts'

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
 * A plan written the way a person writes one: headings for the levels, bullets and numbers for the
 * pieces, one pipe table, prose in between, and one table Mole Office cannot read.
 */
const BODY = [
  '# Robotics',
  '## Tray clamp',
  '- replace the gripper',
  '- [ ] measure the offset',
  '- [x] read the datasheet',
  '1. order the part',
  '',
  'The gripper has been the long pole since June.',
  '',
  '| Task | Owner | Hours |',
  '| --- | --- | --- |',
  '| Calibrate the wrist | Sam | 3 |',
  '|Bolt the mount|me|1|',
  '',
  '## Object',
  '- abc',
  '',
  '| this table | has no dashes under it |',
  '| so it prints | exactly as typed |',
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

  // ONE ITEM IS REAL WORK, because a table where nothing is filed cannot show the two states side
  // by side, and the difference between them is the thing being tested.
  const filedLine = written.lines.find((line) => line.text === '- replace the gripper')!
  const filed = await webApi.api.fileLineAsWork(planId, filedLine.id, { kind: 'task', workspaceId: 'default' })
  await webApi.api.updateRecord(filed.recordId, { dataPatch: { state: 'doing', effort_hours: 6 } })
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

// ============================================================================ the item model

describe('a row is an item, not a stored line', () => {
  it('gives a row to every heading, bullet, tick box, numbered item and pipe row, and to nothing else', async () => {
    const reply = await read()
    const { items, notItems } = planItems.planItemsOf(reply.lines)

    expect(items.map((item) => item.text)).toEqual([
      'Robotics',
      'Tray clamp',
      'replace the gripper',
      'measure the offset',
      'read the datasheet',
      'order the part',
      'Calibrate the wrist',
      'Bolt the mount',
      'Object',
      'abc',
    ])
    // The blank lines, the one line of prose and the table Mole Office could not read are counted, not
    // dropped quietly. The row of dashes is furniture and is not an item at all.
    expect(notItems).toEqual({ blank: 4, prose: 1, unreadable: 2 })
  })

  /**
   * THE DEPTH COMES FROM THE TEXT, worked out by src/shared/planoutline.ts and never stored. A row
   * of a pipe table sits under the nearest heading above it, which is the rule a bullet follows.
   */
  it('gives every row its real depth and the items it sits under', async () => {
    const reply = await read()
    const { items } = planItems.planItemsOf(reply.lines)
    const at = (text: string) => items.find((item) => item.text === text)!

    expect(at('Robotics').depth).toBe(0)
    expect(at('Tray clamp').depth).toBe(1)
    expect(at('replace the gripper').depth).toBe(2)
    expect(at('order the part').depth).toBe(2)
    expect(at('Calibrate the wrist').depth).toBe(2)
    expect(at('Calibrate the wrist').above.map((one) => one.text)).toEqual(['Robotics', 'Tray clamp'])
    expect(at('abc').above.map((one) => one.text)).toEqual(['Robotics', 'Object'])
  })

  /**
   * THE PERSON'S OWN PIPE-TABLE HEADINGS BECOME COLUMNS AND THE PERSON DECLARES NOTHING. The first heading is not a
   * column because its cells are the rows' own words; printing them twice on one row says nothing.
   */
  it('turns the headings of the person’s own table into columns, minus the one holding the words', async () => {
    const reply = await read()
    const { items, yourColumns } = planItems.planItemsOf(reply.lines)
    expect(yourColumns).toEqual(['Owner', 'Hours'])

    const row = items.find((item) => item.text === 'Calibrate the wrist')!
    expect(row.kind).toBe('tableRow')
    expect(row.cells.map((cell) => [cell.heading, cell.value])).toEqual([
      ['Owner', 'Sam'],
      ['Hours', '3'],
    ])
  })

  /**
   * A TICK BOX IS DRAWN ONLY WHERE THE DOCUMENT CAN HOLD ONE. A plain bullet reads as not ticked and
   * gains a box when it is ticked; a heading, a numbered item and a pipe row read as null, because
   * src/shared/plandoc.ts does not read a box after a number and writing one there would put
   * characters in the document that Mole Office would never read back as a tick.
   */
  it('says which items can hold a tick box and which cannot', async () => {
    const reply = await read()
    const { items } = planItems.planItemsOf(reply.lines)
    const at = (text: string) => items.find((item) => item.text === text)!

    expect(at('replace the gripper').ticked).toBe(false)
    expect(at('measure the offset').ticked).toBe(false)
    expect(at('read the datasheet').ticked).toBe(true)
    expect(at('Robotics').ticked).toBeNull()
    expect(at('order the part').ticked).toBeNull()
    expect(at('Calibrate the wrist').ticked).toBeNull()
  })
})

// ============================================================================ writing a line back

describe('editing a cell writes the document, keeping the marker', () => {
  it('rewrites the words of a heading, a bullet, a numbered item and a pipe row', async () => {
    const reply = await read()
    const { items } = planItems.planItemsOf(reply.lines)
    const at = (text: string) => items.find((item) => item.text === text)!

    expect(planItems.lineWithWords(at('Tray clamp'), 'Tray clamp and wrist')).toBe('## Tray clamp and wrist')
    expect(planItems.lineWithWords(at('measure the offset'), 'measure it')).toBe('- [ ] measure it')
    expect(planItems.lineWithWords(at('order the part'), 'order two')).toBe('1. order two')
    expect(planItems.lineWithWords(at('Calibrate the wrist'), 'Calibrate the elbow')).toBe(
      '| Calibrate the elbow | Sam | 3 |',
    )
  })

  /**
   * THE SPACING INSIDE THE PERSON'S OWN CELLS IS KEPT. One row has spaces and one does not, and what
   * was typed is what is stored. That is the rule the whole plan editor rests on.
   */
  it('replaces one cell of a pipe row and leaves every other character exactly as typed', () => {
    expect(planItems.withCellReplaced('| Calibrate the wrist | Sam | 3 |', 1, THE_TEST_OFFICES_OWNER.name)).toBe(
      `| Calibrate the wrist | ${THE_TEST_OFFICES_OWNER.name} | 3 |`,
    )
    expect(planItems.withCellReplaced('|Bolt the mount|me|1|', 2, '4')).toBe('|Bolt the mount|me|4|')
    expect(planItems.withCellReplaced('| a | b', 1, 'c')).toBe('| a | c')
  })

  it('refuses a cell holding a pipe, because a pipe is what separates two cells', () => {
    expect(() => planItems.withCellReplaced('| a | b |', 0, 'x|y')).toThrow(/pipe/)
  })

  /**
   * TICKING A PLAIN BULLET TURNS IT INTO A TICK BOX IN THE TEXT. That is the visible half: the
   * writing view shows the box afterwards, because the document is where the tick is kept.
   */
  it('writes a tick box into a plain bullet and flips one that is already there', async () => {
    const reply = await read()
    const { items } = planItems.planItemsOf(reply.lines)
    const at = (text: string) => items.find((item) => item.text === text)!

    expect(planItems.lineWithTick(at('replace the gripper'), true)).toBe('- [x] replace the gripper')
    expect(planItems.lineWithTick(at('measure the offset'), true)).toBe('- [x] measure the offset')
    expect(planItems.lineWithTick(at('read the datasheet'), false)).toBe('- [ ] read the datasheet')
  })

  it('refuses to tick a heading, a numbered item or a row of the person’s table, naming which', async () => {
    const reply = await read()
    const { items } = planItems.planItemsOf(reply.lines)
    const at = (text: string) => items.find((item) => item.text === text)!

    expect(() => planItems.lineWithTick(at('Robotics'), true)).toThrow(/heading/)
    expect(() => planItems.lineWithTick(at('order the part'), true)).toThrow(/numbered/)
    expect(() => planItems.lineWithTick(at('Calibrate the wrist'), true)).toThrow(/row of your table/)
  })

  /**
   * THE WHOLE WAY THROUGH: a tick pressed in the table becomes characters in the stored document and
   * comes back as a ticked item. This is the test that fails the day the table keeps a tick of its
   * own instead of writing one.
   */
  it('stores the tick in the document and reads it back as a tick', async () => {
    const before = planItems.planItemsOf((await read()).lines)
    const item = before.items.find((one) => one.text === 'measure the offset')!
    expect(item.entry.line.text).toBe('- [ ] measure the offset')

    await webApi.api.saveLine(planId, item.entry.line.id, { text: planItems.lineWithTick(item, true) }, null)

    const after = planItems.planItemsOf((await read()).lines)
    const now = after.items.find((one) => one.text === 'measure the offset')!
    expect(now.entry.line.text).toBe('- [x] measure the offset')
    expect(now.ticked).toBe(true)

    // Put it back, so the rest of this file reads the plan it was written as.
    await webApi.api.saveLine(planId, now.entry.line.id, { text: planItems.lineWithTick(now, false) }, null)
  })

  /**
   * A HEADING STAYS A HEADING. Rewriting the words without the hashes would turn it into prose, and
   * everything written under it would change depth with nothing failing.
   */
  it('stores new words for a heading with its hashes still on it', async () => {
    const before = planItems.planItemsOf((await read()).lines)
    const item = before.items.find((one) => one.text === 'Object')!

    await webApi.api.saveLine(planId, item.entry.line.id, { text: planItems.lineWithWords(item, 'Object handling') }, null)

    const after = planItems.planItemsOf((await read()).lines)
    const now = after.items.find((one) => one.text === 'Object handling')!
    expect(now.entry.line.text).toBe('## Object handling')
    expect(now.kind).toBe('heading')
    expect(now.depth).toBe(1)
    // And what was written under it is still under it.
    expect(after.items.find((one) => one.text === 'abc')!.above.map((one) => one.text)).toEqual([
      'Robotics',
      'Object handling',
    ])

    await webApi.api.saveLine(planId, now.entry.line.id, { text: planItems.lineWithWords(now, 'Object') }, null)
  })
})

// ============================================================================ adding an item

/**
 * ADDING AN ITEM IS WRITING ONE NEW LINE OF THE DOCUMENT, AT A PLACE THE READER CAN PREDICT.
 *
 * WHAT CAN SILENTLY STOP BEING TRUE HERE:
 *
 *   1. THE NEW LINE LANDS SOMEWHERE ELSE. It goes directly after the line the reader pressed on. At
 *      the end of the document instead, the item is nowhere near the work it belongs with and the
 *      indent the table drew was a lie.
 *   2. THE DEPTH CHANGES. The marker is what `src/shared/planoutline.ts` reads the depth off, so a
 *      new item written with a different marker sits at a different level from the row it was added
 *      under, with nothing failing.
 *   3. A TICK BOX ARRIVES TICKED. Copying "[x]" off the row above files a claim that the new item is
 *      already done, which nobody made.
 *   4. THE PERSON'S OWN TABLE STOPS BEING A TABLE. A pipe row with the wrong number of cells makes
 *      `src/shared/plandoc.ts` print the whole run as typed, so adding a row would destroy the
 *      columns of the table it was added to.
 *   5. THE PRESS IS OFFERED WHERE THE WRITE CANNOT REACH THE WRITING BOX. That is the measured
 *      defect at the head of PlanTable.tsx, arriving through a new door.
 */
describe('adding an item writes one line, where the reader can see it will go', () => {
  /** A plan of its own, so a test that adds lines cannot move the rows another test reads. */
  async function aPlanOf(body: string): Promise<{ id: string; lines: () => Promise<PlanBlocksReply> }> {
    const written = await webApi.api.newPlan(`adding ${Date.now()}-${Math.random()}`, body)
    return { id: written.plan.id, lines: () => webApi.api.planBlocks(written.plan.id) }
  }

  /** The plan as one piece of text, which is what the writing box holds. */
  async function documentOf(id: string): Promise<string> {
    const reply = await webApi.api.planBlocks(id)
    return reply.lines.map((entry) => entry.line.text).join('\n')
  }

  it('writes a sibling with the same marker after a bullet, a tick box and a numbered item', async () => {
    const plan = await aPlanOf(['- replace the gripper', '  - [x] read the datasheet', '1. order the part'].join('\n'))
    const { items } = planItems.planItemsOf((await plan.lines()).lines)
    const at = (text: string) => items.find((one) => one.text === text)!

    const afterBullet = planItems.newItemAfter(at('replace the gripper'))
    expect(afterBullet.marker).toBe('- ')
    expect(afterBullet.lineFor('fit the new one')).toBe('- fit the new one')
    expect(afterBullet.depth).toBe(at('replace the gripper').depth)

    // A TICK BOX STARTS UNTICKED, and it keeps the two spaces the item above it was indented with,
    // because those spaces are what make it a child of the bullet above rather than its sibling.
    const afterTick = planItems.newItemAfter(at('read the datasheet'))
    expect(afterTick.marker).toBe('  - [ ] ')
    expect(afterTick.lineFor('read the wiring diagram')).toBe('  - [ ] read the wiring diagram')
    expect(afterTick.depth).toBe(at('read the datasheet').depth)

    // A NUMBERED ITEM TAKES THE NEXT NUMBER, rather than a second "1.".
    const afterNumber = planItems.newItemAfter(at('order the part'))
    expect(afterNumber.marker).toBe('2. ')
    expect(afterNumber.lineFor('order the spare')).toBe('2. order the spare')
  })

  /**
   * AN ALREADY-UNTICKED TICK BOX. It crashed the whole plan page and nothing here named it.
   *
   * The new item's marker was worked out by replacing whatever box the row above holds with an empty
   * one, and the guard asked whether that replacement changed the string. On `- [x] read it` it does.
   * On `- [ ] read it` it does not, because the box was already empty, so the guard read the most
   * ordinary row in a plan as a line with no tick box in it and threw.
   *
   * IT THREW WHILE THE PAGE WAS BEING DRAWN, not on a press. `newItemAfter` is called for every row
   * as the table renders, so one unticked box took the whole plan off the screen — the document, the
   * table and whatever had not been saved. There is no error boundary around it and there should not
   * need to be one.
   *
   * The guard now asks whether the marker HOLDS a box, which is the question it was always for.
   */
  it('adds an item under a tick box that is already unticked, and draws the page it is on', async () => {
    const plan = await aPlanOf(['- [ ] measure the offset', '- [x] read the datasheet'].join('\n'))
    const reply = await plan.lines()
    const { items } = planItems.planItemsOf(reply.lines)
    const unticked = items.find((one) => one.text === 'measure the offset')!
    expect(unticked.ticked, 'the row this is about is the unticked one').toBe(false)

    const made = planItems.newItemAfter(unticked)
    expect(made.kind).toBe('tickbox')
    expect(made.marker).toBe('- [ ] ')
    expect(made.lineFor('measure it again')).toBe('- [ ] measure it again')

    // THE WHOLE PAGE, NOT ONLY THE RULE. This is the half that failed: the throw happened during the
    // render, so the test that would have caught it as a crash has to be a render.
    expect(words(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: plan.id, lines: reply.lines, onWrote: () => {} }))).toContain(
      'measure the offset',
    )
  })

  /**
   * A HEADING GETS AN ITEM UNDER IT, one level deeper. It is the only way to give a heading its
   * first item from this table, and a heading is a place to put work rather than work itself.
   */
  it('writes a bullet one level deeper under a heading', async () => {
    const plan = await aPlanOf(['# Robotics', '## Tray clamp', '- replace the gripper'].join('\n'))
    const { items } = planItems.planItemsOf((await plan.lines()).lines)
    const gripper = items.find((one) => one.text === 'Tray clamp')!

    const made = planItems.newItemAfter(gripper)
    expect(made.kind).toBe('bullet')
    expect(made.marker).toBe('- ')
    expect(made.depth).toBe(gripper.depth + 1)
  })

  /**
   * A ROW OF THE PERSON'S OWN TABLE KEEPS THE PERSON'S SPACING AND CELL COUNT. The new row is built by emptying
   * the cells of the row above it, so it cannot come out with a cell too few — which would make
   * Mole Office print the whole table as typed instead of reading it.
   */
  it('writes a row of the person’s own table with the person’s spacing and every other cell empty', async () => {
    const plan = await aPlanOf(
      ['| Task | Owner | Hours |', '| --- | --- | --- |', '| Calibrate the wrist | Sam | 3 |', '|Bolt the mount|me|1|'].join(
        '\n',
      ),
    )
    const { items } = planItems.planItemsOf((await plan.lines()).lines)
    const spaced = items.find((one) => one.text === 'Calibrate the wrist')!
    const tight = items.find((one) => one.text === 'Bolt the mount')!

    expect(planItems.newItemAfter(spaced).lineFor('Level the table')).toBe('| Level the table |  |  |')
    expect(planItems.newItemAfter(tight).lineFor('Level the table')).toBe('|Level the table|||')
  })

  /**
   * THE WHOLE WAY THROUGH, AGAINST THE REAL SERVER: the line lands in the document directly after
   * the row it was added under, and Mole Office reads it back at the depth the box promised.
   */
  it('lands the new line straight after the row it was added under, at the depth it said', async () => {
    const plan = await aPlanOf(['# Robotics', '## Tray clamp', '- replace the gripper', '## Object'].join('\n'))
    const { items } = planItems.planItemsOf((await plan.lines()).lines)
    const gripper = items.find((one) => one.text === 'Tray clamp')!
    const made = planItems.newItemAfter(gripper)

    const { line } = await webApi.api.addLineAfter(
      plan.id,
      made.lineFor('measure the offset'),
      made.afterLineId,
      'the test adds one under the heading', null,
    )
    expect(line.text).toBe('- measure the offset')

    // IN THE DOCUMENT, on the line after the heading. This is the string the writing box holds.
    expect(await documentOf(plan.id)).toBe(
      ['# Robotics', '## Tray clamp', '- measure the offset', '- replace the gripper', '## Object'].join('\n'),
    )

    // AND AT THE DEPTH THE BOX DREW IT AT. The depth is worked out from the characters, so this is
    // what fails the day the marker stops matching the level the reader was shown.
    const after = planItems.planItemsOf((await plan.lines()).lines)
    const written = after.items.find((one) => one.key === line.id)!
    expect(written.depth).toBe(made.depth)
    expect(written.kind).toBe(made.kind)
    expect(written.above.map((one) => one.text)).toEqual(['Robotics', 'Tray clamp'])
  })

  /** The first item of a plan with none goes at the END, because the lines already there are words. */
  it('writes the first item of a plan at the end of what is already written', async () => {
    const plan = await aPlanOf('I have been thinking about the gripper.')
    const { line } = await webApi.api.addLineAfter(
      plan.id,
      planItems.A_FIRST_ITEM.lineFor('replace the gripper'),
      planItems.A_FIRST_ITEM.afterLineId,
      'the first item the plan gets', null,
    )
    expect(await documentOf(plan.id)).toBe('I have been thinking about the gripper.\n- replace the gripper')
    const after = planItems.planItemsOf((await plan.lines()).lines)
    expect(after.items.map((one) => one.text)).toEqual(['replace the gripper'])
    expect(after.items[0]!.key).toBe(line.id)
  })

  /**
   * THE PLUS IS ONLY OFFERED WHERE THE WRITE CAN REACH THE WRITING BOX. Same rule as the words, the
   * tick and the person's own cells: a line written with nowhere to put the re-read is a line the next
   * keystroke in the box would take away again.
   */
  it('draws the plus only when a re-read has somewhere to go', async () => {
    const reply = await read()
    const withPlace = body(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines, onWrote: () => {} }))
    const without = body(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines }))

    expect(withPlace).toContain('aria-label="Add an item after &quot;replace the gripper&quot;"')
    // A heading says "under", because that is where the item really goes.
    expect(withPlace).toContain('aria-label="Add an item under &quot;Tray clamp&quot;"')
    expect(without).not.toContain('Add an item after')
    expect(without).not.toContain('Add an item under')
  })

  it('offers the first item of an empty plan only when a re-read has somewhere to go', async () => {
    const plan = await aPlanOf('I have been thinking about the gripper.')
    const only = (await plan.lines()).lines
    const offered = { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: plan.id, lines: only, onWrote: () => {} }
    expect(words(h(planTable.PlanTable, offered))).toContain('Add the first item')
    const alone = words(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: plan.id, lines: only }))
    expect(alone).not.toContain('Add the first item')
    // 7FEOshq3mBGG gives both empty readings the short mark.
    expect(alone).toMatch(/^—(?: |$)/)
    expect(words(h(planTable.PlanTable, offered))).toMatch(/^—(?: |$)/)
  })

  /**
   * A PLAN NOBODY HAS WRITTEN IN AT ALL CAN BE GIVEN ITS FIRST ITEM HERE, AND UNTIL NOW COULD NOT.
   *
   * Which plan a write belongs to used to be read off the lines, and a plan with no lines has none
   * to read, so the press was withheld on the one screen where adding the first item is the only
   * thing there is to do. The plan is a prop now, so the id is there whether or not a line is, and
   * the write really lands — this makes one, against the real server, and reads the plan back.
   */
  it('gives a plan that holds no lines at all its first item, from the table', async () => {
    const empty = await webApi.api.newPlan(`nothing written ${Date.now()}`)
    const none = (await webApi.api.planBlocks(empty.plan.id)).lines
    expect(none).toHaveLength(0)
    const said = words(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: empty.plan.id, lines: none, onWrote: () => {} }))
    expect(said).toContain('Add the first item')
    // The empty table keeps its short mark beside the first-item press.
    expect(said).toMatch(/^—(?: |$)/)

    // AND THE WRITE REACHES THE PLAN. A press that only ever answers with an error is worse than no
    // press, so the words on screen are not the whole claim.
    const { line } = await webApi.api.addLineAfter(
      empty.plan.id,
      planItems.A_FIRST_ITEM.lineFor('replace the gripper'),
      planItems.A_FIRST_ITEM.afterLineId,
      'the first item this empty plan gets', null,
    )
    const after = planItems.planItemsOf((await webApi.api.planBlocks(empty.plan.id)).lines)
    expect(after.items.map((one) => one.text)).toEqual(['replace the gripper'])
    expect(after.items[0]!.key).toBe(line.id)
  })

  /** A caller with nowhere to put a re-read still may not add, on an empty plan as on any other. */
  it('withholds the first item on an empty plan when a re-read has nowhere to go', async () => {
    const empty = await webApi.api.newPlan(`read only ${Date.now()}`)
    const none = (await webApi.api.planBlocks(empty.plan.id)).lines
    const said = words(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: empty.plan.id, lines: none }))
    expect(said).not.toContain('Add the first item')
    expect(said).toMatch(/^—(?: |$)/)
  })

  /** What is about to be written, said in words for a reader who cannot see the marker beside the box. */
  it('says what a new item will be and how deep it will sit', async () => {
    const plan = await aPlanOf(['# Robotics', '## Tray clamp', '- replace the gripper'].join('\n'))
    const { items } = planItems.planItemsOf((await plan.lines()).lines)
    const at = (text: string) => items.find((one) => one.text === text)!

    expect(planItems.sayWhatIsBeingAdded(planItems.newItemAfter(at('Tray clamp')))).toBe(
      'A new bullet at level 3.',
    )
    expect(planItems.sayWhatIsBeingAdded(planItems.A_FIRST_ITEM)).toBe('A new bullet at the top level.')
  })
})

// ============================================================================ absence is not zero

describe('an absence is never drawn as a number', () => {
  it('says why it cannot read the hours, rather than showing none', () => {
    const reading = planItems.hoursOf(null, { id: 'anything', kind: 'task' })
    expect(reading.periods).toBeNull()
    expect(reading.because).toContain('not finished reading')
  })

  it('tells work that has no hours from work the list never reached', () => {
    const reply: WorkListReply = {
      rows: [
        {
          id: 'has-none',
          kind: 'task',
          title: 'A task',
          name: 'A task',
          within: null,
          summary: null,
          state: null,
          workspaceId: 'default',
          above: [],
          aboveStopped: null,
          parentsInOtherProjects: [],
          estimateHours: null,
          hoursGiven: [],
          origin: null,
          incompleteCount: 0,
          due: null,
        },
      ],
      counted: 40,
      returned: 1,
      cap: 1,
      leftOut: 39,
      subtraction: { candidates: 40, carried: 1, leftOut: 39, shortened: 0 },
      leftOutGroups: [{ cause: 'budget', bucket: 'row_limit', count: 39, ids: Array.from({ length: 39 }, (_, n) => `never-read-${n}`) }],
      order: 'as written',
      kinds: ['task'],
      kindsBecause: 'the kinds a plan may give hours to',
      note: 'cut short',
    }

    checkSubtraction('plan table fixture', reply.subtraction, reply.leftOutGroups)
    expect(planItems.hoursOf(reply, { id: 'has-none', kind: 'task' })).toEqual({ periods: [], because: null })

    const missing = planItems.hoursOf(reply, { id: 'never-read', kind: 'task' })
    expect(missing.periods).toBeNull()
    expect(missing.because).toContain('stopped at 1 of 40')

    // A kind the work list does not carry is a different answer again, and it names the kinds.
    const wrongKind = planItems.hoursOf(reply, { id: 'a-note', kind: 'note' })
    expect(wrongKind.periods).toBeNull()
    expect(wrongKind.because).toContain('this is a note')
  })
})

// ============================================================================ the drawn table

describe('the table as it is drawn', () => {
  it('shows the words without their markers, and no row of dashes anywhere', async () => {
    const reply = await read()
    const markup = body(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines, onWrote: () => {} }))

    // The words are in boxes you type in, and the box holds the words rather than the source line.
    // The words sit in boxes that grow with them, so the words are the box's own text.
    expect(markup).toContain('>Robotics</textarea>')
    expect(markup).toContain('>Tray clamp</textarea>')
    expect(markup).toContain('>replace the gripper</textarea>')
    expect(markup).not.toContain('# Robotics')
    expect(markup).not.toContain('>- replace the gripper</textarea>')
    // A pipe table's row of dashes is furniture. It used to become a row nobody could file.
    expect(markup).not.toContain('---')
  })

  it('draws the headings of the person’s own table as columns of the planning table', async () => {
    const reply = await read()
    const said = words(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines }))
    expect(said).toContain('Owner')
    expect(said).toContain('Hours')
    // The person's cells are boxes you type in, so the person's words are the value of a box rather than text on the
    // page. That is the whole point: the table is edited here, not read here.
    const markup = body(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines, onWrote: () => {} }))
    expect(markup).toContain('>Sam</textarea>')
    expect(markup).toContain('aria-label="Owner, from your own table"')
  })

  /**
   * A ROW NOBODY IS TRACKING SAYS SO QUIETLY AND OFFERS THE PRESS.
   *
   * THE WEIGHT WENT AND THE FACT DID NOT, which is the rule in `design/ROUND-FOUR.md`. "not tracked
   * as work" would be reading text on every untracked row — nine of them here — and it is ordinary
   * emptiness by that document's own test: the reader does nothing about it, and the press beside it
   * already says what they would do. It is a dimmed dash, with the whole sentence still read out to a
   * screen reader and still on the tooltip. The one place those words are written out is the line of
   * totals, which counts them.
   *
   * THE PRESS IS CALLED "Track", A SHORT, PLAIN LABEL, because the old phrase was visually
   * heavy and repeated many times.
   * It was "Make it real work".
   *
   * ONE PRESS PER ROW, NOT TWO. Both ways of tracking a line are inside the form it opens, so
   * "Point at work that exists" is not on the table nine times over — see TrackPress.
   */
  it('draws an untracked row quietly, keeps the sentence, and offers one press rather than two', async () => {
    const reply = await read()
    const said = words(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines }))
    // The sentence survives the quietening. It is not drawn, and it is read out.
    // The words changed with finding 34 of the language audit; the CLAIM did not. What this is
    // about is that a row nobody tracks says so where a screen reader reaches it, rather than being
    // drawn quiet and left silent.
    expect(said).toMatch(/nobody is tracking|not tracked as work/i)
    // AND IT IS NOT SAID IN READING TEXT ON EVERY ROW. Nine rows here are untracked; the only place
    // those words are written is the one line of totals under the table.
    expect(said.split('not tracked as work')).toHaveLength(2)
    expect(said).toContain('Track')
    expect(said).not.toContain('Make it real work')
    expect(said).not.toContain('Point at work that exists')
  })

  /**
   * THE OTHER WAY EXISTS AND SAYS WHAT IT DOES. Pointing a line at work that already exists is the
   * repair for the one thing editing a plan destroys, and until this pass nothing in the browser
   * called the route at all.
   */
  it('offers pointing a line at work that already exists, and makes nothing when it does', async () => {
    const acts = { planId, reload: async () => {}, behind: false, workList: null, today: null, versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE }
    const reply = await read()
    const item = planItems.planItemsOf(reply.lines).items[0]!
    const markup = body(h(planItems.PointAtWork, { item, acts, onDone: () => {} }))
    // The form is the box you narrow the work with and the list under it. The sentence that used to
    // sit above them said what the press that opens this form already says, so it is gone.
    expect(markup).toContain('aria-label="Narrow the work by name"')
    expect(markup).not.toContain('Point this line at work that already exists')
    expect(words(h(planItems.PointAtWork, { item, acts, onDone: () => {} }))).toContain(
      'has not finished reading the work',
    )
  })

  /**
   * "NOBODY LOOKED" AND "THERE ARE NONE" ARE TOLD APART, AND NEITHER SHOUTS.
   *
   * This is the cell that pair matters most in: almost nothing in the corpus has hours, so a cell
   * drawing the two the same way would be wrong on nearly every row. It used to draw both as a grey
   * phrase, and the reason Mole Office could not say ran to a whole sentence on every row. It is a mark
   * now, dashed for the one nobody has read, and the sentence is on it.
   */
  it('offers hours on a row that is real work, and tells nobody-looked apart from there-are-none', async () => {
    const reply = await read()
    const said = words(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines }))
    const markup = body(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines }))
    expect(said).toContain('Give it time')
    // GET /api/work is fetched in an effect, which does not run without a browser, so the cell says
    // what it does not know instead of drawing an empty period list as "no hours".
    expect(said).toContain('not read')
    // THE DASHED EDGE IS THE CHANNEL "nobody looked" SURVIVES IN. An answer somebody established is
    // enclosed in nothing at all; this one is enclosed in a dashed edge. Deleting the distinction is
    // the failure the fifth invariant exists to prevent.
    expect(markup).toContain('data-edge="dashed"')
    expect(markup).toContain('has not finished reading the hours')
    // AND THE SENTENCE IS NOT READING TEXT ANY MORE. It is on the mark, not beside it.
    expect(said).not.toContain('Mole Office has not finished reading the hours')
  })

  /**
   * THE TOTAL IS AN ENVELOPE AND IT SAYS WHAT IT COULD NOT COUNT.
   *
   * This plan is one top-level heading — Robotics — holding everything else, and exactly one row
   * inside it is tracked work with a 6h estimate. So the plan comes to 6h and it comes to 6h whether
   * the total is read off the roots or off every row, because only one row has an estimate at all.
   * The full envelope arithmetic, with a parent that has its own number and children that exceed it,
   * is proved in `tests/envelope.test.ts` and again over a real plan below.
   */
  it('says what its total could not count', async () => {
    const reply = await read()
    const said = words(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines }))
    expect(said).toContain('6h in all, from 1 of 1 top-level rows')
    // "9 nobody has sized" until 18 August 2026. It counts rows whose TRACKED work carries no
    // estimate, so it counted a row somebody had sized in the plan's own words as unsized, an inch
    // from the clause that counts those. See `planTotalSaid` in PlanTable.tsx.
    expect(said).toContain('9 not sized as work')
    expect(said).toContain('9 not tracked as work')
    expect(said).toContain('4 blank lines are not shown')
    expect(said).toContain('1 line of prose')
    expect(said).toContain('2 lines Mole Office could not read')
  })

  /**
   * ONE DECLARATION PER COLUMN, AND ONE PLACE ITS HEADING IS DRAWN: the row of headings.
   *
   * THERE IS ONE ARRANGEMENT NOW. There used to be a second — a card per item carrying a label
   * beside every value — and it was drawn at 557px beside the writing box, which is a desk. The
   * count below is the whole point of deleting it: a heading appears ONCE however many rows there
   * are, so a plan of a hundred items costs a hundred rows and not a hundred labels.
   *
   * WHICH COLUMNS ARE DRAWN WHEN THE TABLE HAS LITTLE ROOM IS MEASURED IN A REAL BROWSER, in
   * `tests/plan-writing.test.ts`. It is read off the table's own box, and nothing in a server render
   * has a box.
   */
  it('heads the table with the words the columns are declared with, once each', async () => {
    const reply = await read()
    const wide = words(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines }))
    expect(body(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines }))).toContain('<table')

    // The writer's own heading is here too, and it is left out of the count below on purpose: it is
    // named inside the sentence a row that is not in the person's table carries, which is that row saying
    // what it is not rather than a second label.
    expect(wide, 'Owner').toContain('Owner')

    // THE SIX COLUMNS: Task, Type, Estimate, Schedule, Project, Note.
    // "Where it stands" is gone — its state word is a mark beside the task and its kind is Type.
    for (const heading of ['Task', 'Type', 'Estimate', 'Schedule', 'Project', 'Note']) {
      expect(wide, heading).toContain(heading)
      // ONCE, on a plan of ten items. Two would mean a second arrangement had come back.
      expect(wide.split(heading), heading).toHaveLength(2)
    }
  })

  /**
   * THE ANCESTOR PATH IS A COLUMN ONLY ONCE THE TABLE IS FLAT. Nested, the indent already says it,
   * and a column repeating what the indent says is a column that earns nothing.
   */
  it('keeps the ancestor path out of the columns until the table is flattened', async () => {
    const reply = await read()
    const said = words(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines }))
    expect(said).not.toContain('Where it sits')
    expect(said).toContain('Show every level, flat')
  })

  /**
   * A PLAN OF PROSE HAS NOTHING TO PLAN, AND SAYS SO RATHER THAN DRAWING AN EMPTY GRID. The prose
   * is still counted, because it is what somebody wrote and "there is nothing here" would be false.
   */
  it('says a plan of prose holds nothing to plan, and counts the prose anyway', async () => {
    const written = await webApi.api.newPlan('Only prose', 'I have been thinking about the gripper.\n\nIt is slow.')
    const only = (await webApi.api.planBlocks(written.plan.id)).lines
    const said = words(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: written.plan.id, lines: only }))
    expect(said).toMatch(/^—(?: |$)/)
    expect(said).toContain('2 lines of prose')
    expect(said).toContain('1 blank line is not shown')
  })

  /**
   * WHICH PLAN A CELL WRITES TO IS SAID BY THE CALLER AND CHECKED AGAINST THE LINES.
   *
   * The plan is a prop because a plan with no lines still has an id, and that makes it the same
   * fact in two places. So the two are made to agree here rather than left to drift: a line
   * belonging to another plan is a broken assumption and is thrown. Both ways round are checked,
   * because a caller naming the wrong plan and a fetch bringing back the wrong lines are two
   * different mistakes, and either one writes a cell into a plan nobody is looking at.
   */
  it('refuses to draw lines that belong to another plan', async () => {
    const reply = await read()
    const other = await webApi.api.newPlan('Another plan', '- something else')
    const otherLines = (await webApi.api.planBlocks(other.plan.id)).lines

    // Lines from two plans at once.
    expect(() => body(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: [...reply.lines, ...otherLines] }))).toThrow(
      new RegExp(other.plan.id),
    )
    // And every line of one plan, drawn under the name of another.
    expect(() => body(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: otherLines }))).toThrow(new RegExp(other.plan.id))
    // A table cannot infer a plan by joining the plans of several lines either: its caller is the
    // one answer, and every line has to agree with that answer.
    expect(() => body(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: [...reply.lines, ...otherLines] }))).toThrow(
      new RegExp(other.plan.id),
    )
  })
})

// ============================================================================ one store, two views

/**
 * THE TABLE IS A VIEW OF THE PAGE'S COPY OF THE PLAN, NOT A SECOND COPY OF IT.
 *
 * MEASURED DEFECT. A row's words were changed in the table to "CALIBRATED-IN-TABLE"; the server
 * stored it; the table showed it; the writing box was still holding the plan as it was before, and
 * one character typed there stored the old words back over the new ones, with nothing said. Two
 * copies of one document and the stale one won.
 *
 * What stops it is that every re-read this table makes goes to `onWrote`, which is the page's own
 * copy — the same copy the writing box is seeded from. A caller that gives no `onWrote` has nowhere
 * to put the answer, so the three controls that rewrite a line are not drawn at all: offering a
 * write that is about to be undone is the defect, not the cure for it.
 */
describe('the table is a view of the page copy of the plan, not a second copy', () => {
  it('draws the words, your own cells and the tick boxes as boxes only when a re-read has somewhere to go', async () => {
    const reply = await read()
    const withPlace = body(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines, onWrote: () => {} }))
    const without = body(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines }))

    // Given somewhere to put what it reads back, every one of the three is a control.
    expect(withPlace).toContain('aria-label="The words of this item"')
    expect(withPlace).toContain('aria-label="Owner, from your own table"')
    expect(withPlace).toContain('aria-label="Tick measure the offset"')

    // Given nowhere, not one of them is drawn, and the words are still all there to read.
    expect(without).not.toContain('aria-label="The words of this item"')
    expect(without).not.toContain('aria-label="Owner, from your own table"')
    expect(without).not.toContain('aria-label="Tick measure the offset"')
    expect(without).not.toContain('aria-label="Untick read the datasheet"')
    expect(words(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines }))).toContain('replace the gripper')
    expect(words(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines }))).toContain('Sam')

    /**
     * AND A LINE WITH NO TICK BOX IS GIVEN NO MARK. A plain bullet reads as "not ticked" only
     * because ticking one WRITES a box into it; that is an offer, not something in the document.
     * Drawing an empty box beside a bullet where the offer cannot be made would put a mark on the
     * screen that is in nobody's plan. Two of the ten items here really hold one.
     */
    const marks = without.match(/class="pi-tick-read"/g) ?? []
    expect(marks).toHaveLength(2)
    expect(without).toContain('☑')
    expect(without).toContain('☐')
  })

  /**
   * EVERY RE-READ GOES TO THE PAGE AS WELL AS TO THIS TABLE. Dropping the second of those two is
   * the whole defect: the table showed the new words, the page's copy still held the old ones, and
   * the writing box seeded from that copy put them back.
   */
  it('hands a re-read of the plan to the page as well as to its own drawing', async () => {
    const reply = await read()
    const toTable: (readonly unknown[])[] = []
    const toPage: (readonly unknown[])[] = []

    planTable.putReadBack(
      (lines) => toTable.push(lines),
      (lines) => toPage.push(lines),
    )(reply.lines)
    expect(toTable).toEqual([reply.lines])
    expect(toPage).toEqual([reply.lines])

    // And a table with nowhere to send it still draws what it read, rather than throwing.
    const alone: (readonly unknown[])[] = []
    planTable.putReadBack((lines) => alone.push(lines), undefined)(reply.lines)
    expect(alone).toEqual([reply.lines])
  })

  /**
   * AND THE TOKEN GOES WITH THE LINES, so the page can name the copy it is writing on top of.
   *
   * The page's next save carries it as `ifVersion`, which is what lets the server refuse a save
   * built on writing somebody has already replaced. Handed lines with no token the page is not
   * unsafe — it reads the plan and compares the words before it sends anything — but it spends a
   * whole extra read working out what this read already knew.
   */
  it('hands the page the token naming the copy of the plan it just read', async () => {
    const reply = await read()
    const toPage: { lines: readonly unknown[]; version: string | undefined }[] = []

    planTable.putReadBack(
      () => {},
      (lines, version) => toPage.push({ lines, version }),
    )(reply.lines, reply.version)

    expect(toPage).toHaveLength(1)
    expect(toPage[0]!.version).toBe(reply.version)
    expect(reply.version.length).toBeGreaterThan(0)
  })

  it('says where the words are changed instead, when they cannot be changed here', async () => {
    const reply = await read()
    expect(words(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines }))).toContain(
      'Change the words of an item in the Writing view of this plan',
    )
    // And never says it when they can be, because a sentence about a limit that is not there is a
    // sentence that teaches the reader something false.
    expect(words(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines, onWrote: () => {} }))).not.toContain(
      'Change the words of an item in the Writing view',
    )
  })

  /**
   * THE CELL THAT DOES NOT TOUCH THE DOCUMENT IS STILL OFFERED. The estimate of a filed row is on
   * the record, so the writing box cannot undo it, and withdrawing it would be a refusal with no
   * reason behind it.
   *
   * THE NOTE USED TO BE ON THIS LIST AND IS NOT ANY MORE, and the change is deliberate:
   * `design/ROUND-FIVE.md` decision 1 puts every planning value, the note included, in the line's
   * own words until it is promoted. While the note was a column of the database, writing one changed
   * no character of the document. It rewrites the line now, so a note written where the page's copy
   * of the plan cannot be told about it is a note the next keystroke in the writing box would put
   * the old words back over — the measured defect at the head of this block, arriving through the
   * one cell that used to be outside it.
   *
   * SO THE GATE IS WHAT IS MEASURED, not the note going away: given somewhere to send a re-read the
   * box is there, and given nowhere it is not.
   */
  it('still offers the estimate and the three presses when the words are read only, and the note follows the words', async () => {
    const reply = await read()
    const markup = body(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines }))
    expect(markup).toMatch(/aria-label="How many hours .* takes"/)
    expect(words(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines }))).toContain('Track')
    expect(words(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines }))).toContain('Give it time')

    // The note is a line of the document now, so it is a box only where a rewritten line has
    // somewhere to go.
    expect(markup).not.toContain('aria-label="Your own note about this item"')
    const withPlace = body(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines, onWrote: () => {} }))
    expect(withPlace).toContain('aria-label="Your own note about this item"')
  })
})

// ============================================================================ filing one line

/**
 * WHAT A LINE CAN BECOME, AND WHERE IT STANDS ONCE IT HAS.
 *
 * Both of these were wrong in a way no type and no test caught. The menu offered `block`, which the
 * server refuses for every caller because a block's place in its pipeline and half its title live
 * on that pipeline. And filing wrote no state at all, so every record a plan made landed on the
 * work page reading "no state written" while Home counted it among the records with no state.
 */
describe('filing a line as work', () => {
  /** A fresh plan of one bullet per press, so each test files a line nothing else has touched. */
  async function aLineOfItsOwn(text: string): Promise<{ plan: string; line: string }> {
    const written = await webApi.api.newPlan(`filing ${text}`, `- ${text}`)
    return { plan: written.plan.id, line: written.lines[0]!.id }
  }

  it('offers exactly the kinds the server will really file, checked against the server', async () => {
    const { KINDS_A_PLAN_CAN_GIVE_HOURS_TO } = await import('../src/shared/work.ts')

    for (const kind of planItems.KINDS_A_PLAN_LINE_CAN_BE_FILED_AS) {
      const where = await aLineOfItsOwn(`offered ${kind} ${Date.now()}`)
      const filed = await webApi.api.fileLineAsWork(where.plan, where.line, { kind, workspaceId: 'default' })
      expect(filed.recordId, kind).toBeTruthy()
    }

    // AND THE ONES LEFT OFF ARE LEFT OFF BECAUSE THEY REALLY ARE REFUSED. `block` may hold hours
    // and cannot be filed on its own, which is why one list could not answer both questions.
    const leftOff = KINDS_A_PLAN_CAN_GIVE_HOURS_TO.filter(
      (kind) => !planItems.KINDS_A_PLAN_LINE_CAN_BE_FILED_AS.includes(kind),
    )
    expect(leftOff).not.toHaveLength(0)
    for (const kind of leftOff) {
      const where = await aLineOfItsOwn(`left off ${kind} ${Date.now()}`)
      await expect(
        webApi.api.fileLineAsWork(where.plan, where.line, { kind, workspaceId: 'default' }),
        kind,
      ).rejects.toThrow()
    }
  })

  it('names a state its own kind really declares, or none at all', async () => {
    const { KIND_SPECS, declaredTypeOf } = await import('../src/shared/kinds.ts')

    for (const kind of planItems.KINDS_A_PLAN_LINE_CAN_BE_FILED_AS) {
      const chosen = planItems.STATE_A_FILED_LINE_STARTS_IN[kind]
      const field = KIND_SPECS[kind].fields.find((one) => one.key === 'state')
      if (field === undefined) {
        // A kind with no state field must be given none. Inventing one would store a word the
        // schema does not have.
        expect(chosen, kind).toBeUndefined()
        continue
      }
      const declared = declaredTypeOf(field)
      expect(declared.kind, kind).toBe('literals')
      expect(chosen, kind).toBeDefined()
      expect(declared.kind === 'literals' ? declared.values : [], kind).toContain(chosen)
    }
  })

  /**
   * WHAT THE PRESS ACTUALLY SENDS, not what a test rebuilt by hand. `whatFilingSends` is the very
   * call the press makes, so removing the state from the press fails this.
   */
  it('really stores a state on the record the press makes', async () => {
    for (const kind of planItems.KINDS_A_PLAN_LINE_CAN_BE_FILED_AS) {
      const where = await aLineOfItsOwn(`state written ${kind} ${Date.now()}`)
      const filed = await webApi.api.fileLineAsWork(
        where.plan,
        where.line,
        planItems.whatFilingSends(kind, 'default'),
      )
      const made = await webApi.api.getRecord(filed.recordId)
      const stored = (made.record.data as { state?: unknown }).state
      expect(stored, kind).toBe(planItems.STATE_A_FILED_LINE_STARTS_IN[kind])
    }
    // And the one it is really about: a filed task is on the work page with somewhere it stands,
    // rather than as one more row saying nobody has said.
    const where = await aLineOfItsOwn(`todo ${Date.now()}`)
    const filed = await webApi.api.fileLineAsWork(where.plan, where.line, planItems.whatFilingSends('task', 'default'))
    expect(((await webApi.api.getRecord(filed.recordId)).record.data as { state?: unknown }).state).toBe('todo')
  })

  /**
   * THE SAME ACT THROUGH EITHER DOOR MAKES THE SAME RECORD.
   *
   * MEASURED DEFECT. The press worked the starting state out in the browser and sent it, so a person
   * pressing "Make it real work" filed a task that stood at "todo" and an agent posting the very same
   * body to `POST /api/plans/:id/lines/:lineId/file-as-work` filed one with NO state — which lands on
   * the work page as "No state written" while Home complains that records have no state anybody can
   * read. The product was manufacturing the thing it scolds about, through the door agents use.
   *
   * The rule now lives in `STATE_A_FILED_LINE_STARTS_IN` in src/server/lib/plans.ts, which is the one
   * place both doors pass through. This files a line each way and compares the records.
   */
  it('files the same record whether the press names the state or an agent names nothing', async () => {
    let counter = 0
    for (const kind of planItems.KINDS_A_PLAN_LINE_CAN_BE_FILED_AS) {
      counter += 1
      const byPress = await aLineOfItsOwn(`pressed ${kind} ${counter} ${Date.now()}`)
      const pressed = await webApi.api.fileLineAsWork(
        byPress.plan,
        byPress.line,
        planItems.whatFilingSends(kind, 'default'),
      )
      counter += 1
      const byAgent = await aLineOfItsOwn(`posted ${kind} ${counter} ${Date.now()}`)
      const posted = await webApi.api.fileLineAsWork(byAgent.plan, byAgent.line, { kind, workspaceId: 'default' })

      const stateOf = async (id: string) =>
        ((await webApi.api.getRecord(id)).record.data as { state?: unknown }).state ?? null
      const byHand = await stateOf(pressed.recordId)
      const byRoute = await stateOf(posted.recordId)
      expect(byRoute, `filing a ${kind} means one thing from the browser and another from the API`).toBe(byHand)

      // AND IT IS A STATE, for every kind that has the field. "They agree on nothing" would pass the
      // line above and is exactly the state this test was written about.
      const { KIND_SPECS } = await import('../src/shared/kinds.ts')
      const hasField = KIND_SPECS[kind].fields.some((one) => one.key === 'state')
      if (hasField) expect(typeof byRoute, kind).toBe('string')
      else expect(byRoute, kind).toBeNull()
    }
  })

  /**
   * THE ROUTE SAYS WHAT IT WROTE AND WHY, so a rule applied on this side of the wire is not a rule
   * applied behind the caller's back. That is the difference between a stated rule and a silent
   * default, and it is the same arrangement `linesOfDocument` is in for line endings.
   */
  it('says which state it wrote, whether the caller named it, and why', async () => {
    const where = await aLineOfItsOwn(`answered ${Date.now()}`)
    const filed = await webApi.api.fileLineAsWork(where.plan, where.line, { kind: 'task', workspaceId: 'default' })
    expect(filed.startsIn.state).toBe('todo')
    expect(filed.startsIn.named).toBe(false)
    expect(filed.startsIn.why).toContain('todo')
    expect(filed.startsIn.why).toContain('nobody has started it')

    // A kind with no state field says that, rather than saying nothing at all.
    const none = await aLineOfItsOwn(`answered with none ${Date.now()}`)
    const asDirection = await webApi.api.fileLineAsWork(none.plan, none.line, {
      kind: 'direction',
      workspaceId: 'default',
    })
    expect(asDirection.startsIn.state).toBeNull()
    expect(asDirection.startsIn.named).toBe(false)
    expect(asDirection.startsIn.why).toContain('does not have one')
  })

  /**
   * A CALLER WHO KNOWS BETTER IS OBEYED EXACTLY. The rule fills a silence; it never argues with a
   * statement. An agent filing a line for work already under way says so and gets what it said.
   */
  it('writes the state the caller named and does not put its own over it', async () => {
    const where = await aLineOfItsOwn(`already started ${Date.now()}`)
    const filed = await webApi.api.fileLineAsWork(where.plan, where.line, {
      kind: 'task',
      workspaceId: 'default',
      data: { state: 'doing' },
    })
    expect(filed.startsIn).toEqual({
      state: 'doing',
      named: true,
      why: 'You named the state "doing", so that is what was written and nothing here changed it.',
    })
    expect(((await webApi.api.getRecord(filed.recordId)).record.data as { state?: unknown }).state).toBe('doing')

    // AND A CALLER CANNOT ASK FOR A RECORD WITH NO STATE. Sending it as null is not a way round the
    // rule above: the schema does not declare null as one of a task's words, so the whole request is
    // refused and nothing is written. The refusal is the schema's and this file adds nothing to it.
    const asNothing = await aLineOfItsOwn(`asked for no state ${Date.now()}`)
    await expect(
      webApi.api.fileLineAsWork(asNothing.plan, asNothing.line, {
        kind: 'task',
        workspaceId: 'default',
        data: { state: null },
      }),
    ).rejects.toThrow(/must be one of/)
  })

  /**
   * THE TWO PLACES THE ONE RULE IS WRITTEN, HELD TOGETHER BY THIS.
   *
   * The server decides what a filed line starts as. The browser still holds a copy, because the form
   * says the word on screen BEFORE the press — Starts as "todo" — and a sentence about what is about
   * to happen cannot be fetched from the thing that has not happened yet. So the same fact is written
   * twice and this is what stops the two drifting apart with nothing failing.
   *
   * The browser's copy should go, and the sentence should be read from the server's own declaration
   * the way `GET /api/kinds` is read. Until it does, changing one of these two fails here.
   */
  it('says the same thing in the browser as it does on the server', async () => {
    const server = await import('../src/server/lib/plans.ts')
    const serverSays = Object.fromEntries(
      Object.entries(server.STATE_A_FILED_LINE_STARTS_IN).map(([kind, one]) => [kind, one.state]),
    )
    expect(serverSays, 'the browser and the server disagree about what a filed line starts as').toEqual({
      ...planItems.STATE_A_FILED_LINE_STARTS_IN,
    })
  })

  /**
   * WHAT EACH TYPE MEANS IS STILL THE SCHEMA'S OWN WORDS, AND IT IS NOW BEHIND THE HELP MARK.
   *
   * The owner on 17 August 2026: "The explanatory prose for every type … should not permanently fill
   * the page. Keep concise labels visible and put definitions behind the existing help affordance."
   * They were four paragraphs under four buttons on this form. `Hint` is a native details element, so
   * the words are still in the page and still reachable — they are not drawn until it is opened, and
   * nothing is hidden from a screen reader or from find-in-page.
   */
  it('says what each kind is for, in the words the schema itself declares', async () => {
    const { KIND_SPECS } = await import('../src/shared/kinds.ts')
    const said = words(h(planItems.WhatTheTypesMean))
    for (const kind of planItems.KINDS_A_PLAN_LINE_CAN_BE_FILED_AS) {
      expect(said, kind).toContain(KIND_SPECS[kind].purpose)
    }
    // And it says where the thing it makes will stand, rather than leaving a person to find out on
    // another page that it stands nowhere.
    expect(said).toContain('Starts as "todo"')
    expect(said).toContain('has no state, so it gets none')
  })

  /**
   * THE FORM ASKS NOTHING, BECAUSE THE TABLE ALREADY HOLDS BOTH ANSWERS.
   *
   * The owner's §6 and §7 in one change: Type and Project are columns, so the form that used to hold
   * a four-button type picker and a project menu is a sentence, a Track press and a Close press.
   */
  it('asks no question the Type and Project columns already answer', async () => {
    const reply = await read()
    const item = planItems.planItemsOf(reply.lines).items[0]!
    const said = words(
      h(planItems.MakeItWork, {
        items: [item],
        acts: { planId, reload: async () => {}, behind: false, workList: null, today: null, versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE },
        onDone: () => {},
      }),
    )
    // What it will do, before the press, naming the type and the project it will use.
    expect(said).toContain('Tracked as a task in')
    expect(said).toContain('Track')
    // And neither question is asked again here.
    expect(said).not.toContain('What sort of thing this is')
    expect(said).not.toContain('Which project')
    // The lead sentence is gone: it said "File this as work in one of your projects", which is the
    // button, the project menu and the heading under it saying the same thing a fourth time.
    expect(said).not.toContain('File this as work in one of your projects')
  })
})

// ============================================================================ one arithmetic, over a real plan

/**
 * THE FOOTER IS AN ENVELOPE, NOT A SUM. It was the owner's own defect, on 17 August 2026.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * The Plan page footer said 44h where the Schedule, over the same nesting, said 12h. It added every
 * tracked row's estimate row by row, so a piece of work and a part of that same work were both
 * counted. The owner's rule: "Parent time is an envelope; child time is its breakdown, never an addition.
 * If a parent has an explicit value, prefer displaying the parent's value."
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS TESTED HERE AND NOT ONLY IN tests/envelope.test.ts
 * ---------------------------------------------------------------------------------------
 *
 * That file proves the ARITHMETIC. This one proves the TABLE hands it the right tree: a row's parent
 * is the item it is written under in the document, read out of the outline, and getting that wrong
 * turns every child into a root and brings the plain sum back with the right function underneath it.
 * Both plans below are written to a real server and read back through the real route.
 */
describe('the plan footer counts a parent and its parts once', () => {
  /** Track one line as work and give the record an estimate, in the one request that does both. */
  async function trackWith(plan: string, lineId: string, hours: number | null): Promise<string> {
    const filed = await webApi.api.fileLineAsWork(plan, lineId, {
      kind: 'task',
      workspaceId: 'default',
      ...(hours === null ? {} : { data: { effort_hours: hours } }),
    })
    return filed.recordId
  }

  /**
   * A plan whose parent says 15h and whose two parts say 5h and 4h.
   *
   * THE PARENT IS A BULLET AND NOT A HEADING, deliberately: a heading cannot be tracked as work with
   * an estimate on it, and the case the owner met is a piece of work holding parts of itself.
   */
  async function fifteenOverNineAndSix(): Promise<PlanBlocksReply> {
    const written = await webApi.api.newPlan(
      `envelope ${String(Date.now())}`,
      ['- rewrite the controller', '  - calibrate the jig', '  - write the report'].join('\n'),
    )
    const at = (text: string) => written.lines.find((line) => line.text.trim().endsWith(text))!.id
    await trackWith(written.plan.id, at('rewrite the controller'), 15)
    await trackWith(written.plan.id, at('calibrate the jig'), 5)
    await trackWith(written.plan.id, at('write the report'), 4)
    return webApi.api.planBlocks(written.plan.id)
  }

  it('shows the parent value, explains the difference, and never adds a part to what holds it', async () => {
    const reply = await fifteenOverNineAndSix()
    const said = words(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: reply.plan.id, lines: reply.lines }))

    // ONE NUMBER, THE PARENT'S. Added row by row this plan is 24h; it is 15h.
    expect(said).toContain('15h in all, from 1 of 1 top-level rows')
    expect(said).not.toContain('24h in all')
    // AND THE OTHER NUMBER IS STILL SAID, in the same words the Schedule already uses for the same
    // shape of arithmetic, so a reader who has met one has met both.
    expect(said).toContain('A part is never added to what holds it, so the rows themselves come to 24h')
    // Nothing overflows here, so no floor is claimed and no warning is drawn.
    expect(said).not.toContain('takes at least')
  })

  it('does the arithmetic in exactly one place, which is src/shared/envelope.ts', async () => {
    const reply = await fifteenOverNineAndSix()
    const { items } = planItems.planItemsOf(reply.lines)
    const totals = planTable.planEffortOf(items)
    const parent = totals.byId.get(items[0]!.key)

    expect(parent?.own).toBe(15)
    expect(parent?.breakdown).toBe(9)
    expect(parent?.shown).toBe(15)
    // 6h of the 15 is not broken down. That is a real answer and it is not zero.
    expect(parent?.notBrokenDown).toBe(6)
    expect(parent?.over).toBeNull()
    expect(totals.total).toBe(15)
    expect(totals.ownHoursAdded).toBe(24)
  })

  /**
   * WHEN THE PARTS EXCEED THE ENVELOPE, THE OWNER'S NUMBER STAYS AND A RED MARK APPEARS BESIDE IT.
   *
   * The explicit 15h stays visible, with a clear red warning
   * beside it. Clicking the warning can explain that the parts currently total 18h and exceed the
   * plan by 3h. Nothing is corrected — both numbers are true and only a person can say which one
   * is wrong.
   */
  it('keeps the parent number and marks the row where the parts add up to more', async () => {
    const written = await webApi.api.newPlan(
      `over ${String(Date.now())}`,
      ['- rewrite the controller', '  - calibrate the jig', '  - write the report'].join('\n'),
    )
    const at = (text: string) => written.lines.find((line) => line.text.trim().endsWith(text))!.id
    await trackWith(written.plan.id, at('rewrite the controller'), 15)
    await trackWith(written.plan.id, at('calibrate the jig'), 10)
    await trackWith(written.plan.id, at('write the report'), 8)
    const reply = await webApi.api.planBlocks(written.plan.id)

    const markup = body(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: reply.plan.id, lines: reply.lines }))
    const said = words(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: reply.plan.id, lines: reply.lines }))

    // The explicit number is still what the row and the plan say.
    expect(markup).toContain('value="15"')
    expect(said).toContain('15h in all, from 1 of 1 top-level rows')
    // AND THE WARNING IS THERE, with both numbers and the difference, behind a mark you press.
    expect(markup).toContain('class="pi-over"')
    expect(said).toContain('The parts of this add up to 18h, which is 3h more than the 15h written here')
    // AND CAPACITY IS TOLD THE TRUTH RATHER THAN THE ENVELOPE. 18 does not fit inside 15.
    expect(said).toContain('takes at least 18h')
  })

  /**
   * AND A PARENT NOBODY SIZED IS DERIVED FROM ITS PARTS, drawn as derived rather than as an estimate
   * somebody gave. "If the parent has no explicit value, derive its displayed total from its
   * children."
   */
  it('derives an unsized parent from its parts and says that is where the number came from', async () => {
    const written = await webApi.api.newPlan(
      `derived ${String(Date.now())}`,
      ['- rewrite the controller', '  - calibrate the jig', '  - write the report'].join('\n'),
    )
    const at = (text: string) => written.lines.find((line) => line.text.trim().endsWith(text))!.id
    await trackWith(written.plan.id, at('rewrite the controller'), null)
    await trackWith(written.plan.id, at('calibrate the jig'), 5)
    await trackWith(written.plan.id, at('write the report'), 4)
    const reply = await webApi.api.planBlocks(written.plan.id)
    const said = words(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: reply.plan.id, lines: reply.lines }))

    expect(said).toContain('9h from its parts')
    expect(said).toContain('9h in all, from 1 of 1 top-level rows')
    // The rows themselves also come to 9h, so the sentence about the difference is not drawn.
    expect(said).not.toContain('the rows themselves come to')
  })

  /**
   * AND IT ROUNDS. `PlanTable.tsx` used to round nothing at all, so two estimates of 0.1 and 0.2
   * printed as 0.30000000000000004 on a planning screen — the same defect `round2` in
   * shared/planning.ts was written for, in a second place.
   */
  it('rounds, so a tenth and two tenths are three tenths', async () => {
    const written = await webApi.api.newPlan(
      `rounding ${String(Date.now())}`,
      ['- first', '- second'].join('\n'),
    )
    const at = (text: string) => written.lines.find((line) => line.text.trim().endsWith(text))!.id
    await trackWith(written.plan.id, at('first'), 0.1)
    await trackWith(written.plan.id, at('second'), 0.2)
    const reply = await webApi.api.planBlocks(written.plan.id)
    const said = words(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: reply.plan.id, lines: reply.lines }))

    expect(said).toContain('0.3h in all')
    expect(said).not.toContain('0.30000000000000004')
  })
})

// ============================================================================ Type and Project in their columns

/**
 * TYPE AND PROJECT ARE COLUMNS OF THE TABLE, ON BOTH SIDES OF TRACKING.
 *
 * The owner, 17 August 2026: "The current UI has a Project column but the actual project choice
 * appears inside the expanded Make a new record interaction. That is backwards." And about Type:
 * "After I file/track a planning line, I currently cannot naturally change what kind of thing it is.
 * A mistaken first choice must not permanently lock the record."
 */
describe('the Type column', () => {
  it('is a menu of exactly the kinds a line can be tracked as, before it is tracked', async () => {
    const reply = await read()
    const markup = body(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines }))
    expect(markup).toContain('class="pi-type-pick"')
    for (const kind of planItems.KINDS_A_PLAN_LINE_CAN_BE_FILED_AS) {
      expect(markup, kind).toContain(`value="${kind}"`)
    }
    // `block` may hold hours and cannot be tracked on its own — the server refuses it every time —
    // so it is not offered. See KINDS_A_PLAN_LINE_CAN_BE_FILED_AS.
    expect(markup).not.toContain('value="block"')
  })

  it('remembers what Track will use, before anything is written', async () => {
    const written = await webApi.api.newPlan(`type before ${String(Date.now())}`, '- reprint the mount')
    const lineId = written.lines[0]!.id
    expect(planItems.kindChosenFor(written.plan.id, lineId)).toBe('task')
    planItems.chooseKindFor(written.plan.id, lineId, 'problem')
    expect(planItems.kindChosenFor(written.plan.id, lineId)).toBe('problem')

    // AND THE PRESS USES IT. `whatFilingSends` is what the press really sends, so this is a claim
    // about the write rather than about a variable.
    const reply = await webApi.api.planBlocks(written.plan.id)
    const item = planItems.planItemsOf(reply.lines).items[0]!
    const said = words(
      h(planItems.MakeItWork, {
        items: [item],
        acts: { planId: written.plan.id, reload: async () => {}, behind: false, workList: null, today: null, versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE },
        onDone: () => {},
      }),
    )
    expect(said).toContain('Tracked as a problem in')
  })

  /**
   * AND AFTER TRACKING IT WRITES TO THE RECORD, through the route that arrived in this same pass.
   *
   * This is the round trip and not a rendering: a real record really changes kind, and what the
   * table draws next is read back off the server.
   */
  it('changes the kind of a record that is already tracked', async () => {
    const written = await webApi.api.newPlan(`type after ${String(Date.now())}`, '- reprint the mount')
    const filed = await webApi.api.fileLineAsWork(written.plan.id, written.lines[0]!.id, {
      kind: 'task',
      workspaceId: 'default',
    })
    const answer = await webApi.api.setWorkKind(filed.recordId, 'problem', 'default')
    expect(answer.record.kind).toBe('problem')
    expect(answer.kindChange?.changed).toBe(true)

    const after = await webApi.api.planBlocks(written.plan.id)
    expect(after.lines[0]!.work?.kind).toBe('problem')
    const markup = body(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: written.plan.id, lines: after.lines }))
    // The cell is a menu, standing on what the record now is.
    expect(markup).toContain('class="pi-type-pick"')
    expect(markup).toContain('<option value="problem" selected="">problem</option>')
  })

  /**
   * AND NOTHING STORED IS DISCARDED. A task's `state` is "todo"; a direction has no state field at
   * all, so that answer is MOVED into `extra` and the reply names where it went. The cell draws that
   * sentence, because it is the only place a person is told their own answer moved.
   */
  it('keeps what the new kind has no place for, and the reply says where it went', async () => {
    const written = await webApi.api.newPlan(`type keeps ${String(Date.now())}`, '- reprint the mount')
    const filed = await webApi.api.fileLineAsWork(written.plan.id, written.lines[0]!.id, {
      kind: 'task',
      workspaceId: 'default',
      data: { state: 'todo' },
    })
    const answer = await webApi.api.setWorkKind(filed.recordId, 'direction', 'default')
    expect(answer.kindChange?.kept.map((one) => one.key)).toContain('state')
    expect(answer.kindChange?.note.length).toBeGreaterThan(0)
    // The value itself is still readable, at the path the reply named.
    expect(answer.record.data).toHaveProperty('extra')
  })

  /**
   * AND THE FORM STOPS ASKING. The project a line is tracked into is read off the Project column's
   * own words, and what Mole Office made of those words is said before the press, not after it.
   */
  it('reads the project a line is tracked into out of the line, and says what it made of the words', async () => {
    const written = await webApi.api.newPlan(
      `project words ${String(Date.now())}`,
      '- reprint the mount {project: nowhere-at-all}',
    )
    const reply = await webApi.api.planBlocks(written.plan.id)
    const item = planItems.planItemsOf(reply.lines).items[0]!

    // Nobody has read the projects here, and the line names one, so the press waits rather than
    // filing into a project nobody chose.
    const said = words(
      h(planItems.MakeItWork, {
        items: [item],
        acts: { planId: written.plan.id, reload: async () => {}, behind: false, workList: null, today: null, versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE },
        onDone: () => {},
      }),
    )
    expect(said).toContain('has not finished reading your projects')

    // AND THE RULE ITSELF, WITHOUT A BROWSER: words that name no project are not guessed at.
    // Only the two fields the rule reads; the rest of a project's row is nothing to do with this.
    const known = [
      { id: 'default', title: 'Default', records: 0, isDefault: true, note: null, reviewLevel: null, packageInspection: null, createdAt: '', updatedAt: '' },
    ]
    expect(planItems.projectForTracking(item, known, 'default')).toEqual({
      id: 'default',
      why:
        'This line says the project is "nowhere-at-all" and there is no project called that, so this goes in ' +
        '"default". The words stay in the line.',
    })
    // A line that names one by its stored id goes there, with nothing to explain.
    const named = planItems.planItemsOf(
      (await webApi.api.planBlocks(
        (await webApi.api.newPlan(`project id ${String(Date.now())}`, '- reprint {project: Default}')).plan.id,
      )).lines,
    ).items[0]!
    // Matched on the project's own TITLE, ignoring case, because that is what a person writes.
    expect(planItems.projectForTracking(named, known, 'somewhere-else')).toEqual({ id: 'default', why: null })
  })
})
