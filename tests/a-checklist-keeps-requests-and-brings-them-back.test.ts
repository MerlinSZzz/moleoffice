// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
/**
 * A CHECKLIST KEEPS REQUESTS, REFUSES A "DONE" WITHOUT EVIDENCE, AND BRINGS OPEN ITEMS BACK.
 *
 * Part 1 of a decision on proposal XEFZwmSBw8xQ: the store, the doors, and the office bringing open
 * items back. Six rules are proved here,
 * each by chapter 5's three runs in the round 46 report:
 *
 *   1. "done" needs evidence: a commit, a report, a manual section or a run;
 *   2. an item that must be in the manual is done only with a manual section that is really there;
 *   3. a read returns the caller's own checklists unless another owner, or everyone, is named;
 *   4. an item's reminder is off until its owner switches it on, and it fires to that owner alone;
 *   5. the brief an agent reads after a compaction names its open items, and the waiting ones by words;
 *   6. an item has one of two styles, plain or evidence-or-words, chosen by the agent that creates it; an item
 *      created with no style is stored plain, and an item stored before styles existed keeps working and reads plain.
 *
 * Also held: the general record doors refuse the kind, the owner is never taken from a body, the
 * 07:00 and 18:00 report reminder carries the secretary's open items in one line, and the idle
 * reminder carries an idle agent's.
 *
 * ROUND 46b, THE IDLE REMINDER'S LINE. The check of round 46 (nYBznnvm2QdW) found that removing the
 * open-items sentence from `theIdleReminder` in src/server/lib/reminders.ts left every test green.
 * The last case below is the test for it. CONTROL: 19 passed. MUTATION: `theIdleReminder` returned
 * its text without the sentence; that case alone went red (1 failed, 18 passed). RESTORE: 19 passed.
 *
 * EVERY REFUSAL IS CHECKED FOR WHAT IT WROTE, by reading the checklist's version back.
 *
 * A NEW SECRETARY HAS ONE OPEN ITEM (wave 13s, round 77). The
 * office gives a new secretary one item, to read its handbook, on a checklist it makes for it. So the secretary
 * "clerk" is no longer an agent with no checklist. The two cases that need one now ask "newcomer", a worker,
 * where they asked "clerk". The back-door case counted 0 checklist records and now counts 1, the secretary's.
 * The ?owner=everyone case named three owners and now names the secretary too. The secretary's 07:00 reminder
 * counted 2 open items and now counts 3, the third being the handbook item.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { localStamp } from '../src/shared/time.ts'

let t: TestDb
let app: FastifyInstance
let reminders: typeof import('../src/server/lib/reminders.ts')

const asPerson = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
const asAgent = (handle: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

const idOf: Record<string, string> = {}

/** The real clock, once, so every made-up moment is measured from the operator's day. */
const R0 = new Date()
function at(days: number, hours: number, minutes: number): Date {
  return new Date(R0.getFullYear(), R0.getMonth(), R0.getDate() + days, hours, minutes, 0, 0)
}

/** One tick of the office's reminder watcher at `now`. */
function tick(now: Date): ReturnType<typeof reminders.sendTheRemindersThatAreDue> {
  return reminders.sendTheRemindersThatAreDue('default', now, new Date(now.getTime() - 86_400_000))
}

async function call(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT',
  url: string,
  headers: Record<string, string>,
  payload?: unknown,
): Promise<{ status: number; body: Record<string, any> }> {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  return { status: r.statusCode, body: JSON.parse(r.body) as Record<string, any> }
}

/** A message from the person to one agent, so an item can name the message it came in. */
function aMessageTo(handle: string, body: string): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'message',
    title: 'a request',
    data: { body, to: [{ kind: 'agent', id: idOf[handle]! }], sentBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id } },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
  }).id
}

/** A report with one block, b-1, to stand as a manual section and as report evidence. */
function aReport(title: string): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'report',
    title,
    data: { blocks: [{ id: 'b-1', type: 'text', text: 'A made-up section for this test.' }] },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
  }).id
}

