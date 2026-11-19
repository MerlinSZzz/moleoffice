// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LIST OF ATTACHMENTS GIVES EACH RUN THE VIEW ITS WHOLE RECORD GIVES. Wave 13y round 133.
 *
 * `listAttachments` reads only some of each run's data, the fields `attachmentOf` reads, because the page about who
 * is working asks it twice for every run of the project. So two places say which fields an attachment reads: that
 * list and `attachmentOf` itself. If `attachmentOf` came to read a field the list leaves out, the list would answer
 * that field as never recorded, and nothing else would fail.
 *
 * THE FIELDS ARE FOUND BY WATCHING, not copied from the list: `attachmentOf` is given a data that notes each field it
 * is asked for, and then again with every noted field filled, until no new field is asked for. A run that holds each
 * of them is written, one open and one closed, and the list's view of each must be its view from the whole record.
 * Every value is made up.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CLOSED_HOW } from '../src/shared/lifecycle.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'

const PROJECT = 'default'
const AGENT = 'made-up-agent-id'

let t: TestDb
let attachments: typeof import('../src/server/lib/attachments.ts')
/** Every data field `attachmentOf` asked for while it was watched. */
let asked: string[] = []

/** A made-up value for each field asked for: the shapes `attachmentOf` reads, and a text for any other field. */
function aValueFor(field: string, closed: boolean): unknown {
  if (field === 'ranAs') return [{ workspaceId: PROJECT, agentId: AGENT }]
  if (field === 'closedHow') return closed ? CLOSED_HOW[0] : undefined
  if (field === attachments.theFieldTheOpenRuleReads()) return closed ? '2026-11-04 10:05:00' : undefined
  return `made-up ${field}`
}

function dataOf(fields: readonly string[], closed: boolean): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field, aValueFor(field, closed)]).filter(([, value]) => value !== undefined))
}

/** The fields `attachmentOf` asks a run's data for, given a data that holds `held` as `dataOf` fills them. */
function theFieldsAskedFor(held: readonly string[], closed: boolean): Set<string> {
  const noted = new Set<string>()
  const filled = dataOf(held, closed)
  const data = new Proxy(filled, {
    get(target, field) {
      if (typeof field === 'string') noted.add(field)
      return Reflect.get(target, field)
    },
    has(target, field) {
      if (typeof field === 'string') noted.add(field)
      return Reflect.has(target, field)
    },
  })
  const record = { id: 'watched-run', workspaceId: PROJECT, kind: 'session', title: 'A watched run', createdAt: '2026-11-04 10:00:00', updatedAt: '2026-11-04 10:00:00', data }
  attachments.attachmentOf(record as unknown as PanelRecord)
  return noted
}

function writeARun(id: string, closed: boolean): void {
  t.client.sqlite
    .prepare(`INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) VALUES (?, ?, ?, ?, ?, 'session', ?, ?, 'authored')`)
    .run(id, PROJECT, THE_TEST_OFFICES_OWNER.id, '2026-11-04 10:00:00', '2026-11-04 10:00:00', `A made-up run, ${closed ? 'closed' : 'open'}`, JSON.stringify(dataOf(asked, closed)))
}

beforeAll(async () => {
  t = await freshDb()
  attachments = await import('../src/server/lib/attachments.ts')
  for (const closed of [false, true]) {
    let held: string[] = []
    for (;;) {
      const more = [...new Set([...held, ...theFieldsAskedFor(held, closed)])].sort()
      if (more.length === held.length) break
      held = more
    }
    asked = [...new Set([...asked, ...held])].sort()
  }
  writeARun('made-up-open-run', false)
  writeARun('made-up-closed-run', true)
})

afterAll(() => {
  t?.close()
})

describe('the list of attachments', () => {
  it('1: watches attachmentOf ask for the fields a run says about its agent and its close', () => {
    expect(asked).toEqual(expect.arrayContaining(['ranAs', 'closedHow', attachments.theFieldTheOpenRuleReads(), 'machine']))
  })

  it('2: gives an open and a closed run, each holding every field asked for, the view its whole record gives', () => {
    const listed = attachments.listAttachments({ workspaceId: PROJECT })
    for (const id of ['made-up-open-run', 'made-up-closed-run']) {
      const whole = t.api.getRecord(id)
      expect(whole, id).not.toBeNull()
      expect(listed.find((one) => one.id === id), id).toEqual(attachments.attachmentOf(whole!))
    }
    expect(listed.find((one) => one.id === 'made-up-open-run')?.open).toBe(true)
    expect(listed.find((one) => one.id === 'made-up-closed-run')?.closedHow).toBe(CLOSED_HOW[0])
  })

  it('3: gives the open run the same view when only open runs are asked for', () => {
    const open = attachments.listAttachments({ workspaceId: PROJECT, openOnly: true })
    expect(open.map((one) => one.id)).toEqual(['made-up-open-run'])
    expect(open[0]).toEqual(attachments.attachmentOf(t.api.getRecord('made-up-open-run')!))
  })
})
