// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ID NAMES ONE THING, AND A PATH NAMES ONE KEY.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Measured 18 August 2026 by an agent asked to break the revision ledger. A module was created
 * whose checklist held one id twice:
 *
 *     data.parts[0].items = [{ id: "twin", text: "first" }, { id: "twin", text: "second" }]
 *
 * POST /api/records answered 201. The first line was then rewritten, and the ledger said the two
 * revisions "hold exactly the same content" while the two stored `data` strings plainly differed.
 * The restore of the older revision answered "Nothing moved" and really did move the record back.
 *
 * ONE CAUSE, TWO PLACES IT SHOULD HAVE BEEN STOPPED.
 *
 *   THE WALK LOST AN ENTRY. `byId` in src/shared/fielddiff.ts wrote every entry into a map keyed by
 *   its id, so two entries with one id collapsed to the last of them on BOTH sides and every change
 *   to the earlier twin had nothing left to compare against. It now refuses to pair such an array
 *   at all and reports it whole, which is the honest reading: an id that appears twice is not an
 *   identity, so pairing by it is a claim the data does not support.
 *
 *   THE DUPLICATE WAS ACCEPTED. src/shared/kinds.ts says of a checklist line's id, of a part's id
 *   and of a path's id that it is unique, and nothing enforced any of it. `validateData` now
 *   refuses two objects of one shape in one record sharing an id.
 *
 * THE SCOPE IS THE RECORD, not the array. `lastTouchedItem` in src/web/lib/attention.ts answers
 * "how long has this been doing?" by finding a checklist line by its id ALONE, and
 * `patchChecklistItem` addresses a line the same way, so two parts holding one line id is the same
 * damage as one part holding it twice.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE SPELLING OF A PATH, WHICH IS THE LAST HALF OF THE SAME FILE
 * ---------------------------------------------------------------------------------------
 *
 * Moving the walk into shared/fielddiff.ts changed how a key that is not a plain identifier is
 * drawn on the record page: `mm/s` used to be drawn as `mm/s` and is now drawn as `["mm/s"]`. That
 * is deliberate — it stops `{"a.b":1}` and `{"a":{"b":1}}` printing the same path, and it makes
 * these paths agree with what `mergeData` stores in `changes.field` — and nothing pinned it, so
 * the next reader could "fix" it back. The last two tests here pin it, including the agreement.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { diffValues, fieldsThatDiffer, pathStep } from '../src/shared/fielddiff.ts'
import { validateData, validateShape } from '../src/shared/kinds.ts'
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
import { AGENT, expectPanelError, freshDb, one, writeDataBypassingTheGate, type TestDb } from './helpers.ts'

// ============================================================================ the walk

/** A module checklist holding one part, whose two lines share the id `twin`. */
const twinned = (firstText: string, firstState: string) => ({
  parts: [
    {
      id: 'mount',
      name: 'Mount',
      items: [
        { id: 'twin', text: firstText, state: firstState },
        { id: 'twin', text: 'second', state: 'todo' },
      ],
    },
  ],
})

describe('two entries with one id are not the same entry', () => {
  it('reports the array as changed rather than reporting nothing at all', () => {
    const diffs = fieldsThatDiffer(twinned('first', 'todo'), twinned('first CHANGED', 'done'))

    // The old walk answered [] here, which is what made the ledger say two different revisions
    // held exactly the same content.
    expect(diffs).toHaveLength(1)
    const only = one(diffs, 'difference')
    expect(only.path).toBe('parts[#mount].items')
    expect(only.kind).toBe('changed')
    // Both sides are printed whole, so a reader sees what really moved even though no line of the
    // array can be named on its own.
    expect(only.before).toContain('"text":"first"')
    expect(only.after).toContain('"text":"first CHANGED"')
  })

  it('still walks an array whose ids are all different, so the fix did not give up on every array', () => {
    const before = { parts: [{ id: 'mount', items: [{ id: 'a', state: 'doing' }, { id: 'b', state: 'todo' }] }] }
    const after = { parts: [{ id: 'mount', items: [{ id: 'b', state: 'todo' }, { id: 'a', state: 'done' }] }] }
    const diffs = fieldsThatDiffer(before, after)

    // Reordered and one state changed: exactly one difference, named down to the line.
    expect(diffs.map((d) => d.path)).toEqual(['parts[#mount].items[#a].state'])
  })

  it('says nothing when two checklists really are the same, twins and all', () => {
    expect(fieldsThatDiffer(twinned('first', 'todo'), twinned('first', 'todo'))).toEqual([])
  })

  it('refuses to pair an array where only ONE side repeats an id', () => {
    const before = { items: [{ id: 'twin', text: 'first' }, { id: 'twin', text: 'second' }] }
    const after = { items: [{ id: 'twin', text: 'first' }] }
    const diffs = fieldsThatDiffer(before, after)
    expect(one(diffs, 'difference').path).toBe('items')
  })
})