/** The office lines sent to one participant id that say a checklist item is due. */
function dueLinesTo(id: string): { to: { id: string }[]; saidInFull?: string; body: string }[] {
  return (
    t.client.sqlite
      .prepare(
        "SELECT data FROM records WHERE kind = 'message' AND deleted_at IS NULL " +
          "AND json_extract(data, '$.sentBy.id') = (SELECT id FROM agents WHERE handle = 'mole-office' AND retired = 0) AND data LIKE '%A checklist item is due%'",
      )
      .all() as { data: string }[]
  )
    .map((one) => JSON.parse(one.data) as { to: { id: string }[]; saidInFull?: string; body: string })
    .filter((line) => line.to.some((to) => to.id === id))
}

function everyDueLine(): number {
  return (
    t.client.sqlite
      .prepare("SELECT count(*) AS n FROM records WHERE kind = 'message' AND data LIKE '%A checklist item is due%'")
      .get() as { n: number }
  ).n
}

async function versionOf(id: string): Promise<string> {
  const r = await call('GET', `/api/checklists/${id}`, asAgent('quill'))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body['checklist'].version as string
}

beforeAll(async () => {
  process.env.MOLE_OFFICE_BROADCAST_TIMES = '07:00,18:00'
  process.env.MOLE_OFFICE_BROADCAST_LEAD_MINUTES = '30'
  process.env.MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE = ''
  t = await freshDb()
  reminders = await import('../src/server/lib/reminders.ts')
  app = (await apiApp()).app
  await app.ready()
  for (const [handle, role] of [
    ['quill', 'worker'],
    ['lark', 'worker'],
    ['clerk', 'secretary'],
    // AN AGENT WITH NO CHECKLIST. A new secretary is given one, for its handbook item, so a worker stands here.
    ['newcomer', 'worker'],
  ] as const) {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asPerson, payload: { handle, name: handle, role } })
    expect(r.statusCode, r.body).toBe(201)
    idOf[handle] = (r.json() as { agent: { id: string } }).agent.id
  }
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

// ============================================================ only its own doors, and its owner is the caller

