// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PLANS: THE WRITING HALF OF PLANNING, OVER HTTP.
 *
 * What these tests are about, in one sentence each:
 *
 *   - A document comes back exactly as it was typed, through SQLite, blank lines and all.
 *   - Filing a line as work creates the record and binds the line IN ONE TRANSACTION, and a refusal
 *     leaves both the plan and the project exactly as they were.
 *   - Filing does NOT copy the title afterwards: the words and the title drift apart and both are
 *     reported, because disagreement is drawn and never repaired.
 *   - Giving a line time writes ONE ordinary allocation, which records the line it came from.
 *   - Saving a document does not restamp lines nobody changed, because "written since you read
 *     this" is computed from those stamps.
 *
 * Everything goes through the real routes on a throwaway database, because the boundary being
 * proved is what a caller can and cannot make happen. One test office serves every case: it is made
 * once, and emptied before each case, so each case starts as it did before.
 *
 * The cases that restated binding-loss and loss-reporting rules already proved in
 * tests/plan-line-keeps-its-work.test.ts and tests/plan-loss-is-said.test.ts were taken out. The
 * unique route rules, the marker stripping and the filing transaction stay.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { BuiltServer } from '../src/server/index.ts'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: BuiltServer['app']
/** The projects the office is born with, kept when every other row a case wrote is cleared. */
let theWorkspaces: string[] = []

/** The document every round-trip test uses: the shapes a line-oriented store damages. */
const DOCUMENT = [
  '# ICRA submission',
  '',
  'target: September   ',
  '## Must',
  '- [ ] baseline',
  '- 数据采集',
  '',
  '| What | How big |',
  '|---|---|',
  '| baseline | 20h |',
  '',
  'Maybe: gaze',
].join('\n')

beforeAll(async () => {
  t = await freshDb()
  const { apiApp } = await import('./helpers.ts')
  app = (await apiApp()).app
  theWorkspaces = (t.client.sqlite.prepare('SELECT id FROM workspaces').all() as { id: string }[]).map((row) => row.id)
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

/**
 * EMPTY THE OFFICE BEFORE EACH CASE, so one office can serve them all and each case starts as it
 * did when every case made its own. Links go before the records they name; the plan tables name no
 * record, so their order among themselves does not matter. A project a case made is dropped too;
 * the projects the office was born with are kept.
 */
beforeEach(() => {
  const db = t.client.sqlite
  db.exec(`
    DELETE FROM links;
    DELETE FROM changes;
    DELETE FROM revisions;
    DELETE FROM records;
    DELETE FROM plan_lines;
    DELETE FROM plans;
    DELETE FROM allocations;
    DELETE FROM planning_intents;
    DELETE FROM plan_line_revisions;
  `)
  const born = new Set(theWorkspaces)
  for (const row of db.prepare('SELECT id FROM workspaces').all() as { id: string }[]) {
    if (!born.has(row.id)) db.prepare('DELETE FROM workspaces WHERE id = ?').run(row.id)
  }
})

type Json = Record<string, unknown>

/**
 * The person whose plan this is, in the headers the browser sends for every request.
 *
 * Named rather than typed out at each call because "who is asking" now decides whether a request is
 * allowed at all: a person may mark a plan as read, and an agent only as a secretary under their grant.
 */
const READER = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }

/** An agent writing to somebody else's plan, which is the case the read band exists for. */
const NIGHTLY_BOT = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'nightly-bot' }

function bodyOf(res: { body: string }): Json {
  return JSON.parse(res.body) as Json
}

async function newPlan(body?: string): Promise<{ id: string; lines: { id: string; text: string }[] }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/plans',
    payload: body === undefined ? { title: 'ICRA submission' } : { title: 'ICRA submission', body },
  })
  expect(res.statusCode, res.body).toBe(201)
  const made = bodyOf(res)
  return {
    id: (made['plan'] as { id: string }).id,
    lines: made['lines'] as { id: string; text: string }[],
  }
}

/** The plan's lines as stored, read back through the route a reader uses. */
async function linesOf(id: string): Promise<{ id: string; text: string; recordId: string | null }[]> {
  const res = await app.inject({ method: 'GET', url: `/api/plans/${id}` })
  expect(res.statusCode, res.body).toBe(200)
  const rows = bodyOf(res)['lines'] as { line: { id: string; text: string; recordId: string | null } }[]
  return rows.map((row) => row.line)
}

