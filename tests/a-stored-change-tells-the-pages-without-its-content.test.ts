// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STORED CHANGE TELLS THE OPEN PAGES, AND CARRIES NOTHING THE RECORD HOLDS. Item 87 of wave 13y, round 145, on
 * Plan ZBKFq0BuMsAc: "a 'record changed' event with id, kind and project and no content".
 *
 * An open page that shows a record reads it again when the server says `record.changed`
 * (src/server/lib/record-changes.ts). These cases open a page on the server's channel, write through the record
 * functions every door calls, and read what the page was sent:
 *
 * 1. each stored revision is one `record.changed`, carrying the record's id, kind and project and no other key;
 * 2. a link made, and a link taken away, is one `record.changed` for each end;
 * 3. a message is never announced so, because some readers may not see it, even to a page on the message centre,
 *    where every message is filed;
 * 4. a page in another project hears nothing;
 * 5. a write that is rolled back announces nothing;
 * 6. a page that connects just after changes is told how many of each event reached it, by name (round 146).
 *
 * Case names name the source mutation tried against each assertion. The browser side, a page reading again, is
 * tests/an-open-page-follows-changes-to-what-it-shows.test.ts.
 */
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { MESSAGE_CENTRE } from '../src/shared/workspaces.ts'

const HERE = 'default'
const AS_THE_OWNER = { type: 'human', id: THE_PERSON } as const

let t: TestDb
let events: typeof import('../src/server/lib/events.ts')
let here: { said: Record<string, unknown>[]; id: number }
let elsewhere: { said: Record<string, unknown>[]; id: number }

function openAPage(workspaceId: string): { said: Record<string, unknown>[]; id: number } {
  const said: Record<string, unknown>[] = []
  const id = events.pageOpened({
    workspaceId,
    who: { kind: 'person', id: THE_PERSON },
    send: (one) => said.push(one.event as unknown as Record<string, unknown>),
  })
  return { said, id }
}

/** The `record.changed` events this page was sent about this record. */
function changesOf(page: { said: Record<string, unknown>[] }, recordId: string): Record<string, unknown>[] {
  return page.said.filter((one) => one['name'] === 'record.changed' && one['recordId'] === recordId)
}

function aReport(title: string): string {
  return t.api.createRecord({
    kind: 'report',
    title,
    workspaceId: HERE,
    data: { for: 'The owner', date: '2026-11-07', blocks: [{ id: 'b-1', type: 'text', text: 'Made up.' }] },
    actor: AS_THE_OWNER as never,
  }).id
}

class Refused extends Error {}

beforeAll(async () => {
  t = await freshDb()
  events = await import('../src/server/lib/events.ts')
}, 60_000)

afterAll(() => {
  t.close()
})

beforeEach(() => {
  events.forgetTheChannel()
  here = openAPage(HERE)
  elsewhere = openAPage('another-project')
})

afterEach(() => {
  events.pageClosed(here.id)
  events.pageClosed(elsewhere.id)
})

it('a record made and then changed is announced once for each revision, with its id, kind and project and nothing else: without the call in saveRevision no page is told, and an event carrying the title tells every page what the record says', () => {
  const id = aReport('A report about the kiln')
  t.api.updateRecord(id, { title: 'A report about the kiln, changed' }, AS_THE_OWNER as never)
  const heard = changesOf(here, id)
  expect(heard).toEqual([
    { name: 'record.changed', workspaceId: HERE, recordId: id, kind: 'report', what: 'revision' },
    { name: 'record.changed', workspaceId: HERE, recordId: id, kind: 'report', what: 'revision' },
  ])
  expect(Object.keys(heard[0] ?? {}).sort()).toEqual(['kind', 'name', 'recordId', 'what', 'workspaceId'])
  expect(JSON.stringify(here.said)).not.toContain('A report about the kiln')
})

it('a link made and a link taken away are announced once for each end: without the calls in createLink and deleteLink a page showing either end is not told', () => {
  const from = aReport('The firing log')
  const to = aReport('The glaze list')
  here.said.length = 0
  const made = t.api.createLink({ fromId: from, toId: to, actor: AS_THE_OWNER as never })
  const afterMade = [...changesOf(here, from), ...changesOf(here, to)].map((one) => `${String(one['recordId'])} ${String(one['what'])}`)
  expect(afterMade).toEqual([`${from} link`, `${to} link`])
  here.said.length = 0
  t.api.deleteLink(made.id, AS_THE_OWNER as never, HERE)
  const afterTaken = [...changesOf(here, from), ...changesOf(here, to)].map((one) => `${String(one['recordId'])} ${String(one['what'])}`)
  expect(afterTaken).toEqual([`${from} link`, `${to} link`])
})

it('a message is not announced as a changed record, even to a page on the message centre where it is kept: without the message test in aRecordChanged that page is told that a message exists', () => {
  const centre = openAPage(MESSAGE_CENTRE)
  try {
    t.api.createRecord({
      kind: 'agent',
      title: 'Kiln agent',
      workspaceId: HERE,
      data: { handle: 'kiln-agent', runtime: 'claude-code', state: 'active' },
      actor: AS_THE_OWNER as never,
    })
    const message = t.api.createRecord({
      kind: 'message',
      title: 'Is the kiln free?',
      workspaceId: HERE,
      data: { body: 'Is the kiln free on Tuesday?', to: [{ kind: 'agent', id: 'kiln-agent' }] },
      actor: AS_THE_OWNER as never,
    })
    // A MESSAGE IS FILED IN THE MESSAGE CENTRE, not in the project it was written in, so only a page there could hear it.
    expect(message.workspaceId).toBe(MESSAGE_CENTRE)
    expect(changesOf(centre, message.id)).toEqual([])
    expect(changesOf(here, message.id)).toEqual([])
  } finally {
    events.pageClosed(centre.id)
  }
})

it('a page open on another project hears nothing of this one: an event sent without its project reaches every page', () => {
  const id = aReport('A report only this project sees')
  expect(changesOf(here, id)).toHaveLength(1)
  expect(elsewhere.said.filter((one) => one['name'] === 'record.changed')).toEqual([])
})

it('a write that is rolled back announces nothing: announcing at the call, before the commit, tells the pages of a change that was never stored', () => {
  const id = aReport('A report changed in a write that is refused')
  here.said.length = 0
  expect(() =>
    t.client.sqlite.transaction(() => {
      t.api.updateRecord(id, { title: 'A title that is never stored' }, AS_THE_OWNER as never)
      throw new Refused('The test refuses this write after the record was changed.')
    })(),
  ).toThrow(Refused)
  expect(changesOf(here, id)).toEqual([])
})

it("a page that connects just after changes is told how many of each reached it, by name: without the count by name in reachedAPageBeforeItWasCounted, a page that missed only record changes reads every list again", () => {
  const id = aReport('A report changed while a page connected')
  t.api.updateRecord(id, { title: 'A report changed while a page connected, again' }, AS_THE_OWNER as never)
  events.announce({ name: 'list.changed', workspaceId: HERE, lists: ['groups'], about: null, groupId: null, because: 'A made-up group changed while a page connected.' })
  const who = { kind: 'person', id: THE_PERSON } as const
  const late = events.pageOpened({ workspaceId: HERE, who, send: () => undefined, tag: 'a-page-that-connected-late' })
  try {
    expect(events.reachedAPageBeforeItWasCounted('a-page-that-connected-late', who, 60_000)).toEqual({
      reached: 3,
      byName: { 'record.changed': 2, 'list.changed': 1 },
    })
  } finally {
    events.pageClosed(late)
  }
})