describe('a checklist is written through its own doors, and its owner is whoever made it', () => {
  it('refuses POST /api/records for the kind, to the person too, and names the doors', async () => {
    const r = await call('POST', '/api/records', asPerson, { kind: 'checklist', title: 'By the back door', data: { items: [] } })
    expect(r.status, JSON.stringify(r.body)).toBe(403)
    expect(`${r.body['error']} ${r.body['detail'] ?? ''}`).toContain('POST /api/checklists')
    // THE ONE CHECKLIST THERE IS, the one the office made for the secretary's handbook item. The back door added none.
    expect((t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'checklist'").get() as { n: number }).n).toBe(1)
  })

  it('writes the caller as the owner, and refuses an owner in the body', async () => {
    const refused = await call('POST', '/api/checklists', asAgent('quill'), { title: 'Not mine', owner: { kind: 'agent', id: idOf['lark'] } })
    expect(refused.status, JSON.stringify(refused.body)).toBe(403)
    expect(refused.body['error']).toContain('Nothing was written.')
    const made = await call('POST', '/api/checklists', asPerson, { title: "The person's own list" })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    expect(made.body['checklist'].owner).toEqual({ kind: 'person', id: THE_TEST_OFFICES_OWNER.id })
  })
})

// ============================================================ rule 1: "done" needs evidence

describe('rule 1: an item is done only with evidence', () => {
  let list = ''
  beforeAll(async () => {
    const made = await call('POST', '/api/checklists', asAgent('quill'), { title: '10/10 robotics experiment' })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    list = made.body['checklist'].id as string
  })

  it('refuses a new item that is "done" with no evidence, in words, and writes nothing', async () => {
    const before = await versionOf(list)
    const r = await call('POST', `/api/checklists/${list}/items`, asAgent('quill'), { words: 'Run the grasp ten times.', state: 'done' })
    expect(r.status, JSON.stringify(r.body)).toBe(400)
    expect(r.body['error']).toContain('is "done" with no evidence')
    expect(await versionOf(list)).toBe(before)
  })

  it('refuses a change to "done" with no evidence, and takes it with a commit', async () => {
    const added = await call('POST', `/api/checklists/${list}/items`, asAgent('quill'), {
      words: 'Run the grasp ten times.',
      fromMessage: aMessageTo('quill', 'Run the grasp ten times.'),
    })
    expect(added.status, JSON.stringify(added.body)).toBe(201)
    const item = added.body['item'].id as string
    expect(added.body['item'].state).toBe('open')
    const before = await versionOf(list)
    const refused = await call('PATCH', `/api/checklists/${list}/items/${item}`, asAgent('lark'), { state: 'done' })
    expect(refused.status, JSON.stringify(refused.body)).toBe(400)
    expect(refused.body['error']).toContain('is "done" with no evidence')
    expect(await versionOf(list)).toBe(before)
    const done = await call('PATCH', `/api/checklists/${list}/items/${item}`, asAgent('lark'), {
      state: 'done',
      addEvidence: [{ kind: 'commit', commit: '9c0612d44' }],
    })
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    expect(done.body['item'].state).toBe('done')
  })

  it('refuses report evidence that names a record of another kind', async () => {
    const note = t.api.createRecord({
      workspaceId: 'default',
      kind: 'note',
      title: 'Not a report',
      data: { body: 'A made-up note for this test.' },
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
    }).id
    const r = await call('POST', `/api/checklists/${list}/items`, asAgent('quill'), {
      words: 'Write it up.',
      state: 'done',
      evidence: [{ kind: 'report', record: note }],
    })
    expect(r.status, JSON.stringify(r.body)).toBe(400)
    expect(r.body['error']).toContain('not a report')
  })
})

// ============================================================ rule 2: a manual item needs its section

describe('rule 2: an item that must be in the manual is done only with a manual section that is there', () => {
  let list = ''
  let item = ''
  let manual = ''
  beforeAll(async () => {
    const made = await call('POST', '/api/checklists', asAgent('quill'), {
      title: 'Camera',
      items: [{ words: 'Put the camera calibration in my manual.', mustBeInManual: true }],
    })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    list = made.body['checklist'].id as string
    item = made.body['checklist'].items[0].id as string
    manual = aReport("Jory's manual")
  })

  it('refuses "done" with only a commit, in words that say a manual section is missing', async () => {
    const before = await versionOf(list)
    const r = await call('PATCH', `/api/checklists/${list}/items/${item}`, asAgent('quill'), {
      state: 'done',
      evidence: [{ kind: 'commit', commit: 'abcdef1' }],
    })
    expect(r.status, JSON.stringify(r.body)).toBe(400)
    expect(r.body['error']).toContain('must be in the manual, and its evidence has no manual section')
    expect(await versionOf(list)).toBe(before)
  })

  it('refuses a manual section whose block the record does not hold', async () => {
    const r = await call('PATCH', `/api/checklists/${list}/items/${item}`, asAgent('quill'), {
      state: 'done',
      evidence: [{ kind: 'manual section', record: manual, block: 'b-9' }],
    })
    expect(r.status, JSON.stringify(r.body)).toBe(400)
    expect(r.body['error']).toContain('holds no block with id "b-9"')
  })

  it('takes "done" once the manual section is linked', async () => {
    const r = await call('PATCH', `/api/checklists/${list}/items/${item}`, asAgent('quill'), {
      state: 'done',
      evidence: [{ kind: 'manual section', record: manual, block: 'b-1' }],
    })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body['item'].state).toBe('done')
  })
})

// ============================================================ rule 6: an item's style

describe('rule 6: an item has one of two styles, and an item with none is stored plain', () => {
  let list = ''
  beforeAll(async () => {
    const made = await call('POST', '/api/checklists', asAgent('quill'), {
      title: 'The styles',
      items: [
        { words: 'Tick me as I am', style: 'plain' },
        { words: 'Glaze the second batch', style: 'evidence-or-words' },
        { words: 'Nothing chosen for me' },
      ],
    })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    list = made.body['checklist'].id as string
  })

  it('keeps the style the creator chose on both creation paths, and an item with none is stored plain', async () => {
    const read = await call('GET', `/api/checklists/${list}`, asAgent('quill'))
    const styles = (read.body['checklist'].items as { words: string; style?: string }[]).map((one) => [one.words, one.style])
    expect(styles).toEqual([
      ['Tick me as I am', 'plain'],
      ['Glaze the second batch', 'evidence-or-words'],
      ['Nothing chosen for me', 'plain'],
    ])
    const added = await call('POST', `/api/checklists/${list}/items`, asAgent('quill'), { words: 'Added without a style' })
    expect(added.status, JSON.stringify(added.body)).toBe(201)
    expect(added.body['item'].style).toBe('plain')
    const chosen = await call('POST', `/api/checklists/${list}/items`, asAgent('quill'), { words: 'Added as the special style', style: 'evidence-or-words' })
    expect(chosen.status, JSON.stringify(chosen.body)).toBe(201)
    expect(chosen.body['item'].style).toBe('evidence-or-words')
  })

  it('refuses a style that is not one of the two, on both creation paths, writing nothing', async () => {
    const before = await versionOf(list)
    const onOne = await call('POST', `/api/checklists/${list}/items`, asAgent('quill'), { words: 'A fancy item', style: 'fancy' })
    expect(onOne.status, JSON.stringify(onOne.body)).toBe(400)
    expect(String(onOne.body['error'])).toContain('plain')
    expect(String(onOne.body['error'])).toContain('evidence-or-words')
    const onMake = await call('POST', '/api/checklists', asAgent('quill'), { title: 'Not made', items: [{ words: 'A fancy item', style: 'fancy' }] })
    expect(onMake.status, JSON.stringify(onMake.body)).toBe(400)
    expect(await versionOf(list), 'both refusals write nothing').toBe(before)
    expect((t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'checklist' AND title = 'Not made'").get() as { n: number }).n).toBe(0)
  })

  it('reads an item stored with no style as plain, and keeps every rule it had', async () => {
    const added = await call('POST', `/api/checklists/${list}/items`, asAgent('quill'), { words: 'From before the styles' })
    expect(added.status, JSON.stringify(added.body)).toBe(201)
    const id = added.body['item'].id as string
    // AN ITEM WRITTEN BEFORE STYLES EXISTED, made here by taking the key out of the stored row.
    const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(list) as { data: string }
    const data = JSON.parse(row.data) as { items: Record<string, unknown>[] }
    for (const one of data.items) if (one['id'] === id) delete one['style']
    t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), list)

    const read = await call('GET', `/api/checklists/${list}`, asAgent('quill'))
    const legacy = (read.body['checklist'].items as { id: string; style?: string }[]).find((one) => one.id === id)
    expect(legacy?.style, 'the stored row is what it was').toBeUndefined()
    // ITS RULES ARE THE SAME RULES: an agent's "done" still needs evidence, and an ordinary change still writes.
    const refused = await call('PATCH', `/api/checklists/${list}/items/${id}`, asAgent('lark'), { state: 'done' })
    expect(refused.status, JSON.stringify(refused.body)).toBe(400)
    expect(String(refused.body['error'])).toContain('is "done" with no evidence')
    const changed = await call('PATCH', `/api/checklists/${list}/items/${id}`, asAgent('quill'), { words: 'From before the styles, still open' })
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)
    expect(changed.body['item'].style, 'no style is invented onto an old row').toBeUndefined()
  })

  it('refuses a style in a change to an item: the creating agent chooses it, once', async () => {
    const before = await versionOf(list)
    const changed = await call('PATCH', `/api/checklists/${list}/items/i-1`, asAgent('quill'), { style: 'evidence-or-words' })
    expect(changed.status, JSON.stringify(changed.body)).toBe(400)
    expect(await versionOf(list), 'a refused style change writes nothing').toBe(before)
  })
})

