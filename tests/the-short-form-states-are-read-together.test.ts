// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The set reader uses the same short-form state rules as reading each record separately. */
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PanelRecord } from '../src/shared/types.ts'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let zoom: typeof import('../src/server/lib/zoom.ts')
const records: PanelRecord[] = []
const names: string[] = []
const part = { id: 'p-1', heading: 'A part', text30: 'Brief words.', text120: 'Longer words.', covers: ['b-1'] }

type State = { rung: string; state: string }
type SetReader = (records: readonly PanelRecord[]) => Map<string, State[]>
function make(name: string, mode: 'none' | 'current' | 'outdated' | 'missing' | 'hash' | 'short' | 'whole'): void {
  const kind = mode === 'short' ? 'note' : mode === 'whole' ? 'session' : 'report'
  const data = mode === 'short' ? { body: 'tiny' } : mode === 'whole'
    ? { state: 'running', doing: 'before', extra: { roundChapters: { text: 'Held once in the ledger.' } } }
    : { blocks: [{ id: 'b-1', type: 'text', text: 'A report with enough words for the summary. '.repeat(40) }] }
  const made = t.api.createRecord({ workspaceId: 'default', kind, title: name, data, actor: t.api.HUMAN })
  if (mode === 'whole') t.api.patchRecord(made.id, { dataPatch: { doing: 'after' } }, t.api.HUMAN)
  const row = t.client.sqlite.prepare('SELECT seq, content_hash AS contentHash, parts FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1').get(made.id) as { seq: number; contentHash: string; parts: string | null }
  if (mode === 'whole') expect(row.parts).toContain('roundChapters')
  if (!['none', 'short'].includes(mode)) {
    const madeFrom = mode === 'missing' ? { seq: row.seq + 99, contentHash: row.contentHash } : mode === 'hash' ? { seq: row.seq, contentHash: 'a-different-hash' } : { seq: row.seq, contentHash: row.contentHash }
    const shortForms = { label: { text: 'A short label', madeFrom, writtenBy: 'agent' }, parts: { madeFrom, writtenBy: 'agent', parts: [part] } }
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.shortForms', json(?)) WHERE id = ?").run(JSON.stringify(shortForms), made.id)
    if (mode === 'outdated') t.api.patchRecord(made.id, { title: `${name} changed` }, t.api.HUMAN)
  }
  records.push(t.api.getRecord(made.id)!)
  names.push(mode)
}

beforeAll(async () => {
  t = await freshDb()
  zoom = await import('../src/server/lib/zoom.ts')
  for (const mode of ['none', 'short', 'current', 'outdated', 'missing', 'hash', 'whole'] as const) make(`Record ${mode}`, mode)
}, 60_000)
afterAll(() => t?.close())

it('matches every label and by-part state, including an earlier stored whole part', () => {
  const read = (zoom as unknown as { theShortFormStatesOf: SetReader }).theShortFormStatesOf
  const together = read(records)
  const states = new Set<string>()
  for (const [index, record] of records.entries()) {
    const separate = zoom.readShortForms(record.id, record.workspaceId).levels
      .filter((one) => ['label', 'outline', 'sketch', 'digest'].includes(one.rung))
      .map(({ rung, state }) => ({ rung, state }))
    expect(together.get(record.id), names[index]).toEqual(separate)
    separate.forEach((one) => states.add(one.state))
  }
  expect([...states].sort()).toEqual(['cannot_check', 'cannot_write', 'current', 'none', 'out_of_date'])
})