// ============================================================================ the door

let t: TestDb
let checkBlocks: (value: unknown) => unknown
// THE AUTHORITY ON BLOCKS, imported the way every other test that needs it does: it reaches
// records.ts and through it SQLite, so `freshDb` has to have said which database first. See
// tests/summary-schema.test.ts, which carries the same two lines and the same reason.
beforeAll(async () => {
  t = await freshDb()
  checkBlocks = (await import('../src/server/lib/summary.ts')).validateSummaryBlocks
}, A_HOOK_THAT_IMPORTS_THE_SERVER)
afterAll(() => {
  t.close()
})

describe('a duplicate id is refused at the door', () => {

  /** A complete module, with the checklist handed in. */
  const moduleWith = (parts: unknown) => ({ context: 'A module for the duplicate-id tests.', parts })

  const refusalFor = (kind: 'module', data: unknown): string => {
    const result = validateData(kind, data)
    if (result.ok) throw new Error(`expected ${JSON.stringify(data)} to be refused, and it was stored`)
    return result.errors.map((e) => e.message).join('\n')
  }

  it('refuses two checklist lines in one part sharing an id, and names both of them', () => {
    const message = refusalFor('module', twinned('first', 'todo'))
    expect(message).toContain('data.parts[0].items[1].id is "twin"')
    expect(message).toContain('data.parts[0].items[0].id is "twin" too')
    // The reason is the shape's own published description of its id, so the rule a caller reads at
    // GET /api/kinds and the rule that refused the write are the same words.
    expect(message).toContain('A stable id, unique within the module.')
  })

  it('refuses two checklist lines in DIFFERENT parts sharing an id', () => {
    const message = refusalFor(
      'module',
      moduleWith([
        { id: 'one', name: 'One', items: [{ id: 'x', text: 'first', state: 'todo' }] },
        { id: 'two', name: 'Two', items: [{ id: 'x', text: 'second', state: 'todo' }] },
      ]),
    )
    expect(message).toContain('data.parts[1].items[0].id is "x"')
    expect(message).toContain('data.parts[0].items[0].id is "x" too')
  })

  it('refuses two parts sharing an id', () => {
    const message = refusalFor('module', moduleWith([
      { id: 'p', name: 'One', items: [] },
      { id: 'p', name: 'Two', items: [] },
    ]))
    expect(message).toContain('data.parts[1].id is "p"')
    expect(message).toContain('Two ModulePart objects in one record may not share an id')
  })

  it('refuses two paths sharing an id', () => {
    const data = {
      ...moduleWith([]),
      paths: [
        { id: 'calib', label: 'One', path: `${THE_TEST_FIXTURE_ROOT}/one`, kind: 'dir' },
        { id: 'calib', label: 'Two', path: `${THE_TEST_FIXTURE_ROOT}/two`, kind: 'dir' },
      ],
    }
    expect(refusalFor('module', data)).toContain('data.paths[1].id is "calib"')
  })

  it('accepts a checklist whose ids are all different, which is the control', () => {
    const result = validateData('module', moduleWith([
      { id: 'mount', name: 'Mount', items: [{ id: 'a', text: 'one', state: 'todo' }, { id: 'b', text: 'two', state: 'todo' }] },
      { id: 'detect', name: 'Detect', items: [{ id: 'c', text: 'three', state: 'todo' }] },
    ]))
    expect(result.ok).toBe(true)
  })

  it('answers the same about one part asked on its own, because a part carries lines too', () => {
    const part = { id: 'mount', name: 'Mount', items: [{ id: 'twin', text: 'first', state: 'todo' }, { id: 'twin', text: 'second', state: 'todo' }] }
    const result = validateShape('ModulePart', part)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.map((e) => e.path)).toEqual(['value.items[1].id'])
  })

  /**
   * WHAT A BLOCK HOLDS CARRIES IDS TOO, AND NOTHING CHECKED THEM.
   *
   * `IDS_CHECKED_ELSEWHERE` in kinds.ts stops the record-wide rule at `SummaryBlock`, correctly:
   * a block id is narrower than a record. summary.ts then checked block ids and chart series ids
   * and nothing else, so a measurement, a named value, a checklist item, an event and a tab could
   * all be written twice under one id. The damage is the damage this whole file is about — `byId`
   * refuses to pair an array whose ids repeat, so the change log stops being able to say which of
   * the two was edited — plus one more: the browser draws these rows keyed by that id, and React
   * given two of a kind edits the wrong row on screen.
   *
   * These go through `validateSummaryBlocks` rather than `validateData`, because that is where the
   * rule lives and where the refusal is written.
   */
  it('refuses two things inside one block sharing an id, and says which two', () => {
    const cases: { what: string; block: unknown; says: string }[] = [
      {
        what: 'measurements',
        block: { id: 'b', type: 'metrics', items: [
          { id: 'twin', label: 'one', value: '1' },
          { id: 'twin', label: 'two', value: '2' },
        ] },
        says: 'two measurements share the id "twin"',
      },
      {
        what: 'named values',
        block: { id: 'b', type: 'keyvalue', items: [
          { id: 'twin', label: 'one', value: '1' },
          { id: 'twin', label: 'two', value: '2' },
        ] },
        says: 'two named values share the id "twin"',
      },
      {
        what: 'checklist items',
        block: { id: 'b', type: 'checklist', items: [
          { id: 'twin', text: 'one', state: 'todo' },
          { id: 'twin', text: 'two', state: 'done' },
        ] },
        says: 'two items share the id "twin"',
      },
      {
        what: 'events',
        block: { id: 'b', type: 'timeline', items: [
          { id: 'twin', when: 'Monday', text: 'one' },
          { id: 'twin', when: 'Tuesday', text: 'two' },
        ] },
        says: 'two events share the id "twin"',
      },
      {
        what: 'tabs',
        block: { id: 'b', type: 'tabs', tabs: [
          { id: 'twin', label: 'one', blocks: [{ id: 'x1', type: 'text', text: 'a' }] },
          { id: 'twin', label: 'two', blocks: [{ id: 'x2', type: 'text', text: 'b' }] },
        ] },
        says: 'two tabs share the id "twin"',
      },
      {
        what: 'reference lines on a chart',
        block: { id: 'b', type: 'chart', spec: {
          kind: 'line',
          x: { label: 'x' },
          y: { label: 'y' },
          series: [{ id: 's', name: 's', points: [{ x: 1, y: 1 }] }],
          annotations: [
            { id: 'twin', axis: 'y', value: 1, label: 'one' },
            { id: 'twin', axis: 'y', value: 2, label: 'two' },
          ],
        } },
        says: 'annotation id "twin" is already used by annotation 0',
      },
    ]
    for (const one of cases) {
      let refusal = ''
      try {
        checkBlocks([one.block])
      } catch (err: unknown) {
        refusal = err instanceof Error ? err.message : String(err)
      }
      expect(refusal, `two ${one.what} with one id were stored`).not.toBe('')
      expect(refusal, `the refusal about two ${one.what} does not say which two`).toContain(one.says)
    }
  })

  /**
   * AND THE SCOPE IS THE BLOCK, WHICH IS THE CONTROL. Two checklists that both number their items
   * 1, 2, 3 are ordinary writing: nothing addresses an item except through the block holding it,
   * so a summary-wide rule here would refuse honest work. The block ids still have to differ, and
   * that is the rule one level up.
   */
  it('lets two different blocks use the same item ids, which is the control', () => {
    expect(() =>
      checkBlocks([
        { id: 'b-one', type: 'checklist', items: [{ id: 'i1', text: 'first', state: 'todo' }] },
        { id: 'b-two', type: 'checklist', items: [{ id: 'i1', text: 'also first', state: 'todo' }] },
      ]),
    ).not.toThrow()
  })
})