// ============================================================ rule 3: own lists by default

describe("rule 3: a read returns the caller's own checklists unless another owner is named", () => {
  let plumbs = ''
  beforeAll(async () => {
    const made = await call('POST', '/api/checklists', asAgent('lark'), {
      title: "Lark's list",
      items: [{ words: 'Is the GPU free by 04:10?', state: 'waiting on the owner' }],
    })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    plumbs = made.body['checklist'].id as string
  })

  it("gives an agent only its own checklists, and says how to ask for others", async () => {
    const r = await call('GET', '/api/checklists', asAgent('quill'))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const owners = (r.body['checklists'] as { owner: { id: string } }[]).map((one) => one.owner.id)
    expect(owners.length).toBeGreaterThan(0)
    expect(new Set(owners)).toEqual(new Set([idOf['quill']]))
    expect(r.body['says']).toContain('?owner=everyone')
  })

  it("gives the tool maintainer's when that agent is named, and every owner's for ?owner=everyone, waiting first", async () => {
    const theirs = await call('GET', `/api/checklists?owner=agent:lark`, asAgent('quill'))
    expect(theirs.status, JSON.stringify(theirs.body)).toBe(200)
    expect((theirs.body['checklists'] as { id: string }[]).map((one) => one.id)).toEqual([plumbs])
    const all = await call('GET', '/api/checklists?owner=everyone', asAgent('quill'))
    const ids = (all.body['checklists'] as { id: string; owner: { id: string } }[]).map((one) => one.owner.id)
    expect(new Set(ids)).toEqual(new Set([idOf['quill'], idOf['lark'], idOf['clerk'], THE_TEST_OFFICES_OWNER.id]))
    expect(all.body['checklists'][0].id).toBe(plumbs)
  })

  it('says in words that a caller with none has none', async () => {
    const r = await call('GET', '/api/checklists', asAgent('newcomer'))
    expect(r.body['checklists']).toEqual([])
    expect(r.body['says']).toContain('There are no checklists here')
  })
})