function countRows(table: string): number {
  return (t.client.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n
}

// ============================================================ the document comes back as it was

describe('a document is stored as lines and comes back exactly as it was typed', () => {
  it('joins back into the document, character for character', async () => {
    const plan = await newPlan(DOCUMENT)
    const stored = await linesOf(plan.id)
    expect(stored.map((line) => line.text).join('\n')).toBe(DOCUMENT)
  })

  it('keeps the blank lines and the trailing spaces rather than tidying them', async () => {
    const plan = await newPlan(DOCUMENT)
    const stored = await linesOf(plan.id)
    expect(stored.filter((line) => line.text === '')).toHaveLength(3)
    expect(stored.some((line) => line.text === 'target: September   ')).toBe(true)
  })

  it('a plan with no body has no lines at all, which is not the same as one blank line', async () => {
    const plan = await newPlan()
    expect(await linesOf(plan.id)).toEqual([])
  })

  it('reads the lines into blocks for display, and prints a table it cannot read as typed', async () => {
    const plan = await newPlan(['| a | b |', '|---|---|', '| 1 | 2 | 3 |'].join('\n'))
    const res = await app.inject({ method: 'GET', url: `/api/plans/${plan.id}/blocks` })
    expect(res.statusCode, res.body).toBe(200)
    const blocks = bodyOf(res)['blocks'] as { kind: string; why?: string; lines: { text: string }[] }[]
    expect(blocks).toHaveLength(1)
    expect(blocks[0]!.kind).toBe('notUnderstood')
    expect(blocks[0]!.lines.map((line) => line.text)).toEqual(['| a | b |', '|---|---|', '| 1 | 2 | 3 |'])
  })
})

// ============================================================ filing a line as work

describe('filing a line as work', () => {
  it('creates the record and binds the line, and the reply names both', async () => {
    const plan = await newPlan(DOCUMENT)
    const line = plan.lines.find((l) => l.text === '- 数据采集')!
    const res = await app.inject({
      method: 'POST',
      url: `/api/plans/${plan.id}/lines/${line.id}/file-as-work`,
      payload: { kind: 'task', workspaceId: 'default' },
    })
    expect(res.statusCode, res.body).toBe(201)
    const filed = bodyOf(res)
    // The bullet is how the line is DRAWN, so it is not part of what the record is called.
    expect(filed['title']).toBe('数据采集')
    const stored = (await linesOf(plan.id)).find((l) => l.id === line.id)!
    expect(stored.recordId).toBe(filed['recordId'])
    expect(t.api.getRecord(filed['recordId'] as string)?.title).toBe('数据采集')
    // And the line still holds every character the person typed. Only the title lost the marker.
    expect(stored.text).toBe('- 数据采集')
  })

  it('leaves nothing behind when it refuses, because it is one transaction', async () => {
    const plan = await newPlan(DOCUMENT)
    const line = plan.lines.find((l) => l.text === '- 数据采集')!
    const before = countRows('records')
    const res = await app.inject({
      method: 'POST',
      url: `/api/plans/${plan.id}/lines/${line.id}/file-as-work`,
      // A project that does not exist. The record write refuses, and the line must not be bound to
      // a record that was never made — which is the half-filed line this route exists to prevent.
      payload: { kind: 'task', workspaceId: 'no-such-project' },
    })
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
    expect(countRows('records')).toBe(before)
    expect((await linesOf(plan.id)).find((l) => l.id === line.id)!.recordId).toBeNull()
  })

  it('refuses a kind a plan cannot give time to, and names the kinds it can', async () => {
    const plan = await newPlan(DOCUMENT)
    const line = plan.lines[0]!
    const res = await app.inject({
      method: 'POST',
      url: `/api/plans/${plan.id}/lines/${line.id}/file-as-work`,
      payload: { kind: 'note', workspaceId: 'default' },
    })
    expect(res.statusCode).toBe(400)
    expect(bodyOf(res)['error']).toContain('task')
    expect(countRows('records')).toBe(0)
  })

  it('refuses an empty line, because a record needs a title', async () => {
    const plan = await newPlan(DOCUMENT)
    const blank = plan.lines.find((l) => l.text === '')!
    const res = await app.inject({
      method: 'POST',
      url: `/api/plans/${plan.id}/lines/${blank.id}/file-as-work`,
      payload: { kind: 'task', workspaceId: 'default' },
    })
    expect(res.statusCode).toBe(400)
    expect(countRows('records')).toBe(0)
  })

  it('refuses to file the same line twice rather than making a second record for it', async () => {
    const plan = await newPlan(DOCUMENT)
    const line = plan.lines.find((l) => l.text === '- 数据采集')!
    const payload = { kind: 'task', workspaceId: 'default' }
    await app.inject({ method: 'POST', url: `/api/plans/${plan.id}/lines/${line.id}/file-as-work`, payload })
    const again = await app.inject({
      method: 'POST',
      url: `/api/plans/${plan.id}/lines/${line.id}/file-as-work`,
      payload,
    })
    expect(again.statusCode).toBe(409)
    expect(countRows('records')).toBe(1)
  })
})

// ============================================================ the marker is not part of the title

/**
 * A MARKER SAYS HOW A LINE IS DRAWN. IT IS NOT SOMETHING ANYBODY WROTE ABOUT THE WORK.
 *
 * Filing "- the gripper" used to make a record called "- the gripper", because the title was the
 * line's stored text trimmed and nothing else. The same reply's `under.text` had its marker off
 * already, so one answer about one line said both things at once.
 *
 * THIS WOULD FAIL SILENTLY. A record called "- the gripper" is a valid record with a valid title,
 * every page draws it, nothing refuses it, and the only symptom is a corpus of work whose names
 * carry punctuation from a document they are no longer attached to.
 *
 * The stripping is `blocksOf` and `outlineOf` — the parser the writing page and the table already
 * read — so these tests are also what stops a second stripper being written here. Each line kind
 * carries a different marker and each one gets its own case.
 */
describe('filing a line takes the marker off the title and leaves the line alone', () => {
  /** File one line of a one-line plan and answer with the whole reply. */
  async function fileOnly(body: string, payload: Json = { kind: 'task', workspaceId: 'default' }): Promise<Json> {
    const plan = await newPlan(body)
    const res = await app.inject({
      method: 'POST',
      url: `/api/plans/${plan.id}/lines/${plan.lines[0]!.id}/file-as-work`,
      payload,
    })
    return { ...bodyOf(res), statusCode: res.statusCode, planId: plan.id, lineId: plan.lines[0]!.id }
  }

  it('takes off a bullet, a heading mark, a number and a tick box, and keeps the words', async () => {
    for (const [written, called] of [
      ['- the gripper', 'the gripper'],
      ['* the wrist', 'the wrist'],
      ['# Robotics', 'Robotics'],
      ['##### levle5', 'levle5'],
      ['1. test with the pipeline', 'test with the pipeline'],
      ['  3. try the pipeline', 'try the pipeline'],
    ] as const) {
      const filed = await fileOnly(written)
      expect(filed['statusCode'], JSON.stringify(filed)).toBe(201)
      expect(filed['title'], `filing "${written}"`).toBe(called)
      expect(t.api.getRecord(filed['recordId'] as string)?.title).toBe(called)
      // The document is untouched: the marker is still in the line the person wrote.
      expect((await linesOf(filed['planId'] as string))[0]!.text).toBe(written)
    }
  })

  /**
   * THE TICK BOX, WHICH IS THE ONE WORTH ARGUING ABOUT.
   *
   * "- [x] fix the mount" becomes a record called "fix the mount". The box comes off for the same
   * reason the bullet does — it is how the line is drawn — and the tick is not written anywhere
   * else either. Whether the work is finished is the record's own state field. Copying the tick
   * into a state would put "is this done" in two places, and a person unticking the box in the
   * document would then leave a record that still says done, with nothing failing.
   */
  it('takes the box off a tick box and writes nothing at all from the tick', async () => {
    const unticked = await fileOnly('- [ ] fix the mount')
    expect(unticked['title']).toBe('fix the mount')

    const ticked = await fileOnly('- [x] check the torque')
    expect(ticked['title']).toBe('check the torque')
    // The record's state is the one the kind gives a new task, not a state read off the box.
    const record = t.api.getRecord(ticked['recordId'] as string)!
    expect((record.data as { state?: unknown }).state ?? null).not.toBe('done')
    // And the box is still in the document, exactly as typed.
    expect((await linesOf(ticked['planId'] as string))[0]!.text).toBe('- [x] check the torque')
  })

  it('leaves a line that is not an item exactly as typed, because nothing has read a marker off it', async () => {
    // Prose. `blocksOf` reads it as a paragraph, so there is no marker and the title is the words.
    const prose = await fileOnly('Maybe: gaze')
    expect(prose['title']).toBe('Maybe: gaze')
    // A bare box with no bullet in front of it is prose too — plandoc.ts only reads a box after a
    // bullet — so it keeps its brackets rather than being stripped by a rule the screen has not got.
    const bare = await fileOnly('[x] fix the mount')
    expect(bare['title'], 'the screen draws this as prose, so the title must match what it draws').toBe(
      '[x] fix the mount',
    )
  })

  it('refuses a line that is only a marker, naming which, and writes nothing', async () => {
    const before = countRows('records')
    for (const [written, said] of [
      ['- ', 'a bullet'],
      ['## ', 'a heading mark'],
      ['1. ', 'a number'],
      ['- [ ] ', 'a tick box'],
    ] as const) {
      const filed = await fileOnly(written)
      expect(filed['statusCode'], `filing "${written}"`).toBe(400)
      expect(String(filed['error']), `filing "${written}"`).toContain(said)
      expect(String(filed['error'])).toContain('no words after it')
    }
    // An empty line is a different sentence, because there is no marker to name.
    const empty = await fileOnly('   ')
    expect(empty['statusCode']).toBe(400)
    expect(String(empty['error'])).toContain('That line is empty')
    expect(countRows('records'), 'a refusal writes nothing').toBe(before)
  })

  it('says the same words in the title and in what the line is written under, in one reply', async () => {
    // THE DEFECT, EXACTLY. One reply used to carry "- replace the fingers" as the title of the new
    // record and "the gripper" as the item above it: two readings of two lines of one document, one
    // with the marker on and one with it off.
    const plan = await newPlan('# the gripper\n- replace the fingers')
    const outer = plan.lines[0]!
    const inner = plan.lines[1]!
    const parent = bodyOf(
      await app.inject({
        method: 'POST',
        url: `/api/plans/${plan.id}/lines/${outer.id}/file-as-work`,
        payload: { kind: 'task', workspaceId: 'default' },
      }),
    )
    const child = bodyOf(
      await app.inject({
        method: 'POST',
        url: `/api/plans/${plan.id}/lines/${inner.id}/file-as-work`,
        payload: { kind: 'task', workspaceId: 'default' },
      }),
    )

    expect(parent['title']).toBe('the gripper')
    expect(child['title']).toBe('replace the fingers')
    // The item above, named the same way the title was named — one parse, so they cannot differ.
    expect((child['under'] as { text: string }).text).toBe(parent['title'])
    expect((child['under'] as { recordId: string }).recordId).toBe(parent['recordId'])
    expect((child['under'] as { linkId: string | null }).linkId).not.toBeNull()
  })
})

// ============================================================ the words and the title drift apart

describe('the line\'s words and the record\'s title are two facts after filing', () => {
  it('shows both when they no longer agree, and repairs neither', async () => {
    const plan = await newPlan('- baseline')
    const line = plan.lines[0]!
    const filed = bodyOf(
      await app.inject({
        method: 'POST',
        url: `/api/plans/${plan.id}/lines/${line.id}/file-as-work`,
        payload: { kind: 'task', workspaceId: 'default' },
      }),
    )
    const recordId = filed['recordId'] as string

    // The record is renamed on the record side. Nothing about the plan changed.
    const renamed = await app.inject({
      method: 'PATCH',
      url: `/api/records/${recordId}`,
      headers: { 'x-mole-office-workspace': 'default' },
      payload: { title: 'Baseline experiment, whole' },
    })
    expect(renamed.statusCode, renamed.body).toBe(200)

    const res = await app.inject({ method: 'GET', url: `/api/plans/${plan.id}` })
    const rows = bodyOf(res)['lines'] as { line: { text: string }; work: { title: string } | null }[]
    expect(rows[0]!.line.text).toBe('- baseline')
    expect(rows[0]!.work?.title).toBe('Baseline experiment, whole')
  })

})

// ============================================================ giving a line time

describe('giving a line time', () => {
  async function planWithFiledLine(): Promise<{ planId: string; lineId: string; recordId: string }> {
    const plan = await newPlan('- baseline')
    const lineId = plan.lines[0]!.id
    const filed = bodyOf(
      await app.inject({
        method: 'POST',
        url: `/api/plans/${plan.id}/lines/${lineId}/file-as-work`,
        payload: { kind: 'task', workspaceId: 'default' },
      }),
    )
    return { planId: plan.id, lineId, recordId: filed['recordId'] as string }
  }

  it('writes one ordinary allocation, which records the line it came from', async () => {
    const { planId, lineId, recordId } = await planWithFiledLine()
    const res = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/lines/${lineId}/give-time`,
      payload: { horizon: 'week', period: '2026-W36', plannedHours: 4 },
    })
    expect(res.statusCode, res.body).toBe(201)
    const row = t.client.sqlite
      .prepare('SELECT record_id, planned_hours, from_plan_line FROM allocations')
      .get() as { record_id: string; planned_hours: number; from_plan_line: string | null }
    expect(row.record_id).toBe(recordId)
    expect(row.planned_hours).toBe(4)
    expect(row.from_plan_line).toBe(lineId)
  })

  it('refuses a line nobody has filed, because hours name a piece of work', async () => {
    const plan = await newPlan('- baseline')
    const res = await app.inject({
      method: 'POST',
      url: `/api/plans/${plan.id}/lines/${plan.lines[0]!.id}/give-time`,
      payload: { horizon: 'week', period: '2026-W36', plannedHours: 4 },
    })
    expect(res.statusCode).toBe(409)
    expect(bodyOf(res)['error']).toContain('File as work')
    expect(countRows('allocations')).toBe(0)
  })

  it('keeps the one-allocation-per-period rule rather than writing a second row', async () => {
    const { planId, lineId } = await planWithFiledLine()
    const payload = { horizon: 'week', period: '2026-W36', plannedHours: 4 }
    await app.inject({ method: 'POST', url: `/api/plans/${planId}/lines/${lineId}/give-time`, payload })
    const again = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/lines/${lineId}/give-time`,
      payload,
    })
    expect(again.statusCode).toBe(409)
    expect(countRows('allocations')).toBe(1)
  })

  it('stores no hours as no hours, which is not zero', async () => {
    const { planId, lineId } = await planWithFiledLine()
    const res = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/lines/${lineId}/give-time`,
      payload: { horizon: 'week', period: '2026-W36' },
    })
    expect(res.statusCode, res.body).toBe(201)
    const row = t.client.sqlite.prepare('SELECT planned_hours FROM allocations').get() as {
      planned_hours: number | null
    }
    expect(row.planned_hours).toBeNull()
  })
})

// ============================================================ writing the whole document

describe('saving the whole document', () => {
  it('leaves the plan holding exactly the lines sent, in the order sent', async () => {
    const plan = await newPlan('one\ntwo\nthree')
    const [first, , third] = plan.lines
    const res = await app.inject({
      method: 'PUT',
      url: `/api/plans/${plan.id}/lines`,
      payload: {
        lines: [{ id: third!.id, text: 'three' }, { text: 'new one' }, { id: first!.id, text: 'one' }],
        reason: 'the test reorders, adds and drops in one save',
      },
    })
    expect(res.statusCode, res.body).toBe(200)
    expect((await linesOf(plan.id)).map((l) => l.text)).toEqual(['three', 'new one', 'one'])
  })

  it('does not restamp a line nobody changed, so "written since you read this" stays true', async () => {
    const plan = await newPlan('one\ntwo')
    const [first, second] = plan.lines
    const before = t.client.sqlite
      .prepare('SELECT id, updated_at, updated_by FROM plan_lines WHERE id = ?')
      .get(first!.id) as { updated_at: string; updated_by: string }

    const res = await app.inject({
      method: 'PUT',
      url: `/api/plans/${plan.id}/lines`,
      payload: { lines: [{ id: first!.id, text: 'one' }, { id: second!.id, text: 'two, changed' }] },
      headers: { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code' },
    })
    expect(res.statusCode, res.body).toBe(200)

    const after = t.client.sqlite
      .prepare('SELECT updated_at, updated_by FROM plan_lines WHERE id = ?')
      .get(first!.id) as { updated_at: string; updated_by: string }
    expect(after.updated_by).toBe(before.updated_by)
    const changed = t.client.sqlite
      .prepare('SELECT updated_by FROM plan_lines WHERE id = ?')
      .get(second!.id) as { updated_by: string }
    expect(changed.updated_by).toBe('agent:claude-code')
  })

  it('keeps the record a line names when the line is sent back with its id', async () => {
    const plan = await newPlan('- baseline\n- gaze')
    const line = plan.lines[0]!
    const filed = bodyOf(
      await app.inject({
        method: 'POST',
        url: `/api/plans/${plan.id}/lines/${line.id}/file-as-work`,
        payload: { kind: 'task', workspaceId: 'default' },
      }),
    )
    await app.inject({
      method: 'PUT',
      url: `/api/plans/${plan.id}/lines`,
      payload: { lines: [{ id: line.id, text: '- baseline, rewritten' }], reason: 'the test drops the second line' },
    })
    const stored = await linesOf(plan.id)
    expect(stored).toHaveLength(1)
    expect(stored[0]!.recordId).toBe(filed['recordId'])
  })

  it('refuses a line id that is not in this plan, and saves nothing', async () => {
    const plan = await newPlan('one\ntwo')
    const res = await app.inject({
      method: 'PUT',
      url: `/api/plans/${plan.id}/lines`,
      payload: { lines: [{ id: 'not-a-line', text: 'one' }] },
    })
    expect(res.statusCode).toBe(404)
    expect((await linesOf(plan.id)).map((l) => l.text)).toEqual(['one', 'two'])
  })

  it('puts an added line between two others without moving the rest', async () => {
    const plan = await newPlan('one\ntwo')
    const res = await app.inject({
      method: 'POST',
      url: `/api/plans/${plan.id}/lines`,
      payload: { text: 'one and a half', afterLineId: plan.lines[0]!.id, reason: 'a line goes between two others' },
    })
    expect(res.statusCode, res.body).toBe(201)
    expect((await linesOf(plan.id)).map((l) => l.text)).toEqual(['one', 'one and a half', 'two'])
  })
})

// ============================================================ saving the document as one string

/**
 * SAVING THE WHOLE DOCUMENT AS ONE PIECE OF TEXT, WHICH IS WHAT THE WRITING PAGE DOES.
 *
 * A plan is written in one text box, so the page has no line ids to send. The server lines the
 * stored rows up against the new text by the exact characters of their WORDS — the line without its
 * trailing run of {key: value} groups — and keeps the row of every line whose words did not change,
 * with the record it was filed as.
 *
 * The three tests that carry the weight are the ends of that rule: a line that did not change KEEPS
 * its binding when other lines move around it, a line that is gone LOSES its binding and is
 * reported with the record itself untouched, and a line whose only change is what it says about its
 * own size, time or note keeps its binding, because those groups are fields the line carries rather
 * than what makes it the line it is. Anything in between would be a guess.
 */
describe('saving the document as one string', () => {
  /** Save a whole document and hand back the reply. */
  async function saveBody(id: string, body: string): Promise<Json> {
    const res = await app.inject({ method: 'PUT', url: `/api/plans/${id}/body`, payload: { body } })
    expect(res.statusCode, res.body).toBe(200)
    return bodyOf(res)
  }

  /** File one line of a plan as work and hand back the record's id. */
  async function fileAsWork(planId: string, lineId: string): Promise<string> {
    const filed = bodyOf(
      await app.inject({
        method: 'POST',
        url: `/api/plans/${planId}/lines/${lineId}/file-as-work`,
        payload: { kind: 'task', workspaceId: 'default' },
      }),
    )
    return filed['recordId'] as string
  }

  it('gives the document back character for character, blank lines and all', async () => {
    const plan = await newPlan()
    await saveBody(plan.id, DOCUMENT)
    expect((await linesOf(plan.id)).map((line) => line.text).join('\n')).toBe(DOCUMENT)
  })

  /**
   * THE SHAPE THE COLD REVIEWER TYPED: nesting by leading spaces, no bullet marker anywhere. The
   * build before this one turned four typed spaces into forty-six and the screen hid it.
   */
  it('keeps an outline nested with spaces at exactly the depths it was typed at', async () => {
    const outline = [
      'build a baseline',
      '  build the pipeline',
      '    perception',
      '    planning',
      '    control',
      '  implement one controller detail',
      '    tune gains',
      '    test saturation',
      '  prepare the experiment',
      '    change the gripper',
      '    reprint a mount',
      '    recalibrate',
    ].join('\n')
    const plan = await newPlan()
    await saveBody(plan.id, outline)
    const stored = (await linesOf(plan.id)).map((line) => line.text).join('\n')
    expect(stored.length).toBe(outline.length)
    expect(stored).toBe(outline)
  })

  it('does not restamp a line that only moved, because its words were not written', async () => {
    const plan = await newPlan('- baseline\n- gaze')
    const line = plan.lines[0]!
    const before = t.client.sqlite
      .prepare('SELECT updated_at, updated_by FROM plan_lines WHERE id = ?')
      .get(line.id) as { updated_at: string; updated_by: string }

    const res = await app.inject({
      method: 'PUT',
      url: `/api/plans/${plan.id}/body`,
      payload: { body: '# Perception\n- baseline\n- gaze' },
      headers: { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code' },
    })
    expect(res.statusCode, res.body).toBe(200)

    const after = t.client.sqlite
      .prepare('SELECT updated_at, updated_by FROM plan_lines WHERE id = ?')
      .get(line.id) as { updated_at: string; updated_by: string }
    expect(after.updated_by).toBe(before.updated_by)
    expect(after.updated_at).toBe(before.updated_at)
  })

  it('refuses a plan that is not there rather than making one', async () => {
    const res = await app.inject({ method: 'PUT', url: '/api/plans/no-such-plan/body', payload: { body: 'x' } })
    expect(res.statusCode).toBe(404)
  })

  /**
   * A DOCUMENT WRITTEN ON WINDOWS SURVIVES BEING OPENED AND SAVED AGAIN.
   *
   * It did not. A plan pasted in from a Windows file was stored with a carriage return on the end of
   * every line, and the writing box cannot give a carriage return back — the HTML standard says a
   * textarea normalises every line ending to a plain newline. So the next save arrived without them,
   * `matchLines` compared characters and matched nothing, and every record binding in the document
   * was dropped by one keystroke. Measured in a browser on a three-line plan with one line filed as
   * work: the binding was gone after the first character typed.
   *
   * THE FIX IS THAT A LINE ENDING IS NOT PART OF A LINE, so it is not stored in one. The words are
   * untouched, which is what the second test here holds on to.
   */
  describe('a document written on Windows', () => {
    const WINDOWS = '# Robotics\r\n- replace gripper\r\n- tune the gains\r\n'

    it('keeps every binding when the same document comes back from the writing box', async () => {
      const plan = await newPlan(WINDOWS)
      const stored = await linesOf(plan.id)
      const bound = stored[1]!
      const recordId = await fileAsWork(plan.id, bound.id)

      // WHAT THE WRITING BOX SENDS BACK: the same document, with one character typed on the last
      // line, and no carriage returns anywhere, because the box cannot produce one.
      const reply = await saveBody(plan.id, '# Robotics\n- replace gripper\n- tune the gains\nX')

      const after = await linesOf(plan.id)
      expect(after.map((line) => line.text)).toEqual(['# Robotics', '- replace gripper', '- tune the gains', 'X'])
      expect(after[1]!.id).toBe(bound.id)
      expect(after[1]!.recordId).toBe(recordId)
      expect(reply['removedBindings']).toEqual([])
      expect(reply['kept']).toBe(3)
    })

    it('stores every word, space and blank line as sent, and only the line endings differ', async () => {
      const plan = await newPlan('a  \r\n\r\n\tb\r\n')
      expect((await linesOf(plan.id)).map((line) => line.text)).toEqual(['a  ', '', '\tb', ''])
    })

    it('says a carriage return was read rather than doing it quietly', async () => {
      const made = await app.inject({
        method: 'POST',
        url: '/api/plans',
        payload: { title: 'From a Windows file', body: WINDOWS },
      })
      expect(bodyOf(made)['carriageReturns']).toBe(3)
      expect(bodyOf(made)['note']).toContain('3 line endings were written with a carriage return')

      const plan = (bodyOf(made)['plan'] as { id: string }).id
      const saved = await saveBody(plan, WINDOWS)
      expect(saved['carriageReturns']).toBe(3)
      expect(saved['note']).toContain('carriage return')
    })

    it('says nothing about carriage returns for a document that has none', async () => {
      const plan = await newPlan('one\ntwo')
      const reply = await saveBody(plan.id, 'one\ntwo\nthree')
      expect(reply['carriageReturns']).toBe(0)
      expect(reply['note']).not.toContain('carriage return')
    })
  })

  /**
   * ONE LINE IS ONE LINE, so the routes that write one refuse text holding a line ending.
   *
   * Storing one would put a line ending back inside a line's text through a quieter door, and the
   * whole document would be rewritten the next time anybody saved it — the same destruction the
   * tests above are about. Splitting it into several lines instead would be doing something other
   * than what was asked.
   */
  describe('a line holding a line ending', () => {
    it('is refused when a line is added, and nothing is stored', async () => {
      const plan = await newPlan('one')
      const res = await app.inject({
        method: 'POST',
        url: `/api/plans/${plan.id}/lines`,
        payload: { text: 'two\nthree', reason: 'the test is about the line ending, so it sends a reason' },
      })
      expect(res.statusCode, res.body).toBe(400)
      expect(res.body).toContain('a plan line is one line')
      expect((await linesOf(plan.id)).map((line) => line.text)).toEqual(['one'])
    })

    it('is refused when a line is changed, and the line is left as it was', async () => {
      const plan = await newPlan('one')
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/plans/${plan.id}/lines/${plan.lines[0]!.id}`,
        payload: { text: 'one\r\ntwo' },
      })
      expect(res.statusCode, res.body).toBe(400)
      expect((await linesOf(plan.id)).map((line) => line.text)).toEqual(['one'])
    })
  })
})