// ============================================================================ through the product

describe('the write path refuses a duplicate id and stores nothing', () => {
  it('answers 400 for a module whose checklist holds one id twice', () => {
    const before = t.api.listRecords({ workspaceId: 'default' }).length
    const error = expectPanelError(
      t,
      () =>
        t.api.createRecord({
          workspaceId: 'default',
          kind: 'module',
          title: 'twins',
          data: { context: 'why', ...twinned('first', 'todo') },
          actor: AGENT,
        }),
      400,
    )
    expect(error.message).toContain('may not share an id')
    expect(t.api.listRecords({ workspaceId: 'default' })).toHaveLength(before)
  })

  it('answers 400 for an incident whose direct causes share an id, so the walk holds the incident shapes too', () => {
    // MEASURED, NOT ASSUMED, the way `Elevation` and `NotebookEntry` were measured before this:
    // the same walk that refuses a module's twin checklist items refuses an incident's twin
    // causes, because the walk goes through every shape's lists and nobody told it to skip this
    // one. The person files it, because filing is theirs (criterion I4) — but the refusal is the
    // id walk's, not the filing door's, and the message says so.
    const before = t.api.listRecords({ workspaceId: 'default' }).length
    const error = expectPanelError(
      t,
      () =>
        t.api.createRecord({
          workspaceId: 'default',
          kind: 'incident',
          title: 'twins on the timeline',
          data: {
            loss: 'A loss.',
            timeline: [{ id: 'm-1', at: 'now', who: 'the operator', what: 'Something happened.', evidence: 'ev-placeholder' }],
            direct_causes: [
              { id: 'c-1', text: 'first cause' },
              { id: 'c-1', text: 'second cause' },
            ],
          },
          actor: t.api.HUMAN,
        }),
      400,
    )
    expect(error.message).toContain('may not share an id')
    expect(t.api.listRecords({ workspaceId: 'default' })).toHaveLength(before)
  })

  it('still refuses a repeated summary block id, which another checker owns', () => {
    const block = (id: string, text: string) => ({ id, type: 'text', text })
    const error = expectPanelError(
      t,
      () =>
        t.api.createRecord({
          workspaceId: 'default',
          kind: 'module',
          title: 'two blocks, one id',
          data: { context: 'why', parts: [], summaryBlocks: [block('b-1', 'first'), block('b-1', 'second')] },
          actor: AGENT,
        }),
      400,
    )
    expect(error.message).toContain('already used by block 0')
  })

  it('lets a module that already holds twins be read, and refuses to tick either line', async () => {
    // Written round the gate, because the gate now refuses it. This is the state a module written
    // before the rule, or restored from an archive, is in — see writeDataBypassingTheGate.
    const module = t.api.createRecord({
      workspaceId: 'default',
      kind: 'module',
      title: 'twins from an older corpus',
      data: { context: 'why', parts: [{ id: 'mount', name: 'Mount', items: [{ id: 'twin', text: 'first', state: 'todo' }] }] },
      actor: AGENT,
    })
    writeDataBypassingTheGate(t, module.id, { context: 'why', ...twinned('first', 'todo') })

    const error = expectPanelError(t, () => t.api.patchChecklistItem(module.id, 'twin', { state: 'done' }, AGENT), 400)
    expect(error.message).toContain('used by 2 items in this module')
  })
})