// ============================================================ rule 4: the reminder

describe('rule 4: the reminder is off until its owner switches it on, and fires to its owner alone', () => {
  let list = ''
  let item = ''
  const when = at(2, 9, 0)
  beforeAll(async () => {
    const made = await call('POST', '/api/checklists', asAgent('quill'), { title: 'Handbacks' })
    list = made.body['checklist'].id as string
    // ADDED BY SOMEBODY ELSE, so "to its owner alone" is asked of a list two agents wrote in.
    const added = await call('POST', `/api/checklists/${list}/items`, asAgent('lark'), { words: 'Check the T2b handback.' })
    expect(added.status, JSON.stringify(added.body)).toBe(201)
    item = added.body['item'].id as string
  })

  it('has no reminder on a new item, and a tick long after sends nothing', async () => {
    const r = await call('GET', `/api/checklists/${list}`, asAgent('quill'))
    expect(r.body['checklist'].items[0].reminder).toBeUndefined()
    const before = everyDueLine()
    expect(tick(at(30, 12, 0)).checklistItemsReminded).toEqual([])
    expect(everyDueLine()).toBe(before)
  })

  it('refuses the switch to anybody but the owner, and writes nothing', async () => {
    const before = await versionOf(list)
    const r = await call('PUT', `/api/checklists/${list}/items/${item}/reminder`, asAgent('lark'), { on: true, at: localStamp(when) })
    expect(r.status, JSON.stringify(r.body)).toBe(403)
    expect(r.body['error']).toContain('Only the owner')
    expect(await versionOf(list)).toBe(before)
  })

  it('fires once, at its time, to the owner and to nobody else', async () => {
    const on = await call('PUT', `/api/checklists/${list}/items/${item}/reminder`, asAgent('quill'), { on: true, at: localStamp(when) })
    expect(on.status, JSON.stringify(on.body)).toBe(200)
    expect(on.body['item'].reminder.switchedOnBy).toEqual({ kind: 'agent', id: idOf['quill'] })
    expect(tick(new Date(when.getTime() - 60_000)).checklistItemsReminded).toEqual([])
    expect(tick(new Date(when.getTime() + 30_000)).checklistItemsReminded).toEqual([`${list}/${item}`])
    expect(tick(new Date(when.getTime() + 90_000)).checklistItemsReminded).toEqual([])
    const lines = dueLinesTo(idOf['quill']!)
    expect(lines).toHaveLength(1)
    expect(lines[0]!.to).toEqual([{ kind: 'agent', id: idOf['quill'] }])
    expect(lines[0]!.saidInFull ?? lines[0]!.body).toContain('Check the T2b handback.')
    expect(dueLinesTo(idOf['lark']!)).toEqual([])
    const after = await call('GET', `/api/checklists/${list}`, asAgent('quill'))
    expect(after.body['checklist'].items[0].reminder.firedAt).toBe(localStamp(new Date(when.getTime() + 30_000)))
  })

  it('refuses a body that writes a reminder past the switch', async () => {
    const r = await call('PATCH', `/api/checklists/${list}/items/${item}`, asAgent('quill'), {
      reminder: { at: localStamp(when), switchedOnBy: { kind: 'agent', id: idOf['lark'] } },
    })
    expect(r.status, JSON.stringify(r.body)).toBe(403)
  })
})