// ============================================================ what was written while you were away

describe('what was written since you read the plan', () => {
  it('says nobody has read it, rather than saying nothing changed', async () => {
    const plan = await newPlan('one')
    const res = await app.inject({ method: 'GET', url: `/api/plans/${plan.id}/since-read` })
    expect(bodyOf(res)['neverRead']).toBe(true)
    expect(bodyOf(res)['note']).toContain('not the same as nothing having changed')
  })

  it('reports what somebody else wrote and not what you wrote', async () => {
    const plan = await newPlan('one\ntwo')
    // A PERSON MARKS IT READ, and says so in the headers. Only a person may, and a request with no
    // actor headers is refused — the test below is the one that proves it.
    await app.inject({ method: 'POST', url: `/api/plans/${plan.id}/read`, headers: READER })

    await app.inject({
      method: 'PATCH',
      url: `/api/plans/${plan.id}/lines/${plan.lines[0]!.id}`,
      payload: { text: 'one, by an agent' },
      headers: { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code' },
    })
    await app.inject({
      method: 'PATCH',
      url: `/api/plans/${plan.id}/lines/${plan.lines[1]!.id}`,
      payload: { text: 'two, by me' },
    })

    const res = await app.inject({ method: 'GET', url: `/api/plans/${plan.id}/since-read` })
    const seen = bodyOf(res)
    expect((seen['written'] as { text: string }[]).map((l) => l.text)).toEqual(['one, by an agent'])
    expect(seen['writtenBy']).toEqual(['agent:claude-code'])
  })
})

// ====================================== only a person can say they have read a plan

/**
 * AN AGENT COULD ERASE THE BAND THAT SHOWED ITS OWN WRITING, WHICH IS THE WORST KIND OF DEFECT HERE.
 *
 * Marking a plan as read moves the moment `since-read` counts from, so it hides every line written
 * before now — including the lines the caller just wrote. This was measured through the API: an
 * agent wrote two lines, the plan said "2 lines written since you read this, by agent:nightly-bot",
 * the agent posted /read, and the plan then said 0. The lines were still there and nothing said so.
 *
 * "I have read this" is a claim about a person's eyes. These three tests are the rule for an agent
 * with no grant and for a person: an agent is refused, a request that names nobody is refused, and a
 * person is not. A secretary may mark a plan for the person under their grant, where this office's
 * list lets the grant press it, and the plan then says which secretary marked it. That part is
 * measured in a-plan-is-marked-read-under-the-grant.test.ts.
 */
describe('only a person can say they have read a plan', () => {
  /** Two lines written by an agent, with the plan already marked read by the person. */
  async function planWrittenToByAnAgent(): Promise<string> {
    const plan = await newPlan('alpha\nbeta')
    const marked = await app.inject({
      method: 'POST',
      url: `/api/plans/${plan.id}/read`,
      headers: READER,
    })
    expect(marked.statusCode, marked.body).toBe(200)
    const wrote = await app.inject({
      method: 'PUT',
      url: `/api/plans/${plan.id}/body`,
      payload: { body: 'alpha\nbeta\ngamma\ndelta' },
      headers: NIGHTLY_BOT,
    })
    expect(wrote.statusCode, wrote.body).toBe(200)
    return plan.id
  }

  /** How many lines the plan says were written since the person read it. */
  async function writtenSince(planId: string): Promise<number> {
    const res = await app.inject({ method: 'GET', url: `/api/plans/${planId}/since-read`, headers: READER })
    expect(res.statusCode, res.body).toBe(200)
    return (bodyOf(res)['written'] as unknown[]).length
  }

  it('refuses an agent, and the lines it wrote are still reported', async () => {
    const planId = await planWrittenToByAnAgent()
    expect(await writtenSince(planId)).toBe(2)

    const res = await app.inject({ method: 'POST', url: `/api/plans/${planId}/read`, headers: NIGHTLY_BOT })
    expect(res.statusCode, res.body).toBe(403)
    expect(res.body).toContain('Only a person can say they have read a plan')
    expect(res.body).toContain('nightly-bot')

    // THE POINT OF THE WHOLE TEST: the band still says what arrived.
    expect(await writtenSince(planId)).toBe(2)
  })

  it('refuses a request that sent no actor headers, because that is not evidence of a person', async () => {
    const planId = await planWrittenToByAnAgent()
    const res = await app.inject({ method: 'POST', url: `/api/plans/${planId}/read` })
    expect(res.statusCode, res.body).toBe(403)
    expect(res.body).toContain('no actor headers')
    expect(await writtenSince(planId)).toBe(2)
  })

  /**
   * The band is NOT asserted to be empty afterwards, and that is not laziness.
   *
   * A stamp here is a local wall-clock string counted in whole seconds, and `writtenSinceRead`
   * counts a line written AT or after the read moment — deliberately, so a line written in the same
   * second as the press is reported rather than lost. In a test everything happens in one second, so
   * the honest thing to check is that the write happened: the moment moved, and it says so.
   */
  it('lets a person do it, which is what the button in the browser sends', async () => {
    const planId = await planWrittenToByAnAgent()
    const res = await app.inject({ method: 'POST', url: `/api/plans/${planId}/read`, headers: READER })
    expect(res.statusCode, res.body).toBe(200)
    expect(bodyOf(res)['note']).toContain('Marked as read at')
    expect((bodyOf(res)['plan'] as { readAt: string | null }).readAt).not.toBeNull()
  })

  it('says so in the route\'s own declaration, so a caller reads the rule before sending', async () => {
    const surface = bodyOf(await app.inject({ method: 'GET', url: '/api' }))
    const routes = surface['endpoints'] as { method: string; path: string; description?: string }[]
    const one = routes.find((r) => r.method === 'POST' && r.path === '/api/plans/:id/read')
    expect(one, JSON.stringify(routes.map((r) => `${r.method} ${r.path}`))).toBeDefined()
    expect(one!.description).toContain('ONLY A PERSON MAY')
  })
})

// ============================================================ a plan can end, and can be removed

describe('a plan can end', () => {
  it('leaves the list when it is done, and the closed count says how many did', async () => {
    const open = await newPlan('one')
    const done = await newPlan('two')
    await app.inject({ method: 'PATCH', url: `/api/plans/${done.id}`, payload: { state: 'done' } })

    const list = bodyOf(await app.inject({ method: 'GET', url: '/api/plans?state=open' }))
    expect((list['plans'] as { plan: { id: string } }[]).map((p) => p.plan.id)).toEqual([open.id])
    expect(list['closed']).toBe(1)

    const every = bodyOf(await app.inject({ method: 'GET', url: '/api/plans?state=every' }))
    expect(every['plans']).toHaveLength(2)
  })

  it('counts the lines with no hours on any period, which is what a card says', async () => {
    const plan = await newPlan('- baseline\n- gaze')
    const filed = bodyOf(
      await app.inject({
        method: 'POST',
        url: `/api/plans/${plan.id}/lines/${plan.lines[0]!.id}/file-as-work`,
        payload: { kind: 'task', workspaceId: 'default' },
      }),
    )
    expect(filed['recordId']).toBeDefined()
    await app.inject({
      method: 'POST',
      url: `/api/plans/${plan.id}/lines/${plan.lines[0]!.id}/give-time`,
      payload: { horizon: 'week', period: '2026-W36', plannedHours: 4 },
    })
    const list = bodyOf(await app.inject({ method: 'GET', url: '/api/plans' }))
    const summary = (list['plans'] as { withNoTimeOnAnyPeriod: number; filedAsWork: number; lines: number }[])[0]!
    expect(summary.lines).toBe(2)
    expect(summary.filedAsWork).toBe(1)
    expect(summary.withNoTimeOnAnyPeriod).toBe(1)
  })

})

// ============================================================ writing a plan is not project truth

describe('writing a plan changes nothing canonical', () => {
  it('writes no record, no link and no change row', async () => {
    const changesBefore = countRows('changes')
    const plan = await newPlan(DOCUMENT)
    await app.inject({
      method: 'PUT',
      url: `/api/plans/${plan.id}/lines`,
      payload: { lines: [{ text: 'a whole new document' }], reason: 'the test replaces the whole document' },
    })
    await app.inject({ method: 'PATCH', url: `/api/plans/${plan.id}`, payload: { title: 'Renamed' } })
    expect(countRows('records')).toBe(0)
    expect(countRows('links')).toBe(0)
    expect(countRows('changes')).toBe(changesBefore)
  })

  it('says what every one of its routes is for, in GET /api', async () => {
    const index = bodyOf(await app.inject({ method: 'GET', url: '/api' }))
    const endpoints = index['endpoints'] as { method: string; path: string; description: string | null }[]
    const plans = endpoints.filter((e) => e.path.startsWith('/api/plans'))
    expect(plans.length).toBeGreaterThan(10)
    for (const endpoint of plans) {
      expect(endpoint.description, `${endpoint.method} ${endpoint.path} says nothing`).toBeTruthy()
    }
  })
})

// ============================================================ pointing a line at work that exists

/**
 * A LINE CAN NAME WORK THAT IS ALREADY THERE, which is two things at once.
 *
 * It is the repair for the one thing editing a plan destroys. Saving a document matches stored rows
 * to the new text by their exact characters, so changing the words of a filed line deletes its row
 * and the binding with it — and that happens on an autosave, 600ms after a keystroke. Until this
 * route there was no way to put the binding back.
 *
 * It is also the point of it: a plan line should be able to name canonical work rather than always
 * making new work, so that two plans mentioning one task mean the same task.
 */
describe('pointing a line at work that already exists', () => {
  /** File one record straight into a project, through the route a person uses. */
  async function fileRecord(
    kind: string,
    title: string,
    data: Record<string, unknown> = {},
    workspaceId = 'default',
  ): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { 'x-mole-office-workspace': workspaceId, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
      payload: { kind, title, data },
    })
    expect(res.statusCode, res.body).toBe(201)
    return (bodyOf(res)['record'] as { id: string }).id
  }

  /** Point a line at a record. The reply is handed back whatever it says. */
  async function point(
    planId: string,
    lineId: string,
    payload: Record<string, unknown>,
  ): Promise<Awaited<ReturnType<typeof app.inject>>> {
    return await app.inject({ method: 'PATCH', url: `/api/plans/${planId}/lines/${lineId}`, payload })
  }

  /**
   * WHAT THIS TEST IS ABOUT CHANGED ON 17 AUGUST 2026, AND THE CLAIM DID NOT.
   *
   * It used to lose the binding by editing the words of a filed line, because that is what a save
   * did then. The owner reversed that rule, so the loss is now caused the way a loss really happens:
   * two bound lines rewritten in the same place, where Mole Office cannot say which is which and refuses
   * to guess. The claim held down here is the same one it always was — a line can be pointed back at
   * work that already exists, and doing it creates nothing.
   */
  it('refuses a record id nothing has, and writes nothing', async () => {
    const plan = await newPlan('- baseline')
    const res = await point(plan.id, plan.lines[0]!.id, { recordId: 'nosuchrecord' })
    expect(res.statusCode).toBe(404)
    expect(bodyOf(res)['error']).toContain('nosuchrecord')
    expect((await linesOf(plan.id))[0]!.recordId).toBeNull()
  })

  it('refuses a kind a plan cannot give time to, and names the kinds it can', async () => {
    const plan = await newPlan('- baseline')
    const note = await fileRecord('note', 'A note about the baseline', { body: 'x' })
    const res = await point(plan.id, plan.lines[0]!.id, { recordId: note })
    expect(res.statusCode).toBe(400)
    expect(bodyOf(res)['error']).toContain('task')
    expect((await linesOf(plan.id))[0]!.recordId).toBeNull()
  })

  it('refuses a record that has been deleted', async () => {
    const plan = await newPlan('- baseline')
    const task = await fileRecord('task', 'Run the baseline')
    const gone = await app.inject({
      method: 'DELETE',
      url: `/api/records/${task}`,
      headers: { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
    })
    expect(gone.statusCode, gone.body).toBe(200)

    const res = await point(plan.id, plan.lines[0]!.id, { recordId: task })
    expect(res.statusCode).toBe(400)
    expect(bodyOf(res)['error']).toContain('deleted')
    expect((await linesOf(plan.id))[0]!.recordId).toBeNull()
  })

  it('refuses a line that already points somewhere, names it, and moves it when told to', async () => {
    const plan = await newPlan('- baseline')
    const first = await fileRecord('task', 'Run the baseline')
    const second = await fileRecord('task', 'Run the ablation')
    expect((await point(plan.id, plan.lines[0]!.id, { recordId: first })).statusCode).toBe(200)

    const refused = await point(plan.id, plan.lines[0]!.id, { recordId: second })
    expect(refused.statusCode).toBe(409)
    // It names what the line points at, because that is what the caller is about to drop.
    expect(bodyOf(refused)['error']).toContain(first)
    expect(bodyOf(refused)['error']).toContain('Run the baseline')
    expect((await linesOf(plan.id))[0]!.recordId).toBe(first)

    const meant = await point(plan.id, plan.lines[0]!.id, { recordId: second, replacing: first })
    expect(meant.statusCode, meant.body).toBe(200)
    expect((await linesOf(plan.id))[0]!.recordId).toBe(second)
    expect(bodyOf(meant)['was']).toBe(first)
    // The record it stopped pointing at is untouched. It was never this plan's to remove.
    expect(t.api.getRecord(first)?.title).toBe('Run the baseline')
  })

  it('refuses `replacing` that names a record the line does not point at', async () => {
    const plan = await newPlan('- baseline')
    const first = await fileRecord('task', 'Run the baseline')
    const second = await fileRecord('task', 'Run the ablation')
    expect((await point(plan.id, plan.lines[0]!.id, { recordId: first })).statusCode).toBe(200)

    const res = await point(plan.id, plan.lines[0]!.id, { recordId: second, replacing: 'someoneelse' })
    expect(res.statusCode).toBe(409)
    expect(bodyOf(res)['error']).toContain(first)
    expect((await linesOf(plan.id))[0]!.recordId).toBe(first)
  })

  it('says nothing was written when the line already points there, and does not restamp it', async () => {
    const plan = await newPlan('- baseline')
    const task = await fileRecord('task', 'Run the baseline')
    expect((await point(plan.id, plan.lines[0]!.id, { recordId: task })).statusCode).toBe(200)
    const stamped = t.client.sqlite
      .prepare('SELECT updated_at, updated_by FROM plan_lines WHERE id = ?')
      .get(plan.lines[0]!.id) as { updated_at: string; updated_by: string }

    // SENT BY SOMEBODY ELSE, which is the only way to see the difference. A stamp here is a local
    // wall-clock string counted in whole seconds, so a restamp inside the same second writes the
    // same `updated_at`; a restamp by a different writer changes `updated_by` and cannot hide.
    const again = await app.inject({
      method: 'PATCH',
      url: `/api/plans/${plan.id}/lines/${plan.lines[0]!.id}`,
      payload: { recordId: task },
      headers: { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code' },
    })
    expect(again.statusCode, again.body).toBe(200)
    const note = bodyOf(again)['note'] as string
    expect(note).toContain('NOTHING WAS WRITTEN')
    expect(bodyOf(again)['was']).toBe(task)
    const after = t.client.sqlite
      .prepare('SELECT updated_at, updated_by FROM plan_lines WHERE id = ?')
      .get(plan.lines[0]!.id) as { updated_at: string; updated_by: string }
    expect(after).toEqual(stamped)
  })

  it('refuses one request that changes the words and the binding at once', async () => {
    const plan = await newPlan('- baseline')
    const task = await fileRecord('task', 'Run the baseline')
    const res = await point(plan.id, plan.lines[0]!.id, { recordId: task, text: '- baseline, whole' })
    expect(res.statusCode).toBe(400)
    const stored = (await linesOf(plan.id))[0]!
    expect(stored.recordId).toBeNull()
    expect(stored.text).toBe('- baseline')
  })

  it('refuses `replacing` on its own, because it says nothing on its own', async () => {
    const plan = await newPlan('- baseline')
    const res = await point(plan.id, plan.lines[0]!.id, { replacing: 'anything' })
    expect(res.statusCode).toBe(400)
  })
})

// ============================================================ filing a line keeps its place

/**
 * FILING A LINE KEEPS THE PLACE THE PLAN ALREADY GAVE IT.
 *
 * The person writes their breakdown as headings and nested bullets, so the plan already says what
 * is part of what. Filing a line reads that tree — the same one the writing page draws — and writes
 * one `part_of` link to the item above, when that item is already work.
 *
 * The two tests that carry the weight are the two halves of the rule: the parent is the item ABOVE
 * IN THE TREE and not the previous filed line, and an item above that nobody filed produces NO LINK
 * and no invented parent.
 */
describe('filing a line as work keeps the place the plan gave it', () => {
  /** File one line of a plan as work, and hand back the whole reply. */
  async function file(
    planId: string,
    lineId: string,
    workspaceId = 'default',
  ): Promise<{ status: number; body: Json }> {
    const res = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/lines/${lineId}/file-as-work`,
      payload: { kind: 'task', workspaceId },
    })
    return { status: res.statusCode, body: bodyOf(res) }
  }

  type Under = { text: string | null; recordId: string | null; linkId: string | null; why: string | null }

  /** Every stored link, as the three columns that say what it joins. */
  function storedLinks(): { from_id: string; to_id: string; type: string }[] {
    return t.client.sqlite.prepare('SELECT from_id, to_id, type FROM links').all() as {
      from_id: string
      to_id: string
      type: string
    }[]
  }

  it('makes the new record part of the item it is written under', async () => {
    const plan = await newPlan('# Robotics\n## Tray clamp')
    const top = await file(plan.id, plan.lines[0]!.id)
    expect(top.status, JSON.stringify(top.body)).toBe(201)
    // Nothing is written above the first line, so it was not made part of anything.
    const nothingAbove = top.body['under'] as Under
    expect(nothingAbove.text).toBeNull()
    expect(nothingAbove.linkId).toBeNull()
    expect(nothingAbove.why).toContain('Nothing is written above this line')
    expect(storedLinks()).toHaveLength(0)

    const child = await file(plan.id, plan.lines[1]!.id)
    expect(child.status, JSON.stringify(child.body)).toBe(201)
    const under = child.body['under'] as Under
    expect(under.text).toBe('Robotics')
    expect(under.recordId).toBe(top.body['recordId'])
    expect(under.why).toBeNull()
    expect(storedLinks()).toEqual([
      { from_id: child.body['recordId'], to_id: top.body['recordId'], type: 'part_of' },
    ])
    expect(under.linkId).toBeTruthy()
    // And the reply says it out loud, because a caller cannot see a link it did not ask for.
    // IT SAYS IT IN `detail` NOW. The reply says what happened at two lengths: `note` is the one or
    // two plain sentences a person reads after pressing the button, and `detail` is the whole
    // account, with the ids and the links in it, for a developer view and for a caller like this one.
    expect(child.body['detail']).toContain('part of')
  })

  /**
   * THE ONE THAT SEPARATES A TREE FROM A LIST. `## Object` is written after `## Tray clamp`, so the
   * previous filed line is Tray clamp — but the document says Object is part of Robotics. A parent
   * taken from "the last line somebody filed" passes every other test in this file and fails here.
   */
  it('takes the parent from the tree and not from the line above', async () => {
    const plan = await newPlan('# Robotics\n## Tray clamp\n## Object')
    const top = await file(plan.id, plan.lines[0]!.id)
    const gripper = await file(plan.id, plan.lines[1]!.id)
    const object = await file(plan.id, plan.lines[2]!.id)
    expect(object.status, JSON.stringify(object.body)).toBe(201)
    expect((object.body['under'] as Under).recordId).toBe(top.body['recordId'])
    // Two links, both pointing at Robotics. Order is not asserted: rows come back in the order
    // SQLite holds them, which is by primary key and says nothing about which was written first.
    expect(storedLinks()).toHaveLength(2)
    expect(storedLinks()).toContainEqual({
      from_id: gripper.body['recordId'],
      to_id: top.body['recordId'],
      type: 'part_of',
    })
    expect(storedLinks()).toContainEqual({
      from_id: object.body['recordId'],
      to_id: top.body['recordId'],
      type: 'part_of',
    })
  })

  it('follows a bullet nested under a heading, at the depth the person typed', async () => {
    const plan = await newPlan('# Robotics\n## Tray clamp\n- replace the gripper')
    await file(plan.id, plan.lines[0]!.id)
    const gripper = await file(plan.id, plan.lines[1]!.id)
    const bullet = await file(plan.id, plan.lines[2]!.id)
    expect(bullet.status, JSON.stringify(bullet.body)).toBe(201)
    const under = bullet.body['under'] as Under
    expect(under.text).toBe('Tray clamp')
    expect(under.recordId).toBe(gripper.body['recordId'])
  })

  it('writes no link and invents no parent when the item above is not filed as work', async () => {
    const plan = await newPlan('# Robotics\n## Tray clamp\n- replace the gripper')
    // Only the bullet is filed. Neither heading above it is work, and Mole Office does not walk further
    // up looking for one: "part of the heading two levels above" is not what the document says.
    const bullet = await file(plan.id, plan.lines[2]!.id)
    expect(bullet.status, JSON.stringify(bullet.body)).toBe(201)
    const under = bullet.body['under'] as Under
    expect(under.text).toBe('Tray clamp')
    expect(under.recordId).toBeNull()
    expect(under.linkId).toBeNull()
    expect(under.why).toContain('nobody has filed that as work')
    expect(storedLinks()).toHaveLength(0)
    // `detail`, for the reason above: the whole account of where the line landed is the developer's
    // half of the reply, and `note` is what the person reads.
    expect(bullet.body['detail']).toContain('NO "part of" link was written')
  })

  /**
   * A PARAGRAPH UNDER A HEADING IS NOT AT THE TOP OF THE DOCUMENT, and the reply must not say it
   * is. Prose is the writing between the items rather than an item, so the tree does not place it —
   * which is a different fact from "nothing is written above this line", and the sentence a person
   * reads has to be the true one.
   */
  it('says the plan does not place a line of prose, rather than that nothing is above it', async () => {
    const plan = await newPlan('# Robotics\nthe gripper keeps dropping the cube')
    await file(plan.id, plan.lines[0]!.id)
    const prose = await file(plan.id, plan.lines[1]!.id)
    expect(prose.status, JSON.stringify(prose.body)).toBe(201)
    const under = prose.body['under'] as Under
    expect(under.text).toBeNull()
    expect(under.linkId).toBeNull()
    expect(under.why).toContain('not a heading, a bullet, a tick box or a numbered item')
    expect(under.why).not.toContain('Nothing is written above')
    expect(storedLinks()).toHaveLength(0)
  })

  /**
   * ABSENCE BEATS A GUESS, and this is the test that says so. `# Robotics` is work and `## Tray clamp`
   * is not, so the bullet under Tray clamp has no filed parent — and Mole Office does not reach past the
   * unfiled heading to the filed one above it. That would file a link nobody asked for, saying the
   * document contains something it does not.
   */
  it('does not reach past an unfiled item to a filed one further up', async () => {
    const plan = await newPlan('# Robotics\n## Tray clamp\n- replace the gripper')
    const top = await file(plan.id, plan.lines[0]!.id)
    expect(top.status, JSON.stringify(top.body)).toBe(201)

    const bullet = await file(plan.id, plan.lines[2]!.id)
    expect(bullet.status, JSON.stringify(bullet.body)).toBe(201)
    const under = bullet.body['under'] as Under
    expect(under.text).toBe('Tray clamp')
    expect(under.recordId).toBeNull()
    expect(under.linkId).toBeNull()
    expect(storedLinks()).toHaveLength(0)
  })

  it('links nothing to an item whose record has been deleted, and says that is why', async () => {
    const plan = await newPlan('# Robotics\n## Tray clamp')
    const top = await file(plan.id, plan.lines[0]!.id)
    const gone = await app.inject({
      method: 'DELETE',
      url: `/api/records/${top.body['recordId'] as string}`,
      headers: { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
    })
    expect(gone.statusCode, gone.body).toBe(200)

    const child = await file(plan.id, plan.lines[1]!.id)
    expect(child.status, JSON.stringify(child.body)).toBe(201)
    const under = child.body['under'] as Under
    expect(under.recordId).toBe(top.body['recordId'])
    expect(under.linkId).toBeNull()
    expect(under.why).toContain('deleted')
    expect(storedLinks()).toHaveLength(0)
  })

  /**
   * A record id in a refusal has to be one a person can go and look at.
   *
   * Twelve characters with a capital or a digit in them, which is what nanoid writes here. An
   * English word of exactly twelve letters does not match, so a sentence of prose yields nothing.
   */
  function idsIn(text: string): string[] {
    return (text.match(/[A-Za-z0-9_-]+/g) ?? []).filter((word) => word.length === 12 && /[A-Z0-9]/.test(word))
  }

  /**
   * TWO STATED FACTS THAT CONTRADICT EACH OTHER, so nothing is written and the refusal names both.
   *
   * The last assertion is the one that decides where the refusal has to live. A link cannot join
   * two projects, so `createLink` would refuse this anyway — but it refuses INSIDE the transaction,
   * naming the new record, which the rollback then takes away. The caller would be told to go and
   * move a record that does not exist. So the check runs before anything is written.
   */
  it('refuses to file under an item filed in another project, and writes nothing at all', async () => {
    const made = await app.inject({
      method: 'POST',
      url: '/api/workspaces',
      payload: { id: 'robotics', title: 'Robotics' },
    })
    expect(made.statusCode, made.body).toBe(201)

    const plan = await newPlan('# Robotics\n## Tray clamp')
    const top = await file(plan.id, plan.lines[0]!.id, 'robotics')
    expect(top.status, JSON.stringify(top.body)).toBe(201)

    const records = countRows('records')
    const changes = countRows('changes')
    const child = await file(plan.id, plan.lines[1]!.id, 'default')
    expect(child.status).toBe(409)
    const refusal = child.body['error'] as string
    expect(refusal).toContain('robotics')
    expect(refusal).toContain('default')
    expect(refusal).toContain(top.body['recordId'] as string)
    // One transaction, and it never began: no record, no link, no change row, no binding.
    expect(countRows('records')).toBe(records)
    expect(countRows('changes')).toBe(changes)
    expect(storedLinks()).toHaveLength(0)
    expect((await linesOf(plan.id))[1]!.recordId).toBeNull()

    const live = new Set(
      (t.client.sqlite.prepare('SELECT id FROM records').all() as { id: string }[]).map((row) => row.id),
    )
    expect(
      idsIn(refusal).filter((id) => !live.has(id)),
      'the refusal names a record that does not exist, so a person following it has nothing to look at',
    ).toEqual([])
  })
})
