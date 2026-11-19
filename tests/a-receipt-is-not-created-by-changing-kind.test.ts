// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Receipt kind changes are exercised on a throwaway database, with made-up receipt facts. */
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { KIND_SPECS } from '../src/shared/kinds.ts'
import type { RecordKind } from '../src/shared/types.ts'

let office: TestDb
beforeEach(async () => { office = await freshDb() })
afterEach(() => office.close())
const receiptKind = 'whole_suite_receipt' as RecordKind
const image = () => createHash('sha256').update(office.client.sqlite.serialize()).digest('base64')

it('refuses turning another record into a receipt and writes nothing', () => {
  const note = office.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Made-up empty note', data: {}, actor: office.api.HUMAN })
  const before = image()
  let refusal: unknown
  try { office.api.patchRecord(note.id, { kind: receiptKind }, office.api.HUMAN) } catch (error) { refusal = error }
  expect(refusal).toMatchObject({ status: 409, code: 'receiptNeedsOriginalRun' })
  expect(office.api.getRecord(note.id)?.kind).toBe('note')
  expect(image()).toBe(before)
})

it('lets a receipt change out of the kind while preserving its observed facts', () => {
  const receipt = office.api.createRecord({ workspaceId: 'default', kind: receiptKind, title: 'Made-up receipt fixture', data: KIND_SPECS[receiptKind].example, actor: office.api.HUMAN })
  const changed = office.api.patchRecord(receipt.id, { kind: 'note' }, office.api.HUMAN)
  expect(changed.record.kind).toBe('note')
  const extra = changed.record.data.extra as Record<string, unknown>
  for (const [key, value] of Object.entries(receipt.data)) expect(key in changed.record.data ? changed.record.data[key] : extra[key]).toEqual(value)
})