// ============================================================ rule 5: the brief, and the report reminder

describe('rule 5: the brief after a compaction names the open items, and the report reminder does too', () => {
  it("names the tool maintainer's open count and the waiting item by its words in the brief's opening", async () => {
    const r = await call('GET', '/api/brief', asAgent('lark'))
    expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBe(200)
    const head = r.body['head'] as string
    expect(head).toContain('Your checklists have 1 open item.')
    expect(head).toContain('1 is waiting on the owner: "Is the GPU free by 04:10?"')
  })

  it('says nothing about checklists to an agent with no open item', async () => {
    const r = await call('GET', '/api/brief', asAgent('newcomer'))
    expect(r.body['head'] as string).not.toContain('Your checklists')
  })

  it("puts the secretary's open items on the 06:30 report reminder, in one line", async () => {
    const made = await call('POST', '/api/checklists', asAgent('clerk'), {
      title: "The secretary's requests",
      items: [{ words: 'Answer the coordinator about the release.', state: 'waiting on the owner' }, { words: 'File the morning report.' }],
    })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    expect(tick(at(1, 6, 31)).broadcastsReminded).toContain(idOf['clerk'])
    const slot = localStamp(at(1, 7, 0)).slice(0, 16)
    const line = t.client.sqlite
      .prepare(
        "SELECT data FROM records WHERE kind = 'message' AND json_extract(data, '$.sentBy.id') = (SELECT id FROM agents WHERE handle = 'mole-office' AND retired = 0) " +
          "AND json_extract(data, '$.to[0].id') = ? AND json_extract(data, '$.extra.broadcastSlot') = ?",
      )
      .get(idOf['clerk'], slot) as { data: string } | undefined
    expect(line).toBeDefined()
    const said = JSON.parse(line!.data) as { saidInFull?: string; body: string }
    expect(said.saidInFull ?? said.body).toContain(
      // THREE: the two above and the handbook item the office gave the secretary when it started.
      'Your checklists have 3 open items. 1 is waiting on the owner: "Answer the coordinator about the release". Read them with GET /api/checklists.',
    )
  })

  it("puts an idle agent's open items on its idle reminder, in the same sentence", async () => {
    const started = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: asPerson,
      payload: { handle: 'idler', name: 'idler', role: 'worker' },
    })
    expect(started.statusCode, started.body).toBe(201)
    idOf['idler'] = (started.json() as { agent: { id: string } }).agent.id
    const made = await call('POST', '/api/checklists', asAgent('idler'), {
      title: "The idler's requests",
      items: [{ words: 'Read the loquat logs.', state: 'waiting on the owner' }, { words: 'Tidy the scratch folder.' }],
    })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    // WORK ARRIVES NOW, and then nothing for two hours: past the idle hour, in a spell the watcher saw start.
    aMessageTo('idler', 'Please read the loquat logs.')
    expect(tick(new Date(Date.now() + 2 * 3_600_000)).idleReminded).toContain('idler')
    const lines = (
      t.client.sqlite
        .prepare(
          "SELECT data FROM records WHERE kind = 'message' AND json_extract(data, '$.sentBy.id') = (SELECT id FROM agents WHERE handle = 'mole-office' AND retired = 0) " +
            "AND json_extract(data, '$.to[0].id') = ? AND json_extract(data, '$.body') = 'Idle — your role and duties'",
        )
        .all(idOf['idler']) as { data: string }[]
    ).map((one) => JSON.parse(one.data) as { saidInFull?: string; body: string })
    expect(lines).toHaveLength(1)
    expect(lines[0]!.saidInFull ?? '').toContain(
      'Your checklists have 2 open items. 1 is waiting on the owner: "Read the loquat logs". Read them with GET /api/checklists.',
    )
  })
})