// ============================================================================ how a path is spelt

describe('a key that is not a plain identifier is drawn in brackets', () => {
  it('brackets it, and dots a plain one', () => {
    expect(pathStep('', 'plain')).toBe('plain')
    expect(pathStep('data', 'context')).toBe('data.context')
    expect(pathStep('', 'mm/s')).toBe('["mm/s"]')
    expect(pathStep('nested', 'a-b')).toBe('nested["a-b"]')
    // The reason for the brackets: these two edits are different edits and must not print alike.
    expect(pathStep('', 'a.b')).toBe('["a.b"]')
    expect(pathStep('a', 'b')).toBe('a.b')
  })

  it('draws those paths on the record page, where a reader sees them', () => {
    const json = (v: unknown) => JSON.stringify(v)
    const diffs = diffValues(
      json({ 'mm/s': 1, plain: 1, nested: { 'a-b': 1 } }),
      json({ 'mm/s': 2, plain: 2, nested: { 'a-b': 2 } }),
    )
    expect(diffs?.map((d) => d.path)).toEqual(['["mm/s"]', 'plain', 'nested["a-b"]'])
  })
})

describe('the change log stores the path the diff draws', () => {
  /**
   * ONE SPELLING, PROVED BY COMPARING THE TWO PLACES IT COMES FROM.
   *
   * `mergeData` names the paths it writes into `changes.field` with `pathStep`, and so does the
   * walk that draws a change row. They are the same function, and this is the test that fails if
   * somebody gives either of them its own copy: it takes the field a real merge patch stored and
   * requires the diff of the same two values to name it letter for letter.
   */
  it('spells a key that is not an identifier the same way in both', () => {
    const note = t.api.createRecord({
      workspaceId: 'default',
      kind: 'note',
      title: 'a note with an awkward key',
      data: { body: 'the speed', extra: { 'mm/s': 1 } },
      actor: AGENT,
    })
    t.api.patchRecord(note.id, { dataPatch: { extra: { 'mm/s': 2 } } }, AGENT)

    const stored = t.api
      .listChanges({ workspaceId: 'default', recordId: note.id })
      .filter((c) => c.op === 'update')
      .map((c) => c.field)
    expect(stored).toEqual(['data.extra["mm/s"]'])

    const drawn = fieldsThatDiffer({ extra: { 'mm/s': 1 } }, { extra: { 'mm/s': 2 } })
    expect(one(drawn, 'difference').path).toBe('extra["mm/s"]')
    expect(`data.${one(drawn, 'difference').path}`).toBe(one(stored, 'change row field'))
  })
})
